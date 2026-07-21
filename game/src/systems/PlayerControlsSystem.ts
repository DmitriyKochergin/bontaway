import Phaser from "phaser";
import { type Player } from "../entities/Player";
import { PlayerKeysSyncSystem } from "./PlayerKeysSyncSystem";
import { MobileControlsSystem } from "./MobileControlsSystem";

type LeftClickHandler = (x: number, y: number) => void;

export class PlayerControlsSystem {
  private readonly scene: Phaser.Scene;
  private readonly player: Player;
  private readonly leftMouseClickHandler: LeftClickHandler;
  private readonly keyboardSystem: PlayerKeysSyncSystem;
  private mobileSystem?: MobileControlsSystem;
  private desktopPointerDownListener?: (pointer: Phaser.Input.Pointer) => void;
  private isTeleporting = false;

  constructor(scene: Phaser.Scene, player: Player, leftMouseClickHandler: LeftClickHandler) {
    this.scene = scene;
    this.player = player;
    this.leftMouseClickHandler = leftMouseClickHandler;

    this.keyboardSystem = new PlayerKeysSyncSystem(scene);
    this.setupPointerControls();

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  private setupPointerControls() {
    const isMobile =
      !this.scene.sys.game.device.os.desktop ||
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      this.scene.input.addPointer(5);
      this.mobileSystem = new MobileControlsSystem(this.scene, this.player, this.leftMouseClickHandler);
      return;
    }

    this.desktopPointerDownListener = (pointer: Phaser.Input.Pointer) => {
      if (this.scene.scene.isPaused()) {
        return;
      }

      if (pointer.rightButtonDown()) {
        this.rightMouseClickHandler(pointer.worldX, pointer.worldY);
        return;
      }

      if (pointer.leftButtonDown()) {
        this.leftMouseClickHandler(pointer.worldX, pointer.worldY);
      }
    };

    this.scene.input.on("pointerdown", this.desktopPointerDownListener);
  }

  private rightMouseClickHandler(targetX: number, targetY: number) {
    if (this.isTeleporting || !this.player.body) {
      return;
    }

    this.isTeleporting = true;

    const bounds = this.scene.physics.world.bounds;
    const clampedTargetX = Phaser.Math.Clamp(targetX, bounds.x, bounds.x + bounds.width);
    const clampedTargetY = Phaser.Math.Clamp(targetY, bounds.y, bounds.y + bounds.height);
    const sourceX = this.player.x;
    const sourceY = this.player.y;

    this.createTeleportTrail(sourceX, sourceY, clampedTargetX, clampedTargetY);

    const sourceFlash = this.scene.add
      .circle(sourceX, sourceY, 16, 0xbfefff, 0.35)
      .setDepth(this.player.depth - 1)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.scene.tweens.add({
      targets: sourceFlash,
      alpha: 0,
      scale: 2.25,
      duration: 120,
      ease: "Sine.easeOut",
      onComplete: () => {
        sourceFlash.destroy();
      }
    });

    this.player.setVelocity(0, 0);
    this.player.joystickVector = null;
    this.player.fovOffsetX = 0;
    this.player.fovOffsetY = 0;

    this.scene.tweens.add({
      targets: this.player,
      alpha: 0.2,
      scaleX: 0.92,
      scaleY: 0.92,
      duration: 70,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.player.setPosition(clampedTargetX, clampedTargetY);
        this.player.body?.reset(clampedTargetX, clampedTargetY);
        this.player.setVelocity(0, 0);

        const destinationFlash = this.scene.add
          .circle(clampedTargetX, clampedTargetY, 16, 0xbfefff, 0.6)
          .setDepth(this.player.depth - 1)
          .setBlendMode(Phaser.BlendModes.ADD);

        this.scene.tweens.add({
          targets: destinationFlash,
          alpha: 0,
          scale: 2.5,
          duration: 150,
          ease: "Sine.easeOut",
          onComplete: () => {
            destinationFlash.destroy();
          }
        });

        this.scene.tweens.add({
          targets: this.player,
          alpha: 1,
          scaleX: 1,
          scaleY: 1,
          duration: 100,
          ease: "Sine.easeIn",
          onComplete: () => {
            this.isTeleporting = false;
          }
        });
      }
    });
  }

  private createTeleportTrail(sourceX: number, sourceY: number, targetX: number, targetY: number) {
    const centerX = (sourceX + targetX) / 2;
    const centerY = (sourceY + targetY) / 2;
    const distance = Phaser.Math.Distance.Between(sourceX, sourceY, targetX, targetY);
    const angle = Phaser.Math.Angle.Between(sourceX, sourceY, targetX, targetY);

    const warpTrail = this.scene.add
      .rectangle(centerX, centerY, Math.max(distance, 1), 3, 0xbfefff, 0.4)
      .setDepth(this.player.depth - 2)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setRotation(angle);

    this.scene.tweens.add({
      targets: warpTrail,
      alpha: 0,
      scaleX: 0.15,
      scaleY: 2.2,
      duration: 140,
      ease: "Sine.easeOut",
      onComplete: () => {
        warpTrail.destroy();
      }
    });
  }

  public syncPlayerKeys() {
    this.keyboardSystem.syncPlayerKeys(this.player);
  }

  public destroy() {
    if (this.desktopPointerDownListener) {
      this.scene.input.off("pointerdown", this.desktopPointerDownListener);
      this.desktopPointerDownListener = undefined;
    }

    if (this.mobileSystem) {
      this.mobileSystem.destroy();
      this.mobileSystem = undefined;
    }

    this.keyboardSystem.destroy();
  }
}


