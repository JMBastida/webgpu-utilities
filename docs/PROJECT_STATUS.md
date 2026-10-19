# Project Status — Multi-Engine Browser OCR

_Snapshot date: 2026-10-19 · Branch: `main` @ `af56f74` (in sync with `origin/main`, clean working tree)_

## 1. Summary

A client-side, browser-only OCR app (TypeScript + Vite) with pluggable OCR engines. It also has an
**"Replace text in image"** feature: it translates the detected text locally with Bergamot (WASM),
erases the original text, and redraws the translation onto the image. The core OCR flow is
complete. Most recent work (Oct 13, PRs #1 and #2) finished and polished the image-replacement
pipeline and made its controls responsive.

| Area                         | Status                                   |
| ---------------------------- | ---------------------------------------- |
| OCR core (upload → OCR → overlay) | ✅ Functional                        |
| Tesseract.js engine          | ✅ Registered in UI                      |
| eSearch-OCR (PaddleOCR)      | ✅ Registered (WASM forced, WebGPU off)  |
| EasyOCR (ONNX)               | ✅ Registered (⚠️ debug mode on)         |
| Transformers.js engine       | ⚠️ Code + tests exist, **not registered in UI** |
| TrOCR engine                 | ❌ Removed (Apr 30)                      |
| Image text replacement       | ✅ Complete (Oct 13), editable, downloadable |
| Legacy translation panel     | ❌ Disabled (Apr 30); code still present  |
| Docs                         | ⚠️ Partly stale (see §6)                 |

## 2. Timeline

| Date        | Milestone |
| ----------- | --------- |
| 2026-01-15  | MVP blockers resolved; spec finalized |
| 2026-01-16/17 | eSearch-OCR local model hosting + IndexedDB caching |
| 2026-02-06  | Write-back quality pipeline phases 0–5 (presets, inpaint, contrast, RTL) |
| (Feb)       | CRAFT text detection added to Transformers engine |
| 2026-04-30  | Translation panel disabled, TrOCR removed |
| 2026-10-13  | New `src/translate-image/` pipeline finished (PR #1); responsive controls (PR #2) |

## 3. Architecture (current)

- **Entry**: [main.ts](../src/main.ts) → [app.ts](../src/app.ts) (~880 LOC, main orchestrator)
- **Engines**: [engine-factory.ts](../src/engines/engine-factory.ts) registry and
  [ocr-manager.ts](../src/ocr-manager.ts) lifecycle. Engines are lazy-loaded via dynamic `import()`.
- **UI**: `app-template.ts`, `app-elements.ts`, `engine-ui.ts`, `image-sources.ts`
  (file, URL, drag-and-drop), `overlay-renderer.ts`
- **Image replacement** (`src/translate-image/`):
  `regions` → `mask` / `ink` (text-ink rasterization) → `inpaint` (TS fallback) →
  `layout` (text fitting, RTL, no-space languages) → `warp` (non-rectangular text boxes) → `blend`
- **Translation**: [bergamot-translator.ts](../src/translation/bergamot-translator.ts), lazy-loaded;
  `public/bergamot/registry.json`; requires `coi-serviceworker.js` for `SharedArrayBuffer`
- **Utils**: preprocessing, paragraph grouping, IndexedDB model cache, feature detection,
  language maps

**Size**: about 7.5k LOC in `src/` and about 6k LOC in tests. There are 33 test files with
about 213 test cases (Vitest, JSDOM, fast-check).

## 4. Health Checks

| Check            | Result |
| ---------------- | ------ |
| `npm test`       | ⚠️ Not run: `node_modules` missing (`vitest: command not found`) |
| `npm run typecheck` | ⚠️ Not run: same reason |
| `npm run lint`   | ⚠️ Not run: same reason |
| `TODO/FIXME` in `src/` | None found |

> Run `npm install`, then `npm test && npm run typecheck && npm run lint` to confirm the build is green.

## 5. Issues / Technical Debt

1. **Transformers.js engine not wired into the UI.** `src/engines/transformers-engine.ts` has
   tests but is never registered in `registerDefaultEngines()` in `app.ts`. The README still lists
   it as an available engine.
2. **Orphaned legacy translation code.** `src/translation-controller.ts` and
   `src/utils/image-writeback.ts` (~1k LOC) are no longer imported by the app. Only
   `tests/image-writeback-fontsize.test.ts` still uses `image-writeback.ts`. The new
   `translate-image/` pipeline covers the same job. Decide whether to delete this code or archive it.
3. **EasyOCR runs with `debug: true, debugMode: 'compare'`** in production code (`app.ts`). This
   likely adds extra work and logging.
4. **eSearch WebGPU disabled** (MaxPool `ceil()` error). WASM fallback only.
5. **`app.ts` is large** (~880 LOC). Splitting out the image-replacement controller would improve
   maintainability.
6. **Inpainting uses only the TS fallback.** The OpenCV path described in the Feb decision log
   isn't present in `src/translate-image/inpaint/`.
7. **eSearch models are git-ignored.** `public/models/esearch/` contains only a README. The app
   relies on fetching models from Hugging Face, or you download them manually for offline use.
8. **Translation language source is hard-coded to `en`** by default in the replacement UI. It is
   not derived from the selected OCR language. `ocr-language-to-bergamot.ts` exists but should be
   checked to confirm it's used.

## 6. Documentation Drift

- **README**: lists Transformers.js as a selectable engine (it isn't). Clone URL is a placeholder.
- **AGENTS.md**: describes `translation-controller.ts` as active. It is now unused, and
  `src/translate-image/` isn't mentioned.
- **DECISION_LOG.md**: the latest entry is 2026-02-06. There are no entries for the Apr 30 removal
  of translation/TrOCR or the Oct 13 replacement pipeline. The "Next Steps" and MVP checklist are
  outdated (all unchecked).
- **SPECIFICATION.md** §8 checklist: unchecked even though the MVP is shipped.
- **WRITEBACK_IMPROVEMENT_PLAN.md**: marked complete, but it covers the legacy writer that has
  since been superseded.

## 7. Suggested Next Steps

1. `npm install` and confirm tests, typecheck and lint pass.
2. Decide on Transformers.js: register it in the UI or remove it (and update the README).
3. Remove or archive `translation-controller.ts` and `image-writeback.ts` and their tests.
4. Turn off EasyOCR debug mode, or put it behind a dev flag.
5. Add DECISION_LOG entries for 2026-04-30 and 2026-10-13. Update AGENTS.md and README.
6. Extract the image-replacement logic from `app.ts` into its own controller module.
