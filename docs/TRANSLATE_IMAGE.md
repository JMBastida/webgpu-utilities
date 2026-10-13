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

All presets are local. The algorithm does not reconstruct arbitrary scenery or guarantee a font match. Text color is inferred from original RGB pixels when foreground-color consistency is strong; this takes precedence over OCR color hints that may come from grayscale preprocessing. When the original-pixel estimate is ambiguous, the renderer chooses a contrasting color from the local background instead of trusting an unverified OCR hint. If substantial separated secondary ink is distinct from the dominant stroke, erasure falls back to the OCR quad so lower-contrast lettering is not silently left behind; decoration inside that box can also be erased, while pixels outside the OCR geometry remain untouched. Text is fitted to the detected paragraph region, with a single OCR item quadrilateral retaining its geometry for placement. Tesseract font size is scaled with the OCR coordinates, and size fitting measures the exact final weight/slant using actual glyph bounds and the union of those glyph bounds at their rendered line baselines. A shorter translation keeps the source size when it fits; a longer one contracts only as needed to fit the region. Compact boxes align the final text baseline with the source box bottom, while unusually tall paragraph boxes center the text. There is no fixed 14 px floor for text in native image pixels. If text cannot fit at the source-relative minimum size, it fails with an explicit error instead of being silently clipped. The render region does not expand beyond detected OCR geometry. Rotated multi-line paragraphs, curved surfaces, decorative fonts, and exact background reconstruction are not supported claims.

Synthetic local fixtures cover flat, gradient-with-pinstripes, textured, rotated, Japanese-script, and same-length content. Browser pixel bounds compare the source and replacement glyph cores using a fixed color threshold; for unrotated Latin rows, the lower edge row is the baseline. The previous output is from commit `b77af6d`.

| Fixture | Source → replacement | Source glyph height / baseline | Previous output | Updated output |
| --- | --- | ---: | ---: | ---: |
| Flat | OPEN → SALUDO | 31 px / 165 | 19 px / 154 | 21 px / 165 |
| Gradient | OPEN → ABIERTO | 31 px / 165 | 19 px / 154 | 26 px / 165 |
| Texture | HELLO WORLD → HI | 31 px / 165 | 19 px / 154 | 32 px / 165 |
| Rotated | OPEN → VENTA | 65 px / 191 | 47 px / 168 | 67 px / 191 |
| Japanese | OPEN TODAY → ただいま営業中です | 23 px / 165 | 29 px / 133 | 32 px / 170 |
| Similar length | OPEN → HOLA | 31 px / 165 | 19 px / 154 | 31 px / 165 |

The flat and gradient translations remain smaller because their longer words cannot fit the original one-line OCR width at source height; the renderer preserves their baseline. The same-length `HOLA` output and short `HI` replacement now keep the source glyph height and baseline. Rotated `VENTA` matches the source ink height and lower edge. The Japanese box is much taller than its source glyph, so the replacement is vertically centered. Erasure matched the known clean flat fixture exactly; the textured background still shows a small local smoothing mismatch inside erased glyph strokes. These results describe the checked fixtures, not arbitrary images. [Updated fixture comparison](translate-image-quality.png) includes the prior output from `b77af6d`, current output, known clean surfaces, and amplified erasure differences. [Previous comparison](translate-image-quality-before.png) preserves the original regression artifact.

## Validation

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. The `translate-image` module accepts an `ImageData`, OCR items and dimensions, language codes, and an `ITextTranslator`; callers can inject a translator and rendering implementation for deterministic tests.

[Browser evidence](translate-image-browser.png) shows actual Tesseract OCR on a synthetic image, the local replacement/rendering path, and a manual text correction. The screenshot explicitly labels the translator as injected. In this cloud environment, the real Bergamot request for `https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/models/en-es/retrain_hr_fix_names_CUAEXUHoQum_cFqh-ZAryw/exported/vocab.enes.spm.gz` rejects in Chromium with `TypeError: Failed to fetch`; no Google HTTP status or response headers are exposed. A direct request to the equivalent Google JSON API media URL fails the same way, and `curl` reports `403 CONNECT tunnel failed` from the environment proxy. The same-origin URL mapping is unit tested, but model assets could not be downloaded from this environment, so serving them locally and running a real model translation were not tested. The UI reports a setup hint and the optional same-origin asset path is documented above.
