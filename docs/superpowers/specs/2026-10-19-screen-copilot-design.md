# Autonomous Screen-Watcher & Interview Copilot Design Specification

- **Date**: 2026-10-19
- **Status**: Approved by User
- **Author**: Antigravity Assistant & Jorge

---

## 1. Executive Summary & Goal

The user requires an autonomous "Screen Copilot" mode for technical interviews and coding tasks where two separate computers are involved:
1. **Computer A**: The interview workstation displaying code challenges, SQL problems, or technical questions.
2. **Computer B**: The assistant workstation running this web application.

An external camera connected to Computer B is physically focused on Computer A's screen. Computer B operates completely autonomously in a hands-free manner:
- Continuously monitors the camera stream.
- Extracts text via local OCR on a specified Region of Interest (ROI).
- Autonomously detects when a new question or challenge appears using smart text-change debounce and similarity analysis.
- Automatically sends the extracted question along with pre-configured Goal Context (e.g. SQL Specialist, Java Backend Specialist) to Google Gemini API.
- Renders the solution, code snippets, and talking points on Computer B's screen in high contrast and large typography, visible at a glance.

---

## 2. Architecture & Data Flow

```mermaid
graph TD
    A[External USB Camera] -->|MediaStream| B[VideoCaptureManager]
    B -->|Live Frame Canvas| C[ROI Crop Selector]
    C -->|Cropped Frame (ImageData)| D[Screen Preprocessor]
    D -->|Enhanced Contrast| E[OCR Engine (Tesseract.js)]
    E -->|Extracted Text| F[ChangeDetector & Normalizer]
    F -->|Same Text (>= 80% similarity)| G[Status: Watching (No Action)]
    F -->|New Text (< 80% similarity)| H[Stabilization Timer (1.5s)]
    H -->|Confirmed Change| I[GeminiSolver]
    J[Goal Context & Presets (SQL / Java)] --> I
    K[Gemini API Key (localStorage)] --> I
    I -->|REST API Request| L[Google Gemini API]
    L -->|Structured Answer| M[Copilot Dashboard UI]
    M --> N[Active Solution View (Syntax Code + Bullets)]
    M --> O[Session History Timeline]
```

---

## 3. Component Specifications

### 3.1. VideoCaptureManager (`src/copilot/video-capture-manager.ts`)
- **Responsibilities**:
  - Enumerate and manage video input devices via `navigator.mediaDevices.enumerateDevices()`.
  - Request high-definition video constraints (`width: { ideal: 1920 }, height: { ideal: 1080 }`).
  - Render live video feed to an HTML `<video>` element.
  - Expose `captureFrame(): HTMLCanvasElement | ImageData` to grab the current video frame at native resolution.
  - Persist chosen `deviceId` in `localStorage` under `copilot_camera_device_id`.
  - Gracefully handle permission denials, device disconnection, and reconnection.

### 3.2. Region of Interest (ROI) Selector (`src/copilot/roi-selector.ts`)
- **Responsibilities**:
  - Provide an interactive draggable/resizable crop rectangle overlay on top of the live video preview.
  - Normalized coordinates `(x, y, width, height)` stored as percentages (0.0 to 1.0) so changes in camera resolution do not break alignment.
  - Persist current ROI in `localStorage` under `copilot_camera_roi`.
  - Provide `cropCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement` yielding only the cropped pixels.
  - Provide a toggle to quickly reset to full-frame or lock the crop box to prevent accidental drag during interviews.

### 3.3. ChangeDetector & Text Normalizer (`src/copilot/change-detector.ts`)
- **Responsibilities**:
  - Prevent redundant API calls and token waste by tracking text state transitions.
  - **Normalization**:
    - Strip trailing/leading whitespace, line numbers (e.g. `1 |`, `2 |`), and editor cursor characters (`|`, `_`, `█`).
    - Lowercase and collapse consecutive whitespace for comparison.
  - **Threshold Rules**:
    - Minimum length: If extracted text is fewer than 15 characters, mark as `Noise` and ignore.
    - Similarity metric: Calculate token overlap (Jaccard) and normalized Levenshtein distance against `lastSolvedText`.
    - If similarity $\ge 80\%$: Treat as unchanged task (`SAME_TASK`).
    - If similarity $< 80\%$: Treat as new candidate task (`NEW_CANDIDATE`).
  - **Stabilization / Debounce**:
    - When `NEW_CANDIDATE` is detected, wait for 1.5 seconds and re-sample to ensure the screen is stable (scrolling finished, problem text fully rendered).
    - If stable, transition to `TRIGGER_READY` and emit event to `GeminiSolver`.

### 3.4. GeminiSolver (`src/copilot/gemini-solver.ts`)
- **Responsibilities**:
  - Execute client-side calls to Google Generative Language API (`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`).
  - Support fallback to `gemini-1.5-flash` or user-configured model.
  - Format requests using System Instructions and structured user message.
  - Handle rate limits (HTTP 429), quota errors, network timeouts, and invalid API keys with descriptive UI status.

#### Structured Prompt Construction
- **System Instruction**:
  ```text
  You are an expert technical interview co-pilot.
  Your role is to solve programming, SQL, algorithmic, or system design questions shown on screen.
  Always format your response cleanly:
  1. Direct, optimal code or SQL query solution in a code block with correct syntax.
  2. 2-3 key technical bullet points explaining why this solution is optimal.
  3. Time & Space complexity (if applicable).
  Be concise, precise, and immediately actionable. Avoid unnecessary pleasantries.
  ```
- **Context Injection**:
  Prepend user goal context (e.g. `[Domain Context: Senior Java & SQL Technical Interview. Focus on PostgreSQL and Spring Boot 3 standards.]`).
- **User Prompt**:
  `[Question Extracted from Screen]:\n\n${extractedOcrText}`

### 3.5. Copilot Dashboard UI (`src/copilot/copilot-ui.ts`)
- **Responsibilities**:
  - Render an autonomous, high-visibility dashboard on Computer B.
  - **Pill Status Banner**:
    - 🟢 `AUTO-WATCHING (Scanning every 3s)`
    - 🟡 `NEW QUESTION DETECTED (Stabilizing...)`
    - 🟣 `GEMINI SOLVING...`
    - ⚪ `SOLVED (11:42:05)`
    - 🔴 `PAUSED`
  - **Top Navigation Switcher**:
    - Adds a top navigation bar allowing switching between standard "Document OCR" mode and "Interview Copilot" mode.
  - **Left Section (Collapsible)**:
    - Live video preview with ROI rectangle.
    - Camera selection dropdown & Auto-scan interval slider (1s - 10s, default 3s).
    - "Force Solve Now" button & "Pause/Resume" toggle.
  - **Main Section**:
    - Selected Context Preset chips (`SQL Specialist`, `Java Backend`, `General Tech`, `Custom`).
    - Large Solution Card with syntax-highlighted code block, monospace font, and fast "Copy Code" button.
    - Talking points / explanation section.
    - Expandable "Detected Screen Text" view for manual verification.
  - **History Drawer**:
    - Keeps previous questions and answers during the session.

---

## 4. State Management & Storage Schema

All configurations are saved locally in the browser's `localStorage`:
| Key | Type | Description |
|---|---|---|
| `copilot_gemini_api_key` | `string` | User's Gemini API key |
| `copilot_gemini_model` | `string` | Default: `gemini-2.5-flash` |
| `copilot_camera_device_id` | `string` | Selected camera device ID |
| `copilot_camera_roi` | `object` `{ x, y, width, height }` | Normalized percentage coordinates |
| `copilot_context_preset` | `string` | `sql` \| `java` \| `general` \| `custom` |
| `copilot_custom_context` | `string` | User-defined context prompt |
| `copilot_scan_interval` | `number` | Sampling interval in seconds (default: 3) |
| `copilot_auto_enabled` | `boolean` | Whether autonomous scanning is active |

---

## 5. Error Handling & Edge Cases

1. **Camera Permissions / Disconnect**:
   - Show helpful message with reconnect button if USB camera is unplugged or permission is revoked.
2. **Poor Screen Lighting / Moiré**:
   - Contrast/grayscale enhancement in `image-processor.ts` applied before OCR to ensure high recognition accuracy on backlit screens.
3. **Partial Typing / Scrolling on Screen**:
   - 1.5s debounce ensures OCR does not trigger on half-scrolled text or incomplete sentences.
4. **Gemini Quota or Network Error**:
   - Visible error banner with retry button without breaking the video loop.
5. **No Interaction Needed**:
   - The entire loop runs autonomously without requiring keyboard or mouse clicks on Computer B.

---

## 6. Testing Strategy

1. **Unit Tests (`tests/copilot-change-detector.test.ts`)**:
   - Test text normalization, whitespace/cursor stripping.
   - Test similarity calculations (identical text, minor cursor changes, completely new questions).
   - Test debounce timing and state transitions.
2. **Unit Tests (`tests/copilot-roi.test.ts`)**:
   - Test normalized percentage to pixel bounding-box conversions.
   - Test coordinate clamping and aspect-ratio preservation.
3. **Unit Tests (`tests/copilot-gemini.test.ts`)**:
   - Mock fetch calls to Google Gemini API.
   - Validate payload format, system instructions, error handling (401, 429).
4. **Integration Tests (`tests/copilot-ui.test.ts`)**:
   - Validate DOM elements, preset selection, status pill updates, and history retention.
