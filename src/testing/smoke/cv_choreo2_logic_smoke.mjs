// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_choreo2_logic_smoke — KEEPER ARC COMBAT VISUALS, krok CV-3c (decyzja właściciela 44: lot wzdłuż kursu, rozsunięcie sceny,
//   dryf wraków po bitwie). Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §3.2-44, §4 CV-3c.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// WYKONANIE (zero importów w modułach logiki — wykonują się pod node): `ChoreographyLogic.stepChoreo2Offset / stepChoreo2Facing /
//   stepChoreo2Engine` (lot), `constrainChoreo` (rzut pasm — bez zmian z CV-3b), `BattleStageLogic.solveStage({ opts: { SPREAD } })`
//   (rozsunięcie), `ExplosionLogic.wreckAfterDrift` (dryf wraku po bitwie).
// CO PINUJE (wyłącznie logika — F11; bez pinów na stałych rysunku):
//   C1 (e) determinizm: to samo ziarno i wejścia ⇒ te same pozy co do bitu; inne starcie / inny statek ⇒ inne fazy
//   C2 (d) zegar stoi ⇒ poza stoi co do bitu (przesunięcie, kwaternion, silnik, faza); po wznowieniu rusza
//   C3 koperta klasy: |przesunięcie| ≤ koperta (długie przebiegi, trzy pasma odstępu)
//   C4 SEDNO — LOT: dziób ≈ kierunek ruchu przy prędkości (kąt dziób ↔ prędkość wzoru i ↔ ruch rysowany: p95 ≤ 3°, max ≤ 20° po
//      zwrocie początkowym), wszystkie klasy, trzy pasma; ŚWIADEK: ten sam przebieg w trybie CV-3b — dziób ku celowi, ruch bokiem
//      (mediana kąta ≥ 45° — pin nie jest jałowy)
//   C5 skręt ≤ sufit klasy w każdej klatce (z zwrotem początkowym); zwrot początkowy dochodzi do ≥ połowy sufitu (ogranicznik działa)
//   C6 ciągłość: prędkość przesunięcia bez skoków — także przy zmianie celu (kierunek o 40°) i zmianie pasma odstępu (granica rundy)
//   C7 (D-CV-6) niezmiennik pasm przy rozsunięciu 1,35: losowe układy 10 na 10 + szyk stagera, 10 s przy 60 kl./s, rzut par — zero
//      zmian pasma, zero par pod podłogą; ŚWIADEK: ten sam ruch bez rzutu zmienia pasma
//   C8 postawy (D-CV-7): „trzymaj” — mniejsza pętla; odwrót — dziób od zagrożenia; zniszczony — przesunięcie i silnik gasną
//   C9 rozsunięcie sceny (decyzja 44 (2)): rozwiązanie prowadnicy przy SPREAD s == rozwiązanie przy 1 × s wokół środka; złe pasma
//      i skala awaryjna bez zmian; krawędzie pasm × s
//   C10 dryf wraku po bitwie (decyzja 44 (5)): deterministyczny, ograniczony (|przesunięcie| ≤ v₀·τ), staje (done po 5τ), od zera
//      i bez skoku prędkości na starcie, zegar stoi ⇒ stoi
//   C11 reguła §2.12-1: kod CV-3c bez `Math.random` (źródło i wykonanie z zatrutym `Math.random`)
//   C12 przenikanie trybów (renderer — przełączenie flagi): przesunięcie ciągłe przy wadze 0 → 1 (krok klatki ≤ ε)
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const CH = await tryImport('../../renderer/combat/ChoreographyLogic.js');
const SL = await tryImport('../../renderer/combat/BattleStageLogic.js');
const EX = await tryImport('../../renderer/combat/ExplosionLogic.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const block = (title, fn) => { header(title); try { fn(); } catch (e) { assert(false, `${title} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };

const L0 = 0.016, AU = 11, DT = 1000 / 60, SP = 1.35, L = L0 * SP;
const edges = SL ? SL.bandEdgesWU([0.05, 0.15, 0.30], AU) : [0.55, 1.65, 3.3];
const app = SL ? SL.apparentEdges(edges, SL.spreadLaw?.(SL.STAGE_LAW, SP) ?? SL.STAGE_LAW) : edges;
const bandOf = (d) => { for (let i = 0; i < app.length; i++) if (d <= app[i]) return i; return app.length; };
const dist = (a, b) => Math.hypot(b.x - a.x, (b.y ?? 0) - (a.y ?? 0), b.z - a.z);
const deg = (r) => r * 180 / Math.PI;
const angle = (a, b) => { const la = Math.hypot(a.x, a.y, a.z), lb = Math.hypot(b.x, b.y, b.z); return deg(Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb || 1))))); };
const pct = (arr, q) => { const b = [...arr].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * q))] : NaN; };
const CAP = { frigate: 180, destroyer: 90, battleship: 30 };
let rs = 777;
const rnd = () => { rs = (Math.imul(rs, 1103515245) + 12345) >>> 0; return rs / 4294967296; };

/** Jeden statek: pętla CV-3c wokół stałego zagrożenia (kierunek +X), kurs za prędkością wzoru. */
function flySolo(cls, gapL, { enc = 'enc_1', vid = 'X', frames = 60 * 30, posture = 'engage', dirAt = null, gapAt = null } = {}) {
  const st = CH.createChoreo(CH.choreoSeed(enc, vid + cls), cls);
  const out = [];
  let prevO = null;
  for (let k = 0; k < frames; k++) {
    const dir = dirAt ? dirAt(k) : { x: 1, y: 0, z: 0 };
    const g = (gapAt ? gapAt(k) : gapL) * L;
    const o = CH.stepChoreo2Offset(st, { dtMs: DT, posture, threat: { dir, gap: g }, L, app });
    const v = { ...st.f2.vel };
    const f = CH.stepChoreo2Facing(st, { dtMs: DT, posture, vel: v, aim: dir, L });
    const e = CH.stepChoreo2Engine(st, { dtMs: DT, posture, L, speed: Math.hypot(v.x, v.y, v.z) });
    const dv = prevO ? { x: (o.x - prevO.x) / DT, y: (o.y - prevO.y) / DT, z: (o.z - prevO.z) / DT } : null;
    out.push({ o: { ...o }, v, dv, f: { ...f, q: [...f.q] }, bow: CH.bowOf(f.yaw, f.pitch), e, yawRate: st.yawRate, phi: st.f2.phi });
    prevO = o;
  }
  return { st, out };
}

// ═══ C1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('C1 — (e) determinizm: to samo ziarno ⇒ te same pozy; inne starcie ⇒ inne fazy', () => {
  const sig = (r) => r.out.map((x) => [x.o.x, x.o.y, x.o.z, ...x.f.q, x.e]);
  const a = flySolo('frigate', 8, { frames: 600 }), b = flySolo('frigate', 8, { frames: 600 });
  const c = flySolo('frigate', 8, { frames: 600, enc: 'enc_2' }), d = flySolo('frigate', 8, { frames: 600, vid: 'Y' });
  assert(JSON.stringify(sig(a)) === JSON.stringify(sig(b)), 'C1a SEDNO: to samo ziarno i wejścia — 600 póz identycznych co do bitu');
  const diff = (p, q) => p.out.filter((x, i) => Math.hypot(x.o.x - q.out[i].o.x, x.o.y - q.out[i].o.y, x.o.z - q.out[i].o.z) > 1e-6 * L).length;
  assert(diff(a, c) > 500 && diff(a, d) > 500, `C1b inne starcie (${diff(a, c)} / 600 póz różnych) i inny statek (${diff(a, d)} / 600) — inne fazy`);
});

// ═══ C2 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('C2 — (d) zegar stoi ⇒ poza stoi co do bitu; po wznowieniu rusza', () => {
  const st = CH.createChoreo(CH.choreoSeed('enc_1', 'P1'), 'destroyer');
  const thr = { dir: { x: 1, y: 0, z: 0.1 }, gap: 8 * L };
  for (let k = 0; k < 200; k++) { CH.stepChoreo2Offset(st, { dtMs: DT, posture: 'engage', threat: thr, L, app }); CH.stepChoreo2Facing(st, { dtMs: DT, vel: st.f2.vel, aim: thr.dir, L }); CH.stepChoreo2Engine(st, { dtMs: DT, L, speed: 1e-5 }); }
  const snap = () => JSON.stringify([CH.stepChoreo2Offset(st, { dtMs: 0, posture: 'engage', threat: thr, L, app }), CH.stepChoreo2Facing(st, { dtMs: 0, vel: st.f2.vel, aim: thr.dir, L }).q,
    CH.stepChoreo2Engine(st, { dtMs: 0, L, speed: 1e-5 }), st.f2.phi, st.yaw, st.roll, st.t]);
  const s0 = snap();
  let same = true;
  for (let k = 0; k < 120; k++) if (snap() !== s0) same = false;
  assert(same, 'C2a SEDNO: 120 klatek z dt = 0 — przesunięcie, kwaternion, silnik, faza i czas identyczne co do bitu');
  const phi0 = st.f2.phi;
  CH.stepChoreo2Offset(st, { dtMs: DT, posture: 'engage', threat: thr, L, app });
  assert(st.f2.phi !== phi0, 'C2b po wznowieniu faza pętli rusza');
});

// ═══ C3 / C4 / C5 ═════════════════════════════════════════════════════════════════════════════════════════════════
const FLIGHT = {};
block('C3 / C4 / C5 — koperta, lot wzdłuż kursu, skręt ≤ sufit klasy (trzy klasy × trzy pasma, 30 s przy 60 kl./s)', () => {
  for (const cls of ['frigate', 'destroyer', 'battleship']) {
    for (const gapL of [3.49 * SP, 8.0 * SP, 13.5 * SP]) {
      const r = flySolo(cls, gapL);
      const E = CH.choreoEnvelope(cls, L);
      const vRef = r.st.f2.vRef;
      let envMax = 0, turnMax = 0, turnInMax = 0;
      const misV = [], misD = [];
      r.out.forEach((x, k) => {
        envMax = Math.max(envMax, Math.hypot(x.o.x, x.o.y, x.o.z) / E);
        if (k > 0) {
          const a = angle(r.out[k - 1].bow, x.bow) / DT * 1000;
          turnMax = Math.max(turnMax, a);
          if (k < 180) turnInMax = Math.max(turnInMax, a);
        }
        if (k > 180) {
          const sp = Math.hypot(x.v.x, x.v.y, x.v.z);
          if (sp > 0.15 * vRef) misV.push(angle(x.bow, x.v));
          const sd = x.dv ? Math.hypot(x.dv.x, x.dv.y, x.dv.z) : 0;
          if (sd > 0.15 * vRef) misD.push(angle(x.bow, x.dv));
        }
      });
      const key = `${cls}@${(gapL / SP).toFixed(1)}`;
      FLIGHT[key] = { envMax, turnMax, turnInMax, misV, misD };
      console.log(`     ${key.padEnd(17)} koperta ${envMax.toFixed(2)} E · skręt max ${turnMax.toFixed(0)}°/s (sufit ${CAP[cls]}; zwrot ${turnInMax.toFixed(0)}) · dziób↔wzór p95 ${pct(misV, 0.95).toFixed(2)}° max ${pct(misV, 1).toFixed(1)}° (n ${misV.length}) · dziób↔ruch p95 ${pct(misD, 0.95).toFixed(2)}° max ${pct(misD, 1).toFixed(1)}°`);
    }
  }
  const all = Object.values(FLIGHT);
  assert(all.every((f) => f.envMax <= 1 + 1e-9), `C3 koperta klasy: |przesunięcie| ≤ koperta w każdej klatce (największe ${Math.max(...all.map((f) => f.envMax)).toFixed(3)} E)`);
  assert(all.every((f) => f.misV.length > 600 && pct(f.misV, 0.95) <= 3 && pct(f.misV, 1) <= 20),
    `C4a SEDNO — LOT: dziób ≈ kierunek prędkości wzoru (p95 ≤ 3°, max ≤ 20°) — najgorsze p95 ${Math.max(...all.map((f) => pct(f.misV, 0.95))).toFixed(2)}°, max ${Math.max(...all.map((f) => pct(f.misV, 1))).toFixed(1)}°`);
  assert(all.every((f) => f.misD.length > 600 && pct(f.misD, 0.95) <= 3 && pct(f.misD, 1) <= 20),
    `C4b dziób ≈ kierunek RUCHU (różnica przesunięć klatek, p95 ≤ 3°, max ≤ 20°) — najgorsze p95 ${Math.max(...all.map((f) => pct(f.misD, 0.95))).toFixed(2)}°`);
  const ok5 = Object.entries(FLIGHT).every(([k, f]) => f.turnMax <= CAP[k.split('@')[0]] + 1e-6);
  assert(ok5, 'C5a skręt ≤ sufit klasy w KAŻDEJ klatce (fregata 180, niszczyciel 90, pancernik 30 °/s), zwrot początkowy wliczony');
  assert(Object.entries(FLIGHT).every(([k, f]) => f.turnInMax >= 0.5 * CAP[k.split('@')[0]]),
    'C5b ogranicznik działa: zwrot początkowy (kurs 0 → kierunek ruchu) dochodzi do ≥ połowy sufitu klasy');
});

block('C4c — ŚWIADEK: ten sam przebieg w trybie CV-3b — dziób ku celowi, ruch bokiem (pin C4 nie jest jałowy)', () => {
  const st = CH.createChoreo(CH.choreoSeed('enc_1', 'Xfrigate'), 'frigate');
  const mis = [];
  let prevO = null;
  for (let k = 0; k < 60 * 30; k++) {
    const thr = { dir: { x: 1, y: 0, z: 0 }, gap: 8 * SP * L };
    const o = CH.stepChoreoOffset(st, { dtMs: DT, posture: 'engage', threat: thr, L });
    const f = CH.stepChoreoFacing(st, { dtMs: DT, posture: 'engage', aim: thr.dir });
    if (prevO && k > 180) {
      const dv = { x: o.x - prevO.x, y: o.y - prevO.y, z: o.z - prevO.z };
      if (Math.hypot(dv.x, dv.y, dv.z) / DT > 0.1 * L / 1000) mis.push(angle(CH.bowOf(f.yaw, f.pitch), dv));
    }
    prevO = { ...o };
  }
  assert(mis.length > 300 && pct(mis, 0.5) >= 45, `C4c CV-3b: mediana kąta dziób ↔ ruch ${pct(mis, 0.5).toFixed(1)}° (≥ 45° — „suwak”, ruch bokiem)`);
});

// ═══ C6 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('C6 — ciągłość prędkości: zmiana celu (40°) i zmiana pasma odstępu (granica rundy) bez skoku', () => {
  for (const cls of ['frigate', 'destroyer', 'battleship']) {
    const r = flySolo(cls, 0, {
      frames: 60 * 20,
      dirAt: (k) => (k < 600 ? { x: 1, y: 0, z: 0 } : { x: Math.cos(0.70), y: 0, z: Math.sin(0.70) }),
      gapAt: (k) => (k < 600 ? 3.49 * SP : 8.0 * SP),
    });
    let jump = 0;
    for (let k = 2; k < r.out.length; k++) {
      const a = r.out[k - 1].dv, b = r.out[k].dv;
      if (!a || !b) continue;
      jump = Math.max(jump, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 1000 / L0);   // [L/s] skok prędkości między klatkami
    }
    console.log(`     ${cls}: największy skok prędkości między klatkami ${jump.toFixed(3)} L/s`);
    assert(jump <= 0.3, `C6 ${cls}: zmiana celu o 40° i pasma 3,49 → 8 L (× 1,35) — skok prędkości przesunięcia ≤ 0,3 L/s na klatkę (${jump.toFixed(3)})`);
  }
});

// ═══ C7 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
function stagerLayout() {
  const pts = [], HULLS = ['frigate', 'destroyer', 'battleship'];
  for (const [side, sign] of [['player', -1], ['emp', 1]]) for (let i = 0; i < 10; i++) {
    const line = Math.floor(i / 5), k = i % 5;
    pts.push({ id: `${side === 'player' ? 'A' : 'B'}${String(i + 1).padStart(2, '0')}`, side, cls: HULLS[i % 3], x: sign * (0.06 + line * 0.03) * AU, y: 0.3, z: (k - 2) * 0.035 * AU });
  }
  return pts;
}
function randomLayout(kind) {
  const pts = [], HULLS = ['frigate', 'destroyer', 'battleship'];
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
function anchorsOf(pts, spread = SP) {
  const c = { x: 0, y: 0.3, z: 0 };
  for (const p of pts) { c.x += p.x / pts.length; c.z += p.z / pts.length; }
  const pri = new Set();
  for (const p of pts) {
    let best = null, bd = Infinity;
    for (const q of pts) if (q.side !== p.side) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q; } }
    if (best) pri.add(SL.pairKey(p.id, best.id));
  }
  return SL.solveStage({ points: pts, centre: c, L: L0, edges, priority: pri, opts: { SPREAD: spread } });
}
block('C7 — (D-CV-6) niezmiennik pasm przy rozsunięciu 1,35: każda para w KAŻDEJ klatce, 10 s przy 60 kl./s', () => {
  const sets = [['stager', stagerLayout()]];
  for (const k of ['stack', 'line', 'scatter']) for (let j = 0; j < 7; j++) sets.push([k, randomLayout(k)]);
  let checks = 0, changes = 0, floorViol = 0, halved = 0, zeroed = 0, witness = 0, frames = 0, maxOffL = 0;
  for (const [, pts] of sets) {
    const sol = anchorsOf(pts);
    const anchors = sol.pos;
    const states = new Map(pts.map((p) => [p.id, CH.createChoreo(CH.choreoSeed('enc_c7', p.id), p.cls)]));
    const witnessStates = new Map(pts.map((p) => [p.id, CH.createChoreo(CH.choreoSeed('enc_c7', p.id), p.cls)]));
    const warm = new Map();
    const ids = pts.map((p) => p.id);
    const env = new Map(pts.map((p) => [p.id, CH.choreoEnvelope(p.cls, L)]));
    const pairs = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const g = dist(anchors.get(ids[i]), anchors.get(ids[j]));
      pairs.push([ids[i], ids[j], bandOf(g), Math.min(CH.CHOREO.COLLISION_L * L, g)]);
    }
    const step = (sts, project) => {
      const offsets = new Map();
      for (const p of pts) {
        const a = anchors.get(p.id);
        let best = null, bd = Infinity;
        for (const q of pts) if (q.side !== p.side) { const b = anchors.get(q.id); const d = dist(a, b); if (d < bd) { bd = d; best = b; } }
        const st = sts.get(p.id);
        const o = CH.stepChoreo2Offset(st, { dtMs: DT, posture: 'engage', threat: best ? { dir: { x: (best.x - a.x) / bd, y: (best.y - a.y) / bd, z: (best.z - a.z) / bd }, gap: bd } : null, L, app });
        offsets.set(p.id, { x: o.x, y: o.y, z: o.z });
      }
      const res = project ? CH.constrainChoreo({ ids, anchors, offsets, app, L, weights: env, envelopes: env, vertMax: CH.CHOREO_TUNING.CHOREO_VERT * L, warm }) : null;
      return { offsets, res };
    };
    for (let k = 0; k < 600; k++) {
      const { offsets, res } = step(states, true);
      frames++;
      halved += res.halved; zeroed += res.zeroed;
      const drawn = new Map(ids.map((id) => { const a = anchors.get(id), o = offsets.get(id); maxOffL = Math.max(maxOffL, Math.hypot(o.x, o.y, o.z) / L0); return [id, { x: a.x + o.x, y: a.y + o.y, z: a.z + o.z }]; }));
      for (const [i, j, b, fl] of pairs) {
        const d = dist(drawn.get(i), drawn.get(j));
        checks++;
        if (bandOf(d) !== b) changes++;
        if (d < fl - 2e-4 * L) floorViol++;
      }
      const w = step(witnessStates, false);
      const wd = new Map(ids.map((id) => { const a = anchors.get(id), o = w.offsets.get(id); return [id, { x: a.x + o.x, y: a.y + o.y, z: a.z + o.z }]; }));
      for (const [i, j, b] of pairs) if (bandOf(dist(wd.get(i), wd.get(j))) !== b) witness++;
    }
  }
  console.log(`     ${sets.length} układów × 600 klatek: ${checks} sprawdzeń par, zmian pasma ${changes}, pod podłogą ${floorViol}, połowienia ${halved}, zera ${zeroed}, największe przesunięcie ${maxOffL.toFixed(2)} L; ŚWIADEK bez rzutu — zmian pasma ${witness}`);
  assert(checks > 2e6 && changes === 0 && floorViol === 0, `C7a SEDNO: zero zmian pasma i zero par pod podłogą (${checks} sprawdzeń)`);
  assert(witness > 0, `C7b ŚWIADEK: ten sam ruch CV-3c bez rzutu zmienia pasma (${witness}) — rzut jest potrzebny, pin nie jest jałowy`);
  assert(zeroed === 0, `C7c rzut bez zerowania przesunięć (połowienia ${halved}, zera ${zeroed}) — pętla mieści się w przedziałach par`);
});

// ═══ C8 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('C8 — postawy (D-CV-7): trzymaj mniejsza pętla; odwrót dziobem od zagrożenia; zniszczony gaśnie', () => {
  const mean = (r) => r.out.slice(300).reduce((s, x) => s + Math.hypot(x.o.x, x.o.y, x.o.z), 0) / (r.out.length - 300);
  const eng = flySolo('frigate', 8 * SP), hold = flySolo('frigate', 8 * SP, { posture: 'hold' });
  assert(mean(hold) < 0.5 * mean(eng), `C8a „trzymaj”: średnie przesunięcie ${(mean(hold) / L0).toFixed(2)} L < połowa „angażuj” ${(mean(eng) / L0).toFixed(2)} L`);
  const ret = flySolo('destroyer', 8 * SP, { posture: 'retreat', frames: 300 });
  const away = ret.out.slice(-60).map((x) => angle(x.bow, { x: 1, y: 0, z: 0 }));
  assert(Math.min(...away) >= 120, `C8b odwrót: dziób od zagrożenia (kąt do kierunku zagrożenia ≥ 120°, najmniejszy ${Math.min(...away).toFixed(0)}°)`);
  const st = CH.createChoreo(CH.choreoSeed('enc_1', 'D'), 'destroyer');
  const thr = { dir: { x: 1, y: 0, z: 0 }, gap: 8 * SP * L };
  for (let k = 0; k < 300; k++) { CH.stepChoreo2Offset(st, { dtMs: DT, threat: thr, L, app }); CH.stepChoreo2Engine(st, { dtMs: DT, L, speed: st.f2.vRef }); }
  const e0 = st.engine;
  let o = null, e = 0;
  for (let k = 0; k < 600; k++) { o = CH.stepChoreo2Offset(st, { dtMs: DT, posture: 'disabled', threat: thr, L, app }); e = CH.stepChoreo2Engine(st, { dtMs: DT, posture: 'disabled', L }); }
  assert(e0 > 0.2 && Math.hypot(o.x, o.y, o.z) < 0.02 * L && e < 0.01, `C8c zniszczony: przesunięcie → ${(Math.hypot(o.x, o.y, o.z) / L0).toFixed(4)} L, silnik ${e0.toFixed(2)} → ${e.toFixed(3)}`);
});

// ═══ C9 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('C9 — rozsunięcie sceny: rozwiązanie × s wokół środka, pasma i skala awaryjna bez zmian', () => {
  assert(typeof SL?.spreadLaw === 'function', 'C9-0 `spreadLaw` istnieje');
  // Ziarno i rozwiązanie zbieżne są niezmiennicze wobec skali dokładnie (szum zmiennoprzecinkowy); gęsta KUPKA wyczerpuje przejścia
  // twarde prowadnicy (bez zbieżności), więc szum rośnie przez iterację — tam pin: te same pasma i skala awaryjna (C9b), odchyłka w raporcie.
  let maxErr = 0, maxSeed = 0, stackErr = 0, sameMis = true, sameFb = true, n = 0;
  const sets = [['stager', stagerLayout()]];
  for (const k of ['stack', 'line', 'scatter']) for (let j = 0; j < 4; j++) sets.push([k, randomLayout(k)]);
  const SEED = { PASSES: 0, HARD_PASSES: 0, PRIORITY_PASSES: 0 };
  for (const [kind, pts] of sets) {
    const a = anchorsOf(pts, 1), b = anchorsOf(pts, SP);
    const c = { x: 0, y: 0.3, z: 0 };
    for (const p of pts) { c.x += p.x / pts.length; c.z += p.z / pts.length; }
    const s0 = SL.solveStage({ points: pts, centre: c, L: L0, edges, opts: { SPREAD: 1, ...SEED } });
    const s1 = SL.solveStage({ points: pts, centre: c, L: L0, edges, opts: { SPREAD: SP, ...SEED } });
    for (const p of pts) {
      const sc = (q) => ({ x: c.x + (q.x - c.x) * SP, y: c.y + (q.y - c.y) * SP, z: c.z + (q.z - c.z) * SP });
      const e = dist(sc(a.pos.get(p.id)), b.pos.get(p.id)) / L0;
      if (kind === 'stack') stackErr = Math.max(stackErr, e); else maxErr = Math.max(maxErr, e);
      maxSeed = Math.max(maxSeed, dist(sc(s0.pos.get(p.id)), s1.pos.get(p.id)) / L0);
      n++;
    }
    if (a.misbanded !== b.misbanded) sameMis = false;
    if (a.fallback !== b.fallback) sameFb = false;
  }
  console.log(`     ${sets.length} układów, ${n} statków: odchyłka od rozwiązania × ${SP} — ziarno ${maxSeed.toExponential(2)} L, rozwiązania zbieżne ${maxErr.toExponential(2)} L, kupki ${stackErr.toExponential(2)} L`);
  assert(maxSeed < 1e-9, `C9a SEDNO: ziarno sceny przy SPREAD ${SP} == ziarno przy 1 × ${SP} wokół środka (${maxSeed.toExponential(2)} L)`);
  assert(maxErr < 1e-6, `C9a′ rozwiązanie zbieżne (szyk stagera, linie, rozrzut) przy SPREAD ${SP} == przy 1 × ${SP} (${maxErr.toExponential(2)} L)`);
  assert(sameMis && sameFb, 'C9b złe pasma i skala awaryjna identyczne przy obu rozsunięciach (niezmienniczość skali)');
  const e1 = SL.apparentEdges(edges), es = SL.apparentEdges(edges, SL.spreadLaw(SL.STAGE_LAW, SP));
  assert(e1.every((e, i) => Math.abs(es[i] - e * SP) < 1e-12), `C9c krawędzie pasm na scenie × ${SP} (${e1.map((e) => (e / L0).toFixed(2)).join(' / ')} → ${es.map((e) => (e / L0).toFixed(2)).join(' / ')} L)`);
  assert(SL.spreadLaw(SL.STAGE_LAW, 1) === SL.STAGE_LAW, 'C9d SPREAD 1 — prawo to samo obiektowo (ścieżka sprzed CV-3c)');
});

// ═══ C10 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('C10 — dryf wraku po bitwie: deterministyczny, ograniczony, staje, start od zera bez skoku, zegar stoi ⇒ stoi', () => {
  assert(typeof EX?.wreckAfterDrift === 'function', 'C10-0 `wreckAfterDrift` istnieje');
  const T = EX.EXP_TUNING;
  const tau = T.WRECK_AFTER_S, vMax = T.WRECK_AFTER_V * 1.4 * L0;
  let bounded = true, settledOk = true, det = true, startOk = true, contOk = true;
  for (let s = 0; s < 40; s++) {
    const seed = EX.explosionSeed('w', s);
    let prev = null;
    for (let t = 0; t <= 6 * tau * 1000; t += 50) {
      const d = EX.wreckAfterDrift({ seed, tMs: t, L: L0 });
      const d2 = EX.wreckAfterDrift({ seed, tMs: t, L: L0 });
      if (JSON.stringify(d) !== JSON.stringify(d2)) det = false;
      if (Math.hypot(d.x, d.y, d.z) > vMax * tau + 1e-12) bounded = false;
      if (prev && Math.hypot(d.x - prev.x, d.y - prev.y, d.z - prev.z) > vMax * 0.05 + 1e-12) contOk = false;   // 50 ms × v₀ max
      prev = d;
    }
    const d0 = EX.wreckAfterDrift({ seed, tMs: 0, L: L0 }), d1 = EX.wreckAfterDrift({ seed, tMs: 16, L: L0 });
    if (Math.hypot(d0.x, d0.y, d0.z) !== 0 || Math.hypot(d1.x, d1.y, d1.z) > vMax * 0.016 * 0.1) startOk = false;   // narastanie: pierwsza klatka ≪ v₀ · dt
    const a = EX.wreckAfterDrift({ seed, tMs: 5 * tau * 1000, L: L0 }), b = EX.wreckAfterDrift({ seed, tMs: 50 * tau * 1000, L: L0 });
    if (!a.done || Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) > 0.01 * vMax * tau || Math.abs(b.angle - a.angle) > 0.01 * Math.max(1e-9, b.angle)) settledOk = false;
  }
  assert(det, 'C10a deterministyczny (to samo ziarno i chwila ⇒ ten sam wynik co do bitu)');
  assert(bounded, `C10b ograniczony: |przesunięcie| ≤ v₀ max · τ (${(vMax * tau / L0).toFixed(2)} L) w każdej chwili, 40 wraków`);
  assert(settledOk, 'C10c staje: po 5τ `done`, dalej przesunięcie i kąt bez zmian (≤ 1 %)');
  assert(startOk && contOk, 'C10d start od zera bez skoku prędkości (narastanie) i ciągły ruch (krok 50 ms ≤ v₀ · 50 ms)');
  const seeds = new Set();
  for (let s = 0; s < 10; s++) { const d = EX.wreckAfterDrift({ seed: EX.explosionSeed('w', s), tMs: 3e5, L: L0 }); seeds.add(`${d.x.toFixed(6)}|${d.z.toFixed(6)}`); }
  assert(seeds.size === 10, 'C10e inne wraki ⇒ inne kierunki dryfu (10 / 10 różnych)');
});

// ═══ C11 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('C11 — §2.12-1: kod CV-3c bez Math.random (źródło + wykonanie z zatrutym Math.random)', () => {
  const src = readFileSync(new URL('../../renderer/combat/ChoreographyLogic.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const code = src.slice(src.indexOf('ARC CV-3c — CHOREOGRAFIA 2.0')).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const ex = readFileSync(new URL('../../renderer/combat/ExplosionLogic.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert(code.length > 2000 && !/Math\.random/.test(code) && !/Math\.random/.test(ex), 'C11a źródło: sekcja CV-3c ChoreographyLogic i ExplosionLogic bez `Math.random`');
  const orig = Math.random;
  let calls = 0;
  Math.random = () => { calls++; return orig(); };
  try { flySolo('battleship', 8 * SP, { frames: 300 }); EX.wreckAfterDrift({ seed: 5, tMs: 1234, L: L0 }); } finally { Math.random = orig; }
  assert(calls === 0, `C11b wykonanie: 300 klatek lotu i dryf wraku — ${calls} wywołań Math.random`);
});

// ═══ C12 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
block('C12 — przenikanie trybów (przełączenie flagi): przesunięcie ciągłe przy wadze 0 → 1 → 0 (jak klej renderera)', () => {
  const st = CH.createChoreo(CH.choreoSeed('enc_1', 'M'), 'frigate');
  const thr = { dir: { x: 1, y: 0, z: 0 }, gap: 8 * SP * L };
  let w = 0, prev = null, maxStep = 0;
  for (let k = 0; k < 60 * 6; k++) {
    const want = k < 120 ? 0 : k < 240 ? 1 : 0;
    w = Math.max(0, Math.min(1, w + (want ? 1 : -1) * DT / 500));
    const cin = { dtMs: DT, posture: 'engage', threat: thr, L };
    let o;
    if (!(w > 0)) o = CH.stepChoreoOffset(st, cin);
    else if (w >= 1) o = CH.stepChoreo2Offset(st, { ...cin, app });
    else { const o1 = CH.stepChoreoOffset(st, cin), o2 = CH.stepChoreo2Offset(st, { ...cin, app, skipCommon: true }); o = { x: o1.x + (o2.x - o1.x) * w, y: o1.y + (o2.y - o1.y) * w, z: o1.z + (o2.z - o1.z) * w }; }
    if (prev) maxStep = Math.max(maxStep, Math.hypot(o.x - prev.x, o.y - prev.y, o.z - prev.z) / L0);
    prev = { ...o };
  }
  // ŚWIADEK: przełączenie twarde (bez przenikania) — skok o różnicę wzorów
  const s2 = CH.createChoreo(CH.choreoSeed('enc_1', 'M'), 'frigate');
  let hard = 0, hp = null;
  for (let k = 0; k < 60 * 4; k++) {
    const cin = { dtMs: DT, posture: 'engage', threat: thr, L };
    const o = k < 120 ? CH.stepChoreoOffset(s2, cin) : CH.stepChoreo2Offset(s2, { ...cin, app });
    if (hp) hard = Math.max(hard, Math.hypot(o.x - hp.x, o.y - hp.y, o.z - hp.z) / L0);
    hp = { ...o };
  }
  assert(maxStep <= 0.12 && hard > 2 * maxStep, `C12 przenikanie CV-3b ↔ CV-3c przez 0,5 s: największy krok klatki ${maxStep.toFixed(4)} L (≤ 0,12 L; próg ciągłości kleju 0,25 L); ŚWIADEK — przełączenie twarde skacze ${hard.toFixed(3)} L`);
});

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
