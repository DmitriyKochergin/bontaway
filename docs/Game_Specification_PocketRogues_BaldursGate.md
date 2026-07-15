# Game Specification: Pocket Rogues + Baldur's Gate (Cross-Genre Tactical RPG)

## 1. Vision & Core Philosophy
**Concept:** A top-down 2D Action-RPG that combines the tactical depth of *Baldur's Gate* (RTwP) with the immediate control of *Pocket Rogues*, set in a handcrafted, static world designed for discovery.

*   **[User Vision]:** 
    *   Static, handcrafted maps (no procedural "trash").
    *   No manuals or tutorials; exploration-driven learning.
    *   "Vita, Mortis, Careo" vibes (High-impact audio and heavy UI).
    *   Tactical freedom: RTwP (Real-Time with Pause) for control.
    *   Fair world: High risk leads to high rewards (killing a high-level boss early makes you a "god").
*   **[AI Synthesis]:** 
    *   Modern Web/Mobile hybrid using Phaser 3.
    *   Focus on "Ecological Design" (the world makes logical sense).
    *   "Dopamine Detox" mechanic: Natural limit on play-time via in-game fatigue.

---

## 2. Core Gameplay Mechanics (Movement & Control)

### A. Dynamic Virtual Joystick
*   **[User Request]:** Better than Pocket Rogues. Shouldn't fail if not touching the exact center.
*   **[Technical Spec]:** 
    *   **Dynamic Center:** Joystick appears wherever the finger first touches the left half of the screen.
    *   **Analog Input:** Vector distance determines speed (walking/sneaking vs. running).
    *   **Vibecoding Spec:** Implement a joystick class that outputs a normalized `force` (0.0 to 1.0) and `angle`.

### B. Stealth & Noise System
*   **[User Request]:** Stealth for thieves/assassins.
*   **[AI Logic]:**
    *   **Noise Radius:** Directly tied to the joystick's `force` and current armor type.
    *   **Enemy AI:** Cone of vision (120°). Enemies can "hear" noise behind them, triggering auto-pause if they detect the player.

---

## 3. Visuals & Exploration (The "SCP" & Liminal Vibe)

### A. True Fog of War (Shadowcasting)
*   **[User Request]:** Light from the player should cast shadows and reveal hidden threats.
*   **[AI Logic]:** Real-time raycasting on tiles. Enemies in darkness are invisible until illuminated.
*   **[Scenario]:** "Liminal Trap" - An infinite corridor that reveals its exit only when the player walks into a wall that "sounds" different or is revealed through a logic puzzle.

### B. Environmental Storytelling
*   **[User Request]:** No manuals. How things work should be shown, not told.
*   **[Examples]:**
    *   **SCP Statues:** Move only when in the Fog of War (not being looked at).
    *   **Ghosts of the Past:** Visual echoes of NPCs dying to a trap to warn the player.

---

## 4. Combat & Magic Systems

### A. RTwP (Real-Time with Pause)
*   **[User Request]:** Complete control. When paused, everything should go grayscale like *Braid* or *BG2*.
*   **[Mechanics]:**
    *   **Auto-Pause:** Triggers when an enemy enters line-of-sight.
    *   **Cast Time:** Spells have a preparation time; being hit can cancel the cast.
    *   **Tactical Pause UI:** Stone-like buttons for spells/abilities.

### B. Spell Interaction & "Soul Link"
*   **[User Request]:** Area spells like Fear/Confusion. Homing spells (Magic Missile).
*   **[AI Innovation]:**
    *   **Soul Link:** Links health between two entities. Damage to one hits the other.
    *   **Saving Throws:** Every effect shows a text popup: `[SAVING THROW: SUCCESS]` to maintain mechanical transparency without a manual.
    *   **True Names:** Discovering a demon's name in a diary allows controlling or banishing it instantly.

---

## 5. Loot & Items (The "Fair World" Rule)

### A. Honest Loot
*   **[User Request]:** No random gold from wolves. If you see a bandit in leather armor, you loot that leather armor.
*   **[AI Logic]:** 
    *   **Condition:** Fire spells might ruin the loot (burnt leather). Stealth kills preserve it.
    *   **No Random Trash:** Barrels contain water/wine, not epic swords.

### B. Cursed & Unknown Items
*   **[User Request]:** Experiment to find effects.
*   **[Scenario]:** 
    *   **Ring of Inverted Subjectivity:** The ring "wears" the player, inverting joystick controls and pulling them toward pits.
    *   **Empathetic Curse:** You feel the damage you deal to others.
    *   **Talking Dog:** An intelligence-boosting ring placed on a stray dog makes it a permanent, talking companion.

---

## 6. Unique Scenarios & Narrative "Hits"
*   **The Imp's Choice:** A prisoner who lies about levers. The "Anti-Save-Scum" logic ensures the levers are all traps until the player *proves* the truth via a spell (Zone of Truth).
*   **The Planar Capsule:** A metal room that shifts the map to different planes (Fire, Shadow) when specific crystals are inserted.
*   **The Slime Pit:** A boss whose size depends on how many corpses the player left unburned on that floor.

---

## 7. Technical Specifications (AI Vibecoding Ready)
*   **Engine:** Phaser 3 (Latest stable) + TypeScript.
*   **Platform:** Web (Browser) + Mobile (via Capacitor/WebView).
*   **Performance Priority:** Avoid Garbage Collection spikes; use Object Pooling for projectiles/effects.
*   **Fatigue System:** "Mental Shroud" - After ~1 hour, FoW radius shrinks, and the player begins to trip/stumble, forcing a rest (save & quit) until the next real-world day. Time verified via `WorldTimeAPI`.

---

## 8. Implementation Roadmap (First Steps)

### Phase 1: The "Feel" of the Engine
1.  **Smart Joystick:** Implementation of the dynamic center and analog vector output.
2.  **Basic Tilemap:** Rendering a static room with collisions.
3.  **True Fog of War:** Raycasting logic to create the "Light vs. Shadow" atmosphere.

### Phase 2: Tactical Core
1.  **RTwP System:** Implementation of the pause state with the Grayscale FX shader.
2.  **Cast Logic:** Basic "Magic Missile" that follows a target.
3.  **Combat Log:** The "Stone" UI window that reports Saving Throws and damage.

### Phase 3: The "SCP" Prototype
1.  **Cursed Ring Scenario:** Implement the inverted joystick challenge.
2.  **SCP Statue AI:** Entities that move toward the player only when `isVisible == false`.
3.  **Imp Interaction:** The logic gate for truthful vs. lying NPCs.

---
*Note: This document is a living specification derived from the brainstorming sessions and will be updated as implementation progresses.*
