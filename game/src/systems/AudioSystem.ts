import Phaser from "phaser";
import { MusicDirector } from "./audio/MusicDirector";
import { SfxLibrary } from "./audio/SfxLibrary";
import { VolumeMixer } from "./audio/VolumeMixer";

export type MusicStyle = "exploration" | "combat" | "shrine";

/**
 * Compatibility façade for scene and UI callers. Audio behavior lives in focused modules.
 */
export class AudioSystem {
  private sfxAudioContext: AudioContext | null = null;
  private musicAudioContext: AudioContext | null = null;
  private readonly volumeMixer = new VolumeMixer();
  private sfxLibrary!: SfxLibrary;
  private musicDirector!: MusicDirector;
  private removeVolumeListener?: () => void;
  private sfxPaused = false;
  private readonly unlockHandler = () => {
    if (this.musicAudioContext?.state === "suspended") {
      void this.musicAudioContext.resume();
    }
    if (!this.sfxPaused && this.sfxAudioContext?.state === "suspended") {
      void this.sfxAudioContext.resume();
    }
  };

  constructor(scene: Phaser.Scene) {
    this.initAudio(scene);
  }

  play(key: string, volume = 0.5): void {
    this.sfxLibrary.play(key, volume);
  }

  playFireballCast(volume = 0.5): void {
    this.sfxLibrary.playFireballCast(volume);
  }

  playFireballHit(volume = 0.5): void {
    this.sfxLibrary.playFireballHit(volume);
  }

  setSfxPaused(paused: boolean): void {
    this.sfxPaused = paused;
    this.sfxLibrary.setPaused(paused);
  }

  startMusic(style: MusicStyle = "exploration"): void {
    this.musicDirector.start(style);
  }

  stopMusic(): void {
    this.musicDirector.stop();
  }

  setMasterVolume(value: number): void {
    this.volumeMixer.setMasterVolume(value);
  }

  setMusicVolume(value: number): void {
    this.volumeMixer.setMusicVolume(value);
  }

  setSFXVolume(value: number): void {
    this.volumeMixer.setSFXVolume(value);
  }

  getMasterVolume(): number {
    return this.volumeMixer.getMasterVolume();
  }

  getMusicVolume(): number {
    return this.volumeMixer.getMusicVolume();
  }

  getSFXVolume(): number {
    return this.volumeMixer.getSFXVolume();
  }

  destroy(): void {
    this.removeVolumeListener?.();
    this.musicDirector.stop();
    this.sfxLibrary.destroy();
    document.removeEventListener("click", this.unlockHandler);
    document.removeEventListener("keydown", this.unlockHandler);
    void this.sfxAudioContext?.close();
    void this.musicAudioContext?.close();
    this.sfxAudioContext = null;
    this.musicAudioContext = null;
  }

  private initAudio(scene: Phaser.Scene): void {
    try {
      this.sfxAudioContext = new AudioContext();
      this.musicAudioContext = new AudioContext();
    } catch {
      void this.sfxAudioContext?.close();
      void this.musicAudioContext?.close();
      this.sfxAudioContext = null;
      this.musicAudioContext = null;
    }

    this.sfxLibrary = new SfxLibrary(scene, this.sfxAudioContext, this.volumeMixer);
    this.musicDirector = new MusicDirector(this.musicAudioContext, this.volumeMixer);
    this.removeVolumeListener = this.volumeMixer.onChange(() => {
      this.sfxLibrary.updateVolume();
      this.musicDirector.updateVolume();
    });
    document.addEventListener("click", this.unlockHandler);
    document.addEventListener("keydown", this.unlockHandler);
  }
}
