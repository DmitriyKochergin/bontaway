import Phaser from "phaser";
import { getLevels } from "../levels";
import { type AudioSystem } from "../systems/AudioSystem";
import { SettingsButton } from "./SettingsButton";

/**
 * Bridge to the gameplay scene the HUD controls.
 * Lets the HUD render on a separate (supervisor) scene while still driving level/audio state.
 */
export interface GameHudController {
  getLevelId(): string;
  restartLevel(levelId: string): void;
  getAudioSystem(): AudioSystem | undefined;
}

/**
 * Game HUD for Bontaway.
 * Displays available weapon options (slots/tiles) at the bottom.
 * Styled to look hand-carved, ancient stone (3D slate bevels, chiseled cracks, lava glow).
 */
export class GameHUD {
  private scene: Phaser.Scene;
  private controller: GameHudController;
  private onOpenSettings: () => void;
  private settingsButton?: SettingsButton;

  private hudContainer!: Phaser.GameObjects.Container;
  private backgroundGraphics!: Phaser.GameObjects.Graphics;

  // Location selection rail properties
  private levelContainer!: Phaser.GameObjects.Container;
  private levelBackgroundRect!: Phaser.GameObjects.Graphics;

  // Weapon/Spell slots (fireball + blue weapon)
  private slots: Array<{
    container: Phaser.GameObjects.Container;
    frame: Phaser.GameObjects.Graphics;
    icon?: Phaser.GameObjects.Image;
    keyText: Phaser.GameObjects.Text;
    isActive: boolean;
    baseScale: number;
  }> = [];

  private keySelectHandler?: (event: KeyboardEvent) => void;

  private resizeHandler!: (gameSize: Phaser.Structs.Size) => void;
  private currentSelection = 0; // Fireball is index 0, blue weapon is index 1

  // Dimensions
  private readonly slotSize = 64;
  private readonly slotPadding = 12;
  private readonly numSlots = 2;
  private readonly panelPadding = 10;
  private readonly panelHeight = 84;
  private readonly panelWidth: number;
  private readonly locationIconSize = 36;
  private readonly locationIconPadding = 6;
  private readonly locationPanelPadding = 6;

  constructor(scene: Phaser.Scene, controller: GameHudController, onOpenSettings: () => void) {
    this.scene = scene;
    this.controller = controller;
    this.onOpenSettings = onOpenSettings;

    // Calculate total width of the stone plate
    this.panelWidth = this.numSlots * this.slotSize + (this.numSlots - 1) * this.slotPadding + this.panelPadding * 2;
  }

  public create(): void {
    // Top container matching screen position
    this.hudContainer = this.scene.add.container(0, 0);
    this.hudContainer.setScrollFactor(0);
    this.hudContainer.setDepth(400); // Overlay on top of gameplay and fov

    // Stone plate background graphics
    this.backgroundGraphics = this.scene.add.graphics();
    this.hudContainer.add(this.backgroundGraphics);

    // Full-plate input blocker: swallows clicks anywhere on the panel, not just on
    // buttons. Added before the slots so slots stay on top and keep their own input.
    const panelBlocker = this.scene.add.zone(0, 0, this.panelWidth, this.panelHeight).setOrigin(0, 0);
    panelBlocker.setInteractive();
    this.hudContainer.add(panelBlocker);

    // Build the weapon slots
    this.createSlots();

    // Build Level Selection
    this.createLevelSelection();

    // Settings gear (top-right), owned by the HUD.
    this.settingsButton = new SettingsButton(this.scene, () => {
      this.controller.getAudioSystem()?.play("sfx_tablet", 0.4);
      this.onOpenSettings();
    });
    this.settingsButton.create();

    // Position initial layout and configure window resize handler
    this.reposition(this.scene.scale.gameSize);
    this.resizeHandler = (gameSize: Phaser.Structs.Size) => this.reposition(gameSize);
    this.scene.scale.on("resize", this.resizeHandler);

    // Number keys 1..N select the matching weapon slot.
    this.keySelectHandler = (event: KeyboardEvent) => {
      const slotNumber = Number.parseInt(event.key, 10);
      if (slotNumber >= 1 && slotNumber <= this.numSlots) {
        this.activateSlot(slotNumber - 1);
      }
    };
    this.scene.input.keyboard?.on("keydown", this.keySelectHandler);
  }

  public getSelectedWeaponSlot(): number {
    return this.currentSelection;
  }

  private createSlots(): void {
    const startX = this.panelPadding + this.slotSize / 2;
    const centerY = this.panelHeight / 2;

    for (let index = 0; index < this.numSlots; index++) {
      const slotX = startX + index * (this.slotSize + this.slotPadding);
      const slotContainer = this.scene.add.container(slotX, centerY);
      this.hudContainer.add(slotContainer);

      // Frame graphics for slot
      const frameGraphics = this.scene.add.graphics();
      slotContainer.add(frameGraphics);

      // Hotkey designator
      const keyText = this.scene.add.text(-this.slotSize / 2 + 5, -this.slotSize / 2 + 4, `${index + 1}`, {
        fontSize: "10px",
        fontFamily: "Roboto Mono, Courier New, monospace",
        color: index === 0 ? "#ff6600" : "#555555",
        fontStyle: "bold"
      });
      slotContainer.add(keyText);

      const slotDefinitions = [{ texture: "fireball_tile" }, { texture: "weapon-blue-sphere" }] as const;

      const slotDefinition = slotDefinitions[index];
      let icon: Phaser.GameObjects.Image | undefined;
      icon = this.scene.add.image(0, index === 0 ? 3 : 0, slotDefinition.texture);

      const maxIconDim = this.slotSize - 12;
      if (icon.width > 0) {
        const scale = maxIconDim / Math.max(icon.width, icon.height);
        icon.setScale(scale);
      } else {
        icon.setDisplaySize(maxIconDim, maxIconDim);
      }

      icon.setInteractive({ useHandCursor: true });
      slotContainer.add(icon);

      const slotHalf = this.slotSize / 2;

      icon.on("pointerover", () => {
        frameGraphics.clear();
        this.drawStoneFrame(frameGraphics, -slotHalf, -slotHalf, this.slotSize, this.slotSize, true, false);
      });

      icon.on("pointerout", () => {
        this.redrawSlots();
      });

      icon.on(
        "pointerdown",
        (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          this.activateSlot(index);
        }
      );

      this.slots.push({
        container: slotContainer,
        frame: frameGraphics,
        icon,
        keyText,
        isActive: true,
        baseScale: icon ? icon.scale : 1
      });
    }

    this.redrawSlots();
  }

  /**
   * Select a weapon slot from user input (pointer tile or number key).
   * Plays the click sound, pulses the tile, and marks the slot selected.
   * Locked/inactive slots are ignored.
   */
  private activateSlot(index: number): void {
    const slot = this.slots[index];
    if (!slot || !slot.isActive) {
      return;
    }

    this.controller.getAudioSystem()?.play("sfx_pickup", 0.4);

    if (slot.icon) {
      this.scene.tweens.add({
        targets: slot.icon,
        scale: slot.baseScale * 1.15,
        duration: 100,
        yoyo: true,
        ease: "Quad.easeOut"
      });
    }

    this.selectSlot(index);
  }

  private selectSlot(index: number): void {
    if (this.currentSelection === index) {
      return;
    }

    this.currentSelection = index;
    this.redrawSlots();
  }

  private redrawSlots(): void {
    const half = this.slotSize / 2;

    for (let index = 0; index < this.slots.length; index++) {
      const slot = this.slots[index];
      const g = slot.frame;
      g.clear();

      const isSelected = this.currentSelection === index;

      if (!slot.isActive) {
        // Render Empty/Locked Slot (Carved Outwards/Inwards)
        this.drawStoneFrame(g, -half, -half, this.slotSize, this.slotSize, false, true);
        slot.keyText.setColor("#444444");
      } else {
        // Render Active Slot
        this.drawStoneFrame(g, -half, -half, this.slotSize, this.slotSize, isSelected, false);
        slot.keyText.setColor(isSelected ? "#ff7700" : "#888888");
      }
    }
  }

  /**
   * Helper to draw high-fidelity, hand-crafted beveled stone slate surfaces.
   * Leverages multi-layered border lighting, inner insets, and rough chisel markings.
   */
  private drawStoneFrame(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    isSelected: boolean,
    isCarvedInOut: boolean
  ): void {
    if (isCarvedInOut) {
      // Inset frame (deep carved stone pit)
      // 1. Dark hollow fill
      g.fillStyle(0x101113, 1);
      g.fillRect(x, y, w, h);

      // 2. Organic chiseled texture inside the carving
      let s = 101;
      const r = () => {
        const v = Math.sin(s++) * 10000;
        return v - Math.floor(v);
      };
      for (let i = 0; i < 15; i++) {
        const cx = x + 3 + Math.floor(r() * (w - 6));
        const cy = y + 3 + Math.floor(r() * (h - 6));
        g.fillStyle(0x050607, 0.6);
        g.fillRect(cx, cy, 3, 2);
      }

      // 3. Crisp inner shadows: deep cut pit bevels
      g.lineStyle(3, 0x050607, 1); // Dark bevel shadow
      g.lineBetween(x, y + 1, x + w, y + 1);
      g.lineBetween(x + 1, y, x + 1, y + h);

      g.lineStyle(1.5, 0x090a0c, 0.8);
      g.strokeRect(x + 1, y + 1, w - 2, h - 2);

      // Top-left shadow bleed
      g.fillStyle(0x000000, 0.4);
      g.fillRect(x, y, w, 4);
      g.fillRect(x, y, 4, h);

      // Bottom-right inner highlights (the light catching the bottom wall of the carven pit)
      g.lineStyle(1.5, 0x3d4144, 0.7);
      g.lineBetween(x + 2, y + h - 1, x + w - 2, y + h - 1);
      g.lineBetween(x + w - 1, y + 2, x + w - 1, y + h - 2);
    } else {
      // Raised slate brick
      // 1. Base stone brick fill
      g.fillStyle(0x2d3134, 1);
      g.fillRect(x, y, w, h);

      // 2. Chiseled lines (horizontal fractured texture)
      g.fillStyle(0x232527, 0.6);
      g.fillRect(x + 2, y + h / 2 - 3, w - 4, 3);
      g.fillStyle(0x3e4245, 0.3);
      g.fillRect(x + 2, y + h / 2, w - 4, 1);

      // Deterministic texture noise inside raised brick
      let s = 202;
      const r = () => {
        const v = Math.sin(s++) * 10000;
        return v - Math.floor(v);
      };
      for (let i = 0; i < 18; i++) {
        const cx = x + 3 + Math.floor(r() * (w - 6));
        const cy = y + 3 + Math.floor(r() * (h - 6));
        const c = r() > 0.5 ? 0x1c1d1f : 0x555c60;
        g.fillStyle(c, r() > 0.5 ? 0.4 : 0.2);
        g.fillRect(cx, cy, r() > 0.5 ? 3 : 2, 2);
      }

      // 3. Thick 3D stone bevels
      // Raised/凸 tablet (highlights top/left, pitch-black shadow bottom/right)
      g.lineStyle(2, 0x73787c, 0.9); // Top lighting highlight
      g.lineBetween(x + 1, y + 1, x + w - 1, y + 1);
      g.lineBetween(x + 1, y + 1, x + 1, y + h - 1);

      g.lineStyle(2.5, 0x0c0d0e, 1.0); // Bottom deep drop shadow
      g.lineBetween(x + 1, y + h - 1, x + w - 1, y + h - 1);
      g.lineBetween(x + w - 1, y + 1, x + w - 1, y + h - 1);

      // Weathered notches inside borders (damaged brick details)
      g.lineStyle(1.5, 0x0f1011, 0.95);
      g.lineBetween(x + w - 12, y + 1, x + w - 10, y + 6); // notch crack
      g.lineStyle(1, 0x73787c, 0.4);
      g.lineBetween(x + w - 11, y + 1, x + w - 9, y + 6);
    }

    // 3. Selection border indicator (weathered iron border with gold/amber/bronze accent)
    if (isSelected) {
      g.lineStyle(2.5, 0xffbb33, 1);
      g.strokeRect(x - 1, y - 1, w + 2, h + 2);
      g.lineStyle(1, 0x995500, 0.8);
      g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
  }

  /**
   * Reposition the entire HUD container at the bottom center of the game camera viewport.
   */
  private reposition(gameSize: Phaser.Structs.Size): void {
    const x = gameSize.width / 2 - this.panelWidth / 2;
    const y = gameSize.height - this.panelHeight - 14;

    this.hudContainer.setPosition(x, y);

    this.drawMainPanel();

    if (this.levelContainer) {
      const levelX = 20;
      const levelY = gameSize.height - this.getLocationPanelHeight() - 14;
      this.levelContainer.setPosition(levelX, levelY);
      this.drawLevelSelectionPanel();
    }
  }

  /**
   * Redraw the core stone backing panel frame that holds the list of hotbar slots.
   */
  private drawMainPanel(): void {
    const g = this.backgroundGraphics;
    g.clear();

    const w = this.panelWidth;
    const h = this.panelHeight;

    // 1. Fill base dark obsidian / slate texture
    g.fillStyle(0x1c1d1f, 0.95);
    g.fillRoundedRect(0, 0, w, h, 6);

    // 2. Slate horizontal fracture layered textures (simulating split rock slabs)
    const slateLayers = 5;
    for (let i = 1; i < slateLayers; i++) {
      const yPos = (h / slateLayers) * i;
      g.fillStyle(0x121314, 0.35);
      g.fillRect(3, yPos, w - 6, 2);
      g.fillStyle(0x313437, 0.08);
      g.fillRect(3, yPos + 2, w - 6, 1);
    }

    // 3. Procedural chiseled fleck noise (completely deterministic via constant seed)
    let seed = 777;
    const pseudoRandom = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    for (let i = 0; i < 45; i++) {
      const fx = Math.floor(pseudoRandom() * (w - 12)) + 6;
      const fy = Math.floor(pseudoRandom() * (h - 12)) + 6;
      const fw = Math.floor(pseudoRandom() * 4) + 2;
      const fh = Math.floor(pseudoRandom() * 2) + 1;
      const isDark = pseudoRandom() > 0.45;
      g.fillStyle(isDark ? 0x0a0b0c : 0x5a5f64, isDark ? 0.3 : 0.12);
      g.fillRect(fx, fy, fw, fh);
    }

    // 4. Chipped edge notches directly on the stone plate borders
    g.fillStyle(0x0e0f10, 0.9); // dark cutout shadow
    g.fillRect(w - 18, 0, 5, 2);
    g.fillRect(24, h - 3, 6, 3);
    g.fillRect(0, 32, 2, 6);

    g.fillStyle(0x6e7275, 0.5); // highlighted rock corner catch
    g.fillRect(w - 18, 2, 5, 1);
    g.fillRect(24, h - 4, 6, 1);
    g.fillRect(2, 32, 1, 6);

    // 5. Chiseled beveled stone edge structure (Raised outline)
    g.lineStyle(2, 0x6e7275, 0.85); // Raised edge highlight (top and sides)
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, 3);
    g.lineTo(3, 0);
    g.lineTo(w - 3, 0);
    g.lineTo(w, 3);
    g.lineTo(w, h);
    g.strokePath();

    g.lineStyle(2, 0x0c0d0e, 0.95); // Base shadow bottom
    g.lineBetween(0, h, w, h);

    // 6. Carved inner line track
    g.lineStyle(1.5, 0x111213, 0.7);
    g.strokeRoundedRect(5, 5, w - 10, h - 10, 4);

    // 7. Weathered/chipped stone cracks for the rustic SCP/liminal dark dungeon aesthetic
    g.lineStyle(1, 0x0a0b0c, 0.9);
    g.beginPath();
    g.moveTo(12, 5);
    g.lineTo(16, 22);
    g.lineTo(24, 25);
    g.strokePath();

    g.lineStyle(1, 0x6e7275, 0.35); // offset parallel highlights
    g.beginPath();
    g.moveTo(13, 5);
    g.lineTo(17, 22);
    g.lineTo(25, 25);
    g.strokePath();

    g.lineStyle(1, 0x0a0b0c, 0.9);
    g.beginPath();
    g.moveTo(w - 18, h - 5);
    g.lineTo(w - 22, h - 18);
    g.strokePath();

    g.lineStyle(1, 0x6e7275, 0.35);
    g.beginPath();
    g.moveTo(w - 17, h - 5);
    g.lineTo(w - 21, h - 18);
    g.strokePath();
  }

  /**
   * Run-time updater for HUD animations and status (deprecated, no current tasks).
   */
  public update(_delta?: number): void {}

  private createLevelSelection(): void {
    this.levelContainer = this.scene.add.container(0, 0);
    this.levelContainer.setScrollFactor(0);
    this.levelContainer.setDepth(400);

    this.levelBackgroundRect = this.scene.add.graphics();
    this.levelContainer.add(this.levelBackgroundRect);

    const panelWidth = this.getLocationPanelWidth();
    const panelHeight = this.getLocationPanelHeight();
    const levelBlocker = this.scene.add.zone(0, 0, panelWidth, panelHeight).setOrigin(0, 0);
    levelBlocker.setInteractive();
    this.levelContainer.add(levelBlocker);

    const availableLevels = getLevels();
    const currentLevelId = this.controller.getLevelId();

    availableLevels.forEach((level, index) => {
      const itemY = this.locationPanelPadding + index * (this.locationIconSize + this.locationIconPadding);

      const itemContainer = this.scene.add.container(this.locationPanelPadding, itemY);
      this.levelContainer.add(itemContainer);

      const isSelected = level.id === currentLevelId;

      // Item background / frame
      const itemBg = this.scene.add.graphics();
      itemContainer.add(itemBg);

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

      this.drawStoneFrame(itemBg, 0, 0, this.locationIconSize, this.locationIconSize, isSelected, false);

      interactionZone.on("pointerover", () => {
        itemBg.clear();
        this.drawStoneFrame(itemBg, 0, 0, this.locationIconSize, this.locationIconSize, true, false);
      });

      interactionZone.on("pointerout", () => {
        itemBg.clear();
        this.drawStoneFrame(itemBg, 0, 0, this.locationIconSize, this.locationIconSize, isSelected, false);
      });

      interactionZone.on(
        "pointerdown",
        (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          if (level.id !== currentLevelId) {
            this.controller.getAudioSystem()?.play("sfx_pickup", 0.4);
            // Defer the restart: GameScene's AudioSystem closes its AudioContext on
            // shutdown, which would cut the selection sound. Wait for it to finish.
            // Scheduled on this.scene (MainScene), which survives the GameScene restart.
            this.scene.time.delayedCall(220, () => this.controller.restartLevel(level.id));
          }
        }
      );
    });
  }

  private getLocationIconTexture(levelId: string): string {
    return levelId === "arena" ? "obstacle" : "door_1";
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

  private drawLevelSelectionPanel(): void {
    const g = this.levelBackgroundRect;
    g.clear();

    const w = this.getLocationPanelWidth();
    const h = this.getLocationPanelHeight();

    // 1. Fill base dark obsidian / slate texture
    g.fillStyle(0x1c1d1f, 0.95);
    g.fillRoundedRect(0, 0, w, h, 6);

    // 2. Slate horizontal fracture layered textures (simulating split rock slabs)
    const slateLayers = 4;
    for (let i = 1; i < slateLayers; i++) {
      const yPos = (h / slateLayers) * i;
      g.fillStyle(0x121314, 0.35);
      g.fillRect(3, yPos, w - 6, 2);
      g.fillStyle(0x313437, 0.08);
      g.fillRect(3, yPos + 2, w - 6, 1);
    }

    // 3. Procedural chiseled fleck noise (completely deterministic via constant seed)
    let seed = 888;
    const pseudoRandom = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    for (let i = 0; i < 20; i++) {
      const fx = Math.floor(pseudoRandom() * (w - 12)) + 6;
      const fy = Math.floor(pseudoRandom() * (h - 12)) + 6;
      const fw = Math.floor(pseudoRandom() * 4) + 2;
      const fh = Math.floor(pseudoRandom() * 2) + 1;
      const isDark = pseudoRandom() > 0.45;
      g.fillStyle(isDark ? 0x0a0b0c : 0x5a5f64, isDark ? 0.3 : 0.12);
      g.fillRect(fx, fy, fw, fh);
    }

    // 5. Chiseled beveled stone edge structure (Raised outline)
    g.lineStyle(2, 0x6e7275, 0.85); // Raised edge highlight (top and sides)
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, 3);
    g.lineTo(3, 0);
    g.lineTo(w - 3, 0);
    g.lineTo(w, 3);
    g.lineTo(w, h);
    g.strokePath();

    g.lineStyle(2, 0x0c0d0e, 0.95); // Base shadow bottom
    g.lineBetween(0, h, w, h);

    // 6. Carved inner line track
    g.lineStyle(1.5, 0x111213, 0.7);
    g.strokeRoundedRect(5, 5, w - 10, h - 10, 4);
  }

  public destroy(): void {
    if (this.resizeHandler) {
      this.scene.scale.off("resize", this.resizeHandler);
    }
    if (this.keySelectHandler) {
      this.scene.input.keyboard?.off("keydown", this.keySelectHandler);
      this.keySelectHandler = undefined;
    }
    this.settingsButton?.destroy();
    this.settingsButton = undefined;
    this.hudContainer.destroy();
    this.backgroundGraphics.destroy();

    if (this.levelContainer) {
      this.levelContainer.destroy();
    }
    if (this.levelBackgroundRect) {
      this.levelBackgroundRect.destroy();
    }

    this.slots = [];
  }
}
