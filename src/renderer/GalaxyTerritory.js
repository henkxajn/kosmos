// GalaxyTerritory — ARC GALAXY, krok G2-3 (docs/design/GALAXY_PLAN.md §4 G2; D-GX-15 (a); rama F5 A/B): TERYTORIUM na płycie
// galaktyki — jedna płaszczyzna „rozlanego światła” na widocznego właściciela (pole wpływu z `TerritoryField` jako tekstura
// 1-kanałowa half-float, filtr liniowy — rdzeń WebGL2) i niskie zasłony granicy wyciągnięte z pętli izolinii. Grupa jest
// dzieckiem grupy płyty (`GalaxyPlate.group` — autorowana w ly, `scale = K`, aktywny układ w początku świata): płaszczyzna leży
// w płaszczyźnie dysku (y = 0 płyty), x = gx, z = gy galaktyki — ta sama siatka co pętle, więc krawędź płaszczyzny i zasłony się
// pokrywają (D-GX-15).
//   • Ładunek — `GalaxyTerritoryLogic.buildPlateTerritoryPayload` (mgła `resolveTerritoryVisibility`, szew z maksimum pól
//     pozostałych WIDOCZNYCH właścicieli, sygnatura content-hash): przebudowa tekstur i siatek wyłącznie przy zmianie sygnatury.
//   • Pokrętła wyglądu (`LIVE_GALAXY` — `TERR_*`) czytane co klatkę w `tick` (uniformy; wysokość zasłony = skala Y).
//   • Siatki na warstwie płyty (`GALAXY_LAYER`) — kamera trybu układu i raycast układu ich nie widzą; test głębi tak, zapis nie,
//     addytywnie; chunki głębi logarytmicznej (V4) nakłada tu wołający przez `logDepth`.
// ⚠ THREE wstrzykiwany (wzór `GalaxyPlate`) — moduł nie importuje three, więc ładuje się pod node.
import {
  TERRITORY_PLANE_VERT, TERRITORY_PLANE_FRAG, TERRITORY_CURTAIN_VERT, TERRITORY_CURTAIN_FRAG,
} from './GalaxyTerritoryShader.js';
import { withLogDepthVertex, withLogDepthFragment } from './LogDepthChunks.js';
import { curtainGeometry, seamStyleParams } from '../ui/GalaxyTerritoryLogic.js';
import { LIVE_GALAXY } from '../ui/GalaxyModeLogic.js';
import { mixSeed, hashStringToInt } from '../utils/SeedMath.js';

const PHASE_SALT = 0x7E44A;   // sól fazy oddechu właściciela

export class GalaxyTerritory {
  /**
   * @param <class 'object'> THREE — moduł three
   * @param {{ logDepth?:boolean, layer?:number }} [opts]
   */
  constructor(THREE, { logDepth = false, layer = 1 } = {}) {
    this.THREE = THREE;
    this._logDepth = !!logDepth;
    this._layer = layer;
    this.group = new THREE.Group();
    this.group.name = 'galaxyTerritory';
    this._items = [];          // [{ ownerId, plane, curtain, mats, texs }]
    this._sig = null;
    this._rebuilds = 0;
    this._lastBuildMs = 0;
    this._iso = 0.5;
  }

  _phase(id) { return (mixSeed((hashStringToInt(String(id)) ^ PHASE_SALT) >>> 0) / 4294967296) * Math.PI * 2; }

  _halfTex(field, nx, ny) {
    const THREE = this.THREE;
    const toHalf = THREE.DataUtils?.toHalfFloat;
    const data = new Uint16Array(nx * ny);
    for (let i = 0; i < data.length; i++) data[i] = toHalf ? toHalf(field[i] ?? 0) : 0;
    const tex = new THREE.DataTexture(data, nx, ny, THREE.RedFormat, THREE.HalfFloatType);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }

  _shader(vert, frag) {
    return {
      vertexShader: this._logDepth ? withLogDepthVertex(vert) : vert,
      fragmentShader: this._logDepth ? withLogDepthFragment(frag) : frag,
    };
  }

  /**
   * Ładunek terytorium (sygnatura bez zmian — nic). `colorOf(hex)` → `THREE.Color` (liniowo), `outlineColor` — barwa zarysu
   * (`rumor`; rola HUD `dim`), `iso` — próg izolinii (`GAME_CONFIG.TERRITORY.ISO`).
   * @returns {boolean} czy przebudowano
   */
  apply(payload, { colorOf, outlineColor = null, iso = 0.5 } = {}) {
    if (!payload || payload.sig === this._sig) return false;
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    this._clear();
    this._sig = payload.sig;
    this._iso = iso;
    const THREE = this.THREE, g = payload.grid;
    for (const L of payload.layers ?? []) {
      const item = { ownerId: L.ownerId, mode: L.mode, atWar: L.atWar, plane: null, curtain: null, mats: [], texs: [], geos: [] };
      const color = L.mode === 'outline' && outlineColor ? outlineColor : colorOf(L.color);
      if (g && L.field && L.field.length === g.nx * g.ny) {
        const half = g.cell / 2;
        const x0 = g.x0 - half, x1 = g.x0 + (g.nx - 1) * g.cell + half;
        const z0 = g.y0 - half, z1 = g.y0 + (g.ny - 1) * g.cell + half;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1]), 3));
        geo.setIndex([0, 2, 1, 0, 3, 2]);
        geo.computeBoundingSphere();
        const fieldTex = this._halfTex(L.field, g.nx, g.ny);
        const othersTex = L.others ? this._halfTex(L.others, g.nx, g.ny) : null;
        const mat = new THREE.ShaderMaterial({
          uniforms: {
            uField: { value: fieldTex }, uOthers: { value: othersTex ?? fieldTex }, uHasOthers: { value: othersTex ? 1 : 0 },
            uColor: { value: color.clone() }, uSeamColor: { value: new THREE.Color(1.0, 0.96, 0.9) },
            uIso: { value: iso }, uPoolA: { value: 0 }, uCoreMult: { value: 1 }, uFront: { value: 0.3 }, uRimPx: { value: 1 }, uRimI: { value: 1 },
            uSeamPx: { value: 1 }, uSeamI: { value: 1 }, uBreath: { value: 0 }, uTime: { value: 0 },
            uSeamWhite: { value: 1 }, uSeamHatch: { value: 0 }, uRimOverlap: { value: 1 },
            uPhase: { value: this._phase(L.ownerId) }, uOutline: { value: L.mode === 'outline' ? 1 : 0 },
            uWar: { value: L.atWar ? 1 : 0 }, uFade: { value: 0 },
            uGridOrigin: { value: new THREE.Vector2(g.x0, g.y0) }, uCell: { value: g.cell }, uGridN: { value: new THREE.Vector2(g.nx, g.ny) },
          },
          ...this._shader(TERRITORY_PLANE_VERT, TERRITORY_PLANE_FRAG),
          transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        });
        const plane = new THREE.Mesh(geo, mat);
        plane.name = 'territoryPlane:' + L.ownerId;
        plane.layers.set(this._layer);
        plane.renderOrder = -1;   // pod gwiazdami i aureolami płyty (addytywnie — kolejność dla porządku, nie wyniku)
        this.group.add(plane);
        item.plane = plane;
        item.mats.push(mat); item.geos.push(geo); item.texs.push(fieldTex); if (othersTex) item.texs.push(othersTex);
      }
      const cg = curtainGeometry(L.loops, 1);
      if (cg.count > 0) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(cg.position, 3));
        geo.setAttribute('aV', new THREE.BufferAttribute(cg.v, 1));
        geo.computeBoundingSphere();
        const mat = new THREE.ShaderMaterial({
          uniforms: { uColor: { value: color.clone() }, uA: { value: 0 }, uFade: { value: 0 }, uWar: { value: L.atWar ? 1 : 0 }, uTime: { value: 0 } },
          ...this._shader(TERRITORY_CURTAIN_VERT, TERRITORY_CURTAIN_FRAG),
          transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        });
        const curtain = new THREE.Mesh(geo, mat);
        curtain.name = 'territoryCurtain:' + L.ownerId;
        curtain.layers.set(this._layer);
        this.group.add(curtain);
        item.curtain = curtain;
        item.mats.push(mat); item.geos.push(geo);
      }
      this._items.push(item);
    }
    this._rebuilds++;
    this._lastBuildMs = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0;
    return true;
  }

  /** Co klatkę: pokrętła wyglądu (`TERR_*`), oddech (zegar sceny), gaśnięcie razem z płytą. */
  tick({ time = 0, fade = 1, knobs = LIVE_GALAXY } = {}) {
    const k = knobs ?? LIVE_GALAXY;
    const seam = seamStyleParams(k.TERR_SEAM_STYLE);   // styl szwu spornego → wagi (styl 0 = 1/0/1)
    for (const it of this._items) {
      if (it.plane) {
        const u = it.plane.material.uniforms;
        u.uSeamWhite.value = seam.white; u.uSeamHatch.value = seam.hatch; u.uRimOverlap.value = seam.rimOverlap;
        u.uPoolA.value = k.TERR_POOL_ALPHA; u.uCoreMult.value = k.TERR_CORE_MULT; u.uFront.value = Number.isFinite(k.TERR_FRONT) ? k.TERR_FRONT : 0.3;
        u.uRimPx.value = k.TERR_RIM_PX; u.uRimI.value = k.TERR_RIM_I;
        u.uSeamPx.value = k.TERR_SEAM_PX; u.uSeamI.value = k.TERR_SEAM_I;
        u.uBreath.value = k.TERR_BREATH; u.uTime.value = time; u.uFade.value = fade;
      }
      if (it.curtain) {
        const u = it.curtain.material.uniforms;
        u.uA.value = it.mode === 'outline' ? k.TERR_CURTAIN_A * 0.5 : k.TERR_CURTAIN_A;
        u.uFade.value = fade; u.uTime.value = time;
        it.curtain.scale.y = Math.max(1e-4, Number(k.TERR_CURTAIN_LY) || 0);
      }
    }
  }

  /** Odczyt bramki (`KOSMOS.debug.galaxyTerritoryInfo()`). */
  info() {
    return {
      owners: this._items.map((it) => ({ ownerId: it.ownerId, mode: it.mode, atWar: it.atWar, plane: !!it.plane, curtain: !!it.curtain,
        curtainTris: it.curtain ? (it.curtain.geometry.attributes.position.count / 3) : 0 })),
      sig: this._sig, rebuilds: this._rebuilds, lastBuildMs: +this._lastBuildMs.toFixed(3), iso: this._iso,
      visible: this.group.visible,
    };
  }

  _clear() {
    for (const it of this._items) {
      for (const m of it.mats) m.dispose?.();
      for (const g of it.geos) g.dispose?.();
      for (const t of it.texs) t.dispose?.();
      if (it.plane) this.group.remove(it.plane);
      if (it.curtain) this.group.remove(it.curtain);
    }
    this._items = [];
  }

  dispose() {
    this._clear();
    this._sig = null;
    this.group.parent?.remove?.(this.group);
  }
}
