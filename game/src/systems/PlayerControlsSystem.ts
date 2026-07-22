import Phaser from "phaser";
import { type Player } from "../entities/Player";
import { PlayerKeysSyncSystem } from "./PlayerKeysSyncSystem";
import { MobileControlsSystem } from "./MobileControlsSystem";

type LeftClickHandler = (x: number, y: number) => void;
type RightClickHandler = (x: number, y: number) => void;

export class PlayerControlsSystem {
  private readonly scene: Phaser.Scene;
  private readonly player: Player;
  private readonly leftMouseClickHandler: LeftClickHandler;
  private readonly rightMouseClickHandler: RightClickHandler;
  private readonly keyboardSystem: PlayerKeysSyncSystem;
  private mobileSystem?: MobileControlsSystem;
  private desktopPointerDownListener?: (pointer: Phaser.Input.Pointer) => void;

  constructor(
    scene: Phaser.Scene,
    player: Player,
    leftMouseClickHandler: LeftClickHandler,
    rightMouseClickHandler: RightClickHandler
  ) {
    this.scene = scene;
    this.player = player;
    this.leftMouseClickHandler = leftMouseClickHandler;
    this.rightMouseClickHandler = rightMouseClickHandler;

    this.keyboardSystem = new PlayerKeysSyncSystem(scene);
    this.setupPointerControls();

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  private setupPointerControls() {
    const isMobile =
      !this.scene.sys.game.device.os.desktop ||
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      this.scene.input.addPointer(5);
      this.mobileSystem = new MobileControlsSystem(this.scene, this.player, this.leftMouseClickHandler);
      return;
    }

    this.desktopPointerDownListener = (pointer: Phaser.Input.Pointer) => {
      if (this.scene.scene.isPaused()) {
        return;
      }

      if (pointer.rightButtonDown()) {
        this.rightMouseClickHandler(pointer.worldX, pointer.worldY);
        return;
      }

      if (pointer.leftButtonDown()) {
        this.leftMouseClickHandler(pointer.worldX, pointer.worldY);
      }
    };

    this.scene.input.on("pointerdown", this.desktopPointerDownListener);
  }


  public syncPlayerKeys() {
    this.keyboardSystem.syncPlayerKeys(this.player);
  }

  public destroy() {
    if (this.desktopPointerDownListener) {
      this.scene.input.off("pointerdown", this.desktopPointerDownListener);
      this.desktopPointerDownListener = undefined;
    }

    if (this.mobileSystem) {
      this.mobileSystem.destroy();
      this.mobileSystem = undefined;
    }

    this.keyboardSystem.destroy();
  }
}


