import type { Bounds } from '../mask';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const directions: Array<[number, number]> = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

const blurOffsets: Array<[number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [0, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

const localIndex = (x: number, y: number, width: number): number => y * width + x;

const globalIndex = (x: number, y: number, width: number): number => (y * width + x) * 4;

const interpolateBetween = (
  original: ImageData,
  firstX: number,
  firstY: number,
  secondX: number,
  secondY: number,
  x: number,
  y: number
): { color: [number, number, number]; slope: number } | null => {
  const first = globalIndex(firstX, firstY, original.width);
  const second = globalIndex(secondX, secondY, original.width);
  const span = Math.abs(secondX - firstX) + Math.abs(secondY - firstY);
  if (span === 0) return null;
  const color = [0, 1, 2].map((channel) => {
    const a = original.data[first + channel] ?? 0;
    const b = original.data[second + channel] ?? 0;
    const amount = (Math.abs(x - firstX) + Math.abs(y - firstY)) / span;
    return Math.round(a + (b - a) * amount);
  }) as [number, number, number];
  const slope = Math.hypot(
    (original.data[second] ?? 0) - (original.data[first] ?? 0),
    (original.data[second + 1] ?? 0) - (original.data[first + 1] ?? 0),
    (original.data[second + 2] ?? 0) - (original.data[first + 2] ?? 0)
  ) / span;
  return { color, slope };
};

/** Fill a mask from the most locally consistent pair of unmasked pixels. */
const tryDirectionalRestore = (
  original: ImageData,
  mask: Uint8ClampedArray,
  bounds: Bounds
): ImageData | null => {
  let horizontalCurvature = 0;
  let verticalCurvature = 0;
  let horizontalPairs = 0;
  let verticalPairs = 0;
  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const local = localIndex(x, y, bounds.width);
      if ((mask[local] ?? 0) > 0) continue;
      const index = globalIndex(bounds.x + x, bounds.y + y, original.width);
      if (
        x > 0 &&
        x + 1 < bounds.width &&
        (mask[local - 1] ?? 0) === 0 &&
        (mask[local + 1] ?? 0) === 0
      ) {
        const left = index - 4;
        const right = index + 4;
        horizontalCurvature += Math.hypot(
          (original.data[left] ?? 0) - 2 * (original.data[index] ?? 0) + (original.data[right] ?? 0),
          (original.data[left + 1] ?? 0) - 2 * (original.data[index + 1] ?? 0) + (original.data[right + 1] ?? 0),
          (original.data[left + 2] ?? 0) - 2 * (original.data[index + 2] ?? 0) + (original.data[right + 2] ?? 0)
        );
        horizontalPairs += 1;
      }
      if (
        y > 0 &&
        y + 1 < bounds.height &&
        (mask[local - bounds.width] ?? 0) === 0 &&
        (mask[local + bounds.width] ?? 0) === 0
      ) {
        const above = index - original.width * 4;
        const below = index + original.width * 4;
        verticalCurvature += Math.hypot(
          (original.data[above] ?? 0) - 2 * (original.data[index] ?? 0) + (original.data[below] ?? 0),
          (original.data[above + 1] ?? 0) - 2 * (original.data[index + 1] ?? 0) + (original.data[below + 1] ?? 0),
          (original.data[above + 2] ?? 0) - 2 * (original.data[index + 2] ?? 0) + (original.data[below + 2] ?? 0)
        );
        verticalPairs += 1;
      }
    }
  }
  const horizontalAverage = horizontalPairs > 0 ? horizontalCurvature / horizontalPairs : 0;
  const verticalAverage = verticalPairs > 0 ? verticalCurvature / verticalPairs : 0;
  const strongestAxis = Math.max(horizontalAverage, verticalAverage);
  const weakestAxis = Math.min(horizontalAverage, verticalAverage);
  const smoothSurface = strongestAxis <= 0.12;
  const directionalSurface = strongestAxis > 0.12 && weakestAxis < strongestAxis * 0.28;
  if (!smoothSurface && !directionalSurface) return null;

  const restored = new ImageData(
    new Uint8ClampedArray(original.data),
    original.width,
    original.height
  );
  const { width: imageWidth } = original;
  const pixelCount = bounds.width * bounds.height;
  const horizontalColors = new Uint8ClampedArray(pixelCount * 3);
  const verticalColors = new Uint8ClampedArray(pixelCount * 3);
  const horizontalSlopes = new Float32Array(pixelCount).fill(Infinity);
  const verticalSlopes = new Float32Array(pixelCount).fill(Infinity);
  const saveCandidate = (
    colors: Uint8ClampedArray,
    slopes: Float32Array,
    local: number,
    firstX: number,
    firstY: number,
    secondX: number,
    secondY: number,
    x: number,
    y: number
  ): void => {
    const candidate = interpolateBetween(
      original,
      firstX,
      firstY,
      secondX,
      secondY,
      bounds.x + x,
      bounds.y + y
    );
    if (!candidate) return;
    slopes[local] = candidate.slope;
    colors.set(candidate.color, local * 3);
  };

  for (let y = 0; y < bounds.height; y += 1) {
    const left = new Int32Array(bounds.width).fill(-1);
    const right = new Int32Array(bounds.width).fill(-1);
    let clear = -1;
    for (let x = 0; x < bounds.width; x += 1) {
      if ((mask[localIndex(x, y, bounds.width)] ?? 0) === 0) clear = x;
      left[x] = clear;
    }
    clear = -1;
    for (let x = bounds.width - 1; x >= 0; x -= 1) {
      if ((mask[localIndex(x, y, bounds.width)] ?? 0) === 0) clear = x;
      right[x] = clear;
    }
    for (let x = 0; x < bounds.width; x += 1) {
      const local = localIndex(x, y, bounds.width);
      const first = left[x] ?? -1;
      const second = right[x] ?? -1;
      if ((mask[local] ?? 0) > 0 && first >= 0 && second >= 0) {
        saveCandidate(horizontalColors, horizontalSlopes, local,
          bounds.x + first, bounds.y + y, bounds.x + second, bounds.y + y, x, y);
      }
    }
  }

  for (let x = 0; x < bounds.width; x += 1) {
    const top = new Int32Array(bounds.height).fill(-1);
    const bottom = new Int32Array(bounds.height).fill(-1);
    let clear = -1;
    for (let y = 0; y < bounds.height; y += 1) {
      if ((mask[localIndex(x, y, bounds.width)] ?? 0) === 0) clear = y;
      top[y] = clear;
    }
    clear = -1;
    for (let y = bounds.height - 1; y >= 0; y -= 1) {
      if ((mask[localIndex(x, y, bounds.width)] ?? 0) === 0) clear = y;
      bottom[y] = clear;
    }
    for (let y = 0; y < bounds.height; y += 1) {
      const local = localIndex(x, y, bounds.width);
      const first = top[y] ?? -1;
      const second = bottom[y] ?? -1;
      if ((mask[local] ?? 0) > 0 && first >= 0 && second >= 0) {
        saveCandidate(verticalColors, verticalSlopes, local,
          bounds.x + x, bounds.y + first, bounds.x + x, bounds.y + second, x, y);
      }
    }
  }

  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const local = localIndex(x, y, bounds.width);
      if ((mask[local] ?? 0) === 0) continue;
      const horizontalSlope = horizontalSlopes[local] ?? Infinity;
      const verticalSlope = verticalSlopes[local] ?? Infinity;
      const bestSlope = Math.min(horizontalSlope, verticalSlope);
      if (bestSlope > 24) return null;
      const colors = horizontalSlope <= verticalSlope ? horizontalColors : verticalColors;
      const index = globalIndex(bounds.x + x, bounds.y + y, imageWidth);
      restored.data[index] = colors[local * 3] ?? 0;
      restored.data[index + 1] = colors[local * 3 + 1] ?? 0;
      restored.data[index + 2] = colors[local * 3 + 2] ?? 0;
      restored.data[index + 3] = 255;
    }
  }
  return restored;
};

export const inpaintImageFallback = (
  original: ImageData,
  mask: Uint8ClampedArray,
  bounds: Bounds,
  quality: 'fast' | 'balanced' | 'high-quality' = 'balanced'
): ImageData => {
  const output = new ImageData(
    new Uint8ClampedArray(original.data),
    original.width,
    original.height
  );
  const { width } = original;
  const boundsWidth = bounds.width;
  const boundsHeight = bounds.height;
  const boundsSize = boundsWidth * boundsHeight;
  const directional = quality === 'fast' ? null : tryDirectionalRestore(original, mask, bounds);
  if (directional) return directional;

  if (quality === 'fast') {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let y = 0; y < boundsHeight; y += 1) {
      for (let x = 0; x < boundsWidth; x += 1) {
        if ((mask[localIndex(x, y, boundsWidth)] ?? 0) > 0) continue;
        const index = globalIndex(bounds.x + x, bounds.y + y, width);
        red += original.data[index] ?? 0;
        green += original.data[index + 1] ?? 0;
        blue += original.data[index + 2] ?? 0;
        count += 1;
      }
    }
    if (count === 0) throw new Error('The text mask has no clear pixels for background restoration.');
    for (let y = 0; y < boundsHeight; y += 1) {
      for (let x = 0; x < boundsWidth; x += 1) {
        if ((mask[localIndex(x, y, boundsWidth)] ?? 0) === 0) continue;
        const index = globalIndex(bounds.x + x, bounds.y + y, width);
        output.data[index] = Math.round(red / count);
        output.data[index + 1] = Math.round(green / count);
        output.data[index + 2] = Math.round(blue / count);
        output.data[index + 3] = 255;
      }
    }
    return output;
  }

  let maskedCount = 0;
  for (const value of mask) if (value > 0) maskedCount += 1;
  if (maskedCount === boundsSize) {
    const expanded: Bounds = {
      x: Math.max(0, bounds.x - 1),
      y: Math.max(0, bounds.y - 1),
      width: 0,
      height: 0,
    };
    const right = Math.min(original.width, bounds.x + bounds.width + 1);
    const bottom = Math.min(original.height, bounds.y + bounds.height + 1);
    expanded.width = right - expanded.x;
    expanded.height = bottom - expanded.y;
    if (expanded.width === bounds.width && expanded.height === bounds.height) {
      throw new Error('The text mask has no unmasked source pixels for background restoration.');
    }
    const expandedMask = new Uint8ClampedArray(expanded.width * expanded.height);
    const offsetX = bounds.x - expanded.x;
    const offsetY = bounds.y - expanded.y;
    for (let y = 0; y < bounds.height; y += 1) {
      for (let x = 0; x < bounds.width; x += 1) {
        expandedMask[(y + offsetY) * expanded.width + x + offsetX] =
          mask[y * boundsWidth + x] ?? 0;
      }
    }
    return inpaintImageFallback(original, expandedMask, expanded, quality);
  }

  const masked = new Uint8Array(boundsSize);
  const filled = new Uint8Array(boundsSize);
  const queueX = new Int32Array(boundsSize);
  const queueY = new Int32Array(boundsSize);
  let queueStart = 0;
  let queueEnd = 0;

  for (let y = 0; y < boundsHeight; y += 1) {
    for (let x = 0; x < boundsWidth; x += 1) {
      const idx = localIndex(x, y, boundsWidth);
      if ((mask[idx] ?? 0) > 0) {
        masked[idx] = 1;
      } else {
        filled[idx] = 1;
      }
    }
  }

  const tryFill = (x: number, y: number, onlyUnmasked: boolean): boolean => {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let samples = 0;

    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= boundsWidth || ny >= boundsHeight) continue;
      const neighborIdx = localIndex(nx, ny, boundsWidth);
      if (onlyUnmasked && masked[neighborIdx] === 1) continue;
      if (filled[neighborIdx] === 0) continue;

      const gx = bounds.x + nx;
      const gy = bounds.y + ny;
      const gIdx = globalIndex(gx, gy, width);
      sumR += output.data[gIdx] ?? 0;
      sumG += output.data[gIdx + 1] ?? 0;
      sumB += output.data[gIdx + 2] ?? 0;
      samples += 1;
    }

    if (samples === 0) return false;

    const gx = bounds.x + x;
    const gy = bounds.y + y;
    const gIdx = globalIndex(gx, gy, width);
    output.data[gIdx] = Math.round(sumR / samples);
    output.data[gIdx + 1] = Math.round(sumG / samples);
    output.data[gIdx + 2] = Math.round(sumB / samples);
    output.data[gIdx + 3] = 255;
    filled[localIndex(x, y, boundsWidth)] = 1;
    return true;
  };

  for (let y = 0; y < boundsHeight; y += 1) {
    for (let x = 0; x < boundsWidth; x += 1) {
      const idx = localIndex(x, y, boundsWidth);
      if (masked[idx] === 0) continue;
      if (tryFill(x, y, true)) {
        queueX[queueEnd] = x;
        queueY[queueEnd] = y;
        queueEnd += 1;
      }
    }
  }

  while (queueStart < queueEnd) {
    const x = queueX[queueStart] ?? 0;
    const y = queueY[queueStart] ?? 0;
    queueStart += 1;

    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= boundsWidth || ny >= boundsHeight) continue;
      const idx = localIndex(nx, ny, boundsWidth);
      if (masked[idx] === 0 || filled[idx] === 1) continue;
      if (tryFill(nx, ny, false)) {
        queueX[queueEnd] = nx;
        queueY[queueEnd] = ny;
        queueEnd += 1;
      }
    }
  }

  const source = new Uint8ClampedArray(output.data);
  for (let y = 0; y < boundsHeight; y += 1) {
    for (let x = 0; x < boundsWidth; x += 1) {
      const idx = localIndex(x, y, boundsWidth);
      if (masked[idx] === 0) continue;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let samples = 0;
      for (const [dx, dy] of blurOffsets) {
        const sx = clamp(x + dx, 0, boundsWidth - 1);
        const sy = clamp(y + dy, 0, boundsHeight - 1);
        const gIdx = globalIndex(bounds.x + sx, bounds.y + sy, width);
        sumR += source[gIdx] ?? 0;
        sumG += source[gIdx + 1] ?? 0;
        sumB += source[gIdx + 2] ?? 0;
        samples += 1;
      }
      const gIdx = globalIndex(bounds.x + x, bounds.y + y, width);
      output.data[gIdx] = Math.round(sumR / samples);
      output.data[gIdx + 1] = Math.round(sumG / samples);
      output.data[gIdx + 2] = Math.round(sumB / samples);
      output.data[gIdx + 3] = 255;
    }
  }

  return output;
};
