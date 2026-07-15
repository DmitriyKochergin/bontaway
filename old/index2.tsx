import Phaser from 'phaser';

class MainScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: { [key: string]: Phaser.Input.Keyboard.Key };
  private targetRotation: number = 0;

  constructor() {
    super('MainScene');
  }

  preload() {
    // 1. Floor Tile
    const floor = this.make.graphics({ x: 0, y: 0, add: false });
    floor.fillStyle(0x1a1a1a);
    floor.fillRect(0, 0, 32, 32);
    floor.lineStyle(1, 0x121212);
    floor.strokeRect(0, 0, 32, 32);
    for(let i = 0; i < 5; i++) {
        floor.fillStyle(0x222222, 0.5);
        floor.fillRect(Phaser.Math.Between(2, 25), Phaser.Math.Between(2, 25), 4, 4);
    }
    floor.generateTexture('floor', 32, 32);

    // 2. Wall
    const wall = this.make.graphics({ x: 0, y: 0, add: false });
    wall.fillStyle(0x333333);
    wall.fillRect(0, 0, 32, 32);
    wall.lineStyle(2, 0x111111);
    wall.strokeRect(0, 0, 32, 32);
    wall.lineStyle(1, 0x444444);
    wall.moveTo(0, 0); wall.lineTo(32, 0);
    wall.moveTo(0, 0); wall.lineTo(0, 32);
    wall.strokePath();
    wall.generateTexture('wall', 32, 32);

    // 3. Player (32x32 texture with eyes for direction)
    const player = this.make.graphics({ x: 0, y: 0, add: false });

    // Cloak (main body)
    player.fillStyle(0x777777);
    player.fillCircle(16, 16, 14);

    // Two eyes to show direction (facing "up" by default)
    player.fillStyle(0x111111);
    player.fillCircle(11, 12, 2.5); // Left eye
    player.fillCircle(21, 12, 2.5); // Right eye

    player.generateTexture('player', 32, 32);
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');

    const roomSize = 20; 
    const tileSize = 32;
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;
    const offset = (roomSize * tileSize) / 2;

    const width = roomSize * tileSize;
    const height = roomSize * tileSize;
    const startX = centerX - offset;
    const startY = centerY - offset;

    this.physics.world.setBounds(startX - 64, startY - 64, width + 128, height + 128);

    // Create Floor
    for (let y = 0; y < roomSize; y++) {
      for (let x = 0; x < roomSize; x++) {
        this.add.image(startX + x * tileSize + 16, startY + y * tileSize + 16, 'floor');
      }
    }

    // Create Walls
    const physicsWalls = this.physics.add.staticGroup();

    physicsWalls.add(this.add.rectangle(centerX, startY - 16, width + 64, 32).setAlpha(0));
    this.add.tileSprite(centerX, startY - 16, width + 64, 32, 'wall');

    physicsWalls.add(this.add.rectangle(centerX, startY + height + 16, width + 64, 32).setAlpha(0));
    this.add.tileSprite(centerX, startY + height + 16, width + 64, 32, 'wall');

    physicsWalls.add(this.add.rectangle(startX - 16, centerY, 32, height).setAlpha(0));
    this.add.tileSprite(startX - 16, centerY, 32, height, 'wall');

    physicsWalls.add(this.add.rectangle(startX + width + 16, centerY, 32, height).setAlpha(0));
    this.add.tileSprite(startX + width + 16, centerY, 32, height, 'wall');

    // Player
    this.player = this.physics.add.sprite(centerX, centerY, 'player');
    this.player.setCircle(14, 2, 2);

    this.physics.add.collider(this.player, physicsWalls);

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys('W,A,S,D') as any;
    }

    const vignette = this.add.graphics();
    vignette.fillStyle(0x000000, 0.4);
    vignette.fillRect(0, 0, this.scale.width, this.scale.height);
    vignette.setScrollFactor(0).setDepth(100);
  }

  update(time: number, delta: number) {
    if (!this.player.body) return;

    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown || (this.keys.A && this.keys.A.isDown)) vx = -1;
    else if (this.cursors.right.isDown || (this.keys.D && this.keys.D.isDown)) vx = 1;

    if (this.cursors.up.isDown || (this.keys.W && this.keys.W.isDown)) vy = -1;
    else if (this.cursors.down.isDown || (this.keys.S && this.keys.S.isDown)) vy = 1;

    const speed = 200;
    if (vx !== 0 || vy !== 0) {
        this.targetRotation = Math.atan2(vy, vx) + Math.PI / 2;
        const diff = Phaser.Math.Angle.Wrap(this.targetRotation - this.player.rotation);
        const rotationSpeed = 0.01 * delta;
        
        if (Math.abs(diff) < rotationSpeed) {
            this.player.rotation = this.targetRotation;
        } else {
            this.player.rotation += Math.sign(diff) * rotationSpeed;
        }

        const diag = (vx !== 0 && vy !== 0) ? 0.7071 : 1;
        this.player.setVelocity(vx * speed * diag, vy * speed * diag);
    } else {
        this.player.setVelocity(0, 0);
    }
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: 'game-container',
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0, x: 0 },
      debug: false
    }
  },
  scene: MainScene,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};

window.addEventListener('load', () => {
    let container = document.getElementById('game-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'game-container';
        document.body.appendChild(container);
    }
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    new Phaser.Game(config);
});
