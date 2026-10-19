import { describe, it, expect } from 'vitest';
import { ChatLineDiffDetector } from '../src/chat-translator/chat-line-diff';

describe('ChatLineDiffDetector', () => {
  it('emits new lines on first scan and ignores duplicates on second scan', () => {
    const detector = new ChatLineDiffDetector({ similarityThreshold: 0.85 });

    const scan1 = `
      (Pierre): salut les gars
      (Jean): go donjon
    `;
    const newLines1 = detector.detectNewLines(scan1);
    expect(newLines1).toHaveLength(2);
    expect(newLines1[0]).toBe('(Pierre): salut les gars');
    expect(newLines1[1]).toBe('(Jean): go donjon');

    // Second scan: chat scrolled up by one line, new line appeared at bottom
    const scan2 = `
      (Jean): go donjon
      (Shadow): tkt j arrive
    `;
    const newLines2 = detector.detectNewLines(scan2);
    expect(newLines2).toHaveLength(1);
    expect(newLines2[0]).toBe('(Shadow): tkt j arrive');
  });

  it('forceProcessAll returns all non-empty lines regardless of history', () => {
    const detector = new ChatLineDiffDetector();
    detector.detectNewLines('(Pierre): salut');

    const forced = detector.forceProcessAll('(Pierre): salut\n(Jean): yo');
    expect(forced).toHaveLength(2);
  });
});
