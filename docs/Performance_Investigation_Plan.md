# Performance Investigation Plan

## Scope

Investigate reports that gameplay reaches 20–30 FPS on another PC after the loading UI completes, then sometimes recovers. This document deliberately contains **no implementation changes**. It defines evidence to collect, experiments to run, and the order for any later fixes.

## Current Code Evidence

### Likely primary bottleneck: field of view

`game/src/systems/FieldOfViewSystem.ts` redraws the FOV mask:

- immediately during construction (`createFovOverlay()` → `redrawFovMask()`), and
- during movement at most every 33 ms, roughly 30 times per second (`update()` lines 205–223).

Each redraw currently performs all of the following:

1. Runs `raycaster.update()` and `castCircle()` against every dungeon wall / obstacle occluder.
2. Allocates and angle-sorts a new visibility-point array.
3. Clears and repaints a CanvasTexture at the full browser viewport size.
4. Creates radial gradients for player visibility and each active projectile / explosion.
5. Calls `CanvasTexture.refresh()`, uploading the canvas to the renderer.

This cost grows with viewport pixel count. A 4K screen has four times the pixels of 1080p before device-pixel-ratio effects. It also depends on browser GPU acceleration. This is strongest explanation for steady 20–30 FPS that varies by PC.

### High-cost scene startup after loading UI

The loader completion handler starts `MainScene`, which launches `GameScene`. `GameScene.createScene()` then synchronously constructs the dungeon, lighting, player, FOV mask, HUD, NPCs, physics colliders, and audio.

`game/src/systems/DungeonSystem.ts` creates individual `Image` / `StaticImage` objects for every walkable floor and boundary wall, assigning each the `Light2D` pipeline. The arena alone produces 1,600 floor objects before walls, obstacles, NPCs, HUD, and masks. Startup work is therefore outside the network asset progress bar. Slow hardware can appear to finish loading before the renderer, JIT compiler, GPU shaders, and scene objects settle.

### Secondary contributors

- `game/src/config.ts` sets Arcade Physics to 120 FPS. Measure whether the lower-end machine performs extra fixed physics work per display frame.
- `game/src/entities/Player.ts` allocates a `Phaser.Math.Vector2` every game update. `MobileControlsSystem.ts` also allocates one for each joystick move event. These are GC pressure, not the first suspect.
- Each fireball creates a sprite, light, particle emitter, collider, timer, and `update` listener. Explosions create more particles, a light, and another listener (`WeaponSystem.ts`). This can worsen combat FPS and needs a separate test scenario.
- FOV projectile / explosion removal uses `Array.filter()`, allocating new arrays. Minor at low spell counts; relevant under repeated casting.
- HUD and NPC graphics redraw on resize, selection, hover, or dialogue transitions. They are event-driven, not a likely cause of idle low FPS.
- `pixelArt: true` is not yet proven to be a cause. The source comment says it drops performance, but no benchmark supports that claim. Treat it as an A/B test only.

## Investigation Order

### 1. Establish a repeatable baseline

Run the production build, not the development server. Record the following for both the affected PC and a known-good PC:

| Field | Record |
| --- | --- |
| Browser and version | Include whether hardware acceleration is enabled |
| OS, GPU, driver, display resolution | Include external monitor / battery mode |
| Browser viewport CSS size | Width × height |
| `window.devicePixelRatio` | Important for CanvasTexture upload cost |
| Phaser renderer | WebGL or Canvas fallback |
| FPS / frame time | Median, 1% low, and worst 1-second burst |
| Duration | First 30 seconds, then minutes 1–2 |
| Scene and action | Idle, walking, spell casting, NPC proximity |

Use the same level and a fresh page reload for each comparison. Record frame time in milliseconds as well as FPS: 30 FPS is 33.3 ms/frame; 20 FPS is 50 ms/frame.

### 2. Capture a CPU and GPU profile on the affected PC

Use browser DevTools Performance recording for three 15-second windows:

1. immediately after gameplay becomes visible, standing still;
2. walking continuously through the map;
3. repeatedly casting fireballs while walking.

Enable screenshots and memory statistics if available. Preserve the trace export. For every recording, identify:

- main-thread time in `FieldOfViewSystem.redrawFovMask`, `CanvasRenderingContext2D`, `CanvasTexture.refresh`, raycaster calls, Arcade Physics, and rendering;
- long tasks over 50 ms and their callers;
- GC events, their duration, and whether allocations rise continuously;
- GPU / raster time and WebGL context warnings;
- whether the active renderer is hardware WebGL or a software/Canvas fallback.

**Decision gate:** if FOV-related work accounts for the majority of walking-frame time, investigate FOV first. If rendering/GPU dominates without FOV frames, inspect renderer fallback, texture upload, Light2D, and screen resolution first. If GC dominates, inspect allocation sources before changing rendering.

### 3. Run controlled feature-isolation builds

Do not combine experiments. Rebuild and measure one switch at a time on the affected PC. Compare median frame time and 1% low to the baseline.

| Experiment | Hypothesis tested | Expected diagnostic result |
| --- | --- | --- |
| Disable only FOV redraw / mask refresh | Full-screen canvas upload and raycast dominate | Large improvement while walking confirms FOV path |
| Keep FOV but bypass raycasting polygon | Raycaster/occluder processing dominates | Improvement isolates raycast cost from canvas upload |
| Keep raycast polygon but use a fixed low-resolution mask | Canvas size / upload dominates | Improvement scales with viewport / DPR |
| Reduce browser viewport to 1080p-equivalent | Resolution-sensitive rendering cost | Large improvement points to fill/upload/GPU pressure |
| Disable Light2D for map objects | Light2D pipeline / shader overhead dominates | Improvement points to lighting, not FOV |
| Change Arcade Physics from 120 to 60 | Extra physics steps dominate | Improvement points to fixed-step physics cost |
| Disable spell effects, then fire rapidly | Transient lights, particles, listeners dominate | Only combat improves if weapons are the culprit |
| Compare `pixelArt` on vs. off | Pixel-art rendering choice matters | Keep only if measured result is material |

For every experiment, retain a trace. A visual observation without frame-time evidence does not close a case.

### 4. Determine why FPS later recovers

The recovery is a clue, not a verdict. Capture a 60-second trace from fresh gameplay launch and mark the exact recovery time. Correlate it with:

- completion of scene construction and first FOV mask upload;
- shader / texture warm-up and browser JIT optimization;
- garbage collection settling after startup allocations;
- fireball particle, light, and delayed cleanup completion;
- browser GPU process startup or a changed power state.

Repeat the same trace with no player movement and no spell casts. If the recovery does not occur while idle, movement-triggered FOV work is more likely than one-time startup work. If it occurs while idle, renderer warm-up, GC, GPU state, or background system activity remains in play.

## Implementation Backlog, Only After Measurements

Prioritize only items confirmed by the baseline and isolation results.

### P0 — FOV path, if confirmed

1. Redraw only when the FOV origin crosses a meaningful world-space threshold, camera dimensions change, or dynamic lights move enough to alter visible pixels.
2. Separate occluder geometry from screen-space painting. Avoid rebuilding static raycaster data each refresh if the library permits it.
3. Reuse visibility-point buffers and avoid per-refresh vector allocation and sorting where raycaster ordering is sufficient or can be made stable.
4. Render the FOV mask at a bounded internal resolution, then scale it, preserving the intended fog aesthetic while reducing canvas upload area.
5. Cap dynamic FOV-light contributions and coalesce multiple moving lights into a bounded update budget.

Acceptance target: stable walking at the agreed device target with FOV still revealing walls and dynamic spell light correctly.

### P1 — Static dungeon rendering and lighting, if confirmed

1. Replace thousands of independent floor images with tilemap/layer batching or another static-map representation compatible with lighting needs.
2. Keep collision geometry independent from visible wall decoration, then merge or reduce static physics bodies where profiler evidence supports it.
3. Restrict expensive lighting work to visible map content and a small, deliberate light count.
4. Move scene construction behind a real post-load preparation phase or incremental construction only if startup traces show long tasks.

Acceptance target: no long main-thread task during scene entry and no sustained FPS loss caused by off-screen map objects.

### P2 — Allocation and combat cleanup, if confirmed

1. Reuse player and mobile joystick vectors.
2. Replace removal-time array copies with bounded collections / in-place removal where profiles show GC impact.
3. Pool fireball sprites, emitters, lights, and effect state; maintain a strict concurrent spell-effect cap.
4. Remove per-projectile scene update listeners in favor of one system update loop if listener dispatch appears in traces.

Acceptance target: repeated fireball casts do not degrade 1% low FPS or grow retained memory after effects finish.

### P3 — Browser/device resilience

1. Detect and report Canvas fallback, WebGL context loss, and software rendering in development diagnostics.
2. Expose a quality tier only after baseline data establishes safe values for FOV mask scale, FOV refresh rate, lighting, and effect caps.
3. Verify power mode, browser hardware acceleration, and GPU driver status on the affected PC before treating a hardware fallback as a game-code regression.

## Success Criteria

A change is accepted only when fresh production-build traces show all of the following on the affected PC:

- gameplay stays at the chosen target FPS during 60 seconds of continuous walking;
- 1% low frame time meets the agreed budget;
- first 30 seconds after scene entry has no unexplained long task or delayed recovery;
- rapid fireball casting does not cause a sustained decline after effects expire;
- FOV, occlusion, lighting, collision, and pause behavior remain visually and mechanically correct;
- no retained object or listener growth after a scene restart and effect cleanup cycle.

## Not Yet Proven

The source confirms that FOV and startup create significant work. It does **not** prove their exact millisecond cost on the other PC. Browser renderer mode, GPU acceleration, viewport resolution, device pixel ratio, DevTools traces, and a controlled FOV-off comparison are required before modifying gameplay code.

