import Phaser from "phaser";
import { EDITOR_MODE_ENABLED } from "../editor/editorMode";
import { SettingsManager } from "../systems/SettingsManager";
import { GrayscaleFx } from "../systems/rtwp/GrayscaleFx";
import { DepthLayer } from "../types/depth-layer";
import { BaseGameHUD, type GameHudController } from "../ui/BaseGameHUD";
import { ChatInputOverlay } from "../ui/ChatInputOverlay";
import { FlatGameHUD } from "../ui/FlatGameHUD";
import { LevelEditorButton } from "../ui/LevelEditorButton";
import { MessageButton } from "../ui/MessageButton";
import { StoneGameHUD } from "../ui/StoneGameHUD";
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
  private grayscaleFx?: GrayscaleFx;
  private gameHUD?: BaseGameHUD;
  private messageButton?: MessageButton;
  private levelEditorButton?: LevelEditorButton;
  private chatOverlay?: ChatInputOverlay;

  constructor() {
    super("MainScene");
  }

  create(): void {
    this.setupShutdownCleanup();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.removeKeyHandlers();
      this.removePausedLabel();
      this.grayscaleFx?.destroy();
      this.grayscaleFx = undefined;
      this.scene.get("GameScene")?.events.off(Phaser.Scenes.Events.CREATE, this.rebuildHud, this);
      this.gameHUD?.destroy();
      this.gameHUD = undefined;
      this.messageButton?.destroy();
      this.messageButton = undefined;
      this.levelEditorButton?.destroy();
      this.levelEditorButton = undefined;
      this.chatOverlay?.destroy();
      this.chatOverlay = undefined;
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
    this.syncMessageControls();
    this.syncEditorControls();
    this.scene.bringToTop();
  }

  /** (Re)create the HUD bound to the current GameScene instance. */
  private rebuildHud(): void {
    const selectedWeaponSlot = this.gameHUD?.getSelectedWeaponSlot() ?? 0;
    const gameScene = this.scene.get("GameScene") as GameScene;
    this.grayscaleFx?.destroy();
    this.grayscaleFx = new GrayscaleFx(this, gameScene.cameras.main);
    if (this.gameplayPaused) {
      this.grayscaleFx.setPaused(true);
    }
    this.gameHUD?.destroy();
    this.messageButton?.destroy();
    this.messageButton = undefined;
    this.levelEditorButton?.destroy();
    this.levelEditorButton = undefined;
    const hudController = gameScene as unknown as GameHudController;
    this.gameHUD =
      SettingsManager.getHudStyle() === "flat"
        ? new FlatGameHUD(this, hudController, () => this.toggleSettings(), selectedWeaponSlot)
        : new StoneGameHUD(this, hudController, () => this.toggleSettings(), selectedWeaponSlot);
    this.gameHUD.create();
    this.syncMessageControls();
    this.syncEditorControls();
    this.syncGameplayPauseState();
    this.scene.bringToTop();
  }

  public getSelectedWeaponSlot(): number {
    return this.gameHUD?.getSelectedWeaponSlot() ?? 0;
  }

  update(_time: number, delta: number): void {
    this.gameHUD?.update(delta);
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

      if (!this.canUseGameplayPause()) {
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

  private syncMessageControls(): void {
    const gameScene = this.scene.get("GameScene") as GameScene;
    const isGlobalLevel = gameScene.getLevelId() === "arena" || gameScene.getLevelId() === "trademeet";

    if (!isGlobalLevel) {
      this.closeChat();
      this.messageButton?.destroy();
      this.messageButton = undefined;
      this.chatOverlay?.destroy();
      this.chatOverlay = undefined;
      this.levelEditorButton?.updatePosition();
      return;
    }

    this.chatOverlay ??= new ChatInputOverlay(
      text => this.submitChatMessage(text),
      () => this.closeChat()
    );

    if (!this.messageButton) {
      this.messageButton = new MessageButton(this, () => this.openChat());
      this.messageButton.create();
      this.levelEditorButton?.updatePosition();
    }
  }

  private syncEditorControls(): void {
    if (!EDITOR_MODE_ENABLED) {
      this.levelEditorButton?.destroy();
      this.levelEditorButton = undefined;
      return;
    }

    const getMarginRight = () => (this.messageButton ? 146 : 88);
    const gameScene = this.scene.get("GameScene") as GameScene;

    if (!this.levelEditorButton) {
      this.levelEditorButton = new LevelEditorButton(
        this,
        getMarginRight,
        () => {
          void gameScene.toggleLevelEditor().then(() => {
            this.levelEditorButton?.updateState();
          });
        },
        () => gameScene.isLevelEditorActive()
      );
      this.levelEditorButton.create();
    } else {
      this.levelEditorButton.updatePosition();
      this.levelEditorButton.updateState();
    }
  }

  private openChat(): void {
    if (this.scene.isActive("SettingsScene") || this.chatOverlay?.isOpen) {
      return;
    }

    const gameScene = this.scene.get("GameScene") as GameScene;
    gameScene.getAudioSystem()?.play("sfx_tablet", 0.4);
    gameScene.setChatTyping(true);
    this.chatOverlay?.open();
  }

  private submitChatMessage(text: string): void {
    (this.scene.get("GameScene") as GameScene).sendArenaChat(text);
    this.closeChat();
  }

  private closeChat(): void {
    this.chatOverlay?.close();
    (this.scene.get("GameScene") as GameScene).setChatTyping(false);
  }

  private toggleRtwpPause(): void {
    if (!this.canUseGameplayPause()) {
      this.gameplayPaused = false;
      this.updatePausedLabel();
      return;
    }

    this.gameplayPaused = !this.gameplayPaused;
    this.applyGameplayPauseState();
    this.updatePausedLabel();
  }

  private syncGameplayPauseState(): void {
    if (this.canUseGameplayPause()) {
      return;
    }

    if (this.gameplayPaused) {
      this.gameplayPaused = false;
      this.grayscaleFx?.setPaused(false);
      this.updatePausedLabel();
    }

    if (!this.scene.isActive("SettingsScene")) {
      this.scene.resume("GameScene");
    }
  }

  private canUseGameplayPause(): boolean {
    const gameScene = this.scene.get("GameScene") as GameScene;
    const levelId = gameScene.getLevelId();

    return levelId !== "arena" && levelId !== "trademeet";
  }

  private applyGameplayPauseState(): void {
    if (this.gameplayPaused) {
      this.scene.pause("GameScene");
    } else if (!this.scene.isActive("SettingsScene")) {
      this.scene.resume("GameScene");
    }

    const gameScene = this.scene.get("GameScene") as GameScene;
    gameScene.getAudioSystem()?.setSfxPaused(this.gameplayPaused);
    this.grayscaleFx?.setPaused(this.gameplayPaused);
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
    this.pausedLabel.setDepth(DepthLayer.Player);
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
