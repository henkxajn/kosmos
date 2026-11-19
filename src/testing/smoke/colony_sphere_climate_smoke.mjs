// colony_sphere_climate_smoke — KEEPER CS-PHYS-a (D-CS-19 część 1, plan COLONY_SPHERE §3.8): realistyczny klimat.
//
// K1  ślad OFF: świat seedowany (2 seedy × 12 układów + dom) i ścieżka dawnego API (3 gwiazdy) — wiersze zapisu
//     (SaveSystem._serialize*) bit w bit jak baza 66f924f (traces/CSPHYS-world-off-baseline.json); ten sam ślad przy
//     fladze ON, gdy świat NIE ma stempla (przełączenie po starcie nic nie zmienia).
// K2  analogi (czyste funkcje ClimateModel): Ziemia, Wenus (dense / thick), Mars, Tytan, Merkury dzień/noc, Io.
// K3  thick ≥ dense przy każdym strumieniu; ciągłość τ na granicy kondensacji; termostat oddychalnej w HZ.
// K4  stempel świata: GalaxyGenerator, worldClimateModel (stempel / rekord bez stempla / brak rekordu), GameCore ON/OFF,
//     flaga przełączona po starcie, źródło GameScene (jedna decyzja nowej gry) i StarSystemManager (stempel, nie flaga).
// K5  LifeSystem: w świecie v2 przeliczenie temperatury nic nie robi; w świecie dotychczasowym — jak dotąd.
// K6  światy macierzyste (gracz + AI, 3 seedy, v2): pasmo 5–35 °C, rekord klimatu z cieplarnią oddychalną.
// K7  determinizm + te same ciała co świat dotychczasowy (zero rzutów RNG: atmosfery, orbity, kolory) + peek == generacja.
// K8  zapis: rekord climate w v2, brak klucza w świecie dotychczasowym; odczyt (GameScene._restoreSystem) ×3.
// K9  pływy: tylko księżyce gazowych olbrzymów w strefie inner/mid; strumień księżyca = strumień orbity rodzica.
// K10 sprzeczności wygląd ↔ temperatura (2 seedy): v2 < dotychczasowy i ≤ 10; debug csClimate (kolumny, model świata).
//
// Uruchomienie: node src/testing/smoke/colony_sphere_climate_smoke.mjs        (--record = zapis śladu K1, tylko na bazie)

import '../headless/env.js';           // MUSI być pierwszy (window, Math.random = seeded)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const { GAME_CONFIG }       = await import('../../config/GameConfig.js');
const { SystemGenerator }   = await import('../../generators/SystemGenerator.js');
const { GalaxyGenerator }   = await import('../../generators/GalaxyGenerator.js');
const { StarSystemManager } = await import('../../systems/StarSystemManager.js');
const EntityManager         = (await import('../../core/EntityManager.js')).default;
const { GameCore }          = await import('../headless/GameCore.js');
const CM = await import('../../utils/ClimateModel.js').catch(() => ({}));     // nie istnieje na bazie → piny czerwone
const DBG = await import('../../debug/ColonySphereDebug.js').catch(() => ({}));

const TRACE_URL = new URL('../fixtures/traces/CSPHYS-world-off-baseline.json', import.meta.url);
const RECORD = process.argv.includes('--record');
let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  ✅ ' + msg); } else { fail++; console.log('  ❌ ' + msg); } }
const safe = (fn, dflt) => { try { return fn(); } catch { return dflt; } };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const withFlag = (name, v, fn) => { const p = GAME_CONFIG.FEATURES[name]; GAME_CONFIG.FEATURES[name] = v; try { return fn(); } finally { GAME_CONFIG.FEATURES[name] = p; } };
const quietly = (fn) => { const o = console.log; console.log = () => {}; try { return fn(); } finally { console.log = o; } };

// SaveSystem z harnessu (serializery są czystymi funkcjami ciała)
const core0 = quietly(() => { const c = new GameCore(); c.boot({ quiet: true, scenario: 'civilization', galaxySeed: 612055237 }); return c; });
const SS = core0.saveSystem;

const SKIP = new Set(['id', 'parentPlanetId']);
function rowsDigest(kindsBodies) {
  const h = createHash('sha256');
  for (const [kind, list] of kindsBodies) {
    for (const b of list) {
      const row = kind === 'planet' ? SS._serializePlanet(b) : kind === 'moon' ? SS._serializeMoon(b) : SS._serializePlanetoid(b);
      const clean = {};
      for (const k of Object.keys(row)) if (!SKIP.has(k)) clean[k] = row[k];
      h.update(kind + JSON.stringify(clean));
    }
  }
  return h.digest('hex').slice(0, 24);
}
// Świat seedowany przez API bazy (bez argumentu climateModel) — galaxyData podane jawnie (jak gra).
function seededWorld(seed, nSystems, galaxyMutator = null) {
  EntityManager.clear();
  const home = new SystemGenerator().generateCivScenario({ galaxySeed: seed, seeded: true });
  const ssm = new StarSystemManager();
  ssm.registerHomeSystem(home.star, home.planets, home.moons, home.planetoids);
  const galaxyData = GalaxyGenerator.generate(seed, home.star.name, home.star.spectralType, { seededSystems: true });
  if (galaxyMutator) galaxyMutator(galaxyData);
  ssm.assignMissingSurfaceSeeds(galaxyData.seed);
  ssm.assignMissingArchetypes();
  for (const gs of galaxyData.systems.filter(s => s.id !== 'sys_home').slice(0, nSystems)) ssm.generateAndRegister(gs, galaxyData);
  return { home, galaxyData, ssm };
}
const allBodies = () => [['planet', EntityManager.getByType('planet')], ['moon', EntityManager.getByType('moon')], ['planetoid', EntityManager.getByType('planetoid')]];
function offDigests() {
  const out = {};
  for (const seed of [612055237, -2102099243]) { seededWorld(seed, 12); out[`seeded:${seed}`] = rowsDigest(allBodies()); }
  EntityManager.clear();
  const legacyStars = [{ id: 'sys_k1', name: 'K1', spectralType: 'G', mass: 1, luminosity: 1 },
                       { id: 'sys_k2', name: 'K2', spectralType: 'M', mass: 0.4, luminosity: 0.03 },
                       { id: 'sys_k3', name: 'K3', spectralType: 'F', mass: 1.3, luminosity: 2.5 }];
  for (const gs of legacyStars) {
    const r = new SystemGenerator().generateForStar(gs);
    out[`legacyApi:${gs.id}`] = rowsDigest([['planet', r.planets], ['moon', r.moons], ['planetoid', r.planetoids]]);
  }
  return out;
}

console.log('\n── K1 ślad OFF (świat dotychczasowy bit w bit) ──');
if (RECORD) {
  const d = offDigests();
  writeFileSync(TRACE_URL, JSON.stringify({ base: '66f924f', note: 'CS-PHYS-a K1 — wiersze zapisu bez id/parentPlanetId', digests: d }, null, 1) + '\n');
  console.log('ślad zapisany', d);
  process.exit(0);
}
{
  const trace = existsSync(TRACE_URL) ? JSON.parse(readFileSync(TRACE_URL, 'utf8')) : null;
  assert(!!trace && Object.keys(trace.digests ?? {}).length === 5, 'świadek: ślad bazy 66f924f z 5 odciskami');
  const off = withFlag('realisticClimate', false, offDigests);
  for (const [k, v] of Object.entries(trace?.digests ?? {})) assert(off[k] === v, `OFF ${k}: ${off[k]} == baza ${v}`);
  // flaga ON, świat bez stempla (rekord z seedem) — dalej dotychczasowy; dawne API bez argumentu — dotychczasowe
  const on = withFlag('realisticClimate', true, offDigests);
  assert(Object.entries(trace?.digests ?? {}).every(([k, v]) => on[k] === v), 'flaga ON + świat bez stempla / dawne API → ślad bazy (przełączenie po starcie nic nie zmienia)');
}

console.log('\n── K2 analogi ──');
{
  const bc = CM.bodyClimate;
  const T = (o) => safe(() => bc(o).temperatureC, NaN);
  const earth = T({ L: 1, a: 1, albedo: 0.15, atmosphere: 'breathable' });
  const venusD = T({ L: 1, a: 0.7233, albedo: 0.15, atmosphere: 'dense' });
  const venusT = T({ L: 1, a: 0.7233, albedo: 0.15, atmosphere: 'thick' });
  const mars = T({ L: 1, a: 1.524, albedo: 0.15, atmosphere: 'thin' });
  const titanD = T({ L: 1, a: 9.54, albedo: 0.5, atmosphere: 'dense' });
  const titanT = T({ L: 1, a: 9.54, albedo: 0.5, atmosphere: 'thick' });
  const merc = safe(() => bc({ L: 1, a: 0.387, e: 0.2056, albedo: 0.05, atmosphere: 'none' }).climate, {});
  assert(Math.abs(earth - 15) <= 5, `Ziemia (rocky, breathable, 1 AU) ${earth.toFixed(1)} °C ≈ +15 ±5`);
  assert(venusD >= 430 && venusD <= 480 && venusT >= 430 && venusT <= 480, `Wenus dense ${venusD.toFixed(0)} / thick ${venusT.toFixed(0)} °C ∈ 430–480`);
  assert(Math.abs(mars + 60) <= 10, `Mars (thin, 1.524 AU) ${mars.toFixed(1)} °C ≈ −60 ±10`);
  assert(Math.abs(titanD + 180) <= 10 && Math.abs(titanT + 180) <= 12, `Tytan (lodowa, 9.54 AU) dense ${titanD.toFixed(0)} / thick ${titanT.toFixed(0)} °C ≈ −180`);
  assert(Math.abs((merc.dayMaxC ?? NaN) - 430) <= 30 && Math.abs((merc.nightMinC ?? NaN) + 180) <= 10,
    `Merkury dzień ${merc.dayMaxC} / noc ${merc.nightMinC} °C ≈ +430 / −180; średnia = równowaga (${merc.greenhouseC} K cieplarni)`);
  assert(merc.greenhouseC === 0 && merc.model === 2, 'ciało bez atmosfery: temperatura gry = średnia (cieplarnia 0), rekord model 2');
  const io = { temperatureC: safe(() => bc({ L: 1, a: 5.2, albedo: 0.12, atmosphere: 'none' }).temperatureC, NaN),
               climate: safe(() => bc({ L: 1, a: 5.2, albedo: 0.12, atmosphere: 'none' }).climate, null) };
  const dIo = safe(() => CM.applyTidalHeating(io, CM.tidalFluxWm2('gas', 0, 4)), 0);
  assert(dIo >= 3 && dIo <= 15, `Io (wewnętrzny księżyc gazowego olbrzyma, 5.2 AU) +${dIo.toFixed(1)} K pływów (umiarkowane)`);
  assert(safe(() => CM.tidalFluxWm2('ice', 0, 4), 1) === 0 && safe(() => CM.tidalFluxWm2('gas', 3, 4), 1) === 0, 'pływy: rodzic lodowy → 0, strefa outer → 0');
}

console.log('\n── K3 thick ≥ dense, ciągłość, termostat ──');
{
  const od = CM.opticalDepth;
  let ok = !!od, n = 0;
  for (let i = 0; i <= 400 && od; i++) {
    const S = Math.pow(10, -3 + i * (4.3 / 400)); n++;
    if (!(od('thick', S) >= od('dense', S) && od('dense', S) > od('thin', S) && od('thin', S) >= 0)) ok = false;
  }
  assert(ok && n === 401, `τ thick ≥ dense > thin ≥ 0 na ${n} strumieniach 0.001–20 S⊕ (inwersja thick < dense usunięta)`);
  const Sc = CM.FLUX_CO2_COLLAPSE;
  const cont = !!od && ['thin', 'breathable', 'dense', 'thick'].every(a => Math.abs(od(a, Sc * (1 - 1e-9)) - od(a, Sc)) < 1e-6);
  assert(cont && Sc === 0.35, `τ ciągłe na granicy kondensacji CO₂ S_col = ${Sc} (= FLUX_HZ_OUTER)`);
  const temps = [0.36, 0.5, 0.8, 1.0, 1.1].map(S => safe(() => CM.bodyClimate({ L: 1, a: 1 / Math.sqrt(S), albedo: 0.15, atmosphere: 'breathable' }).temperatureC, NaN));
  assert(temps.every(t => t > -10 && t < 25), `oddychalna w HZ (S 0.36–1.1) umiarkowana: ${temps.map(t => t.toFixed(0)).join(' / ')} °C`);
  const hot = safe(() => CM.bodyClimate({ L: 1, a: 0.6, albedo: 0.15, atmosphere: 'breathable' }).temperatureC, NaN);
  assert(hot < 120, `oddychalna bez ucieczki cieplarnianej (S 2.8: ${hot.toFixed(0)} °C)`);
  const cold = safe(() => CM.bodyClimate({ L: 1, a: 3, albedo: 0.15, atmosphere: 'dense' }).temperatureC, NaN);
  assert(cold < -50, `dense daleko (S 0.11) bez ucieczki — zimno (${cold.toFixed(0)} °C)`);
}

console.log('\n── K4 stempel świata ──');
{
  const g2 = GalaxyGenerator.generate(5, 'S', 'G', { climateModel: 2 });
  const g1 = GalaxyGenerator.generate(5, 'S', 'G');
  assert(g2.climateModel === 2 && !('climateModel' in g1), 'GalaxyGenerator: climateModel 2 → stempel; domyślnie pole nie powstaje');
  const w = SystemGenerator.worldClimateModel;
  assert(typeof w === 'function'
    && w({ seed: 5, climateModel: 2 }) === 2 && withFlag('realisticClimate', true, () => w({ seed: 5 })) === 1
    && withFlag('realisticClimate', false, () => w({ seed: 5, climateModel: 2 })) === 2
    && withFlag('realisticClimate', true, () => w(undefined)) === 2 && withFlag('realisticClimate', false, () => w(undefined)) === 1,
    'worldClimateModel: stempel → 2 (flaga bez wpływu) / rekord bez stempla → 1 / brak rekordu → flaga');
  assert(safe(() => CM.isFrozenClimateWorld({ climateModel: 2 }), false) === true && safe(() => CM.isFrozenClimateWorld({ seed: 1 }), true) === false
    && safe(() => CM.isFrozenClimateWorld(null), true) === false, 'isFrozenClimateWorld: tylko jawny stempel 2');
  const boot = (flag, seed) => quietly(() => withFlag('realisticClimate', flag, () => withFlag('seededSystems', true, () => {
    const c = new GameCore(); c.boot({ quiet: true, scenario: 'civilization', galaxySeed: seed }); return c; })));
  boot(true, 612055237);
  const K = window.KOSMOS;
  assert(K.galaxyData?.climateModel === 2 && K.homePlanet?.climate?.model === 2, `GameCore przy ON: stempel ${K.galaxyData?.climateModel}, dom z rekordem v2`);
  const fresh = K.galaxyData.systems.find(s => s.id !== 'sys_home' && !K.starSystemManager?._systems?.has(s.id));
  const sysA = withFlag('realisticClimate', false, () => fresh ? K.starSystemManager.generateAndRegister(fresh, K.galaxyData) : null);
  const plA = sysA ? EntityManager.getByTypeInSystem('planet', fresh.id) : [];
  assert(plA.length > 0 && plA.every(p => p.climate?.model === 2), `świat v2, flaga OFF po starcie → nowy układ dalej v2 (${plA.length} planet z rekordem)`);
  boot(false, 612055237);
  const K2 = window.KOSMOS;
  const fresh2 = K2.galaxyData.systems.find(s => s.id !== 'sys_home' && !K2.starSystemManager?._systems?.has(s.id));
  const sysB = withFlag('realisticClimate', true, () => fresh2 ? K2.starSystemManager.generateAndRegister(fresh2, K2.galaxyData) : null);
  const plB = sysB ? EntityManager.getByTypeInSystem('planet', fresh2.id) : [];
  assert(!('climateModel' in (K2.galaxyData ?? {})) && plB.length > 0 && plB.every(p => !('climate' in p)),
    `świat dotychczasowy, flaga ON po starcie → nowy układ bez rekordu (${plB.length} planet), galaktyka bez stempla`);
  const gs = src('../../scenes/GameScene.js');
  const reads = gs.match(/FEATURES\.realisticClimate/g) ?? [];
  assert(reads.length === 1 && /const worldClimateModel = \(!savedData && GAME_CONFIG\.FEATURES\.realisticClimate === true\) \? 2 : 1;/.test(gs)
    && /_generateFreshSystem\(cx, cy, preMintedGalaxySeed, worldClimateModel\)/.test(gs) && /climateModel: galaxyClimateModel \}/.test(gs)
    && /const galaxyClimateModel = savedData\s*\?\s*\(planets\.some\(p => p\.climate\?\.model === 2\) \? 2 : 1\)\s*:\s*worldClimateModel;/.test(gs)
    && /generateCivScenario\(\{[^}]*climateModel \}\)/.test(gs), `GameScene: flaga czytana RAZ (nowa gra), ta sama decyzja → dom + stempel galaktyki; zapis sprzed 4X → model z ciał domu (${reads.length} odczyt)`);
  const ssm = src('../../systems/StarSystemManager.js');
  assert(/generateForStar\(galaxyStar, seedCtx, SystemGenerator\.worldClimateModel\(galaxyData\)\)/.test(ssm) && !/realisticClimate/.test(ssm),
    'StarSystemManager: model z rekordu świata (worldClimateModel), nie z flagi');
  const sg = src('../../generators/SystemGenerator.js');
  const flagReads = sg.match(/FEATURES\.realisticClimate/g) ?? [];
  const wcm = sg.slice(sg.indexOf('static worldClimateModel('), sg.indexOf('static emergencySeedUses('));
  assert(flagReads.length === 1 && /FEATURES\.realisticClimate/.test(wcm), `SystemGenerator czyta flagę WYŁĄCZNIE w worldClimateModel (${flagReads.length})`);
}

console.log('\n── K5 LifeSystem ──');
{
  const quietBoot = (flag) => quietly(() => withFlag('realisticClimate', flag, () => { const c = new GameCore(); c.boot({ quiet: true, scenario: 'civilization', galaxySeed: 572914822 }); return c; }));
  const probe = (core) => {
    const ls = core.lifeSystem, K = window.KOSMOS;
    const p = EntityManager.getByTypeInSystem('planet', 'sys_home').find(b => b.id !== K.homePlanet?.id && b.planetType === 'rocky');
    if (!ls || !p) return null;
    const before = p.temperatureC;
    p.temperatureC = before + 123.25;            // wartość, której przeliczenie nie da
    if (p.surface) p.surface.temperature = p.temperatureC;
    const set = p.temperatureC;
    ls._tick(p, GAME_CONFIG.FEATURES.lifeTempOwnStar === true ? ls.homeworldIds() : null);
    return { set, after: p.temperatureC };
  };
  const v2 = probe(quietBoot(true));
  assert(!!v2 && v2.after === v2.set && safe(() => window.KOSMOS.lifeSystem?.climateFrozen?.() ?? core0.lifeSystem?.climateFrozen?.(), null) !== null,
    `świat v2: LifeSystem._tick nie przelicza temperatury (${v2?.set} → ${v2?.after})`);
  const v1 = probe(quietBoot(false));
  assert(!!v1 && v1.after !== v1.set, `świat dotychczasowy: LifeSystem przelicza jak dotąd (${v1?.set?.toFixed?.(1)} → ${v1?.after?.toFixed?.(1)})`);
  const ls = src('../../systems/LifeSystem.js');
  assert(/isFrozenClimateWorld\(window\.KOSMOS\?\.galaxyData\)/.test(ls) && /_calcPotential\(planet\)/.test(ls), 'LifeSystem: stempel świata (nie flaga); potencjał życia dalej liczony');
}

console.log('\n── K6 światy macierzyste (v2) ──');
for (const seed of [612055237, -2102099243, 1640489291]) {
  quietly(() => withFlag('realisticClimate', true, () => withFlag('seededSystems', true, () => { const c = new GameCore(); c.boot({ quiet: true, scenario: 'civilization', galaxySeed: seed }); })));
  const K = window.KOSMOS;
  const homes = [K.homePlanet];
  for (const c of K.colonyManager?.getAllColonies?.() ?? []) if (c.ownerEmpireId && c.ownerEmpireId !== 'player' && !c.isOutpost) homes.push(EntityManager.get(c.planetId));
  const ok = homes.filter(Boolean).every(h => h.temperatureC >= 5 && h.temperatureC <= 35 && h.atmosphere === 'breathable'
    && h.climate?.model === 2 && Math.abs(h.climate.greenhouseC - safe(() => CM.greenhouseK('breathable', h.climate.flux, h.climate.eqC + 273.15), NaN)) < 0.02);
  assert(homes.length >= 3 && ok, `seed ${seed}: ${homes.length} domów w 5–35 °C z rekordem cieplarni oddychalnej (${homes.map(h => h?.temperatureC).join(', ')})`);
}

console.log('\n── K7 determinizm, te same ciała, peek ──');
{
  const world = (cm) => { EntityManager.clear();
    const home = new SystemGenerator().generateCivScenario({ galaxySeed: 813683454, seeded: true, climateModel: cm });
    const ssm = new StarSystemManager(); ssm.registerHomeSystem(home.star, home.planets, home.moons, home.planetoids);
    const gd = GalaxyGenerator.generate(813683454, home.star.name, home.star.spectralType, { seededSystems: true, climateModel: cm });
    ssm.assignMissingSurfaceSeeds(gd.seed); ssm.assignMissingArchetypes();
    const sys = gd.systems.filter(s => s.id !== 'sys_home').slice(0, 20);
    for (const gs of gd.systems) if (gs.id !== 'sys_home') ssm.generateAndRegister(gs, gd);
    const peekOk = sys.every(gs => { const pk = new SystemGenerator().peekCountsForStar(gs, SystemGenerator.worldSeedContext(gd));
      return pk.planets === EntityManager.getByTypeInSystem('planet', gs.id).length && pk.moons === EntityManager.getByTypeInSystem('moon', gs.id).length
        && pk.planetoids === EntityManager.getByTypeInSystem('planetoid', gs.id).length; });
    const shape = allBodies().flatMap(([k, l]) => l.map(b => `${k}|${b.name}|${b.atmosphere}|${b.orbital?.a}|${b.visual?.color ?? b.color}|${b.planetType ?? b.moonType ?? b.planetoidType}|${b.bodyArchetype}|${JSON.stringify(b.composition)}`)).join('\n');
    const temps = new Map(allBodies().flatMap(([k, l]) => l.map(b => [`${b.systemId}|${k}|${b.name}`,
      { T: b.temperatureC, airless: (b.atmosphere ?? 'none') === 'none', tidal: b.climate?.tidalC ?? 0, kind: k, gas: b.planetType === 'gas',
        rockyColor: b.planetType === 'rocky' ? (b.visual?.color ?? b.color ?? null) : null }])));
    return { digest: rowsDigest(allBodies()), shape, peekOk, temps, n: allBodies().reduce((s, [, l]) => s + l.length, 0),
             recs: allBodies().reduce((s, [, l]) => s + l.filter(b => b.climate?.model === 2).length, 0) };
  };
  const a = world(2), b = world(2), l = world(1);
  assert(a.digest === b.digest && a.n > 500, `ten sam seed → ten sam świat v2 (${a.n} ciał, ${a.digest})`);
  assert(a.peekOk && l.peekOk, 'peekCountsForStar == generacja (20 układów, v2 i dotychczasowy)');
  assert(a.shape === l.shape, 'v2 vs dotychczasowy: te same ciała, atmosfery, orbity, kolory, składy, archetypy (klimat bez rzutów RNG)');
  assert(a.recs === a.n && l.recs === 0 && a.digest !== l.digest, `rekord klimatu: v2 ${a.recs}/${a.n}, dotychczasowy ${l.recs}`);
  let airlessN = 0, airlessOk = true, changedN = 0, colorN = 0, colorOk = true;
  for (const [k, v] of a.temps) {
    const o = l.temps.get(k);
    if (!o) { airlessOk = false; continue; }
    if (v.airless && v.tidal === 0) { airlessN++; if (v.T !== o.T) airlessOk = false; }
    else if (v.T !== o.T) changedN++;
    if (v.rockyColor != null) { colorN++; if (v.rockyColor !== o.rockyColor) colorOk = false; }
  }
  assert(airlessOk && airlessN > 1000 && changedN > 100, `ciała bez atmosfery (bez pływów, planetoidy, gazowce): temperatura gry = dotychczasowa równowaga (${airlessN}); z atmosferą zmienione: ${changedN}`);
  assert(colorOk && colorN > 50, `kolor planet skalistych z temperatury dotychczasowej (${colorN} planet, bez zmiany wyglądu)`);
}

console.log('\n── K8 zapis / odczyt ──');
{
  EntityManager.clear();
  const r2 = new SystemGenerator().generateForStar({ id: 'sys_s8', name: 'S8', spectralType: 'G', mass: 1, luminosity: 1 }, undefined, 2);
  const r1 = new SystemGenerator().generateForStar({ id: 'sys_s9', name: 'S9', spectralType: 'G', mass: 1, luminosity: 1 });
  const s2 = [SS._serializePlanet(r2.planets[0]), SS._serializeMoon(r2.moons[0]), SS._serializePlanetoid(r2.planetoids[0])];
  const s1 = [SS._serializePlanet(r1.planets[0]), SS._serializeMoon(r1.moons[0]), SS._serializePlanetoid(r1.planetoids[0])];
  assert(s2.every(r => r.climate?.model === 2) && s2[0].climate !== r2.planets[0].climate, 'zapis v2: rekord climate (kopia) dla planety, księżyca i planetoidy');
  assert(s1.every(r => !('climate' in r)), 'zapis świata dotychczasowego: klucz climate pominięty (zapis bajt w bajt)');
  const gsrc = src('../../scenes/GameScene.js');
  assert((gsrc.match(/if \((pd|md)\.climate\) (p|m)\.climate = \{ \.\.\.(pd|md)\.climate \};/g) ?? []).length === 3, 'GameScene._restoreSystem: odczyt climate dla planety, księżyca i planetoidy');
}

console.log('\n── K9 pływy ──');
{
  EntityManager.clear();
  const sys = ['G', 'K', 'F', 'M'].map((t, i) => new SystemGenerator().generateForStar({ id: 'sys_t' + i, name: 'T' + i, spectralType: t, mass: 1, luminosity: [1, 0.4, 2.2, 0.05][i] }, { galaxySeed: 77 + i, seeded: true }, 2));
  const moons = sys.flatMap(r => r.moons);
  const tidal = moons.filter(m => (m.climate?.tidalC ?? 0) > 0);
  const okParents = tidal.every(m => EntityManager.get(m.parentPlanetId)?.planetType === 'gas');
  const fluxOk = moons.every(m => { const p = EntityManager.get(m.parentPlanetId), r = sys.find(s => s.moons.includes(m));
    return Math.abs((m.climate?.flux ?? NaN) - r.star.luminosity / (p.orbital.a ** 2)) < 1e-5; });
  assert(tidal.length > 0 && okParents, `pływy tylko u księżyców gazowych olbrzymów (${tidal.length}/${moons.length})`);
  assert(fluxOk, 'strumień księżyca = L / a_rodzica² (nie własna półoś)');
  const byParent = new Map();
  for (const m of moons) { const arr = byParent.get(m.parentPlanetId) ?? []; arr.push(m); byParent.set(m.parentPlanetId, arr); }
  let zoneOk = true;
  for (const [pid, arr] of byParent) {
    if (EntityManager.get(pid)?.planetType !== 'gas') continue;
    arr.sort((x, y) => (x.orbital.a - y.orbital.a) || String(x.id).localeCompare(String(y.id)));
    arr.forEach((m, r) => { if ((r >= arr.length * 2 / 3) && (m.climate?.tidalC ?? 0) > 0) zoneOk = false; });
  }
  assert(zoneOk && tidal.length > 0, `strefa outer (ranga ≥ 2n/3) bez grzania pływowego (świadek: ${tidal.length} księżyców z pływami)`);
}

console.log('\n── K10 sprzeczności wygląd ↔ temperatura + debug ──');
{
  const count = (cm) => { let bad = 0, n = 0;
    for (const seed of [-2102099243, 572914822]) {
      EntityManager.clear();
      const home = new SystemGenerator().generateCivScenario({ galaxySeed: seed, seeded: true, climateModel: cm });
      const ssm = new StarSystemManager(); ssm.registerHomeSystem(home.star, home.planets, home.moons, home.planetoids);
      const gd = GalaxyGenerator.generate(seed, home.star.name, home.star.spectralType, { seededSystems: true, climateModel: cm });
      ssm.assignMissingSurfaceSeeds(gd.seed); ssm.assignMissingArchetypes();
      for (const gs of gd.systems) if (gs.id !== 'sys_home') ssm.generateAndRegister(gs, gd);
      for (const [, l] of allBodies()) for (const b of l) { if (CM.LOOK_TEMP_CONTRADICTION?.[b.bodyArchetype]) { n++; if (CM.lookContradicts(b.bodyArchetype, b.temperatureC)) bad++; } }
    }
    return { bad, n };
  };
  const c1 = safe(() => count(1), { bad: -1, n: 0 }), c2 = safe(() => count(2), { bad: 99, n: 0 });
  assert(c1.n > 1000 && c2.bad < c1.bad && c2.bad <= 10, `sprzeczności: dotychczasowy ${c1.bad}/${c1.n} → v2 ${c2.bad}/${c2.n} (≤ 10)`);
  window.KOSMOS.activeSystemId = 'sys_home';
  const rows = safe(() => DBG.colonySphereClimateRows('sys_home'), []);
  const cols = ['name', 'kind', 'atmosphere', 'flux', 'eqC', 'greenhouseC', 'tidalC', 'finalC', 'dayMaxC', 'nightMinC', 'archetype', 'contradiction'];
  assert(rows.length > 0 && cols.every(c => c in rows[0]), `colonySphereClimateRows: ${rows.length} wierszy, kolumny ${cols.length}`);
  const helpers = safe(() => DBG.colonySphereDebugHelpers(), {});
  assert(typeof helpers.csClimate === 'function', 'csClimate w pomocnikach debug (alias window.csClimate)');
  assert(/window\.csClimate\s*=\s*window\.KOSMOS\.debug\?\.csClimate;/.test(src('../../scenes/GameScene.js')), 'GameScene: alias window.csClimate');
}

console.log(`\nclimate keeper: ${pass} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
