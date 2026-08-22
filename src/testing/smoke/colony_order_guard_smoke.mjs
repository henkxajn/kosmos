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

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
