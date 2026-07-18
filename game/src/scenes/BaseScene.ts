import Phaser from "phaser";
import { AudioSystem, type MusicStyle } from "../systems/AudioSystem";
import { SettingsUI } from "../ui/SettingsUI";

export abstract class BaseScene extends Phaser.Scene {
  protected audioSystem?: AudioSystem;
  protected settingsUI?: SettingsUI;
  private settingsKeyHandler?: (event: KeyboardEvent) => void;

  abstract createScene(): void;

  protected setupShutdownCleanup(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.audioSystem?.destroy();
      this.settingsUI?.destroy();
      if (this.settingsKeyHandler) {
        this.input.keyboard?.off("keydown", this.settingsKeyHandler);
        this.settingsKeyHandler = undefined;
      }
    });
  }

  protected initAudio(musicKey?: MusicStyle): void {
    this.audioSystem = new AudioSystem(this);
    if (musicKey) {
      this.audioSystem.startMusic(musicKey);
    }
    if (this.settingsUI) {
      this.settingsUI.setAudioSystem(this.audioSystem);
    }
  }

  protected initSettingsUI(): void {
    this.settingsUI = new SettingsUI(this, this.audioSystem);
  }

  protected bindSettingsKeys(): void {
    if (!this.input.keyboard) {
      return;
    }

    this.settingsKeyHandler = (event: KeyboardEvent) => {
      if (event.code !== "Escape") {
        return;
      }

      event.preventDefault();
      this.settingsUI?.toggle();
    };

    this.input.keyboard.on("keydown", this.settingsKeyHandler);
  }

  protected isUIBlocking(): boolean {
    return this.settingsUI?.getIsVisible() ?? false;
  }
}

