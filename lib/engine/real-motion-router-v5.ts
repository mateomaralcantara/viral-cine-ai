import type { RealMotionProviderId, RealMotionShotSpec } from '@/lib/domain/schemas';

export type RealMotionGenerationRequest = {
  projectId: string;
  shotId: string;
  referenceImagePath?: string;
  prompt: string;
  durationSeconds: number;
  aspectRatio: '16:9' | '9:16';
  outputPath: string;
  motionSpec: RealMotionShotSpec;
};

export type RealMotionGenerationResult = {
  provider: RealMotionProviderId;
  outputPath: string;
  model?: string;
  attempt: number;
};

export type RealMotionProviderAdapter = {
  id: RealMotionProviderId;
  available: () => boolean | Promise<boolean>;
  generate: (request: RealMotionGenerationRequest) => Promise<{
    outputPath: string;
    model?: string;
  }>;
};

export type ProviderHealthState = {
  consecutiveSafeFailures: number;
  openedAtMs?: number;
};

export class SafeFailoverError extends Error {
  readonly safeToFailover = true;

  constructor(
    message: string,
    public readonly provider: RealMotionProviderId,
    public readonly reason:
      | 'quota'
      | 'rate-limit'
      | 'no-output'
      | 'unavailable'
      | 'auth-rejected'
      | 'validation-rejected'
  ) {
    super(message);
    this.name = 'SafeFailoverError';
  }
}

export class BillingRiskError extends Error {
  readonly safeToFailover = false;

  constructor(
    message: string,
    public readonly provider: RealMotionProviderId
  ) {
    super(message);
    this.name = 'BillingRiskError';
  }
}

export class RealMotionCircuitBreaker {
  private readonly states = new Map<RealMotionProviderId, ProviderHealthState>();

  constructor(
    private readonly failureThreshold = 3,
    private readonly cooldownSeconds = 900
  ) {}

  canUse(provider: RealMotionProviderId, nowMs = Date.now()) {
    const state = this.states.get(provider);
    if (!state?.openedAtMs) return true;
    return nowMs - state.openedAtMs >= this.cooldownSeconds * 1000;
  }

  success(provider: RealMotionProviderId) {
    this.states.set(provider, { consecutiveSafeFailures: 0 });
  }

  safeFailure(provider: RealMotionProviderId, nowMs = Date.now()) {
    const previous = this.states.get(provider) || { consecutiveSafeFailures: 0 };
    const nextFailures = previous.consecutiveSafeFailures + 1;
    this.states.set(provider, {
      consecutiveSafeFailures: nextFailures,
      ...(nextFailures >= this.failureThreshold ? { openedAtMs: nowMs } : {})
    });
  }

  snapshot() {
    return Object.fromEntries(this.states.entries());
  }
}

export async function generateWithRealMotionRouter(input: {
  request: RealMotionGenerationRequest;
  adapters: RealMotionProviderAdapter[];
  providerOrder: RealMotionProviderId[];
  circuitBreaker: RealMotionCircuitBreaker;
}): Promise<RealMotionGenerationResult> {
  const { request, adapters, providerOrder, circuitBreaker } = input;

  if (request.motionSpec.allowStillFallbackFinal !== false) {
    throw new Error(
      'FINAL_MODE inválido: una toma Real Motion 5.0 no puede permitir still-motion como fallback final.'
    );
  }

  const byId = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  const attempted: string[] = [];
  let attempt = 0;

  for (const providerId of providerOrder) {
    const adapter = byId.get(providerId);
    if (!adapter) {
      attempted.push(providerId + ':adapter-ausente');
      continue;
    }
    if (!circuitBreaker.canUse(providerId)) {
      attempted.push(providerId + ':circuit-open');
      continue;
    }
    if (!(await adapter.available())) {
      attempted.push(providerId + ':no-disponible');
      continue;
    }

    attempt += 1;
    try {
      const result = await adapter.generate(request);
      circuitBreaker.success(providerId);
      return {
        provider: providerId,
        outputPath: result.outputPath,
        model: result.model,
        attempt
      };
    } catch (error) {
      if (error instanceof SafeFailoverError) {
        circuitBreaker.safeFailure(providerId);
        attempted.push(providerId + ':' + error.reason);
        continue;
      }

      if (error instanceof BillingRiskError) throw error;

      throw new BillingRiskError(
        'El proveedor ' + providerId +
        ' falló con estado de cobro desconocido. La toma queda RETRY_PENDING y no se cambia automáticamente de proveedor. ' +
        messageOf(error),
        providerId
      );
    }
  }

  throw new Error(
    'REAL_MOTION_RETRY_PENDING: ningún proveedor de video temporal real pudo completar la toma. ' +
    'No se usará FFmpeg still-motion en FINAL. Intentos: ' +
    (attempted.join(', ') || 'ninguno')
  );
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
