export interface AppElements {
  statusCard: HTMLDivElement;
  statusText: HTMLSpanElement;
  progressBar: HTMLDivElement;
  progressText: HTMLDivElement;
  loadMetric: HTMLDivElement;
  processMetric: HTMLDivElement;
  fileInput: HTMLInputElement;
  fileMeta: HTMLDivElement;
  engineSelect: HTMLSelectElement;
  engineDetails: HTMLDivElement;
  languageSelect: HTMLSelectElement;
  languageSelectContainer: HTMLDivElement;
  languageHint: HTMLDivElement;
  runButton: HTMLButtonElement;
  output: HTMLDivElement;
  errorPanel: HTMLDivElement;
  errorMessage: HTMLParagraphElement;
  errorSuggestion: HTMLParagraphElement;
  retryButton: HTMLButtonElement;
  imagePreviewContainer: HTMLDivElement;
  imagePreview: HTMLImageElement;
  ocrOverlay: HTMLDivElement;
  imageModal: HTMLDivElement;
  modalImage: HTMLImageElement;
  closeModal: HTMLSpanElement;
  ocrOverlayModal: HTMLDivElement;
  urlInput: HTMLInputElement;
  loadUrlButton: HTMLButtonElement;
  dropOverlay: HTMLDivElement;
  copyOutputButton: HTMLButtonElement;
  translateImageFrom: HTMLSelectElement;
  translateImageTo: HTMLSelectElement;
  translateImageQuality: HTMLSelectElement;
  translateImageRunButton: HTMLButtonElement;
  translateImageApplyEditsButton: HTMLButtonElement;
  translateImageDownloadButton: HTMLButtonElement;
  translateImageStatus: HTMLDivElement;
  translateImageError: HTMLDivElement;
  translateImageEditor: HTMLDivElement;
  replaceOriginalPreview: HTMLImageElement;
  translateImagePreview: HTMLImageElement;
  translateImageResult: HTMLDivElement;
  methodTabs: HTMLButtonElement[];
  methodPanels: HTMLDivElement[];
}

export const getAppElements = (root: HTMLElement): AppElements => {
  const statusCard = root.querySelector<HTMLDivElement>('.status-card');
  const statusText = root.querySelector<HTMLSpanElement>('#status-text');
  const progressBar = root.querySelector<HTMLDivElement>('#progress-bar');
  const progressText = root.querySelector<HTMLDivElement>('#progress-text');
  const loadMetric = root.querySelector<HTMLDivElement>('#load-metric');
  const processMetric = root.querySelector<HTMLDivElement>('#process-metric');
  const fileInput = root.querySelector<HTMLInputElement>('#file-input');
  const fileMeta = root.querySelector<HTMLDivElement>('#file-meta');
  const engineSelect = root.querySelector<HTMLSelectElement>('#engine-select');
  const engineDetails = root.querySelector<HTMLDivElement>('#engine-details');
  const languageSelect = root.querySelector<HTMLSelectElement>('#language-select');
  const languageSelectContainer = root.querySelector<HTMLDivElement>('#language-select-container');
  const languageHint = root.querySelector<HTMLDivElement>('#language-hint');
  const runButton = root.querySelector<HTMLButtonElement>('#run-button');
  const output = root.querySelector<HTMLDivElement>('#output');
  const errorPanel = root.querySelector<HTMLDivElement>('#error-panel');
  const errorMessage = root.querySelector<HTMLParagraphElement>('#error-message');
  const errorSuggestion = root.querySelector<HTMLParagraphElement>('#error-suggestion');
  const retryButton = root.querySelector<HTMLButtonElement>('#retry-button');
  const imagePreviewContainer = root.querySelector<HTMLDivElement>('#image-preview-container');
  const imagePreview = root.querySelector<HTMLImageElement>('#image-preview');
  const ocrOverlay = root.querySelector<HTMLDivElement>('#ocr-overlay');
  const imageModal = root.querySelector<HTMLDivElement>('#image-modal');
  const modalImage = root.querySelector<HTMLImageElement>('#modal-image');
  const closeModal = root.querySelector<HTMLSpanElement>('#close-modal');
  const ocrOverlayModal = root.querySelector<HTMLDivElement>('#ocr-overlay-modal');
  const urlInput = root.querySelector<HTMLInputElement>('#url-input');
  const loadUrlButton = root.querySelector<HTMLButtonElement>('#load-url-button');
  const dropOverlay = root.querySelector<HTMLDivElement>('#drop-overlay');
  const copyOutputButton = root.querySelector<HTMLButtonElement>('#copy-output-button');
  const translateImageFrom = root.querySelector<HTMLSelectElement>('#translate-image-from');
  const translateImageTo = root.querySelector<HTMLSelectElement>('#translate-image-to');
  const translateImageQuality = root.querySelector<HTMLSelectElement>('#translate-image-quality');
  const translateImageRunButton = root.querySelector<HTMLButtonElement>('#translate-image-run');
  const translateImageApplyEditsButton = root.querySelector<HTMLButtonElement>(
    '#translate-image-apply-edits'
  );
  const translateImageDownloadButton = root.querySelector<HTMLButtonElement>(
    '#translate-image-download'
  );
  const translateImageStatus = root.querySelector<HTMLDivElement>('#translate-image-status');
  const translateImageError = root.querySelector<HTMLDivElement>('#translate-image-error');
  const translateImageEditor = root.querySelector<HTMLDivElement>('#translate-image-editor');
  const replaceOriginalPreview = root.querySelector<HTMLImageElement>('#replace-original-preview');
  const translateImagePreview = root.querySelector<HTMLImageElement>('#translate-image-preview');
  const translateImageResult = root.querySelector<HTMLDivElement>('#translate-image-result');
  const methodTabs = Array.from(root.querySelectorAll<HTMLButtonElement>('.method-tab'));
  const methodPanels = Array.from(root.querySelectorAll<HTMLDivElement>('.method-panel'));

  if (
    !statusCard ||
    !statusText ||
    !progressBar ||
    !progressText ||
    !loadMetric ||
    !processMetric ||
    !fileInput ||
    !fileMeta ||
    !engineSelect ||
    !engineDetails ||
    !languageSelect ||
    !languageSelectContainer ||
    !languageHint ||
    !runButton ||
    !output ||
    !errorPanel ||
    !errorMessage ||
    !errorSuggestion ||
    !retryButton ||
    !imagePreviewContainer ||
    !imagePreview ||
    !ocrOverlay ||
    !imageModal ||
    !modalImage ||
    !closeModal ||
    !ocrOverlayModal ||
    !copyOutputButton ||
    !urlInput ||
    !loadUrlButton ||
    !dropOverlay ||
    !translateImageFrom ||
    !translateImageTo ||
    !translateImageQuality ||
    !translateImageRunButton ||
    !translateImageApplyEditsButton ||
    !translateImageDownloadButton ||
    !translateImageStatus ||
    !translateImageError ||
    !translateImageEditor ||
    !replaceOriginalPreview ||
    !translateImagePreview ||
    !translateImageResult ||
    methodTabs.length === 0 ||
    methodPanels.length === 0
  ) {
    throw new Error('UI elements missing.');
  }

  return {
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
    methodTabs,
    methodPanels,
  };
};
