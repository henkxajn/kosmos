// Finding 108 — keeper: TRYB ROZKAZU WARP NIE JEST PULAPKA. Plan: docs/design/STRATCOM_CONTROL_PLAN.md.
//
// PO CO: gdy `_selectedWarpShipId` bylo ustawione, `FleetManagerOverlay:6103` rysowal panel rozkazu
// warp ZAMIAST panelu systemu — a `cluster_switch`, czyli wejscie do widoku ukladu, istnialo
// wylacznie w tym drugim (`:6303`). „Anuluj" (`:2292`) czyscil tylko `_selectedClusterSystem`,
// wiec ponowny klik gwiazdy znow uzbrajal panel warp. W kolko.
//
// ⚠ REJESTR MOWIL, ZE WYJSCIEM JEST „wyjscie i powrot do zakladki". ZMIERZONE — to nieprawda dla
//   sciezki, ktorej gracz uzywa najczesciej:
//     `_switchTab('stratcom')` czysci selekcje, ale ma early-return `if (tab === this._activeTab)`;
//     `_close()` czysci `_selectedClusterSystem` i `_pendingSendSystemId`, ale NIE statek;
//     `open({tab})` przypisuje `this._activeTab` WPROST, z pominieciem `_switchTab` (Finding 160).
//   ⇒ Esc + klawisz M NIE ODBLOKOWYWALO. Pulapka przezywala zamkniecie overlaya.
//
//   T1  (a) „Anuluj" ROZBRAJA tryb — czysci takze wybrany statek
//   T2  (c) `_close()` resetuje TE SAMA RODZINE pol co `_switchTab` (parytet rodziny)
//   T3  (b) panel rozkazu warp SAM wystawia `cluster_switch` — wejscie do ukladu nigdy nie znika
//   T4  (b) ...ale z TA SAMA bramka `explored && sysReg` (Z4) — nie oferujemy wejscia do ukladu
//       bez instancji
//   T5  ⚠ PIN DECYZJI E2: „Wyslij" (sukces) NIE rozbraja — marker statku zostaje SWIADOMIE,
//       bo po (b) nie tworzy to juz pulapki. Pin stoi, zeby nikt tego nie „naprawil".
//   T6  zlozenie: obie drogi wyjscia z trybu dzialaja

import '../headless/env.js';           // MUSI byc pierwszy
import { readFileSync } from 'node:fs';
import { GameCore } from '../headless/GameCore.js';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { createVessel } from '../../entities/Vessel.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

/** Atrapa ctx — wzor `zero_colony_panels`: prawdziwa sciezka rysujaca na niczym. */
function mkCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'canvas') return { width: 1280, height: 720 };
      if (k === 'createLinearGradient' || k === 'createRadialGradient') {
        return () => ({ addColorStop: () => {} });
      }
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function mkOverlay() {
  const o = Object.create(FleetManagerOverlay.prototype);
  o._visible = true;
  o._bounds = { x: 0, y: 0, w: 1280, h: 720 };
  o._hitZones = [];
  o._mapDragging = false;
  o._mapDragWasDrag = false;
  o._missionConfig = null;
  o._activeTab = 'stratcom';
  o._selectedWarpShipId = null;
  o._selectedClusterSystem = null;
  o._pendingSendSystemId = null;
  o._warpShipScrollY = 0;
  o._clusterHoverSystem = null;
  o._mapHoverBody = null;
  o._hoverVesselId = null;
  o._territoryFlash = new Map();
  o._territoryFlashPending = new Map();
  o._holotablePanTarget = { x: 0, z: 0 };
  return o;
}

const core = new GameCore();
core.boot({ quiet: true, scenario: 'civilization' });

// Statek zdolny do warpu — panel rozkazu bez niego nic nie narysuje (`if (!v) return`).
const home = window.KOSMOS.homePlanet;
const ship = createVessel('hull_medium', home.id, {
  name: 'Skoczek', modules: ['engine_warp', 'fuel_tank_warp'], x: 0, y: 0, systemId: 'sys_home',
});
core.vesselManager._vessels.set(ship.id, ship);

// ── T1 — „Anuluj" rozbraja tryb ─────────────────────────────────────────────
console.log('T1 — (a) „Anuluj" czysci TAKZE wybrany statek, nie tylko uzbrojona gwiazde');
{
  const o = mkOverlay();
  o._selectedWarpShipId = ship.id;
  o._selectedClusterSystem = 'sys_home';
  o._handleHit({ type: 'warp_order_cancel', data: {} }, 0, 0);
  assert(o._selectedClusterSystem === null, 'T1: uzbrojona gwiazda wyczyszczona (bez zmian)');
  assert(o._selectedWarpShipId === null,
    `T1: …i tryb ROZBROJONY (statek=${o._selectedWarpShipId}) — bez tego ponowny klik gwiazdy wracal do panelu warp`);
}

// ── T2 — parytet rodziny w _close ───────────────────────────────────────────
console.log('T2 — (c) `_close()` resetuje te sama rodzine pol co `_switchTab`');
{
  const o = mkOverlay();
  o._selectedWarpShipId = ship.id;
  o._selectedClusterSystem = 'sys_home';
  o._pendingSendSystemId = 'sys_home';
  o._warpShipScrollY = 120;
  o._close();
  assert(o._selectedClusterSystem === null && o._pendingSendSystemId === null,
    'T2: dwaj dotychczasowi czlonkowie rodziny wyczyszczeni (bez zmian)');
  assert(o._selectedWarpShipId === null && o._warpShipScrollY === 0,
    `T2: …i brakujacy trzeci + scroll (statek=${o._selectedWarpShipId}, scroll=${o._warpShipScrollY}) — ` +
    'to jest polowa mechanizmu „Esc + M nie odblokowywalo"');
}

// ── T3 — panel warp wystawia wejscie do ukladu ──────────────────────────────
console.log('T3 — (b) panel rozkazu warp SAM wystawia `cluster_switch`');
{
  const o = mkOverlay();
  o._selectedWarpShipId = ship.id;
  const sysHome = (window.KOSMOS.galaxyData?.systems ?? []).find(s => s.id === 'sys_home');
  assert(!!sysHome, 'T3: fixture — uklad domowy jest w galaxyData');
  o._drawWarpOrderPanel(mkCtx(), 0, 0, 900, 600, sysHome, core.vesselManager);
  const zones = o._hitZones.filter(z => z.type === 'cluster_switch');
  assert(zones.length === 1,
    `T3: panel wystawil cluster_switch (${zones.length}) — wejscie do ukladu NIE ZNIKA w trybie rozkazu`);
  assert(zones[0]?.data?.systemId === 'sys_home',
    `T3: …i celuje w ogladany uklad (${zones[0]?.data?.systemId})`);
  // Kontrola pinu: panel w ogole sie narysowal (inaczej T3 mierzylby cisze `if (!v) return`).
  assert(o._hitZones.some(z => z.type === 'warp_order_cancel'),
    'T3: KONTROLA PINU — panel realnie sie narysowal (jest jego wlasny przycisk Anuluj)');
}

// ── T4 — bramka skopiowana, nie wymyslona (Z4) ──────────────────────────────
console.log('T4 — (b) bramka `explored && sysReg` — brak wejscia do ukladu bez instancji');
{
  const ssMgr = window.KOSMOS?.starSystemManager;
  const unexplored = (window.KOSMOS.galaxyData?.systems ?? [])
    .find(s => s.id !== 'sys_home' && !s.explored && !ssMgr?.getSystem?.(s.id)?.explored);
  assert(!!unexplored, `T4: fixture — istnieje uklad niezbadany (${unexplored?.id})`);
  if (unexplored) {
    const o = mkOverlay();
    o._selectedWarpShipId = ship.id;
    o._drawWarpOrderPanel(mkCtx(), 0, 0, 900, 600, unexplored, core.vesselManager);
    assert(!o._hitZones.some(z => z.type === 'cluster_switch'),
      'T4: uklad NIEZBADANY nie dostaje przycisku wejscia — panel warp otwiera sie tam normalnie ' +
      '(po to sie tam wysyla statek), ale wejsc nie ma dokad');
    assert(o._hitZones.some(z => z.type === 'warp_order_cancel'),
      'T4: KONTROLA PINU — panel sie narysowal, wiec brak przycisku to BRAMKA, nie brak rysowania');
  }
}

// ── T5 — PIN DECYZJI E2 ─────────────────────────────────────────────────────
console.log('T5 — ⚠ PIN DECYZJI E2: „Wyslij" NIE rozbraja trybu (marker zostaje swiadomie)');
{
  const src = readFileSync(new URL('../../ui/FleetManagerOverlay.js', import.meta.url), 'utf8');
  const sendCase = src.slice(src.indexOf("case 'warp_order_send'"), src.indexOf("case 'warp_order_cancel'"));
  assert(sendCase.length > 0, 'T5: fixture — znaleziono galaz warp_order_send');
  assert(!/_selectedWarpShipId\s*=\s*null/.test(sendCase),
    'T5: galaz „Wyslij" NIE zeruje wybranego statku — po (b) nie tworzy to pulapki, ' +
    'a marker jest przydatny przy wysylaniu kolejnych statkow (decyzja E2, podpisana)');
}

// ── T6 — zlozenie: obie drogi wyjscia dzialaja ──────────────────────────────
console.log('T6 — z trybu rozkazu wychodzi sie DWIEMA droga: Anuluj oraz zamkniecie overlaya');
{
  const viaCancel = mkOverlay(); viaCancel._selectedWarpShipId = ship.id;
  viaCancel._handleHit({ type: 'warp_order_cancel', data: {} }, 0, 0);

  const viaClose = mkOverlay(); viaClose._selectedWarpShipId = ship.id;
  viaClose._close();

  assert(viaCancel._selectedWarpShipId === null && viaClose._selectedWarpShipId === null,
    'T6: obie drogi rozbrajaja — a trzecia (przycisk w panelu, T3) czyni pulapke nieosiagalna');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
