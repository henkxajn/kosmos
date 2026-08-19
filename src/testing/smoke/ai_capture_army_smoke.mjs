// AI CAPTURE — symetryczny warunek „armia wybita" (commit AC-5, D3=W3).
//
// PO CO: strony podboju liczyły obrońców INACZEJ. Gracz blokował na KAŻDEJ żywej jednostce
// obcego (`_tryPlayerCapture`), a AI wyłącznie na roli `military` (`_tickCaptureChecks`), więc
// kolonia gracza padała z żywym garnizonem, medykiem albo dronem na sąsiednim kaflu — a właściciel
// chciał „zniszczenia CAŁEJ armii wroga". AC-5 wprowadza JEDEN predykat
// (`InvasionSystem.hasLivingDefender`) używany w obie strony; lustro jest darmowe.
//
//   T1  KAŻDA rola blokuje przejęcie przez AI: `civilian` (łazik), `support` (medyk),
//       `drone` (zwiadowca), `defensive` (garnizon), `military` (piechota).
//       KONTROLA PINU: zero jednostek ⇒ przejęcie następuje.
//   T2  Predykat jest JEDEN — ta sama funkcja rozstrzyga oba kierunki (tabela prawdy).
//   T3  R-8: jednostka `offline` NIE liczy się jako obrońca. Decyzja jawna, nie przypadek:
//       `CombatSystem` wyklucza ją z walki (`:155`, `:173`, `:271`, `:367`), więc jako obrońca
//       byłaby NIEZABIJALNYM blokatorem. Jednostka bez żołdu nie trzyma terenu.
//   T4  Strona GRACZA zachowuje się tak samo (symetria zmierzona, nie zadeklarowana):
//       żywa jednostka AI o roli NIE-bojowej dalej blokuje przejęcie ciała AI przez gracza.
//   T5  Jednostka TRZECIEGO imperium blokuje obie strony — bo predykat pyta „czy żyje coś,
//       co nie należy do zdobywcy", a nie „czy żyje gracz".
//
// ⚠ ŚWIADOMA KONSEKWENCJA (zapisana w D3): jeden tani cywil na własnym kaflu czyni kolonię
//    niezdobywalną. Najtańsza wersja to grupa badawcza (`VesselManager.deployAwayTeam` — rover
//    bez koszar i bez POP). To jest dźwignia „nie oddam kolonii" za jedno kliknięcie i została
//    przyjęta świadomie; jeśli ma być droższa, rozstrzygnięcie należy do D3, nie do keepera.
//    Warunkiem wykonalności tej symetrii było D8 (AC-3) — bez niego darmowy łazik ze startu
//    blokowałby podbój w każdej partii, a gracz nigdy by go nie zbudował.
//
// Uruchom: node src/testing/smoke/ai_capture_army_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import { InvasionSystem } from '../../systems/InvasionSystem.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const EMP = 'emp_001';
const OTHER = 'emp_002';

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  const home = window.KOSMOS.homePlanet;
  const colony = core.colonyManager.getColony(home.id);
  for (const t of colony.grid?.toArray?.() ?? []) if (t) t.owner = 'player';
  return {
    core, home, colony,
    cm: core.colonyManager,
    gum: core.groundUnitManager,
    inv: core.invasionSystem,
    tick: (y) => new Ticker(core.timeSystem).run(y, { tickSize: 1.0, stopOnCrash: true }),
  };
}
const capitalOf = (c) => c.grid.toArray().filter(Boolean).find(t => t.capitalBase);

/** Scena „stolica zdobyta, kampania trwa" + opcjonalny obrońca gracza. */
function siege(defenderType) {
  const s = boot();
  const cap = capitalOf(s.colony);
  s.inv.launchInvasion(EMP, s.home.id, 2);
  cap.owner = EMP;
  const defender = defenderType
    ? s.gum.createUnit(defenderType, s.home.id, cap.q + 1, cap.r, { owner: 'player' })
    : null;
  return { ...s, cap, defender };
}

// ── T1 — każda rola blokuje ─────────────────────────────────────────────────────────────────
console.log('T1 — KAŻDA żywa jednostka gracza blokuje przejęcie (nie tylko `military`)');
for (const [type, expectedRole] of [
  ['science_rover', 'civilian'],
  ['medic_unit',    'support'],
  ['recon_drone',   'drone'],
  ['garrison_unit', 'defensive'],
  ['infantry',      'military'],
]) {
  const { colony, defender, tick } = siege(type);
  assert(defender?.role === expectedRole && ((defender.hp ?? defender.currentHP ?? 0) > 0),
    `T1 [${type}]: obrońca żyje i ma rolę \`${defender?.role}\` (oczekiwana \`${expectedRole}\`)`);
  tick(4);
  assert(!colony.ownerEmpireId,
    `T1 [${type}] SEDNO: kolonia NIE PADA przy żywym obrońcy o roli \`${expectedRole}\`. Do AC-4 ` +
    'padła przy każdej roli poza `military` — garnizon, medyk i dron były dekoracją obronną');
}
{
  const { colony, tick } = siege(null);
  tick(4);
  assert(colony.ownerEmpireId === EMP,
    'T1 KONTROLA PINU: BEZ obrońcy ta sama scena kończy się przejęciem — pin mierzy obecność ' +
    'obrońcy, a nie „przejęcie nigdy nie przechodzi"');
}

// ── T2 — jeden predykat, tabela prawdy ──────────────────────────────────────────────────────
console.log('T2 — JEDEN predykat `hasLivingDefender` rozstrzyga oba kierunki');
{
  const P = InvasionSystem.hasLivingDefender;
  const u = (o) => ({ owner: o, hp: 10, status: 'idle' });

  assert(P([u('player')], EMP) === true && P([u('player')], 'player') === false,
    'T2: jednostka GRACZA broni przed AI, a dla gracza jest własna — ta sama funkcja, dwie odpowiedzi');
  assert(P([u(EMP)], 'player') === true && P([u(EMP)], EMP) === false,
    'T2: …i symetrycznie dla imperium');
  assert(P([{ owner: 'player', hp: 0, status: 'idle' }], EMP) === false,
    'T2: martwa jednostka (hp 0) nie broni');
  assert(P([{ hp: 10, status: 'idle' }], EMP) === true && P([{ hp: 10, status: 'idle' }], 'player') === false,
    'T2: jednostka BEZ stempla `owner` liczy się jako GRACZA — kanon „nieostemplowane = gracza". ' +
    'Traktowanie jej jako niczyjej dałoby ciche okno, w którym nikt nie broni');
  assert(P([], EMP) === false && P(null, EMP) === false && P(undefined, EMP) === false,
    'T2 KONTROLA PINU: pusta/brakująca lista nie wywraca predykatu (i nie „broni" przypadkiem)');
}

// ── T3 — R-8: offline nie broni ─────────────────────────────────────────────────────────────
console.log('T3 — R-8: jednostka `offline` (nieopłacona) NIE liczy się jako obrońca');
{
  const P = InvasionSystem.hasLivingDefender;
  assert(P([{ owner: 'player', hp: 100, status: 'offline' }], EMP) === false,
    'T3 SEDNO: `offline` NIE broni. `CombatSystem` wyklucza taką jednostkę z walki, więc jako ' +
    'obrońca byłaby NIEZABIJALNYM blokatorem: nie da się jej zabić, a blokuje podbój na zawsze. ' +
    'To jest ROZSTRZYGNIĘCIE („jednostka bez żołdu nie trzyma terenu"), nie przeoczenie');
  assert(P([{ owner: 'player', hp: 100, status: 'idle' }], EMP) === true,
    'T3 KONTROLA PINU: ta sama jednostka OPŁACONA broni normalnie — pin mierzy status, nie ownera');

  const { colony, defender, tick } = siege('infantry');
  defender.status = 'offline';
  tick(4);
  assert(colony.ownerEmpireId === EMP,
    'T3 WYKONANIE: w pełnej scenie oblężenia nieopłacona piechota NIE zatrzymuje przejęcia — ' +
    'reguła działa na żywym silniku, nie tylko w tabeli prawdy');
}

// ── T4 — symetria po stronie GRACZA ─────────────────────────────────────────────────────────
console.log('T4 — strona GRACZA zachowuje się tak samo (symetria ZMIERZONA)');
{
  const { core, cm, gum, tick } = boot();
  // Ciało AI z przejętą przez gracza stolicą — scena lustrzana do T1.
  const aiColony = cm.getAllColonies().find(c => c.ownerEmpireId);
  const tiles = aiColony.grid?.toArray?.() ?? [];
  const cap = tiles.find(t => t?.capitalBase);
  assert(!!cap, 'T4: kolonia AI ma kafel stolicy (przesłanka sceny)');
  cap.owner = 'player';

  const medic = gum.createUnit('medic_unit', aiColony.planetId, cap.q + 1, cap.r,
    { owner: aiColony.ownerEmpireId, factionId: 'humanity' });
  assert(medic?.role === 'support', `T4: obrońca AI to medyk (rola \`${medic?.role}\`), NIE jednostka bojowa`);

  tick(3);
  assert(!!aiColony.ownerEmpireId,
    'T4 SEDNO: gracz NIE przejmuje ciała AI, dopóki żyje na nim medyk — strona gracza zawsze ' +
    'liczyła każdą rolę i po AC-5 dalej tak działa (to jest ten sam predykat, nie kopia)');

  gum.removeUnit(medic.id);
  tick(3);
  assert(!aiColony.ownerEmpireId,
    'T4 KONTROLA PINU: po usunięciu medyka przejęcie DOCHODZI DO SKUTKU — czyli blokował ' +
    'właśnie on, a nie inny warunek sceny');
}

// ── T5 — trzecie imperium ───────────────────────────────────────────────────────────────────
console.log('T5 — jednostka TRZECIEGO imperium blokuje obie strony');
{
  const P = InvasionSystem.hasLivingDefender;
  assert(P([{ owner: OTHER, hp: 10, status: 'idle' }], EMP) === true,
    `T5: jednostka ${OTHER} blokuje przejęcie przez ${EMP}…`);
  assert(P([{ owner: OTHER, hp: 10, status: 'idle' }], 'player') === true,
    '…i tak samo blokuje gracza. Predykat pyta „czy żyje coś, co NIE należy do zdobywcy", ' +
    'a nie „czy żyje gracz" — dzięki temu trzecia strona na ciele wstrzymuje podbój obu');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
