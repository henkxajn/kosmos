// D5 / OG-1 — PRZYNALEŻNOŚĆ KAFLA: budowa, ulepszenie i rozbiórka tylko na WŁASNEJ siatce.
//
// PO CO: `docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md` §D5 (PODPISANA 2026-08-22: W1). Zmierzone
// w audycie: `BuildingSystem._build(tile, buildingId)` (`:796-1015`) **nie odwołuje się do
// `this._grid` ani razu** — klimat bierze z `_resolveOwnPlanet()` (planeta AKTYWNEJ koloni), a kafel
// przyjmuje DOWOLNY obiekt. To otwiera stan „**cudzy kafel, MÓJ portfel, MÓJ klimat**": rozkaz
// z podglądu obcej planety trafia do systemu gracza i mutuje kafel, który do niego nie należy.
//
// ⚠ TO NIE JEST TEST WŁASNOŚCI KOLONII. D5 pyta o **przynależność kafla do siatki systemu**, D1 —
//   o **właściciela kolonii**. Dwie różne osie: w tym pliku obie kolonie mogą należeć do gracza,
//   a wada i tak jest widoczna. Bramkę własności pinuje `colony_ownership_guard_smoke` (OG-3).
//
// ⚠ DLACZEGO IDENTYCZNOŚĆ, A NIE WSPÓŁRZĘDNE (T3): każda siatka ma swój kafel `"0,0"`. Porównanie
//   `q`/`r` przepuściłoby obcy kafel, ilekroć klucze się pokrywają — czyli w praktyce zawsze.
//   Jedynym uczciwym testem jest `this._grid.get(q, r) === tile`.
//
// ⚠ FAIL-OPEN JEST CZĘŚCIĄ DECYZJI, NIE NIEDOPATRZENIEM (T8/T9): `_grid` bywa ustawiane z zewnątrz
//   (`ColonyManager:622/2585/2629`, `EmpireColonyBootstrap:172/379`, `MissionSystem:2361`,
//   `SpawnTestEnemy:118`, `CombatSandbox:162/397`). System, który nie zna swojej siatki, ma
//   PRZEPUŚCIĆ — inaczej jedna niezainicjowana ścieżka wyłącza budowanie w całej grze.
//
// ⚠ REGRESJA AI (T10): `ColonyAutoExpander` bierze kafle przez `grid.forEach` z DOKŁADNIE tej samej
//   `colony.buildingSystem._grid`, na której potem woła `_build`/`_upgrade` (`:455`, `:543`).
//   `HexGrid.forEach` (`:186-195`) zwraca wynik `get(q, r)`, więc identyczność zachodzi z konstrukcji.
//   T10 pinuje ten łańcuch WYKONANIEM — bez niego bramka mogłaby po cichu zatrzymać rozbudowę AI.
//
// Uruchom: node src/testing/smoke/colony_tile_membership_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import { GameCore } from '../headless/GameCore.js';
import EntityManager from '../../core/EntityManager.js';
import EventBus from '../../core/EventBus.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { PlanetMapGenerator } from '../../map/PlanetMapGenerator.js';
import PL from '../../i18n/pl.js';
import EN from '../../i18n/en.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// Hojne zaopatrzenie — koszt nie ma być zmienną tego testu (brak surowców => `pendingBuild`,
// czyli i tak MUTACJA kafla, ale wtedy T5 nie miałby czego ulepszać).
const STOCK = {
  Fe: 99999, C: 99999, Si: 99999, Cu: 99999, Ti: 99999, Al: 99999, U: 9999, W: 9999,
  minerals: 99999, energy: 99999, organics: 99999, water: 99999,
  structural_alloys: 9999, extraction_systems: 9999, power_cells: 9999,
  conductor_bundles: 9999, electronic_systems: 9999, pressure_modules: 9999,
  habitat_modules: 9999, semiconductors: 9999,
};

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  window.KOSMOS.civMode = true;
  const cm = core.colonyManager;
  const home = window.KOSMOS.homePlanet;

  const body = EntityManager.getAll().find(e =>
    e.systemId === home.systemId && e.id !== home.id &&
    (e.type === 'planet' || e.type === 'moon') && !cm.getColony(e.id));
  const second = cm.createColony(body.id, { Fe: 50 }, 8, 0);

  const A = cm.getColony(home.id);
  const B = cm.getColony(second.planetId);
  A.resourceSystem.receive({ ...STOCK });
  B.resourceSystem.receive({ ...STOCK });
  ensureGrid(A); ensureGrid(B);

  // ⚠ NASŁUCH DOPIERO TU. `GameCore.boot()` woła `EventBus.clear()` (`GameCore.js:120`), więc
  //   handler zarejestrowany w top-levelu modułu jest kasowany przy KAŻDYM `boot()` i `last`
  //   zostaje pusty. Pierwsza wersja tego keepera tak właśnie miała — i T11 świecił na zielono
  //   dlatego, że `undefined === undefined`. Fałszywa zieleń, nie pomiar.
  const last = {};
  for (const ev of ['planet:buildResult', 'planet:upgradeResult', 'planet:demolishResult']) {
    EventBus.on(ev, (pl) => { last[ev] = pl; });
  }
  const reset = () => { for (const k of Object.keys(last)) delete last[k]; };

  return { cm, A, B, bA: A.buildingSystem, bB: B.buildingSystem, last, reset };
}

// ⚠ `createColony` (`ColonyManager:514`) NIE generuje siatki — robi to dopiero `createOutpost`
//   (`:621`), relink po wczytaniu (`:2628`) albo otwarcie mapy w `ColonyOverlay`. Tu odtwarzamy
//   dokładnie ten produkcyjny sposób wpięcia, bo bez niego test mierzyłby fail-open zamiast bramki.
function ensureGrid(colony) {
  const bSys = colony?.buildingSystem;
  if (!bSys || bSys._grid || !colony.planet) return;
  const grid = PlanetMapGenerator.generate(colony.planet, false);
  bSys._grid = grid;
  bSys._gridHeight = grid.height ?? 10;
  colony.grid = grid;
}

// Wolny kafel siatki `grid`, na którym system `bSys` UWAŻA budowę za dozwoloną (teren + klimat
// systemu, nie siatki) — dzięki temu „dziś by zbudował" jest faktem, a nie nadzieją.
function findBuildableTile(bSys, grid, buildingId, { key = null } = {}) {
  const building = BUILDINGS[buildingId];
  let found = null;
  grid.forEach(tile => {
    if (found) return;
    if (key && tile.key !== key) return;
    if (tile.isOccupied || tile.buildingId || tile.underConstruction || tile.pendingBuild) return;
    if (!bSys._canBuildOnTile(tile, building)) return;
    found = tile;
  });
  return found;
}

// Budynek bez wymogu technologii, który OBA systemy postawią na SWOJEJ siatce pod TYM SAMYM kluczem.
// Zwraca { buildingId, tileA, tileB } albo null.
function findSharedKey(bA, bB) {
  const ids = Object.values(BUILDINGS).filter(b => !b.requires && !b.isCapital).map(b => b.id);
  for (const id of ids) {
    const tA = findBuildableTile(bA, bA._grid, id);
    if (!tA) continue;
    const tB = findBuildableTile(bB, bB._grid, id, { key: tA.key });
    if (tB) return { buildingId: id, tileA: tA, tileB: tB };
  }
  return null;
}

const untouched = (t) => !t.buildingId && !t.underConstruction && !t.pendingBuild;

// ⚠ `BuildingSystem` NIE zapisuje stanu budynku NA KAFEL. `_tickConstruction` (`:1387-1435`)
//   rusza wyłącznie `_active` i emituje `planet:constructionComplete`; pola `tile.buildingId` /
//   `underConstruction` / `pendingBuild` re-derywuje UI (`ColonyOverlay._syncTileBuildings:453-490`)
//   albo AI (`ColonyAutoExpander._syncGridFromActive:652`). Headless musi zrobić to sam — inaczej
//   `_upgrade` odbija się od `!tile.buildingId` i test mierzy CISZĘ zamiast bramki.
function syncGrid(bSys) {
  const grid = bSys?._grid;
  if (!grid || typeof grid.forEach !== 'function') return;
  grid.forEach(t => { t.buildingId = null; t.buildingLevel = 1; t.underConstruction = null; t.pendingBuild = null; });
  for (const [key, entry] of bSys._active) {
    if (key.startsWith('capital_')) continue;
    const [q, r] = key.split(',').map(Number);
    const t = grid.get(q, r);
    if (t) { t.buildingId = entry.building?.id ?? entry.buildingId; t.buildingLevel = entry.level ?? 1; }
  }
  for (const [key, constr] of bSys._constructionQueue ?? []) {
    const [q, r] = key.split(',').map(Number);
    const t = grid.get(q, r); if (t) t.underConstruction = constr;
  }
  for (const [key, order] of bSys._pendingQueue ?? []) {
    const [q, r] = key.split(',').map(Number);
    const t = grid.get(q, r); if (t) t.pendingBuild = order.buildingId ?? order.building?.id;
  }
}

// Postaw i doprowadź do stanu „stoi gotowy" — na WŁASNEJ siatce systemu.
function buildAndFinish(bSys, tile, buildingId) {
  bSys._build(tile, buildingId);
  bSys._tickConstruction(50);
  syncGrid(bSys);
  return bSys._active.get(tile.key);
}

// ── T1 — budowa na CUDZYM kaflu ODRZUCONA ─────────────────────────────────────────────────
console.log('T1 — `_build` na kaflu spoza własnej siatki');
{
  const { bA, bB, last, reset } = boot();
  const id = Object.values(BUILDINGS).find(b => !b.requires && !b.isCapital).id;
  const foreign = findBuildableTile(bA, bB._grid, id);   // kafel B, ale placement liczony dla A
  assert(!!foreign, 'T1 przesłanka: istnieje kafel siatki B, który system A uznaje za dozwolony');
  const feBefore = bA.resourceSystem.getAmount('Fe');

  reset();
  bA._build(foreign, id);

  assert(untouched(foreign), 'T1: cudzy kafel NIETKNIĘTY (bez buildingId / underConstruction / pendingBuild)');
  assert(last['planet:buildResult']?.success === false, 'T1: `planet:buildResult` z `success:false`');
  assert(bA.resourceSystem.getAmount('Fe') === feBefore, 'T1: magazyn systemu A nietknięty (koniec „cudzy kafel, mój portfel")');
}

// ── T2 — KONTROLA PINU: własny kafel przechodzi ───────────────────────────────────────────
console.log('T2 (KONTROLA PINU) — `_build` na własnym kaflu działa jak dotąd');
{
  const { bA, last, reset } = boot();
  const id = Object.values(BUILDINGS).find(b => !b.requires && !b.isCapital).id;
  const own = findBuildableTile(bA, bA._grid, id);
  reset();
  bA._build(own, id);
  assert(!untouched(own), 'T2: własny kafel przyjął rozkaz (zbudowany / w budowie / w kolejce)');
  assert(last['planet:buildResult']?.success === true, 'T2: `planet:buildResult` z `success:true`');
}

// ── T3 — identyczność, nie współrzędne ────────────────────────────────────────────────────
console.log('T3 — bramka pyta o TOŻSAMOŚĆ kafla, nie o `q`/`r`');
{
  const { bA, last, reset } = boot();
  const id = Object.values(BUILDINGS).find(b => !b.requires && !b.isCapital).id;
  const own = findBuildableTile(bA, bA._grid, id);
  const clone = Object.assign(Object.create(Object.getPrototypeOf(own)), own);  // te same q/r, INNY obiekt
  assert(clone.q === own.q && clone.r === own.r && clone !== own, 'T3 przesłanka: klon ma te same współrzędne i jest innym obiektem');

  reset();
  bA._build(clone, id);
  assert(untouched(clone), 'T3: kafel-widmo o pokrywających się współrzędnych ODRZUCONY');
  assert(untouched(own), 'T3: prawdziwy kafel siatki nietknięty przy okazji');
}

// ── T4 — ulepszenie CUDZEGO kafla przy KOLIZJI klucza ─────────────────────────────────────
console.log('T4 — `_upgrade` cudzego kafla, gdy własny `_active` ma ten sam klucz');
{
  const { bA, bB, last, reset } = boot();
  const shared = findSharedKey(bA, bB);
  assert(!!shared, 'T4 przesłanka: istnieje budynek stawialny w OBU siatkach pod tym samym kluczem');
  const { buildingId, tileA, tileB } = shared;

  buildAndFinish(bA, tileA, buildingId);
  buildAndFinish(bB, tileB, buildingId);
  assert(!!bA._active.get(tileA.key) && !!bB._active.get(tileB.key) && !!tileB.buildingId,
    'T4 przesłanka: oba systemy mają GOTOWY budynek pod wspólnym kluczem');

  const lvlBefore = tileB.buildingLevel ?? 1;
  const feBefore  = bA.resourceSystem.getAmount('Fe');
  reset();
  bA._upgrade(tileB);

  assert((tileB.buildingLevel ?? 1) === lvlBefore && !tileB.underConstruction && !tileB.pendingBuild,
    'T4: cudzy kafel nie awansował ani nie wszedł w ulepszanie');
  assert(last['planet:upgradeResult']?.success === false, 'T4: `planet:upgradeResult` z `success:false`');
  assert(bA.resourceSystem.getAmount('Fe') === feBefore, 'T4: magazyn systemu A nietknięty');
}

// ── T5 — KONTROLA PINU: ulepszenie własnego kafla ─────────────────────────────────────────
console.log('T5 (KONTROLA PINU) — `_upgrade` własnego kafla działa jak dotąd');
{
  const { bA, last, reset } = boot();
  const id = Object.values(BUILDINGS).find(b => !b.requires && !b.isCapital).id;
  const own = findBuildableTile(bA, bA._grid, id);
  buildAndFinish(bA, own, id);
  assert(!!bA._active.get(own.key) && !!own.buildingId, 'T5 przesłanka: budynek GOTOWY na własnym kaflu');

  const lvlBefore = own.buildingLevel ?? 1;
  reset();
  bA._upgrade(own);
  assert((own.buildingLevel ?? 1) > lvlBefore || !!own.underConstruction || !!own.pendingBuild,
    'T5: własny kafel przyjął ulepszenie');
  assert(last['planet:upgradeResult']?.success !== false,
    'T5: brak odmowy (ani z tytułu przynależności, ani żadnej innej)');
}

// ── T6 — rozbiórka CUDZEGO kafla ──────────────────────────────────────────────────────────
console.log('T6 — `_demolish` cudzego kafla (anulowanie CUDZEJ budowy + zwrot do WŁASNEGO portfela)');
{
  const { bA, bB, last, reset } = boot();
  const id = Object.values(BUILDINGS).find(b => !b.requires && !b.isCapital).id;
  const tB = findBuildableTile(bB, bB._grid, id);
  bB._build(tB, id);
  assert(!!tB.underConstruction || !!tB.buildingId || !!tB.pendingBuild, 'T6 przesłanka: kolonia B faktycznie coś stawia');

  const feBefore = bA.resourceSystem.getAmount('Fe');
  reset();
  bA._demolish(tB);

  assert(!!tB.underConstruction || !!tB.buildingId || !!tB.pendingBuild,
    'T6: budowa koloni B NIE została anulowana przez cudzy system');
  assert(last['planet:demolishResult']?.success === false, 'T6: `planet:demolishResult` z `success:false`');
  assert(bA.resourceSystem.getAmount('Fe') === feBefore, 'T6: brak zwrotu do portfela A za cudzą inwestycję');
}

// ── T7 — KONTROLA PINU: rozbiórka własnego kafla ──────────────────────────────────────────
console.log('T7 (KONTROLA PINU) — `_demolish` własnego kafla działa jak dotąd');
{
  const { bA, last, reset } = boot();
  const id = Object.values(BUILDINGS).find(b => !b.requires && !b.isCapital).id;
  const own = findBuildableTile(bA, bA._grid, id);
  bA._build(own, id);
  reset();
  bA._demolish(own);
  assert(last['planet:demolishResult']?.success === true, 'T7: własna rozbiórka/anulowanie przechodzi');
  assert(untouched(own), 'T7: własny kafel wrócił do stanu wolnego');
}

// ── T8 — FAIL-OPEN: brak siatki ───────────────────────────────────────────────────────────
console.log('T8 (FAIL-OPEN) — system bez `_grid` PRZEPUSZCZA');
{
  const { bA, bB, last, reset } = boot();
  const id = Object.values(BUILDINGS).find(b => !b.requires && !b.isCapital).id;
  const foreign = findBuildableTile(bA, bB._grid, id);
  bA._grid = null;
  reset();
  bA._build(foreign, id);
  assert(!untouched(foreign), 'T8: przy `_grid == null` rozkaz przechodzi (bramka zawodzi OTWARCIE)');
}

// ── T9 — FAIL-OPEN: siatka nieznanego kształtu ────────────────────────────────────────────
console.log('T9 (FAIL-OPEN) — siatka bez `get()` PRZEPUSZCZA');
{
  const { bA, bB, last, reset } = boot();
  const id = Object.values(BUILDINGS).find(b => !b.requires && !b.isCapital).id;
  const foreign = findBuildableTile(bA, bB._grid, id);
  bA._grid = { forEach() {} };            // kształt à la RegionSystem — bez `get`
  reset();
  bA._build(foreign, id);
  assert(!untouched(foreign), 'T9: nieznany kształt siatki nie blokuje budowy');
}

// ── T10 — REGRESJA AI: kafel z `forEach` == kafel z `get` ─────────────────────────────────
console.log('T10 (REGRESJA AI) — ścieżka `ColonyAutoExpander` przechodzi');
{
  const { bA, last, reset } = boot();
  const id = Object.values(BUILDINGS).find(b => !b.requires && !b.isCapital).id;
  // Dokładnie to, co robi `_findFreeTile`: iteracja po `buildingSystem._grid` przez `forEach`.
  let picked = null;
  bA._grid.forEach(t => {
    if (picked) return;
    if (t.isOccupied || t.buildingId || t.underConstruction || t.pendingBuild) return;
    if (!bA._canBuildOnTile(t, BUILDINGS[id])) return;
    picked = t;
  });
  assert(!!picked && bA._grid.get(picked.q, picked.r) === picked,
    'T10: `forEach` zwraca TEN SAM obiekt co `get` (identyczność z konstrukcji `HexGrid`)');
  reset();
  bA._build(picked, id);
  assert(!untouched(picked), 'T10: rozbudowa AI nie została zatrzymana przez bramkę');
}

// ── T11 — powód odmowy jest przetłumaczony ────────────────────────────────────────────────
console.log('T11 — powód odmowy przechodzi przez i18n (PL + EN)');
{
  const KEY = 'ui.tileNotOwned';
  assert(typeof PL[KEY] === 'string' && PL[KEY].length > 0, `T11: klucz \`${KEY}\` istnieje w PL`);
  assert(typeof EN[KEY] === 'string' && EN[KEY].length > 0, `T11: klucz \`${KEY}\` istnieje w EN`);
  assert(PL[KEY] !== EN[KEY], 'T11: PL i EN to różne napisy (nie skopiowany polski)');

  const { bA, bB, last, reset } = boot();
  const id = Object.values(BUILDINGS).find(b => !b.requires && !b.isCapital).id;
  const foreign = findBuildableTile(bA, bB._grid, id);
  reset();
  bA._build(foreign, id);
  assert(typeof PL[KEY] === 'string' && last['planet:buildResult']?.reason === PL[KEY],
    'T11: odmowa niesie przetłumaczony powód, nie surowy token');
}

// == OG-1b — KONTROLA KAFLA (rozszerzenie D5, podpisane 2026-08-22) =========================
//
// ⚠ INNA OŚ NIŻ T1-T11. Tamte pytają „czy kafel leży w MOJEJ siatce" (przynależność). Te pytają
//   „czy kafel jest KONTROLOWANY przez kogoś innego" (`tile.owner`, przerzucany przez okupację
//   w `GroundUnitManager._changeTileOwner:626`). Live-gate OG-1 (c) zmierzył, że pierwsza oś
//   przepuszcza drugą: kolonia formalnie gracza + kafel zajęty przez wroga ⇒ Delete niszczył
//   budynek I ZWRACAŁ 50% kosztu (zmierzone: +10 Fe / +5 C / +1 structural_alloys za `mine`).
//   Nieodwracalność zniszczenia razem z rabatem tworzyły dochodową „spaloną ziemię" na cudzym
//   terytorium. Decyzja: blokujemy TYLKO rozbiórkę; budowa i ulepszenie zostają dozwolone (T15).
//
// ⚠ FAZA ODLICZANIA ZOSTAJE DOZWOLONA (T13). `occupyEmpireId` ustawione, ale `owner` wciąż mój =
//   kafel jeszcze MÓJ, więc rozbiórka jest obroną własnego majątku, nie niszczeniem cudzego.
//
// ⚠ FAIL-OPEN PRZY `owner == null` (T14) JEST KONIECZNY, NIE OSTROŻNOŚCIOWY. Zmierzone: na świeżo
//   wygenerowanej siatce WSZYSTKIE 300 kafli ma `owner === null` — stempel `'player'` stawia
//   wyłącznie `ColonyOverlay._ensureGrid` w gałęzi generowania. Bramka `owner !== 'player'`
//   wyłączyłaby rozbiórkę na każdej koloni, której mapy gracz nigdy nie otworzył (AI, headless,
//   świeżo wczytane).
//
// ⚠ `tile.isOccupied` NIE JEST TERMINEM OKUPACJI — to getter „stoi budynek / trwa budowa / czeka
//   w kolejce" (`HexTile:279`). Kto po niego sięgnie, zabramkuje coś zupełnie innego.

console.log('T12 (OG-1b) — `_demolish` na kaflu kontrolowanym przez OBCEGO');
{
  const { bA, last, reset } = boot();
  const id = Object.values(BUILDINGS).find(b => !b.requires && !b.isCapital).id;
  const own = findBuildableTile(bA, bA._grid, id);
  buildAndFinish(bA, own, id);
  assert(!!bA._active.get(own.key), 'T12 przesłanka: budynek GOTOWY na kaflu gracza');

  own.owner = 'emp_001';                 // dokładnie to, co pisze `GroundUnitManager:626`
  own.occupyEmpireId = 'emp_001';
  const feBefore = bA.resourceSystem.getAmount('Fe');
  const activeBefore = bA._active.size;
  reset();
  bA._demolish(own);

  assert(bA._active.size === activeBefore && !!bA._active.get(own.key),
    'T12: budynek NIE zniszczony na kaflu przejętym przez obcego');
  assert(last['planet:demolishResult']?.success === false, 'T12: planet:demolishResult z success:false');
  assert(bA.resourceSystem.getAmount('Fe') === feBefore,
    'T12: BRAK zwrotu 50% (koniec dochodowej „spalonej ziemi" na cudzym kaflu)');
}

console.log('T13 (KONTROLA PINU) — trwa odliczanie, ale `owner` WCIĄŻ mój => rozbiórka wolna');
{
  const { bA, last, reset } = boot();
  const id = Object.values(BUILDINGS).find(b => !b.requires && !b.isCapital).id;
  const own = findBuildableTile(bA, bA._grid, id);
  buildAndFinish(bA, own, id);

  own.owner = 'player';                  // stempel z `ColonyOverlay._ensureGrid`
  own.occupyEmpireId = 'emp_001';        // desant trwa, kafel jeszcze NIE przerzucony
  const activeBefore = bA._active.size;
  reset();
  bA._demolish(own);
  assert(bA._active.size === activeBefore - 1, 'T13: własny kafel pod odliczaniem DA się rozebrać');
  assert(last['planet:demolishResult']?.success === true, 'T13: brak odmowy w fazie odliczania');
}

console.log('T14 (FAIL-OPEN) — `tile.owner == null` PRZEPUSZCZA');
{
  const { bA, last, reset } = boot();
  const id = Object.values(BUILDINGS).find(b => !b.requires && !b.isCapital).id;
  const own = findBuildableTile(bA, bA._grid, id);
  buildAndFinish(bA, own, id);
  assert(own.owner == null, 'T14 przesłanka: siatka spoza `ColonyOverlay` ma `owner === null`');

  const activeBefore = bA._active.size;
  reset();
  bA._demolish(own);
  assert(bA._active.size === activeBefore - 1, 'T14: brak stempla właściciela nie blokuje rozbiórki');
  assert(last['planet:demolishResult']?.success === true, 'T14: fail-open bez odmowy');
}

console.log('T15 (PIN DECYZJI) — budowa i ulepszenie na kaflu obcego NADAL dozwolone');
{
  const { bA, last, reset } = boot();
  const id = Object.values(BUILDINGS).find(b => !b.requires && !b.isCapital).id;

  const free = findBuildableTile(bA, bA._grid, id);
  free.owner = 'emp_001';
  reset();
  bA._build(free, id);
  assert(!untouched(free), 'T15: BUDOWA na kaflu kontrolowanym przez obcego przechodzi (świadomie poza OG-1b)');
  assert(last['planet:buildResult']?.success === true, 'T15: brak odmowy przy budowie');

  const up = findBuildableTile(bA, bA._grid, id);
  buildAndFinish(bA, up, id);
  up.owner = 'emp_001';
  const lvlBefore = up.buildingLevel ?? 1;
  reset();
  bA._upgrade(up);
  assert((up.buildingLevel ?? 1) > lvlBefore || !!up.underConstruction || !!up.pendingBuild,
    'T15: ULEPSZENIE na kaflu kontrolowanym przez obcego przechodzi (świadomie poza OG-1b)');
}

console.log('T16 — powód odmowy OG-1b przechodzi przez i18n i JEST INNY niż powód D5');
{
  const KEY = 'ui.tileEnemyControlled';
  assert(typeof PL[KEY] === 'string' && PL[KEY].length > 0, 'T16: klucz ' + KEY + ' istnieje w PL');
  assert(typeof EN[KEY] === 'string' && EN[KEY].length > 0, 'T16: klucz ' + KEY + ' istnieje w EN');
  assert(PL[KEY] !== EN[KEY], 'T16: PL i EN to różne napisy');
  assert(PL[KEY] !== PL['ui.tileNotOwned'],
    'T16: inny powód niż przynależność — diagnostyka odtwarza REALNĄ ścieżkę decyzji, nie uśrednia dwóch osi');

  const { bA, last, reset } = boot();
  const id = Object.values(BUILDINGS).find(b => !b.requires && !b.isCapital).id;
  const own = findBuildableTile(bA, bA._grid, id);
  buildAndFinish(bA, own, id);
  own.owner = 'emp_001';
  reset();
  bA._demolish(own);
  assert(typeof PL[KEY] === 'string' && last['planet:demolishResult']?.reason === PL[KEY],
    'T16: odmowa niesie przetłumaczony powód kontroli kafla');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
