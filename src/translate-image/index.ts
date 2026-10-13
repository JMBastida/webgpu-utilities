import type {
  Region,
  TranslateImageDebugStats,
  TranslateImageDebugStep,
  TranslateImageInput,
  TranslateImageOptions,
  TranslateImageOutput,
} from './types';
import { buildRegions } from './regions';
import { unionItemBounds, rasterizeItemsToMask, dilateMask } from './mask';
import type { Bounds } from './mask';
import { inpaintImage } from './inpaint';
import { getFontFamily, isCjkLanguage, isRtlLanguage, renderTextMasks } from './layout';
import { blendLayer, prepareTexture } from './blend';
import { createCanvas, getContext2d } from './canvas';
import { isRectQuad, rectifiedQuadSize, warpMaskToQuad } from './warp';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const luma = (r: number, g: number, b: number): number => 0.299 * r + 0.587 * g + 0.114 * b;

const chooseTextColor = (avgLuma: number): [number, number, number] =>
  avgLuma > 0.55 ? [20, 20, 20] : [245, 245, 245];

const normalizeBounds = (
  bbox: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number
): Bounds => {
  const x = clamp(Math.floor(bbox.x), 0, imageWidth - 1);
  const y = clamp(Math.floor(bbox.y), 0, imageHeight - 1);
  const maxX = clamp(Math.ceil(bbox.x + bbox.width), x + 1, imageWidth);
  const maxY = clamp(Math.ceil(bbox.y + bbox.height), y + 1, imageHeight);
  return { x, y, width: maxX - x, height: maxY - y };
};

const hasToBlob = (canvas: HTMLCanvasElement | OffscreenCanvas): canvas is HTMLCanvasElement =>
  typeof (canvas as HTMLCanvasElement).toBlob === 'function';

const toBlob = async (canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> => {
  if ('convertToBlob' in canvas) {
    return await canvas.convertToBlob({ type: 'image/png' });
  }
  if (!hasToBlob(canvas)) {
    throw new Error('Canvas blob export is not available.');
  }
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to encode translated image.'));
      }
    }, 'image/png');
  });
};

const cloneImageData = (image: ImageData): ImageData =>
  new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);

const imageDataToBlob = async (image: ImageData): Promise<Blob> => {
  const canvas = createCanvas(image.width, image.height);
  const context = getContext2d(canvas);
  context.putImageData(image, 0, 0);
  return await toBlob(canvas);
};

const maskToImageData = (
  mask: Uint8ClampedArray,
  bounds: Bounds,
  fullWidth: number,
  fullHeight: number
): ImageData => {
  const data = new Uint8ClampedArray(fullWidth * fullHeight * 4);
  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const value = mask[y * bounds.width + x] ?? 0;
      const idx = ((bounds.y + y) * fullWidth + (bounds.x + x)) * 4;
      data[idx] = value;
      data[idx + 1] = value;
      data[idx + 2] = value;
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, fullWidth, fullHeight);
};

const countMaskPixels = (mask: Uint8ClampedArray): number => {
  let count = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if ((mask[i] ?? 0) > 0) count += 1;
  }
  return count;
};

type RegionWithBounds = {
  region: Region;
  bounds: Bounds;
};

type InpaintGroup = {
  regions: RegionWithBounds[];
  hasOverlap: boolean;
};

const boundsOverlap = (a: Bounds, b: Bounds): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const boundsDistance = (a: Bounds, b: Bounds): number => {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const dx = Math.max(0, Math.max(a.x - bx2, b.x - ax2));
  const dy = Math.max(0, Math.max(a.y - by2, b.y - ay2));
  return Math.max(dx, dy);
};

const areBoundsClose = (a: Bounds, b: Bounds, distance: number): boolean =>
  boundsOverlap(a, b) || boundsDistance(a, b) <= distance;

const buildInpaintGroups = (regions: RegionWithBounds[], distance: number): InpaintGroup[] => {
  const visited = new Array(regions.length).fill(false);
  const groups: InpaintGroup[] = [];

  for (let i = 0; i < regions.length; i += 1) {
    if (visited[i]) continue;
    const group: RegionWithBounds[] = [];
    const queue: number[] = [i];
    visited[i] = true;
    let hasOverlap = false;

    while (queue.length > 0) {
      const index = queue.pop() ?? 0;
      group.push(regions[index]!);
      const currentBounds = regions[index]!.bounds;
      for (let j = 0; j < regions.length; j += 1) {
        if (visited[j]) continue;
        const nextBounds = regions[j]!.bounds;
        if (areBoundsClose(currentBounds, nextBounds, distance)) {
          if (boundsOverlap(currentBounds, nextBounds)) {
            hasOverlap = true;
          }
          visited[j] = true;
          queue.push(j);
        }
      }
    }

    groups.push({ regions: group, hasOverlap });
  }

  return groups;
};

export const translateImage = async (
  input: TranslateImageInput,
  options: TranslateImageOptions = {}
): Promise<TranslateImageOutput> => {
  if (!input.ocrItems || input.ocrItems.length === 0) {
    throw new Error('No OCR regions available for translation.');
  }
  if (!input.ocrSize.width || !input.ocrSize.height) {
    throw new Error('Invalid OCR dimensions.');
  }

  const debugEnabled = options.debug === true;
  const debugSteps: TranslateImageDebugStep[] = [];
  const pushStep = async (label: string, image: ImageData): Promise<void> => {
    if (!debugEnabled) return;
    const blob = await imageDataToBlob(image);
    debugSteps.push({ label, blob, width: image.width, height: image.height });
  };
  let debugStats: TranslateImageDebugStats | undefined;

  await pushStep('Original', input.original);

  const scaleX = input.original.width / input.ocrSize.width;
  const scaleY = input.original.height / input.ocrSize.height;
  const regions = buildRegions(input.ocrItems, {
    sourceLang: input.from,
    scaleX,
    scaleY,
  });
  if (regions.length === 0) {
    throw new Error('No OCR regions available for translation.');
  }

  if (input.manualTranslations && input.manualTranslations.length !== regions.length) {
    throw new Error('Edited replacement text no longer matches the detected regions.');
  }

  await Promise.all(
    regions.map(async (region, index) => {
      const sourceText = region.sourceLines.join('\n').trim();
      if (!sourceText) {
        region.translatedText = '';
        return;
      }
      const manualText = input.manualTranslations?.[index];
      if (input.manualTranslations) {
        region.translatedText = manualText?.trim() ?? '';
        return;
      }
      if (!input.translator) {
        throw new Error('A translation model is required when replacement text is not supplied.');
      }
      const response = await input.translator.translate({
        from: input.from,
        to: input.to,
        text: sourceText,
      });
      region.translatedText = response.text;
    })
  );

  const activeRegions = regions.filter(
    (region) => region.translatedText && region.translatedText.trim().length > 0
  );
  const eraseRegions = input.manualTranslations ? regions : activeRegions;
  if (activeRegions.length === 0 && !input.manualTranslations) {
    throw new Error('No translated text to render.');
  }

  const padding = 16;
  const quality = options.quality ?? 'balanced';
  const dilation = clamp(
    Math.round(
      (quality === 'fast' ? 0.025 : quality === 'high-quality' ? 0.075 : 0.05) *
        medianValue(eraseRegions.map((region) => Math.min(region.bbox.width, region.bbox.height)))
    ) + 1,
    quality === 'fast' ? 1 : 3,
    quality === 'high-quality' ? 20 : 16
  );
  const activeItems = eraseRegions.flatMap((region) => region.items);
  const inpaintOptions = {
    ...options.inpaint,
    quality,
    debug: options.inpaint?.debug ?? true,
  };
  const groupDistance = inpaintOptions.groupDistance ?? 12;
  const maxUnionAreaRatio = inpaintOptions.maxUnionAreaRatio ?? 0.3;
  const maxRegionSizePx =
    inpaintOptions.maxRegionSizePx ??
    Math.round(input.original.width * input.original.height * 0.4);

  const regionBounds = eraseRegions.map((region) => ({
    region,
    bounds: normalizeBounds(region.bbox, input.original.width, input.original.height),
  }));
  const inpaintGroups = buildInpaintGroups(regionBounds, groupDistance);

  if (debugEnabled) {
    const bounds = unionItemBounds(
      activeItems,
      input.original.width,
      input.original.height,
      padding
    );
    if (!bounds) {
      throw new Error('Unable to compute translation bounds.');
    }
    const rawMask = rasterizeItemsToMask(activeItems, bounds);
    const mask = dilateMask(rawMask, bounds.width, bounds.height, dilation);
    const rawMaskPixels = countMaskPixels(rawMask);
    const dilatedMaskPixels = countMaskPixels(mask);
    const outOfBoundsRegions = activeRegions.filter((region) => {
      const x2 = region.bbox.x + region.bbox.width;
      const y2 = region.bbox.y + region.bbox.height;
      return (
        x2 < 0 ||
        y2 < 0 ||
        region.bbox.x > input.original.width ||
        region.bbox.y > input.original.height
      );
    }).length;
    debugStats = {
      imageWidth: input.original.width,
      imageHeight: input.original.height,
      ocrWidth: input.ocrSize.width,
      ocrHeight: input.ocrSize.height,
      scaleX,
      scaleY,
      regionCount: eraseRegions.length,
      outOfBoundsRegions,
      bounds,
      rawMaskPixels,
      dilatedMaskPixels,
    };
    await pushStep(
      'Mask (raw)',
      maskToImageData(rawMask, bounds, input.original.width, input.original.height)
    );
    await pushStep(
      'Mask (dilated)',
      maskToImageData(mask, bounds, input.original.width, input.original.height)
    );
  }

  let output = new ImageData(
    new Uint8ClampedArray(input.original.data),
    input.original.width,
    input.original.height
  );

  let groupIndex = 0;
  for (const group of inpaintGroups) {
    groupIndex += 1;
    const groupItems = group.regions.flatMap((entry) => entry.region.items);
    const groupBounds = unionItemBounds(
      groupItems,
      input.original.width,
      input.original.height,
      padding
    );
    if (!groupBounds) continue;
    const groupRawMask = rasterizeItemsToMask(groupItems, groupBounds);
    const groupMask = dilateMask(groupRawMask, groupBounds.width, groupBounds.height, dilation);
    const groupMaskPixels = countMaskPixels(groupRawMask);
    const groupArea = groupBounds.width * groupBounds.height;
    const density = groupArea > 0 ? groupMaskPixels / groupArea : 0;
    const useUnion =
      group.regions.length > 1 &&
      (group.hasOverlap || (density >= maxUnionAreaRatio && groupArea <= maxRegionSizePx));

    if (useUnion) {
      if (debugEnabled && inpaintGroups.length <= 10) {
        await pushStep(
          `Mask (raw group ${groupIndex})`,
          maskToImageData(groupRawMask, groupBounds, input.original.width, input.original.height)
        );
        await pushStep(
          `Mask (dilated group ${groupIndex})`,
          maskToImageData(groupMask, groupBounds, input.original.width, input.original.height)
        );
      }
      output = await inpaintImage(output, groupMask, groupBounds, inpaintOptions);
      if (debugEnabled && inpaintGroups.length <= 5) {
        await pushStep(`Background (inpainted group ${groupIndex})`, output);
      }
      continue;
    }

    for (const entry of group.regions) {
      const regionItems = entry.region.items;
      const regionBounds = unionItemBounds(
        regionItems,
        input.original.width,
        input.original.height,
        padding
      );
      if (!regionBounds) continue;
      const regionRawMask = rasterizeItemsToMask(regionItems, regionBounds);
      const regionMask = dilateMask(
        regionRawMask,
        regionBounds.width,
        regionBounds.height,
        dilation
      );
      if (debugEnabled && group.regions.length <= 10) {
        await pushStep(
          `Mask (raw ${entry.region.id})`,
          maskToImageData(regionRawMask, regionBounds, input.original.width, input.original.height)
        );
        await pushStep(
          `Mask (dilated ${entry.region.id})`,
          maskToImageData(regionMask, regionBounds, input.original.width, input.original.height)
        );
      }
      output = await inpaintImage(output, regionMask, regionBounds, inpaintOptions);
      if (debugEnabled && group.regions.length <= 5) {
        await pushStep(`Background (inpainted ${entry.region.id})`, output);
      }
    }
  }

  if (debugEnabled) {
    await pushStep('Background (final)', output);
  }
  const targetFontFamily = getFontFamily(input.to);
  const rtl = isRtlLanguage(input.to);
  const alignment = rtl ? 'right' : 'left';
  const useCjkWrap = isCjkLanguage(input.to);

  for (const region of activeRegions) {
    const regionBounds = normalizeBounds(region.bbox, output.width, output.height);
    const layoutSize = isRectQuad(region.quad, regionBounds)
      ? { width: regionBounds.width, height: regionBounds.height }
      : rectifiedQuadSize(region.quad);
    const texture = prepareTexture(output, regionBounds);
    const avgLuma = texture.avgLuma;
    const styleText = region.style?.text;
    const textColor = styleText ?? chooseTextColor(avgLuma);
    const textIsDark = luma(textColor[0], textColor[1], textColor[2]) < 128;
    const shadowColor: [number, number, number] = textIsDark ? [255, 255, 255] : [0, 0, 0];
    const shadowBlur = quality === 'high-quality' ? 1.4 : quality === 'fast' ? 0 : 1.0;
    const shadowOffsetX = 0;
    const shadowOffsetY = 0;

    const layout = renderTextMasks({
      text: region.translatedText ?? '',
      width: layoutSize.width,
      height: layoutSize.height,
      fontFamily: targetFontFamily,
      align: alignment,
      direction: rtl ? 'rtl' : 'ltr',
      targetLineCount: region.sourceLineCount,
      isCjk: useCjkWrap,
      shadowBlur,
      shadowOffsetX,
      shadowOffsetY,
    });

    if (layout.shadowCanvas) {
      if (isRectQuad(region.quad, regionBounds)) {
        const shadowData = getContext2d(layout.shadowCanvas).getImageData(
          0,
          0,
          layout.shadowCanvas.width,
          layout.shadowCanvas.height
        );
        blendLayer(
          output,
          shadowData,
          {
            x: regionBounds.x,
            y: regionBounds.y,
            width: shadowData.width,
            height: shadowData.height,
          },
          { color: shadowColor, mode: 'shadow', textIsDark }
        );
      } else {
        const warpedShadow = warpMaskToQuad(layout.shadowCanvas, region.quad);
        blendLayer(output, warpedShadow.imageData, warpedShadow.bounds, {
          color: shadowColor,
          mode: 'shadow',
          textIsDark,
        });
      }
    }
    await pushStep(`After shadow: ${region.id}`, cloneImageData(output));

    if (isRectQuad(region.quad, regionBounds)) {
      const textData = getContext2d(layout.textCanvas).getImageData(
        0,
        0,
        layout.textCanvas.width,
        layout.textCanvas.height
      );
      blendLayer(
        output,
        textData,
        {
          x: regionBounds.x,
          y: regionBounds.y,
          width: textData.width,
          height: textData.height,
        },
        { color: textColor, mode: 'text', textIsDark, texture }
      );
    } else {
      const warpedText = warpMaskToQuad(layout.textCanvas, region.quad);
      blendLayer(output, warpedText.imageData, warpedText.bounds, {
        color: textColor,
        mode: 'text',
        textIsDark,
        texture: prepareTexture(output, warpedText.bounds),
      });
    }
    await pushStep(`After text: ${region.id}`, cloneImageData(output));
  }

  await pushStep('Final', output);

  const canvas = createCanvas(output.width, output.height);
  const context = getContext2d(canvas);
  context.putImageData(output, 0, 0);
  const blob = await toBlob(canvas);
  return {
    blob,
    regionTranslations: regions.map((region) => ({
      sourceText: region.sourceLines.join('\n'),
      text: region.translatedText ?? '',
    })),
    debug: debugEnabled
      ? { regions: activeRegions, steps: debugSteps, stats: debugStats }
      : undefined,
  };
};

const medianValue = (values: number[]): number => {
  if (values.length === 0) return 12;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
};
