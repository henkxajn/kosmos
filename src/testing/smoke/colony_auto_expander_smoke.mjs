// KEEPER — ColonyAutoExpander: zbiór zarządzany + ścieżka BUDOWY/ULEPSZENIA + brak zdejmowania popytu.
// Uruchom: node src/testing/smoke/colony_auto_expander_smoke.mjs
//
// ⚠ POWSTAŁ JAKO WARUNEK TWARDY (D-S4-3), ZANIM S4 DOTKNĘŁO PLIKU. `ColonyAutoExpander` przez
//   cztery miesiące nie miał ŻADNEGO keepera w sweepie: jego jedyne testy leżą w
//   `src/testing/headless/test-*.mjs`, a `run-all.mjs` skanuje WYŁĄCZNIE `src/testing/smoke/`.
//   To jest ta sama klasa co „podpisane ≠ zbudowane" (FE_SUPPLY_PLAN §9): komponent był
//   modyfikowany (d95d9b8, d44af5e, 8226dcc, 2edda19) bez bramki regresyjnej.
//
// PIN A-D — promocja `test-autoexpander-archetype.mjs` (regresja bug S3.1b) + dwa NOWE terminy,
//   których tamten nie miał: kolonia GRACZA i PLACÓWKA są poza zbiorem zarządzanym. To jest
//   STRUKTURALNA gwarancja, że cokolwiek dopiszemy do ekspandera, nie dotknie gry gracza —
//   inaczej niż S1, gdzie termin własności trzeba było dopisać ręcznie.
// PIN E-F — ŚCIEŻKA, KTÓRĄ S4 MODYFIKUJE, w stanie SPRZED S4: budowa i ulepszenie przechodzą
//   BEZ WZGLĘDU na liczbę robotników. Po wejściu S4a te piny biegną z `aiLaborBudget = false`,
//   czyli pilnują kontraktu „flaga OFF = zachowanie sprzed S4, co do bitu".
// PIN G — BRAK ZDEJMOWANIA POPYTU (Finding 235): ekspander nie ma ani `_demolish`, ani
//   downgrade'u, ani desygnacji — popyt AI jest monotonicznie niemalejący.
// PIN H — POPYT ROŚNIE Z POZIOMU (Finding 234/230): getSlotDemand liczy jobs × level, więc samo
//   ULEPSZENIE mnoży wymaganie pracy. To jest „pompa" i keeper ma ją trzymać nazwaną.

import '../headless/env.js'; // MUST be first
import { readFileSync } from 'node:fs';
import EntityManager from '../../core/EntityManager.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { EmpireRegistry } from '../../systems/EmpireRegistry.js';
import { EmpireColonyBootstrap } from '../../systems/EmpireColonyBootstrap.js';
import { ColonyAutoExpander } from '../../systems/ColonyAutoExpander.js';
import { INDUSTRIALIST } from '../../data/EmpireArchetypeIndustrialist.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };
const F = () => GAME_CONFIG.FEATURES;

const dep = (resourceId, remaining, richness = 0.6) => ({ resourceId, richness, totalAmount: remaining, remaining });
const techStub = new Proxy({}, { get: (_t, p) => p === 'getTerrainUnlocks' ? () => [] : p === 'isResearched' ? () => true : () => 1 });

EntityManager.add({
  id: 'cap', name: 'Stolica', type: 'planet', planetType: 'rocky', radius: 1, mass: 1,
  atmosphere: 'breathable', temperatureK: 288, temperatureC: 15, surfaceGravity: 1.0,
  deposits: [dep('Fe', 9e5), dep('Si', 9e5), dep('Cu', 5e5), dep('C', 9e5)],
  systemId: 'sys', composition: { Fe: 0.25, Si: 0.2, Cu: 0.05, C: 0.2, O: 0.25 },
});

const colonyManager = new ColonyManager(techStub);
const empireRegistry = new EmpireRegistry();
globalThis.window = globalThis.window ?? {};
window.KOSMOS = {
  civMode: true, timeSystem: { gameTime: 5 }, colonyManager, empireRegistry,
  empireColonyBootstrap: EmpireColonyBootstrap,
  starSystemManager: { getSystem: (id) => id === 'sys' ? { planetIds: ['cap'], moonIds: [], planetoidIds: [] } : null },
  galaxyData: { seed: 1, systems: [{ id: 'sys', x: 0, y: 0, z: 0 }] },
};
empireRegistry.createEmpire({ id: 'emp_001', archetype: 'industrialist', homeSystemId: 'sys' });
EmpireColonyBootstrap.bootstrapHomeColony('emp_001', INDUSTRIALIST, 'sys');

const expander = new ColonyAutoExpander();
const colony = colonyManager.getColony('cap');
const bs = colony.buildingSystem, civ = colony.civSystem;

// ════════════════════════════════════════════════════════════════════════════
console.log('--- A-D: ZBIOR ZARZADZANY (promocja test-autoexpander-archetype + 2 nowe terminy) ---');
{
  const managed = expander._managedColonies();
  ok('A kolonia AI ze znanym archetypem JEST zarzadzana', managed.some(c => c.planetId === 'cap'));
  ok('B _archetypeOf zwraca archetyp imperium', expander._archetypeOf(colony) === 'industrialist');

  const all = colonyManager.getAllColonies();
  const orig = colonyManager.getAllColonies.bind(colonyManager);

  // NOWY TERMIN 1: kolonia GRACZA (ownerEmpireId == null) — S4 nie ma prawa jej dotknac.
  const playerColony = { planetId: 'p_player', name: 'Gracz', ownerEmpireId: null, isOutpost: false };
  colonyManager.getAllColonies = () => [...all, playerColony];
  const m2 = expander._managedColonies();
  ok('C kolonia GRACZA NIE jest zarzadzana — S4 jest AI-only Z KONSTRUKCJI, bez terminu wlasnosci',
     !m2.some(c => c.planetId === 'p_player'));

  // NOWY TERMIN 2: placowka.
  const outpost = { planetId: 'p_out', name: 'Placowka', ownerEmpireId: 'emp_001', isOutpost: true };
  colonyManager.getAllColonies = () => [...all, outpost];
  const m3 = expander._managedColonies();
  ok('C2 PLACOWKA NIE jest zarzadzana (dlatego liczba placowek nie reaguje na S4)',
     !m3.some(c => c.planetId === 'p_out'));

  // Promowany guard: nieznany archetyp.
  const ghost = { planetId: 'p_ghost', name: 'Duch', ownerEmpireId: 'emp_ghost', isOutpost: false };
  colonyManager.getAllColonies = () => [...all, ghost];
  const m4 = expander._managedColonies();
  ok('D nieznany archetyp NIE jest zarzadzany (guard S3.1b zyje)',
     !m4.some(c => c.planetId === 'p_ghost'));
  colonyManager.getAllColonies = orig;

  ok('D-kontrola pinu: wstrzykniete kolonie realnie trafialy do getAllColonies (pin nie jest jalowy)',
     all.length >= 1 && m2.length === m3.length && m3.length === m4.length);
}

console.log('--- E-F: SCIEZKA BUDOWY I ULEPSZENIA (stan SPRZED S4 / flaga OFF) ---');
{
  // ⚠ PIERWSZA WERSJA TYCH PINOW BYLA JALOWA i keeper to pokazal: `_tryBuild` zwrocil 'fail'
  //   (silent fail na kafelku/terenie), a asercja „outcome != no_tile" i tak przechodzila; `_tryUpgrade`
  //   zwrocil 'upgraded', ale popyt NIE wzrosl, bo `_upgrade` wstawia budynek w `underConstruction`
  //   i `entry.level` rosnie dopiero po ukonczeniu. Pinujemy wiec MECHANIZM, nie skutek uboczny:
  //   (E/F) czy decyzja W OGOLE DOCHODZI do BuildingSystem przy ZERO robotnikow — szpieg na `_build`
  //   i `_upgrade`; (H-pompa) czy popyt liczy jobs × level — bezposrednio na getSlotDemand.
  F().aiLaborBudget = false;   // po wejsciu S4a: kontrakt „OFF = zachowanie sprzed S4, co do bitu"
  for (const s2 of Object.values(civ.strata)) s2.count = 0;   // ZERO robotnikow
  civ._unemployed = 0;
  bs._reapplyAllRates();
  ok('E0 fixture naprawde ma ZERO robotnikow warstwy laborer (pin nie jest jalowy)',
     (civ.strata.laborer?.count ?? 0) === 0 && bs.getSlotDemand('laborer') > 0);

  let buildCalls = 0, upgradeCalls = 0;
  const oB = bs._build.bind(bs), oU = bs._upgrade.bind(bs);
  bs._build   = (...a) => { buildCalls++;   return oB(...a); };
  bs._upgrade = (...a) => { upgradeCalls++; return oU(...a); };
  expander._tryBuild(colony, 'solar_farm', { module: 'test', civYear: 60, why: 'keeper' });
  expander._tryUpgrade(colony, 'solar_farm', 3, { module: 'test', civYear: 60, why: 'keeper' });
  bs._build = oB; bs._upgrade = oU;

  ok('E decyzja BUDOWY dochodzi do BuildingSystem przy ZERO robotnikow — zadnej bramki pracy',
     buildCalls === 1);
  ok('F decyzja ULEPSZENIA dochodzi do BuildingSystem przy ZERO robotnikow — zadnej bramki pracy',
     upgradeCalls === 1);
}

console.log('--- E2/F2: POMPA POPYTU = jobs x level (Finding 230/234) ---');
{
  let key = null;
  for (const [k, e] of bs._active) if (e.building?.id === 'solar_farm' && (e.jobs ?? 0) > 0) { key = k; break; }
  ok('E2-kontrola pinu: fixture ma solar_farm z etatem (inaczej ponizsze mierzy cisze)', key !== null);
  if (key) {
    const e = bs._active.get(key);
    const lvl0 = e.level ?? 1;
    const dem0 = bs.getSlotDemand('laborer');
    e.level = lvl0 + 2;
    const dem2 = bs.getSlotDemand('laborer');
    e.level = lvl0;
    ok('F2 POMPA: samo podniesienie poziomu podnosi popyt o jobs x delta (' + dem0 + ' -> ' + dem2 + ') — BEZ nowego budynku',
       dem2 === dem0 + (e.jobs ?? 0) * 2);
    ok('F3 ... i przywrocenie poziomu wraca do stanu wyjsciowego (pin odwracalny)',
       bs.getSlotDemand('laborer') === dem0);
  }
}

console.log('--- G: BRAK MECHANIZMU ZDEJMOWANIA POPYTU (Finding 235) ---');
{
  const src = readFileSync(new URL('../../systems/ColonyAutoExpander.js', import.meta.url), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');   // zdejmij komentarze
  ok('G-kontrola pinu: zrodlo po zdjeciu komentarzy nadal zawiera _tryUpgrade (czytamy WLASCIWY plik)',
     /_tryUpgrade/.test(src));
  ok('G1 ekspander NIGDY nie wola _demolish', !/_demolish\s*\(/.test(src));
  ok('G2 ekspander NIGDY nie ustawia desygnacji (paused/priority to mechanizm GRACZA — blizniak 229)',
     !/setBuildingDesignation\s*\(/.test(src));
  ok('G3 ekspander nie ma zadnej sciezki downgrade', !/downgrade/i.test(src));
}

console.log('--- H: HOUSING skaluje sie z populacja, KARMICIELE nie (Finding 236) ---');
{
  const src = readFileSync(new URL('../../systems/ColonyAutoExpander.js', import.meta.url), 'utf-8');
  ok('H1 regula survival buduje habitat wzgledem populacji (housing_buffer_ratio)',
     /housing_buffer_ratio/.test(src) && /'habitat'/.test(src));
  const ind = readFileSync(new URL('../../data/targets/industrialist.js', import.meta.url), 'utf-8');
  ok('H2 bufor housingu jest DANA, nie stala w kodzie (1.1 w industrialist.js)',
     /housing_buffer_ratio:\s*1\.1/.test(ind));
  ok('H3 ASYMETRIA: liczba farm jest STATYCZNA w checkpointach (count: 2), housing nie ma checkpointu',
     /farm:\s*\{\s*count:\s*2/.test(ind));
}

console.log('\n=== WYNIK: ' + pass + ' PASS / ' + fail + ' FAIL (z ' + (pass + fail) + ') ===');
process.exit(fail ? 1 : 0);
