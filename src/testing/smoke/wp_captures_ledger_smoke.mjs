// WP-1 — księga zdobyczy `war.captures[]` (W4-simple, slice 1, WOJNA I POKÓJ).
//
// CO PINUJE: wojna wreszcie WIE, co w niej zmieniło właściciela. Do WP-1 rekord wojny nie
// niósł tej informacji NIGDZIE (pinowane w `wp_peace_seams_smoke` T4b), więc stół pokoju
// (D-WP-1 = a+c: cesja ciał) nie miałby czym handlować.
//
// ⚠ ŁAŃCUCH JEST PRAWDZIWY, NIE SYNTETYCZNY. Zdobycze wywołujemy przez ŻYWE
//   `ColonyManager.transferColony` / `captureColonyForPlayer` (oba importują się pod node —
//   zmierzone), więc pin obejmuje TAKŻE kształt payloadu emitenta. Gdyby keeper emitował
//   `EventBus.emit('colony:captured', …)` sam, mierzyłby własne wyobrażenie o zdarzeniu.
//
//   T0  kontrola harnessu — żywy emitent, zmierzone klucze payloadu
//   T1  (i)   nowa wojna → captures: [] w rekordzie, w gameState i w serialize()
//   T2  (ii)  zdobycz w AKTYWNEJ wojnie → 1 wpis pełnego kształtu, OBA kierunki
//   T3  (iii) zmiana rąk BEZ wojny → 0 wpisów, brak throw (+ KONTROLA nie-jałowości)
//   T4  (iv)  dwie zdobycze tego samego ciała → 2 wpisy, bez deduplikacji
//   T5  (v)   stary zapis (rekord wojny bez pola) → [] i dopisywanie działa — OBA `?? []`
//   T6  (vi)  serialize → restore zachowuje wpisy
//   T7  pokój NIE kasuje księgi (rekord zostaje z active:false) — na tym stoi WP-3
//   T8  `getWarWith` DELEGUJE do `getWarBetween` — jedna definicja pytania „czy trwa wojna"
//   T9  `via` jest MAPĄ, nie literałem — nieznany powód nie udaje podboju
//   T10 pozostałe mutacje rekordu wojny NIE gubią księgi (cztery szwy `{...war}`)
//
// Uruchom: node src/testing/smoke/wp_captures_ledger_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (window/localStorage/THREE)
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { WarSystem } from '../../systems/WarSystem.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Harness ─────────────────────────────────────────────────────────────────
//
// ⚠ JEDNA instancja każdego systemu na całą suitę. `WarSystem` subskrybuje w konstruktorze,
//   więc druga instancja zaksięgowałaby każdą zdobycz DWA RAZY — i keeper mierzyłby własny
//   artefakt zamiast zachowania gry. Stan czyścimy `gameState.restore(null)`, NIE
//   `EventBus.clear()` (to zdjęłoby subskrypcje badanego systemu).
// ⚠ DEGRADACJA, NIE WYJĄTEK (lekcja z rodziny 255): na KOTWICY tych metod jeszcze nie ma.
//   Gdyby keeper wołał je wprost, pierwszy `TypeError` przerwałby przebieg i reszta pinów
//   nie miałaby koloru — a fail-first wymaga, żeby KAŻDY pin się wypowiedział.
window.KOSMOS = { timeSystem: { gameTime: 0 } };
const cm = new ColonyManager();
window.KOSMOS.colonyManager = cm;
const ws = new WarSystem();

const caps       = (warId)  => (typeof ws.getCaptures === 'function' ? ws.getCaptures(warId) : null);
const warBetween = (a, b)   => (typeof ws.getWarBetween === 'function' ? ws.getWarBetween(a, b) : undefined);
const setYear    = (y)      => { window.KOSMOS.timeSystem.gameTime = y; };
const reset      = ()       => { gameState.restore(null); };

/** Minimalna kolonia w rejestrze — tyle, ile czytają obie metody przerzutu własności. */
const mkColony = (id, owner = null, systemId = 'sys_t') => {
  cm._colonies.set(id, { planetId: id, name: 'Kolonia ' + id, ownerEmpireId: owner, fleet: [], systemId });
  return id;
};
const CAPTURE_KEYS = ['bodyId', 'fromEmpireId', 'systemId', 'toEmpireId', 'via', 'year'];   // posortowane

// ════════════════════════════════════════════════════════════════════════════
// T0 — KONTROLA HARNESSU: emitentem jest ŻYWY ColonyManager
// ════════════════════════════════════════════════════════════════════════════
console.log('T0 — żywy ColonyManager realnie emituje oba zdarzenia; zmierzone klucze payloadu');
{
  reset();
  // ⚠ Podsłuch zostaje na całą suitę — `EventBus.on` zwraca magistralę, nie uchwyt, a `off`
  //   wymaga TEJ SAMEJ referencji. Bierny obserwator niczego nie zmienia, a zdjęcie go
  //   wymagałoby trzymania referencji tylko po to, żeby wyglądało schludnie.
  const seen = {};
  EventBus.on('colony:captured',         e => { seen.captured = e; });
  EventBus.on('colony:capturedByPlayer', e => { seen.byPlayer = e; });

  mkColony('b_t0');                                        // ownerEmpireId null ⇒ kolonia GRACZA
  assert(cm.transferColony('b_t0', 'emp_t0', 'invasion') === true
      && seen.captured?.planetId === 'b_t0',
    'T0a: `transferColony` na żywym rejestrze przechodzi i emituje `colony:captured`');
  assert(cm.captureColonyForPlayer('b_t0', 'ground_invasion') === true
      && seen.byPlayer?.planetId === 'b_t0',
    'T0b: `captureColonyForPlayer` na tym samym ciele przechodzi i emituje `colony:capturedByPlayer`');

  // ⚠ Wszystkie odczyty przez `?? {}` / `?.` — pin ma DEGRADOWAĆ, nie przerywać przebiegu
  //   (bez tego pierwszy brakujący kształt zabiera kolor wszystkim pinom niżej).
  const pc = seen.captured ?? {}, pb = seen.byPlayer ?? {};
  assert(pc.previousOwner === 'player' && pc.newOwner === 'emp_t0',
    'T0c: payload `colony:captured` niesie OBIE strony (previousOwner + newOwner)');
  assert(pb.previousOwner === 'emp_t0' && !('newOwner' in pb),
    'T0d: payload `colony:capturedByPlayer` NIE MA `newOwner` — `toEmpireId: player` jest ' +
    'w księdze DERYWACJĄ z konstrukcji metody, nie odczytem (pinuje to T2d)');
  assert(!('systemId' in pc) && !('year' in pc)
      && !('systemId' in pb) && !('year' in pb) && seen.captured && seen.byPlayer,
    'T0e: ŻADEN payload nie niesie `systemId` ani `year` — oba muszą być wyprowadzone ' +
    'u odbiorcy (T2c pinuje, że są wyprowadzane POPRAWNIE)');
}

// ════════════════════════════════════════════════════════════════════════════
// T1 (i) — nowa wojna startuje z pustą księgą
// ════════════════════════════════════════════════════════════════════════════
console.log('T1 (i) — nowa wojna → captures: [] w rekordzie, w gameState i w serialize()');
{
  reset(); setYear(10);
  const war = ws.createWar('player', 'emp_t1', 'border_incident');

  assert(Array.isArray(war.captures) && war.captures.length === 0,
    'T1a: `createWar` zwraca rekord z `captures: []`');
  assert(Array.isArray(gameState.get('wars.' + war.id)?.captures),
    'T1b: zapisany rekord w `gameState.wars` też ma `captures`');
  assert(Array.isArray(gameState.serialize()?.wars?.[war.id]?.captures),
    'T1c: `GameState.serialize()` oddaje księgę — pole trafia do zapisu BEZ migracji (v101)');
  assert(Array.isArray(caps(war.id)) && caps(war.id).length === 0,
    'T1d: `getCaptures` na świeżej wojnie zwraca pustą listę');
}

// ════════════════════════════════════════════════════════════════════════════
// T2 (ii) — zdobycz w aktywnej wojnie: jeden wpis pełnego kształtu, OBA kierunki
// ════════════════════════════════════════════════════════════════════════════
console.log('T2 (ii) — zdobycz w aktywnej wojnie → 1 wpis pełnego kształtu (oba kierunki)');
{
  reset(); setYear(21);
  const war = ws.createWar('player', 'emp_t2', 'border_incident');

  mkColony('b_t2', null, 'sys_alfa');
  cm.transferColony('b_t2', 'emp_t2', 'invasion');          // AI zabiera kolonię gracza
  const list = caps(war.id) ?? [];
  assert(list.length === 1, 'T2a: dokładnie JEDEN wpis po jednej zmianie rąk');

  const e = list[0] ?? {};
  assert(JSON.stringify(Object.keys(e).sort()) === JSON.stringify(CAPTURE_KEYS),
    'T2b: wpis ma DOKŁADNIE {bodyId, systemId, fromEmpireId, toEmpireId, year, via} ' +
    '(zapisane: ' + Object.keys(e).sort().join(', ') + ')');
  assert(e.bodyId === 'b_t2' && e.fromEmpireId === 'player' && e.toEmpireId === 'emp_t2'
      && e.systemId === 'sys_alfa' && e.year === 21 && e.via === 'invasion',
    'T2c: wartości zgadzają się co do pola — w tym `systemId` i `year`, których payload NIE NIESIE ' +
    '(wyprowadzone u odbiorcy: układ lustrem rozwiązania emitenta, rok z żywego zegara)');

  setYear(26);
  cm.captureColonyForPlayer('b_t2', 'ground_invasion');     // gracz odbija
  const back = (caps(war.id) ?? [])[1] ?? {};
  assert(back.fromEmpireId === 'emp_t2' && back.toEmpireId === 'player' && back.year === 26,
    'T2d: kierunek ODWROTNY też się księguje, a `toEmpireId: player` jest poprawną derywacją ' +
    'z payloadu, który tego pola nie ma (T0d)');
}

// ════════════════════════════════════════════════════════════════════════════
// T3 (iii) — zmiana rąk BEZ wojny nie trafia do księgi i nie rzuca
// ════════════════════════════════════════════════════════════════════════════
console.log('T3 (iii) — zmiana rąk bez wojny → 0 wpisów, brak throw (+ kontrola nie-jałowości)');
{
  reset(); setYear(30);
  let threw = null;
  mkColony('b_t3', null, 'sys_beta');
  try { cm.transferColony('b_t3', 'emp_t3', 'invasion'); } catch (err) { threw = err; }
  assert(threw === null, 'T3a: zmiana rąk w pokoju NIE RZUCA — to normalny stan gry, nie błąd wpięcia');
  assert(Object.keys(gameState.get('wars') ?? {}).length === 0,
    'T3b: …i nie tworzy żadnej wojny „na zapas"');

  // ⚠ KONTROLA NIE-JAŁOWOŚCI: bez niej T3a/T3b przechodzą także wtedy, gdy księgi NIE MA
  //   w ogóle — czyli świecą na zielono dokładnie na kotwicy, gdzie jest defekt.
  const war = ws.createWar('player', 'emp_t3', 'border_incident');
  mkColony('b_t3b', null, 'sys_beta');
  cm.transferColony('b_t3b', 'emp_t3', 'invasion');
  assert((caps(war.id) ?? []).length === 1,
    'T3c (KONTROLA PINU): TA SAMA zmiana rąk PO wypowiedzeniu wojny JEST księgowana — ' +
    'T3a/T3b mierzą bramkę wojny, a nie brak mechanizmu');

  // AI↔AI bez wojny (dziś jedyna osiągalna para bez gracza) — też cisza.
  mkColony('b_t3c', 'emp_x', 'sys_beta');
  cm.transferColony('b_t3c', 'emp_y', 'invasion');
  assert((caps(war.id) ?? []).length === 1,
    'T3d: przerzut AI→AI (brak wojny między nimi) nie dopisuje się do CUDZEJ wojny');
}

// ════════════════════════════════════════════════════════════════════════════
// T4 (iv) — brak deduplikacji: księga jest HISTORIĄ, nie migawką
// ════════════════════════════════════════════════════════════════════════════
console.log('T4 (iv) — dwie zdobycze tego samego ciała → 2 wpisy w kolejności');
{
  reset(); setYear(40);
  const war = ws.createWar('player', 'emp_t4', 'border_incident');
  mkColony('b_t4', null, 'sys_gamma');

  cm.transferColony('b_t4', 'emp_t4', 'invasion');          // 1: gracz traci
  setYear(44);
  cm.captureColonyForPlayer('b_t4', 'ground_invasion');     // 2: gracz odbija
  setYear(48);
  cm.transferColony('b_t4', 'emp_t4', 'invasion');          // 3: traci ponownie

  const list = caps(war.id) ?? [];
  assert(list.length === 3,
    'T4a: TRZY wpisy dla JEDNEGO ciała — bez deduplikacji (stan bieżący wyprowadzi WP-3)');
  assert(list.every(x => x.bodyId === 'b_t4')
      && JSON.stringify(list.map(x => x.year)) === JSON.stringify([40, 44, 48]),
    'T4b: wpisy w kolejności zdarzeń, każdy z własnym rokiem (append-only)');
  assert(list[0]?.toEmpireId === 'emp_t4' && list[1]?.toEmpireId === 'player' && list[2]?.toEmpireId === 'emp_t4',
    'T4c: kierunki naprzemienne — księga odtwarza PRZEBIEG, nie tylko wynik');
}

// ════════════════════════════════════════════════════════════════════════════
// T5 (v) — STARY ZAPIS: rekord wojny bez pola `captures`
//   ⚠ To jest pin OBU miejsc `?? []` naraz: odczytu (`getCaptures`) i dopisywania
//     (`_recordCapture`). Gdyby brakowało tego drugiego, `[...undefined]` rzuciłoby.
// ════════════════════════════════════════════════════════════════════════════
console.log('T5 (v) — rekord ze starego zapisu (bez pola) → [] i dopisywanie działa');
{
  reset(); setYear(50);
  // Kształt DOSŁOWNIE taki, jaki zapisała gra przed WP-1 (pinowany w `wp_peace_seams_smoke` T4a).
  gameState.restore({
    wars: {
      war_old: {
        id: 'war_old', aggressor: 'player', defender: 'emp_old', casusBelli: 'border_incident',
        startYear: 5, fronts: [], exhaustion: { player: 0, emp_old: 0 }, battles: [], active: true,
      },
    },
  });
  assert(gameState.get('wars.war_old') && !('captures' in gameState.get('wars.war_old')),
    'T5a (KONTROLA PINU): fikstura naprawdę NIE MA pola `captures` — inaczej T5b/T5c ' +
    'mierzyłyby wojnę stworzoną przez nowy kod');

  const c0 = caps('war_old');
  assert(Array.isArray(c0) && c0.length === 0,
    'T5b: odczyt starej wojny daje PUSTĄ listę, nie `undefined` (`?? []` #1 — getCaptures)');

  let threw = null;
  mkColony('b_t5', null, 'sys_delta');
  try { cm.transferColony('b_t5', 'emp_old', 'invasion'); } catch (err) { threw = err; }
  assert(threw === null && (caps('war_old') ?? []).length === 1,
    'T5c: zdobycz dopisuje się do starej wojny bez rzucania (`?? []` #2 — _recordCapture); ' +
    'zapis zostaje v101 BEZ migracji');
}

// ════════════════════════════════════════════════════════════════════════════
// T6 (vi) — round-trip przez zapis
// ════════════════════════════════════════════════════════════════════════════
console.log('T6 (vi) — serialize → restore zachowuje wpisy');
{
  reset(); setYear(60);
  const war = ws.createWar('player', 'emp_t6', 'border_incident');
  mkColony('b_t6', null, 'sys_eps');
  cm.transferColony('b_t6', 'emp_t6', 'invasion');
  const before = JSON.stringify(caps(war.id));

  // JSON round-trip = uczciwa symulacja pliku zapisu. ⚠ `serialize()` oddaje stan PRZEZ
  //   REFERENCJĘ, więc bez głębokiej kopii „restore" podstawiłby ten sam obiekt i pin
  //   przechodziłby, nie dotykając ścieżki zapisu.
  const snapshot = JSON.parse(JSON.stringify(gameState.serialize()));
  reset();
  assert(caps(war.id) === null || (caps(war.id) ?? []).length === 0,
    'T6a (KONTROLA PINU): po wyczyszczeniu stanu księgi NIE MA — T6b nie czyta resztki w pamięci');

  gameState.restore(snapshot);
  assert(JSON.stringify(caps(war.id)) === before && (caps(war.id) ?? []).length === 1,
    'T6b: po wczytaniu wpisy wracają CO DO WARTOŚCI (' + before + ')');
}

// ════════════════════════════════════════════════════════════════════════════
// T7 — pokój NIE kasuje księgi (na tym stoi WP-3 i odznaka „Okupowana" z WP-4)
// ════════════════════════════════════════════════════════════════════════════
console.log('T7 — pokój zostawia rekord (active:false) razem z księgą');
{
  reset(); setYear(70);
  const war = ws.createWar('player', 'emp_t7', 'border_incident');
  mkColony('b_t7', null, 'sys_zeta');
  cm.transferColony('b_t7', 'emp_t7', 'invasion');
  assert((caps(war.id) ?? []).length === 1, 'T7a (KONTROLA PINU): przed pokojem księga ma wpis');

  EventBus.emit('diplomacy:peaceSigned', { empireId: 'emp_t7' });   // ŻYWY szew `_onPeaceSigned`
  const after = gameState.get('wars.' + war.id);
  assert(after && after.active === false && typeof after.endYear === 'number',
    'T7b: rekord wojny ZOSTAJE w `gameState.wars` z `active:false` — nic go nie usuwa');
  assert((caps(war.id) ?? []).length === 1,
    'T7c: księga przeżywa pokój — WP-3 może ją re-walidować po zakończeniu wojny');

  setYear(75);
  mkColony('b_t7b', null, 'sys_zeta');
  cm.transferColony('b_t7b', 'emp_t7', 'invasion');
  assert((caps(war.id) ?? []).length === 1,
    'T7d: po pokoju kolejna zmiana rąk JUŻ SIĘ NIE KSIĘGUJE — wojna nie jest aktywna, ' +
    'a `getWarBetween` pyta wyłącznie o aktywne');
}

// ════════════════════════════════════════════════════════════════════════════
// T8 — jedna definicja pytania „czy trwa wojna między A i B"
// ════════════════════════════════════════════════════════════════════════════
console.log('T8 — getWarWith DELEGUJE do getWarBetween (bez drugiej kopii predykatu)');
{
  reset(); setYear(80);
  const war = ws.createWar('emp_t8', 'player', 'border_incident');   // AI agresorem

  assert(ws.getWarWith('emp_t8') === warBetween('player', 'emp_t8')
      && ws.getWarWith('emp_t8')?.id === war.id,
    'T8a: `getWarWith(E)` i `getWarBetween(player, E)` zwracają TEN SAM rekord');
  // ⚠ Wymóg NIEPUSTEJ odpowiedzi jest częścią pinu: `undefined === undefined` też jest
  //   „symetryczne", więc bez tego pin świeciłby zielono tam, gdzie metody w ogóle nie ma.
  assert(warBetween('emp_t8', 'player') === warBetween('player', 'emp_t8')
      && warBetween('emp_t8', 'player')?.id === war.id,
    'T8b: `getWarBetween` jest SYMETRYCZNE — kolejność stron nie zmienia odpowiedzi');
  assert(warBetween('player', 'player') === null && warBetween('player', null) === null,
    'T8c: strona sama ze sobą / brak strony → null (a nie skan rejestru)');
  assert(warBetween('emp_a', 'emp_b') === null,
    'T8d: para bez gracza nie ma dziś wojny — poprawna odpowiedź, nie luka (DiplomacySystem ' +
    'tworzy wyłącznie wojny z graczem)');
}

// ════════════════════════════════════════════════════════════════════════════
// T9 — `via` jest mapą, nie literałem
// ════════════════════════════════════════════════════════════════════════════
console.log('T9 — `via` nie udaje podboju, gdy powód jest inny');
{
  reset(); setYear(90);
  const war = ws.createWar('player', 'emp_t9', 'border_incident');

  mkColony('b_t9a', null, 'sys_eta');
  cm.transferColony('b_t9a', 'emp_t9', 'invasion');
  mkColony('b_t9b', 'emp_t9', 'sys_eta');
  cm.captureColonyForPlayer('b_t9b', 'ground_invasion');
  const list = caps(war.id) ?? [];
  assert(list.length === 2 && list.every(x => x.via === 'invasion'),
    'T9a: oba dzisiejsze powody (`invasion` i `ground_invasion`) mapują się na `via: invasion`');

  mkColony('b_t9c', null, 'sys_eta');
  cm.transferColony('b_t9c', 'emp_t9', 'peace_cession');    // kształt, jaki przyniesie WP-2/WP-5
  assert((caps(war.id) ?? [])[2]?.via === 'peace_cession',
    'T9b: NIEZNANY powód zapisuje się DOSŁOWNIE — zahardkodowane `invasion` zaksięgowałoby ' +
    'przyszłą cesję przy stole pokoju jako podbój');
}

// ════════════════════════════════════════════════════════════════════════════
// T10 — pozostałe mutacje rekordu wojny nie gubią księgi
//   Cztery szwy piszące `wars.<id>`: createWar, addFront, changeExhaustion, recordBattle
//   (+ _onPeaceSigned, pokryty w T7). Wszystkie robią `{ ...war, … }` — pin pilnuje, żeby
//   ktokolwiek, kto zamieni spread na literał, wywalił się TUTAJ, a nie w rozgrywce.
// ════════════════════════════════════════════════════════════════════════════
console.log('T10 — exhaustion / front / bitwa zachowują księgę');
{
  reset(); setYear(100);
  const war = ws.createWar('player', 'emp_t10', 'border_incident');
  mkColony('b_t10', null, 'sys_theta');
  cm.transferColony('b_t10', 'emp_t10', 'invasion');
  assert((caps(war.id) ?? []).length === 1, 'T10a (KONTROLA PINU): księga ma wpis przed mutacjami');

  ws.changeExhaustion(war.id, 'player', 5, 'test');
  assert((caps(war.id) ?? []).length === 1, 'T10b: `changeExhaustion` nie gubi księgi');

  ws.addFront(war.id, 'sys_theta');
  assert((caps(war.id) ?? []).length === 1, 'T10c: `addFront` nie gubi księgi');

  ws.recordBattle(war.id, {
    winner: 'A', location: null,
    participantA: { type: 'player', empireId: 'player' },
    participantB: { type: 'empire', empireId: 'emp_t10' },
  }, { announce: false });
  assert(gameState.get('wars.' + war.id)?.battles?.length === 1 && (caps(war.id) ?? []).length === 1,
    'T10d: `recordBattle` dopisuje bitwę i NIE gubi księgi');
}

console.log('\n=== WYNIK: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
