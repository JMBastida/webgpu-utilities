import { describe, expect, it } from 'vitest';
import { wrapText } from '../src/translate-image/layout';

describe('translate image text wrapping', () => {
  it('keeps oversized non-CJK words contiguous when wrapping', () => {
    const context = {
      measureText: (text: string) => ({ width: Array.from(text).length * 10 }),
    } as Parameters<typeof wrapText>[2];

    expect(wrapText('abcdefgh', 30, context, false)).toEqual(['abc', 'def', 'gh']);
  });
});
