// ═══════════════════════════════════════════════════════════════════════════════
// combat_view_scope_smoke — KEEPER Findingów 453 (krok P2-1, CP7) oraz 455 / 459 / 462 (krok P2-6, CP17) — POLISH P2a
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
// KROK P2-6 (CP17 — „wróg walczący z graczem jest w pełni widoczny”; Findingi 455, 462, 459):
//   salwa rundy 1 nie była rysowana (starcie rusza przy 0,3123 AU, „sensor lock” 0,30 AU — wróg przy wywiadzie `rumor`),
//   model wroga miał krycie 0,5 przez całe starcie, a auto-fokus dolatywał 1408 ms po starcie (rundy 1–4 przed dolotem).
//   T8  `isPlayerEngagement` — prawdziwe starcie DSCS (gracz ↔ AI) i tabela (nieaktywne, AI ↔ AI, brak)
//   T9  `isEndpointVisibleInCombat` — tabela: własny zawsze; wróg w starciu z graczem — przy każdym wywiadzie; poza
//       starciem — jak dotąd (≥ contact)
//   T10 PRAWDZIWE starcie DSCS, wróg przy wywiadzie `rumor`: salwa rundy 1 — oba końce widoczne wg reguły (smuga
//       rysowana); KONTROLA: reguła sprzed kroku (≥ contact) na tej samej salwie — koniec wroga niewidoczny (0 smug)
//   T11 źródło `ThreeRenderer`: centralna bramka końca smugi przez regułę i uczestnictwo w starciu z graczem; widoczność
//       wywiadu — ujawniony w starciu: widoczny, krycie 1, bez ducha `rumor`; zbiór ujawnionych synchronizowany przy
//       starcie / dołączeniu (natychmiast) i w pętli renderu (koniec starcia); auto-fokus natychmiast (cel + dystans)
//   T12 źródło `ThreeCameraController`: `snapDist` — dystans bez lerpa (z granicami `setTargetDist`)
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
const isPE = (e) => (typeof FX.isPlayerEngagement === 'function' ? FX.isPlayerEngagement(e) : undefined);
const visC = (o) => (typeof FX.isEndpointVisibleInCombat === 'function' ? FX.isEndpointVisibleInCombat(o) : undefined);

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

// ═══ T8 ═══════════════════════════════════════════════════════════════════════
header('T8  `isPlayerEngagement`');
const scene = (enemyQuality) => {
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 100, simClockMs: 1000 }, activeSystemId: SYS };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Home', systemId: SYS, x: -3 * AU, y: 0, radius: 4, mass: 1, visual: { radius: 4 } });
  const vMgr = new VesselManager(); const mos = new MovementOrderSystem(vMgr); const dscs = new DeepSpaceCombatSystem(vMgr);
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  Object.assign(window.KOSMOS, {
    civMode: true, vesselManager: vMgr, movementOrderSystem: mos, deepSpaceCombatSystem: dscs,
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find((c) => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    intelSystem: { getVesselContact: () => ({ quality: enemyQuality }) },
    eventLogSystem: { push: () => {} }, debug: { combatTrace: false },
  });
  const ship = (x, y, name, modules, empire = null) => {
    const v = vMgr.createAndRegister('hull_frigate', 'p_home', { name, modules });
    v.position.x = x; v.position.y = y; v.position.state = 'orbiting'; v.position.dockedAt = null;
    v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.systemId = SYS;
    if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; }
    return v;
  };
  return { vMgr, mos, dscs, ship };
};
{
  const { mos, dscs, ship } = scene('rumor');
  const me = ship(0, 2 * AU, 'Me', ['weapon_laser', 'engine_ion']);
  const foe = ship(0, 2 * AU + 0.28 * AU, 'Foe', ['weapon_missile', 'weapon_missile', 'engine_ion', 'armor_heavy'], EMP);
  mos.issueOrder(me.id, { type: 'engage', targetEntityId: foe.id, issuedBy: 'keeper' });
  dscs.handleCombatRangeEnter(me.id, foe.id, false);
  const enc = dscs._findActiveEncounterContaining(foe.id);
  assert(!!enc && enc.sideA.ownerEmpireId === 'player', 'T8-0 KONTROLA: prawdziwe starcie gracza z AI (strona A gracza)');
  assert(isPE(enc) === true, 'T8a starcie gracza ↔ AI — tak');
  const aiVsAi = { isActive: true, sideA: { ownerEmpireId: 'emp_a' }, sideB: { ownerEmpireId: 'emp_b' } };
  const sideB = { isActive: true, sideA: { ownerEmpireId: 'emp_a' }, sideB: { ownerEmpireId: 'player' } };
  assert(isPE(aiVsAi) === false && isPE(sideB) === true && isPE({ ...enc, isActive: false }) === false && isPE(null) === false,
    'T8b AI ↔ AI — nie; gracz po stronie B — tak; nieaktywne — nie; brak starcia — nie');
}

// ═══ T9 ═══════════════════════════════════════════════════════════════════════
header('T9  `isEndpointVisibleInCombat`');
{
  const Q = ['unknown', 'rumor', 'contact', 'detailed'];
  assert(Q.every((q) => visC({ isEnemy: false, quality: q, inPlayerEngagement: false }) === true), 'T9a własny — zawsze');
  assert(Q.every((q) => visC({ isEnemy: true, quality: q, inPlayerEngagement: true }) === true), 'T9b SEDNO: wróg w starciu z graczem — przy każdym wywiadzie');
  assert(visC({ isEnemy: true, quality: 'unknown', inPlayerEngagement: false }) === false && visC({ isEnemy: true, quality: 'rumor', inPlayerEngagement: false }) === false
    && visC({ isEnemy: true, quality: 'contact', inPlayerEngagement: false }) === true && visC({ isEnemy: true, quality: 'detailed' }) === true,
    'T9c poza starciem z graczem — jak dotąd (≥ contact)');
}

// ═══ T10 ══════════════════════════════════════════════════════════════════════
header('T10 PRAWDZIWE starcie, wróg przy `rumor`: salwa rundy 1 rysowana');
{
  const { mos, dscs, ship, vMgr } = scene('rumor');
  const me = ship(0, 2 * AU, 'Me', ['weapon_laser', 'engine_ion']);
  // wróg z rakietami (0,30 AU) z 0,28 AU — strzela w rundzie 1 (jak strażnik sceny audytu: 2 × rakiety, oba trafienia)
  const foe = ship(0, 2 * AU + 0.28 * AU, 'Foe', ['weapon_missile', 'weapon_missile', 'engine_ion', 'armor_heavy'], EMP);
  const fx = [];
  EventBus.on('combat:roundFx', (p) => fx.push(p));
  mos.issueOrder(me.id, { type: 'engage', targetEntityId: foe.id, issuedBy: 'keeper' });
  dscs.handleCombatRangeEnter(me.id, foe.id, false);
  window.KOSMOS.timeSystem.simClockMs += ROUND_INTERVAL_MS; dscs._tick(0.01);    // runda 1
  const r1 = fx[0] ?? null;
  const enc = dscs._findActiveEncounterContaining(foe.id);
  const q = (id) => (vMgr.getVessel(id)?.isEnemy ? window.KOSMOS.intelSystem.getVesselContact(id).quality : null);
  const endpointNew = (id) => visC({ isEnemy: !!vMgr.getVessel(id)?.isEnemy, quality: q(id), inPlayerEngagement: isPE(dscs._findActiveEncounterContaining(id)) === true });
  const endpointOld = (id) => FX.isEndpointVisibleByQuality(!!vMgr.getVessel(id)?.isEnemy, q(id));
  const evs = r1?.events ?? [];
  const drawnNew = evs.filter((e) => endpointNew(e.attacker) && endpointNew(e.target)).length;
  const drawnOld = evs.filter((e) => endpointOld(e.attacker) && endpointOld(e.target)).length;
  console.log(`     runda ${enc?.currentRound ?? '—'}: zdarzeń salwy ${evs.length} (trafień ${evs.filter((e) => e.hit).length}); smug wg reguły: ${drawnNew}; wg reguły sprzed kroku: ${drawnOld}`);
  assert(!!r1 && evs.length > 0 && enc?.currentRound === 1, 'T10-0 KONTROLA: salwa rundy 1 wyemitowana (wróg strzela w rundzie 1)');
  assert(evs.length > 0 && drawnOld === 0, 'T10-1 KONTROLA: reguła sprzed kroku (≥ contact) — przy `rumor` 0 smug (Finding 455)');
  assert(evs.length > 0 && drawnNew === evs.length, 'T10 SEDNO: reguła kroku — każda smuga salwy rundy 1 rysowana (oba końce widoczne)');
}

// ═══ T11 ══════════════════════════════════════════════════════════════════════
header('T11 źródło `ThreeRenderer` — ujawnienie wroga w starciu z graczem, auto-fokus natychmiast');
{
  const tr = strip(readFileSync(new URL('../../renderer/ThreeRenderer.js', import.meta.url), 'utf8'));
  const body = (sig) => { const i = tr.indexOf(sig); return i < 0 ? '' : tr.slice(i, tr.indexOf('\n  }\n', i)); };
  const ev = body('  _isEnemyEndpointVisible(vesselId) {');
  assert(ev.length > 0 && body('  _combatEndpointWorld(vesselId, snapPos) {').includes('_isEnemyEndpointVisible('),
    'T11-0 KONTROLA: centralna bramka końca smugi znaleziona i wołana przez `_combatEndpointWorld`');
  assert(/isEndpointVisibleInCombat\(/.test(ev) && /inPlayerEngagement:\s*isEnemy && this\._isCombatRevealed\(vesselId\)/.test(ev),
    'T11a bramka końca smugi: reguła z uczestnictwem w starciu z graczem');
  const rv = body('  _isCombatRevealed(vesselId) {');
  assert(/isPlayerEngagement\(/.test(rv) && /_findActiveEncounterContaining/.test(rv), 'T11b uczestnictwo: starcie zawierające statek, z udziałem gracza');
  const iv = body('  _applyVesselIntelVisibility(vessel, entry) {');
  const rIdx = iv.indexOf('const revealed = this._isCombatRevealed(vessel.id)');
  const hide = iv.search(/if \(quality === 'unknown' && !revealed\)/);
  const rev = iv.search(/if \(revealed\) \{\s*opacity = 1\.0;/);
  const rum = iv.search(/else if \(quality === 'rumor'\)/);
  assert(rIdx > 0 && hide > rIdx && rev > hide && rum > rev, 'T11c widoczność: ujawniony w starciu — nie ukrywany, krycie 1, bez gałęzi ducha `rumor`');
  const sync = body('  _syncCombatReveal() {');
  assert(/listActive/.test(sync) && /isPlayerEngagement\(/.test(sync) && /_applyVesselIntelVisibility\(/.test(sync),
    'T11d zbiór ujawnionych: ze starć z graczem; przy zmianie — ponowne nałożenie widoczności');
  const loop = body('  _startLoop() {');
  assert(/this\._syncCombatReveal\(\)/.test(loop) && /EventBus\.on\('vessel:engaged',\s*safe\(\(\)\s*=>\s*this\._syncCombatReveal\(\)\)\)/.test(tr)
    && /EventBus\.on\('vessel:joinedCombat',\s*safe\(\(\)\s*=>\s*this\._syncCombatReveal\(\)\)\)/.test(tr),
    'T11e synchronizacja: natychmiast przy starcie i dołączeniu, co klatkę w pętli renderu (koniec starcia)');
  const i = tr.indexOf("EventBus.on('vessel:engaged', safe(({ sideA");
  const eng = i < 0 ? '' : tr.slice(i, tr.indexOf('\n    }));', i));
  assert(/focusOnInstant\(S\(p\.x\), S\(p\.y\)\)/.test(eng) && /snapDist\(Math\.min\(this\._cameraController\._targetDist, 6\)\)/.test(eng)
    && !/\.focusOn\(S\(p\.x\)/.test(eng), 'T11f auto-fokus: cel i dystans natychmiast (≤ 6 j.), bez dawnego lerpa');
}

// ═══ T12 ══════════════════════════════════════════════════════════════════════
header('T12 źródło `ThreeCameraController` — `snapDist`');
{
  const cc = strip(readFileSync(new URL('../../renderer/ThreeCameraController.js', import.meta.url), 'utf8'));
  const i = cc.indexOf('  snapDist(dist) {');
  const b = i < 0 ? '' : cc.slice(i, cc.indexOf('\n  }', i));
  assert(cc.includes('  setTargetDist(dist) {'), 'T12-0 KONTROLA: kontroler znaleziony (`setTargetDist`)');
  assert(/this\.setTargetDist\(dist\);/.test(b) && /this\._dist = this\._targetDist;/.test(b), 'T12 `snapDist`: granice z `setTargetDist`, dystans bez lerpa');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
