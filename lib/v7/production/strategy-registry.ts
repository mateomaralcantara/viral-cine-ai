import { z } from 'zod';

export const ProductionStrategySchema = z.object({
  id: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(2000),
  requiresVisibleSpeaker: z.boolean().default(false),
  requiresAudioReference: z.boolean().default(false),
  requiresIdentityReference: z.boolean().default(true),
  maxFeaturedCharacters: z.number().int().min(0).max(20).default(3),
  continuityPriority: z.enum(['low', 'normal', 'high', 'critical']).default('high'),
  qualityCategories: z.array(z.string()).min(1),
  metadata: z.record(z.unknown()).default({})
});

export type ProductionStrategy = z.infer<typeof ProductionStrategySchema>;

export class ProductionStrategyRegistry {
  private readonly strategies = new Map<string, ProductionStrategy>();

  register(strategy: ProductionStrategy) {
    const parsed = ProductionStrategySchema.parse(strategy);
    if (this.strategies.has(parsed.id)) throw new Error('Estrategia duplicada: ' + parsed.id);
    this.strategies.set(parsed.id, parsed);
    return parsed;
  }

  get(id: string) {
    const strategy = this.strategies.get(id);
    if (!strategy) throw new Error('Estrategia no registrada: ' + id);
    return strategy;
  }

  list() {
    return [...this.strategies.values()];
  }
}

export function createDefaultStrategyRegistry() {
  const registry = new ProductionStrategyRegistry();
  registry.register({
    id: 'generic-cinematic',
    description: 'Plano cinematográfico general con continuidad de identidad.',
    requiresVisibleSpeaker: false,
    requiresAudioReference: false,
    requiresIdentityReference: true,
    maxFeaturedCharacters: 5,
    continuityPriority: 'high',
    qualityCategories: ['technical', 'identity', 'motion', 'continuity', 'cinematography'],
    metadata: {}
  });
  registry.register({
    id: 'dialogue-closeup',
    description: 'Primer plano de diálogo con voz, performance y lip-sync prioritarios.',
    requiresVisibleSpeaker: true,
    requiresAudioReference: true,
    requiresIdentityReference: true,
    maxFeaturedCharacters: 1,
    continuityPriority: 'critical',
    qualityCategories: ['technical', 'identity', 'lip-sync', 'audio', 'continuity', 'cinematography'],
    metadata: {}
  });
  registry.register({
    id: 'silent-establishing',
    description: 'Plano de establecimiento silencioso centrado en locación y continuidad visual.',
    requiresVisibleSpeaker: false,
    requiresAudioReference: false,
    requiresIdentityReference: false,
    maxFeaturedCharacters: 10,
    continuityPriority: 'high',
    qualityCategories: ['technical', 'motion', 'continuity', 'cinematography'],
    metadata: {}
  });
  return registry;
}
