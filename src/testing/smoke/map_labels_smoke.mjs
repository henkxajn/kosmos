// S3.4 FAZA 5 — smoke: MapLabelLogic (czyste helpery etykiet mapy). Node, bez canvas/three.
// Uruchom: node tmp_map_labels_smoke.mjs
//
// Pokrywa: mgła wojny (getPlayerColonies, NIGDY getAllColonies), ikony typu, POP (outpost=null),
// stacje gracza only, badge statusu (kolejność), LOD progowe (K1 cross-fade), stacking (K2 greedy).

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.window = { localStorage: globalThis.localStorage, KOSMOS: {} };

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };

const {
  gatherColonyLabels, gatherStationLabels, stationStatusBadges,
  labelLOD, stationLabelLOD, STATION_MARKER_FLOOR, stackLabels,
  COLONY_ICON, STATION_ICON, BADGE_ICON,
  LOD_PLAQUE_FULL, LOD_PLAQUE_FADE, LOD_MARKER_FADE, LABEL_FADE_END,
} = await import('../../ui/MapLabelLogic.js');

// ═══════════════════════════════════════════════════════════════════════════
// 1. gatherColonyLabels — mgła wojny + ikony + POP
// ═══════════════════════════════════════════════════════════════════════════
{
  let getAllCalled = false;
  const colMgr = {
    getAllColonies() { getAllCalled = true; return []; },   // INWARIANT: nie wolno wołać
    getPlayerColonies() {
      return [
        { planetId: 'home', planet: { name: 'Terra Nova' }, civSystem: { population: 12.4 } },
        { planetId: 'p2',   planet: { name: 'Kolonia B' },  civSystem: { population: 5.9 } },
        { planetId: 'p3',   planet: { name: 'Placówka C' }, isOutpost: true },
      ];
    },
  };
  const labels = gatherColonyLabels(colMgr, 'home');
  T('1.1 zwraca 3 etykiety kolonii gracza', labels.length === 3);
  T('1.2 INWARIANT: NIE woła getAllColonies (mgła wojny)', getAllCalled === false);
  const home = labels.find(l => l.id === 'home');
  T('1.3 home: ikona home + nazwa', home?.icon === COLONY_ICON.home && home?.name === 'Terra Nova');
  T('1.4 home: POP zaokrąglony (12.4→12)', home?.pop === 12);
  const colB = labels.find(l => l.id === 'p2');
  T('1.5 kolonia: ikona colony', colB?.icon === COLONY_ICON.colony);
  const out = labels.find(l => l.id === 'p3');
  T('1.6 outpost: ikona outpost + POP=null (brak POPów)', out?.icon === COLONY_ICON.outpost && out?.pop === null);
  T('1.7 brak colMgr → []', gatherColonyLabels(null, 'home').length === 0);
  T('1.8 brak getPlayerColonies → []', gatherColonyLabels({}, 'home').length === 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. gatherStationLabels — tylko stacje gracza + pop/cap + badge
// ═══════════════════════════════════════════════════════════════════════════
{
  const stationSystem = {
    getAllStations() {
      return [
        { id: 'st1', name: 'Stacja Alfa', pop: 3, popCapacity: 5, modules: [], pendingModuleOrders: [], shipQueues: [] },
        { id: 'st_ai', name: 'Cudza', ownerEmpireId: 'emp_2', pop: 9, popCapacity: 9, modules: [] },   // AI → pominięta
      ];
    },
  };
  const labels = gatherStationLabels(stationSystem);
  T('2.1 tylko stacja gracza (AI pominięta)', labels.length === 1 && labels[0].id === 'st1');
  T('2.2 ikona stacji + nazwa', labels[0].icon === STATION_ICON && labels[0].name === 'Stacja Alfa');
  T('2.3 pop/popCapacity', labels[0].pop === 3 && labels[0].popCapacity === 5);
  T('2.4 badges puste (wszystko OK)', Array.isArray(labels[0].badges) && labels[0].badges.length === 0);
  T('2.5 brak stationSystem → []', gatherStationLabels(null).length === 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. stationStatusBadges — kolejność building → no_crew → no_power
// ═══════════════════════════════════════════════════════════════════════════
{
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
// 4. labelLOD — 3-poziomowy LOD (K1) z płynnym cross-fade
// ═══════════════════════════════════════════════════════════════════════════
{
  const near = labelLOD(LOD_PLAQUE_FULL - 10);
  T('4.1 blisko → plakietka pełna (plaque 1 / marker 0)', near.plaqueAlpha === 1 && near.markerAlpha === 0);
  const cross = labelLOD((LOD_PLAQUE_FULL + LOD_PLAQUE_FADE) / 2);
  T('4.2 cross-fade → plaque i marker w (0,1), suma ~1', cross.plaqueAlpha > 0 && cross.plaqueAlpha < 1
    && cross.markerAlpha > 0 && cross.markerAlpha < 1 && Math.abs(cross.plaqueAlpha + cross.markerAlpha - 1) < 0.001);
  const marker = labelLOD((LOD_PLAQUE_FADE + LOD_MARKER_FADE) / 2);
  T('4.3 pasmo znacznika → plaque 0 / marker 1', marker.plaqueAlpha === 0 && marker.markerAlpha === 1);
  const fading = labelLOD((LOD_MARKER_FADE + LABEL_FADE_END) / 2);
  T('4.4 znacznik zanika → plaque 0, marker (0,1)', fading.plaqueAlpha === 0 && fading.markerAlpha > 0 && fading.markerAlpha < 1);
  const far = labelLOD(LABEL_FADE_END + 10);
  T('4.5 bardzo daleko → oba 0 (declutter)', far.plaqueAlpha === 0 && far.markerAlpha === 0);
  const nullLod = labelLOD(null);
  T('4.6 dist=null → plakietka pełna', nullLod.plaqueAlpha === 1 && nullLod.markerAlpha === 0);
  T('4.7 dist=NaN → plakietka pełna', labelLOD(NaN).plaqueAlpha === 1);
  // Monotoniczność: plaqueAlpha nie rośnie z dystansem
  const seq = [100, 160, 200, 260, 320, 400].map(d => labelLOD(d).plaqueAlpha);
  T('4.8 plaqueAlpha monotonicznie nierosnący', seq.every((v, i) => i === 0 || v <= seq[i - 1] + 1e-9));
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. stationLabelLOD — fix znikającej stacji: marker z podłogą przy oddaleniu
//    (kolonie declutterują normalnie — mają widoczną planetę; stacja NIE — GLB sub-pikselowy).
// ═══════════════════════════════════════════════════════════════════════════
{
  const far = LABEL_FADE_END + 60;   // dystans dopasowania układu / tryb Y (frameSystem 380..450)
  T('5.1 kolonia daleko → marker 0 (declutter)', labelLOD(far).markerAlpha === 0);
  T('5.2 stacja daleko → marker ≥ podłoga (nie znika)', stationLabelLOD(far).markerAlpha >= STATION_MARKER_FLOOR);
  T('5.3 stacja daleko → plakietka 0 (tylko marker)', stationLabelLOD(far).plaqueAlpha === 0);
  T('5.4 na FADE_END kolonia znika, stacja żyje',
    labelLOD(LABEL_FADE_END).markerAlpha === 0 && stationLabelLOD(LABEL_FADE_END).markerAlpha >= STATION_MARKER_FLOOR);
  const mid = (LOD_PLAQUE_FADE + LOD_MARKER_FADE) / 2;   // reżim znacznika (plakietka zgasła)
  T('5.5 mid: marker=1 (podłoga nie psuje pełni)', stationLabelLOD(mid).markerAlpha === 1);
  const near = LOD_PLAQUE_FULL - 10;   // faza plakietki
  T('5.6 blisko: stacja == kolonia (podłoga NIE wskrzesza markera)',
    stationLabelLOD(near).markerAlpha === labelLOD(near).markerAlpha
    && stationLabelLOD(near).plaqueAlpha === labelLOD(near).plaqueAlpha);
  T('5.7 podłoga tunable w (0,1]', STATION_MARKER_FLOOR > 0 && STATION_MARKER_FLOOR <= 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. stackLabels — anty-nakładanie (K2), greedy deterministyczny
// ═══════════════════════════════════════════════════════════════════════════
{
  const box = (id, x, y, w = 100, h = 20) => ({ id, anchorX: x, targetY: y, w, h });
  const overlapY = (a, b) => (a.drawY - a.h / 2) < (b.drawY + b.h / 2) && (a.drawY + a.h / 2) > (b.drawY - b.h / 2);
  const overlapX = (a, b) => (a.anchorX - a.w / 2) < (b.anchorX + b.w / 2) && (a.anchorX + a.w / 2) > (b.anchorX - b.w / 2);

  // 6.1 — brak kolizji: drawY = targetY, nieprzesunięte
  const r1 = stackLabels([box('a', 100, 100), box('b', 400, 100)], 3);
  T('6.1 rozłączne w X → bez przesunięcia', r1.every(r => r.drawY === r.targetY && r.displaced === false));

  // 6.2 — dwie kolidujące (ten sam X, bliskie Y): druga zsunięta w dół, po zsunięciu brak nakładania
  const r2 = stackLabels([box('a', 100, 100), box('b', 100, 108)], 3);
  const a2 = r2.find(r => r.id === 'a'), b2 = r2.find(r => r.id === 'b');
  T('6.2 kolizja → jedna zsunięta (displaced)', a2.displaced !== b2.displaced && (a2.displaced || b2.displaced));
  T('6.2b po zsunięciu brak nakładania Y', !(overlapX(a2, b2) && overlapY(a2, b2)));
  T('6.2c zsunięta niżej z odstępem ≥ gap', Math.abs(a2.drawY - b2.drawY) >= 20 + 3 - 0.001);

  // 6.3 — łańcuch 3 nakładających się → wszystkie rozdzielone
  const r3 = stackLabels([box('a', 100, 100), box('b', 100, 105), box('c', 100, 110)], 3);
  let clash = false;
  for (let i = 0; i < r3.length; i++) for (let j = i + 1; j < r3.length; j++)
    if (overlapX(r3[i], r3[j]) && overlapY(r3[i], r3[j])) clash = true;
  T('6.3 łańcuch 3 → brak wzajemnego nakładania', clash === false);

  // 6.4 — ten sam Y ale rozłączne w X → bez przesunięcia (stacking tylko przy kolizji X)
  const r4 = stackLabels([box('a', 100, 100), box('b', 300, 100)], 3);
  T('6.4 ten sam Y, rozłączne X → bez przesunięcia', r4.every(r => r.drawY === r.targetY));

  // 6.5 — determinizm: ten sam wejście → ten sam wynik
  const inp = [box('a', 100, 108), box('b', 100, 100), box('c', 105, 104)];
  const s1 = JSON.stringify(stackLabels(inp, 3).map(r => [r.id, r.drawY]).sort());
  const s2 = JSON.stringify(stackLabels(inp, 3).map(r => [r.id, r.drawY]).sort());
  T('6.5 deterministyczny (2× ten sam wynik)', s1 === s2);
  T('6.6 nie mutuje wejścia', inp[0].targetY === 108 && inp[0].drawY === undefined);
}

// ── Podsumowanie ─────────────────────────────────────────────────────────────
console.log(`\nS3.4 FAZA 5 (MapLabelLogic) smoke: ${pass}/${pass + fail} PASS${fail ? `  (${fail} FAIL)` : ''}`);
process.exit(fail ? 1 : 0);
