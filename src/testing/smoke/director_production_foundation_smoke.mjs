// DIRECTOR SLICE 1 — keeper FUNDAMENTU produkcji okrętów AI (commit S4, workstream C).
//
// PO CO: Ruling 1 z pomiaru S0 nakazuje kolejność OD FUNDAMENTU W GÓRĘ — stempel własności
// i guardy PIERWSZE, zamówienia z szablonów dopiero na nich. Ten keeper pilnuje fundamentu
// i jest **fail-first**: każdy z trzech pinów nośnych sprawdzony WYKONANIEM przez usunięcie
// tego, co ma chronić (dowody w commicie).
//
//   T1  stempel własności działa BEZ filtra po shipId (luka V3c) i nie kradnie cudzych statków
//   T2  ⚠ PIN V3c: okręt bez okna oczekiwania zostaje BEZ właściciela — tak jak dziś w grze
//   T3  brak kolizji ze stemplem logistyki (`pendingBuildRoute` nietknięte, oba równolegle)
//   T4  guardy: stocznia / załoga / stacja orbitalna (R-3) — każdy na obu odpowiedziach
//   T5  ⚠ PIN R-3: bez stacji guard mówi NIE, ze stacją TAK; własność stacji ma znaczenie
//   T6  TTL: zlecenie przeterminowane ZNIKA i zostawia wpis, świeże zostaje
//   T7  sprzężenie ekonomiczne: brakujące komodyty wchodzą w popyt fabryki + tryb reactive
//   T8  GŁOŚNA AWARIA: brak kolaboratora RZUCA (nie degraduje do cichego „nie da się")
//   T9  zdarzenia Directora są w whiteliście DebugLoga (ścieżka audytu AI)

import '../headless/env.js';                 // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import { readFileSync } from 'node:fs';
import { DirectorProduction, ORDER_TTL_DISPLAYED_YEARS, registerProductionGuards }
  from '../../systems/director/DirectorProduction.js';
import { DirectorGuards, _resetDirectorRegistries } from '../../systems/director/DirectorRegistry.js';
import { isEnemyVessel } from '../../entities/Vessel.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

/** Minimalny świat — tylko to, czego dotykają fundamenty. Zero prawdziwego bootu. */
function mkWorld({ year = 100, shipyard = 1, freePops = 10, stations = [], colonies = null, canAffordFlag = true } = {}) {
  const capital = {
    planetId: 'p_cap', isOutpost: false,
    resourceSystem: { getAmount: (id) => (capital._res[id] ?? 0) },
    _res: {},
    civSystem: { freePops },
    // Drzewo techu IMPERIUM — resolver szablonu czyta stąd, nigdy z drzewa gracza.
    techSystem: { isResearched: () => true },
    shipQueues: [],
    pendingShipOrders: [],
    factorySystem: {
      _bonus: new Map(), _mode: 'manual',
      setDemandBonus(id, v) { this._bonus.set(id, v); },
      getSafetyStockTarget(id) { return this._targets?.[id] ?? 0; },
      isKnownCommodity(id) { return String(id).length > 2; },   // Fe/Ti/Cu odpadają (≤2 znaki)
      setMode(m) { this._mode = m; },
    },
    ownerEmpireId: 'emp_001',
  };
  window.KOSMOS = {
    timeSystem: { gameTime: year },
    empireRegistry: { getColoniesByEmpire: (id) => (id === 'emp_001' ? [capital] : []) },
    colonyManager: {
      _getShipyardLevel: () => shipyard,
      getAllColonies: () => colonies ?? [capital],
      // ⚠ Własność jest wyprowadzana STĄD (poprawka po GATE 1) — stanowisko musi
      // odwzorować prawdziwy rejestr kolonii, nie tylko listę stolic.
      getColony: (id) => (id === 'p_cap' ? capital
        : id === 'p_player' ? { planetId: 'p_player' }                    // kolonia GRACZA
        : id === 'p_new' ? { planetId: 'p_new', ownerEmpireId: 'emp_001' } // założona PÓŹNIEJ
        : null),
    },
    stationSystem: { getAllStations: () => stations },
  };
  return { capital };
}

// ── T1 — stempel własności ──────────────────────────────────────────────────
console.log('\nT1: stempel własności bez filtra po shipId');
{
  mkWorld();
  const prod = new DirectorProduction();
  prod.expectVessel('p_cap', 'emp_001', 'frigate_laser_escort');

  const v = { id: 'v_1', shipId: 'hull_frigate', colonyId: 'p_cap' };
  let completed = null;
  EventBus.on('director:shipCompleted', (d) => { completed = d; });
  EventBus.emit('vessel:created', { vessel: v });

  assert(v.ownerEmpireId === 'emp_001', 'T1a: hull_frigate DOSTAJE właściciela (stempel logistyki by go odrzucił)');
  assert(v.owner === 'emp_001' && v.isEnemy === true,
    'T1b: komplet trzech pól — isEnemyVessel czyta owner/ownerEmpireId/isEnemy');
  assert(completed?.vesselId === 'v_1' && completed?.templateId === 'frigate_laser_escort',
    'T1c: emituje director:shipCompleted z szablonem (ślad w DebugLogu)');

  // ⚠ ZMIENIONY KONTRAKT PO GATE 1. Dawniej asertowaliśmy tu, że okno jest JEDNORAZOWE
  // i drugi statek NIE dostaje stempla. To był zapis BŁĘDU, nie własności: przy zamówieniu
  // na N okrętów drugi wychodził ze stoczni bezpański, a `isEnemyVessel` uznaje brak pól
  // za statek GRACZA. Własność jest teraz strukturalna (z kolonii), więc KAŻDY okręt
  // kolonii AI dostaje stempel.
  const v2 = { id: 'v_2', shipId: 'hull_frigate', colonyId: 'p_cap' };
  EventBus.emit('vessel:created', { vessel: v2 });
  assert(v2.ownerEmpireId === 'emp_001',
    'T1d: DRUGI statek z tej samej kolonii też jest stemplowany (dziura (1) z GATE 1 — nadpisanie okna)');
  assert(v2.directorOrigin === undefined,
    'T1e: …ale bez adnotacji szablonu, bo Director zamówił tylko jeden — adnotacja jest '
    + 'diagnostyką, własność nie może od niej zależeć');
  prod.dispose(); EventBus.clear();
}

// ── T2 — własność jest STRUKTURALNA ─────────────────────────────────────────
console.log('\nT2: własność wynika z kolonii-budowniczego, nie z pamięci Directora');
{
  mkWorld();
  const prod = new DirectorProduction();
  // Zero zamówień, zero okien — statek i tak jest własnością imperium, bo zbudowała go
  // JEGO kolonia. To pokrywa ścieżkę pending→queue (dziura (3)): `_tickPendingShipOrders`
  // przenosi zlecenie do stoczni SAM, bez udziału Directora.
  const v = { id: 'v_x', shipId: 'hull_frigate', colonyId: 'p_cap' };
  EventBus.emit('vessel:created', { vessel: v });
  assert(v.ownerEmpireId === 'emp_001' && v.isEnemy === true,
    'T2a: statek kolonii AI dostaje stempel BEZ jakiegokolwiek okna — to zamyka ścieżkę '
    + 'pending→queue, na której zginął okręt z gate\'u');
  assert(isEnemyVessel(v) === true,
    'T2b: …i jest widziany jako WROGI. ⚠ isEnemyVessel to same testy prawdziwościowe: '
    + 'brak pól = statek GRACZA, dlatego bezpański okręt AI trafiał do floty gracza (G1.6)');

  const player = { id: 'v_p', shipId: 'hull_small', colonyId: 'p_player' };
  EventBus.emit('vessel:created', { vessel: player });
  assert(player.ownerEmpireId === undefined,
    'T2c: statek kolonii GRACZA nietknięty (getColony zwraca kolonię bez ownerEmpireId)');
  prod.dispose(); EventBus.clear();
}

// ── T3 — brak kolizji z logistyką ───────────────────────────────────────────
console.log('\nT3: równoległa budowa z logistyką — bez kradzieży stempla');
{
  mkWorld();
  const prod = new DirectorProduction();
  prod.expectVessel('p_cap', 'emp_001', 'frigate_laser_escort');

  // Kurier logistyki: ostemplowany PRZED nami (jej handler też słucha vessel:created).
  const courier = { id: 'v_c', shipId: 'hull_small', colonyId: 'p_cap', ownerEmpireId: 'emp_001' };
  EventBus.emit('vessel:created', { vessel: courier });
  assert(prod._awaitingClaim.has('p_cap'),
    'T3a: cudzy, już ostemplowany statek NIE zużywa naszego okna (fregata wciąż oczekiwana)');

  const frig = { id: 'v_f', shipId: 'hull_frigate', colonyId: 'p_cap' };
  EventBus.emit('vessel:created', { vessel: frig });
  assert(frig.ownerEmpireId === 'emp_001', 'T3b: nasza fregata dostaje stempel mimo kuriera w międzyczasie');

  const src = readFileSync('src/systems/director/DirectorProduction.js', 'utf8');
  assert(!/pendingBuildRoute/.test(src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')),
    'T3c: KOD Directora nie dotyka logi.pendingBuildRoute — osobne klucze, zero interferencji');
  assert(/pendingBuildRoute/.test(readFileSync('src/systems/EmpireLogisticsSystem.js', 'utf8')),
    'T3d: kontrola pinu — pole ISTNIEJE w logistyce, więc T3c nie przechodzi przez pomyłkę');
  prod.dispose(); EventBus.clear();
}

// ── T4/T5 — guardy ──────────────────────────────────────────────────────────
console.log('\nT4/T5: guardy stoczni, załogi i stacji orbitalnej (R-3)');
{
  const station = { id: 'st_1', ownerEmpireId: 'emp_001' };

  mkWorld({ shipyard: 0, stations: [station] });
  let prod = new DirectorProduction();
  assert(prod.hasShipyard('emp_001') === false, 'T4a: stocznia lv0 → guard NIE');
  prod.dispose();

  mkWorld({ shipyard: 2, stations: [station] });
  prod = new DirectorProduction();
  assert(prod.hasShipyard('emp_001') === true, 'T4b: stocznia lv2 → guard TAK');
  assert(prod.hasFreeCrew('emp_001', 4) === true, 'T4c: 10 wolnych POPów ≥ 4 → guard TAK');
  assert(prod.hasFreeCrew('emp_001', 99) === false, 'T4d: 10 wolnych POPów < 99 → guard NIE');
  assert(prod.hasShipyard('emp_999') === false, 'T4e: imperium bez kolonii → guard NIE (bez rzutu)');
  assert(prod.hasOrbitalStation('emp_001') === true, 'T5a: R-3 — stacja imperium obecna → guard TAK');
  prod.dispose();

  mkWorld({ shipyard: 2, stations: [] });
  prod = new DirectorProduction();
  assert(prod.hasOrbitalStation('emp_001') === false,
    'T5b: R-3 — BRAK stacji → guard NIE (żeton uprawnienia nie istnieje)');
  prod.dispose();

  mkWorld({ shipyard: 2, stations: [{ id: 'st_p', ownerEmpireId: 'player' }, { id: 'st_o', ownerEmpireId: 'emp_002' }] });
  prod = new DirectorProduction();
  assert(prod.hasOrbitalStation('emp_001') === false,
    'T5c: CUDZA stacja (gracza / innego imperium) nie uprawnia — własność ma znaczenie');
  assert(prod.hasOrbitalStation('emp_002') === true, 'T5d: …a właściciel swojej stacji jest uprawniony');

  // Rejestracja nazw w rejestrze reguł.
  _resetDirectorRegistries();
  registerProductionGuards(prod);
  for (const n of ['empireHasShipyard', 'empireHasFreeCrew', 'empireHasOrbitalStation']) {
    assert(DirectorGuards.has(n), `T4f/${n}: guard zarejestrowany pod nazwą z katalogu reguł`);
  }
  assert(DirectorGuards.resolve('empireHasOrbitalStation')({ empireId: 'emp_002' }) === true,
    'T4g: rozwiązany z rejestru guard działa na ctx (nie tylko jako metoda)');
  prod.dispose(); EventBus.clear();
}

// ── T6 — TTL ────────────────────────────────────────────────────────────────
console.log('\nT6: TTL zleceń oczekujących');
{
  const { capital } = mkWorld({ year: 100 });
  const prod = new DirectorProduction();
  capital.pendingShipOrders.push({ id: 'pso_1', shipId: 'hull_frigate', cost: {} });
  const order = prod._stampTtl(capital, 'frigate_laser_escort');
  assert(order?.directorExpiryYear === 100 + ORDER_TTL_DISPLAYED_YEARS,
    `T6a: termin = teraz + ${ORDER_TTL_DISPLAYED_YEARS} lat WYŚWIETLANYCH`);

  window.KOSMOS.timeSystem.gameTime = 100 + ORDER_TTL_DISPLAYED_YEARS - 0.1;
  EventBus.emit('time:tick', {});
  assert(capital.pendingShipOrders.length === 1, 'T6b: przed terminem zlecenie CZEKA (sprzężenie ma czas zadziałać)');

  let expired = null;
  EventBus.on('director:orderExpired', (d) => { expired = d; });
  window.KOSMOS.timeSystem.gameTime = 100 + ORDER_TTL_DISPLAYED_YEARS;
  EventBus.emit('time:tick', {});
  assert(capital.pendingShipOrders.length === 0, 'T6c: po terminie zlecenie ZNIKA — nigdy wiecznie wisząca zjawa');
  assert(expired?.templateId === 'frigate_laser_escort' && expired?.shipId === 'hull_frigate',
    'T6d: wygaśnięcie zostawia wpis z szablonem i kadłubem (DebugLog)');

  // Cudze zlecenia (bez naszego znacznika) są nietykalne.
  capital.pendingShipOrders.push({ id: 'pso_alien', shipId: 'hull_small', cost: {} });
  window.KOSMOS.timeSystem.gameTime = 9999;
  EventBus.emit('time:tick', {});
  assert(capital.pendingShipOrders.length === 1,
    'T6e: zlecenie BEZ znacznika Directora przeżywa sweep — nie sprzątamy cudzego');
  prod.dispose(); EventBus.clear();
}

// ── T7 — sprzężenie ekonomiczne ─────────────────────────────────────────────
console.log('\nT7: sprzężenie ekonomiczne — brakujące komodyty w popycie fabryki');
{
  const { capital } = mkWorld();
  const prod = new DirectorProduction();
  capital._res = { structural_alloys: 2, reactive_armor: 0, Fe: 0 };

  let demand = null;
  EventBus.on('director:commodityDemand', (d) => { demand = d; });
  const missing = prod._feedCommodityDemand(
    capital, { structural_alloys: 6, reactive_armor: 4, Fe: 100 }, 'emp_001');

  assert(capital.factorySystem._bonus.get('structural_alloys') === 4,
    'T7a: bonus popytu = LUKA (potrzeba 6 − ma 2), nie cała potrzeba');
  assert(capital.factorySystem._bonus.get('reactive_armor') === 4, 'T7b: druga komodyta też trafia w popyt');
  assert(!capital.factorySystem._bonus.has('Fe'),
    'T7c: surowiec kopalny POMINIĘTY — fabryka go nie produkuje, więc bonus byłby teatrem (na to działa TTL)');
  assert(capital.factorySystem._mode === 'reactive',
    'T7d: tryb przełączony na reactive — bez tego bonus popytu jest martwy (wzór bootstrapu AI)');
  assert(demand?.missing?.length === 2 && demand.empireId === 'emp_001',
    'T7e: emituje director:commodityDemand — intel widzi FAZĘ PIERWSZĄ (przezbrajanie), nie tylko kolejkę');
  assert(missing.length === 2, 'T7f: zwraca listę braków wołającemu');

  // Nic nie brakuje ⇒ zero ingerencji w gospodarkę.
  capital.factorySystem._bonus.clear(); capital.factorySystem._mode = 'manual';
  const none = prod._feedCommodityDemand(capital, { structural_alloys: 1 }, 'emp_001');
  assert(none.length === 0 && capital.factorySystem._mode === 'manual',
    'T7g: gdy stać kolonię — ZERO zmian w fabryce (nie ruszamy cudzej ekonomii bez powodu)');
  prod.dispose(); EventBus.clear();
}

// ── T8 — głośna awaria ──────────────────────────────────────────────────────
console.log('\nT8: brak kolaboratora RZUCA (audyt R12)');
{
  mkWorld();
  const prod = new DirectorProduction();
  delete window.KOSMOS.stationSystem;
  let threw = false;
  try { prod.hasOrbitalStation('emp_001'); } catch { threw = true; }
  assert(threw,
    'T8a: brak stationSystem rzuca — ciche `false` znaczyłoby „imperium nie ma stacji" '
    + 'i R-3 blokowałby produkcję z powodu, którego nikt by nie zobaczył');

  delete window.KOSMOS.empireRegistry;
  let threw2 = false;
  try { prod.capitalOf('emp_001'); } catch { threw2 = true; }
  assert(threw2, 'T8b: brak empireRegistry też rzuca');
  prod.dispose(); EventBus.clear();
}

// ── T9 — ścieżka audytu ─────────────────────────────────────────────────────
console.log('\nT9: zdarzenia Directora w whiteliście DebugLoga');
{
  const dl = readFileSync('src/core/DebugLog.js', 'utf8');
  for (const ev of ['director:shipQueued', 'director:shipRejected', 'director:shipCompleted',
                    'director:commodityDemand', 'director:orderExpired']) {
    assert(dl.includes(`'${ev}'`), `T9a/${ev}: w TRACKED_EVENTS`);
  }
}

// ── T10 — REGRESJA GATE 1 (FAIL na G1.5/G1.6) ───────────────────────────────
console.log('\nT10: REGRESJA GATE 1 — trzy zmierzone drogi utraty właściciela');
{
  // (1) NADPISANIE OKNA: zamówienie na N okrętów, jedna kolonia.
  {
    mkWorld();
    const prod = new DirectorProduction();
    const vs = [1, 2, 3].map((i) => ({ id: `v_${i}`, shipId: 'hull_frigate', colonyId: 'p_cap' }));
    for (const v of vs) EventBus.emit('vessel:created', { vessel: v });
    assert(vs.every((v) => v.ownerEmpireId === 'emp_001'),
      'T10a: (1) WSZYSTKIE trzy okręty jednej kolonii mają właściciela — dawniej najwyżej jeden');
    assert(vs.every((v) => isEnemyVessel(v)), 'T10b: …i żaden nie trafia do floty gracza');
    prod.dispose(); EventBus.clear();
  }

  // (2) KASOWANIE SĄSIADA — dokładny przebieg z gate'u: count:2 przy stoczni na 1 slot.
  //     Pierwszy build przechodzi, drugi jest odrzucany; okręt z pierwszego MUSI przeżyć.
  {
    const { capital } = mkWorld({ shipyard: 1, stations: [{ id: 'st', ownerEmpireId: 'emp_001' }] });
    const prod = new DirectorProduction();
    let calls = 0;
    window.KOSMOS.colonyManager.startShipBuild = () => {
      calls++;
      if (calls === 1) { capital.shipQueues.push({ shipId: 'hull_frigate' }); return { ok: true }; }
      return { ok: false, reason: 'brak wolnego slotu stoczni' };   // realny wynik przy lv1
    };
    const res = prod.queueWarships(
      { empireId: 'emp_001', empire: { archetype: 'industrialist' }, ruleId: 'r' },
      { template: 'frigate_system_defender', count: 2 });
    assert(res.ok === true && res.started === 1,
      `T10c: (2) częściowe powodzenie NIE jest porażką (started=${res.started})`);

    const v = { id: 'v_1', shipId: 'hull_frigate', colonyId: 'p_cap' };
    EventBus.emit('vessel:created', { vessel: v });
    assert(v.ownerEmpireId === 'emp_001',
      'T10d: (2) okręt z UDANEGO zamówienia ma właściciela mimo odrzucenia sąsiada — '
      + 'to jest DOKŁADNIE przebieg, na którym padł GATE 1');
    assert(v.directorOrigin === 'frigate_system_defender',
      'T10e: (2) …i zachowuje adnotację szablonu (sprzątanie po odmowie jej nie zabrało)');
    prod.dispose(); EventBus.clear();
  }

  // (3) ŚCIEŻKA pending→queue: zlecenie czeka na surowce, potem ColonyManager sam je
  //     promuje do stoczni. Director nie bierze w tym udziału — nie ma gdzie otworzyć okna.
  {
    const { capital } = mkWorld({ canAffordFlag: false });
    const prod = new DirectorProduction();
    capital.pendingShipOrders.push({ id: 'pso_1', shipId: 'hull_frigate', cost: {} });
    // …mija czas, ColonyManager promuje zlecenie, statek powstaje. ZERO wiedzy Directora:
    prod._awaitingClaim.clear();
    const v = { id: 'v_late', shipId: 'hull_frigate', colonyId: 'p_cap' };
    EventBus.emit('vessel:created', { vessel: v });
    assert(v.ownerEmpireId === 'emp_001',
      'T10f: (3) okręt z promocji pending→queue ma właściciela — dawniej bezpański Z KONSTRUKCJI');
    prod.dispose(); EventBus.clear();
  }

  // (4) KOLONIA ZAŁOŻONA PÓŹNIEJ niż rejestracja Directora (anomalia (d) ze zgłoszenia).
  {
    mkWorld();
    const prod = new DirectorProduction();
    const v = { id: 'v_new', shipId: 'hull_small', colonyId: 'p_new' };   // p_new nie istniała przy starcie
    EventBus.emit('vessel:created', { vessel: v });
    assert(v.ownerEmpireId === 'emp_001',
      'T10g: (4) kolonia założona PO rejestracji też stempluje — własność czyta rejestr kolonii '
      + 'na żywo, więc nie ma pojęcia „kolonia znana przy starcie"');
    prod.dispose(); EventBus.clear();
  }

  // (5) UTRATA STANU W PAMIĘCI (zapis/wczytanie między zamówieniem a ukończeniem).
  {
    mkWorld();
    const prod = new DirectorProduction();
    prod.expectVessel('p_cap', 'emp_001', 'frigate_system_defender');
    prod._awaitingClaim.clear();                       // ≈ świeża instancja po wczytaniu gry
    const v = { id: 'v_reload', shipId: 'hull_frigate', colonyId: 'p_cap' };
    EventBus.emit('vessel:created', { vessel: v });
    assert(v.ownerEmpireId === 'emp_001',
      'T10h: (5) własność przeżywa utratę CAŁEGO stanu w pamięci — bo nigdy z niego nie wynikała');
    prod.dispose(); EventBus.clear();
  }

  // (6) Kontrola zakresu: nie stemplujemy niczego, co nie należy do imperium.
  {
    mkWorld();
    const prod = new DirectorProduction();
    const orphan = { id: 'v_o', shipId: 'hull_small', colonyId: 'p_nieznana' };
    EventBus.emit('vessel:created', { vessel: orphan });
    assert(orphan.ownerEmpireId === undefined,
      'T10i: (6) statek z kolonii spoza rejestru NIE dostaje stempla (getColony → null)');
    const already = { id: 'v_a', shipId: 'hull_small', colonyId: 'p_cap', ownerEmpireId: 'emp_002' };
    EventBus.emit('vessel:created', { vessel: already });
    assert(already.ownerEmpireId === 'emp_002',
      'T10j: (6) już ostemplowany (np. przez logistykę) nie jest nadpisywany');
    prod.dispose(); EventBus.clear();
  }
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
