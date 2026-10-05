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

const VoiceSettingsShape = {
  voiceInstructions: z.string().default(''),
  voiceProvider: VoiceProviderSchema.default('elevenlabs'),
  voiceId: z.string().optional(),
  voiceModel: z.string().optional(),
  voiceStability: z.number().min(0).max(1).optional(),
  voiceSimilarity: z.number().min(0).max(1).optional(),
  voiceStyle: z.number().min(0).max(1).optional(),
  voiceSpeed: z.number().min(0.7).max(1.2).optional()
};

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


export const MusicCueSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1).max(120),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().positive(),
  emotion: z.string().trim().min(2).max(120),
  intensity: z.number().min(0).max(1),
  tempoBpm: z.number().int().min(30).max(180).optional(),
  instrumentation: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  motif: z.string().trim().min(2).max(240),
  prompt: z.string().trim().min(20).max(3000),
  dialogueDuckDb: z.number().min(-24).max(0).default(-8),
  allowSilenceBeforeSeconds: z.number().min(0).max(20).default(0),
  emotionalPeak: z.boolean().default(false),
  noVocals: z.boolean().default(true)
}).superRefine((cue, ctx) => {
  if (cue.endSeconds <= cue.startSeconds) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endSeconds'],
      message: 'endSeconds debe ser mayor que startSeconds.'
    });
  }
});

export const MusicPlanSchema = z.object({
  version: z.literal('5.0-emotional-score-v1').default('5.0-emotional-score-v1'),
  title: z.string().trim().min(1).max(120),
  objective: z.string().trim().min(20).max(1000),
  masterMotif: z.string().trim().min(10).max(600),
  rules: z.array(z.string().trim().min(3).max(300)).min(1).max(24),
  cues: z.array(MusicCueSchema).min(1).max(64)
});


export const RealMotionProviderIdSchema = z.enum([
  'veo',
  'fal-video',
  'runway',
  'seedance',
  'wan'
]);

export const CharacterEvolutionStateSchema = z.object({
  id: z.string(),
  label: z.string().trim().min(1).max(80),
  narrativeStage: z.string().trim().min(2).max(180),
  appearance: z.string().trim().min(10).max(1200),
  wardrobe: z.string().trim().min(5).max(800),
  physicalCondition: z.string().trim().min(2).max(500),
  performanceNotes: z.string().trim().min(2).max(600),
  referenceAsset: z.string().optional()
});

export const CharacterBibleEntrySchema = z.object({
  characterId: z.string(),
  name: z.string().trim().min(1).max(100),
  identityLock: z.string().trim().min(20).max(1800),
  immutableTraits: z.array(z.string().trim().min(2).max(220)).min(3).max(20),
  forbiddenDrift: z.array(z.string().trim().min(2).max(220)).min(1).max(20),
  masterReferenceAsset: z.string().optional(),
  identityApproved: z.boolean().optional(),
  identityApprovedAt: z.string().optional(),
  states: z.array(CharacterEvolutionStateSchema).min(1).max(8)
});

export const RealMotionShotSpecSchema = z.object({
  version: z.literal('5.0-real-motion-v1').default('5.0-real-motion-v1'),
  intention: z.string().trim().min(5).max(600),
  startState: z.string().trim().min(5).max(800),
  endState: z.string().trim().min(5).max(800),
  bodyMotion: z.string().trim().min(5).max(1000),
  environmentMotion: z.string().trim().min(5).max(1000),
  cameraMotion: z.string().trim().min(5).max(800),
  shotClass: z.enum(['hero', 'standard', 'dialogue', 'transition', 'micro']),
  preferredProviders: z.array(RealMotionProviderIdSchema).min(1).max(5),
  minMotionScore: z.number().min(0).max(10).default(8),
  minIdentityScore: z.number().min(0).max(10).default(9),
  minContinuityScore: z.number().min(0).max(10).default(8),
  minAnatomyScore: z.number().min(0).max(10).default(8),
  minCameraScore: z.number().min(0).max(10).default(8),
  allowStillFallbackFinal: z.literal(false).default(false)
});

export const RealMotionPlanSchema = z.object({
  version: z.literal('5.0-real-motion-v1').default('5.0-real-motion-v1'),
  finalMode: z.literal('real-motion').default('real-motion'),
  allowStillFallbackFinal: z.literal(false).default(false),
  providerOrder: z.array(RealMotionProviderIdSchema).min(2).max(5),
  circuitBreaker: z.object({
    failureThreshold: z.number().int().min(1).max(10).default(3),
    cooldownSeconds: z.number().int().min(30).max(3600).default(900)
  }),
  pilotShotIds: z.array(z.string()).min(1).max(24),
  characterBible: z.array(CharacterBibleEntrySchema).min(1).max(12),
  qualityRule: z.string().trim().min(10).max(1000)
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
  motionSpec: RealMotionShotSpecSchema.optional(),
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
  ...VoiceSettingsShape,
  imagePrompt: z.string(),
  referenceAsset: z.string().optional()
});

export const SupportVoiceSchema = z.object({
  id: z.string(),
  label: z.string().trim().min(1).max(80),
  ...VoiceSettingsShape,
  source: z.enum(['legacy-support', 'manual']).default('legacy-support')
});

export const NarratorVoiceSchema = z.object({
  id: z.literal('narrator').default('narrator'),
  label: z.literal('Narrador').default('Narrador'),
  ...VoiceSettingsShape
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
  musicPlan: MusicPlanSchema.optional(),
  realMotion: RealMotionPlanSchema.optional(),
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
  narratorVoice: NarratorVoiceSchema.optional(),
  supportVoices: z.array(SupportVoiceSchema).max(24).optional(),
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
export type SupportVoice = z.infer<typeof SupportVoiceSchema>;
export type NarratorVoice = z.infer<typeof NarratorVoiceSchema>;
export type DialogueLine = z.infer<typeof DialogueLineSchema>;
export type SceneDialogueTurn = z.infer<typeof SceneDialogueTurnSchema>;
export type MusicCue = z.infer<typeof MusicCueSchema>;
export type MusicPlan = z.infer<typeof MusicPlanSchema>;
export type RealMotionProviderId = z.infer<typeof RealMotionProviderIdSchema>;
export type CharacterEvolutionState = z.infer<typeof CharacterEvolutionStateSchema>;
export type CharacterBibleEntry = z.infer<typeof CharacterBibleEntrySchema>;
export type RealMotionShotSpec = z.infer<typeof RealMotionShotSpecSchema>;
export type RealMotionPlan = z.infer<typeof RealMotionPlanSchema>;
export type FilmScene = z.infer<typeof SceneSchema>;
export type FilmShot = z.infer<typeof FilmShotSchema>;
export type FilmPlan = z.infer<typeof FilmPlanSchema>;
export type BudgetEstimate = z.infer<typeof BudgetSchema>;
export type FilmProject = z.infer<typeof FilmProjectSchema>;
export type SceneMode = z.infer<typeof SceneModeSchema>;
export type ShotMode = z.infer<typeof ShotModeSchema>;
