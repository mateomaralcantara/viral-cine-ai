import { z } from 'zod';
import { EntityIdSchema, TimestampSchema } from './common';

export const AssetTypeSchema = z.enum([
  'image',
  'video',
  'audio',
  'voice',
  'music',
  'sfx',
  'subtitle',
  'timeline',
  'manifest',
  'quality-report',
  'reference',
  'master'
]);

export const AssetSourceSchema = z.enum([
  'generated',
  'uploaded',
  'derived',
  'legacy-v6',
  'imported',
  'local'
]);

export const AssetSchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  type: AssetTypeSchema,
  storagePath: z.string().trim().min(1).max(4000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  mimeType: z.string().trim().min(1).max(180).optional(),
  bytes: z.number().int().nonnegative().optional(),
  durationSeconds: z.number().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  source: AssetSourceSchema,
  provider: z.string().trim().min(1).max(120).optional(),
  providerTaskId: z.string().trim().min(1).max(500).optional(),
  generationJobId: EntityIdSchema.optional(),
  characterId: EntityIdSchema.optional(),
  sceneId: EntityIdSchema.optional(),
  shotId: EntityIdSchema.optional(),
  takeId: EntityIdSchema.optional(),
  version: z.number().int().positive().default(1),
  approved: z.boolean().default(false),
  createdAt: TimestampSchema
});

export type Asset = z.infer<typeof AssetSchema>;
export type AssetType = z.infer<typeof AssetTypeSchema>;
