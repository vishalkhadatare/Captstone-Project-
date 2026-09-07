// Client-side Web Audio API Microphone Activity Monitor
// Measures audio decibels/volume and flags continuous suspicious noise or track disconnection

export interface AudioMonitorConfig {
  threshold?: number; // 0 to 1 scale, default 0.28
  noiseDurationThresholdMs?: number; // default 1800ms
  onAudioActivity?: (avgVolume: number) => void;
  onMicrophoneDisabled?: () => void;
  onVolumeChange?: (volumePercent: number) => void;
}

export class AudioMonitor {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private animationId: number | null = null;
  private continuousLoudStart: number | null = null;
  private lastAlertTime = 0;
  private isRunning = false;

  private config: Required<AudioMonitorConfig>;

  constructor(config: AudioMonitorConfig = {}) {
    this.config = {
      threshold: config.threshold ?? 0.28,
      noiseDurationThresholdMs: config.noiseDurationThresholdMs ?? 1800,
      onAudioActivity: config.onAudioActivity ?? (() => {}),
      onMicrophoneDisabled: config.onMicrophoneDisabled ?? (() => {}),
      onVolumeChange: config.onVolumeChange ?? (() => {}),
    };
  }

  public start(stream: MediaStream): boolean {
    if (this.isRunning) return true;
    try {
      this.stream = stream;

      // Monitor stream tracks
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        this.config.onMicrophoneDisabled();
        return false;
      }

      audioTracks[0].onended = () => {
        this.config.onMicrophoneDisabled();
      };
      audioTracks[0].onmute = () => {
        this.config.onMicrophoneDisabled();
      };

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return false;

      this.audioCtx = new AudioCtxClass();
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;

      this.source = this.audioCtx.createMediaStreamSource(stream);
      this.source.connect(this.analyser);

      this.isRunning = true;
      this.loop();
      return true;
    } catch (err) {
      console.warn('Audio monitor start failure:', err);
      return false;
    }
  }

  private loop = () => {
    if (!this.isRunning || !this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    const normalized = average / 255; // 0 to 1
    const percent = Math.min(100, Math.round(normalized * 100));

    this.config.onVolumeChange(percent);

    const now = Date.now();
    if (normalized > this.config.threshold) {
      if (!this.continuousLoudStart) {
        this.continuousLoudStart = now;
      } else if (
        now - this.continuousLoudStart >= this.config.noiseDurationThresholdMs &&
        now - this.lastAlertTime > 10000 // Don't spam events more than once per 10s
      ) {
        this.lastAlertTime = now;
        this.config.onAudioActivity(Number(normalized.toFixed(2)));
        this.continuousLoudStart = null;
      }
    } else {
      this.continuousLoudStart = null;
    }

    this.animationId = requestAnimationFrame(this.loop);
  };

  public stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch {}
      this.source = null;
    }
    if (this.audioCtx) {
      try { this.audioCtx.close(); } catch {}
      this.audioCtx = null;
    }
    this.analyser = null;
    this.stream = null;
    this.continuousLoudStart = null;
  }
}

