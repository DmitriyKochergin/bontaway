import { type MusicStyle } from "../AudioSystem";
import { type VolumeMixer } from "./VolumeMixer";

const DORIAN_SCALE = [220, 247.5, 264, 293.3, 330, 367.5, 396, 440];

export class MusicDirector {
  private droneOscillator: OscillatorNode | null = null;
  private droneGain: GainNode | null = null;
  private droneLfo: OscillatorNode | null = null;
  private melodyOscillator: OscillatorNode | null = null;
  private melodyGain: GainNode | null = null;
  private isPlaying = false;
  private melodyTimeoutId: number | null = null;
  private currentStyle: MusicStyle = "exploration";
  private currentNoteIndex = 0;

  constructor(
    private readonly audioContext: AudioContext | null,
    private readonly volumeMixer: VolumeMixer
  ) {}

  start(style: MusicStyle = "exploration"): void {
    if (!this.audioContext) {
      return;
    }

    if (this.audioContext.state === "suspended") {
      void this.audioContext.resume();
    }

    if (this.isPlaying && this.currentStyle === style) {
      return;
    }

    if (this.isPlaying) {
      this.currentStyle = style;
      return;
    }

    this.currentStyle = style;
    this.isPlaying = true;
    this.currentNoteIndex = 0;

    if (this.volumeMixer.getEffectiveMusicVolume() <= 0) {
      return;
    }

    this.createDrone();
    this.scheduleNextNote();
  }

  stop(): void {
    if (!this.audioContext || !this.isPlaying) {
      return;
    }

    this.isPlaying = false;
    this.clearMelodyTimer();

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

  updateVolume(): void {
    if (!this.audioContext) {
      return;
    }

    const effectiveVolume = this.volumeMixer.getEffectiveMusicVolume();
    if (effectiveVolume === 0) {
      this.clearMelodyTimer();
      this.stopNodesImmediately();
      return;
    }

    let createdDrone = false;
    if (!this.droneOscillator && this.isPlaying) {
      this.createDrone();
      createdDrone = true;
    }

    if (this.isPlaying && this.melodyTimeoutId === null) {
      this.scheduleNextNote();
    }

    if (this.droneGain && !createdDrone) {
      const now = this.audioContext.currentTime;
      this.droneGain.gain.cancelScheduledValues(now);
      this.droneGain.gain.setValueAtTime(this.getDroneBaseVolume() * effectiveVolume, now);
    }
  }

  private createDrone(): void {
    if (!this.audioContext || this.volumeMixer.getEffectiveMusicVolume() <= 0) {
      return;
    }

    this.droneOscillator = this.audioContext.createOscillator();
    this.droneGain = this.audioContext.createGain();
    this.droneOscillator.type = "sine";
    this.droneOscillator.frequency.value = 110;
    this.droneGain.gain.value = 0;

    this.droneOscillator.connect(this.droneGain);
    this.droneGain.connect(this.audioContext.destination);
    this.droneOscillator.start();

    const now = this.audioContext.currentTime;
    this.droneGain.gain.setValueAtTime(0, now);
    this.droneGain.gain.linearRampToValueAtTime(
      this.getDroneBaseVolume() * this.volumeMixer.getEffectiveMusicVolume(),
      now + 2
    );
    this.addDroneWobble();
  }

  private addDroneWobble(): void {
    if (!this.audioContext || !this.droneGain) {
      return;
    }

    if (this.droneLfo) {
      this.droneLfo.stop();
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
    if (!this.isPlaying || !this.audioContext) {
      return;
    }

    if (this.volumeMixer.getEffectiveMusicVolume() <= 0) {
      this.melodyTimeoutId = null;
      return;
    }

    this.playMelodyNote();
    const [minDelay, maxDelay] = this.getNoteDelayRange();
    this.melodyTimeoutId = window.setTimeout(() => {
      this.melodyTimeoutId = null;
      this.generateNextNote();
      this.scheduleNextNote();
    }, minDelay + Math.random() * (maxDelay - minDelay));
  }

  private generateNextNote(): void {
    const chance = Math.random();
    if (chance < 0.2) {
      return;
    }

    const offset = chance < 0.9 ? (Math.random() < 0.5 ? -1 : 1) : Math.random() < 0.5 ? -2 : 2;
    this.currentNoteIndex = Math.max(0, Math.min(DORIAN_SCALE.length - 1, this.currentNoteIndex + offset));

    if (this.currentStyle === "combat" && Math.random() < 0.3) {
      this.currentNoteIndex = Math.random() < 0.5 ? 2 : 6;
    }
  }

  private playMelodyNote(): void {
    if (!this.audioContext || this.volumeMixer.getEffectiveMusicVolume() <= 0) {
      return;
    }

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = DORIAN_SCALE[this.currentNoteIndex];

    const noteVolume = this.getMelodyBaseVolume() * this.volumeMixer.getEffectiveMusicVolume();
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

  private getDroneBaseVolume(): number {
    return this.currentStyle === "shrine" ? 0.06 : 0.08;
  }

  private getMelodyBaseVolume(): number {
    switch (this.currentStyle) {
      case "combat":
        return 0.15;
      case "shrine":
        return 0.1;
      case "exploration":
        return 0.12;
    }
  }

  private getNoteDelayRange(): [number, number] {
    switch (this.currentStyle) {
      case "combat":
        return [1000, 2000];
      case "shrine":
        return [3000, 5000];
      case "exploration":
        return [2000, 4000];
    }
  }

  private clearMelodyTimer(): void {
    if (this.melodyTimeoutId !== null) {
      clearTimeout(this.melodyTimeoutId);
      this.melodyTimeoutId = null;
    }
  }

  private stopNodesImmediately(): void {
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
  }
}

