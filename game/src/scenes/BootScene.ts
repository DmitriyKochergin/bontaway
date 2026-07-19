import Phaser from "phaser";

/**
 * Boot scene.
 * Builds shared textures, then hands control to `MainScene` for gameplay orchestration.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#0a0a0a");

    const loadingUi = this.createLoadingUi();
    this.queueFireballAudio();

    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => {
      this.updateLoadingUi(loadingUi, progress);
    });

    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.buildSharedTextures();
      loadingUi.container.destroy();
      this.scene.start("MainScene");
    });

    this.load.start();
  }

  private queueFireballAudio(): void {
    this.load.audio("fireball_cast", "assets/sound/fireball/freesound_community-short-fireball-woosh-6146.mp3");
    this.load.audio(
      "fireball_hit",
      "assets/sound/fireball/cartoon-music-game-sfx-fireball-explosion-impact-2-568074.mp3"
    );
  }

  private buildSharedTextures(): void {
    this.createFloorTexture();
    this.createWallTexture();
    this.createPlayerTexture();
    this.createObstacleTexture();
    this.createFireballTexture();
    this.createGearTexture();
  }

  private createLoadingUi(): {
    container: Phaser.GameObjects.Container;
    barFill: Phaser.GameObjects.Graphics;
    percentText: Phaser.GameObjects.Text;
  } {
    const width = this.scale.width;
    const height = this.scale.height;
    const container = this.add.container(0, 0).setDepth(1000);

    const title = this.add.text(width / 2, height / 2 - 72, "Loading...", {
      fontSize: "20px",
      color: "#ffffff"
    });
    title.setOrigin(0.5, 0.5);

    const barBg = this.add.graphics();
    barBg.fillStyle(0x222222, 0.9);
    barBg.fillRoundedRect(width / 2 - 160, height / 2 - 18, 320, 36, 6);

    const barFill = this.add.graphics();
    barFill.fillStyle(0x8b5cf6, 1);
    barFill.fillRoundedRect(width / 2 - 150, height / 2 - 8, 0, 16, 4);

    const percentText = this.add.text(width / 2, height / 2 + 28, "0%", {
      fontSize: "14px",
      color: "#cfcfcf"
    });
    percentText.setOrigin(0.5, 0.5);

    container.add([title, barBg, barFill, percentText]);

    return { container, barFill, percentText };
  }

  private updateLoadingUi(
    loadingUi: { barFill: Phaser.GameObjects.Graphics; percentText: Phaser.GameObjects.Text },
    progress: number
  ): void {
    const clampedProgress = Phaser.Math.Clamp(progress, 0, 1);
    const width = 300 * clampedProgress;

    loadingUi.barFill.clear();
    loadingUi.barFill.fillStyle(0x8b5cf6, 1);
    loadingUi.barFill.fillRoundedRect(this.scale.width / 2 - 150, this.scale.height / 2 - 8, width, 16, 4);
    loadingUi.percentText.setText(`${Math.round(clampedProgress * 100)}%`);
  }

  private createFloorTexture(): void {
    const floor = this.add.graphics();
    floor.fillStyle(0x1a1a1a);
    floor.fillRect(0, 0, 32, 32);
    floor.lineStyle(1, 0x121212);
    floor.strokeRect(0, 0, 32, 32);
    for (let index = 0; index < 5; index++) {
      floor.fillStyle(0x222222, 0.5);
      floor.fillRect(Phaser.Math.Between(2, 25), Phaser.Math.Between(2, 25), 4, 4);
    }
    floor.generateTexture("floor", 32, 32);
    floor.destroy();
  }

  private createWallTexture(): void {
    const wall = this.add.graphics();
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
  }

  private createPlayerTexture(): void {
    const player = this.add.graphics();
    player.fillStyle(0x777777);
    player.fillCircle(16, 16, 14);
    player.fillStyle(0x111111, 0.9);
    player.fillRoundedRect(9, 8, 5, 9, 2.5);
    player.fillRoundedRect(18, 8, 5, 9, 2.5);
    player.generateTexture("player", 32, 32);
    player.destroy();
  }

  private createObstacleTexture(): void {
    const obstacle = this.add.graphics();
    obstacle.fillStyle(0x4a4a4a);
    obstacle.fillRoundedRect(0, 0, 48, 48, 8);
    obstacle.lineStyle(2, 0x1b1b1b);
    obstacle.strokeRoundedRect(0, 0, 48, 48, 8);
    obstacle.fillStyle(0x2f2f2f, 0.45);
    obstacle.fillCircle(16, 16, 5);
    obstacle.fillCircle(34, 31, 4);
    obstacle.generateTexture("obstacle", 48, 48);
    obstacle.destroy();
  }

  private createFireballTexture(): void {
    const fireball = this.add.graphics();
    fireball.fillStyle(0xff5500);
    fireball.fillCircle(8, 8, 8);
    fireball.generateTexture("fireball", 16, 16);
    fireball.destroy();
  }

  private createGearTexture(): void {
    const size = 32;
    const half = size / 2;
    const gear = this.add.graphics();

    gear.fillStyle(0x1a1a1a, 1);
    gear.lineStyle(2, 0xff6600, 1);

    const teethCount = 8;
    const outerRadius = 14;
    const innerRadius = 9;
    const holeRadius = 4;

    gear.beginPath();
    for (let i = 0; i < teethCount * 2; i++) {
      const angle = (i * Math.PI) / teethCount;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const x = half + Math.cos(angle) * radius;
      const y = half + Math.sin(angle) * radius;
      if (i === 0) {
        gear.moveTo(x, y);
      } else {
        gear.lineTo(x, y);
      }
    }
    gear.closePath();
    gear.fillPath();
    gear.strokePath();

    gear.fillStyle(0x0a0a0a, 1);
    gear.beginPath();
    gear.arc(half, half, holeRadius, 0, Math.PI * 2);
    gear.closePath();
    gear.fillPath();
    gear.strokePath();

    gear.generateTexture("gear", size, size);
    gear.destroy();
  }
}
