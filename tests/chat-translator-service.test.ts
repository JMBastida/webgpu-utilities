import { describe, it, expect, vi } from 'vitest';
import { ChatTranslatorService } from '../src/chat-translator/chat-translator-service';
import type { ITextTranslator } from '../src/types/translation';

describe('ChatTranslatorService', () => {
  it('translates via Gemini with gamer prompt and preserves brackets', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '(Pierre92): hey everyone, are we doing [Donjon de Feu] ?\nJean: lol wait for me',
              },
            ],
          },
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const service = new ChatTranslatorService({
      geminiApiKey: 'test-key',
      geminiModel: 'gemini-3.8-flash',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const lines = [
      '(Pierre92): salut tout le monde on fait [Donjon de Feu] ?',
      'Jean: mdr attendez moi',
    ];

    const results = await service.translateLines(lines, 'gemini');
    expect(results).toHaveLength(2);
    expect(results[0]?.translatedEnglish).toContain('[Donjon de Feu]');
    expect(results[1]?.translatedEnglish).toContain('lol wait for me');
  });

  it('translates via Bergamot with bracket token masking', async () => {
    const mockBergamot: ITextTranslator = {
      translate: vi.fn().mockResolvedValue({
        translatedText: 'I found __BRK_0__ here',
      }),
    } as unknown as ITextTranslator;

    const service = new ChatTranslatorService({
      bergamotTranslator: mockBergamot,
    });

    const results = await service.translateLines(["J'ai trouvé [Épée Légendaire] ici"], 'bergamot');
    expect(results).toHaveLength(1);
    expect(results[0]?.translatedEnglish).toBe('I found [Épée Légendaire] here');
  });
});
