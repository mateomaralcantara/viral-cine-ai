import type { FilmShot } from '@/lib/domain/schemas';

export function buildVeoRealMotionPrompt(shot: FilmShot) {
  const motion = shot.motionSpec;

  if (!motion) {
    return [
      shot.visualPrompt,
      shot.camera ? `Camera: ${shot.camera}.` : '',
      `Duration exactly ${shot.durationSeconds} seconds.`,
      'Generate natural motion only.',
      'No dialogue, subtitles, text or logos.'
    ].filter(Boolean).join(' ');
  }

  const action = positiveMotion(motion.bodyMotion, 520);
  const camera = positiveMotion(
    motion.cameraMotion || shot.camera,
    320
  );
  const endState = positiveMotion(motion.endState, 260);

  return [
    'Animate the approved reference image faithfully.',
    'Preserve the exact same adult subject, face, clothing and environment visible in the reference image.',
    action ? `Action: ${action}` : '',
    endState ? `End of shot: ${endState}` : '',
    camera ? `Camera: ${camera}` : '',
    `One continuous natural shot for ${shot.durationSeconds} seconds.`,
    'No speaking. No new people. No text or logos. Do not redesign the scene.'
  ].filter(Boolean).join(' ');
}

function positiveMotion(value: string, maxLength: number) {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return '';

  const positive = compact
    .split(/(?<=[.!?;])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) =>
      !/^(?:prohibido|sin\b|no\b|nunca\b|evitar\b|do not\b|without\b)/i.test(
        item
      )
    )
    .join(' ')
    .replace(/\s+(?:Prohibido|Sin|No|Nunca|Evitar)\b.*$/i, '')
    .trim();

  return positive.slice(0, maxLength).trim();
}
