import Phaser from 'phaser';
import { type PhaserRaycasterPlugin, type Raycaster, type RaycasterRay } from '../phaser-raycaster';

const playerDirections = ['south', 'south_west', 'west', 'north_west', 'north', 'north_east', 'east', 'south_east'] as const;
type PlayerDirection = (typeof playerDirections)[number];
type PlayerAppearance = 'circle' | 'franciscan';

export default class MainScene extends Phaser.Scene {
    raycasterPlugin!: PhaserRaycasterPlugin;
    private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private keys: Partial<Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>> = {};
    private targetRotation: number = 0;
    private raycaster!: Raycaster;
    private fovRay!: RaycasterRay;
    private raycasterOccluders: Phaser.Physics.Arcade.Image[] = [];
    private fovOverlay!: Phaser.GameObjects.Rectangle;
    private fovMaskTexture!: Phaser.Textures.CanvasTexture;
    private fovMaskImage!: Phaser.GameObjects.Image;
    private readonly fovRadiusTiles = 7.5;
    private readonly fovFadeTiles = 7.5;
    private readonly tileSize = 32;
    private readonly dungeonColumns = 48;
    private readonly dungeonRows = 34;
    private readonly movementSpeed = 250;
    private readonly fovRefreshMs = 33;
    private readonly fovOffsetMax = 10;
    private readonly fovOffsetLerp = 0.18;
    private fovRefreshAccumulator = 0;
    private lastFovCenterX = Number.NaN;
    private lastFovCenterY = Number.NaN;
    private fovOffsetX = 0;
    private fovOffsetY = 0;
    private currentFacingDirection: PlayerDirection = 'south';
    // private playerAppearance: PlayerAppearance = 'circle';
    private playerAppearance: PlayerAppearance = 'franciscan';

    constructor() {
        super('MainScene');

        void this.preload;
        void this.create;
    }

    preload() {
        // 1. Floor Tile
        const floor = this.add.graphics();
        floor.fillStyle(0x1a1a1a);
        floor.fillRect(0, 0, 32, 32);
        floor.lineStyle(1, 0x121212);
        floor.strokeRect(0, 0, 32, 32);
        for (let i = 0; i < 5; i++) {
            floor.fillStyle(0x222222, 0.5);
            floor.fillRect(Phaser.Math.Between(2, 25), Phaser.Math.Between(2, 25), 4, 4);
        }
        floor.generateTexture('floor', 32, 32);
        floor.destroy();

        // 2. Wall
        const wall = this.add.graphics();
        wall.fillStyle(0x333333);
        wall.fillRect(0, 0, 32, 32);
        wall.lineStyle(2, 0x111111);
        wall.strokeRect(0, 0, 32, 32);
        wall.lineStyle(1, 0x444444);
        wall.moveTo(0, 0); wall.lineTo(32, 0);
        wall.moveTo(0, 0); wall.lineTo(0, 32);
        wall.strokePath();
        wall.generateTexture('wall', 32, 32);
        wall.destroy();

        // 3. Player (32x32 texture with eyes for direction)
        const player = this.add.graphics();

        // Cloak (main body)
        player.fillStyle(0x777777);
        player.fillCircle(16, 16, 14);

        // Two eyes to show direction (facing "up" by default)
        player.fillStyle(0x111111);
        player.fillCircle(11, 12, 2.5); // Left eye
        player.fillCircle(21, 12, 2.5); // Right eye

        player.generateTexture('player', 32, 32);
        player.destroy();

        // 4. Obstacle tile
        const obstacle = this.add.graphics();
        obstacle.fillStyle(0x4a4a4a);
        obstacle.fillRoundedRect(0, 0, 48, 48, 8);
        obstacle.lineStyle(2, 0x1b1b1b);
        obstacle.strokeRoundedRect(0, 0, 48, 48, 8);
        obstacle.fillStyle(0x2f2f2f, 0.45);
        obstacle.fillCircle(16, 16, 5);
        obstacle.fillCircle(34, 31, 4);
        obstacle.generateTexture('obstacle', 48, 48);
        obstacle.destroy();

        // 5. Franciscan player spritesheet copied from dungeon-crawler-now
        this.load.spritesheet('franciscan_idle', 'assets/characters/franciscan_idle.png', {
            frameWidth: 32,
            frameHeight: 32
        });
        this.load.spritesheet('franciscan_walk', 'assets/characters/franciscan_walk.png', {
            frameWidth: 32,
            frameHeight: 32
        });
    }

    create() {
        this.cameras.main.setBackgroundColor('#000000');

        const tileSize = this.tileSize;
        const dungeon = this.buildDungeonLayout();
        const mapWidth = this.dungeonColumns * tileSize;
        const mapHeight = this.dungeonRows * tileSize;

        this.physics.world.setBounds(0, 0, mapWidth, mapHeight);

        for (let row = 0; row < this.dungeonRows; row++) {
            for (let column = 0; column < this.dungeonColumns; column++) {
                if (!dungeon.walkable[row][column]) {
                    continue;
                }

                this.add.image(
                    column * tileSize + tileSize / 2,
                    row * tileSize + tileSize / 2,
                    'floor'
                ).setDepth(0);
            }
        }

        const physicsWalls = this.physics.add.staticGroup();
        const wallCells = this.buildWallCells(dungeon.walkable);

        for (const wallCell of wallCells) {
            const [column, row] = wallCell.split(',').map(Number);
            this.addWallBlock(
                physicsWalls,
                column * tileSize + tileSize / 2,
                row * tileSize + tileSize / 2,
                column,
                row,
                dungeon.walkable
            );
        }

        const obstaclePlacements = [
            { x: 13.5 * tileSize, y: 16.5 * tileSize, width: 32, height: 32 },
            { x: 24.5 * tileSize, y: 16.5 * tileSize, width: 32, height: 32 },
            { x: 27.5 * tileSize, y: 6.5 * tileSize, width: 32, height: 32 },
            { x: 36.5 * tileSize, y: 13.5 * tileSize, width: 32, height: 32 },
            { x: 10.5 * tileSize, y: 27.5 * tileSize, width: 32, height: 32 },
            { x: 39.5 * tileSize, y: 26.5 * tileSize, width: 32, height: 32 },
            { x: 6.5 * tileSize, y: 9.5 * tileSize, width: 32, height: 32 },
            { x: 31.5 * tileSize, y: 21.5 * tileSize, width: 32, height: 32 }
        ];

        for (const obstaclePlacement of obstaclePlacements) {
            this.addObstacle(physicsWalls, obstaclePlacement.x, obstaclePlacement.y, obstaclePlacement.width, obstaclePlacement.height);
        }

        this.raycaster = this.raycasterPlugin.createRaycaster({
            boundingBox: new Phaser.Geom.Rectangle(0, 0, mapWidth, mapHeight),
            autoUpdate: false
        });
        this.raycaster.mapGameObjects(this.raycasterOccluders, false);

        // Player
        this.player = this.physics.add.sprite(dungeon.spawnX, dungeon.spawnY, 'franciscan_idle', this.getIdleFrameIndex(this.currentFacingDirection));
        this.player.setDepth(300);
        this.player.setFrame(this.getIdleFrameIndex(this.currentFacingDirection));

        this.physics.add.collider(this.player, physicsWalls);

        this.createPlayerAnimations();
        this.applyPlayerAppearance();

        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

        if (!this.input.keyboard) {
            throw new Error('Keyboard input is required for this scene.');
        }

        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys('W,A,S,D') as Partial<Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>>;

        this.input.keyboard.on('keydown-TAB', (event: KeyboardEvent) => {
            event.preventDefault();
            this.togglePlayerAppearance();
        });

        const outerRadius = this.tileSize * (this.fovRadiusTiles + this.fovFadeTiles);
        this.fovRay = this.raycaster.createRay({
            origin: { x: this.player.x, y: this.player.y },
            range: outerRadius,
            collisionRange: outerRadius,
            detectionRange: outerRadius,
            ignoreNotIntersectedRays: false
        });

        this.createFovOverlay();
    }

    private addWallBlock(
        physicsWalls: Phaser.Physics.Arcade.StaticGroup,
        x: number,
        y: number,
        column: number,
        row: number,
        walkable: boolean[][]
    ) {
        const wallBlock = this.physics.add.staticImage(x, y, 'wall');
        wallBlock.setDepth(200);
        wallBlock.refreshBody();

        const body = wallBlock.body as Phaser.Physics.Arcade.StaticBody;
        body.checkCollision.left = this.isWalkable(walkable, column - 1, row);
        body.checkCollision.right = this.isWalkable(walkable, column + 1, row);
        body.checkCollision.up = this.isWalkable(walkable, column, row - 1);
        body.checkCollision.down = this.isWalkable(walkable, column, row + 1);

        physicsWalls.add(wallBlock);
        this.raycasterOccluders.push(wallBlock);
    }

    private isWalkable(walkable: boolean[][], column: number, row: number) {
        return (
            row >= 0 &&
            row < this.dungeonRows &&
            column >= 0 &&
            column < this.dungeonColumns &&
            walkable[row][column]
        );
    }

    private buildDungeonLayout() {
        const walkable = Array.from({ length: this.dungeonRows }, () => Array(this.dungeonColumns).fill(false));

        const carveRoom = (left: number, top: number, width: number, height: number) => {
            for (let row = top; row < top + height; row++) {
                for (let column = left; column < left + width; column++) {
                    this.markWalkable(walkable, column, row);
                }
            }
        };

        const carveHorizontalPassage = (left: number, right: number, row: number, height = 3) => {
            const top = row - Math.floor(height / 2);
            for (let passageRow = top; passageRow < top + height; passageRow++) {
                for (let column = left; column <= right; column++) {
                    this.markWalkable(walkable, column, passageRow);
                }
            }
        };

        const carveVerticalPassage = (column: number, top: number, bottom: number, width = 3) => {
            const left = column - Math.floor(width / 2);
            for (let passageColumn = left; passageColumn < left + width; passageColumn++) {
                for (let row = top; row <= bottom; row++) {
                    this.markWalkable(walkable, passageColumn, row);
                }
            }
        };

        carveRoom(17, 12, 14, 9);
        carveRoom(4, 13, 7, 6);
        carveRoom(35, 10, 8, 7);
        carveRoom(19, 3, 9, 5);
        carveRoom(18, 24, 10, 6);
        carveRoom(7, 5, 6, 5);
        carveRoom(36, 24, 6, 5);

        carveHorizontalPassage(10, 16, 15);
        carveHorizontalPassage(30, 34, 13);
        carveVerticalPassage(23, 8, 12);
        carveVerticalPassage(23, 20, 24);
        carveHorizontalPassage(12, 18, 7);
        carveVerticalPassage(39, 17, 23);

        return {
            walkable,
            spawnX: 23 * this.tileSize + this.tileSize / 2,
            spawnY: 16 * this.tileSize + this.tileSize / 2
        };
    }

    private markWalkable(walkable: boolean[][], column: number, row: number) {
        if (row < 0 || row >= this.dungeonRows || column < 0 || column >= this.dungeonColumns) {
            return;
        }

        walkable[row][column] = true;
    }

    private buildWallCells(walkable: boolean[][]): Set<string> {
        const wallCells = new Set<string>();
        const directions = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1]
        ];

        for (let row = 0; row < this.dungeonRows; row++) {
            for (let column = 0; column < this.dungeonColumns; column++) {
                if (walkable[row][column]) {
                    continue;
                }

                for (const [dx, dy] of directions) {
                    const neighborColumn = column + dx;
                    const neighborRow = row + dy;

                    if (
                        neighborRow >= 0 &&
                        neighborRow < this.dungeonRows &&
                        neighborColumn >= 0 &&
                        neighborColumn < this.dungeonColumns &&
                        walkable[neighborRow][neighborColumn]
                    ) {
                        wallCells.add(`${column},${row}`);
                        break;
                    }
                }
            }
        }

        return wallCells;
    }

    private addObstacle(
        physicsWalls: Phaser.Physics.Arcade.StaticGroup,
        x: number,
        y: number,
        width: number,
        height: number
    ) {
        const obstacle = this.physics.add.staticImage(x, y, 'obstacle');
        obstacle.setDisplaySize(width, height);
        obstacle.refreshBody();
        obstacle.setDepth(200);
        physicsWalls.add(obstacle);
        this.raycasterOccluders.push(obstacle);
    }

    private createFovOverlay() {
        this.fovOverlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 1);
        this.fovOverlay.setOrigin(0, 0);
        this.fovOverlay.setScrollFactor(0);
        this.fovOverlay.setDepth(100);

        const maskTexture = this.textures.createCanvas('fov-mask', this.scale.width, this.scale.height);

        if (!maskTexture) {
            throw new Error('Unable to create the field-of-view mask texture.');
        }

        this.fovMaskTexture = maskTexture;
        this.fovMaskImage = this.add.image(0, 0, 'fov-mask');
        this.fovMaskImage.setOrigin(0, 0);
        this.fovMaskImage.setScrollFactor(0);
        this.fovMaskImage.setVisible(false);

        this.fovOverlay.setMask(new Phaser.Display.Masks.BitmapMask(this, this.fovMaskImage));
        this.redrawFovMask();
    }

    private redrawFovMask() {
        const context = this.fovMaskTexture.getContext();
        const width = this.scale.width;
        const height = this.scale.height;
        const camera = this.cameras.main;
        const originX = this.player.x + this.fovOffsetX;
        const originY = this.player.y + this.fovOffsetY;
        const centerX = originX - camera.scrollX;
        const centerY = originY - camera.scrollY;
        const tileSize = this.tileSize;
        const outerRadius = tileSize * (this.fovRadiusTiles + this.fovFadeTiles);
        const innerRadius = tileSize * this.fovRadiusTiles;
        this.fovRay.setRay(originX, originY, 0, outerRadius);
        this.raycaster.update();
        const intersections = this.fovRay.castCircle({ objects: this.raycasterOccluders });
        const visibilityPolygon = intersections
            .map((point: Phaser.Math.Vector2) => new Phaser.Math.Vector2(point.x - camera.scrollX, point.y - camera.scrollY))
            .sort((left: Phaser.Math.Vector2, right: Phaser.Math.Vector2) => Math.atan2(left.y - centerY, left.x - centerX) - Math.atan2(right.y - centerY, right.x - centerX));

        context.clearRect(0, 0, width, height);
        context.fillStyle = 'rgba(255, 255, 255, 1)';
        context.fillRect(0, 0, width, height);

        if (visibilityPolygon.length < 3) {
            this.fovMaskTexture.refresh();
            return;
        }

        context.save();
        context.beginPath();
        context.moveTo(visibilityPolygon[0].x, visibilityPolygon[0].y);

        for (let i = 1; i < visibilityPolygon.length; i++) {
            context.lineTo(visibilityPolygon[i].x, visibilityPolygon[i].y);
        }

        context.closePath();
        context.clip();
        context.globalCompositeOperation = 'destination-out';

        const radialGradient = context.createRadialGradient(
            centerX,
            centerY,
            0,
            centerX,
            centerY,
            outerRadius
        );

        radialGradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
        radialGradient.addColorStop(innerRadius / outerRadius, 'rgba(0, 0, 0, 0.75)');
        radialGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        context.fillStyle = radialGradient;
        context.fillRect(0, 0, width, height);
        context.restore();
        this.lastFovCenterX = centerX;
        this.lastFovCenterY = centerY;
        this.fovMaskTexture.refresh();
    }

    update(_time: number, delta: number) {
        if (!this.player.body) return;

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
            if (this.playerAppearance === 'circle') {
                this.targetRotation = Math.atan2(movementVector.y, movementVector.x) + Math.PI / 2;
                const diff = Phaser.Math.Angle.Wrap(this.targetRotation - this.player.rotation);
                const rotationSpeed = 0.01 * delta;

                if (Math.abs(diff) < rotationSpeed) {
                    this.player.rotation = this.targetRotation;
                } else {
                    this.player.rotation += Math.sign(diff) * rotationSpeed;
                }
            }



            this.player.setVelocity(movementVector.x, movementVector.y);
            const direction = this.getDirectionFromMovement(movementVector);

            if (direction !== this.currentFacingDirection) {
                this.currentFacingDirection = direction;
            }

            if (this.playerAppearance === 'franciscan') {
                this.player.anims.play(this.getWalkAnimationKey(direction), true);
            }
        } else {
            this.player.setVelocity(0, 0);
            if (this.playerAppearance === 'franciscan') {
                this.player.anims.stop();
                this.player.setFrame(this.getIdleFrameIndex(this.currentFacingDirection));
            }
        }

        const targetOffsetX = movementVector.lengthSq() > 0 ? (movementVector.x / this.movementSpeed) * this.fovOffsetMax : 0;
        const targetOffsetY = movementVector.lengthSq() > 0 ? (movementVector.y / this.movementSpeed) * this.fovOffsetMax : 0;
        this.fovOffsetX += (targetOffsetX - this.fovOffsetX) * this.fovOffsetLerp;
        this.fovOffsetY += (targetOffsetY - this.fovOffsetY) * this.fovOffsetLerp;

        this.fovRefreshAccumulator += delta;

        const camera = this.cameras.main;
        const currentFovCenterX = this.player.x - camera.scrollX;
        const currentFovCenterY = this.player.y - camera.scrollY;
        const movedEnough =
            Math.abs(currentFovCenterX - this.lastFovCenterX) > 0.25 ||
            Math.abs(currentFovCenterY - this.lastFovCenterY) > 0.25;

        if (!movedEnough && this.fovRefreshAccumulator < this.fovRefreshMs) {
            return;
        }

        this.fovRefreshAccumulator = 0;
        this.redrawFovMask();
    }

    private createPlayerAnimations() {
        for (const [index, direction] of playerDirections.entries()) {
            this.anims.create({
                key: `player_idle_${direction}`,
                frames: [{ key: 'franciscan_idle', frame: index }],
                frameRate: 1
            });

            this.anims.create({
                key: `player_walk_${direction}`,
                frames: [0, 1, 2, 3].map(row => ({
                    key: 'franciscan_walk',
                    frame: row * 8 + index
                })),
                frameRate: 8,
                repeat: -1
            });
        }
    }

    private applyPlayerAppearance() {
        if (this.playerAppearance === 'circle') {
            this.player.anims.stop();
            this.player.setTexture('player');
            this.player.setFrame(0);
            this.player.setCircle(14);
            this.player.body?.setOffset(2, 2);
            return;
        }

        this.player.setTexture('franciscan_idle', this.getIdleFrameIndex(this.currentFacingDirection));
        this.player.setFrame(this.getIdleFrameIndex(this.currentFacingDirection));
        this.player.body?.setCircle(0);
        this.player.body?.setSize(32, 32, true);
    }

    private togglePlayerAppearance() {
        this.playerAppearance = this.playerAppearance === 'circle' ? 'franciscan' : 'circle';
        this.applyPlayerAppearance();
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
                return 'south_east';
            }

            if (movementVector.x > 0 && movementVector.y < 0) {
                return 'north_east';
            }

            if (movementVector.x < 0 && movementVector.y > 0) {
                return 'south_west';
            }

            return 'north_west';
        }

        if (horizontal > vertical) {
            return movementVector.x > 0 ? 'east' : 'west';
        }

        if (vertical > horizontal) {
            return movementVector.y > 0 ? 'south' : 'north';
        }

        return movementVector.x > 0 ? 'east' : 'west';
    }
}


