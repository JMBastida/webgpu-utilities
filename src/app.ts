import { FeatureDetector } from '@/utils/feature-detector';
import { EngineFactory } from '@/engines/engine-factory';
import { OCRManager } from '@/ocr-manager';
import { ImageProcessor } from '@/utils/image-processor';
import {
  createInvalidImageError,
  createProcessingFailedError,
  createUnsupportedBrowserError,
  formatErrorMessage,
  logError,
} from '@/utils/error-handling';
import { OCRError } from '@/types/ocr-errors';
import type { OCRResult } from '@/types/ocr-engine';
import { ENGINE_CONFIGS } from '@/types/ocr-models';
import { getAppTemplate } from '@/app-template';
import { getAppElements } from '@/app-elements';
import { drawOcrBoxes } from '@/overlay-renderer';
import { createEngineUiController } from '@/engine-ui';
import { createImageSourceController } from '@/image-sources';
import type { ITextTranslator } from '@/types/translation';
import { BERGAMOT_LANGUAGES, DEFAULT_TRANSLATION_TO } from '@/utils/translation-languages';
import { mapOcrLanguageToBergamot } from '@/utils/ocr-language-to-bergamot';

const formatErrorWithCauses = (error: unknown): string => {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error && !messages.includes(current.message)) {
    messages.push(current.message);
    current = (current as Error & { cause?: unknown }).cause;
  }
  return messages.filter(Boolean).join(' Cause: ') || 'Image replacement failed.';
};
import type {
  TranslateImageInput,
  TranslateImageOptions,
  TranslateImageOutput,
} from '@/translate-image/types';

type Stage = 'idle' | 'loading' | 'processing' | 'complete' | 'error';

export interface AppOptions {
  root?: HTMLElement | null;
  featureDetector?: FeatureDetector;
  imageProcessor?: ImageProcessor;
  engineFactory?: EngineFactory;
  ocrManager?: OCRManager;
  createTranslator?: () => Promise<ITextTranslator>;
  translateImageImpl?: (
    input: TranslateImageInput,
    options?: TranslateImageOptions
  ) => Promise<TranslateImageOutput>;
  registerEngines?: (
    factory: EngineFactory,
    setStage: (stage: Stage, message: string, progress?: number) => void
  ) => void;
}

export interface AppInstance {
  runOcr: () => Promise<void>;
  elements: {
    fileInput: HTMLInputElement;
    engineSelect: HTMLSelectElement;
    engineDetails: HTMLDivElement;
    runButton: HTMLButtonElement;
    output: HTMLDivElement;
    errorPanel: HTMLDivElement;
    errorMessage: HTMLParagraphElement;
    errorSuggestion: HTMLParagraphElement;
    retryButton: HTMLButtonElement;
    statusText: HTMLSpanElement;
    progressBar: HTMLDivElement;
    progressText: HTMLDivElement;
    loadMetric: HTMLDivElement;
    processMetric: HTMLDivElement;
    imagePreviewContainer: HTMLDivElement;
    urlInput: HTMLInputElement;
    loadUrlButton: HTMLButtonElement;
  };
  setStage: (stage: Stage, message: string, progress?: number) => void;
}

export const initApp = (options: AppOptions = {}): AppInstance => {
  const root = options.root ?? document.querySelector<HTMLElement>('#app');
  if (!root) {
    throw new Error('App root not found.');
  }

  root.innerHTML = getAppTemplate();
  const {
    statusCard,
    statusText,
    progressBar,
    progressText,
    loadMetric,
    processMetric,
    fileInput,
    fileMeta,
    engineSelect,
    engineDetails,
    languageSelect,
    languageSelectContainer,
    languageHint,
    runButton,
    output,
    errorPanel,
    errorMessage,
    errorSuggestion,
    retryButton,
    imagePreviewContainer,
    imagePreview,
    ocrOverlay,
    imageModal,
    modalImage,
    closeModal,
    ocrOverlayModal,
    urlInput,
    loadUrlButton,
    dropOverlay,
    copyOutputButton,
    methodTabs,
    methodPanels,
    translateImageFrom,
    translateImageTo,
    translateImageQuality,
    translateImageRunButton,
    translateImageApplyEditsButton,
    translateImageDownloadButton,
    translateImageStatus,
    translateImageError,
    translateImageEditor,
    replaceOriginalPreview,
    translateImagePreview,
    translateImageResult,
  } = getAppElements(root);

  const detector = options.featureDetector ?? new FeatureDetector();
  const capabilities = detector.detect();
  const webgpuAvailable = capabilities.webgpu && globalThis.crossOriginIsolated === true;

  const imageProcessor = options.imageProcessor ?? new ImageProcessor();
  const engineFactory = options.engineFactory ?? new EngineFactory();
  const ocrManager = options.ocrManager ?? new OCRManager(engineFactory);
  let selectedSource: Blob | string | null = null;
  let engineReady = false;
  let selectedEngineId: string | null = null;
  const selectedLanguages: Record<string, string> = {
    tesseract: 'eng',
    esearch: 'english',
    easyocr: 'en',
  };
  let activeEngineId: string | null = null;
  let activeLanguage: string | null = null;
  let lastResult: OCRResult | null = null;
  let lastProcessedWidth: number = 0;
  let lastProcessedHeight: number = 0;
  let originalImageData: ImageData | null = null;
  let sourceGeneration = 0;
  let translator: ITextTranslator | null = null;
  let translatorPromise: Promise<ITextTranslator> | null = null;
  let translatedImageUrl: string | null = null;
  let translateTaskGeneration = 0;
  let translateBusy = false;
  let editableInput: TranslateImageInput | null = null;

  const createTranslator: () => Promise<ITextTranslator> =
    options.createTranslator ??
    (async (): Promise<ITextTranslator> => {
      const { BergamotTextTranslator } = await import('@/translation/bergamot-translator');
      return new BergamotTextTranslator();
    });
  const translateImage =
    options.translateImageImpl ??
    (async (
      input: TranslateImageInput,
      translateOptions?: TranslateImageOptions
    ): Promise<TranslateImageOutput> => {
      const { translateImage: runTranslateImage } = await import('@/translate-image');
      return runTranslateImage(input, translateOptions);
    });

  for (const [code, label] of Object.entries(BERGAMOT_LANGUAGES)) {
    const fromOption = document.createElement('option');
    fromOption.value = code;
    fromOption.textContent = label;
    translateImageFrom.append(fromOption);
    const toOption = fromOption.cloneNode(true) as HTMLOptionElement;
    translateImageTo.append(toOption);
  }
  translateImageFrom.value = 'en';
  translateImageTo.value = DEFAULT_TRANSLATION_TO;

  const clearTranslatedImage = (): void => {
    if (translatedImageUrl) URL.revokeObjectURL(translatedImageUrl);
    translatedImageUrl = null;
    translateImagePreview.removeAttribute('src');
    translateImageResult.classList.add('hidden');
    translateImageDownloadButton.disabled = true;
  };

  const setTranslatedImage = (blob: Blob): void => {
    clearTranslatedImage();
    translatedImageUrl = URL.createObjectURL(blob);
    translateImagePreview.src = translatedImageUrl;
    translateImageResult.classList.remove('hidden');
    translateImageDownloadButton.disabled = false;
  };

  const setTranslationEditor = (regions: TranslateImageOutput['regionTranslations']): void => {
    translateImageEditor.replaceChildren();
    if (!regions?.length) {
      translateImageEditor.classList.add('hidden');
      translateImageApplyEditsButton.disabled = true;
      return;
    }
    for (const [index, region] of regions.entries()) {
      const wrapper = document.createElement('div');
      wrapper.className = 'translate-image-editor-row';
      const label = document.createElement('label');
      label.htmlFor = `translate-image-edit-${index}`;
      label.textContent = `Replacement ${index + 1} (${region.sourceText})`;
      const textarea = document.createElement('textarea');
      textarea.id = `translate-image-edit-${index}`;
      textarea.dataset.regionIndex = String(index);
      textarea.value = region.text;
      textarea.rows = 2;
      wrapper.append(label, textarea);
      translateImageEditor.append(wrapper);
    }
    translateImageEditor.classList.remove('hidden');
    translateImageApplyEditsButton.disabled = false;
  };

  const resetTranslateImage = (status = 'Run OCR to enable image replacement.'): void => {
    translateTaskGeneration += 1;
    translateBusy = false;
    clearTranslatedImage();
    editableInput = null;
    translateImageEditor.replaceChildren();
    translateImageEditor.classList.add('hidden');
    translateImageApplyEditsButton.disabled = true;
    translateImageRunButton.disabled = true;
    translateImageStatus.textContent = status;
    translateImageError.textContent = '';
    translateImageError.classList.add('hidden');
  };

  const refreshTranslateImageAvailability = (): void => {
    translateImageRunButton.disabled =
      translateBusy ||
      !lastResult?.items?.length ||
      !originalImageData ||
      !lastProcessedWidth ||
      !lastProcessedHeight;
  };

  const getTranslator = async (): Promise<ITextTranslator> => {
    if (translator) return translator;
    if (!translatorPromise) {
      translatorPromise = createTranslator()
        .then((created) => {
          translator = created;
          return created;
        })
        .catch((error: unknown) => {
          translatorPromise = null;
          throw error;
        });
    }
    return translatorPromise;
  };

  createImageSourceController(
    {
      fileInput,
      fileMeta,
      imagePreviewContainer,
      imagePreview,
      urlInput,
      loadUrlButton,
      dropOverlay,
      methodTabs,
      methodPanels,
      output,
    },
    {
      setError: (error) => setError(createInvalidImageError(formatErrorMessage(error).message)),
      onLoadImage: (source) => {
        selectedSource = source;
        replaceOriginalPreview.src = imagePreview.src;
      },
      onClearImage: () => {
        selectedSource = null;
        sourceGeneration += 1;
        lastResult = null;
        originalImageData = null;
        lastProcessedWidth = 0;
        lastProcessedHeight = 0;
        resetTranslateImage();
        replaceOriginalPreview.removeAttribute('src');
      },
      onPreviewLoaded: () => undefined,
      onResetForNewSource: () => {
        sourceGeneration += 1;
        ocrOverlay.innerHTML = '';
        lastResult = null;
        originalImageData = null;
        lastProcessedWidth = 0;
        lastProcessedHeight = 0;
        resetTranslateImage();
        copyOutputButton.classList.add('hidden');
      },
    }
  );

  const engineUi = createEngineUiController(
    {
      engineSelect,
      engineDetails,
      languageSelect,
      languageSelectContainer,
      languageHint,
    },
    {
      webgpuAvailable,
      selectedLanguages,
      availableEngines: () => engineFactory.getAvailableEngines(),
    }
  );

  const setStage = (stage: Stage, message: string, progress: number = 0): void => {
    statusCard.dataset.stage = stage;
    statusText.textContent = message;
    const clamped = Math.min(100, Math.max(0, Math.round(progress)));
    progressBar.style.width = `${clamped}%`;
    progressText.textContent = `${clamped}%`;
  };

  const setLoadMetric = (durationMs: number): void => {
    loadMetric.textContent = `Load: ${Math.round(durationMs)} ms`;
  };

  const setProcessMetric = (durationMs: number): void => {
    processMetric.textContent = `Process: ${Math.round(durationMs)} ms`;
  };

  const setError = (error: unknown): void => {
    const formatted = formatErrorMessage(error);
    const recoverable = error instanceof OCRError ? error.recoverable : true;
    errorPanel.classList.remove('hidden');
    errorMessage.textContent = formatted.message;
    errorSuggestion.textContent = formatted.recoverySuggestion ?? '';
    retryButton.classList.toggle('hidden', !recoverable);
    setStage('error', 'Needs attention', 0);
  };

  const clearError = (): void => {
    errorPanel.classList.add('hidden');
    errorMessage.textContent = '';
    errorSuggestion.textContent = '';
  };

  const setBusy = (busy: boolean): void => {
    runButton.disabled = busy;
    fileInput.disabled = busy;
    engineSelect.disabled = busy;
    languageSelect.disabled = busy;
    runButton.textContent = busy ? 'Working…' : 'Extract text';
  };

  const registerDefaultEngines = (): void => {
    engineFactory.register('tesseract', async (options) => {
      const { TesseractEngine } = await import('@/engines/tesseract-engine');
      return new TesseractEngine({
        language: options?.language,
        onProgress: (status: string, progress?: number): void => {
          const percent = Math.round((progress ?? 0) * 100);
          setStage('loading', `Loading OCR engine: ${status}`, percent);
        },
      });
    });
    engineFactory.register('esearch', async (options) => {
      const { ESearchEngine } = await import('@/engines/esearch-engine');
      return new ESearchEngine({
        language: options?.language,
        webgpu: false, // Force WASM to avoid MaxPool ceil() error in WebGPU
        onProgress: (status: string, progress: number): void => {
          const percent = Math.round((progress ?? 0) * 100);
          setStage('loading', `Loading eSearch-OCR: ${status}`, percent);
        },
      });
    });
    engineFactory.register('easyocr', async (options) => {
      const { EasyOCREngine } = await import('@/engines/easyocr-engine');
      return new EasyOCREngine({
        language: options?.language,
        webgpu: webgpuAvailable,
        debug: true,
        debugMode: 'compare',
        onProgress: (status: string, progress: number): void => {
          const percent = Math.round((progress ?? 0) * 100);
          setStage('loading', `Loading EasyOCR: ${status}`, percent);
        },
      });
    });
  };

  const updateEngineDetails = (engineId: string): void => {
    engineUi.updateEngineDetails(engineId);
  };

  const getStoredEngine = (): string | null => {
    try {
      return localStorage.getItem('ocr.engine');
    } catch {
      return null;
    }
  };

  const setStoredEngine = (engineId: string): void => {
    try {
      localStorage.setItem('ocr.engine', engineId);
    } catch {
      // Ignore storage failures in restricted contexts.
    }
  };

  const updateLanguageSelection = (engineId: string): void => {
    engineUi.updateLanguageSelection(engineId);
  };

  const populateEngines = (): void => {
    engineUi.populateEngines(getStoredEngine);
    selectedEngineId = engineSelect.value || null;
    if (selectedEngineId) {
      updateEngineDetails(selectedEngineId);
      updateLanguageSelection(selectedEngineId);
    }
  };

  const switchEngine = async (engineId: string, manageBusy: boolean = true): Promise<void> => {
    const engineName = ENGINE_CONFIGS[engineId]?.name ?? engineId;
    const language = engineUi.getSelectedLanguage(engineId);
    const langSuffix = engineUi.supportsLanguageSelection(engineId)
      ? ` (${engineUi.getLanguageLabel(engineId, language)})`
      : '';
    setStage('loading', `Switching to ${engineName}${langSuffix}...`, 0);
    if (manageBusy) {
      setBusy(true);
    }
    try {
      const loadStart = performance.now();
      if (engineUi.supportsLanguageSelection(engineId)) {
        await ocrManager.setEngine(engineId, { language });
      } else {
        await ocrManager.setEngine(engineId);
      }
      setLoadMetric(performance.now() - loadStart);
      engineReady = true;
      activeEngineId = engineId;
      activeLanguage = engineUi.supportsLanguageSelection(engineId) ? language : null;
      setStage('idle', `${engineName} ready`, 0);
    } catch (error) {
      logError(error);
      setError(error);
    } finally {
      if (manageBusy) {
        setBusy(false);
      }
    }
  };

  if (!capabilities.supported) {
    const error = createUnsupportedBrowserError(capabilities.missing);
    setError(error);
    setBusy(true);
  } else {
    if (options.registerEngines) {
      options.registerEngines(engineFactory, setStage);
    } else {
      registerDefaultEngines();
    }
    populateEngines();
    setStage('idle', 'Ready for upload', 0);
  }

  engineSelect.addEventListener('change', (): void => {
    sourceGeneration += 1;
    lastResult = null;
    lastProcessedWidth = 0;
    lastProcessedHeight = 0;
    resetTranslateImage('Run OCR again to use the selected engine.');
    selectedEngineId = engineSelect.value;
    engineReady = false;
    activeEngineId = null;
    setStoredEngine(selectedEngineId);
    updateEngineDetails(selectedEngineId);
    updateLanguageSelection(selectedEngineId);
    void switchEngine(selectedEngineId);
  });

  languageSelect.addEventListener('change', (): void => {
    if (!selectedEngineId || !engineUi.supportsLanguageSelection(selectedEngineId)) {
      return;
    }

    selectedLanguages[selectedEngineId] = languageSelect.value;
    sourceGeneration += 1;
    lastResult = null;
    lastProcessedWidth = 0;
    lastProcessedHeight = 0;
    resetTranslateImage('Run OCR again to use the selected language.');
    engineReady = false;
    activeLanguage = null;
    engineUi.updateLanguageHint(selectedEngineId);
    void switchEngine(selectedEngineId);
  });

  const runOcr = async (): Promise<void> => {
    clearError();
    if (!selectedSource) {
      setError(
        createInvalidImageError(
          'Select an image file, enter a URL, or paste an image before running OCR.'
        )
      );
      return;
    }

    const operationGeneration = sourceGeneration;
    resetTranslateImage('OCR is running…');
    setBusy(true);
    try {
      if (!selectedEngineId) {
        setError(createProcessingFailedError('No OCR engine selected.'));
        return;
      }

      const languageMismatch =
        engineUi.supportsLanguageSelection(selectedEngineId) &&
        activeLanguage !== engineUi.getSelectedLanguage(selectedEngineId);
      if (!engineReady || activeEngineId !== selectedEngineId || languageMismatch) {
        await switchEngine(selectedEngineId, false);
        if (!engineReady || activeEngineId !== selectedEngineId) {
          return;
        }
      }

      setStage('processing', 'Processing image...', 100);
      const imageData = await imageProcessor.sourceToImageData(selectedSource);
      if (operationGeneration !== sourceGeneration) return;
      originalImageData = imageData;
      const resized = imageProcessor.resize(imageData, 2000);
      const processed = imageProcessor.preprocess(resized);
      const processStart = performance.now();
      const result = await ocrManager.run(processed);
      if (operationGeneration !== sourceGeneration) return;
      setProcessMetric(performance.now() - processStart);
      lastResult = result;
      lastProcessedWidth = processed.width;
      lastProcessedHeight = processed.height;
      const inferredFrom =
        selectedEngineId && engineUi.supportsLanguageSelection(selectedEngineId)
          ? mapOcrLanguageToBergamot(
              selectedEngineId,
              engineUi.getSelectedLanguage(selectedEngineId)
            )
          : null;
      if (inferredFrom) {
        translateImageFrom.value = inferredFrom;
        if (translateImageTo.value === inferredFrom) {
          translateImageTo.value = inferredFrom === 'en' ? 'es' : 'en';
        }
      }
      resetTranslateImage(
        result.items?.length
          ? 'Ready to replace and translate detected text.'
          : 'No positioned text was detected.'
      );
      refreshTranslateImageAvailability();

      output.textContent =
        result.text.trim().length > 0 ? result.text : 'No text detected in this image.';
      copyOutputButton.classList.toggle('hidden', result.text.trim().length === 0);
      if (result.items && result.items.length > 0) {
        drawOcrBoxes(result.items, processed.width, processed.height, {
          mainOverlay: ocrOverlay,
          mainImage: imagePreview,
          modalOverlay: ocrOverlayModal,
          modalImage,
          isModalOpen: () => !imageModal.classList.contains('hidden'),
        });
      } else {
        ocrOverlay.innerHTML = '';
      }
      setStage('complete', 'OCR complete', 100);
    } catch (error) {
      logError(error);
      if (error instanceof OCRError) {
        setError(error);
      } else if (error instanceof Error && error.message.includes('Unsupported image format')) {
        setError(createInvalidImageError(error.message));
      } else if (error instanceof Error && error.message.includes('decode')) {
        setError(createInvalidImageError('Image decoding failed. Try a different source.'));
      } else {
        setError(createProcessingFailedError(error instanceof Error ? error.message : undefined));
      }
    } finally {
      setBusy(false);
    }
  };

  translateImageRunButton.addEventListener('click', (): void => {
    if (
      !originalImageData ||
      !lastResult?.items?.length ||
      !selectedEngineId ||
      translateImageRunButton.disabled
    )
      return;
    const operationGeneration = sourceGeneration;
    const taskGeneration = ++translateTaskGeneration;
    clearTranslatedImage();
    const input: TranslateImageInput = {
      original: originalImageData,
      ocrItems: lastResult.items,
      engineId: selectedEngineId,
      from: translateImageFrom.value,
      to: translateImageTo.value,
      ocrSize: { width: lastProcessedWidth, height: lastProcessedHeight },
      translator: null as unknown as ITextTranslator,
    };
    translateImageRunButton.disabled = true;
    translateBusy = true;
    translateImageDownloadButton.disabled = true;
    translateImageError.textContent = '';
    translateImageError.classList.add('hidden');
    translateImageStatus.textContent = 'Loading on-device translation model…';
    void (async (): Promise<void> => {
      try {
        input.translator = await getTranslator();
        if (operationGeneration !== sourceGeneration || taskGeneration !== translateTaskGeneration)
          return;
        translateImageStatus.textContent = 'Translating and rendering image…';
        const quality = translateImageQuality.value as TranslateImageOptions['quality'];
        const response = await translateImage(input, { quality });
        if (operationGeneration !== sourceGeneration || taskGeneration !== translateTaskGeneration)
          return;
        setTranslatedImage(response.blob);
        editableInput = input;
        setTranslationEditor(response.regionTranslations);
        translateImageStatus.textContent = 'Image replacement complete.';
      } catch (error) {
        logError(error);
        if (operationGeneration !== sourceGeneration || taskGeneration !== translateTaskGeneration)
          return;
        translateImageError.textContent = formatErrorWithCauses(error);
        translateImageError.classList.remove('hidden');
        translateImageStatus.textContent = 'Image replacement failed.';
      } finally {
        if (taskGeneration === translateTaskGeneration) {
          translateBusy = false;
          if (operationGeneration === sourceGeneration) refreshTranslateImageAvailability();
        }
      }
    })();
  });

  translateImageApplyEditsButton.addEventListener('click', (): void => {
    if (!editableInput || translateImageApplyEditsButton.disabled) return;
    const operationGeneration = sourceGeneration;
    const taskGeneration = ++translateTaskGeneration;
    const manualTranslations = Array.from(
      translateImageEditor.querySelectorAll<HTMLTextAreaElement>('textarea[data-region-index]'),
      (textarea) => textarea.value
    );
    translateBusy = true;
    translateImageApplyEditsButton.disabled = true;
    translateImageRunButton.disabled = true;
    translateImageStatus.textContent = 'Applying edited replacement text…';
    translateImageError.textContent = '';
    translateImageError.classList.add('hidden');
    void (async (): Promise<void> => {
      try {
        const response = await translateImage(
          { ...editableInput, manualTranslations },
          { quality: translateImageQuality.value as TranslateImageOptions['quality'] }
        );
        if (operationGeneration !== sourceGeneration || taskGeneration !== translateTaskGeneration)
          return;
        setTranslatedImage(response.blob);
        translateImageStatus.textContent = 'Edited image replacement complete.';
      } catch (error) {
        if (operationGeneration !== sourceGeneration || taskGeneration !== translateTaskGeneration)
          return;
        translateImageError.textContent = formatErrorWithCauses(error);
        translateImageError.classList.remove('hidden');
        translateImageStatus.textContent = 'Image replacement failed.';
      } finally {
        if (taskGeneration === translateTaskGeneration) {
          translateBusy = false;
          translateImageApplyEditsButton.disabled = false;
          refreshTranslateImageAvailability();
        }
      }
    })();
  });

  translateImageDownloadButton.addEventListener('click', (): void => {
    if (!translatedImageUrl) return;
    const link = document.createElement('a');
    link.href = translatedImageUrl;
    const baseName =
      selectedSource instanceof File ? selectedSource.name.replace(/\.[^.]+$/, '') : 'image';
    link.download = `${baseName}-translated.png`;
    link.click();
  });

  const resetImageResultForOptionChange = (): void => {
    resetTranslateImage('Ready to replace and translate detected text.');
    refreshTranslateImageAvailability();
  };
  translateImageFrom.addEventListener('change', resetImageResultForOptionChange);
  translateImageTo.addEventListener('change', resetImageResultForOptionChange);
  translateImageQuality.addEventListener('change', resetImageResultForOptionChange);

  runButton.addEventListener('click', (): void => {
    void runOcr();
  });

  retryButton.addEventListener('click', (): void => {
    void runOcr();
  });

  imagePreview.addEventListener('click', (): void => {
    if (imagePreview.src && !imagePreviewContainer.classList.contains('hidden')) {
      modalImage.src = imagePreview.src;
      imageModal.classList.remove('hidden');
      document.body.style.overflow = 'hidden'; // Prevent scrolling

      if (lastResult?.items && lastProcessedWidth && lastProcessedHeight) {
        drawOcrBoxes(lastResult.items, lastProcessedWidth, lastProcessedHeight, {
          mainOverlay: ocrOverlay,
          mainImage: imagePreview,
          modalOverlay: ocrOverlayModal,
          modalImage,
          isModalOpen: () => !imageModal.classList.contains('hidden'),
        });
      }
    }
  });

  const closeImageModal = (): void => {
    imageModal.classList.add('hidden');
    modalImage.src = '';
    ocrOverlayModal.innerHTML = '';
    document.body.style.overflow = ''; // Restore scrolling
  };

  imageModal.addEventListener('click', (e: MouseEvent): void => {
    if (e.target === imageModal || e.target === closeModal) {
      closeImageModal();
    }
  });

  document.addEventListener('keydown', (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && !imageModal.classList.contains('hidden')) {
      closeImageModal();
    }
  });

  copyOutputButton.addEventListener('click', () => {
    const text = output.textContent ?? '';
    if (
      text &&
      text !== 'Upload an image to begin.' &&
      text !== 'No text detected in this image.'
    ) {
      void navigator.clipboard.writeText(text).then(() => {
        const originalHtml = copyOutputButton.innerHTML;
        copyOutputButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent-strong)"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        setTimeout(() => {
          copyOutputButton.innerHTML = originalHtml;
        }, 2000);
      });
    }
  });

  const drawBoxes = (
    items: OCRResult['items'],
    originalWidth: number,
    originalHeight: number
  ): void => {
    drawOcrBoxes(items, originalWidth, originalHeight, {
      mainOverlay: ocrOverlay,
      mainImage: imagePreview,
      modalOverlay: ocrOverlayModal,
      modalImage,
      isModalOpen: () => !imageModal.classList.contains('hidden'),
    });
  };

  window.addEventListener('resize', (): void => {
    if (lastResult?.items && lastProcessedWidth && lastProcessedHeight) {
      drawBoxes(lastResult.items, lastProcessedWidth, lastProcessedHeight);
    }
  });

  return {
    runOcr,
    elements: {
      fileInput,
      engineSelect,
      engineDetails,
      runButton,
      output,
      errorPanel,
      errorMessage,
      errorSuggestion,
      retryButton,
      statusText,
      progressBar,
      progressText,
      loadMetric,
      processMetric,
      imagePreviewContainer,
      urlInput,
      loadUrlButton,
    },
    setStage,
  };
};
