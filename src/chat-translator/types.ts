export interface ParsedChatLine {
  raw: string;
  prefix?: string;
  username?: string;
  messageBody: string;
  bracketItems: string[];
}

export interface TranslatedChatLine {
  id: string;
  timestamp: number;
  originalFrench: string;
  translatedEnglish: string;
  username?: string;
}

export type ChatTranslationEngine = 'gemini' | 'bergamot';

export interface ChatTranslatorConfig {
  engine: ChatTranslationEngine;
  scanIntervalSec: number;
  autoEnabled: boolean;
}
