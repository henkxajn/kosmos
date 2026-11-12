// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_presets_logic_smoke — KEEPER ARC COMBAT VISUALS, krok CV-2b (presety jakości, pula świateł, szyna sygnałów walki;
// D-CV-17, D-CV-18, D-CV-19, §3.1-5; flaga `cvPresets`). Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §2.9, §2.10, §4 CV-2b.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (wyłącznie logika — bez pinów na stałych rysunku; liczby tabeli §2.10 to podpisane decyzje, nie strojenie):
//   T1 tabela presetów: poziomy rosnąco, KAŻDY budżet Low ≤ Medium ≤ High (gęstość pikseli przy dpr 1 / 1,25 / 2, bloom,
//      cząstki, światła 4 / 2 / 0, odłamki, dym, żar, dym uszkodzeń, fale osłony, tekstury); High = dzisiejszy wzór gęstości
//   T2 ustawienia zastosowane dla każdego poziomu (gęstość, bloom, światła, tekstury, budżety); zapis poziomu 0 / 1 / 2 i nazw
//   T3 zapis na maszynie: obieg zapis → odczyt, śmieć, wyjątki magazynu (odczyt, zapis, sam dostęp do localStorage) — bez
//      wyjątku, powrót do wykrycia
//   T4 domyślny poziom z napisu renderera (RTX / GTX / Radeon RX → High; Intel UHD / Iris / Radeon Graphics / Apple M1 →
//      Medium; SwiftShader / llvmpipe / Mali / Adreno → Low; pusty / nieznany → Medium) i odczyt napisu z kontekstu GL
//   T5 dławienie: kolejność dym → żar → odłamki → dym uszkodzeń, dopiero po 2 s > 20 ms W WALCE; pojedyncza długa klatka
//      i przerwa (karta w tle) nie dławią; poza walką nie dławi; pasmo 17–20 ms bez zmian (histereza); powrót po 5 s (w walce
//      10 s); poziomy kanoniczne (Medium: 0 → 1 → 3 → 4 i z powrotem 4 → 3 → 1 → 0); Low — nic do dławienia
//   T6 strzały NIGDY nie znikają: ustawienia bez kluczy strzałów, lista dławienia tylko z efektów drugorzędnych, pule `FxEngine`
//      tej samej pojemności przy każdym presecie; wykonanie — Low + pełne dławienie: każdy strzał salwy w silniku
//   T7 pula świateł (prawdziwy r171): nigdy więcej widocznych niż liczba presetu, kradzież przy braku wolnego, odmowa na Low,
//      obwiednia na zegarze prezentacji (pauza stoi, ukrycie — jasność 0); zero konstrukcji THREE i tablic typowanych po
//      rozgrzewce (1 000 błysków)
//   T8 szyna sygnałów: czas prezentacji, scalanie (ten sam rodzaj + broń najwyżej raz na 30 ms, `count`), najwyżej 12 na
//      klatkę (kolejność: zniszczenie … strzał), pauza, ukrycie (sygnały przepadają), pełna kolejka, panorama; zero tablic
//      typowanych po konstrukcji; tabela sygnałów pokrywa każdy (rodzaj, broń / rozmiar), który renderer emituje, i dziś
//      zwraca `null`
//   T9 słuchacz `AudioSystem` (§3.1-5): po symulowanym starcie gry (`EventBus.clear()` + `attach()`) subskrybowany DOKŁADNIE
//      raz (także po drugim `attach()`) i odbiera sygnał; `attach()` wpina WYŁĄCZNIE ten słuchacz (D-CV-19 (a) — ☰ muzyka
//      zostaje martwa: #613); KONTROLA — `EventBus.clear()` odcina słuchacza konstruktora; `GameScene.start` woła `attach()`
//      PO `EventBus.clear()` (pin kolejności z kontrolą na zmutowanej kopii)
//   T10 renderer (prawdziwe metody wyciągnięte ze źródła, atrapa `this`): flaga OFF — dzisiejsza gęstość, bloom, bez puli,
//       bez wywołania `setPixelRatio`; ON — preset zastosowany, pula zbudowana RAZ, zmiana tekstur przebudowuje statki raz,
//       przełączenie flagi w konsoli wraca do dzisiejszych ustawień; dławienie zmienia tylko budżety drugorzędne;
//       salwa ON — sygnały fire / impact / shieldHit z czasem prezentacji i id starcia, OFF — żadnych, ten sam silnik
//   T11 źródło: wiersz ☰ „Grafika” tylko z flagą, klucze PL + EN, zero `Math.random` w modułach CV-2b, gorąca ścieżka puli
//       i szyny bez `new`; wariant 1K z danych (stempel normalizatora); kanwa HUD nie schodzi poniżej natywnej gęstości (Low)
// ⚠ Nowe moduły CV-2b importowane dynamicznie w try/catch — przy fail-first piny DEGRADUJĄ (czerwone), suita się nie przerywa.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus                  from '../../core/EventBus.js';
import { GAME_CONFIG }           from '../../config/GameConfig.js';
import * as FXC                  from '../../config/CombatFxConfig.js';
import { vesselTargetSize, vesselSizeClass } from '../../renderer/VesselModelResolver.js';
import { readFileSync }          from 'node:fs';

const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);
const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const PRESETS = await tryImport('../../data/CombatFxPresets.js');
const CUEDATA = await tryImport('../../data/CombatCueData.js');
const QP      = await tryImport('../../renderer/combat/QualityPreset.js');
const LP      = await tryImport('../../renderer/combat/LightPool.js');
const BUS     = await tryImport('../../renderer/combat/CombatCueBus.js');
const ENGINE  = await tryImport('../../renderer/combat/FxEngine.js');
const CLOCK   = await tryImport('../../renderer/combat/PresentationClock.js');
const HP      = await tryImport('../../renderer/ShipHardpoints.js');
const AUDIO   = await tryImport('../../systems/AudioSystem.js');
globalThis.__hudMod = await tryImport('../../ui/HudLayer.js');   // T11h — gęstość kanwy HUD przy presetach

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const guard = (label, fn) => { try { fn(); } catch (e) { assert(false, `${label} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const LEVELS = ['low', 'medium', 'high'];
const ORD = (list, v) => list.indexOf(v);

// ── T1 — tabela presetów ───────────────────────────────────────────────────────────────────────────────────────────
header('T1 — tabela presetów: poziomy rosnąco, każdy budżet Low ≤ Medium ≤ High, High = dzisiejsza gęstość');
guard('T1', () => {
  const P = PRESETS;
  assert(!!P && JSON.stringify(P.GFX_LEVELS) === JSON.stringify(LEVELS), `T1a poziomy rosnąco: ${JSON.stringify(P?.GFX_LEVELS)}`);
  const tbl = P.GFX_PRESETS;
  const num = ['particles', 'lights', 'debris', 'shieldRipples'];
  const bad = [];
  for (let i = 1; i < LEVELS.length; i++) {
    const lo = tbl[LEVELS[i - 1]], hi = tbl[LEVELS[i]];
    for (const k of num) if (!(lo[k] <= hi[k])) bad.push(`${k} ${LEVELS[i - 1]} ${lo[k]} > ${LEVELS[i]} ${hi[k]}`);
    for (const k of ['bloom', 'smoke', 'embers']) if (Number(lo[k]) > Number(hi[k])) bad.push(k);
    if (ORD(P.DAMAGE_SMOKE_ORDER, lo.damageSmoke) > ORD(P.DAMAGE_SMOKE_ORDER, hi.damageSmoke)) bad.push('damageSmoke');
    if (ORD(P.TEXTURE_ORDER, lo.textures) > ORD(P.TEXTURE_ORDER, hi.textures)) bad.push('textures');
    for (const dpr of [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2, 3]) {   // Finding 703 — także DPR < 1 (powiększenie przeglądarki < 100 %)
      if (!(P.presetPixelRatio(LEVELS[i - 1], dpr) <= P.presetPixelRatio(LEVELS[i], dpr))) bad.push(`pixelRatio @${dpr}`);
    }
  }
  assert(bad.length === 0, `T1b każdy budżet Low ≤ Medium ≤ High${bad.length ? ' — ' + bad.join('; ') : ''}`);
  const today = (dpr) => Math.min(dpr * 1.5, 2);
  assert([1, 1.25, 1.5, 2, 3].every((d) => P.presetPixelRatio('high', d) === today(d)),
    'T1c High = dzisiejszy wzór renderera min(dpr × 1,5, 2) (flaga ON na mocnej karcie nie zmienia ostrości)');
  assert(P.presetPixelRatio('medium', 1.25) === 1.25 && P.presetPixelRatio('medium', 2) === 1.5 && P.presetPixelRatio('low', 2) === 1,
    'T1d Medium = min(dpr, 1,5), Low = min(1,0, Medium) (tabela §2.10)');
  // Finding 703 (kontrola właściciela 2026-11-12, okno DPR 0,9): Low (stałe 1,0) był ostrzejszy od Medium (natywne 0,9).
  const d703 = [0.9, 1.0, 1.25, 2.0].map((dpr) => ({ dpr, low: P.presetPixelRatio('low', dpr), medium: P.presetPixelRatio('medium', dpr), high: P.presetPixelRatio('high', dpr) }));
  console.log('     ' + d703.map((r) => `DPR ${r.dpr}: ${r.low} / ${r.medium} / ${r.high}`).join(' · '));
  assert(d703.every((r) => r.low <= r.medium && r.medium <= r.high), 'T1h Low ≤ Medium ≤ High przy DPR 0,9 / 1,0 / 1,25 / 2,0 (Finding 703)');
  assert(d703.map((r) => r.low).join() === '0.9,1,1,1' && d703.map((r) => r.medium).join() === '0.9,1,1.25,1.5',
    'T1i Low = min(1,0, Medium): 0,9 przy DPR 0,9 (= Medium natywne), 1,0 przy DPR 1,0 / 1,25 / 2,0; Medium bez zmian');
  assert(tbl.high.lights === 4 && tbl.medium.lights === 2 && tbl.low.lights === 0 && P.LIGHT_POOL_MAX === 4,
    'T1e światła puli 4 / 2 / 0 (D-CV-18), pojemność puli = 4');
  assert(tbl.high.textures === '2k' && tbl.medium.textures === '1k' && tbl.low.textures === '1k' && tbl.low.bloom === false && tbl.medium.bloom === true,
    'T1f tekstury 2K / 1K / 1K, bloom wyłącznie bez Low');
  assert(P.GFX_STORAGE_KEY === 'kosmos_gfx_quality', 'T1g klucz zapisu na maszynie `kosmos_gfx_quality` (D-CV-17)');
});

// ── T2 — ustawienia zastosowane ─────────────────────────────────────────────────────────────────────────────────────
header('T2 — ustawienia zastosowane dla każdego poziomu; zapis poziomu liczbą i nazwą');
guard('T2', () => {
  const rows = LEVELS.map((lv) => [lv, QP.resolveGfxSettings(lv, { dpr: 1.25 })]);
  const ok = rows.every(([lv, s]) => {
    const p = PRESETS.GFX_PRESETS[lv];
    return s.level === lv && s.pixelRatio === PRESETS.presetPixelRatio(lv, 1.25) && s.bloom === p.bloom && s.lights === p.lights
      && s.textures === p.textures && s.particles === p.particles && s.debris === p.debris && s.smoke === p.smoke && s.embers === p.embers
      && s.damageSmoke === p.damageSmoke && s.shieldRipples === p.shieldRipples && s.throttle === 0 && s.throttled.length === 0;
  });
  console.log('     ' + rows.map(([lv, s]) => `${lv}: gęstość ${s.pixelRatio}, bloom ${s.bloom}, światła ${s.lights}, tekstury ${s.textures}`).join(' · '));
  assert(ok, 'T2a ustawienia każdego poziomu = tabela (gęstość przy dpr 1,25, bloom, światła, tekstury, budżety), bez dławienia');
  assert(QP.normalizeGfxLevel(0) === 'low' && QP.normalizeGfxLevel(1) === 'medium' && QP.normalizeGfxLevel(2) === 'high'
    && QP.normalizeGfxLevel('HIGH') === 'high' && QP.normalizeGfxLevel('Średnia') === 'medium' && QP.normalizeGfxLevel(3) === null
    && QP.normalizeGfxLevel('ultra') === null && QP.normalizeGfxLevel(null) === null && QP.normalizeGfxLevel(1.5) === null,
    'T2b poziom z liczby 0 / 1 / 2 (konsola bez cudzysłowów) i z nazwy; inne — null');
  assert(QP.nextGfxLevelInCycle('high') === 'medium' && QP.nextGfxLevelInCycle('medium') === 'low' && QP.nextGfxLevelInCycle('low') === 'high',
    'T2c cykl ☰ „Grafika”: High → Medium → Low → High');
  assert(QP.resolveGfxSettings('nonsense', { dpr: 1 }).level === 'high', 'T2d poziom nieznany — High (ustawienia zawsze kompletne)');
});

// ── T3 — zapis na maszynie ──────────────────────────────────────────────────────────────────────────────────────────
header('T3 — zapis na maszynie: obieg, śmieć, wyjątki magazynu');
guard('T3', () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }; };
  const st = mem();
  assert(QP.writeStoredGfxLevel('medium', st) === true && QP.readStoredGfxLevel(st) === 'medium' && st._m.get('kosmos_gfx_quality') === 'medium',
    'T3a obieg: zapis „medium” → odczyt „medium” (klucz `kosmos_gfx_quality`)');
  assert(QP.writeStoredGfxLevel(2, st) === true && QP.readStoredGfxLevel(st) === 'high', 'T3b zapis liczbą (2 → „high”)');
  assert(QP.writeStoredGfxLevel('ultra', st) === false && QP.readStoredGfxLevel(st) === 'high', 'T3c zapis śmiecia odrzucony, poprzedni zostaje');
  const junk = mem(); junk.setItem('kosmos_gfx_quality', '{"x":1}');
  const i1 = QP.initialGfxLevel({ storage: junk, rendererString: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)' });
  assert(QP.readStoredGfxLevel(junk) === null && i1.level === 'medium' && i1.source === 'detected', `T3d śmieć w magazynie → wykrycie (${i1.level}, ${i1.source})`);
  const throwing = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); } };
  let threw = false, r1, r2, i2;
  try {
    r1 = QP.readStoredGfxLevel(throwing); r2 = QP.writeStoredGfxLevel('low', throwing);
    i2 = QP.initialGfxLevel({ storage: throwing, rendererString: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11)' });
  } catch { threw = true; }
  assert(!threw && r1 === null && r2 === false && i2?.level === 'high' && i2?.source === 'detected',
    'T3e magazyn rzuca przy odczycie i zapisie — bez wyjątku: odczyt null, zapis false, start z wykrycia (High)');
  // Sam dostęp do `localStorage` rzuca (tryb prywatny / zablokowane dane strony).
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let threw2 = false, r3, w3;
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError: access denied'); } });
    r3 = QP.readStoredGfxLevel(); w3 = QP.writeStoredGfxLevel('low');
  } catch { threw2 = true; } finally { if (desc) Object.defineProperty(globalThis, 'localStorage', desc); }
  assert(!threw2 && r3 === null && w3 === false, 'T3f sam odczyt `localStorage` rzuca — odczyt null, zapis false, bez wyjątku');
  const ok = mem();
  QP.writeStoredGfxLevel('low', ok);
  const i3 = QP.initialGfxLevel({ storage: ok, rendererString: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070)' });
  assert(i3.level === 'low' && i3.source === 'stored', 'T3g zapis na maszynie wygrywa z wykryciem (Low na RTX — wybór gracza)');
});

// ── T4 — wykrycie z napisu renderera ────────────────────────────────────────────────────────────────────────────────
header('T4 — domyślny poziom z napisu renderera WebGL');
guard('T4', () => {
  const cases = [
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)', 'high'],
    ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)', 'medium'],
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'low'],
    ['llvmpipe (LLVM 15.0.7, 256 bits)', 'low'],
    ['Mali-G78 MP14', 'low'],
    ['Adreno (TM) 650', 'low'],
    ['', 'medium'],
    ['Some Future GPU 9000', 'medium'],
  ];
  const wrong = cases.filter(([s, lv]) => QP.detectGfxLevel(s) !== lv).map(([s, lv]) => `${s || '∅'} → ${QP.detectGfxLevel(s)} (oczekiwane ${lv})`);
  assert(wrong.length === 0, `T4a ${cases.length} napisów: RTX / GTX / RX / Arc / M2 Max → High, zintegrowane → Medium, programowe / mobilne → Low, nieznane → Medium${wrong.length ? ' — ' + wrong.join('; ') : ''}`);
  const glWith = { getExtension: (n) => (n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 37446 } : null),
    getParameter: (p) => (p === 37446 ? 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070)' : 'WebKit WebGL'), RENDERER: 7937 };
  const glPlain = { getExtension: () => null, getParameter: (p) => (p === 7937 ? 'Mali-G78' : null), RENDERER: 7937 };
  const glThrow = { getExtension: () => { throw new Error('lost context'); }, getParameter: () => { throw new Error('x'); } };
  assert(QP.readRendererString(glWith) === 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070)' && QP.readRendererString(glPlain) === 'Mali-G78'
    && QP.readRendererString(glThrow) === '' && QP.readRendererString(null) === '',
    'T4b napis z rozszerzenia `WEBGL_debug_renderer_info`; bez niego — `gl.RENDERER`; wyjątek / brak kontekstu — pusty (→ Medium)');
});

// ── T5 — dławienie automatyczne ─────────────────────────────────────────────────────────────────────────────────────
header('T5 — dławienie: kolejność, próg 20 ms × 2 s w walce, histereza, poziomy kanoniczne, strzały poza listą');
guard('T5', () => {
  const base = (lv) => QP.resolveGfxSettings(lv, { dpr: 1 });
  const run = (th, ms, seconds, ctx) => { const steps = Math.round(seconds * 1000 / ms); const levels = []; for (let i = 0; i < steps; i++) { if (th.step(ms, ctx)) levels.push(th.level); } return levels; };
  const hi = { inCombat: true, base: base('high') };
  const a = new QP.QualityThrottle();
  run(a, 30, 1.9, hi);
  const before = a.level;
  run(a, 30, 0.2, hi);
  assert(before === 0 && a.level === 1, `T5a High w walce, klatki 30 ms: po 1,9 s poziom ${before}, po 2,1 s — 1 (dym)`);
  const seq = [a.level, ...run(a, 30, 8.5, hi)];
  assert(JSON.stringify(seq) === '[1,2,3,4]', `T5b dalej co 2 s: poziomy ${JSON.stringify(seq)} (dym → żar → odłamki → dym uszkodzeń), potem bez zmian`);
  const order = [1, 2, 3, 4].map((k) => QP.resolveGfxSettings('high', { dpr: 1, throttle: k }));
  assert(order[0].smoke === false && order[0].embers === true && order[1].embers === false && order[1].debris > 0
    && order[2].debris === 0 && order[2].damageSmoke === 'on' && order[3].damageSmoke === 'off'
    && JSON.stringify(order[3].throttled) === '["smoke","embers","debris","damageSmoke"]',
    'T5c kolejność zdejmowania: dym → żar → odłamki → dym uszkodzeń (THROTTLE_ORDER)');
  const b = new QP.QualityThrottle();
  run(b, 30, 10, { inCombat: false, base: base('high') });
  assert(b.level === 0 && b.degrades === 0, 'T5d poza walką klatki 30 ms przez 10 s — bez dławienia');
  const c = new QP.QualityThrottle();
  for (let i = 0; i < 600; i++) { c.step(i === 300 ? 200 : 16.7, hi); }
  c.step(1000, hi); c.step(5000, hi);
  assert(c.level === 0 && c.gaps === 2, `T5e pojedyncza klatka 200 ms w walce nie dławi; przerwy 1 s / 5 s (karta w tle) — nie próbki (${c.gaps})`);
  const d = new QP.QualityThrottle();
  run(d, 30, 4.1, hi);
  const lvl2 = d.level;
  run(d, 18.5, 30, hi);
  const hold = d.level;
  run(d, 16.7, 9.5, hi);
  const inCombatRestore = d.level;
  run(d, 16.7, 1, hi);
  assert(lvl2 === 2 && hold === 2 && inCombatRestore === 2 && d.level === 1,
    `T5f histereza: pasmo 18,5 ms przez 30 s — bez zmiany (${hold}); w walce powrót dopiero po 10 s spokoju (${inCombatRestore} → ${d.level})`);
  run(d, 16.7, 5.2, { inCombat: false, base: base('high') });
  assert(d.level === 0 && d.restores === 2, 'T5g poza walką powrót po 5 s spokoju (1 → 0)');
  const m = new QP.QualityThrottle();
  const mb = { inCombat: true, base: base('medium') };
  const up = [m.level, ...run(m, 30, 7, mb)];
  const down = [m.level, ...run(m, 16.7, 16, { inCombat: false, base: base('medium') })];
  assert(JSON.stringify(up) === '[0,1,3,4]' && JSON.stringify(down) === '[4,3,1,0]',
    `T5h Medium (bez żaru): w górę ${JSON.stringify(up)}, w dół ${JSON.stringify(down)} — te same poziomy kanoniczne`);
  const l = new QP.QualityThrottle();
  run(l, 40, 20, { inCombat: true, base: base('low') });
  assert(l.level === 0 && l.degrades === 0, 'T5i Low: efektów drugorzędnych brak — nic do dławienia (poziom 0 po 20 s przy 40 ms)');
  const SEC = ['smoke', 'embers', 'debris', 'damageSmoke'];
  assert(PRESETS.THROTTLE_ORDER.every((k) => SEC.includes(k)) && PRESETS.THROTTLE_ORDER.length === 4,
    'T5j lista dławienia wyłącznie z efektów drugorzędnych (dym, żar, odłamki, dym uszkodzeń)');
});

// ── T6 — strzały nigdy nie znikają ──────────────────────────────────────────────────────────────────────────────────
header('T6 — strzały NIGDY nie znikają (preset ani dławienie nie dotykają pul strzałów)');
guard('T6', () => {
  const SHOT_KEYS = /beam|tracer|spark|shot|capacity|pool/i;
  const keys = new Set();
  for (const lv of LEVELS) for (let k = 0; k <= 4; k++) for (const key of Object.keys(QP.resolveGfxSettings(lv, { dpr: 1.25, throttle: k }))) keys.add(key);
  assert(![...keys].some((k) => SHOT_KEYS.test(k)), `T6a ustawienia bez kluczy strzałów (${[...keys].join(', ')})`);
});
// T6b / T6c — STRAŻNIKI (zielone także przed CV-2b: dziś silnik i salwa nie czytają presetu — i tak ma zostać).
guard('T6 strażniki', () => {
  const caps = ENGINE ? new ENGINE.FxEngine({ THREE, parent: new THREE.Scene(), logDepth: true }) : null;
  const TR = read('src/renderer/ThreeRenderer.js');
  const body = (n) => { const i = TR.indexOf(`\n  ${n}(`); if (i < 0) return ''; const e = TR.indexOf('\n  }\n', i); return strip(TR.slice(i, e)); };
  const ens = body('_ensureFxEngine');
  assert(!!caps && caps.beams.capacity === ENGINE.FX_POOL_CAPACITY.beam && caps.tracers.capacity === ENGINE.FX_POOL_CAPACITY.tracer
    && caps.sparks.capacity === ENGINE.FX_POOL_CAPACITY.spark && ens.length > 0 && !/capacity|_gfx/.test(ens),
    'T6b silnik FX budowany ze stałymi pojemnościami (`FX_POOL_CAPACITY`) — `_ensureFxEngine` nie czyta presetu');
  const rf = body('_cvFxRoundFx');
  const spawnAt = rf.indexOf('eng.spawnShot(');
  assert(spawnAt > 0 && !/if\s*\(\s*cues[^)]*\)\s*\{?[^;]*eng\.spawnShot/.test(rf) && !/_gfx|throttle/.test(rf),
    'T6c `_cvFxRoundFx`: `eng.spawnShot` bez warunku presetu / dławienia (gałąź sygnałów jest OSOBNĄ instrukcją)');
});

// ── T7 — pula świateł ───────────────────────────────────────────────────────────────────────────────────────────────
header('T7 — pula świateł: liczba presetu, kradzież, odmowa na Low, obwiednia, zero alokacji po rozgrzewce');
function probeIds() {
  const o = new THREE.Object3D(), m = new THREE.Material(), g = new THREE.BufferGeometry(), t = new THREE.Texture();
  const ids = { obj: o.id, mat: m.id, geo: g.id, tex: t.id };
  m.dispose(); g.dispose(); t.dispose();
  return ids;
}
function countTyped(fn) {
  const names = ['Float32Array', 'Float64Array', 'Uint16Array', 'Uint32Array', 'Int32Array', 'Uint8Array', 'Int16Array'];
  const saved = {}; let count = 0;
  for (const n of names) {
    saved[n] = globalThis[n];
    globalThis[n] = new Proxy(saved[n], { construct(T, args) { count++; return new T(...args); } });
  }
  try { fn(); } finally { for (const n of names) globalThis[n] = saved[n]; }
  return count;
}
guard('T7', () => {
  const scene = new THREE.Scene();
  const pool = new LP.CombatLightPool({ THREE, parent: scene, capacity: PRESETS.LIGHT_POOL_MAX });
  const visibleLights = () => { let n = 0; scene.traverseVisible((o) => { if (o.isPointLight) n++; }); return n; };
  const counts = [4, 2, 0, 9, -3].map((c) => { pool.setCount(c); return [pool.count, visibleLights()]; });
  assert(JSON.stringify(counts) === '[[4,4],[2,2],[0,0],[4,4],[0,0]]', `T7a widoczne światła = liczba presetu (4 / 2 / 0; 9 → 4, −3 → 0): ${JSON.stringify(counts)}`);
  pool.setCount(2);
  const allIdle = pool.lights.every((L) => L.intensity === 0);
  const slots = [];
  for (let i = 0; i < 6; i++) slots.push(pool.flash(i, 0.3, 0, 0xffffff, 1000 + i));
  assert(allIdle && slots.every((s) => s === 0 || s === 1) && pool.activeCount() === 2 && pool.stats().steals === 4 && visibleLights() === 2,
    `T7b w spoczynku jasność 0; 6 błysków przy liczbie 2 — nigdy więcej niż 2 zajęte (kradzieże ${pool.stats().steals}), widoczne 2`);
  pool.setCount(0);
  assert(pool.flash(0, 0, 0, 0xffffff, 2000) === -1 && pool.stats().refused === 1 && pool.activeCount() === 0, 'T7c Low (0 świateł): błysk odmówiony (`refused`)');
  pool.setCount(4);
  const T = pool.tuning;
  const s0 = pool.flash(0, 0.3, 0, 0xffd8a0, 0);
  const at = (t) => { pool.update(t); return pool.lights[s0].intensity; };
  const iPeak = at(T.LIGHT_ATTACK_MS + T.LIGHT_HOLD_MS / 2);
  const iPause1 = at(T.LIGHT_ATTACK_MS + T.LIGHT_HOLD_MS + T.LIGHT_FADE_MS / 2);
  const iPause2 = at(T.LIGHT_ATTACK_MS + T.LIGHT_HOLD_MS + T.LIGHT_FADE_MS / 2);
  pool.update(T.LIGHT_ATTACK_MS + T.LIGHT_HOLD_MS + T.LIGHT_FADE_MS / 2, { visible: false });
  const iHidden = pool.lights[s0].intensity;
  const busyHidden = pool.busy[s0];
  const iEnd = at(T.LIGHT_ATTACK_MS + T.LIGHT_HOLD_MS + T.LIGHT_FADE_MS + 1);
  assert(Math.abs(iPeak - T.LIGHT_INTENSITY) < 1e-9 && iPause1 > 0 && iPause1 < iPeak && iPause1 === iPause2 && iHidden === 0 && busyHidden === 1
    && iEnd === 0 && pool.activeCount() === 0,
    'T7d obwiednia na zegarze prezentacji: szczyt w podtrzymaniu, wygaszanie, ten sam czas = ta sama jasność (pauza), ukrycie — 0 (błysk trwa), po końcu — 0 i wolne');
  pool.update(10000);
  const ids0 = probeIds();
  const typed = countTyped(() => { for (let i = 0; i < 1000; i++) { pool.flash(i * 0.001, 0.3, 0, 0xff8040, 10000 + i * 7); pool.update(10000 + i * 7); } });
  const ids1 = probeIds();
  const d = { obj: ids1.obj - ids0.obj - 1, mat: ids1.mat - ids0.mat - 1, geo: ids1.geo - ids0.geo - 1, tex: ids1.tex - ids0.tex - 1 };
  assert(d.obj === 0 && d.mat === 0 && d.geo === 0 && d.tex === 0 && typed === 0 && pool.lights.length === 4,
    `T7e 1 000 błysków po rozgrzewce: konstrukcje THREE ${JSON.stringify(d)}, tablice typowane ${typed}, świateł nadal 4`);
});
guard('T7 kontrola', () => {
  const ids2 = probeIds();
  new THREE.PointLight(0xffffff, 1);
  const ids3 = probeIds();
  // PointLight = światło + kamera cienia (dwa Object3D) — licznik widzi oba.
  assert(ids3.obj - ids2.obj - 1 >= 1, `T7f KONTROLA licznika: celowa konstrukcja światła w oknie jest widziana (Object3D +${ids3.obj - ids2.obj - 1})`);
});

// ── T8 — szyna sygnałów ─────────────────────────────────────────────────────────────────────────────────────────────
header('T8 — szyna sygnałów: czas prezentacji, scalanie 30 ms, 12 na klatkę, pauza, ukrycie, panorama, tabela');
guard('T8', () => {
  const B = BUS;
  const got = [];
  const emit = (c) => got.push(c);
  const bus = new B.CombatCueBus();
  bus.schedule(100, 'fire', 'laser', 'small', 1, 0.3, 2, 'enc_1', 'v_a');
  const n0 = bus.flush(50, emit);
  const n1 = bus.flush(100, emit);
  const c = got[0];
  assert(n0 === 0 && n1 === 1 && c?.kind === 'fire' && c.weapon === 'laser' && c.size === 'small' && c.count === 1 && c.encounterId === 'enc_1'
    && c.vesselId === 'v_a' && c.pos.x === 1 && c.pos.z === 2 && c.t === 100 && Number.isFinite(c.pan) && Number.isFinite(c.dist),
    'T8a sygnał wysłany dopiero w swojej chwili prezentacji, z polami kind / weapon / size / count / pos / pan / dist / encounterId / vesselId / t');
  got.length = 0;
  for (let i = 0; i < 10; i++) bus.schedule(200 + i * 0.5, 'fire', 'kinetic', 'medium', 0, 0, 0, null, 'v_' + i);
  bus.flush(205, emit);
  bus.schedule(215, 'fire', 'kinetic', 'medium', 0, 0, 0, null, 'v_x');
  bus.flush(215, emit);
  const mid = got.length;
  bus.flush(235, emit);
  assert(got.length === 2 && got[0].count === 10 && mid === 1 && got[1].count === 1 && got[1].t === 235,
    `T8b scalanie: 10 strzałów w 5 ms → jeden sygnał count 10; kolejny 10 ms później czeka do upływu 30 ms (${got.map((g) => g.count + '@' + g.t).join(', ')})`);
  got.length = 0;
  const bus2 = new B.CombatCueBus();
  const kinds = ['fire', 'impact', 'shieldHit'];
  for (const k of kinds) for (const w of CUEDATA.CUE_WEAPONS) bus2.schedule(10, k, w, 'small', 0, 0, 0);
  for (const k of ['explosion', 'destroyed']) for (const s of CUEDATA.CUE_SIZES) bus2.schedule(10, k, null, s, 0, 0, 0);
  const f1 = bus2.flush(10, emit);
  const firstKinds = got.map((g) => g.kind);
  const f2 = bus2.flush(11, emit);
  assert(f1 === 12 && f2 === 3 && firstKinds.slice(0, 3).every((k) => k === 'destroyed') && got.slice(12).every((g) => g.kind === 'fire'),
    `T8c 15 kluczy naraz: 12 w tej klatce (najpierw zniszczenie), 3 w następnej (strzały na końcu): ${f1} + ${f2}`);
  got.length = 0;
  const bus3 = new B.CombatCueBus();
  bus3.schedule(1000, 'impact', 'missile', 'large', 0, 0, 0);
  const p1 = bus3.flush(500, emit) + bus3.flush(500, emit) + bus3.flush(500, emit);
  const p2 = bus3.flush(1000, emit);
  assert(p1 === 0 && p2 === 1, 'T8d pauza (zegar prezentacji stoi): kolejne klatki z tym samym czasem — nic; po wznowieniu sygnał w swojej chwili');
  got.length = 0;
  const bus4 = new B.CombatCueBus();
  bus4.schedule(10, 'fire', 'laser', null, 0, 0, 0); bus4.schedule(20, 'impact', 'laser', null, 0, 0, 0); bus4.schedule(500, 'fire', 'missile', null, 0, 0, 0);
  bus4.flush(30, emit, { visible: false });
  const hiddenSent = got.length, muted = bus4.stats().muted;
  bus4.flush(40, emit);
  const afterReturn = got.length;
  bus4.flush(500, emit);
  assert(hiddenSent === 0 && muted === 2 && afterReturn === 0 && got.length === 1 && got[0].weapon === 'missile',
    'T8e ukrycie (tryb galaktyki): sygnały, których czas nadszedł, przepadają (bez lawiny po powrocie); przyszłe — w swojej chwili');
  const bus5 = new B.CombatCueBus({ capacity: 4 });
  let threw = false;
  try { for (let i = 0; i < 10; i++) bus5.schedule(100 + i, 'fire', 'laser', null, 0, 0, 0); } catch { threw = true; }
  assert(!threw && bus5.n === 4 && bus5.stats().dropped === 6, 'T8f pełna kolejka (pojemność 4): przepadają najstarsze zaplanowane, bez wyjątku');
  assert(B.screenPan(0, -5, 1) === 0 && B.screenPan(5, -5, 1) === 1 && B.screenPan(-2.5, -5, 1) === -0.5 && B.screenPan(50, -5, 1) === 1
    && B.screenPan(-3, 4, 1) === -0.75, 'T8g panorama: środek 0, prawa krawędź +1, połowa w lewo −0,5, poza kadrem — przycięta; za kamerą — znak z x');
  const bus6 = new B.CombatCueBus();
  const typed = countTyped(() => { for (let f = 0; f < 100; f++) { for (let i = 0; i < 200; i++) bus6.schedule(f * 16 + (i % 8) * 10, CUEDATA.CUE_KINDS[i % 5], CUEDATA.CUE_WEAPONS[i % 3], CUEDATA.CUE_SIZES[i % 3], i, 0, 0, 'e', 'v'); bus6.flush(f * 16, () => {}); } });
  assert(typed === 0, `T8h 100 klatek × 200 sygnałów po konstrukcji: tablice typowane ${typed}`);
  const tbl = CUEDATA.COMBAT_CUE_SOUNDS;
  const cells = [];
  for (const k of CUEDATA.CUE_KINDS) for (const sub of (CUEDATA.CUE_WEAPON_KINDS.includes(k) ? CUEDATA.CUE_WEAPONS : CUEDATA.CUE_SIZES)) cells.push([k, sub]);
  // ARC CV-4a — przecelowane ŚWIADOMIE: tabela dostała wiersz `kill` (zniszczenie w chwili trafienia zabijającego, po rozmiarze) —
  // 15 → 18 komórek; reszta pinu bez zmian (każda komórka w tabeli, każda dziś → null).
  assert(cells.length === 18 && cells.filter(([k]) => k === 'kill').length === 3
    && cells.every(([k, sub]) => sub in tbl[k] && CUEDATA.cueSoundId({ kind: k, weapon: sub, size: sub }) === null),
    `T8i tabela sygnałów: ${cells.length} komórek (fire / impact / shieldHit × broń, explosion / destroyed / kill × rozmiar), każda dziś → null`);
  const TR = strip(read('src/renderer/ThreeRenderer.js'));
  const emittedKinds = [...new Set([...TR.matchAll(/cues\.schedule\([^,]+,\s*'([a-zA-Z]+)'/g)].map((m) => m[1]).concat(/'shieldHit' : 'impact'/.test(TR) ? ['shieldHit', 'impact'] : []))];
  const weapons = ['short', 'medium', 'long', null, 'zzz'].map((c) => B.cueWeaponOfCategory(c));
  const sizes = ['frigate', 'destroyer', 'battleship', 'small_cargo', 'medium_colony', 'large_science', undefined].map((s) => B.cueSizeOfClass(s));
  assert(emittedKinds.length >= 3 && emittedKinds.every((k) => CUEDATA.CUE_KINDS.includes(k)) && ['fire', 'impact', 'shieldHit', 'destroyed'].every((k) => emittedKinds.includes(k))
    && weapons.every((w) => CUEDATA.CUE_WEAPONS.includes(w)) && sizes.every((s) => CUEDATA.CUE_SIZES.includes(s)),
    `T8j renderer emituje ${JSON.stringify(emittedKinds)}; broń z kategorii (${weapons.join(', ')}) i rozmiar z klasy (${sizes.join(', ')}) — wszystkie w tabeli`);
  assert(CUEDATA.cueSoundId(null) === null && CUEDATA.cueSoundId({ kind: 'nope' }) === null && CUEDATA.cueSoundId({ kind: 'fire', weapon: 'toString' }) === null,
    'T8k `cueSoundId`: pusty / nieznany rodzaj / klucz spoza tabeli — null');
});

// ── T9 — słuchacz AudioSystem po EventBus.clear() ───────────────────────────────────────────────────────────────────
header('T9 — słuchacz sygnałów AudioSystem: po starcie gry (clear + attach) subskrybowany dokładnie raz i odbiera');
const countListeners = (ev) => EventBus.listeners.get(ev)?.length ?? 0;
guard('T9 kontrola', () => {
  // KONTROLA (zielona także przed CV-2b): konstruktor subskrybuje ☰ muzykę, `EventBus.clear()` ją odcina — mechanizm Finding 613,
  // przed którym `attach()` chroni słuchacza sygnałów.
  EventBus.clear();
  new AUDIO.AudioSystem();
  const ctor = countListeners('music:toggle');
  EventBus.clear();
  assert(ctor === 1 && countListeners('music:toggle') === 0,
    `T9a0 KONTROLA: konstruktor subskrybuje ☰ muzykę (${ctor}), \`EventBus.clear()\` odcina (0) — mechanizm Finding 613`);
});
guard('T9', () => {
  const count = countListeners;
  EventBus.clear();
  const a = new AUDIO.AudioSystem();
  const afterCtor = count('combatfx:cue');
  EventBus.clear();
  const afterClear = count('combatfx:cue');
  a.attach();
  const once = count('combatfx:cue');
  a.attach();
  const twice = count('combatfx:cue');
  EventBus.emit('combatfx:cue', { kind: 'fire', weapon: 'laser', size: 'small', count: 3, pan: 0.2, dist: 1 });
  EventBus.emit('combatfx:cue', { kind: 'destroyed', weapon: null, size: 'large', count: 1, pan: -0.5, dist: 2 });
  const st = a.cueStats();
  assert(afterCtor === 1 && afterClear === 0, `T9a konstruktor subskrybuje słuchacza sygnałów (${afterCtor}), \`EventBus.clear()\` go odcina (${afterClear})`);
  assert(once === 1 && twice === 1, `T9b po \`clear\` + \`attach()\`: dokładnie 1 subskrypcja (drugi \`attach()\` — nadal ${twice})`);
  assert(st.received === 2 && st.cues === 4 && st.byKind.fire === 3 && st.byKind.destroyed === 1 && st.resolved === 0,
    `T9c słuchacz odbiera sygnały (wywołań ${st.received}, scalonych ${st.cues}); id dźwięku dziś brak (resolved ${st.resolved})`);
  assert(count('music:toggle') === 0 && count('audio:toggle') === 0 && count('body:collision') === 0,
    'T9d `attach()` wpina WYŁĄCZNIE słuchacza sygnałów (D-CV-19 (a)): ☰ muzyka / efekty zostają bez słuchacza (#613 — osobna poprawka)');
  EventBus.clear();
});
guard('T9 źródło', () => {
  const AS = strip(read('src/systems/AudioSystem.js'));
  const att = AS.slice(AS.indexOf('\n  attach() {'), AS.indexOf('\n  }\n', AS.indexOf('\n  attach() {')));
  const ons = [...att.matchAll(/EventBus\.on\('([^']+)'/g)].map((m) => m[1]);
  assert(JSON.stringify(ons) === '["combatfx:cue"]', `T9e źródło \`attach()\`: jedna subskrypcja — ${JSON.stringify(ons)}`);
  const GS = strip(read('src/scenes/GameScene.js'));
  const order = (src) => {
    const s = src.indexOf('\n  start(canvas3D, uiCanvas, eventLayer) {');
    const e = src.indexOf('\n  }\n', s);
    const body = src.slice(s, e);
    const iClear = body.indexOf('EventBus.clear();'), iAttach = body.indexOf('this.audioSystem.attach?.()');
    return { iClear, iAttach, ok: s >= 0 && iClear >= 0 && iAttach > iClear };
  };
  const o = order(GS);
  assert(o.ok, `T9f \`GameScene.start\` woła \`audioSystem.attach()\` PO \`EventBus.clear()\` (pozycje ${o.iClear} < ${o.iAttach})`);
  const mutated = GS.replace('this.audioSystem.attach?.();', '').replace('EntityManager.clear();\n    EventBus.clear();', 'EntityManager.clear();\n    this.audioSystem?.attach?.();\n    EventBus.clear();');
  assert(!order(mutated).ok, 'T9g KONTROLA: kopia z `attach()` PRZED `EventBus.clear()` — pin kolejności ją odrzuca');
  EventBus.clear();
});

// ── T10 — renderer: prawdziwe metody wyciągnięte ze źródła ──────────────────────────────────────────────────────────
header('T10 — renderer: flaga OFF = dzisiejsze ustawienia, ON = preset; przełączanie; salwa z sygnałami / bez');
const TRSRC = read('src/renderer/ThreeRenderer.js');
function methodOf(name) {
  const i = TRSRC.indexOf(`\n  ${name}(`);
  if (i < 0) return null;
  const sigEnd = TRSRC.indexOf(') {\n', i);
  return { params: TRSRC.slice(TRSRC.indexOf('(', i) + 1, sigEnd), body: TRSRC.slice(sigEnd + 4, TRSRC.indexOf('\n  }\n', sigEnd)) };
}
const NAMES = ['THREE', 'GAME_CONFIG', 'window', 'performance', 'EventBus', 'CombatLightPool', 'LIGHT_POOL_MAX', 'resolveGfxSettings',
  'normalizeGfxLevel', 'nextGfxLevelInCycle', 'writeStoredGfxLevel', 'initialGfxLevel', 'readRendererString', 'QualityThrottle',
  'LIVE_GFX_THROTTLE', 'CombatCueBus', 'cueWeaponOfCategory', 'cueSizeOfClass', 'screenPan', 'vesselSizeClass', 'vesselTargetSize',
  'FxEngine', 'logDepthOn'];
const make = (name) => {
  const m = methodOf(name);
  if (!m) return null;
  return new Function(...NAMES, `return function (${m.params}) {\n${m.body}\n};`)(THREE, GAME_CONFIG, globalThis.window, globalThis.performance,
    EventBus, LP?.CombatLightPool, PRESETS?.LIGHT_POOL_MAX, QP?.resolveGfxSettings, QP?.normalizeGfxLevel, QP?.nextGfxLevelInCycle,
    QP?.writeStoredGfxLevel, QP?.initialGfxLevel, QP?.readRendererString, QP?.QualityThrottle, QP?.LIVE_GFX_THROTTLE, BUS?.CombatCueBus,
    BUS?.cueWeaponOfCategory, BUS?.cueSizeOfClass, BUS?.screenPan, vesselSizeClass, vesselTargetSize, ENGINE?.FxEngine, () => true);
};
const GFX_METHODS = ['_initGfxState', '_applyGfx', '_setRendererPixelRatio', 'applyGfxPreset', '_tickGfx', 'cvGfxInfo', 'cvShipTextureMemory',
  '_cvFxRoundFx', '_ensureCueBus', '_cueEncounterId', '_cueShot', '_cueDestroyed', '_flushCues', '_tickCvFx', '_ensureFxEngine'];
const clock = { now: 1e6 };
const realPerfNow = performance.now.bind(performance);
performance.now = () => clock.now;
const RTX = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11)';
function fakeRenderer({ dpr = 1.25, rendererString = RTX } = {}) {
  window.devicePixelRatio = dpr;
  window.innerHeight = 1041; window.innerWidth = 1600;
  const calls = { setPR: [], composerPR: [], rebuild: 0, wake: 0 };
  const gl = { getExtension: (n) => (n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 37446 } : null), getParameter: () => rendererString, RENDERER: 7937 };
  const camera = new THREE.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000);
  camera.position.set(0, 0.5, 1); camera.lookAt(0, 0.3, 0); camera.updateMatrixWorld(true);
  const R = {
    renderer: { setPixelRatio: (v) => calls.setPR.push(v), getContext: () => gl, info: { memory: { textures: 0 } } },
    _composer: { setPixelRatio: (v) => calls.composerPR.push(v) }, _bloomPass: { enabled: true }, scene: new THREE.Scene(), camera,
    cvTuning: ENGINE?.LIVE_CV_FX ?? {}, _pixelRatio: Math.min(dpr * 1.5, 2), _fxLightPool: null, _cueBus: null, _gfxApplied: null,
    _presClock: CLOCK ? new CLOCK.PresentationClock() : null, _vessels: new Map(), _stageFrame: null, _fxEngine: null, _fxGroup: null,
    _galaxyActive: false, _galaxyFlight: false, _sky: null, _galaxyPlate: null, missing: [],
    cvRebuildVesselSprites: () => { calls.rebuild++; return { rebuilt: 0 }; },
    _combatEndpointWorld: (id) => { const e = R._vessels.get(id); return e ? { x: e.sprite.position.x, y: e.sprite.position.y, z: e.sprite.position.z } : null; },
  };
  for (const n of GFX_METHODS) { const fn = make(n); if (fn) R[n] = fn; else R.missing.push(n); }
  window.KOSMOS = { hudLayer: { wake: () => calls.wake++ }, timeSystem: { isPaused: false, multiplier: 1 },
    vesselManager: { getVessel: (id) => ({ id, shipId: id.startsWith('cr') ? 'hull_cruiser' : 'hull_frigate', modules: [] }) },
    deepSpaceCombatSystem: { _findActiveEncounterContaining: () => ({ id: 'enc_t' }) } };
  if (R._initGfxState) R._gfx = R._initGfxState();
  return { R, calls };
}
const lsKey = 'kosmos_gfx_quality';
guard('T10 ustawienia', () => {
  const flag = GAME_CONFIG.FEATURES.cvPresets;
  try {
    localStorage.removeItem(lsKey);
    GAME_CONFIG.FEATURES.cvPresets = false;
    const off = fakeRenderer();
    assert(off.R.missing.length === 0, `T10a metody renderera wyciągnięte ze źródła${off.R.missing.length ? ' — brak: ' + off.R.missing.join(', ') : ''}`);
    off.R._applyGfx('init');
    assert(off.calls.setPR.length === 0 && off.R._bloomPass.enabled === true && off.R._fxLightPool === null && off.R._gfxApplied?.on === false
      && off.R._gfxApplied.pixelRatio === Math.min(1.25 * 1.5, 2) && off.R._gfxApplied.textures === '2k',
      'T10b flaga OFF przy starcie: bez `setPixelRatio` (dzisiejsza gęstość zostaje), bloom, bez puli świateł, tekstury 2K');
    GAME_CONFIG.FEATURES.cvPresets = true;
    const on = fakeRenderer();
    on.R._applyGfx('init');
    const pool = on.R._fxLightPool;
    assert(on.R._gfx.level === 'high' && on.R._gfx.source === 'detected' && on.calls.setPR.length === 0 && !!pool && pool.count === 4
      && pool.lights.every((L) => L.visible && L.intensity === 0) && on.R._bloomPass.enabled === true,
      'T10c flaga ON na RTX: wykryty High — gęstość bez zmiany (= dzisiejsza), pula zbudowana, 4 światła widoczne z jasnością 0, bloom');
    const m = on.R.applyGfxPreset(1);
    assert(m.ok && on.calls.setPR.join() === '1.25' && on.calls.composerPR.join() === '1.25' && on.R._fxLightPool === pool && pool.count === 2
      && on.R._bloomPass.enabled === true && on.calls.rebuild === 1 && localStorage.getItem(lsKey) === 'medium' && on.calls.wake === 1,
      'T10d Medium: gęstość 1,25 (renderer + composer), 2 światła (ta sama pula), bloom, tekstury 1K — przebudowa statków RAZ, zapis „medium”');
    const l = on.R.applyGfxPreset(0);
    assert(l.ok && on.calls.setPR.join() === '1.25,1' && on.R._bloomPass.enabled === false && pool.count === 0 && on.calls.rebuild === 1
      && on.R._fxLightPool === pool, 'T10e Low: gęstość 1, bloom wyłączony, 0 świateł, tekstury nadal 1K — bez drugiej przebudowy');
    const h = on.R.applyGfxPreset(2);
    assert(h.ok && on.calls.setPR.join() === '1.25,1,1.875' && on.R._bloomPass.enabled === true && pool.count === 4 && on.calls.rebuild === 2,
      'T10f High: gęstość 1,875, bloom, 4 światła, tekstury 2K — przebudowa');
    assert(on.R.applyGfxPreset('ultra').ok === false && on.R._gfx.level === 'high', 'T10g poziom niepoprawny — odmowa, preset bez zmian');
    on.R.applyGfxPreset(0);
    on.R._ensureCueBus();
    on.R._cueBus.schedule(1e9, 'fire', 'laser', null, 0, 0, 0);
    GAME_CONFIG.FEATURES.cvPresets = false;
    on.R._tickGfx();
    assert(on.R._gfxApplied.on === false && on.R._pixelRatio === 1.875 && on.R._bloomPass.enabled === true && pool.count === 0
      && on.R._cueBus.n === 0 && on.calls.rebuild === 4,
      'T10h flaga przełączona w konsoli (OFF): dzisiejsza gęstość i bloom wracają, 0 świateł, szyna sygnałów wyczyszczona, tekstury 2K (przebudowa)');
    GAME_CONFIG.FEATURES.cvPresets = true;
    on.R._tickGfx();
    assert(on.R._gfxApplied.on === true && on.R._gfxApplied.level === 'low' && on.R._pixelRatio === 1 && on.R._bloomPass.enabled === false,
      'T10i flaga z powrotem ON: preset gracza (Low) wraca');
    // Dławienie przez `_tickGfx`: w walce klatki 30 ms → budżety drugorzędne, gęstość / bloom / światła bez zmian.
    on.R.applyGfxPreset(2);
    const setBefore = on.calls.setPR.length;
    on.R._stageFrame = { clusters: 1 };
    for (let i = 0; i < 80; i++) { clock.now += 30; on.R._tickGfx(); }
    assert(on.R._gfx.throttle.level === 1 && on.R._gfx.eff.smoke === false && on.R._gfx.eff.embers === true && on.calls.setPR.length === setBefore
      && on.R._bloomPass.enabled === true && pool.count === 4,
      `T10j dławienie przez pętlę (2,4 s klatek 30 ms w walce): poziom ${on.R._gfx.throttle.level} — dym zdjęty; gęstość, bloom i światła bez zmian`);
    const info = on.R.cvGfxInfo();
    assert(info.level === 'high' && info.throttle.level === 1 && JSON.stringify(info.budgets.throttled) === '["smoke"]' && info.lights === 4,
      'T10k odczyt `gfx()`: poziom, dławienie, zdjęte efekty, światła');
    GAME_CONFIG.FEATURES.cvPresets = false;
    const off2 = fakeRenderer();
    off2.R._applyGfx('init');
    for (let i = 0; i < 80; i++) { clock.now += 30; off2.R._tickGfx(); }
    assert(off2.R._gfx.throttle.samples === 0 && off2.R._fxLightPool === null, 'T10l flaga OFF: pętla nie próbkuje czasu klatki i nie buduje puli');
  } finally { GAME_CONFIG.FEATURES.cvPresets = flag; localStorage.removeItem(lsKey); }
});
guard('T10 salwa', () => {
  const flag = GAME_CONFIG.FEATURES.cvPresets, flagFx = GAME_CONFIG.FEATURES.cvFxEngine;
  // ARC CV-4a — T10 pinuje sygnały na salwie CV-2a (`_cvFxRoundFx`); od CV-4a flaga `cvWeapons` (domyślnie ON) oddaje salwę językowi broni
  // (keeper `cv_weapons_ledger_smoke` C1 pinuje sygnały w chwilach rejestru) — tu jawnie OFF.
  const flagWpn = GAME_CONFIG.FEATURES.cvWeapons;
  GAME_CONFIG.FEATURES.cvWeapons = false;
  const run = (presets, { pausedFrames = 0, galaxy = false } = {}) => {
    GAME_CONFIG.FEATURES.cvPresets = presets;
    GAME_CONFIG.FEATURES.cvFxEngine = true;
    EventBus.clear();
    const { R } = fakeRenderer();
    R._applyGfx('init');
    for (const [id, x] of [['fa', -0.05], ['fb', 0.05], ['cr1', 0.06]]) { const s = new THREE.Object3D(); s.visible = true; s.position.set(x, 0.3, 0); R._vessels.set(id, { sprite: s }); }
    const got = [];
    EventBus.on('combatfx:cue', (c) => got.push(c));
    const audio = AUDIO ? new AUDIO.AudioSystem() : null;
    audio?.attach();
    const pace = FXC.combatFxPace(1000);
    const events = [
      { attacker: 'fa', target: 'fb', category: 'short', hit: true, blockedByShield: 0 },
      { attacker: 'fb', target: 'cr1', category: 'medium', hit: true, blockedByShield: 3 },
      { attacker: 'cr1', target: 'fa', category: 'long', hit: false, blockedByShield: 0 },
    ];
    R._tickCvFx();
    const t0 = R._presClock.nowMs;
    R._cvFxRoundFx(events, pace);
    const shots = R._fxEngine?.stats()?.shots ?? 0;
    window.KOSMOS.timeSystem.isPaused = pausedFrames > 0;
    for (let i = 0; i < pausedFrames; i++) { clock.now += 16; R._tickCvFx(); }
    const duringPause = got.length;
    window.KOSMOS.timeSystem.isPaused = false;
    R._galaxyActive = galaxy;
    for (let i = 0; i < 200; i++) { clock.now += 16; R._tickCvFx(); }
    return { R, got, shots, t0, pace, duringPause, audio };
  };
  try {
    const ON = run(true);
    const fire = ON.got.filter((c) => c.kind === 'fire');
    const hits = ON.got.filter((c) => c.kind !== 'fire');
    const k = (c) => `${c.kind}/${c.weapon}`;
    console.log(`     ON: strzały ${ON.shots}, sygnały ${ON.got.map((c) => `${k(c)}×${c.count}@${Math.round(c.t - ON.t0)}`).join(', ')}`);
    assert(ON.shots === 3 && fire.length === 3 && hits.length === 2
      && JSON.stringify(fire.map((c) => c.weapon).sort()) === '["kinetic","laser","missile"]'
      && hits.some((c) => c.kind === 'impact' && c.weapon === 'laser' && c.vesselId === 'fb')
      && hits.some((c) => c.kind === 'shieldHit' && c.weapon === 'kinetic' && c.vesselId === 'cr1' && c.size === 'large'),
      'T10m salwa ON: 3 strzały w silniku i 3 × fire (laser / kinetyk / rakieta) + impact (bez osłony) + shieldHit (osłona) — pudło bez trafienia');
    const fireT = fire.map((c) => Math.round(c.t - ON.t0)).sort((a, b) => a - b);
    const want = [0, ON.pace.staggerMs, 2 * ON.pace.staggerMs];
    const impactT = Math.round(hits.find((c) => c.kind === 'impact').t - ON.t0);
    assert(fireT.every((t, i) => Math.abs(t - want[i]) <= 16) && Math.abs(impactT - ON.pace.flashDelayMs) <= 16
      && ON.got.every((c) => c.encounterId === 'enc_t' && c.pan >= -1 && c.pan <= 1 && c.dist > 0),
      `T10n czasy prezentacji: fire po rozrzucie salwy (${fireT.join(', ')} ms), impact po opóźnieniu błysku (${impactT} ms); id starcia, panorama, odległość`);
    const st = ON.audio?.cueStats();
    assert(!!st && st.received === ON.got.length && st.cues === ON.got.reduce((s, c) => s + c.count, 0),
      `T10o słuchacz \`AudioSystem\` (po clear + attach) odebrał każdy sygnał (${st?.received} / ${ON.got.length})`);
    const OFF = run(false);
    assert(OFF.shots === 3 && OFF.got.length === 0 && OFF.R._cueBus === null, 'T10p salwa OFF: te same 3 strzały, szyna nie powstała, zero sygnałów');
    const P = run(true, { pausedFrames: 60 });
    // Pauza tuż po salwie: zegar prezentacji stoi na chwili salwy — wychodzi WYŁĄCZNIE strzał z opóźnieniem 0 (jego chwila już
    // nadeszła; efekt jest na ekranie), reszta czeka; po wznowieniu — w swoich chwilach.
    assert(P.duringPause === 1 && P.got[0]?.kind === 'fire' && Math.abs(P.got[0].t - P.t0) < 1e-9 && P.got.length === 5,
      `T10q pauza: przez 60 klatek pauzy tylko strzał z chwili salwy (${P.duringPause}), reszta po wznowieniu (razem ${P.got.length})`);
    const G = run(true, { galaxy: true });
    assert(G.got.length === 0 && (G.R._cueBus?.stats()?.muted ?? 0) === 5, 'T10r tryb galaktyki: sygnały przepadają (5 wyciszonych), nic nie wysłane');
    // Low + pełne dławienie — każdy strzał nadal w silniku (T6 wykonaniem).
    GAME_CONFIG.FEATURES.cvPresets = true;
    EventBus.clear();
    const { R: L } = fakeRenderer();
    L._applyGfx('init'); L.applyGfxPreset(0); L._gfx.throttle.level = 4;
    for (const id of ['fa', 'fb', 'cr1']) { const s = new THREE.Object3D(); s.visible = true; L._vessels.set(id, { sprite: s }); }
    const many = Array.from({ length: 100 }, (_, i) => ({ attacker: ['fa', 'fb', 'cr1'][i % 3], target: ['fb', 'cr1', 'fa'][i % 3], category: ['short', 'medium', 'long'][i % 3], hit: i % 2 === 0, blockedByShield: i % 4 === 0 ? 1 : 0 }));
    L._tickCvFx();
    L._cvFxRoundFx(many, FXC.combatFxPace(1000));
    const es = L._fxEngine?.stats();
    assert(es?.shots === 100 && es.pools.beam.spawned + es.pools.tracer.spawned === 100 && es.pools.beam.steals + es.pools.tracer.steals === 0,
      'T10s Low + pełne dławienie: salwa 100 strzałów — każdy w silniku (wiązka albo smuga), zero kradzieży');
    // Wybuch wraku → „destroyed” (także przy fladze `cvFxEngine` OFF — szyna tyka zegar sama).
    GAME_CONFIG.FEATURES.cvFxEngine = false;
    EventBus.clear();
    const { R: W } = fakeRenderer();
    W._applyGfx('init');
    const gotW = [];
    EventBus.on('combatfx:cue', (c) => gotW.push(c));
    const s = new THREE.Object3D(); s.visible = true; s.position.set(0.1, 0.3, 0.2);
    W._cueDestroyed('cr1', { id: 'cr1', shipId: 'hull_cruiser', lastBattleId: 'battle_ds_1' }, { sprite: s });
    for (let i = 0; i < 3; i++) { clock.now += 16; W._tickCvFx(); }
    assert(gotW.length === 1 && gotW[0].kind === 'destroyed' && gotW[0].size === 'large' && gotW[0].vesselId === 'cr1' && gotW[0].encounterId === 'battle_ds_1'
      && W._fxEngine === null, 'T10t wrak → jeden „destroyed” (rozmiar z klasy kadłuba: krążownik → large), także przy `cvFxEngine` OFF (silnik nie powstaje)');
  } finally { GAME_CONFIG.FEATURES.cvPresets = flag; GAME_CONFIG.FEATURES.cvFxEngine = flagFx; GAME_CONFIG.FEATURES.cvWeapons = flagWpn; EventBus.clear(); }
});

// ── T11 — źródło ────────────────────────────────────────────────────────────────────────────────────────────────────
header('T11 — źródło: wiersz ☰ tylko z flagą, klucze PL + EN, zero Math.random, gorąca ścieżka bez `new`');
await (async () => {
  try {
    const BB = strip(read('src/ui/BottomBar.js'));
    assert(/const gfxLevel = GAME_CONFIG\.FEATURES\?\.cvPresets \?/.test(BB) && /\.\.\.\(gfxLevel \? \[\{ id: 'gfx'/.test(BB)
      && /case 'gfx':[\s\S]{0,200}cycleGfxPreset/.test(BB), 'T11a ☰ „Grafika”: wiersz WYŁĄCZNIE z flagą `cvPresets` (OFF — menu jak dziś), klik → cykl presetu');
    const pl = (await import('../../i18n/pl.js')).default ?? (await import('../../i18n/pl.js'));
    const en = (await import('../../i18n/en.js')).default ?? (await import('../../i18n/en.js'));
    const dict = (m) => m.PL ?? m.EN ?? m.pl ?? m.en ?? m.default ?? m;
    const P = dict(pl), E = dict(en);
    const keys = ['menu.gfx', 'menu.gfxHigh', 'menu.gfxMedium', 'menu.gfxLow'];
    assert(keys.every((k) => typeof P[k] === 'string' && P[k] && typeof E[k] === 'string' && E[k]) && P['menu.gfx'] === 'Grafika' && E['menu.gfx'] === 'Graphics'
      && new Set(keys.slice(1).map((k) => P[k])).size === 3, `T11b klucze PL + EN: ${keys.map((k) => `${P[k]} / ${E[k]}`).join(', ')}`);
    const files = ['src/data/CombatFxPresets.js', 'src/data/CombatCueData.js', 'src/renderer/combat/QualityPreset.js',
      'src/renderer/combat/LightPool.js', 'src/renderer/combat/CombatCueBus.js'];
    const dirty = files.filter((f) => /\bMath\.random\b/.test(strip(read(f))));
    assert(dirty.length === 0, `T11c moduły CV-2b (${files.length}): zero Math.random${dirty.length ? ' — ' + dirty.join(', ') : ''}`);
    const body = (src, name) => { const i = src.indexOf(`\n  ${name}(`); if (i < 0) return null; const a = src.indexOf('{', i); const b = src.indexOf('\n  }\n', a); return src.slice(a, b); };
    const LPS = strip(read('src/renderer/combat/LightPool.js')), CBS = strip(read('src/renderer/combat/CombatCueBus.js'));
    const hot = [['LightPool', LPS, ['setCount', 'flash', 'update', 'activeCount', '_endMs']], ['CombatCueBus', CBS, ['schedule', 'flush', '_remove', 'pending']]];
    const withNew = [];
    for (const [mod, src, names] of hot) for (const n of names) { const b = body(src, n); if (b == null || /\bnew\s+[A-Z]/.test(b)) withNew.push(`${mod}.${n}`); }
    assert(withNew.length === 0, `T11d gorąca ścieżka puli i szyny bez \`new\`${withNew.length ? ' — ' + withNew.join(', ') : ''}`);
    const GC = strip(read('src/config/GameConfig.js'));
    assert(/cvPresets:\s*true/.test(GC), 'T11f `FEATURES.cvPresets` w GameConfig (domyślnie ON; wyłączenie: KOSMOS.debug.cvPresets(0))');
    assert(!!HP && HP.has1kVariant({ source: { normalizer: 'normalize-ship@1' } }) && !HP.has1kVariant({ source: { normalizer: 'legacy-textures@1' } })
      && !HP.has1kVariant(null) && HP.modelPath1k('assets/models/ships/warp_frigate.glb') === 'assets/models/ships/warp_frigate@1k.glb'
      && HP.modelPath1k('assets/models/ships/incoming/warp_frigate.glb') === null,
      'T11g wariant 1K z danych: stempel normalizatora `normalize-ship@` — tak, stare modele (`legacy-textures@`) i brak dokumentu — nie; ścieżka `<slot>@1k.glb`, `incoming/` — bez wariantu');
  } catch (e) { assert(false, `T11 — wyjątek (pin degraduje, nie przerywa): ${e.message}`); }
})();
guard('T11 HUD', () => {
  // Gęstość kanwy HUD nie schodzi poniżej natywnej, gdy preset zbije gęstość renderera (Low 1,0 przy DPR 1,25); dziś (renderer ≥
  // natywnej) — bez zmian; najwyżej 2 (ekran 4K).
  const HUD = globalThis.__hudMod;
  const at = (pr, dpr) => { const save = globalThis.devicePixelRatio; globalThis.devicePixelRatio = dpr; try { return HUD.hudPixelRatio({ threeRenderer: { renderer: { getPixelRatio: () => pr } } }); } finally { globalThis.devicePixelRatio = save; } };
  assert(!!HUD && at(1, 1.25) === 1.25 && at(1.875, 1.25) === 1.875 && at(1.25, 1.25) === 1.25 && at(1, 3) === 2 && at(2, 3) === 2 && at(1.35, 1) === 1.35,
    'T11h kanwa HUD: Low (renderer 1,0 przy DPR 1,25) — 1,25 (natywna, czytelny tekst); High 1,875 i Medium 1,25 bez zmian; ekran DPR 3 — najwyżej 2');
});
guard('T11 kontrola', () => {
  // KONTROLA pinu T11d (zielona także przed CV-2b — kopia syntetyczna): ciało metody z konstrukcją jest wykrywane.
  const synthetic = '\n  update(nowMs) {\n    const now = this.nowMs;\n  }\n';
  const mutated = synthetic.replace('const now = this.nowMs;', 'const now = this.nowMs; const _v = new THREE.Vector3();');
  assert(!/\bnew\s+[A-Z]/.test(synthetic) && /\bnew\s+[A-Z]/.test(mutated), 'T11e KONTROLA: kopia metody z konstrukcją Vector3 — pin T11d ją wykrywa');
});

performance.now = realPerfNow;
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
