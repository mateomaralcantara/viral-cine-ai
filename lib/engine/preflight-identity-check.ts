import type { CharacterBibleEntry, FilmProject } from '@/lib/domain/schemas';

export type IdentityLockItem = {
  characterId: string;
  name: string;
  hasFaceReference: boolean;
  hasBodyReference: boolean;
  faceApproved: boolean;
  bodyApproved: boolean;
  ready: boolean;
  faceReferenceAsset?: string;
  bodyReferenceAsset?: string;
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

  return bible?.masterReferenceAsset ||
    plan.characters.find((character) => character.id === characterId)?.referenceAsset;
}

export function getCharacterBodyReference(
  project: FilmProject,
  characterId: string
): string | undefined {
  return project.plan?.realMotion?.characterBible.find(
    (entry) => entry.characterId === characterId
  )?.bodyReferenceAsset;
}

export function getIdentityLockStatus(project: FilmProject): IdentityLockStatus {
  const bible = project.plan?.realMotion?.characterBible;

  if (!bible?.length) {
    return { required: 0, approved: 0, ready: true, items: [], missing: [] };
  }

  const items = bible.map((entry): IdentityLockItem => {
    const faceReferenceAsset = getCharacterMasterReference(project, entry.characterId);
    const bodyReferenceAsset = getCharacterBodyReference(project, entry.characterId);
    const faceApproved = entry.faceApproved ?? entry.identityApproved === true;
    const bodyApproved = entry.bodyApproved === true;
    const hasFaceReference = Boolean(faceReferenceAsset);
    const hasBodyReference = Boolean(bodyReferenceAsset);

    return {
      characterId: entry.characterId,
      name: entry.name,
      hasFaceReference,
      hasBodyReference,
      faceApproved,
      bodyApproved,
      ready: hasFaceReference && hasBodyReference && faceApproved && bodyApproved,
      faceReferenceAsset,
      bodyReferenceAsset
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

  const detail = status.missing.map((item) => {
    const reasons: string[] = [];
    if (!item.hasFaceReference) reasons.push('falta FACE MASTER');
    else if (!item.faceApproved) reasons.push('FACE MASTER sin aprobar');
    if (!item.hasBodyReference) reasons.push('falta BODY MASTER');
    else if (!item.bodyApproved) reasons.push('BODY MASTER sin aprobar');
    return `${item.name}: ${reasons.join(', ')}`;
  }).join('; ');

  throw new Error(
    `IDENTITY LOCK INCOMPLETO (${status.approved}/${status.required}). ${detail}. No se permite iniciar producción.`
  );
}

export function updateBibleIdentity(
  entry: CharacterBibleEntry,
  changes: Partial<Pick<CharacterBibleEntry,
    'masterReferenceAsset' |
    'bodyReferenceAsset' |
    'faceApproved' |
    'faceApprovedAt' |
    'bodyApproved' |
    'bodyApprovedAt' |
    'identityApproved' |
    'identityApprovedAt'
  >>
): CharacterBibleEntry {
  return { ...entry, ...changes };
}
