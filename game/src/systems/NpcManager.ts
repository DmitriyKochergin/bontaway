import type Phaser from "phaser";
import { NPC } from "../entities/NPC";
import { getLevelDefinition } from "../levels";
import type { DungeonSystem } from "./DungeonSystem";
import type { FieldOfViewSystem } from "./FieldOfViewSystem";

const NPC_CULLING_MARGIN = 160;

export class NpcManager {
  private npcs: NPC[] = [];
  private npcGroup?: Phaser.Physics.Arcade.StaticGroup;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly dungeonSystem: DungeonSystem,
    private readonly fovSystem: FieldOfViewSystem,
    private readonly levelId: string
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
        style
      );
      npc.setMask(this.fovSystem.getNpcVisibilityMask());
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
    }
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
}
