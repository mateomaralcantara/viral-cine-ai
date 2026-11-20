/**
 * Médico de textos: entiende por qué falló una toma y reescribe su prompt.
 * - «bloqueada»: el filtro de Google la rechazó (no cobra). Reformula sin perder la escena.
 * - «calidad»: el revisor encontró defectos. Corrige lo visible.
 * El diálogo en cámara se conserva EXACTO. Cuesta una fracción de céntimo (texto).
 */
import { googleClient, videoPlatform } from '@/lib/v7/production/scene-veo-engine';
import { QA_MODELS } from '@/lib/v7/qa/shot-vision-runner';

export type DoctorInput = {
  prompt: string;
  kind: 'bloqueada' | 'calidad';
  problem: string;            // mensaje de Google o problemas del revisor
  line?: string;              // diálogo dicho en cámara (debe conservarse exacto)
  onCamera?: boolean;
  attempt: number;            // 1, 2, 3… cada intento reformula más
};

export function doctorPrompt(input: DoctorInput) {
  const strength = input.attempt >= 3 ? 'muy a fondo' : input.attempt === 2 ? 'a fondo' : 'con cambios mínimos';
  return [
    'Eres el director de fotografía de una película. Reescribe, en español, el prompt de una toma para el generador de video Google Veo.',
    input.kind === 'bloqueada'
      ? `El filtro de contenido de Google BLOQUEÓ la toma («${input.problem}»). Reformúlala ${strength} para que pase el filtro sin perder el sentido dramático: ` +
        'evita palabras clínicas o morbosas (cáncer, morir, muerte, sufrimiento, hospital si no es imprescindible, lágrimas excesivas, sangre), describe emociones con sobriedad, ' +
        'adultos claramente adultos, nada de niños, sin violencia, sin marcas ni texto. Si hay una persona real o muy parecida a una celebridad, descríbela de forma genérica.'
      : `El supervisor de calidad encontró estos defectos: ${input.problem}. Reescribe ${strength} para evitarlos (manos naturales y fuera de primer plano, movimientos sencillos, sin objetos que cambien, sin texto).`,
    input.onCamera && input.line
      ? `OBLIGATORIO: el personaje dice en cámara, en español, EXACTAMENTE esta frase entre comillas angulares: «${input.line}». Mantén la frase idéntica y la indicación de que la dice en español con los labios sincronizados.`
      : 'Nadie habla en cámara: bocas cerradas.',
    'Conserva el lugar, la luz, la paleta de color y el tipo de plano. Termina con: «Sin subtítulos ni texto en pantalla.»',
    'Devuelve SOLO el prompt nuevo, en un único párrafo, sin comillas alrededor ni explicaciones.',
    '\nPROMPT ACTUAL:\n' + input.prompt
  ].join('\n');
}

/** Comprueba que el prompt nuevo es usable: largo correcto y diálogo exacto conservado. */
export function validDoctorOutput(text: string, input: Pick<DoctorInput, 'line' | 'onCamera'>) {
  const t = text.trim().replace(/^["“]|["”]$/g, '');
  if (t.length < 60 || t.length > 3500) return null;
  if (input.onCamera && input.line && !t.includes('«' + input.line + '»')) return null;
  return /Sin subtítulos ni texto en pantalla\.?$/.test(t) ? t : t + ' Sin subtítulos ni texto en pantalla.';
}

export async function rewritePrompt(input: DoctorInput): Promise<string> {
  const platform = videoPlatform();
  const ai = googleClient(platform, platform === 'vertex' ? (process.env.V7_QA_LOCATION?.trim() || 'global') : undefined);
  let last = '';
  for (const model of QA_MODELS) {
    for (let tries = 0; tries < 2; tries++) {
      try {
        const res = await ai.models.generateContent({ model, contents: [{ role: 'user', parts: [{ text: doctorPrompt(input) }] }], config: { temperature: 0.5 + 0.15 * input.attempt } });
        const ok = validDoctorOutput(res.text ?? '', input);
        if (ok) return ok;
        last = 'respuesta no válida';
      } catch (e) {
        last = String((e as Error)?.message ?? e);
        if (/404|NOT_FOUND|not found|is not supported/i.test(last)) break;
        if (/429|RESOURCE_EXHAUSTED/i.test(last)) await new Promise((r) => setTimeout(r, 15000));
      }
    }
  }
  throw new Error('El médico de textos no pudo reescribir la toma: ' + last.slice(0, 200));
}
