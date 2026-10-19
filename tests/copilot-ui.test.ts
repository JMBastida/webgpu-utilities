import { describe, it, expect, beforeEach } from 'vitest';
import { renderCopilotTemplate } from '../src/copilot/copilot-template';
import { getAppTemplate } from '../src/app-template';
import { CopilotUi } from '../src/copilot/copilot-ui';
import type { CopilotController } from '../src/copilot/copilot-controller';
import type { VideoCaptureManager } from '../src/copilot/video-capture-manager';
import type { SolutionResult } from '../src/copilot/types';

describe('Copilot UI Template & Rendering', () => {
  beforeEach(() => {
    document.body.innerHTML = renderCopilotTemplate();
  });

  it('renders all required elements for autonomous copilot dashboard', () => {
    expect(document.getElementById('copilot-video')).not.toBeNull();
    expect(document.getElementById('copilot-status-pill')).not.toBeNull();
    expect(document.getElementById('copilot-camera-select')).not.toBeNull();
    expect(document.getElementById('copilot-auto-toggle')).not.toBeNull();
    expect(document.getElementById('copilot-force-solve-btn')).not.toBeNull();
    expect(document.getElementById('copilot-solution-code')).not.toBeNull();
    expect(document.getElementById('copilot-solution-bullets')).not.toBeNull();
    expect(document.getElementById('copilot-history-list')).not.toBeNull();
  });

  it('updates status pill text and class correctly', () => {
    const mockController = {
      updateConfig: () => {},
      forceSolve: async () => {},
      start: () => {},
      stop: () => {},
      getConfig: () => ({}),
    } as unknown as CopilotController;

    const mockVideoManager = {
      getAvailableDevices: () => Promise.resolve([]),
      startStream: () => Promise.resolve({} as MediaStream),
    } as unknown as VideoCaptureManager;

    const ui = new CopilotUi(document.body, mockController, mockVideoManager);
    ui.updateStatus('SOLVING', 'Working on answer...');

    const pill = document.getElementById('copilot-status-pill');
    const statusText = document.getElementById('copilot-status-text');
    const statusDetail = document.getElementById('copilot-status-detail');

    expect(pill?.className).toContain('status-solving');
    expect(statusText?.textContent).toBe('SOLVING');
    expect(statusDetail?.textContent).toBe('Working on answer...');
  });

  it('renders solution result into code block and bullet points', () => {
    const mockController = {
      updateConfig: () => {},
      forceSolve: async () => {},
      start: () => {},
      stop: () => {},
      getConfig: () => ({}),
    } as unknown as CopilotController;

    const mockVideoManager = {
      getAvailableDevices: () => Promise.resolve([]),
      startStream: () => Promise.resolve({} as MediaStream),
    } as unknown as VideoCaptureManager;

    const ui = new CopilotUi(document.body, mockController, mockVideoManager);

    const solution: SolutionResult = {
      id: 'sol-1',
      timestamp: Date.now(),
      questionText: 'Find second highest salary in SQL',
      code: 'SELECT MAX(salary) FROM employees WHERE salary < (SELECT MAX(salary) FROM employees);',
      explanation: ['Uses subquery to exclude highest salary', 'Handles ties cleanly'],
      complexity: 'O(N) time and O(1) space',
    };

    ui.displaySolution(solution);

    const codeEl = document.getElementById('copilot-solution-code');
    const bulletsEl = document.getElementById('copilot-solution-bullets');
    const complexityEl = document.getElementById('copilot-solution-complexity');

    expect(codeEl?.textContent).toContain('SELECT MAX(salary)');
    expect(bulletsEl?.children.length).toBe(2);
    expect(complexityEl?.textContent).toContain('O(N) time');
  });
});

describe('Main App Mode Navigation', () => {
  it('includes mode navigation tabs and containers in getAppTemplate', () => {
    const template = getAppTemplate();
    expect(template).toContain('id="nav-mode-ocr"');
    expect(template).toContain('id="nav-mode-copilot"');
    expect(template).toContain('id="ocr-view-container"');
    expect(template).toContain('id="copilot-view-container"');
  });
});
