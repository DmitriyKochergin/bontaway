/** Stable render-order layers shared by gameplay entities, effects, and HUD elements. */
export enum DepthLayer {
  // Floor tiles
  Floor = 0,

  // FOV overlay
  FovOverlay = 100,

  // Walls, doors, obstacles
  Walls = 200,

  // Editor selection guides remain above shadows and walls.
  EditorSelection = 220,

  // Torch components.
  TorchBase = 208,
  TorchCore = 212,
  TorchFlame = 214,
  TorchEmbers = 215,

  // Projectile trails, particles, explosions
  FireballTrail = 240,
  RayTrail = 246,
  IcicleTrail = 247,
  SphereTrail = 248,
  SphereLightning = 249,
  FireballProjectile = 250,
  SphereProjectile = 253,
  IcicleProjectile = 254,
  RayProjectile = 255,
  ExplosionRing = 259,
  ExplosionFlash = 260,
  ExplosionParticles = 261,

  // Characters and dialogue.
  Npc = 270,
  ForceShieldRipple = 272,
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
