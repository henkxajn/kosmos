// AI CAPTURE — placówki jako cel desantu (commity AC-2 „pomost" i AC-6 „zdjęcie pomostu").
//
// PO CO: wybór celu desantu nie filtrował placówek, a placówka nie ma kafla `capitalBase` —
// więc kampania na nią NIE MA JAK się skończyć. `defenders_repelled` blokuje żywy najeźdźca,
// przejęcie blokuje `if (!capital) continue`, ruch blokuje deadlock movera. Rekord zostaje
// `active: true` NA ZAWSZE i trafia do KAŻDEGO zapisu (Finding 53). AC-2 zamyka to POMOSTEM
// po stronie wyboru celu; AC-6 pomost zdejmuje, dając placówce warunek zwycięstwa.
//
//   T1  ✅ AC-6: pomost ZDJĘTY — wygrana orbita w układzie, gdzie gracz ma WYŁĄCZNIE placówkę,
//       znowu ląduje wojsko i zakłada rekord, który MA JAK się skończyć.
//       (Do AC-5 ten blok pinował odwrotność: desant nie startował, z powodem
//       `invasion:blocked` / `only_outposts_in_system`. Pomost zniknął razem z powodem.)
//       KONTROLA PINU: ta sama bitwa nad układem z PEŁNĄ kolonią ląduje normalnie.
//   T2  `ColonyManager.getPlayerColonies()` zwraca placówkę — to wspólny helper ~40 konsumentów
//       UI/ekonomii i pomost NIGDY go nie dotykał (plan zabraniał tego wprost). Gdyby ktoś
//       kiedyś wracał do filtrowania placówek, ma to zrobić LOKALNIE, nie tutaj.
//   T3  `launchInvasion` ZOSTAJE niebramkowane — na tej metodzie stoi dźwignia
//       `WarOverlay → force_invasion`, na której z kolei stoi GATE 1 tego slice'u.
//   T4  ⚠ SEDNO AC-6: placówka Z BUDYNKIEM naprawdę PADA — pełny łańcuch marsz → okupacja →
//       `colony_captured`, bez jednego strzału.
//   T5  Placówka BEZ żadnego budynku nie pada — i ta sama funkcja mówi to SAMO graczowi
//       (symetria, nie luka po stronie AI).
//   T6  Tabela prawdy `holdsDecisiveGround` (stolica decyduje, gdy jest; inaczej WŁASNY kafel
//       z budynkiem; cudzy nie wystarcza).
//
// ⚠ Scena „układ z samą placówką gracza" jest budowana w układzie AI (`sys_061`), bo
//    `EntityManager` materializuje ciała wyłącznie dla układów, które w tej partii istnieją
//    (dom + dwa układy imperiów); pozostałe systemy galaktyki są abstrakcyjne. Gracz mający
//    placówkę w cudzym układzie to sytuacja normalna, więc scena nie jest sztuczna.
//
// Uruchom: node src/testing/smoke/ai_capture_outpost_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import gameState from '../../core/GameState.js';
import { createVessel } from '../../entities/Vessel.js';
import { Ticker } from '../headless/Ticker.js';
import { InvasionSystem } from '../../systems/InvasionSystem.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const DROPPER = ['engine_ion', 'armor_standard', 'weapon_kinetic', 'troop_bay_s', 'drop_pods'];

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  return { core, cm: core.colonyManager, inv: core.invasionSystem, home: window.KOSMOS.homePlanet };
}

/** Kadłub zrzutowy imperium — wstawiony wprost do rejestru (harness nie produkuje flot AI). */
function spawnDropper(core, empireId, systemId) {
  const home = window.KOSMOS.homePlanet;
  const v = createVessel('hull_medium', home.id, {
    name: 'Transportowiec', modules: [...DROPPER], x: 0, y: 0, systemId,
  });
  v.ownerEmpireId = empireId; v.owner = empireId; v.isEnemy = true;
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

const battleEvent = (empireId, vesselIds, systemId) => ({
  warId: 'war_probe', battleId: 'b_probe',
  result: {
    winner: 'A',
    participantA: { type: 'vessel_group', empireId, vesselIds, count: vesselIds.length, strength: 0 },
    participantB: { type: 'player', systemId },
    location: { systemId, planetId: null, point: { x: 0, y: 0 } },
  },
});

const setDominance = (systemId, controllerId) =>
  gameState.set(`orbitalDominance.${systemId}`, { controllerId, year: 1 }, 'probe');

/** Wolne ciało w układzie imperium — miejsce na placówkę gracza „w cudzym układzie". */
function freeBodyIn(cm, systemId) {
  return EntityManager.getAll().find(e =>
    e.systemId === systemId && (e.type === 'planet' || e.type === 'moon') && !cm.getColony(e.id));
}

// ── T1 — ⚠ POMOST ZDJĘTY W AC-6: placówka znowu jest normalnym celem ────────────────────────
// Między AC-2 a AC-5 ten blok pinował POMOST (desant nie startował na placówkę), bo kampanii
// na nią NIE DAŁO SIĘ rozstrzygnąć. AC-6 dał placówce warunek zwycięstwa i w TYM SAMYM commicie
// zdjął pomost — więc pin został przepisany na odwrotny.
console.log('T1 — AC-6: pomost ZDJĘTY, desant na placówkę znowu startuje');
{
  const { core, cm, inv } = boot();
  const empireId = core.empireRegistry.listAll()[0].id;
  const aiSys = EntityManager.get(cm.getAllColonies().find(c => c.ownerEmpireId)?.planetId)?.systemId;
  const outpost = cm.createOutpost(freeBodyIn(cm, aiSys).id, { Fe: 50 }, 0);

  const playerHere = cm.getPlayerColonies().filter(c => EntityManager.get(c.planetId)?.systemId === aiSys);
  assert(playerHere.length === 1 && playerHere[0].isOutpost === true,
    `T1: w układzie ${aiSys} gracz ma DOKŁADNIE jedną rzecz i jest to placówka — inaczej test ` +
    'mierzyłby preferencję „home first", a nie zachowanie wobec placówki');

  const dropper = spawnDropper(core, empireId, aiSys);
  assert(dropper.canDropTroops === true && dropper.troopCapacity > 0,
    `T1: kadłub NAPRAWDĘ potrafi zrzucić wojsko (drop=${dropper.canDropTroops}, ` +
    `pojemność=${dropper.troopCapacity})`);
  setDominance(aiSys, empireId);

  const blocked = [], landed = [];
  EventBus.on('invasion:blocked', (d) => blocked.push(d));
  EventBus.on('invasion:troopsLanded', (d) => landed.push(d));
  inv._onBattleResolved(battleEvent(empireId, [dropper.id], aiSys));

  assert(landed.length === 1 && landed[0].planetId === outpost.planetId,
    `T1 SEDNO: desant WYLĄDOWAŁ na placówce (${landed[0]?.planetId ?? '—'}). Pomost z AC-2 zdjęty ` +
    'dokładnie tam, gdzie placówka przestała być kampanią bez końca');
  assert(!blocked.some(b => b.reason === 'only_outposts_in_system'),
    'T1: …i nikt już nie zgłasza powodu placówkowego — powód zniknął razem z pomostem');
  assert(Object.values(gameState.get('invasions') ?? {}).some(i => i.planetId === outpost.planetId),
    'T1: rekord kampanii istnieje — i od AC-6 MA JAK się skończyć (przejęciem albo odparciem)');
}

// ── T1 KONTROLA PINU — pełna kolonia w tym samym harnessie ląduje normalnie ─────────────────
console.log('T1 KONTROLA PINU — nad układem z PEŁNĄ kolonią ta sama bitwa ląduje wojsko');
{
  const { core, cm, inv, home } = boot();
  const empireId = core.empireRegistry.listAll()[0].id;
  const dropper = spawnDropper(core, empireId, home.systemId);
  setDominance(home.systemId, empireId);

  const landed = [], blocked = [];
  EventBus.on('invasion:troopsLanded', (d) => landed.push(d));
  EventBus.on('invasion:blocked', (d) => blocked.push(d));
  inv._onBattleResolved(battleEvent(empireId, [dropper.id], home.systemId));

  assert(landed.length === 1 && landed[0].planetId === home.id,
    `T1 KONTROLA PINU: desant wylądował na pełnej koloni (${landed[0]?.planetId ?? '—'}) — pełna ` +
    'kolonia była i jest normalnym celem, więc T1 mierzy ZMIANĘ wobec placówki, a nie tło');
  assert(!blocked.some(b => b.reason === 'only_outposts_in_system'),
    'T1 KONTROLA PINU: …i nikt nie zgłosił powodu placówkowego');
}

// ── T2 — filtr jest LOKALNY, helper nietknięty ──────────────────────────────────────────────
console.log('T2 — pomost NIGDY nie dotykał `getPlayerColonies` (wspólny helper ~40 konsumentów)');
{
  const { core, cm } = boot();
  const aiSys = EntityManager.get(cm.getAllColonies().find(c => c.ownerEmpireId)?.planetId)?.systemId;
  const outpost = cm.createOutpost(freeBodyIn(cm, aiSys).id, { Fe: 50 }, 0);

  assert(cm.getPlayerColonies().some(c => c.planetId === outpost.planetId),
    'T2: `getPlayerColonies()` NADAL zwraca placówkę. To wspólny helper ~40 konsumentów ' +
    '(handel, podatki, listy kolonii, AI) — odsianie placówek u ŹRÓDŁA zmieniłoby ekonomię ' +
    'gry przy okazji naprawy desantu. Plan zabrania tego wprost, a ten pin tego pilnuje');
}

// ── T3 — dźwignia GATE 1 musi przeżyć ───────────────────────────────────────────────────────
console.log('T3 — `launchInvasion` NIEBRAMKOWANE (na nim stoi `WarOverlay → force_invasion`)');
{
  const { core, cm, inv } = boot();
  const empireId = core.empireRegistry.listAll()[0].id;
  const aiSys = EntityManager.get(cm.getAllColonies().find(c => c.ownerEmpireId)?.planetId)?.systemId;
  const outpost = cm.createOutpost(freeBodyIn(cm, aiSys).id, { Fe: 50 }, 0);

  const res = inv.launchInvasion(empireId, outpost.planetId, 2);
  assert(res?.success === true && (res.landed?.length ?? 0) === 2,
    `T3: bezpośrednie \`launchInvasion\` na placówkę DALEJ działa (${res?.reason ?? 'ok'}). AC-2 ` +
    'bramkuje WYBÓR CELU, nie metodę intencji — inaczej zabiłby dźwignię `force_invasion`, ' +
    'na której GATE 1 tego slice\'u stoi wprost (produkcyjne wejście desantu należy do Finding 49)');
}

// ── T4 — AC-6 SEDNO: placówka Z BUDYNKIEM PADA (pełny łańcuch, bez walki) ───────────────────
console.log('T4 — AC-6: placówka z budynkiem PADA wg lustra warunku budynkowego');
{
  const { core, cm, inv } = boot();
  const empireId = core.empireRegistry.listAll()[0].id;
  const aiSys = EntityManager.get(cm.getAllColonies().find(c => c.ownerEmpireId)?.planetId)?.systemId;
  const outpost = cm.createOutpost(freeBodyIn(cm, aiSys).id, { Fe: 100 }, 0);

  // Stempel własności (harness nie stempluje) + JEDEN budynek, czyli to, co placówka MA
  // zamiast stolicy.
  const land = outpost.grid.toArray().filter(t => t && t.type !== 'ocean');
  for (const t of land) t.owner = 'player';
  const building = land[0];
  building.buildingId = 'autonomous_mine';

  assert(outpost.grid.toArray().every(t => !t?.capitalBase),
    'T4: placówka NIE MA kafla `capitalBase` — to jest cała przesłanka lustra budynkowego');

  const res = inv.launchInvasion(empireId, outpost.planetId, 2);
  assert(res?.success === true, 'T4: desant wylądował (przesłanka)');

  new Ticker(core.timeSystem).run(80, { tickSize: 1.0, stopOnCrash: true });

  assert(building.owner === empireId,
    `T4: najeźdźca DOSZEDŁ do kafla z budynkiem i go utrzymał (${building.owner}) — marsz z AC-4 ` +
    '(fallback „najbliższy kafel z budynkiem") + timer okupacji, wszystko bez jednego strzału');
  assert(outpost.ownerEmpireId === empireId,
    `T4 SEDNO: PLACÓWKA ZMIENIŁA WŁAŚCICIELA (${outpost.ownerEmpireId}). Do AC-5 włącznie było to ` +
    'niemożliwe: `if (!capital) continue` wychodziło z pętli, zanim cokolwiek policzyło — ' +
    'a gracz placówki AI zdobywał bez przeszkód. Asymetria zamknięta');
  const rec = Object.values(gameState.get('invasions') ?? {}).find(i => i.planetId === outpost.planetId);
  assert(rec?.active === false && rec?.endReason === 'colony_captured',
    `T4: …i kampania jest ZAMKNIĘTA (\`${rec?.endReason}\`) — koniec „wiecznej inwazji" ` +
    'w zapisie (Finding 53) nie przez pomost, tylko przez rozstrzygnięcie');
}

// ── T5 — placówka BEZ budynków: nie pada ŻADNEJ stronie (symetria, nie luka) ────────────────
console.log('T5 — placówka bez ŻADNEGO budynku nie pada — i jest to symetryczne');
{
  const { core, cm, inv } = boot();
  const empireId = core.empireRegistry.listAll()[0].id;
  const aiSys = EntityManager.get(cm.getAllColonies().find(c => c.ownerEmpireId)?.planetId)?.systemId;
  const outpost = cm.createOutpost(freeBodyIn(cm, aiSys).id, { Fe: 100 }, 0);
  for (const t of outpost.grid.toArray()) if (t) t.owner = empireId;   // agresor trzyma WSZYSTKO

  assert(outpost.grid.toArray().every(t => !t?.buildingId && !t?.capitalBase),
    'T5: placówka jest PUSTA — ani stolicy, ani budynku');

  inv.launchInvasion(empireId, outpost.planetId, 2);
  new Ticker(core.timeSystem).run(30, { tickSize: 1.0, stopOnCrash: true });

  assert(!outpost.ownerEmpireId,
    'T5: pusta placówka NIE zmienia rąk, choć agresor trzyma wszystkie kafle — nie ma czego ' +
    '„trzymać" w sensie warunku zwycięstwa');
  assert(InvasionSystem.holdsDecisiveGround(outpost.grid.toArray(), 'player') === false,
    'T5 SEDNO (symetria): ta sama funkcja odpowiada `false` także GRACZOWI na pustym ciele. ' +
    'To nie jest luka po stronie AI — to jedna reguła, która obu stronom mówi to samo');
}

// ── T6 — tabela prawdy warunku terenowego ──────────────────────────────────────────────────
console.log('T6 — `holdsDecisiveGround`: stolica decyduje, gdy jest; inaczej własny kafel z budynkiem');
{
  const H = InvasionSystem.holdsDecisiveGround;
  // ⚠ Helper NIE MOŻE nazywać się jednoliterowo „t" — `tools/check-i18n.mjs` skanuje wywołania
  //    funkcji tłumaczącej po nazwie i policzyłby jego argument jako BRAKUJĄCY klucz i18n.
  //    (Złapane przez gate przy AC-6; ta sama pułapka dotyczy komentarza cytującego takie wywołanie.)
  const plain = (o) => ({ owner: o, buildingId: null, capitalBase: false });
  const cap = (o) => ({ owner: o, buildingId: null, capitalBase: true });
  const bld = (o) => ({ owner: o, buildingId: 'mine', capitalBase: false });

  assert(H([cap('emp_x'), bld('player')], 'emp_x') === true,
    'T6: gdy jest stolica — decyduje WYŁĄCZNIE ona (cudzy kafel z budynkiem nie przeszkadza)');
  assert(H([cap('player'), bld('emp_x')], 'emp_x') === false,
    'T6: …i cudza stolica przekreśla podbój, choćby zdobywca miał budynki');
  assert(H([plain('player'), bld('emp_x')], 'emp_x') === true,
    'T6: bez stolicy wystarczy WŁASNY kafel z budynkiem (lustro gałęzi zapasowej gracza)');
  assert(H([plain('player'), bld('player')], 'emp_x') === false,
    'T6: …ale CUDZY kafel z budynkiem nie wystarcza — „mieć" znaczy „mieć", nie „widzieć"');
  assert(H([], 'emp_x') === false && H(null, 'emp_x') === false,
    'T6 KONTROLA PINU: pusta/brakująca siatka nie wywraca predykatu i niczego nie oddaje');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
