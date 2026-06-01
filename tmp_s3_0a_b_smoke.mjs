// S3.0a Commit (b) — Wodór jako surowiec + złoża gazowców: smoke (offline).
//
// Pokrycie:
//   T1  MINED_RESOURCES.H + ELEMENT_TO_RESOURCE.H                          (5 cases)
//   T2  generateDeposits: H na gas/ice/rocky_cold, BRAK na rocky/hot_rocky (7 cases)
//   T3  ensureResourceDeposit: backfill + idempotent + próg + nie rusza istniejących (6 cases)
//   T4  RESOURCE_ICONS.H + i18n resource.H/.name (PL+EN)                   (5 cases)
//   T5  Migracja łańcuch v78→v79→v80 + CURRENT_VERSION                     (6 cases)

globalThis.localStorage = {
  _store: {}, getItem(k){return this._store[k]??null;}, setItem(k,v){this._store[k]=String(v);}, removeItem(k){delete this._store[k];},
};
globalThis.window = globalThis;
globalThis.window.KOSMOS = { debug: {} };  // brak scenario → depositMult=1
globalThis.document = { createElement: () => ({ style:{}, appendChild(){}, addEventListener(){} }), getElementById: () => null };

const { MINED_RESOURCES }      = await import('./src/data/ResourcesData.js');
const { ELEMENT_TO_RESOURCE }  = await import('./src/data/ElementsData.js');
const { RESOURCE_ICONS }       = await import('./src/data/BuildingsData.js');
const { DepositSystem }        = await import('./src/systems/DepositSystem.js');
const { CURRENT_VERSION, migrate } = await import('./src/systems/SaveMigration.js');
const EN = (await import('./src/i18n/en.js')).default;
const PL = (await import('./src/i18n/pl.js')).default;

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }

const findH = (deps) => deps.find(d => d.resourceId === 'H');

// ── T1 — MINED_RESOURCES.H + mapowanie ───────────────────────────────────
header('T1: MINED_RESOURCES.H + ELEMENT_TO_RESOURCE.H');
{
  const h = MINED_RESOURCES.H;
  assert(!!h, 'MINED_RESOURCES.H istnieje');
  assert(h?.rarity === 5, `rarity === 5 (got ${h?.rarity})`);
  assert(h?.element === 'H', `element === 'H' (got ${h?.element})`);
  assert(h?.weight === 0.1, `weight === 0.1 (got ${h?.weight})`);
  assert(ELEMENT_TO_RESOURCE.H === 'H', `ELEMENT_TO_RESOURCE.H === 'H' (got ${ELEMENT_TO_RESOURCE.H})`);
}

// ── T2 — generateDeposits: gdzie pojawia się H ───────────────────────────
header('T2: generateDeposits — H na gas/ice/rocky_cold, brak na rocky/hot_rocky');
{
  const ds = new DepositSystem();
  const gen = (id, H) => { const e = { id, composition: { H } }; ds.generateDeposits(e); return e.deposits; };

  const gas = gen('body_gas', 61);
  assert(!!findH(gas), 'gas (H=61) ma złoże H');
  assert(Math.abs(findH(gas).richness - 1.0) < 1e-6, `gas richness clamp 1.0 (got ${findH(gas)?.richness})`);

  const ice = gen('body_ice', 9);
  assert(!!findH(ice) && Math.abs(findH(ice).richness - 0.9) < 1e-6, `ice (H=9) richness 0.9 (got ${findH(ice)?.richness})`);

  const cold = gen('body_cold', 5);
  assert(!!findH(cold) && Math.abs(findH(cold).richness - 0.5) < 1e-6, `rocky_cold (H=5) richness 0.5 (got ${findH(cold)?.richness})`);

  const rocky = gen('body_rocky', 1);
  assert(!findH(rocky), 'rocky (H=1, ≤próg 2.0) BRAK złoża H');

  const hot = gen('body_hot', 0);
  assert(!findH(hot), 'hot_rocky (H=0) BRAK złoża H');
}

// ── T3 — ensureResourceDeposit: backfill ─────────────────────────────────
header('T3: ensureResourceDeposit backfill + idempotent + próg');
{
  const ds = new DepositSystem();

  // Ciało z istniejącym złożem Fe, composition.H=9, bez H → dodaje H, nie rusza Fe
  const e = { id: 'body_x', composition: { H: 9, Fe: 22 }, deposits: [{ resourceId: 'Fe', richness: 1.0, totalAmount: 5000, remaining: 4000 }] };
  const added = ds.ensureResourceDeposit(e, 'H');
  assert(added === true, 'ensureResourceDeposit zwraca true (dodano H)');
  assert(!!findH(e.deposits), 'złoże H dodane');
  assert(e.deposits.find(d => d.resourceId === 'Fe')?.remaining === 4000, 'istniejące złoże Fe nietknięte (remaining 4000)');

  // Idempotent — drugie wołanie nie duplikuje
  const again = ds.ensureResourceDeposit(e, 'H');
  assert(again === false, 'drugie wołanie zwraca false (idempotent)');
  assert(e.deposits.filter(d => d.resourceId === 'H').length === 1, 'tylko JEDNO złoże H (brak duplikatu)');

  // Próg niespełniony (H=1 ≤ 2.0) → nie dodaje
  const e2 = { id: 'body_y', composition: { H: 1 }, deposits: [] };
  assert(ds.ensureResourceDeposit(e2, 'H') === false && !findH(e2.deposits), 'H=1 (≤próg) → nie dodaje');
}

// ── T4 — ikona + i18n ─────────────────────────────────────────────────────
header('T4: RESOURCE_ICONS.H + i18n');
{
  assert(RESOURCE_ICONS.H === '💨', `RESOURCE_ICONS.H === 💨 (got ${RESOURCE_ICONS.H})`);
  assert(EN['resource.H'] === 'Hydrogen', `EN resource.H (got ${EN['resource.H']})`);
  assert(EN['resource.H.name'] === 'Hydrogen', `EN resource.H.name (got ${EN['resource.H.name']})`);
  assert(PL['resource.H'] === 'Wodór', `PL resource.H (got ${PL['resource.H']})`);
  assert(PL['resource.H.name'] === 'Wodór', `PL resource.H.name (got ${PL['resource.H.name']})`);
}

// ── T5 — migracja łańcuch v78→v80 ────────────────────────────────────────
header('T5: migracja łańcuch v78→v79→v80');
{
  assert(CURRENT_VERSION === 80, `CURRENT_VERSION === 80 (got ${CURRENT_VERSION})`);
  const oldSave = {
    version: 78,
    civ4x: {
      vesselManager: { vessels: [{ id: 'v1', fuelType: 'power_cells', fuel: { fuelType: 'power_cells', current: 5 } }] },
      colonies: [{ resources: { inventory: { Fe: 10 } } }],
    },
  };
  const m = migrate(oldSave);
  assert(m.version === 80, `migrated.version === 80 (got ${m.version})`);
  assert(m.civ4x.vesselManager.vessels[0].fuelType === 'fuel', `v79: fuelType → 'fuel' (got ${m.civ4x.vesselManager.vessels[0].fuelType})`);
  const inv = m.civ4x.colonies[0].resources.inventory;
  assert(inv.fuel === 30, `v79: inventory.fuel === 30 (got ${inv.fuel})`);
  assert(inv.H === 0, `v80: inventory.H === 0 (got ${inv.H})`);
  // idempotent: brak crasha gdy H już jest
  const m2 = migrate({ version: 79, civ4x: { colonies: [{ resources: { inventory: { H: 5 } } }] } });
  assert(m2.civ4x.colonies[0].resources.inventory.H === 5, 'v80 idempotent: istniejące inventory.H zachowane (5)');
}

console.log(`\n${'='.repeat(50)}`);
console.log(`WYNIK: ${pass} PASS / ${fail} FAIL`);
console.log('='.repeat(50));
process.exit(fail === 0 ? 0 : 1);
