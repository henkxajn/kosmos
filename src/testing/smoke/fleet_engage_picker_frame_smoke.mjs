// ═══════════════════════════════════════════════════════════════════════════════
// fleet_engage_picker_frame_smoke — KEEPER Findingu 268 (picker „Atak" panelu dowodzenia)
// Rejestr: `docs/design/VESSEL_ORDERS_PLAN.md` §268. Rodzina CameraFrame (D-89c), producent #4.
// Sibling: `fleet_move_picker_frame_smoke` (wiersze 8/9) i `fleet_engage_scope_smoke` (166).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: `FleetCommandPanel._armEngagePicker` zamieniał kliknięty punkt na cel przez
//   `nearestEnemyToPoint(vm.getAllVessels(), point, 1.5 AU)` — pełna pętla po PŁASKIM rejestrze,
//   bez ANI JEDNEGO terminu układu. Punkt pochodzi z kliku w mapę 3D, czyli z ramki KAMERY,
//   a gwiazda KAŻDEGO układu stoi w (0,0). ZMIERZONE (probe 166/268, 2026-09-16):
//   • M2a — flota `sys_020`, kamera `sys_home`, wrogowie w OBU ⇒ pick brał wroga z ramki kamery,
//           MOS odrzucał obu (`target_other_system`), a `issueFleetOrder:119` ZDĄŻYŁ skasować
//           poprzedni rozkaz floty (Finding 275);
//   • M2b 🔴 kamera PUSTA, wróg w układzie FLOTY pod współrzędnymi kliknięcia ⇒ pick trafiał
//           w NIEGO, `isSameSystem` prawdziwe, „2/2 wykonuje" ⇒ STARCIE DSCS z celem, którego gracz
//           NIE widział — z kliknięcia w cudzej ramce (bramka strict poprawnie milczy: ten sam układ);
//   • M2c — kamera == flota: obcy wróg 0,2 AU od kliku (w SWOJEJ ramce) PRZEJMOWAŁ pick nad
//           legalnym 1,0 AU ⇒ odmowa zamiast rozkazu;
//   • M2d — tylko obcy w 1,5 AU ⇒ „0/1 (część odrzucona)" zamiast „Brak wroga w tym miejscu".
//   Kształt (podpisany): (b) ADMISJA floty przez `CameraFrame` przy FINALIZACJI (bliźniak
//   `_armMovePicker`, D-LD2) + (a) ZAKRES SZUKANIA = układ KAMERY (`systemIdOf`, forma listowa)
//   + (c) pusto ⇒ istniejący `fleetCmd.noEnemyHere` + (d) producent #5 (PPM `fleet.engage`) przez
//   JEDNO źródło D-E2 (`describeFleetOrderRefusal`). Zero nowych kluczy i18n, bez flagi.
//
// ⚠ DLACZEGO PINY JEŻDŻĄ PRAWDZIWYM PRODUCENTEM, A NIE `issueFleetOrder` (lekcja T9a/D-89d):
//   producent NIE wydaje rozkazu sam — uzbraja picker, a rozkaz rodzi się w callbacku, przy
//   kliku. Pin strzelający wprost w `issueFleetOrder` mierzyłby seam, który MUSI zostać
//   przepuszczalny („Powrót do bazy" z celem w ramce STATKU — `map_click_frame_smoke` T4) i nie
//   mógłby paść po poprawnej naprawie. Stąd `installPickerUM()` + `firePicker()` — lustro
//   `GameScene._finalizeTargetPointPicker`. ⚠ Brak STAREGO bezpośredniego assertu na tym
//   producencie w repo (grep `_armEngagePicker`/`bgEngage` w `src/testing` = 0) — nie ma czego
//   zachować jako control.
//
// ⚠ PIN M2b MUSI POKAZAĆ, ŻE NOGA ŚLEPEJ WALKI JEST MARTWA — czyli ZERO encounterów DSCS po
//   tikach, a nie tylko „brak rozkazu". Stąd prawdziwy łańcuch `FleetSystem → MOS → VCS → DSCS`
//   (jak `fleet_engage_scope_smoke` T3) i KONTROLA T5: ta sama geometria z kamerą na fladze
//   floty DAJE starcie — inaczej „0 encounterów" byłoby prawdą jałowo (martwy łańcuch).
//
// ⚠ 270-discipline: importy WYŁĄCZNIE modułów istniejących na e409268 (zero nowych modułów
//   w tym slice'ie ⇒ statyczne importy są bezpieczne na pristine HEAD). Piny źródłowe czytają
//   `Function.prototype.toString()` z komentarzami zdjętymi, regexy bez kotwic `\n` (CRLF-safe).
//
// PINY (fail-first w PRAWDZIWYM `git worktree --detach e409268`):
//   T1   🔴 M2b — klik w PUSTKĘ ramki kamery, wróg pod tymi liczbami w układzie FLOTY:
//        zero rozkazu + zero missions + `activeOrder` null + GŁOŚNA odmowa (nazwy, powód)
//        + ZERO toastów sukcesu + ⚠ ZERO encounterów DSCS po 120 tikach
//        + KONTROLE: kamera bez wrogów; wróg jest w układzie floty; szukanie REJESTR-WIDE
//          (stare) TRAFIŁOBY w niego (fixture reprodukuje hazard)
//   T2   M2a — wrogowie w OBU ramkach, flota poza ramką: odmowa PRZED `issueFleetOrder`
//        ⇒ poprzedni rozkaz floty PRZEŻYWA (na pristine: skasowany — instancja 275 na tej ścieżce)
//        + brak toastu „0/2 (część odrzucona)"; ⚠ sam TEKST odmowy był głośny już po 166 (D-E2)
//        — T2 mierzy NO-OP, nie głośność
//   T3   M2c — kamera == flota: obcy wróg BLIŻEJ w surowych px NIE przejmuje picku;
//        legalny wróg 1,0 AU dostaje rozkaz (2/2), Dziennik CICHY
//   T4   M2d — kamera == flota, tylko OBCY w 1,5 AU ⇒ `fleetCmd.noEnemyHere`, zero rozkazu,
//        zero wpisów, poprzedni rozkaz floty PRZEŻYWA (nie „0/2 część odrzucona")
//   T5   ANTY-JAŁOWOŚĆ — kamera == flota, wróg pod kliknięciem ⇒ rozkaz LECI + STARCIE DSCS
//        po tikach (kontrola żywego łańcucha dla T1)
//   T6   🔑 FINALIZACJA, NIE ARM (D-89c) — uzbrój przy zgodnej kamerze, przełącz układ, kliknij
//        ⇒ ODMOWA (+ kontrola „picker po przełączeniu NADAL uzbrojony"); odwrotnie: uzbrój przy
//        NIEZGODNEJ, przełącz na zgodną, kliknij ⇒ rozkaz LECI (bramka ARM-time by odmówiła)
//   T7   NIE-REGRESJA 147 — członek W SKOKU: admisja fail-open, odmowa przychodzi z MOS własnym
//        powodem (`vessel_in_warp_transit`), NIE powodem ramki
//   T8   SKUTEK KANONU (NIE naprawa 151): kandydat w tranzycie (`systemId === null`) pod
//        kliknięciem nie jest wybierany ⇒ `noEnemyHere`; kontrola: ten sam wróg ze stemplem
//        układu kamery JEST wybierany. ⚠ 151 (koercje `?? 'sys_home'` w FMO) ZOSTAJE OTWARTY.
//   T9   (d) producent #5 — PPM `fleet.engage` przez JEDNO źródło D-E2: nazwy + przetłumaczony
//        powód (było: „⚠ Fleet order rejected: target_other_system"), odmowa CZĘŚCIOWA nazwana
//        (było: cisza), sukces MILCZY, odmowa na poziomie floty ⇒ `log.el.orderRejected`
//   T10  i18n — reużyte klucze żyją w PL i EN; `fleetCmd.noEnemyHere` ≠ `fleet.noDetectedEnemies`
//   T11  ŹRÓDŁO (CRLF-safe, komentarze zdjęte): admisja PRZED szukaniem, zakres = `activeSystemId`
//        przez `systemIdOf(`, brak `getAllVessels` w wywołaniu `nearestEnemyToPoint`, helper
//        `nearestEnemyToPoint` NIETKNIĘTY (termin u WOŁAJĄCEGO), RCM bez surowego sluga,
//        zero nowych kluczy + KONTROLA PINU na zmutowanej kopii
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
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
import { FleetCommandPanel }   from '../../ui/FleetCommandPanel.js';
import { RightClickMenu }      from '../../ui/RightClickMenu.js';
import { buildMenuOptions }    from '../../data/RightClickMenuOptions.js';
import { nearestEnemyToPoint } from '../../ui/FleetCommandPanelLogic.js';
import { isEnemyVessel }       from '../../entities/Vessel.js';
import { systemIdOf }          from '../../utils/SystemScope.js';
import { setLocale, getLocale, t } from '../../i18n/i18n.js';

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
//   To jest MECHANIZM całej rodziny 138/142/166/255/268, nie skrót fixture'u.
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
const rawSlug = (s) => /target_other_system|vessel_immobilized|vessel_in_warp_transit|_[a-z]+_/.test(s);
const at = (v) => ({ x: v.position.x, y: v.position.y });       // klik DOKŁADNIE w liczby statku (w ramce kamery)
const successToasts = () => toasts.filter(x => x.text === t('fleet.orderResult', 1, 1) || x.text === t('fleet.orderResult', 2, 2));
const failedToasts  = () => toasts.filter(x => x.text === t('fleet.orderResultFailed', 0, 1) || x.text === t('fleet.orderResultFailed', 0, 2));

// Stub pickera — LUSTRO `UIManager.setPickerMode/getPickerState/cancelPickerMode` (jak sibling keepery).
function installPickerUM({ fleetId = null } = {}) {
  let st = null;
  const um = {
    isPickerActive: () => st !== null, getPickerState: () => st,
    setPickerMode: (mode, cb, metadata) => { st = { mode, callback: cb, metadata }; return true; },
    cancelPickerMode: () => { st = null; return true; },
    getSelectedFleetId: () => fleetId, getSelectedVesselId: () => null, getSelectedVesselIds: () => [],
  };
  window.KOSMOS.uiManager = um; return um;
}
// Lustro `GameScene._finalizeTargetPointPicker` — czyta callback, kasuje stan, woła.
function firePicker(um, point) { const ps = um.getPickerState(); if (!ps || ps.mode !== 'targetPoint') return false; const cb = ps.callback; um.cancelPickerMode(); cb(point); return true; }
// Producent jest metodą PROTOTYPU — nie potrzebuje konstrukcji (canvas/DOM).
const fcp = () => Object.assign(Object.create(FleetCommandPanel.prototype), { _markDirty: () => {} });
/** Uzbrój picker Atak PRAWDZIWYM producentem i kliknij `point` (ramka KAMERY). */
function armAndClick(fleetId, point) {
  const um = installPickerUM({ fleetId });
  fcp()._armEngagePicker(fleetId);
  const armed = um.getPickerState()?.mode === 'targetPoint' && um.getPickerState()?.metadata?.intent === 'fleetcmd_engage';
  const fired = firePicker(um, point);
  return { armed, fired };
}
// PPM (producent #5): opcja `fleet.engage` z PRAWDZIWEGO katalogu menu + target wroga pod kursorem.
const engageTarget = (e) => ({ type: 'enemyVessel', entityId: e.id, vessel: e });
const fleetEngageOpt = (fleetId, tgt) => buildMenuOptions(tgt, { fleetId }).find(o => o.action === 'issueFleetOrder' && o.orderType === 'engage');
function ppmFleetEngage(fleetId, enemy) {
  installPickerUM({ fleetId });   // `getSelectedFleetId` — RCM czyta stąd wybraną flotę
  const tgt = engageTarget(enemy);
  new RightClickMenu()._handleOptionClick(fleetEngageOpt(fleetId, tgt), tgt);
}

setLocale('en');

// ═══ T1 — 🔴 M2b: ŚLEPA WALKA JEST MARTWA ═══════════════════════════════════════
header('T1  M2b — klik w PUSTKĘ ramki kamery; wróg pod tymi liczbami jest w układzie FLOTY ⇒ ZERO rozkazu, ZERO starć');
{
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_020', xAU: 2.0, name: 'Alfa' }), b = ship({ sys: 'sys_020', xAU: 3.0, name: 'Beta' });
  const e020 = ship({ sys: 'sys_020', xAU: 2.3, yAU: 0.3, name: 'E_020', empire: 'emp_001' });
  const fleetId = makeFleet(a, b);
  const CLICK = at(e020);   // te same liczby, ale w ramce KAMERY (`sys_home`) to PUSTKA
  // KONTROLE NIE-JAŁOWOŚCI: (1) pod kamerą nie ma ŻADNEGO wroga, (2) wróg jest w układzie floty,
  //   (3) stare szukanie REJESTR-WIDE trafiłoby w niego — fixture naprawdę reprodukuje M2b.
  assert(!vMgr.getAllVessels().some(v => isEnemyVessel(v) && systemIdOf(v) === 'sys_home')
         && isEnemyVessel(e020) && systemIdOf(e020) === 'sys_020' && systemIdOf(a) === 'sys_020' && window.KOSMOS.activeSystemId === 'sys_home',
    'T1a KONTROLA: kamera `sys_home` BEZ wrogów; E_020 i flota w `sys_020`');
  assert(nearestEnemyToPoint(vMgr.getAllVessels(), CLICK, AU * 1.5, isEnemyVessel) === e020.id,
    'T1b KONTROLA: szukanie po CAŁYM rejestrze (stary kształt) TRAFIA w E_020 — hazard M2b jest w fixture');
  const { armed, fired } = armAndClick(fleetId, CLICK);
  assert(armed && fired, `T1c picker uzbrojony (intent fleetcmd_engage) i odpalony w ramce kamery`);
  assert(mo(a) == null && mo(b) == null && a.mission == null && b.mission == null && fSys.getFleet(fleetId)?.activeOrder == null,
    `T1d ZERO rozkazu: ${mo(a)} / ${mo(b)}, activeOrder=${fSys.getFleet(fleetId)?.activeOrder?.type ?? 'null'}`);
  const e = pushed[0];
  assert(pushed.length === 1 && e?.channel === 'fleet' && e?.severity === 'warn' && (e?.text ?? '').length > 0
         && e.text.includes('Alfa') && e.text.includes('Beta') && e.text.includes(t('vessel.reasonTargetOtherSystem')) && !rawSlug(e.text),
    `T1e odmowa GŁOŚNA: jeden wpis fleet/warn, OBIE nazwy, przetłumaczony powód → „${e?.text ?? '(brak)'}"`);
  assert(successToasts().length === 0 && !toasts.some(x => x.text === t('fleet.orderResult', 2, 2)),
    `T1f ZERO toastów sukcesu (było: „2/2 wykonuje") — toasty: [${toasts.map(x => x.text).join(' | ')}]`);
  tick(120);
  assert(encounters().length === 0 && mo(a) == null && mo(b) == null,
    `T1g ⚠ po 120 tikach ZERO encounterów DSCS (${encounters().length}) — noga ślepej walki jest MARTWA`);
}

// ═══ T2 — M2a: hijack + poprzedni rozkaz floty PRZEŻYWA ══════════════════════════
header('T2  M2a — wrogowie w OBU ramkach, flota poza ramką ⇒ odmowa PRZED issueFleetOrder (poprzedni rozkaz przeżywa)');
{
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_020', xAU: 2.0, name: 'Alfa' }), b = ship({ sys: 'sys_020', xAU: 3.0, name: 'Beta' });
  const eHome = ship({ sys: 'sys_home', xAU: 2.5, yAU: 0.0, name: 'E_home', empire: 'emp_001' });
  ship({ sys: 'sys_020', xAU: 2.5, yAU: 0.3, name: 'E_020', empire: 'emp_001' });
  const fleetId = makeFleet(a, b);
  const prev = fSys.issueFleetOrder(fleetId, { type: 'moveToPoint', targetPoint: { x: 6 * AU, y: 0 } });
  assert(prev.ok && prev.accepted.length === 2 && fSys.getFleet(fleetId).activeOrder?.type === 'moveToPoint' && mo(a) === 'moveToPoint→?',
    'T2a KONTROLA: flota MA bieżący rozkaz (moveToPoint, 2/2) przed klikiem');
  pushed.length = 0; toasts.length = 0;
  armAndClick(fleetId, at(eHome));   // klik DOKŁADNIE na wroga z ramki kamery (dawny pick = E_home, dist 0)
  assert(fSys.getFleet(fleetId).activeOrder?.type === 'moveToPoint' && mo(a) === 'moveToPoint→?' && mo(b) === 'moveToPoint→?',
    `T2b poprzedni rozkaz floty PRZEŻYWA (activeOrder=${fSys.getFleet(fleetId).activeOrder?.type ?? 'null'}, ${mo(a)} / ${mo(b)}) — na pristine \`issueFleetOrder:119\` go kasował (275)`);
  assert(failedToasts().length === 0,
    `T2c brak toastu „0/2 (część odrzucona)" — odmowa nie dochodzi do fan-outu (toasty: [${toasts.map(x => x.text).join(' | ')}])`);
  const e = pushed[0];
  // ⚠ Sam TEKST był głośny już po 166 (D-E2 w `_announce`) — ten pin jest KONTROLĄ, że głośność
  //   została z producentem, gdy odmowa przeniosła się PRZED `issueFleetOrder`.
  assert(pushed.length === 1 && e?.channel === 'fleet' && e?.severity === 'warn' && e.text.includes('Alfa') && e.text.includes('Beta')
         && e.text.includes(t('vessel.reasonTargetOtherSystem')) && !rawSlug(e.text),
    `T2d KONTROLA: odmowa nadal GŁOŚNA (nazwy + powód) → „${e?.text ?? '(brak)'}"`);
}

// ═══ T3 — M2c: obcy wróg NIE przejmuje picku ════════════════════════════════════
header('T3  M2c — kamera == flota; obcy wróg BLIŻEJ w surowych px NIE przejmuje picku nad legalnym');
{
  scene({ camera: 'sys_020' });
  const a = ship({ sys: 'sys_020', xAU: 2.0, name: 'Alfa' }), b = ship({ sys: 'sys_020', xAU: 3.0, name: 'Beta' });
  const CLICK = { x: 4.0 * AU, y: 0 };
  const eHome = ship({ sys: 'sys_home', xAU: 4.2, yAU: 0, name: 'E_home', empire: 'emp_001' });   // 0,2 AU od kliku — w SWOJEJ ramce
  const e020  = ship({ sys: 'sys_020', xAU: 5.0, yAU: 0, name: 'E_020', empire: 'emp_001' });   // 1,0 AU od kliku — legalny
  const fleetId = makeFleet(a, b);
  const dH = Math.hypot(eHome.position.x - CLICK.x, eHome.position.y - CLICK.y), dF = Math.hypot(e020.position.x - CLICK.x, e020.position.y - CLICK.y);
  assert(dH < dF && dF <= AU * 1.5 && nearestEnemyToPoint(vMgr.getAllVessels(), CLICK, AU * 1.5, isEnemyVessel) === eHome.id,
    `T3a KONTROLA: obcy jest BLIŻEJ w px (${(dH / AU).toFixed(2)} < ${(dF / AU).toFixed(2)} AU) i stare szukanie brało JEGO`);
  armAndClick(fleetId, CLICK);
  assert(mo(a) === `engage→${e020.id}` && mo(b) === `engage→${e020.id}` && fSys.getFleet(fleetId).activeOrder?.targetEntityId === e020.id,
    `T3b rozkaz LĄDUJE na LEGALNYM wrogu (2/2): ${mo(a)} / ${mo(b)}`);
  assert(pushed.length === 0 && toasts.some(x => x.text === t('fleet.orderResult', 2, 2)),
    `T3c Dziennik CICHY (${pushed.length}), toast sukcesu 2/2 — sukces milczy (D-256d)`);
}

// ═══ T4 — M2d: uczciwe „pusto" ══════════════════════════════════════════════════
header('T4  M2d — kamera == flota; w 1,5 AU od kliku TYLKO obcy ⇒ „Brak wroga w tym miejscu", zero rozkazu, zero wpisów');
{
  scene({ camera: 'sys_020' });
  const a = ship({ sys: 'sys_020', xAU: 2.0, name: 'Alfa' }), b = ship({ sys: 'sys_020', xAU: 3.0, name: 'Beta' });
  const CLICK = { x: 4.0 * AU, y: 0 };
  const eHome = ship({ sys: 'sys_home', xAU: 4.2, yAU: 0, name: 'E_home', empire: 'emp_001' });
  ship({ sys: 'sys_020', xAU: 8.0, yAU: 0, name: 'E_far', empire: 'emp_001' });   // 4 AU od kliku — poza progiem
  const fleetId = makeFleet(a, b);
  const prev = fSys.issueFleetOrder(fleetId, { type: 'moveToPoint', targetPoint: { x: 6 * AU, y: 0 } });
  assert(prev.ok && nearestEnemyToPoint(vMgr.getAllVessels(), CLICK, AU * 1.5, isEnemyVessel) === eHome.id,
    'T4a KONTROLA: flota ma bieżący rozkaz; stare szukanie brało OBCEGO (jedyny w 1,5 AU)');
  pushed.length = 0; toasts.length = 0;
  armAndClick(fleetId, CLICK);
  assert(toasts.some(x => x.text === t('fleetCmd.noEnemyHere')),
    `T4b toast \`fleetCmd.noEnemyHere\` („${t('fleetCmd.noEnemyHere')}")`);
  assert(pushed.length === 0 && failedToasts().length === 0,
    `T4c ZERO wpisów w Dzienniku (${pushed.length}) i brak „0/2 (część odrzucona)"`);
  assert(mo(a) === 'moveToPoint→?' && mo(b) === 'moveToPoint→?' && fSys.getFleet(fleetId).activeOrder?.type === 'moveToPoint',
    `T4d zero rozkazu engage, poprzedni rozkaz floty PRZEŻYWA (${mo(a)} / ${mo(b)})`);
}

// ═══ T5 — ANTY-JAŁOWOŚĆ + żywy łańcuch DSCS ═════════════════════════════════════
header('T5  kamera == flota, wróg pod kliknięciem ⇒ rozkaz LECI i STARCIE powstaje (kontrola dla T1g)');
{
  scene({ camera: 'sys_020' });
  const a = ship({ sys: 'sys_020', xAU: 2.0, name: 'Alfa' }), b = ship({ sys: 'sys_020', xAU: 3.0, name: 'Beta' });
  const e020 = ship({ sys: 'sys_020', xAU: 2.3, yAU: 0.3, name: 'E_020', empire: 'emp_001' });
  const fleetId = makeFleet(a, b);
  armAndClick(fleetId, at(e020));   // ta SAMA geometria co T1 — różni się tylko kamera
  assert(mo(a) === `engage→${e020.id}` && mo(b) === `engage→${e020.id}` && pushed.length === 0,
    `T5a rozkaz LĄDUJE (${mo(a)} / ${mo(b)}), Dziennik cichy`);
  tick(120);
  const enc = encounters();
  assert(enc.length === 1 && enc[0].location?.systemId === 'sys_020' && enc[0].vesselStates.has(a.id) && enc[0].vesselStates.has(e020.id),
    `T5b po 120 tikach STARCIE w sys_020 z Alfą i E_020 (encounters=${enc.length}) — łańcuch DSCS ŻYJE, więc T1g nie jest jałowe`);
}

// ═══ T6 — 🔑 FINALIZACJA, NIE ARM (D-89c) ═══════════════════════════════════════
header('T6  bramka liczy się przy KLIKU, nie przy uzbrajaniu pickera');
{
  scene({ camera: 'sys_020' });                       // kamera ZGODNA z flotą w chwili ARM
  const a = ship({ sys: 'sys_020', xAU: 2.0, name: 'Alfa' });
  const e020 = ship({ sys: 'sys_020', xAU: 2.3, yAU: 0.3, name: 'E_020', empire: 'emp_001' });
  const fleetId = makeFleet(a);
  const um = installPickerUM({ fleetId });
  fcp()._armEngagePicker(fleetId);
  assert(um.isPickerActive() && window.KOSMOS.activeSystemId === 'sys_020', 'T6a KONTROLA: w chwili ARM kamera == ramka floty (bramka ARM-time by PRZEPUŚCIŁA)');
  window.KOSMOS.activeSystemId = 'sys_home';           // gracz przełącza układ…
  assert(um.isPickerActive(), 'T6b KONTROLA: picker po przełączeniu układu NADAL uzbrojony (nic go nie kasuje na system:switched)');
  firePicker(um, at(e020));                            // …i klika w pustkę ramki `sys_home`
  assert(mo(a) == null && pushed.length === 1 && pushed[0].text.includes('Alfa'),
    `T6c ODMOWA mimo zgodnej kamery przy ARM (rozkaz=${mo(a)}, wpisów=${pushed.length})`);
}
{
  scene({ camera: 'sys_home' });                      // kamera NIEZGODNA w chwili ARM
  const a = ship({ sys: 'sys_020', xAU: 2.0, name: 'Alfa' });
  const e020 = ship({ sys: 'sys_020', xAU: 2.3, yAU: 0.3, name: 'E_020', empire: 'emp_001' });
  const fleetId = makeFleet(a);
  const um = installPickerUM({ fleetId });
  fcp()._armEngagePicker(fleetId);
  window.KOSMOS.activeSystemId = 'sys_020';            // gracz NAJPIERW przełącza na układ floty…
  firePicker(um, at(e020));
  assert(mo(a) === `engage→${e020.id}` && pushed.length === 0,
    `T6d KONTROLA: uzbrojony przy NIEZGODNEJ kamerze, klik po przełączeniu ⇒ rozkaz LECI (${mo(a)}) — bramka ARM-time dałaby fałszywy negatyw`);
}

// ═══ T7 — NIE-REGRESJA 147 ══════════════════════════════════════════════════════
header('T7  członek W SKOKU — admisja fail-open, powód należy do 147 (MOS), nie do ramki');
{
  scene({ camera: 'sys_home' });
  const w = ship({ sys: 'NULL', xAU: 2.0, name: 'Żmija' });
  w.warpFuel.current = 0.5;
  w.mission = { type: 'interstellar_jump', fromSystemId: 'sys_020', toSystemId: 'sys_099', phase: 'warp_transit', departYear: 100, arrivalYear: 140 };
  w.status = 'on_mission'; w.position.state = 'in_transit';
  const eHome = ship({ sys: 'sys_home', xAU: 2.5, yAU: 0, name: 'E_home', empire: 'emp_001' });
  const fleetId = makeFleet(w);
  assert(systemIdOf(w) === null, `T7a KONTROLA: statek w tranzycie ma systemIdOf === null`);
  armAndClick(fleetId, at(eHome));
  const txt = pushed.map(p => p.text).join(' | ');
  assert(mo(w) == null && pushed.length === 1 && txt.includes('Żmija') && txt.includes(t('vessel.reasonVesselInWarpTransit'))
         && !txt.includes(t('vessel.reasonTargetOtherSystem')) && !rawSlug(txt),
    `T7b odmowa z powodem 147 (nie ramki), przetłumaczona → „${txt || '(brak)'}"`);
}

// ═══ T8 — SKUTEK KANONU (NIE naprawa 151) ═══════════════════════════════════════
header('T8  kandydat W TRANZYCIE pod kliknięciem NIE jest wybierany — skutek kanonu listowego (151 zostaje otwarty)');
{
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_home', xAU: 2.0, name: 'Alfa' });
  const eW = ship({ sys: 'NULL', xAU: 2.3, yAU: 0.3, name: 'E_warp', empire: 'emp_001' });   // x/y sprzed skoku
  eW.mission = { type: 'interstellar_jump', phase: 'warp_transit', toSystemId: 'sys_020' };
  const fleetId = makeFleet(a);
  assert(systemIdOf(eW) === null && isEnemyVessel(eW), 'T8a KONTROLA: kandydat jest w tranzycie i jest wrogiem');
  armAndClick(fleetId, at(eW));
  assert(mo(a) == null && toasts.some(x => x.text === t('fleetCmd.noEnemyHere')) && pushed.length === 0,
    `T8b statek między układami nie jest celem picku (${mo(a)}, toast noEnemyHere) — jak 166 T5b; ⚠ to NIE zamyka 151`);
  eW.systemId = 'sys_home'; eW.mission = null; toasts.length = 0;
  armAndClick(fleetId, at(eW));
  assert(mo(a) === `engage→${eW.id}`, `T8c KONTROLA: ten sam wróg ze stemplem układu kamery JEST wybierany (${mo(a)})`);
}

// ═══ T9 — (d) producent #5: PPM `fleet.engage` przez JEDNO źródło D-E2 ══════════
header('T9  PPM „Flota: zaangażuj" — odmowa niesie NAZWY + powód (było: surowy slug), częściowa NAZWANA (było: cisza)');
for (const loc of ['en', 'pl']) {
  setLocale(loc);
  scene({ camera: 'sys_home' });
  const a = ship({ sys: 'sys_020', xAU: 2.0, name: 'Alfa' }), b = ship({ sys: 'sys_020', xAU: 3.0, name: 'Beta' });
  const eHome = ship({ sys: 'sys_home', xAU: 2.5, yAU: 0, name: 'E_home', empire: 'emp_001' });
  const fleetId = makeFleet(a, b);
  ppmFleetEngage(fleetId, eHome);
  const e = pushed[0];
  assert(mo(a) == null && mo(b) == null && pushed.length === 1 && e?.channel === 'fleet' && e?.severity === 'warn',
    `T9a-${loc} KONTROLA: MOS odrzuca obu (seam poprawny), jeden wpis fleet/warn`);
  assert((e?.text ?? '').length > 0 && e.text.includes('Alfa') && e.text.includes('Beta') && e.text.includes(t('vessel.reasonTargetOtherSystem'))
         && !rawSlug(e.text) && e.text !== t('log.el.orderRejected', 'target_other_system'),
    `T9b-${loc} nazwy + PRZETŁUMACZONY powód, nie „⚠ Fleet order rejected: target_other_system" → „${e?.text ?? '(brak)'}"`);
}
setLocale('en');
{
  scene({ camera: 'sys_020' });
  const a = ship({ sys: 'sys_020', xAU: 2.0, name: 'Alfa' }), b = ship({ sys: 'sys_020', xAU: 3.0, name: 'Beta' });
  b.unpaidYears = 2;   // S3.5a-1: ≥ UPKEEP_GRACE_YEARS ⇒ `isImmobilized` ⇒ MOS `vessel_immobilized`
  const e020 = ship({ sys: 'sys_020', xAU: 2.5, yAU: 0, name: 'E_020', empire: 'emp_001' });
  const fleetId = makeFleet(a, b);
  assert(vMgr.isImmobilized(b) && !vMgr.isImmobilized(a), 'T9c KONTROLA: Beta unieruchomiona, Alfa nie');
  ppmFleetEngage(fleetId, e020);
  assert(mo(a) === `engage→${e020.id}` && mo(b) == null, `T9d Alfa leci (${mo(a)}), Beta nie`);
  assert(pushed.length === 1 && pushed[0].text === t('vessel.orderPartial', 1, 2, `Beta (${t('vessel.reasonVesselImmobilized')})`),
    `T9e odmowa CZĘŚCIOWA nazwana (było: cisza) → „${pushed[0]?.text ?? '(brak)'}"`);
}
{
  scene({ camera: 'sys_020' });
  const a = ship({ sys: 'sys_020', xAU: 2.0, name: 'Alfa' }), b = ship({ sys: 'sys_020', xAU: 3.0, name: 'Beta' });
  const e020 = ship({ sys: 'sys_020', xAU: 2.5, yAU: 0, name: 'E_020', empire: 'emp_001' });
  const fleetId = makeFleet(a, b);
  ppmFleetEngage(fleetId, e020);
  assert(mo(a) === `engage→${e020.id}` && mo(b) === `engage→${e020.id}` && pushed.length === 0,
    `T9f KONTROLA: sukces 2/2 MILCZY (${pushed.length} wpisów)`);
  const empty = fSys.createFleet('Pusta').id;
  installPickerUM({ fleetId: empty });
  const tgt = engageTarget(e020);
  new RightClickMenu()._handleOptionClick(fleetEngageOpt(empty, tgt), tgt);
  assert(pushed.length === 1 && pushed[0].text === t('log.el.orderRejected', 'fleet_empty'),
    `T9g KONTROLA: odmowa na poziomie FLOTY ⇒ \`log.el.orderRejected\` (slug bez klucza = pre-existing, klasa 271) → „${pushed[0]?.text}"`);
}

// ═══ T10 — i18n ═══════════════════════════════════════════════════════════════
header('T10 i18n — reużyte klucze żyją w PL i EN (zero nowych); „pusto" pickera ≠ „pusto" popupu');
{
  const prev = getLocale();
  const keys = ['fleetCmd.noEnemyHere', 'vessel.orderNoneMoved', 'vessel.orderPartial', 'vessel.reasonTargetOtherSystem',
                'vessel.reasonVesselInWarpTransit', 'vessel.reasonVesselImmobilized', 'log.el.orderRejected', 'fleet.noDetectedEnemies'];
  for (const loc of ['pl', 'en']) {
    setLocale(loc);
    const missing = keys.filter(k => t(k, 'X', 'Y', 'Z') === k);
    assert(missing.length === 0, `T10-${loc} ${keys.length} kluczy rozwiązanych (brakujące: ${missing.join(', ') || 'żaden'})`);
    // ⚠ `fleet.noDetectedEnemies` („…kliknij wroga na mapie…") OBIECUJE powierzchnię, której pick-mode
    //   nie ma (166 M1b); pusty KLIK ma swoje uczciwe słowo — i to ono zostaje w producencie #4.
    assert(t('fleetCmd.noEnemyHere') !== t('fleet.noDetectedEnemies'),
      `T10-${loc} „${t('fleetCmd.noEnemyHere')}" ≠ „${t('fleet.noDetectedEnemies').slice(0, 30)}…"`);
  }
  setLocale(prev);
}

// ═══ T11 — ŹRÓDŁO (CRLF-safe, komentarze zdjęte) ═══════════════════════════════
header('T11 ŹRÓDŁO — admisja PRZED szukaniem, zakres = układ KAMERY, helper nietknięty, RCM bez sluga');
{
  const fcpSrc  = readSrc('ui/FleetCommandPanel.js');
  const logic   = stripComments(readSrc('ui/FleetCommandPanelLogic.js'));
  // ⚠ Finding 270 — kontrola NIE pyta o stan dysku (zależny od checkoutu: po `.gitattributes eol=lf`
  //   świeży klon jest LF, drzewo autora bywa CRLF). WYKONUJE `stripComments` na syntetycznej kopii
  //   CRLF i wymaga wyniku równoważnego kopii LF — dowód \r?\n-safety niezależny od tego, co leży na dysku.
  {
    const asLf = fcpSrc.replace(/\r\n/g, '\n'), asCrlf = asLf.replace(/\n/g, '\r\n');
    assert(/\r\n/.test(asCrlf) && stripComments(asCrlf).replace(/\r\n/g, '\n') === stripComments(asLf),
      'T11-ctl KONTROLA: stripComments daje TEN SAM wynik na kopii CRLF i LF (pin \\r?\\n-safe niezależnie od checkoutu — Finding 270)');
  }
  const body = stripComments(FleetCommandPanel.prototype._armEngagePicker.toString());
  const iAdm = body.search(/fleetOffendersOutOfFrame\(\s*fleetId\s*\)/);
  const iSrc = body.search(/nearestEnemyToPoint\(/);
  assert(iAdm >= 0 && iSrc >= 0 && iAdm < iSrc,
    `T11a admisja floty (\`fleetOffendersOutOfFrame\`) stoi PRZED szukaniem wroga (idx ${iAdm} < ${iSrc})`);
  assert(/activeSystemId/.test(body) && /systemIdOf\(\s*v\s*\)\s*===\s*cam/.test(body),
    'T11b zakres szukania = układ KAMERY przez kanon `systemIdOf(v) === cam`');
  assert(!/nearestEnemyToPoint\(\s*vm\?\.getAllVessels/.test(body) && /nearestEnemyToPoint\(\s*inFrame/.test(body),
    'T11c `nearestEnemyToPoint` NIE dostaje już całego rejestru — dostaje zbiór z ramki kamery');
  // KONTROLA PINU — na zmutowanej kopii (stary kształt) T11c PADA.
  assert(/nearestEnemyToPoint\(\s*vm\?\.getAllVessels/.test(body + '\nnearestEnemyToPoint(vm?.getAllVessels?.() ?? [], point)'),
    'T11d KONTROLA PINU: stary kształt wywołania na zmutowanej kopii jest WYKRYWANY');
  assert(/\/\/ x/.test(stripComments('a // x')) === false && /vm\?\.getAllVessels/.test(stripComments('// nearestEnemyToPoint(vm?.getAllVessels') ) === false,
    'T11e KONTROLA PINU: `stripComments` naprawdę zdejmuje komentarze (pin czyta KOD)');
  assert(/export function nearestEnemyToPoint\(vessels, point, thresholdPx, isEnemy\)/.test(logic) && !/systemId/.test(logic),
    'T11f helper `nearestEnemyToPoint` NIETKNIĘTY i system-ślepy — termin mieszka u WOŁAJĄCEGO (klasa D-LD1)');
  const keys = [...body.matchAll(/t\(\s*'([A-Za-z0-9_.]+)'/g)].map(m => m[1]);
  assert(keys.length > 0 && keys.every(k => ['fleetCmd.noEnemyHere', 'vessel.orderNoneMoved'].includes(k)),
    `T11g producent #4 używa WYŁĄCZNIE istniejących kluczy → [${keys.join(', ')}]`);
  const rcm = stripComments(RightClickMenu.prototype._handleOptionClick.toString());
  assert(/describeFleetOrderRefusal\(\s*res\s*\)/.test(rcm) && !/rejected\?\.\[0\]\?\.reason/.test(rcm),
    'T11h RCM: blok floty woła JEDNO źródło D-E2, surowy `rejected?.[0]?.reason` ZNIKNĄŁ');
  assert(/rejected\?\.\[0\]\?\.reason/.test(rcm + '\nres?.rejected?.[0]?.reason'),
    'T11i KONTROLA PINU: stary surowy odczyt na zmutowanej kopii jest WYKRYWANY');
}

console.log(`\n════ fleet_engage_picker_frame_smoke: ${pass} PASS / ${fail} FAIL ════`);
process.exit(fail ? 1 : 0);
