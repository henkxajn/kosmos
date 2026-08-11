// DIRECTOR SLICE 1 — keeper szablonów okrętów + resolvera (commit S3, workstream C).
//
// PO CO: `ShipTemplateResolver` jest JEDYNYM walidatorem pojemności po stronie logiki.
// `calcShipStats` tylko sumuje, a oba walidatory w repo siedzą w UI edytorów i NIE ZGADZAJĄ
// SIĘ ZE SOBĄ (`UnitDesignOverlay` typowany, `FleetTabPanel` liczy same sztuki). Gdyby ten
// resolver po cichu przepełnił kadłub, wykryłby to dopiero gracz oglądający flotę AI.
//
//   T1  katalog v1 ma poprawny KSZTAŁT (walidator, nie oko)
//   T2  trzy fregaty właściciela mieszczą się w hull_frigate CO DO SLOTU (1P + 3U, zero zapasu)
//   T3  role warp: FRG-1/FRG-2 skaczą, FRG-3 NIE MOŻE (celowy brak Komory Warp)
//   T4  kadłub: pierwszy spełniony wygrywa; brak żadnego ⇒ no_hull (nigdy cichy fallback)
//   T5  moduł: drabinka `tiers` schodzi do dna; slot required bez trafienia ⇒ no_module
//   T6  pojemność: sloty `required:false` odpadają OD KOŃCA; same wymagane ⇒ no_capacity
//   T7  kształt wyniku zgodny z startShipBuild (zwarta tablica string[], zero dziur null)
//   T8  determinizm — ten sam stan techu daje bit-identyczny wynik
//   T9  GŁOŚNA AWARIA: brak źródła techu w ctx RZUCA (nie degraduje do „nic nie zbadane")
//   T10 ⚠ PIN ZNALEZISKA: fallback kadłuba jest dla okrętów WOJENNYCH nieosiągalny, bo
//       point_defense bramkuje kadłub I KAŻDĄ broń. Ten pin PADNIE, gdy ktoś przeniesie
//       broń spod tego techu — i wtedy fallback naprawdę się budzi.

import { HULLS } from '../../data/HullsData.js';
import { SHIP_MODULES, UTILITY_SLOT_TYPES } from '../../data/ShipModulesData.js';
import { SHIP_TEMPLATES } from '../../data/ShipTemplateData.js';
import {
  resolveTemplate, validateTemplateCatalog, hullCapacity, moduleBucket, RESOLVE_REASONS,
} from '../../utils/ShipTemplateResolver.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

/** Predykat techu z jawnej listy — bez globali, bez zgadywania. */
const techs = (...ids) => ({ isResearched: (t) => ids.includes(t) });
/** Imperium, które zbadało wszystko (górna granica możliwości). */
const ALL_TECH = { isResearched: () => true };

const WARSHIPS = ['frigate_laser_escort', 'frigate_missile_escort', 'frigate_system_defender'];

// ── T1 — kształt katalogu ───────────────────────────────────────────────────
console.log('\nT1: kształt katalogu v1');
{
  const problems = validateTemplateCatalog();
  assert(Object.keys(problems).length === 0,
    `T1a: katalog przechodzi walidator kształtu ${Object.keys(problems).length ? JSON.stringify(problems) : ''}`);
  assert(Object.entries(SHIP_TEMPLATES).every(([k, v]) => v.id === k),
    'T1b: id === klucz mapy dla każdego wpisu');
  assert(WARSHIPS.every((id) => SHIP_TEMPLATES[id]?.role === 'warship'),
    'T1c: trzy fregaty właściciela są w katalogu z rolą warship');
}

// ── T2 — POJEMNOŚĆ: rdzeń dostawy ───────────────────────────────────────────
console.log('\nT2: trzy fregaty mieszczą się w hull_frigate co do slotu');
{
  const cap = hullCapacity(HULLS.hull_frigate);
  assert(cap.propulsion === 1 && cap.utility === 3,
    `T2a: hull_frigate = 1P + 3U (zmierzone: ${cap.propulsion}P + ${cap.utility}U)`);

  for (const id of WARSHIPS) {
    const r = resolveTemplate(id, ALL_TECH);
    assert(r.ok === true, `T2b/${id}: rozwiązuje się (${r.ok ? 'ok' : r.reason})`);
    if (!r.ok) continue;
    assert(r.hullId === 'hull_frigate', `T2c/${id}: kadłub = hull_frigate`);
    const p = r.modules.filter((m) => moduleBucket(m) === 'propulsion').length;
    const u = r.modules.filter((m) => moduleBucket(m) === 'utility').length;
    assert(p === cap.propulsion && u === cap.utility,
      `T2d/${id}: ${p}P + ${u}U = dokładnie pojemność, zero zapasu`);
    assert(r.dropped.length === 0, `T2e/${id}: NIC nie odpadło (ładunek stały właściciela nietknięty)`);
  }

  // Ładunki dosłownie takie, jakie podał właściciel — pin przeciwko cichej podmianie modułu.
  const expect = {
    frigate_laser_escort:    ['engine_warp', 'warp_tank', 'armor_heavy', 'weapon_laser'],
    frigate_missile_escort:  ['engine_warp', 'warp_tank', 'armor_heavy', 'weapon_missile'],
    frigate_system_defender: ['engine_warp', 'armor_heavy', 'weapon_missile', 'weapon_missile'],
  };
  for (const [id, mods] of Object.entries(expect)) {
    const r = resolveTemplate(id, ALL_TECH);
    assert(r.ok && JSON.stringify(r.modules) === JSON.stringify(mods),
      `T2f/${id}: ładunek = ${mods.join(' + ')}`);
  }
}

// ── T3 — role warp ──────────────────────────────────────────────────────────
console.log('\nT3: zdolność skoku wynika z modułu, nie z kadłuba');
{
  // Vessel.js:122-124 — warpFuel.max liczy się WYŁĄCZNIE z warpCapacityAdd modułów.
  const warpCap = (mods) => mods.reduce((s, m) => s + (SHIP_MODULES[m]?.stats?.warpCapacityAdd ?? 0), 0);
  const r1 = resolveTemplate('frigate_laser_escort', ALL_TECH);
  const r2 = resolveTemplate('frigate_missile_escort', ALL_TECH);
  const r3 = resolveTemplate('frigate_system_defender', ALL_TECH);
  assert(warpCap(r1.modules) > 0, 'T3a: FRG-1 ma pojemność warp > 0 (eskorta skacze)');
  assert(warpCap(r2.modules) > 0, 'T3b: FRG-2 ma pojemność warp > 0 (eskorta skacze)');
  assert(warpCap(r3.modules) === 0,
    'T3c: FRG-3 ma pojemność warp = 0 — CELOWO nie opuści swojego układu');
  assert(r3.modules.includes('engine_warp'),
    'T3d: …mimo że NIESIE silnik warp — bez Komory Warp jest on martwym balastem (zamierzony koszt roli)');
}

// ── T4 — wybór kadłuba ──────────────────────────────────────────────────────
console.log('\nT4: kadłub — pierwszy spełniony, brak ⇒ no_hull');
{
  // Katalog kontrolny: drabinka kadłubów, w której górny szczebel jest niedostępny.
  const CAT = {
    ladder: {
      id: 'ladder', role: 'warship', namePL: 'x', nameEN: 'x',
      hullTiers: ['hull_destroyer', 'hull_frigate', 'hull_small'],
      slots: [{ tiers: ['engine_chemical'], required: true }],
    },
  };
  const withPD = resolveTemplate('ladder', { ...techs('point_defense', 'exploration'), catalog: CAT });
  assert(withPD.ok && withPD.hullId === 'hull_destroyer',
    'T4a: z point_defense wygrywa PIERWSZY szczebel (hull_destroyer)');
  const noPD = resolveTemplate('ladder', { ...techs('exploration'), catalog: CAT });
  assert(noPD.ok && noPD.hullId === 'hull_small',
    'T4b: bez point_defense drabinka schodzi do hull_small');
  const none = resolveTemplate('ladder', { ...techs(), catalog: CAT });
  assert(none.ok === false && none.reason === RESOLVE_REASONS.NO_HULL,
    'T4c: żaden kadłub nieosiągalny ⇒ no_hull (a NIE cichy fallback na cokolwiek)');
  assert(Array.isArray(none.detail?.tried) && none.detail.tried.length === 3,
    'T4d: powód niesie listę próbowanych kadłubów (diagnostyka dla DebugLoga S4)');

  assert(resolveTemplate('nie_ma_takiego', ALL_TECH).reason === RESOLVE_REASONS.UNKNOWN_TEMPLATE,
    'T4e: nieznany szablon ⇒ unknown_template');
}

// ── T5 — drabinka modułów ───────────────────────────────────────────────────
console.log('\nT5: moduł — drabinka tiers, required bez trafienia ⇒ no_module');
{
  // science_probe to jedyny żywy wpis używający drabinki (engine_fusion→ion→chemical).
  const best = resolveTemplate('science_probe', ALL_TECH);
  assert(best.ok && best.modules[0] === 'engine_fusion', 'T5a: z pełnym techem wygrywa engine_fusion');
  const mid = resolveTemplate('science_probe', techs('exploration', 'ion_drives'));
  assert(mid.ok && mid.modules[0] === 'engine_ion', 'T5b: bez fusion schodzi na engine_ion');
  const floor = resolveTemplate('science_probe', techs('exploration'));
  assert(floor.ok && floor.modules[0] === 'engine_chemical',
    'T5c: dno drabinki (requires:null) NIGDY nie zawodzi — to jest sens gwarantowanego dna');

  const CAT = {
    needy: {
      id: 'needy', role: 'science', namePL: 'x', nameEN: 'x',
      hullTiers: ['hull_small'],
      slots: [
        { tiers: ['engine_chemical'], required: true },
        { tiers: ['quantum_scanner'], required: true },   // requires quantum_computing
      ],
    },
  };
  const r = resolveTemplate('needy', { ...techs('exploration'), catalog: CAT });
  assert(r.ok === false && r.reason === RESOLVE_REASONS.NO_MODULE,
    'T5d: slot required bez trafienia ⇒ no_module');
  assert(r.detail?.slotIndex === 1, 'T5e: powód wskazuje KTÓRY slot zawiódł');

  const CAT2 = {
    opt: {
      id: 'opt', role: 'science', namePL: 'x', nameEN: 'x',
      hullTiers: ['hull_small'],
      slots: [
        { tiers: ['engine_chemical'], required: true  },
        { tiers: ['quantum_scanner'], required: false },
      ],
    },
  };
  const r2 = resolveTemplate('opt', { ...techs('exploration'), catalog: CAT2 });
  assert(r2.ok === true && r2.modules.length === 1 && r2.dropped.length === 1,
    'T5f: slot required:false po prostu wypada (okręt powstaje uboższy)');
}

// ── T6 — pojemność i porzucanie ─────────────────────────────────────────────
console.log('\nT6: pojemność — required:false odpada OD KOŃCA, same wymagane ⇒ no_capacity');
{
  // hull_small = 1P + 2U; żądamy 3U, z czego środkowy jest opcjonalny.
  const CAT = {
    fat: {
      id: 'fat', role: 'warship', namePL: 'x', nameEN: 'x',
      hullTiers: ['hull_small'],
      slots: [
        { tiers: ['engine_chemical'],   required: true  },
        { tiers: ['fuel_tank'],         required: true  },
        { tiers: ['armor_standard'],    required: false },   // ← ten ma zginąć
        { tiers: ['cargo_small'],       required: true  },
      ],
    },
  };
  const r = resolveTemplate('fat', { ...techs('exploration'), catalog: CAT });
  assert(r.ok === true, 'T6a: mieści się po porzuceniu opcjonalnego slotu');
  assert(JSON.stringify(r.modules) === JSON.stringify(['engine_chemical', 'fuel_tank', 'cargo_small']),
    'T6b: zginął OSTATNI opcjonalny w przepełnionym wiadrze, wymagane przeżyły');
  assert(r.dropped.some((d) => d.reason === RESOLVE_REASONS.NO_CAPACITY && d.moduleId === 'armor_standard'),
    'T6c: porzucenie jest RAPORTOWANE, nie ciche');

  const CAT2 = {
    rigid: {
      id: 'rigid', role: 'warship', namePL: 'x', nameEN: 'x',
      hullTiers: ['hull_small'],
      slots: [
        { tiers: ['engine_chemical'], required: true },
        { tiers: ['fuel_tank'],       required: true },
        { tiers: ['armor_standard'],  required: true },
        { tiers: ['cargo_small'],     required: true },
      ],
    },
  };
  const r2 = resolveTemplate('rigid', { ...techs('exploration'), catalog: CAT2 });
  assert(r2.ok === false && r2.reason === RESOLVE_REASONS.NO_CAPACITY,
    'T6d: same wymagane ponad pojemność ⇒ no_capacity (a NIE ciche obcięcie modułu)');

  // Wiadra są rozdzielne: nadmiar napędu nie zjada slotów użytkowych.
  const CAT3 = {
    engines: {
      id: 'engines', role: 'warship', namePL: 'x', nameEN: 'x',
      hullTiers: ['hull_small'],   // 1 slot propulsion
      slots: [
        { tiers: ['engine_chemical'], required: true  },
        { tiers: ['engine_chemical'], required: false },
      ],
    },
  };
  const r3 = resolveTemplate('engines', { ...techs('exploration'), catalog: CAT3 });
  assert(r3.ok === true && r3.modules.length === 1,
    'T6e: drugi silnik odpada na pojemności PROPULSION, choć sloty utility stoją wolne');
}

// ── T7 — kształt wyniku ─────────────────────────────────────────────────────
console.log('\nT7: kształt zgodny z startShipBuild(planetId, hullId, moduleIds)');
{
  const r = resolveTemplate('frigate_laser_escort', ALL_TECH);
  assert(typeof r.hullId === 'string' && HULLS[r.hullId], 'T7a: hullId to istniejący klucz HULLS');
  assert(Array.isArray(r.modules) && r.modules.every((m) => typeof m === 'string'),
    'T7b: modules to płaska tablica stringów');
  assert(r.modules.every((m) => m !== null && SHIP_MODULES[m]),
    'T7c: ZERO dziur null — inaczej niż pozycyjne szablony gracza z UnitDesignOverlay');
  assert(r.modules.every((m) => moduleBucket(m) !== null),
    'T7d: każdy moduł ma slotType z propulsion ∪ UTILITY_SLOT_TYPES');
  assert(UTILITY_SLOT_TYPES.has('weapon') && UTILITY_SLOT_TYPES.has('shield'),
    'T7e: zbiór UTILITY_SLOT_TYPES obejmuje broń i tarcze (nagłówek pliku danych jest nieaktualny)');
}

// ── T8 — determinizm ────────────────────────────────────────────────────────
console.log('\nT8: determinizm');
{
  const a = JSON.stringify(WARSHIPS.map((id) => resolveTemplate(id, techs('point_defense', 'ion_drives', 'warp_drive'))));
  const b = JSON.stringify(WARSHIPS.map((id) => resolveTemplate(id, techs('point_defense', 'ion_drives', 'warp_drive'))));
  assert(a === b, 'T8a: dwa przebiegi z tym samym stanem techu = bit-identyczny wynik');
}

// ── T9 — głośna awaria ──────────────────────────────────────────────────────
console.log('\nT9: brak źródła techu RZUCA (audyt R12)');
{
  let threw = false;
  try { resolveTemplate('science_probe', {}); } catch { threw = true; }
  assert(threw,
    'T9a: ctx bez isResearched/techSystem rzuca — cichy fallback dałby „no_hull" dla WSZYSTKIEGO, '
    + 'czyli regułę nieodróżnialną od niepodłączonej');
}

// ── T10 — PIN ZNALEZISKA ────────────────────────────────────────────────────
console.log('\nT10: PIN — fallback kadłuba jest dla okrętów wojennych nieosiągalny');
{
  const weapons = Object.values(SHIP_MODULES).filter((m) => m.slotType === 'weapon');
  assert(weapons.length > 0 && weapons.every((m) => m.requires === 'point_defense' || m.requires === 'tech_munitions'),
    `T10a: każdy moduł broni (${weapons.length}) jest bramkowany point_defense/tech_munitions`);
  assert(HULLS.hull_frigate.requires === 'point_defense',
    'T10b: hull_frigate też wymaga point_defense — TEN SAM tech co broń');

  // Imperium bez point_defense: kadłub schodzi na hull_small, ale broni nie ma czym obsadzić.
  for (const id of WARSHIPS) {
    const r = resolveTemplate(id, techs('exploration', 'ion_drives', 'warp_drive'));
    assert(r.ok === false && r.reason === RESOLVE_REASONS.NO_MODULE,
      `T10c/${id}: bez point_defense wynikiem jest no_module — NIE bezbronny okręt na kadłubie zapasowym`);
  }
  assert(SHIP_TEMPLATES.frigate_laser_escort.hullTiers.includes('hull_small'),
    'T10d: fallback mimo to ZOSTAJE w danych (instrukcja właściciela) — ten pin pilnuje, '
    + 'żeby jego martwota była faktem zmierzonym, a nie przeoczeniem');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
