import type { ContextPreset, CopilotState, NormalizedRoi, SolutionResult } from './types';
import type { CopilotController } from './copilot-controller';
import type { VideoCaptureManager } from './video-capture-manager';

export interface CopilotUiConfig {
  apiKeyStorageKey?: string;
  roiStorageKey?: string;
  presetStorageKey?: string;
  contextStorageKey?: string;
  cameraStorageKey?: string;
  modelStorageKey?: string;
  intervalStorageKey?: string;
}

const STORAGE_KEYS = {
  apiKey: 'copilot_gemini_api_key',
  roi: 'copilot_camera_roi',
  preset: 'copilot_context_preset',
  context: 'copilot_custom_context',
  camera: 'copilot_camera_device_id',
  model: 'copilot_gemini_model',
  interval: 'copilot_scan_interval',
};

export class CopilotUi {
  private readonly container: HTMLElement;
  private readonly controller: CopilotController;
  private readonly videoManager: VideoCaptureManager;

  private currentRoi: NormalizedRoi = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
  private isRoiLocked = false;
  private solutionsHistory: SolutionResult[] = [];

  constructor(
    container: HTMLElement,
    controller: CopilotController,
    videoManager: VideoCaptureManager
  ) {
    this.container = container;
    this.controller = controller;
    this.videoManager = videoManager;
  }

  async init(): Promise<void> {
    this.loadStoredPreferences();
    this.bindDomEvents();
    await this.setupCameraSelector();
    this.applyRoiToOverlay();
  }

  private loadStoredPreferences(): void {
    const savedApiKey = localStorage.getItem(STORAGE_KEYS.apiKey) ?? '';
    const savedModel = localStorage.getItem(STORAGE_KEYS.model) ?? 'gemini-2.5-flash';
    const savedPreset = (localStorage.getItem(STORAGE_KEYS.preset) as ContextPreset) ?? 'sql';
    const savedContext = localStorage.getItem(STORAGE_KEYS.context) ?? '';
    const savedInterval = Number(localStorage.getItem(STORAGE_KEYS.interval)) || 3;

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

    const apiKeyInput = this.container.querySelector<HTMLInputElement>('#copilot-api-key');
    if (apiKeyInput) apiKeyInput.value = savedApiKey;

    const modelSelect = this.container.querySelector<HTMLSelectElement>('#copilot-gemini-model');
    if (modelSelect) modelSelect.value = savedModel;

    const customContextInput = this.container.querySelector<HTMLTextAreaElement>(
      '#copilot-custom-context'
    );
    if (customContextInput) customContextInput.value = savedContext;

    const intervalSlider = this.container.querySelector<HTMLInputElement>(
      '#copilot-scan-interval'
    );
    const intervalLabel = this.container.querySelector<HTMLElement>('#copilot-scan-interval-val');
    if (intervalSlider) {
      intervalSlider.value = String(savedInterval);
      if (intervalLabel) intervalLabel.textContent = `${savedInterval}s`;
    }

    this.controller.updateConfig({
      geminiApiKey: savedApiKey,
      geminiModel: savedModel,
      contextPreset: savedPreset,
      customContext: savedContext,
      scanIntervalSec: savedInterval,
      roi: this.currentRoi,
    });

    this.setActivePreset(savedPreset);
  }

  private bindDomEvents(): void {
    // Force solve button
    const forceSolveBtn = this.container.querySelector<HTMLButtonElement>(
      '#copilot-force-solve-btn'
    );
    if (forceSolveBtn) {
      forceSolveBtn.addEventListener('click', () => {
        void this.controller.forceSolve();
      });
    }

    // Auto toggle
    const autoToggle = this.container.querySelector<HTMLInputElement>('#copilot-auto-toggle');
    if (autoToggle) {
      autoToggle.addEventListener('change', () => {
        const isEnabled = autoToggle.checked;
        this.controller.updateConfig({ autoEnabled: isEnabled });
        if (isEnabled) {
          this.controller.start();
        } else {
          this.controller.stop();
        }
      });
    }

    // Settings drawer toggle
    const settingsBtn = this.container.querySelector<HTMLButtonElement>('#copilot-settings-btn');
    const settingsCloseBtn = this.container.querySelector<HTMLButtonElement>(
      '#copilot-close-settings-btn'
    );
    const settingsPanel = this.container.querySelector<HTMLElement>('#copilot-settings-panel');

    const toggleSettings = (open?: boolean): void => {
      if (!settingsPanel) return;
      const willOpen = open ?? settingsPanel.classList.contains('hidden');
      settingsPanel.classList.toggle('hidden', !willOpen);
    };

    if (settingsBtn) settingsBtn.addEventListener('click', () => toggleSettings());
    if (settingsCloseBtn) settingsCloseBtn.addEventListener('click', () => toggleSettings(false));

    // Save settings
    const saveSettingsBtn = this.container.querySelector<HTMLButtonElement>(
      '#copilot-save-settings-btn'
    );
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', () => {
        const apiKey =
          this.container.querySelector<HTMLInputElement>('#copilot-api-key')?.value.trim() ?? '';
        const model =
          this.container.querySelector<HTMLSelectElement>('#copilot-gemini-model')?.value ??
          'gemini-2.5-flash';
        const customContext =
          this.container
            .querySelector<HTMLTextAreaElement>('#copilot-custom-context')
            ?.value.trim() ?? '';
        const interval =
          Number(
            this.container.querySelector<HTMLInputElement>('#copilot-scan-interval')?.value
          ) || 3;

        localStorage.setItem(STORAGE_KEYS.apiKey, apiKey);
        localStorage.setItem(STORAGE_KEYS.model, model);
        localStorage.setItem(STORAGE_KEYS.context, customContext);
        localStorage.setItem(STORAGE_KEYS.interval, String(interval));

        this.controller.updateConfig({
          geminiApiKey: apiKey,
          geminiModel: model,
          customContext,
          scanIntervalSec: interval,
        });

        toggleSettings(false);
      });
    }

    // Interval slider live label
    const intervalSlider = this.container.querySelector<HTMLInputElement>(
      '#copilot-scan-interval'
    );
    const intervalLabel = this.container.querySelector<HTMLElement>('#copilot-scan-interval-val');
    if (intervalSlider && intervalLabel) {
      intervalSlider.addEventListener('input', () => {
        intervalLabel.textContent = `${intervalSlider.value}s`;
      });
    }

    // Presets
    const presetChips = this.container.querySelectorAll<HTMLButtonElement>('.preset-chip');
    presetChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const preset = (chip.dataset.preset as ContextPreset) ?? 'general';
        this.setActivePreset(preset);
        localStorage.setItem(STORAGE_KEYS.preset, preset);
        this.controller.updateConfig({ contextPreset: preset });
      });
    });

    // Copy Code button & shortcut
    const copyCodeBtn = this.container.querySelector<HTMLButtonElement>('#copilot-copy-code-btn');
    if (copyCodeBtn) {
      copyCodeBtn.addEventListener('click', () => {
        this.copyCurrentCode();
      });
    }

    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (
        (e.key === 'c' || e.key === 'C') &&
        !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
      ) {
        this.copyCurrentCode();
      }
    });

    // ROI Lock button
    const roiLockBtn = this.container.querySelector<HTMLButtonElement>('#copilot-toggle-roi-lock');
    if (roiLockBtn) {
      roiLockBtn.addEventListener('click', () => {
        this.isRoiLocked = !this.isRoiLocked;
        roiLockBtn.textContent = this.isRoiLocked ? '🔒 ROI Locked' : '🔓 Unlock ROI';
        const roiBox = this.container.querySelector<HTMLElement>('#copilot-roi-box');
        if (roiBox) {
          roiBox.classList.toggle('is-locked', this.isRoiLocked);
        }
      });
    }

    this.bindRoiInteractions();
  }

  private setActivePreset(preset: ContextPreset): void {
    const presetChips = this.container.querySelectorAll<HTMLButtonElement>('.preset-chip');
    presetChips.forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.preset === preset);
    });
  }

  private async setupCameraSelector(): Promise<void> {
    const select = this.container.querySelector<HTMLSelectElement>('#copilot-camera-select');
    if (!select) return;

    const devices = await this.videoManager.getAvailableDevices();
    select.innerHTML = '';

    devices.forEach((device) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label;
      select.appendChild(option);
    });

    const savedDevice = localStorage.getItem(STORAGE_KEYS.camera);
    if (savedDevice && devices.some((d) => d.deviceId === savedDevice)) {
      select.value = savedDevice;
    }

    select.addEventListener('change', () => {
      const selectedId = select.value;
      localStorage.setItem(STORAGE_KEYS.camera, selectedId);
      this.controller.updateConfig({ cameraDeviceId: selectedId });
      void this.videoManager.startStream(selectedId);
    });

    // Start stream with selected device
    const initialDevice = select.value || undefined;
    await this.videoManager.startStream(initialDevice).catch(() => {});
  }

  private bindRoiInteractions(): void {
    const roiBox = this.container.querySelector<HTMLElement>('#copilot-roi-box');
    const wrapper = this.container.querySelector<HTMLElement>('#video-preview-wrapper');
    const handle = this.container.querySelector<HTMLElement>('#copilot-roi-handle');
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
      if (e.target === handle) return; // resize handled separately
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = wrapper.getBoundingClientRect();
      initialX = (roiBox.offsetLeft / rect.width) * 100;
      initialY = (roiBox.offsetTop / rect.height) * 100;
      e.preventDefault();
    });

    handle.addEventListener('mousedown', (e: MouseEvent) => {
      if (this.isRoiLocked) return;
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = wrapper.getBoundingClientRect();
      initialW = (roiBox.offsetWidth / rect.width) * 100;
      initialH = (roiBox.offsetHeight / rect.height) * 100;
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
        const newX = Math.max(0, Math.min(100 - this.currentRoi.width * 100, initialX + deltaXPercent));
        const newY = Math.max(0, Math.min(100 - this.currentRoi.height * 100, initialY + deltaYPercent));
        this.currentRoi.x = newX / 100;
        this.currentRoi.y = newY / 100;
      } else if (isResizing) {
        const newW = Math.max(10, Math.min(100 - this.currentRoi.x * 100, initialW + deltaXPercent));
        const newH = Math.max(10, Math.min(100 - this.currentRoi.y * 100, initialH + deltaYPercent));
        this.currentRoi.width = newW / 100;
        this.currentRoi.height = newH / 100;
      }

      this.applyRoiToOverlay();
      this.controller.updateConfig({ roi: this.currentRoi });
      localStorage.setItem(STORAGE_KEYS.roi, JSON.stringify(this.currentRoi));
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      isResizing = false;
    });
  }

  private applyRoiToOverlay(): void {
    const roiBox = this.container.querySelector<HTMLElement>('#copilot-roi-box');
    if (!roiBox) return;

    roiBox.style.left = `${this.currentRoi.x * 100}%`;
    roiBox.style.top = `${this.currentRoi.y * 100}%`;
    roiBox.style.width = `${this.currentRoi.width * 100}%`;
    roiBox.style.height = `${this.currentRoi.height * 100}%`;
  }

  updateStatus(state: CopilotState, message?: string): void {
    const statusPill = this.container.querySelector<HTMLElement>('#copilot-status-pill');
    const statusText = this.container.querySelector<HTMLElement>('#copilot-status-text');
    const statusDetail = this.container.querySelector<HTMLElement>('#copilot-status-detail');

    if (statusPill && statusText) {
      statusPill.className = `copilot-status-pill status-${state.toLowerCase()}`;
      statusText.textContent = state;
    }

    if (statusDetail && message) {
      statusDetail.textContent = message;
    }
  }

  updateDetectedQuestion(text: string): void {
    const pre = this.container.querySelector<HTMLElement>('#copilot-detected-question');
    if (pre) pre.textContent = text;
  }

  displaySolution(solution: SolutionResult): void {
    this.solutionsHistory.unshift(solution);

    const codeEl = this.container.querySelector<HTMLElement>('#copilot-solution-code');
    const bulletsEl = this.container.querySelector<HTMLElement>('#copilot-solution-bullets');
    const complexityEl = this.container.querySelector<HTMLElement>('#copilot-solution-complexity');
    const timeEl = this.container.querySelector<HTMLElement>('#solution-timestamp');

    if (codeEl) codeEl.textContent = solution.code || solution.rawResponse || 'No code snippet.';
    if (bulletsEl) {
      bulletsEl.innerHTML = '';
      if (solution.explanation.length > 0) {
        solution.explanation.forEach((bullet) => {
          const li = document.createElement('li');
          li.textContent = bullet;
          bulletsEl.appendChild(li);
        });
      } else {
        const li = document.createElement('li');
        li.textContent = 'Direct solution provided above.';
        bulletsEl.appendChild(li);
      }
    }

    if (complexityEl) {
      complexityEl.textContent = solution.complexity ?? '';
      complexityEl.style.display = solution.complexity ? 'block' : 'none';
    }

    if (timeEl) {
      timeEl.textContent = `Solved at ${new Date(solution.timestamp).toLocaleTimeString()}`;
    }

    this.renderHistory();
  }

  private renderHistory(): void {
    const historyList = this.container.querySelector<HTMLElement>('#copilot-history-list');
    if (!historyList) return;

    if (this.solutionsHistory.length === 0) {
      historyList.innerHTML = '<div class="history-empty">No solved questions yet this session.</div>';
      return;
    }

    historyList.innerHTML = '';
    this.solutionsHistory.forEach((sol, index) => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML = `
        <div class="history-meta">
          <span class="history-time">${new Date(sol.timestamp).toLocaleTimeString()}</span>
          <span class="history-idx">#${this.solutionsHistory.length - index}</span>
        </div>
        <div class="history-snippet">${sol.questionText.substring(0, 80)}...</div>
      `;
      item.addEventListener('click', () => {
        this.displaySolution(sol);
      });
      historyList.appendChild(item);
    });
  }

  private copyCurrentCode(): void {
    const codeEl = this.container.querySelector<HTMLElement>('#copilot-solution-code');
    const copyBtn = this.container.querySelector<HTMLButtonElement>('#copilot-copy-code-btn');
    if (!codeEl?.textContent) return;

    void navigator.clipboard.writeText(codeEl.textContent).then(() => {
      if (copyBtn) {
        const orig = copyBtn.textContent;
        copyBtn.textContent = '✅ Copied!';
        setTimeout(() => {
          copyBtn.textContent = orig;
        }, 1500);
      }
    });
  }
}
