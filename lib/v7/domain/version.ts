import { z } from 'zod';
import { EntityIdSchema, TimestampSchema, VersionStatusSchema } from './common';

export const FilmVersionSchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  label: z.string().trim().min(1).max(160),
  versionNumber: z.number().int().positive(),
  parentVersionId: EntityIdSchema.optional(),
  status: VersionStatusSchema,
  timelineVersionId: EntityIdSchema.optional(),
  changeSummary: z.string().max(12000).default(''),
  createdBy: z.string().trim().min(1).max(240),
  createdAt: TimestampSchema
});

export const TimelineVersionSchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  timelineId: EntityIdSchema,
  label: z.string().trim().min(1).max(160),
  versionNumber: z.number().int().positive(),
  parentVersionId: EntityIdSchema.optional(),
  status: VersionStatusSchema,
  createdAt: TimestampSchema
});

export const AssetVersionSchema = z.object({
  id: EntityIdSchema,
  assetId: EntityIdSchema,
  versionNumber: z.number().int().positive(),
  previousVersionId: EntityIdSchema.optional(),
  storagePath: z.string().trim().min(1).max(4000),
  createdAt: TimestampSchema
});

export type FilmVersion = z.infer<typeof FilmVersionSchema>;
export type TimelineVersion = z.infer<typeof TimelineVersionSchema>;
export type AssetVersion = z.infer<typeof AssetVersionSchema>;
