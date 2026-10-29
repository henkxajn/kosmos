// ARKUSZ HUD B-Z — PIN CZYSTOŚCI (flagi H0–H4 na stałe ON, ścieżki OFF usunięte; `docs/design/HUD_PLAN.md` §4.6).
//
// PO CO: B-Z zdejmuje flagi ARKUSZA HUD (`hudOrbits`, `hudRadar`, `hudLabels`, `hudRoutes`, `hudAttention`) i każdą ścieżkę,
//   którą dało się osiągnąć wyłącznie przy którejś z nich wyłączonej — dawny styl orbit (hexy), pierścienie sensorów 3D
//   (`_syncSensorOverlay`, flaga `m4SensorOverlay`), plakietki `MapLabelLayer` z ich pomocnikami (LOD, anty-nakładanie,
//   zbieracze kolonii i stacji, `toLogicalPx`, pozycje ekranowe renderera) i flagami `mapLabels` / `fleetMapLabels`, linie
//   tras 3D (`routeLine`, `_orderLineColor`, flaga `fcOrderLines`), błysk H1 na granicy radaru (0,8 s czasu realnego),
//   ramki RTS statku i puls celownika na zegarze realnym. Ten keeper pinuje, że po usunięciu NIC w kodzie produkcyjnym już
//   ich nie dotyka: moduł skasowany w jednym miejscu, a importowany w drugim, wywala grę dopiero w przeglądarce, a martwa
//   gałąź flagi czyta pole, którego nikt nie pisze (wzór `tabs_t4_clean_smoke`).
//
// ⚠ CZERWONY NA `fabb4b2` (paczka B, B-4 — odwołania istnieją), ZIELONY PO B-Z. Kontrole (C0 — narzędzie, C6 — to, co
//   ZOSTAJE) są zielone po OBU stronach — bez nich zielony skan mógłby znaczyć „skaner nic nie przeczytał” albo „usunięto
//   za dużo”.
// ⚠ Kod produkcyjny = `src/` bez `src/testing/` i bez `src/lib/` (biblioteki dostawców). Komentarze zdejmowane przed skanem
//   (puste linie w miejscu bloków — numery linii w raporcie trafień zostają prawdziwe): historia „dawny X, usunięty w B-Z”
//   zostaje w komentarzach i to jest w porządku. Importy usuniętego modułu sprawdzane także w keeperach.
// ⚠ GRANICA IDENTYFIKATORA: `getStationScreenPosition` (etykiety CTRL — zostaje) to INNA nazwa niż usunięte
//   `getScreenPosition`; `uiPrefs.fleetMapLabelsVisible` (☰ „Plakietki floty” — zostaje, czyta je warstwa etykiet HUD) to
//   inne pole niż usunięta flaga `fleetMapLabels`; `_hudRebuildPlanetoidOrbits` (zostaje) to inna nazwa niż usunięte
//   `_rebuildPlanetoidOrbits` — skaner patrzy na całe identyfikatory (C0c pilnuje tego wprost).
// ⚠ ŻADNEGO wywołania funkcji tłumaczącej w tym pliku — `check-i18n` czyta je w całym `src/`.
//
// Sekcje: C0 narzędzie · C1 plik modułu · C2 importy · C3 identyfikatory usuniętych ścieżek · C4 flagi · C5 zdarzenia
//         i preferencje dawnych ścieżek · C6 kontrole — co ZOSTAJE.
//
// Uruchom: node src/testing/smoke/hud_bz_clean_smoke.mjs

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
const body = (code, sig) => { const i = code.indexOf(sig); return i < 0 ? '' : code.slice(i, code.indexOf('\n  }\n', i) + 4); };

// ═══ C0 ══════════════════════════════════════════════════════════════════════
header('C0  narzędzie: skaner czyta kod produkcyjny, zdejmuje komentarze, patrzy na całe identyfikatory');
{
  ok(PROD.length > 300 && KEEP.length > 100 && PROD.some((f) => rel(f) === 'src/renderer/ThreeRenderer.js'),
    `C0a: skan obejmuje kod produkcyjny (${PROD.length} plików, z ThreeRenderer) i keepery (${KEEP.length})`);
  const syn = norm('// MapLabelLayer w komentarzu\r\nconst a = 1; // isHudLabelsOn\r\n/* _syncSensorOverlay\r\n */\r\nnew MapLabelLayer();\r\n');
  const synHits = hitsIn(stripComments(syn), idRe('MapLabelLayer'), 'syn');
  ok(synHits.length === 1 && synHits[0] === 'syn:5' && hitsIn(stripComments(syn), idRe('isHudLabelsOn'), 'syn').length === 0
      && hitsIn(stripComments(syn), idRe('_syncSensorOverlay'), 'syn').length === 0,
    `C0b: komentarze (liniowe i blokowe, CRLF) zdjęte, kod liczony z prawdziwym numerem linii (${synHits.join(', ')})`);
  const b = 'tr.getStationScreenPosition(s); prefs.fleetMapLabelsVisible; this._hudRebuildPlanetoidOrbits();';
  ok(!idRe('getScreenPosition').test(b) && !idRe('fleetMapLabels').test(b) && !idRe('_rebuildPlanetoidOrbits').test(b)
      && idRe('getScreenPosition').test('tr.getScreenPosition(id)') && idRe('_rebuildPlanetoidOrbits').test('this._rebuildPlanetoidOrbits()'),
    'C0c: granica identyfikatora — `getStationScreenPosition` / `fleetMapLabelsVisible` / `_hudRebuildPlanetoidOrbits` to nie trafienia, `getScreenPosition(` i `_rebuildPlanetoidOrbits(` — tak');
}

// ═══ C1 ══════════════════════════════════════════════════════════════════════
header('C1  plik usuniętego modułu');
const GONE_MODULES = ['MapLabelLayer'];
{
  const left = GONE_MODULES.filter((m) => existsSync(join(SRC, 'ui', m + '.js')));
  ok(left.length === 0 && existsSync(join(SRC, 'ui', 'HudLabelLayer.js')),
    'C1a: `src/ui/MapLabelLayer.js` usunięty (następca: `src/ui/HudLabelLayer.js` na miejscu)' + (left.length ? ' — został: ' + left.join(', ') : ''));
}

// ═══ C2 ══════════════════════════════════════════════════════════════════════
header('C2  importy usuniętego modułu (statyczne i dynamiczne) — kod produkcyjny, keepery, index.html');
{
  const modAlt = GONE_MODULES.map(esc).join('|');
  const impRe = new RegExp(`(?:from\\s*|import\\s*\\(\\s*|import\\s+)['"\`][^'"\`]*\\b(?:${modAlt})\\.js['"\`]`);
  const hits = [];
  for (const f of [...PROD, ...KEEP]) {
    const s = rel(f).startsWith('src/testing/') ? stripComments(norm(readFileSync(f, 'utf8'))) : CLEAN.get(f);
    hits.push(...hitsIn(s, impRe, rel(f)));
  }
  ok(hits.length === 0, 'C2a: żaden plik `src/` nie importuje `MapLabelLayer.js`' + show(hits));
  const html = read('index.html') ?? '';
  ok(html.length > 500 && !new RegExp(`\\b(?:${modAlt})\\.js\\b`).test(html),
    'C2b (STRAŻNIK, zielony po obu stronach — moduły ładuje `main.js`, nie `index.html`): `index.html` nie odwołuje się do usuniętego modułu');
}

// ═══ C3 ══════════════════════════════════════════════════════════════════════
header('C3  identyfikatory usuniętych ścieżek OFF w kodzie produkcyjnym');
const FAMILIES = [
  ['C3a predykaty flag HUD i widoczność H1 radaru', ['isHudOrbitsOn', 'isHudRadarOn', 'isHudLabelsOn', 'isHudRoutesOn', 'isHudAttentionOn',
    'hudOrbitsOn', 'hudRadarOn', 'hudRoutesOn', 'radarLayerVisible']],
  ['C3b dawny styl orbit (hexy — ścieżka OFF `hudOrbits`)', ['_restoreOrbitDefaults', '_showMoonOrbit', '_hideAllMoonOrbits',
    '_showPlanetoidOrbit', '_hideAllPlanetoidOrbits', '_rebuildPlanetoidOrbits']],
  ['C3c pierścienie sensorów 3D (ścieżka OFF `hudRadar`)', ['_syncSensorOverlay', '_upsertSensorRing', '_disposeSensorRing',
    '_disposeAllSensorRings', '_sensorRingMeshes', 'SENSOR_RING_VESSEL_COLOR', 'SENSOR_RING_COLONY_COLOR', 'SENSOR_RING_OPACITY',
    'SENSOR_RING_SEGMENTS', 'SENSOR_RING_Y', 'SENSOR_RING_MAX_COLONY_AU']],
  ['C3d plakietki `MapLabelLayer` i ich pomocniki (ścieżka OFF `hudLabels`)', ['MapLabelLayer', '_mapLabelLayer', 'gatherColonyLabels',
    'gatherStationLabels', 'labelLOD', 'stationLabelLOD', 'STATION_MARKER_FLOOR', 'stackLabels', 'toLogicalPx', 'vesselLabelLOD',
    'COLONY_ICON', 'STATION_ICON', 'LOD_PLAQUE_FULL', 'LOD_PLAQUE_FADE', 'LOD_MARKER_FADE', 'LABEL_FADE_END', 'VESSEL_DETAIL_FULL',
    'VESSEL_DETAIL_FADE']],
  ['C3e pozycje ekranowe renderera bez konsumenta (plakietki, ramki RTS)', ['getScreenPosition', 'getBodyScreenPosition',
    'getVesselScreenPosition', 'getCameraDistance']],
  ['C3f linie tras 3D (ścieżka OFF `hudRoutes`)', ['routeLine', '_orderLineColor', '_disposeAllRouteLines', 'ROUTE_LINE_HOVER_OPACITY',
    'ROUTE_LINE_BASE_OPACITY', 'ROUTE_LINE_HOVER_COLOR', 'ROUTE_LINE_BASE_WIDTH', 'ROUTE_LINE_HOVER_WIDTH', 'routeAttention']],
  ['C3g błysk H1 na granicy radaru (ścieżka OFF `hudAttention`)', ['flashArc', 'flashAlpha', 'FLASH_MS', 'FLASH_HALF_DEG', '_flashes']],
];
{
  for (const [label, ids] of FAMILIES) {
    const hits = [];
    for (const id of ids) for (const h of prodHits(idRe(id))) hits.push(id + ' @ ' + h);
    ok(hits.length === 0, `${label}: ${ids.length} nazw — brak odwołań` + show(hits));
  }
  // Ramki RTS i puls celownika na zegarze realnym (ścieżka OFF `hudAttention`) — bez nazw własnych: kształt metod.
  const ui = readClean('src/scenes/UIManager.js') ?? '', tr = readClean('src/renderer/ThreeRenderer.js') ?? '';
  const brk = body(ui, '  _drawBracketForVessel(ctx, tr, id, isLead) {');
  const mark = body(tr, '  _syncEnemyAlertMarkers() {');
  ok(brk.length > 100 && /if \(!id \|\| !isLead\) return;/.test(brk) && !/corner\(|getVesselScreenPosition/.test(brk)
      && mark.length > 100 && /simClockMs\(\)/.test(mark) && !/performance\.now|Date\.now/.test(mark),
    'C3h: ramki RTS statku usunięte (UIManager rysuje wyłącznie paski prowadzącego), puls celownika wroga wyłącznie na zegarze symulacji');
}

// ═══ C4 ══════════════════════════════════════════════════════════════════════
header('C4  flagi HUD i dawnych ścieżek — klucze usunięte z FEATURES, kod ich nie czyta');
const GONE_FLAGS = ['hudOrbits', 'hudRadar', 'hudLabels', 'hudRoutes', 'hudAttention', 'm4SensorOverlay', 'mapLabels', 'fleetMapLabels',
  'fcOrderLines'];
{
  const F = GAME_CONFIG?.FEATURES ?? {};
  const keys = Object.keys(F);
  const still = GONE_FLAGS.filter((k) => keys.includes(k));
  ok(keys.length > 20 && still.length === 0, `C4a: \`GAME_CONFIG.FEATURES\` (${keys.length} kluczy) bez flag ARKUSZA HUD i dawnych ścieżek`
    + (still.length ? ' — zostały: ' + still.join(', ') : ''));
  const alt = GONE_FLAGS.map(esc).join('|');
  const dotRe = new RegExp(`(?<![\\w$])(?:FEATURES|features|feat)\\s*\\??\\.\\s*(?:${alt})(?![\\w$])`);
  const brRe = new RegExp(`\\[\\s*['"\`](?:${alt})['"\`]\\s*\\]`);
  const hits = [...prodHits(dotRe), ...prodHits(brRe)];
  ok(hits.length === 0, 'C4b: kod produkcyjny nie czyta pola żadnej z tych flag (`FEATURES.x`, `features?.x`, `[\'x\']`)' + show(hits));
}

// ═══ C5 ══════════════════════════════════════════════════════════════════════
header('C5  zdarzenia i preferencje dawnych ścieżek — bez czytelnika w rysunku');
{
  const onRe = /EventBus\.on\(\s*['"`]ui:sensorOverlayToggle['"`]/;
  const subs = prodHits(onRe);
  ok(subs.length === 0, 'C5a: `ui:sensorOverlayToggle` (dawny przełącznik pierścieni 3D) bez słuchacza w kodzie produkcyjnym' + show(subs)
    + ' (nadawca w trybie Y zostaje bez skutku — Finding 573)');
  const DRAW = ['src/renderer/ThreeRenderer.js', 'src/ui/HudLayer.js', 'src/ui/HudRadarLayer.js', 'src/ui/HudRadarLogic.js',
    'src/ui/HudLayerChipsLogic.js', 'src/ui/BottomBar.js', 'src/scenes/UIManager.js'];
  const readers = DRAW.filter((p) => /sensorOverlayVisible/.test(readClean(p) ?? ''));
  ok(DRAW.every((p) => (readClean(p) ?? '').length > 1000) && readers.length === 0,
    'C5b: rysunek mapy i menu ☰ nie czytają `uiPrefs.sensorOverlayVisible` (widoczność radaru = chip [R])'
    + (readers.length ? ' — czytają: ' + readers.join(', ') : ''));
}

// ═══ C6 ══════════════════════════════════════════════════════════════════════
header('C6  KONTROLE — co ZOSTAJE (zielone po obu stronach)');
{
  const hl = readClean('src/ui/HudLayer.js') ?? '', gs = readClean('src/scenes/GameScene.js') ?? '', ui = readClean('src/scenes/UIManager.js') ?? '';
  const tr = readClean('src/renderer/ThreeRenderer.js') ?? '';
  // PRZECELOWANE 2026-10-29 (ZNACZNIK STATKU SM-1): między radarem a etykietami podwarstwa znacznika statku (`HudShipMarkerLayer`).
  ok(/_defaultSublayers\(\)\s*\{\s*return \[new HudRouteLayer\(this\), new HudRadarLayer\(this\), new HudShipMarkerLayer\(this\), new HudLabelLayer\(this\), new HudFocusLayer\(this\)\];/.test(hl)
      && /new HudLayer\(document\.getElementById\('hud-canvas'\)\)/.test(gs) && /hudLayer\?\.handleClick\?\.\(/.test(ui),
    'C6a: warstwa HUD — trasy, radar, znacznik statku, etykiety, nawiasy; `GameScene` tworzy ją na `#hud-canvas`; `UIManager` przekazuje klik');
  ok(/^\s{2}getAllVisibleLabels\s*\(/m.test(tr) && /^\s{2}getStationScreenPosition\s*\(/m.test(tr) && /this\._drawAllLabels\(ctx, tr\)/.test(ui),
    'C6b: etykiety CTRL zostają (`getAllVisibleLabels`, `getStationScreenPosition`, `_drawAllLabels`)');
  ok(/^\s{2}_syncHudOrbits\s*\(/m.test(tr) && /^\s{2}_hudRebuildPlanetoidOrbits\s*\(/m.test(tr) && /^\s{2}_hudRestyleOrbits\s*\(/m.test(tr),
    'C6c: orbity w kolorach motywu zostają (`_syncHudOrbits`, `_hudRebuildPlanetoidOrbits`, `_hudRestyleOrbits`)');
  const rl = readClean('src/ui/HudRadarLogic.js') ?? '', ml = readClean('src/ui/MapLabelLogic.js') ?? '';
  ok(['bearingRad', 'proximityFlashPair', 'nearestCoveringColony'].every((n) => new RegExp(`^export function ${n}\\s*\\(`, 'm').test(rl))
      && ['gatherVesselLabels', 'edgeIndicators', 'stationStatusBadges', 'systemDisplayName'].every((n) => new RegExp(`^export function ${n}\\s*\\(`, 'm').test(ml)),
    'C6d: logika „obcy w zasięgu” radaru (alerty) i wejście etykiet warstwy HUD (`MapLabelLogic`) zostają');
  const cl = readClean('src/ui/HudLayerChipsLogic.js') ?? '', lab = readClean('src/ui/HudLabelLayer.js') ?? '';
  ok(/uiPrefs\?\.hudRadarVisible !== false/.test(cl) && /K\.uiPrefs\?\.fleetMapLabelsVisible !== false/.test(lab),
    'C6e: preferencje zapisu czytane dalej — dawny `hudRadarVisible` (chip [R]), `fleetMapLabelsVisible` (☰ „Plakietki floty”)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
