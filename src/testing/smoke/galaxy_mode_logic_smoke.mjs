// Keeper ARC GALAXY, krok G1 — logika TRYBU GALAKTYKI (docs/design/GALAXY_PLAN.md §4 G1; D-GX-1, D-GX-2, D-GX-3, D-GX-8,
// D-GX-13). Protokół lekki F8: keeper wyłącznie dla LOGIKI (plany, kotwica, kamera, zoom, pan, bramka wejścia, orkiestracja) —
// bez pinów na stałych rysunku i bez kontroli na poprzednim commicie.
//   G0  API modułów (`GalaxyModeLogic`, `GalaxyModeController`, `GalaxyPlate`, wariant płyty `StarPointShader`)
//   G1  stałe trybu: K = 200, warstwa płyty ≠ 0, far systemu 5 000 (jak przed krokiem) / galaktyki 40 000
//   G2  kotwica = AKTYWNY układ: gwiazda aktywna w początku świata, `group.position = −P·K` (prawdziwa płyta na three.core)
//   G3  niezmiennik przesunięcia: względne położenia gwiazd nie zależą od kotwicy (rebase dowolnych dwóch układów)
//   G4  konfiguracja kamery: zakres 6–120 ly·K, preset = `fitDist` Stratcomu × K (≈ 57 ly), pan wokół domu ±30 ly·K
//   G5  plany: migawka kamery (kopia, nie alias) i wyjście = DOKŁADNIE migawka (1:1)
//   G6  kamera w trybie UKŁADU — wartości jak przed krokiem (tabela kółka, podłoga 501, sufit 450, `setTargetDist`)
//       — WYKONANIE prototypu `ThreeCameraController` na atrapie z wektorami three.core
//   G7  kamera w trybie GALAKTYKI — zoom mnożnikowy ×1,12 / ×0,89 na 100 px (tryb linii znormalizowany), zakres, powrót
//       do trybu układu przywraca wartości układu co do bitu
//   G8  pan: domyślnie „chwyć” (zawartość za kursorem — cel przeciwnie do prawej strony ekranu), pokrętło PAN_GRAB = 0 —
//       odczucie Stratcomu; cel w zakresie panu
//   G9  `applyView` — widok natychmiast (bez lerpa): preset galaktyki i powrót migawki 1:1 na prawdziwym prototypie
//   G10 klik płyty: zaznaczenie, dwuklik (≤ 400 ms, ta sama gwiazda) = wejście, pustka = odznaczenie
//   G11 bramka wejścia (186): wygenerowany ∧ (zbadany ∨ własna obecność)
//   G12 pigułka trybu mapy: wyśrodkowana w wolnym odcinku, za wąski odcinek — brak
//   G13 klawisz G: g / Shift+G tak; z Ctrl / Alt / Meta — nie
//   G14 wygląd punktów płyty: rozmiar rośnie z jasnością, niezbadane × UNEXPLORED_MUL, halo dom + zaznaczona (bez duplikatu)
//   G15 kandydaci etykiet płyty: najpierw „pod gwiazdą, wyśrodkowana” (strona 'C'), potem kandydaci warstwy;
//       `placeLabels` bez `candidatesOf` — wynik jak dotąd (domyślny generator)
//   G16 `GalaxyModeController` na atrapie świata: wejście (migawka, renderer, tryb kamery, preset, koniec trybu Y, zdjęty
//       picker), wyjście 1:1, flaga OFF = nic, wejście w aktywny / inny / niedostępny układ
// Uruchom: node src/testing/smoke/galaxy_mode_logic_smoke.mjs
import '../headless/env.js';           // MUSI być pierwszy
import * as T3 from '../../lib/three.core.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
const header = (s) => console.log(`\n── ${s}`);
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const call = (fn, ...a) => { try { return fn ? fn(...a) : undefined; } catch (e) { return `WYJĄTEK: ${e.message}`; } };

// ⚠ DYNAMICZNIE i w try/catch — moduły POWSTAJĄ w G1: statyczny import wywróciłby suitę na kodzie sprzed kroku.
let GL = null, GC = null, GP = null, SPS = null, CC = null, HLL = null, GG = null;
try { GL = await import('../../ui/GalaxyModeLogic.js'); } catch (e) { console.log('  (GalaxyModeLogic:', e.message + ')'); }
try { GC = await import('../../ui/GalaxyModeController.js'); } catch (e) { console.log('  (GalaxyModeController:', e.message + ')'); }
try { GP = await import('../../renderer/GalaxyPlate.js'); } catch (e) { console.log('  (GalaxyPlate:', e.message + ')'); }
try { SPS = await import('../../renderer/StarPointShader.js'); } catch { /* piny padną */ }
try { CC = await import('../../renderer/ThreeCameraController.js'); } catch (e) { console.log('  (ThreeCameraController:', e.message + ')'); }
try { HLL = await import('../../ui/HudLabelLogic.js'); } catch { /* piny padną */ }
try { GG = await import('../../generators/GalaxyGenerator.js'); } catch { /* piny padną */ }

const galaxy = GG?.GalaxyGenerator?.generate?.(424242) ?? { systems: [] };
const systems = galaxy.systems;
const sysA = systems.find((s) => s.id === 'sys_007'), sysB = systems.find((s) => s.id === 'sys_031');

// ═══ G0 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('G0  API');
{
  const need = ['GALAXY_K', 'GALAXY_LAYER', 'CAMERA_FAR', 'GALAXY_CAMERA', 'GALAXY_ZOOM', 'GALAXY_FADE_MS', 'GALAXY_DOUBLE_CLICK_MS',
    'galaxyLyToWorld', 'systemById', 'galaxyAnchorLy', 'plateGroupPosition', 'plateWorldOf', 'galaxyFitDistLy', 'galaxyCameraConfig',
    'galaxyPresetView', 'buildGalaxyEnterPlan', 'buildGalaxyExitPlan', 'galaxyZoomFactor', 'galaxyZoomStep', 'clampPanTarget',
    'galaxyPanStep', 'pickGalaxyStar', 'isSystemEnterable', 'plateClickAction', 'LIVE_GALAXY', 'plateStarLook', 'plateHaloLook',
    'haloIds', 'galaxyLabelCandidates', 'layoutMapModePill', 'mapModePillAt', 'isGalaxyToggleKey'];
  const missing = need.filter((k) => !(GL && k in GL));
  ok(missing.length === 0, `G0a GalaxyModeLogic — ${need.length} eksportów (brak: ${missing.join(', ') || '—'})`);
  ok(typeof GC?.GalaxyModeController === 'function' && typeof GC?.galaxyViewOn === 'function', 'G0b GalaxyModeController + galaxyViewOn');
  ok(typeof GP?.GalaxyPlate === 'function', 'G0c GalaxyPlate (THREE wstrzykiwany — ładuje się pod node)');
  ok(typeof SPS?.createPlateStarMaterial === 'function' && typeof SPS?.STAR_VERT_PLATE === 'string'
    && SPS.STAR_VERT_PLATE.replace(SPS.PLATE_FADE_DECL_UNIFORM, '').replace(SPS.PLATE_FADE_APPLY, '') === SPS.STAR_VERT,
    'G0d wariant płyty `StarPointShader` = DERYWACJA STAR_VERT (dwie wstawki, reszta co do znaku)');
  ok(systems.length === 72 && !!sysA && !!sysB, `G0e galaktyka z prawdziwego generatora (ziarno 424242): ${systems.length} układów`);
}

// ═══ G1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('G1  stałe trybu');
ok(GL?.GALAXY_K === 200, 'G1a K = 200 j. / ly (D-GX-1 (c))');
ok(Number.isInteger(GL?.GALAXY_LAYER) && GL.GALAXY_LAYER !== 0, 'G1b płyta na warstwie ≠ 0 (kamera systemu widzi warstwę 0)');
ok(GL?.CAMERA_FAR?.system === 5000 && GL?.CAMERA_FAR?.galaxy === 40000, 'G1c far: system 5 000 (jak przed krokiem), galaktyka 40 000 (D-GX-3)');

// ═══ G2 / G3 ══════════════════════════════════════════════════════════════════════════════════════════════════════
header('G2  kotwica = aktywny układ (prawdziwa płyta na three.core)');
{
  const plate = GP?.GalaxyPlate ? new GP.GalaxyPlate(T3, { pixelRatio: 1, logDepth: false }) : null;
  call(() => plate.setSystems(systems, { brightOf: () => true }));
  call(() => plate.setAnchor(systems, sysA.id));
  const wA = call(() => plate.starWorld(sysA.id));
  const K = GL?.GALAXY_K ?? 200;
  ok(!!wA && near(wA.x, 0) && near(wA.y, 0) && near(wA.z, 0), `G2a gwiazda aktywnego układu (${sysA?.id}) w początku świata`);
  const gp = plate?.group?.position;
  ok(!!gp && near(gp.x, -sysA.x * K, 1e-9) && near(gp.y, -sysA.z * K, 1e-9) && near(gp.z, -sysA.y * K, 1e-9),
    'G2b `group.position = −P_active · K` (osie świata: X = gx, Y = gz, Z = gy)');
  ok(plate?.group?.scale?.x === K && plate?.stars?.layers?.mask === (1 << (GL?.GALAXY_LAYER ?? 1)) && plate?.group?.visible === false,
    'G2c skala grupy = K, punkty na warstwie płyty, płyta niewidoczna poza trybem');
  call(() => plate.setAnchor(systems, 'sys_home'));
  const wH = call(() => plate.starWorld('sys_home'));
  ok(!!wH && near(wH.x, 0) && near(wH.y, 0) && near(wH.z, 0) && near(plate.group.position.x, 0),
    'G2d dom aktywny → dom w początku (rama F1 „home at origin” jako przypadek szczególny)');

  header('G3  niezmiennik przesunięcia');
  const rel = (anchorId) => {
    call(() => plate.setAnchor(systems, anchorId));
    const a = plate.starWorld(sysA.id), b = plate.starWorld(sysB.id);
    return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  };
  const r1 = rel('sys_home'), r2 = rel(sysA.id), r3 = rel(sysB.id);
  ok(near(r1.x, r2.x, 1e-6) && near(r1.y, r2.y, 1e-6) && near(r1.z, r3.z, 1e-6) && near(r2.x, r3.x, 1e-6),
    'G3a SEDNO: wektor A→B identyczny przy kotwicy w domu, w A i w B');
  ok(near(r1.x, (sysB.x - sysA.x) * K, 1e-6) && near(r1.y, (sysB.z - sysA.z) * K, 1e-6) && near(r1.z, (sysB.y - sysA.y) * K, 1e-6),
    'G3b wektor = (P_B − P_A) · K w osiach świata');
  const ws = call(() => plate.starsWorld());
  ok(Array.isArray(ws) && ws.length === 72 && ws.every((s) => Number.isFinite(s.x)), `G3c starsWorld — 72 gwiazdy, skończone położenia`);
}

// ═══ G4 / G5 ══════════════════════════════════════════════════════════════════════════════════════════════════════
header('G4  konfiguracja kamery galaktyki');
{
  const fit = GL?.galaxyFitDistLy?.(systems);
  ok(Number.isFinite(fit) && fit > 50 && fit < 65, `G4a fitDist Stratcomu ≈ 57 ly (zmierzone: ${fit?.toFixed?.(2)} ly)`);
  ok(near(GL?.galaxyFitDistLy?.([{ x: 21.87, y: 0, z: 0 }]), 57.2994, 1e-3), 'G4b reguła Stratcomu: rozrzut 21,87 ly → 57,30 ly (StratcomGalaxyRenderer)');
  const cfg = GL?.galaxyCameraConfig?.(systems, sysA.id);
  const K = 200;
  ok(cfg?.minDist === 6 * K && cfg?.maxDist === 120 * K && near(cfg?.presetDist, fit * K, 1e-6),
    'G4c zakres 6–120 ly · K, preset = fitDist · K');
  ok(near(cfg?.panCenter?.x, -sysA.x * K, 1e-9) && near(cfg?.panCenter?.z, -sysA.y * K, 1e-9) && cfg?.panHalf === 30 * K,
    'G4d pan wokół środka galaktyki (dom w świecie = −P_active · K), ±30 ly · K');
  ok(cfg?.pitch === 0.92 && cfg?.yaw === 0.6 && cfg?.far === 40000, 'G4e skos 0,92 / azymut 0,6 (stały skos stołu holograficznego), far 40 000');
  const mul0 = GL?.LIVE_GALAXY?.PRESET_DIST_MUL;
  if (GL?.LIVE_GALAXY) GL.LIVE_GALAXY.PRESET_DIST_MUL = 0.7;
  const c07 = GL?.galaxyCameraConfig?.(systems, sysA.id);
  if (GL?.LIVE_GALAXY) GL.LIVE_GALAXY.PRESET_DIST_MUL = -3;
  const cBad = GL?.galaxyCameraConfig?.(systems, sysA.id);
  if (GL?.LIVE_GALAXY) GL.LIVE_GALAXY.PRESET_DIST_MUL = mul0;
  ok(mul0 === 1 && near(c07?.presetDist, fit * K * 0.7, 1e-6) && near(cBad?.presetDist, fit * K, 1e-6),
    'G4f pokrętło PRESET_DIST_MUL (domyślnie 1 = podpisane 57 ly): 0,7 → preset × 0,7; wartość niedodatnia → 1');

  header('G5  plany: migawka i przywrócenie 1:1');
  const snap = { theta: 0.31, phi: 1.07, dist: 233.5, target: { x: 4.2, y: 0, z: -7.7 } };
  const plan = GL?.buildGalaxyEnterPlan?.({ camera: snap, systems, activeId: sysA.id });
  ok(!!plan && plan.snapshot.camera !== snap && plan.snapshot.camera.target !== snap.target
    && JSON.stringify(plan.snapshot.camera) === JSON.stringify(snap), 'G5a migawka = KOPIA kamery (nie alias — późniejsza mutacja jej nie zmienia)');
  ok(plan?.apply?.theta === 0.6 && plan?.apply?.phi === 0.92 && near(plan?.apply?.dist, cfg?.presetDist, 1e-9)
    && plan?.apply?.target?.x === 0 && plan?.apply?.target?.z === 0, 'G5b widok wejścia = preset (cel = aktywny układ w początku)');
  snap.dist = 999;
  const exit = GL?.buildGalaxyExitPlan?.(plan?.snapshot);
  ok(exit?.camera?.dist === 233.5 && exit.camera.theta === 0.31 && exit.camera.target.z === -7.7, 'G5c wyjście = DOKŁADNIE migawka (1:1)');
  ok(GL?.buildGalaxyExitPlan?.({})?.camera === null, 'G5d KONTROLA: brak migawki → bez widoku (nic nie zgaduje)');
}

// ── atrapa kamery: PRAWDZIWY prototyp `ThreeCameraController` na wektorach three.core ──────────────────────────────
function mkCam({ targetDist = 100, minDist = 0.3, R = 0, goal = [0, 0, 0] } = {}) {
  if (!CC?.ThreeCameraController) return null;
  const c = Object.create(CC.ThreeCameraController.prototype);
  c.camera = new T3.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000);
  c._theta = 0.3; c._phi = 1.1; c._goalTheta = null; c._goalPhi = null;
  c._defaultDist = 85; c._dist = targetDist; c._targetDist = targetDist;
  c._target = new T3.Vector3(...goal); c._goalTarget = new T3.Vector3(...goal);
  c._minDist = minDist; c._starCoreRadius = R; c._mode = 'system'; c._galaxy = null; c._wheelDeltaMode = 0;
  return c;
}
const desc = (name) => Object.getOwnPropertyDescriptor(CC?.ThreeCameraController?.prototype ?? {}, name);
const minDistOf = (c) => call(() => desc('minDist').get.call(c));
const maxDistOf = (c) => call(() => desc('maxDist').get.call(c));

// ═══ G6 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('G6  kamera w trybie układu — wartości jak przed krokiem (prototyp na atrapie)');
{
  const table = [[100, 100, 105], [10, 100, 12], [3, 100, 4], [1, 100, 1.4], [0.3, -100, 0.3], [449, 100, 450]];
  const res = table.map(([d, dy]) => { const c = mkCam({ targetDist: d }); call(() => c.wheelZoom(dy)); return c?._targetDist; });
  ok(table.every(([, , exp], i) => near(res[i], exp, 1e-9)), `G6a tabela kroku kółka (100→105, 10→12, 3→4, 1→1,4, podłoga 0,3, sufit 450): ${res.join(' · ')}`);
  const cs = mkCam({ R: 3.6 });
  ok(near(minDistOf(cs), 7.92, 1e-9) && near(minDistOf(mkCam({ R: 3.6, goal: [10, 0, 0] })), 0.3, 1e-12) && maxDistOf(cs) === 450,
    'G6b podłoga 501 przy gwieździe 2,2 R = 7,92 (cel w strefie), poza strefą 0,3; sufit 450');
  const c2 = mkCam({ R: 3.6 }); call(() => c2.setTargetDist(1000)); const a = c2?._targetDist;
  call(() => c2.setTargetDist(0.01)); const b = c2?._targetDist;
  ok(a === 450 && near(b, 7.92, 1e-9), `G6c setTargetDist — klamra 450 / podłoga efektywna (${a} / ${b})`);
  const c3 = mkCam({ targetDist: 100 }); c3._wheelDeltaMode = 1; call(() => c3.wheelZoom(100));
  ok(near(c3?._targetDist, 105, 1e-9), 'G6d tryb linii zdarzenia NIE zmienia kroku układu (gałąź układu nie czyta deltaMode)');
  ok(c3?.mode === 'system', 'G6e domyślny tryb kamery: system');
}

// ═══ G7 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('G7  kamera w trybie galaktyki — zoom mnożnikowy, zakres, powrót co do bitu');
{
  const cfg = GL?.galaxyCameraConfig?.(systems, 'sys_home');
  const c = mkCam({ targetDist: 11460, R: 3.6 });
  call(() => c.setMode('galaxy', cfg));
  ok(c?.mode === 'galaxy' && minDistOf(c) === 1200 && maxDistOf(c) === 24000, 'G7a tryb galaktyki: podłoga 1 200, sufit 24 000 (getter — suwak zoomu czyta to samo)');
  call(() => c.wheelZoom(100));  const o = c?._targetDist;
  c._targetDist = 11460; call(() => c.wheelZoom(-100)); const i = c?._targetDist;
  ok(near(o, 11460 * 1.12, 1e-6) && near(i, 11460 * 0.89, 1e-6), `G7b SEDNO: 100 px od siebie ×1,12 (${o?.toFixed?.(1)}), do siebie ×0,89 (${i?.toFixed?.(1)})`);
  c._targetDist = 11460; c._wheelDeltaMode = 1; call(() => c.wheelZoom(3)); const l = c?._targetDist; c._wheelDeltaMode = 0;
  ok(near(l, 11460 * Math.pow(1.12, 0.99), 1e-6), 'G7c tryb linii: 3 linie × 33 px = 99 px → ×1,12^0,99 (normalizacja D-GX-7)');
  c._targetDist = 23000; call(() => c.wheelZoom(500)); const hi = c?._targetDist;
  c._targetDist = 1300; call(() => c.wheelZoom(-500)); const lo = c?._targetDist;
  ok(hi === 24000 && lo === 1200, `G7d zakres: sufit ${hi}, podłoga ${lo}`);
  call(() => c.setTargetDist(5)); const s1 = c?._targetDist; call(() => c.setTargetDist(1e9)); const s2 = c?._targetDist;
  ok(s1 === 1200 && s2 === 24000, 'G7e setTargetDist w trybie galaktyki — klamra zakresu galaktyki');
  call(() => c.setMode('system'));
  ok(c?.mode === 'system' && near(minDistOf(c), 7.92, 1e-9) && maxDistOf(c) === 450, 'G7f SEDNO: powrót do trybu układu — podłoga 501 i sufit 450 jak przed wejściem');
  c._targetDist = 100; call(() => c.wheelZoom(100));
  ok(near(c?._targetDist, 105, 1e-9), 'G7g po powrocie tabela kroku układu bez zmian (100 → 105)');
  ok(GL?.galaxyZoomFactor?.(0) === 1 && GL?.galaxyZoomFactor?.(200) > GL?.galaxyZoomFactor?.(100), 'G7h zero — bez zmiany; większy obrót — większy krok');
}

// ═══ G8 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('G8  pan — „chwyć”, pokrętło, zakres');
{
  const yaw = 0.6, right = { x: Math.sin(yaw), z: -Math.cos(yaw) };   // prawa strona ekranu w świecie (baza kamery three)
  const o = { dist: 11460, fov: 55, yaw, viewportHpx: 1041, center: { x: 0, z: 0 }, half: 6000 };
  const g = GL?.galaxyPanStep?.({ x: 0, z: 0 }, 50, 0, { ...o, grab: true });
  const s = GL?.galaxyPanStep?.({ x: 0, z: 0 }, 50, 0, { ...o, grab: false });
  const dot = (p) => p.x * right.x + p.z * right.z;
  ok(!!g && dot(g) < 0, `G8a SEDNO: przeciągnięcie w prawo, „chwyć” — cel w lewo (zawartość jedzie za kursorem; rzut ${g ? dot(g).toFixed(1) : '—'})`);
  ok(!!s && dot(s) > 0, 'G8b KONTROLA: grab = false — cel w prawo (odczucie Stratcomu, `panScreenToWorld` bez flag)');
  const far = GL?.galaxyPanStep?.({ x: 5990, z: -5990 }, -5000, 3000, { ...o, grab: true });
  ok(!!far && Math.abs(far.x) <= 6000 + 1e-9 && Math.abs(far.z) <= 6000 + 1e-9, 'G8c cel w zakresie panu (±połowa wokół środka, osobno X i Z)');
  ok(GL?.LIVE_GALAXY?.PAN_GRAB === 1, 'G8d domyślnie „chwyć” (pokrętło `galaxyTuning.PAN_GRAB`)');
  const c = mkCam({ targetDist: 11460 }); call(() => c.setMode('galaxy', { minDist: 1200, maxDist: 24000, panCenter: { x: 0, z: 0 }, panHalf: 6000 }));
  c._theta = yaw; call(() => c._galaxyPan(50, 0));
  ok(!!c && dot({ x: c._goalTarget.x, z: c._goalTarget.z }) < 0 && near(c._target.x, c._goalTarget.x, 1e-12),
    'G8e kontroler (prototyp): przeciągnięcie przesuwa cel od razu (cel = cel docelowy, bez lerpa) w kierunku „chwyć”');
}

// ═══ G9 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('G9  applyView — widok natychmiast; preset i powrót 1:1 (prototyp)');
{
  const c = mkCam({ targetDist: 233.5, R: 3.6, goal: [4.2, 0, -7.7] });
  c._theta = 0.31; c._phi = 1.07;
  const snap = call(() => c.snapshotView());
  const cfg = GL?.galaxyCameraConfig?.(systems, 'sys_home');
  call(() => c.setMode('galaxy', cfg)); call(() => c.applyView(GL.galaxyPresetView(cfg)));
  ok(c?._theta === 0.6 && c?._phi === 0.92 && near(c?._dist, cfg.presetDist, 1e-9) && c?._dist === c?._targetDist && c?._target.x === 0,
    'G9a preset NATYCHMIAST: kąty, dystans (bez lerpa), cel w początku');
  call(() => c.setMode('system')); call(() => c.applyView(snap));
  ok(c?._theta === 0.31 && c?._phi === 1.07 && c?._targetDist === 233.5 && c?._dist === 233.5 && c?._goalTarget.x === 4.2 && c?._goalTarget.z === -7.7,
    'G9b SEDNO: powrót migawki 1:1 (kąty, dystans, cel)');
  const p = c?.camera?.position;
  ok(!!p && near(p.x, 4.2 + 233.5 * Math.sin(1.07) * Math.cos(0.31), 1e-6), 'G9c pozycja kamery przeliczona od razu (`_applyCamera`)');
}

// ═══ G10 / G11 ════════════════════════════════════════════════════════════════════════════════════════════════════
header('G10 klik płyty: zaznaczenie / dwuklik / pustka');
{
  const f = GL?.plateClickAction;
  const a = f?.({ id: null, t: -Infinity }, 'sys_7', 1000);
  const b = f?.(a?.memo, 'sys_7', 1300);
  const c = f?.(a?.memo, 'sys_7', 1500);
  const d = f?.(a?.memo, 'sys_8', 1200);
  const e = f?.(a?.memo, null, 1100);
  ok(a?.action === 'select' && b?.action === 'enter' && c?.action === 'select' && d?.action === 'select' && e?.action === 'deselect',
    `G10a 1. klik — zaznaczenie; ta sama gwiazda ≤ 400 ms — wejście; po 500 ms — zaznaczenie; inna gwiazda — zaznaczenie; pustka — odznaczenie`);
  const b2 = f?.(b?.memo, 'sys_7', 1350);
  ok(b2?.action === 'select', 'G10b po wejściu pamięć dwukliku wyzerowana (trzeci klik nie wchodzi drugi raz)');
  const sel = { selectedId: 'sys_7', dive: false };
  const fo = f?.(a?.memo, 'sys_7', 1500, undefined, sel);
  const fi = f?.(a?.memo, 'sys_7', 1500, undefined, { selectedId: 'sys_7', dive: true });
  const fd = f?.(a?.memo, 'sys_7', 1200, undefined, { selectedId: 'sys_7', dive: false });
  const fx = f?.(a?.memo, 'sys_8', 1500, undefined, sel);
  ok(fo?.action === 'focus' && fi?.action === 'enter' && fd?.action === 'enter' && fx?.action === 'select',
    'G10c T2: 2. klik w zaznaczoną (>400 ms) — fokus; z bliska (dive) — wejście; dwuklik zawsze wejście; inna gwiazda — zaznaczenie');

  header('G11 bramka wejścia (186)');
  const g = GL?.isSystemEnterable;
  const rows = [[{ generated: true, explored: true }, true], [{ generated: true, presence: true }, true],
    [{ generated: true }, false], [{ explored: true }, false], [{ presence: true }, false], [{}, false]];
  ok(rows.every(([s, exp]) => g?.(s) === exp), 'G11a wygenerowany ∧ (zbadany ∨ obecność): tabela 6 przypadków');
}

// ═══ G12 / G13 ════════════════════════════════════════════════════════════════════════════════════════════════════
header('G12 pigułka trybu mapy');
{
  const pill = GL?.layoutMapModePill?.({ spanLeft: 300, spanRight: 900, stripTop: 700, stripH: 20, widths: [60, 90] });
  const total = 60 + 2 + 90;
  ok(pill?.length === 2 && pill[0].mode === 'system' && pill[1].mode === 'galaxy' && near(pill[0].x - 300, 900 - (pill[1].x + 90), 1e-9)
    && near(pill[1].x - pill[0].x, 62, 1e-9), `G12a dwa segmenty, wyśrodkowane w odcinku (szer. ${total})`);
  ok(GL?.layoutMapModePill?.({ spanLeft: 300, spanRight: 400, stripTop: 700, stripH: 20, widths: [60, 90] })?.length === 0, 'G12b odcinek za wąski — brak pigułki');
  ok(GL?.mapModePillAt?.(pill, pill[1].x + 5, pill[1].y + 5)?.mode === 'galaxy' && GL?.mapModePillAt?.(pill, 10, 10) === null, 'G12c trafienie segmentu');

  header('G13 klawisz G');
  const k = GL?.isGalaxyToggleKey;
  ok(k?.({ key: 'g' }) === true && k?.({ key: 'G', shiftKey: true }) === true && k?.({ key: 'g', ctrlKey: true }) === false
    && k?.({ key: 'g', altKey: true }) === false && k?.({ key: 'g', metaKey: true }) === false && k?.({ key: 'm' }) === false,
    'G13a g / Shift+G — tak; Ctrl / Alt / Meta — nie; inna litera — nie');
}

// ═══ G14 / G15 ════════════════════════════════════════════════════════════════════════════════════════════════════
header('G14 wygląd punktów płyty');
{
  const L = GL?.plateStarLook;
  const dim = L?.({ luminosity: 0.04, spectralType: 'M' }, { explored: true }), bright = L?.({ luminosity: 3.0, spectralType: 'F' }, { explored: true });
  const unx = L?.({ luminosity: 3.0, spectralType: 'F' }, { explored: false });
  ok(bright?.size > dim?.size && bright?.intensity > dim?.intensity, 'G14a rozmiar i intensywność rosną z jasnością');
  ok(near(unx?.intensity, bright?.intensity * GL.LIVE_GALAXY.UNEXPLORED_MUL, 1e-12) && unx?.size === bright?.size,
    'G14b niezbadane — intensywność × UNEXPLORED_MUL (0,5), rozmiar bez zmian');
  ok(bright?.intensity > 1, 'G14c najjaśniejsze ponad próg bloomu (HDR > 1, F5)');
  ok(JSON.stringify(GL?.haloIds?.('sys_home', 'sys_7')) === '["sys_home","sys_7"]' && JSON.stringify(GL?.haloIds?.('sys_home', 'sys_home')) === '["sys_home"]'
    && JSON.stringify(GL?.haloIds?.('sys_home', null)) === '["sys_home"]', 'G14d halo: dom zawsze, zaznaczona dodatkowo (bez duplikatu)');

  // G2 T3 — prawdziwa gwiazda płyty „bliżej” niż tło nieba: szczyt ≥ 2× najjaśniejsze tło, barwa bardziej nasycona.
  const SC = await import('../../utils/SkyCatalog.js');
  const sat = (c) => (Math.max(...c) - Math.min(...c)) / Math.max(...c);
  const syst = [];
  for (let i = 0; i < 72; i++) syst.push({ id: 's' + i, x: (i % 9) * 6 - 24, y: Math.floor(i / 9) * 6 - 24, z: (i % 5) - 2, spectralType: 'GKMFA'[i % 5], luminosity: [1, 0.4, 0.04, 3, 10][i % 5] });
  let maxFiller = 0;
  for (const seed of [1, 7, 42, 1234]) {
    const cat = SC.buildSkyCatalog(syst, seed), out = SC.allocSkyBuffers(cat.N + 8);
    for (const o of ['s0', 's13', 's40']) maxFiller = Math.max(maxFiller, SC.skyFrom(cat, o, out).maxFillerI);
  }
  const peak = L?.({ luminosity: 400, spectralType: 'G' }, { explored: true });
  ok(maxFiller > 2 && peak?.intensity >= 2 * maxFiller, `G14e T3 szczyt płyty ${peak?.intensity?.toFixed(2)} ≥ 2× najjaśniejsze tło ${maxFiller.toFixed(3)} (było 2,60 vs 2,543)`);
  ok(['G', 'F', 'K', 'M', 'A'].every((c) => sat(GL.plateStarColor(c, GL.LIVE_GALAXY.PLATE_SAT)) > sat(SC.SKY_CLASS_RGB[c]) + 1e-9),
    'G14f T3 barwa klasy na płycie bardziej nasycona niż na niebie (każda klasa)');
  ok(JSON.stringify(GL.plateStarColor('G', 1)) === JSON.stringify([...SC.SKY_CLASS_RGB.G]) && Math.max(...GL.plateStarColor('K', 1.7)) === 1,
    'G14g T3 kontrola: sat = 1 daje barwę nieba co do bitu; maksimum kanału zostaje 1');

  header('G15 kandydaci etykiet płyty');
  const it = { key: 'g:a', ax: 400, ay: 300, w: 60, h: 14, clear: 5, gapBelow: 3 };
  const cands = GL?.galaxyLabelCandidates?.(it);
  ok(cands?.[0]?.side === 'C' && near(cands[0].x, 400 - 30, 1e-12) && cands[0].y > 300 && cands.length === 1 + (HLL?.labelCandidates?.(it)?.length ?? -1),
    'G15a najpierw POD gwiazdą, wyśrodkowana; potem standardowi kandydaci warstwy');
  const items = [{ key: 'a', ax: 200, ay: 200, w: 50, h: 12, clear: 4, prio: 1 }, { key: 'b', ax: 205, ay: 202, w: 50, h: 12, clear: 4, prio: 2 }];
  const rect = { x: 0, y: 0, w: 800, h: 600 };
  const d1 = HLL?.placeLabels?.(items, { rect }), d2 = HLL?.placeLabels?.(items, { rect, candidatesOf: HLL.labelCandidates });
  ok(!!d1 && JSON.stringify(d1) === JSON.stringify(d2), 'G15b `placeLabels` bez `candidatesOf` — wynik identyczny z jawnym domyślnym generatorem');
  const g1 = HLL?.placeLabels?.([{ ...items[0] }], { rect, candidatesOf: GL.galaxyLabelCandidates });
  ok(g1?.placed?.[0]?.side === 'C' && near(g1.placed[0].attach.x, g1.placed[0].x + 25, 1e-12), 'G15c etykieta płyty pod gwiazdą (strona C, zaczep — środek górnej krawędzi)');
}

// ═══ G16 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('G16 GalaxyModeController na atrapie świata');
{
  const flag0 = GAME_CONFIG.FEATURES.galaxyView;
  const log = [];
  const cam = mkCam({ targetDist: 233.5, R: 3.6, goal: [4.2, 0, -7.7] });
  if (cam) { cam._theta = 0.31; cam._phi = 1.07; }
  const generated = new Set(['sys_home', sysA.id]);
  const K = {
    civMode: true, galaxyData: { systems }, activeSystemId: 'sys_home',
    starSystemManager: { activeSystemId: 'sys_home', getSystem: (id) => (generated.has(id) ? { systemId: id } : null),
      switchActiveSystem: (id) => { log.push(['switch', id]); return true; } },
    threeRenderer: { _cameraController: cam,
      setGalaxyMode: (on, ctx) => log.push(['mode', on, ctx?.activeId ?? null]),
      setGalaxySelected: (id) => log.push(['sel', id]),
      resetToSystemView: () => { log.push(['reset']); return true; } },
    tacticalMode: { isActive: true, exit: (r) => { log.push(['tacticalExit', r]); K.tacticalMode.isActive = false; } },
    uiManager: { isPickerActive: () => true, cancelPickerMode: () => log.push(['pickerCancel']), _dirty: false, _outlinerState: { groundUnits: [] } },
    intelSystem: { isAtLeast: () => false }, observatorySystem: null, colonyManager: { getAllColonies: () => [] },
    vesselManager: { getAllVessels: () => [] }, entityManager: { get: () => null },
  };
  globalThis.window.KOSMOS = K;
  const gm = GC?.GalaxyModeController ? new GC.GalaxyModeController() : null;
  GAME_CONFIG.FEATURES.galaxyView = false;
  const off = call(() => gm.enter('test'));
  ok(off === false && log.length === 0 && gm?.isActive === false, 'G16a flaga OFF — wejście nic nie robi (tryb nieosiągalny)');
  GAME_CONFIG.FEATURES.galaxyView = true;
  const on = call(() => gm.enter('test'));
  ok(on === true && gm?.isActive === true && cam?.mode === 'galaxy' && cam?._theta === 0.6 && cam?._phi === 0.92,
    'G16b wejście: tryb kamery galaktyki, preset (skos / azymut)');
  ok(log.some((e) => e[0] === 'tacticalExit' && e[1] === 'galaxy') && log.some((e) => e[0] === 'pickerCancel')
    && log.some((e) => e[0] === 'mode' && e[1] === true && e[2] === 'sys_home'), 'G16c wejście kończy tryb Y, zdejmuje picker, przełącza scenę (kotwica = aktywny układ)');
  call(() => gm.select(sysA.id));
  ok(gm?.selectedSystemId === sysA.id && log.some((e) => e[0] === 'sel' && e[1] === sysA.id), 'G16d zaznaczenie → halo płyty');
  log.length = 0;
  call(() => gm.exit('test'));
  ok(gm?.isActive === false && cam?.mode === 'system' && cam?._theta === 0.31 && cam?._phi === 1.07 && cam?._targetDist === 233.5
    && cam?._goalTarget.x === 4.2 && log.some((e) => e[0] === 'mode' && e[1] === false), 'G16e SEDNO: wyjście — scena układu i kamera systemu 1:1');
  ok(call(() => gm.exit('again')) === false, 'G16f wyjście drugi raz — nic (słuchacze kamery wołają exit ponownie)');
  call(() => gm.enter('test')); log.length = 0;
  const notGen = systems.find((s) => !generated.has(s.id));
  ok(call(() => gm.enterSystem(notGen.id)) === false && gm.isActive === true && log.length === 0, 'G16g układ niewygenerowany — wejście odmówione, tryb zostaje');
  const exp0 = sysA.explored; sysA.explored = true;
  ok(call(() => gm.enterSystem(sysA.id)) === true && gm.isActive === false && log.some((e) => e[0] === 'switch' && e[1] === sysA.id),
    'G16h układ zbadany i wygenerowany — wyjście + przełączenie (kadr układu robi `switchSystem`)');
  sysA.explored = exp0;
  call(() => gm.enter('test')); log.length = 0;
  ok(call(() => gm.enterSystem('sys_home')) === true && gm.isActive === false && log.some((e) => e[0] === 'reset') && !log.some((e) => e[0] === 'switch'),
    'G16i aktywny układ — wyjście + domyślny widok układu, bez przebudowy sceny');
  GAME_CONFIG.FEATURES.galaxyView = flag0;
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
