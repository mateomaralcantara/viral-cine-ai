import type { FilmProject, FilmScene, FilmShot } from '@/lib/domain/schemas';
import { isCollectiveVoiceLabel, requiresLipSyncForSpeaker } from '@/lib/engine/lip-sync-policy-v4';
import { locateVoiceProfile } from '@/lib/engine/voice-casting-v4';

export type SegmentedVisualRole =
  | 'establishing'
  | 'speaker-closeup'
  | 'crowd-reaction'
  | 'support-reaction';

export type SegmentedVisualTurnPlan = {
  index: number;
  speakerId: string;
  speakerLabel: string;
  role: SegmentedVisualRole;
  startSeconds: number;
  endSeconds: number;
  slotDurationSeconds: number;
  providerDurationSeconds: 4 | 6 | 8;
  requiresLipSync: boolean;
  visiblePeopleLimit: number;
  referenceCharacterIds: string[];
  prompt: string;
  negativePrompt: string;
};

export type SegmentedVisualPlan = {
  version: '4.1-per-turn-visual';
  projectId: string;
  sceneId: string;
  sceneOrder: number;
  shotId: string;
  shotOrder: number;
  shotDurationSeconds: number;
  turns: SegmentedVisualTurnPlan[];
};

export function buildSegmentedVisualPlan(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot
): SegmentedVisualPlan {
  if (!project.plan) throw new Error('Plan ausente.');
  if (shot.dialogueLines.length < 2) {
    throw new Error('La toma no es multihablante; el plan visual por turnos no aplica.');
  }

  const turns = shot.dialogueLines.map((line, zeroIndex) => {
    if (line.endSeconds === undefined) {
      throw new Error('Turno ' + (zeroIndex + 1) + ': falta endSeconds.');
    }
    const slotDurationSeconds = line.endSeconds - line.startSeconds;
    if (!(slotDurationSeconds > 0)) {
      throw new Error('Turno ' + (zeroIndex + 1) + ': duración temporal inválida.');
    }

    const located = locateVoiceProfile(project, line.speakerId);
    const speakerLabel = located?.label || line.speakerId;
    const requiresLipSync = requiresLipSyncForSpeaker(project, line.speakerId);
    const collective = located?.kind === 'support' && isCollectiveVoiceLabel(speakerLabel);
    const role: SegmentedVisualRole =
      line.speakerId === 'narrator'
        ? 'establishing'
        : collective
          ? 'crowd-reaction'
          : requiresLipSync
            ? 'speaker-closeup'
            : 'support-reaction';

    const referenceCharacterIds = referenceCharactersForTurn(
      project,
      scene,
      shot,
      line.speakerId,
      role
    );
    const visiblePeopleLimit =
      role === 'speaker-closeup' ? 3 :
      role === 'crowd-reaction' ? 10 :
      role === 'establishing' ? 10 : 4;

    return {
      index: zeroIndex + 1,
      speakerId: line.speakerId,
      speakerLabel,
      role,
      startSeconds: line.startSeconds,
      endSeconds: line.endSeconds,
      slotDurationSeconds,
      providerDurationSeconds: providerDuration(slotDurationSeconds),
      requiresLipSync,
      visiblePeopleLimit,
      referenceCharacterIds,
      prompt: visualPromptForTurn(
        project,
        scene,
        shot,
        speakerLabel,
        line.text,
        role,
        visiblePeopleLimit
      ),
      negativePrompt: negativePromptForTurn(scene, role)
    };
  });

  return {
    version: '4.1-per-turn-visual',
    projectId: project.id,
    sceneId: scene.id,
    sceneOrder: scene.order,
    shotId: shot.id,
    shotOrder: shot.order,
    shotDurationSeconds: shot.durationSeconds,
    turns
  };
}

function referenceCharactersForTurn(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot,
  speakerId: string,
  role: SegmentedVisualRole
) {
  if (!project.plan) return [];
  const ids = shot.characterIds.length ? shot.characterIds : scene.characterIds;
  const valid = ids.filter((id) => project.plan?.characters.some((character) => character.id === id));

  if (role === 'speaker-closeup') {
    const speakerIsCharacter = project.plan.characters.some((character) => character.id === speakerId);
    return speakerIsCharacter
      ? [speakerId, ...valid.filter((id) => id !== speakerId).slice(0, 1)]
      : valid.slice(0, 2);
  }

  if (role === 'crowd-reaction') return valid.slice(0, 1);
  return valid.slice(0, 2);
}

function visualPromptForTurn(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot,
  speakerLabel: string,
  spokenText: string,
  role: SegmentedVisualRole,
  visiblePeopleLimit: number
) {
  const common = [
    project.plan?.creativeDirection || '',
    scene.visualPrompt,
    shot.visualPrompt,
    'Cinematic historical drama with grounded physical realism.',
    'Preserve character identity, wardrobe continuity, architecture, time of day and lighting direction.',
    'Natural human anatomy, stable faces, physically plausible motion, restrained gestures.',
    'No text, subtitles, captions, logos or watermarks.'
  ].filter(Boolean).join(' ');

  if (role === 'speaker-closeup') {
    return [
      common,
      'Dedicated dialogue coverage for ' + speakerLabel + '.',
      'Medium close-up or medium shot; speaker occupies roughly 40-55 percent of the frame.',
      'Face fully visible in three-quarter or near-frontal angle; eyes and mouth unobstructed.',
      'Maximum ' + visiblePeopleLimit + ' visible people; any secondary figures remain soft and out of focus.',
      'No hands, weapons, helmets or foreground bodies crossing the speaker face.',
      'Minimal head movement and restrained body movement suitable for later lip-sync.',
      'Camera locked or very slow controlled push-in; shallow depth of field.',
      'Do not show the speaker talking; neutral closed-mouth performance prepared for dialogue replacement.',
      'Dialogue context: ' + spokenText
    ].join(' ');
  }

  if (role === 'crowd-reaction') {
    return [
      common,
      'Dedicated crowd reaction coverage; maximum ' + visiblePeopleLimit + ' clearly readable people.',
      'Use a coherent representative group rather than a huge mass of faces.',
      'Avoid repeated faces, duplicated bodies, chaotic hands near faces, extreme foreground limbs and aggressive morphing.',
      'Medium-wide composition with layered depth and one clear visual direction.',
      'Natural group reaction and restrained coordinated movement; no single-face lip-sync framing.',
      'Reaction context: ' + spokenText
    ].join(' ');
  }

  if (role === 'establishing') {
    return [
      common,
      'Establishing coverage for narration; maximum ' + visiblePeopleLimit + ' clearly readable people.',
      'Strong foreground-midground-background separation and one unmistakable focal path.',
      'Avoid a wall of faces and avoid a large human figure blocking the foreground.',
      'Slow cinematic motion only: subtle dolly, atmospheric dust, cloth movement and restrained human motion.',
      'Narration context: ' + spokenText
    ].join(' ');
  }

  return [
    common,
    'Reaction coverage for ' + speakerLabel + '; maximum ' + visiblePeopleLimit + ' visible people.',
    'Keep the principal subject readable and unobstructed, with restrained physical movement.',
    'No single-face lip-sync unless explicitly required by the speaker policy.',
    'Context: ' + spokenText
  ].join(' ');
}

function negativePromptForTurn(scene: FilmScene, role: SegmentedVisualRole) {
  const roleSpecific =
    role === 'speaker-closeup'
      ? 'crowded frame, blocked mouth, profile-only face, extreme head turn, hand over face, foreground occlusion, lip movement'
      : role === 'crowd-reaction'
        ? 'hundreds of faces, duplicated people, repeated faces, tangled arms, extreme foreground hands'
        : 'wall of faces, extreme foreground body, visual clutter';

  return [
    scene.negativePrompt,
    'deformed anatomy, extra fingers, extra limbs, fused bodies, duplicated faces, face morphing, identity drift',
    'warped architecture, melting objects, temporal flicker, unstable costumes, camera shake',
    roleSpecific
  ].filter(Boolean).join(', ');
}

function providerDuration(seconds: number): 4 | 6 | 8 {
  if (seconds <= 4) return 4;
  if (seconds <= 6) return 6;
  return 8;
}
