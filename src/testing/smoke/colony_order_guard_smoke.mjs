// D4 / OG-4 — keeper bramki ROZKAZÓW PANELU KOLONII.
//
// PO CO: `docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md` §D4 (PODPISANA: W3 + „flash z powodem",
// nie „schowaj"). Panel kolonii rysował na CUDZEJ koloni pełen zestaw rozkazów: 8 etykiet
// pływającego panelu budowy (`_drawFloatingPanel`) + 6 etykiet zakładki Załoga (`_drawWorkforceTab`).
//
// ⚠ DLACZEGO TO NIE DUBLUJE OG-3: `_onHit` mutuje `colony.civSystem` / `colony.buildingSystem`
//   BEZPOŚREDNIO (`setStrataFocus`, `setStrataTarget`, droidy), więc bramki szyny z D2 tych klików
//   NIE WIDZĄ. A D1 ich nie zasłania, bo podgląd obcej planety idzie przez `show({colonyId})`,
//   które świadomie nie woła `switchActiveColony`.
//
// ⚠ DWA RODZAJE PINÓW W TYM PLIKU — i granica jest ostra:
//   • T1-T6 = WYKONANIE czystego modułu `ColonyOrderGuard.js` (tablica decyzji);
//   • T7-T9 = pin ŹRÓDŁOWY na `ColonyOverlay.js`, który NIE IMPORTUJE SIĘ POD NODE (wywraca się
//     na `THREE.TextureLoader`). Pin źródłowy czyta kod BEZ komentarzy — inaczej łapie własne
//     wyjaśnienie — i ma kontrolę pinu.
//
// Uruchom: node src/testing/smoke/colony_order_guard_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (inaczej `localStorage is not defined`)
import fs from 'node:fs';
import {
  ALWAYS_ALLOWED_HITS, canIssueColonyOrders, isColonyOrderBlocked,
} from '../../ui/ColonyOrderGuard.js';
import { GameCore } from '../headless/GameCore.js';
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { BUILDINGS } from '../../data/BuildingsData.js';
import { PlanetMapGenerator } from '../../map/PlanetMapGenerator.js';
import PL from '../../i18n/pl.js';
import EN from '../../i18n/en.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const MINE    = { planetId: 'p_me' };                          // brak ownerEmpireId => gracz
const MINE2   = { planetId: 'p_me2', ownerEmpireId: 'player' };  // jawny stempel gracza
const THEIRS  = { planetId: 'p_ai', ownerEmpireId: 'emp_001' };

// Etykiety mutujące, wymienione w planie jako „14 etykiet" (8 + 6).
const FLOATING_PANEL_ORDERS = [
  'build', 'upgrade', 'demolish', 'setDesignation',
  'installSynthetic', 'removeSynthetic', 'autonomizeBuilding', 'cancelPending',
];
const WORKFORCE_ORDERS = [
  'focusMinus', 'focusPlus', 'targetMinus', 'targetPlus', 'droidInstall', 'droidRemove',
];

// ── T1 — 14 etykiet zablokowanych na cudzej koloni ────────────────────────────────────────
console.log('T1 — 14 etykiet rozkazu ODRZUCONYCH na koloni, która nie należy do gracza');
{
  const all = [...FLOATING_PANEL_ORDERS, ...WORKFORCE_ORDERS];
  assert(all.length === 14, 'T1 przesłanka: dokładnie 14 etykiet (8 panel budowy + 6 Załoga)');
  const blocked = all.filter(h => isColonyOrderBlocked(h, THEIRS));
  assert(blocked.length === 14, `T1: wszystkie 14 zablokowane (jest ${blocked.length})`);
}

// ── T2 — KONTROLA PINU: te same etykiety na WŁASNEJ koloni przechodzą ─────────────────────
console.log('T2 (KONTROLA PINU) — te same 14 etykiet na koloni gracza PRZECHODZI');
{
  const all = [...FLOATING_PANEL_ORDERS, ...WORKFORCE_ORDERS];
  assert(all.every(h => !isColonyOrderBlocked(h, MINE)), 'T2: kolonia bez `ownerEmpireId` — nic nie blokowane');
  assert(all.every(h => !isColonyOrderBlocked(h, MINE2)), 'T2: kolonia ze stemplem `player` — nic nie blokowane');
}

// ── T3 — allowlista: nawigacja, dowodzenie desantem, absorbery ────────────────────────────
console.log('T3 — allowlista przechodzi NAWET na cudzej koloni');
{
  assert(!isColonyOrderBlocked('close', THEIRS),
    'T3: `close` wolne — inaczej gracz, który zrzucił desant, NIE ZAMKNIE panelu');
  const command = ['unitSurvey', 'unitAttack', 'unitDeploy', 'armyCreate', 'armySplit',
                   'stackRowClick', 'drawerOpenGroup'];
  assert(command.every(h => !isColonyOrderBlocked(h, THEIRS)),
    'T3: warstwa dowodzenia desantem wolna — zakres po `unit.owner`, nie po koloni');
  const absorbers = ['station_mgmt_picker_close', 'station_mgmt_picker_bg',
                     'station_mgmt_shippicker_close', 'station_mgmt_shippicker_bg'];
  assert(absorbers.every(h => !isColonyOrderBlocked(h, THEIRS)),
    'T3: absorbery/zamknięcia modali wolne — modal musi dać się zamknąć');
  assert(['infoTab', 'colonyTab', 'deselectHex', 'floatPanel'].every(h => !isColonyOrderBlocked(h, THEIRS)),
    'T3: nawigacja i czytanie wolne — zakładka Załoga zostaje CZYTELNYM WYWIADEM');
}

// ── T4 — ALLOWLISTA, NIE BLOKLISTA (domyślna odmowa dla nowej etykiety) ───────────────────
console.log('T4 — nowa, nieznana etykieta jest domyślnie ZABLOKOWANA');
{
  assert(isColonyOrderBlocked('jakis_przyszly_rozkaz_2027', THEIRS),
    'T4: nieznana etykieta odrzucona na cudzej koloni (inwariant przeżyje zapominalskiego producenta)');
  assert(!isColonyOrderBlocked('jakis_przyszly_rozkaz_2027', MINE),
    'T4 (kontrola pinu): ta sama nieznana etykieta na własnej koloni przechodzi');
}

// ── T5 — FAIL-OPEN przy braku koloni ──────────────────────────────────────────────────────
console.log('T5 (FAIL-OPEN) — brak koloni nie blokuje niczego');
{
  assert(canIssueColonyOrders(null) === true, 'T5: `canIssueColonyOrders(null)` => true');
  assert(!isColonyOrderBlocked('build', null),
    'T5: podgląd planety bez koloni ma WŁASNE bramki (`!isPreview`), termin własności nie orzeka');
  assert(canIssueColonyOrders(THEIRS) === false, 'T5 (kontrola pinu): cudza kolonia => false');
}

// ── T6 — allowlista nie przecieka na rozkazy ──────────────────────────────────────────────
console.log('T6 — żadna etykieta rozkazu nie siedzi przypadkiem w allowliście');
{
  const leaked = [...FLOATING_PANEL_ORDERS, ...WORKFORCE_ORDERS, 'draft_open',
                  'station_build', 'station_cancel_order', 'station_mgmt_demolish']
    .filter(h => ALWAYS_ALLOWED_HITS.has(h));
  assert(leaked.length === 0, `T6: zero przecieków (znalezione: ${leaked.join(', ') || 'brak'})`);
}

// ── T7 — PIN ŹRÓDŁOWY: inwariant na GÓRZE `_onHit` ────────────────────────────────────────
console.log('T7 (PIN ŹRÓDŁOWY) — `_onHit` konsultuje bramkę PRZED `switch`');
{
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = strip(fs.readFileSync(new URL('../../ui/ColonyOverlay.js', import.meta.url), 'utf8'));

  const at = src.indexOf('_onHit(zone) {');
  assert(at > 0, 'T7 przesłanka: `_onHit(zone)` istnieje w źródle');
  const head = src.slice(at, src.indexOf('switch (zone.type)', at));
  assert(/isColonyOrderBlocked\s*\(/.test(head),
    'T7: bramka wołana PRZED `switch` — inwariant, nie kolejny `case`');
  assert(/_showFlash\s*\(/.test(head) && /ui\.notYourColony/.test(head),
    'T7: odmowa jest GŁOŚNA i przetłumaczona (flash z kluczem i18n, nie surowy token)');

  // KONTROLA PINU — kotwica nie zniknęła i nie łapiemy własnego komentarza.
  assert(head.length > 0 && head.length < 4000, 'T7 (kontrola pinu): nagłówek `_onHit` ma sensowny rozmiar');
  assert(!/\/\//.test(head), 'T7 (kontrola pinu): komentarze faktycznie zdjęte przed dopasowaniem');
}

// ── T8 — PIN ŹRÓDŁOWY: dwaj producenci konsultują bramkę ──────────────────────────────────
console.log('T8 (PIN ŹRÓDŁOWY) — obaj producenci pytają o prawo do rozkazu');
{
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = strip(fs.readFileSync(new URL('../../ui/ColonyOverlay.js', import.meta.url), 'utf8'));

  const cut = (name) => {
    const a = src.indexOf(name);
    return a < 0 ? '' : src.slice(a, a + 26000);
  };
  const floating = cut('_drawFloatingPanel(ctx, x, y, tile, colony, grid) {');
  const wfLive   = cut('_drawWorkforceTableV2(ctx, x, y, w, colony, civ) {');
  const wfLegacy = cut('_drawWorkforceTab(ctx, x, y, w, h, colony, civ) {');

  assert(/canIssueColonyOrders\s*\(/.test(floating),
    'T8: `_drawFloatingPanel` (8 etykiet budowy) konsultuje bramkę');

  // ⚠ ŚCIEŻKA ŻYWA TO `_drawWorkforceTableV2`, NIE `_drawWorkforceTab`. Pierwsza wersja tego pinu
  //   celowała w legacy V1 (`popAllocation2 === false`) i PRZESZŁA NA ZIELONO, podczas gdy żywa
  //   tabela nie miała deklaracji `ordersOk` i rzuciłaby `ReferenceError` przy pierwszym rysowaniu.
  //   `node --check` tego NIE łapie — składnia jest poprawna. Stąd dwa osobne piny plus kontrola,
  //   że każda funkcja UŻYWAJĄCA `ordersOk` sama je DEKLARUJE.
  assert(/canIssueColonyOrders\s*\(/.test(wfLive),
    'T8: `_drawWorkforceTableV2` (ŚCIEŻKA ŻYWA) konsultuje bramkę');
  assert(/canIssueColonyOrders\s*\(/.test(wfLegacy),
    'T8: `_drawWorkforceTab` (legacy V1) też konsultuje bramkę');
  assert(floating.length > 1000 && wfLive.length > 1000 && wfLegacy.length > 1000,
    'T8 (kontrola pinu): wszystkie trzy kotwice funkcji faktycznie znalezione');

  // Każde użycie `ordersOk` musi mieć deklarację w TEJ SAMEJ funkcji — inaczej ReferenceError.
  const fns = src.split(/\n  (?=[_a-zA-Z][\w]*\()/);
  const orphan = fns.filter(f => /\bordersOk\b/.test(f) && !/const\s+ordersOk\s*=/.test(f));
  assert(orphan.length === 0,
    `T8: żadna funkcja nie używa \`ordersOk\` bez deklaracji (osieroconych: ${orphan.length})`);
}

// ── T9 — PIN ŹRÓDŁOWY: bramka NIE stoi w miejscach zakazanych ─────────────────────────────
console.log('T9 (PIN ŹRÓDŁOWY) — bramka nie wchodzi w ścieżki trybów ZAPROJEKTOWANYCH');
{
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = strip(fs.readFileSync(new URL('../../ui/ColonyOverlay.js', import.meta.url), 'utf8'));

  // `_getColony` i `_screenToTile` są WSPÓLNE dla lądowania, ostrzału i zrzutu — bramka tam
  // kosztowałaby zaprojektowane przepływy (plan §D4, ograniczenie projektowe).
  const guardIn = (name, len) => {
    const a = src.indexOf(name);
    if (a < 0) return false;
    return /isColonyOrderBlocked|canIssueColonyOrders/.test(src.slice(a, a + len));
  };
  assert(!guardIn('_getColony() {', 900), 'T9: bramki NIE ma w `_getColony`');
  assert(!guardIn('_screenToTile(', 900), 'T9: bramki NIE ma w `_screenToTile`');
  assert(src.indexOf('_getColony() {') > 0 && src.indexOf('_screenToTile(') > 0,
    'T9 (kontrola pinu): obie kotwice istnieją — pin nie przechodzi „bo nie znalazł"');
}

// ── T10 — i18n ────────────────────────────────────────────────────────────────────────────
console.log('T10 — powód odmowy przez i18n (PL + EN), własny klucz');
{
  const KEY = 'ui.notYourColony';
  assert(typeof PL[KEY] === 'string' && PL[KEY].length > 0, 'T10: klucz istnieje w PL');
  assert(typeof EN[KEY] === 'string' && EN[KEY].length > 0, 'T10: klucz istnieje w EN');
  assert(PL[KEY] !== EN[KEY], 'T10: PL i EN to różne napisy');
  assert(PL[KEY] !== PL['transportOrder.reason_not_player_colony'],
    'T10: własny klucz, nie reuse `transportOrder.*` — inne UI nie przemianuje flasha panelu kolonii');
}

// ══ GATE 2 (D4) — WERYFIKACJA HEADLESS ══════════════════════════════════════════════════════
//
// ⚠ GRANICA DOWODU — CZYTAJ ZANIM UZNASZ GATE ZA ZDANY. `ColonyOverlay.js` NIE IMPORTUJE SIĘ POD
//   NODE (zmierzone: `PlanetTextureUtils.js:16` robi `new THREE.TextureLoader()` na poziomie
//   modułu, a stub `three` w `node_modules/` — GITIGNOROWANY — tego symbolu nie ma). Nie da się
//   więc wykonać PRAWDZIWEGO `_onHit` ani niczego narysować. Podniesienie stuba dałoby zieleń
//   TYLKO na tej maszynie, więc jest odrzucone jako fałszywy dowód.
//   ⇒ Punkty renderowania (G1, G3) i sam przebieg `_onHit` = **pin ŹRÓDŁOWY + live-gate**.
//   ⇒ Punkty decyzji (G2, G4, G5, G6) = **WYKONANIE** — pełne, na prawdziwych systemach.
//
// ⚠ CO CZYNI TĘ WERYFIKACJĘ MOCNĄ MIMO TEJ GRANICY: zmierzone, że **11 z 14 etykiet rozkazu
//   mutuje kolonię BEZPOŚREDNIO** (`setStrataFocus`, `setStrataTarget`, `setBuildingDesignation`,
//   `installSyntheticForStrata`, `removeSynthetic`, `autonomizeBuilding`, `cancelPending`), więc
//   dla nich **D4 jest JEDYNĄ bramką** — nie ma zapasowej. G2b dowodzi tego wykonaniem: te same
//   mutatory wołane wprost na koloni AI ZMIENIAJĄ jej stan. Pozostałe trzy (`build`, `upgrade`,
//   `demolish`) idą szyną i mają zapasową bramkę przynależności kafla z OG-1.

console.log('G1 (GRANICA DOWODU) — zakładka Załoga ZOSTAJE na cudzej koloni [pin ŹRÓDŁOWY]');
{
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = strip(fs.readFileSync(new URL('../../ui/ColonyOverlay.js', import.meta.url), 'utf8'));
  const m = src.match(/const canWorkforce = ([^;]+);/);
  assert(!!m, 'G1 przesłanka: `canWorkforce` istnieje w źródle');
  assert(!/ownerEmpireId|isTestEnemy|isPlayerColony|canIssueColonyOrders/.test(m[1]),
    'G1: `canWorkforce` NIE ma terminu własności ⇒ zakładka renderuje się także na koloni AI ' +
    '(podpisane „pokaż zablokowane", nie „schowaj")');
  assert(/_drawWorkforceTableV2\s*\(/.test(src), 'G1 (kontrola pinu): żywa tabela Załogi jest wołana');
}

console.log('G2a (WYKONANIE) — 14 etykiet rozkazu odrzuconych na cudzej, przechodzi na własnej');
{
  const ORDERS = [...FLOATING_PANEL_ORDERS, ...WORKFORCE_ORDERS];
  assert(ORDERS.every(h => isColonyOrderBlocked(h, THEIRS)), 'G2a: wszystkie 14 zablokowane na koloni AI');
  assert(ORDERS.every(h => !isColonyOrderBlocked(h, MINE)),  'G2a (kontrola): te same 14 wolne na własnej');
}

console.log('G2b (WYKONANIE) — dowód, że bramka jest NOŚNA: mutatory działają bez niej');
{
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  window.KOSMOS.civMode = true;
  const cm = core.colonyManager;
  const home = window.KOSMOS.homePlanet;
  const body = EntityManager.getAll().find(e =>
    e.systemId === home.systemId && e.id !== home.id &&
    (e.type === 'planet' || e.type === 'moon') && !cm.getColony(e.id));
  const ai = cm.getColony(cm.createColony(body.id, { Fe: 500 }, 8, 0, 'emp_001').planetId);
  assert(ColonyManager.isPlayerColony(ai) === false, 'G2b przesłanka: kolonia testowa należy do AI');

  const civ = ai.civSystem;
  const types = (civ.getWorkforceBreakdown?.() ?? []).map(r => r.type);
  assert(types.length > 0, 'G2b przesłanka: kolonia AI ma warstwy zatrudnienia');

  // `case 'targetMinus'/'targetPlus'` woła DOKŁADNIE to — bez pośrednictwa szyny.
  let targetMoved = false;
  for (const ty of types) {
    const before = civ.getStrataTarget?.(ty) ?? 0;
    civ.setStrataTarget?.(ty, before + 0.05);
    if ((civ.getStrataTarget?.(ty) ?? 0) !== before) { targetMoved = true; break; }
  }
  assert(targetMoved,
    'G2b: `setStrataTarget` na koloni AI ZMIENIA jej stan ⇒ nic poza D4 tego nie zatrzymuje');

  // `case 'focusMinus'/'focusPlus'` — ⚠ WYMAGA ETATÓW. Zmierzone: świeża kolonia (AI i gracza)
  //   ma `jobs = 0` na KAŻDEJ warstwie, więc `focusCap = 0` i `setStrataFocus` klampuje się do zera.
  //   Osłabienie asercji („albo cap=0") ukryłoby, że focus w ogóle nie został sprawdzony — zamiast
  //   tego dajemy koloni AI budynek i mierzymy na stanie, w którym suwak ma sens.
  {
    const bAI = ai.buildingSystem;
    if (!bAI._grid && ai.planet) {
      const g = PlanetMapGenerator.generate(ai.planet, false);
      bAI._grid = g; bAI._gridHeight = g.height ?? 10; ai.grid = g;
    }
    ai.resourceSystem.receive({
      Fe: 99999, C: 99999, Si: 99999, Cu: 99999, Ti: 99999, Al: 99999,
      structural_alloys: 9999, extraction_systems: 9999, power_cells: 9999,
      conductor_bundles: 9999, electronic_systems: 9999, polymer_composites: 9999,
    });
    const bid = Object.values(BUILDINGS).find(b => !b.requires && !b.isCapital && (b.jobs ?? 0) > 0)?.id;
    let tile = null;
    bAI._grid.forEach(t => {
      if (tile || t.buildingId || t.underConstruction || t.pendingBuild) return;
      if (!bAI._canBuildOnTile(t, BUILDINGS[bid])) return;
      tile = t;
    });
    if (tile) { bAI._build(tile, bid); bAI._tickConstruction(50); }

    const withJobs = (civ.getWorkforceBreakdown?.() ?? []).filter(r => (r.focusCap ?? 0) > 0);
    assert(withJobs.length > 0,
      'G2b przesłanka: kolonia AI ma teraz warstwę z etatami (focusCap > 0) — inaczej suwak jest bez znaczenia');

    let focusMoved = false;
    for (const r of withJobs) {
      const before = civ.getStrataFocus?.(r.type) ?? 0;
      civ.setStrataFocus?.(r.type, before + 1);
      if ((civ.getStrataFocus?.(r.type) ?? 0) !== before) { focusMoved = true; break; }
    }
    assert(focusMoved,
      'G2b: `setStrataFocus` na koloni AI ZMIENIA jej stan ⇒ nic poza D4 tego nie zatrzymuje');
  }

  assert(typeof ai.buildingSystem?.setBuildingDesignation === 'function'
      && typeof ai.buildingSystem?.installSyntheticForStrata === 'function',
    'G2b: pozostałe mutatory (`setBuildingDesignation`, `installSyntheticForStrata`) są ' +
    'wołane na `colony.buildingSystem` wprost — ta sama klasa, ta sama jedyna bramka');
}

console.log('G3 (GRANICA DOWODU) — rozkazy WYGASZONE, nie usunięte [pin ŹRÓDŁOWY]');
{
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = strip(fs.readFileSync(new URL('../../ui/ColonyOverlay.js', import.meta.url), 'utf8'));
  assert(/const locked = entry\.locked \|\| !ordersOk;/.test(src),
    'G3: wiersze budowy dziedziczą istniejący idiom `locked` (🔒 + wyszarzenie)');
  assert(/ordersOk \? '#1a6e50' : /.test(src) && /ordersOk \? '#6e1a1a' : /.test(src),
    'G3: przyciski Ulepsz/Rozbiórka wygaszone, nie usunięte');
  assert(/\(tgtOff \|\| !ordersOk\)/.test(src) && /\(canRemove && ordersOk\)/.test(src),
    'G3: steppery target/droid wygaszone w ŻYWEJ tabeli');
  // Kluczowe: hit-zony ZOSTAJĄ — inaczej odmowa byłaby cicha (podpis odrzucił „cicho zignoruj").
  assert(/_addHit\([^;]*'build'/.test(src) && /_addHit\([^;]*'targetMinus'/.test(src),
    'G3: hit-zony rozkazów nadal rejestrowane ⇒ klik dostaje FLASH, nie ciszę');
}

console.log('G4 (WYKONANIE + pin) — tryby ZAPROJEKTOWANE nie przechodzą przez bramkę');
{
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = strip(fs.readFileSync(new URL('../../ui/ColonyOverlay.js', import.meta.url), 'utf8'));

  // Lądowanie / ostrzał / zrzut to kliki MAPY bez hit-zony: `handleClick` obsługuje je DOPIERO
  // po `if (hit) { this._onHit(hit); return true; }`, więc inwariant ich nie dotyka.
  const hitFirst = src.indexOf('this._onHit(hit); return true;');
  const landing  = src.indexOf('this._landingMode && tile');
  assert(hitFirst > 0 && landing > hitFirst,
    'G4: tryby zaprojektowane obsługiwane PO gałęzi hit-zon ⇒ inwariant ich nie widzi');
  // ⚠ NAZWY ZMIERZONE, NIE ZGADNIĘTE: `_landingMode` (Away Team), `_strikeMode` (ostrzał
  //   orbitalny), `_dropMode` (zrzut desantu). Pierwsza wersja tego pinu zgadywała
  //   `_bombardMode`/`_orbitalStrikeMode` i PADŁA — dokładnie po to jest kontrola pinu.
  const MODES = ['_landingMode', '_strikeMode', '_dropMode'];
  const missingModes = MODES.filter(m => !new RegExp(`this\\.${m}\\b`).test(src));
  assert(missingModes.length === 0,
    `G4 (kontrola pinu): wszystkie trzy tryby nadal istnieją (brakuje: ${missingModes.join(', ') || 'nic'})`);
  MODES.forEach(m => {
    const at = src.indexOf(`this.${m} &&`);
    if (at > 0) assert(at > hitFirst, `G4: tryb ${m} obsługiwany PO gałęzi hit-zon`);
  });
  // I żadna etykieta tych trybów nie jest zablokowana (nie mają hit-zon — nic do zablokowania).
  assert(!isColonyOrderBlocked('close', THEIRS), 'G4: wyjście z trybu (close) wolne');
}

console.log('G5 (WYKONANIE) — `close` przechodzi na cudzej koloni');
{
  assert(ALWAYS_ALLOWED_HITS.has('close'), 'G5: `close` jest w allowliście');
  assert(!isColonyOrderBlocked('close', THEIRS), 'G5: klik zamknięcia NIE jest odrzucany');
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = strip(fs.readFileSync(new URL('../../ui/ColonyOverlay.js', import.meta.url), 'utf8'));
  assert(/case 'close':/.test(src), 'G5 (kontrola pinu): `case \'close\'` istnieje w `_onHit`');
}

console.log('G6 (WYKONANIE) — dowodzenie desantem działa na cudzej koloni');
{
  const COMMAND = [
    'unitSurvey', 'unitAnalyze', 'unitDeselect', 'unitAttack', 'unitSupportStart',
    'unitClearSupport', 'unitDeploy', 'unitPackUp', 'unitCancelDeploy',
    'stackRowClick', 'stackSelectAll', 'armyCreate', 'armyCreateFromSelection',
    'armyDisband', 'armyRename', 'armySplit', 'armySplitFromDrawer',
    'drawerUnitClick', 'drawerOpenUnit', 'drawerOpenGroup',
  ];
  assert(COMMAND.every(h => !isColonyOrderBlocked(h, THEIRS)),
    `G6: wszystkie ${COMMAND.length} etykiet dowodzenia wolne na cudzej koloni`);

  // Kontrola pinu: to NIE są etykiety-widma — każda jest realnie obsługiwana w `_onHit`.
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = strip(fs.readFileSync(new URL('../../ui/ColonyOverlay.js', import.meta.url), 'utf8'));
  const missing = COMMAND.filter(h => !new RegExp(`case '${h}':`).test(src));
  assert(missing.length === 0, `G6 (kontrola pinu): brak etykiet-widm (nieobsługiwane: ${missing.join(', ') || 'brak'})`);
}

console.log('G7 (WYKONANIE) — allowlista nie ma WPISÓW-WIDM ani nie gubi ODCZYTÓW');
{
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = strip(fs.readFileSync(new URL('../../ui/ColonyOverlay.js', import.meta.url), 'utf8'));
  const cases = new Set([...src.matchAll(/case '([a-zA-Z_][\w]*)':/g)].map(m => m[1]));
  const hits  = new Set([...src.matchAll(/_addHit\([^;]*?'([a-zA-Z_][\w]*)'/g)].map(m => m[1]));
  const universe = new Set([...cases, ...hits]);
  assert(universe.size > 50, `G7 przesłanka: wszechświat etykiet wyekstrahowany (${universe.size})`);

  const phantom = [...ALWAYS_ALLOWED_HITS].filter(h => !universe.has(h));
  assert(phantom.length === 0, `G7: zero wpisów-widm w allowliście (widma: ${phantom.join(', ') || 'brak'})`);

  // ⚠ ODCZYTY MUSZĄ PRZECHODZIĆ. `wfInfo` (tooltip satysfakcji/wzrostu) został tu ZNALEZIONY —
  //   pierwsza wersja allowlisty go gubiła, więc klik w readout flashowałby odmowę.
  const READONLY = ['strataRow', 'targetState', 'wfInfo', 'headerBuilding'];
  assert(READONLY.every(h => !isColonyOrderBlocked(h, THEIRS)),
    'G7: czyste ODCZYTY (tooltipy) przechodzą — bramka nie kłamie o tym, co jest rozkazem');
  assert(READONLY.every(h => universe.has(h)), 'G7 (kontrola pinu): wszystkie cztery odczyty istnieją w źródle');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
