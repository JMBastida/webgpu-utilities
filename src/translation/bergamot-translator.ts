import {
  LatencyOptimisedTranslator,
  TranslatorBacking,
} from '@browsermt/bergamot-translator/translator.js';
// TranslatorBacking may not be exported in some versions of the package; we'll try to import it first, then fall back to global.
import type { ITextTranslator, TranslationRequest, TranslationResponse } from '@/types/translation';
import { ModelCache } from '@/utils/model-cache';

type BergamotInitOptions = {
  cacheSize?: number;
  useNativeIntGemm?: boolean;
  downloadTimeout?: number;
  workerUrl?: string;
  registryUrl?: string;
  pivotLanguage?: string;
  onerror?: (err: Error) => void;
};

type WorkerErrorPayload = {
  message?: string;
  stack?: string;
};

type PendingCall = {
  accept: (value: unknown) => void;
  reject: (error: Error) => void;
  callsite: {
    message: string;
    stack?: string;
  };
};

type WorkerExports = Record<string, (...args: unknown[]) => Promise<unknown>>;

type WorkerHandle = {
  worker: Worker;
  exports: WorkerExports;
};

type TranslatorRequest = {
  from: string;
  to: string;
  text: string;
  html?: boolean;
};

type TranslatorResult = {
  target: {
    text: string;
  };
};

type TranslatorBackingLike = {
  loadWorker: () => Promise<WorkerHandle>;
  onerror: (err: Error) => void;
  options: unknown;
  fetch: (url: string, checksum?: string, extra?: { signal?: AbortSignal }) => Promise<ArrayBuffer>;
};

type LatencyOptimisedTranslatorLike = {
  worker: Promise<unknown>;
  translate: (request: TranslatorRequest) => Promise<TranslatorResult>;
  delete: () => void | Promise<void>;
};

const createWorkerUrl = (): string => {
  const base = import.meta.env.BASE_URL ?? '/';
  const baseUrl = new URL(base, window.location.origin);
  return new URL('bergamot/worker/translator-worker.js', baseUrl).toString();
};

const createRegistryUrl = (): string => {
  const base = import.meta.env.BASE_URL ?? '/';
  const baseUrl = new URL(base, window.location.origin);
  return new URL('bergamot/registry.json', baseUrl).toString();
};

export const resolveBergamotAssetUrl = (
  assetUrl: string,
  assetBaseUrl?: string,
  origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
): string => {
  if (!assetBaseUrl?.trim()) return assetUrl;
  const parsed = new URL(assetUrl);
  const modelPathIndex = parsed.pathname.indexOf('/models/');
  if (parsed.hostname !== 'storage.googleapis.com' || modelPathIndex < 0) return assetUrl;
  const relativePath = parsed.pathname.slice(modelPathIndex + '/models/'.length);
  const base = new URL(`${assetBaseUrl.replace(/\/+$/, '')}/`, origin);
  return new URL(relativePath, base).toString();
};

const decompressGzip = async (buffer: ArrayBuffer): Promise<ArrayBuffer> => {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Gzip models require DecompressionStream support.');
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  const response = new Response(stream);
  return response.arrayBuffer();
};

const isGzipData = (buffer: ArrayBuffer): boolean => {
  const bytes = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
};

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

export const fetchBergamotModelAsset = async (
  assetUrl: string,
  checksum?: string,
  signal?: AbortSignal
): Promise<ArrayBuffer> => {
  const response = await fetch(assetUrl, { credentials: 'omit', signal });
  if (!response.ok) {
    throw new Error(`Model request returned HTTP ${response.status} ${response.statusText}.`);
  }
  let buffer = await response.arrayBuffer();
  if (isGzipData(buffer)) buffer = await decompressGzip(buffer);
  if (checksum) {
    const actual = toHex(await crypto.subtle.digest('SHA-256', buffer));
    if (actual.toLowerCase() !== checksum.toLowerCase()) {
      throw new Error(`The downloaded translation model failed its SHA-256 check: ${assetUrl}`);
    }
  }
  return buffer;
};

export class BergamotTextTranslator implements ITextTranslator {
  private instance: LatencyOptimisedTranslatorLike | null = null;
  private initializing: Promise<LatencyOptimisedTranslatorLike> | null = null;

  private static readonly cache = new ModelCache({
    dbName: 'ocr-model-cache',
    storeName: 'translation-models',
  });

  private async getTranslator(): Promise<LatencyOptimisedTranslatorLike> {
    if (this.instance) {
      return this.instance;
    }

    if (!this.initializing) {
      const workerUrl = createWorkerUrl();
      const registryUrl = createRegistryUrl();
      // Create a backing instance and patch loadWorker before the translator constructor runs.
      // TranslatorBacking may not be exported by all versions; try to read from global if import failed
      const globalBacking = (globalThis as unknown as { TranslatorBacking?: unknown }).TranslatorBacking;
      const TranslatorBackingCtor = (TranslatorBacking || globalBacking) as
        | (new (options?: BergamotInitOptions) => TranslatorBackingLike)
        | undefined;
      const backing = TranslatorBackingCtor
        ? new TranslatorBackingCtor({
            downloadTimeout: 60000,
            registryUrl,
          })
        : ({
            onerror: (err: Error) => console.error(err),
            options: { downloadTimeout: 60000, registryUrl },
          } as unknown as TranslatorBackingLike);

      const originalLoadWorker =
        typeof backing.loadWorker === 'function' ? backing.loadWorker.bind(backing) : null;
      backing.loadWorker = function (this: TranslatorBackingLike): Promise<WorkerHandle> {
        // If we have a custom workerUrl, we use it.
        // The library's default uses new URL('./worker/translator-worker.js', import.meta.url)
        if (workerUrl) {
          const onError = this.onerror.bind(this);
          const options = this.options;
          const loadWithCustomWorker = async (): Promise<WorkerHandle> => {
            const worker = new Worker(workerUrl);

            // Standard library initialization follows
            let serial = 0;
            const pending = new Map<number, PendingCall>();

            const call = (name: string, ...args: unknown[]): Promise<unknown> =>
              new Promise((accept, reject) => {
                const id = ++serial;
                pending.set(id, {
                  accept: (value: unknown) => accept(value),
                  reject: (error: Error) => reject(error),
                  callsite: {
                    message: `${name}(${args.map((arg) => String(arg)).join(', ')})`,
                    stack: new Error().stack,
                  },
                });
                worker.postMessage({ id, name, args });
              });

            worker.addEventListener(
              'message',
              function ({
                data,
              }: MessageEvent<{ id: number; result?: unknown; error?: WorkerErrorPayload }>) {
                const { id, result, error } = data;
                const entry = pending.get(id);
                if (!entry) return;
                pending.delete(id);
                if (error !== undefined) {
                  const errorPayload = error ?? {};
                  entry.reject(
                    Object.assign(new Error(), errorPayload, {
                      message:
                        (errorPayload.message ?? 'Worker error') +
                        ` (response to ${entry.callsite.message})`,
                      stack: errorPayload.stack
                        ? `${errorPayload.stack}\n${entry.callsite.stack}`
                        : entry.callsite.stack,
                    })
                  );
                } else {
                  entry.accept(result);
                }
              }
            );

            worker.addEventListener('error', (ev) => {
              const error = new Error(ev.message || 'Unknown worker error');
              for (const entry of pending.values()) entry.reject(error);
              pending.clear();
              onError(error);
            });

            worker.addEventListener('messageerror', () => {
              const error = new Error('Could not read a response from the translation worker.');
              for (const entry of pending.values()) entry.reject(error);
              pending.clear();
              onError(error);
            });

            await call('initialize', options);

            return {
              worker,
              exports: new Proxy(
                {},
                {
                  get(_target, name): unknown {
                    if (name !== 'then')
                      return (...args: unknown[]) => call(name as string, ...args);
                    return undefined;
                  },
                }
              ),
            };
          };
          return loadWithCustomWorker();
        }
        if (!originalLoadWorker) {
          throw new Error('TranslatorBacking.loadWorker is not available');
        }
        return originalLoadWorker();
      };

      backing.fetch = async (
        url: string,
        checksum?: string,
        extra?: { signal?: AbortSignal }
      ): Promise<ArrayBuffer> => {
        return BergamotTextTranslator.cache.loadOrFetch(url, async () => {
          const assetUrl = resolveBergamotAssetUrl(
            url,
            import.meta.env.VITE_BERGAMOT_MODEL_ASSET_BASE_URL
          );
          try {
            return await fetchBergamotModelAsset(assetUrl, checksum, extra?.signal);
          } catch (error) {
            const localHint = assetUrl !== url
              ? ''
              : ' If this origin blocks cross-origin model downloads, set VITE_BERGAMOT_MODEL_ASSET_BASE_URL and host the same model files on this origin.';
            const failure = new Error(
              `Could not download the offline translation model asset from ${assetUrl}.${localHint}`
            );
            (failure as Error & { cause?: unknown }).cause = error;
            throw failure;
          }
        });
      };

      // Some versions of the library have differing constructor typings; coerce to a compatible ctor type
      const TranslatorCtor = LatencyOptimisedTranslator as unknown as (
        new (options?: BergamotInitOptions, backing?: TranslatorBackingLike) => LatencyOptimisedTranslatorLike
      );
      const translator = new TranslatorCtor(
        {
          workerUrl: workerUrl,
          downloadTimeout: 60000,
          registryUrl,
        } as BergamotInitOptions,
        backing
      );

      // Wait for the worker to be initialized
      this.initializing = translator.worker.then(() => translator).catch((error: unknown) => {
        this.initializing = null;
        throw error;
      });
    }

    this.instance = await this.initializing;
    if (!this.instance) {
      throw new Error('Translator initialization failed');
    }
    return this.instance;
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const translator = await this.getTranslator();
    try {
      const response = await translator.translate({
        from: request.from,
        to: request.to,
        text: request.text,
        html: request.html ?? false,
      });
      return { text: response.target.text };
    } catch (error) {
      if (this.instance === translator) {
        this.instance = null;
        this.initializing = null;
        void translator.delete();
      }
      throw error;
    }
  }

  destroy(): void {
    if (this.instance) {
      void this.instance.delete();
      this.instance = null;
    }
    this.initializing = null;
  }
}
