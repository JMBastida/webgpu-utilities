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
    if (count === 0) throw new Error('The text mask covers the entire image region.');
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
