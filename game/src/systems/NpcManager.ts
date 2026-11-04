import Phaser from "phaser";
import { NPC } from "../entities/NPC";
import { getLevelDefinition } from "../levels";
import type { DungeonSystem } from "./DungeonSystem";
import type { FieldOfViewSystem } from "./FieldOfViewSystem";

const NPC_CULLING_MARGIN = 160;
const NPC_AGGRO_RADIUS = 640;
const NPC_ATTACK_RANGE = 38;
const NPC_COLLISION_RADIUS = 12;

export class NpcManager {
  private npcs: NPC[] = [];
  private npcGroup?: Phaser.Physics.Arcade.StaticGroup;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly dungeonSystem: DungeonSystem,
    private readonly fovSystem: FieldOfViewSystem,
    private readonly levelId: string,
    private readonly onPlayerDamaged: (damage: number) => void = () => {}
  ) {}

  public spawn(): void {
    this.npcGroup = this.scene.physics.add.staticGroup();
    this.npcs = [];

    const levelDef = getLevelDefinition(this.levelId);
    if (!levelDef?.npcs) {
      return;
    }

    const tileSize = this.dungeonSystem.getTileSize();

    for (const npcDefinition of levelDef.npcs) {
      const x = npcDefinition.tileX * tileSize;
      const y = npcDefinition.tileY * tileSize;
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
          attackCooldownMs: npcDefinition.attackCooldownMs
        }
      );
      npc.setVisibilityMask(this.fovSystem.getNpcVisibilityMask());
      this.npcGroup.add(npc);
      this.npcs.push(npc);
    }
  }

  public update(playerX: number, playerY: number, currentTime: number, delta: number): void {
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
    this.npcGroup?.destroy(true);
    this.npcGroup = undefined;
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

      if (this.canOccupy(nextX, npc.y)) {
        npc.moveTo(nextX, npc.y);
      }
      if (this.canOccupy(npc.x, nextY)) {
        npc.moveTo(npc.x, nextY);
      }
    }

    if (Phaser.Math.Distance.Between(npc.x, npc.y, playerX, playerY) <= NPC_ATTACK_RANGE) {
      const damage = npc.tryContactAttack(currentTime);
      if (damage > 0) {
        this.onPlayerDamaged(damage);
      }
    }
  }

  private canOccupy(worldX: number, worldY: number): boolean {
    const tileSize = this.dungeonSystem.getTileSize();
    const edgeOffsets = [-NPC_COLLISION_RADIUS, NPC_COLLISION_RADIUS];
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
