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
//   T5  rekord traktatu = {id, signedYear}; NAP nie ma daty wygaśnięcia
//       ⚠ ZŁAMIE TO: DS-1 / WP-7 (rozejm i wymuszony NAP o skończonym czasie trwania).
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
import { ARCHETYPES } from '../../data/EmpireData.js';

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
  assert(JSON.stringify(Object.keys(tr).sort()) === JSON.stringify(['id', 'signedYear']),
    'T5b: zapisany rekord traktatu ma DOKŁADNIE {id, signedYear} (zapisane: ' + Object.keys(tr).join(', ') + ')');
  assert(tr.expiresYear === undefined,
    'T5c: traktat NIE MA daty wygaśnięcia — rozejm/wymuszony NAP o skończonym czasie (DS-1/WP-7) ' +
    'nie ma dziś gdzie zapisać końca');
  assert(tr.signedYear === 137,
    'T5d (KONTROLA PINU): `signedYear` jest ŻYWY (stemplowany bieżącym rokiem), więc T5b mierzy ' +
    'realny kształt, a nie pustą zaślepkę');

  const napDef = TREATY_TYPES.non_aggression ?? {};
  assert(!Object.keys(napDef).some(k => /duration|expire|years|until/i.test(k)),
    'T5e: katalog `TREATY_TYPES.non_aggression` nie ma ŻADNEGO pola czasu trwania ' +
    '(pola: ' + Object.keys(napDef).join(', ') + ')');

  const diplSrc = readClean('systems', 'DiplomacySystem.js');
  assert(/signTreaty\(\s*empireId\s*,\s*\{\s*id:\s*treatyId\s*\}\s*\)/.test(diplSrc),
    'T5f (pin ŹRÓDŁOWY): produkcyjna ścieżka `proposeTreaty` przekazuje do `signTreaty` WYŁĄCZNIE ' +
    '`{ id: treatyId }` — poza id i stemplem roku do rekordu nic nie wchodzi');

  // Zasięg zawężony do warstwy dyplomacji ŚWIADOMIE: `DirectorProduction` ma własne,
  // NIEZWIĄZANE pole `expiresYear` (okno oczekiwania na stempel produkcji).
  const diploLayer = [
    readClean('systems', 'DiplomacySystem.js'),
    readClean('systems', 'diplomacy', 'RelationsModel.js'),
    readClean('data', 'TreatyData.js'),
    readClean('ui', 'DiplomacyOverlay.js'),
  ].join('\n');
  assert(!/expiresYear/.test(diploLayer),
    'T5g (pin ŹRÓDŁOWY): warstwa dyplomacji (system + model + dane + panel) nie zna słowa ' +
    '`expiresYear` — traktat dziś NIE WYGASA, bo nie ma czego czytać');
}

console.log('\n=== WYNIK: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
