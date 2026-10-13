import type { CanvasLike } from './canvas';
import { getContext2d } from './canvas';
import type { OCRQuad, OCRPoint } from './types';
import type { Bounds } from './mask';

type Matrix3 = [number, number, number, number, number, number, number, number, number];

const quadBounds = (quad: OCRQuad): Bounds => {
  const xs = quad.map((point) => point.x);
  const ys = quad.map((point) => point.y);
  const minX = Math.floor(Math.min(...xs));
  const minY = Math.floor(Math.min(...ys));
  const maxX = Math.ceil(Math.max(...xs));
  const maxY = Math.ceil(Math.max(...ys));
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
};

const computeHomography = (src: OCRPoint[], dst: OCRPoint[]): Matrix3 => {
  const matrix: number[][] = [];
  const vector: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = src[i]!;
    const { x: u, y: v } = dst[i]!;
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    vector.push(u, v);
  }

  const solution = solveLinearSystem(matrix, vector);
  return [
    solution[0]!,
    solution[1]!,
    solution[2]!,
    solution[3]!,
    solution[4]!,
    solution[5]!,
    solution[6]!,
    solution[7]!,
    1,
  ];
};

const solveLinearSystem = (matrix: number[][], vector: number[]): number[] => {
  const n = vector.length;
  const augmented = matrix.map((row, i) => [...row, vector[i]!]);

  for (let i = 0; i < n; i += 1) {
    let maxRow = i;
    for (let k = i + 1; k < n; k += 1) {
      if (Math.abs(augmented[k]![i]!) > Math.abs(augmented[maxRow]![i]!)) {
        maxRow = k;
      }
    }
    const temp = augmented[i]!;
    augmented[i] = augmented[maxRow]!;
    augmented[maxRow] = temp;

    const pivot = augmented[i]?.[i] ?? 0;
    if (Math.abs(pivot) < 1e-8) {
      throw new Error('Homography solve failed.');
    }
    const rowI = augmented[i];
    if (rowI) {
      for (let j = i; j <= n; j += 1) {
        rowI[j] = (rowI[j] ?? 0) / pivot;
      }
    }
    for (let k = 0; k < n; k += 1) {
      if (k === i) continue;
      const rowK = augmented[k];
      const factor = rowK?.[i] ?? 0;
      if (rowK && rowI) {
        for (let j = i; j <= n; j += 1) {
          rowK[j] = (rowK[j] ?? 0) - factor * (rowI[j] ?? 0);
        }
      }
    }
  }

  return augmented.map((row) => row[n]!);
};

const invertMatrix3 = (matrix: Matrix3): Matrix3 => {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-8) {
    throw new Error('Homography inversion failed.');
  }
  const invDet = 1 / det;
  return [
    A * invDet,
    (c * h - b * i) * invDet,
    (b * f - c * e) * invDet,
    B * invDet,
    (a * i - c * g) * invDet,
    (c * d - a * f) * invDet,
    C * invDet,
    (b * g - a * h) * invDet,
    (a * e - b * d) * invDet,
  ];
};

const applyHomography = (matrix: Matrix3, x: number, y: number): [number, number] => {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const denom = g * x + h * y + i;
  if (Math.abs(denom) < 1e-8) return [x, y];
  return [(a * x + b * y + c) / denom, (d * x + e * y + f) / denom];
};

const pointInQuad = (point: OCRPoint, quad: OCRQuad): boolean => {
  const cross = (a: OCRPoint, b: OCRPoint, c: OCRPoint): number =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const sign = (value: number): number => (value >= 0 ? 1 : -1);
  const s1 = sign(cross(quad[0], quad[1], point));
  const s2 = sign(cross(quad[1], quad[2], point));
  const s3 = sign(cross(quad[2], quad[3], point));
  const s4 = sign(cross(quad[3], quad[0], point));
  return s1 === s2 && s2 === s3 && s3 === s4;
};

export const isRectQuad = (quad: OCRQuad, bbox: Bounds, epsilon = 0.5): boolean => {
  const rect = [
    { x: bbox.x, y: bbox.y },
    { x: bbox.x + bbox.width, y: bbox.y },
    { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
    { x: bbox.x, y: bbox.y + bbox.height },
  ];
  return quad.every(
    (point, index) =>
      Math.abs(point.x - rect[index]!.x) <= epsilon && Math.abs(point.y - rect[index]!.y) <= epsilon
  );
};

export const warpMaskToQuad = (
  source: CanvasLike,
  quad: OCRQuad
): { imageData: ImageData; bounds: Bounds } => {
  const bounds = quadBounds(quad);
  const context = getContext2d(source);
  const srcData = context.getImageData(0, 0, source.width, source.height);
  const srcWidth = srcData.width;
  const srcHeight = srcData.height;
  const output = new ImageData(bounds.width, bounds.height);

  const srcPoints: OCRPoint[] = [
    { x: 0, y: 0 },
    { x: srcWidth, y: 0 },
    { x: srcWidth, y: srcHeight },
    { x: 0, y: srcHeight },
  ];
  const homography = computeHomography(srcPoints, quad);
  const invHomography = invertMatrix3(homography);

  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const px = bounds.x + x;
      const py = bounds.y + y;
      if (!pointInQuad({ x: px, y: py }, quad)) {
        continue;
      }
      const [sx, sy] = applyHomography(invHomography, px, py);
      if (sx < 0 || sy < 0 || sx >= srcWidth - 1 || sy >= srcHeight - 1) {
        continue;
      }
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = x0 + 1;
      const y1 = y0 + 1;
      const dx = sx - x0;
      const dy = sy - y0;

      const idx00 = (y0 * srcWidth + x0) * 4;
      const idx10 = (y0 * srcWidth + x1) * 4;
      const idx01 = (y1 * srcWidth + x0) * 4;
      const idx11 = (y1 * srcWidth + x1) * 4;

      const outIdx = (y * bounds.width + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        const v00 = srcData.data[idx00 + c] ?? 0;
        const v10 = srcData.data[idx10 + c] ?? 0;
        const v01 = srcData.data[idx01 + c] ?? 0;
        const v11 = srcData.data[idx11 + c] ?? 0;
        const v0 = v00 + (v10 - v00) * dx;
        const v1 = v01 + (v11 - v01) * dx;
        output.data[outIdx + c] = Math.round(v0 + (v1 - v0) * dy);
      }
    }
  }

  return { imageData: output, bounds };
};
