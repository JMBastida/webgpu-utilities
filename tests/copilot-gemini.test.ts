import { describe, it, expect, vi } from 'vitest';
import { GeminiSolver, parseGeminiResponse } from '../src/copilot/gemini-client';

describe('GeminiSolver & Response Parser', () => {
  it('parses code blocks, bullet explanations, and complexity from raw markdown', () => {
    const raw = `
\`\`\`sql
SELECT department_id, COUNT(*) as emp_count
FROM employees
GROUP BY department_id
HAVING COUNT(*) > 5;
\`\`\`

- Uses GROUP BY to aggregate employees per department.
- HAVING filters groups after aggregation.

Complexity: O(N) time and O(K) space where K is number of departments.
`;

    const parsed = parseGeminiResponse(raw);
    expect(parsed.code).toContain('SELECT department_id');
    expect(parsed.explanation.length).toBeGreaterThanOrEqual(2);
    expect(parsed.complexity).toContain('O(N)');
  });

  it('sends correct payload to Gemini REST API and returns structured SolutionResult', async () => {
    const mockResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: '```java\nclass Solution {}\n```\n- Optimal binary search.\nComplexity: O(log N)',
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

    const solver = new GeminiSolver({
      apiKey: 'test-api-key',
      model: 'gemini-2.5-flash',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const result = await solver.solve('Find target in sorted array', 'Java Specialist');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const firstCall = mockFetch.mock.calls[0] as [string, RequestInit];
    const fetchUrl = firstCall[0];
    expect(fetchUrl).toContain('gemini-2.5-flash:generateContent?key=test-api-key');

    expect(result.code).toContain('class Solution');
    expect(result.explanation).toContain('Optimal binary search.');
    expect(result.complexity).toContain('O(log N)');
  });

  it('throws informative error on API error (e.g. 401 invalid key)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('API key not valid'),
    });

    const solver = new GeminiSolver({
      apiKey: 'bad-key',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    await expect(solver.solve('query', 'context')).rejects.toThrow(/Gemini API Error 401/);
  });

  it('does not invoke fetch with illegal invocation (ensures window/global context)', async () => {
    const fakeNativeFetch = function (this: unknown): Promise<Response> {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ candidates: [] }),
      } as unknown as Response);
    };

    const solver = new GeminiSolver({
      apiKey: 'test-key',
      fetchImpl: fakeNativeFetch as unknown as typeof fetch,
    });

    await expect(solver.solve('query', 'context')).resolves.toBeDefined();
  });
});
