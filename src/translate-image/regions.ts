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
  lineId?: string;
  paragraphId?: string;
};

const CJK_PREFIXES = ['zh', 'ja', 'ko', 'th', 'lo', 'km', 'my'];

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
  style: item.style?.fontSize !== undefined
    ? { ...item.style, fontSize: item.style.fontSize * scaleY }
    : item.style,
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

const horizontalGap = (a: Bbox, b: Bbox): number =>
  Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)));

const horizontalOverlapRatio = (a: Bbox, b: Bbox): number => {
  const overlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  return overlap / Math.max(1, Math.min(a.width, b.width));
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

const majorityStyle = <T extends string | boolean>(values: Array<T | undefined>): T | undefined => {
  const counts = new Map<T, number>();
  for (const value of values) {
    if (value !== undefined) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
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
  const lines: Line[] = [];
  const metadataLines = new Map<string, Token[]>();
  const geometricTokens: Token[] = [];
  for (const token of tokens) {
    if (!token.item.lineId) {
      geometricTokens.push(token);
      continue;
    }
    const key = JSON.stringify([
      token.item.blockId ?? '',
      token.item.paragraphId ?? '',
      token.item.lineId,
    ]);
    const group = metadataLines.get(key) ?? [];
    group.push(token);
    metadataLines.set(key, group);
  }

  const lineGapLimit = Math.max(3.5 * medianHeight, 12);
  for (const group of metadataLines.values()) {
    const orderedTokens = [...group].sort((a, b) => a.bbox.x - b.bbox.x);
    let line: Line | undefined;
    for (const token of orderedTokens) {
      if (!line || horizontalGap(token.bbox, line.bbox) > lineGapLimit) {
        line = {
          tokens: [token],
          bbox: token.bbox,
          centerY: token.centerY,
          text: '',
          lineId: token.item.lineId,
          paragraphId: token.item.paragraphId,
        };
        lines.push(line);
        continue;
      }
      line.tokens.push(token);
      line.bbox = unionBbox(line.bbox, token.bbox);
      line.centerY = line.bbox.y + line.bbox.height / 2;
    }
  }

  const sortedGeometricTokens = geometricTokens.sort(
    (a, b) => a.centerY - b.centerY || a.centerX - b.centerX
  );
  for (const token of sortedGeometricTokens) {
    const candidates = lines.filter(
      (line) =>
        !line.lineId &&
        (Math.abs(token.centerY - line.centerY) <= 0.8 * medianHeight ||
          overlapRatio(token.bbox, line.bbox) >= 0.5) &&
        overlapRatio(token.bbox, line.bbox) >= 0.1 &&
        horizontalGap(token.bbox, line.bbox) <= Math.max(1.5 * medianHeight, 12)
    );
    if (candidates.length === 0) {
      lines.push({
        tokens: [token],
        bbox: token.bbox,
        centerY: token.centerY,
        text: '',
        lineId: token.item.lineId,
        paragraphId: token.item.paragraphId,
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
      target.lineId ??= token.item.lineId;
      target.paragraphId ??= token.item.paragraphId;
    }
  }

  const isCjk = isCjkLanguage(options.sourceLang);
  for (const line of lines) {
    line.tokens.sort((a, b) => a.bbox.x - b.bbox.x);
    line.text = lineText(line.tokens, isCjk);
  }

  const orderedLines = [...lines].sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  const geometricParagraphs: Line[][] = [];
  for (const line of orderedLines) {
    const candidates = geometricParagraphs.filter((group) => {
      const previous = group[group.length - 1];
      if (!previous || (previous.paragraphId && line.paragraphId && previous.paragraphId !== line.paragraphId)) {
        return false;
      }
      const gap = line.bbox.y - (previous.bbox.y + previous.bbox.height);
      const sameColumn =
        horizontalGap(line.bbox, previous.bbox) <= Math.max(1.5 * medianHeight, 12) ||
        horizontalOverlapRatio(line.bbox, previous.bbox) >= 0.2;
      return gap >= -0.5 * medianHeight && gap <= 1.2 * medianHeight && sameColumn;
    });
    const target = candidates[candidates.length - 1];
    if (target) target.push(line);
    else geometricParagraphs.push([line]);
  }
  const paragraphs = geometricParagraphs.sort((a, b) => {
    const aTop = Math.min(...a.map((line) => line.bbox.y));
    const bTop = Math.min(...b.map((line) => line.bbox.y));
    return aTop - bTop || Math.min(...a.map((line) => line.bbox.x)) - Math.min(...b.map((line) => line.bbox.x));
  });

  return paragraphs.map((group, index) => {
    const groupTokens = group.flatMap((line) => line.tokens);
    const bbox = groupTokens.reduce(
      (acc, token) => unionBbox(acc, token.bbox),
      groupTokens[0]?.bbox ?? { x: 0, y: 0, width: 0, height: 0 }
    );
    const regionItems = groupTokens.map((token) => token.item);
    const styleText = averageStyle(regionItems, 'text');
    const styleBg = averageStyle(regionItems, 'bg');
    const weight = majorityStyle(regionItems.map((item) => item.style?.weight));
    const slant = majorityStyle(regionItems.map((item) => item.style?.slant));
    const serif = majorityStyle(regionItems.map((item) => item.style?.serif));
    const fontSizes = regionItems
      .map((item) => item.style?.fontSize)
      .filter((size): size is number => typeof size === 'number' && Number.isFinite(size) && size > 0);
    let style: OCRStyle | undefined;
    if (styleText || styleBg || weight || slant || serif !== undefined || fontSizes.length > 0) {
      style = {
        ...(styleText ?? {}),
        ...(styleBg ?? {}),
        ...(weight ? { weight } : {}),
        ...(slant ? { slant } : {}),
        ...(serif !== undefined ? { serif } : {}),
        ...(fontSizes.length > 0
          ? { fontSize: median(fontSizes) }
          : {}),
      };
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
