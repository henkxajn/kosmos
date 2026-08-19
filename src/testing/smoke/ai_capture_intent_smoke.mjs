// AI CAPTURE — intencja terytorialna jednostek desantowych (commit AC-4, D1 + D1b).
//
// PO CO: warunek przejęcia wymaga, żeby gracz NIE MIAŁ wojska, a wojsko gracza było JEDYNYM
// magnesem ruchu AI (`_tickCombatAI` → `if (!best) continue`). Te dwa warunki wykluczały się
// wzajemnie — to jest cały Finding 51. AC-4 daje najeźdźcy cel TERYTORIALNY: brak żywego celu
// ⇒ marsz na kafel `capitalBase` (fallback: najbliższy kafel z budynkiem), po dojściu „hold".
//
//   T1  Najeźdźca bez żywego celu DOCHODZI do stolicy i ją przewraca (marsz + timer okupacji).
//   T2  R-1: najeźdźca na WŁASNEJ koloni STOI. Predykat porównuje `colony.ownerEmpireId`
//       z `unit.owner` — oparcie się o rekord inwazji wysyłałoby go na WŁASNĄ stolicę w kółko
//       (po przejęciu rekord gaśnie, a jednostek nikt nie usuwa).
//   T3  Jednostki GRACZA są nietknięte — pętla wyklucza je na wejściu.
//   T4  ⛔ PIN PRZECIW PUŁAPCE R-2: `CombatSystem.tick` jest NADAL wołany. `_tickCombatAI` to
//       JEDYNE produkcyjne wejście do walki naziemnej CAŁEJ gry (w tym gracza) — guard na
//       POCZĄTKU funkcji wyłączyłby ją wszystkim i nic by nie krzyknęło. Dlatego D1b=W1b każe
//       zmieniać CIAŁO pętli, a ten pin tego pilnuje.
//   T5  Ciało BEZ stolicy (placówka): cel to najbliższy kafel z BUDYNKIEM. Bez tej gałęzi
//       AC-6 („placówka zdobywalna") nie miałby jak zadziałać — nie byłoby czego okupować.
//   T6  Powody odmowy są NAZWANE i trafiają do audytu (`groundUnit:territorialBlocked`
//       + wpis w `DebugLog.TRACKED_EVENTS`), emitowane raz na ZMIANĘ powodu, nie co tik.
//   T7  `_findTerritorialGoal` — czysta geometria, pinowana osobno (stolica przed budynkiem;
//       kafle JUŻ nasze pomijane; wszystko nasze ⇒ null, czyli „stój").
//
// ⚠ Harness: `GameCore` NIE montuje `CombatSystem` (nikt nikogo nie zabija) i NIE stempluje
//    `tile.owner` — oba obchodzone jawnie, jak w `ai_capture_seams_smoke`.
//
// Uruchom: node src/testing/smoke/ai_capture_intent_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import debugLog from '../../core/DebugLog.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const EMP = 'emp_001';

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
    tick: (y) => new Ticker(core.timeSystem).run(y, { tickSize: 1.0, stopOnCrash: true }),
  };
}

const tiles     = (c) => c.grid.toArray().filter(Boolean);
const capitalOf = (c) => tiles(c).find(t => t.capitalBase);
const farLand   = (c) => {
  const land = tiles(c).filter(t => t.type !== 'ocean' && !t.capitalBase && !t.buildingId);
  return land[land.length - 1];
};

// ── T1 — marsz na stolicę domyka pętlę ──────────────────────────────────────────────────────
console.log('T1 — najeźdźca bez żywego celu DOCHODZI do stolicy i ją przewraca');
{
  const { colony, home, gum, tick } = boot();
  const cap = capitalOf(colony);
  const start = farLand(colony);
  const enemy = gum.createUnit('infantry', home.id, start.q, start.r, { owner: EMP });

  const intents = [];
  EventBus.on('groundUnit:territorialIntent', (d) => intents.push(d));

  tick(40);

  assert(intents.some(i => i.unitId === enemy.id && i.goalKind === 'capital'),
    `T1: padł rozkaz marszu na STOLICĘ (${intents.filter(i => i.goalKind === 'capital').length} ` +
    'zdarzeń `groundUnit:territorialIntent`) — intencja jest OGŁOSZONA, nie domyślona z ruchu');
  assert(enemy.q === cap.q && enemy.r === cap.r,
    `T1 SEDNO: najeźdźca STOI NA STOLICY (${enemy.q},${enemy.r} vs ${cap.q},${cap.r}) — doszedł ` +
    'i się zatrzymał. „Hold" nie jest osobnym stanem: dojście do celu ZNACZY stanie');
  assert(cap.owner === EMP,
    `T1 SEDNO 2: …i kafel stolicy zmienił ręce (${cap.owner}). Marsz + timer okupacji domykają ` +
    'pętlę BEZ udziału walki — to jest dokładnie odczyt nr 1 z GATE 1');
}

// ── T2 — R-1: własna kolonia ────────────────────────────────────────────────────────────────
console.log('T2 — R-1: najeźdźca na WŁASNEJ koloni STOI (predykat po właścicielu kolonii)');
{
  const { colony, home, gum, tick } = boot();
  colony.ownerEmpireId = EMP;                        // kolonia JUŻ przejęta
  const start = farLand(colony);
  const enemy = gum.createUnit('infantry', home.id, start.q, start.r, { owner: EMP });

  const blocked = [];
  EventBus.on('groundUnit:territorialBlocked', (d) => blocked.push(d));
  tick(30);

  assert(enemy.q === start.q && enemy.r === start.r,
    `T2 SEDNO: najeźdźca NIE RUSZYŁ SIĘ (${enemy.q},${enemy.r}). Po udanym przejęciu rekord ` +
    'inwazji gaśnie, a jednostek NIKT nie usuwa — predykat oparty o rekord wysłałby je w kółko ' +
    'na WŁASNĄ stolicę (R-1)');
  assert(blocked.some(b => b.unitId === enemy.id && b.reason === 'own_colony'),
    `T2: …i powiedział DLACZEGO (\`${blocked.map(b => b.reason).join(',') || '—'}\`) — bezruch ` +
    'z nazwanym powodem jest odróżnialny od bezruchu z niepodłączonej reguły');
  assert(blocked.filter(b => b.unitId === enemy.id && b.reason === 'own_colony').length === 1,
    `T2: powód poleciał DOKŁADNIE RAZ przez 30 civYears (dedupe po zmianie powodu) — bez tego ` +
    'ring buffer `DebugLog` zalałby się jednym stojącym najeźdźcą');
}

// ── T3 — jednostki gracza nietknięte ────────────────────────────────────────────────────────
console.log('T3 — jednostki GRACZA nietknięte (pętla wyklucza je na wejściu)');
{
  const { colony, home, gum, tick } = boot();
  const start = farLand(colony);
  const mine = gum.createUnit('infantry', home.id, start.q, start.r, { owner: 'player' });
  const cap = capitalOf(colony);

  tick(30);

  assert(mine.q === start.q && mine.r === start.r,
    `T3 SEDNO: jednostka GRACZA stoi tam, gdzie ją postawiono (${mine.q},${mine.r}) — nowa gałąź ` +
    'siedzi ZA bramką `!atk.owner || atk.owner === "player"`, więc nie tyka wojska gracza');
  assert(cap.owner === 'player',
    'T3: …i nikt nie „okupował" własnej stolicy');
}

// ── T4 — ⛔ pin przeciw pułapce R-2 ─────────────────────────────────────────────────────────
console.log('T4 — ⛔ `CombatSystem.tick` NADAL wołany (guard na starcie funkcji wyłączyłby walkę CAŁEJ gry)');
{
  const { core, home, gum, tick } = boot();
  let combatTicks = 0;
  window.KOSMOS.combatSystem = { tick: () => { combatTicks++; } };

  // Scena, w której NIE MA komu maszerować — najgorszy przypadek dla naiwnego early-return.
  tick(5);
  assert(combatTicks >= 5,
    `T4 SEDNO: \`CombatSystem.tick\` wykonał się ${combatTicks}× mimo braku jakichkolwiek jednostek. ` +
    '`_tickCombatAI` to JEDYNE produkcyjne wejście do walki naziemnej — guard na POCZĄTKU funkcji ' +
    'wyłączyłby ją wszystkim, w tym GRACZOWI, i nic by nie krzyknęło (R-2). Dlatego D1b=W1b każe ' +
    'zmieniać CIAŁO pętli');

  const before = combatTicks;
  gum.createUnit('infantry', home.id, 0, 0, { owner: EMP });
  tick(5);
  assert(combatTicks > before,
    'T4 KONTROLA PINU: …i tyka dalej, gdy na planecie POJAWIA SIĘ najeźdźca — czyli licznik mierzy ' +
    'żywą delegację, a nie zamrożoną wartość');
  delete window.KOSMOS.combatSystem;
}

// ── T5 — placówka: cel budynkowy ────────────────────────────────────────────────────────────
console.log('T5 — ciało BEZ stolicy: celem jest najbliższy kafel Z BUDYNKIEM');
{
  const { core, cm, gum, tick } = boot();
  const aiSys = EntityManager.get(cm.getAllColonies().find(c => c.ownerEmpireId)?.planetId)?.systemId;
  const free = EntityManager.getAll().find(e =>
    e.systemId === aiSys && (e.type === 'planet' || e.type === 'moon') && !cm.getColony(e.id));
  const outpost = cm.createOutpost(free.id, { Fe: 100 }, 0);
  for (const t of outpost.grid.toArray()) if (t) t.owner = 'player';

  // Placówka startuje bez budynków — stawiamy jeden, żeby było o co walczyć.
  const land = outpost.grid.toArray().filter(t => t && t.type !== 'ocean');
  const target = land[0];
  target.buildingId = 'autonomous_mine';
  const start = land[land.length - 1];

  assert(outpost.grid.toArray().every(t => !t?.capitalBase),
    'T5: placówka NIE MA kafla `capitalBase` — inaczej test mierzyłby gałąź stolicy');

  const enemy = gum.createUnit('infantry', outpost.planetId, start.q, start.r, { owner: EMP });
  const intents = [];
  EventBus.on('groundUnit:territorialIntent', (d) => intents.push(d));
  tick(40);

  assert(intents.some(i => i.unitId === enemy.id && i.goalKind === 'building'),
    'T5 SEDNO: rozkaz poszedł na kafel Z BUDYNKIEM (`goalKind: "building"`) — bez tej gałęzi ' +
    'AC-6 („placówka zdobywalna") nie miałby czego okupować i byłby martwą literą');
  assert(target.owner === EMP,
    `T5: …i kafel z budynkiem zmienił ręce (${target.owner}) — dokładnie ten stan czyta lustro ` +
    'warunku budynkowego z AC-6');
}

// ── T6 — powody odmowy w audycie ────────────────────────────────────────────────────────────
console.log('T6 — powody odmowy NAZWANE i śledzone w `DebugLog` (kontrakt „nigdy cisza")');
{
  const { colony, home, gum, tick } = boot();
  // ⚠ `GameCore.boot()` robi `EventBus.clear()`, więc singleton `DebugLog` trzeba podpiąć
  //   ponownie — dokładnie tak, jak robi to `GameScene.start()`. Bez tego pin mierzyłby
  //   odcięty ring buffer, a nie kontrakt audytu.
  debugLog.clear();
  debugLog.attach();

  const start = farLand(colony);
  const garrison = gum.createUnit('garrison', home.id, start.q, start.r, { owner: EMP });
  const blocked = [];
  EventBus.on('groundUnit:territorialBlocked', (d) => blocked.push(d));
  tick(10);

  assert(debugLog.query({ kind: 'groundUnit:territorialBlocked' }).length > 0,
    'T6 SEDNO: powód odmowy REALNIE LĄDUJE w ring bufferze `DebugLog` (pin przez WYKONANIE, ' +
    'nie przez odczyt listy stałych) — bo `groundUnit:territorialBlocked` dopisano do ' +
    '`TRACKED_EVENTS` w TYM SAMYM commicie co regułę. W3 dwa razy zmierzył CISZĘ tam, gdzie ' +
    'system mówił, właśnie z powodu braku tego wpisu');

  assert(garrison?.role === 'defensive' && (garrison.q === start.q && garrison.r === start.r),
    'T6: legacy `garrison` (desantowany przez archetypy `trader`/`isolationist`) nie ruszył się…');
  assert(blocked.some(b => b.unitId === garrison.id && b.reason === 'unit_immobile'),
    `T6: …i wiadomo DLACZEGO: \`unit_immobile\` (\`speedHex = 0\`, jednostka stacjonarna z ` +
    'definicji). Bez nazwanego powodu wyglądałoby to identycznie jak deadlock sprzed AC-4');
}

// ── T7 — czysta geometria wyboru celu ───────────────────────────────────────────────────────
console.log('T7 — `_findTerritorialGoal`: stolica przed budynkiem, kafle JUŻ nasze pomijane');
{
  const { gum } = boot();
  const unit = { q: 0, r: 0, owner: EMP };
  const mk = (q, r, extra) => ({ q, r, owner: 'player', buildingId: null, capitalBase: false, ...extra });

  const withCapital = { grid: { toArray: () => [
    mk(5, 0, { buildingId: 'farm' }), mk(9, 0, { capitalBase: true }),
  ] } };
  const g1 = gum._findTerritorialGoal(unit, withCapital);
  assert(g1?.kind === 'capital' && g1.q === 9,
    `T7: przy istniejącej stolicy cel to STOLICA (${g1?.kind} @${g1?.q}) — nawet gdy kafel ` +
    'z budynkiem jest BLIŻEJ. Warunek przejęcia pyta o stolicę, więc marsz ma iść tam');

  const capitalAlreadyOurs = { grid: { toArray: () => [
    mk(5, 0, { buildingId: 'farm' }), mk(9, 0, { capitalBase: true, owner: EMP }),
  ] } };
  const g1b = gum._findTerritorialGoal(unit, capitalAlreadyOurs);
  assert(g1b?.kind === 'capital' && g1b.q === 9,
    'T7 SEDNO „HOLD": stolica JUŻ NASZA nadal jest celem — dzięki temu jednostka, która na niej ' +
    'stoi, widzi cel pod sobą i STOI (ciało pętli robi `holding`). Pomijanie kafli już naszych ' +
    'wysyłałoby ją po kolejne budynki i porzucałaby kafel decydujący o własności kolonii');

  const noCapital = { grid: { toArray: () => [
    mk(7, 0, { buildingId: 'mine' }), mk(3, 0, { buildingId: 'farm' }),
  ] } };
  const g2 = gum._findTerritorialGoal(unit, noCapital);
  assert(g2?.kind === 'building' && g2.q === 3,
    `T7: bez stolicy (placówka) cel to NAJBLIŻSZY kafel z budynkiem (${g2?.q} zamiast 7)`);

  const nothingToTake = { grid: { toArray: () => [mk(9, 0), mk(3, 0)] } };
  assert(gum._findTerritorialGoal(unit, nothingToTake) === null,
    'T7: ciało bez stolicy I bez budynków nie daje celu (`null`) — jednostka stoi zamiast ' +
    'dreptać po pustych kaflach');

  assert(gum._findTerritorialGoal(unit, { grid: null }) === null,
    'T7 KONTROLA PINU: ciało bez siatki nie wywraca wyboru celu (`null`, nie wyjątek)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
