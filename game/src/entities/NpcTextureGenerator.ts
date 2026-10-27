import type Phaser from "phaser";
import type { NpcEmotion } from "./NpcEmotion";
import { type NpcStyle, resolveNpcStyle } from "./NpcStyle";

const EYE_BROW_PIVOT_Y = 12;

export function getNpcTextureKey(style: NpcStyle, emotion: NpcEmotion | null): string {
  const bodyHex = style.bodyColor.toString(16);
  const eyeHex = style.eyeColor.toString(16);
  const browsFlag = style.showBrows !== false ? "b1" : "b0";
  const emotionKey = emotion ?? "neutral";
  return `npc_${bodyHex}_${eyeHex}_${style.eyeSize}_${style.eyeSpread}_${browsFlag}_${emotionKey}`;
}

export function ensureNpcTexture(
  scene: Phaser.Scene,
  styleInput?: Partial<NpcStyle>,
  emotion?: NpcEmotion | null
): string {
  const style = resolveNpcStyle(styleInput);
  const emotionKey = emotion ?? null;
  const textureKey = getNpcTextureKey(style, emotionKey);

  if (scene.textures.exists(textureKey)) {
    return textureKey;
  }

  generateSingleNpcTexture(scene, textureKey, style, emotionKey);
  return textureKey;
}

function generateSingleNpcTexture(
  scene: Phaser.Scene,
  textureKey: string,
  style: NpcStyle,
  emotion: NpcEmotion | null
): void {
  const npc = scene.add.graphics();
  const frames = [
    { y: 8, height: 9, radius: 2.5 }, // Frame 0: Open
    { y: 10, height: 5, radius: 2.0 }, // Frame 1: Half closed
    { y: 12, height: 1.5, radius: 0.75 }, // Frame 2: Closed slit
    { y: 10, height: 5, radius: 2.0 } // Frame 3: Half open
  ];

  for (let i = 0; i < frames.length; i++) {
    const eyeFrame = frames[i];
    const offsetX = i * 32;

    // Body
    npc.fillStyle(style.bodyColor);
    npc.fillCircle(offsetX + 16, 16, 14);

    npc.lineStyle(1.5, 0x111111, 0.8);
    npc.strokeCircle(offsetX + 16, 16, 14);

    // Face elements (eyes, brows, tears, blush, etc.)
    drawNpcFace(npc, offsetX, eyeFrame, style, emotion, i);
  }

  npc.generateTexture(textureKey, 128, 32);
  npc.destroy();

  const npcTex = scene.textures.get(textureKey);
  for (let i = 0; i < frames.length; i++) {
    npcTex.add(i, 0, i * 32, 0, 32, 32);
  }

  if (!scene.anims.exists(`${textureKey}_blink`)) {
    scene.anims.create({
      key: `${textureKey}_blink`,
      frames: scene.anims.generateFrameNumbers(textureKey, { start: 0, end: 3 }),
      frameRate: 15,
      repeat: 0
    });
  }
}

function drawNpcFace(
  npc: Phaser.GameObjects.Graphics,
  offsetX: number,
  eyeFrame: { y: number; height: number; radius: number },
  style: NpcStyle,
  emotion: NpcEmotion | null,
  blinkFrameIndex: number
): void {
  const { eyeColor, eyeSpread, showBrows = true } = style;
  const centerX = offsetX + 16;
  const isClosed = blinkFrameIndex === 2;
  const isHalf = blinkFrameIndex === 1 || blinkFrameIndex === 3;

  const eyeY = eyeFrame.y;
  const eyeHeight = eyeFrame.height;
  const eyeRadius = eyeFrame.radius;

  if (isClosed) {
    npc.fillStyle(eyeColor, 0.9);
    npc.fillRoundedRect(centerX - eyeSpread - 1.5, 12, 5, 1.5, 0.75);
    npc.fillRoundedRect(centerX + eyeSpread - 3.5, 12, 5, 1.5, 0.75);

    drawEyebrowsAndDetails(npc, centerX, eyeSpread, emotion, true, showBrows);
    return;
  }

  if (!emotion || emotion === "neutral") {
    npc.fillStyle(eyeColor, 0.9);
    npc.fillRoundedRect(centerX - eyeSpread - 1.5, eyeY, 5, eyeHeight, eyeRadius);
    npc.fillRoundedRect(centerX + eyeSpread - 3.5, eyeY, 5, eyeHeight, eyeRadius);
  } else if (emotion === "angry" || emotion === "sad" || emotion === "devastated") {
    npc.fillStyle(eyeColor, 0.9);
    npc.fillRoundedRect(centerX - eyeSpread - 1.5, eyeY, 5, eyeHeight, eyeRadius);
    npc.fillRoundedRect(centerX + eyeSpread - 3.5, eyeY, 5, eyeHeight, eyeRadius);

    if (style.showBrows === false && !isClosed) {
      const leftInnerX = centerX - eyeSpread + 3.5;
      const rightInnerX = centerX + eyeSpread - 3.5;
      const leftOuterX = centerX + eyeSpread + 1.5;
      const rightOuterX = centerX - eyeSpread - 1.5;
      const cutWidth = 3;
      if (emotion === "angry") {
        const cutHeight = Math.min(eyeHeight * 0.35, 5);
        carveEyeCorner(npc, leftInnerX, eyeY + eyeHeight, -1, -1, style.bodyColor, cutWidth, cutHeight);
        carveEyeCorner(npc, rightInnerX, eyeY + eyeHeight, 1, -1, style.bodyColor, cutWidth, cutHeight);
      } else {
        const cutHeight = Math.min(eyeHeight * 0.35, 5);
        carveEyeCorner(npc, leftOuterX, eyeY + eyeHeight, -1, -1, style.bodyColor, cutWidth, cutHeight);
        carveEyeCorner(npc, rightOuterX, eyeY + eyeHeight, 1, -1, style.bodyColor, cutWidth, cutHeight);
      }
    }
  } else if (emotion === "happy") {
    npc.lineStyle(2, eyeColor, 0.9);
    const arcHeight = isHalf ? eyeHeight / 2 : eyeHeight;
    drawQuadraticCurve(
      npc,
      centerX - eyeSpread - 2.5,
      eyeY + arcHeight,
      centerX - eyeSpread + 1,
      eyeY,
      centerX - 0.5,
      eyeY + arcHeight
    );
    drawQuadraticCurve(
      npc,
      centerX + 0.5,
      eyeY + arcHeight,
      centerX + eyeSpread - 1,
      eyeY,
      centerX + eyeSpread + 2.5,
      eyeY + arcHeight
    );
  } else if (emotion === "surprised") {
    const radius = isHalf ? 2 : 3.5;
    npc.fillStyle(eyeColor, 0.9);
    npc.fillCircle(centerX - eyeSpread, eyeY + eyeHeight / 2, radius);
    npc.fillCircle(centerX + eyeSpread, eyeY + eyeHeight / 2, radius);
  } else if (emotion === "fear") {
    const radius = isHalf ? 1 : 1.5;
    npc.fillStyle(eyeColor, 0.9);
    npc.fillCircle(centerX - eyeSpread, eyeY + eyeHeight / 2, radius);
    npc.fillCircle(centerX + eyeSpread, eyeY + eyeHeight / 2, radius);
  } else if (emotion === "disgusted") {
    const height = isHalf ? 1.5 : 3;
    npc.fillStyle(eyeColor, 0.9);
    npc.fillRect(centerX - eyeSpread - 2, eyeY + eyeHeight / 2 - height / 2, 5, height);
    npc.fillRect(centerX + eyeSpread - 3, eyeY + eyeHeight / 2 - height / 2, 5, height);
  } else if (emotion === "suspicious") {
    const rHeight = isHalf ? 1.5 : 2.5;
    npc.fillStyle(eyeColor, 0.9);
    npc.fillRoundedRect(centerX - eyeSpread - 1.5, eyeY, 5, eyeHeight, eyeRadius);
    npc.fillRect(centerX + eyeSpread - 3.5, eyeY + eyeHeight / 2 - rHeight / 2, 5, rHeight);
  } else if (emotion === "sleepy") {
    const reducedHeight = Math.min(eyeHeight, isHalf ? 2 : 4);
    npc.fillStyle(eyeColor, 0.9);
    npc.fillRoundedRect(centerX - eyeSpread - 1.5, eyeY + 2, 5, reducedHeight, eyeRadius);
    npc.fillRoundedRect(centerX + eyeSpread - 3.5, eyeY + 2, 5, reducedHeight, eyeRadius);
  } else if (emotion === "bored") {
    const height = isHalf ? 1 : 2;
    npc.fillStyle(eyeColor, 0.9);
    npc.fillRect(centerX - eyeSpread - 2, eyeY + eyeHeight / 2 - height / 2, 5, height);
    npc.fillRect(centerX + eyeSpread - 3, eyeY + eyeHeight / 2 - height / 2, 5, height);
  } else if (emotion === "excited") {
    npc.lineStyle(2, eyeColor, 0.9);
    const len = isHalf ? 2.5 : 4;
    npc.beginPath();
    npc.moveTo(centerX - eyeSpread - len / 2, eyeY + eyeHeight / 2);
    npc.lineTo(centerX - eyeSpread + len / 2, eyeY + eyeHeight / 2);
    npc.moveTo(centerX - eyeSpread, eyeY + eyeHeight / 2 - len / 2);
    npc.lineTo(centerX - eyeSpread, eyeY + eyeHeight / 2 + len / 2);
    npc.strokePath();

    npc.beginPath();
    npc.moveTo(centerX + eyeSpread - len / 2, eyeY + eyeHeight / 2);
    npc.lineTo(centerX + eyeSpread + len / 2, eyeY + eyeHeight / 2);
    npc.moveTo(centerX + eyeSpread, eyeY + eyeHeight / 2 - len / 2);
    npc.lineTo(centerX + eyeSpread, eyeY + eyeHeight / 2 + len / 2);
    npc.strokePath();
  } else if (emotion === "confused") {
    npc.fillStyle(eyeColor, 0.9);
    npc.fillRoundedRect(centerX - eyeSpread - 1.5, eyeY - 2, 5, eyeHeight, eyeRadius);
    npc.fillRoundedRect(centerX + eyeSpread - 3.5, eyeY + 2, 5, eyeHeight, eyeRadius);
  } else if (emotion === "proud") {
    npc.lineStyle(2, eyeColor, 0.9);
    const arcHeight = isHalf ? eyeHeight / 2 : eyeHeight;
    drawQuadraticCurve(
      npc,
      centerX - eyeSpread - 2.5,
      eyeY,
      centerX - eyeSpread + 1,
      eyeY + arcHeight,
      centerX - 0.5,
      eyeY
    );
    drawQuadraticCurve(
      npc,
      centerX + 0.5,
      eyeY,
      centerX + eyeSpread - 1,
      eyeY + arcHeight,
      centerX + eyeSpread + 2.5,
      eyeY
    );
  } else if (emotion === "manic") {
    npc.fillStyle(eyeColor, 0.9);
    npc.fillCircle(centerX - eyeSpread, eyeY + eyeHeight / 2, isHalf ? 2.5 : 4.5);
    npc.fillCircle(centerX + eyeSpread, eyeY + eyeHeight / 2, isHalf ? 1 : 1.5);
  } else if (emotion === "smug") {
    const height = isHalf ? 2 : 3.5;
    npc.fillStyle(eyeColor, 0.9);
    npc.fillRect(centerX - eyeSpread - 0.5, eyeY + eyeHeight / 2 - height / 2, 4, height);
    npc.fillRect(centerX + eyeSpread - 2.5, eyeY + eyeHeight / 2 - height / 2, 4, height);
  } else if (emotion === "determined") {
    npc.fillStyle(eyeColor, 0.9);
    npc.fillRect(centerX - eyeSpread - 1.5, eyeY + 2, 5, eyeHeight - 2);
    npc.fillRect(centerX + eyeSpread - 3.5, eyeY + 2, 5, eyeHeight - 2);
  } else if (emotion === "shy") {
    npc.fillStyle(eyeColor, 0.9);
    npc.fillRoundedRect(centerX - eyeSpread - 1, eyeY + 1, 4, eyeHeight - 2, eyeRadius);
    npc.fillRoundedRect(centerX + eyeSpread - 3, eyeY + 1, 4, eyeHeight - 2, eyeRadius);
  } else if (emotion === "pleading") {
    const radius = isHalf ? 2.5 : 3.8;
    npc.fillStyle(eyeColor, 0.9);
    npc.fillCircle(centerX - eyeSpread, eyeY + eyeHeight / 2, radius);
    npc.fillCircle(centerX + eyeSpread, eyeY + eyeHeight / 2, radius);

    if (!isHalf) {
      npc.fillStyle(0xffffff, 0.95);
      npc.fillCircle(centerX - eyeSpread - 1, eyeY + eyeHeight / 2 - 1, 1);
      npc.fillCircle(centerX + eyeSpread - 1, eyeY + eyeHeight / 2 - 1, 1);
    }
  } else if (emotion === "soulless") {
    npc.lineStyle(1.5, 0x777777, 0.85);
    npc.strokeCircle(centerX - eyeSpread, eyeY + eyeHeight / 2, 3.5);
    npc.strokeCircle(centerX + eyeSpread, eyeY + eyeHeight / 2, 3.5);
  } else if (emotion === "hypnotized") {
    npc.lineStyle(1, eyeColor, 0.9);
    const rMax = isHalf ? 2.5 : 4;
    npc.strokeCircle(centerX - eyeSpread, eyeY + eyeHeight / 2, rMax);
    npc.strokeCircle(centerX - eyeSpread, eyeY + eyeHeight / 2, rMax / 2);
    npc.strokeCircle(centerX + eyeSpread, eyeY + eyeHeight / 2, rMax);
    npc.strokeCircle(centerX + eyeSpread, eyeY + eyeHeight / 2, rMax / 2);
  }

  drawEyebrowsAndDetails(npc, centerX, eyeSpread, emotion, isClosed, showBrows);
}

function drawEyebrowsAndDetails(
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

  npc.save();
  npc.translateCanvas(cx, EYE_BROW_PIVOT_Y);
  npc.rotateCanvas(Math.PI);
  npc.translateCanvas(-cx, -EYE_BROW_PIVOT_Y);
  drawEmotionBrows(npc, cx, eyeSpread, emotion);
  npc.restore();

  drawEmotionExtras(npc, cx, eyeSpread, emotion, isEyeClosed);
}

function carveEyeCorner(
  npc: Phaser.GameObjects.Graphics,
  cornerX: number,
  cornerY: number,
  horizontalDir: number,
  verticalDir: number,
  bodyColor: number,
  cutWidth: number,
  cutHeight: number
): void {
  npc.fillStyle(bodyColor, 1);
  npc.beginPath();
  npc.moveTo(cornerX, cornerY);
  npc.lineTo(cornerX + horizontalDir * cutWidth, cornerY);
  npc.lineTo(cornerX, cornerY + verticalDir * cutHeight);
  npc.closePath();
  npc.fillPath();
}

function drawEmotionBrows(npc: Phaser.GameObjects.Graphics, cx: number, eyeSpread: number, emotion: NpcEmotion): void {
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
  } else if (emotion === "happy") {
    npc.lineStyle(1.5, browColor, browAlpha);
    drawQuadraticCurve(npc, cx - eyeSpread - 3, 6, cx - eyeSpread, 4, cx - 0.5, 6);
    drawQuadraticCurve(npc, cx + 0.5, 6, cx + eyeSpread, 4, cx + eyeSpread + 3, 6);
  } else if (emotion === "surprised" || emotion === "excited" || emotion === "hypnotized") {
    npc.lineStyle(1.5, browColor, browAlpha);
    drawQuadraticCurve(npc, cx - eyeSpread - 3, 4.5, cx - eyeSpread, 2.5, cx - 0.5, 4.5);
    drawQuadraticCurve(npc, cx + 0.5, 4.5, cx + eyeSpread, 2.5, cx + eyeSpread + 3, 4.5);
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
    drawQuadraticCurve(npc, cx - eyeSpread - 3, 4, cx - eyeSpread, 3, cx - 0.5, 5);

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
    drawQuadraticCurve(npc, cx - eyeSpread - 2.5, 4, cx - eyeSpread, 2, cx - 0.5, 4.5);
    drawQuadraticCurve(npc, cx + 0.5, 4.5, cx + eyeSpread, 2, cx + eyeSpread + 2.5, 4);
  } else if (emotion === "manic") {
    npc.lineStyle(2, browColor, browAlpha);
    drawQuadraticCurve(npc, cx - eyeSpread - 3, 3, cx - eyeSpread, 1, cx - 0.5, 4);

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
  } else if (emotion === "pleading") {
    npc.lineStyle(1.5, browColor, browAlpha);
    drawQuadraticCurve(npc, cx - eyeSpread - 2.5, 5, cx - eyeSpread, 3.5, cx - 0.5, 5);
    drawQuadraticCurve(npc, cx + 0.5, 5, cx + eyeSpread, 3.5, cx + eyeSpread + 2.5, 5);
  }
}

function drawEmotionExtras(
  npc: Phaser.GameObjects.Graphics,
  cx: number,
  eyeSpread: number,
  emotion: NpcEmotion,
  isEyeClosed: boolean
): void {
  if (isEyeClosed) return;

  if (emotion === "devastated") {
    npc.fillStyle(0x00ccff, 0.8);
    npc.fillCircle(cx - eyeSpread, 16, 1.8);
    npc.fillCircle(cx + eyeSpread, 16, 1.8);
    npc.fillRect(cx - eyeSpread - 0.8, 16, 1.6, 6);
    npc.fillRect(cx + eyeSpread - 0.8, 16, 1.6, 6);
  } else if (emotion === "shy") {
    npc.fillStyle(0xff8093, 0.55);
    npc.fillCircle(cx - eyeSpread - 3, 14, 2);
    npc.fillCircle(cx + eyeSpread + 3, 14, 2);
  }
}

function drawQuadraticCurve(
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
