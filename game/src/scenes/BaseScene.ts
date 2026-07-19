import Phaser from "phaser";
import { AudioSystem, type MusicStyle } from "../systems/AudioSystem";

export abstract class BaseScene extends Phaser.Scene {
  protected audioSystem?: AudioSystem;

  abstract createScene(): void;

  protected setupShutdownCleanup(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.audioSystem?.destroy();
    });
  }

  protected initAudio(musicKey?: MusicStyle): void {
    this.audioSystem = new AudioSystem(this);
    if (musicKey) {
      this.audioSystem.startMusic(musicKey);
    }
  }
}
