// BRAMKA WŁASNOŚCI KOLONII — keeper SZWÓW (OG-0). Pinuje STAN DZISIEJSZY, wykonaniem.
//
// PO CO: audyt `docs/audit/COLONY_OWNERSHIP_GATE_AUDIT.md` zmierzył, że gra ma bramkę
// „KTÓRA kolonia" i nie ma bramki „CZYJA". Blok P0 planu
// `docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md` (podpisany 2026-08-19) zamyka ścieżkę WCZYTANIA,
// która sama, bez udziału gracza, oddaje go koloni wroga. Ten keeper mierzy szwy PRZED zmianą —
// inaczej nikt nie udowodni, że commit z naprawą naprawdę coś przestawił.
//
//   S1  `transferColony` NIE czyści `colony.isHomePlanet` (czyta ją tylko do narracji).
//       ⚠ MA PAŚĆ w OG-2 (P0-C=W2).
//   S2  `removeColony` przepina aktywną kolonię na `window.KOSMOS.homePlanet.id` po teście
//       PRZYNALEŻNOŚCI (`_colonies.has`), bez testu własności — czyli na ex-dom trzymany
//       przez wroga.  ⚠ MA PAŚĆ w OG-2 (P0-D=W1).
//   S3  `ColonyManager.restore` uzbraja `_activePlanetId` z samej flagi `isHomePlanet`, a zapisany
//       `activePlanetId: null` tego NIE cofa (bramka `:2481` jest warunkowa).
//       ⚠ MA PAŚĆ w OG-2 (P0-A=W1). To jest dosłownie §6 audytu, zmierzone wykonaniem.
//   S4  `switchActiveColony` przyjmuje kolonię AI (zwraca `true` i przepina wskaźniki).
//       ⚠ NIE pada w P0 — to ścieżka ŻYWA, należy do D1 (osobny podpis). Pin kontrolny całego
//       bloku: dowodzi, że P0 NIE tknął przypadkiem ścieżki klikanej.
//
// KAŻDY pin ma KONTROLĘ PINU — inaczej keeper, który po cichu nic nie mierzy, przechodzi sweep.
//
// ⚠ CZTERY Z SIEDMIU ASERCJI SZWU MAJĄ PAŚĆ w OG-2 i zostać ŚWIADOMIE PRZEPISANE (nie skasowane).
//    Kto odwraca pin, przepisuje nagłówek tego pliku — tak jak zrobił to AC-3 z `ai_capture_seams`.
//
// Uruchom: node src/testing/smoke/colony_ownership_seams_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import { GameCore } from '../headless/GameCore.js';
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { SaveSystem } from '../../systems/SaveSystem.js';

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

/** Round-trip przez PRODUKCYJNĄ ścieżkę zapisu (nie ręcznie przepisany payload). */
function roundTrip(cm) {
  const c4x = new SaveSystem()._serializeCiv4x();
  cm._colonies.clear();
  cm._activePlanetId = null;
  cm.restore(c4x, null);
  return c4x;
}

// ── S1 — transferColony nie czyści isHomePlanet ────────────────────────────────────────────
console.log('S1 — `transferColony` zostawia `isHomePlanet: true` na przejętej stolicy  ⚠ MA PAŚĆ w OG-2');
{
  const { cm, home } = boot();
  assert(cm.getColony(home.id)?.isHomePlanet === true, 'S1 przesłanka: stolica ma flagę przed przejęciem');

  cm.transferColony(home.id, EMP, 'probe');
  const taken = cm.getColony(home.id);

  assert(taken != null && !ColonyManager.isPlayerColony(taken),
    'S1 przesłanka: kolonia ZOSTAJE w rejestrze i należy do wroga (W3-1, przerzut w miejscu)');
  assert(taken.isHomePlanet === true,
    `S1 SZEW: przejęta stolica NADAL nosi \`isHomePlanet: ${taken.isHomePlanet}\` — to jest token, ` +
    'z którego `restore` uzbraja aktywną kolonię (S3)');
}
{
  // KONTROLA PINU — flaga nie jest „zawsze true": zwykła kolonia gracza jej nie ma.
  const { cm, home } = boot();
  const body = freeBody(cm, home.systemId, home.id);
  const second = cm.createColony(body.id, { Fe: 50 }, 8, 0);
  assert(second != null && !second.isHomePlanet,
    'S1 KONTROLA PINU: zwykła kolonia gracza NIE ma `isHomePlanet` (pin mierzy flagę, nie stałą)');
}

// ── S2 — removeColony przepina na ex-dom wroga ─────────────────────────────────────────────
console.log('S2 — `removeColony` przepina na ex-dom TRZYMANY PRZEZ WROGA  ⚠ MA PAŚĆ w OG-2');
{
  const { cm, home } = boot();
  const body = freeBody(cm, home.systemId, home.id);
  const second = cm.createColony(body.id, { Fe: 50 }, 8, 0);

  cm.transferColony(home.id, EMP, 'probe');
  assert(cm.activePlanetId === second.planetId,
    'S2 przesłanka: po utracie stolicy AC-8 przepiął na DRUGĄ kolonię gracza');

  cm.removeColony(second.planetId, 'probe_collision');

  assert(cm.activePlanetId === home.id,
    `S2 SZEW: zniszczenie drugiej koloni przepięło aktywną na \`${cm.activePlanetId}\` — ex-dom, ` +
    `który należy do \`${cm.getColony(home.id)?.ownerEmpireId}\`. Test przynależności (\`_colonies.has\`), ` +
    'nie własności — bliźniak fallbacku, którego AC-8 NIE utwardził');
  assert(window.KOSMOS.resourceSystem === cm.getColony(home.id)?.resourceSystem,
    'S2 SZEW 2: magazyn `window.KOSMOS` wskazuje magazyn WROGA');
}
{
  // KONTROLA PINU — usunięcie koloni, która NIE jest aktywna, nie rusza wskaźnika.
  const { cm, home } = boot();
  const b1 = freeBody(cm, home.systemId, home.id);
  const c1 = cm.createColony(b1.id, { Fe: 50 }, 8, 0);
  const before = cm.activePlanetId;
  cm.removeColony(c1.planetId, 'probe');
  assert(cm.activePlanetId === before,
    'S2 KONTROLA PINU: usunięcie NIEaktywnej koloni nie zmienia aktywnej (pin trafia w gałąź, nie w szum)');
}

// ── S3 — restore uzbraja aktywną kolonię z samej flagi ─────────────────────────────────────
console.log('S3 — wczytanie ODTWARZA awarię samo, bez kliknięcia (§6 audytu)  ⚠ MA PAŚĆ w OG-2');
{
  const { cm, home } = boot();
  cm.transferColony(home.id, EMP, 'probe');

  assert(cm.activePlanetId == null && window.KOSMOS.resourceSystem === null,
    'S3 przesłanka: AC-8 ODPIĄŁ kontekst (gracz stracił jedyną kolonię) — zapis jest „czysty"');

  const c4x = roundTrip(cm);

  assert(c4x.activePlanetId == null,
    'S3 przesłanka 2: w PLIKU `activePlanetId` jest `null` — awaria nie pochodzi z zapisanej wartości');
  assert(cm.activePlanetId === home.id,
    `S3 SZEW: po wczytaniu aktywna kolonia to \`${cm.activePlanetId}\` — ex-dom WROGA, uzbrojony ` +
    'z samej flagi `isHomePlanet`; zapisany `null` tego nie cofnął (bramka warunkowa)');
  assert(window.KOSMOS.factorySystem === cm.getColony(home.id)?.factorySystem,
    'S3 SZEW 2: `restore` wiąże DWA z pięciu wskaźników (factory/prosperity) — ślepo na własność');
}
{
  // KONTROLA PINU — bez flagi `isHomePlanet` restore niczego nie uzbraja.
  const { cm, home } = boot();
  cm.transferColony(home.id, EMP, 'probe');
  cm.getColony(home.id).isHomePlanet = false;   // ręcznie: to właśnie zrobi P0-C
  roundTrip(cm);
  assert(cm.activePlanetId !== home.id,
    'S3 KONTROLA PINU: gdy flaga jest zdjęta, `restore` NIE uzbraja ex-domu (pin mierzy flagę)');
}

// ── S4 — switchActiveColony przyjmuje kolonię AI (ścieżka ŻYWA, D1) ────────────────────────
console.log('S4 — `switchActiveColony` przyjmuje kolonię AI  (⚠ NIE pada w P0 — to D1)');
{
  const { cm } = boot();
  const ai = cm.getAllColonies().find(c => !ColonyManager.isPlayerColony(c));
  assert(ai != null, 'S4 przesłanka: scenariusz ma kolonię AI w tym samym rejestrze');

  const ok = cm.switchActiveColony(ai.planetId);
  assert(ok === true && cm.activePlanetId === ai.planetId,
    'S4 SZEW: przełączenie na kolonię AI ZWRACA `true` (bramka istnienia, nie własności)');
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
