import { defineConfig } from 'vitest/config';
import path from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  base: process.env.VITE_BASE_URL || '/',
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/onnxruntime-web/dist/ort-wasm-*.{wasm,mjs}',
          dest: 'onnxruntime-web',
        },
        {
          src: 'node_modules/@browsermt/bergamot-translator/worker/**/*',
          dest: 'bergamot/worker',
        },
        {
          src: 'node_modules/tesseract.js/dist/worker.min.js',
          dest: 'tesseract',
        },
        {
          src: 'node_modules/tesseract.js-core/tesseract-core-*.{wasm,js}',
          dest: 'tesseract-core',
        },
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    headers: {
      // Required for SharedArrayBuffer, which is used by onnxruntime-web's threaded WASM builds.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
