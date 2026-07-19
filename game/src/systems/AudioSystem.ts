import Phaser from "phaser";
import { SettingsManager } from "./SettingsManager";

export type MusicStyle = "exploration" | "combat" | "shrine";

// Dorian mode frequencies starting from A (220 Hz)
const DORIAN_SCALE = [
  220,    // A (root)
  247.5,  // B (major 2nd)
  264,    // C (minor 3rd)
  293.3,  // D (perfect 4th)
  330,    // E (perfect 5th)
  367.5,  // F# (major 6th)
  396,    // G (minor 7th)
  440,    // A (octave)
];

export class AudioSystem {
  private audioContext: AudioContext | null = null;
  private readonly soundBuffers = new Map<string, AudioBuffer>();
  private readonly unlockHandler = () => {
    if (this.audioContext && this.audioContext.state === "suspended") {
      void this.audioContext.resume();
    }
  };

  private droneOscillator: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private droneLfo: OscillatorNode | null = null;
  private melodyOscillator: OscillatorNode | null = null;
  private melodyGain: GainNode | null = null;
  private isPlayingMusic = false;
  private melodyTimeoutId: number | null = null;
  private currentStyle: MusicStyle = "exploration";
  private currentNoteIndex = 0;

  private masterVolume = 1;
  private musicVolume = 1;
  private sfxVolume = 1;

  constructor(_scene: Phaser.Scene) {
    this.masterVolume = SettingsManager.getMasterVolume();
    this.musicVolume = SettingsManager.getMusicVolume();
    this.sfxVolume = SettingsManager.getSFXVolume();
    this.initAudio();
  }

  private initAudio(): void {
    try {
      this.audioContext = new AudioContext();
      this.generateAllSounds();
      document.addEventListener("click", this.unlockHandler);
      document.addEventListener("keydown", this.unlockHandler);
    } catch {
      this.audioContext = null;
    }
  }

  private generateAllSounds(): void {
    if (!this.audioContext) {
      return;
    }

    this.createSound("sfx_attack", 0.1, (t) => Math.sin(880 * Math.PI * 2 * t) * Math.exp(-t * 30) * 0.3);
    this.createSound("sfx_hit", 0.15, (t) => Math.sin(150 * Math.PI * 2 * t) * Math.exp(-t * 20) * 0.4);
    this.createSound("sfx_pickup", 0.2, (t) => {
      const frequency = 600 + t * 400;
      return Math.sin(frequency * Math.PI * 2 * t) * Math.exp(-t * 8) * 0.25;
    });
    this.createSound("sfx_levelup", 0.5, (t) => {
      const toneA = Math.sin(440 * Math.PI * 2 * t) * (t < 0.15 ? 1 : 0);
      const toneB = Math.sin(554 * Math.PI * 2 * t) * (t >= 0.15 && t < 0.3 ? 1 : 0);
      const toneC = Math.sin(659 * Math.PI * 2 * t) * (t >= 0.3 ? 1 : 0);
      return (toneA + toneB + toneC) * Math.exp(-t * 2) * 0.3;
    });
    this.createSound("sfx_enemy_death", 0.2, (t) => Math.sin(200 * Math.PI * 2 * t * (1 - t)) * Math.exp(-t * 10) * 0.3);
    this.createSound("sfx_hurt", 0.15, (t) => (Math.random() * 2 - 1) * Math.exp(-t * 15) * 0.2);
    this.createSound("sfx_stairs", 0.4, (t) => {
      const frequency = 300 + t * 200;
      return Math.sin(frequency * Math.PI * 2 * t) * Math.exp(-t * 3) * 0.25;
    });
    this.createSound("sfx_potion", 0.3, (t) => Math.sin(500 * Math.PI * 2 * t + Math.sin(8 * Math.PI * 2 * t) * 50) * Math.exp(-t * 5) * 0.2);
    this.createSound("sfx_whisper", 0.6, (t) => {
      const noise = (Math.random() * 2 - 1) * 0.3;
      const toneA = Math.sin(180 * Math.PI * 2 * t) * 0.1;
      const toneB = Math.sin(220 * Math.PI * 2 * t) * 0.08;
      const envelope = Math.sin((Math.PI * t) / 0.6) * Math.exp(-t * 2);
      return (noise + toneA + toneB) * envelope * 0.15;
    });
    this.createSound("sfx_tablet", 0.25, (t) => {
      const noise = Math.random() * 2 - 1;
      const tone = Math.sin(120 * Math.PI * 2 * t);
      return (noise * 0.3 + tone * 0.2) * Math.exp(-t * 8) * 0.2;
    });
  }

  private createSound(key: string, duration: number, generator: (t: number) => number): void {
    if (!this.audioContext) {
      return;
    }

    const sampleRate = this.audioContext.sampleRate;
    const buffer = this.audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let index = 0; index < buffer.length; index++) {
      const t = index / sampleRate;
      data[index] = generator(t);
    }

    this.soundBuffers.set(key, buffer);
  }

  play(key: string, volume = 0.5): void {
    if (!this.audioContext) {
      return;
    }

    const buffer = this.soundBuffers.get(key);
    if (!buffer) {
      return;
    }

    if (this.audioContext.state === "suspended") {
      void this.audioContext.resume();
    }

    const source = this.audioContext.createBufferSource();
    const gainNode = this.audioContext.createGain();
    source.buffer = buffer;
    gainNode.gain.value = Math.max(0, Math.min(1, volume)) * this.masterVolume * this.sfxVolume;
    source.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    source.start();
  }

  startMusic(style: MusicStyle = "exploration"): void {
    if (!this.audioContext) {
      return;
    }

    if (this.audioContext.state === "suspended") {
      void this.audioContext.resume();
    }

    if (this.isPlayingMusic && this.currentStyle === style) {
      return;
    }

    if (this.isPlayingMusic) {
      this.currentStyle = style;
      return;
    }

    this.currentStyle = style;
    this.isPlayingMusic = true;
    this.currentNoteIndex = 0;

    if (this.getEffectiveMusicVolume() <= 0) {
      return;
    }

    this.createDrone();
    this.scheduleNextNote();
  }

  stopMusic(): void {
    if (!this.audioContext || !this.isPlayingMusic) {
      return;
    }

    this.isPlayingMusic = false;

    if (this.melodyTimeoutId !== null) {
      clearTimeout(this.melodyTimeoutId);
      this.melodyTimeoutId = null;
    }

    if (this.droneGain && this.droneOscillator) {
      const now = this.audioContext.currentTime;
      this.droneGain.gain.setValueAtTime(this.droneGain.gain.value, now);
      this.droneGain.gain.linearRampToValueAtTime(0, now + 1);
      this.droneOscillator.stop(now + 1.1);
      this.droneOscillator = null;
      this.droneGain = null;
    }

    if (this.droneLfo) {
      this.droneLfo.stop();
      this.droneLfo = null;
    }

    if (this.melodyGain && this.melodyOscillator) {
      const now = this.audioContext.currentTime;
      this.melodyGain.gain.setValueAtTime(this.melodyGain.gain.value, now);
      this.melodyGain.gain.linearRampToValueAtTime(0, now + 0.5);
      this.melodyOscillator.stop(now + 0.6);
      this.melodyOscillator = null;
      this.melodyGain = null;
    }
  }

  destroy(): void {
    this.stopMusic();
    document.removeEventListener("click", this.unlockHandler);
    document.removeEventListener("keydown", this.unlockHandler);
    void this.audioContext?.close();
    this.audioContext = null;
  }

  private createDrone(): void {
    if (!this.audioContext) {
      return;
    }

    if (this.getEffectiveMusicVolume() <= 0) {
      return;
    }

    this.droneOscillator = this.audioContext.createOscillator();
    this.droneGain = this.audioContext.createGain();
    this.droneOscillator.type = "sine";
    this.droneOscillator.frequency.value = 110;

    const baseVolume = this.currentStyle === "shrine" ? 0.06 : 0.08;
    const droneVolume = baseVolume * this.getEffectiveMusicVolume();
    this.droneGain.gain.value = 0;

    this.droneOscillator.connect(this.droneGain);
    this.droneGain.connect(this.audioContext.destination);
    this.droneOscillator.start();

    const now = this.audioContext.currentTime;
    this.droneGain.gain.setValueAtTime(0, now);
    this.droneGain.gain.linearRampToValueAtTime(droneVolume, now + 2);
    this.addDroneWobble();
  }

  private addDroneWobble(): void {
    if (!this.audioContext || !this.droneGain) {
      return;
    }

    if (this.droneLfo) {
      this.droneLfo.stop();
      this.droneLfo = null;
    }

    this.droneLfo = this.audioContext.createOscillator();
    const lfoGain = this.audioContext.createGain();
    this.droneLfo.type = "sine";
    this.droneLfo.frequency.value = 0.1;
    lfoGain.gain.value = 0.02;
    this.droneLfo.connect(lfoGain);
    lfoGain.connect(this.droneGain.gain);
    this.droneLfo.start();
  }

  private scheduleNextNote(): void {
    if (!this.isPlayingMusic || !this.audioContext) {
      return;
    }

    if (this.getEffectiveMusicVolume() <= 0) {
      this.melodyTimeoutId = null;
      return;
    }

    this.playMelodyNote();

    let minDelay: number;
    let maxDelay: number;
    switch (this.currentStyle) {
      case "combat":
        minDelay = 1000;
        maxDelay = 2000;
        break;
      case "shrine":
        minDelay = 3000;
        maxDelay = 5000;
        break;
      case "exploration":
      default:
        minDelay = 2000;
        maxDelay = 4000;
        break;
    }

    const delay = minDelay + Math.random() * (maxDelay - minDelay);
    this.melodyTimeoutId = window.setTimeout(() => {
      this.melodyTimeoutId = null;
      this.generateNextNote();
      this.scheduleNextNote();
    }, delay);
  }

  private generateNextNote(): void {
    const chance = Math.random();

    if (chance < 0.2) {
      return;
    }

    if (chance < 0.9) {
      const direction = Math.random() < 0.5 ? -1 : 1;
      this.currentNoteIndex = Math.max(0, Math.min(DORIAN_SCALE.length - 1, this.currentNoteIndex + direction));
    } else {
      const leap = Math.random() < 0.5 ? -2 : 2;
      this.currentNoteIndex = Math.max(0, Math.min(DORIAN_SCALE.length - 1, this.currentNoteIndex + leap));
    }

    if (this.currentStyle === "combat" && Math.random() < 0.3) {
      this.currentNoteIndex = Math.random() < 0.5 ? 2 : 6;
    }
  }

  private playMelodyNote(): void {
    if (!this.audioContext || this.getEffectiveMusicVolume() <= 0) {
      return;
    }

    const frequency = DORIAN_SCALE[this.currentNoteIndex];
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    let baseVolume: number;
    switch (this.currentStyle) {
      case "combat":
        baseVolume = 0.15;
        break;
      case "shrine":
        baseVolume = 0.1;
        break;
      case "exploration":
      default:
        baseVolume = 0.12;
        break;
    }

    const noteVolume = baseVolume * this.getEffectiveMusicVolume();
    const now = this.audioContext.currentTime;

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(noteVolume, now + 0.3);
    gainNode.gain.setValueAtTime(noteVolume, now + 0.3);
    gainNode.gain.linearRampToValueAtTime(noteVolume * 0.7, now + 1.5);
    gainNode.gain.linearRampToValueAtTime(0, now + 2.5);

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 2.6);

    this.melodyOscillator = oscillator;
    this.melodyGain = gainNode;
  }

  private getEffectiveMusicVolume(): number {
    return this.masterVolume * this.musicVolume;
  }

  setMasterVolume(value: number): void {
    this.masterVolume = Math.max(0, Math.min(1, value));
    SettingsManager.setMasterVolume(this.masterVolume);
    this.updateDroneVolume();
  }

  setMusicVolume(value: number): void {
    this.musicVolume = Math.max(0, Math.min(1, value));
    SettingsManager.setMusicVolume(this.musicVolume);
    this.updateDroneVolume();
  }

  setSFXVolume(value: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, value));
    SettingsManager.setSFXVolume(this.sfxVolume);
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  getMusicVolume(): number {
    return this.musicVolume;
  }

  getSFXVolume(): number {
    return this.sfxVolume;
  }

  private updateDroneVolume(): void {
    if (!this.audioContext) {
      return;
    }

    const effectiveVolume = this.getEffectiveMusicVolume();
    if (effectiveVolume === 0) {
      if (this.melodyTimeoutId !== null) {
        clearTimeout(this.melodyTimeoutId);
        this.melodyTimeoutId = null;
      }

      if (this.droneLfo) {
        this.droneLfo.stop();
        this.droneLfo = null;
      }

      if (this.droneOscillator) {
        this.droneOscillator.stop();
        this.droneOscillator = null;
      }

      this.droneGain = null;

      if (this.melodyOscillator) {
        this.melodyOscillator.stop();
        this.melodyOscillator = null;
      }

      this.melodyGain = null;
      return;
    }

    let createdDrone = false;
    if (!this.droneOscillator && this.isPlayingMusic) {
      this.createDrone();
      createdDrone = true;
    }

    if (this.isPlayingMusic && this.melodyTimeoutId === null) {
      this.scheduleNextNote();
    }

    if (this.droneGain && !createdDrone) {
      const baseVolume = this.currentStyle === "shrine" ? 0.06 : 0.08;
      const now = this.audioContext.currentTime;
      this.droneGain.gain.cancelScheduledValues(now);
      this.droneGain.gain.setValueAtTime(baseVolume * effectiveVolume, now);
    }
  }
}


