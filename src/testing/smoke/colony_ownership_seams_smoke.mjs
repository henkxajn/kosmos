// BRAMKA WŁASNOŚCI KOLONII — keeper SZWÓW. Stan po bloku P0 (OG-2) + szew, który ŻYJE dalej.
//
// PO CO: audyt `docs/audit/COLONY_OWNERSHIP_GATE_AUDIT.md` zmierzył, że gra ma bramkę
// „KTÓRA kolonia" i nie ma bramki „CZYJA". Plan `docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md`,
// blok P0 podpisany 2026-08-19, zamknął ścieżkę WCZYTANIA. Reszta (klasy A/B/C, predykat)
// czeka na osobny podpis — i ten keeper pilnuje granicy między jednym a drugim.
//
// ⚠ TRZY Z CZTERECH SZWÓW ZOSTAŁY ŚWIADOMIE ODWRÓCONE W OG-2. Ta tabela jest częścią kontraktu:
//   kto odwraca pin, przepisuje NAGŁÓWEK, a nie kasuje test.
//
//   | szew | co pinował PRZED P0                                   | odwrócone przez | dlaczego to nie regresja |
//   |------|-------------------------------------------------------|-----------------|--------------------------|
//   | S1   | `transferColony` NIE czyścił `isHomePlanet`           | P0-C=W2         | flaga była tokenem, z którego `restore` uzbrajał aktywną kolonię na ciele wroga |
//   | S2   | `removeColony` przepinał na ex-dom wroga (`_colonies.has`) | P0-D=W1     | bliźniak fallbacku AC-8; test przynależności zamiast własności |
//   | S3   | `restore` uzbrajał `_activePlanetId` z samej flagi     | P0-A=W1         | wybór przeniesiony za relink, gdzie własność w ogóle istnieje |
//   | S4   | `switchActiveColony` przyjmuje kolonię AI             | — **ŻYJE**      | ścieżka KLIKANA należy do D1 (osobny podpis) |
//
// ⚠ PEŁNY dowód odwrócenia (kontrole pinu, round-trip przez produkcyjny zapis, pin źródłowy na
//   `GameScene`) mieszka w `colony_ownership_load_smoke.mjs`. Tutaj zostają jednolinijkowe
//   potwierdzenia, żeby oba keepery nie mierzyły tego samego dwa razy.
//
//   S4 jest jedynym pinem tego pliku, który NADAL opisuje wadę — i jest zarazem KONTROLĄ, że P0
//   nie tknął przypadkiem ścieżki żywej. Gdy D1 wejdzie, S4 ma paść i zostać przepisany tak jak S1-S3.
//
// Uruchom: node src/testing/smoke/colony_ownership_seams_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import { GameCore } from '../headless/GameCore.js';
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { SaveSystem } from '../../systems/SaveSystem.js';
import { EmpireColonyBootstrap } from '../../systems/EmpireColonyBootstrap.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const EMP = 'emp_001';

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  window.KOSMOS.civMode = true;
  return { core, home: window.KOSMOS.homePlanet, cm: core.colonyManager };
}

const freeBody = (cm, systemId, exclude) => EntityManager.getAll().find(e =>
  e.systemId === systemId && e.id !== exclude &&
  (e.type === 'planet' || e.type === 'moon') && !cm.getColony(e.id));

// ── S1 (ODWRÓCONY przez P0-C) ──────────────────────────────────────────────────────────────
console.log('S1 (ODWRÓCONY, P0-C) — utrata stolicy zdejmuje `isHomePlanet`');
{
  const { cm, home } = boot();
  assert(cm.getColony(home.id)?.isHomePlanet === true, 'S1 przesłanka: stolica ma flagę przed przejęciem');
  cm.transferColony(home.id, EMP, 'probe');
  assert(cm.getColony(home.id)?.isHomePlanet === false,
    'S1 ODWRÓCONY: przejęta stolica nie nosi już flagi (token uzbrajający `restore` zniknął u źródła)');
}

// ── S2 (ODWRÓCONY przez P0-D) ──────────────────────────────────────────────────────────────
console.log('S2 (ODWRÓCONY, P0-D) — `removeColony` nie przepina na ex-dom wroga');
{
  const { cm, home } = boot();
  const body = freeBody(cm, home.systemId, home.id);
  const second = cm.createColony(body.id, { Fe: 50 }, 8, 0);
  cm.transferColony(home.id, EMP, 'probe');
  assert(cm.activePlanetId === second.planetId, 'S2 przesłanka: AC-8 przepiął na drugą kolonię gracza');

  cm.removeColony(second.planetId, 'probe_collision');
  assert(cm.activePlanetId !== home.id && window.KOSMOS.resourceSystem !== cm.getColony(home.id)?.resourceSystem,
    'S2 ODWRÓCONY: bliźniak fallbacku dostał filtr własności — gracz nie ląduje na magazynie wroga');
}
{
  // KONTROLA PINU — usunięcie koloni, która NIE jest aktywna, nadal nie rusza wskaźnika.
  const { cm, home } = boot();
  const b1 = freeBody(cm, home.systemId, home.id);
  const c1 = cm.createColony(b1.id, { Fe: 50 }, 8, 0);
  const before = cm.activePlanetId;
  cm.removeColony(c1.planetId, 'probe');
  assert(cm.activePlanetId === before,
    'S2 KONTROLA PINU: usunięcie NIEaktywnej koloni nie zmienia aktywnej (pin trafia w gałąź, nie w szum)');
}

// ── S3 (ODWRÓCONY przez P0-A) ──────────────────────────────────────────────────────────────
console.log('S3 (ODWRÓCONY, P0-A) — wczytanie nie odtwarza awarii samo z siebie');
{
  const { cm, home } = boot();
  cm.transferColony(home.id, EMP, 'probe');
  assert(cm.activePlanetId == null && window.KOSMOS.resourceSystem === null,
    'S3 przesłanka: AC-8 odpiął kontekst — zapis jest „czysty"');

  const c4x = new SaveSystem()._serializeCiv4x();
  cm._colonies.clear();
  cm._activePlanetId = null;
  cm.restore(c4x, null);
  EmpireColonyBootstrap.relinkColoniesAfterRestore(c4x.empireTech);   // lustro GameScene:2046
  cm.resolveActiveColonyAfterRestore();

  assert(cm.activePlanetId !== home.id,
    'S3 ODWRÓCONY: po wczytaniu aktywna kolonia to NIE ex-dom wroga (§6 audytu zamknięte)');
}

// ── S4 — ŻYWY SZEW: `switchActiveColony` przyjmuje kolonię AI (należy do D1) ────────────────
console.log('S4 (ŻYWY — D1) — `switchActiveColony` nadal przyjmuje kolonię AI');
{
  const { cm } = boot();
  const ai = cm.getAllColonies().find(c => !ColonyManager.isPlayerColony(c));
  assert(ai != null, 'S4 przesłanka: scenariusz ma kolonię AI w tym samym rejestrze');

  const ok = cm.switchActiveColony(ai.planetId);
  assert(ok === true && cm.activePlanetId === ai.planetId,
    'S4 SZEW: przełączenie na kolonię AI ZWRACA `true` — bramka istnienia, nie własności. ' +
    '⚠ To jest ścieżka KLIKANA i należy do D1 (niepodpisane). Gdy D1 wejdzie, ten pin ma paść');
  assert(window.KOSMOS.resourceSystem === ai.resourceSystem,
    'S4 SZEW 2: wskaźniki `window.KOSMOS` celują w magazyn AI');
}
{
  // KONTROLA PINU — nieistniejąca kolonia jest odrzucana (bramka istnienia DZIAŁA).
  const { cm } = boot();
  assert(cm.switchActiveColony('entity_nie_istnieje') === false,
    'S4 KONTROLA PINU: nieistniejąca kolonia → `false` (metoda w ogóle bramkuje)');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} colony_ownership_seams: ${pass} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
