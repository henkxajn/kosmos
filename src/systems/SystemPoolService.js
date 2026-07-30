// SystemPoolService — „system pool" surowców MATERIALNYCH: kolonia-matka (planeta) + kolonie jej
// księżyców, spięte aktywnym modułem `logistics_hub` na stacji orbitalnej gracza.
//
// Runtime-only (NIE serializowany — odtwarzany z modułów stacji przy każdym tiku; wzór TerritoryService).
// Kolaboratorzy leniwie przez window.KOSMOS (zero cross-importów systemów). window.KOSMOS.systemPoolService.
//
// Model (plan „Orbital Logistics Hub"):
//   • Pula istnieje, gdy stacja GRACZA ma AKTYWNY logistics_hub i rozwiązaną matkę
//     (resolveHomeColony ≠ null) ORAZ ani planeta-kotwica, ani stacja nie są zablokowane.
//   • Członkowie: kolonia planety-kotwicy (jeśli gracza) + kolonie księżyców tej planety
//     (parentPlanetId === kotwica); księżyc zablokowany wypada z puli osobno.
//   • Link „always-on": energia hubu NIE bramkuje linku (decyzja projektowa) — hub kosztuje matkę
//     stałą energię (rejestrowaną jak upkeep budynku), co może wepchnąć matkę we WŁASNY brownout,
//     ale sam hub nie gaśnie.
//   • Tylko surowce materialne. Energia/kredyty/research zostają per-kolonia.
//   • Deposit lokalny; draw local→matka→księżyce (PooledStore). Survival (food/water) — dokarmianie
//     z nadwyżki rodzeństwa raz na turę (rate-based konsumpcja nie przechodzi przez spend()).
//
// Blokada (per-body compose): wrogi UZBROJONY statek na orbicie ciała (dockedAt) lub ≤ BLOCKADE_RANGE_AU.

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { resolveHomeColony } from '../utils/TransferStore.js';
import { isEnemyVessel, hasWeapons } from '../entities/Vessel.js';
import { DistanceUtils } from '../utils/DistanceUtils.js';
import { PooledStore } from '../utils/PooledStore.js';
import { STATION_MODULES } from '../data/StationModuleData.js';

const HUB_MODULE        = 'logistics_hub';
const BLOCKADE_RANGE_AU = 0.5;              // ≈ SNAP_TO_BODY_AU (VesselManager) — „na orbicie / oblega"
const SURVIVAL_KEYS     = ['food', 'water'];

export class SystemPoolService {
  constructor() {
    // Pula liczona LENIWIE (dirty na time:tick) → getStore zawsze świeże niezależnie od kolejności handlerów.
    this._dirty       = true;
    this._pools       = [];          // [{ anchorPlanetId, stationId, motherColonyId, memberColonies[], memberResSys:Set }]
    this._byResSys    = new Map();   // ResourceSystem → pool (getStore(resSys))
    this._byColonyId  = new Map();   // colonyId → pool
    // Kotwice z aktywnym hubem (anchorPlanetId → anchorName) — wskaźnik 'severed' niezależny od liczby członków.
    this._hubAnchors  = new Map();
    // Upkeep energii hubu na matce — diff rejestracji między tikami (bez churn _recalcPerYear).
    this._hubEnergy   = new Map();   // producerId → ResourceSystem (na którym zarejestrowano)

    EventBus.on('time:tick', ({ civDeltaYears }) => this._onTick(civDeltaYears ?? 0));
    // Zdarzenia unieważniające skład puli natychmiast (poza kadencją tiku).
    const inval = () => { this._dirty = true; };
    EventBus.on('station:created',    inval);
    EventBus.on('station:destroyed',  inval);
    EventBus.on('station:moduleBuilt', inval);
    EventBus.on('colony:listChanged', inval);
    EventBus.on('colony:destroyed',   inval);
  }

  get _enabled() { return GAME_CONFIG.FEATURES?.orbitalLogisticsHub !== false; }

  // ── Publiczne API ──────────────────────────────────────────────────────────

  /**
   * Zwraca PooledStore, gdy kolonia (po ResourceSystem lub id) jest członkiem AKTYWNEJ puli;
   * inaczej zwraca wejściowy ResourceSystem bez zmian (identyczność → zero zmian zachowania off-pool).
   * JEDYNY punkt wejścia dla call-sites (cargo/build/factory).
   */
  getStore(resSysOrColonyId) {
    const raw = _rawOf(resSysOrColonyId);
    if (!this._enabled || !raw) return raw;
    this._ensureFresh();
    const pool = (typeof resSysOrColonyId === 'string')
      ? this._byColonyId.get(resSysOrColonyId)
      : this._byResSys.get(resSysOrColonyId);
    if (!pool) return raw;
    const siblings = this._orderedSiblings(pool, raw);
    if (siblings.length === 0) return raw;
    return new PooledStore(raw, siblings);
  }

  /** Pula kolonii (≥2 członków) lub null. Do UI/indykatora linku. */
  getPool(colonyId) {
    if (!this._enabled) return null;
    this._ensureFresh();
    return this._byColonyId.get(colonyId) ?? null;
  }

  /** Czy ciało jest zablokowane (wrogi uzbrojony statek na orbicie / ≤ BLOCKADE_RANGE_AU). */
  isBlockaded(body) {
    if (!this._enabled) return false;
    return this._hostileWarshipInOrbit(body);
  }

  /**
   * Snapshot puli (do StationPanel/StationManagementView): { anchorPlanetId, total:Map, byBody:[{colony, inv:Map}] }.
   * null gdy kolonia nie jest w puli.
   */
  getPoolSnapshot(colonyId) {
    const pool = this.getPool(colonyId);
    if (!pool) return null;
    const total = new Map();
    const byBody = [];
    for (const col of pool.memberColonies) {
      const inv = col.resourceSystem?.inventory;
      const bodyInv = new Map();
      if (inv instanceof Map) {
        for (const [k, v] of inv) {
          if (v === 0) continue;
          total.set(k, (total.get(k) ?? 0) + v);
          bodyInv.set(k, v);
        }
      }
      byBody.push({ colony: col, inv: bodyInv });
    }
    return { anchorPlanetId: pool.anchorPlanetId, total, byBody };
  }

  /**
   * Status linku hubu dla kolonii (wskaźnik w ColonyOverlay): 'linked' (w aktywnej puli),
   * 'severed' (księżyc rodzica-z-hubem, ale odcięty blokadą), null (brak hubu w zasięgu).
   */
  getHubLinkInfo(colonyId) {
    if (!this._enabled) return null;
    this._ensureFresh();
    const pool = this._byColonyId.get(colonyId);
    if (pool) {
      return { status: 'linked', anchorPlanetId: pool.anchorPlanetId, anchorName: EntityManager.get(pool.anchorPlanetId)?.name ?? pool.anchorPlanetId };
    }
    const body = EntityManager.get(colonyId);
    if (!body || body.type !== 'moon' || !body.parentPlanetId) return null;
    // 'severed': rodzic ma AKTYWNY hub (kotwica w _hubAnchors — niezależnie od tego, czy po odpadnięciu
    // zablokowanych księżyców została ≥2-osobowa pula), a TEN księżyc jest zablokowany.
    if (!this._hubAnchors.has(body.parentPlanetId)) return null;
    if (this._hostileWarshipInOrbit(body)) {
      return { status: 'severed', anchorPlanetId: body.parentPlanetId, anchorName: this._hubAnchors.get(body.parentPlanetId) };
    }
    return null;
  }

  /**
   * Czy survival (food/water) tej kolonii jest pokrywany z NADWYŻKI rodzeństwa w puli (§7)?
   * Do TŁUMIENIA fałszywej flagi niedoboru członka pooled (lokalny stan ≈0 z założenia — §7 dokarmia
   * co turę). Zwraca false gdy: OFF, kolonia NIE-pooled (severed też — poza _byResSys), albo pula PUSTA
   * z tego surowca (wtedy realny głód → flaga zostaje). Materiał/przemysł: gate w ResourceSystem = tylko food/water.
   */
  poolCoversSurvival(resSys, resId) {
    if (!this._enabled) return false;
    this._ensureFresh();
    const pool = this._byResSys.get(resSys);
    if (!pool) return false;
    for (const col of pool.memberColonies) {
      if (col.resourceSystem === resSys) continue;
      if ((col.resourceSystem.getAmount(resId) ?? 0) > 0) return true;   // rodzeństwo ma surowiec → §7 dokarmi
    }
    return false;
  }

  // ── Tick ─────────────────────────────────────────────────────────────────

  _onTick(civDt) {
    if (!this._enabled) {
      this._clearHubEnergy();
      // Wyłączone: wyczyść pule + oznacz dirty → ponowne włączenie ZAWSZE odbudowuje od zera
      // (usuwa ryzyko „cache pustego wyniku" po cyklu OFF→ON; ITEM 1 hardening).
      if (this._pools.length || this._byColonyId.size || this._hubAnchors.size) {
        this._pools = []; this._byResSys = new Map(); this._byColonyId = new Map(); this._hubAnchors = new Map();
      }
      this._dirty = true;
      return;
    }
    this._dirty = true;                 // pozycje/blokady zmieniają się co turę
    this._ensureFresh();
    this._syncHubEnergy();              // upkeep energii hubu na matce (diff — bez churn)
    if (civDt > 0) this._reconcileSurvival(civDt);   // food/water: dokarm z nadwyżki rodzeństwa
  }

  // ── Recompute puli (leniwie) ───────────────────────────────────────────────

  _ensureFresh() {
    if (!this._dirty) return;
    this._dirty      = false;
    this._pools      = [];
    this._byResSys   = new Map();
    this._byColonyId = new Map();
    this._hubAnchors = new Map();

    const stationSys = window.KOSMOS?.stationSystem;
    const colMgr     = window.KOSMOS?.colonyManager;
    if (!stationSys || !colMgr) return;

    const stations = stationSys.getAllStations?.() ?? [];
    if (stations.length === 0) return;

    // Kolonie gracza raz — źródło zarówno kotwicy, jak i księżyców (getPlayerColonies filtruje AI).
    const playerCols   = colMgr.getPlayerColonies?.() ?? [];
    const playerColById = new Map(playerCols.map(c => [c.planetId, c]));
    const seenAnchors  = new Set();

    for (const station of stations) {
      if (station.ownerEmpireId !== 'player') continue;
      if (!this._hasActiveHub(station)) continue;
      const mother = resolveHomeColony(station);
      if (!mother?.resourceSystem) continue;

      const motherBody = EntityManager.get(mother.planetId);
      if (!motherBody) continue;
      const anchorPlanetId = (motherBody.type === 'moon' && motherBody.parentPlanetId)
        ? motherBody.parentPlanetId : motherBody.id;
      if (seenAnchors.has(anchorPlanetId)) continue;   // jedna pula na planetę-kotwicę
      seenAnchors.add(anchorPlanetId);

      // Blokada planety-kotwicy LUB stacji → cała pula nieaktywna.
      const anchorBody = EntityManager.get(anchorPlanetId);
      if (anchorBody && this._hostileWarshipInOrbit(anchorBody)) continue;
      if (this._hostileWarshipInOrbit(station)) continue;

      // Hub „up" (kotwica+stacja NIE zablokowane) — zapamiętaj kotwicę do wskaźnika 'severed'
      // NAWET jeśli po odpadnięciu zablokowanych księżyców zostanie <2 członków (pula się rozpadnie).
      this._hubAnchors.set(anchorPlanetId, EntityManager.get(anchorPlanetId)?.name ?? anchorPlanetId);

      // Członkowie: kolonia planety-kotwicy (jeśli gracza) + kolonie księżyców (link up).
      const members = [];
      const anchorCol = playerColById.get(anchorPlanetId);
      if (anchorCol?.resourceSystem) members.push(anchorCol);
      for (const col of playerCols) {
        if (!col.resourceSystem) continue;
        if (col === anchorCol) continue;
        const body = EntityManager.get(col.planetId);
        if (!body || body.type !== 'moon') continue;
        if (body.parentPlanetId !== anchorPlanetId) continue;
        if (this._hostileWarshipInOrbit(body)) continue;   // ten księżyc zablokowany → poza pulą
        members.push(col);
      }
      if (members.length < 2) continue;   // sama matka bez księżyców = brak poolowania

      const pool = {
        anchorPlanetId,
        stationId:      station.id,
        motherColonyId: mother.planetId,
        memberColonies: members,
        memberResSys:   new Set(members.map(c => c.resourceSystem)),
      };
      this._pools.push(pool);
      for (const c of members) {
        this._byColonyId.set(c.planetId, pool);
        this._byResSys.set(c.resourceSystem, pool);
      }
    }
  }

  _hasActiveHub(station) {
    const mods = station?.modules;
    if (!Array.isArray(mods)) return false;
    return mods.some(m => m.active !== false && m.moduleType === HUB_MODULE);
  }

  /** Kolejność poboru dla PooledStore: matka najpierw (jeśli ≠ dom), potem księżyce wg stanu malejąco. */
  _orderedSiblings(pool, home) {
    const motherId  = pool.motherColonyId;
    const siblings  = pool.memberColonies.filter(c => c.resourceSystem !== home);
    siblings.sort((a, b) => {
      const am = a.planetId === motherId ? 1 : 0;
      const bm = b.planetId === motherId ? 1 : 0;
      if (am !== bm) return bm - am;                                             // matka najpierw
      return _totalStock(b.resourceSystem) - _totalStock(a.resourceSystem);      // potem stan malejąco
    });
    return siblings.map(c => c.resourceSystem);
  }

  // ── Upkeep energii hubu (na matce, always-on) ───────────────────────────────

  _syncHubEnergy() {
    const stationSys = window.KOSMOS?.stationSystem;
    const desired = new Map();   // producerId → { resSys, energy }
    for (const station of (stationSys?.getAllStations?.() ?? [])) {
      if (station.ownerEmpireId !== 'player') continue;
      if (!this._hasActiveHub(station)) continue;
      const mother = resolveHomeColony(station);
      if (!mother?.resourceSystem) continue;
      const up = STATION_MODULES[HUB_MODULE]?.motherEnergyUpkeep ?? 0;
      if (up <= 0) continue;
      desired.set(`logi_hub_${station.id}`, { resSys: mother.resourceSystem, energy: -up });
    }
    // Usuń nieaktualne (hub zniknął / matka utracona).
    for (const [pid, resSys] of [...this._hubEnergy]) {
      if (!desired.has(pid)) { resSys.removeProducer?.(pid); this._hubEnergy.delete(pid); }
    }
    // Dodaj / przenieś (tylko przy zmianie — unikamy churn _recalcPerYear co tik).
    for (const [pid, { resSys, energy }] of desired) {
      const prev = this._hubEnergy.get(pid);
      if (prev === resSys) continue;                 // już zarejestrowany na tej matce
      if (prev) prev.removeProducer?.(pid);          // matka się zmieniła
      resSys.registerProducer?.(pid, { energy });
      this._hubEnergy.set(pid, resSys);
    }
  }

  _clearHubEnergy() {
    for (const [pid, resSys] of this._hubEnergy) resSys.removeProducer?.(pid);
    this._hubEnergy.clear();
  }

  // ── Survival (food/water) — dokarmianie z nadwyżki rodzeństwa ────────────────
  // POP je przez UJEMNĄ stawkę w ResourceSystem._update (clamp do 0), NIE przez spend() → fasada tego
  // nie widzi. Raz na turę: dla każdego członka z niedoborem tej tury dobierz brakującą ilość z nadwyżki
  // rodzeństwa (matka najpierw). Pula pusta → członek zostaje na 0 → normalne wygłodzenie (bez zmian).
  _reconcileSurvival(civDt) {
    for (const pool of this._pools) {
      for (const res of SURVIVAL_KEYS) {
        const need    = [];   // { rs, deficit }
        const surplus = [];   // { rs, avail, isMother }
        let surplusTotal = 0;
        for (const col of pool.memberColonies) {
          const rs = col.resourceSystem;
          const net      = rs.getPerYear(res);                 // POP/rok netto (survival = ujemny)
          const nextNeed = net < 0 ? -net * civDt : 0;         // ile zje w tej turze
          const stock    = rs.getAmount(res);
          if (stock < nextNeed) {
            need.push({ rs, deficit: nextNeed - stock });
          } else {
            const extra = stock - nextNeed;
            if (extra > 1e-6) {
              surplus.push({ rs, avail: extra, isMother: col.planetId === pool.motherColonyId });
              surplusTotal += extra;
            }
          }
        }
        if (need.length === 0 || surplusTotal <= 0) continue;
        surplus.sort((a, b) => (Number(b.isMother) - Number(a.isMother)) || (b.avail - a.avail));
        for (const n of need) {
          let want = n.deficit;
          for (const s of surplus) {
            if (want <= 1e-9) break;
            if (s.avail <= 1e-9) continue;
            const take = Math.min(s.avail, want);
            if (s.rs.spend({ [res]: take })) {
              n.rs.receive({ [res]: take });
              s.avail -= take;
              want    -= take;
            }
          }
        }
      }
    }
  }

  // ── Blokada (per-body compose) ──────────────────────────────────────────────

  _hostileWarshipInOrbit(body) {
    const vm = window.KOSMOS?.vesselManager;
    if (!vm || !body) return false;
    const vessels = vm.getAllVessels?.() ?? [];
    const bodySys = body.systemId ?? 'sys_home';
    let candidates = null;   // leniwie — lista ciał układu, tylko gdy potrzebna (gałąź free-float)
    for (const v of vessels) {
      if (!v || v.isWreck) continue;
      if (!isEnemyVessel(v)) continue;
      if (!hasWeapons(v)) continue;
      if ((v.systemId ?? 'sys_home') !== bodySys) continue;   // ta sama ramka współrzędnych
      const pos = v.position;
      if (!pos) continue;
      if (pos.dockedAt === body.id) return true;              // realny orbiter TEGO ciała
      if (pos.dockedAt) continue;                             // zadokowany gdzie indziej → NIE oblega tego ciała
      // free-float (dockedAt=null): oblega ciało TYLKO gdy w zasięgu I to jest NAJBLIŻSZE ciało układu.
      // Bez „najbliższe" statek przy księżycu (orbituje planetę < 0.5 AU) blokowałby też planetę.
      const dB = DistanceUtils.euclideanAU(pos, body);   // body.x/body.y (ciała mają x/y na TOP-LEVEL, nie .position)
      if (dB >= BLOCKADE_RANGE_AU) continue;
      if (!candidates) candidates = this._systemBodies(bodySys);
      let nearest = true;
      for (const other of candidates) {
        if (other === body || other.id === body.id) continue;
        if (DistanceUtils.euclideanAU(pos, other) < dB - 1e-9) { nearest = false; break; }
      }
      if (nearest) return true;
    }
    return false;
  }

  // Ciała układu (planety+księżyce+stacje) w danym systemie — kandydaci do „najbliższego" przy free-float.
  _systemBodies(sysId) {
    const out = [];
    for (const type of ['planet', 'moon', 'station']) {
      for (const b of (EntityManager.getByType?.(type) ?? [])) {
        if ((b.systemId ?? 'sys_home') === sysId) out.push(b);
      }
    }
    return out;
  }
}

// ── Helpery modułowe ──────────────────────────────────────────────────────────

// Surowy ResourceSystem z wejścia getStore (ResourceSystem albo colonyId).
function _rawOf(resSysOrColonyId) {
  if (!resSysOrColonyId) return null;
  if (typeof resSysOrColonyId !== 'string') return resSysOrColonyId;   // to już ResourceSystem
  const col = window.KOSMOS?.colonyManager?.getColony?.(resSysOrColonyId);
  return col?.resourceSystem ?? null;
}

// Sumaryczny stan materialny magazynu (do sortowania kolejności poboru).
function _totalStock(rs) {
  let t = 0;
  const inv = rs?.inventory;
  if (inv instanceof Map) for (const v of inv.values()) t += v;
  return t;
}
