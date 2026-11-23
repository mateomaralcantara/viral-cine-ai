import type {
  FilmProject,
  FilmShot,
  RealMotionProviderId
} from '@/lib/domain/schemas';

export const FIFTEEN_DAYS_PILOT_PROVIDER_LOCKS: Record<
  string,
  RealMotionProviderId[]
> = {
  'pilot-15d-01': ['veo', 'fal-video'],
  'pilot-15d-02': ['veo', 'fal-video'],
  'pilot-15d-03': ['fal-video', 'veo'],
  'pilot-15d-04': ['veo', 'fal-video'],
  'pilot-15d-05': ['veo', 'fal-video'],
  'pilot-15d-06': ['fal-video', 'veo'],
  'pilot-15d-07': ['veo', 'fal-video'],
  'pilot-15d-08': ['veo', 'fal-video']
};

export type PilotRoutingShotStatus = {
  shotId: string;
  shotTitle: string;
  expectedProviders: RealMotionProviderId[];
  currentProviders: RealMotionProviderId[];
  ready: boolean;
};

export type PilotRoutingLockStatus = {
  total: number;
  readyCount: number;
  ready: boolean;
  shots: PilotRoutingShotStatus[];
};

export function getPilotRoutingLockStatus(
  project: FilmProject
): PilotRoutingLockStatus {
  const plan = project.plan;
  const realMotion = plan?.realMotion;

  if (!plan || !realMotion) {
    return { total: 0, readyCount: 0, ready: true, shots: [] };
  }

  const pilotShots = plan.scenes
    .flatMap((scene) => scene.shots)
    .filter((shot) => realMotion.pilotShotIds.includes(shot.id));

  const shots = pilotShots.map((shot): PilotRoutingShotStatus => {
    const expectedProviders =
      FIFTEEN_DAYS_PILOT_PROVIDER_LOCKS[shot.id] || [];
    const currentProviders = shot.motionSpec?.preferredProviders || [];

    return {
      shotId: shot.id,
      shotTitle: shot.title,
      expectedProviders,
      currentProviders,
      ready:
        expectedProviders.length > 0 &&
        sameProviders(expectedProviders, currentProviders)
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

export function applyFifteenDaysPilotRoutingLocks(
  project: FilmProject
): number {
  if (!project.plan?.realMotion) {
    throw new Error('El proyecto no tiene Real Motion 5.0.');
  }

  let applied = 0;

  for (const scene of project.plan.scenes) {
    scene.shots = scene.shots.map((shot): FilmShot => {
      const providers = FIFTEEN_DAYS_PILOT_PROVIDER_LOCKS[shot.id];
      if (!providers) return shot;

      if (!shot.motionSpec) {
        throw new Error(
          `Routing Lock inválido para ${shot.title}: falta motionSpec.`
        );
      }

      applied += 1;
      return {
        ...shot,
        motionSpec: {
          ...shot.motionSpec,
          preferredProviders: [...providers]
        }
      };
    });
  }

  return applied;
}

export function assertPilotRoutingLocksReady(project: FilmProject) {
  if (!project.plan?.realMotion) return;

  const status = getPilotRoutingLockStatus(project);
  if (status.ready) return;

  const missing = status.shots
    .filter((shot) => !shot.ready)
    .map((shot) => shot.shotTitle)
    .join('; ');

  throw new Error(
    `PILOT ROUTING LOCK INCOMPLETO (${status.readyCount}/${status.total}). ${missing}. No se permite iniciar producción.`
  );
}

function sameProviders(
  left: RealMotionProviderId[],
  right: RealMotionProviderId[]
) {
  return (
    left.length === right.length &&
    left.every((provider, index) => provider === right[index])
  );
}
