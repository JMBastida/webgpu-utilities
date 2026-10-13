/**
 * Type definitions for eSearch-OCR integration.
 *
 * This file re-exports and documents the key types from the esearch-ocr package
 * for use in our multi-engine OCR system.
 *
 * @packageDocumentation
 * @see https://github.com/xushengfeng/eSearch-OCR
 *
 * ## Package Information
 * - Package: esearch-ocr@8.5.0
 * - TypeScript Support: Built-in (types in src/main.ts)
 * - Runtime: onnxruntime-web (WASM, WebGL, or WebGPU)
 * - Model: PaddleOCR v4/v5 models converted to ONNX format
 *
 * ## Version Compatibility Notes
 * - Requires onnxruntime-web ^1.22.0 (peer dependency: onnxruntime-common)
 * - For v5 models, set rec.optimize.space = false to avoid extra spaces
 * - Model files must be downloaded separately from GitHub releases
 */

import type * as ort from 'onnxruntime-web';

// ============================================================================
// Core Types - Re-exported from esearch-ocr
// ============================================================================

/**
 * A point represented as [x, y] coordinates.
 */
export type PointType = [number, number];

/**
 * A bounding box represented as four corner points in order: ↖ ↗ ↘ ↙
 * (top-left, top-right, bottom-right, bottom-left)
 */
export type BoxType = [PointType, PointType, PointType, PointType];

/**
 * RGB color represented as a tuple [r, g, b].
 */
export type ColorType = [number, number, number];

/**
 * Style information for detected text, including background and text colors.
 * Useful for simple text removal or overlay operations.
 */
export interface TextStyle {
  /** Background color as RGB array */
  bg: ColorType;
  /** Text color as RGB array */
  text: ColorType;
}

/**
 * A single OCR result item representing one detected text region.
 */
export interface ESearchResultItem {
  /** The recognized text content */
  text: string;
  /** Confidence score (0-1), higher is more confident */
  mean: number;
  /** Bounding box coordinates: ↖ ↗ ↘ ↙ */
  box: BoxType;
  /** Color style information */
  style: TextStyle;
}

/**
 * Array of OCR result items.
 */
export type ESearchResultType = ESearchResultItem[];

// ============================================================================
// Reading Direction Types
// ============================================================================

/**
 * Direction component for reading order.
 * - 'lr': left to right
 * - 'rl': right to left
 * - 'tb': top to bottom
 * - 'bt': bottom to top
 */
export type ReadingDirPart = 'lr' | 'rl' | 'tb' | 'bt';

/**
 * Complete reading direction specification.
 */
export interface ReadingDir {
  /** Direction within a line (inline direction) */
  inline: ReadingDirPart;
  /** Direction of lines (block direction) */
  block: ReadingDirPart;
}

// ============================================================================
// Layout Analysis Types
// ============================================================================

/**
 * A paragraph detected in the layout analysis.
 */
export interface ESearchParagraph {
  /** Source result items that make up this paragraph */
  src: ESearchResultType;
  /** Parsed/merged result for the paragraph */
  parse: ESearchResultItem;
}

/**
 * A column detected in the layout analysis (e.g., for multi-column documents).
 */
export interface ESearchColumn {
  /** Source result items in this column */
  src: ESearchResultType;
  /** Outer bounding box of the column */
  outerBox: BoxType;
  /** Paragraphs within this column */
  parragraphs: ESearchParagraph[];
}

/**
 * Complete OCR output including layout analysis.
 * This is the main return type from the `ocr()` function.
 */
export interface ESearchOCROutput {
  /** Raw OCR results - each visual line from recognition */
  src: ESearchResultType;

  /**
   * Columns detected in the document (e.g., left/right columns).
   * Each column contains its own paragraphs.
   */
  columns: ESearchColumn[];

  /**
   * All paragraphs aggregated from columns.
   * Use `parragraphs.map(item => item.text).join('\n')` for plain text.
   *
   * @note The property name 'parragraphs' (with double 'r') matches the
   * esearch-ocr API spelling.
   */
  parragraphs: ESearchResultType;

  /** Detected reading direction */
  readingDir: ReadingDir;

  /** Angle information for the document */
  angle: {
    /** Reading direction angles in degrees */
    reading: {
      inline: number;
      block: number;
    };
    /** Overall rotation angle in degrees (can be ignored if < 1°) */
    angle: number;
  };

  /** Document direction from cls model (0, 90, 180, 270 degrees) */
  docDir: number;
}

// ============================================================================
// Detection Result Types
// ============================================================================

/**
 * Result from the detection phase (det).
 * Contains bounding boxes and cropped images for each detected text region.
 */
export interface ESearchDetResult {
  /** Bounding box of detected text region */
  box: BoxType;
  /** Cropped image data for the text region */
  img: ImageData;
  /** Color style information */
  style: TextStyle;
}

export type ESearchDetResultType = ESearchDetResult[];

// ============================================================================
// Input Types
// ============================================================================

/**
 * Supported input types for OCR processing.
 */
export type ESearchInputType = string | HTMLImageElement | HTMLCanvasElement | ImageData;

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Column hint for layout analysis.
 */
export interface ColumnsTip {
  /** Bounding box of the column area */
  box: BoxType;
  /** Column type hint */
  type: 'auto' | 'ignore' | 'table' | 'raw' | 'raw-blank';
}

/**
 * ONNX Runtime options passed to esearch-ocr.
 */
export interface ESearchOrtOption {
  /** The onnxruntime module (import * as ort from 'onnxruntime-web') */
  ort: typeof ort;
  /** Optional session configuration */
  ortOption?: ort.InferenceSession.SessionOptions;
}

/**
 * Detection model initialization options.
 */
export interface ESearchDetConfig {
  /**
   * Path to .onnx file, or binary data.
   * Models available at: https://github.com/xushengfeng/eSearch-OCR/releases/tag/4.0.0
   */
  input: string | ArrayBufferLike | Uint8Array;

  /**
   * Scale ratio for input image (0-1).
   * Smaller values are faster but less accurate.
   * @default 1
   */
  ratio?: number;

  /** Callback when detection completes */
  on?: (r: ESearchDetResultType) => void;
}

/**
 * Recognition model initialization options.
 */
export interface ESearchRecConfig {
  /**
   * Path to .onnx file, or binary data.
   */
  input: string | ArrayBufferLike | Uint8Array;

  /**
   * Character dictionary content (not path).
   * This is the content of the .txt file in the model package.
   */
  decodeDic: string;

  /**
   * Model input height (some models have fixed requirements).
   */
  imgh?: number;

  /**
   * Progress callback during recognition.
   * @param index Current item index (0-based)
   * @param result Recognition result for current item
   * @param total Total number of items
   */
  on?: (index: number, result: Array<{ t: string; mean: number }[]>, total: number) => void;

  /** Optimization options */
  optimize?: {
    /**
     * Optimize English space recognition.
     * Set to false for v5 models to avoid extra spaces.
     * @default true
     */
    space?: boolean;
  };

  /** Multi-character candidate options for recRaw */
  multiChar?: {
    /** Maximum candidates per character */
    topK?: number;
    /** Confidence threshold for candidates */
    threshold?: number;
  };
}

/**
 * Document direction classification model options.
 */
export interface ESearchDocClsConfig {
  /**
   * Path to document direction classification .onnx model.
   * Model available at: https://github.com/xushengfeng/eSearch-OCR/releases/tag/8.1.0
   */
  input: string | ArrayBufferLike | Uint8Array;
}

/**
 * Layout analysis options.
 */
export interface ESearchLayoutConfig {
  /**
   * Limit the range of document reading directions to detect.
   * @default [{ block: 'tb', inline: 'lr' }, { block: 'lr', inline: 'tb' }]
   */
  docDirs?: ReadingDir[];

  /** Column hints for layout analysis */
  columnsTip?: ColumnsTip[];
}

/**
 * Complete initialization options for eSearch-OCR.
 */
export interface ESearchInitOptions extends ESearchOrtOption {
  /** Detection model configuration (required) */
  det: ESearchDetConfig;

  /** Recognition model configuration (required) */
  rec: ESearchRecConfig;

  /** Document direction classification model (optional) */
  docCls?: ESearchDocClsConfig;

  /** Layout analysis options (optional) */
  analyzeLayout?: ESearchLayoutConfig;

  /** Enable debug mode */
  dev?: boolean;

  /** Enable logging */
  log?: boolean;
}

// ============================================================================
// Initialized OCR Instance Type
// ============================================================================

/**
 * The initialized eSearch-OCR instance returned by `init()`.
 */
export interface ESearchOCRInstance {
  /**
   * Perform full OCR with layout analysis.
   * @param src Input image (URL, element, or ImageData)
   * @returns Complete OCR output with layout information
   */
  ocr: (src: ESearchInputType) => Promise<ESearchOCROutput>;

  /**
   * Perform only text detection (no recognition).
   * @param img Input ImageData
   * @returns Array of detected text regions
   */
  det: (img: ImageData) => Promise<ESearchDetResultType>;

  /**
   * Perform only text recognition on detected regions.
   * @param box Detection results from det()
   * @returns Array of recognized text results
   */
  rec: (box: ESearchDetResultType) => Promise<ESearchResultType>;

  /**
   * Raw recognition with multiple character candidates.
   * Requires multiChar option in rec config.
   */
  recRaw: (box: ESearchDetResultType) => Promise<unknown>;
}

// ============================================================================
// Utility Types for Our Integration
// ============================================================================

/**
 * Model file paths for eSearch-OCR initialization.
 * These should be relative paths or URLs to the ONNX model files.
 */
export interface ESearchModelPaths {
  /** Detection model path (e.g., 'models/esearch/det.onnx') */
  det: string;

  /** Recognition model path (e.g., 'models/esearch/rec.onnx') */
  rec: string;

  /** Character dictionary path (e.g., 'models/esearch/ppocr_keys_v1.txt') */
  dict: string;

  /** Optional document direction classification model */
  docCls?: string;
}

/**
 * Default model configuration for Chinese-English mixed text (v4).
 * Model package: ch.zip from releases
 */
export const ESEARCH_DEFAULT_MODEL_CONFIG = {
  modelPackage: 'ch.zip',
  detModel: 'ch_PP-OCRv4_det_infer.onnx',
  recModel: 'ch_PP-OCRv4_rec_infer.onnx',
  dictFile: 'ppocr_keys_v1.txt',
} as const;

/**
 * Convert eSearch-OCR output to a simple text string.
 * @param output The OCR output from esearch-ocr
 * @returns Plain text with paragraphs joined by newlines
 */
export function extractTextFromESearchOutput(output: ESearchOCROutput): string {
  return output.parragraphs.map(item => item.text).join('\n');
}

/**
 * Convert eSearch result items to our standard OCR result format.
 * This helper maps eSearch's output to our unified OCRResult type.
 */
export function mapESearchResultToStandard(items: ESearchResultType): Array<{
  text: string;
  confidence: number;
  quad?: [[number, number], [number, number], [number, number], [number, number]];
  angle?: number;
  style?: {
    bg?: [number, number, number];
    text?: [number, number, number];
  };
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}> {
  return items.map(item => {
    // Calculate bounding box from the four corner points
    const xs = item.box.map(p => p[0]);
    const ys = item.box.map(p => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    return {
      text: item.text,
      confidence: item.mean,
      style: item.style
        ? {
            bg: item.style.bg,
            text: item.style.text,
          }
        : undefined,
      quad: [
        [item.box[0][0], item.box[0][1]],
        [item.box[1][0], item.box[1][1]],
        [item.box[2][0], item.box[2][1]],
        [item.box[3][0], item.box[3][1]],
      ],
      angle:
        (Math.atan2(item.box[1][1] - item.box[0][1], item.box[1][0] - item.box[0][0]) * 180) /
        Math.PI,
      boundingBox: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
    };
  });
}
