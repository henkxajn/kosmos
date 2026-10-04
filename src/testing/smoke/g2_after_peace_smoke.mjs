// G2-4 — AI GARRISON: PO POKOJU (D14 i zakres R1–R7 podpisany 2026-10-03, `AI_GARRISON_PLAN.md` §5p).
//
//   A0  narzędzie: jedno źródło wrogości jednostek naziemnych (`WarGate.groundOwnersHostile`) — gracz↔imperium tylko
//       w wojnie (rozejm i NAP to nie wojna); imperium↔imperium jak przed G2-4 (poza zakresem); bez modułu dyplomacji
//       jak przed G2-4.
//   A1  R1 — pokój i rozejm: jednostki wrogich dawniej właścicieli na jednym heksie nie wymieniają ognia ani morale,
//       AI nie ściga gracza, przechwycenie i „bitwa” nie zachodzą; wojna (kontrola): walczą jak dotąd.
//   A2  R1 — pokój: jednostka gracza na obcym kaflu go nie zajmuje (pusty ani z budynkiem), jednostka AI na kaflu
//       gracza — też; wojna (kontrola): zajmuje.
//   A3  R2 — heks z żywym wrogiem: licznik okupacji stoi dla OBU stron (i rusza dalej od miejsca, w którym stanął,
//       gdy wroga nie ma); pusty kafel z żywym wrogiem nie przechodzi.
//
// ⚠ Harness: `bootWithDirector` (prawdziwa dyplomacja, wojna i pokój) + własny `CombatSystem` (GameCore go nie montuje).
//   Mobilizacja garnizonów AI (G2-3b) WYŁĄCZONA w scenach, które jej nie mierzą — wojna stawiałaby jednostki planu.
// ⚠ Każdy pin wykluczający ma ŚWIADKA (migawka sprzed akcji albo zdarzenie, które dowodzi, że scena się odbyła).
// ⚠ Symbole G2-4 ładowane jako PRZESTRZEŃ NAZW / dynamicznie: przed naprawą ich nie ma, a import nazwany wywróciłby
//   plik i żaden pin nie dostałby koloru (lekcja „pin musi degradować, nie przerywać”).

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { isStandableTile } from '../../data/GroundUnitData.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { CombatSystem } from '../../systems/CombatSystem.js';
import * as WG from '../../utils/WarGate.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Harness ──────────────────────────────────────────────────────────────────────────────
function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
}
/** Świat: domyślne ziarno, gracz w pokoju z AI, mobilizacja wyłączona, prawdziwy CombatSystem. */
function boot({ garrison = false } = {}) {
  const { core, K, ticker } = quiet(() => bootWithDirector({ quiet: true }));
  if (!garrison && K.garrisonSystem) K.garrisonSystem.enabled = false;
  K.combatSystem = new CombatSystem();
  const cm = core.colonyManager;
  const aiFull = cm.getAllColonies().filter(c => c.ownerEmpireId && !c.isOutpost);
  const home = cm.getColony(K.homePlanet.id);
  home.credits = 1e6;                                   // utrzymanie jednostek gracza nie jest przedmiotem A1–A3
  // Kafle kolonii gracza niosą 'player' — w grze stempluje je `ColonyOverlay._ensureGrid` / założenie kolonii
  // (fixture GATE-S4: 300× 'player'); uprząż zostawia `null` (wzór `ai_capture_intent_smoke`).
  for (const t of tilesOf(home)) if (t.owner == null) t.owner = 'player';
  return { core, K, ticker, cm, gum: K.groundUnitManager, dipl: K.diplomacySystem, home, aiFull,
           col: aiFull[0], emp: aiFull[0]?.ownerEmpireId };
}
const run = (w, civY) => quiet(() => w.ticker.run(civY, { tickSize: 1.0 }));
const declare = (w, emp = w.emp) => quiet(() => w.dipl.declareWar(emp, 'keeper_setup'));
/** Pokój PRAWDZIWĄ ścieżką `offerPeace` (wyczerpanie obu stron 100 ⇒ akceptacja; `terms` = warunki traktatu). */
function signPeace(w, emp = w.emp, terms = null) {
  const war = w.K.warSystem.getWarWith(emp);
  if (war) gameState.set('wars.' + war.id, { ...war, exhaustion: { player: 100, [emp]: 100 } }, 'g2_4_keeper');
  return quiet(() => w.dipl.offerPeace(emp, 'keeper_setup', { terms, playerInitiated: false }));
}
const tilesOf = (col) => (col?.grid?.toArray?.() ?? []).filter(Boolean);
const capitalOf = (col) => tilesOf(col).find(t => t.capitalBase) ?? null;
/** Wolne kafle lądowe (bez stolicy, bez jednostek), opcjonalnie z budynkiem / bez. */
function freeTiles(w, col, { building = null } = {}) {
  return tilesOf(col).filter(t => isStandableTile(t) && !t.capitalBase
    && (building === null || (building ? !!t.buildingId : !t.buildingId))
    && w.gum.getUnitsAtHex(col.planetId, t.q, t.r).length === 0);
}
/** Jednostka gracza (archetyp, właściciel gracz, płaci dom) — z wysokim morale, żeby nie uciekała w scenach R2. */
function playerUnit(w, planetId, t, { arch = 'shock_infantry', hp = null, morale = 100 } = {}) {
  const u = w.gum.createUnit(arch, planetId, t.q, t.r, { owner: 'player', factionId: 'humanity' });
  u.homeColonyId = w.home.planetId;
  if (hp != null) { u.hp = u.hpMax = u.currentHP = hp; }
  if (morale != null) { u.morale = u.maxMorale = morale; }
  return u;
}
/** Jednostka imperium (jedyne wejście `createAIUnit`). */
function aiUnit(w, emp, planetId, t, { arch = 'shock_infantry', hp = null, morale = 100 } = {}) {
  const r = w.gum.createAIUnit({ archetypeId: arch, empireId: emp, planetId, q: t.q, r: t.r, morale, deployed: true });
  const u = r?.unit ?? null;
  if (u && hp != null) { u.hp = u.hpMax = u.currentHP = hp; }
  return u;
}
function withFixedRng(fn) {
  const real = Math.random;
  Math.random = () => 0.5;
  try { return fn(); } finally { Math.random = real; }
}
const snap = (u) => (u ? { hp: u.hp, morale: u.morale, q: u.q, r: u.r } : null);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── A0 — narzędzie: jedno źródło wrogości ────────────────────────────────────────────────
{
  console.log('\nA0 — WarGate.groundOwnersHostile: gracz↔imperium tylko w wojnie; AI↔AI i brak dyplomacji — jak przed G2-4');
  const H = WG.groundOwnersHostile;
  assert(typeof H === 'function', 'A0a: WarGate eksportuje groundOwnersHostile (jedno źródło R1 dla CombatSystem i GroundUnitManager)');
  const w = boot();
  const e2 = w.aiFull.find(c => c.ownerEmpireId && c.ownerEmpireId !== w.emp)?.ownerEmpireId ?? null;
  const ask = (a, b) => (typeof H === 'function' ? H(a, b) : undefined);
  const peace = [ask('player', w.emp), ask(w.emp, 'player'), ask(null, w.emp)];
  declare(w);
  const war = [ask('player', w.emp), ask(w.emp, null)];
  const peaceOk = signPeace(w);
  const truce = [w.dipl.getStatus(w.emp), ask('player', w.emp)];
  assert(peace.every(v => v === false) && war.every(v => v === true) && peaceOk === true && truce[0] === 'truce' && truce[1] === false,
    `A0b: pokój → nie (${peace.join('/')}), wojna → tak (${war.join('/')}), rozejm po offerPeace (${truce[0]}) → nie (${truce[1]}); ` +
    'właściciel null = gracz');
  assert(ask(w.emp, w.emp) === false && ask('player', 'player') === false && ask(null, 'player') === false,
    'A0c: ten sam właściciel nigdy nie jest wrogiem (także null = gracz)');
  assert(e2 && ask(w.emp, e2) === true,
    `A0d: imperium↔imperium (${w.emp}↔${e2}) — „wrogowie” jak przed G2-4 (walka AI-vs-AI poza zakresem, Finding 331)`);
  const dip = w.K.diplomacySystem;
  w.K.diplomacySystem = null;
  const noDip = ask('player', w.emp);
  w.K.diplomacySystem = dip;
  assert(noDip === true, 'A0e: bez modułu dyplomacji (uprząż) — „wrogowie”, jak przed G2-4 (brak pokoju do honorowania)');
}

// ── A1 — R1: bez wojny nie ma ognia, pościgu ani przechwycenia ───────────────────────────
/** Jednostka gracza i jednostka imperium na JEDNYM heksie kolonii AI; prawdziwe ticki z walką. */
function fightScene(mode) {
  const w = boot();
  if (mode !== 'peace') declare(w);
  if (mode === 'truce') signPeace(w);
  const t = freeTiles(w, w.col, { building: false })[0];
  const ai = aiUnit(w, w.emp, w.col.planetId, t);
  const pl = playerUnit(w, w.col.planetId, t);
  const before = { ai: snap(ai), pl: snap(pl) };
  const attacked = [], rounds = [];
  EventBus.on('groundUnit:attacked', (e) => { if (e.targetId === ai.id || e.targetId === pl.id) attacked.push(e); });
  EventBus.on('combat:round', (e) => { if (e.planetId === w.col.planetId && e.q === t.q && e.r === t.r) rounds.push(e); });
  const contestedBefore = w.K.combatSystem.isHexContested(w.col.planetId, t.q, t.r);
  const inCombat = w.gum.isUnitInCombat(pl);
  const intercept = w.gum._interceptOnContact(pl);
  run(w, 4);
  const after = { ai: snap(w.gum.getUnit(ai.id)), pl: snap(w.gum.getUnit(pl.id)) };
  return { w, status: w.dipl.getStatus(w.emp), before, after, attacked: attacked.length, rounds: rounds.length,
           contestedBefore, inCombat, intercept };
}
{
  console.log('\nA1 — R1: pokój i rozejm — zero ognia i morale; wojna (kontrola) — walczą');
  for (const mode of ['peace', 'truce']) {
    const s = fightScene(mode);
    assert(!!s.before.ai && !!s.before.pl && s.status === (mode === 'peace' ? 'peace' : 'truce'),
      `świadek (${mode}): jednostka gracza i ${s.w.emp} na jednym heksie, status relacji ${s.status}`);
    assert(s.attacked === 0 && s.rounds === 0 && same(s.before, s.after),
      `A1a (${mode}): 4 civY obok siebie — trafień ${s.attacked}, rund bitwy ${s.rounds}, hp/morale/pozycja bez zmian ` +
      `(gracz ${JSON.stringify(s.after.pl)}, AI ${JSON.stringify(s.after.ai)})`);
    assert(s.contestedBefore === false && s.inCombat === false && s.intercept === false,
      `A1b (${mode}): heks nie jest sporny (${s.contestedBefore}), jednostka nie jest „w bitwie” (${s.inCombat}), ` +
      `przechwycenie w ruchu nie zachodzi (${s.intercept})`);
  }
  const war = fightScene('war');
  assert(war.status === 'war' && war.contestedBefore === true && war.inCombat === true && war.attacked > 0 && war.rounds > 0,
    `A1 kontrola (wojna): heks sporny, w bitwie, przechwycenie ${war.intercept}; trafień ${war.attacked}, rund ${war.rounds}`);
}
/** Jednostka imperium na kolonii GRACZA, jednostka gracza 4 heksy dalej: czy AI rusza za nią. */
function pursuitScene(mode) {
  const w = boot();
  if (mode === 'war') declare(w);
  const land = freeTiles(w, w.home, { building: false });
  const a = land[0];
  const far = land.find(t => w.gum._hexDistance(a.q, a.r, t.q, t.r) >= 4 && w.gum._hexDistance(a.q, a.r, t.q, t.r) <= 6);
  const ai = aiUnit(w, w.emp, w.home.planetId, a);
  const pl = playerUnit(w, w.home.planetId, far);
  const blocked = [];
  EventBus.on('groundUnit:territorialBlocked', (e) => { if (e.unitId === ai.id) blocked.push(e.reason); });
  const at0 = { q: ai.q, r: ai.r, d: w.gum._hexDistance(ai.q, ai.r, pl.q, pl.r) };
  run(w, 3);
  const u = w.gum.getUnit(ai.id);
  const d1 = u ? w.gum._hexDistance(u.q, u.r, pl.q, pl.r) : null;
  return { at0, moved: !!u && (u.q !== at0.q || u.r !== at0.r), d1, blocked };
}
{
  console.log('\nA1c — R1: pościg AI tylko za wrogiem; marsz terytorialny bez wojny stoi z powodem');
  const p = pursuitScene('peace');
  assert(p.at0.d >= 4 && p.moved === false && p.blocked.includes('not_at_war'),
    `A1c (pokój): jednostka imperium na kolonii gracza (dystans do gracza ${p.at0.d}) nie rusza przez 3 civY ` +
    `(ruch: ${p.moved}); powód w audycie: ${JSON.stringify([...new Set(p.blocked)])}`);
  const q = pursuitScene('war');
  assert(q.moved === true && q.d1 < q.at0.d,
    `A1c kontrola (wojna): rusza za jednostką gracza (dystans ${q.at0.d} → ${q.d1})`);
}

// ── A2 — R1: bez wojny nie ma okupacji ───────────────────────────────────────────────────
function occupyScene(mode) {
  const w = boot();
  if (mode === 'war') declare(w);
  const empty = freeTiles(w, w.col, { building: false })[0];
  const bld = freeTiles(w, w.col, { building: true })[0];
  const hEmpty = freeTiles(w, w.home, { building: false })[0];
  const pE = playerUnit(w, w.col.planetId, empty);
  const pB = playerUnit(w, w.col.planetId, bld);
  // Jednostka AI na kaflu gracza = rozłożony garnizon (nieruchomy): szturmowiec w wojnie od razu rusza marszem
  // terytorialnym na stolicę i schodzi z kafla, zanim ten tick okupacji go zobaczy.
  const aE = aiUnit(w, w.emp, w.home.planetId, hEmpty, { arch: 'garrison_unit' });
  const flips = [];
  EventBus.on('tile:ownerChanged', (e) => flips.push(e));
  const owners0 = [empty.owner, bld.owner, hEmpty.owner];
  let bldAt = null;
  for (let y = 1; y <= 8; y++) { run(w, 1); if (bldAt === null && bld.owner === 'player') bldAt = y; }
  return { owners0, owners: [empty.owner, bld.owner, hEmpty.owner], bldAt, flips: flips.length,
           alive: [pE, pB, aE].every(u => !!w.gum.getUnit(u.id)), emp: w.emp, bldId: bld.buildingId };
}
{
  console.log('\nA2 — R1: pokój — obcy kafel nie przechodzi; wojna (kontrola) — przechodzi');
  const p = occupyScene('peace');
  assert(p.alive && same(p.owners0, [p.emp, p.emp, 'player']) && !!p.bldId,
    `świadek (pokój): gracz na pustym kaflu i na kaflu z budynkiem (${p.bldId}) kolonii ${p.emp}; ${p.emp} na pustym kaflu gracza`);
  assert(same(p.owners, p.owners0) && p.flips === 0,
    `A2 (pokój): po 8 civY właściciele kafli bez zmian (${p.owners.join('/')}), tile:ownerChanged: ${p.flips}`);
  // ⚠ Kafel z budynkiem przechodzi po 6 civY od startu licznika; tick, w którym `elapsed ≥ 0,5` wypada, zależy od
  //   zaokrągleń sumy kroków `gameTime` (zmierzone: 7. albo 8. civY) — stąd przedział, a nie jedna liczba.
  const r = occupyScene('war');
  assert(r.owners[0] === 'player' && r.owners[2] === r.emp && r.bldAt !== null && r.bldAt >= 6 && r.bldAt <= 8,
    `A2 kontrola (wojna): pusty kafel AI → gracz, pusty kafel gracza → ${r.emp}, kafel z budynkiem → gracz w ${r.bldAt}. civY (właściciele ${r.owners.join("/")})`);
}

// ── A3 — R2: licznik okupacji stoi przy żywym wrogu (dla obu stron) ───────────────────────
/** Okupant sam przez `before` civY, potem żywy wróg na heksie przez `hold` civY, potem wróg znika. */
function counterScene({ side, before = 3, hold = 5, building = true }) {
  const w = boot();
  declare(w);
  const onAi = side === 'player';                       // gracz zajmuje kafel AI | AI zajmuje kafel gracza
  const col = onAi ? w.col : w.home;
  const t = freeTiles(w, col, { building })[0];
  const occOwner = onAi ? 'player' : w.emp;
  // Okupant AI = rozłożony garnizon (nieruchomy): szturmowiec po zniknięciu wroga ruszyłby marszem terytorialnym na
  // stolicę gracza i zszedł z kafla, którego licznik mierzymy.
  const occ = onAi ? playerUnit(w, col.planetId, t, { hp: 100000 })
                   : aiUnit(w, w.emp, col.planetId, t, { arch: 'garrison_unit', hp: 100000 });
  const tileOwner0 = t.owner;
  const res = withFixedRng(() => {
    run(w, before);
    const ownerMid = t.owner;
    const enemy = onAi ? aiUnit(w, w.emp, col.planetId, t, { hp: 100000 })
                       : playerUnit(w, col.planetId, t, { hp: 100000 });
    const fought = [], flips = [];
    let holding = true;
    EventBus.on('groundUnit:attacked', (e) => { if (e.targetId === enemy.id || e.targetId === occ.id) fought.push(e); });
    // Zmiany właściciela TEGO kafla w oknie z wrogiem — stan końcowy sam nie wystarcza: przed R2 obie strony
    // przewracały pusty kafel na zmianę co tick i stan po oknie wyglądał jak „bez zmian”.
    EventBus.on('tile:ownerChanged', (ev) => {
      if (holding && ev.planetId === col.planetId && ev.q === t.q && ev.r === t.r) flips.push(ev);
    });
    run(w, hold);
    holding = false;
    const ownerHold = t.owner;
    const enemyAlive = !!w.gum.getUnit(enemy.id) && !!w.gum.getUnit(occ.id);
    w.gum.removeUnit(enemy.id);
    let after = null;
    for (let y = 1; y <= 8; y++) { run(w, 1); if (t.owner === occOwner) { after = y; break; } }
    return { ownerMid, ownerHold, enemyAlive, fought: fought.length, flips: flips.length, after };
  });
  return { ...res, tileOwner0, occOwner, buildingId: t.buildingId };
}
{
  console.log('\nA3 — R2: licznik stoi przy żywym wrogu (gracz na kaflu AI i AI na kaflu gracza) i rusza od miejsca, w którym stanął');
  for (const side of ['player', 'ai']) {
    const s = counterScene({ side });
    assert(!!s.buildingId && s.ownerMid === s.tileOwner0 && s.enemyAlive && s.fought > 0,
      `świadek (${side}): okupant 3 civY sam na kaflu z budynkiem (${s.buildingId}), potem żywy wróg przez 5 civY — ` +
      `obaj żyją i walczą (trafień ${s.fought})`);
    assert(s.ownerHold === s.tileOwner0 && s.flips === 0,
      `A3a (${side}): przez 5 civY z żywym wrogiem kafel NIE przechodzi (właściciel ${s.ownerHold}, zmian ${s.flips}; ` +
      'bez R2 licznik dobiłby do 6 civY w trakcie)');
    assert(s.after !== null && s.after >= 2 && s.after <= 5,
      `A3b (${side}): po zniknięciu wroga kafel przechodzi w ${s.after}. civY — licznik ruszył od ~2–3 civY, w których ` +
      'stanął (od zera byłoby 6.–8.)');
  }
  const e = counterScene({ side: 'player', before: 0, hold: 4, building: false });
  assert(e.ownerHold === e.tileOwner0 && e.flips === 0 && e.after !== null && e.after <= 1,
    `A3c: pusty kafel AI z żywym wrogiem nie przechodzi przez 4 civY (właściciel ${e.ownerHold}, zmian ${e.flips}); ` +
    `po zniknięciu wroga — w ${e.after}. civY`);
  const c = counterScene({ side: 'player', before: 0, hold: 0 });
  assert(c.after !== null && c.after >= 6 && c.after <= 8,
    `A3 kontrola: bez wroga licznik biegnie normalnie — kafel z budynkiem przechodzi w ${c.after}. civY (od zera)`);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
