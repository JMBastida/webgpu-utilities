import type { Region } from './types';
import type { OCRItem } from '@/types/ocr-engine';
import { createCanvas, getContext2d } from './canvas';

export type Bounds = { x: number; y: number; width: number; height: number };

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const unionBounds = (
  regions: Region[],
  imageWidth: number,
  imageHeight: number,
  padding: number
): Bounds | null => {
  if (regions.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const region of regions) {
    minX = Math.min(minX, region.bbox.x);
    minY = Math.min(minY, region.bbox.y);
    maxX = Math.max(maxX, region.bbox.x + region.bbox.width);
    maxY = Math.max(maxY, region.bbox.y + region.bbox.height);
  }

  const x = clamp(Math.floor(minX - padding), 0, imageWidth);
  const y = clamp(Math.floor(minY - padding), 0, imageHeight);
  const maxXClamped = clamp(Math.ceil(maxX + padding), 0, imageWidth);
  const maxYClamped = clamp(Math.ceil(maxY + padding), 0, imageHeight);
  const width = Math.max(1, maxXClamped - x);
  const height = Math.max(1, maxYClamped - y);
  return { x, y, width, height };
};

export const unionItemBounds = (
  items: OCRItem[],
  imageWidth: number,
  imageHeight: number,
  padding: number
): Bounds | null => {
  if (items.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const item of items) {
    if (item.quad && item.quad.length === 4) {
      for (const point of item.quad) {
        minX = Math.min(minX, point[0]);
        minY = Math.min(minY, point[1]);
        maxX = Math.max(maxX, point[0]);
        maxY = Math.max(maxY, point[1]);
      }
    } else {
      minX = Math.min(minX, item.boundingBox.x);
      minY = Math.min(minY, item.boundingBox.y);
      maxX = Math.max(maxX, item.boundingBox.x + item.boundingBox.width);
      maxY = Math.max(maxY, item.boundingBox.y + item.boundingBox.height);
    }
  }

  const x = clamp(Math.floor(minX - padding), 0, imageWidth);
  const y = clamp(Math.floor(minY - padding), 0, imageHeight);
  const maxXClamped = clamp(Math.ceil(maxX + padding), 0, imageWidth);
  const maxYClamped = clamp(Math.ceil(maxY + padding), 0, imageHeight);
  const width = Math.max(1, maxXClamped - x);
  const height = Math.max(1, maxYClamped - y);
  return { x, y, width, height };
};

export const rasterizeRegionsToMask = (regions: Region[], bounds: Bounds): Uint8ClampedArray => {
  const canvas = createCanvas(bounds.width, bounds.height);
  const context = getContext2d(canvas);
  context.clearRect(0, 0, bounds.width, bounds.height);
  context.fillStyle = '#fff';

  for (const region of regions) {
    const quad = region.quad;
    context.beginPath();
    context.moveTo((quad[0]?.x ?? 0) - bounds.x, (quad[0]?.y ?? 0) - bounds.y);
    context.lineTo((quad[1]?.x ?? 0) - bounds.x, (quad[1]?.y ?? 0) - bounds.y);
    context.lineTo((quad[2]?.x ?? 0) - bounds.x, (quad[2]?.y ?? 0) - bounds.y);
    context.lineTo((quad[3]?.x ?? 0) - bounds.x, (quad[3]?.y ?? 0) - bounds.y);
    context.closePath();
    context.fill();
  }

  const data = context.getImageData(0, 0, bounds.width, bounds.height).data;
  const mask = new Uint8ClampedArray(bounds.width * bounds.height);
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = data[i * 4 + 3] ?? 0;
  }
  return mask;
};

export const rasterizeItemsToMask = (items: OCRItem[], bounds: Bounds): Uint8ClampedArray => {
  const canvas = createCanvas(bounds.width, bounds.height);
  const context = getContext2d(canvas);
  context.clearRect(0, 0, bounds.width, bounds.height);
  context.fillStyle = '#fff';

  for (const item of items) {
    const quad = item.quad;
    if (quad && quad.length === 4) {
      context.beginPath();
      context.moveTo((quad[0]?.[0] ?? 0) - bounds.x, (quad[0]?.[1] ?? 0) - bounds.y);
      context.lineTo((quad[1]?.[0] ?? 0) - bounds.x, (quad[1]?.[1] ?? 0) - bounds.y);
      context.lineTo((quad[2]?.[0] ?? 0) - bounds.x, (quad[2]?.[1] ?? 0) - bounds.y);
      context.lineTo((quad[3]?.[0] ?? 0) - bounds.x, (quad[3]?.[1] ?? 0) - bounds.y);
      context.closePath();
      context.fill();
    } else {
      const box = item.boundingBox;
      context.fillRect(box.x - bounds.x, box.y - bounds.y, box.width, box.height);
    }
  }

  const data = context.getImageData(0, 0, bounds.width, bounds.height).data;
  const mask = new Uint8ClampedArray(bounds.width * bounds.height);
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = data[i * 4 + 3] ?? 0;
  }
  return mask;
};

export const dilateMask = (
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): Uint8ClampedArray => {
  if (radius <= 0) return mask;
  const w1 = width + 1;
  const integral = new Uint32Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= width; x += 1) {
      const value = (mask[(y - 1) * width + (x - 1)] ?? 0) > 0 ? 1 : 0;
      rowSum += value;
      integral[y * w1 + x] = (integral[(y - 1) * w1 + x] ?? 0) + rowSum;
    }
  }

  const output = new Uint8ClampedArray(mask.length);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const sum =
        (integral[(y1 + 1) * w1 + (x1 + 1)] ?? 0) -
        (integral[y0 * w1 + (x1 + 1)] ?? 0) -
        (integral[(y1 + 1) * w1 + x0] ?? 0) +
        (integral[y0 * w1 + x0] ?? 0);
      output[y * width + x] = sum > 0 ? 255 : 0;
    }
  }

  return output;
};
