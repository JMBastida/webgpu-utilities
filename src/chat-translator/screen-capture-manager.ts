export class ScreenCaptureManager {
  private readonly videoElement: HTMLVideoElement;
  private currentStream: MediaStream | null = null;
  private endedCallback: (() => void) | null = null;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
  }

  async startCapture(): Promise<MediaStream> {
    this.stopCapture();

    if (!navigator?.mediaDevices?.getDisplayMedia) {
      throw new Error('Screen capture (getDisplayMedia) is not supported in this browser.');
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });

    this.currentStream = stream;
    this.videoElement.srcObject = stream;
    try {
      const playPromise = this.videoElement.play();
      if (playPromise !== undefined) {
        await playPromise;
      }
    } catch {
      // Ignore play rejection in headless/JSDOM or if autoplay is restricted
    }

    const track = stream.getVideoTracks()[0];
    if (track) {
      track.addEventListener('ended', () => {
        this.stopCapture();
        if (this.endedCallback) this.endedCallback();
      });
    }

    return stream;
  }

  stopCapture(): void {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach((t) => t.stop());
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

  isCapturing(): boolean {
    return this.currentStream !== null;
  }

  onEnded(callback: () => void): void {
    this.endedCallback = callback;
  }
}
