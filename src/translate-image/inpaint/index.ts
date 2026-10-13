import type { Bounds } from '../mask';
import { inpaintImageFallback } from './ts-fallback';

export type InpaintStrategy = 'auto' | 'ts-fallback';
export type InpaintMethod = 'telea' | 'navier-stokes';

export interface InpaintOptions {
  strategy?: InpaintStrategy;
  method?: InpaintMethod;
  radius?: number;
  debug?: boolean;
  maxRegionSizePx?: number;
  maxUnionAreaRatio?: number;
  groupDistance?: number;
  quality?: 'fast' | 'balanced' | 'high-quality';
}

export const inpaintImage = (
  original: ImageData,
  mask: Uint8ClampedArray,
  bounds: Bounds,
  options: InpaintOptions = {}
): Promise<ImageData> =>
  Promise.resolve(inpaintImageFallback(original, mask, bounds, options.quality ?? 'balanced'));
