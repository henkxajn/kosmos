// DS-2 / C1 — keeper ODNOWIENIA PAKTU O NIEAGRESJI (D-DS-4b).
//
// PO CO: DS-1 dał paktowi koniec, ale nie dał sposobu, żeby go przedłużyć — a pakt jest
// JEDYNĄ rzeczą, która powstrzymuje AI przed wypowiedzeniem wojny z własnej inicjatywy
// (`declareWar:358` przepuszcza wtedy wyłącznie `player_action`). Bez odnowienia gracz mógł
// tylko patrzeć, jak termin mija.
//
// ⚠ ODNOWIENIE RUSZA WYŁĄCZNIE `expiresYear`. `signedYear` zostaje — slot panelu pokazuje
//   „od N, do roku M", więc przepisanie roku podpisu zamieniłoby przedłużony pakt w pozornie
//   NOWY i skasowało jedyny widoczny dla gracza ślad ciągłości. Cena: równość
//   `expiresYear === signedYear + NAP_YEARS` przestaje być niezmiennikiem rekordu — piny
//   `wp_peace_seams` T5c/T5h zostały na to zawężone w DS-2/C0 (kontrola: T5j).
//
// ⚠ OKNO `NAP_RENEW_WINDOW_YEARS = 3` JEST WYPROWADZONE, nie wybrane. Nieudana propozycja
//   stempluje `recent_refusal` na `RECENT_REFUSAL_YEARS = 2` lata (waga 25 przy progu 10),
//   więc okno ≤ 2 znaczyłoby, że PIERWSZA odmowa zjada całe okno i pakt wygasa mimo woli
//   gracza. Przy 3 zostaje dokładnie jeden rok na drugą próbę — pinuje to T3g.
//
// ⚠ TRYB `renew` NIE JEST FLAGĄ PROPOZYCJI, TYLKO KONIUNKCJĄ DWÓCH: `ctx.renew === true`
//   (wołający jawnie prosi) ORAZ `verbCfg.renewable === true` (ten traktat wolno odnawiać).
//   Sama flaga przepuściłaby ponowne podpisanie sojuszu, które nie znaczy nic — T4d.
//
// ⚠ WSZYSTKIE WYWOŁANIA NOWEGO API IDĄ PRZEZ `call()`. Na drzewie C0 (`74914cc`) metod
//   `renewTreaty` / `canRenewTreaty` / `getTreatyYearsLeft` NIE MA, a `dipl.renewTreaty(...)`
//   rzuciłby `TypeError` i zabił CAŁY przebieg — wtedy w fail-first ŻADEN pin nie dostaje
//   koloru, także te, które miały być zielonymi kontrolami. To ta sama lekcja co „pin musi
//   DEGRADOWAĆ, nie PRZERYWAĆ" (reguła warsztatu z close-outu DS-1), tylko na poziomie METODY.
//
// Uruchom: node src/testing/smoke/wp_nap_renew_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (window/localStorage/THREE)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { DiplomacySystem } from '../../systems/DiplomacySystem.js';
import { TREATY_TYPES } from '../../data/TreatyData.js';
import { VERB_ACCEPTANCE, RECENT_REFUSAL_YEARS } from '../../data/AcceptanceWeightData.js';

// ⚠ NAMESPACE, NIE NAZWANY IMPORT: `NAP_RENEW_WINDOW_YEARS` rodzi się w DS-2/C1, a fail-first
//   tego commita biegnie na C0 — statyczny import nieistniejącego eksportu wywala plik na
//   linkowaniu ESM i cały przebieg traci kolory.
import * as OMD from '../../data/OpinionModifierData.js';
const NAP_YEARS = OMD.NAP_YEARS ?? null;
const NAP_RENEW_WINDOW_YEARS = OMD.NAP_RENEW_WINDOW_YEARS ?? null;
const WIN = NAP_RENEW_WINDOW_YEARS ?? 3;    // do arytmetyki, żeby pozostałe piny liczyły

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

/** Wywołanie, które DEGRADUJE do `undefined` zamiast zabijać przebieg (patrz nagłówek). */
const call = (obj, m, ...a) => (typeof obj?.[m] === 'function' ? obj[m](...a) : undefined);

// ── Piny źródłowe ───────────────────────────────────────────────────────────
// ⚠ CRLF (§270): `RelationsModel.js` i `OpinionModifierData.js` SĄ CRLF — źródło czytamy
//   PO NORMALIZACJI, inaczej kotwica z `\n` nie trafia (ta sama pułapka zjadła mutanta M1
//   baterii DS-2/C0). ⚠ Komentarze zdejmowane: pin ma czytać KOD, nie opis kodu.
const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const norm = (s) => s.replace(/\r\n/g, '\n');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const readClean = (...p) => stripComments(norm(readFileSync(join(SRC, ...p), 'utf8')));
const readRaw = (...p) => norm(readFileSync(join(SRC, ...p), 'utf8'));

// ── Świat ───────────────────────────────────────────────────────────────────
const empires = new Map();
function world(year) {
  empires.clear();
  gameState.reset?.();
  EventBus.clear?.();
  window.KOSMOS = {
    timeSystem: { gameTime: year },
    empireRegistry: { get: (id) => empires.get(id), listAll: () => [...empires.values()] },
    galaxyData: { seed: 4242, systems: [] },
    warSystem: { getWarWith: () => null, getCaptures: () => [] },
  };
  const dipl = new DiplomacySystem();
  window.KOSMOS.diplomacySystem = dipl;
  return dipl;
}
/** ⚠ `aggression 0.2` — `personality_floor` paktu wymaga ≤ 0.4, inaczej pre-warunek blokuje. */
const addEmpire = (id) => empires.set(id, {
  id, name: id, archetype: 'militarist', personality: { aggression: 0.2, trade: 0.6 }, traits: [],
});
/** Podróż w czasie BEZ tiku — do testów okna; tik odpalamy tylko tam, gdzie mierzymy ticker. */
const travel = (year) => { window.KOSMOS.timeSystem.gameTime = year; };
const tickAt = (year) => {
  travel(year);
  EventBus.emit('time:tick', { deltaYears: 1, civDeltaYears: GAME_CONFIG.CIV_TIME_SCALE });
};
/**
 * ⚠ FIXTURE „AI POWIE TAK": napięcie 60. ZMIERZONE — pakt ma term `tension` z wagą **+20**
 *   (imperium na krawędzi wojny CHĘTNIEJ podpisze pakt, backbone §2.1): 0 → score 0.00,
 *   30 → 6.00, **60 → 12.00 ≥ próg 10**. ⚠ 80 i 100 dają score 0.00, bo para przekracza próg
 *   wrogości i WCHODZI W WOJNĘ (`reasonKey: atWar`) — fixture mierzyłby wtedy ciszę.
 */
const makeAgreeable = (dipl, id) => dipl.changeTension(id, 60, 'fixture_renew');

// ════════════════════════════════════════════════════════════════════════════
console.log('T1 — `canRenewTreaty`: tabela stanów (bez paktu / poza oknem / granica / cooldown)');
{
  assert(NAP_RENEW_WINDOW_YEARS === 3,
    'T1a: `NAP_RENEW_WINDOW_YEARS` istnieje w pliku balansu i wynosi 3 (jest: ' + NAP_RENEW_WINDOW_YEARS + ')');

  const dipl = world(600);
  addEmpire('e_win');
  assert(call(dipl, 'getTreatyYearsLeft', 'e_win') === null,
    'T1b: bez paktu `getTreatyYearsLeft` = null, a `canRenewTreaty` = false ('
    + call(dipl, 'canRenewTreaty', 'e_win') + ')');
  assert(call(dipl, 'canRenewTreaty', 'e_win') === false, 'T1b (cd.): brak paktu ⇒ nie ma czego odnawiać');

  dipl.signTreaty('e_win', { id: TREATY_TYPES.non_aggression.id });
  assert(call(dipl, 'getTreatyYearsLeft', 'e_win') === NAP_YEARS,
    'T1c (KONTROLA PINU): świeżo podpisany pakt ma pełne ' + NAP_YEARS + ' lat ('
    + call(dipl, 'getTreatyYearsLeft', 'e_win') + ') — jest co mierzyć');
  assert(call(dipl, 'canRenewTreaty', 'e_win') === false,
    'T1d: świeży pakt jest POZA oknem — odnowienie niedostępne');

  travel(600 + NAP_YEARS - WIN - 0.5);      // 3,5 roku do końca — tuż poza oknem
  assert(call(dipl, 'canRenewTreaty', 'e_win') === false,
    'T1e: ' + (WIN + 0.5) + ' roku do końca — wciąż poza oknem (granica jest OSTRA)');

  travel(600 + NAP_YEARS - WIN);            // dokładnie 3 lata do końca
  assert(call(dipl, 'getTreatyYearsLeft', 'e_win') === WIN,
    'T1f (KONTROLA PINU): zostało dokładnie ' + WIN + ' lat (' + call(dipl, 'getTreatyYearsLeft', 'e_win') + ')');
  assert(call(dipl, 'canRenewTreaty', 'e_win') === true,
    'T1g: granica okna NALEŻY do okna — przy równo ' + WIN + ' latach odnowienie jest dostępne');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — odnowienie przesuwa `expiresYear`, NIE `signedYear`');
{
  const dipl = world(600);
  addEmpire('e_ok');
  makeAgreeable(dipl, 'e_ok');
  dipl.signTreaty('e_ok', { id: TREATY_TYPES.non_aggression.id });
  const before = { ...(dipl.relations.getTreaties('player', 'e_ok')[0] ?? {}) };

  const RENEW_AT = 600 + NAP_YEARS - WIN;   // 607
  travel(RENEW_AT);
  // ⚠ ŚWIADEK dla całego bloku. Bez niego T2b/T2e/T2f przechodzą JAŁOWO na drzewie bez
  //   odnowienia (nic się nie dzieje ⇒ `signedYear` „nietknięty” i rekord „bez duplikatu”
  //   są prawdą z niczego). Zmierzone w fail-first: 8 z 13 zieleni było jałowych.
  const didRenew = call(dipl, 'renewTreaty', 'e_ok') === true;
  assert(didRenew,
    'T2a (KONTROLA PINU): odnowienie PRZESZŁO — jest co mierzyć');

  const after = { ...(dipl.relations.getTreaties('player', 'e_ok')[0] ?? {}) };
  assert(didRenew && after.signedYear === before.signedYear,
    'T2b: `signedYear` NIETKNIĘTY (' + before.signedYear + ' → ' + after.signedYear
    + ') — historia paktu zostaje widoczna w slocie');
  assert(didRenew && after.expiresYear === RENEW_AT + NAP_YEARS,
    'T2c: `expiresYear` liczony OD ROKU ODNOWIENIA (' + RENEW_AT + ' + ' + NAP_YEARS
    + ' = ' + after.expiresYear + ')');
  assert(didRenew && after.expiresYear - before.expiresYear === NAP_YEARS - WIN,
    'T2d: pakty NIE STACKUJĄ — przedłużenie ' + WIN + ' lata przed czasem daje ' + NAP_YEARS
    + ' lat od dziś, nie ' + (NAP_YEARS + WIN) + ' (przyrost: '
    + (after.expiresYear - before.expiresYear) + ')');
  assert(didRenew && dipl.relations.getTreaties('player', 'e_ok').filter(t => t?.id === 'non_aggression').length === 1,
    'T2e: DOKŁADNIE jeden rekord paktu — duplikat niemożliwy z konstrukcji (`map`, nie `push`)');
  assert(didRenew && JSON.stringify(Object.keys(after).sort()) === JSON.stringify(['expiresYear', 'id', 'signedYear']),
    'T2f: kształt rekordu BEZ ZMIAN — {id, signedYear, expiresYear}; odnowienie nie dokłada pola '
    + '(zapisane: ' + Object.keys(after).join(', ') + ')');
  // ⚠ To jest DRUGA połowa przecelowania z C0: po odnowieniu równość z T5c JUŻ NIE obowiązuje.
  assert(didRenew && after.expiresYear !== after.signedYear + NAP_YEARS,
    'T2g: po odnowieniu `expiresYear !== signedYear + NAP_YEARS` — dokładnie to, na co zawężono '
    + '`wp_peace_seams` T5c/T5h w DS-2/C0');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT3 — odmowa: stempluje cooldown i NIE mutuje rekordu');
{
  const dipl = world(600);
  addEmpire('e_no');                        // BEZ `makeAgreeable` ⇒ score 0 < próg 10
  dipl.signTreaty('e_no', { id: TREATY_TYPES.non_aggression.id });
  travel(600 + NAP_YEARS - WIN);
  const before = JSON.stringify(dipl.relations.getTreaties('player', 'e_no'));

  const rejects = [];
  EventBus.on('diplomacy:treatyRejected', (p) => rejects.push(p));

  const ev = call(dipl, 'evaluateTreaty', 'e_no', 'non_aggression', { renew: true });
  assert(ev && ev.blocked !== true && ev.decision === false,
    'T3a (KONTROLA PINU): ocena PRZESZŁA pre-warunki i wypadła na NIE (score '
    + Number(ev?.score ?? NaN).toFixed(2) + ' < ' + ev?.threshold + ') — mierzymy ODMOWĘ, nie blokadę');
  assert(call(dipl, 'renewTreaty', 'e_no') === false, 'T3b: odnowienie odrzucone');
  // ⚠ ŚWIADEK: bez `stamped` ten pin przechodzi JAŁOWO tam, gdzie odnowienia nie ma wcale.
  const stamped = dipl.getRefusalYearsLeft('e_no', 'non_aggression') > 0;
  assert(stamped && JSON.stringify(dipl.relations.getTreaties('player', 'e_no')) === before,
    'T3c: odmowa ZASZŁA (stempel jest), a rekord BIT W BIT bez zmian — odrzucone odnowienie niczego nie kosztuje poza cooldownem');
  assert(dipl.getRefusalYearsLeft('e_no', 'non_aggression') === RECENT_REFUSAL_YEARS,
    'T3d: odmowa stempluje `recent_refusal` na ' + RECENT_REFUSAL_YEARS + ' lata (jest: '
    + dipl.getRefusalYearsLeft('e_no', 'non_aggression') + ') — ten sam koszt, co odmowa zwykłej propozycji');
  assert(rejects.length === 1 && rejects[0].reason === 'declined' && rejects[0].treatyId === 'non_aggression',
    'T3e: DOKŁADNIE jedno `diplomacy:treatyRejected` z powodem `declined` (' + rejects.length + ')');
  assert(call(dipl, 'canRenewTreaty', 'e_no') === false,
    'T3f: świeża odmowa ZAMYKA odnowienie — `canRenewTreaty` jest lustrem tej bramki');
  // ⚠ To jest wyprowadzenie liczby 3, nie ozdobnik: gdyby okno było ≤ cooldownowi, pierwsza
  //   odmowa zjadałaby CAŁE okno i pakt wygasałby mimo woli gracza.
  assert(NAP_RENEW_WINDOW_YEARS === WIN && WIN > RECENT_REFUSAL_YEARS,
    'T3g: okno odnowienia (' + WIN + ') jest DŁUŻSZE niż cooldown odmowy (' + RECENT_REFUSAL_YEARS
    + ') — po jednej odmowie zostaje ' + (WIN - RECENT_REFUSAL_YEARS) + ' rok na drugą próbę');
  travel(600 + NAP_YEARS - WIN + RECENT_REFUSAL_YEARS);
  assert(call(dipl, 'canRenewTreaty', 'e_no') === true,
    'T3h: … i po wygaśnięciu cooldownu odnowienie WRACA, wciąż wewnątrz okna');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT4 — tryb `renew` NIE przecieka do zwykłej propozycji');
{
  const dipl = world(600);
  addEmpire('e_leak');
  makeAgreeable(dipl, 'e_leak');
  dipl.signTreaty('e_leak', { id: TREATY_TYPES.non_aggression.id });
  travel(607);

  const plain = call(dipl, 'evaluateTreaty', 'e_leak', 'non_aggression');
  assert(plain?.blocked === true && /alreadySigned/i.test(String(plain?.reasonKey)),
    'T4a: ocena BEZ trybu renew jest nadal BLOKOWANA przez `not_already_signed` (reasonKey: '
    + plain?.reasonKey + ')');
  assert(dipl.proposeTreaty('e_leak', 'non_aggression') === false,
    'T4b: `proposeTreaty` przy stojącym pakcie nadal odmawia — tryb nie wycieka fasadą');

  const renew = call(dipl, 'evaluateTreaty', 'e_leak', 'non_aggression', { renew: true });
  assert(renew?.blocked !== true && renew?.decision === true,
    'T4c: ocena W TRYBIE renew przechodzi pre-warunek i mówi TAK (score '
    + Number(renew?.score ?? NaN).toFixed(2) + ')');

  // ⚠ KONTROLA: sama flaga NIE wystarcza. Sojusz nie ma `renewable`, więc `renew:true`
  //   ma go NADAL blokować — inaczej „odnowienie" stałoby się uniwersalnym obejściem.
  dipl.signTreaty('e_leak', { id: 'alliance' });
  const ally = call(dipl, 'evaluateTreaty', 'e_leak', 'alliance', { renew: true });
  assert(renew?.blocked !== true && ally?.blocked === true
    && /alreadySigned/i.test(String(ally?.reasonKey)),
    'T4d (KONTROLA PINU): tryb renew DZIAŁA dla paktu, a mimo to NIE przepuszcza sojuszu — bramka to KONIUNKCJA flagi '
    + 'propozycji i `renewable` w katalogu (reasonKey: ' + ally?.reasonKey + ')');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT5 — odnawialny jest WYŁĄCZNIE pakt (model i fasada), bez mutacji');
{
  const dipl = world(600);
  addEmpire('e_other');
  makeAgreeable(dipl, 'e_other');
  dipl.signTreaty('e_other', { id: 'trade_agreement' });
  dipl.signTreaty('e_other', { id: 'alliance' });
  const before = JSON.stringify(dipl.relations.getTreaties('player', 'e_other'));

  assert(call(dipl.relations, 'renewTreaty', 'player', 'e_other', 'trade_agreement', 640) === false,
    'T5a: MODEL odmawia odnowienia umowy handlowej (bramka `TREATY_WITH_TERM` siedzi w modelu)');
  assert(call(dipl.relations, 'renewTreaty', 'player', 'e_other', 'alliance', 640) === false,
    'T5b: … i sojuszu');
  assert(typeof dipl.relations.renewTreaty === 'function'
    && JSON.stringify(dipl.relations.getTreaties('player', 'e_other')) === before,
    'T5c: metoda modelu ISTNIEJE i jej odmowa jest BEZ MUTACJI — rekordy bit w bit');
  assert(call(dipl, 'renewTreaty', 'e_other', 'trade_agreement') === false,
    'T5d: fasada też odmawia (nie ma terminu ⇒ `canRenewTreaty` = false)');

  const renewable = Object.entries(VERB_ACCEPTANCE).filter(([, v]) => v.renewable === true).map(([k]) => k);
  assert(renewable.length === 1 && renewable[0] === 'non_aggression',
    'T5e (KONTROLA PINU): w katalogu DOKŁADNIE jeden czasownik ma `renewable` (' + renewable.join(', ') + ')');
  assert(VERB_ACCEPTANCE.non_aggression.preconditions.includes('not_already_signed'),
    'T5f (KONTROLA PINU): pakt NADAL deklaruje `not_already_signed` — wyjątek żyje w CHECKU, '
    + 'nie w liście pre-warunków (dlatego `acceptance_engine` :90 jest cały)');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT6 — zdarzenie, beat i i18n');
{
  const dipl = world(600);
  addEmpire('e_beat');
  makeAgreeable(dipl, 'e_beat');
  dipl.signTreaty('e_beat', { id: TREATY_TYPES.non_aggression.id });
  travel(607);

  const seen = [];
  EventBus.on('diplomacy:treatyRenewed', (p) => seen.push(p));
  call(dipl, 'renewTreaty', 'e_beat');
  assert(seen.length === 1,
    'T6a: DOKŁADNIE jedno `diplomacy:treatyRenewed` (' + seen.length + ')');
  assert(seen[0]?.empireId === 'e_beat' && seen[0]?.treatyId === 'non_aggression'
    && seen[0]?.year === 607 && seen[0]?.expiresYear === 607 + NAP_YEARS,
    'T6b: ładunek kompletny — {empireId, treatyId, year, expiresYear} ('
    + JSON.stringify(seen[0]) + ')');

  // ⚠ `UIManager` NIE IMPORTUJE SIĘ pod node (THREE.TextureLoader) — beat pinujemy ŹRÓDŁOWO.
  const ui = readClean('scenes', 'UIManager.js');
  assert(/diplomacy:treatyRenewed/.test(ui) && /log\.diplo\.napRenewed/.test(ui),
    'T6c (pin ŹRÓDŁOWY): `UIManager` ma konsumenta zdarzenia i pisze beat kluczem `log.diplo.napRenewed`');
  const beatBlock = ui.slice(ui.indexOf('diplomacy:treatyRenewed'), ui.indexOf('diplomacy:treatyRenewed') + 400);
  assert(/Math\.round/.test(beatBlock),
    'T6d: rok w beacie jest CAŁKOWITY — `expiresYear` jest floatem, a `t()` nie formatuje liczb '
    + '(ta sama klasa co findingi 302/303; lekcja zastosowana przy narodzinach)');

  for (const f of ['pl', 'en']) {
    const dict = readRaw('i18n', f + '.js');
    assert(/'log\.diplo\.napRenewed':/.test(dict),
      'T6e[' + f + ']: klucz `log.diplo.napRenewed` istnieje');
    const line = (dict.match(/'log\.diplo\.napRenewed':[^\n]*/) ?? [''])[0];
    assert(/\{0\}/.test(line) && /\{1\}/.test(line),
      'T6f[' + f + ']: … i ma OBA podstawienia — imperium {0} i rok {1} (' + line.trim().slice(0, 80) + ')');
    const exp = (dict.match(/'log\.diplo\.napExpired':[^\n]*/) ?? [''])[0];
    assert(exp.length > 0 && /(odnowi|renew)/i.test(exp),
      'T6g[' + f + ']: beat WYGAŚNIĘCIA mówi graczowi, że można odnowić — bez nowego klucza');
  }
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT7 — round-trip zapisu: odnowiony termin przeżywa');
{
  const dipl = world(600);
  addEmpire('e_save');
  makeAgreeable(dipl, 'e_save');
  dipl.signTreaty('e_save', { id: TREATY_TYPES.non_aggression.id });
  travel(607);
  call(dipl, 'renewTreaty', 'e_save');
  const expected = dipl.relations.getTreaties('player', 'e_save')[0]?.expiresYear;
  assert(expected === 617, 'T7a (KONTROLA PINU): przed zapisem termin to 617 (jest: ' + expected + ')');

  // JSON round-trip = uczciwa symulacja pliku zapisu (wzór `wp_captures_ledger`).
  const blob = JSON.parse(JSON.stringify(gameState.serialize()));
  gameState.reset?.();
  gameState.restore(blob);
  const dipl2 = new DiplomacySystem();
  window.KOSMOS.diplomacySystem = dipl2;
  const after = dipl2.relations.getTreaties('player', 'e_save')[0] ?? {};
  // ⚠ PORӂWNANIE Z LICZBĄ, NIE ZE STANEM PRZED ZAPISEM. Pierwsza wersja asertowała
  //   `after.expiresYear === expected`, gdzie `expected` czytano z TEGO SAMEGO drzewa — więc
  //   pin przechodził także tam, gdzie odnowienia NIE MA (610 === 610). Zmierzone w fail-first.
  assert(after.expiresYear === 617 && after.signedYear === 600,
    'T7b: po round-tripie rekord niesie ODNOWIONY termin (617) i STARY rok podpisu ('
    + JSON.stringify(after) + ') — zero migracji, v101');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT8 — D-DS-3: stary rekord BEZ `expiresYear` też da się odnowić');
{
  const dipl = world(400);
  addEmpire('e_old');
  makeAgreeable(dipl, 'e_old');
  dipl.signTreaty('e_old', { id: TREATY_TYPES.non_aggression.id });
  // Odtwarzamy kształt sprzed DS-1/C1: usuwamy pole, tak jak robi to `wp_peace_seams` T5i.
  const key = dipl.relations.key('player', 'e_old');
  const rel = gameState.get('diplomacy.relations')[key];
  const stripped = (rel.treaties ?? []).map(({ expiresYear, ...rest }) => rest);
  gameState.set('diplomacy.relations.' + key, { ...rel, treaties: stripped }, 'test_old_shape');
  assert(dipl.relations.getTreaties('player', 'e_old')[0]?.expiresYear === undefined,
    'T8a (KONTROLA PINU): fixture NAPRAWDĘ niesie stary kształt — bez `expiresYear`');

  travel(400 + NAP_YEARS - WIN);            // 407 — 3 lata do WYPROWADZONEGO końca
  assert(call(dipl, 'getTreatyYearsLeft', 'e_old') === WIN,
    'T8b: termin WYPROWADZONY z `signedYear + NAP_YEARS` daje ' + WIN + ' lat ('
    + call(dipl, 'getTreatyYearsLeft', 'e_old') + ')');
  assert(call(dipl, 'canRenewTreaty', 'e_old') === true,
    'T8c: stary pakt jest w oknie i DA SIĘ go odnowić — zgodność wstecz bez migracji');
  assert(call(dipl, 'renewTreaty', 'e_old') === true, 'T8d: … i odnowienie przechodzi');
  const after = dipl.relations.getTreaties('player', 'e_old')[0] ?? {};
  assert(after.expiresYear === 407 + NAP_YEARS && after.signedYear === 400,
    'T8e: rekord DOSTAJE jawny termin (' + after.expiresYear + ') przy nietkniętym roku podpisu ('
    + after.signedYear + ')');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT9 — piny źródłowe: liczba producentów i jedno źródło rachunku');
{
  const diplSrc = readClean('systems', 'DiplomacySystem.js');
  const signCalls = (diplSrc.match(/this\.signTreaty\(/g) ?? []).length;
  assert(signCalls === 2,
    'T9a: `DiplomacySystem` ma NADAL DOKŁADNIE dwóch producentów traktatu (' + signCalls + ') — '
    + 'odnowienie idzie do MODELU, nie przez `signTreaty`, więc `wp_peace_seams` T5f zostaje zielony');

  const modelSrc = readClean('systems', 'diplomacy', 'RelationsModel.js');
  const body = modelSrc.slice(modelSrc.indexOf('renewTreaty(a, b, treatyId'),
    modelSrc.indexOf('renewTreaty(a, b, treatyId') + 700);
  assert(body.length > 0 && /treatyExpiryYear\(/.test(body),
    'T9b: `renewTreaty` liczy nowy termin PRZEZ `treatyExpiryYear` — ten sam helper, co ticker i panel');
  assert(body.length > 0 && !/\+\s*NAP_YEARS/.test(body),
    'T9c (KONTROLA PINU): … i NIE ma w sobie drugiego rachunku `+ NAP_YEARS` — kontrola '
    + '`wp_treaty_slot` T2f („formuła w warstwie dokładnie raz") zostaje prawdziwa');
  assert(/TREATY_WITH_TERM/.test(body),
    'T9d: bramka `TREATY_WITH_TERM` jest W CIELE metody modelu, nie u wołającego');
}

console.log('\n=== WYNIK: ' + pass + ' PASS / ' + fail + ' FAIL (z ' + (pass + fail) + ') ===');
process.exit(fail ? 1 : 0);
