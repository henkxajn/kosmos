// DIRECTOR SLICE 1 — keeper AKCJI `queueWarships` (commit S4, workstream C).
//
// PO CO: to jest szczyt piramidy z Rulingu 1 — zamówienie z szablonu STOJĄCE na
// fundamencie (stempel + guardy + sprzężenie). Pilnuje kontraktu, którego GATE 1 dotyka
// w przeglądarce: kolejka rośnie, okręt ma właściciela, brak surowców CZEKA zamiast
// zniknąć, a każda odmowa ma powód w DebugLogu.
//
//   T1  ścieżka szczęśliwa: kolejka stoczni rośnie, statek dostaje właściciela
//   T2  „economy executes" (R-1): brak surowców ⇒ pendingShipOrders + TTL + popyt fabryki
//   T3  ⚠ PIN R-3: bez żetonu stacji akcja ODMAWIA z powodem, a nie po cichu
//   T4  odmowy mają powody: brak stolicy / stoczni / załogi / techu / szablonu
//   T5  liczba sztuk z zakresu jest DETERMINISTYCZNA (przeładowanie nie przewija losu)
//   T6  szablon rozwiązywany drzewem techu IMPERIUM, nie gracza
//   T7  okno stempla nie przecieka przy odmowie budowy

import '../headless/env.js';                 // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import { DirectorProduction } from '../../systems/director/DirectorProduction.js';
import { HULLS } from '../../data/HullsData.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✓ ' + l, ''), fail++; } };
// (celowo prosty assert — pełna diagnostyka niżej przy każdej asercji)
const A = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const PLAYER_TECHS = new Set(['point_defense', 'ion_drives', 'warp_drive', 'exploration']);

/** Stanowisko: stolica AI z regulowanym techem, stocznią, POPami i stanem magazynu. */
function stand({ techs = ['point_defense', 'ion_drives', 'warp_drive'], shipyard = 2, freePops = 20,
                 canAfford = true, stations = [{ id: 'st', ownerEmpireId: 'emp_001' }] } = {}) {
  const tech = new Set(techs);
  const capital = {
    planetId: 'p_cap', isOutpost: false, ownerEmpireId: 'emp_001',
    techSystem: { isResearched: (t) => tech.has(t) },
    resourceSystem: { getAmount: () => 0, canAfford: () => canAfford, spend: () => {} },
    civSystem: { freePops, convertToStrata: () => {}, lockPops: () => {} },
    shipQueues: [], pendingShipOrders: [],
    factorySystem: {
      _bonus: new Map(), _mode: 'manual',
      setDemandBonus(id, v) { this._bonus.set(id, v); },
      getSafetyStockTarget: () => 0,
      isKnownCommodity: (id) => String(id).length > 2,
      setMode(m) { this._mode = m; },
    },
  };
  const built = [];
  window.KOSMOS = {
    timeSystem: { gameTime: 50 },
    empireRegistry: {
      getColoniesByEmpire: (id) => (id === 'emp_001' ? [capital] : []),
      get: (id) => ({ id, archetype: 'industrialist' }),
    },
    colonyManager: {
      _getShipyardLevel: () => shipyard,
      getAllColonies: () => [capital],
      // ⚠ Własność okrętu wyprowadzana jest STĄD (poprawka po GATE 1: stempel strukturalny
      // z kolonii-budowniczego, nie z rejestru oczekiwań). Bez tego stanowisko badałoby
      // świat, w którym kolonie nie mają właścicieli — czyli nie ten, w którym gra działa.
      getColony: (id) => (id === capital.planetId ? capital : null),
      // Wierna imitacja kontraktu startShipBuild: kolejkuje przy braku surowców.
      startShipBuild(planetId, shipId, modules) {
        if (!canAfford) {
          capital.pendingShipOrders.push({
            id: `pso_${capital.pendingShipOrders.length}`, shipId, modules,
            cost: { structural_alloys: 6, reactive_armor: 4, Fe: 100 }, crewCost: HULLS[shipId]?.crewCost ?? 0,
          });
          return { ok: true, queued: true };
        }
        capital.shipQueues.push({ shipId, modules, progress: 0 });
        built.push({ shipId, modules });
        return { ok: true };
      },
    },
    stationSystem: { getAllStations: () => stations },
  };
  return { capital, built };
}

const ctx = { empireId: 'emp_001', empire: { archetype: 'industrialist' }, ruleId: 'military_pressure_l1' };

// ── T1 — ścieżka szczęśliwa ─────────────────────────────────────────────────
console.log('\nT1: kolejka rośnie, okręt dostaje właściciela');
{
  const { capital } = stand();
  const prod = new DirectorProduction();
  let queuedEv = null;
  EventBus.on('director:shipQueued', (d) => { queuedEv = d; });

  const res = prod.queueWarships(ctx, { template: 'frigate_system_defender', count: 2 });
  A(res.ok === true, `T1a: akcja OK (${res.reason ?? 'ok'})`);
  A(capital.shipQueues.length === 2, `T1b: kolejka stoczni = 2 (jest ${capital.shipQueues.length})`);
  A(capital.shipQueues[0].shipId === 'hull_frigate', 'T1c: kadłub z resolvera = hull_frigate');
  A(capital.shipQueues[0].modules.length === 4, 'T1d: cztery moduły (1P + 3U) przekazane do stoczni');
  A(queuedEv?.templateId === 'frigate_system_defender' && queuedEv.started === 2,
    'T1e: director:shipQueued niesie szablon i licznik (ścieżka audytu)');

  // Okręt wychodzi ze stoczni → stempel własności (fundament).
  const v = { id: 'v_1', shipId: 'hull_frigate', colonyId: 'p_cap' };
  EventBus.emit('vessel:created', { vessel: v });
  A(v.ownerEmpireId === 'emp_001', 'T1f: gotowy okręt MA właściciela — nie trafi do floty gracza');
  prod.dispose(); EventBus.clear();
}

// ── T2 — economy executes ───────────────────────────────────────────────────
console.log('\nT2: brak surowców ⇒ zlecenie CZEKA + sprzężenie ekonomiczne (R-1/Ruling 2)');
{
  const { capital } = stand({ canAfford: false });
  const prod = new DirectorProduction();
  let demand = null;
  EventBus.on('director:commodityDemand', (d) => { demand = d; });

  const res = prod.queueWarships(ctx, { template: 'frigate_system_defender', count: 2 });
  A(res.ok === true && res.queued === 2, `T2a: dwa zlecenia CZEKAJĄ (queued=${res.queued})`);
  A(capital.shipQueues.length === 0, 'T2b: kolejka stoczni pusta — nic nie zniknęło, nic nie ruszyło');
  A(capital.pendingShipOrders.length === 2, 'T2c: oba zlecenia w pendingShipOrders (intel ma co oglądać)');
  A(capital.pendingShipOrders.every((o) => o.directorExpiryYear === 53),
    'T2d: każde ostemplowane TTL = 50 + 3 lata wyświetlane');
  A(capital.factorySystem._bonus.get('structural_alloys') === 6,
    'T2e: brakująca komodyta weszła w POPYT fabryki (sprzężenie, nie ślepe czekanie)');
  A(!capital.factorySystem._bonus.has('Fe'),
    'T2f: surowiec kopalny pominięty — fabryka go nie produkuje (na to jest TTL)');
  A(capital.factorySystem._mode === 'reactive', 'T2g: fabryka przełączona w tryb reactive');
  A(demand?.missing?.length === 2, 'T2h: director:commodityDemand — intel widzi FAZĘ PIERWSZĄ');
  prod.dispose(); EventBus.clear();
}

// ── T3 — PIN R-3 ────────────────────────────────────────────────────────────
console.log('\nT3: PIN R-3 — bez żetonu stacji akcja ODMAWIA z powodem');
{
  const { capital } = stand({ stations: [] });
  const prod = new DirectorProduction();
  let rejected = null;
  EventBus.on('director:shipRejected', (d) => { rejected = d; });

  const res = prod.queueWarships(ctx, { template: 'frigate_system_defender', count: 2 });
  A(res.ok === false && res.reason === 'no_orbital_station',
    `T3a: odmowa z powodem no_orbital_station (jest ${res.reason})`);
  A(capital.shipQueues.length === 0 && capital.pendingShipOrders.length === 0,
    'T3b: NIC nie trafiło do produkcji — żeton naprawdę bramkuje');
  A(rejected?.reason === 'no_orbital_station',
    'T3c: odmowa zostawia wpis w DebugLogu — „nie ma stacji" jest ODRÓŻNIALNE od „reguła nie odpaliła"');

  // Ten sam świat + żeton ⇒ produkcja rusza (druga połowa pinu).
  window.KOSMOS.stationSystem = { getAllStations: () => [{ id: 'st', ownerEmpireId: 'emp_001' }] };
  const res2 = prod.queueWarships(ctx, { template: 'frigate_system_defender', count: 1 });
  A(res2.ok === true && capital.shipQueues.length === 1,
    'T3d: z żetonem produkcja PŁYNIE — bramka jest odwracalna, nie trwała');
  prod.dispose(); EventBus.clear();
}

// ── T4 — powody odmów ───────────────────────────────────────────────────────
console.log('\nT4: każda odmowa ma powód');
{
  const cases = [
    ['no_shipyard',   { shipyard: 0 }],
    ['no_hull',       { techs: ['ion_drives'] }],          // brak point_defense ⇒ kadłub niedostępny
  ];
  for (const [expected, opts] of cases) {
    stand(opts);
    const prod = new DirectorProduction();
    const res = prod.queueWarships(ctx, { template: 'frigate_system_defender', count: 1 });
    A(res.ok === false && res.reason === expected,
      `T4/${expected}: odmowa z właściwym powodem (jest ${res.reason})`);
    prod.dispose(); EventBus.clear();
  }

  // ⚠ W2-4 — ŚWIADOME ODWRÓCENIE. `no_crew` PRZESTAŁ być powodem odmowy przy BUDOWIE:
  //    P4 przeniósł koszt załogi z budowy na ROZMIESZCZENIE (decyzja 13), więc stolica
  //    z zerem wolnych POPów ma prawo postawić kadłub — zapłaci dopiero, gdy go obsadzi.
  {
    const { capital } = stand({ freePops: 0 });
    const prod = new DirectorProduction();
    const res = prod.queueWarships(ctx, { template: 'frigate_system_defender', count: 1 });
    A(res.ok === true,
      `T4/no_crew ODWRÓCONE: stolica z freePops=0 BUDUJE (ok=${res.ok}, reason=${res.reason ?? '—'})`);
    A((capital.shipQueues.length + capital.pendingShipOrders.length) === 1,
      'T4/no_crew: zlecenie realnie weszło do produkcji — odmowa nie przeniosła się cicho gdzie indziej');
    // KONTROLA PINU: sam predykat NIE zniknął — zmienił szczebel. To on bramkuje mobilizację
    // (guard `empireHasFreeCrew`, regułę dostaje w W2-7); gdyby go skasowano, W2-7 nie miałby czym bramkować.
    A(prod.hasFreeCrew('emp_001', 1) === false,
      'T4/no_crew KONTROLA: `hasFreeCrew` żyje dalej i nadal widzi brak POPów — jako bramka MOBILIZACYJNA');
    prod.dispose(); EventBus.clear();
  }
  stand();
  const prod = new DirectorProduction();
  A(prod.queueWarships(ctx, { template: 'nie_ma_takiego', count: 1 }).reason === 'unknown_template',
    'T4/unknown_template: nieznany szablon też ma powód');
  A(prod.queueWarships({ empireId: 'emp_999' }, { template: 'frigate_system_defender' }).reason === 'no_capital',
    'T4/no_capital: imperium bez stolicy dostaje powód STRUKTURALNY, nie „brak stacji" — '
    + 'reason odtwarza realną ścieżkę decyzyjną (braki strukturalne przed bramką polityczną R-3)');
  prod.dispose(); EventBus.clear();
}

// ── T5 — determinizm liczby sztuk ───────────────────────────────────────────
console.log('\nT5: liczba sztuk z zakresu jest deterministyczna');
{
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const { capital } = stand();
    const prod = new DirectorProduction();
    prod.queueWarships(ctx, { template: 'frigate_system_defender', count: [2, 3] });
    runs.push(capital.shipQueues.length);
    prod.dispose(); EventBus.clear();
  }
  A(runs[0] === runs[1] && runs[1] === runs[2],
    `T5a: trzy przebiegi z tym samym kluczem dają tę samą liczbę (${runs.join(', ')}) — `
    + 'przeładowanie zapisu nie przewija losu');
  A(runs[0] >= 2 && runs[0] <= 3, `T5b: wynik mieści się w zakresie [2,3] (jest ${runs[0]})`);

  stand();
  const prod = new DirectorProduction();
  const other = prod._pickCount([2, 3], { ...ctx, empireId: 'emp_777' }, 'frigate_system_defender');
  A(other >= 2 && other <= 3, 'T5c: inne imperium też w zakresie (własny strumień klucza)');
  prod.dispose(); EventBus.clear();
}

// ── T6 — tech imperium, nie gracza ──────────────────────────────────────────
console.log('\nT6: szablon rozwiązywany drzewem techu IMPERIUM');
{
  const { capital } = stand({ techs: ['ion_drives'] });         // imperium BEZ point_defense
  window.KOSMOS.techSystem = { isResearched: (t) => PLAYER_TECHS.has(t) };  // gracz MA wszystko
  const prod = new DirectorProduction();
  const res = prod.queueWarships(ctx, { template: 'frigate_system_defender', count: 1 });
  A(res.ok === false && res.reason === 'no_hull',
    'T6a: drzewo GRACZA nie ratuje imperium — odmowa mimo że gracz ma point_defense');

  capital.techSystem = null;
  A(prod.queueWarships(ctx, { template: 'frigate_system_defender' }).reason === 'no_empire_tech',
    'T6b: brak per-imperium techSystem = jawny powód, NIE cichy fallback na drzewo gracza');
  prod.dispose(); EventBus.clear();
}

// ── T7 — okno stempla nie przecieka ─────────────────────────────────────────
console.log('\nT7: okno stempla nie przecieka przy odmowie budowy');
{
  const { capital } = stand();
  const prod = new DirectorProduction();
  window.KOSMOS.colonyManager.startShipBuild = () => ({ ok: false, reason: 'cokolwiek' });
  const res = prod.queueWarships(ctx, { template: 'frigate_system_defender', count: 1 });
  A(res.ok === false && res.reason === 'build_refused', 'T7a: odmowa stoczni → build_refused');
  A(prod._awaitingClaim.size === 0,
    'T7b: okno oczekiwania ZAMKNIĘTE — inaczej następny cudzy statek z tej kolonii dostałby '
    + 'nasz stempel i gracz zobaczyłby wrogi okręt bez powodu');
  prod.dispose(); EventBus.clear();
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
