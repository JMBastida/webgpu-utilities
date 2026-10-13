import type { Bounds } from './mask';
import type { RGB } from './types';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const luma = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

export type TextureData = {
  width: number;
  height: number;
  tex: Int16Array;
  avgLuma: number;
};

const boxBlurLuma = (
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): Uint8ClampedArray => {
  const w1 = width + 1;
  const integral = new Uint32Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= width; x += 1) {
      rowSum += source[(y - 1) * width + (x - 1)] ?? 0;
      integral[y * w1 + x] = (integral[(y - 1) * w1 + x] ?? 0) + rowSum;
    }
  }
  const output = new Uint8ClampedArray(width * height);
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
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      output[y * width + x] = Math.round(sum / area);
    }
  }
  return output;
};

export const prepareTexture = (image: ImageData, bounds: Bounds): TextureData => {
  const { width: imageWidth } = image;
  const lumaValues = new Uint8ClampedArray(bounds.width * bounds.height);
  let sumLuma = 0;
  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const idx = ((bounds.y + y) * imageWidth + (bounds.x + x)) * 4;
      const r = image.data[idx] ?? 0;
      const g = image.data[idx + 1] ?? 0;
      const b = image.data[idx + 2] ?? 0;
      const value = luma(r, g, b);
      lumaValues[y * bounds.width + x] = Math.round(value);
      sumLuma += value;
    }
  }
  const blurred = boxBlurLuma(lumaValues, bounds.width, bounds.height, 2);
  const tex = new Int16Array(bounds.width * bounds.height);
  for (let i = 0; i < tex.length; i += 1) {
    tex[i] = (lumaValues[i] ?? 0) - (blurred[i] ?? 0);
  }
  const avgLuma = sumLuma / (bounds.width * bounds.height * 255);
  return { width: bounds.width, height: bounds.height, tex, avgLuma };
};

export const blendLayer = (
  target: ImageData,
  layer: ImageData,
  bounds: Bounds,
  options: { color: RGB; mode: 'text' | 'shadow'; textIsDark: boolean; texture?: TextureData }
): void => {
  const { width: targetWidth } = target;
  const { width: layerWidth } = layer;
  for (let y = 0; y < layer.height; y += 1) {
    for (let x = 0; x < layerWidth; x += 1) {
      const targetX = bounds.x + x;
      const targetY = bounds.y + y;
      if (targetX < 0 || targetY < 0 || targetX >= target.width || targetY >= target.height) continue;
      const layerIdx = (y * layerWidth + x) * 4;
      const alpha = (layer.data[layerIdx + 3] ?? 0) / 255;
      if (alpha <= 0) continue;
      let a = alpha;
      if (options.mode === 'text' && options.texture) {
        const texVal = options.texture.tex[y * layerWidth + x] ?? 0;
        a = clamp01(a * (1 + (texVal / 255) * 0.18));
      }
      if (a <= 0) continue;
      const idx = (targetY * targetWidth + targetX) * 4;
      const bgR = target.data[idx] ?? 0;
      const bgG = target.data[idx + 1] ?? 0;
      const bgB = target.data[idx + 2] ?? 0;
      const [tr = 0, tg = 0, tb = 0] = options.color;
      let outR: number;
      let outG: number;
      let outB: number;
      if (options.mode === 'shadow') {
        outR = bgR * (1 - a) + tr * a;
        outG = bgG * (1 - a) + tg * a;
        outB = bgB * (1 - a) + tb * a;
      } else if (options.textIsDark) {
        outR = bgR * (1 - a) + bgR * (tr / 255) * a;
        outG = bgG * (1 - a) + bgG * (tg / 255) * a;
        outB = bgB * (1 - a) + bgB * (tb / 255) * a;
      } else {
        const screenR = 255 - ((255 - bgR) * (255 - tr)) / 255;
        const screenG = 255 - ((255 - bgG) * (255 - tg)) / 255;
        const screenB = 255 - ((255 - bgB) * (255 - tb)) / 255;
        outR = bgR * (1 - a) + screenR * a;
        outG = bgG * (1 - a) + screenG * a;
        outB = bgB * (1 - a) + screenB * a;
      }
      target.data[idx] = Math.round(outR);
      target.data[idx + 1] = Math.round(outG);
      target.data[idx + 2] = Math.round(outB);
    }
  }
};
