import type { RealMotionProviderId, RealMotionShotSpec } from '@/lib/domain/schemas';

export type RealMotionQualityInput = {
  provider: RealMotionProviderId | 'local-ffmpeg' | 'unknown';
  hasVideo: boolean;
  durationSeconds: number;
  expectedDurationSeconds: number;
  motionScore: number;
  identityScore: number;
  continuityScore: number;
  anatomyScore: number;
  cameraScore: number;
  frozenRatio?: number;
  blackFrameRatio?: number;
};

export type RealMotionQualityResult = {
  pass: boolean;
  score: number;
  issues: string[];
  metrics: {
    motion: number;
    identity: number;
    continuity: number;
    anatomy: number;
    camera: number;
  };
};

export function assessRealMotionQuality(
  input: RealMotionQualityInput,
  spec: RealMotionShotSpec
): RealMotionQualityResult {
  const issues: string[] = [];

  if (!input.hasVideo) issues.push('El asset no contiene una pista de video válida.');
  if (input.provider === 'local-ffmpeg' || input.provider === 'unknown') {
    issues.push('FINAL requiere video generativo temporal real; still-motion local no es aceptable.');
  }

  const durationTolerance = Math.max(0.35, input.expectedDurationSeconds * 0.08);
  if (Math.abs(input.durationSeconds - input.expectedDurationSeconds) > durationTolerance) {
    issues.push(
      'Duración fuera de tolerancia: ' +
      input.durationSeconds.toFixed(2) + 's vs ' +
      input.expectedDurationSeconds.toFixed(2) + 's.'
    );
  }

  threshold(issues, 'Movimiento', input.motionScore, spec.minMotionScore);
  threshold(issues, 'Identidad', input.identityScore, spec.minIdentityScore);
  threshold(issues, 'Continuidad', input.continuityScore, spec.minContinuityScore);
  threshold(issues, 'Anatomía', input.anatomyScore, spec.minAnatomyScore);
  threshold(issues, 'Cámara', input.cameraScore, spec.minCameraScore);

  if ((input.frozenRatio ?? 0) > 0.42) {
    issues.push('Freeze excesivo: la toma se percibe demasiado estática.');
  }
  if ((input.blackFrameRatio ?? 0) > 0.08) {
    issues.push('Demasiados frames negros para una toma final.');
  }

  const score = round(
    (
      input.motionScore * 0.24 +
      input.identityScore * 0.24 +
      input.continuityScore * 0.2 +
      input.anatomyScore * 0.17 +
      input.cameraScore * 0.15
    )
  );

  return {
    pass: issues.length === 0,
    score,
    issues,
    metrics: {
      motion: input.motionScore,
      identity: input.identityScore,
      continuity: input.continuityScore,
      anatomy: input.anatomyScore,
      camera: input.cameraScore
    }
  };
}

function threshold(
  issues: string[],
  label: string,
  value: number,
  minimum: number
) {
  if (value < minimum) {
    issues.push(label + ' ' + value.toFixed(1) + '/10; mínimo ' + minimum.toFixed(1) + '/10.');
  }
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
