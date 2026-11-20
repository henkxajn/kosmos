// ColonyCityLights — światła miast kolonii geo na MAPIE UKŁADU (ARC COLONY SPHERE, krok CS-9; plan §3.18).
//
// Dla każdej kolonii z siatką geo w bieżącym układzie trzyma jedną powłokę świateł (kula tuż nad powierzchnią,
// `CityLightsShader`, mieszanie addytywne) jako DZIECKO siatki powierzchni ciała — obraca się razem z nią, więc światła
// stoją na swoich polach. Mapa natężeń = ta sama funkcja co na kuli kolonii (`CityLightsLogic`), nocną stronę wyznacza
// gwiazda (`uSunPos` wspólnego shadera powierzchni).
//
// • Przegląd kolonii co `intervalMs` (tani: natężenia pól + podpis); mapa i tekstura przerysowują się TYLKO przy zmianie
//   podpisu (budowa, rozbiórka, poziom, ludność). Bez nasłuchu zdarzeń — łapie też wczytanie zapisu i budowy AI.
// • Siatka płaska nigdy tu nie trafia (`grid.kind !== 'geo'` → pominięta): flaga OFF = zero powłok, zero pracy poza
//   pustą pętlą po koloniach.
// • Cel (siatka ciała + promień) podaje gospodarz; gdy siatka ciała została przebudowana, powłoka powstaje od nowa.
// • THREE i wszystko, co dotyka świata, jest wstrzykiwane — keeper wykonuje klasę pod node.

import { CityLightsShader as CL } from './CityLightsShader.js';
import { CITY_LIGHTS, cityLightsOf, rasterizeCityLights, populationOfColony } from './CityLightsLogic.js';
import { geodesicTopology } from '../map/GeodesicTopology.js';

export class ColonyCityLights {
  /**
   * @param {object} o
   * @param {object} o.THREE
   * @param {() => object[]} o.getColonies kolonie do przejrzenia (wpisy ColonyManager: planetId, grid, civSystem)
   * @param {(bodyId:string) => ({mesh:object, radius:number}|null)} o.getTarget siatka powierzchni ciała (wspólny shader) + promień
   * @param {() => boolean} [o.logDepth] czy scena używa głębi logarytmicznej
   * @param {object} [o.shared] wspólne uniformy powierzchni (uSunPos)
   * @param {number} [o.intervalMs] odstęp przeglądu kolonii
   */
  constructor(o = {}) {
    this._THREE = o.THREE;
    this._getColonies = o.getColonies ?? (() => []);
    this._getTarget = o.getTarget ?? (() => null);
    this._logDepth = o.logDepth ?? (() => false);
    this._shared = o.shared ?? null;
    this._interval = o.intervalMs ?? 1500;
    this._recs = new Map();     // bodyId → { mesh, parent, radius, tex, data, lights, sig }
    this._last = -Infinity;
    this.rasters = 0;
  }

  /** Wołane co klatkę; pracuje co `intervalMs`. */
  tick(nowMs) {
    if (nowMs - this._last < this._interval) return false;
    this._last = nowMs;
    this.sync();
    return true;
  }

  /** Wymuś przegląd przy najbliższym `tick` (np. po zmianie układu). */
  invalidate() { this._last = -Infinity; }

  sync() {
    const seen = new Set();
    let list = [];
    try { list = this._getColonies() ?? []; } catch (e) { list = []; }
    for (const col of list) {
      const grid = col?.grid, id = col?.planetId;
      if (!id || grid?.kind !== 'geo' || !Array.isArray(grid.tiles)) continue;   // siatka płaska: nic
      let target = null;
      try { target = this._getTarget(id); } catch (e) { target = null; }
      if (!target?.mesh || !(target.radius > 0)) continue;
      let rec = this._recs.get(id) ?? null;
      const lights = cityLightsOf(grid.tiles, populationOfColony(col), rec?.lights ?? null);
      if (!lights.any) continue;                       // nic nie świeci → powłoka (jeśli była) zniknie niżej
      try {
        if (rec && (rec.parent !== target.mesh || rec.radius !== target.radius || rec.mesh.parent !== target.mesh)) { this._drop(id); rec = null; }
        if (!rec) rec = this._create(id, target, col);
        rec.lights = lights;
        if (rec.sig !== lights.signature) {
          rasterizeCityLights(geodesicTopology(grid.n), lights.data, CITY_LIGHTS.mapW, CITY_LIGHTS.mapH, rec.data);
          rec.tex.needsUpdate = true;
          rec.sig = lights.signature;
          this.rasters++;
        }
        seen.add(id);
      } catch (e) {
        this._drop(id);
      }
    }
    for (const id of [...this._recs.keys()]) if (!seen.has(id)) this._drop(id);
  }

  _create(id, target, col) {
    const T = this._THREE;
    const data = new Uint8Array(CITY_LIGHTS.mapW * CITY_LIGHTS.mapH * 4);
    const tex = CL.createCityTexture(T, data, CITY_LIGHTS.mapW, CITY_LIGHTS.mapH);
    const mat = CL.createCityMaterial(T, tex, { shared: this._shared, logDepth: !!this._logDepth(), depthTest: true,
      density: CITY_LIGHTS.systemDensity, gain: CITY_LIGHTS.systemGain, seed: col?.planet?.surfaceSeed ?? 0 });
    const mesh = new T.Mesh(new T.SphereGeometry(target.radius * CITY_LIGHTS.systemRadius, 64, 48), mat);
    mesh.userData.isCityLights = true;
    mesh.raycast = () => {};
    mesh.renderOrder = 1;
    target.mesh.add(mesh);
    const rec = { mesh, parent: target.mesh, radius: target.radius, tex, data, lights: null, sig: null };
    this._recs.set(id, rec);
    return rec;
  }

  _drop(id) {
    const rec = this._recs.get(id);
    if (!rec) return;
    this._recs.delete(id);
    try { rec.mesh.parent?.remove?.(rec.mesh); } catch (e) { /* nic */ }
    try { rec.mesh.geometry?.dispose?.(); rec.mesh.material?.dispose?.(); rec.tex?.dispose?.(); } catch (e) { /* nic */ }
  }

  dispose() { for (const id of [...this._recs.keys()]) this._drop(id); }

  info() {
    return { bodies: [...this._recs.keys()], rasters: this.rasters,
      lit: Object.fromEntries([...this._recs].map(([id, r]) => [id, { lit: r.lights?.lit ?? 0, factor: r.lights?.factor ?? 0 }])) };
  }
}

export default ColonyCityLights;
