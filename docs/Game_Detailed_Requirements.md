# Detailed Game Requirements: Pocket Rogues + Baldur's Gate Project

This document splits the vision into actionable modules, separating the core user requests from the proposed AI architectural solutions.

---

## I. Core Engine & Movement
Focus: "The Feel" of the game. Smooth, responsive, and tactile.

### 1.1 Dynamic "Smart" Joystick
> **User Concept:** Unlike Pocket Rogues, the joystick shouldn't have a fixed center. It should work where the finger lands and allow for varying speed (walking vs. running).
> **AI Implementation:**
> * **Logic:** Pointer down sets the origin $(x_0, y_0)$. Pointer move calculates distance $d$ and angle $\theta$.
> * **Speed Scaling:** $Speed = \min(d/R, 1.0) \times MaxSpeed$.
> * **Stealth Trigger:** If $Speed < 0.5 \times MaxSpeed$, the character enters 'Sneak' state (reduced noise radius).

### 1.2 Stealth & Noise Mechanics
> **User Concept:** Enemies have a field of view; sneaking behind them should be possible.
> **AI Implementation:**
> * **Noise Attribute:** Every tile move generates a circular "Sound Wave". Radius depends on Speed and Armor Weight.
> * **Vision Cones:** Enemies have a 120-degree vision arc. Detection triggers the RTwP Auto-Pause.

---

## II. Combat & Tactical Systems (RTwP)
Focus: Strategic depth and "Fair" difficulty.

### 2.1 Real-Time with Pause (RTwP)
> **User Concept:** High control, fast-paced but pauseable. Visual transition to grayscale during pause.
> **AI Implementation:**
> * **Visual FX:** Apply a Grayscale/Desaturation Post-Processing shader to the Phaser camera.
> * **State Management:** A global `isPaused` flag that stops physics updates and animation timers.
> * **Audio:** "Heavy Stone" sound effects for UI interaction (click, depress).

### 2.2 Magic & Spellcasting
> **User Concept:** Spells like Magic Missile, Fear, and "Soul Link". Spells can be interrupted.
> **AI Implementation:**
> * **Homing Logic:** Projectiles calculate a vector towards the target's current $x,y$ every frame.
> * **Interruption:** Characters have a "Concentration" bar. Taking damage during the cast time triggers a Saving Throw to maintain the spell.
> * **Saving Throws:** Display floating text (e.g., `[SAVING THROW: SUCCESS]`) to show mechanics without a manual.

---

## III. World Logic & Exploration
Focus: Discovery, SCP-style horror, and handcrafted secrets.

### 3.1 True Fog of War (Shadowcasting)
> **User Concept:** The player provides the light; everything else is in shadow. T shadows are "hard" and block line of sight.
> **AI Implementation:** Use a Recursive Shadowcasting algorithm on the tilemap. Only tiles within the FOV are rendered at full opacity.

### 3.2 SCP/Liminal Scenarios
> **User Concept:** Statues that move when you don't look at them. Infinite corridors.
> **AI Implementation:**
> * **The Weeping Statue AI:** If the statue is NOT in the player's active FOV, use `A* Pathfinding` to move it towards the player. If it enters the FOV, it freezes.
> * **Liminal Corridors:** Seamlessly teleport the player back to the start of a corridor until a specific trigger (e.g., walking through an "invisible" wall) is activated.

---

## IV. Loot & Items
Focus: "What you see is what you get".

### 4.1 Honest Loot System
> **User Concept:** No gold from wolves. Loot the bandit's clothes and weapon.
> **AI Implementation:**
> * **Inventory Mapping:** Every NPC has an equipment slot. On death, these items are dropped.
> * **Damage State:** If killed by fire, the item's `condition` property is reduced.

### 4.2 Cursed & Experimental Items
> **User Concept:** Wear items to find out what they do. Items might have "agency" (e.g., a ring that wears you).
> **AI Implementation:**
> * **Unidentified State:** Descriptions are poetic/vague until certain triggers are met (e.g., surviving a specific damage type).
> * **The "Talking Dog" Script:** A specific quest trigger where placing an `Intellect Ring` on a `Stray Dog` NPC replaces its AI script with a `Follower/Companion` script.

---

## V. Technical Specs for AI "Vibecoding"
*Ready-to-use definitions for implementation.*

### 5.1 Project Architecture
*   **Language:** TypeScript
*   **Engine:** Phaser 3 (WebGL Renderer)
*   **State Machine:** Use a Finite State Machine (FSM) for Player (IDLE, WALK, SNEAK, CAST, FALLEN).
*   **Data Driven:** Define spells, enemies, and items in JSON schemas to facilitate "handcrafted" map population.

### 5.2 The "Dopamine Detox" (Fatigue) Logic
*   **Mechanism:** `MentalFatigue` variable (0-100).
*   **Scaling Effects:**
    *   `60-80`: FOV radius shrinks.
    *   `80-95`: Visual "glitches" and whispers (audio).
    *   `100`: Character trips (Prone state) periodically.
*   **Server Check:** Use `fetch('http://worldtimeapi.org/api/ip')` to prevent local clock manipulation.

---

## VI. Roadmap for Implementation

1.  **MVP 1 (The Feel):** Dynamic Joystick + Tilemap + Basic Collisions.
2.  **MVP 2 (The Vision):** True Fog of War + RTwP Pause (Grayscale FX).
3.  **MVP 3 (The Mechanics):** Soul Link Spell + "Ring of Inverted Subjectivity" prototype.
4.  **MVP 4 (The World):** SCP Statue AI + "Truth Telling" Imp scenario.
