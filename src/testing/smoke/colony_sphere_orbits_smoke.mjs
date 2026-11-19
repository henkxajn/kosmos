// KOSMOS — keeper CS-PHYS-b / CS-PHYS-b2 (D-CS-19 część 2, D-CS-24; plan COLONY_SPHERE §3.9 / §3.9.1):
// orbity skalowane jasnością (FEATURES.scaledOrbits, stempel świata orbitModel = 2), dom na orbicie +15 °C, jedna skala
// odległości na układ (SystemScale) dla progów przestrzennych w układzie.
//
// O1  ślad OFF: świat dotychczasowy bit w bit jak baza 66f924f (traces/CSPHYS-world-off-baseline.json) — przy fladze OFF
//     ORAZ przy fladze ON włączonej po starcie (rekord świata bez stempla); k = 1 dla każdej gwiazdy, układ nieznany → 1.
// O2  stemple świata: stary zapis (gwiazda / galaktyka bez stempla) → 1; zapis sprzed 4X (Finding 773) niesie
//     preCivWorld { seed, seededSystems, climateModel, orbitModel } i odtwarza tę samą galaktykę ze stemplami.
// O3  determinizm + peek == generacja (oba modele klimatu).
// O4  domy KAŻDEGO imperium (5 seedów × oba modele klimatu): w HZ, temperatura ≈ +15 °C, pasmo 5–35 °C aktywne 0 razy.
// O5  geometria: minimalna orbita, brak nakładania orbit (podłoga kolizyjna PhysicsSystem), separacja κ, księżyce
//     wewnątrz połowy odstępu do sąsiada (operacyjna sfera Hilla gry — planety rysowane ×200, fizyczna sfera Hilla nie
//     obejmuje księżyców gry także w świecie dotychczasowym, §3.9).
// O6  konsumenci w kompaktowym układzie M (k = 0.2) vs kontrola dotychczasowa (k = 1): planety poza rdzeniem i sferą
//     kliku gwiazdy, rozkaz lotu do ciała < 0.3 AU nie odbija się od strefy Słońca, przyciąganie kliku, zasięgi broni /
//     wykrycia / sensor-lock / blokady × k; piny źródłowe żywych ścieżek (renderer / scena — nie importują się pod node).
// O7  Finding 774 (CS-PHYS-b3) — WYŁĄCZNIE rysunek tarczy gwiazdy: skala rysunku ℓ bez podłogi 0.2 (sufit 1), przycięta
//     do najbliższego peryhelium / 1.5 rdzenia; świat dotychczasowy 1 dokładnie; podłoga ekranowa STAR_MIN_CORE_PX;
//     k rozgrywki (podłoga 0.2) bez zmian; piny żywej ścieżki renderStar / pętli.
// O8  przegląd stałych (CS-PHYS-b3): AccretionSystem (strefa akrecji, bin) × k — wykonanie; HUD sensor-lock fallback × k;
//     odczyty AU < 0.25 z dwoma miejscami (zasięgi wykr./lock, odczyt radaru, orbity listy ciał), dotychczasowe bez zmian.
//
// Uruchomienie: node src/testing/smoke/colony_sphere_orbits_smoke.mjs
import '../headless/env.js';           // MUSI być pierwszy (window, Math.random = seeded)
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const { GAME_CONFIG }       = await import('../../config/GameConfig.js');
const { SystemGenerator }   = await import('../../generators/SystemGenerator.js');
// Lustro progu PhysicsSystem.checkCollisions (0.65·Σ promieni wizualnych [px]) + a·e obu + zapas 0.01 AU — niezależne od generatora
const collisionClearanceAU = (p1, p2) => 0.65 * ((p1.visual?.radius ?? 10) + (p2.visual?.radius ?? 10)) / GAME_CONFIG.AU_TO_PX
  + p1.orbital.a * (p1.orbital.e ?? 0) + p2.orbital.a * (p2.orbital.e ?? 0) + 0.01;
const { GalaxyGenerator }   = await import('../../generators/GalaxyGenerator.js');
const { StarSystemManager } = await import('../../systems/StarSystemManager.js');
const EntityManager         = (await import('../../core/EntityManager.js')).default;
const { GameCore }          = await import('../headless/GameCore.js');
const { Star }              = await import('../../entities/Star.js');
const { Planet }            = await import('../../entities/Planet.js');
const { EmpireColonyBootstrap } = await import('../../systems/EmpireColonyBootstrap.js');
const { MovementOrderSystem }   = await import('../../systems/MovementOrderSystem.js');
const { VesselManager }         = await import('../../systems/VesselManager.js');
const { SystemPoolService }     = await import('../../systems/SystemPoolService.js');
const { ProximitySystem }       = await import('../../systems/ProximitySystem.js');
const { DeepSpaceCombatSystem } = await import('../../systems/DeepSpaceCombatSystem.js');
const DR = await import('../../utils/DetectionRange.js');
const OM = await import('../../utils/OrbitModel.js').catch(() => ({}));    // nie istnieje na bazie → piny czerwone
const SSC = await import('../../utils/SystemScale.js').catch(() => ({}));  // jw.

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  ✅ ' + msg); } else { fail++; console.log('  ❌ ' + msg); } }
const safe = (fn, dflt) => { try { return fn(); } catch { return dflt; } };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const quietly = (fn) => { const o = console.log, w = console.warn; console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = o; console.warn = w; } };
const withFlags = (flags, fn) => {
  const prev = {}; for (const k of Object.keys(flags)) { prev[k] = GAME_CONFIG.FEATURES[k]; GAME_CONFIG.FEATURES[k] = flags[k]; }
  try { return fn(); } finally { for (const k of Object.keys(flags)) GAME_CONFIG.FEATURES[k] = prev[k]; }
};
const SEEDS = [-2102099243, 612055237, 572914822, 813683454, 1640489291];
const AU = GAME_CONFIG.AU_TO_PX;
const kOf = (x) => SSC.systemScaleOf ? SSC.systemScaleOf(x) : NaN;

// ── narzędzia świata ────────────────────────────────────────────────────────
const core0 = quietly(() => { const c = new GameCore(); c.boot({ quiet: true, scenario: 'civilization', galaxySeed: 612055237 }); return c; });
const SS = core0.saveSystem;
const SKIP = new Set(['id', 'parentPlanetId']);
function rowsDigest(kindsBodies) {
  const h = createHash('sha256');
  for (const [kind, list] of kindsBodies) for (const b of list) {
    const row = kind === 'planet' ? SS._serializePlanet(b) : kind === 'moon' ? SS._serializeMoon(b) : SS._serializePlanetoid(b);
    const clean = {}; for (const k of Object.keys(row)) if (!SKIP.has(k)) clean[k] = row[k];
    h.update(kind + JSON.stringify(clean));
  }
  return h.digest('hex').slice(0, 24);
}
const allBodies = () => [['planet', EntityManager.getByType('planet')], ['moon', EntityManager.getByType('moon')], ['planetoid', EntityManager.getByType('planetoid')]];
// Świat przez API bazy (bez argumentów modelu) — tryb świata z flag (jak GameScene przy nowej grze dotychczasowej).
function baseApiWorld(seed, nSystems) {
  EntityManager.clear();
  const home = new SystemGenerator().generateCivScenario({ galaxySeed: seed, seeded: true });
  const ssm = new StarSystemManager();
  ssm.registerHomeSystem(home.star, home.planets, home.moons, home.planetoids);
  const galaxyData = GalaxyGenerator.generate(seed, home.star.name, home.star.spectralType, { seededSystems: true });
  ssm.assignMissingSurfaceSeeds(galaxyData.seed);
  ssm.assignMissingArchetypes();
  for (const gs of galaxyData.systems.filter(s => s.id !== 'sys_home').slice(0, nSystems)) ssm.generateAndRegister(gs, galaxyData);
  return { home, galaxyData, ssm };
}
function offDigests() {
  const out = {};
  for (const seed of [612055237, -2102099243]) { quietly(() => baseApiWorld(seed, 12)); out[`seeded:${seed}`] = rowsDigest(allBodies()); }
  EntityManager.clear();
  const legacyStars = [{ id: 'sys_k1', name: 'K1', spectralType: 'G', mass: 1, luminosity: 1 },
                       { id: 'sys_k2', name: 'K2', spectralType: 'M', mass: 0.4, luminosity: 0.03 },
                       { id: 'sys_k3', name: 'K3', spectralType: 'F', mass: 1.3, luminosity: 2.5 }];
  for (const gs of legacyStars) {
    const r = quietly(() => new SystemGenerator().generateForStar(gs));
    out[`legacyApi:${gs.id}`] = rowsDigest([['planet', r.planets], ['moon', r.moons], ['planetoid', r.planetoids]]);
  }
  return out;
}
// Świat orbit skalowanych (jawne modele — jak GameScene przy nowej grze z flagą ON).
function scaledWorld(seed, climateModel, orbitModel = 2) {
  EntityManager.clear();
  const home = new SystemGenerator().generateCivScenario({ galaxySeed: seed, seeded: true, climateModel, orbitModel });
  const ssm = new StarSystemManager();
  ssm.registerHomeSystem(home.star, home.planets, home.moons, home.planetoids);
  const galaxyData = GalaxyGenerator.generate(seed, home.star.name, home.star.spectralType, { seededSystems: true, climateModel, orbitModel });
  ssm.assignMissingSurfaceSeeds(galaxyData.seed);
  ssm.assignMissingArchetypes();
  for (const gs of galaxyData.systems) if (gs.id !== 'sys_home') ssm.generateAndRegister(gs, galaxyData);
  globalThis.window.KOSMOS.starSystemManager = ssm;
  return { home, galaxyData, ssm };
}

// ── O1 ślad OFF ─────────────────────────────────────────────────────────────
console.log('\n── O1 ślad OFF (świat dotychczasowy bit w bit, k = 1) ──');
{
  const TRACE_URL = new URL('../fixtures/traces/CSPHYS-world-off-baseline.json', import.meta.url);
  const trace = existsSync(TRACE_URL) ? JSON.parse(readFileSync(TRACE_URL, 'utf8')) : null;
  assert(!!trace && Object.keys(trace.digests ?? {}).length === 5, 'świadek: ślad bazy 66f924f z 5 odciskami');
  const off = withFlags({ realisticClimate: false, scaledOrbits: false }, offDigests);
  for (const [k, v] of Object.entries(trace?.digests ?? {})) assert(off[k] === v, `OFF ${k} == baza`);
  // flaga ON po starcie świata (rekord galaktyki bez stempla) — świat zostaje dotychczasowy
  const late = withFlags({ realisticClimate: false, scaledOrbits: true }, offDigests);
  for (const [k, v] of Object.entries(trace?.digests ?? {})) assert(late[k] === v, `flaga ON po starcie: ${k} == baza`);
  quietly(() => baseApiWorld(612055237, 12));
  const stars = EntityManager.getByType('star');
  assert(stars.length >= 13 && stars.every(s => kOf(s.systemId) === 1 && s.systemScale === 1),
    `k = 1 dla każdej gwiazdy świata dotychczasowego (${stars.length} gwiazd, świadek ≥ 13)`);
  assert(kOf('sys_nieistnieje') === 1 && kOf(null) === 1, 'układ nieznany / brak id → k = 1 (zachowanie dotychczasowe)');
}

// ── O2 stemple świata ───────────────────────────────────────────────────────
console.log('\n── O2 stemple świata (stary zapis, Finding 773) ──');
{
  const oldStar = new Star({ id: 'st_old', name: 'Old', spectralType: 'M', mass: 0.4, luminosity: 0.03 });
  assert(oldStar.orbitModel === undefined && oldStar.systemScale === 1, 'stary zapis: gwiazda bez stempla → k = 1, brak pola orbitModel');
  assert(safe(() => SystemGenerator.worldOrbitModel({ seed: 5 }), NaN) === 1 && safe(() => SystemGenerator.worldOrbitModel(null), NaN) === 1, 'stary zapis: galaktyka bez stempla → model orbit 1');
  const newStar = new Star({ id: 'st_new', name: 'New', spectralType: 'K', mass: 0.7, luminosity: 0.25, orbitModel: 2 });
  assert(Math.abs(newStar.systemScale - Math.sqrt(0.25)) < 1e-12, `gwiazda ze stemplem: k = √L (${newStar.systemScale?.toFixed?.(4)})`);
  const K = globalThis.window.KOSMOS;
  const prevGD = K.galaxyData, prevCiv = K.civMode;
  const gd = GalaxyGenerator.generate(424242, 'Dom', 'G', { seededSystems: true, climateModel: 2, orbitModel: 2 });
  K.galaxyData = gd; K.civMode = false;
  const rec = safe(() => SS._serializePreCivWorld(), {});
  assert(rec.preCivWorld?.seed === gd.seed && rec.preCivWorld?.orbitModel === 2 && rec.preCivWorld?.climateModel === 2
    && rec.preCivWorld?.seededSystems === true, '773: zapis sprzed 4X niesie preCivWorld { seed, seededSystems, climateModel, orbitModel }');
  const back = safe(() => GalaxyGenerator.preCivWorldOf(JSON.parse(JSON.stringify(rec))), null);
  const regen = back ? GalaxyGenerator.generate(back.seed, 'Dom', 'G', { seededSystems: back.seededSystems === true,
    climateModel: back.climateModel ?? 1, orbitModel: back.orbitModel ?? 1 }) : null;
  assert(!!regen && JSON.stringify(regen) === JSON.stringify(gd), '773: galaktyka odtworzona z preCivWorld == oryginał (systemy + stemple)');
  K.civMode = true;
  assert(Object.keys(safe(() => SS._serializePreCivWorld(), { x: 1 })).length === 0, '773: zapis z 4X → brak klucza preCivWorld (kształt dotychczasowy)');
  K.galaxyData = prevGD; K.civMode = prevCiv;
  assert(safe(() => GalaxyGenerator.preCivWorldOf({}), 'brak') === null, '773: stary zapis bez preCivWorld → null (dotychczasowa ścieżka)');
  const gs = src('../../scenes/GameScene.js');
  assert(/preCivWorldOf\(/.test(gs) && /orbitModel:\s*galaxyOrbitModel/.test(gs), '773 pin: GameScene odtwarza galaktykę z preCivWorld ze stemplem orbit');
  assert((gs.match(/orbitModel:\s*(data\.star|sd)\.orbitModel/g) ?? []).length >= 2, 'pin: _restoreSystem ×2 przekazuje stempel orbit gwiazdy');
}

// ── O3 determinizm + peek ───────────────────────────────────────────────────
console.log('\n── O3 determinizm + peek == generacja ──');
for (const cm of [1, 2]) {
  const d1 = (quietly(() => scaledWorld(SEEDS[0], cm)), rowsDigest(allBodies()));
  const { galaxyData } = quietly(() => scaledWorld(SEEDS[0], cm));
  assert(d1 === rowsDigest(allBodies()), `klimat ${cm}: ten sam seed → ten sam świat (odcisk ${d1.slice(0, 8)})`);
  let n = 0, bad = 0;
  for (const seed of SEEDS.slice(0, 3)) {
    const w = seed === SEEDS[0] ? { galaxyData } : quietly(() => scaledWorld(seed, cm));
    for (const g of w.galaxyData.systems) {
      if (g.id === 'sys_home') continue;
      const pk = quietly(() => new SystemGenerator().peekCountsForStar(g, SystemGenerator.worldSeedContext(w.galaxyData),
        safe(() => SystemGenerator.worldOrbitModel(w.galaxyData), 1), SystemGenerator.worldClimateModel(w.galaxyData)));
      n++;
      if (pk.planets !== EntityManager.getByTypeInSystem('planet', g.id).length || pk.moons !== EntityManager.getByTypeInSystem('moon', g.id).length
        || pk.planetoids !== EntityManager.getByTypeInSystem('planetoid', g.id).length) bad++;
    }
  }
  assert(n >= 150 && bad === 0, `klimat ${cm}: peek == generacja w ${n} układach (niezgodnych ${bad})`);
}

// ── O4 domy imperiów ────────────────────────────────────────────────────────
console.log('\n── O4 domy imperiów: HZ, +15 °C, pasmo 5–35 °C ──');
const HOME_TARGET_C = 15;   // °C — specyfikacja właściciela (CS-PHYS-b2 pkt 1), literał niezależny od kodu
assert(OM.HOMEWORLD_TARGET_C === HOME_TARGET_C, `OrbitModel.HOMEWORLD_TARGET_C = ${OM.HOMEWORLD_TARGET_C} °C (spec +15 °C)`);
for (const cm of [1, 2]) {
  let empires = 0, inHZ = 0, near15 = 0, band = 0, cold = 0, hot = 0;
  withFlags({ scaledOrbits: true, realisticClimate: cm === 2, seededSystems: true }, () => {
    for (const seed of SEEDS) {
      safe(() => SystemGenerator.resetHomeworldBandStats(), null);
      quietly(() => { const c = new GameCore(); c.boot({ quiet: true, scenario: 'civilization', galaxySeed: seed }); return c; });
      const K = globalThis.window.KOSMOS;
      const list = [{ body: K.homePlanet, sysId: 'sys_home' }];
      for (const emp of K.empireRegistry?.listAll?.() ?? []) {
        if (!emp.homeSystemId || emp.homeSystemId === 'sys_home') continue;
        const sys = K.starSystemManager.getSystem(emp.homeSystemId);
        list.push({ body: EmpireColonyBootstrap._pickHomePlanet((sys?.planetIds ?? []).map(id => EntityManager.get(id)).filter(Boolean),
          EntityManager.getStarOfSystem(emp.homeSystemId)), sysId: emp.homeSystemId });
      }
      for (const { body, sysId } of list) {
        if (!body) continue;
        const hz = EntityManager.getStarOfSystem(sysId)?.habitableZone;
        empires++;
        if (hz && body.orbital.a >= hz.min && body.orbital.a <= hz.max) inHZ++;
        if (Math.abs(body.temperatureC - HOME_TARGET_C) <= 1) near15++;
      }
      const st = safe(() => SystemGenerator.homeworldBandStats(), { total: 0, cold: 0, hot: 0 });
      band += st.total; cold += st.cold; hot += st.hot;
    }
  });
  assert(empires >= 15, `klimat ${cm}: świadek — ${empires} imperiów w 5 światach`);
  assert(inHZ === empires, `klimat ${cm}: dom w HZ ${inHZ}/${empires}`);
  assert(near15 === empires, `klimat ${cm}: temperatura domu +15 ± 1 °C ${near15}/${empires}`);
  assert(band >= empires && cold + hot === 0, `klimat ${cm}: pasmo 5–35 °C sprawdzone ${band}× — aktywne ${cold + hot}× (zimno ${cold}, gorąco ${hot})`);
}

// ── O5 geometria ────────────────────────────────────────────────────────────
console.log('\n── O5 geometria orbit (min. orbita, kolizje, separacja κ, księżyce) ──');
{
  let planets = 0, belowMin = 0, overlap = 0, sepViol = 0, moons = 0, moonOut = 0;
  const HALF = { rocky: 0.25, hot_rocky: 0.2, gas: 0.6, ice: 0.45 };
  for (const cm of [1, 2]) for (const seed of SEEDS) {
    quietly(() => scaledWorld(seed, cm));
    for (const star of EntityManager.getByType('star')) {
      const ps = EntityManager.getByTypeInSystem('planet', star.systemId).sort((x, y) => x.orbital.a - y.orbital.a);
      const minA = OM.scaledMinOrbitAU ? OM.scaledMinOrbitAU(star.luminosity) : Infinity;
      const k = OM.compactionOf ? OM.compactionOf(star.luminosity) : 1;
      ps.forEach((p, i) => {
        planets++;
        if (p.orbital.a < minA - 1e-12) belowMin++;
        const nx = ps[i + 1];
        if (nx) {
          if (nx.orbital.a - p.orbital.a < collisionClearanceAU(p, nx) - 1e-9) overlap++;
          if (nx.orbital.a - p.orbital.a < ((HALF[p.planetType] ?? 0.25) + (HALF[nx.planetType] ?? 0.25)) * k * 0.999) sepViol++;
        }
        const gap = Math.min(i > 0 ? p.orbital.a - ps[i - 1].orbital.a : Infinity, nx ? nx.orbital.a - p.orbital.a : Infinity);
        for (const m of EntityManager.getByType('moon').filter(mm => mm.parentPlanetId === p.id)) {
          moons++;
          if ((m.orbital?.a ?? 0) > gap / 2) moonOut++;
        }
      });
    }
  }
  assert(planets > 5000, `świadek: ${planets} planet (5 seedów × 2 modele klimatu)`);
  assert(belowMin === 0, `minimalna orbita max(0.03, 0.40·√L): naruszeń ${belowMin}`);
  assert(overlap === 0, `podłoga kolizyjna (a·e obu + 0.65·Σr + zapas): nakładających się par ${overlap}`);
  assert(sepViol === 0, `separacja κ·(½ + ½): naruszeń ${sepViol}`);
  assert(moons > 3000 && moonOut === 0, `księżyce wewnątrz połowy odstępu do sąsiada: ${moonOut}/${moons} poza`);
}

// ── O6 konsumenci w kompaktowym układzie ────────────────────────────────────
console.log('\n── O6 konsumenci progów: układ M (k = 0.2) vs kontrola dotychczasowa (k = 1) ──');
{
  // Planety poza rdzeniem i sferą kliku gwiazdy (wzór renderStar: r = baza × star.systemScale; 1 AU = 11 j. świata)
  const TR = src('../../renderer/ThreeRenderer.js');
  const rsAt = TR.indexOf('  renderStar(star, planets = []) {');
  const rs = rsAt >= 0 ? TR.slice(rsAt, rsAt + 4000) : '';
  assert(/const baseR = Math\.max\(0\.6, Math\.min\(1\.6, 0\.6 \+ starMass \* 0\.6\)\);/.test(rs)
    && /this\._starDrawScale = starDrawScale\(star, \{ baseCoreAU, innermostPeriapsisAU: innermostPeriapsisAU\(planets\) \}\);/.test(rs)
    && /const r = baseR \* this\._starDrawScale;/.test(rs) && /this\.renderStar\(star, planets\);/.test(TR),
    'pin: renderStar — promień gwiazdy × skala RYSUNKU (Finding 774; rdzeń, korona, sfera kliku, strefa kamery idą za r), initSystem podaje planety');
  assert(/new THREE\.SphereGeometry\(r \* 2\.5, 16, 16\)/.test(rs) && /const STAR_CORE_SCALE = 3\.0;/.test(TR), 'świadek: sfera kliku r × 2.5, rdzeń r × 3.0');
  const WU_PER_AU = AU / 10;
  let inner = 0, inside = 0, worst = Infinity;
  for (const seed of SEEDS) {
    quietly(() => scaledWorld(seed, 2));
    for (const star of EntityManager.getByType('star').filter(s => s.spectralType === 'M')) {
      const pl = EntityManager.getByTypeInSystem('planet', star.systemId);
      const base = Math.max(0.6, Math.min(1.6, 0.6 + (star.mass ?? 1) * 0.6));
      const r = base * safe(() => SSC.starDrawScale(star, { baseCoreAU: base * 3.0 / WU_PER_AU, innermostPeriapsisAU: SSC.innermostPeriapsisAU(pl) }), NaN);
      const lim = Math.max(r * 3.0, r * 2.5) / WU_PER_AU;
      for (const p of pl) {
        inner++; const peri = p.orbital.a * (1 - (p.orbital.e ?? 0));
        if (!(peri > lim)) inside++;
        worst = Math.min(worst, peri / lim);
      }
    }
  }
  assert(inner > 1000 && inside === 0, `planety układów M poza rdzeniem / sferą kliku: ${inside}/${inner} wewnątrz (najgorsze peryhelium ${worst.toFixed(3)}× promienia)`);

  // Syntetyczny układ M (L 0.027 → k = 0.2) i kontrola dotychczasowa (ta sama geometria, gwiazda bez stempla)
  EntityManager.clear();
  const K = globalThis.window.KOSMOS;
  K.starSystemManager = null;
  const mkSys = (sysId, stamped) => {
    const star = new Star({ id: `star_${sysId}`, name: sysId, spectralType: 'M', mass: 0.4, luminosity: 0.027, ...(stamped ? { orbitModel: 2 } : {}) });
    star.systemId = sysId; EntityManager.add(star);
    const mk = (id, a) => { const p = new Planet({ id, name: id, a, e: 0, T: 0.1, M: 0, inclinationOffset: 0, mass: 1, planetType: 'rocky',
      temperatureK: 288, temperatureC: 15, albedo: 0.15, atmosphere: 'breathable', color: 0x888888, visualRadius: 8 });
      p.systemId = sysId; p.x = a * AU; p.y = 0; EntityManager.add(p); return p; };
    return { star, home: mk(`home_${sysId}`, 0.17), outer: mk(`out_${sysId}`, 0.6) };
  };
  const M = mkSys('sys_m', true), L = mkSys('sys_leg', false);
  assert(Math.abs(kOf('sys_m') - 0.2) < 1e-12 && kOf('sys_leg') === 1, `SystemScale.of: układ M k = ${kOf('sys_m')}, kontrola k = ${kOf('sys_leg')}`);

  // Rozkaz lotu do ciała 0.17 AU (< strefa Słońca 0.3 AU)
  const vmBase = {
    _vessels: new Map(), _stations: new Map(),
    _findEntity: (id) => EntityManager.get(id), _rendezvousCapture: () => false, _interceptBody: () => null,
    _rendezvousRefusal: () => null, _predictPosition: () => null,
    _findBodyNearPoint(x, y, maxAU, v) { return VesselManager.prototype._findBodyNearPoint.call(this, x, y, maxAU, v); },
  };
  // brakujące metody → prawdziwe VesselManager.prototype (trasa, omijanie ciał) na tym samym obiekcie
  const vmStub = new Proxy(vmBase, { get(t, k) {
    if (k in t) return t[k];
    const f = VesselManager.prototype[k];
    return typeof f === 'function' ? f.bind(vmStub) : undefined;
  } });
  const mos = quietly(() => new MovementOrderSystem(vmStub));
  const order = (S) => {
    const v = { id: `v_${S.star.systemId}`, systemId: S.star.systemId, ownerEmpireId: 'player', speedAU: 1, hullId: 'small',
      modules: [], position: { x: S.outer.x, y: 0, state: 'orbiting', dockedAt: null } };
    // świadek: pierwszy odczyt ZA bramką strefy Słońca (bramka portu czyta spec.bypassSpaceportCheck)
    let passed = false;
    const spec = { targetPoint: { x: S.home.x, y: 0 }, targetBodyId: S.home.id, get bypassSpaceportCheck() { passed = true; return true; } };
    let reason;
    try { reason = quietly(() => mos._issueMoveToPoint(v, spec))?.reason ?? 'ok'; }
    catch (e) { reason = 'threw:' + String(e?.message ?? e).slice(0, 40); }
    return { reason, passed };
  };
  const rM = order(M), rL = order(L);
  assert(rL.reason === 'unreachable_target' && rL.passed === false, `KONTROLA dotychczasowa: cel 0.17 AU odrzucony bramką Słońca (${rL.reason})`);
  assert(rM.reason !== 'unreachable_target' && rM.passed === true, `układ M: rozkaz lotu do domu 0.17 AU przechodzi bramkę strefy Słońca (dalej: ${rM.reason})`);

  // Przyciąganie kliku do ciała (0.5 AU × k)
  const snap = (S, dAU) => VesselManager.prototype._findBodyNearPoint.call(vmStub, S.home.x, dAU * AU, undefined,
    { systemId: S.star.systemId })?.id ?? null;
  assert(snap(L, 0.3) === L.home.id, 'KONTROLA dotychczasowa: klik 0.3 AU od ciała → przyciągnięty');
  assert(snap(M, 0.3) === null, 'układ M: klik 0.3 AU od ciała (poza 0.5·k = 0.1 AU) → wolna przestrzeń');
  assert(snap(M, 0.05) === M.home.id, 'układ M: klik 0.05 AU od ciała → przyciągnięty do zamierzonego ciała');

  // Zasięgi broni / wykrycia / sensor-lock
  const dscs = Object.create(DeepSpaceCombatSystem.prototype);
  const rng = (sys) => dscs._resolveWeaponRange({ rangeAU: 0.3, category: 'long' }, 'emp_x', sys);
  assert(rng('sys_leg') === 0.3 && Math.abs(rng('sys_m') - 0.06) < 1e-12, `zasięg rakiety: kontrola ${rng('sys_leg')} AU, układ M ${rng('sys_m')} AU`);
  const enemy = (sys) => ({ ownerEmpireId: 'emp_x', systemId: sys, modules: ['weapon_missile'] });
  assert(DR.vesselDetectionRangeAU(enemy('sys_leg')) === 0.5 && Math.abs(DR.vesselDetectionRangeAU(enemy('sys_m')) - 0.1) < 1e-12,
    'zasięg wykrycia (radar HUD i ProximitySystem): kontrola 0.5 AU, układ M 0.1 AU');
  const ps = Object.create(ProximitySystem.prototype);
  const lock = (sys) => ps._getSensorLockAU({ ownerEmpireId: 'player', systemId: sys });
  assert(lock('sys_leg') === GAME_CONFIG.SENSOR_LOCK_AU && Math.abs(lock('sys_m') - GAME_CONFIG.SENSOR_LOCK_AU * 0.2) < 1e-12, 'sensor-lock × k');

  // Blokada (0.5 AU × k): wrogi uzbrojony statek swobodny przy ciele
  const pool = Object.create(SystemPoolService.prototype);
  const prevVM = K.vesselManager;
  const blockade = (S, dAU) => {
    K.vesselManager = { getAllVessels: () => [{ ...enemy(S.star.systemId), position: { x: S.home.x, y: dAU * AU, dockedAt: null } }] };
    try { return pool._hostileWarshipInOrbit(S.home); } finally { K.vesselManager = prevVM; }
  };
  assert(blockade(L, 0.3) === true, 'KONTROLA dotychczasowa: wróg 0.3 AU od ciała → blokada');
  assert(blockade(M, 0.3) === false && blockade(M, 0.05) === true, 'układ M: wróg 0.3 AU → brak blokady, 0.05 AU → blokada');

  // Piny źródłowe: progi czytają helper (żywe ścieżki; scena i renderer nie importują się pod node)
  const files = {
    MovementOrderSystem: '../../systems/MovementOrderSystem.js', VesselManager: '../../systems/VesselManager.js',
    RetreatTarget: '../../utils/RetreatTarget.js', ProximitySystem: '../../systems/ProximitySystem.js',
    DeepSpaceCombatSystem: '../../systems/DeepSpaceCombatSystem.js', VesselCombatSystem: '../../systems/VesselCombatSystem.js',
    SystemPoolService: '../../systems/SystemPoolService.js', DetectionRange: '../../utils/DetectionRange.js',
    ObservatorySystem: '../../systems/ObservatorySystem.js', IntelSystem: '../../systems/IntelSystem.js',
    DirectorDoctrine: '../../systems/director/DirectorDoctrine.js', DirectorFirstContact: '../../systems/director/DirectorFirstContact.js',
    CombatStrip: '../../ui/CombatStrip.js', Star: '../../entities/Star.js', GameScene: '../../scenes/GameScene.js',
  };
  const missing = Object.entries(files).filter(([, p]) => !/from '(\.\.\/)+utils\/SystemScale\.js'|from '\.\/SystemScale\.js'/.test(src(p))).map(([n]) => n);
  assert(missing.length === 0, `pin: ${Object.keys(files).length} konsumentów importuje SystemScale (brak: ${missing.join(', ') || '—'})`);
  const mosSrc = src(files.MovementOrderSystem);
  assert(/SUN_EXCLUSION_PX \* systemScaleOf\(/.test(mosSrc) && !/<=? THREAT_RADIUS_PX\)/.test(mosSrc)
    && (mosSrc.match(/threatRadiusPx\(vessel\)/g) ?? []).length >= 4, 'pin: MovementOrderSystem — strefa Słońca i próg dotarcia × k (brak gołych progów)');
  const dsSrc = src(files.DeepSpaceCombatSystem);
  assert((dsSrc.match(/COMBAT_DISENGAGE_AU \* AU_TO_PX \* systemScaleOf\(encounter\.location\?\.systemId\)/g) ?? []).length === 2,
    'pin: DSCS — promień rozejścia × k układu starcia (×2)');
  const vmSrc = src(files.VesselManager);
  assert(/SHORT_HOP = 0\.5 \* AU_TO_PX \* kSys/.test(vmSrc) && /SUN_EXCLUSION \* kSys/.test(vmSrc) && /edgeAU \* AU_TO_PX \* systemScaleOfStar\(star\)/.test(vmSrc),
    'pin: VesselManager — krótki skok, omijanie Słońca, obrzeża przylotu z warpu × k');
  assert(/frameSystem\(this\._computeSystemExtentAU\(\), this\._star\?\.systemScale \?\? 1\)/.test(TR)
    && /STAGE\.CLUSTER_AU \* GAME_CONFIG\.AU_TO_PX \* \(this\._star\?\.systemScale \?\? 1\)/.test(TR), 'pin: ThreeRenderer — podłoga ramki kamery i klaster bitew × k');
  const gsSrc = src(files.GameScene);
  assert((gsSrc.match(/clusterRadiusPx\(GAME_CONFIG\.AU_TO_PX, K\?\.systemScale\?\.of\?\./g) ?? []).length === 2
    && /window\.KOSMOS\.systemScale = SystemScale;/.test(gsSrc), 'pin: GameScene — klaster banerów × k (×2), K.systemScale wpięte');
  // prędkości i paliwo NIE skalowane (D-CS-24)
  assert(!/speedAU[^;\n]*systemScale|fuelPerAU[^;\n]*systemScale/.test(mosSrc + vmSrc), 'pin: prędkości i paliwo bez skali układu (D-CS-24)');
  K.starSystemManager = null;
}

// ── O7 Finding 774 — rysunek tarczy gwiazdy ─────────────────────────────────
console.log('\n── O7 Finding 774: skala rysunku gwiazdy (ℓ bez podłogi, prześwit 1.5 rdzenia, podłoga ekranowa) ──');
{
  const WU_PER_AU = AU / 10;
  const draw = (star, o) => safe(() => SSC.starDrawScale(star, o), NaN);
  const mk = (L, stamped) => ({ luminosity: L, ...(stamped ? { orbitModel: 2 } : {}) });
  // a) świat dotychczasowy — 1 DOKŁADNIE (także z planetą tuż przy gwieździe)
  assert(draw(mk(0.026, false), { baseCoreAU: 0.2, innermostPeriapsisAU: 0.01 }) === 1 && draw(mk(4, false), {}) === 1,
    '774a: gwiazda bez stempla orbit 2 → skala rysunku 1 (=== 1, nawet z peryhelium 0.01 AU)');
  // b) ℓ < 0.2 bez podłogi, k rozgrywki nadal 0.2
  const dim = new Star({ id: 'st774', name: 'Dim', spectralType: 'M', mass: 0.12, luminosity: 0.026, orbitModel: 2, x: 0, y: 0 });
  const sDim = draw(dim, {});
  assert(Math.abs(sDim - Math.sqrt(0.026)) < 1e-12 && sDim < 0.2, `774b SEDNO: L 0.026 → skala rysunku ℓ = ${sDim?.toFixed?.(4)} (bez podłogi 0.2)`);
  assert(dim.systemScale === 0.2, `774c: k rozgrywki tej gwiazdy nadal 0.2 (podłoga D-CS-24): ${dim.systemScale}`);
  // c) sufit 1 dla jasnych gwiazd; d) przycięcie prześwitem
  assert(draw(mk(4, true), {}) === 1, '774d: L 4 (ℓ 2) → skala rysunku 1 (sufit — jasne gwiazdy nie rosną)');
  const clip = draw(mk(1, true), { baseCoreAU: 0.3, innermostPeriapsisAU: 0.36 });
  assert(Math.abs(clip - 0.8) < 1e-12, `774e SEDNO: peryhelium 0.36 AU, rdzeń 0.3 AU → skala 0.36/(1.5·0.3) = 0.8 (jest ${clip})`);
  assert(SSC.STAR_CORE_CLEARANCE === 1.5 && SSC.innermostPeriapsisAU?.([{ orbital: { a: 1, e: 0.5 } }, { orbital: { a: 0.6, e: 0 } }]) === 0.5
    && SSC.innermostPeriapsisAU?.([]) === Infinity, '774f: prześwit 1.5, peryhelium = min a·(1−e), brak planet → Infinity');
  // e) generowane światy orbit 2: każda planeta ≥ 1.5 × rysowany rdzeń (wszystkie klasy), świadek przycięć
  let n = 0, viol = 0, clipped = 0, belowK = 0, worst = Infinity, stars = 0;
  for (const seed of SEEDS) {
    quietly(() => scaledWorld(seed, 2));
    for (const star of EntityManager.getByType('star')) {
      const pl = EntityManager.getByTypeInSystem('planet', star.systemId);
      if (!pl.length) continue;
      stars++;
      const base = Math.max(0.6, Math.min(1.6, 0.6 + (star.mass ?? 1) * 0.6));
      const s = draw(star, { baseCoreAU: base * 3.0 / WU_PER_AU, innermostPeriapsisAU: safe(() => SSC.innermostPeriapsisAU(pl), NaN) });
      const ell = Math.min(1, Math.sqrt(star.luminosity));
      if (s < ell - 1e-12) clipped++;
      if (s < star.systemScale - 1e-12) belowK++;
      const coreAU = base * s * 3.0 / WU_PER_AU;
      for (const p of pl) {
        n++; const ratio = p.orbital.a * (1 - (p.orbital.e ?? 0)) / coreAU;
        if (!(ratio >= 1.5 - 1e-9)) viol++;
        worst = Math.min(worst, ratio);
      }
    }
  }
  assert(n > 3000 && viol === 0, `774g SEDNO: ${n} planet w ${stars} układach orbit 2 — peryhelium < 1.5 × rysowany rdzeń: ${viol} (najgorsze ${worst.toFixed(3)}×)`);
  assert(clipped > 50 && belowK > 50, `774h świadek: przycięcie prześwitem działa w ${clipped} układach, rysunek < k w ${belowK}`);
  // f) świat dotychczasowy (kontrola): wszystkie gwiazdy 1
  quietly(() => baseApiWorld(612055237, 12));
  const legacyStars = EntityManager.getByType('star');
  assert(legacyStars.length >= 13 && legacyStars.every(st => draw(st, { baseCoreAU: 0.3, innermostPeriapsisAU: 0.1 }) === 1),
    `774i: świat dotychczasowy — ${legacyStars.length} gwiazd, skala rysunku 1 każda`);
  // g) podłoga ekranowa
  const flo = (o) => safe(() => SSC.starScreenFloorScale(o), NaN);
  const far = flo({ coreRadiusWorld: 0.3, distance: 450, viewportHeightPx: 1041, fovDeg: 55 });
  const pxFar = 0.3 * far * (1041 / 2) / (450 * Math.tan(27.5 * Math.PI / 180));
  assert(far > 1 && Math.abs(pxFar - 4) < 1e-9 && SSC.STAR_MIN_CORE_PX === 4, `774j SEDNO: daleki kadr — mnożnik ${far?.toFixed?.(2)}, promień na ekranie ${pxFar.toFixed(2)} px = 4`);
  assert(flo({ coreRadiusWorld: 0.3, distance: 5, viewportHeightPx: 1041, fovDeg: 55 }) === 1
    && flo({ coreRadiusWorld: 0.3, distance: 0, viewportHeightPx: 1041, fovDeg: 55 }) === 1
    && flo({ coreRadiusWorld: NaN, distance: 5, viewportHeightPx: 1041, fovDeg: 55 }) === 1, '774k: bliski kadr / dane zdegenerowane → mnożnik 1');
  // h) piny żywej ścieżki: pętla woła podłogę tylko przy skali < 1; podłoga skaluje rdzeń i sferę kliku, nie koronę
  const TR = src('../../renderer/ThreeRenderer.js');
  assert(/if \(this\._starDrawScale < 1\) this\._applyStarScreenFloor\(\);/.test(TR), 'pin 774: pętla renderu — podłoga ekranowa tylko przy skali rysunku < 1');
  const flAt = TR.indexOf('  _applyStarScreenFloor() {');
  const fl = flAt >= 0 ? TR.slice(flAt, flAt + 900) : '';
  assert(/starScreenFloorScale\(\{/.test(fl) && /coreRadiusWorld:\s+this\._sunCoreRadius/.test(fl) && /this\._starCore\.scale\.setScalar\(f\)/.test(fl)
    && /this\._starClickMesh\?\.scale\.setScalar\(f\)/.test(fl) && !/_starCorona/.test(fl), 'pin 774: _applyStarScreenFloor — rdzeń + sfera kliku × mnożnik, korona bez zmian');
  assert(/this\._sunCoreRadius = r \* STAR_CORE_SCALE;/.test(TR) && /setStarCoreRadius\?\.\(this\._sunCoreRadius\)/.test(TR),
    'świadek 774: strefa kamery z `_sunCoreRadius` = rysowany rdzeń (r × STAR_CORE_SCALE)');
}

// ── O8 przegląd stałych przestrzennych ──────────────────────────────────────
console.log('\n── O8 przegląd stałych (CS-PHYS-b3): akrecja, HUD sensor-lock, odczyty AU ──');
{
  const { AccretionSystem } = await import('../../systems/AccretionSystem.js');
  // Akrecja: planetezymal 0.06 AU od planety — dotychczasowo (0.12 AU) wchłonięty, w układzie k = 0.2 (0.024 AU) nie
  const absorbedAt = (star) => {
    EntityManager.clear();
    const pl = new Planet({ id: 'pl_acc', name: 'Acc', planetType: 'rocky', a: 1, e: 0, mass: 1, systemId: 'sys_acc', x: 110, y: 0 });
    pl.x = 110; pl.y = 0;
    EntityManager.add(pl);
    if (EntityManager.getByType('planet').length !== 1) return null;
    const acc = new AccretionSystem({ planetesimals: [{ id: 'pz1', x: 110 + 0.06 * AU, y: 0, mass: 0.01, orbital: { a: 1.06 } }], star });
    quietly(() => acc._checkPlanetAccretion());
    return acc.planetesimals.length === 0;
  };
  const aL = safe(() => absorbedAt({ x: 0, y: 0, luminosity: 0.027 }), 'err');
  const aM = safe(() => absorbedAt({ x: 0, y: 0, luminosity: 0.027, orbitModel: 2 }), 'err');
  assert(aL === true, `KONTROLA-O8a: akrecja dotychczasowa — planetezymal 0.06 AU od planety wchłonięty (${aL})`);
  assert(aM === false, `O8b SEDNO: akrecja w układzie k = 0.2 — strefa 0.024 AU, planetezymal 0.06 AU NIE wchłonięty (${aM})`);
  const accSrc = src('../../systems/AccretionSystem.js');
  assert(/ACCRETION_DIST_AU \* GAME_CONFIG\.AU_TO_PX \* systemScaleOfStar\(this\.star\)/.test(accSrc)
    && /BIN_SIZE_AU\s+= 0\.15 \* systemScaleOfStar\(this\.star\)/.test(accSrc), 'pin O8: AccretionSystem — strefa akrecji i bin × skala układu');
  // Odczyty AU
  const dec = (x) => safe(() => SSC.auReadoutDecimals(x), NaN);
  assert(dec(0.06) === 2 && dec(0.14) === 2 && dec(0.3) === 1 && dec(0.35) === 1 && dec(1.5) === 1 && dec(0) === 1,
    'O8c: odczyt AU < 0.25 → 2 miejsca (0.06, 0.14), dotychczasowe wartości (≥ 0.3) → 1');
  const HRL = await import('../../ui/HudRadarLogic.js');
  const r1 = HRL.rangeReadoutText(0.06, 'en'), r2 = HRL.rangeReadoutText(1.5, 'en'), r3 = HRL.rangeReadoutText(0.5, 'en');
  assert(r1 === '0.06 AU', `O8d SEDNO: odczyt radaru 0.06 AU → „${r1}”`);
  assert(r2 === '1.5 AU' && r3 === '0.5 AU', `KONTROLA-O8e: odczyt radaru dotychczasowy — 1.5 → „${r2}”, 0.5 → „${r3}”`);
  const hll = src('../../ui/HudLabelLayer.js');
  assert(/\?\? 1\) \* systemScaleOfEntity\(v\);/.test(hll) && /fmtDec\(x, auReadoutDecimals\(x\), loc\)/.test(hll)
    && /fmtDec\(r, auReadoutDecimals\(r\), loc\)/.test(hll), 'pin O8: HudLabelLayer — fallback sensor-locku × k, odczyty wykr./lock z auReadoutDecimals');
  const ftp = src('../../ui/FleetTabPanel.js');
  assert((ftp.match(/orbA\.toFixed\(auReadoutDecimals\(orbA\)\)/g) ?? []).length === 2 && !/orbA\.toFixed\(1\)/.test(ftp),
    'pin O8: FleetTabPanel — orbita na liście ciał z auReadoutDecimals (×2)');
  // Celowo NIE skalowane: margines omijania ciał (0.15 AU — związany z rysowanym promieniem planet w px, nieskalowanym)
  const vmS = src('../../systems/VesselManager.js');
  assert(/const BODY_MARGIN = 0\.15 \* AU_TO_PX;/.test(vmS), 'świadek O8: margines omijania ciał 0.15 AU bez skali (§3.9.2 — rysowane planety w px)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
