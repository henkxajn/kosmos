// GalaxyPlate — ARC GALAXY, krok G1 (docs/design/GALAXY_PLAN.md §4 G1; D-GX-1, D-GX-2; F5): PŁYTA galaktyki w scenie
// głównego renderera — jedna grupa autorowana w ly (`scale = GALAXY_K`), przesunięta tak, by AKTYWNY układ stał
// w początku świata (`position = −P_active · K`); 72 punkty PSF tym samym shaderem co niebo (`StarPointShader`, wariant
// płyty z `uFade`), rozmiar z jasności, niezbadane przygaszone, dom i gwiazda zaznaczona z halo (większy PSF).
//   • Widoczna WYŁĄCZNIE w trybie galaktyki: punkty leżą na warstwie `GALAXY_LAYER` (kamera systemu ma warstwę 0), a grupa
//     ma `visible = false` poza trybem. Nie bierze udziału w żadnym raycaście trybu układu (wybór gwiazdy = rzut na ekran,
//     `GalaxyModeLogic.pickGalaxyStar`; three r171 testuje warstwy, nie `visible`).
//   • Uczestnik sceny, nie kopuła: test głębi włączony, bez zapisu, addytywnie; chunki głębi logarytmicznej (V4) dokłada
//     tu wołający przez `logDepth` (renderer — `sceneDepthUnification`).
//   • Pokrętła wyglądu — `GalaxyModeLogic.LIVE_GALAXY` (renderer wystawia je jako `galaxyTuning`); zmiana pokrętła
//     przelicza atrybuty w następnym `tick()`.
//   • ARC GALAXY G2-3 (flaga `galaxyLook`, rama F5 C): AUREOLE WŁASNOŚCI — większy PSF w barwie imperium wokół gwiazd układów
//     z właścicielem (`setOwnerHalos`; gracz zawsze, AI od wywiadu `contact` — reguła `GalaxyTerritoryLogic.plateOwnerHalos`);
//     SŁUPKI gwiazda → płaszczyzna dysku z kropką u podstawy wyłącznie dla układów gracza i gwiazdy zaznaczonej
//     (`setRisers`, `HolotableCamera.riserEndpoints`, barwa z roli HUD); terytorium (`GalaxyTerritory`) dokłada wołający jako
//     dziecko `group`. Przy fladze OFF nic z tego nie powstaje (listy puste — płyta G1 co do bitu).
// ⚠ THREE wstrzykiwany (wzór `StarPointShader`) — moduł nie importuje three, więc ładuje się pod node.

import { createPlateStarMaterial, STAR_VERT_PLATE, STAR_FRAG_PLATE } from './StarPointShader.js';
import { withLogDepthVertex, withLogDepthFragment } from './LogDepthChunks.js';
import {
  GALAXY_K, GALAXY_LAYER, galaxyAnchorLy, plateGroupPosition, plateWorldOf, galaxyLyToWorld,
  plateStarLook, plateHaloLook, haloIds, LIVE_GALAXY, galaxyKnobSnapshot, galaxyKnobsChanged,
} from '../ui/GalaxyModeLogic.js';
import { mixSeed, hashStringToInt } from '../utils/SeedMath.js';
import { riserEndpoints } from './HolotableCamera.js';

const PHASE_SALT = 0x6A1A0;   // sól fazy oddechu punktów płyty (±5 % — ten sam shader co niebo)

/** Faza oddechu gwiazdy płyty — z id (deterministyczna). */
function platePhase(id) {
  return (mixSeed((hashStringToInt(String(id)) ^ PHASE_SALT) >>> 0) / 4294967296) * Math.PI * 2;
}

export class GalaxyPlate {
  /**
   * @param <class 'object'> THREE — moduł three
   * @param {{ pixelRatio?:number, logDepth?:boolean }} [opts]
   */
  constructor(THREE, { pixelRatio = 1, logDepth = false } = {}) {
    this.THREE = THREE;
    const group = new THREE.Group();
    group.name = 'galaxyPlate';
    group.visible = false;
    group.scale.setScalar(GALAXY_K);
    this.group = group;
    this.material = createPlateStarMaterial(THREE, {
      pixelRatio, fade: 0,
      vertexShader:   logDepth ? withLogDepthVertex(STAR_VERT_PLATE)   : STAR_VERT_PLATE,
      fragmentShader: logDepth ? withLogDepthFragment(STAR_FRAG_PLATE) : STAR_FRAG_PLATE,
    });
    const mk = (name) => {
      const p = new THREE.Points(new THREE.BufferGeometry(), this.material);
      p.name = name;
      p.layers.set(GALAXY_LAYER);
      p.frustumCulled = false;   // geometria przebudowywana — sfera ograniczająca bywa nieaktualna
      group.add(p);
      return p;
    };
    this.halos = mk('galaxyHalos');   // pod gwiazdami (addytywnie — kolejność bez znaczenia, nazwa dla debug)
    this.ownerHalos = mk('galaxyOwnerHalos');   // G2-3 — aureole własności (barwa imperium)
    this.riserBases = mk('galaxyRiserBases');   // G2-3 — kropki u podstawy słupków
    this.stars = mk('galaxyStars');
    // G2-3 — słupki (linia gwiazda → płaszczyzna dysku): materiał wbudowany three (głębia logarytmiczna — three sam).
    this.risers = new THREE.LineSegments(new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    this.risers.name = 'galaxyRisers';
    this.risers.layers.set(GALAXY_LAYER);
    this.risers.frustumCulled = false;
    group.add(this.risers);
    this._ownerHaloList = [];         // [{ systemId, color }]
    this._riserIds = [];
    this._riserColor = 0xffffff;
    this._entries = [];               // [{ id, sys, ly, bright, look }]
    this._index = new Map();          // id → indeks
    this._anchor = { x: 0, y: 0, z: 0 };
    this._activeId = null;
    this._homeId = 'sys_home';
    this._selectedId = null;
    this._knobSnap = null;
  }

  /**
   * Gwiazdy płyty z `galaxyData.systems`. `brightOf(sys)` — czy gwiazda w pełnej jasności (miejsce znane graczowi);
   * inaczej intensywność × `UNEXPLORED_MUL`.
   */
  setSystems(systems, { brightOf = () => true } = {}) {
    const list = (Array.isArray(systems) ? systems : []).filter((s) => s && s.id != null);
    this._entries = list.map((sys) => ({ id: String(sys.id), sys, ly: galaxyLyToWorld(sys), bright: brightOf(sys) === true }));
    this._index = new Map(this._entries.map((e, i) => [e.id, i]));
    const home = list.find((s) => s.isHome === true) ?? list.find((s) => String(s.id) === 'sys_home');
    this._homeId = home ? String(home.id) : null;
    this._rebuildStars();
    this._rebuildHalos();
  }

  /** Kotwica: aktywny układ w początku świata (`group.position = −P_active · K`). */
  setAnchor(systems, activeId) {
    this._activeId = activeId ?? null;
    this._anchor = galaxyAnchorLy(systems, activeId);
    const p = plateGroupPosition(this._anchor, GALAXY_K);
    this.group.position.set(p.x, p.y, p.z);
  }

  setSelected(id) {
    const k = id == null ? null : String(id);
    if (k === this._selectedId) return;
    this._selectedId = k;
    this._rebuildHalos();
  }

  setFade(f) {
    const v = Math.max(0, Math.min(1, Number(f) || 0));
    this.material.uniforms.uFade.value = v;
    this.risers.material.opacity = (Number(LIVE_GALAXY.RISER_ALPHA) || 0) * v;   // G2-3 — słupki gasną z płytą
  }
  get fade() { return this.material.uniforms.uFade.value; }
  setVisible(on) { this.group.visible = !!on; }
  setTime(t) { this.material.uniforms.uTime.value = t; }

  /** Pokrętła wyglądu (`LIVE_GALAXY`) — przeliczenie atrybutów przy zmianie. */
  tick() {
    if (!galaxyKnobsChanged(this._knobSnap, LIVE_GALAXY)) return false;
    this._rebuildStars();
    this._rebuildHalos();
    this._rebuildOwnerHalos();
    this._rebuildRisers();
    this.setFade(this.fade);
    return true;
  }

  /**
   * G2-3 — aureole własności: `[{ systemId, color }]` (barwa imperium, napis CSS albo liczba). Ta sama lista — nic.
   * @returns {boolean} czy przebudowano
   */
  setOwnerHalos(list) {
    const next = (Array.isArray(list) ? list : []).filter((h) => h && h.systemId != null)
      .map((h) => ({ systemId: String(h.systemId), color: h.color }));
    const key = next.map((h) => `${h.systemId}:${h.color}`).join('|');
    if (key === this._ownerHaloKey) return false;
    this._ownerHaloKey = key;
    this._ownerHaloList = next;
    this._rebuildOwnerHalos();
    return true;
  }

  /**
   * G2-3 — słupki: id układów (gracza + zaznaczona) i barwa (0xRRGGBB z roli HUD). Ta sama lista i barwa — nic.
   * @returns {boolean} czy przebudowano
   */
  setRisers(ids, colorHex = 0xffffff) {
    const next = (Array.isArray(ids) ? ids : []).map(String);
    const key = next.join('|') + '#' + colorHex;
    if (key === this._riserKey) return false;
    this._riserKey = key;
    this._riserIds = next;
    this._riserColor = colorHex;
    this._rebuildRisers();
    return true;
  }

  /** Położenie gwiazdy w świecie [j.] (aktywny układ w początku). */
  starWorld(id) {
    const i = this._index.get(String(id));
    return i == null ? null : plateWorldOf(this._entries[i].sys, this._anchor, GALAXY_K);
  }

  /** Wszystkie gwiazdy w świecie [j.]: [{ id, x, y, z }] — rzut warstwy HUD i wybór gwiazdy. */
  starsWorld() {
    return this._entries.map((e) => ({ id: e.id, ...plateWorldOf(e.sys, this._anchor, GALAXY_K) }));
  }

  /** Odczyt bramki: liczby, kotwica, zaznaczenie, jasność / rozmiar skrajne. */
  info() {
    const looks = this._entries.map((e) => e.look).filter(Boolean);
    const r3 = (v) => (Number.isFinite(v) ? +v.toFixed(3) : null);
    return {
      stars: this._entries.length, halos: this.halos.geometry?.drawRange?.count ?? 0,
      activeId: this._activeId, homeId: this._homeId, selectedId: this._selectedId,
      anchorLy: { x: r3(this._anchor.x), y: r3(this._anchor.y), z: r3(this._anchor.z) },
      groupPosition: { x: r3(this.group.position.x), y: r3(this.group.position.y), z: r3(this.group.position.z) },
      fade: r3(this.fade), visible: this.group.visible,
      bright: this._entries.filter((e) => e.bright).length,
      sizePx: looks.length ? { min: r3(Math.min(...looks.map((l) => l.size))), max: r3(Math.max(...looks.map((l) => l.size))) } : null,
      intensity: looks.length ? { min: r3(Math.min(...looks.map((l) => l.intensity))), max: r3(Math.max(...looks.map((l) => l.intensity))) } : null,
      ownerHalos: this.ownerHalos.geometry?.drawRange?.count ?? 0,
      risers: (this._riserIds ?? []).length,
      knobs: { ...LIVE_GALAXY },
    };
  }

  // Atrybuty jak niebo (`position`, `color`, `aIntensity`, `aSize`, `aPhase`) — pozycje w ly, osie świata.
  _setAttributes(points, rows) {
    const THREE = this.THREE, n = rows.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const inten = new Float32Array(n), size = new Float32Array(n), phase = new Float32Array(n);
    rows.forEach((r, i) => {
      pos[i * 3] = r.ly.x; pos[i * 3 + 1] = r.ly.y; pos[i * 3 + 2] = r.ly.z;
      col[i * 3] = r.look.color[0]; col[i * 3 + 1] = r.look.color[1]; col[i * 3 + 2] = r.look.color[2];
      inten[i] = r.look.intensity; size[i] = r.look.size; phase[i] = r.phase;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',   new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color',      new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aIntensity', new THREE.BufferAttribute(inten, 1));
    geo.setAttribute('aSize',      new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase',     new THREE.BufferAttribute(phase, 1));
    geo.setDrawRange(0, n);
    points.geometry?.dispose?.();
    points.geometry = geo;
  }

  _rebuildStars() {
    this._knobSnap = galaxyKnobSnapshot(LIVE_GALAXY);
    for (const e of this._entries) e.look = plateStarLook(e.sys, { explored: e.bright }, LIVE_GALAXY);
    this._setAttributes(this.stars, this._entries.map((e) => ({ ly: e.ly, look: e.look, phase: platePhase(e.id) })));
  }

  // G2-3 — aureole własności: PSF w barwie imperium, rozmiar × `OWNER_HALO_MUL`, intensywność `OWNER_HALO_I`.
  _rebuildOwnerHalos() {
    const THREE = this.THREE, rows = [];
    for (const h of this._ownerHaloList ?? []) {
      const i = this._index.get(h.systemId);
      if (i == null) continue;
      const e = this._entries[i];
      const look = e.look ?? plateStarLook(e.sys, { explored: e.bright }, LIVE_GALAXY);
      const c = new THREE.Color(h.color);
      rows.push({ ly: e.ly, look: { size: look.size * (Number(LIVE_GALAXY.OWNER_HALO_MUL) || 0), intensity: Number(LIVE_GALAXY.OWNER_HALO_I) || 0,
        color: [c.r, c.g, c.b] }, phase: 0 });
    }
    this._setAttributes(this.ownerHalos, rows);
  }

  // G2-3 — słupki (`riserEndpoints`: od dysku y = 0 do gwiazdy y = gz) i kropki u podstawy.
  _rebuildRisers() {
    const THREE = this.THREE;
    const pts = [], bases = [];
    const c = new THREE.Color(this._riserColor);
    for (const id of this._riserIds ?? []) {
      const i = this._index.get(String(id));
      if (i == null) continue;
      const e = this._entries[i];
      const r = riserEndpoints(e.ly.x, e.ly.z, e.ly.y);   // (gx, gy, gz) — oś świata Y = gz
      pts.push(r.base.x, r.base.y, r.base.z, r.top.x, r.top.y, r.top.z);
      bases.push({ ly: { x: r.base.x, y: 0, z: r.base.z }, look: { size: 2.6, intensity: 0.55, color: [c.r, c.g, c.b] }, phase: 0 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
    this.risers.geometry?.dispose?.();
    this.risers.geometry = geo;
    this.risers.material.color.setHex(this._riserColor);
    this._setAttributes(this.riserBases, bases);
  }

  _rebuildHalos() {
    const rows = [];
    for (const id of haloIds(this._homeId, this._selectedId)) {
      const i = this._index.get(id);
      if (i == null) continue;
      const e = this._entries[i];
      rows.push({ ly: e.ly, look: plateHaloLook(e.look ?? plateStarLook(e.sys, { explored: e.bright }, LIVE_GALAXY), LIVE_GALAXY), phase: 0 });
    }
    this._setAttributes(this.halos, rows);
  }

  dispose() {
    this.stars.geometry?.dispose?.();
    this.halos.geometry?.dispose?.();
    this.ownerHalos.geometry?.dispose?.();
    this.riserBases.geometry?.dispose?.();
    this.risers.geometry?.dispose?.();
    this.risers.material?.dispose?.();
    this.material.dispose?.();
    this.group.parent?.remove?.(this.group);
  }
}
