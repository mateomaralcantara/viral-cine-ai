import { getProject, updateProject } from '../lib/storage/project-store';

const [, , command, projectId, characterSelector, voiceId, providerArg] = process.argv;

if (!command || !projectId) usage();

if (command === 'list') {
  const project = await getProject(projectId);
  if (!project.plan) throw new Error('El proyecto no tiene personajes todavía. Genera primero el plan.');
  console.log(`\nVoces de: ${project.input.title}`);
  for (const character of project.plan.characters) {
    console.log([
      `- ${character.name}`,
      `id=${character.id}`,
      `provider=${character.voiceProvider || 'elevenlabs'}`,
      `voiceId=${character.voiceId || 'SIN ASIGNAR'}`
    ].join(' | '));
  }
  process.exit(0);
}

if (command === 'assign') {
  if (!characterSelector || !voiceId) usage();
  const provider = normalizeProvider(providerArg || 'elevenlabs');
  const updated = await updateProject(projectId, (project) => {
    if (!project.plan) throw new Error('El proyecto no tiene personajes todavía.');
    const normalized = characterSelector.toLocaleLowerCase();
    const matches = project.plan.characters.filter((character) =>
      character.id === characterSelector || character.name.toLocaleLowerCase() === normalized
    );
    if (matches.length !== 1) {
      throw new Error(matches.length === 0
        ? `No existe personaje '${characterSelector}'. Usa: npm run voices:4 -- list ${projectId}`
        : `El selector '${characterSelector}' es ambiguo. Usa el id exacto del personaje.`);
    }
    const character = matches[0];
    character.voiceProvider = provider;
    character.voiceId = voiceId;
    project.productionLog.push(
      `${new Date().toISOString()} Casting vocal 4.0 actualizado para ${character.name}: proveedor ${provider}, voiceId configurada.`
    );
    return project;
  });
  const character = updated.plan?.characters.find((item) =>
    item.id === characterSelector || item.name.toLocaleLowerCase() === characterSelector.toLocaleLowerCase()
  );
  console.log(`OK: ${character?.name || characterSelector} -> ${provider} / ${maskVoiceId(voiceId)}`);
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
  console.log('  npm run voices:4 -- assign <projectId> "Nombre o characterId" <voiceId> [elevenlabs|openai|offline]');
  process.exit(1);
}
