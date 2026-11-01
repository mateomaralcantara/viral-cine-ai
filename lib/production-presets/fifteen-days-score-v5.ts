import type { MusicPlan } from '@/lib/domain/schemas';

export const FIFTEEN_DAYS_SCORE_V5: MusicPlan = {
  version: '5.0-emotional-score-v1',
  title: '15 DÍAS — Banda sonora emocional',
  objective:
    'Acompañar la caída, reconstrucción y recuperación de Elena con una emoción creciente, íntima y humana. La música debe conmover sin manipular de forma obvia: el dolor nace del silencio, la respiración, el piano contenido y un motivo reconocible que finalmente se abre en cuerdas cálidas.',
  masterMotif:
    'Motivo original de tres notas: una tercera menor descendente, una nota sostenida con aire de espera y una resolución ascendente incompleta. Al principio aparece fragmentado en piano felt; durante la reconstrucción lo toma el cello; en el reencuentro con los hijos se completa por primera vez en piano, cello y cuerdas.',
  rules: [
    'No música continua: usar silencio real antes de los golpes emocionales importantes.',
    'Nada de melodías reconocibles ni referencias a canciones existentes.',
    'Sin letras ni voz solista; la emoción debe venir de instrumentos y dinámica.',
    'Evitar sentimentalismo excesivo: no usar crescendos grandes durante cada llanto.',
    'El motivo de Elena evoluciona con ella y nunca cambia de identidad.',
    'La música debe bajar automáticamente bajo diálogo y respiración emocional.',
    'Los momentos más tristes usan menos instrumentos, no más.',
    'El reencuentro con los hijos es el único gran clímax musical completo.',
    'El éxito económico no recibe música triunfal; recibe alivio y dignidad.',
    'El final debe dejar esperanza contenida, no sensación de comercial.'
  ],
  cues: [
    {
      id: 'cue-01-empty-house',
      title: 'La casa que ya no está',
      startSeconds: 0,
      endSeconds: 55,
      emotion: 'vacío, desconcierto, pérdida contenida',
      intensity: 0.24,
      tempoBpm: 48,
      instrumentation: ['piano felt', 'cello grave muy sutil', 'textura de aire', 'contrabajo arco lejano'],
      motif: 'Primera aparición incompleta de dos notas del motivo de Elena.',
      prompt:
        'Original cinematic underscore, intimate contemporary drama, felt piano with long natural decay, very sparse low cello, distant bowed bass texture, fragile unresolved harmony, large spaces of silence, 48 BPM, no percussion, no vocals, no lyrics, restrained grief rather than melodrama, subtle room tone feeling, designed under dialogue.',
      dialogueDuckDb: -11,
      allowSilenceBeforeSeconds: 6,
      emotionalPeak: false,
      noVocals: true
    },
    {
      id: 'cue-02-children-away',
      title: 'Manos vacías',
      startSeconds: 55,
      endSeconds: 120,
      emotion: 'impotencia, separación, dolor maternal',
      intensity: 0.46,
      tempoBpm: 44,
      instrumentation: ['piano felt', 'solo cello', 'viola armónica', 'subgrave acústico'],
      motif: 'El motivo de tres notas aparece por primera vez, pero sin resolución.',
      prompt:
        'Original emotional film score for a mother separated from her children, sparse felt piano, intimate solo cello, soft viola harmonics and almost inaudible acoustic low-end, 44 BPM, unresolved three-note motif, heartbreaking but restrained, no heroic swell, no percussion, no vocals or lyrics, leave room for sobs, footsteps and courtroom ambience.',
      dialogueDuckDb: -12,
      allowSilenceBeforeSeconds: 3,
      emotionalPeak: false,
      noVocals: true
    },
    {
      id: 'cue-03-first-night',
      title: 'Primera noche',
      startSeconds: 120,
      endSeconds: 190,
      emotion: 'soledad, frío, pérdida de identidad',
      intensity: 0.3,
      tempoBpm: 42,
      instrumentation: ['piano preparado suave', 'cello sul tasto', 'pad granular orgánico'],
      motif: 'Solo la primera nota del motivo; las demás quedan sugeridas por armónicos.',
      prompt:
        'Minimal original cinematic score for homelessness and isolation, single soft piano notes, cello sul tasto, organic granular air, extremely restrained dynamics, 42 BPM, long silence between phrases, fragile human tone, no sentimental strings, no drums, no vocals, no lyrics, intimate and cold but not hopeless.',
      dialogueDuckDb: -10,
      allowSilenceBeforeSeconds: 8,
      emotionalPeak: false,
      noVocals: true
    },
    {
      id: 'cue-04-notebook',
      title: 'La primera página',
      startSeconds: 190,
      endSeconds: 245,
      emotion: 'dolor que empieza a convertirse en voluntad',
      intensity: 0.34,
      tempoBpm: 52,
      instrumentation: ['piano felt', 'cello pizzicato muy suave', 'viola sostenida'],
      motif: 'Las tres notas aparecen limpias por primera vez, todavía sin acorde final.',
      prompt:
        'Original intimate motivational film score, felt piano introduces a delicate three-note motif, soft cello pizzicato pulse and sustained viola, 52 BPM, tentative hope emerging from sadness, no triumph, no drums, no vocals, no lyrics, warm but fragile, designed for writing montage and close human detail.',
      dialogueDuckDb: -9,
      allowSilenceBeforeSeconds: 2,
      emotionalPeak: false,
      noVocals: true
    },
    {
      id: 'cue-05-someone-stops',
      title: 'Alguien se detuvo',
      startSeconds: 245,
      endSeconds: 325,
      emotion: 'empatía, reconocimiento, una puerta que se abre',
      intensity: 0.42,
      tempoBpm: 54,
      instrumentation: ['piano', 'solo cello', 'viola', 'cuerdas graves suaves'],
      motif: 'Mariana responde al motivo de Elena con una segunda frase complementaria.',
      prompt:
        'Original cinematic drama underscore for two women recognizing the same wound, intimate piano and solo cello dialogue, warm viola and restrained low strings, 54 BPM, compassionate and truthful, avoid sentimentality, no percussion, no vocals, no lyrics, gradual warmth without becoming uplifting too early.',
      dialogueDuckDb: -12,
      allowSilenceBeforeSeconds: 4,
      emotionalPeak: false,
      noVocals: true
    },
    {
      id: 'cue-06-fifteen-days',
      title: 'Volver a escribir',
      startSeconds: 325,
      endSeconds: 430,
      emotion: 'disciplina, pequeños avances, esperanza creciente',
      intensity: 0.56,
      tempoBpm: 62,
      instrumentation: ['piano felt', 'cello', 'viola', 'cuerdas cálidas', 'percusión de marco amortiguada'],
      motif: 'El motivo mantiene sus tres notas y empieza a resolver hacia arriba.',
      prompt:
        'Original cinematic rebuilding montage, felt piano three-note motif, warm cello and viola, restrained chamber strings, very soft muted frame percussion like a heartbeat, 62 BPM, emotionally hopeful but grounded, gradual momentum, no pop rhythm, no vocals, no lyrics, leave space for keyboard sounds, page turns and notification effects.',
      dialogueDuckDb: -8,
      allowSilenceBeforeSeconds: 1,
      emotionalPeak: false,
      noVocals: true
    },
    {
      id: 'cue-07-first-sale',
      title: 'Una sola venta',
      startSeconds: 430,
      endSeconds: 480,
      emotion: 'sorpresa, alivio, primera prueba de que puede volver',
      intensity: 0.5,
      tempoBpm: 58,
      instrumentation: ['piano', 'cello cálido', 'violines muy suaves'],
      motif: 'Resolución parcial del motivo; nunca fanfarria.',
      prompt:
        'Original emotional score for a tiny breakthrough after hardship, intimate piano, warm cello and barely-there violins, 58 BPM, relief before success, humble and human, no triumphant brass, no drums, no vocals, no lyrics, emphasize a single meaningful moment rather than victory.',
      dialogueDuckDb: -9,
      allowSilenceBeforeSeconds: 3,
      emotionalPeak: false,
      noVocals: true
    },
    {
      id: 'cue-08-new-life',
      title: 'Dignidad',
      startSeconds: 480,
      endSeconds: 540,
      emotion: 'estabilidad, crecimiento, dignidad recuperada',
      intensity: 0.58,
      tempoBpm: 60,
      instrumentation: ['piano', 'cello', 'ensemble de cuerdas', 'contrabajo suave'],
      motif: 'El motivo suena completo pero todavía contenido.',
      prompt:
        'Original mature cinematic score for restored dignity, piano and warm chamber strings, lyrical cello, restrained bass foundation, 60 BPM, confident without sounding wealthy or triumphant, emotional maturity, no brass fanfare, no vocals, no lyrics, elegant contemporary drama.',
      dialogueDuckDb: -9,
      allowSilenceBeforeSeconds: 0,
      emotionalPeak: false,
      noVocals: true
    },
    {
      id: 'cue-09-raul-fall',
      title: 'Lo que queda',
      startSeconds: 540,
      endSeconds: 580,
      emotion: 'consecuencia, vacío, compasión incómoda',
      intensity: 0.28,
      tempoBpm: 46,
      instrumentation: ['piano grave', 'cello armónicos', 'textura de cuerda'],
      motif: 'El motivo de Elena aparece invertido y distante, sin apropiarse de su identidad.',
      prompt:
        'Original sparse cinematic consequence cue, low piano, distant cello harmonics, dry bowed string texture, 46 BPM, emotionally ambiguous, no revenge feeling, no villain music, no triumph, no percussion, no vocals, no lyrics, leave uncomfortable silence around the character.',
      dialogueDuckDb: -10,
      allowSilenceBeforeSeconds: 5,
      emotionalPeak: false,
      noVocals: true
    },
    {
      id: 'cue-10-children-home',
      title: 'De verdad',
      startSeconds: 580,
      endSeconds: 650,
      emotion: 'reencuentro, alivio profundo, amor maternal',
      intensity: 0.92,
      tempoBpm: 56,
      instrumentation: ['piano felt', 'solo cello', 'viola', 'ensemble de cuerdas completo', 'contrabajo arco'],
      motif: 'Primera resolución completa del motivo de Elena; se abre en registro alto cuando los niños corren hacia ella.',
      prompt:
        'Original deeply emotional cinematic reunion score, felt piano begins almost alone then solo cello joins, warm viola and full chamber strings gradually bloom, 56 BPM, the established three-note motif finally resolves, profound maternal relief, tears through restraint and harmonic release, no drums, no brass, no vocals, no lyrics, one carefully shaped crescendo only at the embrace, then immediate soft falloff under dialogue.',
      dialogueDuckDb: -13,
      allowSilenceBeforeSeconds: 7,
      emotionalPeak: true,
      noVocals: true
    },
    {
      id: 'cue-11-last-card',
      title: 'Segunda página',
      startSeconds: 650,
      endSeconds: 720,
      emotion: 'compasión, cierre, esperanza adulta',
      intensity: 0.48,
      tempoBpm: 54,
      instrumentation: ['piano', 'cello', 'cuerdas suaves'],
      motif: 'Motivo completo de Elena, ahora sencillo y sin necesidad de crescendo.',
      prompt:
        'Original closing cinematic score, intimate piano, lyrical cello, soft warm strings, 54 BPM, forgiveness without reconciliation, mature hope, restrained emotional closure, no triumph, no vocals, no lyrics, resolve gently and leave the final chord slightly open for the title card.',
      dialogueDuckDb: -11,
      allowSilenceBeforeSeconds: 2,
      emotionalPeak: false,
      noVocals: true
    }
  ]
};

export function validateFifteenDaysScore() {
  const cues = FIFTEEN_DAYS_SCORE_V5.cues;
  for (let index = 1; index < cues.length; index += 1) {
    if (cues[index].startSeconds < cues[index - 1].endSeconds) {
      throw new Error(
        'Music cues overlap: ' + cues[index - 1].id + ' -> ' + cues[index].id
      );
    }
  }
  return true;
}
