import Phaser from "phaser";

export function preloadGameSceneAssets(scene: Phaser.Scene): void {
  const floor = scene.add.graphics();
  floor.fillStyle(0x1a1a1a);
  floor.fillRect(0, 0, 32, 32);
  floor.lineStyle(1, 0x121212);
  floor.strokeRect(0, 0, 32, 32);
  for (let i = 0; i < 5; i++) {
    floor.fillStyle(0x222222, 0.5);
    floor.fillRect(Phaser.Math.Between(2, 25), Phaser.Math.Between(2, 25), 4, 4);
  }
  floor.generateTexture("floor", 32, 32);
  floor.destroy();

  const wall = scene.add.graphics();
  wall.fillStyle(0x333333);
  wall.fillRect(0, 0, 32, 32);
  wall.lineStyle(2, 0x111111);
  wall.strokeRect(0, 0, 32, 32);
  wall.lineStyle(1, 0x444444);
  wall.moveTo(0, 0);
  wall.lineTo(32, 0);
  wall.moveTo(0, 0);
  wall.lineTo(0, 32);
  wall.strokePath();
  wall.generateTexture("wall", 32, 32);
  wall.destroy();

  const player = scene.add.graphics();
  player.fillStyle(0x777777);
  player.fillCircle(16, 16, 14);
  player.fillStyle(0x111111, 0.9);
  player.fillRoundedRect(9, 8, 5, 9, 3);
  player.fillRoundedRect(18, 8, 5, 9, 3);
  player.generateTexture("player", 32, 32);
  player.destroy();

  const obstacle = scene.add.graphics();
  obstacle.fillStyle(0x4a4a4a);
  obstacle.fillRoundedRect(0, 0, 48, 48, 8);
  obstacle.lineStyle(2, 0x1b1b1b);
  obstacle.strokeRoundedRect(0, 0, 48, 48, 8);
  obstacle.fillStyle(0x2f2f2f, 0.45);
  obstacle.fillCircle(16, 16, 5);
  obstacle.fillCircle(34, 31, 4);
  obstacle.generateTexture("obstacle", 48, 48);
  obstacle.destroy();

  scene.load.spritesheet("franciscan_idle", "assets/characters/franciscan_idle.png", {
    frameWidth: 32,
    frameHeight: 32,
  });
  scene.load.spritesheet("franciscan_walk", "assets/characters/franciscan_walk.png", {
    frameWidth: 32,
    frameHeight: 32,
  });

  const fireball = scene.add.graphics();
  fireball.fillStyle(0xff5500);
  fireball.fillCircle(8, 8, 8);
  fireball.generateTexture("fireball", 16, 16);
  fireball.destroy();
}

