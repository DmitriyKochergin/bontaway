# Performance Lag Diagnostics Plan

Status: PLAN ONLY — no implementation in this document.
Scope: root-cause the machine-dependent low FPS (20-30 fps on some PCs, "gets better after a while") and
design additional dev-mode on-screen diagnostics to prove which suspect is guilty.

---

## 1. Symptom Profile

- Loading finishes, then FPS sits at 20-30 on *some* machines.
- Same build runs fine elsewhere.
- Sometimes recovers after some time on its own.

Interpretation:
- Machine-dependent + no data change => **GPU / fill-rate bound**, not logic bound.
- "Recovers after a while" => shader compilation stalls, WebGL warm-up, texture-upload caching, JIT warm-up,
  or thermal throttle recovery. All point to GPU pipeline pressure, not a per-frame allocation leak alone.

---

## 2. Prime Suspects (ranked by likelihood)

### S1 — Renderer fell back to Canvas2D (HIGH, cheap to confirm)
- `config.ts:9` uses `type: Phaser.AUTO`. On machines with blocked/failed WebGL, Phaser silently uses Canvas2D.
- Canvas2D cannot batch and ignores `Light2D` (lighting just won't render) — massive draw-call cost.
- No `powerPreference: "high-performance"` set, so laptops may pick the integrated GPU.
- Confirm by displaying `game.renderer.type` (WEBGL=1, CANVAS=2) + GPU vendor/renderer string.

### S2 — Light2D pipeline stamped on every tile (HIGH)
- `DungeonSystem.ts:93,131,147,163` sets `setPipeline("Light2D")` on **every** floor tile, wall, door, obstacle.
- Map is `96 x 64` (`DungeonSystem.ts:7-8`) => up to ~6000 floor images, each a Light2D-lit object.
- `Player.ts`, `NPC.ts`, `WeaponSystem.ts` also Light2D. Light2D is a heavier forward-lit shader and scales
  with (objects x lights). On weak/integrated GPUs this is the classic 20-30 fps cliff.
- Confirm by displaying draw-call count, display-list size, and active light count.

### S3 — Full-screen canvas FOV mask re-uploaded to GPU every refresh (HIGH)
- `FieldOfViewSystem.ts:108-203 redrawFovMask()` on a full-screen CanvasTexture:
  `clearRect` + `fillRect` + `createRadialGradient` (lines 130-158) then `fovMaskTexture.refresh()` (line 202).
- `refresh()` re-uploads the **entire screen-sized texture to the GPU** each redraw (~30 fps via `fovRefreshMs=33`).
- Extra `BitmapMask` (`:78`) on a full-screen overlay = an extra full-screen render pass every frame.
- Per-projectile / per-explosion `createRadialGradient` inside the same loop (lines 171,187).
- Texture upload cost is very GPU/driver dependent and can "warm up" — matches the symptom.
- Confirm by displaying FOV redraws/sec and last redraw duration (ms).

### S4 — Thousands of individual sprites instead of a batched layer (MEDIUM)
- Floor rendered as individual `scene.add.image` per tile (`DungeonSystem.ts:84-95`); walls/obstacles as
  individual static images. High object count inflates the display list and per-frame render iteration.
- Confirm with display-list size + draw-call count.

### S5 — Physics at 120 Hz (MEDIUM-LOW)
- `config.ts:24 fps: 120` doubles arcade steps vs 60. CPU-side, but adds up on weak CPUs.
- Confirm with update-time (ms) and physics body count.

### S6 — Per-frame allocations / GC pressure (LOW, contributes to jitter not baseline)
- `FieldOfViewSystem.ts:124` allocates a new `Vector2` per intersection + `.sort()` each redraw.
- `Player.ts:128` `new Phaser.Math.Vector2(0,0)` per frame.
- `removeProjectile/removeExplosion` rebuild arrays via `.filter()` (`:97,105`).
- Confirm with JS heap trend + GC sawtooth via on-screen heap readout.

### S7 — Device resolution / DPR fill-rate (MEDIUM on hi-DPI + weak GPU)
- `scale.mode: RESIZE` (`config.ts:39`) renders at full window size; with high `devicePixelRatio` the
  pixel count (and Light2D + mask fill cost) explodes. Explains one PC slow, another fine at same window size.
- Confirm by displaying canvas backing resolution and DPR.

---

## 3. Additional Dev-Mode On-Screen Diagnostics (design)

Extend the existing `DevModeOverlay` (already toggled via `toggle-dev-mode`, `GameScene.ts:129`). Add a
diagnostics panel (top-left block under the current FPS label). Each metric below is chosen to indict or clear
a specific suspect. Sample expensive metrics at ~4 Hz (every 250 ms), not every frame, so the overlay itself
does not distort readings.

### Panel A — Frame timing (all machines)
- `FPS now` + `FPS avg/min` over a rolling ~1s window (min exposes stalls hidden by average).
- `Frame time` ms = `game.loop.delta`; also worst frame in window.
- `Dropped frames` counter: count frames where delta > 1.5x target.
- Purpose: quantify the problem and catch spikes vs steady low FPS.

### Panel B — Renderer identity (proves S1, S7)
- `Renderer`: WEBGL vs CANVAS from `game.renderer.type`.
- `GPU`: unmasked vendor/renderer via WebGL `WEBGL_debug_renderer_info` (best-effort; may be blocked).
- `DPR` = `window.devicePixelRatio`; `Backing res` = canvas width x height (actual pixels drawn).
- Purpose: instantly reveals Canvas fallback and hi-DPI fill-rate blowups — the cheapest possible win.

### Panel C — GPU render load (proves S2, S3, S4)
- `Draw calls`: WebGL renderer draw/batch count (e.g. pipeline `batches`/`drawCount`) for the frame.
- `Display objects`: size of the scene display list (approximate object count).
- `Lights`: `this.lights.lights.length` active count.
- Purpose: separates "too many lit objects" (S2/S4) from "mask upload" (S3).

### Panel D — FOV cost (proves S3)
- `FOV redraws/sec` and `FOV last redraw` ms (wrap timing around `redrawFovMask`).
- `Occluders`, `Projectiles`, `Explosions` counts feeding the mask.
- Purpose: shows how much of the frame budget the fog/mask eats.

### Panel E — CPU / logic (proves S5, S6)
- `Update` ms: measured around the scene `update()` body.
- `Physics bodies`: active arcade body count.
- `JS heap`: `performance.memory.usedJSHeapSize` MB when available (Chromium). Watch for sawtooth = GC.
- Purpose: rules logic/GC in or out as a secondary cause.

### Panel F — Toggles for A/B isolation (fastest root-cause path)
Add dev-only hotkeys to disable one suspect at a time and read the FPS delta live:
- Toggle Light2D pipeline on/off for dungeon + entities (isolate S2).
- Toggle FOV mask redraw/refresh (isolate S3).
- Toggle physics fps 120 <-> 60 (isolate S5).
- Toggle forced WebGL vs allow Canvas (documentation note; requires restart, so surface as a flag/log).
Purpose: turning one knob and watching FPS jump is the definitive proof of the guilty party.

---

## 4. Execution Plan (when implementation is approved)

Phased, each step independently testable:

1. **Instrumentation only** — extend `DevModeOverlay` with Panels A-E (read-only metrics). No gameplay change.
   Verify overlay updates at ~4 Hz and does not itself cost FPS.
2. **Isolation toggles** — add Panel F hotkeys (guarded behind dev mode). Verify each toggle flips the target
   system without crashing.
3. **Field capture** — run on the slow PC, screenshot/record the panels. Record: renderer type, draw calls,
   FOV redraw ms, lights count, DPR/backing res, and the FPS delta from each Panel-F toggle.
4. **Diagnose** — map captured numbers to Section 2 suspects. Expected top offenders: S1 (Canvas fallback),
   S2 (Light2D on ~6000 tiles), S3 (full-screen mask upload).

## 5. Likely Fixes (out of scope here — for a follow-up plan)
- Force WebGL + `powerPreference: "high-performance"`, log a visible warning on Canvas fallback.
- Replace per-tile Light2D floors with a batched tilemap/blitter layer; limit Light2D to a small lit set.
- Cap render resolution / clamp DPR; avoid re-uploading a full-screen canvas mask (RenderTexture or geometry mask).
- Reduce physics fps to 60; pool projectiles; remove per-frame Vector2 allocations.

---

## 6. Verification Gate
- "Diagnosed" requires: on-screen numbers captured from the slow machine AND at least one Panel-F toggle
  producing a measurable FPS jump that names the suspect. No claim of root cause without that evidence.

