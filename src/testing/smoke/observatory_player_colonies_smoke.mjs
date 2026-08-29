// KOLONIE GRACZA W WARSTWIE OBSERWATORIUM — keeper Findingu 87 (SPROSTOWANEGO).
//
// ⚠ REJESTR OPISYWAŁ MECHANIZM, KTÓREGO NIE MA. Wpis mówił: „`CollisionForecast:244` buduje
//   `playerPlanetIds` ze WSZYSTKICH kolonii ⇒ prognoza kolizji koloni AI pauzuje grę gracza".
//   Pomiar WYKONANIEM obalił przesłankę: `ColonyManager` **nie ma akcesora `colonies`**
//   (`typeof cm.colonies === 'undefined'`; publiczne są `getColony`/`getAllColonies`/
//   `getPlayerColonies`), a `git log -S` na `get colonies` i `this.colonies =` zwraca pustkę —
//   więc nie jest to zgnilizna po zmianie nazwy, tylko błąd od chwili napisania (`56a8069`).
//   Strażnik `if (colMgr?.colonies)` czyni gałąź MARTWĄ i wygląda przy tym na obronny.
//
// ⇒ SKUTEK JEST ODWROTNY DO ZAPISANEGO: nie fałszywy alarm o cudzej koloni, tylko BRAK alarmu
//   o własnej. Do zbioru trafiał wyłącznie `homePlanet.id`, więc kolizja grożąca dowolnej
//   koloni gracza POZA macierzystą nie pauzowała gry i nie dawała komunikatu.
//
// ⚠ A TREŚĆ REJESTRU JEST DOKŁADNYM OPISEM PUŁAPKI W NAPRAWIE: gałąź „naprawiona" przez
//   `getAllColonies()` wpuściłaby kolonie AI i wyprodukowała defekt, który wpis opisywał.
//   Dlatego kanonem jest `getPlayerColonies()` — T3 pinuje właśnie to.
//
// ⚠ TRZY KOPIE JEDNEGO BŁĘDU, nie jedna: `CollisionForecast:243`, `ObservatoryOverlay:423`
//   i `:783`. Nieutwardzony bliźniak to mina (lekcja `removeColony:667`), więc idą razem.
//
//   T1  pin przyczyny źródłowej: `ColonyManager` NIE MA `.colonies` (+ kontrola: ma trzy
//       akcesory publiczne) — żeby nikt nie „przywrócił" akcesora zamiast naprawić wołających
//   T2  SEDNO: wtórna kolonia gracza JEST w zbiorze
//   T3  SEDNO: kolonia AI NIE JEST w zbiorze (pułapka z rejestru)
//   T4  SEDNO: dom zostaje w zbiorze bez seedowania `window.KOSMOS.homePlanet.id`
//   T5  pin źródłowy + kontrola: martwa gałąź `colMgr.colonies` znikła ze WSZYSTKICH trzech
//       miejsc, a każde woła kanon
//   T6  nazwa ładunku i klucz i18n mówią „kolonia", nie „macierzysta" (flaga zawsze znaczyła
//       „dowolna kolonia gracza" — komentarz `GameScene:2637` mówił to wprost)

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import PL from '../../i18n/pl.js';
import EN from '../../i18n/en.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const { ColonyManager } = await import('../../systems/ColonyManager.js');

// ── T1 — przyczyna źródłowa ──────────────────────────────────────────────────
console.log('T1 — ColonyManager nie ma akcesora `.colonies`');
{
  const cm = new ColonyManager(null, null);
  assert(cm.colonies === undefined,
    'T1 SEDNO: `colonyManager.colonies` NIE ISTNIEJE — trzy gałęzie produkcyjne bramkowały się ' +
    'na tym polu i nie wykonały się ANI RAZU od `56a8069`');
  assert(typeof cm.getAllColonies === 'function' && typeof cm.getPlayerColonies === 'function'
         && typeof cm.getColony === 'function',
    'T1 KONTROLA PINU: publiczne akcesory istnieją — naprawą jest zmiana WOŁAJĄCYCH, ' +
    'nie dorobienie brakującego pola');
}

// ── T2/T3/T4 — kanon zbioru ciał gracza ──────────────────────────────────────
console.log('T2/T3/T4 — playerBodyIds: wtórne TAK, AI NIE, dom bez seeda');
{
  let CO = null;
  try { CO = await import('../../utils/ColonyOwnership.js'); } catch { CO = null; }
  const playerBodyIds = CO?.playerBodyIds;
  assert(typeof playerBodyIds === 'function', 'T2: kanon `playerBodyIds` istnieje');

  window.KOSMOS = window.KOSMOS ?? {};
  window.KOSMOS.homePlanet = { id: 'p_dom' };
  window.KOSMOS.colonyManager = {
    getPlayerColonies: () => ([
      { planetId: 'p_dom',    isHomePlanet: true },
      { planetId: 'p_wtorna', isHomePlanet: false },
    ]),
  };
  const ids = playerBodyIds ? playerBodyIds() : new Set();

  assert(ids.has('p_wtorna'),
    'T2 SEDNO: WTÓRNA kolonia gracza jest w zbiorze — to jest cała szkoda 87: kolizja grożąca ' +
    'koloni innej niż macierzysta nie pauzowała gry, bo pętla nigdy się nie wykonywała');
  // ⚠ WYMÓG NIEPUSTOŚCI JEST CZĘŚCIĄ PINU: samo `!ids.has('p_ai')` przechodzi TRYWIALNIE na
  //   pustym zbiorze, czyli świeci zielono dokładnie na zepsutym kodzie (zmierzone: pierwszy
  //   przebieg fail-first dał 3/11 zamiast 2/12 właśnie z tego powodu).
  assert(ids.size === 2 && !ids.has('p_ai'),
    'T3 SEDNO: zbiór ma DOKŁADNIE dwie kolonie gracza i NIE MA koloni AI — naprawa przez ' +
    '`getAllColonies()` wyprodukowałaby dokładnie ten defekt, który rejestr opisywał jako istniejący');
  assert(ids.has('p_dom'),
    'T4 SEDNO: dom jest w zbiorze BEZ seedowania `window.KOSMOS.homePlanet.id` — dom siedzi ' +
    'w `_colonies` (`ColonyManager:524`), a seed z globalnego wskaźnika niósł klasę Findingu 97 ' +
    '(wskaźnik nigdy nie przecelowywany po utracie stolicy)');
}

// ── T5 — trzy kopie martwej gałęzi ───────────────────────────────────────────
console.log('T5 — martwa gałąź znikła ze wszystkich trzech miejsc');
{
  for (const rel of [['systems', 'CollisionForecast.js'], ['ui', 'ObservatoryOverlay.js']]) {
    const src = strip(readFileSync(join(SRC, ...rel), 'utf8'));
    assert(!/colMgr\??\.colonies\b/.test(src) && !/\.colonies\.values\(\)/.test(src),
      'T5 SEDNO/' + rel[1] + ': brak odwołań do nieistniejącego `colMgr.colonies`');
    assert(/playerBodyIds|getPlayerColonies/.test(src),
      'T5 KONTROLA PINU/' + rel[1] + ': plik woła kanon — inaczej pin wyżej przechodziłby ' +
      'też wtedy, gdyby ktoś po prostu usunął całą gałąź razem z funkcją');
  }
}

// ── T6 — nazwa mówi prawdę ───────────────────────────────────────────────────
console.log('T6 — ładunek i komunikat mówią „kolonia", nie „macierzysta"');
{
  const cf = strip(readFileSync(join(SRC, 'systems', 'CollisionForecast.js'), 'utf8'));
  const gs = strip(readFileSync(join(SRC, 'scenes', 'GameScene.js'), 'utf8'));
  assert(/isPlayerColony:/.test(cf) && !/isHomePlanet:/.test(cf),
    'T6 SEDNO: `CollisionForecast` emituje `isPlayerColony` — zbiór ZAWSZE obejmował wszystkie ' +
    'kolonie gracza, o czym mówił wprost komentarz `GameScene:2637`');
  assert(/observatory:collisionAlert[\s\S]{0,200}isPlayerColony/.test(gs),
    'T6 KONTROLA PINU: jedyny konsument czyta nową nazwę (gdyby czytał starą, alarm zamilkłby ' +
    'całkowicie — cichy regres zamiast naprawy)');
  assert(!!PL['log.collisionForecastColony'] && !!EN['log.collisionForecastColony'],
    'T6: klucz `log.collisionForecastColony` jest w OBU językach');
  assert(!PL['log.collisionForecastHome'] && !EN['log.collisionForecastHome'],
    'T6: stary klucz `...Home` usunięty — EN mówił „COLLISION WITH HOME PLANET" dla dowolnej koloni');
}

// ── T7 — pętla pauzy (Finding 190) ───────────────────────────────────────────
// ⚠ Ten pin powstał PO live-gate: naprawa 87 sprawiła, że alert dotyczy KAŻDEJ koloni gracza,
//   i dopiero wtedy wyszło, że `_finalizeSimulation` emitował „nowy LUB ZAKTUALIZOWANY" alert
//   przy KAŻDYM przeliczeniu, a jedyny konsument na każdym emicie PAUZUJE grę. Przeliczenie
//   wraca co 1-10 civYears (= wyświetlanych miesięcy) wg poziomu obserwatorium ⇒ trwałe
//   zagrożenie zatrzymywało rozgrywkę bez końca.
console.log('T7 — to samo zagrożenie NIE alarmuje po raz drugi');
{
  const { CollisionForecast } = await import('../../systems/CollisionForecast.js');
  const EventBus = (await import('../../core/EventBus.js')).default;

  const cf = new CollisionForecast();
  const mkCol = () => ({
    pairKey: 'b1_b2',
    bodyA: { id: 'b1', name: 'Cialo A' },
    bodyB: { id: 'b2', name: 'Cialo B' },
    yearsUntil: 42,
  });

  let emits = 0;
  EventBus.on('observatory:collisionAlert', () => { emits++; });

  cf._simState = { foundCollisions: [mkCol()] };
  cf._finalizeSimulation();
  const afterFirst = emits;
  assert(afterFirst === 1, 'T7 KONTROLA PINU: pierwsze wykrycie alarmuje RAZ (' + afterFirst + ')');

  cf._simState = { foundCollisions: [mkCol()] };   // to samo zagrozenie, kolejne przeliczenie
  cf._finalizeSimulation();
  assert(emits === afterFirst,
    'T7 SEDNO: powtorne przeliczenie TEGO SAMEGO zagrozenia nie emituje ponownie (' +
    afterFirst + ' -> ' + emits + '). Kazdy emit z isPlayerColony pauzuje gre, wiec bez tego ' +
    'naprawa 87 zamieniala jeden przeoczony alarm w nieskonczona petle pauz');

  assert(cf.getAlerts().length === 1 && cf.getAlerts()[0].yearsUntil === 42,
    'T7 KONTROLA PINU: rekord alertu ZYJE i jest odswiezany — gasimy pauze, nie informacje ' +
    '(lista w ObservatoryOverlay czyta getAlerts())');
}

// ── T8 — zakres czyszczenia alertów (Finding 190, druga połowa) ──────────────
// ⚠ TEN PIN POWSTAŁ PO DRUGIM LIVE-GATE, KTÓRY OBALIŁ PIERWSZĄ DIAGNOZĘ. Dedup z T7 działa
//   idealnie, dopóki gracz nie zmieni oglądanego układu: skan jest kluczowany na
//   `activeSystemId` (Finding 191), a mapa `_alerts` jest WSPÓLNA dla całej gry, więc
//   `oldAlertIds` czyściło alerty WSZYSTKICH układów — nie tylko przeskanowanego.
//   ZMIERZONE sondą: trzy skany pod rząd w jednym układzie = 0 skasowanych; jedno
//   przełączenie widoku tam i z powrotem = +15 skasowanych i +15 emisji (czyli +15 PAUZ).
// ⚠ 191 jest tu WARUNKIEM KONIECZNYM 190, a nie tematem obok — dlatego wiersz „NIE łączyć"
//   w rejestrze został sprostowany (ta sama relacja co 130 + Z2).
console.log('T8 — skan układu B nie kasuje alertów układu A');
{
  const { CollisionForecast } = await import('../../systems/CollisionForecast.js');
  const EventBus = (await import('../../core/EventBus.js')).default;

  const cf = new CollisionForecast();
  let emits = 0, cleared = 0;
  EventBus.on('observatory:collisionAlert', () => { emits++; });
  EventBus.on('observatory:alertCleared', () => { cleared++; });

  const colIn = (sysId, n) => ({
    pairKey: `${sysId}_a${n}_${sysId}_b${n}`,
    bodyA: { id: `${sysId}_a${n}`, name: 'A' + n },
    bodyB: { id: `${sysId}_b${n}`, name: 'B' + n },
    yearsUntil: 300,
  });

  window.KOSMOS = window.KOSMOS ?? {};
  window.KOSMOS.activeSystemId = 'sys_A';
  cf._simState = { systemId: 'sys_A', foundCollisions: [colIn('sys_A', 1), colIn('sys_A', 2)] };
  cf._finalizeSimulation();
  const afterA = { alerts: cf._alerts.size, emits, cleared };
  assert(afterA.alerts === 2 && afterA.emits === 2,
    `T8 KONTROLA PINU: skan układu A dodaje dwa alerty i alarmuje dwa razy (${afterA.alerts}/${afterA.emits})`);

  window.KOSMOS.activeSystemId = 'sys_B';
  cf._simState = { systemId: 'sys_B', foundCollisions: [colIn('sys_B', 1)] };
  cf._finalizeSimulation();
  assert(cleared === afterA.cleared,
    `T8 SEDNO: skan układu B NIE kasuje alertów układu A (skasowano ${cleared - afterA.cleared}). ` +
    'Czyszczenie obejmowało całą mapę, więc każde spojrzenie na inny układ wyrzucało cudze alerty');
  assert(cf._alerts.size === 3,
    `T8 SEDNO: alerty OBU układów współistnieją (${cf._alerts.size}, ma być 3)`);

  window.KOSMOS.activeSystemId = 'sys_A';
  const emitsBeforeReturn = emits;
  cf._simState = { systemId: 'sys_A', foundCollisions: [colIn('sys_A', 1), colIn('sys_A', 2)] };
  cf._finalizeSimulation();
  assert(emits === emitsBeforeReturn,
    `T8 SEDNO: POWRÓT do układu A nie alarmuje ponownie (${emitsBeforeReturn} → ${emits}). ` +
    'To jest dokładnie ta pętla, którą właściciel zobaczył jako „pauzuje się co chwilę"');
}

// ── T9 — zmiana projektu: dzwonek zamiast pauzy, auto-slow tylko dla bliskich ─
// ⚠ Decyzja właściciela (2026-08-29): pauza obiecywała pewność, której model nie ma, i
//   przerywała rozgrywkę komunikatem bez kontekstu. Meldunek idzie kanałem, na którym
//   SIOSTRZANE zdarzenia obserwatorium są od dawna (`NotificationCenter`).
console.log('T9 — brak pauzy, dzwonek, próg auto-slow wyprowadzony z tabeli horyzontów');
{
  const gs = strip(readFileSync(join(SRC, 'scenes', 'GameScene.js'), 'utf8'));
  const handler = gs.slice(gs.indexOf("EventBus.on('observatory:collisionAlert'"), gs.indexOf("EventBus.on('observatory:collisionAlert'") + 600);
  assert(handler.length > 50, 'T9 KONTROLA PINU: handler alertu kolizyjnego znaleziony w GameScene');
  assert(!/timeSystem\?\.pause\(\)/.test(handler),
    'T9 SEDNO: handler NIE pauzuje już gry — twarda pauza była jedyną reakcją i nie miała kontekstu');
  assert(/COLLISION_AUTOSLOW_YEARS/.test(handler) && /_triggerAutoSlowIfTime/.test(handler),
    'T9 SEDNO: została WYŁĄCZNIE reakcja czasowa (auto-slow) i tylko poniżej progu');

  // Próg pinujemy przez DERYWACJĘ, nie przez liczbę: gdy ktoś zmieni tabelę horyzontów,
  // ten pin ma o tym powiedzieć, zamiast milczeć przy zdezaktualizowanej stałej.
  const cf = strip(readFileSync(join(SRC, 'systems', 'CollisionForecast.js'), 'utf8'));
  const arr = cf.match(/HORIZON_BY_LEVEL\s*=\s*\[([^\]]+)\]/);
  assert(!!arr, 'T9 KONTROLA PINU: tabela HORIZON_BY_LEVEL znaleziona');
  const lv1 = Number(arr[1].split(',')[1].trim());
  const { COLLISION_AUTOSLOW_YEARS } = await import('../../systems/CollisionForecast.js');
  assert(COLLISION_AUTOSLOW_YEARS === lv1,
    `T9 SEDNO: próg auto-slow (${COLLISION_AUTOSLOW_YEARS}) === HORIZON_BY_LEVEL[1] (${lv1}) — ` +
    'zasięg NAJPROSTSZEGO obserwatorium. Progu NIE da się uzasadnić wiarygodnością detekcji: ' +
    'ZMIERZONE, że powtarzalność jest PŁASKA (100 % przy 23-601 latach), bo propagacja Keplera ' +
    'jest analityczna. Podstawą jest budżet przerwań (~7 % zagrożeń) i własny margines prognozy');

  // Dzwonek — wykonaniem, przez prawdziwy NotificationCenter.
  const { NotificationCenter } = await import('../../systems/NotificationCenter.js');
  const EventBus2 = (await import('../../core/EventBus.js')).default;
  const nc = new NotificationCenter();
  const mk = (isPlayerColony) => ({
    bodyA: { id: 'x1', name: 'Alfa' }, bodyB: { id: 'x2', name: 'Beta' },
    yearsUntil: 120, margin: 12, isPlayerColony,
  });
  const before = nc.getActiveCount();
  EventBus2.emit('observatory:collisionAlert', mk(false));
  assert(nc.getActiveCount() === before,
    'T9 KONTROLA PINU: kolizja NIE dotycząca kolonii gracza nie dzwoni');
  EventBus2.emit('observatory:collisionAlert', mk(true));
  assert(nc.getActiveCount() === before + 1,
    `T9 SEDNO: kolizja dotycząca kolonii gracza trafia na dzwonek (${before} → ${nc.getActiveCount()})`);
}

console.log(`\n═══ ${pass} PASS, ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
