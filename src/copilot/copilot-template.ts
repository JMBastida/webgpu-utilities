export const renderCopilotTemplate = (): string => `
<div id="copilot-container" class="copilot-container">
  <!-- Top Copilot Status & Action Bar -->
  <header class="copilot-header">
    <div class="copilot-header-left">
      <div id="copilot-status-pill" class="copilot-status-pill status-watching">
        <span class="status-dot"></span>
        <span id="copilot-status-text">WATCHING SCREEN</span>
      </div>
      <span id="copilot-status-detail" class="copilot-status-detail">Sampling every 3s</span>
    </div>
    <div class="copilot-header-right">
      <label class="toggle-switch" title="Toggle automatic scanning">
        <input type="checkbox" id="copilot-auto-toggle" checked />
        <span class="toggle-slider"></span>
        <span class="toggle-label">Auto-Solve</span>
      </label>
      <button id="copilot-force-solve-btn" class="primary-button" type="button" title="Capture and solve now">
        ⚡ Force Solve
      </button>
      <button id="copilot-settings-btn" class="ghost-button" type="button" title="Settings">
        ⚙ Settings
      </button>
    </div>
  </header>

  <!-- Settings Drawer / Modal (Hidden by default) -->
  <div id="copilot-settings-panel" class="copilot-settings-panel hidden">
    <div class="copilot-settings-header">
      <h3>Copilot Configuration</h3>
      <button id="copilot-close-settings-btn" class="icon-button" type="button">&times;</button>
    </div>
    <div class="field-group">
      <label for="copilot-api-key">Gemini API Key</label>
      <input type="password" id="copilot-api-key" placeholder="AIzaSy..." />
      <span class="field-hint">Stored strictly in local browser storage.</span>
    </div>
    <div class="field-group">
      <label for="copilot-gemini-model">Gemini Model</label>
      <select id="copilot-gemini-model">
        <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fastest, Recommended)</option>
        <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
      </select>
    </div>
    <div class="field-group">
      <label for="copilot-scan-interval">Scan Interval (seconds): <span id="copilot-scan-interval-val">3s</span></label>
      <input type="range" id="copilot-scan-interval" min="1" max="10" value="3" />
    </div>
    <div class="field-group">
      <label for="copilot-custom-context">Custom System / Domain Context</label>
      <textarea id="copilot-custom-context" rows="3" placeholder="Additional prompt instructions (e.g. Postgres dialect, LeetCode style)..."></textarea>
    </div>
    <button id="copilot-save-settings-btn" class="primary-button" type="button">Save Settings</button>
  </div>

  <div class="copilot-body">
    <!-- Left Column: Camera Preview & ROI -->
    <section class="copilot-camera-panel" id="copilot-camera-panel">
      <div class="camera-controls-bar">
        <select id="copilot-camera-select" title="Select camera device"></select>
        <button id="copilot-toggle-roi-lock" class="ghost-button" type="button" title="Lock/Unlock crop box">
          🔓 Unlock ROI
        </button>
      </div>
      <div class="video-preview-wrapper" id="video-preview-wrapper">
        <video id="copilot-video" autoplay playsinline muted></video>
        <!-- Overlay ROI crop rectangle -->
        <div id="copilot-roi-box" class="copilot-roi-box">
          <span class="roi-label">Screen Target</span>
          <div class="roi-handle roi-handle-br" id="copilot-roi-handle"></div>
        </div>
      </div>
      <div class="detected-text-accordion">
        <details>
          <summary>Detected Screen Text (Raw OCR)</summary>
          <pre id="copilot-detected-question" class="detected-question-pre">Waiting for screen capture...</pre>
        </details>
      </div>
    </section>

    <!-- Right Column: High-Visibility Solution Dashboard -->
    <section class="copilot-solution-panel">
      <!-- Domain Context Presets -->
      <div class="preset-selector-bar">
        <span class="preset-label">Goal Context:</span>
        <button class="preset-chip active" data-preset="sql" type="button">SQL Specialist</button>
        <button class="preset-chip" data-preset="java" type="button">Java Specialist</button>
        <button class="preset-chip" data-preset="general" type="button">General Coding</button>
        <button class="preset-chip" data-preset="custom" type="button">Custom</button>
      </div>

      <!-- Solution Card -->
      <article class="solution-card" id="copilot-solution-card">
        <div class="solution-card-header">
          <span id="solution-timestamp" class="solution-timestamp">Ready</span>
          <button id="copilot-copy-code-btn" class="icon-button" type="button" title="Copy Code (Shortcut: C)">
            📋 Copy Code
          </button>
        </div>

        <div class="solution-code-container">
          <pre><code id="copilot-solution-code" class="solution-code">Waiting for question on screen...</code></pre>
        </div>

        <div class="solution-explanation-container">
          <h4>Key Talking Points</h4>
          <ul id="copilot-solution-bullets" class="solution-bullets">
            <li>Point your external camera at Computer A's screen.</li>
            <li>Adjust the green crop box over the coding problem area.</li>
            <li>New questions will be solved automatically here.</li>
          </ul>
          <div id="copilot-solution-complexity" class="solution-complexity"></div>
        </div>
      </article>

      <!-- History Drawer -->
      <aside class="copilot-history-drawer">
        <h4>Session History</h4>
        <div id="copilot-history-list" class="copilot-history-list">
          <div class="history-empty">No solved questions yet this session.</div>
        </div>
      </aside>
    </section>
  </div>
</div>
`;
