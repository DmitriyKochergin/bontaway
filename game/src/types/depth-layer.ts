/** Stable render-order layers shared by gameplay entities, effects, and HUD elements. */
export enum DepthLayer {
  // World geometry and visibility.
  Floor = 0,
  FovOverlay = 100,
  Walls = 200,

  // Torch components.
  TorchBase = 208,
  TorchCore = 212,
  TorchFlame = 214,
  TorchEmbers = 215,

  // Projectile trails.
  FireballTrail = 240,
  RayTrail = 246,
  SphereTrail = 248,

  // Projectile bodies and impact effects.
  SphereLightning = 249,
  FireballProjectile = 250,
  SphereProjectile = 253,
  RayProjectile = 255,
  ExplosionRing = 259,
  ExplosionFlash = 260,
  ExplosionParticles = 261,

  // Characters and dialogue.
  Npc = 270,
  RemotePlayer = 299,
  Player = 300,
  SpeechBubble = 350,

  // Gameplay HUD and touch controls.
  Hud = 400,
  MobileJoystickBase = 600,
  MobileJoystickThumb = 601,

  // Modal and editor overlays.
  SettingsOverlay = 990,
  Modal = 1000,
  EditorPanel = 1200,
  EditorControl = 1201
}
