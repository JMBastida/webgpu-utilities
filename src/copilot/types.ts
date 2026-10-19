export interface NormalizedRoi {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CopilotState = 'WATCHING' | 'STABILIZING' | 'SOLVING' | 'SOLVED' | 'PAUSED' | 'ERROR';

export type ContextPreset = 'sql' | 'java' | 'general' | 'custom';

export interface SolutionResult {
  id: string;
  timestamp: number;
  questionText: string;
  code: string;
  explanation: string[];
  complexity?: string;
  rawResponse?: string;
}

export interface VideoDeviceOption {
  deviceId: string;
  label: string;
}

export interface CopilotConfig {
  geminiApiKey: string;
  geminiModel: string;
  cameraDeviceId: string;
  roi: NormalizedRoi;
  contextPreset: ContextPreset;
  customContext: string;
  scanIntervalSec: number;
  autoEnabled: boolean;
}
