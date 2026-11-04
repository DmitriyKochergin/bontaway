import Phaser from "phaser";
import { NPC } from "../entities/NPC";
import { getLevelDefinition } from "../levels";
import type { HostileSpawnConfig, HostileSpawnPoint, Npc } from "../levels";
import type { DungeonSystem } from "./DungeonSystem";
import type { FieldOfViewSystem } from "./FieldOfViewSystem";

const NPC_CULLING_MARGIN = 160;
const NPC_AGGRO_RADIUS = 640;
const NPC_ATTACK_RANGE = 38;
const NPC_COLLISION_RADIUS = 12;
const SPAWN_MIN_PLAYER_DISTANCE = 320;
const SPAWN_MIN_NPC_DISTANCE = 72;

export class NpcManager {
  private npcs: NPC[] = [];
  private npcGroup?: Phaser.Physics.Arcade.StaticGroup;
  private hostileSpawnConfig?: HostileSpawnConfig;
  private hostileSpawnPoints: readonly HostileSpawnPoint[] = [];
  private hostileArchetypes: readonly Npc[] = [];
  private elapsedCombatTime = 0;
  private nextHostileSpawnTime = Number.POSITIVE_INFINITY;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly dungeonSystem: DungeonSystem,
    private readonly fovSystem: FieldOfViewSystem,
    private readonly levelId: string,
    private readonly onPlayerDamaged: (damage: number) => void = () => {},
    private readonly onHostileDetonated: (npc: NPC) => void = () => {}
  ) {}

  public spawn(): void {
    this.npcGroup = this.scene.physics.add.staticGroup();
    this.npcs = [];
    this.elapsedCombatTime = 0;
    this.nextHostileSpawnTime = Number.POSITIVE_INFINITY;

    const levelDef = getLevelDefinition(this.levelId);
    this.hostileSpawnConfig = levelDef?.hostileSpawnConfig;
    this.hostileSpawnPoints = levelDef?.hostileSpawnPoints ?? [];
    this.hostileArchetypes = levelDef?.npcs?.filter(npc => npc.hostile && (npc.maxHealth ?? 0) > 0) ?? [];
    if (this.hostileSpawnConfig) {
      this.nextHostileSpawnTime = Math.max(0, this.hostileSpawnConfig.initialDelayMs ?? 0);
    }

    if (!levelDef?.npcs) {
      return;
    }

    const tileSize = this.dungeonSystem.getTileSize();

    for (const npcDefinition of levelDef.npcs) {
      this.createNpc(npcDefinition, npcDefinition.tileX * tileSize, npcDefinition.tileY * tileSize);
    }
  }

  public update(playerX: number, playerY: number, currentTime: number, delta: number): void {
    this.updateHostileSpawning(playerX, playerY, delta);

    const camera = this.scene.cameras.main;
    const viewportCenterX = camera.worldView.centerX;
    const viewportCenterY = camera.worldView.centerY;
    const viewportDiagonal = Math.hypot(camera.worldView.width, camera.worldView.height) / 2;
    const cullingRadius = viewportDiagonal + NPC_CULLING_MARGIN;
    const cullingRadiusSquared = cullingRadius * cullingRadius;

    for (const npc of this.npcs) {
      if (!npc.active) {
        continue;
      }

      const distanceX = npc.x - viewportCenterX;
      const distanceY = npc.y - viewportCenterY;
      if (distanceX * distanceX + distanceY * distanceY > cullingRadiusSquared) {
        continue;
      }

      npc.update(playerX, playerY, currentTime, delta);
      if (npc.isHostile() && !npc.isDefeated()) {
        this.updateHostileNpc(npc, playerX, playerY, currentTime, delta);
      }
    }
  }

  public getNpcs(): readonly NPC[] {
    return this.npcs;
  }

  public getGroup(): Phaser.Physics.Arcade.StaticGroup {
    if (!this.npcGroup) {
      throw new Error("NPC group is not initialized");
    }

    return this.npcGroup;
  }

  public destroy(): void {
    this.npcs.forEach(npc => {
      npc.destroy();
    });
    this.npcs = [];
    this.hostileSpawnConfig = undefined;
    this.hostileSpawnPoints = [];
    this.hostileArchetypes = [];
    this.nextHostileSpawnTime = Number.POSITIVE_INFINITY;
    this.npcGroup?.destroy(true);
    this.npcGroup = undefined;
  }

  private createNpc(npcDefinition: Npc, x: number, y: number): void {
    const style = {
      bodyColor: npcDefinition.bodyColor,
      eyeColor: npcDefinition.eyeColor,
      eyeSize: npcDefinition.eyeSize,
      eyeSpread: npcDefinition.eyeSpread,
      showBrows: npcDefinition.showBrows
    };

    const npc = new NPC(
      this.scene,
      x,
      y,
      npcDefinition.name,
      npcDefinition.dialogue,
      npcDefinition.emotion,
      npcDefinition.restTarget,
      style,
      {
        hostile: npcDefinition.hostile,
        maxHealth: npcDefinition.maxHealth,
        movementSpeed: npcDefinition.movementSpeed,
        contactDamage: npcDefinition.contactDamage,
        attackCooldownMs: npcDefinition.attackCooldownMs,
        bodyScale: npcDefinition.bodyScale,
        explodesOnContact: npcDefinition.explodesOnContact,
        explosionDamage: npcDefinition.explosionDamage
      }
    );
    npc.setVisibilityMask(this.fovSystem.getNpcVisibilityMask());
    this.npcGroup?.add(npc);
    this.npcs.push(npc);
  }

  private updateHostileSpawning(playerX: number, playerY: number, delta: number): void {
    if (
      !this.hostileSpawnConfig ||
      this.hostileArchetypes.length === 0 ||
      this.hostileSpawnPoints.length === 0
    ) {
      return;
    }

    this.elapsedCombatTime += Math.max(0, delta);
    if (this.elapsedCombatTime < this.nextHostileSpawnTime) {
      return;
    }

    this.nextHostileSpawnTime = this.elapsedCombatTime + this.getHostileSpawnInterval();
    if (this.getActiveHostileCount() >= this.getHostileSpawnCap()) {
      return;
    }

    const spawnPosition = this.findSafeSpawnPosition(playerX, playerY);
    if (!spawnPosition) {
      return;
    }

    const archetypeIndex = Phaser.Math.Between(0, this.hostileArchetypes.length - 1);
    const archetype = this.hostileArchetypes[archetypeIndex];
    this.createNpc(archetype, spawnPosition.x, spawnPosition.y);
  }

  private getHostileSpawnInterval(): number {
    const config = this.hostileSpawnConfig;
    if (!config) {
      return Number.POSITIVE_INFINITY;
    }

    const baseInterval = Math.max(1000, config.baseIntervalMs ?? 12000);
    const minimumInterval = Math.min(baseInterval, Math.max(1000, config.minimumIntervalMs ?? 3500));
    const rampInterval = Math.max(1000, config.intervalRampMs ?? 18000);
    const intervalDecrease = Math.max(0, config.intervalDecreaseMs ?? 1000);
    const pressureIncreases = Math.floor(this.elapsedCombatTime / rampInterval);

    return Math.max(minimumInterval, baseInterval - pressureIncreases * intervalDecrease);
  }

  private getHostileSpawnCap(): number {
    const config = this.hostileSpawnConfig;
    if (!config) {
      return 0;
    }

    const initialCap = Math.max(0, config.initialMaxHostiles ?? this.hostileArchetypes.length);
    const maximumCap = Math.max(initialCap, config.maximumHostiles ?? initialCap);
    const rampInterval = Math.max(1000, config.intervalRampMs ?? 18000);
    const pressureIncreases = Math.floor(this.elapsedCombatTime / rampInterval);

    return Math.min(maximumCap, initialCap + pressureIncreases);
  }

  private getActiveHostileCount(): number {
    return this.npcs.filter(npc => npc.active && npc.isHostile() && !npc.isDefeated()).length;
  }

  private findSafeSpawnPosition(playerX: number, playerY: number): { x: number; y: number } | undefined {
    const tileSize = this.dungeonSystem.getTileSize();
    const pointCount = this.hostileSpawnPoints.length;
    const startingPointIndex = Phaser.Math.Between(0, pointCount - 1);

    for (let pointOffset = 0; pointOffset < pointCount; pointOffset++) {
      const point = this.hostileSpawnPoints[(startingPointIndex + pointOffset) % pointCount];
      const x = point.tileX * tileSize;
      const y = point.tileY * tileSize;

      if (
        Phaser.Math.Distance.Between(x, y, playerX, playerY) < SPAWN_MIN_PLAYER_DISTANCE ||
        !this.canOccupy(x, y)
      ) {
        continue;
      }

      const overlapsHostile = this.npcs.some(
        npc =>
          npc.active &&
          npc.isHostile() &&
          !npc.isDefeated() &&
          Phaser.Math.Distance.Between(x, y, npc.x, npc.y) < SPAWN_MIN_NPC_DISTANCE
      );
      if (!overlapsHostile) {
        return { x, y };
      }
    }

    return undefined;
  }

  private updateHostileNpc(npc: NPC, playerX: number, playerY: number, currentTime: number, delta: number): void {
    const distance = Phaser.Math.Distance.Between(npc.x, npc.y, playerX, playerY);
    if (distance > NPC_AGGRO_RADIUS) {
      return;
    }

    if (distance > NPC_ATTACK_RANGE) {
      const movementDistance = (npc.getMovementSpeed() * delta) / 1000;
      const movementAngle = Phaser.Math.Angle.Between(npc.x, npc.y, playerX, playerY);
      const nextX = npc.x + Math.cos(movementAngle) * movementDistance;
      const nextY = npc.y + Math.sin(movementAngle) * movementDistance;

      if (this.canOccupy(nextX, npc.y, npc.getCollisionRadius())) {
        npc.moveTo(nextX, npc.y);
      }
      if (this.canOccupy(npc.x, nextY, npc.getCollisionRadius())) {
        npc.moveTo(npc.x, nextY);
      }
    }

    if (Phaser.Math.Distance.Between(npc.x, npc.y, playerX, playerY) <= NPC_ATTACK_RANGE) {
      if (npc.isExplosive()) {
        npc.takeDamage(npc.getMaxHealth());
        this.onHostileDetonated(npc);
        return;
      }

      const damage = npc.tryContactAttack(currentTime);
      if (damage > 0) {
        this.onPlayerDamaged(damage);
      }
    }
  }

  private canOccupy(worldX: number, worldY: number, collisionRadius = NPC_COLLISION_RADIUS): boolean {
    const tileSize = this.dungeonSystem.getTileSize();
    const edgeOffsets = [-collisionRadius, collisionRadius];
    return edgeOffsets.every(offsetX =>
      edgeOffsets.every(offsetY =>
        this.dungeonSystem.isWalkable(
          Math.floor((worldX + offsetX) / tileSize),
          Math.floor((worldY + offsetY) / tileSize)
        )
      )
    );
  }
}
