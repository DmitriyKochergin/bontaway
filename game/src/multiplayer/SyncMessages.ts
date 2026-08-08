/**
 * Wire protocol for the arena's peer-to-peer presence.
 *
 * The arena has no NPCs, loot, or fog, and the map is identical for everyone, so there is no
 * authoritative world state to reconcile. Every peer simply owns itself: it broadcasts where it
 * is, where it faces, and what it fires. Others render dumb, interpolated replicas.
 */

export type WeaponKind = "fireball" | "ray" | "sphere";

// These are `type` aliases (not interfaces) on purpose: Trystero's makeAction<T> requires the
// payload to satisfy a JSON index signature, which TS grants implicitly to object type-literals
// but not to interfaces.

/** Snapshot of self, sent to a peer the moment it joins so late arrivals appear instantly. */
export type PlayerHelloMessage = {
  readonly type: "hello";
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
};

/** Throttled movement update. Skipped entirely when the sender hasn't moved. */
export type PlayerPosMessage = {
  readonly type: "pos";
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly moving: boolean;
};

/** A shot the sender just cast. Carries origin + target so the replica can retrace the arc. */
export type PlayerFireMessage = {
  readonly type: "fire";
  readonly weapon: WeaponKind;
  readonly ox: number;
  readonly oy: number;
  readonly tx: number;
  readonly ty: number;
};

export type SyncMessage = PlayerHelloMessage | PlayerPosMessage | PlayerFireMessage;
