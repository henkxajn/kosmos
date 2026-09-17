// ═══════════════════════════════════════════════════════════════════════════════
// fleet_engage_scope_smoke — KEEPER Findingu 166 (+ D-E2 głośna odmowa rozkazu floty)
// Rejestr: `docs/design/VESSEL_ORDERS_PLAN.md` §166 (zamknięty tym slice'em), §268 (NASTĘPNY slice,
// rodzina CameraFrame — NIE pinowany tutaj).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: `FleetManagerOverlay._handleFleetEngage` budował listę celów `engage` keyed na
//   KAMERZE (`activeSystemId`, wprowadzone ŚWIADOMIE w `c5077ef`, 2026-07-16 — „spójność z mapą"),
//   a nie na UKŁADZIE FLOTY. Gwiazda każdego układu stoi w (0,0), więc:
//   • M1  — flota `sys_020`, kamera `sys_home`, wrogowie w OBU: popup oferował WYŁĄCZNIE wroga
//           z `sys_home` z liczbą „0.50 AU" liczoną z DWÓCH ramek; każdy członek odpadał w MOS
//           (`target_other_system`), toast „0/2 (część odrzucona)" BEZ powodu, 0 wpisów w Dzienniku,
//           a `issueFleetOrder:119` zdążył skasować poprzedni rozkaz floty (osobny finding, D-E3);
//   • M1b — kamera bez wrogów, wróg w układzie FLOTY: „Brak wykrytych wrogów" — fałszywy negatyw
//           (klasa 142 → naprawa w OBIE strony);
//   • M1c — kamera == flota: działało (kontrola anty-jałowości).
//   D-E2: `_announceFleetOrderResult` (FMO) i `_announce` (FCP) WYRZUCAŁY `res.rejected[].reason`
//   (grep: 0 odczytów) — dla KAŻDEGO typu rozkazu floty (move/engage/return). Teraz Dziennik
//   `fleet`/`warn` przez `describeFleetOrderRefusal` (klucze fan-outu PPM; zero nowych kluczy).
//
// ⚠ DLACZEGO PINY JEŻDŻĄ PRAWDZIWYM POPUPEM: producent nie wydaje rozkazu sam — buduje listę,
//   pokazuje DOM-popup (`_showEnemyPickPopup`) i wydaje rozkaz w callbacku wiersza. Pin na samym
//   filtrze mierzyłby fragment; pin na `issueFleetOrder` mierzyłby seam, który jest POPRAWNY.
//   Stąd stub DOM (`installDomStub`), który buduje popup prawdziwą funkcją i auto-klika wiersz.
//   Tekst wiersza (`⊗ NAME — X.XX AU`) jest zarazem pinem D-E4 (kolumna AU w ramce floty).
//
// ⚠ ZAKRES ZWĘŻONY WOBEC BRIEFU, ZMIERZONY: `enemyVisible` (`draw`, lewa lista 2D) i pętla statków
//   `_drawCenter` to listy MAPY (utajone: `commandTacticalMap:false`, a żywy Rejestr K3 NIE pushuje
//   hit-zony `'vessel'` dla wierszy kontaktu — `if (kind === 'contact') return`). Zostają keyed na
//   kamerze Z ZAMIARU (mapa pokazuje oglądany układ) — pinuje to T12c/T12d jako dokument scope'u.
//
// PINY (fail-first na `git worktree --detach 16151b2`, finalne piny):
//   T1   M1 — foreign offer ZNIKA, własny wróg OFEROWANY, rozkaz LĄDUJE (2/2), Dziennik cichy
//        + KONTROLA NIE-JAŁOWOŚCI: oba wrogi istnieją, są wrogami i są „identified"
//   T2   M1b — fałszywy negatyw: kamera bez wrogów, wróg w układzie floty ⇒ oferowany, brak pick-mode
//   T3   M1c — ANTY-JAŁOWOŚĆ: kamera == flota ⇒ jak dotąd + STARCIE (DSCS encounter) po tikach
//   T4   D-E4 — kolumna AU = hypot w RAMCE FLOTY (liczona niezależnie w teście) dla KAŻDEGO wiersza
//   T5   kanon listowy: kandydat w TRANZYCIE (`systemId === null`) NIE oferowany + kontrola „ten sam
//        wróg ze stemplem układu JEST oferowany" (dawne `??` oferowało null przy kamerze na domu — 151)
//   T5b  flota w TRANZYCIE (firstMember null) ⇒ pusta lista, bez crasha (a kamera MA wroga)
//   T5c  fail-open: brak stempla po OBU stronach ⇒ `sys_home` ≡ `sys_home` ⇒ oferowany, choć kamera
//        stoi na `sys_020` (klucz = FLOTA, nie kamera)
//   T6   flota ROZPIĘTA: lista keyed na PIERWSZYM żywym członku; członek spoza układu odpada w MOS
//        i jest NAZWANY z przetłumaczonym powodem (D-E2 `orderPartial`)
//   T7   D-E2 FMO: odmowa engage (wszyscy) ⇒ 1 wpis `fleet`/`warn`, obie nazwy, bez surowego sluga
//   T8   D-E2 FCP `_announce` — bliźniak T7 przez to samo źródło
//   T9   D-E2 KONTROLA NIE-ENGAGE: odrzucony fleet MOVE (członek unieruchomiony) ⇒ `orderPartial`
//        z nazwą i powodem — na OBU panelach (prawdziwe pickery `_handleFleetMoveToPoint`/`_armMovePicker`)
//   T9c  sukces MILCZY (D-256d): ruch przyjęty w całości ⇒ 0 wpisów
//   T10  odmowa na poziomie FLOTY (`fleet_empty`, brak wpisów per statek) ⇒ `log.el.orderRejected`
//   T11  i18n — wszystkie użyte klucze żyją w PL i EN (zero nowych)
//   T12  ŹRÓDŁO (CRLF-safe, komentarze zdjęte): (a) `_handleFleetEngage` bez `activeSystemId`, z
//        `systemIdOf(`; (b) oba announcery wołają `describeFleetOrderRefusal(`; (c)/(d) listy MAPY
//        (`enemyVisible`, `_drawCenter`) NADAL keyed na kamerze — pin scope'u; (e) popup dostaje `firstMember`
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync }        from 'node:fs';
import { fileURLToPath }       from 'node:url';
import { dirname, join }       from 'node:path';
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { FleetSystem }         from '../../systems/FleetSystem.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { VesselCombatSystem }  from '../../systems/VesselCombatSystem.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { FleetCommandPanel }   from '../../ui/FleetCommandPanel.js';
import { isEnemyVessel }       from '../../entities/Vessel.js';
import { systemIdOf }          from '../../utils/SystemScope.js';
import { setLocale, t }        from '../../i18n/i18n.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', '..');
const readSrc = (rel) => readFileSync(join(SRC, rel), 'utf8');
// Pin źródłowy czyta KOD, nie komentarze (lekcja `source-pin-strip-comments`); CRLF-safe.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '');

const AU  = GAME_CONFIG.AU_TO_PX;
const DT  = 0.01, CIV = GAME_CONFIG.CIV_TIME_SCALE ?? 12;
const orb = (a) => ({ a, e: 0, T: a ** 1.5, M: 0, inclinationOffset: 0 });

let vMgr, mos, fSys, dscs, vcs, pushed, toasts;

// ⚠ Ciała OBU układów leżą w TYCH SAMYCH zakresach px — gwiazda każdego układu stoi w (0,0).
//   To jest MECHANIZM całej rodziny 138/142/166/255, nie skrót fixture'u.
function addBody(id, sys, auX, name) {
  const b = { id, type: 'planet', name, x: auX * AU, y: 0, radius: 8, mass: 1, orbital: orb(auX), physics: { x: auX * AU, y: 0 }, systemId: sys };
  EntityManager.add(b); return b;
}
const addStar = (sys) => EntityManager.add({ id: 'star_' + sys, type: 'star', name: 'G ' + sys, systemId: sys, x: 0, y: 0, mass: 1 });
const techStub = { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1, getMissionYieldBonus: () => 0, getDisasterReduction: () => 0, getShipSurvivalChance: () => 0 };

function scene({ camera = 'sys_home' } = {}) {
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 100 }, activeSystemId: camera };
  addStar('sys_home'); addStar('sys_020');
  const home = addBody('p_home', 'sys_home', 1.0, 'Dom'); addBody('f_a', 'sys_020', 2.0, 'Obca A');
  vMgr = new VesselManager(); mos = new MovementOrderSystem(vMgr); fSys = new FleetSystem(vMgr);
  dscs = new DeepSpaceCombatSystem(vMgr);
  vcs  = new VesselCombatSystem(vMgr);   // PRAWDZIWY konsument `vessel:combatRangeEnter` → DSCS (GameScene:4371)
  pushed = []; toasts = [];
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }, { planetId: 'f_a', name: 'Obca', isOutpost: false, resourceSystem: {} }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: home, vesselManager: vMgr, movementOrderSystem: mos, fleetSystem: fSys, deepSpaceCombatSystem: dscs,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: techStub,
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: (e) => pushed.push(e) },
    // Każdy wróg „identified" (contact) → przechodzi `_isEnemyTracked`. Bramka intelu jest POZA tym slice'em.
    intelSystem: { getVesselContact: () => ({ quality: 'contact' }), getLevel: () => 'contact', isAtLeast: () => true },
    debug: { combatTrace: false },
  });
  EventBus.on('ui:toast', (d) => toasts.push(d));
}
function ship({ sys = 'sys_home', xAU = 1, yAU = 0, name = 'S', armed = true, empire = null } = {}) {
  const v = vMgr.createAndRegister('hull_frigate', 'p_home', { name, modules: armed ? ['weapon_laser', 'engine_ion'] : ['engine_ion'] });
  v.position.x = xAU * AU; v.position.y = yAU * AU; v.position.state = 'orbiting'; v.position.dockedAt = null;
  v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.speedAU = 1.0;
  if (sys === 'NULL') v.systemId = null; else if (sys === 'ABSENT') delete v.systemId; else v.systemId = sys;
  v.warpFuel = { current: 5, max: 5, consumption: 0.5 };
  if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; }
  return v;
}
const makeFleet = (...vs) => { const id = fSys.createFleet('F1').id; for (const v of vs) fSys.addMember(id, v.id); return id; };
function tick(n = 1) { for (let i = 0; i < n; i++) { window.KOSMOS.timeSystem.gameTime += DT; EventBus.emit('time:tick', { deltaYears: DT, civDeltaYears: DT * CIV, gameTime: window.KOSMOS.timeSystem.gameTime, multiplier: 1 }); } }
const mo = (v) => v.movementOrder ? `${v.movementOrder.type}→${v.movementOrder.targetEntityId ?? '?'}` : null;
const encounters = () => [...dscs._activeEncounters.values()].filter(e => e.isActive);
const rawSlug = (s) => /target_other_system|vessel_immobilized|_[a-z]+_/.test(s);

// ── Stub DOM — buduje popup PRAWDZIWĄ `_showEnemyPickPopup` i auto-klika wiersz `pick` ─────
// Wiersze to `<button>` z tekstem `⊗ NAME — X.XX AU`; przycisk „Anuluj" NIE zaczyna się od ⊗.
function installDomStub({ pick = 0 } = {}) {
  const prev = globalThis.document;
  const buttons = [];
  const mk = (tag) => ({ tag, style: {}, children: [], _l: {}, textContent: '', className: '',
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    addEventListener(n, f) { (this._l[n] ??= []).push(f); }, removeEventListener() {} });
  globalThis.document = {
    createElement: (tag) => { const el = mk(tag); if (tag === 'button') buttons.push(el); return el; },
    addEventListener() {}, removeEventListener() {},
    body: { appendChild(o) { o.parentNode = this;
        // Brak wiersza `pick` (np. pick:99 = „tylko obejrzyj") ⇒ klik w „Anuluj" (jedyny przycisk bez ⊗),
        // inaczej `await _handleFleetEngage` nigdy nie wróci (popup czeka na klik).
        queueMicrotask(() => {
          const rows = buttons.filter(r => r.textContent.startsWith('⊗'));
          const target = rows[pick] ?? buttons.find(r => !r.textContent.startsWith('⊗'));
          target?._l.click?.forEach(f => f({}));
        }); },
      removeChild() {} },
  };
  return {
    rows: () => buttons.filter(r => r.textContent.startsWith('⊗')).map(r => r.textContent),
    restore: () => { globalThis.document = prev; },
  };
}
const settle = () => new Promise(r => setTimeout(r, 5));
const fmo = () => Object.create(FleetManagerOverlay.prototype);
const fcp = () => Object.assign(Object.create(FleetCommandPanel.prototype), { _markDirty: () => {} });
// Lustro `UIManager.setPickerMode/…` (jak `fleet_move_picker_frame_smoke`).
function installPickerUM() {
  let st = null;
  const um = { isPickerActive: () => st !== null, getPickerState: () => st, setPickerMode: (mode, cb, metadata) => { st = { mode, callback: cb, metadata }; return true; }, cancelPickerMode: () => { st = null; return true; },
    getSelectedFleetId: () => null, getSelectedVesselId: () => null, getSelectedVesselIds: () => [] };
  window.KOSMOS.uiManager = um; return um;
}
function firePicker(um, point) { const ps = um.getPickerState(); if (!ps || ps.mode !== 'targetPoint') return false; const cb = ps.callback; um.cancelPickerMode(); cb(point); return true; }
/** Uruchom PRAWDZIWY producent popupu i zwróć teksty wierszy (po auto-kliku). */
async function runEngagePopup(fleetId, { pick = 0 } = {}) {
  const dom = installDomStub({ pick });
  const o = fmo(); o._fleetEngagePickMode = null;
  try { await o._handleFleetEngage(fleetId); await settle(); }
  finally { dom.restore(); }
  return { rows: dom.rows(), pickMode: o._fleetEngagePickMode };
}
const rowName = (r) => r.replace(/^⊗\s+/, '').split('  —  ')[0];
const rowAU   = (r) => parseFloat(r.split('  —  ')[1]);

setLocale('en');

// ═══ T1 — M1: foreign offer znika, własny oferowany, rozkaz LĄDUJE ═══════════════
header('T1  M1 — flota sys_020, kamera sys_home, wrogowie w OBU ⇒ oferowany TYLKO wróg z układu FLOTY');
{
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_020', xAU: 2, name: 'Alfa' }), b = ship({ sys: 'sys_020', xAU: 3, name: 'Beta' });
  const eHome = ship({ sys: 'sys_home', xAU: 2.5, name: 'E_home', empire: 'emp_001' });
  const e020  = ship({ sys: 'sys_020', xAU: 2.5, yAU: 0.3, name: 'E_020', empire: 'emp_001' });
  const fleetId = makeFleet(a, b);
  // KONTROLA NIE-JAŁOWOŚCI: bez niej „nie oferuje E_home" byłoby prawdą dla wroga, którego nie ma.
  assert(isEnemyVessel(eHome) && isEnemyVessel(e020) && !eHome.isWreck && !e020.isWreck
         && window.KOSMOS.intelSystem.getVesselContact(eHome.id).quality === 'contact'
         && window.KOSMOS.activeSystemId === 'sys_home' && systemIdOf(a) === 'sys_020',
    'T1a KONTROLA: dwaj wrogowie (sys_home + sys_020), obaj identified, kamera sys_home, flota sys_020');
  const { rows } = await runEngagePopup(fleetId);
  const names = rows.map(rowName);
  assert(rows.length === 1 && names[0] === 'E_020',
    `T1b popup oferuje DOKŁADNIE wroga z układu FLOTY: [${names.join(', ')}]`);
  assert(!names.includes('E_home'),
    'T1c wróg z układu KAMERY nie jest oferowany (dawny fałszywy pozytyw)');
  assert(mo(a) === `engage→${e020.id}` && mo(b) === `engage→${e020.id}` && fSys.getFleet(fleetId)?.activeOrder?.type === 'engage',
    `T1d rozkaz LĄDUJE na OBU członkach: ${mo(a)} / ${mo(b)}, activeOrder=${fSys.getFleet(fleetId)?.activeOrder?.type}`);
  assert(toasts.some(x => x.text === t('fleet.orderResult', 2, 2)) && pushed.length === 0,
    `T1e toast sukcesu 2/2 + Dziennik CICHY (${pushed.length} wpisów) — sukces milczy (D-256d)`);
}

// ═══ T2 — M1b: fałszywy negatyw ════════════════════════════════════════════════
header('T2  M1b — kamera sys_home BEZ wrogów, wróg w układzie FLOTY ⇒ oferowany (koniec „Brak wykrytych wrogów")');
{
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_020', xAU: 2, name: 'Alfa' });
  const e020 = ship({ sys: 'sys_020', xAU: 2.5, name: 'E_020', empire: 'emp_001' });
  const fleetId = makeFleet(a);
  assert(!vMgr.getAllVessels().some(v => isEnemyVessel(v) && systemIdOf(v) === 'sys_home') && isEnemyVessel(e020),
    'T2a KONTROLA: układ kamery bez wrogów, układ floty MA wroga');
  const { rows, pickMode } = await runEngagePopup(fleetId);
  assert(rows.length === 1 && rowName(rows[0]) === 'E_020' && pickMode === null,
    `T2b własny wróg oferowany (${rows.map(rowName).join(',')}), pick-mode NIE uzbrojony (${JSON.stringify(pickMode)})`);
  assert(mo(a) === `engage→${e020.id}` && !toasts.some(x => x.text === t('fleet.noDetectedEnemies')),
    `T2c rozkaz wydany (${mo(a)}), bez toastu „Brak wykrytych wrogów"`);
}

// ═══ T3 — M1c: ANTY-JAŁOWOŚĆ ═════════════════════════════════════════════════
header('T3  M1c — kamera == flota == sys_020 ⇒ jak dotąd, a STARCIE powstaje (DSCS)');
{
  scene({ camera: 'sys_020' });
  const a = ship({ sys: 'sys_020', xAU: 2, name: 'Alfa' });
  const e020 = ship({ sys: 'sys_020', xAU: 2.3, name: 'E_020', empire: 'emp_001' });
  const fleetId = makeFleet(a);
  const { rows } = await runEngagePopup(fleetId);
  assert(rows.length === 1 && rowName(rows[0]) === 'E_020' && mo(a) === `engage→${e020.id}`,
    `T3a oferta + rozkaz jak dotąd (${rows.map(rowName).join(',')} / ${mo(a)})`);
  tick(120);
  const enc = encounters();
  assert(enc.length === 1 && enc[0].location?.systemId === 'sys_020' && enc[0].vesselStates.has(a.id) && enc[0].vesselStates.has(e020.id),
    `T3b po 120 tikach starcie w sys_020 z obojgiem (encounters=${enc.length}, sys=${enc[0]?.location?.systemId})`);
}

// ═══ T4 — D-E4: kolumna AU w RAMCE FLOTY ══════════════════════════════════════
header('T4  D-E4 — kolumna AU popupu = hypot w ramce FLOTY (dawniej: dwie ramki naraz, „0.50 AU")');
{
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_020', xAU: 2, name: 'Alfa' });
  ship({ sys: 'sys_home', xAU: 2.5, name: 'E_home', empire: 'emp_001' });      // kandydat na liczbę mieszaną: 0.50
  const e1 = ship({ sys: 'sys_020', xAU: 2.5, yAU: 0.3, name: 'E_near', empire: 'emp_001' });
  const e2 = ship({ sys: 'sys_020', xAU: 4.0, yAU: 0.0, name: 'E_far',  empire: 'emp_001' });
  const fleetId = makeFleet(a);
  const expect = (e) => Math.hypot(e.position.x - a.position.x, e.position.y - a.position.y) / AU;
  const { rows } = await runEngagePopup(fleetId, { pick: 99 });   // brak auto-kliku (pick poza listą)
  assert(rows.length === 2 && rowName(rows[0]) === 'E_near' && rowName(rows[1]) === 'E_far',
    `T4a dwa wiersze, posortowane po dystansie od pierwszego członka: [${rows.map(rowName).join(', ')}]`);
  const ok = rows.length === 2
    && Math.abs(rowAU(rows[0]) - expect(e1)) < 0.006 && Math.abs(rowAU(rows[1]) - expect(e2)) < 0.006;
  assert(ok, `T4b każdy wiersz pokazuje dystans w RAMCE FLOTY: ${rows.map(rowAU).join(' / ')} vs ${expect(e1).toFixed(2)} / ${expect(e2).toFixed(2)}`);
  assert(!rows.some(r => rowName(r) === 'E_home' && Math.abs(rowAU(r) - 0.5) < 0.006),
    'T4c liczba mieszana „E_home — 0.50 AU" (dwie ramki) NIE występuje');
}

// ═══ T5 — kanon listowy: tranzyt / fail-open ═══════════════════════════════════
header('T5  kanon `systemIdOf` w formie listowej — tranzyt po stronie KANDYDATA / FLOTY, fail-open na braku stempla');
{
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_home', xAU: 2, name: 'Alfa' });
  const eNull = ship({ sys: 'NULL', xAU: 2.2, name: 'E_warp', empire: 'emp_001' });
  eNull.mission = { type: 'interstellar_jump', phase: 'warp_transit', toSystemId: 'sys_020' };
  const fleetId = makeFleet(a);
  assert(systemIdOf(eNull) === null && isEnemyVessel(eNull), 'T5a KONTROLA: kandydat jest w tranzycie (systemIdOf === null) i jest wrogiem');
  let r = await runEngagePopup(fleetId, { pick: 99 });
  assert(r.rows.length === 0, `T5b kandydat W TRANZYCIE nie jest oferowany (wiersze: ${r.rows.length}) — dawne \`??\` oferowało go przy kamerze na domu (M3, klasa 151)`);
  eNull.systemId = 'sys_home'; eNull.mission = null;
  r = await runEngagePopup(fleetId, { pick: 99 });
  assert(r.rows.length === 1 && rowName(r.rows[0]) === 'E_warp', 'T5c KONTROLA: ten sam wróg ze stemplem układu floty JEST oferowany');
}
{
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'NULL', xAU: 2, name: 'Alfa_warp' });   // flota w skoku
  a.mission = { type: 'interstellar_jump', phase: 'warp_transit', toSystemId: 'sys_020' };
  ship({ sys: 'sys_home', xAU: 2.5, name: 'E_home', empire: 'emp_001' });
  const fleetId = makeFleet(a);
  const r = await runEngagePopup(fleetId, { pick: 99 });
  assert(r.rows.length === 0 && r.pickMode?.fleetId === fleetId,
    `T5d flota W TRANZYCIE ⇒ pusta lista (bez crasha), choć układ kamery MA wroga (wiersze=${r.rows.length})`);
}
{
  scene({ camera: 'sys_020' });   // kamera CELOWO na innym układzie niż domyślny
  const a = ship({ sys: 'ABSENT', xAU: 2, name: 'Alfa_old' });
  const eOld = ship({ sys: 'ABSENT', xAU: 2.5, name: 'E_old', empire: 'emp_001' });
  const fleetId = makeFleet(a);
  assert(!('systemId' in a) && !('systemId' in eOld) && systemIdOf(a) === 'sys_home' && systemIdOf(eOld) === 'sys_home',
    'T5e KONTROLA: obie strony BEZ stempla (stary zapis) ⇒ kanon czyta sys_home');
  const r = await runEngagePopup(fleetId, { pick: 99 });
  assert(r.rows.length === 1 && rowName(r.rows[0]) === 'E_old',
    `T5f fail-open: oferowany mimo kamery na ${window.KOSMOS.activeSystemId} — klucz = FLOTA, nie kamera`);
}

// ═══ T6 — flota ROZPIĘTA ═══════════════════════════════════════════════════════
header('T6  flota rozpięta — lista keyed na PIERWSZYM żywym członku; drugi odpada w MOS GŁOŚNO (D-E2)');
{
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_020', xAU: 2, name: 'Alfa' });    // pierwszy żywy → ramka listy
  const b = ship({ sys: 'sys_home', xAU: 3, name: 'Beta' });
  ship({ sys: 'sys_home', xAU: 2.5, name: 'E_home', empire: 'emp_001' });
  const e020 = ship({ sys: 'sys_020', xAU: 2.5, name: 'E_020', empire: 'emp_001' });
  const fleetId = makeFleet(a, b);
  assert(fSys.getFleet(fleetId).memberIds[0] === a.id && systemIdOf(a) !== systemIdOf(b), 'T6a KONTROLA: Alfa jest pierwsza, członkowie w RÓŻNYCH układach');
  const { rows } = await runEngagePopup(fleetId);
  assert(rows.length === 1 && rowName(rows[0]) === 'E_020', `T6b lista z układu PIERWSZEGO członka: [${rows.map(rowName).join(', ')}]`);
  assert(mo(a) === `engage→${e020.id}` && mo(b) === null, `T6c Alfa leci (${mo(a)}), Beta odrzucona (${mo(b)})`);
  const entry = pushed.find(p => p.channel === 'fleet' && p.severity === 'warn');
  assert(pushed.length === 1 && !!entry && entry.text.includes('Beta') && !entry.text.includes('Alfa (')
         && entry.text.includes(t('vessel.reasonTargetOtherSystem')) && !rawSlug(entry.text),
    `T6d Dziennik nazywa TYLKO Betę z przetłumaczonym powodem: „${entry?.text}"`);
  assert(entry?.text === t('vessel.orderPartial', 1, 2, `Beta (${t('vessel.reasonTargetOtherSystem')})`),
    'T6e klucz `vessel.orderPartial` (1/2) — ten sam co fan-out PPM');
}

// ═══ T7/T8 — D-E2 announcery ═══════════════════════════════════════════════════
header('T7  D-E2 FMO._announceFleetOrderResult — odmowa engage (wszyscy) niesie nazwy + powód');
{
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_020', xAU: 2, name: 'Alfa' }), b = ship({ sys: 'sys_020', xAU: 3, name: 'Beta' });
  const eHome = ship({ sys: 'sys_home', xAU: 2.5, name: 'E_home', empire: 'emp_001' });
  const fleetId = makeFleet(a, b);
  const res = fSys.issueFleetOrder(fleetId, { type: 'engage', targetEntityId: eHome.id });   // seam POPRAWNY — odmawia
  assert(res.ok === false && res.rejected.length === 2 && res.rejected.every(r => r.reason === 'target_other_system'),
    'T7a KONTROLA: MOS odrzuca obu członków `target_other_system` (bramka W3-4b jest poprawna)');
  fmo()._announceFleetOrderResult(res, fleetId, 'engage');
  const e = pushed[0];
  assert(pushed.length === 1 && e.channel === 'fleet' && e.severity === 'warn' && e.entityRef === a.id,
    `T7b JEDEN wpis fleet/warn, entityRef = pierwszy odrzucony (${e?.entityRef})`);
  assert(!!e && e.text.length > 0 && e.text.includes('Alfa') && e.text.includes('Beta')
         && e.text.includes(t('vessel.reasonTargetOtherSystem')) && !rawSlug(e.text),
    `T7c obie nazwy + przetłumaczony powód, bez sluga: „${e?.text}"`);
  assert(toasts.some(x => x.text === t('fleet.orderResultFailed', 0, 2)), 'T7d toast liczbowy ZOSTAJE (0/2)');
}
header('T8  D-E2 FleetCommandPanel._announce — bliźniak T7');
{
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_020', xAU: 2, name: 'Alfa' }), b = ship({ sys: 'sys_020', xAU: 3, name: 'Beta' });
  const eHome = ship({ sys: 'sys_home', xAU: 2.5, name: 'E_home', empire: 'emp_001' });
  const fleetId = makeFleet(a, b);
  const res = fSys.issueFleetOrder(fleetId, { type: 'engage', targetEntityId: eHome.id });
  fcp()._announce(res);
  const e = pushed[0];
  assert(pushed.length === 1 && e?.channel === 'fleet' && e?.severity === 'warn' && e.text.includes('Alfa') && e.text.includes('Beta')
         && e.text.includes(t('vessel.reasonTargetOtherSystem')) && !rawSlug(e.text),
    `T8a FCP: jeden wpis, obie nazwy, przetłumaczony powód: „${e?.text}"`);
  assert(e?.text === t('vessel.orderNoneMoved', `Alfa (${t('vessel.reasonTargetOtherSystem')}), Beta (${t('vessel.reasonTargetOtherSystem')})`),
    'T8b klucz `vessel.orderNoneMoved` — identyczny tekst jak z FMO (jedno źródło)');
}

// ═══ T9 — D-E2 kontrola NIE-ENGAGE: odrzucony fleet MOVE ════════════════════════
header('T9  D-E2 KONTROLA NIE-ENGAGE — odrzucony fleet MOVE (członek unieruchomiony) pokazuje powód na OBU panelach');
for (const [label, arm] of [['FMO._handleFleetMoveToPoint', (o, id) => o._handleFleetMoveToPoint(id)], ['FCP._armMovePicker', (o, id) => o._armMovePicker(id)]]) {
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_home', xAU: 2, name: 'Alfa' }), b = ship({ sys: 'sys_home', xAU: 3, name: 'Beta' });
  b.unpaidYears = 2;   // S3.5a-1: ≥ UPKEEP_GRACE_YEARS ⇒ `isImmobilized` ⇒ MOS `vessel_immobilized`
  const fleetId = makeFleet(a, b);
  const um = installPickerUM();
  assert(vMgr.isImmobilized(b) && !vMgr.isImmobilized(a), `T9a[${label}] KONTROLA: Beta unieruchomiona, Alfa nie`);
  arm(label.startsWith('FMO') ? fmo() : fcp(), fleetId);
  assert(firePicker(um, { x: 6 * AU, y: 0 }), `T9b[${label}] picker uzbrojony i odpalony w RAMCE floty`);
  assert(mo(a) === 'moveToPoint→?' && mo(b) === null, `T9c[${label}] Alfa leci, Beta nie (${mo(a)} / ${mo(b)})`);
  const e = pushed[0];
  assert(pushed.length === 1 && e?.channel === 'fleet' && e?.severity === 'warn'
         && e.text === t('vessel.orderPartial', 1, 2, `Beta (${t('vessel.reasonVesselImmobilized')})`) && !rawSlug(e.text),
    `T9d[${label}] Dziennik: „${e?.text}"`);
}
header('T9c sukces MILCZY — ruch przyjęty w całości ⇒ 0 wpisów (D-256d)');
{
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_home', xAU: 2, name: 'Alfa' }), b = ship({ sys: 'sys_home', xAU: 3, name: 'Beta' });
  const fleetId = makeFleet(a, b);
  const um = installPickerUM();
  fmo()._handleFleetMoveToPoint(fleetId); firePicker(um, { x: 6 * AU, y: 0 });
  assert(mo(a) === 'moveToPoint→?' && mo(b) === 'moveToPoint→?' && pushed.length === 0 && toasts.some(x => x.text === t('fleet.orderResult', 2, 2)),
    `T9e 2/2 przyjęte, Dziennik cichy (${pushed.length}), toast sukcesu`);
}

// ═══ T10 — odmowa na poziomie FLOTY ══════════════════════════════════════════════
header('T10 odmowa na poziomie FLOTY (bez wpisów per statek) ⇒ `log.el.orderRejected`');
{
  scene({ camera: 'sys_home' });
  const fleetId = fSys.createFleet('Pusta').id;
  const res = fSys.issueFleetOrder(fleetId, { type: 'moveToPoint', targetPoint: { x: 6 * AU, y: 0 } });
  assert(res.ok === false && res.reason === 'fleet_empty' && res.rejected.length === 0, 'T10a KONTROLA: `fleet_empty`, zero wpisów per statek');
  fmo()._announceFleetOrderResult(res, fleetId, 'moveToPoint');
  assert(pushed.length === 1 && pushed[0].text === t('log.el.orderRejected', 'fleet_empty') && pushed[0].channel === 'fleet',
    `T10b Dziennik: „${pushed[0]?.text}" (powód bez klucza = slug — pre-existing fallback \`describeOrderFail\`, klasa 271)`);
}

// ═══ T11 — i18n ═══════════════════════════════════════════════════════════════
header('T11 i18n — użyte klucze żyją w PL i EN (zero nowych)');
{
  const keys = ['vessel.orderPartial', 'vessel.orderNoneMoved', 'log.el.orderRejected', 'vessel.reasonTargetOtherSystem',
                'vessel.reasonVesselImmobilized', 'fleet.orderResult', 'fleet.orderResultFailed', 'fleet.noDetectedEnemies', 'fleet.engagePickTitle'];
  for (const loc of ['pl', 'en']) {
    setLocale(loc);
    const missing = keys.filter(k => t(k) === k);
    assert(missing.length === 0, `T11 ${loc}: ${keys.length} kluczy rozwiązanych (brakujące: ${missing.join(', ') || 'żaden'})`);
  }
  setLocale('en');
}

// ═══ T12 — ŹRÓDŁO (CRLF-safe) ═════════════════════════════════════════════════
header('T12 ŹRÓDŁO — CRLF-safe, komentarze zdjęte');
{
  const fmoSrc = readSrc('ui/FleetManagerOverlay.js');
  const fcpSrc = readSrc('ui/FleetCommandPanel.js');
  const cfSrc  = readSrc('utils/CameraFrame.js');
  // ⚠ Finding 270 — kontrola NIE pyta o stan dysku (zależny od checkoutu), tylko WYKONUJE `stripComments`
  //   na syntetycznych kopiach CRLF obu plików i wymaga równoważności z kopiami LF.
  {
    const eq = (src) => { const lf = src.replace(/\r\n/g, '\n'); return stripComments(lf.replace(/\n/g, '\r\n')).replace(/\r\n/g, '\n') === stripComments(lf); };
    assert(eq(fmoSrc) && eq(fcpSrc),
      'T12-ctl KONTROLA: stripComments równoważne na kopiach CRLF i LF dla FMO i FCP (Finding 270 — niezależne od checkoutu)');
  }
  const engageBody = stripComments(FleetManagerOverlay.prototype._handleFleetEngage.toString());
  assert(!/activeSystemId/.test(engageBody) && /systemIdOf\(/.test(engageBody) && /systemIdOf\(firstMember\)/.test(engageBody),
    'T12a `_handleFleetEngage` nie czyta `activeSystemId`; klucz = `systemIdOf(firstMember)`');
  assert(/_showEnemyPickPopup\(enemies,\s*firstMember\)/.test(engageBody),
    'T12e popup nadal dostaje `firstMember` (kolumna AU liczona względem ramki floty — D-E4 z konstrukcji)');
  const annFmo = stripComments(FleetManagerOverlay.prototype._announceFleetOrderResult.toString());
  const annFcp = stripComments(FleetCommandPanel.prototype._announce.toString());
  assert(/describeFleetOrderRefusal\(res\)/.test(annFmo) && /describeFleetOrderRefusal\(res\)/.test(annFcp),
    'T12b oba announcery wołają JEDNO źródło `describeFleetOrderRefusal(res)`');
  assert((stripComments(cfSrc).match(/export function describeFleetOrderRefusal\(/g) ?? []).length === 1
         && /export function describeOrderFail\(/.test(cfSrc),
    'T12b2 `describeFleetOrderRefusal` zdefiniowane RAZ, obok `describeOrderFail` (CameraFrame.js)');
  // Pin SCOPE'U: listy MAPY zostają keyed na kamerze (mapa pokazuje oglądany układ; obie utajone za flagą).
  const drawSrc = stripComments(fmoSrc);
  assert(/const enemyVisible = allVessels\.filter\(v =>\s*isEnemyVessel\(v\) && isLiving\(v\) && _isEnemyTracked\(v\)\s*&& \(v\.systemId \?\? 'sys_home'\) === sysId/.test(drawSrc),
    'T12c `enemyVisible` (lewa lista 2D, utajona) NADAL keyed na kamerze — lista MAPY, świadomie poza 166');
  const centerBody = stripComments(FleetManagerOverlay.prototype._drawCenter.toString());
  assert(/if \(\(v\.systemId \?\? 'sys_home'\) !== sysId\) continue;/.test(centerBody) && /activeSystemId/.test(centerBody),
    'T12d pętla statków `_drawCenter` (mapa 2D, utajona) NADAL keyed na kamerze — mapa pokazuje oglądany układ');
  assert(GAME_CONFIG.FEATURES?.commandTacticalMap === false && GAME_CONFIG.FEATURES?.fleetRegistry === true,
    'T12f KONTROLA flag: `commandTacticalMap:false` + `fleetRegistry:true` ⇒ obie listy mapy są UTAJONE (żywy Rejestr nie pushuje zon kontaktów)');
}

console.log(`\n════ fleet_engage_scope_smoke: ${pass} PASS / ${fail} FAIL ════`);
process.exit(fail ? 1 : 0);
