import Phaser from "phaser";
import { Player } from "../entities/Player";
import { type PhaserRaycasterPlugin } from "../phaser-raycaster";
import { preloadGameSceneAssets } from "./game/GameSceneAssets";
import { DungeonSystem } from "../systems/DungeonSystem";
import { FieldOfViewSystem } from "../systems/FieldOfViewSystem";
import { ProjectileSystem } from "../systems/ProjectileSystem";
import { createPlayerAnimations } from "../systems/PlayerAnimationSystem";

export default class GameScene extends Phaser.Scene {
  raycasterPlugin!: PhaserRaycasterPlugin;
  private player!: Player;
  private physicsWalls!: Phaser.Physics.Arcade.StaticGroup;
  private raycasterOccluders: Phaser.Physics.Arcade.Image[] = [];
  private readonly tileSize = 32;
  private readonly dungeonColumns = 96;
  private readonly dungeonRows = 64;
  private dungeonLayoutSystem!: DungeonSystem;
  private projectileSystem!: ProjectileSystem;
  private fieldOfViewSystem!: FieldOfViewSystem;

  constructor() {
    super("MainScene");
    void this.preload;
    void this.create;
  }

  preload() {
    preloadGameSceneAssets(this);
  }

  create() {
    this.cameras.main.setBackgroundColor("#000000");
    this.lights.enable();
    this.lights.setAmbientColor(0x111122);

    this.dungeonLayoutSystem = new DungeonSystem(
      this,
      this.tileSize,
      this.dungeonColumns,
      this.dungeonRows
    );

    const dungeon = this.dungeonLayoutSystem.createLayout();
    const mapWidth = this.dungeonColumns * this.tileSize;
    const mapHeight = this.dungeonRows * this.tileSize;
    this.physics.world.setBounds(0, 0, mapWidth, mapHeight);

    const geometry = this.dungeonLayoutSystem.createDungeonGeometry(dungeon);
    this.physicsWalls = geometry.wallLayer;
    this.raycasterOccluders = geometry.raycasterOccluders;

    this.player = new Player(this, dungeon.spawnX, dungeon.spawnY);
    this.physics.add.collider(this.player, this.physicsWalls);

    createPlayerAnimations(this);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    this.projectileSystem = new ProjectileSystem(this, this.player, this.physicsWalls);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.projectileSystem.castFireball(pointer.worldX, pointer.worldY);
    });

    this.fieldOfViewSystem = new FieldOfViewSystem(
      this,
      this.player,
      this.raycasterPlugin,
      this.raycasterOccluders,
      this.projectileSystem,
      this.tileSize
    );
    this.fieldOfViewSystem.create();
  }

  update(_time: number, delta: number) {
    if (!this.player || !this.player.body) {
      return;
    }

    this.player.update(_time, delta);
    this.fieldOfViewSystem.update(delta);
  }

  shutdown(): void {
    this.fieldOfViewSystem?.destroy();
    this.projectileSystem?.destroy();
    this.input.off("pointerdown");
  }
}
