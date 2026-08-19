// AI CAPTURE — keeper szwów przejęcia kolonii przez AI (commit AC-0, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: ta połowa silnika ma DZIŚ ZERO pokrycia (audyt §A11 — `grep -rln
// "_tickCaptureChecks\|_captureColony\|defenders_repelled" src/testing/` zwracał pustkę). Plan
// `docs/design/AI_CAPTURE_PLAN.md` zmienia zachowanie sześciu szwów w commitach AC-2..AC-7. Bez
// pinu ZMIERZONEGO PRZED zmianą nikt nie odróżni „naprawiliśmy szew" od „przestawiliśmy coś obok".
//
//   T1 (a) A5 — DEADLOCK: najeźdźca bez ŻYWEGO celu nie rusza się przez 30 civYears.
//              KONTROLA PINU: postaw jednostkę gracza — TEN SAM najeźdźca rusza.
//   T2 (b) A6 — `if (!capital) continue`: placówka NIE PADA, choć agresor trzyma WSZYSTKIE kafle.
//              KONTROLA PINU: dostaw `capitalBase` do tej samej siatki — ta sama scena PADA.
//   T3 (c) A3 — `garrison_unit` (rola `defensive`) NIE blokuje przejęcia.
//              KONTROLA PINU: `infantry` (rola `military`) blokuje.
//   T4 (d) A4 — timer okupacji liczony w latach WYŚWIETLANYCH (`OCCUPY_DURATION = 6/12` mierzone
//              przez `timeSystem.gameTime`), NIE w civYears. KONTROLA PINU: po 5 civYears — czyli
//              DZIESIĘCIOKROTNIE dłużej niż „0.5 civYear" z komentarza — kafel wciąż jest gracza.
//   T5 (e) A7 — przejęcie domyka rekord `endReason:'colony_captured'`.
//              KONTROLA PINU: śmierć najeźdźców daje `defenders_repelled` — gałąź repel biegnie
//              PRZED testem stolicy, więc to ONA gasi kampanię, gdy zginie ostatni najeźdźca.
//   T6 (f) A13 — ✅ ODWRÓCONE W AC-3: trzej producenci darmowych jednostek startowych gracza
//              NIE ISTNIEJĄ. Pełny dowód (kontrole pinu + część wykonaniowa): `startup_units_zero_smoke`.
//
// ⚠ TO SĄ PINY STANU SPRZED SLICE'U, NIE PINY POPRAWNOŚCI. Cztery z sześciu mają PAŚĆ i zostać
//    świadomie odwrócone — wzór `deploy_seams_smoke` (W2-0) i `war_seams_smoke` (W1-0):
//      (a) → AC-4  (intencja terytorialna: najeźdźca RUSZY bez żywego celu)        [czeka]
//      (b) → AC-6  (lustro warunku budynkowego: placówka stanie się zdobywalna)    [czeka]
//      (c) → AC-5  (symetryczny predykat: KAŻDA żywa jednostka zablokuje)          [czeka]
//      (f) → AC-3  (D8: trzej producenci znikają)                                  ✅ ZROBIONE
//    Przetrwać bez edycji mają WYŁĄCZNIE (d) timer i (e) księga. ⚠ Sprostowanie do §Testy planu,
//    który zapowiadał JEDNO odwrócenie (f): pozostałe trzy wynikają wprost z treści AC-4/AC-5/AC-6
//    i nie są niespodzianką — są planem. Kto odwraca pin, PRZEPISUJE tę listę, nie kasuje testu.
//
// ⚠ CZTERY OGRANICZENIA HARNESSU — każde obchodzone JAWNIE, inaczej test mierzy ciszę:
//   1. `GameCore` NIE montuje `CombatSystem` ⇒ w headless nikt nikogo nie zabija. Żaden pin tutaj
//      nie zakłada rozstrzygnięcia walki; „wybicie obrońcy" symulujemy `removeUnit`.
//   2. `GameCore` NIE stempluje `tile.owner` (kafle zostają `null` — zmierzone). Bez stempla
//      jednostka GRACZA jest „obcym okupantem" na własnym kaflu, a timer okupacji zeruje się w
//      każdym tiku. Każdy blok stempluje siatkę jawnie (`stampPlayerOwnership`) — lustro gałęzi
//      REGENERACJI siatki w `ColonyOverlay`, jedynego miejsca, które robi to w produkcie.
//   3. `GameCore` NIE montuje `stationSystem` — nieistotne dla tych pinów, ale zaśmieca log
//      ostrzeżeniem `[EmpireBootstrap] … żeton stacji NIE zasiany`. To NIE jest defekt.
//   4. ⚠ NOWE (odkryte przy pisaniu tego keepera): `src/scenes/GameScene.js` i
//      `src/ui/ColonyOverlay.js` NIE IMPORTUJĄ SIĘ pod node — GameScene ciągnie
//      `three/addons/postprocessing/EffectComposer.js` (brak w `exports` pakietu `three`),
//      ColonyOverlay wywraca się na `THREE.TextureLoader is not a constructor`. Dlatego pin (f)
//      jest PINEM ŹRÓDŁOWYM (wzór `war_seams_smoke` T2b, memory `source-pin-strip-comments`),
//      a nie wykonaniowym: trzech producentów z D8 NIE DA SIĘ w tym harnessie uruchomić.
//
// ⚠ `GameCore.boot()` robi `EventBus.clear()` (`:120`) i `gameState.reset()` (`:246`), więc każdy
//    blok jest izolowany. Rekordy inwazji wybieramy po `planetId`, nigdy przez `[0]` — dwa boot-y
//    w jednym procesie zostawiłyby dwa rekordy i pin czytałby cudzy.
//
// Uruchom: node src/testing/smoke/ai_capture_seams_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (window/document/THREE + seeded RNG)
import { GameCore } from '../headless/GameCore.js';
import { Ticker } from '../headless/Ticker.js';
import EntityManager from '../../core/EntityManager.js';
import gameState from '../../core/GameState.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const EMP = 'emp_001';
const CIV_PER_GAME_YEAR = GAME_CONFIG.CIV_TIME_SCALE;   // 12 — 1 civYear = 1 WYŚWIETLANY miesiąc

/** Stempel własności kafli — obejście ograniczenia harnessu nr 2 (patrz nagłówek). */
function stampPlayerOwnership(colony) {
  for (const t of colony.grid?.toArray?.() ?? []) if (t) t.owner = 'player';
}

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  const home = window.KOSMOS.homePlanet;
  const colony = core.colonyManager.getColony(home.id);
  stampPlayerOwnership(colony);
  return {
    core, home, colony,
    cm:  core.colonyManager,
    gum: core.groundUnitManager,
    inv: core.invasionSystem,
    tick: (civYears) => new Ticker(core.timeSystem).run(civYears, { tickSize: 1.0, stopOnCrash: true }),
  };
}

const tiles     = (colony) => colony.grid.toArray().filter(Boolean);
const capitalOf = (colony) => tiles(colony).find(t => t.capitalBase);
const recordFor = (planetId) =>
  Object.values(gameState.get('invasions') ?? {}).find(i => i.planetId === planetId) ?? null;

// ── T1 (a) — A5: najeźdźca bez celu STOI ────────────────────────────────────────────────────
console.log('T1 (a) — A5 DEADLOCK: najeźdźca bez żywego celu nie rusza się (→ odwrócone w AC-4)');
{
  const { colony, home, gum, tick } = boot();
  const cap = capitalOf(colony);
  const land = tiles(colony).filter(t => t.type !== 'ocean' && !t.capitalBase && !t.buildingId);
  const start = land[land.length - 1];

  const enemy = gum.createUnit('infantry', home.id, start.q, start.r, { owner: EMP });
  assert(enemy?.role === 'military' && (enemy.hp ?? 0) > 0,
    `T1: najeźdźca jest jednostką BOJOWĄ (rola=${enemy?.role}, hp=${enemy?.hp}) — gdyby był ` +
    '`civilian`, bezruch dowodziłby filtra ról z pętli, a nie deadlocku celowania');
  assert(gum.getUnitsOnPlanet(home.id).filter(u => (u.owner ?? 'player') === 'player').length === 0,
    'T1: na planecie NIE MA ani jednej jednostki gracza — to jest cała przesłanka pinu');

  tick(30);

  assert(enemy.q === start.q && enemy.r === start.r,
    `T1 SEDNO: po 30 civYears najeźdźca STOI w punkcie zrzutu (${enemy.q},${enemy.r}). Jedyny mover ` +
    'jednostek naziemnych (`GroundUnitManager._tickCombatAI`) celuje w najbliższą ŻYWĄ jednostkę ' +
    'gracza i przy jej braku robi `if (!best) continue`. To jest Finding 51 w jednej asercji: ' +
    'warunek „armia wybita" i warunek „stolica zdobyta" wykluczają się wzajemnie');
  assert(cap.owner === 'player',
    'T1: stolica pozostaje gracza — bo nikt do niej nie idzie (skutek tego samego deadlocku)');

  // KONTROLA PINU — bez niej „stoi" mogłoby znaczyć „mover w ogóle nie działa w headless".
  const target = land[0];
  const before = { q: enemy.q, r: enemy.r };
  gum.createUnit('infantry', home.id, target.q, target.r, { owner: 'player' });
  tick(10);
  assert(enemy.q !== before.q || enemy.r !== before.r,
    `T1 KONTROLA PINU: gdy pojawia się ŻYWY cel, ten sam najeźdźca RUSZA (${before.q},${before.r} → ` +
    `${enemy.q},${enemy.r}). Mover działa — brakuje mu wyłącznie intencji terytorialnej`);
}

// ── T2 (b) — A6: placówka niezdobywalna ─────────────────────────────────────────────────────
console.log('T2 (b) — A6: `if (!capital) continue` — placówka NIE PADA (→ odwrócone w AC-6)');
{
  const { home, cm, inv, tick } = boot();
  const free = EntityManager.getAll().filter(e =>
    e.systemId === home.systemId && e.id !== home.id &&
    (e.type === 'planet' || e.type === 'moon') && !cm.getColony(e.id));
  const outpost = cm.createOutpost(free[0].id, { Fe: 100 }, 0);

  assert(!!outpost && outpost.isOutpost === true && !!outpost.grid,
    'T2: placówka gracza istnieje i MA siatkę (`ColonyManager.createOutpost`) — desant się na niej UDAJE');
  assert(outpost.grid.toArray().filter(t => t?.capitalBase).length === 0,
    'T2: …i NIE MA kafla `capitalBase` — brak stolicy jest utrwaloną decyzją projektową, ' +
    'nie przypadkiem (`createOutpost` jej nie stawia, picker ją wyklucza, heal-up pomija placówki)');

  const res = inv.launchInvasion(EMP, outpost.planetId, 2);
  assert(res?.success === true,
    `T2: desant na placówkę PRZECHODZI (${res?.reason ?? 'ok'}) — to jest wyciek „wiecznej inwazji" ` +
    '(Finding 53), który AC-2 zamyka pomostem po stronie WYBORU CELU');

  for (const t of outpost.grid.toArray()) if (t) t.owner = EMP;   // agresor trzyma DOSŁOWNIE wszystko
  tick(5);

  assert(!outpost.ownerEmpireId,
    `T2 SEDNO: placówka NIE zmieniła właściciela (${outpost.ownerEmpireId ?? 'gracz'}) mimo że agresor ` +
    'trzyma WSZYSTKIE kafle i nie ma żadnego obrońcy. Jedyny powód: `_tickCaptureChecks` robi ' +
    '`if (!capital) continue` — pętla wychodzi, zanim cokolwiek policzy');
  const rec = recordFor(outpost.planetId);
  assert(rec?.active === true && !rec?.endReason,
    'T2: a rekord kampanii zostaje AKTYWNY bez końca (`active=true`, brak `endReason`) — ' +
    'dokładnie ten stan trafia do KAŻDEGO zapisu (Finding 53)');

  // KONTROLA PINU — jedna flaga na tej samej siatce przewraca wynik.
  const anyLand = outpost.grid.toArray().find(t => t && t.type !== 'ocean');
  anyLand.capitalBase = true; anyLand.owner = EMP;
  tick(3);
  assert(outpost.ownerEmpireId === EMP,
    `T2 KONTROLA PINU: po dostawieniu JEDNEJ flagi \`capitalBase\` ta sama scena kończy się ` +
    `przejęciem (właściciel=${outpost.ownerEmpireId}). Pin mierzy więc TĘ bramkę, a nie brak ` +
    'jednostek, brak rekordu ani martwy tick');
}

// ── T3 (c) — A3: „armia wybita" znaczy dziś „zero jednostek o roli military" ─────────────────
console.log('T3 (c) — A3: `garrison_unit` (rola `defensive`) NIE blokuje przejęcia (→ odwrócone w AC-5)');
{
  const { colony, home, gum, inv, tick } = boot();
  const cap = capitalOf(colony);
  inv.launchInvasion(EMP, home.id, 2);
  cap.owner = EMP;                                   // stolica już w rękach agresora

  const garrison = gum.createUnit('garrison_unit', home.id, cap.q + 1, cap.r, { owner: 'player' });
  assert(garrison?.role === 'defensive' && (garrison.hp ?? garrison.currentHP ?? 0) > 0,
    `T3: garnizon gracza ŻYJE i ma rolę \`${garrison?.role}\` (hp=${garrison?.hp ?? garrison?.currentHP}) — ` +
    'rola instancji jest LEGACY (`mapRoleToLegacy`), nie archetypowa `defense`');

  tick(4);

  assert(colony.ownerEmpireId === EMP,
    `T3 SEDNO: kolonia PADA (właściciel=${colony.ownerEmpireId}) MIMO żywego garnizonu na sąsiednim ` +
    'kaflu. `_tickCaptureChecks` filtruje `u.role === "military"`, więc `defensive`/`support`/' +
    '`drone`/`civilian` nie są dla niego armią. Predykat GRACZA blokuje na KAŻDEJ żywej jednostce — ' +
    'ta asymetria jest przedmiotem D3');
}
{
  const { colony, home, gum, inv, tick } = boot();
  const cap = capitalOf(colony);
  inv.launchInvasion(EMP, home.id, 2);
  cap.owner = EMP;
  const inf = gum.createUnit('infantry', home.id, cap.q + 1, cap.r, { owner: 'player' });
  assert(inf?.role === 'military', `T3 KONTROLA PINU: piechota ma rolę \`${inf?.role}\``);
  tick(4);
  assert(!colony.ownerEmpireId,
    'T3 KONTROLA PINU: ta sama scena z PIECHOTĄ (rola `military`) NIE kończy się przejęciem — ' +
    'czyli T3 mierzy filtr ROLI, a nie „przejęcie zawsze przechodzi"');
}

// ── T4 (d) — A4: timer okupacji w latach WYŚWIETLANYCH ──────────────────────────────────────
console.log('T4 (d) — A4: timer okupacji liczony w latach WYŚWIETLANYCH, nie w civYears');
{
  const { core, colony, home, gum, tick } = boot();
  const b = tiles(colony).find(t => t.buildingId && !t.capitalBase);
  assert(!!b && b.owner === 'player',
    `T4: kafel Z BUDYNKIEM (${b?.buildingId}) należy do gracza — pusty kafel flipuje NATYCHMIAST ` +
    '(`_captureHexOnEntry`), więc timer da się zmierzyć wyłącznie na kaflu zabudowanym');

  const enemy = gum.createUnit('infantry', home.id, b.q, b.r, { owner: EMP });

  // ⚠ Pętla chodzi do końca NAWET po flipie — gdyby urywała się na pierwszej zmianie rąk, mutacja
  //   przyspieszająca timer (R-3) cicho POMIJAŁABY kontrolę pinu z i===5 i liczba asercji spadłaby
  //   bez śladu. Flip zapisujemy przy PIERWSZYM zaobserwowaniu.
  let flipCivYears = null, flipGameTime = null;
  for (let i = 1; i <= 12; i++) {
    tick(1);
    if (i === 5) {
      assert(b.owner === 'player',
        'T4 KONTROLA PINU: po 5 civYears kafel WCIĄŻ jest gracza. Gdyby próg był „0.5 civYear" ' +
        '(tak mówią komentarze w kilku miejscach), zmiana rąk nastąpiłaby po PIERWSZYM ticku — ' +
        'ten pin odróżnia jedno od drugiego DZIESIĘCIOKROTNĄ różnicą, nie zaokrągleniem');
      assert(b.occupyEmpireId === EMP && b.occupyStart != null,
        'T4: …a licznik JEDNAK biegnie (`occupyEmpireId`/`occupyStart` ustawione) — kafel nie stoi ' +
        'dlatego, że okupacji nikt nie zauważył');
    }
    if (b.owner === EMP && flipCivYears === null) { flipCivYears = i; flipGameTime = core.timeSystem.gameTime; }
  }

  assert(enemy.q === b.q && enemy.r === b.r,
    'T4: najeźdźca przez cały pomiar STAŁ na kaflu (deadlock z T1 działa tu na naszą korzyść — ' +
    'gdyby odszedł, `_cleanupStaleOccupations` wyzerowałby licznik i pin mierzyłby artefakt)');
  assert(flipCivYears !== null && flipCivYears >= CIV_PER_GAME_YEAR / 2,
    `T4 SEDNO: kafel zmienia ręce po ${flipCivYears} civYears — czyli po ≥ ${CIV_PER_GAME_YEAR / 2} ` +
    '(6 WYŚWIETLANYCH miesięcy), bo `elapsed = timeSystem.gameTime − tile.occupyStart` jest liczone ' +
    'w latach WYŚWIETLANYCH, a `OCCUPY_DURATION = 6/12` to pół roku WYŚWIETLANEGO. „Naprawa" ' +
    'komentarza na 0.5 civYear dałaby przejęcia 12× szybsze (R-3 planu)');
  assert(flipGameTime !== null && flipGameTime >= 0.5 && flipGameTime < 1.0,
    `T4: zegar WYŚWIETLANY w chwili flipu = ${flipGameTime?.toFixed(3)} roku — próg 0.5 przekroczony, ` +
    'pełny rok jeszcze nie minął (pin na WARTOŚCI, nie tylko na kolejności)');
}

// ── T5 (e) — A7: księga kampanii ────────────────────────────────────────────────────────────
console.log('T5 (e) — A7: przejęcie domyka rekord `colony_captured`; repel biegnie PRZED testem stolicy');
{
  const { colony, home, inv, tick } = boot();
  const cap = capitalOf(colony);
  inv.launchInvasion(EMP, home.id, 2);
  cap.owner = EMP;
  tick(3);

  const rec = recordFor(home.id);
  assert(colony.ownerEmpireId === EMP, 'T5: kolonia przeszła w ręce agresora (przesłanka)');
  assert(rec?.active === false && rec?.endReason === 'colony_captured' && rec?.endYear != null,
    `T5 SEDNO: kampania jest ZAMKNIĘTA z powodem \`${rec?.endReason}\` i rokiem końca ` +
    `(${rec?.endYear}). To jedyny dziś zapis „kampania się udała" — AC-7 buduje na nim ` +
    'idempotencję fal, więc kształt rekordu musi być pinowany PRZED tamtą zmianą');
}
{
  const { colony, home, gum, inv, tick } = boot();
  const cap = capitalOf(colony);
  const res = inv.launchInvasion(EMP, home.id, 2);
  cap.owner = EMP;                                    // stolica ZDOBYTA…
  for (const id of res.landed) gum.removeUnit(id);    // …ale ostatni najeźdźca ginie
  tick(3);

  const rec = recordFor(home.id);
  assert(!colony.ownerEmpireId && rec?.active === false && rec?.endReason === 'defenders_repelled',
    `T5 KONTROLA PINU: gdy zginie ostatni najeźdźca, rekord gaśnie jako \`${rec?.endReason}\` — ` +
    'i kolonia NIE zmienia rąk, mimo że stolica należała do agresora. Gałąź `defenders_repelled` ' +
    'wykonuje się PRZED testem stolicy: to jest A7 („kampania gaśnie z ostatnim najeźdźcą") ' +
    'zmierzone, a nie odczytane');
}

// ── T6 (f) — A13: ⚠ PIN ODWRÓCONY W AC-3 (D8) ───────────────────────────────────────────────
// Do AC-2 włącznie ten blok pinował ISTNIENIE trzech producentów darmowych jednostek startowych.
// AC-3 usunął wszystkich trzech, więc pin został **przepisany na odwrotny** — zgodnie z instrukcją
// z nagłówka („kto odwraca pin, PRZEPISUJE tę listę, nie kasuje testu"). Tutaj zostaje tylko
// domknięcie listy szwów; PEŁNY dowód (kontrole pinu, ścieżki, które mają przeżyć, część
// wykonaniowa) mieszka w dedykowanym keeperze `startup_units_zero_smoke.mjs`.
console.log('T6 (f) — A13/D8: trzej producenci jednostek startowych NIE ISTNIEJĄ (odwrócone w AC-3)');
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');

  // ⚠ KOMENTARZE ZDEJMOWANE PRZED SZUKANIEM (memory `source-pin-strip-comments`) — inaczej pin
  //   łapie własne wyjaśnienie zostawione w kodzie po usunięciu producenta.
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const read = (...p) => stripComments(readFileSync(join(SRC, ...p), 'utf8'));

  const scene   = read('scenes', 'GameScene.js');
  const overlay = read('ui', 'ColonyOverlay.js');
  const vessels = read('systems', 'VesselManager.js');

  assert(!/_initRoverSpawnListener\s*\(\s*\)\s*\{/.test(scene) && !/this\._initRoverSpawnListener\s*\(/.test(scene),
    'T6 poz. 1+2 (ODWRÓCONE): `GameScene._initRoverSpawnListener` NIE ISTNIEJE — usunięta metoda ' +
    'ORAZ jej rejestracja. Pusta skorupa zostawiłaby uzbrojony nasłuch `planet:buildResult` ' +
    'bez ładunku, gotowy do przypadkowego ponownego podłączenia');
  assert(!/createUnit\('science_rover'/.test(scene) && !/createUnit\('infantry'/.test(scene),
    'T6 poz. 1+2 (ODWRÓCONE): …i nic w `GameScene` nie tworzy już startowego łazika ani piechoty');
  assert(!/_autoSpawnRover/.test(overlay) && !/createUnit\('science_rover'/.test(overlay),
    'T6 poz. 3 (ODWRÓCONE): `ColonyOverlay._autoSpawnRover` zniknął w całości — wywołanie z `show()` ' +
    'i metoda. To był samonaprawiający się blokator: stawiał rovera dokładnie wtedy, gdy planeta ' +
    'pustoszała (końcówka inwazji), a przy symetrycznym predykacie z AC-5 zamrażałby podbój na zawsze');

  // KONTROLA PINU nr 1: ten sam skaner MUSI dalej widzieć producenta, który D8 zostawia.
  assert(/createUnit\('science_rover',\s*planetId/.test(vessels),
    'T6 KONTROLA PINU: `VesselManager.deployAwayTeam` (grupa badawcza — DECYZJA GRACZA) tworzy ' +
    'rovera tym samym wywołaniem i ma PRZEŻYĆ D8. Gdyby regeks był zepsuty, ta asercja padłaby ' +
    'razem z poprzednimi — a tak dowodzi, że pin rozróżnia „darmowe" od „kupione"');
  // KONTROLA PINU nr 2: skaner nie jest wszystkożerny.
  assert(!/createUnit\('battleship'/.test(scene) && !/createUnit\('battleship'/.test(overlay),
    'T6 KONTROLA PINU: skaner NIE znajduje tokena, którego w źródle nie ma — regeks dyskryminuje');

  // Część WYKONANIOWA — jedyna dostępna w tym harnessie (ograniczenie 4 z nagłówka):
  const { home, gum } = boot();
  assert(gum.getUnitsOnPlanet(home.id).length === 0,
    'T6 WYKONANIE: świeży boot ma ZERO jednostek na koloni gracza. ⚠ To NIE jest dowód D8 — ' +
    'headless i tak nie odpalał tych producentów (ograniczenie 4). Pełny dowód: ' +
    '`startup_units_zero_smoke.mjs`');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
