import Phaser from "phaser";
import { type Player } from "../entities/Player";

export class MobileSystem {
  private scene: Phaser.Scene;
  private player: Player;
  private onRightHalfClick: (x: number, y: number) => void;

  private joystickOuter!: Phaser.GameObjects.Arc;
  private joystickInner!: Phaser.GameObjects.Arc;
  private joystickPointer: Phaser.Input.Pointer | null = null;
  private joystickBase = new Phaser.Math.Vector2();
  private readonly maxJoystickRadius = 60;

  private onPointerDownRef!: (pointer: Phaser.Input.Pointer) => void;
  private onPointerMoveRef!: (pointer: Phaser.Input.Pointer) => void;
  private onPointerUpRef!: (pointer: Phaser.Input.Pointer) => void;

  constructor(scene: Phaser.Scene, player: Player, onRightHalfClick: (x: number, y: number) => void) {
    this.scene = scene;
    this.player = player;
    this.onRightHalfClick = onRightHalfClick;

    this.createJoystickGraphics();
    this.setupListeners();
  }

  private createJoystickGraphics() {
    this.joystickOuter = this.scene.add
      .circle(0, 0, this.maxJoystickRadius, 0xffffff, 0.1)
      .setStrokeStyle(2, 0xffffff, 0.4)
      .setScrollFactor(0)
      .setDepth(600)
      .setVisible(false);

    this.joystickInner = this.scene.add
      .circle(0, 0, 25, 0xffffff, 0.35)
      .setScrollFactor(0)
      .setDepth(601)
      .setVisible(false);
  }

  private setupListeners() {
    this.onPointerDownRef = (pointer: Phaser.Input.Pointer) => {
      if (this.scene.scene.isPaused()) {
        return;
      }

      if (pointer.x < this.scene.scale.width / 2) {
        // Left half: start joystick
        this.joystickPointer = pointer;
        this.joystickBase.set(pointer.x, pointer.y);
        this.joystickOuter.setPosition(pointer.x, pointer.y).setVisible(true);
        this.joystickInner.setPosition(pointer.x, pointer.y).setVisible(true);
      } else {
        // Right half: fire fireball in looking direction
        const gazeAngle = this.player.rotation - Math.PI / 2;
        const dirX = Math.cos(gazeAngle);
        const dirY = Math.sin(gazeAngle);
        this.onRightHalfClick(this.player.x + dirX * 200, this.player.y + dirY * 200);
      }
    };

    this.onPointerMoveRef = (pointer: Phaser.Input.Pointer) => {
      if (this.scene.scene.isPaused() || !this.player) {
        return;
      }

      if (this.joystickPointer && this.joystickPointer.id === pointer.id) {
        const dx = pointer.x - this.joystickBase.x;
        const dy = pointer.y - this.joystickBase.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const speedFraction = Math.min(distance / this.maxJoystickRadius, 1);
        const angle = Math.atan2(dy, dx);

        const thumbX = this.joystickBase.x + Math.cos(angle) * (speedFraction * this.maxJoystickRadius);
        const thumbY = this.joystickBase.y + Math.sin(angle) * (speedFraction * this.maxJoystickRadius);
        this.joystickInner.setPosition(thumbX, thumbY);

        const moveX = Math.cos(angle) * speedFraction * this.player.movementSpeed;
        const moveY = Math.sin(angle) * speedFraction * this.player.movementSpeed;
        this.player.joystickVector = new Phaser.Math.Vector2(moveX, moveY);
      }
    };

    this.onPointerUpRef = (pointer: Phaser.Input.Pointer) => {
      if (this.joystickPointer && this.joystickPointer.id === pointer.id) {
        this.resetJoystick();
      }
    };

    this.scene.input.on("pointerdown", this.onPointerDownRef);
    this.scene.input.on("pointermove", this.onPointerMoveRef);
    this.scene.input.on("pointerup", this.onPointerUpRef);

    this.scene.events.on(Phaser.Scenes.Events.PAUSE, this.resetJoystick, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  public resetJoystick() {
    this.joystickPointer = null;
    if (this.joystickOuter) this.joystickOuter.setVisible(false);
    if (this.joystickInner) this.joystickInner.setVisible(false);
    if (this.player) {
      this.player.joystickVector = null;
    }
  }

  public destroy() {
    this.scene.input.off("pointerdown", this.onPointerDownRef);
    this.scene.input.off("pointermove", this.onPointerMoveRef);
    this.scene.input.off("pointerup", this.onPointerUpRef);
    this.scene.events.off(Phaser.Scenes.Events.PAUSE, this.resetJoystick, this);

    if (this.joystickOuter) {
      this.joystickOuter.destroy();
    }
    if (this.joystickInner) {
      this.joystickInner.destroy();
    }
  }
}
