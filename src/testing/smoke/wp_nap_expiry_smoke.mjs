// DS-1 / C1 — keeper WYGASANIA PAKTU O NIEAGRESJI (D-WP-5).
//
// PO CO: do DS-1 NAP był WIECZNY — rekord `{id, signedYear}` i ani jednego czytelnika czasu.
// Wymuszony przy KAŻDYM pokoju (D-WP-1/WP-3) znaczył więc „już nigdy wojny z inicjatywy AI",
// bo `declareWar:331` odmawia każdemu powodowi poza `player_action`, dopóki pakt stoi.
// D-WP-5 daje paktowi koniec: `expiresYear = signedYear + NAP_YEARS`, ticker, beat.
//
// ⚠ WYGAŚNIĘCIE = USUNIĘCIE REKORDU, nie zmiana predykatu. To jest CAŁA oszczędność tego
//   slice'u: `hasTreaty` pyta WYŁĄCZNIE o `id` (T4b pinuje to źródłowo), więc wszystkich
//   dziewięciu konsumentów w `src/` — w tym bramkę `declareWar:331` i bramkę ultimatum
//   `:1020` — jest poprawnych BEZ JEDNEJ LINII ZMIANY. Gdyby wygasanie było predykatem
//   („ma traktat, ale przeterminowany"), trzeba by dotknąć wszystkich dziewięciu.
//
// ⚠ D-DS-3 — STARY ZAPIS BEZ POLA. Rekordy sprzed C1 nie mają `expiresYear` i nikt ich nie
//   migruje (zapis zostaje v101). Ticker traktuje brak pola JAK `signedYear + NAP_YEARS`
//   i NIC NIE ZAPISUJE — dzięki temu stary pakt wygasa w swoim roku, dostaje jeden beat
//   i znika, a format zapisu pozostaje nietknięty.
//
// ⚠ TICKER JEST OSOBNY OD `tickTruces`, ŚWIADOMIE. Zmierzone w FAZIE A: `listPairs().length`
//   = 2 przy dwóch imperiach (max 6 w grze), raz na rok cywilizacyjny — „drugi przebieg po
//   parach" kosztuje tyle, ile nic. Scalenie zlałoby dwa różne pytania („czy rozejm minął"
//   i „czy traktat minął") w jedną funkcję i zabrałoby `tickTruces` jego keeperom.
//
// Uruchom: node src/testing/smoke/wp_nap_expiry_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (window/localStorage/THREE)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { DiplomacySystem } from '../../systems/DiplomacySystem.js';
import { TREATY_TYPES } from '../../data/TreatyData.js';

// Stała rodzi się w C1 — namespace'owo i dynamicznie, żeby fail-first miał kolory
// (lekcja „pin musi DEGRADOWAĆ, nie PRZERYWAĆ" na poziomie SYMBOLU).
import * as OMD from '../../data/OpinionModifierData.js';
const NAP_YEARS = OMD.NAP_YEARS ?? null;

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Narzędzia pinów źródłowych (lustro `wp_peace_seams_smoke`) ──────────────
// ⚠ CRLF (§270): źródło PO NORMALIZACJI. ⚠ Komentarze zdejmowane.
const SRC  = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const norm = (s) => s.replace(/\r\n/g, '\n');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const readClean = (...p) => stripComments(norm(readFileSync(join(SRC, ...p), 'utf8')));
const readRaw   = (...p) => norm(readFileSync(join(SRC, ...p), 'utf8'));

/** Ciało JEDNEJ metody — okno anchorowane STRUKTURALNIE, nie odległością w znakach. */
function methodBody(src, name) {
  const i = src.indexOf('\n  ' + name + '(');
  if (i < 0) return '';
  const rest = src.slice(i + 1);
  const nl = rest.indexOf('\n');
  if (nl < 0) return rest;
  const tail = rest.slice(nl);
  const j = tail.search(/\n {2}[_A-Za-z][A-Za-z0-9_]*\s*\(/);
  return j < 0 ? rest : rest.slice(0, nl + j);
}

// ── Świat: syntetyczny, jak w `wp_peace_seams` (ticker to czysta logika czasu) ──
const empires = new Map();
const wars = new Map();
function world(year) {
  EventBus.clear();
  gameState.restore(null);
  empires.clear(); wars.clear();
  window.KOSMOS = {
    timeSystem:     { gameTime: year },
    empireRegistry: { get: (id) => empires.get(id), listAll: () => [...empires.values()] },
    galaxyData:     { seed: 4242, systems: [] },
    warSystem:      { getWarWith: (id) => wars.get(id) ?? null, getCaptures: () => [] },
  };
  const dipl = new DiplomacySystem();
  window.KOSMOS.diplomacySystem = dipl;
  return dipl;
}
const addEmpire = (id) => {
  empires.set(id, { id, name: id, archetype: 'militarist', personality: {}, traits: [] });
};
const addWar = (id) => {
  wars.set(id, { id: 'w_' + id, aggressor: 'player', defender: id, active: true,
                 casusBelli: 'border_incident', exhaustion: { player: 60, [id]: 60 }, captures: [] });
};
/** Przewinięcie zegara + PRAWDZIWY `time:tick` — pinuje także MONTAŻ tickera, nie samą logikę. */
function advanceTo(year) {
  window.KOSMOS.timeSystem.gameTime = year;
  EventBus.emit('time:tick', { deltaYears: 1, civDeltaYears: GAME_CONFIG.CIV_TIME_SCALE });
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T1 — OBAJ producenci stemplują `expiresYear = signedYear + NAP_YEARS`');
{
  assert(NAP_YEARS === 10,
    'T1a: `NAP_YEARS` istnieje w pliku balansu i wynosi 10 (jest: ' + NAP_YEARS + ')');

  const dipl = world(200);
  addEmpire('emp_prop'); addEmpire('emp_peace'); addWar('emp_peace');

  // Producent 1 — `proposeTreaty` (przez fasadę `signTreaty`, jak `:859`).
  dipl.signTreaty('emp_prop', { id: TREATY_TYPES.non_aggression.id });
  const a = dipl.relations.getTreaties('player', 'emp_prop')[0] ?? {};
  assert(a.signedYear === 200,
    'T1b (KONTROLA PINU): `signedYear` jest ŻYWY (' + a.signedYear + '), więc T1c mierzy realny stempel');
  assert(a.expiresYear === 200 + NAP_YEARS,
    'T1c: NAP z `proposeTreaty` ma `expiresYear` = signedYear + NAP_YEARS (jest: ' + a.expiresYear + ')');

  // Producent 2 — wymuszony NAP z pokoju, PRAWDZIWĄ ścieżką.
  dipl.declareWar('emp_peace', 'player_action');
  assert(dipl.offerPeace('emp_peace', 'player_action') === true,
    'T1d (KONTROLA PINU): realny `offerPeace` przeszedł — jest co mierzyć');
  const b = dipl.relations.getTreaties('player', 'emp_peace').find(t2 => t2.id === 'non_aggression') ?? {};
  assert(b.expiresYear === 200 + NAP_YEARS,
    'T1e: NAP z POKOJU ma ten sam `expiresYear` (jest: ' + b.expiresYear + ')');

  // ⚠ Inne traktaty NIE dostają daty — D-WP-5 dotyczy WYŁĄCZNIE paktu. Bez tego pinu
  //   „jeden pisarz" po cichu zrobiłby z umowy handlowej i sojuszu traktaty terminowe,
  //   czego nikt nie podpisywał.
  dipl.signTreaty('emp_prop', { id: 'trade_agreement' });
  const tr = dipl.relations.getTreaties('player', 'emp_prop').find(t2 => t2.id === 'trade_agreement') ?? {};
  assert(tr.signedYear === 200 && tr.expiresYear === undefined,
    'T1f: umowa handlowa NIE dostaje `expiresYear` — termin ma wyłącznie NAP (jest: ' + tr.expiresYear + ')');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — ticker wygasza DOKŁADNIE w roku, i dokładnie raz');
{
  const dipl = world(300);
  addEmpire('emp_t');
  dipl.signTreaty('emp_t', { id: TREATY_TYPES.non_aggression.id });
  const exp = 300 + NAP_YEARS;

  let beats = 0;
  const seen = [];
  EventBus.on('diplomacy:treatyExpired', (p) => { beats++; seen.push(p); });

  advanceTo(exp - 0.5);
  assert(dipl.hasTreaty('emp_t', 'non_aggression') === true && beats === 0,
    'T2a: rok PRZED terminem (' + (exp - 0.5) + ') — pakt żyje, cisza (beatów: ' + beats + ')');

  advanceTo(exp);
  assert(dipl.hasTreaty('emp_t', 'non_aggression') === false,
    'T2b: w roku terminu (' + exp + ') pakt ZNIKA z rekordu pary');
  assert(beats === 1, 'T2c: dokładnie JEDEN beat (jest: ' + beats + ')');

  advanceTo(exp + 5);
  assert(beats === 1,
    'T2d: kolejny tick MILCZY — beat nie powtarza się co rok (jest: ' + beats + ')');

  // Zdarzenie dla DS-2 (odnowienie) musi nieść komplet.
  const ev = seen[0] ?? {};
  assert(ev.empireId === 'emp_t' && ev.treatyId === 'non_aggression' && Number.isFinite(ev.year),
    'T2e: `diplomacy:treatyExpired` niesie {empireId, treatyId, year} — ' + JSON.stringify(ev));
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT3 — D-DS-3: stary rekord BEZ pola wygasa w signedYear + NAP_YEARS');
{
  const dipl = world(400);
  addEmpire('emp_old');
  // Kształt SPRZED C1 — dokładnie to, co siedzi w zapisach graczy.
  dipl.relations.addTreaty('player', 'emp_old', { id: 'non_aggression' });
  const rec = dipl.relations.getTreaties('player', 'emp_old')[0] ?? {};
  // ⚠ `addTreaty` stempluje od C1, więc stary kształt trzeba odtworzyć USUWAJĄC pole —
  //   inaczej ten pin mierzyłby nowy rekord i byłby jałowy.
  delete rec.expiresYear;
  assert(rec.expiresYear === undefined && rec.signedYear === 400,
    'T3a (KONTROLA PINU): fixture NAPRAWDĘ niesie stary kształt — signedYear 400, brak terminu');

  let beats = 0;
  EventBus.on('diplomacy:treatyExpired', () => { beats++; });

  advanceTo(409);
  assert(dipl.hasTreaty('emp_old', 'non_aggression') === true && beats === 0,
    'T3b: rok 409 — stary pakt wciąż żyje (termin wyprowadzony: 400 + ' + NAP_YEARS + ')');

  advanceTo(410);
  assert(dipl.hasTreaty('emp_old', 'non_aggression') === false && beats === 1,
    'T3c: rok 410 — stary pakt wygasa i daje JEDEN beat (beatów: ' + beats + ')');

  // Pin źródłowy: brak pola ma być CZYTANY, nie DOPISYWANY (bez migracji, zapis v101).
  const modSrc = readClean('systems', 'diplomacy', 'RelationsModel.js');
  const body = methodBody(modSrc, 'tickTreatyExpiry');
  assert(body !== '' && !/_write\s*\(/.test(body),
    'T3d: `tickTreatyExpiry` NICZEGO nie zapisuje — brak `expiresYear` jest wyprowadzany w locie, '
    + 'więc format zapisu zostaje nietknięty (v101, zero migracji)');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT4 — `hasTreaty` NIE zmienia predykatu: wygaśnięcie to USUNIĘCIE rekordu');
{
  const modSrc = readClean('systems', 'diplomacy', 'RelationsModel.js');
  const body = methodBody(modSrc, 'hasTreaty');
  assert(body !== '',
    'T4a (KONTROLA PINU): okno metody `hasTreaty` zostało znalezione (' + body.length + ' znaków)');
  assert(!/expiresYear/.test(body),
    'T4b: `hasTreaty` nie czyta `expiresYear` — dziewięciu konsumentów (w tym bramka '
    + '`declareWar:331`) jest poprawnych bez zmian');

  // Kontrola: narzędzie NAPRAWDĘ widzi to słowo, gdy jest w oknie (inaczej T4b byłby jałowy).
  const tickBody = methodBody(modSrc, 'tickTreatyExpiry');
  assert(/expiresYear/.test(tickBody),
    'T4c (KONTROLA PINU): to samo narzędzie WIDZI `expiresYear` w ciele tickera — '
    + 'T4b mierzy nieobecność, nie zepsute okno');
}

// ════════════════════════════════════════════════════════════════════════════
// ⚠ WARUNEK ≠ KONTROLA PINU: T5b/T5c zależą od naprawy (na kodzie sprzed C1 padają),
//   więc NIE są kontrolami — są warunkami wstępnymi dla T5d. Kontrola pinu musi być zielona
//   PO OBU STRONACH naprawy; mylna etykieta udawałaby dowód, którego tu nie ma.
console.log('\nT5 — trwałość i odnowienie');
{
  const dipl = world(500);
  addEmpire('emp_rt');
  dipl.signTreaty('emp_rt', { id: TREATY_TYPES.non_aggression.id });

  const snap = JSON.parse(JSON.stringify(gameState.serialize()));
  gameState.restore(snap);
  const back = dipl.relations.getTreaties('player', 'emp_rt')[0] ?? {};
  assert(back.expiresYear === 500 + NAP_YEARS,
    'T5a: `expiresYear` przeżywa serialize → restore (jest: ' + back.expiresYear + ') — zero migracji');

  // Odnowienie: po wygaśnięciu nowy podpis dostaje NOWY termin, liczony od NOWEGO roku.
  advanceTo(500 + NAP_YEARS);
  assert(dipl.hasTreaty('emp_rt', 'non_aggression') === false,
    'T5b (WARUNEK): pakt faktycznie wygasł przed próbą odnowienia');
  window.KOSMOS.timeSystem.gameTime = 520;
  assert(dipl.signTreaty('emp_rt', { id: TREATY_TYPES.non_aggression.id }) === true,
    'T5c (WARUNEK): ponowny podpis przechodzi (idempotencja `addTreaty` nie blokuje po usunięciu)');
  const fresh = dipl.relations.getTreaties('player', 'emp_rt').find(t2 => t2.id === 'non_aggression') ?? {};
  assert(fresh.signedYear === 520 && fresh.expiresYear === 520 + NAP_YEARS,
    'T5d: odnowiony pakt ma NOWY termin liczony od roku podpisu (jest: '
    + fresh.signedYear + ' / ' + fresh.expiresYear + ')');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT6 — dyscyplina: plik balansu i i18n');
{
  const balRaw = readRaw('data', 'OpinionModifierData.js');
  const exports = (balRaw.match(/^export const [A-Z_]+/gm) ?? []).map(s => s.replace('export const ', ''));
  assert(exports.includes('NAP_YEARS') && exports.includes('TRUCE_YEARS'),
    'T6a: plik balansu eksportuje `NAP_YEARS` obok `TRUCE_YEARS`');
  // ⚠ Liczba eksportów jest CZĘŚCIĄ pinu. C1 dołożył `NAP_YEARS` (10 → 11), C2 dokłada
  //   `TRUCE_TENSION_FLOOR` (11 → 12) — podniesione ŚWIADOMIE, dokładnie tak, jak zapowiadał
  //   ten komentarz przed C2. Kolejna stała bez podpisu zapali ten wiersz.
  assert(exports.length === 12,
    'T6b: plik balansu ma 12 eksportów (10 wyjściowych + `NAP_YEARS` z C1 + `TRUCE_TENSION_FLOOR` '
    + 'z C2) — jest: ' + exports.length + ' [' + exports.join(', ') + ']');
  assert(OMD.TRUCE_YEARS === 10,
    'T6c (KONTROLA PINU): `TRUCE_YEARS` nietknięty (' + OMD.TRUCE_YEARS + ')');

  for (const f of ['pl.js', 'en.js']) {
    const dict = readRaw('i18n', f);
    assert(/'log\.diplo\.napExpired':/.test(dict),
      'T6d[' + f + ']: klucz beatu `log.diplo.napExpired` jest w słowniku');
  }
  // Konsument beatu musi istnieć — inaczej zdarzenie leci w pustkę i gate mierzyłby ciszę.
  const uiSrc = readClean('scenes', 'UIManager.js');
  assert(/diplomacy:treatyExpired/.test(uiSrc),
    'T6e: `UIManager` subskrybuje `diplomacy:treatyExpired` — beat ma realnego konsumenta');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('=== WYNIK: ' + pass + ' PASS / ' + fail + ' FAIL (z ' + (pass + fail) + ') ===');
process.exit(fail === 0 ? 0 : 1);
