import type { FilmProject, FilmShot } from '@/lib/domain/schemas';

export const FIFTEEN_DAYS_PILOT_STATE_LOCKS: Record<string, Record<string, string>> = {
  'pilot-15d-01': { 'char-v5-elena-0001': 'elena-b-street' },
  'pilot-15d-02': { 'char-v5-elena-0001': 'elena-b-street' },
  'pilot-15d-03': { 'char-v5-elena-0001': 'elena-a-home' },
  'pilot-15d-04': {
    'char-v5-elena-0001': 'elena-a-home',
    'char-v5-raul-0002': 'raul-a-control'
  },
  'pilot-15d-05': {
    'char-v5-raul-0002': 'raul-a-control',
    'char-v5-elena-0001': 'elena-a-home'
  },
  'pilot-15d-06': {
    'char-v5-elena-0001': 'elena-a-home',
    'char-v5-raul-0002': 'raul-a-control'
  },
  'pilot-15d-07': { 'char-v5-elena-0001': 'elena-a-home' },
  'pilot-15d-08': { 'char-v5-elena-0001': 'elena-a-home' }
};

export type PilotStateBinding = {
  characterId: string;
  characterName: string;
  stateId?: string;
  stateLabel?: string;
  valid: boolean;
};

export type PilotStateShotStatus = {
  shotId: string;
  shotTitle: string;
  bindings: PilotStateBinding[];
  ready: boolean;
};

export type PilotStateLockStatus = {
  total: number;
  readyCount: number;
  ready: boolean;
  shots: PilotStateShotStatus[];
};

export function getPilotStateLockStatus(project: FilmProject): PilotStateLockStatus {
  const plan = project.plan;
  const realMotion = plan?.realMotion;

  if (!plan || !realMotion) {
    return { total: 0, readyCount: 0, ready: true, shots: [] };
  }

  const pilotShots = plan.scenes
    .flatMap((scene) => scene.shots)
    .filter((shot) => realMotion.pilotShotIds.includes(shot.id));

  const shots = pilotShots.map((shot): PilotStateShotStatus => {
    const bindings = shot.characterIds.map((characterId): PilotStateBinding => {
      const character = realMotion.characterBible.find(
        (entry) => entry.characterId === characterId
      );
      const stateId = shot.characterStateIds?.[characterId];
      const state = character?.states.find((item) => item.id === stateId);

      return {
        characterId,
        characterName: character?.name || characterId,
        stateId,
        stateLabel: state?.label,
        valid: Boolean(character && state)
      };
    });

    return {
      shotId: shot.id,
      shotTitle: shot.title,
      bindings,
      ready:
        bindings.length === shot.characterIds.length &&
        bindings.every((binding) => binding.valid)
    };
  });

  const readyCount = shots.filter((shot) => shot.ready).length;

  return {
    total: shots.length,
    readyCount,
    ready: shots.length > 0 && readyCount === shots.length,
    shots
  };
}

export function applyFifteenDaysPilotStateLocks(project: FilmProject): number {
  if (!project.plan?.realMotion) {
    throw new Error('El proyecto no tiene Real Motion 5.0.');
  }

  let applied = 0;

  for (const scene of project.plan.scenes) {
    scene.shots = scene.shots.map((shot): FilmShot => {
      const mapping = FIFTEEN_DAYS_PILOT_STATE_LOCKS[shot.id];
      if (!mapping) return shot;

      for (const characterId of shot.characterIds) {
        const stateId = mapping[characterId];
        const character = project.plan?.realMotion?.characterBible.find(
          (entry) => entry.characterId === characterId
        );
        const exists = character?.states.some((state) => state.id === stateId);

        if (!stateId || !exists) {
          throw new Error(
            `State Lock inválido para ${shot.title}: ${character?.name || characterId}.`
          );
        }
      }

      applied += 1;
      return {
        ...shot,
        characterStateIds: { ...mapping }
      };
    });
  }

  return applied;
}

export function assertPilotStateLocksReady(project: FilmProject) {
  if (!project.plan?.realMotion) return;

  const status = getPilotStateLockStatus(project);

  if (status.ready) return;

  const missing = status.shots
    .filter((shot) => !shot.ready)
    .map((shot) => {
      const invalid = shot.bindings
        .filter((binding) => !binding.valid)
        .map((binding) => binding.characterName)
        .join(', ');
      return `${shot.shotTitle}: ${invalid || 'sin estado válido'}`;
    })
    .join('; ');

  throw new Error(
    `PILOT STATE LOCK INCOMPLETO (${status.readyCount}/${status.total}). ${missing}. No se permite iniciar producción.`
  );
}
