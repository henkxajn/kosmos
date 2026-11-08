// CvBattleStager — powtarzalne starcie do oglądania efektów walki (ARC COMBAT VISUALS, krok CV-2a, Finding 634; §2.10).
// Rozpięte w `KOSMOS.debug` (GameScene). Wszystkie wywołania bez cudzysłowów:
//   cvBattle()                          — 10 na 10 w oglądanym układzie, mieszane kadłuby (fregata / niszczyciel / krążownik)
//                                         i broń (laser / kinetyk / rakieta), ziarno 1; gra na PAUZIE — start: wznowienie czasu
//   cvBattle({nA: 5, nB: 5, seed: 7})   — mniejsze starcie, inne ziarno; to samo ziarno = ta sama bitwa (rundy, strzały, wynik)
//   cvFx(1) / cvFx(0)                   — flaga `cvFxEngine` (silnik FX z pulami) ON / OFF, od następnej salwy
//   fxStats()                           — pomiar 300 klatek: czas klatki p50 / p95, wywołania i trójkąty renderera, pule
//
// Scena (dlaczego tak, punkt po punkcie — §1 Q9 / Finding 634):
//   · układ = OGLĄDANY (`activeSystemId`) — `teleportVessel` nigdy nie ustawiał `systemId`, a starcie w innym układzie nie
//     rysuje się wcale (Finding 453);
//   · miejsce = pusty punkt układu ≥ 1 AU od każdego innego statku i ≥ 0,5 AU od ciał — skład starcia zbiera statki
//     w promieniu 0,225 AU od środka (team-up), więc obcy statek w pobliżu wszedłby do bitwy;
//   · szyk = dwie linie po 5 na stronę, front 0,06 AU od środka — kinetyk i rakieta w zasięgu od pierwszej rundy, laser
//     dolatuje; wszyscy w promieniu team-up ⇒ całe 10 na 10 wchodzi do starcia naraz;
//   · gra na PAUZIE przed pierwszym tikiem, starcie założone od razu (`vessel:combatRangeEnter` pary ze środka), ziarno
//     starcia stałe (`seedBase` z `seed`), rozkazy `engage` wydane przed pierwszym tikiem — `DirectorRecall` omija statki
//     w aktywnym starciu, więc nie odwoła bezczynnych okrętów AI;
//   · statki są PRAWDZIWE (stan gry): nazwy `CV-A01…` / `CV-B01…`, znacznik `_cvBattle` (tylko w pamięci); autozapis
//     wyłączony do przeładowania strony; ⚠ nie zapisuj gry po teście — F5 bez zapisu wraca do stanu sprzed testu.
//   · ponowne `cvBattle()` po zakończonym starciu zdejmuje statki poprzedniego testu (bez linii w Dzienniku); w trakcie
//     starcia — odmowa `battle_in_progress`.
// Starcia orbitalne (`kind: 'orbital'`) — CV-8a.

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { GAME_CONFIG } from '../config/GameConfig.js';

export const CV_BATTLE = Object.freeze({
  MAX_PER_SIDE: 10,
  PER_LINE: 5,
  FRONT_AU: 0.06,         // [AU] linia frontu od środka
  LINE_AU: 0.03,          // [AU] odstęp kolejnych linii
  ROW_AU: 0.035,          // [AU] odstęp statków w linii
  CLEAR_VESSEL_AU: 1.0,   // [AU] najbliższy obcy statek od środka
  CLEAR_BODY_AU: 0.5,     // [AU] najbliższe ciało od środka
  RINGS_AU: [2.5, 3.5, 5.0, 7.0, 1.6, 10.0],   // [AU] promienie szukania miejsca wokół gwiazdy
  ANGLES: 16,
  NAME_PREFIX: 'CV-',
  WARNING: '⚠ cvBattle: statki testowe weszły do stanu gry — nie zapisuj gry po teście (F5 bez zapisu wraca do stanu sprzed testu). Autozapis wyłączony do przeładowania strony.',
});

const HULL_KEYS = Object.freeze({ frigate: 'hull_frigate', destroyer: 'hull_destroyer', battleship: 'hull_cruiser', cruiser: 'hull_cruiser' });
const HULL_CYCLE = ['frigate', 'destroyer', 'battleship'];
const WEAPON_KEYS = Object.freeze({ laser: 'weapon_laser', kinetic: 'weapon_kinetic', missile: 'weapon_missile' });
const WEAPON_CYCLE = ['laser', 'kinetic', 'missile'];
// Sloty użytkowe: fregata 3, niszczyciel 4, krążownik 5 — jeden na obronę, reszta broń (HullsData).
const HULL_LOADOUT = Object.freeze({
  frigate:    { weapons: 2, defence: 'armor_standard' },
  destroyer:  { weapons: 3, defence: 'shield_basic' },
  battleship: { weapons: 4, defence: 'shield_basic' },
});

function pickName(spec, cycle, keys, i) {
  if (Array.isArray(spec) && spec.length) return pickName(spec[i % spec.length], cycle, keys, i);
  if (typeof spec === 'string' && keys[spec]) return spec;
  return cycle[i % cycle.length];
}

/** Broń statku: 2 × broń główna, dalej kolejne typy z cyklu (przy broni „mixed”); stały typ — wszystkie sloty ten sam. */
function weaponModules(hullName, primary, fixed) {
  const n = HULL_LOADOUT[hullName].weapons;
  const out = [];
  const start = WEAPON_CYCLE.indexOf(primary);
  for (let w = 0; w < n; w++) {
    const name = fixed ? primary : WEAPON_CYCLE[(start + Math.max(0, w - 1)) % WEAPON_CYCLE.length];
    out.push(WEAPON_KEYS[name]);
  }
  return out;
}

/**
 * Czysty szyk starcia (bez świata): kadłub, moduły, nazwa i przesunięcie od środka w AU dla każdego statku.
 * Ten sam szyk buduje keeper `cv_fx_results_smoke` — bitwa z keepera to bitwa z konsoli.
 * @param {{ nA?: number, nB?: number, hulls?: string|string[], weapons?: string|string[] }} [opts]
 * @returns {{ ships: Array<{side:'A'|'B', index:number, name:string, hull:string, hullName:string, modules:string[], dxAU:number, dyAU:number}>,
 *             trigger: { a: number, b: number } }}  trigger — indeksy (w `ships`) pary ze środka frontu
 */
export function cvBattleLayout({ nA = 10, nB = 10, hulls = 'mixed', weapons = 'mixed' } = {}) {
  const clampN = (n) => Math.max(1, Math.min(CV_BATTLE.MAX_PER_SIDE, Math.floor(Number(n) || 0)));
  const fixedWeapon = typeof weapons === 'string' && !!WEAPON_KEYS[weapons];
  const ships = [];
  const trigger = { a: -1, b: -1 };
  for (const [side, n, sign, offset] of [['A', clampN(nA), -1, 0], ['B', clampN(nB), 1, 1]]) {
    let best = -1, bestDy = Infinity;
    for (let i = 0; i < n; i++) {
      const hullName = pickName(hulls, HULL_CYCLE, HULL_KEYS, i);
      const hullKey = hullName === 'cruiser' ? 'battleship' : hullName;
      const primary = pickName(weapons, WEAPON_CYCLE, WEAPON_KEYS, i + offset);
      const line = Math.floor(i / CV_BATTLE.PER_LINE);
      const k = i % CV_BATTLE.PER_LINE;
      const inLine = Math.min(CV_BATTLE.PER_LINE, n - line * CV_BATTLE.PER_LINE);
      const dxAU = sign * (CV_BATTLE.FRONT_AU + line * CV_BATTLE.LINE_AU);
      const dyAU = (k - (inLine - 1) / 2) * CV_BATTLE.ROW_AU;
      const modules = ['engine_ion', ...weaponModules(hullKey, primary, fixedWeapon), HULL_LOADOUT[hullKey].defence];
      ships.push({ side, index: i, name: `${CV_BATTLE.NAME_PREFIX}${side}${String(i + 1).padStart(2, '0')}`,
        hull: HULL_KEYS[hullKey], hullName: hullKey, modules, dxAU, dyAU });
      if (line === 0 && Math.abs(dyAU) < bestDy - 1e-12) { bestDy = Math.abs(dyAU); best = ships.length - 1; }
    }
    trigger[side === 'A' ? 'a' : 'b'] = best;
  }
  return { ships, trigger };
}

/** Ziarno starcia DSCS (`seedBase`) z ziarna konsoli — liczba całkowita w [0, 2³¹). */
export function cvSeedBase(seed) {
  const s = Number.isFinite(Number(seed)) ? Math.floor(Number(seed)) : 1;
  return (Math.imul(s, 7919) >>> 0) & 0x7fffffff;
}

/**
 * Pusty punkt układu dla starcia (gameplay px): pierścienie wokół gwiazdy (0, 0), kąt startu z ziarna; pierwszy punkt
 * dalej niż `CLEAR_VESSEL_AU` od każdego statku i `CLEAR_BODY_AU` od każdego ciała. Brak — punkt najdalszy od statków.
 * @param {{ seed:number, vessels:Array<{x:number,y:number}>, bodies:Array<{x:number,y:number}>, auPx:number }} w
 */
export function cvBattleCenter({ seed = 1, vessels = [], bodies = [], auPx = 110 }) {
  const minD = (pts, x, y) => pts.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.y - y)), Infinity);
  const a0 = ((cvSeedBase(seed) % 360) * Math.PI) / 180;
  let fallback = null;
  for (const rAU of CV_BATTLE.RINGS_AU) {
    for (let k = 0; k < CV_BATTLE.ANGLES; k++) {
      const a = a0 + (k * 2 * Math.PI) / CV_BATTLE.ANGLES;
      const x = Math.cos(a) * rAU * auPx, y = Math.sin(a) * rAU * auPx;
      const dv = minD(vessels, x, y) / auPx, db = minD(bodies, x, y) / auPx;
      if (dv >= CV_BATTLE.CLEAR_VESSEL_AU && db >= CV_BATTLE.CLEAR_BODY_AU) return { x, y, clear: true, dvAU: dv, dbAU: db };
      if (!fallback || dv > fallback.dvAU) fallback = { x, y, clear: false, dvAU: dv, dbAU: db };
    }
  }
  return fallback;
}

const isCvVessel = (v) => !!v && (v._cvBattle != null || (typeof v.name === 'string' && /^CV-[AB]\d\d$/.test(v.name)));

function pickAiEmpire(K) {
  const all = (K.empireRegistry?.listAll?.() ?? []).filter((e) => e?.id && e.id !== 'player');
  return all.find((e) => K.directorProduction?.capitalOf?.(e.id)) ?? all[0] ?? null;
}

/**
 * Pomocniki konsoli. `getRenderer` / `getSaveSystem` — GameScene podaje własne pola (autozapis: wyłącznie w pamięci).
 * @param {{ getRenderer?: ()=>object|null, getSaveSystem?: ()=>object|null }} [deps]
 */
export function cvBattleDebugHelpers({ getRenderer = () => window.KOSMOS?.threeRenderer ?? null, getSaveSystem = () => null } = {}) {
  return {
    /** Starcie testowe — patrz nagłówek. Zwraca odczyt sceny; ostrzeżenie także w konsoli. */
    cvBattle({ nA = 10, nB = 10, hulls = 'mixed', weapons = 'mixed', kind = 'deep', seed = 1 } = {}) {
      if (kind === 'orbital') return { ok: false, reason: 'not_yet', step: 'CV-8a' };
      const K = window.KOSMOS ?? {};
      const vm = K.vesselManager, dscs = K.deepSpaceCombatSystem, mos = K.movementOrderSystem, ts = K.timeSystem;
      const home = K.homePlanet;
      if (!vm || !dscs || !mos || !ts || !home) return { ok: false, reason: 'no_world' };
      if (getRenderer()?._galaxyActive) return { ok: false, reason: 'galaxy_mode' };
      const sys = K.activeSystemId ?? 'sys_home';
      const all = vm.getAllVessels?.() ?? [...(vm._vessels?.values?.() ?? [])];

      // Poprzedni test: w trakcie starcia — odmowa; po starciu — statki zdjęte (rozbiórka bez linii w Dzienniku).
      const old = all.filter(isCvVessel);
      if (old.some((v) => dscs._findActiveEncounterContaining?.(v.id))) return { ok: false, reason: 'battle_in_progress' };
      for (const v of old) vm.destroyVessel?.(v.id, { reason: 'dismantled' });

      const empire = pickAiEmpire(K);
      if (!empire) return { ok: false, reason: 'no_ai_empire' };

      if (!ts.isPaused) ts.pause?.();
      const ss = getSaveSystem();
      if (ss && '_autosaveInterval' in ss) ss._autosaveInterval = 0;   // tylko w pamięci — F5 przywraca ustawienie z menu

      const AU = GAME_CONFIG.AU_TO_PX;
      const others = (vm.getVesselsInSystem?.(sys) ?? []).filter((v) => !v.isWreck && v.position);
      const bodies = ['star', 'planet', 'moon', 'planetoid', 'asteroid', 'comet']
        .flatMap((t) => EntityManager.getByTypeInSystem?.(t, sys) ?? [])
        .filter((b) => Number.isFinite(b?.x) && Number.isFinite(b?.y));
      const c = cvBattleCenter({ seed, vessels: others.map((v) => v.position), bodies, auPx: AU });
      const layout = cvBattleLayout({ nA, nB, hulls, weapons });

      const made = layout.ships.map((s) => {
        const v = vm.createAndRegister(s.hull, home.id, { name: s.name, modules: s.modules, systemId: sys });
        Object.assign(v.position, { x: c.x + s.dxAU * AU, y: c.y + s.dyAU * AU, state: 'orbiting', dockedAt: null });
        v.systemId = sys;
        v.status = 'idle';
        v.mission = null;
        v.serviceState = 'active';
        if (v.fuel) v.fuel.current = v.fuel.max = 9999;
        v._cvBattle = seed;
        if (s.side === 'B') { v.ownerEmpireId = empire.id; v.owner = empire.id; v.isEnemy = true; }
        return v;
      });
      // Sprite'y od razu (gra stoi: bez tiku nie przyjdzie `vessel:positionUpdate`, który dokłada brakujące) — ta sama
      // metoda co powrót do układu; idempotentna.
      getRenderer()?._restoreActiveSystemVesselSprites?.();
      const sideA = made.filter((_, i) => layout.ships[i].side === 'A');
      const sideB = made.filter((_, i) => layout.ships[i].side === 'B');
      const ta = made[layout.trigger.a], tb = made[layout.trigger.b];

      EventBus.emit('vessel:combatRangeEnter', {
        vesselAId: ta.id, vesselBId: tb.id, sameFaction: false,
        distanceAU: Math.hypot(ta.position.x - tb.position.x, ta.position.y - tb.position.y) / AU,
      });
      const enc = dscs._findActiveEncounterContaining?.(ta.id) ?? null;
      if (!enc) return { ok: false, reason: 'no_encounter', warning: CV_BATTLE.WARNING };
      // Statek poza promieniem team-up (nie powinien się zdarzyć przy tym szyku) dołącza parą z najbliższym przeciwnikiem.
      for (const v of made) {
        if (enc.vesselStates.has(v.id)) continue;
        const foes = layout.ships[made.indexOf(v)].side === 'A' ? sideB : sideA;
        const f = foes[0];
        EventBus.emit('vessel:combatRangeEnter', { vesselAId: v.id, vesselBId: f.id, sameFaction: false, distanceAU: 0.1 });
      }
      enc.seedBase = cvSeedBase(seed);
      const orders = sideA.map((v, i) => mos.issueOrder(v.id, { type: 'engage', targetEntityId: sideB[i % sideB.length].id, issuedBy: 'cvBattle' }));
      const members = made.filter((v) => enc.vesselStates.has(v.id)).length;
      console.warn(CV_BATTLE.WARNING);
      return {
        ok: members === made.length, encounter: enc.id, system: sys, seed, seedBase: enc.seedBase,
        centerAU: [Number((c.x / AU).toFixed(3)), Number((c.y / AU).toFixed(3))], clear: c.clear,
        sideA: sideA.length, sideB: sideB.length, members, engageOrders: `${orders.filter((o) => o?.ok).length}/${orders.length}`,
        empire: empire.name ?? empire.id, paused: !!ts.isPaused, cvFxEngine: !!GAME_CONFIG.FEATURES?.cvFxEngine,
        cvStage: !!GAME_CONFIG.FEATURES?.cvStage,
        autosave: ss ? 'off (do F5)' : 'n/a', warning: CV_BATTLE.WARNING,
      };
    },

    /** Flaga `cvFxEngine`: cvFx(1) — ON, cvFx(0) — OFF, cvFx() — przełącz. Czytana w chwili salwy. */
    cvFx(on) {
      const F = GAME_CONFIG.FEATURES;
      F.cvFxEngine = on === undefined ? !F.cvFxEngine : !!on;
      return { cvFxEngine: F.cvFxEngine };
    },

    /** ARC CV-3a1 — flaga `cvStage` (scena bitwy): cvStage(1) — ON, cvStage(0) — OFF, cvStage() — przełącz. Czytana co klatkę. */
    cvStage(on) {
      const F = GAME_CONFIG.FEATURES;
      F.cvStage = on === undefined ? !F.cvStage : !!on;
      return { cvStage: F.cvStage };
    },

    /** ARC CV-3a1 — scena bitwy z tej klatki: klastry, stopień sceny, prowadnica, odstępy strzelec → cel w długościach fregaty. */
    stageInfo() {
      const r = getRenderer();
      if (!r?.stageInfo) return { ok: false, reason: 'no_renderer' };
      return r.stageInfo();
    },

    /** Pomiar 300 klatek (wynik w konsoli po ~5 s) + stan pul teraz. */
    fxStats(frames = 300) {
      const r = getRenderer();
      if (!r?.cvFxStats) return { ok: false, reason: 'no_renderer' };
      return r.cvFxStats(frames);
    },
  };
}
