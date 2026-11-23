const TIMING_EPSILON_SECONDS = 0.002;
const MIN_SEGMENT_SECONDS = 0.25;
const MAX_SEGMENTED_SHOT_SECONDS = 8;

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
  if (originalTotal - shotDurationSeconds > 0.05) {
    throw new Error(
      'Los slots suman ' + originalTotal.toFixed(3) + 's pero la toma dura solo ' +
      shotDurationSeconds.toFixed(3) + 's.'
    );
  }

  // Un render segmentado puede autoextender una toma (p. ej. 7s -> 8s)
  // sin reescribir todavía sus dialogueLines. El segundo adicional se deja
  // inicialmente en el último turno y luego el redistribuidor lo mueve a
  // cualquier turno que realmente lo necesite.
  const expansion = shotDurationSeconds - originalTotal;
  if (expansion > TIMING_EPSILON_SECONDS) {
    target[target.length - 1] += expansion;
  }

  for (let index = target.length - 1; index >= 0; index -= 1) {
    let deficit = minimum[index] - target[index];
    if (deficit <= TIMING_EPSILON_SECONDS) continue;

    target[index] = minimum[index];

    // Preferimos mover el límite desde turnos anteriores (comportamiento
    // histórico) y, si no alcanza —especialmente para el turno 1—, también
    // podemos tomar holgura de turnos posteriores.
    const donorOrder = [
      ...Array.from({ length: index }, (_, offset) => index - 1 - offset),
      ...Array.from(
        { length: target.length - index - 1 },
        (_, offset) => index + 1 + offset
      )
    ];

    for (const donor of donorOrder) {
      if (deficit <= TIMING_EPSILON_SECONDS) break;
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


export type SegmentedRenderTimingPlan = {
  scheduledDurationSeconds: number;
  outputDurationSeconds: number;
  durationAdjusted: boolean;
  allocations: SegmentedTimingAllocation[];
};

export function planSegmentedRenderTiming(
  inputs: SegmentedTimingInput[],
  scheduledDurationSeconds: number,
  maxSpeedFactor = 1.2
): SegmentedRenderTimingPlan {
  if (!Number.isInteger(scheduledDurationSeconds) || scheduledDurationSeconds <= 0) {
    throw new Error('La duración programada segmentada debe ser un entero positivo.');
  }
  if (scheduledDurationSeconds > MAX_SEGMENTED_SHOT_SECONDS) {
    throw new Error(
      'La duración programada segmentada supera el máximo de ' +
      MAX_SEGMENTED_SHOT_SECONDS + 's.'
    );
  }
  if (!Number.isFinite(maxSpeedFactor) || maxSpeedFactor < 1 || maxSpeedFactor > 1.2) {
    throw new Error('maxSpeedFactor debe estar entre 1.0 y 1.2.');
  }

  const minimumTotal = inputs.reduce(
    (sum, input) =>
      sum + Math.max(MIN_SEGMENT_SECONDS, input.audioDurationSeconds / maxSpeedFactor),
    0
  );

  const requiredDurationSeconds = Math.ceil(
    Math.max(scheduledDurationSeconds, minimumTotal) - TIMING_EPSILON_SECONDS
  );

  if (requiredDurationSeconds > MAX_SEGMENTED_SHOT_SECONDS) {
    throw new Error(
      'La toma segmentada necesita al menos ' + minimumTotal.toFixed(3) +
      's para respetar el límite de ' + maxSpeedFactor.toFixed(2) +
      'x, pero el schema permite como máximo ' +
      MAX_SEGMENTED_SHOT_SECONDS.toFixed(3) + 's.'
    );
  }

  const outputDurationSeconds = Math.max(
    scheduledDurationSeconds,
    requiredDurationSeconds
  );

  return {
    scheduledDurationSeconds,
    outputDurationSeconds,
    durationAdjusted: outputDurationSeconds !== scheduledDurationSeconds,
    allocations: planSegmentedAudioTiming(
      inputs,
      outputDurationSeconds,
      maxSpeedFactor
    )
  };
}
