import { describe, it, expect } from 'vitest';
import type { OCRItem } from '../src/types/ocr-engine';
import { buildRegions } from '../src/translate-image/regions';

describe('translate image region grouping', () => {
  it('groups lines into paragraphs', () => {
    const items: OCRItem[] = [
      {
        text: 'Hello',
        confidence: 0.9,
        boundingBox: { x: 0, y: 0, width: 40, height: 10 },
      },
      {
        text: 'World',
        confidence: 0.9,
        boundingBox: { x: 50, y: 0, width: 40, height: 10 },
      },
      {
        text: 'Next',
        confidence: 0.9,
        boundingBox: { x: 0, y: 30, width: 40, height: 10 },
      },
    ];

    const regions = buildRegions(items, {
      sourceLang: 'en',
      scaleX: 1,
      scaleY: 1,
    });

    expect(regions).toHaveLength(2);
    expect(regions[0]!.sourceLines).toHaveLength(1);
    expect(regions[1]!.sourceLines).toHaveLength(1);
    expect(regions[0]!.bbox.width).toBeGreaterThan(0);
  });

  it('joins CJK tokens without spaces', () => {
    const items: OCRItem[] = [
      {
        text: '你',
        confidence: 0.9,
        boundingBox: { x: 0, y: 0, width: 10, height: 10 },
      },
      {
        text: '好',
        confidence: 0.9,
        boundingBox: { x: 12, y: 0, width: 10, height: 10 },
      },
    ];

    const regions = buildRegions(items, {
      sourceLang: 'zh',
      scaleX: 1,
      scaleY: 1,
    });

    expect(regions).toHaveLength(1);
    expect(regions[0]!.sourceLines[0]).toBe('你好');
  });
});
