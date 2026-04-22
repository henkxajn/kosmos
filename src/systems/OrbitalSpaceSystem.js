// OrbitalSpaceSystem — centralny rejestr przestrzeni orbitalnej wokół planet.
//
// Koncepcja (Opcja B — Sins of a Solar Empire-style):
//   Każda planeta posiada ciągłą sferyczną przestrzeń orbitalną (0.15–1.5 unit
//   Three.js world). Każdy obiekt (statek, wrak, stacja, satelita) otrzymuje
//   współrzędne sferyczne (r, θ, φ) z preferencjami radialnymi wg roli, ale
//   pełną swobodą kątową. Brak dyskretnych warstw/slotów — spacing wymuszony
//   przez algorytm min-angular-distance (15°) przy spawn.
//
// Współrzędne sferyczne:
//   r     — promień orbity (jednostki Three.js world)
//   θ     — azimut (rad, 0..2π)
//   φ     — kąt biegunowy (rad, 0..π; π/2 = równik)
//   ω     — prędkość kątowa azimutu (rad/s); 0 = anchored (stacje)
//
// Pozycja w czasie t (sekundy):
//   θ(t) = θ₀ + ω·t
//   x = planet.x + r·sin(φ)·cos(θ)
//   y = r·cos(φ)          ← wysokość nad płaszczyzną
//   z = planet.z + r·sin(φ)·sin(θ)

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import {
  ORBITAL_ROLES,
  MIN_ANGULAR_SPACING_RAD,
  FALLBACK_SPACING_RAD,
  SPAWN_ATTEMPTS,
  RADIAL_COLLISION_THRESHOLD,
  resolveVesselOrbitalRole,
  computeBodyRadius,
  getOrbitRange,
} from '../data/OrbitalRolesData.js';

// Deterministyczny hash string → uint32 (do stabilnej fazy bazowej per obiekt)
function _hashString(s) {
  let h = 2166136261 >>> 0;  // FNV-1a offset
  for (let i = 0; i < (s?.length ?? 0); i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// Kąt sferyczny (rad) między dwoma punktami na sferze jednostkowej
function _sphericalAngle(θ1, φ1, θ2, φ2) {
  const cos = Math.sin(φ1) * Math.sin(φ2) * Math.cos(θ1 - θ2)
            + Math.cos(φ1) * Math.cos(φ2);
  // clamp dla numerycznych epsilonów
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

export class OrbitalSpaceSystem {
  constructor() {
    // Map<planetId, Map<objectId, orbit>>
    this._spheres = new Map();

    // Reverse lookup: objectId → planetId (do szybkiego release)
    this._planetByObject = new Map();

    // Subskrypcje eventów — auto-management cyklu życia orbit
    EventBus.on('vessel:arrived', ({ vessel, mission }) => {
      if (!vessel?.id) return;
      const planetId = vessel.position?.dockedAt ?? mission?.targetId;
      if (!planetId) return;
      // Pomiń wraki — one mają własną ścieżkę (transitionToWreck)
      if (vessel.isWreck) return;
      const role = resolveVesselOrbitalRole(vessel);
      this.assignOrbit(planetId, vessel.id, role);
    });

    EventBus.on('vessel:launched', ({ vessel }) => {
      // Statek opuszcza orbitę przy starcie misji (state in_transit) — zwolnij pozycję
      if (vessel?.id && vessel.position?.state === 'in_transit') {
        this.releaseOrbit(vessel.id);
      }
    });

    EventBus.on('vessel:docked', ({ vessel }) => {
      // Statek wrócił do hangaru — zwolnij pozycję orbitalną (docked nie orbituje)
      if (vessel?.id) this.releaseOrbit(vessel.id);
    });

    EventBus.on('vessel:destroyed', ({ vesselId }) => {
      if (vesselId) this.releaseOrbit(vesselId);
    });

    // Wrak — transitionToWreck wywołuje się z EnemyAttackHandler bezpośrednio,
    // ale zostawiamy też listener dla przyszłych ścieżek (np. random destruction)
    EventBus.on('vessel:wrecked', ({ vesselId }) => {
      if (!vesselId) return;
      // Jeśli już jest w wraku (transitionToWreck wywołane wcześniej) — skip
      const orbit = this.getOrbit(vesselId);
      if (orbit?.role === 'wreck') return;
      const year = window.KOSMOS?.timeSystem?.gameTime ?? 0;
      this.transitionToWreck(vesselId, year);
    });
  }

  // ── Publiczne API ─────────────────────────────────────────────────────

  /**
   * Przypisz obiekt do orbity wokół planety.
   * @param {string} planetId
   * @param {string} objectId
   * @param {string} role   — klucz z ORBITAL_ROLES (warship/cargo/science/station/wreck/...)
   * @param {object} [opts] — anchored (bool), preferredR, preferredTheta, preferredPhi
   * @returns {object|null} — utworzony orbit lub null jeśli przegęszczone (mimo to orbit zostanie utworzony)
   */
  assignOrbit(planetId, objectId, role, opts = {}) {
    if (!planetId || !objectId) return null;

    // Zwolnij poprzednią pozycję jeśli obiekt już gdzieś siedzi
    if (this._planetByObject.has(objectId)) {
      this.releaseOrbit(objectId);
    }

    const roleDef = ORBITAL_ROLES[role] ?? ORBITAL_ROLES.default;
    const anchored = opts.anchored ?? (role === 'station');
    const occupants = this._getOccupants(planetId);

    // Promień planety + zakres orbit dla tej roli — skalowane wg planety
    // (mała planeta → blisko, gas giant → daleko)
    const planetEntity = EntityManager.get(planetId);
    const bodyRadius = computeBodyRadius(planetEntity);
    const range = getOrbitRange(role, bodyRadius);

    // Spróbuj znaleźć niekolidującą pozycję
    let orbit = this._findFreeSlot(roleDef, range, occupants, MIN_ANGULAR_SPACING_RAD, opts);
    if (!orbit) {
      // Fallback: luźniejszy spacing
      orbit = this._findFreeSlot(roleDef, range, occupants, FALLBACK_SPACING_RAD, opts);
    }
    if (!orbit) {
      // Skrajnie zagęszczona planeta — przypisz bez sprawdzeń (ostrzeżenie)
      orbit = this._forcedSlot(roleDef, range, opts);
      EventBus.emit('orbit:overcrowded', { planetId, objectId, role });
    }

    // Faza bazowa deterministyczna (żeby save/restore dało tę samą pozycję)
    const h = _hashString(objectId);
    const omegaJitter = ((h >> 16) & 0xFF) / 255 * 0.04 - 0.02;  // ±0.02 rad/s

    const final = {
      planetId,
      objectId,
      role,
      r: orbit.r,
      theta0: orbit.theta,
      phi: orbit.phi,
      omega: anchored ? 0 : Math.max(0.02, roleDef.omegaBase + omegaJitter),
      anchored,
      spawnYear: window.KOSMOS?.timeSystem?.gameTime ?? 0,
    };

    this._setOrbit(planetId, objectId, final);
    EventBus.emit('orbit:assigned', {
      objectId, planetId, role,
      r: final.r, theta: final.theta0, phi: final.phi,
    });
    return final;
  }

  /**
   * Zwolnij pozycję obiektu (np. statek wyleciał, stacja zniszczona).
   */
  releaseOrbit(objectId) {
    const planetId = this._planetByObject.get(objectId);
    if (!planetId) return;
    const sphere = this._spheres.get(planetId);
    if (sphere) {
      sphere.delete(objectId);
      if (sphere.size === 0) this._spheres.delete(planetId);
    }
    this._planetByObject.delete(objectId);
    EventBus.emit('orbit:released', { objectId, planetId });
  }

  /**
   * Przekształć obiekt w wrak — zwolnij starą orbitę, przypisz nową w graveyard.
   */
  transitionToWreck(objectId, year) {
    const planetId = this._planetByObject.get(objectId);
    if (!planetId) return null;
    // Zwolnij aktualną pozycję
    this.releaseOrbit(objectId);
    // Przypisz w graveyard
    return this.assignOrbit(planetId, objectId, 'wreck');
  }

  /**
   * Oblicz bieżącą pozycję (x, y, z) w world-space Three.js.
   * planetWorldPos — { x, z } planety (Y pozycji planety ignorowane; planety leżą na y=0).
   * gameTimeSec   — czas gry (sekundy realne od startu; zwykle performance.now() * 0.001)
   */
  getPosition(objectId, planetWorldPos, gameTimeSec) {
    const orbit = this.getOrbit(objectId);
    if (!orbit || !planetWorldPos) return null;
    const t = gameTimeSec ?? (performance.now() * 0.001);
    const theta = orbit.anchored ? orbit.theta0 : (orbit.theta0 + orbit.omega * t);
    const sinPhi = Math.sin(orbit.phi);
    return {
      x: (planetWorldPos.x ?? 0) + orbit.r * sinPhi * Math.cos(theta),
      y: orbit.r * Math.cos(orbit.phi),
      z: (planetWorldPos.z ?? 0) + orbit.r * sinPhi * Math.sin(theta),
      theta,
    };
  }

  /**
   * Pobierz surowy orbit dla obiektu.
   */
  getOrbit(objectId) {
    const planetId = this._planetByObject.get(objectId);
    if (!planetId) return null;
    return this._spheres.get(planetId)?.get(objectId) ?? null;
  }

  /**
   * Lista wszystkich obiektów na danej planecie (opcjonalnie filtrowana po roli).
   */
  getOccupantsAt(planetId, role = null) {
    const sphere = this._spheres.get(planetId);
    if (!sphere) return [];
    const result = [];
    for (const orb of sphere.values()) {
      if (role && orb.role !== role) continue;
      result.push(orb);
    }
    return result;
  }

  /**
   * Czy obiekt jest już w systemie orbitalnym.
   */
  hasOrbit(objectId) {
    return this._planetByObject.has(objectId);
  }

  // ── Logika wewnętrzna ─────────────────────────────────────────────────

  _getOccupants(planetId) {
    const sphere = this._spheres.get(planetId);
    if (!sphere) return [];
    return Array.from(sphere.values());
  }

  _setOrbit(planetId, objectId, orbit) {
    let sphere = this._spheres.get(planetId);
    if (!sphere) {
      sphere = new Map();
      this._spheres.set(planetId, sphere);
    }
    sphere.set(objectId, orbit);
    this._planetByObject.set(objectId, planetId);
  }

  /**
   * Znajdź wolną pozycję (r, θ, φ) w preferowanym zakresie roli.
   * `range` to {rMin, rMax} obliczone z wielkości planety i preferencji roli.
   * Zwraca null gdy wszystkie próby nie powiodły się.
   */
  _findFreeSlot(roleDef, range, occupants, minSpacing, opts) {
    for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
      const r   = opts.preferredR     ?? (range.rMin + Math.random() * (range.rMax - range.rMin));
      const θ   = opts.preferredTheta ?? (Math.random() * 2 * Math.PI);
      const φ   = opts.preferredPhi   ?? (roleDef.phiCenter + (Math.random() - 0.5) * 2 * roleDef.phiDelta);

      if (this._isFree(r, θ, φ, occupants, minSpacing)) {
        return { r, theta: θ, phi: φ };
      }
      // Jeśli preferred * są podane → respektuj je ale przerwij po 1 próbie
      if (opts.preferredTheta != null && opts.preferredPhi != null && opts.preferredR != null) {
        return { r, theta: θ, phi: φ };
      }
    }
    return null;
  }

  _forcedSlot(roleDef, range, opts) {
    return {
      r:     opts.preferredR     ?? (range.rMin + Math.random() * (range.rMax - range.rMin)),
      theta: opts.preferredTheta ?? (Math.random() * 2 * Math.PI),
      phi:   opts.preferredPhi   ?? (roleDef.phiCenter + (Math.random() - 0.5) * 2 * roleDef.phiDelta),
    };
  }

  _isFree(r, θ, φ, occupants, minSpacing) {
    for (const occ of occupants) {
      // Obiekty bardzo różne radialnie nie kolidują
      if (Math.abs(r - occ.r) > RADIAL_COLLISION_THRESHOLD) continue;
      const Δ = _sphericalAngle(θ, φ, occ.theta0, occ.phi);
      if (Δ < minSpacing) return false;
    }
    return true;
  }

  // ── Save / Restore ────────────────────────────────────────────────────

  serialize() {
    const spheres = {};
    this._spheres.forEach((sphere, planetId) => {
      spheres[planetId] = Array.from(sphere.values()).map(o => ({
        objectId: o.objectId,
        role:     o.role,
        r:        o.r,
        theta0:   o.theta0,
        phi:      o.phi,
        omega:    o.omega,
        anchored: o.anchored,
        spawnYear: o.spawnYear,
      }));
    });
    return { spheres };
  }

  restore(data) {
    this._spheres.clear();
    this._planetByObject.clear();
    if (!data?.spheres) return;
    for (const [planetId, orbits] of Object.entries(data.spheres)) {
      if (!Array.isArray(orbits)) continue;
      for (const o of orbits) {
        if (!o?.objectId) continue;
        this._setOrbit(planetId, o.objectId, {
          planetId,
          objectId: o.objectId,
          role: o.role,
          r: o.r,
          theta0: o.theta0,
          phi: o.phi,
          omega: o.omega ?? 0.1,
          anchored: !!o.anchored,
          spawnYear: o.spawnYear ?? 0,
        });
      }
    }
  }
}

// Re-export role helper dla wygody (klient może pobrać rolę z vessela)
export { resolveVesselOrbitalRole };
