import { describe, it, expect } from 'vitest';
import { parseChatLine, maskBrackets, unmaskBrackets } from '../src/chat-translator/chat-tokenizer';

describe('Chat Tokenizer', () => {
  it('parses username prefix and message body accurately', () => {
    const line = '(Pierre92): salut tout le monde on fait le donjon ?';
    const parsed = parseChatLine(line);
    expect(parsed.prefix).toBe('(Pierre92):');
    expect(parsed.username).toBe('Pierre92');
    expect(parsed.messageBody).toBe('salut tout le monde on fait le donjon ?');
  });

  it('parses guild/channel prefix tags', () => {
    const line = '[Guilde] Jean_Luc: go boss final !';
    const parsed = parseChatLine(line);
    expect(parsed.prefix).toBe('[Guilde] Jean_Luc:');
    expect(parsed.username).toBe('Jean_Luc');
    expect(parsed.messageBody).toBe('go boss final !');
  });

  it('extracts and masks text inside square brackets', () => {
    const text = "j'ai trouvé [Épée Légendaire de Feu] et [Potion de Vie] !";
    const { maskedText, tokens } = maskBrackets(text);
    expect(maskedText).toContain('__BRK_0__');
    expect(maskedText).toContain('__BRK_1__');
    expect(tokens.get('__BRK_0__')).toBe('[Épée Légendaire de Feu]');
    expect(tokens.get('__BRK_1__')).toBe('[Potion de Vie]');

    const restored = unmaskBrackets(`I found __BRK_0__ and __BRK_1__ !`, tokens);
    expect(restored).toBe("I found [Épée Légendaire de Feu] and [Potion de Vie] !");
  });
});
