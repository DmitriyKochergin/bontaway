import Phaser from "phaser";
import { AudioSystem } from "../systems/AudioSystem";
import { type HudStyle, SettingsManager } from "../systems/SettingsManager";

interface SliderData {
  container: Phaser.GameObjects.Container;
  track: Phaser.GameObjects.Graphics;
  fill: Phaser.GameObjects.Graphics;
  thumb: Phaser.GameObjects.Ellipse;
  valueText: Phaser.GameObjects.Text;
  getValue: () => number;
  setValue: (value: number) => void;
  value: number;
}

export class SettingsUI {
  private scene: Phaser.Scene;
  private audioSystem: AudioSystem | null = null;
  private panel: Phaser.GameObjects.Container | null = null;
  private overlay: Phaser.GameObjects.Rectangle | null = null;
  private closeTween: Phaser.Tweens.Tween | null = null;
  private panelRestY = 0;
  private isClosing = false;
  private hudStyleButtonRedraw?: () => void;
  public onClose: (() => void) | null = null;

  private sliders: {
    master: SliderData | null;
    music: SliderData | null;
    sfx: SliderData | null;
  } = { master: null, music: null, sfx: null };

  private readonly PANEL_WIDTH = 380;
  private readonly PANEL_HEIGHT = 500;
  private readonly SLIDER_WIDTH = 120;
  private readonly TRACK_X = 0;
  private readonly OVERLAY_DEPTH = 990;
  private readonly PANEL_DEPTH = 1000;

  constructor(
    scene: Phaser.Scene,
    audioSystem?: AudioSystem,
    private onHudStyleChange?: (style: HudStyle) => void
  ) {
    this.scene = scene;
    this.audioSystem = audioSystem || null;
  }

  private updateSliderValues(): void {
    if (!this.sliders.master) return;

    const masterVal = this.audioSystem?.getMasterVolume() ?? SettingsManager.getMasterVolume();
    const musicVal = this.audioSystem?.getMusicVolume() ?? SettingsManager.getMusicVolume();
    const sfxVal = this.audioSystem?.getSFXVolume() ?? SettingsManager.getSFXVolume();

    this.updateSlider(this.sliders.master, masterVal);
    this.updateSlider(this.sliders.music!, musicVal);
    this.updateSlider(this.sliders.sfx!, sfxVal);
  }

  private updateSlider(slider: SliderData, value: number): void {
    slider.value = value;
    slider.valueText.setText(`${Math.round(value * 100)}%`);

    const fillWidth = Math.max(2, this.SLIDER_WIDTH * value);
    slider.fill.clear();
    slider.fill.fillStyle(this.isStoneStyle() ? 0xc97918 : 0xff6600, 1);
    slider.fill.fillRoundedRect(this.TRACK_X, -4, fillWidth, 8, 2);

    slider.thumb.setPosition(this.TRACK_X + this.SLIDER_WIDTH * value, 0);
    slider.thumb.setFillStyle(this.isStoneStyle() ? 0xc97918 : 0xff6600);
    slider.thumb.setStrokeStyle(2, this.isStoneStyle() ? 0x2d3134 : 0xffffff);
  }

  show(): void {
    this.isClosing = false;

    if (this.panel) {
      this.panel.destroy();
      this.panel = null;
    }
    if (this.overlay) {
      this.overlay.destroy();
      this.overlay = null;
    }

    const cam = this.scene.cameras.main;
    const centerX = cam.scrollX + cam.width / 2;
    const centerY = cam.scrollY + cam.height / 2;
    this.panelRestY = centerY;

    this.overlay = this.scene.add.rectangle(centerX, centerY, cam.width * 3, cam.height * 3, 0x000000, 0);
    this.overlay.setDepth(this.OVERLAY_DEPTH);
    this.overlay.setInteractive();

    this.panel = this.scene.add.container(centerX, centerY + cam.height);
    this.panel.setDepth(this.PANEL_DEPTH);
    this.panel.setAlpha(0);

    this.createPanel();
    this.updateSliderValues();

    this.scene.tweens.add({
      targets: this.overlay,
      fillAlpha: 0.75,
      duration: 150,
      ease: "Sine.easeOut"
    });
    this.scene.tweens.add({
      targets: this.panel,
      y: centerY,
      alpha: 1,
      duration: 200,
      ease: "Back.easeOut"
    });
  }

  private createPanel(): void {
    if (!this.panel) return;

    const halfW = this.PANEL_WIDTH / 2;
    const halfH = this.PANEL_HEIGHT / 2;

    const bg = this.scene.add.graphics();
    this.drawPanelBackground(bg, halfW, halfH);
    this.panel.add(bg);

    if (this.isStoneStyle()) {
      this.drawStoneAccents(halfW, halfH);
    } else {
      this.drawCornerAccents(halfW, halfH);
    }
    this.createHeader(halfW, halfH);
    this.createVolumeSection(halfW, halfH);
    this.createInterfaceSection(halfW, halfH);
    this.createControlsSection(halfW, halfH);
    this.createActionButtons(halfH);
  }

  private isStoneStyle(): boolean {
    return false;
  }

  private drawPanelBackground(background: Phaser.GameObjects.Graphics, halfW: number, halfH: number): void {
    if (!this.isStoneStyle()) {
      background.fillStyle(0x0a0a0a, 0.95);
      background.fillRoundedRect(-halfW, -halfH, this.PANEL_WIDTH, this.PANEL_HEIGHT, 8);
      background.lineStyle(1, 0x444444, 0.8);
      background.strokeRoundedRect(-halfW, -halfH, this.PANEL_WIDTH, this.PANEL_HEIGHT, 8);
      return;
    }

    background.fillStyle(0x1c1d1f, 0.98);
    background.fillRoundedRect(-halfW, -halfH, this.PANEL_WIDTH, this.PANEL_HEIGHT, 8);
    for (let index = 1; index < 6; index++) {
      const y = -halfH + (this.PANEL_HEIGHT / 6) * index;
      background.lineStyle(2, 0x121314, 0.65);
      background.lineBetween(-halfW + 4, y, halfW - 4, y);
    }
    background.lineStyle(2, 0x73787c, 0.85);
    background.lineBetween(-halfW + 4, -halfH + 2, halfW - 4, -halfH + 2);
    background.lineBetween(-halfW + 2, -halfH + 4, -halfW + 2, halfH - 4);
    background.lineStyle(3, 0x0c0d0e, 0.95);
    background.lineBetween(-halfW + 2, halfH - 2, halfW - 2, halfH - 2);
    background.lineBetween(halfW - 2, -halfH + 4, halfW - 2, halfH - 2);
  }

  private drawStoneAccents(halfW: number, halfH: number): void {
    if (!this.panel) return;

    const accents = this.scene.add.graphics();
    accents.lineStyle(1, 0x090a0c, 0.9);
    accents.lineBetween(-halfW + 18, -halfH + 2, -halfW + 12, -halfH + 20);
    accents.lineBetween(halfW - 18, halfH - 2, halfW - 12, halfH - 20);
    accents.lineStyle(1, 0x6e7275, 0.4);
    accents.lineBetween(-halfW + 19, -halfH + 2, -halfW + 13, -halfH + 20);
    accents.lineBetween(halfW - 17, halfH - 2, halfW - 11, halfH - 20);
    this.panel.add(accents);
  }

  private drawCornerAccents(halfW: number, halfH: number): void {
    if (!this.panel) return;

    const corners = this.scene.add.graphics();
    corners.lineStyle(2, 0xff6600, 0.9);
    const cornerSize = 14;

    corners.beginPath();
    corners.moveTo(-halfW, -halfH + cornerSize);
    corners.lineTo(-halfW, -halfH);
    corners.lineTo(-halfW + cornerSize, -halfH);
    corners.strokePath();

    corners.beginPath();
    corners.moveTo(halfW - cornerSize, -halfH);
    corners.lineTo(halfW, -halfH);
    corners.lineTo(halfW, -halfH + cornerSize);
    corners.strokePath();

    corners.beginPath();
    corners.moveTo(-halfW, halfH - cornerSize);
    corners.lineTo(-halfW, halfH);
    corners.lineTo(-halfW + cornerSize, halfH);
    corners.strokePath();

    corners.beginPath();
    corners.moveTo(halfW - cornerSize, halfH);
    corners.lineTo(halfW, halfH);
    corners.lineTo(halfW, halfH - cornerSize);
    corners.strokePath();

    this.panel.add(corners);
  }

  private createHeader(halfW: number, halfH: number): void {
    if (!this.panel) return;

    const headerBg = this.scene.add.graphics();
    headerBg.fillStyle(this.isStoneStyle() ? 0x2d3134 : 0x1a1a1a, this.isStoneStyle() ? 0.95 : 0.8);
    headerBg.fillRoundedRect(-halfW + 15, -halfH + 15, this.PANEL_WIDTH - 30, 40, this.isStoneStyle() ? 3 : 0);
    if (this.isStoneStyle()) {
      headerBg.lineStyle(1, 0x73787c, 0.7);
      headerBg.strokeRoundedRect(-halfW + 15, -halfH + 15, this.PANEL_WIDTH - 30, 40, 3);
    }
    this.panel.add(headerBg);

    const accent = this.scene.add.text(-halfW + 25, -halfH + 35, this.isStoneStyle() ? "❖" : "◆", {
      fontSize: "14px",
      color: this.isStoneStyle() ? "#ffbb33" : "#ff6600"
    });
    accent.setOrigin(0, 0.5);
    this.panel.add(accent);

    const title = this.scene.add.text(-halfW + 45, -halfH + 35, "SETTINGS", {
      fontSize: "18px",
      fontFamily: "Cinzel, Georgia, serif",
      color: this.isStoneStyle() ? "#ffd59a" : "#ffffff"
    });
    title.setOrigin(0, 0.5);
    this.panel.add(title);

    const closeBtn = this.scene.add.text(halfW - 30, -halfH + 35, "✕", {
      fontSize: "16px",
      fontFamily: "Roboto Mono, Courier New, monospace",
      color: this.isStoneStyle() ? "#a8a8a8" : "#666666"
    });
    closeBtn.setOrigin(0.5, 0.5);
    closeBtn.setInteractive({ useHandCursor: true });
    closeBtn.on("pointerover", () => closeBtn.setColor("#ff4444"));
    closeBtn.on("pointerout", () => closeBtn.setColor(this.isStoneStyle() ? "#a8a8a8" : "#666666"));
    closeBtn.on("pointerdown", (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Event) => {
      this.close();
      event.stopPropagation();
    });
    this.panel.add(closeBtn);
  }

  private createVolumeSection(halfW: number, halfH: number): void {
    if (!this.panel) return;

    const sectionY = -halfH + 75;

    const label = this.scene.add.text(-halfW + 25, sectionY, "VOLUME", {
      fontSize: "12px",
      fontFamily: "Cinzel, Georgia, serif",
      color: this.isStoneStyle() ? "#c4b08a" : "#888888"
    });
    label.setOrigin(0, 0.5);
    this.panel.add(label);

    const divider = this.scene.add.graphics();
    divider.lineStyle(1, this.isStoneStyle() ? 0x5a5145 : 0x333333, 0.8);
    divider.lineBetween(-halfW + 80, sectionY, halfW - 25, sectionY);
    this.panel.add(divider);

    this.sliders.master = this.createSlider(
      "Master",
      sectionY + 35,
      halfW,
      () => this.audioSystem?.getMasterVolume() ?? SettingsManager.getMasterVolume(),
      (value: number) => this.audioSystem?.setMasterVolume(value)
    );

    this.sliders.music = this.createSlider(
      "Music",
      sectionY + 70,
      halfW,
      () => this.audioSystem?.getMusicVolume() ?? SettingsManager.getMusicVolume(),
      (value: number) => this.audioSystem?.setMusicVolume(value)
    );

    this.sliders.sfx = this.createSlider(
      "SFX",
      sectionY + 105,
      halfW,
      () => this.audioSystem?.getSFXVolume() ?? SettingsManager.getSFXVolume(),
      (value: number) => {
        this.audioSystem?.setSFXVolume(value);
        this.audioSystem?.play("sfx_pickup", 0.5);
      }
    );
  }

  private createSlider(
    label: string,
    y: number,
    halfW: number,
    getValue: () => number,
    setValue: (value: number) => void
  ): SliderData {
    if (!this.panel) throw new Error("Panel not initialized");

    const container = this.scene.add.container(0, y);
    const initialValue = getValue();

    const labelText = this.scene.add.text(-halfW + 25, 0, label, {
      fontSize: "13px",
      fontFamily: "Roboto Mono, Courier New, monospace",
      color: this.isStoneStyle() ? "#d5c7aa" : "#cccccc"
    });
    labelText.setOrigin(0, 0.5);
    container.add(labelText);

    const track = this.scene.add.graphics();
    track.fillStyle(this.isStoneStyle() ? 0x101113 : 0x1a1a1a, 1);
    track.fillRoundedRect(this.TRACK_X, -4, this.SLIDER_WIDTH, 8, 2);
    track.lineStyle(1, this.isStoneStyle() ? 0x5a5145 : 0x333333, 1);
    track.strokeRoundedRect(this.TRACK_X, -4, this.SLIDER_WIDTH, 8, 2);
    container.add(track);

    const fillWidth = Math.max(2, this.SLIDER_WIDTH * initialValue);
    const fill = this.scene.add.graphics();
    fill.fillStyle(this.isStoneStyle() ? 0xc97918 : 0xff6600, 1);
    fill.fillRoundedRect(this.TRACK_X, -4, fillWidth, 8, 2);
    container.add(fill);

    const thumb = this.scene.add.ellipse(
      this.TRACK_X + this.SLIDER_WIDTH * initialValue,
      0,
      14,
      14,
      this.isStoneStyle() ? 0xc97918 : 0xff6600
    );
    thumb.setStrokeStyle(2, this.isStoneStyle() ? 0x2d3134 : 0xffffff);
    container.add(thumb);

    const valueText = this.scene.add.text(halfW - 30, 0, `${Math.round(initialValue * 100)}%`, {
      fontSize: "11px",
      fontFamily: "Roboto Mono, Courier New, monospace",
      color: this.isStoneStyle() ? "#c4b08a" : "#888888"
    });
    valueText.setOrigin(1, 0.5);
    container.add(valueText);

    const hitArea = this.scene.add.rectangle(
      this.TRACK_X + this.SLIDER_WIDTH / 2,
      0,
      this.SLIDER_WIDTH + 20,
      24,
      0xffffff,
      0
    );
    hitArea.setInteractive({ useHandCursor: true, draggable: true });
    container.add(hitArea);

    const sliderData: SliderData = {
      container,
      track,
      fill,
      thumb,
      valueText,
      getValue,
      setValue,
      value: initialValue
    };

    hitArea.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const localX = pointer.worldX - (this.panel!.x + this.TRACK_X);
      const newValue = Phaser.Math.Clamp(localX / this.SLIDER_WIDTH, 0, 1);
      this.updateSlider(sliderData, newValue);
      setValue(newValue);
    });

    hitArea.on("drag", (pointer: Phaser.Input.Pointer) => {
      const localX = pointer.worldX - (this.panel!.x + this.TRACK_X);
      const newValue = Phaser.Math.Clamp(localX / this.SLIDER_WIDTH, 0, 1);
      this.updateSlider(sliderData, newValue);
      setValue(newValue);
    });

    this.panel.add(container);
    return sliderData;
  }

  private createControlsSection(halfW: number, halfH: number): void {
    if (!this.panel) return;

    const sectionY = -halfH + 310;

    const label = this.scene.add.text(-halfW + 25, sectionY, "CONTROLS", {
      fontSize: "12px",
      fontFamily: "Cinzel, Georgia, serif",
      color: this.isStoneStyle() ? "#c4b08a" : "#888888"
    });
    label.setOrigin(0, 0.5);
    this.panel.add(label);

    const divider = this.scene.add.graphics();
    divider.lineStyle(1, this.isStoneStyle() ? 0x5a5145 : 0x333333, 0.8);
    divider.lineBetween(-halfW + 100, sectionY, halfW - 25, sectionY);
    this.panel.add(divider);

    const controls = [
      ["WASD / Arrows", "Move"],
      ["Left Click", "Attack"],
      ["Space", "Pause / Resume"],
      ["E", "Inventory"],
      ["L", "Level Up"],
      ["ESC", "Settings"]
    ];

    const startY = sectionY + 25;
    const rowHeight = 22;

    for (let index = 0; index < controls.length; index++) {
      const [key, action] = controls[index];
      const y = startY + index * rowHeight;

      const keyText = this.scene.add.text(-halfW + 30, y, key, {
        fontSize: "11px",
        fontFamily: "Roboto Mono, Courier New, monospace",
        color: this.isStoneStyle() ? "#d5c7aa" : "#cccccc"
      });
      keyText.setOrigin(0, 0.5);
      this.panel.add(keyText);

      const actionText = this.scene.add.text(halfW - 30, y, action, {
        fontSize: "11px",
        fontFamily: "Roboto Mono, Courier New, monospace",
        color: this.isStoneStyle() ? "#c4b08a" : "#888888"
      });
      actionText.setOrigin(1, 0.5);
      this.panel.add(actionText);
    }
  }

  private createInterfaceSection(halfW: number, halfH: number): void {
    if (!this.panel) return;

    const sectionY = -halfH + 210;
    const label = this.scene.add.text(-halfW + 25, sectionY, "INTERFACE", {
      fontSize: "12px",
      fontFamily: "Cinzel, Georgia, serif",
      color: this.isStoneStyle() ? "#c4b08a" : "#888888"
    });
    label.setOrigin(0, 0.5);
    this.panel.add(label);

    const divider = this.scene.add.graphics();
    divider.lineStyle(1, this.isStoneStyle() ? 0x5a5145 : 0x333333, 0.8);
    divider.lineBetween(-halfW + 100, sectionY, halfW - 25, sectionY);
    this.panel.add(divider);

    const styleLabel = this.scene.add.text(-halfW + 25, sectionY + 35, "HUD STYLE", {
      fontSize: "11px",
      fontFamily: "Roboto Mono, Courier New, monospace",
      color: this.isStoneStyle() ? "#d5c7aa" : "#cccccc"
    });
    styleLabel.setOrigin(0, 0.5);
    this.panel.add(styleLabel);

    const buttons = [
      this.createHudStyleButton("STONE", -35, sectionY + 35, "stone"),
      this.createHudStyleButton("FLAT", 95, sectionY + 35, "flat")
    ];
    this.hudStyleButtonRedraw = () => {
      const activeStyle = SettingsManager.getHudStyle();
      buttons.forEach(({ style, redraw }) => redraw(style === activeStyle));
    };
    this.hudStyleButtonRedraw();
  }

  private createHudStyleButton(
    label: string,
    x: number,
    y: number,
    style: HudStyle
  ): { style: HudStyle; redraw: (isSelected: boolean) => void } {
    if (!this.panel) throw new Error("Panel not initialized");

    const width = 115;
    const height = 26;
    const container = this.scene.add.container(x, y);
    const background = this.scene.add.graphics();
    const text = this.scene.add.text(0, 0, label, {
      fontSize: "10px",
      fontFamily: "Roboto Mono, Courier New, monospace"
    });
    text.setOrigin(0.5, 0.5);

    const redraw = (isSelected: boolean) => {
      background.clear();
      const stoneStyle = this.isStoneStyle();
      background.fillStyle(isSelected ? (stoneStyle ? 0x4a3b28 : 0x3b210d) : stoneStyle ? 0x2d3134 : 0x1a1a1a, 0.95);
      background.fillRoundedRect(-width / 2, -height / 2, width, height, stoneStyle ? 2 : 4);
      background.lineStyle(isSelected ? 2 : 1, isSelected ? (stoneStyle ? 0xffbb33 : 0xff6600) : 0x444444, 0.9);
      background.strokeRoundedRect(-width / 2, -height / 2, width, height, stoneStyle ? 2 : 4);
      text.setColor(isSelected ? (stoneStyle ? "#ffd59a" : "#ffcc88") : stoneStyle ? "#c4b08a" : "#888888");
    };

    const hitArea = this.scene.add.rectangle(0, 0, width, height, 0xffffff, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on("pointerdown", (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Event) => {
      event.stopPropagation();
      if (SettingsManager.getHudStyle() === style) {
        return;
      }

      SettingsManager.setHudStyle(style);
      this.hudStyleButtonRedraw?.();
      this.onHudStyleChange?.(style);
    });

    container.add([background, text, hitArea]);
    this.panel.add(container);
    return { style, redraw };
  }

  private createActionButtons(halfH: number): void {
    const btnWidth = 120;
    const btnHeight = 32;
    const y = halfH - 30;

    this.createPanelButton("RESET", -90, y, btnWidth, btnHeight, 0x4a1a1a, 0x884444, 0x5a2a2a, 0xaa6666, () =>
      this.resetDefaults()
    );

    this.createPanelButton("CLOSE", 90, y, btnWidth, btnHeight, 0x1a1a1a, 0x444444, 0x2a2a2a, 0x666666, () =>
      this.close()
    );
  }

  private createPanelButton(
    label: string,
    x: number,
    y: number,
    width: number,
    height: number,
    normalBg: number,
    normalStroke: number,
    hoverBg: number,
    hoverStroke: number,
    onClick: () => void
  ): void {
    if (!this.panel) return;

    const container = this.scene.add.container(x, y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(normalBg, 0.9);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 4);
    bg.lineStyle(1, normalStroke, 0.6);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 4);
    container.add(bg);

    const corners = this.scene.add.graphics();
    corners.lineStyle(1, 0xff6600, 0.7);
    const cs = 6;
    const hw = width / 2;
    const hh = height / 2;
    corners.beginPath();
    corners.moveTo(-hw, -hh + cs);
    corners.lineTo(-hw, -hh);
    corners.lineTo(-hw + cs, -hh);
    corners.strokePath();
    corners.beginPath();
    corners.moveTo(hw - cs, -hh);
    corners.lineTo(hw, -hh);
    corners.lineTo(hw, -hh + cs);
    corners.strokePath();
    container.add(corners);

    const text = this.scene.add.text(0, 0, label, {
      fontSize: "12px",
      fontFamily: "Roboto Mono, Courier New, monospace",
      color: "#ffffff"
    });
    text.setOrigin(0.5, 0.5);
    container.add(text);

    const hitArea = this.scene.add.rectangle(0, 0, width, height, 0xffffff, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on("pointerover", () => {
      bg.clear();
      bg.fillStyle(hoverBg, 0.9);
      bg.fillRoundedRect(-width / 2, -height / 2, width, height, 4);
      bg.lineStyle(1, hoverStroke, 0.8);
      bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 4);
    });
    hitArea.on("pointerout", () => {
      bg.clear();
      bg.fillStyle(normalBg, 0.9);
      bg.fillRoundedRect(-width / 2, -height / 2, width, height, 4);
      bg.lineStyle(1, normalStroke, 0.6);
      bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 4);
    });
    hitArea.on("pointerdown", () => onClick());
    container.add(hitArea);

    this.panel.add(container);
  }

  private resetDefaults(): void {
    SettingsManager.resetToDefaults();
    const defaults = SettingsManager.get();

    if (this.audioSystem) {
      this.audioSystem.setMasterVolume(defaults.masterVolume);
      this.audioSystem.setMusicVolume(defaults.musicVolume);
      this.audioSystem.setSFXVolume(defaults.sfxVolume);
    }

    this.updateSliderValues();
    this.hudStyleButtonRedraw?.();
    this.onHudStyleChange?.(defaults.hudStyle);
  }

  close(): void {
    if (this.isClosing) {
      return;
    }

    this.isClosing = true;

    if (!this.panel || !this.overlay) {
      this.hide();
      this.onClose?.();
      return;
    }

    this.closeTween?.stop();
    this.scene.tweens.killTweensOf(this.overlay);
    this.scene.tweens.killTweensOf(this.panel);

    const cam = this.scene.cameras.main;
    const panelCloseY = this.panelRestY + cam.height;

    this.scene.tweens.add({
      targets: this.overlay,
      fillAlpha: 0,
      duration: 140,
      ease: "Sine.easeIn"
    });

    this.closeTween = this.scene.tweens.add({
      targets: this.panel,
      y: panelCloseY,
      alpha: 0,
      duration: 180,
      ease: "Back.easeIn",
      onComplete: () => {
        this.closeTween = null;
        this.hide();
        this.onClose?.();
      }
    });
  }

  hide(): void {
    this.closeTween?.stop();
    this.closeTween = null;

    if (this.panel) {
      this.panel.destroy();
      this.panel = null;
    }
    if (this.overlay) {
      this.overlay.destroy();
      this.overlay = null;
    }

    this.sliders = { master: null, music: null, sfx: null };
    this.hudStyleButtonRedraw = undefined;
    this.isClosing = false;
  }

  destroy(): void {
    this.hide();
  }
}
