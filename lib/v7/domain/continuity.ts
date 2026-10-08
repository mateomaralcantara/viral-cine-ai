import { z } from 'zod';
import { EntityIdSchema, JsonRecordSchema, TimestampSchema } from './common';

export const CharacterStateSchemaV7 = z.object({
  id: EntityIdSchema,
  characterId: EntityIdSchema,
  filmId: EntityIdSchema,
  label: z.string().trim().min(1).max(160),
  appearance: z.string().max(6000).default(''),
  hair: z.string().max(2000).default(''),
  makeup: z.string().max(2000).default(''),
  physicalCondition: z.string().max(4000).default(''),
  emotionalState: z.string().max(4000).default(''),
  injuries: z.array(z.string().max(1000)).max(100).default([]),
  wardrobeSetId: EntityIdSchema.optional(),
  locationId: EntityIdSchema.optional(),
  carryingPropIds: z.array(EntityIdSchema).max(200).default([]),
  referenceAssetIds: z.array(EntityIdSchema).max(100).default([]),
  createdAt: TimestampSchema
});

export const LocationSchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  name: z.string().trim().min(1).max(240),
  description: z.string().max(8000).default(''),
  canonicalReferenceAssetIds: z.array(EntityIdSchema).max(100).default([])
});

export const LocationStateSchema = z.object({
  id: EntityIdSchema,
  locationId: EntityIdSchema,
  filmId: EntityIdSchema,
  label: z.string().trim().min(1).max(240),
  condition: z.string().max(6000).default(''),
  lighting: z.string().max(4000).default(''),
  timeOfDay: z.string().max(120).optional(),
  referenceAssetIds: z.array(EntityIdSchema).max(100).default([]),
  createdAt: TimestampSchema
});

export const PropSchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  name: z.string().trim().min(1).max(240),
  description: z.string().max(4000).default('')
});

export const PropStateSchema = z.object({
  id: EntityIdSchema,
  propId: EntityIdSchema,
  filmId: EntityIdSchema,
  holderCharacterId: EntityIdSchema.optional(),
  locationId: EntityIdSchema.optional(),
  condition: z.string().max(2000).default(''),
  createdAt: TimestampSchema
});

export const WardrobeSetSchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  characterId: EntityIdSchema,
  name: z.string().trim().min(1).max(240),
  description: z.string().max(4000),
  referenceAssetIds: z.array(EntityIdSchema).max(100).default([])
});

export const RelationshipStateSchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  fromCharacterId: EntityIdSchema,
  toCharacterId: EntityIdSchema,
  label: z.string().trim().min(1).max(240),
  state: z.string().max(4000),
  createdAt: TimestampSchema
});

export const NarrativeStateSchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  sceneId: EntityIdSchema,
  facts: z.array(z.string().max(2000)).max(500).default([]),
  openQuestions: z.array(z.string().max(2000)).max(500).default([]),
  resolvedQuestions: z.array(z.string().max(2000)).max(500).default([]),
  createdAt: TimestampSchema
});

export const SceneStateSnapshotSchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  sceneId: EntityIdSchema,
  sequenceId: EntityIdSchema,
  timeIndex: z.number().nonnegative(),
  characters: z.record(EntityIdSchema).default({}),
  emotionalStates: z.record(z.string()).default({}),
  physicalStates: z.record(z.string()).default({}),
  injuries: z.record(z.array(z.string())).default({}),
  wardrobe: z.record(EntityIdSchema).default({}),
  props: z.record(JsonRecordSchema).default({}),
  locations: z.array(EntityIdSchema).max(100).default([]),
  lighting: z.string().max(4000).default(''),
  lastApprovedFrameAssetId: EntityIdSchema.optional(),
  lastApprovedVoiceAssetId: EntityIdSchema.optional(),
  continuityNotes: z.array(z.string().max(2000)).max(500).default([]),
  createdAt: TimestampSchema
});

export const ContinuityEventSchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  sceneId: EntityIdSchema,
  shotId: EntityIdSchema.optional(),
  entityType: z.enum(['character', 'location', 'prop', 'wardrobe', 'voice', 'relationship', 'narrative']),
  entityId: EntityIdSchema,
  eventType: z.string().trim().min(1).max(240),
  payload: JsonRecordSchema,
  effectiveFrom: z.number().nonnegative(),
  createdAt: TimestampSchema
});

export type CharacterStateV7 = z.infer<typeof CharacterStateSchemaV7>;
export type Location = z.infer<typeof LocationSchema>;
export type LocationState = z.infer<typeof LocationStateSchema>;
export type Prop = z.infer<typeof PropSchema>;
export type PropState = z.infer<typeof PropStateSchema>;
export type WardrobeSet = z.infer<typeof WardrobeSetSchema>;
export type RelationshipState = z.infer<typeof RelationshipStateSchema>;
export type NarrativeState = z.infer<typeof NarrativeStateSchema>;
export type SceneStateSnapshot = z.infer<typeof SceneStateSnapshotSchema>;
export type ContinuityEvent = z.infer<typeof ContinuityEventSchema>;
