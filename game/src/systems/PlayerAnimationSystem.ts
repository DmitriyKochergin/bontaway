import Phaser from "phaser";
import { playerDirections } from "../entities/Player";

export function createPlayerAnimations(scene: Phaser.Scene): void {
  for (const [index, direction] of playerDirections.entries()) {
    scene.anims.create({
      key: `player_idle_${direction}`,
      frames: [{ key: "franciscan_idle", frame: index }],
      frameRate: 1,
    });

    scene.anims.create({
      key: `player_walk_${direction}`,
      frames: [0, 1, 2, 3].map((row) => ({
        key: "franciscan_walk",
        frame: row * 8 + index,
      })),
      frameRate: 8,
      repeat: -1,
    });
  }
}

