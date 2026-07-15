# Master Design Document: Pocket Rogues + Baldur's Gate Project

## 1. Core Philosophy & Vision
**Goal:** A tactical 2D Action-RPG with high agency, "fair" world logic, and zero hand-holding.

*   **[User Vision]:**
    *   **Static World:** Handcrafted maps instead of infinite procedural generation.
    *   **No Manuals:** Exploration-driven discovery. Players learn by doing/dying.
    *   **Atmosphere:** Heavy "Stone" UI, Latin incantations ("Vita, Mortis, Careo"), and a dark, immersive vibe.
    *   **Tactical Freedom:** RTwP (Real-Time with Pause) for complex combat management.
*   **[AI Synthesis]:**
    *   **Ecological Realism:** Everything in the world follows logical rules (e.g., sound travels, water conducts electricity).
    *   **Dopamine Detox:** An in-game fatigue system to encourage meaningful, focused play sessions rather than mindless grinding.

---

## 2. Movement & Control (The "Feel")

### 2.1 Dynamic Virtual Joystick
*   **[User Request]:** Needs to be "smarter" than Pocket Rogues. Finger placement shouldn't be restricted to a fixed center.
*   **[AI Solution]:** 
    *   **Mechanism:** The joystick center is set at the point of first contact on the left screen.
    *   **Analog Vector:** The distance from the center determines speed (Stealth vs. Run).
*   **[Requirements]:**
    *   Implement `AdvancedJoystick` class with `moveVector` and `force` outputs.
    *   Visual feedback: Dynamic joystick ring appears on touch.

### 2.2 Stealth & Noise
*   **[User Request]:** Ability to move slowly to avoid detection (thief/assassin style).
*   **[AI Solution]:**
    *   **Noise Radius:** Tied to the joystick `force`. High force (running) = large radius. Low force (sneaking) = minimal radius.
    *   **Enemy AI:** 120-degree vision cones. Detection triggers the Auto-Pause mechanism.

---

## 3. Tactical Systems (RTwP & Magic)

### 3.1 Real-Time with Pause (RTwP)
*   **[User Request]:** Tactical control in any moment. When paused, the world should go grayscale (Braid/BG2 style).
*   **[AI Solution]:**
    *   **State Control:** Global `isPaused` flag stops physics and animations.
    *   **Visual FX:** Grayscale ColorMatrix shader applied to the main camera.
    *   **UI Interaction:** Allow spell targeting and item usage while paused.

### 3.2 Spellcasting Mechanics
*   **[User Request]:** Homing spells (Magic Missile), area effects (Fear), and interactive spells (Soul Link). Saving Throws should be visible but not explained in a manual.
*   **[AI Solution]:**
    *   **Saving Throws:** Every spell hit triggers a d20 roll against target stats. Result displayed as floating text: `[SAVING THROW: SUCCESS/FAIL]`.
    *   **Soul Link:** A spell that binds the health of two entities. Damage dealt to one is mirrored on the other.
    *   **Interruption:** Damage taken during casting (prep time) can cancel the spell.

---

## 4. Exploration & World Logic

### 4.1 True Fog of War (Shadowcasting)
*   **[User Request]:** Lighting from the player (torches/spells) should cast dynamic shadows.
*   **[AI Solution]:** Raycasting algorithm on tiles. Only tiles in the player's direct line of sight are rendered. Everything else is black (Total Fog).

### 4.2 SCP & Liminal Spaces
*   **[User Request]:** Statues that move when not looked at (SCP vibe). Infinite/Looping corridors.
*   **[AI Solution]:**
    *   **Weeping Statues:** AI that checks `isVisible` flag. If `false`, it uses A* pathfinding to close the distance to the player.
    *   **Liminal Triggers:** Sound waves (visualized during pause) lead the player to hidden paths in seemingly infinite rooms.

---

## 5. Items & Loot

### 5.1 Honest Loot & Curses
*   **[User Request]:** "What you see is what you get". No gold from animals. Items must be tested to find effects.
*   **[AI Solution]:**
    *   **Equipment Drops:** Humanoids drop exactly what they were wearing.
    *   **Cursed Logic:** Items like the **Ring of Inverted Subjectivity** (inverts controls and pulls the player) or **Empathetic Curse** (mirrors damage dealt to the player).
    *   **Emergent Narrative:** Intelligence-boosting rings can turn a stray dog into a talking companion.

### 5.2 Anti-Save-Scumming
*   **[User Request]:** Prevent players from simply reloading to guess puzzles (like the Imp's levers).
*   **[AI Solution]:**
    *   **Logic Gate:** Triggers (like which lever is "safe") are randomized *until* the player character physically gains the information (via spell or dialogue). If the player doesn't know, *all* choices lead to a trap.

---

## 6. Technical Specifications (Vibecoding Ready)

### 6.1 Engine Specs
*   **Framework:** Phaser 3 (WebGL) + TypeScript.
*   **Platform:** Web (Browser) + Mobile (via Capacitor).
*   **Performance:** Use Object Pooling for projectiles. Avoid unnecessary Garbage Collection during high-entity combat.

### 6.2 Code Snippets (Core Prototypes)

**Dynamic Joystick Logic:**
```typescript
// Calculation for force and direction
let distance = Phaser.Math.Distance.BetweenPoints(this.startPoint, this.currentPoint);
let force = Math.min(distance / this.maxDistance, 1.0);
this.moveVector.setToPolar(angle, force);
```

**Cursed Ring (Inversion):**
```typescript
public modifyMovement(originalVector: Vector2, time: number): Vector2 {
    let modified = originalVector.clone().negate(); // Invert
    let pulse = (Math.sin(time) + 1) * 0.4; // Pulsing pull
    modified.setLength(Math.max(modified.length(), pulse));
    return modified;
}
```

---

## 7. Implementation Roadmap (First Steps)

1.  **Phase 1: Foundation (The "Engine Feel")**
    *   [ ] Implement Dynamic Joystick with Stealth/Run force detection.
    *   [ ] Create basic Tilemap rendering.
    *   [ ] Build the RTwP system with Grayscale FX and Stone UI sound triggers.

2.  **Phase 2: Atmosphere & Vision**
    *   [ ] Implement Shadowcasting (True Fog of War).
    *   [ ] Add basic AI with "Noise Detection".
    *   [ ] Create the "Mental Shroud" fatigue timer (verified via WorldTimeAPI).

3.  **Phase 3: The SCP Prototype**
    *   [ ] Scenario: The "Ziz-zag Bridge" with the Inversion Ring.
    *   [ ] Scenario: The "Weeping Statue" corridor.
    *   [ ] Scenario: The "Soul Link" combat encounter.
