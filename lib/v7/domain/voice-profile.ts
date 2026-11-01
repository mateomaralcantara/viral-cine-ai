import { z } from 'zod';
import { EntityIdSchema } from './common';

export const VoiceRightsStatusSchema = z.enum([
  'unknown',
  'owned',
  'licensed',
  'consented',
  'provider-stock',
  'restricted'
]);

export const VoiceProfileSchema = z.object({
  id: EntityIdSchema,
  actorLibraryId: EntityIdSchema.optional(),
  characterId: EntityIdSchema.optional(),
  provider: z.string().trim().min(1).max(120),
  providerVoiceId: z.string().trim().min(1).max(500).optional(),
  providerModel: z.string().trim().min(1).max(240).optional(),
  language: z.string().trim().min(1).max(80),
  accent: z.string().trim().min(1).max(160).optional(),
  ageProfile: z.string().trim().min(1).max(160).optional(),
  genderProfile: z.string().trim().min(1).max(160).optional(),
  timbre: z.string().max(2000).default(''),
  pitch: z.number().min(-24).max(24).optional(),
  speed: z.number().min(0.25).max(4).default(1),
  stability: z.number().min(0).max(1).optional(),
  similarity: z.number().min(0).max(1).optional(),
  emotionPresets: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  pronunciationDictionary: z.record(z.string(), z.string()).default({}),
  canonicalSampleAssetId: EntityIdSchema.optional(),
  previousApprovedSampleAssetId: EntityIdSchema.optional(),
  voiceVersion: z.number().int().positive().default(1),
  rightsStatus: VoiceRightsStatusSchema.default('unknown'),
  consentReference: z.string().max(4000).optional(),
  approved: z.boolean().default(false)
});

export type VoiceProfile = z.infer<typeof VoiceProfileSchema>;
