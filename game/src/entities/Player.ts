import Phaser from "phaser";

export class Player extends Phaser.Physics.Arcade.Sprite {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys: Partial<Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>> = {};
  private targetRotation: number = 0;
  private readonly movementSpeed = 250;
  private readonly fovOffsetMax = 10;
  private readonly fovOffsetLerp = 0.18;

  public fovOffsetX = 0;
  public fovOffsetY = 0;
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
    }

    this.applyPlayerAppearance();
  }

  public applyPlayerAppearance() {
    this.anims.stop();
    this.setTexture("player");
    this.setFrame(0);
    this.setCircle(14);
    this.body?.setOffset(2, 2);
    this.setPipeline("Light2D");
  }

  public syncKeys(activePhysicalKeys: Set<string>) {
    const checkPressed = (keysList: string[]) => {
      return keysList.some(k => activePhysicalKeys.has(k) || activePhysicalKeys.has(k.toUpperCase()));
    };

    if (this.keys.W) {
      const isDown = checkPressed(["KeyW", "w", "W"]);
      this.keys.W.isDown = isDown;
      this.keys.W.isUp = !isDown;
    }
    if (this.keys.A) {
      const isDown = checkPressed(["KeyA", "a", "A"]);
      this.keys.A.isDown = isDown;
      this.keys.A.isUp = !isDown;
    }
    if (this.keys.S) {
      const isDown = checkPressed(["KeyS", "s", "S"]);
      this.keys.S.isDown = isDown;
      this.keys.S.isUp = !isDown;
    }
    if (this.keys.D) {
      const isDown = checkPressed(["KeyD", "d", "D"]);
      this.keys.D.isDown = isDown;
      this.keys.D.isUp = !isDown;
    }

    if (this.cursors) {
      const isUpPressed = checkPressed(["ArrowUp"]);
      this.cursors.up.isDown = isUpPressed;
      this.cursors.up.isUp = !isUpPressed;

      const isDownPressed = checkPressed(["ArrowDown"]);
      this.cursors.down.isDown = isDownPressed;
      this.cursors.down.isUp = !isDownPressed;

      const isLeftPressed = checkPressed(["ArrowLeft"]);
      this.cursors.left.isDown = isLeftPressed;
      this.cursors.left.isUp = !isLeftPressed;

      const isRightPressed = checkPressed(["ArrowRight"]);
      this.cursors.right.isDown = isRightPressed;
      this.cursors.right.isUp = !isRightPressed;
    }
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
      this.targetRotation = Math.atan2(movementVector.y, movementVector.x) + Math.PI / 2;
      const diff = Phaser.Math.Angle.Wrap(this.targetRotation - this.rotation);
      const rotationSpeed = 0.01 * delta;

      if (Math.abs(diff) < rotationSpeed) {
        this.rotation = this.targetRotation;
      } else {
        this.rotation += Math.sign(diff) * rotationSpeed;
      }

      this.setVelocity(movementVector.x, movementVector.y);
    } else {
      this.setVelocity(0, 0);
    }

    const targetOffsetX =
      movementVector.lengthSq() > 0 ? (movementVector.x / this.movementSpeed) * this.fovOffsetMax : 0;
    const targetOffsetY =
      movementVector.lengthSq() > 0 ? (movementVector.y / this.movementSpeed) * this.fovOffsetMax : 0;
    this.fovOffsetX += (targetOffsetX - this.fovOffsetX) * this.fovOffsetLerp;
    this.fovOffsetY += (targetOffsetY - this.fovOffsetY) * this.fovOffsetLerp;
  }
}
