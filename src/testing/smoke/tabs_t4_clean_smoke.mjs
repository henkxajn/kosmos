// REFORMA ZAKŁADEK T4 — PIN CZYSTOŚCI (sprzątanie po krokach T1–T6; `docs/design/TABS_REFORM_PLAN.md` §5.10).
//
// PO CO: T4 usuwa powierzchnie zastąpione etykietami, przypięciami i panelami w idiomie etykiet — kartę ciała
//   (`BottomContext`), pływający panel stacji, dok paneli z `FloatingPanel`, kartę z boku tarczy (`BodyCardSideLogic`),
//   adapter pływającego panelu statku (T3) w `FleetManagerOverlay`, rysunek dawnych paneli floty i grupy, dymki DOM ciała
//   i statku — oraz flagi kroków reformy (`bodyCardSide`, `shipPanelOutliner`, `labelHover`, `labelPin`, `shipPanelHud`,
//   `fleetPanelHud`, `mapVesselPanel`, `mapVesselPanelCompact`) i klucze i18n czytane wyłącznie przez usunięte powierzchnie.
//   Ten keeper pinuje, że po usunięciu NIC w kodzie produkcyjnym już ich nie dotyka: moduł skasowany w jednym miejscu,
//   a importowany w drugim, wywala grę dopiero w przeglądarce, a martwa gałąź flagi czyta pole, którego nikt nie pisze.
//
// ⚠ CZERWONY NA `e873127` (odwołania istnieją), ZIELONY PO T4. Kontrole (C0 — narzędzie, C6 — to, co ZOSTAJE) są zielone
//   po OBU stronach — bez nich zielony skan mógłby znaczyć „skaner nic nie przeczytał” albo „usunięto za dużo”.
// ⚠ Kod produkcyjny = `src/` bez `src/testing/` i bez `src/lib/` (biblioteki dostawców). Komentarze zdejmowane przed skanem
//   (puste linie w miejscu bloków — numery linii w raporcie trafień zostają prawdziwe): historia „dawny X, usunięty w T4”
//   zostaje w komentarzach i to jest w porządku. Importy usuniętych modułów sprawdzane także w keeperach (keeper z takim
//   importem wywala się przy ładowaniu, zanim cokolwiek zmierzy).
// ⚠ GRANICA IDENTYFIKATORA: `isPointerOverFloatingPanel` (UIManager), `_drawFloatingPanel` (ColonyOverlay — panel kafla)
//   i `_showColonyTooltipEl` (element dymka budynku K3) to INNE nazwy niż usunięte `FloatingPanel` / `_showColonyTooltip`
//   — skaner patrzy na całe identyfikatory (C0c pilnuje tego wprost). Słowa `labelHover` / `labelPin` / `shipPanelHud` /
//   `fleetPanelHud` żyją dalej jako PREFIKSY KLUCZY i18n — sekcja flag pyta o odczyt POLA flagi, nie o słowo.
// ⚠ ŻADNEGO wywołania funkcji tłumaczącej w tym pliku — `check-i18n` czyta je w całym `src/` (klucze niżej to zwykłe napisy).
//
// Sekcje: C0 narzędzie · C1 pliki modułów · C2 importy · C3 identyfikatory usuniętych powierzchni (+ następcy) · C4 flagi
//         · C5 klucze i18n · C6 kontrole — co ZOSTAJE.
//
// Uruchom: node src/testing/smoke/tabs_t4_clean_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (window/localStorage/THREE)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GAME_CONFIG } from '../../config/GameConfig.js';

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (h) => console.log('── ' + h + ' ──');

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = join(ROOT, 'src');
const rel = (f) => relative(ROOT, f).split(sep).join('/');
const norm = (s) => s.replace(/\r\n/g, '\n');
// Bloki komentarzy → tyle samo znaków nowej linii (numery linii zostają); `//` poza `://` (adresy w napisach).
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const walk = (d) => readdirSync(d, { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : /\.m?js$/.test(e.name) ? [join(d, e.name)] : []);
const ALL = walk(SRC);
const isProd = (f) => !rel(f).startsWith('src/testing/') && !rel(f).startsWith('src/lib/');
const PROD = ALL.filter(isProd);
const KEEP = ALL.filter((f) => rel(f).startsWith('src/testing/'));
const CLEAN = new Map(PROD.map((f) => [f, stripComments(norm(readFileSync(f, 'utf8')))]));
const read = (p) => { try { return norm(readFileSync(join(ROOT, p), 'utf8')); } catch { return null; } };
const readClean = (p) => { const s = read(p); return s == null ? null : stripComments(s); };

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const idRe = (id) => new RegExp('(?<![\\w$])' + esc(id) + '(?![\\w$])');
/** Trafienia wyrażenia w tekście (po zdjęciu komentarzy) — lista „plik:linia”. */
function hitsIn(text, re, label) {
  const out = [];
  text.split('\n').forEach((ln, i) => { if (re.test(ln)) out.push(label + ':' + (i + 1)); });
  return out;
}
/** Trafienia w CAŁYM kodzie produkcyjnym. */
function prodHits(re) {
  const out = [];
  for (const [f, s] of CLEAN) out.push(...hitsIn(s, re, rel(f)));
  return out;
}
const show = (hits) => hits.length ? ' — ' + hits.slice(0, 6).join(', ') + (hits.length > 6 ? ` (+${hits.length - 6})` : '') : '';

// ═══ C0 ══════════════════════════════════════════════════════════════════════
header('C0  narzędzie: skaner czyta kod produkcyjny, zdejmuje komentarze, patrzy na całe identyfikatory');
{
  ok(PROD.length > 300 && KEEP.length > 100 && PROD.some((f) => rel(f) === 'src/scenes/UIManager.js'),
    `C0a: skan obejmuje kod produkcyjny (${PROD.length} plików, z UIManager) i keepery (${KEEP.length})`);
  const syn = norm('// BottomContext w komentarzu\r\nconst a = 1; // PanelDock\r\n/* FloatingPanel\r\n */\r\nnew PanelDock();\r\n');
  const synHits = hitsIn(stripComments(syn), idRe('PanelDock'), 'syn');
  ok(synHits.length === 1 && synHits[0] === 'syn:5' && hitsIn(stripComments(syn), idRe('BottomContext'), 'syn').length === 0
      && hitsIn(stripComments(syn), idRe('FloatingPanel'), 'syn').length === 0,
    `C0b: komentarze (liniowe i blokowe, CRLF) zdjęte, kod liczony z prawdziwym numerem linii (${synHits.join(', ')})`);
  const b = 'isPointerOverFloatingPanel(x); this._drawFloatingPanel(c); this._showColonyTooltipEl(h);';
  ok(!idRe('FloatingPanel').test(b) && !idRe('_showColonyTooltip').test(b) && idRe('FloatingPanel').test('new FloatingPanel()')
      && idRe('_showColonyTooltip').test('this._showColonyTooltip(id)'),
    'C0c: granica identyfikatora — `isPointerOverFloatingPanel` / `_drawFloatingPanel` / `_showColonyTooltipEl` to nie trafienia, `new FloatingPanel()` i `_showColonyTooltip(` — tak');
}

// ═══ C1 ══════════════════════════════════════════════════════════════════════
header('C1  pliki usuniętych modułów');
const GONE_MODULES = ['BottomContext', 'BottomContextLogic', 'FloatingPanel', 'PanelDock', 'PanelDockLogic', 'BodyCardSideLogic'];
{
  const left = GONE_MODULES.filter((m) => existsSync(join(SRC, 'ui', m + '.js')));
  ok(left.length === 0, 'C1a: `src/ui/{' + GONE_MODULES.join(', ') + '}.js` usunięte' + (left.length ? ' — zostały: ' + left.join(', ') : ''));
  const goneKeepers = ['body_card_side_smoke.mjs', 's34b_bottomcontext_smoke.mjs', 's34b_paneldock_smoke.mjs'];
  const leftK = goneKeepers.filter((k) => existsSync(join(SRC, 'testing', 'smoke', k)));
  ok(leftK.length === 0, 'C1b: keepery usuniętych modułów usunięte razem z nimi (' + goneKeepers.join(', ') + ')'
    + (leftK.length ? ' — zostały: ' + leftK.join(', ') : ''));
}

// ═══ C2 ══════════════════════════════════════════════════════════════════════
header('C2  importy usuniętych modułów (statyczne i dynamiczne) — kod produkcyjny, keepery, index.html');
{
  const modAlt = GONE_MODULES.map(esc).join('|');
  const impRe = new RegExp(`(?:from\\s*|import\\s*\\(\\s*|import\\s+)['"\`][^'"\`]*\\b(?:${modAlt})\\.js['"\`]`);
  const hits = [];
  for (const f of [...PROD, ...KEEP]) {
    const s = rel(f).startsWith('src/testing/') ? stripComments(norm(readFileSync(f, 'utf8'))) : CLEAN.get(f);
    hits.push(...hitsIn(s, impRe, rel(f)));
  }
  ok(hits.length === 0, 'C2a: żaden plik `src/` nie importuje usuniętego modułu' + show(hits));
  const html = read('index.html') ?? '';
  ok(html.length > 500 && !new RegExp(`\\b(?:${modAlt})\\.js\\b`).test(html),
    'C2b (STRAŻNIK, zielony po obu stronach — moduły ładuje `main.js`, nie `index.html`): `index.html` nie odwołuje się do usuniętych modułów');
}

// ═══ C3 ══════════════════════════════════════════════════════════════════════
header('C3  identyfikatory usuniętych powierzchni w kodzie produkcyjnym (+ następcy przeniesionego rdzenia)');
const FAMILIES = [
  ['C3a moduły', GONE_MODULES],
  ['C3b karta ciała i karta z boku tarczy (493, 544)', ['_bottomContext', '_bodyCardEntity', 'isBodyCardSideOn', 'makeCardSideMemory',
    'cardObstacles', 'getShipPanelObstacle']],
  ['C3c dok paneli i pływający panel stacji (rząd chipów doku na pasie dolnym)', ['panelDock', 'getDockSpan', '_dockSpan', 'DOCK_CHIP_H',
    'DOCK_CHIP_GAP', '_stationPanelSurface']],
  ['C3d pływający panel statku T3 (adapter w FleetManagerOverlay, slice 258)', ['drawVesselPanel', '_drawVesselPanelFooter',
    'handleVesselPanelClick', 'handleVesselPanelScroll', 'handleVesselPanelDragMove', 'tryBeginVesselPanelDrag', 'isDraggingVesselPanel',
    'endVesselPanelDrag', '_vesselPanelBounds', '_vesselPanelRect', '_vesselPanelFloat', 'MVP_FOOTER_H']],
  ['C3e dawne panele floty i grupy (wiersze rostera)', ['buildRosterRows']],
  ['C3f dymki DOM ciała (kolonii) i statku', ['_showColonyTooltip', '_showVesselTooltip']],
  ['C3g predykaty flag kroków reformy', ['isShipPanelOutlinerOn', 'isShipPanelHudOn', 'isShipPanelHudActive', 'isLabelPinOn',
    'isLabelPinActive', 'isLabelHoverOn', 'isLabelHoverActive', 'isFleetPanelHudOn', 'isFleetPanelHudActive', '_shipPanelHudActive',
    '_fleetPanelHudActive']],
];
{
  for (const [label, ids] of FAMILIES) {
    const hits = [];
    for (const id of ids) for (const h of prodHits(idRe(id))) hits.push(id + ' @ ' + h);
    ok(hits.length === 0, `${label}: ${ids.length} nazw — brak odwołań` + show(hits));
  }
  // Dawne panele: zostają STAN, słuchacze i `_onHit` (cele chipów paneli T5 / T6 — decyzja właściciela Q3), bez rysunku i kliku.
  const shape = [];
  for (const p of ['src/ui/StationPanel.js', 'src/ui/FleetCommandPanel.js', 'src/ui/FleetGroupPanel.js']) {
    const s = readClean(p) ?? '';
    if (/\bextends\s+BaseOverlay\b/.test(s)) shape.push(p + ': extends BaseOverlay');
    if (/^\s{2}draw\s*\(/m.test(s)) shape.push(p + ': draw()');
    if (/^\s{2}handleClick\s*\(/m.test(s)) shape.push(p + ': handleClick()');
    if (/^\s{2}handleMouseMove\s*\(/m.test(s)) shape.push(p + ': handleMouseMove()');
  }
  ok(shape.length === 0, 'C3h: `StationPanel` / `FleetCommandPanel` / `FleetGroupPanel` bez rysunku, kliku w prostokąt i `BaseOverlay`'
    + (shape.length ? ' — ' + shape.join('; ') : ''));
  const lp = readClean('src/ui/LabelPinLogic.js') ?? '', hp = readClean('src/ui/HudProjection.js') ?? '';
  ok(/^export function runBodyMapAction\s*\(/m.test(lp) && /^export function objectScreenDisc\s*\(/m.test(hp),
    'C3i (następcy): rdzeń akcji „Mapa ciała” (`runBodyMapAction`, dawne `BottomContext._doAction`) w `LabelPinLogic`, tarcza obiektu '
    + '(`objectScreenDisc`, z usuniętego `BodyCardSideLogic`) w `HudProjection`');
}

// ═══ C4 ══════════════════════════════════════════════════════════════════════
header('C4  flagi kroków reformy — klucze usunięte z FEATURES, kod ich nie czyta');
const REFORM_FLAGS = ['bodyCardSide', 'shipPanelOutliner', 'labelHover', 'labelPin', 'shipPanelHud', 'fleetPanelHud', 'mapVesselPanel',
  'mapVesselPanelCompact'];
{
  const F = GAME_CONFIG?.FEATURES ?? {};
  const keys = Object.keys(F);
  const still = REFORM_FLAGS.filter((k) => keys.includes(k));
  ok(keys.length > 20 && still.length === 0, `C4a: \`GAME_CONFIG.FEATURES\` (${keys.length} kluczy) bez flag kroków reformy`
    + (still.length ? ' — zostały: ' + still.join(', ') : ''));
  const alt = REFORM_FLAGS.map(esc).join('|');
  const dotRe = new RegExp(`(?<![\\w$])(?:FEATURES|features|feat)\\s*\\??\\.\\s*(?:${alt})(?![\\w$])`);
  const brRe = new RegExp(`\\[\\s*['"\`](?:${alt})['"\`]\\s*\\]`);
  const hits = [...prodHits(dotRe), ...prodHits(brRe)];
  ok(hits.length === 0, 'C4b: kod produkcyjny nie czyta pola żadnej z tych flag (`FEATURES.x`, `features?.x`, `[\'x\']`)' + show(hits));
}

// ═══ C5 ══════════════════════════════════════════════════════════════════════
header('C5  klucze i18n — usunięte razem z powierzchniami; czytane przez zmienną — zostają');
{
  const pl = read('src/i18n/pl.js') ?? '', en = read('src/i18n/en.js') ?? '';
  const defined = (dict, k) => new RegExp(`^\\s*['"]${esc(k)}['"]\\s*:`, 'm').test(dict);
  const GONE_KEYS = ['atmosphere.habitable', 'body.occupied', 'context.age', 'context.atm', 'context.composition', 'context.eccentricity',
    'context.life', 'context.mass', 'context.orbit', 'context.orbitLabel', 'context.period', 'context.physics', 'context.stability',
    'context.temp', 'context.type', 'fleetGroup.title', 'life.complex', 'station.created', 'station.mgmt.noModules', 'station.orbit',
    'station.ownerPlayer', 'station.system', 'station.tier', 'ui.unexplored'];
  const left = GONE_KEYS.filter((k) => defined(pl, k) || defined(en, k));
  ok(pl.length > 1000 && en.length > 1000 && left.length === 0,
    `C5a: ${GONE_KEYS.length} kluczy czytanych wyłącznie przez usunięte powierzchnie — usunięte z pl i en` + (left.length ? ' — zostały: ' + left.join(', ') : ''));
  // ⚠ STRAŻNIK: te klucze czytały STATYCZNIE usunięte powierzchnie, a żywe czytają je przez zmienną (parametr pomocnika chipa,
  //   tabela etapów życia, wyrażenie warunkowe) — `check-i18n` widzi je od T4 jako „zdefiniowane-a-nieużyte” (lista
  //   informacyjna). Usunięcie któregoś „bo nieużyty” pokazałoby graczowi surowy klucz na chipie panelu floty / grupy,
  //   w przypięciu albo w rozwinięciu etykiety.
  const VAR_KEYS = {
    'context.openMap': 'src/ui/LabelPinLogic.js', 'context.takeCiv': 'src/ui/LabelPinLogic.js',
    'station.modules': 'src/ui/LabelPinLogic.js', 'station.traders': 'src/ui/LabelPinLogic.js',
    'fleetCmd.disband': 'src/ui/FleetPanelHudLogic.js', 'fleetCmd.dock': 'src/ui/FleetPanelHudLogic.js',
    'fleetCmd.engage': 'src/ui/FleetPanelHudLogic.js', 'fleetCmd.move': 'src/ui/FleetPanelHudLogic.js',
    'fleetCmd.return': 'src/ui/FleetPanelHudLogic.js', 'fleetCmd.stop': 'src/ui/FleetPanelHudLogic.js',
    'fleetCmd.undock': 'src/ui/FleetPanelHudLogic.js', 'fleetGroup.actionRefuel': 'src/ui/FleetPanelHudLogic.js',
    'fleetGroup.actionStop': 'src/ui/FleetPanelHudLogic.js', 'fleetGroup.actionUndock': 'src/ui/FleetPanelHudLogic.js',
    'life.barren': 'src/systems/LifeSystem.js', 'life.prebiotic': 'src/systems/LifeSystem.js',
    'life.microorganisms': 'src/systems/LifeSystem.js', 'life.civilization': 'src/systems/LifeSystem.js',
  };
  const bad = [];
  for (const [k, file] of Object.entries(VAR_KEYS)) {
    const code = readClean(file) ?? '';
    if (!defined(pl, k) || !defined(en, k)) bad.push(k + ' (brak w słowniku)');
    else if (!new RegExp(`['"]${esc(k)}['"]`).test(code)) bad.push(k + ' (brak odczytu w ' + file + ')');
  }
  ok(bad.length === 0, `C5b (STRAŻNIK, zielony po obu stronach): ${Object.keys(VAR_KEYS).length} kluczy czytanych przez zmienną — w pl i en, `
    + 'każdy z odczytem w swoim pliku' + (bad.length ? ' — ' + bad.join('; ') : ''));
}

// ═══ C6 ══════════════════════════════════════════════════════════════════════
header('C6  KONTROLE — co ZOSTAJE (zielone po obu stronach)');
{
  const F = GAME_CONFIG?.FEATURES ?? {};
  ok(['hudOrbits', 'hudRadar', 'hudLabels', 'hudRoutes'].every((k) => F[k] === true),
    'C6a: flagi ARKUSZA HUD (`hudOrbits`, `hudRadar`, `hudLabels`, `hudRoutes`) zostają i są ON');
  const files = ['src/ui/StationPanel.js', 'src/ui/FleetCommandPanel.js', 'src/ui/FleetGroupPanel.js', 'src/ui/FleetGroupPanelLogic.js',
    'src/ui/LabelPinLogic.js', 'src/ui/LabelHoverLogic.js', 'src/ui/ShipPanelHudLayer.js', 'src/ui/ShipPanelHudLogic.js',
    'src/ui/FleetPanelHudLayer.js', 'src/ui/FleetPanelHudLogic.js', 'src/ui/HudLabelLayer.js', 'src/ui/MapLabelLayer.js',
    'src/ui/BodyDetailModal.js', 'src/ui/ColonyOverlay.js', 'src/ui/HudProjection.js'];
  const missing = files.filter((p) => !existsSync(join(ROOT, p)));
  ok(missing.length === 0, `C6b: ${files.length} modułów żywych powierzchni na miejscu` + (missing.length ? ' — brak: ' + missing.join(', ') : ''));
  const fmo = readClean('src/ui/FleetManagerOverlay.js') ?? '';
  const tr = readClean('src/renderer/ThreeRenderer.js') ?? '';
  const ui = readClean('src/scenes/UIManager.js') ?? '';
  const fcp = readClean('src/ui/FleetCommandPanel.js') ?? '', fgp = readClean('src/ui/FleetGroupPanel.js') ?? '';
  const sp = readClean('src/ui/StationPanel.js') ?? '';
  ok(/^\s{2}_drawRight\s*\(/m.test(fmo) && /^\s{2}_handleVesselPanelFooter\s*\(/m.test(fmo),
    'C6c: `FleetManagerOverlay._drawRight` (Rejestr Dowództwa, tryb kompaktowy — źródło treści panelu T5) i `_handleVesselPanelFooter` (cel chipów T5) zostają');
  ok(/^\s{2}_onHit\s*\(/m.test(fcp) && /^\s{2}_onHit\s*\(/m.test(fgp) && /^\s{2}_onHit\s*\(/m.test(sp),
    'C6d: `_onHit` dawnych paneli floty, grupy i stacji zostaje (cele chipów paneli T6 i przypięcia stacji)');
  ok(/window\.KOSMOS\.stationPanel\s*=/.test(ui) && /window\.KOSMOS\.fleetGroupPanel\s*=/.test(ui) && /window\.KOSMOS\.fleetCommandPanel\s*=/.test(ui),
    'C6e: uchwyty `KOSMOS.stationPanel` / `fleetGroupPanel` / `fleetCommandPanel` bez zmian (decyzja właściciela Q3)');
  ok(/^\s{2}_showBuildingTooltip\s*\(/m.test(tr) && /^\s{2}_showColonyTooltipEl\s*\(/m.test(tr),
    'C6f: podpowiedź budynku (K3) i jej element `#colony-3d-tooltip` (`_showColonyTooltipEl`) zostają');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
