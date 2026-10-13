import { describe, expect, it } from 'vitest';
import { inpaintImage } from '../src/translate-image/inpaint';
import type { Bounds } from '../src/translate-image/mask';

if (typeof ImageData === 'undefined') {
  class ImageDataPolyfill {
    data: Uint8ClampedArray;
    width: number;
    height: number;

    constructor(dataOrWidth: Uint8ClampedArray | number, width?: number, height?: number) {
      if (typeof dataOrWidth === 'number') {
        this.width = dataOrWidth;
        this.height = width ?? 0;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = dataOrWidth;
        this.width = width ?? 0;
        this.height = height ?? 0;
      }
    }
  }

  // @ts-expect-error - test environment polyfill
  globalThis.ImageData = ImageDataPolyfill as unknown as typeof ImageData;
}

const createImage = (
  width: number,
  height: number,
  rgba: [number, number, number, number]
): ImageData => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgba[0];
    data[i + 1] = rgba[1];
    data[i + 2] = rgba[2];
    data[i + 3] = rgba[3];
  }
  return new ImageData(data, width, height);
};

const paintRect = (
  image: ImageData,
  x: number,
  y: number,
  width: number,
  height: number,
  rgba: [number, number, number, number]
): void => {
  for (let iy = y; iy < y + height; iy += 1) {
    for (let ix = x; ix < x + width; ix += 1) {
      const idx = (iy * image.width + ix) * 4;
      image.data[idx] = rgba[0];
      image.data[idx + 1] = rgba[1];
      image.data[idx + 2] = rgba[2];
      image.data[idx + 3] = rgba[3];
    }
  }
};

describe('inpaint fallback', () => {
  it('fills masked regions without leaving original text', async () => {
    const image = createImage(32, 32, [200, 200, 200, 255]);
    paintRect(image, 10, 10, 12, 8, [255, 0, 0, 255]);

    const bounds: Bounds = { x: 0, y: 0, width: 32, height: 32 };
    const mask = new Uint8ClampedArray(bounds.width * bounds.height);
    for (let y = 10; y < 18; y += 1) {
      for (let x = 10; x < 22; x += 1) {
        mask[y * bounds.width + x] = 255;
      }
    }

    const result = await inpaintImage(image, mask, bounds, { strategy: 'ts-fallback' });
    const centerIdx = (14 * result.width + 14) * 4;
    expect(result.data[centerIdx + 1]).toBeGreaterThan(100);
    expect(result.data[centerIdx + 2]).toBeGreaterThan(100);
  });

  it('forces masked alpha to opaque while preserving unmasked alpha', async () => {
    const image = createImage(10, 10, [10, 10, 10, 128]);

    const bounds: Bounds = { x: 0, y: 0, width: 10, height: 10 };
    const mask = new Uint8ClampedArray(bounds.width * bounds.height);
    mask[0] = 255;

    const result = await inpaintImage(image, mask, bounds, { strategy: 'ts-fallback' });
    const maskedIdx = 0;
    const unmaskedIdx = (1 * result.width + 1) * 4;

    expect(result.data[maskedIdx + 3]).toBe(255);
    expect(result.data[unmaskedIdx + 3]).toBe(128);
  });

  it('fast preset fills the mask from the unmasked neighborhood and leaves the rest unchanged', async () => {
    const image = createImage(8, 8, [120, 140, 160, 255]);
    paintRect(image, 3, 3, 2, 2, [0, 0, 0, 255]);
    const mask = new Uint8ClampedArray(64);
    mask[3 * 8 + 3] = 255;
    mask[3 * 8 + 4] = 255;
    mask[4 * 8 + 3] = 255;
    mask[4 * 8 + 4] = 255;

    const result = await inpaintImage(image, mask, { x: 0, y: 0, width: 8, height: 8 }, { quality: 'fast' });
    const filledIndex = (3 * 8 + 3) * 4;
    const untouchedIndex = 0;
    expect(Array.from(result.data.slice(filledIndex, filledIndex + 3))).toEqual([120, 140, 160]);
    expect(Array.from(result.data.slice(untouchedIndex, untouchedIndex + 4))).toEqual([120, 140, 160, 255]);
  });
});
