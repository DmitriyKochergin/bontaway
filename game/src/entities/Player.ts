import Phaser from "phaser";

export const playerDirections = [
  "south",
  "south_west",
  "west",
  "north_west",
  "north",
  "north_east",
  "east",
  "south_east"
] as const;

export type PlayerDirection = (typeof playerDirections)[number];
export type PlayerAppearance = "circle" | "franciscan";

export class Player extends Phaser.Physics.Arcade.Sprite {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys: Partial<Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>> = {};
  private targetRotation: number = 0;
  private readonly movementSpeed = 250;
  private readonly fovOffsetMax = 10;
  private readonly fovOffsetLerp = 0.18;

  public fovOffsetX = 0;
  public fovOffsetY = 0;
  public currentFacingDirection: PlayerDirection = "south";
  public playerAppearance: PlayerAppearance = "circle";
  public playerLight!: Phaser.GameObjects.Light;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "player");

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(300);
    this.setPipeline("Light2D");

    // Initialize light around player (radius 500, yellowish color, intensity 2)
    this.playerLight = scene.lights.addLight(this.x, this.y, 500, 0xffeebb, 2);

    if (scene.input && scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.keys = scene.input.keyboard.addKeys("W,A,S,D") as Partial<
        Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>
      >;

      scene.input.keyboard.on("keydown-TAB", (event: KeyboardEvent) => {
        event.preventDefault();
        this.togglePlayerAppearance();
      });
    }

    this.applyPlayerAppearance();
  }

  public togglePlayerAppearance() {
    this.playerAppearance = this.playerAppearance === "circle" ? "franciscan" : "circle";
    this.applyPlayerAppearance();
  }

  public applyPlayerAppearance() {
    if (this.playerAppearance === "circle") {
      this.anims.stop();
      this.setTexture("player");
      this.setFrame(0);
      this.setCircle(14);
      this.body?.setOffset(2, 2);
      this.setPipeline("Light2D");
      return;
    }

    this.setTexture("franciscan_idle", this.getIdleFrameIndex(this.currentFacingDirection));
    this.setFrame(this.getIdleFrameIndex(this.currentFacingDirection));
    if (this.body) {
      if ("setCircle" in this.body) {
        (this.body as Phaser.Physics.Arcade.Body).setCircle(0);
      }
      this.body.setSize(32, 32, true);
    }
    this.setPipeline("Light2D");
  }

  private getIdleFrameIndex(direction: PlayerDirection) {
    return playerDirections.indexOf(direction);
  }

  private getWalkAnimationKey(direction: PlayerDirection) {
    return `player_walk_${direction}`;
  }

  private getDirectionFromMovement(movementVector: Phaser.Math.Vector2): PlayerDirection {
    const horizontal = Math.abs(movementVector.x);
    const vertical = Math.abs(movementVector.y);

    if (horizontal === 0 && vertical === 0) {
      return this.currentFacingDirection;
    }

    if (movementVector.x !== 0 && movementVector.y !== 0) {
      if (movementVector.x > 0 && movementVector.y > 0) {
        return "south_east";
      }

      if (movementVector.x > 0 && movementVector.y < 0) {
        return "north_east";
      }

      if (movementVector.x < 0 && movementVector.y > 0) {
        return "south_west";
      }

      return "north_west";
    }

    if (horizontal > vertical) {
      return movementVector.x > 0 ? "east" : "west";
    }

    if (vertical > horizontal) {
      return movementVector.y > 0 ? "south" : "north";
    }

    return movementVector.x > 0 ? "east" : "west";
  }

  update(_time: number, delta: number) {
    if (!this.body) return;

    // Update light position to track player
    if (this.playerLight) {
      this.playerLight.x = this.x;
      this.playerLight.y = this.y;
    }

    const movementVector = new Phaser.Math.Vector2(0, 0);

    const horizontalInput =
      (this.cursors.left.isDown || this.keys.A?.isDown ? -1 : 0) +
      (this.cursors.right.isDown || this.keys.D?.isDown ? 1 : 0);
    const verticalInput =
      (this.cursors.up.isDown || this.keys.W?.isDown ? -1 : 0) +
      (this.cursors.down.isDown || this.keys.S?.isDown ? 1 : 0);

    movementVector.set(horizontalInput, verticalInput);

    if (movementVector.lengthSq() > 0) {
      movementVector.normalize().scale(this.movementSpeed);
      if (this.playerAppearance === "circle") {
        this.targetRotation = Math.atan2(movementVector.y, movementVector.x) + Math.PI / 2;
        const diff = Phaser.Math.Angle.Wrap(this.targetRotation - this.rotation);
        const rotationSpeed = 0.01 * delta;

        if (Math.abs(diff) < rotationSpeed) {
          this.rotation = this.targetRotation;
        } else {
          this.rotation += Math.sign(diff) * rotationSpeed;
        }
      }

      this.setVelocity(movementVector.x, movementVector.y);
      const direction = this.getDirectionFromMovement(movementVector);

      if (direction !== this.currentFacingDirection) {
        this.currentFacingDirection = direction;
      }

      if (this.playerAppearance === "franciscan") {
        this.anims.play(this.getWalkAnimationKey(direction), true);
      }
    } else {
      this.setVelocity(0, 0);
      if (this.playerAppearance === "franciscan") {
        this.anims.stop();
        this.setFrame(this.getIdleFrameIndex(this.currentFacingDirection));
      }
    }

    const targetOffsetX =
      movementVector.lengthSq() > 0 ? (movementVector.x / this.movementSpeed) * this.fovOffsetMax : 0;
    const targetOffsetY =
      movementVector.lengthSq() > 0 ? (movementVector.y / this.movementSpeed) * this.fovOffsetMax : 0;
    this.fovOffsetX += (targetOffsetX - this.fovOffsetX) * this.fovOffsetLerp;
    this.fovOffsetY += (targetOffsetY - this.fovOffsetY) * this.fovOffsetLerp;
  }
}
