import Phaser from "phaser";
import { type AudioSystem } from "../systems/AudioSystem";
import { BaseScene } from "./BaseScene";

/**
 * Supervisor scene.
 * Launches gameplay, owns pause and settings controls, and keeps `GameScene` and `SettingsScene` in sync.
 */
export default class MainScene extends BaseScene {
  private escKeyHandler?: (event: KeyboardEvent) => void;
  private rtwpKeyHandler?: (event: KeyboardEvent) => void;
  private gameplayPaused = false;
  private settingsButton!: Phaser.GameObjects.Image;

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
    this.input.keyboard?.addCapture([Phaser.Input.Keyboard.KeyCodes.SPACE, Phaser.Input.Keyboard.KeyCodes.ESC]);
    this.bindEscKey();
    this.bindRtwpKeys();
    this.createSettingsButton();
    this.scene.bringToTop();
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

    this.input.keyboard?.on("keydown", this.escKeyHandler);
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

    this.input.keyboard?.on("keydown", this.rtwpKeyHandler);
  }

  public openSettings(): void {
    if (this.scene.isActive("SettingsScene")) {
      return;
    }

    this.scene.pause("GameScene");

    const gameScene = this.scene.get("GameScene") as unknown as {
      getAudioSystem: () => AudioSystem | undefined;
    };
    this.scene.launch("SettingsScene", { audioSystem: gameScene.getAudioSystem() });

    const settingsScene = this.scene.get("SettingsScene");
    settingsScene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.applyGameplayPauseState();
    });
  }

  private toggleSettings(): void {
    if (this.scene.isActive("SettingsScene")) {
      this.scene.stop("SettingsScene");
      return;
    }

    this.openSettings();
  }

  private toggleRtwpPause(): void {
    this.gameplayPaused = !this.gameplayPaused;
    this.applyGameplayPauseState();
  }

  private applyGameplayPauseState(): void {
    if (this.gameplayPaused) {
      this.scene.pause("GameScene");
      return;
    }

    if (!this.scene.isActive("SettingsScene")) {
      this.scene.resume("GameScene");
    }
  }

  private removeKeyHandlers(): void {
    if (this.escKeyHandler) {
      this.input.keyboard?.off("keydown", this.escKeyHandler);
      this.escKeyHandler = undefined;
    }

    if (this.rtwpKeyHandler) {
      this.input.keyboard?.off("keydown", this.rtwpKeyHandler);
      this.rtwpKeyHandler = undefined;
    }
  }

  private createSettingsButton(): void {
    const margin = 30;
    const x = this.scale.width - margin;

    this.settingsButton = this.add.image(x, margin, "gear");
    this.settingsButton.setScrollFactor(0);
    this.settingsButton.setDepth(300);
    this.settingsButton.setInteractive({ useHandCursor: true });

    this.settingsButton.on("pointerover", () => {
      this.tweens.add({
        targets: this.settingsButton,
        scale: 1.25,
        angle: 45,
        duration: 150,
        ease: "Back.easeOut"
      });
    });

    this.settingsButton.on("pointerout", () => {
      this.tweens.add({
        targets: this.settingsButton,
        scale: 1.0,
        angle: 0,
        duration: 150,
        ease: "Power2.easeOut"
      });
    });

    this.settingsButton.on(
      "pointerdown",
      (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
        if (event) {
          event.stopPropagation();
        }
        const gameScene = this.scene.get("GameScene") as unknown as {
          getAudioSystem: () => AudioSystem | undefined;
        };
        gameScene.getAudioSystem()?.play("sfx_tablet", 0.4);
        this.toggleSettings();
      }
    );

    const resizeHandler = (gameSize: Phaser.Structs.Size) => {
      if (this.settingsButton) {
        this.settingsButton.setPosition(gameSize.width - margin, margin);
      }
    };

    this.scale.on("resize", resizeHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", resizeHandler);
    });
  }
}
