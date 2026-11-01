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
  videoPrompt: string;
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
      role === 'speaker-closeup' ? 2 :
      role === 'crowd-reaction' ? 8 :
      role === 'establishing' ? 8 : 4;

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
      videoPrompt: videoPromptForTurn(
        project,
        scene,
        shot,
        speakerLabel,
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
    return speakerIsCharacter ? [speakerId] : valid.slice(0, 1);
  }

  // Collective shots should not inherit a hero face reference and accidentally
  // turn the crowd into repeated copies of a principal character.
  if (role === 'crowd-reaction') return [];
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
  const speakerCharacter = project.plan?.characters.find((character) => character.name === speakerLabel) ||
    project.plan?.characters.find((character) => character.id === shot.speakerId);
  const speakerContinuity = speakerCharacter
    ? 'Speaker continuity: ' + speakerCharacter.name + '; appearance: ' + speakerCharacter.appearance +
      '; wardrobe: ' + speakerCharacter.wardrobe + '.'
    : '';

  const settingAnchor = extractSettingAnchor(scene.visualPrompt);

  const common = [
    project.plan?.creativeDirection || '',
    settingAnchor ? 'Scene setting anchor: ' + settingAnchor + '.' : '',
    'TURN-SPECIFIC COVERAGE OVERRIDES wider framing or action implied by the scene context.',
    'Do not combine other dialogue beats, other speakers, or the parent shot staging into this turn.',
    'Cinematic historical drama with grounded physical realism and observational composition.',
    'Avoid generic staged biblical tableau, poster-like symmetry, centered ensemble posing and spectacle-for-spectacle framing.',
    'Prefer motivated asymmetry, readable negative space, one dominant visual idea and controlled depth.',
    'Preserve character identity, wardrobe continuity, architecture, time of day and lighting direction.',
    'Natural human anatomy, stable faces, physically plausible motion, restrained gestures.',
    'No text, subtitles, captions, logos or watermarks.'
  ].filter(Boolean).join(' ');

  if (role === 'speaker-closeup') {
    return [
      common,
      'Dedicated dialogue coverage for ' + speakerLabel + '.',
      speakerContinuity,
      'Medium close-up or medium shot; speaker occupies roughly 45-60 percent of the frame.',
      'Face fully visible in three-quarter or near-frontal angle; eyes and mouth unobstructed.',
      'Maximum ' + visiblePeopleLimit + ' visible people; any secondary figures remain soft and out of focus.',
      'No hands, weapons, helmets, bowls, props or foreground bodies crossing the speaker face.',
      'Do not perform unrelated parent-shot actions during this dialogue beat; keep hands below the chest or outside frame.',
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
      'No principal-character hero framing; the group reaction is the subject.',
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
      'Do not stage the later dialogue actions yet; establish place, tension and spatial relationships only.',
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


function videoPromptForTurn(
  project: FilmProject,
  scene: FilmScene,
  shot: FilmShot,
  speakerLabel: string,
  role: SegmentedVisualRole,
  visiblePeopleLimit: number
) {
  const speakerCharacter = project.plan?.characters.find((character) => character.name === speakerLabel) ||
    project.plan?.characters.find((character) => character.id === shot.speakerId);
  const settingAnchor = extractSettingAnchor(scene.visualPrompt);
  const common = [
    settingAnchor ? 'Historical setting: ' + settingAnchor + '.' : '',
    'Animate the approved first-frame reference faithfully instead of redesigning the shot.',
    'Preserve exact subject identity, wardrobe, architecture, lighting direction, framing and camera axis.',
    'Keep motion physically plausible, restrained and cinematic.',
    'Do not introduce new characters, props, text, subtitles, logos or watermarks.',
    'Keep the scene non-graphic and suitable for a general audience.'
  ].filter(Boolean).join(' ');

  if (role === 'speaker-closeup') {
    const continuity = speakerCharacter
      ? 'Maintain the exact face and wardrobe of ' + speakerCharacter.name + '.'
      : 'Maintain the exact speaker identity from the reference.';
    return [
      common,
      'Dedicated silent dialogue plate for ' + speakerLabel + '.',
      continuity,
      'Medium close-up or medium shot; keep the speaker at roughly the same scale as the reference.',
      'Face, eyes and mouth remain fully visible and unobstructed.',
      'Maximum ' + visiblePeopleLimit + ' visible people; background figures stay soft and secondary.',
      'The speaker must remain silent with a neutral closed mouth for later lip-sync.',
      'Minimal head and body movement, natural blinking and breathing only.',
      'Keep hands below the chest or outside frame.',
      'Camera locked or use only a very slow controlled push-in.'
    ].join(' ');
  }

  if (role === 'crowd-reaction') {
    return [
      common,
      'Dedicated crowd-reaction motion plate with at most ' + visiblePeopleLimit + ' clearly readable people.',
      'Preserve the same representative group from the reference; do not multiply or replace faces.',
      'The group reacts in a forceful collective protest toward an off-camera authority without depicting physical violence.',
      'Use restrained coordinated gestures, natural cloth movement and believable facial motion.',
      'Avoid extreme foreground hands, tangled limbs, duplicated bodies and face morphing.',
      'Keep the camera stable with only subtle cinematic movement.'
    ].join(' ');
  }

  if (role === 'establishing') {
    return [
      common,
      'Establishing motion plate for narration with at most ' + visiblePeopleLimit + ' clearly readable people.',
      'Do not advance later dialogue actions.',
      'Use a slow subtle dolly or controlled atmospheric camera drift.',
      'Allow only restrained human movement, natural cloth movement and light dust in the air.',
      'Preserve foreground, midground and background separation and the original focal path.'
    ].join(' ');
  }

  return [
    common,
    'Reaction motion plate for ' + speakerLabel + ' with at most ' + visiblePeopleLimit + ' visible people.',
    'Keep the principal subject readable and unobstructed.',
    'Use restrained physical movement and stable facial identity.'
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

function extractSettingAnchor(value: string) {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return '';

  const firstSentence = compact.split(/[.!?]/, 1)[0]?.trim() || compact;
  const firstClause = firstSentence.split(',', 1)[0]?.trim() || firstSentence;
  const candidate = firstClause.length >= 18 ? firstClause : firstSentence;

  return candidate.slice(0, 240).trim();
}

function providerDuration(seconds: number): 4 | 6 | 8 {
  if (seconds <= 4) return 4;
  if (seconds <= 6) return 6;
  return 8;
}
