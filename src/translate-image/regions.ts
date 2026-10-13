import type { OCRItem } from '@/types/ocr-engine';
import type { OCRQuad, OCRStyle, Region } from './types';

type Bbox = { x: number; y: number; width: number; height: number };

type Token = {
  item: OCRItem;
  text: string;
  bbox: Bbox;
  centerX: number;
  centerY: number;
};

type Line = {
  tokens: Token[];
  bbox: Bbox;
  centerY: number;
  text: string;
};

const CJK_PREFIXES = ['zh', 'ja', 'ko'];

const isCjkLanguage = (code: string): boolean => {
  const normalized = code.toLowerCase();
  return CJK_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}-`)
  );
};

const quadFromBox = (bbox: Bbox): OCRQuad => [
  { x: bbox.x, y: bbox.y },
  { x: bbox.x + bbox.width, y: bbox.y },
  { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
  { x: bbox.x, y: bbox.y + bbox.height },
];

const scaleQuad = (
  quad: NonNullable<OCRItem['quad']>,
  scaleX: number,
  scaleY: number
): NonNullable<OCRItem['quad']> =>
  quad.map(([x, y]) => [x * scaleX, y * scaleY]) as NonNullable<OCRItem['quad']>;

const scaleItem = (item: OCRItem, scaleX: number, scaleY: number): OCRItem => ({
  ...item,
  boundingBox: {
    x: item.boundingBox.x * scaleX,
    y: item.boundingBox.y * scaleY,
    width: item.boundingBox.width * scaleX,
    height: item.boundingBox.height * scaleY,
  },
  quad: item.quad ? scaleQuad(item.quad, scaleX, scaleY) : undefined,
});

const median = (values: number[]): number => {
  if (values.length === 0) return 12;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
};

const unionBbox = (a: Bbox, b: Bbox): Bbox => {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const overlapRatio = (a: Bbox, b: Bbox): number => {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const overlap = Math.max(0, bottom - top);
  const denom = Math.min(a.height, b.height);
  return denom > 0 ? overlap / denom : 0;
};

const normalizeTokenText = (text: string): string => text.replace(/\s+/g, ' ').trim();

const lineText = (tokens: Token[], isCjk: boolean): string => {
  if (isCjk) {
    return tokens.map((token) => token.text).join('');
  }
  return tokens
    .map((token) => normalizeTokenText(token.text))
    .filter(Boolean)
    .join(' ');
};

const averageStyle = (items: OCRItem[], key: 'text' | 'bg'): OCRStyle | undefined => {
  const colors = items
    .map((item) => item.style?.[key])
    .filter((color): color is [number, number, number] => Boolean(color));
  if (colors.length === 0) return undefined;
  const sum = colors.reduce(
    (acc, color) => [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2]],
    [0, 0, 0]
  );
  const avg: [number, number, number] = [
    Math.round(sum[0] / colors.length),
    Math.round(sum[1] / colors.length),
    Math.round(sum[2] / colors.length),
  ];
  return { [key]: avg };
};

export const buildRegions = (
  items: OCRItem[],
  options: { sourceLang: string; scaleX: number; scaleY: number }
): Region[] => {
  const scaledItems = items
    .map((item) => scaleItem(item, options.scaleX, options.scaleY))
    .filter((item) => item.text.trim().length > 0);
  if (scaledItems.length === 0) return [];

  const tokens: Token[] = scaledItems.map((item) => {
    const bbox = item.boundingBox;
    return {
      item,
      text: item.text,
      bbox,
      centerX: bbox.x + bbox.width / 2,
      centerY: bbox.y + bbox.height / 2,
    };
  });

  const medianHeight = median(tokens.map((token) => token.bbox.height));
  const sortedTokens = [...tokens].sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX);

  const lines: Line[] = [];
  for (const token of sortedTokens) {
    const candidates = lines.filter(
      (line) =>
        (Math.abs(token.centerY - line.centerY) <= 0.8 * medianHeight ||
          overlapRatio(token.bbox, line.bbox) >= 0.5) &&
        overlapRatio(token.bbox, line.bbox) >= 0.1
    );
    if (candidates.length === 0) {
      lines.push({
        tokens: [token],
        bbox: token.bbox,
        centerY: token.centerY,
        text: '',
      });
      continue;
    }
    const target = candidates.reduce((best, current) => {
      const bestDelta = Math.abs(token.centerY - (best?.centerY ?? 0));
      const currentDelta = Math.abs(token.centerY - (current?.centerY ?? 0));
      return currentDelta < bestDelta ? current : best;
    }, candidates[0]);
    if (target) {
      target.tokens.push(token);
      target.bbox = unionBbox(target.bbox, token.bbox);
      target.centerY = target.bbox.y + target.bbox.height / 2;
    }
  }

  const isCjk = isCjkLanguage(options.sourceLang);
  for (const line of lines) {
    line.tokens.sort((a, b) => a.bbox.x - b.bbox.x);
    line.text = lineText(line.tokens, isCjk);
  }

  const orderedLines = [...lines].sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  const paragraphs: Line[][] = [];
  let current: Line[] = [];

  for (const line of orderedLines) {
    if (current.length === 0) {
      current = [line];
      continue;
    }
    const previous = current[current.length - 1];
    if (previous) {
      const gap = line.bbox.y - (previous.bbox.y + previous.bbox.height);
      if (gap > 1.2 * medianHeight) {
        paragraphs.push(current);
        current = [line];
      } else {
        current.push(line);
      }
    }
  }
  if (current.length > 0) {
    paragraphs.push(current);
  }

  return paragraphs.map((group, index) => {
    const groupTokens = group.flatMap((line) => line.tokens);
    const bbox = groupTokens.reduce(
      (acc, token) => unionBbox(acc, token.bbox),
      groupTokens[0]?.bbox ?? { x: 0, y: 0, width: 0, height: 0 }
    );
    const regionItems = groupTokens.map((token) => token.item);
    const styleText = averageStyle(regionItems, 'text');
    const styleBg = averageStyle(regionItems, 'bg');
    let style: OCRStyle | undefined;
    if (styleText || styleBg) {
      style = { ...(styleText ?? {}), ...(styleBg ?? {}) };
    }
    const singleItemQuad = regionItems.length === 1 ? regionItems[0]?.quad : undefined;
    const quad: OCRQuad = singleItemQuad
      ? (singleItemQuad.map(([x, y]) => ({ x, y })) as OCRQuad)
      : quadFromBox(bbox);
    return {
      id: `region-${index + 1}`,
      items: regionItems,
      bbox,
      quad,
      sourceLines: group.map((line) => line.text),
      sourceLineCount: group.length,
      style,
    };
  });
};
