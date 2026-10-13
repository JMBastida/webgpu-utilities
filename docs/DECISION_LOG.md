# Decision Log: Browser OCR Service

**Status**: Draft - Awaiting Decisions
**Last Updated**: 2026-01-15

### 2026-10-13: Keep text replacement local and conservative

**Decision**: Use a locally inferred foreground mask where its color is consistent with text, and fall back to the OCR quad when the surface is ambiguous or multiple unexplained foreground hues are present. Use directional interpolation only on smooth or strongly directional surfaces; otherwise use local propagation fill. Scale OCR font metadata with image coordinates, measure the final font style against actual glyph bounds, preserve source cap height and baseline where text fits, and show an actionable error when a translation cannot fit at a source-relative minimum.

**Rationale**:
- Broad OCR-box erasure damages surrounding gradients and fine decoration.
- Aggressive foreground segmentation mistakes textured backgrounds for ink, so mask confidence gates the narrower mask.
- Translation length varies; readable bounds and an editable failure are preferable to silently tiny or clipped text.
- The em-square/line-height estimate made short replacements visibly smaller than the source. Actual glyph bounds and baseline placement preserve hierarchy without imposing a fixed pixel-size floor.
- This stays in-browser and avoids remote image processing, paid services, and model dependency for manual replacement.

**Validation**: Synthetic fixtures cover flat, gradient/pinstripe, textured, rotated, and Japanese text. The textured fixture still shows local texture mismatch after glyph removal; exact restoration of arbitrary backgrounds is not claimed. See [translate-image documentation](TRANSLATE_IMAGE.md).

---

## 🚨 MVP BLOCKERS (Must Resolve Before First Implementation)

These decisions are essential to write any functional code. Without answers, engineers cannot proceed.

### 1. Core Data Contracts

#### 1.1 Input Format Specification
**Decision Needed**: What image formats will the `process()` method accept?

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| `ImageData` only | Simple, canvas-native | Requires caller to convert first | ⭐ **Start here for MVP** |
| `Blob + ImageData` | Flexible, handles file uploads | More adapter logic needed | Production upgrade |
| `ArrayBuffer + ImageData + Blob` | Maximum flexibility | Complex type guards needed | Overkill for MVP |

**MVP Decision**: ✅ **`ImageData` only**

**Rationale**:
- Canvas-native type, no conversion needed within OCR engine
- Forces clean separation: UI layer handles file upload → canvas → ImageData, OCR layer focuses purely on processing
- Tesseract.js and Transformers.js both accept ImageData natively
- Can easily extend interface later: `process(data: ImageData | Blob)` without breaking existing code

---

#### 1.2 Output Format Specification
**Decision Needed**: What does `process()` return?

| Option | Structure | Use Case | Recommendation |
|--------|-----------|----------|----------------|
| Plain text string | `Promise<string>` | Simple text extraction | ⭐ **MVP sufficient** |
| Structured result | `Promise<OCRResult>` with `{ text, confidence, language }` | Quality metrics needed | Consider for MVP+ |
| Full bounding boxes | `Promise<OCRResult>` with `{ text, words: Array<{text, bbox, confidence}> }` | Complex layout analysis | Production feature |

**MVP Decision**: ✅ **Plain text string (`Promise<string>`)**

**Rationale**:
- Satisfies 90% of OCR use cases: "What text is in this image?"
- Zero serialization overhead for Web Worker communication
- Easier to test and debug
- Can upgrade to structured format later without breaking the interface contract (engines can internally return structured data, just extract `.text` property for now)

**Production Upgrade Path**:
```typescript
// When needed, change to:
interface OCRResult {
  text: string;
  confidence?: number;      // 0-100 quality score
  language?: string;         // ISO 639-1 code (e.g., 'en')
}
// Return type becomes Promise<OCRResult>
```

---

#### 1.3 Engine Selection
**Decision Needed**: Which specific OCR libraries are we implementing?

**Primary Engine** (Fast option):
- [x] Tesseract.js (WASM port of Tesseract)
- [ ] Custom lightweight solution
- [ ] Other: ________________

**Secondary Engine** (High accuracy option):
- [x] Transformers.js with TrOCR model (post-MVP)
- [ ] Custom ONNX model (specify which): ________________
- [ ] Other: ________________

**MVP Decision**: ✅ Start with **Tesseract.js only**

**Rationale**:
- **Proven stability**: 10M+ weekly npm downloads, battle-tested in production
- **No WebGPU dependency**: Pure WASM, works on all modern browsers including older Safari
- **Comprehensive documentation**: Extensive examples and community support
- **Language support**: 100+ languages pre-trained (English for MVP, easy to expand)
- **Reasonable performance**: 2-5 seconds for typical documents on modern hardware
- **Small initial bundle**: Core library ~2MB, English traineddata ~4MB (acceptable for web)

**Implementation Details**:
- Package: `tesseract.js` v5.x
- Worker setup: Use built-in worker support (`createWorker()`)
- Model loading: English (`eng.traineddata`) from CDN with IndexedDB caching
- Initialization: Call `worker.loadLanguage('eng')` then `worker.initialize('eng')`

**Post-MVP**: Add Transformers.js (TrOCR) as second engine to validate Strategy Pattern. This will require WebGPU fallback logic.

**Integration Analysis** (researched 2026-01-15):

After evaluating modern alternatives, Tesseract.js remains the best MVP choice:

| Library | npm Package | Integration | Bundle Size | Status |
|---------|-------------|-------------|-------------|---------|
| **Tesseract.js** | ✅ `tesseract.js` | ⭐ Easiest | 4-6MB | 431K DL/week |
| **tesseract-wasm** | ✅ `tesseract-wasm` | ⭐ Easy | 2.1MB | Alternative |
| **Transformers.js** | ✅ `@huggingface/transformers` | ⭐ Easy | Variable | Second engine |
| **Scribe.js** | ✅ `scribe.js-ocr` | ⭐ Easy | Larger | If need PDF |
| **client-side-ocr** | ⚠️ `client-side-ocr` | ⚠️ Unclear | Medium | Sparse docs |
| **ocrs** | ❌ Manual build | ❌ Complex | Small | Rust - no npm |
| **docTR** | ❌ No package | ❌ Demo only | Large | Not usable |

**Why Tesseract.js + Transformers.js**:
- Both are true npm libraries with `npm install` support
- Well-documented, production-ready APIs
- Fit perfectly into Strategy Pattern (both can be wrapped in `IOCREngine`)
- Large communities and active maintenance
- Clear upgrade path from traditional (Tesseract) to modern (Transformers)

---

#### 1.4 Minimum Browser Support
**Decision Needed**: What browsers MUST work for MVP?

| Browser | Version | Required Features | MVP Support? |
|---------|---------|-------------------|--------------|
| Chrome/Edge | 90+ | WASM, Web Workers, IndexedDB | [x] Yes [ ] No |
| Firefox | 88+ | WASM, Web Workers, IndexedDB | [x] Yes [ ] No |
| Safari | 15+ | WASM, Web Workers, IndexedDB | [x] Yes [ ] No |
| Mobile Chrome | 90+ | Same as desktop | [ ] Yes [x] No (defer) |
| Mobile Safari | 15+ | Same as desktop | [ ] Yes [x] No (defer) |

**WebGPU Requirement for MVP**:
- [ ] Required (blocks older devices)
- [ ] Optional (CPU fallback acceptable)
- [x] Not needed for MVP (Tesseract.js uses WASM only)

**MVP Decision**: ✅ **Desktop browsers only: Chrome 90+, Firefox 88+, Safari 15+**

**Rationale**:
- These versions have stable WASM, Web Workers, and IndexedDB support (released ~2021)
- Covers 95%+ of desktop users on evergreen browsers
- **Mobile deferred to post-MVP** because:
  - Mobile OCR has different UX constraints (camera integration, smaller screens)
  - Memory management is more critical (lower RAM limits)
  - Performance testing needed on mid-range devices
  - Requires separate testing matrix

**Feature Detection**:
```javascript
// Add to app initialization
const isSupported =
  typeof WebAssembly !== 'undefined' &&
  typeof Worker !== 'undefined' &&
  typeof indexedDB !== 'undefined';

if (!isSupported) {
  showError('Browser not supported. Please use Chrome 90+, Firefox 88+, or Safari 15+');
}
```

**Post-MVP**: Test and optimize for mobile browsers (memory management, responsive UI, camera capture)

---

#### 1.5 Storage Strategy (Minimum Viable)
**Decision Needed**: What gets cached for MVP?

- [x] **Model files only** (essential for performance) ← **Recommended MVP**
- [ ] Model files + OCR results (adds complexity)
- [ ] Nothing (re-download every time - not viable)

**Cache Key Strategy**:
- [ ] Simple: `${engineId}-${modelName}`
- [x] Versioned: `${engineId}-${modelName}-v${version}`

**MVP Decision**: ✅ **Cache model files only, with versioned keys**

**Rationale**:
- **Critical for UX**: English traineddata is ~4MB. Without caching, users wait 2-10 seconds on every page load.
- **Storage is cheap**: 4MB is negligible (typical quota: 50MB-1GB per origin)
- **Versioned keys prevent stale data**: When Tesseract.js updates models, new version auto-downloads
- **Privacy-friendly**: No user data persisted, only public model files
- **Simple to implement**: Tesseract.js has built-in caching support via `cacheMethod: 'refresh'`

**Implementation**:
```javascript
// Tesseract.js automatically uses IndexedDB when available
const worker = await createWorker('eng', 1, {
  cacheMethod: 'refresh',  // Use cached if available, refresh if stale
  cachePath: '.',          // Default IndexedDB location
});
```

**Cache Key Format**: `tesseract-cache-eng-v5.0.0` (handled automatically by library)

**Manual Cache Clear** (for testing):
```javascript
// Add a "Clear Cache" button that calls:
indexedDB.deleteDatabase('tesseract-cache');
```

**Post-MVP**: Consider caching OCR results for duplicate image detection (requires privacy analysis)

---

### 2. User Experience (MVP Minimums)

#### 2.1 Loading State Communication
**Decision Needed**: How do we inform users during the `load()` phase?

**MVP Requirement**: At minimum, show a binary state:
- [x] Simple boolean callback: `onLoadingChange(isLoading: boolean)`
- [ ] Progress percentage: `onProgress(percent: number, message: string)` (post-MVP)

**MVP Decision**: ✅ **Simple boolean loading state**

**Rationale**:
- **Sufficient for MVP**: Binary state covers the essential feedback: "System is working vs. ready"
- **Simple to implement**: No complex progress tracking logic needed
- **Tesseract.js emits detailed progress events**, but interpreting them requires domain knowledge (what does "recognizing text at 45%" mean to users?)
- **Good UI patterns exist**: Spinner + "Loading OCR engine..." message is clear and familiar

**MVP Implementation**:
```typescript
interface IOCREngine {
  id: string;
  load(): Promise<void>;
  process(data: ImageData): Promise<string>;
  destroy(): Promise<void>;
  isLoading: boolean;  // Add this property
}

// In UI:
if (engine.isLoading) {
  showSpinner('Loading OCR engine...');
} else {
  hideSpinner();
}
```

**Post-MVP Enhancement**: Add granular progress for better UX during 4MB model download:
```typescript
interface IOCREngine {
  onProgress?: (progress: { percent: number; status: string }) => void;
}

// Shows: "Downloading model... 67%" → "Initializing engine..." → "Ready"
```

---

#### 2.2 Engine Switching Behavior (MVP Scope)
**Decision Needed**: Is runtime engine switching required for MVP?

**Scenario**: User loads page, processes images with Engine A, then wants to try Engine B.

| Approach | MVP Complexity | User Impact |
|----------|----------------|-------------|
| **Page reload required** | Low (no switching logic) | Acceptable for MVP |
| **Hot-swap (destroy A, load B)** | Medium (implement cleanup) | Better UX, more complexity |
| **Pre-load both engines** | High (memory management) | Not MVP scope |

**MVP Decision**: ✅ **Not applicable - single engine only. Post-MVP: Page reload acceptable initially.**

**Rationale**:
- **MVP is Tesseract.js only**: No engine switching exists in MVP scope
- **When adding 2nd engine (post-MVP)**: Page reload is acceptable because:
  - Engine selection is typically a one-time choice per session
  - Users don't frequently alternate between engines on the same document
  - Avoids complex memory management and cleanup logic
  - Can be upgraded to hot-swapping later once multi-engine architecture is validated

**MVP Implementation**:
```typescript
// Single engine, no switching needed
const manager = new OCRManager();
await manager.setEngine('tesseract');  // Called once at app init
```

**Post-MVP (Multi-Engine) Implementation**:
```html
<!-- Simple dropdown that reloads page -->
<select onchange="location.href = '?engine=' + this.value">
  <option value="tesseract">Fast (Tesseract)</option>
  <option value="transformers">High Accuracy (Transformers.js)</option>
</select>

<script>
  const params = new URLSearchParams(location.search);
  const engine = params.get('engine') || 'tesseract';
  await manager.setEngine(engine);
</script>
```

**Future Enhancement**: Once multi-engine works via reload, implement hot-swapping:
```typescript
// Proper cleanup ensures memory doesn't leak
await manager.setEngine('transformers'); // Automatically destroys Tesseract first
```

---

## 🔧 PRODUCTION-GRADE REQUIREMENTS (Post-MVP)

These are important for reliability and scalability but can be deferred for initial proof-of-concept.

### 3. Error Handling & Resilience

#### 3.1 WASM Memory Exhaustion
**Problem**: Large images or models can exhaust WASM heap (2GB-4GB limit).

**Production Requirement**: Define behavior when `load()` or `process()` fails with OOM.

**Options**:
1. Fail gracefully with error message: "Image too large. Try a smaller image."
2. Automatic image downscaling retry: Resize to max dimension (e.g., 2000px) and retry
3. Chunk processing: Split large images into tiles (complex)

**Decision**: ________________
**Timeline**: ________________

---

#### 3.2 Invalid/Corrupt Image Handling
**Problem**: User uploads non-image file or corrupt data.

**Production Requirement**: Validate input before expensive processing.

**Strategy**:
- [ ] Pre-flight check: Validate image can be decoded to canvas
- [ ] Engine-level try/catch with user-friendly error
- [ ] Graceful degradation: Skip invalid images in batch processing

**Decision**: ________________
**Timeline**: ________________

---

#### 3.3 WebGPU Unavailability Fallback
**Problem**: WebGPU support is inconsistent (Safari limited, Firefox behind flag).

**Production Requirement**: Define fallback chain.

**Proposed Chain**:
```
WebGPU (if available)
  → WebGL backend (via ONNX Runtime Web)
    → CPU WASM (slow but universal)
```

**Decision**:
- [ ] Implement full chain
- [ ] WebGPU → CPU WASM only (skip WebGL)
- [ ] Detect capability and block unsupported browsers with message

**Timeline**: ________________

---

### 4. Concurrency & Performance

#### 4.1 Concurrency Model
**Problem**: What happens if user uploads 10 images at once?

**Production Options**:

| Model | Implementation | Use Case |
|-------|----------------|----------|
| **Single-threaded queue** | Queue images, process serially | Simple, predictable memory usage |
| **Worker pool (N=2-4)** | Process N images in parallel | Faster, higher memory usage |
| **Adaptive** | Start serial, scale to pool if system allows | Complex but optimal |

**Decision**: ________________
**Timeline**: ________________

---

#### 4.2 Mid-Processing Engine Switch
**Problem**: User clicks "Switch to Transformers.js" while Tesseract is processing image #3 of 10.

**Production Behavior**:
- [ ] Block switch until current job finishes
- [ ] Abort current job, switch immediately (requires cancellation mechanism)
- [ ] Queue switch for after current batch

**Decision**: ________________
**Timeline**: ________________

---

#### 4.3 Tab Backgrounding
**Problem**: Browser throttles Web Workers when tab is not visible.

**Production Strategy**:
- [ ] Accept slowdown (no action needed)
- [ ] Warn user: "Processing may slow down in background tabs"
- [ ] Use Shared Workers to maintain performance (complex, rare use case)

**Decision**: ________________
**Timeline**: ________________

---

### 5. Storage & Caching (Production-Grade)

#### 5.1 Cache Invalidation Strategy
**Problem**: Model files update. How do we force re-download?

**Production Approaches**:
- [ ] **Version-based**: Cache key includes version `tesseract-eng-v4.0.0`
- [ ] **Time-based**: Evict cache after N days
- [ ] **Manual**: User clears cache via settings panel
- [ ] **Hybrid**: Version-based + manual clear option

**Decision**: ________________
**Timeline**: ________________

---

#### 5.2 Storage Quota Exceeded
**Problem**: User has limited disk space. IndexedDB write fails.

**Production Behavior**:
- [ ] Fail with error: "Cannot cache model. Clear browser storage."
- [ ] Fallback to in-memory only (re-download each session)
- [ ] LRU eviction: Delete oldest cached model to make space

**Decision**: ________________
**Timeline**: ________________

---

#### 5.3 Cache Result Storage
**Problem**: Should we cache OCR results (text output) or only models?

**Trade-offs**:
| Caching Results | Pros | Cons |
|-----------------|------|------|
| **Yes** | Instant re-process of same image | Privacy concern, storage bloat |
| **No** | Simpler, user privacy-friendly | Re-process costs time |

**Decision**: ________________
**Timeline**: ________________

---

### 6. Advanced Features (Post-MVP Roadmap)

#### 6.1 Multi-Language Support
**Decision Needed**: How to handle non-English text?

**Complexity**: Each language may require separate model files (50MB+ per language).

**Approach**:
- [ ] Auto-detect language (requires detection model)
- [ ] User selects language from dropdown
- [ ] English-only for MVP, expand later

**Timeline**: ________________

---

#### 6.2 Preprocessing Pipeline
**Decision Needed**: Should the system auto-enhance images?

**Common Enhancements**:
- Grayscale conversion
- Contrast adjustment
- Deskew (rotation correction)
- Noise removal

**Options**:
- [ ] Built into each engine adapter
- [ ] Shared preprocessing utility
- [ ] User-controlled (advanced mode)
- [ ] None (expect clean input)

**Decision**: ________________
**Timeline**: ________________

---

#### 6.3 Batch/Multi-Page Documents
**Decision Needed**: Support PDF or multi-image uploads?

**Complexity**: Adds file parsing, page management UI, progress tracking per page.

**Decision**:
- [ ] MVP: Single images only
- [ ] Post-MVP: Add batch support

**Timeline**: ________________

---

#### 6.4 Telemetry & Observability
**Decision Needed**: What metrics matter for production debugging?

**Suggested Metrics**:
- Engine load time (by browser/device)
- Processing time per image (by size/engine)
- Error rates by category
- Cache hit rate

**Implementation**:
- [ ] Console logging only (MVP)
- [ ] Structured logging to service
- [ ] Browser-local analytics dashboard

**Decision**: ________________
**Timeline**: ________________

---

## 📝 Decision Template

When resolving an item, fill out:

```markdown
### [Item Number] [Title]
**Date Decided**: YYYY-MM-DD
**Decided By**: [Name/Team]
**Decision**: [Clear statement]
**Rationale**: [Why this choice over alternatives]
**Implementation Notes**: [Gotchas, references, etc.]
**Status**: ✅ Implemented | 🚧 In Progress | 📋 Planned
```

---

## Quick Reference: MVP vs Production

| Feature | MVP ✅ | Production 🔧 |
|---------|-----|------------|
| Input format | `ImageData` only | + `Blob` support |
| Output format | Plain `string` | Structured with confidence |
| Engines | **Tesseract.js only** | + Transformers.js (TrOCR) |
| Browser support | Desktop: Chrome 90+, Firefox 88+, Safari 15+ | + Mobile browsers |
| Error handling | Basic try/catch, show error message | Graceful degradation, retries |
| Concurrency | Single image at a time | Queue or worker pool |
| Caching | Model files with versioned keys (IndexedDB) | + quota management, result caching |
| WebGPU | Not needed (WASM only) | Required for Transformers.js, fallback chain |
| Loading UX | Boolean `isLoading` state | Progress percentage with status messages |
| Engine switching | Not applicable (single engine) | Page reload → hot-swap later |
| Language support | English only | Multi-language detection |
| Preprocessing | None (expect clean input) | Auto-enhance pipeline |
| Multi-page | Single images only | PDF/batch support |
| Telemetry | Console logs | Structured metrics |

---

## 📋 MVP Decisions Summary (Ready to Implement)

All MVP blockers have been resolved. You can now proceed with implementation using these decisions:

### Core Architecture
- **Engine**: Tesseract.js v5.x (WASM, no WebGPU needed)
- **Input**: `ImageData` only
- **Output**: `Promise<string>` (plain text)
- **Browser Support**: Desktop only (Chrome 90+, Firefox 88+, Safari 15+)
- **Loading State**: Boolean `isLoading` property
- **Caching**: Model files only, automatic via Tesseract.js IndexedDB caching

### Interface Contract
```typescript
interface IOCREngine {
  id: string;
  load(): Promise<void>;
  process(data: ImageData): Promise<string>;
  destroy(): Promise<void>;
  isLoading: boolean;
}
```

### Implementation Checklist
- [ ] Install `tesseract.js` package
- [ ] Create `TesseractEngine` class implementing `IOCREngine`
- [ ] Create `OCRManager` factory class
- [ ] Implement feature detection (WASM, Workers, IndexedDB)
- [ ] Build simple UI: file upload → canvas → ImageData → OCR
- [ ] Add loading spinner with "Loading OCR engine..." message
- [ ] Test on Chrome, Firefox, Safari (desktop)
- [ ] Validate model caching works (check IndexedDB in DevTools)

### Validation Criteria
MVP is complete when:
1. User can upload an image in supported browsers
2. Text is extracted and displayed (2-5 seconds for typical document)
3. Second page load uses cached model (sub-second init)
4. Memory is released properly (worker terminates on page close)

---

---

## Next Steps

1. ✅ **Review Session**: All MVP blockers resolved (2026-01-15)
2. ✅ **Update Specification**: `SPECIFICATION.md` updated with concrete implementations
3. **Begin Implementation**: Follow MVP checklist in `SPECIFICATION.md` Section 8
4. **Prototype**: Build Tesseract.js engine to validate architecture
5. **Validate**: Test on target browsers, verify caching and cleanup
6. **Expand**: Add Transformers.js as second engine to validate Strategy Pattern

---

## Changes Log

### 2026-02-06: Translated Image Write-Back Quality Pipeline

**Decision**: Ship phased write-back improvements with selectable quality presets (`fast`, `balanced`, `high-quality`).

**Rationale**:
- Earlier write-back used rectangular fill + center text rendering, which produced visible artifacts.
- Geometry-aware line rendering and baseline placement improve natural layout retention.
- Optional OpenCV inpainting provides better background restoration when runtime is available, with stable fallback behavior when not.
- WCAG-based contrast selection, RTL direction handling, and optional halo stroke improve multilingual readability.

**Status**: ✅ Implemented across `src/utils/image-writeback.ts`, `src/translation-controller.ts`, and related tests.

### 2026-01-17: eSearch-OCR Model Caching

**Decision**: Implement persistent caching for eSearch-OCR models using `ModelCache` (IndexedDB).

**Rationale**:
- Unlike Tesseract.js, `esearch-ocr` implementation does not automatically handle persistent caching of model files.
- Switching languages or re-initializing the engine triggered redundant network requests.
- Integrated the existing `ModelCache` utility to store `.onnx` and dictionary files in IndexedDB, preventing re-downloads.

**Status**: ✅ Implemented in `src/engines/esearch-engine.ts`.

### 2026-01-16: eSearch-OCR Model Hosting Strategy

**Decision**: Host model files locally in `public/models/esearch/` with manual download

**Rationale**:
- **Local hosting preferred for MVP**: Simplest setup, no CORS issues, fastest load times
- **Manual download acceptable**: ~7 MB one-time download is reasonable for developers
- **Git-ignored**: Model files (*.onnx, *.txt) excluded from version control to keep repo small
- **Documentation-first**: Clear README with download instructions ensures reproducibility

**Model Files** (from eSearch-OCR v4.0.0):
| File | Size | Purpose |
|------|------|---------|
| `det.onnx` | ~2.3 MB | Text detection (DBNet) |
| `rec.onnx` | ~4.5 MB | Text recognition (CRNN) |
| `ppocr_keys_v1.txt` | ~30 KB | Character dictionary (6,623 chars) |

**Alternative Hosting Options** (documented for production):
1. **jsDelivr CDN**: `https://cdn.jsdelivr.net/gh/xushengfeng/eSearch-OCR@4.0.0/`
   - Pro: Free, reliable, cached globally
   - Con: CORS may need verification, dependent on upstream repo
2. **Self-hosted S3/CloudFront**: Upload to own infrastructure
   - Pro: Full control, no external dependencies
   - Con: Cost, maintenance overhead
3. **GitHub Releases direct**: Direct links to release assets
   - Pro: Simple, free, versioned
   - Con: May have rate limits for high traffic

**Implementation**:
- Directory structure: `public/models/esearch/`
- Model paths in code: `/models/esearch/{det.onnx,rec.onnx,ppocr_keys_v1.txt}`
- Documentation: `public/models/esearch/README.md`

### 2026-01-15: All MVP Blockers Resolved

**Decisions Made**:
- ✅ Input format: `ImageData` only
- ✅ Output format: Plain `Promise<string>`
- ✅ Engine: Tesseract.js v5.x (npm: `tesseract.js`)
- ✅ Browser support: Desktop only (Chrome 90+, Firefox 88+, Safari 15+)
- ✅ Caching: Model files with versioned keys (automatic via Tesseract.js)
- ✅ Loading state: Boolean `isLoading` property
- ✅ Engine switching: N/A for MVP (single engine only)

**Research Completed**:
- Evaluated 7 modern OCR alternatives to Tesseract.js
- Confirmed Tesseract.js best for MVP (proven, easy integration)
- Selected Transformers.js for second engine (modern, WebGPU, future-proof)

**Documentation Updated**:
- `SPECIFICATION.md`: Added concrete implementations, feature detection, checklists
- `DECISION_LOG.md`: Added integration analysis, MVP vs Production comparison

**Status**: ✅ Ready to implement. See `SPECIFICATION.md` Section 8 for checklist.

---

**Document Owner**: ________________
**Review Cadence**: Weekly during MVP development, then monthly for production items
