import Phaser from 'phaser';
// @ts-expect-error - package export target is broken in this workspace, so import the installed ESM file directly.
import PhaserRaycasterRuntime from '../node_modules/phaser-raycaster/src/main-esm.js';

export type RaycasterPoint = { x: number; y: number };

export interface RaycasterRay {
    setRay(x: number, y: number, angle?: number, range?: number): RaycasterRay;
    castCircle(options?: { objects?: object[] }): Phaser.Math.Vector2[];
}

export interface RaycasterInstance {
    createRay(options?: {
        origin?: Phaser.Math.Vector2 | RaycasterPoint;
        angle?: number;
        angleDeg?: number;
        cone?: number;
        coneDeg?: number;
        range?: number;
        collisionRange?: number;
        detectionRange?: number;
        ignoreNotIntersectedRays?: boolean;
        autoSlice?: boolean;
        round?: boolean;
        enablePhysics?: boolean | 'arcade' | 'matter';
    }): RaycasterRay;
    mapGameObjects(objects: object | object[], dynamic?: boolean, options?: Record<string, unknown>): RaycasterInstance;
    setBoundingBox(x: number, y: number, width: number, height: number): RaycasterInstance;
    update(): RaycasterInstance;
}

export type PhaserRaycasterPlugin = Phaser.Plugins.ScenePlugin & {
    createRaycaster(options?: {
        mapSegmentCount?: number;
        objects?: object | object[];
        boundingBox?: Phaser.Geom.Rectangle;
        autoUpdate?: boolean;
        debug?: boolean | Record<string, unknown>;
    }): RaycasterInstance;
};

const PhaserRaycaster = PhaserRaycasterRuntime as unknown as new (
    scene: Phaser.Scene,
    pluginManager: Phaser.Plugins.PluginManager
) => PhaserRaycasterPlugin;

export type Raycaster = RaycasterInstance;
export default PhaserRaycaster;

