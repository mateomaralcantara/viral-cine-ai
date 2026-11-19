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
    .filter(({ shot }) => (shot.spokenText ?? '').trim().length > 0 && shot.metadata?.onCameraDialogue !== true)
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
  fiscal: ['Callum', 'Clyde', 'Charlie', 'Roger', 'Harry'],
  esposa: ['Sarah', 'Charlotte', 'Matilda', 'Alice', 'Lily', 'Jessica'],
  'voz-desconocida': ['Arnold', 'Clyde', 'Harry', 'Roger', 'Callum']
};

/** Personajes que no tienen voz propia: usan la voz de otro con tratamiento sonoro. */
export const VOICE_ALIASES: Record<string, string> = { 'voz-interior': 'martin' };

/** Tratamiento sonoro por personaje (filtro de audio de FFmpeg), o null. */
export function voiceTreatment(speaker: string): string | null {
  switch (speaker) {
    case 'voz-interior': return 'highpass=f=140,lowpass=f=6500,aecho=0.8:0.55:45:0.22,volume=0.95';
    case 'voz-desconocida': return 'asetrate=44100*0.8,aresample=48000,lowpass=f=3800,aecho=0.8:0.8:180|360:0.45|0.3,volume=1.3';
    default: return null;
  }
}

/** ¿La toma lleva diálogo dicho en cámara por Veo (voz y labios nativos)? */
export function isOnCamera(shot: { metadata?: Record<string, unknown> }) {
  return shot.metadata?.onCameraDialogue === true;
}

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
    case 'voz-interior': return { stability: 0.6, similarity_boost: 0.8, style: 0.2, speed: 0.95, use_speaker_boost: true };
    case 'voz-desconocida': return { stability: 0.85, similarity_boost: 0.7, style: 0.05, speed: 0.75, use_speaker_boost: true };
    case 'esposa': return { stability: 0.5, similarity_boost: 0.8, style: 0.3, speed: 0.92, use_speaker_boost: true };
    default: return { stability: 0.5, similarity_boost: 0.8, style: 0.25, speed: 1, use_speaker_boost: true };
  }
}

/** Duración final de la toma: el video entero, o más si la voz necesita espacio. */
export function shotTiming(videoSeconds: number, voiceSeconds: number | null) {
  const needed = voiceSeconds == null ? 0 : VOICE_START_SECONDS + voiceSeconds + VOICE_TAIL_SECONDS;
  const total = Math.max(videoSeconds, needed);
  return { total: Math.round(total * 1000) / 1000, freeze: Math.max(0, Math.round((total - videoSeconds) * 1000) / 1000) };
}

// ---------------------------------------------------------------- SUBTÍTULOS
export type SubtitleCue = { start: number; end: number; text: string };

/** Parte un texto en líneas de como máximo `max` caracteres, sin cortar palabras. */
export function wrapSubtitle(text: string, max = 42) {
  const lines: string[] = [];
  let current = '';
  for (const word of text.replace(/\s+/g, ' ').trim().split(' ')) {
    if (current && (current + ' ' + word).length > max) { lines.push(current); current = word; }
    else current = current ? current + ' ' + word : word;
  }
  if (current) lines.push(current);
  return lines;
}

/** Duración estimada de una frase dicha (≈14 caracteres por segundo, mínimo 1,2 s). */
export function speechSeconds(text: string) {
  return Math.max(1.2, text.length / 14);
}

/** Convierte una frase en uno o varios subtítulos (máx. 2 líneas cada uno), repartiendo el tiempo. */
export function cuesForLine(text: string, start: number, end: number): SubtitleCue[] {
  const lines = wrapSubtitle(text);
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i += 2) blocks.push(lines.slice(i, i + 2).join('\n'));
  const total = blocks.reduce((n, b) => n + b.length, 0) || 1;
  const cues: SubtitleCue[] = [];
  let t = start;
  for (const b of blocks) {
    const d = (end - start) * (b.length / total);
    cues.push({ start: t, end: t + d, text: b });
    t += d;
  }
  return cues;
}

const srtTime = (s: number) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60, r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(r).padStart(3, '0')}`;
};

export function buildSrt(cues: SubtitleCue[]) {
  return cues.filter((c) => c.text.trim() && c.end > c.start)
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
}
