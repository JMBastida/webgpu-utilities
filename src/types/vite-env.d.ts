interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly VITE_BERGAMOT_MODEL_ASSET_BASE_URL?: string;
  readonly VITE_TESSERACT_LANG_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
