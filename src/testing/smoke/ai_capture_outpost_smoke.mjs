// AI CAPTURE — placówki jako cel desantu (commity AC-2 „pomost" i AC-6 „zdjęcie pomostu").
//
// PO CO: wybór celu desantu nie filtrował placówek, a placówka nie ma kafla `capitalBase` —
// więc kampania na nią NIE MA JAK się skończyć. `defenders_repelled` blokuje żywy najeźdźca,
// przejęcie blokuje `if (!capital) continue`, ruch blokuje deadlock movera. Rekord zostaje
// `active: true` NA ZAWSZE i trafia do KAŻDEGO zapisu (Finding 53). AC-2 zamyka to POMOSTEM
// po stronie wyboru celu; AC-6 pomost zdejmuje, dając placówce warunek zwycięstwa.
//
//   T1  AC-2: wygrana orbita w układzie, gdzie gracz ma WYŁĄCZNIE placówkę, NIE ląduje wojska
//       i mówi to nazwanym powodem (`invasion:blocked` / `only_outposts_in_system`).
//       KONTROLA PINU: ta sama bitwa nad układem z PEŁNĄ kolonią ląduje normalnie.
//   T2  Filtr jest LOKALNY: `ColonyManager.getPlayerColonies()` NADAL zwraca placówkę.
//       (Odsianie jej u źródła zmieniłoby ~40 konsumentów UI/ekonomii — plan zabrania tego wprost.)
//   T3  `launchInvasion` ZOSTAJE niebramkowane — na tej metodzie stoi dźwignia
//       `WarOverlay → force_invasion`, na której z kolei stoi GATE 1 tego slice'u.
//   T4  Po zablokowanej wygranej w `gameState.invasions` NIE MA żadnego rekordu — czyli wyciek
//       „wiecznej inwazji" nie trafia do zapisu.
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

// ── T1 — układ z samą placówką: desant NIE startuje, powód nazwany ──────────────────────────
console.log('T1 — AC-2: w układzie z samą PLACÓWKĄ gracza desant nie startuje (nazwany powód)');
{
  const { core, cm, inv } = boot();
  const empireId = core.empireRegistry.listAll()[0].id;
  const aiSys = EntityManager.get(cm.getAllColonies().find(c => c.ownerEmpireId)?.planetId)?.systemId;
  const outpost = cm.createOutpost(freeBodyIn(cm, aiSys).id, { Fe: 50 }, 0);

  const playerHere = cm.getPlayerColonies().filter(c => EntityManager.get(c.planetId)?.systemId === aiSys);
  assert(playerHere.length === 1 && playerHere[0].isOutpost === true,
    `T1: w układzie ${aiSys} gracz ma DOKŁADNIE jedną rzecz i jest to placówka — inaczej test ` +
    'mierzyłby preferencję „home first", a nie bramkę placówki');

  const dropper = spawnDropper(core, empireId, aiSys);
  assert(dropper.canDropTroops === true && dropper.troopCapacity > 0,
    `T1: kadłub NAPRAWDĘ potrafi zrzucić wojsko (drop=${dropper.canDropTroops}, ` +
    `pojemność=${dropper.troopCapacity}) — inaczej odmowa przyszłaby z innej bramki`);
  setDominance(aiSys, empireId);

  const blocked = [], landed = [];
  EventBus.on('invasion:blocked', (d) => blocked.push(d));
  EventBus.on('invasion:troopsLanded', (d) => landed.push(d));
  inv._onBattleResolved(battleEvent(empireId, [dropper.id], aiSys));

  assert(landed.length === 0,
    'T1 SEDNO: NIC nie wylądowało na placówce. Przed AC-2 desant przechodził (siatka jest), ' +
    'a rekord `active:true` nie mógł już nigdy wygasnąć');
  assert(blocked.some(b => b.reason === 'only_outposts_in_system'),
    `T1: …i odmowa ma NAZWĘ (\`${blocked.map(b => b.reason).join(',') || '—'}\`). Cichy \`return\` ` +
    'kazałby gate\'owi mierzyć ciszę tam, gdzie system podjął decyzję — W3 spalił się na tym dwa razy. ' +
    '`invasion:blocked` jest w `DebugLog.TRACKED_EVENTS`, więc powód widać w audycie AI');
  assert(Object.keys(gameState.get('invasions') ?? {}).length === 0,
    'T1 (=T4): w `gameState.invasions` NIE MA żadnego rekordu — wyciek „wiecznej inwazji" ' +
    'nie trafia do zapisu');
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
    `T1 KONTROLA PINU: desant wylądował na pełnej koloni (${landed[0]?.planetId ?? '—'}) — bramka ` +
    'AC-2 odsiewa PLACÓWKI, a nie „wszystko"');
  assert(!blocked.some(b => b.reason === 'only_outposts_in_system'),
    'T1 KONTROLA PINU: …i nikt nie zgłosił powodu placówkowego');
}

// ── T2 — filtr jest LOKALNY, helper nietknięty ──────────────────────────────────────────────
console.log('T2 — filtr siedzi w `_onVesselGroupVictory`, NIE w `getPlayerColonies`');
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

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
