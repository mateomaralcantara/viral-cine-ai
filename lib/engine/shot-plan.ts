import { randomUUID } from 'node:crypto';
import type { Character, FilmPlan, FilmScene, FilmShot } from '@/lib/domain/schemas';

const SHOT_SECONDS = 8;
const PREFLIGHT_VERSION = 1;
const MAX_FEATURED_CHARACTERS = 2;

const shotDirections = [
  {
    description: 'Plano general continuo que establece con claridad el lugar y las posiciones.',
    camera: 'Travelling lateral suave y continuo en plano general, sin cortes ni cambios de escala.'
  },
  {
    description: 'Plano medio continuo de una sola accion principal.',
    camera: 'Dolly-in lento y estable en plano medio, sin cortes.'
  },
  {
    description: 'Primer plano emocional continuo con microexpresiones naturales.',
    camera: 'Camara fija con respiracion humana sutil en primer plano, sin cortes.'
  },
  {
    description: 'Plano detalle narrativo continuo de una reaccion u objeto relevante.',
    camera: 'Acercamiento lento y estable sobre un unico detalle, sin cortes.'
  },
  {
    description: 'Contraplano continuo que conserva el eje de mirada.',
    camera: 'Paneo corto y estable que conserva el eje, sin cortes ni transformaciones.'
  },
  {
    description: 'Plano de transicion continuo con profundidad y movimiento ambiental.',
    camera: 'Travelling frontal lento y continuo, sin cortes ni cambios bruscos de escala.'
  }
] as const;

export function ensurePlanShots(plan: FilmPlan): FilmPlan {
  for (const scene of plan.scenes) ensureSceneShots(scene, plan);
  return plan;
}

export function ensureSceneShots(scene: FilmScene, plan?: FilmPlan) {
  const currentDuration = scene.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
  if (scene.shots.length > 0 && currentDuration === scene.durationSeconds) {
    scene.shots.forEach((shot, index) => prepareShot(plan, scene, shot, index));
    return scene.shots;
  }

  const shotCount = Math.max(1, Math.ceil(scene.durationSeconds / SHOT_SECONDS));
  const durations = distribute(scene.durationSeconds, shotCount);
  const spokenChunks = splitWords([scene.narration, scene.dialogue].filter(Boolean).join(' '), shotCount);
  scene.shots = durations.map((durationSeconds, index): FilmShot => {
    const order = index + 1;
    const shot: FilmShot = {
      id: randomUUID(),
      order,
      title: `${scene.title} · Plano ${order}`,
      durationSeconds,
      visualPrompt: scene.visualPrompt,
      camera: shotDirections[index % shotDirections.length].camera,
      spokenText: spokenChunks[index] || '',
      mode: 'video',
      characterIds: [],
      status: 'pending'
    };
    prepareShot(plan, scene, shot, index);
    return shot;
  });
  resetSceneProduction(scene);
  return scene.shots;
}

export function preflightPlan(plan: FilmPlan) {
  ensurePlanShots(plan);
  const issues = plan.scenes.flatMap((scene) => scene.shots.flatMap((shot) =>
    (shot.preflightIssues || []).map((issue) => `Escena ${scene.order}, plano ${shot.order}: ${issue}`)
  ));
  return {
    passed: issues.length === 0,
    score: issues.length === 0 ? 10 : Math.max(0, Math.round((10 - issues.length * 0.5) * 100) / 100),
    issues
  };
}

function prepareShot(plan: FilmPlan | undefined, scene: FilmScene, shot: FilmShot, index: number) {
  const direction = shotDirections[index % shotDirections.length];
  const featured = selectShotCharacters(plan, scene, shot, index);
  const narrativeBeat = shot.spokenText.trim() || scene.summary.trim();
  const cleanVisual = cleanSceneVisualPrompt(plan, scene, featured);
  const continuity = characterContinuity(plan, featured);

  shot.characterIds = featured;
  shot.camera = direction.camera;
  shot.mode = chooseShotMode(scene, shot, featured, index);
  shot.visualPrompt = [
    cleanVisual,
    direction.description,
    `Momento unico de esta toma: ${narrativeBeat}.`,
    continuity,
    'Una sola accion visible y una sola composicion durante toda la toma.',
    'Movimiento autentico, fisica estable, rostros y vestuario constantes.',
    'Sin montaje interno, sin alternar encuadres, sin cambios de escala, sin transformaciones, sin texto, sin subtitulos y sin logotipos.'
  ].filter(Boolean).join(' ');

  const issues = validateShot(shot);
  shot.preflightVersion = PREFLIGHT_VERSION;
  shot.preflightIssues = issues;
  shot.preflightScore = issues.length === 0 ? 10 : Math.max(0, 10 - issues.length);
  shot.promptLocked = issues.length === 0;
}

function selectShotCharacters(plan: FilmPlan | undefined, scene: FilmScene, shot: FilmShot, index: number) {
  const allowedIds = scene.characterIds.filter((id) => plan?.characters.some((character) => character.id === id) ?? true);
  if (!allowedIds.length) return [];
  if (!plan) return (shot.characterIds.length ? shot.characterIds : allowedIds).slice(0, MAX_FEATURED_CHARACTERS);

  const available = allowedIds
    .map((id) => plan.characters.find((character) => character.id === id))
    .filter((character): character is Character => Boolean(character));
  const text = normalize(`${shot.spokenText} ${shot.title}`);
  const mentioned = available.filter((character) => text.includes(normalize(character.name)));
  if (mentioned.length) return mentioned.slice(0, MAX_FEATURED_CHARACTERS).map((character) => character.id);

  const preserved = shot.characterIds.filter((id) => allowedIds.includes(id)).slice(0, MAX_FEATURED_CHARACTERS);
  if (preserved.length) return preserved;
  if (index === 0) return allowedIds.slice(0, MAX_FEATURED_CHARACTERS);
  return [allowedIds[index % allowedIds.length]];
}

function cleanSceneVisualPrompt(plan: FilmPlan | undefined, scene: FilmScene, featuredIds: string[]) {
  const selectedNames = new Set(
    plan?.characters.filter((character) => featuredIds.includes(character.id)).map((character) => normalize(character.name)) || []
  );
  const excludedNames = plan?.characters
    .filter((character) => scene.characterIds.includes(character.id) && !featuredIds.includes(character.id))
    .map((character) => normalize(character.name)) || [];

  const sentences = scene.visualPrompt
    .replace(/\b(alternar|intercalar|insertar)\b[^.!?]*(?:[.!?]|$)/gi, ' ')
    .split(/(?<=[.!?])\s+|\s*;\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => {
      const normalized = normalize(sentence);
      const mentionsExcluded = excludedNames.some((name) => normalized.includes(name));
      const mentionsSelected = [...selectedNames].some((name) => normalized.includes(name));
      return !mentionsExcluded || mentionsSelected;
    })
    .filter((sentence) => !/(primeros planos|plano medio.+plano detalle|cambio de plano|montaje rapido|varios angulos)/i.test(sentence));
  return sentences.join('. ').replace(/\.{2,}/g, '.').trim() || scene.summary;
}

function characterContinuity(plan: FilmPlan | undefined, featuredIds: string[]) {
  if (!plan || !featuredIds.length) return 'Personas secundarias solo al fondo, sin competir con el sujeto principal.';
  const characters = featuredIds
    .map((id) => plan.characters.find((character) => character.id === id))
    .filter((character): character is Character => Boolean(character));
  if (!characters.length) return '';
  return `Unicos personajes principales visibles: ${characters.map((character) =>
    `${character.name}, ${character.appearance}, vestuario ${character.wardrobe}`
  ).join(' | ')}. Mantener exactamente estas identidades.`;
}

function chooseShotMode(scene: FilmScene, shot: FilmShot, featuredIds: string[], index: number): FilmShot['mode'] {
  if (process.env.REQUIRE_VIDEO_ONLY !== 'false') return 'video';
  const closeUp = index % shotDirections.length === 2;
  return scene.mode === 'avatar' && Boolean(scene.dialogue.trim()) && featuredIds.length === 1 && closeUp
    ? 'avatar-video'
    : 'video';
}

function validateShot(shot: FilmShot) {
  const issues: string[] = [];
  if (shot.characterIds.length > MAX_FEATURED_CHARACTERS) issues.push('Hay mas de dos personajes principales.');
  if (shot.mode === 'avatar-video' && shot.characterIds.length !== 1) issues.push('Un avatar requiere exactamente un personaje.');
  const positiveInstructions = shot.visualPrompt
    .replace(/sin (?:montaje interno|alternar encuadres|cambios? de escala|cortes?)/gi, '');
  if (/(alternar|intercalar|varios angulos|montaje rapido|cambio de plano)/i.test(positiveInstructions)) {
    issues.push('El prompt contiene montaje o varios encuadres dentro de una sola toma.');
  }
  const maximumWords = Math.max(10, Math.floor(shot.durationSeconds * 2.8));
  if (wordCount(shot.spokenText) > maximumWords) {
    issues.push(`El dialogo tiene ${wordCount(shot.spokenText)} palabras; el maximo seguro es ${maximumWords}.`);
  }
  if (!/sin cortes/i.test(shot.camera)) issues.push('La camara no declara continuidad sin cortes.');
  return issues;
}

function resetSceneProduction(scene: FilmScene) {
  scene.status = 'pending';
  scene.imageAsset = undefined;
  scene.voiceAsset = undefined;
  scene.videoAsset = undefined;
  scene.qualityScore = undefined;
  scene.qualityAttempts = undefined;
  scene.qualityIssues = undefined;
  scene.qualityReportAsset = undefined;
  scene.qualityOverrideApproved = undefined;
  scene.error = undefined;
}

function distribute(totalSeconds: number, count: number) {
  const base = Math.floor(totalSeconds / count);
  const remainder = totalSeconds - base * count;
  const values = Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
  if (values.some((value) => value < 4 || value > 8)) {
    throw new Error(`No fue posible dividir ${totalSeconds}s en planos cinematograficos de 4-8s.`);
  }
  return values;
}

function splitWords(text: string, count: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return Array.from({ length: count }, () => '');
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * words.length) / count);
    const end = Math.floor(((index + 1) * words.length) / count);
    return words.slice(start, end).join(' ');
  });
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
const wordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
