import Phaser from "phaser";
import { type NpcType } from "../entities/NPC";
import { type NpcStyle, NPC_STYLES } from "../entities/NpcStyle";
import { type NpcEmotion, NPC_EMOTIONS } from "../entities/NpcEmotion";

/**
 * Boot scene.
 * Builds shared textures, then hands control to `MainScene` for gameplay orchestration.
 */
export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super("PreloadScene");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#0a0a0a");

    const loadingUi = this.createLoadingUi();
    this.queueFireballAudio();

    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => {
      this.updateLoadingUi(loadingUi, progress);
    });

    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.buildSharedTextures();
      loadingUi.container.destroy();
      this.scene.start("MainScene");
    });

    this.load.start();
  }

  private queueFireballAudio(): void {
    this.load.audio("fireball_cast", "assets/sound/fireball/freesound_community-short-fireball-woosh-6146.mp3");
    this.load.audio(
      "fireball_hit",
      "assets/sound/fireball/cartoon-music-game-sfx-fireball-explosion-impact-2-568074.mp3"
    );
  }

  private buildSharedTextures(): void {
    this.createFloorTexture();
    this.createWallTexture();
    this.createDoorTextures();
    this.createPlayerTexture();
    this.createNpcTextures();
    this.createObstacleTexture();
    this.createFireballTexture();
    this.createFireballTileTexture();
    this.createGearTexture();
  }

  private createLoadingUi(): {
    container: Phaser.GameObjects.Container;
    barFill: Phaser.GameObjects.Graphics;
    percentText: Phaser.GameObjects.Text;
  } {
    const width = this.scale.width;
    const height = this.scale.height;
    const container = this.add.container(0, 0).setDepth(1000);

    const title = this.add.text(width / 2, height / 2 - 72, "Loading...", {
      fontSize: "20px",
      color: "#ffffff"
    });
    title.setOrigin(0.5, 0.5);

    const barBg = this.add.graphics();
    barBg.fillStyle(0x222222, 0.9);
    barBg.fillRoundedRect(width / 2 - 160, height / 2 - 18, 320, 36, 6);

    const barFill = this.add.graphics();
    barFill.fillStyle(0x8b5cf6, 1);
    barFill.fillRoundedRect(width / 2 - 150, height / 2 - 8, 0, 16, 4);

    const percentText = this.add.text(width / 2, height / 2 + 28, "0%", {
      fontSize: "14px",
      color: "#cfcfcf"
    });
    percentText.setOrigin(0.5, 0.5);

    container.add([title, barBg, barFill, percentText]);

    return { container, barFill, percentText };
  }

  private updateLoadingUi(
    loadingUi: { barFill: Phaser.GameObjects.Graphics; percentText: Phaser.GameObjects.Text },
    progress: number
  ): void {
    const clampedProgress = Phaser.Math.Clamp(progress, 0, 1);
    const width = 300 * clampedProgress;

    loadingUi.barFill.clear();
    loadingUi.barFill.fillStyle(0x8b5cf6, 1);
    loadingUi.barFill.fillRoundedRect(this.scale.width / 2 - 150, this.scale.height / 2 - 8, width, 16, 4);
    loadingUi.percentText.setText(`${Math.round(clampedProgress * 100)}%`);
  }

  private createFloorTexture(): void {
    const floor = this.add.graphics();
    floor.fillStyle(0x1a1a1a);
    floor.fillRect(0, 0, 32, 32);
    floor.lineStyle(1, 0x121212);
    floor.strokeRect(0, 0, 32, 32);
    for (let index = 0; index < 5; index++) {
      floor.fillStyle(0x222222, 0.5);
      floor.fillRect(Phaser.Math.Between(2, 25), Phaser.Math.Between(2, 25), 4, 4);
    }
    floor.generateTexture("floor", 32, 32);
    floor.destroy();
  }

  private createWallTexture(): void {
    const wall = this.add.graphics();
    wall.fillStyle(0x333333);
    wall.fillRect(0, 0, 32, 32);
    wall.lineStyle(2, 0x111111);
    wall.strokeRect(0, 0, 32, 32);
    wall.lineStyle(1, 0x444444);
    wall.moveTo(0, 0);
    wall.lineTo(32, 0);
    wall.moveTo(0, 0);
    wall.lineTo(0, 32);
    wall.strokePath();
    wall.generateTexture("wall", 32, 32);
    wall.destroy();
  }

  private createDoorTextures(): void {
    const doorVariants = [{ textureKey: "door_1", fillColor: 0x876812, frameColor: 0x7a5616, handleColor: 0x3b290c }];

    for (const variant of doorVariants) {
      this.createDoorTexture(variant.textureKey, variant.fillColor, variant.frameColor, variant.handleColor);
    }
  }

  private createDoorTexture(textureKey: string, fillColor: number, frameColor: number, handleColor: number): void {
    const door = this.add.graphics();

    const innerWidth = 30;
    const innerHeight = 30;
    const innerX = 1;
    const innerY = 1;

    door.fillStyle(fillColor);
    door.fillRoundedRect(innerX, innerY, innerWidth, innerHeight, 3);

    door.lineStyle(1, frameColor, 0.7);
    door.strokeRoundedRect(innerX, innerY, innerWidth, innerHeight, 2);

    // door vertical lines ------------------------
    door.fillStyle(0xffffff, 0.18);
    door.fillRect(innerX + 2, innerY + 2, 3, innerHeight - 4);

    door.fillStyle(0x000000, 0.12);
    door.fillRect(innerX + innerWidth - 5, innerY + 2, 3, innerHeight - 4);

    // door.lineStyle(1, 0x3b2b10, 0.55);
    // door.moveTo(innerX + innerWidth / 2 - 4, innerY + 2);
    // door.lineTo(innerX + innerWidth / 2 - 4, innerY + innerHeight - 2);
    // door.moveTo(innerX + innerWidth / 2 + 4, innerY + 2);
    // door.lineTo(innerX + innerWidth / 2 + 4, innerY + innerHeight - 2);
    // door.strokePath();
    // END door vertical lines --------------------

    // door handle --------------------
    door.fillStyle(handleColor);
    // circle handle
    // door.fillCircle(innerX + innerWidth - 7, innerY + innerHeight / 2, 2.5);
    door.fillStyle(0x37270c, 0.85);
    door.fillRect(innerX + innerWidth - 11, innerY + innerHeight / 2 - 1, 7, 3);
    // END handle --------------------

    door.generateTexture(textureKey, 32, 32);
    door.destroy();
  }

  private createPlayerTexture(): void {
    const player = this.add.graphics();

    const frames = [
      { y: 8, h: 9, r: 2.5 }, // Frame 0: Open
      { y: 10, h: 5, r: 2.0 }, // Frame 1: Half closed
      { y: 12, h: 1.5, r: 0.75 }, // Frame 2: Closed slit
      { y: 10, h: 5, r: 2.0 } // Frame 3: Half open
    ];

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const offsetX = i * 32;

      player.fillStyle(0x777777);
      player.fillCircle(offsetX + 16, 16, 14);

      player.fillStyle(0x111111, 0.9);
      player.fillRoundedRect(offsetX + 9, frame.y, 5, frame.h, frame.r);
      player.fillRoundedRect(offsetX + 18, frame.y, 5, frame.h, frame.r);
    }

    player.generateTexture("player", 128, 32);
    player.destroy();

    const playerTex = this.textures.get("player");
    for (let i = 0; i < frames.length; i++) {
      playerTex.add(i, 0, i * 32, 0, 32, 32);
    }

    if (!this.anims.exists("player_blink")) {
      this.anims.create({
        key: "player_blink",
        frames: this.anims.generateFrameNumbers("player", { start: 0, end: 3 }),
        frameRate: 15,
        repeat: 0
      });
    }
  }

  private createNpcTextures(): void {
    // Generate baseline (neutral/no emotion) textures
    for (const [npcType, style] of Object.entries(NPC_STYLES) as [NpcType, NpcStyle][]) {
      this.generateSingleNpcTexture(npcType, style, null);
    }

    // Generate emotion-specific textures
    for (const [npcType, style] of Object.entries(NPC_STYLES) as [NpcType, NpcStyle][]) {
      for (const emotion of NPC_EMOTIONS) {
        this.generateSingleNpcTexture(npcType, style, emotion);
      }
    }
  }

  private generateSingleNpcTexture(
    npcType: NpcType,
    style: NpcStyle,
    emotion: NpcEmotion | null
  ): void {
    const textureKey = emotion ? `npc_${npcType}_${emotion}` : `npc_${npcType}`;
    if (this.textures.exists(textureKey)) {
      return;
    }

    const npc = this.add.graphics();
    const frames = [
      { y: 8, h: 9, r: 2.5 }, // Frame 0: Open
      { y: 10, h: 5, r: 2.0 }, // Frame 1: Half closed
      { y: 12, h: 1.5, r: 0.75 }, // Frame 2: Closed slit
      { y: 10, h: 5, r: 2.0 } // Frame 3: Half open
    ];

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const offsetX = i * 32;

      // Body
      npc.fillStyle(style.bodyColor);
      npc.fillCircle(offsetX + 16, 16, 14);

      npc.lineStyle(1.5, 0x111111, 0.8);
      npc.strokeCircle(offsetX + 16, 16, 14);

      // Face elements (eyes, brows, tears, blush, etc.)
      this.drawNpcFace(npc, offsetX, frame, style, emotion, i);
    }

    npc.generateTexture(textureKey, 128, 32);
    npc.destroy();

    const npcTex = this.textures.get(textureKey);
    for (let i = 0; i < frames.length; i++) {
      npcTex.add(i, 0, i * 32, 0, 32, 32);
    }

    if (!this.anims.exists(`${textureKey}_blink`)) {
      this.anims.create({
        key: `${textureKey}_blink`,
        frames: this.anims.generateFrameNumbers(textureKey, { start: 0, end: 3 }),
        frameRate: 15,
        repeat: 0
      });
    }
  }

  private drawNpcFace(
    npc: Phaser.GameObjects.Graphics,
    offsetX: number,
    frame: { y: number; h: number; r: number },
    style: NpcStyle,
    emotion: NpcEmotion | null,
    blinkFrameIndex: number
  ): void {
    const { eyeColor, eyeSpread, showBrows = true } = style;
    const cx = offsetX + 16;
    const isClosed = blinkFrameIndex === 2;
    const isHalf = blinkFrameIndex === 1 || blinkFrameIndex === 3;

    const ey = frame.y;
    const eh = frame.h;
    const er = frame.r;

    if (isClosed) {
      // Draw closed slit for eyes
      npc.fillStyle(eyeColor, 0.9);
      npc.fillRoundedRect(cx - eyeSpread - 1.5, 12, 5, 1.5, 0.75);
      npc.fillRoundedRect(cx + eyeSpread - 3.5, 12, 5, 1.5, 0.75);

      this.drawEyebrowsAndDetails(npc, cx, eyeSpread, emotion, true, showBrows);
      return;
    }

    if (!emotion || emotion === "neutral") {
      npc.fillStyle(eyeColor, 0.9);
      npc.fillRoundedRect(cx - eyeSpread - 1.5, ey, 5, eh, er);
      npc.fillRoundedRect(cx + eyeSpread - 3.5, ey, 5, eh, er);
    } else if (emotion === "angry" || emotion === "sad" || emotion === "devastated") {
      // Standard eye shapes with specific brow/tears overlays
      npc.fillStyle(eyeColor, 0.9);
      npc.fillRoundedRect(cx - eyeSpread - 1.5, ey, 5, eh, er);
      npc.fillRoundedRect(cx + eyeSpread - 3.5, ey, 5, eh, er);
    } else if (emotion === "happy") {
      // Curved upward arc for happy eyes
      npc.lineStyle(2, eyeColor, 0.9);
      const arcH = isHalf ? eh / 2 : eh;
      this.drawQuadraticCurve(npc, cx - eyeSpread - 2.5, ey + arcH, cx - eyeSpread + 1, ey, cx - 0.5, ey + arcH);
      this.drawQuadraticCurve(npc, cx + 0.5, ey + arcH, cx + eyeSpread - 1, ey, cx + eyeSpread + 2.5, ey + arcH);
    } else if (emotion === "surprised") {
      // Large circular eyes
      const radius = isHalf ? 2 : 3.5;
      npc.fillStyle(eyeColor, 0.9);
      npc.fillCircle(cx - eyeSpread, ey + eh / 2, radius);
      npc.fillCircle(cx + eyeSpread, ey + eh / 2, radius);
    } else if (emotion === "fear") {
      // Tiny pupils
      const radius = isHalf ? 1 : 1.5;
      npc.fillStyle(eyeColor, 0.9);
      npc.fillCircle(cx - eyeSpread, ey + eh / 2, radius);
      npc.fillCircle(cx + eyeSpread, ey + eh / 2, radius);
    } else if (emotion === "disgusted") {
      // Squinted tiny slots
      const height = isHalf ? 1.5 : 3;
      npc.fillStyle(eyeColor, 0.9);
      npc.fillRect(cx - eyeSpread - 2, ey + eh / 2 - height / 2, 5, height);
      npc.fillRect(cx + eyeSpread - 3, ey + eh / 2 - height / 2, 5, height);
    } else if (emotion === "suspicious") {
      // Left eye normal, right eye squinted
      const rHeight = isHalf ? 1.5 : 2.5;
      npc.fillStyle(eyeColor, 0.9);
      npc.fillRoundedRect(cx - eyeSpread - 1.5, ey, 5, eh, er);
      npc.fillRect(cx + eyeSpread - 3.5, ey + eh / 2 - rHeight / 2, 5, rHeight);
    } else if (emotion === "sleepy") {
      // Capped height for half-closed look
      const reducedH = Math.min(eh, isHalf ? 2 : 4);
      npc.fillStyle(eyeColor, 0.9);
      npc.fillRoundedRect(cx - eyeSpread - 1.5, ey + 2, 5, reducedH, er);
      npc.fillRoundedRect(cx + eyeSpread - 3.5, ey + 2, 5, reducedH, er);
    } else if (emotion === "bored") {
      // Flat line eyes
      const height = isHalf ? 1 : 2;
      npc.fillStyle(eyeColor, 0.9);
      npc.fillRect(cx - eyeSpread - 2, ey + eh / 2 - height / 2, 5, height);
      npc.fillRect(cx + eyeSpread - 3, ey + eh / 2 - height / 2, 5, height);
    } else if (emotion === "excited") {
      // Cross/star shape
      npc.lineStyle(2, eyeColor, 0.9);
      const len = isHalf ? 2.5 : 4;
      npc.beginPath();
      npc.moveTo(cx - eyeSpread - len / 2, ey + eh / 2);
      npc.lineTo(cx - eyeSpread + len / 2, ey + eh / 2);
      npc.moveTo(cx - eyeSpread, ey + eh / 2 - len / 2);
      npc.lineTo(cx - eyeSpread, ey + eh / 2 + len / 2);
      npc.strokePath();

      npc.beginPath();
      npc.moveTo(cx + eyeSpread - len / 2, ey + eh / 2);
      npc.lineTo(cx + eyeSpread + len / 2, ey + eh / 2);
      npc.moveTo(cx + eyeSpread, ey + eh / 2 - len / 2);
      npc.lineTo(cx + eyeSpread, ey + eh / 2 + len / 2);
      npc.strokePath();
    } else if (emotion === "confused") {
      // Left eye high, right eye low
      npc.fillStyle(eyeColor, 0.9);
      npc.fillRoundedRect(cx - eyeSpread - 1.5, ey - 2, 5, eh, er);
      npc.fillRoundedRect(cx + eyeSpread - 3.5, ey + 2, 5, eh, er);
    } else if (emotion === "proud") {
      // Curved downward eyes (relaxed)
      npc.lineStyle(2, eyeColor, 0.9);
      const arcH = isHalf ? eh / 2 : eh;
      this.drawQuadraticCurve(npc, cx - eyeSpread - 2.5, ey, cx - eyeSpread + 1, ey + arcH, cx - 0.5, ey);
      this.drawQuadraticCurve(npc, cx + 0.5, ey, cx + eyeSpread - 1, ey + arcH, cx + eyeSpread + 2.5, ey);
    } else if (emotion === "manic") {
      // Mismatched size
      npc.fillStyle(eyeColor, 0.9);
      npc.fillCircle(cx - eyeSpread, ey + eh / 2, isHalf ? 2.5 : 4.5);
      npc.fillCircle(cx + eyeSpread, ey + eh / 2, isHalf ? 1 : 1.5);
    } else if (emotion === "smug") {
      // Squinted and looking to the side
      const height = isHalf ? 2 : 3.5;
      npc.fillStyle(eyeColor, 0.9);
      npc.fillRect(cx - eyeSpread - 0.5, ey + eh / 2 - height / 2, 4, height);
      npc.fillRect(cx + eyeSpread - 2.5, ey + eh / 2 - height / 2, 4, height);
    } else if (emotion === "determined") {
      // Flat top eyes
      npc.fillStyle(eyeColor, 0.9);
      npc.fillRect(cx - eyeSpread - 1.5, ey + 2, 5, eh - 2);
      npc.fillRect(cx + eyeSpread - 3.5, ey + 2, 5, eh - 2);
    } else if (emotion === "shy") {
      // Smaller eyes
      npc.fillStyle(eyeColor, 0.9);
      npc.fillRoundedRect(cx - eyeSpread - 1, ey + 1, 4, eh - 2, er);
      npc.fillRoundedRect(cx + eyeSpread - 3, ey + 1, 4, eh - 2, er);
    } else if (emotion === "pleading") {
      // Large pleading eyes with reflection highlights
      const radius = isHalf ? 2.5 : 3.8;
      npc.fillStyle(eyeColor, 0.9);
      npc.fillCircle(cx - eyeSpread, ey + eh / 2, radius);
      npc.fillCircle(cx + eyeSpread, ey + eh / 2, radius);

      if (!isHalf) {
        npc.fillStyle(0xffffff, 0.95);
        npc.fillCircle(cx - eyeSpread - 1, ey + eh / 2 - 1, 1);
        npc.fillCircle(cx + eyeSpread - 1, ey + eh / 2 - 1, 1);
      }
    } else if (emotion === "soulless") {
      // Hollow outline eyes
      npc.lineStyle(1.5, 0x777777, 0.85);
      npc.strokeCircle(cx - eyeSpread, ey + eh / 2, 3.5);
      npc.strokeCircle(cx + eyeSpread, ey + eh / 2, 3.5);
    } else if (emotion === "hypnotized") {
      // Spiral concentric rings
      npc.lineStyle(1, eyeColor, 0.9);
      const rMax = isHalf ? 2.5 : 4;
      npc.strokeCircle(cx - eyeSpread, ey + eh / 2, rMax);
      npc.strokeCircle(cx - eyeSpread, ey + eh / 2, rMax / 2);
      npc.strokeCircle(cx + eyeSpread, ey + eh / 2, rMax);
      npc.strokeCircle(cx + eyeSpread, ey + eh / 2, rMax / 2);
    }

    this.drawEyebrowsAndDetails(npc, cx, eyeSpread, emotion, isClosed, showBrows);
  }

  private drawEyebrowsAndDetails(
    npc: Phaser.GameObjects.Graphics,
    cx: number,
    eyeSpread: number,
    emotion: NpcEmotion | null,
    isEyeClosed: boolean,
    showBrows = true
  ): void {
    if (!showBrows) return;
    if (!emotion || emotion === "neutral" || emotion === "soulless") {
      return;
    }

    const browColor = 0x111111;
    const browAlpha = 0.95;

    if (emotion === "angry") {
      npc.lineStyle(2, browColor, browAlpha);
      npc.beginPath();
      npc.moveTo(cx - eyeSpread - 3, 5);
      npc.lineTo(cx - 0.5, 7.5);
      npc.strokePath();

      npc.beginPath();
      npc.moveTo(cx + 0.5, 7.5);
      npc.lineTo(cx + eyeSpread + 3, 5);
      npc.strokePath();
    } else if (emotion === "sad" || emotion === "devastated") {
      npc.lineStyle(1.8, browColor, browAlpha);
      npc.beginPath();
      npc.moveTo(cx - eyeSpread - 3, 7.5);
      npc.lineTo(cx - 0.5, 5);
      npc.strokePath();

      npc.beginPath();
      npc.moveTo(cx + 0.5, 5);
      npc.lineTo(cx + eyeSpread + 3, 7.5);
      npc.strokePath();

      if (emotion === "devastated" && !isEyeClosed) {
        npc.fillStyle(0x00ccff, 0.8);
        npc.fillCircle(cx - eyeSpread, 16, 1.8);
        npc.fillCircle(cx + eyeSpread, 16, 1.8);
        npc.fillRect(cx - eyeSpread - 0.8, 16, 1.6, 6);
        npc.fillRect(cx + eyeSpread - 0.8, 16, 1.6, 6);
      }
    } else if (emotion === "happy") {
      npc.lineStyle(1.5, browColor, browAlpha);
      this.drawQuadraticCurve(npc, cx - eyeSpread - 3, 6, cx - eyeSpread, 4, cx - 0.5, 6);
      this.drawQuadraticCurve(npc, cx + 0.5, 6, cx + eyeSpread, 4, cx + eyeSpread + 3, 6);
    } else if (emotion === "surprised" || emotion === "excited" || emotion === "hypnotized") {
      npc.lineStyle(1.5, browColor, browAlpha);
      this.drawQuadraticCurve(npc, cx - eyeSpread - 3, 4.5, cx - eyeSpread, 2.5, cx - 0.5, 4.5);
      this.drawQuadraticCurve(npc, cx + 0.5, 4.5, cx + eyeSpread, 2.5, cx + eyeSpread + 3, 4.5);
    } else if (emotion === "fear") {
      npc.lineStyle(1.5, browColor, browAlpha);
      npc.beginPath();
      npc.moveTo(cx - eyeSpread - 3, 5);
      npc.lineTo(cx - eyeSpread - 1.5, 4);
      npc.lineTo(cx - eyeSpread, 5);
      npc.lineTo(cx - 0.5, 4);
      npc.strokePath();

      npc.beginPath();
      npc.moveTo(cx + 0.5, 4);
      npc.lineTo(cx + eyeSpread, 5);
      npc.lineTo(cx + eyeSpread + 1.5, 4);
      npc.lineTo(cx + eyeSpread + 3, 5);
      npc.strokePath();
    } else if (emotion === "disgusted") {
      npc.lineStyle(1.8, browColor, browAlpha);
      npc.beginPath();
      npc.moveTo(cx - eyeSpread - 3, 6);
      npc.lineTo(cx - 0.5, 8);
      npc.strokePath();

      npc.beginPath();
      npc.moveTo(cx + 0.5, 5);
      npc.lineTo(cx + eyeSpread + 3, 6.5);
      npc.strokePath();
    } else if (emotion === "suspicious" || emotion === "smug") {
      npc.lineStyle(1.8, browColor, browAlpha);
      this.drawQuadraticCurve(npc, cx - eyeSpread - 3, 4, cx - eyeSpread, 3, cx - 0.5, 5);

      npc.beginPath();
      npc.moveTo(cx + 0.5, 7);
      npc.lineTo(cx + eyeSpread + 3, 7);
      npc.strokePath();
    } else if (emotion === "sleepy" || emotion === "bored") {
      npc.lineStyle(1.5, browColor, browAlpha);
      npc.beginPath();
      npc.moveTo(cx - eyeSpread - 3, 6.5);
      npc.lineTo(cx - 0.5, 6.5);
      npc.strokePath();

      npc.beginPath();
      npc.moveTo(cx + 0.5, 6.5);
      npc.lineTo(cx + eyeSpread + 3, 6.5);
      npc.strokePath();
    } else if (emotion === "confused") {
      npc.lineStyle(1.8, browColor, browAlpha);
      npc.beginPath();
      npc.moveTo(cx - eyeSpread - 3, 7);
      npc.lineTo(cx - 0.5, 4);
      npc.strokePath();

      npc.beginPath();
      npc.moveTo(cx + 0.5, 4);
      npc.lineTo(cx + eyeSpread + 3, 7);
      npc.strokePath();
    } else if (emotion === "proud") {
      npc.lineStyle(1.5, browColor, browAlpha);
      this.drawQuadraticCurve(npc, cx - eyeSpread - 2.5, 4, cx - eyeSpread, 2, cx - 0.5, 4.5);
      this.drawQuadraticCurve(npc, cx + 0.5, 4.5, cx + eyeSpread, 2, cx + eyeSpread + 2.5, 4);
    } else if (emotion === "manic") {
      npc.lineStyle(2, browColor, browAlpha);
      this.drawQuadraticCurve(npc, cx - eyeSpread - 3, 3, cx - eyeSpread, 1, cx - 0.5, 4);

      npc.beginPath();
      npc.moveTo(cx + 0.5, 7.5);
      npc.lineTo(cx + eyeSpread + 3, 9);
      npc.strokePath();
    } else if (emotion === "determined") {
      npc.lineStyle(2, browColor, browAlpha);
      npc.beginPath();
      npc.moveTo(cx - eyeSpread - 3, 5);
      npc.lineTo(cx - 0.5, 7);
      npc.strokePath();

      npc.beginPath();
      npc.moveTo(cx + 0.5, 7);
      npc.lineTo(cx + eyeSpread + 3, 5);
      npc.strokePath();
    } else if (emotion === "shy") {
      npc.lineStyle(1.5, browColor, browAlpha);
      npc.beginPath();
      npc.moveTo(cx - eyeSpread - 3, 5);
      npc.lineTo(cx - 0.5, 4);
      npc.strokePath();

      npc.beginPath();
      npc.moveTo(cx + 0.5, 4);
      npc.lineTo(cx + eyeSpread + 3, 5);
      npc.strokePath();

      if (!isEyeClosed) {
        npc.fillStyle(0xff8093, 0.55);
        npc.fillCircle(cx - eyeSpread - 3, 14, 2);
        npc.fillCircle(cx + eyeSpread + 3, 14, 2);
      }
    } else if (emotion === "pleading") {
      npc.lineStyle(1.5, browColor, browAlpha);
      this.drawQuadraticCurve(npc, cx - eyeSpread - 2.5, 5, cx - eyeSpread, 3.5, cx - 0.5, 5);
      this.drawQuadraticCurve(npc, cx + 0.5, 5, cx + eyeSpread, 3.5, cx + eyeSpread + 2.5, 5);
    }
  }

  private drawQuadraticCurve(
    graphics: Phaser.GameObjects.Graphics,
    startX: number,
    startY: number,
    controlX: number,
    controlY: number,
    endX: number,
    endY: number
  ): void {
    graphics.beginPath();
    graphics.moveTo(startX, startY);
    const steps = 8;
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const mt = 1 - t;
      const x = mt * mt * startX + 2 * mt * t * controlX + t * t * endX;
      const y = mt * mt * startY + 2 * mt * t * controlY + t * t * endY;
      graphics.lineTo(x, y);
    }
    graphics.strokePath();
  }

  private createObstacleTexture(): void {
    const obstacle = this.add.graphics();
    obstacle.fillStyle(0x4a4a4a);
    obstacle.fillRoundedRect(0, 0, 48, 48, 8);
    obstacle.lineStyle(2, 0x1b1b1b);
    obstacle.strokeRoundedRect(0, 0, 48, 48, 8);
    obstacle.fillStyle(0x2f2f2f, 0.45);
    obstacle.fillCircle(16, 16, 5);
    obstacle.fillCircle(34, 31, 4);
    obstacle.generateTexture("obstacle", 48, 48);
    obstacle.destroy();
  }

  private createFireballTexture(): void {
    const fireball = this.add.graphics();
    fireball.fillStyle(0xff5500);
    fireball.fillCircle(8, 8, 8);
    fireball.generateTexture("fireball", 16, 16);
    fireball.destroy();
  }

  private createFireballTileTexture(): void {
    const graphics = this.add.graphics();

    const pixelData = [
      "......XXXXXX....",
      "....XXDDDDRRXX..",
      "...XDDDRRRROOXX.",
      "..XDRRRROOOYYYXX",
      ".XDRRROOOYYYYWWX",
      "XDRRROOYYYYWWWWX",
      "XDRROOYYYWWWWWWX",
      "XDRROOYYYWWWWWWX",
      "XDRROOYYYYWWWWXX",
      ".XDRROOYYYYWWXX.",
      ".XDDDRROYYYYWX..",
      "..XXDDDRROOXX...",
      "....XXDDDRXX....",
      "......XXXX......",
      "................",
      "................"
    ];

    const colorMap: Record<string, number> = {
      X: 0x190800, // charred outline
      D: 0x6d1100, // deep dark red
      R: 0xc21f00, // vibrant burning red
      O: 0xe65c00, // intense orange
      Y: 0xffad00, // golden yellow
      W: 0xfff2b2 // flame core
    };

    const pixelSize = 2; // Each map character becomes a 2x2 screen pixel, resulting in 32x32 texture

    for (let r = 0; r < pixelData.length; r++) {
      const row = pixelData[r];
      for (let c = 0; c < row.length; c++) {
        const char = row[c];
        if (char !== "." && colorMap[char] !== undefined) {
          graphics.fillStyle(colorMap[char], 1);
          graphics.fillRect(c * pixelSize, r * pixelSize, pixelSize, pixelSize);
        }
      }
    }

    graphics.generateTexture("fireball_tile", 32, 32);
    graphics.destroy();
  }

  private createGearTexture(): void {
    const size = 32;
    const half = size / 2;
    const gear = this.add.graphics();

    gear.fillStyle(0x1a1a1a, 1);
    gear.lineStyle(2, 0xff6600, 1);

    const teethCount = 8;
    const outerRadius = 14;
    const innerRadius = 9;
    const holeRadius = 4;

    gear.beginPath();
    for (let i = 0; i < teethCount * 2; i++) {
      const angle = (i * Math.PI) / teethCount;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const x = half + Math.cos(angle) * radius;
      const y = half + Math.sin(angle) * radius;
      if (i === 0) {
        gear.moveTo(x, y);
      } else {
        gear.lineTo(x, y);
      }
    }
    gear.closePath();
    gear.fillPath();
    gear.strokePath();

    gear.fillStyle(0x0a0a0a, 1);
    gear.beginPath();
    gear.arc(half, half, holeRadius, 0, Math.PI * 2);
    gear.closePath();
    gear.fillPath();
    gear.strokePath();

    gear.generateTexture("gear", size, size);
    gear.destroy();
  }
}
