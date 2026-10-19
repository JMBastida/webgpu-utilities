import type { SolutionResult } from './types';

export interface GeminiSolverOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export interface ParseSolutionResult {
  code: string;
  explanation: string[];
  complexity?: string;
  rawText: string;
}

export const parseGeminiResponse = (rawText: string): ParseSolutionResult => {
  const codeBlockMatch = rawText.match(/```(?:\w+)?\n([\s\S]*?)```/);
  const code = codeBlockMatch?.[1] ? codeBlockMatch[1].trim() : '';

  const explanation: string[] = [];
  const lines = rawText.split('\n');
  let complexity: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(?:[-*•]|\d+\.)\s+(.+)/.test(trimmed)) {
      const bulletMatch = trimmed.match(/^(?:[-*•]|\d+\.)\s+(.+)/);
      if (bulletMatch?.[1]) explanation.push(bulletMatch[1].trim());
    } else if (/^complexity[:\s]/i.test(trimmed)) {
      complexity = trimmed;
    }
  }

  return {
    code,
    explanation,
    complexity,
    rawText,
  };
};

interface GeminiPart {
  text?: string;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
  };
}

interface GeminiApiResponse {
  candidates?: GeminiCandidate[];
}

export class GeminiSolver {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GeminiSolverOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? 'gemini-3.8-flash';
    const rawFetch = options.fetchImpl ?? globalThis.fetch;
    this.fetchImpl = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      rawFetch(input, init);
  }

  async solve(question: string, contextPrompt: string): Promise<SolutionResult> {
    if (!this.apiKey) {
      throw new Error('Gemini API key is required. Please set it in Settings.');
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${encodeURIComponent(
      this.apiKey
    )}`;

    const systemInstruction = `You are an expert technical interview co-pilot.
Your goal is to solve the programming, SQL, or technical task extracted from the screen.
Always structure your output:
1. Provide the direct, optimal code or SQL query in a clean markdown code block with appropriate language tag.
2. Provide 2-3 concise bullet points explaining key concepts and why this solution is optimal.
3. State Time and Space Complexity.
Be direct, production-ready, and interview-ready.`;

    const fullPrompt = `[Goal Context]: ${contextPrompt || 'General Technical Interview'}

[Question Extracted from Screen]:
${question}`;

    const payload = {
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [
        {
          parts: [{ text: fullPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
      },
    };

    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as GeminiApiResponse;
    const rawAnswer = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = parseGeminiResponse(rawAnswer);

    return {
      id: `sol-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      questionText: question,
      code: parsed.code,
      explanation: parsed.explanation,
      complexity: parsed.complexity,
      rawResponse: rawAnswer,
    };
  }
}
