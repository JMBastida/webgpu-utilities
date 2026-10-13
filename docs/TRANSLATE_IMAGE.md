# Translate text in images

The OCR page can translate positioned OCR results and render them into a PNG in the browser. Image pixels stay in the browser; Bergamot downloads its language model on first use and caches it using the existing browser storage path.

## Use

1. Load an image and run OCR with an engine that returns positioned text items.
2. Choose the source and target language. The source language is preselected from the OCR engine when a mapping is available.
3. Choose a rendering preset and select **Replace and translate**.
4. Review the original and translated previews. Edit any region in the text fields and select **Apply text edits** to rerender with your corrections, then download the PNG.

The output keeps the original image dimensions. Text is grouped into paragraphs, erased only around OCR boxes, and rendered into those same regions. The local TypeScript inpainting path does not require a paid service or optional native image library.

## Model access

Bergamot fetches model files from Mozilla's public model storage on first use and caches them in the browser. This project does not bundle or redistribute those model binaries. If the deployment origin cannot fetch the upstream assets, serve the same model files from that origin and set `VITE_BERGAMOT_MODEL_ASSET_BASE_URL=/bergamot/models/` before building. The configured URL is a prefix for the part of each upstream URL after `/models/`; for example, a source path `models/en-es/<model-version>/exported/model.enes.intgemm.alphas.bin.gz` must be available at `/bergamot/models/en-es/<model-version>/exported/model.enes.intgemm.alphas.bin.gz`. Host the model, vocabulary and lexicon files referenced by the registry, and review Mozilla's current model terms before deployment. The browser verifies HTTP success and, when the registry provides one, the uncompressed model checksum.

The project can also serve Tesseract language data from its own origin by setting `VITE_TESSERACT_LANG_PATH` (for example `/tesseract-data`), then placing the required traineddata files there. Tesseract's worker and core files are copied into the app build automatically.

## Rendering presets

- **Fast** fills each masked text region with the average color around that region. It is quickest and works best on flat backgrounds.
- **Balanced** propagates nearby unmasked pixels into the mask and smooths the fill. This is the default.
- **High quality** uses a wider erase mask and a stronger text halo to improve legibility. It takes more processing and can erase a wider border around the detected text.

All presets are local. The algorithm does not reconstruct arbitrary scenery or guarantee a font match. Text is fitted to a rectangular paragraph region; a single OCR item with a quadrilateral keeps that geometry for placement. Long translations that cannot fit at the minimum supported font size fail with an explicit message instead of being silently clipped. Rotated multi-line paragraphs, curved surfaces, decorative fonts, and exact background reconstruction are not supported claims.

## Validation

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. The `translate-image` module accepts an `ImageData`, OCR items and dimensions, language codes, and an `ITextTranslator`; callers can inject a translator and rendering implementation for deterministic tests.

[Browser evidence](translate-image-browser.png) shows actual Tesseract OCR on a synthetic image, the local replacement/rendering path, and a manual text correction. The screenshot explicitly labels the translator as injected. In the cloud execution environment used for this change, the real Bergamot model request could not reach upstream storage, so browser verification of an actual model download and translation remains outstanding; the UI reports a setup hint and an optional same-origin asset path is documented above.
