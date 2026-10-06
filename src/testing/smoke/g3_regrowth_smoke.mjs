// G3 — AI GARRISON: odrastanie strat (G3-1), uzgadnianie mobilizacji co rok (G3-2, Finding 360), widoczność
// garnizonu (G3-3) i wpis w Dzienniku przy mobilizacji (G3-4).
//
// Decyzje (`docs/design/AI_GARRISON_PLAN.md` §1 i §3; G3 podpisane, domyślne potwierdzone przez właściciela 2026-10-04):
//   G3-1 po pierwszej mobilizacji imperium odzyskuje JEDNĄ jednostkę na rok gry (1,0 na zegarze `gameTime`), w wojnie
//        i w pokoju, do bieżącego limitu; limit i szczebel liczone w chwili tworzenia (planer), więc rosnące imperium
//        kończy z większym i lepszym garnizonem; jednostka tam, gdzie bieżący plan ma największy niedobór, remis —
//        stolica pierwsza; bez wolnego heksu — następne ciało; bez miejsca nigdzie — nic w tym roku; limit poniżej
//        żywych — nic nie powstaje i nic nie jest rozwiązywane; ciała, których imperium nie ma, nic nie dostają;
//        wyłącznie `createAIUnit`; deterministycznie.
//   G3-2 przy tej samej kontroli rocznej imperium w wojnie, a bez mobilizacji, mobilizuje się.
//   G3-3 przy wywiadzie „detailed” o imperium gracz widzi liczbę jednostek garnizonu na każdym jego ciele; przed pierwszą
//        mobilizacją — rezerwę planu dla ciała, oznaczoną jako rezerwa; poniżej „detailed” — nieznany. Karta ciała
//        (gdzie gracz ogląda obcą kolonię) i okno zrzutu desantu. PL i EN.
//   G3-4 jeden wpis w Dzienniku, gdy imperium, z którym gracz ma kontakt, mobilizuje garnizony.
//
//   R0  czyste funkcje planera (ranking niedoboru, archetyp odrastania) i ślad audytu w DebugLog.
//   R1  strata N jednostek: dokładnie jedna na rok gry aż do limitu, nigdy więcej; imperium niezmobilizowane — nic.
//   R2  odrośnięta jednostka: szczebel, morale i archetyp drabiny Z TEJ CHWILI; ciało z największym niedoborem, remis —
//       stolica pierwsza; heks = pierwszy wolny heks spirali D10.
//   R3  limit poniżej żywych: nic nie powstaje, nic nie znika.
//   R4  brak wolnego heksu: następne ciało; nigdzie — nic w tym roku; bez stosu.
//   R5  zapis → wczytanie w połowie roku: następna jednostka przy domknięciu roku, raz; zapis z ticku granicy roku
//       (rok jeszcze nierozliczony) rozlicza się po wczytaniu — raz.
//   R6  zapis sprzed G3 (flaga bez `regrowthYear`): odrastanie rusza bez migracji i bez nadrabiania lat.
//   R7  wojna bez mobilizacji mobilizuje się przy kontroli rocznej, raz: wojna bez zdarzenia; imperium bez pełnej
//       kolonii w chwili wybuchu wojny (Finding 360).
//   R8  (G3-3) odczyt, który woła UI (`GarrisonReadout`): „detailed” — jednostki naprawdę stojące na ciele (także po
//       stracie i odrośnięciu); przed mobilizacją — rezerwa planera dla ciała; poniżej — nieznany; kolonia gracza i ciało
//       bez kolonii — bez odczytu; bez modułu wywiadu — nieznany. Powierzchnie WYKONANIEM: karta ciała
//       (`BottomContext.draw` na atrapie ctx) i okno zrzutu (`showDropTroopsModal` na atrapie DOM z env.js); PL i EN.
//       ⚠ Tylko przeglądarka pokaże układ wiersza na karcie i w oknie.
//   R9  (G3-4) jeden wpis w Dzienniku na mobilizację, tylko przy kontakcie (nazwa i liczba dopiero przy „detailed”);
//       bez kontaktu — nic; druga wojna i odrastanie — bez wpisu; mobilizacja przy kontroli rocznej — jeden wpis; PL i EN.
//
// ⚠ Planer i GarrisonSystem ładowane PRZESTRZENIĄ NAZW, nie importem nazwanym: na kodzie sprzed G3 nowych eksportów
//   nie ma, a import nazwany wywróciłby linkowanie całej suity — żaden pin nie dostałby koloru.
// ⚠ Każdy pin wykluczający ma ŚWIADKA; świadek stanu wejściowego to MIGAWKA sprzed akcji.
// ⚠ Harness jak `g2_mobilisation_smoke`: `bootWithDirector` (prawdziwa dyplomacja, wojna); rok gry = 12 kroków po
//   1 civY (boot zaczyna na granicy roku).

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import debugLog from '../../core/DebugLog.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import * as GP from '../../utils/GarrisonPlanner.js';
import EntityManager from '../../core/EntityManager.js';
import * as VS from '../../entities/Vessel.js';
import { BottomContext } from '../../ui/BottomContext.js';
import { showDropTroopsModal } from '../../ui/DropTroopsModal.js';
import { t, setLocale, getLocale } from '../../i18n/i18n.js';
import { NotificationCenter } from '../../systems/NotificationCenter.js';
import { EventLogSystem } from '../../systems/EventLogSystem.js';

let GSmod = null;
try { GSmod = await import('../../systems/GarrisonSystem.js'); } catch { GSmod = null; }
let ROmod = null;                      // G3-3 — przed G3-3 modułu nie ma
try { ROmod = await import('../../utils/GarrisonReadout.js'); } catch { ROmod = null; }

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const G = 'garrison_unit', A = 'rocket_artillery';
const call = (fn, ...args) => (typeof GP[fn] === 'function' ? GP[fn](...args) : undefined);

// ── Harness ──────────────────────────────────────────────────────────────────────────────
function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
}
function boot() {
  const { core, K, ticker } = quiet(() => bootWithDirector({ quiet: true }));
  return { core, K, ticker, cm: core.colonyManager, gum: K.groundUnitManager, emps: K.empireRegistry.listIds() };
}
const run = (w, civY) => quiet(() => w.ticker.run(civY, { tickSize: 1.0 }));
const now = (w) => w.K.timeSystem.gameTime;
const yearOf = (w) => Math.floor(now(w) + 1e-9);
/** Kroki 1 civY do najbliższej granicy roku gry (bez jej przekroczenia: zwraca liczbę kroków DO granicy). */
const stepsToYearEnd = (w) => Math.round((yearOf(w) + 1 - now(w)) * 12);
const unitNo = (u) => Number(String(u.id).replace(/\D/g, '')) || 0;
const aiUnits = (w, emp) => w.gum.getAllUnits().filter(u => u.owner === emp).sort((a, b) => unitNo(a) - unitNo(b));
const onBody = (w, emp, pid) => w.gum.getUnitsOnPlanet(pid).filter(u => u.owner === emp);
const declare = (K, emp) => quiet(() => K.diplomacySystem.declareWar(emp, 'keeper_setup'));
const flagOf = (K, emp) => K.empireRegistry.get(emp)?.garrison ?? null;
const planFor = (K, emp) => GP.planEmpireGarrison(GP.readEmpireGarrisonSnapshot(K, emp), (pid) => GP.readGarrisonBodyContext(K, pid));
const regrown = (emp) => debugLog.query({ kind: 'garrison:regrown', empireId: emp });
const hexKeys = (units) => units.map(u => `${u.planetId}:${u.q},${u.r}`);
const noStack = (w) => { const k = hexKeys(w.gum.getAllUnits().filter(u => (u.hp ?? 0) > 0 && u.status !== 'in_cargo')); return new Set(k).size === k.length; };
/**
 * Świat po `years` latach gry, wojna z imperium `emps[idx]`, garnizon zmobilizowany wg planu. Uprząż po 40 latach:
 * emp_001 — stolica 2 + kolonia 1 (limit 3); po 70 latach emp_002 — stolica 4 (G G A G) + dwie placówki (limit 6).
 */
function mobilized({ years = 0, idx = 0, before = null } = {}) {
  const w = boot();
  if (years > 0) run(w, years * 12);
  const emp = w.emps[idx], peer = w.emps[1 - idx];
  before?.(w, emp);
  declare(w.K, emp);
  const plan = planFor(w.K, emp);
  const cap = w.K.directorProduction.capitalOf(emp)?.planetId ?? null;
  const other = plan.perBody.find(b => b.role !== 'capital')?.planetId ?? null;
  return { w, e1: emp, e2: peer, plan, cap, other, units0: aiUnits(w, emp).length };
}
const factoriesOf = (w, emp) => w.K.empireRegistry.getColoniesByEmpire(emp)
  .flatMap(c => [...(c.buildingSystem?._active?.values?.() ?? [])].filter(e => e?.building?.id === 'factory'));

// ── R0 — czyste funkcje i audyt ─────────────────────────────────────────────────────────
{
  console.log('\nR0 — planer: ranking niedoboru i archetyp odrastania; DebugLog śledzi ślad odrastania');
  const plan = { perBody: [
    { planetId: 'cap', role: 'capital', count: 7 }, { planetId: 'b1', role: 'colony', count: 1 },
    { planetId: 'b2', role: 'colony', count: 1 }, { planetId: 'b3', role: 'outpost', count: 1 },
  ] };
  const rank = (alive) => (call('garrisonShortfall', plan, new Map(Object.entries(alive))) ?? null)?.map(b => `${b.planetId}:${b.shortfall}`).join(' ') ?? null;
  assert(rank({ cap: 0, b1: 0, b2: 1, b3: 0 }) === 'cap:7 b1:1 b3:1',
    `R0a: największy niedobór pierwszy, remis wg kolejności planu, ciało pełne poza listą (${rank({ cap: 0, b1: 0, b2: 1, b3: 0 })})`);
  assert(rank({ cap: 6, b1: 0, b2: 0, b3: 1 }) === 'cap:1 b1:1 b2:1',
    `R0b: remis 1 = 1 — stolica pierwsza (${rank({ cap: 6, b1: 0, b2: 0, b3: 1 })})`);
  assert(rank({ cap: 7, b1: 1, b2: 1, b3: 1 }) === '' && rank({ cap: 9, b1: 0, b2: 1, b3: 1 }) === 'b1:1',
    `R0c: pełny plan — pusta lista; nadmiar na stolicy nie zabiera niedoboru innym (${rank({ cap: 9, b1: 0, b2: 1, b3: 1 })})`);
  const plan2 = { perBody: [
    { planetId: 'cap', role: 'capital', count: 7 }, { planetId: 'b1', role: 'colony', count: 1 },
    { planetId: 'b2', role: 'colony', count: 3 },
  ] };
  const rank2 = (call('garrisonShortfall', plan2, new Map(Object.entries({ cap: 6, b1: 0, b2: 0 }))) ?? null)
    ?.map(b => `${b.planetId}:${b.shortfall}`).join(' ') ?? null;
  assert(rank2 === 'b2:3 cap:1 b1:1',
    `R0g: niedobór przed kolejnością planu — ciało dalej w planie z większym niedoborem idzie pierwsze (${rank2})`);
  const comp = [G, G, A, G, G, A, G];
  const arch = (alive) => call('garrisonRegrowthArchetype', comp, alive);
  assert(arch([G, G, G, G, G, A]) === A && arch([G, G, A, G, A, G]) === G && arch([G, G, A, G, G, A, G]) === null,
    `R0d: archetyp — strata artylerii odrasta artylerią (${arch([G, G, G, G, G, A])}), strata garnizonu garnizonem ` +
    `(${arch([G, G, A, G, A, G])}), skład pokryty — null (${arch([G, G, A, G, G, A, G])})`);
  assert(arch([G, G, G, G, G, G]) === A && arch(['shock_infantry']) === G,
    `R0e: po zmianie szczebla (same garnizony) pierwsza nieobsadzona pozycja to artyleria (${arch([G, G, G, G, G, G])}); ` +
    `jednostka spoza składu niczego nie pokrywa (${arch(['shock_infantry'])})`);
  EventBus.emit('garrison:regrown', { empireId: 'r0_probe' });
  EventBus.emit('garrison:regrowthSkipped', { empireId: 'r0_probe' });
  EventBus.emit('garrison:r0_untracked', { empireId: 'r0_probe' });
  const seen = (k) => debugLog.query({ kind: k, empireId: 'r0_probe' }).length;
  assert(seen('garrison:regrown') === 1 && seen('garrison:regrowthSkipped') === 1,
    `R0f: DebugLog śledzi garrison:regrown i garrison:regrowthSkipped (${seen('garrison:regrown')}/${seen('garrison:regrowthSkipped')})`);
  assert(seen('garrison:r0_untracked') === 0, 'R0f kontrola: zdarzenie spoza listy NIE trafia do DebugLog — pin nie jest ślepy');
}

// ── R1 — jedna na rok, aż do limitu; niezmobilizowane — nic ───────────────────────────────
{
  console.log('\nR1 — strata całego garnizonu (3): dokładnie jedna jednostka na rok gry, aż do limitu, nigdy więcej');
  const s = mobilized({ years: 40 });
  const { w, e1, e2, plan, cap, other } = s;
  for (const u of aiUnits(w, e1)) w.gum.removeUnit(u.id);
  const t0 = now(w);
  assert(s.units0 === plan.limit && plan.limit === 3 && !!other && aiUnits(w, e1).length === 0 && Math.abs(t0 - 40) < 1e-6,
    `świadek: gy ${t0.toFixed(3)}, mobilizacja = plan (${s.units0}/${plan.limit}: stolica ${cap} ×2, ${other} ×1), cały garnizon stracony`);
  run(w, stepsToYearEnd(w) - 1);
  const before = aiUnits(w, e1).length;
  run(w, 1);
  const after1 = aiUnits(w, e1).length;
  assert(before === 0 && after1 === 1 && yearOf(w) === 41,
    `R1a: w roku mobilizacji nic (${before}), na granicy roku 41 dokładnie jedna (${after1})`);
  const counts = [after1];
  for (let y = 0; y < 4; y++) { run(w, 12); counts.push(aiUnits(w, e1).length); }
  assert(JSON.stringify(counts) === '[1,2,3,3,3]',
    `R1b: kolejne lata — po jednej, aż do limitu ${plan.limit}, potem bez zmian (${counts.join(' → ')})`);
  const ev = regrown(e1);
  assert(ev.length === 3 && JSON.stringify(ev.map(e => e.data?.year)) === '[41,42,43]',
    `R1c: ślad audytu — 3 × garrison:regrown, po jednym w latach ${ev.map(e => e.data?.year).join(', ')}`);
  assert(JSON.stringify(ev.map(e => e.data?.planetId)) === JSON.stringify([cap, cap, other]),
    `R1d: kolejność — stolica (niedobór 2), stolica (remis 1 = 1), potem ${other} (${ev.map(e => e.data?.planetId).join(', ')})`);
  const st2 = w.K.diplomacySystem.getStatus(e2);
  assert(st2 !== 'war' && flagOf(w.K, e2) === null && aiUnits(w, e2).length === 0 && regrown(e2).length === 0,
    `R1e kontrola: ${e2} niezmobilizowane (status ${st2}, flaga ${flagOf(w.K, e2)}) — po 5 latach 0 jednostek, 0 odrastań`);
  const res = w.K.garrisonSystem?.regrowEmpire?.(e2);
  assert(res?.ok === false && res?.reason === 'not_mobilized',
    `R1f: regrowEmpire dla imperium bez mobilizacji odmawia (${res?.reason ?? '—'})`);
  // Determinizm: ta sama scena w drugim świecie — te same ciała, heksy i archetypy w tych samych latach.
  const trace = (evs) => evs.map(e => { const u = e.data ?? {}; return `${u.year}:${u.planetId}:${u.archetypeId}:${w.gum.getUnit(u.unitId)?.q ?? '?'},${w.gum.getUnit(u.unitId)?.r ?? '?'}`; });
  const first = trace(ev);
  const s2 = mobilized({ years: 40 });
  for (const u of aiUnits(s2.w, s2.e1)) s2.w.gum.removeUnit(u.id);
  run(s2.w, stepsToYearEnd(s2.w)); run(s2.w, 12); run(s2.w, 12);
  const second = regrown(s2.e1).map(e => { const u = e.data ?? {}; const x = s2.w.gum.getUnit(u.unitId); return `${u.year}:${u.planetId}:${u.archetypeId}:${x?.q ?? '?'},${x?.r ?? '?'}`; });
  assert(first.length === 3 && JSON.stringify(second) === JSON.stringify(first),
    `R1h: deterministycznie — druga, niezależna partia daje to samo (${first.join(' | ')})`);
  // Wysoka prędkość: JEDEN tick przez trzy lata — trzy jednostki, po jednej na każdy rok (żaden rok nie przepada).
  const s3 = mobilized({ years: 40 });
  for (const u of aiUnits(s3.w, s3.e1)) s3.w.gum.removeUnit(u.id);
  quiet(() => s3.w.ticker.run(36, { tickSize: 36 }));
  const years3 = regrown(s3.e1).map(e => e.data?.year);
  assert(yearOf(s3.w) === 43 && aiUnits(s3.w, s3.e1).length === 3 && JSON.stringify(years3) === '[41,42,43]',
    `R1i: jeden tick przez 3 lata (gy ${now(s3.w).toFixed(3)}) — ${aiUnits(s3.w, s3.e1).length} jednostki, po jednej w latach ${years3.join(', ')}`);
}
{
  console.log('\nR1 — w pokoju też: wojna zakończona, strata, rok — jednostka odrasta');
  const s = mobilized({ years: 40 });
  const { w, e1, plan, cap } = s;
  w.K.diplomacySystem.relations.setStatus('player', e1, 'peace', {}, 'keeper_peace');
  w.gum.removeUnit(onBody(w, e1, cap)[0]?.id);
  const left = aiUnits(w, e1).length;
  run(w, 12);
  assert(w.K.diplomacySystem.getStatus(e1) === 'peace' && left === plan.limit - 1 && aiUnits(w, e1).length === plan.limit,
    `R1g: pokój (${w.K.diplomacySystem.getStatus(e1)}), strata 1 (${left}) → po roku ${aiUnits(w, e1).length}/${plan.limit}`);
}

// ── R2 — szczebel, morale, archetyp z TEJ chwili; ciało z największym niedoborem ─────────
{
  console.log('\nR2 — odrośnięta jednostka: szczebel, morale i archetyp drabiny z chwili tworzenia, nie z mobilizacji');
  // gy 70, emp_002: fabryki chwilowo na poziomie 1 (szczebel 0, morale 30, bez artylerii) na czas mobilizacji, potem
  // przywrócone (szczebel 3: limit 6, stolica G G A G, morale 100) — limit rośnie z 5 do 6.
  let saved = [];
  const s = mobilized({ years: 70, idx: 1, before: (w, emp) => {
    saved = factoriesOf(w, emp).map(e => [e, e.level]);
    for (const [e] of saved) e.level = 1;
  } });
  const { w, e1, plan, cap } = s;
  const capU0 = onBody(w, e1, cap);
  for (const [e, lv] of saved) e.level = lv;
  const plan2 = planFor(w.K, e1);
  const capPlan2 = plan2.perBody.find(b => b.planetId === cap);
  const want = GP.garrisonHexes(GP.readGarrisonBodyContext(w.K, cap), 1).hexes[0];
  assert(plan.tier.index === 0 && plan.limit === 5 && capU0.length === 3 && capU0.every(u => u.archetypeId === G && u.morale === 30)
      && plan2.tier.index === 3 && plan2.limit === 6 && (capPlan2?.composition ?? []).join() === [G, G, A, G].join(),
    `świadek: mobilizacja na szczeblu ${plan.tier.index} (limit ${plan.limit}, stolica ${capU0.length}× G morale 30); fabryki ` +
    `przywrócone → szczebel ${plan2.tier.index}, limit ${plan2.limit}, skład stolicy ${(capPlan2?.composition ?? []).map(a => a === A ? 'A' : 'G').join('')}`);
  run(w, stepsToYearEnd(w));
  const ev = regrown(e1);
  const nu = w.gum.getUnit(ev[0]?.data?.unitId);
  assert(ev.length === 1 && !!nu && nu.planetId === cap && nu.archetypeId === A && nu.morale === 100 && nu.maxMorale === 100
      && ev[0].data?.tier === 3,
    `R2a: bez żadnej straty limit urósł (5 → 6) — odrasta artyleria (${nu?.archetypeId}) z morale ${nu?.morale}/${nu?.maxMorale}, ` +
    `szczebel ${ev[0]?.data?.tier} — drabina z chwili tworzenia (pozycja 3 składu stolicy nieobsadzona)`);
  assert(!!nu && !!want && nu.q === want.q && nu.r === want.r && nu.owner === e1 && nu.factionId === e1 && (nu.popCost ?? 0) === 0,
    `R2b: heks = pierwszy wolny heks spirali D10 wokół kotwicy (${want?.q},${want?.r}); owner i factionId ${nu?.factionId}, POP 0 (createAIUnit)`);
  w.gum.removeUnit(capU0[0].id);
  run(w, 12);
  const nu2 = w.gum.getUnit(regrown(e1)[1]?.data?.unitId);
  assert(!!nu2 && nu2.planetId === cap && nu2.archetypeId === G && nu2.morale === 100 && nu2.deployState === 'deployed'
      && capU0.slice(1).every(u => w.gum.getUnit(u.id)?.morale === 30),
    `R2c: strata garnizonu stolicy — odrasta garnizon (${nu2?.archetypeId}, ${nu2?.deployState}) z morale ${nu2?.morale}; ` +
    `stare jednostki zostają z morale 30`);
}
{
  console.log('\nR2 — wybór ciała: największy niedobór, remis — stolica pierwsza');
  const s = mobilized({ years: 40 });
  const { w, e1, cap, other } = s;
  w.gum.removeUnit(onBody(w, e1, other)[0]?.id);
  w.gum.removeUnit(onBody(w, e1, cap)[0]?.id);
  run(w, 12); run(w, 12);
  const order = regrown(e1).map(e => e.data?.planetId);
  assert(!!other && JSON.stringify(order) === JSON.stringify([cap, other]),
    `R2d: strata po jednej na stolicy i na ${other} (remis 1 = 1) — najpierw stolica, rok później ${other} (${order.join(', ')})`);
}

// ── R3 — limit poniżej żywych ───────────────────────────────────────────────────────────
{
  console.log('\nR3 — limit poniżej żywych: nic nie powstaje, nic nie znika');
  const s = mobilized({ years: 40 });
  const { w, e1, plan, cap, other } = s;
  const free = GP.garrisonHexes(GP.readGarrisonBodyContext(w.K, other), 3).hexes;
  const extra = free.map(h => w.gum.createAIUnit({ archetypeId: G, empireId: e1, planetId: other, q: h.q, r: h.r, morale: 30, deployed: true })?.unit?.id);
  w.gum.removeUnit(onBody(w, e1, cap)[0]?.id);
  const ids0 = aiUnits(w, e1).map(u => u.id);
  run(w, 24);
  const ids2 = aiUnits(w, e1).map(u => u.id);
  assert(extra.filter(Boolean).length === 3 && ids0.length === plan.limit + 2,
    `świadek: +3 jednostki na ${other}, −1 na stolicy — żywych ${ids0.length} przy limicie ${plan.limit} (stolica ma niedobór 1)`);
  assert(JSON.stringify(ids2) === JSON.stringify(ids0) && regrown(e1).length === 0,
    `R3a: po 2 latach te same ${ids2.length} jednostki — nic nie powstało, nic nie zniknęło (garrison:regrown ×${regrown(e1).length})`);
  const res = w.K.garrisonSystem?.regrowEmpire?.(e1);
  assert(res?.ok === false && res?.reason === 'at_limit' && res?.alive === ids0.length && res?.limit === plan.limit,
    `R3b: regrowEmpire — „at_limit” (żywych ${res?.alive}, limit ${res?.limit})`);
}

// ── R4 — brak wolnego heksu ─────────────────────────────────────────────────────────────
{
  console.log('\nR4 — brak wolnego heksu: następne ciało; nigdzie — nic w tym roku; bez stosu');
  const s = mobilized({ years: 40 });
  const { w, e1, cap, other } = s;
  w.gum.removeUnit(onBody(w, e1, cap)[0]?.id);
  w.gum.removeUnit(onBody(w, e1, other)[0]?.id);
  // Stolica bez wolnego heksu: każdy kafel stolicy bez jednostki staje się oceanem (nie da się na nim stanąć).
  const col = w.cm.getColony(cap);
  const occ = new Set(w.gum.getUnitsOnPlanet(cap).map(u => `${u.q},${u.r}`));
  for (const t of col.grid.toArray()) if (t && !occ.has(`${t.q},${t.r}`)) t.type = 'ocean';
  const capFree = GP.garrisonHexes(GP.readGarrisonBodyContext(w.K, cap), 1).hexes.length;
  run(w, 12);
  const y1 = regrown(e1).map(e => e.data?.planetId);
  assert(capFree === 0 && JSON.stringify(y1) === JSON.stringify([other]),
    `R4a: stolica bez wolnego heksu (${capFree}) — jednostka roku idzie na następne ciało wg rankingu (${y1.join(',') || '—'})`);
  const n1 = aiUnits(w, e1).length;
  run(w, 12);
  const sk = debugLog.query({ kind: 'garrison:regrowthSkipped', empireId: e1 }).map(e => e.data?.reason);
  assert(aiUnits(w, e1).length === n1 && regrown(e1).length === 1 && JSON.stringify(sk) === '["no_free_hex"]',
    `R4b: rok później niedobór tylko na stolicy bez miejsca — nic (${n1} → ${aiUnits(w, e1).length}), ślad garrison:regrowthSkipped ${sk.join(',')}`);
  assert(noStack(w) && aiUnits(w, e1).length > 0, 'R4c: żadne dwie żywe jednostki na ziemi nie stoją na jednym heksie (bez stosu)');
}

// ── R5 — zapis w połowie roku ───────────────────────────────────────────────────────────
/** „Wczytanie”: świeży świat (to samo ziarno), gameState i jednostki z zapisu, zegar z zapisu — jak blok wczytania. */
function reload(gsSave, guSave, t) {
  const v = boot();
  gameState.restore(JSON.parse(JSON.stringify(gsSave)));
  v.gum.restore(JSON.parse(JSON.stringify(guSave)));
  v.K.timeSystem.gameTime = t;
  return v;
}
{
  console.log('\nR5 — zapis → wczytanie w połowie roku: następna jednostka przy domknięciu roku, raz');
  const s = mobilized();
  const { w, e1, cap } = s;
  for (const u of onBody(w, e1, cap).slice(0, 2)) w.gum.removeUnit(u.id);
  run(w, 6);                                                        // połowa roku 0
  const left = aiUnits(w, e1).length;
  const save = { gs: gameState.serialize(), gu: w.gum.serialize(), t: now(w) };
  assert(left === s.plan.limit - 2 && regrown(e1).length === 0 && yearOf(w) === 0,
    `świadek: zapis w połowie roku 0 (czas ${save.t.toFixed(3)}), ${left} jednostek (−2)`);
  assert(save.gs.empires?.[e1]?.garrison?.regrowthYear === 0,
    `R5 rekord: zapis niesie regrowthYear = rok mobilizacji (${save.gs.empires?.[e1]?.garrison?.regrowthYear})`);
  const v = reload(save.gs, save.gu, save.t);
  run(v, 5);
  const mid = aiUnits(v, e1).length;
  run(v, 1);
  const atEnd = aiUnits(v, e1).length;
  run(v, 11);
  const later = aiUnits(v, e1).length;
  assert(mid === left && atEnd === left + 1 && later === left + 1 && regrown(e1).length === 1 && yearOf(v) === 1,
    `R5a: po wczytaniu nic przed końcem roku (${mid}), przy domknięciu roku jedna (${atEnd}), do następnej granicy nic więcej (${later}); ` +
    `garrison:regrown ×${regrown(e1).length}`);
  // Zapis z ticku granicy roku, zanim ten system go rozliczył (autozapis słucha time:tick wcześniej): rok 1 nierozliczony.
  const s2 = mobilized();
  for (const u of onBody(s2.w, s2.e1, s2.cap).slice(0, 2)) s2.w.gum.removeUnit(u.id);
  run(s2.w, 12);
  const gs2 = JSON.parse(JSON.stringify(gameState.serialize()));
  gs2.empires[s2.e1].garrison.regrowthYear = 0;                     // rok 1 jeszcze nierozliczony w chwili zapisu
  const gu2 = JSON.parse(JSON.stringify(s2.w.gum.serialize()));
  const lost2 = gu2.units.filter(u => u.owner === s2.e1).length;
  const regrownId = regrown(s2.e1)[0]?.data?.unitId;
  gu2.units = gu2.units.filter(u => u.id !== regrownId);            // ... i jednostki roku 1 jeszcze nie ma
  const v2 = reload(gs2, gu2, now(s2.w));
  const pre = aiUnits(v2, s2.e1).length;
  run(v2, 1);
  const post = aiUnits(v2, s2.e1).length;
  run(v2, 10);
  assert(!!regrownId && pre === lost2 - 1 && post === pre + 1 && aiUnits(v2, s2.e1).length === post && regrown(s2.e1).length === 1
      && flagOf(v2.K, s2.e1)?.regrowthYear === 1,
    `R5b: zapis z granicy roku z rokiem nierozliczonym — pierwszy tick po wczytaniu rozlicza go raz (${pre} → ${post}, potem ${aiUnits(v2, s2.e1).length}), regrowthYear ${flagOf(v2.K, s2.e1)?.regrowthYear}`);
}

// ── R6 — zapis sprzed G3 ────────────────────────────────────────────────────────────────
{
  console.log('\nR6 — zapis sprzed G3 (flaga bez regrowthYear): odrastanie rusza bez migracji, bez nadrabiania lat');
  const s = mobilized();
  const { w, e1, cap } = s;
  for (const u of onBody(w, e1, cap).slice(0, 2)) w.gum.removeUnit(u.id);
  const gs = JSON.parse(JSON.stringify(gameState.serialize()));
  delete gs.empires[e1].garrison.regrowthYear;
  const gu = w.gum.serialize();
  const t = 5.5;                                                    // wczytanie 5,5 roku po mobilizacji
  const v = reload(gs, gu, t);
  const pre = aiUnits(v, e1).length;
  run(v, 1);
  const first = { n: aiUnits(v, e1).length, ry: flagOf(v.K, e1)?.regrowthYear };
  run(v, stepsToYearEnd(v));
  const atBoundary = aiUnits(v, e1).length;
  assert(gs.empires[e1].garrison.mobilized === true && !('regrowthYear' in gs.empires[e1].garrison) && pre === s.plan.limit - 2,
    `świadek: rekord flagi bez regrowthYear (mobilized ${gs.empires[e1].garrison.mobilized}), ${pre} jednostek (−2), wczytanie w ${t}`);
  assert(first.n === pre && first.ry === 5 && regrown(e1).length <= 1,
    `R6a: pierwsza kontrola tylko ustawia bieżący rok (regrowthYear ${first.ry}), bez nadrabiania 5 lat (${pre} → ${first.n})`);
  assert(atBoundary === pre + 1 && regrown(e1).length === 1 && yearOf(v) === 6,
    `R6b: przy granicy roku 6 odrasta jedna (${pre} → ${atBoundary}) — bez migracji`);
}

// ── R7 — uzgadnianie co rok (Finding 360) ───────────────────────────────────────────────
{
  console.log('\nR7 — wojna bez zdarzenia: mobilizacja przy kontroli rocznej, raz');
  const w = boot();
  const [e1] = w.emps;
  run(w, 1);                                                        // zatrzask pierwszego ticku zużyty (pokój)
  w.K.diplomacySystem.relations.setStatus('player', e1, 'war', {}, 'keeper_no_event');
  run(w, stepsToYearEnd(w) - 1);
  const before = { flag: flagOf(w.K, e1), n: aiUnits(w, e1).length, st: w.K.diplomacySystem.getStatus(e1) };
  run(w, 1);
  const f = flagOf(w.K, e1);
  assert(before.st === 'war' && before.flag === null && before.n === 0,
    `świadek: wojna ustawiona bez zdarzenia po pierwszym ticku; do końca roku bez mobilizacji (flaga ${before.flag}, ${before.n} jednostek)`);
  assert(f?.mobilized === true && f?.reason === 'reconcile_yearly' && aiUnits(w, e1).length === f.created && f.created >= 2,
    `R7a: granica roku — mobilizacja (${f?.reason}), ${aiUnits(w, e1).length} jednostek planu`);
  run(w, 24);
  const evs = debugLog.query({ kind: 'garrison:mobilized', empireId: e1 }).length;
  assert(evs === 1 && flagOf(w.K, e1)?.reason === 'reconcile_yearly',
    `R7b: raz — po dwóch kolejnych latach garrison:mobilized ×${evs}`);
}
{
  console.log('\nR7 — imperium bez pełnej kolonii w chwili wojny: mobilizuje się przy kontroli rocznej po odzyskaniu stolicy');
  const w = boot();
  const [e1] = w.emps;
  run(w, 1);
  const full = w.K.empireRegistry.getColoniesByEmpire(e1).filter(c => !c.isOutpost);
  for (const c of full) c.isOutpost = true;                         // chwilowo bez pełnej kolonii (bez stolicy, D12)
  declare(w.K, e1);
  const skipped = debugLog.query({ kind: 'garrison:mobilizeSkipped', empireId: e1 }).map(e => e.data?.reason);
  for (const c of full) c.isOutpost = false;                        // kolonia znów pełna
  run(w, stepsToYearEnd(w) - 1);
  const mid = flagOf(w.K, e1);
  run(w, 1);
  const f = flagOf(w.K, e1);
  assert(full.length >= 1 && skipped.includes('no_capital') && mid === null,
    `świadek: wojna przy braku pełnej kolonii — mobilizeSkipped ${skipped.join(',')}; do końca roku bez flagi (${mid})`);
  assert(f?.mobilized === true && f?.reason === 'reconcile_yearly' && aiUnits(w, e1).length === f.created && f.created >= 2,
    `R7c: przy granicy roku — mobilizacja (${f?.reason}, ${aiUnits(w, e1).length} jednostek)`);
}
{
  console.log('\nR7 — kontrola: imperium w pokoju nie mobilizuje się przy kontroli rocznej');
  const w = boot();
  const [e1, e2] = w.emps;
  run(w, 30);
  assert(w.K.diplomacySystem.getStatus(e1) !== 'war' && flagOf(w.K, e1) === null && flagOf(w.K, e2) === null && aiUnits(w, e1).length === 0,
    `R7 kontrola: ${yearOf(w)} granice roku w pokoju — bez flagi i bez jednostek`);
}

// ── R8 — G3-3: widoczność garnizonu (funkcja, którą woła UI) ────────────────────────────
const readout = (K, pid) => (typeof ROmod?.readGarrisonReadout === 'function' ? ROmod.readGarrisonReadout(K, pid) : undefined);
const readoutText = (r) => (typeof ROmod?.formatGarrisonReadout === 'function' ? ROmod.formatGarrisonReadout(r) : undefined);
/** Poziom wywiadu jak `KOSMOS.debug.setIntel` (`GameScene`): surowe zejście do `unknown`, potem `advanceIntel`. */
function setIntel(K, emp, level) {
  gameState.set(`intel.${emp}`, { level: 'unknown', knownColonies: [], knownTech: [], lastIncidents: [],
    knownMilitary: null, knownReserve: null, knownCrewCapacity: null }, 'keeper_set_intel_reset');
  if (level !== 'unknown') K.intelSystem.advanceIntel(emp, level, 'keeper_set_intel');
  return K.intelSystem.getLevel(emp);
}
/** Ciało bez kolonii w układzie domowym (niczyje). */
function neutralBody(w) {
  const sys = EntityManager.get(w.K.homePlanet.id)?.systemId;
  return ['moon', 'planet', 'planetoid'].flatMap(tp => EntityManager.getByType(tp))
    .find(b => b.systemId === sys && b.id !== w.K.homePlanet.id && !w.cm.getColony(b.id)) ?? null;
}
{
  console.log('\nR8 — odczyt garnizonu: „detailed” = jednostki na ciele; przed mobilizacją — rezerwa planu; poniżej — nieznany');
  const w = boot();
  run(w, 40 * 12);
  const [e1] = w.emps;
  const plan = planFor(w.K, e1);
  const cap = w.K.directorProduction.capitalOf(e1)?.planetId;
  const other = plan.perBody.find(b => b.role !== 'capital')?.planetId;
  const capPlanned = plan.perBody.find(b => b.planetId === cap)?.count;
  const lv = [setIntel(w.K, e1, 'unknown'), readout(w.K, cap)];
  const lvC = [setIntel(w.K, e1, 'contact'), readout(w.K, cap)];
  assert(lv[0] === 'unknown' && lvC[0] === 'contact' && !!cap && !!other,
    `świadek: wywiad o ${e1}: ${lv[0]} → ${lvC[0]}; stolica ${cap} (plan ${capPlanned}), ${other}`);
  assert(typeof ROmod?.readGarrisonReadout === 'function' && typeof ROmod?.formatGarrisonReadout === 'function',
    'R8 moduł: GarrisonReadout eksportuje readGarrisonReadout i formatGarrisonReadout (jedno źródło karty i okna zrzutu)');
  assert(lv[1]?.kind === 'unknown' && lv[1]?.count === null && lvC[1]?.kind === 'unknown'
      && readoutText(lvC[1]) === t('garrison.readout.unknown'),
    `R8a: poniżej „detailed” — nieznany (unknown: ${lv[1]?.kind}, contact: ${lvC[1]?.kind}, tekst „${readoutText(lvC[1])}”)`);
  setIntel(w.K, e1, 'detailed');
  const rc = readout(w.K, cap), ro = readout(w.K, other);
  assert(flagOf(w.K, e1) === null && aiUnits(w, e1).length === 0 && rc?.kind === 'reserve' && rc?.count === capPlanned
      && ro?.kind === 'reserve' && ro?.count === 1 && readoutText(rc) === t('garrison.readout.reserve', capPlanned),
    `R8b: „detailed” przed mobilizacją — rezerwa planu, oznaczona (stolica ${rc?.kind}:${rc?.count}, ${other} ${ro?.kind}:${ro?.count}; „${readoutText(rc)}”)`);
  declare(w.K, e1);
  const actual = onBody(w, e1, cap).length;
  const ru = readout(w.K, cap);
  assert(ru?.kind === 'units' && ru?.count === actual && actual === capPlanned && readoutText(ru) === t('garrison.readout.units', actual),
    `R8c: po mobilizacji — liczba jednostek na ciele (${ru?.kind}:${ru?.count} = ${actual}; „${readoutText(ru)}”)`);
  w.gum.removeUnit(onBody(w, e1, cap)[0]?.id);
  const rd = readout(w.K, cap);
  run(w, stepsToYearEnd(w));
  const rr = readout(w.K, cap);
  assert(rd?.count === actual - 1 && rr?.count === actual && rr?.count === onBody(w, e1, cap).length,
    `R8d: odczyt = jednostki naprawdę stojące na ciele — po stracie ${rd?.count}, po odrośnięciu ${rr?.count}`);
  const hx = GP.garrisonHexes(GP.readGarrisonBodyContext(w.K, cap), 1).hexes[0];
  const pu = hx ? w.gum.createUnit('shock_infantry', cap, hx.q, hx.r, { owner: 'player', factionId: 'humanity' }) : null;
  const rp = readout(w.K, cap);
  assert(!!pu && w.gum.getUnitsOnPlanet(cap).length === actual + 1 && rp?.count === actual,
    `R8d': jednostka gracza na tym ciele nie liczy się do garnizonu (na ciele ${w.gum.getUnitsOnPlanet(cap).length}, odczyt ${rp?.count})`);
  const nb = neutralBody(w);
  assert(readout(w.K, w.K.homePlanet.id) === null && !!nb && readout(w.K, nb.id) === null,
    `R8e: kolonia gracza i ciało bez kolonii (${nb?.id}) — bez odczytu (null)`);
  // Finding 379 (odpowiedź (h) właściciela 2026-10-05): własne jednostki gracza na ciele odsłaniają garnizon także
  //   bez wywiadu — fail-closed wywiadu mierzymy bez nich (jednostka gracza z R8d' zdjęta).
  w.gum.removeUnit(pu?.id);
  const intelSys = w.K.intelSystem;
  w.K.intelSystem = null;
  const rn = readout(w.K, cap);
  w.K.intelSystem = intelSys;
  assert(rn?.kind === 'unknown', `R8f: bez modułu wywiadu — nieznany, nie liczba (fail-closed: ${rn?.kind})`);
}
/** Karta ciała tak, jak rysuje ją gra (`BottomContext.draw` na atrapie ctx) — wszystkie napisy drugiej klatki. */
function renderCard(entity) {
  const texts = () => {
    const out = [];
    const noop = () => {};
    return {
      out, canvas: { width: 1280, height: 720 }, measureText: (s) => ({ width: String(s).length * 6 }),
      save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, fill: noop, clip: noop,
      rect: noop, fillRect: noop, strokeRect: noop, closePath: noop, arc: noop, translate: noop, setLineDash: noop,
      roundRect: noop, ellipse: noop, createLinearGradient: () => ({ addColorStop: noop }),
      fillText: (s) => out.push(String(s)), strokeText: (s) => out.push(String(s)),
      font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: 'left', globalAlpha: 1, shadowColor: '', shadowBlur: 0,
    };
  };
  const bc = new BottomContext();
  bc.draw(texts(), 1280, 720, entity);                 // pierwsza klatka = fade-in
  const ctx2 = texts();
  bc.draw(ctx2, 1280, 720, entity);
  return ctx2.out;
}
/** Okno zrzutu desantu tak, jak otwiera je gra (`showDropTroopsModal` na atrapie DOM z env.js) — wszystkie napisy. */
function dropModalTexts(w, dockedAt) {
  const v = w.K.vesselManager.createAndRegister('hull_small', w.K.homePlanet.id);
  v.troopCapacity = 12; v.troopBayUsed = 0; v.groundUnits = [];
  const home = w.cm.getColony(w.K.homePlanet.id);
  const land = home.grid.toArray().find(t0 => t0 && !t0.capitalBase && !t0.buildingId && t0.type !== 'ocean'
    && w.gum.getUnitsAtHex(home.planetId, t0.q, t0.r).length === 0);
  const u = w.gum.createUnit('shock_infantry', home.planetId, land.q, land.r, { owner: 'player', factionId: 'humanity' });
  const loaded = VS.loadGroundUnit(v, u)?.ok === true;
  v.position.dockedAt = dockedAt;
  const before = document.body.children.length;
  showDropTroopsModal(v, 'X');
  const overlay = document.body.children[before] ?? null;
  const nodes = [];
  const walk = (n) => { if (!n || typeof n !== 'object') return; nodes.push(n); for (const c of n.children ?? []) walk(c); };
  walk(overlay);
  if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
  return { loaded, opened: !!overlay, texts: nodes.map(n => n.textContent).filter(s => typeof s === 'string' && s.length > 0) };
}
{
  console.log('\nR8 — powierzchnie: karta ciała i okno zrzutu desantu pokazują ten sam odczyt (PL i EN)');
  const w = boot();
  run(w, 40 * 12);
  const [e1] = w.emps;
  const cap = w.K.directorProduction.capitalOf(e1)?.planetId;
  const body = EntityManager.get(cap);
  const label = t('garrison.readout.label') + ': ';
  setIntel(w.K, e1, 'contact');
  const cardUnknown = renderCard(body);
  const dropUnknown = dropModalTexts(w, cap);
  assert(cardUnknown.length > 3 && dropUnknown.opened && dropUnknown.loaded,
    `świadek: karta ciała ${body?.name} narysowana (${cardUnknown.length} napisów), okno zrzutu otwarte z jednostką w ładowni`);
  assert(cardUnknown.includes(label) && cardUnknown.includes(t('garrison.readout.unknown'))
      && dropUnknown.texts.includes(t('garrison.readout.dropLine', t('garrison.readout.unknown'))),
    `R8g: poniżej „detailed” — karta „${label}${t('garrison.readout.unknown')}”, okno „${t('garrison.readout.dropLine', t('garrison.readout.unknown'))}”`);
  setIntel(w.K, e1, 'detailed');
  const cardReserve = renderCard(body);
  const capPlanned = planFor(w.K, e1).perBody.find(b => b.planetId === cap)?.count;
  assert(cardReserve.includes(t('garrison.readout.reserve', capPlanned)),
    `R8h: „detailed” przed mobilizacją — karta pokazuje rezerwę (${t('garrison.readout.reserve', capPlanned)})`);
  declare(w.K, e1);
  const n = onBody(w, e1, cap).length;
  const cardUnits = renderCard(body);
  const dropUnits = dropModalTexts(w, cap);
  assert(n >= 1 && cardUnits.includes(t('garrison.readout.units', n))
      && dropUnits.texts.includes(t('garrison.readout.dropLine', t('garrison.readout.units', n))),
    `R8i: po mobilizacji — karta „${t('garrison.readout.units', n)}”, okno „${t('garrison.readout.dropLine', t('garrison.readout.units', n))}”`);
  const own = renderCard(EntityManager.get(w.K.homePlanet.id));
  const dropOwn = dropModalTexts(w, w.K.homePlanet.id);
  assert(own.length > 3 && !own.includes(label) && dropOwn.opened && !dropOwn.texts.some(s => s.startsWith(t('garrison.readout.dropLine', '').trim())),
    'R8j kontrola: karta i okno zrzutu nad WŁASNĄ kolonią — bez wiersza garnizonu (pin nie łapie każdego ciała)');
  const prev = getLocale();
  const both = {};
  for (const loc of ['pl', 'en']) {
    setLocale(loc);
    both[loc] = ['label', 'units', 'reserve', 'unknown', 'dropLine'].map(k => t(`garrison.readout.${k}`, 3));
  }
  setLocale(prev);
  assert(['pl', 'en'].every(loc => both[loc].every((s, i) => s && !s.startsWith('garrison.readout.'))) && both.pl.join() !== both.en.join(),
    `R8k: klucze PL i EN istnieją i się różnią (PL: ${both.pl.join(' | ')}; EN: ${both.en.join(' | ')})`);
}

// ── R9 — G3-4: jeden wpis w Dzienniku przy mobilizacji, tylko przy kontakcie ────────────
/** Świat z Dziennikiem i dzwonkiem (GameCore ich nie montuje; po boocie, bo boot czyści EventBus). */
function bootJournal(years = 40) {
  const w = boot();
  if (years > 0) run(w, years * 12);
  w.K.eventLogSystem = new EventLogSystem();
  w.K.notificationCenter = new NotificationCenter();
  return w;
}
const mobLines = (w) => (w.K.eventLogSystem?.getEntries?.() ?? []).filter(e => /🛡/.test(e.text));
{
  console.log('\nR9 — mobilizacja garnizonów imperium z kontaktem: JEDEN wpis w Dzienniku; bez kontaktu — nic');
  const w = bootJournal();
  const [e1, e2] = w.emps;
  setIntel(w.K, e1, 'contact');
  setIntel(w.K, e2, 'rumor');
  const bell0 = w.K.notificationCenter.getActiveCount();
  declare(w.K, e1);
  declare(w.K, e2);
  const lines = mobLines(w);
  const want1 = t('event.garrison.mobilized', t('intel.unknownEmpire'));
  const mob = (emp) => debugLog.query({ kind: 'garrison:mobilized', empireId: emp }).length;
  assert(mob(e1) === 1 && mob(e2) === 1,
    `świadek: oba imperia zmobilizowane (garrison:mobilized ${e1} ×${mob(e1)}, ${e2} ×${mob(e2)})`);
  assert(lines.length === 1 && lines[0].text === want1 && lines[0].channel === 'intel' && lines[0].severity === 'warn',
    `R9a: jeden wpis — ${e1} (kontakt, nazwa dopiero przy „detailed”): „${lines[0]?.text}” [${lines[0]?.channel}/${lines[0]?.severity}]`);
  assert(!lines.some(l => l.text !== want1) && w.K.notificationCenter.getActiveCount() === bell0,
    `R9b: ${e2} (rumor) — bez wpisu; dzwonek bez zmian (${bell0} → ${w.K.notificationCenter.getActiveCount()})`);
  w.K.diplomacySystem.relations.setStatus('player', e1, 'peace', {}, 'keeper_peace');
  w.gum.removeUnit(aiUnits(w, e1)[0]?.id);
  declare(w.K, e1);
  run(w, stepsToYearEnd(w));
  assert(mobLines(w).length === 1 && regrown(e1).length === 1,
    `R9c: druga wojna i odrośnięta jednostka (garrison:regrown ×${regrown(e1).length}) — bez drugiego wpisu (${mobLines(w).length})`);
}
{
  console.log('\nR9 — „detailed”: wpis z nazwą imperium i liczbą jednostek; mobilizacja przy kontroli rocznej — też jeden wpis');
  const w = bootJournal();
  const [e1] = w.emps;
  setIntel(w.K, e1, 'detailed');
  run(w, 1);
  w.K.diplomacySystem.relations.setStatus('player', e1, 'war', {}, 'keeper_no_event');
  run(w, stepsToYearEnd(w));
  const f = flagOf(w.K, e1);
  const name = w.K.empireRegistry.get(e1)?.name;
  const lines = mobLines(w);
  assert(f?.reason === 'reconcile_yearly' && Number.isFinite(f?.created) && !!name,
    `świadek: mobilizacja przy kontroli rocznej (${f?.reason}, ${f?.created} jedn.)`);
  assert(lines.length === 1 && lines[0].text === t('event.garrison.mobilizedCount', name, f.created),
    `R9d: jeden wpis z nazwą i liczbą („${lines[0]?.text}”)`);
}
{
  console.log('\nR9 — teksty PL i EN');
  const prev = getLocale();
  const both = {};
  for (const loc of ['pl', 'en']) {
    setLocale(loc);
    both[loc] = [t('event.garrison.mobilized', 'X'), t('event.garrison.mobilizedCount', 'X', 3)];
  }
  setLocale(prev);
  assert(['pl', 'en'].every(loc => both[loc].every(s => s.includes('X') && !s.startsWith('event.garrison.'))) && both.pl[0] !== both.en[0]
      && both.pl[1].includes('3') && both.en[1].includes('3'),
    `R9e: PL „${both.pl.join(' | ')}”; EN „${both.en.join(' | ')}”`);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
