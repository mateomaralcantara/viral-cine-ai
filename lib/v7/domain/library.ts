import { z } from 'zod';
import { EntityIdSchema, TimestampSchema } from './common';

export const ActorLibraryEntrySchema = z.object({
  id: EntityIdSchema,
  displayName: z.string().trim().min(1).max(240),
  faceReferenceAssetIds: z.array(EntityIdSchema).max(100).default([]),
  bodyReferenceAssetIds: z.array(EntityIdSchema).max(100).default([]),
  voiceProfileIds: z.array(EntityIdSchema).max(100).default([]),
  rightsStatus: z.enum(['unknown', 'owned', 'licensed', 'consented', 'restricted']).default('unknown'),
  consentReference: z.string().max(4000).optional(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema
});

export const FilmLibraryEntrySchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  title: z.string().trim().min(1).max(240),
  finalVersionId: EntityIdSchema.optional(),
  masterAssetIds: z.array(EntityIdSchema).max(100).default([]),
  reusableAssetIds: z.array(EntityIdSchema).max(100000).default([]),
  status: z.enum(['development', 'production', 'post', 'approved', 'released', 'archived']),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema
});

export type ActorLibraryEntry = z.infer<typeof ActorLibraryEntrySchema>;
export type FilmLibraryEntry = z.infer<typeof FilmLibraryEntrySchema>;
