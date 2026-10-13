import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { TesseractEngine } from '../src/engines/tesseract-engine';
import { createWorker } from 'tesseract.js';

vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(),
}));

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

// Mock Canvas context for JSDOM
if (typeof document !== 'undefined') {
  const originalCreateElement = document.createElement.bind(document);
  document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
    const element = originalCreateElement(tagName, options);
    if (tagName === 'canvas') {
      (element as HTMLCanvasElement).getContext = vi.fn().mockReturnValue({
        drawImage: vi.fn(),
        putImageData: vi.fn(),
        getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
        canvas: element,
      });
      (element as HTMLCanvasElement).toBlob = vi.fn((callback) => {
        callback(new Blob());
      });
    }
    return element;
  }) as typeof document.createElement;
}

const createWorkerMock = vi.mocked(createWorker);

const makeWorker = (text: string = 'hello'): { recognize: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> } => ({
  recognize: vi.fn().mockResolvedValue({ data: { text } }) as unknown as ReturnType<typeof vi.fn>,
  terminate: vi.fn().mockResolvedValue(undefined) as unknown as ReturnType<typeof vi.fn>,
});

describe('TesseractEngine property tests', () => {
  beforeEach(() => {
    createWorkerMock.mockReset();
  });

  it('terminates the worker on destroy', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (text) => {
        const worker = makeWorker(text);
        createWorkerMock.mockResolvedValueOnce(worker as unknown as ReturnType<typeof makeWorker>);

        const engine = new TesseractEngine();
        await engine.load();
        await engine.destroy();

        expect(worker.terminate).toHaveBeenCalledTimes(1);
      }),
      { numRuns: 25 }
    );
  });
});

describe('TesseractEngine unit tests', () => {
  beforeEach(() => {
    createWorkerMock.mockReset();
  });

  it('loads the worker with English language support', async () => {
    const worker = makeWorker();
    createWorkerMock.mockResolvedValueOnce(worker as unknown as ReturnType<typeof makeWorker>);

    const engine = new TesseractEngine();
    await engine.load();

    expect(createWorkerMock).toHaveBeenCalledWith(
      'eng',
      1,
      expect.objectContaining({
        cacheMethod: 'write',
        workerPath: expect.stringContaining('/tesseract/worker.min.js') as unknown,
        corePath: expect.stringContaining('/tesseract-core/') as unknown,
        logger: expect.any(Function) as unknown,
      }) as unknown
    );
  });

  it('loads the worker with the requested language', async () => {
    const worker = makeWorker();
    createWorkerMock.mockResolvedValueOnce(worker as unknown as ReturnType<typeof makeWorker>);

    const engine = new TesseractEngine({ language: 'spa' });
    await engine.load();

    expect(createWorkerMock).toHaveBeenCalledWith(
      'spa',
      1,
      expect.objectContaining({
        cacheMethod: 'write',
        workerPath: expect.stringContaining('/tesseract/worker.min.js') as unknown,
        corePath: expect.stringContaining('/tesseract-core/') as unknown,
        logger: expect.any(Function) as unknown,
      }) as unknown
    );
  });

  it('invokes progress callback during load', async () => {
    const worker = makeWorker();
    const progressSpy = vi.fn();

    createWorkerMock.mockImplementationOnce((_lang, _oem, options): Promise<unknown> => {
      options?.logger?.({ status: 'loading', progress: 0.5 });
      return Promise.resolve(worker as unknown as ReturnType<typeof makeWorker>);
    });

    const engine = new TesseractEngine((status: string, progress?: number): void => {
      progressSpy(status, progress);
    });
    await engine.load();

    expect(progressSpy).toHaveBeenCalledWith('loading', 0.5);
  });

  it('processes images and returns text', async () => {
    const worker = makeWorker('OCR text');
    createWorkerMock.mockResolvedValueOnce(worker as unknown as ReturnType<typeof makeWorker>);

    const engine = new TesseractEngine();
    await engine.load();

    const result = await engine.process(new ImageData(1, 1));
    expect(result).toEqual({ text: 'OCR text', items: undefined });
    expect(worker.recognize).toHaveBeenCalled();
  });

  it('preserves line, paragraph and block identity from Tesseract word output', async () => {
    const line = {};
    const paragraph = {};
    const block = {};
    const word = {
      text: 'Hello',
      confidence: 90,
      bbox: { x0: 10, y0: 20, x1: 55, y1: 35 },
      line,
      paragraph,
      block,
    };
    const worker = makeWorker();
    worker.recognize.mockResolvedValueOnce({ data: { text: 'Hello', words: [word] } });
    createWorkerMock.mockResolvedValueOnce(worker as unknown as ReturnType<typeof makeWorker>);

    const engine = new TesseractEngine();
    await engine.load();
    const result = await engine.process(new ImageData(100, 80));

    expect(result.items?.[0]).toMatchObject({
      text: 'Hello',
      lineId: expect.any(String) as unknown,
      paragraphId: expect.any(String) as unknown,
      blockId: expect.any(String) as unknown,
      boundingBox: { x: 10, y: 20, width: 45, height: 15 },
    });
  });

  it('preserves word font metadata from Tesseract for writeback styling', async () => {
    const worker = makeWorker();
    worker.recognize.mockResolvedValueOnce({
      data: {
        text: 'Hello',
        words: [{
          text: 'Hello',
          confidence: 90,
          bbox: { x0: 10, y0: 20, x1: 55, y1: 35 },
          is_bold: true,
          is_italic: true,
          is_serif: true,
          font_size: 18,
        }],
      },
    });
    createWorkerMock.mockResolvedValueOnce(worker as unknown as ReturnType<typeof makeWorker>);

    const engine = new TesseractEngine();
    await engine.load();
    const result = await engine.process(new ImageData(100, 80));

    expect(result.items?.[0]?.style).toEqual({
      weight: 'bold',
      slant: 'italic',
      serif: true,
      fontSize: 18,
    });
  });

  it('destroys the worker on cleanup', async () => {
    const worker = makeWorker();
    createWorkerMock.mockResolvedValueOnce(worker as unknown as ReturnType<typeof makeWorker>);

    const engine = new TesseractEngine();
    await engine.load();
    await engine.destroy();

    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
