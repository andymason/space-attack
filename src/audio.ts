import type { GameEvent } from './game/model';

export class ArcadeAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private active = new Set<AudioScheduledSourceNode>();
  enabled = true;

  async unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.14;
        this.master.connect(this.context.destination);
        this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
        const values = this.noise.getChannelData(0);
        for (let i = 0; i < values.length; i++) values[i] = Math.random() * 2 - 1;
      }
      if (this.context.state === 'suspended') await this.context.resume();
    } catch { /* Play silently when audio is unavailable. */ }
  }

  hush() {
    for (const source of this.active) { try { source.stop(); } catch { /* Already ended. */ } }
    this.active.clear();
  }

  private tone(from: number, to: number, duration: number, offset = 0, type: OscillatorType = 'square', gain = 0.5) {
    if (!this.context || !this.master) return;
    const time = this.context.currentTime + offset;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(10, to), time + duration);
    envelope.gain.setValueAtTime(0.001, time);
    envelope.gain.linearRampToValueAtTime(gain, time + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(envelope); envelope.connect(this.master);
    this.active.add(oscillator);
    oscillator.onended = () => { this.active.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(time); oscillator.stop(time + duration + 0.01);
  }

  play(event: GameEvent) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    switch (event.kind) {
      case 'shot': this.tone(1050, 180, 0.12, 0, 'square', 0.23); break;
      case 'attack': this.tone(520, 85, 0.42, 0, 'sawtooth', 0.32); break;
      case 'hit': this.tone(280, 60, 0.17, 0, 'square', 0.55); break;
      case 'warning': this.tone(330, 330, 0.14, 0, 'square', 0.2); break;
      case 'wave': [262, 330, 392, 524].forEach((pitch, i) => this.tone(pitch, pitch, 0.18, i * 0.13)); break;
      case 'bonus': [524, 659, 784, 1048].forEach((pitch, i) => this.tone(pitch, pitch, 0.16, i * 0.09)); break;
      case 'explosion': {
        this.tone(110, 20, 0.7, 0, 'sawtooth', 0.65);
        if (!this.noise || !this.master) break;
        const source = this.context.createBufferSource();
        source.buffer = this.noise;
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 1100;
        const envelope = this.context.createGain();
        const time = this.context.currentTime;
        envelope.gain.setValueAtTime(0.6, time);
        envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.75);
        source.connect(filter); filter.connect(envelope); envelope.connect(this.master);
        this.active.add(source);
        source.onended = () => { this.active.delete(source); source.disconnect(); filter.disconnect(); envelope.disconnect(); };
        source.start(); source.stop(time + 0.8);
        break;
      }
    }
  }
}
