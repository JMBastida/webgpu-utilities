# Translate text in images

The OCR page can translate positioned OCR results and render them into a PNG in the browser. Image pixels stay in the browser; Bergamot downloads its language model on first use and caches it using the existing browser storage path.

## Use

1. Load an image and run OCR with an engine that returns positioned text items.
2. Choose the source and target language. The source language is preselected from the OCR engine when a mapping is available.
3. Choose a rendering preset and select **Replace and translate**.
4. Review the original and translated previews, then download the PNG.

The output keeps the original image dimensions. Text is grouped into paragraphs, erased only around OCR boxes, and rendered into those same regions. The local TypeScript inpainting path does not require a paid service or optional native image library.

## Rendering presets

- **Fast** fills each masked text region with the average color around that region. It is quickest and works best on flat backgrounds.
- **Balanced** propagates nearby unmasked pixels into the mask and smooths the fill. This is the default.
- **High quality** uses a wider erase mask and a stronger text halo to improve legibility. It takes more processing and can erase a wider border around the detected text.

All presets are local. The algorithm does not reconstruct arbitrary scenery or guarantee a font match. Text is fitted to a rectangular paragraph region; a single OCR item with a quadrilateral keeps that geometry for placement. Long translations that cannot fit at the minimum supported font size fail with an explicit message instead of being silently clipped. Rotated multi-line paragraphs, curved surfaces, decorative fonts, and exact background reconstruction are not supported claims.

## Validation

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. The `translate-image` module accepts an `ImageData`, OCR items and dimensions, language codes, and an `ITextTranslator`; callers can inject a translator and rendering implementation for deterministic tests.
