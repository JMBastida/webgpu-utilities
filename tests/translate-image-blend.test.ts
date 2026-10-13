import { describe, expect, it } from 'vitest';
import { blendLayer } from '../src/translate-image/blend';
import type { RGB } from '../src/translate-image/types';

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

const makeImage = (width: number, height: number, rgba: [number, number, number, number]): ImageData => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return new ImageData(data, width, height);
};

describe('image layer blending', () => {
  it('clips negative coordinates before computing pixel indices', () => {
    const target = makeImage(100, 20, [255, 255, 255, 255]);
    const layer = makeImage(3, 3, [0, 0, 0, 255]);
    blendLayer(target, layer, { x: -1, y: 10, width: 3, height: 3 }, {
      color: [0, 0, 0] as RGB,
      mode: 'shadow',
      textIsDark: true,
    });

    const accidentalPreviousRow = (9 * target.width + 99) * 4;
    const clippedFirstColumn = (10 * target.width) * 4;
    expect(Array.from(target.data.slice(accidentalPreviousRow, accidentalPreviousRow + 3))).toEqual([
      255, 255, 255,
    ]);
    expect(Array.from(target.data.slice(clippedFirstColumn, clippedFirstColumn + 3))).toEqual([
      0, 0, 0,
    ]);
  });
});
