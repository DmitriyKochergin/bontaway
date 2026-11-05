import Phaser from "phaser";
import { DepthLayer } from "../types/depth-layer";
import type { NpcEmotion } from "./NpcEmotion";
import { type NpcStyle, resolveNpcStyle } from "./NpcStyle";
import { ensureNpcTexture } from "./NpcTextureGenerator";

const FROZEN_DURATION_MS = 5000;
const BURN_DURATION_MS = 5000;
const BURN_TICK_INTERVAL_MS = 1000;

export interface NpcCombatConfig {
  hostile?: boolean;
  maxHealth?: number;
  movementSpeed?: number;
  contactDamage?: number;
  attackCooldownMs?: number;
  bodyScale?: number;
  explodesOnContact?: boolean;
  explosionDamage?: number;
}

export class NPC extends Phaser.Physics.Arcade.Sprite {
  private npcName: string;
  private dialogueLines: string[];
  private currentLineIndex = 0;
  private isBlinking = false;
  private nextBlinkTime = 0;
  private canBlink = true;
  private style: NpcStyle;

  // Eye-follow: NPC body rotates to face the player while in activation radius, eases back to rest otherwise
  private targetRotation = 0;
  private restTargetX = 24.5 * 32;
  private restTargetY = 24.5 * 32;

  // Floating text / dialogue components
  private speechContainer: Phaser.GameObjects.Container | null = null;
  private bubbleBackground: Phaser.GameObjects.Graphics | null = null;
  private bubbleText: Phaser.GameObjects.Text | null = null;
  private playerInRange = false;
  private readonly maxHealth: number;
  private health: number;
  private readonly hostile: boolean;
  private readonly movementSpeed: number;
  private readonly contactDamage: number;
  private readonly attackCooldownMs: number;
  private readonly bodyScale: number;
  private readonly explodesOnContact: boolean;
  private readonly explosionDamage: number;
  private nextAttackTime = 0;
  private frozenUntil = 0;
  private burningUntil = 0;
  private nextBurnTickAt = 0;
  private burnDamagePerSecond = 0;
  private defeated = false;
  private healthBar: Phaser.GameObjects.Graphics | null = null;
  private deathTween?: Phaser.Tweens.Tween;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    npcName: string,
    dialogueLines: string[],
    emotion?: NpcEmotion,
    restTarget?: { x: number; y: number },
    styleInput?: Partial<NpcStyle>,
    combat?: NpcCombatConfig
  ) {
    const style = resolveNpcStyle(styleInput);
    const textureKey = ensureNpcTexture(scene, style, emotion);

    super(scene, x, y, textureKey);

    this.style = style;
    if (restTarget) {
      this.restTargetX = restTarget.x;
      this.restTargetY = restTarget.y;
    }

    this.npcName = npcName;
    this.dialogueLines = dialogueLines;
    this.canBlink = emotion === undefined || emotion === "neutral";
    this.maxHealth = Math.max(0, Math.round(combat?.maxHealth ?? 0));
    this.health = this.maxHealth;
    this.hostile = combat?.hostile === true && this.maxHealth > 0;
    this.movementSpeed = Math.max(0, combat?.movementSpeed ?? 0);
    this.contactDamage = Math.max(0, Math.round(combat?.contactDamage ?? 0));
    this.attackCooldownMs = Math.max(250, combat?.attackCooldownMs ?? 900);
    this.bodyScale = Math.max(0.65, combat?.bodyScale ?? 1);
    this.explodesOnContact = combat?.explodesOnContact === true && this.hostile;
    this.explosionDamage = Math.max(0, Math.round(combat?.explosionDamage ?? 0));

    scene.add.existing(this);
    scene.physics.add.existing(this, true); // Create as static body

    this.setDepth(DepthLayer.Npc);
    this.setPipeline("Light2D");
    this.setScale(this.bodyScale);

    // Collisions
    this.setCircle(14 * this.bodyScale);
    if (this.body) {
      this.body.setOffset(2 * this.bodyScale, 2 * this.bodyScale);
    }

    if (this.isDamageable()) {
      this.healthBar = scene.add.graphics();
      this.healthBar.setDepth(DepthLayer.SpeechBubble - 1);
      this.updateHealthBar();
    }

    // Blinking animation completed handler
    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim: Phaser.Animations.Animation) => {
      if (anim.key === `${textureKey}_blink`) {
        this.isBlinking = false;
        this.setFrame(0);
      }
    });

    if (this.canBlink) {
      this.scheduleNextBlink(scene.time?.now || 0);
    }
    if (!this.hostile) {
      this.createSpeechBubble();
    }
  }

  private scheduleNextBlink(currentTime: number): void {
    const isDoubleBlink = Math.random() < 0.2;
    const delay = isDoubleBlink ? Phaser.Math.Between(400, 650) : Phaser.Math.Between(3000, 8000);
    this.nextBlinkTime = currentTime + delay;
  }

  private createSpeechBubble(): void {
    this.speechContainer = this.scene.add.container(this.x, this.y - 28);
    this.speechContainer.setDepth(DepthLayer.SpeechBubble);
    this.speechContainer.setAlpha(0); // Hidden initially

    this.bubbleBackground = this.scene.add.graphics();
    this.speechContainer.add(this.bubbleBackground);

    // Dialogue text configuration
    this.bubbleText = this.scene.add.text(0, 0, "", {
      fontSize: "11px",
      fontFamily: "Roboto Mono, Courier New, monospace",
      color: "#eaeaea",
      align: "center",
      wordWrap: { width: 180, useAdvancedWrap: true }
    });
    this.bubbleText.setOrigin(0.5, 0.5);
    this.speechContainer.add(this.bubbleText);
  }

  private updateSpeechBubble(text: string): void {
    if (!this.bubbleText || !this.bubbleBackground) return;

    // Atmospheric header format: uppercase name, followed by dialogue
    const formattedText = `${this.npcName.toUpperCase()}\n\n"${text}"`;
    this.bubbleText.setText(formattedText);

    // Padding around text
    const paddingX = 14;
    const paddingY = 8;
    const textWidth = this.bubbleText.width;
    const textHeight = this.bubbleText.height;

    const boxWidth = Math.max(80, textWidth + paddingX * 2);
    const boxHeight = textHeight + paddingY * 2;

    this.bubbleBackground.clear();

    // Semi-transparent black slate background to fit the SCP/dark vibe
    this.bubbleBackground.fillStyle(0x0e0e11, 0.85);
    this.bubbleBackground.fillRoundedRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight, 6);

    // Thin charcoal/amber border
    const borderColor = this.style.eyeColor === 0xff2222 || this.style.bodyColor === 0x111111 ? 0xdd2222 : 0x4a4a5a;
    this.bubbleBackground.lineStyle(1, borderColor, 0.7);
    this.bubbleBackground.strokeRoundedRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight, 6);

    // Smaill triangular pointer matching the speech container position
    this.bubbleBackground.fillStyle(0x0e0e11, 0.85);
    this.bubbleBackground.beginPath();
    this.bubbleBackground.moveTo(-6, boxHeight / 2);
    this.bubbleBackground.lineTo(6, boxHeight / 2);
    this.bubbleBackground.lineTo(0, boxHeight / 2 + 6);
    this.bubbleBackground.closePath();
    this.bubbleBackground.fillPath();

    this.bubbleBackground.lineStyle(1, borderColor, 0.7);
    this.bubbleBackground.beginPath();
    this.bubbleBackground.moveTo(-6, boxHeight / 2);
    this.bubbleBackground.lineTo(0, boxHeight / 2 + 6);
    this.bubbleBackground.lineTo(6, boxHeight / 2);
    this.bubbleBackground.strokePath();

    // Adjust position slightly upward depending on dialogue height
    this.speechContainer?.setPosition(this.x, this.y - 24 - boxHeight / 2);
  }

  private triggerNextLine(): void {
    if (this.dialogueLines.length === 0) return;
    this.currentLineIndex = (this.currentLineIndex + 1) % this.dialogueLines.length;
    const nextLine = this.dialogueLines[this.currentLineIndex];
    this.updateSpeechBubble(nextLine);
  }

  public update(playerX: number, playerY: number, currentTime: number, _delta: number): void {
    this.syncHealthBarPosition();
    if (this.defeated) {
      return;
    }

    // Blinking trigger logic
    if (this.canBlink && !this.isBlinking && currentTime >= this.nextBlinkTime) {
      this.isBlinking = true;
      this.anims.play(`${this.texture.key}_blink`);
      this.scheduleNextBlink(currentTime);
    }

    const distance = Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY);
    const rotationSpeed = 0.007;

    if (!this.hostile) {
      const triggerRadius = 110;
      const exitRadius = 140;

      if (!this.playerInRange && distance <= triggerRadius) {
        this.playerInRange = true;
        this.showDialogue();
      } else if (this.playerInRange && distance >= exitRadius) {
        this.playerInRange = false;
        this.hideDialogue();
      }

      if (this.playerInRange) {
        // Sprite art faces "up" (north); Angle.Between measures from east, so correct by +90 degrees
        this.targetRotation = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY) + Math.PI / 2;
      } else {
        this.targetRotation =
          Phaser.Math.Angle.Between(this.x, this.y, this.restTargetX, this.restTargetY) + Math.PI / 2;
      }
    } else {
      this.targetRotation = Phaser.Math.Angle.Between(this.x, this.y, this.restTargetX, this.restTargetY) + Math.PI / 2;
    }

    this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, this.targetRotation, rotationSpeed * _delta);
  }

  public isDamageable(): boolean {
    return this.maxHealth > 0;
  }

  public isHostile(): boolean {
    return this.hostile;
  }

  public isDefeated(): boolean {
    return this.defeated;
  }

  public getHealth(): number {
    return this.health;
  }

  public getMaxHealth(): number {
    return this.maxHealth;
  }

  public getMovementSpeed(currentTime = this.scene.time.now): number {
    return currentTime < this.frozenUntil ? this.movementSpeed * 0.5 : this.movementSpeed;
  }

  public applyFrozen(currentTime: number): void {
    if (!this.hostile || this.defeated) {
      return;
    }

    this.frozenUntil = currentTime + FROZEN_DURATION_MS;
  }

  public applyBurn(damagePerSecond: number, currentTime: number): void {
    if (!this.hostile || this.defeated || damagePerSecond <= 0) {
      return;
    }

    this.burnDamagePerSecond = damagePerSecond;
    this.burningUntil = currentTime + BURN_DURATION_MS;
    this.nextBurnTickAt = currentTime + BURN_TICK_INTERVAL_MS;
  }

  public updateStatusEffects(currentTime: number): void {
    if (!this.hostile || this.defeated || this.burningUntil <= 0) {
      return;
    }

    while (this.nextBurnTickAt <= currentTime && this.nextBurnTickAt <= this.burningUntil) {
      this.takeDamage(this.burnDamagePerSecond);
      this.nextBurnTickAt += BURN_TICK_INTERVAL_MS;

      if (this.defeated) {
        return;
      }
    }

    if (currentTime >= this.burningUntil) {
      this.burningUntil = 0;
      this.nextBurnTickAt = 0;
      this.burnDamagePerSecond = 0;
    }
  }

  public getCollisionRadius(): number {
    return 14 * this.bodyScale;
  }

  public isExplosive(): boolean {
    return this.explodesOnContact;
  }

  public getExplosionDamage(): number {
    return this.explosionDamage;
  }

  public moveTo(x: number, y: number): void {
    if (!this.hostile || this.defeated) {
      return;
    }

    this.setPosition(x, y);
    this.body?.updateFromGameObject();
    this.syncHealthBarPosition();
  }

  public tryContactAttack(currentTime: number): number {
    if (!this.hostile || this.defeated || this.contactDamage <= 0 || currentTime < this.nextAttackTime) {
      return 0;
    }

    this.nextAttackTime = currentTime + this.attackCooldownMs;
    return this.contactDamage;
  }

  public takeDamage(amount: number): boolean {
    if (!this.isDamageable() || this.defeated) {
      return false;
    }

    const damage = Math.max(0, Math.round(amount));
    if (damage === 0) {
      return false;
    }

    this.health = Math.max(0, this.health - damage);
    this.updateHealthBar();
    this.setTint(0xffd0d0);
    this.scene.time.delayedCall(120, () => {
      if (this.active && !this.defeated) {
        this.clearTint();
      }
    });

    if (this.health === 0) {
      this.defeated = true;
      if (this.body) {
        this.body.enable = false;
      }
      this.setTint(0x3a3038);
      this.speechContainer?.setAlpha(0);
      this.beginDefeatTransition();
    }

    return true;
  }

  public setVisibilityMask(mask: Phaser.Display.Masks.BitmapMask): void {
    this.setMask(mask);
    this.healthBar?.setMask(mask);
  }

  private syncHealthBarPosition(): void {
    this.healthBar?.setPosition(this.x, this.y).setAlpha(this.alpha);
    if (this.hostile) {
      this.speechContainer?.setPosition(this.x, this.y - 50);
    }
  }

  private beginDefeatTransition(): void {
    this.deathTween = this.scene.tweens.add({
      targets: this,
      y: this.y - 64,
      alpha: 0,
      duration: 500,
      ease: "Sine.inOut",
      onUpdate: () => this.syncHealthBarPosition(),
      onComplete: () => {
        this.healthBar?.setVisible(false);
        this.setActive(false);
        this.setVisible(false);
      }
    });
  }

  private updateHealthBar(): void {
    if (!this.healthBar) {
      return;
    }

    const barWidth = 34;
    const barHeight = 4;
    const healthRatio = this.maxHealth > 0 ? this.health / this.maxHealth : 0;
    const healthColor = healthRatio > 0.5 ? 0x7dff9b : healthRatio > 0.25 ? 0xffc857 : 0xff5d6c;

    this.healthBar.clear();
    this.healthBar.fillStyle(0x090b0f, 0.9);
    const healthBarY = -24 * this.bodyScale;
    this.healthBar.fillRect(-barWidth / 2, healthBarY, barWidth, barHeight);
    this.healthBar.fillStyle(healthColor, 0.95);
    this.healthBar.fillRect(-barWidth / 2, healthBarY, barWidth * healthRatio, barHeight);
    this.healthBar.lineStyle(1, 0x101318, 0.95);
    this.healthBar.strokeRect(-barWidth / 2, healthBarY, barWidth, barHeight);
  }

  private showDialogue(): void {
    if (!this.speechContainer) return;

    // Fetch active dialogue line and format speech bubble
    const currentLine = this.dialogueLines[this.currentLineIndex] || "...";
    this.updateSpeechBubble(currentLine);

    // Smoothly fade in speech container
    this.scene.tweens.add({
      targets: this.speechContainer,
      alpha: 1,
      y: this.speechContainer.y - 4, // Subtle lift
      duration: 350,
      ease: "Cubic.out"
    });
  }

  private hideDialogue(): void {
    if (!this.speechContainer) return;

    // Smoothly fade out speech container and pick next line for next approach
    this.scene.tweens.add({
      targets: this.speechContainer,
      alpha: 0,
      y: this.speechContainer.y + 4, // Return to resting height
      duration: 300,
      ease: "Cubic.in",
      onComplete: () => {
        this.triggerNextLine();
      }
    });
  }

  public destroy(fromScene?: boolean): void {
    this.deathTween?.stop();
    this.deathTween = undefined;
    this.healthBar?.destroy(fromScene);
    this.healthBar = null;
    this.speechContainer?.destroy(fromScene);
    this.speechContainer = null;
    this.bubbleBackground = null;
    this.bubbleText = null;
    super.destroy(fromScene);
  }
}
