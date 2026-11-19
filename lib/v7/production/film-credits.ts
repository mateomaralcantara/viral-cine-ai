/**
 * Créditos de apertura y cierre (funciones puras).
 * Solo se acredita lo que de verdad se usó en la película: los datos salen de
 * los registros de producción (modelo de video, voces, música, revisión, reparación…).
 */

export type ProductionFacts = {
  title: string;
  subtitle?: string;
  author?: string;
  videoModels: string[];          // p. ej. ['veo-3.1-fast-generate-001']
  videoPlatform?: 'vertex' | 'gemini';
  voiceCast: Array<{ character: string; voice: string }>;
  dialogueOnCamera: boolean;      // Veo puso voz y labios en cámara
  originalMusic: boolean;         // Lyria
  qualityReviewed: boolean;       // Agente Revisor
  repairedShots: number;          // Agente Reparador
  characterIdentities: number;    // retratos oficiales aprobados
  englishSubtitles: boolean;
  spanishSubtitles: boolean;
};

export type CreditLine = { role: string; name: string };

/** «veo-3.1-fast-generate-001» -> «Google Veo 3.1 Fast». */
export function prettyVideoModel(model: string) {
  const m = /^veo-(\d+(?:\.\d+)?)(?:-(fast|lite))?/.exec(model);
  if (m) return `Google Veo ${m[1]}${m[2] ? ' ' + m[2][0].toUpperCase() + m[2].slice(1) : ''}`;
  if (model.startsWith('gemini-omni')) return 'Google Gemini Omni';
  if (/runway|gen4/i.test(model)) return 'Runway Gen-4';
  return model;
}

/** Los agentes del software que hicieron cada parte, en orden de producción. */
export function agentCredits(f: ProductionFacts): CreditLine[] {
  const video = [...new Set(f.videoModels.map(prettyVideoModel))].join(' · ') || 'Google Veo';
  const platform = f.videoPlatform === 'vertex' ? ' (Vertex AI)' : '';
  const out: CreditLine[] = [
    { role: 'Dirección de producción', name: 'Agente Director · ViralCine' },
    { role: 'Guion de producción y planos', name: 'Agente de Guion · ViralCine' }
  ];
  if (f.characterIdentities) out.push({ role: 'Casting e identidad de personajes', name: 'Agente de Casting · Gemini Image' });
  out.push({ role: 'Cinematografía', name: video + platform });
  if (f.dialogueOnCamera) out.push({ role: 'Diálogos en cámara', name: video + ' · audio nativo' });
  if (f.voiceCast.length) out.push({ role: 'Voces', name: 'Agente de Voz · ElevenLabs' });
  if (f.originalMusic) out.push({ role: 'Música original', name: 'Agente Compositor · Google Lyria' });
  if (f.qualityReviewed) out.push({ role: 'Supervisión de calidad', name: 'Agente Revisor · Gemini' });
  if (f.repairedShots) out.push({ role: 'Posproducción y reparación', name: 'Agente Reparador · FFmpeg' });
  if (f.spanishSubtitles || f.englishSubtitles) {
    out.push({ role: 'Subtítulos', name: f.englishSubtitles ? 'Agente Traductor · Gemini (español · inglés)' : 'Agente de Subtítulos · ViralCine' });
  }
  out.push({ role: 'Montaje y mezcla', name: 'Agente Montador · ViralCine' });
  return out;
}

/** Créditos finales completos (reparto de voces + agentes + autoría). */
export function endCredits(f: ProductionFacts): CreditLine[] {
  return [
    ...(f.author ? [{ role: 'Basada en la novela de', name: f.author }] : []),
    ...f.voiceCast.map((v) => ({ role: 'Voz de ' + v.character, name: v.voice })),
    ...agentCredits(f),
    { role: 'Producida con', name: 'ViralCine Studio · agentes de IA' }
  ];
}

/** Agrupa líneas de crédito en tarjetas de como mucho `perCard`. */
export function chunk<T>(items: T[], perCard: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += perCard) out.push(items.slice(i, i + perCard));
  return out;
}
