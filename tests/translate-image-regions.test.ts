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

  it('joins a varied-height line when an intermediate word bridges OCR boxes', () => {
    const items: OCRItem[] = [
      { text: 'A', confidence: 0.9, lineId: 'line-1', paragraphId: 'paragraph-1', boundingBox: { x: 0, y: 0, width: 30, height: 20 } },
      { text: 'B', confidence: 0.9, lineId: 'line-1', paragraphId: 'paragraph-1', boundingBox: { x: 60, y: 4, width: 30, height: 16 } },
      { text: 'C', confidence: 0.9, lineId: 'line-1', paragraphId: 'paragraph-1', boundingBox: { x: 120, y: 0, width: 30, height: 20 } },
    ];

    const regions = buildRegions(items, { sourceLang: 'en', scaleX: 1, scaleY: 1 });

    expect(regions).toHaveLength(1);
    expect(regions[0]!.sourceLines).toEqual(['A B C']);
    expect(regions[0]!.items).toHaveLength(3);
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

  it('preserves majority font hints and source size across fragmented OCR words', () => {
    const items: OCRItem[] = [
      {
        text: 'Bold',
        confidence: 0.9,
        style: { weight: 'bold', slant: 'normal', serif: true, fontSize: 24, text: [20, 30, 40] },
        lineId: 'line-1',
        boundingBox: { x: 10, y: 10, width: 40, height: 25 },
      },
      {
        text: 'serif',
        confidence: 0.9,
        style: { weight: 'bold', slant: 'italic', serif: true, fontSize: 26, text: [40, 50, 60] },
        lineId: 'line-1',
        boundingBox: { x: 55, y: 10, width: 40, height: 25 },
      },
    ];

    const [region] = buildRegions(items, { sourceLang: 'en', scaleX: 1, scaleY: 1 });

    expect(region?.style).toMatchObject({
      weight: 'bold',
      serif: true,
      fontSize: 25,
      text: [30, 40, 50],
    });
  });

  it('scales Tesseract font-size metadata with OCR coordinates for large images', () => {
    // OCR processed a 1000px preview for a 2400px source image.
    const [region] = buildRegions([
      {
        text: 'LARGE',
        confidence: 0.9,
        style: { fontSize: 20, weight: 'bold' },
        boundingBox: { x: 100, y: 120, width: 130, height: 24 },
      },
    ], { sourceLang: 'en', scaleX: 2.4, scaleY: 2.4 });

    expect(region?.bbox).toMatchObject({ x: 240, y: 288, width: 312 });
    expect(region?.bbox.height).toBeCloseTo(57.6);
    expect(region?.style?.fontSize).toBe(48);
  });
});
