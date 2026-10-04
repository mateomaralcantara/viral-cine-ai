import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';

export type SingleVisualPlan = {
  version: '4.1-single-visual';
  projectId: string;
  sceneId: string;
  sceneOrder: number;
  shotId: string;
  shotOrder: number;
  shotDurationSeconds: number;
  providerDurationSeconds: 4 | 6 | 8;
  referenceCharacterIds: string[];
  prompt: string;
  videoPrompt: string;
  negativePrompt: string;
};

export function buildSingleVisualPlan(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
): SingleVisualPlan {
  if (!project.plan) throw new Error('Plan ausente.');
  if (shot.dialogueLines.length > 1) {
    throw new Error('La toma es multihablante; usa visual:turns.');
  }

  const referenceCharacterIds = (
    shot.characterIds.length ? shot.characterIds : scene.characterIds
  )
    .filter((id) => project.plan?.characters.some((character) => character.id === id))
    .slice(0, 3);

  const continuity = referenceCharacterIds
    .map((id) => project.plan?.characters.find((character) => character.id === id))
    .filter((character): character is NonNullable<typeof character> => Boolean(character))
    .map((character) =>
      character.name + ': ' + character.appearance + '; wardrobe: ' + character.wardrobe
    )
    .join(' | ');

  const setting = extractSettingAnchor(scene.visualPrompt || shot.visualPrompt);
  const action = extractActionAnchor(shot.visualPrompt, setting);
  const camera = shot.camera.replace(/\s+/g, ' ').trim();
  const narration = shot.spokenText.trim();
  const narrationContext = action ? '' : narration;

  const prompt = [
    project.plan.creativeDirection || '',
    setting ? 'Historical setting: ' + setting + '.' : '',
    action ? 'Narrative action for this frame: ' + action + '.' : '',
    continuity ? 'Character continuity: ' + continuity + '.' : '',
    'Create ONE coherent cinematic shot, not a montage and not a sequence of different camera angles.',
    camera ? 'Camera direction: ' + camera + '.' : '',
    'Honor the requested framing and camera direction while keeping clear geography and natural depth.',
    'The principal action must remain readable in one frame; secondary characters stay visually subordinate and do not perform a competing story beat.',
    'Narrator is off camera. Nobody addresses the camera and nobody is framed for lip-sync.',
    'Grounded historical realism, natural anatomy, stable faces, physically plausible posture and weight.',
    'Restrained non-graphic staging suitable for a general audience.',
    narrationContext ? 'Narration context only: ' + narrationContext : '',
    'No text, subtitles, captions, logos or watermarks.'
  ].filter(Boolean).join(' ');

  const videoPrompt = [
    setting ? 'Historical setting: ' + setting + '.' : '',
    'Animate the approved first-frame reference faithfully instead of redesigning it.',
    'ONE continuous cinematic take for the full clip; no cuts, no montage, no POV insert, no angle change.',
    camera ? 'Camera direction: ' + camera + '.' : '',
    'Use restrained, controlled camera movement that follows the requested framing; do not invent a different shot type.',
    'Preserve exact subject identities, wardrobe, architecture, lighting direction, framing and camera axis.',
    action ? 'Continue only this immediate action: ' + action + '.' : '',
    'Secondary characters may react subtly in the background but must not begin a separate narrative action.',
    'Use restrained natural body movement, believable weight, cloth motion and light atmospheric dust.',
    'Keep faces stable and hands anatomically plausible.',
    'Do not introduce new characters, props or later story beats.',
    'Do not add anachronistic or modern street furniture, electric lighting, wall lamps, street lamps, metal sconces, brackets, cables or signage.',
    'Do not change established age, facial hair or recognizable identity of foreground characters.',
    'Nobody speaks on camera; narrator remains off camera.',
    'Keep the action non-graphic. No text, subtitles, logos or watermarks.'
  ].filter(Boolean).join(' ');

  const negativePrompt = [
    scene.negativePrompt,
    'montage, multiple camera angles, POV insert, sudden close-up, jump cut, shot-reverse-shot',
    'poster pose, tableau, centered ensemble posing, wall of faces, excessive crowd',
    'deformed anatomy, extra fingers, extra limbs, fused bodies, duplicated faces, face morphing, identity drift',
    'warped architecture, melting objects, temporal flicker, unstable costumes, camera shake',
    'graphic violence, gore, blood emphasis, lip-sync framing, visible speaking'
  ].filter(Boolean).join(', ');

  return {
    version: '4.1-single-visual',
    projectId: project.id,
    sceneId: scene.id,
    sceneOrder: scene.order,
    shotId: shot.id,
    shotOrder: shot.order,
    shotDurationSeconds: shot.durationSeconds,
    providerDurationSeconds: providerDuration(shot.durationSeconds),
    referenceCharacterIds,
    prompt,
    videoPrompt,
    negativePrompt
  };
}

function extractSettingAnchor(value: string) {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  const firstSentence = compact.split(/[.!?]/, 1)[0]?.trim() || compact;
  return firstSentence.slice(0, 260).trim();
}

function extractActionAnchor(value: string, settingAnchor: string) {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return '';

  const explicitBeat = compact.match(
    /Una sola (?:acción dominante|idea visual)\s*:\s*([^.!?]+[.!?]?)/i
  )?.[1]?.trim();
  if (explicitBeat) {
    const criticalConstraints = compact
      .split(/(?<=[.!?])\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) =>
        /\b(mano|antebrazo|dedos|muñec|agarre|manos fusionadas)\b/i.test(item)
      )
      .filter((item) => !item.includes(explicitBeat))
      .slice(0, 2)
      .join(' ');
    return [explicitBeat, criticalConstraints]
      .filter(Boolean)
      .join(' ')
      .slice(0, 520)
      .trim();
  }

  const normalizedSetting = normalizeSentence(settingAnchor);
  const sentences = compact
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^Plano\s+\d+/i.test(item))
    .filter((item) => !/^Movimiento continuo/i.test(item))
    .filter((item) => !/^Sin fotograf/i.test(item))
    .filter((item) => !/^Momento narrativo/i.test(item))
    .filter((item) => normalizeSentence(item) !== normalizedSetting)
    .filter((item) => !looksLikeSettingOnly(item));

  // A single-shot plan needs one dominant action. Other characters remain continuity/background.
  return (sentences[0] || '').slice(0, 520).trim();
}

function looksLikeSettingOnly(value: string) {
  const normalized = normalizeSentence(value);
  return /^(calle|jerusalen|salida|umbral|patio|interior|exterior|camino|plaza|sendero)\b/.test(
    normalized
  ) && !/\b(avanza|camina|cruza|carga|lleva|coloca|sostiene|mira|reconoce|protege|sujeta|abre|aleja|entra|sale)\b/.test(
    normalized
  );
}

function normalizeSentence(value: string) {
  return value
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function providerDuration(seconds: number): 4 | 6 | 8 {
  if (seconds <= 4) return 4;
  if (seconds <= 6) return 6;
  return 8;
}
