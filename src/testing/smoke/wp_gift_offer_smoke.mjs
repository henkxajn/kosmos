// DS-3 / C1 — keeper DARU DOŁĄCZONEGO DO PROPOZYCJI (D-DS-7 kształt B, D-DS-8).
//
// PO CO: term `offer` liczył poprawnie od E1, `counterHintFor` od E1 podawał KWOTĘ, która
// domknęłaby lukę — i nikt tego nie czytał (finding #306: zero konsumentów w `src/`). Brakowało
// WYŁĄCZNIE drogi z fasady do silnika i jednego przycisku.
//
// ⚠ KSZTAŁT B JEST WYMUSZONY POMIAREM, nie wybrany z gustu. Sonda na żywym silniku: pakt, próg 10,
//   przed odmową score 0 i hint 500 Kr (500 Kr ⇒ score 10 = TAK). PO stemplu `recent_refusal`
//   (waga 25, a `offer` nasyca się na +20): 0 Kr → −25, 500 → −15, 2000 → −6.25, 10 000 → −5,
//   MILION → −5. Czyli dar po odmowie był STRUKTURALNIE bezsilny — nie w fixture'cie, w wagach.
//   A modal odmowy otwiera się PO stemplu. Dlatego dar UCHYLA świeżą odmowę (jedna PŁATNA próba):
//   sam musi i tak domknąć lukę BAZOWĄ, a odmowa osłodzonej propozycji stempluje normalnie (T4e).
//
// ⚠ GRANICA DOWODU NAZWANA WPROST. Atrapa DOM (`testing/headless/env.js`) ma `addEventListener`
//   i `click()` jako NO-OPY, więc kliknięcia NIE DA SIĘ dyspozycjonować pod node. Dowód jest
//   rozłożony: (a) istnienie przycisku, jego etykieta i stan `disabled` — WYKONANIEM, przez
//   prawdziwy `EventBus.emit` → `initDiplomacyRefusals` → `queueMissionEvent` → obchód drzewa DOM;
//   (b) kontrakt buildera na `disabled` — WYKONANIEM, wywołaniem wprost; (c) WIĄZANIE kliku
//   z fasadą — ŹRÓDŁOWO (T10/T11); (d) to, co robi fasada — WYKONANIEM (T1-T5).
//   ⚠ NIE podnosimy atrapy DOM, żeby zazielenić (c): to wspólna infrastruktura kilkudziesięciu
//   keeperów, a „inertne listenery" bywają ich milczącym założeniem.
//
// ⚠ POPUP POKAZUJE SIĘ RAZ NA PROCES: `MissionEventModal._active` jest prywatne, a `dismiss`
//   nieosiągalne z zewnątrz (klik nie działa), więc drugi `queueMissionEvent` trafia do kolejki
//   i nic nie rysuje. Scenariusze popupu idą więc w OSOBNYCH PROCESACH POTOMNYCH — wzór
//   `wp_treaty_slot` T7 (tam child odpala cudzy keeper).
//
// Uruchom: node src/testing/smoke/wp_gift_offer_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (window/localStorage/THREE)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { DiplomacySystem } from '../../systems/DiplomacySystem.js';
import { TREATY_TYPES } from '../../data/TreatyData.js';
import { VERB_ACCEPTANCE, RECENT_REFUSAL_YEARS, OFFER_HALF_KR } from '../../data/AcceptanceWeightData.js';
import { counterHintFor } from '../../utils/AcceptanceMath.js';
import { NAP_YEARS, NAP_RENEW_WINDOW_YEARS } from '../../data/OpinionModifierData.js';

// ⚠ NAMESPACE + `?? null`: `buildRefusalContent` istnieje na obu drzewach, ale jego NOWE opcje
//   (`giftCredits`) nie — namespace chroni przebieg, gdyby kiedyś zmienił się kształt eksportu.
import * as RefusalMod from '../../ui/DiplomacyRefusalModal.js';
const buildRefusalContent = RefusalMod.buildRefusalContent ?? null;

const WIN = NAP_RENEW_WINDOW_YEARS ?? 3;

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

/** Wywołanie, które DEGRADUJE do `undefined` zamiast zabijać przebieg. */
const call = (obj, m, ...a) => (typeof obj?.[m] === 'function' ? obj[m](...a) : undefined);

// ── Piny źródłowe ───────────────────────────────────────────────────────────
// ⚠ CRLF (§270): część plików jest CRLF na dysku — czytamy PO NORMALIZACJI, inaczej kotwica
//   z `\n` nie trafia. Komentarze zdejmowane: pin ma czytać KOD, nie opis kodu.
const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SRC_URL = new URL('../../', import.meta.url).href;
const norm = (s) => s.replace(/\r\n/g, '\n');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const readClean = (...p) => stripComments(norm(readFileSync(join(SRC, ...p), 'utf8')));
const readRaw = (...p) => norm(readFileSync(join(SRC, ...p), 'utf8'));

// ── Świat (ze SKARBCEM) ─────────────────────────────────────────────────────
const empires = new Map();
let purse = null;
function world(year, credits) {
  empires.clear();
  gameState.reset?.();
  EventBus.clear?.();
  purse = { credits };
  window.KOSMOS = {
    timeSystem: { gameTime: year },
    empireRegistry: { get: (id) => empires.get(id), listAll: () => [...empires.values()] },
    galaxyData: { seed: 4242, systems: [] },
    warSystem: { getWarWith: () => null, getCaptures: () => [] },
    intelSystem: { getLevel: () => 'contact' },
    // Atrapa SKARBCA z semantyką kanonu: all-or-nothing na CAŁYM rachunku.
    civilianTradeSystem: {
      getTreasuryCredits: () => purse.credits,
      spendFromTreasury: (amt) => {
        if (!(amt > 0)) return true;
        if (purse.credits < amt) return false;      // NIC nie pobieramy
        purse.credits -= amt;
        return true;
      },
    },
  };
  const dipl = new DiplomacySystem();
  window.KOSMOS.diplomacySystem = dipl;
  return dipl;
}
/** ⚠ `aggression 0.2` — `personality_floor` paktu wymaga ≤ 0.4, inaczej pre-warunek blokuje. */
const addEmpire = (id) => empires.set(id, {
  id, name: id, archetype: 'militarist', personality: { aggression: 0.2, trade: 0.6 }, traits: [],
});
const travel = (year) => { window.KOSMOS.timeSystem.gameTime = year; };
// ⚠ Wiersz rozbicia niesie `term`, a NIE `id`/`termId` (zmierzone: `buildAcceptanceBreakdown`
//   zwraca `{ term, labelKey, status, raw, weight, value }`). I ⚠ rozbicie ZAWIERA
//   wiersze o wartości 0 — filtruje je dopiero WIDOK (`buildRefusalContent`), więc piny
//   mierzą WARTOŚĆ, nie obecność: „nie ma wiersza” byłoby prawdą z niczego.
const rowOf = (result, term) => (result?.breakdown ?? []).find(r => r?.term === term) ?? null;
const valOf = (result, term) => Number(rowOf(result, term)?.value ?? NaN);

// ── Uruchamianie scenariusza popupu w PROCESIE POTOMNYM ─────────────────────
// Czemu child: `_active` w `MissionEventModal` jest prywatne i nieusuwalne bez `dismiss`, więc
// jeden proces = jeden narysowany popup. `execFileSync` NIE idzie przez shell, więc skrypt
// przekazany w `-e` nie podlega cytowaniu powłoki (bez tego Windows rozjechałby apostrofy).
function popupButtons(credits, treasury) {
  const script = `
    const P = ${JSON.stringify(SRC_URL)};
    await import(P + 'testing/headless/env.js');
    const EventBus = (await import(P + 'core/EventBus.js')).default;
    const gameState = (await import(P + 'core/GameState.js')).default;
    const { DiplomacySystem } = await import(P + 'systems/DiplomacySystem.js');
    const { initDiplomacyRefusals } = await import(P + 'ui/DiplomacyRefusalModal.js');
    const OMD = await import(P + 'data/OpinionModifierData.js');
    const empires = new Map();
    const purse = { credits: ${treasury} };
    window.KOSMOS = {
      timeSystem: { gameTime: 600 },
      empireRegistry: { get: (id) => empires.get(id), listAll: () => [...empires.values()] },
      galaxyData: { seed: 4242, systems: [] },
      warSystem: { getWarWith: () => null, getCaptures: () => [] },
      civilianTradeSystem: {
        getTreasuryCredits: () => purse.credits,
        spendFromTreasury: (a) => { if (purse.credits < a) return false; purse.credits -= a; return true; },
      },
    };
    empires.set('e_pop', { id: 'e_pop', name: 'Liga', archetype: 'militarist',
      personality: { aggression: 0.2, trade: 0.6 }, traits: [] });
    const dipl = new DiplomacySystem();
    window.KOSMOS.diplomacySystem = dipl;
    initDiplomacyRefusals();
    dipl.signTreaty('e_pop', { id: 'non_aggression' });
    window.KOSMOS.timeSystem.gameTime = 600 + OMD.NAP_YEARS - ${WIN};
    const took = dipl.renewTreaty('e_pop');          // odmowa ⇒ popup
    const btns = [];
    const walk = (n, d) => {
      if (!n || d > 14) return;
      if (n.tagName === 'BUTTON') btns.push({ label: String(n.textContent ?? ''), disabled: n.disabled === true });
      for (const c of (n.children ?? [])) walk(c, d + 1);
    };
    walk(document.body, 0);
    console.log('@@' + JSON.stringify({ renewed: took, buttons: btns, treasury: purse.credits }));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const line = out.split('\n').find(l => l.startsWith('@@'));
  return line ? JSON.parse(line.slice(2)) : null;
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T1 — passthrough: fasada NIESIE dar do silnika (droga, której brakowało)');
{
  const dipl = world(600, 5000);
  addEmpire('e_pass');
  dipl.signTreaty('e_pass', { id: TREATY_TYPES.non_aggression.id });
  travel(600 + NAP_YEARS - WIN);

  const plain = call(dipl, 'evaluateTreaty', 'e_pass', 'non_aggression', { renew: true });
  assert(plain && plain.blocked !== true && valOf(plain, 'offer') === 0,
    'T1a (KONTROLA PINU): ocena BEZ daru ma wiersz `offer` ZEROWY (score '
    + Number(plain?.score ?? NaN).toFixed(2) + ') — jest co porównać');

  const sweet = call(dipl, 'evaluateTreaty', 'e_pass', 'non_aggression',
    { renew: true, offer: { credits: 500 } });
  const row = rowOf(sweet, 'offer');
  assert(!!row && Number(row.value) > 0,
    'T1b: ocena Z DAREM ma DODATNI wiersz `offer` (' + JSON.stringify(row) + ') — dar dociera do silnika');
  assert(sweet && Number(sweet.score) > Number(plain?.score ?? 0),
    'T1c: … i podnosi wynik (' + Number(plain?.score ?? NaN).toFixed(2) + ' → '
    + Number(sweet?.score ?? NaN).toFixed(2) + ')');
  assert(sweet?.decision === true && plain?.decision === false,
    'T1d: 500 Kr przewraca decyzję z NIE na TAK (próg ' + sweet?.threshold + ')');
  assert(VERB_ACCEPTANCE.non_aggression.terms.offer === 20 && OFFER_HALF_KR === 500,
    'T1e (KONTROLA PINU): waga `offer` 20 i połowa nasycenia ' + OFFER_HALF_KR
    + ' Kr — liczby z katalogu, nie z pinu');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT2 — D-DS-7(B): dar UCHYLA świeżą odmowę w OCENIE');
{
  const dipl = world(600, 5000);
  addEmpire('e_waive');
  dipl.signTreaty('e_waive', { id: TREATY_TYPES.non_aggression.id });
  travel(600 + NAP_YEARS - WIN);
  assert(call(dipl, 'renewTreaty', 'e_waive') === false
    && dipl.getRefusalYearsLeft('e_waive', 'non_aggression') === RECENT_REFUSAL_YEARS,
    'T2a (KONTROLA PINU): odmowa ZASZŁA i stempel leży — jest co uchylać');

  const bare = call(dipl, 'evaluateTreaty', 'e_waive', 'non_aggression', { renew: true });
  const bareRow = rowOf(bare, 'recent_refusal');
  assert(!!bareRow && Number(bareRow.value) < 0,
    'T2b (KONTROLA PINU): bez daru kara JEST w rozbiciu (' + JSON.stringify(bareRow) + ')');

  const sweet = call(dipl, 'evaluateTreaty', 'e_waive', 'non_aggression',
    { renew: true, offer: { credits: 500 } });
  assert(valOf(sweet, 'recent_refusal') === 0 && Number(bareRow?.value) < 0,
    'T2c: z darem kara WYZEROWANA (' + valOf(sweet, 'recent_refusal') + ' wobec '
    + Number(bareRow?.value) + ' bez daru) — term uchyla się sam, a widok taki wiersz pomija');
  assert(sweet?.decision === true,
    'T2d: … i osłodzona propozycja przechodzi (score ' + Number(sweet?.score ?? NaN).toFixed(2)
    + ' ≥ ' + sweet?.threshold + '), czego BEZ uchylenia nie dałaby ŻADNA kwota (sonda: milion → −5)');
  assert(VERB_ACCEPTANCE.non_aggression.terms.recent_refusal > VERB_ACCEPTANCE.non_aggression.terms.offer,
    'T2e (KONTROLA PINU): kara (' + VERB_ACCEPTANCE.non_aggression.terms.recent_refusal
    + ') jest CIĘŻSZA od nasycenia daru (' + VERB_ACCEPTANCE.non_aggression.terms.offer
    + ') — to jest wyprowadzenie kształtu B, nie ozdobnik');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT3 — bramka `canRenewTreaty`: dar przechodzi mimo odmowy, okno NADAL obowiązuje');
{
  const dipl = world(600, 5000);
  addEmpire('e_gate');
  dipl.signTreaty('e_gate', { id: TREATY_TYPES.non_aggression.id });
  travel(600 + NAP_YEARS - WIN);
  call(dipl, 'renewTreaty', 'e_gate');                       // odmowa ⇒ stempel
  assert(call(dipl, 'canRenewTreaty', 'e_gate') === false,
    'T3a (KONTROLA PINU): bez daru bramka ZAMKNIĘTA (panel C2 rysuje wtedy szary licznik)');
  const gateOpens = call(dipl, 'canRenewTreaty', 'e_gate', 'non_aggression', { offer: { credits: 500 } }) === true;
  assert(gateOpens,
    'T3b: z darem bramka OTWARTA — lustro wyjątku, który term robi w silniku');

  // OKNO zostaje: dar nie kupuje odnowienia paktu, który ma jeszcze 10 lat.
  const dipl2 = world(700, 5000);
  addEmpire('e_far');
  dipl2.signTreaty('e_far', { id: TREATY_TYPES.non_aggression.id });
  assert(call(dipl2, 'getTreatyYearsLeft', 'e_far') === NAP_YEARS,
    'T3c (KONTROLA PINU): świeży pakt ma ' + NAP_YEARS + ' lat — jest POZA oknem');
  // ⚠ ŚWIADEK `gateOpens`: bez niego pin przechodzi JAŁOWO tam, gdzie dar jest w ogóle NIEWIDZIANY
  //   (bramka odmawia z innego powodu). Zmierzone fail-firstem na bazie C1+C2.
  assert(gateOpens
    && call(dipl2, 'canRenewTreaty', 'e_far', 'non_aggression', { offer: { credits: 10000 } }) === false,
    'T3d: dar NIE kupuje okna — 10 000 Kr nie odnawia paktu, który ma jeszcze ' + NAP_YEARS + ' lat');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT4 — D-DS-8: pieniądze WYŁĄCZNIE po TAK, dokładnie raz');
{
  const dipl = world(600, 5000);
  addEmpire('e_pay');
  dipl.signTreaty('e_pay', { id: TREATY_TYPES.non_aggression.id });
  const RENEW_AT = 600 + NAP_YEARS - WIN;
  travel(RENEW_AT);

  const gifts = [];
  EventBus.on('diplomacy:giftSent', (p) => gifts.push(p));
  const rejects = [];
  EventBus.on('diplomacy:treatyRejected', (p) => rejects.push(p));

  const r0 = call(dipl, 'evaluateTreaty', 'e_pay', 'non_aggression', { renew: true });
  const hint = r0?.counterHint?.addOffer?.credits ?? null;
  assert(hint === 500,
    'T4a (KONTROLA PINU): silnik SAM podaje kwotę (' + hint + ' Kr) — modal jej nie liczy');
  assert(call(dipl, 'renewTreaty', 'e_pay') === false && purse.credits === 5000,
    'T4b: odmowa BEZ daru nic nie kosztuje (skarbiec ' + purse.credits + ')');

  const before = purse.credits;
  const ok = call(dipl, 'renewTreaty', 'e_pay', 'non_aggression', { offer: { credits: hint } });
  const rec = dipl.relations.getTreaties('player', 'e_pay').find(t => t.id === 'non_aggression');
  assert(ok === true && rec?.expiresYear === RENEW_AT + NAP_YEARS,
    'T4c: osłodzone odnowienie PRZESZŁO — termin ' + rec?.expiresYear + ' (rok ' + RENEW_AT
    + ' + ' + NAP_YEARS + ')');
  assert(ok === true && purse.credits === before - hint,
    'T4d: skarbiec obciążony DOKŁADNIE o kwotę daru (' + before + ' → ' + purse.credits + ')');
  assert(ok === true && gifts.length === 1 && gifts[0].credits === hint,
    'T4e: DOKŁADNIE jedno `diplomacy:giftSent` (' + gifts.length + ') — jedna droga pieniędzy');
  assert(ok === true && rec?.signedYear === 600,
    'T4f: … i rok podpisu NIETKNIĘTY (' + rec?.signedYear + ') — dar nie robi z paktu nowego');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT5 — jedna PŁATNA próba, nie łańcuch + brak środków = all-or-nothing');
{
  // (a) odmowa OSŁODZONEJ propozycji: skarbiec bez zmian, stempel NORMALNY.
  const dipl = world(600, 5000);
  addEmpire('e_chain');
  dipl.signTreaty('e_chain', { id: TREATY_TYPES.non_aggression.id });
  travel(600 + NAP_YEARS - WIN);
  const gifts = [];
  EventBus.on('diplomacy:giftSent', (p) => gifts.push(p));
  // ⚠ ŚWIADEK `saw100`: dowodzi, że silnik te 100 Kr ZOBACZYŁ. Bez niego T5a/T5b są prawdą
  //   z niczego na drzewie, które daru nie przekazuje w ogóle (zmierzone fail-firstem).
  const saw100 = Number(valOf(call(dipl, 'evaluateTreaty', 'e_chain', 'non_aggression',
    { renew: true, offer: { credits: 100 } }), 'offer')) > 0;
  const ok = call(dipl, 'renewTreaty', 'e_chain', 'non_aggression', { offer: { credits: 100 } });
  assert(saw100 && ok === false && purse.credits === 5000 && gifts.length === 0,
    'T5a: 100 Kr nie domyka luki ⇒ odmowa, a skarbiec BEZ ZMIAN (' + purse.credits
    + ') — gracz nie płaci za „nie"');
  assert(saw100 && dipl.getRefusalYearsLeft('e_chain', 'non_aggression') === RECENT_REFUSAL_YEARS,
    'T5b: odmowa OSŁODZONEJ propozycji stempluje NORMALNIE (' + RECENT_REFUSAL_YEARS
    + ' lata) — jedna płatna próba, nie darmowy łańcuch');

  // (b) brak środków: nie schodzi ani grosz, traktat się nie rusza, powód JEST.
  const dipl2 = world(600, 10);
  addEmpire('e_poor');
  dipl2.signTreaty('e_poor', { id: TREATY_TYPES.non_aggression.id });
  travel(600 + NAP_YEARS - WIN);
  const rejects = [];
  EventBus.on('diplomacy:treatyRejected', (p) => rejects.push(p));
  const before = JSON.stringify(dipl2.relations.getTreaties('player', 'e_poor'));
  // ⚠ ŚWIADEK `voteWasYes`: dowodzi, że deal umarł na PIENIĄDZACH, a nie na głosie AI. Bez niego pin
  //   przechodzi jałowo tam, gdzie dar jest niewidziany i propozycja odpada normalnie.
  const voteWasYes = call(dipl2, 'evaluateTreaty', 'e_poor', 'non_aggression',
    { renew: true, offer: { credits: 500 } })?.decision === true;
  const ok2 = call(dipl2, 'renewTreaty', 'e_poor', 'non_aggression', { offer: { credits: 500 } });
  assert(voteWasYes && ok2 === false && purse.credits === 10
    && JSON.stringify(dipl2.relations.getTreaties('player', 'e_poor')) === before,
    'T5c: 500 Kr przy 10 Kr w skarbcu ⇒ ani grosz nie schodzi I traktat bit w bit ('
    + purse.credits + ' Kr)');
  const last = rejects[rejects.length - 1];
  assert(last?.reason === 'insufficient_credits'
    && last?.result?.reasonKey === 'diplo.reject.notEnoughCredits',
    'T5d: … i odmowa ma POWÓD (' + last?.reason + '/' + last?.result?.reasonKey
    + '), a nie ciszę — cisza czytałaby się jak „przycisk nie działa"');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT6 — kwota pochodzi z SILNIKA (`counterHintFor`), nie z literału w UI');
{
  const dipl = world(600, 5000);
  addEmpire('e_hint');
  dipl.signTreaty('e_hint', { id: TREATY_TYPES.non_aggression.id });
  travel(600 + NAP_YEARS - WIN);
  const r = call(dipl, 'evaluateTreaty', 'e_hint', 'non_aggression', { renew: true });
  const direct = counterHintFor(r.score, r.threshold, VERB_ACCEPTANCE.non_aggression.terms, { offerAlready: 0 });
  assert(r?.counterHint?.addOffer?.credits === direct?.addOffer?.credits
    && typeof direct?.addOffer?.credits === 'number',
    'T6a: hint z oceny == hint z `counterHintFor` (' + r?.counterHint?.addOffer?.credits + ' Kr)');

  const modal = readClean('ui', 'DiplomacyRefusalModal.js');
  assert(/counterHint\?\.addOffer\?\.credits|counterHint\.addOffer\.credits/.test(modal),
    'T6b (pin ŹRÓDŁOWY): modal CZYTA `counterHint.addOffer.credits` — #306 ma wreszcie konsumenta');
  assert(!/\b500\b/.test(modal),
    'T6c (TRIPWIRE): w modalu NIE MA literału 500 — kwota nie może być wpisana na sztywno');
  assert(/getTreasuryCredits/.test(modal),
    'T6d: modal pyta o skarbiec TYM SAMYM getterem, którym płaci `spendFromTreasury` — '
    + 'liczba na ekranie nie może skłamać wobec tego, co da się opłacić');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT7 — treść karty: linia z kwotą, a przy pustym skarbcu POWÓD (czysta funkcja)');
{
  const result = { blocked: false, score: 0, threshold: 10, breakdown: [], counterHint: { addOffer: { credits: 500 } } };
  const tr = (k, ...a) => k + (a.length ? '(' + a.join('|') + ')' : '');
  const none = buildRefusalContent?.(result, { translate: tr, rows: [] }) ?? '';
  assert(typeof none === 'string' && none.length > 0 && !/diplo\.gift\.hint/.test(none),
    'T7a (KONTROLA PINU): bez `giftCredits` karta NIE ma linii daru — inaczej pin niżej byłby jałowy');

  const withGift = buildRefusalContent?.(result, { translate: tr, rows: [], giftCredits: 500 }) ?? '';
  assert(/diplo\.gift\.hint\(500\)/.test(withGift),
    'T7b: karta niesie linię „500 Kr zamknęłoby lukę" z kwotą SILNIKA');
  assert(!/diplo\.reject\.notEnoughCredits/.test(withGift),
    'T7c: … i przy pokrytym rachunku NIE dokłada powodu odmowy');

  const poor = buildRefusalContent?.(result, { translate: tr, rows: [], giftCredits: 500, giftAffordable: false }) ?? '';
  assert(/diplo\.gift\.hint\(500\)/.test(poor) && /diplo\.reject\.notEnoughCredits/.test(poor),
    'T7d: przy pustym skarbcu karta pokazuje I kwotę, I POWÓD — przycisk będzie szary, więc '
    + 'gracz musi wiedzieć DLACZEGO');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT8 — POPUP (proces potomny): przycisk daru ISTNIEJE i jest AKTYWNY, gdy stać');
{
  const rich = popupButtons(500, 5000);
  assert(!!rich && Array.isArray(rich.buttons) && rich.buttons.length > 0,
    'T8a (KONTROLA PINU): popup REALNIE się narysował — ' + (rich ? rich.buttons.length : 0)
    + ' przycisków w drzewie DOM');
  assert(!!rich && rich.renewed === false,
    'T8b (KONTROLA PINU): mierzymy popup po ODMOWIE (renewTreaty=' + rich?.renewed + ')');
  const gift = rich?.buttons?.find(b => /500/.test(b.label)) ?? null;
  assert(!!gift, 'T8c: w karcie JEST przycisk z kwotą daru — ' + JSON.stringify(rich?.buttons));
  assert(!!gift && gift.disabled === false,
    'T8d: … i jest AKTYWNY, bo skarbiec pokrywa 500 Kr (disabled=' + gift?.disabled + ')');
  assert(!!rich && rich.buttons.length === 2,
    'T8e: karta ma DOKŁADNIE dwa przyciski (OK + dar), nie trzy (' + rich?.buttons.length + ')');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT9 — POPUP (proces potomny): ten sam przycisk WYSZARZONY przy pustym skarbcu');
{
  const poor = popupButtons(500, 10);
  const gift = poor?.buttons?.find(b => /500/.test(b.label)) ?? null;
  assert(!!gift,
    'T9a (KONTROLA PINU): przycisk NIE ZNIKA przy braku środków — kanon „widoczny+zablokowany" ('
    + JSON.stringify(poor?.buttons) + ')');
  assert(!!gift && gift.disabled === true,
    'T9b: … i jest WYSZARZONY (disabled=' + gift?.disabled + ')');
  assert(!!poor && poor.treasury === 10,
    'T9c (KONTROLA PINU): skarbiec nietknięty (' + poor?.treasury + ' Kr) — nic nie zeszło');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT10 — KANAŁ: builder honoruje `disabled` (wykonanie), a kanał `onClick` (źródło)');
{
  // (a) kontrakt buildera — WYKONANIEM, wprost.
  const mod = await import('../../ui/ScheduledEventPopup.js');
  const built = mod.buildScheduledEventPopup({
    severity: 'warning', videoSrc: [], barTitle: 'T', headline: 'H', description: 'D', contentHTML: '',
    buttons: [{ label: 'OK', primary: true }, { label: 'DAR', disabled: true }],
  });
  assert(built?.btnElements?.length === 2,
    'T10a (KONTROLA PINU): builder zwrócił dwa przyciski (' + built?.btnElements?.length + ')');
  assert(built?.btnElements?.[1]?.disabled === true && built?.btnElements?.[0]?.disabled === false,
    'T10b: `disabled` z konfiguracji LĄDUJE na elemencie, a przycisk bez flagi zostaje aktywny');

  // (b) kanał — ŹRÓDŁOWO: atrapa DOM nie dyspozycjonuje kliknięć (granica dowodu w nagłówku).
  const mem = readClean('ui', 'MissionEventModal.js');
  assert(/cfgButtons\[i\]\?\.onClick|\.onClick/.test(mem) && /_hasCustomClick\s*=\s*true/.test(mem),
    'T10c (pin ŹRÓDŁOWY): kanał CZYTA `onClick` i ustawia `_hasCustomClick` — pierwszy PISARZ '
    + 'tego znacznika, który istniał tam bez pisarza');
  assert(/if \(!btn\._hasCustomClick\)/.test(mem),
    'T10d (KONTROLA PINU): pętla doklejająca `dismiss` przyciskom BEZ znacznika ZOSTAJE — '
    + 'to ten sam inwariant, który pinuje `wp_ai_peace_offer` T7c');
  const modal = readClean('ui', 'DiplomacyRefusalModal.js');
  assert(/onClick:/.test(modal) && /disabled:\s*!affordable/.test(modal),
    'T10e (pin ŹRÓDŁOWY): modal podaje `onClick` i `disabled: !affordable` — wiązanie kliku');
  assert(/renewTreaty\?\.\(|renewTreaty\(/.test(modal) && /proposeTreaty\?\.\(|proposeTreaty\(/.test(modal),
    'T10f (pin ŹRÓDŁOWY): ponowienie woła OBIE fasady — `renew` z ładunku rozstrzyga którą');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT11 — zakres: dar dostają WYŁĄCZNIE traktaty; pokój i emisariusz nietknięte');
{
  const modal = readClean('ui', 'DiplomacyRefusalModal.js');
  const peaceBlock = modal.slice(modal.indexOf("'diplomacy:peaceRejected'"), modal.indexOf("'diplomacy:envoyRefused'"));
  const envoyBlock = modal.slice(modal.indexOf("'diplomacy:envoyRefused'"));
  // ⚠ ŚWIADEK `treatyHasRetry` liczony TUTAJ, bo T11a/T11b bez niego przechodzą jałowo na drzewie,
  //   na którym SŁOWA `retry` nie ma w tym pliku ANI RAZU (zmierzone fail-firstem).
  const treatyHasRetry = /retry:/.test(
    modal.slice(modal.indexOf("'diplomacy:treatyRejected'"), modal.indexOf("'diplomacy:peaceRejected'")));
  assert(treatyHasRetry && peaceBlock.length > 0 && !/retry/.test(peaceBlock),
    'T11a: ścieżka POKOJU nie podaje `retry` — stół pokoju oferty nie składa (reparacje = WP-R)');
  assert(treatyHasRetry && envoyBlock.length > 0 && !/retry/.test(envoyBlock),
    'T11b: ścieżka EMISARIUSZA też nie — to MISJA, nie propozycja, więc „ponowienie" '
    + 'znaczyłoby wysłanie drugiego statku');
  const treatyBlock = modal.slice(modal.indexOf("'diplomacy:treatyRejected'"), modal.indexOf("'diplomacy:peaceRejected'"));
  assert(treatyBlock.length > 0 && /retry:/.test(treatyBlock),
    'T11c (KONTROLA PINU): ścieżka TRAKTATU go podaje — T11a/T11b nie mierzą nieobecności '
    + 'czegoś, czego nie ma nigdzie');

  // Silnik: bez `offer` w opts żaden czasownik nie dostaje wiersza — `offer_peace` bit w bit.
  const dipl = world(600, 5000);
  addEmpire('e_scope');
  const r = call(dipl, 'evaluateTreaty', 'e_scope', 'non_aggression', {});
  assert(valOf(r, 'offer') === 0,
    'T11d: ocena bez `offer` ma ten wiersz ZEROWY — zasięg zmiany jest zakresowany przez to, '
    + 'KTO karmi dar (dziś: tylko modal odmowy traktatu)');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT12 — i18n: cztery klucze, parytet, podstawienia');
{
  const KEYS = ['diplo.gift.hint', 'diplo.btn.retryWithGift', 'diplo.reject.notEnoughCredits', 'log.diplo.giftSent'];
  for (const f of ['pl', 'en']) {
    const dict = readRaw('i18n', f + '.js');
    const miss = KEYS.filter(k => !new RegExp("'" + k.replace(/\./g, '\\.') + "':").test(dict));
    assert(miss.length === 0, 'T12a[' + f + ']: wszystkie ' + KEYS.length + ' kluczy w słowniku'
      + (miss.length ? ' — brakuje: ' + miss.join(', ') : ''));
    for (const k of ['diplo.gift.hint', 'diplo.btn.retryWithGift']) {
      const line = (dict.match(new RegExp("'" + k.replace(/\./g, '\\.') + "':[^\n]*")) ?? [''])[0];
      assert(/\{0\}/.test(line), 'T12b[' + f + '/' + k + ']: niesie kwotę {0} (' + line.trim().slice(0, 62) + ')');
    }
    const log = (dict.match(/'log\.diplo\.giftSent':[^\n]*/) ?? [''])[0];
    assert(/\{0\}/.test(log) && /\{1\}/.test(log),
      'T12c[' + f + ']: beat niesie OBA podstawienia — kwotę {0} i imperium {1} ('
      + log.trim().slice(0, 62) + ')');
  }
}

// ════════════════════════════════════════════════════════════════════════════
console.log('\nT13 — audyt i beat: zdarzenie ma konsumenta i ślad');
{
  const dbg = readClean('core', 'DebugLog.js');
  assert(/'diplomacy:giftSent'/.test(dbg),
    'T13a: `diplomacy:giftSent` jest w `TRACKED_EVENTS` — reguła W3: nowe zdarzenie dyplomatyczne '
    + 'dołącza do audytu W TYM SAMYM commicie');
  // ⚠ `UIManager` NIE IMPORTUJE SIĘ pod node (THREE.TextureLoader) — beat pinujemy ŹRÓDŁOWO.
  const ui = readClean('scenes', 'UIManager.js');
  assert(/diplomacy:giftSent/.test(ui) && /log\.diplo\.giftSent/.test(ui),
    'T13b (pin ŹRÓDŁOWY): `UIManager` ma konsumenta i pisze beat kluczem `log.diplo.giftSent`');
  const beat = ui.slice(ui.indexOf('diplomacy:giftSent'), ui.indexOf('diplomacy:giftSent') + 320);
  assert(/Math\.round/.test(beat),
    'T13c: kwota w beacie jest CAŁKOWITA — `t()` nie formatuje liczb (findingi 302/303)');
  const diplSrc = readClean('systems', 'DiplomacySystem.js');
  // ⚠ Anchor na DEFINICJI, nie na `_payGift(empireId` — ten wzorzec trafia najpierw w WYWOŁANIE
  //   w `renewTreaty` (zmierzone), więc pin czytałby nie to ciało.
  const payAt0 = diplSrc.indexOf('_payGift(empireId, offer, treatyId, renew)');
  const payBody = payAt0 < 0 ? '' : diplSrc.slice(payAt0, payAt0 + 900);
  assert(payBody.length > 0 && /spendFromTreasury/.test(payBody) && /giftSent/.test(payBody),
    'T13d: pieniądze i meldunek mają JEDNĄ ścieżkę (`_payGift`) — dwie fasady, jeden księgowy');
  const renewBody = diplSrc.slice(diplSrc.indexOf('renewTreaty(empireId, treatyId = TREATY_TYPES'),
    diplSrc.indexOf('renewTreaty(empireId, treatyId = TREATY_TYPES') + 1400);
  const payAt = renewBody.indexOf('_payGift');
  const mutAt = renewBody.indexOf('this.relations.renewTreaty');
  assert(payAt > 0 && mutAt > 0 && payAt < mutAt,
    'T13e (TRIPWIRE): zapłata stoi PRZED mutacją traktatu — tylko ta kolejność daje symetrię '
    + 'all-or-nothing (nie ma traktatu bez zapłaty ANI zapłaty bez traktatu)');
}

console.log('\n=== WYNIK: ' + pass + ' PASS / ' + fail + ' FAIL (z ' + (pass + fail) + ') ===');
process.exit(fail ? 1 : 0);
