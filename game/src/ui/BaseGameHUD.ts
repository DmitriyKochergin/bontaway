import Phaser from "phaser";
import { getLevels } from "../levels";
import type { NetworkStats } from "../multiplayer/NetworkManager";
import type { AudioSystem } from "../systems/AudioSystem";
import { DepthLayer } from "../types/depth-layer";
import { SettingsButton } from "./SettingsButton";

/**
 * Bridge to the gameplay scene the HUD controls.
 * Lets the HUD render on a separate supervisor scene while still driving level/audio state.
 */
export interface GameHudController {
  getLevelId(): string;
  getNetworkStats(): NetworkStats;
  restartLevel(levelId: string): void;
  getAudioSystem(): AudioSystem | undefined;
}

type HudSlot = {
  frame: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Image;
  keyText: Phaser.GameObjects.Text;
  baseScale: number;
};

/** Shared HUD behavior; visual themes provide only their drawing hooks. */
export abstract class BaseGameHUD {
  protected readonly scene: Phaser.Scene;
  protected readonly controller: GameHudController;
  protected readonly onOpenSettings: () => void;

  protected settingsButton?: SettingsButton;
  protected hudContainer!: Phaser.GameObjects.Container;
  protected backgroundGraphics!: Phaser.GameObjects.Graphics;
  protected levelContainer!: Phaser.GameObjects.Container;
  protected levelBackgroundRect!: Phaser.GameObjects.Graphics;
  protected networkStatusContainer!: Phaser.GameObjects.Container;
  protected networkStatusBackground!: Phaser.GameObjects.Graphics;
  protected networkStatusText!: Phaser.GameObjects.Text;
  protected slots: HudSlot[] = [];

  protected keySelectHandler?: (event: KeyboardEvent) => void;
  protected resizeHandler?: (gameSize: Phaser.Structs.Size) => void;
  protected currentSelection: number;

  protected readonly slotSize = 64;
  protected readonly slotPadding = 12;
  protected readonly numSlots = 2;
  protected readonly panelPadding = 10;
  protected readonly panelHeight = 84;
  protected readonly locationIconSize = 36;
  protected readonly locationIconPadding = 6;
  protected readonly locationPanelPadding = 6;
  protected readonly panelWidth: number;

  constructor(scene: Phaser.Scene, controller: GameHudController, onOpenSettings: () => void, initialSelection = 0) {
    this.scene = scene;
    this.controller = controller;
    this.onOpenSettings = onOpenSettings;
    this.currentSelection = Phaser.Math.Clamp(initialSelection, 0, this.numSlots - 1);
    this.panelWidth = this.numSlots * this.slotSize + (this.numSlots - 1) * this.slotPadding + this.panelPadding * 2;
  }

  public create(): void {
    this.hudContainer = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(DepthLayer.Hud);
    this.backgroundGraphics = this.scene.add.graphics();
    this.hudContainer.add(this.backgroundGraphics);

    const hotbarBlocker = this.scene.add.zone(0, 0, this.panelWidth, this.panelHeight).setOrigin(0, 0);
    hotbarBlocker.setInteractive();
    this.hudContainer.add(hotbarBlocker);
    this.createSlots();

    this.createLevelSelection();
    this.createNetworkStatus();

    this.settingsButton = new SettingsButton(this.scene, () => {
      this.controller.getAudioSystem()?.play("sfx_tablet", 0.4);
      this.onOpenSettings();
    });
    this.settingsButton.create();

    this.reposition(this.scene.scale.gameSize);
    this.resizeHandler = (gameSize: Phaser.Structs.Size) => this.reposition(gameSize);
    this.scene.scale.on("resize", this.resizeHandler);

    this.keySelectHandler = (event: KeyboardEvent) => {
      const slotNumber = Number.parseInt(event.key, 10);
      if (slotNumber >= 1 && slotNumber <= this.slots.length) {
        this.activateSlot(slotNumber - 1);
      }
    };
    this.scene.input.keyboard?.on("keydown", this.keySelectHandler);
  }

  public getSelectedWeaponSlot(): number {
    return this.currentSelection;
  }

  public update(_delta?: number): void {
    this.updateNetworkStatus();
  }

  public destroy(): void {
    if (this.resizeHandler) {
      this.scene.scale.off("resize", this.resizeHandler);
      this.resizeHandler = undefined;
    }
    if (this.keySelectHandler) {
      this.scene.input.keyboard?.off("keydown", this.keySelectHandler);
      this.keySelectHandler = undefined;
    }

    this.settingsButton?.destroy();
    this.settingsButton = undefined;
    this.hudContainer.destroy();
    this.levelContainer.destroy();
    this.networkStatusContainer.destroy();
    this.slots = [];
  }

  protected abstract drawFrame(
    frame: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    isHighlighted: boolean
  ): void;

  protected abstract getSlotKeyColor(isSelected: boolean): string;

  protected abstract drawMainPanel(): void;

  protected abstract drawLevelSelectionPanel(): void;

  private createSlots(): void {
    const textures = ["fireball_tile", "weapon-blue-sphere"] as const;
    const centerY = this.panelHeight / 2;

    textures.forEach((texture, index) => {
      const slotX = this.panelPadding + this.slotSize / 2 + index * (this.slotSize + this.slotPadding);
      const slotContainer = this.scene.add.container(slotX, centerY);
      this.hudContainer.add(slotContainer);

      const frame = this.scene.add.graphics();
      slotContainer.add(frame);

      const keyText = this.scene.add.text(-this.slotSize / 2 + 5, -this.slotSize / 2 + 4, `${index + 1}`, {
        fontSize: "10px",
        fontFamily: "Roboto Mono, Courier New, monospace",
        color: this.getSlotKeyColor(this.currentSelection === index),
        fontStyle: "bold"
      });
      slotContainer.add(keyText);

      const icon = this.scene.add.image(0, index === 0 ? 3 : 0, texture);
      const maxIconDimension = this.slotSize - 12;
      if (icon.width > 0) {
        icon.setScale(maxIconDimension / Math.max(icon.width, icon.height));
      } else {
        icon.setDisplaySize(maxIconDimension, maxIconDimension);
      }
      icon.setInteractive({ useHandCursor: true });
      slotContainer.add(icon);

      icon.on("pointerover", () => {
        frame.clear();
        const half = this.slotSize / 2;
        this.drawFrame(frame, -half, -half, this.slotSize, this.slotSize, true);
      });
      icon.on("pointerout", () => this.redrawSlots());
      icon.on(
        "pointerdown",
        (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          this.activateSlot(index);
        }
      );

      this.slots.push({ frame, icon, keyText, baseScale: icon.scale });
    });

    this.redrawSlots();
  }

  private activateSlot(index: number): void {
    const slot = this.slots[index];
    if (!slot) {
      return;
    }

    this.controller.getAudioSystem()?.play("sfx_pickup", 0.4);
    this.scene.tweens.add({
      targets: slot.icon,
      scale: slot.baseScale * 1.15,
      duration: 100,
      yoyo: true,
      ease: "Quad.easeOut"
    });

    if (this.currentSelection !== index) {
      this.currentSelection = index;
      this.redrawSlots();
    }
  }

  private redrawSlots(): void {
    const half = this.slotSize / 2;

    this.slots.forEach((slot, index) => {
      slot.frame.clear();
      const isSelected = this.currentSelection === index;
      this.drawFrame(slot.frame, -half, -half, this.slotSize, this.slotSize, isSelected);
      slot.keyText.setColor(this.getSlotKeyColor(isSelected));
    });
  }

  private createLevelSelection(): void {
    this.levelContainer = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(DepthLayer.Hud);
    this.levelBackgroundRect = this.scene.add.graphics();
    this.levelContainer.add(this.levelBackgroundRect);

    const panelWidth = this.getLocationPanelWidth();
    const panelHeight = this.getLocationPanelHeight();
    const levelBlocker = this.scene.add.zone(0, 0, panelWidth, panelHeight).setOrigin(0, 0);
    levelBlocker.setInteractive();
    this.levelContainer.add(levelBlocker);

    const currentLevelId = this.controller.getLevelId();
    getLevels().forEach((level, index) => {
      const itemY = this.locationPanelPadding + index * (this.locationIconSize + this.locationIconPadding);
      const itemContainer = this.scene.add.container(this.locationPanelPadding, itemY);
      this.levelContainer.add(itemContainer);

      const itemBackground = this.scene.add.graphics();
      itemContainer.add(itemBackground);

      const icon = this.scene.add.image(
        this.locationIconSize / 2,
        this.locationIconSize / 2,
        this.getLocationIconTexture(level.id)
      );
      const maxIconDimension = this.locationIconSize - 10;
      icon.setScale(maxIconDimension / Math.max(icon.width, icon.height));
      itemContainer.add(icon);

      const interactionZone = this.scene.add.zone(0, 0, this.locationIconSize, this.locationIconSize).setOrigin(0, 0);
      interactionZone.setInteractive({ useHandCursor: true });
      itemContainer.add(interactionZone);

      const isSelected = level.id === currentLevelId;
      this.drawFrame(itemBackground, 0, 0, this.locationIconSize, this.locationIconSize, isSelected);

      interactionZone.on("pointerover", () => {
        itemBackground.clear();
        this.drawFrame(itemBackground, 0, 0, this.locationIconSize, this.locationIconSize, true);
      });
      interactionZone.on("pointerout", () => {
        itemBackground.clear();
        this.drawFrame(itemBackground, 0, 0, this.locationIconSize, this.locationIconSize, isSelected);
      });
      interactionZone.on(
        "pointerdown",
        (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          if (level.id !== currentLevelId) {
            this.controller.getAudioSystem()?.play("sfx_pickup", 0.4);
            // Delay restart so the selection sound finishes before GameScene shuts down its audio context.
            this.scene.time.delayedCall(220, () => this.controller.restartLevel(level.id));
          }
        }
      );
    });
  }

  private createNetworkStatus(): void {
    this.networkStatusContainer = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(DepthLayer.Hud);
    this.networkStatusBackground = this.scene.add.graphics();
    this.networkStatusText = this.scene.add.text(8, 5, "", {
      fontSize: "11px",
      fontFamily: "Roboto Mono, Courier New, monospace",
      fontStyle: "bold",
      stroke: "#000000",
      strokeThickness: 2
    });
    this.networkStatusContainer.add([this.networkStatusBackground, this.networkStatusText]);
    this.updateNetworkStatus();
  }

  private updateNetworkStatus(): void {
    if (!this.networkStatusContainer) {
      return;
    }

    const networkStats = this.controller.getNetworkStats();
    if (networkStats.connectionState === "offline") {
      this.networkStatusContainer.setVisible(false);
      return;
    }

    const { label, color, backgroundColor } = this.getNetworkStatusPresentation(networkStats);
    this.networkStatusContainer.setVisible(true);
    this.networkStatusText.setText(label).setColor(color);
    this.networkStatusBackground.clear();
    this.networkStatusBackground.fillStyle(backgroundColor, 0.88);
    this.networkStatusBackground.fillRoundedRect(0, 0, this.networkStatusText.width + 16, 26, 4);
    this.networkStatusBackground.lineStyle(1, Phaser.Display.Color.HexStringToColor(color).color, 0.8);
    this.networkStatusBackground.strokeRoundedRect(0, 0, this.networkStatusText.width + 16, 26, 4);
  }

  private getNetworkStatusPresentation(networkStats: NetworkStats): {
    label: string;
    color: string;
    backgroundColor: number;
  } {
    switch (networkStats.connectionState) {
      case "connecting":
        return { label: "NETWORK · CONNECTING...", color: "#ffbb33", backgroundColor: 0x221a08 };
      case "reconnecting":
        return { label: "NETWORK · RECONNECTING...", color: "#ffbb33", backgroundColor: 0x221a08 };
      case "room-full":
        return { label: "NETWORK · ROOM FULL", color: "#ff6b6b", backgroundColor: 0x2a1010 };
      case "connected": {
        const peerLabel = `${networkStats.peerCount} PEER${networkStats.peerCount === 1 ? "" : "S"}`;
        const pingLabel = networkStats.pingMs === null ? "" : ` · ${networkStats.pingMs} MS`;
        return { label: `NETWORK · ${peerLabel}${pingLabel}`, color: "#8ee6a8", backgroundColor: 0x102218 };
      }
      case "offline":
        return { label: "", color: "#ffffff", backgroundColor: 0x000000 };
    }
  }

  private getLocationIconTexture(levelId: string): string {
    return levelId === "arena" ? "obstacle" : "door_1";
  }

  protected getLocationPanelWidth(): number {
    return this.locationIconSize + this.locationPanelPadding * 2;
  }

  protected getLocationPanelHeight(): number {
    const locations = getLevels().length;
    return (
      locations * this.locationIconSize +
      Math.max(0, locations - 1) * this.locationIconPadding +
      this.locationPanelPadding * 2
    );
  }

  private reposition(gameSize: Phaser.Structs.Size): void {
    this.hudContainer.setPosition(gameSize.width / 2 - this.panelWidth / 2, gameSize.height - this.panelHeight - 14);
    this.levelContainer.setPosition(gameSize.width - this.getLocationPanelWidth() - 8, 74);
    this.networkStatusContainer.setPosition(12, 14);
    this.drawMainPanel();
    this.drawLevelSelectionPanel();
  }
}
