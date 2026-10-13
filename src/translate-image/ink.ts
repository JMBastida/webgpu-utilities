import type { OCRItem } from '@/types/ocr-engine';
import type { Bounds } from './mask';
import type { RGB } from './types';

type Color = [number, number, number];
type InkPixel = { x: number; y: number; color: Color; residual: number };
type InkMaskResult = {
  mask: Uint8ClampedArray;
  estimatedTextColors: Array<RGB | undefined>;
  fallbackItems: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const pixelIndex = (x: number, y: number, width: number): number => (y * width + x) * 4;

const averageSamples = (samples: Color[]): Color | null => {
  if (samples.length === 0) return null;
  const sum = samples.reduce(
    (total, color) => [total[0] + color[0], total[1] + color[1], total[2] + color[2]],
    [0, 0, 0]
  );
  return sum.map((value) => value / samples.length) as Color;
};

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const colorAt = (image: ImageData, x: number, y: number): Color => {
  const index = pixelIndex(x, y, image.width);
  return [image.data[index] ?? 0, image.data[index + 1] ?? 0, image.data[index + 2] ?? 0];
};

const averageBand = (
  image: ImageData,
  points: Array<[number, number]>
): Color | null => averageSamples(
  points
    .filter(([x, y]) => x >= 0 && y >= 0 && x < image.width && y < image.height)
    .map(([x, y]) => colorAt(image, x, y))
);

const interpolate = (a: Color | null, b: Color | null, amount: number): Color | null => {
  if (!a) return b;
  if (!b) return a;
  return a.map((value, index) => value + ((b[index] ?? value) - value) * amount) as Color;
};

const isInsideQuad = (item: OCRItem, x: number, y: number): boolean => {
  if (!item.quad || item.quad.length !== 4) {
    const box = item.boundingBox;
    return x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height;
  }
  let inside = false;
  for (let i = 0, j = item.quad.length - 1; i < item.quad.length; j = i, i += 1) {
    const [xi, yi] = item.quad[i] ?? [0, 0];
    const [xj, yj] = item.quad[j] ?? [0, 0];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

const backgroundModel = (
  image: ImageData,
  box: { x0: number; y0: number; x1: number; y1: number }
): ((x: number, y: number) => Color | null) => {
  const ring = 3;
  const leftByRow: Array<Color | null> = [];
  const rightByRow: Array<Color | null> = [];
  const topByColumn: Array<Color | null> = [];
  const bottomByColumn: Array<Color | null> = [];
  for (let y = box.y0; y < box.y1; y += 1) {
    leftByRow.push(averageBand(image, [-ring, -2, -1].flatMap((dx) => [-1, 0, 1].map((dy) => [box.x0 + dx, y + dy] as [number, number]))));
    rightByRow.push(averageBand(image, [0, 1, ring - 1].flatMap((dx) => [-1, 0, 1].map((dy) => [box.x1 + dx, y + dy] as [number, number]))));
  }
  for (let x = box.x0; x < box.x1; x += 1) {
    topByColumn.push(averageBand(image, [-ring, -1].flatMap((dy) => [-1, 0, 1].map((dx) => [x + dx, box.y0 + dy] as [number, number]))));
    bottomByColumn.push(averageBand(image, [0, ring - 1].flatMap((dy) => [-1, 0, 1].map((dx) => [x + dx, box.y1 + dy] as [number, number]))));
  }
  return (x: number, y: number): Color | null => {
    const left = leftByRow[y - box.y0] ?? null;
    const right = rightByRow[y - box.y0] ?? null;
    const top = topByColumn[x - box.x0] ?? null;
    const bottom = bottomByColumn[x - box.x0] ?? null;
    const horizontal = interpolate(left, right, clamp((x - box.x0) / Math.max(1, box.x1 - box.x0), 0, 1));
    const vertical = interpolate(top, bottom, clamp((y - box.y0) / Math.max(1, box.y1 - box.y0), 0, 1));
    if (!horizontal) return vertical;
    if (!vertical) return horizontal;
    return horizontal.map((value, index) => (value + (vertical[index] ?? value)) / 2) as Color;
  };
};

const distance = (a: Color, b: Color): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const chromaticityDistance = (a: Color, b: Color): number => {
  const normalize = (color: Color): Color => {
    const total = Math.max(1, color[0] + color[1] + color[2]);
    return color.map((channel) => channel / total) as Color;
  };
  return distance(normalize(a), normalize(b));
};

/**
 * Removes only pixels that differ strongly from a locally interpolated background
 * around each OCR token. If the surrounding pixels do not describe a stable surface,
 * it falls back to the token quad so low-contrast source lettering is not left behind.
 */
export const rasterizeInkToMask = (
  image: ImageData,
  items: OCRItem[],
  bounds: Bounds,
  threshold = 32
): InkMaskResult => {
  const mask = new Uint8ClampedArray(bounds.width * bounds.height);
  const estimatedTextColors: Array<RGB | undefined> = [];
  let fallbackItems = 0;

  for (const item of items) {
    const box = item.boundingBox;
    const x0 = clamp(Math.floor(box.x), 0, image.width);
    const y0 = clamp(Math.floor(box.y), 0, image.height);
    const x1 = clamp(Math.ceil(box.x + box.width), x0, image.width);
    const y1 = clamp(Math.ceil(box.y + box.height), y0, image.height);
    const width = x1 - x0;
    const height = y1 - y0;
    const inkPixels: InkPixel[] = [];
    const backgroundResiduals: number[] = [];
    const boxArea = Math.max(1, width * height);
    const estimateBackground = backgroundModel(image, { x0, y0, x1, y1 });

    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        if (!isInsideQuad(item, x + 0.5, y + 0.5)) continue;
        const background = estimateBackground(x, y);
        if (!background) continue;
        const current = colorAt(image, x, y);
        const residual = distance(current, background);
        backgroundResiduals.push(residual);
        if (residual >= threshold) inkPixels.push({ x, y, color: current, residual });
      }
    }

    const medianResidual = median(backgroundResiduals);
    const candidateColor = [0, 1, 2].map((channel) =>
      median(inkPixels.map((pixel) => pixel.color[channel] ?? 0))
    ) as RGB;
    const corePixels = inkPixels.filter((pixel) => distance(pixel.color, candidateColor) <= 28);
    const inkRatio = corePixels.length / boxArea;
    const consistentForeground =
      inkPixels.length === 0 || corePixels.length / inkPixels.length >= 0.55;
    const strongestResidual = inkPixels.reduce((max, pixel) => Math.max(max, pixel.residual), 0);
    const strongPixels = inkPixels.filter((pixel) =>
      pixel.residual >= Math.max(threshold * 3, strongestResidual * 0.7)
    );
    const strongColor = [0, 1, 2].map((channel) =>
      median(strongPixels.map((pixel) => pixel.color[channel] ?? 0))
    ) as Color;
    const offHuePixels = strongPixels.filter(
      (pixel) => chromaticityDistance(pixel.color, strongColor) > 0.16
    );
    const mixedForeground =
      offHuePixels.length >= Math.max(4, boxArea * 0.01) &&
      offHuePixels.length / Math.max(1, strongPixels.length) >= 0.08;
    const trustworthy =
      corePixels.length >= 4 &&
      inkRatio >= 0.012 &&
      inkRatio <= 0.62 &&
      consistentForeground &&
      !mixedForeground &&
      medianResidual < threshold;
    if (trustworthy) {
      for (const pixel of corePixels) {
        const localX = pixel.x - bounds.x;
        const localY = pixel.y - bounds.y;
        if (localX >= 0 && localY >= 0 && localX < bounds.width && localY < bounds.height) {
          mask[localY * bounds.width + localX] = 255;
        }
      }
      // Estimate from the original RGB pixels. Some OCR engines receive a
      // grayscale preprocessing image, so their style hint can lose hue.
      estimatedTextColors.push(candidateColor);
    } else {
      fallbackItems += 1;
      // A fallback means the original pixels did not support a reliable RGB
      // estimate. Do not promote an OCR hint that may come from grayscale input.
      estimatedTextColors.push(undefined);
      // Conservative fallback: erase the full OCR quad when local contrast is ambiguous.
      for (let y = Math.max(bounds.y, y0); y < Math.min(bounds.y + bounds.height, y1); y += 1) {
        for (let x = Math.max(bounds.x, x0); x < Math.min(bounds.x + bounds.width, x1); x += 1) {
          if (isInsideQuad(item, x + 0.5, y + 0.5)) {
            mask[(y - bounds.y) * bounds.width + x - bounds.x] = 255;
          }
        }
      }
    }
  }

  return { mask, estimatedTextColors, fallbackItems };
};
