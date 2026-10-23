// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — ARKUSZ HUD H1-1: warstwa HUD 2D (`#hud-canvas`, `HudLayer`, `HudProjection`) — HUD_PLAN.md §4.2; D-HUD-1 (a),
// D-HUD-12, D-HUD-15. Uruchom: node src/testing/smoke/hud_layer_smoke.mjs
//
// PINY (SEDNO — pada na drzewie sprzed H1; KONTROLA — zielona po obu stronach). Moduły warstwy powstają w H1 — import
// dynamiczny (brak modułu na starym drzewie = pin pada, suita się nie przerywa).
//   L0  API: `HudLayer`, `hudGate`, `hudPixelRatio`, `hudUiScale` (HudLayer.js), `makeHudProjector` (HudProjection.js)
//   L1  DOM: `#hud-canvas` w index.html zaraz po `#three-canvas`, przed `#ui-canvas`; CSS z-index 1 + pointer-events none;
//       `#ui-canvas` (2) i `#event-layer` (3) bez zmian
//   L2  bramka: overlay / globus / SHIFT (UI i renderer) / poza trybem cywilizacji / renderer zawieszony / kontekst utracony
//       → podwarstwa nie rysuje; przejście „rysunek → schowana” czyści kanwę RAZ, kolejne klatki — 0 wywołań ctx; powrót →
//       rysunek
//   L3  spoczynek: klatki z niezmienionym kluczem — 0 wywołań ctx (licznik atrapy ctx); `prepare` podwarstwy w każdej klatce
//   L4  wyzwalacze: epoka kamery, statek wiodący, ciało na karcie, epoka motywu (`applyPreset`), oglądany układ, klucz
//       podwarstwy, `wake()`, animacja (rysuje do jej końca + jedna klatka czyszcząca, potem spoczynek)
//   L5  bufor i skala: kanwa = okno × gęstość renderera (`renderer.getPixelRatio()`); transformacja → px LOGICZNE (skala UI
//       jak `#ui-canvas`); zmiana okna — nowy bufor i rysunek
//   L6  projektor = rzut three (wyrocznia `src/lib/three.core.js`: `Vector3.project(camera)` + NDC → okno, ÷ skala UI):
//       punkt, głębia (`_viewDepth`), px na j. świata (wzór `engagementRingBand`), łuk okręgu, przycięcie za kamerą
//   L7  montaż (pin źródłowy — GameScene nie importuje się pod node): warstwa na `#hud-canvas`, po `new UIManager`
//       i po `EventBus.clear()`, wystawiona w `KOSMOS.hudLayer`
//   L8  odczyty renderera dla HUD — WYKONANIE metod wyciętych ze źródła `ThreeRenderer` na prawdziwej kamerze i obiektach
//       three: `getHudView` (macierze = kamera), `getBodyWorldInfo` (środek + promień tarczy), `getVesselWorldPosition`
//   L9  zero kolorów na sztywno i zero three / DOM w modułach warstwy (źródło bez komentarzy) + kontrola detektora
//   L10 pętla gry: domyślne `requestAnimationFrame` / `cancelAnimationFrame` wołane BEZ odbiorcy (przeglądarka rzuca
//       „Illegal invocation”, gdy funkcja okna dostaje obcy `this` — zmierzone na rozruchu gry; atrapa rzuca tak samo),
//       klatka z pętli rysuje, `destroy` zatrzymuje pętlę
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import * as TC from '../../config/ThemeConfig.js';
import * as T3 from '../../lib/three.core.js';   // wyrocznia rzutu (ten sam three co gra)

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const near = (a, b, e = 1e-6) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

let HL = null, HPJ = null;
try { HL = await import('../../ui/HudLayer.js'); } catch (e) { HL = null; console.log('    (HudLayer: ' + e.message + ')'); }
try { HPJ = await import('../../ui/HudProjection.js'); } catch (e) { HPJ = null; console.log('    (HudProjection: ' + e.message + ')'); }

// ── Atrapa ctx: każde wywołanie metody i każde przypisanie pola = jedno „wywołanie ctx” ─────────────────────────
const mkCtx = () => {
  const t = { calls: [] };
  return new Proxy(t, {
    get(o, p) {
      if (p === 'calls') return o.calls;
      if (Object.prototype.hasOwnProperty.call(o, p)) return o[p];
      return (...a) => { o.calls.push([String(p), ...a]); };
    },
    set(o, p, v) { o.calls.push(['=' + String(p), v]); o[p] = v; return true; },
  });
};
const mkCanvas = () => { const ctx = mkCtx(); return { width: 0, height: 0, ctx, getContext: () => ctx }; };

// ── Podwarstwa-sonda (mechanika warstwy niezależnie od radaru) ─────────────────────────────────────────────────
const mkProbe = () => {
  const p = {
    keyPart: 'a', count: 1, animating: false, prepares: 0, collects: 0, draws: 0, lastF: null, lastProj: undefined,
    prepare(F) { p.prepares++; p.lastF = F; return p.keyPart; },
    collect(F, proj) { p.collects++; p.lastProj = proj; return { count: p.count, animating: p.animating }; },
    draw(ctx, F) { p.draws++; ctx.strokeStyle = F.roles.primary; ctx.strokeRect(10, 20, 30, 40); },
  };
  return p;
};

// ── Świat (window.KOSMOS) ──────────────────────────────────────────────────────────────────────────────────────
const K = globalThis.window.KOSMOS ?? (globalThis.window.KOSMOS = {});
const W0 = { camEpoch: 1, lead: null, entity: null, overlay: false };
const setWorld = () => {
  globalThis.innerWidth = 1600; globalThis.innerHeight = 1041;
  Object.assign(K, {
    civMode: true, activeSystemId: 'sys_home', uiScale: 1.25, planetGlobeOpen: false,
    uiManager: {
      _cleanView: false,
      overlayManager: { isAnyOpen: () => W0.overlay },
      getSelectedVesselIds: () => (W0.lead ? [W0.lead] : []), getSelectedVesselId: () => W0.lead,
      get _selectedEntity() { return W0.entity ? { id: W0.entity } : null; }, getSelectedFleetId: () => null,
    },
    threeRenderer: {
      _cleanView: false, _renderingEnabled: true, _contextLost: false, _pingedEnemyId: null,
      renderer: { getPixelRatio: () => 1.5 },
      getCameraMoveEpoch: () => W0.camEpoch,
      getHudView: () => ({ view: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -10, 1], proj: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, -1, 0, 0, -0.002, 0], fovDeg: 90, cssW: 1600, cssH: 1041, worldPerAU: 11 }),
    },
    tacticalMode: { isActive: false },
    timeSystem: { simClockMs: null },
  });
};
setWorld();

const mk = (probe) => {
  const cv = mkCanvas();
  const hud = HL?.HudLayer ? new HL.HudLayer(cv, { autoStart: false, sublayers: [probe], now: () => 1000 }) : null;
  return { cv, hud, frame: (now = 1000) => (hud ? hud.frame(now) : null), calls: () => cv.ctx.calls.length, reset: () => { cv.ctx.calls.length = 0; } };
};

// ═══ L0 ══════════════════════════════════════════════════════════════════════
header('L0  API');
{
  ok(typeof HL?.HudLayer === 'function' && typeof HL?.hudGate === 'function' && typeof HL?.hudPixelRatio === 'function'
    && typeof HL?.hudUiScale === 'function', 'L0a SEDNO: `src/ui/HudLayer.js` — `HudLayer`, `hudGate`, `hudPixelRatio`, `hudUiScale`');
  ok(typeof HPJ?.makeHudProjector === 'function' && HPJ?.HUD_NEAR_CLIP > 0, 'L0b SEDNO: `src/ui/HudProjection.js` — `makeHudProjector` (+ `HUD_NEAR_CLIP`)');
}

// ═══ L1 ══════════════════════════════════════════════════════════════════════
header('L1  DOM — #hud-canvas między #three-canvas a #ui-canvas');
{
  const html = src('../../../index.html').replace(/\r\n/g, '\n');
  const iThree = html.indexOf('<canvas id="three-canvas">'), iHud = html.indexOf('<canvas id="hud-canvas">'), iUi = html.indexOf('<canvas id="ui-canvas">');
  ok(iHud > iThree && iHud < iUi && /<canvas id="three-canvas"><\/canvas>\s*<canvas id="hud-canvas"><\/canvas>\s*<canvas id="ui-canvas"><\/canvas>/.test(html),
    `L1a SEDNO: \`<canvas id="hud-canvas">\` zaraz po \`#three-canvas\`, przed \`#ui-canvas\` (pozycje ${iThree} / ${iHud} / ${iUi})`);
  const css = html.match(/#hud-canvas\s*\{([^}]*)\}/)?.[1] ?? '';
  ok(/z-index:\s*1;/.test(css) && /pointer-events:\s*none;/.test(css), `L1b SEDNO: CSS \`#hud-canvas\` — z-index 1, pointer-events none (${css.trim() || 'brak reguły'})`);
  // Reguły z identyfikatorem jako jedynym selektorem (wspólna reguła `#game-container canvas, #event-layer` — bez z-index).
  const rule = (id) => [...html.matchAll(new RegExp('\\n\\s*' + id + '\\s*\\{([^}]*)\\}', 'g'))].map((m) => m[1]).join(' ');
  const ui = rule('#ui-canvas'), ev = rule('#event-layer');
  ok(/z-index:\s*2;/.test(ui) && /pointer-events:\s*none;/.test(ui) && /z-index:\s*3;/.test(ev),
    'L1c KONTROLA: `#ui-canvas` z-index 2 (bez zdarzeń myszy), `#event-layer` z-index 3 — bez zmian');
}

// ═══ L2 ══════════════════════════════════════════════════════════════════════
header('L2  bramka widoczności — schowana warstwa nie rysuje; jedno czyszczenie przy przejściu');
{
  const gateCases = [
    ['overlay', () => { W0.overlay = true; }, () => { W0.overlay = false; }],
    ['globe', () => { K.planetGlobeOpen = true; }, () => { K.planetGlobeOpen = false; }],
    ['cleanView', () => { K.uiManager._cleanView = true; }, () => { K.uiManager._cleanView = false; }],
    ['cleanView', () => { K.threeRenderer._cleanView = true; }, () => { K.threeRenderer._cleanView = false; }],
    ['civMode', () => { K.civMode = false; }, () => { K.civMode = true; }],
    ['renderer', () => { K.threeRenderer._renderingEnabled = false; }, () => { K.threeRenderer._renderingEnabled = true; }],
    ['renderer', () => { K.threeRenderer._contextLost = true; }, () => { K.threeRenderer._contextLost = false; }],
  ];
  const names = ['overlay', 'globus (`planetGlobeOpen`)', 'SHIFT (UI `_cleanView`)', 'SHIFT (renderer `_cleanView`)', 'poza trybem cywilizacji',
    'renderer zawieszony (`BattleView3D`)', 'kontekst WebGL utracony'];
  gateCases.forEach(([reason, on, off], i) => {
    setWorld(); W0.camEpoch = 1;
    const probe = mkProbe(); const h = mk(probe);
    const r0 = h.frame();
    const draws0 = probe.draws, prep0 = probe.prepares;
    on();
    h.reset();
    const r1 = h.frame();
    const c1 = h.cv.ctx.calls.map((c) => c[0]);
    const clears1 = c1.filter((n) => n === 'clearRect').length;
    h.reset();
    const r2 = h.frame(), c2 = h.calls();
    const st = h.hud?.debugState?.();
    off();
    const r3 = h.frame();
    ok(r0 === 'drawn' && r1 === 'hidden' && clears1 === 1 && r2 === 'hidden' && c2 === 0 && probe.draws === draws0 + 1
      && probe.prepares === prep0 + 1 && st?.reason === reason && r3 === 'drawn',
      `L2${'abcdefg'[i]} SEDNO: ${names[i]} → schowana (powód \`${st?.reason}\`), jedno czyszczenie (${clears1}), potem 0 wywołań ctx (${c2}); podwarstwa nie rysuje w schowaniu; powrót → rysunek (${r0} → ${r1} → ${r2} → ${r3})`);
  });
  setWorld();
  const g = HL?.hudGate?.(K);
  ok(g?.shown === true && g?.reason === null, 'L2h SEDNO: `hudGate` — tryb cywilizacji, bez overlaya, globusa i SHIFT, renderer czynny → widoczna');
}

// ═══ L3 ══════════════════════════════════════════════════════════════════════
header('L3  spoczynek — niezmieniony klucz klatki → 0 wywołań ctx');
{
  setWorld(); W0.camEpoch = 7; W0.lead = null; W0.entity = null;
  const probe = mkProbe(); const h = mk(probe);
  const r0 = h.frame();
  h.reset();
  const res = []; for (let i = 0; i < 30; i++) res.push(h.frame(1000 + i * 16));
  ok(r0 === 'drawn' && res.every((r) => r === 'idle') && h.calls() === 0 && probe.collects === 1 && probe.prepares === 31,
    `L3a SEDNO: 30 klatek spoczynku — wszystkie „idle”, 0 wywołań ctx (${h.calls()}), \`collect\` raz (${probe.collects}), \`prepare\` w każdej klatce (${probe.prepares})`);
  const st = h.hud?.debugState?.();
  ok(st?.draws === 1 && st?.frames === 31, `L3b SEDNO: liczniki warstwy — 31 klatek, 1 rysunek (${st?.frames} / ${st?.draws})`);
  // Pusta podwarstwa, kanwa czysta → bez wywołań ctx nawet przy zmianie klucza.
  const empty = mkProbe(); empty.count = 0;
  const he = mk(empty);
  const e1 = he.frame(); W0.camEpoch++; const e2 = he.frame();
  ok(e1 === 'empty' && e2 === 'empty' && he.calls() === 0, `L3c SEDNO: podwarstwa bez treści przy czystej kanwie — 0 wywołań ctx także przy zmianie klucza (${e1}, ${e2}, ${he.calls()})`);
}

// ═══ L4 ══════════════════════════════════════════════════════════════════════
header('L4  wyzwalacze rysunku');
{
  setWorld(); W0.camEpoch = 10; W0.lead = null; W0.entity = null;
  const probe = mkProbe(); const h = mk(probe);
  h.frame();
  const trig = (label, change) => {
    const a = h.frame();         // spoczynek przed zmianą
    change();
    const d0 = probe.draws;
    const b = h.frame();
    const c = h.frame();         // znów spoczynek
    ok(a === 'idle' && b === 'drawn' && probe.draws === d0 + 1 && c === 'idle', `${label} (${a} → ${b} → ${c})`);
  };
  trig('L4a SEDNO: epoka ruchu kamery (`getCameraMoveEpoch`) → rysunek', () => { W0.camEpoch++; });
  trig('L4b SEDNO: zaznaczony statek wiodący (`readClickSelection.leadId`) → rysunek', () => { W0.lead = 'v_3'; });
  trig('L4c SEDNO: ciało na karcie (`readClickSelection.entityId`) → rysunek', () => { W0.entity = 'entity_5'; });
  trig('L4d SEDNO: epoka motywu (`applyPreset`) → rysunek', () => { TC.applyPreset(TC.PRESET_THEMES.ambient_1); });
  trig('L4e SEDNO: oglądany układ → rysunek', () => { K.activeSystemId = 'sys_067'; });
  trig('L4f SEDNO: klucz podwarstwy (np. położenie obiektu z radarem) → rysunek', () => { probe.keyPart = 'b'; });
  trig('L4g SEDNO: `wake()` (zdarzenie podwarstwy) → rysunek', () => { h.hud?.wake?.(); });
  // Animacja: rysuje co klatkę bez zmiany klucza, do końca animacji + jedna klatka czyszcząca.
  probe.animating = true; W0.camEpoch++;
  const an = []; for (let i = 0; i < 5; i++) an.push(h.frame(2000 + i * 16));
  probe.animating = false;
  const end1 = h.frame(2100), end2 = h.frame(2116);
  ok(an.every((r) => r === 'drawn') && end1 === 'drawn' && end2 === 'idle',
    `L4h SEDNO: animacja — 5 klatek z rysunkiem bez zmiany klucza, koniec animacji → jedna klatka, potem spoczynek (${an.join(',')} → ${end1} → ${end2})`);
  // Kolor z roli motywu, czytany przy rysunku.
  TC.applyPreset(TC.PRESET_THEMES.neon_cyber); h.frame();
  const lastStroke = [...h.cv.ctx.calls].reverse().find((c) => c[0] === '=strokeStyle');
  ok(lastStroke?.[1] === TC.THEME.accent, `L4i SEDNO: podwarstwa rysuje rolą \`primary\` z motywu (Neon Cyber: ${lastStroke?.[1]} = accent ${TC.THEME.accent})`);
}

// ═══ L5 ══════════════════════════════════════════════════════════════════════
header('L5  bufor kanwy i skala');
{
  setWorld(); W0.camEpoch = 20;
  const probe = mkProbe(); const h = mk(probe);
  h.reset(); h.frame();
  const st = h.hud?.debugState?.();
  const tf = h.cv.ctx.calls.find((c) => c[0] === 'setTransform');
  const cr = h.cv.ctx.calls.find((c) => c[0] === 'clearRect');
  ok(h.cv.width === 2400 && h.cv.height === 1562 && st?.canvas?.pr === 1.5,
    `L5a SEDNO: bufor = okno 1600×1041 × gęstość renderera 1,5 → ${h.cv.width}×${h.cv.height}`);
  ok(near(tf?.[1], 1.875) && near(tf?.[4], 1.875) && near(cr?.[3], 1280) && near(cr?.[4], 832.8),
    `L5b SEDNO: px LOGICZNE — transformacja (2400 / 1600) × skala UI 1,25 = ${tf?.[1]}; czyszczenie ${cr?.[3]}×${cr?.[4]} (okno logiczne 1280×832,8)`);
  ok(probe.lastF?.W === 1280 && near(probe.lastF?.H, 832.8) && probe.lastF?.uiScale === 1.25,
    `L5c SEDNO: podwarstwa dostaje okno w px logicznych (${probe.lastF?.W}×${probe.lastF?.H}, skala ${probe.lastF?.uiScale})`);
  globalThis.innerWidth = 1280; globalThis.innerHeight = 833; K.uiScale = 1;
  const r = h.frame();
  ok(r === 'drawn' && h.cv.width === 1920 && h.cv.height === 1250, `L5d SEDNO: zmiana okna (1280×833) → nowy bufor ${h.cv.width}×${h.cv.height} i rysunek (${r})`);
  ok(HL?.hudPixelRatio?.({ threeRenderer: { renderer: { getPixelRatio: () => 1.35 } } }) === 1.35
    && HL?.hudPixelRatio?.({}) === Math.min((globalThis.devicePixelRatio || 1) * 1.5, 2),
    'L5e SEDNO: gęstość = `renderer.getPixelRatio()` (1,35); bez renderera — wzór renderera (DPR × 1,5, najwyżej 2)');
  ok(HL?.hudUiScale?.({ uiScale: 1.25 }, 1600, 1041) === 1.25 && near(HL?.hudUiScale?.({}, 1600, 1041), Math.min(1600 / 1280, 1041 / 720)),
    'L5f SEDNO: skala UI = `KOSMOS.uiScale` (jak #ui-canvas); bez niej — wzór UIManager min(szer. / 1280, wys. / 720)');
}

// ═══ L6 ══════════════════════════════════════════════════════════════════════
header('L6  projektor = rzut three (wyrocznia)');
{
  const cam = new T3.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000);
  cam.position.set(383.13, 204.12, 118.52); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  const view = { view: cam.matrixWorldInverse.elements.slice(), proj: cam.projectionMatrix.elements.slice(), fovDeg: 55, cssW: 1600, cssH: 1041, worldPerAU: 11 };
  const P = HPJ?.makeHudProjector?.({ ...view, uiScale: 1.25 });
  const oracle = (x, y, z) => {
    const v = new T3.Vector3(x, y, z).project(cam);
    const d = -new T3.Vector3(x, y, z).applyMatrix4(cam.matrixWorldInverse).z;
    return { x: (v.x * 0.5 + 0.5) * 1600 / 1.25, y: (-v.y * 0.5 + 0.5) * 1041 / 1.25, depth: d };
  };
  const o0 = oracle(0, 0, 0);
  ok(near(o0.x, 640, 1e-3) && near(o0.y, 416.4, 1e-3), `L6-0 KONTROLA: wyrocznia — środek układu w środku okna logicznego (${o0.x.toFixed(2)}, ${o0.y.toFixed(2)})`);
  const pts = [[0, 0, 0], [10, 0, 5], [-40, 0.3, 22], [66.2, 0, -12.5], [0, 0, 126.72], [-126.72, 0.3, 3]];
  let worst = 0;
  for (const p of pts) {
    const a = P?.point?.(...p), b = oracle(...p);
    worst = Math.max(worst, a ? Math.hypot(a.x - b.x, a.y - b.y) + Math.abs(a.depth - b.depth) : Infinity);
  }
  ok(worst < 1e-6, `L6a SEDNO: punkt i głębia = rzut three ÷ skala UI dla ${pts.length} punktów (największy rozjazd ${worst})`);
  const d = oracle(10, 0, 5).depth;
  const kWorldPerPx = 2 * Math.tan((55 * Math.PI) / 360) / 1041;          // wzór `engagementRingBand` (px CSS)
  ok(near(P?.pxPerWorld?.(d), 1 / (kWorldPerPx * d) / 1.25, 1e-9), `L6b SEDNO: px logiczne na 1 j. świata w głębi ${d.toFixed(2)} = wzór \`engagementRingBand\` ÷ skala UI (${P?.pxPerWorld?.(d)})`);
  const arc = P?.arc?.(10, 0, 5, 126.72, 96);
  const runPts = arc?.runs?.[0] ?? [];
  const o90 = oracle(10 + 126.72 * Math.cos(Math.PI / 2), 0, 5 + 126.72 * Math.sin(Math.PI / 2));
  const i90 = 24 * 2;   // próbka 24 z 96 = kąt π/2 (oś y układu = oś Z świata)
  ok(arc?.runs?.length === 1 && runPts.length === 97 * 2 && !arc.clipped && Number.isFinite(arc.maxR)
    && near(runPts[i90], o90.x, 1e-6) && near(runPts[i90 + 1], o90.y, 1e-6),
    `L6c SEDNO: łuk pełny (pierścień 11,52 AU = 126,72 j. przy kadrze układu) — jedna ciągła łamana 97 próbek, kąt π/2 → oś Z świata (oś y układu) = rzut three; maxR ${arc?.maxR?.toFixed?.(1)} px`);
  // Kamera tuż nad płaszczyzną, wewnątrz dużego pierścienia: część okręgu za kamerą — przycięta, reszta ciągła i przed kamerą.
  const cam2 = new T3.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000);
  cam2.position.set(0, 1, 0); cam2.lookAt(10, 0, 0); cam2.updateMatrixWorld();
  const P2 = HPJ?.makeHudProjector?.({ view: cam2.matrixWorldInverse.elements.slice(), proj: cam2.projectionMatrix.elements.slice(), cssW: 1600, cssH: 1041, uiScale: 1.25 });
  const a2 = P2?.arc?.(0, 0, 0, 100, 128);
  const allFinite = !!a2 && a2.runs.every((r) => r.every(Number.isFinite));
  ok(a2?.clipped === true && a2?.maxR === Infinity && a2?.runs?.length >= 1 && allFinite && P2?.point?.(-50, 0, 0) === null,
    `L6d SEDNO: pierścień za kamerą — przycięty (${a2?.runs?.length} odcinek), współrzędne skończone, punkt za kamerą → null; maxR ∞ (ping stoi)`);
  ok(P2?.depth?.(-50, 0, 0) < 0 && P2?.depth?.(50, 0, 0) > 0, 'L6e SEDNO: głębia ujemna za kamerą, dodatnia przed nią');
}

// ═══ L7 ══════════════════════════════════════════════════════════════════════
header('L7  montaż w GameScene (pin źródłowy)');
{
  const gs = strip(src('../../scenes/GameScene.js'));
  const iClear = gs.indexOf('EventBus.clear();'), iUi = gs.indexOf('this.uiManager = new UIManager(uiCanvas);');
  const iHud = gs.indexOf("this.hudLayer = new HudLayer(document.getElementById('hud-canvas'));");
  ok(/import \{ HudLayer \}\s+from '\.\.\/ui\/HudLayer\.js';/.test(gs), 'L7a SEDNO: GameScene importuje `HudLayer`');
  ok(iClear > 0 && iUi > iClear && iHud > iUi && /window\.KOSMOS\.hudLayer = this\.hudLayer;/.test(gs),
    `L7b SEDNO: warstwa na \`#hud-canvas\` po \`EventBus.clear()\` i po \`new UIManager\`, wystawiona w \`KOSMOS.hudLayer\` (pozycje ${iClear} / ${iUi} / ${iHud})`);
  ok(/window\.KOSMOS\.hudLayer\?\.destroy\?\.\(\);/.test(gs.slice(iUi, iHud)), 'L7c SEDNO: ponowny start sceny niszczy poprzednią warstwę (jedna pętla rAF na kanwie)');
}

// ═══ L8 ══════════════════════════════════════════════════════════════════════
header('L8  odczyty renderera dla HUD — wykonanie metod ze źródła `ThreeRenderer`');
{
  const TR = strip(src('../../renderer/ThreeRenderer.js'));
  const methodBody = (code, sig) => { const i = code.indexOf(sig); return i < 0 ? '' : code.slice(i, code.indexOf('\n  }\n', i) + 4); };
  const compile = (name, scope) => {
    const b = methodBody(TR, `\n  ${name}(`);
    if (!b) return null;
    try { const names = Object.keys(scope); return new Function(...names, '__s', 'return eval("(" + __s + ")");')(...names.map((n) => scope[n]), 'function ' + b.trim().slice(name.length)); }
    catch (e) { console.log('    (kompilacja ' + name + ': ' + e.message + ')'); return null; }
  };
  const star = { id: 'star_1', type: 'star' };
  const SCOPE = { THREE: T3, AU: 110, WORLD_SCALE: 10, window: globalThis, EntityManager: { getByType: (t) => (t === 'star' ? [star] : []) } };
  const getHudView = compile('getHudView', SCOPE), getBody = compile('getBodyWorldInfo', SCOPE), getVes = compile('getVesselWorldPosition', SCOPE);
  const cam = new T3.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000);
  cam.position.set(30, 20, 10); cam.lookAt(0, 0, 0);       // BEZ updateMatrixWorld — metoda musi ją zrobić sama
  const grp = new T3.Group(); grp.position.set(-12, 0, 33);
  const pm = new T3.Mesh(new T3.SphereGeometry(0.36, 8, 8)); grp.add(pm);
  const moon = new T3.Mesh(new T3.SphereGeometry(0.04, 6, 6)); moon.position.set(-11.5, 0, 33.2);
  const stM = new T3.Object3D(); stM.position.set(4, 0.2, -6);
  const starG = new T3.Group(); const core = new T3.Mesh(new T3.SphereGeometry(3.6, 8, 8)); starG.add(core);
  const sp = new T3.Sprite(); sp.position.set(7, 0.3, -2);
  const r = { camera: cam, _planets: new Map([['p1', { group: grp, mesh: pm }]]), _moons: new Map([['m1', { mesh: moon }]]),
    _planetoids: new Map(), _stations: new Map([['st1', { mesh: stM }]]), _starGroup: starG, _starCore: core,
    _vessels: new Map([['v1', { sprite: sp }], ['v2', {}]]) };
  globalThis.innerWidth = 1600; globalThis.innerHeight = 1041;
  const v = getHudView?.call(r);
  cam.updateMatrixWorld();
  const sameView = !!v && v.view.every((x, i) => near(x, cam.matrixWorldInverse.elements[i], 1e-12)) && v.proj.every((x, i) => x === cam.projectionMatrix.elements[i]);
  ok(sameView && v.fovDeg === 55 && v.cssW === 1600 && v.cssH === 1041 && v.worldPerAU === 11 && v.view !== cam.matrixWorldInverse.elements,
    `L8a SEDNO: \`getHudView\` — macierze kamery po \`updateMatrixWorld\` (kopie), FOV 55, okno 1600×1041, 11 j. na AU`);
  const pb = getBody?.call(r, 'p1'), mb = getBody?.call(r, 'm1'), sb = getBody?.call(r, 'st1'), cb = getBody?.call(r, 'star_1'), nb = getBody?.call(r, 'nic');
  ok(near(pb?.x, -12) && near(pb?.z, 33) && near(pb?.r, 0.36) && near(mb?.x, -11.5) && near(mb?.r, 0.04) && near(sb?.y, 0.2) && sb?.r === 0
    && near(cb?.r, 3.6) && nb === null,
    `L8b SEDNO: \`getBodyWorldInfo\` — planeta (środek grupy, promień kuli ${pb?.r}), księżyc, stacja (bez tarczy), gwiazda (rdzeń ${cb?.r}), brak ciała → null`);
  const vp = getVes?.call(r, 'v1');
  ok(near(vp?.x, 7) && near(vp?.y, 0.3) && near(vp?.z, -2) && getVes?.call(r, 'v2') === null && getVes?.call(r, 'v9') === null,
    "L8c SEDNO: `getVesselWorldPosition` — pozycja sprite'a w świecie; statek bez sprite'a / nieznany → null");
}

// ═══ L9 ══════════════════════════════════════════════════════════════════════
header('L9  zero kolorów na sztywno, zero three / DOM w modułach warstwy');
{
  const HEX = /#[0-9a-fA-F]{3,8}\b|0x[0-9a-fA-F]{6}\b|rgba?\(\s*\d/;
  ok(HEX.test("ctx.strokeStyle = '#44ccff';") && HEX.test('const c = 0x44ccff;') && HEX.test("x = 'rgba(8,12,20,0.8)'"),
    'L9-0 KONTROLA: detektor łapie #rrggbb, 0xRRGGBB i rgba(…)');
  for (const f of ['HudLayer.js', 'HudProjection.js']) {
    let code = '';
    try { code = strip(src('../../ui/' + f)); } catch { code = ''; }
    ok(code.length > 0 && !HEX.test(code) && !/from 'three'|THREE\./.test(code) && !/document\.|getElementById/.test(code),
      `L9 SEDNO: \`${f}\` — bez kolorów na sztywno, bez three i bez DOM (kanwę podaje GameScene)`);
  }
}

// ═══ L10 ═════════════════════════════════════════════════════════════════════
header('L10  pętla gry — rAF wołane bez odbiorcy');
{
  // Atrapa funkcji okna: jak w przeglądarce — obcy `this` (wołanie jako metoda innego obiektu) ⇒ TypeError.
  const queue = [];
  const strictRaf = function (cb) { 'use strict'; if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation'); queue.push(cb); return queue.length; };
  const cancelled = [];
  const strictCaf = function (id) { 'use strict'; if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation'); cancelled.push(id); };
  const prevRaf = globalThis.requestAnimationFrame, prevCaf = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = strictRaf; globalThis.cancelAnimationFrame = strictCaf;
  setWorld(); W0.camEpoch = 77;
  const probe = mkProbe(); const cv = mkCanvas();
  let hud = null, err = null;
  try { hud = HL?.HudLayer ? new HL.HudLayer(cv, { sublayers: [probe] }) : null; } catch (e) { err = e; }
  let loopErr = null;
  try { const cb = queue.shift(); cb?.(); } catch (e) { loopErr = e; }
  ok(!!hud && err === null && loopErr === null && probe.draws === 1 && queue.length === 1,
    `L10a SEDNO: konstruktor z domyślną pętlą — rAF bez obcego \`this\` (${err?.message ?? 'bez wyjątku'}); klatka z kolejki rysuje (${probe.draws}) i zamawia następną (${queue.length})`);
  let dErr = null;
  try { hud?.destroy?.(); } catch (e) { dErr = e; }
  ok(!!hud && dErr === null && cancelled.length === 1, `L10b SEDNO: \`destroy\` — \`cancelAnimationFrame\` bez obcego \`this\` (${dErr?.message ?? 'bez wyjątku'}; anulowane: ${cancelled.length})`);
  globalThis.requestAnimationFrame = prevRaf; globalThis.cancelAnimationFrame = prevCaf;
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
