import type { OCRItem } from '@/types/ocr-engine';
import type { ITextTranslator } from '@/types/translation';
import type { InpaintOptions } from './inpaint';

export type RGB = [number, number, number];
export interface OCRPoint {
  x: number;
  y: number;
}
export type OCRQuad = [OCRPoint, OCRPoint, OCRPoint, OCRPoint];
export interface OCRStyle {
  bg?: RGB;
  text?: RGB;
}

export interface Region {
  id: string;
  items: OCRItem[];
  bbox: { x: number; y: number; width: number; height: number };
  quad: OCRQuad;
  sourceLines: string[];
  sourceLineCount: number;
  translatedText?: string;
  style?: OCRStyle;
}

export interface TranslateImageInput {
  original: ImageData;
  ocrItems: OCRItem[];
  engineId: string;
  from: string;
  to: string;
  translator: ITextTranslator;
  ocrSize: { width: number; height: number };
}

export interface TranslateImageOptions {
  debug?: boolean;
  quality?: 'fast' | 'balanced' | 'high-quality';
  inpaint?: InpaintOptions;
}

export interface TranslateImageDebugStep {
  label: string;
  blob: Blob;
  width: number;
  height: number;
}

export interface TranslateImageDebugStats {
  imageWidth: number;
  imageHeight: number;
  ocrWidth: number;
  ocrHeight: number;
  scaleX: number;
  scaleY: number;
  regionCount: number;
  outOfBoundsRegions: number;
  bounds: { x: number; y: number; width: number; height: number };
  rawMaskPixels: number;
  dilatedMaskPixels: number;
}

export interface TranslateImageOutput {
  blob: Blob;
  debug?: {
    regions: Region[];
    steps?: TranslateImageDebugStep[];
    stats?: TranslateImageDebugStats;
  };
}
