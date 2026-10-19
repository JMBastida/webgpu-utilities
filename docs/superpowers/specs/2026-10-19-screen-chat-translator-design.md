# Screen Game Chat Translator (French -> English) Design Specification

- **Date**: 2026-10-19
- **Status**: Approved by User
- **Author**: Antigravity Assistant & Jorge

---

## 1. Executive Summary & Goal

The user requires a dedicated in-browser **"Game Chat Translator"** tab designed to capture a window or screen (e.g. video game), crop a user-defined chatbox area via an interactive ROI box, run local OCR, and translate incoming French chat messages into English in real time:
- Primary use case: Live multiplayer game chat primarily in French (e.g. MMOs, RPGs, competitive games).
- Presentation: Synchronized side-by-side feed displaying original French OCR text on the left and clean English translations on the right.
- Format preservation: Retains `(username): message` format, clan/guild tags, and ignores text inside square brackets `[...]` (game items, skills, equipment, coordinates).
- Engine modes: Hybrid selectable between **Google Gemini 3.8 Flash** (slang and gaming abbreviations like `mdr`, `tkt`, `jpp`, `stp`) and **Bergamot WASM** (100% offline and local).
- Scroll-diffing: Tracks scrolling chat lines to avoid duplicate translations as the chat advances.

---

## 2. Architecture & Data Flow

```mermaid
graph TD
    A[Display Media Capture getDisplayMedia] -->|Screen/Window Stream| B[ScreenCaptureManager]
    B -->|Live Frame Canvas| C[Chat ROI Selector]
    C -->|Cropped Chat Canvas| D[OCR Engine Tesseract.js]
    D -->|Extracted Lines of Text| E[ChatLineDiffDetector]
    E -->|Already Seen Lines| F[Discard / Ignore]
    E -->|New Incoming Chat Lines| G[Bracket & Username Tokenizer]
    G --> H{Translation Engine Mode}
    H -->|Gemini Mode| I[GeminiChatTranslator - gemini-3.8-flash]
    H -->|Bergamot Mode| J[BergamotChatTranslator - WASM Local]
    I --> K[Reconstructed English Chat Line]
    J --> K
    K --> L[Side-by-Side Live Feed UI]
    L --> M[Left: Original French OCR with Timestamp]
    L --> N[Right: English Translation (Username): Message]
```

---

## 3. Component Specifications

### 3.1. ScreenCaptureManager (`src/chat-translator/screen-capture-manager.ts`)
- **Responsibilities**:
  - Request window/screen capture stream via `navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'never', displaySurface: 'window' } })`.
  - Handle track `ended` event when user stops screen sharing or closes the game window.
  - Expose `captureFrame(): HTMLCanvasElement`.
  - Clean up tracks and streams on tab exit or pause.

### 3.2. ChatLineDiffDetector (`src/chat-translator/chat-line-diff.ts`)
- **Responsibilities**:
  - Normalize incoming lines: strip empty lines, trim trailing cursor symbols (`|`, `_`), remove leading artifact dots.
  - Rolling history ring buffer: holds the last 40 processed chat lines.
  - Fuzzy line matching: compares candidate line against history buffer using token overlap & normalized Levenshtein similarity ($\ge 85\%$ = already seen $\rightarrow$ skip).
  - Emits only genuinely new lines for translation.
  - Support manual force-translate to re-process all visible lines on demand.

### 3.3. Bracket & Username Preservation (`src/chat-translator/chat-tokenizer.ts`)
- **Responsibilities**:
  - Pattern matching for chat prefixes:
    - `(username): message`
    - `[Guild/Clan] Username: message`
    - `<Channel> Username : message`
  - Pattern matching for square brackets `[...]` inside the message body:
    - Protect content inside `[...]` from being altered or translated (representing game items, links, skills).
  - Masking utility for Bergamot:
    - Replaces `[Item Name]` with safe placeholder `__BRK_0__`, sends stripped text to Bergamot, and restores original `[Item Name]` post-translation.

### 3.4. Hybrid Translator (`src/chat-translator/chat-translator-service.ts`)
- **Responsibilities**:
  - Expose a unified interface:
    ```typescript
    export interface TranslatedChatLine {
      id: string;
      timestamp: number;
      originalFrench: string;
      translatedEnglish: string;
      username?: string;
    }

    export interface IChatTranslatorService {
      translateLines(lines: string[]): Promise<TranslatedChatLine[]>;
    }
    ```
  - **Gemini Chat Strategy**:
    - System Instruction prompt:
      ```text
      You are a real-time French-to-English game chat translator.
      Translate the provided French chat lines into colloquial English.
      CRITICAL RULES:
      1. Keep all usernames, channels, and tags like (Player), [Guild], <All> verbatim.
      2. NEVER translate text inside square brackets [...] anywhere in the message (e.g. [Épée Légendaire] must stay [Épée Légendaire]).
      3. Translate French gaming slang accurately:
         - "mdr" / "ptdr" -> "lol" / "lmao"
         - "tkt" -> "dw" / "don't worry"
         - "jpp" -> "I can't even" / "I'm dead"
         - "stp" / "svp" -> "pls" / "please"
         - "bg" -> "boss" / "legend"
         - "gg" / "afk" / "heal" / "tank" -> keep standard gaming terms
      4. Output 1 translated line per input line.
      ```
  - **Bergamot Chat Strategy**:
    - Uses `@/translation/bergamot-translator` with language pair `fr` -> `en`.
    - Applies `chat-tokenizer` to mask usernames and `[...]` tokens before translation, restoring them after.

### 3.5. Live Chat Feed UI (`src/chat-translator/chat-translator-ui.ts`)
- **Responsibilities**:
  - Top navigation tab: `🎮 Game Chat Translator`.
  - Screen Picker button + Status pill (`LIVE SCANNING`, `TRANSLATING`, `PAUSED`).
  - Auto-scan interval slider (default: 2 seconds, adjustable 1s–5s).
  - Engine Toggle: `Gemini (AI Slang)` vs `Bergamot (Offline)`.
  - Video preview with green crop overlay box (draggable, resizable, lockable).
  - **Side-by-side feed**:
    - Left column: Raw French OCR text.
    - Right column: Synchronized English translation.
    - Autoscroll to bottom as new messages arrive with manual pause-scroll detection.
    - "Clear Chat" button.

---

## 4. State Management & Storage Schema

Stored in `localStorage`:
| Key | Type | Description |
|---|---|---|
| `screen_translator_roi` | `object` `{ x, y, width, height }` | Normalized ROI coordinates |
| `screen_translator_engine` | `string` | `'gemini'` \| `'bergamot'` |
| `screen_translator_interval` | `number` | Sampling interval in seconds (default: 2) |
| `screen_translator_auto` | `boolean` | Auto-scan toggle state |

---

## 5. Testing Strategy

1. **Unit Tests (`tests/chat-line-diff.test.ts`)**:
   - Test line normalization, whitespace cleanup.
   - Test scrolling diff: initial lines accepted, subsequent duplicates rejected, new appended lines accepted.
2. **Unit Tests (`tests/chat-tokenizer.test.ts`)**:
   - Test username extraction: `(Player92): message`, `[Guild] Bob: message`.
   - Test bracket masking: `[Épée de Feu]` correctly replaced and restored.
3. **Unit Tests (`tests/chat-translator-service.test.ts`)**:
   - Test Gemini prompt generation with bracket preservation.
   - Test Bergamot integration with token masking.
4. **Integration Tests (`tests/chat-translator-ui.test.ts`)**:
   - Test DOM rendering, side-by-side feed updates, and tab switching.
