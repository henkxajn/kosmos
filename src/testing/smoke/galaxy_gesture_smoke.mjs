// Keeper ARC GALAXY, krok G2-1 — GEST semantycznego zoomu i CEL NURKOWANIA (docs/design/GALAXY_PLAN.md §4 G2; D-GX-7,
// D-GX-13). Protokół lekki F8: keeper wyłącznie dla LOGIKI (maszyna stanów gestu, reguła celu, nawiasy, hak kółka) — bez
// pinów na stałych rysunku i bez kontroli na poprzednim commicie.
// STROJENIE 1 (oglądanie właściciela 2026-10-31): wyzwolenie przy TRZECH ząbkach (300 px), było dwa (200 px) — w obu
// kierunkach (wylot z układu i nurkowanie); wszystkie stałe i wartości poniżej przeliczone.
//   W0  API modułu `GalaxyGestureLogic`
//   W1  uzbrojenie: sufit trybu układu + kamera osiadła → 'out'; podłoga galaktyki + osiadła → 'in'; inaczej brak
//   W2  trzy ząbki (3 × 100 px) w oknie 600 ms → wyzwolenie; jeden i dwa ząbki — nic
//   W3  ząbek, który DOCHODZI do klamry, się nie liczy (stan kamery sprzed kroku zoomu)
//   W4  okno przesuwne: ząbki odległe o > 600 ms nie sumują się (także trzy rozłożone na > 600 ms)
//   W5  normalizacja trybu zdarzenia: linie × 33 (3 linie = 99 px — trzy ząbki to jeszcze za mało: 297 < 300), strona ×
//       wysokość okna
//   W6  ząbek w przeciwną stronę i wyjście z klamry — RESET sumy
//   W7  trackpad: seria drobnych zdarzeń wyzwala dopiero przy sumie 300 px (licznik zdarzeń strzelałby od muśnięcia)
//   W8  lustro przy podłodze galaktyki (nurkowanie); ząbek od siebie przy podłodze — reset
//   W9  cel nurkowania: zaznaczona (gdy da się wejść; inaczej brak), inaczej najbliższa celowi kamery w 3 ly, do której da
//       się wejść; poza promieniem — brak (kółko staje na podłodze)
//   W10 nawiasy celu od dwóch ostatnich ząbków nad podłogą
//   W11 hak kółka `GalaxyModeController.onWheel`: flaga `galaxyLook` OFF — zawsze `false` (gałąź `wheelZoom` jak w G1);
//       lot w toku połyka kółko; gest u sufitu układu wchodzi w tryb galaktyki; nurkowanie bez celu — `false`
// Uruchom: node src/testing/smoke/galaxy_gesture_smoke.mjs
import '../headless/env.js';           // MUSI być pierwszy
import { GAME_CONFIG } from '../../config/GameConfig.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
const header = (s) => console.log(`\n── ${s}`);
const call = (fn, ...a) => { try { return fn ? fn(...a) : undefined; } catch (e) { return `WYJĄTEK: ${e.message}`; } };

let GW = null, GC = null, GL = null;
try { GW = await import('../../ui/GalaxyGestureLogic.js'); } catch (e) { console.log('  (GalaxyGestureLogic:', e.message + ')'); }
try { GC = await import('../../ui/GalaxyModeController.js'); } catch (e) { console.log('  (GalaxyModeController:', e.message + ')'); }
try { GL = await import('../../ui/GalaxyModeLogic.js'); } catch (e) { console.log('  (GalaxyModeLogic:', e.message + ')'); }

// Stan kamery (przed krokiem zoomu): sufit układu 450, podłoga galaktyki 1200.
const SYS = (o = {}) => ({ mode: 'system', targetDist: 450, dist: 450, minDist: 0.3, maxDist: 450, ...o });
const GAL = (o = {}) => ({ mode: 'galaxy', targetDist: 1200, dist: 1200, minDist: 1200, maxDist: 24000, ...o });
const notch = (dy = 100, mode = 0) => ({ deltaY: dy, deltaMode: mode, viewportH: 800 });

header('W0  API');
{
  const need = ['GALAXY_GESTURE', 'gestureArm', 'makeSemanticZoom', 'diveTarget', 'diveBracketsVisible'];
  const miss = need.filter((k) => !(GW && k in GW));
  ok(miss.length === 0, `W0a GalaxyGestureLogic — ${need.length} eksportów (brak: ${miss.join(', ') || '—'})`);
  const G = GW?.GALAXY_GESTURE ?? {};
  ok(G.TRIGGER_PX === 300 && G.WINDOW_MS === 600 && G.CAPTURE_LY === 3 && G.BRACKET_NOTCHES === 2,
    'W0b podpisane wartości D-GX-7 / D-GX-13 po strojeniu 1: 300 px (było 200), 600 ms, 3 ly, 2 ząbki');
}

header('W1  uzbrojenie');
{
  const arm = (c) => call(() => GW.gestureArm(c));
  ok(arm(SYS()) === 'out', 'W1a sufit trybu układu, kamera osiadła → out');
  ok(arm(SYS({ dist: 450 * 0.97 })) === null, 'W1b sufit, kamera w ruchu (3 % od klamry) → brak');
  ok(arm(SYS({ dist: 450 * 0.985 })) === 'out', 'W1c sufit, 1,5 % od klamry (osiadła) → out');
  ok(arm(SYS({ targetDist: 449.9, dist: 449.9 })) === null, 'W1d tuż pod sufitem → brak (klamra nie dotknięta)');
  ok(arm(GAL()) === 'in', 'W1e podłoga galaktyki, osiadła → in');
  ok(arm(GAL({ targetDist: 24000, dist: 24000 })) === null, 'W1f sufit galaktyki → brak (wylotu z galaktyki dalej nie ma)');
  ok(arm(null) === null, 'W1g brak kamery → brak');
}

header('W2  trzy ząbki w oknie');
{
  const z = GW?.makeSemanticZoom?.();
  const r1 = call(() => z.feed(notch(100), SYS(), 0));
  const r2 = call(() => z.feed(notch(100), SYS(), 150));
  const r3 = call(() => z.feed(notch(100), SYS(), 300));
  ok(r1?.trigger === null && r1?.sum === 100 && r1?.armed === 'out', 'W2a pierwszy ząbek — suma 100, bez wyzwolenia');
  ok(r2?.trigger === null && r2?.sum === 200, 'W2b drugi ząbek — suma 200, jeszcze bez wyzwolenia (strojenie 1: dwa już nie wystarczą)');
  ok(r3?.trigger === 'out' && r3?.sum === 300, 'W2c trzeci ząbek w 300 ms → wylot');
  const r4 = call(() => z.feed(notch(100), SYS(), 400));
  ok(r4?.trigger === null && r4?.sum === 100, 'W2d po wyzwoleniu suma od zera');
}

header('W3  ząbek dochodzący do klamry się nie liczy');
{
  const z = GW?.makeSemanticZoom?.();
  // Ząbek 1 — stan PRZED krokiem: 430 (pod sufitem) — to on dowozi kamerę do 450.
  const r1 = call(() => z.feed(notch(100), SYS({ targetDist: 430, dist: 430 }), 0));
  const r2 = call(() => z.feed(notch(100), SYS(), 200));
  const r3 = call(() => z.feed(notch(100), SYS(), 350));
  const r4 = call(() => z.feed(notch(100), SYS(), 500));
  ok(r1?.armed === null && r1?.sum === 0, 'W3a ząbek dochodzący — nieuzbrojony, suma 0');
  ok(r2?.trigger === null && r2?.sum === 100, 'W3b pierwszy ząbek ZA klamrą — suma 100');
  ok(r3?.trigger === null && r3?.sum === 200, 'W3c drugi ząbek za klamrą — suma 200, jeszcze bez wyzwolenia');
  ok(r4?.trigger === 'out', 'W3d trzeci ząbek za klamrą → wylot (gest = trzy ząbki ZA klamrą)');
}

header('W4  okno przesuwne');
{
  const z = GW?.makeSemanticZoom?.();
  call(() => z.feed(notch(100), SYS(), 0));
  const r2 = call(() => z.feed(notch(100), SYS(), 700));
  ok(r2?.trigger === null && r2?.sum === 100, 'W4a ząbki 700 ms od siebie — pierwszy wypada z okna (suma 100)');
  const r3 = call(() => z.feed(notch(100), SYS(), 1200));
  ok(r3?.trigger === null && r3?.sum === 200, 'W4b trzeci ząbek 500 ms później — w oknie z drugim (suma 200), jeszcze bez wyzwolenia');
  const r4 = call(() => z.feed(notch(100), SYS(), 1500));
  ok(r4?.trigger === null && r4?.sum === 200,
    'W4c czwarty ząbek — ząbek sprzed 800 ms wypada z okna; trzy ząbki rozłożone na > 600 ms nie sumują się (suma 200)');
  const r5 = call(() => z.feed(notch(100), SYS(), 1700));
  ok(r5?.trigger === 'out', 'W4d piąty ząbek — trzy ząbki w 500 ms (1200 / 1500 / 1700) → wylot');
}

header('W5  normalizacja trybu zdarzenia');
{
  const z = GW?.makeSemanticZoom?.();
  const a = call(() => z.feed(notch(3, 1), SYS(), 0));
  const b = call(() => z.feed(notch(3, 1), SYS(), 100));
  const c = call(() => z.feed(notch(3, 1), SYS(), 200));
  const d = call(() => z.feed(notch(3, 1), SYS(), 300));
  ok(a?.sum === 99 && b?.sum === 198 && c?.trigger === null && c?.sum === 297 && d?.trigger === 'out',
    'W5a tryb linii: 3 linie = 99 px; trzy ząbki to 297 < 300 (bez wyzwolenia), dopiero czwarty (396) wyzwala');
  const z2 = GW?.makeSemanticZoom?.();
  const p = call(() => z2.feed({ deltaY: 1, deltaMode: 2, viewportH: 800 }, SYS(), 0));
  ok(p?.trigger === 'out' && p?.sum === 800, 'W5b tryb strony: 1 strona × 800 px okna → wyzwolenie od razu');
  ok(GL?.normalizedWheelPx?.(100, 0, 800) === 100, 'W5c tryb px — bez zmian (jedno źródło `normalizedWheelPx`)');
}

header('W6  reset');
{
  const z = GW?.makeSemanticZoom?.();
  call(() => z.feed(notch(100), SYS(), 0));
  call(() => z.feed(notch(100), SYS(), 100));          // suma 200 — o ząbek od wyzwolenia
  const back = call(() => z.feed(notch(-100), SYS(), 200));
  const r = call(() => z.feed(notch(100), SYS(), 300));
  ok(back?.sum === 0 && r?.trigger === null && r?.sum === 100,
    'W6a ząbek do siebie przy suficie zeruje sumę (bez resetu następny ząbek, suma 300, by wyzwolił)');
  const z2 = GW?.makeSemanticZoom?.();
  call(() => z2.feed(notch(100), SYS(), 0));
  call(() => z2.feed(notch(100), SYS(), 50));                                    // suma 200
  call(() => z2.feed(notch(100), SYS({ targetDist: 400, dist: 400 }), 100));     // kamera zeszła z klamry
  const r2 = call(() => z2.feed(notch(100), SYS(), 200));
  ok(r2?.trigger === null && r2?.sum === 100, 'W6b wyjście z klamry zeruje sumę (bez resetu następny ząbek, suma 300, by wyzwolił)');
  call(() => z2.feed(notch(100), SYS(), 300));
  const before = z2?.sum;
  call(() => z2.reset());
  ok(before === 200 && z2?.sum === 0, `W6c \`reset()\` czyści sumę (przed: ${before})`);
}

header('W7  trackpad');
{
  const z = GW?.makeSemanticZoom?.();
  let fired = -1;
  for (let i = 0; i < 60; i++) {
    const r = call(() => z.feed(notch(8), SYS(), i * 15));
    if (r?.trigger === 'out') { fired = i; break; }
  }
  ok(fired === 37, `W7a 38 zdarzeń po 8 px (suma 304; 37 × 8 = 296 jeszcze nie) — wyzwolenie dokładnie przy 38. (było: ${fired + 1})`);
}

header('W8  lustro przy podłodze galaktyki');
{
  const z = GW?.makeSemanticZoom?.();
  const a = call(() => z.feed(notch(-100), GAL(), 0));
  const b = call(() => z.feed(notch(-100), GAL(), 250));
  const c = call(() => z.feed(notch(-100), GAL(), 450));
  ok(a?.armed === 'in' && a?.trigger === null && b?.trigger === null && b?.sum === 200 && c?.trigger === 'in',
    'W8a trzy ząbki do siebie przy podłodze → nurkowanie (dwa to jeszcze nie)');
  const z2 = GW?.makeSemanticZoom?.();
  call(() => z2.feed(notch(-100), GAL(), 0));
  call(() => z2.feed(notch(-100), GAL(), 100));                                  // suma 200
  const away = call(() => z2.feed(notch(100), GAL(), 150));
  const after = call(() => z2.feed(notch(-100), GAL(), 200));
  ok(away?.sum === 0 && away?.trigger === null && after?.sum === 100 && after?.trigger === null,
    'W8b ząbek od siebie przy podłodze — reset (bez resetu następny ząbek do siebie, suma 300, by wyzwolił)');
}

header('W9  cel nurkowania');
{
  const K = 200;
  const stars = [
    { id: 'a', x: 1 * K, z: 0 },          // 1 ly — NIE do wejścia
    { id: 'b', x: 0, z: 2.9 * K },        // 2,9 ly — do wejścia
    { id: 'c', x: -3.1 * K, z: 0 },       // 3,1 ly — do wejścia, poza promieniem
    { id: 'd', x: 2.95 * K, z: 0.1 * K }, // ~2,95 ly — do wejścia
  ];
  const enter = new Set(['b', 'c', 'd', 'sel_ok']);
  const en = (id) => enter.has(id);
  const dt = (o) => call(() => GW.diveTarget({ stars, target: { x: 0, z: 0 }, K, enterable: en, ...o }));
  ok(dt({}) === 'b', 'W9a bez zaznaczenia — najbliższa DO WEJŚCIA w 3 ly (pomija bliższą, do której wejść się nie da)');
  ok(dt({ selectedId: 'sel_ok' }) === 'sel_ok', 'W9b zaznaczona do wejścia — wygrywa z najbliższą');
  ok(dt({ selectedId: 'a' }) === null, 'W9c zaznaczona, do której wejść się nie da — brak celu (nie przeskakuje na sąsiada)');
  ok(dt({ target: { x: -3.1 * K - 0.5 * K, z: 0 } }) === 'c', 'W9d cel kamery przy gwieździe spoza promienia od początku — liczy się odległość od CELU kamery');
  ok(dt({ target: { x: 10 * K, z: 10 * K } }) === null, 'W9e pusto w 3 ly — brak (kółko staje na podłodze)');
  ok(call(() => GW.diveTarget({ stars: [{ id: 'q', x: 0, z: 0 }], target: { x: 0, z: 0 }, K, enterable: () => false })) === null,
    'W9f gwiazda pod celem, ale nie do wejścia — brak');
}

header('W10 nawiasy celu');
{
  const m = 1200, IN = GL?.GALAXY_ZOOM?.IN ?? 0.89;
  const v = (d) => call(() => GW.diveBracketsVisible(d, m));
  ok(v(m) === true && v(m / IN) === true && v(m / IN / IN) === true, 'W10a podłoga, 1 i 2 ząbki nad podłogą — nawiasy');
  ok(v(m / IN / IN / IN) === false, 'W10b 3 ząbki nad podłogą — bez nawiasów');
  ok(v(NaN) === false && call(() => GW.diveBracketsVisible(100, 0)) === false, 'W10c dane niepełne — bez nawiasów');
}

header('W11 hak kółka GalaxyModeController.onWheel');
{
  const flagV = GAME_CONFIG.FEATURES.galaxyView, flagL = GAME_CONFIG.FEATURES.galaxyLook;
  const log = [];
  const K = { civMode: true };
  globalThis.window.KOSMOS = K;
  const gm = GC?.GalaxyModeController ? new GC.GalaxyModeController() : null;
  if (gm) gm.enter = (r) => { log.push(['enter', r]); return true; };
  // Atrapa kontrolera kamery — hak czyta pola `_targetDist` / `_dist` i gettery `minDist` / `maxDist`.
  const asCam = (c) => ({ mode: c.mode, _targetDist: c.targetDist, _dist: c.dist, minDist: c.minDist, maxDist: c.maxDist });
  const camSys = asCam(SYS());
  GAME_CONFIG.FEATURES.galaxyView = true; GAME_CONFIG.FEATURES.galaxyLook = false;
  const off1 = call(() => gm.onWheel(notch(100), camSys));
  const off2 = call(() => gm.onWheel(notch(100), camSys));
  const off3 = call(() => gm.onWheel(notch(100), camSys));
  ok(off1 === false && off2 === false && off3 === false && log.length === 0,
    'W11a flaga galaxyLook OFF — hak zawsze false, brak gestu (G1 co do bitu), także po trzech ząbkach');
  GAME_CONFIG.FEATURES.galaxyLook = true;
  const a = call(() => gm.onWheel(notch(100), camSys));
  const b = call(() => gm.onWheel(notch(100), camSys));
  const c = call(() => gm.onWheel(notch(100), camSys));
  ok(a === false && b === false && c === true && log.length === 1 && log[0][1] === 'wheel',
    'W11b gest u sufitu układu: trzy ząbki → wejście w tryb galaktyki (powód wheel); dwa pierwsze zwykłe (false)');
  if (gm) gm._flight = { kind: 'out' };
  ok(call(() => gm.onWheel(notch(-100), camSys)) === true, 'W11c lot w toku połyka kółko');
  if (gm) { gm._flight = null; gm._active = true; gm.diveTargetId = () => null; gm.enterSystem = (id) => { log.push(['dive', id]); return true; }; }
  call(() => gm.onWheel(notch(-100), asCam(GAL())));
  call(() => gm.onWheel(notch(-100), asCam(GAL())));
  const noTarget = call(() => gm.onWheel(notch(-100), asCam(GAL())));
  ok(noTarget === false && !log.some((e) => e[0] === 'dive'), 'W11d nurkowanie bez celu — false po trzecim ząbku (kółko staje na podłodze)');
  if (gm) gm.diveTargetId = () => 'sys_tgt';
  const d1 = call(() => gm.onWheel(notch(-100), asCam(GAL())));
  const d2 = call(() => gm.onWheel(notch(-100), asCam(GAL())));
  const dive = call(() => gm.onWheel(notch(-100), asCam(GAL())));
  ok(d1 === false && d2 === false && dive === true && log.some((e) => e[0] === 'dive' && e[1] === 'sys_tgt'),
    'W11e nurkowanie z celem — dopiero trzeci ząbek wchodzi w układ celu');
  GAME_CONFIG.FEATURES.galaxyView = flagV; GAME_CONFIG.FEATURES.galaxyLook = flagL;
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
