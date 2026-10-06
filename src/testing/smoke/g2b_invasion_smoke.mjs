// G2b — AI GARRISON, slice G2b: desant AI na modelu jednostek GRACZA (archetypy) — D7, D9.
//
// Podpis właściciela (`docs/design/AI_GARRISON_PLAN.md` §1 — D7 2026-10-02, D9 po rewizji 2026-10-03): AI używa modelu
// jednostek gracza wszędzie, także w desancie; jedna gałka AI — morale nadawane przy tworzeniu, ze szczebla drabiny
// imperium w tej chwili; AI wystawia wyłącznie typy proste; jednostki legacy zostają w danych dla starych zapisów
// i łazika; desant nie liczy się do limitu garnizonu.
//
//   I1  (S1) desant `launchInvasion` z puli — jednostki archetypowe: `owner` i `factionId` = imperium, morale = morale
//       szczebla (na każdym z czterech szczebli D9), `popCost` 0, bez domu, nigdy legacy.
//   I0  (S1) skład wg szczebla: szczeble bez artylerii — sama `shock_infantry`; szczeble z artylerią — co trzecia
//       jednostka fali to `rocket_artillery` (2 → bez artylerii, 3 → jedna, 6 → dwie); czysta funkcja i prawdziwy desant.
//   I2  KONTROLA: liczba jednostek = dzisiejsza — pula: `troopCount` (2, 6, domyślnie 3);
//       lista jawna: min(długość listy, `troopCount`).
//   I4  KONTROLA: bramka wojny G2-2 dalej odmawia w pokoju (zero jednostek, zero rekordów inwazji).
//   I5  KONTROLA: desant nie zmienia limitu garnizonu imperium, liczby jego jednostek garnizonu ani odrastania.
//   I6  R4 (G2-4) dalej usuwa jednostki desantu przy pokoju (świadek: jednostki archetypowe).
//   I3  (S2) lista jawna `embarkedTroops` — przez `createAIUnit`: właściciel i frakcja imperium, morale szczebla; przy
//       0 Kr we wszystkich koloniach przez 10 civY aktywne (dawniej `{ owner }` ⇒ `factionId 'humanity'` ⇒ utrzymanie
//       gracza ⇒ `offline` i rozwiązanie — Finding 323); wpis spoza typów prostych AI (np. legacy `infantry`) —
//       typ ze składu szczebla na tej pozycji.
//   I7  (S3) `INVASION_UNIT_POOLS` usunięte (nikt go nie czyta); `InvasionSystem` nie tworzy jednostek z pominięciem
//       `createAIUnit`; jednostki legacy zostają w danych (`GROUND_UNITS`) dla starych zapisów i łazika.
//
// ⚠ Harness: prawdziwy `GameCore` (kolonie AI z bootstrapu, `GroundUnitManager`, `InvasionSystem`, `GarrisonSystem`,
//   `DiplomacySystem`, `WarSystem`) + własny `CombatSystem`. Szczebel imperium ustawiany przez poziomy wpisów `factory`
//   w jego koloniach — wejście drabiny D9 (`GarrisonPlanner.readEmpireGarrisonSnapshot` → suma poziomów `factory`).
// ⚠ Nowe symbole czytane przez przestrzeń nazw i `call` — na kodzie sprzed kroku pin dostaje kolor, przebieg się nie
//   wywraca. Każdy pin wykluczający ma świadka; kontrole są zielone po obu stronach.
// ⚠ Źródło czytane bez komentarzy i z LF (pin niezależny od checkoutu).

import '../headless/env.js';           // MUSI być pierwszy
import gameState from '../../core/GameState.js';
import { GameCore } from '../headless/GameCore.js';
import { CombatSystem } from '../../systems/CombatSystem.js';
import { UNIT_ARCHETYPES } from '../../data/unitArchetypes.js';
import * as GUD from '../../data/GroundUnitData.js';
import * as GD from '../../data/GarrisonData.js';
import * as GP from '../../utils/GarrisonPlanner.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const call = (obj, name, ...args) => (typeof obj?.[name] === 'function' ? obj[name](...args) : undefined);
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));

const S = 'shock_infantry', A = 'rocket_artillery';
const LADDER = GD.GARRISON_LADDER;                      // szczeble D9 — progi i morale z DANYCH
const TOP = LADDER[LADDER.length - 1];

// ── Harness ──────────────────────────────────────────────────────────────────────────────
function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
}
function boot({ war = true, garrison = false } = {}) {
  const core = new GameCore();
  quiet(() => core.boot({ quiet: true, scenario: 'civilization' }));
  const K = window.KOSMOS;
  K.combatSystem = new CombatSystem();
  if (K.garrisonSystem && !garrison) K.garrisonSystem.enabled = false;
  const cm = core.colonyManager;
  const home = cm.getColony(K.homePlanet.id);
  home.credits = Math.max(home.credits ?? 0, 1e6);
  const ai = cm.getAllColonies().find(c => c.ownerEmpireId && !c.isOutpost);
  const w = { core, K, cm, gum: K.groundUnitManager, inv: K.invasionSystem, dipl: K.diplomacySystem, home, ai,
              emp: ai.ownerEmpireId };
  if (war) quiet(() => w.dipl.declareWar(w.emp, 'keeper_setup'));
  return w;
}
/** Szczebel imperium = suma poziomów `factory` w jego koloniach (wejście D9). Zwraca odczyt planera. */
function setFactoryLevels(w, levels) {
  const cols = w.K.empireRegistry.getColoniesByEmpire(w.emp).filter(c => c?.ownerEmpireId === w.emp && c.buildingSystem?._active);
  const facs = cols.flatMap(c => [...c.buildingSystem._active.values()].filter(e => e?.building?.id === GD.GARRISON_FACTORY_BUILDING));
  for (const e of facs) e.level = 0;
  if (facs.length > 0) facs[0].level = levels;
  else cols[0].buildingSystem._active.set('__g2b_keeper_factory', { building: { id: GD.GARRISON_FACTORY_BUILDING }, level: levels });
  return GP.readEmpireGarrisonSnapshot(w.K, w.emp).factoryLevels;
}
const launch = (w, count, list) => quiet(() => (count === undefined
  ? w.inv.launchInvasion(w.emp, w.home.planetId)
  : w.inv.launchInvasion(w.emp, w.home.planetId, count, list ?? null)));
const landed = (w, res) => (res?.landed ?? []).map(id => w.gum.getUnit(id));
const onHome = (w) => w.gum.getUnitsOnPlanet(w.home.planetId).filter(u => u.owner === w.emp);
/** Jednostka archetypowa imperium: archetyp z katalogu, typ = archetyp, nie legacy, właściciel i frakcja = imperium. */
const isArchAI = (u, emp) => !!u && !!UNIT_ARCHETYPES[u.archetypeId] && u.type === u.archetypeId
  && !GUD.GROUND_UNITS?.[u.type] && u.owner === emp && u.factionId === emp;
const typesOf = (us) => us.map(u => u?.archetypeId ?? u?.type ?? null);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Pokój PRAWDZIWĄ ścieżką `offerPeace` (wyczerpanie obu stron 100 ⇒ akceptacja) — wzór `g2_after_peace_smoke`. */
function signPeace(w) {
  const war = w.K.warSystem.getWarWith(w.emp);
  if (war) gameState.set('wars.' + war.id, { ...war, exhaustion: { player: 100, [w.emp]: 100 } }, 'g2b_keeper');
  return quiet(() => w.dipl.offerPeace(w.emp, 'keeper_setup', { terms: null, playerInitiated: false }));
}

// ── I1 — S1: desant z puli na modelu archetypów, morale szczebla ─────────────────────────
{
  console.log('\nI1 — desant z puli: jednostki archetypowe imperium z morale szczebla, na każdym szczeblu drabiny D9');
  const rows = LADDER.map((row) => {
    const w = boot();
    const lv = setFactoryLevels(w, row.minFactoryLevels);
    const res = launch(w, 3);
    return { w, row, lv, res, us: landed(w, res) };
  });
  assert(rows.every(r => r.res?.success === true && r.us.length === 3 && r.us.every(Boolean) && r.lv === r.row.minFactoryLevels),
    `świadek: desant 3 jednostek wylądował na każdym szczeblu (suma fabryk ${rows.map(r => r.lv).join('/')})`);
  assert(rows.every(r => r.us.every(u => isArchAI(u, r.w.emp))),
    `I1a SEDNO: wszystkie jednostki archetypowe imperium, żadna legacy (${rows.map(r => typesOf(r.us).join(',') + ' ' +
      r.us.map(u => `${u?.owner}/${u?.factionId}`).join(',')).join(' | ')})`);
  assert(rows.every(r => r.us.every(u => u?.morale === r.row.morale && u?.maxMorale === r.row.morale)),
    `I1b: morale = morale szczebla ${LADDER.map(x => x.morale).join('/')} (jest ${rows.map(r => r.us.map(u => u?.morale).join(',')).join(' | ')})`);
  assert(rows.every(r => r.us.every(u => u?.popCost === 0 && u?.homeColonyId === null)),
    `I1c: popCost 0, bez domu — kolonia gracza nie jest domem najeźdźcy (${rows.map(r => r.us.map(u => `${u?.popCost}/${u?.homeColonyId}`).join(',')).join(' | ')})`);
}

// ── I0 — S1: skład wg szczebla ──────────────────────────────────────────────────────────
{
  console.log('\nI0 — skład desantu wg szczebla: szczeble bez artylerii — sama shock_infantry; z artylerią — co trzecia rocket_artillery');
  const artRows = LADDER.filter(r => r.artilleryEvery > 0);
  assert(artRows.length >= 1 && artRows.every(r => r.morale === TOP.morale) && LADDER.some(r => !(r.artilleryEvery > 0)),
    `świadek danych: szczeble z artylerią to szczeble najwyższej jakości (morale ${TOP.morale}): ${artRows.map(r => r.minFactoryLevels).join(', ')}`);
  const comp = (n, row) => call(GP, 'invasionComposition', n, GP.garrisonTier({ factoryLevels: row.minFactoryLevels }));
  const want = { 2: [S, S], 3: [S, S, A], 6: [S, S, A, S, S, A] };
  const okArt = artRows.every(r => [2, 3, 6].every(n => same(comp(n, r), want[n])));
  const okPlain = LADDER.filter(r => !(r.artilleryEvery > 0)).every(r => [2, 3, 6].every(n => same(comp(n, r), Array(n).fill(S))));
  assert(okArt && okPlain,
    `I0a: czysta funkcja \`invasionComposition\` — szczebel najwyższej jakości: 2 → ${JSON.stringify(comp(2, TOP))}, ` +
    `3 → ${JSON.stringify(comp(3, TOP))}, 6 → ${JSON.stringify(comp(6, TOP))}; najniższy: 6 → ${JSON.stringify(comp(6, LADDER[0]))}`);
  const wTop = boot(); setFactoryLevels(wTop, TOP.minFactoryLevels);
  const top = typesOf(landed(wTop, launch(wTop, 6)));
  const wLow = boot(); setFactoryLevels(wLow, LADDER[0].minFactoryLevels);
  const low = typesOf(landed(wLow, launch(wLow, 6)));
  assert(same(top, want[6]) && same(low, Array(6).fill(S)),
    `I0b SEDNO: prawdziwy desant 6 jednostek — szczebel najwyższej jakości ${JSON.stringify(top)}, najniższy ${JSON.stringify(low)}`);
}

// ── I2 — kontrola: liczba jednostek = dzisiejsza ────────────────────────────────────────
{
  console.log('\nI2 — KONTROLA: liczba jednostek desantu taka jak dziś');
  const n = (count, list) => { const w = boot(); return launch(w, count, list)?.landed?.length ?? null; };
  const pool = [n(2), n(6), n(undefined)];
  assert(same(pool, [2, 6, 3]), `I2a: pula — troopCount 2 → ${pool[0]}, 6 → ${pool[1]}, domyślnie → ${pool[2]} (oczekiwane 2, 6, 3)`);
  const list = [n(2, [S, S, S, S]), n(6, [S, A])];
  assert(same(list, [2, 2]), `I2b: lista jawna — 4 wpisy przy troopCount 2 → ${list[0]}, 2 wpisy przy troopCount 6 → ${list[1]} (oczekiwane 2, 2)`);
}

// ── I4 — kontrola: bramka wojny G2-2 ────────────────────────────────────────────────────
{
  console.log('\nI4 — KONTROLA: bramka wojny G2-2 dalej odmawia w pokoju');
  const w = boot({ war: false });
  const before = onHome(w).length, recs = Object.keys(gameState.get('invasions') ?? {}).length;
  const res = launch(w, 3);
  assert(w.dipl.getStatus?.(w.emp) !== 'war' && res?.success === false && res?.reason === 'not_at_war'
      && onHome(w).length === before && Object.keys(gameState.get('invasions') ?? {}).length === recs,
    `I4: pokój (${w.dipl.getStatus?.(w.emp)}) — ${JSON.stringify(res)}, jednostek imperium na ciele ${before} → ${onHome(w).length}`);
}

// ── I5 — kontrola: desant a limit garnizonu i odrastanie ────────────────────────────────
{
  console.log('\nI5 — KONTROLA: desant nie liczy się do limitu garnizonu i nie zmienia odrastania');
  const w = boot({ garrison: true });                    // wojna w setupie ⇒ mobilizacja (G2-3b)
  const snap = () => GP.readEmpireGarrisonSnapshot(w.K, w.emp);
  const bodies = () => snap().bodies.map(b => b.planetId);
  const alive = () => [...GP.readEmpireGarrisonUnits(w.K, w.emp, bodies()).values()].reduce((s, l) => s + l.length, 0);
  const mobilized = w.K.empireRegistry.isGarrisonMobilized?.(w.emp) === true;
  const victim = w.K.garrisonSystem.listUnits(w.emp)[0];
  if (victim) w.gum.removeUnit(victim.unitId);            // niedobór 1 — jest co odrastać
  const lim0 = GP.planEmpireGarrison(snap()).limit, a0 = alive();
  const res = launch(w, 6);
  const lim1 = GP.planEmpireGarrison(snap()).limit, a1 = alive();
  const rg = w.K.garrisonSystem.regrowEmpire(w.emp);
  assert(mobilized && !!victim && res?.success === true && res.landed.length === 6,
    `świadek: imperium zmobilizowane, jedna jednostka garnizonu zdjęta, desant 6 jednostek na ${w.home.planetId}`);
  assert(lim1 === lim0 && a1 === a0 && !bodies().includes(w.home.planetId),
    `I5a: limit garnizonu ${lim0} → ${lim1}, jednostek garnizonu na ciałach imperium ${a0} → ${a1} — desant poza limitem`);
  assert(rg?.ok === true && bodies().includes(rg.planetId) && onHome(w).length === 6,
    `I5b: odrastanie po desancie jak bez niego — nowa jednostka na ciele imperium (${JSON.stringify(rg)}), desant nietknięty`);
}

// ── I6 — R4 przy pokoju ────────────────────────────────────────────────────────────────
{
  console.log('\nI6 — R4 (G2-4): pokój usuwa jednostki desantu z ciała gracza');
  const w = boot();
  setFactoryLevels(w, TOP.minFactoryLevels);
  const us = landed(w, launch(w, 3));
  const ok = signPeace(w);
  assert(us.length === 3 && us.every(u => isArchAI(u, w.emp)),
    `świadek: desant archetypowy imperium (${typesOf(us).join(', ')})`);
  assert(ok === true && onHome(w).length === 0 && us.every(u => !w.gum.getUnit(u?.id)),
    `I6: pokój (${ok}) — jednostek imperium na ciele gracza ${onHome(w).length}, wszystkie jednostki desantu usunięte`);
}

// ── I3 — S2: lista jawna przez createAIUnit ─────────────────────────────────────────────
{
  console.log('\nI3 — lista jawna: przez createAIUnit — imperium, morale szczebla; przy 0 Kr 10 civY aktywna; legacy → typ ze składu');
  const w = boot();
  const mid = LADDER[1];
  setFactoryLevels(w, mid.minFactoryLevels);
  for (const c of w.cm.getAllColonies()) c.credits = 0;
  const res = launch(w, 3, [S, A, 'infantry']);
  const us = landed(w, res);
  const t0 = typesOf(us);
  for (let i = 0; i < 10; i++) quiet(() => w.cm._tickGroundUnitUpkeep(1.0));
  const alive = us.filter(u => !!w.gum.getUnit(u?.id));
  assert(res?.success === true && us.length === 3 && us.every(Boolean),
    `świadek: desant z listy [${S}, ${A}, infantry] — ${us.length} jednostki, wszystkie kolonie na 0 Kr`);
  assert(same(t0, [S, A, S]) && us.every(u => isArchAI(u, w.emp) && u.morale === mid.morale),
    `I3a SEDNO: typy ${JSON.stringify(t0)} (legacy \`infantry\` → typ ze składu szczebla), imperium i morale ${mid.morale} ` +
    `(${us.map(u => `${u?.owner}/${u?.factionId}/${u?.morale}`).join(', ')})`);
  assert(alive.length === 3 && alive.every(u => u.status !== 'offline' && (u.unpaidYears ?? 0) === 0),
    `I3b: po 10 civY przy 0 Kr wszystkie 3 aktywne (żyje ${alive.length}, statusy ${alive.map(u => u.status).join(',')}) — ` +
    'dawniej `{ owner }` ⇒ utrzymanie gracza ⇒ offline i rozwiązanie (Finding 323)');
}

// ── I7 — S3: pula legacy usunięta, jednostki legacy w danych ────────────────────────────
{
  console.log('\nI7 — INVASION_UNIT_POOLS usunięte; InvasionSystem tworzy jednostki wyłącznie przez createAIUnit; legacy zostaje w danych');
  const inv = src('../../systems/InvasionSystem.js');
  const gud = src('../../data/GroundUnitData.js');
  assert(/launchInvasion\s*\(/.test(inv) && /createAIUnit\s*\(/.test(inv),
    'I7 kontrola pinu: źródło `InvasionSystem` przeczytane (`launchInvasion`, `createAIUnit`)');
  assert(GUD.INVASION_UNIT_POOLS === undefined && !/INVASION_UNIT_POOLS/.test(gud) && !/INVASION_UNIT_POOLS/.test(inv),
    'I7a: `INVASION_UNIT_POOLS` nie istnieje (eksport, definicja, import) — klucze nie należały do żadnego imperium z generatora (Finding 340)');
  assert(!/\.createUnit\s*\(/.test(inv),
    'I7b: `InvasionSystem` nie tworzy jednostek z pominięciem `createAIUnit`');
  const legacy = ['infantry', 'mech', 'garrison', 'science_rover'];
  assert(legacy.every(t => !!GUD.GROUND_UNITS?.[t]) && GUD.getUnitStats?.('infantry')?.hp === GUD.GROUND_UNITS?.infantry?.hp,
    `I7c KONTROLA: jednostki legacy zostają w danych dla starych zapisów i łazika (${legacy.filter(t => !!GUD.GROUND_UNITS?.[t]).join(', ')})`);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
