// WP-4 / C1 — keeper STOŁU POKOJU (W4-simple, WOJNA I POKÓJ).
//
// PO CO: WP-2 nauczył silnik OCENIAĆ warunki terytorialne, WP-3 je WYKONYWAĆ — ale gracz
// nie miał jak ich ZŁOŻYĆ: panel Wojny wołał `offerPeace(empireId, 'player_war_panel')`
// BEZ `terms`, więc cała mechanika cesji była nieosiągalna klikiem. C1 dokłada stół.
//
// ⚠ CZTERY RZECZY, KTÓRE SĄ TU KONTRAKTEM, A NIE PREFERENCJĄ (każda ZMIERZONA w FAZIE A):
//   1. PIN P14 (`acceptance_engine_smoke`) zabrania UI importować `Acceptance*` — RÓWNIEŻ
//      `AcceptanceWeightData.js`. Dlatego wycena stołu NIE MOŻE powstać w overlayu; jest
//      projekcją fasady (`getPeaceTable`, wzór `getVisibleBreakdown`), która reużywa
//      `_buildTermsContext` CO DO WIERSZA. T1 dowodzi tego RÓWNOŚCIĄ WYKONANIOWĄ.
//   2. REGRESJA ZERO: pusty stół musi dać `terms === null`, bo `_buildTermsContext` liczy
//      cokolwiek TYLKO dla propozycji z cesjami (WP-2, piny T9c/T9d). T2 mierzy to
//      LICZNIKIEM ODCZYTÓW ŚWIATA, nie deklaracją.
//   3. SUFIT liczy WYŁĄCZNIE własne, nie-odbite ciała oceniającego (`territorial_ceiling`).
//      Projekcja wystawia to jako `countsToCeiling`, a T3 pinuje RÓWNOWAŻNOŚĆ z pre-warunkiem
//      silnika — inaczej panel miałby drugą definicję sufitu i rozjechałby się przy pierwszej
//      zmianie reguły.
//   4. `_hitTest` w `BaseOverlay` to `.find()` ⇒ PIERWSZY dopasowany wygrywa, więc
//      tło-absorber stołu MUSI być ostatni w `_hitZones` (gotcha S4-1). T6 mierzy INDEKS.
//
// ⚠ F-a NAPRAWIANE W TYM SAMYM COMMICIE: `WarOverlay._scrollRight` był ZAPISYWANY
//   (`handleScroll`) i NIGDY nie czytany w `draw` ⇒ prawa kolumna nie przewijała się wcale.
//   Bez tego stół (dwie listy ciał) jest nieosiągalny poza foldem. T8 pinuje, że scroll
//   REALNIE przesuwa treść, jest clampowany i że hit-zony poza pasmem są prunowane.
//
// ⚠ WarOverlay DA SIĘ ĆWICZYĆ WYKONANIOWO (zmierzone): po `headless/env.js` importuje się
//   pod node, a `draw()` przechodzi na atrapie ctx. Dlatego piny UI są tu WYKONANIOWE,
//   nie źródłowe — poza P14, które z natury jest pinem źródłowym.
//
// ⚠ IMPORTY DYNAMICZNE dla symboli POWSTAJĄCYCH w tym slice (lekcja WP-2/WP-3): statyczny
//   import nieistniejącego symbolu wywala CAŁY plik na linkowaniu ESM i żaden pin nie
//   dostaje koloru.
//
// ⚠ ŻADNEGO wywołania funkcji tłumaczącej w tym pliku: `tools/check-i18n.mjs` skanuje
//   wywołania tej funkcji w CAŁYM `src/` (pomija `src/testing/` dopiero przy sinku DOM
//   i advisory), więc cytat klucza w keeperze trafia do puli „użyte" i potrafi wywrócić
//   bramkę. Klucze sprawdzamy ODCZYTEM słowników jako tekstu.
//
// Uruchom: node src/testing/smoke/wp_peace_table_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (window/localStorage/THREE)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

import { GameCore } from '../headless/GameCore.js';
import { DirectorProduction } from '../../systems/director/DirectorProduction.js';
import EntityManager from '../../core/EntityManager.js';
import { TERRITORIAL_MAX_SHARE, TERRITORIAL_BASE_VALUE } from '../../data/AcceptanceWeightData.js';

// Klasa panelu — dynamicznie, żeby brak/awaria importu nie zabiła kolorów pinów.
let WarOverlayMod = null;
try { WarOverlayMod = await import('../../ui/WarOverlay.js'); } catch { /* fail-first */ }

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Narzędzia pinów źródłowych (lustro `wp_cession_execution_smoke`) ────────
// ⚠ CRLF (§270): źródło PO NORMALIZACJI. ⚠ Komentarze zdejmowane.
const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const norm = (s) => s.replace(/\r\n/g, '\n');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const readRaw   = (...p) => norm(readFileSync(join(SRC, ...p), 'utf8'));
const readClean = (...p) => stripComments(readRaw(...p));

/**
 * Ciało JEDNEJ metody klasy — okno anchorowane STRUKTURALNIE (od nagłówka metody do
 * następnej metody na tym samym wcięciu).
 *
 * ⚠ ISTNIEJE, BO PIERWSZA WERSJA T8a ŚWIECIŁA ZIELONO NA KODZIE SPRZED NAPRAWY: okno
 *   wycinane `split('_drawRight')[2]` sięgało aż do końca pliku, więc pin łapał
 *   `_scrollRight` z `handleScroll` — czyli z JEDYNEGO miejsca, gdzie to pole już było.
 *   To ta sama klasa co proxy rozmiarowe w `fleet_clock_band` T4 i okno `iStart + 3000`
 *   w `return_actions_removed` A6: pin musi być anchorowany strukturą, nie odległością.
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

function uiFiles(dir = join(SRC, 'ui'), out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) uiFiles(p, out);
    else if (e.endsWith('.js')) out.push(p);
  }
  return out;
}

// ── Fixture: ŻYWY silnik (GameCore) ─────────────────────────────────────────
const EMP = 'emp_001';

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization', aiEmpires: true });
  const K = window.KOSMOS;
  K.acceptanceEngine = K.diplomacySystem._acceptance();  // GameScene:445
  return K;
}
const freeBodies = (cm, sysId, n) => EntityManager.getAll()
  .filter(b => (b.systemId || 'sys_home') === sysId
    && (b.type === 'planet' || b.type === 'moon') && !cm.getColony(b.id))
  .slice(0, n);
function giveAi(K, n) {
  const cm = K.colonyManager, reg = K.empireRegistry;
  const sys = reg.getColoniesByEmpire(EMP)[0].systemId;
  const ids = [];
  for (const b of freeBodies(cm, sys, n)) {
    cm.createColony(b.id, { minerals: 100 }, 20, 0, EMP);
    reg.addColony(EMP, b.id);
    ids.push(b.id);
  }
  return ids;
}
function givePlayer(K, n) {
  const cm = K.colonyManager;
  const sys = cm.getPlayerColonies()[0].systemId;
  const ids = [];
  for (const b of freeBodies(cm, sys, n)) {
    cm.createColony(b.id, { minerals: 100 }, 10, 0, null);
    ids.push(b.id);
  }
  return ids;
}
function warAt(K, exh = 100) {
  K.diplomacySystem.declareWar(EMP, 'player_action');
  const gs = K.gameState, ws = K.warSystem;
  const w = ws.getWarWith(EMP);
  gs.set('wars.' + w.id, { ...w, exhaustion: { player: exh, [EMP]: exh } }, 'wp4_fixture');
  return ws.getWarWith(EMP);
}

// ── Atrapa ctx: notuje napisy i pozwala przejść PRAWDZIWĄ ścieżką rysującą ──
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
/** Panel z wybraną wojną, po jednym przejściu `draw`. */
function drawPanel(K, opts = {}) {
  if (!WarOverlayMod?.WarOverlay) return null;
  const ov = new WarOverlayMod.WarOverlay();
  ov.visible = true;
  ov.show();
  if (opts.scroll != null) ov._scrollRight = opts.scroll;
  if (opts.selected) for (const id of opts.selected) ov._selected?.add?.(id);
  let ctx = mkCtx();
  // `passes` > 1: kolejne klatki TEGO SAMEGO panelu. Potrzebne, bo klamp scrolla na wejściu
  // korzysta z wysokości treści zapamiętanej w POPRZEDNIEJ klatce (pierwsza klatka nowego
  // panelu jej nie ma — wtedy klamp domyka się na końcu `_drawRight`, czyli po rysowaniu).
  const passes = Math.max(1, opts.passes ?? 1);
  for (let i = 0; i < passes; i++) { ctx = mkCtx(); ov.draw(ctx, 1280, 720); }
  return { ov, ctx };
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T0 — kontrola narzędzia');
{
  assert(stripComments('const a=1; // peaceTable\n/* peaceTable */').includes('peaceTable') === false,
    'T0a: `stripComments` zdejmuje oba rodzaje komentarzy');
  const K = boot();
  assert(!!K.colonyManager && !!K.warSystem && !!K.diplomacySystem && !!K.acceptanceEngine,
    'T0b: fixture stawia ŻYWY silnik (colonyManager + warSystem + diplomacySystem + acceptanceEngine)');
  assert(!!WarOverlayMod?.WarOverlay,
    'T0c: `WarOverlay` importuje się pod node — inaczej piny UI w tym pliku mierzyłyby ciszę');
  const K2 = boot(); giveAi(K2, 2); warAt(K2);
  const d = drawPanel(K2);
  assert(!!d && d.ctx.texts.length > 5 && d.ov._hitZones.length > 1,
    'T0d (KONTROLA PINU): panel REALNIE się narysował (napisy=' + (d?.ctx.texts.length ?? 0)
    + ', hit-zony=' + (d?.ov._hitZones.length ?? 0) + ') — bez tego brak przycisku myliłby się z brakiem rysowania');
  assert(TERRITORIAL_MAX_SHARE === 0.5 && TERRITORIAL_BASE_VALUE === 2,
    'T0e (KONTROLA PINU): stałe katalogu czytane z JEDNEGO źródła (MAX_SHARE=' + TERRITORIAL_MAX_SHARE
    + ', BASE=' + TERRITORIAL_BASE_VALUE + ') — T3 porównuje z nimi, nie z literałem');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T1 — RÓWNOŚĆ WYKONANIOWA: projekcja fasady vs `_buildTermsContext`');
{
  const K = boot(); const ai = giveAi(K, 3); const pl = givePlayer(K, 2); warAt(K);
  const ds = K.diplomacySystem;
  const table = ds.getPeaceTable?.(EMP) ?? null;
  assert(!!table && Array.isArray(table.demand) && Array.isArray(table.offer),
    'T1a: `getPeaceTable` istnieje i zwraca dwie listy (ŻĄDAM / OFERUJĘ)');

  const ids = (table?.demand ?? []).map(r => r.bodyId);
  assert(ids.length >= 3 && ai.every(id => ids.includes(id)),
    'T1b: lista ŻĄDAM zawiera WSZYSTKIE kolonie imperium (' + ids.length + ' wierszy) — '
    + 'bez tego równość niżej mogłaby przejść jałowo na pustym zbiorze');
  const plIds = (table?.offer ?? []).map(r => r.bodyId);
  assert(plIds.length >= 3 && pl.every(id => plIds.includes(id)),
    'T1c: lista OFERUJĘ zawiera kolonie gracza (' + plIds.length + ' wierszy, w tym dom)');

  // Ten sam zestaw ciał podany silnikowi WPROST — wiersz w wiersz.
  const cess = [
    ...ids.map(bodyId => ({ bodyId, fromEmpireId: EMP, toEmpireId: 'player' })),
    ...plIds.map(bodyId => ({ bodyId, fromEmpireId: 'player', toEmpireId: EMP })),
  ];
  const ctx = K.acceptanceEngine.buildContext('player', EMP, { verb: 'offer_peace', terms: { cessions: cess } });
  const byId = new Map((ctx?.terms?.cessions ?? []).map(r => [r.bodyId, r]));
  const all = [...(table?.demand ?? []), ...(table?.offer ?? [])];
  const devEq = all.length > 0 && all.every(r => byId.get(r.bodyId)?.devValue === r.devValue);
  const recEq = all.length > 0 && all.every(r => byId.get(r.bodyId)?.recaptured === r.recaptured);
  assert(devEq, 'T1d: `devValue` KAŻDEGO wiersza identyczny z `_buildTermsContext` (' + all.length + ' ciał) — jedna wycena, nie dwie');
  assert(recEq, 'T1e: `recaptured` KAŻDEGO wiersza identyczny z silnikiem');
  assert(table?.heldValue === (ctx?.terms?.heldValue ?? null),
    'T1f: `heldValue` z projekcji == `heldValue` silnika (' + table?.heldValue + ')');
  assert(typeof table?.heldValue === 'number' && table.heldValue > 0,
    'T1g (KONTROLA PINU): pula oddawalna jest LICZBĄ > 0 — inaczej T1f porównywałby null z null');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T2 — REGRESJA ZERO: pusty stół ⇒ `terms === null` (licznik odczytów świata)');
{
  const K = boot(); giveAi(K, 2); warAt(K);
  const ds = K.diplomacySystem, cm = K.colonyManager;

  // Licznik odczytów świata — ten sam przyrząd, którym WP-2 pinował regresję zero.
  const realGet = cm.getColony.bind(cm);
  let calls = 0;
  cm.getColony = (id) => { calls++; return realGet(id); };
  const before = calls;
  const r0 = ds.evaluatePeace(EMP, null);
  const noTerms = calls - before;
  const mid = calls;
  const r1 = ds.evaluatePeace(EMP, { cessions: [] });
  const emptyArr = calls - mid;
  cm.getColony = realGet;

  assert(r0?.blocked === false && typeof r0?.score === 'number',
    'T2a (KONTROLA PINU): propozycja BEZ warunków dalej się ocenia (score=' + r0?.score?.toFixed(2) + ')');
  assert(noTerms === 0,
    'T2b: `terms = null` ⇒ ZERO odczytów kolonii (zmierzone: ' + noTerms + ') — regresja zero z konstrukcji');
  assert(emptyArr === 0,
    'T2c: `cessions: []` ⇒ też ZERO odczytów (zmierzone: ' + emptyArr + ') — pusty stół jest tożsamy ze starym pokojem');
  assert(r1?.score === r0?.score,
    'T2d: wynik z pustym stołem IDENTYCZNY z wynikiem bez warunków (' + r0?.score?.toFixed(2) + ')');

  const uiSrc = readClean('ui', 'WarOverlay.js');
  assert(/offerPeace\s*\([^)]*terms/.test(uiSrc) || /terms\s*:/.test(uiSrc),
    'T2e (pin ŹRÓDŁOWY): panel przekazuje `terms` do `offerPeace` — bez tego stół byłby ozdobą');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T3 — SUFIT: `countsToCeiling` == reguła `territorial_ceiling`');
{
  const K = boot(); giveAi(K, 4); givePlayer(K, 2); warAt(K);
  const ds = K.diplomacySystem;
  const table = ds.getPeaceTable?.(EMP) ?? { demand: [], offer: [] };

  assert(table.ceiling != null && Math.abs(table.ceiling - TERRITORIAL_MAX_SHARE * table.heldValue) < 1e-9,
    'T3a: `ceiling` = MAX_SHARE × heldValue (' + table.ceiling + ' = ' + TERRITORIAL_MAX_SHARE + ' × ' + table.heldValue + ')');
  assert((table.offer ?? []).length > 0 && table.offer.every(r => r.countsToCeiling === false),
    'T3b: ciała GRACZA nigdy nie liczą się do sufitu imperium (sufit rządzi WŁASNYM terytorium oceniającego)');
  assert((table.demand ?? []).some(r => r.countsToCeiling === true),
    'T3c (KONTROLA PINU): przynajmniej jedno ciało imperium LICZY się do sufitu — inaczej T3d byłby jałowy');

  // RÓWNOWAŻNOŚĆ: suma `countsToCeiling` > ceiling  ⟺  silnik blokuje sufitem.
  const rows = (table.demand ?? []).filter(r => !r.capital);
  let checked = 0, agree = 0;
  const lim = Math.min(rows.length, 4);
  for (let mask = 1; mask < (1 << lim); mask++) {
    const pick = rows.filter((_, i) => i < lim && (mask & (1 << i)));
    if (pick.length === 0) continue;
    const sum = pick.filter(r => r.countsToCeiling).reduce((s, r) => s + r.devValue, 0);
    const res = ds.evaluatePeace(EMP, {
      cessions: pick.map(r => ({ bodyId: r.bodyId, fromEmpireId: EMP, toEmpireId: 'player' })),
    });
    const blockedByCeiling = res?.blocked === true && res?.reasonKey === 'diplo.reject.territoryNotNegotiable';
    checked++;
    if (blockedByCeiling === (sum > table.ceiling + 1e-9)) agree++;
  }
  assert(checked >= 3 && agree === checked,
    'T3d: dla KAŻDEGO zestawu (' + checked + ' sprawdzonych) „suma countsToCeiling > ceiling" ⟺ '
    + 'blokada `territoryNotNegotiable` — panel nie ma drugiej definicji sufitu (zgodnych: ' + agree + ')');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T4 — STOLICA po OBU stronach (silnik + znacznik domu gracza)');
{
  const K = boot(); giveAi(K, 3); givePlayer(K, 2); warAt(K);
  const ds = K.diplomacySystem, cm = K.colonyManager;
  const table = ds.getPeaceTable?.(EMP) ?? { demand: [], offer: [] };

  const aiCapital = K.directorProduction?.capitalOf?.(EMP)?.planetId ?? null;
  assert(aiCapital != null && (table.demand ?? []).some(r => r.bodyId === aiCapital && r.capital === true),
    'T4a: stolica imperium oznaczona `capital` (kanon `DirectorProduction.capitalOf`, ' + aiCapital + ')');
  assert((table.demand ?? []).filter(r => r.capital).length === 1,
    'T4b: DOKŁADNIE jedna stolica po stronie imperium (' + (table.demand ?? []).filter(r => r.capital).length + ')');

  const home = cm.getPlayerColonies().find(c => c.isHomePlanet)?.planetId ?? null;
  assert(home != null && (table.offer ?? []).some(r => r.bodyId === home && r.capital === true),
    'T4c: dom GRACZA też oznaczony `capital` — silnik liczy `capital` tylko wobec OCENIAJĄCEGO, '
    + 'więc znacznik domu gracza musi dojść z `isHomePlanet` (' + home + ')');
  assert((table.offer ?? []).filter(r => r.capital).length === 1,
    'T4d: dokładnie jeden dom gracza (' + (table.offer ?? []).filter(r => r.capital).length + ')');

  const res = ds.evaluatePeace(EMP, { cessions: [{ bodyId: aiCapital, fromEmpireId: EMP, toEmpireId: 'player' }] });
  assert(res?.blocked === true && res?.reasonKey === 'diplo.reject.capitalNotNegotiable',
    'T4e (KONTROLA PINU): żądanie stolicy imperium = blokada `capitalNotNegotiable` — dlatego wiersz jest wyszarzony');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T5 — zwrot ZDOBYCZY jest tańszy (i projekcja to pokazuje)');
{
  const K = boot(); giveAi(K, 3); const pl = givePlayer(K, 2); const w = warAt(K);
  const ds = K.diplomacySystem, cm = K.colonyManager, ws = K.warSystem;

  // Ciało gracza przechodzi w ręce AI ŚCIEŻKĄ PRODUKCYJNĄ → wpis w księdze.
  const victim = pl[0];
  cm.transferColony(victim, EMP, 'ground_invasion');
  const caps = ws.getCaptures(w.id);
  assert(caps.some(e => e.bodyId === victim && e.toEmpireId === EMP),
    'T5a (KONTROLA PINU): księga zdobyczy dostała wpis (' + caps.length + ') — bez niego `recaptured` byłby wszędzie false');

  const table = ds.getPeaceTable?.(EMP) ?? { demand: [] };
  const row = (table.demand ?? []).find(r => r.bodyId === victim) ?? null;
  assert(row?.recaptured === true,
    'T5b: odzyskanie WŁASNEGO ciała jest oznaczone `recaptured` (to jest „oddaj, co zdobyłeś")');
  assert(row?.countsToCeiling === false,
    'T5c: zwrot zdobyczy NIE liczy się do sufitu — wypada po obu stronach nierówności (jedna zasada, nie wyjątek)');

  const other = (table.demand ?? []).find(r => !r.recaptured && !r.capital) ?? null;
  if (row && other) {
    const scoreRec = ds.evaluatePeace(EMP, { cessions: [{ bodyId: row.bodyId, fromEmpireId: EMP, toEmpireId: 'player' }] })?.score ?? 0;
    const scoreNew = ds.evaluatePeace(EMP, { cessions: [{ bodyId: other.bodyId, fromEmpireId: EMP, toEmpireId: 'player' }] })?.score ?? 0;
    assert(scoreRec > scoreNew,
      'T5d: żądanie zwrotu zdobyczy boli imperium MNIEJ niż żądanie jego własnego ciała ('
      + scoreRec.toFixed(2) + ' > ' + scoreNew.toFixed(2) + ')');
  } else {
    assert(false, 'T5d: fixture nie dał pary (zdobycz, własne ciało) — pin nie ma na czym mierzyć');
  }
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T6 — tło-absorber stołu OSTATNI w `_hitZones` (bo `_hitTest` to `.find()`)');
{
  const K = boot(); giveAi(K, 3); givePlayer(K, 2); warAt(K);
  const d = drawPanel(K);
  const zones = d?.ov?._hitZones ?? [];
  const types = zones.map(z => z.type);
  const rowsN = types.filter(t => t === 'peace_toggle').length;
  assert(rowsN > 0, 'T6a: stół wystawia klikalne wiersze (`peace_toggle`) — ' + rowsN + ' szt.');
  const bgIdx = types.lastIndexOf('peace_bg');
  assert(bgIdx >= 0 && bgIdx === types.length - 1,
    'T6b: absorber `peace_bg` jest OSTATNI (indeks ' + bgIdx + ' z ' + types.length + ') — inaczej pochłaniałby kliki wierszy');
  const row = zones.find(z => z.type === 'peace_toggle');
  const hit = row ? d.ov._hitTest(row.x + 2, row.y + 2) : null;
  assert(hit?.type === 'peace_toggle',
    'T6c (WYKONANIOWO): klik w wiersz stołu rozstrzyga się na wierszu, nie na absorberze (trafiono: ' + hit?.type + ')');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T7 — P14: UI NADAL nie importuje silnika akceptacji');
{
  const hits = [];
  for (const f of uiFiles()) {
    const src = stripComments(norm(readFileSync(f, 'utf8')));
    if (/from\s+'[^']*Acceptance(Engine|Math|WeightData)\.js'/.test(src)) hits.push(basename(f));
  }
  assert(hits.length === 0,
    'T7a (pin ŹRÓDŁOWY): żaden plik `src/ui/` nie importuje `Acceptance*`'
    + (hits.length ? ' — nieoczekiwane: ' + hits.join(', ') : '') + ' (P14 zostaje zielony)');
  const dsSrc = readClean('systems', 'DiplomacySystem.js');
  assert(/getPeaceTable\s*\(/.test(dsSrc),
    'T7b (pin ŹRÓDŁOWY): projekcja stołu mieszka w FASADZIE — tam, gdzie wolno importować silnik');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T8 — F-a: scroll prawej kolumny REALNIE czytany w `draw`');
{
  const K = boot(); giveAi(K, 8); givePlayer(K, 6); warAt(K);

  const uiSrc = readClean('ui', 'WarOverlay.js');
  const drawRightBody = methodBody(uiSrc, '_drawRight');
  assert(drawRightBody.length > 200 && /handleScroll/.test(drawRightBody) === false,
    'T8a0 (KONTROLA PINU): okno źródła to CIAŁO `_drawRight` (' + drawRightBody.length
    + ' zn.), bez `handleScroll` — inaczej T8a łapałby jedyne dzisiejsze wystąpienie pola');
  assert(/_scrollRight/.test(drawRightBody),
    'T8a (pin ŹRÓDŁOWY): `_drawRight` odwołuje się do `_scrollRight` — do C1 pole było wyłącznie ZAPISYWANE');

  const a = drawPanel(K, { scroll: 0 });
  const b = drawPanel(K, { scroll: 60 });
  const row0 = (a?.ov?._hitZones ?? []).find(z => z.type === 'peace_toggle') ?? null;
  const row1 = (b?.ov?._hitZones ?? []).find(z => z.type === 'peace_toggle') ?? null;
  assert(row0 && row1 && Math.abs((row0.y - row1.y) - 60) < 1.5,
    'T8b (WYKONANIOWO): przewinięcie o 60 px przesuwa wiersze stołu o 60 px w górę (Δ='
    + (row0 && row1 ? (row0.y - row1.y).toFixed(1) : 'n/d') + ')');

  const bounds = b ? b.ov._getOverlayBounds(1280, 720) : null;
  const tableZones = bounds ? (b.ov._hitZones ?? []).filter(z => z.type === 'peace_toggle') : [];
  const above = tableZones.filter(z => z.y + z.h < bounds.oy);
  // ⚠ ŚWIADEK OBOWIĄZKOWY: filtr na PUSTYM zbiorze przechodzi jałowo (pierwszy przebieg
  //   tego keepera świecił tu zielono dokładnie tam, gdzie stołu w ogóle nie było).
  assert(tableZones.length > 0 && above.length === 0,
    'T8c: stół ma hit-zony (' + tableZones.length + ') i ŻADNA nie zostaje NAD obszarem panelu '
    + 'po przewinięciu (znaleziono ' + above.length + ')');

  const big = drawPanel(K, { scroll: 99999 });
  assert(big && big.ov._scrollRight < 99999,
    'T8d: scroll jest CLAMPOWANY do treści (po żądaniu 99999 zostało ' + big?.ov?._scrollRight + ')');
  // ⚠ Pin mierzy STABILIZACJĘ, nie natychmiastowość: klamp na wejściu potrzebuje wysokości
  //   treści z poprzedniej klatki, więc absurdalny scroll wniesiony PRZED pierwszym
  //   rysowaniem daje jedną klatkę bez treści (i bez hit-zon — `pruneZones`). Druga klatka
  //   musi być już poprawna; gdyby nie była, panel zostawałby martwy po szybkim kółku.
  const big2 = drawPanel(K, { scroll: 99999, passes: 2 });
  const zonesBig = (big2?.ov?._hitZones ?? []).filter(z => z.type === 'peace_toggle');
  assert(zonesBig.length > 0 && big2.ov._scrollRight < 99999,
    'T8e: po jednej klatce panel WRACA do stanu klikalnego (wiersze=' + zonesBig.length
    + ', scroll=' + big2?.ov?._scrollRight + ') — szybkie kółko nie zabija hit-zon na stałe');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T9 — klik zaznacza, przycisk wysyła DOKŁADNIE zaznaczone warunki');
{
  const K = boot(); giveAi(K, 3); givePlayer(K, 2); warAt(K);
  const ds = K.diplomacySystem;
  const d = drawPanel(K);
  const ov = d?.ov ?? null;

  const row = (ov?._hitZones ?? []).find(z => z.type === 'peace_toggle' && z.data?.bodyId && !z.data?.locked) ?? null;
  assert(!!row, 'T9a (KONTROLA PINU): stół ma choć jeden wiersz KLIKALNY (niezablokowany)');
  if (row) {
    ov._onHit(row);
    assert(ov._selected?.has?.(row.data.bodyId) === true, 'T9b: klik dodaje ciało do warunków');
    ov._onHit(row);
    assert(ov._selected?.has?.(row.data.bodyId) === false, 'T9c: powtórny klik je zdejmuje (toggle)');
    ov._onHit(row);
  } else {
    assert(false, 'T9b: brak wiersza — nie ma czego klikać');
    assert(false, 'T9c: brak wiersza — nie ma czego odklikać');
  }

  let seen = null;
  const real = ds.offerPeace.bind(ds);
  ds.offerPeace = (e, r, opts) => { seen = { e, r, opts }; return false; };
  const btn = (ov?._hitZones ?? []).find(z => z.type === 'offer_peace') ?? null;
  assert(!!btn, 'T9d (KONTROLA PINU): przycisk pokoju istnieje w hit-zonach');
  if (btn) ov._onHit(btn);
  ds.offerPeace = real;

  const cess = seen?.opts?.terms?.cessions ?? null;
  assert(Array.isArray(cess) && cess.length === 1 && cess[0].bodyId === row?.data?.bodyId,
    'T9e: `offerPeace` dostaje DOKŁADNIE zaznaczone ciało (' + JSON.stringify(cess) + ')');
  assert(cess?.[0]?.fromEmpireId === EMP && cess?.[0]?.toEmpireId === 'player',
    'T9f: kierunek wypełniony przez panel (żądanie = od imperium do gracza) — silnik go NIE zgaduje');

  // Pusty stół = stary pokój: `terms` musi być NULL, nie pustą tablicą.
  const d2 = drawPanel(K);
  let seen2 = null;
  const real2 = ds.offerPeace.bind(ds);
  ds.offerPeace = (e, r, opts) => { seen2 = { e, r, opts }; return false; };
  const btn2 = (d2?.ov?._hitZones ?? []).find(z => z.type === 'offer_peace') ?? null;
  if (btn2) d2.ov._onHit(btn2);
  ds.offerPeace = real2;
  assert(seen2 != null && (seen2.opts?.terms ?? null) === null,
    'T9g: pusty stół ⇒ `terms === null` (nie `{cessions: []}`) — dosłownie dzisiejsze wywołanie');
}

// ════════════════════════════════════════════════════════════════════════════
console.log('T10 — i18n: klucze stołu w OBU słownikach');
{
  const pl = readRaw('i18n', 'pl.js');
  const en = readRaw('i18n', 'en.js');
  const KEYS = [
    'peaceTable.title', 'peaceTable.demand', 'peaceTable.offer', 'peaceTable.capitalLocked',
    'peaceTable.ceiling', 'peaceTable.ceilingExceeded', 'peaceTable.recaptured',
    'peaceTable.empty', 'peaceTable.devValue', 'peaceTable.clear', 'peaceTable.hint',
  ];
  const miss = KEYS.filter(k => !pl.includes("'" + k + "'") || !en.includes("'" + k + "'"));
  assert(miss.length === 0,
    'T10a: wszystkie klucze stołu w pl I en' + (miss.length ? ' — brakuje: ' + miss.join(', ') : ' (' + KEYS.length + ')'));
  const uiSrc = readClean('ui', 'WarOverlay.js');
  const literals = (uiSrc.match(/fillText\(\s*'[^']*[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ][^']*'/g) ?? []);
  assert(literals.length === 0,
    'T10b: żaden polski literał nie idzie do `fillText` w panelu Wojny'
    + (literals.length ? ' — ' + literals.slice(0, 2).join(' | ') : ''));
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
