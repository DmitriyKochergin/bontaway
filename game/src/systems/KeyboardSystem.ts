import Phaser from "phaser";
import { type Player } from "../entities/Player";

export class KeyboardSystem {
  private windowKeyDownListener?: (event: KeyboardEvent) => void;
  private windowKeyUpListener?: (event: KeyboardEvent) => void;
  private windowBlurListener?: () => void;
  private activePhysicalKeys = new Set<string>();

  constructor(scene: Phaser.Scene) {
    this.registerPhysicalKeyListeners(scene);
  }

  private registerPhysicalKeyListeners(scene: Phaser.Scene) {
    this.windowKeyDownListener = (event: KeyboardEvent) => {
      this.activePhysicalKeys.add(event.code);
      this.activePhysicalKeys.add(event.key.toUpperCase());
    };

    this.windowKeyUpListener = (event: KeyboardEvent) => {
      this.activePhysicalKeys.delete(event.code);
      this.activePhysicalKeys.delete(event.key.toUpperCase());
    };

    this.windowBlurListener = () => {
      this.activePhysicalKeys.clear();
    };

    window.addEventListener("keydown", this.windowKeyDownListener);
    window.addEventListener("keyup", this.windowKeyUpListener);
    window.addEventListener("blur", this.windowBlurListener);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  public getActiveKeys(): Set<string> {
    return this.activePhysicalKeys;
  }

  public syncPlayerKeys(player: Player) {
    player.syncKeys(this.activePhysicalKeys);
  }

  public destroy() {
    if (this.windowKeyDownListener) {
      window.removeEventListener("keydown", this.windowKeyDownListener);
      this.windowKeyDownListener = undefined;
    }
    if (this.windowKeyUpListener) {
      window.removeEventListener("keyup", this.windowKeyUpListener);
      this.windowKeyUpListener = undefined;
    }
    if (this.windowBlurListener) {
      window.removeEventListener("blur", this.windowBlurListener);
      this.windowBlurListener = undefined;
    }
    this.activePhysicalKeys.clear();
  }
}
