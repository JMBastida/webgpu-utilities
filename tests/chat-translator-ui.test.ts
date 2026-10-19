import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderChatTranslatorTemplate } from '../src/chat-translator/chat-translator-template';
import { getAppTemplate } from '../src/app-template';
import { ChatTranslatorUi } from '../src/chat-translator/chat-translator-ui';
import type { ChatTranslatorController } from '../src/chat-translator/chat-translator-controller';
import type { ScreenCaptureManager } from '../src/chat-translator/screen-capture-manager';
import type { TranslatedChatLine } from '../src/chat-translator/types';

describe('Chat Translator UI Template', () => {
  beforeEach(() => {
    document.body.innerHTML = renderChatTranslatorTemplate();
  });

  it('renders all required chat translator elements', () => {
    expect(document.getElementById('chat-video')).not.toBeNull();
    expect(document.getElementById('chat-start-share-btn')).not.toBeNull();
    expect(document.getElementById('chat-status-pill')).not.toBeNull();
    expect(document.getElementById('chat-force-btn')).not.toBeNull();
    expect(document.getElementById('chat-feed-original')).not.toBeNull();
    expect(document.getElementById('chat-feed-translated')).not.toBeNull();
    expect(document.getElementById('chat-engine-gemini')).not.toBeNull();
    expect(document.getElementById('chat-engine-bergamot')).not.toBeNull();
  });

  it('includes 3rd navigation tab in app-template', () => {
    const template = getAppTemplate();
    expect(template).toContain('id="nav-mode-chat"');
    expect(template).toContain('id="chat-view-container"');
  });
});

describe('ChatTranslatorUi component', () => {
  let container: HTMLElement;
  let mockController: ChatTranslatorController;
  let mockScreenManager: ScreenCaptureManager;
  let ui: ChatTranslatorUi;

  let clearHistorySpy: ReturnType<typeof vi.fn>;
  let updateConfigSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = renderChatTranslatorTemplate();
    container = document.getElementById('chat-translator-container') as HTMLElement;

    clearHistorySpy = vi.fn();
    updateConfigSpy = vi.fn();

    mockController = {
      start: vi.fn(),
      stop: vi.fn(),
      forceTranslate: vi.fn(),
      clearHistory: clearHistorySpy,
      updateConfig: updateConfigSpy,
      getConfig: vi.fn().mockReturnValue({ engine: 'gemini', scanIntervalSec: 2, autoEnabled: true }),
    } as unknown as ChatTranslatorController;

    mockScreenManager = {
      startCapture: vi.fn().mockResolvedValue({} as MediaStream),
      stopCapture: vi.fn(),
      captureFrame: vi.fn(),
      isCapturing: vi.fn().mockReturnValue(false),
      onEnded: vi.fn(),
    } as unknown as ScreenCaptureManager;

    ui = new ChatTranslatorUi(container, mockController, mockScreenManager);
    ui.init();
  });

  it('appends translated lines with username and bracket styling', () => {
    const lines: TranslatedChatLine[] = [
      {
        id: 'msg-1',
        timestamp: 1700000000000,
        originalFrench: '(Pierre): salut on fait [Donjon de Feu] ?',
        translatedEnglish: '(Pierre): hey are we doing [Donjon de Feu] ?',
        username: 'Pierre',
      },
    ];

    ui.appendTranslatedLines(lines);

    const origFeed = container.querySelector('#chat-feed-original');
    const transFeed = container.querySelector('#chat-feed-translated');
    const countBadge = container.querySelector('#chat-original-count');

    expect(origFeed?.innerHTML).toContain('chat-bracket-tag');
    expect(origFeed?.innerHTML).toContain('[Donjon de Feu]');
    expect(transFeed?.innerHTML).toContain('hey are we doing');
    expect(transFeed?.innerHTML).toContain('Pierre');
    expect(countBadge?.textContent).toBe('1 lines');
  });

  it('clears chat feed upon calling clearFeed()', () => {
    ui.appendTranslatedLines([
      {
        id: 'msg-1',
        timestamp: Date.now(),
        originalFrench: 'bonjour',
        translatedEnglish: 'hello',
      },
    ]);

    ui.clearFeed();
    expect(clearHistorySpy).toHaveBeenCalled();

    const countBadge = container.querySelector('#chat-original-count');
    expect(countBadge?.textContent).toBe('0 lines');
  });

  it('switches engine toggle between Gemini and Bergamot', () => {
    const bergamotBtn = container.querySelector<HTMLButtonElement>('#chat-engine-bergamot');
    const geminiBtn = container.querySelector<HTMLButtonElement>('#chat-engine-gemini');
    const engineBadge = container.querySelector<HTMLElement>('#chat-translated-engine-badge');

    bergamotBtn?.click();
    expect(bergamotBtn?.classList.contains('active')).toBe(true);
    expect(geminiBtn?.classList.contains('active')).toBe(false);
    expect(engineBadge?.textContent).toBe('Bergamot Local');
    expect(updateConfigSpy).toHaveBeenCalledWith({ engine: 'bergamot' });
  });
});
