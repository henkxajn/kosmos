// Findingi 109 / 159 — keeper: REGULY TRAFIEN STREF (`StratcomHitLogic`) i ich uzycie w Dowodztwie.
// Plan: docs/design/STRATCOM_CONTROL_PLAN.md (decyzje E3 / E4).
//
// ⚠ PRZENIESIONE 2026-11-07 (ARC GALAXY G5-B — zakladka Stratcom usunieta, D-GX-21): dawny `stratcom_star_pick_smoke` pinowal
//   klik i hover gwiazd mapy Stratcomu. Hover gwiazd (`_clusterHoverSystem`, T1 / T4) zniknal razem z zakladka. Zostaja reguly,
//   ktore przezyly zakladke:
//     • `StratcomHitLogic` jest zywym modulem — klik Dowodztwa (`handleClick`) idzie przez `resolveStratcomZone`, a tryb galaktyki
//       wybiera gwiazde reguła `pickStarZone` (`GalaxyModeLogic`; parytet — `galaxy_pick_smoke` P1d);
//     • DWIE reguly, nie jedna: `topMostZoneAt` (warstwy — absorber bije to, co pod nim) i `pickStarZone` (ktora gwiazda — najblizszy
//       srodek). Zlanie ich przebiloby absorbery (E3) — H1 / H3 pinuja to w obie strony;
//     • PIN LIMITU E4: `map_body` mapy taktycznej zostaje pierwszo-trafieniowy (Finding 159, poza zakresem) — H4.
//
//   H1  `topMostZoneAt`: wygrywa ostatnia pushowana; absorber nad gwiazdami wygrywa + kontrola pinu (bez absorbera — gwiazda)
//   H2  `pickStarZone` / `resolveStratcomZone`: gdy wygrala warstwa gwiazd — najblizszy srodek (dwa przypadki, dwie odpowiedzi)
//   H3  Dowodztwo: prawdziwy `handleClick` FMO trafia absorber, nie strefe pod nim (regula miedzywarstwowa w overlayu)
//   H4  ⚠ PIN LIMITU: `map_body` (zakladka taktyczna) — pierwsze trafienie, jak przed Findingiem 109

import '../headless/env.js';           // MUSI byc pierwszy
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { topMostZoneAt, pickStarZone, resolveStratcomZone } from '../../ui/StratcomHitLogic.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

/** Strefa gwiazdy (hitR = max(r+5, 11) — kształt dawnych stref mapy; ten sam typ buduje `GalaxyModeLogic`). */
const starZone = (systemId, sx, sy, hitR = 11) =>
  ({ x: sx - hitR, y: sy - hitR, w: hitR * 2, h: hitR * 2, type: 'cluster_star', data: { systemId } });
// Dwie nakladajace sie gwiazdy, push od NAJBLIZSZEJ. A: (100,100), B: (115,100) → wspolny pas x∈[104,111].
const A = starZone('sys_A', 100, 100);
const B = starZone('sys_B', 115, 100);
const PAIR = [A, B];
const BG = { x: 90, y: 80, w: 120, h: 60, type: 'panel_bg', data: {} };   // absorber panelu namalowanego PO gwiazdach

// ── H1 — regula miedzywarstwowa ─────────────────────────────────────────────
console.log('H1 — topMostZoneAt: wierzchnia strefa wygrywa, absorber bije gwiazdy pod spodem');
{
  assert(topMostZoneAt(PAIR, 106, 100)?.data?.systemId === 'sys_B', 'H1: bez rozstrzygacza gwiazd wygrywa OSTATNIA pushowana (sys_B)');
  assert(topMostZoneAt([...PAIR, BG], 106, 100)?.type === 'panel_bg', 'H1: absorber pushowany pozniej wygrywa z gwiazdami pod spodem');
  assert(resolveStratcomZone([...PAIR, BG], 106, 100)?.type === 'panel_bg',
    'H1: `resolveStratcomZone` NIE przebija absorbera (doprecyzowanie zwyciezcy, nie pre-pass — decyzja E3)');
  assert(resolveStratcomZone(PAIR, 106, 100)?.type === 'cluster_star', 'H1 KONTROLA PINU: bez absorbera ten sam punkt trafia gwiazde');
}

// ── H2 — ktora gwiazda ──────────────────────────────────────────────────────
console.log('H2 — gdy wygrala warstwa gwiazd: najblizszy srodek (dwa przypadki, dwie rozne odpowiedzi)');
{
  const at106 = resolveStratcomZone(PAIR, 106, 100)?.data?.systemId ?? null;
  const at109 = resolveStratcomZone(PAIR, 109, 100)?.data?.systemId ?? null;
  assert(at106 === 'sys_A', `H2: kursor blizej A (6 px vs 9 px) → sys_A (jest: ${at106}); sama kolejnosc dalaby sys_B`);
  assert(at109 === 'sys_B', `H2: kursor blizej B → sys_B (jest: ${at109})`);
  assert(at106 !== at109, 'H2 KONTROLA PINU: te dwa przypadki maja ROZNE poprawne odpowiedzi (nie da sie ich zdac stala)');
  assert(pickStarZone(PAIR, 106, 100, B)?.data?.systemId === 'sys_A', 'H2: `pickStarZone` doprecyzowuje zwyciezce warstwy gwiazd');
}

// ── H3 — Dowodztwo: prawdziwy klik overlaya ─────────────────────────────────
console.log('H3 — FleetManagerOverlay.handleClick: absorber wygrywa ze strefa pod nim');
{
  const mk = (zones) => {
    const o = Object.create(FleetManagerOverlay.prototype);
    o._visible = true; o._bounds = { x: 0, y: 0, w: 1280, h: 720 }; o._hitZones = zones;
    o._mapDragging = false; o._mapDragWasDrag = false; o._missionConfig = null; o._activeTab = 'tactical';
    o._mapHoverBody = null; o._hoverVesselId = null;
    let picked = null; o._handleHit = (z) => { picked = z; };
    return { o, picked: () => picked };
  };
  const under = { x: 95, y: 95, w: 30, h: 20, type: 'vessel', data: { vesselId: 'v_1' } };
  const a = mk([under, BG]); a.o.handleClick(106, 100);
  assert(a.picked()?.type === 'panel_bg', `H3: klik w panel trafia ABSORBER, nie strefe pod spodem (trafil: ${a.picked()?.type})`);
  const b = mk([under]); b.o.handleClick(106, 100);
  assert(b.picked()?.type === 'vessel', `H3 KONTROLA PINU: bez absorbera ten sam klik trafia strefe pod spodem (trafil: ${b.picked()?.type})`);
}

// ── H4 — PIN LIMITU: map_body nietkniety ────────────────────────────────────
console.log('H4 — ⚠ PIN LIMITU (E4): map_body zostaje pierwszo-trafieniowy');
{
  const b1 = { x: 89, y: 89, w: 22, h: 22, type: 'map_body', data: { bodyId: 'body_1' } };
  const b2 = { x: 104, y: 89, w: 22, h: 22, type: 'map_body', data: { bodyId: 'body_2' } };
  const o = Object.create(FleetManagerOverlay.prototype);
  o._visible = true; o._bounds = { x: 0, y: 0, w: 1280, h: 720 }; o._hitZones = [b1, b2];
  o._mapDragging = false; o._missionConfig = null; o._activeTab = 'tactical'; o._mapHoverBody = null; o._hoverVesselId = null;
  o.handleMouseMove(109, 100);   // blizej b2, ale first-match daje b1
  assert(o._mapHoverBody?.bodyId === 'body_1',
    'H4: map_body dalej rozstrzyga sie PIERWSZYM trafieniem — ta sama klasa co 109, poza zakresem (Finding 159)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
