/**
 * Voces y montaje final de una película del estudio (funciones puras, sin red).
 * - voicePlan: qué dice cada toma y quién lo dice (sale del guion guardado).
 * - pickCasting: elige voces distintas de ElevenLabs para cada personaje.
 * - shotTiming: alarga la toma (congelando el último fotograma) si la voz no cabe.
 */
import type { FilmV7 } from '@/lib/v7/domain/film';
import { indexedScenes } from '@/lib/v7/production/scene-approval-board';

export type VoiceLine = { label: string; title: string; text: string; speaker: string };
export type AvailableVoice = { voiceId: string; name: string; gender?: string; category?: string };
export type CastEntry = { voiceId: string; name: string };
export type Casting = Record<string, CastEntry>;

export const VOICE_START_SECONDS = 0.35;
export const VOICE_TAIL_SECONDS = 0.6;

/** Nombre corto del personaje a partir de su id: film-x-character-martin -> martin */
export function speakerKey(filmId: string, speakerId: string | undefined) {
  if (!speakerId) return 'narrador';
  const prefix = filmId + '-character-';
  return speakerId.startsWith(prefix) ? speakerId.slice(prefix.length) : speakerId;
}

export function voicePlan(film: FilmV7): VoiceLine[] {
  return indexedScenes(film).flatMap((scene) => scene.shots
    .filter(({ shot }) => (shot.spokenText ?? '').trim().length > 0)
    .map(({ shot, label }) => ({
      label, title: shot.title, text: shot.spokenText!.trim(), speaker: speakerKey(film.id, shot.speakerId)
    })));
}

export function planCharacters(lines: VoiceLine[]) {
  return lines.reduce((n, l) => n + l.text.length, 0);
}

/** Preferencias por papel (voces predeterminadas de ElevenLabs, todas hablan español con multilingual_v2). */
export const VOICE_PREFERENCES: Record<string, string[]> = {
  narrador: ['George', 'Brian', 'Daniel', 'Bill', 'Adam'],
  martin: ['Liam', 'Chris', 'Eric', 'Will', 'Antoni', 'Josh'],
  heraldo: ['Bill', 'Daniel', 'Arnold', 'Roger', 'George'],
  fiscal: ['Callum', 'Clyde', 'Charlie', 'Roger', 'Harry']
};

export function pickCasting(speakers: string[], voices: AvailableVoice[], existing: Casting = {}): Casting {
  const casting: Casting = {};
  const used = new Set<string>();
  for (const s of speakers) {
    const kept = existing[s];
    if (kept && voices.some((v) => v.voiceId === kept.voiceId)) { casting[s] = kept; used.add(kept.voiceId); }
  }
  const firstName = (v: AvailableVoice) => v.name.split(/[\s-]/)[0].toLowerCase();
  for (const s of speakers) {
    if (casting[s]) continue;
    const prefs = VOICE_PREFERENCES[s] ?? [];
    let choice = prefs.map((p) => voices.find((v) => firstName(v) === p.toLowerCase() && !used.has(v.voiceId))).find(Boolean);
    choice ??= voices.find((v) => !used.has(v.voiceId) && (v.gender ?? '').toLowerCase() === 'male');
    choice ??= voices.find((v) => !used.has(v.voiceId));
    if (!choice) throw new Error('No hay voces suficientes en ElevenLabs para ' + s + '.');
    casting[s] = { voiceId: choice.voiceId, name: choice.name };
    used.add(choice.voiceId);
  }
  return casting;
}

/** Ajustes de interpretación por papel. */
export function voiceSettings(speaker: string) {
  switch (speaker) {
    case 'narrador': return { stability: 0.55, similarity_boost: 0.8, style: 0.2, speed: 0.92, use_speaker_boost: true };
    case 'martin': return { stability: 0.38, similarity_boost: 0.8, style: 0.45, speed: 0.95, use_speaker_boost: true };
    case 'heraldo': return { stability: 0.65, similarity_boost: 0.8, style: 0.15, speed: 0.88, use_speaker_boost: true };
    case 'fiscal': return { stability: 0.45, similarity_boost: 0.8, style: 0.4, speed: 0.95, use_speaker_boost: true };
    default: return { stability: 0.5, similarity_boost: 0.8, style: 0.25, speed: 1, use_speaker_boost: true };
  }
}

/** Duración final de la toma: el video entero, o más si la voz necesita espacio. */
export function shotTiming(videoSeconds: number, voiceSeconds: number | null) {
  const needed = voiceSeconds == null ? 0 : VOICE_START_SECONDS + voiceSeconds + VOICE_TAIL_SECONDS;
  const total = Math.max(videoSeconds, needed);
  return { total: Math.round(total * 1000) / 1000, freeze: Math.max(0, Math.round((total - videoSeconds) * 1000) / 1000) };
}
