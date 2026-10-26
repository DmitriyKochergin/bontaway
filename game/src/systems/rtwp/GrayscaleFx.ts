import Phaser from "phaser";

const TRANSITION_DURATION_MS = 300;

type PauseEffect = { type: "dark"; brightness: number } | { type: "grayscale"; strength: number };

export const PAUSE_EFFECTS: readonly PauseEffect[] = [
  { type: "dark", brightness: 1 },
  { type: "grayscale", strength: 0 }
];

export class GrayscaleFx {
  private readonly state = { amount: 0 };
  private effect?: Phaser.FX.ColorMatrix;
  private transition?: Phaser.Tweens.Tween;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly camera: Phaser.Cameras.Scene2D.Camera
  ) {}

  setPaused(paused: boolean): void {
    const targetAmount = paused ? 1 : 0;

    this.transition?.stop();
    this.transition = undefined;

    if (!this.effect && (paused || this.state.amount > 0)) {
      this.effect = this.camera.postFX.addColorMatrix();
      this.applyEffect();
    }

    if (this.state.amount === targetAmount) {
      if (!paused) {
        this.removeEffect();
      }
      return;
    }

    this.transition = this.scene.tweens.add({
      targets: this.state,
      amount: targetAmount,
      duration: TRANSITION_DURATION_MS,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        this.applyEffect();
      },
      onComplete: () => {
        this.transition = undefined;

        if (!paused) {
          this.removeEffect();
        }
      }
    });
  }

  destroy(): void {
    this.transition?.stop();
    this.transition = undefined;
    this.removeEffect();
  }

  private removeEffect(): void {
    const effect = this.effect;
    if (!effect) {
      return;
    }

    const pipeline = this.camera.postPipelines.find(candidate => (candidate.controller as unknown) === effect);
    if (pipeline) {
      this.camera.removePostPipeline(pipeline);
    }
    this.effect = undefined;
  }

  private applyEffect(): void {
    if (!this.effect) {
      return;
    }

    this.effect.reset();
    for (const pauseEffect of PAUSE_EFFECTS) {
      if (pauseEffect.type === "dark") {
        this.effect.brightness(1 - (1 - pauseEffect.brightness) * this.state.amount, true);
        continue;
      }

      this.effect.grayscale(pauseEffect.strength * this.state.amount, true);
    }
  }
}
