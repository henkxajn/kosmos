// W2 — keeper interfejsu rozmieszczenia (commit W2-6, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: cały model rezerwy jest dla gracza NIEWIDZIALNY, dopóki nie ma przycisku. Audyt
// wskazał przy tym DWIE pułapki dokładnie w miejscach, gdzie ten przycisk musi wylądować:
//   §S18 — `ShipyardOverlay` rejestruje strefy klik na współrzędnych PRZESUNIĘTYCH scrollem
//          i NIGDY ich nie przycina (żywy ghost-click; sąsiednie panele robią to od dawna),
//   §S19 — `FleetManagerOverlay._drawActions` robi early return przy pustej liście akcji,
//          czyli DOKŁADNIE wtedy, gdy statek jest bezczynny — a więc zawsze dla rezerwy.
// Oba pinujemy WYKONANIEM na prawdziwych klasach, nie odczytem źródła.
//
//   T1  sekcja Rezerwy pokazuje kadłuby bez załogi i rejestruje przycisk Rozmieść
//   T2  przy zaległościach kolonii przycisku NIE MA (zamiast przycisku, który milczy)
//   T3  §S18 — strefa wypchnięta scrollem poza pasmo JEST przycinana (ghost-click zażegnany)
//   T4  §S19 — oś służby jest rysowana PRZED early returnem (rezerwa ma czym wyjść z magazynu)
//   T5  brak nowego slotu nawigacji (7, niezmiennie)
//   T6  komplet kluczy i18n w OBU językach — powody odmowy są mapowane JAWNIE, więc
//        `check-i18n` ich nie widzi i literówka doszłaby do gracza jako surowy kod

import '../headless/env.js';           // MUSI być pierwszy (window/document/THREE + seeded RNG)
import { ShipyardOverlay } from '../../ui/ShipyardOverlay.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { NAV_GROUPS } from '../../ui/CivPanelDrawer.js';
import PL from '../../i18n/pl.js';
import EN from '../../i18n/en.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Mock ctx: notuje clip-rect (pasmo treści) i nic nie rysuje ──────────────────────────────
function mockCtx() {
  const clips = [];
  const ctx = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    textAlign: '', textBaseline: '',
    measureText: (s) => ({ width: (s ?? '').length * 6 }),
    fillText: () => {}, fillRect: () => {}, strokeRect: () => {},
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
    save: () => {}, restore: () => {}, clip: () => {}, setLineDash: () => {},
    _clips: clips,
  };
  ctx.rect = (x, y, w, h) => clips.push({ x, y, w, h });
  return ctx;
}

/** Statek-atrapa w rezerwie, zadokowany w kolonii `pid`. */
function stubVessel(id, pid, state = 'stored', extra = {}) {
  return {
    id, name: `Kadłub ${id}`, shipId: 'hull_frigate',
    isWreck: false, colonyId: pid, homeColonyId: pid,
    serviceState: state, mobilizeProgress: 0, mobilizeTarget: null,
    crewLocked: 0, crewStrataLocked: null, crewColonyId: null,
    position: { state: 'docked', dockedAt: pid, x: 0, y: 0 },
    modules: [], status: 'idle', fuel: { current: 1, max: 1 },
    ...extra,
  };
}

/** Minimalny świat: aktywna kolonia + rejestr statków + stawki utrzymania. */
function stubWorld(vessels, { arrears = false } = {}) {
  const pid = 'p_home';
  window.KOSMOS = window.KOSMOS ?? {};
  window.KOSMOS.colonyManager = {
    activePlanetId: pid,
    _getShipyardLevel: () => 1,
    getColony: (id) => (id === pid
      ? { planetId: pid, name: 'Dom', resourceSystem: { inventory: {} }, shipQueues: [], pendingShipOrders: [] }
      : null),
  };
  window.KOSMOS.vesselManager = {
    getAllVessels: () => vessels,
    getVessel: (id) => vessels.find(v => v.id === id) ?? null,
    getVesselUpkeepCredits: () => 30,
    getVesselBaseUpkeepCredits: () => 300,
    isImmobilized: () => false,
    colonyInArrears: () => arrears,
    deployVessel: () => ({ ok: true }),
    withdrawVessel: () => ({ ok: true }),
  };
  window.KOSMOS.techSystem = { isResearched: () => true };
  window.KOSMOS.overlayManager = { overlays: {} };   // brak edytora projektów → sekcja pomijana
  return pid;
}

const zonesOfType = (ov, type) => ov._hitZones.filter(z => z.type === type);

// ── T1 — sekcja Rezerwy pokazuje kadłuby i daje przycisk ────────────────────────────────────
console.log('T1 — sekcja REZERWA listuje kadłuby bez załogi i rejestruje „Rozmieść"');
{
  const v = stubVessel('v_1', 'p_home');
  stubWorld([v]);
  const ov = new ShipyardOverlay();
  ov.visible = true;
  ov.draw(mockCtx(), 1600, 900);

  const deploys = zonesOfType(ov, 'deploy_vessel');
  assert(deploys.length === 1, `T1: dokładnie jeden przycisk Rozmieść (${deploys.length})`);
  assert(deploys[0]?.data?.vesselId === 'v_1', `T1: przycisk celuje w ten kadłub (${deploys[0]?.data?.vesselId})`);

  // KONTROLA PINU: kadłub W SŁUŻBIE nie ma czego rozmieszczać — sekcja mierzy STAN, nie rejestr.
  v.serviceState = 'active';
  const ov2 = new ShipyardOverlay(); ov2.visible = true;
  ov2.draw(mockCtx(), 1600, 900);
  assert(zonesOfType(ov2, 'deploy_vessel').length === 0,
    'T1 KONTROLA PINU: kadłub w SŁUŻBIE znika z sekcji Rezerwy');
}

// ── T2 — zaległości chowają przycisk zamiast go wyciszać ────────────────────────────────────
console.log('T2 — przy długu kolonii przycisku NIE MA (a nie: jest i milczy)');
{
  const v = stubVessel('v_1', 'p_home');
  stubWorld([v], { arrears: true });
  const ov = new ShipyardOverlay(); ov.visible = true;
  ov.draw(mockCtx(), 1600, 900);
  assert(zonesOfType(ov, 'deploy_vessel').length === 0,
    'T2: brak strefy klik przy zaległościach — martwy przycisk jest gorszy niż wyszarzony');
}

// ── T3 — §S18: strefy klik są przycinane do widocznego pasma ────────────────────────────────
console.log('T3 — §S18: strefa wypchnięta scrollem poza pasmo jest PRZYCINANA (ghost-click)');
{
  // Dużo kadłubów → sekcja jest wyższa niż panel; scroll wypycha pierwsze wiersze w górę.
  const many = Array.from({ length: 40 }, (_, i) => stubVessel(`v_${i}`, 'p_home'));
  stubWorld(many);

  const ov = new ShipyardOverlay(); ov.visible = true;
  ov._shipyardScrollY = 0;
  const ctx0 = mockCtx();
  ov.draw(ctx0, 1600, 900);
  const atTop = zonesOfType(ov, 'deploy_vessel');
  assert(atTop.length > 0, `T3 KONTROLA PINU: przy scrollu 0 przyciski istnieją (${atTop.length})`);

  // Pasmo treści = prostokąt, którym panel clipuje rysowanie (ostatni zarejestrowany `rect`).
  const band = ctx0._clips[ctx0._clips.length - 1];
  assert(!!band, 'T3 KONTROLA PINU: panel rejestruje prostokąt clipa (mamy do czego porównać)');
  const inBand = (z) => band && z.y >= band.y - 0.5 && z.y + z.h <= band.y + band.h + 0.5;
  assert(atTop.every(inBand),
    'T3: wszystkie zarejestrowane strefy mieszczą się w widocznym paśmie — nic nie wystaje poza clip');

  // Ten sam panel po przewinięciu: pierwszy kadłub wyjeżdża w górę i MUSI stracić strefę.
  const firstId = atTop[0].data.vesselId;
  ov._shipyardScrollY = 600;
  ov.draw(mockCtx(), 1600, 900);
  const after = zonesOfType(ov, 'deploy_vessel');
  assert(after.every(inBand),
    'T3: po przewinięciu też nic nie wystaje poza pasmo (przycinanie działa dla obu skrajów)');
  assert(after.every(z => z.data.vesselId !== firstId),
    `T3: strefa pierwszego kadłuba (${firstId}) ZNIKNĘŁA po przewinięciu — bez tego zostawałaby klikalna „w powietrzu"`);
  assert(after.length > 0, 'T3 KONTROLA PINU: po przewinięciu jakieś przyciski nadal SĄ (nie wycięliśmy wszystkiego)');
}

// ── T4 — §S19: oś służby przed early returnem ───────────────────────────────────────────────
console.log('T4 — §S19: „Wycofaj/Rozmieść" rysowane PRZED early returnem pustej listy akcji');
{
  const stored = stubVessel('v_s', 'p_home', 'stored');
  const active = stubVessel('v_a', 'p_home', 'active');
  stubWorld([stored, active]);

  const fmo = new FleetManagerOverlay();

  // (a) ŚCIEŻKA EARLY RETURN — `getAvailableActions` zwraca pustą listę. Wymuszamy ją stanem
  //     pozycji spoza trzech znanych wartości: to jedyne tanie wejście w tę gałąź headless
  //     (każdy docked/orbiting/in_transit ma co najmniej jedną akcję), a mierzymy nie sam
  //     stan, tylko to, czy przycisk PRZEŻYWA `return` w środku metody.
  fmo._hitZones = [];
  const inert = stubVessel('v_inert', 'p_home', 'stored', { position: { state: 'none', dockedAt: 'p_home', x: 0, y: 0 } });
  fmo._drawActions(mockCtx(), 0, 0, 300, 8, inert, null, window.KOSMOS.colonyManager, 'p_home');
  assert(zonesOfType(fmo, 'deploy_vessel').length === 1,
    'T4a: przycisk JEST, choć lista akcji jest pusta i metoda kończy się wcześniej — to jest cały sens §S19');

  // (b) ŚCIEŻKA NORMALNA — przycisk osi służby rejestruje się PRZED siatką akcji.
  fmo._hitZones = [];
  fmo._drawActions(mockCtx(), 0, 0, 300, 8, stored, null, window.KOSMOS.colonyManager, 'p_home');
  const dep = zonesOfType(fmo, 'deploy_vessel');
  assert(dep.length === 1,
    `T4b: kadłub w REZERWIE dostaje przycisk także przy niepustej liście akcji (${dep.length})`);
  const firstActionIdx = fmo._hitZones.findIndex(z => z.type === 'action');
  const deployIdx = fmo._hitZones.findIndex(z => z.type === 'deploy_vessel');
  assert(firstActionIdx === -1 || deployIdx < firstActionIdx,
    `T4b: oś służby zarejestrowana PRZED siatką akcji (idx ${deployIdx} < ${firstActionIdx}) — kolejność jest tu kontraktem`);

  fmo._hitZones = [];
  fmo._drawActions(mockCtx(), 0, 0, 300, 8, active, null, window.KOSMOS.colonyManager, 'p_home');
  assert(zonesOfType(fmo, 'withdraw_vessel').length === 1,
    'T4: okręt W SŁUŻBIE dostaje przycisk WYCOFAJ (ta sama oś, drugi kierunek)');
  assert(zonesOfType(fmo, 'deploy_vessel').length === 0,
    'T4 KONTROLA PINU: …i NIE dostaje przy tym „Rozmieść" (jeden przycisk, nie dwa)');

  fmo._hitZones = [];
  const mobil = stubVessel('v_m', 'p_home', 'mobilizing', { mobilizeProgress: 0.5, mobilizeTarget: 'active' });
  fmo._drawActions(mockCtx(), 0, 0, 300, 8, mobil, null, window.KOSMOS.colonyManager, 'p_home');
  assert(zonesOfType(fmo, 'deploy_vessel').length === 0 && zonesOfType(fmo, 'withdraw_vessel').length === 0,
    'T4: w trakcie przejścia NIE MA przycisku (jest pasek) — rozkaz w połowie drogi byłby dwuznaczny');
}

// ── T5 — brak nowego slotu nawigacji ────────────────────────────────────────────────────────
console.log('T5 — nawigacja bez zmian: nadal 7 slotów');
{
  assert(NAV_GROUPS.length === 7, `T5: dokładnie 7 slotów nav (${NAV_GROUPS.length}) — Rezerwa mieszka w Stoczni, nie w nowym kaflu`);
  assert(NAV_GROUPS.some(g => g.primary === 'shipyard'), 'T5: Stocznia nadal jest w nawigacji');
  assert(!NAV_GROUPS.some(g => g.primary === 'reserve'), 'T5: nie powstał slot „reserve"');
}

// ── T6 — komplet i18n w obu językach ────────────────────────────────────────────────────────
console.log('T6 — klucze W2-6 w OBU słownikach (mapa powodów jest jawna, checker jej nie widzi)');
{
  const KEYS = [
    'fleet.reserveHeader', 'fleet.reserveEmpty', 'fleet.reserveBill', 'fleet.reserveRowInfo',
    'fleet.deployAction', 'fleet.withdrawAction', 'fleet.mobilizing', 'fleet.withdrawing',
    'fleet.reserveUpkeepRow', 'fleet.reserveRateNote',
    // powody odmowy — mapowane JAWNIE w UIManagerze (`vessel:deployRejected`)
    'fleet.deployBlockedArrears', 'fleet.noCrewPops', 'fleet.deployNoColony',
    'fleet.withdrawInTransit', 'fleet.alreadyMobilizing', 'fleet.alreadyInService',
    'fleet.alreadyStored', 'fleet.vesselIsWreck', 'fleet.vesselNotFound',
    // log osi służby
    'log.deployStarted', 'log.deployComplete', 'log.withdrawStarted', 'log.withdrawComplete', 'log.crewLost',
  ];
  const missPL = KEYS.filter(k => typeof PL[k] !== 'string');
  const missEN = KEYS.filter(k => typeof EN[k] !== 'string');
  assert(missPL.length === 0, `T6: komplet PL (brakuje: ${missPL.join(', ') || '—'})`);
  assert(missEN.length === 0, `T6: komplet EN (brakuje: ${missEN.join(', ') || '—'})`);
  // ⚠ Jednostka W ETYKIECIE (R-B) — nie ozdobnik, tylko wymóg orzeczenia.
  assert(/miesiąc/i.test(PL['fleet.mobilizing']) && /month/i.test(EN['fleet.mobilizing']),
    'T6: etykieta mobilizacji NAZYWA jednostkę czasu w obu językach');
  assert(/POP/.test(PL['fleet.reserveRowInfo']) && /POP/.test(EN['fleet.reserveRowInfo']),
    'T6: wiersz rezerwy nazywa jednostkę załogi (POP) w obu językach');
}

console.log(`\n[w2_deploy_ui_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
