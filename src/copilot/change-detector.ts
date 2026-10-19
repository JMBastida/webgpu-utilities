export const normalizeOcrText = (text: string): string => {
  return text
    .replace(/^\s*\d+\s*[|:]\s*/gm, '') // Strip line numbers like "1 | "
    .replace(/[|_█│]/g, ' ') // Strip blinking cursor or vertical line artifacts
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

export const calculateTextSimilarity = (textA: string, textB: string): number => {
  const a = normalizeOcrText(textA);
  const b = normalizeOcrText(textB);

  if (a === b) return 1.0;
  if (!a || !b) return 0.0;

  const wordsA = new Set(a.split(' ').filter(Boolean));
  const wordsB = new Set(b.split(' ').filter(Boolean));

  if (wordsA.size === 0 || wordsB.size === 0) return 0.0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0.0;
};

export interface ChangeEvaluation {
  isNewQuestion: boolean;
  isNoise: boolean;
  similarity: number;
  normalizedText: string;
}

export class ChangeDetector {
  private lastSolvedText = '';
  private readonly similarityThreshold: number;
  private readonly minLength: number;

  constructor(options?: { similarityThreshold?: number; minLength?: number }) {
    this.similarityThreshold = options?.similarityThreshold ?? 0.8;
    this.minLength = options?.minLength ?? 15;
  }

  evaluate(rawText: string): ChangeEvaluation {
    const normalized = normalizeOcrText(rawText);

    if (normalized.length < this.minLength) {
      return {
        isNewQuestion: false,
        isNoise: true,
        similarity: 0,
        normalizedText: normalized,
      };
    }

    if (!this.lastSolvedText) {
      return {
        isNewQuestion: true,
        isNoise: false,
        similarity: 0,
        normalizedText: normalized,
      };
    }

    const similarity = calculateTextSimilarity(normalized, this.lastSolvedText);
    const isNew = similarity < this.similarityThreshold;

    return {
      isNewQuestion: isNew,
      isNoise: false,
      similarity,
      normalizedText: normalized,
    };
  }

  markSolved(rawText: string): void {
    this.lastSolvedText = normalizeOcrText(rawText);
  }

  reset(): void {
    this.lastSolvedText = '';
  }
}
