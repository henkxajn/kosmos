// Energy Brownout Gate — smoke (offline).
//
// Brownout ma REALNIE ograniczać produkcję proporcjonalnie do pokrycia energią
// (avail = production/consumption ∈ [0,1]): kopalnie (poziom wejściowy), fabryki
// (przepustowość), badania (dodatni przyrost). NIGDY: energia ani survival food/water.
//
// Pokrycie:
//   T1  getEnergyAvailability — bal 0→1.0; +4→1.0; bal 0→1.0; -6→0.5; -4→0.0
//   T2  _tickMineExtraction: kopalnia grid + avail=0.5 → połowa; balance≥0 → pełny
//   T3  KONSERWACJA ZŁOŻA (guard przed „mnożenie wyniku"): avail=0.5 → dep.remaining
//       spada o POŁOWĘ pełnej ekstrakcji (nie o pełną). Najważniejsza asercja.
//   T4  Restricted own-reactor (gas_fuel_refinery, grid=false) + brownout → fuel bez zmian
//   T5  Restricted grid (syntetyczny mineResource+energyCost:4) + brownout → duszony
//   T6  Split: generyczna own-reactor (syntetyczny energyCost:0) + brownout → NIE duszona
//   T7  FactorySystem._tick: avail=0.5 → ~połowa jednostek; avail=0 → 0 + progress nie rośnie
//   T8  [wymóg] UI flag sync: brownout===true ⟺ avail<1 w tym samym ticku
//   T9  [wymóg] Dynamic energyCost: _mineLevelDirty przelicza SPLIT grid/ungated (nie tylko poziom)
//   T10 [wymóg] Kompozycja mnożników: research avail×(labor-baked perYear) + mina avail×asteroid×2
//       — multiplikatywnie, bez capowania. (OUTPOST_EFFICIENCY/laborEff działają na
//        rate-path=research, NIE na ekstrakcji kopalń/fabryk — patrz komentarz przy T10.)

globalThis.localStorage = {
  _store: {}, getItem(k){return this._store[k]??null;}, setItem(k,v){this._store[k]=String(v);}, removeItem(k){delete this._store[k];},
};
globalThis.window = globalThis;
globalThis.window.KOSMOS = { debug: {} };  // brak resourceSystem → isActive=false
globalThis.document = { createElement: () => ({ style:{}, appendChild(){}, addEventListener(){} }), getElementById: () => null };

const { BUILDINGS }      = await import('../../data/BuildingsData.js');
const { ResourceSystem } = await import('../../systems/ResourceSystem.js');
const { FactorySystem }  = await import('../../systems/FactorySystem.js');
const { BuildingSystem } = await import('../../systems/BuildingSystem.js');
const { GAME_CONFIG }    = await import('../../config/GameConfig.js');

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// Sanity: kill-switch domyślnie ON (bez tego cała bramka byłaby no-opem)
assert(GAME_CONFIG.FEATURES?.energyBrownoutGate === true, 'FEATURES.energyBrownoutGate default ON');

// ── Helpery ───────────────────────────────────────────────────────────────
const DEP = (resourceId) => ({ resourceId, richness: 1.0, totalAmount: 10000, remaining: 10000 });

// makeBS: BuildingSystem z realnym ResourceSystem + opcjonalne producentów energii.
// energy: {prod, cons} → registerProducer ustawia balance = prod - cons.
function makeBS(entries, deposits, energy = null) {
  const bs = Object.create(BuildingSystem.prototype);
  bs._deposits = deposits;
  bs.resourceSystem = new ResourceSystem();
  if (energy) {
    if (energy.prod) bs.resourceSystem.registerProducer('e_prod', { energy: energy.prod });
    if (energy.cons) bs.resourceSystem.registerProducer('e_cons', { energy: -energy.cons });
  }
  bs._mineLevelDirty = true;
  bs._active = new Map(entries.map((e, i) => [`k${i}`, e]));
  bs._planetId = null;   // → asteroid bonus block skip (colMgr nie odpytywany)
  bs.techSystem = null;
  return bs;
}

// ── T1 — getEnergyAvailability ──────────────────────────────────────────────
header('T1: getEnergyAvailability (proporcjonalny)');
{
  const rs0 = new ResourceSystem();
  assert(rs0.getEnergyAvailability() === 1.0, 'brak producentów (bal 0) → 1.0');

  const rsA = new ResourceSystem();
  rsA.registerProducer('p', { energy: 8 }); rsA.registerProducer('c', { energy: -4 });
  assert(rsA.getEnergyAvailability() === 1.0, '{+8}+{-4} (bal +4) → 1.0');

  const rsB = new ResourceSystem();
  rsB.registerProducer('p', { energy: 8 }); rsB.registerProducer('c', { energy: -8 });
  assert(rsB.getEnergyAvailability() === 1.0, '{+8}+{-8} (bal 0) → 1.0');

  const rsC = new ResourceSystem();
  rsC.registerProducer('p', { energy: 6 }); rsC.registerProducer('c', { energy: -12 });
  assert(rsC.getEnergyAvailability() === 0.5, `{+6}+{-12} (bal -6) → 0.5 (got ${rsC.getEnergyAvailability()})`);

  const rsD = new ResourceSystem();
  rsD.registerProducer('c', { energy: -4 });
  assert(rsD.getEnergyAvailability() === 0.0, `{-4} (bal -4) → 0.0 (got ${rsD.getEnergyAvailability()})`);
}

// ── T2 — kopalnia grid: avail=0.5 → połowa; balance≥0 → pełny ────────────────
header('T2: kopalnia grid — avail skaluje wydobycie');
{
  const mineEntry = () => [{ building: { isMine: true, id: 'mine', energyCost: 4 }, level: 1 }];
  const bsFull = makeBS(mineEntry(), [DEP('Fe')]);                 // bal 0 → avail 1.0
  const bsHalf = makeBS(mineEntry(), [DEP('Fe')], { prod: 6, cons: 12 }); // avail 0.5
  bsFull._tickMineExtraction(1.0);
  bsHalf._tickMineExtraction(1.0);
  const full = bsFull.resourceSystem.getAmount('Fe');
  const half = bsHalf.resourceSystem.getAmount('Fe');
  assert(full > 0, `pełne wydobycie > 0 (got ${full})`);
  assert(near(half, full * 0.5), `avail=0.5 → połowa wydobycia (got ${half} vs ${full * 0.5})`);
}

// ── T3 — KONSERWACJA ZŁOŻA (guard przed „mnożenie wyniku") ───────────────────
header('T3: konserwacja złoża — avail skaluje DEPLETION (nie tylko wynik)');
{
  const mineEntry = () => [{ building: { isMine: true, id: 'mine', energyCost: 4 }, level: 1 }];
  const depFull = DEP('Fe'), depHalf = DEP('Fe');
  const bsFull = makeBS(mineEntry(), [depFull]);
  const bsHalf = makeBS(mineEntry(), [depHalf], { prod: 6, cons: 12 }); // avail 0.5
  bsFull._tickMineExtraction(1.0);
  bsHalf._tickMineExtraction(1.0);
  const usedFull = 10000 - depFull.remaining;
  const usedHalf = 10000 - depHalf.remaining;
  assert(usedFull > 0, `złoże pełne depletuje (zużyto ${usedFull})`);
  assert(near(usedHalf, usedFull * 0.5),
         `avail=0.5 → złoże zużyte o POŁOWĘ (got ${usedHalf} vs ${usedFull * 0.5}) — nie o pełną`);

  // Skrajny guard: avail=0 → złoże NIETKNIĘTE (mnożenie wyniku wyczerpałoby je pełną prędkością)
  const depZero = DEP('Fe');
  const bsZero = makeBS(mineEntry(), [depZero], { cons: 4 }); // bal -4 → avail 0
  bsZero._tickMineExtraction(1.0);
  assert(depZero.remaining === 10000, `avail=0 → złoże NIETKNIĘTE (got ${depZero.remaining})`);
  assert(bsZero.resourceSystem.getAmount('Fe') === 0, 'avail=0 → 0 Fe do magazynu');
}

// ── T4 — restricted own-reactor (gas_fuel_refinery, grid=false) + brownout ───
header('T4: restricted own-reactor — brownout NIE dusi (fuel bez zmian)');
{
  const refEntry = () => [{ building: { isMine: true, mineResource: 'H', refineTo: 'fuel', refineRatio: 1.0, id: 'gas_fuel_refinery', energyCost: 0 }, level: 1 }];
  const bsFull = makeBS(refEntry(), [DEP('H')]);
  const bsBrown = makeBS(refEntry(), [DEP('H')], { cons: 8 }); // bal -8 → avail 0
  bsFull._tickMineExtraction(1.0);
  bsBrown._tickMineExtraction(1.0);
  const full = bsFull.resourceSystem.getAmount('fuel');
  const brown = bsBrown.resourceSystem.getAmount('fuel');
  assert(full > 0, `rafineria produkuje fuel (got ${full})`);
  assert(near(brown, full), `brownout (avail=0) NIE dusi own-reactora (got ${brown} == ${full})`);
}

// ── T5 — restricted grid + brownout → duszony ───────────────────────────────
header('T5: restricted grid — brownout dusi');
{
  const gridRestr = () => [{ building: { isMine: true, mineResource: 'Ti', id: 'syn_grid_mine', energyCost: 4 }, level: 1 }];
  const bsFull = makeBS(gridRestr(), [DEP('Ti')]);
  const bsHalf = makeBS(gridRestr(), [DEP('Ti')], { prod: 6, cons: 12 }); // avail 0.5
  bsFull._tickMineExtraction(1.0);
  bsHalf._tickMineExtraction(1.0);
  const full = bsFull.resourceSystem.getAmount('Ti');
  const half = bsHalf.resourceSystem.getAmount('Ti');
  assert(full > 0 && near(half, full * 0.5), `restricted grid duszony (got ${half} vs ${full * 0.5})`);
}

// ── T6 — split: generyczna own-reactor + brownout → NIE duszona ──────────────
header('T6: split — generyczna own-reactor (energyCost:0) NIE duszona');
{
  const genUngated = () => [{ building: { isMine: true, id: 'syn_own_reactor_mine', energyCost: 0 }, level: 1 }];
  const bsFull = makeBS(genUngated(), [DEP('Cu')]);
  const bsBrown = makeBS(genUngated(), [DEP('Cu')], { cons: 8 }); // avail 0
  bsFull._tickMineExtraction(1.0);
  bsBrown._tickMineExtraction(1.0);
  const full = bsFull.resourceSystem.getAmount('Cu');
  const brown = bsBrown.resourceSystem.getAmount('Cu');
  assert(full > 0, `generyczna own-reactor wydobywa (got ${full})`);
  assert(near(brown, full), `energyCost:0 → poza bramką mimo brownout (got ${brown} == ${full})`);
  // I potwierdź, że split faktycznie zaklasyfikował jako ungated
  assert(bsBrown._cachedMineLevelUngated === 1 && bsBrown._cachedMineLevelGrid === 0,
         `split: ungated=1, grid=0 (got ungated=${bsBrown._cachedMineLevelUngated}, grid=${bsBrown._cachedMineLevelGrid})`);
}

// ── T7 — FactorySystem._tick: avail skaluje przepustowość ───────────────────
header('T7: FactorySystem — avail skaluje produkcję (progress += dt×avail)');
{
  function makeFactory(availOverride) {
    const rs = new ResourceSystem();
    rs.receive({ Fe: 1e6, C: 1e6 });   // hojny zapas składników (recipe structural_alloys {Fe:8,C:4})
    const fs = new FactorySystem(rs);
    fs._totalPoints = 1;
    fs._mode = 'manual';
    fs._allocations.set('structural_alloys', { points: 1, progress: 0, targetQty: null, produced: 0 });
    // Wymuś avail (izoluje logikę fabryki od setupu energetycznego)
    rs.getEnergyAvailability = () => availOverride;
    return fs;
  }
  // _getOwnerColony fast-path
  const prevKOSMOS = window.KOSMOS;
  window.KOSMOS = { debug: {}, colonyManager: { activePlanetId: 'home', getColony: () => ({ planetId: 'home', buildingSystem: { techSystem: null } }), getAllColonies: () => [] } };

  const fsFull = makeFactory(1.0);  window.KOSMOS.factorySystem = fsFull; fsFull._update(2.0);
  const producedFull = fsFull._allocations.get('structural_alloys')?.produced ?? 0;

  const fsHalf = makeFactory(0.5);  window.KOSMOS.factorySystem = fsHalf; fsHalf._update(2.0);
  const producedHalf = fsHalf._allocations.get('structural_alloys')?.produced ?? 0;

  const fsZero = makeFactory(0.0);  window.KOSMOS.factorySystem = fsZero; fsZero._update(2.0);
  const allocZero = fsZero._allocations.get('structural_alloys');
  const producedZero = allocZero?.produced ?? 0;

  window.KOSMOS = prevKOSMOS;

  assert(producedFull > 0, `avail=1.0 → produkcja > 0 (got ${producedFull})`);
  assert(Math.abs(producedHalf - producedFull * 0.5) <= 1, `avail=0.5 → ~połowa jednostek (got ${producedHalf} vs ~${producedFull * 0.5})`);
  assert(producedZero === 0, `avail=0 → 0 jednostek (got ${producedZero})`);
  assert(allocZero.progress === 0, `avail=0 → progress nie rośnie (got ${allocZero.progress})`);
}

// ── T8 [wymóg] — synchronizacja flagi UI brownout z avail ───────────────────
header('T8: UI flag sync — brownout===true ⟺ avail<1 (ten sam tick)');
{
  const cases = [
    { prod: 0,  cons: 0,  }, // bal 0
    { prod: 8,  cons: 4,  }, // bal +4
    { prod: 6,  cons: 12, }, // bal -6 → avail 0.5
    { prod: 0,  cons: 4,  }, // bal -4 → avail 0
  ];
  let allSync = true;
  for (const c of cases) {
    const rs = new ResourceSystem();
    if (c.prod) rs.registerProducer('p', { energy: c.prod });
    if (c.cons) rs.registerProducer('c', { energy: -c.cons });
    const avail = rs.getEnergyAvailability();
    const brown = rs.energy.brownout;
    const sync = (brown === true) === (avail < 1);
    if (!sync) { allSync = false; console.log(`    [desync] prod=${c.prod} cons=${c.cons} brownout=${brown} avail=${avail}`); }
  }
  assert(allSync, 'brownout ⟺ avail<1 dla wszystkich przypadków (bez fałszywego ostrzeżenia)');
}

// ── T9 [wymóg] — dynamiczna zmiana energyCost przelicza SPLIT (nie tylko poziom) ──
header('T9: dirty flag przelicza split grid/ungated (nie tylko poziom)');
{
  // Kopalnia startowo own-reactor (energyCost:0) → ungated.
  const entry = { building: { isMine: true, id: 'morph_mine', energyCost: 0 }, level: 1 };
  const bs = makeBS([entry], [DEP('Fe')]);
  bs._tickMineExtraction(1.0);
  assert(bs._cachedMineLevelUngated === 1 && bs._cachedMineLevelGrid === 0,
         `start: ungated=1, grid=0 (got ungated=${bs._cachedMineLevelUngated}, grid=${bs._cachedMineLevelGrid})`);

  // Symuluj runtime-flip energyCost 0→4 (jak upgrade/przebudowa) + dirty (co robią 4 sites).
  entry.building.energyCost = 4;
  bs._mineLevelDirty = true;   // ← :411/:789/:938/:989 ustawiają to samo
  bs._tickMineExtraction(1.0);
  assert(bs._cachedMineLevelGrid === 1 && bs._cachedMineLevelUngated === 0,
         `po dirty: grid=1, ungated=0 — SPLIT przeliczony, nie tylko poziom (got grid=${bs._cachedMineLevelGrid}, ungated=${bs._cachedMineLevelUngated})`);
}

// ── T10 [wymóg] — kompozycja mnożników (multiplikatywna, bez capowania) ──────
// OUTPOST_EFFICIENCY / _getBuildingLaborEfficiency skalują producer RATES (_applyTechMultipliers),
// NIE ekstrakcję kopalń/fabryk. Rate-path bramkowany przez avail = TYLKO badania → tam testujemy
// avail × (labor-baked perYear). W kopalni realny współistniejący mnożnik to asteroid_mining ×2.
header('T10: kompozycja avail × inne mnożniki (bez capa)');
{
  // (a) Research: perYear już nosi ×0.5 (np. outpost/labor) → registrujemy 5 zamiast 10.
  //     avail=0.5 → przyrost = 5 × 0.5 × dt. Netto 10 × 0.5(labor) × 0.5(avail) = 2.5/rok.
  const rs = new ResourceSystem();
  rs.registerProducer('lab', { research: 5 });        // 10 nominalnie × 0.5 labor = 5 perYear
  rs.registerProducer('c', { energy: -12 }); rs.registerProducer('p', { energy: 6 }); // avail 0.5
  const before = rs.research.amount;
  rs._update(1.0);
  const gained = rs.research.amount - before;
  assert(near(gained, 2.5), `research: 5(labor-baked) × 0.5(avail) × 1yr = 2.5 — mnożniki komponują (got ${gained})`);

  // (b) Mina: avail(level) × asteroid_mining(gains ×2) — 0.5 × 2 = 1.0 → pełne wydobycie.
  const depBase = DEP('Fe');
  const bsBase = makeBS([{ building: { isMine: true, id: 'mine', energyCost: 4 }, level: 1 }], [depBase]);
  bsBase._tickMineExtraction(1.0);
  const baseFull = bsBase.resourceSystem.getAmount('Fe');   // avail=1, bez asteroid

  const depComp = DEP('Fe');
  const bsComp = makeBS([{ building: { isMine: true, id: 'mine', energyCost: 4 }, level: 1 }], [depComp], { prod: 6, cons: 12 }); // avail 0.5
  bsComp._planetId = 'ast';
  bsComp.techSystem = { isResearched: (t) => t === 'asteroid_mining' };
  const prevKOSMOS = window.KOSMOS;
  window.KOSMOS = { debug: {}, colonyManager: { getColony: () => ({ planet: { type: 'planetoid' } }) } };
  bsComp._tickMineExtraction(1.0);
  window.KOSMOS = prevKOSMOS;
  const comp = bsComp.resourceSystem.getAmount('Fe');   // 0.5 × 2 = 1.0 × base
  assert(near(comp, baseFull), `mina: avail0.5 × asteroid×2 = pełne (got ${comp} == ${baseFull}) — bez capa`);
}

console.log(`\n${'='.repeat(50)}`);
console.log(`WYNIK: ${pass} PASS / ${fail} FAIL`);
console.log('='.repeat(50));
process.exit(fail === 0 ? 0 : 1);
