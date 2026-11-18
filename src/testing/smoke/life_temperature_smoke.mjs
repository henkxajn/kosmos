// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// life_temperature_smoke — KEEPER Finding 770 (LifeSystem: gwiazda własnego układu + clamp świata macierzystego)
// Plan: `docs/design/COLONY_SPHERE_PLAN.md` §3.3.1 (audyt temperatury, Finding 770). Wzór temperatury bez zmian (CS-PHYS).
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//   T1 HomeworldClimate (czyste): strażnik pasma (w paśmie → wzór; poza, bieżąca w paśmie → bieżąca; obie poza → środek
//      pasma generatora po stronie wyniku), pasmo = literały clampu SystemGenerator.makeHomeworldBreathable,
//      pickHomeworldBody == EmpireColonyBootstrap._pickHomePlanet (wykonanie na tych samych listach)
//   T2 Flaga ON, obcy (nie-domowy) układ aktywny: każda planeta po sprawdzeniu = wartość z generacji (gwiazda własna);
//      kontrola OFF: gwiazda domowa → rozjazd; ciała nie-domowe poza pasmem zostają poza (clamp ich nie dotyczy)
//   T3 Flaga ON, dom gracza przy gwieździe M (seed 612055237, gen 10 °C): ≥3 sprawdzenia → 10 °C i lifeScore 100;
//      kontrola OFF: −130,6 °C i lifeScore spada; domy AI: każdy w paśmie po 3 sprawdzeniach, homeworldIds = ciała
//      kolonii z bootstrapu (świadek ≥ 2 imperia)
//   T4 Naprawa zepsutego zapisu (dom −131 °C) → środek pasma (10 °C); dom poza pasmem z góry → 25 °C
//   T5 OFF bit w bit: planety układu domowego = stary wzór z gwiazdą domową; ON w układzie domowym dla ciał
//      nie-domowych = OFF (ta sama gwiazda)
//   T6 Flaga lifeTempOwnStar w GameConfig (domyślnie ON); pomocniki bramki csTemp() / csLifeTick() wykonane na świecie
//      GameCore; aliasy window.csTemp / window.csLifeTick w GameScene (pin źródła)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy (window, Math.random = seeded)
import { readFileSync } from 'node:fs';

globalThis.window.KOSMOS = globalThis.window.KOSMOS ?? { debug: {} };

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const safe = (fn, d = null) => { try { return fn(); } catch (e) { console.log('  ! ' + e.message); return d; } };
const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return {}; } };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

const { GAME_CONFIG }   = await import('../../config/GameConfig.js');
const EntityManager     = (await import('../../core/EntityManager.js')).default;
const { GameCore }      = await import('../headless/GameCore.js');
const HC                = await tryImport('../../utils/HomeworldClimate.js');
const { EmpireColonyBootstrap } = await tryImport('../../systems/EmpireColonyBootstrap.js');

const FEATURES = GAME_CONFIG.FEATURES;
const withFlag = (v, fn) => { const prev = FEATURES.lifeTempOwnStar; FEATURES.lifeTempOwnStar = v; try { return fn(); } finally { FEATURES.lifeTempOwnStar = prev; } };
const snap = (ps) => ps.map(p => ({ p, t: p.temperatureC, k: p.temperatureK, s: p.surface.temperature, l: p.lifeScore }));
const restore = (sn) => sn.forEach(o => { o.p.temperatureC = o.t; o.p.temperatureK = o.k; o.p.surface.temperature = o.s; o.p.lifeScore = o.l; });
// Stary wzór LifeSystem._recalcTemp (gwiazda podana) — referencja bit w bit dla ścieżki OFF
const GH = { none: 0, thin: 15, breathable: 20, dense: 60, thick: 35 };
const oldFormulaC = (p, L) => 278 * Math.pow(1 - p.albedo, 0.25) * Math.pow(L, 0.25) / Math.sqrt(p.orbital.a) - 273.15 + (GH[p.atmosphere] ?? 0);

function bootSeed(seed) {
  const prev = FEATURES.seededSystems;
  FEATURES.seededSystems = true;
  try { const core = new GameCore(); core.boot({ quiet: true, scenario: 'civilization', galaxySeed: seed }); return core; }
  finally { FEATURES.seededSystems = prev; }
}

console.log('\n── T1 HomeworldClimate ──');
{
  const g = (c, cur) => safe(() => HC.guardHomeworldTempC(c, cur), '?');
  assert(g(20.7, 21) === 20.7 && g(5, 99) === 5 && g(35, -99) === 35, 'T1 wynik wzoru w paśmie (z brzegami) → wynik wzoru');
  assert(g(-130.6, 10) === 10 && g(43.5, 22) === 22 && g(-1e9, 35) === 35, 'T1 wynik poza pasmem, bieżąca w paśmie → bieżąca (clamp z generacji zostaje)');
  assert(g(-130.6, -130.6) === 10 && g(152, 152) === 25 && g(NaN, -50) === 10 && g(NaN, NaN) === 10, 'T1 obie poza pasmem → środek pasma generatora po stronie wyniku (10 / 25)');
  assert(HC.HOMEWORLD_TEMP_MIN_C === 5 && HC.HOMEWORLD_TEMP_MAX_C === 35 && HC.HOMEWORLD_REPAIR_COLD_C === 10 && HC.HOMEWORLD_REPAIR_HOT_C === 25, 'T1 stałe pasma');
  const sg = src('../../generators/SystemGenerator.js');
  const i = sg.indexOf('static makeHomeworldBreathable('), body = i >= 0 ? sg.slice(i, sg.indexOf('\n  }\n', i)) : '';
  assert(body.includes(`if (finalC < ${HC.HOMEWORLD_TEMP_MIN_C})`) && body.includes(`if (finalC > ${HC.HOMEWORLD_TEMP_MAX_C})`)
    && body.includes('finalC = 5 + Math.random() * 10;') && body.includes('finalC = 20 + Math.random() * 10;'), 'T1 pasmo = literały clampu w makeHomeworldBreathable (5 / 35, losowanie 5–15 / 20–30)');
  const P = (planetType, id) => ({ id, planetType });
  const lists = [[], [P('gas', 1), P('rocky', 2), P('rocky', 3)], [P('gas', 1), P('ice', 2)], [P('gas', 1), P('gas', 2)], [P('ice', 1), P('rocky', 2)]];
  const same = lists.every(l => safe(() => HC.pickHomeworldBody(l)?.id ?? null, '?') === (EmpireColonyBootstrap?._pickHomePlanet?.(l)?.id ?? null));
  assert(typeof EmpireColonyBootstrap?._pickHomePlanet === 'function' && typeof HC.pickHomeworldBody === 'function' && same
    && HC.pickHomeworldBody(lists[1]).id === 2 && HC.pickHomeworldBody(lists[2]).id === 2 && HC.pickHomeworldBody(lists[3]).id === 1,
    'T1 pickHomeworldBody == EmpireColonyBootstrap._pickHomePlanet (rocky → nie-gaz → pierwsza)');
}

console.log('\n── T2 obcy układ: gwiazda własna ──');
const core = bootSeed(612055237);
const K = window.KOSMOS, ls = core.lifeSystem;
// Zbiór światów macierzystych; brak metody (baza przed 770) → zbiór pusty (pin czerwienieje, nie przerywa)
const homesOf = () => safe(() => ls.homeworldIds(), new Set()) ?? new Set();
{
  const homeSys = new Set([K.homePlanet.systemId ?? 'sys_home', ...K.empireRegistry.listAll().map(e => e.homeSystemId)]);
  let sys = null;
  for (const gs of K.galaxyData.systems.filter(s => s.id !== 'sys_home' && !homeSys.has(s.id) && !K.starSystemManager.getSystem(s.id))) {
    K.starSystemManager.generateAndRegister(gs, K.galaxyData);
    if (EntityManager.getByTypeInSystem('planet', gs.id).length >= 3) { sys = gs.id; break; }
  }
  K.activeSystemId = sys;
  const ps = sys ? EntityManager.getByTypeInSystem('planet', sys) : [];
  const sn = snap(ps);
  const ownL = EntityManager.getStarOfSystem(sys)?.luminosity, homeL = ls.star.luminosity;
  assert(ps.length >= 3 && Number.isFinite(ownL) && Math.abs(ownL - homeL) > 1e-3, `T2 świadek: obcy układ ${sys}, ${ps.length} planet, L własna ${ownL?.toFixed?.(3)} ≠ L domowa ${homeL.toFixed(3)}`);
  withFlag(false, () => ls._checkAll());
  const offDiff = ps.filter((p, i) => Math.abs(p.temperatureC - sn[i].t) > 0.5).length;
  restore(sn);
  withFlag(true, () => ls._checkAll());
  const onMax = Math.max(...ps.map((p, i) => Math.abs(p.temperatureC - sn[i].t)));
  const syncOk = ps.every(p => p.temperatureK === p.temperatureC + 273.15 && p.surface.temperature === p.temperatureC);
  assert(offDiff === ps.length, `T2 kontrola OFF: gwiazda domowa → ${offDiff}/${ps.length} planet odjeżdża od generacji`);
  assert(onMax < 1e-9 && syncOk, `T2 ON: każda planeta = wartość z generacji (max |Δ| ${onMax}), temperatureK / surface.temperature zsynchronizowane`);
  const outside = ps.filter(p => p.temperatureC < 5 || p.temperatureC > 35);
  assert(outside.length > 0 && !outside.some(p => homesOf().has(p.id)), `T2 ciała nie-domowe poza pasmem zostają poza (${outside.length} szt., clamp ich nie dotyczy)`);
  restore(sn);
}

console.log('\n── T3 domy: clamp przez ≥3 sprawdzenia ──');
{
  const home = K.homePlanet, hsys = home.systemId ?? 'sys_home';
  K.activeSystemId = hsys;
  const ps = EntityManager.getByTypeInSystem('planet', hsys), sn = snap(ps);
  assert(EntityManager.getStarOfSystem(hsys)?.spectralType === 'M' && home.temperatureC === 10 && home.lifeScore === 100, `T3 świadek: dom gracza przy M, gen ${home.temperatureC} °C, life ${home.lifeScore}`);
  const off = withFlag(false, () => { for (let i = 0; i < 3; i++) ls._checkAll(); return { t: home.temperatureC, l: home.lifeScore }; });
  restore(sn);
  assert(off.t < -100 && off.l < 100, `T3 kontrola OFF: dom → ${off.t.toFixed(1)} °C, lifeScore ${off.l}`);
  const on = withFlag(true, () => { const ts = []; for (let i = 0; i < 3; i++) { ls._checkAll(); ts.push(home.temperatureC); } return { ts, l: home.lifeScore }; });
  assert(on.ts.length === 3 && on.ts.every(t => t === 10) && on.l === 100, `T3 ON: dom ${on.ts.join(' / ')} °C przez 3 sprawdzenia, lifeScore ${on.l}`);
  restore(sn);
  const ids = homesOf();
  const aiCols = K.colonyManager.getAllColonies().filter(c => c.ownerEmpireId && c.ownerEmpireId !== 'player' && !c.isOutpost);
  assert(aiCols.length >= 2 && aiCols.every(c => ids.has(c.planetId)) && ids.has(home.id) && ids.size === aiCols.length + 1,
    `T3 homeworldIds = dom gracza + ciała ${aiCols.length} kolonii z bootstrapu AI (rozmiar ${ids.size})`);
  const aiRes = aiCols.map(c => {
    const b = EntityManager.get(c.planetId), sys = b.systemId;
    K.activeSystemId = sys;
    const psA = EntityManager.getByTypeInSystem('planet', sys), snA = snap(psA);
    const offT = withFlag(false, () => { ls._checkAll(); return b.temperatureC; }); restore(snA);
    const onT = withFlag(true, () => { const ts = []; for (let i = 0; i < 3; i++) { ls._checkAll(); ts.push(b.temperatureC); } return ts; });
    restore(snA);
    return { gen: snA.find(o => o.p === b).t, offT, onT };
  });
  assert(aiRes.every(r => r.onT.every(t => t >= 5 && t <= 35)) && aiRes.some(r => r.offT < 5 || r.offT > 35),
    `T3 domy AI w paśmie po 3 sprawdzeniach (ON ${aiRes.map(r => r.onT.at(-1).toFixed(1)).join(', ')}; OFF ${aiRes.map(r => r.offT.toFixed(1)).join(', ')})`);
  K.activeSystemId = hsys;
}

console.log('\n── T4 naprawa zepsutego zapisu ──');
{
  const home = K.homePlanet, ps = EntityManager.getByTypeInSystem('planet', K.activeSystemId), sn = snap(ps);
  home.temperatureC = -131; home.temperatureK = home.temperatureC + 273.15; home.surface.temperature = home.temperatureC;
  withFlag(true, () => ls._checkAll());
  const t1 = home.temperatureC;
  withFlag(true, () => ls._checkAll());
  assert(t1 === 10 && home.temperatureC === 10 && home.surface.temperature === 10, `T4 dom −131 °C (stary błąd w zapisie) → ${t1} °C, drugie sprawdzenie ${home.temperatureC} °C`);
  restore(sn);
}

console.log('\n── T5 OFF bit w bit ──');
{
  const ps = EntityManager.getByTypeInSystem('planet', K.activeSystemId), sn = snap(ps);
  const L = ls.star.luminosity;
  withFlag(false, () => ls._checkAll());
  const offOk = ps.every(p => p.temperatureC === oldFormulaC(p, L));
  const offVals = ps.map(p => p.temperatureC);
  restore(sn);
  withFlag(true, () => ls._checkAll());
  const homes = homesOf();
  const nonHome = ps.filter(p => !homes.has(p.id));
  const sameStar = nonHome.every(p => p.temperatureC === offVals[ps.indexOf(p)]);
  restore(sn);
  assert(ps.length >= 3 && offOk, `T5 OFF: ${ps.length} planet układu domowego = stary wzór z gwiazdą domową (===)`);
  assert(nonHome.length >= 2 && sameStar, `T5 ON w układzie domowym: ${nonHome.length} ciał nie-domowych = OFF (ta sama gwiazda, ===)`);
}

console.log('\n── T6 flaga + pomocniki bramki ──');
{
  assert(FEATURES.lifeTempOwnStar === true, 'T6 FEATURES.lifeTempOwnStar domyślnie ON');
  const dbg = await tryImport('../../debug/ColonySphereDebug.js');
  const h = typeof dbg.colonySphereDebugHelpers === 'function' ? dbg.colonySphereDebugHelpers() : {};
  assert(typeof h.csTemp === 'function' && typeof h.csLifeTick === 'function', 'T6 colonySphereDebugHelpers zwraca csTemp i csLifeTick');
  if (typeof h.csTemp === 'function' && typeof h.csLifeTick === 'function') {
    const origTable = console.table, origLog = console.log;
    let rows = null, t0 = null, l1 = null, l2 = null, t1 = null, lOff = null;
    const home = K.homePlanet, ps = EntityManager.getByTypeInSystem('planet', K.activeSystemId), sn = snap(ps);
    console.table = (r) => { rows = r; }; console.log = () => {};
    try {
      K.lifeSystem = ls;
      t0 = h.csTemp(); const rows0 = rows;
      l1 = h.csLifeTick(); l2 = h.csLifeTick(); t1 = h.csTemp();
      rows = rows0;
      restore(sn);
      lOff = withFlag(false, () => h.csLifeTick());
    } finally { console.table = origTable; console.log = origLog; delete K.lifeSystem; restore(sn); }
    const hr = (rows ?? []).find(r => r.homeworld === 'player');
    assert(t0 && t0.homeworldsOutOfBand === 0 && Array.isArray(rows) && rows.length === t0.bodies && hr && hr.clamp === '5..35'
      && hr.star.startsWith(EntityManager.getStarOfSystem(K.activeSystemId).name) && hr.nextCheckC === 10
      && rows.every(r => 'name' in r && 'star' in r && 'temperatureC' in r && 'clamp' in r), `T6 csTemp(): ${JSON.stringify(t0)}`);
    assert(l1 && l2 && t1 && l1.homeworlds.length === 1 && l2.homeworlds[0].tempAfter === 10 && l2.homeworlds[0].lifeAfter === 100
      && l1.homeworldsOutOfBand === 0 && t1.homeworldsOutOfBand === 0, `T6 csLifeTick() ×2 → dom ${l2?.homeworlds?.[0]?.tempAfter} °C, csTemp() po: poza pasmem ${t1?.homeworldsOutOfBand}`);
    assert(lOff && lOff.lifeTempOwnStar === false && lOff.homeworldsOutOfBand === 1, `T6 kontrola OFF: csLifeTick() wypycha dom poza pasmo (${lOff?.homeworlds?.[0]?.tempAfter} °C)`);
  }
  const gs = src('../../scenes/GameScene.js');
  assert(gs.includes('window.csTemp       = window.KOSMOS.debug?.csTemp;') && gs.includes('window.csLifeTick   = window.KOSMOS.debug?.csLifeTick;')
    && gs.indexOf('window.csTemp ') > gs.indexOf('window.csArchetypes ='), 'T6 aliasy window.csTemp / window.csLifeTick obok csArchetypes (ścieżka nowej gry i wczytania)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
