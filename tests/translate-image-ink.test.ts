import { describe, expect, it } from 'vitest';
import { rasterizeInkToMask } from '../src/translate-image/ink';
import type { OCRItem } from '../src/types/ocr-engine';

if (typeof ImageData === 'undefined') {
  class ImageDataPolyfill {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  }
  // @ts-expect-error - test environment polyfill
  globalThis.ImageData = ImageDataPolyfill as unknown as typeof ImageData;
}

const createSurface = (width: number, height: number): ImageData => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      data[index] = 100 + x;
      data[index + 1] = 120 + y;
      data[index + 2] = 150 + (x % 8 === 0 ? 10 : 0);
      data[index + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
};

const paintPixel = (image: ImageData, x: number, y: number, color: [number, number, number]): void => {
  const index = (y * image.width + x) * 4;
  image.data[index] = color[0];
  image.data[index + 1] = color[1];
  image.data[index + 2] = color[2];
};

describe('OCR ink mask', () => {
  it('masks lettering instead of the whole box on a smooth gradient with fine texture', () => {
    const image = createSurface(64, 32);
    const item: OCRItem = {
      text: 'H',
      confidence: 1,
      boundingBox: { x: 18, y: 9, width: 18, height: 12 },
    };
    for (let y = 11; y < 19; y += 1) {
      paintPixel(image, 22, y, [22, 30, 38]);
      paintPixel(image, 26, y, [22, 30, 38]);
      if (y === 15) {
        for (let x = 22; x <= 26; x += 1) paintPixel(image, x, y, [22, 30, 38]);
      }
    }

    const { mask, estimatedTextColors, fallbackItems } = rasterizeInkToMask(
      image,
      [item],
      { x: 0, y: 0, width: image.width, height: image.height }
    );
    const maskPixels = mask.reduce((total, value) => total + Number(value > 0), 0);

    expect(fallbackItems).toBe(0);
    expect(maskPixels).toBeGreaterThan(15);
    expect(maskPixels).toBeLessThan(item.boundingBox.width * item.boundingBox.height * 0.45);
    expect(estimatedTextColors[0]?.[0]).toBeLessThan(40);
    expect(estimatedTextColors[0]?.[1]).toBeLessThan(50);
    expect(estimatedTextColors[0]?.[2]).toBeLessThan(60);
    expect(mask[5 * image.width + 20]).toBe(0);
  });

  it('falls back to the OCR quad when a textured patch makes local contrast unreliable', () => {
    const image = createSurface(40, 30);
    const item: OCRItem = {
      text: 'x',
      confidence: 1,
      boundingBox: { x: 10, y: 8, width: 15, height: 12 },
    };
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        if ((x + y) % 2 === 0) paintPixel(image, x, y, [15, 15, 15]);
      }
    }

    const { mask, fallbackItems } = rasterizeInkToMask(image, [item], {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
    const maskedInsideBox = mask.reduce((total, value, index) => {
      const x = index % image.width;
      const y = Math.floor(index / image.width);
      return total + Number(value > 0 && x >= 10 && x < 25 && y >= 8 && y < 20);
    }, 0);

    expect(fallbackItems).toBe(1);
    expect(maskedInsideBox).toBe(15 * 12);
  });
});
