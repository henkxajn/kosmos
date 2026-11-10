// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_stage_logic_smoke — KEEPER ARC COMBAT VISUALS, krok CV-3a1 (scena bitwy: D-CV-2 (a), D-CV-3 (a), §3.1-2;
//   Findingi 638, 643). Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §2.2, §3.1-2, §4 CV-3a1.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (wyłącznie logika — F11; bez pinów na stałych rysunku):
//   L1 prawo sceny G(d) = min(d, K·d^ALPHA): G(d) ≤ d, monotoniczne, ciągłe (także w punkcie przecięcia)
//   L2 odwrotności: G⁻¹(G(d)) = d; mapa promieniowa z soczewką monotoniczna, ciągła (r_in, r_out), tożsamość poza soczewką;
//      odwrotność mapy i promienia rysowanego (każdy stopień sceny) w obie strony
//   L3 zoom semantyczny: stopień sceny monotoniczny w rozmiarze fregaty [px], 0 poniżej progu dolnego, 1 powyżej górnego;
//      rozmiar fregaty i dystans — wzajemnie odwrotne
//   L4 (§3.1-2) KAŻDA para uczestników w swoim paśmie po prowadnicy: szyk stagera 10 na 10 i konfiguracja kontrolna —
//      KONTROLA: gołe prawo promieniowe psuje pasma (prowadnica jest konieczna), po prowadnicy zero złych par, bez skali
//      awaryjnej; układy losowe (równomierne i „formacje flot”, ziarniste) — każde rozwiązanie spójne w pasmach: prawem
//      sceny (zero złych par) albo skalą awaryjną (kolejność par dokładna — pasma wobec krawędzi skali); skala awaryjna
//      rzadka (< 5 %)
//   L5 układy NAGRANE z prawdziwej bitwy DSCS (stager 10 na 10, ziarno 1, świat headless z prawdziwym `TimeSystem`):
//      pozycje uczestników w każdej rundzie → prowadnica z ciepłym startem i parami pierwszeństwa (strzelec → cel tej
//      rundy) — zero złych par, zero skali awaryjnej; pary pierwszeństwa w OKNACH WŁAŚCICIELA (F3; CV-3a3 — przecelowane po
//      uzbrojeniu lustrzanym stagera, §3.2-10): mediana odstęp / G(d) każdej broni w oknie, ≥ 95 % strzałów w oknie;
//      KONTROLA: bez par pierwszeństwa < 95 % (zmierzone 88 %)
//   L6 siatka rozsunięcia: statki jednej strony ≥ 1,6 L z tolerancją 1 % (prowadnica Gaussa–Seidla przy konkurujących
//      ograniczeniach pasm zostawia resztę ułamka procenta — zmierzone 1,5955 L w szyku stagera; podłoga jest celem
//      rysunku, nie pasmem) — szyk stagera; kupka 10 w jednym punkcie (wróg daleko od krawędzi pasma); bez siatki
//      (kupka) — KONTROLA: pokrywające się statki
//   L7 klastry starć (Finding 638): 0,15 AU — jeden klaster, 1 AU — dwa, inny układ — osobno, łańcuch — jeden; id =
//      najmniejsze id starcia; kolejność wejścia bez znaczenia
//   L8 determinizm: te same wejścia — to samo rozwiązanie; permutacja wejść — to samo; (b) moduły nie piszą wejść
//      (zamrożone obiekty, tryb ścisły modułów ES — zapis rzuciłby wyjątek)
//   L9 (Finding 643) kadr z osią na bitwie: od dystansu kadru w skali prawdziwej kółko do 1/3 — wszyscy uczestnicy sceny
//      w kadrze; KONTROLA: dawny kadr (cel przesunięty w dół, stały po kółku) — statki poza kadrem
//
// ⚠ Fail-first: moduły CV-3a1 powstają w tym kroku — import dynamiczny w try/catch, piny DEGRADUJĄ (czerwone), suita się
//   nie przerywa.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { reseed }                from '../headless/env.js';
import EventBus                  from '../../core/EventBus.js';
import EntityManager             from '../../core/EntityManager.js';
import { GAME_CONFIG }           from '../../config/GameConfig.js';
import { TimeSystem }            from '../../systems/TimeSystem.js';
import { VesselManager }         from '../../systems/VesselManager.js';
import { MovementOrderSystem }   from '../../systems/MovementOrderSystem.js';
import { ProximitySystem }       from '../../systems/ProximitySystem.js';
import { VesselCombatSystem }    from '../../systems/VesselCombatSystem.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { EnemyAttackHandler }    from '../../systems/EnemyAttackHandler.js';
import { OrbitalSpaceSystem }    from '../../systems/OrbitalSpaceSystem.js';
import * as CW                   from '../../renderer/CombatWatchLogic.js';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const SL = await tryImport('../../renderer/combat/BattleStageLogic.js');
const SZ = await tryImport('../../renderer/combat/SemanticZoomLogic.js');
const ST = await tryImport('../../debug/CvBattleStager.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const block = (title, fn) => { header(title); try { fn(); } catch (e) { assert(false, `${title} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const call = (mod, name, ...a) => { try { return typeof mod?.[name] === 'function' ? mod[name](...a) : undefined; } catch (e) { console.log(`    (${name}: ${e.message})`); return undefined; } };

const L = 0.016;                                        // [j.] długość fregaty (`VESSEL_TARGET_SIZE.frigate`)
const AUWU = GAME_CONFIG.AU_TO_PX / 10;                 // [j./AU] 11
const EDGES = SL ? SL.bandEdgesWU([GAME_CONFIG.WEAPON_SHORT_AU, GAME_CONFIG.WEAPON_MED_AU, GAME_CONFIG.WEAPON_LONG_AU], AUWU) : [0.55, 1.65, 3.3];
const centreOf = (pts) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: 0.3, z: pts.reduce((s, p) => s + p.z, 0) / pts.length });
const solve = (pts, extra = {}) => call(SL, 'solveStage', { points: pts, centre: centreOf(pts), L, edges: EDGES, ...extra });
/** Złe pasma rozwiązania: prawem sceny (krawędzie G(zasięg)) albo — przy skali awaryjnej — wobec krawędzi skali. */
function misbandedOf(pts, r) {
  if (!r) return Infinity;
  if (!r.fallback) return call(SL, 'countMisbanded', pts, r.pos, EDGES) ?? Infinity;
  const scaled = EDGES.map((e) => e * r.scale);
  let m = 0;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const d = Math.hypot(pts[j].x - pts[i].x, pts[j].z - pts[i].z);
    const a = r.pos.get(pts[i].id), b = r.pos.get(pts[j].id);
    if (SL.bandIndex(Math.hypot(b.x - a.x, (b.y ?? 0) - (a.y ?? 0), b.z - a.z), scaled) !== SL.bandIndex(d, EDGES)) m++;
  }
  return m;
}
function bareRadialMisbanded(pts) {
  const c = centreOf(pts);
  let rMax = 0; for (const p of pts) rMax = Math.max(rMax, Math.hypot(p.x - c.x, p.z - c.z));
  const pos = new Map();
  for (const p of pts) {
    const dx = p.x - c.x, dz = p.z - c.z, r = Math.hypot(dx, dz);
    const g = r > 0 ? SL.radialMap(r, rMax * SL.STAGE.R_IN_MARGIN) : 0;
    pos.set(p.id, r > 0 ? { x: c.x + dx / r * g, y: 0.3, z: c.z + dz / r * g } : { x: c.x, y: 0.3, z: c.z });
  }
  return SL.countMisbanded(pts, pos, EDGES);
}
const stagerPts = () => (ST?.cvBattleLayout?.({ nA: 10, nB: 10 })?.ships ?? [])
  .map((s) => ({ id: s.name, side: s.side, x: s.dxAU * AUWU, z: s.dyAU * AUWU }));

// ═══ L1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('L1 — prawo sceny: G(d) ≤ d, monotoniczne, ciągłe', () => {
  const ds = []; for (let i = 0; i <= 4000; i++) ds.push(i * 0.001 + Math.pow(10, -6 + i / 800) * 0);
  for (let e = -7; e <= 1.5; e += 0.01) ds.push(Math.pow(10, e));
  ds.sort((a, b) => a - b);
  let le = true, mono = true, prev = -1;
  for (const d of ds) { const g = call(SL, 'stageGap', d); if (!(g <= d + 1e-15)) le = false; if (!(g >= prev - 1e-15)) mono = false; prev = g ?? NaN; }
  assert(SL && le, 'L1a G(d) ≤ d na siatce 10⁻⁷ … 30 j.');
  assert(SL && mono, 'L1b G niemalejące (monotoniczne)');
  const dx = call(SL, 'stageGapCrossover');
  const jump = SL ? Math.abs(SL.stageGap(dx * (1 + 1e-9)) - SL.stageGap(dx * (1 - 1e-9))) : Infinity;
  assert(Number.isFinite(dx) && dx > 0 && jump < 1e-12, `L1c ciągłe w punkcie przecięcia d = K·d^ALPHA (${dx?.toExponential?.(3)} j.)`);
  if (SL) console.log(`     (informacyjnie) postój 0,95 zasięgu → ${[0.05, 0.15, 0.30].map((r) => (SL.stageGap(0.95 * r * AUWU) / L).toFixed(2)).join(' / ')} L; pełny zasięg → ${[0.05, 0.15, 0.30].map((r) => (SL.stageGap(r * AUWU) / L).toFixed(2)).join(' / ')} L`);
});

// ═══ L2 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('L2 — odwrotności i mapa promieniowa z soczewką', () => {
  let worst = 0;
  for (let e = -5; e <= 1.5; e += 0.05) { const d = Math.pow(10, e); worst = Math.max(worst, Math.abs((call(SL, 'stageGapInverse', SL?.stageGap(d)) ?? NaN) - d) / d); }
  assert(SL && worst < 1e-9, `L2a G⁻¹(G(d)) = d (błąd względny maks. ${worst.toExponential(2)})`);
  const rIn = 1.25, rOut = rIn * (SL?.STAGE?.LENS_OUT ?? 3);
  let mono = true, prev = -1, rt = 0;
  for (let r = 0; r <= 6; r += 0.0005) {
    const m = call(SL, 'radialMap', r, rIn);
    if (!(m >= prev - 1e-12)) mono = false; prev = m ?? NaN;
    if (r > 0) rt = Math.max(rt, Math.abs((call(SL, 'radialMapInverse', m, rIn) ?? NaN) - r) / r);
  }
  const at = (r) => SL?.radialMap(r, rIn);
  const contIn = SL ? Math.abs(at(rIn * (1 + 1e-9)) - at(rIn * (1 - 1e-9))) : Infinity;
  const contOut = SL ? Math.abs(at(rOut * (1 + 1e-9)) - at(rOut * (1 - 1e-9))) : Infinity;
  assert(SL && mono && contIn < 1e-8 && contOut < 1e-8, 'L2b mapa promieniowa monotoniczna i ciągła (na r_in i na końcu soczewki)');
  assert(SL && at(rOut) === rOut && at(5) === 5 && at(rIn / 2) < rIn / 2, 'L2c poza soczewką tożsamość (skala prawdziwa), wewnątrz ściśnięcie');
  assert(SL && rt < 1e-9, `L2d odwrotność mapy promieniowej w obie strony (błąd maks. ${rt.toExponential(2)})`);
  let rtb = 0;
  for (const b of [0, 0.2, 0.5, 0.8, 1]) for (let r = 0.01; r <= 6; r += 0.07) {
    const rd = call(SL, 'drawnRadius', r, b, rIn);
    rtb = Math.max(rtb, Math.abs((call(SL, 'drawnRadiusInverse', rd, b, rIn) ?? NaN) - r) / r);
  }
  assert(SL && rtb < 1e-8, `L2e promień rysowany (stopień 0 … 1) — odwrotność w obie strony (błąd maks. ${rtb.toExponential(2)})`);
});

// ═══ L3 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('L3 — zoom semantyczny', () => {
  let mono = true, prev = -1;
  for (let px = 0; px <= 60; px += 0.01) { const b = call(SZ, 'stageBlend', px); if (!(b >= prev - 1e-15)) mono = false; prev = b ?? NaN; }
  const lo = SZ?.SEMANTIC_ZOOM?.PX_LO, hi = SZ?.SEMANTIC_ZOOM?.PX_HI;
  assert(SZ && mono, 'L3a stopień sceny niemalejący w rozmiarze fregaty [px]');
  assert(SZ && call(SZ, 'stageBlend', lo * 0.99) === 0 && call(SZ, 'stageBlend', hi * 1.01) === 1 && call(SZ, 'stageBlend', NaN) === 0,
    `L3b poniżej ${lo} px — 0 (skala prawdziwa), powyżej ${hi} px — 1 (scena), nieokreślone — 0`);
  const d = call(SZ, 'depthForPx', { length: L, px: 24, fovDeg: 55, H: 1041 });
  const back = call(SZ, 'lengthPx', { length: L, depth: d, fovDeg: 55, H: 1041 });
  assert(SZ && Math.abs(back - 24) < 1e-9, `L3c dystans dla 24 px (${d?.toFixed?.(3)} j. przy wysokości 1041 px) i rozmiar przy tym dystansie — wzajemnie odwrotne`);
});

// ═══ L4 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('L4 — każda para w swoim paśmie po prowadnicy (§3.1-2)', () => {
  const pts = stagerPts();
  const bare = SL ? bareRadialMisbanded(pts) : 0;
  const r = solve(pts);
  console.log(`     szyk stagera 10 na 10: gołe prawo promieniowe — złych par ${bare}; po prowadnicy ${r?.misbanded}, skala awaryjna ${r?.fallback}, przejść ${r?.passes}`);
  assert(pts.length === 20 && bare > 0, `L4-0 KONTROLA: gołe prawo promieniowe psuje pasma w szyku stagera (${bare} par) — prowadnica konieczna`);
  assert(!!r && r.fallback === false && r.misbanded === 0 && misbandedOf(pts, r) === 0, 'L4a szyk stagera: po prowadnicy zero złych par, bez skali awaryjnej');
  const ctl = [{ id: 'a1', side: 'A', x: -0.30 * AUWU, z: 0 }, { id: 'a2', side: 'A', x: -0.30 * AUWU, z: 0.055 * AUWU }, { id: 'b1', side: 'B', x: 0.30 * AUWU, z: 0.02 * AUWU }];
  const bareC = SL ? bareRadialMisbanded(ctl) : 0;
  const rc = solve(ctl);
  assert(bareC >= 1 && !!rc && !rc.fallback && misbandedOf(ctl, rc) === 0,
    `L4b konfiguracja kontrolna (sojusznicy 0,055 AU od siebie, 0,30 AU od środka): gołe prawo — ${bareC} zła para, po prowadnicy zero`);
  const mk = (seed) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const uniform = (rnd) => {
    const p = []; const sep = 0.02 + rnd() * 0.5, spread = 0.005 + rnd() * 0.12, stacked = rnd() < 0.2;
    for (let i = 0; i < 10; i++) p.push({ id: `A${String(i).padStart(2, '0')}`, side: 'A', x: (-sep / 2 + (stacked ? 0 : (rnd() - 0.5) * spread)) * AUWU, z: (stacked ? 0 : (rnd() - 0.5) * spread * 3) * AUWU });
    for (let i = 0; i < 10; i++) p.push({ id: `B${String(i).padStart(2, '0')}`, side: 'B', x: (sep / 2 + (rnd() - 0.5) * spread) * AUWU, z: ((rnd() - 0.5) * spread * 3) * AUWU });
    return p;
  };
  const formation = (rnd) => {
    const p = []; const sep = [0.045, 0.14, 0.28, 0.05 + rnd() * 0.3][Math.floor(rnd() * 4)] * (0.9 + rnd() * 0.15);
    for (const side of ['A', 'B']) {
      const groups = 1 + Math.floor(rnd() * 3); let id = 0;
      for (let g = 0; g < groups; g++) {
        const gx = (side === 'A' ? -sep / 2 : sep / 2) + (rnd() - 0.5) * 0.04, gz = (rnd() - 0.5) * 0.12;
        const kind = rnd(), count = g === groups - 1 ? 10 - id : Math.max(1, Math.floor(10 / groups)), sp = 0.004 + rnd() * 0.02, ang = rnd() * Math.PI;
        for (let k = 0; k < count && id < 10; k++, id++) {
          let dx = 0, dz = 0;
          if (kind >= 0.25 && kind < 0.7) { const t = k - (count - 1) / 2; dx = Math.cos(ang) * t * sp; dz = Math.sin(ang) * t * sp; }
          else if (kind >= 0.7) { dx = (rnd() - 0.5) * sp * 3; dz = (rnd() - 0.5) * sp * 3; }
          p.push({ id: `${side}${String(id).padStart(2, '0')}`, side, x: (gx + dx) * AUWU, z: (gz + dz) * AUWU });
        }
      }
    }
    return p;
  };
  for (const [name, gen, seed] of [['równomierne', uniform, 777], ['formacje flot', formation, 913]]) {
    const rnd = mk(seed); let bad = 0, fb = 0, bareBad = 0; const N = 150;
    for (let k = 0; k < N; k++) {
      const p = gen(rnd); const rr = solve(p);
      if (misbandedOf(p, rr) !== 0) bad++;
      if (rr?.fallback) fb++;
      if (SL && bareRadialMisbanded(p) > 0) bareBad++;
    }
    console.log(`     ${name} (${N} układów 10 na 10): gołe prawo psuje pasma w ${bareBad}; po prowadnicy niespójnych ${bad}, skala awaryjna ${fb}`);
    assert(SL && bad === 0, `L4c ${name}: KAŻDE rozwiązanie spójne w pasmach (prawem sceny albo skalą awaryjną z kolejnością par)`);
    assert(SL && fb < N * 0.05, `L4d ${name}: skala awaryjna rzadka (${fb} / ${N} < 5 %)`);
  }
});

// ═══ L5 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('L5 — układy nagrane z prawdziwej bitwy DSCS (stager 10 na 10, ziarno 1): zero złych par, zero skali awaryjnej', () => {
  const SYS = 'sys_t', AU = GAME_CONFIG.AU_TO_PX;
  const clock = { now: 1e7 }; performance.now = () => clock.now;
  reseed('cv3a1-recorded');
  EventBus.clear(); EntityManager.clear();
  const ts = new TimeSystem(); ts.gameTime = 100.00002; ts.multiplierIndex = 1;
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: ts, activeSystemId: SYS };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: SYS, x: -4 * AU, y: 0, radius: 6, mass: 1, visual: { radius: 6 } });
  const vm = new VesselManager(); const mos = new MovementOrderSystem(vm); const prox = new ProximitySystem(vm);
  const dscs = new DeepSpaceCombatSystem(vm); new VesselCombatSystem(vm); const eah = new EnemyAttackHandler(); const oss = new OrbitalSpaceSystem();
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {}, fleet: [] }];
  const empires = [{ id: 'emp_t', name: 'Testowe Imperium' }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: EntityManager.get('p_home'), vesselManager: vm, movementOrderSystem: mos, proximitySystem: prox,
    deepSpaceCombatSystem: dscs, enemyAttackHandler: eah, orbitalSpaceSystem: oss,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} }, intelSystem: { getVesselContact: () => ({ quality: 'unknown' }), getLevel: () => 'unknown', isAtLeast: () => false },
    empireRegistry: { listAll: () => empires, get: (id) => empires.find(e => e.id === id) ?? null }, debug: { combatTrace: false },
  });
  const rounds = [];
  const orig = dscs._tickEncounter.bind(dscs);
  dscs._tickEncounter = (enc, civDy) => {
    orig(enc, civDy);
    const pts = [...enc.vesselStates.keys()].map((id) => { const v = vm.getVessel(id); return { id, side: v?.isEnemy ? 'B' : 'A', x: v.position.x / 10, z: v.position.y / 10 }; });
    pts.events = (enc.timeline?.[enc.timeline.length - 1]?.events ?? []).map((e) => ({ a: e.attacker, t: e.target, w: e.weapon }));
    rounds.push(pts);
  };
  const H = ST?.cvBattleDebugHelpers?.({ getRenderer: () => null, getSaveSystem: () => ({ _autosaveInterval: 1 }) });
  const sc = H?.cvBattle?.({ seed: 1 });
  ts.play();
  for (let n = 0; n < 40000 && (dscs.listActive().length > 0 || rounds.length === 0); n++) { clock.now += 16; ts.update(16); }
  // Okna właściciela (F3) dla odstępu pary w postoju 0,95 zasięgu — jako przedział stosunku odstęp rysowany / G(d):
  // laser [3, 4] L / 3,50 L, kinetyk [7, 9] / 8,00, rakiety [12, 15] / 13,5 (plan §2.2).
  const WIN = { weapon_laser: [3 / 3.5, 4 / 3.5], weapon_kinetic: [7 / 8, 9 / 8], weapon_missile: [12 / 13.5, 15 / 13.5] };
  const replay = (withPriority) => {
    let offsets = null, bad = 0, fb = 0, maxMis = 0, inWin = 0, shots = 0; const ratios = {};
    for (const pts of rounds) {
      const priority = withPriority ? new Set(pts.events.map((e) => SL.pairKey(e.a, e.t))) : null;
      const r = solve(pts, { prevOffsets: offsets, priority });
      offsets = r?.offsets ?? null;
      if (misbandedOf(pts, r) !== 0) bad++;
      if (r?.fallback) fb++;
      maxMis = Math.max(maxMis, r?.misbandedBefore ?? 0);
      const byId = new Map(pts.map((p) => [p.id, p]));
      for (const e of pts.events) {
        const a = byId.get(e.a), t = byId.get(e.t), A = r?.pos?.get(e.a), T = r?.pos?.get(e.t);
        if (!a || !t || !A || !T) continue;
        const g = SL.stageGap(Math.hypot(t.x - a.x, t.z - a.z));
        if (g > 0) {
          const ratio = Math.hypot(T.x - A.x, T.y - A.y, T.z - A.z) / g;
          (ratios[e.w] ??= []).push(ratio);
          const w = WIN[e.w];
          if (w) { shots++; if (ratio >= w[0] && ratio <= w[1]) inWin++; }
        }
      }
    }
    const med = {}, medOk = {};
    for (const [w, a] of Object.entries(ratios)) {
      a.sort((x, y) => x - y);
      const m = a[Math.floor(a.length / 2)];
      med[w.replace(/^weapon_/, '')] = +m.toFixed(3);
      medOk[w.replace(/^weapon_/, '')] = !!WIN[w] && m >= WIN[w][0] && m <= WIN[w][1];
    }
    return { bad, fb, maxMis, med, medOk, share: shots ? inWin / shots : 0, inWin, shots };
  };
  const withP = SL?.pairKey ? replay(true) : { bad: 1, fb: 1, maxMis: 0, med: {}, medOk: {}, share: 0 };
  const noP = SL ? replay(false) : { med: {}, share: 1 };
  console.log(`     nagrane rundy ${rounds.length} (${rounds[0]?.length ?? 0} uczestników): niespójnych ${withP.bad}, skala awaryjna ${withP.fb}; złych par przed prowadnicą maks. ${withP.maxMis}`);
  console.log(`     mediana odstęp rysowany / G(d) par strzelec → cel: z parami pierwszeństwa ${JSON.stringify(withP.med)}; bez ${JSON.stringify(noP.med)}`);
  console.log(`     strzały w oknie właściciela (F3): z parami pierwszeństwa ${withP.inWin}/${withP.shots}; bez ${noP.inWin}/${noP.shots}`);
  assert(sc?.ok === true && rounds.length >= 5, `L5-0 KONTROLA: bitwa stagera rozegrana (${rounds.length} rund)`);
  assert(SL && rounds.length >= 5 && withP.bad === 0 && withP.fb === 0, 'L5a każda nagrana runda: zero złych par prawem sceny, zero skali awaryjnej (ciepły start z poprzedniej rundy)');
  // ARC CV-3a3 — PRZECELOWANE (stager z uzbrojeniem lustrzanym, Finding 654 / §3.2-10 zmienił nagraną bitwę): dawny przedział
  // ±5 % wokół prawa był tolerancją dobraną na starej bitwie (mediana lasera 1,006 → teraz 0,940 — wszystkie strzały lasera
  // w postoju, rysowane 2,7–3,5 L, mediana 3,38 L, w oknie [3, 4] L). Kryterium z OKIEN WŁAŚCICIELA (F3): mediana każdej broni
  // w oknie, ≥ 95 % strzałów strzelec → cel w oknie; KONTROLA: bez par pierwszeństwa udział spada poniżej 95 % (88 %).
  const meds = Object.values(withP.medOk);
  assert(meds.length === 3 && meds.every(Boolean) && withP.share >= 0.95,
    `L5b pary strzelec → cel w oknach właściciela (F3): mediana każdej broni w oknie (${JSON.stringify(withP.med)}), w oknie ${(withP.share * 100).toFixed(1)} % strzałów (≥ 95 %)`);
  assert(SL && noP.share < 0.95, `L5b-KONTROLA: bez par pierwszeństwa w oknie ${(noP.share * 100).toFixed(1)} % strzałów (< 95 %) — pary pierwszeństwa są potrzebne`);
});

// ═══ L6 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('L6 — siatka rozsunięcia: statki jednej strony ≥ 1,6 L', () => {
  const minSame = (pts, r) => {
    let m = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      if (pts[i].side !== pts[j].side) continue;
      const a = r.pos.get(pts[i].id), b = r.pos.get(pts[j].id);
      m = Math.min(m, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    }
    return m / L;
  };
  const pts = stagerPts();
  const r = solve(pts);
  assert(!!r && !r.fallback && minSame(pts, r) >= SL.STAGE.DECONFLICT_L * 0.99, `L6a szyk stagera: najmniejszy odstęp jednej strony ${r ? minSame(pts, r).toFixed(4) : '—'} L ≥ 1,6 L (−1 %)`);
  const stack = [];
  for (let i = 0; i < 10; i++) stack.push({ id: `S${i}`, side: 'A', x: 0, z: 0 });
  stack.push({ id: 'E0', side: 'B', x: 0.20 * AUWU, z: 0 });   // wróg w środku pasma rakiet — daleko od krawędzi
  const rs = solve(stack);
  assert(!!rs && !rs.fallback && misbandedOf(stack, rs) === 0 && minSame(stack, rs) >= SL.STAGE.DECONFLICT_L * 0.99,
    `L6b kupka 10 w jednym punkcie: siatka rozsunięcia — odstęp jednej strony ${rs ? minSame(stack, rs).toFixed(4) : '—'} L ≥ 1,6 L (−1 %), pasma spójne`);
  const flat = stack.map((p) => ({ ...p }));
  const c = centreOf(flat);
  const coincide = SL ? flat.filter((p) => p.side === 'A').every((p) => Math.hypot(SL.radialMap(Math.hypot(p.x - c.x, p.z - c.z), 3) - SL.radialMap(Math.hypot(flat[0].x - c.x, flat[0].z - c.z), 3), 0) < 1e-12) : false;
  assert(coincide, 'L6-0 KONTROLA: bez siatki (samo prawo promieniowe) statki kupki pokrywają się');
});

// ═══ L7 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('L7 — klastry starć (Finding 638)', () => {
  const R = (SL?.STAGE?.CLUSTER_AU ?? 0.3) * AUWU;
  const e = (id, sys, xAU, zAU = 0) => ({ id, systemId: sys, centre: { x: xAU * AUWU, z: zAU * AUWU } });
  const c1 = call(SL, 'clusterEncounters', [e('enc_b', 's1', 0), e('enc_a', 's1', 0.15)], R);
  assert(c1?.length === 1 && same(c1[0].encounterIds, ['enc_a', 'enc_b']) && c1[0].id === 'enc_a', 'L7a dwa starcia 0,15 AU od siebie — jeden klaster, id = najmniejsze id starcia');
  const c2 = call(SL, 'clusterEncounters', [e('enc_a', 's1', 0), e('enc_b', 's1', 1.0)], R);
  assert(c2?.length === 2, 'L7b 1 AU od siebie — dwa klastry');
  const c3 = call(SL, 'clusterEncounters', [e('enc_a', 's1', 0), e('enc_b', 's2', 0.05)], R);
  assert(c3?.length === 2, 'L7c inny układ — osobno (nawet przy tych samych współrzędnych)');
  const c4 = call(SL, 'clusterEncounters', [e('enc_c', 's1', 0.5), e('enc_a', 's1', 0), e('enc_b', 's1', 0.25)], R);
  assert(c4?.length === 1 && c4[0].encounterIds.length === 3, 'L7d łańcuch starć (0 — 0,25 — 0,5 AU) — jedna bitwa');
  const c5 = call(SL, 'clusterEncounters', [e('enc_a', 's1', 0.15), e('enc_b', 's1', 0)], R);
  assert(Array.isArray(c1) && c1.length === 1 && same(c1, call(SL, 'clusterEncounters', [e('enc_a', 's1', 0.15), e('enc_b', 's1', 0)], R)) && same(c5, c1),
    'L7e kolejność wejścia bez znaczenia (świadek: niepusty wynik)');
});

// ═══ L8 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('L8 — determinizm; moduły nie piszą wejść (b)', () => {
  const pts = stagerPts();
  const a = solve(pts), b = solve(pts), c = solve([...pts].reverse());
  const ser = (r) => r ? [...r.pos].map(([id, p]) => [id, +p.x.toFixed(12), +p.y.toFixed(12), +p.z.toFixed(12)]) : null;
  assert(!!a && same(ser(a), ser(b)), 'L8a te same wejścia — to samo rozwiązanie');
  assert(!!a && same(ser(a), ser(c)), 'L8b permutacja wejść — to samo rozwiązanie (kolejność id)');
  const frozen = pts.map((p) => Object.freeze({ ...p }));
  Object.freeze(frozen);
  const before = JSON.stringify(frozen);
  let threw = null;
  try { SL?.solveStage({ points: frozen, centre: Object.freeze(centreOf(pts)), L, edges: Object.freeze([...EDGES]) }); SL?.clusterEncounters(Object.freeze([Object.freeze({ id: 'e', systemId: 's', centre: Object.freeze({ x: 0, z: 0 }) })]), 1); }
  catch (e) { threw = e.message; }
  assert(SL && threw === null && JSON.stringify(frozen) === before, `L8c (b) wejścia zamrożone (tryb ścisły — zapis rzuciłby wyjątek): bez wyjątku, wejścia bez zmian${threw ? ' — ' + threw : ''}`);
});

// ═══ L9 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('L9 — kadr z osią na bitwie (Finding 643): kółko do 1/3 dystansu — wszyscy w kadrze', () => {
  const W = 1600, H = 1041, fov = 55, theta = 0.3, phi = 1.1;
  const safe = CW.watchSafeRect({ W, H, uiScale: 1.25, hudRect: { x: 360, y: 466, w: 560, h: 320 }, topBarH: 32, bottomH: 40, rightW: 150, leftW: 150 });
  const base = stagerPts().map((p) => ({ ...p, y: 0.3 }));
  const pivot = { x: base.reduce((s, p) => s + p.x, 0) / base.length, y: 0.3, z: base.reduce((s, p) => s + p.z, 0) / base.length };
  const fit = call(CW, 'fitWatchFrameOffset', { points: base, pivot, theta, phi, fovDeg: fov, aspect: W / H, W, H, safe });
  const d0 = fit?.dist ?? 2;
  const r = solve(base);
  const drawnAt = (d) => {
    const blend = SZ ? SZ.stageBlend(SZ.lengthPx({ length: L, depth: d, fovDeg: fov, H })) : 0;
    return base.map((p) => { const s = r?.pos?.get(p.id) ?? p; return { x: p.x + (s.x - p.x) * blend, y: p.y + ((s.y ?? 0.3) - p.y) * blend, z: p.z + (s.z - p.z) * blend }; });
  };
  const d3 = d0 / 3;
  const pts3 = drawnAt(d3);
  const off = call(CW, 'viewOffsetFrame', { points: pts3, pivot, d: d3, theta, phi, fovDeg: fov, aspect: W / H, W, H, safe });
  const nNew = call(CW, 'pointsInFrame', { points: pts3, pivot, d: d3, theta, phi, fovDeg: fov, aspect: W / H, W, H, offset: off?.offset });
  // dawny kadr: cel z `fitWatchFrame` przy dystansie kadru, stały po kółku; scena wyłączona (dzisiejszy rysunek)
  const old = CW.fitWatchFrame({ points: base, theta, phi, fovDeg: fov, aspect: W / H, W, H, safe });
  // KONTROLA liczona funkcjami, które istniały PRZED krokiem (`cameraBasis`, `projectPoint`) — nie nowym pomocnikiem.
  const inFrameOld = (pts, pivot, d) => {
    const basis = CW.cameraBasis(theta, phi), tanHalf = Math.tan((fov * Math.PI / 180) / 2);
    const cam = { x: pivot.x + basis.zc.x * d, y: pivot.y + basis.zc.y * d, z: pivot.z + basis.zc.z * d };
    return pts.filter((p) => { const q = CW.projectPoint(p, cam, basis, { tanHalf, aspect: W / H, W, H }); return q.depth > 0.01 && q.x >= 0 && q.x <= W && q.y >= 0 && q.y <= H; }).length;
  };
  const nOld = inFrameOld(base, old.target, old.dist / 3);
  const nOldFit = inFrameOld(base, old.target, old.dist);
  console.log(`     kadr w skali prawdziwej ${d0.toFixed(3)} j. → kółko ${d3.toFixed(3)} j.: z osią na bitwie ${nNew} / 20; dawny kadr (${old.dist.toFixed(3)} → ${(old.dist / 3).toFixed(3)} j., cel ${old.target.y.toFixed(3)} j. w pionie) ${nOld} / 20`);
  assert(fit?.fits === true && nNew === 20, 'L9a SEDNO: oś na środku bitwy + przesunięcie ekranowe + scena — po kółku do 1/3 dystansu 20 / 20 w kadrze');
  assert(nOldFit === 20 && nOld < 20, `L9b KONTROLA: dawny kadr — w dystansie kadru ${nOldFit} / 20, po kółku do 1/3 (cel przesunięty w dół, stały, bez sceny) ${nOld} / 20`);
});

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
