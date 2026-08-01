# Bontaway

A dark, liminal top-down dungeon crawler blending real-time exploration with tactical pause.
Built with Phaser 3, TypeScript, and rsbuild.

## Quick start

```bash
cd game
yarn install
yarn dev
```

## Build & deploy

```bash
yarn build
yarn deploy
```

## Project layout

- `game/src/` — all game code.
- `docs/` — design docs, architecture proposals, and performance investigation plans.
- `old/` — deprecated prototypes.

See `docs/Architecture_And_Refactoring_Proposal.md` for the current technical roadmap.

## Testing policy

- **UI unit tests are forbidden.** Phaser scene/UI code is tested through play and visual verification only.
- **No Vitest.** The project does not use Vitest or any other JS unit-test runner.
- Logic-heavy modules (`core/rng.ts`, `SettingsManager`, etc.) may be validated through manual inspection, runtime asserts, or small standalone scripts — not through a test framework.

## Tech stack

- Phaser 3.83
- TypeScript 6
- rsbuild
- Biome (lint/format)
- GitHub Pages (deploy)

