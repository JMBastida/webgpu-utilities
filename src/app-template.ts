import { renderCopilotTemplate } from './copilot/copilot-template';
import { renderChatTranslatorTemplate } from './chat-translator/chat-translator-template';

export const getAppTemplate = (): string => `
  <div class="page">
    <header class="hero">
      <div class="hero-content">
        <p class="eyebrow">Multi-Engine OCR & Screen Copilot</p>
        <h1>Extract & Solve directly in your browser.</h1>
        <p class="subtitle">
          Privacy-first local OCR and autonomous screen-monitoring assistant powered by Gemini.
        </p>
      </div>
      <nav class="app-mode-nav" role="tablist" aria-label="Application mode">
        <button id="nav-mode-ocr" class="mode-tab is-active" type="button" role="tab" aria-selected="true">
          📄 Document OCR
        </button>
        <button id="nav-mode-copilot" class="mode-tab" type="button" role="tab" aria-selected="false">
          ⚡ Screen Copilot
        </button>
        <button id="nav-mode-chat" class="mode-tab" type="button" role="tab" aria-selected="false">
          🎮 Game Chat Translator
        </button>
      </nav>
    </header>

    <div id="ocr-view-container">
    <main class="main-grid">
      <section class="panel upload-panel">
        <h2>1. Settings & Source</h2>
        <div class="engine-select">
          <label for="engine-select">OCR engine</label>
          <select id="engine-select"></select>
          <div id="engine-details" class="engine-details"></div>
        </div>
        <div id="language-select-container" class="engine-select hidden">
          <label for="language-select">Language</label>
          <select id="language-select"></select>
          <div id="language-hint" class="field-hint"></div>
        </div>

        <div class="input-methods">
          <div class="method-tabs" role="tablist" aria-label="Image source">
            <button class="method-tab is-active" type="button" data-method="file" role="tab" aria-selected="true">
              Upload
            </button>
            <button class="method-tab" type="button" data-method="url" role="tab" aria-selected="false">
              URL
            </button>
          </div>
          <div class="method-panels">
            <div class="method-panel is-active" data-method="file" role="tabpanel">
              <div class="file-input">
                <label for="file-input" class="method-label">Upload File</label>
                <input id="file-input" type="file" accept="image/jpeg,image/png,image/webp,image/bmp" />
                <div id="file-meta" class="file-meta">No file selected.</div>
              </div>
            </div>

            <div class="method-panel" data-method="url" role="tabpanel">
              <div class="url-input">
                <label for="url-input" class="method-label">Image URL</label>
                <div class="url-row">
                  <input id="url-input" type="url" placeholder="https://example.com/image.jpg" />
                  <button id="load-url-button" class="icon-button" title="Load image from URL">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div id="image-preview-container" class="image-preview-container hidden">
          <div id="preview-wrapper" class="preview-wrapper">
            <img id="image-preview" class="image-preview" src="" alt="Preview" />
            <div id="ocr-overlay" class="ocr-overlay"></div>
          </div>
        </div>

        <button id="run-button" class="primary-button" type="button">Extract text</button>
      </section>

      <div class="results-column">
        <section class="status-card" data-stage="idle">
          <div class="status-row">
            <span class="status-label">Status</span>
            <span id="status-text">Idle</span>
          </div>
          <div class="progress">
            <div id="progress-bar" class="progress-bar"></div>
          </div>
          <div id="progress-text" class="progress-text">0%</div>
          <div class="metrics">
            <div id="load-metric">Load: --</div>
            <div id="process-metric">Process: --</div>
          </div>
        </section>

      <section class="panel result-panel">
          <div class="result-header">
            <h2>2. OCR output</h2>
            <button id="copy-output-button" class="icon-button hidden" title="Copy all text">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
          <div id="output" class="output">Upload an image to begin.</div>
          <section class="translate-section" aria-labelledby="translate-image-heading">
            <div class="result-header">
              <h3 id="translate-image-heading">Replace text in image</h3>
            </div>
            <div class="translate-controls">
              <div class="translate-selectors" role="group" aria-label="Translation settings">
                <div class="translate-select">
                  <label for="translate-image-from">From</label>
                  <select id="translate-image-from"></select>
                </div>
                <div class="translate-select">
                  <label for="translate-image-to">To</label>
                  <select id="translate-image-to"></select>
                </div>
                <div class="translate-select">
                  <label for="translate-image-quality">Quality</label>
                  <select id="translate-image-quality">
                    <option value="fast">Fast</option>
                    <option value="balanced" selected>Balanced</option>
                    <option value="high-quality">High quality</option>
                  </select>
                </div>
              </div>
              <div class="translate-actions" role="group" aria-label="Replacement actions">
                <button id="translate-image-run" class="primary-button" type="button" disabled>
                  Replace and translate
                </button>
                <button id="translate-image-apply-edits" class="ghost-button" type="button" disabled>
                  Apply text edits
                </button>
                <button id="translate-image-download" class="ghost-button" type="button" disabled>
                  Download PNG
                </button>
              </div>
            </div>
            <div id="translate-image-status" class="translate-status" role="status">
              Run OCR to enable image replacement.
            </div>
            <div id="translate-image-error" class="translate-error hidden" role="alert"></div>
            <div id="translate-image-editor" class="translate-image-editor hidden" aria-label="Replacement text editor"></div>
            <div class="image-compare">
              <div class="preview-card">
                <div class="preview-label">Original</div>
                <div class="preview-wrapper">
                  <img id="replace-original-preview" class="image-preview" alt="Original image" />
                </div>
              </div>
              <div id="translate-image-result" class="preview-card hidden">
                <div class="preview-label">Translated</div>
                <div class="preview-wrapper">
                  <img id="translate-image-preview" class="image-preview" alt="Translated image" />
                </div>
              </div>
            </div>
          </section>
        </section>
      </div>
      </div>
    </main>
    </div>

    <div id="copilot-view-container" class="hidden">
      ${renderCopilotTemplate()}
    </div>

    <div id="chat-view-container" class="hidden">
      ${renderChatTranslatorTemplate()}
    </div>

    <section id="error-panel" class="panel error-panel hidden">
      <div class="error-header">
        <h2>Issue detected</h2>
        <button id="retry-button" class="ghost-button" type="button">Retry</button>
      </div>
      <p id="error-message" class="error-message"></p>
      <p id="error-suggestion" class="error-suggestion"></p>
    </section>
  </div>

  <div id="image-modal" class="image-modal hidden">
    <div id="modal-content" class="modal-content">
      <span id="close-modal" class="close-modal">&times;</span>
      <div id="modal-preview-wrapper" class="preview-wrapper">
        <img id="modal-image" class="modal-image" src="" alt="Enlarged Preview" />
        <div id="ocr-overlay-modal" class="ocr-overlay"></div>
      </div>
    </div>
  </div>
  <div id="drop-overlay" class="drop-overlay hidden">
    <div class="drop-content">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
      </svg>
      <span>Drop image to process</span>
    </div>
  </div>
`;
