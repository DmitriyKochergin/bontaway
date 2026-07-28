import Phaser from "phaser";
import { type Player } from "../entities/Player";

type DevModeChecker = () => boolean;

export class PlayerTeleport {
  private readonly scene: Phaser.Scene;
  private readonly player: Player;
  private readonly isDevModeEnabled: DevModeChecker;
  private isTeleporting = false;
  private isDestroyed = false;

  constructor(scene: Phaser.Scene, player: Player, isDevModeEnabled: DevModeChecker) {
    this.scene = scene;
    this.player = player;
    this.isDevModeEnabled = isDevModeEnabled;

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  public teleport(targetX: number, targetY: number): void {
    if (!this.isDevModeEnabled() || this.isTeleporting || this.isDestroyed || !this.player.body) {
      return;
    }

    this.isTeleporting = true;

    const bounds = this.scene.physics.world.bounds;
    const clampedTargetX = Phaser.Math.Clamp(targetX, bounds.x, bounds.x + bounds.width);
    const clampedTargetY = Phaser.Math.Clamp(targetY, bounds.y, bounds.y + bounds.height);
    const sourceX = this.player.x;
    const sourceY = this.player.y;

    this.createTeleportDepartureEffect(sourceX, sourceY);

    this.player.setVelocity(0, 0);
    this.player.joystickVector = null;
    this.player.fovOffsetX = 0;
    this.player.fovOffsetY = 0;

    this.scene.tweens.add({
      targets: this.player,
      alpha: 0.05,
      scaleX: 0.82,
      scaleY: 0.82,
      duration: 90,
      ease: "Sine.easeIn",
      onComplete: () => {
        if (this.isDestroyed) {
          return;
        }

        this.player.setPosition(clampedTargetX, clampedTargetY);
        this.player.body?.reset(clampedTargetX, clampedTargetY);
        this.player.setVelocity(0, 0);

        this.createTeleportArrivalEffect(clampedTargetX, clampedTargetY);

        this.scene.tweens.add({
          targets: this.player,
          alpha: 1,
          scaleX: 1.12,
          scaleY: 1.12,
          duration: 100,
          ease: "Back.easeOut",
          onComplete: () => {
            if (this.isDestroyed) {
              return;
            }

            this.scene.tweens.add({
              targets: this.player,
              scaleX: 1,
              scaleY: 1,
              duration: 70,
              ease: "Sine.easeOut",
              onComplete: () => {
                this.isTeleporting = false;
              }
            });
          }
        });
      }
    });
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.isTeleporting = false;
  }

  private createTeleportDepartureEffect(sourceX: number, sourceY: number): void {
    const coreSink = this.scene.add
      .circle(sourceX, sourceY, 16, 0x203040, 0.5)
      .setDepth(this.player.depth - 1)
      .setBlendMode(Phaser.BlendModes.ADD);

    const shadowRing = this.scene.add
      .circle(sourceX, sourceY, 30, 0x081018, 0.22)
      .setDepth(this.player.depth - 2)
      .setBlendMode(Phaser.BlendModes.ADD);

    const collapseRing = this.scene.add
      .circle(sourceX, sourceY, 20, 0x6fbfff, 0.18)
      .setDepth(this.player.depth - 3)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.scene.tweens.add({
      targets: coreSink,
      alpha: 0,
      scale: 0.2,
      duration: 85,
      ease: "Sine.easeOut",
      onComplete: () => {
        coreSink.destroy();
      }
    });

    this.scene.tweens.add({
      targets: shadowRing,
      alpha: 0,
      scale: 0.3,
      duration: 120,
      ease: "Sine.easeIn",
      onComplete: () => {
        shadowRing.destroy();
      }
    });

    this.scene.tweens.add({
      targets: collapseRing,
      alpha: 0,
      scale: 0.1,
      duration: 95,
      ease: "Sine.easeIn",
      onComplete: () => {
        collapseRing.destroy();
      }
    });
  }

  private createTeleportArrivalEffect(targetX: number, targetY: number): void {
    const coreFlash = this.scene.add
      .circle(targetX, targetY, 8, 0xf6ffff, 0.85)
      .setDepth(this.player.depth - 1)
      .setBlendMode(Phaser.BlendModes.ADD);

    const rippleRing = this.scene.add
      .circle(targetX, targetY, 12, 0x9fe8ff, 0.3)
      .setDepth(this.player.depth - 2)
      .setBlendMode(Phaser.BlendModes.ADD);

    const sparkOffsets = [
      [0, -22],
      [22, 0],
      [0, 22],
      [-22, 0]
    ];

    const sparks = sparkOffsets.map(([offsetX, offsetY]) =>
      this.scene.add
        .circle(targetX + offsetX, targetY + offsetY, 4, 0xbfefff, 0.7)
        .setDepth(this.player.depth - 1)
        .setBlendMode(Phaser.BlendModes.ADD)
    );

    this.scene.tweens.add({
      targets: coreFlash,
      alpha: 0,
      scale: 2.4,
      duration: 80,
      ease: "Sine.easeOut",
      onComplete: () => {
        coreFlash.destroy();
      }
    });

    this.scene.tweens.add({
      targets: rippleRing,
      alpha: 0,
      scale: 3.5,
      duration: 160,
      ease: "Sine.easeOut",
      onComplete: () => {
        rippleRing.destroy();
      }
    });

    sparks.forEach((spark, index) => {
      this.scene.tweens.add({
        targets: spark,
        alpha: 0,
        scale: 2.2,
        x: targetX + sparkOffsets[index][0] * 1.4,
        y: targetY + sparkOffsets[index][1] * 1.4,
        duration: 120,
        ease: "Sine.easeOut",
        onComplete: () => {
          spark.destroy();
        }
      });
    });
  }
}
