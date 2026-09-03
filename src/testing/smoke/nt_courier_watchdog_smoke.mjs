// 240 / C2 — keeper WATCHDOGA kurierów AI (`NT_LINK_PLAN.md`).
//
// PO CO: guard przylotu W3-4b zapobiega FAŁSZYWEMU dokowaniu do ciała spoza układu, ale
// NIC nie zdejmuje statku z pozy, w której go zostawia (`dockedAt=null`, `orbiting_body`).
// Żaden mechanizm w `src/` tego nie robił — jedyny kandydat-lekarstwo (`_sendCourierHome`)
// był wołany wyłącznie ze sprzątania po zniszczonej koloni.
//
// ⚠ SEDNO: watchdog kluczuje się na ZEGARZE MISJI, nie na pozie. `orbiting`/`in_transit`
// z `dockedAt=null` to TAKŻE normalny stan statku W LOCIE — zmierzone (Finding 244): zdrowy
// kurier na działającej trasie ma DOKŁADNIE tę pozę, razem z resztką `cargoUsed` ~1e-14.
// Dlatego kontrole niejałowości są tu ważniejsze od samej naprawy.
//
//   T1  PIN DEFEKTU (flaga OFF): zamrożony kadłub tkwi w pozie i nikt go nie rusza
//   T2  NAPRAWA (flaga ON): wraca do domu (`phase='returning'`), z powodem i spóźnieniem
//   T3  ⚠ KONTROLA: zdrowy kurier W LOCIE (termin w PRZYSZŁOŚCI) — Z RESZTKĄ 1,42e-14
//       z żywej gry — NIE jest ruszany
//   T4  ⚠ KONTROLA: LEGALNE CZEKANIE przy placówce (`dockedAt === cel`, termin dawno minął)
//       NIE jest ruszane — kurier dobija tam produkcję
//   T5  kadłub w `reserve` (tam trafia po C1) też jest odzyskiwany
//   T6  ⚠ KONTROLA MARGINESU: spóźnienie MNIEJSZE niż `STALL_GRACE_YEARS` nie wystarcza
//   T7  pin źródłowy: powód w `DebugLog.TRACKED_EVENTS` (reguła W3), z kontrolą pinu

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const LIVE_EPSILON = 1.4210854715202004e-14;   // resztka z GATE-S4-fresh-gy60 (Finding 244)

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  return core;
}

function setup(core) {
  const empId  = core.empireRegistry.listAll()[0].id;
  const empire = core.empireRegistry.get(empId);
  const cap    = (core.empireRegistry.getColoniesByEmpire(empId) ?? [])
    .find(c => c && !c.isOutpost && c.resourceSystem);
  const els  = core.empireLogisticsSystem;
  const logi = els._ensureLogistics(empire);
  const now  = core.timeSystem.gameTime;
  return { empire, cap, els, logi, now, vm: core.vesselManager };
}

/** Kurier w zadanej pozie. `overdueBy` > 0 ⇒ termin przylotu minął tyle lat temu. */
function courier(core, cap, { overdueBy = 0, dockedAt = null, phase = 'orbiting_body',
                             state = 'orbiting', cargoUsed = 0 } = {}) {
  const v = core.vesselManager.createAndRegister('hull_small', cap.planetId,
    { modules: ['engine_chemical', 'cargo_small'] });
  const now = core.timeSystem.gameTime;
  v.serviceState = 'active';
  v.status = 'on_mission';
  v.position.state = state;
  v.position.dockedAt = dockedAt;
  v.position.x = (EntityManager.get(cap.planetId)?.x ?? 0) + 50;
  v.position.y = (EntityManager.get(cap.planetId)?.y ?? 0) + 50;
  v.cargoUsed = cargoUsed;
  v.mission = {
    type: 'logistics', targetId: 'probe_target', phase,
    departYear: now - overdueBy - 2, arrivalYear: now - overdueBy,
    startX: v.position.x, startY: v.position.y, targetX: v.position.x, targetY: v.position.y,
  };
  return v;
}

/**
 * ⚠ Wywołanie TOLERUJĄCE BRAK METODY — po to, by pomiar fail-first był UCZCIWY: na kodzie
 * sprzed C2 keeper ma paść NA ASERCJACH (widać, ILE i KTÓRE), a nie na `TypeError` w pierwszym
 * teście, po którym nie wiadomo już nic. Po naprawie gałąź `else` jest martwa.
 */
const recover = (els, ...args) =>
  (typeof els._recoverStalledCouriers === 'function' ? els._recoverStalledCouriers(...args) : undefined);

const capture = (name) => {
  const seen = [];
  const h = (p) => seen.push(p);
  EventBus.on(name, h);
  return { seen, stop: () => EventBus.off(name, h) };
};

// ── T1 — PIN DEFEKTU ─────────────────────────────────────────────────────────
console.log('T1 — flaga OFF: zamrożony kadłub NIE jest ruszany (zachowanie sprzed C2)');
{
  const core = boot();
  const { empire, cap, els, logi } = setup(core);
  const v = courier(core, cap, { overdueBy: 40 });
  logi.routes.push({ routeId: 'r_t1', motherId: cap.planetId, outpostId: 'probe_target', courierIds: [v.id] });

  GAME_CONFIG.FEATURES.aiCourierRouteScope = false;
  recover(els, empire, logi, cap);
  GAME_CONFIG.FEATURES.aiCourierRouteScope = true;

  assert(v.mission?.phase === 'orbiting_body',
    `T1: przy OFF poza BEZ ZMIAN (${v.mission?.phase}) — to jest defekt 240`);
  assert(v.position.dockedAt === null, 'T1: …i nadal nie jest nigdzie zadokowany');
}

// ── T2 — NAPRAWA ─────────────────────────────────────────────────────────────
console.log('T2 — flaga ON: kadłub spóźniony o 40 lat wraca do domu, z powodem');
{
  const core = boot();
  const { empire, cap, els, logi } = setup(core);
  const v = courier(core, cap, { overdueBy: 40 });
  logi.routes.push({ routeId: 'r_t2', motherId: cap.planetId, outpostId: 'probe_target', courierIds: [v.id] });

  const capt = capture('logistics:courierRecovered');
  recover(els, empire, logi, cap);
  capt.stop();

  assert(v.mission?.phase === 'returning', `T2: kurier ODZYSKANY — leci do domu (${v.mission?.phase})`);
  assert(v.colonyId === cap.planetId, 'T2: …i jest re-home\'owany na stolicę imperium');
  const ev = capt.seen.find(e => e.vesselId === v.id);
  assert(!!ev, 'T2: wyemitowano `logistics:courierRecovered`');
  assert(ev?.reason === 'stalled_no_dock', `T2: powód = stalled_no_dock (${ev?.reason})`);
  assert((ev?.overdueYears ?? 0) >= 39, `T2: raport niesie SPÓŹNIENIE (${ev?.overdueYears} lat)`);
}

// ── T3 — KONTROLA: zdrowy kurier w locie (z resztką z żywej gry) ─────────────
console.log('T3 — ⚠ KONTROLA: statek W LOCIE (termin w przyszłości) + resztka 1,42e-14 — nietknięty');
{
  const core = boot();
  const { empire, cap, els, logi } = setup(core);
  const v = courier(core, cap, { overdueBy: -5, cargoUsed: LIVE_EPSILON });  // termin za 5 lat
  logi.routes.push({ routeId: 'r_t3', motherId: cap.planetId, outpostId: 'probe_target', courierIds: [v.id] });

  const capt = capture('logistics:courierRecovered');
  recover(els, empire, logi, cap);
  capt.stop();

  assert(v.mission?.phase === 'orbiting_body',
    `T3: poza W LOCIE NIE jest ruszana (${v.mission?.phase})`);
  assert(capt.seen.length === 0, `T3: …i nie ma fałszywego odzysku (${capt.seen.length})`);
  assert(v.cargoUsed === LIVE_EPSILON,
    'T3: kontrola pinu — fixture NAPRAWDĘ niesie resztkę z żywej gry (244)');
}

// ── T4 — KONTROLA: legalne czekanie przy placówce ────────────────────────────
console.log('T4 — ⚠ KONTROLA: kurier CZEKAJĄCY przy placówce (dockedAt = cel) — nietknięty');
{
  const core = boot();
  const { empire, cap, els, logi } = setup(core);
  const v = courier(core, cap, { overdueBy: 40, dockedAt: 'probe_target' });
  logi.routes.push({ routeId: 'r_t4', motherId: cap.planetId, outpostId: 'probe_target', courierIds: [v.id] });

  const capt = capture('logistics:courierRecovered');
  recover(els, empire, logi, cap);
  capt.stop();

  assert(v.mission?.phase === 'orbiting_body',
    `T4: czekanie przy wyczerpanej placówce NIE jest zamrożeniem (${v.mission?.phase})`);
  assert(capt.seen.length === 0, 'T4: …więc watchdog milczy');
}

// ── T5 — kadłub w rezerwie ───────────────────────────────────────────────────
console.log('T5 — kadłub w `reserve` (tam odkłada go C1) też jest odzyskiwany');
{
  const core = boot();
  const { empire, cap, els, logi } = setup(core);
  const v = courier(core, cap, { overdueBy: 44 });
  logi.reserve.push(v.id);

  recover(els, empire, logi, cap);
  assert(v.mission?.phase === 'returning', `T5: rezerwa też objęta (${v.mission?.phase})`);
}

// ── T6 — KONTROLA MARGINESU ──────────────────────────────────────────────────
console.log('T6 — ⚠ KONTROLA MARGINESU: spóźnienie mniejsze niż STALL_GRACE_YEARS nie wystarcza');
{
  const core = boot();
  const { empire, cap, els, logi } = setup(core);
  const v = courier(core, cap, { overdueBy: 0.25 });     // ćwierć roku po terminie
  logi.routes.push({ routeId: 'r_t6', motherId: cap.planetId, outpostId: 'probe_target', courierIds: [v.id] });

  recover(els, empire, logi, cap);
  assert(v.mission?.phase === 'orbiting_body',
    `T6: świeżo spóźniony NIE jest ruszany (${v.mission?.phase}) — chroni przed wyścigiem tiku`);

  // kontrola pinu: ten SAM kurier, spóźniony ponad margines, JEST odzyskiwany
  v.mission.arrivalYear = core.timeSystem.gameTime - 5;
  recover(els, empire, logi, cap);
  assert(v.mission?.phase === 'returning',
    'T6: kontrola pinu — po przekroczeniu marginesu ten sam kadłub JEST odzyskany');
}

// ── T7 — pin źródłowy ────────────────────────────────────────────────────────
console.log('T7 — pin źródłowy: powód w DebugLog.TRACKED_EVENTS (reguła W3)');
{
  const src = readFileSync(new URL('../../core/DebugLog.js', import.meta.url), 'utf8')
    .replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert(src.includes("'logistics:courierRecovered'"), 'T7: `logistics:courierRecovered` śledzony');
  assert(!src.includes("'logistics:odzyskKtoregoNieMa'"),
    'T7: ⚠ kontrola pinu — nieistniejąca nazwa NIE jest „znajdowana"');
}

console.log(`\n${pass}/${pass + fail} OK${fail ? `, ${fail} FAIL` : ''}`);
process.exit(fail ? 1 : 0);
