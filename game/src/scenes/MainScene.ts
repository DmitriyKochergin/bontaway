import Phaser from "phaser";
import { BaseScene } from "./BaseScene";
import { type AudioSystem } from "../systems/AudioSystem";

/**
 * Supervisor scene.
 * Launches gameplay, owns pause and settings controls, and keeps `GameScene` and `SettingsScene` in sync.
 */
export default class MainScene extends BaseScene {
  private escKeyHandler?: (event: KeyboardEvent) => void;
  private rtwpKeyHandler?: (event: KeyboardEvent) => void;
  private gameplayPaused = false;
  private manualPause = false;
  private settingsPause = false;

  constructor() {
    super("MainScene");
  }

  create(): void {
    this.setupShutdownCleanup();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.removeKeyHandlers();
    });

    this.createScene();
  }

  /** Launch `GameScene` and wire global controls that coordinate pause state. */
  createScene(): void {
    this.scene.launch("GameScene");
    this.bindEscKey();
    this.bindRtwpKeys();
  }

  private bindEscKey(): void {
    this.escKeyHandler = (event: KeyboardEvent) => {
      if (event.code !== "Escape" || event.repeat) {
        return;
      }

      event.preventDefault();

      if (this.scene.isActive("SettingsScene")) {
        return;
      }

      this.openSettings();
    };

    window.addEventListener("keydown", this.escKeyHandler);
  }

  private bindRtwpKeys(): void {
    this.rtwpKeyHandler = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) {
        return;
      }

      event.preventDefault();

      if (this.scene.isActive("SettingsScene")) {
        return;
      }

      this.toggleRtwpPause();
    };

    window.addEventListener("keydown", this.rtwpKeyHandler);
  }

  private openSettings(): void {
    if (this.scene.isActive("SettingsScene")) {
      return;
    }

    this.settingsPause = true;
    this.applyGameplayPauseState();

    const gameScene = this.scene.get("GameScene") as unknown as {
      getAudioSystem: () => AudioSystem | undefined;
    };
    this.scene.launch("SettingsScene", { audioSystem: gameScene.getAudioSystem() });

    const settingsScene = this.scene.get("SettingsScene");
    settingsScene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.settingsPause = false;
      this.applyGameplayPauseState();
    });
  }

  private toggleRtwpPause(): void {
    this.manualPause = !this.manualPause;
    this.applyGameplayPauseState();
  }

  private applyGameplayPauseState(): void {
    const shouldPause = this.manualPause || this.settingsPause;

    if (shouldPause === this.gameplayPaused) {
      return;
    }

    this.gameplayPaused = shouldPause;

    if (shouldPause) {
      this.scene.pause("GameScene");
      return;
    }

    this.scene.resume("GameScene");
  }

  private removeKeyHandlers(): void {
    if (this.escKeyHandler) {
      window.removeEventListener("keydown", this.escKeyHandler);
      this.escKeyHandler = undefined;
    }

    if (this.rtwpKeyHandler) {
      window.removeEventListener("keydown", this.rtwpKeyHandler);
      this.rtwpKeyHandler = undefined;
    }
  }
}





