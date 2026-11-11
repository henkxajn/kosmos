// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_choreo_logic_smoke — KEEPER ARC COMBAT VISUALS, krok CV-3b (choreografia w kopercie; F4, D-CV-6, D-CV-7; Finding 681)
// Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §2.3, §3 (D-CV-6, D-CV-7), §4 CV-3b.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// `ChoreographyLogic` ma zero importów ⇒ wszystko WYKONANIEM pod node (wzór `cv_stage_logic_smoke`). Wyłącznie logika (F11):
// bez pinów na stałych rysunku — progi to kontrakty (koperta klasy z pokrętła, pasma z prawa sceny, ε ciągłości), nie wartości.
//   L1 (e) determinizm: to samo ziarno i te same wejścia ⇒ ta sama poza (przesunięcie, kwaternion, silnik) co do bitu; inne
//      starcie ⇒ inne fazy (inne przesunięcia przy tych samych wejściach); inny statek ⇒ inne
//   L2 (d) zegar stoi ⇒ poza stoi co do bitu (60 kroków z dtMs = 0); po wznowieniu rusza
//   L3 koperta klasy: |przesunięcie| ≤ koperta klasy × L, pion ≤ CHOREO_VERT × L — każda klasa, każda postawa, losowe kierunki;
//      pokrętło koperty działa (mniejsza koperta ⇒ mniejsza granica)
//   L4 NIEZMIENNIK PASM D-CV-6 w czasie: losowe układy 10 na 10 (rozproszone, linie, gęste kupki) i szyk stagera, 10 s × 60 kl./s:
//      po rzucie KAŻDA para w paśmie odstępu kotwic (krawędzie G(zasięg)) i nie bliżej niż podłoga kolizji; złe pasma względem
//      logiki z choreografią == bez niej (0 przy spójnym rozwiązaniu sceny); ŚWIADEK: ten sam ruch BEZ rzutu przenosi pary
//      do innego pasma (rzut jest konieczny); okna D-CV-6 par strzelec → cel na parkingu broni
//   L5 ciągłość: największy krok rysowany na klatkę ≤ ε przy 60 kl./s, rzut bez awaryjnego zerowania w całym zestawie; ŚWIADEK:
//      ruch jest (średnie przesunięcie > 0)
//   L6 (Finding 681) zwrot: statek startujący rufą do celu po czasie zwrotu ma dziób ku celowi (fregata, niszczyciel) albo burtę
//      (pancernik); prędkość skrętu nigdy ponad sufit klasy; ŚWIADEK: na starcie odchyłka ≈ 180°
//   L7 postawy (D-CV-7): trzymaj — mniejsza amplituda niż angażuj; kite — składowa promieniowa OD celu, angażuj — KU celowi;
//      odwrót — dziób od zagrożenia; zniszczony — przesunięcie i silnik gasną
//   L8 silnik: fregata w przelotach jaśniejsza od pancernika (bieg jałowy); odwrót — pełny ciąg; zniszczony — zgaszony
//   L9 cel zwrotu: kolejność (strzał z ostatniej rundy › pamięć › „Zaangażuj” › najbliższy żywy), martwy cel pomijany, brak żywych
//      — środek przeciwników; remis odległości — mniejsze id
//   L10 bez `Math.random` (§2.12-1): źródło (komentarze zdjęte) i wykonanie (licznik losowań 0 w pełnym przebiegu)
//   L11 spokój przy szybkiej kotwicy (pomiar na żywym silniku: rzut przeciągał przesunięcia do 7 L/s, gdy szyk się przestawiał):
//      przy pokrętle `CHOREO_CALM_V` 0,8 L/s kotwica 3 L/s — amplituda wzoru < 0,15 × przy stojącej; skok prędkości kotwicy
//      0 → 3 → 0 L/s bez skoku przesunięcia (pokrętło ustalone w pinie — domyślna wartość to strojenie właściciela)
//   L12 zmiana celu i postawy bez skoku prędkości (pomiar na żywym silniku: przy zmianie celu prędkość przesunięcia skakała
//      o 1,65 L/s — rama ruszała obrót od razu z pełną prędkością): wzór zatrzymany, obrót ramy o 90° i zmiana postawy —
//      zmiana prędkości między klatkami ≤ 0,3 L/s; ŚWIADEK: rama obracana samym sufitem skacze ≥ 0,8 L/s; rama naprawdę się
//      obróciła (przesunięcie w nowej ramie = to samo w starej)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const CH = await tryImport('../../renderer/combat/ChoreographyLogic.js');
const SL = await tryImport('../../renderer/combat/BattleStageLogic.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const block = (title, fn) => { header(title); try { fn(); } catch (e) { assert(false, `${title} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };

const L = 0.016, AU = 11, DT = 1000 / 60;
const edges = SL ? SL.bandEdgesWU([0.05, 0.15, 0.30], AU) : [0.55, 1.65, 3.3];
const app = SL ? SL.apparentEdges(edges) : edges;
const bandOf = (d) => { for (let i = 0; i < app.length; i++) if (d <= app[i]) return i; return app.length; };
const dist = (a, b) => Math.hypot(b.x - a.x, (b.y ?? 0) - (a.y ?? 0), b.z - a.z);
let rs = 12345;
const rnd = () => { rs = (Math.imul(rs, 1103515245) + 12345) >>> 0; return rs / 4294967296; };

/** Układ do sceny: punkty logiczne (x, z w j.), strona, klasa. */
function stagerLayout() {
  const pts = [];
  const HULLS = ['frigate', 'destroyer', 'battleship'];
  for (const [side, sign] of [['player', -1], ['emp', 1]]) {
    for (let i = 0; i < 10; i++) {
      const line = Math.floor(i / 5), k = i % 5;
      pts.push({ id: `${side === 'player' ? 'A' : 'B'}${String(i + 1).padStart(2, '0')}`, side, cls: HULLS[i % 3],
        x: sign * (0.06 + line * 0.03) * AU, y: 0.3, z: (k - 2) * 0.035 * AU });
    }
  }
  return pts;
}
function randomLayout(kind) {
  const pts = [];
  const HULLS = ['frigate', 'destroyer', 'battleship'];
  for (let i = 0; i < 20; i++) {
    const side = i < 10 ? 'player' : 'emp', sgn = side === 'player' ? -1 : 1;
    let x, z;
    if (kind === 'stack') { x = sgn * 0.5 + (rnd() - 0.5) * 0.002; z = (rnd() - 0.5) * 0.002; }
    else if (kind === 'line') { x = sgn * (0.4 + rnd() * 0.3); z = (i % 10 - 4.5) * 0.25 + (rnd() - 0.5) * 0.05; }
    else { x = sgn * (0.3 + rnd() * 1.5) + (rnd() - 0.5) * 0.6; z = (rnd() - 0.5) * 2.0; }
    pts.push({ id: `S${String(i).padStart(2, '0')}`, side, cls: HULLS[i % 3], x, y: 0.3, z });
  }
  return pts;
}
/** Kotwice z prowadnicy sceny (pary pierwszeństwa jak w grze: strzelec → najbliższy przeciwnik). */
function anchorsOf(pts) {
  const c = { x: 0, y: 0.3, z: 0 };
  for (const p of pts) { c.x += p.x / pts.length; c.z += p.z / pts.length; }
  const pri = new Set();
  for (const p of pts) {
    let best = null, bd = Infinity;
    for (const q of pts) if (q.side !== p.side) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q; } }
    if (best) pri.add(SL.pairKey(p.id, best.id));
  }
  return { sol: SL.solveStage({ points: pts, centre: c, L, edges, priority: pri }), pri };
}
/** Krok choreografii całego klastra (jak renderer): wzór → rzut. */
function stepCluster(pts, anchors, states, warm, { dt = DT, project = true, postureOf = () => 'engage' } = {}) {
  const offsets = new Map(), env = new Map(), ids = [];
  for (const p of pts) {
    const a = anchors.get(p.id);
    let best = null, bd = Infinity;
    for (const q of pts) if (q.side !== p.side) { const b = anchors.get(q.id); const d = dist(a, b); if (d < bd) { bd = d; best = b; } }
    const st = states.get(p.id);
    const o = CH.stepChoreoOffset(st, { dtMs: dt, posture: postureOf(p), threat: best ? { dir: { x: (best.x - a.x) / bd, y: (best.y - a.y) / bd, z: (best.z - a.z) / bd }, gap: bd } : null, L });
    offsets.set(p.id, { x: o.x, y: o.y, z: o.z });
    env.set(p.id, CH.choreoEnvelope(st.cls, L));
    ids.push(p.id);
  }
  const res = project ? CH.constrainChoreo({ ids, anchors, offsets, app, L, weights: env, envelopes: env, vertMax: CH.CHOREO_TUNING.CHOREO_VERT * L, warm }) : null;
  return { offsets, res };
}
const statesFor = (pts, enc = 'enc_1') => new Map(pts.map((p) => [p.id, CH.createChoreo(CH.choreoSeed(enc, p.id), p.cls)]));

// ═══ L1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('L1 — (e) determinizm: to samo ziarno ⇒ ta sama poza; inne starcie ⇒ inne fazy', () => {
  const run = (enc, vid) => {
    const st = CH.createChoreo(CH.choreoSeed(enc, vid), 'frigate');
    const seq = [];
    for (let k = 0; k < 600; k++) {
      const ang = k * 0.003;
      const o = CH.stepChoreoOffset(st, { dtMs: DT, posture: k < 300 ? 'engage' : 'kite', threat: { dir: { x: Math.cos(ang), y: 0, z: Math.sin(ang) }, gap: 3.5 * L }, L });
      const f = CH.stepChoreoFacing(st, { dtMs: DT, posture: 'engage', aim: { x: Math.cos(ang), y: 0.05, z: Math.sin(ang) } });
      const e = CH.stepChoreoEngine(st, { dtMs: DT, posture: 'engage', L });
      seq.push([o.x, o.y, o.z, ...f.q, e]);
    }
    return seq;
  };
  const a = run('enc_1', 'CV-A01'), b = run('enc_1', 'CV-A01'), c = run('enc_2', 'CV-A01'), d = run('enc_1', 'CV-A02');
  assert(a.length === 600 && JSON.stringify(a) === JSON.stringify(b), 'L1a SEDNO: to samo ziarno i te same wejścia — 600 póz identycznych co do bitu');
  const diffC = a.filter((r, i) => Math.hypot(r[0] - c[i][0], r[1] - c[i][1], r[2] - c[i][2]) > 1e-6 * L).length;
  const diffD = a.filter((r, i) => Math.hypot(r[0] - d[i][0], r[1] - d[i][1], r[2] - d[i][2]) > 1e-6 * L).length;
  assert(diffC > 500 && diffD > 500, `L1b inne starcie ⇒ inne fazy (${diffC} / 600 póz różnych), inny statek ⇒ inne (${diffD} / 600)`);
  assert(CH.choreoSeed('enc_1', 'CV-A01') === CH.choreoSeed('enc_1', 'CV-A01') && CH.choreoSeed('enc_1', 'CV-A01') !== CH.choreoSeed('enc_2', 'CV-A01'),
    'L1c ziarno: z id starcia i id statku (stałe dla pary, różne dla innego starcia)');
});

// ═══ L2 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('L2 — (d) zegar stoi ⇒ poza stoi co do bitu; po wznowieniu rusza', () => {
  const st = CH.createChoreo(CH.choreoSeed('enc_1', 'CV-A03'), 'destroyer');
  const thr = { dir: { x: 1, y: 0, z: 0 }, gap: 8 * L };
  const aim = { x: 1, y: 0, z: 0.2 };
  for (let k = 0; k < 200; k++) { CH.stepChoreoOffset(st, { dtMs: DT, posture: 'engage', threat: thr, L }); CH.stepChoreoFacing(st, { dtMs: DT, posture: 'engage', aim }); CH.stepChoreoEngine(st, { dtMs: DT, posture: 'engage', L }); }
  const snap = () => JSON.stringify([CH.stepChoreoOffset(st, { dtMs: 0, posture: 'engage', threat: thr, L }), CH.stepChoreoFacing(st, { dtMs: 0, posture: 'engage', aim }).q,
    CH.stepChoreoEngine(st, { dtMs: 0, posture: 'engage', L }), st.t, st.yaw, st.roll]);
  const s0 = snap();
  let same = true;
  for (let k = 0; k < 60; k++) if (snap() !== s0) same = false;
  CH.stepChoreoOffset(st, { dtMs: DT * 30, posture: 'engage', threat: thr, L });
  CH.stepChoreoFacing(st, { dtMs: DT * 30, posture: 'engage', aim });
  assert(same, 'L2a SEDNO: 60 kroków z dtMs = 0 — przesunięcie, kwaternion, silnik, czas i kurs identyczne co do bitu');
  assert(snap() !== s0, 'L2b po wznowieniu poza się zmienia (zegar rusza od miejsca, w którym stanął)');
});

// ═══ L3 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('L3 — koperta klasy i sufit pionu (każda klasa, każda postawa, losowe kierunki); pokrętło koperty', () => {
  let worst = 0, worstY = 0, n = 0;
  for (const cls of ['frigate', 'destroyer', 'battleship']) {
    for (const posture of ['engage', 'kite', 'hold', 'retreat']) {
      const st = CH.createChoreo(CH.choreoSeed('enc_env', cls + posture), cls);
      const E = CH.choreoEnvelope(cls, L);
      for (let k = 0; k < 1500; k++) {
        const a = rnd() * Math.PI * 2, b = (rnd() - 0.5) * 1.2;
        const o = CH.stepChoreoOffset(st, { dtMs: DT, posture, threat: { dir: { x: Math.cos(a) * Math.cos(b), y: Math.sin(b), z: Math.sin(a) * Math.cos(b) }, gap: (1.6 + rnd() * 12) * L }, L });
        worst = Math.max(worst, Math.hypot(o.x, o.y, o.z) / E);
        worstY = Math.max(worstY, Math.abs(o.y) / (CH.CHOREO_TUNING.CHOREO_VERT * L));
        n++;
      }
    }
  }
  assert(worst <= 1 + 1e-9 && worstY <= 1 + 1e-9 && worst > 0.5, `L3a SEDNO: ${n} kroków — |przesunięcie| ≤ koperta klasy (maks. ${worst.toFixed(4)} koperty), pion ≤ sufit (maks. ${worstY.toFixed(4)})`);
  const T = { ...CH.CHOREO_TUNING, CHOREO_ENV_FRIGATE: 0.5 };
  const st = CH.createChoreo(CH.choreoSeed('enc_env', 'knob'), 'frigate');
  let m = 0;
  for (let k = 0; k < 900; k++) { const o = CH.stepChoreoOffset(st, { dtMs: DT, posture: 'engage', threat: { dir: { x: 1, y: 0, z: 0 }, gap: 6 * L }, L }, T); m = Math.max(m, Math.hypot(o.x, o.y, o.z) / L); }
  assert(m <= 0.5 + 1e-9 && m > 0.2, `L3b pokrętło CHOREO_ENV_FRIGATE 0,5 L — największe przesunięcie ${m.toFixed(3)} L ≤ 0,5 L`);
});

// ═══ L4 / L5 ══════════════════════════════════════════════════════════════════════════════════════════════════════
const RUN = { configs: 0, frames: 0, pairs: 0, bandViol: 0, floorViol: 0, misChoreo: 0, misAnchor: 0, halved: 0, zeroed: 0, maxStepL: 0, sumOffL: 0, nOff: 0,
  ctlViol: 0, windowViol: 0, windowChecked: 0 };
block('L4 / L5 — niezmiennik pasm D-CV-6 w czasie i ciągłość (losowe układy 10 na 10 + szyk stagera)', () => {
  const configs = [['stager', stagerLayout()]];
  for (let k = 0; k < 12; k++) configs.push(['scatter' + k, randomLayout('scatter')]);
  for (let k = 0; k < 4; k++) configs.push(['line' + k, randomLayout('line')]);
  for (let k = 0; k < 4; k++) configs.push(['stack' + k, randomLayout('stack')]);
  for (const [name, pts] of configs) {
    const { sol, pri } = anchorsOf(pts);
    if (sol.fallback) continue;   // skala awaryjna sceny — kotwice same nie są spójne (osobny pin sceny)
    const anchors = sol.pos;
    const logical = pts.map((p) => ({ id: p.id, x: p.x, z: p.z }));
    const misA = SL.countMisbanded(logical, anchors, edges);
    const states = statesFor(pts, 'enc_' + name), warm = new Map();
    const ctlStates = statesFor(pts, 'enc_' + name);
    let prev = null;
    RUN.configs++;
    for (let f = 0; f < 600; f++) {
      const { offsets, res } = stepCluster(pts, anchors, states, warm);
      RUN.halved += res.halved; RUN.zeroed += res.zeroed;
      const drawn = new Map(pts.map((p) => { const a = anchors.get(p.id), o = offsets.get(p.id); return [p.id, { x: a.x + o.x, y: a.y + o.y, z: a.z + o.z }]; }));
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const g = dist(anchors.get(pts[i].id), anchors.get(pts[j].id)), d = dist(drawn.get(pts[i].id), drawn.get(pts[j].id));
          RUN.pairs++;
          if (bandOf(d) !== bandOf(g)) RUN.bandViol++;
          if (d < Math.min(CH.CHOREO.COLLISION_L * L, g) - 1e-3 * L) RUN.floorViol++;
          // okna D-CV-6 par strzelec → cel na parkingu broni (odstęp kotwic przy kotwicy okna)
          if (pri.has(SL.pairKey(pts[i].id, pts[j].id))) {
            const gl = g / L, dl = d / L;
            const win = gl <= 4.2 ? [1.5, 7] : gl >= 6.5 && gl <= 9.5 ? [4, 12] : gl >= 11 && gl <= 15.5 ? [9, Infinity] : null;
            if (win) { RUN.windowChecked++; if (!(dl > win[0] && dl < win[1])) RUN.windowViol++; }
          }
        }
      }
      RUN.misChoreo += SL.countMisbanded(logical, drawn, edges);
      RUN.misAnchor += misA;
      if (prev) for (const p of pts) RUN.maxStepL = Math.max(RUN.maxStepL, dist(drawn.get(p.id), prev.get(p.id)) / L);
      for (const p of pts) { const o = offsets.get(p.id); RUN.sumOffL += Math.hypot(o.x, o.y, o.z) / L; RUN.nOff++; }
      prev = drawn;
      RUN.frames++;
      // ŚWIADEK: ten sam ruch BEZ rzutu
      const ctl = stepCluster(pts, anchors, ctlStates, null, { project: false }).offsets;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const ai = anchors.get(pts[i].id), aj = anchors.get(pts[j].id), oi = ctl.get(pts[i].id), oj = ctl.get(pts[j].id);
        const g = dist(ai, aj), d = Math.hypot(aj.x + oj.x - ai.x - oi.x, aj.y + oj.y - ai.y - oi.y, aj.z + oj.z - ai.z - oi.z);
        if (bandOf(d) !== bandOf(g)) RUN.ctlViol++;
      }
    }
  }
  console.log(`     ${RUN.configs} układów × 600 klatek (${RUN.frames} klatek, ${RUN.pairs} sprawdzeń par): zmiana pasma ${RUN.bandViol}, pod podłogą ${RUN.floorViol}; `
    + `złe pasma względem logiki: z choreografią ${RUN.misChoreo}, kotwice ${RUN.misAnchor}; okna D-CV-6 ${RUN.windowViol} / ${RUN.windowChecked}; `
    + `awaryjnie połowień ${RUN.halved}, zer ${RUN.zeroed}; ŚWIADEK bez rzutu — zmian pasma ${RUN.ctlViol}`);
  assert(RUN.configs >= 15 && RUN.bandViol === 0 && RUN.floorViol === 0,
    `L4a SEDNO: po rzucie żadna para nie zmienia pasma odstępu kotwic i żadna nie schodzi pod podłogę kolizji (${RUN.pairs} sprawdzeń par)`);
  assert(RUN.misChoreo === RUN.misAnchor, `L4b złe pasma względem logiki: z choreografią ${RUN.misChoreo} == kotwice ${RUN.misAnchor} (choreografia nie dokłada żadnej)`);
  assert(RUN.ctlViol > 0, `L4c ŚWIADEK: ten sam ruch bez rzutu zmienia pasmo ${RUN.ctlViol} razy — rzut jest konieczny (pin nie jest jałowy)`);
  assert(RUN.windowChecked > 1000 && RUN.windowViol === 0, `L4d okna D-CV-6 par strzelec → cel przy parkingu broni: ${RUN.windowViol} naruszeń / ${RUN.windowChecked}`);
});
block('L5 — ciągłość przy 60 kl./s (rzut bez awaryjnego zerowania)', () => {
  const meanOff = RUN.sumOffL / Math.max(1, RUN.nOff);
  assert(RUN.frames > 0 && RUN.maxStepL <= 0.06 && RUN.halved === 0 && RUN.zeroed === 0,
    `L5a SEDNO: największy krok rysowany ${RUN.maxStepL.toFixed(4)} L / klatkę ≤ ε 0,06 L; awaryjnych połowień ${RUN.halved}, zer ${RUN.zeroed}`);
  assert(meanOff > 0.2, `L5b ŚWIADEK: ruch jest — średnie przesunięcie od kotwicy ${meanOff.toFixed(3)} L`);
});

// ═══ L6 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('L6 — (Finding 681) zwrot: rufą do celu → po czasie zwrotu dziób ku celowi (pancernik burtą); sufit skrętu', () => {
  const T = CH.CHOREO_TUNING;
  const turnS = { frigate: T.CHOREO_TURN_FRIGATE, destroyer: T.CHOREO_TURN_DESTROYER, battleship: T.CHOREO_TURN_BATTLESHIP };
  const out = {};
  for (const cls of ['frigate', 'destroyer', 'battleship']) {
    const st = CH.createChoreo(CH.choreoSeed('enc_turn', cls), cls);
    const aim = { x: 1, y: 0.1, z: 0.3 };
    const aimYaw = Math.atan2(aim.x, aim.z);
    let maxRate = 0, err0 = null, err = null;
    const tTurn = (180 / turnS[cls] + 2.5) * 1000;   // pełny zwrot przy suficie + ustalenie sprężyny
    for (let t = 0; t <= tTurn; t += DT) {
      CH.stepChoreoOffset(st, { dtMs: DT, posture: 'engage', threat: { dir: aim, gap: 4 * L }, L });
      const f = CH.stepChoreoFacing(st, { dtMs: DT, posture: 'engage', aim, initYaw: aimYaw + Math.PI, initPitch: 0 });
      maxRate = Math.max(maxRate, Math.abs(st.yawRate) * 1000 / Math.PI * 180);
      const b = CH.bowOf(f.yaw, f.pitch), al = Math.hypot(aim.x, aim.y, aim.z);
      const ang = Math.acos(Math.max(-1, Math.min(1, (b.x * aim.x + b.y * aim.y + b.z * aim.z) / al))) / Math.PI * 180;
      const e = cls === 'battleship' ? Math.abs(90 - ang) : ang;
      if (err0 == null) err0 = e;
      err = e;
    }
    out[cls] = { err0, err, maxRate, cap: turnS[cls] };
  }
  console.log(`     ${Object.entries(out).map(([k, r]) => `${k}: start ${r.err0.toFixed(0)}° → ${r.err.toFixed(1)}°, skręt maks. ${r.maxRate.toFixed(1)}°/s (sufit ${r.cap})`).join(' · ')}`);
  assert(out.frigate.err <= 20 && out.destroyer.err <= 12 && out.battleship.err <= 8,
    'L6a SEDNO: po czasie zwrotu fregata i niszczyciel dziobem ku celowi (wyprzedzenie przelotu w granicy), pancernik burtą (cel na ±90°)');
  assert(Object.values(out).every((r) => r.maxRate <= r.cap + 1e-6), 'L6b prędkość skrętu nigdy ponad sufit klasy');
  assert(out.frigate.err0 > 150 && out.destroyer.err0 > 150 && out.battleship.err0 > 60, 'L6c ŚWIADEK: na starcie rufą do celu (odchyłka ≈ 180°; pancernik ≈ 90° od burty)');
});

// ═══ L7 / L8 ══════════════════════════════════════════════════════════════════════════════════════════════════════
block('L7 / L8 — postawy (D-CV-7) i silnik', () => {
  const runPosture = (cls, posture, steps = 900) => {
    const st = CH.createChoreo(CH.choreoSeed('enc_post', cls), cls);
    const u = { x: 1, y: 0, z: 0 };
    let amp = 0, rad = 0, eng = 0, bow = 0;
    for (let k = 0; k < steps; k++) {
      const o = CH.stepChoreoOffset(st, { dtMs: DT, posture, threat: { dir: u, gap: 8 * L }, L });
      const f = CH.stepChoreoFacing(st, { dtMs: DT, posture, aim: u, initYaw: Math.PI / 2 });
      const e = CH.stepChoreoEngine(st, { dtMs: DT, posture, L });
      if (k >= steps / 2) { amp += Math.hypot(o.x, o.y, o.z) / L; rad += (o.x * u.x + o.y * u.y + o.z * u.z) / L; eng += e; }
      const b = CH.bowOf(f.yaw, f.pitch);
      bow = Math.acos(Math.max(-1, Math.min(1, b.x * u.x + b.y * u.y + b.z * u.z))) / Math.PI * 180;
    }
    const n = steps / 2;
    return { amp: amp / n, rad: rad / n, eng: eng / n, bow, st };
  };
  const eng = runPosture('frigate', 'engage'), kite = runPosture('frigate', 'kite'), hold = runPosture('frigate', 'hold'), ret = runPosture('frigate', 'retreat');
  const bsh = runPosture('battleship', 'engage');
  console.log(`     fregata: angażuj amp ${eng.amp.toFixed(3)} L, promieniowo ${eng.rad.toFixed(3)} L, silnik ${eng.eng.toFixed(2)} · kite ${kite.amp.toFixed(3)} / ${kite.rad.toFixed(3)} · `
    + `trzymaj ${hold.amp.toFixed(3)} · odwrót dziób ${ret.bow.toFixed(0)}°, silnik ${ret.eng.toFixed(2)} · pancernik silnik ${bsh.eng.toFixed(2)}`);
  assert(hold.amp < 0.4 * eng.amp, `L7a trzymaj — amplituda ${hold.amp.toFixed(3)} L < 0,4 × angażuj (${eng.amp.toFixed(3)} L)`);
  assert(kite.rad < -0.05 && eng.rad > 0.02, `L7b kite — składowa promieniowa OD celu (${kite.rad.toFixed(3)} L), angażuj — KU celowi (${eng.rad.toFixed(3)} L)`);
  assert(ret.bow > 150, `L7c odwrót — dziób od zagrożenia (${ret.bow.toFixed(0)}° od kierunku celu)`);
  const dead = CH.createChoreo(CH.choreoSeed('enc_post', 'dead'), 'frigate');
  for (let k = 0; k < 300; k++) { CH.stepChoreoOffset(dead, { dtMs: DT, posture: 'engage', threat: { dir: { x: 1, y: 0, z: 0 }, gap: 4 * L }, L }); CH.stepChoreoEngine(dead, { dtMs: DT, posture: 'engage', L }); }
  let od = null, ed = null;
  for (let k = 0; k < 600; k++) { od = CH.stepChoreoOffset(dead, { dtMs: DT, posture: 'disabled', threat: { dir: { x: 1, y: 0, z: 0 }, gap: 4 * L }, L }); ed = CH.stepChoreoEngine(dead, { dtMs: DT, posture: 'disabled', L }); }
  assert(Math.hypot(od.x, od.y, od.z) < 0.01 * L && ed < 0.01, `L7d zniszczony — przesunięcie gaśnie (${(Math.hypot(od.x, od.y, od.z) / L).toFixed(4)} L), silnik gaśnie (${ed.toFixed(4)})`);
  assert(eng.eng > bsh.eng + 0.1, `L8a fregata w przelotach jaśniejsza (${eng.eng.toFixed(2)}) od pancernika na biegu jałowym (${bsh.eng.toFixed(2)})`);
  assert(ret.eng > 0.9, `L8b odwrót — pełny ciąg (${ret.eng.toFixed(2)})`);
});

// ═══ L9 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('L9 — cel zwrotu: kolejność, martwy cel, brak żywych, remis', () => {
  const enemies = [
    { id: 'B2', alive: true, x: 2, y: 0, z: 0 }, { id: 'B1', alive: true, x: 0, y: 0, z: 2 },
    { id: 'B3', alive: false, x: 0.5, y: 0, z: 0 }, { id: 'B4', alive: true, x: 5, y: 0, z: 5 },
  ];
  const A = { x: 0, y: 0, z: 0 };
  const p = (o) => CH.pickFacingTarget({ anchor: A, enemies, ...o })?.id;
  assert(p({ eventTargetId: 'B4', prevTargetId: 'B2', engageTargetId: 'B1' }) === 'B4', 'L9a strzał z ostatniej rundy ma pierwszeństwo');
  assert(p({ prevTargetId: 'B2', engageTargetId: 'B4' }) === 'B2' && p({ engageTargetId: 'B4' }) === 'B4', 'L9b potem pamięć, potem cel „Zaangażuj”');
  assert(p({ eventTargetId: 'B3' }) === 'B1', 'L9c martwy cel pominięty; najbliższy żywy — remis odległości rozstrzyga mniejsze id (B1 przed B2)');
  const allDead = CH.pickFacingTarget({ anchor: A, enemies: enemies.map((e) => ({ ...e, alive: false })) });
  assert(allDead?.id === null && Math.abs(allDead.point.x - 1.875) < 1e-12, 'L9d brak żywych — środek wszystkich przeciwników (id null)');
  assert(CH.pickFacingTarget({ anchor: A, enemies: [] }) === null, 'L9e brak przeciwników — brak celu');
});

// ═══ L10 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('L10 — bez Math.random (§2.12-1): źródło i wykonanie', () => {
  const src = readFileSync(new URL('../../renderer/combat/ChoreographyLogic.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert(!/Math\.random/.test(code) && !/^\s*import\s/m.test(code), 'L10a źródło: zero `Math.random` i zero importów (komentarze zdjęte)');
  const base = Math.random;
  let draws = 0;
  Math.random = () => { draws++; return base(); };
  try {
    const pts = stagerLayout();
    const { sol } = anchorsOf(pts);
    const states = statesFor(pts), warm = new Map();
    for (let f = 0; f < 120; f++) {
      stepCluster(pts, sol.pos, states, warm);
      for (const st of states.values()) { CH.stepChoreoFacing(st, { dtMs: DT, posture: 'engage', aim: { x: 1, y: 0, z: 0 } }); CH.stepChoreoEngine(st, { dtMs: DT, posture: 'engage', L }); }
    }
  } finally { Math.random = base; }
  assert(draws === 0, `L10b wykonanie: 120 klatek 10 na 10 (wzór, rzut, kurs, silnik) — losowań Math.random ${draws}`);
});

// ═══ L11 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('L11 — spokój przy szybkiej kotwicy (szyk się przestawia — statki nie tańczą); przejście ciągłe', () => {
  const T11 = { ...CH.CHOREO_TUNING, CHOREO_CALM_V: 0.8 };   // pokrętło ustalone — pin mierzy mechanizm, nie wartość domyślną
  const run = (speedOf) => {
    const st = CH.createChoreo(CH.choreoSeed('enc_calm', 'CV-A01'), 'frigate');
    let amp = 0, n = 0, maxStep = 0, prev = null;
    for (let k = 0; k < 1200; k++) {
      const o = CH.stepChoreoOffset(st, { dtMs: DT, posture: 'engage', threat: { dir: { x: 1, y: 0, z: 0 }, gap: 6 * L }, L, anchorSpeedL: speedOf(k) }, T11);
      if (k >= 600) { amp += Math.hypot(o.x, o.y, o.z) / L; n++; }
      if (prev) maxStep = Math.max(maxStep, Math.hypot(o.x - prev.x, o.y - prev.y, o.z - prev.z) / L);
      prev = { ...o };
    }
    return { amp: amp / n, maxStep };
  };
  const still = run(() => 0), fast = run(() => 3), jump = run((k) => (k >= 400 && k < 700 ? 3 : 0));
  console.log(`     amplituda: kotwica stoi ${still.amp.toFixed(3)} L, kotwica 3 L/s ${fast.amp.toFixed(3)} L; skok prędkości kotwicy 0 → 3 → 0 — krok przesunięcia maks. ${jump.maxStep.toFixed(4)} L / klatkę`);
  assert(fast.amp < 0.15 * still.amp && still.amp > 0.3, `L11a kotwica 3 L/s — amplituda ${fast.amp.toFixed(3)} L < 0,15 × przy stojącej (${still.amp.toFixed(3)} L)`);
  assert(jump.maxStep <= 0.06, `L11b skok prędkości kotwicy 0 → 3 → 0 L/s — przesunięcie ciągłe (krok maks. ${jump.maxStep.toFixed(4)} L ≤ 0,06 L)`);
});

// ═══ L12 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('L12 — zmiana celu i postawy: prędkość przesunięcia ciągła (bez skoku przy przestawieniu ramy ruchu)', () => {
  const T = { ...CH.CHOREO_TUNING, CHOREO_PERIOD_FRIGATE: 1e6 };   // wzór stoi — ruszają się tylko rama ruchu i wagi postawy
  const st = CH.createChoreo(CH.choreoSeed('enc_switch', 'CV-A01'), 'frigate');
  st.ph1 = Math.PI / 2; st.ph2 = Math.PI / 2;                        // przelot i pion w szczycie — przesunięcie ≈ 0,85 koperty
  const dirA = { x: 1, y: 0, z: 0 }, dirB = { x: 0, y: 0, z: 1 };
  const out = [];
  for (let k = 0; k < 900; k++) {
    const dir = k < 300 ? dirA : dirB;              // zmiana celu w klatce 300: rama ruchu obraca się o 90°
    const posture = k < 600 ? 'engage' : 'kite';    // zmiana postawy w klatce 600
    out.push({ ...CH.stepChoreoOffset(st, { dtMs: DT, posture, threat: { dir, gap: 6 * L }, L, anchorSpeedL: 0 }, T) });
  }
  const velOf = (arr, k) => ({ x: (arr[k].x - arr[k - 1].x) / L / (DT / 1000), y: (arr[k].y - arr[k - 1].y) / L / (DT / 1000), z: (arr[k].z - arr[k - 1].z) / L / (DT / 1000) });
  const maxDv = (arr, k0, k1) => { let m = 0; for (let k = k0; k < k1; k++) { const a = velOf(arr, k), b = velOf(arr, k + 1); m = Math.max(m, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)); } return m; };
  const frameDv = maxDv(out, 296, 560), postureDv = maxDv(out, 596, 890);
  // przesunięcie w ramie przed zmianą (rama A: u = +X, s = −Z, v = +Y) i oczekiwane po obrocie (rama B: u = +Z, s = +X, v = +Y)
  const o0 = out[299], cu = o0.x, cs = -o0.z, cv = o0.y;
  const oB = out[559], dB = Math.hypot(oB.x - cs, oB.y - cv, oB.z - cu) / L;
  // ŚWIADEK: rama obracana samym sufitem FRAME_RATE_DEG (bez drugiego stopnia) — to samo przesunięcie w ramie
  const ctl = [o0];
  let u = dirA;
  for (let k = 300; k < 560; k++) {
    u = CH.rotateToward(u, dirB, CH.CHOREO.FRAME_RATE_DEG * Math.PI / 180 * DT / 1000);
    const sx = u.z, sz = -u.x, sl = Math.hypot(sx, sz) || 1;                 // s = norm(Y × u)
    const s1 = { x: sx / sl, y: 0, z: sz / sl };
    const v1 = { x: u.y * s1.z - u.z * s1.y, y: u.z * s1.x - u.x * s1.z, z: u.x * s1.y - u.y * s1.x };   // v = u × s
    ctl.push({ x: cu * u.x + cs * s1.x + cv * v1.x, y: cu * u.y + cs * s1.y + cv * v1.y, z: cu * u.z + cs * s1.z + cv * v1.z });
  }
  const ctlDv = maxDv(ctl, 1, ctl.length - 1);
  console.log(`     przesunięcie przed zmianą ${(Math.hypot(o0.x, o0.y, o0.z) / L).toFixed(3)} L; zmiana prędkości między klatkami: obrót ramy maks. ${frameDv.toFixed(3)} L/s (sam sufit ${ctlDv.toFixed(3)} L/s), zmiana postawy maks. ${postureDv.toFixed(3)} L/s; po obrocie odchyłka od przesunięcia w nowej ramie ${dB.toFixed(4)} L`);
  assert(frameDv <= 0.3, `L12a zmiana celu (rama o 90°) — zmiana prędkości przesunięcia między klatkami ${frameDv.toFixed(3)} L/s ≤ 0,3 L/s`);
  assert(postureDv <= 0.3, `L12b zmiana postawy (angażuj → kite) — zmiana prędkości między klatkami ${postureDv.toFixed(3)} L/s ≤ 0,3 L/s`);
  assert(ctlDv >= 0.8, `L12c ŚWIADEK: rama obracana samym sufitem skacze ${ctlDv.toFixed(3)} L/s ≥ 0,8 L/s (pin L12a nie jest jałowy)`);
  assert(dB <= 0.02, `L12d rama naprawdę się obróciła: przesunięcie w nowej ramie = to samo w starej (odchyłka ${dB.toFixed(4)} L ≤ 0,02 L)`);
});

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
