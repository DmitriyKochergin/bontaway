import Phaser from "phaser";
import { type Player } from "../entities/Player";
import { MobileControlsSystem } from "./MobileControlsSystem";
import { PlayerKeysSyncSystem } from "./PlayerKeysSyncSystem";

type LeftClickHandler = (x: number, y: number) => void;
type RightClickHandler = (x: number, y: number) => void;
type PointerBlockedPredicate = (pointer: Phaser.Input.Pointer) => boolean;

export class PlayerControlsSystem {
  private readonly scene: Phaser.Scene;
  private readonly player: Player;
  private readonly leftMouseClickHandler: LeftClickHandler;
  private readonly rightMouseClickHandler: RightClickHandler;
  private readonly isPointerBlocked?: PointerBlockedPredicate;
  private readonly keyboardSystem: PlayerKeysSyncSystem;
  private mobileSystem?: MobileControlsSystem;
  private desktopPointerDownListener?: (pointer: Phaser.Input.Pointer) => void;

  constructor(
    scene: Phaser.Scene,
    player: Player,
    leftMouseClickHandler: LeftClickHandler,
    rightMouseClickHandler: RightClickHandler,
    isPointerBlocked?: PointerBlockedPredicate
  ) {
    this.scene = scene;
    this.player = player;
    this.leftMouseClickHandler = leftMouseClickHandler;
    this.rightMouseClickHandler = rightMouseClickHandler;
    this.isPointerBlocked = isPointerBlocked;

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

      // Ignore clicks that land on HUD controls (rendered on a sibling scene).
      if (this.isPointerBlocked?.(pointer)) {
        return;
      }

      // Resolve world coords against THIS scene's camera. `pointer.worldX/Y` is shared
      // across scenes and gets overwritten by the top scene's (static) camera, so it
      // would ignore this scene's scroll and misplace the target.
      const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);

      if (pointer.rightButtonDown()) {
        this.rightMouseClickHandler(worldPoint.x, worldPoint.y);
        return;
      }

      if (pointer.leftButtonDown()) {
        this.leftMouseClickHandler(worldPoint.x, worldPoint.y);
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
