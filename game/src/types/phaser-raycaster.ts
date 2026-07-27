// Pulls in the type declarations shipped with the package. They are unreachable via a normal
// `import ... from "phaser-raycaster"` because the package's bare-string `exports` field maps only
// the runtime JS and hides its own `types` field under moduleResolution "Bundler".
/// <reference path="../../node_modules/phaser-raycaster/types/types.d.ts" />

// @ts-expect-error - package export target is broken in this workspace, so import the installed ESM file directly.
import PhaserRaycasterRuntime from "../../node_modules/phaser-raycaster/src/main-esm.js";

// `PhaserRaycaster` / `Raycaster` below are the ambient globals from the referenced declaration file.
export type PhaserRaycasterPlugin = PhaserRaycaster;
export type RaycasterRay = Raycaster.Ray;

type RaycasterAlias = Raycaster;

export type { RaycasterAlias as Raycaster };

const raycasterPlugin = PhaserRaycasterRuntime as unknown as typeof PhaserRaycaster;
export default raycasterPlugin;
