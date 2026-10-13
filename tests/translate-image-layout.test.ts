import { describe, expect, it, vi } from 'vitest';
import { computeTextLayout, wrapText } from '../src/translate-image/layout';

const textContext = {
  measureText: (text: string) => ({ width: Array.from(text).length * 10 }),
} as Parameters<typeof wrapText>[2];

const fontSizeFromCss = (font: string): number => Number(font.match(/(\d+(?:\.\d+)?)px/)?.[1]) || 10;

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

  it('preserves spaces in Korean and mixed Japanese and Latin segments', () => {
    expect(wrapText('안녕하세요 세계', 200, textContext, true, 'ko')).toEqual(['안녕하세요 세계']);
    expect(wrapText('OpenAI API', 200, textContext, true, 'ja')).toEqual(['OpenAI API']);
  });

  it('keeps a contraction near the source size and bounds expansion to a readable font range', () => {
    const originalCreateElement = document.createElement.bind(document);
    const fakeContext = {
      font: '10px sans-serif',
      measureText(text: string): { width: number } {
        const size = fontSizeFromCss(this.font);
        return {
          width: Array.from(text).length * size * 0.55,
          actualBoundingBoxAscent: size * 0.7,
          actualBoundingBoxDescent: 0,
        };
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
        const size = fontSizeFromCss(this.font);
        return {
          width: Array.from(text).length * size * 0.6,
          actualBoundingBoxAscent: size * 0.62,
          actualBoundingBoxDescent: 0,
        };
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

  it('preserves source cap height for shorter and similar text, shrinking only when width requires it', () => {
    const originalCreateElement = document.createElement.bind(document);
    const fakeContext = {
      font: '10px sans-serif',
      measureText(text: string): { width: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
        const size = fontSizeFromCss(this.font);
        return {
          width: Array.from(text).length * size * 0.5,
          actualBoundingBoxAscent: size * 0.7,
          actualBoundingBoxDescent: 0,
        };
      },
    };
    const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      if (tagName === 'canvas') {
        return { width: 1, height: 1, getContext: () => fakeContext } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName, options);
    });
    try {
      const layout = (text: string): ReturnType<typeof computeTextLayout> => computeTextLayout({
        text,
        width: 105,
        height: 33,
        fontFamily: 'sans-serif',
        align: 'left',
        direction: 'ltr',
        targetLineCount: 1,
        isCjk: false,
        minFontSize: 21,
        maxFontSize: 44,
      });
      const shorter = layout('HI');
      const similar = layout('OPEN');
      const longer = layout('SALUDO');

      expect(shorter.fontSize).toBe(44);
      expect(similar.fontSize).toBe(44);
      expect(shorter.lines).toHaveLength(1);
      expect(similar.lines).toHaveLength(1);
      expect(shorter.baselineY).toBe(32);
      expect(similar.baselineY).toBe(32);
      expect(longer.fontSize).toBeLessThan(44);
      expect(longer.fontSize).toBeGreaterThanOrEqual(21);
      expect(longer.lines).toHaveLength(1);
      expect(longer.baselineY).toBe(32);
    } finally {
      createElement.mockRestore();
    }
  });

  it('measures the actual bold font used by the renderer before accepting a fit', () => {
    const originalCreateElement = document.createElement.bind(document);
    const fakeContext = {
      font: '10px sans-serif',
      measureText(text: string): { width: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
        const size = fontSizeFromCss(this.font);
        const bold = this.font.includes('bold');
        return {
          width: Array.from(text).length * size * (bold ? 0.55 : 0.5),
          actualBoundingBoxAscent: size * 0.7,
          actualBoundingBoxDescent: 0,
        };
      },
    };
    const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      if (tagName === 'canvas') {
        return { width: 1, height: 1, getContext: () => fakeContext } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName, options);
    });
    try {
      const bold = computeTextLayout({
        text: 'BOLD',
        width: 85,
        height: 33,
        fontFamily: 'sans-serif',
        align: 'left',
        direction: 'ltr',
        targetLineCount: 1,
        isCjk: false,
        fontWeight: 'bold',
        minFontSize: 20,
        maxFontSize: 40,
      });
      expect(bold.fontSize).toBeLessThan(40);
      expect(bold.fontSize).toBeGreaterThanOrEqual(20);
      expect(bold.lines).toHaveLength(1);
    } finally {
      createElement.mockRestore();
    }
  });

  it('fits multiline text using the positioned ascender and descender union', () => {
    const originalCreateElement = document.createElement.bind(document);
    const fakeContext = {
      font: '10px sans-serif',
      measureText(text: string): {
        width: number;
        actualBoundingBoxAscent: number;
        actualBoundingBoxDescent: number;
      } {
        const size = fontSizeFromCss(this.font);
        const isDescender = text.includes('g');
        return {
          width: Array.from(text).length * size * 0.4,
          actualBoundingBoxAscent: size * (isDescender ? 0.5 : 0.7),
          actualBoundingBoxDescent: size * (isDescender ? 0.2 : 0),
        };
      },
    };
    const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      if (tagName === 'canvas') {
        return { width: 1, height: 1, getContext: () => fakeContext } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName, options);
    });
    try {
      const layout = computeTextLayout({
        text: 'H g',
        width: 12,
        height: 39,
        fontFamily: 'sans-serif',
        align: 'left',
        direction: 'ltr',
        targetLineCount: 2,
        isCjk: false,
        minFontSize: 10,
        maxFontSize: 20,
      });
      const lineHeight = layout.fontSize * 1.18;
      const inkTop = layout.baselineY - layout.fontSize * 0.7;
      const inkBottom = layout.baselineY + lineHeight + layout.fontSize * 0.2;

      expect(layout.lines).toEqual(['H', 'g']);
      expect(layout.fontSize).toBeLessThan(20);
      expect(inkTop).toBeGreaterThanOrEqual(0);
      expect(inkBottom).toBeLessThanOrEqual(39);
    } finally {
      createElement.mockRestore();
    }
  });

  it('preserves a small, legible native-size label below fourteen pixels', () => {
    const originalCreateElement = document.createElement.bind(document);
    const fakeContext = {
      font: '8px sans-serif',
      measureText(text: string): { width: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
        const size = fontSizeFromCss(this.font);
        return {
          width: Array.from(text).length * size * 0.55,
          actualBoundingBoxAscent: size * 0.7,
          actualBoundingBoxDescent: 0,
        };
      },
    };
    const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName, options) => {
      if (tagName === 'canvas') {
        return { width: 1, height: 1, getContext: () => fakeContext } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tagName, options);
    });
    try {
      const small = computeTextLayout({
        text: 'A',
        width: 9,
        height: 7,
        fontFamily: 'sans-serif',
        align: 'left',
        direction: 'ltr',
        targetLineCount: 1,
        isCjk: false,
        minFontSize: 4,
        maxFontSize: 8,
      });
      expect(small.fontSize).toBe(8);
      expect(small.lines).toEqual(['A']);
      expect(small.baselineY).toBe(6);
    } finally {
      createElement.mockRestore();
    }
  });
});
