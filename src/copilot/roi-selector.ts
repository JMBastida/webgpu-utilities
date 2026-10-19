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
