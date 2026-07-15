# Project: Bontaway (Pocket Rogues + Baldur's Gate Hybrid)

## Mandatory Context
Before fulfilling any request, you **MUST** read the following specification files in the `docs/` directory to understand the mechanical and atmospheric requirements:
1. `docs/Game_Master_Design_Doc.md` - Overall vision and core pillars.
2. `docs/Game_Detailed_Requirements.md` - Technical breakdown of systems.
3. `docs/Game_Specification_PocketRogues_BaldursGate.md` - High-level goals and roadmap.

## Core Features
- **Top-Down 2D Exploration:** Handcrafted static maps with a focus on discovery and liminality.
- **RTwP (Real-Time with Pause):** Tactical combat with a grayscale "time-stop" visual effect.
- **Dynamic Virtual Joystick:** Touch-anywhere origin on the left screen with analog speed/stealth control.
- **True Fog of War:** Raycasted field of view where light sources reveal the world and shadows hide SCP-style threats.
- **Honest Loot System:** No random drops; NPCs drop what they use. Loot quality depends on how they were killed.
- **Experimental Magic:** No manuals. Players discover spell effects (like Soul Link) through trial, error, and world observation.
- **Mental Fatigue:** A "Dopamine Detox" mechanic that limits play sessions naturally via shrinking FOV and character stumbling.

## Technical Stack
- **Engine:** Phaser 3.x (latest stable) using TypeScript.
- **Logic:** Finite State Machines (FSM) for entities. Object pooling for high-frequency objects.
- **Audio:** Priority for "heavy" tactile sounds (stone clicks) and atmospheric incantations.
- **Architecture:** All game logic and assets live under `./game2`.

## AI Guidelines
- **Consistency:** Always adhere to the "Ecological Design" philosophy — everything in the game world must have a logical cause and effect.
- **Discovery:** Never suggest adding tutorials or manuals; implement environmental cues instead.
- **Tactics:** Combat should be designed around the "Pause" mechanic — assume the player will use it for complex actions.
- **Vibe:** Maintain a dark, mysterious, and slightly surreal (SCP/Liminal) atmosphere.
