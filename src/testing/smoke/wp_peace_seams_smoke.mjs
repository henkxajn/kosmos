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
//   T1  offer_peace niesie WYŁĄCZNIE {verb, offer:{credits}} — kanału warunków pokoju NIE MA
//       ⚠ ZŁAMIE TO: WP-2/WP-5 (warunki pokoju = cesja ciał, decyzja D-WP-1 = a+c).
//   T2  transferColony i captureColonyForPlayer mają PO JEDNYM produkcyjnym wołającym,
//       a zdarzenia zmiany rąk PO JEDNYM emitencie
//       ⚠ ZŁAMIE TO: slice, który doda cesję terytorialną przy stole pokoju (drugi wołający).
//   T3  war.fronts[] jest MARTWY (addFront zero wołających) i CAPTURE_GRACE_YEARS zero czytelników
//       ⚠ ZŁAMIE TO: ktokolwiek ożywi fronty albo karencję. W4-simple ich NIE RUSZA
//         (sprzątanie martwego kodu to nie ten slice).
//   T4  rekord wojny NIE MA pola `captures`
//       ⚠ ZŁAMIE TO: **WP-1 w tym samym slice'ie** — księga zdobyczy `war.captures[]`.
//         To jedyna sekcja pomyślana jako do-odwrócenia-natychmiast; przy WP-1 aktualizujemy
//         ją ŚWIADOMIE i opisujemy odwrócenie w raporcie (wzór `deploy_seams` T1/T2/T4).
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
// T1 — offer_peace: kanał WARUNKÓW POKOJU nie istnieje (tylko {verb, offer:{credits}})
// ════════════════════════════════════════════════════════════════════════════
console.log('T1 — offer_peace niesie wyłącznie {verb, offer:{credits}}; proposal.terms jest nieczytany');
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

  const ctx = engine.buildContext('player', E, { verb: 'offer_peace', terms: TERMS });
  assert(!('terms' in ctx),
    'T1a: snapshot silnika NIE MA pola `terms` — `buildContext` przepisuje z propozycji WYŁĄCZNIE ' +
    '`verb` i `offer`, więc warunki pokoju nie mają dziś JAK dojechać do oceny');

  const bare  = engine.evaluateProposal('player', E, { verb: 'offer_peace' });
  const withT = engine.evaluateProposal('player', E, { verb: 'offer_peace', terms: TERMS });
  assert(bare.score === withT.score && bare.decision === withT.decision,
    'T1b: wynik z warunkami i bez warunków jest IDENTYCZNY — `terms` jest dziś kanałem ' +
    'NIEISTNIEJĄCYM, nie tylko nieważonym');

  const withOffer = engine.evaluateProposal('player', E, { verb: 'offer_peace', offer: { credits: 5000 } });
  assert(withOffer.score !== bare.score,
    'T1c (KONTROLA PINU): kredyty w ofercie MIERZALNIE ruszają wynik — bez tego T1b przechodziłby ' +
    'jałowo („nic nie zmienia wyniku, bo nic nim nie rusza")');

  assert(TERM_EVALUATORS.offer({ offer: { cedeBodies: ['h2'], colonies: 3 } }) === 0
      && TERM_EVALUATORS.offer({ offer: { credits: 500 } }) > 0,
    'T1d: term `offer` czyta z oferty WYŁĄCZNIE `credits` — cokolwiek innego w niej włożyć, ' +
    'wkład jest zerowy (kontrola: 500 Kr daje wkład dodatni)');

  const diplSrc = readClean('systems', 'DiplomacySystem.js');
  assert(/evaluateProposal\(\s*PLAYER\s*,\s*empireId\s*,\s*\{\s*verb:\s*'offer_peace'\s*\}\s*\)/.test(diplSrc),
    'T1e (pin ŹRÓDŁOWY): `DiplomacySystem.evaluatePeace` podaje silnikowi DOKŁADNIE ' +
    "{ verb: 'offer_peace' } — bez oferty i bez warunków");

  const termsHits = hitsIn(TERMS_RE);
  assert(termsHits.length === 0,
    'T1f (pin ŹRÓDŁOWY): ŻADEN plik produkcyjny nie czyta `proposal.terms` ani `ctx.terms` — ' +
    'zero czytelników w całym drzewie (znalezione: ' + JSON.stringify(termsHits) + ')');
}

// ════════════════════════════════════════════════════════════════════════════
// T2 — zmiana rąk: po JEDNYM produkcyjnym wołającym i po JEDNYM emitencie
// ════════════════════════════════════════════════════════════════════════════
console.log('T2 — transferColony / captureColonyForPlayer: jeden wołający, jeden emitent');
{
  const transferCalls = hitsIn(callRe('transferColony'));
  assert(transferCalls.length === 1 && transferCalls[0].file === 'InvasionSystem.js' && transferCalls[0].n === 1,
    'T2a: `transferColony` ma DOKŁADNIE JEDNEGO produkcyjnego wołającego (InvasionSystem) — ' +
    'cesja przy stole pokoju będzie drugim (znalezione: ' + JSON.stringify(transferCalls) + ')');

  const colMgr = readClean('systems', 'ColonyManager.js');
  assert(/^\s*transferColony\s*\(/m.test(colMgr) && /^\s*captureColonyForPlayer\s*\(/m.test(colMgr),
    'T2b (KONTROLA PINU): obie definicje SĄ w ColonyManager — regex wołań nie jest po prostu zepsuty');

  const captureCalls = hitsIn(callRe('captureColonyForPlayer'));
  assert(captureCalls.length === 1 && captureCalls[0].file === 'InvasionSystem.js' && captureCalls[0].n === 1,
    'T2c: lustro — `captureColonyForPlayer` też ma DOKŁADNIE JEDNEGO produkcyjnego wołającego ' +
    '(InvasionSystem) ⇒ cesja w obie strony już istnieje (znalezione: ' + JSON.stringify(captureCalls) + ')');

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
// T4 — rekord wojny: kształt BEZ księgi zdobyczy
//   ⚠ SEKCJA POMYŚLANA DO ODWRÓCENIA PRZEZ WP-1 (patrz nagłówek pliku).
// ════════════════════════════════════════════════════════════════════════════
console.log('T4 — rekord wojny nie ma pola `captures` (WP-1 to odwróci ŚWIADOMIE)');
{
  const warSys = new WarSystem();
  const war = warSys.createWar('player', 'emp_wp0_war', 'border_incident');

  const EXPECTED = ['id', 'aggressor', 'defender', 'casusBelli', 'startYear', 'fronts', 'exhaustion', 'battles', 'active'];
  assert(JSON.stringify(Object.keys(war).sort()) === JSON.stringify([...EXPECTED].sort()),
    'T4a: `createWar` zwraca DOKŁADNIE te pola: ' + EXPECTED.join(', ') +
    ' (zwrócone: ' + Object.keys(war).join(', ') + ')');

  assert(!('captures' in war),
    'T4b: rekord wojny NIE MA `captures` — dziś nikt nie wie, co w tej wojnie zmieniło właściciela, ' +
    'więc stół pokoju nie ma czym handlować (to naprawia WP-1)');

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
