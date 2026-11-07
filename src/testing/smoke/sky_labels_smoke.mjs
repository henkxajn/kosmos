// NIEBO — etykiety nieba przy CTRL (ARC GALAXY, docs/design/GALAXY_PLAN.md §4 NIEBO; opcja O1 wciągnięta do NIEBO
// decyzją właściciela 2026-10-30). Uruchom:
//   node src/testing/smoke/sky_labels_smoke.mjs
//
// Keeper LOGIKI (protokół F8 / HUD_PLAN §4.0 aneks): reguła widoczności, mgła wojny, role, jedna etykieta na skupisko,
// rzut kierunku, kolejność rysowania. Bez pinów na stałych rysunku (połowa nawiasów, promienie skupisk, fonty, krycie) —
// strojenie okiem. `HudSkyLabelLogic`, `HudSkyLabelLayer`, `HudProjection` i `HudLayer` importują się pod node (bez three
// i DOM); świat (`window.KOSMOS`) i kanwa — atrapy; wyrocznia rzutu — `three.core.js` (ten sam three co gra).
//
// Pokrycie:
//   S1  reguła widoczności — tabela CTRL × SHIFT × overlay × tryb Y (16 stanów); przyrząd bramki zastępuje WYŁĄCZNIE CTRL;
//       brak kopuły chowa zawsze; kolejność powodów; otwiera tylko `=== true`.
//   S2  podwarstwa czyta te pola świata — CTRL `_showAllLabels`, przyrząd `_skyLabelsForced`, SHIFT `_cleanView`
//       (interfejs albo renderer), overlay `isAnyOpen()`, tryb Y `F.tactical`, kopuła `_sky` (bez flagi).
//   S3  mgła wojny (D-GX-18) — nazwa wyłącznie przy `reveal.name`, inaczej „???”; macierz eksploracja × skan × wywiad;
//       jeden punkt składania (A14): etykiety mapy układu i etykiety nieba — ta sama odpowiedź; płyta galaktyki
//       (`GalaxyOutlinerLogic`) składa w tym samym module.
//   S4  role wg relacji — własny (dom, kolonia gracza) `primary`, zbadany `textPrimary`, niezbadany `dim`.
//   S5  jedna etykieta na skupisko — wygrywa najbliższy (remis — mniejszy id), histereza między klatkami.
//   S6  zasłonięcie — gwiazda w tarczy ciała (słońce, planeta) nie dostaje znacznika; tarcza poniżej progu nie zasłania.
//   S7  rzut kierunku W NIESKOŃCZONOŚCI = rzut gwiazdy kopuły (kamera + kierunek × R) dla każdego R; za kamerą — brak.
//   S8  od końca do końca — prawdziwa galaktyka, katalog i niebo z domu: CTRL → znaczniki, bez CTRL / tryb Y / overlay /
//       SHIFT → nic; przyrząd bez CTRL → te same znaczniki; żadnej prawdziwej nazwy nieujawnionego układu; jeden na skupisko.
//   S9  warstwa HUD — podwarstwa nieba ostatnia na liście gry, `drawFirst` rysowana przed resztą; F niesie tryb Y i flagi
//       (bez klucza `skyCatalog`).
//   S10 odległość — `fleet.clusterDistance` („{0} LY”) z separatorem języka (bez nowego klucza); klucz klatki zależy od
//       języka.
// PRZECELOWANE 2026-11-07 (ARC GALAXY G5-B — flaga `skyCatalog` na stałe ON, zakładka Stratcom FMO usunięta): S1 / S2 —
//   parametr bramki `flag` → `dome` (powód „dome”, lista powodów od „dome”); S2 — brak kopuły ⇒ „dome”, podwarstwa nie czyta
//   flag `F.features`; atrapa klatki bez `features.skyCatalog` (bez czytelnika); S3 — bez nogi mapy Stratcom (`fmo._systemReveal`
//   usunięte); lista powierzchni jednego punktu składania: płyta galaktyki (`GalaxyOutlinerLogic`) zamiast FMO; S9 — klatka
//   warstwy niesie FEATURES bez klucza `skyCatalog` (odwrócone). WYCOFANE: S2 `features: { skyCatalog: false }` i `features: {}`
//   (OFF przez flagę ⇒ „flag”).

import '../headless/env.js';           // MUSI być pierwszy
import fs from 'node:fs';
import * as T3 from '../../lib/three.core.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

const L    = await import('../../ui/HudSkyLabelLogic.js');
const SLM  = await import('../../ui/HudSkyLabelLayer.js');
const HPJ  = await import('../../ui/HudProjection.js');
const HL   = await import('../../ui/HudLayer.js');
const HLL  = await import('../../ui/HudLabelLayer.js');
const SRW  = await import('../../utils/SystemRevealWorld.js');
const SC   = await import('../../utils/SkyCatalog.js');
const I18N = await import('../../i18n/i18n.js');
const { GalaxyGenerator } = await import('../../generators/GalaxyGenerator.js');
const { THEME } = await import('../../config/ThemeConfig.js');
const { resolveHudRoles, themeToken } = await import('../../ui/HudPalette.js');

const RANK = { unknown: 0, rumor: 1, contact: 2, detailed: 3 };
const CSS_W = 1600, CSS_H = 1041, UI = 1.25;   // okno właściciela (px CSS) i skala UI
const W = CSS_W / UI, H = CSS_H / UI;          // px logiczne

// ── Kamera i projektor (three — ten sam co gra) ─────────────────────────────────────────────────────────────────────
function mkCamera({ fov = 60, pos = [0, 0, 0], look = [0, 0, -1] } = {}) {
  const cam = new T3.PerspectiveCamera(fov, CSS_W / CSS_H, 0.001, 1e7);
  cam.position.set(...pos);
  cam.lookAt(new T3.Vector3(...look));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}
const projOf = (cam) => HPJ.makeHudProjector({ view: cam.matrixWorldInverse.elements, proj: cam.projectionMatrix.elements, cssW: CSS_W, cssH: CSS_H, uiScale: UI });

// ── Syntetyczne niebo: kolumny jak `SkyCatalog` (ids / index / pos) i bufor jak `skyFrom` (count / real / src / dir) ──
// `list[0]` = obserwator (aktywny układ — poza niebem). Pozycje i kierunki w osiach świata.
function mkSynth(list) {
  const ids = list.map((s) => s.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const pos = new Float64Array(list.length * 3);
  list.forEach((s, i) => { pos[i * 3] = s.pos[0]; pos[i * 3 + 1] = s.pos[1]; pos[i * 3 + 2] = s.pos[2]; });
  const n = list.length - 1;
  const buf = { count: n, real: new Uint8Array(n), src: new Int32Array(n), dir: new Float32Array(n * 3) };
  for (let k = 0; k < n; k++) {
    const i = k + 1;
    const dx = pos[i * 3] - pos[0], dy = pos[i * 3 + 1] - pos[1], dz = pos[i * 3 + 2] - pos[2], l = Math.hypot(dx, dy, dz);
    buf.real[k] = 1; buf.src[k] = i;
    buf.dir[k * 3] = dx / l; buf.dir[k * 3 + 1] = dy / l; buf.dir[k * 3 + 2] = dz / l;
  }
  return { cat: { ids, index, pos }, buf, observer: ids[0] };
}

/** Świat (`window.KOSMOS`) dla podwarstwy: niebo, układy, wywiad, skany, kolonie gracza, ciała (tarcze). */
function mkWorld({ synth, systems, intel = {}, scanned = new Set(), colonies = [], entities = new Map(), bodies = new Map(),
  planets = [], starId = null } = {}) {
  const tr = {
    _sky: {}, _skyBuf: synth.buf, _skyCatalog: synth.cat, _skySystemId: synth.observer,
    _showAllLabels: true, _skyLabelsForced: false, _cleanView: false,
    _planets: new Map(planets.map((id) => [id, {}])), _moons: new Map(), _planetoids: new Map(),
    getBodyWorldInfo: (id) => bodies.get(id) ?? null, getAllVisibleLabels: () => [],
  };
  return {
    threeRenderer: tr,
    uiManager: { _cleanView: false, overlayManager: { open: false, isAnyOpen() { return this.open; } } },
    galaxyData: { systems },
    intelSystem: { isAtLeast: (emp, lvl) => (RANK[intel[emp] ?? 'unknown'] ?? 0) >= RANK[lvl] },
    observatorySystem: { getSystemScanResult: (id) => (scanned.has(id) ? { tier: 1 } : null) },
    colonyManager: { getPlayerColonies: () => colonies },
    entityManager: { get: (id) => entities.get(id) ?? null, getByType: (t) => (t === 'star' && starId ? [{ id: starId }] : []) },
  };
}
const mkF = (K, o = {}) => ({ K, tactical: false, now: 1000, uiScale: UI,
  mapRect: { x: 0, y: 0, w: W, h: H }, roles: resolveHudRoles(THEME), ...o });
const itemOf = (layer, id) => layer._prep.items.find((it) => it.id === id) ?? null;
const markerIds = (c) => (c.markers ?? []).map((m) => m.id).sort();

// ═══ S1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nS1 — reguła widoczności: CTRL × SHIFT × overlay × tryb Y');
{ const B = [false, true]; let rows = 0, shownRows = 0; const bad = [];
  for (const ctrl of B) for (const cleanView of B) for (const overlay of B) for (const yMode of B) {
    rows++;
    const g = L.skyLabelGate({ dome: true, ctrl, cleanView, overlay, yMode });
    const want = ctrl && !cleanView && !overlay && !yMode;
    const reason = want ? null : cleanView ? 'cleanView' : overlay ? 'overlay' : yMode ? 'yMode' : 'ctrl';
    if (g.shown) shownRows++;
    if (g.shown !== want || g.reason !== reason) bad.push(`ctrl=${ctrl} shift=${cleanView} overlay=${overlay} y=${yMode} → ${g.shown}/${g.reason}`);
  }
  ok(`tabela ${rows} stanów: etykiety WYŁĄCZNIE przy CTRL bez SHIFT, overlayu i trybu Y (pokazanych ${shownRows}; złych: ${bad.join('; ') || 'brak'})`,
     rows === 16 && shownRows === 1 && bad.length === 0);
  const badF = [];
  for (const cleanView of B) for (const overlay of B) for (const yMode of B) {
    const g = L.skyLabelGate({ dome: true, ctrl: false, forced: true, cleanView, overlay, yMode });
    if (g.shown !== (!cleanView && !overlay && !yMode)) badF.push(`${cleanView}/${overlay}/${yMode}`);
  }
  ok(`przyrząd bramki (skyMarks(1)) zastępuje WYŁĄCZNIE CTRL — SHIFT, overlay i tryb Y chowają dalej (złych: ${badF.join('; ') || 'brak'})`, badF.length === 0);
  ok('brak kopuły chowa zawsze — także przy CTRL i przyrządzie (powód „dome”)',
     [L.skyLabelGate({ ctrl: true, forced: true }), L.skyLabelGate({ dome: false, ctrl: true })].every((g) => !g.shown && g.reason === 'dome'));
  ok('kolejność powodów = kolejność sprawdzania: dome · cleanView · overlay · yMode · ctrl',
     JSON.stringify(L.SKY_LABEL_HIDE_REASONS) === JSON.stringify(['dome', 'cleanView', 'overlay', 'yMode', 'ctrl'])
     && L.skyLabelGate({ dome: true, cleanView: true, overlay: true, yMode: true }).reason === 'cleanView'
     && L.skyLabelGate({ dome: true, overlay: true, yMode: true }).reason === 'overlay'
     && L.skyLabelGate({ dome: true, yMode: true }).reason === 'yMode');
  ok('otwiera wyłącznie `=== true` (1 / „yes” nie są CTRL ani kopułą)',
     !L.skyLabelGate({ dome: true, ctrl: 1 }).shown && !L.skyLabelGate({ dome: true, ctrl: 'yes' }).shown
     && !L.skyLabelGate({ dome: 1, ctrl: true }).shown && !L.skyLabelGate({ dome: true, forced: 1 }).shown);
}

// Wspólne syntetyczne niebo S2–S6: obserwator w początku, A na wprost kamery, B w prawo, C w lewo-w górę, D za kamerą.
const SYN = mkSynth([
  { id: 'sys_obs', pos: [0, 0, 0] },
  { id: 'sys_a', pos: [0, 0, -5] },
  { id: 'sys_b', pos: [2.4, 0, -6] },
  { id: 'sys_c', pos: [-2.4, 1.2, -6] },
  { id: 'sys_d', pos: [0, 0, 7] },
]);
const SYS_BASE = () => [
  { id: 'sys_obs', name: 'Obserwator', explored: true },
  { id: 'sys_a', name: 'Alfa', explored: false, empireId: 'emp_x' },
  { id: 'sys_b', name: 'Beta', explored: true },
  { id: 'sys_c', name: 'Gamma', explored: false },
  { id: 'sys_d', name: 'Delta', explored: false },
];
const CAM0 = mkCamera();
const PROJ0 = projOf(CAM0);

// ═══ S2 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nS2 — podwarstwa czyta pola świata (CTRL, przyrząd, SHIFT, overlay, tryb Y, kopuła)');
{ const K = mkWorld({ synth: SYN, systems: SYS_BASE() });
  const layer = new SLM.HudSkyLabelLayer(null);
  const B = [false, true]; const bad = []; let n = 0;
  for (const ctrl of B) for (const forced of B) for (const shift of [null, 'ui', 'tr']) for (const overlay of B) for (const y of B) {
    n++;
    K.threeRenderer._showAllLabels = ctrl; K.threeRenderer._skyLabelsForced = forced;
    K.uiManager._cleanView = shift === 'ui'; K.threeRenderer._cleanView = shift === 'tr';
    K.uiManager.overlayManager.open = overlay;
    const F = mkF(K, { tactical: y });
    const key = layer.prepare(F);
    const exp = L.skyLabelGate({ dome: true, ctrl, forced, cleanView: shift != null, overlay, yMode: y });
    const d = layer.debug();
    if (d.shown !== exp.shown || d.reason !== exp.reason || key.startsWith('sky:1:') !== exp.shown
        || (exp.shown ? layer._prep.items.length !== 4 : layer._prep.items.length !== 0)) bad.push(`ctrl=${ctrl} forced=${forced} shift=${shift} overlay=${overlay} y=${y}`);
  }
  ok(`${n} stanów świata (CTRL × przyrząd × SHIFT brak / interfejs / renderer × overlay × tryb Y): bramka podwarstwy = reguła S1 na polach świata, klucz klatki „sky:1” tylko przy pokazaniu (złych: ${bad.join('; ') || 'brak'})`, n === 48 && bad.length === 0);
  K.threeRenderer._showAllLabels = true; K.threeRenderer._skyLabelsForced = false; K.uiManager._cleanView = false; K.threeRenderer._cleanView = false; K.uiManager.overlayManager.open = false;
  // G5-B: flaga `skyCatalog` na stałe ON — jedyną bramką „czy niebo istnieje” jest kopuła; podwarstwa nie czyta `F.features`.
  K.threeRenderer._sky = null;
  layer.prepare(mkF(K));
  const noDome = layer.debug();
  K.threeRenderer._sky = {};
  ok(`brak kopuły (\`_sky\` = null) ⇒ powód „dome”, nic (${noDome.reason}); podwarstwa nie czyta flag \`F.features\``,
     noDome.shown === false && noDome.reason === 'dome' && layer._prep.items.length === 0
     && !/\bfeatures\b/.test(strip(read('../../ui/HudSkyLabelLayer.js'))));
  layer.prepare(mkF(K));
  ok('KONTROLA: w stanie bazowym (CTRL, kopuła) podwarstwa pokazuje 4 prawdziwe układy nieba', layer.debug().shown === true && layer._prep.items.length === 4);
  const empty = new SLM.HudSkyLabelLayer(null);
  const Kn = mkWorld({ synth: SYN, systems: SYS_BASE() }); Kn.threeRenderer._skyBuf = null;
  ok('brak bufora nieba ⇒ nic (klucz „sky:0”, zero pozycji)', empty.prepare(mkF(Kn)).startsWith('sky:0:') && empty._prep.items.length === 0);
}

// ═══ S3 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nS3 — mgła wojny: nazwa tylko przy reveal.name, „???” inaczej; jeden punkt składania (A14)');
{ const t1 = HLL.HudLabelLayer.prototype._t1NameVisible;
  let states = 0, named = 0, hidden = 0; const bad = [];
  for (const explored of [false, true]) for (const scan of [false, true]) for (const lvl of ['unknown', 'rumor', 'contact', 'detailed']) {
    states++;
    const systems = SYS_BASE(); systems[1].explored = explored;
    const K = mkWorld({ synth: SYN, systems, intel: { emp_x: lvl }, scanned: new Set(scan ? ['sys_a'] : []) });
    globalThis.window.KOSMOS = K;
    const layer = new SLM.HudSkyLabelLayer(null);
    layer.prepare(mkF(K));
    const sys = systems[1];
    const canon = SRW.systemRevealFromWorld(K, sys).name === true;
    const it = itemOf(layer, 'sys_a');
    const viaT1 = t1.call({}, { K, activeSystemId: 'sys_a' }) === true;
    if (canon) named++; else hidden++;
    if (!it || it.name !== (canon ? 'Alfa' : '???') || viaT1 !== canon) {
      bad.push(`explored=${explored} scan=${scan} intel=${lvl} → canon=${canon} item=${it?.name} t1=${viaT1}`);
    }
  }
  ok(`macierz ${states} stanów (eksploracja × skan × wywiad): etykieta nieba = kanon; etykiety mapy układu — ta sama odpowiedź (złych: ${bad.join('; ') || 'brak'})`,
     states === 16 && bad.length === 0);
  ok(`KONTROLA nie-jałowości: kanon ujawnia w ${named} stanach i ukrywa w ${hidden}`, named > 0 && hidden > 0);
  { const systems = SYS_BASE();
    const K = mkWorld({ synth: SYN, systems });
    const layer = new SLM.HudSkyLabelLayer(null); layer.prepare(mkF(K));
    ok('KONTROLA: układ zbadany (Beta) — prawdziwa nazwa; niezbadany bez właściciela i wywiadu (Gamma) — „???”',
       itemOf(layer, 'sys_b')?.name === 'Beta' && itemOf(layer, 'sys_c')?.name === '???');
    const missing = mkWorld({ synth: SYN, systems: systems.filter((s) => s.id !== 'sys_c') });
    const l2 = new SLM.HudSkyLabelLayer(null); l2.prepare(mkF(missing));
    ok('układ z katalogu bez rekordu w galaxyData — „???” i niezbadany (fail-closed)', itemOf(l2, 'sys_c')?.name === '???' && itemOf(l2, 'sys_c')?.relation === 'unexplored');
  }
  ok('skyLabelName: prawdziwa nazwa wyłącznie przy `revealed === true` i niepustej nazwie',
     L.skyLabelName({ name: 'Kochab', revealed: true }) === 'Kochab' && L.skyLabelName({ name: 'Kochab', revealed: false }) === '???'
     && L.skyLabelName({ name: 'Kochab', revealed: 1 }) === '???' && L.skyLabelName({ name: '  ', revealed: true }) === '???'
     && L.skyLabelName({ revealed: true }) === '???' && L.skyLabelName() === '???');
  // G5-B: mapa Stratcom (FMO) usunięta — mapą galaktyki jest płyta, której nazwy składa `GalaxyOutlinerLogic`.
  const files = ['../../ui/GalaxyOutlinerLogic.js', '../../ui/HudLabelLayer.js', '../../ui/HudSkyLabelLayer.js', '../../renderer/ThreeRenderer.js'];
  const badSrc = files.filter((f) => { const c = strip(read(f)); return /resolveSystemReveal\s*\(/.test(c) || !c.includes('systemRevealFromWorld('); });
  ok(`powierzchnie z nazwą układu składają kanały w JEDNYM module (\`SystemRevealWorld\`) — bez drugiej kopii trzech kanałów (złe: ${badSrc.join(', ') || 'brak'})`, badSrc.length === 0);
}

// ═══ S4 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nS4 — role wg relacji: własny primary, zbadany textPrimary, niezbadany dim');
{ ok('relacja: dom / kolonia gracza = własny (także zbadany), zbadany = known, reszta = unexplored',
     L.skyLabelRelation({ own: true }) === 'own' && L.skyLabelRelation({ own: true, explored: true }) === 'own'
     && L.skyLabelRelation({ explored: true }) === 'known' && L.skyLabelRelation({}) === 'unexplored' && L.skyLabelRelation() === 'unexplored');
  ok('rola: own → primary, known → textPrimary, unexplored (i nieznana) → dim',
     L.skyLabelRole('own') === 'primary' && L.skyLabelRole('known') === 'textPrimary' && L.skyLabelRole('unexplored') === 'dim' && L.skyLabelRole('???') === 'dim');
  const roles = resolveHudRoles(THEME), tp = themeToken(THEME, 'textPrimary');
  ok('kolor roli z motywu: primary / dim z ról HUD, textPrimary — token motywu',
     L.skyLabelColor('primary', roles, tp) === roles.primary && L.skyLabelColor('dim', roles, tp) === roles.dim && L.skyLabelColor('textPrimary', roles, tp) === tp);
  const syn = mkSynth([
    { id: 'sys_obs', pos: [0, 0, 0] }, { id: 'sys_home', pos: [1, 0, -4] }, { id: 'sys_col', pos: [-1, 0, -4] },
    { id: 'sys_known', pos: [0, 1, -4] }, { id: 'sys_far', pos: [0, -1, -4] },
  ]);
  const systems = [
    { id: 'sys_obs', name: 'Obserwator', explored: true }, { id: 'sys_home', name: 'Dom', isHome: true, explored: true },
    { id: 'sys_col', name: 'Kolonia', explored: false }, { id: 'sys_known', name: 'Znany', explored: true }, { id: 'sys_far', name: 'Daleki', explored: false },
  ];
  const entities = new Map([['p_col', { id: 'p_col', systemId: 'sys_col' }]]);
  const K = mkWorld({ synth: syn, systems, colonies: [{ planetId: 'p_col' }], entities });
  const layer = new SLM.HudSkyLabelLayer(null); layer.prepare(mkF(K));
  const r = (id) => `${itemOf(layer, id)?.relation}/${itemOf(layer, id)?.role}`;
  ok(`podwarstwa: dom ${r('sys_home')}, układ z kolonią gracza ${r('sys_col')}, zbadany ${r('sys_known')}, niezbadany ${r('sys_far')}`,
     r('sys_home') === 'own/primary' && r('sys_col') === 'own/primary' && r('sys_known') === 'known/textPrimary' && r('sys_far') === 'unexplored/dim');
  ok('playerSystemIds: układ ciała kolonii gracza (systemIdOf; ciało bez stempla = dom)',
     [...SLM.playerSystemIds(K)].join() === 'sys_col'
     && [...SLM.playerSystemIds({ colonyManager: { getPlayerColonies: () => [{ planetId: 'p0' }] }, entityManager: { get: () => ({ id: 'p0' }) } })].join() === 'sys_home');
}

// ═══ S5 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nS5 — jedna etykieta na skupisko: wygrywa najbliższy, remis — mniejszy id; histereza');
{ const pts = [
    { id: 'a', x: 100, y: 100, distLy: 5 }, { id: 'b', x: 120, y: 100, distLy: 3 }, { id: 'c', x: 130, y: 110, distLy: 8 },
    { id: 'd', x: 400, y: 400, distLy: 1 },
    { id: 'z', x: 700, y: 100, distLy: 2 }, { id: 'y', x: 710, y: 100, distLy: 2 },
  ];
  const w = L.pickSkyMarkers(pts);
  ok(`trzy skupiska → trzy etykiety: ${w.map((m) => `${m.id}(${m.clusterSize})`).join(', ')}`,
     w.length === 3 && w.find((m) => m.id === 'b')?.clusterSize === 3 && w.find((m) => m.id === 'd')?.clusterSize === 1);
  ok('wygrywa najbliższy układ skupiska (b przed a i c); remis odległości — mniejszy id (y przed z)',
     w.some((m) => m.id === 'b') && !w.some((m) => m.id === 'a' || m.id === 'c') && w.some((m) => m.id === 'y') && !w.some((m) => m.id === 'z'));
  ok('kolejność wyniku — od najbliższego', w.map((m) => m.id).join() === 'd,y,b');
  const prev = new Map();
  const at = (x) => L.pickSkyMarkers([{ id: 'g', x: 0, y: 0, distLy: 1 }, { id: 'h', x, y: 0, distLy: 2 }], { prev }).length;
  const fresh = L.pickSkyMarkers([{ id: 'g', x: 0, y: 0, distLy: 1 }, { id: 'h', x: 50, y: 0, distLy: 2 }]).length;
  const n40 = at(40), n50 = at(50), n60 = at(60), n50b = at(50);
  ok(`histereza: między wejściem a wyjściem skupisko trwa, gdy było razem (40 px → ${n40}, potem 50 px → ${n50}, 60 px → ${n60}, znów 50 px → ${n50b}; bez pamięci 50 px → ${fresh})`,
     n40 === 1 && n50 === 1 && n60 === 2 && n50b === 2 && fresh === 2);
  ok('punkty bez położenia albo odległości pomijane; pusta lista — pusto',
     L.pickSkyMarkers([{ id: 'q', x: NaN, y: 0, distLy: 1 }, { id: 'r', x: 0, y: 0 }]).length === 0 && L.pickSkyMarkers([]).length === 0 && L.pickSkyMarkers(null).length === 0);
}

// ═══ S6 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nS6 — zasłonięcie: tarcza ciała zasłania gwiazdę nieba');
{ const D = [{ cx: 100, cy: 100, r: 10 }];
  ok('punkt w tarczy i na jej brzegu — zasłonięty; poza — nie; tarcza poniżej progu — nie zasłania; punkt bez położenia — ukryty',
     L.coveredByDisc(105, 100, D) && L.coveredByDisc(110, 100, D) && !L.coveredByDisc(111, 100, D)
     && !L.coveredByDisc(100, 100, [{ cx: 100, cy: 100, r: L.HUD_SKY_LABELS.MIN_DISC_PX / 2 }]) && L.coveredByDisc(NaN, 0, D));
  // Ciała: planeta na kierunku A (10 j. przed kamerą), słońce na kierunku B.
  const dA = [SYN.buf.dir[0], SYN.buf.dir[1], SYN.buf.dir[2]], dB = [SYN.buf.dir[3], SYN.buf.dir[4], SYN.buf.dir[5]];
  const bodies = new Map([
    ['p1', { x: dA[0] * 10, y: dA[1] * 10, z: dA[2] * 10, r: 0.5 }],
    ['star_1', { x: dB[0] * 40, y: dB[1] * 40, z: dB[2] * 40, r: 2 }],
  ]);
  const run = (withBodies) => {
    const K = mkWorld({ synth: SYN, systems: SYS_BASE(), bodies: withBodies ? bodies : new Map(), planets: withBodies ? ['p1'] : [], starId: withBodies ? 'star_1' : null });
    const layer = new SLM.HudSkyLabelLayer(null); const F = mkF(K);
    layer.prepare(F); return markerIds(layer.collect(F, PROJ0));
  };
  const bare = run(false), covered = run(true);
  ok(`bez ciał: znaczniki ${bare.join(', ')} (D za kamerą — brak)`, bare.join() === 'sys_a,sys_b,sys_c');
  ok(`planeta na kierunku A i słońce na kierunku B zasłaniają ich znaczniki: ${covered.join(', ')}`, covered.join() === 'sys_c');
}

// ═══ S7 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nS7 — rzut kierunku w nieskończoności = rzut gwiazdy kopuły (kamera + kierunek × R)');
{ const cam = mkCamera({ fov: 55, pos: [12, -7, 30], look: [100, 20, -50] });
  const proj = projOf(cam);
  let s = 12345; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  let front = 0, behind = 0, worst = 0, worstOracle = 0, nullBad = 0;
  for (let i = 0; i < 400; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    const d = [r * Math.cos(th), u, r * Math.sin(th)];
    const p = proj.direction(...d);
    const atR = (R) => proj.point(cam.position.x + d[0] * R, cam.position.y + d[1] * R, cam.position.z + d[2] * R);
    const p3 = atR(1e3), p5 = atR(1e5);
    if ((p === null) !== (p5 === null) || (p === null) !== (p3 === null)) { nullBad++; continue; }
    if (!p) { behind++; continue; }
    front++;
    worst = Math.max(worst, Math.hypot(p.x - p3.x, p.y - p3.y), Math.hypot(p.x - p5.x, p.y - p5.y));
    const v = new T3.Vector3(cam.position.x + d[0] * 1e4, cam.position.y + d[1] * 1e4, cam.position.z + d[2] * 1e4).project(cam);
    worstOracle = Math.max(worstOracle, Math.hypot(p.x - (v.x * 0.5 + 0.5) * W, p.y - (-v.y * 0.5 + 0.5) * H));
  }
  ok(`${front} kierunków przed kamerą: rzut kierunku = rzut punktu kamera + d × R dla R = 10³ i 10⁵ (najgorzej ${worst.toExponential(1)} px)`, front > 50 && worst < 1e-6);
  ok(`wyrocznia three (Vector3.project): najgorzej ${worstOracle.toExponential(1)} px`, worstOracle < 1e-6);
  ok(`${behind} kierunków za kamerą — brak rzutu (zgodnie z punktem kopuły; niezgodnych: ${nullBad})`, behind > 50 && nullBad === 0);
}

// ═══ S8 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nS8 — od końca do końca: prawdziwa galaktyka, katalog i niebo z domu');
{ const gal = GalaxyGenerator.generate(123456789, 'Sol', 'G');
  const cat = SC.buildSkyCatalog(gal.systems, SC.skySeedOf(gal));
  const buf = SC.allocSkyBuffers(cat.N); SC.skyFrom(cat, 'sys_home', buf, SC.LIVE_SKY);
  const systems = gal.systems.map((s, i) => ({ ...s, explored: s.isHome === true || i % 3 === 0 }));
  const near = SC.nearestRealSystems(cat, 'sys_home')[0];
  const look = SC.skyDirectionTo(cat, 'sys_home', near.index);
  const cam = mkCamera({ fov: 90, look: [look.x, look.y, look.z] });
  const proj = projOf(cam);
  const mk = (o = {}) => {
    const K = mkWorld({ synth: { cat, buf, observer: 'sys_home' }, systems });
    Object.assign(K.threeRenderer, o.tr ?? {}); Object.assign(K.uiManager, o.ui ?? {});
    if (o.overlay) K.uiManager.overlayManager.open = true;
    const layer = new SLM.HudSkyLabelLayer(null); const F = mkF(K, o.F ?? {});
    const key = layer.prepare(F); const c = layer.collect(F, proj);
    return { K, layer, key, c };
  };
  const off = mk({ tr: { _showAllLabels: false } });
  ok(`bez CTRL: klucz „${off.key}”, zero znaczników`, off.key === 'sky:0:ctrl' && off.c.count === 0);
  const on = mk();
  ok(`z CTRL: ${on.c.count} znaczników z ${on.layer._prep.items.length} prawdziwych układów nieba`, on.c.count >= 3 && on.layer._prep.items.length === 71);
  let named = 0, masked = 0; const leak = [];
  for (const it of on.layer._prep.items) {
    const sys = systems.find((s) => String(s.id) === it.id);
    const canon = SRW.systemRevealFromWorld(on.K, sys).name === true;
    if (it.name === '???') masked++; else named++;
    if (it.name !== (canon ? sys.name : '???')) leak.push(it.id);
  }
  ok(`wszystkie 71 nazw = kanon mgły wojny (prawdziwych ${named}, „???” ${masked}; złych: ${leak.join(', ') || 'brak'})`, leak.length === 0 && named > 0 && masked > 0);
  const markerLeak = (on.c.markers ?? []).filter((m) => { const sys = systems.find((s) => String(s.id) === m.id); return SRW.systemRevealFromWorld(on.K, sys).name !== true && m.lines?.[0]?.text !== '???'; });
  ok(`żaden znacznik nie podaje prawdziwej nazwy układu nieujawnionego (złych: ${markerLeak.map((m) => m.id).join(', ') || 'brak'})`, markerLeak.length === 0);
  const ms = on.c.markers ?? []; let minD = Infinity;
  for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) minD = Math.min(minD, Math.hypot(ms[i].ax - ms[j].ax, ms[i].ay - ms[j].ay));
  ok(`jeden znacznik na skupisko: najbliższe dwa znaczniki ${Number.isFinite(minD) ? minD.toFixed(1) : '—'} px ≥ promień wejścia skupiska`,
     ms.length >= 2 && minD >= L.HUD_SKY_LABELS.CLUSTER_ENTER);
  ok('znaczniki wyłącznie w obszarze mapy', ms.every((m) => m.ax >= 0 && m.ax <= W && m.ay >= 0 && m.ay <= H));
  const hide = [['tryb Y', mk({ F: { tactical: true } })], ['overlay', mk({ overlay: true })],
    ['SHIFT (interfejs)', mk({ ui: { _cleanView: true } })], ['SHIFT (renderer)', mk({ tr: { _cleanView: true } })]];
  ok(`chowają: ${hide.map(([l, r]) => `${l} ${r.c.count}`).join(', ')}`, hide.every(([, r]) => r.c.count === 0 && r.key.startsWith('sky:0:')));
  const forced = mk({ tr: { _showAllLabels: false, _skyLabelsForced: true } });
  ok(`przyrząd bramki bez CTRL: te same znaczniki co przy CTRL (${forced.c.count})`, markerIds(forced.c).join() === markerIds(on.c).join() && forced.c.count === on.c.count);
}

// ═══ S9 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nS9 — warstwa HUD: podwarstwa nieba ostatnia na liście gry, rysowana pierwsza');
{ const body = strip(read('../../ui/HudLayer.js')).match(/_defaultSublayers\(\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';
  ok('`_defaultSublayers`: `new HudSkyLabelLayer(this)` raz, na końcu listy (zbierana ostatnia)',
     /new HudSkyLabelLayer\(this\)\];/.test(body) && (body.match(/HudSkyLabelLayer/g) ?? []).length === 1);
  const mkCtx = () => { const t = { calls: [] }; return new Proxy(t, { get(o, p) { if (p === 'calls') return o.calls; if (Object.prototype.hasOwnProperty.call(o, p)) return o[p]; return (...a) => { o.calls.push([String(p), ...a]); }; }, set(o, p, v) { o[p] = v; return true; } }); };
  const mkCanvas = () => { const ctx = mkCtx(); return { width: 0, height: 0, ctx, getContext: () => ctx }; };
  let defaults = null, err = null;
  try { defaults = new HL.HudLayer(mkCanvas(), { autoStart: false, now: () => 1000 })._sublayers; } catch (e) { err = e.message; }
  ok(`lista gry: ostatnia podwarstwa = HudSkyLabelLayer, jedyna z \`drawFirst\`${err ? ' (błąd: ' + err + ')' : ''}`,
     !!defaults && defaults.at(-1) instanceof SLM.HudSkyLabelLayer && defaults.filter((s) => s.drawFirst === true).length === 1);
  // Kolejność rysowania — sondy w prawdziwej klatce warstwy (świat jak keeper `hud_layer_smoke`).
  globalThis.innerWidth = CSS_W; globalThis.innerHeight = CSS_H;
  const KH = {
    civMode: true, activeSystemId: 'sys_home', uiScale: UI, planetGlobeOpen: false,
    uiManager: { _cleanView: false, overlayManager: { isAnyOpen: () => false }, getSelectedVesselIds: () => [], getSelectedVesselId: () => null, _selectedEntity: null, getSelectedFleetId: () => null },
    threeRenderer: { _cleanView: false, _renderingEnabled: true, _contextLost: false, _pingedEnemyId: null, renderer: { getPixelRatio: () => 1.5 },
      getCameraMoveEpoch: () => 1, getHudView: () => ({ view: CAM0.matrixWorldInverse.elements, proj: CAM0.projectionMatrix.elements, fovDeg: 60, cssW: CSS_W, cssH: CSS_H, worldPerAU: 11 }) },
    tacticalMode: { isActive: false }, timeSystem: { simClockMs: null },
  };
  globalThis.window.KOSMOS = KH;
  const order = (firstOn) => {
    const log = []; let lastF = null;
    const probe = (name, drawFirst) => ({ drawFirst, prepare(F) { lastF = F; return name; }, collect() { return { count: 1, animating: false }; }, draw() { log.push(name); } });
    const hud = new HL.HudLayer(mkCanvas(), { autoStart: false, now: () => 1000, sublayers: [probe('reszta', false), probe('niebo', firstOn)] });
    hud.frame(1000);
    return { log: log.join(','), F: lastF };
  };
  const a = order(true), b = order(false);
  ok(`\`drawFirst\` rysowana przed resztą mimo miejsca na końcu listy (${a.log}); bez flagi — kolejność listy (${b.log})`, a.log === 'niebo,reszta' && b.log === 'reszta,niebo');
  KH.tacticalMode.isActive = true;
  const c = order(true);
  // G5-B — ODWRÓCONE: flaga `skyCatalog` na stałe ON, klucza w FEATURES brak (bramką nieba jest kopuła — S2).
  ok('klatka warstwy niesie tryb Y (`F.tactical` z `tacticalMode.isActive`) i flagi `FEATURES` (innych podwarstw) — bez klucza `skyCatalog`',
     a.F?.tactical === false && c.F?.tactical === true && typeof c.F?.features === 'object' && 'fcBrackets' in (c.F?.features ?? {})
     && !('skyCatalog' in (c.F?.features ?? {})));
}

// ═══ S10 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nS10 — odległość: fleet.clusterDistance + separator języka, bez nowego klucza');
{ const syn = mkSynth([{ id: 'sys_obs', pos: [0, 0, 0] }, { id: 'sys_q', pos: [0, 0, -3.947] }]);
  const K = mkWorld({ synth: syn, systems: [{ id: 'sys_obs', explored: true }, { id: 'sys_q', name: 'Kochab', explored: true }] });
  const was = I18N.getLocale();
  const at = (loc) => { I18N.setLocale(loc); const layer = new SLM.HudSkyLabelLayer(null); const key = layer.prepare(mkF(K)); return { key, dist: itemOf(layer, 'sys_q')?.dist }; };
  const pl = at('pl'), en = at('en');
  I18N.setLocale(was);
  ok(`PL „${pl.dist}”, EN „${en.dist}”`, pl.dist === '3,9 LY' && en.dist === '3.9 LY');
  ok('klucz klatki zależy od języka (zmiana języka przerysowuje etykiety)', pl.key !== en.key);
  const keys = [...new Set(['../../ui/HudSkyLabelLayer.js', '../../ui/HudSkyLabelLogic.js']
    .flatMap((f) => [...strip(read(f)).matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1])))];
  ok(`jedyny klucz tłumaczeń etykiet nieba: ${keys.join(', ') || 'brak'} (istniejący — bez nowego klucza)`, keys.length === 1 && keys[0] === 'fleet.clusterDistance');
}

console.log('\n' + (fail ? 'FAIL' : 'OK') + '  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
