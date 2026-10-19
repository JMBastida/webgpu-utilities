const normalizeLine = (line: string): string =>
  line
    .replace(/[|_█│]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const calculateLineSimilarity = (a: string, b: string): number => {
  const normA = normalizeLine(a);
  const normB = normalizeLine(b);
  if (normA === normB) return 1.0;
  if (!normA || !normB) return 0.0;

  const wordsA = new Set(normA.split(' ').filter(Boolean));
  const wordsB = new Set(normB.split(' ').filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0.0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0.0;
};

export class ChatLineDiffDetector {
  private history: string[] = [];
  private readonly historyLimit: number;
  private readonly similarityThreshold: number;

  constructor(options?: { historyLimit?: number; similarityThreshold?: number }) {
    this.historyLimit = options?.historyLimit ?? 40;
    this.similarityThreshold = options?.similarityThreshold ?? 0.85;
  }

  detectNewLines(rawOcrText: string): string[] {
    const candidateLines = this.splitAndClean(rawOcrText);
    const newLines: string[] = [];

    for (const line of candidateLines) {
      const isDuplicate = this.history.some(
        (seen) => calculateLineSimilarity(line, seen) >= this.similarityThreshold
      );

      if (!isDuplicate) {
        newLines.push(line);
        this.history.push(line);
        if (this.history.length > this.historyLimit) {
          this.history.shift();
        }
      }
    }

    return newLines;
  }

  forceProcessAll(rawOcrText: string): string[] {
    const lines = this.splitAndClean(rawOcrText);
    for (const line of lines) {
      if (!this.history.includes(line)) {
        this.history.push(line);
      }
    }
    return lines;
  }

  clear(): void {
    this.history = [];
  }

  private splitAndClean(rawText: string): string[] {
    return rawText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length >= 3);
  }
}
