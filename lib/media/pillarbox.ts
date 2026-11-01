export type SymmetricSideBars = {
  left: number;
  right: number;
  cropX: number;
  cropWidth: number;
};

export function detectSymmetricBlackSideBars(
  frames: Uint8Array[],
  width: number,
  height: number,
  threshold = 8
): SymmetricSideBars | undefined {
  if (!frames.length || width <= 0 || height <= 0) return undefined;
  const expected = width * height;
  if (frames.some((frame) => frame.length < expected)) {
    throw new Error('Frame grayscale incompleto para detectar pillarbox.');
  }

  const leftWidths: number[] = [];
  const rightWidths: number[] = [];

  for (const frame of frames) {
    leftWidths.push(countDarkColumns(frame, width, height, threshold, false));
    rightWidths.push(countDarkColumns(frame, width, height, threshold, true));
  }

  const left = Math.min(...leftWidths);
  const right = Math.min(...rightWidths);
  const minMeaningful = Math.max(16, Math.round(width * 0.02));
  const symmetryTolerance = Math.max(8, Math.round(width * 0.0125));

  if (left < minMeaningful || right < minMeaningful) return undefined;
  if (Math.abs(left - right) > symmetryTolerance) return undefined;
  if (left + right > Math.round(width * 0.4)) return undefined;

  const cropX = Math.min(left, right);
  let cropWidth = width - cropX * 2;
  if (cropWidth % 2 !== 0) cropWidth -= 1;
  if (cropWidth < Math.round(width * 0.6)) return undefined;

  return {
    left,
    right,
    cropX,
    cropWidth
  };
}

export function buildPillarboxRepairFilter(
  bars: SymmetricSideBars,
  targetWidth: number,
  targetHeight: number,
  verticalBias = 0.35
) {
  const bias = Math.max(0, Math.min(1, verticalBias));
  return [
    'crop=' + bars.cropWidth + ':ih:' + bars.cropX + ':0',
    'scale=' + targetWidth + ':-2',
    'crop=' + targetWidth + ':' + targetHeight + ':0:(ih-oh)*' + bias.toFixed(2),
    'format=yuv420p'
  ].join(',');
}

function countDarkColumns(
  frame: Uint8Array,
  width: number,
  height: number,
  threshold: number,
  fromRight: boolean
) {
  let darkColumns = 0;

  for (let step = 0; step < width; step += 1) {
    const x = fromRight ? width - 1 - step : step;
    let sum = 0;
    for (let y = 0; y < height; y += 1) {
      sum += frame[y * width + x] || 0;
    }
    const mean = sum / height;
    if (mean > threshold) break;
    darkColumns += 1;
  }

  return darkColumns;
}
