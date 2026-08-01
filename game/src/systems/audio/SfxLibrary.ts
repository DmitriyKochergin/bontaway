import Phaser from "phaser";
import { type VolumeMixer } from "./VolumeMixer";

export class SfxLibrary {
  private readonly soundBuffers = new Map<string, AudioBuffer>();
  private readonly activeProceduralSounds = new Map<GainNode, number>();
  private readonly activePhaserSounds = new Map<Phaser.Sound.BaseSound, number>();
  private paused = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly audioContext: AudioContext | null,
    private readonly volumeMixer: VolumeMixer
  ) {
    this.generateAllSounds();
  }

  play(key: string, volume = 0.5): void {
    if (this.paused || !this.audioContext) {
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
    const clampedVolume = clampVolume(volume);
    source.buffer = buffer;
    gainNode.gain.value = clampedVolume * this.volumeMixer.getEffectiveSFXVolume();
    source.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    this.activeProceduralSounds.set(gainNode, clampedVolume);
    source.addEventListener("ended", () => this.activeProceduralSounds.delete(gainNode), { once: true });
    source.start();
  }

  playFireballCast(volume = 0.5): void {
    this.playPhaserSound("fireball_cast", volume);
  }

  playFireballHit(volume = 0.5): void {
    this.playPhaserSound("fireball_hit", volume);
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) {
      return;
    }

    this.paused = paused;
    const effectiveVolume = this.volumeMixer.getEffectiveSFXVolume();
    for (const [gainNode, baseVolume] of this.activeProceduralSounds) {
      gainNode.gain.value = paused ? 0 : baseVolume * effectiveVolume;
    }
    for (const sound of this.activePhaserSounds.keys()) {
      if (paused) {
        sound.pause();
      } else {
        sound.resume();
      }
    }
  }

  updateVolume(): void {
    const effectiveVolume = this.volumeMixer.getEffectiveSFXVolume();
    for (const [gainNode, baseVolume] of this.activeProceduralSounds) {
      gainNode.gain.value = this.paused ? 0 : baseVolume * effectiveVolume;
    }
    for (const [sound, baseVolume] of this.activePhaserSounds) {
      sound.setVolume(baseVolume * effectiveVolume);
    }
  }

  destroy(): void {
    for (const sound of this.activePhaserSounds.keys()) {
      sound.stop();
    }
    this.activePhaserSounds.clear();
    this.activeProceduralSounds.clear();
  }

  private generateAllSounds(): void {
    this.createSound("sfx_attack", 0.1, t => Math.sin(880 * Math.PI * 2 * t) * Math.exp(-t * 30) * 0.3);
    this.createSound("sfx_hit", 0.15, t => Math.sin(150 * Math.PI * 2 * t) * Math.exp(-t * 20) * 0.4);
    this.createSound("sfx_pickup", 0.2, t => {
      const frequency = 600 + t * 400;
      return Math.sin(frequency * Math.PI * 2 * t) * Math.exp(-t * 8) * 0.25;
    });
    this.createSound("sfx_levelup", 0.5, t => {
      const toneA = Math.sin(440 * Math.PI * 2 * t) * (t < 0.15 ? 1 : 0);
      const toneB = Math.sin(554 * Math.PI * 2 * t) * (t >= 0.15 && t < 0.3 ? 1 : 0);
      const toneC = Math.sin(659 * Math.PI * 2 * t) * (t >= 0.3 ? 1 : 0);
      return (toneA + toneB + toneC) * Math.exp(-t * 2) * 0.3;
    });
    this.createSound("sfx_enemy_death", 0.2, t => Math.sin(200 * Math.PI * 2 * t * (1 - t)) * Math.exp(-t * 10) * 0.3);
    this.createSound("sfx_hurt", 0.15, t => (Math.random() * 2 - 1) * Math.exp(-t * 15) * 0.2);
    this.createSound("sfx_stairs", 0.4, t => {
      const frequency = 300 + t * 200;
      return Math.sin(frequency * Math.PI * 2 * t) * Math.exp(-t * 3) * 0.25;
    });
    this.createSound(
      "sfx_potion",
      0.3,
      t => Math.sin(500 * Math.PI * 2 * t + Math.sin(8 * Math.PI * 2 * t) * 50) * Math.exp(-t * 5) * 0.2
    );
    this.createSound("sfx_whisper", 0.6, t => {
      const noise = (Math.random() * 2 - 1) * 0.3;
      const toneA = Math.sin(180 * Math.PI * 2 * t) * 0.1;
      const toneB = Math.sin(220 * Math.PI * 2 * t) * 0.08;
      const envelope = Math.sin((Math.PI * t) / 0.6) * Math.exp(-t * 2);
      return (noise + toneA + toneB) * envelope * 0.15;
    });
    this.createSound("sfx_tablet", 0.25, t => {
      const noise = Math.random() * 2 - 1;
      const tone = Math.sin(120 * Math.PI * 2 * t);
      return (noise * 0.3 + tone * 0.2) * Math.exp(-t * 8) * 0.2;
    });
  }

  private createSound(key: string, duration: number, generator: (time: number) => number): void {
    if (!this.audioContext) {
      return;
    }

    const sampleRate = this.audioContext.sampleRate;
    const buffer = this.audioContext.createBuffer(1, sampleRate * duration, sampleRate);
    const samples = buffer.getChannelData(0);

    for (let index = 0; index < buffer.length; index++) {
      samples[index] = generator(index / sampleRate);
    }

    this.soundBuffers.set(key, buffer);
  }

  private playPhaserSound(key: string, volume: number): void {
    if (this.paused) {
      return;
    }

    const baseVolume = clampVolume(volume);
    const sound = this.scene.sound.add(key, { volume: baseVolume * this.volumeMixer.getEffectiveSFXVolume() });
    this.activePhaserSounds.set(sound, baseVolume);
    sound.once(Phaser.Sound.Events.COMPLETE, () => this.activePhaserSounds.delete(sound));
    sound.play();
  }
}

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}


