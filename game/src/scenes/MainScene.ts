import Phaser from "phaser";
import { SettingsManager } from "../systems/SettingsManager";
import { FlatGameHUD } from "../ui/FlatGameHUD";
import { GameHUD, type GameHudController } from "../ui/GameHUD";
import { BaseScene } from "./BaseScene";
import GameScene from "./GameScene";

/**
 * Supervisor scene.
 * Launches gameplay, owns pause and settings controls, renders the HUD, and keeps
 * `GameScene` and `SettingsScene` in sync.
 */
export default class MainScene extends BaseScene {
  private escKeyHandler?: (event: KeyboardEvent) => void;
  private rtwpKeyHandler?: (event: KeyboardEvent) => void;
  private tabKeyHandler?: (event: KeyboardEvent) => void;
  private pausedLabel?: Phaser.GameObjects.Text;
  private pausedLabelResizeHandler?: (gameSize: Phaser.Structs.Size) => void;
  private gameplayPaused = false;
  private gameHUD?: GameHUD | FlatGameHUD;

  constructor() {
    super("MainScene");
  }

  create(): void {
    this.setupShutdownCleanup();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.removeKeyHandlers();
      this.removePausedLabel();
      this.scene.get("GameScene")?.events.off(Phaser.Scenes.Events.CREATE, this.rebuildHud, this);
      this.gameHUD?.destroy();
      this.gameHUD = undefined;
    });

    this.input?.mouse?.disableContextMenu();

    this.createScene();
  }

  /** Launch `GameScene` and wire global controls that coordinate pause state. */
  createScene(): void {
    this.scene.launch("GameScene");
    // Rebuild the HUD whenever GameScene (re)creates, e.g. after a level switch.
    this.scene.get("GameScene").events.on(Phaser.Scenes.Events.CREATE, this.rebuildHud, this);
    this.input.keyboard?.addCapture([
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.ESC,
      Phaser.Input.Keyboard.KeyCodes.TAB
    ]);
    this.bindEscKey();
    this.bindRtwpKeys();
    this.bindDevModeKey();
    this.createPausedLabel();
    this.scene.bringToTop();
  }

  /** (Re)create the HUD bound to the current GameScene instance. */
  private rebuildHud(): void {
    const selectedWeaponSlot = this.gameHUD?.getSelectedWeaponSlot() ?? 0;
    this.gameHUD?.destroy();
    const gameScene = this.scene.get("GameScene") as unknown as GameHudController;
    this.gameHUD =
      SettingsManager.getHudStyle() === "flat"
        ? new FlatGameHUD(this, gameScene, () => this.toggleSettings(), selectedWeaponSlot)
        : new GameHUD(this, gameScene, () => this.toggleSettings(), selectedWeaponSlot);
    this.gameHUD.create();
    this.scene.bringToTop();
  }

  public getSelectedWeaponSlot(): number {
    return this.gameHUD?.getSelectedWeaponSlot() ?? 0;
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

  private bindDevModeKey(): void {
    this.tabKeyHandler = (event: KeyboardEvent) => {
      if (event.code !== "Tab" || event.repeat) {
        return;
      }

      event.preventDefault();

      if (this.scene.isActive("SettingsScene")) {
        return;
      }

      this.scene.get("GameScene").events.emit("toggle-dev-mode");
    };

    this.input.keyboard?.on("keydown", this.tabKeyHandler);
  }

  public openSettings(): void {
    if (this.scene.isActive("SettingsScene")) {
      return;
    }

    this.scene.pause("GameScene");
    const gameScene = this.scene.get("GameScene") as GameScene;
    this.scene.launch("SettingsScene", {
      audioSystem: gameScene.getAudioSystem(),
      onHudStyleChange: () => this.rebuildHud()
    });

    const settingsScene = this.scene.get("SettingsScene");
    settingsScene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.applyGameplayPauseState();
    });
  }

  private toggleSettings(): void {
    if (this.scene.isActive("SettingsScene")) {
      const settingsScene = this.scene.get("SettingsScene") as unknown as {
        requestClose: () => void;
      };
      settingsScene.requestClose();
      return;
    }

    this.openSettings();
  }

  private toggleRtwpPause(): void {
    this.gameplayPaused = !this.gameplayPaused;
    this.applyGameplayPauseState();
    this.updatePausedLabel();
  }

  private applyGameplayPauseState(): void {
    if (this.gameplayPaused) {
      this.scene.pause("GameScene");
    } else if (!this.scene.isActive("SettingsScene")) {
      this.scene.resume("GameScene");
    }

    const gameScene = this.scene.get("GameScene") as GameScene;
    gameScene.getAudioSystem()?.setSfxPaused(this.gameplayPaused);
  }

  private createPausedLabel(): void {
    this.removePausedLabel();

    this.pausedLabel = this.add.text(0, 0, "PAUSED", {
      fontSize: "20px",
      fontStyle: "bold",
      fontFamily: "Roboto Mono, Courier New, monospace",
      color: "#ff6600",
      stroke: "#000000",
      strokeThickness: 3
    });
    this.pausedLabel.setScrollFactor(0);
    this.pausedLabel.setDepth(300);
    this.pausedLabel.setOrigin(0.5, 0.5);

    this.pausedLabelResizeHandler = (gameSize: Phaser.Structs.Size) => {
      this.pausedLabel?.setPosition(gameSize.width - 50, 78);
    };

    this.scale.on("resize", this.pausedLabelResizeHandler);
    this.pausedLabelResizeHandler(this.scale.gameSize);
    this.updatePausedLabel();
  }

  private updatePausedLabel(): void {
    this.pausedLabel?.setVisible(this.gameplayPaused);
  }

  private removePausedLabel(): void {
    if (this.pausedLabelResizeHandler) {
      this.scale.off("resize", this.pausedLabelResizeHandler);
      this.pausedLabelResizeHandler = undefined;
    }

    this.pausedLabel?.destroy();
    this.pausedLabel = undefined;
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

    if (this.tabKeyHandler) {
      this.input.keyboard?.off("keydown", this.tabKeyHandler);
      this.tabKeyHandler = undefined;
    }
  }
}
