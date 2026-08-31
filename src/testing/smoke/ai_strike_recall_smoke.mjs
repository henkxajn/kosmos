// Z2 — keeper: RAJDER AI PRZESTAJE BYC STALA BAZA WYSUNIETA („AI wraca po ataku").
// Plan + podpisane decyzje D-Z2-1..D-Z2-10 (2026-08-31): docs/design/AI_RECALL_PLAN.md.
//
// PO CO: po uderzeniu okret AI zostawal na orbicie planety GRACZA z `mission=null`,
//   `movementOrder=null` (VO-3b) i `pendingOrder=null` — czyli spelnial WSZYSTKIE warunki
//   `DirectorOffensive.strikeReadyVessels`. Skutek ZMIERZONY (plan §2, Pomiar 3):
//     • drugie i kazde kolejne uderzenie ladowalo w TEJ SAMEJ CHWILI, w ktorej zapadala
//       decyzja (rajder stal 0 AU od celu) — ostrzezenie 0,0 roku zamiast 5,1;
//     • miedzy uderzeniami trzymal orbite gracza: `SystemPoolService._hostileWarshipInOrbit`
//       zrywal pule hubu orbitalnego, a `EnemyAttackHandler:93-98` doliczal go do KAZDEJ
//       nastepnej bitwy (rosnacy stos bojowy bez budowania czegokolwiek);
//     • `war:peaceSigned` ma ZERO konsumentow ⇒ okupacja przezywala POKOJ.
//
// ⚠ POMIAR ZMIENIL PROJEKT, NIE POTWIERDZIL GO. Z2 NIE jest slicem o tempie: wiazacym
//   ograniczeniem jest `strike_player_target.cooldown = 5.0`, wiec powrot krotszy niz cooldown
//   jest w kadencji NIEWIDOCZNY. Realna szkoda to BRAK DOLOTU i TRWALA OKUPACJA.
//
// ⚠ NAIWNA NAPRAWA JEST GORSZA OD DEFEKTU — pinuje to T5. Sam skok do domu zostawia rajdera
//   na obrzezach (30 AU, `dockedAt=null`) z NIEWYCZYSZCZONA misja `interstellar_jump`
//   (`VesselManager._tickInterstellar:2729-2736`) ⇒ wypada z KAZDEJ puli. Powrot MUSI miec
//   drugi odcinek i stan koncowy.
//
// ⚠ GRANICA SLICE'U — T8 PINUJE JA WPROST (D-Z2-6). `EnemyAttackHandler:240-246` jest
//   NIETKNIETY: dalej dokuje rajdera przy planecie gracza. Zamiatacz skraca to okno do
//   <= 1 roku wyswietlanego, ale nie likwiduje samego zapisu. Zielony keeper NIE znaczy,
//   ze EAH przestal parkowac.
//
// ⚠ KEEPER WYKONANIOWY. `OrderService`, `DirectorOffensive`, `DirectorRecall`,
//   `MovementOrderSystem` i `DeepSpaceCombatSystem` importuja sie headless (dowiedzione
//   sondami A-F planu). Tam, gdzie pinuje ZRODLO, robi to na kodzie BEZ komentarzy.
//
//   T1  filtr puli: rajder poza domem NIE jest materialem na uderzenie
//   T2  ZAMIATACZ: siedem PROWENIENCJI parkowania, jeden konsument (D-Z2-1)
//   T3  akcja nie wyciaga nikogo z AKTYWNEGO starcia (D-Z2-5 — predykat REUZYTY)
//   T4  akcja omija zajetych: misja / rozkaz / composite / kurier / rezerwa / okno EAH
//   T5  PIN OBALAJACY NAIWNA NAPRAWE: sam skok = brick; pelny composite = stan pelnoprawny
//   T6  brak stolicy ⇒ prawdomowna odmowa `no_capital`, statek NIETKNIETY (D-Z2-10)
//   T7  kill-switch `aiStrikeRecall` OFF ⇒ zachowanie sprzed slice'u bit w bit
//   T8  PIN GRANICY: EnemyAttackHandler nietkniety (D-Z2-6)
//   T9  katalog: `delay: 0` + regula bez `roll` MA `cooldown` (decyzja 11 katalogu)
//   T10 UZASADNIENIE D-Z2-4: pula uderzeniowa i zamiatacz sa ROZLACZNE ⇒ wynik nie zalezy
//       od kolejnosci kluczy w `DIRECTOR_RULES`

import '../headless/env.js';           // MUSI byc pierwszy
import EntityManager from '../../core/EntityManager.js';
import { OrderService } from '../../systems/OrderService.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { DirectorOffensive } from '../../systems/director/DirectorOffensive.js';
import { DIRECTOR_RULES } from '../../data/DirectorRuleData.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { VesselManager } from '../../systems/VesselManager.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const EMP  = 'emp_001';
const CAP  = 'p_ai_cap';        // stolica AI          (sys_ai)
const TGT  = 'p_player';        // planeta gracza      (sys_home)
const NEU  = 'p_neutral';       // cialo niczyje       (sys_home)

// `DirectorRecall` jeszcze nie istnieje przy pomiarze fail-first — import dynamiczny, a JEGO
// OBECNOSC jest ASERCJA (nie cichym `?.`). Inaczej literowka w nazwie pliku dawalaby po
// naprawie zielony, jalowy przebieg.
const RecallMod = await import('../../systems/director/DirectorRecall.js').catch(() => null);

// ── Fixture ─────────────────────────────────────────────────────────────────
// Ksztalt WZIETY Z PRODUKCJI: `modules` to tablica ID (string[]) — `hasWeapons` czyta
// `SHIP_MODULES[modId]`. Obiekty zamiast stringow po cichu wypadaja z walki jako „unarmed".
const mkRaider = (id, over = {}) => ({
  id, name: id, shipId: 'hull_frigate',
  ownerEmpireId: EMP, owner: EMP,
  isWreck: false, serviceState: 'active', status: 'idle',
  systemId: 'sys_home',
  colonyId: CAP, homeColonyId: CAP,
  modules: ['weapon_laser', 'engine_warp', 'warp_tank'],
  hp: 100, maxHp: 100, shield: 0, armor: 0, speedAU: 6.2,
  warpFuel: { current: 0, max: 5, consumption: 0.125 },
  fuel: { current: 20, max: 20, consumption: 0.007 },
  mission: null, movementOrder: null, pendingOrder: null, missionLog: [],
  position: { state: 'orbiting', dockedAt: TGT, x: 110, y: 0 },
  ...over,
});

function mkWorld({ recallFlag = true, withCapital = true, vessels: extra = [] } = {}) {
  GAME_CONFIG.FEATURES.aiStrikeRecall = recallFlag;

  EntityManager.clear();
  EntityManager.add({ id: CAP, name: 'Stolica AI',  type: 'planet', systemId: 'sys_ai',   x: 110, y: 0 });
  EntityManager.add({ id: TGT, name: 'Dom gracza',  type: 'planet', systemId: 'sys_home', x: 110, y: 0 });
  EntityManager.add({ id: NEU, name: 'Skala',       type: 'planet', systemId: 'sys_home', x: 400, y: 0 });

  const vessels = new Map();
  for (const v of extra) vessels.set(v.id, v);

  const vm = {
    _vessels: vessels,
    getVessel: (id) => vessels.get(id),
    getAllVessels: () => [...vessels.values()],
    _findEntity: (id) => EntityManager.get(id),
    _predictPosition: (id) => EntityManager.get(id) ?? { x: 0, y: 0 },
    _calcRoute: (sx, sy, tx, ty) => ({ waypoints: [], totalDist: Math.hypot(tx - sx, ty - sy) }),
    isImmobilized: () => false,
  };
  // Prawdziwy dyspozytor skoku — to on jest kontraktem pierwszego odcinka powrotu.
  vm.dispatchInterstellar = VesselManager.prototype.dispatchInterstellar.bind(vm);

  window.KOSMOS = {
    vesselManager: vm,
    timeSystem: { gameTime: 40 },
    empireRegistry: { get: () => ({ id: EMP }), listAll: () => [{ id: EMP }] },
    directorProduction: { capitalOf: () => (withCapital ? { planetId: CAP } : null) },
    colonyManager: { getPlayerColonies: () => [{ planetId: TGT }], getColony: () => null },
    influenceMap:  { isClaimedBy: () => false, isInBorderZone: () => true },
    territoryService: { getSystemDevScore: () => 5 },
    warSystem: { getWarWith: () => ({ active: true }) },
    enemyAttackHandler: { _pendingBattles: new Map() },
    galaxyData: { seed: 'z2', systems: [
      { id: 'sys_ai',   name: 'Dom AI',    x: 0, y: 0, z: 0 },
      { id: 'sys_home', name: 'Dom gracza', x: 5, y: 0, z: 0 },
    ] },
  };

  const mos = new MovementOrderSystem(vm);
  window.KOSMOS.movementOrderSystem = mos;
  const dscs = new DeepSpaceCombatSystem(vm);
  window.KOSMOS.deepSpaceCombatSystem = dscs;
  const os = new OrderService();
  window.KOSMOS.orderService = os;

  const off = new DirectorOffensive();
  window.KOSMOS.directorOffensive = off;
  const recall = RecallMod?.DirectorRecall ? new RecallMod.DirectorRecall() : null;
  window.KOSMOS.directorRecall = recall;

  return { vm, mos, dscs, os, off, recall, vessels };
}

/** Zamiatacz — istnienie jest ASERCJA, nie cichym `?.` (patrz komentarz przy imporcie). */
function stranded(w, empireId = EMP) {
  const fn = w.recall?.strandedWarshipsAwayFromHome;
  assert(typeof fn === 'function',
    'PRE: `DirectorRecall.strandedWarshipsAwayFromHome` istnieje (D-Z2-1 — zamiatacz)');
  return typeof fn === 'function' ? fn.call(w.recall, empireId).map(v => v.id) : [];
}

// ═══ T1 — filtr puli (D-Z2-4) ══════════════════════════════════════════════
console.log('T1 — rajder POZA ukladem macierzystym nie jest materialem na uderzenie');
{
  const away = mkRaider('v_away');                                        // orbituje planete GRACZA
  const home = mkRaider('v_home', { systemId: 'sys_ai', position: { state: 'orbiting', dockedAt: CAP, x: 110, y: 0 } });
  const w = mkWorld({ vessels: [away, home] });
  const pool = w.off.strikeReadyVessels(EMP).map(v => v.id);

  assert(pool.includes('v_home'),
    'T1 kontrola pinu: rajder przy WLASNEJ stolicy JEST w puli (inaczej filtr zabilby ofensywe)');
  assert(!pool.includes('v_away'),
    'T1: rajder zaparkowany przy planecie GRACZA NIE jest w puli (fail-first: JEST — to jest Z2)');
}

console.log('T1b — odmowa jest PRAWDOMOWNA: `no_hull_at_home`, nie `no_warp_capable_hull`');
{
  const w = mkWorld({ vessels: [mkRaider('v_away')] });
  const res = w.off.launchStrike({ empireId: EMP, year: 40 });
  assert(res.launched === 0, 'T1b: uderzenie z pozycji wysunietej sie NIE odbywa');
  assert(res.reason === 'no_hull_at_home',
    `T1b: powod odmowy nazywa STAN SWIATA (dostalem: ${res.reason})`);

  // Kontrola pinu: odmowa NIE jest uniwersalna — kadlub w domu dalej uderza. Bez tego
  // „naprawa" polegajaca na zablokowaniu ofensywy AI w calosci swiecilaby na zielono.
  const wHome = mkWorld({ vessels: [mkRaider('v_h', {
    systemId: 'sys_ai', position: { state: 'orbiting', dockedAt: CAP, x: 110, y: 0 },
  })] });
  const resHome = wHome.off.launchStrike({ empireId: EMP, year: 40 });
  assert(resHome.launched === 1,
    `T1b kontrola pinu: kadlub W DOMU dalej uderza (dostalem launched=${resHome.launched}, reason=${resHome.reason})`);
}

// ═══ T2 — ZAMIATACZ: siedem prowieniencji, jeden konsument (D-Z2-1) ════════
console.log('T2 — zamiatacz widzi WSZYSTKIE siedem ksztaltow „okret AI stoi poza domem"');
{
  // Kazdy wiersz modeluje INNEGO producenta z planu §1.2 i rozni sie polami, ktore czyta
  // predykat (`position.state`, `dockedAt`, `status`) — inaczej siedem asercji bylo by jedna.
  const shapes = [
    ['v_p1', { position: { state: 'orbiting', dockedAt: TGT,  x: 110, y: 0 }, status: 'idle' }],       // 1. EAH: wygrana orbitalna
    ['v_p2', { position: { state: 'orbiting', dockedAt: null, x: 900, y: 30 }, status: 'idle' }],      // 2. DSCS: remis / rozejscie
    ['v_p3', { position: { state: 'orbiting', dockedAt: NEU,  x: 400, y: 0 }, status: 'idle' }],       // 3. odwrot na cialo NICZYJE
    ['v_p4', { position: { state: 'orbiting', dockedAt: TGT,  x: 110, y: 0 }, status: 'on_mission' }], // 4. odwrot na cialo GRACZA (tier FOREIGN)
    ['v_p5', { position: { state: 'orbiting', dockedAt: null, x: 700, y: 0 }, status: 'on_mission' }], // 5. anulowany rozkaz w locie
    ['v_p6', { position: { state: 'docked',   dockedAt: TGT,  x: 110, y: 0 }, status: 'idle' }],       // 6. stary zapis (zadokowany obco)
    ['v_p7', { position: { state: 'orbiting', dockedAt: null, x: 250, y: 90 }, status: 'idle' }],      // 7. spawn debugowy
  ].map(([id, over]) => mkRaider(id, over));

  const atHome = mkRaider('v_athome', {
    systemId: 'sys_ai', position: { state: 'orbiting', dockedAt: CAP, x: 110, y: 0 },
  });

  const w = mkWorld({ vessels: [...shapes, atHome] });
  const got = stranded(w);

  for (const v of shapes) {
    assert(got.includes(v.id), `T2: prowieniencja ${v.id} policzona przez zamiatacz`);
  }
  assert(!got.includes('v_athome'),
    'T2 kontrola pinu: rajder W DOMU nie jest zamiatany (inaczej AI zawracaloby wlasny garnizon)');
  assert(got.length === shapes.length,
    `T2 kontrola pinu: dokladnie ${shapes.length} wierszy, zero jalowej pustki (dostalem ${got.length})`);
}

// ═══ T3 — nie wyciagamy nikogo z AKTYWNEGO starcia (D-Z2-5) ════════════════
console.log('T3 — statek w TRWAJACYM starciu jest dla zamiatacza niewidoczny');
{
  const raider = mkRaider('v_fight', { position: { state: 'orbiting', dockedAt: null, x: 500, y: 0 } });
  const mine = {
    ...mkRaider('v_me', { position: { state: 'orbiting', dockedAt: null, x: 501, y: 0 } }),
    ownerEmpireId: undefined, owner: 'player',
  };
  // ⚠ SWIADEK NIE-JALOWOSCI. Bez drugiego rajdera „w trakcie starcia nikogo nie zamiatamy"
  //   przechodzi trywialnie takze wtedy, gdy zamiatacz jest MARTWY (pusta lista == pusta lista).
  //   Zmierzone: pierwszy przebieg fail-first mial tu falszywa zielen.
  const bystander = mkRaider('v_watch', { position: { state: 'orbiting', dockedAt: NEU, x: 400, y: 0 } });
  const w = mkWorld({ vessels: [raider, mine, bystander] });

  assert(stranded(w).includes('v_fight'),
    'T3 kontrola pinu: przed walka rajder JEST zamiatany (inaczej reszta T3 jalowa)');

  const enc = w.dscs.startEngagement(mine.id, raider.id);
  assert(!!enc, 'T3 kontrola pinu: starcie realnie powstalo');
  const during = stranded(w);
  assert(during.includes('v_watch') && !during.includes('v_fight'),
    'T3: w starciu rajder znika z zamiatacza, a POSTRONNY zostaje (reuzyty `_findActiveEncounterContaining`)');

  enc.isActive = false;                                   // starcie domkniete
  raider.mission = null; raider.movementOrder = null; delete raider._suspendedMission;
  assert(stranded(w).includes('v_fight'),
    'T3 kontrola pinu: po domknieciu starcia rajder wraca pod zamiatacz');
}

// ═══ T4 — zamiatacz omija zajetych ═════════════════════════════════════════
console.log('T4 — zajety okret nie jest zamiatany (misja / rozkaz / composite / rola / rezerwa / okno EAH)');
{
  const cases = [
    ['v_mission',  { mission: { type: 'attack', targetId: TGT } },            'ma zywa misje'],
    ['v_order',    { movementOrder: { id: 'mo_1', status: 'active' } },       'jest pod rozkazem (np. trwajacy odwrot)'],
    ['v_pending',  { pendingOrder: { kind: 'attack', targetSystemId: 'sys_home' } }, 'ma composite w toku'],
    ['v_courier',  { modules: ['engine_warp', 'warp_tank'] },                 'jest KURIEREM (bez broni — wlasna sciezka)'],
    ['v_reserve',  { serviceState: 'stored' },                                'siedzi w REZERWIE'],
  ].map(([id, over, why]) => [mkRaider(id, over), why]);

  const batched = mkRaider('v_batched');
  const clean   = mkRaider('v_clean');
  const w = mkWorld({ vessels: [...cases.map(([v]) => v), batched, clean] });
  // Okno batchowania EAH (500 ms realnych) — ryzyko R1 planu: zamiatacz nie moze odeslac
  // statku, ktory wlasnie przylecial i czeka na WLASNA bitwe.
  window.KOSMOS.enemyAttackHandler._pendingBattles.set(TGT, { arrivedVesselIds: new Set([batched.id]) });

  const got = stranded(w);
  // ⚠ KAZDA asercja wymaga OBECNOSCI swiadka `v_clean`. Bez tego „pomijamy X" przechodzi
  //   trywialnie na MARTWYM zamiataczu — zmierzone w pierwszym przebiegu fail-first
  //   (szesc falszywych zielonych obok jednej czerwonej kontroli pinu).
  const alive = got.includes('v_clean');
  assert(alive, 'T4 kontrola pinu: wolny rajder JEST zamiatany (swiadek nie-jalowosci)');
  for (const [v, why] of cases) {
    assert(alive && !got.includes(v.id), `T4: pomijamy ${v.id} — ${why}`);
  }
  assert(alive && !got.includes('v_batched'),
    'T4: pomijamy statek w oknie batchowania EAH (ryzyko R1 planu)');
}

// ═══ T5 — PIN OBALAJACY NAIWNA NAPRAWE ═════════════════════════════════════
console.log('T5 — sam skok = BRICK; pelny composite = stan pelnoprawny');
{
  const raider = mkRaider('v_ret');
  const w = mkWorld({ vessels: [raider] });

  // (a) BRICK — dokladnie to, co zostawia `VesselManager._tickInterstellar:2729-2736`.
  const brick = mkRaider('v_brick', {
    systemId: 'sys_ai', status: 'on_mission',
    position: { state: 'orbiting', dockedAt: null, x: 3300, y: 0 },   // 30 AU od gwiazdy
    mission: { type: 'interstellar_jump', toSystemId: 'sys_ai', phase: 'in_system' },
  });
  w.vessels.set(brick.id, brick);
  assert(!w.off.strikeReadyVessels(EMP).map(v => v.id).includes('v_brick'),
    'T5(a): po SAMYM skoku rajder wypada z puli uderzeniowej — naiwna naprawa jest gorsza od defektu');
  w.vessels.delete(brick.id);

  // (b) ODCINEK 1 — rozkaz powrotu. Istnienie API jest ASERCJA.
  const hasApi = typeof w.os.issueRecall === 'function';
  assert(hasApi, 'PRE: `OrderService.issueRecall` istnieje (D-Z2-1, mechanizm w JEDYNYM orkiestratorze)');
  const r1 = hasApi ? w.os.issueRecall(raider.id, { homeSystemId: 'sys_ai', capitalBodyId: CAP }) : { ok: false };
  assert(r1.ok === true, `T5(b): rozkaz powrotu przyjety (reason=${r1.reason ?? '—'})`);
  assert(raider.pendingOrder?.kind === 'recall',
    'T5(b): composite oznaczony jako `recall` (czwarty rodzaj obok transport/passenger/attack)');
  assert(raider.mission?.type === 'interstellar_jump',
    'T5(b): pierwszy odcinek to PRAWDZIWY skok (dispatchInterstellar), nie teleport');

  // Dalsze odcinki maja sens tylko wtedy, gdy pierwszy ruszyl. Fail-first ma DOJSC DO KONCA
  // i policzyc uczciwie — nie wywrocic sie na `null.phase` (pierwszy przebieg tak zrobil).
  if (r1.ok === true && raider.mission) {
    // (c) ODCINEK 2 — przylot do wlasnego ukladu. `_tickInterstellar` ustawia systemId i pozycje
    //     na obrzezach, po czym `interstellar:arrived` wchodzi w `_maybeDeliver`. Odtwarzamy te
    //     trzy pola i wolamy PRODUKCYJNY `_maybeDeliver` — to on wydaje drugi odcinek.
    raider.systemId = 'sys_ai';
    raider.position.state = 'orbiting';
    raider.position.dockedAt = null;
    raider.position.x = 3300; raider.position.y = 0;
    raider.mission.phase = 'in_system';
    w.os._maybeDeliver(raider.id);

    assert(raider.pendingOrder === null, 'T5(c): composite domkniety (bez lepkiego `pendingOrder`)');
    assert(raider.mission?.type === 'move_to_point' && raider.mission?.targetId === CAP,
      'T5(c): drugi odcinek celuje w CIALO STOLICY (wzor DirectorDoctrine._holdAtHome)');
  } else {
    assert(false, 'T5(c): composite domkniety (bez lepkiego `pendingOrder`) — odcinek 1 nie ruszyl');
    assert(false, 'T5(c): drugi odcinek celuje w CIALO STOLICY — odcinek 1 nie ruszyl');
  }

  // (d) PRZYLOT — `VesselManager._updatePositions:2471-2473` snapuje pozycje i dokuje orbite;
  //     tu odtwarzamy te trzy linie (pin zrodlowy nizej), a pinujemy SKUTEK POOLOWY.
  if (raider.mission?.type === 'move_to_point') {
    raider.position.state = 'orbiting';
    raider.position.dockedAt = raider.mission.targetId;
    raider.position.x = 110; raider.position.y = 0;
    w.mos._onVesselArrived(raider, raider.mission);
  }
  assert(raider.position.dockedAt === CAP && raider.mission === null && raider.movementOrder === null,
    'T5(d): rozkaz domkniety i ZWOLNIONY (VO-3b)');
  assert(raider.position.dockedAt === CAP && w.off.strikeReadyVessels(EMP).map(v => v.id).includes('v_ret'),
    'T5(d): rajder po powrocie stoi przy stolicy i JEST znowu materialem na uderzenie — powrot nie rozbraja AI');
  assert(raider.position.dockedAt === CAP && !stranded(w).includes('v_ret'),
    'T5(d): i przestaje byc zamiatany (petla sie domyka, brak wiecznego zawracania)');

  const vmSrc = readFileSync(new URL('../../systems/VesselManager.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert(/position\.dockedAt\s*=\s*foreignBody\s*\?\s*null\s*:\s*m\.targetId/.test(vmSrc),
    'T5 kontrola pinu (zrodlo): przylot NAPRAWDE dokuje orbite do `mission.targetId` — symulacja (d) nie zmysla');
}

// ═══ T6 — brak stolicy (D-Z2-10) ═══════════════════════════════════════════
console.log('T6 — imperium bez stolicy: prawdomowna odmowa, statek NIETKNIETY');
{
  const raider = mkRaider('v_orphan');
  const w = mkWorld({ vessels: [raider], withCapital: false });
  const fn = w.recall?.recallVessels;
  assert(typeof fn === 'function', 'PRE: `DirectorRecall.recallVessels` istnieje');
  const refusals = [];
  const { default: EventBus } = await import('../../core/EventBus.js');
  const onRefuse = (p) => refusals.push(p?.reason);
  EventBus.on('director:recallRefused', onRefuse);
  if (typeof fn === 'function') fn.call(w.recall, { empireId: EMP, year: 40 }, { count: 3 });
  EventBus.off('director:recallRefused', onRefuse);

  assert(refusals.includes('no_capital'),
    `T6: odmowa nazywa BRAK STOLICY (dostalem: [${refusals.join(', ')}])`);
  // ⚠ „NIETKNIETY" ma sens tylko wtedy, gdy odmowa faktycznie padla — inaczej pin przechodzi
  //   dlatego, ze akcji w ogole nie ma (falszywa zielen w pierwszym przebiegu fail-first).
  assert(refusals.includes('no_capital')
         && raider.mission === null && raider.pendingOrder === null && raider.position.dockedAt === TGT,
    'T6: statek NIETKNIETY — „bezdomny, ale WOLNY" (zasada z _onColonyDestroyed:1128-1130)');
}

// ═══ T7 — kill-switch (D-Z2-4 + D-Z2-1 pod JEDNA flaga) ════════════════════
console.log('T7 — `aiStrikeRecall` OFF przywraca zachowanie sprzed slice\'u BIT W BIT');
{
  const away = mkRaider('v_off');
  const w = mkWorld({ vessels: [away], recallFlag: false });
  assert(w.off.strikeReadyVessels(EMP).map(v => v.id).includes('v_off'),
    'T7: przy OFF zaparkowany rajder ZNOWU jest w puli (filtr tez pod flaga — inaczej „wylaczone" znaczy trzy rzeczy)');
  assert(stranded(w).length === 0, 'T7: przy OFF zamiatacz milczy');

  const w2 = mkWorld({ vessels: [mkRaider('v_on')], recallFlag: true });
  assert(!w2.off.strikeReadyVessels(EMP).map(v => v.id).includes('v_on'),
    'T7 kontrola pinu: przy ON obie zmiany dzialaja (flaga naprawde cos przelacza)');
}

// ═══ T8 — PIN GRANICY (D-Z2-6) ═════════════════════════════════════════════
console.log('T8 — PIN GRANICY: EnemyAttackHandler NIETKNIETY');
{
  const src = readFileSync(new URL('../../systems/EnemyAttackHandler.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert(/v\.position\.dockedAt\s*=\s*planetId/.test(src),
    'T8: EAH dalej dokuje rajdera przy planecie gracza — zamiatacz SKRACA to okno, nie kasuje zapisu');
  assert(/v\.position\?\.state\s*!==\s*'orbiting'/.test(src) && /dockedAt\s*!==\s*planetId/.test(src),
    'T8: EAH dalej zbiera do batcha po `orbiting`+`dockedAt` (stos bojowy — plan §1.1, poza zakresem)');
  assert(!/issueRecall|DirectorRecall/.test(src),
    'T8: EAH swiadomie NIE dostal wiedzy o powrocie — decyzja mieszka w Directorze (D-Z2-1)');
}

// ═══ T9 — kontrakt katalogowy ══════════════════════════════════════════════
console.log('T9 — wpis katalogowy spelnia kontrakt reguly bez rzutu');
{
  const rule = DIRECTOR_RULES.recall_strike_force;
  assert(!!rule, 'T9: regula `recall_strike_force` jest w katalogu');
  if (rule) {
    assert(rule.id === 'recall_strike_force', 'T9: `id` rowne kluczowi (wzor OpinionModifierData)');
    assert(Number(rule.delay ?? 0) === 0,
      'T9: `delay: 0` OBOWIAZKOWO — `_firePending` biegnie POZA try/catch (wzor w2_ai_mobilization T4)');
    assert(rule.roll == null && Number(rule.cooldown?.years) > 0,
      'T9: bez `roll` ⇒ MUSI miec `cooldown` (decyzja 11 katalogu; inaczej odpala 12x na rok wyswietlany)');
    assert(rule.guard == null || rule.guard.length === 0,
      'T9: BRAK guardu wojny (D-Z2-8) — zamiatanie dziala takze po POKOJU');
    assert(rule.trigger?.probe === 'strandedWarshipsAwayFromHome' && rule.trigger?.gte === 1,
      'T9: wyzwalaczem jest OBECNOSC zablokowanego okretu, nie prog liczbowy');
  }
}

// ═══ T10 — UZASADNIENIE D-Z2-4 ═════════════════════════════════════════════
console.log('T10 — pula uderzeniowa i zamiatacz sa ROZLACZNE ⇒ kolejnosc regul nie decyduje');
{
  const vs = [
    mkRaider('v_a'),                                                                            // poza domem
    mkRaider('v_b', { systemId: 'sys_ai', position: { state: 'orbiting', dockedAt: CAP, x: 110, y: 0 } }), // w domu
  ];
  const w = mkWorld({ vessels: vs });
  const pool  = new Set(w.off.strikeReadyVessels(EMP).map(v => v.id));
  const sweep = new Set(stranded(w));
  const overlap = [...pool].filter(id => sweep.has(id));

  assert(pool.size > 0 && sweep.size > 0,
    'T10 kontrola pinu: OBA zbiory niepuste (inaczej rozlacznosc jest trywialna)');
  assert(pool.size > 0 && sweep.size > 0 && overlap.length === 0,
    `T10: zaden okret nie jest jednoczesnie w puli uderzeniowej i pod zamiataczem (kolizja: [${overlap}])`);

  const wOff = mkWorld({ vessels: [mkRaider('v_a2')], recallFlag: false });
  const poolOff  = new Set(wOff.off.strikeReadyVessels(EMP).map(v => v.id));
  assert(poolOff.has('v_a2'),
    'T10 kontrola pinu: bez filtra TEN SAM okret jest w puli — czyli rozlacznosc jest ZASLUGA filtra, nie ksztaltu fixture\'u');
}

console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} — ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
