// D1 (WOJNA I POKÓJ 1.0) — smoke: czysta matematyka opinii + integralność katalogu.
// Uruchom: node src/testing/smoke/diplomacy_opinion_smoke.mjs
//
// DOWÓD DEKOUPLINGU: STATYCZNE importy, ZERO shimów (window/localStorage/EventBus).
// Jeśli ten plik przestanie się uruchamiać bez atrapy przeglądarki, znaczy że do
// OpinionMath/OpinionModifierData wciekła zależność od stanu gry — to jest regresja.
//
// Pokrywa: klucze par (sortowanie, symetria, walidacja id), strony rekordu, sumowanie
// opinii per właściciel + clamp, upsert refresh vs accumulate, zanikanie (znak, epsilon,
// persistent, ułamkowe dy), narastanie do rampMax, rozbicie do UI (kolejność, yearsLeft),
// próg drabiny eskalacji, wygaśnięcie rozejmu, integralność katalogu i skali.

import {
  assertRelationId, pairKey, isPairKey, isLegacyKey, sideOf, otherId,
  opinionOf, modifierYearsLeft, buildBreakdown,
  upsertModifier, removeModifier, decayModifiers, rampModifiers,
  tensionAfterDecay, crossedUp, truceExpired, TENSION_THRESHOLDS,
} from '../../utils/OpinionMath.js';
import {
  OPINION_MODIFIERS, COMBINE, OPINION_MIN, OPINION_MAX,
  OPINION_HOSTILE_MAX, OPINION_FRIENDLY_MIN, MODIFIER_EPSILON,
  MEMORY_MAX, CB_MEMORY_WINDOW, TRUCE_YEARS,
} from '../../data/OpinionModifierData.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };
const throws = (n, fn) => { let t = false; try { fn(); } catch { t = true; } ok(n, t); };

// Rekord pary w kształcie, jaki trzyma RelationsModel (gracz jest stroną 'b').
const mkRel = (mods = []) => ({
  a: 'emp_003', b: 'player',
  opinionModifiers: mods, tension: 0, status: 'peace', truceUntilYear: null,
  bordersOpen: { a: true, b: true }, treaties: [], memory: [], ultimatumStartYear: null,
});
const mod = (o) => ({ id: 'x', owner: 'a', value: 0, decayPerYear: 0, persistent: false, year: 0, source: null, ...o });

// ── P1: klucze par + walidacja id ──────────────────────────────────────────
console.log('--- P1: pairKey / walidacja id ---');
ok('sortowanie leksykalne + separator', pairKey('player', 'emp_003') === 'emp_003__player');
ok('symetria argumentów', pairKey('emp_003', 'player') === pairKey('player', 'emp_003'));
ok('para AI↔AI (schemat gotowy na D5)', pairKey('emp_010', 'emp_002') === 'emp_002__emp_010');
ok('isPairKey / isLegacyKey', isPairKey('emp_003__player') && !isPairKey('player_emp_003')
  && isLegacyKey('player_emp_003') && !isLegacyKey('emp_003__player'));
throws('rzuca na puste id', () => pairKey('', 'player'));
throws('rzuca na null', () => pairKey(null, 'player'));
throws('rzuca na STARY klucz podany jako id', () => pairKey('player_emp_001', 'player'));
throws('rzuca na klucz pary podany jako id', () => pairKey('emp_001__player', 'player'));
throws('rzuca na relację samą ze sobą', () => pairKey('player', 'player'));
ok('„player" samo w sobie jest poprawnym id', assertRelationId('player') === 'player');

// ── P2: strony rekordu ─────────────────────────────────────────────────────
console.log('--- P2: sideOf / otherId ---');
{
  const rel = mkRel();
  ok('sideOf a/b', sideOf(rel, 'emp_003') === 'a' && sideOf(rel, 'player') === 'b');
  ok('sideOf obce id → null', sideOf(rel, 'emp_999') === null && sideOf(null, 'player') === null);
  ok('otherId round-trip', otherId(rel, 'player') === 'emp_003' && otherId(rel, 'emp_003') === 'player');
  ok('otherId obce id → null', otherId(rel, 'emp_999') === null);
}

// ── P3: sumowanie opinii per właściciel ────────────────────────────────────
console.log('--- P3: opinionOf ---');
{
  const rel = mkRel([
    mod({ id: 'envoy_goodwill', owner: 'a', value: +10 }),
    mod({ id: 'military_presence', owner: 'a', value: -4 }),
    mod({ id: 'their_envoy', owner: 'b', value: +99 }),   // strona gracza — nie liczy się do opinii AI
  ]);
  ok('Σ tylko modyfikatorów właściciela', opinionOf(rel, 'emp_003') === 6);
  ok('kierunkowość: druga strona ma własną sumę', opinionOf(rel, 'player') === 99);
  ok('brak relacji → 0', opinionOf(null, 'player') === 0);
  ok('obce id → 0', opinionOf(rel, 'emp_999') === 0);
  ok('pusta lista → 0', opinionOf(mkRel(), 'emp_003') === 0);
  const hi = mkRel([mod({ owner: 'a', value: 300 })]);
  const lo = mkRel([mod({ owner: 'a', value: -300 })]);
  ok('clamp do ±OPINION_MAX', opinionOf(hi, 'emp_003') === OPINION_MAX && opinionOf(lo, 'emp_003') === OPINION_MIN);
}

// ── P4: upsert — refresh vs accumulate ─────────────────────────────────────
console.log('--- P4: upsertModifier ---');
{
  const base = [mod({ id: 'military_presence', owner: 'a', value: -5, year: 10 })];
  const refreshed = upsertModifier(base, mod({ id: 'military_presence', owner: 'a', value: -5, year: 40 }), COMBINE.REFRESH);
  ok('refresh: JEDEN wpis', refreshed.length === 1);
  ok('refresh: value podmienione (nie zsumowane)', refreshed[0].value === -5);
  ok('refresh: rok zresetowany', refreshed[0].year === 40);

  const acc = upsertModifier(base, mod({ id: 'military_presence', owner: 'a', value: -5, year: 40 }), COMBINE.ACCUMULATE);
  ok('accumulate: nadal JEDEN wpis (save nie puchnie)', acc.length === 1);
  ok('accumulate: value zsumowane (parytet ze starym trustem)', acc[0].value === -10);
  const acc3 = upsertModifier(acc, mod({ id: 'military_presence', owner: 'a', value: -5, year: 50 }), COMBINE.ACCUMULATE);
  ok('accumulate ×3 → −15', acc3[0].value === -15);

  ok('wejściowa tablica NIETKNIĘTA', base.length === 1 && base[0].value === -5 && base[0].year === 10);
  const other = upsertModifier(base, mod({ id: 'military_presence', owner: 'b', value: -5 }), COMBINE.ACCUMULATE);
  ok('ten sam id po DRUGIEJ stronie = osobny wpis', other.length === 2);
  const nowy = upsertModifier([], mod({ id: 'envoy_goodwill', owner: 'a', value: +5 }), COMBINE.ACCUMULATE);
  ok('pierwszy wpis dodawany do pustej listy', nowy.length === 1 && nowy[0].value === 5);
  const cap = upsertModifier([mod({ id: 'x', owner: 'a', value: 90 })], mod({ id: 'x', owner: 'a', value: 90 }), COMBINE.ACCUMULATE);
  ok('accumulate clampuje pojedynczy wpis do skali', cap[0].value === OPINION_MAX);

  ok('removeModifier zdejmuje właściwy wpis', removeModifier(other, 'military_presence', 'b').length === 1);
  const same = removeModifier(base, 'nieistniejacy', 'a');
  ok('removeModifier bez zmian → TA SAMA referencja', same === base);
}

// ── P5: zanikanie ──────────────────────────────────────────────────────────
console.log('--- P5: decayModifiers ---');
{
  const r1 = decayModifiers([mod({ value: 5, decayPerYear: 1 })], 3);
  ok('dodatni pełznie ku zeru (5, 1/rok, 3 lata → 2)', r1[0].value === 2);
  const r2 = decayModifiers([mod({ value: -5, decayPerYear: 1 })], 3);
  ok('ujemny pełznie ku zeru (−5 → −2), nie w drugą stronę', r2[0].value === -2);
  const r3 = decayModifiers([mod({ value: 5, decayPerYear: 1 })], 4.7);
  ok('poniżej epsilon → wpis znika', r3.length === 0 && MODIFIER_EPSILON === 0.5);
  const r4 = decayModifiers([mod({ value: 5, decayPerYear: 1 })], 100);
  ok('nie przestrzeliwuje na drugą stronę zera', r4.length === 0);
  const persist = [mod({ value: -40, decayPerYear: 0, persistent: true })];
  ok('persistent nietknięty', decayModifiers(persist, 50) === persist);
  const zero = [mod({ value: 7, decayPerYear: 0 })];
  ok('decayPerYear 0 nietknięty', decayModifiers(zero, 50) === zero);
  const frac = decayModifiers([mod({ value: 10, decayPerYear: 2 })], 0.5);
  ok('ułamkowe dy', frac[0].value === 9);
  const none = [mod({ value: 5, decayPerYear: 1 })];
  ok('dy = 0 → TA SAMA referencja (brak zapisu do gameState)', decayModifiers(none, 0) === none);
  ok('pusta lista → ta sama referencja', decayModifiers(none.slice(0, 0), 5).length === 0);
}

// ── P6: narastanie (trade_partner) ─────────────────────────────────────────
console.log('--- P6: rampModifiers ---');
{
  const tp = (v) => [mod({ id: 'trade_partner', owner: 'a', value: v, persistent: true })];
  ok('+1 na rok cyw. (odpowiednik starego yearlyTrust)', rampModifiers(tp(0), 1, OPINION_MODIFIERS)[0].value === 1);
  ok('po 25 latach = 25 (stara droga do wysokiego zaufania)', rampModifiers(tp(0), 25, OPINION_MODIFIERS)[0].value === 25);
  ok('saturacja na rampMax', rampModifiers(tp(0), 999, OPINION_MODIFIERS)[0].value === OPINION_MODIFIERS.trade_partner.rampMax);
  ok('na rampMax → TA SAMA referencja', (() => { const l = tp(50); return rampModifiers(l, 5, OPINION_MODIFIERS) === l; })());
  const notRamp = [mod({ id: 'envoy_goodwill', owner: 'a', value: 5, decayPerYear: 1 })];
  ok('modyfikator bez rampPerYear nietknięty', rampModifiers(notRamp, 10, OPINION_MODIFIERS) === notRamp);
  ok('ramp NIE zależy od flagi decayu (czysta funkcja, bez GAME_CONFIG)',
    rampModifiers(tp(0), 3, OPINION_MODIFIERS)[0].value === 3);
}

// ── P7: rozbicie do UI ─────────────────────────────────────────────────────
console.log('--- P7: buildBreakdown ---');
{
  const rel = mkRel([
    mod({ id: 'their_envoy',        owner: 'a', value:  +3, decayPerYear: 1 }),
    mod({ id: 'at_war',             owner: 'a', value: -40, decayPerYear: 0, persistent: true }),
    mod({ id: 'research_intrusion', owner: 'a', value:  -6, decayPerYear: 2 }),
    mod({ id: 'envoy_goodwill',     owner: 'b', value: +99, decayPerYear: 1 }),   // druga strona
  ]);
  const bd = buildBreakdown(rel, 'emp_003', OPINION_MODIFIERS);
  ok('tylko modyfikatory właściciela', bd.length === 3);
  ok('sortowanie malejąco po |value|', bd[0].id === 'at_war' && bd[1].id === 'research_intrusion' && bd[2].id === 'their_envoy');
  ok('labelKey z katalogu', bd[0].labelKey === OPINION_MODIFIERS.at_war.labelKey);
  ok('yearsLeft = ceil(|value| / decay)', bd[1].yearsLeft === 3);
  ok('persistent → Infinity + flaga', bd[0].yearsLeft === Infinity && bd[0].persistent === true);
  ok('decayPerYear 0 → Infinity', modifierYearsLeft(mod({ value: 7, decayPerYear: 0 })) === Infinity);
  const unknown = buildBreakdown(mkRel([mod({ id: 'nie_ma_takiego', owner: 'a', value: -2, decayPerYear: 1 })]), 'emp_003', OPINION_MODIFIERS);
  ok('nieznane id → surowe id, BEZ rzucania', unknown.length === 1 && unknown[0].labelKey === 'nie_ma_takiego');
  const tie = buildBreakdown(mkRel([
    mod({ id: 'zzz', owner: 'a', value: -5, decayPerYear: 1 }),
    mod({ id: 'aaa', owner: 'a', value: +5, decayPerYear: 1 }),
  ]), 'emp_003', OPINION_MODIFIERS);
  ok('remis |value| → stabilnie po id', tie[0].id === 'aaa' && tie[1].id === 'zzz');
  ok('obce id → puste rozbicie', buildBreakdown(rel, 'emp_999', OPINION_MODIFIERS).length === 0);
}

// ── P8: napięcie + drabina eskalacji ───────────────────────────────────────
console.log('--- P8: napięcie ---');
ok('progi drabiny 40/60/80 (port 1:1 ze starego hostility)',
  TENSION_THRESHOLDS.warning === 40 && TENSION_THRESHOLDS.ultimatum === 60 && TENSION_THRESHOLDS.war === 80);
ok('decay napięcia (30, −5/rok, 2 lata → 20)', tensionAfterDecay(30, 2, 5) === 20);
ok('napięcie nie schodzi poniżej 0', tensionAfterDecay(3, 5, 5) === 0);
ok('dy = 0 → bez zmian', tensionAfterDecay(30, 0, 5) === 30);
ok('crossedUp: 39→40 przekracza próg', crossedUp(39, 40, 40) === true);
ok('crossedUp: 40→41 JUŻ nie przekracza', crossedUp(40, 41, 40) === false);
ok('crossedUp: spadek nie liczy się (drabina tylko w górę)', crossedUp(85, 40, 40) === false);

// ── P9: rozejm ─────────────────────────────────────────────────────────────
console.log('--- P9: truceExpired ---');
ok('null → nigdy nie wygasa', truceExpired(null, 9999) === false);
ok('przed terminem → false', truceExpired(120, 119.9) === false);
ok('w roku terminu → true', truceExpired(120, 120) === true);
ok('po terminie → true', truceExpired(120, 130) === true);

// ── P10: integralność katalogu i skali ─────────────────────────────────────
console.log('--- P10: katalog ---');
{
  const entries = Object.entries(OPINION_MODIFIERS);
  ok('id równe kluczowi w każdym wpisie', entries.every(([k, v]) => v.id === k));
  ok('każdy wpis ma labelKey', entries.every(([, v]) => typeof v.labelKey === 'string' && v.labelKey.startsWith('diplo.mod.')));
  ok('defaultValue / decayPerYear liczbowe', entries.every(([, v]) => Number.isFinite(v.defaultValue) && Number.isFinite(v.decayPerYear)));
  ok('combine z dozwolonego zbioru', entries.every(([, v]) => v.combine === COMBINE.REFRESH || v.combine === COMBINE.ACCUMULATE));
  // Magnitudy przeniesione 1:1 ze starych źródeł trustu (tabela mapowania D1).
  ok('envoy +5', OPINION_MODIFIERS.envoy_goodwill.defaultValue === +5);
  ok('AI envoy +3', OPINION_MODIFIERS.their_envoy.defaultValue === +3);
  ok('obecność wojskowa −5', OPINION_MODIFIERS.military_presence.defaultValue === -5);
  ok('wtargnięcie badawcze −3', OPINION_MODIFIERS.research_intrusion.defaultValue === -3);
  ok('zaleganie −5', OPINION_MODIFIERS.trespassing.defaultValue === -5);
  ok('stan wojny −40 + persistent', OPINION_MODIFIERS.at_war.defaultValue === -40 && OPINION_MODIFIERS.at_war.persistent === true);
  // Powtarzalne źródła MUSZĄ się kumulować — inaczej dziesięć zbrojnych wizyt boli tyle co jedna.
  ok('powtarzalne źródła kumulują się (parytet)',
    ['envoy_goodwill', 'their_envoy', 'military_presence', 'research_intrusion', 'trespassing']
      .every(id => OPINION_MODIFIERS[id].combine === COMBINE.ACCUMULATE));
  ok('trade_partner narasta +1/rok do +50 i jest persistent',
    OPINION_MODIFIERS.trade_partner.rampPerYear === 1 && OPINION_MODIFIERS.trade_partner.rampMax === 50
    && OPINION_MODIFIERS.trade_partner.persistent === true
    && OPINION_MODIFIERS.trade_partner.treatyId === 'trade_agreement');
  // D2/E2 — Decyzja 1 fazy WYKONANA: wpis usunięty, bo napięcie wchodzi do decyzji
  // jako TERM silnika. Trzymanie obu = podwójne liczenie (napięcie raz wprost, raz
  // przez opinię, która sama jest termem). Ten pin pilnuje, że nie wróci tylnymi drzwiami.
  ok('threatened_by_you USUNIĘTY z katalogu (napięcie liczy TERM, nie modyfikator)',
    OPINION_MODIFIERS.threatened_by_you === undefined);
  // Skala: opinia 0 = stary trust 50, więc pasma statusu przesuwają się o −50.
  ok('pasmo wrogie ↔ stary trust ≤ 29', OPINION_HOSTILE_MAX === 29 - 50);
  ok('pasmo przyjazne ↔ stary trust ≥ 65', OPINION_FRIENDLY_MIN === 65 - 50);
  ok('zakres ±100', OPINION_MIN === -100 && OPINION_MAX === 100);
  ok('pamięć 20, okno casus belli 10 (węższe — chroni dobór CB)',
    MEMORY_MAX === 20 && CB_MEMORY_WINDOW === 10 && CB_MEMORY_WINDOW < MEMORY_MAX);
  ok('rozejm 10 lat', TRUCE_YEARS === 10);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
