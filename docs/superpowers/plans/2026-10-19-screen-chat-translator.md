# Screen Game Chat Translator (French -> English) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated in-browser "Game Chat Translator" tab that captures a game screen or window via `getDisplayMedia`, crops the chat area with an interactive ROI box, runs OCR, detects new scrolling chat lines, and translates them from French to English in a synchronized side-by-side feed with bracket `[...]` and username preservation.

**Architecture:** A modular chat translation engine under `src/chat-translator/` containing screen capture management, chat line parsing and scrolling diff detector, bracket/username tokenizer, hybrid translation service (Gemini 3.8 Flash + Bergamot WASM), orchestrator controller, and side-by-side feed UI with autoscroll.

**Tech Stack:** TypeScript (strict), Vitest, JSDOM, HTML5 Display Media / Canvas APIs, Google Gemini REST API (`gemini-3.8-flash`), Bergamot WASM translator, Tesseract.js.

## Global Constraints
- Target directory: `src/chat-translator/` and `tests/`
- Zero backend required (client-side browser only)
- User configurations stored in `localStorage`
- ESLint, Prettier, and TypeScript checks (`npm run typecheck && npm run lint`) must pass on every task
- Unit and integration tests for every module

---

### Task 1: Chat Tokenizer & Bracket Preservation

**Files:**
- Create: `src/chat-translator/types.ts`
- Create: `src/chat-translator/chat-tokenizer.ts`
- Test: `tests/chat-tokenizer.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface ParsedChatLine {
    raw: string;
    prefix?: string; // e.g. "(Pierre92):" or "[Guild] Shadow:"
    username?: string;
    messageBody: string;
    bracketItems: string[]; // extracted items like "[Épée de Feu]"
  }

  export function parseChatLine(line: string): ParsedChatLine;
  export function maskBrackets(text: string): { maskedText: string; tokens: Map<string, string> };
  export function unmaskBrackets(text: string, tokens: Map<string, string>): string;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/chat-tokenizer.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseChatLine, maskBrackets, unmaskBrackets } from '../src/chat-translator/chat-tokenizer';

describe('Chat Tokenizer', () => {
  it('parses username prefix and message body accurately', () => {
    const line = '(Pierre92): salut tout le monde on fait le donjon ?';
    const parsed = parseChatLine(line);
    expect(parsed.prefix).toBe('(Pierre92):');
    expect(parsed.username).toBe('Pierre92');
    expect(parsed.messageBody).toBe('salut tout le monde on fait le donjon ?');
  });

  it('parses guild/channel prefix tags', () => {
    const line = '[Guilde] Jean_Luc: go boss final !';
    const parsed = parseChatLine(line);
    expect(parsed.prefix).toBe('[Guilde] Jean_Luc:');
    expect(parsed.username).toBe('Jean_Luc');
    expect(parsed.messageBody).toBe('go boss final !');
  });

  it('extracts and masks text inside square brackets', () => {
    const text = "j'ai trouvé [Épée Légendaire de Feu] et [Potion de Vie] !";
    const { maskedText, tokens } = maskBrackets(text);
    expect(maskedText).toContain('__BRK_0__');
    expect(maskedText).toContain('__BRK_1__');
    expect(tokens.get('__BRK_0__')).toBe('[Épée Légendaire de Feu]');
    expect(tokens.get('__BRK_1__')).toBe('[Potion de Vie]');

    const restored = unmaskBrackets(`I found __BRK_0__ and __BRK_1__ !`, tokens);
    expect(restored).toBe("I found [Épée Légendaire de Feu] and [Potion de Vie] !");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chat-tokenizer.test.ts`
Expected: FAIL ("Cannot find module '../src/chat-translator/chat-tokenizer'")

- [ ] **Step 3: Write implementation**

Create `src/chat-translator/types.ts`:
```typescript
export interface ParsedChatLine {
  raw: string;
  prefix?: string;
  username?: string;
  messageBody: string;
  bracketItems: string[];
}

export interface TranslatedChatLine {
  id: string;
  timestamp: number;
  originalFrench: string;
  translatedEnglish: string;
  username?: string;
}

export type ChatTranslationEngine = 'gemini' | 'bergamot';

export interface ChatTranslatorConfig {
  engine: ChatTranslationEngine;
  scanIntervalSec: number;
  autoEnabled: boolean;
}
```

Create `src/chat-translator/chat-tokenizer.ts`:
```typescript
import type { ParsedChatLine } from './types';

const PREFIX_REGEX = /^(\[.+?\]\s*)?([A-Za-z0-9_.-]+|\([^)]+\))\s*:\s*(.*)$/;
const BRACKET_REGEX = /\[[^\]]+\]/g;

export const parseChatLine = (line: string): ParsedChatLine => {
  const trimmed = line.trim();
  const bracketMatches = trimmed.match(BRACKET_REGEX) || [];

  const match = trimmed.match(PREFIX_REGEX);
  if (match) {
    const channelTag = match[1] || '';
    const rawUser = match[2] || '';
    const messageBody = match[3] || '';
    const cleanUsername = rawUser.replace(/^[([<]|[\)>\]]$/g, '').trim();

    return {
      raw: trimmed,
      prefix: `${channelTag}${rawUser}:`,
      username: cleanUsername,
      messageBody: messageBody.trim(),
      bracketItems: bracketMatches,
    };
  }

  return {
    raw: trimmed,
    messageBody: trimmed,
    bracketItems: bracketMatches,
  };
};

export const maskBrackets = (
  text: string
): { maskedText: string; tokens: Map<string, string> } => {
  const tokens = new Map<string, string>();
  let counter = 0;

  const maskedText = text.replace(BRACKET_REGEX, (match) => {
    const token = `__BRK_${counter++}__`;
    tokens.set(token, match);
    return token;
  });

  return { maskedText, tokens };
};

export const unmaskBrackets = (text: string, tokens: Map<string, string>): string => {
  let result = text;
  tokens.forEach((original, token) => {
    result = result.replaceAll(token, original);
  });
  return result;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/chat-tokenizer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/chat-translator/types.ts src/chat-translator/chat-tokenizer.ts tests/chat-tokenizer.test.ts
git commit -m "feat(chat-translator): add chat tokenizer and bracket item preservation"
```

---

### Task 2: Chat Line Diffing & Scrolling Normalization

**Files:**
- Create: `src/chat-translator/chat-line-diff.ts`
- Test: `tests/chat-line-diff.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export class ChatLineDiffDetector {
    constructor(options?: { historyLimit?: number; similarityThreshold?: number });
    detectNewLines(rawOcrText: string): string[];
    forceProcessAll(rawOcrText: string): string[];
    clear(): void;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/chat-line-diff.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { ChatLineDiffDetector } from '../src/chat-translator/chat-line-diff';

describe('ChatLineDiffDetector', () => {
  it('emits new lines on first scan and ignores duplicates on second scan', () => {
    const detector = new ChatLineDiffDetector({ similarityThreshold: 0.85 });

    const scan1 = `
      (Pierre): salut les gars
      (Jean): go donjon
    `;
    const newLines1 = detector.detectNewLines(scan1);
    expect(newLines1).toHaveLength(2);
    expect(newLines1[0]).toBe('(Pierre): salut les gars');
    expect(newLines1[1]).toBe('(Jean): go donjon');

    // Second scan: chat scrolled up by one line, new line appeared at bottom
    const scan2 = `
      (Jean): go donjon
      (Shadow): tkt j arrive
    `;
    const newLines2 = detector.detectNewLines(scan2);
    expect(newLines2).toHaveLength(1);
    expect(newLines2[0]).toBe('(Shadow): tkt j arrive');
  });

  it('forceProcessAll returns all non-empty lines regardless of history', () => {
    const detector = new ChatLineDiffDetector();
    detector.detectNewLines('(Pierre): salut');

    const forced = detector.forceProcessAll('(Pierre): salut\n(Jean): yo');
    expect(forced).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chat-line-diff.test.ts`
Expected: FAIL ("Cannot find module '../src/chat-translator/chat-line-diff'")

- [ ] **Step 3: Write implementation**

Create `src/chat-translator/chat-line-diff.ts`:
```typescript
const normalizeLine = (line: string): string =>
  line
    .replace(/[|_█│]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const calculateLineSimilarity = (a: string, b: string): number => {
  const normA = normalizeLine(a);
  const normB = normalizeLine(b);
  if (normA === normB) return 1.0;
  if (!normA || !normB) return 0.0;

  const wordsA = new Set(normA.split(' ').filter(Boolean));
  const wordsB = new Set(normB.split(' ').filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0.0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0.0;
};

export class ChatLineDiffDetector {
  private history: string[] = [];
  private readonly historyLimit: number;
  private readonly similarityThreshold: number;

  constructor(options?: { historyLimit?: number; similarityThreshold?: number }) {
    this.historyLimit = options?.historyLimit ?? 40;
    this.similarityThreshold = options?.similarityThreshold ?? 0.85;
  }

  detectNewLines(rawOcrText: string): string[] {
    const candidateLines = this.splitAndClean(rawOcrText);
    const newLines: string[] = [];

    for (const line of candidateLines) {
      const isDuplicate = this.history.some(
        (seen) => calculateLineSimilarity(line, seen) >= this.similarityThreshold
      );

      if (!isDuplicate) {
        newLines.push(line);
        this.history.push(line);
        if (this.history.length > this.historyLimit) {
          this.history.shift();
        }
      }
    }

    return newLines;
  }

  forceProcessAll(rawOcrText: string): string[] {
    const lines = this.splitAndClean(rawOcrText);
    for (const line of lines) {
      if (!this.history.includes(line)) {
        this.history.push(line);
      }
    }
    return lines;
  }

  clear(): void {
    this.history = [];
  }

  private splitAndClean(rawText: string): string[] {
    return rawText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length >= 3);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/chat-line-diff.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/chat-translator/chat-line-diff.ts tests/chat-line-diff.test.ts
git commit -m "feat(chat-translator): add chat line scrolling diff detector"
```

---

### Task 3: Hybrid Chat Translator Service (Gemini & Bergamot)

**Files:**
- Create: `src/chat-translator/chat-translator-service.ts`
- Test: `tests/chat-translator-service.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface ChatTranslatorServiceOptions {
    geminiApiKey?: string;
    geminiModel?: string;
    bergamotTranslator?: ITextTranslator;
    fetchImpl?: typeof fetch;
  }

  export class ChatTranslatorService {
    constructor(options: ChatTranslatorServiceOptions);
    translateLines(lines: string[], engine: 'gemini' | 'bergamot'): Promise<TranslatedChatLine[]>;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/chat-translator-service.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { ChatTranslatorService } from '../src/chat-translator/chat-translator-service';
import type { ITextTranslator } from '../src/types/translation';

describe('ChatTranslatorService', () => {
  it('translates via Gemini with gamer prompt and preserves brackets', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '(Pierre92): hey everyone, are we doing [Donjon de Feu] ?\nJean: lol wait for me',
              },
            ],
          },
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const service = new ChatTranslatorService({
      geminiApiKey: 'test-key',
      geminiModel: 'gemini-3.8-flash',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const lines = [
      '(Pierre92): salut tout le monde on fait [Donjon de Feu] ?',
      'Jean: mdr attendez moi',
    ];

    const results = await service.translateLines(lines, 'gemini');
    expect(results).toHaveLength(2);
    expect(results[0]?.translatedEnglish).toContain('[Donjon de Feu]');
    expect(results[1]?.translatedEnglish).toContain('lol wait for me');
  });

  it('translates via Bergamot with bracket token masking', async () => {
    const mockBergamot: ITextTranslator = {
      translate: vi.fn().mockResolvedValue({
        translatedText: 'I found __BRK_0__ here',
      }),
    } as unknown as ITextTranslator;

    const service = new ChatTranslatorService({
      bergamotTranslator: mockBergamot,
    });

    const results = await service.translateLines(["J'ai trouvé [Épée Légendaire] ici"], 'bergamot');
    expect(results).toHaveLength(1);
    expect(results[0]?.translatedEnglish).toBe('I found [Épée Légendaire] here');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chat-translator-service.test.ts`
Expected: FAIL ("Cannot find module '../src/chat-translator/chat-translator-service'")

- [ ] **Step 3: Write implementation**

Create `src/chat-translator/chat-translator-service.ts`:
```typescript
import type { TranslatedChatLine } from './types';
import type { ITextTranslator } from '@/types/translation';
import { parseChatLine, maskBrackets, unmaskBrackets } from './chat-tokenizer';

export interface ChatTranslatorServiceOptions {
  geminiApiKey?: string;
  geminiModel?: string;
  bergamotTranslator?: ITextTranslator;
  fetchImpl?: typeof fetch;
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

export class ChatTranslatorService {
  private geminiApiKey: string;
  private geminiModel: string;
  private bergamotTranslator: ITextTranslator | null;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ChatTranslatorServiceOptions) {
    this.geminiApiKey = options.geminiApiKey ?? '';
    this.geminiModel = options.geminiModel ?? 'gemini-3.8-flash';
    this.bergamotTranslator = options.bergamotTranslator ?? null;
    const rawFetch = options.fetchImpl ?? globalThis.fetch;
    this.fetchImpl = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      rawFetch(input, init);
  }

  updateConfig(apiKey?: string, model?: string, bergamot?: ITextTranslator): void {
    if (apiKey !== undefined) this.geminiApiKey = apiKey;
    if (model !== undefined) this.geminiModel = model;
    if (bergamot !== undefined) this.bergamotTranslator = bergamot;
  }

  async translateLines(
    lines: string[],
    engine: 'gemini' | 'bergamot'
  ): Promise<TranslatedChatLine[]> {
    if (lines.length === 0) return [];

    if (engine === 'gemini') {
      return this.translateWithGemini(lines);
    } else {
      return this.translateWithBergamot(lines);
    }
  }

  private async translateWithGemini(lines: string[]): Promise<TranslatedChatLine[]> {
    if (!this.geminiApiKey) {
      throw new Error('Gemini API key is required for Gemini chat translation.');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${encodeURIComponent(
      this.geminiApiKey
    )}`;

    const systemInstruction = `You are a real-time French-to-English game chat translator.
Translate the provided French chat lines into natural, colloquial English.
CRITICAL RULES:
1. Preserve all usernames, channels, and prefix tags verbatim (e.g. (Player), [Guild], <All>).
2. NEVER translate text inside square brackets [...] anywhere in the message (these are game items, gear, or coordinates) - keep [...] content completely verbatim.
3. Accurately translate French gaming slang & abbreviations:
   - "mdr" / "ptdr" -> "lol" / "lmao"
   - "tkt" -> "dw" / "don't worry"
   - "jpp" -> "I can't even" / "I'm dead"
   - "stp" / "svp" -> "pls" / "please"
   - "bg" -> "boss" / "legend"
   - "gg" / "afk" / "heal" / "tank" / "aggro" -> keep standard gaming terms
4. Output EXACTLY 1 translated line per input line in matching order. Do not add conversational commentary.`;

    const payload = {
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [
        {
          parts: [{ text: lines.join('\n') }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
      },
    };

    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini Translation Error ${response.status}: ${err}`);
    }

    const data = (await response.json()) as GeminiApiResponse;
    const rawAnswer = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const translatedLines = rawAnswer
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    return lines.map((original, i) => {
      const parsed = parseChatLine(original);
      const translated = translatedLines[i] || original;
      return {
        id: `chat-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        originalFrench: original,
        translatedEnglish: translated,
        username: parsed.username,
      };
    });
  }

  private async translateWithBergamot(lines: string[]): Promise<TranslatedChatLine[]> {
    if (!this.bergamotTranslator) {
      throw new Error('Bergamot WASM translator is not initialized.');
    }

    const results: TranslatedChatLine[] = [];

    for (let i = 0; i < lines.length; i++) {
      const original = lines[i] ?? '';
      const parsed = parseChatLine(original);

      // Mask brackets
      const { maskedText, tokens } = maskBrackets(parsed.messageBody);

      const res = await this.bergamotTranslator.translate({
        from: 'fr',
        to: 'en',
        text: maskedText,
      });

      const unmasked = unmaskBrackets(res.translatedText, tokens);
      const fullTranslated = parsed.prefix ? `${parsed.prefix} ${unmasked}` : unmasked;

      results.push({
        id: `chat-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        originalFrench: original,
        translatedEnglish: fullTranslated,
        username: parsed.username,
      });
    }

    return results;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/chat-translator-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/chat-translator/chat-translator-service.ts tests/chat-translator-service.test.ts
git commit -m "feat(chat-translator): add hybrid chat translator service with slang and bracket support"
```

---

### Task 4: Screen Capture Manager

**Files:**
- Create: `src/chat-translator/screen-capture-manager.ts`
- Test: `tests/screen-capture-manager.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export class ScreenCaptureManager {
    constructor(videoElement: HTMLVideoElement);
    startCapture(): Promise<MediaStream>;
    stopCapture(): void;
    captureFrame(): HTMLCanvasElement;
    isCapturing(): boolean;
    onEnded(callback: () => void): void;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/screen-capture-manager.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScreenCaptureManager } from '../src/chat-translator/screen-capture-manager';

describe('ScreenCaptureManager', () => {
  let videoEl: HTMLVideoElement;

  beforeEach(() => {
    videoEl = document.createElement('video');
    Object.defineProperty(videoEl, 'videoWidth', { value: 1920, configurable: true });
    Object.defineProperty(videoEl, 'videoHeight', { value: 1080, configurable: true });
  });

  it('starts screen capture via getDisplayMedia', async () => {
    const mockTrack = {
      stop: vi.fn(),
      addEventListener: vi.fn(),
    };
    const mockStream = {
      getVideoTracks: () => [mockTrack],
      getTracks: () => [mockTrack],
    } as unknown as MediaStream;

    navigator.mediaDevices = {
      getDisplayMedia: () => Promise.resolve(mockStream),
    } as unknown as MediaDevices;

    const manager = new ScreenCaptureManager(videoEl);
    const stream = await manager.startCapture();

    expect(stream).toBe(mockStream);
    expect(manager.isCapturing()).toBe(true);

    manager.stopCapture();
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(manager.isCapturing()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/screen-capture-manager.test.ts`
Expected: FAIL ("Cannot find module '../src/chat-translator/screen-capture-manager'")

- [ ] **Step 3: Write implementation**

Create `src/chat-translator/screen-capture-manager.ts`:
```typescript
export class ScreenCaptureManager {
  private readonly videoElement: HTMLVideoElement;
  private currentStream: MediaStream | null = null;
  private endedCallback: (() => void) | null = null;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
  }

  async startCapture(): Promise<MediaStream> {
    this.stopCapture();

    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Screen capture (getDisplayMedia) is not supported in this browser.');
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'never' as unknown as boolean,
      },
      audio: false,
    });

    this.currentStream = stream;
    this.videoElement.srcObject = stream;
    await this.videoElement.play().catch(() => {});

    const track = stream.getVideoTracks()[0];
    if (track) {
      track.addEventListener('ended', () => {
        this.stopCapture();
        if (this.endedCallback) this.endedCallback();
      });
    }

    return stream;
  }

  stopCapture(): void {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach((t) => t.stop());
      this.currentStream = null;
    }
    this.videoElement.srcObject = null;
  }

  captureFrame(): HTMLCanvasElement {
    const width = this.videoElement.videoWidth || 640;
    const height = this.videoElement.videoHeight || 480;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(this.videoElement, 0, 0, width, height);
    }
    return canvas;
  }

  isCapturing(): boolean {
    return this.currentStream !== null;
  }

  onEnded(callback: () => void): void {
    this.endedCallback = callback;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/screen-capture-manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/chat-translator/screen-capture-manager.ts tests/screen-capture-manager.test.ts
git commit -m "feat(chat-translator): add screen capture manager via getDisplayMedia"
```

---

### Task 5: Chat Translator Orchestrator Controller

**Files:**
- Create: `src/chat-translator/chat-translator-controller.ts`
- Test: `tests/chat-translator-controller.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface ChatTranslatorCallbacks {
    onStateChange: (state: string, message?: string) => void;
    onNewChatLines: (lines: TranslatedChatLine[]) => void;
    onError: (err: Error) => void;
  }

  export class ChatTranslatorController {
    constructor(dependencies: ChatTranslatorDependencies, callbacks: ChatTranslatorCallbacks);
    start(): void;
    stop(): void;
    forceTranslate(): Promise<void>;
    updateConfig(partial: Partial<ChatTranslatorConfig>): void;
    getConfig(): ChatTranslatorConfig;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/chat-translator-controller.test.ts`:
```typescript
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chat-translator-controller.test.ts`
Expected: FAIL ("Cannot find module '../src/chat-translator/chat-translator-controller'")

- [ ] **Step 3: Write implementation**

Create `src/chat-translator/chat-translator-controller.ts`:
```typescript
import type { ChatTranslatorConfig, TranslatedChatLine } from './types';
import { ChatLineDiffDetector } from './chat-line-diff';
import { cropCanvasToRoi } from '@/copilot/roi-selector';
import type { NormalizedRoi } from '@/copilot/types';

export interface ChatTranslatorDependencies {
  captureFrame: () => HTMLCanvasElement;
  runOcr: (canvas: HTMLCanvasElement) => Promise<string>;
  translateLines: (lines: string[], engine: 'gemini' | 'bergamot') => Promise<TranslatedChatLine[]>;
  initialConfig?: Partial<ChatTranslatorConfig>;
  getRoi?: () => NormalizedRoi;
}

export interface ChatTranslatorCallbacks {
  onStateChange: (state: string, message?: string) => void;
  onNewChatLines: (lines: TranslatedChatLine[]) => void;
  onError: (err: Error) => void;
}

const DEFAULT_CONFIG: ChatTranslatorConfig = {
  engine: 'gemini',
  scanIntervalSec: 2,
  autoEnabled: true,
};

export class ChatTranslatorController {
  private config: ChatTranslatorConfig;
  private readonly dependencies: ChatTranslatorDependencies;
  private readonly callbacks: ChatTranslatorCallbacks;
  private readonly diffDetector = new ChatLineDiffDetector();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private isProcessing = false;

  constructor(dependencies: ChatTranslatorDependencies, callbacks: ChatTranslatorCallbacks) {
    this.dependencies = dependencies;
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_CONFIG, ...dependencies.initialConfig };
  }

  start(): void {
    this.isRunning = true;
    this.callbacks.onStateChange('SCANNING', `Auto-scanning chat every ${this.config.scanIntervalSec}s`);
    this.scheduleNext();
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.callbacks.onStateChange('PAUSED', 'Chat scanning paused');
  }

  private scheduleNext(): void {
    if (!this.isRunning || !this.config.autoEnabled) return;
    if (this.timer) clearTimeout(this.timer);

    this.timer = setTimeout(() => {
      void this.runCycle().then(() => {
        this.scheduleNext();
      });
    }, this.config.scanIntervalSec * 1000);
  }

  private async runCycle(): Promise<void> {
    if (!this.isRunning || this.isProcessing) return;
    this.isProcessing = true;

    try {
      const fullFrame = this.dependencies.captureFrame();
      const roi = this.dependencies.getRoi ? this.dependencies.getRoi() : { x: 0, y: 0.6, width: 0.5, height: 0.4 };
      const cropped = cropCanvasToRoi(fullFrame, roi);
      const text = await this.dependencies.runOcr(cropped);

      const newLines = this.diffDetector.detectNewLines(text);
      if (newLines.length > 0) {
        this.callbacks.onStateChange('TRANSLATING', `Translating ${newLines.length} new line(s)...`);
        const translated = await this.dependencies.translateLines(newLines, this.config.engine);
        this.callbacks.onNewChatLines(translated);
      }
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.isProcessing = false;
      if (this.isRunning) {
        this.callbacks.onStateChange('SCANNING');
      }
    }
  }

  async forceTranslate(): Promise<void> {
    try {
      this.isProcessing = true;
      const fullFrame = this.dependencies.captureFrame();
      const roi = this.dependencies.getRoi ? this.dependencies.getRoi() : { x: 0, y: 0.6, width: 0.5, height: 0.4 };
      const cropped = cropCanvasToRoi(fullFrame, roi);
      const text = await this.dependencies.runOcr(cropped);

      const lines = this.diffDetector.forceProcessAll(text);
      if (lines.length > 0) {
        this.callbacks.onStateChange('TRANSLATING', `Translating ${lines.length} lines...`);
        const translated = await this.dependencies.translateLines(lines, this.config.engine);
        this.callbacks.onNewChatLines(translated);
      }
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.isProcessing = false;
      if (this.isRunning) {
        this.callbacks.onStateChange('SCANNING');
      }
    }
  }

  clearHistory(): void {
    this.diffDetector.clear();
  }

  updateConfig(partial: Partial<ChatTranslatorConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  getConfig(): ChatTranslatorConfig {
    return { ...this.config };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/chat-translator-controller.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/chat-translator/chat-translator-controller.ts tests/chat-translator-controller.test.ts
git commit -m "feat(chat-translator): add chat translator orchestrator controller"
```

---

### Task 6: Side-by-Side Dashboard UI, Styles & App Navigation

**Files:**
- Create: `src/chat-translator/chat-translator-template.ts`
- Create: `src/chat-translator/chat-translator-ui.ts`
- Modify: `src/app-template.ts`
- Modify: `src/app.ts`
- Modify: `src/style.css`
- Test: `tests/chat-translator-ui.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/chat-translator-ui.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderChatTranslatorTemplate } from '../src/chat-translator/chat-translator-template';
import { getAppTemplate } from '../src/app-template';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chat-translator-ui.test.ts`
Expected: FAIL ("Cannot find module '../src/chat-translator/chat-translator-template'")

- [ ] **Step 3: Write implementation**

1. Create `src/chat-translator/chat-translator-template.ts` with video preview, ROI box, side-by-side feed layout, engine selector, and controls.
2. Create `src/chat-translator/chat-translator-ui.ts` to manage DOM events, stream connection, ROI overlay, appending lines, and autoscrolling.
3. Update `src/app-template.ts` to add `#nav-mode-chat` tab and `#chat-view-container`.
4. Update `src/style.css` with styling for `.chat-translator-container`, `.side-by-side-chat`, `.chat-message-row`, and engine badges.
5. Update `src/app.ts` to wire in the 3rd mode tab and lazy-load the chat translator modules.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/chat-translator-ui.test.ts`
Expected: PASS

- [ ] **Step 5: Run full verification suite**

Run:
```bash
npm test
npm run typecheck
npm run lint
npm run build
```
Expected: All tests pass, 0 type errors, 0 lint errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/chat-translator/ tests/chat-translator-ui.test.ts src/app-template.ts src/app.ts src/style.css
git commit -m "feat(chat-translator): complete side-by-side game chat translator UI and app navigation"
```
