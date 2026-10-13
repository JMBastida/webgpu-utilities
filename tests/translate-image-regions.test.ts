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

  it('keeps distant same-row labels in separate localized regions', () => {
    const items: OCRItem[] = [
      { text: 'Left', confidence: 0.9, boundingBox: { x: 20, y: 40, width: 35, height: 12 } },
      { text: 'Right', confidence: 0.9, boundingBox: { x: 230, y: 40, width: 45, height: 12 } },
    ];

    const regions = buildRegions(items, { sourceLang: 'en', scaleX: 1, scaleY: 1 });

    expect(regions).toHaveLength(2);
    expect(regions.map((region) => region.sourceLines[0])).toEqual(['Left', 'Right']);
    expect(regions.map((region) => region.bbox)).toEqual([
      { x: 20, y: 40, width: 35, height: 12 },
      { x: 230, y: 40, width: 45, height: 12 },
    ]);
  });

  it('joins fragmented OCR word boxes by engine line metadata for translation context', () => {
    const items: OCRItem[] = [
      { text: 'This', confidence: 0.9, lineId: 'line-1', paragraphId: 'paragraph-1', boundingBox: { x: 20, y: 40, width: 24, height: 12 } },
      { text: 'is', confidence: 0.9, lineId: 'line-1', paragraphId: 'paragraph-1', boundingBox: { x: 65, y: 40, width: 12, height: 12 } },
      { text: 'a', confidence: 0.9, lineId: 'line-1', paragraphId: 'paragraph-1', boundingBox: { x: 92, y: 40, width: 7, height: 12 } },
      { text: 'sentence.', confidence: 0.9, lineId: 'line-1', paragraphId: 'paragraph-1', boundingBox: { x: 112, y: 40, width: 53, height: 12 } },
    ];

    const regions = buildRegions(items, { sourceLang: 'en', scaleX: 1, scaleY: 1 });

    expect(regions).toHaveLength(1);
    expect(regions[0]!.sourceLines).toEqual(['This is a sentence.']);
    expect(regions[0]!.items).toHaveLength(4);
  });

  it('keeps same-baseline labels in separate Tesseract paragraphs', () => {
    const items: OCRItem[] = [
      { text: 'LEFT', confidence: 0.9, lineId: 'line-left', paragraphId: 'paragraph-left', boundingBox: { x: 20, y: 40, width: 40, height: 12 } },
      { text: 'RIGHT', confidence: 0.9, lineId: 'line-right', paragraphId: 'paragraph-right', boundingBox: { x: 230, y: 40, width: 50, height: 12 } },
    ];

    const regions = buildRegions(items, { sourceLang: 'en', scaleX: 1, scaleY: 1 });

    expect(regions).toHaveLength(2);
    expect(regions.map((region) => region.sourceLines[0])).toEqual(['LEFT', 'RIGHT']);
    expect(regions[0]!.bbox.x + regions[0]!.bbox.width).toBeLessThan(regions[1]!.bbox.x);
  });

  it('uses a horizontal-distance cap even when Tesseract assigns one line id', () => {
    const items: OCRItem[] = [
      { text: 'LEFT', confidence: 0.9, lineId: 'line-1', paragraphId: 'paragraph-1', boundingBox: { x: 20, y: 40, width: 40, height: 12 } },
      { text: 'RIGHT', confidence: 0.9, lineId: 'line-1', paragraphId: 'paragraph-1', boundingBox: { x: 230, y: 40, width: 50, height: 12 } },
    ];

    const regions = buildRegions(items, { sourceLang: 'en', scaleX: 1, scaleY: 1 });

    expect(regions).toHaveLength(2);
    expect(regions.map((region) => region.sourceLines[0])).toEqual(['LEFT', 'RIGHT']);
  });
});
