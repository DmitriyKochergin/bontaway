import Phaser from "phaser";

const POSITION_LERP = 0.25;
const ROTATION_LERP = 0.25;
const REMOTE_DEPTH = 299; // Just beneath the local player (depth 300).
const SPECTRAL_TINT = 0x88bbff;

/**
 * A visual stand-in for another player in the arena. It owns no physics and makes no decisions —
 * it just eases toward the last position/rotation the network reported, so a ~20 Hz feed still
 * looks fluid. A faint cold tint and torch light mark it as another soul in the dark.
 */
export class RemotePlayer extends Phaser.GameObjects.Sprite {
  private targetX: number;
  private targetY: number;
  private targetRotation: number;
  private torchLight?: Phaser.GameObjects.Light;

  constructor(scene: Phaser.Scene, x: number, y: number, rotation: number) {
    super(scene, x, y, "player");

    scene.add.existing(this);
    this.setDepth(REMOTE_DEPTH);
    this.setPipeline("Light2D");
    this.setTint(SPECTRAL_TINT);
    this.rotation = rotation;

    this.targetX = x;
    this.targetY = y;
    this.targetRotation = rotation;

    if (scene.lights) {
      this.torchLight = scene.lights.addLight(x, y, 260, 0xbfe0ff, 1.2);
    }
  }

  setTarget(x: number, y: number, rotation: number): void {
    if (Number.isFinite(x)) {
      this.targetX = x;
    }
    if (Number.isFinite(y)) {
      this.targetY = y;
    }
    if (Number.isFinite(rotation)) {
      this.targetRotation = rotation;
    }
  }

  tick(): void {
    this.x = Phaser.Math.Linear(this.x, this.targetX, POSITION_LERP);
    this.y = Phaser.Math.Linear(this.y, this.targetY, POSITION_LERP);

    const rotationDiff = Phaser.Math.Angle.Wrap(this.targetRotation - this.rotation);
    this.rotation = Phaser.Math.Angle.Wrap(this.rotation + rotationDiff * ROTATION_LERP);

    if (this.torchLight) {
      this.torchLight.x = this.x;
      this.torchLight.y = this.y;
    }
  }

  /** Brief flash when this peer casts, echoing the local muzzle feedback. */
  flash(): void {
    if (!this.scene) {
      return;
    }

    this.scene.tweens.add({
      targets: this,
      alpha: 0.6,
      duration: 90,
      yoyo: true
    });
  }

  destroy(fromScene?: boolean): void {
    if (this.torchLight && this.scene?.lights) {
      try {
        this.scene.lights.removeLight(this.torchLight);
      } catch {
        // Scene lights may already be gone during shutdown.
      }
      this.torchLight = undefined;
    }

    super.destroy(fromScene);
  }
}
