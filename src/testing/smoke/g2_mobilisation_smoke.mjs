// G2-3b — AI GARRISON: MOBILIZACJA garnizonów AI (D15) wg planera G2-3a.
//
// Decyzje (`docs/design/AI_GARRISON_PLAN.md` §1): D15 mobilizacja RAZ na imperium, przy jego pierwszej wojnie
// (flaga w `empires.<id>`), zaczep `diplomacy:warDeclared`; zapis wczytany już w wojnie mobilizuje się na
// PIERWSZYM ticku · D6 `garrison_unit` stoi `deployed` · tworzenie WYŁĄCZNIE przez `createAIUnit` (G2-1) ·
// odpowiedź (f): jednostka bez wolnego heksu nie powstaje i zostaje w rezerwie, bez stosu · imperium bez
// pełnej kolonii nie mobilizuje niczego i flagi nie dostaje · jednostki zostają po wojnie.
//
//   M0  montaż: `GameCore` montuje `K.garrisonSystem`; `GameScene` konstruuje i wystawia go w lokatorze PRZED
//       blokiem wczytania (pin źródłowy — `GameScene` nie importuje się pod node); `DebugLog` śledzi zdarzenia.
//   M1  pokój: imperium AI nie ma jednostek naziemnych; wypowiedzenie wojny: powstają jednostki PLANU — te
//       same ciała, heksy, archetypy, morale i stan rozłożenia (świat z bootu i świat po 40 latach gry).
//   M2  flaga ustawiana raz; druga wojna nie tworzy niczego (także po stracie jednostki).
//   M3  zapis → wczytanie zachowuje jednostki i flagę; na pierwszym ticku nic nie powstaje ponownie
//       (kontrola: ten sam zapis BEZ flagi i jednostek — mobilizuje się, więc zatrzask żyje).
//   M4  stan wojny bez flagi (starszy zapis, status ustawiony bez zdarzenia): mobilizacja na pierwszym ticku, raz.
//   M5  brak wolnego heksu: nadwyżka nie powstaje (rezerwa w rekordzie flagi), nic nie stoi w stosie.
//   M6  utworzone jednostki przeżywają 10 civY przy 0 Kr (prawdziwe utrzymanie i `SupplyCoverageSystem`),
//       są żywymi obrońcami; desant gracza w wojnie — stolica nie przechodzi, dopóki żyje obrońca.
//   M7  (C-S2, D6) ciało zmienia właściciela przez przejęcie, cesję i przerzut: jednostki POPRZEDNIEGO właściciela
//       na nim znikają, inne ciała nietknięte; ślad audytu `garrison:unitsRemoved`.
//   M8  (C-S2, D16) ciało zniszczone: nie zostaje na nim żadna jednostka imperium AI (właściciela ani trzeciej
//       strony). ⚠ Jednostka GRACZA zostaje jak dziś — jej los to decyzja właściciela (pin „otwarte”).
//   M10 żywy fixture GATE-S4, wypowiedziana wojna: utworzony garnizon = tabela planera (13 na imperium).
//
// ⚠ `GarrisonSystem` ładowany DYNAMICZNIE: przed G2-3b go nie ma, a import statyczny wywróciłby plik i żaden
//   pin nie dostałby koloru (lekcja „pin musi degradować, nie przerywać”).
// ⚠ Każdy pin wykluczający ma ŚWIADKA; świadek stanu wejściowego to MIGAWKA sprzed akcji.

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import debugLog from '../../core/DebugLog.js';
import { HexGrid } from '../../map/HexGrid.js';
import { isStandableTile } from '../../data/GroundUnitData.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { InvasionSystem } from '../../systems/InvasionSystem.js';
import { SupplyCoverageSystem } from '../../systems/SupplyCoverageSystem.js';
import { EmpireRegistry } from '../../systems/EmpireRegistry.js';
import { DiplomacySystem } from '../../systems/DiplomacySystem.js';
import { GroundUnitManager } from '../../systems/GroundUnitManager.js';
import { DirectorProduction } from '../../systems/director/DirectorProduction.js';
import { planEmpireGarrison, readEmpireGarrisonSnapshot, readGarrisonBodyContext } from '../../utils/GarrisonPlanner.js';

let GSmod = null;
try { GSmod = await import('../../systems/GarrisonSystem.js'); } catch { GSmod = null; }

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const G = 'garrison_unit', A = 'rocket_artillery';

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
const unitNo = (u) => Number(String(u.id).replace(/\D/g, '')) || 0;
const aiUnits = (w, emp) => w.gum.getAllUnits().filter(u => u.owner === emp).sort((a, b) => unitNo(a) - unitNo(b));
const planFor = (K, emp) => planEmpireGarrison(readEmpireGarrisonSnapshot(K, emp), (pid) => readGarrisonBodyContext(K, pid));
const flagOf = (K, emp) => K.empireRegistry.get(emp)?.garrison ?? null;
const declare = (K, emp) => quiet(() => K.diplomacySystem.declareWar(emp, 'keeper_setup'));
const hexesOf = (plan) => plan.perBody.reduce((s, b) => s + (b.hexes?.hexes?.length ?? 0), 0);

/** Czy jednostki imperium to DOKŁADNIE plan: ciała, heksy, archetypy, morale, rozłożenie, właściciel, POP. */
function matchesPlan(units, plan, emp) {
  const bad = [];
  let expected = 0;
  for (const body of plan.perBody) {
    const hx = body.hexes?.hexes ?? [];
    const got = units.filter(u => u.planetId === body.planetId);
    expected += hx.length;
    if (got.length !== hx.length) { bad.push(`${body.planetId}: ${got.length} jednostek, plan ${hx.length}`); continue; }
    got.forEach((u, i) => {
      const arch = body.composition[i];
      const want = { arch, q: hx[i].q, r: hx[i].r, morale: body.morale, deploy: arch === G ? 'deployed' : null };
      const have = { arch: u.archetypeId, q: u.q, r: u.r, morale: u.morale, deploy: u.deployState ?? null };
      if (JSON.stringify(want) !== JSON.stringify(have) || u.maxMorale !== body.morale ||
          u.factionId !== emp || (u.popCost ?? 0) !== 0) {
        bad.push(`${u.id}@${body.planetId}: ${JSON.stringify(have)} ≠ ${JSON.stringify(want)}`);
      }
    });
  }
  if (units.length !== expected) bad.push(`razem ${units.length}, plan ${expected}`);
  return { ok: bad.length === 0 && expected > 0, bad, expected };
}

// ── M0 — montaż ──────────────────────────────────────────────────────────────────────────
{
  console.log('\nM0 — montaż: GameCore, GameScene (źródło), DebugLog');
  const w = boot();
  const GS = GSmod?.GarrisonSystem;
  assert(typeof GS === 'function' && w.K.garrisonSystem instanceof GS,
    `M0a: GameCore montuje K.garrisonSystem (instancja GarrisonSystem: ${!!GS && w.K.garrisonSystem instanceof GS})`);
  assert(typeof w.K.empireRegistry.isGarrisonMobilized === 'function' && typeof w.K.empireRegistry.markGarrisonMobilized === 'function',
    'M0b: EmpireRegistry ma odczyt isGarrisonMobilized i intencję markGarrisonMobilized (właściciel domeny empires)');
  const gsrc = strip(readFileSync(new URL('../../scenes/GameScene.js', import.meta.url), 'utf8'));
  const iImport  = gsrc.search(/import\s*\{\s*GarrisonSystem\s*\}\s*from\s*'\.\.\/systems\/GarrisonSystem\.js'/);
  const iNew     = gsrc.search(/this\.garrisonSystem\s*=\s*new\s+GarrisonSystem\(\s*\)/);
  const iMount   = gsrc.search(/window\.KOSMOS\.garrisonSystem\s*=\s*this\.garrisonSystem/);
  const iRestore = gsrc.search(/gameState\.restore\(\s*c4x\.gameState\s*\)/);
  assert(iImport >= 0 && iNew >= 0 && iMount >= 0 && iRestore > 0 && iNew < iRestore && iMount < iRestore,
    `M0c: GameScene importuje, konstruuje i wystawia garrisonSystem PRZED gameState.restore (pozycje ${iImport}/${iNew}/${iMount} < ${iRestore})`);
  assert(iRestore > 0, 'M0c kontrola: kotwica bloku wczytania istnieje w źródle GameScene — pin nie jest ślepy');
  let csrc = '';
  try { csrc = strip(readFileSync(new URL('../../systems/GarrisonSystem.js', import.meta.url), 'utf8')); } catch { csrc = ''; }
  assert(csrc.length > 0 && /createAIUnit\(/.test(csrc) && !/\.createUnit\(/.test(csrc),
    'M0d: pin źródłowy — GarrisonSystem tworzy jednostki WYŁĄCZNIE przez createAIUnit (nigdy createUnit)');
  EventBus.emit('garrison:mobilized', { empireId: 'm0_probe' });
  EventBus.emit('garrison:mobilizeSkipped', { empireId: 'm0_probe' });
  EventBus.emit('garrison:m0_untracked', { empireId: 'm0_probe' });
  const seen = (k) => debugLog.query({ kind: k, empireId: 'm0_probe' }).length;
  assert(seen('garrison:mobilized') === 1 && seen('garrison:mobilizeSkipped') === 1,
    `M0e: DebugLog śledzi garrison:mobilized i garrison:mobilizeSkipped (${seen('garrison:mobilized')}/${seen('garrison:mobilizeSkipped')})`);
  assert(seen('garrison:m0_untracked') === 0, 'M0e kontrola: zdarzenie spoza listy NIE trafia do DebugLog — pin nie jest ślepy');
}

// ── M1 — pokój: zero; wojna: jednostki planu ─────────────────────────────────────────────
{
  console.log('\nM1 — pokój: zero jednostek AI; wojna: jednostki planu (świat z bootu)');
  const w = boot();
  const [e1, e2] = w.emps;
  const plan1 = planFor(w.K, e1);                      // MIGAWKA planu sprzed wojny
  const statusBefore = [w.K.diplomacySystem.getStatus(e1), w.K.diplomacySystem.getStatus(e2)];
  const before = aiUnits(w, e1).length + aiUnits(w, e2).length;
  assert(statusBefore.every(s => s === 'peace') && before === 0 && hexesOf(plan1) >= 2,
    `świadek: pokój (${statusBefore.join('/')}), 0 jednostek AI, plan ${e1}: ${hexesOf(plan1)} jednostek na ${plan1.perBody.length} ciałach`);
  const ok = declare(w.K, e1);
  const u1 = aiUnits(w, e1);
  const m = matchesPlan(u1, plan1, e1);
  assert(ok === true && m.ok,
    `M1a: wojna ⇒ jednostki ${e1} = plan (${u1.length}/${m.expected}; rozjazdy: ${m.bad.slice(0, 3).join(' | ') || '—'})`);
  assert(u1.length > 0 && u1.every(u => u.owner === e1 && u.factionId === e1 && u.status === 'idle'),
    `M1b: owner I factionId = ${e1}, status idle (poza utrzymaniem i limitem gracza)`);
  assert(aiUnits(w, e2).length === 0 && flagOf(w.K, e2) === null,
    `M1c kontrola: ${e2} bez wojny — zero jednostek, brak flagi (mobilizacja jest per imperium)`);
}
{
  console.log('\nM1 — ten sam kontrakt w świecie po 40 latach gry (kolonia, placówka, szczebel 1)');
  const w = boot();
  run(w, 40 * 12);
  for (const emp of w.emps) {
    const plan = planFor(w.K, emp);
    const pre = aiUnits(w, emp).length;
    const st = w.K.diplomacySystem.getStatus(emp);
    assert(st === 'peace' && pre === 0 && plan.perBody.length >= 2 && hexesOf(plan) >= 3,
      `świadek gy 40: ${emp} pokój, 0 jednostek; plan: szczebel ${plan.tier.index} (morale ${plan.tier.morale}), ` +
      `${plan.perBody.map(b => `${b.planetId}:${b.role}:${b.count}`).join(' ')}`);
    declare(w.K, emp);
    const m = matchesPlan(aiUnits(w, emp), plan, emp);
    assert(m.ok, `M1d: ${emp} po wojnie = plan na ${plan.perBody.length} ciałach (${m.bad.slice(0, 3).join(' | ') || 'zgodne'})`);
  }
}

// ── M2 — flaga raz; druga wojna nic nie tworzy ──────────────────────────────────────────
{
  console.log('\nM2 — flaga ustawiana raz; druga wojna niczego nie tworzy');
  const w = boot();
  const [e1] = w.emps;
  declare(w.K, e1);
  const first = aiUnits(w, e1).map(u => u.id);
  const flag1 = JSON.stringify(flagOf(w.K, e1));
  assert(first.length >= 2 && flagOf(w.K, e1)?.mobilized === true && flagOf(w.K, e1)?.created === first.length,
    `M2a: po pierwszej wojnie flaga ${flag1} (created = ${first.length})`);
  // koniec wojny — uczciwa droga: status pary na pokój (bez rozejmu, bez paktu) — potem DRUGA wojna
  w.K.diplomacySystem.relations.setStatus('player', e1, 'peace', {}, 'keeper_peace');
  w.gum.removeUnit(first[0]);                                         // strata między wojnami
  const left = aiUnits(w, e1).length;
  const ok2 = declare(w.K, e1);
  const after = aiUnits(w, e1);
  assert(ok2 === true && w.K.diplomacySystem.getStatus(e1) === 'war',
    `świadek: druga wojna wypowiedziana (status ${w.K.diplomacySystem.getStatus(e1)})`);
  assert(after.length === left && after.length === first.length - 1 && JSON.stringify(flagOf(w.K, e1)) === flag1,
    `M2b: druga wojna nie tworzy nic, także w miejsce straty (${first.length} → ${left} → ${after.length}); flaga bez zmian`);
  const skipped = debugLog.query({ kind: 'garrison:mobilizeSkipped', empireId: e1 }).map(e => e.data?.reason);
  assert(skipped.includes('already_mobilized'),
    `M2c: ślad audytu drugiej wojny — garrison:mobilizeSkipped 'already_mobilized' (${JSON.stringify(skipped)})`);
}

// ── M3 — zapis → wczytanie ──────────────────────────────────────────────────────────────
{
  console.log('\nM3 — zapis → wczytanie: jednostki i flaga zostają, nic nie powstaje ponownie');
  const w1 = boot();
  const [e1] = w1.emps;
  declare(w1.K, e1);
  const ids1 = aiUnits(w1, e1).map(u => `${u.id}@${u.planetId}:${u.q},${u.r}:${u.archetypeId}:${u.morale}:${u.deployState}`);
  const flag1 = JSON.stringify(flagOf(w1.K, e1));
  const gsSave = JSON.parse(JSON.stringify(gameState.serialize()));
  const guSave = JSON.parse(JSON.stringify(w1.gum.serialize()));
  assert(ids1.length >= 2 && guSave.units.length === ids1.length && gsSave.empires?.[e1]?.garrison?.mobilized === true,
    `świadek: zapis niesie ${guSave.units.length} jednostek i flagę ${e1} w gameState.empires`);
  // „Wczytanie”: świeży świat (EventBus wyczyszczony, NOWY GarrisonSystem z uzbrojonym zatrzaskiem pierwszego ticku)
  const w2 = boot();
  gameState.restore(JSON.parse(JSON.stringify(gsSave)));
  w2.gum.restore(JSON.parse(JSON.stringify(guSave)));
  const restored = aiUnits(w2, e1).map(u => `${u.id}@${u.planetId}:${u.q},${u.r}:${u.archetypeId}:${u.morale}:${u.deployState}`);
  assert(ids1.length >= 2 && flagOf(w2.K, e1)?.mobilized === true &&
         w2.K.diplomacySystem.getStatus(e1) === 'war' && JSON.stringify(flagOf(w2.K, e1)) === flag1 &&
         JSON.stringify(restored) === JSON.stringify(ids1),
    `M3a: po wczytaniu: status war, flaga ta sama, ${restored.length} jednostek z tymi samymi heksami, archetypami, morale i rozłożeniem`);
  run(w2, 3);
  const afterTick = aiUnits(w2, e1).map(u => `${u.id}@${u.planetId}:${u.q},${u.r}:${u.archetypeId}:${u.morale}:${u.deployState}`);
  assert(ids1.length >= 2 && JSON.stringify(afterTick) === JSON.stringify(ids1) &&
         debugLog.query({ kind: 'garrison:mobilized', empireId: e1 }).length === 0,
    `M3b: pierwszy tick po wczytaniu niczego nie tworzy (${afterTick.length} jednostek, garrison:mobilized w tym świecie: ` +
    `${debugLog.query({ kind: 'garrison:mobilized', empireId: e1 }).length})`);
  // kontrola: ten sam zapis BEZ flagi i bez jednostek — zatrzask pierwszego ticku musi zmobilizować
  const w3 = boot();
  const gsNoFlag = JSON.parse(JSON.stringify(gsSave));
  delete gsNoFlag.empires[e1].garrison;
  gameState.restore(gsNoFlag);
  const pre = aiUnits(w3, e1).length;
  run(w3, 1);
  assert(pre === 0 && aiUnits(w3, e1).length === ids1.length && flagOf(w3.K, e1)?.reason === 'reconcile_at_war',
    `M3 kontrola: zapis w wojnie bez flagi — mobilizacja na pierwszym ticku (${pre} → ${aiUnits(w3, e1).length}, ` +
    `powód ${flagOf(w3.K, e1)?.reason ?? '—'})`);
}

// ── M4 — starszy zapis: wojna bez flagi i bez zdarzenia ─────────────────────────────────
{
  console.log('\nM4 — stan wojny bez flagi (status ustawiony bez zdarzenia): mobilizacja na pierwszym ticku, raz');
  const w = boot();
  const [e1, e2] = w.emps;
  const plan1 = planFor(w.K, e1);
  w.K.diplomacySystem.relations.setStatus('player', e1, 'war', {}, 'legacy_save');   // bez `diplomacy:warDeclared`
  const pre = { units: aiUnits(w, e1).length, flag: flagOf(w.K, e1), status: w.K.diplomacySystem.getStatus(e1) };
  assert(pre.status === 'war' && pre.units === 0 && pre.flag === null,
    `świadek: status ${pre.status} bez zdarzenia, 0 jednostek, brak flagi`);
  run(w, 1);
  const after1 = aiUnits(w, e1);
  const m = matchesPlan(after1, plan1, e1);
  assert(m.ok && flagOf(w.K, e1)?.reason === 'reconcile_at_war',
    `M4a: pierwszy tick mobilizuje wg planu (${after1.length}/${m.expected}, powód ${flagOf(w.K, e1)?.reason ?? '—'})`);
  run(w, 5);
  const evs = debugLog.query({ kind: 'garrison:mobilized', empireId: e1 }).length;
  assert(aiUnits(w, e1).length === after1.length && evs === 1,
    `M4b: raz — po 5 kolejnych civY nadal ${aiUnits(w, e1).length} jednostek, garrison:mobilized ×${evs}`);
  assert(aiUnits(w, e2).length === 0 && flagOf(w.K, e2) === null,
    `M4c kontrola: ${e2} w pokoju — uzgodnienie go pomija`);
}

// ── M5 — brak wolnego heksu ─────────────────────────────────────────────────────────────
{
  console.log('\nM5 — brak wolnego heksu: nadwyżka nie powstaje, bez stosu');
  const w = boot();
  const [e1] = w.emps;
  const capCol = w.K.directorProduction.capitalOf(e1);
  const grid = capCol?.grid;
  const capTile = grid?.toArray().find(t => t.capitalBase);
  // wszystko poza kaflem stolicy — ocean: w promieniu 5 jest JEDEN kafel, na którym da się stanąć
  for (const t of grid?.toArray() ?? []) if (t !== capTile) t.type = 'ocean';
  const plan = planFor(w.K, e1);
  const capPlan = plan.perBody.find(b => b.planetId === capCol?.planetId);
  assert(!!capTile && isStandableTile(capTile) && capPlan?.count >= 2 && capPlan?.hexes?.missing === capPlan.count - 1,
    `świadek: stolica ${capCol?.planetId} ma 1 kafel do stania, plan stolicy ${capPlan?.count} (missing ${capPlan?.hexes?.missing})`);
  declare(w.K, e1);
  const units = aiUnits(w, e1).filter(u => u.planetId === capCol.planetId);
  const keys = units.map(u => `${u.q},${u.r}`);
  const f = flagOf(w.K, e1);
  assert(units.length === 1 && keys[0] === `${capTile.q},${capTile.r}` && new Set(keys).size === keys.length,
    `M5a: powstała 1 jednostka, na jedynym kaflu do stania (${keys.join(' ') || '—'}); żadnego stosu`);
  assert(f?.mobilized === true && f?.reserve === capPlan.count - 1 && f?.created === aiUnits(w, e1).length,
    `M5b: nadwyżka w rezerwie rekordu flagi (reserve ${f?.reserve}, created ${f?.created})`);
  // ten sam brak miejsca przez ZAJĘTOŚĆ: jedyny kafel stoi pod jednostką gracza ⇒ AI nie staje na niej
  const w2 = boot();
  const [f1] = w2.emps;
  const c2 = w2.K.directorProduction.capitalOf(f1);
  const t2 = c2?.grid?.toArray().find(t => t.capitalBase);
  for (const t of c2?.grid?.toArray() ?? []) if (t !== t2) t.type = 'ocean';
  const pu = w2.gum.createUnit('shock_infantry', c2.planetId, t2.q, t2.r, { owner: 'player', factionId: 'humanity' });
  declare(w2.K, f1);
  const onHex = w2.gum.getUnitsOnPlanet(c2.planetId).filter(u => u.q === t2.q && u.r === t2.r);
  assert(!!pu && aiUnits(w2, f1).filter(u => u.planetId === c2.planetId).length === 0 && onHex.length === 1 &&
         flagOf(w2.K, f1)?.mobilized === true && flagOf(w2.K, f1)?.created === aiUnits(w2, f1).length,
    `M5c: jedyny kafel zajęty przez jednostkę gracza — na stolicy nie powstaje nic (na heksie ${onHex.length} jednostka), flaga ustawiona`);
}

// ── M6 — przetrwanie, obrońcy, desant ───────────────────────────────────────────────────
{
  console.log('\nM6 — 10 civY przy 0 Kr; żywi obrońcy; desant gracza w wojnie nie bierze stolicy, dopóki żyje obrońca');
  const w = boot();
  const [e1] = w.emps;
  for (const c of w.K.empireRegistry.getColoniesByEmpire(e1)) c.credits = 0;
  // prawdziwe utrzymanie (ColonyManager) + zaopatrzenie jak w GameScene (headless go nie montuje)
  const supply = new SupplyCoverageSystem(w.cm, w.gum);
  declare(w.K, e1);
  const units0 = aiUnits(w, e1);
  const capCol = w.K.directorProduction.capitalOf(e1);
  assert(units0.length >= 2 && !!supply && w.K.empireRegistry.getColoniesByEmpire(e1).every(c => (c.credits ?? 0) === 0),
    `świadek: ${units0.length} jednostek ${e1}, kredyty kolonii = 0, SupplyCoverageSystem zamontowany`);
  run(w, 10);
  const units10 = aiUnits(w, e1);
  assert(units0.length >= 2 && units10.length === units0.length &&
         units10.every(u => u.status === 'idle' && u.hp === u.hpMax && u.morale === u.maxMorale),
    `M6a: po 10 civY przy 0 Kr wszystkie żyją, aktywne, pełne HP i morale (${units10.map(u => `${u.status}:${u.hp}/${u.hpMax}`).join(' ')})`);
  assert(InvasionSystem.hasLivingDefender(w.gum.getUnitsOnPlanet(capCol.planetId), 'player') === true,
    'M6b: liczą się jako żywi obrońcy stolicy (hasLivingDefender wobec gracza)');
  // desant: jednostka gracza na kaflu stolicy, kafel już przejęty okupacją — obrońca żyje ⇒ brak przejęcia
  const capTile = capCol.grid.toArray().find(t => t.capitalBase);
  w.gum.createUnit('shock_infantry', capCol.planetId, capTile.q, capTile.r, { owner: 'player', factionId: 'humanity' });
  capTile.owner = 'player';
  const tryNow = w.K.invasionSystem._tryPlayerCapture(capCol.planetId);
  run(w, 1);
  assert(w.K.diplomacySystem.getStatus(e1) === 'war' && tryNow === false && w.cm.getColony(capCol.planetId)?.ownerEmpireId === e1,
    `M6c: wojna, gracz na stolicy (owner kafla 'player'), obrońca żyje — przejęcia nie ma (próba ${tryNow}, właściciel ${w.cm.getColony(capCol.planetId)?.ownerEmpireId})`);
  // kontrola: bez obrońców to samo ciało przechodzi — pin nie stoi na innej bramce
  for (const u of w.gum.getUnitsOnPlanet(capCol.planetId).filter(x => x.owner === e1)) w.gum.removeUnit(u.id);
  capTile.owner = 'player';
  const tookAfter = w.K.invasionSystem._tryPlayerCapture(capCol.planetId);
  assert(tookAfter === true && !w.cm.getColony(capCol.planetId)?.ownerEmpireId,
    `M6 kontrola: po zdjęciu obrońców ta sama scena daje przejęcie (${tookAfter})`);
}

// ── M7 — zmiana właściciela: przejęcie, cesja, przerzut ─────────────────────────────────
{
  console.log('\nM7 — zmiana właściciela (przejęcie, cesja, przerzut): jednostki poprzedniego właściciela znikają, inne ciała nietknięte');
  const w = boot();
  run(w, 40 * 12);
  const [e1, e2] = w.emps;
  declare(w.K, e1);
  declare(w.K, e2);
  const on = (pid, emp) => w.gum.getUnitsOnPlanet(pid).filter(u => u.owner === emp).map(u => u.id);
  const snap = () => new Map(w.gum.getAllUnits().map(u => [u.id, `${u.owner}@${u.planetId}`]));
  const untouched = (before, gone) => [...before].every(([id, where]) => gone.includes(id) || snap().get(id) === where);
  const cap1 = w.K.directorProduction.capitalOf(e1)?.planetId;
  const cap2 = w.K.directorProduction.capitalOf(e2)?.planetId;
  const other1 = [...new Set(aiUnits(w, e1).map(u => u.planetId))].find(p => p !== cap1);
  const other2 = [...new Set(aiUnits(w, e2).map(u => u.planetId))].find(p => p !== cap2);
  assert(!!cap1 && !!other1 && !!cap2 && !!other2 && on(cap1, e1).length >= 2 && on(other1, e1).length >= 1 &&
         on(other2, e2).length >= 1 && w.cm.getColony(other2)?.isOutpost === true,
    `świadek gy 40: ${e1} na ${cap1} (${on(cap1, e1).length}) i ${other1} (${on(other1, e1).length}); ` +
    `${e2} na ${cap2} i placówce ${other2} (${on(other2, e2).length})`);

  // (a) przejęcie przez gracza — metoda, którą kończy się desant (`captureColonyForPlayer`)
  let before = snap();
  const goneA = on(cap1, e1);
  const tookA = w.cm.captureColonyForPlayer(cap1, 'ground_invasion');
  assert(tookA === true && !w.cm.getColony(cap1)?.ownerEmpireId && on(cap1, e1).length === 0 && untouched(before, goneA),
    `M7a: przejęcie ${cap1} przez gracza — ${goneA.length} jednostek ${e1} na nim znika, reszta (${before.size - goneA.length}) nietknięta`);
  // (b) cesja AI → gracz — prawdziwe wykonanie warunków pokoju
  before = snap();
  const goneB = on(other2, e2);
  quiet(() => w.K.diplomacySystem._executeCessions([{ bodyId: other2, toPlayer: true }]));
  assert(!w.cm.getColony(other2)?.ownerEmpireId && goneB.length >= 1 && on(other2, e2).length === 0 && untouched(before, goneB),
    `M7b: cesja ${other2} (${e2} → gracz) — ${goneB.length} jednostka ${e2} znika, reszta nietknięta`);
  // (c) przerzut AI → AI (`transferColony`)
  before = snap();
  const goneC = on(other1, e1);
  const tookC = w.cm.transferColony(other1, e2, 'invasion');
  assert(tookC === true && w.cm.getColony(other1)?.ownerEmpireId === e2 && goneC.length >= 1 && on(other1, e1).length === 0 &&
         untouched(before, goneC),
    `M7c: przerzut ${other1} (${e1} → ${e2}) — ${goneC.length} jednostka ${e1} znika, jednostki ${e2} gdzie indziej nietknięte`);
  const audit = debugLog.query({ kind: 'garrison:unitsRemoved' }).map(e => `${e.data?.cause}/${e.data?.via}:${e.data?.count}`);
  const want = [`owner_change/ground_invasion:${goneA.length}`, `owner_change/cession:${goneB.length}`, `owner_change/invasion:${goneC.length}`];
  assert(JSON.stringify(audit) === JSON.stringify(want),
    `M7d: ślad audytu — garrison:unitsRemoved ×3 w kolejności przejęcie · cesja · przerzut (${audit.join(' · ') || '—'})`);
}

// ── M8 — zniszczenie ciała ──────────────────────────────────────────────────────────────
{
  console.log('\nM8 — ciało zniszczone: żadna jednostka imperium AI na nim nie zostaje');
  const w = boot();
  const [e1, e2] = w.emps;
  declare(w.K, e1);
  declare(w.K, e2);
  const c1 = w.K.directorProduction.capitalOf(e1);
  const c2 = w.K.directorProduction.capitalOf(e2);
  const taken = new Set(w.gum.getUnitsOnPlanet(c1.planetId).map(u => `${u.q},${u.r}`));
  const free = c1.grid.toArray().filter(t => isStandableTile(t) && !taken.has(`${t.q},${t.r}`));
  // trzecia strona: jednostka e2 na ciele e1 (createAIUnit nie pyta o wojnę) + jednostka gracza
  const third = w.gum.createAIUnit({ archetypeId: G, empireId: e2, planetId: c1.planetId, q: free[0].q, r: free[0].r, morale: 50 })?.unit;
  const pl = w.gum.createUnit('shock_infantry', c1.planetId, free[1].q, free[1].r, { owner: 'player', factionId: 'humanity' });
  const e2home = w.gum.getUnitsOnPlanet(c2.planetId).filter(u => u.owner === e2).map(u => u.id);
  const aiOn1 = () => w.gum.getUnitsOnPlanet(c1.planetId).filter(u => u.owner && u.owner !== 'player');
  assert(aiOn1().length >= 3 && !!third && !!pl && e2home.length >= 2,
    `świadek: na ${c1.planetId} ${aiOn1().length} jednostek AI (${[...new Set(aiOn1().map(u => u.owner))].join('+')}) + jednostka gracza; ${e2} u siebie: ${e2home.length}`);
  // `removeColony` — punkt zbieżny trzech wyzwalaczy zniszczenia (`body:collision`, `planet:ejected`, `entity:removed`)
  w.cm.removeColony(c1.planetId, 'collision');
  assert(!w.cm.getColony(c1.planetId) && aiOn1().length === 0,
    `M8a: po zniszczeniu ${c1.planetId} nie zostaje ŻADNA jednostka imperium AI (${aiOn1().length}) — ani właściciela, ani trzeciej strony`);
  assert(JSON.stringify(w.gum.getUnitsOnPlanet(c2.planetId).filter(u => u.owner === e2).map(u => u.id)) === JSON.stringify(e2home),
    `M8b: jednostki ${e2} na jego własnym ciele nietknięte (${e2home.length})`);
  const ev = debugLog.query({ kind: 'garrison:unitsRemoved' }).map(e => e.data).find(d => d?.planetId === c1.planetId);
  assert(ev?.cause === 'body_destroyed' && ev?.via === 'collision' && ev?.count === 3 && JSON.stringify([...ev.owners].sort()) === JSON.stringify([e1, e2].sort()),
    `M8c: ślad audytu — body_destroyed/collision, 3 jednostki, właściciele ${JSON.stringify(ev?.owners)}`);
  // ⚠ OTWARTE (decyzja właściciela, raport G2-3b): jednostka GRACZA na zniszczonym ciele zostaje jak dziś.
  assert(w.gum.getUnit(pl.id)?.planetId === c1.planetId,
    'M8 otwarte: jednostka gracza zostaje zarejestrowana na zniszczonym ciele — dzisiejsze zachowanie, los do decyzji właściciela');
}

// ── M10 — żywy fixture GATE-S4 ─────────────────────────────────────────────────────────
const FX = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/GATE-S4-fresh-gy60.save.json.gz', import.meta.url))).toString());
/** Świat z zapisu: prawdziwe EmpireRegistry, DiplomacySystem, GroundUnitManager, DirectorProduction i GarrisonSystem;
 *  kolonie — obiekty z zapisu (siatki przez HexGrid.restore), jak czytnik zapisu w `g2_planner_smoke`. */
function fixtureWorld() {
  EventBus.clear();
  debugLog.clear();
  debugLog.attach();
  gameState.restore(JSON.parse(JSON.stringify(FX.civ4x.gameState)));
  const bodies = new Map([...(FX.planets ?? []), ...(FX.moons ?? []), ...(FX.planetoids ?? [])].map(b => [b.id, b]));
  const empOf = new Map();
  for (const [eid, e] of Object.entries(FX.civ4x.gameState.empires)) for (const pid of e.colonies) empOf.set(pid, eid);
  const colonies = new Map(FX.civ4x.colonies.map(c => [c.planetId, {
    planetId: c.planetId, name: c.name, isOutpost: !!c.isOutpost, ownerEmpireId: empOf.get(c.planetId) ?? null,
    grid: c.grid ? HexGrid.restore(c.grid) : null,
    civSystem: { population: c.civ?.population ?? 0 },
    buildingSystem: { _active: new Map((c.buildings ?? []).map((b, i) => [i, { building: { id: b.buildingId }, level: b.level ?? 1 }])) },
    resourceSystem: c.resources ? {} : null,
    planet: { deposits: bodies.get(c.planetId)?.deposits ?? [] },
  }]));
  const K = window.KOSMOS;
  K.colonyManager = { getColony: (id) => colonies.get(id) ?? null, getAllColonies: () => [...colonies.values()] };
  K.timeSystem = { gameTime: FX.gameTime };
  K.empireRegistry = new EmpireRegistry();
  K.diplomacySystem = new DiplomacySystem();
  K.groundUnitManager = new GroundUnitManager();
  K.directorProduction = new DirectorProduction();
  K.garrisonSystem = GSmod?.GarrisonSystem ? new GSmod.GarrisonSystem() : null;
  return { K, colonies, gum: K.groundUnitManager };
}
{
  console.log('\nM10 — żywy fixture GATE-S4 (gy 60), wypowiedziana wojna: garnizon = tabela planera');
  const w = fixtureWorld();
  // Tabela WYPROWADZONA RĘCZNIE w `g2_planner_smoke` P6 (D1/D9/D11 + dane zapisu): limit 13 = floor(11 × 1,25),
  //   stolica 7 = G G A G G A G, sześć innych ciał po jednym garrison_unit, morale 100.
  const EXPECT = {
    emp_001: ['entity_115:7', 'entity_117:1', 'entity_118:1', 'entity_119:1', 'entity_116:1', 'entity_208:1', 'entity_200:1'],
    emp_002: ['entity_232:7', 'entity_231:1', 'entity_234:1', 'entity_236:1', 'entity_233:1', 'entity_235:1', 'entity_313:1'],
  };
  for (const emp of Object.keys(EXPECT)) {
    const plan = planFor(w.K, emp);
    const st = w.K.diplomacySystem.getStatus(emp);
    const table = plan.perBody.map(b => `${b.planetId}:${b.count}`);
    assert(st === 'peace' && w.gum.getAllUnits().filter(u => u.owner === emp).length === 0 && plan.limit === 13 && plan.tier.morale === 100 &&
           JSON.stringify(table) === JSON.stringify(EXPECT[emp]) && hexesOf(plan) === 13,
      `świadek ${emp}: pokój, 0 jednostek; plan = tabela P6 (limit ${plan.limit}, morale ${plan.tier.morale}, ${table.join(' ')})`);
    const ok = quiet(() => w.K.diplomacySystem.declareWar(emp, 'player_action'));
    const units = w.gum.getAllUnits().filter(u => u.owner === emp).sort((a, b) => unitNo(a) - unitNo(b));
    const m = matchesPlan(units, plan, emp);
    const art = units.filter(u => u.archetypeId === A).length;
    const capUnits = units.filter(u => u.planetId === plan.capitalId).map(u => (u.archetypeId === A ? 'A' : 'G')).join('');
    assert(ok === true && m.ok && units.length === 13 && art === 2 && capUnits === 'GGAGGAG',
      `M10 ${emp}: po wojnie 13 jednostek = plan (stolica ${capUnits}, artyleria ${art}; rozjazdy: ${m.bad.slice(0, 2).join(' | ') || '—'})`);
  }
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
