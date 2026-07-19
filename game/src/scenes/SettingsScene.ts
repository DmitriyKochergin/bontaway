import Phaser from "phaser";
import { AudioSystem } from "../systems/AudioSystem";
import { SettingsUI } from "../ui/SettingsUI";

type SettingsSceneData = {
  audioSystem?: AudioSystem | null;
};

export default class SettingsScene extends Phaser.Scene {
  private settingsUI: SettingsUI | null = null;
  private escKey!: Phaser.Input.Keyboard.Key;
  private audioSystem: AudioSystem | null = null;
  private isClosing = false;

  constructor() {
    super("SettingsScene");
  }

  create(data: SettingsSceneData): void {
    this.isClosing = false;
    this.audioSystem = data.audioSystem ?? null;

    this.settingsUI = new SettingsUI(this, this.audioSystem ?? undefined);
    this.settingsUI.onClose = () => this.closeSettings();
    this.settingsUI.show();

    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.settingsUI?.destroy();
      this.settingsUI = null;
    });
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.closeSettings();
    }
  }

  private closeSettings(): void {
    if (this.isClosing) {
      return;
    }

    this.isClosing = true;
    this.settingsUI?.hide();
    this.scene.resume("GameScene");
    this.scene.stop();
  }
}
