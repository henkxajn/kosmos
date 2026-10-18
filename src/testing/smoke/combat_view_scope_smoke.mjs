// ═══════════════════════════════════════════════════════════════════════════════
// combat_view_scope_smoke — KEEPER Findingu 453 (POLISH P2a, krok P2-1; decyzja CP7)
// Rejestr: `docs/design/POLISH_PLAN.md` §6 (453) i §11 (P2a).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: starcie w przestrzeni (DSCS) toczące się w INNYM układzie niż oglądany rysowało smugi, błyski i pierścień
//   znacznika w pustym punkcie oglądanego układu, auto-fokus zbliżał tam kamerę, a przycisk „Obserwuj / Watch” panelu
//   walki — kamerę na pusty punkt (P2 §10.2: widok `sys_home`, starcie w `sys_059` — 10 smug, 5 błysków i pierścień
//   w układzie domowym). Współrzędne są lokalne dla układu (gwiazda każdego układu w (0,0)), a ładunek salwy niesie
//   migawki pozycji.
// KSZTAŁT: JEDNA reguła `isEngagementInView` (wzór SB43) na czterech wejściach renderera; DSCS dokłada układ starcia
//   do ładunku `combat:roundFx` (pole wyłącznie dla efektów, bez zegara); „Obserwuj” na starcie w innym układzie
//   najpierw przełącza widok (`watchBattleAction` → `starSystemManager.switchActiveSystem`), potem kadruje.
// ⚠ `ThreeRenderer` nie importuje się pod node (THREE) ⇒ reguły żyją w czystym `VesselFxLogic` (wykonanie), a wejścia
//   renderera pinuje źródło (komentarze zdjęte). DSCS i panel walki (`CombatHUD`) — WYKONANIEM.
//
// PINY:
//   T1  reguła `isEngagementInView` — tabela (ten sam / inny układ, brak / pusty układ starcia, brak układu widoku)
//   T2  reguła = `DeepSpaceCombatSystem.engagementView` (prawdziwa metoda na atrapie `this`): `'watched'` ⇔ w widoku —
//       tempo starcia (CP4) i rysowanie mówią o tym samym układzie
//   T3  `watchBattleAction` — ten sam układ: kadr; inny: przełącz + kadr; nieznany: nic
//   T4  DSCS (wykonanie): ładunek `combat:roundFx` niesie `systemId` = układ starcia (KONTROLA: salwa wyemitowana)
//   T5  `CombatHUD` (wykonanie, atrapa ctx): przycisk „Watch” emituje `camera:watchBattle` z id starcia i jego układem
//   T6  źródło `ThreeRenderer` — cztery wejścia: salwa (smugi + znacznik), auto-fokus, „Obserwuj” (przełączenie PRZED
//       kadrem) — reguła na wejściu, PRZED pierwszym efektem / ruchem kamery
//   T7  źródło DSCS: pole `systemId` w emisji `combat:roundFx`; plik bez czasu realnego (`combat_pace_smoke` T9a)
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import * as DSCSmod            from '../../systems/DeepSpaceCombatSystem.js';
import * as FX                 from '../../utils/VesselFxLogic.js';
import { CombatHUD }           from '../../ui/CombatHUD.js';
import { readFileSync }        from 'node:fs';

const { DeepSpaceCombatSystem, ROUND_INTERVAL_MS } = DSCSmod;

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
// Nowe reguły przez przestrzeń nazw — na kodzie sprzed kroku ich nie ma: pin DEGRADUJE (undefined), nie przerywa.
const inView = (o) => (typeof FX.isEngagementInView === 'function' ? FX.isEngagementInView(o) : undefined);
const watchAct = (o) => (typeof FX.watchBattleAction === 'function' ? FX.watchBattleAction(o) : undefined);

const AU  = GAME_CONFIG.AU_TO_PX;
const SYS = 'sys_t';
const EMP = 'emp_t';

// ═══ T1 ═══════════════════════════════════════════════════════════════════════
header('T1  reguła `isEngagementInView`');
{
  const rows = [
    [{ encounterSystemId: 'sys_home', activeSystemId: 'sys_home' }, true,  'ten sam układ (dom)'],
    [{ encounterSystemId: 'sys_059',  activeSystemId: 'sys_059' },  true,  'ten sam układ (cudzy)'],
    [{ encounterSystemId: 'sys_059',  activeSystemId: 'sys_home' }, false, 'starcie w `sys_059`, widok `sys_home`'],
    [{ encounterSystemId: 'sys_home', activeSystemId: 'sys_059' },  false, 'starcie w domu, widok `sys_059`'],
    [{ encounterSystemId: undefined,  activeSystemId: 'sys_home' }, false, 'brak układu starcia (stary zapis bez pola)'],
    [{ encounterSystemId: null,       activeSystemId: 'sys_home' }, false, 'układ starcia `null`'],
    [{ encounterSystemId: '',         activeSystemId: 'sys_home' }, false, 'pusty układ starcia'],
    [{ encounterSystemId: 'sys_home', activeSystemId: undefined },  true,  'brak układu widoku → `sys_home`'],
    [{ encounterSystemId: 'sys_059',  activeSystemId: undefined },  false, 'brak układu widoku → `sys_home` (starcie gdzie indziej)'],
  ];
  for (const [inp, want, lab] of rows) assert(inView(inp) === want, `T1 ${lab} → ${want}`);
}

// ═══ T2 ═══════════════════════════════════════════════════════════════════════
header('T2  reguła = `DeepSpaceCombatSystem.engagementView` (tempo CP4 i rysowanie — ten sam układ)');
{
  const ev = DeepSpaceCombatSystem.prototype.engagementView;
  const cases = [];
  for (const encSys of ['sys_home', 'sys_059', undefined, null]) {
    for (const view of ['sys_home', 'sys_059']) {
      const self = { _activeEncounters: new Map([['e1', { id: 'e1', isActive: true, location: { systemId: encSys, point: { x: 0, y: 0 } } }]]) };
      const v = ev.call(self, view);
      cases.push({ encSys, view, dscs: v, rule: inView({ encounterSystemId: encSys, activeSystemId: view }) });
    }
  }
  const agree = cases.every((c) => (c.dscs === 'watched') === (c.rule === true));
  console.log(`     ${cases.map((c) => `${String(c.encSys)}@${c.view}: ${c.dscs}/${c.rule}`).join(' · ')}`);
  assert(cases.some((c) => c.dscs === 'watched') && cases.some((c) => c.dscs === 'unwatched'),
    'T2-0 KONTROLA: prawdziwa `engagementView` daje obie odpowiedzi (watched / unwatched) w tabeli');
  assert(agree && cases.every((c) => typeof c.rule === 'boolean'), 'T2 SEDNO: `engagementView` = `watched` ⇔ `isEngagementInView` = true (8 par)');
}

// ═══ T3 ═══════════════════════════════════════════════════════════════════════
header('T3  `watchBattleAction` — przycisk „Obserwuj / Watch”');
{
  const a = watchAct({ encounterSystemId: 'sys_home', activeSystemId: 'sys_home' });
  const b = watchAct({ encounterSystemId: 'sys_059', activeSystemId: 'sys_home' });
  const c = watchAct({ encounterSystemId: null, activeSystemId: 'sys_home' });
  const d = watchAct({ encounterSystemId: undefined, activeSystemId: 'sys_059' });
  console.log(`     ${JSON.stringify({ a, b, c, d })}`);
  assert(a?.frame === true && a?.switchTo === null, 'T3a ten sam układ — kadr, bez przełączania');
  assert(b?.frame === true && b?.switchTo === 'sys_059', 'T3b SEDNO: inny układ — przełącz widok na układ starcia, potem kadr');
  assert(c?.frame === false && c?.switchTo === null && d?.frame === false && d?.switchTo === null, 'T3c nieznany układ starcia — nic');
}

// ═══ T4 ═══════════════════════════════════════════════════════════════════════
header('T4  DSCS (wykonanie): `combat:roundFx` niesie układ starcia');
{
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 100, simClockMs: 1000 }, activeSystemId: 'sys_home' };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Home', systemId: SYS, x: -3 * AU, y: 0, radius: 4, mass: 1, visual: { radius: 4 } });
  const vMgr = new VesselManager(); const mos = new MovementOrderSystem(vMgr); const dscs = new DeepSpaceCombatSystem(vMgr);
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  Object.assign(window.KOSMOS, {
    civMode: true, vesselManager: vMgr, movementOrderSystem: mos, deepSpaceCombatSystem: dscs,
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find((c) => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} }, debug: { combatTrace: false },
  });
  const ship = (x, y, name, empire = null) => {
    const v = vMgr.createAndRegister('hull_frigate', 'p_home', { name, modules: ['weapon_laser', 'engine_ion'] });
    v.position.x = x; v.position.y = y; v.position.state = 'orbiting'; v.position.dockedAt = null;
    v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.systemId = SYS;
    if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; }
    return v;
  };
  const me = ship(0, 2 * AU, 'Me');
  const foe = ship(0, 2 * AU + 0.03 * AU, 'Foe', EMP);   // w zasięgu lasera (0,05 AU)
  const payloads = [];
  EventBus.on('combat:roundFx', (p) => payloads.push(p));
  mos.issueOrder(me.id, { type: 'engage', targetEntityId: foe.id, issuedBy: 'keeper' });
  const ok = dscs.handleCombatRangeEnter(me.id, foe.id, false);
  const enc = [...dscs._activeEncounters.values()][0] ?? null;
  for (let i = 0; i < 6 && enc?.isActive; i++) { window.KOSMOS.timeSystem.simClockMs += ROUND_INTERVAL_MS; dscs._tick(0.01); }
  console.log(`     starcie ${enc?.id ?? '—'} w ${enc?.location?.systemId ?? '—'}; salw ${payloads.length}; systemId w ładunkach: ${[...new Set(payloads.map((p) => String(p.systemId)))].join(', ') || '—'}`);
  assert(ok === true && enc?.location?.systemId === SYS && payloads.length > 0, 'T4-0 KONTROLA: starcie w `sys_t`, salwa wyemitowana (rundy ze strzałem)');
  assert(payloads.length > 0 && payloads.every((p) => p.systemId === enc.location.systemId), 'T4 SEDNO: każdy ładunek `combat:roundFx` niesie `systemId` = układ starcia');
  assert(payloads.length > 0 && payloads.every((p) => p.encounterId === enc.id && Number.isFinite(p.midpoint?.x) && Array.isArray(p.events)),
    'T4b KONTROLA: reszta ładunku bez zmian (id starcia, punkt, zdarzenia)');
}

// ═══ T5 ═══════════════════════════════════════════════════════════════════════
header('T5  `CombatHUD` (wykonanie): przycisk „Watch” — id starcia i jego układ w `camera:watchBattle`');
{
  EventBus.clear();
  const enc = { id: 'encounter_x_player_emp_t', isActive: true, currentRound: 3, timeline: [],
    location: { systemId: 'sys_059', planetId: null, point: { x: 137.66, y: -60.03 } },
    sideA: { vesselIds: ['a1'], joinedVesselIds: [], ownerEmpireId: 'player', label: 'Player — A' },
    sideB: { vesselIds: ['b1'], joinedVesselIds: [], ownerEmpireId: EMP, label: 'Foe — B' },
    vesselStates: new Map([['a1', { hp: 100, hpStart: 120, weapons: [] }], ['b1', { hp: 90, hpStart: 120, weapons: [] }]]) };
  window.KOSMOS = { civMode: true, activeSystemId: 'sys_home',
    deepSpaceCombatSystem: { listActive: () => [enc] }, vesselManager: { _vessels: new Map() } };
  const hud = new CombatHUD();
  const ctx = new Proxy({ measureText: () => ({ width: 10 }) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  hud.draw(ctx, 1280, 720);
  const b = hud._watchBtnBounds;
  const got = [];
  EventBus.on('camera:watchBattle', (p) => got.push(p));
  const ate = b ? hud.handleClick(b.x + b.w / 2, b.y + b.h / 2) : false;
  console.log(`     przycisk ${b ? `${Math.round(b.x)},${Math.round(b.y)} ${b.w}×${b.h}` : '—'}; klik zjedzony ${ate}; ładunek ${JSON.stringify(got[0] ?? null)}`);
  assert(!!b && ate === true && got.length === 1, 'T5-0 KONTROLA: przycisk narysowany, klik zjedzony, jedna emisja');
  assert(got[0]?.systemId === 'sys_059' && got[0]?.encounterId === enc.id, 'T5 SEDNO: ładunek niesie układ starcia i id starcia');
  assert(got[0]?.x === 137.66 && got[0]?.y === -60.03, 'T5b KONTROLA: punkt starcia bez zmian (gameplay px)');
}

// ═══ T6 ═══════════════════════════════════════════════════════════════════════
header('T6  źródło `ThreeRenderer` — cztery wejścia przez regułę');
{
  const tr = strip(readFileSync(new URL('../../renderer/ThreeRenderer.js', import.meta.url), 'utf8'));
  const methodBody = (sig) => { const i = tr.indexOf(sig); return i < 0 ? '' : tr.slice(i, tr.indexOf('\n  }\n', i)); };
  const handler = (ev) => { const i = tr.indexOf(`EventBus.on('${ev}'`); return i < 0 ? '' : tr.slice(i, tr.indexOf('\n    }));', i)); };
  const fx = methodBody('  _onCombatRoundFx(payload) {');
  const g = fx.indexOf('isEngagementInView(');
  const up = fx.indexOf('_upsertEngagementMarker(');
  assert(fx.length > 0 && fx.includes('_spawnCombatTracer('), 'T6-0 KONTROLA: `_onCombatRoundFx` znaleziony (smugi w tym ciele)');
  assert(g > 0 && g < fx.indexOf('_spawnCombatTracer(') && (up < 0 || g < up)
    && /encounterSystemId:\s*payload\?\.systemId/.test(fx) && /activeSystemId:\s*window\.KOSMOS\?\.activeSystemId/.test(fx),
    'T6a salwa: reguła na wejściu (układ z ładunku, układ widoku), PRZED smugami (i znacznikiem, jeśli salwa go stawia)');
  // znacznik starcia: albo stawia go bramkowana salwa (krok P2-1), albo synchronizacja ze STANEM starcia przez tę samą
  // regułę (krok P2-5: `planEngagementMarkers` — wykonanie w `combat_marker_life_smoke`)
  const mk = methodBody('  _tickEngagementMarkers(nowMs) {');
  assert((up > g && g > 0) || /planEngagementMarkers\(/.test(mk),
    'T6e znacznik: z bramkowanej salwy albo z synchronizacji stanu starcia przez regułę widoku');
  const eng = handler('vessel:engaged');
  const ge = eng.indexOf('isEngagementInView(');
  assert(ge > 0 && ge < eng.indexOf('focusOn') && /encounterSystemId:\s*location\?\.systemId/.test(eng),
    'T6b auto-fokus: reguła (układ starcia z ładunku `vessel:engaged`) PRZED ruchem kamery');
  const w = handler('camera:watchBattle');
  const ga = w.indexOf('watchBattleAction(');
  const sw = w.indexOf('switchActiveSystem');
  const fo = w.slice(sw).search(/focusOn|_startWatch\(/);   // kadr: dawny `focusOn…` albo śledzenie walki (krok P2-2)
  assert(ga > 0 && sw > ga && fo > 0 && /act\.switchTo/.test(w.slice(sw - 60, sw + 60)),
    'T6c „Obserwuj”: decyzja `watchBattleAction` → przełączenie widoku na `act.switchTo` → dopiero kadr');
  assert(/if \(!act\.frame\) return;/.test(w), 'T6d „Obserwuj”: nieznany układ starcia — wyjście bez ruchu kamery');
}

// ═══ T7 ═══════════════════════════════════════════════════════════════════════
header('T7  źródło DSCS: pole układu w emisji salwy, bez czasu realnego');
{
  const src = strip(readFileSync(new URL('../../systems/DeepSpaceCombatSystem.js', import.meta.url), 'utf8'));
  const i = src.indexOf("EventBus.emit('combat:roundFx'");
  const emit = i < 0 ? '' : src.slice(i, src.indexOf('});', i));
  assert(emit.length > 0 && /encounterId:\s*encounter\.id/.test(emit), 'T7-0 KONTROLA: emisja `combat:roundFx` znaleziona');
  assert(/systemId:\s*encounter\.location\.systemId/.test(emit), 'T7a ładunek: `systemId: encounter.location.systemId`');
  assert(!/performance\.now|Date\.now|_nowMs/.test(src), 'T7b DSCS bez czasu realnego (jak `combat_pace_smoke` T9a)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
