import Phaser from "phaser";
import { getLevels } from "../levels";
import { type AudioSystem } from "../systems/AudioSystem";

/**
 * Game HUD for Bontaway.
 * Displays available weapon options (slots/tiles) at the bottom.
 * Styled to look hand-carved, ancient stone (3D slate bevels, chiseled cracks, lava glow).
 */
export class GameHUD {
  private scene: Phaser.Scene;
  private audioSystem?: AudioSystem;

  private hudContainer!: Phaser.GameObjects.Container;
  private backgroundGraphics!: Phaser.GameObjects.Graphics;

  // Level Selection Panel Properties
  private levelContainer!: Phaser.GameObjects.Container;
  private levelBackgroundRect!: Phaser.GameObjects.Graphics;
  private levelItems: Array<{
    container: Phaser.GameObjects.Container;
    bg: Phaser.GameObjects.Graphics;
    text: Phaser.GameObjects.Text;
    levelId: string;
  }> = [];

  // Weapon/Spell slots (only fireball is active for now)
  private slots: Array<{
    container: Phaser.GameObjects.Container;
    frame: Phaser.GameObjects.Graphics;
    icon?: Phaser.GameObjects.Image;
    keyText: Phaser.GameObjects.Text;
    labelText?: Phaser.GameObjects.Text;
    isActive: boolean;
  }> = [];

  private resizeHandler!: (gameSize: Phaser.Structs.Size) => void;
  private currentSelection = 0; // Fireball is index 0

  // Dimensions
  private readonly slotSize = 64;
  private readonly slotPadding = 12;
  private readonly numSlots = 3;
  private readonly panelPadding = 10;
  private readonly panelHeight = 84;
  private readonly panelWidth: number;

  constructor(scene: Phaser.Scene, audioSystem?: AudioSystem) {
    this.scene = scene;
    this.audioSystem = audioSystem;

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

    // Build the weapon slots
    this.createSlots();

    // Build Level Selection
    this.createLevelSelection();

    // Position initial layout and configure window resize handler
    this.reposition(this.scene.scale.gameSize);
    this.resizeHandler = (gameSize: Phaser.Structs.Size) => this.reposition(gameSize);
    this.scene.scale.on("resize", this.resizeHandler);

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
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

      let icon: Phaser.GameObjects.Image | undefined;
      let labelText: Phaser.GameObjects.Text | undefined;

      // Slot 1 is Fireball (our only weapon options tile for now)
      if (index === 0) {
        // Load the attached fireball tile image
        icon = this.scene.add.image(0, 4, "fireball_tile");

        // Scale to fit beautifully inside the 64x64 frame with 4px border margins on all sides (making it 52px max)
        const maxIconDim = this.slotSize - 12;
        if (icon.width > 0) {
          const scale = maxIconDim / Math.max(icon.width, icon.height);
          icon.setScale(scale);
        } else {
          // Fallback if texture not fully loaded during scene draw
          icon.setDisplaySize(maxIconDim, maxIconDim);
        }

        icon.setInteractive({ useHandCursor: true });
        slotContainer.add(icon);

        // Pointer interactions with the weapon slot tile click/hover
        const originalScale = icon.scale;

        icon.on("pointerover", () => {
          this.audioSystem?.play("sfx_pickup", 0.3);
          this.scene.tweens.add({
            targets: icon,
            scale: originalScale * 1.15,
            duration: 100,
            ease: "Quad.easeOut"
          });
        });

        icon.on("pointerout", () => {
          this.scene.tweens.add({
            targets: icon,
            scale: originalScale,
            duration: 120,
            ease: "Quad.easeIn"
          });
        });

        // Use pointerdown with propagation stop, preventing shooting fireball at HUD coordinates
        icon.on(
          "pointerdown",
          (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
            this.selectSlot(0);
          }
        );
      } else {
        // Empty locked slot - draw subtle runic symbol in the middle
        const rune = this.scene.add.text(0, -2, "⛤", {
          fontSize: "18px",
          color: "#181a1b"
        });
        rune.setOrigin(0.5, 0.5);
        slotContainer.add(rune);
      }

      this.slots.push({
        container: slotContainer,
        frame: frameGraphics,
        icon,
        keyText,
        labelText,
        isActive: index === 0
      });
    }

    this.redrawSlots();
  }

  private selectSlot(index: number): void {
    if (this.currentSelection === index) {
      return;
    }

    // Play tactile stone click sound
    this.audioSystem?.play("sfx_tablet", 0.5);
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
        if (slot.labelText) {
          slot.labelText.setColor(isSelected ? "#ffaa00" : "#a8a8a8");
        }
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
      const levelY = gameSize.height - 100 - 14;
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

    // Header Text
    const headerText = this.scene.add.text(12, 10, "LOCATIONS", {
      fontSize: "11px",
      fontFamily: "Cinzel, Georgia, serif",
      color: "#ffd59a",
      stroke: "#000000",
      strokeThickness: 2,
      fontStyle: "bold"
    });
    this.levelContainer.add(headerText);

    // List of levels
    interface LevelScene {
      getLevelId?(): string;
    }
    const availableLevels = getLevels();
    const levelScene = this.scene as unknown as LevelScene;
    const currentLevelId = levelScene.getLevelId?.() || "dungeon";

    const itemHeight = 24;
    const itemPadding = 8;
    const startY = 30;

    availableLevels.forEach((level, index) => {
      const itemY = startY + index * (itemHeight + itemPadding);

      const itemContainer = this.scene.add.container(10, itemY);
      this.levelContainer.add(itemContainer);

      const isSelected = level.id === currentLevelId;

      // Item background / frame
      const itemBg = this.scene.add.graphics();
      itemContainer.add(itemBg);

      // Label text
      const nameText = this.scene.add.text(22, itemHeight / 2, level.name.toUpperCase(), {
        fontSize: "10px",
        fontFamily: "Roboto Mono, Courier New, monospace",
        color: isSelected ? "#ff9900" : "#a8a8a8",
        fontStyle: isSelected ? "bold" : "normal"
      });
      nameText.setOrigin(0, 0.5);
      itemContainer.add(nameText);

      // Simple bullet indicator
      const bullet = this.scene.add.text(10, itemHeight / 2 - 1, "❖", {
        fontSize: "10px",
        color: isSelected ? "#ffbb33" : "#444444"
      });
      bullet.setOrigin(0.5, 0.5);
      itemContainer.add(bullet);

      // Hover / Click interaction zones
      const interactionZone = this.scene.add.zone(0, 0, 120, itemHeight).setOrigin(0, 0);
      interactionZone.setInteractive({ useHandCursor: true });
      itemContainer.add(interactionZone);

      // Draw the initial stone frame of the button
      this.drawStoneFrame(itemBg, 0, 0, 120, itemHeight, isSelected, false);

      interactionZone.on("pointerover", () => {
        this.audioSystem?.play("sfx_pickup", 0.3);
        nameText.setColor("#ffd59a");
        this.drawStoneFrame(itemBg, 0, 0, 120, itemHeight, true, false);
      });

      interactionZone.on("pointerout", () => {
        nameText.setColor(isSelected ? "#ff9900" : "#a8a8a8");
        this.drawStoneFrame(itemBg, 0, 0, 120, itemHeight, isSelected, false);
      });

      interactionZone.on(
        "pointerdown",
        (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          if (level.id !== currentLevelId) {
            this.audioSystem?.play("sfx_tablet", 0.6);
            // Restart scene with new level ID
            this.scene.scene.restart({ levelId: level.id });
          }
        }
      );

      this.levelItems.push({
        container: itemContainer,
        bg: itemBg,
        text: nameText,
        levelId: level.id
      });
    });
  }

  private drawLevelSelectionPanel(): void {
    const g = this.levelBackgroundRect;
    g.clear();

    const w = 140;
    const h = 100;

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
    this.hudContainer.destroy();
    this.backgroundGraphics.destroy();

    if (this.levelContainer) {
      this.levelContainer.destroy();
    }
    if (this.levelBackgroundRect) {
      this.levelBackgroundRect.destroy();
    }

    this.slots = [];
    this.levelItems = [];
  }
}
