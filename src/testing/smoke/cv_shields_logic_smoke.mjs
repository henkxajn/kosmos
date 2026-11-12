// cv_shields_logic_smoke — ARC COMBAT VISUALS krok CV-4b (flaga `cvShields`) + pozycja 0 (Finding 707): LOGIKA osłon i pancerza.
//
// Co pinuje (keepery wyłącznie logiki — F11; bez pinów na stałych rysunku):
//   L1 geometria: bańka obejmuje kadłub (narożniki bbox wewnątrz elipsoidy), punkt na bańce leży na elipsoidzie, punkt poszycia — pod bańką;
//   L2 plan rundy: na bańce, dopóki osłona trzyma (`blocked` > 0); rozpad dokładnie raz na spadek do zera (`shieldAfter` ≤ ε) i tylko wtedy;
//      po rozpadzie — kadłub; kolejność TRAFIEŃ (nie logiczna); statek bez osłony — nigdy bańka; brak pola `shieldAfter` — nigdy rozpad;
//   L3 pokaz trafienia: sloty fal nigdy poza budżetem presetu, najstarszy zastępowany; rozpad raz i tylko przy bańce podniesionej;
//   L4 próbka osłony pokazywanej: regeneracja tylko przy prawdziwym wzroście (trafienia tej klatki odliczone); rozpad w locie — bez fali;
//      powrót bańki dopiero przy SHD_REUP_FRAC;
//   L5 rysunek: wygaszanie po trafieniu, rozpad widoczny w swoim oknie, bańka opadła — niewidoczna;
//   L6 osmalenia: pula ograniczona (najstarsza zastępowana), wyłącznie High, żar stygnie do zera;
//   L7 zgodność stałych (SCORCH_MAX = KC_SCORCH_MAX, tablica fal shadera = SHIELD_RIPPLES_MAX, budżety presetów);
//   L8 Finding 707: lustro kolana odblasku (rosnące, ≤ kolano, 0 = bez zmian), wstawka między główną a światłem czytelności, wszystkie
//      nowe człony za warunkami (pokrętła 0 i brak plam = wyrażenia CV-1a);
//   L9 integracja (prawdziwe metody renderera wyciągnięte ze źródła): OFF — punkt trafienia CV-4a co do bitu; ON — na bańce (tryb 2,
//      elipsoida), po rozpadzie na poszyciu; sygnał `shieldDown` == chwila rozpadu; osmalenie tylko na High;
//   L10 pula baniek: zero konstrukcji THREE po rozgrzewce (200 klatek przydziałów i uniformów), kradzież najdawniej użytej;
//   L11 zero `Math.random` w nowych modułach i bloku CV-4b renderera.
//
// ⚠ Fail-first: moduły CV-4b powstają w tym kroku — import dynamiczny w try/catch, piny DEGRADUJĄ (czerwone), suita się nie przerywa.

import '../headless/env.js';           // MUSI być pierwszy
import { GAME_CONFIG }           from '../../config/GameConfig.js';
import { readFileSync }          from 'node:fs';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const THREE  = await import('../../lib/three.module.js');
const SL     = await tryImport('../../renderer/combat/ShieldLogic.js');
const SB     = await tryImport('../../renderer/combat/ShieldBubbles.js');
const KC     = await tryImport('../../renderer/KeyColourEmission.js');
const PRESETS = await tryImport('../../data/CombatFxPresets.js');
const QP     = await tryImport('../../renderer/combat/QualityPreset.js');
const LEDGER = await tryImport('../../renderer/combat/CombatLedgerLogic.js');
const ENGINE = await tryImport('../../renderer/combat/FxEngine.js');
const CLOCK  = await tryImport('../../renderer/combat/PresentationClock.js');
const CUEBUS = await tryImport('../../renderer/combat/CombatCueBus.js');
const VMR    = await tryImport('../../renderer/VesselModelResolver.js');
const FXC    = await tryImport('../../config/CombatFxConfig.js');
const FX     = await tryImport('../../utils/VesselFxLogic.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const guard = (label, fn) => { try { fn(); } catch (e) { assert(false, `${label} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const T = SL?.SHIELD_TUNING ?? {};
const ell = (ax, p) => (p.x / ax[0]) ** 2 + (p.y / ax[1]) ** 2 + (p.z / ax[2]) ** 2;

// ── L1 — geometria ────────────────────────────────────────────────────────────────────────────────────────────────────
header('L1 — bańka obejmuje kadłub, punkt na bańce leży na elipsoidzie, punkt poszycia pod bańką');
guard('L1', () => {
  const halves = [[0.5, 0.1, 0.08], [0.5, 0.25, 0.15], [0.5, 0.05, 0.4], [0.5, 0.3, 0.25]];   // kadłuby wydłużone (najdłuższy wymiar = 1)
  let cornersIn = true, onSurf = true, hullIn = true, ratioOk = true, dirsUnit = true;
  for (const h of halves) {
    const ax = SL.bubbleAxes(h, T);
    const am = Math.max(...ax);
    if (!(Math.min(...ax) >= (T.SHD_MIN_RATIO ?? 0) * am - 1e-12)) ratioOk = false;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      // narożnik bbox × 0,8 (kadłub to nie prostopadłościan; czubki dziobu i rufy na osi) — wewnątrz bańki
      if (!(ell(ax, { x: sx * h[0] * 0.8, y: sy * h[1] * 0.8, z: sz * h[2] * 0.8 }) < 1)) cornersIn = false;
    }
    for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) if (!(ell(ax, { x: axis[0] * h[0], y: axis[1] * h[1], z: axis[2] * h[2] }) < 1)) cornersIn = false;
    for (let k = 0; k < 64; k++) {
      const u = [Math.cos(k * 1.7) * Math.sin(k * 0.9 + 0.3), Math.sin(k * 1.7) * Math.sin(k * 0.9 + 0.3), Math.cos(k * 0.9 + 0.3)];
      const p = SL.ellipsoidPoint(ax, u[0], u[1], u[2], {});
      if (Math.abs(ell(ax, p) - 1) > 1e-9) onSurf = false;
      if (Math.abs(Math.hypot(p.sx, p.sy, p.sz) - 1) > 1e-9) dirsUnit = false;
      const q = SL.hullPoint(h, u[0], u[1], u[2], T, {});
      if (!(ell(ax, q) < 1)) hullIn = false;
    }
  }
  assert(cornersIn, 'L1a bańka obejmuje kadłub: końce osi bbox i narożniki × 0,8 wewnątrz elipsoidy (4 kształty kadłuba)');
  assert(onSurf && dirsUnit, 'L1b punkt trafienia bańki leży NA elipsoidzie (64 kierunki × 4 kształty), kierunek fali na sferze bańki jednostkowy');
  assert(hullIn, 'L1c punkt trafienia poszycia zawsze POD bańką (po rozpadzie strzały lądują na kadłubie, nie przed nim)');
  assert(ratioOk, 'L1d najkrótsza półoś ≥ SHD_MIN_RATIO × najdłuższa — bańka, nie płaska tarcza');
});

// ── L2 — plan rundy ─────────────────────────────────────────────────────────────────────────────────────────────────────
header('L2 — plan rundy: bańka dopóki osłona trzyma, rozpad raz na spadek do zera, potem kadłub; kolejność trafień; bez osłony — bez bańki');
const E = (o) => ({ hit: true, target: 'v', blocked: 0, dmg: 0, shieldAfter: 0, impactAt: 0, index: 0, ...o });
guard('L2', () => {
  const st = new SL.ShieldStates({ tuning: T });
  const info = () => ({ presented: 35, max: 35 });
  const r1 = [E({ index: 0, impactAt: 100, blocked: 15, shieldAfter: 20 }), E({ index: 1, impactAt: 300, blocked: 15, shieldAfter: 5 })];
  st.planRound(r1, info);
  const r2 = [E({ index: 0, impactAt: 1100, blocked: 5, dmg: 7, shieldAfter: 0 }), E({ index: 1, impactAt: 1300, blocked: 0, dmg: 12, shieldAfter: 0 })];
  st.planRound(r2, () => ({ presented: 5, max: 35 }));
  const r3 = [E({ index: 0, impactAt: 2100, blocked: 0.9, dmg: 11, shieldAfter: 0 })];   // reszta regeneracji zjadana przez trafienie
  st.planRound(r3, () => ({ presented: 0.9, max: 35 }));
  assert(r1.every((x) => x.shd.onBubble && !x.shd.collapse && !x.shd.hull), 'L2a osłona trzyma (`blocked` > 0, `shieldAfter` > 0) — oba trafienia NA bańce, bez rozpadu i bez kadłuba');
  assert(r2[0].shd.onBubble && r2[0].shd.collapse && r2[0].shd.hull, 'L2b trafienie zbijające osłonę do zera — na bańce, ROZPAD, nadmiar (`dmg` > 0) na kadłub');
  assert(!r2[1].shd.onBubble && !r2[1].shd.collapse && r2[1].shd.hull && !r3[0].shd.onBubble && !r3[0].shd.collapse,
    'L2c po rozpadzie: trafienia na kadłubie (także reszta regeneracji 0,9 z `blocked` > 0) — bez drugiego rozpadu');
  assert(st.stats.collapsesPlanned === 1, `L2d dokładnie JEDEN rozpad w planie na spadek do zera (${st.stats.collapsesPlanned})`);
  // kolejność TRAFIEŃ: wpis logicznie wcześniejszy ląduje później (rakieta) — rozpad przy pierwszym trafieniu z `shieldAfter` 0
  const st2 = new SL.ShieldStates({ tuning: T });
  const r4 = [E({ index: 0, impactAt: 900, blocked: 10, shieldAfter: 10 }), E({ index: 1, impactAt: 200, blocked: 10, shieldAfter: 0 })];
  st2.planRound(r4, () => ({ presented: 20, max: 20 }));
  assert(r4[1].shd.collapse && r4[1].shd.onBubble && !r4[0].shd.onBubble && r4[0].shd.hull,
    'L2e plan w kolejności TRAFIEŃ: rozpad przy wcześniejszym trafieniu (200 ms), późniejsze (900 ms) już na kadłubie');
  const st3 = new SL.ShieldStates({ tuning: T });
  const r5 = [E({ blocked: 10, shieldAfter: 0, impactAt: 50 }), E({ blocked: 3, shieldAfter: 1, impactAt: 60, index: 1 })];
  st3.planRound(r5, () => ({ presented: 0, max: 0 }));
  assert(r5.every((x) => !x.shd.onBubble && !x.shd.collapse && x.shd.hull) && st3.visual('v', 0) === null,
    'L2f statek BEZ osłony (maks. 0) — nigdy bańka ani rozpad; rysunek bańki — brak');
  const st4 = new SL.ShieldStates({ tuning: T });
  const r6 = [E({ blocked: 10, shieldAfter: Infinity, impactAt: 10 })];
  st4.planRound(r6, () => ({ presented: 10, max: 35 }));
  assert(r6[0].shd.onBubble && !r6[0].shd.collapse, 'L2g brak pola `shieldAfter` (renderer podstawia Infinity) — nigdy rozpad');
  const miss = { hit: false, target: 'v' };
  st4.planRound([miss], info);
  assert(miss.shd === null, 'L2h pudło — `shd` null');
});

// ── L3 — pokaz trafienia ────────────────────────────────────────────────────────────────────────────────────────────────
header('L3 — sloty fal z budżetu presetu (najstarszy zastępowany); rozpad raz i tylko przy bańce podniesionej');
guard('L3', () => {
  for (const budget of [8, 4, 1]) {
    const st = new SL.ShieldStates({ tuning: T });
    const xs = Array.from({ length: 12 }, (_, i) => E({ index: i, impactAt: i * 10, blocked: 1, shieldAfter: 30 }));
    st.planRound(xs, () => ({ presented: 35, max: 35 }));
    const slots = xs.map((x, i) => st.impact(x, { sx: 0, sy: 1, sz: 0 }, i * 10, { ripples: budget }).ripple);
    const used = new Set(slots);
    const s = st.ships.get('v');
    // ostatni przydział (12. trafienie) — slot z najstarszą falą: przy budżecie b po 11 trafieniach najstarsza siedzi w slocie (11 % b)
    const oldestOk = slots[11] === 11 % budget;
    assert(Math.max(...slots) < budget && used.size === Math.min(budget, 12) && oldestOk && s.ripples.slice(budget).every((r) => !Number.isFinite(r.t0)),
      `L3a budżet ${budget}: sloty ${[...used].sort((a, b) => a - b).join(',')} — nigdy poza budżetem, najstarszy zastępowany (12. trafienie → slot ${slots[11]}), sloty ponad budżet nietknięte`);
  }
  const st = new SL.ShieldStates({ tuning: T });
  const a = E({ index: 0, impactAt: 0, blocked: 20, shieldAfter: 0 });
  const b = E({ index: 1, impactAt: 10, blocked: 0, dmg: 9, shieldAfter: 0 });
  st.planRound([a, b], () => ({ presented: 20, max: 20 }));
  const ra = st.impact(a, null, 0, { ripples: 8 });
  const ra2 = st.impact(a, null, 5, { ripples: 8 });   // ten sam wpis drugi raz (nie powinien się zdarzyć — rejestr pokazuje raz) — bańka już opadła
  const rb = st.impact(b, null, 10, { ripples: 8 });
  assert(ra.collapse === true && ra2.collapse === false && rb.collapse === false && st.stats.collapses === 1,
    'L3b rozpad pokazany RAZ: wpis rozbijający przy bańce podniesionej — rozpad; ponowny / kolejny przy bańce opadłej — nic');
});

// ── L4 — próbka osłony pokazywanej ───────────────────────────────────────────────────────────────────────────────────
header('L4 — regeneracja tylko przy prawdziwym wzroście; rozpad w locie — bez fali; powrót bańki przy SHD_REUP_FRAC');
guard('L4', () => {
  const st = new SL.ShieldStates({ tuning: T });
  const n0 = st.sample('v', { presented: 20, max: 35, now: 0 });
  const nSame = st.sample('v', { presented: 20, max: 35, now: 16 });
  const nTiny = st.sample('v', { presented: 20 + 1e-9, max: 35, now: 32 });
  const nUp = st.sample('v', { presented: 20.9, max: 35, now: 48 });
  const nDrop = st.sample('v', { presented: 6, max: 35, landed: 14.9, now: 64 });     // trafienie 14,9 wylądowało — spadek, nie regeneracja
  const nMix = st.sample('v', { presented: 6.3 - 5, max: 35, landed: 5, now: 80 });  // w tej samej klatce: regeneracja 0,3 i trafienie 5
  assert(n0 === null && nSame === null && nTiny === null, 'L4a pierwsza próbka, brak zmiany i szum zmiennoprzecinkowy — bez regeneracji');
  assert(nUp?.shimmer === true && Math.abs(nUp.regen - 0.9) < 1e-6, 'L4b wzrost 0,9 (nadejście rundy) — regeneracja z falą');
  assert(nDrop === null && nMix?.shimmer === true && Math.abs(nMix.regen - 0.3) < 1e-9,
    'L4c trafienia tej klatki odliczone: sam spadek — nic; regeneracja 0,3 + trafienie 5 w jednej klatce — regeneracja 0,3');
  // rozpad w locie: plan opuścił bańkę, pokaz jeszcze nie — wzrost bez fali
  const st2 = new SL.ShieldStates({ tuning: T });
  const x = E({ blocked: 20, shieldAfter: 0, impactAt: 500 });
  st2.sample('v', { presented: 20, max: 20, now: 0 });
  st2.planRound([x], () => ({ presented: 20, max: 20 }));
  const nPend = st2.sample('v', { presented: 20.3, max: 20, now: 16 });
  assert(nPend && nPend.shimmer === false, 'L4d rozpad zaplanowany, trafienie w locie — regeneracja tej rundy BEZ fali (osłona za chwilę pęka)');
  st2.impact(x, null, 500, { ripples: 8 });
  const reupAt = (T.SHD_REUP_FRAC ?? 0.25) * 20;
  st2.sample('v', { presented: 0.3, max: 20, now: 520 });
  const below = st2.sample('v', { presented: reupAt - 0.01, max: 20, now: 540 });
  const upBelow = st2.ships.get('v').dispUp;
  const at = st2.sample('v', { presented: reupAt + 0.2, max: 20, now: 560 });
  assert(below?.reform === false && below?.shimmer === false && upBelow === false, 'L4e po rozpadzie: osłona odrasta poniżej progu — bańka opadła, bez fali');
  assert(at?.reform === true && st2.ships.get('v').dispUp === true && st2.ships.get('v').planUp === true, 'L4f osłona ≥ SHD_REUP_FRAC × maks. — powrót bańki (plan i pokaz razem)');
});

// ── L5 — rysunek ──────────────────────────────────────────────────────────────────────────────────────────────────────
header('L5 — wygaszanie po trafieniu, rozpad w swoim oknie, bańka opadła niewidoczna');
guard('L5', () => {
  const st = new SL.ShieldStates({ tuning: T });
  const a = E({ blocked: 5, shieldAfter: 25, impactAt: 0 });
  st.planRound([a], () => ({ presented: 30, max: 30 }));
  st.sample('v', { presented: 25, max: 30, now: 0 });
  st.impact(a, { sx: 1, sy: 0, sz: 0 }, 0, { ripples: 8 });
  const v0 = st.visual('v', 1), vMid = st.visual('v', (T.SHD_FADE_MS ?? 650) / 2), vEnd = st.visual('v', Math.max(T.SHD_FADE_MS ?? 650, T.SHD_RIPPLE_MS ?? 720) + 1);
  assert(v0.visible && v0.fade > 0.95 && vMid.fade < v0.fade && vMid.fade > 0 && !vEnd.visible && vEnd.fade === 0,
    `L5a po trafieniu widoczna (wygaszanie ${v0.fade.toFixed(2)} → ${vMid.fade.toFixed(2)} → 0), po fali i wygaszeniu — niewidoczna`);
  const b = E({ blocked: 25, shieldAfter: 0, impactAt: 2000, index: 1 });
  st.planRound([b], () => ({ presented: 25, max: 30 }));
  st.impact(b, null, 2000, { ripples: 8 });
  const c1 = st.visual('v', 2001), c2 = st.visual('v', 2000 + (T.SHD_COLLAPSE_MS ?? 900) + 1);
  assert(c1.visible && c1.collapseAge >= 0 && !c2.visible && c2.collapseAge === -1, 'L5b rozpad widoczny w swoim oknie (SHD_COLLAPSE_MS), potem bańka opadła — niewidoczna');
});

// ── L6 — osmalenia ──────────────────────────────────────────────────────────────────────────────────────────────────────
header('L6 — pula osmaleń ograniczona (najstarsza zastępowana), wyłącznie High, żar stygnie');
guard('L6', () => {
  const list = [];
  const idx = [];
  for (let i = 0; i < 15; i++) idx.push(SL.allocScorch(list, SL.SCORCH_MAX, i * 100));
  const oldestFirst = idx.slice(SL.SCORCH_MAX, SL.SCORCH_MAX + SL.SCORCH_MAX).join() === Array.from({ length: SL.SCORCH_MAX }, (_, i) => i).join();
  assert(list.length === SL.SCORCH_MAX && Math.max(...idx) < SL.SCORCH_MAX && oldestFirst,
    `L6a 15 trafień w kadłub: ${list.length} plam (pula ${SL.SCORCH_MAX}), kolejne zastępują NAJSTARSZĄ (${idx.join(',')})`);
  const lv = (level) => QP?.resolveGfxSettings?.(level, { dpr: 1.25 }) ?? null;
  assert(SL.scorchEnabled(lv('high')) === true && SL.scorchEnabled(lv('medium')) === false && SL.scorchEnabled(lv('low')) === false && SL.scorchEnabled(null) === true,
    'L6b osmalenia: High — tak, Medium / Low — nie, presety wyłączone (rysunek High) — tak');
  const h = [0, 200, 900, 1799, 1800, 5000].map((t) => SL.scorchHeat(t, T));
  assert(h[0] === 1 && h.every((v, i) => i === 0 || v <= h[i - 1]) && h[4] === 0 && h[5] === 0, `L6c żar plamy maleje do zera w SCORCH_COOL_MS (${h.map((v) => v.toFixed(2)).join(' → ')})`);
});

// ── L7 — zgodność stałych ─────────────────────────────────────────────────────────────────────────────────────────────
header('L7 — zgodność stałych: plamy shadera, tablica fal, budżety presetów');
guard('L7', () => {
  assert(SL.SCORCH_MAX === KC?.KC_SCORCH_MAX, `L7a pula osmaleń logiki = tablica plam wstawki koloru-klucza (${SL.SCORCH_MAX} / ${KC?.KC_SCORCH_MAX})`);
  const fr = SB?.BUBBLE_FRAG ?? '';
  const m = fr.match(/uniform vec4 uRip\[(\d+)\]/);
  assert(!!m && Number(m[1]) === SL.SHIELD_RIPPLES_MAX && fr.includes(`uniform float uRipAmp[${SL.SHIELD_RIPPLES_MAX}]`), `L7b tablica fal shadera bańki = SHIELD_RIPPLES_MAX (${m?.[1]})`);
  const P = PRESETS?.GFX_PRESETS;
  assert(!!P && P.high.shieldRipples === 8 && P.medium.shieldRipples === 4 && P.low.shieldRipples === 1 && Math.max(P.high.shieldRipples, P.medium.shieldRipples, P.low.shieldRipples) <= SL.SHIELD_RIPPLES_MAX
    && P.high.scorch === true && P.medium.scorch === false && P.low.scorch === false,
    'L7c presety: fale na bańkę 8 / 4 / 1 (≤ tablica shadera), osmalenia tylko High (§2.10)');
});

// ── L8 — Finding 707 ──────────────────────────────────────────────────────────────────────────────────────────────────
header('L8 — Finding 707: kolano odblasku (lustro), miejsce wstawki, nowe człony za warunkami');
guard('L8', () => {
  const k = KC.kcSpecKnee;
  const xs = [0, 0.01, 0.1, 0.5, 1, 3, 10, 449];
  const ys = xs.map((x) => k(x, 0.7));
  assert(ys.every((y, i) => i === 0 || y >= ys[i - 1]) && ys.every((y) => y <= 0.7 + 1e-12) && Math.abs(k(0.01, 0.7) - 0.01) < 1e-4 && xs.every((x) => k(x, 0) === x),
    `L8a kolano: rosnące, nigdy ponad 0,7 (449 → ${ys[7].toFixed(4)}), przy małych L ≈ L, kolano 0 — bez zmian`);
  const frag = THREE.ShaderLib.standard.fragmentShader;
  const out = KC.injectKeyColour(frag);
  const iMain = out.indexOf('kcFill = vec3(0.0);'), iSpec = out.indexOf('float kcSL'), iAo = out.indexOf('#include <aomap_fragment>'), iLift = out.indexOf('float kcLum');
  assert(iMain > 0 && iSpec > iMain && iSpec < iAo && iAo < iLift && out.indexOf('#include <lights_fragment_end>') < iSpec,
    'L8b kolano odblasku PO oświetleniu (`lights_fragment_end`), przed `aomap_fragment` i sumą; po głównej wstawce, przed światłem czytelności');
  const G = KC.KC_MAIN_GLSL;
  assert(/roughnessFactor = max\(roughnessFactor, uKcRoughMin\);/.test(G) && /if \(uKcSpecCap > 0\.0 && kcSL > 1e-6\)/.test(KC.KC_SPEC_GLSL)
    && /if \(uKcScorchN > 0\.5\)/.test(G) && KC.KC_SHARED.uKcRoughMin.value === 0 && KC.KC_SHARED.uKcSpecCap.value === 0,
    'L8c człony za warunkami: podłoga `max(·, uKcRoughMin)` (0 — szorstkość z mapy), kolano przy `uKcSpecCap > 0`, plamy przy `uKcScorchN > 0,5`; wartości startowe 0');
  const T5 = ENGINE?.LIVE_CV_FX ?? {};
  assert(T5.MODEL_ROUGH_MIN > 0 && T5.MODEL_SPEC_CAP > 0 && T5.MODEL_SPEC_CAP < 1, `L8d pokrętła na żywo w cvTuning: MODEL_ROUGH_MIN ${T5.MODEL_ROUGH_MIN}, MODEL_SPEC_CAP ${T5.MODEL_SPEC_CAP} (< próg bloomu 1,0)`);
  const m = new THREE.MeshStandardMaterial();
  KC.applyKeyColour(m, { mode: 'mask', hue: 182, hueTol: 12, satMin: 0.45, valMin: 0.55, soft: 0.06, gain: 3.5 });
  KC.setKeyColourScorch(m, 2, 1, 2, 3, 0.1, 0.5);
  KC.setKeyColourScorchCount(m, 99);
  const u = KC.keyColourUniformsOf(m);
  assert(u.uKcScorch.value.length === 4 * KC.KC_SCORCH_MAX && u.uKcScorch.value[8] === 1 && u.uKcScorch.value[11] === Math.fround(0.1) && u.uKcScorchHeat.value[2] === 0.5
    && u.uKcScorchN.value === KC.KC_SCORCH_MAX && u.uKcRoughMin === KC.KC_SHARED.uKcRoughMin,
    'L8e plamy: płaska tablica na materiał (slot 2 = środek i promień, żar), liczba przycięta do KC_SCORCH_MAX; podłoga — uniform wspólny');
});

// ── L9 — integracja z rendererem ──────────────────────────────────────────────────────────────────────────────────────
header('L9 — prawdziwe metody renderera: OFF = punkt CV-4a, ON = bańka / poszycie, `shieldDown` w chwili rozpadu, osmalenie tylko High');
const TR = read('src/renderer/ThreeRenderer.js');
function methodOf(name) {
  const i = TR.indexOf(`\n  ${name}(`);
  if (i < 0) return null;
  const sigEnd = TR.indexOf(') {\n', i);
  const params = TR.slice(TR.indexOf('(', i) + 1, sigEnd);
  const end = TR.indexOf('\n  }\n', sigEnd);
  return { params, body: TR.slice(sigEnd + 4, end) };
}
const NAMES = ['THREE', 'GAME_CONFIG', 'window', 'VESSEL_TARGET_SIZE', 'vesselTargetSize', 'vesselSizeClass', 'fxWeaponColor', 'FX_SHIELD_COLOR',
  'cueWeaponOfCategory', 'cueSizeOfClass', 'ledgerRng', 'ledgerHash', 'pickTurret', 'isEngagementInView', 'ShieldStates', 'bubbleAxes', 'ellipsoidPoint',
  'hullPoint', 'scorchEnabled', 'allocScorch', 'scorchHeat', 'SHIELD_RIPPLES_MAX', 'SCORCH_MAX', 'KC_SCORCH_MAX', 'setKeyColourScorch',
  'setKeyColourScorchHeat', 'setKeyColourScorchCount', 'ShieldBubblePool', 'logDepthOn'];
const VALUES = () => [THREE, GAME_CONFIG, globalThis.window, VMR?.VESSEL_TARGET_SIZE, VMR?.vesselTargetSize, VMR?.vesselSizeClass, FXC?.weaponColor, FXC?.FX_SHIELD_COLOR,
  CUEBUS?.cueWeaponOfCategory, CUEBUS?.cueSizeOfClass, LEDGER?.ledgerRng, LEDGER?.ledgerHash, LEDGER?.pickTurret, FX?.isEngagementInView, SL?.ShieldStates, SL?.bubbleAxes,
  SL?.ellipsoidPoint, SL?.hullPoint, SL?.scorchEnabled, SL?.allocScorch, SL?.scorchHeat, SL?.SHIELD_RIPPLES_MAX, SL?.SCORCH_MAX, KC?.KC_SCORCH_MAX, KC?.setKeyColourScorch,
  KC?.setKeyColourScorchHeat, KC?.setKeyColourScorchCount, SB?.ShieldBubblePool, () => true];
const METHODS = ['_cvWpnSpawn', '_cvWpnImpact', '_cvWpnResolveLocal', '_cvWpnMuzzle', '_cvShdOn', '_cvShdState', '_cvShdRipples', '_cvShdDir', '_cvShdEndPoint',
  '_cvShdImpacts', '_cvShdScorch', '_cvShdApplyScorch', '_combatEndpointWorld'];
function fakeR(level = 'high') {
  const R = { _vessels: new Map(), cvTuning: ENGINE?.LIVE_CV_FX ?? {}, _cvWpnTurretTurn: new Map(), missing: [],
    _cvWpnStats: { rounds: 0, shots: 0, hidden: 0, killsShown: 0, wreckDeduped: 0, wreckDeferred: 0, wreckUnknown: 0 },
    _presClock: CLOCK ? new CLOCK.PresentationClock() : { nowMs: 0 }, _gfx: { eff: QP?.resolveGfxSettings?.(level, { dpr: 1.25 }) ?? null } };
  for (const n of METHODS) {
    const m = methodOf(n);
    if (!m) { R.missing.push(n); continue; }
    R[n] = new Function(...NAMES, `return function (${m.params}) {\n${m.body}\n};`)(...VALUES());
  }
  R._combatEndpointWorld = (id) => { const e = R._vessels.get(id); return e ? { x: e.sprite.position.x, y: e.sprite.position.y, z: e.sprite.position.z } : null; };
  return R;
}
function addShip(R, id, x, z) {
  const wrapper = new THREE.Object3D();
  wrapper.position.set(x, 0.3, z);
  wrapper.visible = true;
  wrapper.updateMatrixWorld(true);
  const canon = new THREE.Object3D();
  canon.scale.setScalar(0.028);
  const mat = new THREE.MeshStandardMaterial();
  KC?.applyKeyColour?.(mat, { mode: 'mask', hue: 182, hueTol: 12, satMin: 0.45, valMin: 0.55, soft: 0.06, gain: 3.5 });
  const rig = { canon, materials: [mat], weapons: [], frameBow: [0, 0, 1], half: [0.12, 0.1, 0.5],
    scorchXf: [{ mat, inv: new THREE.Matrix4().elements.slice(), s2m: 1 }] };
  R._vessels.set(id, { sprite: wrapper, canonical: true, rig });
}
const flagsOn = { cvShields: GAME_CONFIG.FEATURES.cvShields, cvWeapons: GAME_CONFIG.FEATURES.cvWeapons, cvFxEngine: GAME_CONFIG.FEATURES.cvFxEngine, fcCombatFx: GAME_CONFIG.FEATURES.fcCombatFx, cvPresets: GAME_CONFIG.FEATURES.cvPresets };
const setFlags = (o) => Object.assign(GAME_CONFIG.FEATURES, o);
function fakeEng() {
  const log = [];
  return { log, spawnBeam: (p) => log.push(['beam', p]), spawnBolt: (p) => log.push(['bolt', p]), spawnMote: (p) => log.push(['mote', p]) };
}
function fakeCues() { const log = []; return { log, schedule: (...a) => log.push(a) }; }
guard('L9', () => {
  setFlags({ cvWeapons: true, cvFxEngine: true, fcCombatFx: true, cvPresets: true });
  window.KOSMOS = { vesselManager: { getVessel: (id) => ({ id, name: id, shipId: 'hull_cruiser', modules: [] }) }, timeSystem: { combatRoundMs: () => 1000 } };
  const mkX = (o) => ({ encounterId: 'enc', round: 1, index: 0, attacker: 'a', target: 't', kind: 'kinetic', category: 'medium', hit: true, dmg: 0, blocked: 12,
    killed: false, chargeAt: null, fireAt: 100, impactAt: 300, flight: 200, beamEnd: null, seed: 7, u1: 0.3, u2: 0.6, u3: 0.1, shieldAfter: 8, ...o });
  // OFF — punkt trafienia CV-4a: środek celu + (−0,35 × rozmiar) wzdłuż kierunku strzału, tryb 1
  setFlags({ cvShields: false });
  const R0 = fakeR(); addShip(R0, 'a', -0.2, 0); addShip(R0, 't', 0.2, 0);
  const e0 = fakeEng();
  const x0 = mkX({});
  R0._cvWpnSpawn(e0, x0, { aPos: null, tPos: null }, { R: 1000 }, null, null);
  const bolt0 = e0.log.find((l) => l[0] === 'bolt')?.[1];
  const tS = VMR.vesselTargetSize({ shipId: 'hull_cruiser', modules: [] });
  const tw = R0._vessels.get('t').sprite.position;
  const d0 = bolt0 ? [tw.x - bolt0.ax, tw.y - bolt0.ay, tw.z - bolt0.az] : [1, 0, 0];
  const dl0 = Math.hypot(...d0);
  const ex = d0.map((v) => -0.35 * tS * v / dl0);
  const ok0 = !!bolt0 && bolt0.bMode === 1 && Math.abs(bolt0.box - ex[0]) < 1e-12 && Math.abs(bolt0.boy - ex[1]) < 1e-12 && Math.abs(bolt0.boz - ex[2]) < 1e-12
    && Math.abs(bolt0.bx - (tw.x + ex[0])) < 1e-12 && Math.abs(bolt0.by - (tw.y + ex[1])) < 1e-12;
  const cyan0 = e0.log.filter((l) => l[0] === 'mote' && l[1].color === FXC.FX_SHIELD_COLOR).length;
  assert(ok0 && cyan0 > 0 && R0.missing.length === 0, `L9a cvShields OFF: koniec pocisku = punkt CV-4a co do bitu (tryb 1, −0,35 × rozmiar), trafienie w osłonę — cyjanowe iskry CV-4a (${cyan0}); brak metod ${JSON.stringify(R0.missing)}`);
  // ON — plan: dwa trafienia na bańce, trzecie rozbija, czwarte w kadłub
  setFlags({ cvShields: true });
  const R1 = fakeR('high'); addShip(R1, 'a', -0.2, 0); addShip(R1, 't', 0.2, 0);
  const st = R1._cvShdState();
  const xs = [mkX({ index: 0, impactAt: 300, blocked: 12, shieldAfter: 18 }), mkX({ index: 1, impactAt: 500, blocked: 12, shieldAfter: 6 }),
    mkX({ index: 2, impactAt: 700, blocked: 6, dmg: 9, shieldAfter: 0 }), mkX({ index: 3, impactAt: 900, blocked: 0, dmg: 14, shieldAfter: 0 })];
  st.states.planRound(xs, () => ({ presented: 30, max: 30 }));
  const e1 = fakeEng(), cues = fakeCues();
  for (const x of xs) R1._cvWpnSpawn(e1, x, { aPos: null, tPos: null }, { R: 1000 }, cues, { killAt: () => null });
  const bolts = e1.log.filter((l) => l[0] === 'bolt').map((l) => l[1]);
  const ax = SL.bubbleAxes([0.12, 0.1, 0.5], R1.cvTuning);
  const onB = bolts.slice(0, 3).every((b) => b.bMode === 2 && Math.abs(ell(ax, { x: b.box, y: b.boy, z: b.boz }) - 1) < 1e-9);
  const onH = bolts[3]?.bMode === 2 && ell(ax, { x: bolts[3].box, y: bolts[3].boy, z: bolts[3].boz }) < 1;
  assert(onB && onH, 'L9b cvShields ON: dopóki osłona trzyma — koniec pocisku NA bańce (tryb 2, elipsoida); po rozpadzie — na poszyciu, pod bańką');
  const cyan1 = e1.log.filter((l) => l[0] === 'mote' && l[1].color === FXC.FX_SHIELD_COLOR).length;
  const hullAfterCollapse = e1.log.filter((l) => l[0] === 'mote' && l[1].t0 > 700 && l[1].t0 < 800).length;
  assert(cyan1 === 0 && hullAfterCollapse > 0, `L9c trafienia w bańkę bez łaty cyjanowej (${cyan1}); nadmiar rozpadu — iskry na poszyciu chwilę po rozpadzie (${hullAfterCollapse})`);
  const down = cues.log.filter((c) => c[1] === 'shieldDown');
  assert(down.length === 1 && down[0][0] === 700 && down[0][8] === 't', `L9d sygnał \`shieldDown\` JEDEN, w chwili trafienia rozbijającego (${down.map((c) => c[0]).join(',')} ms)`);
  // pokaz: trafienia w ich chwili — rozpad dokładnie przy wpisie z sygnałem
  R1._cvShdImpacts([xs[0], xs[1]]);
  const c0 = st.stats.collapses;
  R1._cvShdImpacts([xs[2]]);
  const c1 = st.stats.collapses;
  R1._cvShdImpacts([xs[3]]);
  assert(c0 === 0 && c1 === 1 && st.stats.collapses === 1 && st.stats.ripples === 3, `L9e pokaz: fale 3, rozpad dokładnie przy wpisie sygnału (${c0} → ${c1}), kolejne trafienie bez rozpadu`);
  const sc = st.scorch.get('t')?.length ?? 0;
  const u = KC.keyColourUniformsOf(R1._vessels.get('t').rig.materials[0]);
  assert(sc === 2 && u.uKcScorchN.value === 2, `L9f High: osmalenia na poszyciu (nadmiar rozpadu + trafienie w kadłub) — ${sc}, materiał: ${u.uKcScorchN.value} plam`);
  const R2 = fakeR('medium'); addShip(R2, 'a', -0.2, 0); addShip(R2, 't', 0.2, 0);
  const st2 = R2._cvShdState();
  const x2 = mkX({ blocked: 0, dmg: 20, shieldAfter: 0, impactAt: 400 });
  st2.states.planRound([x2], () => ({ presented: 0, max: 0 }));
  R2._cvWpnSpawn(fakeEng(), x2, { aPos: null, tPos: null }, { R: 1000 }, null, null);
  R2._cvShdImpacts([x2]);
  assert((st2.scorch.get('t')?.length ?? 0) === 0 && KC.keyColourUniformsOf(R2._vessels.get('t').rig.materials[0]).uKcScorchN.value === 0,
    'L9g Medium: trafienie w kadłub statku bez osłony — bez osmaleń (wyłącznie High)');
  setFlags(flagsOn);
});

// ── L10 — pula baniek ──────────────────────────────────────────────────────────────────────────────────────────────────
header('L10 — pula baniek: zero konstrukcji THREE po rozgrzewce, kradzież najdawniej użytej');
guard('L10', () => {
  const parent = new THREE.Group();
  const pool = new SB.ShieldBubblePool({ THREE, parent, logDepth: true, capacity: 4 });
  const counters = { obj: 0, mat: 0, geo: 0, tex: 0 };
  const wrap = (proto, key, name) => { const orig = proto[key]; return orig; };
  const O = THREE.Object3D, M = THREE.Material, G = THREE.BufferGeometry;
  const origObj = THREE.Object3D.prototype.updateMatrix;
  let ctor = 0;
  const idObj = O.prototype, idMat = M.prototype, idGeo = G.prototype;
  // licznik konstrukcji: identyfikatory THREE rosną z każdą konstrukcją — porównanie przed / po
  const probe = () => [new O().id, new M().id, new G().id];
  const before = probe();
  for (let f = 0; f < 200; f++) {
    const id = 'v' + (f % 6);
    const s = pool.acquire(id, f);
    s.u.uFade.value = (f % 10) / 10;
    s.u.uRip.value[3] = f;
    s.mesh.position.set(f, 0, 0);
    s.mesh.visible = true;
    if (f % 3 === 0) pool.release('v' + ((f + 2) % 6));
  }
  const after = probe();
  const grown = after.map((v, i) => v - before[i] - 1);
  const st = pool.stats();
  assert(grown.every((g) => g === 0), `L10a 200 klatek przydziałów / zwolnień / uniformów: przyrost identyfikatorów Object3D / Material / BufferGeometry ${grown.join(' / ')}`);
  assert(st.capacity === 4 && st.owned <= 4 && st.steals > 0 && st.peak === 4, `L10b pełna pula (4) — slot najdawniej użyty kradziony (kradzieże ${st.steals}), nigdy ponad pojemność`);
  const vs = SB.BUBBLE_VERT, fsrc = SB.BUBBLE_FRAG;
  assert(/gl_Position = projectionMatrix \* mv;\n\}\n$/.test(vs) && !/USE_LOGDEPTHBUF/.test(vs) && pool.slots[0].mesh.material.vertexShader.includes('USE_LOGDEPTHBUF')
    && pool.slots[0].mesh.material.fragmentShader.includes('USE_LOGDEPTHBUF'), 'L10c shader bańki: ostatnie przypisanie `gl_Position` na końcu (kotwica chunków), materiał z logarytmiczną głębią');
  const progs = new Set(pool.slots.map((s) => s.mesh.material.fragmentShader + '|' + s.mesh.material.vertexShader));
  assert(progs.size === 1 && pool.slots.every((s) => s.u.uCore === pool.shared.uCore), 'L10d jeden tekst shadera na wszystkie sloty (jeden program), pokrętła wspólne — te same obiekty uniformów');
  void fsrc; void counters; void wrap; void origObj; void ctor; void idObj; void idMat; void idGeo;
});

// ── L11 — zero Math.random ─────────────────────────────────────────────────────────────────────────────────────────────
header('L11 — zero `Math.random` w modułach CV-4b i bloku osłon renderera');
guard('L11', () => {
  const files = ['src/renderer/combat/ShieldLogic.js', 'src/renderer/combat/ShieldBubbles.js', 'src/renderer/KeyColourEmission.js'];
  const hits = files.filter((f) => /Math\.random/.test(strip(read(f))));
  const i0 = TR.indexOf('  // ── ARC CV-4b — OSŁONY I PANCERZ'), i1 = TR.indexOf('  // ── ARC CV-5 — WYBUCHY, STANY USZKODZEŃ');
  const block = i0 > 0 && i1 > i0 ? strip(TR.slice(i0, i1)) : null;
  assert(hits.length === 0 && !!block && !/Math\.random/.test(block) && block.length > 2000,
    `L11a moduły (${files.length}) i blok CV-4b renderera (${block?.length ?? 0} zn.) bez \`Math.random\` (reguła CV-0b)`);
});

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
