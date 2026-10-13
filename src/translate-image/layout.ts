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
}

const CJK_PREFIXES = ['zh', 'ja', 'ko'];
const RTL_PREFIXES = ['ar', 'he', 'fa', 'ur'];

export const isCjkLanguage = (code: string): boolean => {
  const normalized = code.toLowerCase();
  return CJK_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}-`)
  );
};

export const isRtlLanguage = (code: string): boolean => {
  const normalized = code.toLowerCase();
  return RTL_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}-`)
  );
};

export const getFontFamily = (code: string): string => {
  const normalized = code.toLowerCase();
  if (normalized.startsWith('ja') || normalized.startsWith('zh') || normalized.startsWith('ko')) {
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
  return '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
};

export const wrapText = (
  text: string,
  maxWidth: number,
  context: Context2D,
  isCjk: boolean
): string[] => {
  const rawLines = text.split(/\r?\n/);
  const lines: string[] = [];

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    const tokens = isCjk ? Array.from(trimmed) : trimmed.split(/\s+/).filter(Boolean);
    let current = '';
    for (const originalToken of tokens) {
      const tokenWidth = context.measureText(originalToken).width;
      const splitLongWord = !isCjk && tokenWidth > maxWidth;
      const tokenParts = splitLongWord ? Array.from(originalToken) : [originalToken];
      for (const [tokenIndex, token] of tokenParts.entries()) {
        const separator = isCjk || (splitLongWord && tokenIndex > 0) ? '' : ' ';
        const candidate = current ? `${current}${separator}${token}` : token;
        const width = context.measureText(candidate).width;
        if (width <= maxWidth || !current) {
          current = candidate;
        } else {
          lines.push(current);
          current = token;
        }
      }
    }
    if (current) {
      lines.push(current);
    }
  }

  return lines;
};

const computeLayout = (options: {
  text: string;
  width: number;
  height: number;
  fontFamily: string;
  align: TextAlignment;
  direction: TextDirection;
  targetLineCount: number;
  isCjk: boolean;
}): { lines: string[]; fontSize: number; lineHeight: number } => {
  const canvas = createCanvas(1, 1);
  const context = getContext2d(canvas);
  let bestLines: string[] = [];
  let bestSize = 8;
  let bestPenalty = Infinity;

  let low = 8;
  let high = Math.max(8, Math.floor(options.height));
  for (let i = 0; i < 12; i += 1) {
    const size = Math.max(8, Math.floor((low + high) / 2));
    context.font = `${size}px ${options.fontFamily}`;
    const lines = wrapText(options.text, options.width * 0.98, context, options.isCjk);
    const lineHeight = size * 1.18;
    const height = lines.length * lineHeight;
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
    context.font = `${bestSize}px ${options.fontFamily}`;
    bestLines = wrapText(options.text, options.width * 0.98, context, options.isCjk);
    const height = bestLines.length * bestSize * 1.18;
    const width = bestLines.reduce(
      (max, line) => Math.max(max, context.measureText(line).width),
      0
    );
    if (width > options.width * 0.98 || height > options.height * 0.98) {
      throw new Error('Translated text does not fit the detected text region.');
    }
  }

  return { lines: bestLines, fontSize: bestSize, lineHeight: bestSize * 1.18 };
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
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}): TextLayoutResult => {
  const layout = computeLayout(options);
  const textCanvas = createCanvas(options.width, options.height);
  const textContext = getContext2d(textCanvas);
  textContext.clearRect(0, 0, options.width, options.height);
  textContext.fillStyle = '#fff';
  textContext.font = `${layout.fontSize}px ${options.fontFamily}`;
  textContext.textAlign = options.align;
  textContext.textBaseline = 'top';
  textContext.direction = options.direction;
  textContext.filter = 'blur(0.4px)';

  const startX = options.align === 'right' ? options.width : 0;
  let cursorY = 0;
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
    baseContext.font = `${layout.fontSize}px ${options.fontFamily}`;
    baseContext.textAlign = options.align;
    baseContext.textBaseline = 'top';
    baseContext.direction = options.direction;
    let shadowY = 0;
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
  };
};
