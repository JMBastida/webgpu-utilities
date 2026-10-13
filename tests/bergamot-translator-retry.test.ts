import { afterEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({ constructors: 0 }));

vi.mock('@browsermt/bergamot-translator/translator.js', () => ({
  TranslatorBacking: class {
    options: unknown;
    onerror = (): void => undefined;
    loadWorker = (): Promise<never> => Promise.reject(new Error('overridden by adapter'));
    constructor(options: unknown) {
      this.options = options;
    }
  },
  LatencyOptimisedTranslator: class {
    worker: Promise<unknown>;
    handle: { exports: Record<string, (...args: unknown[]) => Promise<unknown>> } | undefined;
    constructor(_options: unknown, backing: { loadWorker: () => Promise<unknown> }) {
      mockState.constructors += 1;
      this.worker = backing.loadWorker().then((handle) => {
        this.handle = handle as typeof this.handle;
        return this;
      });
    }
    async translate(request: unknown): Promise<{ target: { text: string } }> {
      await this.handle?.exports.translate(request);
      return { target: { text: 'ok' } };
    }
    delete(): void {}
  },
}));

import {
  BergamotTextTranslator,
  fetchBergamotModelAsset,
  resolveBergamotAssetUrl,
} from '../src/translation/bergamot-translator';

class FakeWorker {
  listeners = new Map<string, Array<(event: { data?: { id: number; result?: unknown }; message?: string }) => void>>();
  readonly index: number;
  static count = 0;
  constructor() {
    this.index = ++FakeWorker.count;
  }
  addEventListener(
    name: string,
    listener: (event: { data?: { id: number; result?: unknown }; message?: string }) => void
  ): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  postMessage(message: { id: number; name: string }): void {
    queueMicrotask(() => {
      if (message.name === 'initialize' && this.index === 1) {
        for (const listener of this.listeners.get('error') ?? []) {
          listener({ message: 'initialization worker failed' });
        }
        return;
      }
      if (message.name === 'translate' && this.index === 2) {
        for (const listener of this.listeners.get('error') ?? []) {
          listener({ message: 'translation worker failed' });
        }
        return;
      }
      for (const listener of this.listeners.get('message') ?? []) {
        listener({ data: { id: message.id, result: {} } });
      }
    });
  }
}

const originalWorker = globalThis.Worker;

afterEach(() => {
  globalThis.Worker = originalWorker;
  vi.unstubAllGlobals();
  FakeWorker.count = 0;
  mockState.constructors = 0;
});

describe('Bergamot worker lifecycle', () => {
  it('maps public model files to the configured same-origin asset directory', () => {
    const remote =
      'https://storage.googleapis.com/vendor-bucket/models/en-es/version/model.enes.bin.gz';
    expect(resolveBergamotAssetUrl(remote, '/bergamot/models', 'https://ocr.example')).toBe(
      'https://ocr.example/bergamot/models/en-es/version/model.enes.bin.gz'
    );
    expect(resolveBergamotAssetUrl(remote, undefined, 'https://ocr.example')).toBe(remote);
  });

  it('rejects HTTP failures and validates downloaded uncompressed model hashes', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('denied', { status: 403 }))));
    await expect(fetchBergamotModelAsset('https://assets.example/model.gz')).rejects.toThrow(
      'HTTP 403'
    );

    const bytes = new TextEncoder().encode('abc');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(bytes))));
    const checksum = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    await expect(fetchBergamotModelAsset('/model.bin', checksum)).resolves.toEqual(bytes.buffer);
    await expect(fetchBergamotModelAsset('/model.bin', '0'.repeat(64))).rejects.toThrow(
      'failed its SHA-256 check'
    );
  });

  it('retries failed initialization and settles pending calls after a worker error', async () => {
    globalThis.Worker = FakeWorker as unknown as typeof Worker;
    const translator = new BergamotTextTranslator();

    await expect(
      translator.translate({ from: 'en', to: 'es', text: 'Hello' })
    ).rejects.toThrow('initialization worker failed');

    await expect(
      translator.translate({ from: 'en', to: 'es', text: 'Hello' })
    ).rejects.toThrow('translation worker failed');
    await expect(
      translator.translate({ from: 'en', to: 'es', text: 'Hello' })
    ).resolves.toEqual({ text: 'ok' });
    expect(mockState.constructors).toBe(3);
  });
});
