// G1b — AI GARRISON, slice G1b, S1 (Finding 309): ogień w rundzie walki naziemnej jest naprawdę JEDNOCZESNY.
//
// PO CO: `CombatSystem._runBattleRound` rozstrzygał salwę WROGA przed salwą GRACZA, a `_resolveFire`
// pomijał atakującego z hp ≤ 0. Strona AI była więc uprzywilejowana DWOMA kanałami:
//   (1) jednostka gracza zabita w salwie wroga nie oddawała strzału w tej samej rundzie,
//   (2) jednostka gracza trafiona w salwie wroga strzelała z mnożnikiem policzonym PO trafieniu
//       (`GroundUnitFactory.computeDamageMult` czyta org i morale, a każde trafienie zabiera 5 org i 3 morale).
// Potwierdzone na żywo na bramce G1 (§5, D5c): szturm vs szturm 15/15 — gracz ginie, AI przeżywa z hp 1.
// Podpisane S1 (2026-10-02): salwy obu stron liczone ze stanu z POCZĄTKU rundy, żadna strona uprzywilejowana,
// kolejność losowań RNG zachowana (najpierw salwa wroga, potem gracza).
//
//   T-A  przypadek z bramki: szturm vs szturm przy BAZOWYM morale, równe staty — po KAŻDEJ rundzie obie
//        jednostki mają identyczne hp i morale, a w rundzie śmiertelnej giną OBIE.
//   T-B  zamiana stron (kto jest graczem) nie zmienia wyniku — para ASYMETRYCZNA (okopany garnizon vs szturm),
//        żeby pin nie był trywialnie prawdziwy z samej symetrii pary.
//   T-C  jednostka trafiona w rundzie nadal zadaje w niej obrażenia RÓWNE tym, które zadałaby nietrafiona:
//        T-C1 kanał hp ≤ 0 (trafienie śmiertelne), T-C2 kanał mnożnika (trafiona, ale żywa),
//        T-C3 lustro — jednostka AI zabita w rundzie też odpowiada ogniem (naprawa nie przenosi przywileju).
//
// ⚠ Harness jak w `ground_morale_resolution_smoke` (G1): `GameCore` NIE montuje `CombatSystem`, więc stawiamy go
//   na PRAWDZIWYM `HexGrid` z PRAWDZIWYM `GroundUnitManager`; kadencja = `gum.tick(DT)` (walka raz na 1.0 civYear).
// ⚠ RNG: walka używa gołego `Math.random` — każdy scenariusz podmienia go na stały stub 0.5 (wariancja obrażeń
//   = 1.0, jitter celowania stały) i PRZYWRACA w `finally`.

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import { HexGrid } from '../../map/HexGrid.js';
import { GroundUnitManager } from '../../systems/GroundUnitManager.js';
import { CombatSystem } from '../../systems/CombatSystem.js';
import { UNIT_ARCHETYPES } from '../../data/unitArchetypes.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const PLANET = 'p_g1b';
const AI     = 'emp_g1b';
const PLAYER = 'player';
const DT     = 0.25;   // civYear na krok — 4 kroki na rundę walki

// ── Harness ──────────────────────────────────────────────────────────────────────────────

function makeWorld() {
  EventBus.clear();
  const grid = new HexGrid(14, 10);
  const colony = { planetId: PLANET, grid, ownerEmpireId: null };
  const K = window.KOSMOS;
  K.timeSystem    = { gameTime: 0 };
  K.colonyManager = {
    getColony:      (pid) => (pid === PLANET ? colony : null),
    getAllColonies: () => [colony],
  };
  const gum = new GroundUnitManager();
  const cs  = new CombatSystem();
  K.groundUnitManager = gum;
  K.combatSystem      = cs;

  const world = { grid, gum, cs, round: 0, afterRound: null,
    log: { routed: [], disbanded: [], destroyed: [], attacked: [] } };
  // Numer rundy = numer przebiegu `_runAllBattles` (jeden na 1.0 civYear); `afterRound` widzi stan PO rundzie.
  const runAll = cs._runAllBattles.bind(cs);
  cs._runAllBattles = () => { world.round++; runAll(); world.afterRound?.(world); };
  const L = world.log;
  EventBus.on('groundUnit:routed',    (e) => L.routed.push({ ...e, round: world.round }));
  EventBus.on('groundUnit:disbanded', (e) => L.disbanded.push({ ...e, round: world.round }));
  EventBus.on('groundUnit:destroyed', (e) => L.destroyed.push({ ...e, round: world.round }));
  EventBus.on('groundUnit:attacked',  (e) => L.attacked.push({ ...e, round: world.round }));

  // Środek siatki — kafel z sześcioma sąsiadami.
  const all = grid.toArray();
  const cq = all.reduce((s, t) => s + t.q, 0) / all.length;
  const cr = all.reduce((s, t) => s + t.r, 0) / all.length;
  world.hex = all.reduce((b, t) => (Math.hypot(t.q - cq, t.r - cr) < Math.hypot(b.q - cq, b.r - cr) ? t : b), all[0]);
  return world;
}

function spawn(world, type, owner, { deployed = false, morale = null, hp = null } = {}) {
  const opts = { owner, factionId: owner === PLAYER ? 'humanity' : owner };
  if (hp != null) opts.hp = hp;
  const u = world.gum.createUnit(type, PLANET, world.hex.q, world.hex.r, opts);
  if (!u) throw new Error(`spawn ${type} nieudany`);
  if (deployed) { u.deployState = 'deployed'; u.stateTimer = 0; world.gum._applyDeployStateStats(u); }
  if (morale != null) { u.morale = morale; if (u.maxMorale != null) u.maxMorale = Math.max(u.maxMorale, morale); }
  return u;
}

function drive(world, W, stop = null) {
  let t = 0;
  while (t < W - 1e-9) {
    world.gum.tick(DT);
    t += DT;
    window.KOSMOS.timeSystem.gameTime = t / 12;   // lata WYŚWIETLANE (CIV_TIME_SCALE 12)
    if (stop && stop(world)) break;
  }
  return t;
}

function withFixedRng(fn) {
  const real = Math.random;
  Math.random = () => 0.5;
  try { return fn(); } finally { Math.random = real; }
}

const alive  = (w, u) => w.gum._units.has(u.id) && (u.hp ?? 0) > 0;
const hitsOn = (w, u, round) => w.log.attacked.filter(e => e.targetId === u.id && e.round === round).length;
const dmgTo  = (w, u, round) => w.log.attacked.filter(e => e.targetId === u.id && e.round === round)
  .reduce((s, e) => s + (e.damage ?? 0), 0);

// ── T-A — przypadek z bramki: szturm vs szturm, bazowe morale ──────────────────────────────
console.log('T-A — szturm vs szturm przy bazowym morale: identyczne hp/morale po każdej rundzie, obie giną razem');
{
  const r = withFixedRng(() => {
    const w = makeWorld();
    const p = spawn(w, 'shock_infantry', PLAYER);
    const e = spawn(w, 'shock_infantry', AI);
    const start = { pHp: p.hp, eHp: e.hp, pMor: p.morale, eMor: e.morale, pOrg: p.org, eOrg: e.org };
    const rounds = [];
    w.afterRound = (ww) => rounds.push({ round: ww.round, pAlive: alive(ww, p), eAlive: alive(ww, e),
      pHp: p.hp, eHp: e.hp, pMor: p.morale, eMor: e.morale });
    drive(w, 20, (ww) => !alive(ww, p) || !alive(ww, e));
    return { w, p, e, start, rounds };
  });
  const base = UNIT_ARCHETYPES.shock_infantry.baseMorale;
  assert(r.start.pMor === base && r.start.eMor === base && r.start.pHp === r.start.eHp && r.start.pOrg === r.start.eOrg,
    `T-A: start równy (hp ${r.start.pHp}/${r.start.eHp}, morale ${r.start.pMor}/${r.start.eMor} = bazowe ${base}, ` +
    `org ${r.start.pOrg}/${r.start.eOrg})`);
  const bothAlive = r.rounds.filter(x => x.pAlive && x.eAlive);
  const mismatch = bothAlive.filter(x => x.pHp !== x.eHp || x.pMor !== x.eMor);
  assert(bothAlive.length >= 2 && mismatch.length === 0,
    `T-A: po każdej rundzie z obiema żywymi hp i morale IDENTYCZNE (rund: ${bothAlive.length}, rozjazdy: ` +
    `${JSON.stringify(mismatch.map(x => ({ r: x.round, hp: `${x.pHp}/${x.eHp}`, mor: `${x.pMor}/${x.eMor}` })))})`);
  const lethal = r.rounds.find(x => !x.pAlive || !x.eAlive);
  const deadP = r.w.log.destroyed.find(d => d.unitId === r.p.id);
  const deadE = r.w.log.destroyed.find(d => d.unitId === r.e.id);
  assert(!!lethal && !lethal.pAlive && !lethal.eAlive && deadP?.round === lethal.round && deadE?.round === lethal.round,
    `T-A SEDNO: w rundzie śmiertelnej (${lethal?.round ?? '—'}) giną OBIE (gracz: ${deadP ? 'r' + deadP.round : 'żyje, hp ' + r.p.hp}, ` +
    `AI: ${deadE ? 'r' + deadE.round : 'żyje, hp ' + r.e.hp}) — przed naprawą ginął gracz, a AI przeżywało`);
  assert(r.w.log.routed.length === 0 && r.w.log.disbanded.length === 0,
    `T-A: walka do końca, bez ucieczek i rozpadów (routed=${r.w.log.routed.length}, disbanded=${r.w.log.disbanded.length}) — ` +
    'scena mierzy ogień, nie morale');
}

// ── T-B — zamiana stron nie zmienia wyniku ───────────────────────────────────────────────
console.log('T-B — zamiana stron (kto jest graczem) nie zmienia wyniku; para asymetryczna');
{
  const outcome = (garrisonOwner, shockOwner) => withFixedRng(() => {
    const w = makeWorld();
    const g = spawn(w, 'garrison_unit', garrisonOwner, { deployed: true, morale: 100 });
    const s = spawn(w, 'shock_infantry', shockOwner, { morale: 100 });
    const trace = [];
    w.afterRound = (ww) => trace.push(`${ww.round}:${alive(ww, g) ? g.hp : 'x'}/${alive(ww, s) ? s.hp : 'x'}`);
    drive(w, 30, (ww) => !alive(ww, g) || !alive(ww, s));
    const dead = [!alive(w, g) && 'garrison', !alive(w, s) && 'shock'].filter(Boolean).join('+') || 'none';
    return { dead, round: w.log.destroyed[0]?.round ?? null, trace: trace.join(' '), routs: w.log.routed.length };
  });
  const a = outcome(PLAYER, AI);   // gracz = garnizon
  const b = outcome(AI, PLAYER);   // gracz = szturm
  assert(a.dead !== 'none' && a.round >= 2 && a.routs === 0,
    `T-B: scena się rozstrzyga i trwa > 1 rundy (ginie: ${a.dead}, runda ${a.round}) — pin nie mierzy ciszy`);
  assert(a.dead === b.dead && a.round === b.round && a.trace === b.trace,
    `T-B SEDNO: wynik NIE zależy od tego, kto jest graczem — gracz=garnizon: [${a.trace}] ginie ${a.dead}; ` +
    `gracz=szturm: [${b.trace}] ginie ${b.dead}`);
}

// ── T-C — trafiona jednostka zadaje obrażenia jak nietrafiona ────────────────────────────
console.log('T-C — jednostka trafiona w rundzie zadaje w niej obrażenia równe tym, które zadałaby nietrafiona');
{
  // Runda 1: P (szturm) vs E (szturm, hp 400, morale 100 — przeżywa i nie ucieka). `harmless` = E nie zadaje
  // obrażeń (dmg 0), czyli P jest NIETRAFIONY — to jest kontrola „jak nietrafiona".
  const round1 = ({ pOwner, eOwner, pHp = null, pMorale = null, harmless = false }) => withFixedRng(() => {
    const w = makeWorld();
    const p = spawn(w, 'shock_infantry', pOwner, { hp: pHp, morale: pMorale });
    const e = spawn(w, 'shock_infantry', eOwner, { hp: 400, morale: 100 });
    if (harmless) e.baseStats = { ...e.baseStats, dmg: 0 };
    drive(w, 1.0);
    return { hitsOnP: hitsOn(w, p, 1), pDiedR1: w.log.destroyed.some(d => d.unitId === p.id && d.round === 1),
             dmgP: dmgTo(w, e, 1) };
  });

  // T-C1 — kanał hp ≤ 0: P z hp 1 ginie w rundzie 1, a mimo to strzela.
  const lethal  = round1({ pOwner: PLAYER, eOwner: AI, pHp: 1 });
  const ctrl1   = round1({ pOwner: PLAYER, eOwner: AI, pHp: 1, harmless: true });
  assert(lethal.hitsOnP === 1 && lethal.pDiedR1,
    `T-C1: P trafiony i zabity w rundzie 1 (trafień ${lethal.hitsOnP}, zginął ${lethal.pDiedR1}) — scena realnie zabija`);
  assert(ctrl1.hitsOnP === 0 && ctrl1.dmgP > 0,
    `T-C1 KONTROLA: nietrafiony P zadaje w rundzie 1 ${ctrl1.dmgP} obrażeń (trafień w P: ${ctrl1.hitsOnP})`);
  assert(lethal.dmgP === ctrl1.dmgP,
    `T-C1 SEDNO: P zabity w rundzie zadał w niej ${lethal.dmgP} = tyle, co nietrafiony (${ctrl1.dmgP}) — ` +
    'przed naprawą 0 (`_resolveFire` pomijał atakującego z hp ≤ 0)');

  // T-C2 — kanał mnożnika: P trafiony, ale żywy. Morale 10 dobrane tak, by trafienie (−5 org, −3 morale)
  // przewracało zaokrąglenie obrażeń (5 → 4) — inaczej pin mierzyłby ciszę zaokrąglenia.
  const hit    = round1({ pOwner: PLAYER, eOwner: AI, pMorale: 10 });
  const ctrl2  = round1({ pOwner: PLAYER, eOwner: AI, pMorale: 10, harmless: true });
  assert(hit.hitsOnP === 1 && !hit.pDiedR1,
    `T-C2: P trafiony w rundzie 1 i żywy (trafień ${hit.hitsOnP}, zginął ${hit.pDiedR1})`);
  assert(hit.dmgP === ctrl2.dmgP && ctrl2.dmgP > 0,
    `T-C2 SEDNO: trafiony P zadał ${hit.dmgP} = tyle, co nietrafiony (${ctrl2.dmgP}) — przed naprawą mniej ` +
    '(mnożnik czytany PO trafieniu wroga)');

  // T-C3 — lustro: jednostka AI zabita w rundzie też odpowiada ogniem (żadna strona nie jest uprzywilejowana).
  const aiLethal = round1({ pOwner: AI, eOwner: PLAYER, pHp: 1 });
  const aiCtrl   = round1({ pOwner: AI, eOwner: PLAYER, pHp: 1, harmless: true });
  assert(aiLethal.pDiedR1 && aiLethal.dmgP === aiCtrl.dmgP && aiCtrl.dmgP > 0,
    `T-C3: jednostka AI zabita w rundzie 1 zadała ${aiLethal.dmgP} = tyle, co nietrafiona (${aiCtrl.dmgP}) — ` +
    'naprawa nie przenosi przywileju na gracza');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
