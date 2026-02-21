export type BodyId = string;

export type BodyType = "star" | "planet" | "moon";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface OrbitalElements {
  parentId: BodyId;           // co orbituje (np. gwiazda)
  semiMajorAxis: number;      // a [m]
  eccentricity: number;       // e [-]
  inclination: number;        // i [rad]
  lonAscendingNode: number;   // Ω [rad]
  argPeriapsis: number;       // ω [rad]
  meanAnomalyAtEpoch: number; // M0 [rad]
}

export interface BodyState {
  id: BodyId;
  name: string;
  type: BodyType;

  mass: number;   // kg
  radius: number; // m

  orbit?: OrbitalElements;

  // runtime (wyliczane przez OrbitSystem)
  position: Vec3; // m
  periodSeconds?: number;
}

export interface WorldRuntime {
  seed: string;
  timeSeconds: number;
  paused: boolean;
  timeScale: number;

  bodies: Record<BodyId, BodyState>;
  bodyOrder: BodyId[]; // ważne: parent -> child
}

export interface WorldSnapshot {
  seed: string;
  timeSeconds: number;
  paused: boolean;
  timeScale: number;

  bodies: Array<{
    id: BodyId;
    name: string;
    type: BodyType;
    mass: number;
    radius: number;
    position: Vec3;
    periodSeconds?: number;
    orbit?: OrbitalElements;
  }>;
}
