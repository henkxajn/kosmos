// DIRECTOR SLICE 1 — keeper ZASIEWU STACJI + techu bojowego AI (commit S4, orzeczenie R-3).
//
// PO CO: R-3 uzależnia produkcję okrętów wojennych AI od posiadania stacji orbitalnej.
// Żeton musi powstać przy generacji imperium, MUSI mieć jawnego właściciela i MUSI być
// GOŁY — inaczej odpalają dwa zmierzone wycieki do gracza. A bez `point_defense` cały
// łańcuch jest cichym no-opem, bo tech bramkuje kadłuby I każdą broń.
//
//   T1  `starterModules: false` daje stację BEZ modułów; domyślnie (gracz) BEZ ZMIAN
//   T2  ⚠ PIN WYCIEKU: goła stacja nie ma ani laboratorium, ani stoczni — bo to one lały
//   T3  zasiew w bootstrapie: jawny ownerEmpireId, ownerColonyId, bez modułów
//   T4  brak stationSystem = GŁOŚNO, ale NIE fatalnie (generacja świata przeżywa)
//   T5  ⚠ PIN R-3: `point_defense` i jego prereq są w startingTechs OBU spawnowanych
//       archetypów; kadłuby wojenne i każda broń tego techu wymagają
//   T6  domyślna wartość ownerEmpireId to nadal 'player' — zasiew MUSI podawać jawnie

import '../headless/env.js';                 // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import EventBus from '../../core/EventBus.js';
import { ARCHETYPES } from '../../data/EmpireData.js';
import { AI_ARCHETYPE_SEQUENCE } from '../../generators/EmpireGenerator.js';
import { HULLS } from '../../data/HullsData.js';
import { SHIP_MODULES } from '../../data/ShipModulesData.js';
import { TECHS } from '../../data/TechData.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const codeOnly = (p) => readFileSync(p, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ── T1/T2 — goła stacja ─────────────────────────────────────────────────────
console.log('\nT1/T2: starterModules:false daje stację BEZ modułów');
{
  const { StationSystem } = await import('../../systems/StationSystem.js');
  const EntityManager = (await import('../../core/EntityManager.js')).default;

  const body = { id: 'b_home', name: 'Testowa', type: 'planet', systemId: 'sys_home', x: 1, y: 2 };
  EntityManager.add(body);
  window.KOSMOS = { timeSystem: { gameTime: 5 } };
  const ss = new StationSystem();

  const bare = ss.createStation('b_home', { ownerEmpireId: 'emp_001', starterModules: false });
  assert(bare !== null, 'T1a: stacja powstała');
  assert(Array.isArray(bare.modules) && bare.modules.length === 0,
    `T1b: ZERO modułów (jest ${bare?.modules?.length})`);
  assert(bare.ownerEmpireId === 'emp_001', 'T1c: właściciel = imperium (nie „player")');

  const full = ss.createStation('b_home', { ownerEmpireId: 'player' });
  assert(full.modules.length > 0,
    `T1d: ścieżka GRACZA bez zmian — starter set nadal dokładany (${full.modules.length} modułów)`);

  const slotTypes = new Set(full.modules.map((m) => m.slotType ?? m.type ?? m.moduleId));
  assert(!bare.modules.length,
    'T2a: PIN — goła stacja nie ma CZEGOKOLWIEK, więc nie ma laboratorium (badania → kolonia GRACZA, :486) '
    + 'ani stoczni (okręt → flota GRACZA, :512/:521); oba wycieki pozostają uśpione');
  assert(slotTypes.size > 0, 'T2b: …a starter set gracza wciąż coś zawiera (kontrola pinu)');
  ss.destroyStation?.(bare.id); ss.destroyStation?.(full.id);
  EventBus.clear();
}

// ── T3/T4/T6 — zasiew w bootstrapie ─────────────────────────────────────────
console.log('\nT3/T4/T6: zasiew w EmpireColonyBootstrap');
{
  const src = codeOnly('src/systems/EmpireColonyBootstrap.js');
  assert(/createStation\(homePlanet\.id/.test(src), 'T3a: zasiew celuje w planetę macierzystą imperium');
  assert(/ownerEmpireId:\s*empireId/.test(src),
    'T3b: ownerEmpireId podany JAWNIE jako empireId — bez tego default „player" odwróciłby WSZYSTKIE filtry własności');
  assert(/starterModules:\s*false/.test(src), 'T3c: żeton zasiewany BEZ modułów');
  assert(/ownerColonyId:\s*colony\.planetId/.test(src), 'T3d: stempel kolonii-matki (S3.4c)');
  assert(src.indexOf('addColony(empireId') < src.indexOf('createStation('),
    'T3e: zasiew PO rejestracji kolonii — stolica istnieje, zanim dostanie żeton');

  assert(/ai:empireStationSeedFailed/.test(src) && /console\.warn/.test(src),
    'T4a: brak stationSystem = ostrzeżenie + zdarzenie (GŁOŚNO)');
  assert(!/throw/.test(src.slice(src.indexOf('createStation(') - 400, src.indexOf('createStation(') + 600)),
    'T4b: …ale NIE rzut — generacja świata nie może paść, bo headless GameCore nie wpina stacji');
  assert(/ai:empireStationSeeded/.test(src), 'T4c: sukces też zostawia ślad');

  const ssSrc = codeOnly('src/systems/StationSystem.js');
  assert(/starterModules\s*=\s*true/.test(ssSrc),
    'T6a: domyślna wartość starterModules to TRUE — ścieżka gracza niezmieniona');
  assert(/ownerEmpireId\s*=\s*'player'/.test(ssSrc),
    'T6b: default ownerEmpireId to nadal „player" — dlatego zasiew MUSI podawać jawnie (T3b)');
}

// ── T5 — PIN R-3: tech bojowy ───────────────────────────────────────────────
console.log('\nT5: PIN R-3 — point_defense w startingTechs spawnowanych archetypów');
{
  assert(AI_ARCHETYPE_SEQUENCE.length >= 1, 'T5a: sekwencja spawnu archetypów niepusta');
  for (const id of AI_ARCHETYPE_SEQUENCE) {
    const a = ARCHETYPES[id];
    assert(Array.isArray(a?.startingTechs) && a.startingTechs.includes('point_defense'),
      `T5b/${id}: ma point_defense w startingTechs`);
    assert(a.startingTechs.includes('basic_shielding'),
      `T5c/${id}: ma też basic_shielding — JEDYNY prereq point_defense (spójność drzewa)`);
  }
  assert(TECHS.point_defense?.requires?.includes('basic_shielding'),
    'T5d: kontrola pinu — point_defense NAPRAWDĘ wymaga basic_shielding (nie zgadujemy)');

  // Dlaczego to jest load-bearing: bez tego techu nie ma ani kadłuba, ani broni.
  const warHulls = ['hull_frigate', 'hull_destroyer', 'hull_cruiser'];
  assert(warHulls.every((h) => HULLS[h]?.requires === 'point_defense'),
    'T5e: WSZYSTKIE trzy kadłuby wojenne wymagają point_defense');
  const weapons = Object.values(SHIP_MODULES).filter((m) => m.slotType === 'weapon');
  assert(weapons.length > 0 && weapons.every((m) => m.requires === 'point_defense' || m.requires === 'tech_munitions'),
    `T5f: …i każdy z ${weapons.length} modułów broni jest bramkowany point_defense/tech_munitions`);

  // Archetypy-zaślepki (nigdy nie spawnowane) świadomie zostają bez startingTechs.
  const stubs = Object.keys(ARCHETYPES).filter((k) => !AI_ARCHETYPE_SEQUENCE.includes(k));
  assert(stubs.every((k) => !Array.isArray(ARCHETYPES[k].startingTechs)),
    `T5g: ${stubs.length} archetypów-zaślepek nie ma startingTechs w ogóle — bootstrap pomija grant, `
    + 'więc „wszystkie archetypy" znaczy „wszystkie, które gra spawnuje"');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
