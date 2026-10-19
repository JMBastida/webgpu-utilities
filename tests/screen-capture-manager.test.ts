import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScreenCaptureManager } from '../src/chat-translator/screen-capture-manager';

describe('ScreenCaptureManager', () => {
  let videoEl: HTMLVideoElement;

  beforeEach(() => {
    videoEl = document.createElement('video');
    Object.defineProperty(videoEl, 'videoWidth', { value: 1920, configurable: true });
    Object.defineProperty(videoEl, 'videoHeight', { value: 1080, configurable: true });
  });

  it('starts screen capture via getDisplayMedia and stops capture', async () => {
    const mockTrack = {
      stop: vi.fn(),
      addEventListener: vi.fn(),
    };
    const mockStream = {
      getVideoTracks: () => [mockTrack],
      getTracks: () => [mockTrack],
    } as unknown as MediaStream;

    navigator.mediaDevices = {
      getDisplayMedia: () => Promise.resolve(mockStream),
    } as unknown as MediaDevices;

    const manager = new ScreenCaptureManager(videoEl);
    const stream = await manager.startCapture();

    expect(stream).toBe(mockStream);
    expect(manager.isCapturing()).toBe(true);

    manager.stopCapture();
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(manager.isCapturing()).toBe(false);
  });

  it('triggers onEnded callback when media track ends', async () => {
    let trackEndedHandler: (() => void) | undefined;
    const mockTrack = {
      stop: vi.fn(),
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'ended') trackEndedHandler = handler;
      }),
    };
    const mockStream = {
      getVideoTracks: () => [mockTrack],
      getTracks: () => [mockTrack],
    } as unknown as MediaStream;

    navigator.mediaDevices = {
      getDisplayMedia: () => Promise.resolve(mockStream),
    } as unknown as MediaDevices;

    const manager = new ScreenCaptureManager(videoEl);
    const endedSpy = vi.fn();
    manager.onEnded(endedSpy);

    await manager.startCapture();
    expect(trackEndedHandler).toBeDefined();

    trackEndedHandler?.();
    expect(endedSpy).toHaveBeenCalled();
    expect(manager.isCapturing()).toBe(false);
  });

  it('captures a canvas frame from the video element', () => {
    const manager = new ScreenCaptureManager(videoEl);
    const canvas = manager.captureFrame();

    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1080);
  });

  it('throws descriptive error if getDisplayMedia is not available', async () => {
    // @ts-expect-error simulating unsupported browser
    navigator.mediaDevices = undefined;

    const manager = new ScreenCaptureManager(videoEl);
    await expect(manager.startCapture()).rejects.toThrow(
      'Screen capture (getDisplayMedia) is not supported in this browser.'
    );
  });
});
