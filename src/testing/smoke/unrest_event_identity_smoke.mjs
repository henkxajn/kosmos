// TOŻSAMOŚĆ ZDARZENIA KOLONII — keeper Findingu 86.
//
// PO CO: `BuildingSystem` nasłuchuje `civ:unrest` / `civ:unrestLifted` przez `() =>`, czyli
// WYRZUCA `planetId`, który producent rzetelnie wysyła (`CivilizationSystem:1125` i `:1111`).
// Jedyna bramka to `window.KOSMOS?.buildingSystem !== this` — test AKTYWNOŚCI, nie tożsamości.
// ⇒ niepokój na DOWOLNEJ koloni (w tym AI) zabierał aktywnej koloni GRACZA −30 % produkcji,
// a `unrestLifted` z cudzej koloni KASOWAŁ karę uzasadnioną. Linia nietknięta od pierwszego
// commitu repo (`9951d5e`).
//
// ⚠ TO JEST TERMIN TOŻSAMOŚCI, NIE WŁASNOŚCI — i ta różnica jest tu cała.
//   `colony_ownership_guard_smoke` G12 pinuje, że te bramki NIE MAJĄ dostać terminu własności
//   („raportują FAKTY o ZWIĄZANEJ koloni, więc własność byłaby BŁĘDEM KATEGORII"), i ma rację.
//   Ale G12 testuje przypadek TEJ SAMEJ koloni (emituje `planetId` koloni, której BuildingSystem
//   sam ustawił jako aktywny). Finding 86 to przypadek MIĘDZYKOLONIOWY. Pytanie „czy to
//   zdarzenie jest o MOJEJ koloni" **przywraca przesłankę z nagłówka G12** — zdanie „fakty
//   o związanej koloni" jest dziś niczym niesprawdzane.
//
// ⚠ DLACZEGO NIE PORÓWNANIE Z `colonyManager.activePlanetId` (wariant tańszy): G12 ręcznie
//   ustawia `window.KOSMOS.buildingSystem` na system koloni AI, zostawiając `activePlanetId`
//   na domu. Taki wariant zapaliłby G12 na czerwono, a fixture'u nie da się „naprawić", bo po
//   arcu D1 `switchActiveColony` ODMAWIA koloni AI. Tożsamość własna (`_planetId`, pole
//   istniejące od dawna, `BuildingSystem:222`) zostawia G12 zielone BEZ dotykania go.
//
// ⚠ FAIL-OPEN JEST CELOWY (T5/T6). Ok. 40 konstrukcji `new BuildingSystem(...)` w testach nigdy
//   nie woła `setPlanetId`, a producent zdarzenia bez `planetId` może istnieć w starym zapisie.
//   System, który nie umie rozwiązać swojej tożsamości, MUSI przepuścić — dokładnie ten sam
//   precedens co w kanonie własności kolonii. Zacieśnienie tego wywróci ~40 niezwiązanych testów.
//
//   T1  SEDNO: niepokój CUDZEJ koloni nie karze aktywnej
//   T2  KONTROLA PINU: niepokój WŁASNEJ koloni dalej karze (kształt G12, lokalnie)
//   T3  SEDNO: `unrestLifted` z cudzej koloni NIE kasuje uzasadnionej kary
//   T4  KONTROLA PINU: `unrestLifted` własnej koloni dalej ją kasuje
//   T5  KONTROLA PINU: system BEZ tożsamości przepuszcza wszystko (fail-open)
//   T6  KONTROLA PINU: zdarzenie BEZ `planetId` przepuszcza (fail-open po drugiej stronie)
//   T7  MONTAŻ (wykonaniem): kolonia z `ColonyManager` ma realnie ustawione `_planetId`
//       — bez tego cała bramka byłaby martwa w prawdziwej grze (lekcja „skonstruowany ≠
//       zamontowany" z W3)

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import { BuildingSystem } from '../../systems/BuildingSystem.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

window.KOSMOS = window.KOSMOS ?? {};

const resStub = { receive: () => {}, spend: () => true, canAfford: () => true, getAmount: () => 0 };
const civStub = () => ({ population: 8, getSlotDemand: () => 0, workers: () => 0 });

function mkBSys(planetId) {
  const b = new BuildingSystem(resStub, civStub(), null);
  if (planetId) b.setPlanetId(planetId);
  return b;
}

const A = mkBSys('p_gracz');       // kolonia gracza — AKTYWNA
const B = mkBSys('p_ai');          // kolonia obca — tylko źródło zdarzeń
const C = mkBSys(null);            // system bez tożsamości (wzór ~40 konstrukcji testowych)

// ── T1 / T2 — kara ───────────────────────────────────────────────────────────
console.log('T1/T2 — niepokój: cudzy nie karze, własny karze');
{
  window.KOSMOS.buildingSystem = A;
  A._civPenalty = 1.0;
  EventBus.emit('civ:unrest', { planetId: B._planetId, colonyName: 'Kolonia AI' });
  assert(A._civPenalty === 1.0,
    'T1 SEDNO: niepokój na koloni CUDZEJ nie rusza kary aktywnej koloni gracza ' +
    `(jest ${A._civPenalty}, ma być 1.0). Bez tego dowolna kolonia AI zabierała graczowi −30 % produkcji`);

  A._civPenalty = 1.0;
  EventBus.emit('civ:unrest', { planetId: A._planetId, colonyName: 'Dom' });
  assert(A._civPenalty === 0.7,
    'T2 KONTROLA PINU: niepokój na WŁASNEJ koloni dalej stosuje karę — to jest kształt G12 ' +
    'i on musi zostać zielony; bramkujemy TOŻSAMOŚĆ zdarzenia, nie funkcję kary');
}

// ── T3 / T4 — zdjęcie kary ───────────────────────────────────────────────────
console.log('T3/T4 — zdjęcie niepokoju: cudze nie leczy, własne leczy');
{
  window.KOSMOS.buildingSystem = A;
  A._civPenalty = 0.7;                       // kara UZASADNIONA, z własnego niepokoju
  EventBus.emit('civ:unrestLifted', { planetId: B._planetId, colonyName: 'Kolonia AI' });
  assert(A._civPenalty === 0.7,
    'T3 SEDNO: wygaśnięcie niepokoju na CUDZEJ koloni NIE kasuje kary gracza ' +
    `(jest ${A._civPenalty}, ma być 0.7). To groźniejsza połowa 86: cudzy 10-letni licznik ` +
    'leczył kryzys, którego nie wywołał');

  EventBus.emit('civ:unrestLifted', { planetId: A._planetId, colonyName: 'Dom' });
  assert(A._civPenalty === 1.0,
    'T4 KONTROLA PINU: wygaśnięcie WŁASNEGO niepokoju dalej zdejmuje karę');
}

// ── T5 / T6 — obie strony fail-open ──────────────────────────────────────────
console.log('T5/T6 — fail-open: brak tożsamości po którejkolwiek stronie przepuszcza');
{
  window.KOSMOS.buildingSystem = C;
  C._civPenalty = 1.0;
  EventBus.emit('civ:unrest', { planetId: 'p_cokolwiek' });
  assert(C._civPenalty === 0.7,
    'T5 KONTROLA PINU: BuildingSystem BEZ `_planetId` (ok. 40 konstrukcji testowych nigdy nie ' +
    'woła `setPlanetId`) przepuszcza jak dotąd — zacieśnienie tego wywraca niezwiązane testy');

  window.KOSMOS.buildingSystem = A;
  A._civPenalty = 1.0;
  EventBus.emit('civ:unrest', {});
  assert(A._civPenalty === 0.7,
    'T6 KONTROLA PINU: zdarzenie BEZ `planetId` przepuszcza — zdarzenia, którego nie da się ' +
    'przypisać, nie wolno po cichu odrzucić');
}

// ── T7 — MONTAŻ ──────────────────────────────────────────────────────────────
console.log('T7 — montaż: kolonia z ColonyManager realnie NIESIE tożsamość');
{
  const { GameCore } = await import('../headless/GameCore.js');
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  const cm = core.colonyManager;
  const home = cm.getColony(window.KOSMOS.homePlanet.id);
  assert(!!home?.buildingSystem?._planetId && home.buildingSystem._planetId === home.planetId,
    'T7 SEDNO MONTAŻU: BuildingSystem koloni macierzystej ma `_planetId` równe jej `planetId` ' +
    `(jest ${home?.buildingSystem?._planetId}). Bez tego bramka T1 byłaby w prawdziwej grze ` +
    'MARTWA — pole istnieje, ale nikt by go nie zamontował');
}

console.log(`\n═══ ${pass} PASS, ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
