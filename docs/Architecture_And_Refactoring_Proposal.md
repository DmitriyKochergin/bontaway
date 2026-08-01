# Bontaway — Architecture & Refactoring Proposal

> Status: PROPOSAL. No code changed by this document. It defines findings, a target
> architecture, and an ordered, independently-shippable execution plan.
>
> Audience: human maintainers **and** AI coding agents. Every task lists concrete file
> paths, a rationale, and a "Definition of Done" so work can continue without re-deriving context.

---

## 0. How to use this document

- **Humans:** read §1–§4 for the map and the problems, §5 for the target shape, §11 for the ordered plan.
- **AI agents:** each item in §6 and §11 is a self-contained task. Before starting one, read the cited
  files, honor `AGENTS.md` (Ecological Design, no tutorials/manuals, dark/liminal vibe, RTwP-first,
  object pooling) and the root `global.instructions.md` persona/rules. Keep changes to the smallest
  complete slice. Follow the testing policy in §10.
- **Scope anchor:** all game code lives under `game/` (per `AGENTS.md`). The sibling workspace project
  `dungeon-crawler-now` is reference-only; do not edit it.

---

## 1. Current state snapshot

Phaser 3.83 + TypeScript, bundled with rsbuild, linted/formatted with Biome, deployed to GitHub Pages.
Roughly **5,340 lines** of TypeScript across 27 files. Build is WebGL-forced, Arcade physics, procedural
(code-generated) textures and audio — no art/audio pipeline beyond two fireball `.mp3` files.

### 1.1 Module inventory (by size — size flags refactor pressure)

| File | Lines | Role | Smell |
| --- | ---: | --- | --- |
| `systems/WeaponSystem.ts` | 742 | Fireball/ray/sphere + 3 explosions + FX | God object, heavy duplication, no pooling |
| `ui/GameHUD.ts` | 659 | Hotbar + level picker + stone art | Mixed concerns (layout + procedural art + state) |
| `ui/SettingsUI.ts` | 568 | Settings panel, sliders, controls list | Long builder, inline widgets |
| `systems/AudioSystem.ts` | 480 | SFX synth + generative music + volume | 3 responsibilities in one class |
| `scenes/PreloadScene.ts` | 381 | All procedural texture factories | Belongs in a `render/textures` module |
| `systems/FieldOfViewSystem.ts` | 373 | Raycast fog-of-war, full-screen canvas mask | Primary perf suspect (see perf docs) |
| `scenes/MainScene.ts` | 225 | Supervisor: HUD, pause, settings, keys | Cross-scene casts |
| `scenes/GameScene.ts` | 228 | Gameplay wiring + update loop | Cross-scene casts |
| `systems/PlayerTeleport.ts` | 207 | Teleport VFX | Wired to fireball-slot right-click; gated by dev mode |
| `systems/DungeonSystem.ts` | 207 | Per-tile floor/wall/obstacle rendering | Per-tile images + Light2D (perf) |
| `entities/NPC.ts` | 207 | Dialogue NPC, blink, speech bubble | Blink logic duplicated with Player |
| `systems/DevModeOverlay.ts` | 147 | FPS + tile-axis labels | Perf-diagnostics panels not built yet |
| `entities/Player.ts` | 171 | Movement, light, blink | Per-frame `Vector2` alloc; no FSM |
| `systems/MobileControlsSystem.ts` | 130 | Dynamic joystick | Per-move `Vector2` alloc |
| `levels/dungeon.ts` | 102 | Handcrafted layout (carve helpers) | OK; data pattern to standardize |
| `systems/PlayerControlsSystem.ts` | 98 | Desktop/mobile input routing | OK |
| `levels/arena.ts` | 95 | Handcrafted arena + NPCs | OK |
| `systems/SettingsManager.ts` | 82 | localStorage volume store (singleton) | Volume state duplicated in AudioSystem |
| `ui/SettingsButton.ts` | 68 | Gear button | OK |
| `scenes/SettingsScene.ts` | 64 | Settings overlay scene | OK |
| `systems/PlayerKeysSyncSystem.ts` | 61 | Window-level key capture | OK; niche workaround |
| `config.ts` | 44 | Phaser game config | Physics 120 Hz, uncapped DPR |
| `levels/types.ts` | 38 | Level/placement interfaces | Good seed for content schema |
| `scenes/BaseScene.ts` | 26 | Audio lifecycle base | OK |
| `types/phaser-raycaster.ts` | 18 | Type shim for broken package export | Necessary evil (documented) |
| `levels/index.ts` | 17 | Level registry | OK |
| `main.ts` | 14 | Boot entry | OK |

### 1.2 Runtime scene flow

```
main.ts → new Phaser.Game(gameConfig)
  scene order: [PreloadScene("PreloadScene"), MainScene, GameScene, SettingsScene]

PreloadScene.create()
  ├─ load 2 fireball mp3s (network)
  ├─ on COMPLETE → buildSharedTextures() (floor, wall, door, player, npc×4, obstacle, fireball, gear)
  └─ scene.start("MainScene")

MainScene (supervisor, stays on top)
  ├─ scene.launch("GameScene")
  ├─ on GameScene CREATE → rebuildHud() → new GameHUD(this, gameScene, ...)
  ├─ binds ESC(settings) / SPACE(RTwP pause) / TAB(dev mode)
  └─ openSettings() → scene.pause("GameScene") + scene.launch("SettingsScene")

GameScene (gameplay)
  ├─ initAudio("exploration")  (BaseScene)
  ├─ lights.enable(); DungeonSystem → Player → FieldOfViewSystem → WeaponSystem → PlayerControlsSystem
  ├─ spawnNPCs() from level definition
  └─ update(): syncKeys → player.update → npc.update[] → fov.update → devOverlay.update
```

### 1.3 Cross-cutting coupling (the fragile joints)

- **Four `as unknown as` cross-scene casts** stitch scenes together without a shared contract:
  - `GameScene.ts:151` reads `MainScene.getSelectedWeaponSlot()`.
  - `MainScene.ts:59` treats `GameScene` as `GameHudController`.
  - `MainScene.ts:130` reads `GameScene.getAudioSystem()`.
  - `MainScene.ts:143` calls `SettingsScene.requestClose()`.
- **HUD state lives on the wrong scene:** selected weapon slot is owned by `GameHUD` (on `MainScene`),
  but casting happens in `GameScene`, forcing a cross-scene fetch on every shot
  (`GameScene.getSelectedWeaponSlot`). `isPointerOverHud()` also does a cross-scene hit test because the
  HUD renders on a sibling scene.

---

## 2. What already works well (keep these)

- **Clear scene separation of concerns intent** (Boot / Supervisor / Game / Settings) — the layering idea
  is right; only the wiring is fragile.
- **Data-driven levels** (`levels/types.ts` + `levels/*.ts` + registry in `levels/index.ts`). This is the
  seed pattern to extend to spells/enemies/items (§5.3).
- **Deterministic lifecycle cleanup discipline** — most systems register `SHUTDOWN` handlers and remove
  listeners. Preserve this rigor while reducing the per-object listener count.
- **FOV throttling already added** (`FieldOfViewSystem.update` redraws only on meaningful movement or when
  dynamic lights exist, capped at ~30 Hz). Good foundation; §4 pushes it further.
- **Config already hardened vs. the perf docs:** `config.ts` now forces `Phaser.WEBGL` +
  `powerPreference: "high-performance"` + `maxLights: 100`. Note: the perf docs still say `Phaser.AUTO`
  (stale) — see §4.

---

## 3. Findings (ranked, evidence-based)

Severity: **H** = correctness/perf/scaling risk or blocks the design vision; **M** = maintainability tax;
**L** = polish.

### F1 — God objects / oversized files (H)
`WeaponSystem` (742), `GameHUD` (659), `SettingsUI` (568), `AudioSystem` (480), `PreloadScene` (381) each
own multiple responsibilities. They are hard to test, hard to extend (e.g. adding a 3rd spell means editing
a 742-line file), and hostile to parallel AI work. → §6.1, §6.4, §6.6.

### F2 — Duplication (H for maintainability)
- `WeaponSystem.castFireball` vs `castProjectile`: near-identical lifecycle (sprite → light → particles →
  collider → cleanup closure → `scene.events.on("update")` listener → `delayedCall` lifetime). ~150 lines
  echoed.
- `WeaponSystem.createExplosion` vs `createFireballExplosion`: near-identical (light + particles + timed
  fade closure + FOV explosion registration).
- **Blink behavior** duplicated between `Player.ts` (`scheduleNextBlink`, blink state,
  `ANIMATION_COMPLETE`) and `NPC.ts` (identical logic + identical 4-frame table).
- **Blink frame table** duplicated between `PreloadScene.createPlayerTexture` and `createNpcTextures`.
- `DungeonSystem.addWallBlock` vs `addDoorBlock`: identical except texture key.
- Volume clamp `Math.max(0, Math.min(1, x))` repeated in `AudioSystem` and `SettingsManager`.
- Stone-panel drawing repeated across `GameHUD.drawMainPanel` / `drawLevelSelectionPanel` and mirrored in
  `SettingsUI` corner/panel code.

### F3 — Fragile cross-scene coupling (H)
The four `as unknown as` casts (§1.3) defeat the type system. A renamed method compiles fine and breaks at
runtime. → replace with a typed registry + typed event bus (§5.2).

### F4 — Dev-mode teleport wiring (M)
`systems/PlayerTeleport.ts` (207 lines) is imported and instantiated by `GameScene` and used as a
right-click "blink" when the fireball weapon slot is selected (`GameScene.ts:110,177`). It is gated by
`isDevModeEnabled()`, so it is effectively a dev-only easter egg, not dead code. Decide whether this
behavior belongs in the public design or should be removed; do not leave it half-documented.

### F5 — Magic numbers, no central constants/theme (M)
- **Depth values** are raw literals in 8 files: `0, 100, 200, 240–261, 300, 350, 400, 600/601, 990, 1000`.
  Layer ordering is implicit and easy to break.
- **`tileSize = 32`** is hardcoded independently in `DungeonSystem` and `FieldOfViewSystem` (must stay in
  sync manually).
- **Palette** (amber `#ff6600`/`0xff6600`, slate greys, stone hexes) is copy-pasted across `GameHUD`,
  `SettingsUI`, `DevModeOverlay`, `SettingsButton`.
- **Gameplay tuning** (movement speed 165, FOV radius 7.5 tiles, blink timings, projectile speeds, explosion
  profiles) is scattered inline.

### F6 — No object pooling despite explicit requirement (H)
`AGENTS.md` and all three design specs demand pooling for projectiles/effects. Current `WeaponSystem`
allocates and destroys a sprite + light + particle emitter + collider + timer + `update` listener **per
cast**, and explosions add more. This is GC/allocation churn during the exact moment (combat) that needs to
stay smooth. → §6.1 + §5.4.

### F7 — Per-object scene `update` listeners (M, perf)
Every projectile and explosion does `scene.events.on("update", …)` and `.off(…)` on cleanup. Under rapid
casting this multiplies event-dispatch overhead (flagged in `Performance_Investigation_Plan.md` P2.4).
Prefer one system-owned update that iterates live effects.

### F8 — Per-frame allocations (M, perf)
`Player.update` allocates `new Phaser.Math.Vector2(0,0)` every frame; `MobileControlsSystem` allocates a
`Vector2` per pointer-move; `FieldOfViewSystem.recomputeVisibilityPolygon` builds+sorts a fresh point array
and `addProjectile/removeExplosion` rebuild arrays via `.filter()`. Reuse buffers.

### F9 — Vision ↔ implementation gap (H, strategic)
The design docs (`Game_Master_Design_Doc.md`, `Game_Detailed_Requirements.md`,
`Game_Specification_PocketRogues_BaldursGate.md`) promise systems with **zero** current code. This is the
biggest structural risk: today's code is a **tech demo** (movement + fog + spell VFX + dialogue + HUD +
settings + audio), not the game. Missing, in rough dependency order:

| Promised system | Doc ref | Status |
| --- | --- | --- |
| Entity FSM (IDLE/WALK/SNEAK/CAST/FALLEN) | Detailed 5.1 | Missing |
| Health / damage / death | implied by combat | Missing (Player has no HP) |
| Projectile→entity damage | Loot/Combat | Missing (projectiles hit walls only) |
| Saving throws (d20, floating text) | Master 3.2 | Missing |
| RTwP grayscale shader on pause | Master 3.1 | **Missing** (pause only freezes + shows label) |
| Stealth & noise radius | Master 2.2 | Missing |
| Enemy AI + 120° vision cones + auto-pause | Master 2.2/3.1 | Missing |
| SCP "moves when unseen" statue AI | Master 4.2 | Missing |
| Honest loot + inventory + item condition | Master 5.1 | Missing |
| Cursed/experimental items (Soul Link, Inversion Ring) | Master 5.1 | Missing |
| Mental Fatigue ("Dopamine Detox") | Detailed 5.2 | Missing |
| Data-driven spells/enemies/items | Detailed 5.1 | Missing (only levels are data-driven) |

### F10 — Double source of truth for volume (M)
`AudioSystem` holds `masterVolume/musicVolume/sfxVolume` **and** `SettingsManager` persists the same. Setters
write both; getters read the local copy. One store should own the value; the other should observe.
---

## 4. Performance: how this proposal relates to the existing plans

Two thorough perf docs already exist and remain the source of truth for **measurement**:
`Performance_Investigation_Plan.md` and `Performance_Lag_Diagnostics_Plan.md`. Do not duplicate them. This
proposal only adds the **structural** enablers and records drift:

- **Drift to fix in the docs:** both plans cite `config.ts` using `Phaser.AUTO` at 20–30 FPS; the current
  `config.ts` already uses `Phaser.WEBGL` + `powerPreference`. Update the plans' S1 line, or add a note that
  S1 is partially mitigated. Also update `FieldOfViewSystem` method references: `redrawFovMask` was split
  into `recomputeVisibilityPolygon` + `paintMask`. (Documentation-only follow-up.)
- **Still-open suspects unchanged by config:** S2 `Light2D` on every floor tile (`DungeonSystem`, 9
  `setPipeline("Light2D")` sites), S3 full-screen `CanvasTexture` FOV mask upload, S5 physics at 120 Hz
  (`config.ts`), S7 uncapped DPR under `Scale.RESIZE`.
- **Structural enablers this proposal provides for those fixes:**
  - A batched map layer (§6.5) so S2/S4 can be fixed without touching gameplay.
  - A bounded-resolution FOV render target (§6.3) so S3 becomes a config knob.
  - A pool + single-update effects manager (§6.1) so combat allocations (P2) drop.
  - A `DevModeOverlay` diagnostics upgrade (§6.7) implementing Panels A–F from the diagnostics plan, which is
    the prerequisite gate both docs require before any perf code changes.

**Rule (from the plans, restated):** no perf gameplay change lands without a before/after trace on the slow
machine. Structure first, measured optimization second.

---

## 5. Target architecture

### 5.1 Proposed folder layout

Introduce two new top layers (`core`, `content`) and split `render` out of preload. Keep the current
`scenes/entities/systems/ui` names.

```
game/src/
  core/                # engine-agnostic building blocks, no gameplay
    constants.ts       # Depths enum, TileConfig, GameplayTuning
    theme.ts           # Palette, Fonts, stone/panel color sets
    EventBus.ts        # typed pub/sub (see 5.2)
    ServiceRegistry.ts # typed cross-scene access (see 5.2)
    Pool.ts            # generic object pool (see 5.4)
    rng.ts             # seedable RNG (replaces scattered Math.sin hashes / Math.random)
  content/             # data-driven definitions + schemas (see 5.3)
    levels/            # move existing levels/ here
    spells/            # spell definitions + schema
    enemies/           # enemy definitions + schema
    items/             # item/loot definitions + schema
    dialogue/          # NPC dialogue tables
  render/              # texture/anim factories extracted from PreloadScene
    textures.ts
    animations.ts
  entities/
    components/        # reusable behavior: Health, BlinkBehavior, StateMachine
    Player.ts
    Npc.ts
    Enemy.ts           # new
  systems/             # gameplay systems (combat, fov, dungeon, audio, stealth, fatigue, ai)
  ui/
    widgets/           # StonePanel, StoneFrame, Slider, IconButton (shared)
    GameHUD.ts
    SettingsUI.ts
  scenes/              # BootScene, MainScene(supervisor), GameScene, SettingsScene
```

**Layering rule (enforce in review):** `core` depends on nothing game-specific; `content` depends only on
`core` + schema types; `systems`/`entities`/`ui` depend on `core` + `content`; `scenes` wire everything.
No `ui → systems` gameplay calls except through the event bus / registry.

### 5.2 Cross-scene comms — three options

| Option | How | Pros | Cons |
| --- | --- | --- | --- |
| A. Typed EventBus only | Global emitter with a typed event map; scenes publish/subscribe | Fully decoupled; testable | Harder to fetch synchronous values (e.g. "current slot now") |
| B. Typed ServiceRegistry only | Register scene-owned services under typed keys; look up by key | Simple synchronous access; kills casts | Still a shared global; lifecycle must be disciplined |
| **C. Both (recommended)** | Registry for stable services (audio, selected-slot provider), EventBus for transient events (`toggle-dev-mode`, `pause-changed`, `level-changed`) | Right tool per need; removes all four `as unknown as` casts; each independently testable | Two small primitives to learn |

**Recommendation: C.** Add `core/ServiceRegistry.ts` (typed `get<T>(key)`/`set`) and `core/EventBus.ts`
(typed event map). Migrate the four casts: selected-slot and audio via registry; dev-mode/pause/level-change
via bus. Register on scene `CREATE`, unregister on `SHUTDOWN`.

Sketch:

```ts
// core/EventBus.ts
export interface GameEvents {
  "dev-mode:toggle": void;
  "rtwp:changed": { paused: boolean };
  "level:changed": { levelId: string };
  "player:damaged": { amount: number; sourceId?: string };
}
export const gameEvents = new Phaser.Events.EventEmitter(); // wrap with typed emit/on helpers

// core/ServiceRegistry.ts
export interface Services {
  audio: AudioSystem;
  weaponSelection: { getSelectedSlot(): number };
}
```

### 5.3 Data-driven content — three options

| Option | Format | Pros | Cons |
| --- | --- | --- | --- |
| A. JSON files + runtime schema (zod) | `*.json` loaded/validated | Editable by non-coders; hot-swappable | Adds a dep; runtime parse; loses inline types |
| B. Inline TS objects (current levels pattern) | `export const x: Def = {…}` | Zero deps; compile-time typed; matches `levels/` | Code changes to add content |
| **C. TS-as-data modules + registry (recommended)** | Typed const modules under `content/*` + `index.ts` registries mirroring `levels/index.ts` | Type-safe, no fetch/parse, familiar pattern already in repo, trivially testable | Content still requires a rebuild |

**Recommendation: C.** It generalizes the proven `levels/` pattern. Define `SpellDefinition`,
`EnemyDefinition`, `ItemDefinition` in `content/*/types.ts`; register in `content/*/index.ts`. `WeaponSystem`
becomes a data-driven `SpellCaster` that reads a `SpellDefinition` instead of branching on `"ray"/"sphere"`
string literals. This directly unblocks F9 (new spells/enemies = new data file, not edits to a 741-line
class).

Sketch:

```ts
// content/spells/types.ts
export interface SpellDefinition {
  id: string;                 // "fireball" | "ray" | "sphere" | ...
  textureKey: string;
  speed: number;
  lifetimeMs: number;
  collisionRadius: number;
  light: { radius: number; color: number; intensity: number };
  impact: ExplosionTier;      // reuse existing tiers
  targeting: "homing" | "linear";
  castSound?: { key: string; volume: number };
}
```

### 5.4 Entity model & object pooling — three options

| Option | Approach | Pros | Cons |
| --- | --- | --- | --- |
| A. Full ECS (e.g. bitecs) | Entities = ids, components = arrays, systems iterate | Cache-friendly; scales to many entities | Large rewrite; foreign to current class style; overkill at current scale |
| B. Keep class inheritance, add mixins/components | `Player`/`Npc`/`Enemy` compose `Health`, `BlinkBehavior`, `StateMachine` | Incremental; removes F2 blink dup; matches Phaser idioms | Still some inheritance rigidity |
| **C. B + a generic `Pool<T>` for high-frequency objects (recommended)** | Composition for entities; pooling for projectiles/particles/lights/effects | Fixes F2, F6, F7 together; smallest viable change; satisfies `AGENTS.md` | Requires a disciplined acquire/release contract |

**Recommendation: C.** Add:
- `entities/components/StateMachine.ts` — tiny FSM (`current`, `transitions`, `onEnter/onExit`) used by
  `Player` (IDLE/WALK/SNEAK/CAST/FALLEN) and enemies. Satisfies Detailed 5.1.
- `entities/components/Health.ts` — `current/max`, `damage()`, `heal()`, `onDeath`. Unblocks combat.
- `entities/components/BlinkBehavior.ts` — extract the duplicated blink from `Player`/`NPC`.
- `core/Pool.ts` — `acquire()/release()`; back the `WeaponSystem` rewrite (§6.1).

### 5.5 Central constants & theme (fixes F5)

```ts
// core/constants.ts
export enum Depth {
  Floor = 0, Walls = 200, Npc = 250, Player = 300, SpeechBubble = 350,
  Fov = 100, ProjectileLow = 240, ProjectileHigh = 261,
  Hud = 400, Joystick = 600, SettingsOverlay = 990, SettingsPanel = 1000, DevOverlay = 1100,
}
export const Tile = { size: 32 } as const;
export const Movement = { playerSpeed: 165 } as const;
export const Fov = { radiusTiles: 7.5, fadeTiles: 7.5, refreshMs: 33 } as const;
```

```ts
// core/theme.ts
export const Palette = {
  amber: 0xff6600, amberBright: 0xffbb33, slate: 0x2d3134, obsidian: 0x1c1d1f,
  ambient: 0x111122, playerLight: 0xffeebb,
} as const;
export const Font = { mono: "Roboto Mono, Courier New, monospace", serif: "Cinzel, Georgia, serif" } as const;
```

Migrate literals file-by-file. **Note:** current FOV depth (100) sits *below* walls (200); when introducing
the `Depth` enum, preserve today's actual ordering exactly — this is a mask overlay, not a sorted sprite, so
do not "tidy" its value without a visual check.

---

## 6. Subsystem refactor plans

Each block: **Problem → Target → Steps → Definition of Done (DoD).** Tasks are ordered so each compiles and
is shippable alone.

### 6.1 WeaponSystem → SpellCaster + EffectPool
- **Problem:** F1, F2, F6, F7. 742 lines, duplicated cast/explosion lifecycles, no pooling, per-object
  listeners.
- **Target:** `systems/combat/SpellCaster.ts` (reads `SpellDefinition`), `systems/combat/EffectManager.ts`
  (one `update`, iterates live effects), `core/Pool.ts` backing projectile sprites/lights/emitters.
- **Steps:**
  1. Extract `EXPLOSION_PROFILES` and `WEAPON_TEXTURES` into `content/spells/`.
  2. Introduce `SpellDefinition` (§5.3); express fireball/ray/sphere as data.
  3. Write one `castSpell(def, target)` replacing `castFireball`/`castProjectile`.
  4. Merge `createExplosion`/`createFireballExplosion` into one `spawnExplosion(profile)`.
  5. Replace per-projectile `scene.events.on("update")` with a single `EffectManager.update(delta)` iterating
     an active-effects array; `GameScene.update` calls it once.
  6. Back projectiles/lights/emitters with `Pool`; enforce a concurrent-effect cap (perf docs P2.3).
- **DoD:** fireball/ray/sphere behave identically on-screen; adding a 4th spell needs only a new
  `content/spells/*` file; no `scene.events.on("update")` per projectile; rapid casting shows no retained
  growth after effects expire (verify with §6.7 heap panel).

### 6.2 Damage & combat loop (unblocks F9)
- **Problem:** projectiles collide with walls only; no HP/death; no saving throws.
- **Target:** `entities/components/Health.ts`; `systems/combat/DamageSystem.ts`; projectile↔entity colliders;
  floating combat text (`[SAVING THROW: SUCCESS/FAIL]`, damage numbers).
- **Steps:** add `Health` to `Player`/`Enemy`; register `physics.add.overlap(projectiles, enemyGroup)`;
  `DamageSystem.applyHit(target, spell)` rolls a d20 save (`core/rng.ts`), applies damage, emits
  `player:damaged`/`enemy:died`, spawns floating text; on death drop honest loot (§6.8 hook).
- **DoD:** a spell reduces enemy HP and kills at 0; save-throw text appears; player can take damage and reach
  a FALLEN state.

### 6.3 FieldOfViewSystem → bounded-resolution render target
- **Problem:** F8 + perf S3: full-screen `CanvasTexture` re-uploaded each redraw; fresh point array + sort per
  redraw; `filter()` churn.
- **Target:** render mask at a bounded internal resolution then scale (config knob); reuse visibility-point
  buffer; O(1) removal for projectiles/explosions.
- **Steps:** pull `tileSize` from `core/constants.ts`; add `Fov.maskScale` (e.g. 0.5) and draw to a smaller
  `RenderTexture`/canvas; keep the movement-threshold + light throttle already present; replace
  `activeProjectiles.filter()` with swap-remove or a `Set`.
- **DoD:** fog still reveals walls and dynamic spell light correctly; measured FOV redraw ms drops on a hi-DPI
  machine (evidence via §6.7 Panel D); no per-redraw array allocation in the hot path.

### 6.4 AudioSystem split
- **Problem:** F1, F10: SFX synth + generative music + volume store in one 479-line class; volume duplicated
  with `SettingsManager`.
- **Target:** `systems/audio/SfxLibrary.ts` (procedural buffers + `play`), `systems/audio/MusicDirector.ts`
  (drone + Dorian melody scheduler), `systems/audio/VolumeMixer.ts` reading a single `SettingsManager`
  source (AudioSystem observes, does not store).
- **DoD:** SFX and music behave identically; volume has one owner (`SettingsManager`); sliders still update
  live; each module independently testable (buffer length, note scheduling with fake timers).

### 6.5 DungeonSystem → batched map layer (perf S2/S4)
- **Problem:** one `Image` per floor tile, each `setPipeline("Light2D")` (up to thousands); wall/door dup.
- **Target:** render floors via a Phaser Tilemap layer or `Blitter`/baked `RenderTexture`; restrict `Light2D`
  to a small deliberate set; unify `addWallBlock`/`addDoorBlock` into one `addBlock(kind)`; keep collision
  geometry independent from decoration.
- **DoD:** identical look; display-list object count for floors collapses to ~1 layer; walls still occlude and
  collide; measured draw-call drop (evidence via §6.7 Panel C).

### 6.6 UI: extract shared stone widgets
- **Problem:** F1, F2: procedural stone art + panel/slider builders duplicated across `GameHUD` and
  `SettingsUI`.
- **Target:** `ui/widgets/StoneFrame.ts`, `StonePanel.ts`, `Slider.ts`, `IconButton.ts`. `GameHUD` and
  `SettingsUI` become thin compositions; art lives in widgets using `core/theme.ts`.
- **DoD:** HUD and settings render identically; the stone-drawing seed/bevel code exists once; adding a hotbar
  slot or settings row is a few lines.

### 6.7 DevModeOverlay → perf diagnostics (implements the diagnostics plan)
- **Problem:** F11 + the diagnostics plan's Panels A–F are unbuilt; only FPS + tile-axis labels exist.
- **Target:** add Panels A (frame timing), B (renderer/DPR/backing res), C (draw calls/display objects/lights),
  D (FOV redraws/ms), E (update ms/physics bodies/JS heap), F (A/B toggles: Light2D, FOV redraw, physics
  60↔120). Sample expensive metrics at ~4 Hz.
- **DoD:** overlay shows the six panels behind the existing TAB dev toggle without itself costing FPS; each
  Panel-F toggle flips its target system live. This is the **gate** the perf docs require before any perf
  gameplay change.

### 6.8 Content extraction & registries
- **Problem:** F9 groundwork; levels are the only data-driven content.
- **Target:** move `levels/` → `content/levels/`; add `content/spells|enemies|items` with `types.ts` +
  `index.ts` registries mirroring `levels/index.ts`.
- **DoD:** existing level switching still works; a new spell/enemy/item is one data file + registry entry; no
  gameplay class hardcodes content lists.

### 6.9 Dead code & naming
- `PlayerTeleport` is already wired to a dev-mode right-click blink via the fireball slot
  (`GameScene.ts:110,177`). Decide whether to keep this dev-only behavior, promote it to a real mechanic, or
  delete it; update this document accordingly.
- ~~Rename the boot scene key `"BootScene"` → `"PreloadScene"`~~ (already matches — `PreloadScene.ts:9`).
- **DoD:** no ambiguous modules; scene key and class name match; game boots unchanged.

---

## 7. Roadmap to the design vision (feature → module map)

Ordered by dependency. Each milestone assumes the §6 structural work it needs is done.

1. **RTwP grayscale (Master 3.1).** Add a camera post-FX ColorMatrix (grayscale/desaturate) toggled by the
   existing `rtwp:changed` event in `MainScene.toggleRtwpPause`. Small, high-impact "feel" win; pause already
   exists, only the shader is missing. → `systems/rtwp/GrayscaleFx.ts`.
2. **Health/damage/death + saving throws (§6.2).** Turns spells into gameplay.
3. **Enemy entity + basic AI + 120° vision cone + auto-pause (Master 2.2/3.1).** `entities/Enemy.ts`,
   `systems/ai/VisionCone.ts`, `systems/ai/EnemyBrain.ts` (FSM: PATROL/ALERT/CHASE/ATTACK). Auto-pause emits
   `rtwp:changed` on first sight.
4. **Stealth & noise (Master 2.2).** Noise radius from joystick `force` (already computed in
   `MobileControlsSystem` as `speedFraction`) feeds enemy hearing. Adds SNEAK state to the player FSM.
5. **Honest loot + inventory (Master 5.1).** `ItemDefinition` + drop-on-death (hook from §6.2) + item
   `condition` reduced by damage type. Inventory UI reuses `ui/widgets`.
6. **Experimental/cursed items (Master 5.1).** Soul Link (mirror damage via `player:damaged`/`enemy:died`),
   Ring of Inverted Subjectivity (wrap `Player` movement vector). These ride on the FSM + event bus.
7. **SCP "moves when unseen" statue (Master 4.2).** An enemy whose brain advances only when **not** in the FOV
   visibility set — read the same raycast result the FOV already computes (avoid a second raycast).
8. **Mental Fatigue / Dopamine Detox (Detailed 5.2).** `systems/FatigueSystem.ts` scales FOV radius down and
   injects stumble states over a session. Server time check is optional/last (privacy + offline concerns).

> `AGENTS.md` guardrails to keep while building the above: no tutorials/manuals — teach via environmental
> cues; every mechanic must have a legible in-world cause/effect ("Ecological Design"); design combat around
> the pause.

---

## 8. UI / UX improvements

- **Consolidate the stone language** into `ui/widgets` (§6.6) so every panel shares bevels, palette, and
  fonts — consistency is the cheapest polish.
- **Reduce first-approach jank:** `GameHUD` rebuilds fully on every `GameScene` CREATE (level switch). After
  widgetization, diff/patch the level list instead of destroy+recreate.
- **Controls list honesty:** `SettingsUI` advertises `E Inventory` and `L Level Up`, which are unimplemented.
  Either implement or hide until real (avoid teaching controls that do nothing — also an Ecological-Design
  violation).
- **Mobile parity:** the dynamic joystick is solid; add the same `force`-based speed read to desktop (hold to
  sneak) so stealth is not mobile-only.
- **Pause clarity:** pair the grayscale FX (§7.1) with the existing "PAUSED" label so the RTwP state reads
  instantly.
- **Accessibility knob:** expose FOV radius / brightness in settings (also doubles as the §4 quality tier).

## 9. Game experience ("juice", within the dark/liminal vibe)

- **Honor `docs/source/ideas.md`** — it already contains strong, on-theme hooks: delayed spell audio implying
  scale/distance, a voice by a door warning "stop firing, you're attracting them", backrooms monster,
  shadow-spawned enemies via the raycaster, ambient door creaks/heartbeat rooms. Track these as content
  tickets once the systems in §7 exist.
- **Feedback on hits:** floating saving-throw text (§6.2) is both mechanic-transparency (no manual) and juice.
- **Sound-first threats:** the audio delay idea + noise system (§7.4) makes the world feel reactive without
  visible UI.
- **Restraint:** keep effects pooled and capped (§6.1) so juice never costs the frame budget the perf docs
  are protecting.

---

## 10. Testing policy

- **UI unit tests are forbidden.** Phaser scene/UI code is tested through play and visual verification only.
- **No Vitest.** The project does not use Vitest or any other JS unit-test runner.
- Logic-heavy modules may be validated through manual inspection, runtime asserts, or small standalone
  scripts — not through a test framework.

---

## 11. Execution plan (ordered, each independently shippable)

Phased so every step compiles, is reversible, and leaves the game runnable. AI agents: do one sub-task,
verify build/lint, then proceed.

**Phase 0 — Safety net & drift (docs/config, low risk)**
1. Update the two perf docs' stale `Phaser.AUTO`/S1 note and the `redrawFovMask` method name (now
   `recomputeVisibilityPolygon` + `paintMask`). (§4)

**Phase 1 — Foundations (`core/`, no behavior change)**
2. `core/constants.ts` (Depth, Tile, tuning) + migrate depth/tile literals. (F5)
3. `core/theme.ts` (Palette/Font) + migrate colors in HUD/Settings/Dev/Button. (F5)
4. `core/EventBus.ts` + `core/ServiceRegistry.ts`; replace the four `as unknown as` casts. (F3)
5. `core/Pool.ts` + `core/rng.ts` (unused yet; validated via standalone scripts only).

**Phase 2 — De-duplication (behavior-preserving)**
6. Extract `entities/components/BlinkBehavior.ts`; use in `Player`+`NPC`. (F2)
7. `ui/widgets/*` (StoneFrame/StonePanel/Slider/IconButton); thin out `GameHUD`+`SettingsUI`. (F1/F2)
8. Split `AudioSystem` into Sfx/Music/Mixer; single volume owner. (F1/F10)
9. Decide+resolve `PlayerTeleport` (delete or wire). (F4)

**Phase 3 — Content spine**
10. Move `levels/` → `content/levels/`; add spells/enemies/items schemas + registries. (§5.3/§6.8)
11. Rewrite `WeaponSystem` → `SpellCaster` + `EffectManager` on `Pool`, spells as data. (§6.1)
12. Batched map layer in `DungeonSystem`; unify wall/door block. (§6.5)

**Phase 4 — Diagnostics & measured perf**
13. `DevModeOverlay` Panels A–F. (§6.7) — the gate.
14. Capture slow-machine traces (per perf docs); apply only confirmed FOV (§6.3) / Light2D (§6.5) / physics-Hz
    fixes with before/after evidence.

**Phase 5 — The game (vision systems)**
15. RTwP grayscale FX. (§7.1)
16. Health/damage/death + saving throws. (§6.2)
17. Enemy + AI + vision cone + auto-pause. (§7.3)
18. Stealth/noise; SCP statue; loot/inventory; cursed items; fatigue. (§7.4–7.8)

**Suggested milestone tags:** M0 (Phase 0–1) "hardened skeleton", M1 (Phase 2–3) "data-driven & DRY",
M2 (Phase 4) "measured & fast", M3 (Phase 5) "actually the game".

---

## 12. Conventions cheat-sheet (for consistency)

- **Names by business purpose**, not data structure (global rule): `spellDefinition`, `enemyBrain`,
  `playerPortfolioOfEffects` — not `data`/`item`/`map`. Plural nouns for collections
  (`activeProjectiles`, not `projectileList`).
- **Depths** come from `Depth` enum only. **Colors/fonts** from `core/theme.ts` only. **Tuning** from
  `core/constants.ts` only.
- **Cross-scene:** stable services via `ServiceRegistry`; transient signals via `EventBus`. No new
  `as unknown as` scene casts.
- **High-frequency objects** (projectiles/particles/lights/floating text) go through `Pool`.
- **Comments explain _why_**, not what (sentinels, workarounds, invariants). No emojis in code/docs.
- **Lifecycle:** every system/entity registers a `SHUTDOWN` cleanup and removes its listeners (keep the
  current discipline).

---

## 13. Appendix — quick answers for an agent picking this up cold

- **Where's the entry point?** `game/src/main.ts` → `config.ts` → scenes.
- **Where do I add a level today?** `game/src/levels/*.ts` + register in `levels/index.ts` (will move to
  `content/levels/`).
- **Why the raycaster shim?** `types/phaser-raycaster.ts` — the package's `exports` hides its types; the shim
  imports the ESM entry directly. Leave it.
- **Why window-level key capture?** `PlayerKeysSyncSystem` mirrors physical keys into Phaser keys so held
  movement survives pause/resume and focus changes. Preserve behavior when refactoring input.
- **Biggest single risk?** F9 — the code is a tech demo; the design docs are a full game. Build the spine
  (§5) before piling on features, or every feature re-pays the coupling tax.
- **First thing to do?** Phase 0 → Phase 1. Small, safe, unlocks everything else.

