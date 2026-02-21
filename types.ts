import type { WorldSnapshot } from "../sim/types";

export type ToWorkerMessage =
  | { type: "INIT"; seed: string }
  | { type: "SET_PAUSED"; paused: boolean }
  | { type: "SET_TIMESCALE"; timeScale: number }
  | { type: "REQUEST_SNAPSHOT" };

export type FromWorkerMessage =
  | { type: "READY" }
  | { type: "SNAPSHOT"; snapshot: WorldSnapshot }
  | { type: "LOG"; message: string };
