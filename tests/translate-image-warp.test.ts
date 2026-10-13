import { describe, expect, it } from 'vitest';
import type { OCRQuad } from '../src/translate-image/types';
import { rectifiedQuadSize } from '../src/translate-image/warp';

describe('OCR quadrilateral geometry', () => {
  it('uses rectified edge lengths for rotated text layout', () => {
    const angle = Math.PI / 4;
    const point = (x: number, y: number): { x: number; y: number } => ({
      x: 200 + x * Math.cos(angle) - y * Math.sin(angle),
      y: 200 + x * Math.sin(angle) + y * Math.cos(angle),
    });
    const quad: OCRQuad = [point(0, 0), point(200, 0), point(200, 20), point(0, 20)];

    expect(rectifiedQuadSize(quad)).toEqual({ width: 200, height: 20 });
  });

  it('rejects self-crossing or degenerate quadrilaterals', () => {
    const invalid: OCRQuad = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ];
    expect(() => rectifiedQuadSize(invalid)).toThrow('convex and non-degenerate');
  });
});
