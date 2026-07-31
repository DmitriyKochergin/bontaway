# Bontaway — Future Enhancements & Vision Expansion

> Status: PROPOSAL / IDEATION. No code changed by this document.
>
> Purpose: go **beyond** what is already specified. This is not a re-statement of the design docs — it is
> the next layer of ideas that turns a strong concept into a game people evangelize.
>
> Audience: the designer (for decisions) and AI coding agents (for later execution). Each enhancement lists
> pillar-fit, effort, impact, dependencies, and — where relevant — **how it teaches without a manual**.

---

## 0. How this document relates to the others

Read these first; this doc assumes them and does not duplicate them:

| Doc | What it owns | This doc adds |
| --- | --- | --- |
| `AGENTS.md` | The pillars (Ecological Design, no manuals, RTwP-first, dark/liminal) | The lens every idea is tested against |
| `Game_Master_Design_Doc.md`, `Game_Specification_*.md`, `Game_Detailed_Requirements.md` | The agreed feature set | Systems the specs imply but never name |
| `Architecture_And_Refactoring_Proposal.md` | Current code reality, target architecture, F9 vision-gap, roadmap (M0–M3) | Features to slot **after** the spine (its §5) exists |
| `Performance_Investigation_Plan.md`, `Performance_Lag_Diagnostics_Plan.md` | Measurement discipline, suspects S1–S7, dev panels A–F | Engineering enablers that respect the frame budget |
| `docs/source/ideas.md`, `docs/source/Створення гри…md` | Raw hooks and scenarios | Promotes scattered hooks into coherent **systems** |

**Rule inherited from the architecture doc:** build the spine (`core/`, `content/`, pooling, event bus,
damage/combat) before piling features on. Almost everything below assumes M1–M3 are done. Ideas are marked
`[needs spine]` when they depend on that groundwork.

---

## 1. The "does it earn its place?" test

Before any idea ships, it must pass all four pillar gates. This keeps "best game ever" from becoming
"kitchen sink":

1. **Ecological** — does it have a legible in-world cause and effect? If it needs a tooltip to explain, cut or redesign it.
2. **No manuals** — can the player *discover* it? Name the environmental cue that teaches it.
3. **Tactical (RTwP-first)** — does it create an interesting decision at the pause, not just spectacle?
4. **Vibe** — does it deepen the dark / liminal / SCP mood, or fight it?

Legend used below — **Effort:** S (≤2d) · M (≤1wk) · L (≤1mo) · XL (>1mo). **Impact:** Low · Med · High · **Signature** (water-cooler moment).

---

## 2. Systemic depth — turn scattered "ecology" notes into one engine

The specs list ecological interactions as anecdotes (water + lightning, fire burns loot). The enhancement is
to make them a **single systemic layer** so every new element combines automatically. This is the highest-
leverage direction: it multiplies content without multiplying code.

### E-SYS-1 — Elemental / tile-state reaction matrix `[needs spine]`
**Idea:** tiles and entities carry transient **states** (Wet, Burning, Oiled, Frozen, Electrified, Poisoned,
Bloody, Smoke). Spells and hazards read/write states; reactions emerge from the matrix, not from bespoke code.

| + | Fire | Water / Wet | Oil | Lightning | Cold / Ice | Poison gas |
| --- | --- | --- | --- | --- | --- | --- |
| **Fire** | — | steam (blocks FOV, extinguishes) | spreading inferno | — | melt → water + steam | **explosion** |
| **Water/Wet** | steam | — | oil floats, still flammable | **chain-shock all wet tiles** | ice floor (slippery) | dilutes/pools |
| **Oil** | inferno | floats | — | ignites | brittle | — |
| **Lightning** | — | chain-shock | ignite | — | conducts | — |
| **Ice floor** | melts | — | — | conducts | — | traps gas low |
| **Corpse** | burns loot, stops slime growth | rots faster | — | — | preserves | — |

**Why it fits:** pure ecological cause/effect. **Teaches by:** the world demonstrates it — bandits in a
flooded cave, a puddle under a torch, an oil barrel by a brazier. The player infers the rule; the stone log
narrates the result ("the water hisses into steam").
**Effort:** L · **Impact:** Signature · **Depends on:** damage system (arch §6.2), `content/spells` schema (§5.3).
**DoD:** a lightning spell in water shocks every connected wet tile; fire + poison-gas detonates; standing in
your own puddle when you cast lightning kills you. All via one `TileStateSystem`, zero per-combo branches.

### E-SYS-2 — Persistent world ledger ("the dungeon remembers") `[needs spine]`
**Idea:** because maps are static and handcrafted, the world should **persist consequences** per save:
corpses, blood pools, burned/frozen tiles, broken doors, sprung traps, released summons, emptied chests,
depleted factions. Stored in the save (see E-ENG-1), replayed on load.

**Why it fits:** the source doc's best moments (the Mega-Slime that ate the corpses you left; the free Demon
now guarding a corridor; the revenge-wall you'll return to) **only work if the world holds state**. Today the
world is amnesiac. **Teaches by:** you walk back into a room and it is exactly as you left it — the game keeps
its promises, so you start planning around them.
**Effort:** M–L · **Impact:** Signature · **Depends on:** save system (E-ENG-1).
**DoD:** kill a room, leave, return — corpses/blood remain; burn them and the later slime is smaller; a
summon that outlived its leash is still there.

### E-SYS-3 — Ecology & faction AI (needs, not scripts) `[needs spine]`
**Idea:** enemies act on **drives** (hunger, territory, fear, curiosity) and **faction relations**, not fixed
patrols. Wolves hunt; spiders ambush; bandits sleep, post watches, flee at low morale, and loot corpses;
factions war (the food-chain scene becomes systemic, not a one-off).

**Why it fits:** "Ecological Design" taken literally. Enables the lure-predators-into-predators tactic from
the source doc as a repeatable strategy. **Teaches by:** watching creatures behave — a wolf drags off a
corpse, bandits panic when their leader dies.
**Effort:** L · **Impact:** High · **Depends on:** Enemy FSM + vision cones (arch §7.3).
**DoD:** two hostile factions in sight of each other fight; a lone wounded enemy flees and hides; hunger
makes a beast leave its lair to seek the corpse you left.

### E-SYS-4 — Acoustic simulation as a first-class system `[needs spine]`
**Idea:** promote "noise" from a radius number to a **propagation graph**. Sound travels the tile graph,
attenuated by distance and doors, blocked by walls, with **delay ∝ distance** (this is the delayed-fireball
insight from `ideas.md`). One system feeds: stealth detection, ambient dread, the "you're attracting them"
voice, and the pause-time **sound ripples** the source doc describes.

**Why it fits:** unifies four scattered ideas into one legible mechanic and makes darkness survivable by ear.
**Teaches by:** pausing and *seeing* the ripples of footsteps behind a door; hearing a distant boom arrive
late and realizing scale.
**Effort:** L · **Impact:** Signature · **Depends on:** stealth/noise (arch §7.4), Web Worker recommended (E-ENG-3).
**DoD:** a heavy step behind a closed door reaches an enemy quieter than an open one; pause renders concentric
ripples toward the source; sustained loud casting triggers the warning VO.

---

## 3. Magic as a discoverable language

The specs promise "experimental magic, no manuals" but still imply a fixed spell list. The enhancement makes
**the spell system itself the discovery loop**.

### E-MAG-1 — Rune-word grammar (spells as composed language) `[needs spine]`
**Idea:** spells are built from **discovered word-runes**, not picked from a menu. A small vocabulary —
`Vita` (life), `Mortis` (death), `Ignis` (fire), `Glacies` (ice), `Umbra` (shadow), `Careo` (deprive/negate),
`Vinculum` (bind → **Soul Link**), `Nomen` (name → **True Names**). Combine 1–3 words; effects emerge from
combination. Unknown or mispronounced combos = wild magic (risk = discovery).

**Why it fits:** this *is* "no manuals" as a system — you learn by finding words on walls, in diaries,
overheard in incantations, and by experimenting. Soul Link and True Names (already in the specs) become
**points in one grammar** instead of hardcoded specials. **Teaches by:** rune rubbings on tombs, an NPC
chanting two words you half-catch, the log naming a word when a spell resolves.
**Effort:** XL · **Impact:** Signature · **Depends on:** `content/spells` schema (arch §5.3), damage (§6.2).
**Risk:** complexity creep. **Mitigation:** ship a **5-word** vocabulary first; expand only after it's fun.
**DoD:** `Ignis` alone is a firebolt; `Ignis + Careo` a chilling anti-fire; `Vinculum + Nomen` binds a named
demon. New spells = new word data, no new classes.

### E-MAG-2 — Waiting spells & counter-traps (two-sided) `[needs spine]`
**Idea:** implement BG2-style **glyphs that hang and trigger on approach** — for *both* sides. You lay a fire
rune around a corner and bait a goblin onto it; enemy mages leave unseen glyphs you must detect (or eat) —
the pause gives you a heartbeat to react.
**Why it fits:** tactical, ecological, RTwP-native. **Teaches by:** the first enemy glyph that nearly kills
you teaches you to scout with `Detect Magic` or a summon.
**Effort:** M · **Impact:** High · **Depends on:** E-SYS-1, damage system.
**DoD:** a player-laid glyph detonates on the first entity that steps on it; an enemy glyph auto-pauses on
proximity and can be dispelled/absorbed.

---

## 4. Narrative & meta spine (Planescape / SCP)

The static, handcrafted world needs a **backbone** that makes its zones feel authored, not assembled.

### E-NAR-1 — The Seven-Sins zone backbone (never named)
**Idea:** each handcrafted region **subtly embodies a sin** — never labeled — realizing `ideas.md #2`
("copy the seven sins, but don't say it — make it non-obvious"). Existing hooks map cleanly:

| Sin | Zone (from source hooks) | The trap / lesson |
| --- | --- | --- |
| Wrath / self-pity | **Lake of Grievances** (`ideas.md #1`) — people bathe in offense, refuse to leave | wading in drains resolve |
| Sloth | the **infinite liminal corridor** | the danger is *not moving* |
| Gluttony | the **Mega-Slime pit** that ate the floor's corpses | you fed it |
| Greed | the **Stone-Escort** hoard room (empty chest, patient statues) | wanting more gets you cornered |
| Pride | the **Mirror / Clone** paradox room | your reflection matches you blow for blow |
| Envy | the **Echo-of-the-owner** ring / Empathy curse | coveting another's life, literally |
| Despair (Acedia) | the **immortal who wants to forget** (Styx-drop quest) | the reward for boredom is oblivion |

**Why it fits:** gives the world a hidden thematic unity; the slow realization ("…wait, are these the *sins*?")
is itself a water-cooler moment. **Teaches by:** pattern, never text.
**Effort:** M (design) + per-zone content · **Impact:** Signature.

### E-NAR-2 — The Observer / fourth-wall thread (use sparingly)
**Idea:** build on `ideas.md #5` — delayed spell-audio implies the "player" watches from **above**. Rarely, an
**avatar/homunculus flies up and addresses *you*** (not the character), aware of your attention. Frame the
Mental-Fatigue detox diegetically: the dungeon *feeds on your watching*.
**Why it fits:** deep SCP/Planescape unease; ties the detox mechanic to lore. **Teaches by:** it breaks its
own rules on purpose — that's the horror.
**Effort:** M · **Impact:** Signature · **Risk:** gimmick if overused. **Mitigation:** ≤3 occurrences per campaign.

### E-NAR-3 — Psychological quest framework (no fetch quests)
**Idea:** codify the Planescape-style encounters (the immortal who wants to forget; solve it by *giving away
the Intellect Ring* instead of fighting). A quest is a **state machine with multiple solution paths**, at
least one non-combat and one that reuses another system (an item, a summon, a rune-word).
**Why it fits:** respects player intelligence; rewards lateral thinking. **Effort:** M framework + content ·
**Impact:** High · **Depends on:** dialogue content (arch §5.1 `content/dialogue`).

### E-NAR-4 — Asynchronous wall-echoes (the *only* recommended "multiplayer")
**Idea:** Dark-Souls-style **scrawled messages** left by other players, assembled from a **fixed vocabulary**
(no free chat → no toxicity, fully on-vibe, offline-tolerant). "Danger ahead", "the imp lies", "praise the
void". You feel others passed here, long ago.
**Why it fits:** amplifies loneliness rather than breaking it. **Anti-goal:** real-time co-op — it destroys
the liminal solitude; do **not** build it (see §9).
**Effort:** M · **Impact:** High · **Depends on:** a tiny backend or static message store.

---

## 5. Diegetic UX — push "no manuals" into the interface itself

### E-UX-1 — The character's unreliable journal (solves the day-gap memory problem)
**Idea:** the **Dopamine-Detox** design forces multi-day play — but across days players *forget*. The fix must
not be a manual. Solution: the **character auto-scrawls a journal** — rune rubbings, a hand-drawn map with `?`
rooms, half-remembered incantation words, notes like *"the ring grew cold when I bled."* It is **in-world and
imperfect** (misremembers, smudges).
**Why it fits:** it's the detective's case file, not a tutorial; the unreliability *is* atmosphere.
**Teaches by:** it only records what the character actually observed — reinforcing empirical discovery.
**Effort:** M · **Impact:** High · **Depends on:** discovery events to log. **Pairs with:** E-SYS-2, E-MAG-1.

### E-UX-2 — Near-zero HUD, diegetic vitals
**Idea:** replace bars with body/screen language — HP as a **blood vignette + heartbeat audio**; stamina as
**breathing/limp**; "mana" as **which rune-words the throat can still voice** under exhaustion. The **stone
combat log** stays the primary information channel.
**Why it fits:** matches the "heavy stone, minimal, tactile" UI vibe and immersion. **Effort:** M ·
**Impact:** High · **Note:** expose a settings toggle for numeric readouts (accessibility, E-UX-4).

### E-UX-3 — The wordless prologue (the tutorial that isn't)
**Idea:** the opening **is** the parasite-ring bridge from the source doc, and it teaches with **zero text**:
Room 1 teaches movement (joystick), Room 2 teaches light/fog (dark room + torch), Room 3 (the zig-zag bridge)
teaches **pause → summon → physical blocking**. The player learns the three verbs by surviving.
**Why it fits:** onboarding without violating "no tutorials." **Effort:** M · **Impact:** High ·
**Depends on:** RTwP grayscale (arch §7.1), summons, FOV.

### E-UX-4 — Accessibility without breaking the vibe
**Idea:** optional numeric vitals; colorblind-safe grayscale pause; remappable/one-handed controls;
**reduce-motion** for stumble/screenshake; subtitles for the mumbling VO; the perf **quality tiers** (perf
docs P3); and — critically — the Detox as an **optional, forgiving** mode (a "meditation/endless" toggle).
**Why it fits:** the source doc itself flags Detox rage-quit as the top risk. **Effort:** M · **Impact:** Med
(High for reach).

---

## 6. Audio director — the specs call audio "50% of the atmosphere"; make it a system

### E-AUD-1 — Occlusion, reverb, and ducking by room material
**Idea:** an **AudioDirector** applies per-room reverb (stone vs water vs void), muffles sound behind closed
doors (shares the E-SYS-4 graph), and ducks ambient under incantations (the source doc's "ducking" note).
**Why it fits:** turns the already-praised audio into spatial information. **Effort:** M · **Impact:** High ·
**Depends on:** AudioSystem split (arch §6.4), E-SYS-4.

### E-AUD-2 — Adaptive tension music + incantation VO
**Idea:** music reads game state — stealth (sparse), hunt (pulse), detox (dissonant, per `ideas.md #11`
heartbeat rooms). Incantations use a **mumbled proto-language** VO (`ideas.md #15`), so casting sounds weighty
without localized voice lines.
**Effort:** M · **Impact:** High · **Depends on:** MusicDirector (arch §6.4).

---

## 7. Companions, progression, death — the emotional core

### E-CMP-1 — Companions with loyalty & fear `[needs spine]`
**Idea:** formalize the **talking dog** (Intellect Ring on a stray). Companions carry a torch (a *mobile light
source* = tactical), have loyalty/fear, can flee, die (permanently — stakes), be Soul-Linked, or turn on you
if cursed.
**Why it fits:** the source doc's most-shared moment; emotional attachment in a lonely world. **Effort:** L ·
**Impact:** Signature · **Depends on:** Enemy/NPC FSM, E-MAG-1 (`Vinculum`).

### E-PRG-1 — Progression through *knowledge*, not damage multipliers
**Idea:** honoring the specs' ban on stat-inflated "level 80 goblins," power growth = **knowledge**: True
Names learned, lever answers proven, rune-words decoded, item effects known, the map itself. **NG+ keeps
knowledge** — same world, wiser player. Every set-piece has **multiple solutions** (stealth / summon /
elemental / social).
**Why it fits:** the "kill the vampire early, become a demigod" fantasy is *knowledge-gated*, not level-gated.
**Effort:** M (framework) · **Impact:** High.

### E-DTH-1 — Death with consequence (recommend Planescape-return)
**Idea / decision:** two models —
- **A. Roguelike permadeath** — pure stakes, but fights the day-limited, revenge-wall psychology.
- **B. Diegetic return (recommended)** — you wake in camp; your **body persists in the dungeon as a lootable
  corpse** (Dark-Souls bloodstain) to recover. Death has weight without a load-screen.

**Why B fits:** it reinforces the persistence ledger (E-SYS-2), the "I'll come back for it" hook, and the
liminal lore. **Effort:** M · **Impact:** High · **Depends on:** E-SYS-2, E-ENG-1. **This is a spine-level
decision — see §10.**

### E-DTH-2 — Bosses as puzzles, not sponges
**Idea:** bosses telegraph honestly and yield to **environmental** solutions (lure into water then cast
lightning; the Mega-Slime you overfed). Winnable while underleveled with cleverness — the specs' core promise.
**Effort:** per-boss · **Impact:** High · **Depends on:** E-SYS-1/-3.

---

## 8. Engineering enablers (respecting the perf budget)

These unlock the features above and fill real gaps in the current plans.

### E-ENG-1 — Save system & seeded RNG (currently unspecified — a real gap)
**Idea:** IndexedDB save, **autosave-on-rest**, serialize the persistence ledger (E-SYS-2), and a **seedable
RNG** (arch already wants `core/rng.ts`) so the **anti-save-scum** logic (the Imp's levers) is deterministic
and testable.
**Why it matters:** persistence, death-return, and the day-gap detox **all** require saving; no doc covers it.
**Effort:** M · **Impact:** High (foundational) · **Priority:** do this early in the spine.

### E-ENG-2 — In-house / Tiled level editor
**Idea:** a fast authoring path for handcrafted maps + entity/loot/dialogue placement, feeding the
`content/*` registries (arch §5.3). Handcrafted worlds live or die by **authoring speed**.
**Effort:** L · **Impact:** High (content multiplier).

### E-ENG-3 — Offload raycasting / pathfinding / acoustics to a Web Worker
**Idea:** move FOV raycasts, A* pathing, and the E-SYS-4 acoustic graph off the main thread. Complements the
perf docs (FOV is suspect S3) and keeps the frame budget for rendering.
**Effort:** M–L · **Impact:** High (perf) · **Gate:** measure first (perf docs' rule — Panels A–F).

### E-ENG-4 — Geometry/RenderTexture FOV (kills perf suspect S3)
**Idea:** replace the full-screen `CanvasTexture` re-upload with a **geometry mask / bounded RenderTexture**
(arch §6.3). Bonus: the same render target draws the E-SYS-4 sound ripples cheaply.
**Effort:** M · **Impact:** High (perf) · **Depends on:** dev diagnostics gate (arch §6.7 / perf Panels).

### E-ENG-5 — Opt-in discoverability telemetry
**Idea:** anonymized, opt-in **death/quit/stuck heatmaps**. "No manuals" risks players getting *stuck* — you
can't fix what you can't see. Measure where the world fails to teach itself.
**Effort:** M · **Impact:** High (design safety) · **Note:** privacy-first, off by default.

---

## 9. Anti-goals (protect the vibe — these keep "best game ever" honest)

- **No tutorials / manuals / tooltips.** Every mechanic teaches through the world (this is the whole thesis).
- **No random loot, no gold from animals, no damage-multiplier difficulty.** The specs are explicit; honesty is the brand.
- **No energy meters, gacha, or engagement dark-patterns.** The Detox is the *opposite* of monetized time-sinks.
- **No real-time co-op.** It shatters the liminal solitude. Async wall-echoes (E-NAR-4) are the ceiling.
- **Don't overuse the fourth wall** (E-NAR-2) — rarity is what makes it land.
- **Juice must stay pooled and capped** (arch §6.1, perf P2) — no effect earns a dropped frame.

---

## 10. Prioritization & recommended first slice

Everything assumes the architecture doc's spine (M0–M3). These are the enhancements to weave into/after its
**Phase 5**, ordered by leverage:

| ID | Enhancement | Effort | Impact | Risk | Depends on |
| --- | --- | --- | --- | --- | --- |
| E-ENG-1 | Save + seeded RNG | M | High | Low | — (do early) |
| E-SYS-2 | Persistence ledger | M–L | Signature | Low | E-ENG-1 |
| E-SYS-1 | Element reaction matrix | L | Signature | Med | damage, spells |
| E-SYS-4 | Acoustic simulation | L | Signature | Med | stealth, worker |
| E-UX-1 | Diegetic journal | M | High | Low | discovery events |
| E-UX-2 | Diegetic vitals / no-HUD | M | High | Low | — |
| E-MAG-1 | Rune-word grammar (5 words) | XL→start small | Signature | High | spells, damage |
| E-CMP-1 | Companions | L | Signature | Med | FSM, Vinculum |
| E-NAR-1 | Seven-sins backbone | M+content | Signature | Low | zones |

**Recommended "beyond-spec" first slice (max impact, on-vibe, buildable on the skeleton):**

1. **E-ENG-1 Save + seeded RNG** — unlocks persistence, death-return, and honest anti-save-scum. Foundational.
2. **E-SYS-1 Element matrix (fire/water/lightning/oil)** — one system, dozens of emergent set-pieces.
3. **E-SYS-4 Acoustic sim MVP** — footstep graph + pause ripples; unifies stealth, ambience, and the Observer.
4. **E-UX-1 journal + E-UX-2 diegetic vitals** — cheap, high immersion, and the *only* honest answer to the day-gap memory problem.
5. **E-SYS-2 persistence ledger** — makes the Mega-Slime, the freed Demon, and the revenge-wall finally real.

Then invest in **E-MAG-1** (start with 5 rune-words) as the discovery centerpiece once the content spine is proven.

---

## 11. Decisions that unlock the rest (for the designer)

These are scope-defining forks. Answering them turns this doc into a plan — they are surfaced here rather than
guessed:

1. **Death model** — permadeath (E-DTH-1 A) or diegetic return + corpse recovery (B)? This shapes save,
   persistence, and pacing. *Recommendation: B.*
2. **Detox model** — hard 1-hour wall or optional/forgiving "meditation" mode? Mobile-first or desktop-first?
   *Recommendation: optional + forgiving (source doc's own top risk).*
3. **Magic ambition** — fixed spell list, or the rune-word grammar (E-MAG-1)? This is the single biggest scope
   lever. *Recommendation: grammar, shipped tiny (5 words) first.*
4. **Narrative spine** — is the Observer/fourth-wall (E-NAR-2) the main thread, or rare seasoning?
   *Recommendation: rare seasoning; the seven-sins backbone (E-NAR-1) carries the spine.*
5. **Solo dev or team, and target timeline?** Determines how much of §10 is realistic for v1 vs a horizon list.

---

*This document is living ideation. Promote an idea to a real ticket only when its pillar-gates (§1) pass and
its dependencies (arch spine) exist. Append new ideas under the most fitting section; keep one tight entry per
idea.*

