// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_light_visibility_smoke — KEEPER Findingu 684 (ARC COMBAT VISUALS, poprawka po łącznej kontroli właściciela CV-1b + CV-1c,
// 2026-11-11, uwaga 2: „światła słabo widać"). Logika — F11, bez pinów na stałych rysunku (wartości domyślne pokręteł nie są pinowane).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// PRZYCZYNY (zmierzone): (1) krycie punktu zależało od JEGO rozmiaru na ekranie (`rozmiar / próg`) — punkt 0,03 długości na
// fregacie 40 px (1,2 px) miał krycie 0,8, na 20 px — 0,4; (2) profil blasku w małym punkcie: przy 2 px środki pikseli leżą
// w r ≈ 0,7, gdzie profil daje ~1 % jasności środka — sonda GPU: szczyt 2 / 255 przy kolorze 1,0. Poprawka: podłoga średnicy
// `uMinPx` (domyślnie 2 px) z PEŁNYM kryciem, gaśnięcie WYŁĄCZNIE z rozmiarem STATKU na ekranie (`uFadeHi` → `uFadeLo`, domyślnie
// 10 → 5 px), mały punkt (≤ 3 px) jako pełny dysk; po poprawce sonda GPU: szczyt 255 / 255 (`kosmos-handover/cv-1c/probe_glsl_lights.mjs`).
//
// CO PINUJE:
//   L1 lustro JS shadera (`lightPointScreen`): narysowana średnica NIGDY poniżej podłogi; krycie = 1, gdy statek ≥ próg pełnego
//      świecenia, 0 przy progu zgaszenia i niżej, niemalejące z rozmiarem statku; NIE zależy od rozmiaru samego punktu.
//      KONTROLA: dawny wzór (krycie = rozmiar punktu / próg) gasi punkt 0,03 na fregacie 40 px — warunek L1 go odrzuca.
//   L2 shader = lustro: człony `shipPx = s / pxW`, `smoothstep(uFadeLo, …, shipPx)`, `max(size, uMinPx * pxW)`, `vPx` i dysk małego
//      punktu w tekście GLSL (bez komentarzy). L3 pula: `update` wpisuje próg pełnego świecenia i zgaszenia do WSPÓLNYCH uniformów
//      (jedno pokrętło → wszystkie statki), braki → wartości domyślne. L4 pokrętła `MODEL_LIGHT_MIN_PX`, `MODEL_LIGHT_FADE_PX`,
//      `MODEL_LIGHT_FADE_END_PX`, `MODEL_LIGHT_GAIN` istnieją w `LIVE_CV_FX`, a renderer gry i Workshop przekazują wszystkie cztery puli.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };
const header = (t) => console.log('\n' + t);
const section = async (name, fn) => { header(name); try { await fn(); } catch (e) { fail++; console.log(`  ✗ ${name}: wyjątek ${e?.stack?.split('\n').slice(0, 3).join(' | ') ?? e}`); } };
const tryImport = async (rel) => { try { return await import(new URL(rel, import.meta.url).href); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const THREE = await tryImport('../../lib/three.module.js');
const LP = await tryImport('../../renderer/ShipLightPoints.js');
const FX = await tryImport('../../renderer/combat/FxEngine.js');
const ROOT = new URL('../../../', import.meta.url);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const rnd = (lo, hi) => lo + (hi - lo) * Math.random();

await section('L1  lustro shadera: podłoga średnicy i gaśnięcie tylko z rozmiarem statku', async () => {
  const pxToWorld = 2 * Math.tan((55 * Math.PI / 180) / 2) / 1041;
  let floorBad = 0, fullBad = 0, offBad = 0, monoBad = 0, indepBad = 0, n = 0;
  for (let i = 0; i < 4000; i++) {
    const minPx = rnd(1, 4), fadeEndPx = rnd(2, 8), fadePx = fadeEndPx + rnd(0.5, 10);
    const size = rnd(0.002, 0.08), shipLen = rnd(0.01, 0.06), depth = rnd(0.01, 40);
    const a = LP.lightPointScreen({ size, shipLen, depth, pxToWorld, minPx, fadePx, fadeEndPx });
    if (a.drawnPx < minPx - 1e-9) floorBad++;
    if (a.shipPx >= fadePx && a.alpha !== 1) fullBad++;
    if (a.shipPx <= fadeEndPx && a.alpha !== 0) offBad++;
    const b = LP.lightPointScreen({ size, shipLen, depth: depth * 0.9, pxToWorld, minPx, fadePx, fadeEndPx });   // bliżej = statek większy
    if (b.alpha < a.alpha - 1e-12) monoBad++;
    const c = LP.lightPointScreen({ size: size * 0.25, shipLen, depth, pxToWorld, minPx, fadePx, fadeEndPx });
    if (c.alpha !== a.alpha) indepBad++;
    n++;
  }
  ok(floorBad === 0, `L1a ${n} losowych ujęć: narysowana średnica nigdy poniżej podłogi (złe: ${floorBad})`);
  ok(fullBad === 0, `L1b statek ≥ próg pełnego świecenia ⇒ krycie 1 — rozmiar punktu nie ma znaczenia (złe: ${fullBad})`);
  ok(offBad === 0 && monoBad === 0, `L1c statek ≤ próg zgaszenia ⇒ krycie 0; krycie niemalejące z rozmiarem statku (złe: ${offBad} / ${monoBad})`);
  ok(indepBad === 0, `L1d krycie nie zależy od rozmiaru samego punktu (punkt 4× mniejszy — to samo krycie; złe: ${indepBad})`);
  // kino: fregata 40–50 px, punkt 0,03 (właściciel) — narysowany ≥ 2 px, pełne krycie
  const cine = [40, 45, 50].map((px) => { const shipLen = 0.016, depth = shipLen / (px * pxToWorld); return LP.lightPointScreen({ size: 0.03, shipLen, depth, pxToWorld, minPx: 2, fadePx: 10, fadeEndPx: 5 }); });
  ok(cine.every((a) => a.drawnPx >= 2 && a.alpha === 1 && a.sizePx < 2), `L1e kino (fregata 40 / 45 / 50 px): punkt 0,03 ma ${cine.map((a) => a.sizePx.toFixed(2)).join(' / ')} px — rysowany jako 2 px z pełnym kryciem`);
  // KONTROLA: dawny wzór gaśnięcia — krycie = (rozmiar punktu / próg), próg 1,5 px
  const old = (a) => Math.min(1, Math.max(0, a.sizePx / 1.5));
  const mid = LP.lightPointScreen({ size: 0.03, shipLen: 0.016, depth: 0.016 / (20 * pxToWorld), pxToWorld, minPx: 2, fadePx: 10, fadeEndPx: 5 });
  ok(old(cine[0]) < 0.85 && old(mid) < 0.5 && mid.alpha === 1,
    `L1f KONTROLA: dawny wzór dawał krycie ${cine.map((a) => old(a).toFixed(2)).join(' / ')} w kinie i ${old(mid).toFixed(2)} przy fregacie 20 px (nowy: ${mid.alpha}) — L1b go odrzuca`);
});

await section('L2  shader = lustro (tekst GLSL bez komentarzy)', async () => {
  const v = strip(LP.LIGHT_VERT), f = strip(LP.LIGHT_FRAG);
  ok(/float shipPx = s \/ pxW;/.test(v) && /smoothstep\(uFadeLo, max\(uFadeHi, uFadeLo \+ 1e-3\), shipPx\)/.test(v), 'L2a krycie z długości statku na ekranie (`shipPx`, smoothstep od uFadeLo do uFadeHi)');
  ok(/max\(size, uMinPx \* pxW\)/.test(v) && !/size \/ pxW\) \/ max\(uMinPx/.test(v), 'L2b podłoga średnicy `max(size, uMinPx * pxW)`; dawny człon krycia z rozmiaru punktu usunięty');
  ok(/vPx = drawn \/ pxW;/.test(v) && /smoothstep\(3\.0, 8\.0, vPx\)/.test(f) && /mix\(1\.0, glow \+ core, k\)/.test(f), 'L2c mały punkt jako pełny dysk (`vPx`, przejście do profilu blasku)');
  const both = LP.buildLightShaders({ logDepth: true });
  ok(/uniform float uFadeLo;/.test(both.vertexShader) && /uniform float uFadeHi;/.test(both.vertexShader) && /varying float vPx;/.test(both.fragmentShader), 'L2d deklaracje uFadeLo / uFadeHi / vPx w programie z chunkami log-depth');
});

await section('L3  pula: pokrętła do wspólnych uniformów', async () => {
  const pool = new LP.LightPointPool({ THREE, logDepth: true });
  const g = pool.geometryFor('k', [{ p: [0, 0, 0], size: 0.03 }]);
  const a = pool.acquire(g), b = pool.acquire(g);
  pool.update({ fovDeg: 55, viewportH: 1041, gain: 2.5, minPx: 2.4, fadePx: 12, fadeEndPx: 6 });
  const ua = a.material.uniforms, ub = b.material.uniforms;
  ok(ua.uFadeHi.value === 12 && ua.uFadeLo.value === 6 && ua.uMinPx.value === 2.4 && ua.uGain.value === 2.5, 'L3a update: próg pełnego świecenia, zgaszenia, podłoga i wzmocnienie w uniformach');
  ok(ua.uFadeHi === ub.uFadeHi && ua.uFadeLo === ub.uFadeLo && ua.uOpacity !== ub.uOpacity, 'L3b progi to WSPÓLNE obiekty uniformów (jedno pokrętło → wszystkie statki); krycie własne');
  pool.update({ fovDeg: 55, viewportH: 1041 });
  ok(ua.uFadeHi.value === LP.LIVE_LIGHTS_DEFAULTS.fadePx && ua.uFadeLo.value === LP.LIVE_LIGHTS_DEFAULTS.fadeEndPx && ua.uMinPx.value === LP.LIVE_LIGHTS_DEFAULTS.minPx,
    'L3c brak pokręteł ⇒ wartości domyślne (LIVE_LIGHTS_DEFAULTS)');
});

await section('L4  pokrętła na żywo: LIVE_CV_FX → renderer gry i Workshop', async () => {
  const T = FX.LIVE_CV_FX;
  ok(['MODEL_LIGHT_MIN_PX', 'MODEL_LIGHT_FADE_PX', 'MODEL_LIGHT_FADE_END_PX', 'MODEL_LIGHT_GAIN'].every((k) => Number.isFinite(T[k])) && T.MODEL_LIGHT_FADE_PX > T.MODEL_LIGHT_FADE_END_PX,
    'L4a cztery pokrętła w LIVE_CV_FX (próg pełnego świecenia > próg zgaszenia)');
  const tr = strip(readFileSync(new URL('src/renderer/ThreeRenderer.js', ROOT), 'utf8'));
  const i = tr.indexOf('  _tickCvModels() {');
  const body = tr.slice(i, tr.indexOf('\n  }\n', i));
  ok(/fadePx: T\.MODEL_LIGHT_FADE_PX/.test(body) && /fadeEndPx: T\.MODEL_LIGHT_FADE_END_PX/.test(body) && /minPx: T\.MODEL_LIGHT_MIN_PX/.test(body) && /gain: T\.MODEL_LIGHT_GAIN/.test(body),
    'L4b renderer gry (`_tickCvModels`) przekazuje puli wszystkie cztery pokrętła co klatkę');
  const ws = strip(readFileSync(new URL('tools/model-workshop/workshop.js', ROOT), 'utf8'));
  ok(/fadePx: T\.MODEL_LIGHT_FADE_PX/.test(ws) && /fadeEndPx: T\.MODEL_LIGHT_FADE_END_PX/.test(ws) && /minPx: T\.MODEL_LIGHT_MIN_PX/.test(ws), 'L4c Workshop przekazuje te same pokrętła (podgląd = gra)');
});

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
