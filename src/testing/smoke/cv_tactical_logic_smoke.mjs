// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — ARC COMBAT VISUALS, krok CV-6a: WARSTWA TAKTYCZNA bitwy i zoom semantyczny (flaga `cvTactical`;
// COMBAT_VISUALS_PLAN.md §2.6, D-CV-20, D-CV-22; Findingi 633, 653 (a), 666, 674).
// Uruchom: node src/testing/smoke/cv_tactical_logic_smoke.mjs
//
// Wyłącznie LOGIKA (protokół F11 / HUD §4.0): bez pinów na stałych rysunku — liczby z tabeli pokręteł modułu (`TAC_TUNING`).
// Moduły powstają w kroku CV-6a — import dynamiczny (brak modułu = pin pada, suita się nie przerywa).
//   K1  mgła wojny = `isEndpointVisibleInCombat` (ikony, linie ognia, paski, liczby znaku); `rumor` poza starciem z graczem —
//       ikona „nieznany” bez klasy i HP; liczby znaku tylko z widocznych (ukryci — „?”)
//   K2  przekazanie zoomu: krycie ikon monotoniczne w px_L, 1 daleko, 0 w kinie, próg kina = PX_HI sceny; warstwa bierze px_L
//       KLASTRA SCENY (`_stageFrame`) — wykonanie
//   K3  znak bitwy z histerezą (bez migania przy progu)
//   K4  anti-overlap: po układzie żadne dwie ikony bliżej niż `TAC_ICON_MIN_SEP` (zestawy deterministyczne), mikrostos najpierw
//       tej samej roli, układ deterministyczny
//   K5  linie ognia DOKŁADNIE w czasach rejestru salw (prawdziwy `CombatLedger`), nigdy od okrętu po jego pokazanym zniszczeniu,
//       oba końce widoczne, budżet
//   K6  mikropaski == HP / osłona POKAZYWANE z rejestru (przed trafieniem i po), martwy — bez pasków
//   K7  klucz klatki warstwy zmienia się przy każdym zdarzeniu rejestru (strzał, trafienie) i stoi w pauzie bez ruchu (spoczynek)
//   K8  strefy kliku: ikona w położeniu RYSOWANYM rozstrzyga statek, który gracz widzi (nie ten, którego położenie logiczne
//       leży pod kursorem); cel reguły kliku — własny / wróg / mikrostos
//   K9  flaga OFF: warstwa bez elementów; etykiety, znaczniki i paski HP 3D — ścieżka dzisiejsza (bramka `tacActive`)
//   K10 pasma zasięgu: promień przez prawo sceny (monotoniczny; stopień 1 = G(d), 0 = skala prawdziwa; skala awaryjna)
//   K11 Finding 633 — duch `rumor` trzyma położenie ostatnio znane także w `orbiting` (predykat + oba miejsca zapisu żywego)
//   K12 i18n — klucze PL + EN
//   Decyzja właściciela 46 (2026-11-13):
//   K13 (2) klik w znak bitwy = „Obserwuj” — ładunek DOKŁADNIE jak przycisk paska walki; strefa znaku pochłania klik i emituje raz
//   K14 (3) bitwa poza kadrem — JEDNA strzałka na bitwę (nie na statek); uczestnik w kadrze — bez strzałki
//   K15 (1) CTRL — nazwy uczestników przy ich ikonach (rozkład bez nachodzenia; „nieznany” — „?”); renderer pomija uczestników
//       w etykietach CTRL; bez CTRL — bez nazw
//   K16 pasma: kursor nad wrakiem nie gasi pasm zaznaczonego statku (najechany tylko, gdy się nadaje)
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

const LG = await tryImport('../../ui/HudCombatLogic.js');
const LY = await tryImport('../../ui/HudCombatLayer.js');
const VF = await tryImport('../../utils/VesselFxLogic.js');
const SZ = await tryImport('../../renderer/combat/SemanticZoomLogic.js');
const BS = await tryImport('../../renderer/combat/BattleStageLogic.js');
const CL = await tryImport('../../renderer/combat/CombatLedgerLogic.js');
const PJ = await tryImport('../../ui/HudProjection.js');
const CS = await tryImport('../../ui/CombatStripLogic.js');
const EB = (await tryImport('../../core/EventBus.js'))?.default ?? null;
const FX = await tryImport('../../renderer/combat/FxEngine.js');
const TT = LG?.TAC_TUNING ?? {};
const call = (fn, ...a) => { try { return LG?.[fn]?.(...a); } catch (e) { return `ERR ${e.message}`; } };
const arr = (v) => (Array.isArray(v) ? v : []);
// Sekcja w bloku łapiącym wyjątek — pin degraduje (pada), nie przerywa suity (reguła keeperów sceny CV-3a1).
const guard = (name, fn) => { try { fn(); } catch (e) { ok(false, `${name}: wyjątek — ${e.message}`); } };

// ── K1 — mgła wojny ───────────────────────────────────────────────────────────────────────────────────────────────
header('K1 — mgła wojny = isEndpointVisibleInCombat');
{
  let same = true, n = 0;
  for (const isEnemy of [false, true]) for (const quality of [null, 'unknown', 'rumor', 'contact', 'detailed']) for (const inPE of [false, true]) {
    const vis = call('tacVisibility', { isEnemy, quality, inPlayerEngagement: inPE });
    const gate = VF?.isEndpointVisibleInCombat?.({ isEnemy, quality, inPlayerEngagement: inPE });
    if ((vis === 'full') !== (gate === true)) same = false;
    n++;
  }
  ok(same && n === 20, `K1a: „pełna” ikona ⇔ \`isEndpointVisibleInCombat\` (${n} kombinacji)`);
  ok(call('tacVisibility', { isEnemy: true, quality: 'rumor', inPlayerEngagement: false }) === 'unknown'
    && call('tacVisibility', { isEnemy: true, quality: 'unknown', inPlayerEngagement: false }) === 'hidden'
    && call('tacVisibility', { isEnemy: true, quality: 'rumor', inPlayerEngagement: true }) === 'full',
    'K1b: `rumor` poza starciem z graczem — „nieznany”; `unknown` — nic; w starciu z graczem — pełna (ujawniony)');
  ok(call('tacIconClass', 'battleship', 'unknown') === 'unknown' && call('tacIconClass', 'battleship', 'full') === 'battleship'
    && call('tacIconClass', 'medium_cargo', 'full') === 'civilian', 'K1c: „nieznany” bez klasy; okręt — klasa kadłuba; reszta — cywilny');
  const gc = call('tacGlyphCounts', [
    { side: 'own', visibility: 'full', alive: true, hp: 50, hpStart: 100 },
    { side: 'own', visibility: 'full', alive: false, hp: 0, hpStart: 100 },
    { side: 'enemy', visibility: 'unknown', alive: true, hp: 999, hpStart: 999 },
    { side: 'enemy', visibility: 'full', alive: true, hp: 40, hpStart: 80 },
  ]);
  ok(gc?.own?.alive === 1 && gc.own.total === 2 && near(gc.own.pct, 0.25) && gc.enemy.hidden === 1 && gc.enemy.total === 1 && near(gc.enemy.pct, 0.5),
    'K1d: liczby znaku tylko z widocznych — HP ukrytego nie wchodzi do siły, strona z ukrytym ma `hidden` („?”)');
  const lines = call('tacFireLines', [{ encounterId: 'e', round: 1, index: 0, attacker: 'a', target: 'b', fireAt: 100, hit: true, kind: 'laser' }], 150,
    { visible: (id) => id !== 'b' });
  ok(Array.isArray(lines) && lines.length === 0, 'K1e: linia ognia z niewidocznym końcem — nie rysuje się');
}

// ── K2 — przekazanie zoomu ────────────────────────────────────────────────────────────────────────────────────────
header('K2 — przekazanie zoomu (krycie ikon z px_L sceny)');
{
  let mono = true, prev = Infinity;
  for (let px = 0.5; px <= 60; px += 0.25) { const a = call('tacIconAlpha', px); if (!(a <= prev + 1e-12)) mono = false; prev = a; }
  ok(mono && prev === 0, 'K2a: krycie ikon NIEROSNĄCE w px_L (0,5 → 60 px)');
  ok(call('tacIconAlpha', TT.TAC_ICON_PX_LO) === 1 && call('tacIconAlpha', 2) === 1 && call('tacIconAlpha', TT.TAC_ICON_PX_HI) === 0 && call('tacIconAlpha', 200) === 0,
    'K2b: pełne daleko (≤ LO), zero w kinie (≥ HI)');
  ok(TT.TAC_ICON_PX_HI === SZ?.SEMANTIC_ZOOM?.PX_HI, `K2c: kino ikon = pełna scena (TAC_ICON_PX_HI ${TT.TAC_ICON_PX_HI} = PX_HI ${SZ?.SEMANTIC_ZOOM?.PX_HI})`);
  ok(near(call('tacIconAlpha', 16), 1 - SZ?.smoothstep?.(TT.TAC_ICON_PX_LO, TT.TAC_ICON_PX_HI, 16)), 'K2d: 1 − smoothstep(LO, HI, px_L) — ta sama funkcja co scena');
  ok(Number.isFinite(TT.TAC_ICON_PX_LO) && FX?.LIVE_CV_FX?.TAC_ICON_PX_LO === TT.TAC_ICON_PX_LO && FX?.LIVE_CV_FX?.TAC_GLYPH_ENTER_PX === TT.TAC_GLYPH_ENTER_PX,
    'K2e: pokrętła `TAC_*` w `cvTuning` (alias `LIVE_CV_FX`) — strojenie z konsoli');
}

// ── Atrapa świata dla wykonania podwarstwy ────────────────────────────────────────────────────────────────────────
globalThis.innerWidth = 1600; globalThis.innerHeight = 1041;
const CAM = new T3.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000);
CAM.up.set(0, 0, -1); CAM.position.set(0, 3, 0); CAM.lookAt(0, 0, 0); CAM.updateMatrixWorld();
const proj = PJ?.makeHudProjector?.({ view: CAM.matrixWorldInverse.elements.slice(), proj: CAM.projectionMatrix.elements.slice(), fovDeg: 55, cssW: 1600, cssH: 1041, uiScale: 1.25, worldPerAU: 11 }) ?? null;
const mkWorld = ({ pxL = 4, nowMs = 1000, feats = {}, positions = null, quality = {}, playerBattle = true } = {}) => {
  const A = ['a1', 'a2', 'a3'], B = ['b1', 'b2', 'b3'];
  const st = new Map();
  for (const id of [...A, ...B]) st.set(id, { hp: 80, hpStart: 100, shieldHP: 20, shieldHPStart: 40, weapons: [{ rangeAU: 0.05, category: 'short' }, { rangeAU: 0.15, category: 'medium' }] });
  const enc = { id: 'enc1', isActive: true, currentRound: 3, sideA: { ownerEmpireId: playerBattle ? 'player' : 'emp_y', vesselIds: A }, sideB: { ownerEmpireId: 'emp_x', vesselIds: B }, vesselStates: st,
    location: { systemId: 'sys_home', point: { x: 12, y: -7 } } };
  const pos = positions ?? { a1: [-0.2, 0.3, 0.0], a2: [-0.2, 0.3, 0.12], a3: [-0.2, 0.3, -0.12], b1: [0.2, 0.3, 0.0], b2: [0.2, 0.3, 0.12], b3: [0.2, 0.3, -0.12] };
  const vessels = new Map([...A, ...B].map((id) => [id, { id, name: id.toUpperCase(), shipId: id.endsWith('1') ? 'hull_cruiser' : 'hull_frigate',
    isEnemy: playerBattle ? B.includes(id) : true, ownerEmpireId: B.includes(id) ? 'emp_x' : (playerBattle ? null : 'emp_y'), systemId: 'sys_home',
    position: { x: 999, y: 999 } }]));
  const entries = new Map([...A, ...B].map((id) => [id, { sprite: { visible: true }, cvKilled: false, isModel3D: true, canonical: true }]));
  const led = CL ? new CL.CombatLedger() : null;
  const tr = {
    _stageFrame: { list: [{ id: 'enc1', encs: [enc], ids: [...A, ...B], pxL, blend: 1, law: BS?.spreadLaw?.(BS?.STAGE_LAW, 1.5) ?? null, fallback: false }] },
    _vessels: entries, _presClock: { nowMs }, _cvLedger: led, cvTuning: { ...TT },
    getVesselWorldPosition: (id) => { const p = pos[id]; return p ? { x: p[0], y: p[1], z: p[2] } : null; },
    getVesselWorldInfo: (id) => { const p = pos[id]; return p ? { x: p[0], y: p[1], z: p[2], r: 0.008 } : null; },
    getVesselBowWorld: () => ({ x: 1, y: 0, z: 0 }),
    cvPresentedState: (id, s) => { if (!led || !s) return null; const pr = led.presented(id, s.hp, s.shieldHP, s.hpStart, s.shieldHPStart); return { hp: pr.hp, shield: pr.shield, pending: pr.pending, killed: entries.get(id)?.cvKilled === true }; },
    _isCombatRevealed: (id) => (VF?.isPlayerEngagement?.(enc) === true) && [...A, ...B].includes(id),
  };
  const K = { threeRenderer: tr, vesselManager: { getVessel: (id) => vessels.get(id) ?? null },
    intelSystem: { getVesselContact: (id) => ({ quality: quality[id] ?? 'contact' }) },
    deepSpaceCombatSystem: { _resolveWeaponRange: (w) => w.rangeAU }, diplomacySystem: { getOpinionBand: () => 'neutral' } };
  const F = { K, features: { cvTactical: true, cvStage: true, cvWeapons: true, ...feats }, mode: 'system', sel: { vesselIds: [], leadId: null },
    pointer: null, hover: { vesselId: null }, W: 1280, H: 833, now: 0, roles: { primary: '#0f0', alert: '#f00', foreign: '#ccc', dim: '#444' } };
  return { K, F, tr, enc, led, st, vessels, entries, pos, A, B };
};
const runLayer = (w) => { const L = new LY.HudCombatLayer(null); const key = L.prepare(w.F); const c = L.collect(w.F, proj); return { L, key, c }; };

// ── K2 (wykonanie) — px_L klastra sceny steruje kryciem ikon ───────────────────────────────────────────────────────
{
  let okExec = false, info = null;
  try {
    const w1 = mkWorld({ pxL: 4 }), r1 = runLayer(w1);
    const w2 = mkWorld({ pxL: 16 }), r2 = runLayer(w2);
    const w3 = mkWorld({ pxL: 30 }), r3 = runLayer(w3);
    const a1 = r1.c.clusterInfo?.[0]?.alpha, a2 = r2.c.clusterInfo?.[0]?.alpha, a3 = r3.c.clusterInfo?.[0]?.alpha;
    info = { a1, a2, a3, n1: r1.c.nodes.length, n3: r3.c.nodes.length };
    okExec = near(a1, call('tacIconAlpha', 4)) && near(a2, call('tacIconAlpha', 16)) && a3 === 0 && r1.c.nodes.length === 6 && r3.c.nodes.length === 0;
  } catch (e) { info = 'ERR ' + e.message; }
  ok(okExec, `K2f: podwarstwa — krycie ikon z px_L klastra sceny (4 / 16 / 30 px), kino bez ikon ${JSON.stringify(info)}`);
}

// ── K1f (wykonanie) — znak bitwy bez gracza: strona ukryta mgłą liczona jako „?” (jak pasek walki), nie „0” ─────────
{
  let res = null;
  try {
    const tiny = { a1: [-0.01, 0.3, 0], a2: [-0.01, 0.3, 0.006], a3: [-0.01, 0.3, -0.006], b1: [0.01, 0.3, 0], b2: [0.01, 0.3, 0.006], b3: [0.01, 0.3, -0.006] };
    const w = mkWorld({ playerBattle: false, positions: tiny, quality: { b1: 'unknown', b2: 'unknown', b3: 'unknown' } });
    const { c } = runLayer(w);
    const g = c.glyphs?.[0] ?? null;
    res = { glyph: g ? g.parts.map((p) => p.text).join('').trim() : null, nodes: c.nodes.length, hidden: g?.counts?.enemy?.hidden };
  } catch (e) { res = 'ERR ' + e.message; }
  ok(typeof res?.glyph === 'string' && /3 : \?/.test(res.glyph) && res.hidden === 3, `K1f: bitwa bez gracza, strona B ukryta mgłą — znak „3 : ?” (nie „3 : 0”) ${JSON.stringify(res)}`);
}

// ── K3 — histereza znaku bitwy ────────────────────────────────────────────────────────────────────────────────────
header('K3 — znak bitwy z histerezą');
{
  const E = TT.TAC_GLYPH_ENTER_PX, X = TT.TAC_GLYPH_EXIT_PX;
  ok(E < X, `K3a: próg wejścia < próg wyjścia (${E} < ${X})`);
  let mode = false, flips = 0;
  const seq = [100, 80, X + 1, X - 1, E + 1, E - 1, E + 0.5, (E + X) / 2, X - 0.5, X + 0.5, E + 2, E - 2];
  const modes = [];
  for (const ext of seq) { const m = call('tacGlyphMode', mode, ext); if (m !== mode) flips++; mode = m; modes.push(m); }
  ok(flips === 3 && modes[5] === true && modes[8] === true && modes[9] === false && modes[11] === true,
    `K3b: wejście poniżej ${E}, wyjście dopiero powyżej ${X} — przy progu bez migania (zmian: ${flips})`);
  ok(call('tacGlyphMode', true, NaN) === true && call('tacGlyphMode', false, NaN) === false, 'K3c: rozpiętość nieznana — bez zmiany trybu');
}

// ── K4 — anti-overlap ─────────────────────────────────────────────────────────────────────────────────────────────
header('K4 — anti-overlap (gwarancja odstępu)');
guard('K4', () => {
  let rnd = 12345;
  const r = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
  let worst = Infinity, okAll = true, stacks = 0, cases = 0;
  for (let k = 0; k < 40; k++) {
    const n = 2 + Math.floor(r() * 22), spread = 4 + r() * 120;
    const items = Array.from({ length: n }, (_, i) => ({ id: `v${String(i).padStart(2, '0')}`, x: 400 + (r() - 0.5) * spread, y: 300 + (r() - 0.5) * spread, role: r() < 0.5 ? 'primary' : 'alert' }));
    const out = arr(call('tacLayoutIcons', items));
    const sep = call('tacMinSeparation', out);
    if (!out.length || (!(sep >= TT.TAC_ICON_MIN_SEP - 0.02) && out.length > 1)) okAll = false;
    worst = Math.min(worst, out.length > 1 ? sep : Infinity);
    stacks += out.filter((o) => o.stack).length;
    const ids = out.flatMap((o) => o.ids).sort();
    if (ids.length !== n || new Set(ids).size !== n) okAll = false;
    cases++;
  }
  ok(okAll, `K4a: ${cases} zestawów — po układzie żadne dwie ikony bliżej niż ${TT.TAC_ICON_MIN_SEP} px (najmniej: ${worst.toFixed?.(2)}), każdy statek dokładnie raz`);
  ok(stacks > 0, `K4b: gęste zestawy dają mikrostosy (${stacks}) — nigdy kupa ikon`);
  const two = arr(call('tacLayoutIcons', [{ id: 'a', x: 100, y: 100, role: 'primary' }, { id: 'b', x: 105, y: 100, role: 'primary' }]));
  ok(two.length === 2 && !two.some((o) => o.stack) && call("tacMinSeparation", two) >= TT.TAC_ICON_MIN_SEP - 0.02, 'K4c: para blisko — rozsunięta odpychaniem (bez stosu)');
  const pile = [{ id: 'p1', x: 200, y: 200, role: 'primary' }, { id: 'p2', x: 200.5, y: 200, role: 'primary' }, { id: 'p3', x: 200, y: 200.5, role: 'primary' },
    { id: 'e1', x: 201, y: 201, role: 'alert' }, { id: 'e2', x: 200.2, y: 201, role: 'alert' }, { id: 'e3', x: 201, y: 200.2, role: 'alert' }];
  const out = arr(call('tacLayoutIcons', pile));
  ok(call("tacMinSeparation", out) >= TT.TAC_ICON_MIN_SEP - 0.02 && out.some((o) => o.stack && o.role === 'primary') && out.some((o) => o.stack && o.role === 'alert')
    && out.filter((o) => o.stack).every((o) => o.role != null),
    'K4d: kupa obu stron — mikrostosy TEJ SAMEJ roli (bez mieszania, gdy wystarczy)');
  ok(Array.isArray(call('tacLayoutIcons', pile)) && JSON.stringify(call('tacLayoutIcons', pile)) === JSON.stringify(call('tacLayoutIcons', [...pile].reverse())), 'K4e: układ deterministyczny (kolejność wejścia bez znaczenia)');
});

// ── K5 — linie ognia w czasach rejestru salw ──────────────────────────────────────────────────────────────────────
header('K5 — linie ognia = czasy rejestru salw');
guard('K5', () => {
  let okT = false, okKill = false, info = null;
  if (CL) {
    const led = new CL.CombatLedger();
    const events = [
      { attacker: 'a1', target: 'b1', category: 'short', hit: true, dmg: 10 },
      { attacker: 'a2', target: 'b1', category: 'medium', hit: false },
      { attacker: 'b1', target: 'a1', category: 'long', hit: true, dmg: 12 },
      { attacker: 'b2', target: 'a2', category: 'medium', hit: true, dmg: 20, killed: true },
      { attacker: 'a2', target: 'b3', category: 'short', hit: true, dmg: 5 },
    ];
    const rec = led.addRound({ encounterId: 'enc1', round: 1, seed: 3, events, nowMs: 1000, roundMs: 1000 });
    const E = rec?.entries ?? [];
    const life = TT.TAC_FIRE_MS;
    const vis = { visible: () => true, killAt: (id) => led.killAt(id) };
    okT = E.length === 5 && E.every((x) => {
      const has = (t) => (call('tacFireLines', E, t, vis) ?? []).some((l) => l.key === `enc1:1:${x.index}`);
      return has(x.fireAt) && has(x.fireAt + life - 1) && !has(x.fireAt - 0.5) && !has(x.fireAt + life);
    });
    // Okręt pokazany jako zniszczony PRZED strzałem — bez linii (wpis ręczny po zniszczeniu: rejestr takich nie planuje).
    const after = [...E, { encounterId: 'enc1', round: 2, index: 9, attacker: 'a2', target: 'b1', fireAt: (led.killAt('a2') ?? 0) + 5, hit: true, kind: 'laser' }];
    const k = led.killAt('a2');
    const shotAfter = (call('tacFireLines', after, (k ?? 0) + 10, vis) ?? []).some((l) => l.key === 'enc1:2:9');
    const ownShots = E.filter((x) => x.attacker === 'a2');
    // Świadek: ta sama funkcja RYSUJE linię tego okrętu przed jego zniszczeniem (inaczej „brak linii po” byłby jałowy).
    const shotBefore = ownShots.length > 0 && (call('tacFireLines', E, ownShots[0].fireAt, vis) ?? []).some((l) => l.attacker === 'a2');
    okKill = Number.isFinite(k) && shotBefore && !shotAfter && ownShots.every((x) => x.fireAt < k);
    info = { entries: E.length, killAt: k, ownShots: ownShots.map((x) => x.fireAt) };
  }
  ok(okT, `K5a: każdy wpis rejestru — linia od \`fireAt\` przez TAC_FIRE_MS (przed i po — bez linii) ${JSON.stringify(info)}`);
  ok(okKill, 'K5b: nigdy linii od okrętu po jego pokazanym zniszczeniu (strzały rejestru — przed zniszczeniem)');
  const many = Array.from({ length: 60 }, (_, i) => ({ encounterId: 'e', round: 1, index: i, attacker: 'a', target: 'b', fireAt: 100 + i, hit: true, kind: 'kinetic' }));
  const l = arr(call('tacFireLines', many, 170, { visible: () => true }));
  ok(l.length > 0 && l.length === Math.floor(TT.TAC_FIRE_MAX) && l[0].fireAt >= l[l.length - 1].fireAt, `K5c: budżet ${TT.TAC_FIRE_MAX} linii na klatkę — najmłodsze`);
  const m = call('tacMissEnd', { x: 0, y: 0 }, { x: 10, y: 0 }, TT.TAC_FIRE_MISS_PX);
  ok(near(m?.x, 10 + TT.TAC_FIRE_MISS_PX) && near(m?.y, 0), 'K5d: pudło — linia za cel (przedłużenie)');
});

// ── K6 — mikropaski == wartości pokazywane ────────────────────────────────────────────────────────────────────────
header('K6 — mikropaski = HP / osłona pokazywane');
guard('K6', () => {
  let okBars = false, info = null;
  if (CL) {
    const led = new CL.CombatLedger();
    const rec = led.addRound({ encounterId: 'enc1', round: 1, seed: 1, events: [{ attacker: 'a1', target: 'b1', category: 'short', hit: true, dmg: 30, blockedByShield: 10 }], nowMs: 0, roundMs: 1000 });
    const st = { hp: 50, hpStart: 100, shieldHP: 0, shieldHPStart: 40 };   // stan logiczny PO rundzie
    const pres = (now) => { led.advance(now); const p = led.presented('b1', st.hp, st.shieldHP, st.hpStart, st.shieldHPStart); return { hp: p.hp, shield: p.shield, killed: false }; };
    const imp = rec.entries[0].impactAt;
    const p0 = pres(imp - 1), b0 = call('tacMicroBars', st, p0);
    const p1 = pres(imp + 1), b1 = call('tacMicroBars', st, p1);
    info = { before: b0, after: b1, p0, p1 };
    okBars = !!b0 && !!b1 && near(b0.hp, p0.hp / 100) && near(b0.shield, p0.shield / 40) && near(b1.hp, 0.5) && near(b1.shield, 0) && b0.hp > b1.hp;
  }
  ok(okBars, `K6a: pasek przed trafieniem = pokazywane (wyżej), po trafieniu spada do stanu logicznego ${JSON.stringify(info)}`);
  ok(call('tacMicroBars', { hp: 0, hpStart: 100, shieldHP: 0, shieldHPStart: 0 }, null) === null
    && call('tacMicroBars', { hp: 50, hpStart: 100, shieldHP: 5, shieldHPStart: 10 }, { hp: 50, shield: 5, killed: true }) === null,
    'K6b: martwy (HP 0 albo pokazane zniszczenie) — bez pasków');
  ok(call('tacMicroBars', { hp: 50, hpStart: 100, shieldHP: 0, shieldHPStart: 0 }, null)?.shield === null, 'K6c: statek bez osłony — bez paska osłony');
});

// ── K7 — klucz klatki: zdarzenia rejestru i spoczynek ─────────────────────────────────────────────────────────────
header('K7 — klucz warstwy: zdarzenia rejestru, spoczynek w pauzie');
{
  let res = null;
  try {
    const w = mkWorld({ pxL: 5, nowMs: 0 });
    const L = new LY.HudCombatLayer(null);
    const k0 = L.prepare(w.F); L.collect(w.F, proj);
    const k0b = L.prepare(w.F); L.collect(w.F, proj);
    const rec = w.led.addRound({ encounterId: 'enc1', round: 4, seed: 5, events: [{ attacker: 'a1', target: 'b2', category: 'short', hit: true, dmg: 25 }], nowMs: 0, roundMs: 1000 });
    const x = rec.entries[0];
    w.tr._presClock.nowMs = x.fireAt - 1;        // tuż przed strzałem (trafienie już w drodze w rejestrze — paski bez zmiany)
    const kPre = L.prepare(w.F); L.collect(w.F, proj);
    w.tr._presClock.nowMs = x.fireAt;            // strzał — zmienia się WYŁĄCZNIE linia ognia
    const k1 = L.prepare(w.F); L.collect(w.F, proj);
    const lines1 = L._last.lines.length;
    const k1b = L.prepare(w.F); L.collect(w.F, proj);   // pauza — zegar stoi
    w.tr._presClock.nowMs = x.impactAt + TT.TAC_FIRE_MS + 1; w.led.advance(w.tr._presClock.nowMs);   // trafienie (HP pokazywane spada), linia zgasła
    w.st.get('b2').hp = 55;
    const k2 = L.prepare(w.F); L.collect(w.F, proj);
    const k2b = L.prepare(w.F);
    res = { idle0: k0 === k0b, shot: k1 !== kPre, lines1, idle1: k1 === k1b, impact: k2 !== k1, idle2: k2 === k2b, anim: L._last.animating };
  } catch (e) { res = 'ERR ' + e.message; }
  ok(res?.idle0 && res?.idle1 && res?.idle2, `K7a: pauza bez ruchu — klucz stoi (spoczynek warstwy) ${JSON.stringify(res)}`);
  ok(res?.shot && res?.lines1 >= 1 && res?.impact, 'K7b: strzał z rejestru i trafienie zmieniają klucz (warstwa nie stoi w trakcie bitwy)');
  ok(res?.anim === false, 'K7c: warstwa nie wymusza animacji (`animating: false`) — w pauzie HUD może spocząć');
}

// ── K8 — strefy kliku w położeniu rysowanym ───────────────────────────────────────────────────────────────────────
header('K8 — klik ikony: statek, który gracz widzi');
{
  let res = null;
  try {
    const w = mkWorld({ pxL: 5 });
    // Położenia LOGICZNE celowo zamienione: a1 logicznie tam, gdzie RYSOWANY jest b1 (scena ≠ skala prawdziwa).
    w.vessels.get('a1').position = { x: 0.2 * 10, y: 0 }; w.vessels.get('b1').position = { x: -0.2 * 10, y: 0 };
    const { L } = runLayer(w);
    const zB = L._zones.find((z) => z.ids.includes('b1')), zA = L._zones.find((z) => z.ids.includes('a1'));
    const hitB = LG.tacHitAt(L._zones, zB.x, zB.y, TT.TAC_HIT_PX), hitA = LG.tacHitAt(L._zones, zA.x, zA.y, TT.TAC_HIT_PX);
    const tB = L.clickTargetFor(hitB, (id) => w.vessels.get(id)), tA = L.clickTargetFor(hitA, (id) => w.vessels.get(id));
    const tS = L.clickTargetFor({ ids: ['a2', 'a3'] }, (id) => w.vessels.get(id));
    res = { b: hitB?.ids, a: hitA?.ids, tB: tB?.type + ':' + tB?.id, tA: tA?.type + ':' + tA?.id, tS: tS?.type + ':' + (tS?.ids ?? []).join(','),
      miss: LG.tacHitAt(L._zones, zB.x + 40, zB.y + 40, TT.TAC_HIT_PX) };
  } catch (e) { res = 'ERR ' + e.message; }
  ok(res?.b?.[0] === 'b1' && res?.a?.[0] === 'a1', `K8a: strefa w położeniu RYSOWANYM rozstrzyga statek tej ikony ${JSON.stringify(res)}`);
  ok(res?.tB === 'enemy:b1' && res?.tA === 'vessel:a1' && res?.tS === 'vessels:a2,a3' && res?.miss === null,
    'K8b: cel reguły kliku — wróg / własny / własny mikrostos; obok ikony — nic (klik idzie do mapy)');
}

// ── K9 — flaga OFF ────────────────────────────────────────────────────────────────────────────────────────────────
header('K9 — flaga OFF: dzisiejsza ścieżka');
{
  let res = null;
  try {
    const w = mkWorld({ feats: { cvTactical: false } });
    const L = new LY.HudCombatLayer(null);
    const key = L.prepare(w.F), c = L.collect(w.F, proj);
    const w2 = mkWorld({ feats: { cvStage: false } });
    const L2 = new LY.HudCombatLayer(null);
    const key2 = L2.prepare(w2.F), c2 = L2.collect(w2.F, proj);
    res = { key, count: c.count, obst: L.labelObstacles().length, key2, count2: c2.count };
  } catch (e) { res = 'ERR ' + e.message; }
  ok(res?.key === 'tc:0' && res?.count === 0 && res?.obst === 0 && res?.key2 === 'tc:0' && res?.count2 === 0,
    `K9a: \`cvTactical\` OFF albo \`cvStage\` OFF — warstwa bez elementów i bez przeszkód ${JSON.stringify(res)}`);
  ok(call('tacActive', { cvTactical: true, cvStage: true }) === true && call('tacActive', { cvTactical: false, cvStage: true }) === false
    && call('tacActive', { cvTactical: true, cvStage: false }) === false && call('tacActive', null) === false, 'K9b: `tacActive` — flaga i scena');
  const lbl = strip(src('../../ui/HudLabelLayer.js')), sm = strip(src('../../ui/HudShipMarkerLayer.js')), tr = strip(src('../../renderer/ThreeRenderer.js'));
  const iHp = tr.indexOf('  _syncCombatHpBars() {'), hpBody = iHp >= 0 ? tr.slice(iHp, iHp + 600) : '';
  ok(/const tacPart = tacActive\(F\.features\) \? \(tr\?\._stageParticipants \?\? null\) : null;/.test(lbl) && /if \(tacKeep && tacPart\.has\(p\.id\) && !tacKeep\.has\(String\(p\.id\)\)\) continue;/.test(lbl),
    'K9c: etykiety — uczestnicy bitwy pomijani TYLKO przy `tacActive` (zaznaczony zostaje); OFF — lista jak dziś');
  ok(/const tacPart = tacActive\(F\.features\) \? \(tr\?\._stageParticipants \?\? null\) : null;/.test(sm) && /if \(tacPart\?\.has\?\.\(vid\)\) continue;/.test(sm),
    'K9d: znaczniki statku — uczestnicy pomijani TYLKO przy `tacActive`');
  ok(/if \(tacActive\(GAME_CONFIG\.FEATURES\)\) \{[\s\S]*?_disposeHpBar\(id\);[\s\S]*?return;\s*\}/.test(hpBody) && /planCombatHpBars\(/.test(tr.slice(iHp, iHp + 1400)),
    'K9e: paski HP 3D — zdjęte TYLKO przy `tacActive`; OFF — dzisiejsze `planCombatHpBars`');
}

// ── K10 — pasma zasięgu przez prawo sceny ─────────────────────────────────────────────────────────────────────────
header('K10 — pasma zasięgu (prawo sceny)');
guard('K10', () => {
  const law = BS?.spreadLaw?.(BS?.STAGE_LAW, 1.5);
  let mono = true, prev = 0;
  for (let r = 0.01; r <= 0.4; r += 0.01) { const v = call('tacBandRadiusWU', r, { auToWU: 11, blend: 1, law }); if (!(v >= prev - 1e-12)) mono = false; prev = v; }
  ok(mono && prev > 0, 'K10a: promień pasma monotoniczny w zasięgu');
  const d = 0.15 * 11;
  ok(near(call('tacBandRadiusWU', 0.15, { auToWU: 11, blend: 1, law }), BS?.stageGap?.(d, law)) && near(call('tacBandRadiusWU', 0.15, { auToWU: 11, blend: 0, law }), d),
    'K10b: stopień 1 (decyzja 20) — odstęp pary na scenie G(d); stopień 0 — skala prawdziwa');
  ok(near(call('tacBandRadiusWU', 0.15, { auToWU: 11, blend: 1, law, fallbackScale: 0.1 }), d * 0.1), 'K10c: skala awaryjna sceny — d × skala');
  ok(JSON.stringify(call('tacUniqueRanges', [0.15, 0.05, 0.15, 0.3])) === JSON.stringify([0.05, 0.15, 0.3]), 'K10d: każdy zasięg raz, rosnąco');
});

// ── K11 — Finding 633 ─────────────────────────────────────────────────────────────────────────────────────────────
header('K11 — Finding 633: duch `rumor` w orbiting');
{
  const H = VF?.rumorGhostHold;
  ok(typeof H === 'function' && H({ isEnemy: true, quality: 'rumor', revealed: false, ghostsOn: true }) === true
    && H({ isEnemy: true, quality: 'rumor', revealed: true, ghostsOn: true }) === false
    && H({ isEnemy: true, quality: 'contact', revealed: false, ghostsOn: true }) === false
    && H({ isEnemy: false, quality: 'rumor', revealed: false, ghostsOn: true }) === false
    && H({ isEnemy: true, quality: 'rumor', revealed: false, ghostsOn: false }) === false,
    'K11a: trzymamy ducha — wróg `rumor`, nie ujawniony w starciu, żywa ścieżka duchów; reszta — położenie żywe');
  const tr = strip(src('../../renderer/ThreeRenderer.js'));
  const iT = tr.indexOf('  _tickOrbitingVessels() {'), tick = iT >= 0 ? tr.slice(iT, tr.indexOf('\n  }\n', iT)) : '';
  const g1 = tick.indexOf('this._rumorGhostPos(v, entry)'), f1 = tick.indexOf('this._placeFreeVessel(id, entry, vx, vy)'), s1 = tick.indexOf('this._setSpriteBase(id, entry, pos.x, pos.y, pos.z)');
  ok(g1 > 0 && f1 > g1 && s1 > g1, 'K11b: `_tickOrbitingVessels` pyta o ducha PRZED zapisem żywym (wolna przestrzeń i orbita ciała)');
  const iS = tr.indexOf('  _syncVesselPositions(vessels) {'), sync = iS >= 0 ? tr.slice(iS, tr.indexOf('\n  }\n', iS)) : '';
  ok(/const ghost = this\._rumorGhostPos\(vessel, entry\);\s*if \(ghost\) \{[^}]*\}\s*else this\._placeFreeVessel\(vessel\.id, entry, vx, vy\);/.test(sync),
    'K11c: `_syncVesselPositions` (orbiting, wolna przestrzeń) — duch zamiast zapisu żywego');
}

// ── K12 — i18n ────────────────────────────────────────────────────────────────────────────────────────────────────
header('K12 — i18n PL + EN');
{
  const pl = src('../../i18n/pl.js'), en = src('../../i18n/en.js');
  const keys = ['combatTac.hp', 'combatTac.unknown', 'combatTac.wreck', 'combatTac.class.frigate', 'combatTac.class.destroyer', 'combatTac.class.battleship', 'combatTac.class.civilian', 'combatTac.class.unknown'];
  const missing = keys.filter((k) => !pl.includes(`'${k}'`) || !en.includes(`'${k}'`));
  ok(missing.length === 0, `K12a: ${keys.length} kluczy warstwy w PL i EN (brak: ${missing.join(', ') || '—'})`);
}

// ── K13 — decyzja 46 (2): klik w znak bitwy = „Obserwuj” ──────────────────────────────────────────────────────────
header('K13 — klik w znak bitwy = „Obserwuj” (ładunek paska walki)');
guard('K13', () => {
  const vs = { a: { x: 100, y: 100 }, b: { x: 104, y: 98 }, c: { x: 101, y: 103 }, d: { x: 99, y: 97 } };
  const encs = [
    { id: 'enc_b', isActive: true, currentRound: 2, location: { systemId: 'sys_home', point: { x: 50, y: 60 } }, sideA: { ownerEmpireId: 'player', vesselIds: ['a'] }, sideB: { ownerEmpireId: 'emp_x', vesselIds: ['b'] }, vesselStates: new Map() },
    { id: 'enc_a', isActive: true, currentRound: 4, location: { systemId: 'sys_home', point: { x: 51, y: 61 } }, sideA: { ownerEmpireId: 'player', vesselIds: ['c'] }, sideB: { ownerEmpireId: 'emp_x', vesselIds: ['d'] }, vesselStates: new Map() },
  ];
  const rows = CS?.stripBattles?.(encs, { getPos: (id) => vs[id] ?? null, radius: 1000, activeSystemId: 'sys_home' }) ?? [];
  const stripP = rows.length === 1 ? CS.stripWatchPayload(rows[0]) : null;
  const tacP = call('tacWatchPayload', encs);
  ok(!!stripP && JSON.stringify(tacP) === JSON.stringify(stripP) && tacP.encounterId === 'enc_a',
    `K13a: ładunek znaku == ładunek paska (\`stripWatchPayload\`) — starcie o najmniejszym id, jego układ i punkt ${JSON.stringify(tacP)}`);
  ok(call('tacWatchPayload', [{ id: 'x', location: { systemId: 's', point: null } }]) === null, 'K13b: starcie bez punktu — bez ładunku (pasek też bez przycisku)');
  // Wykonanie: znak bitwy (daleko) — strefa pochłania klik i emituje `camera:watchBattle` raz; klik obok — nic.
  const tiny = { a1: [-0.01, 0.3, 0], a2: [-0.01, 0.3, 0.006], a3: [-0.01, 0.3, -0.006], b1: [0.01, 0.3, 0], b2: [0.01, 0.3, 0.006], b3: [0.01, 0.3, -0.006] };
  const w = mkWorld({ positions: tiny });
  const { L } = runLayer(w);
  const got = [];
  const cbW = (pl) => got.push(pl);
  EB?.on?.('camera:watchBattle', cbW);
  const z = L._glyphZones?.[0] ?? null;
  const inside = z ? L.handleClick(z.rect.x + z.rect.w / 2, z.rect.y + z.rect.h / 2) : 'no-zone';
  const outside = z ? L.handleClick(z.rect.x - 60, z.rect.y - 60) : 'no-zone';
  EB?.off?.('camera:watchBattle', cbW);
  ok(inside === true && outside === false && got.length === 1 && JSON.stringify(got[0]) === JSON.stringify(call('tacWatchPayload', [w.enc])),
    `K13c: klik w znak — \`camera:watchBattle\` raz, z ładunkiem paska; obok — klik przechodzi ${JSON.stringify({ inside, outside, got })}`);
});

// ── K14 — decyzja 46 (3): jedna strzałka na bitwę poza kadrem ─────────────────────────────────────────────────────
header('K14 — bitwa poza kadrem: jedna strzałka na bitwę');
guard('K14', () => {
  const R = { x0: 100, y0: 50, x1: 1100, y1: 750 };
  const a = call('tacBattleArrow', [{ x: 1300, y: 300 }, { x: 1320, y: 310 }, { x: 1290, y: 290 }], R, 14);
  ok(a?.edge === 'right' && a.x === 1100 - 14 && a.y > 280 && a.y < 320, `K14a: wszyscy za prawą krawędzią — strzałka na prawej krawędzi, na wysokości bitwy ${JSON.stringify(a)}`);
  ok(call('tacBattleArrow', [{ x: 1300, y: 300 }, { x: 600, y: 300 }], R, 14) === null && call('tacBattleArrow', [], R, 14) === null,
    'K14b: choć jeden uczestnik w kadrze (albo brak rzutów) — bez strzałki');
  const far = { a1: [2.6, 0.3, 0], a2: [2.6, 0.3, 0.05], a3: [2.6, 0.3, -0.05], b1: [2.8, 0.3, 0], b2: [2.8, 0.3, 0.05], b3: [2.8, 0.3, -0.05] };
  const r1 = runLayer(mkWorld({ positions: far }));
  const r2 = runLayer(mkWorld({}));
  ok(r1.c.arrows?.length === 1 && r1.c.arrows[0].cluster === 'enc1' && (r2.c.arrows?.length ?? -1) === 0,
    `K14c: podwarstwa — 6 uczestników poza kadrem = JEDNA strzałka; bitwa w kadrze — zero ${JSON.stringify({ off: r1.c.arrows, on: r2.c.arrows?.length })}`);
});

// ── K15 — decyzja 46 (1): CTRL — nazwy przy ikonach ───────────────────────────────────────────────────────────────
header('K15 — CTRL: nazwy uczestników przy ich ikonach');
guard('K15', () => {
  const w = mkWorld({ pxL: 5 });
  w.tr._showAllLabels = true;
  const { c } = runLayer(w);
  const nodes = c.nodes ?? [], names = c.names ?? [];
  const nodeOf = (id) => nodes.find((n) => n.ids.includes(id));
  const adj = names.every((nm) => {
    const n = nodeOf(nm.id); if (!n) return false;
    const nx = Math.max(nm.x, Math.min(n.x, nm.x + nm.w)), ny = Math.max(nm.y, Math.min(n.y, nm.y + nm.h));
    return Math.hypot(nx - n.x, ny - n.y) <= (n.shape?.r ?? 6) + TT.TAC_NAME_GAP + (nm.lead ? TT.TAC_NAME_LEAD : 0) + 1.5;
  });
  let overlap = false;
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const p = names[i], q = names[j];
    if (p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y) overlap = true;
  }
  ok(names.length === nodes.length && names.length === 6 && adj && !overlap && names.some((n) => n.text === 'A1'),
    `K15a: nazwa każdej ikony przy SWOJEJ ikonie, bez nachodzenia (${names.length} / ${nodes.length})`);
  const w0 = mkWorld({ pxL: 5 });
  const r0 = runLayer(w0);
  ok((r0.c.names?.length ?? -1) === 0, 'K15b: bez CTRL — bez nazw');
  const wf = mkWorld({ pxL: 5, playerBattle: false, quality: { b1: 'rumor', b2: 'rumor', b3: 'rumor' } });
  wf.tr._showAllLabels = true;
  const rf = runLayer(wf);
  const bn = (rf.c.names ?? []).filter((n) => ['b1', 'b2', 'b3'].includes(n.id));
  ok(bn.length >= 1 && bn.every((n) => n.text === '?'), `K15c: mgła — wróg znany z pogłoski: „?” zamiast nazwy ${JSON.stringify(bn.map((n) => n.text))}`);
  let rnd = 777, allOk = true;
  const r = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
  for (let k = 0; k < 20; k++) {
    const items = Array.from({ length: 4 + Math.floor(r() * 16) }, (_, i) => ({ id: 'n' + i, x: 300 + r() * 120, y: 300 + r() * 80, r: 5, w: 30 + r() * 30, h: 12 }));
    const pl = call('tacPlaceNames', items, { rect: { x0: 0, y0: 0, x1: 1280, y1: 833 } });
    for (let i = 0; i < pl.length; i++) for (let j = i + 1; j < pl.length; j++) {
      const p = pl[i], q = pl[j];
      if (p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y) allOk = false;
    }
  }
  ok(allOk, 'K15d: rozkład nazw — 20 gęstych zestawów, żadne dwie nazwy na sobie (bez miejsca — nazwa pominięta)');
  const tr = strip(src('../../renderer/ThreeRenderer.js'));
  const iL = tr.indexOf('  getAllVisibleLabels() {'), body = iL >= 0 ? tr.slice(iL, tr.indexOf('\n  }\n', iL)) : '';
  ok(/const tacPart = tacActive\(GAME_CONFIG\.FEATURES\) \? this\._stageParticipants : null;/.test(body) && /if \(tacPart\?\.has\?\.\(id\)\) continue;/.test(body),
    'K15e: etykiety CTRL renderera pomijają uczestników bitwy w widoku TYLKO przy `tacActive` (OFF — jak dziś)');
});

// ── K16 — pasma: najechany wrak nie gasi pasm zaznaczonego ────────────────────────────────────────────────────────
header('K16 — pasma: najechany tylko, gdy się nadaje');
guard('K16', () => {
  const q = (id) => id === 'a1' || id === 'b2';
  ok(call('tacBandTarget', { hoverId: 'b2', selectedIds: ['a1'], qualifies: q }) === 'b2'
    && call('tacBandTarget', { hoverId: 'b1', selectedIds: ['a1'], qualifies: q }) === 'a1'
    && call('tacBandTarget', { hoverId: null, selectedIds: [], qualifies: q }) === null,
    'K16a: najechany nadający się — on; najechany wrak / „nieznany” — zaznaczony; nic — brak pasm');
  const w = mkWorld({ pxL: 5 });
  w.F.sel = { vesselIds: ['a1'], leadId: 'a1' };
  const L = new LY.HudCombatLayer(null);
  L.prepare(w.F); L.collect(w.F, proj);
  const zb = L._zones.find((z) => z.ids.includes('b1'));
  w.entries.get('b1').cvKilled = true;
  w.F.pointer = { lx: zb.x, ly: zb.y, rawX: zb.x, rawY: zb.y, overUI: false };
  L.prepare(w.F); const c = L.collect(w.F, proj);
  ok((c.bands ?? []).length >= 1 && c.bands.every((b) => b.id === 'a1'), `K16b: kursor nad ikoną wraku — pasma zaznaczonego zostają ${JSON.stringify((c.bands ?? []).map((b) => b.id))}`);
});

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
if (fail) process.exitCode = 1;
