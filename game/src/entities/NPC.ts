import Phaser from "phaser";

export type NpcType = "scholar" | "guard" | "wanderer" | "merchant";

export class NPC extends Phaser.Physics.Arcade.Sprite {
  private npcType: NpcType;
  private npcName: string;
  private dialogueLines: string[];
  private currentLineIndex = 0;
  private isBlinking = false;
  private nextBlinkTime = 0;

  // Eye-follow: NPC body rotates to face the player while in activation radius, eases back to rest otherwise
  private targetRotation = 0;

  // Floating text / dialogue components
  private speechContainer: Phaser.GameObjects.Container | null = null;
  private bubbleBackground: Phaser.GameObjects.Graphics | null = null;
  private bubbleText: Phaser.GameObjects.Text | null = null;
  private playerInRange = false;

  constructor(scene: Phaser.Scene, x: number, y: number, npcType: NpcType, npcName: string, dialogueLines: string[]) {
    const textureKey = `npc_${npcType}`;
    super(scene, x, y, textureKey);

    this.npcType = npcType;
    this.npcName = npcName;
    this.dialogueLines = dialogueLines;

    scene.add.existing(this);
    scene.physics.add.existing(this, true); // Create as static body

    this.setDepth(250); // Deep behind player (300) but above obstacles/walls (200)
    this.setPipeline("Light2D");

    // Collisions
    this.setCircle(14);
    if (this.body) {
      this.body.setOffset(2, 2);
    }

    // Blinking animation completed handler
    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim: Phaser.Animations.Animation) => {
      if (anim.key === `${textureKey}_blink`) {
        this.isBlinking = false;
        this.setFrame(0);
      }
    });

    this.scheduleNextBlink(scene.time?.now || 0);
    this.createSpeechBubble();
  }

  private scheduleNextBlink(currentTime: number): void {
    const isDoubleBlink = Math.random() < 0.2;
    const delay = isDoubleBlink ? Phaser.Math.Between(400, 650) : Phaser.Math.Between(3000, 8000);
    this.nextBlinkTime = currentTime + delay;
  }

  private createSpeechBubble(): void {
    this.speechContainer = this.scene.add.container(this.x, this.y - 28);
    this.speechContainer.setDepth(350); // Above player
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
    const borderColor = this.npcType === "wanderer" ? 0xdd2222 : 0x4a4a5a;
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
    // Blinking trigger logic
    if (!this.isBlinking && currentTime >= this.nextBlinkTime) {
      this.isBlinking = true;
      this.anims.play(`npc_${this.npcType}_blink`);
      this.scheduleNextBlink(currentTime);
    }

    // Distance-based interaction trigger
    const distance = Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY);
    const triggerRadius = 110;
    const exitRadius = 140;
    const rotationSpeed = 0.007;

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
      this.targetRotation = 0;
    }

    this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, this.targetRotation, rotationSpeed * _delta);
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
    this.speechContainer?.destroy(fromScene);
    this.speechContainer = null;
    this.bubbleBackground = null;
    this.bubbleText = null;
    super.destroy(fromScene);
  }
}
