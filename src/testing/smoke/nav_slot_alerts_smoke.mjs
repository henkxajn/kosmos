// ═══════════════════════════════════════════════════════════════════════════════
// nav_slot_alerts_smoke — KEEPER ARKUSZA UI, U4-1 (UI_PLAN §4.5, decyzja 4): plakietki alertów na kaflach dolnego paska
// nawigacji po usunięciu kart peek. `NavPeekProviders` zredukowany do predykatów (`hasSlotAlert`) — plakietka czytała
// z dawnej karty wyłącznie obecność alertu (`!!getPeekAlert(grupa)`), więc predykat MUSI dać to samo.
//
// WZORZEC (BASELINE niżej): tabela scen × 8 grup nagrana na drzewie SPRZED U4-1 (`336e149`) trybem `--record` —
// prawdziwy dawny moduł (`getPeekAlert`, karty z wierszami i i18n) na tych samych światach. Po U4-1 `--record` nie działa
// (dawnego API nie ma) i kończy się kodem 2.
//
// PINY (padają na drzewie sprzed U4-1 — tam nie ma `hasSlotAlert`):
//   A1…A22  każda scena: `hasSlotAlert(g)` === wzorzec dla 8 grup (civilization, economy, colony, population, diplomacy,
//           fleet, tech, shipyard) — m.in. kryzys tylko w 4. kolonii (populacja patrzy na pierwsze trzy), kryzys / brownout
//           tylko na placówce, woda z kontrolą zapasu, napięcie 59,4 / 59,5 (zaokrąglenie), wrogi statek i wrak, nauka
//           bez slotów, poza trybem cywilizacji
//   P1  `hasSlotAlert` zwraca boolean (nie obiekt alertu)
//   P2  moduł bez kart: brak `getPeekData` / `getPeekAlert`, brak importu i18n, brak wierszy (`rows`)
// KONTROLE (zielone po obu stronach — dotyczą samego wzorca):
//   K1  wzorzec nie jest jałowy: każda grupa poza stocznią ma w tabeli i `true`, i `false`
//   K2  stocznia nigdy nie ma alertu; scena poza trybem cywilizacji — wszystko `false`
// Uruchom: node src/testing/smoke/nav_slot_alerts_smoke.mjs            (keeper)
//          node src/testing/smoke/nav_slot_alerts_smoke.mjs --record   (tylko na drzewie sprzed U4-1 — wypisuje wzorzec)
// ═══════════════════════════════════════════════════════════════════════════════
import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
const header = (s) => console.log(`\n── ${s}`);

const NP = await import('../../ui/NavPeekProviders.js');   // przestrzeń nazw — nie wywraca się na żadnym drzewie

const GROUPS = ['civilization', 'economy', 'colony', 'population', 'diplomacy', 'fleet', 'tech', 'shipyard'];

// ── Świat: kolonie gracza (domyślnie dwie pełne + placówka), statki, dyplomacja, nauka ─────────────────────────────
function mkColony(id, o = {}) {
  return {
    planetId: id, name: o.name ?? id, isOutpost: !!o.outpost, credits: 0, creditsPerYear: o.cpy ?? 10,
    civSystem: { population: o.pop ?? 20, freePops: 2, loyalty: 80, effectiveHousing: 40,
      isFamine: !!o.famine, isUnrest: !!o.unrest, getAnnualGrowth: () => 0.5 },
    resourceSystem: { getPerYear: (r) => (r === 'water' ? (o.waterNet ?? 5) : 0),
      getAmount: (r) => (r === 'water' ? (o.water ?? 1000) : 0), energy: { brownout: !!o.brownout } },
    prosperitySystem: { prosperity: 60, getSatisfaction: () => 0.8,
      _getCurrentEpoch: () => ({ key: 'early', unlockedGoods: ['basic_supplies'] }) },
    factorySystem: { usedPoints: 1, totalPoints: 2 },
  };
}
function world(spec = {}) {
  const cols = [];
  if (!spec.noColonies) {
    cols.push(mkColony('c1', { name: 'Mstow', ...(spec.c1 ?? {}) }));
    cols.push(mkColony('c2', { name: 'Halny', ...(spec.c2 ?? {}) }));
    for (let i = 0; i < (spec.extra ?? 0); i++) cols.push(mkColony(`c${3 + i}`, spec[`c${3 + i}`] ?? {}));
    cols.push(mkColony('out', { outpost: true, ...(spec.out ?? {}) }));
  }
  const vessels = (spec.vessels ?? [{}]).map((v, i) => ({
    id: `v${i}`, name: `Statek ${i}`, position: { state: 'docked', dockedAt: 'c1' },
    _immob: !!v.immob, isWreck: !!v.wreck, ...(v.owner ? { owner: v.owner } : {}),
  }));
  window.KOSMOS = {
    civMode: spec.civMode !== false,
    colonyManager: {
      getPlayerColonies: () => cols, calculateTaxIncome: () => spec.tax ?? 5,
      getColony: (id) => cols.find((c) => c.planetId === id) ?? null,
      getActiveColony: () => cols.find((c) => !c.isOutpost) ?? null, _getShipyardLevel: () => 1, getShipQueues: () => [],
    },
    vesselManager: { getAllVessels: () => vessels, isImmobilized: (v) => !!v._immob, getTotalFleetUpkeep: () => spec.upkeep ?? 0 },
    civilianTradeSystem: { getTreasuryCredits: () => 1000 },
    diplomacySystem: { listVisiblePlayerRelations: () => spec.relations ?? [{ tension: 20 }] },
    warSystem: { listActive: () => spec.wars ?? [] },
    intelSystem: { listKnown: () => [], isAtLeast: () => false },
    researchSystem: { activeResearch: spec.research ?? [{ techId: 'none' }], getTotalRate: () => spec.rate ?? 5,
      getProgress: () => 0.5, getMaxSlots: () => 2, getETA: () => 60 },
    techSystem: { _researched: new Set() },
    observatorySystem: { getMaxObservatoryLevel: () => 0, getActiveBodyScans: () => [] },
    timeSystem: { gameTime: 50 },
    entityManager: { get: () => null },
  };
}

const SCENES = [
  ['spokój', {}],
  ['głód w kolonii 1', { c1: { famine: true } }],
  ['woda: ujemny bilans, zapas poniżej populacji', { c2: { waterNet: -3, water: 10, pop: 20 } }],
  ['woda: ujemny bilans, zapas ≥ populacji', { c2: { waterNet: -3, water: 50, pop: 20 } }],
  ['brownout w kolonii 1', { c1: { brownout: true } }],
  ['niepokój w kolonii 2', { c2: { unrest: true } }],
  ['kryzys tylko w 4. pełnej kolonii', { extra: 3, c4: { famine: true } }],
  ['kryzys tylko w 3. pełnej kolonii', { extra: 3, c3: { unrest: true } }],
  ['głód tylko na placówce', { out: { famine: true } }],
  ['brownout tylko na placówce', { out: { brownout: true } }],
  ['deficyt kredytów (utrzymanie floty)', { upkeep: 999 }],
  ['wojna', { wars: [{ id: 'w1' }] }],
  ['ultimatum', { relations: [{ tension: 10, ultimatumStartYear: 40 }] }],
  ['napięcie 60', { relations: [{ tension: 60 }] }],
  ['napięcie 59,4', { relations: [{ tension: 59.4 }] }],
  ['napięcie 59,5 (zaokrąglenie)', { relations: [{ tension: 59.5 }] }],
  ['własny statek unieruchomiony', { vessels: [{ immob: true }] }],
  ['wrogi statek unieruchomiony', { vessels: [{ immob: true, owner: 'emp_1' }] }],
  ['własny wrak unieruchomiony', { vessels: [{ immob: true, wreck: true }] }],
  ['nauka płynie, sloty puste', { research: [], rate: 5 }],
  ['nauka stoi, sloty puste', { research: [], rate: 0 }],
  ['bez kolonii', { noColonies: true }],
  ['poza trybem cywilizacji (z kryzysem i wojną)', { civMode: false, c1: { famine: true }, wars: [{ id: 'w1' }] }],
];

// ── Tryb nagrania wzorca (dawne API) ──────────────────────────────────────────────────────────────────────────────
if (process.argv.includes('--record')) {
  if (typeof NP.getPeekAlert !== 'function') { console.log('--record: brak dawnego `getPeekAlert` (drzewo po U4-1)'); process.exit(2); }
  const out = {};
  for (const [name, spec] of SCENES) { world(spec); out[name] = GROUPS.map((g) => !!NP.getPeekAlert(g)); }
  console.log(JSON.stringify(out, null, 0).replace(/\],"/g, '],\n"'));
  process.exit(0);
}

// WZORZEC — `--record` na `336e149` (dawne `!!getPeekAlert(g)`); kolejność grup jak GROUPS.
const BASELINE = {
  "spokój": [false,false,false,false,false,false,false,false],
  "głód w kolonii 1": [true,false,true,true,false,false,false,false],
  "woda: ujemny bilans, zapas poniżej populacji": [true,false,true,true,false,false,false,false],
  "woda: ujemny bilans, zapas ≥ populacji": [false,false,false,false,false,false,false,false],
  "brownout w kolonii 1": [true,true,true,true,false,false,false,false],
  "niepokój w kolonii 2": [true,false,true,true,false,false,false,false],
  "kryzys tylko w 4. pełnej kolonii": [true,false,true,false,false,false,false,false],
  "kryzys tylko w 3. pełnej kolonii": [true,false,true,true,false,false,false,false],
  "głód tylko na placówce": [false,false,false,false,false,false,false,false],
  "brownout tylko na placówce": [false,true,false,false,false,false,false,false],
  "deficyt kredytów (utrzymanie floty)": [false,true,false,false,false,false,false,false],
  "wojna": [false,false,false,false,true,false,false,false],
  "ultimatum": [false,false,false,false,true,false,false,false],
  "napięcie 60": [false,false,false,false,true,false,false,false],
  "napięcie 59,4": [false,false,false,false,false,false,false,false],
  "napięcie 59,5 (zaokrąglenie)": [false,false,false,false,true,false,false,false],
  "własny statek unieruchomiony": [false,false,false,false,false,true,false,false],
  "wrogi statek unieruchomiony": [false,false,false,false,false,false,false,false],
  "własny wrak unieruchomiony": [false,false,false,false,false,false,false,false],
  "nauka płynie, sloty puste": [false,false,false,false,false,false,true,false],
  "nauka stoi, sloty puste": [false,false,false,false,false,false,false,false],
  "bez kolonii": [false,false,false,false,false,false,false,false],
  "poza trybem cywilizacji (z kryzysem i wojną)": [false,false,false,false,false,false,false,false],
};

// ═══ A — scena po scenie ═══════════════════════════════════════════════════════
header('A  hasSlotAlert(g) === dawne !!getPeekAlert(g) — sceny × 8 grup');
{
  const f = NP.hasSlotAlert;
  SCENES.forEach(([name, spec], i) => {
    world(spec);
    const got = GROUPS.map((g) => (typeof f === 'function' ? f(g) : null));
    const want = BASELINE[name];
    ok(Array.isArray(want) && got.every((v, k) => v === want[k]),
      `A${i + 1} ${name}: ${JSON.stringify(got)} (wzorzec ${JSON.stringify(want)})`);
  });
}

// ═══ P — kształt modułu ════════════════════════════════════════════════════════
header('P  predykaty bez kart');
{
  world({ c1: { famine: true } });
  const f = NP.hasSlotAlert;
  const vals = typeof f === 'function' ? GROUPS.map((g) => f(g)) : [];
  ok(vals.length === GROUPS.length && vals.every((v) => typeof v === 'boolean') && vals.some((v) => v === true),
    `P1 \`hasSlotAlert\` zwraca boolean (także przy alercie): ${JSON.stringify(vals)}`);
  const src = readFileSync(fileURLToPath(new URL('../../ui/NavPeekProviders.js', import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/[^'\n]*$/gm, '');
  ok(!('getPeekData' in NP) && !('getPeekAlert' in NP) && !/i18n/.test(src) && !/\brows\b/.test(src),
    'P2 moduł bez kart: brak `getPeekData` / `getPeekAlert`, brak importu i18n, brak wierszy');
}

// ═══ K — wzorzec ═══════════════════════════════════════════════════════════════
header('K  wzorzec nie jest jałowy');
{
  const cols = GROUPS.map((g, k) => SCENES.map(([name]) => BASELINE[name]?.[k]));
  const both = GROUPS.map((g, k) => g === 'shipyard' || (cols[k].includes(true) && cols[k].includes(false)));
  ok(both.every(Boolean), `K1 KONTROLA: każda grupa poza stocznią ma we wzorcu i true, i false (${GROUPS.filter((g, k) => !both[k]).join(', ') || 'wszystkie'})`);
  const off = BASELINE['poza trybem cywilizacji (z kryzysem i wojną)'];
  ok(cols[GROUPS.indexOf('shipyard')].every((v) => v === false) && Array.isArray(off) && off.every((v) => v === false),
    'K2 KONTROLA: stocznia nigdy z alertem; poza trybem cywilizacji — wszystko false');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
