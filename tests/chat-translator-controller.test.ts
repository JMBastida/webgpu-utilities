import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatTranslatorController } from '../src/chat-translator/chat-translator-controller';
import type { TranslatedChatLine } from '../src/chat-translator/types';

describe('ChatTranslatorController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scans periodically and triggers translation when new chat lines are detected', async () => {
    const mockCapture = vi.fn().mockReturnValue(document.createElement('canvas'));
    const mockOcr = vi.fn().mockResolvedValue('(Pierre): salut les gars');
    const mockTranslate = vi.fn().mockResolvedValue([
      {
        id: '1',
        timestamp: 1000,
        originalFrench: '(Pierre): salut les gars',
        translatedEnglish: '(Pierre): hey guys',
      },
    ] as TranslatedChatLine[]);

    const deliveredLines: TranslatedChatLine[] = [];

    const controller = new ChatTranslatorController(
      {
        captureFrame: mockCapture,
        runOcr: mockOcr,
        translateLines: mockTranslate,
        initialConfig: {
          engine: 'gemini',
          scanIntervalSec: 2,
          autoEnabled: true,
        },
      },
      {
        onStateChange: (): void => {},
        onNewChatLines: (lines): void => {
          deliveredLines.push(...lines);
        },
        onError: (): void => {},
      }
    );

    controller.start();
    await vi.advanceTimersByTimeAsync(2100);

    expect(mockCapture).toHaveBeenCalled();
    expect(mockOcr).toHaveBeenCalled();
    expect(mockTranslate).toHaveBeenCalled();
    expect(deliveredLines).toHaveLength(1);
    expect(deliveredLines[0]?.translatedEnglish).toBe('(Pierre): hey guys');

    controller.stop();
  });

  it('supports forceTranslate regardless of auto-scan timer', async () => {
    const mockCapture = vi.fn().mockReturnValue(document.createElement('canvas'));
    const mockOcr = vi.fn().mockResolvedValue('(Jean): test force');
    const mockTranslate = vi.fn().mockResolvedValue([
      {
        id: '2',
        timestamp: 1000,
        originalFrench: '(Jean): test force',
        translatedEnglish: '(Jean): force test',
      },
    ] as TranslatedChatLine[]);

    const deliveredLines: TranslatedChatLine[] = [];

    const controller = new ChatTranslatorController(
      {
        captureFrame: mockCapture,
        runOcr: mockOcr,
        translateLines: mockTranslate,
        initialConfig: {
          autoEnabled: false,
        },
      },
      {
        onStateChange: (): void => {},
        onNewChatLines: (lines): void => {
          deliveredLines.push(...lines);
        },
        onError: (): void => {},
      }
    );

    await controller.forceTranslate();
    expect(mockCapture).toHaveBeenCalled();
    expect(mockOcr).toHaveBeenCalled();
    expect(mockTranslate).toHaveBeenCalled();
    expect(deliveredLines).toHaveLength(1);
  });
});
