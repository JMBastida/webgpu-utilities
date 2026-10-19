import type { ChatTranslatorConfig, TranslatedChatLine } from './types';
import { ChatLineDiffDetector } from './chat-line-diff';
import { cropCanvasToRoi } from '@/copilot/roi-selector';
import type { NormalizedRoi } from '@/copilot/types';

export interface ChatTranslatorDependencies {
  captureFrame: () => HTMLCanvasElement;
  runOcr: (canvas: HTMLCanvasElement) => Promise<string>;
  translateLines: (lines: string[], engine: 'gemini' | 'bergamot') => Promise<TranslatedChatLine[]>;
  initialConfig?: Partial<ChatTranslatorConfig>;
  getRoi?: () => NormalizedRoi;
}

export interface ChatTranslatorCallbacks {
  onStateChange: (state: string, message?: string) => void;
  onNewChatLines: (lines: TranslatedChatLine[]) => void;
  onError: (err: Error) => void;
}

const DEFAULT_CONFIG: ChatTranslatorConfig = {
  engine: 'gemini',
  scanIntervalSec: 2,
  autoEnabled: true,
};

export class ChatTranslatorController {
  private config: ChatTranslatorConfig;
  private readonly dependencies: ChatTranslatorDependencies;
  private readonly callbacks: ChatTranslatorCallbacks;
  private readonly diffDetector = new ChatLineDiffDetector();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private isProcessing = false;

  constructor(dependencies: ChatTranslatorDependencies, callbacks: ChatTranslatorCallbacks) {
    this.dependencies = dependencies;
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_CONFIG, ...dependencies.initialConfig };
  }

  start(): void {
    this.isRunning = true;
    this.callbacks.onStateChange(
      'SCANNING',
      `Auto-scanning chat every ${this.config.scanIntervalSec}s`
    );
    this.scheduleNext();
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.callbacks.onStateChange('PAUSED', 'Chat scanning paused');
  }

  private scheduleNext(): void {
    if (!this.isRunning || !this.config.autoEnabled) return;
    if (this.timer) clearTimeout(this.timer);

    this.timer = setTimeout(() => {
      void this.runCycle().then(() => {
        this.scheduleNext();
      });
    }, this.config.scanIntervalSec * 1000);
  }

  private async runCycle(): Promise<void> {
    if (!this.isRunning || this.isProcessing) return;
    this.isProcessing = true;

    try {
      const fullFrame = this.dependencies.captureFrame();
      const roi = this.dependencies.getRoi
        ? this.dependencies.getRoi()
        : { x: 0, y: 0.6, width: 0.5, height: 0.4 };
      const cropped = cropCanvasToRoi(fullFrame, roi);
      const text = await this.dependencies.runOcr(cropped);

      const newLines = this.diffDetector.detectNewLines(text);
      if (newLines.length > 0) {
        this.callbacks.onStateChange('TRANSLATING', `Translating ${newLines.length} new line(s)...`);
        const translated = await this.dependencies.translateLines(newLines, this.config.engine);
        this.callbacks.onNewChatLines(translated);
      }
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.isProcessing = false;
      if (this.isRunning) {
        this.callbacks.onStateChange('SCANNING');
      }
    }
  }

  async forceTranslate(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const fullFrame = this.dependencies.captureFrame();
      const roi = this.dependencies.getRoi
        ? this.dependencies.getRoi()
        : { x: 0, y: 0.6, width: 0.5, height: 0.4 };
      const cropped = cropCanvasToRoi(fullFrame, roi);
      const text = await this.dependencies.runOcr(cropped);

      const lines = this.diffDetector.forceProcessAll(text);
      if (lines.length > 0) {
        this.callbacks.onStateChange('TRANSLATING', `Translating ${lines.length} lines...`);
        const translated = await this.dependencies.translateLines(lines, this.config.engine);
        this.callbacks.onNewChatLines(translated);
      }
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.isProcessing = false;
      if (this.isRunning) {
        this.callbacks.onStateChange('SCANNING');
      }
    }
  }

  clearHistory(): void {
    this.diffDetector.clear();
  }

  updateConfig(partial: Partial<ChatTranslatorConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  getConfig(): ChatTranslatorConfig {
    return { ...this.config };
  }
}
