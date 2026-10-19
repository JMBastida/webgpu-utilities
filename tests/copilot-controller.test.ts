import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CopilotController } from '../src/copilot/copilot-controller';

describe('CopilotController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs periodic scanning loop and triggers solver when new question is detected', async () => {
    const mockCapture = vi.fn().mockReturnValue(document.createElement('canvas'));
    const mockOcr = vi.fn().mockResolvedValue('Write a function to reverse a string');
    const mockSolve = vi.fn().mockResolvedValue({
      id: 's1',
      timestamp: 1000,
      questionText: 'Write a function to reverse a string',
      code: 'function rev(s) { return s.split("").reverse().join(""); }',
      explanation: ['Inverts characters'],
    });

    const stateChanges: string[] = [];

    const controller = new CopilotController(
      {
        captureFrame: mockCapture,
        runOcr: mockOcr,
        solveGemini: mockSolve,
        initialConfig: {
          geminiApiKey: 'test-key',
          geminiModel: 'gemini-3.8-flash',
          cameraDeviceId: '',
          roi: { x: 0, y: 0, width: 1, height: 1 },
          contextPreset: 'general',
          customContext: '',
          scanIntervalSec: 2,
          autoEnabled: true,
        },
      },
      {
        onStateChange: (state): void => {
          stateChanges.push(state);
        },
        onQuestionDetected: (): void => {},
        onSolutionReady: (): void => {},
        onError: (): void => {},
      }
    );

    controller.start();
    expect(stateChanges).toContain('WATCHING');

    // Advance timer to trigger scan
    await vi.advanceTimersByTimeAsync(2100);
    expect(mockCapture).toHaveBeenCalled();
    expect(mockOcr).toHaveBeenCalled();

    // Advance stabilization timer (1500ms)
    await vi.advanceTimersByTimeAsync(1600);
    expect(mockSolve).toHaveBeenCalled();

    controller.stop();
  });
});
