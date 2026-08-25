// B — UTRZYMANIE FLOTY BEZ DESYGNOWANEGO PŁATNIKA (rozliczenie imperialne).
//
// PO CO: zgłoszenie właściciela (2026-08-24): świeżo zespawnowany statek dostał
// `vessel_immobilized` mimo dodatniego bilansu imperium (+2393,5 Kr/rok, 125022 Kr), a blokada
// odebrała mu ODWRÓT z bitwy. Audyt: kredyty żyją wyłącznie jako `colony.credits`, w całym `src/`
// NIE MA transferu Kr między koloniami gracza, a `_tickVesselMaintenance` grupował flotę po
// JEDNYM imiennym płatniku (`_resolvePayHomeId`) i płacił all-or-nothing z jego sakiewki.
// ⇒ bogate imperium NIE MOGŁO złożyć się na własną flotę. To jest odtworzony headless scenariusz
// S9 „the death spiral" (`docs/design/W2_PLAN.md:414`).
//
// DECYZJA WŁAŚCICIELA (2026-08-25, podpisana): wariant B — znieść desygnowanego płatnika.
// Koszt statku ściągany z DOWOLNEJ koloni gracza, najbogatsza pierwsza, all-or-nothing na CAŁYM
// koszcie (może być złożony z kilku sakiewek). Zdanie „dopóki skarbiec ma kredyty, flota jest
// operacyjna" staje się PRAWDZIWE dosłownie, bo nie istnieje kolonia, która „miała zapłacić
// i nie miała". Wariant C (osobne konto zasilane podatkiem) odłożony jako osobny, przyszły temat.
//
// ⚠ WŁAŚCICIEL PODPISAŁ TEŻ KONSEKWENCJĘ: zatrzask zaległości przestaje być własnością KOLONII.
//   `colonyInArrears(colonyId)` → `fleetInArrears()` (bez argumentu), reason `colony_in_arrears`
//   → `fleet_in_arrears`. Decyzja 17 z W2_PLAN (rezerwa NIE zalega, bramkujemy ROZMIESZCZENIE)
//   zostaje w mocy — zmienia się wyłącznie ZASIĘG zatrzasku.
//
// ⚠ ODRZUCONO PO POMIARZE — „`_resolvePayHomeId` zawsze zwraca stolicę" (pierwotny pomysł
//   właściciela). Ponieważ podatek ZOSTAJE LOKALNIE (`ColonyManager.js:1838`), centralizacja na
//   stolicy KONCENTRUJE KOSZT, nie koncentrując dochodu: imperium, w którym dwie kolonie mają
//   nadwyżkę a stolica nie, unieruchomiłoby flotę SZYBCIEJ niż przed zmianą. Pin: B1 + B3.
//
// ⚠ `_resolvePayHomeId` ZOSTAJE ŻYWE i nietknięte — jest teraz resolverem ATRYBUCJI (UI, „BAZA"),
//   nie ścieżką pieniądza. Dlatego keeper Findingu 97 (`fleet_upkeep_payer_smoke` F1/F2/F4/F5)
//   dalej czegoś strzeże, a termin własności wchodzi do nowej ścieżki OSOBNO — przez
//   `getPlayerColonies()` (kanon `ColonyOwnership`). Pin: B5.
//
// FAIL-FIRST: napisane PRZED implementacją. Na kodzie sprzed zmiany B1/B3/B4/B6/B9/B10/A1 PADAJĄ;
// B2 pada z braku funkcji; B5/B7/B8 są KONTROLĄ PINU i muszą być zielone PRZED i PO.
//
// Uruchom: node src/testing/smoke/fleet_upkeep_imperial_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import { GameCore } from '../headless/GameCore.js';
import EntityManager from '../../core/EntityManager.js';
import EventBus from '../../core/EventBus.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const EMP = 'emp_001';

// Dwie DODATKOWE kolonie gracza + jedna AI w tym samym układzie co stolica.
function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  window.KOSMOS.civMode = true;
  const cm = core.colonyManager;
  const home = window.KOSMOS.homePlanet;
  const free = EntityManager.getAll().filter(e =>
    e.systemId === home.systemId && e.id !== home.id &&
    (e.type === 'planet' || e.type === 'moon') && !cm.getColony(e.id));
  const sisterA = cm.getColony(cm.createColony(free[0].id, { Fe: 100 }, 8, 0).planetId);
  const sisterB = cm.getColony(cm.createColony(free[1].id, { Fe: 100 }, 8, 0).planetId);
  const ai      = cm.getColony(cm.createColony(free[2].id, { Fe: 100 }, 8, 0, EMP).planetId);
  const capital = cm.getColony(home.id);
  const vm = core.vesselManager ?? window.KOSMOS.vesselManager;
  // Zeruj WSZYSTKIE portfele — każdy test ustawia własną aranżację jawnie.
  for (const c of cm.getAllColonies()) c.credits = 0;
  return { core, cm, home, capital, sisterA, sisterB, ai, vm };
}

const kr    = (c) => c.credits ?? 0;
const total = (cm) => cm.getPlayerColonies().reduce((s, c) => s + (c.credits ?? 0), 0);

// Jedno rozliczenie roczne — przez PRAWDZIWĄ metodę, nie przez atrapę.
const settle = (vm) => { vm._maintenanceAccum = 0; vm._tickVesselMaintenance(1.0); };

// Statek gracza W SŁUŻBIE, zadokowany w stolicy.
function ship(vm, homeId, hull = 'hull_frigate', extra = {}) {
  const v = vm.createAndRegister(hull, homeId, { serviceState: 'active', ...extra });
  v.position.state = 'docked';
  v.position.dockedAt = homeId;
  return v;
}

// ── B1 — bogata SIOSTRA płaci za statek zadomowiony w ubogiej stolicy ────────────────────────
console.log('B1 — imperium składa się na flotę: pusta stolica, bogata siostra ⇒ rachunek OPŁACONY');
{
  const { vm, capital, sisterA } = boot();
  const v = ship(vm, capital.planetId);
  const cost = vm.getVesselUpkeepCredits(v);
  capital.credits = 0;
  sisterA.credits = cost * 5;

  settle(vm);

  assert((v.unpaidYears ?? 0) === 0,
    `B1: statek NIE zalega mimo pustej stolicy (unpaidYears=${v.unpaidYears ?? 0})`);
  assert(kr(sisterA) === cost * 5 - cost,
    `B1: zapłaciła SIOSTRA (${cost * 5} → ${kr(sisterA)}, koszt ${cost})`);
  assert(kr(capital) === 0, 'B1: pusta stolica nie zeszła poniżej zera');
}

// ── B2 — najbogatsza sakiewka pierwsza ──────────────────────────────────────────────────────
console.log('B2 — kolejność poboru: najbogatsza kolonia pierwsza');
{
  const { vm, capital, sisterA, sisterB } = boot();
  const v = ship(vm, capital.planetId);
  const cost = vm.getVesselUpkeepCredits(v);
  capital.credits = cost * 2;
  sisterA.credits = cost * 10;      // najbogatsza
  sisterB.credits = cost * 3;

  settle(vm);

  assert(kr(sisterA) === cost * 10 - cost, `B2: pobrano z najbogatszej (sisterA → ${kr(sisterA)})`);
  assert(kr(capital) === cost * 2, 'B2: stolica NIETKNIĘTA, bo była uboższa');
  assert(kr(sisterB) === cost * 3,  'B2: sisterB NIETKNIĘTA');
}

// ── B3 — koszt ZŁOŻONY z kilku sakiewek, gdy żadna sama nie wystarcza ────────────────────────
console.log('B3 — rachunek składany z wielu kolonii (żadna pojedynczo nie pokrywa)');
{
  const { vm, cm, capital, sisterA, sisterB } = boot();
  const v = ship(vm, capital.planetId);
  const cost = vm.getVesselUpkeepCredits(v);
  // 3 × (cost/3 + 1) > cost, ale KAŻDA z osobna < cost
  const each = Math.floor(cost / 3) + 1;
  capital.credits = each; sisterA.credits = each; sisterB.credits = each;
  const before = total(cm);

  settle(vm);

  assert((v.unpaidYears ?? 0) === 0,
    `B3: opłacony ze złożonych sakiewek (unpaidYears=${v.unpaidYears ?? 0})`);
  assert(before - total(cm) === cost,
    `B3: pobrano DOKŁADNIE koszt, ani grosza więcej (${before} → ${total(cm)}, koszt ${cost})`);
}

// ── B4 — suma niewystarczająca ⇒ NIC nie pobrane (brak częściowego obciążenia) ───────────────
console.log('B4 — all-or-nothing na CAŁYM koszcie: za mało w imperium ⇒ zero poboru');
{
  const { vm, cm, capital, sisterA } = boot();
  const v = ship(vm, capital.planetId);
  const cost = vm.getVesselUpkeepCredits(v);
  capital.credits = Math.floor(cost / 3);
  sisterA.credits = Math.floor(cost / 3);   // razem < cost
  const before = total(cm);

  settle(vm);

  assert(total(cm) === before,
    `B4: NIC nie pobrane przy niedoborze (${before} → ${total(cm)}) — brak częściowego obciążenia`);
  assert((v.unpaidYears ?? 0) === 1, `B4: zaległość narosła (unpaidYears=${v.unpaidYears ?? 0})`);
}

// ── B5 — KONTROLA PINU: kolonie AI NIGDY nie zasilają floty gracza (Finding 97) ──────────────
console.log('B5 KONTROLA PINU — kolonia AI nie płaci za flotę gracza (Finding 97 zachowany)');
{
  const { vm, capital, ai } = boot();
  const v = ship(vm, capital.planetId);
  const cost = vm.getVesselUpkeepCredits(v);
  ai.credits = cost * 100;      // wróg opływa w Kr
  capital.credits = 0;          // gracz nie ma nic

  settle(vm);

  assert(kr(ai) === cost * 100, `B5: portfel AI NIETKNIĘTY (${kr(ai)})`);
  assert((v.unpaidYears ?? 0) === 1, 'B5: statek zalega, bo imperium GRACZA jest puste');
}

// ── B6 — brak desygnowanego płatnika NIE czyni floty darmową (zamknięcie pinu F6) ────────────
console.log('B6 — statek bez rozwiązywalnego płatnika JEST obciążany (F6 zamknięty)');
{
  const { vm, capital, sisterA } = boot();
  const v = ship(vm, capital.planetId);
  v.homeColonyId = 'p_nieistniejaca';          // dom nie do rozwiązania
  window.KOSMOS.homePlanet = null;             // i fallback też pada
  const cost = vm.getVesselUpkeepCredits(v);
  sisterA.credits = cost * 5;

  settle(vm);

  assert(kr(sisterA) === cost * 5 - cost,
    `B6: rachunek opłacony mimo braku płatnika nominalnego (${kr(sisterA)})`);
  assert((v.unpaidYears ?? 0) === 0, 'B6: brak zaległości — flota NIE jest darmowa');
}

// ── B7 — KONTROLA PINU: rezerwa nadal NIE zalega (decyzja 17) ────────────────────────────────
console.log('B7 KONTROLA PINU — kadłub w rezerwie nie narasta zaległości');
{
  const { vm, capital } = boot();
  const stored = ship(vm, capital.planetId, 'hull_frigate', { serviceState: 'stored' });
  stored.serviceState = 'stored';
  const active = ship(vm, capital.planetId);
  for (const c of window.KOSMOS.colonyManager.getPlayerColonies()) c.credits = 0;

  settle(vm);

  assert((stored.unpaidYears ?? 0) === 0, 'B7: REZERWA nie zalega mimo pustego imperium');
  assert((active.unpaidYears ?? 0) === 1, 'B7 KONTROLA PINU: SŁUŻBA zalega normalnie');
}

// ── B8 — KONTROLA PINU: służba pierwsza, potem najtańszy (jedna lista) ───────────────────────
console.log('B8 KONTROLA PINU — przy niedoborze bez opłaty zostaje REZERWA, nie obrońca');
{
  const { vm, capital } = boot();
  const stored = ship(vm, capital.planetId, 'hull_cruiser', { serviceState: 'stored' });
  stored.serviceState = 'stored';
  const active = ship(vm, capital.planetId, 'hull_frigate');
  // Stać imperium DOKŁADNIE na jeden rachunek — służby.
  capital.credits = vm.getVesselUpkeepCredits(active);

  settle(vm);

  assert((active.unpaidYears ?? 0) === 0, 'B8: okręt w SŁUŻBIE opłacony pierwszy');
  assert(kr(capital) === 0, 'B8: sakiewka wyczerpana dokładnie przez służbę');
}

// ── B9 — zatrzask jest IMPERIALNY: fleetInArrears() bez argumentu, tylko SŁUŻBA ──────────────
console.log('B9 — `fleetInArrears()` (bez argumentu) + liczy wyłącznie statki w SŁUŻBIE');
{
  const { vm, capital } = boot();
  assert(typeof vm.fleetInArrears === 'function', 'B9: metoda `fleetInArrears` istnieje');
  assert(vm.fleetInArrears?.() === false, 'B9 KONTROLA PINU: bez długu flota NIE zalega');

  const stored = ship(vm, capital.planetId, 'hull_frigate', { serviceState: 'stored' });
  stored.serviceState = 'stored';
  stored.unpaidYears = 5;                       // dług NA REZERWIE
  assert(vm.fleetInArrears?.() === false,
    'B9: dług na REZERWIE nie zatrzaskuje floty (docstring obiecywał „w służbie" — teraz egzekwowane)');

  const active = ship(vm, capital.planetId);
  active.unpaidYears = 1;
  assert(vm.fleetInArrears?.() === true, 'B9: dług na SŁUŻBIE zatrzaskuje flotę');
}

// ── B10 — deployVessel odmawia z powodem `fleet_in_arrears` ──────────────────────────────────
console.log('B10 — rozmieszczenie odmówione przy zaległości floty, z nowym powodem');
{
  const { vm, capital } = boot();
  const debtor = ship(vm, capital.planetId);
  debtor.unpaidYears = 1;
  const stored = ship(vm, capital.planetId, 'hull_frigate', { serviceState: 'stored' });
  stored.serviceState = 'stored';
  capital.credits = 100000;                     // pieniądze SĄ — blokuje zatrzask, nie saldo

  const res = vm.deployVessel?.(stored.id);
  assert(res?.ok === false, 'B10: deploy odmówiony');
  assert(res?.reason === 'fleet_in_arrears',
    `B10: powód to \`fleet_in_arrears\` (dostano: ${res?.reason})`);
}

// ── A1 — nieudane rozliczenie MÓWI (dziś rośnie w ciszy) ─────────────────────────────────────
console.log('A1 — nieopłacony rok emituje zdarzenie (koniec cichego odliczania)');
{
  const { vm, capital } = boot();
  const v = ship(vm, capital.planetId);
  capital.credits = 0;
  const seen = [];
  const off = EventBus.on('fleet:upkeepUnpaid', (p) => seen.push(p));

  settle(vm);
  if (typeof off === 'function') off();

  assert(seen.length === 1, `A1: dokładnie jedno zdarzenie (dostano ${seen.length})`);
  assert(seen[0]?.vesselId === v.id, 'A1: zdarzenie niesie id statku');
  assert((seen[0]?.unpaidYears ?? 0) === 1, 'A1: zdarzenie niesie licznik zaległości');
  assert(typeof seen[0]?.shortfall === 'number' && seen[0].shortfall > 0,
    `A1: zdarzenie niesie BRAKUJĄCĄ kwotę (${seen[0]?.shortfall}) — gracz ma wiedzieć ILE dołożyć`);
}

console.log(`\n[fleet_upkeep_imperial_smoke] PASS ${pass} / FAIL ${fail}`);
process.exit(fail > 0 ? 1 : 0);
