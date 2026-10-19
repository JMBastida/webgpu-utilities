import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoCaptureManager } from '../src/copilot/video-capture-manager';

describe('VideoCaptureManager', () => {
  let videoEl: HTMLVideoElement;

  beforeEach(() => {
    videoEl = document.createElement('video');
    Object.defineProperty(videoEl, 'videoWidth', { value: 1920, configurable: true });
    Object.defineProperty(videoEl, 'videoHeight', { value: 1080, configurable: true });
  });

  it('enumerates video devices', async () => {
    const mockDevices = [
      { kind: 'videoinput', deviceId: 'cam1', label: 'USB External Cam' },
      { kind: 'audioinput', deviceId: 'mic1', label: 'Mic' },
    ];

    navigator.mediaDevices = {
      enumerateDevices: () => Promise.resolve(mockDevices as MediaDeviceInfo[]),
      getUserMedia: vi.fn(),
    } as unknown as MediaDevices;

    const manager = new VideoCaptureManager(videoEl);
    const devices = await manager.getAvailableDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0]?.deviceId).toBe('cam1');
    expect(devices[0]?.label).toBe('USB External Cam');
  });

  it('captures a canvas frame from video at native resolution', () => {
    const manager = new VideoCaptureManager(videoEl);
    const frame = manager.captureFrame();
    expect(frame.width).toBe(1920);
    expect(frame.height).toBe(1080);
  });
});
