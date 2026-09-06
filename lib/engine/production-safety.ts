import type { FilmProject } from '@/lib/domain/schemas';
import { hasMultipleDialogueSpeakers, resolveSingleSpeakerId } from '@/lib/engine/speaker-resolution';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DISABLED_CREDENTIAL = /^(?:disabled(?:_offline)?|off|none|null|undefined|your[_-].*|replace[_-].*|changeme|example)$/i;

export type ProductionPauseKind = 'billing' | 'safety' | 'technical';

export class ProductionSafetyError extends Error {
  readonly code = 'PRODUCTION_SAFETY_BLOCKED';

  constructor(message: string) {
    super(message);
    this.name = 'ProductionSafetyError';
  }
}

export function productionMode(): 'demo' | 'real' {
  return process.env.PRODUCTION_MODE === 'real' ? 'real' : 'demo';
}

export function envFlag(name: string) {
  return TRUE_VALUES.has((process.env[name] || '').trim().toLowerCase());
}

export function isUsableCredentialValue(value: string | undefined) {
  const normalized = value?.trim();
  return Boolean(normalized && normalized.length >= 8 && !DISABLED_CREDENTIAL.test(normalized));
}

export function hasUsableCredential(name: string) {
  return isUsableCredentialValue(process.env[name]);
}

export function externalCallsEnabled() {
  return productionMode() === 'real' && envFlag('ALLOW_EXTERNAL_API_CALLS');
}

export function paidGenerationEnabled() {
  return externalCallsEnabled() && envFlag('ALLOW_PAID_GENERATION');
}

export function safetyStatus() {
  const mode = productionMode();
  if (mode !== 'real') {
    return { mode, externalCallsEnabled: false, paidGenerationEnabled: false, reason: 'Modo demo: todas las APIs externas están bloqueadas.' } as const;
  }
  if (!envFlag('ALLOW_EXTERNAL_API_CALLS')) {
    return { mode, externalCallsEnabled: false, paidGenerationEnabled: false, reason: 'ALLOW_EXTERNAL_API_CALLS no está autorizado.' } as const;
  }
  if (!envFlag('ALLOW_PAID_GENERATION')) {
    return { mode, externalCallsEnabled: true, paidGenerationEnabled: false, reason: 'ALLOW_PAID_GENERATION no está autorizado.' } as const;
  }
  return { mode, externalCallsEnabled: true, paidGenerationEnabled: true, reason: 'Producción pagada autorizada explícitamente.' } as const;
}

export function assertPaidGenerationAllowed(operation: string, credentialName?: string) {
  const status = safetyStatus();
  if (status.mode !== 'real') {
    throw new ProductionSafetyError(`Bloqueo de seguridad: ${operation} no puede usar una API pagada en modo demo.`);
  }
  if (!status.externalCallsEnabled || !status.paidGenerationEnabled) {
    throw new ProductionSafetyError(`Bloqueo de seguridad: ${operation} requiere ALLOW_EXTERNAL_API_CALLS=true y ALLOW_PAID_GENERATION=true.`);
  }
  if (credentialName && !hasUsableCredential(credentialName)) {
    throw new ProductionSafetyError(`Bloqueo de seguridad: ${operation} no tiene una credencial utilizable (${credentialName}).`);
  }
}

export function assertProductionCanQueue(project?: Pick<FilmProject, 'plan'>) {
  if (productionMode() !== 'real') {
    const hasPaidHistory = project?.plan?.scenes.some((scene) =>
      scene.shots.some((shot) => (shot.generationCount || 0) > 0)
    );
    if (hasPaidHistory) {
      throw new ProductionSafetyError(
        'Bloqueo de seguridad: un proyecto con tomas pagadas no puede reanudarse en modo demo porque podría sobrescribir su material.'
      );
    }
    return;
  }
  assertPaidGenerationAllowed('iniciar la producción');
  if (!hasUsableCredential('OPENAI_API_KEY')) {
    throw new ProductionSafetyError('Bloqueo de seguridad: falta una credencial utilizable de OpenAI para referencias visuales y auditoría.');
  }
  if (!hasUsableCredential('GEMINI_API_KEY') && !hasUsableCredential('FAL_KEY')) {
    throw new ProductionSafetyError('Bloqueo de seguridad: falta una credencial utilizable de Gemini o Fal para video.');
  }

  const plan = project?.plan;
  if (!plan) return;

  const multiSpeakerSpoken = plan.scenes.flatMap((scene) =>
    scene.shots
      .filter((shot) => Boolean(shot.spokenText.trim()) && hasMultipleDialogueSpeakers(shot))
      .map((shot) => `escena ${scene.order}/segmento ${shot.order}`)
  );
  if (multiSpeakerSpoken.length) {
    throw new ProductionSafetyError(
      `Segmentación de diálogo incompleta: ${multiSpeakerSpoken.length} segmento(s) contienen varios hablantes. ` +
      `${multiSpeakerSpoken.slice(0, 8).join(' | ')}. Divide cada turno en un segmento monohablante antes de habilitar gasto.`
    );
  }

  const unresolvedSpoken = plan.scenes.flatMap((scene) =>
    scene.shots
      .filter((shot) => Boolean(shot.spokenText.trim()) && !resolveSingleSpeakerId(shot))
      .map((shot) => `escena ${scene.order}/segmento ${shot.order}`)
  );
  if (unresolvedSpoken.length) {
    throw new ProductionSafetyError(
      `Casting de hablantes incompleto: ${unresolvedSpoken.length} segmento(s) con texto hablado no tienen un hablante único. ` +
      `${unresolvedSpoken.slice(0, 8).join(' | ')}. Resuelve el Speaker Lab antes de habilitar gasto.`
    );
  }

  const speakingCharacterIds = new Set(
    plan.scenes.flatMap((scene) => scene.shots)
      .map((shot) => resolveSingleSpeakerId(shot))
      .filter((speakerId): speakerId is string => Boolean(speakerId && speakerId !== 'narrator'))
  );
  const hasNarration = plan.scenes.some((scene) =>
    scene.shots.some((shot) => resolveSingleSpeakerId(shot) === 'narrator' && Boolean(shot.spokenText.trim()))
  );
  if (hasNarration) {
    if (!hasUsableCredential('ELEVENLABS_API_KEY')) {
      throw new ProductionSafetyError('Bloqueo de seguridad: existe narración pero falta ELEVENLABS_API_KEY.');
    }
    if (!isUsableCredentialValue(process.env.ELEVENLABS_NARRATOR_VOICE_ID)) {
      throw new ProductionSafetyError('Bloqueo de seguridad: existe narración pero falta ELEVENLABS_NARRATOR_VOICE_ID.');
    }
  }

  const missing: string[] = [];
  for (const characterId of speakingCharacterIds) {
    const character = plan.characters.find((item) => item.id === characterId);
    if (!character) {
      missing.push(`personaje desconocido (${characterId})`);
      continue;
    }
    const provider = character.voiceProvider || 'elevenlabs';
    if (provider === 'elevenlabs') {
      if (!hasUsableCredential('ELEVENLABS_API_KEY')) {
        missing.push(`${character.name}: falta ELEVENLABS_API_KEY`);
      } else if (!isUsableCredentialValue(character.voiceId)) {
        missing.push(`${character.name}: falta voiceId`);
      }
    } else if (provider === 'openai') {
      if (!hasUsableCredential('OPENAI_API_KEY')) missing.push(`${character.name}: falta OPENAI_API_KEY`);
    } else {
      missing.push(`${character.name}: proveedor offline no permitido en producción real`);
    }
  }
  if (missing.length) {
    throw new ProductionSafetyError(`Casting vocal incompleto: ${missing.slice(0, 8).join(' | ')}`);
  }
}

export function classifyProductionError(error: unknown): ProductionPauseKind {
  if (error instanceof ProductionSafetyError) return 'safety';
  const message = safeErrorMessage(error).toLowerCase();
  if (/\b429\b|insufficient[_ -]?quota|credit[_ -]?balance|no credits|billing|payment|required|resource[_ -]?exhausted|saldo|cuota/.test(message)) {
    return 'billing';
  }
  return 'technical';
}

export function safeErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Error desconocido';
  return raw
    .replace(/(?:sk|key|token|gho|ghp|AIza)[-_A-Za-z0-9.]{8,}/g, '[CREDENCIAL_OCULTA]')
    .replace(/(?:authorization|cookie|set-cookie)\s*[:=]\s*[^\s,;]+/gi, '$1=[OCULTO]')
    .slice(0, 1200);
}
