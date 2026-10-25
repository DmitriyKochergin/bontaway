import Phaser from "phaser";
import { type DungeonSystem } from "./DungeonSystem";

export interface DevOverlayStatsProvider {
  getFovRaycastTimeMs?: () => number;
  getNetworkStats?: () => { peerCount: number; pingMs: number | null };
  getActiveLightsCount?: () => number;
}

export class DevModeOverlay {
  private scene: Phaser.Scene;
  private statsProvider?: DevOverlayStatsProvider;
  private container?: Phaser.GameObjects.Container;
  private statsText?: Phaser.GameObjects.Text;
  private visible = false;
  private readonly hudInset = 16;
  private lastUpdateMs = 0;
  private readonly updateIntervalMs = 120; // Refresh rate throttled to eliminate string allocation churn

  constructor(
    scene: Phaser.Scene,
    _dungeonSystem?: DungeonSystem | DevOverlayStatsProvider,
    statsProvider?: DevOverlayStatsProvider
  ) {
    this.scene = scene;
    if (statsProvider) {
      this.statsProvider = statsProvider;
    } else if (_dungeonSystem && !("getTileSize" in _dungeonSystem)) {
      this.statsProvider = _dungeonSystem as DevOverlayStatsProvider;
    }

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  public setStatsProvider(statsProvider: DevOverlayStatsProvider): void {
    this.statsProvider = statsProvider;
  }

  public toggle(): void {
    if (this.visible) {
      this.hide();
      return;
    }

    this.show();
  }

  public show(): void {
    this.ensureCreated();
    this.visible = true;
    this.container?.setVisible(true);
    this.refreshStats();
  }

  public hide(): void {
    this.visible = false;
    this.container?.setVisible(false);
  }

  public update(): void {
    if (!this.visible || !this.container) {
      return;
    }

    const now = performance.now();
    if (now - this.lastUpdateMs >= this.updateIntervalMs) {
      this.lastUpdateMs = now;
      this.refreshStats();
    }
  }

  public destroy(): void {
    this.visible = false;
    this.container?.destroy(true);
    this.container = undefined;
    this.statsText = undefined;
  }

  private ensureCreated(): void {
    if (this.container) {
      return;
    }

    this.container = this.scene.add.container(this.hudInset, this.hudInset);
    this.container.setDepth(1000);
    this.container.setScrollFactor(0);

    const panelWidth = 244;
    const panelHeight = 152;

    const background = this.scene.add.graphics();
    // Glassy dark panel
    background.fillStyle(0x0a0d14, 0.88);
    background.fillRoundedRect(0, 0, panelWidth, panelHeight, 6);
    // Border
    background.lineStyle(1, 0x27354a, 0.9);
    background.strokeRoundedRect(0, 0, panelWidth, panelHeight, 6);
    // Header divider line
    background.lineStyle(1, 0x1f2937, 0.7);
    background.lineBetween(8, 25, panelWidth - 8, 25);
    this.container.add(background);

    const titleText = this.scene.add.text(10, 7, "⚙ DEV PERFORMANCE", {
      fontSize: "11px",
      fontStyle: "bold",
      fontFamily: "Roboto Mono, Menlo, monospace",
      color: "#ff8800"
    });
    this.container.add(titleText);

    this.statsText = this.scene.add.text(10, 31, this.formatStats(), {
      fontSize: "11px",
      fontFamily: "Roboto Mono, Menlo, monospace",
      color: "#cbd5e1",
      lineSpacing: 4
    });
    this.container.add(this.statsText);
  }

  private refreshStats(): void {
    if (!this.statsText) {
      return;
    }

    this.statsText.setText(this.formatStats());
  }

  private formatStats(): string {
    const loop = this.scene.game.loop;
    const actualFps = Math.round(loop.actualFps);
    const frameTimeMs = loop.delta.toFixed(1);

    const activeObjectsCount = this.scene.children?.list?.length ?? this.scene.children?.length ?? 0;

    const lightsManager = (this.scene as unknown as { lights?: { lights?: unknown[] } }).lights;
    const lightsCount =
      this.statsProvider?.getActiveLightsCount?.() ?? (lightsManager?.lights ? lightsManager.lights.length : 0);

    const fovTime = this.statsProvider?.getFovRaycastTimeMs?.() ?? 0;
    const fovText = fovTime > 0 ? `${fovTime.toFixed(2)} ms` : "0.00 ms";

    const netStats = this.statsProvider?.getNetworkStats?.();
    let netText = "Offline";
    if (netStats) {
      if (netStats.peerCount > 0) {
        netText =
          `${netStats.peerCount} peer${netStats.peerCount > 1 ? "s" : ""} ${netStats.pingMs !== null ? `(${netStats.pingMs} ms)` : ""}`.trim();
      } else {
        netText = "0 peers";
      }
    }

    const physicsWorld = (this.scene as unknown as { physics?: Phaser.Physics.Arcade.ArcadePhysics }).physics?.world;
    const dynamicBodies = physicsWorld?.bodies?.size ?? 0;
    const staticBodies = physicsWorld?.staticBodies?.size ?? 0;
    const totalBodies = dynamicBodies + staticBodies;
    const physicsText = `${totalBodies} (${dynamicBodies} dyn, ${staticBodies} stat)`;

    return [
      `FPS:        ${actualFps.toString().padEnd(3)} (${frameTimeMs} ms)`,
      `Objects:    ${activeObjectsCount}`,
      `Lights:     ${lightsCount}`,
      `FOV Ray:    ${fovText}`,
      `Network:    ${netText}`,
      `Physics:    ${physicsText}`
    ].join("\n");
  }
}
