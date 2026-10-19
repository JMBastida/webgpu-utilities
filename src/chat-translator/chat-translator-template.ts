export const renderChatTranslatorTemplate = (): string => `
<div id="chat-translator-container" class="chat-translator-container">
  <!-- Top Action & Status Bar -->
  <header class="copilot-header chat-header">
    <div class="copilot-header-left">
      <div id="chat-status-pill" class="copilot-status-pill status-watching">
        <span class="status-dot"></span>
        <span id="chat-status-text">READY</span>
      </div>
      <span id="chat-status-detail" class="copilot-status-detail">Screen capture idle</span>
    </div>

    <!-- Center Engine Selector -->
    <div class="chat-engine-selector" role="group" aria-label="Translation Engine">
      <button type="button" id="chat-engine-gemini" class="chat-engine-btn active" data-engine="gemini">
        ⚡ Gemini 3.8 Flash (Slang Aware)
      </button>
      <button type="button" id="chat-engine-bergamot" class="chat-engine-btn" data-engine="bergamot">
        🔒 Bergamot (Local WASM)
      </button>
    </div>

    <div class="copilot-header-right">
      <label class="toggle-switch" title="Toggle automatic scanning">
        <input type="checkbox" id="chat-auto-toggle" checked />
        <span class="toggle-slider"></span>
        <span class="toggle-label">Auto-Scan</span>
      </label>
      <button id="chat-force-btn" class="primary-button" type="button" title="Capture and translate current chat frame now">
        ⚡ Force Shoot
      </button>
      <button id="chat-clear-btn" class="ghost-button" type="button" title="Clear chat feed history">
        🗑️ Clear
      </button>
      <button id="chat-settings-btn" class="ghost-button" type="button" title="Configure API & scan intervals">
        ⚙ Settings
      </button>
    </div>
  </header>

  <!-- Settings Panel Drawer (Hidden by default) -->
  <div id="chat-settings-panel" class="copilot-settings-panel hidden">
    <div class="copilot-settings-header">
      <h3>Game Chat Translator Settings</h3>
      <button id="chat-close-settings-btn" class="icon-button" type="button">&times;</button>
    </div>
    <div class="field-group">
      <label for="chat-api-key">Gemini API Key</label>
      <input type="password" id="chat-api-key" placeholder="AIzaSy..." />
      <span class="field-hint">Required for Gemini translation mode. Stored locally in browser.</span>
    </div>
    <div class="field-group">
      <label for="chat-gemini-model">Gemini Model</label>
      <select id="chat-gemini-model">
        <option value="gemini-3.8-flash">Gemini 3.8 Flash (Latest, Recommended)</option>
        <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
        <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
      </select>
    </div>
    <div class="field-group">
      <label for="chat-scan-interval">Scan Interval: <span id="chat-scan-interval-val">2s</span></label>
      <input type="range" id="chat-scan-interval" min="1" max="10" value="2" />
    </div>
    <button id="chat-save-settings-btn" class="primary-button" type="button">Save Settings</button>
  </div>

  <div class="chat-translator-body">
    <!-- Top/Left: Screen Capture & Interactive Crop Area -->
    <section class="chat-capture-section">
      <div class="chat-capture-bar">
        <button id="chat-start-share-btn" class="primary-button" type="button">
          🖥️ Share Screen / Window
        </button>
        <button id="chat-stop-share-btn" class="ghost-button hidden" type="button">
          ⏹️ Stop Share
        </button>
        <button id="chat-toggle-roi-lock" class="ghost-button" type="button" title="Lock/Unlock crop box">
          🔓 Unlock Chat ROI
        </button>
        <span class="field-hint">Drag & resize the glowing box over the in-game chat area.</span>
      </div>

      <div class="video-preview-wrapper chat-video-preview-wrapper" id="chat-video-wrapper">
        <video id="chat-video" autoplay playsinline muted></video>
        <div id="chat-roi-box" class="copilot-roi-box">
          <span class="roi-label">Game Chat Area</span>
          <div class="roi-handle roi-handle-br" id="chat-roi-handle"></div>
        </div>
      </div>

      <div class="detected-text-accordion">
        <details>
          <summary>Detected Screen Text (Raw OCR)</summary>
          <pre id="chat-raw-ocr-text" class="detected-question-pre">Waiting for screen capture...</pre>
        </details>
      </div>
    </section>

    <!-- Synchronized Side-by-Side Dual Feed -->
    <section class="chat-feed-section">
      <div class="side-by-side-chat">
        <!-- Left: Original French -->
        <div class="chat-column chat-column-original">
          <div class="chat-column-header">
            <span class="column-title">🇫🇷 French Chat (OCR)</span>
            <span id="chat-original-count" class="chat-count-badge">0 lines</span>
          </div>
          <div id="chat-feed-original" class="chat-feed-box" tabindex="0">
            <div class="chat-feed-empty">No chat captured yet. Share screen and position the crop box over the chat.</div>
          </div>
        </div>

        <!-- Right: Translated English -->
        <div class="chat-column chat-column-translated">
          <div class="chat-column-header">
            <span class="column-title">🇬🇧 English Translation</span>
            <span id="chat-translated-engine-badge" class="chat-engine-badge">Gemini</span>
          </div>
          <div id="chat-feed-translated" class="chat-feed-box" tabindex="0">
            <div class="chat-feed-empty">Translated messages will appear here in real time.</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</div>
`;
