// WP-0 — keeper szwów POKOJU (W4-simple, slice 1, WOJNA I POKÓJ).
//
// PO CO: cały kształt W4-simple stoi na PIĘCIU twierdzeniach o stanie zastanym, zmierzonych
// w Kroku 0 (raport 2026-09-22, kotwica c4dd5ef). Ten plik pinuje je WYKONANIEM i ŹRÓDŁEM,
// żeby następne slice'y łamały je ŚWIADOMIE, a nie po cichu — i żeby następny czytelnik nie
// musiał wierzyć raportowi na słowo (wzór: `war_seams_smoke`, `colony_ownership_seams_smoke`).
//
// ⚠ TO NIE JEST TEST FAIL-FIRST. Keeper szwów opisuje świat TAKI, JAKI JEST na c4dd5ef —
//    ma być ZIELONY od pierwszego uruchomienia. Czerwony znaczy „ktoś zmienił szew".
//
//   T0  kontrola narzędzia — bez niej piny negatywne (T1f, T3a) są jałową zielenią
//   T1  offer_peace NIESIE WARUNKI POKOJU — ⚠ SEKCJA ŚWIADOMIE ODWRÓCONA W WP-2
//       Do WP-2 brzmiała „kanału warunków pokoju NIE MA" i była pinem BRAKU. WP-2 ten kanał
//       otworzył (`proposal.terms.cessions` → `ctx.terms`), więc pin przecelowano na nowy
//       inwariant: kanał ISTNIEJE, jest JEDEN i MIERZALNIE rusza wynikiem.
//       ZMIERZONE na drzewie WP-2 — stary T1 dawał: ✗T1a ✓T1b ✓T1c ✓T1d ✗T1e ✗T1f.
//       ⚠ T1b BYŁ WTEDY JAŁOWO ZIELONY i to jest sedno tej korekty: jego fixture
//       (`{cedeBodies, forcedNap}`) NIE MA pola `cessions`, którego nowy kod szuka, więc
//       „wynik identyczny" wychodziło nie dlatego, że kanału nie ma, tylko dlatego, że fixture
//       mówił do niego nie tym słowem. Stary kształt ZOSTAJE — jako KONTROLA JAŁOWOŚCI (T1b-ctl).
//       Wzór odwracania pinu z powodem: T4 niżej, `deploy_seams` T1/T2/T4.
//   T2  zmiana rąk ma DOKŁADNIE DWÓCH produkcyjnych wołających (desant + cesja), a zdarzenia
//       PO JEDNYM emitencie — ⚠ SEKCJA ŚWIADOMIE ODWRÓCONA W WP-3
//       Do WP-3 brzmiała „po JEDNYM wołającym" i zapowiadała, że złamie ją slice cesji.
//       WP-3 dołożył drugiego (`DiplomacySystem`), więc pin przecelowano na ALLOWLISTĘ.
//       ZMIERZONE na drzewie WP-3 — stary T2 dawał: ✗T2a ✓T2b ✗T2c ✓T2d.
//       ⚠ T2d ZOSTAJE NIETKNIĘTY i to on jest dowodem NIE-JAŁOWOŚCI całej sekcji: WP-3 dołożył
//       WOŁAJĄCYCH, a NIE EMITENTÓW. Drugi emitent zdublowałby każdy wpis w księdze zdobyczy,
//       więc jego brak trzeba pinować osobno — i on dalej świeci na zielono.
//   T3  war.fronts[] jest MARTWY (addFront zero wołających) i CAPTURE_GRACE_YEARS zero czytelników
//       ⚠ ZŁAMIE TO: ktokolwiek ożywi fronty albo karencję. W4-simple ich NIE RUSZA
//         (sprzątanie martwego kodu to nie ten slice).
//   T4  rekord wojny MA księgę zdobyczy `captures` — ⚠ SEKCJA ŚWIADOMIE ODWRÓCONA W WP-1
//       Do WP-1 brzmiała „rekord wojny NIE MA pola `captures`" i była pinem BRAKU. WP-1 to
//       pole dodał, więc pin przecelowano na nowy inwariant (10 pól, `captures: []` na starcie).
//       Odwrócenie było ZAPOWIEDZIANE w tym nagłówku przed napisaniem WP-1 i ZMIERZONE:
//       na drzewie WP-1 stary pin padał na T4a i T4b, i TYLKO na nich (27 PASS / 2 FAIL) —
//       czyli mierzył dokładnie to, co miał, a WP-1 nie ruszył nic poza zapowiedzianym.
//       Wzór odwracania pinu z powodem: `deploy_seams` T1/T2/T4, `ai_capture_last_stand` T4/T5.
//   T5  rekord traktatu = {id, signedYear} u OBU producentów (C0); NAP nie ma daty wygaśnięcia
//       + zgodność wstecz: stary, sześciopolowy rekord czyta się bez zmian (T5i, wykonaniowo)
//       ⚠ ZŁAMANE PRZEZ DS-1/C1 — ZGODNIE Z ZAPOWIEDZIĄ. T5b/T5c/T5g/T5h/T5i przecelowane
//       świadomie (powody przy każdym): pakt MA termin `expiresYear = signedYear + NAP_YEARS`,
//       a T5g z „warstwa nie zna tego słowa” zmienił rolę na „termin mieszka w MODELU, nie
//       w katalogu”. T5e zostaje NIETKNIĘTY jako kontrola tego rozstrzygnięcia.
//
// Uruchom: node src/testing/smoke/wp_peace_seams_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (window/localStorage/THREE)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

import gameState from '../../core/GameState.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { DiplomacySystem } from '../../systems/DiplomacySystem.js';
import { WarSystem } from '../../systems/WarSystem.js';
import { AcceptanceEngine, TERM_EVALUATORS } from '../../systems/diplomacy/AcceptanceEngine.js';
import { TREATY_TYPES } from '../../data/TreatyData.js';
// ⚠ NAMESPACE, NIE NAZWANY IMPORT: `NAP_YEARS` rodzi się w DS-1/C1, a statyczny import
//   nieistniejącego eksportu wywala CAŁY plik na linkowaniu ESM i żADEN pin nie dostaje
//   koloru przy fail-first (lekcja `ground_troops_reachable` / `wp_territorial_terms`).
import * as OMD_DS1 from '../../data/OpinionModifierData.js';
const NAP_YEARS = OMD_DS1.NAP_YEARS ?? null;
import { ARCHETYPES } from '../../data/EmpireData.js';
import { DiplomacyOverlay } from '../../ui/DiplomacyOverlay.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Narzędzia pinów źródłowych ──────────────────────────────────────────────
//
// ⚠ CRLF (§270): źródło czytamy PO NORMALIZACJI. Drzewo autora bywa mieszane, kanoniczny
//   checkout jest LF — pin, który pyta dysk o EOL, pada w jednym z nich.
// ⚠ KOMENTARZE ZDEJMOWANE (memory `source-pin-strip-comments`): inaczej pin „zero wołających"
//   łapie własne wyjaśnienie zostawione w kodzie obok martwej metody.
const SRC  = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const norm = (s) => s.replace(/\r\n/g, '\n');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const readClean = (...p) => stripComments(norm(readFileSync(join(SRC, ...p), 'utf8')));

/** Pliki PRODUKCYJNE `src/` — bez słowników i bez testów (ten keeper też by się złapał). */
function prodFiles(dir = SRC, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === 'i18n' || e === 'testing' || e === 'node_modules') continue;
      prodFiles(p, out);
    } else if (e.endsWith('.js') || e.endsWith('.mjs')) out.push(p);
  }
  return out;
}
const PROD = prodFiles();

/** Pliki produkcyjne, w których (po zdjęciu komentarzy) `re` trafia — z liczbą trafień. */
function hitsIn(re) {
  const out = [];
  for (const f of PROD) {
    const n = (stripComments(norm(readFileSync(f, 'utf8'))).match(re) ?? []).length;
    if (n > 0) out.push({ file: basename(f), n });
  }
  return out;
}
/** Wołanie metody: `.nazwa(`, `?.nazwa(`, `.nazwa?.(` — wszystkie trzy formy. */
const callRe = (name) => new RegExp('\\.\\s*' + name + '\\s*(?:\\?\\.)?\\s*\\(', 'g');
const TERMS_RE = /\b(?:proposal|ctx)\s*\.\s*terms\b/g;

// ════════════════════════════════════════════════════════════════════════════
// T0 — KONTROLA NARZĘDZIA (bez niej trzy piny niżej są jałową zielenią)
//
// T1f i T3a asertują PUSTY zbiór trafień. Zepsuty regex (albo pusta lista plików)
// daje pusty zbiór ZAWSZE — czyli pin świeciłby na zielono dokładnie wtedy, gdy
// przestałby cokolwiek mierzyć. T0 wymusza, żeby każde z tych narzędzi trafiało
// w syntetyczny pozytyw i żeby skan widział realne drzewo.
// ════════════════════════════════════════════════════════════════════════════
console.log('T0 — kontrola narzędzia: regexy trafiają w syntetyczne pozytywy, skan widzi drzewo');
{
  const SYNTH = "a.addFront(1); b?.addFront(2); c.addFront?.(3);";
  assert((SYNTH.match(callRe('addFront')) ?? []).length === 3,
    'T0a: `callRe` łapie WSZYSTKIE trzy formy wołania (`.f(`, `?.f(`, `.f?.(`) — inaczej ' +
    'T2a/T2c/T3a mierzyłyby ciszę zepsutego regexu');
  assert((('if (proposal.terms) read(ctx.terms);').match(TERMS_RE) ?? []).length === 2,
    'T0b: regex `proposal.terms|ctx.terms` łapie oba kształty odczytu — inaczej T1f byłby jałowy');
  assert(PROD.length > 100 && hitsIn(/EventBus/g).length > 10,
    'T0c: skan produkcyjny widzi realne drzewo (' + PROD.length + ' plików) i trafia w coś ' +
    'oczywistego — pusta lista plików zazieleniłaby każdy pin negatywny');
  assert(!PROD.some(p => p.includes('testing')),
    'T0d: skan NIE obejmuje `src/testing` — inaczej ten keeper łapałby własne nazwy metod');
}

// ════════════════════════════════════════════════════════════════════════════
// T1 — offer_peace: kanał WARUNKÓW POKOJU istnieje i jest JEDEN (⚠ odwrócone w WP-2)
// ════════════════════════════════════════════════════════════════════════════
console.log('T1 — offer_peace niesie warunki pokoju; proposal.terms.cessions rusza wynikiem');
{
  GAME_CONFIG.FEATURES.lightDiplomacy = true;
  GAME_CONFIG.FEATURES.diplomacyDecay = false;

  const E = 'emp_wp0';
  const empires = new Map([[E, {
    id: E, name: E, archetype: 'industrialist',
    personality: { ...ARCHETYPES.industrialist.personality },
    objective: 'merchant', traits: [],
  }]]);
  const wars = new Map([[E, {
    id: 'war_' + E, active: true, casusBelli: 'border_incident',
    exhaustion: { player: 40, [E]: 40 },
  }]]);

  window.KOSMOS = {
    timeSystem:     { gameTime: 100 },
    empireRegistry: { get: (id) => empires.get(id), listAll: () => [...empires.values()] },
    galaxyData:     { seed: 4242, systems: [] },
    warSystem:      { getWarWith: (id) => wars.get(id) ?? null },
  };
  const dipl = new DiplomacySystem();
  window.KOSMOS.diplomacySystem = dipl;
  dipl.declareWar(E, 'player_action');           // `offer_peace` ma pre-warunek `at_war`

  const engine = new AcceptanceEngine();         // ten sam kształt, którego używa gra (leniwy KOSMOS)
  const TERMS  = { cedeBodies: ['h2'], forcedNap: true };   // warunki, jakich chce D-WP-1

  // Kształt, którego nowy kod SZUKA. ⚠ Ciało bez kolonii wycenia się na samo
  // TERRITORIAL_BASE_VALUE — to wystarczy, żeby term ruszył wynikiem.
  const REAL = { cessions: [{ bodyId: 'h2', fromEmpireId: E, toEmpireId: 'player' }] };

  const ctx = engine.buildContext('player', E, { verb: 'offer_peace', terms: REAL });
  assert('terms' in ctx && ctx.terms?.cessions?.length === 1 && ctx.terms.cessions[0].bodyId === 'h2',
    'T1a (⚠ ODWRÓCONE w WP-2): snapshot silnika MA pole `terms` i niesie ROZWIĄZANE cesje — ' +
    'warunki pokoju dojeżdżają do oceny, czego do WP-2 nie było');

  const bare  = engine.evaluateProposal('player', E, { verb: 'offer_peace' });
  const withT = engine.evaluateProposal('player', E, { verb: 'offer_peace', terms: REAL });
  assert(withT.score !== bare.score,
    'T1b (⚠ ODWRÓCONE w WP-2): warunki MIERZALNIE ruszają wynik (' + bare.score + ' → ' +
    withT.score + ') — kanał nie jest już ani nieistniejący, ani nieważony');

  const withOld = engine.evaluateProposal('player', E, { verb: 'offer_peace', terms: TERMS });
  assert(withOld.score === bare.score,
    'T1b-ctl (KONTROLA JAŁOWOŚCI): STARY fixture `{cedeBodies, forcedNap}` NIE rusza wyniku, ' +
    'bo nie ma pola `cessions` — dlatego pin w dawnym kształcie przechodził po WP-2 na ZIELONO, ' +
    'nie mierząc niczego. Zostaje tutaj jako dowód, dlaczego trzeba go było przecelować');

  const bareCtx = engine.buildContext('player', E, { verb: 'offer_peace' });
  assert(bareCtx.terms === null,
    'T1c2: propozycja BEZ warunków ma `terms === null` — szew jest widoczny, ale nic nie jest ' +
    'liczone (regresja zero dla wszystkich dzisiejszych wołających)');

  const withOffer = engine.evaluateProposal('player', E, { verb: 'offer_peace', offer: { credits: 5000 } });
  assert(withOffer.score !== bare.score,
    'T1c (KONTROLA PINU): kredyty w ofercie MIERZALNIE ruszają wynik — bez tego T1b przechodziłby ' +
    'jałowo („nic nie zmienia wyniku, bo nic nim nie rusza")');

  assert(TERM_EVALUATORS.offer({ offer: { cedeBodies: ['h2'], colonies: 3 } }) === 0
      && TERM_EVALUATORS.offer({ offer: { credits: 500 } }) > 0,
    'T1d: term `offer` czyta z oferty WYŁĄCZNIE `credits` — cokolwiek innego w niej włożyć, ' +
    'wkład jest zerowy (kontrola: 500 Kr daje wkład dodatni)');

  const diplSrc = readClean('systems', 'DiplomacySystem.js');
  assert(/evaluatePeace\(\s*empireId\s*,\s*terms\s*=\s*null\s*\)/.test(diplSrc)
    && /evaluateProposal\(\s*PLAYER\s*,\s*empireId\s*,\s*\{\s*verb:\s*'offer_peace'\s*,\s*terms\s*\}\s*\)/.test(diplSrc),
    'T1e (pin ŹRÓDŁOWY, ⚠ ODWRÓCONY w WP-2): `evaluatePeace(empireId, terms = null)` przekazuje ' +
    'warunki TĄ SAMĄ propozycją — kanał jest jeden i opcjonalny, więc dotychczasowi wołający ' +
    'zostają bez zmian');

  const termsHits = hitsIn(TERMS_RE);
  const ALLOWED = ['AcceptanceEngine.js', 'AcceptanceWeightData.js'];
  assert(termsHits.length > 0 && termsHits.every(h => ALLOWED.includes(h.file)),
    'T1f (pin ŹRÓDŁOWY, ⚠ ODWRÓCONY w WP-2): czytelnicy `proposal.terms`/`ctx.terms` ISTNIEJĄ ' +
    'i mieszkają WYŁĄCZNIE w silniku akceptacji oraz w katalogu wag — drugi kanał warunków ' +
    'pokoju gdziekolwiek indziej ma ten pin zapalić (znalezione: ' + JSON.stringify(termsHits) + ')');
}

// ════════════════════════════════════════════════════════════════════════════
// T2 — zmiana rąk: po JEDNYM produkcyjnym wołającym i po JEDNYM emitencie
// ════════════════════════════════════════════════════════════════════════════
console.log('T2 — transferColony / captureColonyForPlayer: jeden wołający, jeden emitent');
{
  const CHANGE_HANDS_CALLERS = ['InvasionSystem.js', 'DiplomacySystem.js'];
  const transferCalls = hitsIn(callRe('transferColony'));
  assert(transferCalls.length === 2 && transferCalls.every(h => CHANGE_HANDS_CALLERS.includes(h.file) && h.n === 1),
    'T2a (⚠ ODWRÓCONE w WP-3): `transferColony` ma DOKŁADNIE DWÓCH produkcyjnych wołających — ' +
    'desant (InvasionSystem) i cesja przy stole pokoju (DiplomacySystem), po jednym wywołaniu ' +
    'każdy. TRZECI wołający ma ten pin zapalić (znalezione: ' + JSON.stringify(transferCalls) + ')');

  const colMgr = readClean('systems', 'ColonyManager.js');
  assert(/^\s*transferColony\s*\(/m.test(colMgr) && /^\s*captureColonyForPlayer\s*\(/m.test(colMgr),
    'T2b (KONTROLA PINU): obie definicje SĄ w ColonyManager — regex wołań nie jest po prostu zepsuty');

  const captureCalls = hitsIn(callRe('captureColonyForPlayer'));
  assert(captureCalls.length === 2 && captureCalls.every(h => CHANGE_HANDS_CALLERS.includes(h.file) && h.n === 1),
    'T2c (⚠ ODWRÓCONE w WP-3): lustro — `captureColonyForPlayer` ma tych samych DWÓCH ' +
    'wołających. ⚠ Kierunek NIE jest wymienny: cesja AI→gracz MUSI iść tędy, bo TYLKO ta metoda ' +
    'woła `EmpireRegistry.removeColony` — ZMIERZONE, że `transferColony(bodyId, null)` ' +
    'zostawia oddane ciało w `emp.colonies` (znalezione: ' + JSON.stringify(captureCalls) + ')');

  const emitCaptured = hitsIn(/emit\(\s*'colony:captured'/g);
  const emitByPlayer = hitsIn(/emit\(\s*'colony:capturedByPlayer'/g);
  assert(emitCaptured.length === 1 && emitCaptured[0].file === 'ColonyManager.js' && emitCaptured[0].n === 1
      && emitByPlayer.length === 1 && emitByPlayer[0].file === 'ColonyManager.js' && emitByPlayer[0].n === 1,
    'T2d: oba zdarzenia zmiany rąk mają PO JEDNYM emitencie (ColonyManager) — drugi emitent ' +
    'zdublowałby każdy wpis w księdze zdobyczy WP-1');
}

// ════════════════════════════════════════════════════════════════════════════
// T3 — martwe od urodzenia: war.fronts[] i CAPTURE_GRACE_YEARS
// ════════════════════════════════════════════════════════════════════════════
console.log('T3 — addFront zero wołających; CAPTURE_GRACE_YEARS zero czytelników');
{
  const frontCalls = hitsIn(callRe('addFront'));
  assert(frontCalls.length === 0,
    'T3a: `addFront` NIE MA ani jednego wołającego w produkcyjnym drzewie ' +
    '(znalezione: ' + JSON.stringify(frontCalls) + ')');

  const warSrc = readClean('systems', 'WarSystem.js');
  assert(/^\s*addFront\s*\(/m.test(warSrc),
    'T3b (KONTROLA PINU): metoda `addFront` JEST zdefiniowana — T3a mierzy brak WOŁAŃ, ' +
    'a nie brak metody');

  const graceHits = hitsIn(/\bCAPTURE_GRACE_YEARS\b/g);
  assert(graceHits.length === 1 && graceHits[0].file === 'InvasionSystem.js' && graceHits[0].n === 1,
    'T3c: `CAPTURE_GRACE_YEARS` występuje w produkcyjnym drzewie DOKŁADNIE RAZ — jako deklaracja, ' +
    'zero odczytów: nie ma żadnej karencji czasowej podboju (znalezione: ' + JSON.stringify(graceHits) + ')');
}

// ════════════════════════════════════════════════════════════════════════════
// T4 — rekord wojny: kształt Z księgą zdobyczy (ODWRÓCONE W WP-1 — patrz nagłówek pliku)
// ════════════════════════════════════════════════════════════════════════════
console.log('T4 — rekord wojny ma `captures` (sekcja odwrócona w WP-1)');
{
  const warSys = new WarSystem();
  const war = warSys.createWar('player', 'emp_wp0_war', 'border_incident');

  const EXPECTED = ['id', 'aggressor', 'defender', 'casusBelli', 'startYear', 'fronts', 'exhaustion', 'battles', 'captures', 'active'];
  assert(JSON.stringify(Object.keys(war).sort()) === JSON.stringify([...EXPECTED].sort()),
    'T4a (ODWRÓCONE w WP-1): `createWar` zwraca DOKŁADNIE te 10 pól: ' + EXPECTED.join(', ') +
    ' (zwrócone: ' + Object.keys(war).join(', ') + ')');

  assert(Array.isArray(war.captures) && war.captures.length === 0,
    'T4b (ODWRÓCONE w WP-1): rekord wojny MA księgę zdobyczy i startuje PUSTY — wojna wie, ' +
    'co w niej zmieniło właściciela, więc stół pokoju (D-WP-1 = a+c) ma czym handlować. ' +
    'Zachowanie księgi pinuje w całości `wp_captures_ledger_smoke`');

  const stored = gameState.get('wars.' + war.id);
  assert(stored && JSON.stringify(Object.keys(stored).sort()) === JSON.stringify(Object.keys(war).sort()),
    'T4c: rekord w `gameState.wars` ma TEN SAM kształt co zwrócony — `GameState.serialize()` oddaje ' +
    'stan w całości, więc nowe pole na rekordzie wojny trafi do zapisu BEZ migracji');

  assert(Array.isArray(war.fronts) && war.fronts.length === 0,
    'T4d: świeża wojna ma `fronts: []` i nikt tej tablicy nie zapełnia (patrz T3a)');

  assert(warSys.addFront(war.id, 'sys_probe') === true
      && (warSys.getWar(war.id)?.fronts ?? []).length === 1,
    'T4e (KONTROLA PINU): `addFront` DZIAŁA, gdy się ją zawoła — fronty są martwe z braku ' +
    'wołających, a nie z powodu zepsutej metody');
}

// ════════════════════════════════════════════════════════════════════════════
// T5 — traktat: {id, signedYear}; NAP bez daty wygaśnięcia
// ════════════════════════════════════════════════════════════════════════════
console.log('T5 — rekord traktatu = {id, signedYear}; pakt o nieagresji nie wygasa');
{
  const dipl = window.KOSMOS.diplomacySystem;
  const N = 'emp_wp0_nap';
  window.KOSMOS.timeSystem.gameTime = 137;
  assert(dipl.signTreaty(N, { id: 'non_aggression' }) === true, 'T5a (KONTROLA PINU): pakt podpisany');

  const tr = dipl.relations.getTreaties('player', N)[0] ?? {};
  // ⚠ PRZECELOWANE w DS-1/C1, DOKŁADNIE WEDŁUG ZAPOWIEDZI z nagłówka tego pliku. Do C1 rekord
  //   miał dwa pola; D-WP-5 dokłada TRZECIE (`expiresYear`) i to jest cała zmiana kształtu.
  //   Pin nadal jest DOKŁADNY (równość zbiorów, nie „zawiera”), więc czwarte pole go zapali.
  assert(JSON.stringify(Object.keys(tr).sort()) === JSON.stringify(['expiresYear', 'id', 'signedYear']),
    'T5b: rekord ze ścieżki `proposeTreaty` ma DOKŁADNIE {id, signedYear, expiresYear} (zapisane: ' + Object.keys(tr).join(', ') + ')');
  // ⚠ ODWRÓCONY w DS-1/C1 ŚWIADOMIE. Stara treść: „traktat NIE MA daty wygaśnięcia — nie ma dziś
  //   gdzie zapisać końca”, z adnotacją w nagłówku, że DS-1 ma prawo to złamać. D-WP-5 złamał:
  //   pakt ma termin, liczony od roku podpisu ze stałej balansu.
  assert(tr.expiresYear === tr.signedYear + NAP_YEARS,
    'T5c: pakt MA termin = signedYear + NAP_YEARS (' + tr.signedYear + ' + ' + NAP_YEARS
    + ' = ' + tr.expiresYear + ')');
  assert(tr.signedYear === 137,
    'T5d (KONTROLA PINU): `signedYear` jest ŻYWY (stemplowany bieżącym rokiem), więc T5b mierzy ' +
    'realny kształt, a nie pustą zaślepkę');

  const napDef = TREATY_TYPES.non_aggression ?? {};
  assert(!Object.keys(napDef).some(k => /duration|expire|years|until/i.test(k)),
    'T5e: katalog `TREATY_TYPES.non_aggression` nie ma ŻADNEGO pola czasu trwania ' +
    '(pola: ' + Object.keys(napDef).join(', ') + ')');

  const diplSrc = readClean('systems', 'DiplomacySystem.js');
  // ⚠ WZMOCNIONY w C0: do WP-0 pin pytał o JEDNEGO producenta (`proposeTreaty`) i był przez to
  //   połową prawdy — drugi (`signPeace`) podawał cały obiekt katalogu. Teraz liczymy OBU
  //   i żądamy, żeby każdy podawał literal z samym `id`. Liczba producentów jest częścią pinu:
  //   trzeci, dopisany bez tej dyscypliny, zapali ten wiersz.
  const signCalls = (diplSrc.match(/this\.signTreaty\(/g) ?? []).length;
  const bareCalls = (diplSrc.match(/this\.signTreaty\(\s*empireId\s*,\s*\{\s*id:\s*[^{}]*?\}\s*\)/g) ?? []).length;
  assert(signCalls === 2,
    'T5f (KONTROLA PINU): `DiplomacySystem` ma DOKŁADNIE dwóch producentów traktatu (' + signCalls + ')');
  assert(bareCalls === signCalls,
    'T5f (pin ŹRÓDŁOWY): OBAJ producenci przekazują do `signTreaty` literal z samym `id` ' +
    '(' + bareCalls + '/' + signCalls + ') — poza id i stemplem roku do rekordu nic nie wchodzi');


  // ── C0 (DS-1) — REKORD MA JEDEN KSZTAŁT, NIEZALEŻNIE OD PRODUCENTA ──────────
  //
  // ⚠ T5b wyżej pinuje ścieżkę `proposeTreaty`. DRUGI producent — wymuszony NAP z pokoju
  //   (`signPeace`) — podawał do `signTreaty` CAŁY obiekt katalogu, a `addTreaty` robi
  //   `{ ...treaty, signedYear }`, więc do zapisu wchodziło SZEŚĆ pól:
  //     id, namePL, nameEN, descPL, descEN, signedYear
  //   Cztery z nich są MARTWE — slot panelu renderuje `tr.id`, nie `tr.namePL` (ZMIERZONE
  //   wykonaniem w T5i). Każdy pokój wnosił więc do zapisu dwa opisy w dwóch językach,
  //   których nikt nie czyta. C0 ujednolica kształt PRZED dołożeniem `expiresYear` (C1),
  //   żeby nowe pole nie lądowało w dwóch różnych rekordach.
  //
  // ⚠ PIN JEST WYKONANIOWY NA ŚCIEŻCE PRODUKCYJNEJ, nie na własnym wywołaniu `signTreaty`:
  //   keeper odpala PRAWDZIWY `offerPeace`, więc mierzy to, co robi gra, a nie to, co
  //   napisał test. Świat T5 nie ma map z T1 w zasięgu, więc atrapy `empireRegistry`
  //   i `warSystem` podmieniamy TUTAJ i przywracamy na końcu bloku.
  {
    const P = 'emp_wp0_nap_peace';
    const regBefore = window.KOSMOS.empireRegistry;
    const warBefore = window.KOSMOS.warSystem;
    const emps = new Map([[P, { id: P, name: 'Pokojowe', archetype: 'militarist', personality: {}, traits: [] }]]);
    const wr   = { id: 'w_wp0_peace', aggressor: 'player', defender: P, active: true,
                   casusBelli: 'border_incident', exhaustion: { player: 60, [P]: 60 }, captures: [] };
    window.KOSMOS.empireRegistry = { get: (id) => emps.get(id), listAll: () => [...emps.values()] };
    window.KOSMOS.warSystem = { getWarWith: (id) => (id === P ? wr : null), getCaptures: () => [] };
    window.KOSMOS.timeSystem.gameTime = 141;

    dipl.declareWar(P, 'player_action');
    const peaceOk = dipl.offerPeace(P, 'player_action');
    assert(peaceOk === true && dipl.hasTreaty(P, 'non_aggression'),
      'T5h (KONTROLA PINU): realny `offerPeace` przeszedł i wymusił NAP — jest co mierzyć');

    const napFromPeace = dipl.relations.getTreaties('player', P).find(x => x.id === 'non_aggression') ?? {};
    assert(JSON.stringify(Object.keys(napFromPeace).sort()) === JSON.stringify(['expiresYear', 'id', 'signedYear']),
      'T5h: NAP z POKOJU ma ten sam kształt co z `proposeTreaty` — {id, signedYear, expiresYear} '
      + '(zapisane: ' + Object.keys(napFromPeace).join(', ') + ')');
    assert(napFromPeace.expiresYear === napFromPeace.signedYear + NAP_YEARS,
      'T5h: … i ten sam termin — jeden pisarz stempluje OBU producentów (' + napFromPeace.expiresYear + ')');
    assert(napFromPeace.signedYear === 141,
      'T5h (KONTROLA PINU): `signedYear` na tej ścieżce też jest ŻYWY (' + napFromPeace.signedYear + ')');

    window.KOSMOS.empireRegistry = regBefore;
    window.KOSMOS.warSystem = warBefore;
  }

  // ── C0 — STARY ZAPIS (sześciopolowy NAP) CZYTA SIĘ BEZ ZMIAN ────────────────
  //
  // ⚠ To jest pin ZGODNOŚCI WSTECZ i ma być ZIELONY PO OBU STRONACH C0: rekordy zapisane
  //   przed ujednoliceniem zostają w zapisach graczy na zawsze (brak migracji, v101).
  //   Obaj konsumenci muszą je unieść:
  //     `hasTreaty` — pyta WYŁĄCZNIE o `id` (9 konsumentów w `src/`, w tym bramka
  //                   `declareWar:331` i bramka ultimatum `:1020`);
  //     slot panelu — renderuje `tr.id` i `tr.signedYear`, a te są w OBU kształtach.
  //
  // ⚠ SLOT MIERZONY WYKONANIEM, nie regexem: `DiplomacyOverlay` importuje się pod node,
  //   więc przepuszczamy PRAWDZIWY `_drawRight` przez atrapę `ctx` i czytamy, co poszło do
  //   `fillText`. Pin źródłowy powiedziałby tylko, że kod zawiera napis.
  {
    const L = 'emp_wp0_legacy';
    const regBefore = window.KOSMOS.empireRegistry;
    const emps = new Map([[L, { id: L, name: 'Zaszłość', archetype: 'militarist', personality: {}, traits: [] }]]);
    window.KOSMOS.empireRegistry = { get: (id) => emps.get(id), listAll: () => [...emps.values()] };
    window.KOSMOS.timeSystem.gameTime = 137;

    // Kształt SPRZED C0, odtworzony dosłownie (tak wygląda każdy NAP z pokoju w starym zapisie).
    dipl.relations.addTreaty('player', L, {
      id: 'non_aggression',
      namePL: 'Pakt o Nieagresji', nameEN: 'Non-Aggression Pact',
      descPL: 'opis', descEN: 'desc',
    });
    const legacy = dipl.relations.getTreaties('player', L).find(x => x.id === 'non_aggression') ?? {};
    // ⚠ Od C1 `addTreaty` stempluje `expiresYear`, więc stary kształt trzeba ODTWORZYĆ usuwając
    //   to pole — inaczej ten pin mierzyłby rekord NOWY i byłby jałowy (ta sama poprawka co T3a
    //   w `wp_nap_expiry_smoke`).
    delete legacy.expiresYear;
    assert(Object.keys(legacy).length === 6,
      // ⚠ BEZ polskiego słowa zakończonego na `t` tuż przed nawiasem: `check-i18n` ma `T_CALL = /(?<![\w$.])t\s*\(/`,
      //   a `\w` w JS jest TYLKO ASCII — `ł` nie blokuje lookbehind, więc polskie słowo kończące się
      //   na `t` tuż przed `(` czyta się jako wywołanie `t()`. Zmierzone: bramka padała na kluczu
      //   „+ Object.keys(legacy).length +”. Siostra reguły `i18n-checker-reads-t-calls-in-tests`.
      'T5i (KONTROLA PINU): fixture NAPRAWDĘ niesie stary, sześciopolowy rekord — pól: '
      + Object.keys(legacy).length + ' (inaczej ten pin mierzyłby nowy rekord)');

    assert(dipl.hasTreaty(L, 'non_aggression') === true,
      'T5i: `hasTreaty` widzi stary rekord — pyta wyłącznie o `id`, więc 9 konsumentów '
      + '(w tym bramka `declareWar`) jest poprawnych bez zmian');

    const painted = [];
    const ctxStub = new Proxy({}, {
      get: (_t, k) => {
        if (k === 'fillText' || k === 'strokeText') return (s) => painted.push(String(s));
        if (k === 'measureText') return () => ({ width: 10 });
        if (k === 'createLinearGradient') return () => ({ addColorStop: () => {} });
        if (typeof k === 'string'
          && /^(save|restore|beginPath|closePath|fillRect|strokeRect|clearRect|moveTo|lineTo|arc|fill|stroke|rect|clip|translate|scale|setLineDash|roundRect|quadraticCurveTo|bezierCurveTo|ellipse)$/.test(k)) {
          return () => {};
        }
        return undefined;
      },
      set: () => true,
    });
    const ov = new DiplomacyOverlay();
    ov._selectedId = L;
    let threw = null;
    try { ov._drawRight(ctxStub, 0, 0, 640, 720); } catch (e) { threw = e?.message ?? 'throw'; }
    assert(threw === null,
      'T5i (KONTROLA PINU): `_drawRight` przeszedł na starym rekordzie bez wyjątku'
      + (threw ? ' — ' + threw : ''));
    assert(painted.length > 0,
      'T5i (KONTROLA PINU): panel REALNIE coś narysował (' + painted.length + ' wywołań `fillText`) — '
      + 'inaczej brak wiersza slotu myliłby się z brakiem rysowania');
    // ⚠ PRZECELOWANE w DS-1/C3: slot pokazał do tej pory SUROWY SLUG (`non_aggression`),
    //   a C3 zamienił go na nazwę przez `t()`. Inwariant tego pinu się NIE zmienia — stary,
    //   sześciopolowy rekord ma się wyrenderować — zmienia się to, CZEGO szukamy w napisie.
    const slotRow = painted.find(s => s.trim().startsWith('•'));
    assert(!!slotRow && /137/.test(slotRow) && !/non_aggression/.test(slotRow),
      'T5i: slot renderuje stary rekord po NAZWIE (nie po slugu), z rokiem podpisania — '
      + JSON.stringify(slotRow ?? null));

    window.KOSMOS.empireRegistry = regBefore;
  }

  // Zasięg zawężony do warstwy dyplomacji ŚWIADOMIE: `DirectorProduction` ma własne,
  // NIEZWIĄZANE pole `expiresYear` (okno oczekiwania na stempel produkcji).
  const diploLayer = [
    readClean('systems', 'DiplomacySystem.js'),
    readClean('systems', 'diplomacy', 'RelationsModel.js'),
    readClean('data', 'TreatyData.js'),
    readClean('ui', 'DiplomacyOverlay.js'),
  ].join('\n');
  // ⚠ ODWRÓCONY w DS-1/C1 ŚWIADOMIE. Stara treść: „warstwa dyplomacji nie zna słowa
  //   `expiresYear` — traktat NIE WYGASA, bo nie ma czego czytać”. D-WP-5 to złamał i pin
  //   zmienia rolę: pilnuje teraz, że termin jest czytany w MODELU (stempel + ticker),
  //   a NIE rozłazi się po panelu ani po katalogu.
  assert(/expiresYear/.test(diploLayer),
    'T5g (pin ŹRÓDŁOWY): warstwa dyplomacji ZNA `expiresYear` — traktat ma termin (D-WP-5)');
  const modelOnly = readClean('systems', 'diplomacy', 'RelationsModel.js');
  assert((modelOnly.match(/expiresYear/g) ?? []).length >= 3,
    'T5g: termin czytany i stemplowany w MODELU (' + (modelOnly.match(/expiresYear/g) ?? []).length + ' wystąpień)');
  assert(!/expiresYear/.test(readClean('data', 'TreatyData.js')),
    'T5g (KONTROLA PINU): katalog traktatów NADAL nie zna terminu — czas mieszka w pliku balansu '
    + '(`NAP_YEARS`), nie w opisie traktatu; to jest to samo rozstrzygnięcie co T5e');
}

console.log('\n=== WYNIK: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
