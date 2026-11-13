// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_orbital_logic_smoke — KEEPER ARC COMBAT VISUALS, krok CV-8a (powtórka bitwy orbitalnej; plan §2.8, D-CV-25 / D-CV-26,
// Finding 628). Czysta logika `src/renderer/combat/OrbitalReplayLogic.js` + prawdziwy `BattleSystem.resolveBattle` (osie tur M1)
// + prawdziwy rejestr salw `CombatLedgerLogic` (ten sam, który rysuje powtórkę). Bez renderera, bez świata gry.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// PINY:
//   O1 liczba rund (M1): klamra [MIN, MAX], podłoga z liczby statków, T ≥ N — scalanie, T < N — rozkładanie; mapa tur pokrywa
//      każdą turę dokładnie raz (suma wag tury = 1), T = 0 — rundy puste
//   O2 powtórka deterministyczna per `battleId` (ten sam JSON); inne `battleId` — inne zdarzenia (ziarno działa)
//   O3 REGUŁA EAH: zniszczenia WYŁĄCZNIE skazanych (wygrywa A → wszyscy obrońcy, wygrywa B → wszyscy napastnicy, remis przez
//      wzajemne zniszczenie → obie strony, pat → nikt), każde dokładnie raz (jedno zdarzenie `killed`)
//   O4 bez strzału okrętu po jego rundzie zniszczenia; strzelec zabity w rundzie — jego strzały tej rundy przed trafieniem
//      zabijającym (rejestr: 0 naruszeń)
//   O5 obrażenia tury i strony rozłożone CAŁE: suma kadłuba / osłony zdarzeń rundy = budżet rundy; budżet = logiczny + nadwyżka −
//      odrzucone; suma budżetów logicznych = spadek HP strony z osi tur
//   O6 ocaleni nie giną i kończą ≥ 1 HP (podłoga)
//   O7 emitery: wyłącznie przy obronie (wieża / siatka / żeton) i hangarze; liczba z poziomów; każde id zdarzenia = członek albo emiter
//   O8 okręty w hangarze: emiter hangarowy przypisany, strzelają jako one same (rejestr pilnuje kolejności zniszczenia)
//   O9 pat (strażnik M1 / bezpiecznik 200 tur) → zero zniszczeń, zero zdarzeń `killed`
//   O10 rejestr salw na rundach powtórki: 0 naruszeń, zniszczenia rejestru = zaplanowane, po końcu wszystkie pokazane
//   O11 formacja sceny planety: obrońcy na skorupie > promień + 2 L, napastnicy dalej, liczby, bez NaN; emitery — wektory
//       jednostkowe w stożku wokół kierunku bitwy, nad horyzontem
//   O12 bramka widoku (Finding 628): inny układ / galaktyka / brak układu — bez powtórki, ten sam układ — tak
//   O13 kadencja broni (jak DSCS): rakiety strzelają rzadziej niż lasery
// KONTROLE: każdy pin wykluczający ma świadka (niepusty zbiór skazanych, niepusta lista zdarzeń, niepusta lista emiterów).
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
import '../headless/env.js';
import { resolveBattle, playerVesselsToBattleUnit } from '../../systems/BattleSystem.js';
import { HULLS } from '../../data/HullsData.js';
import { SHIP_MODULES } from '../../data/ShipModulesData.js';
import { cvBattleLayout } from '../../debug/CvBattleStager.js';
import * as ORB from '../../renderer/combat/OrbitalReplayLogic.js';
import { CombatLedger } from '../../renderer/combat/CombatLedgerLogic.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l); } };
const guard = (label, fn) => { try { fn(); } catch (e) { fail++; console.log(`  ✗ ${label}: WYJĄTEK ${e?.message ?? e}`); } };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// Okręt powtórki z szyku stagera (HP kadłuba jak BattleSystem, osłona i broń z modułów).
const shipOf = (x, id, hangar = false) => {
  let shield = 0, regen = 0; const weapons = [];
  for (const m of x.modules) { const s = SHIP_MODULES[m]?.stats; if (!s) continue; if (s.shieldHP) shield += s.shieldHP; if (s.shieldRegen) regen += s.shieldRegen; if (s.damage != null) weapons.push({ category: s.category, damage: s.damage, moduleId: m }); }
  return { id, hpStart: HULLS[x.hull]?.baseHP ?? 50, shieldStart: shield, shieldRegen: regen, weapons, hangar, hull: x.hull, modules: x.modules };
};

/** Bitwa orbitalna jak w EnemyAttackHandler (agregaty BattleSystem) + powtórka. */
function scenario({ nA, nB, tower = 0, grid = 0, hangar = 0, seed = 1, battleId = null, random = 1, fixA = null, fixB = null }) {
  const L = cvBattleLayout({ nA, nB: Math.max(1, nB), seed, random });
  const A = (fixA ?? L.ships.filter((x) => x.side === 'A')).map((x, i) => shipOf(x, `A${i}`));
  const B = nB ? (fixB ?? L.ships.filter((x) => x.side === 'B')).map((x, i) => shipOf(x, `B${i}`, i < hangar)) : [];
  const ua = playerVesselsToBattleUnit(A.map((a) => ({ hullId: a.hull, modules: a.modules })), HULLS, SHIP_MODULES, 'A');
  let ub = playerVesselsToBattleUnit(B.map((a) => ({ hullId: a.hull, modules: a.modules })), HULLS, SHIP_MODULES, 'B');
  const defHP = 40 * tower + 100 * grid;
  let token = false, poolHp = defHP;
  if (B.length && defHP) ub = { ...ub, hp: ub.hp + defHP, armor: ub.armor + tower + 2 * grid, weapons: [...ub.weapons, { damage: 5 * tower + 10 * grid, tracking: 0.6 }] };
  else if (!B.length && defHP) ub = { hp: defHP, shieldHP: 0, armor: tower + 2 * grid, evasion: 0.05, techMult: 1, morale: 1, weapons: [{ damage: 5 * tower + 10 * grid, tracking: 0.6 }] };
  else if (!B.length) { ub = { hp: 30, shieldHP: 0, armor: 0, evasion: 0.02, techMult: 1, morale: 0.8, weapons: [{ damage: 2, tracking: 0.5 }] }; token = true; poolHp = 30; }
  const result = resolveBattle(ua, ub, { seed: seed * 7919 + 3 });
  const sideHp = { A: ua.hp, B: ub.hp };
  const rep = ORB.buildOrbitalReplay({ battleId: battleId ?? `b_${nA}_${nB}_${tower}_${grid}_${hangar}_${seed}`, result, attackers: A, defenders: B,
    defence: { tower, grid, token, poolHp }, sideHp });
  return { A, B, result, rep, sideHp, ua, ub };
}

const SCEN = [
  { nA: 5, nB: 5, tower: 2, grid: 1, hangar: 1, seed: 1 },
  { nA: 6, nB: 4, tower: 2, grid: 1, hangar: 1, seed: 2 },
  { nA: 10, nB: 10, tower: 0, grid: 0, hangar: 0, seed: 3 },
  { nA: 10, nB: 10, tower: 0, grid: 0, hangar: 0, seed: 1 },
  { nA: 2, nB: 2, seed: 2 },
  { nA: 1, nB: 0, seed: 1 },
  { nA: 10, nB: 0, tower: 3, grid: 3, seed: 2 },
  { nA: 3, nB: 2, tower: 1, hangar: 2, seed: 3 },
].map((s) => ({ s, ...scenario(s) }));

console.log('O1 — liczba rund i mapa tur (M1)');
guard('O1', () => {
  const T = ORB.ORB_TUNING;
  assert(ORB.orbitalRoundCount({ turns: 200, ships: 20 }) === T.ORB_ROUNDS_MAX, `O1a: bezpiecznik 200 tur, 10 na 10 → ${T.ORB_ROUNDS_MAX} rund (≈ 41 s przy 1150 ms)`);
  assert(ORB.orbitalRoundCount({ turns: 2, ships: 1 }) === T.ORB_ROUNDS_MIN, `O1b: 2 tury, jeden rajder → ${T.ORB_ROUNDS_MIN} rund (podłoga)`);
  assert(ORB.orbitalRoundCount({ turns: 3, ships: 4 }) === Math.round(T.ORB_ROUNDS_BASE + T.ORB_ROUNDS_PER_SHIP * 4), 'O1c: 2 na 2 — podłoga z liczby statków (8 + 1,4 · 4 = 14)');
  assert(ORB.orbitalRoundCount({ turns: 25, ships: 4 }) === 25, 'O1d: T w przedziale — runda = tura');
  for (const [Tn, N] of [[150, 36], [36, 36], [5, 12], [1, 14], [0, 12]]) {
    const map = ORB.orbitalTurnMap(Tn, N);
    const w = new Array(Tn).fill(0);
    let ok = map.length === N;
    for (const r of map) for (const { t, w: ww } of r) { if (t < 1 || t > Tn) ok = false; else w[t - 1] += ww; }
    ok = ok && w.every((x) => near(x, 1, 1e-9));
    if (Tn >= N && Tn > 0) ok = ok && map.every((r) => r.length >= 1 && r.every((x) => x.w === 1));
    if (Tn === 0) ok = ok && map.every((r) => r.length === 0);
    assert(ok, `O1e: mapa T=${Tn} → N=${N}: każda tura raz (waga 1), ${Tn >= N ? 'scalanie ciągłe' : Tn === 0 ? 'puste' : 'rozkładanie'}`);
  }
});

console.log('O2 — determinizm per battleId');
guard('O2', () => {
  const a = scenario({ ...SCEN[0].s, battleId: 'battle_x_1' }).rep, b = scenario({ ...SCEN[0].s, battleId: 'battle_x_1' }).rep;
  const c = scenario({ ...SCEN[0].s, battleId: 'battle_x_2' }).rep;
  // id emiterów / puli zawierają battleId (`orb:<id>:eN`) — porównanie BEZ prefiksu, żeby różnicę dawało wyłącznie ziarno
  const ev = (r) => JSON.stringify(r.roundList.map((x) => x.events)).split(r.encounterId + ':').join('');
  assert(JSON.stringify(a) === JSON.stringify(b), 'O2a: ta sama bitwa (battleId, oś tur) → ta sama powtórka co do JSON');
  assert(ev(a) !== ev(c) && a.roundList.some((x) => x.events.length), 'O2b: inne battleId → inne zdarzenia (ziarno = skrót battleId); świadek: zdarzenia są');
  // ⚠ id emiterów niosą battleId, a kadencja broni liczy fazę z id strzelca — różnicę daje też samo id. Rozstrzyga scena BEZ emiterów
  //   (bez obrony i hangaru): tam różnicę może dać wyłącznie ziarno (bateria mutantów: stałe ziarno przeżywało O2b z emiterami).
  const d1 = scenario({ ...SCEN[2].s, battleId: 'battle_y_1' }).rep, d2 = scenario({ ...SCEN[2].s, battleId: 'battle_y_2' }).rep;
  assert(!d1.emitters.length && ev(d1) !== ev(d2), 'O2d: scena bez emiterów — inne battleId → inne zdarzenia (wyłącznie z ziarna)');
  assert(a.seed === ORB.orbitalSeed('battle_x_1') && a.encounterId === 'orb:battle_x_1', 'O2c: ziarno i id starcia z battleId (`orb:` — rozłączne z DSCS)');
});

console.log('O3 / O4 / O6 — reguła EAH, zniszczenia raz, bez strzału po zniszczeniu, ocaleni żyją');
guard('O3', () => {
  let witnessDoomed = 0, witnessBothWinners = new Set();
  for (const { s, A, B, rep, result } of SCEN) {
    const d = ORB.orbitalDoomed(result);
    const want = [...(d.A ? A.map((a) => a.id) : []), ...(d.B ? B.map((b) => b.id) : [])].sort();
    const got = Object.keys(rep.kills).sort();
    const killEv = {};
    const killRound = {};
    let after = 0, survivorDead = 0;
    for (const rd of rep.roundList) {
      for (const e of rd.events) {
        if (killRound[e.attacker] != null && rd.round > killRound[e.attacker]) after++;
        if (e.killed) killEv[e.target] = (killEv[e.target] ?? 0) + 1;
      }
      for (const [id, k] of Object.entries(rep.kills)) if (k === rd.round) killRound[id] = k;
    }
    const last = rep.roundList[rep.roundList.length - 1]?.after ?? {};
    for (const id of [...A, ...B].map((x) => x.id)) if (!want.includes(id) && !(last[id]?.hp >= 1)) survivorDead++;
    witnessDoomed += want.length;
    witnessBothWinners.add(result.winner);
    const tag = `${s.nA}v${s.nB} t${s.tower ?? 0}g${s.grid ?? 0}h${s.hangar ?? 0} (wygrywa ${result.winner}${result.retreated ? ', odwrót ' + result.retreated : ''})`;
    assert(JSON.stringify(got) === JSON.stringify(want), `O3: ${tag} — zniszczenia = reguła EAH (${got.length})`);
    assert(Object.values(killEv).every((n) => n === 1) && Object.keys(killEv).length === got.length, `O3: ${tag} — każde zniszczenie dokładnie jednym zdarzeniem`);
    assert(after === 0, `O4: ${tag} — 0 strzałów okrętu po jego rundzie zniszczenia`);
    assert(survivorDead === 0, `O6: ${tag} — ocaleni kończą ≥ 1 HP`);
  }
  assert(witnessDoomed > 0 && witnessBothWinners.has('A') && witnessBothWinners.has('B'), `O3 ŚWIADEK: skazanych ${witnessDoomed}, wygrane obu stron (${[...witnessBothWinners]})`);
});

console.log('O3b — skazani giną także, gdy ostatnie tury nie niosą obrażeń kadłuba');
guard('O3b', () => {
  const tl = [{ turn: 1, aHP: 100, bHP: 400, aShield: 0, bShield: 0, dmgA: 200, dmgB: 0 }];
  for (let t = 2; t <= 20; t++) tl.push({ turn: t, aHP: 100, bHP: 400, aShield: 0, bShield: 0, dmgA: 0, dmgB: 0 });
  const res = { winner: 'B', retreated: 'A', endReason: 'retreat', timeline: tl };
  const rep = ORB.buildOrbitalReplay({ battleId: 'zero_tail', result: res,
    attackers: [{ id: 'A0', hpStart: 150, weapons: [{ category: 'short', damage: 5 }] }, { id: 'A1', hpStart: 150, weapons: [{ category: 'short', damage: 5 }] }],
    defenders: [{ id: 'B0', hpStart: 400, weapons: [{ category: 'medium', damage: 8 }] }], sideHp: { A: 300, B: 400 } });
  assert(Object.keys(rep.kills).sort().join() === 'A0,A1', `O3b: kadłub tylko w 1. turze, 19 tur bez obrażeń — obaj napastnicy zniszczeni w powtórce (${JSON.stringify(rep.kills)})`);
});

console.log('O5 — obrażenia rozłożone całe');
guard('O5', () => {
  for (const { s, rep, result, sideHp } of SCEN) {
    let sums = true, budg = true, shBudg = true, nonEmpty = 0;
    const tot = { A: 0, B: 0 };
    for (const rd of rep.roundList) {
      for (const side of ['A', 'B']) {
        const evs = rd.events.filter((e) => e.hit && rep.members[e.target]?.side === side);
        nonEmpty += evs.length;
        const h = evs.reduce((a, e) => a + e.dmg, 0), sh = evs.reduce((a, e) => a + e.blockedByShield, 0);
        const b = rd.budget[side];
        if (!near(h, b.hull, 1e-5) || !near(sh, b.shield, 1e-5)) sums = false;
        if (!near(b.hull, b.hullLogical + b.excess - b.dropped, 1e-5)) budg = false;
        if (!near(b.shield + b.shieldDropped, b.shieldLogical, 1e-5)) shBudg = false;
        tot[side] += b.hullLogical;
      }
    }
    const tag = `${s.nA}v${s.nB}`;
    assert(sums && nonEmpty > 0, `O5a: ${tag} — suma kadłuba / osłony zdarzeń = budżet rundy (świadek: ${nonEmpty} trafień)`);
    assert(budg, `O5b: ${tag} — budżet = logiczny + nadwyżka − odrzucone`);
    assert(shBudg, `O5d: ${tag} — osłona rundy cała na trafieniach albo jawnie odrzucona (osłona zdarzeń + odrzucona = logiczna)`);
    const lostA = sideHp.A - (result.timeline.at(-1)?.aHP ?? sideHp.A), lostB = sideHp.B - (result.timeline.at(-1)?.bHP ?? sideHp.B);
    assert(near(tot.A, lostA, 1e-6) && near(tot.B, lostB, 1e-6), `O5c: ${tag} — suma budżetów logicznych = spadek HP stron z osi tur (A ${tot.A.toFixed(0)}/${lostA}, B ${tot.B.toFixed(0)}/${lostB})`);
  }
});

console.log('O7 / O8 — emitery i hangar');
guard('O7', () => {
  const pre = 'orb:x:';
  const none = ORB.orbitalEmitters({ prefix: pre, defence: {}, hangarIds: [] });
  const def = ORB.orbitalEmitters({ prefix: pre, defence: { tower: 5, grid: 2 }, hangarIds: ['h1', 'h2'] });
  const tok = ORB.orbitalEmitters({ prefix: pre, defence: { token: true }, hangarIds: [] });
  assert(none.length === 0, 'O7a: bez obrony i hangaru — zero emiterów');
  assert(def.filter((e) => e.kind === 'tower').length === 3 && def.filter((e) => e.kind === 'grid').length === 2 && def.filter((e) => e.kind === 'hangar').length === 2,
    `O7b: wieża 5 → 3 emitery (ORB_TOWER_EMITTERS), siatka 2 → 2, hangar 2 → 2 (${def.map((e) => e.kind)})`);
  assert(def.filter((e) => e.kind === 'tower').reduce((a, e) => a + e.weapons[0].damage, 0) === 25 && def.filter((e) => e.kind === 'grid').reduce((a, e) => a + e.weapons[0].damage, 0) === 20,
    'O7c: obrażenia emiterów = obrażenia budynków (wieża 5 / poziom, siatka 10 / poziom)');
  assert(tok.length === 1 && tok[0].kind === 'token', 'O7d: obrona żetonowa — jeden emiter');
  for (const { s, rep } of SCEN) {
    const ids = new Set([...Object.keys(rep.members), ...rep.emitters.map((e) => e.id)]);
    const bad = rep.roundList.flatMap((r) => r.events).filter((e) => !ids.has(e.attacker) || !ids.has(e.target));
    const hasDef = (s.tower ?? 0) + (s.grid ?? 0) > 0 || s.nB === 0;
    assert(bad.length === 0, `O7e: ${s.nA}v${s.nB} — każde id zdarzenia = członek albo emiter`);
    assert(hasDef === rep.emitters.some((e) => e.kind !== 'hangar') && (rep.poolId != null) === hasDef, `O7f: ${s.nA}v${s.nB} — emitery obrony i pula ⇔ obrona (${hasDef})`);
    for (const id of Object.keys(rep.members)) {
      const m = rep.members[id];
      if (m.kind === 'hangar') assert(!!m.emitter && rep.emitters.find((e) => e.id === m.emitter)?.kind === 'hangar', `O8: ${s.nA}v${s.nB} — ${id} w hangarze: emiter hangarowy ${m.emitter}`);
    }
  }
  const hang = SCEN.find((x) => (x.s.hangar ?? 0) > 0);
  const hid = Object.keys(hang.rep.members).find((id) => hang.rep.members[id].kind === 'hangar');
  assert(hang.rep.roundList.some((r) => r.events.some((e) => e.attacker === hid)), `O8 ŚWIADEK: okręt w hangarze ${hid} strzela jako on sam (emiter tylko jako punkt wylotu)`);
});

console.log('O9 — pat (strażnik M1 / bezpiecznik)');
guard('O9', () => {
  const fleet = (hp, weapons, extra = {}) => ({ hp, shieldHP: 0, armor: 0, evasion: 0.1, techMult: 1, morale: 1, weapons, ...extra });
  const r0 = resolveBattle(fleet(100, []), fleet(100, []), { seed: 1 });
  const r1 = resolveBattle(fleet(100, [{ damage: 2, tracking: 0.7 }]), fleet(100, [], { shieldHP: 100, shieldRegen: 50 }), { seed: 1 });
  const mk = (r) => ORB.buildOrbitalReplay({ battleId: 'pat_' + r.endReason, result: r,
    attackers: [{ id: 'A0', hpStart: 100, weapons: r === r1 ? [{ category: 'short', damage: 2 }] : [] }],
    defenders: [{ id: 'B0', hpStart: 100, shieldStart: 100, shieldRegen: 50, weapons: [] }], defence: {} });
  for (const r of [r0, r1]) {
    const rep = mk(r);
    assert(rep.stalemate && Object.keys(rep.kills).length === 0 && !rep.roundList.some((x) => x.events.some((e) => e.killed)),
      `O9: pat (${r.endReason}, tur ${r.turns}) — zero zniszczeń i zdarzeń killed, rund ${rep.rounds}`);
  }
  assert(mk(r1).roundList.some((x) => x.events.length > 0), 'O9 ŚWIADEK: pat z bronią — strzały są (wszystkie bez skutku)');
});

console.log('O10 — rejestr salw na rundach powtórki');
guard('O10', () => {
  for (const { s, rep } of SCEN) {
    const led = new CombatLedger({});
    let now = 0;
    for (const rd of rep.roundList) { led.addRound({ encounterId: rep.encounterId, round: rd.round, seed: rep.seed, events: rd.events, nowMs: now, roundMs: 1150 }); now += 1150; led.advance(now); }
    led.advance(now + 10000);
    const st = led.encounterStats(rep.encounterId) ?? led.stats;
    const planned = Object.keys(rep.kills).length;
    assert(led.stats.violations === 0 && st.kills === planned && st.killsShown === planned && !led.hasPending([rep.encounterId]),
      `O10: ${s.nA}v${s.nB} — rejestr: 0 naruszeń, zniszczenia ${st.kills} = plan ${planned}, pokazane ${st.killsShown}, nic nie czeka`);
  }
});

console.log('O11 — formacja sceny planety i emitery');
guard('O11', () => {
  const L = 0.016;
  for (const [bodyR, nA, nB] of [[0.08, 10, 10], [0.4, 6, 4], [0.02, 1, 0]]) {
    const f = ORB.orbitalFormation({ bodyR, L, spread: 1.5, nA, nB, bearing: 0.7, seed: 9 });
    const rad = (p) => Math.hypot(p.x, p.z);
    const okB = f.B.every((p) => rad(p) >= bodyR + 2 * L - 1e-9);
    const okA = f.A.every((p) => rad(p) > f.rB && Number.isFinite(p.x + p.y + p.z));
    assert(f.A.length === nA && f.B.length === nB && okB && okA, `O11a: ciało ${bodyR} — ${nA} napastników na łuku ${f.rA.toFixed(3)} > skorupa ${f.rB.toFixed(3)} ≥ promień + 2 L`);
  }
  const dirs = ORB.orbitalEmitterDirs({ n: 6, bearing: 1.0, seed: 4 });
  const cone = ORB.ORB_TUNING.ORB_BATTERY_CONE_DEG * Math.PI / 180;
  const ok = dirs.every((d) => near(Math.hypot(d.x, d.y, d.z), 1, 1e-9) && d.y > 0 && Math.acos(Math.max(-1, Math.min(1, (d.x * Math.cos(1) + d.z * Math.sin(1)) / Math.hypot(d.x, d.z)))) <= cone + 1e-6);
  assert(dirs.length === 6 && ok, 'O11b: emitery — wektory jednostkowe nad horyzontem, w stożku wokół kierunku bitwy');
  const b1 = ORB.orbitalBearing({ bodyX: 5, bodyZ: 0, seed: 1 });
  const dev = Math.abs(((b1 - Math.PI + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  assert(dev <= ORB.ORB_TUNING.ORB_BEARING_JITTER_DEG * Math.PI / 180 + 1e-9, 'O11c: kierunek bitwy ku gwieździe (strona dzienna) ± rozrzut z ziarna');
});

console.log('O12 — bramka widoku (Finding 628)');
guard('O12', () => {
  assert(ORB.orbitalReplayInView({ battleSystemId: 'sys_a', activeSystemId: 'sys_a' }) === true, 'O12a: ten sam układ — powtórka');
  assert(ORB.orbitalReplayInView({ battleSystemId: 'sys_a', activeSystemId: 'sys_b' }) === false, 'O12b: inny układ — bez powtórki (baner)');
  assert(ORB.orbitalReplayInView({ battleSystemId: 'sys_a', activeSystemId: 'sys_a', galaxy: true }) === false, 'O12c: tryb galaktyki — bez powtórki');
  assert(ORB.orbitalReplayInView({ battleSystemId: null, activeSystemId: 'sys_a' }) === false, 'O12d: brak układu bitwy — bez powtórki');
});

console.log('O13 — kadencja broni');
guard('O13', () => {
  const lone = (cat, dmg) => ({ id: 'A0', hpStart: 500, weapons: [{ category: cat, damage: dmg, moduleId: null }] });
  const fake = { winner: 'draw', endReason: 'safety_cap', timeline: Array.from({ length: 24 }, (_, i) => ({ turn: i + 1, aHP: 500, bHP: 500, aShield: 0, bShield: 0, dmgA: 0, dmgB: 0 })) };
  const shots = (cat) => ORB.buildOrbitalReplay({ battleId: 'cad', result: fake, attackers: [lone(cat, 5)], defenders: [{ id: 'B0', hpStart: 500, weapons: [] }] })
    .roundList.reduce((a, r) => a + r.events.filter((e) => e.attacker === 'A0').length, 0);
  const sL = shots('short'), sK = shots('medium'), sM = shots('long');
  assert(sL > sK && sK > sM && sM > 0, `O13: laser ${sL} > kinetyk ${sK} > rakieta ${sM} strzałów w 24 rundach (kadencja 1 / 2 / 4)`);
});

console.log(`\ncv_orbital_logic_smoke: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
