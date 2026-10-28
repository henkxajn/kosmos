// Smoke: Dok taktyczny — slice 4f (polish) + fix znikającej stacji. Node, bez canvas/three.
// Uruchom: node src/testing/smoke/tmp_dok_taktyczny_4f_smoke.mjs
//
// Pokrywa:
//   4f-1 computeDockLayout — wycentrowanie (sideGapFrac) + parytet pełnej szerokości (regresja).
//   4f-1 getReservedHeight — uwzględnia prześwit nad pasem dolnym (`MapInsets.BOTTOM_STRIP_H`).
//   PRZECELOWANE W ARKUSZ UI U4-2: 4.7 / 4.8 czytały `TACTICAL_DOCK_CLOCK_CLEARANCE` z `LayoutConfig` — stała usunięta,
//   prześwit = wysokość pasa dolnego z jednego źródła (`MapInsets.BOTTOM_STRIP_H`, ta sama liczba 20). Że Dok czyta ją
//   z `MapInsets`, pilnuje `map_insets_single_source_smoke` (M5).
//   4f-3 TacticalDock._onHit('row') — CTRL=toggle / zwykły=single / dwuklik=vessel:focus.
//   4f   computePanelMode / canCancelOrder — regresja.
//   (Fix stacji — `stationLabelLOD` — usunięty w ARKUSZU HUD B-Z razem z plakietkami `MapLabelLayer`; stacje opisuje
//   warstwa etykiet HUD.)

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, getElementById: () => null,
  createElement: () => ({ style: {}, getContext: () => null, appendChild() {}, setAttribute() {} }),
  body: { appendChild() {}, removeChild() {} } };
if (!globalThis.KOSMOS) globalThis.KOSMOS = {};

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.error('  ✗ FAIL:', name); } };
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const {
  computeDockLayout, computePanelMode, canCancelOrder,
} = await import('../../ui/TacticalDockLogic.js');
// (`stationLabelLOD` — fix znikającej stacji — usunięty w ARKUSZU HUD B-Z; `map_labels_smoke` pinuje jego brak.)

// ═══════════════════════════════════════════════════════════════════════════
// 1. computeDockLayout — wycentrowanie 4f-1
// ═══════════════════════════════════════════════════════════════════════════
{
  const W = 1280, H = 720;
  // Pełna szerokość (brak sideGapFrac) — parytet regresji.
  const full = computeDockLayout(W, H, { panelW: 260, tabH: 24, tabW: 68, bottomReserved: 62, topLimit: 36 });
  T('1.1 pełna szerokość: x=0', full.x === 0);
  T('1.2 pełna szerokość: w=W', full.w === W);
  T('1.3 tabBar/leftRect wyrównane do 0', full.tabBar.x === 0 && full.leftRect.x === 0);
  T('1.4 tab LISTA przy lewej krawędzi (x=4)', full.tabs[0].x === 4);

  // Wycentrowanie 5% na stronę → x=64, w=1152 (~90%).
  const c = computeDockLayout(W, H, { sideGapFrac: 0.05, panelW: 260, tabH: 24, tabW: 68, bottomReserved: 62, topLimit: 36 });
  T('1.5 wycentrowany: x=round(W*0.05)=64', c.x === 64);
  T('1.6 wycentrowany: w=W-2x=1152', c.w === 1152);
  T('1.7 pas symetryczny (prawa przerwa == lewa)', (W - (c.x + c.w)) === c.x);
  T('1.8 tabBar.x == x, tab LISTA offset (x+4)', c.tabBar.x === 64 && c.tabs[0].x === 68);
  T('1.9 leftRect.x == x', c.leftRect.x === 64);
  T('1.10 panelRect.x == x + leftW (mini-panel po prawej pasa)', c.panelRect.x === c.x + (c.w - c.panelW));
  T('1.11 panelRect kończy się na prawej krawędzi pasa', approx(c.panelRect.x + c.panelRect.w, c.x + c.w));
  T('1.12 panelW guard względem szer. PASA (≤ w-120)', c.panelW <= c.w - 120 || c.panelW === 260);
  T('1.13 collapseBtn przed przegrodą mini-panelu', c.collapseBtn.x < c.panelRect.x);

  // Wąski ekran — pas nie wyjeżdża, panelW przycięty.
  const narrow = computeDockLayout(500, H, { sideGapFrac: 0.05, panelW: 260, bottomReserved: 62, topLimit: 36 });
  T('1.14 wąski: w mieści się w ekranie', narrow.x + narrow.w <= 500);
  T('1.15 wąski: panelW przycięty do szer. pasa', narrow.panelW <= Math.max(0, narrow.w - 120));
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. computePanelMode / canCancelOrder — regresja
// ═══════════════════════════════════════════════════════════════════════════
{
  T('2.1 brak selekcji → none', computePanelMode({}) === 'none');
  T('2.2 single', computePanelMode({ leadId: 'v1', selectedCount: 1 }) === 'single');
  T('2.3 multi (≥2) → agregat', computePanelMode({ leadId: 'v1', selectedCount: 3 }) === 'multi');
  T('2.4 flota wygrywa', computePanelMode({ leadId: 'v1', selectedCount: 3, fleetId: 'f1' }) === 'fleet');
  T('2.5 canCancelOrder active', canCancelOrder({ movementOrder: { status: 'active' } }) === true);
  T('2.6 canCancelOrder blocked', canCancelOrder({ movementOrder: { status: 'blocked' } }) === true);
  T('2.7 canCancelOrder brak rozkazu → false', canCancelOrder({}) === false);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. TacticalDock._onHit('row') — 4f-3 CTRL toggle + single + double (bez konstruktora)
// ═══════════════════════════════════════════════════════════════════════════
{
  const EventBus = (await import('../../core/EventBus.js')).default;
  const { TacticalDock } = await import('../../ui/TacticalDock.js');

  let toggled = null, selected = null, pinged = null, focusEmit = null;
  let selSet = [];   // U1-3 (4.6): stan zaznaczenia w stubie — reguła klik/focus czyta go z UIManagera
  globalThis.KOSMOS.uiManager = {
    _dirty: false,
    toggleSelection(id) { toggled = id; },
    setSelectedVesselId(id) { selected = id; selSet = id == null ? [] : [id]; },
    getSelectedVesselIds: () => [...selSet],
    getSelectedVesselId: () => selSet[0] ?? null,
  };
  globalThis.KOSMOS.threeRenderer = { pingVessel(id) { pinged = id; } };
  EventBus.on('vessel:focus', (e) => { focusEmit = e?.vesselId; });

  // Bez konstruktora (BaseOverlay/canvas) — bare instancja z potrzebnymi polami.
  const dock = Object.create(TacticalDock.prototype);
  dock._lastRowClickMs = 0; dock._lastRowClickId = null;

  // CTRL+klik → toggleSelection (NIE single).
  dock._lastMouseMods = { ctrl: true };
  dock._onHit({ type: 'row', data: { id: 'v1' } });
  T('4.1 CTRL+klik → toggleSelection', toggled === 'v1');
  T('4.2 CTRL+klik NIE robi single-select', selected === null && pinged === null);

  // Zwykły klik → setSelectedVesselId + ping (kamera nietknięta).
  toggled = null;
  dock._lastMouseMods = { ctrl: false };
  dock._lastRowClickMs = 0; dock._lastRowClickId = null;
  dock._onHit({ type: 'row', data: { id: 'v2' } });
  T('4.3 zwykły klik → setSelectedVesselId', selected === 'v2');
  T('4.4 zwykły klik → pingVessel', pinged === 'v2');
  T('4.5 zwykły klik NIE toggluje', toggled === null);

  // 4.6 — PRZECELOWANE (ARKUSZ UI U1-3, decyzja 2c, zgoda właściciela): „drugi klik”, nie dwuklik z oknem 300 ms.
  // Drugi klik w ZAZNACZONY statek (lider przy N == 1) → vessel:focus — także 2 s po pierwszym (dawny warunek
  // „ten sam id w oknie 300 ms” dawał tu zaznaczenie zamiast kamery).
  const realNow = performance.now.bind(performance);
  const t0 = realNow();
  performance.now = () => t0 + 2000;
  selected = null; pinged = null;
  dock._onHit({ type: 'row', data: { id: 'v2' } });
  performance.now = realNow;
  T('4.6 drugi klik w zaznaczony statek (po 2 s, bez okna czasu) → vessel:focus', focusEmit === 'v2' && selected === null && pinged === null);

  // getReservedHeight — 4f-1 uwzględnia prześwit nad pasem dolnym (ARKUSZ UI U4-2: `MapInsets.BOTTOM_STRIP_H`).
  dock.visible = true; dock._collapsed = false;
  const { TACTICAL_DOCK_H, TACTICAL_DOCK_TAB_H } = await import('../../config/LayoutConfig.js');
  const { BOTTOM_STRIP_H } = await import('../../ui/MapInsets.js');
  T('4.7 getReservedHeight rozwinięty = pas + prześwit (pas dolny)', BOTTOM_STRIP_H === 20 && dock.getReservedHeight() === TACTICAL_DOCK_H + BOTTOM_STRIP_H);
  dock._collapsed = true;
  T('4.8 getReservedHeight zwinięty = tabH + prześwit (pas dolny)', dock.getReservedHeight() === TACTICAL_DOCK_TAB_H + BOTTOM_STRIP_H);
  dock.visible = false;
  T('4.9 getReservedHeight ukryty = 0', dock.getReservedHeight() === 0);
}

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
