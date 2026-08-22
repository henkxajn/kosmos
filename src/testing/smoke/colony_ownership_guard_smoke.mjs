// D1 + D2 / OG-3 — BRAMKA WŁASNOŚCI: rozkaz gracza tylko na koloni gracza.
//
// PO CO: `docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md` §D1 (PODPISANA: W2 inwariant + W1 UX) oraz
// §D2 (PODPISANA: W3 + W1 obrona w głąb). Gra miała bramkę „KTÓRA kolonia" (`switchActiveColony`
// sprawdzał ISTNIENIE) i nie miała bramki „CZYJA". Skutkiem nie było „gracz kradnie sobie
// gospodarkę", tylko odwrotność: `_activateBuilding` rejestruje producenta na WŁASNEJ instancji
// koloni, więc gracz związany z kolonią wroga KARMIŁ gospodarkę wroga, a `switchActiveColony`
// przecelowywał tylko HUD.
//
// ⚠ DWIE OSIE, NIE JEDNA — i ten plik pilnuje tylko drugiej:
//   • PRZYNALEŻNOŚĆ KAFLA do siatki systemu (D5/OG-1) → `colony_tile_membership_smoke`;
//   • WŁASNOŚĆ KOLONII, czyli czy gracz w ogóle może się z nią ZWIĄZAĆ (D1) i czy związany
//     system przyjmuje rozkazy (D2) → ten plik.
//
// ⚠ ZERO FURTEK — I TO JEST POMIAR, NIE ZAŁOŻENIE. Plan zakładał dwie jawne furtki dla
//   `GameCore:310` i `CombatSandbox:228`. Pomiar w źródle pokazał, że OBA wiążą planetę
//   MACIERZYSTĄ GRACZA (`GameCore`: „Aktywna kolonia = home planet"; `CombatSandbox`:
//   „14) Aktywuj kolonię gracza w UI", `civPlanet` udokumentowana jako „planeta macierzysta
//   gracza"), więc przechodzą samym terminem własności. Furtka nie jest potrzebna — a każda
//   niepotrzebna furtka to mina dla następnego (lekcja `removeColony:667`). G4 pinuje BRAK
//   parametru obejścia ŹRÓDŁOWO.
//
// ⚠ FAIL-OPEN JEST WYMOGIEM, NIE OSTROŻNOŚCIĄ (G8). Około dwudziestu keeperów przypina GOŁY
//   system do `window.KOSMOS`, bez koloni i bez `ownerEmpireId` (`pop3_economy`, `pop2_5c1`,
//   `pop2_5c2`, `pop4_droids`, `energy_brownout_gate`, `factory_production_toggle`,
//   `crewlock_unemployed_invariant`, …). System, który nie umie rozwiązać swojego właściciela,
//   MUSI przepuścić — inaczej termin własności wywraca dwadzieścia niezwiązanych testów.
//
// ⚠ ÓSEMKI BRAMEK SYSTEMOWYCH NIE WOLNO TKNĄĆ (G12). Raportują FAKTY o związanej koloni
//   (`civ:unrest`, `resource:*`, prosperity), więc termin własności byłby tam BŁĘDEM KATEGORII.
//   G12 pinuje, że dalej działają na koloni AI — jeśli kiedyś padnie, ktoś „poprawił przy okazji".
//
// ⚠ AI NIE IDZIE SZYNĄ (G9). `ColonyAutoExpander` woła `bSys._build`/`_upgrade` BEZPOŚREDNIO
//   (`:507`/`:557`, zero `EventBus.emit` w pliku), `EmpireColonyBootstrap` woła
//   `autoPlaceBuilding` (`:505`), `EmpireColonyMaintenance` woła `_reapplyAllRates` wprost.
//   Dlatego termin w bramkach NIE MOŻE zepsuć AI — ale nie wolno też uznać tych bezpośrednich
//   tras za „zbędne".
//
// ⚠ D3=W1 PINOWANE TUTAJ, BEZ WŁASNEGO COMMITU (G5). Przy D1=W2 wskaźnik nie ma jak trafić na
//   obcą kolonię, więc „nie przecelowujemy na obcą" jest SKUTKIEM tej zmiany. Zerowanie
//   (`W2`) tworzyłoby exploit: trzy ścieżki `MissionSystem` wydają miękko (`:840`/`:844`,
//   `:1245`, `:1386`) i przy `null` przepuszczają ZA DARMO zamiast odmówić.
//
// Uruchom: node src/testing/smoke/colony_ownership_guard_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import fs from 'node:fs';
import { GameCore } from '../headless/GameCore.js';
import EntityManager from '../../core/EntityManager.js';
import EventBus from '../../core/EventBus.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { BuildingSystem } from '../../systems/BuildingSystem.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { PlanetMapGenerator } from '../../map/PlanetMapGenerator.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const EMP = 'emp_001';
const STOCK = {
  Fe: 99999, C: 99999, Si: 99999, Cu: 99999, Ti: 99999, Al: 99999,
  minerals: 99999, energy: 99999, organics: 99999, water: 99999,
  structural_alloys: 9999, extraction_systems: 9999, power_cells: 9999,
  conductor_bundles: 9999, electronic_systems: 9999, pressure_modules: 9999,
  habitat_modules: 9999, semiconductors: 9999, polymer_composites: 9999,
};

function freeBody(cm, systemId, exclude) {
  return EntityManager.getAll().find(e =>
    e.systemId === systemId && e.id !== exclude &&
    (e.type === 'planet' || e.type === 'moon') && !cm.getColony(e.id));
}

function ensureGrid(colony) {
  const bSys = colony?.buildingSystem;
  if (!bSys || bSys._grid || !colony.planet) return;
  const grid = PlanetMapGenerator.generate(colony.planet, false);
  bSys._grid = grid; bSys._gridHeight = grid.height ?? 10; colony.grid = grid;
}

// Scena: kolonia GRACZA (macierzysta) + kolonia AI w tym samym układzie.
function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  window.KOSMOS.civMode = true;
  const cm = core.colonyManager;
  const home = window.KOSMOS.homePlanet;

  const body = freeBody(cm, home.systemId, home.id);
  const ai = cm.createColony(body.id, { Fe: 500 }, 8, 0, EMP);

  const P = cm.getColony(home.id);
  const A = cm.getColony(ai.planetId);
  P.resourceSystem.receive({ ...STOCK });
  A.resourceSystem.receive({ ...STOCK });
  ensureGrid(P); ensureGrid(A);
  return { core, cm, home, P, A };
}

const snapshotPointers = () => ({
  active: window.KOSMOS.colonyManager?.activePlanetId ?? null,
  res: window.KOSMOS.resourceSystem, civ: window.KOSMOS.civSystem,
  bld: window.KOSMOS.buildingSystem, fac: window.KOSMOS.factorySystem,
  pro: window.KOSMOS.prosperitySystem,
});
const samePointers = (a, b) => a.active === b.active && a.res === b.res && a.civ === b.civ
  && a.bld === b.bld && a.fac === b.fac && a.pro === b.pro;

// Wolny, budowalny kafel siatki systemu.
function freeTile(bSys, buildingId) {
  let out = null;
  bSys._grid.forEach(t => {
    if (out) return;
    if (t.buildingId || t.underConstruction || t.pendingBuild) return;
    if (!bSys._canBuildOnTile(t, BUILDINGS[buildingId])) return;
    out = t;
  });
  return out;
}
const untouched = (t) => !t.buildingId && !t.underConstruction && !t.pendingBuild;
const anyBuildingId = () => Object.values(BUILDINGS).find(b => !b.requires && !b.isCapital).id;

// ── G1 — wiązanie koloni AI ODRZUCONE ─────────────────────────────────────────────────────
console.log('G1 (D1=W2) — `switchActiveColony` odmawia na koloni AI');
{
  const { cm, A } = boot();
  const before = snapshotPointers();
  assert(ColonyManager.isPlayerColony(A) === false, 'G1 przesłanka: kolonia testowa należy do AI');

  const ok = cm.switchActiveColony(A.planetId);
  const after = snapshotPointers();

  assert(ok === false, 'G1: zwraca `false` (kontrakt jak przy nieistniejącej koloni)');
  assert(after.active !== A.planetId, 'G1: `_activePlanetId` NIE wskazuje koloni AI');
  assert(samePointers(before, after), 'G1: ŻADEN z pięciu wskaźników `window.KOSMOS` nie drgnął');
  assert(window.KOSMOS.resourceSystem !== A.resourceSystem,
    'G1: magazyn gracza to nadal magazyn GRACZA (koniec karmienia gospodarki wroga)');
}

// ── G2 — KONTROLA PINU: własna kolonia przechodzi ─────────────────────────────────────────
console.log('G2 (KONTROLA PINU) — wiązanie koloni GRACZA działa jak dotąd');
{
  const { cm, home, P } = boot();
  const body = freeBody(cm, home.systemId, home.id);
  const second = cm.createColony(body.id, { Fe: 50 }, 8, 0);   // bez ownerEmpireId => gracza
  const S = cm.getColony(second.planetId);

  const ok = cm.switchActiveColony(S.planetId);
  assert(ok === true, 'G2: zwraca `true`');
  assert(cm.activePlanetId === S.planetId, 'G2: aktywna kolonia przełączona');
  assert(window.KOSMOS.resourceSystem === S.resourceSystem, 'G2: wskaźniki wskazują NOWĄ kolonię gracza');
  assert(window.KOSMOS.resourceSystem !== P.resourceSystem, 'G2: i nie starą');
}

// ── G3 — KONTROLA PINU: stary kontrakt nietknięty ─────────────────────────────────────────
console.log('G3 (KONTROLA PINU) — nieistniejąca kolonia dalej `false`');
{
  const { cm } = boot();
  const before = snapshotPointers();
  assert(cm.switchActiveColony('nie_ma_takiej') === false, 'G3: nieistniejąca kolonia => `false`');
  assert(samePointers(before, snapshotPointers()), 'G3: wskaźniki nietknięte');
}

// ── G4 — ZERO FURTEK (pin źródłowy + empiryczny) ───────────────────────────────────────────
console.log('G4 — brak parametru obejścia; ścieżki dev/harness przechodzą TERMINEM, nie furtką');
{
  const { cm, home } = boot();
  assert(cm.activePlanetId === home.id, 'G4 (empirycznie): `GameCore.boot()` związał kolonię BEZ obejścia');
  assert(ColonyManager.isPlayerColony(cm.getColony(cm.activePlanetId)) === true,
    'G4: związana kolonia jest kolonią gracza');

  // Pin ŹRÓDŁOWY — komentarze zdejmowane, inaczej pin łapie własne wyjaśnienie.
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = strip(fs.readFileSync(new URL('../../systems/ColonyManager.js', import.meta.url), 'utf8'));
  const body = src.slice(src.indexOf('switchActiveColony('), src.indexOf('switchActiveColony(') + 1400);
  assert(/isPlayerColony/.test(body), 'G4 (kontrola pinu): `switchActiveColony` faktycznie pyta o własność');
  assert(!/allowForeign|bypass|unchecked|force\s*[:=]/i.test(body),
    'G4: BRAK parametru obejścia — nic nie może przejść „przypadkiem"');
}

// ── G5 — D3=W1: wskaźniki misji/techu zostają na koloni gracza ─────────────────────────────
console.log('G5 (D3=W1, pinowane bez własnego commitu) — magazyn misji i techu nie ląduje na obcej');
{
  const { cm, P, A } = boot();
  const missionResBefore = window.KOSMOS.expeditionSystem?.resourceSystem ?? null;
  cm.switchActiveColony(A.planetId);   // odmowa

  const missionRes = window.KOSMOS.expeditionSystem?.resourceSystem ?? null;
  const techRes = window.KOSMOS.techSystem?.resourceSystem ?? null;
  assert(missionRes !== A.resourceSystem, 'G5: `MissionSystem.resourceSystem` NIE wskazuje magazynu AI');
  assert(techRes !== A.resourceSystem, 'G5: `TechSystem.resourceSystem` NIE wskazuje magazynu AI');
  assert(missionRes === missionResBefore, 'G5: wskaźnik misji został tam, gdzie był (W1, nie zerowanie)');
  assert(missionRes === P.resourceSystem || missionRes === null,
    'G5: i jest to magazyn koloni GRACZA — brak darmowego startu misji (exploit z W2)');
}

// ── G6 — D2=W1: bramka intencji odmawia, gdy związany system jest AI ──────────────────────
console.log('G6 (D2=W1, obrona w głąb) — `planet:buildRequest` ignorowane przez system koloni AI');
{
  const { A } = boot();
  const id = anyBuildingId();
  const tile = freeTile(A.buildingSystem, id);
  assert(!!tile, 'G6 przesłanka: kolonia AI ma wolny, budowalny kafel');

  window.KOSMOS.buildingSystem = A.buildingSystem;   // symulacja przyszłego wołającego, który ominął D1
  EventBus.emit('planet:buildRequest', { tile, buildingId: id });
  assert(untouched(tile), 'G6: rozkaz NIE dotarł do systemu koloni AI (termin własności w bramce)');
}

// ── G7 — KONTROLA PINU: ta sama szyna na koloni gracza działa ─────────────────────────────
console.log('G7 (KONTROLA PINU) — `planet:buildRequest` na koloni GRACZA przechodzi');
{
  const { P } = boot();
  const id = anyBuildingId();
  const tile = freeTile(P.buildingSystem, id);
  window.KOSMOS.buildingSystem = P.buildingSystem;
  EventBus.emit('planet:buildRequest', { tile, buildingId: id });
  assert(!untouched(tile), 'G7: rozkaz gracza przechodzi szyną bez zmian');
}

// ── G8 — FAIL-OPEN: goły system bez koloni ────────────────────────────────────────────────
console.log('G8 (FAIL-OPEN) — system bez rozwiązywalnego właściciela PRZEPUSZCZA');
{
  const { P } = boot();
  const id = anyBuildingId();
  const tile = freeTile(P.buildingSystem, id);

  // Wzór ~20 keeperów: goły system przypięty do locatora, bez koloni w rejestrze.
  const bare = new BuildingSystem(P.resourceSystem, P.civSystem, P.buildingSystem.techSystem);
  bare._grid = P.buildingSystem._grid;
  bare._gridHeight = P.buildingSystem._gridHeight;
  window.KOSMOS.buildingSystem = bare;
  assert(bare._planetId == null || !window.KOSMOS.colonyManager.getColony(bare._planetId),
    'G8 przesłanka: goły system nie ma koloni w rejestrze');

  EventBus.emit('planet:buildRequest', { tile, buildingId: id });
  assert(!untouched(tile), 'G8: nierozwiązywalny właściciel NIE blokuje (chroni ~20 keeperów)');
}

// ── G9 — AI nietknięte: bezpośrednie wywołanie omija szynę ────────────────────────────────
console.log('G9 (REGRESJA AI) — `ColonyAutoExpander` woła `_build` BEZPOŚREDNIO i dalej działa');
{
  const { P, A } = boot();
  const id = anyBuildingId();
  const tile = freeTile(A.buildingSystem, id);
  window.KOSMOS.buildingSystem = P.buildingSystem;   // związany jest GRACZ, nie AI

  A.buildingSystem._build(tile, id);                 // dokładnie to, co robi `ColonyAutoExpander:507`
  assert(!untouched(tile), 'G9: AI buduje na swojej koloni mimo bramek na szynie');
}

// ── G10 — FactorySystem: ta sama reguła ───────────────────────────────────────────────────
console.log('G10 (D2=W1) — `factory:setExportEnabled` odmawia na systemie AI, działa na graczu');
{
  const { P, A } = boot();
  if (A.factorySystem && P.factorySystem) {
    const aiBefore = !!A.factorySystem.exportPrefs?.enabled;
    window.KOSMOS.factorySystem = A.factorySystem;
    EventBus.emit('factory:setExportEnabled', { enabled: !aiBefore });
    assert(!!A.factorySystem.exportPrefs?.enabled === aiBefore, 'G10: fabryka koloni AI nie przyjęła rozkazu');

    const pBefore = !!P.factorySystem.exportPrefs?.enabled;
    window.KOSMOS.factorySystem = P.factorySystem;
    EventBus.emit('factory:setExportEnabled', { enabled: !pBefore });
    assert(!!P.factorySystem.exportPrefs?.enabled === !pBefore, 'G10 (kontrola pinu): fabryka gracza przyjęła');
  } else {
    assert(false, 'G10 przesłanka: obie kolonie mają FactorySystem');
  }
}

// ── G11 — CivilizationSystem: ta sama reguła ──────────────────────────────────────────────
console.log('G11 (D2=W1) — `civ:resolveMovement` odmawia na systemie AI, działa na graczu');
{
  const { P, A } = boot();
  let aiCalls = 0, pCalls = 0;
  A.civSystem.resolveMovement = () => { aiCalls++; };
  P.civSystem.resolveMovement = () => { pCalls++; };

  window.KOSMOS.civSystem = A.civSystem;
  EventBus.emit('civ:resolveMovement', { movementType: 'x', resolutionId: 'y' });
  assert(aiCalls === 0, 'G11: rozkaz nie dotarł do civSystemu koloni AI');

  window.KOSMOS.civSystem = P.civSystem;
  EventBus.emit('civ:resolveMovement', { movementType: 'x', resolutionId: 'y' });
  assert(pCalls === 1, 'G11 (kontrola pinu): rozkaz dotarł do civSystemu gracza');
}

// ── G12 — ÓSEMKA BRAMEK SYSTEMOWYCH NIETKNIĘTA ────────────────────────────────────────────
console.log('G12 (PIN „NIE DOTYKAMY") — bramki SYSTEMOWE dalej działają na koloni AI');
{
  const { A } = boot();
  window.KOSMOS.buildingSystem = A.buildingSystem;
  A.buildingSystem._civPenalty = 1.0;
  EventBus.emit('civ:unrest', { planetId: A.planetId });
  assert(A.buildingSystem._civPenalty === 0.7,
    'G12: `civ:unrest` (bramka SYSTEMOWA) dalej stosuje karę — termin własności byłby tam błędem kategorii');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
