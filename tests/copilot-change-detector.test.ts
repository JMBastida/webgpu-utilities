import { describe, it, expect } from 'vitest';
import {
  normalizeOcrText,
  calculateTextSimilarity,
  ChangeDetector,
} from '../src/copilot/change-detector';

describe('ChangeDetector', () => {
  it('normalizes text by stripping line numbers, cursor markers, and extra whitespace', () => {
    const raw = '  1 |  SELECT * FROM users;  \n 2 |  WHERE id = 5 |  ';
    const norm = normalizeOcrText(raw);
    expect(norm).toBe('select * from users; where id = 5');
  });

  it('calculates 1.0 similarity for identical text and low similarity for different text', () => {
    const text1 = 'write a query to find the second highest salary';
    const text2 = 'write a query to find the second highest salary';
    const text3 = 'implement a binary search tree in java';

    expect(calculateTextSimilarity(text1, text2)).toBe(1.0);
    expect(calculateTextSimilarity(text1, text3)).toBeLessThan(0.4);
  });

  it('detects new question when text substantially changes', () => {
    const detector = new ChangeDetector({ similarityThreshold: 0.8, minLength: 15 });

    // Initial task
    const q1 = 'Write a SQL query to get the employee count by department';
    const eval1 = detector.evaluate(q1);
    expect(eval1.isNoise).toBe(false);
    expect(eval1.isNewQuestion).toBe(true);

    detector.markSolved(q1);

    // Minor screen flicker / cursor movement should not trigger new question
    const q1WithFlicker = 'Write a SQL query to get the employee count by department |';
    const eval2 = detector.evaluate(q1WithFlicker);
    expect(eval2.isNewQuestion).toBe(false);

    // Completely new problem appeared
    const q2 = 'Given an array of integers nums, return indices of the two numbers';
    const eval3 = detector.evaluate(q2);
    expect(eval3.isNewQuestion).toBe(true);
  });

  it('rejects noise below minimum length', () => {
    const detector = new ChangeDetector({ minLength: 15 });
    const evalNoise = detector.evaluate('1 | SELECT');
    expect(evalNoise.isNoise).toBe(true);
    expect(evalNoise.isNewQuestion).toBe(false);
  });
});
