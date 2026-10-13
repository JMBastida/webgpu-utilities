import { describe, expect, it, vi } from 'vitest';
import { computeTextLayout, wrapText } from '../src/translate-image/layout';

const textContext = {
  measureText: (text: string) => ({ width: Array.from(text).length * 10 }),
} as Parameters<typeof wrapText>[2];

describe('translate image text wrapping', () => {
  it('keeps oversized non-CJK words contiguous when wrapping', () => {
    expect(wrapText('abcdefgh', 30, textContext, false)).toEqual(['abc', 'def', 'gh']);
  });

  it('wraps long CJK strings at language-aware boundaries without inserting spaces', () => {
    const text = 'これはとても長い日本語の文章です';
    const lines = wrapText(text, 30, textContext, true, 'ja');

    expect(lines.join('')).toBe(text);
    expect(lines.every((line) => textContext.measureText(line).width <= 30)).toBe(true);
  });

  it('keeps a contraction near the source size and bounds expansion to a readable font range', () => {
    const originalCreateElement = document.createElement.bind(document);
    const fakeContext = {
      font: '10px sans-serif',
      measureText(text: string): { width: number } {
        const size = Number.parseInt(this.font, 10) || 10;
        return { width: Array.from(text).length * size * 0.55 };
      },
    };
    const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      if (tagName === 'canvas') {
        return { width: 1, height: 1, getContext: () => fakeContext } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName, options);
    });
    try {
      const short = computeTextLayout({
        text: 'OK',
        width: 100,
        height: 42,
        fontFamily: 'sans-serif',
        align: 'left',
        direction: 'ltr',
        targetLineCount: 1,
        isCjk: false,
        minFontSize: 18,
        maxFontSize: 28,
      });
      const expanded = computeTextLayout({
        text: 'AQuiteLongReplacementToken',
        width: 90,
        height: 100,
        fontFamily: 'sans-serif',
        align: 'left',
        direction: 'ltr',
        targetLineCount: 1,
        isCjk: false,
        minFontSize: 18,
        maxFontSize: 28,
      });

      expect(short.fontSize).toBe(28);
      expect(expanded.fontSize).toBeGreaterThanOrEqual(18);
      expect(expanded.fontSize).toBeLessThanOrEqual(28);
      expect(expanded.lines.length).toBeGreaterThan(1);
    } finally {
      createElement.mockRestore();
    }
  });

  it('returns an actionable error instead of shrinking text below the readable minimum', () => {
    const originalCreateElement = document.createElement.bind(document);
    const fakeContext = {
      font: '10px sans-serif',
      measureText(text: string): { width: number } {
        const size = Number.parseInt(this.font, 10) || 10;
        return { width: Array.from(text).length * size * 0.6 };
      },
    };
    const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      if (tagName === 'canvas') {
        return { width: 1, height: 1, getContext: () => fakeContext } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName, options);
    });
    try {
      expect(() => computeTextLayout({
        text: 'ExtremelyLongUnbrokenToken',
        width: 24,
        height: 24,
        fontFamily: 'sans-serif',
        align: 'left',
        direction: 'ltr',
        targetLineCount: 1,
        isCjk: false,
        minFontSize: 21,
        maxFontSize: 23,
      })).toThrow('Edit it shorter or add line breaks');
    } finally {
      createElement.mockRestore();
    }
  });
});
