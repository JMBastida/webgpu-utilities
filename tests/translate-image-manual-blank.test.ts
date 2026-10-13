import { beforeEach, describe, expect, it, vi } from 'vitest';

const inpaintImage = vi.fn();
const canvasContext = {
  putImageData: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({
    data: new Uint8ClampedArray(width * height * 4),
  })),
  fillStyle: '',
};
const createCanvas = vi.fn(() => ({
  width: 0,
  height: 0,
  toBlob: (callback: (blob: Blob) => void): void => callback(new Blob(['png'])),
}));

vi.mock('../src/translate-image/inpaint', () => ({
  inpaintImage: (...args: unknown[]): Promise<ImageData> =>
    Promise.resolve(inpaintImage(...args) as ImageData),
}));

vi.mock('../src/translate-image/canvas', () => ({
  createCanvas: (...args: unknown[]): HTMLCanvasElement => createCanvas(...args) as HTMLCanvasElement,
  getContext2d: (): CanvasRenderingContext2D =>
    canvasContext as unknown as CanvasRenderingContext2D,
}));

import { translateImage } from '../src/translate-image';

if (typeof ImageData === 'undefined') {
  class ImageDataPolyfill {
    data: Uint8ClampedArray;
    width: number;
    height: number;

    constructor(dataOrWidth: Uint8ClampedArray | number, width?: number, height?: number) {
      this.width = typeof dataOrWidth === 'number' ? dataOrWidth : (width ?? 0);
      this.height = typeof dataOrWidth === 'number' ? (width ?? 0) : (height ?? 0);
      this.data =
        typeof dataOrWidth === 'number'
          ? new Uint8ClampedArray(this.width * this.height * 4)
          : dataOrWidth;
    }
  }

  // @ts-expect-error - jsdom does not define ImageData
  globalThis.ImageData = ImageDataPolyfill as unknown as typeof ImageData;
}

describe('translateImage manual blank edits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inpaintImage.mockImplementation((image: ImageData) => Promise.resolve(image));
  });

  it('erases the source region without rendering replacement text', async () => {
    const translate = vi.fn(() => Promise.resolve({ text: 'must not be used' }));
    const result = await translateImage({
      original: new ImageData(80, 40),
      ocrItems: [
        {
          text: 'Source text',
          confidence: 1,
          boundingBox: { x: 10, y: 10, width: 40, height: 12 },
        },
      ],
      engineId: 'tesseract',
      from: 'en',
      to: 'es',
      translator: { translate, destroy: vi.fn() },
      ocrSize: { width: 80, height: 40 },
      manualTranslations: [''],
    });

    expect(inpaintImage).toHaveBeenCalledTimes(1);
    expect(translate).not.toHaveBeenCalled();
    expect(canvasContext.putImageData).toHaveBeenCalledTimes(1);
    expect(result.regionTranslations).toEqual([{ sourceText: 'Source text', text: '' }]);
  });
});
