import type { FilmProject } from '@/lib/domain/schemas';

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
    throw new ProductionSafetyError('Bloqueo de seguridad: falta una credencial utilizable de OpenAI para imagen y voz.');
  }
  if (!hasUsableCredential('GEMINI_API_KEY') && !hasUsableCredential('FAL_KEY')) {
    throw new ProductionSafetyError('Bloqueo de seguridad: falta una credencial utilizable de Gemini o Fal para video.');
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
