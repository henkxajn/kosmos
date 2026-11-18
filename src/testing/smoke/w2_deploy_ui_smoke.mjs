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
//   T1  kolumna Rezerwy pasa konsoli Stoczni pokazuje kadłuby bez załogi; Rozmieść klikalny i woła deployVessel(ten kadłub)
//   T2  przy zaległościach floty przycisku NIE MA (zamiast przycisku, który milczy) — jest linia powodu, kadłub dalej na liście
//   T3  §S18 — strefa wypchnięta scrollem kolumny Rezerwy poza pasmo JEST przycinana; klik w jej dawne miejsce nie rozmieszcza
//
// KZ-Shipyard: dawna wąska kolumna Stoczni (wspólny scroll `_shipyardScrollY`, sekcja `_drawReserve`) usunięta — T1–T3 przepięte
// na rezerwę pasa konsoli (`ShipyardConsoleView`: kolumna `reserve`, przewijanie `_stripScroll.reserve` przez handleScroll,
// pasmo `_consoleScrollRects.reserve`). Usunięte bez zamiennika: brak. Pułapka §S18 dotyczyła starej kolumny; konsola przycina
// strefy pasa przez `pruneZones` — T3 pinuje to wykonaniem.
//   T4  §S19 — oś służby jest rysowana PRZED early returnem (rezerwa ma czym wyjść z magazynu)
//       KZ-Command: dawny panel `_drawActions` (FMO) usunięty — pułapka §S19 (oś służby za listą akcji) pinowana na ŻYWYCH
//       powierzchniach panelu statku: inspektor konsoli Dowództwa (`CommandInspectorView.drawInspector`, fakty
//       `_inspectorShipFacts`) i panel statku HUD (`ShipPanelHudLogic.buildShipPanelModel`): przycisk osi służby przy PUSTEJ
//       liście akcji, przed siatką akcji, jeden kierunek naraz, brak w trakcie przejścia.
//   T5  brak nowego slotu nawigacji (7, niezmiennie)
//   T6  komplet kluczy i18n w OBU językach — powody odmowy są mapowane JAWNIE, więc
//        `check-i18n` ich nie widzi i literówka doszłaby do gracza jako surowy kod

import '../headless/env.js';           // MUSI być pierwszy (window/document/THREE + seeded RNG)
import { ShipyardOverlay } from '../../ui/ShipyardOverlay.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { drawInspector } from '../../ui/CommandInspectorView.js';
import { consoleRoles } from '../../ui/ConsoleRolesLogic.js';
import { buildShipPanelModel, modelZones } from '../../ui/ShipPanelHudLogic.js';
import { NAV_GROUPS } from '../../ui/CivPanelDrawer.js';
import PL from '../../i18n/pl.js';
import EN from '../../i18n/en.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Mock ctx: notuje clip-rect i teksty, nic nie rysuje ─────────────────────────────────────
function mockCtx() {
  const clips = [], texts = [];
  const ctx = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    textAlign: '', textBaseline: '', shadowColor: '', shadowBlur: 0,
    measureText: (s) => ({ width: String(s ?? '').length * 6 }),
    fillText: (s) => { texts.push(String(s)); }, fillRect: () => {}, strokeRect: () => {}, arc: () => {},
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, fill: () => {},
    save: () => {}, restore: () => {}, clip: () => {}, setLineDash: () => {}, getTransform: () => ({ a: 1 }),
    _clips: clips, _texts: texts,
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

const deployCalls = [];
/** Minimalny świat: aktywna kolonia ze stocznią + rejestr statków + stawki utrzymania. */
function stubWorld(vessels, { arrears = false } = {}) {
  const pid = 'p_home';
  deployCalls.length = 0;
  window.KOSMOS = window.KOSMOS ?? {};
  const col = { planetId: pid, name: 'Dom', credits: 0, civSystem: { freePops: 0 },
    buildingSystem: { _active: new Map([['b1', { building: { id: 'shipyard' }, level: 1 }]]) },
    resourceSystem: { inventory: {}, inventorySnapshot: () => ({}) }, shipQueues: [], pendingShipOrders: [] };
  window.KOSMOS.colonyManager = {
    activePlanetId: pid,
    _getShipyardLevel: () => 1,
    getColony: (id) => (id === pid ? col : null),
    getShipQueues: () => col.shipQueues,
  };
  window.KOSMOS.vesselManager = {
    getAllVessels: () => vessels,
    getVessel: (id) => vessels.find(v => v.id === id) ?? null,
    getVesselUpkeepCredits: () => 30,
    getVesselBaseUpkeepCredits: () => 300,
    isImmobilized: () => false,
    fleetInArrears: () => arrears,   // B — zatrzask imperialny (był `colonyInArrears(colonyId)`)
    deployVessel: (id) => { deployCalls.push(id); return { ok: true }; },
    withdrawVessel: () => ({ ok: true }),
  };
  window.KOSMOS.techSystem = { isResearched: () => true };
  window.KOSMOS.overlayManager = { overlays: {} };   // brak edytora projektów → projektant bez kadłuba (rezerwa niezależna)
  return pid;
}

const zonesOfType = (ov, type) => ov._hitZones.filter(z => z.type === type);

// ── T1 — sekcja Rezerwy pokazuje kadłuby i daje przycisk ────────────────────────────────────
console.log('T1 — kolumna REZERWA pasa konsoli listuje kadłuby bez załogi i rejestruje „Rozmieść"');
{
  const v = stubVessel('v_1', 'p_home');
  stubWorld([v]);
  const ov = new ShipyardOverlay();
  ov.visible = true;
  ov.draw(mockCtx(), 1600, 900);

  const deploys = zonesOfType(ov, 'deploy_vessel');
  assert(deploys.length === 1, `T1: dokładnie jeden przycisk Rozmieść (${deploys.length})`);
  assert(deploys[0]?.data?.vesselId === 'v_1', `T1: przycisk celuje w ten kadłub (${deploys[0]?.data?.vesselId})`);
  const band = ov._consoleScrollRects?.reserve;
  const inside = (z, r) => !!r && !!z && z.x >= r.x - 0.5 && z.y >= r.y - 0.5 && z.x + z.w <= r.x + r.w + 0.5 && z.y + z.h <= r.y + r.h + 0.5;
  assert(inside(deploys[0], band) && inside(band, ov.consoleZones?.strip), 'T1: przycisk w kolumnie Rezerwy pasa konsoli');
  const dz = deploys[0];
  const handled = dz ? ov.handleClick(dz.x + dz.w / 2, dz.y + dz.h / 2) : false;
  assert(handled === true && deployCalls.length === 1 && deployCalls[0] === 'v_1', `T1: klik Rozmieść → vesselManager.deployVessel(v_1) (${deployCalls.join(',')})`);

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
  const ctx = mockCtx();
  ov.draw(ctx, 1600, 900);
  assert(zonesOfType(ov, 'deploy_vessel').length === 0,
    'T2: brak strefy klik przy zaległościach — martwy przycisk jest gorszy niż wyszarzony');
  const joined = ctx._texts.join(' ');
  assert(joined.includes(PL['fleet.deployBlockedArrears']) && ctx._texts.some((s) => s.includes('Kadłub v_1')),
    'T2 KONTROLA PINU: kadłub dalej na liście Rezerwy, a zamiast przycisku stoi linia powodu (zaległości)');
}

// ── T3 — §S18: strefy klik są przycinane do widocznego pasma ────────────────────────────────
console.log('T3 — §S18: strefa wypchnięta scrollem poza pasmo jest PRZYCINANA (ghost-click)');
{
  // Dużo kadłubów → sekcja jest wyższa niż panel; scroll wypycha pierwsze wiersze w górę.
  const many = Array.from({ length: 40 }, (_, i) => stubVessel(`v_${i}`, 'p_home'));
  stubWorld(many);

  const ov = new ShipyardOverlay(); ov.visible = true;
  const ctx0 = mockCtx();
  ov.draw(ctx0, 1600, 900);
  const atTop = zonesOfType(ov, 'deploy_vessel');
  assert(atTop.length > 0 && atTop.length < many.length, `T3 KONTROLA PINU: przy scrollu 0 część przycisków istnieje, reszta przycięta (${atTop.length}/${many.length})`);

  // Pasmo treści = przewijana część kolumny Rezerwy (ten sam prostokąt clipuje rysunek).
  const band = ov._consoleScrollRects?.reserve;
  assert(!!band && ctx0._clips.some((c) => c.x === band.x && c.y === band.y && c.w === band.w && c.h === band.h),
    'T3 KONTROLA PINU: kolumna Rezerwy clipuje rysunek do swojego pasma (mamy do czego porównać)');
  const inBand = (z) => band && z.y >= band.y - 0.5 && z.y + z.h <= band.y + band.h + 0.5;
  assert(atTop.every(inBand),
    'T3: wszystkie zarejestrowane strefy mieszczą się w widocznym paśmie — nic nie wystaje poza clip');

  // Ten sam panel po przewinięciu kółkiem nad kolumną: pierwszy kadłub wyjeżdża w górę i MUSI stracić strefę.
  const firstId = atTop[0].data.vesselId;
  const wheel = ov.handleScroll(1200, band.x + 5, band.y + 5);
  ov._hitZones = [];
  ov.draw(mockCtx(), 1600, 900);
  const after = zonesOfType(ov, 'deploy_vessel');
  assert(wheel === true && (ov._stripScroll?.reserve ?? 0) > 0, `T3 KONTROLA PINU: kółko nad kolumną przewija Rezerwę (${ov._stripScroll?.reserve})`);
  assert(after.every(inBand),
    'T3: po przewinięciu też nic nie wystaje poza pasmo (przycinanie działa dla obu skrajów)');
  assert(after.every(z => z.data.vesselId !== firstId),
    `T3: strefa pierwszego kadłuba (${firstId}) ZNIKNĘŁA po przewinięciu — bez tego zostawałaby klikalna „w powietrzu"`);
  assert(after.length > 0, 'T3 KONTROLA PINU: po przewinięciu jakieś przyciski nadal SĄ (nie wycięliśmy wszystkiego)');
  // ghost-click: klik tuż NAD i tuż POD pasmem w kolumnie przycisków nie trafia w żaden Rozmieść (wiersz wypchnięty scrollem nie
  // zostawia strefy); świadek: klik w widoczny przycisk rozmieszcza właśnie jego kadłub.
  const cx = after[0] ? after[0].x + after[0].w / 2 : band.x + band.w - 10;
  deployCalls.length = 0;
  for (let d = 1; d <= 48; d++) { ov.handleClick(cx, band.y - d); ov.handleClick(cx, band.y + band.h + d); }
  const ghost = deployCalls.slice();
  deployCalls.length = 0;
  if (after[0]) ov.handleClick(cx, after[0].y + after[0].h / 2);
  assert(ghost.length === 0 && deployCalls.length === 1 && deployCalls[0] === after[0]?.data?.vesselId,
    `T3: klik 1–48 px nad / pod pasmem nie rozmieszcza nic (ghost-click; trafienia: ${ghost.join(',') || '—'}); świadek: klik w widoczny przycisk działa`);
}

// ── T4 — §S19: oś służby przed early returnem ───────────────────────────────────────────────
console.log('T4 — §S19: „Wycofaj/Rozmieść" na żywych powierzchniach panelu statku — także przy PUSTEJ liście akcji');
{
  const stored = stubVessel('v_s', 'p_home', 'stored');
  const active = stubVessel('v_a', 'p_home', 'active');
  const inert = stubVessel('v_inert', 'p_home', 'stored', { position: { state: 'none', dockedAt: 'p_home', x: 0, y: 0 } });
  const mobil = stubVessel('v_m', 'p_home', 'mobilizing', { mobilizeProgress: 0.5, mobilizeTarget: 'active' });
  stubWorld([stored, active, inert, mobil]);

  /** Obie żywe powierzchnie dla statku: strefy inspektora konsoli (kolejność rysunku) i strefy modelu panelu HUD. */
  const surfaces = (v) => {
    const fmo = new FleetManagerOverlay();
    fmo._selectedVesselId = v.id; fmo._hitZones = []; fmo._cmdDisabled = []; fmo._cmdTip = null;
    drawInspector(fmo, mockCtx(), { x: 0, y: 0, w: 300, h: 4000 }, consoleRoles(),
      { vMgr: window.KOSMOS.vesselManager, ms: null, colMgr: window.KOSMOS.colonyManager, activePid: 'p_home' });
    const facts = fmo._inspectorShipFacts(v, null, window.KOSMOS.colonyManager, 'p_home');
    const m = buildShipPanelModel(v, { K: window.KOSMOS, fmo });
    return { insp: fmo._hitZones.map((z) => z.type), hud: modelZones(m).map((z) => z.type), actions: facts.actions.length, hudOrders: m?.orders?.items?.length ?? -1 };
  };
  const cnt = (arr, t) => arr.filter((x) => x === t).length;

  // (a) ŚCIEŻKA PUSTEJ LISTY AKCJI — `getAvailableActions` zwraca pustą listę. Wymuszamy ją stanem pozycji spoza trzech
  //     znanych wartości: to jedyne tanie wejście headless (każdy docked/orbiting/in_transit ma co najmniej jedną akcję),
  //     a mierzymy nie sam stan, tylko to, czy przycisk osi służby PRZEŻYWA brak akcji.
  const a = surfaces(inert);
  assert(a.actions === 0 && a.hudOrders === 0, `T4a świadek: lista akcji PUSTA na obu powierzchniach (fakty ${a.actions}, HUD ${a.hudOrders})`);
  assert(cnt(a.insp, 'deploy_vessel') === 1 && cnt(a.hud, 'deploy_vessel') === 1,
    'T4a: przycisk Rozmieść JEST (inspektor konsoli i panel HUD), choć lista akcji jest pusta — to jest cały sens §S19');

  // (b) ŚCIEŻKA NORMALNA — przycisk osi służby rejestruje się PRZED siatką akcji.
  const b = surfaces(stored);
  assert(b.actions > 0 && cnt(b.insp, 'deploy_vessel') === 1 && cnt(b.hud, 'deploy_vessel') === 1,
    `T4b: kadłub w REZERWIE dostaje przycisk także przy NIEPUSTEJ liście akcji (akcji: ${b.actions})`);
  const order = (arr) => ({ dep: arr.indexOf('deploy_vessel'), act: arr.indexOf('action') });
  const oi = order(b.insp), oh = order(b.hud);
  assert(oi.act > 0 && oh.act > 0 && oi.dep < oi.act && oh.dep < oh.act,
    `T4b: oś służby zarejestrowana PRZED siatką akcji (inspektor ${oi.dep} < ${oi.act}, HUD ${oh.dep} < ${oh.act}) — kolejność jest tu kontraktem`);

  const c = surfaces(active);
  assert(cnt(c.insp, 'withdraw_vessel') === 1 && cnt(c.hud, 'withdraw_vessel') === 1,
    'T4: okręt W SŁUŻBIE dostaje przycisk WYCOFAJ na obu powierzchniach (ta sama oś, drugi kierunek)');
  assert(cnt(c.insp, 'deploy_vessel') === 0 && cnt(c.hud, 'deploy_vessel') === 0,
    'T4 KONTROLA PINU: …i NIE dostaje przy tym „Rozmieść" (jeden przycisk, nie dwa)');

  const d = surfaces(mobil);
  assert(d.insp.length > 0 && cnt(d.insp, 'deploy_vessel') + cnt(d.insp, 'withdraw_vessel') === 0
    && cnt(d.hud, 'deploy_vessel') + cnt(d.hud, 'withdraw_vessel') === 0,
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
