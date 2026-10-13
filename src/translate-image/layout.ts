import type { CanvasLike, Context2D } from './canvas';
import { createCanvas, getContext2d } from './canvas';

export type TextAlignment = 'left' | 'right';
export type TextDirection = 'ltr' | 'rtl';

export interface TextLayoutResult {
  textCanvas: CanvasLike;
  shadowCanvas: CanvasLike | null;
  lines: string[];
  fontSize: number;
  lineHeight: number;
  width: number;
  height: number;
  baselineY: number;
}

const NO_SPACE_PREFIXES = ['zh', 'ja', 'ko', 'th', 'lo', 'km', 'my'];
const RTL_PREFIXES = ['ar', 'he', 'fa', 'ur'];

export const isNoSpaceLanguage = (code: string): boolean => {
  const normalized = code.toLowerCase();
  return NO_SPACE_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}-`)
  );
};

export const isRtlLanguage = (code: string): boolean => {
  const normalized = code.toLowerCase();
  return RTL_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}-`)
  );
};

export const getFontFamily = (
  code: string,
  style?: { serif?: boolean }
): string => {
  const normalized = code.toLowerCase();
  if (normalized.startsWith('ja') || normalized.startsWith('zh') || normalized.startsWith('ko')) {
    if (style?.serif) {
      return [
        '"Noto Serif CJK"',
        '"Noto Serif JP"',
        '"Songti SC"',
        '"Yu Mincho"',
        'serif',
      ].join(', ');
    }
    return [
      '"Noto Sans CJK"',
      '"Noto Sans JP"',
      '"PingFang SC"',
      '"Hiragino Sans"',
      '"Apple SD Gothic Neo"',
      'sans-serif',
    ].join(', ');
  }
  if (normalized.startsWith('ar')) {
    return '"Noto Naskh Arabic", "Amiri", "Scheherazade New", serif';
  }
  if (style?.serif) return '"Noto Serif", Georgia, serif';
  return '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
};

const segmentNoSpaceText = (text: string, language: string): string[] => {
  type Segment = { segment: string };
  type SegmenterConstructor = new (
    locale: string,
    options: { granularity: 'word' }
  ) => { segment: (input: string) => Iterable<Segment> };
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  if (Segmenter) {
    return Array.from(
      new Segmenter(language, { granularity: 'word' }).segment(text),
      (part) => part.segment
    );
  }
  return Array.from(text);
};

export const wrapText = (
  text: string,
  maxWidth: number,
  context: Context2D,
  isCjk: boolean,
  language = 'zh'
): string[] => {
  const rawLines = text.split(/\r?\n/);
  const lines: string[] = [];

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    const tokens = isCjk
      ? segmentNoSpaceText(trimmed, language)
      : trimmed.split(/\s+/).filter(Boolean);
    let current = '';
    for (const originalToken of tokens) {
      const tokenWidth = context.measureText(originalToken).width;
      const splitLongWord = tokenWidth > maxWidth;
      const tokenParts = splitLongWord ? Array.from(originalToken) : [originalToken];
      for (const [tokenIndex, token] of tokenParts.entries()) {
        const separator = isCjk || (splitLongWord && tokenIndex > 0) ? '' : ' ';
        const whitespace = token.trim().length === 0;
        if (!current && whitespace) continue;
        const candidate = current ? `${current}${separator}${token}` : token;
        const width = context.measureText(candidate).width;
        if (width <= maxWidth || !current) {
          current = candidate;
        } else {
          lines.push(current.trimEnd());
          current = whitespace ? '' : token;
        }
      }
    }
    if (current) {
      lines.push(current);
    }
  }

  return lines;
};

const measuredInkHeight = (lines: string[], context: Context2D, lineHeight: number): number => {
  if (lines.length === 0) return 0;
  const glyphHeight = lines.reduce((height, line) => {
    const metrics = context.measureText(line);
    const measured = (metrics.actualBoundingBoxAscent ?? 0) + (metrics.actualBoundingBoxDescent ?? 0);
    return Math.max(height, measured);
  }, 0);
  return glyphHeight + Math.max(0, lines.length - 1) * lineHeight;
};

export const computeTextLayout = (options: {
  text: string;
  width: number;
  height: number;
  fontFamily: string;
  align: TextAlignment;
  direction: TextDirection;
  targetLineCount: number;
  isCjk: boolean;
  language?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  verticalAlign?: 'middle' | 'bottom';
  minFontSize?: number;
  maxFontSize?: number;
}): { lines: string[]; fontSize: number; lineHeight: number; baselineY: number } => {
  const canvas = createCanvas(1, 1);
  const context = getContext2d(canvas);
  let bestLines: string[] = [];
  let bestPenalty = Infinity;
  const fontStyle = options.fontStyle === 'italic' ? 'italic' : 'normal';
  const fontWeight = options.fontWeight === 'bold' ? 'bold' : 'normal';

  const minimum = Math.max(1, Math.floor(options.minFontSize ?? 1));
  // Font size can exceed the box's CSS height when actual glyph ink still fits
  // (e.g. source OCR height measures cap height, not the font's em square).
  const maximum = Math.max(minimum, Math.floor(options.maxFontSize ?? options.height));
  let bestSize = minimum;
  let low = minimum;
  let high = maximum;
  for (let i = 0; i < 12; i += 1) {
    if (low > high) break;
    const size = Math.max(minimum, Math.min(maximum, Math.floor((low + high) / 2)));
    context.font = `${fontStyle} ${fontWeight} ${size}px ${options.fontFamily}`;
    const lines = wrapText(
      options.text,
      options.width * 0.98,
      context,
      options.isCjk,
      options.language
    );
    const lineHeight = size * 1.18;
    const height = measuredInkHeight(lines, context, lineHeight);
    const width = lines.reduce((max, line) => Math.max(max, context.measureText(line).width), 0);
    const fits = width <= options.width * 0.98 && height <= options.height * 0.98;
    if (fits) {
      const penalty = Math.abs(lines.length - Math.max(1, options.targetLineCount));
      if (penalty < bestPenalty || (penalty === bestPenalty && size > bestSize)) {
        bestPenalty = penalty;
        bestSize = size;
        bestLines = lines;
      }
      low = size + 1;
    } else {
      high = size - 1;
    }
  }

  if (bestLines.length === 0) {
    context.font = `${fontStyle} ${fontWeight} ${bestSize}px ${options.fontFamily}`;
    bestLines = wrapText(
      options.text,
      options.width * 0.98,
      context,
      options.isCjk,
      options.language
    );
    const height = measuredInkHeight(bestLines, context, bestSize * 1.18);
    const width = bestLines.reduce(
      (max, line) => Math.max(max, context.measureText(line).width),
      0
    );
    if (width > options.width * 0.98 || height > options.height * 0.98) {
      throw new Error(
        'Translated text cannot fit this region at a readable size. Edit it shorter or add line breaks.'
      );
    }
  }

  context.font = `${fontStyle} ${fontWeight} ${bestSize}px ${options.fontFamily}`;
  const lineHeight = bestSize * 1.18;
  const firstMetrics = context.measureText(bestLines[0] ?? '');
  const lastMetrics = context.measureText(bestLines[bestLines.length - 1] ?? '');
  const firstAscent = firstMetrics.actualBoundingBoxAscent ?? bestSize * 0.8;
  const lastDescent = lastMetrics.actualBoundingBoxDescent ?? 0;
  const baselineY = options.verticalAlign === 'middle'
    ? (options.height - (firstAscent + lastDescent + Math.max(0, bestLines.length - 1) * lineHeight)) / 2 + firstAscent
    : options.height - lastDescent - 1 - Math.max(0, bestLines.length - 1) * lineHeight;
  return { lines: bestLines, fontSize: bestSize, lineHeight, baselineY };
};

const blurCanvas = (source: CanvasLike, radius: number): CanvasLike => {
  const canvas = createCanvas(source.width, source.height);
  const context = getContext2d(canvas);
  context.filter = `blur(${radius}px)`;
  context.drawImage(source as unknown as CanvasImageSource, 0, 0);
  context.filter = 'none';
  return canvas;
};

export const renderTextMasks = (options: {
  text: string;
  width: number;
  height: number;
  fontFamily: string;
  align: TextAlignment;
  direction: TextDirection;
  targetLineCount: number;
  isCjk: boolean;
  language?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  verticalAlign?: 'middle' | 'bottom';
  minFontSize?: number;
  maxFontSize?: number;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}): TextLayoutResult => {
  const layout = computeTextLayout({
    ...options,
    fontWeight: options.fontWeight,
    fontStyle: options.fontStyle,
  });
  const textCanvas = createCanvas(options.width, options.height);
  const textContext = getContext2d(textCanvas);
  textContext.clearRect(0, 0, options.width, options.height);
  textContext.fillStyle = '#fff';
  const fontStyle = options.fontStyle === 'italic' ? 'italic' : 'normal';
  const fontWeight = options.fontWeight === 'bold' ? 'bold' : 'normal';
  textContext.font = `${fontStyle} ${fontWeight} ${layout.fontSize}px ${options.fontFamily}`;
  textContext.textAlign = options.align;
  textContext.textBaseline = 'alphabetic';
  textContext.direction = options.direction;
  // Canvas glyph rasterization already antialiases text; an extra blur makes it look soft.
  textContext.filter = 'none';

  const startX = options.align === 'right' ? options.width : 0;
  let cursorY = layout.baselineY;
  for (const line of layout.lines) {
    textContext.fillText(line, startX, cursorY);
    cursorY += layout.lineHeight;
  }
  textContext.filter = 'none';

  let shadowCanvas: CanvasLike | null = null;
  if (options.shadowBlur > 0) {
    const base = createCanvas(options.width, options.height);
    const baseContext = getContext2d(base);
    baseContext.fillStyle = '#fff';
    baseContext.font = `${fontStyle} ${fontWeight} ${layout.fontSize}px ${options.fontFamily}`;
    baseContext.textAlign = options.align;
    baseContext.textBaseline = 'alphabetic';
    baseContext.direction = options.direction;
    let shadowY = layout.baselineY;
    for (const line of layout.lines) {
      baseContext.fillText(line, startX + options.shadowOffsetX, shadowY + options.shadowOffsetY);
      shadowY += layout.lineHeight;
    }
    shadowCanvas = blurCanvas(base, options.shadowBlur);
  }

  return {
    textCanvas,
    shadowCanvas,
    lines: layout.lines,
    fontSize: layout.fontSize,
    lineHeight: layout.lineHeight,
    width: options.width,
    height: options.height,
    baselineY: layout.baselineY,
  };
};
