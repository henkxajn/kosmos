// N1 — WYJŚCIE Z ZALEGŁOŚCI: kara znaczy „imperium jest TERAZ niewypłacalne".
//
// PO CO (zgłoszenie właściciela + pomiar na żywo 2026-08-27): flota stała unieruchomiona przy
// skarbcu 38 441 Kr, z licznikiem „Nieopłacone: 9 lat". Instrumentacja żywej gry pokazała, że
// ścieżka pieniądza jest ZDROWA — wymuszone rozliczenie opłaciło 13/13 i zdjęło zatrzask, a
// kolejnych SIEDEM naturalnych rozliczeń przebiegło czysto (13/13, 0 rzutów). Zaległość była
// SKAMIELINĄ po starym modelu (`5c6887b^`: cały rachunek floty szedł na JEDNĄ sakiewkę, więc
// przy pustym Mstow płaciły tylko trzy najtańsze kadłuby, mimo bogatego imperium).
//
// DEFEKT, KTÓRY ZOSTAŁ: rozliczenie leci raz na ROK GRY, a zatrzask zdejmuje wyłącznie udana
// płatność (decyzja 17 z W2_PLAN). Do tego `_maintenanceAccum` NIE jest serializowany, więc
// kara przeżywa wczytanie, a lekarstwo nie. Gracz, który odzyskał płynność, stał z paraliżem
// do następnego rozliczenia — przy 1 d/s ~6 minut realnych z pełnym skarbcem, bez licznika
// i bez sprawczości. W drugą stronę było równie ostro: przy tempie 1 rozliczenie leci raz na
// SEKUNDĘ realną, więc dziewięć „lat" długu narosło w ~9 sekund.
//
// DECYZJA WŁAŚCICIELA (2026-08-27): ponowienie spłaty dla ZALEGAJĄCYCH raz na civYear
// (= miesiąc gry). Decyzja 17 zostaje co do treści — zatrzask dalej zdejmuje wyłącznie UDANA
// płatność; zmienia się KADENCJA prób. Skutek uboczny (pożądany): każdy zatrzask ze starego
// zapisu rozpuszcza się sam po chwili wypłacalnej gry ⇒ migracja save NIEPOTRZEBNA.
//
// ⚠ ŚWIADOMIE NIE ZMIENIAMY: wysokości kary, `UPKEEP_GRACE_YEARS`, `_tickVesselMaintenance`,
//   `spendFromTreasury`, formatu zapisu (v101). Bankructwo dalej paraliżuje flotę — tylko
//   trzeba być niewypłacalnym MIMO dwunastu prób, a nie trafić w jedną pechową klatkę.
//
// FAIL-FIRST — w najostrzejszej postaci, ZWERYFIKOWANE: `git show HEAD:src/systems/VesselManager.js
// | grep -c _tickArrearsRetry` = 0, więc przed tym commitem metody NIE MA i keeper nie ma jak
// przejść (każdy przypadek rzuca TypeError na `retry()`). ⚠ Dlatego R2 NIE jest kontrolą pinu
// „zielona przed i po" — na starym kodzie też by padła. R2 kontroluje COŚ INNEGO i ważniejszego:
// że naprawa nie polega na SKASOWANIU KARY. Niewypłacalne imperium ma dalej zbierać zaległości
// i dalej mieć unieruchomioną flotę — gdyby ktoś kiedyś „uprościł" ponowienie do bezwarunkowego
// zerowania licznika, R2 zapali się na czerwono, a reszta pinów przejdzie jak gdyby nigdy nic.
//
// Uruchom: node src/testing/smoke/fleet_upkeep_recovery_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import { GameCore } from '../headless/GameCore.js';
import EntityManager from '../../core/EntityManager.js';
import EventBus from '../../core/EventBus.js';
import { VesselManager } from '../../systems/VesselManager.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  window.KOSMOS.civMode = true;
  const cm = core.colonyManager;
  const home = window.KOSMOS.homePlanet;
  const capital = cm.getColony(home.id);
  const vm = core.vesselManager ?? window.KOSMOS.vesselManager;
  // Zeruj WSZYSTKIE portfele — każdy test ustawia własną aranżację jawnie.
  for (const c of cm.getAllColonies()) c.credits = 0;
  return { core, cm, capital, vm };
}

const total = (cm) => cm.getPlayerColonies().reduce((s, c) => s + (c.credits ?? 0), 0);

// Jedno ROZLICZENIE roczne i jedno PONOWIENIE — przez PRAWDZIWE metody, nie przez atrapy.
const settle = (vm) => { vm._maintenanceAccum = 0; vm._tickVesselMaintenance(1.0); };
const retry  = (vm) => { vm._arrearsRetryAccum = 0; vm._tickArrearsRetry(VesselManager.ARREARS_RETRY_CIVYEARS); };

// Statek gracza, domyślnie W SŁUŻBIE i z zaległością (stan po nieudanym rozliczeniu).
function ship(vm, homeId, hull = 'hull_frigate', { unpaid = 0, ...extra } = {}) {
  const v = vm.createAndRegister(hull, homeId, { serviceState: 'active', ...extra });
  v.position.state = 'docked';
  v.position.dockedAt = homeId;
  v.unpaidYears = unpaid;
  return v;
}

// ── R1 — wypłacalne imperium zdejmuje kartę w ciągu MIESIĄCA gry ────────────────────────────
console.log('R1 — zaległość + wypłacalny skarbiec ⇒ ponowienie spłaca i odblokowuje');
{
  const { vm, cm, capital } = boot();
  const v = ship(vm, capital.planetId, 'hull_frigate', { unpaid: 5 });
  const cost = vm.getVesselUpkeepCredits(v);
  capital.credits = cost * 10;
  const before = total(cm);
  const seen = [];
  const off = EventBus.on('fleet:arrearsCleared', (p) => seen.push(p));

  assert(vm.isImmobilized(v) === true, 'R1 KONTROLA PINU: statek NAPRAWDĘ jest unieruchomiony przed próbą');
  retry(vm);
  if (typeof off === 'function') off();

  assert((v.unpaidYears ?? 0) === 0, `R1: zaległość zdjęta (unpaidYears=${v.unpaidYears ?? 0})`);
  assert(vm.isImmobilized(v) === false, 'R1: statek znów operacyjny');
  assert(total(cm) === before - cost, `R1: skarbiec zapłacił bieżącą stawkę (${before} → ${total(cm)}, koszt ${cost})`);
  assert(seen.length === 1 && seen[0]?.vesselId === v.id, 'R1: poszło zdarzenie z id statku');
  assert(seen[0]?.wasImmobilized === true,
    'R1: zdarzenie mówi, że coś RUSZYŁO z miejsca (UI toastuje tylko wtedy)');
}

// ── R2 — KONTROLA PINU: niewypłacalne imperium dalej płaci karę ──────────────────────────────
console.log('R2 KONTROLA PINU — pusty skarbiec: kara ZOSTAJE i dalej narasta');
{
  const { vm, capital } = boot();
  const v = ship(vm, capital.planetId, 'hull_frigate', { unpaid: 5 });
  capital.credits = 0;

  retry(vm);
  assert((v.unpaidYears ?? 0) === 5, `R2: ponowienie NIC nie umorzyło (unpaidYears=${v.unpaidYears ?? 0})`);
  assert(vm.isImmobilized(v) === true, 'R2: statek dalej unieruchomiony');

  settle(vm);
  assert((v.unpaidYears ?? 0) === 6, `R2: roczne rozliczenie dalej podbija licznik (${v.unpaidYears ?? 0})`);
}

// ── R3 — zdrowy statek nietknięty (zero podwójnego poboru w tym samym roku) ──────────────────
console.log('R3 — statek BEZ zaległości nie płaci przy ponowieniu');
{
  const { vm, cm, capital } = boot();
  const v = ship(vm, capital.planetId, 'hull_frigate', { unpaid: 0 });
  capital.credits = 10000;
  const before = total(cm);

  retry(vm);

  assert(total(cm) === before, `R3: skarbiec nietknięty (${before} → ${total(cm)})`);
  assert((v.unpaidYears ?? 0) === 0, 'R3: licznik dalej zerowy');
}

// ── R4 — REZERWA pominięta (decyzja 17: rezerwa nie zalega) ──────────────────────────────────
console.log('R4 — kadłub w rezerwie z zaległością ze starego zapisu: ponowienie go NIE dotyka');
{
  const { vm, cm, capital } = boot();
  const stored = ship(vm, capital.planetId, 'hull_frigate', { unpaid: 4, serviceState: 'stored' });
  capital.credits = 10000;
  const before = total(cm);

  retry(vm);

  assert((stored.unpaidYears ?? 0) === 4, `R4: licznik rezerwy nietknięty (${stored.unpaidYears ?? 0})`);
  assert(total(cm) === before, 'R4: rezerwa nic nie kosztowała przy ponowieniu');
}

// ── R5 — częściowa płynność: najtańszy pierwszy, reszta czeka (break, nie continue) ──────────
console.log('R5 — skarbiec na jeden kadłub: odblokowany NAJTAŃSZY, droższy czeka');
{
  const { vm, cm, capital } = boot();
  const cheap = ship(vm, capital.planetId, 'hull_small', { unpaid: 3 });
  const heavy = ship(vm, capital.planetId, 'hull_large', { unpaid: 3 });
  const cheapCost = vm.getVesselUpkeepCredits(cheap);
  const heavyCost = vm.getVesselUpkeepCredits(heavy);
  assert(cheapCost < heavyCost, `R5 KONTROLA PINU: kadłuby mają RÓŻNE stawki (${cheapCost} < ${heavyCost})`);
  capital.credits = cheapCost;               // starcza dokładnie na jeden, tańszy

  retry(vm);

  assert((cheap.unpaidYears ?? 0) === 0, `R5: tańszy odblokowany (${cheap.unpaidYears ?? 0})`);
  assert((heavy.unpaidYears ?? 0) === 3, `R5: droższy dalej zalega (${heavy.unpaidYears ?? 0})`);
  assert(total(cm) === 0, `R5: pobrano dokładnie tyle, ile było (${total(cm)})`);
}

// ── R6 — KADENCJA: ponowienie leci raz na CIV-ROK, nie co tik ────────────────────────────────
console.log('R6 — akumulator: pół civYear nie wystarcza, dwa razy pół już tak');
{
  const { vm, capital } = boot();
  const v = ship(vm, capital.planetId, 'hull_frigate', { unpaid: 3 });
  capital.credits = 10000;
  vm._arrearsRetryAccum = 0;

  vm._tickArrearsRetry(VesselManager.ARREARS_RETRY_CIVYEARS / 2);
  assert((v.unpaidYears ?? 0) === 3, 'R6: pół okresu — jeszcze nic się nie dzieje');

  vm._tickArrearsRetry(VesselManager.ARREARS_RETRY_CIVYEARS / 2);
  assert((v.unpaidYears ?? 0) === 0, 'R6: po dopełnieniu okresu — spłacone');
}

console.log(`\n[fleet_upkeep_recovery_smoke] PASS ${pass} / FAIL ${fail}`);
process.exit(fail > 0 ? 1 : 0);
