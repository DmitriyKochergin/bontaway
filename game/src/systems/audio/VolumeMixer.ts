import { SettingsManager } from "../SettingsManager";

type VolumeChangeListener = () => void;

/** SettingsManager is the sole volume state owner. */
export class VolumeMixer {
  private readonly listeners = new Set<VolumeChangeListener>();

  getMasterVolume(): number {
    return SettingsManager.getMasterVolume();
  }

  getMusicVolume(): number {
    return SettingsManager.getMusicVolume();
  }

  getSFXVolume(): number {
    return SettingsManager.getSFXVolume();
  }

  getEffectiveMusicVolume(): number {
    return this.getMasterVolume() * this.getMusicVolume();
  }

  getEffectiveSFXVolume(): number {
    return this.getMasterVolume() * this.getSFXVolume();
  }

  setMasterVolume(value: number): void {
    SettingsManager.setMasterVolume(value);
    this.notifyListeners();
  }

  setMusicVolume(value: number): void {
    SettingsManager.setMusicVolume(value);
    this.notifyListeners();
  }

  setSFXVolume(value: number): void {
    SettingsManager.setSFXVolume(value);
    this.notifyListeners();
  }

  onChange(listener: VolumeChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

