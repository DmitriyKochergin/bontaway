export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
}

const STORAGE_KEY = "bontaway_settings";

const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.7,
  musicVolume: 0.5,
  sfxVolume: 0.6
};

class SettingsManagerClass {
  private settings: GameSettings;

  constructor() {
    this.settings = this.load();
  }

  private load(): GameSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<GameSettings>;
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (error) {
      console.warn("Failed to load settings:", error);
    }

    return { ...DEFAULT_SETTINGS };
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.warn("Failed to save settings:", error);
    }
  }

  get(): GameSettings {
    return { ...this.settings };
  }

  setMasterVolume(value: number): void {
    this.settings.masterVolume = Math.max(0, Math.min(1, value));
    this.save();
  }

  setMusicVolume(value: number): void {
    this.settings.musicVolume = Math.max(0, Math.min(1, value));
    this.save();
  }

  setSFXVolume(value: number): void {
    this.settings.sfxVolume = Math.max(0, Math.min(1, value));
    this.save();
  }

  getMasterVolume(): number {
    return this.settings.masterVolume;
  }

  getMusicVolume(): number {
    return this.settings.musicVolume;
  }

  getSFXVolume(): number {
    return this.settings.sfxVolume;
  }

  resetToDefaults(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.save();
  }
}

export const SettingsManager = new SettingsManagerClass();
