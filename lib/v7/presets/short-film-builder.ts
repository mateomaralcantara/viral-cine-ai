/**
 * Constructor común de cortometrajes: una película nueva es solo datos
 * (personajes, escenas, tomas con prompt curado y narración). No llama a
 * proveedores ni gasta nada; produce el mismo bundle que usa el estudio.
 */
import { FilmV7Schema } from '@/lib/v7/domain/film';
import { VoiceProfileSchema } from '@/lib/v7/domain/voice-profile';
import { createInitialV7Workflow } from '@/lib/v7/domain/workflow';
import type { StoredFilmBundle } from '@/lib/v7/storage/film-store';

/**
 * onCamera = el personaje dice la frase EN CÁMARA (Veo genera voz y labios en español).
 * Sin onCamera, la frase es voz en off (ElevenLabs) y las bocas van cerradas.
 */
export type ShortFilmBeat = { title: string; camera: string; prompt: string; line: string; voice: string; seconds?: 4 | 6 | 8; onCamera?: boolean };
/** music = descripción de la música original de la secuencia (para generarla o elegirla). */
export type ShortFilmScene = { title: string; summary: string; location: string; wardrobe: string; cast: string[]; beats: ShortFilmBeat[]; music?: string; musicPrompt?: string };
export type ShortFilmCharacter = { key: string; name: string; age: number; role: string; appearance: string; voice: string };
export type ShortFilmSpec = {
  id: string; title: string; premise: string; genre: string; audience: string; visualStyle: string;
  characters: ShortFilmCharacter[]; scenes: ShortFilmScene[];
  metadata?: Record<string, unknown>; continuityNotes?: string[];
};

const DEFAULT_SHOT_SECONDS = 8;

export function shortFilmStats(spec: ShortFilmSpec) {
  const beats = spec.scenes.flatMap((s) => s.beats);
  return { scenes: spec.scenes.length, shots: beats.length, totalSeconds: beats.reduce((n, b) => n + (b.seconds ?? DEFAULT_SHOT_SECONDS), 0) };
}

export function buildShortFilmBundle(spec: ShortFilmSpec, now: string = new Date().toISOString()): Omit<StoredFilmBundle, 'savedAt'> {
  const filmId = spec.id;
  const known = new Set(spec.characters.map((c) => c.key));
  for (const scene of spec.scenes) {
    for (const key of [...scene.cast, ...scene.beats.map((b) => b.voice)]) {
      if (!known.has(key)) throw new Error('Personaje desconocido en «' + scene.title + '»: ' + key);
    }
  }
  const characterId = (key: string) => filmId + '-character-' + key;
  const sceneSeconds = (scene: ShortFilmScene) => scene.beats.reduce((n, b) => n + (b.seconds ?? DEFAULT_SHOT_SECONDS), 0);
  const stats = shortFilmStats(spec);

  // Cada escena es una secuencia; las escenas se reparten en como máximo 5 actos
  // (con 5 escenas o menos, una por acto: mismos ids que siempre).
  const perAct = Math.ceil(spec.scenes.length / 5);
  const sequences = spec.scenes.map((scene, index) => {
    const actNumber = Math.floor(index / perAct) + 1;
    const actId = filmId + '-act-' + actNumber;
    const sequenceId = actId + '-sequence-' + (index % perAct + 1);
    const sceneId = filmId + '-scene-' + String(index + 1).padStart(2, '0');
    return { actNumber, actId, sequence: {
        id: sequenceId, actId, order: index % perAct + 1, title: scene.title, objective: scene.summary,
        scenes: [{
          id: sceneId, sequenceId, order: index + 1, title: scene.title, summary: scene.summary,
          durationSeconds: sceneSeconds(scene),
          timeIndex: spec.scenes.slice(0, index).reduce((n, s) => n + sceneSeconds(s), 0),
          characterIds: scene.cast.map(characterId),
          narrativeGoal: scene.summary, emotionalGoal: 'Emoción auténtica, sin melodrama artificial',
          continuityNotes: [scene.location, scene.wardrobe, ...(spec.continuityNotes ?? [])],
          shots: scene.beats.map((beat, shotIndex) => ({
            id: sceneId + '-shot-' + String(shotIndex + 1).padStart(2, '0'), sceneId, order: shotIndex + 1,
            title: beat.title, intention: scene.summary, durationSeconds: beat.seconds ?? DEFAULT_SHOT_SECONDS,
            visualPrompt: beat.prompt, camera: beat.camera, spokenText: beat.line,
            speakerId: characterId(beat.voice), characterIds: scene.cast.map(characterId),
            strategy: 'cinematic-video-candidate',
            metadata: { curatedPrompt: true, voiceOver: !beat.onCamera, onCameraDialogue: beat.onCamera === true, providerCalls: 0, lipsyncStatus: beat.onCamera ? 'native-veo' : 'not-needed' },
            takes: []
          })),
          metadata: { location: scene.location, costume: scene.wardrobe, ...(scene.music ? { music: scene.music } : {}), ...(scene.musicPrompt ? { musicPrompt: scene.musicPrompt } : {}) }
        }]
      } };
  });
  const acts = [...new Set(sequences.map((x) => x.actNumber))].map((n) => {
    const own = sequences.filter((x) => x.actNumber === n);
    const first = spec.scenes[(n - 1) * perAct];
    return { id: own[0].actId, filmId, order: n, title: own.length > 1 ? 'Acto ' + n : first.title, dramaticObjective: own.map((x) => x.sequence.objective).join(' '), sequences: own.map((x) => x.sequence) };
  });

  const film = FilmV7Schema.parse({
    id: filmId, title: spec.title, premise: spec.premise, durationMinutes: Math.max(1, Math.ceil(stats.totalSeconds / 60)),
    genre: spec.genre, audience: spec.audience, visualStyle: spec.visualStyle,
    language: 'es', aspectRatio: '16:9', budgetUsd: 0, acts,
    characters: spec.characters.map((c) => ({
      id: characterId(c.key), filmId, name: c.name, age: c.age, role: c.role, appearance: c.appearance,
      identityLock: c.appearance, immutableTraits: [c.appearance], personality: c.voice,
      voiceProfileId: filmId + '-voice-' + c.key,
      metadata: { canonicalImageApproved: false, castingStatus: 'pending' }
    })),
    createdAt: now, updatedAt: now,
    metadata: { storyTreatmentApproved: true, productionMode: 'PREPRODUCTION_ONLY', moneySpentUsd: 0, ...(spec.metadata ?? {}) }
  });

  const voiceProfiles = spec.characters.map((c) => VoiceProfileSchema.parse({
    id: filmId + '-voice-' + c.key, characterId: characterId(c.key), provider: 'unassigned',
    language: 'es', accent: 'neutro', ageProfile: String(c.age), timbre: c.voice, speed: 1,
    approved: false, rightsStatus: 'unknown', voiceVersion: 1, emotionPresets: {}, pronunciationDictionary: {}
  }));

  return {
    film, assets: [], voiceProfiles, workflow: createInitialV7Workflow(now),
    creationInput: {
      title: spec.title, story: spec.premise, durationMinutes: film.durationMinutes, genre: spec.genre,
      aspectRatio: '16:9', language: 'es', budgetUsd: 0, quality: 'cine'
    }
  };
}
