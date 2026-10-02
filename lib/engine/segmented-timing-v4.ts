const TIMING_EPSILON_SECONDS = 0.002;
const MIN_SEGMENT_SECONDS = 0.25;

export type SegmentedTimingInput = {
  id: string;
  index: number;
  slotDurationSeconds: number;
  audioDurationSeconds: number;
};

export type SegmentedTimingAllocation = SegmentedTimingInput & {
  startSeconds: number;
  endSeconds: number;
  targetDurationSeconds: number;
  speedFactor: number;
  minimumDurationSeconds: number;
};

export function planSegmentedAudioTiming(
  inputs: SegmentedTimingInput[],
  shotDurationSeconds: number,
  maxSpeedFactor = 1.2
): SegmentedTimingAllocation[] {
  if (!inputs.length) throw new Error('No existen turnos para ajustar.');
  if (!Number.isFinite(shotDurationSeconds) || shotDurationSeconds <= 0) {
    throw new Error('La duración total de la toma no es válida.');
  }
  if (!Number.isFinite(maxSpeedFactor) || maxSpeedFactor < 1 || maxSpeedFactor > 1.2) {
    throw new Error('maxSpeedFactor debe estar entre 1.0 y 1.2.');
  }

  const target = inputs.map((input) => {
    if (!Number.isFinite(input.slotDurationSeconds) || input.slotDurationSeconds <= 0) {
      throw new Error('Turno ' + input.index + ': slotDurationSeconds inválido.');
    }
    if (!Number.isFinite(input.audioDurationSeconds) || input.audioDurationSeconds <= 0) {
      throw new Error('Turno ' + input.index + ': audioDurationSeconds inválido.');
    }
    return input.slotDurationSeconds;
  });

  const minimum = inputs.map((input) =>
    Math.max(MIN_SEGMENT_SECONDS, input.audioDurationSeconds / maxSpeedFactor)
  );

  const originalTotal = target.reduce((sum, value) => sum + value, 0);
  if (Math.abs(originalTotal - shotDurationSeconds) > 0.05) {
    throw new Error(
      'Los slots suman ' + originalTotal.toFixed(3) + 's pero la toma dura ' +
      shotDurationSeconds.toFixed(3) + 's.'
    );
  }

  for (let index = target.length - 1; index >= 0; index -= 1) {
    let deficit = minimum[index] - target[index];
    if (deficit <= TIMING_EPSILON_SECONDS) continue;

    target[index] = minimum[index];

    for (let donor = index - 1; donor >= 0 && deficit > TIMING_EPSILON_SECONDS; donor -= 1) {
      const reducible = Math.max(0, target[donor] - minimum[donor]);
      const amount = Math.min(deficit, reducible);
      target[donor] -= amount;
      deficit -= amount;
    }

    if (deficit > TIMING_EPSILON_SECONDS) {
      throw new Error(
        'El turno ' + inputs[index].index + ' no cabe ni a ' +
        maxSpeedFactor.toFixed(2) + 'x; faltan ' + deficit.toFixed(3) + 's.'
      );
    }
  }

  const totalAfter = target.reduce((sum, value) => sum + value, 0);
  const correction = shotDurationSeconds - totalAfter;
  target[0] += correction;
  if (target[0] + TIMING_EPSILON_SECONDS < minimum[0]) {
    throw new Error('El ajuste final haría que el primer turno exceda la velocidad máxima.');
  }

  let cursor = 0;
  return inputs.map((input, index) => {
    const targetDurationSeconds = target[index];
    const rawSpeed = input.audioDurationSeconds / targetDurationSeconds;
    const speedFactor = rawSpeed > 1 ? rawSpeed : 1;
    if (speedFactor > maxSpeedFactor + 0.002) {
      throw new Error(
        'Turno ' + input.index + ': requiere ' + speedFactor.toFixed(3) +
        'x y el máximo es ' + maxSpeedFactor.toFixed(3) + 'x.'
      );
    }
    const startSeconds = cursor;
    const endSeconds = index === inputs.length - 1
      ? shotDurationSeconds
      : cursor + targetDurationSeconds;
    cursor = endSeconds;
    return {
      ...input,
      startSeconds,
      endSeconds,
      targetDurationSeconds: endSeconds - startSeconds,
      speedFactor,
      minimumDurationSeconds: minimum[index]
    };
  });
}
