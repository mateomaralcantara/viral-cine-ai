import type { ContinuityEvent, SceneStateSnapshot } from '@/lib/v7/domain/continuity';

export type ContinuityResolution = {
  snapshot: SceneStateSnapshot;
  appliedEventIds: string[];
  warnings: string[];
};

export function resolveContinuity(base: SceneStateSnapshot, events: ContinuityEvent[]): ContinuityResolution {
  const snapshot: SceneStateSnapshot = structuredClone(base);
  const warnings: string[] = [];
  const applicable = [...events]
    .filter((event) => event.filmId === base.filmId && event.effectiveFrom <= base.timeIndex)
    .sort((a, b) => a.effectiveFrom - b.effectiveFrom || a.createdAt.localeCompare(b.createdAt));

  for (const event of applicable) {
    const payload = event.payload;
    switch (event.eventType) {
      case 'character.location.changed':
        if (typeof payload.locationId === 'string') snapshot.characters[event.entityId] = payload.locationId;
        break;
      case 'character.wardrobe.changed':
        if (typeof payload.wardrobeSetId === 'string') snapshot.wardrobe[event.entityId] = payload.wardrobeSetId;
        break;
      case 'character.injury.added': {
        const injury = typeof payload.injury === 'string' ? payload.injury : undefined;
        if (injury) snapshot.injuries[event.entityId] = [...(snapshot.injuries[event.entityId] || []), injury];
        break;
      }
      case 'character.emotion.changed':
        if (typeof payload.emotion === 'string') snapshot.emotionalStates[event.entityId] = payload.emotion;
        break;
      case 'voice.version.changed':
        if (typeof payload.assetId === 'string') snapshot.lastApprovedVoiceAssetId = payload.assetId;
        break;
      case 'location.state.changed':
      case 'prop.transferred':
      case 'relationship.changed':
        snapshot.continuityNotes.push(event.eventType + ':' + event.entityId + ':' + JSON.stringify(payload));
        break;
      default:
        warnings.push('Evento de continuidad no reconocido: ' + event.eventType);
    }
  }
  return { snapshot, appliedEventIds: applicable.map((event) => event.id), warnings };
}

export function continuityReferenceForNextScene(snapshot: SceneStateSnapshot) {
  return {
    characterStateIds: { ...snapshot.characters },
    wardrobe: { ...snapshot.wardrobe },
    injuries: structuredClone(snapshot.injuries),
    emotionalStates: { ...snapshot.emotionalStates },
    locations: [...snapshot.locations],
    lighting: snapshot.lighting,
    lastApprovedFrameAssetId: snapshot.lastApprovedFrameAssetId,
    lastApprovedVoiceAssetId: snapshot.lastApprovedVoiceAssetId
  };
}
