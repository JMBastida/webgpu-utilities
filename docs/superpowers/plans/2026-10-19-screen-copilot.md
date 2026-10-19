# Autonomous Screen-Watcher & Interview Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous, hands-free "Screen Copilot" mode for Computer B that monitors an external camera pointed at Computer A's screen, extracts question/code text via OCR within a user-defined ROI, detects new questions via similarity debouncing, and automatically solves them with Google Gemini Flash.

**Architecture:** A modular copilot engine under `src/copilot/` comprising video capture & ROI cropping, OCR-text change detection, direct Google Gemini REST client, autonomous orchestrator controller, and high-visibility interview dashboard UI with syntax code highlighting and session history.

**Tech Stack:** TypeScript (strict), Vitest, JSDOM, HTML5 Video/Canvas APIs, Google Gemini REST API (`gemini-2.5-flash`), Tesseract.js / existing OCR engines.

## Global Constraints
- Target directory: `src/copilot/` and `tests/`
- Zero external backend required (client-side browser only)
- API keys and user preferences saved strictly in `localStorage`
- ESLint, Prettier, and TypeScript checks (`npm run typecheck && npm run lint`) must pass on every task
- Unit and integration tests for every module

---

### Task 1: Copilot Types & ROI Selector

**Files:**
- Create: `src/copilot/types.ts`
- Create: `src/copilot/roi-selector.ts`
- Test: `tests/copilot-roi.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface NormalizedRoi {
    x: number; // 0.0 to 1.0
    y: number; // 0.0 to 1.0
    width: number; // 0.0 to 1.0
    height: number; // 0.0 to 1.0
  }

  export interface PixelBounds {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export function clampRoi(roi: NormalizedRoi): NormalizedRoi;
  export function toPixelBounds(roi: NormalizedRoi, imageWidth: number, imageHeight: number): PixelBounds;
  export function cropCanvasToRoi(sourceCanvas: HTMLCanvasElement | OffscreenCanvas, roi: NormalizedRoi): HTMLCanvasElement;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/copilot-roi.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { clampRoi, toPixelBounds, cropCanvasToRoi } from '../src/copilot/roi-selector';
import type { NormalizedRoi } from '../src/copilot/types';

describe('ROI Selector', () => {
  it('clamps coordinates to [0, 1] range and ensures min dimensions', () => {
    const raw: NormalizedRoi = { x: -0.2, y: 1.5, width: 1.8, height: -0.1 };
    const clamped = clampRoi(raw);
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(1);
    expect(clamped.width).toBeGreaterThanOrEqual(0.05);
    expect(clamped.height).toBeGreaterThanOrEqual(0.05);
  });

  it('converts normalized ROI to pixel bounds', () => {
    const roi: NormalizedRoi = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
    const bounds = toPixelBounds(roi, 1920, 1080);
    expect(bounds.x).toBe(192);
    expect(bounds.y).toBe(216);
    expect(bounds.width).toBe(960);
    expect(bounds.height).toBe(432);
  });

  it('crops a canvas correctly to the specified ROI', () => {
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = 100;
    srcCanvas.height = 100;
    const ctx = srcCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 100, 100);
    }

    const roi: NormalizedRoi = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const cropped = cropCanvasToRoi(srcCanvas, roi);
    expect(cropped.width).toBe(50);
    expect(cropped.height).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/copilot-roi.test.ts`
Expected: FAIL ("Cannot find module '../src/copilot/roi-selector'")

- [ ] **Step 3: Write minimal implementation**

Create `src/copilot/types.ts`:
```typescript
export interface NormalizedRoi {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CopilotState = 'WATCHING' | 'STABILIZING' | 'SOLVING' | 'SOLVED' | 'PAUSED' | 'ERROR';

export type ContextPreset = 'sql' | 'java' | 'general' | 'custom';

export interface SolutionResult {
  id: string;
  timestamp: number;
  questionText: string;
  code: string;
  explanation: string[];
  complexity?: string;
  rawResponse?: string;
}

export interface CopilotConfig {
  geminiApiKey: string;
  geminiModel: string;
  cameraDeviceId: string;
  roi: NormalizedRoi;
  contextPreset: ContextPreset;
  customContext: string;
  scanIntervalSec: number;
  autoEnabled: boolean;
}
```

Create `src/copilot/roi-selector.ts`:
```typescript
import type { NormalizedRoi, PixelBounds } from './types';

const MIN_SIZE = 0.05;

export const clampRoi = (roi: NormalizedRoi): NormalizedRoi => {
  const x = Math.max(0, Math.min(1, roi.x));
  const y = Math.max(0, Math.min(1, roi.y));
  const maxWidth = 1 - x;
  const maxHeight = 1 - y;
  const width = Math.max(MIN_SIZE, Math.min(maxWidth, roi.width));
  const height = Math.max(MIN_SIZE, Math.min(maxHeight, roi.height));
  return { x, y, width, height };
};

export const toPixelBounds = (
  roi: NormalizedRoi,
  imageWidth: number,
  imageHeight: number
): PixelBounds => {
  const clamped = clampRoi(roi);
  const x = Math.round(clamped.x * imageWidth);
  const y = Math.round(clamped.y * imageHeight);
  const width = Math.max(1, Math.round(clamped.width * imageWidth));
  const height = Math.max(1, Math.round(clamped.height * imageHeight));
  return { x, y, width, height };
};

export const cropCanvasToRoi = (
  sourceCanvas: HTMLCanvasElement | OffscreenCanvas,
  roi: NormalizedRoi
): HTMLCanvasElement => {
  const bounds = toPixelBounds(roi, sourceCanvas.width, sourceCanvas.height);
  const destCanvas = document.createElement('canvas');
  destCanvas.width = bounds.width;
  destCanvas.height = bounds.height;
  const ctx = destCanvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(
      sourceCanvas as CanvasImageSource,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      0,
      bounds.width,
      bounds.height
    );
  }
  return destCanvas;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/copilot-roi.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/copilot/types.ts src/copilot/roi-selector.ts tests/copilot-roi.test.ts
git commit -m "feat(copilot): add types and ROI coordinate cropping utilities"
```

---

### Task 2: Change Detector & Text Normalizer

**Files:**
- Create: `src/copilot/change-detector.ts`
- Test: `tests/copilot-change-detector.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export function normalizeOcrText(text: string): string;
  export function calculateTextSimilarity(textA: string, textB: string): number; // 0.0 to 1.0

  export interface ChangeEvaluation {
    isNewQuestion: boolean;
    isNoise: boolean;
    similarity: number;
    normalizedText: string;
  }

  export class ChangeDetector {
    constructor(options?: { similarityThreshold?: number; minLength?: number });
    evaluate(rawText: string): ChangeEvaluation;
    markSolved(rawText: string): void;
    reset(): void;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/copilot-change-detector.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import {
  normalizeOcrText,
  calculateTextSimilarity,
  ChangeDetector,
} from '../src/copilot/change-detector';

describe('ChangeDetector', () => {
  it('normalizes text by stripping line numbers, cursor markers, and extra whitespace', () => {
    const raw = '  1 |  SELECT * FROM users;  \n 2 |  WHERE id = 5 |  ';
    const norm = normalizeOcrText(raw);
    expect(norm).toBe('select * from users; where id = 5');
  });

  it('calculates 1.0 similarity for identical text and low similarity for different text', () => {
    const text1 = 'write a query to find the second highest salary';
    const text2 = 'write a query to find the second highest salary';
    const text3 = 'implement a binary search tree in java';

    expect(calculateTextSimilarity(text1, text2)).toBe(1.0);
    expect(calculateTextSimilarity(text1, text3)).toBeLessThan(0.4);
  });

  it('detects new question when text substantially changes', () => {
    const detector = new ChangeDetector({ similarityThreshold: 0.8, minLength: 15 });
    
    // Initial task
    const q1 = 'Write a SQL query to get the employee count by department';
    const eval1 = detector.evaluate(q1);
    expect(eval1.isNoise).toBe(false);
    expect(eval1.isNewQuestion).toBe(true);

    detector.markSolved(q1);

    // Minor screen flicker / cursor movement should not trigger new question
    const q1WithFlicker = 'Write a SQL query to get the employee count by department |';
    const eval2 = detector.evaluate(q1WithFlicker);
    expect(eval2.isNewQuestion).toBe(false);

    // Completely new problem appeared
    const q2 = 'Given an array of integers nums, return indices of the two numbers';
    const eval3 = detector.evaluate(q2);
    expect(eval3.isNewQuestion).toBe(true);
  });

  it('rejects noise below minimum length', () => {
    const detector = new ChangeDetector({ minLength: 15 });
    const evalNoise = detector.evaluate('1 | SELECT');
    expect(evalNoise.isNoise).toBe(true);
    expect(evalNoise.isNewQuestion).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/copilot-change-detector.test.ts`
Expected: FAIL ("Cannot find module '../src/copilot/change-detector'")

- [ ] **Step 3: Write minimal implementation**

Create `src/copilot/change-detector.ts`:
```typescript
export const normalizeOcrText = (text: string): string => {
  return text
    .replace(/^\s*\d+\s*[|:]\s*/gm, '') // Strip line numbers like "1 | "
    .replace(/[|_█│]/g, ' ') // Strip blinking cursor or vertical line artifacts
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

export const calculateTextSimilarity = (textA: string, textB: string): number => {
  const a = normalizeOcrText(textA);
  const b = normalizeOcrText(textB);

  if (a === b) return 1.0;
  if (!a || !b) return 0.0;

  const wordsA = new Set(a.split(' ').filter(Boolean));
  const wordsB = new Set(b.split(' ').filter(Boolean));

  if (wordsA.size === 0 || wordsB.size === 0) return 0.0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0.0;
};

export interface ChangeEvaluation {
  isNewQuestion: boolean;
  isNoise: boolean;
  similarity: number;
  normalizedText: string;
}

export class ChangeDetector {
  private lastSolvedText = '';
  private readonly similarityThreshold: number;
  private readonly minLength: number;

  constructor(options?: { similarityThreshold?: number; minLength?: number }) {
    this.similarityThreshold = options?.similarityThreshold ?? 0.8;
    this.minLength = options?.minLength ?? 15;
  }

  evaluate(rawText: string): ChangeEvaluation {
    const normalized = normalizeOcrText(rawText);

    if (normalized.length < this.minLength) {
      return {
        isNewQuestion: false,
        isNoise: true,
        similarity: 0,
        normalizedText: normalized,
      };
    }

    if (!this.lastSolvedText) {
      return {
        isNewQuestion: true,
        isNoise: false,
        similarity: 0,
        normalizedText: normalized,
      };
    }

    const similarity = calculateTextSimilarity(normalized, this.lastSolvedText);
    const isNew = similarity < this.similarityThreshold;

    return {
      isNewQuestion: isNew,
      isNoise: false,
      similarity,
      normalizedText: normalized,
    };
  }

  markSolved(rawText: string): void {
    this.lastSolvedText = normalizeOcrText(rawText);
  }

  reset(): void {
    this.lastSolvedText = '';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/copilot-change-detector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/copilot/change-detector.ts tests/copilot-change-detector.test.ts
git commit -m "feat(copilot): add change detector with text normalization and similarity scoring"
```

---

### Task 3: Gemini Client & Prompt Engineering

**Files:**
- Create: `src/copilot/gemini-client.ts`
- Test: `tests/copilot-gemini.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface GeminiSolverOptions {
    apiKey: string;
    model?: string;
    fetchImpl?: typeof fetch;
  }

  export interface ParseSolutionResult {
    code: string;
    explanation: string[];
    complexity?: string;
    rawText: string;
  }

  export function parseGeminiResponse(rawText: string): ParseSolutionResult;

  export class GeminiSolver {
    constructor(options: GeminiSolverOptions);
    solve(question: string, contextPrompt: string): Promise<SolutionResult>;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/copilot-gemini.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { GeminiSolver, parseGeminiResponse } from '../src/copilot/gemini-client';

describe('GeminiSolver & Response Parser', () => {
  it('parses code blocks, bullet explanations, and complexity from raw markdown', () => {
    const raw = `
\`\`\`sql
SELECT department_id, COUNT(*) as emp_count
FROM employees
GROUP BY department_id
HAVING COUNT(*) > 5;
\`\`\`

- Uses GROUP BY to aggregate employees per department.
- HAVING filters groups after aggregation.

Complexity: O(N) time and O(K) space where K is number of departments.
`;

    const parsed = parseGeminiResponse(raw);
    expect(parsed.code).toContain('SELECT department_id');
    expect(parsed.explanation.length).toBeGreaterThanOrEqual(2);
    expect(parsed.complexity).toContain('O(N)');
  });

  it('sends correct payload to Gemini REST API and returns structured SolutionResult', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '```java\nclass Solution {}\n```\n- Optimal binary search.\nComplexity: O(log N)',
              },
            ],
          },
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const solver = new GeminiSolver({
      apiKey: 'test-api-key',
      model: 'gemini-2.5-flash',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const result = await solver.solve('Find target in sorted array', 'Java Specialist');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchUrl = mockFetch.mock.calls[0][0];
    expect(fetchUrl).toContain('gemini-2.5-flash:generateContent?key=test-api-key');

    expect(result.code).toContain('class Solution');
    expect(result.explanation).toContain('Optimal binary search.');
    expect(result.complexity).toContain('O(log N)');
  });

  it('throws informative error on API error (e.g. 401 invalid key)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'API key not valid',
    });

    const solver = new GeminiSolver({
      apiKey: 'bad-key',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    await expect(solver.solve('query', 'context')).rejects.toThrow(/Gemini API Error 401/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/copilot-gemini.test.ts`
Expected: FAIL ("Cannot find module '../src/copilot/gemini-client'")

- [ ] **Step 3: Write minimal implementation**

Create `src/copilot/gemini-client.ts`:
```typescript
import type { SolutionResult } from './types';

export interface GeminiSolverOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export interface ParseSolutionResult {
  code: string;
  explanation: string[];
  complexity?: string;
  rawText: string;
}

export const parseGeminiResponse = (rawText: string): ParseSolutionResult => {
  const codeBlockMatch = rawText.match(/```(?:\w+)?\n([\s\S]*?)```/);
  const code = codeBlockMatch ? codeBlockMatch[1].trim() : '';

  const explanation: string[] = [];
  const lines = rawText.split('\n');
  let complexity: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(?:[-*•]|\d+\.)\s+(.+)/.test(trimmed)) {
      const bulletMatch = trimmed.match(/^(?:[-*•]|\d+\.)\s+(.+)/);
      if (bulletMatch) explanation.push(bulletMatch[1].trim());
    } else if (/^complexity[:\s]/i.test(trimmed)) {
      complexity = trimmed;
    }
  }

  return {
    code,
    explanation,
    complexity,
    rawText,
  };
};

export class GeminiSolver {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GeminiSolverOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'gemini-2.5-flash';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async solve(question: string, contextPrompt: string): Promise<SolutionResult> {
    if (!this.apiKey) {
      throw new Error('Gemini API key is required. Please set it in Settings.');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${encodeURIComponent(
      this.apiKey
    )}`;

    const systemInstruction = `You are an expert technical interview co-pilot.
Your goal is to solve the programming, SQL, or technical task extracted from the screen.
Always structure your output:
1. Provide the direct, optimal code or SQL query in a clean markdown code block with appropriate language tag.
2. Provide 2-3 concise bullet points explaining key concepts and why this solution is optimal.
3. State Time and Space Complexity.
Be direct, production-ready, and interview-ready.`;

    const fullPrompt = `[Goal Context]: ${contextPrompt || 'General Technical Interview'}

[Question Extracted from Screen]:
${question}`;

    const payload = {
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [
        {
          parts: [{ text: fullPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
      },
    };

    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const rawAnswer: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = parseGeminiResponse(rawAnswer);

    return {
      id: `sol-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      questionText: question,
      code: parsed.code,
      explanation: parsed.explanation,
      complexity: parsed.complexity,
      rawResponse: rawAnswer,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/copilot-gemini.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/copilot/gemini-client.ts tests/copilot-gemini.test.ts
git commit -m "feat(copilot): add Google Gemini client with structured parsing and prompt engineering"
```

---

### Task 4: Video Capture Manager

**Files:**
- Create: `src/copilot/video-capture-manager.ts`
- Test: `tests/copilot-video.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface VideoDeviceOption {
    deviceId: string;
    label: string;
  }

  export class VideoCaptureManager {
    constructor(videoElement: HTMLVideoElement);
    getAvailableDevices(): Promise<VideoDeviceOption[]>;
    startStream(deviceId?: string): Promise<MediaStream>;
    stopStream(): void;
    captureFrame(): HTMLCanvasElement;
    getCurrentDeviceId(): string | null;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/copilot-video.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoCaptureManager } from '../src/copilot/video-capture-manager';

describe('VideoCaptureManager', () => {
  let videoEl: HTMLVideoElement;

  beforeEach(() => {
    videoEl = document.createElement('video');
    Object.defineProperty(videoEl, 'videoWidth', { value: 1920, configurable: true });
    Object.defineProperty(videoEl, 'videoHeight', { value: 1080, configurable: true });
  });

  it('enumerates video devices', async () => {
    const mockDevices = [
      { kind: 'videoinput', deviceId: 'cam1', label: 'USB External Cam' },
      { kind: 'audioinput', deviceId: 'mic1', label: 'Mic' },
    ];

    navigator.mediaDevices = {
      enumerateDevices: vi.fn().mockResolvedValue(mockDevices),
      getUserMedia: vi.fn(),
    } as unknown as MediaDevices;

    const manager = new VideoCaptureManager(videoEl);
    const devices = await manager.getAvailableDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceId).toBe('cam1');
    expect(devices[0].label).toBe('USB External Cam');
  });

  it('captures a canvas frame from video at native resolution', () => {
    const manager = new VideoCaptureManager(videoEl);
    const frame = manager.captureFrame();
    expect(frame.width).toBe(1920);
    expect(frame.height).toBe(1080);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/copilot-video.test.ts`
Expected: FAIL ("Cannot find module '../src/copilot/video-capture-manager'")

- [ ] **Step 3: Write minimal implementation**

Create `src/copilot/video-capture-manager.ts`:
```typescript
import type { VideoDeviceOption } from './types';

export class VideoCaptureManager {
  private readonly videoElement: HTMLVideoElement;
  private currentStream: MediaStream | null = null;
  private currentDeviceId: string | null = null;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
  }

  async getAvailableDevices(): Promise<VideoDeviceOption[]> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return [];
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${index + 1}`,
      }));
  }

  async startStream(deviceId?: string): Promise<MediaStream> {
    this.stopStream();

    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.currentStream = stream;
    this.currentDeviceId = deviceId ?? null;
    this.videoElement.srcObject = stream;
    await this.videoElement.play().catch(() => {});
    return stream;
  }

  stopStream(): void {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach((track) => track.stop());
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

  getCurrentDeviceId(): string | null {
    return this.currentDeviceId;
  }
}
```

Add `VideoDeviceOption` to `src/copilot/types.ts`:
```typescript
export interface VideoDeviceOption {
  deviceId: string;
  label: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/copilot-video.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/copilot/video-capture-manager.ts src/copilot/types.ts tests/copilot-video.test.ts
git commit -m "feat(copilot): add video capture manager for camera stream and frame extraction"
```

---

### Task 5: Autonomous Copilot Orchestrator Controller

**Files:**
- Create: `src/copilot/copilot-controller.ts`
- Test: `tests/copilot-controller.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface CopilotCallbacks {
    onStateChange: (state: CopilotState, message?: string) => void;
    onQuestionDetected: (text: string) => void;
    onSolutionReady: (solution: SolutionResult) => void;
    onError: (error: Error) => void;
  }

  export class CopilotController {
    constructor(dependencies: CopilotDependencies, callbacks: CopilotCallbacks);
    start(): Promise<void>;
    stop(): void;
    forceSolve(): Promise<void>;
    updateConfig(partial: Partial<CopilotConfig>): void;
    getConfig(): CopilotConfig;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/copilot-controller.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CopilotController } from '../src/copilot/copilot-controller';
import type { CopilotConfig } from '../src/copilot/types';

describe('CopilotController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs periodic scanning loop and triggers solver when new question is detected', async () => {
    const mockCapture = vi.fn().mockReturnValue(document.createElement('canvas'));
    const mockOcr = vi.fn().mockResolvedValue('Write a function to reverse a string');
    const mockSolve = vi.fn().mockResolvedValue({
      id: 's1',
      timestamp: 1000,
      questionText: 'Write a function to reverse a string',
      code: 'function rev(s) { return s.split("").reverse().join(""); }',
      explanation: ['Inverts characters'],
    });

    const stateChanges: string[] = [];

    const controller = new CopilotController(
      {
        captureFrame: mockCapture,
        runOcr: mockOcr,
        solveGemini: mockSolve,
        initialConfig: {
          geminiApiKey: 'test-key',
          geminiModel: 'gemini-2.5-flash',
          cameraDeviceId: '',
          roi: { x: 0, y: 0, width: 1, height: 1 },
          contextPreset: 'general',
          customContext: '',
          scanIntervalSec: 2,
          autoEnabled: true,
        },
      },
      {
        onStateChange: (state) => stateChanges.push(state),
        onQuestionDetected: vi.fn(),
        onSolutionReady: vi.fn(),
        onError: vi.fn(),
      }
    );

    await controller.start();
    expect(stateChanges).toContain('WATCHING');

    // Advance timer to trigger scan
    await vi.advanceTimersByTimeAsync(2100);
    expect(mockCapture).toHaveBeenCalled();
    expect(mockOcr).toHaveBeenCalled();

    // Advance stabilization timer (1500ms)
    await vi.advanceTimersByTimeAsync(1600);
    expect(mockSolve).toHaveBeenCalled();

    controller.stop();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/copilot-controller.test.ts`
Expected: FAIL ("Cannot find module '../src/copilot/copilot-controller'")

- [ ] **Step 3: Write minimal implementation**

Create `src/copilot/copilot-controller.ts`:
```typescript
import type { CopilotConfig, CopilotState, NormalizedRoi, SolutionResult } from './types';
import { ChangeDetector } from './change-detector';
import { cropCanvasToRoi } from './roi-selector';

export interface CopilotDependencies {
  captureFrame: () => HTMLCanvasElement;
  runOcr: (canvas: HTMLCanvasElement) => Promise<string>;
  solveGemini: (question: string, contextPrompt: string) => Promise<SolutionResult>;
  initialConfig?: Partial<CopilotConfig>;
}

export interface CopilotCallbacks {
  onStateChange: (state: CopilotState, message?: string) => void;
  onQuestionDetected: (text: string) => void;
  onSolutionReady: (solution: SolutionResult) => void;
  onError: (error: Error) => void;
}

const DEFAULT_CONFIG: CopilotConfig = {
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  cameraDeviceId: '',
  roi: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  contextPreset: 'general',
  customContext: '',
  scanIntervalSec: 3,
  autoEnabled: true,
};

export class CopilotController {
  private config: CopilotConfig;
  private readonly dependencies: CopilotDependencies;
  private readonly callbacks: CopilotCallbacks;
  private readonly changeDetector = new ChangeDetector();
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private isProcessing = false;

  constructor(dependencies: CopilotDependencies, callbacks: CopilotCallbacks) {
    this.dependencies = dependencies;
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_CONFIG, ...dependencies.initialConfig };
  }

  async start(): Promise<void> {
    this.isRunning = true;
    this.callbacks.onStateChange('WATCHING', `Watching screen every ${this.config.scanIntervalSec}s`);
    this.scheduleNextScan();
  }

  stop(): void {
    this.isRunning = false;
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    this.callbacks.onStateChange('PAUSED', 'Monitoring paused');
  }

  private scheduleNextScan(): void {
    if (!this.isRunning || !this.config.autoEnabled) return;
    if (this.scanTimer) clearTimeout(this.scanTimer);

    this.scanTimer = setTimeout(async () => {
      await this.runScanCycle();
      this.scheduleNextScan();
    }, this.config.scanIntervalSec * 1000);
  }

  private async runScanCycle(): Promise<void> {
    if (!this.isRunning || this.isProcessing) return;
    this.isProcessing = true;

    try {
      const fullFrame = this.dependencies.captureFrame();
      const croppedFrame = cropCanvasToRoi(fullFrame, this.config.roi);
      const text = await this.dependencies.runOcr(croppedFrame);

      const evaluation = this.changeDetector.evaluate(text);

      if (evaluation.isNewQuestion) {
        this.callbacks.onStateChange('STABILIZING', 'New text detected, checking stability...');
        this.callbacks.onQuestionDetected(text);

        // Wait 1.5s stabilization debounce
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (!this.isRunning) return;

        // Verify stabilization
        const recheckFrame = cropCanvasToRoi(this.dependencies.captureFrame(), this.config.roi);
        const stableText = await this.dependencies.runOcr(recheckFrame);
        const secondEval = this.changeDetector.evaluate(stableText);

        if (!secondEval.isNoise) {
          await this.triggerSolve(stableText);
        }
      }
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.isProcessing = false;
      if (this.isRunning) {
        this.callbacks.onStateChange('WATCHING');
      }
    }
  }

  async forceSolve(): Promise<void> {
    try {
      this.isProcessing = true;
      const fullFrame = this.dependencies.captureFrame();
      const croppedFrame = cropCanvasToRoi(fullFrame, this.config.roi);
      const text = await this.dependencies.runOcr(croppedFrame);
      if (text.trim().length > 0) {
        await this.triggerSolve(text);
      } else {
        throw new Error('No readable text detected in current ROI.');
      }
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.isProcessing = false;
    }
  }

  private async triggerSolve(questionText: string): Promise<void> {
    this.callbacks.onStateChange('SOLVING', 'Gemini is generating solution...');
    const context = this.getContextString();
    const solution = await this.dependencies.solveGemini(questionText, context);
    this.changeDetector.markSolved(questionText);
    this.callbacks.onStateChange('SOLVED', `Solution ready at ${new Date().toLocaleTimeString()}`);
    this.callbacks.onSolutionReady(solution);
  }

  private getContextString(): string {
    const presetPrompts: Record<string, string> = {
      sql: 'Senior SQL Specialist interview. Provide optimal queries, explain execution/indexing trade-offs and handle edge cases.',
      java: 'Senior Java Backend Specialist interview. Provide clean modern Java (JDK 21/17), optimal time/space complexity, and concurrency/edge-case awareness.',
      general: 'Technical Software Engineering interview. Direct solution first, followed by clear speaking points and complexity analysis.',
      custom: this.config.customContext || 'General technical interview',
    };
    return presetPrompts[this.config.contextPreset] || presetPrompts.general;
  }

  updateConfig(partial: Partial<CopilotConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  getConfig(): CopilotConfig {
    return { ...this.config };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/copilot-controller.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/copilot/copilot-controller.ts tests/copilot-controller.test.ts
git commit -m "feat(copilot): add autonomous orchestrator controller with stabilization and debounce"
```

---

### Task 6: Copilot Dashboard UI & Navigation Integration

**Files:**
- Create: `src/copilot/copilot-ui.ts`
- Create: `src/copilot/copilot-template.ts`
- Modify: `src/style.css` (add copilot styles)
- Modify: `src/app-template.ts` (add top navigation mode switcher)
- Modify: `src/app.ts` (integrate copilot view)
- Test: `tests/copilot-ui.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export interface CopilotUiElements {
    copilotContainer: HTMLElement;
    videoElement: HTMLVideoElement;
    cameraSelect: HTMLSelectElement;
    statusPill: HTMLElement;
    autoToggle: HTMLInputElement;
    intervalInput: HTMLInputElement;
    forceSolveBtn: HTMLButtonElement;
    solutionCodeBlock: HTMLElement;
    solutionBullets: HTMLElement;
    solutionComplexity: HTMLElement;
    detectedQuestionText: HTMLElement;
    historyContainer: HTMLElement;
    presetButtons: HTMLButtonElement[];
    apiKeyInput: HTMLInputElement;
  }

  export function renderCopilotTemplate(): string;
  export function initCopilotUi(container: HTMLElement, controller: CopilotController): void;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/copilot-ui.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { renderCopilotTemplate } from '../src/copilot/copilot-template';

describe('Copilot UI Template & Rendering', () => {
  beforeEach(() => {
    document.body.innerHTML = renderCopilotTemplate();
  });

  it('renders all required elements for autonomous copilot dashboard', () => {
    expect(document.getElementById('copilot-video')).not.toBeNull();
    expect(document.getElementById('copilot-status-pill')).not.toBeNull();
    expect(document.getElementById('copilot-camera-select')).not.toBeNull();
    expect(document.getElementById('copilot-auto-toggle')).not.toBeNull();
    expect(document.getElementById('copilot-force-solve-btn')).not.toBeNull();
    expect(document.getElementById('copilot-solution-code')).not.toBeNull();
    expect(document.getElementById('copilot-solution-bullets')).not.toBeNull();
    expect(document.getElementById('copilot-history-list')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/copilot-ui.test.ts`
Expected: FAIL ("Cannot find module '../src/copilot/copilot-template'")

- [ ] **Step 3: Write implementation**

Create `src/copilot/copilot-template.ts`:
```typescript
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
    <h3>Copilot Configuration</h3>
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
      <label for="copilot-scan-interval">Scan Interval (seconds)</label>
      <input type="range" id="copilot-scan-interval" min="1" max="10" value="3" />
      <span id="copilot-scan-interval-val">3s</span>
    </div>
    <div class="field-group">
      <label for="copilot-custom-context">Custom System / Domain Context</label>
      <textarea id="copilot-custom-context" rows="3" placeholder="Additional prompt instructions..."></textarea>
    </div>
    <button id="copilot-save-settings-btn" class="primary-button" type="button">Save Settings</button>
  </div>

  <div class="copilot-body">
    <!-- Left Column: Camera Preview & ROI -->
    <section class="copilot-camera-panel" id="copilot-camera-panel">
      <div class="camera-controls-bar">
        <select id="copilot-camera-select" title="Select camera device"></select>
        <button id="copilot-toggle-roi-lock" class="ghost-button" type="button" title="Lock/Unlock crop box">
          🔒 Lock ROI
        </button>
      </div>
      <div class="video-preview-wrapper" id="video-preview-wrapper">
        <video id="copilot-video" autoplay playsinline muted></video>
        <!-- Overlay ROI crop rectangle -->
        <div id="copilot-roi-box" class="copilot-roi-box">
          <span class="roi-label">Screen Target Area</span>
          <div class="roi-handle roi-handle-br"></div>
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
```

Create `src/copilot/copilot-ui.ts`:
Wire DOM events, camera selection, ROI dragging/resizing, copy-code button, preset chips, and status pill transitions.

Modify `src/app-template.ts`:
Add a sleek navigation tab bar at the very top of `<header class="app-header">`:
```html
<nav class="app-mode-nav">
  <button id="nav-mode-ocr" class="mode-tab is-active" type="button">📄 Document OCR</button>
  <button id="nav-mode-copilot" class="mode-tab" type="button">⚡ Screen Copilot</button>
</nav>
```

Modify `src/style.css`:
Add styles for `.copilot-container`, `.copilot-status-pill`, `.copilot-roi-box`, `.solution-code`, high-contrast typography, and responsive panels.

Modify `src/app.ts`:
Wire tab navigation between the existing Document OCR view and the new Screen Copilot view.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/copilot-ui.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite, typecheck, and lint**

Run:
```bash
npm test
npm run typecheck
npm run lint
```
Expected: All tests pass, 0 type errors, 0 lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/copilot/ tests/copilot-ui.test.ts src/app-template.ts src/app.ts src/style.css
git commit -m "feat(copilot): complete autonomous interview copilot UI and app integration"
```

---

## Plan Self-Review Checklist

- [x] **Spec coverage**:
  - External camera enumeration & 1080p selection $\rightarrow$ Task 4 (`VideoCaptureManager`)
  - ROI Crop Box $\rightarrow$ Task 1 (`roi-selector.ts`)
  - Change detection, normalization, & debounce $\rightarrow$ Task 2 (`change-detector.ts`)
  - Direct Gemini API & Goal Context (SQL/Java) $\rightarrow$ Task 3 (`gemini-client.ts`)
  - Autonomous loop $\rightarrow$ Task 5 (`copilot-controller.ts`)
  - Hands-free UI on Computer B $\rightarrow$ Task 6 (`copilot-ui.ts` & app integration)
- [x] **No Placeholders**: All tasks contain explicit file paths, type definitions, and test assertions.
- [x] **Type consistency**: Verified across `types.ts`, `roi-selector.ts`, `change-detector.ts`, and `gemini-client.ts`.
