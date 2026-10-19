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
