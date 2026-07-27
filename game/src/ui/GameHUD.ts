import Phaser from "phaser";
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
  private glowGraphics!: Phaser.GameObjects.Graphics;

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
  private pulseTimer = 0;

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

    // Glow effect for selected active item (lava heat style)
    this.glowGraphics = this.scene.add.graphics();
    this.hudContainer.add(this.glowGraphics);

    // Stone plate background graphics
    this.backgroundGraphics = this.scene.add.graphics();
    this.hudContainer.add(this.backgroundGraphics);

    // Build the weapon slots
    this.createSlots();

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
        icon = this.scene.add.image(0, -2, "fireball_tile");

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

        // Spell label text underneath the slot
        labelText = this.scene.add.text(0, this.slotSize / 2 - 2, "FIREBALL", {
          fontSize: "8px",
          fontFamily: "Cinzel, Georgia, serif",
          color: "#ffd59a",
          stroke: "#000000",
          strokeThickness: 2
        });
        labelText.setOrigin(0.5, 1);
        slotContainer.add(labelText);

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
    // 1. Core stone plate filling
    const baseColor = isCarvedInOut ? 0x141517 : 0x2b2c2e;
    g.fillStyle(baseColor, 1);
    g.fillRect(x, y, w, h);

    // 2. Chiseled rough stone edges
    if (isCarvedInOut) {
      // Inset/凹 border (shading top/left, highlights bottom/right)
      g.lineStyle(2, 0x0a0b0c, 0.95);
      g.lineBetween(x, y, x + w, y);
      g.lineBetween(x, y, x, y + h);

      g.lineStyle(1, 0x484b4e, 0.4);
      g.lineBetween(x, y + h, x + w, y + h);
      g.lineBetween(x + w, y, x + w, y + h);
    } else {
      // Raised/凸 tablet (highlights top/left, shadows bottom/right)
      g.lineStyle(2, 0x6e7275, 0.85); // Light highlight
      g.lineBetween(x, y, x + w, y);
      g.lineBetween(x, y, x, y + h);

      g.lineStyle(2, 0x121315, 0.95); // Pitch shadow
      g.lineBetween(x, y + h, x + w, y + h);
      g.lineBetween(x + w, y, x + w, y + h);

      // Inner chiseled bezel border
      g.lineStyle(1, 0x1c1e20, 0.5);
      g.strokeRect(x + 4, y + 4, w - 8, h - 8);

      // Crack detail across stone border to emphasize tactile and weathered vibe
      g.lineStyle(1, 0x151617, 0.7);
      g.lineBetween(x + 5, y + 2, x + 8, y + 10);
      g.lineStyle(1, 0x6e7275, 0.3);
      g.lineBetween(x + 6, y + 2, x + 9, y + 10); // parallel highlights
    }

    // 3. Selection border indicator (burning orange lava border)
    if (isSelected) {
      g.lineStyle(2, 0xff5500, 1);
      g.strokeRect(x - 1, y - 1, w + 2, h + 2);
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
    g.fillStyle(0x1c1d1f, 0.92);
    g.fillRoundedRect(0, 0, w, h, 6);

    // 2. Chiseled beveled stone edge structure
    g.lineStyle(2, 0x5a5d60, 0.85); // Raised edge highlight (top and sides)
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, 3);
    g.lineTo(3, 0);
    g.lineTo(w - 3, 0);
    g.lineTo(w, 3);
    g.lineTo(w, h);
    g.strokePath();

    g.lineStyle(2, 0x0e0f10, 0.95); // Base shadow bottom
    g.lineBetween(0, h, w, h);

    // 3. Carved inner line track
    g.lineStyle(1, 0x111213, 0.8);
    g.strokeRoundedRect(5, 5, w - 10, h - 10, 4);

    // 4. Weathered/chipped stone cracks for the rustic SCP/liminal dark dungeon aesthetic
    g.lineStyle(1, 0x0c0c0d, 0.85);
    g.beginPath();
    g.moveTo(12, 5);
    g.lineTo(16, 22);
    g.lineTo(24, 25);
    g.strokePath();

    g.lineStyle(1, 0x55585a, 0.35); // offset highlights
    g.beginPath();
    g.moveTo(13, 5);
    g.lineTo(17, 22);
    g.lineTo(25, 25);
    g.strokePath();

    g.lineStyle(1, 0x0c0c0d, 0.85);
    g.beginPath();
    g.moveTo(w - 18, h - 5);
    g.lineTo(w - 22, h - 18);
    g.strokePath();

    g.lineStyle(1, 0x55585a, 0.35);
    g.beginPath();
    g.moveTo(w - 17, h - 5);
    g.lineTo(w - 21, h - 18);
    g.strokePath();
  }

  /**
   * Run-time updater to feed dynamic graphics like an active orange lava glow around selected tile.
   */
  public update(delta: number): void {
    this.pulseTimer += delta * 0.003;
    const alphaIntensity = 0.5 + Math.sin(this.pulseTimer) * 0.3; // oscillate between 0.2 and 0.8

    const glow = this.glowGraphics;
    glow.clear();

    const selectedSlotIndex = this.currentSelection;
    if (selectedSlotIndex < this.slots.length) {
      const slot = this.slots[selectedSlotIndex];
      if (slot && slot.isActive) {
        // Redraw subtle orange fire/lava glow bleeding underneath the tile
        const startX = this.panelPadding + this.slotSize / 2;
        const slotX = startX + selectedSlotIndex * (this.slotSize + this.slotPadding);
        const centerY = this.panelHeight / 2;

        const pad = 6;
        glow.fillStyle(0xff4400, alphaIntensity * 0.35);
        glow.fillRoundedRect(
          slotX - this.slotSize / 2 - pad,
          centerY - this.slotSize / 2 - pad,
          this.slotSize + pad * 2,
          this.slotSize + pad * 2,
          4
        );
      }
    }
  }

  public destroy(): void {
    if (this.resizeHandler) {
      this.scene.scale.off("resize", this.resizeHandler);
    }
    this.hudContainer.destroy();
    this.backgroundGraphics.destroy();
    this.glowGraphics.destroy();
    this.slots = [];
  }
}
