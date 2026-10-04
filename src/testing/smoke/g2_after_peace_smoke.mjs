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
//   A4  R3/R4/R5 — pokój (prawdziwe `offerPeace`): jednostki gracza na ciele drugiej strony dostają flagę z terminem
//       6 miesięcy, jednostki AI na ciałach gracza znikają od razu, kampania desantu gaśnie bez „Desant odparty”,
//       wpis w Dzienniku (ile, gdzie, termin); karta jednostki pokazuje flagę i termin; montaż i audyt.
//   A6  R3/R5 — termin: miesiąc wcześniej JEDNO ostrzeżenie (Dziennik + dzwonek), w terminie jednostka usunięta jak
//       polegli — POP ścieżką śmierci do kolonii macierzystej, JEDEN wpis w Dzienniku.
//   A5  R6 (Findings 353, 354) — załadunek z cudzego ciała zostaje w ładowni (także bez żołdu), flaga zdjęta;
//       żołd płaci kolonia gracza (dom jednostki albo kolonia macierzysta gracza), nigdy kolonia AI.
//   A7  R3 (Finding 358) — cesja ciała z jednostką gracza na rzecz AI: flaga.
//   A8  R7 (Finding 358) — zniszczone ciało: jednostka gracza znika, pełny koszt POP wraca do domu od razu.
//   A8d R7 — ciało BEZ kolonii (zniszczenie przez `EntityManager.remove`): jednostka gracza znika, POP do domu;
//       ciało Z kolonią zniszczone tą samą drogą — jedno usunięcie (bez podwójnego śladu).
//   A9  zapis → wczytanie zachowuje flagę i termin (archetyp i legacy); starszy zapis bez pola — czysto.
//   A10 garnizon zmobilizowanego imperium i oflagowane jednostki gracza na tych samych heksach — przez 6 civY pokoju
//       zero ognia; w terminie znikają tylko jednostki gracza.
//
// ⚠ Harness: `bootWithDirector` (prawdziwa dyplomacja, wojna i pokój) + własny `CombatSystem` (GameCore go nie montuje).
//   Mobilizacja garnizonów AI (G2-3b) WYŁĄCZONA w scenach, które jej nie mierzą — wojna stawiałaby jednostki planu.
// ⚠ Każdy pin wykluczający ma ŚWIADKA (migawka sprzed akcji albo zdarzenie, które dowodzi, że scena się odbyła).
// ⚠ Symbole G2-4 ładowane jako PRZESTRZEŃ NAZW / dynamicznie: przed naprawą ich nie ma, a import nazwany wywróciłby
//   plik i żaden pin nie dostałby koloru (lekcja „pin musi degradować, nie przerywać”).

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import debugLog from '../../core/DebugLog.js';
import EntityManager from '../../core/EntityManager.js';
import { isStandableTile } from '../../data/GroundUnitData.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { CombatSystem } from '../../systems/CombatSystem.js';
import { EventLogSystem } from '../../systems/EventLogSystem.js';
import { NotificationCenter } from '../../systems/NotificationCenter.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { t } from '../../i18n/i18n.js';
import * as WG from '../../utils/WarGate.js';

let WSmod = null;
try { WSmod = await import('../../systems/WithdrawalSystem.js'); } catch { WSmod = null; }
let UCmod = null;
try { UCmod = await import('../../ui/UnitCardPanel.js'); } catch { UCmod = null; }
let VSmod = null;
try { VSmod = await import('../../entities/Vessel.js'); } catch { VSmod = null; }

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
  // Dziennik i dzwonek (GameCore ich nie montuje; po boocie, bo boot czyści EventBus — wzór `ground_unit_loss_smoke`).
  K.eventLogSystem = new EventLogSystem();
  K.notificationCenter = new NotificationCenter();
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

// ── Narzędzia R3–R5 ──────────────────────────────────────────────────────────────────────
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const flagOf = (w, id) => w.gum.getUnit(id)?.withdrawal ?? null;
const journal = (w, re) => (w.K.eventLogSystem?.getEntries?.() ?? []).filter(e => re.test(e.text));
const bell = (w, type) => (w.K.notificationCenter?.getActive?.() ?? []).filter(n => n.type === type);
const lockOf = (colony) => colony?.civSystem?._lockedPerStrata?.laborer ?? 0;
/** Jednostka gracza zrekrutowana PRAWDZIWĄ ścieżką (POP zablokowane w domu, `homeColonyId`) — wzór `ground_unit_loss`. */
function recruit(w, archetypeId = 'shock_infantry') {
  const cm = w.cm, colony = w.home;
  cm._getBarracksLevel = () => 1;                       // bramki koszar — nie są przedmiotem testu
  cm._getBarracksSlots = () => 3;
  const cost = { ...(ColonyManager.GROUND_UNIT_BUILD_COSTS[archetypeId] ?? {}),
                 ...(ColonyManager.GROUND_UNIT_COMMODITY_COSTS[archetypeId] ?? {}) };
  for (const [k, v] of Object.entries(cost)) colony.resourceSystem.receive({ [k]: v });
  const before = new Set(w.gum._units.keys());
  const r = quiet(() => cm.startGroundUnitBuild(colony.planetId, archetypeId));
  if (!r?.ok) throw new Error(`rekrutacja ${archetypeId} odrzucona: ${JSON.stringify(r)}`);
  quiet(() => cm._tickGroundUnitBuilds(ColonyManager.GROUND_UNIT_BUILD_TIMES[archetypeId] ?? 5));
  const id = [...w.gum._units.keys()].find(k => !before.has(k));
  if (!id) throw new Error(`rekrutacja ${archetypeId}: jednostka nie powstała`);
  const u = w.gum.getUnit(id);
  u.morale = u.maxMorale = 100;
  return u;
}
const moveTo = (u, col, t) => { u.planetId = col.planetId; u.q = t.q; u.r = t.r; return u; };
function domTexts(el, out = []) {
  if (!el) return out;
  if (typeof el.textContent === 'string' && el.textContent) out.push(el.textContent);
  for (const c of el.children ?? []) domTexts(c, out);
  return out;
}

// ── A4 — R3/R4/R5: pokój ustawia flagę, zdejmuje jednostki AI, zamyka desant ─────────────
{
  console.log('\nA4 — pokój: flaga z terminem na jednostkach gracza, jednostki AI z ciał gracza znikają, desant gaśnie bez „odparty”');
  const w = boot();
  const WS = WSmod?.WithdrawalSystem;
  assert(typeof WS === 'function' && w.K.withdrawalSystem instanceof WS,
    `A4a: GameCore montuje K.withdrawalSystem (instancja WithdrawalSystem: ${!!WS && w.K.withdrawalSystem instanceof WS})`);
  const gsrc = strip(readFileSync(new URL('../../scenes/GameScene.js', import.meta.url), 'utf8'));
  const iImp = gsrc.search(/import\s*\{\s*WithdrawalSystem\s*\}\s*from\s*'\.\.\/systems\/WithdrawalSystem\.js'/);
  const iNew = gsrc.search(/this\.withdrawalSystem\s*=\s*new\s+WithdrawalSystem\(\s*\)/);
  const iMnt = gsrc.search(/window\.KOSMOS\.withdrawalSystem\s*=\s*this\.withdrawalSystem/);
  const iRes = gsrc.search(/gameState\.restore\(\s*c4x\.gameState\s*\)/);
  assert(iImp >= 0 && iNew >= 0 && iMnt >= 0 && iRes > 0 && iNew < iRes && iMnt < iRes,
    `A4a: GameScene importuje, konstruuje i wystawia withdrawalSystem przed blokiem wczytania (${iImp}/${iNew}/${iMnt} < ${iRes})`);

  declare(w);
  const land = freeTiles(w, w.col, { building: false });
  const p1 = playerUnit(w, w.col.planetId, land[0]);
  const p2 = playerUnit(w, w.col.planetId, land[1]);
  const pHome = playerUnit(w, w.home.planetId, freeTiles(w, w.home, { building: false })[0]);
  const inv = quiet(() => w.K.invasionSystem.launchInvasion(w.emp, w.home.planetId, 2));
  const aiBefore = w.gum.getUnitsOnPlanet(w.home.planetId).filter(u => u.owner === w.emp).map(u => u.id);
  const campaign = () => w.K.invasionSystem.listAll().find(i => i.planetId === w.home.planetId && i.aggressor === w.emp) ?? null;
  const repelled = [];
  EventBus.on('invasion:repelled', (e) => repelled.push(e));
  assert(inv?.success === true && aiBefore.length >= 1 && campaign()?.active === true && !flagOf(w, p1.id),
    `świadek: wojna, ${aiBefore.length} jednostek ${w.emp} na kolonii gracza (aktywny desant), 2 jednostki gracza na ${w.col.planetId}, bez flag`);

  const t0 = w.K.timeSystem.gameTime;
  const ok = signPeace(w);
  const f1 = flagOf(w, p1.id), f2 = flagOf(w, p2.id);
  assert(ok === true && w.dipl.getStatus(w.emp) === 'truce',
    `świadek: pokój przez offerPeace przyjęty (${ok}), status ${w.dipl.getStatus(w.emp)}`);
  assert(!!f1 && !!f2 && f1.empireId === w.emp && Math.abs(f1.deadline - (t0 + 0.5)) < 1e-9 && f1.warned === false
      && f2.deadline === f1.deadline,
    `A4b: obie jednostki gracza na ${w.col.planetId} mają flagę ${JSON.stringify(f1)} — termin = podpis + 0,5 roku (6 mies.)`);
  assert(!flagOf(w, pHome.id),
    'A4b kontrola: jednostka gracza na WŁASNYM ciele flagi nie dostaje');
  const aiAfter = w.gum.getUnitsOnPlanet(w.home.planetId).filter(u => u.owner === w.emp).length;
  assert(aiAfter === 0 && aiBefore.every(id => !w.gum.getUnit(id)),
    `A4c: jednostki ${w.emp} na kolonii gracza znikają od razu przy podpisaniu (było ${aiBefore.length}, jest ${aiAfter})`);
  run(w, 2);
  const c = campaign();
  assert(c?.active === false && c?.endReason === 'peace_signed' && repelled.length === 0,
    `A4d: desant ${w.emp} gaśnie z powodem ${c?.endReason ?? '—'}; po 2 civY meldunków „Desant odparty”: ${repelled.length}`);
  const ord = journal(w, /⚑/).filter(e => e.channel === 'diplomacy');
  const bodyName = w.K.entityManager?.get?.(w.col.planetId)?.name ?? w.col.planetId;
  assert(ord.length === 1 && ord[0].text.includes(bodyName) && /\b2\b/.test(ord[0].text),
    `A4e: JEDEN wpis w Dzienniku przy pokoju (kanał dyplomacji): ${JSON.stringify(ord.map(e => e.text))}`);
  const dateStr = w.K.timeSystem.formatTime?.(f1?.deadline ?? 0) ?? '';
  assert(ord.length === 1 && dateStr.length > 0 && ord[0].text.includes(dateStr),
    `A4e: wpis podaje termin w formacie zegara (${dateStr})`);

  // R5 — karta jednostki: flaga i termin (prawdziwe showUnitCard na atrapie DOM z env.js)
  const kids0 = document.body.children.length;
  try { UCmod?.showUnitCard?.(w.gum.getUnit(p1.id)); } catch { /* raport niżej */ }
  const card = document.body.children.slice(kids0);
  const texts = card.flatMap(el => domTexts(el));
  const monthsLeft = Math.max(0, Math.ceil(((f1?.deadline ?? 0) - w.K.timeSystem.gameTime) * 12 - 1e-9));   // po 2 civY: 4
  assert(texts.includes(t('unitCard.withdrawalTitle')) && texts.includes(dateStr) && texts.includes(t('unitCard.withdrawalMonths', monthsLeft)),
    `A4f: karta jednostki pokazuje sekcję „${t('unitCard.withdrawalTitle')}”, termin ${dateStr} i ${t('unitCard.withdrawalMonths', monthsLeft)}`);
  const kids1 = document.body.children.length;
  try { UCmod?.showUnitCard?.(w.gum.getUnit(pHome.id)); } catch { /* */ }
  const card2 = document.body.children.slice(kids1).flatMap(el => domTexts(el));
  assert(card2.length > 0 && !card2.includes(t('unitCard.withdrawalTitle')),
    'A4f kontrola: karta jednostki BEZ flagi nie ma tej sekcji (karta się narysowała)');
  const osrc = strip(readFileSync(new URL('../../ui/ColonyOverlay.js', import.meta.url), 'utf8'));
  const iDef = osrc.search(/\n\s*_drawUnitPanel\(ctx,\s*ox,\s*oy,\s*ow,\s*oh\)\s*\{/);   // DEFINICJA, nie wywołanie
  const panel = iDef >= 0 ? osrc.slice(iDef, iDef + 12000) : '';
  assert(/unit\.withdrawal/.test(panel) && /t\('unitPanel\.withdrawal'/.test(panel),
    'A4g: pin źródłowy — panel jednostki na mapie kolonii (`_drawUnitPanel`) czyta flagę i pokazuje termin przez t()');

  for (const k of ['withdrawal:ordered', 'withdrawal:aiRemoved', 'withdrawal:warning', 'withdrawal:expired', 'withdrawal:cleared']) {
    EventBus.emit(k, { empireId: 'a4_probe' });
  }
  EventBus.emit('withdrawal:a4_untracked', { empireId: 'a4_probe' });
  const seen = (k) => debugLog.query({ kind: k, empireId: 'a4_probe' }).length;
  assert(['ordered', 'aiRemoved', 'warning', 'expired', 'cleared'].every(s => seen('withdrawal:' + s) === 1),
    'A4h: DebugLog śledzi withdrawal:ordered / aiRemoved / warning / expired / cleared');
  assert(seen('withdrawal:a4_untracked') === 0, 'A4h kontrola: zdarzenie spoza listy NIE trafia do DebugLog — pin nie jest ślepy');
}

// ── A6 — R3/R5: termin — ostrzeżenie miesiąc wcześniej, potem usunięcie jak polegli ──────
{
  console.log('\nA6 — termin: jedno ostrzeżenie miesiąc wcześniej (Dziennik + dzwonek), w terminie usunięcie jak polegli');
  const w = boot();
  declare(w);
  const u = moveTo(recruit(w), w.col, freeTiles(w, w.col, { building: false })[0]);
  const popCost = u.popCost ?? 0;
  const ri = ColonyManager.GROUND_UNIT_POP_REINTEGRATION[u.archetypeId];
  const destroyed = [], warnEv = [];
  EventBus.on('groundUnit:destroyed', (e) => { if (e.unitId === u.id) destroyed.push(e); });
  EventBus.on('withdrawal:warning', (e) => warnEv.push({ ...e, at: w.K.timeSystem.gameTime }));
  const ok = signPeace(w);
  const deadline = flagOf(w, u.id)?.deadline ?? null;
  assert(ok === true && popCost > 0 && deadline !== null && !!ri,
    `świadek: jednostka gracza z POP (${popCost}, dom ${u.homeColonyId}) na ${w.col.planetId}, pokój, termin ${deadline?.toFixed?.(4)}`);
  const lock0 = lockOf(w.home);
  const bodyName = w.K.entityManager?.get?.(w.col.planetId)?.name ?? w.col.planetId;
  const dateStr = w.K.timeSystem.formatTime?.(deadline ?? 0) ?? '';
  let goneAt = null, warnAt = null;
  for (let y = 1; y <= 8; y++) {
    run(w, 1);
    if (warnAt === null && warnEv.length > 0) warnAt = y;
    if (goneAt === null && !w.gum.getUnit(u.id)) goneAt = y;
  }
  // ⚠ Pin na CZASIE ostrzeżenia względem terminu nominalnego, nie tylko „przed usunięciem”: bez tolerancji progu
  //   (`WithdrawalSystem` EPS) oba progi spóźniały się o tick i ostrzeżenie wypadało W terminie, a usunięcie miesiąc po nim.
  assert(warnEv.length === 1 && warnAt !== null && warnEv[0].at >= deadline - 1 / 12 - 1e-6 && warnEv[0].at < deadline - 1 / 24
      && goneAt === warnAt + 1,
    `A6a: JEDNO ostrzeżenie (${warnEv.length}) w ${warnAt}. civY — miesiąc przed terminem (czas ${warnEv[0]?.at?.toFixed?.(4)}, ` +
    `termin ${deadline?.toFixed?.(4)}), usunięcie tick później (${goneAt}. civY)`);
  const warnText = t('event.withdrawal.warning', 1, bodyName, dateStr);
  const warnLog = (w.K.eventLogSystem?.getEntries?.() ?? []).filter(e => e.text === warnText && e.channel === 'combat');
  assert(bell(w, 'withdrawalWarning').length === 1 && warnLog.length === 1,
    `A6b: ostrzeżenie w dzwonku (${bell(w, 'withdrawalWarning').length}) i JEDEN wpis w Dzienniku: „${warnText}” (${warnLog.length})`);
  assert(goneAt === 6 && destroyed.length === 1 && destroyed[0].cause === 'withdrawal_deadline',
    `A6c: w terminie jednostka usunięta (w ${goneAt}. civY) jako polegli — groundUnit:destroyed ×${destroyed.length}, ` +
    `przyczyna ${destroyed[0]?.cause ?? '—'}`);
  const exp = (w.K.eventLogSystem?.getEntries?.() ?? []).filter(e => e.text === t('event.withdrawal.expired', 1, bodyName));
  assert(exp.length === 1, `A6d: JEDEN wpis w Dzienniku o utracie po terminie (${exp.length})`);
  run(w, 4);                                             // zwłoka reintegracji (`ri.delay`) po śmierci w 6.–7. civY
  const due = popCost * ri.rate;
  const lockAfterDelay = lockOf(w.home);
  assert(Math.abs((lock0 - lockAfterDelay) - due) < 1e-6,
    `A6e: POP ścieżką śmierci do kolonii macierzystej — blokada w domu ${lock0} → ${lockAfterDelay} ` +
    `(zwrot ${due} = ${popCost} × ${ri.rate} po zwłoce ${ri.delay} civY)`);
}

// ── A7 — R3 (Finding 358): cesja ciała z jednostką gracza na rzecz AI ────────────────────
{
  console.log('\nA7 — cesja ciała z jednostką gracza na rzecz AI: flaga');
  const w = boot();
  const sys = w.home.systemId ?? w.K.entityManager?.get?.(w.home.planetId)?.systemId;
  const free = (w.K.entityManager?.getAll?.() ?? []).find(b => (b.systemId || 'sys_home') === (sys || 'sys_home')
    && (b.type === 'planet' || b.type === 'moon') && !w.cm.getColony(b.id));
  const ceded = quiet(() => w.cm.createColony(free.id, { minerals: 100 }, 10, 0, null));
  for (const t of tilesOf(ceded)) if (t.owner == null) t.owner = 'player';
  const spot = freeTiles(w, ceded, { building: false })[0] ?? { q: 0, r: 0 };   // kolonia bez siatki — heks bez znaczenia
  const u = ceded ? playerUnit(w, ceded.planetId, spot) : null;
  declare(w);
  const ok = signPeace(w, w.emp, { cessions: [{ bodyId: ceded.planetId, fromEmpireId: 'player', toEmpireId: w.emp }] });
  const f = u ? flagOf(w, u.id) : null;
  assert(!!u && ok === true && w.cm.getColony(ceded.planetId)?.ownerEmpireId === w.emp,
    `świadek: kolonia gracza ${ceded.planetId} z jednostką oddana ${w.emp} w traktacie (przyjęty: ${ok}, właściciel ${w.cm.getColony(ceded.planetId)?.ownerEmpireId})`);
  assert(!!f && f.empireId === w.emp && !!w.gum.getUnit(u.id),
    `A7: jednostka gracza na oddanym ciele dostaje flagę wycofania (${JSON.stringify(f)}) i stoi dalej — znika dopiero w terminie`);
}

// ── A9 — zapis → wczytanie ───────────────────────────────────────────────────────────────
{
  console.log('\nA9 — zapis → wczytanie: flaga i termin zostają; starszy zapis bez pola — czysto');
  const w = boot();
  declare(w);
  const land = freeTiles(w, w.col, { building: false });
  const a = playerUnit(w, w.col.planetId, land[0]);
  const rover = w.gum.createUnit('science_rover', w.col.planetId, land[1].q, land[1].r);   // legacy (forma away team)
  signPeace(w);
  const fa = flagOf(w, a.id), fr = flagOf(w, rover.id);
  assert(!!fa && !!fr, `świadek: flaga na archetypie (${!!fa}) i na jednostce legacy (${!!fr})`);
  const blob = JSON.parse(JSON.stringify(w.gum.serialize()));
  w.gum.restore(blob);
  const ra = flagOf(w, a.id), rr = flagOf(w, rover.id);
  assert(!!ra && !!rr && same(ra, fa) && same(rr, fr),
    `A9a: po wczytaniu flagi identyczne (archetyp ${JSON.stringify(ra)}, legacy ${JSON.stringify(rr)})`);
  const old = JSON.parse(JSON.stringify(blob));
  for (const x of old.units) delete x.withdrawal;
  w.gum.restore(old);
  const before = w.gum.getAllUnits().length;
  let threw = null;
  const ticks = typeof w.K.withdrawalSystem?._tick === 'function';
  try { w.K.withdrawalSystem?._tick?.(); } catch (e) { threw = e; }
  assert(ticks && !flagOf(w, a.id) && !flagOf(w, rover.id) && !!w.gum.getUnit(a.id) && w.gum.getAllUnits().length === before
      && threw === null,
    `A9b: starszy zapis bez pola — jednostki bez flagi, tick systemu wycofania (${ticks}) bez błędu i bez usunięć`);
}

// ── A10 — garnizon i oflagowane jednostki gracza obok siebie przez 6 civY pokoju ──────────
{
  console.log('\nA10 — garnizon zmobilizowanego imperium i oflagowane jednostki gracza na tych samych heksach: 6 civY bez ognia');
  const w = boot({ garrison: true });
  declare(w);
  const capCol = w.K.directorProduction.capitalOf(w.emp);
  const garrison = w.gum.getUnitsOnPlanet(capCol.planetId).filter(u => u.owner === w.emp);
  // Młode imperium domyślnego ziarna ma garnizon 2 (D1: minimum 2) — po jednej jednostce gracza na KAŻDYM heksie garnizonu.
  const mine = garrison.slice(0, 3).map(g => playerUnit(w, capCol.planetId, { q: g.q, r: g.r }));
  const ids = new Set([...garrison.map(u => u.id), ...mine.map(u => u.id)]);
  const hits = [];
  EventBus.on('groundUnit:attacked', (e) => { if (ids.has(e.targetId)) hits.push(e); });
  const ok = signPeace(w);
  const snap0 = [...garrison, ...mine].map(snap);
  assert(garrison.length >= 2 && mine.length === Math.min(3, garrison.length) && ok === true && mine.every(u => !!flagOf(w, u.id)),
    `świadek: garnizon ${w.emp} na ${capCol.planetId} (${garrison.length} jedn.), ${mine.length} jednostki gracza na jego heksach, pokój, flagi`);
  run(w, 5);
  const snap5 = [...garrison, ...mine].map(u => snap(w.gum.getUnit(u.id)));
  assert(hits.length === 0 && same(snap0, snap5),
    `A10a: 5 civY pokoju — trafień ${hits.length}, hp/morale/pozycje bez zmian po obu stronach`);
  run(w, 2);
  assert(hits.length === 0 && mine.every(u => !w.gum.getUnit(u.id)) && garrison.every(g => !!w.gum.getUnit(g.id)),
    `A10b: w terminie znikają wyłącznie jednostki gracza; garnizon stoi (trafień przez całe okno: ${hits.length})`);
}

// ── A5 — R6 (Findings 353, 354): zabranie wojsk z cudzego ciała; płatnik żołdu ────────────
/**
 * Jednostka gracza na kolonii AI ładowana na statek (prawdziwe `loadGroundUnit`), potem `civY` prawdziwych ticków.
 * `homeOf`: null = jednostka bez domu (`debug.spawnMyUnit`), 'ai' = dom wskazuje kolonię AI (zapis jednostki bez domu:
 * `serialize` pisze `homeColonyId ?? planetId`).
 * ⚠ Płatnika mierzymy ZDARZENIEM płatności (`trade:spendCredits`, cel `ground_unit_upkeep`), nie saldem: saldo kolonii
 *   ruszają też podatki i płace (Population 2.0 F3), a pierwszy tick utrzymania wypada albo nie zależnie od zaokrągleń
 *   sumy `civDeltaYears` (0,999…) — liczba płatności w oknie 3 civY to 2 albo 3.
 */
function cargoScene({ aiCredits, homeCredits = 1000, flagged = true, homeOf = null, civY = 3 }) {
  const w = boot();
  declare(w);
  const t = freeTiles(w, w.col, { building: false })[0];
  const u = w.gum.createUnit('shock_infantry', w.col.planetId, t.q, t.r, { owner: 'player', factionId: 'humanity' });
  u.homeColonyId = homeOf === 'ai' ? w.col.planetId : null;
  if (flagged) signPeace(w);
  const flag0 = !!flagOf(w, u.id);
  w.col.credits = aiCredits;
  w.home.credits = homeCredits;
  const v = w.K.vesselManager.createAndRegister('hull_small', w.home.planetId);
  v.troopCapacity = 12; v.troopBayUsed = 0; v.groundUnits = [];
  const res = VSmod?.loadGroundUnit?.(v, u);
  const cleared = [], paid = [];
  EventBus.on('withdrawal:cleared', (e) => { if (e.unitId === u.id) cleared.push(e.reason); });
  EventBus.on('trade:spendCredits', (e) => { if (e.purpose === 'ground_unit_upkeep') paid.push(e); });
  if (civY > 0) run(w, civY);
  const now = w.gum.getUnit(u.id);
  return {
    w, unitId: u.id, vessel: v, flag0, loaded: res?.ok === true,
    homePaid: paid.filter(e => e.colonyId === w.home.planetId), aiPaid: paid.filter(e => e.colonyId === w.col.planetId),
    status: now?.status ?? null, aboard: v.groundUnits.includes(u.id),
    onBody: w.gum.getUnitsOnPlanet(w.col.planetId).some(x => x.id === u.id),
    flag1: !!flagOf(w, u.id), cleared, perCivY: ColonyManager.GROUND_UNIT_UPKEEP.shock_infantry.credits,
  };
}
const paidOk = (s) => s.homePaid.length >= 2 && s.homePaid.every(e => e.amount === s.perCivY) && s.aiPaid.length === 0;
const paidStr = (s) => `dom ${s.homePaid.length}× ${JSON.stringify(s.homePaid.map(e => e.amount))}, AI ${s.aiPaid.length}×`;
{
  console.log('\nA5 — R6: załadunek z cudzego ciała zostaje w ładowni; żołd płaci kolonia gracza, nigdy AI');
  const a = cargoScene({ aiCredits: 0 });
  assert(a.flag0 && a.loaded,
    `świadek (353): oflagowana jednostka gracza bez domu na ${a.w.col.planetId}, kolonia AI bez kredytów, załadunek ok`);
  assert(a.status === 'in_cargo' && a.aboard && !a.onBody,
    `A5a (353): po 3 civY jednostka jest w ładowni (status ${a.status}, na liście ładowni: ${a.aboard}) i NIE stoi na ciele ` +
    `(${a.onBody}) — przed R6 utrzymanie nadpisywało status na 'offline' i jednostka „wracała na ziemię”`);
  assert(!a.flag1 && a.cleared.includes('loaded'),
    `A5a: flaga zdjęta przy załadunku (powód: ${JSON.stringify(a.cleared)})`);
  assert(paidOk(a), `A5a: żołd ${a.perCivY} Kr/civY płaci kolonia gracza, kolonia AI nic (${paidStr(a)})`);
  const b = cargoScene({ aiCredits: 1000 });
  assert(paidOk(b) && b.status === 'in_cargo',
    `A5b (354): kolonia AI Z KREDYTAMI nie płaci za jednostkę gracza — płaci dom (${paidStr(b)}; status ${b.status})`);
  const c = cargoScene({ aiCredits: 1000, flagged: false, homeOf: 'ai' });
  assert(paidOk(c),
    `A5c (354): dom jednostki wskazuje kolonię AI (stary zapis) — płaci kolonia macierzysta gracza (${paidStr(c)})`);

  // A5d — „offline” w ładowni: bez żołdu jednostka ZOSTAJE w ładowni; prawdziwe `_tickGroundUnitUpkeep`, kredyty zerowane
  //   przed każdym rozliczeniem (inaczej podatki z ticków dosypałyby domowi kredytów i żołd by się zapłacił).
  const d = cargoScene({ aiCredits: 0, homeCredits: 0, civY: 0 });
  const steps = [];
  for (let i = 0; i < 3; i++) {
    d.w.home.credits = 0; d.w.col.credits = 0;
    quiet(() => d.w.cm._tickGroundUnitUpkeep(1.0));
    const x = d.w.gum.getUnit(d.unitId);
    steps.push({ status: x?.status, prev: x?.prevStatus, unpaid: x?.unpaidYears,
                 onBody: d.w.gum.getUnitsOnPlanet(d.w.col.planetId).some(y => y.id === d.unitId) });
  }
  const last = steps[steps.length - 1];
  assert(steps.every(st => st.status === 'in_cargo' && !st.onBody) && last.prev === 'offline' && last.unpaid === 3,
    `A5d: bez żołdu jednostka w ładowni ZOSTAJE w ładowni przez 3 rozliczenia (${JSON.stringify(steps)})`);
  for (let i = 0; i < 2; i++) { d.w.home.credits = 0; d.w.col.credits = 0; quiet(() => d.w.cm._tickGroundUnitUpkeep(1.0)); }
  assert(!d.w.gum.getUnit(d.unitId) && !d.vessel.groundUnits.includes(d.unitId),
    'A5d: po karencji (5 rozliczeń bez żołdu) rozwiązana jak dotąd — znika z rejestru i z ładowni');
}

// ── A8 — R7 (Finding 358): zniszczone ciało — jednostka gracza znika, pełny koszt POP wraca do domu ─────
{
  console.log('\nA8 — zniszczone ciało: jednostka gracza znika, jej pełny koszt POP odblokowany w domu');
  const w = boot();
  declare(w);
  const land = freeTiles(w, w.col, { building: false });
  const u = moveTo(recruit(w), w.col, land[0]);
  const ai = aiUnit(w, w.emp, w.col.planetId, land[1]);
  // kontrola: druga jednostka gracza w ŁADOWNI statku nad tym ciałem (planetId = ciało załadunku) — nie jest „na ciele”
  const carried = playerUnit(w, w.col.planetId, land[2]);
  const v = w.K.vesselManager.createAndRegister('hull_small', w.home.planetId);
  v.troopCapacity = 12; v.troopBayUsed = 0; v.groundUnits = [];
  const loaded = VSmod?.loadGroundUnit?.(v, carried)?.ok === true;
  const popCost = u.popCost ?? 0;
  const lock0 = lockOf(w.home);
  const lost = [], removedEv = [];
  EventBus.on('groundUnit:popsLost', (e) => lost.push(e));
  EventBus.on('garrison:unitsRemoved', (e) => { if (e.planetId === w.col.planetId) removedEv.push(e); });
  assert(popCost > 0 && lock0 >= popCost && !!ai && loaded,
    `świadek: jednostka gracza z POP ${popCost} (dom ${u.homeColonyId}, blokada w domu ${lock0}) i jednostka ${w.emp} na ` +
    `${w.col.planetId}; trzecia jednostka gracza w ładowni statku`);
  quiet(() => w.cm.removeColony(w.col.planetId, 'collision'));
  assert(!w.cm.getColony(w.col.planetId) && !w.gum.getUnit(u.id) && !w.gum.getUnit(ai.id),
    `A8a: po zniszczeniu ${w.col.planetId} znika jednostka gracza i jednostka ${w.emp} (D16 „wszystkie”)`);
  assert(Math.abs((lock0 - lockOf(w.home)) - popCost) < 1e-9 && lost.length === 0,
    `A8b: pełny koszt POP odblokowany w domu OD RAZU (${lock0} → ${lockOf(w.home)}, koszt ${popCost}); meldunków „POP utracone”: ${lost.length}`);
  assert(!!w.gum.getUnit(carried.id) && v.groundUnits.includes(carried.id),
    'A8 kontrola: jednostka w ładowni statku nad zniszczonym ciałem zostaje (nie stoi na ciele)');
  assert(removedEv.some(e => JSON.stringify(e.owners) === JSON.stringify(['player']) && e.count === 1 && e.cause === 'body_destroyed'),
    `A8c: ślad audytu jednostek gracza osobno od AI (${JSON.stringify(removedEv.map(e => ({ owners: e.owners, count: e.count })))})`);
}

// ── A8d — R7 (Finding 358): ciało BEZ kolonii zniszczone (każde `EntityManager.remove`) ──────────────────
{
  console.log('\nA8d — zniszczone ciało bez kolonii: jednostka gracza znika, pełny koszt POP do domu; ciało z kolonią — jedno usunięcie');
  const w = boot();
  const sys = EntityManager.get(w.home.planetId)?.systemId;
  const neutral = ['moon', 'planet', 'planetoid'].flatMap(tp => EntityManager.getByType(tp))
    .filter(b => b.systemId === sys && b.id !== w.home.planetId && !w.cm.getColony(b.id));
  const [b1, b2] = neutral;
  const u = recruit(w);
  u.planetId = b1?.id; u.q = 0; u.r = 0;
  const keep = playerUnit(w, b2?.id, { q: 0, r: 0 });
  const popCost = u.popCost ?? 0;
  const lock0 = lockOf(w.home);
  const removedEv = [], lost = [];
  EventBus.on('garrison:unitsRemoved', (e) => removedEv.push(e));
  EventBus.on('groundUnit:popsLost', (e) => lost.push(e));
  assert(!!b1 && !!b2 && popCost > 0 && lock0 >= popCost && w.gum.getUnitsOnPlanet(b1.id).some(x => x.id === u.id),
    `świadek: dwa ciała bez kolonii w układzie domu (${b1?.id}, ${b2?.id}); na pierwszym jednostka gracza z POP ${popCost} ` +
    `(blokada w domu ${lock0}), na drugim — druga jednostka gracza`);
  quiet(() => EntityManager.remove(b1.id));
  assert(!EntityManager.get(b1.id) && !w.gum.getUnit(u.id),
    `A8d: po zniszczeniu ${b1?.id} (ciało bez kolonii) jednostka gracza znika — przed naprawą zostawała zarejestrowana na nieistniejącym ciele`);
  assert(Math.abs((lock0 - lockOf(w.home)) - popCost) < 1e-9 && lost.length === 0,
    `A8e: pełny koszt POP odblokowany w domu od razu (${lock0} → ${lockOf(w.home)}, koszt ${popCost}); meldunków „POP utracone”: ${lost.length}`);
  assert(!!w.gum.getUnit(keep.id) && keep.planetId === b2.id,
    `A8d kontrola: jednostka gracza na innym ciele bez kolonii (${b2?.id}) zostaje`);
  const evB1 = removedEv.filter(e => e.planetId === b1.id);
  assert(evB1.length === 1 && evB1[0].via === 'entity_removed' && evB1[0].count === 1 && JSON.stringify(evB1[0].owners) === JSON.stringify(['player']),
    `A8f: ślad audytu zniszczenia ciała bez kolonii (${JSON.stringify(evB1.map(e => ({ via: e.via, n: e.count, owners: e.owners })))})`);
  // Ciało Z kolonią zniszczone tą samą drogą (kolizja = `EntityManager.remove`): ColonyManager usuwa kolonię
  // w mikrozadaniu → `colony:destroyed` → R7; nowa subskrypcja `entity:removed` NIE może usunąć drugi raz.
  const t0 = freeTiles(w, w.col, { building: false })[0];
  const onCol = playerUnit(w, w.col.planetId, t0);
  const before = removedEv.length;
  quiet(() => EntityManager.remove(w.col.planetId));
  await new Promise((r) => queueMicrotask(r));         // po mikrozadaniu ColonyManagera (setTimeout 0 czeka w uprzęży na tick)
  const evCol = removedEv.slice(before).filter(e => e.planetId === w.col.planetId && (e.owners ?? []).includes('player'));
  assert(!w.cm.getColony(w.col.planetId) && !w.gum.getUnit(onCol.id) && evCol.length === 1 && evCol[0].via === 'destroyed',
    `A8g: ciało z kolonią (${w.col.planetId}) zniszczone przez EntityManager.remove — kolonia usunięta, jednostka gracza znika, ` +
    `JEDEN ślad audytu jednostek gracza, ze ścieżki kolonii (${JSON.stringify(evCol.map(e => e.via))}; bez bramki hasColony: 'entity_removed')`);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
