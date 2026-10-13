/* @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { initApp } from '../src/app';
import type { FeatureDetector } from '../src/utils/feature-detector';
import type { ImageProcessor } from '../src/utils/image-processor';
import type { OCRManager } from '../src/ocr-manager';
import type { OCRResult, IOCREngine } from '../src/types/ocr-engine';
import { EngineFactory } from '../src/engines/engine-factory';
import type { ITextTranslator } from '../src/types/translation';
import type { TranslateImageInput, TranslateImageOutput } from '../src/translate-image/types';

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

if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:test');
}

if (typeof URL.revokeObjectURL === 'undefined') {
  URL.revokeObjectURL = vi.fn();
}

const createSupportedDetector = (): FeatureDetector =>
  ({
    detect: () => ({
      wasm: true,
      webWorkers: true,
      indexedDB: true,
      webgpu: false,
      supported: true,
      missing: [],
    }),
  }) as unknown as FeatureDetector;

const createImageProcessorStub = (): ImageProcessor =>
  ({
    sourceToImageData: vi.fn((): Promise<ImageData> => Promise.resolve(new ImageData(100, 100))),
    resize: vi.fn((data: ImageData) => data),
    preprocess: vi.fn((data: ImageData) => data),
  }) as unknown as ImageProcessor;

const registerTestEngine = (factory: EngineFactory): void => {
  factory.register(
    'tesseract',
    () =>
      ({
        id: 'tesseract',
        isLoading: false,
        load: (): Promise<void> => Promise.resolve(),
        process: (): Promise<OCRResult> =>
          Promise.resolve({
            text: 'Detected',
            items: [
              {
                text: 'Detected',
                confidence: 0.9,
                boundingBox: { x: 10, y: 10, width: 40, height: 10 },
              },
            ],
          }),
        destroy: (): Promise<void> => Promise.resolve(),
      }) as IOCREngine
  );
};

const attachFile = (input: HTMLInputElement, file: File): void => {
  Object.defineProperty(input, 'files', {
    value: [file],
    writable: false,
    configurable: true,
  });
  input.dispatchEvent(new Event('change'));
};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('Translate image UI', () => {
  it('enables download after translation', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.querySelector<HTMLElement>('#app');
    if (!root) throw new Error('Missing root');

    const translateSpy = vi.fn(() => Promise.resolve({ text: 'Translated' }));
    const translator: ITextTranslator = {
      translate: translateSpy,
      destroy: vi.fn(),
    };
    const translateImageImpl = vi.fn(
      (_input: TranslateImageInput): Promise<TranslateImageOutput> =>
        Promise.resolve({
          blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
          regionTranslations: [{ sourceText: 'Detected', text: 'Translated' }],
        })
    );

    const app = initApp({
      root,
      featureDetector: createSupportedDetector(),
      imageProcessor: createImageProcessorStub(),
      ocrManager: {
        setEngine: vi.fn(),
        run: vi.fn(
          (): Promise<OCRResult> =>
            Promise.resolve({
              text: 'Detected',
              items: [
                {
                  text: 'Detected',
                  confidence: 0.9,
                  boundingBox: { x: 10, y: 10, width: 40, height: 10 },
                },
              ],
            })
        ),
      } as unknown as OCRManager,
      registerEngines: (factory) => registerTestEngine(factory),
      createTranslator: () => Promise.resolve(translator),
      translateImageImpl,
    });

    const file = new File([new Uint8Array([1])], 'sample.png', { type: 'image/png' });
    attachFile(app.elements.fileInput, file);
    await app.runOcr();

    const replacementButton = root.querySelector<HTMLButtonElement>('#translate-image-run')!;
    const qualitySelect = root.querySelector<HTMLSelectElement>('#translate-image-quality')!;
    qualitySelect.value = 'fast';
    qualitySelect.dispatchEvent(new Event('change'));
    expect(replacementButton.disabled).toBe(false);
    qualitySelect.value = 'balanced';
    qualitySelect.dispatchEvent(new Event('change'));
    expect(replacementButton.disabled).toBe(false);

    replacementButton.click();
    await flushPromises();

    const downloadButton = root.querySelector<HTMLButtonElement>('#translate-image-download')!;
    expect(downloadButton.disabled).toBe(false);
    const translatedCard = root.querySelector<HTMLDivElement>('#translate-image-result')!;
    const translatedPreview = root.querySelector<HTMLImageElement>('#translate-image-preview')!;
    expect(translatedCard.classList.contains('hidden')).toBe(false);
    expect(translatedPreview.src).toContain('blob:');
    const [translationInput, translationOptions] = translateImageImpl.mock.calls[0] ?? [];
    expect(translationInput?.ocrItems).toEqual(expect.any(Array));
    expect(translationInput?.original).toBeInstanceOf(ImageData);
    expect(translationOptions).toEqual({ quality: 'balanced' });

    const replacementInput = root.querySelector<HTMLTextAreaElement>('#translate-image-edit-0')!;
    expect(replacementInput.value).toBe('Translated');
    replacementInput.value = 'Edited replacement';
    root.querySelector<HTMLButtonElement>('#translate-image-apply-edits')!.click();
    await flushPromises();
    expect(translateImageImpl).toHaveBeenCalledTimes(2);
    expect(translateImageImpl.mock.calls[1]?.[0].manualTranslations).toEqual([
      'Edited replacement',
    ]);
    expect(translateImageImpl.mock.calls[1]?.[0].translator).toBe(translator);

    replacementInput.value = '';
    root.querySelector<HTMLButtonElement>('#translate-image-apply-edits')!.click();
    await flushPromises();
    expect(translateImageImpl).toHaveBeenCalledTimes(3);
    expect(translateImageImpl.mock.calls[2]?.[0].manualTranslations).toEqual(['']);

    replacementButton.click();
    await flushPromises();
    expect(translateImageImpl).toHaveBeenCalledTimes(4);

    attachFile(
      app.elements.fileInput,
      new File([new Uint8Array([2])], 'next.png', { type: 'image/png' })
    );
    expect(translatedCard.classList.contains('hidden')).toBe(true);
    expect(downloadButton.disabled).toBe(true);
    expect(replacementButton.disabled).toBe(true);
  });

  it('shows errors when image translation fails', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.querySelector<HTMLElement>('#app');
    if (!root) throw new Error('Missing root');

    const translateSpy = vi.fn(() => Promise.resolve({ text: 'Translated' }));
    const translator: ITextTranslator = {
      translate: translateSpy,
      destroy: vi.fn(),
    };
    const translateImageFailure = new Error('Could not fetch model for en->es');
    (translateImageFailure as Error & { cause?: unknown }).cause = new Error(
      'Could not download model asset. Set VITE_BERGAMOT_MODEL_ASSET_BASE_URL for same-origin assets.'
    );
    const translateImageImpl = vi.fn(
      (): Promise<TranslateImageOutput> => Promise.reject(translateImageFailure)
    );

    const app = initApp({
      root,
      featureDetector: createSupportedDetector(),
      imageProcessor: createImageProcessorStub(),
      ocrManager: {
        setEngine: vi.fn(),
        run: vi.fn(
          (): Promise<OCRResult> =>
            Promise.resolve({
              text: 'Detected',
              items: [
                {
                  text: 'Detected',
                  confidence: 0.9,
                  boundingBox: { x: 10, y: 10, width: 40, height: 10 },
                },
              ],
            })
        ),
      } as unknown as OCRManager,
      registerEngines: (factory) => registerTestEngine(factory),
      createTranslator: () => Promise.resolve(translator),
      translateImageImpl,
    });

    const file = new File([new Uint8Array([1])], 'sample.png', { type: 'image/png' });
    attachFile(app.elements.fileInput, file);
    await app.runOcr();

    const runButton = root.querySelector<HTMLButtonElement>('#translate-image-run')!;
    runButton.click();
    await flushPromises();

    const error = root.querySelector<HTMLDivElement>('#translate-image-error')!;
    expect(error.classList.contains('hidden')).toBe(false);
    expect(error.textContent).toContain('Could not fetch model');
    expect(error.textContent).toContain('VITE_BERGAMOT_MODEL_ASSET_BASE_URL');
  });

  it('allows manual replacement when the translation model cannot load', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.querySelector<HTMLElement>('#app')!;
    const translateImageImpl = vi.fn(
      (): Promise<TranslateImageOutput> =>
        Promise.resolve({
          blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
          regionTranslations: [{ sourceText: 'Detected', text: 'Manual Spanish' }],
        })
    );
    const app = initApp({
      root,
      featureDetector: createSupportedDetector(),
      imageProcessor: createImageProcessorStub(),
      ocrManager: {
        setEngine: vi.fn(),
        run: vi.fn(() =>
          Promise.resolve({
            text: 'Detected',
            items: [
              {
                text: 'Detected',
                confidence: 0.9,
                boundingBox: { x: 10, y: 10, width: 40, height: 10 },
              },
            ],
          })
        ),
      } as unknown as OCRManager,
      registerEngines: (factory) => registerTestEngine(factory),
      createTranslator: () => Promise.reject(new Error('Model storage is blocked')),
      translateImageImpl,
    });

    attachFile(app.elements.fileInput, new File([new Uint8Array([1])], 'sample.png'));
    await app.runOcr();

    const editor = root.querySelector<HTMLTextAreaElement>('#translate-image-edit-0')!;
    const applyButton = root.querySelector<HTMLButtonElement>('#translate-image-apply-edits')!;
    expect(editor.value).toBe('Detected');
    expect(applyButton.disabled).toBe(false);
    root.querySelector<HTMLButtonElement>('#translate-image-run')!.click();
    await flushPromises();
    expect(root.querySelector('#translate-image-error')?.textContent).toContain(
      'Model storage is blocked'
    );
    expect(applyButton.disabled).toBe(false);

    editor.value = 'Manual Spanish';
    applyButton.click();
    await flushPromises();
    expect(translateImageImpl).toHaveBeenCalledTimes(1);
    expect(translateImageImpl.mock.calls[0]?.[0].manualTranslations).toEqual(['Manual Spanish']);
    expect(root.querySelector<HTMLButtonElement>('#translate-image-download')?.disabled).toBe(false);
  });

  it('keeps overflowing translated text editable for a manual correction', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.querySelector<HTMLElement>('#app')!;
    const translator: ITextTranslator = {
      translate: vi.fn(() => Promise.resolve({ text: 'X'.repeat(1000) })),
      destroy: vi.fn(),
    };
    const translateImageImpl = vi
      .fn<(_input: TranslateImageInput) => Promise<TranslateImageOutput>>()
      .mockRejectedValueOnce(new Error('Translated text cannot fit in the detected region.'))
      .mockResolvedValueOnce({
        blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
        regionTranslations: [{ sourceText: 'Detected', text: 'OK' }],
      });
    const app = initApp({
      root,
      featureDetector: createSupportedDetector(),
      imageProcessor: createImageProcessorStub(),
      ocrManager: {
        setEngine: vi.fn(),
        run: vi.fn(() =>
          Promise.resolve({
            text: 'Detected',
            items: [
              {
                text: 'Detected',
                confidence: 0.9,
                boundingBox: { x: 10, y: 10, width: 40, height: 10 },
              },
            ],
          })
        ),
      } as unknown as OCRManager,
      registerEngines: (factory) => registerTestEngine(factory),
      createTranslator: () => Promise.resolve(translator),
      translateImageImpl,
    });

    attachFile(app.elements.fileInput, new File([new Uint8Array([1])], 'sample.png'));
    await app.runOcr();
    root.querySelector<HTMLButtonElement>('#translate-image-run')!.click();
    await flushPromises();

    const editor = root.querySelector<HTMLTextAreaElement>('#translate-image-edit-0')!;
    const applyButton = root.querySelector<HTMLButtonElement>('#translate-image-apply-edits')!;
    expect(editor.value).toHaveLength(1000);
    expect(root.querySelector('#translate-image-error')?.textContent).toContain('cannot fit');
    expect(applyButton.disabled).toBe(false);

    editor.value = 'OK';
    applyButton.click();
    await flushPromises();
    expect(translateImageImpl).toHaveBeenCalledTimes(2);
    const correctedInput = translateImageImpl.mock.calls[1]?.[0] as
      | TranslateImageInput
      | undefined;
    expect(correctedInput?.manualTranslations).toEqual(['OK']);
    expect(root.querySelector<HTMLButtonElement>('#translate-image-download')?.disabled).toBe(false);
  });

  it('retries model initialization after a failed load', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.querySelector<HTMLElement>('#app')!;
    const translator: ITextTranslator = {
      translate: vi.fn(() => Promise.resolve({ text: 'Hola' })),
      destroy: vi.fn(),
    };
    const createTranslator = vi
      .fn()
      .mockRejectedValueOnce(new Error('Model unavailable'))
      .mockResolvedValueOnce(translator);
    const translateImageImpl = vi.fn(() =>
      Promise.resolve({ blob: new Blob(['png'], { type: 'image/png' }) })
    );
    const app = initApp({
      root,
      featureDetector: createSupportedDetector(),
      imageProcessor: createImageProcessorStub(),
      ocrManager: {
        setEngine: vi.fn(),
        run: vi.fn(() =>
          Promise.resolve({
            text: 'Hello',
            items: [
              {
                text: 'Hello',
                confidence: 0.9,
                boundingBox: { x: 10, y: 10, width: 40, height: 10 },
              },
            ],
          })
        ),
      } as unknown as OCRManager,
      registerEngines: (factory) => registerTestEngine(factory),
      createTranslator,
      translateImageImpl,
    });
    attachFile(
      app.elements.fileInput,
      new File([new Uint8Array([1])], 'retry.png', { type: 'image/png' })
    );
    await app.runOcr();

    const runButton = root.querySelector<HTMLButtonElement>('#translate-image-run')!;
    runButton.click();
    await flushPromises();
    expect(root.querySelector('#translate-image-error')?.textContent).toContain(
      'Model unavailable'
    );
    runButton.click();
    await flushPromises();

    expect(createTranslator).toHaveBeenCalledTimes(2);
    expect(root.querySelector<HTMLButtonElement>('#translate-image-download')?.disabled).toBe(
      false
    );
  });

  it('discards a replacement that finishes after the source image changes', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.querySelector<HTMLElement>('#app')!;
    const translator: ITextTranslator = {
      translate: vi.fn(() => Promise.resolve({ text: 'Hola' })),
      destroy: vi.fn(),
    };
    let completeReplacement: ((output: TranslateImageOutput) => void) | undefined;
    const app = initApp({
      root,
      featureDetector: createSupportedDetector(),
      imageProcessor: createImageProcessorStub(),
      ocrManager: {
        setEngine: vi.fn(),
        run: vi.fn(() =>
          Promise.resolve({
            text: 'Hello',
            items: [
              {
                text: 'Hello',
                confidence: 0.9,
                boundingBox: { x: 10, y: 10, width: 40, height: 10 },
              },
            ],
          })
        ),
      } as unknown as OCRManager,
      registerEngines: (factory) => registerTestEngine(factory),
      createTranslator: () => Promise.resolve(translator),
      translateImageImpl: () =>
        new Promise((resolve) => {
          completeReplacement = resolve;
        }),
    });
    attachFile(
      app.elements.fileInput,
      new File([new Uint8Array([1])], 'first.png', { type: 'image/png' })
    );
    await app.runOcr();
    const runButton = root.querySelector<HTMLButtonElement>('#translate-image-run')!;
    runButton.click();
    await flushPromises();
    expect(completeReplacement).toBeDefined();

    attachFile(
      app.elements.fileInput,
      new File([new Uint8Array([2])], 'second.png', { type: 'image/png' })
    );
    completeReplacement?.({ blob: new Blob(['old output'], { type: 'image/png' }) });
    await flushPromises();

    expect(root.querySelector<HTMLDivElement>('#translate-image-result')?.classList.contains('hidden')).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('#translate-image-download')?.disabled).toBe(true);
  });
});
