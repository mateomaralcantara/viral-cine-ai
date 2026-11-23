import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadProjectLocalEnvOverride } from '@/lib/env/local-env';
import { generateSpeech } from '@/lib/providers/openai-media';
import { generateFalLipSync } from '@/lib/providers/fal-media';
import { normalizeGeneratedVideoWithEmbeddedAudio } from '@/lib/media/ffmpeg';
import { publishSceneVideo, saveShotCheckpoint } from '@/lib/engine/scene-checkpoints';
import { appendSpend, assertSpendRetrySafe, estimateOperationCost, reservedMovieSpend, voiceCostUnits } from '@/lib/engine/spend-ledger';
import { safeErrorMessage } from '@/lib/engine/production-safety';
import { assetAbsolutePath, assetRelativePath, getProject, projectAssetDir, saveProject } from '@/lib/storage/project-store';

loadProjectLocalEnvOverride();

const [projectId] = process.argv.slice(2);
if (!projectId) {
  console.error('Uso: npm run pilot:repair-t5-voice -- <projectId>');
  process.exit(1);
}

const project = await getProject(projectId);
if (project.input.title.trim().toLocaleUpperCase() !== '15 DÍAS') {
  throw new Error('Este comando solo está autorizado para el proyecto 15 DÍAS.');
}
if (!project.plan) throw new Error('El proyecto no tiene plan.');

const scene = project.plan.scenes[0];
const shot = scene?.shots.find((item) => item.id === 'pilot-15d-05');
const raul = project.plan.characters.find((item) => item.id === 'char-v5-raul-0002');

if (!scene || !shot || !raul) throw new Error('No encuentro E1/T5 o el perfil de Raúl.');
if (project.status !== 'quality-review' || shot.status !== 'review-required') {
  throw new Error('T5 solo puede corregirse desde quality-review/review-required.');
}
if (!shot.baseVideoAsset || !shot.videoAsset || !shot.imageAsset) {
  throw new Error('T5 no tiene video base/final/imagen completos para reparar sin regenerar video.');
}

const exactText = 'Esto se terminó, Elena.';
shot.spokenText = exactText;
if (shot.dialogueLines?.length) {
  shot.dialogueLines = shot.dialogueLines.map((line, index) => index === 0 ? { ...line, text: exactText, speakerId: raul.id, emotion: 'frío y evitativo, no agresivo' } : line);
}
shot.speakerId = raul.id;

raul.voiceProvider = 'openai';
raul.voiceId = 'onyx';
raul.voiceInstructions = [
  'Habla exactamente el texto de entrada en español latino neutro.',
  'No traduzcas, no parafrasees, no agregues y no omitas ninguna palabra.',
  'Voz inequívocamente masculina de un hombre latino adulto de unos 40 años.',
  'Timbre medio-grave, contenido, seguro, natural y cinematográfico.',
  'No uses voz femenina, aniñada, aguda ni caricaturesca.'
].join(' ');

const videoDir = projectAssetDir(project.id, 'video');
const audioDir = projectAssetDir(project.id, 'audio');
const rejectedDir = path.join(videoDir, 'rejected');
await mkdir(rejectedDir, { recursive: true });
await mkdir(audioDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const basePath = assetAbsolutePath(project.id, shot.baseVideoAsset);
const finalPath = assetAbsolutePath(project.id, shot.videoAsset);
const canonicalVoice = shot.voiceAsset ? assetAbsolutePath(project.id, shot.voiceAsset) : path.join(audioDir, 'scene-001-shot-05.mp3');
const canonicalAlignment = path.join(audioDir, 'scene-001-shot-05.alignment.json');
const canonicalLipSync = shot.lipSyncAsset ? assetAbsolutePath(project.id, shot.lipSyncAsset) : path.join(videoDir, 'scene-001-shot-05-lipsync-raw.mp4');

const rejectedFinal = path.join(rejectedDir, 'scene-001-shot-05-wrong-voice-' + stamp + '.mp4');
await copyFile(finalPath, rejectedFinal);

const newVoice = path.join(audioDir, 'scene-001-shot-05-raul-onyx-' + stamp + '.mp3');
const newAlignment = path.join(audioDir, 'scene-001-shot-05-raul-onyx-' + stamp + '.alignment.json');
const newLipSync = path.join(videoDir, 'scene-001-shot-05-raul-onyx-lipsync-' + stamp + '.mp4');
const partialFinal = path.join(videoDir, 'scene-001-shot-05-raul-onyx-' + stamp + '.partial.mp4');

const voiceEstimate = estimateOperationCost('voice', voiceCostUnits(exactText));
const lipSyncEstimate = estimateOperationCost('lip-sync', shot.durationSeconds);
const currentSpend = await reservedMovieSpend(project.id);
const projectedSpend = Math.ceil((currentSpend + voiceEstimate + lipSyncEstimate) * 10000) / 10000;

if (projectedSpend > project.input.budgetUsd) {
  throw new Error('Corrección bloqueada: excedería el presupuesto total del proyecto.');
}

const voiceKey = 'voice-repair:pilot-15d-05:raul-onyx-es-v1';
const lipKey = 'lip-sync-repair:pilot-15d-05:raul-onyx-es-v1';
await assertSpendRetrySafe(project.id, voiceKey, 'voz masculina T5');
await assertSpendRetrySafe(project.id, lipKey, 'lip-sync T5 con voz masculina');

await appendSpend(project.id, {
  operation: 'voice', provider: 'openai', model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
  state: 'submitted', estimatedUsd: voiceEstimate, sceneId: scene.id, shotId: shot.id, characterId: raul.id, idempotencyKey: voiceKey
});

try {
  await generateSpeech(exactText, raul.voiceInstructions, newVoice, 'onyx');
  await writeFile(newAlignment, JSON.stringify({ provider: 'openai', speakerId: raul.id, text: exactText, voice: 'onyx', exactText: true, alignment: null }, null, 2) + '\n', 'utf8');
  await appendSpend(project.id, {
    operation: 'voice', provider: 'openai', model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
    state: 'succeeded', estimatedUsd: voiceEstimate, sceneId: scene.id, shotId: shot.id, characterId: raul.id, idempotencyKey: voiceKey, outputAsset: newVoice
  });
} catch (error) {
  await appendSpend(project.id, {
    operation: 'voice', provider: 'openai', model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
    state: 'failed-unknown', estimatedUsd: voiceEstimate, sceneId: scene.id, shotId: shot.id, characterId: raul.id, idempotencyKey: voiceKey, error: safeErrorMessage(error)
  });
  throw error;
}

process.env.FAL_LIPSYNC_SYNC_MODE = 'silence';
await appendSpend(project.id, {
  operation: 'lip-sync', provider: 'fal', model: process.env.FAL_LIPSYNC_MODEL || 'fal-ai/sync-lipsync/v3',
  state: 'reserved', estimatedUsd: lipSyncEstimate, sceneId: scene.id, shotId: shot.id, idempotencyKey: lipKey
});
await appendSpend(project.id, {
  operation: 'lip-sync', provider: 'fal', model: process.env.FAL_LIPSYNC_MODEL || 'fal-ai/sync-lipsync/v3',
  state: 'submitted', estimatedUsd: lipSyncEstimate, sceneId: scene.id, shotId: shot.id, idempotencyKey: lipKey
});

try {
  await generateFalLipSync(basePath, newVoice, newLipSync);
  await appendSpend(project.id, {
    operation: 'lip-sync', provider: 'fal', model: process.env.FAL_LIPSYNC_MODEL || 'fal-ai/sync-lipsync/v3',
    state: 'succeeded', estimatedUsd: lipSyncEstimate, sceneId: scene.id, shotId: shot.id, idempotencyKey: lipKey, outputAsset: newLipSync
  });
} catch (error) {
  await appendSpend(project.id, {
    operation: 'lip-sync', provider: 'fal', model: process.env.FAL_LIPSYNC_MODEL || 'fal-ai/sync-lipsync/v3',
    state: 'failed-unknown', estimatedUsd: lipSyncEstimate, sceneId: scene.id, shotId: shot.id, idempotencyKey: lipKey, error: safeErrorMessage(error)
  });
  throw error;
}

try {
  await normalizeGeneratedVideoWithEmbeddedAudio(newLipSync, shot.durationSeconds, partialFinal, project.input.aspectRatio);
  await publishSceneVideo(partialFinal, finalPath, shot.durationSeconds, { requireAudibleAudio: true, requireMotion: true });
  await copyFile(newVoice, canonicalVoice);
  await copyFile(newAlignment, canonicalAlignment);
  await copyFile(newLipSync, canonicalLipSync);
} finally {
  await rm(partialFinal, { force: true });
}

shot.voiceAsset = assetRelativePath(project.id, canonicalVoice);
shot.alignmentAsset = assetRelativePath(project.id, canonicalAlignment);
shot.lipSyncAsset = assetRelativePath(project.id, canonicalLipSync);
shot.videoAsset = assetRelativePath(project.id, finalPath);
shot.qualityScore = undefined;
shot.qualityAttempts = undefined;
shot.qualityIssues = undefined;
shot.qualityReportAsset = undefined;
shot.qualityOverrideApproved = false;
shot.qualityForceRegenerate = false;
shot.safeFailoverResume = false;
shot.status = 'review-required';
shot.error = 'T5 corregida: texto español exacto + voz masculina Raúl (OpenAI onyx) + lip-sync nuevo. Revisión manual requerida.';

scene.status = 'review-required';
scene.qualityScore = undefined;
scene.qualityAttempts = undefined;
scene.qualityIssues = undefined;
scene.qualityReportAsset = undefined;
scene.qualityOverrideApproved = false;
scene.error = 'E1/T5 corregida por idioma/voz; revisión manual requerida.';

project.status = 'quality-review';
project.error = undefined;
const now = new Date().toISOString();
project.progress = { phase: 'quality-review', percent: 16, message: 'Revisa E1/T5: español exacto, voz masculina de Raúl y lip-sync corregido.', currentScene: 1, totalScenes: project.plan.scenes.length, updatedAt: now };
project.productionLog.push(
  now + ' E1/T5 rechazada manualmente por traducción/idioma incorrecto y voz femenina en Raúl.',
  now + ' T5 corregida reutilizando imagen y video base. Texto bloqueado: “Esto se terminó, Elena.” Voz Raúl: OpenAI onyx + instrucciones masculinas + sin traducción.',
  now + ' Lip-sync T5 regenerado con la nueva voz y audio embebido preservado.'
);

await saveShotCheckpoint(project, scene, shot, { mode: shot.mode, imageAsset: shot.imageAsset, voiceAsset: shot.voiceAsset, videoAsset: shot.videoAsset });
const saved = await saveProject(project);

console.log('\n==================================================');
console.log(' VIRALCINE — T5 CORREGIDA: IDIOMA + VOZ RAUL');
console.log('==================================================');
console.log('Texto exacto: ' + exactText);
console.log('Traducción/paráfrasis: PROHIBIDA');
console.log('Voz OpenAI: onyx');
console.log('Perfil: masculino adulto latino, medio-grave');
console.log('Imagen: REUTILIZADA');
console.log('Video base Fal: REUTILIZADO');
console.log('Nueva generación de video base: NO');
console.log('Lip-sync: REGENERADO con la nueva voz');
console.log('Gasto previo estimado: US$' + currentSpend.toFixed(4));
console.log('Corrección voz estimada: US$' + voiceEstimate.toFixed(4));
console.log('Corrección lip-sync estimada: US$' + lipSyncEstimate.toFixed(4));
console.log('Gasto proyectado: US$' + projectedSpend.toFixed(4));
console.log('Estado: ' + saved.status);
console.log('T5_VOICE_FIX=REVIEW_REQUIRED');
console.log('Final anterior preservado: ' + rejectedFinal);
