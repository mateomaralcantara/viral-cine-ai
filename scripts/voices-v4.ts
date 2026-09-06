import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { buildVoiceCastingState, setVoiceProfile } from '../lib/engine/voice-casting-v4';
import { dataRoot, getProject, projectRoot, updateProject } from '../lib/storage/project-store';

const [, , command, projectId, profileSelector, voiceIdArg, providerArg] = process.argv;

if (!command || !projectId) usage();

if (command === 'list') {
  const project = await getProject(projectId);
  const state = buildVoiceCastingState(project);
  console.log(`\nVoice Casting 4.0 — ${project.input.title}`);
  console.log(`Perfiles: ${state.totals.ready}/${state.totals.profiles} listos`);
  for (const profile of state.profiles) {
    console.log([
      `- ${profile.label}`,
      `tipo=${profile.kind}`,
      `id=${profile.id}`,
      `provider=${profile.voiceProvider}`,
      `voiceId=${profile.voiceId ? maskVoiceId(profile.voiceId) : 'SIN ASIGNAR'}`,
      `estado=${profile.voiceReady ? 'LISTA' : 'PENDIENTE'}`
    ].join(' | '));
  }
  console.log('\nSolo lectura: no llama proveedores ni genera gasto.');
  process.exit(0);
}

if (command === 'assign') {
  if (!profileSelector || !voiceIdArg) usage();
  const provider = normalizeProvider(providerArg || 'elevenlabs');
  const current = await getProject(projectId);
  if (['planning', 'queued', 'producing', 'composing'].includes(current.status)) {
    throw new Error(`No se puede modificar casting mientras el proyecto está en estado ${current.status}.`);
  }
  const state = buildVoiceCastingState(current);
  const normalized = profileSelector.toLocaleLowerCase();
  const matches = state.profiles.filter((profile) =>
    profile.id === profileSelector || profile.label.toLocaleLowerCase() === normalized
  );
  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? `No existe perfil '${profileSelector}'. Usa: npm run voices:4 -- list ${projectId}`
      : `El selector '${profileSelector}' es ambiguo. Usa el id exacto.`);
  }
  const target = matches[0];
  const voiceId = voiceIdArg === '-' ? undefined : voiceIdArg;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(dataRoot(), 'backups', `voice-casting-${stamp}`, projectId);
  await mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, 'project.json');
  await copyFile(path.join(projectRoot(projectId), 'project.json'), backupPath);

  const updated = await updateProject(projectId, (project) => {
    if (['planning', 'queued', 'producing', 'composing'].includes(project.status)) {
      throw new Error(`No se puede modificar casting mientras el proyecto está en estado ${project.status}.`);
    }
    setVoiceProfile(project, target.id, { provider, voiceId });
    return project;
  });
  const saved = buildVoiceCastingState(updated).profiles.find((profile) => profile.id === target.id);
  console.log(`OK: ${saved?.label || target.label} -> ${provider} / ${voiceId ? maskVoiceId(voiceId) : 'SIN VOICE ID'}`);
  console.log(`Backup project.json: ${backupPath}`);
  console.log('Media: PRESERVADA. APIs externas: NO utilizadas. Gasto: US$0.');
  process.exit(0);
}

usage();

function normalizeProvider(value: string): 'elevenlabs' | 'openai' | 'offline' {
  const normalized = value.toLocaleLowerCase();
  if (normalized === 'elevenlabs' || normalized === 'openai' || normalized === 'offline') return normalized;
  throw new Error(`Proveedor vocal no válido: ${value}`);
}

function maskVoiceId(value: string) {
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function usage(): never {
  console.log('Uso:');
  console.log('  npm run voices:4 -- list <projectId>');
  console.log('  npm run voices:4 -- assign <projectId> "Narrador|Nombre|profileId" <voiceId|-> [elevenlabs|openai|offline]');
  process.exit(1);
}
