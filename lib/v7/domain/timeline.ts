import { z } from 'zod';
import { EntityIdSchema } from './common';

export const TrackTypeSchema = z.enum([
  'video',
  'dialogue',
  'adr',
  'ambience',
  'foley',
  'sfx',
  'music',
  'subtitle',
  'title'
]);

export const TimelineClipSchema = z.object({
  id: EntityIdSchema,
  trackId: EntityIdSchema,
  assetId: EntityIdSchema,
  sourceStartSeconds: z.number().nonnegative().default(0),
  sourceDurationSeconds: z.number().positive(),
  timelineStartSeconds: z.number().nonnegative(),
  timelineDurationSeconds: z.number().positive(),
  shotId: EntityIdSchema.optional(),
  takeId: EntityIdSchema.optional(),
  gainDb: z.number().min(-96).max(24).default(0),
  metadata: z.record(z.unknown()).default({})
});

export const TransitionSchema = z.object({
  id: EntityIdSchema,
  type: z.enum(['cut', 'crossfade', 'fade-in', 'fade-out', 'dip-to-black', 'custom']),
  durationSeconds: z.number().nonnegative().default(0),
  fromClipId: EntityIdSchema.optional(),
  toClipId: EntityIdSchema.optional()
});

export const TrackSchema = z.object({
  id: EntityIdSchema,
  timelineId: EntityIdSchema,
  type: TrackTypeSchema,
  order: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(160),
  clips: z.array(TimelineClipSchema).max(10000).default([])
});

export const TimelineSchema = z.object({
  id: EntityIdSchema,
  filmId: EntityIdSchema,
  name: z.string().trim().min(1).max(240),
  frameRate: z.number().positive().max(120).default(24),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  tracks: z.array(TrackSchema).max(100).default([]),
  transitions: z.array(TransitionSchema).max(10000).default([]),
  metadata: z.record(z.unknown()).default({})
});

export type Timeline = z.infer<typeof TimelineSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type TimelineClip = z.infer<typeof TimelineClipSchema>;
export type Transition = z.infer<typeof TransitionSchema>;
