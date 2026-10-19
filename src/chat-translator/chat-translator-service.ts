import type { TranslatedChatLine } from './types';
import type { ITextTranslator } from '@/types/translation';
import { parseChatLine, maskBrackets, unmaskBrackets } from './chat-tokenizer';

export interface ChatTranslatorServiceOptions {
  geminiApiKey?: string;
  geminiModel?: string;
  bergamotTranslator?: ITextTranslator;
  fetchImpl?: typeof fetch;
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

export class ChatTranslatorService {
  private geminiApiKey: string;
  private geminiModel: string;
  private bergamotTranslator: ITextTranslator | null;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ChatTranslatorServiceOptions) {
    this.geminiApiKey = options.geminiApiKey ?? '';
    this.geminiModel = options.geminiModel ?? 'gemini-3.8-flash';
    this.bergamotTranslator = options.bergamotTranslator ?? null;
    const rawFetch = options.fetchImpl ?? globalThis.fetch;
    this.fetchImpl = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      rawFetch(input, init);
  }

  updateConfig(apiKey?: string, model?: string, bergamot?: ITextTranslator): void {
    if (apiKey !== undefined) this.geminiApiKey = apiKey;
    if (model !== undefined) this.geminiModel = model;
    if (bergamot !== undefined) this.bergamotTranslator = bergamot;
  }

  async translateLines(
    lines: string[],
    engine: 'gemini' | 'bergamot'
  ): Promise<TranslatedChatLine[]> {
    if (lines.length === 0) return [];

    if (engine === 'gemini') {
      return this.translateWithGemini(lines);
    } else {
      return this.translateWithBergamot(lines);
    }
  }

  private async translateWithGemini(lines: string[]): Promise<TranslatedChatLine[]> {
    if (!this.geminiApiKey) {
      throw new Error('Gemini API key is required for Gemini chat translation.');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${encodeURIComponent(
      this.geminiApiKey
    )}`;

    const systemInstruction = `You are a real-time French-to-English game chat translator.
Translate the provided French chat lines into natural, colloquial English.
CRITICAL RULES:
1. Preserve all usernames, channels, and prefix tags verbatim (e.g. (Player), [Guild], <All>).
2. NEVER translate text inside square brackets [...] anywhere in the message (these are game items, gear, or coordinates) - keep [...] content completely verbatim.
3. Accurately translate French gaming slang & abbreviations:
   - "mdr" / "ptdr" -> "lol" / "lmao"
   - "tkt" -> "dw" / "don't worry"
   - "jpp" -> "I can't even" / "I'm dead"
   - "stp" / "svp" -> "pls" / "please"
   - "bg" -> "boss" / "legend"
   - "gg" / "afk" / "heal" / "tank" / "aggro" -> keep standard gaming terms
4. Output EXACTLY 1 translated line per input line in matching order. Do not add conversational commentary.`;

    const payload = {
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [
        {
          parts: [{ text: lines.join('\n') }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
      },
    };

    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini Translation Error ${response.status}: ${err}`);
    }

    const data = (await response.json()) as GeminiApiResponse;
    const rawAnswer = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const translatedLines = rawAnswer
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    return lines.map((original, i) => {
      const parsed = parseChatLine(original);
      const translated = translatedLines[i] || original;
      return {
        id: `chat-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        originalFrench: original,
        translatedEnglish: translated,
        username: parsed.username,
      };
    });
  }

  private async translateWithBergamot(lines: string[]): Promise<TranslatedChatLine[]> {
    if (!this.bergamotTranslator) {
      throw new Error('Bergamot WASM translator is not initialized.');
    }

    const results: TranslatedChatLine[] = [];

    for (let i = 0; i < lines.length; i++) {
      const original = lines[i] ?? '';
      const parsed = parseChatLine(original);

      if (!parsed.messageBody) {
        results.push({
          id: `chat-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: Date.now(),
          originalFrench: original,
          translatedEnglish: original,
          username: parsed.username,
        });
        continue;
      }

      // Mask brackets
      const { maskedText, tokens } = maskBrackets(parsed.messageBody);

      const res = await this.bergamotTranslator.translate({
        from: 'fr',
        to: 'en',
        text: maskedText,
      });

      const unmasked = unmaskBrackets((res.text || '').trim(), tokens);
      const fullTranslated = parsed.prefix ? `${parsed.prefix} ${unmasked}` : unmasked;

      results.push({
        id: `chat-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        originalFrench: original,
        translatedEnglish: fullTranslated,
        username: parsed.username,
      });
    }

    return results;
  }
}
