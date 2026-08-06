import Phaser from "phaser";
import { getLevels } from "../levels";
import { SettingsButton } from "./SettingsButton";
import { type GameHudController } from "./StoneGameHUD";

/** Flat HUD variant, styled to match the settings dialog and gear control. */
export class FlatGameHUD {
  private hudContainer!: Phaser.GameObjects.Container;
  private hotbarBackground!: Phaser.GameObjects.Graphics;
  private locationContainer!: Phaser.GameObjects.Container;
  private locationBackground!: Phaser.GameObjects.Graphics;
  private settingsButton?: SettingsButton;
  private keySelectHandler?: (event: KeyboardEvent) => void;
  private resizeHandler!: (gameSize: Phaser.Structs.Size) => void;
  private currentSelection: number;

  private slots: Array<{
    frame: Phaser.GameObjects.Graphics;
    icon: Phaser.GameObjects.Image;
    keyText: Phaser.GameObjects.Text;
    baseScale: number;
  }> = [];

  private readonly slotSize = 64;
  private readonly slotPadding = 12;
  private readonly panelPadding = 10;
  private readonly panelHeight = 84;
  private readonly locationIconSize = 36;
  private readonly locationIconPadding = 6;
  private readonly locationPanelPadding = 6;
  private readonly panelWidth = 2 * this.slotSize + this.slotPadding + 2 * this.panelPadding;

  constructor(
    private scene: Phaser.Scene,
    private controller: GameHudController,
    private onOpenSettings: () => void,
    initialSelection = 0
  ) {
    this.currentSelection = Phaser.Math.Clamp(initialSelection, 0, 1);
  }

  public create(): void {
    this.hudContainer = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(400);
    this.hotbarBackground = this.scene.add.graphics();
    this.hudContainer.add(this.hotbarBackground);

    const hotbarBlocker = this.scene.add.zone(0, 0, this.panelWidth, this.panelHeight).setOrigin(0, 0);
    hotbarBlocker.setInteractive();
    this.hudContainer.add(hotbarBlocker);
    this.createSlots();

    this.locationContainer = this.scene.add.container(0, 0).setScrollFactor(0).setDepth(400);
    this.locationBackground = this.scene.add.graphics();
    this.locationContainer.add(this.locationBackground);

    const locationBlocker = this.scene.add
      .zone(0, 0, this.getLocationPanelWidth(), this.getLocationPanelHeight())
      .setOrigin(0, 0);
    locationBlocker.setInteractive();
    this.locationContainer.add(locationBlocker);
    this.createLocations();

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
        fontStyle: "bold"
      });
      slotContainer.add(keyText);

      const icon = this.scene.add.image(0, index === 0 ? 3 : 0, texture);
      const maxIconDimension = this.slotSize - 12;
      icon.setScale(maxIconDimension / Math.max(icon.width, icon.height));
      icon.setInteractive({ useHandCursor: true });
      slotContainer.add(icon);

      icon.on("pointerover", () => this.drawFlatSlot(frame, true));
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
    this.slots.forEach((slot, index) => {
      this.drawFlatSlot(slot.frame, this.currentSelection === index);
      slot.keyText.setColor(this.currentSelection === index ? "#ff6600" : "#888888");
    });
  }

  private drawFlatSlot(frame: Phaser.GameObjects.Graphics, isHighlighted: boolean): void {
    const half = this.slotSize / 2;
    frame.clear();
    frame.fillStyle(0x1a1a1a, 0.95);
    frame.fillRoundedRect(-half, -half, this.slotSize, this.slotSize, 4);
    frame.lineStyle(isHighlighted ? 2 : 1, isHighlighted ? 0xff6600 : 0x444444, 0.9);
    frame.strokeRoundedRect(-half, -half, this.slotSize, this.slotSize, 4);
  }

  private createLocations(): void {
    const currentLevelId = this.controller.getLevelId();

    getLevels().forEach((level, index) => {
      const itemY = this.locationPanelPadding + index * (this.locationIconSize + this.locationIconPadding);
      const itemContainer = this.scene.add.container(this.locationPanelPadding, itemY);
      this.locationContainer.add(itemContainer);

      const frame = this.scene.add.graphics();
      itemContainer.add(frame);

      const icon = this.scene.add.image(
        this.locationIconSize / 2,
        this.locationIconSize / 2,
        this.getLocationIconTexture(level.id)
      );
      const maxIconDimension = this.locationIconSize - 10;
      icon.setScale(maxIconDimension / Math.max(icon.width, icon.height));
      itemContainer.add(icon);

      const isSelected = level.id === currentLevelId;
      this.drawFlatLocation(frame, isSelected);

      const hitArea = this.scene.add.zone(0, 0, this.locationIconSize, this.locationIconSize).setOrigin(0, 0);
      hitArea.setInteractive({ useHandCursor: true });
      hitArea.on("pointerover", () => this.drawFlatLocation(frame, true));
      hitArea.on("pointerout", () => this.drawFlatLocation(frame, isSelected));
      hitArea.on(
        "pointerdown",
        (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          if (level.id !== currentLevelId) {
            this.controller.getAudioSystem()?.play("sfx_pickup", 0.4);
            this.scene.time.delayedCall(220, () => this.controller.restartLevel(level.id));
          }
        }
      );
      itemContainer.add(hitArea);
    });
  }

  private drawFlatLocation(frame: Phaser.GameObjects.Graphics, isHighlighted: boolean): void {
    frame.clear();
    frame.fillStyle(0x1a1a1a, 0.95);
    frame.fillRoundedRect(0, 0, this.locationIconSize, this.locationIconSize, 4);
    frame.lineStyle(isHighlighted ? 2 : 1, isHighlighted ? 0xff6600 : 0x444444, 0.9);
    frame.strokeRoundedRect(0, 0, this.locationIconSize, this.locationIconSize, 4);
  }

  private getLocationIconTexture(levelId: string): string {
    return levelId === "arena" ? "obstacle" : "door_1";
  }

  private reposition(gameSize: Phaser.Structs.Size): void {
    this.hudContainer.setPosition(gameSize.width / 2 - this.panelWidth / 2, gameSize.height - this.panelHeight - 14);
    this.locationContainer.setPosition(20, gameSize.height - this.getLocationPanelHeight() - 14);
    this.drawFlatPanel(this.hotbarBackground, this.panelWidth, this.panelHeight);
    this.drawFlatPanel(this.locationBackground, this.getLocationPanelWidth(), this.getLocationPanelHeight());
  }

  private drawFlatPanel(background: Phaser.GameObjects.Graphics, width: number, height: number): void {
    background.clear();
    background.fillStyle(0x0a0a0a, 0.92);
    background.fillRoundedRect(0, 0, width, height, 6);
    background.lineStyle(1, 0x444444, 0.9);
    background.strokeRoundedRect(0, 0, width, height, 6);
    background.lineStyle(2, 0xff6600, 0.8);
    background.lineBetween(0, 12, 0, 0);
    background.lineBetween(0, 0, 12, 0);
    background.lineBetween(width - 12, height, width, height);
    background.lineBetween(width, height, width, height - 12);
  }

  private getLocationPanelWidth(): number {
    return this.locationIconSize + this.locationPanelPadding * 2;
  }

  private getLocationPanelHeight(): number {
    const locations = getLevels().length;
    return (
      locations * this.locationIconSize +
      Math.max(0, locations - 1) * this.locationIconPadding +
      this.locationPanelPadding * 2
    );
  }

  public destroy(): void {
    this.scene.scale.off("resize", this.resizeHandler);
    if (this.keySelectHandler) {
      this.scene.input.keyboard?.off("keydown", this.keySelectHandler);
      this.keySelectHandler = undefined;
    }
    this.settingsButton?.destroy();
    this.settingsButton = undefined;
    this.hudContainer.destroy();
    this.locationContainer.destroy();
    this.slots = [];
  }
}
