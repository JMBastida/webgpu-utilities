import type { CopilotConfig, CopilotState, SolutionResult } from './types';
import { ChangeDetector } from './change-detector';
import { cropCanvasToRoi } from './roi-selector';

export interface CopilotDependencies {
  captureFrame: () => HTMLCanvasElement;
  runOcr: (canvas: HTMLCanvasElement) => Promise<string>;
  solveGemini: (question: string, contextPrompt: string) => Promise<SolutionResult>;
  initialConfig?: Partial<CopilotConfig>;
}

export interface CopilotCallbacks {
  onStateChange: (state: CopilotState, message?: string) => void;
  onQuestionDetected: (text: string) => void;
  onSolutionReady: (solution: SolutionResult) => void;
  onError: (error: Error) => void;
}

const DEFAULT_CONFIG: CopilotConfig = {
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  cameraDeviceId: '',
  roi: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  contextPreset: 'general',
  customContext: '',
  scanIntervalSec: 3,
  autoEnabled: true,
};

export class CopilotController {
  private config: CopilotConfig;
  private readonly dependencies: CopilotDependencies;
  private readonly callbacks: CopilotCallbacks;
  private readonly changeDetector = new ChangeDetector();
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private isProcessing = false;

  constructor(dependencies: CopilotDependencies, callbacks: CopilotCallbacks) {
    this.dependencies = dependencies;
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_CONFIG, ...dependencies.initialConfig };
  }

  start(): void {
    this.isRunning = true;
    this.callbacks.onStateChange(
      'WATCHING',
      `Watching screen every ${this.config.scanIntervalSec}s`
    );
    this.scheduleNextScan();
  }

  stop(): void {
    this.isRunning = false;
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    this.callbacks.onStateChange('PAUSED', 'Monitoring paused');
  }

  private scheduleNextScan(): void {
    if (!this.isRunning || !this.config.autoEnabled) return;
    if (this.scanTimer) clearTimeout(this.scanTimer);

    this.scanTimer = setTimeout(() => {
      void this.runScanCycle().then(() => {
        this.scheduleNextScan();
      });
    }, this.config.scanIntervalSec * 1000);
  }

  private async runScanCycle(): Promise<void> {
    if (!this.isRunning || this.isProcessing) return;
    this.isProcessing = true;

    try {
      const fullFrame = this.dependencies.captureFrame();
      const croppedFrame = cropCanvasToRoi(fullFrame, this.config.roi);
      const text = await this.dependencies.runOcr(croppedFrame);

      const evaluation = this.changeDetector.evaluate(text);

      if (evaluation.isNewQuestion) {
        this.callbacks.onStateChange('STABILIZING', 'New text detected, checking stability...');
        this.callbacks.onQuestionDetected(text);

        // Wait 1.5s stabilization debounce
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (!this.isRunning) return;

        // Verify stabilization
        const recheckFrame = cropCanvasToRoi(this.dependencies.captureFrame(), this.config.roi);
        const stableText = await this.dependencies.runOcr(recheckFrame);
        const secondEval = this.changeDetector.evaluate(stableText);

        if (!secondEval.isNoise) {
          await this.triggerSolve(stableText);
        }
      }
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.isProcessing = false;
      if (this.isRunning) {
        this.callbacks.onStateChange('WATCHING');
      }
    }
  }

  async forceSolve(): Promise<void> {
    try {
      this.isProcessing = true;
      const fullFrame = this.dependencies.captureFrame();
      const croppedFrame = cropCanvasToRoi(fullFrame, this.config.roi);
      const text = await this.dependencies.runOcr(croppedFrame);
      if (text.trim().length > 0) {
        await this.triggerSolve(text);
      } else {
        throw new Error('No readable text detected in current ROI.');
      }
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.isProcessing = false;
    }
  }

  private async triggerSolve(questionText: string): Promise<void> {
    this.callbacks.onStateChange('SOLVING', 'Gemini is generating solution...');
    const context = this.getContextString();
    const solution = await this.dependencies.solveGemini(questionText, context);
    this.changeDetector.markSolved(questionText);
    this.callbacks.onStateChange('SOLVED', `Solution ready at ${new Date().toLocaleTimeString()}`);
    this.callbacks.onSolutionReady(solution);
  }

  private getContextString(): string {
    const presetPrompts: Record<string, string> = {
      sql: 'Senior SQL Specialist interview. Provide optimal queries, explain execution/indexing trade-offs and handle edge cases.',
      java: 'Senior Java Backend Specialist interview. Provide clean modern Java (JDK 21/17), optimal time/space complexity, and concurrency/edge-case awareness.',
      general:
        'Technical Software Engineering interview. Direct solution first, followed by clear speaking points and complexity analysis.',
      custom: this.config.customContext || 'General technical interview',
    };
    return presetPrompts[this.config.contextPreset] ?? presetPrompts['general'] ?? '';
  }

  updateConfig(partial: Partial<CopilotConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  getConfig(): CopilotConfig {
    return { ...this.config };
  }
}
