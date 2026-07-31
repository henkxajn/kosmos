// C6c-3 follow-up — headless smoke dla PRZEWIJANEGO ship pickera (drawShipPicker internal-scroll-box).
// Dowodzi PRZECIW prawdziwemu importowi (drawStationPickerModal → drawShipPicker) + PRAWDZIWYM helperom
// InfoPanelLayoutLogic (clampScroll/scrollThumb/pruneZones — reuse, nie nowa matematyka). Mirror T6:
// scroll-invariance hit-zon przez WYKONANIE (nie argument geometryczny) — bo ta klasa bugów (hit-zone
// vs scrollowana pozycja) wracała cały arc C6c (steppery, ✕ 2b-ii, pinowany nagłówek).
// Uruchom: node src/testing/smoke/station_ship_picker_scroll_smoke.mjs
//
// Pokrycie:
//   T1  no-overflow: kilka projektów mieści się → scroll klampuje do 0, BRAK kciuka, wszystkie hity buildship obecne.
//   T2  overflow: dużo projektów, krótki panel → kciuk RYSOWANY (fillRect rgba .20, w=3), contentH>viewportH.
//   T3  scroll-invariance hit-zon (via REAL pruneZones): D0 obecny@0 / PRUNOWANY@max; ostatni obecny@max;
//        klik w PIKSEL gdzie był przycisk D0 (pre-scroll) NIE trafia w D0 (ghost-click zażegnany); ✕ przeżywa@max.
//   T4  reuse (ścisły): ret.scroll == clampScroll(rawScroll, ret.contentH, ret.viewportH) — inna matematyka by padła.
//   T5  clip-bounds (fix bleed-through): zarejestrowany clip ctx.rect zawiera pasmo treści [px, top, PW, viewportH].
//   T6  module picker nietknięty: drawStationPickerModal(...,'module') zwraca null, nie rzuca, rejestruje station_mgmt_build.

// ── Shim env: StationManagementView → i18n czyta bare localStorage; renderer czyta window.KOSMOS ──
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = { localStorage: globalThis.localStorage };

const { drawStationPickerModal } = await import('../../ui/StationManagementView.js');
const { clampScroll, scrollThumb, pruneZones } = await import('../../ui/InfoPanelLayoutLogic.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

// ── Mock ctx: rejestruje fillRect (z fillStyle → detekcja kciuka) + rect (clip regions → detekcja pasma) ──
function mockCtx() {
  const rects = [], clips = [];
  const ctx = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, textAlign: '', textBaseline: '',
    measureText: (s) => ({ width: (s ?? '').length * 6 }),
    fillText: () => {}, strokeRect: () => {},
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
    save: () => {}, restore: () => {}, setLineDash: () => {}, clip: () => {},
    _rects: rects, _clips: clips,
  };
  ctx.fillRect = (x, y, w, h) => rects.push({ x, y, w, h, fill: ctx.fillStyle });   // fill snapshot w chwili wołania
  ctx.rect = (x, y, w, h) => clips.push({ x, y, w, h });
  return ctx;
}

// ── View spy: addHit → zones[], hitCount/pruneHits = PRAWDZIWA pruneZones (ścieżka produkcyjna) ──
function makeView(scroll, designs) {
  const zones = [];
  return {
    zones, scroll, designs,
    techIsResearched: () => true,                                    // nic nie zablokowane
    addHit: (x, y, w, h, type, data) => zones.push({ x, y, w, h, type, data: data ?? {} }),
    hitCount: () => zones.length,
    pruneHits: (fromIndex, top, bot) => pruneZones(zones, fromIndex, top, bot),   // == ColonyOverlay._pruneHitsOutside
  };
}

// ── Stacja: depot.getAmount duży → afford=true → canBuild=true → hit buildship na KAŻDY projekt ──
function baseStation() {
  return {
    id: 'st_1', name: 'Stocznia Orbitalna', ownerEmpireId: 'player', stationType: 'orbital_station',
    modules: [], pendingModuleOrders: [],
    depot: { getAmount: () => 99999 },
  };
}
const designs = (n) => Array.from({ length: n }, (_, i) => ({ hullId: 'hull_small', name: `D${i}`, modules: [] }));
const hitTest = (zones, x, y) => zones.find(z => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);   // first-match (mirror BaseOverlay._hitTest)
const buildships = (zones) => zones.filter(z => z.type === 'station_mgmt_buildship');
const findDesign = (zones, name) => zones.find(z => z.type === 'station_mgmt_buildship' && z.data?.name === name);

const HEADER_H = 40;

// ── T1: no-overflow — kilka projektów, wysoki panel → scroll 0, brak kciuka, wszystkie hity ──
console.log('--- T1: no-overflow (mieści się) ---');
{
  const view = makeView(0, designs(2));
  const area = { x: 0, y: 0, w: 800, h: 800 };
  const ret = drawStationPickerModal(mockCtx(), area, baseStation(), view, 'ship');
  ok(`fits: contentH ${ret.contentH} ≤ viewportH ${ret.viewportH}`, ret.contentH <= ret.viewportH);
  ok('fits: ret.scroll klampuje do 0', ret.scroll === 0);
  ok(`fits: oba projekty klikalne (${buildships(view.zones).length}=2)`, buildships(view.zones).length === 2);
}
{
  const view = makeView(0, designs(2));
  const ctx = mockCtx();
  drawStationPickerModal(ctx, { x: 0, y: 0, w: 800, h: 800 }, baseStation(), view, 'ship');
  const thumb = ctx._rects.some(r => r.fill === 'rgba(255,255,255,0.20)' && r.w === 3);
  ok('fits: BRAK kciuka (scrollThumb=null gdy contentH≤viewportH)', thumb === false);
}

// ── T2: overflow — dużo projektów, krótki panel → kciuk rysowany, contentH>viewportH ──
console.log('--- T2: overflow (kciuk + metryki) ---');
{
  const view = makeView(0, designs(10));
  const ctx = mockCtx();
  const ret = drawStationPickerModal(ctx, { x: 0, y: 0, w: 800, h: 300 }, baseStation(), view, 'ship');
  ok(`overflow: contentH ${ret.contentH} > viewportH ${ret.viewportH}`, ret.contentH > ret.viewportH);
  const thumb = ctx._rects.find(r => r.fill === 'rgba(255,255,255,0.20)' && r.w === 3);
  ok('overflow: kciuk RYSOWANY (scrollThumb → fillRect w=3)', !!thumb);
  ok(`overflow: kciuk w prawym skraju (x≈px+PW-4)`, !!thumb && thumb.x > 700);
}

// ── T3: scroll-invariance hit-zon (via REAL pruneZones) — rdzeń fixu ──
console.log('--- T3: hit-zone scroll-invariance (przez WYKONANIE pruneZones) ---');
{
  const st = baseStation();
  const area = { x: 0, y: 0, w: 800, h: 300 };
  // scroll 0 — D0 (pierwszy) w paśmie → klikalny; zapamiętaj jego piksel przycisku.
  const v0 = makeView(0, designs(10));
  drawStationPickerModal(mockCtx(), area, st, v0, 'ship');
  const d0at0 = findDesign(v0.zones, 'D0');
  ok('D0 klikalny @scroll 0 (w paśmie)', !!d0at0);
  const bx = d0at0.x + 2, by0 = d0at0.y + 2;                        // piksel wewnątrz przycisku D0 (pre-scroll)

  // scroll ogromny (klampuje do max) — D0 wyjeżdża ponad pasmo → PRUNOWANY; ostatni wjeżdża w pasmo.
  const vBig = makeView(100000, designs(10));
  const retBig = drawStationPickerModal(mockCtx(), area, st, vBig, 'ship');
  ok(`D0 PRUNOWANY @max scroll (${retBig.scroll}) — nieklikalny off-fold`, !findDesign(vBig.zones, 'D0'));
  ok('ostatni projekt (D9) klikalny @max scroll (wjechał w pasmo)', !!findDesign(vBig.zones, 'D9'));
  // Ghost-click: klik w PIKSEL gdzie SIEDZIAŁ przycisk D0 → NIE odpala akcji D0 (co najwyżej inny, WIDOCZNY projekt).
  const ghost = hitTest(vBig.zones, bx, by0);
  ok(`klik w pozycję pre-scroll D0 (${bx},${by0}) NIE trafia D0 (${ghost?.data?.name ?? '∅'})`, !ghost || ghost.data?.name !== 'D0');
  // ✕ close przeżywa prune @max (registrowany PRZED hitStart) — regression confirm (pkt 5 live-gate).
  ok('✕ close obecny @max scroll (przeżywa prune)', vBig.zones.some(z => z.type === 'station_mgmt_shippicker_close'));
  // Absorber tła obecny (dodany PO prune) — klik poza pudełkiem dalej zamyka.
  ok('shippicker_bg absorber obecny @max scroll', vBig.zones.some(z => z.type === 'station_mgmt_shippicker_bg'));
}

// ── T4: reuse ścisły — ret.scroll == clampScroll(raw, contentH, viewportH) (nie nowa matematyka) ──
console.log('--- T4: reuse clampScroll (ścisła równość) ---');
{
  const RAW = 100000;
  const view = makeView(RAW, designs(10));
  const ret = drawStationPickerModal(mockCtx(), { x: 0, y: 0, w: 800, h: 300 }, baseStation(), view, 'ship');
  const expected = clampScroll(RAW, ret.contentH, ret.viewportH);
  ok(`ret.scroll ${ret.scroll} == clampScroll(${RAW}, ${ret.contentH}, ${ret.viewportH}) = ${expected}`, ret.scroll === expected);
  ok('max scroll = max(0, contentH − viewportH)', ret.scroll === Math.max(0, ret.contentH - ret.viewportH));
}

// ── T5: clip-bounds — pasmo treści clipowane [px, top, PW, viewportH] (fix bleed-through) ──
console.log('--- T5: clip pasma treści (bleed-through) ---');
{
  const view = makeView(0, designs(10));
  const ctx = mockCtx();
  const area = { x: 0, y: 0, w: 800, h: 300 };
  const ret = drawStationPickerModal(ctx, area, baseStation(), view, 'ship');
  const PW = Math.min(760, area.w - 40);                            // mirror drawShipPicker
  const PH = ret.viewportH + HEADER_H;
  const px = area.x + Math.floor((area.w - PW) / 2);
  const py = area.y + Math.floor((area.h - PH) / 2);
  const top = py + HEADER_H;
  const bodyClip = ctx._clips.find(c => c.x === px && c.y === top && c.w === PW && c.h === ret.viewportH);
  ok(`clip pasma treści zarejestrowany [x${px} y${top} w${PW} h${ret.viewportH}]`, !!bodyClip);
}

// ── T6: module picker nietknięty — zwraca null, nie rzuca, rejestruje station_mgmt_build ──
console.log('--- T6: module picker unaffected ---');
{
  const view = makeView(0, null);
  let ret, threw = false;
  try { ret = drawStationPickerModal(mockCtx(), { x: 0, y: 0, w: 800, h: 600 }, baseStation(), view, 'module'); }
  catch (e) { threw = true; console.error('    module picker RZUCIŁ: ' + e.message); }
  ok('module picker nie rzuca', !threw);
  ok('module picker zwraca null (brak scroll payload)', ret === null);
  ok('module picker rejestruje station_mgmt_build (afford + unlocked)', view.zones.some(z => z.type === 'station_mgmt_build'));
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
