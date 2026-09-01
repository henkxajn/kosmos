// PROBE W3-5 — WYBÓR CELU: czy reguła ma z czego wybierać i co ją najczęściej zatrzymuje.
//
// Uruchomienie:  node src/testing/headless/probe-w3-targets.mjs
//
// PO CO: reguła `strike_player_target` jest pierwszą, w której AI wybiera cel SAMO. Trzy jej
// własności są NIEMIERZALNE w keeperze (keeper stawia scenę ręcznie, więc zawsze ją dostaje):
//   (1) czy w prawdziwej galaktyce kolonia gracza W OGÓLE trafia w zasięg imperium,
//   (2) który powód odmowy dominuje — a więc gdzie naprawdę stoi wąskie gardło ofensywy,
//   (3) czy sól galaktyki rozjeżdża moment pierwszego uderzenia MIĘDZY PARTIAMI.
//
// ⚠ ŻETON STACJI (R-3) — bez niego ta sonda mierzyłaby CISZĘ, nie powściągliwość.
//   `GameCore` nie montuje `stationSystem`, więc `EmpireColonyBootstrap` pomija zasiew żetonu,
//   a `DirectorProduction` odrzuca KAŻDY okręt wojenny powodem `no_orbital_station`. Sonda
//   zasiewa żeton sama i **sprawdza, że się przyjął**, ZANIM cokolwiek zmierzy (ruling W3-0).
//
// ⚠ CO TA SONDA MIERZY, A CZEGO NIE. Mierzy ZASIĘG, ODMOWY i ROZRZUT SOLI — wszystko trzy
//   przez prawdziwą `InfluenceMap` i prawdziwy katalog. NIE mierzy pełnej pętli „AI samo
//   zbuduje okręt warp, obsadzi go i wyśle": to wymaga produkcji + mobilizacji przez wiele
//   dziesięcioleci i jest przedmiotem GATE 2 §8 na żywym silniku. Gdzie sonda stawia coś
//   ręcznie, mówi o tym wprost.

import './env.js';
import { bootWithDirector } from './DirectorHarness.js';
import EntityManager from '../../core/EntityManager.js';
import { createVessel } from '../../entities/Vessel.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { StationSystem } from '../../systems/StationSystem.js';
import { DIRECTOR_RULES } from '../../data/DirectorRuleData.js';
import { rollFires } from '../../utils/DirectorRuleMath.js';

const SEEDS = ['-1652911923', '131797258', '42', '-777001'];
const RAIDER = ['engine_warp', 'warp_tank', 'armor_heavy', 'weapon_laser'];

/** Rajder AI (z bakiem warp) zadokowany przy stolicy imperium. */
function mkRaider(core, empireId, capBody, name) {
  const v = createVessel('hull_frigate', capBody.id, {
    name, modules: [...RAIDER], x: 0, y: 0, systemId: capBody.systemId });
  v.ownerEmpireId = empireId; v.owner = empireId; v.isEnemy = true;
  v.position.state = 'orbiting'; v.position.dockedAt = capBody.id;
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

function boot(seed) {
  // D-178-3 — montaz Directora idzie przez WSPOLNY harness (`bootWithDirector`), nie z reki.
  // ⚠ Harness wnosi ze soba to, co ta sonda montowala osobno: TerritoryService PRZED InfluenceMap
  //   (R12 — sam `new InfluenceMap()` przechodzi, rzuca dopiero pierwszy odczyt), stub stacji
  //   z `serialize`/`restore` oraz kalibracje. Zeton R-3 zasiewa ponizej `seedStationToken`
  //   PRAWDZIWYM `StationSystem` — to jest swiadoma roznica wobec stubu harnessu, bo ta sonda
  //   dowodzi, ze zeton sie PRZYJAL, a nie tylko ze istnieje.
  const { core, K } = bootWithDirector({
    seed: Number(seed), calibrated: false, opts: { scenario: 'civilization' },
  });
  K.movementOrderSystem = new MovementOrderSystem(core.vesselManager);
  K.orderService = new OrderService();
  return { core, K, off: K.directorOffensive };
}

/** Zasiew żetonu R-3 + DOWÓD, że się przyjął. Bez tego dalszy pomiar jest bezwartościowy. */
function seedStationToken(core, empireId) {
  const K = window.KOSMOS;
  // ⚠ Harness zasiewa STUB zetonu (D-178-3). Ta sonda dowodzi, ze zeton sie PRZYJAL, wiec
  //   potrzebuje PRAWDZIWEGO StationSystem — podmiana jest JAWNA i po to jest `_isHarnessStub`.
  if (!K.stationSystem || K.stationSystem._isHarnessStub) K.stationSystem = new StationSystem();
  const cap = core.colonyManager.getAllColonies().find(c => c.ownerEmpireId === empireId);
  if (!cap) return { ok: false, why: 'brak kolonii imperium' };
  const st = K.stationSystem.createStation(cap.planetId, {
    ownerEmpireId: empireId, starterModules: false,
  });
  const took = !!st && (K.stationSystem.getStationsAt?.(cap.planetId)?.length ?? 0) > 0;
  return { ok: took, why: took ? '' : 'createStation nie zwrócił stacji', capitalId: cap.planetId };
}

console.log('═══ PROBE W3-5 — wybór celu ═══\n');

// ── 1. ŻETON STACJI — dowód PRZED pomiarem ─────────────────────────────────
console.log('1. ŻETON STACJI (R-3) — warunek wstępny sondy');
{
  const { core } = boot(SEEDS[0]);
  const empireId = core.empireRegistry.listAll()[0]?.id;
  const seeded = seedStationToken(core, empireId);
  console.log(`   ${seeded.ok ? '✓' : '✗'} żeton zasiany dla ${empireId} @ ${seeded.capitalId ?? '—'}` +
    (seeded.ok ? '' : ` — ${seeded.why}`));
  if (!seeded.ok) {
    console.log('   ⚠ BEZ ŻETONU dalszy pomiar mierzyłby CISZĘ (DirectorProduction odrzuca ' +
      'każdy okręt: no_orbital_station). Przerywam — to jest wynik, nie awaria.');
    process.exit(1);
  }
}

// ── 2. ZASIĘG — czy kolonia gracza trafia w strefę imperium ────────────────
console.log('\n2. ZASIĘG: czy kolonia gracza leży w przestrzeni/powłoce imperium (prawdziwa InfluenceMap)');
{
  console.log('   seed          | imperium  | roszczona | powłoka | CELÓW W ZASIĘGU');
  console.log('   --------------|-----------|-----------|---------|----------------');
  for (const seed of SEEDS) {
    const { core, K, off } = boot(seed);
    for (const emp of core.empireRegistry.listAll()) {
      const claimed = K.influenceMap.getClaimedSystems(emp.id).length;
      const border  = K.influenceMap.getBorderSystems(emp.id).length;
      const n = off.countReachableTargets(emp.id);
      console.log(`   ${String(seed).padEnd(13)} | ${emp.id.padEnd(9)} | ` +
        `${String(claimed).padEnd(9)} | ${String(border).padEnd(7)} | ${n}`);
    }
  }
  console.log('   ⚠ Zero celów w zasięgu NIE jest awarią reguły — to znaczy, że gracz mieszka');
  console.log('     poza strefą imperium i ofensywa czeka na ekspansję którejś ze stron.');
}

// ── 3. ODMOWY — gdzie naprawdę stoi wąskie gardło ──────────────────────────
console.log('\n3. ODMOWY: co zatrzymuje uderzenie, gdy cel JEST w zasięgu (scena stawiana ręcznie)');
{
  const { core, K, off } = boot(SEEDS[0]);
  const empireId = core.empireRegistry.listAll()[0]?.id;
  const home = K.homePlanet;
  const cap = core.colonyManager.getAllColonies().find(c => c.ownerEmpireId === empireId);
  const capBody = EntityManager.get(cap.planetId);
  K.diplomacySystem?.declareWar?.(empireId, 'probe_w3_targets');
  // Zasięg wymuszony — mierzymy ODMOWY, nie geografię (tę mierzy tabela wyżej).
  K.influenceMap = { isClaimedBy: (s) => s === home.systemId, isInBorderZone: () => false };

  const step = (label, fn) => {
    fn?.();
    const r = off.launchStrike({ empireId, year: 10 });
    console.log(`   ${label.padEnd(42)} → ${r.launched > 0 ? `WYSŁANO ${r.launched}` : r.reason}`);
  };

  step('brak jakiegokolwiek okrętu');
  step('kadłub BEZ baku warp (FRG-3)', () => {
    const v = createVessel('hull_frigate', capBody.id, {
      name: 'FRG-3', modules: ['engine_ion', 'armor_standard', 'weapon_missile'],
      x: 0, y: 0, systemId: capBody.systemId });
    v.ownerEmpireId = empireId; v.owner = empireId; v.isEnemy = true;
    v.position.state = 'orbiting'; v.position.dockedAt = capBody.id;
    core.vesselManager._vessels.set(v.id, v);
  });
  step('JEDEN rajder, cel NIEBRONIONY', () => mkRaider(core, empireId, capBody, 'Rajder A'));
  // Obrona planetarna → próg eskadry (§Findings 34)
  core.colonyManager.getColony(home.id)?.buildingSystem?._active
    ?.set('def_probe', { building: { id: 'defense_tower' }, level: 2, jobs: 0 });
  // ⚠ Uderzenie KONSUMUJE okrety (dostaja misje), wiec kolejne kroki startuja z pustej puli —
  //   i to tez jest pomiar: jedno uderzenie rozbraja imperium na czas podrozy.
  step('po wyslaniu: pula pusta, cel BRONIONY');
  step('+1 rajder, cel BRONIONY (potrzeba 2)', () => mkRaider(core, empireId, capBody, 'Rajder B'));
  step('+1 rajder, cel BRONIONY (eskadra pelna)', () => mkRaider(core, empireId, capBody, 'Rajder C'));
}

// ── 4. SÓL GALAKTYKI — czy partie rozjeżdżają się w czasie ─────────────────
console.log('\n4. SÓL GALAKTYKI: pierwsza PRÓBA, w której reguła odpala (ta sama krzywa, różne ziarna)');
{
  const cfg = DIRECTOR_RULES.strike_player_target.roll;
  const firstFire = (salt, empireId) => {
    for (let a = 1; a <= 60; a++) if (rollFires('strike_player_target', empireId, a, cfg, 1, salt)) return a;
    return null;
  };
  console.log('   seed          | emp_001 | emp_002');
  console.log('   --------------|---------|--------');
  const rows = SEEDS.map(s => [s, firstFire(s, 'emp_001'), firstFire(s, 'emp_002')]);
  for (const [s, a, b] of rows) {
    console.log(`   ${String(s).padEnd(13)} | ${String(a ?? '—').padEnd(7)} | ${b ?? '—'}`);
  }
  const uniq = new Set(rows.map(r => `${r[1]}/${r[2]}`)).size;
  console.log(`   ⇒ różnych układów (emp_001/emp_002) na ${SEEDS.length} ziaren: ${uniq}`);
  console.log('   ⚠ To jest instrument, którego zabrakło przy pierwszym kontakcie: tam KAŻDA partia');
  console.log('     odpalała na próbie 3 i wchodziła pod tym samym kątem, bo klucz nie miał soli.');

  // KONTROLA: reguła BEZ soli musi dawać ten sam układ dla wszystkich ziaren.
  const mob = DIRECTOR_RULES.mobilize_reserve.roll;
  // ⚠ Kontrola liczy rzut BEZ argumentu soli — dokladnie tak, jak wola go DirectorSystem dla
  //   reguly bez `saltGalaxySeed`. Podanie ziarna jako soli mierzyloby cos innego.
  const mobFire = () => { for (let a = 1; a <= 60; a++) if (rollFires('mobilize_reserve', 'emp_001', a, mob, 1)) return a; return null; };
  const mobUniq = new Set(SEEDS.map(() => mobFire())).size;
  console.log(`   KONTROLA — reguła bez soli: ${mobUniq} układ(y) na ${SEEDS.length} ziaren ` +
    `(oczekiwane 1 — sól jest OPT-IN i nie rusza istniejących reguł)`);
}

console.log('\n═══ koniec ═══');
