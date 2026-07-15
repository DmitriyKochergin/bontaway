import Phaser from 'phaser';

class MainScene extends Phaser.Scene {
    private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private keys!: { [key: string]: Phaser.Input.Keyboard.Key };
    private directionLine!: Phaser.GameObjects.Graphics;
    private coordTexts: Phaser.GameObjects.Text[] = [];
    private targetRotation: number = 0;

    constructor() {
        super('MainScene');
    }

    preload() {
        // Player
        const playerTex = this.make.graphics({ x: 0, y: 0, add: false });
        playerTex.fillStyle(0x3a5a8a, 1);
        playerTex.fillRect(6, 10, 20, 12);
        playerTex.fillStyle(0x2a4a7a, 1);
        playerTex.fillRect(4, 10, 6, 8);
        playerTex.fillRect(22, 10, 6, 8);
        playerTex.fillStyle(0x8a8a8a, 1);
        playerTex.fillCircle(16, 14, 7);
        playerTex.fillStyle(0x111111, 1);
        playerTex.fillRect(11, 10, 10, 2);
        playerTex.fillStyle(0xcccccc, 1);
        playerTex.fillRect(24, 4, 4, 16);
        playerTex.fillStyle(0x8b4513, 1);
        playerTex.fillRect(23, 18, 6, 2);
        playerTex.generateTexture('player', 32, 32);

        // Wall
        const wallTex = this.make.graphics({ x: 0, y: 0, add: false });
        wallTex.fillStyle(0x2c2c2c, 1);
        wallTex.fillRect(0, 0, 32, 32);
        wallTex.fillStyle(0x3d3d3d, 1);
        wallTex.fillRect(2, 2, 28, 12);
        wallTex.fillRect(2, 16, 12, 12);
        wallTex.fillRect(16, 16, 14, 12);
        wallTex.lineStyle(1, 0x1a1a1a, 1);
        wallTex.strokeRect(0, 0, 32, 32);
        wallTex.generateTexture('wall', 32, 32);

        // Floor
        const floorTex = this.make.graphics({ x: 0, y: 0, add: false });
        floorTex.fillStyle(0x1a1a1a, 1);
        floorTex.fillRect(0, 0, 32, 32);
        floorTex.lineStyle(1, 0x111111, 1);
        floorTex.strokeRect(0, 0, 32, 32);
        floorTex.generateTexture('floor', 32, 32);
    }

    create() {
        const tileSize = 32;
        // Level: 60x45 (3x larger than previous)
        const cols = 60;
        const rows = 45;
        const width = cols * tileSize;
        const height = rows * tileSize;

        // Generate map
        const levelMap: number[][] = Array.from({ length: rows }, () => Array(cols).fill(1));

        // Create complex passages/caves using simple random walk or rectangles
        const createRoom = (rx: number, ry: number, rw: number, rh: number) => {
            for (let y = ry; y < ry + rh && y < rows - 1; y++) {
                for (let x = rx; x < rx + rw && x < cols - 1; x++) {
                    if (x > 0 && y > 0) levelMap[y][x] = 0;
                }
            }
        };

        // Random rooms and passages
        createRoom(2, 2, 10, 10); // Start room
        createRoom(12, 5, 20, 5); // Passage
        createRoom(30, 2, 15, 15); // Large chamber
        createRoom(5, 15, 5, 20); // Vertical hall
        createRoom(10, 30, 25, 8); // Lower chamber
        createRoom(40, 20, 10, 20); // Right cave
        createRoom(2, 38, 55, 4); // Bottom corridor

        // Connect them with more floor
        createRoom(10, 6, 5, 2);
        createRoom(30, 10, 2, 25);

        this.physics.world.setBounds(0, 0, width, height);
        const isDebug = this.physics.config.debug;

        // Visuals
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const isWall = levelMap[y][x] === 1;
                this.add.image(x * tileSize + 16, y * tileSize + 16, isWall ? 'wall' : 'floor');
                if (isDebug && !isWall) {
                    const txt = this.add.text(x * tileSize + 2, y * tileSize + 2, `${x},${y}`, {
                        fontSize: '10px', color: '#444', fontFamily: 'monospace'
                    });
                    this.coordTexts.push(txt);
                }
            }
        }

        // Seamless Physics
        const physicsWalls = this.physics.add.staticGroup();
        for (let y = 0; y < rows; y++) {
            let startX = -1;
            for (let x = 0; x <= cols; x++) {
                if (x < cols && levelMap[y][x] === 1) {
                    if (startX === -1) startX = x;
                } else {
                    if (startX !== -1) {
                        const len = x - startX;
                        const px = (startX + len / 2) * tileSize;
                        const py = (y + 0.5) * tileSize;
                        physicsWalls.add(this.add.rectangle(px, py, len * tileSize, tileSize));
                        startX = -1;
                    }
                }
            }
        }

        this.player = this.physics.add.sprite(100, 100, 'player');
        this.player.setCollideWorldBounds(true);
        this.player.setCircle(12, 4, 4);
        this.physics.add.collider(this.player, physicsWalls);

        this.directionLine = this.add.graphics().setDepth(10).setVisible(!!isDebug);

        if (this.input.keyboard) {
            this.cursors = this.input.keyboard.createCursorKeys();
            this.keys = this.input.keyboard.addKeys('W,A,S,D') as any;
        }

        this.cameras.main.setBounds(0, 0, width, height);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.setZoom(1.8);
    }

    update(time: number, delta: number) {
        if (!this.player) return;
        let vx = 0, vy = 0;
        if (this.cursors.left.isDown || (this.keys.A && this.keys.A.isDown)) vx = -1;
        else if (this.cursors.right.isDown || (this.keys.D && this.keys.D.isDown)) vx = 1;
        if (this.cursors.up.isDown || (this.keys.W && this.keys.W.isDown)) vy = -1;
        else if (this.cursors.down.isDown || (this.keys.S && this.keys.S.isDown)) vy = 1;

        const speed = 200;
        if (vx !== 0 || vy !== 0) {
            this.targetRotation = Math.atan2(vy, vx) + Math.PI / 2;
            const diff = Phaser.Math.Angle.Wrap(this.targetRotation - this.player.rotation);
            const rotationSpeed = 0.008 * delta;
            if (Math.abs(diff) < rotationSpeed) this.player.rotation = this.targetRotation;
            else this.player.rotation += Math.sign(diff) * rotationSpeed;
            const diag = (vx !== 0 && vy !== 0) ? 0.7071 : 1;
            this.player.setVelocity(vx * speed * diag, vy * speed * diag);
        } else {
            this.player.setVelocity(0, 0);
        }

        this.directionLine.clear();
        if (this.physics.config.debug && (vx !== 0 || vy !== 0)) {
            this.directionLine.lineStyle(2, 0x00ff00, 1);
            this.directionLine.lineBetween(this.player.x, this.player.y, this.player.x + vx * 50, this.player.y + vy * 50);
        }
    }
}

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'root',
    pixelArt: true,
    backgroundColor: '#0a0a0a',
    physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 0 }, debug: false }
    },
    scene: MainScene
};

new Phaser.Game(config);
