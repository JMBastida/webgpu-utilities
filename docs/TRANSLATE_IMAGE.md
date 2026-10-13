# Translate text in images

The OCR page can translate positioned OCR results and render them into a PNG in the browser. Image pixels stay in the browser; Bergamot downloads its language model on first use and caches it using the existing browser storage path.

## Use

1. Load an image and run OCR with an engine that returns positioned text items.
2. Choose the source and target language. The source language is preselected from the OCR engine when a mapping is available.
3. After OCR, the editable fields are available immediately. Choose a rendering preset and select **Replace and translate** to fill them using the local translation model.
4. Edit any region and select **Apply text edits** to rerender with your corrections, then download the PNG. Manual replacement works if model download fails or translated text does not fit.

The output keeps the original image dimensions. Text is grouped into paragraphs, erased around OCR geometry, and rendered into those regions. Where foreground ink is distinguishable from a locally interpolated surface, the eraser masks likely ink pixels and keeps nearby decoration; when that estimate is ambiguous it conservatively erases the OCR quad. The local TypeScript inpainting path does not require a paid service or optional native image library.

## Model access

Bergamot fetches model files from Mozilla's public model storage on first use and caches them in the browser. This project does not bundle or redistribute those model binaries. If the deployment origin cannot fetch the upstream assets, serve the same model files from that origin and set `VITE_BERGAMOT_MODEL_ASSET_BASE_URL=/bergamot/models/` before building. The configured URL is a prefix for the part of each upstream URL after `/models/`; for example, a source path `models/en-es/<model-version>/exported/model.enes.intgemm.alphas.bin.gz` must be available at `/bergamot/models/en-es/<model-version>/exported/model.enes.intgemm.alphas.bin.gz`. Host the model, vocabulary and lexicon files referenced by the registry, and review Mozilla's current model terms before deployment. The browser verifies HTTP success and, when the registry provides one, the uncompressed model checksum.

The project can also serve Tesseract language data from its own origin by setting `VITE_TESSERACT_LANG_PATH` (for example `/tesseract-data`), then placing the required traineddata files there. Tesseract's worker and core files are copied into the app build automatically.

## Rendering presets

- **Fast** uses the lightweight local fill and a one-pixel mask expansion.
- **Balanced** (default) uses local directional interpolation when the surface supports it, otherwise local propagation and smoothing; it expands the mask by two pixels.
- **High quality** uses the same local fill choices with a three-pixel mask expansion. It takes more processing.

All presets are local. The algorithm does not reconstruct arbitrary scenery or guarantee a font match. Tesseract font hints and eSearch source colors are retained when available; otherwise the text color is inferred only when foreground-color consistency is strong. Text is fitted to the detected rectangular paragraph region, with a single OCR item quadrilateral retaining its geometry for placement. Source font size is a guide: expansion is capped and contraction stops at a readable minimum. Long translations that cannot fit at that minimum fail with an explicit message instead of being silently clipped. Rotated multi-line paragraphs, curved surfaces, decorative fonts, and exact background reconstruction are not supported claims.

Synthetic local fixtures cover flat, gradient-with-pinstripes, textured, rotated, and Japanese-script content. Erasure matched the known clean flat fixture exactly; the gradient, rotated, and Japanese cases had low whole-image pixel error. On textured backgrounds the local inpainting still changes texture inside glyph strokes and may leave a faint surface mismatch. These results describe the checked fixtures, not arbitrary images. [Fixture comparison](translate-image-quality.png) shows the clean surface, original, output, and amplified erasure difference.

## Validation

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. The `translate-image` module accepts an `ImageData`, OCR items and dimensions, language codes, and an `ITextTranslator`; callers can inject a translator and rendering implementation for deterministic tests.

[Browser evidence](translate-image-browser.png) shows actual Tesseract OCR on a synthetic image, the local replacement/rendering path, and a manual text correction. The screenshot explicitly labels the translator as injected. In this cloud environment, the real Bergamot request for `https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/models/en-es/retrain_hr_fix_names_CUAEXUHoQum_cFqh-ZAryw/exported/vocab.enes.spm.gz` rejects in Chromium with `TypeError: Failed to fetch`; no Google HTTP status or response headers are exposed. A direct request to the equivalent Google JSON API media URL fails the same way, and `curl` reports `403 CONNECT tunnel failed` from the environment proxy. The same-origin URL mapping is unit tested, but model assets could not be downloaded from this environment, so serving them locally and running a real model translation were not tested. The UI reports a setup hint and the optional same-origin asset path is documented above.
