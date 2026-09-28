// WP-4 / C3 — keeper: AI SAMO PROPONUJE POKÓJ (podpis D-WP-3, 27.09).
//
// PO CO: wyczerpane AI nie miało jak poprosić o pokój. `_triggerAutoPeace` PODPISYWAŁO go
// w imieniu gracza — bez pytania, bez modalu, bez możliwości odmowy. Wojna kończyła się
// (albo nie) w tle, a jedynym śladem był wpis `war:autoPeaceRefused`. C3 zamienia tę cichą
// gałąź na DEPESZĘ DYPLOMATYCZNĄ z trzema wyborami: przyjmij, odrzuć, kontrpropozycja.
//
// ⚠ SZEŚĆ RZECZY, KTÓRE SĄ TU KONTRAKTEM, A NIE PREFERENCJĄ:
//   1. TRIGGER MA DWA WARUNKI, NIE JEDEN. Próg `casusBelli.peaceCost` na wyczerpaniu AI to
//      tylko TANIA BRAMKA WSTĘPNA; rozstrzyga `evaluatePeace(...).decision`, a term
//      `war_status` liczy MIN Z OBU wyczerpań minus `peaceCost`. Dlatego „AI wyczerpane na
//      100, gracz na 0" NIE wyzwala depeszy — i to jest zmierzone (FAZA A), nie ostrożność.
//      T1 pinuje oba brzegi i ma KONTROLĘ, że dwa porównywane stany realnie różnią się
//      w wyroczni — inaczej pin przechodziłby jałowo.
//   2. REGRESJA JEST PODPISANA: gałąź AI `_triggerAutoPeace` NIE podpisuje już pokoju sama.
//      Przy AI na 100 wojna NIE kończy się bez kliknięcia gracza. T2 pinuje to wprost,
//      z kontrolą na gałęzi GRACZA (której C3 nie tyka — to robi C5).
//   3. COOLDOWN DEPESZY MA SWÓJ KLUCZ `ai_peace_offer` i NIE JEST CZASOWNIKIEM KATALOGU.
//      Pole `verbCooldowns` trzyma ROK ZDARZENIA (jedna semantyka dla wszystkich kluczy),
//      a okno dokłada czytelnik. Term `recent_refusal` czyta `ctx.verbCooldowns[ctx.verb]`,
//      więc klucz nie-czasownikowy nie ma jak zatruć wyniku `offer_peace` — T3 mierzy to,
//      zamiast zakładać.
//   4. BRAMKA „ŻADEN MODAL DEPESZY NIE JEST OTWARTY" JEST NOŚNA, nie ozdobna: cooldown
//      zapisują dopiero ODRZUĆ i KONTRPROPOZYCJA (przyjęcie oferty i zamknięcie bez
//      odpowiedzi go NIE zapisują, żeby AI mogło poprosić znów), więc dopóki depesza wisi
//      na ekranie, TYLKO ta bramka trzyma kolejne emisje. T4 pinuje zapalenie i zgaszenie.
//   5. KANAŁ: builder wołany WPROST, nie przez `queueMissionEvent`. Powód jest zapisany
//      w źródle `DiplomacyRefusalModal` (:15-18): `buildScheduledEventPopup` nie czyta
//      `onClick` z konfiguracji przycisku, a `MissionEventModal` dokleja `dismiss()`
//      KAŻDEMU przycisku bez `_hasCustomClick`. Trzy wybory w tamtym kanale byłyby trzema
//      przyciskami „zamknij". T7 pinuje jedno i drugie — także po stronie CUDZEGO pliku,
//      żeby naprawa tamtego kanału zapaliła tu światło.
//   6. AKCEPTACJA IDZIE PRZEZ `stampRefusal: false` (D-WP-16 z C4). Gracz odpowiada na
//      CUDZĄ propozycję; gdyby świat zdążył się zmienić i ocena wypadła odmownie,
//      zablokowanie mu WŁASNEGO przycisku pokoju byłoby karą za cudzy ruch. T5 pinuje,
//      że przy porażce nie powstaje ANI cooldown gracza, ANI cooldown AI.
//
// ⚠ PRZYCISKI NIE DAJĄ SIĘ KLIKNĄĆ POD NODE (`env.js`: `addEventListener` i `click` to
//   no-opy), więc trzy wybory są WYEKSPORTOWANYMI funkcjami i keeper woła je wprost, a
//   wpięcie `btnElements[0..2]` pinuje się źródłowo. To nie jest obejście testu: logika
//   decyzji nie ma prawa mieszkać w handlerze DOM (wzór `FleetActions`).
//
// ⚠ IMPORTY DYNAMICZNE dla symboli POWSTAJĄCYCH w tym slice — statyczny import
//   nieistniejącego symbolu wywala CAŁY plik na linkowaniu ESM i żaden pin nie dostaje
//   koloru (lekcja `ground_troops_reachable`).
//
// ⚠ ŻADNEGO wywołania funkcji tłumaczącej w tym pliku — `tools/check-i18n.mjs` skanuje je
//   w całym `src/`. Klucze sprawdzamy ODCZYTEM słowników jako tekstu, a builder treści
//   dostaje WŁASNY `translate`, który notuje klucze.
//
// ⚠ SUBSKRYPCJE ZAWSZE PO `boot()` — `GameCore.boot` woła `EventBus.clear()`, więc listener
//   zarejestrowany wcześniej milczy (znana klasa jałowej kontroli pinu).
//
// Uruchom: node src/testing/smoke/wp_ai_peace_offer_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (window/localStorage/THREE)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { GameCore } from '../headless/GameCore.js';
import EventBus from '../../core/EventBus.js';
import { CASUS_BELLI } from '../../data/CasusBelliData.js';
import { VERB_ACCEPTANCE } from '../../data/AcceptanceWeightData.js';

// Symbole rodzące się w C3 — dynamicznie.
let ModalMod = null, DataMod = null;
try { ModalMod = await import('../../ui/PeaceOfferModal.js'); }            catch { /* fail-first */ }
try { DataMod  = await import('../../data/AcceptanceWeightData.js'); }     catch { /* fail-first */ }

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Narzędzia pinów źródłowych ──────────────────────────────────────────────
// ⚠ CRLF (§270): źródło PO NORMALIZACJI. ⚠ Komentarze zdejmowane.
const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const norm = (s) => s.replace(/\r\n/g, '\n');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const readRaw = (...p) => {
  try { return norm(readFileSync(join(SRC, ...p), 'utf8')); } catch { return ''; }
};
const readClean = (...p) => stripComments(readRaw(...p));

const dictValue = (file, key) => {
  const re = new RegExp("'" + key.replace(/\./g, '\\.') + "':\\s*'((?:[^'\\\\]|\\\\.)*)'");
  const m = readRaw('i18n', file).match(re);
  return m ? m[1] : null;
};

// ── Fixture: ŻYWY silnik ────────────────────────────────────────────────────
const EMP = 'emp_001';
const AI_KEY = 'ai_peace_offer';

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization', aiEmpires: true });
  const K = window.KOSMOS;
  K.acceptanceEngine = K.diplomacySystem._acceptance();
  return K;
}
/**
 * Wojna z ZADANYM wyczerpaniem obu stron — wprost w gameState, NIE przez changeExhaustion
 * (ta ostatnia wyzwala trigger, czyli mierzone zjawisko).
 *
 * ⚠ DEGRADUJE, NIE PRZERYWA. Pierwsza wersja robiła `w.id` na wyniku `getWarWith`, a ten
 *   zwraca `null`, gdy wojny nie da się wypowiedzieć (np. po pokoju trzyma rozejm) — plik
 *   wywalał się na `TypeError` i WSZYSTKIE piny poniżej traciły kolor. Pin ma paść, nie zabić
 *   przebiegu (ta sama lekcja co statyczny import nieistniejącego symbolu).
 */
function warWith(K, plExh, aiExh) {
  K.diplomacySystem.declareWar(EMP, 'player_action');
  const ws = K.warSystem, w = ws.getWarWith(EMP);
  if (!w) return { id: null };
  setExh(K, w, plExh, aiExh);
  return ws.getWarWith(EMP);
}
/** Podmiana wyczerpania bez dotykania triggera. */
function setExh(K, war, plExh, aiExh) {
  if (!war?.id) return;
  const cur = K.warSystem.getWar(war.id) ?? war;
  K.gameState.set('wars.' + war.id,
    { ...cur, exhaustion: { player: plExh, [EMP]: aiExh } }, 'wp4c3_fixture');
}
/** Test-only reaktywacja rekordu wojny (rozejm blokuje ponowne wypowiedzenie). */
function reopen(K, war) {
  if (!war?.id) return;
  K.gameState.set('wars.' + war.id, { ...K.warSystem.getWar(war.id), active: true }, 'test_reopen');
}
const cooldowns = (K) => K.diplomacySystem.relations.getVerbCooldowns('player', EMP);
/** Nasłuch depesz — ZAWSZE po boot(), bo boot woła EventBus.clear(). */
function spyOffers() {
  const offers = [];
  EventBus.on('war:aiPeaceOffer', (p) => offers.push(p));
  return offers;
}
/** Stub menedżera overlayów — KONTRPROPOZYCJA ma otworzyć panel Wojny na TEJ wojnie. */
function stubPanels(K) {
  const calls = [];
  K.overlayManager = { openPanel: (id, opts) => calls.push({ id, opts }) };
  return calls;
}
/** Jedno „kliknięcie" wyczerpania po stronie AI — jedyna ścieżka wyzwalająca trigger. */
const bumpAi = (K, war, d = 1) => { if (war?.id) K.warSystem.changeExhaustion(war.id, EMP, d, 'test'); };

// ════════════════════════════════════════════════════════════════════════════
console.log('T0 — kontrola narzędzia i mierzonych faktów');
{
  assert(stripComments('const a=1; // aiPeaceOffer\n/* aiPeaceOffer */').includes('aiPeaceOffer') === false,
    'T0a: `stripComments` zdejmuje oba rodzaje komentarzy');
  const K = boot();
  assert(!!K.diplomacySystem && !!K.warSystem && !!K.acceptanceEngine,
    'T0b: fixture stawia ŻYWY silnik');
  assert(!!ModalMod?.initPeaceOffers && typeof ModalMod.acceptPeaceOffer === 'function'
    && typeof ModalMod.rejectPeaceOffer === 'function' && typeof ModalMod.counterPeaceOffer === 'function',
    'T0c: `PeaceOfferModal` importuje się pod node i wystawia trzy wybory jako funkcje');
  assert(CASUS_BELLI.border_incident.peaceCost === 30,
    'T0d (KONTROLA PINU): `peaceCost` domyślnego casus belli = 30 (z danych, nie z literału w pinie)');
  assert(VERB_ACCEPTANCE[AI_KEY] === undefined,
    'T0e: `ai_peace_offer` NIE jest czasownikiem katalogu — to klucz cooldownu, nie propozycja do oceny');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T1 — TRIGGER: dwa warunki, nie jeden (wyrocznia = `evaluatePeace`)');
{
  // Negatyw z FAZY A: AI wyczerpane na 100, gracz na 0. Term `war_status` liczy MIN z obu,
  // więc silnik mówi NIE — mimo że próg `peaceCost` po stronie AI jest dawno przekroczony.
  const K = boot(); const w = warWith(K, 0, 99);
  const offers = spyOffers();
  const oracleLow = K.diplomacySystem.evaluatePeace(EMP, null)?.decision;
  bumpAi(K, w);
  assert(oracleLow !== true,
    'T1a (KONTROLA PINU): przy graczu na 0 silnik ODMAWIA pokoju — bez tego T1b mierzyłby ciszę');
  assert(offers.length === 0,
    'T1b: AI 100 / gracz 0 ⇒ ZERO depesz (próg `peaceCost` po stronie AI nie wystarcza)');
  // ⚠ ŚWIADEK: bez niego „zero depesz" przechodzi jałowo w KAŻDEJ implementacji, także
  //   w takiej, która nie emituje nigdy. Ta sama para i ten sam bump, tylko gracz wyczerpany.
  setExh(K, w, 100, 99);
  bumpAi(K, w);
  assert(offers.length === 1,
    'T1b′ (ŚWIADEK): ta sama para po podniesieniu wyczerpania GRACZA dostaje depeszę — ' +
    'cisza w T1b jest decyzją, nie brakiem mechanizmu');
}
{
  const K = boot(); const w = warWith(K, 100, 99);
  const offers = spyOffers();
  const oracleHigh = K.diplomacySystem.evaluatePeace(EMP, null)?.decision;
  bumpAi(K, w);
  assert(oracleHigh === true,
    'T1c (KONTROLA PINU): przy obu wyczerpanych silnik PRZYJMUJE pokój — pin niżej nie jest jałowy');
  assert(offers.length === 1,
    'T1d: oba wyczerpane ⇒ DOKŁADNIE jedna depesza (' + offers.length + ')');
  assert(offers[0]?.empireId === EMP && offers[0]?.warId === w.id,
    'T1e: payload niesie `empireId` i `warId`');
}
{
  // Para z FAZY A (30/0 vs 30/30) — porównanie ma sens TYLKO jeśli wyrocznia je rozróżnia.
  const A = boot(); const wa = warWith(A, 0, 29);
  const oa = A.diplomacySystem.evaluatePeace(EMP, null)?.decision;
  const offA = spyOffers(); bumpAi(A, wa);
  const B = boot(); const wb = warWith(B, 30, 29);
  const ob = B.diplomacySystem.evaluatePeace(EMP, null)?.decision;
  const offB = spyOffers(); bumpAi(B, wb);
  assert(oa !== ob,
    'T1f (KONTROLA PINU): wyrocznia REALNIE rozróżnia 30/0 od 30/30 (' + oa + ' vs ' + ob + ')');
  assert((offA.length > 0) === (oa === true) && (offB.length > 0) === (ob === true),
    'T1g: emisja depeszy idzie ZA wyrocznią w obu stanach, nie za samym progiem wyczerpania');
}
{
  // Poniżej progu `peaceCost` po stronie AI — tania bramka wstępna działa.
  const K = boot(); const w = warWith(K, 100, 5);
  const offers = spyOffers();
  bumpAi(K, w);
  assert(offers.length === 0,
    'T1h: wyczerpanie AI poniżej `peaceCost` ⇒ brak depeszy (bramka wstępna)');
  setExh(K, w, 100, 99);
  bumpAi(K, w);
  assert(offers.length === 1,
    'T1h′ (ŚWIADEK): ta sama para nad progiem dostaje depeszę');
}
{
  // Spadek wyczerpania nie jest powodem do proszenia o pokój.
  const K = boot(); const w = warWith(K, 100, 99);
  const offers = spyOffers();
  bumpAi(K, w, -1);
  assert(offers.length === 0,
    'T1i: `delta <= 0` (wyczerpanie SPADA) nie wyzwala depeszy');
  setExh(K, w, 100, 99);
  bumpAi(K, w, +1);
  assert(offers.length === 1,
    'T1i′ (ŚWIADEK): ten sam stan przy delcie dodatniej depeszę wysyła');
}
{
  // Wojna zamknięta ⇒ cisza.
  const K = boot(); const w = warWith(K, 100, 99);
  K.gameState.set('wars.' + w.id, { ...K.warSystem.getWar(w.id), active: false }, 'test_close');
  const offers = spyOffers();
  bumpAi(K, w);
  assert(offers.length === 0,
    'T1j: wojna nieaktywna ⇒ brak depeszy');
  setExh(K, w, 100, 99);
  reopen(K, w);
  bumpAi(K, w);
  assert(offers.length === 1,
    'T1j′ (ŚWIADEK): ta sama wojna po reaktywacji depeszę wysyła');
}
{
  // ⚠ ŚCIEŻKA CLAMPOWANA (`changeExhaustion` wczesny return przy 100): blok D-WP-3 mówi
  //   wprost „retry :257 zostaje". Bez tego pinu wyczerpanie stojące na suficie zjadałoby
  //   KAŻDĄ kolejną próbę i depesza nie przyszłaby nigdy po pierwszej bitwie na sufticie.
  const K = boot(); const w = warWith(K, 100, 100);
  const offers = spyOffers();
  bumpAi(K, w, +1);                       // 100 → 100, rekord się nie zmienia
  assert(K.warSystem.getWar(w.id)?.exhaustion?.[EMP] === 100,
    'T1k (KONTROLA PINU): wyczerpanie AI stoi na suficie, więc bump NIE zmienia rekordu');
  assert(offers.length === 1,
    'T1l: depesza wychodzi także ze ścieżki CLAMPOWANEJ (retry przy wyczerpaniu na suficie)');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T2 — REGRESJA PODPISANA: gałąź AI nie podpisuje pokoju sama');
{
  const K = boot(); const w = warWith(K, 0, 99);
  bumpAi(K, w);                                  // AI dobija 100, gracz zostaje na 0
  assert(K.warSystem.getWar(w.id)?.active === true,
    'T2a: przy AI na 100 i graczu na 0 wojna NADAL AKTYWNA — nikt jej nie zamknął w tle');
}
{
  const K = boot(); const w = warWith(K, 100, 99);
  const offers = spyOffers();
  bumpAi(K, w);
  assert(K.warSystem.getWar(w.id)?.active === true && offers.length === 1,
    'T2b: przy obu wyczerpanych wojna trwa, a gracz DOSTAJE depeszę — pokój wymaga jego kliknięcia');
  assert(K.diplomacySystem.getStatus(EMP) === 'war',
    'T2c: status pary to nadal wojna (nie `truce`) — auto-pokój po stronie AI zniknął');
}
{
  // ⚠ PIN PRZECELOWANY — WP-4 / C5, podpis D-WP-14 (= a).
  //   Do C5 pinował, że gałąź GRACZA dalej prowadzi do auto-pokoju, i służył jako dowód,
  //   że C3 ZAWĘZIŁ zmianę do gałęzi AI. Etykieta sama zapowiadała własną śmierć („C5 to
  //   zmieni, C3 nie") — i C5 ją wykonał: wyczerpanie gracza też nie podpisuje już pokoju,
  //   tylko MELDUJE. Cel pinu (zakres) zostaje, ale mierzy go teraz ROZDZIELNOŚĆ dwóch
  //   mechanizmów, nie kontrast „jeden jeszcze działa" — bo po WP-4 nie działa żaden.
  const K = boot(); const w = warWith(K, 99, 100);
  const beats = [];
  EventBus.on('war:playerExhausted', (p) => beats.push(p));
  const offers = spyOffers();
  K.warSystem.changeExhaustion(w.id, 'player', 1, 'test');
  assert(K.diplomacySystem.getStatus(EMP) === 'war' && K.warSystem.getWar(w.id)?.active === true,
    'T2d: wyczerpanie GRACZA nie podpisuje pokoju — po WP-4 nie robi tego ŻADNA strona');
  assert(beats.length === 1 && offers.length === 0,
    'T2e: …i idzie WŁASNYM kanałem: meldunek gracza (' + beats.length + '), NIE depesza AI ('
    + offers.length + ') — dwa mechanizmy, rozdzielne');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T3 — COOLDOWN depeszy: własny klucz, własne okno, zero zatrucia');
{
  const K = boot(); warWith(K, 100, 100);
  const ds = K.diplomacySystem;
  ds.noteRefusal(EMP, AI_KEY);
  assert(ds.getRefusalYearsLeft(EMP, AI_KEY) === 1,
    'T3a: okno klucza `ai_peace_offer` = 1 rok (' + ds.getRefusalYearsLeft(EMP, AI_KEY)
    + ') — symetrycznie do przycisku gracza z D-WP-4');
  assert(ds.getRefusalYearsLeft(EMP, 'offer_peace') === 0,
    'T3b: zapis klucza AI NIE dotyka cooldownu `offer_peace` (przycisk gracza nietknięty)');
  const row = ds.evaluatePeace(EMP, null).breakdown.find(r => r.term === 'recent_refusal')?.value;
  assert(row === 0,
    'T3c: `recent_refusal` czyta `ctx.verbCooldowns[ctx.verb]`, więc klucz nie-czasownikowy nie zatruwa wyniku pokoju (wiersz = ' + row + ')');
  assert(DataMod?.NON_VERB_COOLDOWN_YEARS?.[AI_KEY] === 1,
    'T3d: okno klucza nie-czasownikowego mieszka w KATALOGU (dane), nie w kodzie systemu');
  // ⚠ METODY INTENCJI — klucz NIE MOŻE wyciekać z fasady. Pin P14 dopuszcza import
  //   `Acceptance*` wyłącznie w `DiplomacySystem`, więc ani `WarSystem`, ani modal nie mają
  //   prawa znać literału `ai_peace_offer`; obaj pytają fasadę. Piny źródłowe w T7.
  assert(ds.getAiPeaceOfferCooldown?.(EMP) === ds.getRefusalYearsLeft(EMP, AI_KEY),
    'T3d′: `getAiPeaceOfferCooldown` czyta DOKŁADNIE ten sam wpis co ścieżka ogólna');
}
{
  const K = boot(); warWith(K, 100, 100);
  const ds = K.diplomacySystem;
  // ⚠ WOŁANIA OPCJONALNE: bez `?.` fail-first wywala CAŁY plik na `TypeError` i piny
  //   poniżej tracą kolor (zmierzone — druga odsłona tej samej lekcji w tym slice).
  ds.noteAiPeaceOfferAnswered?.(EMP);
  assert(cooldowns(K)[AI_KEY] !== undefined && ds.getAiPeaceOfferCooldown?.(EMP) === 1,
    'T3d″: `noteAiPeaceOfferAnswered` zapisuje ten sam klucz i daje okno 1 roku');
  assert(cooldowns(K).offer_peace === undefined,
    'T3d‴: …i nie dotyka cooldownu `offer_peace`');
}
{
  const K = boot(); const w = warWith(K, 100, 99);
  const offers = spyOffers();
  bumpAi(K, w);
  assert(offers.length === 1, 'T3e (KONTROLA PINU): pierwsza depesza poszła');
  ModalMod?.rejectPeaceOffer?.(EMP, w.id);          // odrzucenie zapisuje cooldown
  bumpAi(K, w);
  assert(offers.length === 1,
    'T3f: cooldown blokuje kolejną depeszę w tej samej parze (' + offers.length + ')');
  K.timeSystem.gameTime = Math.floor(K.timeSystem.gameTime) + 1;
  EventBus.emit('war:aiPeaceOfferResolved', { empireId: EMP, warId: w.id, choice: 'reject' });
  bumpAi(K, w);
  assert(offers.length === 2,
    'T3g: po upływie roku depesza może przyjść znów (' + offers.length + ')');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T4 — BRAMKA „żadna depesza nie jest otwarta"');
{
  const K = boot(); const w = warWith(K, 100, 99);
  const offers = spyOffers();
  bumpAi(K, w);
  bumpAi(K, w);
  assert(offers.length === 1,
    'T4a: druga zmiana wyczerpania NIE dokłada depeszy, dopóki pierwsza wisi (' + offers.length + ')');
  EventBus.emit('war:aiPeaceOfferResolved', { empireId: EMP, warId: w.id, choice: 'dismissed' });
  bumpAi(K, w);
  assert(offers.length === 2,
    'T4b: `war:aiPeaceOfferResolved` gasi bramkę — zamknięcie BEZ odpowiedzi nie blokuje AI na zawsze');
}
{
  // ⚠ Higiena: koniec wojny musi zgasić bramkę, inaczej kolejny konflikt z tym imperium
  //   byłby cichy na zawsze. Rekord wojny REAKTYWUJEMY (test-only) zamiast wypowiadać wojnę
  //   ponownie — po pokoju trzyma rozejm, `declareWar` nie tworzy nowej wojny i `getWarWith`
  //   zwraca `null` (zmierzone: pierwsza wersja tego pinu wywalała plik `TypeError`em
  //   i zabierała kolor WSZYSTKIM pinom poniżej).
  const K = boot(); const w = warWith(K, 100, 99);
  const offers = spyOffers();
  bumpAi(K, w);
  assert(offers.length === 1, 'T4c (KONTROLA PINU): pierwsza depesza poszła, bramka zapalona');
  EventBus.emit('war:peaceSigned', { warId: w.id, empireId: EMP });
  setExh(K, w, 100, 99);
  reopen(K, w);
  bumpAi(K, w);
  assert(offers.length === 2,
    'T4d: koniec wojny gasi bramkę (higiena — inaczej kolejny konflikt byłby cichy)');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T5 — AKCEPTUJ: pokój + NAP, status quo, bez kar dla gracza');
{
  const K = boot(); const w = warWith(K, 100, 100);
  const ok = ModalMod?.acceptPeaceOffer?.(EMP, w.id);
  assert(ok === true, 'T5a: przyjęcie oferty podpisuje pokój');
  assert(K.diplomacySystem.getStatus(EMP) === 'truce',
    'T5b: status pary przechodzi w `truce`');
  assert(K.diplomacySystem.hasTreaty?.(EMP, 'non_aggression') === true,
    'T5c: pokój niesie wymuszony NAP (D-WP-10 z WP-3 — ta sama ścieżka silnika)');
  assert(K.warSystem.getWar(w.id)?.active === false,
    'T5d: wojna zamknięta');
}
{
  // Dryf świata: ocena wypada odmownie ⇒ „oferta straciła ważność", bez kary dla kogokolwiek.
  const K = boot(); const w = warWith(K, 0, 0);
  const before = JSON.stringify(cooldowns(K));
  const ok = ModalMod?.acceptPeaceOffer?.(EMP, w.id);
  assert(ok === false,
    'T5e: przy odmownej ocenie przyjęcie NIE podpisuje pokoju (dryf świata)');
  assert(K.warSystem.getWar(w.id)?.active === true,
    'T5f: wojna trwa');
  assert(JSON.stringify(cooldowns(K)) === before,
    'T5g (D-WP-16): porażka przyjęcia nie zapisuje ANI cooldownu gracza, ANI cooldownu AI — ' +
    'gracz nie płaci za cudzą propozycję, a AI może poprosić znów');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T6 — ODRZUĆ i KONTRPROPOZYCJA');
{
  const K = boot(); const w = warWith(K, 100, 100);
  const memBefore = K.diplomacySystem.getMemory(EMP)?.length ?? 0;
  // ⚠ `getOpinion` bierze DWA argumenty (`ofId`, `aboutId`) — wywołanie z jednym zwraca
  //   `undefined` po obu stronach i pin przechodziłby JAŁOWO. Kierunek, który bramkuje
  //   akceptacje, ma własny akcesor jednoargumentowy.
  const opBefore = K.diplomacySystem.getOpinionOfPlayer(EMP);
  ModalMod?.rejectPeaceOffer?.(EMP, w.id);
  assert(cooldowns(K)[AI_KEY] !== undefined,
    'T6a: ODRZUĆ zapisuje cooldown `ai_peace_offer`');
  assert(cooldowns(K).offer_peace === undefined,
    'T6b: ODRZUĆ nie dotyka `offer_peace` — przycisk pokoju gracza zostaje wolny (podpis, nie odczyt)');
  assert(K.warSystem.getWar(w.id)?.active === true && K.diplomacySystem.getStatus(EMP) === 'war',
    'T6c: po odrzuceniu wojna trwa');
  assert((K.diplomacySystem.getMemory(EMP)?.length ?? 0) === memBefore
    && K.diplomacySystem.getOpinionOfPlayer(EMP) === opBefore,
    'T6d: ODRZUĆ nie rusza pamięci ani opinii — odmowa cudzej oferty nie jest incydentem');
}
{
  const K = boot(); const w = warWith(K, 100, 100);
  const panels = stubPanels(K);
  ModalMod?.counterPeaceOffer?.(EMP, w.id);
  assert(cooldowns(K)[AI_KEY] !== undefined,
    'T6e: KONTRPROPOZYCJA zapisuje cooldown AI (depesza została odpowiedziana)');
  assert(panels.length === 1 && panels[0].id === 'war',
    'T6f: KONTRPROPOZYCJA otwiera panel Wojny (' + JSON.stringify(panels.map(p => p.id)) + ')');
  assert(panels[0]?.opts?.warId === w.id,
    'T6g: panel otwiera się na TEJ wojnie, nie na pierwszej aktywnej z listy');
  assert(K.warSystem.getWar(w.id)?.active === true,
    'T6h: KONTRPROPOZYCJA nie podpisuje pokoju — dalej gracz działa przez ☮ ze stołem (C1)');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T7 — KANAŁ: builder wprost, pauza sparowana z wznowieniem');
{
  const modal = readClean('ui/PeaceOfferModal.js');
  assert(modal !== '' && !modal.includes('queueMissionEvent'),
    'T7a (pin ŹRÓDŁOWY): modal NIE idzie przez `queueMissionEvent` — tamten kanał dokleja `dismiss()` każdemu przyciskowi');
  assert(modal.includes('buildScheduledEventPopup') && modal.includes('btnElements'),
    'T7b (pin ŹRÓDŁOWY): builder wołany wprost, a wybory podpięte do `btnElements`');
  const mem = readClean('ui/MissionEventModal.js');
  assert(mem.includes('_hasCustomClick'),
    'T7c (KONTROLA PINU na CUDZYM pliku): `MissionEventModal` NADAL dokleja dismiss każdemu ' +
    'przycisku bez `_hasCustomClick` — gdy ktoś naprawi tamten kanał, T7a wolno przemyśleć');
  // ⚠ PIN P14: klucz cooldownu i okno mieszkają w katalogu wag, a ten wolno importować
  //   WYŁĄCZNIE `DiplomacySystem` (`acceptance_engine_smoke` P14, allowlista jednoelementowa).
  //   Zarówno panel, jak i system wojny muszą więc pytać FASADĘ — inaczej literał
  //   `ai_peace_offer` istniałby w trzech miejscach.
  const ws = readClean('systems/WarSystem.js');
  assert(!/from\s+'[^']*Acceptance(Engine|Math|WeightData)\.js'/.test(modal)
    && !/from\s+'[^']*Acceptance(Engine|Math|WeightData)\.js'/.test(ws),
    'T7k (pin P14): ani modal, ani `WarSystem` nie importują `Acceptance*`');
  // ⚠ DOKŁADNY literał w apostrofach, NIE podciąg. Pierwsza wersja tego pinu padła na
  //   `'ai_peace_offer_accept'` — a to ETYKIETA POWODU w `offerPeace` (ląduje w pamięci
  //   relacji i w logach), podpisana dosłownie, nie klucz cooldownu. Podciąg nie odróżnia
  //   „zna klucz" od „ma powód o zbieżnej nazwie".
  const keyLiteral = new RegExp("'" + AI_KEY + "'");
  const ds2 = readClean('systems/DiplomacySystem.js');
  assert(!keyLiteral.test(modal) && !keyLiteral.test(ws),
    'T7l: literał `' + AI_KEY + '` NIE wycieka z fasady — obaj wołający używają metod intencji');
  assert(keyLiteral.test(readClean('data/AcceptanceWeightData.js')) && ds2.includes('AI_PEACE_OFFER_COOLDOWN_KEY'),
    'T7m (KONTROLA PINU): klucz ISTNIEJE — w katalogu (dane) i pod nazwą w fasadzie — ' +
    'więc T7l nie mierzy nieobecności czegoś, czego nie ma nigdzie');
}
{
  const K = boot(); const w = warWith(K, 100, 99);
  let paused = 0, resumed = 0, resolved = [];
  EventBus.on('time:pause',  () => { paused++; });
  EventBus.on('time:resume', () => { resumed++; });
  EventBus.on('war:aiPeaceOfferResolved', (p) => resolved.push(p));
  // (a) WPIĘCIE KANAŁU: samo zdarzenie musi postawić depeszę i zapauzować grę.
  ModalMod?.initPeaceOffers?.();
  const bodyBefore = document.body.children.length;
  EventBus.emit('war:aiPeaceOffer', { empireId: EMP, warId: w.id });
  assert(paused === 1,
    'T7d: `war:aiPeaceOffer` stawia depeszę i PAUZUJE grę (' + paused + ')');
  assert(document.body.children.length === bodyBefore + 1,
    'T7e (KONTROLA PINU): depesza REALNIE wylądowała w dokumencie — bez tego brak przycisków ' +
    'myliłby się z brakiem modalu');
  // (b) UCHWYT: prawdziwa ścieżka zamknięcia. `showPeaceOffer` zwraca uchwyt buildera,
  //     więc keeper nie potrzebuje eksportu „dla testów".
  const h = ModalMod?.showPeaceOffer?.(EMP, w.id) ?? null;
  assert(!!h && Array.isArray(h.btnElements) && h.btnElements.length === 3,
    'T7f: depesza ma DOKŁADNIE trzy przyciski (' + (h?.btnElements?.length ?? 'brak') + ')');
  h?.dismiss?.();
  assert(resumed === 1,
    'T7g: zamknięcie depeszy WZNAWIA grę — pauza i wznowienie sparowane (' + resumed + ')');
  assert(resolved.length === 1 && resolved[0]?.warId === w.id && resolved[0]?.choice === 'dismissed',
    'T7h: zamknięcie BEZ odpowiedzi emituje `war:aiPeaceOfferResolved` raz, z `choice: dismissed` ('
    + resolved.length + ')');
  h?.dismiss?.();
  assert(resumed === 1 && resolved.length === 1,
    'T7i: powtórne `dismiss()` nie dubluje wznowienia ani rozstrzygnięcia');
}
{
  // Treść: trzy podpisane klucze warunków przechodzą przez tłumacza.
  if (ModalMod?.buildPeaceOfferContent) {
    const seen = [];
    ModalMod.buildPeaceOfferContent({ translate: (k) => { seen.push(k); return k; } });
    assert(seen.includes('peaceOffer.termsTitle') && seen.includes('peaceOffer.statusQuo')
      && seen.includes('peaceOffer.napNote'),
      'T7j: treść depeszy niesie sekcję warunków, status quo i notę o pakcie (klucze: ' + seen.length + ')');
  } else {
    assert(false, 'T7j: `buildPeaceOfferContent` istnieje i przyjmuje wstrzykiwany tłumacz');
  }
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T8 — i18n: trzynaście par, brzmienia dosłownie jak podpisane');
{
  const KEYS = [
    'peaceOffer.barTitle', 'peaceOffer.headline', 'peaceOffer.desc', 'peaceOffer.termsTitle',
    'peaceOffer.statusQuo', 'peaceOffer.napNote', 'peaceOffer.accept', 'peaceOffer.reject',
    'peaceOffer.counter', 'peaceOffer.staleTitle',
    'log.diplo.aiPeaceOffer', 'log.diplo.aiPeaceOfferRejected', 'log.diplo.aiPeaceOfferExpired',
  ];
  const missing = KEYS.filter(k => !dictValue('pl.js', k) || !dictValue('en.js', k));
  assert(KEYS.length === 13 && missing.length === 0,
    'T8a: wszystkie 13 kluczy w pl I en (brakujące: [' + missing.join(', ') + '])');
  assert(dictValue('pl.js', 'peaceOffer.barTitle') === 'DEPESZA DYPLOMATYCZNA'
    && dictValue('en.js', 'peaceOffer.barTitle') === 'DIPLOMATIC DISPATCH',
    'T8b: `barTitle` dosłownie jak podpisano');
  assert(dictValue('pl.js', 'peaceOffer.accept') === '☮ Akceptuj'
    && dictValue('pl.js', 'peaceOffer.reject') === '⚔ Odrzuć'
    && dictValue('pl.js', 'peaceOffer.counter') === '⇄ Kontrpropozycja',
    'T8c: trzy wybory dosłownie jak podpisano (PL)');
  assert(dictValue('en.js', 'peaceOffer.accept') === '☮ Accept'
    && dictValue('en.js', 'peaceOffer.reject') === '⚔ Reject'
    && dictValue('en.js', 'peaceOffer.counter') === '⇄ Counter-offer',
    'T8d: trzy wybory dosłownie jak podpisano (EN)');
  const hl = dictValue('pl.js', 'peaceOffer.headline') ?? '';
  const lg = dictValue('pl.js', 'log.diplo.aiPeaceOffer') ?? '';
  assert(hl.includes('{0}') && lg.includes('{0}'),
    'T8e: nagłówek i wpis Dziennika niosą nazwę imperium przez placeholder, nie przez sklejanie');
  const modal = readClean('ui/PeaceOfferModal.js');
  assert(modal !== '' && !/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(modal),
    'T8f: ZERO polskich literałów w kodzie modalu (klasa 113)');
}

// ════════════════════════════════════════════════════════════════════════════
// WP-4 / C5 (podpis D-WP-14 = a) — GAŁĄŹ GRACZA: gra przestaje prosić o pokój ZA gracza.
//
// Do C5 wyczerpanie gracza na 100 wołało `offerPeace(empireId, 'exhaustion_player',
// { playerInitiated: false })` — czyli GRA składała propozycję w imieniu gracza. Przy AI
// nieskłonnym do pokoju jedynym efektem był wpis `war:autoPeaceRefused`; przy skłonnym —
// pokój ZAWIERANY BEZ PYTANIA. C5 zastępuje to JEDNYM meldunkiem („czas rozważyć pokój"),
// raz na wojnę, a decyzję zostawia graczowi: to on klika ☮ w panelu Wojny.
//
// ⚠ RAZEM Z C3 OZNACZA TO, ŻE AUTO-POKÓJ PRZESTAJE ISTNIEĆ W GRZE. C3 zdjęło go z gałęzi
//   AI (depesza), C5 z gałęzi gracza (meldunek). Obie strony wymagają teraz kliknięcia.
//   Dlatego `war:autoPeaceRefused` traci JEDYNEGO emitenta, a `playerInitiated: false`
//   JEDYNEGO produkcyjnego wołającego — oba ZMIERZONE przed kodem, oba pinowane niżej.
console.log('T9 — C5: gałąź GRACZA melduje, nie podpisuje (D-WP-14)');
{
  const K = boot(); const w = warWith(K, 99, 0);
  const ds = K.diplomacySystem;
  const beats = [], refused = [];
  EventBus.on('war:playerExhausted', (p) => beats.push(p));
  EventBus.on('war:autoPeaceRefused', (p) => refused.push(p));
  // Szpieg na fasadzie — „czy gra złożyła propozycję ZA gracza" mierzymy LICZNIKIEM
  // WYWOŁAŃ, nie skutkiem: przy AI nieskłonnym do pokoju skutek jest identyczny
  // (wojna trwa), więc sam status nie odróżniłby „nie pytała" od „pytała i dostała nie".
  const realOfferPeace = ds.offerPeace.bind(ds);
  let calls = 0;
  ds.offerPeace = (...a) => { calls++; return realOfferPeace(...a); };

  K.warSystem.changeExhaustion(w.id, 'player', 1, 'test');
  assert(K.warSystem.getWar(w.id)?.exhaustion?.player === 100,
    'T9a (KONTROLA PINU): wyczerpanie gracza REALNIE dobiło sufitu — bez tego reszta T9 mierzyłaby ciszę');
  assert(calls === 0,
    'T9b: gra NIE składa propozycji pokoju za gracza (wywołań `offerPeace`: ' + calls + ')');
  assert(beats.length === 1,
    'T9c: dokładnie JEDEN meldunek `war:playerExhausted` (' + beats.length + ')');
  assert(beats[0]?.warId === w.id,
    'T9d: meldunek niesie `warId` — Dziennik mówi o KONKRETNEJ wojnie');
  assert(refused.length === 0,
    'T9e: `war:autoPeaceRefused` NIE leci — nie ma już odmowy, o której mógłby meldować');
  assert(ds.getStatus(EMP) === 'war' && K.warSystem.getWar(w.id)?.active === true,
    'T9f: wojna trwa, status pary nietknięty — próg 100 nic nie zamyka');
  assert(K.warSystem.getWar(w.id)?.playerExhaustedNotified === true,
    'T9g: flaga „już zameldowano" zapisana na REKORDZIE WOJNY (round-trip przez gameState, bez migracji)');

  // RAZ NA WOJNĘ — kolejne bitwy na suficie nie dokładają meldunków.
  K.warSystem.changeExhaustion(w.id, 'player', 5, 'kolejna bitwa');
  assert(beats.length === 1,
    'T9h: drugi bump na suficie ⇒ ZERO nowych meldunków (' + beats.length + ') — raz na wojnę');
  assert(calls === 0,
    'T9i: …i nadal żadnego `offerPeace` (' + calls + ')');

  // KONTROLA NIE-JAŁOWOŚCI SZPIEGA: gdy propozycja REALNIE idzie, licznik ją widzi.
  // ⚠ PRZYROST, nie wartość bezwzględna — pierwsza wersja asertowała `calls === 1` i padała
  //   na kodzie sprzed C5 z powodu POPRAWNEGO zachowania (dwa bumpy zdążyły już wywołać
  //   `offerPeace`, więc licznik stał na 2). Kontrola pinu nie może zależeć od stanu, który
  //   mierzy pin obok niej.
  const before = calls;
  ds.offerPeace(EMP, 'kontrola_pinu', { playerInitiated: true });
  assert(calls === before + 1,
    'T9j (KONTROLA PINU): szpieg łapie prawdziwe wywołanie (' + before + ' → ' + calls
    + ') — T9b/T9i nie mierzą zepsutego instrumentu');
  ds.offerPeace = realOfferPeace;
}
{
  // KONTROLA: C3 nietknięte — AI dalej proponuje przy obu wyczerpanych.
  const K = boot(); const w = warWith(K, 100, 99);
  const offers = spyOffers();
  bumpAi(K, w);
  assert(offers.length === 1,
    'T9k (KONTROLA PINU): depesza AI wg C3 działa dalej (' + offers.length + ') — C5 tyka WYŁĄCZNIE gałęzi gracza');
}
{
  // Pin ŹRÓDŁOWY: martwe zdarzenie nie ma ani emitenta, ani konsumenta w kodzie gry.
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) { if (e !== 'testing') walk(p, out); }
      else if (e.endsWith('.js')) out.push(p);
    }
    return out;
  };
  const hits = walk(SRC).filter(p => stripComments(norm(readFileSync(p, 'utf8'))).includes('war:autoPeaceRefused'));
  assert(hits.length === 0,
    'T9l (pin ŹRÓDŁOWY): `war:autoPeaceRefused` nie ma w kodzie gry ANI emitenta, ANI konsumenta ' +
    '(znalezione: ' + hits.map(p => p.slice(SRC.length)).join(', ') + ')');
  const uiSrc = readClean('scenes/UIManager.js');
  assert(uiSrc.includes("EventBus.on('war:playerExhausted'"),
    'T9m (pin ŹRÓDŁOWY): meldunek ma subskrybenta Dziennika — inaczej gracz nie dowiedziałby się niczego');
  // ⚠ ŚWIADEK, nie KONTROLA — musi być CZERWONY przed C5. Kontrole trzymają po obu
  //   stronach; ten pin dowodzi, że funkcję PRZENIEŚLIŚMY, a nie usunęli: gdyby nowego
  //   kanału nie było, T9l świeciłby zielono przy wyciętym meldunku.
  assert(hits.length === 0 && uiSrc.includes('war:playerExhausted'),
    'T9n (ŚWIADEK): nowy kanał ISTNIEJE — T9l nie mierzy nieobecności czegoś, czego nie ma nigdzie');
  const wsSrc = readClean('systems/WarSystem.js');
  assert(/AUTO_PEACE_EXHAUSTION\s*=\s*100/.test(wsSrc),
    'T9o: próg `AUTO_PEACE_EXHAUSTION` nietknięty (100) — C5 zmienia REAKCJĘ na próg, nie sam próg');
  assert(!wsSrc.includes("'exhaustion_player'") && !wsSrc.includes('playerInitiated: false'),
    'T9p: gałąź gracza nie woła już `offerPeace` — ani z etykietą `exhaustion_player`, ani z `playerInitiated: false`');
}
{
  // i18n — brzmienia DOSŁOWNIE jak podpisane.
  const pl = dictValue('pl.js', 'log.war.playerExhausted');
  const en = dictValue('en.js', 'log.war.playerExhausted');
  assert(pl === 'Imperium wyczerpane wojną — czas rozważyć pokój',
    'T9q: brzmienie PL dosłownie jak podpisano (' + JSON.stringify(pl) + ')');
  assert(en === 'Empire worn down by war — time to consider peace',
    'T9r: brzmienie EN dosłownie jak podpisano (' + JSON.stringify(en) + ')');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('=== WYNIK: ' + pass + ' PASS / ' + fail + ' FAIL (z ' + (pass + fail) + ') ===');
process.exit(fail === 0 ? 0 : 1);
