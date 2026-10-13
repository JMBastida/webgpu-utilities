# 🚀 Professional Browser OCR System

A high-performance, multi-engine OCR (Optical Character Recognition) system that runs entirely in your browser. No server uploads, no privacy concerns—just fast, secure text extraction.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF.svg)](https://vitejs.dev/)

## ✨ Key Features

- **🔒 Privacy First**: All processing happens locally on your device. Images never leave your browser.
- **⚡ Multi-Engine Strategy**: Choose the best engine for your needs:
  - **Tesseract.js**: The industry standard for general-purpose OCR.
  - **Transformers.js (TrOCR)**: State-of-the-art AI accuracy using Transformer models.
  - **eSearch-OCR (PaddleOCR)**: High-speed, high-accuracy engine optimized for Chinese/English mixed text.
  - **EasyOCR.js**: EasyOCR models running locally with ONNX Runtime.
- **🌍 Local Translation**: Translate extracted text instantly using **Bergamot** (the engine behind Firefox Translations), keeping everything 100% private and on-device.
- **🖼️ Translate text in images**: Replace positioned OCR text with local Bergamot translations and download a PNG. Choose `fast`, `balanced`, or `high-quality` rendering; see [image translation notes](docs/TRANSLATE_IMAGE.md) for limits.
- **🔋 Performance Optimized**: Uses WebAssembly (WASM), Web Workers, and WebGPU acceleration for near-native speeds.
- **📦 Intelligent Caching**: Heavy model files are cached in **IndexedDB** for instant subsequent loads.
- **🎨 Glassmorphism UI**: A modern, clean interface with drag-and-drop, URL, and paste support.

## 🛠️ OCR Engines Comparison

| Engine              | Best For                         | Tech Stack    | Model Size         |
| ------------------- | -------------------------------- | ------------- | ------------------ |
| **Tesseract.js**    | General use, 100+ languages      | WASM          | ~4.3 MB (eng/fast) |
| **Transformers.js** | Highest accuracy, modern AI      | WebGPU / ONNX | ~40-150 MB         |
| **eSearch-OCR**     | Chinese/English, complex layouts | ONNX Runtime  | ~7-10 MB           |
| **EasyOCR.js**      | Multilingual OCR with EasyOCR    | ONNX Runtime  | ~110 MB            |

## 🚀 Getting Started

### Prerequisites

- **Modern Browser**:
  - **Basic Support** (WASM/Workers): Chrome 92+, Firefox 79+, Safari 15.2+ (required for `SharedArrayBuffer`)
  - **WebGPU Acceleration**: Chrome 113+, Firefox 121+, Safari 17+
- **Node.js**: v18 or higher recommended

### Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/your-repo/multi-engine-browser-ocr.git
   cd multi-engine-browser-ocr
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

### 🌍 Model Loading

Most engines download their models automatically from CDNs (Hugging Face or Tesseract CDN) on their first run and cache them locally. Translation models are also downloaded on demand.

#### eSearch-OCR Manual Setup (Optional for Offline)

By default, eSearch-OCR fetches models from Hugging Face. If you need to use it offline or host models yourself:

1. Download models from [eSearch-OCR releases](https://github.com/xushengfeng/eSearch-OCR/releases/tag/4.0.0).
2. Place `det.onnx`, `rec.onnx`, and `ppocr_keys_v1.txt` into `public/models/esearch/`.

## 📂 Project Structure

- `src/engines/`: Implementation of different OCR strategies.
- `src/translation/`: Bergamot-based translation implementation.
- `src/utils/`: Image processing, feature detection, translation utilities, and model caching.
- `src/types/`: Shared TypeScript interfaces.
- `tests/`: Comprehensive test suite using Vitest.
- `docs/`: Technical specifications and decision logs.

## 🧪 Development Commands

- `npm run dev`: Start Vite development server.
- `npm run build`: Build for production.
- `npm test`: Run all tests once.
- `npm run test:watch`: Run tests in watch mode.
- `npm run lint`: Check for code style issues.
- `npm run format`: Automatically fix formatting.

## �️ Privacy & Security

This application is designed with security as a core principle:

- **No Data Collection**: Your images are processed entirely in the local browser context. No data is sent to external servers or APIs.
- **Offline Capability**: Once the models are cached, the engine can function without an active internet connection.
- **Open Source**: The entire pipeline is transparent and verifiable.

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) (if available) or simply open a Pull Request.

## 📖 Documentation

- [Technical Specification](docs/SPECIFICATION.md): Deep dive into architecture and design.
- [Decision Log](docs/DECISION_LOG.md): Rationale behind technical choices.
