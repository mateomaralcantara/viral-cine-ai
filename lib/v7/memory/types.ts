import { z } from 'zod';
import { EntityIdSchema } from '@/lib/v7/domain/common';
export const MemoryGraphSchema = z.object({
  nodes: z.record(z.record(z.unknown())).default({}),
  edges: z.array(z.object({
    from: EntityIdSchema,
    to: EntityIdSchema,
    type: z.string().trim().min(1).max(240),
    metadata: z.record(z.unknown()).default({})
  })).max(100000).default([])
});
export const MemoryCoreSchema = z.object({
  filmId: EntityIdSchema,
  narrativeGraph: MemoryGraphSchema,
  visualGraph: MemoryGraphSchema,
  audioGraph: MemoryGraphSchema,
  worldState: z.record(z.unknown()).default({}),
  assetIds: z.array(EntityIdSchema).max(100000).default([]),
  projectHistoryIds: z.array(EntityIdSchema).max(100000).default([])
});
export type MemoryGraph = z.infer<typeof MemoryGraphSchema>;
export type MemoryCore = z.infer<typeof MemoryCoreSchema>;
