// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — ARKUSZ HUD paczka B (B-1): model uwagi i nawiasy zaznaczenia (`HudAttentionLogic`, `HudFocusLayer`) — HUD_PLAN.md
// §4.5; D-HUD-11, D-HUD-12, D-HUD-c.
// Uruchom: node src/testing/smoke/hud_attention_smoke.mjs
//
// Wyłącznie LOGIKA (protokół od H2, HUD_PLAN §4.0): kto dostaje krycie 1,0 / 0,38 / 0,25, przejście czasu realnego, maszyna
// stanów z zaznaczeniem i alertem, nawiasy (kto ma, kto nie ma), pauza = nawiasy statyczne (spoczynek warstwy). Bez pinów na
// stałe rysunku (liczby z tabeli stałych modułu, nie z literałów keepera). Moduły powstają w paczce B — import dynamiczny
// (brak modułu = pin pada, suita się nie przerywa).
//   U0  API; flaga `hudAttention` usunięta (B-Z — na stałe ON)
//   U1  ostrość: zaznaczenie (zbiór, prowadzący, ciało, stacja, flota) albo alert; ping wroga — nie
//   U2  krycie etykiety: bez ostrości 1; z ostrością 1 dla zaznaczonej / przypiętej / alertowanej / najechanej, reszta LABEL_DIM
//   U3  krycie trasy: zaznaczona / najechana / alertowana 1, reszta ROUTE_DIM (= stała H3 `HUD_ROUTES.ATTENTION_UNSELECTED`)
//   U4  pamięć przejść: nowy klucz od razu na celu, zmiana celu liniowo przez FADE_MS czasu REALNEGO (działa w pauzie),
//       `animating` tylko w trakcie, `prune` zapomina nieobecne
//   U5  maszyna stanów (sekwencja klatek): brak → zaznaczenie statku → alert na innym → koniec alertu → odznaczenie
//   U6  nawiasy: statek zawsze (co najmniej ramka RTS), ciało / stacja od tarczy BRACKET_MIN_DISC_PX, gasną przy bliskim
//       zoomie; narożnik pod przypiętą etykietą pominięty; ramię ≤ BRACKET_ARM_PX i ≤ BRACKET_ARM_FRAC boku
//   U7  oddech nawiasów na zegarze SYMULACJI: brak zegara — BREATH_HI; okres BREATH_MS; ta sama chwila — to samo krycie;
//       warstwa (prawdziwy `HudLayer` + `HudFocusLayer`): pauza (zegar stoi) — spoczynek bez rysunku, zegar biegnie — klatki
//   U8  odznaczenie: podwarstwa nawiasów pusta (bez wywołań ctx)
// ⚠ PRZECELOWANE 2026-10-28 (ARKUSZ HUD B-Z — flagi HUD na stałe ON, ścieżki OFF usunięte): U0c / U0d pinują brak predykatu
//   i klucza flagi (dawniej: semantyka „brak klucza = OFF”); U3c — poziom trasy niezaznaczonej bez zaznaczenia = stała H3
//   (dawniej przez usunięte `routeAttention`); U8 — odznaczenie zamiast flagi OFF.
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import * as T3 from '../../lib/three.core.js';

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const src = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), 'utf8'); } catch { return ''; } };
const tryImport = async (p) => { try { return await import(p); } catch (e) { console.log('    (' + p + ': ' + e.message + ')'); return null; } };

const AT = await tryImport('../../ui/HudAttentionLogic.js');
const RT = await tryImport('../../ui/HudRouteLogic.js');
const FL = await tryImport('../../ui/HudFocusLayer.js');
const HL = await tryImport('../../ui/HudLayer.js');
const FEATURES = GAME_CONFIG.FEATURES;
const A = AT?.HUD_ATTENTION ?? {};
const call = (fn, ...a) => { try { return AT?.[fn]?.(...a); } catch (e) { return `ERR ${e.message}`; } };

// ═══ U0 ══════════════════════════════════════════════════════════════════════
header('U0  API (flaga `hudAttention` usunięta — B-Z)');
{
  const need = ['HUD_ATTENTION', 'HUD_ATTENTION_DEFAULTS', 'focusActive', 'focusVesselIds', 'labelAttentionTarget',
    'routeAttentionTarget', 'makeAttentionMemory', 'breathAlpha', 'bracketBox', 'bracketCorners', 'dropCornersUnder', 'tuneHudAttention',
    'resetHudAttention'];
  const missing = need.filter((n) => AT?.[n] === undefined);
  ok(missing.length === 0, `U0a: \`HudAttentionLogic\` — ${need.length} eksportów (brak: ${missing.join(', ') || '—'})`);
  ok(typeof FL?.HudFocusLayer === 'function', 'U0b: `HudFocusLayer`');
  ok(!!AT && AT.isHudAttentionOn === undefined, 'U0c (B-Z): predykat flagi `isHudAttentionOn` usunięty — model uwagi bez rozgałęzień');
  ok(!/\bhudAttention:\s*(true|false),/.test(strip(src('../../config/GameConfig.js'))) && FEATURES.hudAttention === undefined,
    'U0d (B-Z): klucz `FEATURES.hudAttention` usunięty z GameConfig');
  ok(/new HudFocusLayer\(this\)\]/.test(strip(src('../../ui/HudLayer.js'))), 'U0e: podwarstwa nawiasów w domyślnych podwarstwach warstwy HUD (na wierzchu)');
}

// ═══ U1 ══════════════════════════════════════════════════════════════════════
header('U1  ostrość: zaznaczenie albo alert');
{
  const none = { vesselIds: [], leadId: null, entityId: null, stationId: null, fleetId: null, pingedEnemyId: null };
  ok(call('focusActive', none, 0) === false, 'U1a: nic nie zaznaczone, bez alertu — bez ostrości');
  ok(call('focusActive', none, 1) === true, 'U1b: alert bez zaznaczenia — ostrość');
  const rows = [['vesselIds', ['v1']], ['leadId', 'v1'], ['entityId', 'p1'], ['stationId', 'st1'], ['fleetId', 'f1']];
  ok(rows.every(([k, v]) => call('focusActive', { ...none, [k]: v }, 0) === true), `U1c: zaznaczenie (${rows.map((r) => r[0]).join(', ')}) — ostrość`);
  ok(call('focusActive', { ...none, pingedEnemyId: 'e1' }, 0) === false, 'U1d: ping wroga nie jest zaznaczeniem');
  const ids = call('focusVesselIds', { vesselIds: ['v1', 'v2'], leadId: 'v3' }, ['v4', 'v1']);
  ok(ids instanceof Set && [...ids].sort().join(',') === 'v1,v2,v3,v4', 'U1e: statki w ostrości — zbiór + prowadzący + członkowie zaznaczonej floty');
}

// ═══ U2 / U3 ═════════════════════════════════════════════════════════════════
header('U2  krycie etykiety · U3 krycie trasy');
{
  const L = (o) => call('labelAttentionTarget', o);
  ok(L({ focus: false }) === 1 && L({ focus: false, selected: true }) === 1, 'U2a: bez ostrości — każda etykieta 1,0 (dzisiejsze wartości)');
  ok(['selected', 'pinned', 'alerted', 'hovered'].every((k) => L({ focus: true, [k]: true }) === 1),
    'U2b: z ostrością — zaznaczona, przypięta, alertowana, najechana: 1,0');
  ok(near(L({ focus: true }), A.LABEL_DIM) && A.LABEL_DIM === AT?.HUD_ATTENTION_DEFAULTS?.LABEL_DIM && A.LABEL_DIM > 0 && A.LABEL_DIM < 1,
    `U2c: z ostrością — reszta LABEL_DIM (${A.LABEL_DIM})`);
  const R = (o) => call('routeAttentionTarget', o);
  ok(['selected', 'hovered', 'alerted'].every((k) => R({ [k]: true }) === 1), 'U3a: trasa zaznaczona / najechana / alertowana — 1,0');
  ok(near(R({}), A.ROUTE_DIM) && near(A.ROUTE_DIM, RT?.HUD_ROUTES?.ATTENTION_UNSELECTED),
    `U3b: trasa niezaznaczona — ROUTE_DIM (${A.ROUTE_DIM}) = stała H3 \`HUD_ROUTES.ATTENTION_UNSELECTED\` (${RT?.HUD_ROUTES?.ATTENTION_UNSELECTED})`);
  ok(near(R({}), RT?.HUD_ROUTES?.ATTENTION_UNSELECTED) && RT?.routeAttention === undefined,
    'U3c KONTROLA: trasa niezaznaczona = stała H3 (`ATTENTION_UNSELECTED`; dawne `routeAttention` — ścieżka OFF — usunięte w B-Z)');
}

// ═══ U4 ══════════════════════════════════════════════════════════════════════
header('U4  pamięć przejść — czas realny');
{
  const m = call('makeAttentionMemory');
  const F = A.FADE_MS;
  ok(!!m && typeof m.step === 'function' && F > 0, `U4-0: pamięć przejść (FADE_MS ${F} ms)`);
  if (m && typeof m.step === 'function') {
    m.begin();
    const v0 = m.step('a', 0.38, 1000);
    ok(v0 === 0.38 && m.animating === false, 'U4a: nowy klucz — od razu na celu (pojawienie się niesie fade-in H2), bez animacji');
    m.begin();
    const v1 = m.step('a', 1, 2000);
    ok(v1 === 0.38 && m.animating === true, 'U4b: zmiana celu — start od bieżącej wartości, animacja trwa');
    m.begin();
    const vh = m.step('a', 1, 2000 + F / 2);
    ok(near(vh, 0.38 + (1 - 0.38) / 2, 1e-12) && m.animating === true, `U4c: połowa FADE_MS — połowa drogi (${vh})`);
    m.begin();
    const ve = m.step('a', 1, 2000 + F);
    ok(ve === 1 && m.animating === false, 'U4d: po FADE_MS — cel, bez animacji');
    m.begin();
    m.step('a', 0.38, 3000); const vm = m.step('a', 1, 3000 + F / 4);
    ok(near(vm, 1 - (1 - 0.38) / 4, 1e-12), `U4e: zmiana celu w trakcie przejścia — od bieżącej wartości (${vm.toFixed?.(4)}), bez skoku`);
    m.prune(['b']);
    ok(m.size === 0 && m.peek('a') === null, 'U4f: `prune` — klucze nieobecne w klatce zapomniane');
    const lab = strip(src('../../ui/HudLabelLayer.js')), rte = strip(src('../../ui/HudRouteLayer.js'));
    const steps = [...lab.matchAll(/mem\.step\([^;\n]*/g), ...rte.matchAll(/this\._att\.step\([^;\n]*/g)].map((x) => x[0]);
    ok(steps.length >= 3 && steps.every((s) => /F\.now\)\s*$|F\.now\);?/.test(s) && !/F\.sim/.test(s)),
      `U4g: etykiety i trasy — przejście na czasie REALNYM klatki (\`F.now\`), nie na zegarze symulacji (reakcja na akcję gracza działa w pauzie; wywołań ${steps.length})`);
  }
}

// ═══ U5 ══════════════════════════════════════════════════════════════════════
header('U5  maszyna stanów: zaznaczenie i alert');
{
  // Trzy etykiety: statek A, statek B, kolonia C. Sekwencja klatek co 50 ms czasu realnego (pauza symulacji nie gra roli).
  const m = call('makeAttentionMemory');
  const keys = ['v:A', 'v:B', 'c:C'];
  let now = 10_000;
  const frame = (state) => {
    m.begin();
    const sel = { vesselIds: state.sel ? [state.sel] : [], leadId: state.sel ?? null, entityId: null, stationId: null, fleetId: null };
    const focus = call('focusActive', sel, state.alert ? 1 : 0);
    const out = {};
    for (const k of keys) {
      const id = k.slice(2);
      out[k] = m.step(k, call('labelAttentionTarget', { focus, selected: id === state.sel, alerted: id === state.alert }), now);
    }
    now += 50;
    return out;
  };
  const settle = (state) => { let o; for (let i = 0; i < 6; i++) o = frame(state); return o; };   // 300 ms ≥ FADE_MS
  if (m && typeof m.step === 'function') {
    const s0 = settle({});
    ok(keys.every((k) => s0[k] === 1), 'U5a: brak zaznaczenia i alertu — wszystkie 1,0');
    const f1 = frame({ sel: 'A' });
    ok(f1['v:A'] === 1 && f1['v:B'] === 1 && m.animating === true, 'U5b: pierwsza klatka po zaznaczeniu A — przejście rusza (bez skoku)');
    const s1 = settle({ sel: 'A' });
    ok(s1['v:A'] === 1 && near(s1['v:B'], A.LABEL_DIM) && near(s1['c:C'], A.LABEL_DIM), 'U5c: po FADE_MS — A 1,0, B i C LABEL_DIM');
    const s2 = settle({ sel: 'A', alert: 'B' });
    ok(s2['v:A'] === 1 && s2['v:B'] === 1 && near(s2['c:C'], A.LABEL_DIM), 'U5d: alert na B (A nadal zaznaczony) — B 1,0, C LABEL_DIM');
    const s3 = settle({ sel: 'A' });
    ok(s3['v:A'] === 1 && near(s3['v:B'], A.LABEL_DIM), 'U5e: koniec alertu — B wraca do LABEL_DIM');
    const s4 = settle({ alert: 'C' });
    ok(near(s4['v:A'], A.LABEL_DIM) && near(s4['v:B'], A.LABEL_DIM) && s4['c:C'] === 1, 'U5f: odznaczenie przy trwającym alercie na C — ostrość zostaje, C 1,0');
    const s5 = settle({});
    ok(keys.every((k) => s5[k] === 1) && m.animating === false, 'U5g: bez zaznaczenia i alertu — wszystkie 1,0, spoczynek');
  }
}

// ═══ U6 ══════════════════════════════════════════════════════════════════════
header('U6  nawiasy — kto ma, kto nie ma');
{
  const B = (o) => call('bracketBox', o);
  const frame = { w: 980, h: 740 };
  const small = B({ cx: 100, cy: 100, discR: (A.BRACKET_MIN_DISC_PX / 2) - 0.01, kind: 'body', frame });
  const just = B({ cx: 100, cy: 100, discR: A.BRACKET_MIN_DISC_PX / 2, kind: 'body', frame });
  ok(small === null && !!just && near(just.half, A.BRACKET_MIN_DISC_PX / 2 + A.BRACKET_GAP_PX),
    `U6a: ciało — tarcza (średnica) < ${A.BRACKET_MIN_DISC_PX} px bez nawiasów; od ${A.BRACKET_MIN_DISC_PX} px — bok = tarcza + odstęp ${A.BRACKET_GAP_PX} px`);
  ok(B({ cx: 100, cy: 100, discR: 1, kind: 'station', frame }) === null, 'U6b: stacja z małą tarczą — bez nawiasów (zostaje etykieta 1,0)');
  const v0 = B({ cx: 100, cy: 100, discR: 0, kind: 'vessel', frame });
  const v1 = B({ cx: 100, cy: 100, discR: 30, kind: 'vessel', frame });
  ok(!!v0 && v0.half === A.SHIP_MIN_HALF_PX && !!v1 && near(v1.half, 30 + A.BRACKET_GAP_PX),
    `U6c: statek — nawiasy zawsze, co najmniej ramka RTS (połowa boku ${A.SHIP_MIN_HALF_PX} px); duży model — tarcza + odstęp`);
  const gap = (r) => B({ cx: 0, cy: 0, discR: r, kind: 'body', frame });
  ok(near(gap(10).half - 10, A.BRACKET_GAP_PX) && near(gap(80).half - 80, A.BRACKET_GAP_PX), 'U6d: odstęp od tarczy stały w px przy każdym zbliżeniu');
  const fm = Math.min(frame.w, frame.h);
  const fadeAt = (f) => B({ cx: 0, cy: 0, discR: (f * fm) / 2 - A.BRACKET_GAP_PX, kind: 'body', frame });
  ok(fadeAt(A.FADE_LARGE_FROM - 0.01)?.fade === 1 && fadeAt((A.FADE_LARGE_FROM + A.FADE_LARGE_TO) / 2)?.fade > 0
    && fadeAt((A.FADE_LARGE_FROM + A.FADE_LARGE_TO) / 2)?.fade < 1 && fadeAt(A.FADE_LARGE_TO + 0.01) === null,
    `U6e: bliski zoom — nawiasy gasną od ${A.FADE_LARGE_FROM} do ${A.FADE_LARGE_TO} kadru (D-HUD-c)`);
  const boxes = [gap(3), gap(10), gap(80), v0];
  ok(boxes.every((b) => b && b.arm <= A.BRACKET_ARM_PX + 1e-9 && b.arm <= 2 * b.half * A.BRACKET_ARM_FRAC + 1e-9),
    'U6f: ramię narożnika ≤ BRACKET_ARM_PX i ≤ BRACKET_ARM_FRAC boku (mała tarcza — narożniki się nie zlewają)');
  const cs = call('bracketCorners', gap(20));
  ok(Array.isArray(cs) && cs.length === 4 && cs.map((c) => c.id).join(',') === 'tl,tr,bl,br', 'U6g: cztery narożniki ⌜ ⌝ ⌞ ⌟');
  const pinRect = { x: 0, y: -40, w: 60, h: 20 };   // przypięta etykieta nad prawym górnym narożnikiem
  const kept = call('dropCornersUnder', cs, [pinRect]);
  ok(Array.isArray(kept) && kept.length === 3 && !kept.some((c) => c.id === 'tr'), 'U6h: narożnik pod przypiętą etykietą — pominięty (rozwinięcie ma pierwszeństwo)');
  ok((call('dropCornersUnder', cs, [])?.length ?? 0) === 4, 'U6i KONTROLA: bez etykiet — cztery narożniki');
}

// ═══ U7 ══════════════════════════════════════════════════════════════════════
header('U7  oddech nawiasów — zegar symulacji; pauza = statycznie');
{
  const br = (s) => call('breathAlpha', s);
  ok(br(null) === A.BREATH_HI && br(undefined) === A.BREATH_HI && br(NaN) === A.BREATH_HI, 'U7a: brak zegara (przed pierwszym tikiem) — BREATH_HI, bez oddechu');
  ok(near(br(0), A.BREATH_HI) && near(br(A.BREATH_MS / 2), A.BREATH_LO) && near(br(A.BREATH_MS), A.BREATH_HI) && near(br(5 * A.BREATH_MS + 17), br(17)),
    `U7b: okres BREATH_MS (${A.BREATH_MS} ms zegara symulacji): HI → LO → HI`);
  const samples = Array.from({ length: 50 }, (_, i) => br(i * 97));
  ok(samples.every((v) => v >= A.BREATH_LO - 1e-12 && v <= A.BREATH_HI + 1e-12), `U7c: krycie w [${A.BREATH_LO}, ${A.BREATH_HI}]`);
  ok(br(4321) === br(4321), 'U7d: ta sama chwila zegara — to samo krycie (deterministyczne, bez czasu realnego)');
  // Warstwa: prawdziwy `HudLayer` z samą podwarstwą nawiasów; zaznaczone ciało z tarczą; zegar symulacji ustawiany jawnie.
  const K = globalThis.window.KOSMOS ?? (globalThis.window.KOSMOS = {});
  globalThis.innerWidth = 1600; globalThis.innerHeight = 1041;
  const cam = new T3.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000); cam.position.set(6, 6, 8); cam.lookAt(6, 0, 0); cam.updateMatrixWorld();
  const W0 = { sim: 5000, entity: 'p_nz', camEpoch: 1 };
  Object.assign(K, {
    civMode: true, activeSystemId: 'sys_home', uiScale: 1.25, planetGlobeOpen: false, uiPrefs: {},
    uiManager: { _cleanView: false, overlayManager: { isAnyOpen: () => false }, getSelectedVesselIds: () => [], getSelectedVesselId: () => null,
      get _selectedEntity() { return W0.entity ? { id: W0.entity } : null; }, getSelectedFleetId: () => null },
    threeRenderer: { _cleanView: false, _renderingEnabled: true, _contextLost: false, renderer: { getPixelRatio: () => 1.5 },
      getCameraMoveEpoch: () => W0.camEpoch, _vessels: new Map(),
      getHudView: () => ({ view: cam.matrixWorldInverse.elements.slice(), proj: cam.projectionMatrix.elements.slice(), fovDeg: 55, cssW: 1600, cssH: 1041, worldPerAU: 11 }),
      getBodyWorldInfo: (id) => (id === 'p_nz' ? { x: 6, y: 0, z: 0, r: 0.4 } : null) },
    vesselManager: { getAllVessels: () => [], getVessel: () => null },
    timeSystem: { get simClockMs() { return W0.sim; } },
    leftOutliner: { getReservedWidth: () => 150 }, rightOutliner: { getReservedWidth: () => 150 }, tacticalDock: { getReservedHeight: () => 0 },
  });
  const calls = [];
  const ctx = new Proxy({}, { get: (o, p) => (p in o ? o[p] : (...a) => { calls.push(String(p)); }), set: (o, p, v) => { o[p] = v; return true; } });
  const cv = { width: 0, height: 0, getContext: () => ctx };
  const focus = FL?.HudFocusLayer ? new FL.HudFocusLayer(null) : null;
  const hud = HL?.HudLayer && focus ? new HL.HudLayer(cv, { autoStart: false, now: () => 0, sublayers: [focus] }) : null;
  if (hud && focus) focus._hud = hud;
  const st1 = hud?.frame(1000);
  const d1 = focus?.debug?.();
  const b1 = d1?.brackets?.[0];
  ok(st1 === 'drawn' && d1?.brackets?.length === 1 && b1?.key === 'b:p_nz' && b1?.corners?.length === 4,
    `U7e: zaznaczone ciało z tarczą — nawiasy (${d1?.brackets?.length ?? 0}, narożniki ${b1?.corners?.join(',') ?? '—'})`);
  ok(near(b1?.alpha, Math.round(br(5000) * 10) / 10, 0.051), `U7f: krycie nawiasów = oddech w chwili zegara (${b1?.alpha} ≈ ${br(5000).toFixed(3)})`);
  calls.length = 0;
  const p1 = hud?.frame(1016), p2 = hud?.frame(1032), p3 = hud?.frame(5000);
  ok(p1 === 'idle' && p2 === 'idle' && p3 === 'idle' && calls.length === 0,
    `U7g SEDNO: pauza (zegar symulacji stoi), czas realny płynie — spoczynek, zero wywołań ctx (${p1} / ${p2} / ${p3}, ${calls.length} wywołań)`);
  W0.sim = 5016;
  const r1 = hud?.frame(5016);
  const d2 = focus?.debug?.();
  ok(r1 === 'drawn' && calls.length > 0 && d2?.brackets?.length === 1, 'U7h: zegar ruszył — klatka z nowym kryciem oddechu');
  // ═══ U8 — odznaczenie ═══
  calls.length = 0;
  W0.entity = null;
  W0.camEpoch++;
  hud?.frame(6000);
  const d3 = focus?.debug?.();
  ok((d3?.brackets?.length ?? -1) === 0 && !calls.some((c) => c === 'stroke'), 'U8a: odznaczenie — nawiasów brak (podwarstwa pusta)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
