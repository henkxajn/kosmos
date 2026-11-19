// KOSMOS — keeper CS-PHYS-c część A (plan COLONY_SPHERE §3.9.3): skala RYSUNKU ciał układu ściśniętego.
//
// C1  SystemScale: bodyDrawScale — świat dotychczasowy 1 DOKŁADNIE, stempel orbit 2 → k; podłoga ekranowa tarcz
//     (min BODY_MIN_PX, nigdy ponad rozmiar dotychczasowy, dane zerowe → 1)
// C2  orbity księżyców w świecie orbit 2 × k (zdefiniowane w promieniach rysowanej planety): granice wzoru × k, księżyc
//     poza rysowaną tarczą, pierścień księżyca vs odstęp planet w układach M; świat dotychczasowy — ślad O1 keepera orbits
// C3  orbity stacji / statków wokół ciał (OrbitalRolesData.getOrbitRange × skala; OrbitalSpaceSystem.assignOrbit
//     wykonany w układzie M i w kontroli)
// C4  renderer (ThreeRenderer nie importuje się pod node → metody wyjęte ze źródła i WYKONANE na atrapie `this`):
//     `_getEntityRadius` × skala, `_applyBodyScreenFloor` (podłoga, sufit 1/s, pierścienie księżyców na fizyce), piny ścieżek
//     żywych: renderStar ustawia skalę, promienie siatek, bramka pętli, kamera (min zoom, auto-zoom, ramka 1 AU × k)
// C5  margines omijania ciał na trasie × k (VesselManager._calcRoute wykonany): stosunek margines / rysowany promień
//     jak w świecie dotychczasowym; kontrola k = 1 bit w bit
import '../headless/env.js';           // MUSI być pierwszy (window, Math.random = seeded)
import { readFileSync } from 'node:fs';

const { GAME_CONFIG }       = await import('../../config/GameConfig.js');
const { SystemGenerator }   = await import('../../generators/SystemGenerator.js');
const { GalaxyGenerator }   = await import('../../generators/GalaxyGenerator.js');
const { StarSystemManager } = await import('../../systems/StarSystemManager.js');
const EntityManager         = (await import('../../core/EntityManager.js')).default;
const { Star }              = await import('../../entities/Star.js');
const { Planet }            = await import('../../entities/Planet.js');
const ORD = await import('../../data/OrbitalRolesData.js');
const { OrbitalSpaceSystem } = await import('../../systems/OrbitalSpaceSystem.js');
const { VesselManager }     = await import('../../systems/VesselManager.js');
const SSC = await import('../../utils/SystemScale.js').catch(() => ({}));   // nowe symbole przez namespace (fail-first)

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  ✅ ' + msg); } else { fail++; console.log('  ❌ ' + msg); } }
const safe = (fn, dflt) => { try { return fn(); } catch { return dflt; } };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const quietly = (fn) => { const o = console.log, w = console.warn; console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = o; console.warn = w; } };
const SEEDS = [-2102099243, 612055237, 572914822, 813683454, 1640489291];
const AU = GAME_CONFIG.AU_TO_PX;
const WU_PER_AU = AU / 10;   // 1 AU = 11 j. świata (WORLD_SCALE 10)

// Wyjęcie metody klasy ze źródła (wcięcie 2 spacji, nawiasy zbalansowane) → funkcja z jawnym zakresem
function extractMethod(text, header) {
  const at = text.indexOf('\n  ' + header);
  if (at < 0) return null;
  const open = text.indexOf('{', at + header.length);
  let depth = 0, i = open;
  for (; i < text.length; i++) { if (text[i] === '{') depth++; else if (text[i] === '}') { depth--; if (depth === 0) break; } }
  return { params: header.slice(header.indexOf('(') + 1, header.lastIndexOf(')')), body: text.slice(open + 1, i) };
}
function compile(m, scopeNames, scopeVals) {
  if (!m) return null;
  try { return new Function(...scopeNames, `return function(${m.params}) {${m.body}};`)(...scopeVals); } catch { return null; }
}

// ── C1 SystemScale ──────────────────────────────────────────────────────────
console.log('\n── C1 SystemScale: skala rysunku ciał + podłoga ekranowa ──');
{
  const legacy = { luminosity: 0.027 }, stampedM = { luminosity: 0.027, orbitModel: 2 }, stampedG = { luminosity: 1.0, orbitModel: 2 };
  const bd = (s) => safe(() => SSC.bodyDrawScale(s), NaN);
  assert(bd(legacy) === 1 && bd(null) === 1, `świat dotychczasowy: bodyDrawScale = 1 dokładnie (${bd(legacy)}, null → ${bd(null)})`);
  assert(Math.abs(bd(stampedM) - 0.2) < 1e-12 && bd(stampedG) === 1, `stempel orbit 2: M (L 0.027) → ${bd(stampedM)} (= k, podłoga 0.2), G → ${bd(stampedG)}`);
  assert(bd(stampedM) === safe(() => SSC.systemScaleOfStar(stampedM), NaN), 'bodyDrawScale ≡ k progów (jedna skala układu, D-CS-24)');
  assert(SSC.BODY_MIN_PX === 2, `BODY_MIN_PX = ${SSC.BODY_MIN_PX} CSS px`);
  const fl = (o) => safe(() => SSC.bodyScreenFloorScale({ viewportHeightPx: 1041, fovDeg: 55, ...o }), NaN);
  // promień 0.028 j. (skalisty × 0.2) z 54 j. (ramka układu M): px = 0.028·520.5/(54·tan 27.5°) ≈ 0.52 → mnożnik ≈ 3.8
  const far = fl({ radiusWorld: 0.028, distance: 54, maxScale: 5 });
  const pxAt = (r, d) => r * (1041 / 2) / (d * Math.tan(27.5 * Math.PI / 180));
  assert(Math.abs(pxAt(0.028 * far, 54) - 2) < 1e-9, `daleki kadr: tarcza podniesiona do 2 px (mnożnik ${far.toFixed(3)})`);
  assert(fl({ radiusWorld: 0.028, distance: 400, maxScale: 5 }) === 5, 'sufit: mnożnik nigdy ponad 1/s (tarcza ≤ rozmiar dotychczasowy)');
  assert(fl({ radiusWorld: 0.028, distance: 0.5, maxScale: 5 }) === 1, 'bliski kadr: mnożnik 1 (rysunek = skala rysunku)');
  assert(fl({ radiusWorld: 0, distance: 10, maxScale: 5 }) === 1 && fl({ radiusWorld: 0.1, distance: 0, maxScale: 5 }) === 1, 'dane zerowe → 1');
}

// ── C2 orbity księżyców ─────────────────────────────────────────────────────
console.log('\n── C2 orbity księżyców × k (świat orbit 2) ──');
function scaledWorld(seed, climateModel, orbitModel = 2) {
  EntityManager.clear();
  const home = new SystemGenerator().generateCivScenario({ galaxySeed: seed, seeded: true, climateModel, orbitModel });
  const ssm = new StarSystemManager();
  ssm.registerHomeSystem(home.star, home.planets, home.moons, home.planetoids);
  const galaxyData = GalaxyGenerator.generate(seed, home.star.name, home.star.spectralType, { seededSystems: true, climateModel, orbitModel });
  ssm.assignMissingSurfaceSeeds(galaxyData.seed);
  for (const gs of galaxyData.systems) if (gs.id !== 'sys_home') ssm.generateAndRegister(gs, galaxyData);
  globalThis.window.KOSMOS.starSystemManager = ssm;
  return ssm;
}
{
  const R3D = { gas: 0.48, ice: 0.20, rocky: 0.10, hot_rocky: 0.07 }, CAP = { gas: 3.0, ice: 1.5, rocky: 0.8, hot_rocky: 0.5 };
  const DRAWN_MAX = { gas: 0.60, ice: 0.24, rocky: 0.14, hot_rocky: 0.10 };   // max promienia _planetRadius per typ (j.)
  let moons = 0, mMoons = 0, outOfBounds = 0, insideDisc = 0, mWide = 0, mGaps = 0, worstRatio = 0;
  for (const seed of SEEDS) {
    quietly(() => scaledWorld(seed, 2));
    for (const star of EntityManager.getByType('star')) {
      const k = SSC.systemScaleOfStar ? SSC.systemScaleOfStar(star) : 1;
      const planets = EntityManager.getByTypeInSystem('planet', star.systemId).sort((a, b) => a.orbital.a - b.orbital.a);
      for (const [i, p] of planets.entries()) {
        const own = EntityManager.getByTypeInSystem('moon', star.systemId).filter((m) => m.parentPlanetId === p.id);
        if (!own.length) continue;
        const t = p.planetType, r3 = R3D[t] ?? 0.10;
        const lo = r3 * 2.5 * k - 1e-9, hi = Math.max(r3 * 2.5 * k + 0.15 * k, Math.min(CAP[t] ?? 1, CAP[t] ?? 1) * k) + 0.1 * k + 1e-9;
        const prevA = i > 0 ? planets[i - 1].orbital.a : 0, nextA = i < planets.length - 1 ? planets[i + 1].orbital.a : p.orbital.a * 2;
        const gapAU = Math.min(p.orbital.a - prevA, nextA - p.orbital.a);
        for (const m of own) {
          moons++;
          const a3 = m.orbital.a * WU_PER_AU;
          if (a3 < lo || a3 > hi) outOfBounds++;
          if (!(a3 > (DRAWN_MAX[t] ?? 0.14) * k)) insideDisc++;
          if (star.spectralType === 'M') {
            mMoons++;
            const ratio = (2 * m.orbital.a) / gapAU;   // średnica pierścienia księżyca / odstęp do najbliższego sąsiada
            worstRatio = Math.max(worstRatio, ratio);
            if (ratio > 1) mWide++;
          }
        }
        if (star.spectralType === 'M') mGaps++;
      }
    }
  }
  console.log(`  (pomiar: ${moons} księżyców, w układach M ${mMoons} wokół ${mGaps} planet; najgorsza średnica pierścienia / odstęp ${worstRatio.toFixed(3)})`);
  assert(moons > 1000 && mMoons > 100, `świadek: ${moons} księżyców w 5 światach orbit 2, ${mMoons} w układach M`);
  assert(outOfBounds === 0, `każda orbita księżyca w granicach wzoru × k (2.5 promienia × k … cap × k + 0.1k): poza ${outOfBounds}/${moons}`);
  assert(insideDisc === 0, `KONTROLA księżyc poza rysowaną tarczą planety (max promień typu × k): wewnątrz ${insideDisc}/${moons}`);
  assert(mWide === 0, `KONTROLA układy M: pierścień księżyca węższy niż odstęp planet (średnica / odstęp ≤ 1): szersze ${mWide}/${mMoons}`);
  assert(worstRatio <= 0.5, `układy M: najszerszy pierścień księżyca ≤ połowy odstępu planet (${worstRatio.toFixed(3)}; baza 98f7316: 0.921)`);
  const gen = src('../../generators/SystemGenerator.js');
  assert(/const kDraw\s*= this\._orbit === ORBIT_SCALED \? compactionOf\(star\?\.luminosity\) : 1;/.test(gen)
    && /Math\.random\(\) \* 0\.1 \* kDraw/.test(gen), 'pin: _makeMoon — k tylko przy stemplu orbit 2 (inaczej 1), bez nowych rzutów RNG');
}

// ── C3 orbity stacji / statków wokół ciał ───────────────────────────────────
console.log('\n── C3 orbity stacji i statków wokół ciał × skala ──');
EntityManager.clear();
globalThis.window.KOSMOS.starSystemManager = null;
const mkSys = (sysId, stamped) => {
  const star = new Star({ id: `star_${sysId}`, name: sysId, spectralType: 'M', mass: 0.4, luminosity: 0.027, ...(stamped ? { orbitModel: 2 } : {}) });
  star.systemId = sysId; EntityManager.add(star);
  const mk = (id, a, y = 0) => { const p = new Planet({ id, name: id, a, e: 0, T: 0.1, M: 0, inclinationOffset: 0, mass: 1, planetType: 'rocky',
    temperatureK: 288, temperatureC: 15, albedo: 0.15, atmosphere: 'breathable', color: 0x888888, visualRadius: 8 });
    p.systemId = sysId; p.x = a * AU; p.y = y * AU; EntityManager.add(p); return p; };
  return { star, home: mk(`home_${sysId}`, 0.17), mid: mk(`mid_${sysId}`, 0.45, 0.05), outer: mk(`out_${sysId}`, 0.9) };
};
const SM = mkSys('sys_m', true), SL = mkSys('sys_leg', false);
{
  for (const role of ['station', 'warship', 'cargo', 'wreck']) {
    const r0 = ORD.getOrbitRange(role, 0.0612);
    const r1 = ORD.getOrbitRange(role, 0.0612, 1);
    const rs = ORD.getOrbitRange(role, 0.0612 * 0.2, 0.2);
    assert(r0.rMin === r1.rMin && r0.rMax === r1.rMax, `${role}: skala 1 ≡ dotychczas (${r0.rMin}/${r0.rMax})`);
    assert(Math.abs(rs.rMin - 0.2 * r0.rMin) < 1e-12 && Math.abs(rs.rMax - 0.2 * r0.rMax) < 1e-12, `${role}: skala 0.2 → zakres × 0.2 (${rs.rMin.toFixed(4)}/${rs.rMax.toFixed(4)})`);
  }
  const oss = new OrbitalSpaceSystem();
  const om = quietly(() => oss.assignOrbit(SM.home.id, 'st_test_m', 'station'));
  const ol = quietly(() => oss.assignOrbit(SL.home.id, 'st_test_l', 'station'));
  const rOf = (o) => o?.r ?? o?.radius ?? oss.getOrbit?.(o?.objectId)?.r ?? NaN;
  const rm = rOf(om ?? oss.getOrbit('st_test_m')), rl = rOf(ol ?? oss.getOrbit('st_test_l'));
  const bodyR = ORD.computeBodyRadius(SM.home);
  const rangeL = ORD.getOrbitRange('station', bodyR), rangeM = { rMin: rangeL.rMin * 0.2, rMax: rangeL.rMax * 0.2 };
  assert(rl >= rangeL.rMin - 1e-12 && rl <= rangeL.rMax + 1e-12, `kontrola k = 1: stacja na orbicie ${rl?.toFixed?.(4)} w zakresie dotychczasowym [${rangeL.rMin.toFixed(3)}, ${rangeL.rMax.toFixed(3)}]`);
  assert(rm >= rangeM.rMin - 1e-12 && rm <= rangeM.rMax + 1e-12, `układ M: stacja na orbicie ${rm?.toFixed?.(4)} w zakresie × 0.2 [${rangeM.rMin.toFixed(4)}, ${rangeM.rMax.toFixed(4)}]`);
}

// ── C4 renderer ─────────────────────────────────────────────────────────────
console.log('\n── C4 renderer: promienie rysunku, podłoga ekranowa, kamera ──');
{
  const TR = src('../../renderer/ThreeRenderer.js');
  const planetRadius = compile(extractMethod(TR, 'static _planetRadius(planet) {'), [], []);
  const TRStub = { _planetRadius: planetRadius };
  const getR = compile(extractMethod(TR, '_getEntityRadius(entity) {'), ['ThreeRenderer'], [TRStub]);
  assert(typeof planetRadius === 'function' && typeof getR === 'function', 'świadek: _planetRadius i _getEntityRadius wyjęte ze źródła');
  const rocky = { type: 'planet', planetType: 'rocky', physics: { mass: 1 } }, gas = { type: 'planet', planetType: 'gas', physics: { mass: 300 } };
  const moon = { type: 'moon', physics: { mass: 0.01 } }, pd = { type: 'planetoid' }, star = { type: 'star' };
  const at = (s, e) => safe(() => getR.call({ _bodyDrawScale: s }, e), NaN);
  const atNone = (e) => safe(() => getR.call({}, e), NaN);
  assert(at(1, rocky) === 0.062 && atNone(rocky) === 0.062 && at(1, gas) === planetRadius(gas) && at(1, moon) === 0.03 && at(1, pd) === 0.02 && at(1, star) === 1.6,
    `skala 1 / brak skali: promienie dotychczasowe (skalisty ${at(1, rocky)}, księżyc ${at(1, moon)}, planetoida ${at(1, pd)}, gwiazda ${at(1, star)})`);
  assert(Math.abs(at(0.2, rocky) - 0.0124) < 1e-12 && Math.abs(at(0.2, moon) - 0.006) < 1e-12 && Math.abs(at(0.2, pd) - 0.004) < 1e-12 && at(0.2, star) === 1.6,
    `skala 0.2: planeta / księżyc / planetoida × 0.2 (${at(0.2, rocky)}, ${at(0.2, moon)}, ${at(0.2, pd)}), gwiazda bez zmian (rysuje ją starDrawScale)`);

  // _applyBodyScreenFloor — wykonana na atrapie sceny
  const floorFn = compile(extractMethod(TR, '_applyBodyScreenFloor() {'), ['bodyScreenFloorScale'], [SSC.bodyScreenFloorScale ?? (() => 1)]);
  const v3 = (x, y, z) => ({ x, y, z, distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); } });
  const sc = () => ({ x: 1, setScalar(f) { this.x = f; } });
  const mkScene = (s, camDist) => {
    const group = { position: v3(0, 0, 0), scale: sc() };
    const pe = { group, mesh: { geometry: { parameters: { radius: 0.14 * s } } } };
    const ring = { scale: sc() };
    const me = { mesh: { position: v3(0.3, 0, 0), scale: sc(), geometry: { parameters: { radius: 0.03 * s } } }, ring, parentEntry: pe };
    const pde = { mesh: { position: v3(-0.5, 0, 0), scale: sc(), geometry: { parameters: { radius: 0.1 * s } } } };
    return { _bodyDrawScale: s, camera: { fov: 55, position: v3(0, 0, camDist) }, _planets: new Map([['p', pe]]), _moons: new Map([['m', me]]), _planetoids: new Map([['d', pde]]), pe, me, pde };
  };
  globalThis.window.innerHeight = 1041;
  const far = mkScene(0.2, 54);
  safe(() => floorFn.call(far));
  const pxOf = (r, d) => r * (1041 / 2) / (d * Math.tan(27.5 * Math.PI / 180));
  assert(far.pe.group.scale.x > 1 && Math.abs(pxOf(0.028 * far.pe.group.scale.x, 54) - 2) < 1e-6, `daleki kadr (54 j.): planeta podniesiona do 2 px (×${far.pe.group.scale.x.toFixed(3)})`);
  assert(Math.abs(far.me.ring.scale.x * far.pe.group.scale.x - 1) < 1e-12, 'pierścień orbity księżyca: odwrotny mnożnik — w świecie skala 1 (księżyce na pozycjach fizyki)');
  assert(far.me.mesh.scale.x === 5 && far.pde.mesh.scale.x > 1, `sufit 1/s: maleńki księżyc najwyżej ×5 (= rozmiar dotychczasowy), planetoida ×${far.pde.mesh.scale.x.toFixed(2)}`);
  const near = mkScene(0.2, 0.4);
  safe(() => floorFn.call(near));
  assert(near.pe.group.scale.x === 1 && near.me.mesh.scale.x === 1, 'bliski kadr: mnożniki 1 (rysunek = promień × skala)');
  const leg = mkScene(1, 400);
  safe(() => floorFn.call(leg));
  assert(leg.pe.group.scale.x === 1 && leg.me.mesh.scale.x === 1 && leg.pde.mesh.scale.x === 1, 'świat dotychczasowy (skala 1): metoda nic nie zmienia nawet z daleka');

  // Piny ścieżek żywych
  const rs = TR.slice(TR.indexOf('  renderStar(star, planets = []) {'), TR.indexOf('  renderStar(star, planets = []) {') + 3000);
  assert(/this\._bodyDrawScale = bodyDrawScale\(star\);/.test(rs) && TR.indexOf('this.renderStar(star, planets);') < TR.indexOf('planets.forEach(p => this.addPlanetMesh(p));'),
    'pin: renderStar ustawia skalę ciał przed addPlanetMesh (initSystem)');
  const addP = TR.slice(TR.indexOf('  addPlanetMesh(planet) {'), TR.indexOf('  addPlanetMesh(planet) {') + 600);
  assert(/const r\s+= ThreeRenderer\._planetRadius\(planet\) \* \(this\._bodyDrawScale \?\? 1\);/.test(addP), 'pin: addPlanetMesh — promień siatki × skala (chmury, atmosfera, pierścienie gazowca idą za r)');
  assert((TR.match(/ThreeRenderer\._planetRadius\(planet\) \* \(this\._bodyDrawScale \?\? 1\)/g) ?? []).length >= 3, 'pin: przebudowa materiału planety i znacznik życia — ten sam rysowany promień');
  assert(/0\.015 \+ \(moon\.physics\?\.mass \?\? 0\.001\) \* 1\.5\)\) \* \(this\._bodyDrawScale \?\? 1\);/.test(TR), 'pin: _addMoonMesh — promień księżyca × skala');
  assert(/Math\.max\(0\.08, Math\.min\(0\.12, 0\.06 \+ mass \* 0\.8\)\) \* \(this\._bodyDrawScale \?\? 1\);/.test(TR), 'pin: planetoidy — promień × skala');
  assert(/if \(\(this\._bodyDrawScale \?\? 1\) < 1\) this\._applyBodyScreenFloor\(\);/.test(TR), 'pin: pętla renderu woła podłogę ciał tylko przy skali < 1');
  assert(/setMinDist\(\(entity\.type === 'moon' \? 0\.15 : 0\.3\) \* \(this\._bodyDrawScale \?\? 1\)\)/.test(TR)
    && /const idealDist = Math\.max\(r \* 6, 0\.8 \* \(this\._bodyDrawScale \?\? 1\)\);/.test(TR)
    && (TR.match(/setMinDist\(0\.3 \* \(this\._bodyDrawScale \?\? 1\)\)/g) ?? []).length === 2 && !/setMinDist\(0\.3\)/.test(TR),
    'pin: kamera — min zoom ciała / domyślny, auto-zoom × skala (tarcza 260 px osiągalna jak dotąd)');
  assert(/let maxOrbitAU = 1 \* \(this\._star\?\.systemScale \?\? 1\);/.test(TR), 'pin: ramka układu — podłoga 1 AU × k');
  assert(/orbitR: Math\.max\(0\.5 \* \(this\._bodyDrawScale \?\? 1\), bodyR \* 6\.0\)/.test(TR) && /Math\.max\(0\.06 \* \(this\._bodyDrawScale \?\? 1\), bodyR \* 2\.0\)/.test(TR),
    'pin: wizualne orbity statków / wraków wokół ciał — minima × skala');
  const oss = src('../../systems/OrbitalSpaceSystem.js');
  assert(/computeBodyRadius\(planetEntity\) \* drawScale/.test(oss) && /getOrbitRange\(role, bodyRadius, drawScale\)/.test(oss), 'pin: OrbitalSpaceSystem.assignOrbit — promień ciała i zakres × skala');
  const tr2 = src('../../renderer/ThreeRenderer.js');
  assert(/new THREE\.SphereGeometry\(r \* 2\.5, 16, 16\)/.test(tr2), 'świadek (kontrola): sfera kliku gwiazdy bez zmian');
}

// ── C5 margines omijania ciał ───────────────────────────────────────────────
console.log('\n── C5 margines omijania ciał na trasie × k ──');
{
  const vm = Object.create(VesselManager.prototype);
  const route = (sysId, sx, sy, tx, ty) => safe(() => vm._calcRoute(sx * AU, sy * AU, tx * AU, ty * AU, sysId), null);
  // Trasa przechodzi 0.05 AU od planety „mid” (0.45 AU, 0.05 AU): w kontroli k = 1 (margines 0.15 AU) — objazd; w M (0.03 AU) — prosto
  const rL = route('sys_leg', 0.5, -0.4, 0.5, 0.5);
  const rM = route('sys_m', 0.5, -0.4, 0.5, 0.5);
  const dMid = (sx, sy, tx, ty) => { const dx = tx - sx, dy = ty - sy; const t = Math.max(0, Math.min(1, ((0.45 - sx) * dx + (0.05 - sy) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(sx + dx * t - 0.45, sy + dy * t - 0.05); };
  console.log(`  (prosta trasa mija planetę o ${dMid(0.5, -0.4, 0.5, 0.5).toFixed(4)} AU)`);
  assert(rL?.waypoints?.length === 1, `kontrola k = 1: objazd planety (punkty trasy ${rL?.waypoints?.length})`);
  assert(rM?.waypoints?.length === 0, `układ M (k = 0.2): margines 0.03 AU — lot prosto (punkty trasy ${rM?.waypoints?.length})`);
  const wpL = rL?.waypoints?.[0];
  const offL = wpL ? Math.hypot(wpL.x / AU - 0.45, wpL.y / AU - 0.05) : NaN;
  // Bliżej (0.01 AU od planety) — objazd także w M, punkt trasy ~(0.03 + 0.01) AU od planety = kontrola × 0.2
  const rM2 = route('sys_m', 0.44, -0.4, 0.44, 0.5), rL2 = route('sys_leg', 0.44, -0.4, 0.44, 0.5);
  const off = (r) => { const w = r?.waypoints?.[0]; return w ? Math.hypot(w.x / AU - 0.45, w.y / AU - 0.05) : NaN; };
  assert(rM2?.waypoints?.length === 1 && rL2?.waypoints?.length === 1 && Math.abs(off(rM2) / off(rL2) - 0.2) < 0.02,
    `trasa 0.01 AU od planety: objazd w obu, odsunięcie punktu M / kontrola = ${(off(rM2) / off(rL2)).toFixed(3)} (≈ 0.2)`);
  const drawnL = 0.062 / WU_PER_AU, drawnM = 0.062 * 0.2 / WU_PER_AU;
  assert(Math.abs((0.15 * 0.2) / drawnM - 0.15 / drawnL) < 1e-9, `margines / rysowany promień: M ${((0.15 * 0.2) / drawnM).toFixed(2)} = kontrola ${(0.15 / drawnL).toFixed(2)}`);
  assert(Number.isFinite(offL), 'świadek: punkt objazdu kontroli istnieje');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
