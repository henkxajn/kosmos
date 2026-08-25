// Finding 97 / OG-3b — PŁATNIK UTRZYMANIA FLOTY: kolonia WROGA nie płaci za statki gracza.
//
// PO CO: `docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md` §Findings 97 (zakres podpisany 2026-08-22:
// wchodzi do części II jako WŁASNY commit). ZMIERZONE wykonaniem przed naprawą: 300 Kr w jednym
// rozliczeniu, 5000 → 3094 Kr przez 80 lat gry, `unpaidYears` stale 0, własna kolonia gracza
// NIETKNIĘTA. Czyli statki gracza były utrzymywane z magazynu WROGA.
//
// ⚠ CZWARTA POWIERZCHNIA, POZA A/B/C TEGO PLANU. Nie szyna zdarzeń (D2), nie wskaźniki globalne
//   (D1/D3), nie UI (D4) — tylko ROZLICZENIE OKRESOWE (`VesselManager._resolvePayHomeId` +
//   `CivilianTradeSystem.spendCredits`). Dlatego osobny commit i osobny keeper.
//
// ⚠ TEN SAM WZÓR, KTÓRY P0 NAPRAWIŁO JUŻ DWA RAZY: „test PRZYNALEŻNOŚCI zamiast WŁASNOŚCI +
//   fallback na nigdy nieprzecelowywany `homePlanet`". Bliźniaki: `removeColony:667` (P0-D)
//   i wybór aktywnej koloni po wczytaniu (P0-A). Po W3-1 przejęta kolonia ZOSTAJE w `_colonies`,
//   więc `getColony` ją znajduje — i płaci.
//
// ⚠ DOWÓD JEST END-TO-END, NIE NA ZWROTCE. F3 przepuszcza prawdziwy `_tickVesselMaintenance`
//   i mierzy KREDYTY obu kolonii. Sama zwrotka `_resolvePayHomeId` nie dowodzi, że pieniądze
//   przestały wychodzić z cudzego portfela.
//
// Uruchom: node src/testing/smoke/fleet_upkeep_payer_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import { GameCore } from '../headless/GameCore.js';
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager } from '../../systems/ColonyManager.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const EMP = 'emp_001';

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  window.KOSMOS.civMode = true;
  const cm = core.colonyManager;
  const home = window.KOSMOS.homePlanet;
  const body = EntityManager.getAll().find(e =>
    e.systemId === home.systemId && e.id !== home.id &&
    (e.type === 'planet' || e.type === 'moon') && !cm.getColony(e.id));
  const ai = cm.getColony(cm.createColony(body.id, { Fe: 500 }, 8, 0, EMP).planetId);
  const player = cm.getColony(home.id);
  return { core, cm, home, player, ai, vm: core.vesselManager ?? window.KOSMOS.vesselManager };
}

const credits = (colonyId) => window.KOSMOS?.civilianTradeSystem?.getCredits?.(colonyId) ?? 0;
// Kredyty to ZWYKLE POLE koloni (`colony.credits`) — `CivilianTradeSystem` ma tylko getter
// i `spendCredits`. Pierwsza wersja tego helpera zakladala `addCredits` i po cichu NIE PODNOSILA
// salda, przez co F3/F7 mierzyly zera i przechodzily JALOWO.
const setCredits = (colonyId, v) => {
  const col = window.KOSMOS.colonyManager.getColony(colonyId);
  if (col) col.credits = v;
};

// ── F1 — kolonia AI NIE jest płatnikiem ───────────────────────────────────────────────────
console.log('F1 — statek „zadomowiony" na koloni AI nie wskazuje jej jako płatnika');
{
  const { cm, vm, ai, home } = boot();
  const v = vm.createAndRegister('science_vessel', home.id, {});
  v.homeColonyId = ai.planetId;                    // dokładnie to, co robi `_onColonyDestroyed`
  assert(ColonyManager.isPlayerColony(ai) === false, 'F1 przesłanka: kolonia jest AI');
  assert(cm.getColony(ai.planetId) === ai, 'F1 przesłanka: po W3-1 kolonia AI ZOSTAJE w rejestrze');

  const payer = vm._resolvePayHomeId(v, cm);
  assert(payer !== ai.planetId, 'F1: płatnikiem NIE jest kolonia wroga');
  assert(payer === null || ColonyManager.isPlayerColony(cm.getColony(payer)),
    'F1: wskazany płatnik (jeśli jest) należy do GRACZA');
}

// ── F2 — KONTROLA PINU: własna kolonia nadal płatnikiem ───────────────────────────────────
console.log('F2 (KONTROLA PINU) — własna kolonia nadal jest płatnikiem');
{
  const { cm, vm, home, player } = boot();
  const v = vm.createAndRegister('science_vessel', home.id, {});
  v.homeColonyId = player.planetId;
  assert(vm._resolvePayHomeId(v, cm) === player.planetId, 'F2: kolonia gracza rozwiązana jako płatnik');
}

// ── F3 — DOWÓD END-TO-END: kredyty ────────────────────────────────────────────────────────
console.log('F3 (END-TO-END) — po rozliczeniu portfel wroga NIETKNIĘTY, portfel gracza płaci');
{
  const { cm, vm, home, player, ai } = boot();
  const v = vm.createAndRegister('science_vessel', home.id, {});
  v.homeColonyId = ai.planetId;
  const cost = vm.getVesselUpkeepCredits(v);
  assert(cost > 0, `F3 przesłanka: statek faktycznie coś kosztuje (${cost} Kr/rok)`);

  setCredits(ai.planetId, 5000);
  setCredits(player.planetId, 5000);
  const aiBefore = credits(ai.planetId);
  const plBefore = credits(player.planetId);

  vm._maintenanceAccum = 0;
  vm._tickVesselMaintenance(1.0);                  // pełne rozliczenie roczne, prawdziwa ścieżka

  assert(credits(ai.planetId) === aiBefore,
    `F3: portfel koloni WROGA nietknięty (${aiBefore} → ${credits(ai.planetId)})`);
  assert(credits(player.planetId) < plBefore,
    `F3 (kontrola pinu): portfel GRACZA zapłacił (${plBefore} → ${credits(player.planetId)})`);
}

// ── F4 — fallback `homePlanet` przechodzi TEN SAM test ────────────────────────────────────
console.log('F4 — fallback na `window.KOSMOS.homePlanet` też jest bramkowany własnością');
{
  const { cm, vm, home } = boot();
  const v = vm.createAndRegister('science_vessel', home.id, {});
  v.homeColonyId = 'nie_ma_takiej';                // wymuś gałąź fallbacku
  assert(vm._resolvePayHomeId(v, cm) === home.id, 'F4: dopóki dom jest gracza — fallback go wskazuje');

  cm.transferColony(home.id, EMP, 'probe');        // dom przejęty; `homePlanet` NIE jest przecelowywane
  assert(window.KOSMOS.homePlanet?.id === home.id,
    'F4 przesłanka: `window.KOSMOS.homePlanet` nadal wskazuje utracone ciało (root Findingu 97)');
  const payer = vm._resolvePayHomeId(v, cm);
  assert(payer !== home.id, 'F4: po przejęciu domu fallback NIE wskazuje już na niego');
  assert(payer === null || ColonyManager.isPlayerColony(cm.getColony(payer)),
    'F4: cokolwiek zwróci — należy do gracza');
}

// ── F5 — stary kontrakt: placówka nie płaci ───────────────────────────────────────────────
console.log('F5 (STARY KONTRAKT) — placówka nadal wykluczona z płacenia');
{
  const { cm, vm, home } = boot();
  const body = EntityManager.getAll().find(e =>
    e.systemId === home.systemId && e.id !== home.id &&
    (e.type === 'planet' || e.type === 'moon') && !cm.getColony(e.id));
  const out = cm.createOutpost(body.id, { Fe: 50 }, 0);
  const outCol = cm.getColony(out.planetId ?? body.id);
  assert(!!outCol?.isOutpost, 'F5 przesłanka: placówka utworzona');

  const v = vm.createAndRegister('science_vessel', home.id, {});
  v.homeColonyId = outCol.planetId;
  assert(vm._resolvePayHomeId(v, cm) !== outCol.planetId,
    'F5: placówka nadal nie jest płatnikiem (filtr `!isOutpost` nietknięty)');
}

// ── F6 — ⚠ ASERCJA ŚWIADOMIE ODWRÓCONA W B (2026-08-25) ────────────────────────────────────
// DAWNIEJ pinowała: „brak płatnika ⇒ statek NIE płaci ANI nie zalega" — czyli DARMOWĄ FLOTĘ.
// Sam ówczesny komentarz nazywał to „zapisanym skutkiem, nie aprobatą" i wskazywał warunek
// zamknięcia: „wymaga TRZECIEGO szczebla drabiny (dowolna kolonia gracza)".
// Wariant B ten szczebel dowiózł — i to nie jako trzeci stopień drabiny, lecz przez ZNIESIENIE
// desygnowanego płatnika: rachunek idzie do SKARBCA (`spendFromTreasury`), więc bezdomny statek
// jest opłacany tak samo jak każdy inny. Pin przestaje pilnować luki i zaczyna pilnować naprawy.
// Bliźniaczy, pozytywny dowód (kto realnie zapłacił) stoi w `fleet_upkeep_imperial_smoke` B6.
console.log('F6 (ODWRÓCONY w B) — brak płatnika nominalnego NIE czyni floty darmową');
{
  const { cm, vm, home } = boot();
  const v = vm.createAndRegister('science_vessel', home.id, {});
  v.homeColonyId = 'nie_ma_takiej';
  cm.transferColony(home.id, EMP, 'probe');        // gracz bez domu ⇒ fallback odpada

  assert(vm._resolvePayHomeId(v, cm) === null,
    'F6 KONTROLA PINU: `_resolvePayHomeId` dalej zwraca `null` — resolver ATRYBUCJI żyje i nie zmiękł');
  const before = v.unpaidYears ?? 0;
  vm._maintenanceAccum = 0;
  vm._tickVesselMaintenance(1.0);
  assert((v.unpaidYears ?? 0) > before,
    'F6: statek bez płatnika ZALEGA (a nie: jest darmowy) — rachunek wystawiono, imperium go nie pokryło');
  // ⚠ Aranżacja `transferColony(home)` zabiera graczowi JEDYNĄ kolonię, więc skarbiec jest PUSTY
  //   i rachunek nie ma z czego zejść. To celowe: mierzymy, że brak płatnika nominalnego nie
  //   wypycha już statku POZA rozliczenie. Że przy niepustym skarbcu realnie PŁACI — pinuje B6.
}

// ── F7 — stary kontrakt: statki AI i wraki poza rozliczeniem ──────────────────────────────
console.log('F7 (STARY KONTRAKT) — statki AI i wraki nadal pomijane');
{
  const { cm, vm, home, player } = boot();
  const enemy = vm.createAndRegister('science_vessel', home.id, {});
  enemy.ownerEmpireId = EMP;
  enemy.homeColonyId = player.planetId;            // celowo: gdyby guard padł, GRACZ by zapłacił

  // ⚠ WŁASNY statek jest KONIECZNY, nie ozdobny. Bez niego `ownCost` wychodzi 0 i asercja
  //   porównuje zero z zerem — przechodzi JAŁOWO, niezależnie od tego, czy guard `isEnemyVessel`
  //   w ogóle istnieje. Pierwsza wersja tego testu tak właśnie miała.
  const own = vm.createAndRegister('science_vessel', home.id, {});
  own.homeColonyId = player.planetId;

  setCredits(player.planetId, 5000);
  const before = credits(player.planetId);
  vm._maintenanceAccum = 0;
  vm._tickVesselMaintenance(1.0);
  const spent = before - credits(player.planetId);
  const ownCost = [...vm._vessels.values()]
    .filter(x => !x.isWreck && !x.ownerEmpireId && vm._resolvePayHomeId(x, cm) === player.planetId)
    .reduce((a, x) => a + vm.getVesselUpkeepCredits(x), 0);
  assert(ownCost > 0, `F7 przesłanka: gracz ma co opłacać (${ownCost} Kr) — inaczej test jest jałowy`);
  assert(Math.abs(spent - ownCost) < 0.01,
    `F7: zapłacono dokładnie za WŁASNE statki (${spent} Kr vs ${ownCost} Kr) — okręt AI nie doliczony`);
  assert(spent < ownCost + vm.getVesselUpkeepCredits(enemy),
    'F7 (kontrola pinu): gdyby okręt AI był doliczony, kwota byłaby WIĘKSZA — i to by tu padło');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
