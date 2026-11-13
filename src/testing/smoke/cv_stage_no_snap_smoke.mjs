// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_stage_no_snap_smoke — KEEPER ARC COMBAT VISUALS, poprawka po kontroli właściciela CV-3a3 (2026-11-09): Finding 662,
//   decyzja właściciela (a). Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §3.2-17, §4 CV-3a3, §5 #662.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Defekt (zmierzony w grze): „Lecisz tutaj” w pustą przestrzeń bitwy przy planecie zawsze stawało się „leć do planety” —
//   spec `{ type: 'moveToPoint', targetPoint }` bez ciała, a `MovementOrderSystem._issueMoveToPoint` przyciąga punkt do ciała
//   w promieniu `SNAP_TO_BODY_AU` 0,5 AU; bitwa przy planecie leży cała w tym promieniu (klik 0,02–0,13 AU od planety).
// Decyzja (a): klik rozwiązany WEWNĄTRZ sceny bitwy (`ThreeRenderer.stageLogicalOf` → `staged`) — punkt, bez przyciągania;
//   poza sceną przyciąganie jak dziś; flaga `cvStage` OFF = dziś (scena nie odpowiada `staged`). Szew: `GameScene.
//   _resolveClickTarget` stempluje cel `staged` → producenci rozkazu (menu prawego kliku: statek i flota; pickery ruchu floty
//   w Dowództwie i w panelu floty) dokładają `noBodySnap` → MOS i synchronizacja przylotu floty pomijają `_findBodyNearPoint`.
// CO PINUJE (wyłącznie logika — F11):
//   N1 `buildOrderSpec`: cel `staged` → spec z `targetPoint`, `noBodySnap`, BEZ `targetBodyId`; KONTROLA: cel bez `staged` →
//      spec co do klucza jak przed poprawką
//   N2 MOS (prawdziwy, świat headless): punkt 0,08 AU od planety z `noBodySnap` → misja bez ciała (`targetId` null), cel =
//      kliknięty punkt; KONTROLA: ten sam punkt bez flagi → planeta (przyciąganie poza sceną bez zmian); punkt daleko od ciał —
//      flaga bez skutku
//   N3 menu prawego kliku (prawdziwe `RightClickMenu._handleOptionClick`), statek: klik w scenie → punkt; KONTROLA: poza → planeta
//   N4 menu, flota (`_buildFleetSpec` → `FleetSystem.issueFleetOrder`): obaj członkowie → punkt, przylot z punktu (nie
//      z przechwycenia ciała); KONTROLA: poza sceną → planeta
//   N5 pickery ruchu floty (`FleetManagerOverlay._handleFleetMoveToPoint`, `FleetCommandPanel._armMovePicker`, prototypy):
//      punkt z kliku w scenie (`staged`) → punkt; KONTROLA: punkt bez `staged` → planeta
//   N6 źródło `GameScene`: `_resolveClickTarget` stempluje `staged` WYŁĄCZNIE gdy scena odpowiedziała `staged`; lewy klik
//      pickera przekazuje `staged` do `_finalizeTargetPointPicker`
//   N7 umowa flagi (prawdziwe `_stageFields` + `stageLogicalOf` ze źródła): `cvStage` ON — klik w polu sceny `staged`, łańcuch
//      do MOS daje punkt; `cvStage` OFF — `staged` brak, łańcuch daje planetę (dziś)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync }        from 'node:fs';
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { FleetSystem }         from '../../systems/FleetSystem.js';
import { RightClickMenu }      from '../../ui/RightClickMenu.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { FleetCommandPanel }   from '../../ui/FleetCommandPanel.js';
import { buildMenuOptions }    from '../../data/RightClickMenuOptions.js';
import { buildOrderSpec }      from '../../utils/OrderDispatcher.js';
import * as SL                 from '../../renderer/combat/BattleStageLogic.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const block = (title, fn) => { header(title); try { fn(); } catch (e) { assert(false, `${title} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');

const AU = GAME_CONFIG.AU_TO_PX;
const SYS = 'sys_home';
const orb = (a) => ({ a, e: 0, T: a ** 1.5, M: 0, inclinationOffset: 0 });
const techStub = {
  isResearched: () => true, getFuelEfficiency: () => 1.0, getShipSpeedMultiplier: () => 1.0,
  getShipRangeMultiplier: () => 1.0, getMultiplier: () => 1.0,
  getMissionYieldBonus: () => 0, getDisasterReduction: () => 0, getShipSurvivalChance: () => 0,
};
const BODY = { x: 3 * AU, y: 0 };                                   // planeta bitwy (3 AU)
const NEAR = { x: BODY.x + 0.08 * AU, y: 0.03 * AU };              // klik w bitwie: 0,085 AU od planety (< 0,5 AU)
const FAR  = { x: BODY.x + 1.5 * AU, y: 0 };                        // klik daleko od ciał

let vMgr, mos, fSys;
function scene() {
  EventBus.clear();
  EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 100 }, activeSystemId: SYS };
  EntityManager.add({ id: 'star_h', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  const home = { id: 'p_home', type: 'planet', name: 'Dom', x: 1 * AU, y: 0, explored: true, analyzed: true, planetType: 'rocky', orbital: orb(1), deposits: [], systemId: SYS };
  EntityManager.add(home);
  EntityManager.add({ id: 'p_x', type: 'planet', name: 'Gazowy', x: BODY.x, y: BODY.y, explored: true, analyzed: true, planetType: 'gas', orbital: orb(3), deposits: [], systemId: SYS });
  vMgr = new VesselManager();
  mos  = new MovementOrderSystem(vMgr);
  fSys = new FleetSystem(vMgr);
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: home, vesselManager: vMgr, movementOrderSystem: mos, fleetSystem: fSys,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: techStub,
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} },
  });
}
// Statek gracza na orbicie planety bitwy (jak w `cvBattle({ atBody })`): `orbiting` + `dockedAt` = planeta.
function ship(name, dx = 0.05) {
  const v = vMgr.createAndRegister('hull_small', 'p_home', { name, modules: ['engine_ion'], x: BODY.x + dx * AU, y: 0 });
  v.position.x = BODY.x + dx * AU; v.position.y = 0;
  v.position.state = 'orbiting'; v.position.dockedAt = 'p_x'; v.status = 'idle';
  v.fuel.current = v.fuel.max = 9999; v.speedAU = 1.0; v.systemId = SYS;
  return v;
}
const select = (...vs) => { window.KOSMOS.uiManager = { getSelectedVesselId: () => vs[0]?.id ?? null, getSelectedVesselIds: () => vs.map(v => v.id), getSelectedFleetId: () => null }; };
const selectFleet = (fleetId) => { window.KOSMOS.uiManager = { getSelectedVesselId: () => null, getSelectedVesselIds: () => [], getSelectedFleetId: () => fleetId }; };
const makeFleet = (...vs) => { const id = fSys.createFleet('F1').id; for (const v of vs) fSys.addMember(id, v.id); return id; };
const TGT = (p, staged) => (staged ? { type: 'empty', worldPoint: { x: p.x, y: p.y }, staged: true } : { type: 'empty', worldPoint: { x: p.x, y: p.y } });
const near = (m, p) => !!m && Math.abs(m.targetX - p.x) < 1e-9 && Math.abs(m.targetY - p.y) < 1e-9;

// ═══ N1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('N1 — `buildOrderSpec`: cel z kliku w scenie → punkt bez przyciągania', () => {
  const opt = { id: 'moveToPoint', orderType: 'moveToPoint', action: 'issueOrder' };
  const st = buildOrderSpec(opt, TGT(NEAR, true), 'v_1');
  const pl = buildOrderSpec(opt, TGT(NEAR, false), 'v_1');
  assert(st.ok && st.spec.noBodySnap === true && st.spec.targetBodyId == null && st.spec.targetPoint?.x === NEAR.x && st.spec.targetPoint?.y === NEAR.y,
    `N1a SEDNO: w scenie — spec ${JSON.stringify(st.spec)}`);
  assert(pl.ok && JSON.stringify(pl.spec) === JSON.stringify({ type: 'moveToPoint', targetPoint: { x: NEAR.x, y: NEAR.y } }),
    `N1b KONTROLA: poza sceną — spec co do klucza jak przed poprawką (${JSON.stringify(pl.spec)})`);
});

// ═══ N2 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('N2 — MOS: `noBodySnap` → punkt; bez flagi → przyciąganie do planety (jak dziś)', () => {
  scene();
  const a = ship('Alfa');
  const ra = mos.issueOrder(a.id, { type: 'moveToPoint', targetPoint: { ...NEAR }, noBodySnap: true });
  const o = mos.getOrder(a.id);
  assert(ra?.ok && a.mission?.targetId == null && near(a.mission, NEAR) && o?.targetPoint?.x === NEAR.x && o?.targetPoint?.y === NEAR.y,
    `N2a SEDNO: punkt 0,085 AU od planety z flagą — misja ${a.mission?.type} → targetId ${a.mission?.targetId ?? 'null'}, cel (${a.mission?.targetX?.toFixed?.(1)}, ${a.mission?.targetY?.toFixed?.(1)})`);
  scene();
  const b = ship('Beta');
  const rb = mos.issueOrder(b.id, { type: 'moveToPoint', targetPoint: { ...NEAR } });
  assert(rb?.ok && b.mission?.targetId === 'p_x', `N2b KONTROLA: ten sam punkt bez flagi — przyciąganie do planety (targetId ${b.mission?.targetId ?? 'null'})`);
  scene();
  const c = ship('Gamma'), d = ship('Delta', 0.06);
  mos.issueOrder(c.id, { type: 'moveToPoint', targetPoint: { ...FAR }, noBodySnap: true });
  mos.issueOrder(d.id, { type: 'moveToPoint', targetPoint: { ...FAR } });
  assert(c.mission?.targetId == null && d.mission?.targetId == null && near(c.mission, FAR) && near(d.mission, FAR),
    'N2c KONTROLA: punkt daleko od ciał — z flagą i bez ten sam (flaga działa wyłącznie na przyciąganie)');
});

// ═══ N3 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('N3 — menu prawego kliku, statek: „Lecisz tutaj” w scenie → punkt', () => {
  scene();
  const a = ship('Alfa'); select(a);
  const opt = buildMenuOptions(TGT(NEAR, true), { vesselId: a.id }).find(o => o.id === 'moveToPoint');
  new RightClickMenu()._handleOptionClick(opt, TGT(NEAR, true));
  assert(!!opt && a.mission?.type === 'move_to_point' && a.mission?.targetId == null && near(a.mission, NEAR),
    `N3a SEDNO: klik w scenie — misja ${a.mission?.type ?? 'BRAK'}, targetId ${a.mission?.targetId ?? 'null'}, cel pod kursorem ${near(a.mission, NEAR)}`);
  scene();
  const b = ship('Beta'); select(b);
  new RightClickMenu()._handleOptionClick(buildMenuOptions(TGT(NEAR, false), { vesselId: b.id }).find(o => o.id === 'moveToPoint'), TGT(NEAR, false));
  assert(b.mission?.targetId === 'p_x', `N3b KONTROLA: ten sam klik poza sceną — planeta (targetId ${b.mission?.targetId ?? 'null'})`);
});

// ═══ N4 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('N4 — menu prawego kliku, flota: „Flota: lecisz tutaj” w scenie → punkt dla obu', () => {
  scene();
  const a = ship('Alfa'), b = ship('Beta', 0.06);
  const fid = makeFleet(a, b); selectFleet(fid);
  const fopt = (t) => buildMenuOptions(t, { fleetId: fid }).find(o => o.action === 'issueFleetOrder' && o.orderType === 'moveToPoint');
  let groupCalledWith = null;
  const origGroup = fSys._bodyGroupArrival.bind(fSys);
  fSys._bodyGroupArrival = (spec, el, gy) => { const r = origGroup(spec, el, gy); groupCalledWith = r; return r; };
  new RightClickMenu()._handleOptionClick(fopt(TGT(NEAR, true)), TGT(NEAR, true));
  assert(!!fopt(TGT(NEAR, true)) && [a, b].every(v => v.mission?.targetId == null && near(v.mission, NEAR)) && groupCalledWith == null,
    `N4a SEDNO: obaj członkowie → punkt (targetId ${a.mission?.targetId ?? 'null'} / ${b.mission?.targetId ?? 'null'}), przylot z punktu (przechwycenie ciała: ${groupCalledWith ? 'JEST' : 'brak'})`);
  scene();
  const c = ship('Gamma'), d = ship('Delta', 0.06);
  const fid2 = makeFleet(c, d); selectFleet(fid2);
  new RightClickMenu()._handleOptionClick(buildMenuOptions(TGT(NEAR, false), { fleetId: fid2 }).find(o => o.action === 'issueFleetOrder' && o.orderType === 'moveToPoint'), TGT(NEAR, false));
  assert([c, d].every(v => v.mission?.targetId === 'p_x'), `N4b KONTROLA: poza sceną — obaj do planety (${c.mission?.targetId ?? 'null'} / ${d.mission?.targetId ?? 'null'})`);
});

// ═══ N5 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
function pickerUM() {
  let st = null;
  const um = { isPickerActive: () => st !== null, getPickerState: () => st,
    setPickerMode: (mode, cb, metadata) => { st = { mode, callback: cb, metadata }; return true; },
    cancelPickerMode: () => { st = null; return true; },
    getSelectedFleetId: () => null, getSelectedVesselId: () => null, getSelectedVesselIds: () => [] };
  window.KOSMOS.uiManager = um;
  return um;
}
// Lustro `GameScene._finalizeTargetPointPicker` — czyta callback, kasuje stan, woła.
const firePicker = (um, point) => { const ps = um.getPickerState(); if (!ps || ps.mode !== 'targetPoint') return false; const cb = ps.callback; um.cancelPickerMode(); cb?.(point); return true; };
block('N5 — pickery ruchu floty (Dowództwo, panel floty): punkt z kliku w scenie → punkt', () => {
  const run = (arm, staged) => {
    scene();
    const a = ship('Alfa'), b = ship('Beta', 0.06);
    const fid = makeFleet(a, b);
    const um = pickerUM();
    arm(fid);
    firePicker(um, staged ? { ...NEAR, staged: true } : { ...NEAR });
    return [a, b];
  };
  const fmo = (fid) => Object.create(FleetManagerOverlay.prototype)._handleFleetMoveToPoint(fid);
  const fcp = (fid) => Object.assign(Object.create(FleetCommandPanel.prototype), { _markDirty: () => {} })._armMovePicker(fid);
  const s1 = run(fmo, true), p1 = run(fmo, false), s2 = run(fcp, true), p2 = run(fcp, false);
  assert(s1.every(v => v.mission?.targetId == null && near(v.mission, NEAR)) && s2.every(v => v.mission?.targetId == null && near(v.mission, NEAR)),
    `N5a SEDNO: picker Dowództwa i panelu floty, punkt ze sceny — obaj członkowie → punkt (${s1.map(v => v.mission?.targetId ?? 'null').join('/')} · ${s2.map(v => v.mission?.targetId ?? 'null').join('/')})`);
  assert(p1.every(v => v.mission?.targetId === 'p_x') && p2.every(v => v.mission?.targetId === 'p_x'),
    `N5b KONTROLA: punkt bez \`staged\` — planeta (${p1.map(v => v.mission?.targetId ?? 'null').join('/')} · ${p2.map(v => v.mission?.targetId ?? 'null').join('/')})`);
});

// ═══ N6 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('N6 — źródło `GameScene`: stempel `staged` tylko z odpowiedzi sceny; lewy klik pickera go przekazuje', () => {
  const gs = strip(read('src/scenes/GameScene.js'));
  const i = gs.indexOf('_resolveClickTarget(clientX, clientY) {');
  const body = i >= 0 ? gs.slice(i, gs.indexOf('\n  }\n', i)) : '';
  const stamps = (gs.match(/\.staged\s*=\s*true/g) ?? []).length;
  assert(/if \(lp\?\.staged\) \{ target\.worldPoint = \{ \.\.\.target\.worldPoint, x: lp\.x, z: lp\.z \}; target\.staged = true; \}/.test(body) && stamps === 1,
    `N6a \`_resolveClickTarget\` stempluje \`staged\` wyłącznie przy odpowiedzi sceny \`staged\` (stempli w pliku: ${stamps})`);
  assert(/this\._finalizeTargetPointPicker\(target\.staged \? \{ \.\.\.gp, staged: true \} : gp\)/.test(gs),
    'N6b lewy klik w trybie pickera przekazuje `staged` punktu do `_finalizeTargetPointPicker`');
});

// ═══ N7 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
const TR = read('src/renderer/ThreeRenderer.js');
function methodOf(name) {
  const i = TR.indexOf(`\n  ${name}(`);
  if (i < 0) return null;
  const sigEnd = TR.indexOf(') {\n', i);
  return { params: TR.slice(TR.indexOf('(', i) + 1, sigEnd), body: TR.slice(sigEnd + 4, TR.indexOf('\n  }\n', sigEnd)) };
}
function makeMethod(name) {
  const m = methodOf(name);
  return m ? new Function('GAME_CONFIG', 'window', 'pickStageField', 'stagePointLogical', 'stagePointDrawn',
    `return function (${m.params}) {\n${m.body}\n};`)(GAME_CONFIG, globalThis.window, SL.pickStageField, SL.stagePointLogical, SL.stagePointDrawn) : null;
}
// CV-Z — przecelowane świadomie: KONTROLA „flaga `cvStage` OFF” zastąpiona KONTROLĄ „brak sceny w tej klatce” (flaga zdjęta) —
//   ten sam skutek dla rozkazu (planeta jak dziś), bez przełącznika.
block('N7 — scena bitwy: klik w scenie = punkt; bez sceny — jak dziś (planeta)', () => {
  const chain = (on) => {
    scene();
    const a = ship('Alfa'); select(a);
    // Scena bitwy przy planecie w tej klatce: pole kliku wokół środka bitwy (świat [j.] = px / 10), stopień 1.
    const R = { _galaxyActive: false, _galaxyFlight: false,
      _stageFrame: on ? { list: [{ id: 'c1', centre: { x: BODY.x / 10, z: BODY.y / 10 }, rIn: 1.2, blend: 1, join: 1, scale: null, shift: null }] } : null };
    R._stageFields = makeMethod('_stageFields'); R.stageLogicalOf = makeMethod('stageLogicalOf');
    // Klik rysowany 0,02 j. od środka sceny → odwrotność pola; cel jak w `GameScene._resolveClickTarget` (stempel z odpowiedzi).
    const wp = { x: BODY.x / 10 + 0.02, z: BODY.y / 10 + 0.01 };
    const lp = R.stageLogicalOf(SYS, wp.x, wp.z);
    const t = { type: 'empty', worldPoint: { x: (lp.staged ? lp.x : wp.x) * 10, y: (lp.staged ? lp.z : wp.z) * 10 } };
    if (lp.staged) t.staged = true;
    new RightClickMenu()._handleOptionClick(buildMenuOptions(t, { vesselId: a.id }).find(o => o.id === 'moveToPoint'), t);
    return { staged: !!lp.staged, targetId: a.mission?.targetId ?? null, distAU: Math.hypot(t.worldPoint.x - BODY.x, t.worldPoint.y - BODY.y) / AU };
  };
  const on = chain(true), off = chain(false);
  assert(on.staged && on.targetId == null && on.distAU < 0.5,
    `N7a SEDNO: scena bitwy — klik w polu sceny \`staged\`, punkt ${on.distAU.toFixed(3)} AU od planety, misja bez ciała (${on.targetId ?? 'null'})`);
  assert(!off.staged && off.targetId === 'p_x', `N7b KONTROLA: bez sceny w tej klatce — brak \`staged\`, rozkaz do planety jak dziś (${off.targetId ?? 'null'})`);
});

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
