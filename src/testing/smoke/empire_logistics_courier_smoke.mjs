// W1 — keeper zatrzasku kuriera (commit W1-6, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: audyt V20 wykazał, że `empire.logistics.pendingBuildRoute` jest zatrzaskiem
// JEDNOKIERUNKOWYM — ustawianym przy zleceniu budowy kuriera, zdejmowanym WYŁĄCZNIE gdy
// statek się urodzi albo gdy trasa/stolica zginie. Zlecenie, które ugrzęźnie w kolejce
// (brak surowców; a od Director S6 okręty wojenne konkurują o TĘ SAMĄ stocznię poziomu 1
// stolicy), blokowało produkcję kurierów tego imperium NA ZAWSZE. Do tego `fleet:buildFailed`
// nie miał po stronie logistyki ŻADNEGO słuchacza.
// ⚠ Ta ścieżka NIE MIAŁA DOTĄD ŻADNEGO POKRYCIA SMOKE — to jest jej pierwsze.
//
//   T1  odmowa budowy (`fleet:buildFailed`) zwalnia zatrzask NATYCHMIAST
//   T2  zatrzask ma TTL — wisząc dłużej niż `PENDING_BUILD_TTL_YEARS` zwalnia się sam
//   T3  ⚠ KONTROLA PINU: PRZED upływem TTL zatrzask NADAL trzyma (inaczej „zwalnia się"
//       byłoby nieodróżnialne od „nigdy nie blokował")
//   T4  po zwolnieniu druga trasa MOŻE zamówić kuriera (sedno defektu)
//   T5  zwolnienie zatrzasku NIE anuluje zlecenia — to dwie różne rzeczy

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EventBus from '../../core/EventBus.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  return core;
}

/** Imperium + jego blok logistyki z ustawionym zatrzaskiem. */
function latched(core, { since = 0, routeId = 'r_test' } = {}) {
  const logi = core.empireLogisticsSystem;
  const empire = core.empireRegistry.listAll()[0];
  const block = logi._ensureLogistics(empire);
  block.routes = [{ routeId, motherId: 'entity_test_capital', outpostId: 'entity_test_outpost', courierIds: [] }];
  block.pendingBuildRoute = routeId;
  block.pendingBuildSince = since;
  return { logi, empire, block };
}

// ── T1 — fleet:buildFailed zwalnia natychmiast ──────────────────────────────
console.log('T1 — odmowa budowy zwalnia zatrzask NATYCHMIAST');
{
  const core = boot();
  const { block, empire } = latched(core, { since: core.timeSystem.gameTime });

  assert(block.pendingBuildRoute === 'r_test', 'T1: zatrzask ZAMKNIĘTY na starcie testu');

  const released = [];
  const onRel = (p) => released.push(p);
  EventBus.on('logistics:pendingBuildReleased', onRel);
  // Bez `planetId` — starsze emisje go nie niosą; zwalniamy wtedy zachowawczo.
  EventBus.emit('fleet:buildFailed', { reason: 'insufficient_resources' });
  EventBus.off('logistics:pendingBuildReleased', onRel);

  assert(block.pendingBuildRoute === null,
    `T1: zatrzask ZWOLNIONY po fleet:buildFailed (${block.pendingBuildRoute})`);
  assert(released.some(r => r.empireId === empire.id),
    'T1: …i wyemitowane `logistics:pendingBuildReleased` z id imperium');
}

// ── T2/T3 — TTL + kontrola pinu ─────────────────────────────────────────────
console.log('T2/T3 — TTL zwalnia zatrzask; PRZED upływem TTL nadal trzyma');
{
  const core = boot();
  const logiSys = core.empireLogisticsSystem;
  const now = core.timeSystem.gameTime;

  // T3 — KONTROLA PINU: świeży zatrzask MUSI trzymać. Bez tego T2 nie dowodziłby niczego,
  //      bo „zwalnia się" byłoby nieodróżnialne od „nigdy nie blokował".
  const fresh = latched(core, { since: now });
  const heldFresh = logiSys._expirePendingBuild(fresh.block, fresh.empire.id);
  assert(heldFresh === false && fresh.block.pendingBuildRoute === 'r_test',
    'T3 KONTROLA PINU: ŚWIEŻY zatrzask NIE jest zwalniany — TTL naprawdę czeka');

  // T2 — zatrzask sprzed 99 lat gry wygasa.
  const stale = latched(core, { since: now - 99, routeId: 'r_stale' });
  const expired = [];
  const onExp = (p) => expired.push(p);
  EventBus.on('logistics:pendingBuildExpired', onExp);
  const releasedStale = logiSys._expirePendingBuild(stale.block, stale.empire.id);
  EventBus.off('logistics:pendingBuildExpired', onExp);

  assert(releasedStale === true && stale.block.pendingBuildRoute === null,
    'T2: zatrzask wiszący ponad TTL zwalnia się SAM');
  assert(expired.some(e => e.routeId === 'r_stale'),
    'T2: …i emituje `logistics:pendingBuildExpired` z id trasy');
}

// ── T4 — po zwolnieniu MOŻNA zamówić kolejnego kuriera ──────────────────────
console.log('T4 — po zwolnieniu zatrzasku kolejne zlecenie jest MOŻLIWE');
{
  const core = boot();
  const logiSys = core.empireLogisticsSystem;
  const now = core.timeSystem.gameTime;
  const { block, empire } = latched(core, { since: now - 99 });

  // Warunek z dyspozytora: `logi.pendingBuildRoute == null` bramkuje KAŻDE kolejne zlecenie.
  assert(block.pendingBuildRoute != null, 'T4: przed zwolnieniem bramka dyspozytora jest ZAMKNIĘTA');
  logiSys._expirePendingBuild(block, empire.id);
  assert(block.pendingBuildRoute == null,
    'T4: po zwolnieniu bramka OTWARTA — to jest dokładnie ten defekt, który blokował produkcję ' +
    'kurierów imperium do końca partii');

  // Ponowne ustawienie zatrzasku nadpisuje stempel — stary nie „zatruwa" nowego zlecenia.
  block.pendingBuildRoute = 'r_next';
  block.pendingBuildSince = core.timeSystem.gameTime;
  assert(logiSys._expirePendingBuild(block, empire.id) === false,
    'T4: NOWY zatrzask liczy TTL od nowa (stary stempel nie przenosi się na kolejne zlecenie)');
}

// ── T5 — zwolnienie ≠ anulowanie ────────────────────────────────────────────
console.log('T5 — zwolnienie zatrzasku NIE anuluje zlecenia w stoczni');
{
  const core = boot();
  const logiSys = core.empireLogisticsSystem;
  const cm = core.colonyManager;
  const { block, empire } = latched(core, { since: core.timeSystem.gameTime - 99 });

  const anyColony = cm.getAllColonies()[0];
  const pendingBefore = (anyColony?.pendingShipOrders ?? []).length;
  const queuesBefore  = (anyColony?.shipQueues ?? []).length;

  logiSys._expirePendingBuild(block, empire.id);

  assert((anyColony?.pendingShipOrders ?? []).length === pendingBefore
      && (anyColony?.shipQueues ?? []).length === queuesBefore,
    'T5: kolejki stoczni BEZ ZMIAN — TTL przestaje BLOKOWAĆ kolejne zlecenia, ale nie kasuje ' +
    'już opłaconego builda (gdyby się dokończył, `_onVesselCreatedClaim` i tak go przejmie)');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
