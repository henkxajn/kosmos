// W3 — keeper trwałości dominacji orbitalnej (commit W3-3, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: audyt W3 (`docs/design/W3_PLAN.md` §Context 2, szew S6) znalazł fundament, który psuł
// funkcję ZBUDOWANĄ NA NIM. `orbitalDominance` jest PISANE przy każdej bitwie
// (`WarSystem._updateOrbitalDominance`) i CZYTANE przez bramkę desantu (`FleetActions.js:553`,
// `:588`, `ColonyOverlay.js:261`, `:323` — wszystkie przez `WarSystem.playerHasOrbitalDominance`),
// ale NIE BYŁO ZADEKLAROWANE w `createDefaultState`, a `GameState.restore` scala WYŁĄCZNIE klucze
// najwyższego poziomu (`GameState.js:142-147`) i resztę po cichu wyrzuca.
//
// Skutek jest w GRZE, nie w abstrakcji: wróg wygrywa bitwę nad Twoją planetą i trzyma orbitę —
// po zapisie i wczytaniu ta wiedza ZNIKA, bramka desantu wraca do reguły „pusta orbita = wolna
// droga" i znowu przepuszcza desant, choć nad głową stoi wroga eskadra. W drugą stronę bolało
// tak samo: WYGRANA gracza też parowała, więc desant po reloadzie wymagał wygrania tej samej
// bitwy jeszcze raz.
//
//   T1  dominacja GRACZA przeżywa PEŁNĄ podróż zapisu (serialize → JSON → restore)
//   T2  dominacja WROGA przeżywa tę samą podróż (kontroler ≠ 'player' to nie przypadek szczególny)
//   T3  ⚠ SEDNO — bramka desantu czyta WCZYTANĄ wartość: wróg trzyma orbitę także PO reloadzie.
//       Ta asercja była CZERWONA przed W3-3 (klucz ginął ⇒ `playerHasOrbitalDominance` wracało
//       do `true`), i to ona, nie sama obecność klucza, jest przedmiotem tego commita.
//   T4  stary zapis BEZ klucza wczytuje się na PUSTY default — żadnej migracji nie trzeba
//       (własność konstrukcyjna: „brak w zapisie" jest nieodróżnialny od poprawnego defaultu)
//   T5  pin źródłowy: martwy zasiew w `_migrateV58toV59` skasowany (+ KONTROLA PINU)
//   T6  KONTROLA MECHANIZMU: domena NIEzadeklarowana DALEJ jest wyrzucana — czyli dominację
//       trzyma przy życiu sama DEKLARACJA i nikt nie skasuje jej jako „zbędnej"
//
// ⚠ Podróż zapisu idzie tu przez JSON, nie przez samą referencję: `GameState.serialize()` zwraca
//    surowy stan (bez klonu), więc test na gołej referencji „przeszedłby" nawet wtedy, gdyby
//    restore gubił wszystko. Prawdziwy zapis przechodzi przez `JSON.stringify` w `SaveSystem`.

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import gameState from '../../core/GameState.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  return core;
}

/** Pełna podróż zapisu: serialize → JSON (tak robi SaveSystem) → restore. */
function saveLoadRoundTrip() {
  const blob = JSON.parse(JSON.stringify(gameState.serialize()));
  gameState.restore(blob);
  return blob;
}

// ── T1 — dominacja gracza przeżywa zapis ────────────────────────────────────
console.log('T1 — dominacja GRACZA przeżywa serialize → JSON → restore');
{
  boot();
  gameState.set('orbitalDominance.sys_home', { controllerId: 'player', year: 12 }, 'w3_dominance_test');

  const blob = saveLoadRoundTrip();
  assert(!!blob?.orbitalDominance?.sys_home,
    'T1: klucz JEST w zapisie — strata nigdy nie była po stronie serializacji');
  assert(gameState.get('orbitalDominance.sys_home')?.controllerId === 'player',
    'T1: …i po wczytaniu DALEJ tam jest (przed W3-3 znikał: `restore` iteruje po ' +
    '`Object.keys(createDefaultState())`, a tego klucza tam nie było)');
  assert(gameState.get('orbitalDominance.sys_home')?.year === 12,
    'T1: rok bitwy też przeżywa — wracamy do STANU, nie do samej flagi');
}

// ── T2 — kontroler wrogi to nie przypadek szczególny ────────────────────────
console.log('T2 — dominacja WROGA przeżywa tę samą podróż');
{
  const core = boot();
  const empireId = core.empireRegistry.listAll()[0]?.id;
  assert(!!empireId, 'T2: harness wystawił imperium do testu');

  gameState.set('orbitalDominance.sys_home', { controllerId: empireId, year: 30 }, 'w3_dominance_test');
  saveLoadRoundTrip();

  assert(gameState.get('orbitalDominance.sys_home')?.controllerId === empireId,
    `T2: kontroler \`${empireId}\` przeżywa wczytanie — dominacja jest stanem UKŁADU, ` +
    'nie „stanem gracza", i obie strony trzyma ten sam mechanizm');
}

// ── T3 — SEDNO: bramka desantu czyta wczytaną wartość ───────────────────────
console.log('T3 — ⚠ SEDNO: bramka desantu widzi wroga na orbicie także PO reloadzie');
{
  const core = boot();
  const empireId = core.empireRegistry.listAll()[0]?.id;
  const home = window.KOSMOS.homePlanet;

  // KONTROLA PINU NAJPIERW: pusta orbita = wolna droga. Bez tego „false" po restore byłoby
  // nieodróżnialne od bramki, która zawsze mówi „nie".
  assert(core.warSystem.playerHasOrbitalDominance(home.id) === true,
    'T3 KONTROLA PINU: bez wpisu i bez wrogiej floty bramka desantu jest OTWARTA ' +
    '(pusta orbita = brak oporu) — więc ma z czego spaść');

  gameState.set('orbitalDominance.sys_home', { controllerId: empireId, year: 30 }, 'w3_dominance_test');
  assert(core.warSystem.playerHasOrbitalDominance(home.id) === false,
    'T3: wróg wygrał bitwę ⇒ bramka desantu ZAMKNIĘTA (tak było i przed W3-3 — w RUNTIME)');

  saveLoadRoundTrip();

  assert(core.warSystem.playerHasOrbitalDominance(home.id) === false,
    'T3 SEDNO: po zapisie i wczytaniu bramka DALEJ zamknięta. Przed W3-3 wracała do `true` — ' +
    'reload po cichu oddawał graczowi orbitę, której nie odbił, bo `getOrbitalController` ' +
    'trafiał na pustkę i spadał do gałęzi „brak wrogiej floty = orbita wolna"');
}

// ── T4 — stary zapis bez klucza ─────────────────────────────────────────────
console.log('T4 — zapis BEZ klucza wczytuje się na pusty default (zero migracji)');
{
  boot();
  gameState.set('orbitalDominance.sys_home', { controllerId: 'player', year: 5 }, 'w3_dominance_test');
  const blob = JSON.parse(JSON.stringify(gameState.serialize()));

  // Stary zapis (sprzed W3-3 albo z gry, w której nigdy nie było bitwy) po prostu nie ma klucza.
  delete blob.orbitalDominance;
  gameState.restore(blob);

  const dom = gameState.get('orbitalDominance');
  assert(!!dom && typeof dom === 'object' && !Array.isArray(dom),
    'T4: brak klucza w zapisie ⇒ wczytanie daje OBIEKT, nie `undefined` (konsument nie musi ' +
    'zgadywać kształtu — `restore` NIE robi deep-merge, więc każdy nowy pod-klucz i tak czyta ' +
    'się defensywnie)');
  // `?? {}` tylko po to, żeby run z NIEnaprawionym kodem nie wywrócił się przed T5/T6 —
  // brak obiektu łapie asercja wyżej, ta pilnuje PUSTOŚCI.
  assert(Object.keys(dom ?? {}).length === 0,
    'T4: …i jest PUSTY — „brak w zapisie" nieodróżnialny od poprawnego defaultu, dlatego ' +
    'W3-3 nie potrzebuje bumpa wersji ani backfillu');
  assert(gameState.get('orbitalDominance.sys_home') == null,
    'T4: żaden duch po poprzednim stanie nie został (restore podmienia domenę w całości)');
}

// ── T5 — pin źródłowy: martwy zasiew skasowany ──────────────────────────────
console.log('T5 — pin źródłowy: zasiew `orbitalDominance` w migracji v58→v59 skasowany');
{
  // Ten sam idiom co `war_skirmish_smoke` T7 — pin czyta KOD, nie komentarze (inaczej złapałby
  // własne wyjaśnienie, dlaczego zasiewu już nie ma).
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')       // blokowe
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');  // liniowe (`$1` chroni `https://`)

  const migSrc = stripComments(readFileSync(join(SRC, 'systems', 'SaveMigration.js'), 'utf8'));

  assert(!/orbitalDominance/.test(migSrc),
    'T5: ZERO wystąpień `orbitalDominance` w kodzie migracji — zasiew z `_migrateV58toV59` był ' +
    'martwy (restore i tak go wyrzucał), a po deklaracji w `createDefaultState` jest zbędny');

  // ⚠ KONTROLA PINU — bez niej pusty odczyt pliku albo literówka w regeksie dałyby ciche „przeszło".
  assert(/hasTroopTransport/.test(migSrc) && /_migrateV58toV59/.test(migSrc),
    'T5 KONTROLA PINU: sąsiedzi z TEJ SAMEJ funkcji migracji (`hasTroopTransport`, sama nazwa ' +
    '`_migrateV58toV59`) są NADAL znajdowani — czyli pin czyta źródło i nie skasowaliśmy migracji ' +
    'przy okazji');

  const stateSrc = stripComments(readFileSync(join(SRC, 'core', 'GameState.js'), 'utf8'));
  assert(/orbitalDominance/.test(stateSrc),
    'T5: …a klucz stoi tam, gdzie jest jedynym miejscem, w którym cokolwiek znaczy — ' +
    'w `createDefaultState` (`GameState.js`), nie w łańcuchu migracji');
}

// ── T6 — kontrola mechanizmu ────────────────────────────────────────────────
console.log('T6 — KONTROLA MECHANIZMU: domena NIEzadeklarowana dalej jest wyrzucana');
{
  boot();
  gameState.set('orbitalDominance.sys_home', { controllerId: 'player', year: 7 }, 'w3_dominance_test');
  gameState.set('nieZadeklarowanaDomena.x', 1, 'w3_dominance_test');

  saveLoadRoundTrip();

  assert(gameState.get('orbitalDominance.sys_home')?.controllerId === 'player',
    'T6: ZADEKLAROWANA domena przeżywa…');
  assert(gameState.get('nieZadeklarowanaDomena') == null,
    'T6: …a NIEzadeklarowana dalej jest po cichu wyrzucana. Więc dominację trzyma przy życiu ' +
    'sama DEKLARACJA — skasowanie klucza z `createDefaultState` jako „zbędnego" wróciłoby ' +
    'dokładnie do defektu S6 (ten sam mechanizm pinuje `director_skeleton_smoke` T7)');
}

console.log(`\n═══ ${pass} PASS, ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
