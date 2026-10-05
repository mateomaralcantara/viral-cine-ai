import type { CharacterBibleEntry, FilmProject } from '@/lib/domain/schemas';

export type IdentityLockItem = {
  characterId: string;
  name: string;
  hasReference: boolean;
  approved: boolean;
  ready: boolean;
  referenceAsset?: string;
};

export type IdentityLockStatus = {
  required: number;
  approved: number;
  ready: boolean;
  items: IdentityLockItem[];
  missing: IdentityLockItem[];
};

export function getCharacterMasterReference(
  project: FilmProject,
  characterId: string
): string | undefined {
  const plan = project.plan;
  if (!plan) return undefined;

  const bible = plan.realMotion?.characterBible.find(
    (entry) => entry.characterId === characterId
  );

  if (bible?.masterReferenceAsset) {
    return bible.masterReferenceAsset;
  }

  return plan.characters.find(
    (character) => character.id === characterId
  )?.referenceAsset;
}

export function getIdentityLockStatus(
  project: FilmProject
): IdentityLockStatus {
  const bible = project.plan?.realMotion?.characterBible;

  if (!bible?.length) {
    return {
      required: 0,
      approved: 0,
      ready: true,
      items: [],
      missing: []
    };
  }

  const items = bible.map((entry): IdentityLockItem => {
    const referenceAsset = getCharacterMasterReference(
      project,
      entry.characterId
    );

    const hasReference = Boolean(referenceAsset);
    const approved = entry.identityApproved === true;

    return {
      characterId: entry.characterId,
      name: entry.name,
      hasReference,
      approved,
      ready: hasReference && approved,
      referenceAsset
    };
  });

  const approved = items.filter((item) => item.ready).length;
  const missing = items.filter((item) => !item.ready);

  return {
    required: items.length,
    approved,
    ready: missing.length === 0,
    items,
    missing
  };
}

export function assertIdentityLocksReady(project: FilmProject) {
  if (!project.plan?.realMotion) return;

  const status = getIdentityLockStatus(project);

  if (status.ready) return;

  const detail = status.missing
    .map((item) => {
      if (!item.hasReference) return `${item.name}: falta referencia maestra`;
      if (!item.approved) return `${item.name}: falta aprobación`;
      return item.name;
    })
    .join('; ');

  throw new Error(
    `IDENTITY LOCK INCOMPLETO (${status.approved}/${status.required}). ${detail}. No se permite iniciar producción.`
  );
}

export function updateBibleIdentity(
  entry: CharacterBibleEntry,
  changes: Partial<
    Pick<
      CharacterBibleEntry,
      'masterReferenceAsset' | 'identityApproved' | 'identityApprovedAt'
    >
  >
): CharacterBibleEntry {
  return {
    ...entry,
    ...changes
  };
}
