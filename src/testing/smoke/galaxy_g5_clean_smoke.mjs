// ARC GALAXY G5-B — PIN CZYSTOŚCI (flagi NIEBO / G1–G4 na stałe ON, zakładka Stratcom usunięta; `docs/design/GALAXY_PLAN.md` §4 G5).
//
// PO CO: G5-B zdejmuje flagi `skyCatalog`, `galaxyView`, `galaxyLook`, `galaxyWarp`, `fleetWarp` razem z każdą ścieżką, którą dało się
//   osiągnąć wyłącznie przy którejś z nich wyłączonej (dawne niebo z Math.random, twarde cięcie i nazwy płyty bez rozwinięcia — G1,
//   wpis „flota — G4”, odmowa `feature_off`, narzędzie porównania ON / OFF), a także zakładkę Stratcom Dowództwa: jej metody, stan,
//   handlery, stałe, renderer `StratcomGalaxyRenderer` i klucze i18n bez czytelnika. Ten keeper pinuje, że po usunięciu NIC w kodzie
//   produkcyjnym już ich nie dotyka: moduł skasowany w jednym miejscu, a importowany w drugim, wywala grę dopiero w przeglądarce,
//   a martwa gałąź flagi czyta pole, którego nikt nie pisze (wzór `tabs_t4_clean_smoke` / `hud_bz_clean_smoke`).
//
// ⚠ CZERWONY NA `d8835ed` (docs(607) — flagi i zakładka istnieją), ZIELONY PO G5-B. Kontrole (C0 — narzędzie, C6 — to, co ZOSTAJE)
//   są zielone po OBU stronach — bez nich zielony skan mógłby znaczyć „skaner nic nie przeczytał” albo „usunięto za dużo”.
// ⚠ Kod produkcyjny = `src/` bez `src/testing/` i bez `src/lib/`. Komentarze zdejmowane przed skanem (numery linii zostają prawdziwe):
//   historia „dawny X, usunięty w G5” zostaje w komentarzach i to jest w porządku. Importy usuniętego modułu — także w keeperach.
// ⚠ GRANICA IDENTYFIKATORA: `systemDisplayName` (MapLabelLogic — zostaje) to INNA nazwa niż usunięte `_systemDisplayName`;
//   `STRATCOM_LY_BY_LEVEL` (ObservatoryRange — zostaje) nie należy do usuniętych stałych zakładki; `_drawStratcomGhostBlip` (mapa
//   taktyczna — zostaje) to nie `_drawStratcomGalaxy`. Typy stref sprawdzane jako NAPISY (`'cluster_send'`), a `'cluster_star'`
//   (strefy gwiazd trybu galaktyki) i `'cluster_switch'` (panel przylotu, panel statku) zostają — C6.
// ⚠ ŻADNEGO wywołania funkcji tłumaczącej w tym pliku — `check-i18n` czyta je w całym `src/`.
//
// Sekcje: C0 narzędzie · C1 pliki (moduł, keepery) · C2 importy · C3 identyfikatory usuniętych ścieżek · C4 flagi · C5 klucze i18n ·
//         C6 kontrole — co ZOSTAJE.
//
// Uruchom: node src/testing/smoke/galaxy_g5_clean_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy (window/localStorage/THREE)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GAME_CONFIG } from '../../config/GameConfig.js';
import { OverlayManager } from '../../ui/OverlayManager.js';
import * as GML from '../../ui/GalaxyModeLogic.js';

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
const strRe = (s) => new RegExp(`['"\`]${esc(s)}['"\`]`);
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
  ok(PROD.length > 300 && KEEP.length > 100 && PROD.some((f) => rel(f) === 'src/ui/FleetManagerOverlay.js'),
    `C0a: skan obejmuje kod produkcyjny (${PROD.length} plików, z FleetManagerOverlay) i keepery (${KEEP.length})`);
  const syn = norm("// _drawStratcomTab w komentarzu\r\nconst a = 1; // galaxyWarpOn\r\n/* _selectedWarpShipId\r\n */\r\nthis._drawStratcomTab();\r\n");
  const synHits = hitsIn(stripComments(syn), idRe('_drawStratcomTab'), 'syn');
  ok(synHits.length === 1 && synHits[0] === 'syn:5' && hitsIn(stripComments(syn), idRe('galaxyWarpOn'), 'syn').length === 0
      && hitsIn(stripComments(syn), idRe('_selectedWarpShipId'), 'syn').length === 0,
    `C0b: komentarze (liniowe i blokowe, CRLF) zdjęte, kod liczony z prawdziwym numerem linii (${synHits.join(', ')})`);
  const b = "systemDisplayName(id); OR.STRATCOM_LY_BY_LEVEL; this._drawStratcomGhostBlip(ctx); z.type === 'cluster_star';";
  ok(!idRe('_systemDisplayName').test(b) && !idRe('STRATCOM_MAX_BLIPS').test(b) && !idRe('_drawStratcomGalaxy').test(b) && !strRe('cluster_send').test(b)
      && idRe('_systemDisplayName').test('this._systemDisplayName(sys)') && strRe('cluster_send').test("type: 'cluster_send'"),
    'C0c: granica identyfikatora i napisu — `systemDisplayName`, `STRATCOM_LY_BY_LEVEL`, `_drawStratcomGhostBlip`, `\'cluster_star\'` to nie trafienia; `_systemDisplayName(` i `\'cluster_send\'` — tak');
}

// ═══ C1 ══════════════════════════════════════════════════════════════════════
header('C1  pliki usuniętego modułu i keeperów zakładki');
{
  ok(!existsSync(join(SRC, 'renderer', 'StratcomGalaxyRenderer.js')) && existsSync(join(SRC, 'renderer', 'GalaxyPlate.js'))
      && existsSync(join(SRC, 'ui', 'GalaxyModeController.js')),
    'C1a: `src/renderer/StratcomGalaxyRenderer.js` usunięty (następcy na miejscu: `GalaxyPlate.js`, `GalaxyModeController.js`)');
  const GONE_KEEPERS = ['warp_stratcom_smoke', 'stratcom_reveal_smoke', 'stratcom_ship_icon_smoke', 'stratcom_star_pick_smoke', 'stratcom_warp_trap_smoke'];
  const left = GONE_KEEPERS.filter((k) => existsSync(join(SRC, 'testing', 'smoke', k + '.mjs')));
  ok(left.length === 0 && existsSync(join(SRC, 'testing', 'smoke', 'system_reveal_smoke.mjs')) && existsSync(join(SRC, 'testing', 'smoke', 'zone_hit_rule_smoke.mjs')),
    'C1b: keepery samej zakładki usunięte (przeżyłe niezmienniki — `system_reveal_smoke`, `zone_hit_rule_smoke`)' + (left.length ? ' — zostały: ' + left.join(', ') : ''));
}

// ═══ C2 ══════════════════════════════════════════════════════════════════════
header('C2  importy usuniętego modułu (statyczne i dynamiczne) — kod produkcyjny, keepery, index.html');
{
  const impRe = /(?:from\s*|import\s*\(\s*|import\s+)['"`][^'"`]*\bStratcomGalaxyRenderer\.js['"`]/;
  const hits = [];
  for (const f of [...PROD, ...KEEP]) {
    const s = rel(f).startsWith('src/testing/') ? stripComments(norm(readFileSync(f, 'utf8'))) : CLEAN.get(f);
    hits.push(...hitsIn(s, impRe, rel(f)));
  }
  ok(hits.length === 0, 'C2a: żaden plik `src/` nie importuje `StratcomGalaxyRenderer.js` (także dynamicznie)' + show(hits));
  const keepRead = KEEP.filter((f) => /StratcomGalaxyRenderer\.js/.test(stripComments(norm(readFileSync(f, 'utf8')))) && rel(f) !== 'src/testing/smoke/galaxy_g5_clean_smoke.mjs');
  ok(keepRead.length === 0, 'C2b: żaden keeper nie czyta pliku renderera (dawne listy `log_depth_chunks` T6)' + show(keepRead.map(rel)));
  const html = read('index.html') ?? '';
  ok(html.length > 500 && !/StratcomGalaxyRenderer/.test(html),
    'C2c (STRAŻNIK, zielony po obu stronach — moduły ładuje `main.js`): `index.html` nie odwołuje się do usuniętego modułu');
}

// ═══ C3 ══════════════════════════════════════════════════════════════════════
header('C3  identyfikatory usuniętych ścieżek w kodzie produkcyjnym');
const FAMILIES = [
  ['C3a predykaty flag (ścieżki OFF)', ['skyCatalogOn', 'galaxyViewOn', 'galaxyLookOn', 'galaxyWarpOn', 'fleetWarpOn']],
  ['C3b metody zakładki Stratcom (FleetManagerOverlay)', ['_getStratcomRangeLY', '_stratcomWarpBlipMode', '_systemReveal', '_stratcomVisibleSystems',
    '_stratcomOwnShipBlips', '_starRgb', '_starPhase', '_drawStarGlyph', '_getPanelBgImage', '_drawPanelBg', '_drawStratcomTab', '_ensureGalaxy3D',
    '_drawStratcomOwnerGlyph', '_drawStratcomTerritory2D', '_drawStratcomTerritoryTint', '_drawStratcomTerritoryLabels', '_buildTerritory3DPayload',
    '_promotePendingFlashes', '_territoryFlashFactors', '_territoryTintCanvas', '_largestLoop', '_loopArea', '_loopCentroid', '_drawStratcomGalaxy',
    '_drawOwnedLanes', '_drawSensorSweep', '_drawSensorLensButton', '_drawStratcomDetail', '_systemDisplayName', '_buildSystemScanLayout',
    '_drawSystemScanSection', '_drawStratcomOwnBlip', '_pushShipBlipHitZone', '_drawOwnShipTriangle', '_drawMyShipMarker', '_drawWarpRouteLine',
    '_warpStatusLabel', '_drawWarpShipList', '_toastWarpRefused', '_drawWarpOrderPanel', '_drawShipPicker', '_drawLeftTabs']],
  ['C3c stan zakładki Stratcom', ['_clusterZoom', '_clusterPanX', '_clusterPanY', '_selectedClusterSystem', '_clusterHoverSystem', '_selectedWarpShipId',
    '_warpShipScrollY', '_galaxy3D', '_galaxy3DLoading', '_galaxy3DFailed', '_galaxyYaw', '_galaxyPitch', '_galaxyDist', '_holotablePanTarget',
    '_sensorLens', '_galaxyDrag', '_galaxyPanelRect', '_galaxyLastDragMs', '_pendingSendSystemId', '_clusterDrag', '_territoryFlash', '_territoryFlashPending']],
  ['C3d stałe zakładki Stratcom', ['STRATCOM_MAX_BLIPS', 'STRATCOM_GLOW', 'STRATCOM_GLOW_MS', 'STRATCOM_BG_BRIGHTNESS', 'STRATCOM_FAN_MAX',
    'STRATCOM_FAN_STEP', 'STRATCOM_FAN_DY', 'STRATCOM_SHIP_HIT_H', '_stratcomFanOffset', 'LANE_FLOW_PX_PER_SEC', 'TERRITORY_DASH_MARCH_PX_PER_SEC',
    'TERRITORY_FLASH_MS', 'TERRITORY_FLASH_PENDING_MAX_MS', 'StratcomGalaxyRenderer']],
  ['C3e dawne ścieżki OFF trybu galaktyki (G1 nazw płyty, „flota — G4”, porównanie ON / OFF)', ['_g1Prepare', '_g1Collect', '_g1Draw',
    '_g1HandleClick', 'fleetWarpAI', 'NOT_YET']],
];
{
  for (const [label, ids] of FAMILIES) {
    const hits = [];
    for (const id of ids) for (const h of prodHits(idRe(id))) hits.push(id + ' @ ' + h);
    ok(hits.length === 0, `${label}: ${ids.length} nazw — brak odwołań` + show(hits));
  }
  const ZONES = ['stratcom_detail_bg', 'stratcom_lens_toggle', 'stratcom_scan', 'stratcom_scan_cancel', 'cluster_send', 'cluster_send_pick',
    'cluster_send_cancel', 'warp_ship_select', 'warp_order_send', 'warp_order_cancel', 'warp_order_bg', 'cluster_beacon', 'cluster_gate', 'fleetTab'];
  const zh = [];
  for (const z of ZONES) for (const h of prodHits(strRe(z))) zh.push(z + ' @ ' + h);
  ok(zh.length === 0, `C3f typy stref usuniętych handlerów (${ZONES.length} napisów) — brak producenta i handlera` + show(zh));
  const tab = prodHits(strRe('stratcom'));
  ok(tab.length === 0, 'C3g identyfikator zakładki `\'stratcom\'` — brak w kodzie produkcyjnym (pasek zakładek, keymapa, przełączniki)' + show(tab));
  const tr = readClean('src/renderer/ThreeRenderer.js') ?? '';
  ok(tr.length > 1000 && !idRe('STAR_VERT').test(tr) && !idRe('STAR_FRAG').test(tr) && /_buildBackground\(\)\s*\{\s*this\._buildSkyDome\(\);\s*\}/.test(tr)
      && !prodHits(strRe('feature_off')).length && !prodHits(strRe('galaxyMenu.fleetWaitsG4')).length,
    'C3h: dawne niebo (powłoka z Math.random na `STAR_VERT` / `STAR_FRAG`) usunięte — tło = sama kopuła; odmowa `feature_off` i wpis „flota — G4” — brak');
}

// ═══ C4 ══════════════════════════════════════════════════════════════════════
header('C4  flagi NIEBO / G1–G4 — klucze usunięte z FEATURES, kod ich nie czyta');
const GONE_FLAGS = ['skyCatalog', 'galaxyView', 'galaxyLook', 'galaxyWarp', 'fleetWarp'];
{
  const F = GAME_CONFIG?.FEATURES ?? {};
  const keys = Object.keys(F);
  const still = GONE_FLAGS.filter((k) => keys.includes(k));
  ok(keys.length > 20 && still.length === 0, `C4a: \`GAME_CONFIG.FEATURES\` (${keys.length} kluczy) bez flag ARC GALAXY`
    + (still.length ? ' — zostały: ' + still.join(', ') : ''));
  const alt = GONE_FLAGS.map(esc).join('|');
  const dotRe = new RegExp(`(?<![\\w$])(?:FEATURES|features|feat|cfg)\\s*\\??\\.\\s*(?:${alt})(?![\\w$])`);
  const brRe = new RegExp(`\\[\\s*['"\`](?:${alt})['"\`]\\s*\\]`);
  const hits = [...prodHits(dotRe), ...prodHits(brRe)];
  ok(hits.length === 0, 'C4b: kod produkcyjny nie czyta pola żadnej z tych flag (`FEATURES.x`, `features?.x`, `[\'x\']`)' + show(hits));
}

// ═══ C5 ══════════════════════════════════════════════════════════════════════
header('C5  klucze i18n zakładki i dawnych ścieżek — usunięte z pl / en, bez czytelnika');
const GONE_KEYS = ['territory.controlRow', 'fleet.tabStratcom', 'fleet.stratcomNoData', 'fleet.galaxyMapTitle', 'fleet.sensorLens',
  'fleet.stratcomHostility', 'fleet.stratcomPopulation', 'fleet.stratcomPopUnknown', 'fleet.stratcomLifeYes', 'fleet.stratcomLifeNo',
  'fleet.stratcomLifeUnknown', 'fleet.scanAsteroids', 'fleet.scanComets', 'fleet.clusterSend', 'fleet.cancelSend', 'fleet.warpShipsTitle',
  'fleet.warpNoShips', 'fleet.warpStatusInTransit', 'fleet.warpStatusImmobilized', 'fleet.warpStatusIdle', 'fleet.warpStatusBusy',
  'fleet.warpOrderTitle', 'fleet.warpTotalLY', 'fleet.warpFeasible', 'fleet.warpSend', 'fleet.warpCancel', 'galaxyMenu.fleetWaitsG4',
  'civPanel.galaxy', 'territory.legendZone', 'territory.legendBorder', 'territory.legendOwner', 'fleet.stratcomRange', 'fleet.stratcomSensors',
  'fleet.stratcomBlind', 'fleet.stratcomObsLevel', 'fleet.clusterReturn', 'fleet.clusterSelectTarget', 'fleet.clusterSpectral', 'fleet.clusterMass',
  'fleet.clusterHome', 'fleet.clusterColony', 'fleet.clusterBeacon', 'fleet.clusterGate', 'fleet.clusterBuildBeacon', 'fleet.clusterBuildGate',
  'fleet.starCluster', 'fleet.opsBodies', 'fleet.opsNoScan', 'fleet.opsScanToast', 'fleet.tabShipyard', 'fleet.tabVessels', 'fleet.tabFleets'];
// Klucze czytane DYNAMICZNIE (trójargumentowe wybory / dane — `GalaxyChromeLogic`), widziane przez `check-i18n` jako nieużyte: zostają.
const VAR_KEYS = ['fleet.clusterExplored', 'fleet.clusterUnexplored', 'fleet.scanLockedToast', 'fleet.scanLimitToast', 'fleet.scanBusyToast',
  'fleet.scanLocked', 'fleet.scanComplete', 'fleet.scanCancel', 'fleet.scanMore', 'fleet.scanPlanetoids'];
{
  const pl = read('src/i18n/pl.js') ?? '', en = read('src/i18n/en.js') ?? '';
  const def = (src, k) => new RegExp(`^\\s*['"]${esc(k)}['"]\\s*:`, 'm').test(src);
  const still = GONE_KEYS.filter((k) => def(pl, k) || def(en, k));
  ok(pl.length > 10000 && en.length > 10000 && still.length === 0, `C5a: ${GONE_KEYS.length} kluczy usuniętych z pl.js i en.js`
    + (still.length ? ' — zostały: ' + still.slice(0, 8).join(', ') + (still.length > 8 ? ` (+${still.length - 8})` : '') : ''));
  const used = [];
  for (const k of GONE_KEYS) for (const h of prodHits(strRe(k))) used.push(k + ' @ ' + h);
  ok(used.length === 0, 'C5b: kod produkcyjny nie odwołuje się do żadnego z nich' + show(used));
  const lost = VAR_KEYS.filter((k) => !def(pl, k) || !def(en, k));
  ok(lost.length === 0 && VAR_KEYS.every((k) => prodHits(strRe(k)).length > 0),
    'C5c (KONTROLA): klucze czytane dynamicznie przez przypięcie gwiazdy zostają w obu językach i mają czytelnika' + (lost.length ? ' — brak: ' + lost.join(', ') : ''));
}

// ═══ C6 ══════════════════════════════════════════════════════════════════════
header('C6  KONTROLE — co ZOSTAJE (zielone po obu stronach)');
{
  const fmo = readClean('src/ui/FleetManagerOverlay.js') ?? '', sp = readClean('src/ui/ShipPanelHudLogic.js') ?? '';
  ok(/case 'cluster_switch':/.test(fmo) && /type: 'cluster_switch'/.test(fmo) && /chip\('cluster_switch'/.test(sp),
    'C6a: `cluster_switch` zostaje — handler w FMO, producent w panelu przylotu (`_drawRight`) i czip panelu statku');
  ok(['_dispatchReturnJump', '_toastReturnFailed', '_warpErrLabel', '_drawStratcomGhostBlip'].every((n) => new RegExp(`^\\s{2}${n}\\s*\\(`, 'm').test(fmo)),
    'C6b: FMO zostawia powrót skokiem (Finding 125: `_dispatchReturnJump`, `_toastReturnFailed`, `_warpErrLabel`) i kropkę „?” mapy taktycznej');
  const hit = readClean('src/ui/StratcomHitLogic.js') ?? '', hc = readClean('src/renderer/HolotableCamera.js') ?? '';
  const trl = readClean('src/ui/TerritoryRenderLogic.js') ?? '', gw = readClean('src/ui/GalaxyWarpLogic.js') ?? '', orng = readClean('src/utils/ObservatoryRange.js') ?? '';
  const exp = (src, names) => names.every((n) => new RegExp(`^export (?:function|const) ${n}\\b`, 'm').test(src));
  ok(exp(hit, ['topMostZoneAt', 'pickStarZone', 'resolveStratcomZone']) && exp(hc, ['orbitPosition', 'panScreenToWorld', 'riserEndpoints', 'DEFAULT_OBLIQUE_PITCH'])
      && exp(trl, ['resolveTerritoryVisibility', 'buildTerritory3DPayload', 'computeOwnedLanes']) && exp(gw, ['refusalText', 'warpErrLabel'])
      && /STRATCOM_LY_BY_LEVEL/.test(orng),
    'C6c: czyste moduły zostają — `StratcomHitLogic`, `HolotableCamera`, `TerritoryRenderLogic`, słownik odmowy skoku, tabela zasięgu obserwatorium');
  ok(['src/systems/TerritoryField.js', 'src/systems/TerritoryService.js', 'src/utils/SystemReveal.js', 'src/utils/SystemRevealWorld.js',
      'src/utils/SystemExploration.js'].every((p) => existsSync(join(ROOT, p))),
    'C6d: kanony terytorium, mgły wojny i eksploracji zostają (`TerritoryField`, `TerritoryService`, `SystemReveal*`, `SystemExploration`)');
  ok(existsSync(join(ROOT, 'assets', 'backgrounds', 'deep_space.png')),
    'C6e: tło `assets/backgrounds/deep_space*.png` zostaje na dysku (zasób, nie kod — decyzja właściciela, §7 O9)');
  const om = new OverlayManager();
  const objKeys = Object.keys(om._keyMap).filter((k) => typeof om._keyMap[k] !== 'string');
  ok(!('g' in om._keyMap) && !('m' in om._keyMap) && objKeys.join(',') === 'k'
      && GML.isGalaxyToggleKey?.({ key: 'g' }) === true && GML.isGalaxyToggleKey?.({ key: 'M', shiftKey: true }) === true
      && GML.isGalaxyToggleKey?.({ key: 'm', ctrlKey: true }) === false,
    'C6f: G i M przełączają tryb galaktyki (`isGalaxyToggleKey`), poza keymapą overlayów; jedyny wpis {id, opts} — K (wraki)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
