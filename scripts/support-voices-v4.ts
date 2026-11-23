import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { applySupportVoiceRegistry, previewSupportVoiceRegistry } from '../lib/engine/support-voice-registry-v4';
import { dataRoot, getProject, projectRoot, updateProject } from '../lib/storage/project-store';

const [, , command, projectId, confirmation] = process.argv;
if (!command || !projectId || !['preview', 'apply'].includes(command)) usage();

if (command === 'preview') {
  printPreview(previewSupportVoiceRegistry(await getProject(projectId)));
  printSafety();
  process.exit(0);
}

if (confirmation !== '--confirm') {
  throw new Error('Para registrar voces secundarias debes añadir --confirm. Ejecuta preview primero.');
}

const current = await getProject(projectId);
if (['planning', 'queued', 'producing', 'composing'].includes(current.status)) {
  throw new Error(`No se puede modificar casting mientras el proyecto está en estado ${current.status}.`);
}
const before = previewSupportVoiceRegistry(current);
if (!before.missingLabels.length) {
  console.log('No hay voces secundarias nuevas por registrar. No se modificó el proyecto.');
  printPreview(before);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(dataRoot(), 'backups', `support-voice-registry-${stamp}`, projectId);
await mkdir(backupDir, { recursive: true });
const backupPath = path.join(backupDir, 'project.json');
await copyFile(path.join(projectRoot(projectId), 'project.json'), backupPath);

let created = 0;
const updated = await updateProject(projectId, (project) => {
  if (['planning', 'queued', 'producing', 'composing'].includes(project.status)) {
    throw new Error(`No se puede modificar casting mientras el proyecto está en estado ${project.status}.`);
  }
  const latest = previewSupportVoiceRegistry(project);
  if (latest.missingLabels.join('|') !== before.missingLabels.join('|')) {
    throw new Error('El inventario de voces secundarias cambió durante la operación. Se abortó.');
  }
  const result = applySupportVoiceRegistry(project);
  created = result.created;
  return project;
});

console.log(`\nViralCine 4.0 — REGISTRO DE VOCES SECUNDARIAS — ${updated.input.title}`);
console.log(`Proyecto: ${updated.id}`);
console.log(`Perfiles creados: ${created}`);
for (const voice of updated.supportVoices || []) {
  console.log(`  ${voice.label} -> ${voice.id} | provider=${voice.voiceProvider} | voiceId=${voice.voiceId ? 'CONFIGURADO' : 'PENDIENTE'}`);
}
console.log(`Backup project.json: ${backupPath}`);
console.log('Media: PRESERVADA; no se borró ni regeneró ningún asset.');
console.log('APIs externas: NO utilizadas. Gasto: US$0.');

function printPreview(preview: ReturnType<typeof previewSupportVoiceRegistry>) {
  console.log(`\nViralCine 4.0 — PREVIEW VOCES SECUNDARIAS — ${preview.title}`);
  console.log(`Proyecto: ${preview.projectId}`);
  console.log(`Detectadas: ${preview.detectedLabels.length ? preview.detectedLabels.join(', ') : 'ninguna'}`);
  console.log(`Ya registradas: ${preview.existing.length}`);
  console.log(`Nuevas por registrar: ${preview.missingLabels.length ? preview.missingLabels.join(', ') : 'ninguna'}`);
  console.log(`Listas para producción: ${preview.readyCount}/${preview.detectedLabels.length}`);
  if (preview.missingVoiceIds.length) console.log(`Sin voiceId: ${preview.missingVoiceIds.join(', ')}`);
}

function printSafety() {
  console.log('\nSEGURIDAD');
  console.log('  SOLO LECTURA: preview no modifica project.json.');
  console.log('  apply solo registra metadata y exige --confirm.');
  console.log('  NO genera voz, NO llama ElevenLabs/OpenAI y NO produce gasto.');
  console.log('  NO modifica MP4/MP3/PNG existentes.');
}

function usage(): never {
  console.log('Uso:');
  console.log('  npm run support:voices -- preview <projectId>');
  console.log('  npm run support:voices -- apply <projectId> --confirm');
  process.exit(1);
}
