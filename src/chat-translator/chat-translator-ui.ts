import type { ChatTranslationEngine, NormalizedRoi, TranslatedChatLine } from './types';
import type { ChatTranslatorController } from './chat-translator-controller';
import type { ScreenCaptureManager } from './screen-capture-manager';

const STORAGE_KEYS = {
  apiKey: 'chat_gemini_api_key',
  copilotApiKey: 'copilot_gemini_api_key',
  model: 'chat_gemini_model',
  engine: 'chat_translation_engine',
  interval: 'chat_scan_interval',
  roi: 'chat_crop_roi',
};

const escapeHtml = (str: string): string =>
  str
    .split('&')
    .join('&amp;')
    .split('<')
    .join('&lt;')
    .split('>')
    .join('&gt;')
    .split('"')
    .join('&quot;')
    .split("'")
    .join('&#39;');

const highlightBrackets = (text: string): string => {
  const parts: string[] = [];
  const regex = /\[[^\]]+\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(escapeHtml(text.substring(lastIndex, match.index)));
    }
    parts.push(`<span class="chat-bracket-tag">${escapeHtml(match[0])}</span>`);
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(escapeHtml(text.substring(lastIndex)));
  }

  return parts.join('');
};

export class ChatTranslatorUi {
  private readonly container: HTMLElement;
  private readonly controller: ChatTranslatorController;
  private readonly screenManager: ScreenCaptureManager;

  private currentRoi: NormalizedRoi = { x: 0.05, y: 0.55, width: 0.45, height: 0.4 };
  private isRoiLocked = false;
  private chatHistory: TranslatedChatLine[] = [];
  private onEngineChangeCallback?: (engine: ChatTranslationEngine) => void;

  constructor(
    container: HTMLElement,
    controller: ChatTranslatorController,
    screenManager: ScreenCaptureManager
  ) {
    this.container = container;
    this.controller = controller;
    this.screenManager = screenManager;
  }

  init(): void {
    this.loadStoredPreferences();
    this.bindDomEvents();
    this.applyRoiToOverlay();

    this.screenManager.onEnded(() => {
      this.handleCaptureEnded();
    });
  }

  onEngineChange(callback: (engine: ChatTranslationEngine) => void): void {
    this.onEngineChangeCallback = callback;
  }

  getRoi(): NormalizedRoi {
    return { ...this.currentRoi };
  }

  private loadStoredPreferences(): void {
    const savedApiKey =
      localStorage.getItem(STORAGE_KEYS.apiKey) ||
      localStorage.getItem(STORAGE_KEYS.copilotApiKey) ||
      '';
    let savedModel = localStorage.getItem(STORAGE_KEYS.model) ?? 'gemini-3.8-flash';
    if (savedModel === 'gemini-2.5-flash') {
      savedModel = 'gemini-3.8-flash';
      localStorage.setItem(STORAGE_KEYS.model, savedModel);
    }
    const savedEngine =
      (localStorage.getItem(STORAGE_KEYS.engine) as ChatTranslationEngine) ?? 'gemini';
    const savedInterval = Number(localStorage.getItem(STORAGE_KEYS.interval)) || 2;

    const savedRoiJson = localStorage.getItem(STORAGE_KEYS.roi);
    if (savedRoiJson) {
      try {
        const parsed = JSON.parse(savedRoiJson) as NormalizedRoi;
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          this.currentRoi = parsed;
        }
      } catch {
        // fallback to default
      }
    }

    const apiKeyInput = this.container.querySelector<HTMLInputElement>('#chat-api-key');
    if (apiKeyInput) apiKeyInput.value = savedApiKey;

    const modelSelect = this.container.querySelector<HTMLSelectElement>('#chat-gemini-model');
    if (modelSelect) modelSelect.value = savedModel;

    const intervalSlider = this.container.querySelector<HTMLInputElement>('#chat-scan-interval');
    const intervalLabel = this.container.querySelector<HTMLElement>('#chat-scan-interval-val');
    if (intervalSlider) {
      intervalSlider.value = String(savedInterval);
      if (intervalLabel) intervalLabel.textContent = `${savedInterval}s`;
    }

    this.setActiveEngine(savedEngine);

    this.controller.updateConfig({
      engine: savedEngine,
      scanIntervalSec: savedInterval,
    });
  }

  private bindDomEvents(): void {
    // Screen share buttons
    const startShareBtn =
      this.container.querySelector<HTMLButtonElement>('#chat-start-share-btn');
    const stopShareBtn = this.container.querySelector<HTMLButtonElement>('#chat-stop-share-btn');

    if (startShareBtn) {
      startShareBtn.addEventListener('click', () => {
        void this.startSharing();
      });
    }

    if (stopShareBtn) {
      stopShareBtn.addEventListener('click', () => {
        this.stopSharing();
      });
    }

    // Engine toggle buttons
    const geminiBtn = this.container.querySelector<HTMLButtonElement>('#chat-engine-gemini');
    const bergamotBtn = this.container.querySelector<HTMLButtonElement>('#chat-engine-bergamot');

    if (geminiBtn) {
      geminiBtn.addEventListener('click', () => {
        this.setActiveEngine('gemini');
      });
    }

    if (bergamotBtn) {
      bergamotBtn.addEventListener('click', () => {
        this.setActiveEngine('bergamot');
      });
    }

    // Auto toggle
    const autoToggle = this.container.querySelector<HTMLInputElement>('#chat-auto-toggle');
    if (autoToggle) {
      autoToggle.addEventListener('change', () => {
        const enabled = autoToggle.checked;
        this.controller.updateConfig({ autoEnabled: enabled });
        if (enabled && this.screenManager.isCapturing()) {
          this.controller.start();
        } else if (!enabled) {
          this.controller.stop();
        }
      });
    }

    // Force shoot button
    const forceBtn = this.container.querySelector<HTMLButtonElement>('#chat-force-btn');
    if (forceBtn) {
      forceBtn.addEventListener('click', () => {
        void this.controller.forceTranslate();
      });
    }

    // Clear feed button
    const clearBtn = this.container.querySelector<HTMLButtonElement>('#chat-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearFeed();
      });
    }

    // Settings drawer
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('#chat-settings-btn');
    const closeSettingsBtn = this.container.querySelector<HTMLButtonElement>(
      '#chat-close-settings-btn'
    );
    const saveSettingsBtn = this.container.querySelector<HTMLButtonElement>(
      '#chat-save-settings-btn'
    );
    const settingsPanel = this.container.querySelector<HTMLElement>('#chat-settings-panel');

    const toggleSettings = (open: boolean): void => {
      settingsPanel?.classList.toggle('hidden', !open);
    };

    if (settingsBtn) settingsBtn.addEventListener('click', () => toggleSettings(true));
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => toggleSettings(false));

    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', () => {
        const apiKey =
          this.container.querySelector<HTMLInputElement>('#chat-api-key')?.value.trim() ?? '';
        const model =
          this.container.querySelector<HTMLSelectElement>('#chat-gemini-model')?.value ??
          'gemini-3.8-flash';
        const interval =
          Number(
            this.container.querySelector<HTMLInputElement>('#chat-scan-interval')?.value
          ) || 2;

        localStorage.setItem(STORAGE_KEYS.apiKey, apiKey);
        localStorage.setItem(STORAGE_KEYS.model, model);
        localStorage.setItem(STORAGE_KEYS.interval, String(interval));

        this.controller.updateConfig({
          scanIntervalSec: interval,
        });

        toggleSettings(false);
      });
    }

    // Interval slider live label
    const intervalSlider = this.container.querySelector<HTMLInputElement>('#chat-scan-interval');
    const intervalLabel = this.container.querySelector<HTMLElement>('#chat-scan-interval-val');
    if (intervalSlider && intervalLabel) {
      intervalSlider.addEventListener('input', () => {
        intervalLabel.textContent = `${intervalSlider.value}s`;
      });
    }

    // ROI Lock button
    const roiLockBtn = this.container.querySelector<HTMLButtonElement>('#chat-toggle-roi-lock');
    if (roiLockBtn) {
      roiLockBtn.addEventListener('click', () => {
        this.isRoiLocked = !this.isRoiLocked;
        roiLockBtn.textContent = this.isRoiLocked ? '🔒 Chat ROI Locked' : '🔓 Unlock Chat ROI';
        const roiBox = this.container.querySelector<HTMLElement>('#chat-roi-box');
        if (roiBox) {
          roiBox.classList.toggle('is-locked', this.isRoiLocked);
        }
      });
    }

    this.bindRoiInteractions();
  }

  private setActiveEngine(engine: ChatTranslationEngine): void {
    const geminiBtn = this.container.querySelector<HTMLButtonElement>('#chat-engine-gemini');
    const bergamotBtn = this.container.querySelector<HTMLButtonElement>('#chat-engine-bergamot');
    const engineBadge = this.container.querySelector<HTMLElement>('#chat-translated-engine-badge');

    geminiBtn?.classList.toggle('active', engine === 'gemini');
    bergamotBtn?.classList.toggle('active', engine === 'bergamot');

    if (engineBadge) {
      engineBadge.textContent = engine === 'gemini' ? 'Gemini 3.8 Flash' : 'Bergamot Local';
    }

    localStorage.setItem(STORAGE_KEYS.engine, engine);
    this.controller.updateConfig({ engine });

    if (this.onEngineChangeCallback) {
      this.onEngineChangeCallback(engine);
    }
  }

  async startSharing(): Promise<void> {
    try {
      this.updateStatus('CONNECTING', 'Requesting game window or screen...');
      await this.screenManager.startCapture();

      const startShareBtn =
        this.container.querySelector<HTMLButtonElement>('#chat-start-share-btn');
      const stopShareBtn = this.container.querySelector<HTMLButtonElement>('#chat-stop-share-btn');

      startShareBtn?.classList.add('hidden');
      stopShareBtn?.classList.remove('hidden');

      const autoToggle = this.container.querySelector<HTMLInputElement>('#chat-auto-toggle');
      if (autoToggle?.checked) {
        this.controller.start();
      } else {
        this.updateStatus('PAUSED', 'Screen sharing active (auto-scan disabled)');
      }
    } catch (err) {
      this.updateStatus('ERROR', err instanceof Error ? err.message : String(err));
    }
  }

  stopSharing(): void {
    this.screenManager.stopCapture();
    this.handleCaptureEnded();
  }

  private handleCaptureEnded(): void {
    this.controller.stop();
    const startShareBtn =
      this.container.querySelector<HTMLButtonElement>('#chat-start-share-btn');
    const stopShareBtn = this.container.querySelector<HTMLButtonElement>('#chat-stop-share-btn');

    startShareBtn?.classList.remove('hidden');
    stopShareBtn?.classList.add('hidden');

    this.updateStatus('IDLE', 'Screen capture stopped');
  }

  updateStatus(state: string, message?: string): void {
    const statusPill = this.container.querySelector<HTMLElement>('#chat-status-pill');
    const statusText = this.container.querySelector<HTMLElement>('#chat-status-text');
    const statusDetail = this.container.querySelector<HTMLElement>('#chat-status-detail');

    if (statusPill) {
      statusPill.className = 'copilot-status-pill';
      if (state === 'SCANNING' || state === 'WATCHING') {
        statusPill.classList.add('status-watching');
      } else if (state === 'TRANSLATING') {
        statusPill.classList.add('status-solving');
      } else if (state === 'ERROR') {
        statusPill.classList.add('status-error');
      } else {
        statusPill.classList.add('status-idle');
      }
    }

    if (statusText) statusText.textContent = state;
    if (statusDetail && message) statusDetail.textContent = message;
  }

  setRawOcrPreview(text: string): void {
    const rawPre = this.container.querySelector<HTMLElement>('#chat-raw-ocr-text');
    if (rawPre) {
      rawPre.textContent = text || '(no text detected)';
    }
  }

  appendTranslatedLines(lines: TranslatedChatLine[]): void {
    if (lines.length === 0) return;

    const originalFeed = this.container.querySelector<HTMLElement>('#chat-feed-original');
    const translatedFeed = this.container.querySelector<HTMLElement>('#chat-feed-translated');
    const countBadge = this.container.querySelector<HTMLElement>('#chat-original-count');

    // Remove empty placeholders if present
    originalFeed?.querySelector('.chat-feed-empty')?.remove();
    translatedFeed?.querySelector('.chat-feed-empty')?.remove();

    for (const line of lines) {
      this.chatHistory.push(line);
      const timeStr = new Date(line.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      // Original French item
      if (originalFeed) {
        const origRow = document.createElement('div');
        origRow.className = 'chat-message-row original-row';
        origRow.dataset.id = line.id;
        origRow.innerHTML = `
          <div class="chat-row-meta">
            <span class="chat-timestamp">${timeStr}</span>
            ${line.username ? `<span class="chat-username">${escapeHtml(line.username)}</span>` : ''}
          </div>
          <div class="chat-row-body">${highlightBrackets(line.originalFrench)}</div>
        `;
        originalFeed.appendChild(origRow);
      }

      // Translated English item
      if (translatedFeed) {
        const transRow = document.createElement('div');
        transRow.className = 'chat-message-row translated-row';
        transRow.dataset.id = line.id;
        transRow.innerHTML = `
          <div class="chat-row-meta">
            <span class="chat-timestamp">${timeStr}</span>
            ${line.username ? `<span class="chat-username">${escapeHtml(line.username)}</span>` : ''}
          </div>
          <div class="chat-row-body">${highlightBrackets(line.translatedEnglish)}</div>
        `;
        translatedFeed.appendChild(transRow);
      }
    }

    if (countBadge) {
      countBadge.textContent = `${this.chatHistory.length} lines`;
    }

    // Auto-scroll feeds to bottom
    if (originalFeed) originalFeed.scrollTop = originalFeed.scrollHeight;
    if (translatedFeed) translatedFeed.scrollTop = translatedFeed.scrollHeight;
  }

  clearFeed(): void {
    this.chatHistory = [];
    this.controller.clearHistory();

    const originalFeed = this.container.querySelector<HTMLElement>('#chat-feed-original');
    const translatedFeed = this.container.querySelector<HTMLElement>('#chat-feed-translated');
    const countBadge = this.container.querySelector<HTMLElement>('#chat-original-count');

    if (originalFeed) {
      originalFeed.innerHTML =
        '<div class="chat-feed-empty">No chat captured yet. Share screen and position the crop box over the chat.</div>';
    }
    if (translatedFeed) {
      translatedFeed.innerHTML =
        '<div class="chat-feed-empty">Translated messages will appear here in real time.</div>';
    }
    if (countBadge) {
      countBadge.textContent = '0 lines';
    }
  }

  private bindRoiInteractions(): void {
    const roiBox = this.container.querySelector<HTMLElement>('#chat-roi-box');
    const wrapper = this.container.querySelector<HTMLElement>('#chat-video-wrapper');
    const handle = this.container.querySelector<HTMLElement>('#chat-roi-handle');
    if (!roiBox || !wrapper || !handle) return;

    let isDragging = false;
    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;
    let initialW = 0;
    let initialH = 0;

    roiBox.addEventListener('mousedown', (e: MouseEvent) => {
      if (this.isRoiLocked) return;
      if (e.target === handle) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = wrapper.getBoundingClientRect();
      initialX = (roiBox.offsetLeft / (rect.width || 1)) * 100;
      initialY = (roiBox.offsetTop / (rect.height || 1)) * 100;
      e.preventDefault();
    });

    handle.addEventListener('mousedown', (e: MouseEvent) => {
      if (this.isRoiLocked) return;
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = wrapper.getBoundingClientRect();
      initialW = (roiBox.offsetWidth / (rect.width || 1)) * 100;
      initialH = (roiBox.offsetHeight / (rect.height || 1)) * 100;
      e.stopPropagation();
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isDragging && !isResizing) return;
      const rect = wrapper.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const deltaXPercent = ((e.clientX - startX) / rect.width) * 100;
      const deltaYPercent = ((e.clientY - startY) / rect.height) * 100;

      if (isDragging) {
        const newX = Math.max(
          0,
          Math.min(100 - this.currentRoi.width * 100, initialX + deltaXPercent)
        );
        const newY = Math.max(
          0,
          Math.min(100 - this.currentRoi.height * 100, initialY + deltaYPercent)
        );
        this.currentRoi.x = newX / 100;
        this.currentRoi.y = newY / 100;
      } else if (isResizing) {
        const newW = Math.max(
          10,
          Math.min(100 - this.currentRoi.x * 100, initialW + deltaXPercent)
        );
        const newH = Math.max(
          10,
          Math.min(100 - this.currentRoi.y * 100, initialH + deltaYPercent)
        );
        this.currentRoi.width = newW / 100;
        this.currentRoi.height = newH / 100;
      }

      this.applyRoiToOverlay();
      localStorage.setItem(STORAGE_KEYS.roi, JSON.stringify(this.currentRoi));
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      isResizing = false;
    });
  }

  private applyRoiToOverlay(): void {
    const roiBox = this.container.querySelector<HTMLElement>('#chat-roi-box');
    if (!roiBox) return;

    roiBox.style.left = `${this.currentRoi.x * 100}%`;
    roiBox.style.top = `${this.currentRoi.y * 100}%`;
    roiBox.style.width = `${this.currentRoi.width * 100}%`;
    roiBox.style.height = `${this.currentRoi.height * 100}%`;
  }
}
