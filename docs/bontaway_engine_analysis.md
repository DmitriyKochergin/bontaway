# Bontaway — Game Engine Deep Analysis & Improvement Proposals

> Full architectural review of the `game/` codebase (~12 100 LoC TypeScript, Phaser 3.90, Rsbuild).
> Each section scores the current state (🔴 problem, 🟡 needs work, 🟢 good), explains the issue, and proposes a concrete fix.
> **Revision 2 (2026-10-30):** re-verified every claim against current sources and Phaser 3.90 internals, corrected stale facts,
> added a performance investigation for the "<20 FPS on an old Windows PC" report, and added gameplay / game-feel proposals.

---

## Table of Contents

1. [Codebase Snapshot](#1-codebase-snapshot)
2. [Performance — Low-End PC Investigation](#2-performance--low-end-pc-investigation)
3. [Architecture & Code Structure](#3-architecture--code-structure)
4. [Stack Selection](#4-stack-selection)
5. [UI / UX](#5-ui--ux)
6. [Rendering Pipeline — Target Design](#6-rendering-pipeline--target-design)
7. [Multiplayer & Networking](#7-multiplayer--networking)
8. [Audio](#8-audio)
9. [Level System](#9-level-system)
10. [Mobile](#10-mobile)
11. [Gameplay, Fun & Game Feel](#11-gameplay-fun--game-feel)
12. [Priority Roadmap](#12-priority-roadmap)
13. [Changelog of This Review](#13-changelog-of-this-review)

---

## 1. Codebase Snapshot

| Metric | Value |
|---|---|
| Total TS lines (`game/src`) | ~12 083 |
| Source files | 66 |
| Largest file | [LevelEditorController.ts](../game/src/editor/LevelEditorController.ts) — 854 LoC |
| Runtime deps | `phaser ^3.83` (resolves to **3.90.0**, the final v3 line), `phaser-raycaster 0.11.0`, `trystero ^0.22` |
| Bundler | Rsbuild 2 (+ `plugin-type-check`) |
| Linter / formatter | Biome 2.6 |
| Package mgr | Yarn 4.14, `nodeLinker: node-modules` (not PnP) |
| Deploy | GitHub Pages (static) |
| Levels | `arena` 48×48, `dungeon` 96×64, `emotions` 48×48 (20 NPCs), `emotions2` 24×20, `trademeet` 48×48 (3 torches, 4 NPCs) |
| Wall sprites per level | arena 160, dungeon **751**, emotions 124, emotions2 80, trademeet 160 (one `StaticImage` + one occluder each) |

**Observation:** For a 2D roguelike with raycast FOV, Light2D, multiplayer, a level editor, and two HUD styles, the scope is already significant.
The architecture holds up. The biggest risk right now is **GPU fill-rate**, not code structure: several full-screen passes run every frame
and do not scale down on weak hardware (see §2).

---

## 2. Performance — Low-End PC Investigation

> Symptom: **< 20 FPS on an old Windows PC.** Not yet profiled on that machine. Findings below come from reading the sources and
> Phaser 3.90 internals (`node_modules/phaser/src`). Cost estimates are order-of-magnitude, for a ~2015 integrated GPU at 1080p.
> Re-measure after each fix (§2.12).

### 2.0 Frame Budget Summary

| # | Hot spot | Where | Type | Est. cost on iGPU | Severity |
|---|---|---|---|---|---|
| P1 | Light2D shader compiled for **100 lights** | `config.ts` `render.maxLights: 100` | GPU fragment | very high | 🔴 |
| P2 | 3 BitmapMask passes per frame (fog, torches, NPCs) | `FieldOfViewSystem`, `TorchManager`, `NpcManager`, `RemotePlayer` | GPU fill + FBO switches | high | 🔴 |
| P3 | Canvas-2D fog repaint + full-texture upload at 30 Hz | `FieldOfViewSystem.paintMask` | CPU + bus | medium–high | 🔴 |
| P4 | `castCircle` raycast against every nearby wall tile | `FieldOfViewSystem.computeVisibilityPolygon` | CPU, ~quadratic | high in `dungeon` | 🔴 |
| P5 | Arcade physics at **120 Hz**, no step cap | `config.ts` `arcade.fps: 120` | CPU, spiral-of-death | medium | 🔴 |
| P6 | `Graphics` HUD re-tessellated every frame | `StoneGameHUD`, `BaseGameHUD`, `NPC` bubbles | CPU | low–medium | 🟡 |
| P7 | Per-shot particle emitter + Light allocation | `ProjectileVisuals` | CPU + GC spikes | low (spiky) | 🟡 |
| P8 | Light2D is single-texture, so every texture switch flushes | all `setPipeline("Light2D")` objects | draw calls | low–medium | 🟡 |
| P9 | 751 wall `StaticImage`s rendered with no camera culling | `DungeonSystem.addWallBlock` | CPU | low | 🟡 |
| P10 | `localStorage.setItem` + `JSON.stringify` every moving frame | `GameScene.saveCurrentPlayerProgress` | CPU / I/O | low | 🟡 |
| P11 | No render-scale / quality preset; native-res canvas | `config.ts` | GPU fill | multiplier on P1–P3 | 🟡 |

### 2.1 P1 — `maxLights: 100` makes every lit pixel loop 100 times 🔴

Phaser's Light2D fragment shader is compiled with `kMaxLights = render.maxLights`. It loops to the **compile-time** maximum and
branches on the live count:

```glsl
for (int index = 0; index < kMaxLights; ++index) {   // kMaxLights = 100
    if (index < uLightCount) { /* normalize, length, dot, clamp ... */ }
}
```

Old GPUs and ANGLE's D3D back-end usually unroll this loop, so every fragment of the floor, the walls and every sprite pays for
100 iterations even with 4 lights on screen. The uniform array (`Light uLights[100]`) also needs about 200–300 vec4 registers. That
nears or exceeds the fragment-uniform limit of older D3D9/D3D10-class GPUs, which risks shader failure or a software fallback.
Phaser's default is 10.

Actual peak light count: player (1) + torches (≤3) + live projectiles + explosions + remote-player torches. Rarely above 10.
`LightsManager.getLights` already culls to the camera and **sorts by distance** when over the cap, so a lower cap degrades gracefully.

**Fix (minutes):** `maxLights: 12` (High) / `8` (Low). It is read once at boot, so drive it from a quality preset loaded before
`new Phaser.Game()` (§2.11). **Likely the single largest win.**

### 2.3 P3 — Canvas-2D fog with full-texture upload 🔴

Each repaint (≤ 30/s while moving or while a projectile flies) clears and fills a canvas about `(W+96)/2 × (H+96)/2`, clips a path,
draws gradients, then calls `CanvasTexture.refresh()`. That is a full `texImage2D` upload of about 2.7 MB at 1080p, or about 80 MB/s.
With a GPU-accelerated 2D canvas, Chrome may also need a GPU→CPU→GPU round-trip. Existing mitigations are good: half resolution,
pre-baked gradients, a cached torch layer, and a world-locked offset between repaints.

**Fixes:**
1. Quality knob: `maskResolutionScale` 0.5 → **0.25** on Low (bilinear filtering hides it in soft fog) and `fovRefreshMs` 33 → 50.
2. Better: **render the fog on the GPU** (§6). Upload only the visibility data (a 1D polar distance texture of 512 floats, about 2 KB),
   not a full-screen bitmap.

### 2.4 P4 — `phaser-raycaster.castCircle` scales ~quadratically 🔴

`castCircle` casts three rays at **every vertex of every mapped object** and tests each ray against **every object**. With a 15-tile
reach, `collectOccludersInRange` passes up to ~30×30 tiles of walls, so in `dungeon` (751 wall tiles, dense rooms) that can mean
hundreds of objects, thousands of rays, and hundreds of thousands of segment tests per recompute, at up to 30 recomputes per second
while walking. The sort comparator also calls `Math.atan2` twice per comparison.

**Fixes:**
1. Quick: precompute each intersection's angle once (or read it from the ray), then sort by the cached number.
2. Quick: merge collinear wall tiles into **rectangles** (greedy meshing over `walkable[][]`) before mapping. That is typically 5–10×
   fewer occluders and also fewer static physics bodies.
3. Best: drop the plugin for FOV and **cast against the tile grid** with an Amanatides–Woo DDA. 360–720 rays × ≤ 15 tile steps is
   under 0.5 ms and has no dependency on wall density. Obstacles (few, arbitrary AABBs) get an extra ray-vs-AABB test. This also removes
   an unmaintained dependency (§4.1).

### 2.5 P5 — Arcade physics at 120 Hz 🔴

`arcade.fps: 120` runs two physics steps per 60 Hz frame, and Arcade's fixed-step loop has no step cap. At 20 FPS it runs **six
steps per frame**: slow frames cause more physics work, which makes frames slower still (spiral of death). The game has no
high-speed tunnelling risk that needs 120 Hz (projectile speeds are modest, walls are 32 px).

**Fix:** `fps: 60` (default). If projectile tunnelling ever appears, give projectiles a swept/ray check instead of doubling the world step.

### 2.6 P6 — `Graphics` replays every frame 🟡

In Phaser 3 a `Graphics` object stores *commands* and **replays and re-tessellates them on every render**, including
`fillRoundedRect` and the path fills. The stone HUD panel (~60 commands), slot frames, network badge, NPC speech bubbles and chat
bubbles all pay this CPU cost every frame, not only on resize. §5.1 has the fix.

### 2.7 P7 — Per-shot FX allocation 🟡

Projectile sprites are pooled. Their visuals are not: every shot calls `scene.add.particles()` and `lights.addLight()`, and every
impact also creates 2 circles, 1 emitter, 1 light and 1 timer. Rapid fire churns the GC, which shows up as micro-stutter on old CPUs.

**Fix:** pool emitters by kind (one long-lived emitter per kind; use `emitter.explode(count, x, y)` for impacts and
`startFollow`/`stop` for trails) and keep a small fixed pool of `Light`s, toggled with `setVisible`/intensity 0.

### 2.8 P8 — Light2D batching 🟡

Light2D renders one texture per batch, so every texture change in depth order flushes a draw call (floor → wall → door → obstacle →
torch → fireball → npc_* …). **Fix:** bake all runtime-generated textures into **one atlas** at boot (`RenderTexture` →
`saveTexture`, then add frames). Light2D can then batch walls, doors and obstacles together. This upgrades the existing §4.3 proposal
from "nice to have" to a performance item.

### 2.9 P9 — Walls as individual images 🟡

751 `StaticImage`s are submitted every frame (Phaser 3 does not cull them). **Fix:** render walls and doors as a second
**TilemapLayer**, which is camera-culled and single-batch. Keep collision either via `layer.setCollision(...)` or via the merged
rectangles from §2.4.

### 2.10 P10 — Progress save every frame 🟡

`saveCurrentPlayerProgress()` runs from `update()` and writes `localStorage` whenever the position changed by ≥ 0.5 px, which is every
frame while walking. **Fix:** throttle to about 1 s and also save on `visibilitychange`/`pagehide`, scene pause and level switch.

### 2.11 P11 — Quality presets and render scale 🟡

There is no way to trade fidelity for frame rate. **Proposal:** a `QualityPreset` in `SettingsManager`, read *before* the game boots:

| Knob | High | Low |
|---|---|---|
| `render.maxLights` | 12 | 8 |
| Render scale (canvas size × s, CSS-upscaled via `zoom`) | 1.0 | 0.75 |
| Fog mask resolution / refresh | 0.5 / 33 ms | 0.25 / 50 ms |
| Torch particle frequency | 45 ms | 90 ms, no embers |
| Impact particles | 100 % | 50 % |
| Pause effect | grayscale postFX | tint overlay (no postFX) |

**Auto-detect:** start on High and sample `game.loop.actualFps` for 3 s after the first level loads. If it is below 45, switch to Low
(and remember the choice). Show the choice in Settings with no tutorial text, in keeping with the design rules. `maxLights` needs a
reload, so apply it on the next boot.

### 2.12 How to Verify on the Old PC (do this first)

1. `chrome://gpu`: confirm **"WebGL: Hardware accelerated"**. If the renderer reads *SwiftShader* or *Software only*, the browser has
   blocklisted the GPU, and no code fix will reach 60 FPS. Update the driver or enable hardware acceleration first.
2. Add **FPS, frame ms, and the `WEBGL_debug_renderer_info` renderer string** to `DevModeOverlay`. It already shows raycast ms.
3. Chrome DevTools → Performance, record 10 s of walking in `dungeon` and `emotions`. Split *Scripting* vs *GPU*.
4. Capture one frame with **Spector.js** and count draw calls, FBO binds and full-screen quads before and after P1/P2.
5. Measure after each fix, one change at a time.

---

## 3. Architecture & Code Structure

### 3.1 God Scene Problem 🟡

[GameScene.ts](../game/src/scenes/GameScene.ts) is 562 lines (down from 680; HUD moved to `MainScene`). It still orchestrates
dungeon construction, player creation, FOV, weapon, teleport, NPC and torch systems, multiplayer, chat bubbles, editor toggling,
progress persistence and level-document building.

**Proposals:**
1. Move level-document build/apply (`buildLevelDocument`, `applyLevelDocument`) into the `editor/` package. It is editor-only logic.
2. **Formalize a `GameSystem` interface** (`update(time, delta)`, `destroy()`) and iterate a list. Most systems already match that
   shape, and shutdown cleanup becomes a single loop instead of 15 hand-written lines.

### 3.2 No Dependency Injection / Service Locator 🟡

Still valid. Systems receive collaborators through constructors wired in `GameScene.createScene()`. Fine at this scale. Revisit once
enemies, loot and fatigue land (§11), since each will need FOV, dungeon and audio access.

**Proposal:** a lightweight `GameContext` object (dungeon, fov, audio, lights, events) passed to every system, instead of a full DI
container (YAGNI).

### 3.3 Missing Event Bus 🟡

Still valid. `MainScene` downcasts `scene.get("GameScene") as unknown as {...}` in several places and emits `"toggle-dev-mode"` as an
untyped string. **Fix:** a typed `GameEventBus` (a `Phaser.Events.EventEmitter` with a `GameEvents` map type) in a module singleton.

### 3.4 File Size Distribution

| File | Lines | Concern |
|---|---|---|
| LevelEditorController | 854 | Editor logic monolith |
| SettingsUI | 745 | Full settings overlay drawn with Graphics |
| FieldOfViewSystem | 631 | Raycast + canvas fog + torch bake + masks |
| LevelEditorOverlay | 588 | Editor UI |
| GameScene | 562 | Scene orchestrator |
| WeaponSystem | 511 | 3 weapon kinds + pooling + lightning |

`StoneGameHUD` is resolved: it went from 636 to 282 lines after extracting `BaseGameHUD`. **Recommendation:** split
`FieldOfViewSystem` into `VisibilityCaster` (geometry) + `FogRenderer` (drawing) as part of §2.4 and §6. That split is also where the
performance work lands.

---

## 4. Stack Selection

### 4.1 Phaser 3.90 — Correct Choice, but End of Line 🟢

Phaser fits a 2D top-down roguelike with arcade physics, lights, particles and tilemaps. 3.90 is the **final Phaser 3 release**.
**Phaser 4 is stable (4.2 shipped June 2026)** with a rewritten renderer: masks become *filters*, there is a new persistent
`Stencil` object, and `Mesh2D` batches with sprites. Those features map directly onto fog of war. Migration is a Tier 4 item: do it
only after the FOV no longer depends on `phaser-raycaster` (§2.4), because that plugin's v4 compatibility is unverified.

`phaser-raycaster 0.11.0`: unmaintained, and `castCircle` is roughly O(vertices × objects) (§2.4). **Recommendation upgraded:**
replace it with a grid DDA caster. That is a performance fix, not just hygiene.

### 4.2 TypeScript 6.0 — Fine 🟢

Strict mode is on. **Minor:** `noUnusedParameters` is still off. Enable it with the `_` prefix convention, which is already used
(`_delta`, `_time`).

### 4.3 Missing from the Stack

| Missing | Status | Why it matters |
|---|---|---|
| **Texture atlas** | 🔴 | All textures are generated at runtime. Light2D is single-texture, so no atlas means a flush per texture switch (§2.8). |
| **Object pools for FX** | 🔴 | Sprites are pooled, emitters and lights are not (§2.7). AGENTS.md requires pooling for high-frequency objects. |
| **State machine** | 🔴 | AGENTS.md requires FSMs. NPCs are still distance flags. Needed before any enemy exists (§11.1). A ~40-line typed `StateMachine<TState>` is enough; no library. |
| **Spatial hash / grid** | 🟢→🟡 | Downgraded: `NpcManager` already does viewport culling and NPC counts are ≤ 20. Revisit with enemies and loot. |
| **ECS / components** | 🟡 | Still relevant for loot-droppable, soul-linkable and burnable traits, but compose small behaviour objects first; a full ECS is Tier 4. |

---

## 5. UI / UX

### 5.1 Stone HUD Drawing — Re-tessellated Every Frame 🟡

**Corrected premise:** `drawMainPanel()` (~60 commands) is *recorded* on resize, but Phaser 3 `Graphics` **replays and
re-tessellates it every frame** (§2.6).

**Fix:** after drawing, `generateTexture("hud-stone-panel", w, h)` (or draw into a `RenderTexture`), show it as an `Image`, and destroy
the Graphics. Regenerate only on resize or style change. Apply the same treatment to slot frames (2 textures: selected and
unselected), the NPC speech-bubble body (a 9-slice `NineSlice` from one baked texture) and the chat bubble.

### 5.2 No Touch-Friendly Weapon Switching 🔴

Still valid: slots are 64 px (`slotSize = 64`), there is no gesture to cycle, and the selected slot shows only a 2.5 px amber border.

**Proposals:**
1. Slot hit area ≥ 72–80 px on touch devices (Apple HIG 44 pt / Material 48 dp minimum, plus thumb error margin).
2. Selected-slot cue: a slow ember glow, matching the torch vocabulary, instead of a UI pulse.
3. Optional: a two-finger swipe to cycle. Avoid one-finger swipes on the right half, which conflict with aiming (§10.2).

### 5.3 Settings Panel — Canvas-Drawn 🟡

[SettingsUI.ts](../game/src/ui/SettingsUI.ts) (745 LoC) draws everything with Graphics + Text: no native scroll, no Tab focus, no
accessibility, plus the per-frame cost from §2.6. **Proposal:** a DOM overlay for menus (settings, inventory later). The project
already uses DOM for `ChatInputOverlay`, so the pattern exists. Keep the in-game HUD in canvas.

### 5.4 NPC Dialogue — Missing Advancement Feedback 🟡

Still valid. Proximity auto-triggers, and the next line only rotates in after you leave the exit radius (140 px) and return.

**Environmental cue (no tutorial):** when an unread line is queued, the NPC's eyes glint once as you approach, and it turns toward
you sooner (NPC rotation toward the player already exists). The world signals "it has more to say" without UI.

---

## 6. Rendering Pipeline — Target Design

Current frame (GameScene camera), back to front:

```
floor TilemapLayer (Light2D) -> fog overlay (BitmapMask #1, depth 100) -> 751 wall images (Light2D, ABOVE fog)
-> torch parts (BitmapMask #2) -> projectiles / particles (ADD) -> NPCs + remote players (BitmapMask #3)
-> player -> speech bubbles  [+ grayscale postFX when paused]
MainScene camera: HUD (Graphics replayed each frame)
```

Target frame:

```
floor TilemapLayer (Light2D, atlas) -> wall TilemapLayer (Light2D, atlas, culled)
-> torches / NPCs / projectiles / player (atlas, pooled FX)
-> ONE fog quad (shader or low-res RT), drawn above all world objects -> speech bubbles
MainScene camera: HUD (baked images)
```

**Fog renderer options (pick one):**

| Option | How | Pros | Cons |
|---|---|---|---|
| A. Keep Canvas 2D, remove masks | Paint black-with-holes, show the canvas image directly above the world (§2.2 fixes 1 and 3) | Smallest change; keeps soft gradients | Still uploads ~1–3 MB per repaint |
| B. Low-res `RenderTexture` on GPU | `rt.fill(black)`; `rt.erase()` a fan `Graphics` of the polygon plus baked gradient images; quarter-res with LINEAR filter | No CPU→GPU bitmap upload; all GPU | Radial falloff clipped to the polygon needs either a second RT or per-vertex alpha |
| **C. 1D polar shadow map shader (recommended)** | Grid-DDA 512 angular rays → write distances to a 512×1 texture → a fragment shader (Phaser `Shader` or post pipeline) compares each pixel's polar distance against the map, with 3-tap PCF for soft edges and radial falloff | Tiny upload (2 KB), O(pixels) with a constant-cost shader, soft shadows for free, torches use the same technique (baked once) | New shader code; more upfront work |

Option C is the standard technique for 2D pixel-perfect soft shadows (polar shadow map / "1D shadow map"). It also makes the
Mental Fatigue mechanic (§11.6) a single uniform: `uFovRadius`.

---

## 7. Multiplayer & Networking

### 7.1 Transport & Rate — Good 🟢

Trystero P2P (WebRTC; relays in `public/network-relays.json`), a **20 Hz** position feed with interpolation on `RemotePlayer`, and
fire/chat events. Appropriate for co-presence in `arena` and `trademeet`.

### 7.2 No Authority / Validation 🟡

Peers trust each other's `pos` and `fire` messages. That is acceptable while multiplayer is social-only (no damage). **Before** PvP or
shared loot: clamp speed (max distance per tick), rate-limit `fire`, and pick a deterministic host (lowest peer id) for world state.

### 7.3 Remote Players Cost a Light Each 🟡

Each `RemotePlayer` adds a 260 px light. With 8 peers plus torches you hit the `maxLights` cap from §2.1. Phaser drops the farthest
lights, which is fine, but give remote torches a lower priority by reducing their radius when off-screen.

### 7.4 Pause Is Disabled in Shared Rooms 🟢

`canUseGameplayPause()` already disables RTwP in `arena` and `trademeet`. Correct, since you cannot pause a shared world. Keep it.

---

## 8. Audio

### 8.1 Two AudioContexts 🟡

Still valid ([AudioSystem.ts](../game/src/systems/AudioSystem.ts)). Use one `AudioContext` with separate `GainNode` buses for SFX
and music. Pause SFX by ducking the SFX bus or suspending sources, not the whole context. Two contexts also double the audio-thread
cost on old CPUs.

### 8.2 Asset Formats 🟡 (corrected)

Most files are already `.mp3`. Only the five **shock rifle** effects are `.wav` (32–84 KB each, about 270 KB total). Converting them to
`.ogg`/`.mp3` saves about 200 KB, a minor gain. Higher value: decode SFX once and reuse `AudioBuffer`s rather than streaming.

### 8.3 Procedural Music — Good 🟢

`MusicDirector` generates music procedurally with oscillators and an LFO drone. It fits the liminal atmosphere and adds no download
cost. **Idea:** drive it from game state (torch proximity warms the drone; darkness thins it to a single detuned tone; fatigue adds
slow pitch drift). That gives an audio cue in place of a UI cue.

---

## 9. Level System

### 9.1 Layout Generation — Works, but Inflexible 🟡

Still valid. `generateLayout` returns `boolean[][]`. Matrix levels already carry `tiles: number[][]`. **Proposal:** promote
`number[][]` + a tile dictionary (`{ walkable, opaque, texture, noise, flammable }`). `opaque` feeds the grid-DDA caster (§2.4),
`noise` feeds stealth (§11.5), and `flammable` feeds fire ecology (§11.3), all from data.

### 9.2 Bake Static Geometry at Load 🟡

On level load, compute once: merged wall rectangles (physics + occluders), the wall TilemapLayer, the torch light-map, and an
opacity grid for the caster. Keep this in `DungeonSystem` so the editor's `refreshRuntimeObjects` can rebake it.

---

## 10. Mobile

### 10.3 No Secondary Weapon on Mobile 🔴

Still valid: only `onRightHalfClick` is wired. **Fix:** long-press (≥ 300 ms) on the right half triggers secondary (blink / sphere)
at the pressed point. Show a growing ring under the finger during the press as feedback.

---

## 11. Gameplay, Fun & Game Feel

**What exists:** exploration with raycast fog, fireball + blink, shock-rifle ray + sphere combo (ray hits sphere → huge explosion),
NPCs with emotions and rotating dialogue, flickering torches that reveal fog, RTwP pause with a grayscale transition, and a P2P chat
arena. **What is missing:** a reason to be careful. There is no threat, no stake and no goal, so pause, stealth and fog have nothing to
push against. Every proposal below reuses systems that already exist.

### 11.1 First Threat: "The Still One" (FSM) 🔴

An SCP-173-style entity that **moves only while outside the player's visibility polygon** and freezes when seen. Torches pin it in
place.
- Uses the existing FOV (a point-in-polygon or polar-map lookup), so it is cheap and needs no new rendering.
- FSM states: `Dormant → Stalking → Frozen (seen) → Lunge (adjacent and unseen)`.
- Ecological: it avoids light because light means being seen. Players discover that fireballs and torches are defensive tools.
- Makes fog, light and pause matter straight away.

### 11.2 Make Pause Tactical 🟡

RTwP currently only freezes time. **Proposal:** while paused, allow **queued orders**: click to queue casts and blink with ghost
trajectory lines, and resume to execute them in order. Optional auto-pause triggers ("threat seen", "ally hurt"), toggled in Settings
(the Baldur's Gate / Pillars of Eternity convention).

### 11.3 Fire Ecology 🟡

The fireball already carves light into the fog. Lean into it:
- Fireball **lights unlit torches** and the sphere's electric burst **snuffs** them. That gives cause and effect on the FOV, and level
  design gains dark corridors you scout by *throwing light*.
- Flammable tiles (§9.1) burn briefly: a temporary light, a noise source, and a hazard.

### 11.4 Honest Loot v1 🟡

When enemies exist, they drop **what they visibly used**, and the cause of death shapes the drop: fire chars scrolls (unreadable
fragments, which become lore), shock fuses metal (a heavier but stronger item), a blink-crush leaves everything intact. No random
tables.

### 11.5 Stealth from the Analog Joystick 🟡

Noise radius = f(speed) × the floor tile's `noise` value. Slow tilt is silent, full tilt is loud. Emit the radius as an event that the
FSM hears. Feedback comes through the world, not UI: footstep volume and a faint dust puff at speed.

### 11.6 Mental Fatigue ("Dopamine Detox") 🟡

`fovRadiusTiles` is `readonly` today. Make it a runtime value that shrinks slowly with session time (for example −10 % per 15 min
after 30 min), add rare stumble frames (a short input lag), and let the music detune (§8.3). With the polar-map fog (§6 option C)
the radius is one shader uniform. With the canvas fog, rebake the player gradient only when the radius crosses 0.5-tile buckets.

### 11.7 Game Feel (Juice) — Cheap Wins 🟡

| Effect | Where | Cost |
|---|---|---|
| Hit-stop 40–60 ms on big impact (`physics.world.pause` + timer) | sphere-combo explosion | free |
| Small camera shake (`cameras.main.shake(80, 0.003)`) | impacts, blink arrival | free |
| Cast recoil: a 2 px player kick opposite the aim direction | every cast | free |
| Blink: short afterimage (one pooled sprite fading) | `PlayerTeleport` | ~free |
| "Heavy" stone click on slot change (AGENTS.md audio priority) | HUD | asset |

Avoid juice built on postFX (bloom, glow) because it adds full-screen passes (§2.2).

---

## 12. Priority Roadmap

Ranked by **impact ÷ effort**. Performance comes first, since nothing else is fun at 18 FPS.

### Tier 0 — Hotfixes (hours, measure after each)

| # | Action | Section |
|---|---|---|
| 1 | Verify hardware WebGL on the old PC; add FPS / frame ms / GPU renderer to the dev overlay | 2.12 |
| 2 | `render.maxLights` 100 → 12 | 2.1 |
| 3 | `arcade.fps` 120 → 60 | 2.5 |
| 5 | Throttle progress save to ~1 s + save on `pagehide` | 2.10 |
| 6 | Cache angles before sorting FOV intersections | 2.4 |

### Tier 1 — High Impact (1–3 days each)

| # | Action | Section |
|---|---|---|
| 10 | Quality presets + render scale + auto-detect | 2.11 |
| 11 | Pool projectile / impact emitters and lights | 2.7 |
| 12 | Bake HUD / bubble Graphics into textures | 2.6, 5.1 |
| 13 | Merge wall tiles into rectangles (occluders + physics) | 2.4 |
| 14 | Mobile secondary fire (long-press) | 10.3 |

### Tier 2 — Gameplay Foundations (3–5 days each)

| # | Action | Section |
|---|---|---|
| 15 | Typed `StateMachine` + first threat "The Still One" | 4.3, 11.1 |
| 16 | Grid-DDA visibility caster, removing `phaser-raycaster` | 2.4, 4.1 |
| 17 | Texture atlas + wall TilemapLayer | 2.8, 2.9 |
| 18 | Fire ecology (light / snuff torches) | 11.3 |
| 19 | Game-feel pass (hit-stop, shake, recoil, afterimage) | 11.7 |
| 20 | Single AudioContext with gain buses | 8.1 |

### Tier 3 — Strategic (1–2 weeks each)

| # | Action | Section |
|---|---|---|
| 21 | Polar shadow-map fog shader (torches included) | 6 (C) |
| 22 | Pause with queued orders + auto-pause triggers | 11.2 |
| 23 | Stealth noise + Mental Fatigue | 11.5, 11.6 |
| 24 | Typed `GameEventBus` + `GameContext` | 3.2, 3.3 |
| 25 | DOM overlay for settings | 5.3 |
| 26 | Tile dictionary (`number[][]` + properties) | 9.1 |

### Tier 4 — Foundational (if scaling beyond current scope)

| # | Action | Section |
|---|---|---|
| 27 | Honest loot system | 11.4 |
| 28 | Component model for entity traits | 4.3 |
| 29 | Multiplayer authority / validation (before PvP) | 7.2 |
| 30 | Evaluate migration to Phaser 4 (after #16) | 4.1 |

**Expected outcome (estimate, to be verified with §2.12):** Tier 0 items 2–4 plus Tier 1 item 9 remove the 100-light shader loop and
all ~10 extra full-screen mask fills per frame. On the reported PC that should move the game from <20 FPS to a stable 45–60 FPS at
1080p, *provided* WebGL is hardware-accelerated.

---

> **Bottom line:** The code is clean, and the stack (Phaser + TypeScript + Rsbuild + Biome) is sound; there is no reason to switch
> engines now. The low-end slowdown comes from a few fill-rate-heavy choices (`maxLights: 100`, BitmapMask fog, full-screen canvas
> uploads, 120 Hz physics), and each has a cheap fix. After that, the biggest lever is **gameplay**: a single FSM threat that lives in
> the fog turns the existing FOV, light, pause and blink systems into a game.

---

## 13. Changelog of This Review

- **Added:** §2 Performance investigation (P1–P11) with verification steps; §6 rendering target design; §7 multiplayer; §11 gameplay
  and game feel; Tier 0 hotfix tier.
- **Corrected:** §1 snapshot (LoC, file count, Phaser 3.90, Biome 2.6, Yarn node-modules linker, level stats); §3.4 file sizes
  (StoneGameHUD split done); §5.1 premise (Graphics replays every frame, not only on resize); §8.2 (only the shock-rifle SFX are WAV);
  §4.3 spatial hash downgraded (viewport culling exists).
- **Upgraded:** §4.1 replacing `phaser-raycaster` is now a performance item; §4.3 atlas and FX pools are now performance items.
- **Re-verified, still valid:** §3.1–3.3, §5.2–5.4, §8.1, §9.1, §10.1–10.3.
