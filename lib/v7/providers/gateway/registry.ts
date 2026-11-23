import type { MediaProvider, ProviderCapabilities } from './contracts';

export type ProviderHealth = {
  providerId: string;
  successRate: number;
  averageQuality: number;
  averageLatencyMs: number;
  consecutiveSafeFailures: number;
  circuitOpen: boolean;
};

export class ProviderRegistry {
  private readonly providers = new Map<string, MediaProvider>();
  private readonly health = new Map<string, ProviderHealth>();

  register(provider: MediaProvider) {
    if (this.providers.has(provider.id)) throw new Error('Proveedor duplicado: ' + provider.id);
    this.providers.set(provider.id, provider);
  }

  get(providerId: string) {
    return this.providers.get(providerId);
  }

  async capabilities(providerId: string): Promise<ProviderCapabilities | undefined> {
    return this.providers.get(providerId)?.capabilities();
  }

  setHealth(state: ProviderHealth) {
    this.health.set(state.providerId, { ...state });
  }

  score(providerId: string, estimatedCostUsd: number) {
    const h = this.health.get(providerId);
    if (!h || h.circuitOpen) return Number.NEGATIVE_INFINITY;
    return h.successRate * 3 + h.averageQuality * 0.5 -
      Math.min(5, h.averageLatencyMs / 60000) -
      estimatedCostUsd * 2 - h.consecutiveSafeFailures;
  }
}
