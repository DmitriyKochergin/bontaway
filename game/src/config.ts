import Phaser from "phaser";
import GameScene from "./scenes/GameScene";
import MainScene from "./scenes/MainScene";
import PreloadScene from "./scenes/PreloadScene";
import SettingsScene from "./scenes/SettingsScene";
import PhaserRaycaster from "./types/phaser-raycaster";

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: "game-container",
  backgroundColor: "#1a1a2e",
  pixelArt: true, // disables smoothing, but performance drops
  // antialias: true, // enables smoothing for Canvas/WebGL
  // antialiasGL: true,
  render: {
    maxLights: 100
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 0, x: 0 },
      fps: 120,
      debug: false
    }
  },
  scene: [PreloadScene, MainScene, GameScene, SettingsScene],
  plugins: {
    scene: [
      {
        key: "PhaserRaycaster",
        plugin: PhaserRaycaster,
        mapping: "raycasterPlugin"
      }
    ]
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};
