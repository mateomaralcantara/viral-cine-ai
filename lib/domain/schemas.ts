import { z } from 'zod';

export const AspectRatioSchema = z.enum(['16:9', '9:16']);
export const ProjectStatusSchema = z.enum([
  'draft',
  'planning',
  'planned',
  'queued',
  'producing',
  'quality-review',
  'paused-billing',
  'paused-safety',
  'composing',
  'ready',
  'failed',
  'cancelled'
]);
export const SceneModeSchema = z.enum(['ai-video', 'animated-image', 'avatar']);
export const SceneStatusSchema = z.enum(['pending', 'rendering', 'review-required', 'ready', 'failed']);
export const ShotModeSchema = z.enum(['video', 'avatar-video']);
export const VoiceProviderSchema = z.enum(['elevenlabs', 'openai', 'offline']);

export const DialogueLineSchema = z.object({
  id: z.string(),
  speakerId: z.string(),
  text: z.string(),
  emotion: z.string().optional(),
  startSeconds: z.number().nonnegative().default(0),
  endSeconds: z.number().nonnegative().optional()
});

export const SceneDialogueTurnSchema = z.object({
  speakerId: z.string(),
  text: z.string(),
  emotion: z.string().optional()
});

export const FilmShotSchema = z.object({
  id: z.string(),
  order: z.number().int().positive(),
  title: z.string(),
  durationSeconds: z.number().int().min(4).max(8),
  visualPrompt: z.string(),
  camera: z.string(),
  spokenText: z.string(),
  speakerId: z.string().optional(),
  dialogueLines: z.array(DialogueLineSchema).max(4).default([]),
  mode: ShotModeSchema,
  characterIds: z.array(z.string()).max(3).default([]),
  preflightVersion: z.number().int().positive().optional(),
  preflightScore: z.number().min(0).max(10).optional(),
  preflightIssues: z.array(z.string()).optional(),
  promptLocked: z.boolean().optional(),
  status: SceneStatusSchema.default('pending'),
  imageAsset: z.string().optional(),
  voiceAsset: z.string().optional(),
  alignmentAsset: z.string().optional(),
  baseVideoAsset: z.string().optional(),
  lipSyncAsset: z.string().optional(),
  videoAsset: z.string().optional(),
  pipelineVersion: z.string().optional(),
  qualityScore: z.number().min(0).max(10).optional(),
  qualityAttempts: z.number().int().nonnegative().optional(),
  qualityIssues: z.array(z.string()).optional(),
  qualityReportAsset: z.string().optional(),
  qualityOverrideApproved: z.boolean().optional(),
  qualityForceRegenerate: z.boolean().optional(),
  generationCount: z.number().int().nonnegative().optional(),
  estimatedSpendUsd: z.number().nonnegative().optional(),
  lastProvider: z.string().optional(),
  lastGenerationState: z.enum(['reserved', 'succeeded', 'failed-unknown']).optional(),
  lastGenerationAt: z.string().optional(),
  error: z.string().optional()
});

export const ProjectInputSchema = z.object({
  title: z.string().trim().min(3).max(120),
  premise: z.string().trim().min(20).max(6000),
  durationMinutes: z.number().int().min(5).max(120),
  genre: z.string().trim().min(2).max(80),
  audience: z.string().trim().min(2).max(160),
  visualStyle: z.string().trim().min(2).max(240),
  language: z.enum(['es', 'en']).default('es'),
  aspectRatio: AspectRatioSchema.default('16:9'),
  budgetUsd: z.number().min(5).max(150),
  burnSubtitles: z.boolean().default(true),
  generateMusic: z.boolean().default(true)
});

export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  age: z.number().int().min(1).max(120),
  appearance: z.string(),
  wardrobe: z.string(),
  personality: z.string(),
  voiceInstructions: z.string(),
  voiceProvider: VoiceProviderSchema.default('elevenlabs'),
  voiceId: z.string().optional(),
  voiceModel: z.string().optional(),
  voiceStability: z.number().min(0).max(1).optional(),
  voiceSimilarity: z.number().min(0).max(1).optional(),
  voiceStyle: z.number().min(0).max(1).optional(),
  voiceSpeed: z.number().min(0.7).max(1.2).optional(),
  imagePrompt: z.string(),
  referenceAsset: z.string().optional()
});

export const SceneSchema = z.object({
  id: z.string(),
  order: z.number().int().positive(),
  act: z.number().int().min(1).max(5),
  title: z.string(),
  durationSeconds: z.number().int().min(5).max(90),
  summary: z.string(),
  narration: z.string(),
  dialogue: z.string(),
  dialogueTurns: z.array(SceneDialogueTurnSchema).max(32).default([]),
  visualPrompt: z.string(),
  negativePrompt: z.string(),
  camera: z.string(),
  soundDesign: z.string(),
  transition: z.string(),
  mode: SceneModeSchema,
  characterIds: z.array(z.string()),
  shots: z.array(FilmShotSchema).max(24).default([]),
  status: SceneStatusSchema.default('pending'),
  imageAsset: z.string().optional(),
  voiceAsset: z.string().optional(),
  videoAsset: z.string().optional(),
  qualityScore: z.number().min(0).max(10).optional(),
  qualityAttempts: z.number().int().nonnegative().optional(),
  qualityIssues: z.array(z.string()).optional(),
  qualityReportAsset: z.string().optional(),
  qualityOverrideApproved: z.boolean().optional(),
  productionStrategy: z.enum(['video-shots-v1', 'real-cinema-v2']).optional(),
  error: z.string().optional()
});

export const FilmPlanSchema = z.object({
  logline: z.string(),
  synopsis: z.string(),
  creativeDirection: z.string(),
  musicPrompt: z.string(),
  characters: z.array(CharacterSchema).min(1).max(8),
  scenes: z.array(SceneSchema).min(12).max(120)
});

export const BudgetSchema = z.object({
  targetUsd: z.number(),
  estimatedUsd: z.number(),
  withinBudget: z.boolean(),
  breakdown: z.object({
    script: z.number(),
    images: z.number(),
    voice: z.number(),
    video: z.number(),
    lipSync: z.number().default(0),
    avatars: z.number(),
    music: z.number(),
    quality: z.number().default(0)
  }),
  notes: z.array(z.string())
});

export const ProgressSchema = z.object({
  phase: z.string(),
  percent: z.number().min(0).max(100),
  message: z.string(),
  currentScene: z.number().int().nonnegative().optional(),
  totalScenes: z.number().int().nonnegative().optional(),
  updatedAt: z.string()
});

export const PilotSchema = z.object({
  enabled: z.boolean().default(true),
  maxScenes: z.number().int().min(1).max(3).default(1),
  maxShotsPerScene: z.number().int().min(1).max(6).default(4),
  maxSpendUsd: z.number().min(0.1).max(10).default(1),
  approvedForFullProduction: z.boolean().default(false)
});

export const FilmProjectSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: ProjectStatusSchema,
  input: ProjectInputSchema,
  plan: FilmPlanSchema.optional(),
  budget: BudgetSchema.optional(),
  pilot: PilotSchema.optional(),
  progress: ProgressSchema,
  finalVideoAsset: z.string().optional(),
  subtitleAsset: z.string().optional(),
  musicAsset: z.string().optional(),
  productionLog: z.array(z.string()),
  error: z.string().optional()
});

export type ProjectInput = z.infer<typeof ProjectInputSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type DialogueLine = z.infer<typeof DialogueLineSchema>;
export type SceneDialogueTurn = z.infer<typeof SceneDialogueTurnSchema>;
export type FilmScene = z.infer<typeof SceneSchema>;
export type FilmShot = z.infer<typeof FilmShotSchema>;
export type FilmPlan = z.infer<typeof FilmPlanSchema>;
export type BudgetEstimate = z.infer<typeof BudgetSchema>;
export type FilmProject = z.infer<typeof FilmProjectSchema>;
export type SceneMode = z.infer<typeof SceneModeSchema>;
export type ShotMode = z.infer<typeof ShotModeSchema>;
