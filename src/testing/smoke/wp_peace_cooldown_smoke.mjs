// WP-4 / C4 — keeper: ODRZUCENIE POKOJU NIE KOSZTUJE PUNKTÓW (podpis D-WP-4, 27.09).
//
// PO CO: `offer_peace` ważył `recent_refusal` na 20 punktów, więc jedno „nie" AI zabierało
// graczowi −20 na KAŻDĄ kolejną propozycję przez 2 lata. Przy stole pokoju (C1) gracz
// negocjuje SERIĄ propozycji o różnych warunkach — a seria była karana jak spam. D-WP-4
// zdejmuje karę (waga 0) i zastępuje ją COOLDOWNEM PRZYCISKU: 1 rok, symetrycznie.
// Stempel `verbCooldowns` ZOSTAJE — od teraz jest zapisem cooldownu, nie karą punktową.
//
// ⚠ PIĘĆ RZECZY, KTÓRE SĄ TU KONTRAKTEM, A NIE PREFERENCJĄ:
//   1. `resolveWeights` MNOŻY wagi przez nadpisania archetypu/celu, a 0 JEST POCHŁANIAJĄCE
//      (0 × cokolwiek = 0). Dlatego „czy odmowa kosztuje punkty" jest własnością CZASOWNIKA,
//      nie pary gracz↔imperium — i dlatego fasada wystawia to jako `isRefusalPenalised(verb)`,
//      bez argumentu imperium. T0e mierzy pochłanianie WYKONANIEM, nie deklaracją.
//   2. OKNO ODMOWY MA JEDNĄ DEFINICJĘ. Przed C4 liczyły je DWA miejsca własną arytmetyką
//      (`DiplomacySystem.getRefusalYearsLeft` i ewaluator `recent_refusal`). Per-czasownikowe
//      okno w dwóch kopiach to nieutwardzony bliźniak (lekcja `removeColony:667`), więc
//      rachunek przeniósł się do `refusalWindowYears` w `AcceptanceMath`. T2 pinuje ŹRÓDŁOWO,
//      że obie ścieżki wołają helper i że stała ma w `src/` dokładnie JEDNEGO czytelnika.
//   3. STEMPEL ≠ KARA. Po C4 stempel dalej powstaje przy ocenionej odmowie (bez niego nie ma
//      cooldownu), ale wiersz `recent_refusal` w rozbiciu pokoju jest 0 — I TO NIEZALEŻNIE OD
//      CZASU. T3 mierzy oba brzegi okna; T3g-T3i są kontrolą na innym czasowniku, żeby „0"
//      nie znaczyło „term umarł dla wszystkich".
//   4. D-WP-16 `opts.stampRefusal` (domyślnie === `playerInitiated`) to OSOBNA dźwignia od
//      `playerInitiated` — C3 potrzebuje oceny odmownej, która NIE stempluje, przy propozycji
//      jak najbardziej świadomej. T4e/T4f pinują obie strony domyślności, inaczej „domyślnie
//      === playerInitiated" byłoby nieodróżnialne od „to ta sama flaga".
//   5. WYSZARZONY PRZYCISK MA ZDJĘTĄ HIT-ZONĘ (kanon „widoczny+zablokowany" z tech-gate'u
//      i `fleet.requiresOrbitalShipyard`). T5 mierzy to WYKONANIEM na `_hitZones`, bo
//      `WarOverlay` importuje się pod node — grep na źródle nie odróżniłby „narysowane szare"
//      od „nadal klikalne".
//
// ⚠ ZDANIE, KTÓRE C4 CZYNI FAŁSZYWYM, NAPRAWIAMY W TYM SAMYM COMMICIE. Modal odmowy renderuje
//   wiersz `diploRefusal.cooldownYears` = „obciąża kolejną próbę jeszcze przez {0} l." —
//   po C4 pokój NIC nie obciąża (waga 0), a liczba byłaby 2 zamiast 1. Zostawienie tego
//   wiersza oznaczałoby dowiezienie regresji razem z funkcją (wzór W3-5b / F190). T6.
//
// ⚠ IMPORTY DYNAMICZNE dla symboli POWSTAJĄCYCH w tym slice: statyczny import nieistniejącego
//   symbolu wywala CAŁY plik na linkowaniu ESM i żaden pin nie dostaje koloru (lekcja
//   `ground_troops_reachable`). `refusalWindowYears` rodzi się w C4 ⇒ dynamicznie.
//
// ⚠ ŻADNEGO wywołania funkcji tłumaczącej w tym pliku — `tools/check-i18n.mjs` skanuje je
//   w całym `src/`, więc cytat klucza w keeperze trafia do puli „użyte". Klucze sprawdzamy
//   ODCZYTEM słowników jako tekstu, a modal dostaje WŁASNY `translate`, który notuje klucze.
//
// Uruchom: node src/testing/smoke/wp_peace_cooldown_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (window/localStorage/THREE)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GameCore } from '../headless/GameCore.js';
import { OverlayManager } from '../../ui/OverlayManager.js';
import {
  VERB_ACCEPTANCE, RECENT_REFUSAL_YEARS, ACCEPTANCE_TERMS, TERM_STATUS,
} from '../../data/AcceptanceWeightData.js';
import { resolveWeights } from '../../utils/AcceptanceMath.js';

// Symbole rodzące się w C4 — dynamicznie, żeby brak importu nie zabił kolorów pinów.
let MathMod = null, WarOverlayMod = null, RefusalMod = null;
try { MathMod       = await import('../../utils/AcceptanceMath.js'); }      catch { /* fail-first */ }
try { WarOverlayMod = await import('../../ui/WarOverlay.js'); }             catch { /* fail-first */ }
try { RefusalMod    = await import('../../ui/DiplomacyRefusalModal.js'); }  catch { /* fail-first */ }
const refusalWindowYears = MathMod?.refusalWindowYears ?? null;

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Narzędzia pinów źródłowych (lustro `wp_peace_table_smoke`) ──────────────
// ⚠ CRLF (§270): źródło PO NORMALIZACJI. ⚠ Komentarze zdejmowane.
const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const norm = (s) => s.replace(/\r\n/g, '\n');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const readRaw   = (...p) => norm(readFileSync(join(SRC, ...p), 'utf8'));
const readClean = (...p) => stripComments(readRaw(...p));

/** Wartość klucza ze słownika czytanego JAKO TEKST (bez wołania tłumacza). */
const dictValue = (file, key) => {
  const re = new RegExp("'" + key.replace(/\./g, '\\.') + "':\\s*'((?:[^'\\\\]|\\\\.)*)'");
  const m = readRaw('i18n', file).match(re);
  return m ? m[1] : null;
};

/**
 * Ciało JEDNEJ metody klasy — okno anchorowane STRUKTURALNIE (od nagłówka metody do
 * następnej metody na tym samym wcięciu), nie odległością w znakach. Powód: proxy
 * rozmiarowe („iStart + 3000") pada, gdy ktoś doda wiersz wyżej — `fleet_clock_band` T4
 * i `return_actions_removed` A6 zapłaciły za to rundą.
 */
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

// ── Fixture: ŻYWY silnik (GameCore) — lustro `wp_peace_table_smoke` ─────────
const EMP = 'emp_001';
function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization', aiEmpires: true });
  const K = window.KOSMOS;
  K.acceptanceEngine = K.diplomacySystem._acceptance();  // GameScene:445
  return K;
}
/** Wojna z ZADANYM wyczerpaniem — wprost w gameState, NIE przez changeExhaustion. */
function warAt(K, exh = 0) {
  K.diplomacySystem.declareWar(EMP, 'player_action');
  const ws = K.warSystem, w = ws.getWarWith(EMP);
  K.gameState.set('wars.' + w.id, { ...w, exhaustion: { player: exh, [EMP]: exh } }, 'wp4c4_fixture');
  return ws.getWarWith(EMP);
}
const cooldowns = (K) => K.diplomacySystem.relations.getVerbCooldowns('player', EMP);

function mkCtx() {
  const texts = [];
  const noop = () => {};
  return {
    texts,
    canvas: { width: 1280, height: 720 },
    measureText: (s) => ({ width: String(s).length * 6 }),
    save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop,
    stroke: noop, fill: noop, clip: noop, rect: noop, fillRect: noop,
    strokeRect: noop, closePath: noop, arc: noop, translate: noop, setLineDash: noop,
    fillText: (s, x, y) => texts.push({ t: String(s), x, y }),
    strokeText: (s, x, y) => texts.push({ t: String(s), x, y }),
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: 'left', globalAlpha: 1,
  };
}
function drawPanel(K) {
  if (!WarOverlayMod?.WarOverlay) return null;
  const ov = new WarOverlayMod.WarOverlay();
  ov.visible = true;
  ov.show();
  const ctx = mkCtx();
  ov.draw(ctx, 1280, 720);
  return { ov, ctx };
}
const zoneTypes = (ov) => (ov?._hitZones ?? []).map(z => z.type);

const OTHER_VERBS = ['trade_agreement', 'non_aggression', 'alliance', 'improve_relations'];
const KEY_BTN_CD  = 'warOverlay.btnPeaceCooldown';
const KEY_CD_BLK  = 'diploRefusal.cooldownBlocks';
const KEY_CD_PEN  = 'diploRefusal.cooldownYears';
const KEY_HINT    = 'warOverlay.declareHint';

// ════════════════════════════════════════════════════════════════════════════
console.log('T0 — kontrola narzędzia i mierzonych faktów o silniku');
{
  assert(stripComments('const a=1; // refusalCooldownYears\n/* refusalCooldownYears */')
    .includes('refusalCooldownYears') === false,
    'T0a: `stripComments` zdejmuje oba rodzaje komentarzy');
  const K = boot();
  assert(!!K.diplomacySystem && !!K.warSystem && !!K.acceptanceEngine,
    'T0b: fixture stawia ŻYWY silnik (diplomacySystem + warSystem + acceptanceEngine)');
  assert(!!WarOverlayMod?.WarOverlay,
    'T0c: `WarOverlay` importuje się pod node — inaczej piny UI mierzyłyby ciszę');
  const K2 = boot(); warAt(K2, 0);
  const d = drawPanel(K2);
  assert(!!d && d.ctx.texts.length > 5 && d.ov._hitZones.length > 1,
    'T0d (KONTROLA PINU): panel REALNIE się narysował (napisy=' + (d?.ctx.texts.length ?? 0)
    + ', hit-zony=' + (d?.ov._hitZones.length ?? 0) + ') — bez tego brak przycisku myliłby się z brakiem rysowania');
  // 0 JEST POCHŁANIAJĄCE — dlatego „czy kosztuje punkty" to własność CZASOWNIKA, nie pary.
  const absorbed = resolveWeights({ terms: { recent_refusal: 0 }, threshold: 0 },
    [{ terms: { recent_refusal: 10 } }, { terms: { recent_refusal: 99 } }]).terms.recent_refusal;
  const scaled = resolveWeights({ terms: { recent_refusal: 20 }, threshold: 0 },
    [{ terms: { recent_refusal: 2 } }]).terms.recent_refusal;
  assert(absorbed === 0,
    'T0e: `resolveWeights` MNOŻY ⇒ waga 0 jest pochłaniająca (' + absorbed
    + ') — żadne nadpisanie archetypu nie wskrzesi kary');
  assert(scaled === 40,
    'T0f (KONTROLA PINU): nadpisanie REALNIE skaluje niezerową wagę (20×2=' + scaled
    + ') — T0e nie mierzy martwej ścieżki');
  assert(!!RefusalMod?.buildRefusalContent,
    'T0g (KONTROLA PINU): `buildRefusalContent` importuje się pod node — T6 ćwiczy go WYKONANIEM');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T1 — KATALOG: waga 0 + okno 1 rok, diff ograniczony do dwóch kluczy');
{
  const p = VERB_ACCEPTANCE.offer_peace;
  assert(p.terms.recent_refusal === 0,
    'T1a: `offer_peace.terms.recent_refusal === 0` (było 20) — odrzucenie pokoju nie kosztuje punktów');
  assert(p.refusalCooldownYears === 1,
    'T1b: `offer_peace.refusalCooldownYears === 1` — kara zastąpiona cooldownem przycisku');
  assert(OTHER_VERBS.length === 4
    && OTHER_VERBS.every(v => (VERB_ACCEPTANCE[v]?.terms?.recent_refusal ?? 0) > 0),
    'T1c: pozostałe CZTERY czasowniki nadal ważą `recent_refusal` > 0 (świadek niepustości — zmiana jest punktowa)');
  assert(OTHER_VERBS.every(v => VERB_ACCEPTANCE[v].refusalCooldownYears === undefined),
    'T1d: pozostałe czasowniki NIE mają `refusalCooldownYears` ⇒ zostają na oknie domyślnym');
  assert(p.threshold === 0,
    'T1e: próg `offer_peace` nietknięty (0) — D-WP-4 rusza wagę, nie próg');
  assert(RECENT_REFUSAL_YEARS === 2,
    'T1f: `RECENT_REFUSAL_YEARS === 2` — stała fallbacku nietknięta');
  // DIFF: wszystkie POZOSTAŁE wagi `offer_peace` co do liczby (kotwica anty-rozjazdowi balansu).
  const expect = {
    war_status: 55, opinion: 20, personality: 25, tension: 10, memory: 15,
    reputation: 10, third_party: 10, offer: 25, relative_power: 30,
    erratic_noise: 15, territorial_terms: 35,
  };
  const drift = Object.entries(expect).filter(([k, v]) => p.terms[k] !== v).map(([k]) => k);
  assert(drift.length === 0 && Object.keys(p.terms).length === Object.keys(expect).length + 1,
    'T1g: diff katalogu ograniczony do DWÓCH kluczy `offer_peace` — pozostałe wagi bez zmian (rozjazd: ['
    + drift.join(',') + '])');
  assert(ACCEPTANCE_TERMS.recent_refusal.status === TERM_STATUS.LIVE,
    'T1h: status `recent_refusal` bez zmian (LIVE) — term żyje dla pozostałych czasowników');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T2 — OKNO PER CZASOWNIK: jedna definicja + fallback');
{
  assert(typeof refusalWindowYears === 'function',
    'T2a: `refusalWindowYears` istnieje w `AcceptanceMath` (czysta matematyka, nie dane)');
  if (typeof refusalWindowYears === 'function') {
    assert(refusalWindowYears(VERB_ACCEPTANCE.offer_peace) === 1,
      'T2b: okno `offer_peace` = 1 rok (z katalogu)');
    assert(refusalWindowYears(VERB_ACCEPTANCE.trade_agreement) === RECENT_REFUSAL_YEARS,
      'T2c: brak klucza ⇒ `RECENT_REFUSAL_YEARS` (' + RECENT_REFUSAL_YEARS + ')');
    assert(refusalWindowYears(undefined) === RECENT_REFUSAL_YEARS
      && refusalWindowYears(null) === RECENT_REFUSAL_YEARS,
      'T2d: NIEZNANY czasownik ⇒ fallback (dotyczy klucza `ai_peace_offer`, którego C3 nie ma w katalogu)');
    assert(refusalWindowYears({ refusalCooldownYears: -3 }) === RECENT_REFUSAL_YEARS
      && refusalWindowYears({ refusalCooldownYears: 'x' }) === RECENT_REFUSAL_YEARS,
      'T2e: wartość ujemna / nieliczbowa ⇒ fallback, nie cisza');
    assert(refusalWindowYears({ refusalCooldownYears: 0 }) === 0,
      'T2f: ZERO jest poprawnym oknem (brak cooldownu), nie „brakiem klucza"');
  }
  // Pin ŹRÓDŁOWY: rachunek okna ma JEDNO miejsce.
  const ds = readClean('systems/DiplomacySystem.js');
  const ae = readClean('systems/diplomacy/AcceptanceEngine.js');
  const am = readClean('utils/AcceptanceMath.js');
  assert(ds.includes('refusalWindowYears') && ae.includes('refusalWindowYears'),
    'T2g: OBA site\'y (fasada + ewaluator) wołają helper, zamiast liczyć okno własną arytmetyką');
  assert(!ds.includes('RECENT_REFUSAL_YEARS') && !ae.includes('RECENT_REFUSAL_YEARS'),
    'T2h: ani fasada, ani ewaluator nie czytają już stałej wprost — bliźniak zdjęty');
  assert(am.includes('RECENT_REFUSAL_YEARS'),
    'T2i (KONTROLA PINU): stała ma czytelnika — w `AcceptanceMath`, czyli w JEDNYM miejscu');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T3 — STEMPEL ≠ KARA: wiersz rozbicia jest 0 niezależnie od czasu');
{
  const K = boot(); warAt(K, 0);
  const ds = K.diplomacySystem, ts = K.timeSystem;
  const y0 = Math.floor(ts.gameTime);
  const peaceRow = () => ds.evaluatePeace(EMP).breakdown.find(x => x.term === 'recent_refusal')?.value ?? null;
  assert(ds.offerPeace(EMP, 'player_war_panel') === false,
    'T3a (KONTROLA PINU): przy wyczerpaniu 0 propozycja pokoju ZOSTAJE ODRZUCONA — bez tego nie ma czego mierzyć');
  assert(cooldowns(K).offer_peace === y0,
    'T3b: oceniona odmowa STEMPLUJE `offer_peace` (' + cooldowns(K).offer_peace + ') — stempel to zapis cooldownu');
  assert(peaceRow() === 0,
    'T3c: tuż po odmowie wiersz `recent_refusal` w rozbiciu POKOJU = 0 (kara nie istnieje)');
  assert(ds.getRefusalYearsLeft(EMP, 'offer_peace') === 1,
    'T3d: tuż po odmowie cooldown `offer_peace` = 1 rok (nie 2 — okno per czasownik)');
  ts.gameTime = y0 + 1;
  assert(peaceRow() === 0,
    'T3e: po upływie okna też 0 — czas nie ma czego wygaszać (pin, który PADNIE, gdy ktoś wróci karę)');
  assert(ds.getRefusalYearsLeft(EMP, 'offer_peace') === 0,
    'T3f: po 1 roku cooldown `offer_peace` wygasł');
}
{
  // KONTROLA: ten sam mechanizm na czasowniku, który KARY NIE STRACIŁ.
  const K = boot();
  const ds = K.diplomacySystem;
  ds.addOpinionModifier(EMP, 'player', 'legacy_relations', { value: -50, source: 'wp4c4' });
  assert(ds.proposeTreaty(EMP, 'alliance') === false,
    'T3g (KONTROLA PINU): propozycja sojuszu przy opinii −50 odpada — jest odmowa do zmierzenia');
  const w = VERB_ACCEPTANCE.alliance.terms.recent_refusal;
  const val = ds.evaluateTreaty(EMP, 'alliance').breakdown.find(x => x.term === 'recent_refusal')?.value;
  assert(val === -w,
    'T3h (KONTROLA PINU): dla `alliance` świeża odmowa DALEJ kosztuje −' + w + ' (jest ' + val
    + ') — „0" w T3c nie znaczy „term umarł dla wszystkich"');
  assert(ds.getRefusalYearsLeft(EMP, 'alliance') === RECENT_REFUSAL_YEARS,
    'T3i (KONTROLA PINU): okno `alliance` zostało na ' + RECENT_REFUSAL_YEARS + ' latach');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T4 — KTO STEMPLUJE: ocena tak, blokada nie, `stampRefusal` osobno (D-WP-16)');
{
  const K = boot(); warAt(K, 0);
  assert(K.diplomacySystem.offerPeace(EMP, 'player_war_panel') === false
    && cooldowns(K).offer_peace !== undefined,
    'T4a: świadoma propozycja gracza + odmowa ⇒ stempel');
}
{
  const K = boot(); warAt(K, 0);
  assert(K.diplomacySystem.offerPeace(EMP, 'exhaustion_player', { playerInitiated: false }) === false
    && cooldowns(K).offer_peace === undefined,
    'T4b: auto-pokój (`playerInitiated:false`) NIE stempluje — R4 nietknięte');
}
{
  const K = boot(); warAt(K, 0);
  const before = JSON.stringify(cooldowns(K));
  assert(K.diplomacySystem.offerPeace(EMP, 'ai_peace_offer_accept',
    { playerInitiated: true, stampRefusal: false }) === false,
    'T4c (KONTROLA PINU): propozycja z `stampRefusal:false` też odpada (jest ocena odmowna)');
  assert(JSON.stringify(cooldowns(K)) === before,
    'T4d (D-WP-16): `stampRefusal:false` + `decision:false` ⇒ `verbCooldowns` BEZ ZMIAN — C3 potrzebuje tego przy AKCEPTUJ');
}
{
  const K = boot(); warAt(K, 0);
  assert(K.diplomacySystem.offerPeace(EMP, 'player_war_panel', { playerInitiated: true }) === false
    && cooldowns(K).offer_peace !== undefined,
    'T4e: domyślnie `stampRefusal === playerInitiated` — pominięcie opcji nie zmienia zachowania');
}
{
  const K = boot(); warAt(K, 0);
  assert(K.diplomacySystem.offerPeace(EMP, 'exhaustion_player',
    { playerInitiated: false, stampRefusal: true }) === false
    && cooldowns(K).offer_peace !== undefined,
    'T4f: `stampRefusal:true` przy `playerInitiated:false` STEMPLUJE — to OSOBNA dźwignia, nie alias');
}
{
  // Blokada pre-warunku (brak wojny) nie dochodzi do oceny ⇒ nie stempluje. R3 nietknięte.
  const K = boot();
  assert(K.diplomacySystem.offerPeace(EMP, 'player_war_panel') === false
    && cooldowns(K).offer_peace === undefined,
    'T4g: brak wojny ⇒ propozycja nie dochodzi do oceny i NIE stempluje — R3 nietknięte');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T5 — UI: ☮ wyszarzony z licznikiem i ZDJĘTĄ hit-zoną (wykonaniowo)');
{
  const K = boot(); warAt(K, 0);
  const before = drawPanel(K);
  assert(zoneTypes(before?.ov).includes('offer_peace'),
    'T5a (KONTROLA PINU): bez cooldownu hit-zona `offer_peace` JEST — inaczej T5c mierzyłby ciszę');
  K.diplomacySystem.offerPeace(EMP, 'player_war_panel');
  const yrs = K.diplomacySystem.getRefusalYearsLeft(EMP, 'offer_peace');
  const after = drawPanel(K);
  assert(yrs === 1,
    'T5b (KONTROLA PINU): po odmowie cooldown wynosi 1 rok (jest ' + yrs + ')');
  assert(!zoneTypes(after?.ov).includes('offer_peace'),
    'T5c: z cooldownem hit-zona `offer_peace` ZDJĘTA — przycisk nie jest klikalny, nie tylko szary');
  assert(zoneTypes(after?.ov).includes('force_battle'),
    'T5d (KONTROLA PINU): pozostałe przyciski panelu nietknięte (`force_battle` dalej klikalny)');
  const tplPl = dictValue('pl.js', KEY_BTN_CD);
  const tplEn = dictValue('en.js', KEY_BTN_CD);
  const wanted = [tplPl, tplEn].filter(Boolean).map(s => s.replace('{0}', String(yrs)));
  const drawn = (after?.ctx.texts ?? []).map(x => x.t);
  assert(wanted.length === 2 && wanted.some(s => drawn.includes(s)),
    'T5e: etykieta wyszarzonego przycisku NIESIE LICZNIK lat (szukane: ' + JSON.stringify(wanted) + ')');
  const normalPl = dictValue('pl.js', 'warOverlay.btnProposePeace');
  assert(!!normalPl && !drawn.includes(normalPl),
    'T5f: zwykła etykieta „zaproponuj pokój" NIE jest rysowana, gdy trwa cooldown');
  const body = methodBody(readClean('ui/WarOverlay.js'), '_drawRight');
  assert(body.includes('getRefusalYearsLeft'),
    'T5g (pin ŹRÓDŁOWY): `_drawRight` pyta FASADĘ o cooldown — UI nie importuje `Acceptance*` (pin P14)');
  assert(!readClean('ui/WarOverlay.js').includes('AcceptanceWeightData'),
    'T5h (pin P14): `WarOverlay` nie importuje katalogu wag');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T6 — MODAL ODMOWY: zdanie o karze przestaje kłamać');
{
  const K = boot();
  const ds = K.diplomacySystem;
  assert(ds.isRefusalPenalised?.('offer_peace') === false,
    'T6a: fasada mówi, że odmowa pokoju NIE kosztuje punktów (`isRefusalPenalised` = false)');
  assert(ds.isRefusalPenalised?.('trade_agreement') === true
    && ds.isRefusalPenalised?.('alliance') === true,
    'T6b (KONTROLA PINU): dla traktatów dalej true — predykat rozróżnia, nie zwraca stałej');
  assert(ds.isRefusalPenalised?.('ai_peace_offer') === false,
    'T6c: nieznany klucz ⇒ false (nie udajemy kary, której katalog nie zna)');
  if (RefusalMod?.buildRefusalContent) {
    const seen = [];
    const spy = (k) => { seen.push(k); return k; };
    const result = { verb: 'offer_peace', score: -5, threshold: 0, decision: false, breakdown: [] };
    RefusalMod.buildRefusalContent(result,
      { cooldownYearsLeft: 1, cooldownPenalised: false, translate: spy, rows: [] });
    assert(seen.includes(KEY_CD_BLK) && !seen.includes(KEY_CD_PEN),
      'T6d: przy karze 0 modal używa `cooldownBlocks` („ponowna propozycja za N l."), NIE `cooldownYears` („obciąża")');
    seen.length = 0;
    RefusalMod.buildRefusalContent(result,
      { cooldownYearsLeft: 1, cooldownPenalised: true, translate: spy, rows: [] });
    assert(seen.includes(KEY_CD_PEN) && !seen.includes(KEY_CD_BLK),
      'T6e (KONTROLA PINU): przy realnej karze modal dalej mówi „obciąża" — stare brzmienie nie znika');
    seen.length = 0;
    RefusalMod.buildRefusalContent(result,
      { cooldownYearsLeft: 0, cooldownPenalised: false, translate: spy, rows: [] });
    assert(!seen.includes(KEY_CD_BLK) && !seen.includes(KEY_CD_PEN),
      'T6f (KONTROLA PINU): bez cooldownu żaden z dwóch wierszy nie leci');
  }
  const mod = readClean('ui/DiplomacyRefusalModal.js');
  assert(mod.includes('isRefusalPenalised'),
    'T6g (pin ŹRÓDŁOWY): modal bierze flagę z FASADY, nie z katalogu (pin P14)');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T7 — i18n: nowe klucze w OBU słownikach, bez literałów w UI');
{
  for (const key of [KEY_BTN_CD, KEY_CD_BLK]) {
    const pl = dictValue('pl.js', key), en = dictValue('en.js', key);
    assert(!!pl && !!en,
      'T7a: `' + key + '` jest w pl I en (pl=' + JSON.stringify(pl) + ', en=' + JSON.stringify(en) + ')');
    assert(!!pl && !!en && pl.includes('{0}') && en.includes('{0}'),
      'T7b: `' + key + '` niesie placeholder licznika w obu językach');
  }
  const plBlk = dictValue('pl.js', KEY_CD_BLK) ?? '';
  const plPen = dictValue('pl.js', KEY_CD_PEN) ?? '';
  assert(plBlk !== '' && plBlk !== plPen && !plBlk.includes('obciąża'),
    'T7c: nowe brzmienie NIE mówi „obciąża" — po D-WP-4 odmowa pokoju niczego nie obciąża');
  const body = methodBody(readClean('ui/WarOverlay.js'), '_drawRight');
  assert(body !== '' && !/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(body),
    'T7d: brak polskiego literału w rysowanej ścieżce `_drawRight` (klasa 113)');
}

// ════════════════════════════════════════════════════════════════════════════
// T8 — PODPOWIEDŹ NAZYWA KLAWISZ, KTÓRY ISTNIEJE.
//
// ⚠ Podpowiedź pustej listy wojen mówiła graczowi „Diplomacy panel (Y)" / „panelu
//   Dyplomacji (Y)", a `y` NIE JEST ZWIĄZANE Z NICZYM — dyplomacja siedzi pod `d`
//   (`OverlayManager._keyMap`). Kłamała w OBU językach, a `check-i18n` tego NIE WIDZI:
//   pyta „czy klucz użyty w `t()` istnieje w pl i en", a nie „czy treść jest prawdziwa"
//   (ten sam martwy kąt narzędzia co Finding 113/269). Złapane przy pisaniu instrukcji
//   gate'u WP-5 — podpowiedź leży dokładnie na ścieżce „wypowiedz wojnę".
//
// ⚠ PIN JEST WYKONANIOWY PO STRONIE KLAWIATURY: `OverlayManager` importuje się pod node,
//   więc czytamy ŻYWĄ keymapę zamiast regexa na źródle. Gdy ktoś przeniesie dyplomację na
//   inny klawisz, pin spadnie RAZEM z podpowiedzią — i o to chodzi.
console.log('\nT8 — litera w podpowiedzi === klawisz dyplomacji (PL + EN)');
{
  const om = new OverlayManager();
  const diploKeys = Object.keys(om._keyMap)
    .filter(k => om._keyMap[k] === 'diplomacy' || om._keyMap[k]?.id === 'diplomacy');
  assert(diploKeys.length === 1,
    'T8a: dyplomacja ma DOKŁADNIE jeden klawisz w żywej keymapie — ' + JSON.stringify(diploKeys));
  const diploKey = diploKeys[0] ?? null;

  // JEDEN ekstraktor dla obu języków I dla kontroli pinu — inaczej kontrola mierzyłaby
  // inny rachunek niż pin (lekcja „kontrola grepująca literał dowodzi napisu, nie kształtu").
  const letterOf = (v) => (typeof v === 'string' ? (v.match(/\(([A-Za-z])\)/)?.[1] ?? null) : null);

  for (const file of ['pl.js', 'en.js']) {
    const val = dictValue(file, KEY_HINT);
    const letter = letterOf(val);
    // ANTY-JAŁOWOŚĆ: brak litery NIE jest cichym zaliczeniem. Podpowiedź ma nazywać klawisz,
    // więc usunięcie nawiasu też musi wymusić świadomą decyzję, a nie przejść bokiem.
    assert(letter !== null,
      'T8b[' + file + ']: podpowiedź nazywa klawisz w nawiasie — ' + JSON.stringify(val));
    assert(letter !== null && diploKey !== null && letter.toLowerCase() === diploKey.toLowerCase(),
      'T8c[' + file + ']: litera „' + letter + '" === klawisz dyplomacji „' + diploKey + '"');
  }

  // KONTROLA PINU — ten sam ekstraktor i to samo porównanie na syntetycznym brzmieniu
  // z literą SPRZED naprawy. Zielone po OBU stronach naprawy; gdyby porównanie było ślepe,
  // ta asercja by padła.
  const bogus = letterOf('Declare war from the Diplomacy panel (Y).');
  assert(bogus === 'Y' && diploKey !== null && bogus.toLowerCase() !== diploKey.toLowerCase(),
    'T8d (kontrola pinu): syntetyczne „(Y)" wykrywane jako NIEZGODNE z „' + diploKey + '"');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('');
console.log('=== WYNIK: ' + pass + ' PASS / ' + fail + ' FAIL (z ' + (pass + fail) + ') ===');
process.exit(fail === 0 ? 0 : 1);
