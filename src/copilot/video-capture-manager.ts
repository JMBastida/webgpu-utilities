import type { VideoDeviceOption } from './types';

export class VideoCaptureManager {
  private readonly videoElement: HTMLVideoElement;
  private currentStream: MediaStream | null = null;
  private currentDeviceId: string | null = null;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
  }

  async getAvailableDevices(): Promise<VideoDeviceOption[]> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return [];
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${index + 1}`,
      }));
  }

  async startStream(deviceId?: string): Promise<MediaStream> {
    this.stopStream();

    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.currentStream = stream;
    this.currentDeviceId = deviceId ?? null;
    this.videoElement.srcObject = stream;
    await this.videoElement.play().catch(() => {});
    return stream;
  }

  stopStream(): void {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach((track) => track.stop());
      this.currentStream = null;
    }
    this.videoElement.srcObject = null;
  }

  captureFrame(): HTMLCanvasElement {
    const width = this.videoElement.videoWidth || 640;
    const height = this.videoElement.videoHeight || 480;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(this.videoElement, 0, 0, width, height);
    }
    return canvas;
  }

  getCurrentDeviceId(): string | null {
    return this.currentDeviceId;
  }
}
