import { OrbitSystem } from "./systems/OrbitSystem.js";

export class SimEngine {
  constructor(world) {
    this.world = world;
    this.orbitSystem = new OrbitSystem();
  }

  setPaused(paused) { this.world.paused = paused; }
  setTimeScale(timeScale) { this.world.timeScale = Math.max(0, timeScale); }

  tick(realDtSeconds) {
    if (this.world.paused) return;
    const scaledDt = realDtSeconds * this.world.timeScale;
    this.world.timeSeconds += scaledDt;
    this.orbitSystem.step(this.world, scaledDt);
  }

  snapshot() {
    return {
      seed: this.world.seed,
      timeSeconds: this.world.timeSeconds,
      paused: this.world.paused,
      timeScale: this.world.timeScale,
      bodies: this.world.bodyOrder.map((id) => {
        const b = this.world.bodies[id];
        return {
          id: b.id, name: b.name, type: b.type, mass: b.mass, radius: b.radius,
          position: { ...b.position }, periodSeconds: b.periodSeconds,
          orbit: b.orbit ? { ...b.orbit } : undefined
        };
      })
    };
  }
}
