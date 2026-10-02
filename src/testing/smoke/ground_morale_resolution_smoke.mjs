// G1 — AI GARRISON, slice G1: naprawa morale walki naziemnej (decyzja D5, podpisana 2026-10-01).
//
// PO CO: audyt G0 (HEAD ffb7b10) zmierzył, że walka naziemna świeżych jednostek się NIE
// rozstrzyga — morale jest tu dźwignią, a silnik walki jest zdrowy (kontrola: przy morale 100
// te same starcia kończą się poprawnie). Trzy defekty, trzy podpisane decyzje:
//   D5a  jednostki DEFENSYWNE nigdy się nie wycofują — wyjątek `unit.role !== 'defense'`
//        (CombatSystem) był MARTWY: instancja nosi lustro legacy `'defensive'`
//        (`mapRoleToLegacy`), a legacy garnizon ma `'defensive'` w danych.
//   D5b  Finding 65 — jeden wspólny default dla BRAKUJĄCEGO pola `morale` (100, wartość, której
//        używały już miejsca odczytu) we WSZYSTKICH miejscach odczytu, odejmowania i dodawania.
//        Bez tego jednostka legacy (desant AI z `INVASION_UNIT_POOLS`) ginęła z morale_collapse
//        od PIERWSZEGO trafienia, a po serialize→restore — już nie.
//   D5c  próg odwrotu PONIŻEJ najniższego `baseMorale` archetypu (podpisane: 5). Przy progu 20
//        sześć z siedmiu archetypów uciekało już przy spawnie. Morale ma dalej znaczenie:
//        jednostka z wyższym morale wytrzymuje więcej trafień.
//
//   T1  D5a — jednostka defensywna przy bazowym morale NIE ucieka, w OBU modelach (archetyp
//       `garrison_unit`/`aa_platform` i legacy `garrison`). Kontrola: jednostka NIE-defensywna
//       o tym samym HP i morale w tej samej scenie UCIEKA (inaczej pin mierzyłby ciszę).
//   T4  KONTROLA — pary z morale 100 rozstrzygają się IDENTYCZNIE przed i po naprawie (wartości
//       zmierzone na HEAD ffb7b10 tym samym harnessem i tym samym stubem RNG).
//
// ⚠ Plik rośnie razem z commitami slice'u — każdy commit przypina WŁASNĄ decyzję:
//   C1 (D5a) — T1, T4 · C2 (D5b) — + T2, T7 · C3 (D5c) — + T3, T5, T6.
//
// ⚠ Harness: `GameCore` NIE montuje `CombatSystem` — stawiamy go tu sami, na PRAWDZIWYM
//   `HexGrid` (prostokąt równin, `defenseBonus` 1.0) i prawdziwym `GroundUnitManager`.
//   Kadencja = dokładnie to, co robi listener `time:tick`: `gum.tick(DT)` — ruch co krok,
//   walka raz na 1.0 civYear (`_tickCombatAI` → `CombatSystem.tick`), z POŚCIGIEM AI.
// ⚠ RNG: walka używa gołego `Math.random`. Każdy scenariusz podmienia go na stały stub 0.5
//   (wariancja obrażeń = 1.0, jitter celowania stały) i PRZYWRACA w `finally` — wynik zależy
//   wyłącznie od arytmetyki, nie od liczby wywołań losowania gdzie indziej.
// ⚠ Strona AI strzela w rundzie PIERWSZA (`_runBattleRound` rozstrzyga ogień wroga przed ogniem
//   gracza, a jednostka zabita w pierwszej salwie nie oddaje strzału). Asercje uwzględniają to
//   jako stan zastany — to NIE jest przedmiot tego slice'u.

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import EventBus from '../../core/EventBus.js';
import { HexGrid } from '../../map/HexGrid.js';
import { GroundUnitManager } from '../../systems/GroundUnitManager.js';
// ⚠ Import PRZESTRZENI NAZW, nie nazwany: symbole tego slice'u (`MORALE_RETREAT_THRESHOLD`,
//   `DEFAULT_MORALE`, `isDefensiveUnit`) przed naprawą nie istnieją — nazwany import wywróciłby
//   CAŁĄ suitę na linkowaniu ESM i żaden pin nie dostałby koloru (lekcja fail-first).
import * as CombatMod from '../../systems/CombatSystem.js';
import * as ArchData from '../../data/unitArchetypes.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', '..');

const PLANET = 'p_g1';
const AI     = 'emp_g1';
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
  const cs  = new CombatMod.CombatSystem();
  K.groundUnitManager = gum;
  K.combatSystem      = cs;

  const world = { grid, gum, cs, round: 0,
    log: { routed: [], disbanded: [], destroyed: [], attacked: [], resolved: [] } };
  // Numer rundy = numer przebiegu `_runAllBattles` (jeden na 1.0 civYear). Zdarzenia rundy
  // padają WEWNĄTRZ przebiegu, więc stempel `world.round` jest numerem rundy, w której zaszły.
  const runAll = cs._runAllBattles.bind(cs);
  cs._runAllBattles = () => { world.round++; runAll(); };
  const L = world.log;
  EventBus.on('groundUnit:routed',    (e) => L.routed.push({ ...e, round: world.round }));
  EventBus.on('groundUnit:disbanded', (e) => L.disbanded.push({ ...e, round: world.round }));
  EventBus.on('groundUnit:destroyed', (e) => L.destroyed.push({ ...e, round: world.round }));
  EventBus.on('groundUnit:attacked',  (e) => L.attacked.push({ ...e, round: world.round }));
  EventBus.on('combat:hexResolved',   (e) => L.resolved.push({ ...e, round: world.round }));

  // Środek siatki — kafel z sześcioma sąsiadami (jest dokąd uciekać).
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
  if (deployed) {                         // garnizon w obronie stoi OKOPANY (staty trybu deployed)
    u.deployState = 'deployed'; u.stateTimer = 0;
    world.gum._applyDeployStateStats(u);
  }
  if (morale != null) {                   // morale ustawione wprost (jak po trafieniach / po technologii)
    u.morale = morale;
    if (u.maxMorale != null) u.maxMorale = Math.max(u.maxMorale, morale);
  }
  return u;
}

/** Krokuj świat `gum.tick(DT)` przez co najwyżej `W` civYears. `stop(world)` kończy wcześniej. */
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

/** Uruchom scenariusz pod stałym stubem RNG; ZAWSZE przywróć prawdziwe `Math.random`. */
function withFixedRng(fn) {
  const real = Math.random;
  Math.random = () => 0.5;
  try { return fn(); } finally { Math.random = real; }
}

const alive    = (w, u) => w.gum._units.has(u.id) && (u.hp ?? 0) > 0;
const routsOf  = (w, u) => w.log.routed.filter(e => e.unitId === u.id);
const hitsOn   = (w, u, uptoRound = Infinity) => w.log.attacked.filter(e => e.targetId === u.id && e.round <= uptoRound).length;
const bothGone = (w, a, b) => !alive(w, a) || !alive(w, b);

// ── T1 — D5a: jednostka defensywna NIE ucieka (oba modele) ────────────────────────────────
console.log('T1 — D5a: jednostka DEFENSYWNA przy bazowym morale nie ucieka (archetyp + legacy)');
{
  // T1a: archetyp `garrison_unit` (okopany) — gracz broni się przed szturmem AI.
  const r = withFixedRng(() => {
    const w = makeWorld();
    const g = spawn(w, 'garrison_unit', PLAYER, { deployed: true });
    const s = spawn(w, 'shock_infantry', AI);
    const start = { q: g.q, r: g.r };
    const off = [];
    drive(w, 30, (ww) => {
      if (alive(ww, g) && (g.q !== start.q || g.r !== start.r)) off.push({ round: ww.round, at: [g.q, g.r] });
      return !alive(ww, g);
    });
    return { w, g, s, off };
  });
  assert(r.g.role === 'defensive' && ArchData.UNIT_ARCHETYPES.garrison_unit.role === 'defense',
    `T1a: instancja niesie lustro legacy \`${r.g.role}\`, archetyp ma \`${ArchData.UNIT_ARCHETYPES.garrison_unit.role}\` — ` +
    'dlatego wyjątek pisany pod jedną nazwę był martwy');
  assert(hitsOn(r.w, r.g) >= 2,
    `T1a: garnizon został trafiony ${hitsOn(r.w, r.g)}× — scena realnie go zużywa (nie mierzymy ciszy)`);
  assert(routsOf(r.w, r.g).length === 0 && r.off.length === 0,
    `T1a SEDNO: garnizon NIE uciekł ani razu (routed=${routsOf(r.w, r.g).length}, zejścia z heksu=` +
    `${JSON.stringify(r.off.slice(0, 3))}) — przed naprawą uciekał już w RUNDZIE 1`);

  // T1b: archetyp `aa_platform` (druga rola 'defense').
  const r2 = withFixedRng(() => {
    const w = makeWorld();
    const aa = spawn(w, 'aa_platform', PLAYER);
    spawn(w, 'shock_infantry', AI);
    drive(w, 30, (ww) => !alive(ww, aa));
    return { w, aa };
  });
  assert(hitsOn(r2.w, r2.aa) >= 2 && routsOf(r2.w, r2.aa).length === 0,
    `T1b: \`aa_platform\` trafiona ${hitsOn(r2.w, r2.aa)}×, ucieczek ${routsOf(r2.w, r2.aa).length} — druga rola obronna też chroniona`);

  // T1c: legacy `garrison` (rola 'defensive' w GROUND_UNITS) z morale zużytym do 10.
  const r3 = withFixedRng(() => {
    const w = makeWorld();
    const g = spawn(w, 'garrison', PLAYER, { morale: 10 });
    spawn(w, 'shock_infantry', AI);
    drive(w, 30, (ww) => !alive(ww, g));
    return { w, g };
  });
  assert(r3.g.archetypeId === undefined && r3.g.role === 'defensive',
    'T1c: legacy garnizon nie ma archetypu, rola z danych to `defensive` — drugi model');
  assert(hitsOn(r3.w, r3.g) >= 2 && routsOf(r3.w, r3.g).length === 0,
    `T1c SEDNO: legacy garnizon trafiony ${hitsOn(r3.w, r3.g)}×, ucieczek ${routsOf(r3.w, r3.g).length} — ` +
    'przed naprawą uciekał od PIERWSZEGO trafienia (7 ≤ próg, a `defensive` !== `defense`)');

  // KONTROLA PINU: ta sama scena, to samo HP i morale, ale jednostka NIE-defensywna — UCIEKA.
  const c = withFixedRng(() => {
    const w = makeWorld();
    const x = spawn(w, 'shock_infantry', PLAYER, { hp: 100, morale: 10 });
    spawn(w, 'shock_infantry', AI);
    drive(w, 30, (ww) => routsOf(ww, x).length > 0 || !alive(ww, x));
    return { w, x };
  });
  assert(routsOf(c.w, c.x).length > 0,
    `T1 KONTROLA PINU: szturm gracza (hp 100, morale 10) w tej samej scenie UCIEKA (runda ` +
    `${routsOf(c.w, c.x)[0]?.round ?? '—'}) — więc „0 ucieczek" garnizonu to wyjątek, nie brak walki`);

  // T1d: predykat — jedno źródło odpowiedzi „czy jednostka jest defensywna" dla obu modeli.
  const isDef = ArchData.isDefensiveUnit;
  const probe = withFixedRng(() => {
    const w = makeWorld();
    const mk = (t) => spawn(w, t, PLAYER);
    return {
      garrison_unit: mk('garrison_unit'), aa_platform: mk('aa_platform'), garrison: mk('garrison'),
      shock_infantry: mk('shock_infantry'), rocket_artillery: mk('rocket_artillery'),
      medic_unit: mk('medic_unit'), infantry: mk('infantry'), science_rover: mk('science_rover'),
    };
  });
  const verdict = typeof isDef === 'function'
    ? Object.fromEntries(Object.entries(probe).map(([k, u]) => [k, isDef(u)]))
    : null;
  assert(!!verdict && verdict.garrison_unit && verdict.aa_platform && verdict.garrison,
    `T1d: \`isDefensiveUnit\` = true dla garrison_unit / aa_platform / legacy garrison (${JSON.stringify(verdict)})`);
  assert(!!verdict && !verdict.shock_infantry && !verdict.rocket_artillery && !verdict.medic_unit &&
         !verdict.infantry && !verdict.science_rover,
    'T1d: …i false dla szturmu, artylerii, medyka, legacy piechoty i łazika (wyjątek nie rozlewa się na resztę)');
}

// ── T4 — KONTROLA: pary z morale 100 bez zmian ───────────────────────────────────────────
console.log('T4 — KONTROLA: pary z morale 100 rozstrzygają się identycznie przed i po naprawie');
{
  // Wartości zmierzone na HEAD ffb7b10 (przed naprawą) tym harnessem i stubem RNG 0.5.
  const BASE = {
    'shock_vs_shock':    { round: 2, dead: 'P', survivorHp: 7 },
    'garrisonDep_vs_shock': { round: 4, dead: 'AI', survivorHp: 9 },
  };
  const run = (label, playerType, deployed) => withFixedRng(() => {
    const w = makeWorld();
    const p = spawn(w, playerType, PLAYER, { deployed, morale: 100 });
    const e = spawn(w, 'shock_infantry', AI, { morale: 100 });
    drive(w, 30, (ww) => bothGone(ww, p, e));
    const dead = !alive(w, p) ? 'P' : (!alive(w, e) ? 'AI' : null);
    return { label, round: w.log.destroyed[0]?.round ?? null, dead,
             survivorHp: dead === 'P' ? e.hp : (dead === 'AI' ? p.hp : null),
             routs: w.log.routed.length, disb: w.log.disbanded.length };
  });
  for (const got of [run('shock_vs_shock', 'shock_infantry', false), run('garrisonDep_vs_shock', 'garrison_unit', true)]) {
    const exp = BASE[got.label];
    assert(got.round === exp.round && got.dead === exp.dead && got.survivorHp === exp.survivorHp &&
           got.routs === 0 && got.disb === 0,
      `T4 [${got.label}]: runda ${got.round}, ginie ${got.dead}, ocalały hp ${got.survivorHp}, ucieczek ${got.routs} ` +
      `(baseline HEAD: runda ${exp.round}, ginie ${exp.dead}, hp ${exp.survivorHp}, 0 ucieczek)`);
  }
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
