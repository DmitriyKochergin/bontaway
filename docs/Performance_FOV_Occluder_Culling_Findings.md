# Performance Findings: FOV Occluder Culling

Status: FIX SHIPPED AND CONFIRMED.
Scope: root-caused and fixed a location-dependent FPS drop while casting fireballs on the move. This document
records the diagnosis, the fix, the evidence, and the remaining backlog for further FOV/lighting work.

Related: `Performance_Investigation_Plan.md` (P0 FOV backlog), `Performance_Lag_Diagnostics_Plan.md` (suspects S2/S3).

---

## 1. Symptom

- Same machine, same action (running while repeatedly casting fireballs).
- Top-left corner of the dungeon: FPS dropped to ~90.
- Bottom-right room: stable ~120.
- Location dependence on one machine rules out machine-wide suspects (Canvas fallback S1, DPR/resolution S7,
  physics-step rate S5). It points at work that scales with what is on screen / inside the FOV radius.

---

## 2. Root Cause

The field-of-view raycast (`FieldOfViewSystem.redrawFovMask` -> `fovRay.castCircle`) was tested against
**every wall and obstacle in the whole 96x64 map** (`this.raycasterOccluders`).

`phaser-raycaster`'s `castCircle` (`node_modules/phaser-raycaster/src/ray/castCircle.js`) has two cost centers:

1. **An `O(N^2)` pairwise loop over the passed `objects`.** The inner `j` loop is `for (j = i+1; j < objects.length; j++)`
   and is **not range-gated** — it runs `RectangleToRectangle` for every remaining object in the list, even ones far
   outside the ray range. Passing the full map made this cost scale with `in-range x total-map-objects`.
2. **A per-ray cast phase** that casts rays toward each in-range corner and tests each against the in-range
   objects — roughly `in-range^2`.

Both terms grow with the number of occluders inside the FOV radius (15 tiles ~= 480 px).

Why the top-left is worse (see `game/src/levels/dungeon.ts`):

- The top-left is a maze of small rooms and short passages -> many wall rectangles inside the FOV radius.
- **All 8 `obstaclePlacements` live in the top-left** (tileX 6.5-39.5, tileY 6.5-27.5).
- The bottom-right is large open rooms with **zero obstacles** -> far fewer occluders in radius.

Why the fireball made it visible: an in-flight projectile sets `hasDynamicLights = true`, which keeps
`redrawFovMask()` firing at the full ~30 Hz throttle continuously while the player moves. So the dense-area
`castCircle` cost is paid every tick during "cast fireballs while running." The existing code comment in
`FieldOfViewSystem.update()` already flagged this: *"castCircle against every occluder ... tanked FPS in the
wall-dense dungeon."*

This is the location-dependent half of suspects **S2/S3** in the diagnostics plan.

---

## 3. Fixes Applied

### Fix 1 — Occluder culling before the raycast (SHIPPED, confirmed 120 FPS)

`FieldOfViewSystem.collectOccludersInRange()` — before each `castCircle`, filter `raycasterOccluders` down to
only those whose axis-aligned bounding box overlaps the square that circumscribes the FOV circle, and pass that
subset as `castCircle({ objects })`.

- **Correct by construction.** The FOV circle is inscribed in the cull square, and rays are clamped to the FOV
  range, so no in-range occluder is ever dropped. The visibility polygon (fog) is pixel-identical.
- **Kills the wasted work.** `objects` shrinks from ~every wall in the map to the local FOV window (dozens), so
  the `O(N^2)` pairwise pass no longer multiplies by total map wall count.
- **Allocation-free.** Reuses a single persistent array, so no new per-redraw GC.
- Verified: `tsc --noEmit` -> exit 0; Biome lint -> exit 0. Confirmed in play: stable 120 FPS in the top-left
  corner (previously ~90).

### Fix 2 — Projectile light decoupled from the shadow raycast (SHIPPED)

`redrawFovMask()` was split into `recomputeVisibilityPolygon()` (the raycast) and `paintMask()` (canvas repaint +
projectile/explosion light stamping). The shadow shape depends only on the player's position, so `update()` now
recomputes the raycast **only when the player actually moved**; while a fireball flies past a stationary player it
reuses the cached world-space polygon and just re-stamps the moving light.

- **Cheap hot path.** `castCircle` no longer runs on every ~30 Hz tick during "cast fireballs on the run" — only
  the canvas repaint + texture upload does.
- **Pixel-identical fog.** The cached polygon is stored in world space and re-projected at the current camera
  scroll each paint, so shadows match a fresh raycast while the player holds still.
- **Stale-light guard.** One extra paint fires when the last projectile/explosion ends, so its carved light hole
  does not linger in the fog (which re-closes) until the player next moves.
- Verified: `tsc --noEmit` -> exit 0; Biome lint -> exit 0. Runtime FPS / visual correctness not measured here.

---

## 4. Remaining Backlog (next improvements, by impact)

| # | Improvement | Impact | Effort | Risk |
| - | ----------- | ------ | ------ | ---- |
| ~~1~~ | ~~Decouple the projectile light from the shadow raycast~~ **(SHIPPED — see Fix 2)** | High (this scenario) | Med | Med |
| 2 | Greedy-mesh wall tiles into merged rectangles for the raycaster | Very High in dense areas | Med-High | Med |
| 3 | Wire Panel D diagnostics (FOV redraw ms + occluder count) | Enables measurement | Low | Low |
| 4 | Skip per-redraw `raycaster.update()` for static geometry | Med | Low | Med (library contract) |
| 5 | Cull off-screen Light2D objects / batch floor rendering (S2/S4) | Med | High | Med |

### 1. Decouple projectile light from the shadow raycast — SHIPPED (Fix 2)
Done. `redrawFovMask()` split into `recomputeVisibilityPolygon()` + `paintMask()`; the raycast now runs only when
the player moves, and a flying fireball past a stationary player only re-stamps light onto the cached shadow. See
Section 3, Fix 2.

### 2. Greedy-mesh wall tiles for the raycaster
Each 32 px wall is currently its own occluder rectangle (4 corners / 4 segments). Merge coplanar wall runs into
larger rectangles for the raycaster only (keep per-tile visuals and physics). A 10-tile run becomes 1 rectangle,
directly shrinking the `in-range^2` ray-cast term where density is highest.

### 3. Wire Panel D diagnostics
Add `FOV last redraw` ms and occluder/projectile/explosion counts to `DevModeOverlay` (design already in
`Performance_Lag_Diagnostics_Plan.md`, Panel D). Turns items 1, 2, and 4 from assumed wins into measured ones and
satisfies the plan's Verification Gate.

### 4. Skip per-redraw `raycaster.update()`
Occluders are static and mapped once with `dynamic = false`. Calling `raycaster.update()` every redraw is likely
redundant. Confirm the library contract, then map once and drop the per-redraw update. Medium risk: a wrong
assumption can make the first cast return nothing.

### 5. Reduce location-dependent Light2D cost
`Light2D` runs every rendered frame for every lit object on screen; the dense top-left puts more lit sprites in
view. Cull off-screen lit objects and/or batch the per-tile floor images. Larger refactor (diagnostics-plan P1).

---

## 5. Reusable Gotcha

`phaser-raycaster`'s `castCircle` inner `j`-loop is not range-gated, so handing it the full mapped object set
costs roughly `in-range x total-mapped` even for far-away objects. Always pass a spatially-culled subset of
occluders to `castCircle` / `castCone`, not the whole map. This is the key lever behind the fix above.

