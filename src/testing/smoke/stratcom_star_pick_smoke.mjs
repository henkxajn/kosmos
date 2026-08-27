// Finding 109 — keeper: KLIK I HOVER WSKAZUJA TEN SAM UKLAD. Plan: docs/design/STRATCOM_CONTROL_PLAN.md.
//
// PO CO: mapa STRATCOM rozstrzygala trafienia DWIEMA PRZECIWNYMI regulami.
//   klik  (FleetManagerOverlay:1383) `for (let i = length-1; i >= 0; i--)` → wygrywa OSTATNIA pushowana
//   hover (:1722)                    `for (const z of this._hitZones)`     → wygrywa PIERWSZA
// Strefy `cluster_star` maja 22x22 px przy promieniu gwiazdy <= 7, wiec nakladaja sie takze wtedy,
// gdy GLIFY wcale sie nie stykaja, a `_stratcomVisibleSystems` sortuje rosnaco po d2 (:5506) —
// czyli push idzie od najblizszych. Skutek deterministyczny: HOVER PODSWIETLAL BLIZSZY UKLAD,
// A KLIK WYBIERAL DALSZY (zmierzone w grze 15/15).
//
// ⚠ SAMO UZGODNIENIE KIERUNKU NIE WYSTARCZA i ten keeper tego pilnuje. Gracz celuje w WIDOCZNA
//   gwiazde, wiec poprawna odpowiedzia nie jest „pierwsza" ani „ostatnia", tylko TA, KTOREJ SRODEK
//   JEST NAJBLIZEJ KURSORA. Dlatego T2 ma DWA przypadki, w ktorych zwyciezca jest raz pierwsza,
//   raz druga strefa — naprawa przez odwrocenie petli przechodzi jeden i pada na drugim.
//
// ⚠ ABSORBERY MAJA POZOSTAC NADRZEDNE (Z1, decyzja E3). Rozstrzygacz jest DOPRECYZOWANIEM
//   ZWYCIEZCY, a nie pre-passem: petla ogolna wylania strefe wierzchnia i dopiero gdy jest nia
//   `cluster_star`, wybieramy sposrod gwiazd. Pre-pass (kuszacy, bo taki wzor juz jest w pliku
//   przy :1369) przebilby `warp_order_bg` — absorber, ktory istnieje po to, zeby klik w panel
//   rozkazu nie przelatywal na gwiazdy pod spodem. T3 pinuje to w obie strony.
//
//   T1  klik i hover wskazuja TEN SAM uklad (rdzen 109; fail-first: rozjazd)
//   T2  ...i jest to uklad o NAJBLIZSZYM SRODKU — dwa przypadki, raz pierwsza, raz druga strefa
//   T3  absorber nadrzedny nad gwiazdami (klik) + kontrola pinu (bez absorbera klik trafia gwiazde)
//   T4  hover swiadomy absorberow dla gwiazd (E4; fail-first: hover jest dzis slepy)
//   T5  ⚠ PIN LIMITU: map_body NIETKNIETY — zostaje pierwszo-trafieniowy i slepy na absorbery

import '../headless/env.js';           // MUSI byc pierwszy
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// Instancja BEZ konstruktora — testujemy rozstrzyganie trafien, nie cykl zycia overlaya
// (konstruktor subskrybuje EventBus i nic z tego nie jest tu potrzebne).
function mkOverlay(zones) {
  const o = Object.create(FleetManagerOverlay.prototype);
  o._visible = true;
  o._bounds = { x: 0, y: 0, w: 1280, h: 720 };
  o._hitZones = zones;
  o._mapDragging = false;
  o._mapDragWasDrag = false;
  o._missionConfig = null;
  o._activeTab = 'stratcom';
  o._clusterHoverSystem = null;
  o._mapHoverBody = null;
  o._hoverVesselId = null;
  return o;
}

/** Strefa gwiazdy dokladnie tak, jak buduje ja :6084 (hitR = max(r+5, 11)). */
const starZone = (systemId, sx, sy, hitR = 11) =>
  ({ x: sx - hitR, y: sy - hitR, w: hitR * 2, h: hitR * 2, type: 'cluster_star', data: { systemId } });

/** Ktory uklad wybralby KLIK. `_handleHit` podmieniony na szpiega — nie chcemy skutkow ubocznych. */
function clickPick(zones, mx, my) {
  const o = mkOverlay(zones);
  let picked = null;
  o._handleHit = (z) => { picked = z; };
  o.handleClick(mx, my);
  return picked;
}

/** Ktory uklad podswietlilby HOVER. */
function hoverPick(zones, mx, my) {
  const o = mkOverlay(zones);
  o.handleMouseMove(mx, my);
  return o._clusterHoverSystem;
}

// Dwie nakladajace sie gwiazdy. Push od NAJBLIZSZEJ (lustro sortowania po d2).
// A: srodek (100,100), B: srodek (115,100). Strefy 22x22 → wspolny pas x∈[104,111].
const A = starZone('sys_A', 100, 100);
const B = starZone('sys_B', 115, 100);
const PAIR = [A, B];

// ── T1 — zgodnosc klik/hover ────────────────────────────────────────────────
console.log('T1 — klik i hover wskazuja TEN SAM uklad');
{
  for (const [mx, my, label] of [[106, 100, 'blizej A'], [109, 100, 'blizej B']]) {
    const c = clickPick(PAIR, mx, my)?.data?.systemId ?? null;
    const h = hoverPick(PAIR, mx, my);
    assert(c !== null && c === h,
      `T1: kursor (${mx},${my}) ${label} → klik=${c}, hover=${h}`);
  }
}

// ── T2 — wygrywa NAJBLIZSZY SRODEK, nie kolejnosc ──────────────────────────
console.log('T2 — wygrywa uklad o najblizszym srodku (dwa przypadki, dwie rozne odpowiedzi)');
{
  // (106,100): do A jest 6 px, do B 9 px → A. To jest przypadek, ktory dzis LAMIE klik.
  assert(clickPick(PAIR, 106, 100)?.data?.systemId === 'sys_A',
    'T2: kursor blizej A → klik wybiera sys_A (dzis wybieral sys_B, bo byl pushowany pozniej)');
  // (109,100): do A jest 9 px, do B 6 px → B. To jest przypadek, ktory dzis LAMIE hover.
  assert(hoverPick(PAIR, 109, 100) === 'sys_B',
    'T2: kursor blizej B → hover podswietla sys_B (dzis podswietlal sys_A, bo byl pushowany pierwszy)');
  // ⚠ KONTROLA PINU dla samej pary: bez obu przypadkow „naprawa przez odwrocenie petli"
  //   przeszlaby polowe testu. Sprawdzamy, ze odpowiedzi SA ROZNE.
  assert(clickPick(PAIR, 106, 100)?.data?.systemId !== clickPick(PAIR, 109, 100)?.data?.systemId,
    'T2: KONTROLA PINU — te dwa przypadki maja ROZNE poprawne odpowiedzi (nie da sie ich zdac stala)');
}

// ── T3 — absorber nadrzedny (Z1 / E3) ───────────────────────────────────────
console.log('T3 — absorber panelu rozkazu NADRZEDNY nad gwiazdami pod spodem');
{
  // Panel rozkazu warp rysuje sie PO gwiazdach, wiec jego absorber jest pushowany POZNIEJ.
  const bg = { x: 90, y: 80, w: 120, h: 60, type: 'warp_order_bg', data: {} };
  const withBg = [...PAIR, bg];
  assert(clickPick(withBg, 106, 100)?.type === 'warp_order_bg',
    'T3: klik w panel trafia ABSORBER, nie gwiazde pod spodem');
  // ⚠ KONTROLA PINU — bez absorbera ten sam klik MUSI trafic gwiazde, inaczej T3 mierzy
  //   „nic sie nie dzieje", a nie „absorber wygrywa".
  assert(clickPick(PAIR, 106, 100)?.type === 'cluster_star',
    'T3: KONTROLA PINU — bez absorbera ten sam klik trafia gwiazde');
}

// ── T4 — hover swiadomy absorberow dla gwiazd (E4) ──────────────────────────
console.log('T4 — hover NIE podswietla gwiazdy schowanej pod panelem');
{
  const bg = { x: 90, y: 80, w: 120, h: 60, type: 'warp_order_bg', data: {} };
  assert(hoverPick([...PAIR, bg], 106, 100) === null,
    'T4: kursor nad panelem → zadna gwiazda nie jest podswietlona (dzis hover jest slepy na absorbery)');
  assert(hoverPick(PAIR, 106, 100) === 'sys_A',
    'T4: KONTROLA PINU — bez panelu ta sama pozycja podswietla gwiazde');
}

// ── T5 — PIN LIMITU: map_body nietkniety ────────────────────────────────────
console.log('T5 — ⚠ PIN LIMITU (E4): map_body zostaje pierwszo-trafieniowy i slepy na absorbery');
{
  const b1 = { x: 89, y: 89, w: 22, h: 22, type: 'map_body', data: { bodyId: 'body_1' } };
  const b2 = { x: 104, y: 89, w: 22, h: 22, type: 'map_body', data: { bodyId: 'body_2' } };
  const o = mkOverlay([b1, b2]);
  o._activeTab = 'tactical';
  o.handleMouseMove(109, 100);   // blizej b2, ale first-match daje b1
  assert(o._mapHoverBody?.bodyId === 'body_1',
    'T5: map_body dalej rozstrzyga sie PIERWSZYM trafieniem — ta sama klasa co 109, poza zakresem (Finding 159)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
