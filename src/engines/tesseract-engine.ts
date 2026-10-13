import { createWorker, type Worker } from 'tesseract.js';
import type { IOCREngine, OCRResult } from '@/types/ocr-engine';
import { normalizeTesseractLanguage } from '@/utils/language-config';

export type TesseractProgressCallback = (status: string, progress: number) => void;

export interface TesseractEngineOptions {
  language?: string;
  onProgress?: TesseractProgressCallback;
}

export class TesseractEngine implements IOCREngine {
  public readonly id = 'tesseract';
  public isLoading = false;
  private worker: Worker | null = null;
  private readonly onProgress?: TesseractProgressCallback;
  private readonly language: string;

  constructor(options?: TesseractEngineOptions | TesseractProgressCallback) {
    if (typeof options === 'function') {
      this.onProgress = options;
      this.language = 'eng';
    } else {
      this.onProgress = options?.onProgress;
      this.language = normalizeTesseractLanguage(options?.language ?? 'eng');
    }
  }

  async load(): Promise<void> {
    if (this.worker) {
      return;
    }

    this.isLoading = true;
    try {
      const baseUrl = import.meta.env.BASE_URL ?? '/';
      this.worker = await createWorker(this.language, 1, {
        workerPath: new URL(`${baseUrl}tesseract/worker.min.js`, window.location.origin).toString(),
        corePath: new URL(`${baseUrl}tesseract-core/`, window.location.origin).toString(),
        langPath: import.meta.env.VITE_TESSERACT_LANG_PATH,
        cacheMethod: 'write',
        cachePath: '.',
        logger: (message) => {
          if (this.onProgress) {
            this.onProgress(message.status, message.progress ?? 0);
          }
        },
      });
    } finally {
      this.isLoading = false;
    }
  }

  async process(data: ImageData): Promise<OCRResult> {
    if (!this.worker) {
      throw new Error('Tesseract engine not loaded.');
    }

    const blob = await this.imageDataToBlob(data);
    const result = await this.worker.recognize(blob);
    const identities = new WeakMap<object, number>();
    let nextIdentity = 1;
    const idFor = (value: object | undefined, prefix: string): string | undefined => {
      if (!value) return undefined;
      let id = identities.get(value);
      if (!id) {
        id = nextIdentity++;
        identities.set(value, id);
      }
      return `${prefix}-${id}`;
    };
    return {
      text: result.data.text ?? '',
      items: result.data.words?.map((word) => ({
        text: word.text,
        confidence: word.confidence / 100,
        lineId: idFor(word.line, 'line'),
        paragraphId: idFor(word.paragraph, 'paragraph'),
        blockId: idFor(word.block, 'block'),
        boundingBox: {
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0,
        },
      })),
    };
  }

  async destroy(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }

  private async imageDataToBlob(imageData: ImageData): Promise<Blob> {
    const { width, height } = imageData;
    const canvas = this.createCanvas(width, height);
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 2D context is not available.');
    }

    context.putImageData(imageData, 0, 0);

    if ('convertToBlob' in canvas) {
      return await canvas.convertToBlob({ type: 'image/png' });
    }

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to encode image for OCR.'));
        }
      }, 'image/png');
    });
  }

  private createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(width, height);
    }

    if (typeof document === 'undefined') {
      throw new Error('Canvas creation is not available in this environment.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
}
