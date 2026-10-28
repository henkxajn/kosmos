// S3.4 FAZA 5 — smoke: MapLabelLogic (czyste helpery etykiet mapy). Node, bez canvas/three.
// Uruchom: node src/testing/smoke/map_labels_smoke.mjs
//
// ⚠ PRZECELOWANE 2026-10-28 (ARKUSZ HUD B-Z — flaga `hudLabels` na stałe ON, plakietki `MapLabelLayer` usunięte): helpery
//   wyłącznie dawnych plakietek (`gatherColonyLabels`, `gatherStationLabels`, LOD plakietek i znacznika stacji,
//   `stackLabels`, ikony kolonii / stacji, `toLogicalPx`, LOD detali statków) usunięte razem z nimi — sekcje 1, 2, 4, 5, 6
//   z S3.4 F5 zastąpione pinami tego, co zostaje, i tego, czym warstwa etykiet HUD je zastąpiła:
//   1. eksporty: usunięte vs zostające (wejście warstwy etykiet HUD i strzałek krawędzi)
//   2. mgła wojny etykiet kolonii i stacji warstwy HUD (`HudLabelLayer`, pin źródłowy): kolonie z `getPlayerColonies`
//      (NIGDY `getAllColonies`), stacje AI poza etykietami stałymi, plakietka statusu stacji z `stationStatusBadges`
//   3. `stationStatusBadges` — kolejność building → no_crew → no_power (bez zmian od S3.4 F5)
//   4. `gatherVesselLabels` (wejście etykiet statków warstwy HUD): własne w oglądanym układzie; wrak i inny układ — bez;
//      wróg `unknown` — bez, `rumor` — „?” bez roli, `contact` — nazwa (Finding 568, wariant „b”); alerty wroga nie wyciekają
//   Strzałki krawędzi (`edgeIndicators`) — `map_insets_single_source_smoke` M3 / M4.

import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.window = { localStorage: globalThis.localStorage, KOSMOS: {} };

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

// Namespace — usunięte eksporty mają być `undefined`, a nie wywracać ładowania suity.
const ML = await import('../../ui/MapLabelLogic.js');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

// ═══════════════════════════════════════════════════════════════════════════
// 1. Eksporty — helpery dawnych plakietek usunięte, wejście warstwy etykiet HUD zostaje
// ═══════════════════════════════════════════════════════════════════════════
{
  const GONE = ['gatherColonyLabels', 'gatherStationLabels', 'labelLOD', 'stationLabelLOD', 'STATION_MARKER_FLOOR', 'stackLabels',
    'COLONY_ICON', 'STATION_ICON', 'LOD_PLAQUE_FULL', 'LOD_PLAQUE_FADE', 'LOD_MARKER_FADE', 'LABEL_FADE_END', 'toLogicalPx',
    'vesselLabelLOD', 'VESSEL_DETAIL_FULL', 'VESSEL_DETAIL_FADE'];
  const still = GONE.filter(n => ML[n] !== undefined);
  T(`1.1 (B-Z) helpery plakietek MapLabelLayer usunięte (${GONE.length}; zostały: ${still.join(', ') || '—'})`, still.length === 0);
  const KEEP = ['stationStatusBadges', 'BADGE_ICON', 'systemDisplayName', 'gatherVesselLabels', 'EDGE_MARGIN', 'EDGE_BANDS', 'edgeIndicators'];
  const miss = KEEP.filter(n => ML[n] === undefined);
  T(`1.2 KONTROLA: helpery warstwy etykiet HUD zostają (${KEEP.length}; brak: ${miss.join(', ') || '—'})`, miss.length === 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Mgła wojny etykiet kolonii i stacji — warstwa etykiet HUD (pin źródłowy)
// ═══════════════════════════════════════════════════════════════════════════
{
  const hl = strip(readFileSync(new URL('../../ui/HudLabelLayer.js', import.meta.url), 'utf8'));
  const prep = hl.slice(hl.indexOf('  prepare(F) {'), hl.indexOf('\n  }\n', hl.indexOf('  prepare(F) {')));
  T('2.0 KONTROLA: `HudLabelLayer.prepare` znaleziona', prep.length > 500);
  T('2.1 INWARIANT: kolonie z `getPlayerColonies`, NIGDY `getAllColonies` (mgła wojny)',
    /cm\?\.getPlayerColonies\?\.\(\)/.test(prep) && !/getAllColonies/.test(hl));
  T('2.2 stacje AI poza etykietami stałymi', /if \(\(st\.ownerEmpireId \?\? 'player'\) !== 'player'\) continue;/.test(prep));
  T('2.3 plakietka statusu stacji z `stationStatusBadges`', /badges: stationStatusBadges\(st\)/.test(prep));
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. stationStatusBadges — kolejność building → no_crew → no_power
// ═══════════════════════════════════════════════════════════════════════════
{
  const { stationStatusBadges, BADGE_ICON } = ML;
  T('3.1 czysta stacja → brak badge', stationStatusBadges({ modules: [] }).length === 0);
  T('3.2 budowa modułu → building', stationStatusBadges({ modules: [], pendingModuleOrders: [{}] }).join() === 'building');
  T('3.3 budowa statku → building', stationStatusBadges({ modules: [], shipQueues: [{}] }).join() === 'building');
  T('3.4 no_crew', stationStatusBadges({ modules: [{ active: false, inactiveReason: 'no_crew' }] }).join() === 'no_crew');
  T('3.5 no_power', stationStatusBadges({ modules: [{ active: false, inactiveReason: 'no_power' }] }).join() === 'no_power');
  T('3.6 kolejność building→no_crew→no_power', stationStatusBadges({
    pendingModuleOrders: [{}],
    modules: [{ active: false, inactiveReason: 'no_power' }, { active: false, inactiveReason: 'no_crew' }],
  }).join() === 'building,no_crew,no_power');
  T('3.7 aktywne moduły nie dają badge', stationStatusBadges({ modules: [{ active: true }, { active: undefined }] }).length === 0);
  T('3.8 BADGE_ICON kompletny', BADGE_ICON.building && BADGE_ICON.no_crew && BADGE_ICON.no_power);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. gatherVesselLabels — wejście etykiet statków warstwy HUD (mgła wojny, układ ściśle)
// ═══════════════════════════════════════════════════════════════════════════
{
  const mk = (id, o = {}) => ({ id, name: 'N_' + id, shipId: 'hull_frigate', systemId: 'sys_home', status: 'idle', mission: null,
    position: { state: 'orbiting', x: 0, y: 0, dockedAt: null }, fuel: { current: 10, max: 10 }, modules: [], ...o });
  const foe = { ownerEmpireId: 'emp_1', owner: 'emp_1', isEnemy: true };
  const vs = [mk('own'), mk('wreck', { isWreck: true }), mk('far', { systemId: 'sys_A' }),
    mk('eU', foe), mk('eR', foe), mk('eC', foe)];
  const Q = { eU: 'unknown', eR: 'rumor', eC: 'contact' };
  let pts = [], threw = null;
  try { pts = ML.gatherVesselLabels(vs, { activeSystemId: 'sys_home', getScreenPos: () => ({ x: 10, y: 10 }), enemyQuality: (id) => Q[id] }); }
  catch (e) { threw = e; }
  const by = (id) => pts.find(p => p.id === id);
  T(`4.0 KONTROLA: bez wyjątku (${threw?.message ?? 'ok'})`, !threw && Array.isArray(pts));
  T('4.1 własny w oglądanym układzie — etykieta z nazwą', by('own')?.kind === 'own' && by('own')?.name === 'N_own');
  T('4.2 wrak i statek innego układu — bez etykiety', !by('wreck') && !by('far'));
  T('4.3 wróg `unknown` — bez etykiety (mgła wojny)', !by('eU'));
  T('4.4 wróg `rumor` — „?” bez roli', by('eR')?.name === '?' && by('eR')?.glyph === null && by('eR')?.kind === 'enemy');
  T('4.5 wróg `contact` — nazwa (Finding 568, wariant „b”)', by('eC')?.name === 'N_eC' && by('eC')?.kind === 'enemy');
  T('4.6 alerty i flota wroga nie wyciekają', by('eC')?.alertCount === 0 && by('eC')?.fleetId === null);
}

// ── Podsumowanie ─────────────────────────────────────────────────────────────
console.log(`\nS3.4 FAZA 5 (MapLabelLogic) smoke: ${pass}/${pass + fail} PASS${fail ? `  (${fail} FAIL)` : ''}`);
process.exit(fail ? 1 : 0);
