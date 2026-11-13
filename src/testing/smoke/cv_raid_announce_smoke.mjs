// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_raid_announce_smoke — KEEPER ARC COMBAT VISUALS, krok CV-8b (Finding 635 — decyzja właściciela 48 (9); #713 — decyzja 48 (4);
// Finding 157 — ponowne sprawdzenie, §3.1-6; plan §4 CV-8b).
// PRAWDZIWY łańcuch bitew rajdu (sonda `probe-635-double-resolution`: TimeSystem.update → VesselManager → Proximity → VCS → DSCS →
// MOS → EAH, + prawdziwy `WarSystem` z wojną — rekordy w `gameState.battles`), czysty `RaidAnnounceLogic` wołany TAK JAK woła go
// `GameScene` (bramka banera: bitwa z graczem → `noteBattle`; gotowy baner → `offerBanner`; linia → `offerLine`; klatka → `releaseDue`
// z predykatem `raidBusy`), oraz piny źródłowe sklejenia w `GameScene` / `EnemyAttackHandler` (scena nie importuje się pod node).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// PINY:
//   A1 rajd rozstrzygnięty dwa razy (DSCS w podejściu + EAH ocalałych) — JEDEN baner i JEDNA linia bitwy, scalone (zwycięzca ostatniej
//      bitwy, straty sumą, tury sumą, obie bitwy w `raidBattleIds`); OBA rekordy w `gameState.battles` (mechanika nietknięta)
//   A2 dwa osobne rajdy (EAH bez podejścia, potem drugi) — dwa banery; KONTROLA: bez `RaidAnnouncer` rajd z A1 daje dwa banery
//   A3 grupa nie wisi: rajderzy przylecieli, a EAH bitwy nie dał (cel już własny) — baner podejścia wychodzi sam po oknie łaski
//   A4 `mergeRaidBattles` — orientacja ostatniej bitwy, straty przeliczone na stronę gracza; jedna bitwa — bez zmian
//   B1 #713 — `EnemyAttackHandler`: wpis skutków w `fx.logEntries` PRZED zdarzeniem; przejęty w trakcie (`fx.logHeld`) — EAH go nie pisze;
//      nieprzejęty — pisze PO skutkach (jak dotąd); flaga OFF — bez `fx`, wpis jak dotąd
//   B2 #713 — piny źródłowe `GameScene`: linia bitwy, wpisy skutków i „Utracono kontakt” wraków powtórki czekają na koniec powtórki
//   C1 Finding 157 — auto-slow (`UIManager`) klasyfikuje gracza kanonem `isPlayerParticipant` na KAŻDEJ ścieżce orbitalnej: obrona
//      kolonii z wojną i bez (potyczka EAH), bitwa z flagą `cvOrbital` ON i OFF, `forceBattle` (kształt `player`)
//   D1 §3.1-6 — wynik zostaje po powtórce: wiersz WYNIKU na pasku walki (`CvOrbital.endedEncounters` → `CombatStrip`) + linia bitwy
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
import '../headless/env.js';
import { readFileSync } from 'node:fs';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import gameState from '../../core/GameState.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { TimeSystem } from '../../systems/TimeSystem.js';
import { VesselManager } from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { ProximitySystem } from '../../systems/ProximitySystem.js';
import { VesselCombatSystem } from '../../systems/VesselCombatSystem.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { OrbitalSpaceSystem } from '../../systems/OrbitalSpaceSystem.js';
import { WarSystem } from '../../systems/WarSystem.js';
import { createVessel, setNextVesselId } from '../../entities/Vessel.js';
import { resolveVesselOrbitalRole } from '../../data/OrbitalRolesData.js';
import { resolveBattleSides, isPlayerParticipant } from '../../utils/BattleSides.js';
import { isDeepSpace, normalize as normLoc } from '../../utils/BattleLocation.js';
import * as RAL from '../../ui/RaidAnnounceLogic.js';
import { CvOrbital } from '../../renderer/CvOrbital.js';
import * as ORL from '../../renderer/combat/OrbitalReplayLogic.js';   // przestrzeń nazw: `orbitalOutcome` powstaje w CV-8b (fail-first bez błędu linkowania)
const { ORB_TUNING } = ORL;
const orbitalOutcome = (...a) => (typeof ORL.orbitalOutcome === 'function' ? ORL.orbitalOutcome(...a) : undefined);
import { CombatStrip } from '../../ui/CombatStrip.js';
import { t } from '../../i18n/i18n.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l); } };
const guard = (label, fn) => { try { fn(); } catch (e) { fail++; console.log(`  ✗ ${label}: WYJĄTEK ${e?.stack ?? e}`); } };
const F = GAME_CONFIG.FEATURES;
const FLAG0 = F.cvOrbital;
const AU = GAME_CONFIG.AU_TO_PX, SYS = 'sys_t', EMP = 'emp_t';
const clock = { now: 1e7 };
performance.now = () => clock.now;
const realSetTimeout = globalThis.setTimeout;
const EXPLORE = process.env.RAID_EXPLORE === '1';

/**
 * Świat rajdu: `defenders` okrętów gracza na orbicie celu, `raiders` rajderów `dist` AU dalej z rozkazem `attack` (MOS), wojna z imperium
 * (rekordy w `gameState.battles`), obrona ciała (`tower` / `grid` — `_cvStagerDefence`). Partia EAH (500 ms czasu realnego) — w kolejce,
 * odpalana po `batchFrames` klatkach (czas wirtualny). `announce`: 'raid' — `RaidAnnouncer` jak w `GameScene`; 'plain' — bez (kontrola).
 */
function raidWorld({ defenders = 2, raiders = 3, dist = 0.3, tower = 2, grid = 1, modsA = ['engine_ion', 'weapon_kinetic', 'weapon_laser', 'armor_standard'],
  modsB = ['engine_ion', 'weapon_laser', 'armor_standard'], frames = 60 * 200, announce = 'raid', ownTarget = false, secondRaidAtFrame = null,
  claim = false, war = true, picketAU = null, noColony = false, holdColonyFrames = 0, orbitRaid = false, speedIndex = 1, holdMaxMs = 15000 } = {}) {
  EventBus.clear(); EntityManager.clear();
  clock.now = 1e7; setNextVesselId(1);
  gameState.set?.('battles', {});
  const ts = new TimeSystem(); ts.gameTime = 100.00002; ts.multiplierIndex = speedIndex;
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: ts, activeSystemId: SYS };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: SYS, x: -4 * AU, y: 0, radius: 6, mass: 1, visual: { radius: 6 } });
  const vm = new VesselManager(); const mos = new MovementOrderSystem(vm); const prox = new ProximitySystem(vm);
  const dscs = new DeepSpaceCombatSystem(vm); new VesselCombatSystem(vm); const oss = new OrbitalSpaceSystem();
  const warSys = war ? new WarSystem() : null;
  const eah = new EnemyAttackHandler();
  const cols = noColony ? [] : [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {}, fleet: [], ...(ownTarget ? { ownerEmpireId: EMP } : {}) }];
  const empires = [{ id: EMP, name: 'Testowe' }];
  // Bez `diplomacySystem` (jak sonda 635): DSCS nie pyta o napięcie, EAH bierze wojnę z `WarSystem` (założona niżej), `recordBattle` księguje.
  const log = [], seq = [];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: EntityManager.get('p_home'), vesselManager: vm, movementOrderSystem: mos, proximitySystem: prox,
    deepSpaceCombatSystem: dscs, enemyAttackHandler: eah, orbitalSpaceSystem: oss, warSystem: warSys,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find((c) => c.planetId === id) ?? null, getAllColonies: () => cols,
      getPlayerColonies: () => cols.filter((c) => !c.ownerEmpireId), isPlayerColony: (c) => !(typeof c === 'string' ? cols.find((x) => x.planetId === c) : c)?.ownerEmpireId },
    eventLogSystem: { push: (e) => { log.push(e); seq.push('log'); } }, intelSystem: { getVesselContact: () => ({ quality: 'contact' }), getLevel: () => 'contact', isAtLeast: () => true },
    empireRegistry: { listAll: () => empires, get: (id) => empires.find((e) => e.id === id) ?? null }, debug: {},
  });
  if (warSys) {
    warSys.createWar(EMP, 'player', 'border_incident');
    warSys._cvStagerDefence = (tower || grid) ? { planetId: 'p_home', tower, grid } : null;
  }
  // partia EAH — kolejka (500 ms czasu realnego = 31 klatek po 16 ms)
  const timers = [];
  globalThis.setTimeout = (fn, ms = 0) => { timers.push({ at: clock.now + ms, fn }); return timers.length; };
  const home = EntityManager.get('p_home');
  const mk = (mods, name) => { const v = createVessel('hull_frigate', 'p_home', { name, modules: [...mods], x: home.x, y: home.y, systemId: SYS }); vm._vessels.set(v.id, v); v.serviceState = 'active'; if (v.fuel) v.fuel.current = v.fuel.max = 9999; return v; };
  const defs = [];
  for (let i = 0; i < defenders; i++) {
    const v = mk(modsB, `D${i}`);
    if (picketAU != null) {
      // pikieta w wolnej przestrzeni na drodze rajdu — podejście DALEKO od kolonii (lot ocalałych dłuższy niż okno łaski grupy)
      Object.assign(v.position, { state: 'orbiting', dockedAt: null, x: home.x + picketAU * AU, y: home.y + 0.02 * AU * i });
    } else {
      Object.assign(v.position, { state: 'orbiting', dockedAt: 'p_home' });
      oss.assignOrbit('p_home', v.id, resolveVesselOrbitalRole(v));
    }
    defs.push(v);
  }
  const launch = (n, prefix, d) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const v = mk(modsA, `${prefix}${i}`);
      v.ownerEmpireId = EMP; v.owner = EMP; v.isEnemy = true;
      if (orbitRaid) {
        // misja ataku BEZ rozkazu MOS (kształt narzędzia `cvOrbitalBattle` i starych ścieżek): rajder już na orbicie celu, misja
        // zostaje na statku (MOS zeruje misję przy przylocie tylko dla własnych rozkazów)
        Object.assign(v.position, { state: 'orbiting', dockedAt: 'p_home' });
        oss.assignOrbit('p_home', v.id, resolveVesselOrbitalRole(v));
        v.status = 'on_mission'; v.mission = { type: 'attack', targetId: 'p_home' };
      } else {
        Object.assign(v.position, { state: 'orbiting', dockedAt: null, x: home.x + d * AU, y: home.y + 0.05 * AU * i });
        mos.issueOrder(v.id, { type: 'attack', targetBodyId: 'p_home', issuedBy: 'keeper' });
      }
      out.push(v);
    }
    return out;
  };
  const raid = launch(raiders, 'R', dist);
  // GameScene w miniaturze: bramka banera (bitwa z graczem) → `noteBattle` (`_noteRaidBattle`), baner gotowy od razu (bez klastra — klaster
  // pinuje `cv_strip` / `announce_once`), linia bitwy (`_writeBattleLine`), klatka → `releaseDue` (`_releaseRaids`).
  const ann = new RAL.RaidAnnouncer();
  const banners = [], lines = [], events = [], payloads = [], claimed = [], released = [], cappedAt = [];
  EventBus.on('vessel:wrecked', () => seq.push('wreck'));
  const queueBanner = (b) => { if (announce === 'raid' && ann.offerBanner(b)) return; banners.push(b); };
  const heldBanners = [];   // `holdColonyFrames` — baner bitwy o kolonię czeka (jak na koniec powtórki w widoku, `combatfx:orbitalReplayEnd`)
  const writeLine = (b) => { if (announce === 'raid' && ann.offerLine([b.battleId])) return; lines.push(b.battleId); };
  EventBus.on('battle:resolved', ({ warId, battleId, result, fx }) => {
    payloads.push({ warId, battleId, result, fx: fx ?? null });
    if (claim && fx?.kind === 'orbital') { fx.logHeld = true; claimed.push(...(fx.logEntries ?? [])); }
    events.push({ warId, battleId, kind: isDeepSpace(result.location) ? 'DSCS' : 'EAH', winner: result.winner, end: result.endReason ?? null, f: Math.round((clock.now - 1e7) / 16), ids: RAL.raidEnemyIds(result) });
    const sides = resolveBattleSides(result);
    if (!sides.playerInvolved) return;
    const b = { warId, battleId, result, playerSide: sides.playerSide };
    if (announce === 'raid') {
      const enemyIds = RAL.raidEnemyIds(result);
      const kind = isDeepSpace(normLoc(result.location)) ? 'approach' : 'colony';
      const continuing = kind === 'approach' ? enemyIds.filter((id) => RAL.stillRaiding(vm.getVessel(id)))
        : enemyIds.filter((id) => !!dscs._findActiveEncounterContaining?.(id));
      ann.noteBattle({ battleId, kind, enemyIds, continuing });
    }
    if (holdColonyFrames > 0 && !isDeepSpace(normLoc(result.location))) { heldBanners.push({ b, at: Math.round((clock.now - 1e7) / 16) + holdColonyFrames }); return; }
    queueBanner(b);
    writeLine(b);
  });
  const busy = (id) => RAL.raidBusy(vm.getVessel(id), { inCombat: (vid) => !!dscs._findActiveEncounterContaining?.(vid) });
  let presMs = 0, second = null;
  for (let i = 0; i < frames; i++) {
    clock.now += 16; ts.update(16); presMs += 16;
    for (const tm of [...timers]) if (tm.at <= clock.now) { timers.splice(timers.indexOf(tm), 1); tm.fn(); }
    for (const h of [...heldBanners]) if (Math.round((clock.now - 1e7) / 16) >= h.at) { heldBanners.splice(heldBanners.indexOf(h), 1); queueBanner(h.b); writeLine(h.b); }
    if (secondRaidAtFrame != null && i === secondRaidAtFrame) second = launch(raiders, 'S', dist);
    for (const rel of ann.releaseDue({ nowMs: presMs, graceMs: 1725, busy, holdMaxMs })) {
      banners.push(rel.banner); released.push(i); if (rel.capped) cappedAt.push(i);
      lines.push(`merged:${(rel.banner.result.raidBattleIds ?? [rel.banner.battleId]).join('+')}`);
    }
  }
  globalThis.setTimeout = realSetTimeout;
  return { vm, dscs, warSys, eah, ann, raid, second, defs, banners, lines, events, payloads, claimed, released, cappedAt, log, seq,
    battlesStored: Object.keys(gameState.get('battles') ?? {}) };
}

if (EXPLORE) {
  for (const sc of [
    { raiders: 2, defenders: 1, dist: 1.2, frames: 60 * 600 }, { raiders: 3, defenders: 2, dist: 1.2, frames: 60 * 600 },
    { raiders: 3, defenders: 1, dist: 0.6, frames: 60 * 400 }, { raiders: 2, defenders: 1, dist: 0.6, tower: 3, grid: 2, frames: 60 * 400 },
    { raiders: 3, defenders: 2, dist: 0.3 }, { raiders: 3, defenders: 2, dist: 0.3, announce: 'plain' },
  ]) {
    const w = raidWorld(sc);
    console.log(JSON.stringify(sc), JSON.stringify(w.events), 'banners', w.banners.length, 'lines', w.lines, 'stored', w.battlesStored.length,
      'raid', w.raid.map((v) => [v.name, v.isWreck ? 'W' : v.position.state, v.position.dockedAt, v.mission?.type ?? null, v._suspendedMission?.type ?? null]));
  }
  process.exit(0);
}

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const read = (rel) => readFileSync(new URL('../../../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const GS = strip(read('src/scenes/GameScene.js'));
const EAH_SRC = strip(read('src/systems/EnemyAttackHandler.js'));
const UI = strip(read('src/scenes/UIManager.js'));
const body = (src, sig) => { const i = src.indexOf(sig); return i < 0 ? '' : src.slice(i, src.indexOf('\n  }\n', i)); };
const handlerAt = (src, ev, nth = 0) => {
  let i = -1;
  for (let k = 0; k <= nth; k++) { i = src.indexOf(`EventBus.on('${ev}'`, i + 1); if (i < 0) return ''; }
  return src.slice(i, src.indexOf('\n    });', i));
};

// ═══ A1 — rajd rozstrzygnięty dwa razy ════════════════════════════════════════════════════════════════════════════
console.log('A1 — rajd DSCS (podejście) + EAH (kolonia): jeden baner, jedna linia, scalone; oba rekordy zostają');
guard('A1', () => {
  const sc = { raiders: 2, defenders: 1, dist: 0.6, tower: 3, grid: 2, frames: 6000 };
  const w = raidWorld(sc);
  const ds = w.events.find((e) => e.kind === 'DSCS'), ea = w.events.find((e) => e.kind === 'EAH');
  assert(!!ds && !!ea && w.events.indexOf(ds) < w.events.indexOf(ea) && ds.ids.some((id) => ea.ids.includes(id)),
    `A1-0 świadek: łańcuch daje DSCS PRZED EAH z tymi samymi rajderami (${w.events.map((e) => e.kind).join(' → ')})`);
  assert(w.banners.length === 1, `A1a jeden baner na rajd (banery: ${w.banners.length})`);
  const b = w.banners[0];
  const ids = b?.result?.raidBattleIds ?? [];
  assert(ids.includes(ds?.battleId) && ids.includes(ea?.battleId) && b?.raidSize === 2, `A1b baner scala obie bitwy (${ids.join(', ')})`);
  const eaP = w.payloads.find((p) => p.battleId === ea?.battleId), dsP = w.payloads.find((p) => p.battleId === ds?.battleId);
  const dsSide = resolveBattleSides(dsP.result).playerSide, eaSide = resolveBattleSides(eaP.result).playerSide;
  const lossP = (p, side) => (side === 'A' ? p.result.lossesA : p.result.lossesB) ?? 0;
  const lossE = (p, side) => (side === 'A' ? p.result.lossesB : p.result.lossesA) ?? 0;
  assert(b?.result?.winner === eaP.result.winner && b?.playerSide === eaSide,
    `A1c zwycięzca rajdu = zwycięzca bitwy o kolonię (${b?.result?.winner}, strona gracza ${b?.playerSide}); podejście wygrał: ${dsP.result.winner} (gracz ${dsSide})`);
  const expP = lossP(dsP, dsSide) + lossP(eaP, eaSide), expE = lossE(dsP, dsSide) + lossE(eaP, eaSide);
  assert(lossP(b, b.playerSide) === expP && lossE(b, b.playerSide) === expE && b.result.turns === (dsP.result.turns ?? 0) + (eaP.result.turns ?? 0),
    `A1d straty sumą po stronie gracza / wroga (${expP} / ${expE}), tury sumą (${b?.result?.turns})`);
  assert(w.lines.length === 1 && String(w.lines[0]).startsWith('merged:'), `A1e jedna linia bitwy w Dzienniku — scalona (${JSON.stringify(w.lines)})`);
  assert(w.battlesStored.includes(ds?.battleId) && w.battlesStored.includes(ea?.battleId), `A1f OBA rekordy w gameState.battles (${w.battlesStored.length}) — mechanika nietknięta`);
  assert(eaP.result.raidBattleIds === undefined && dsP.result.raidBattleIds === undefined, 'A1g rekordy bitew bez pól prezentacji (scalenie na nowych obiektach)');
  assert(w.ann.holding === 0, 'A1h po ogłoszeniu nic nie czeka');
  // KONTROLA: ten sam rajd bez `RaidAnnouncer` — dwa banery, dwie linie (dzisiejsza ścieżka; decyzja 48 (9) to zmienia)
  const c = raidWorld({ ...sc, announce: 'plain' });
  assert(c.banners.length === 2 && c.lines.length === 2, `A1-K KONTROLA: bez grupy rajdu — ${c.banners.length} banery, ${c.lines.length} linie`);
  // kolejność odwrotna: rajder dociera na orbitę celu („już przy ciele”, #663) i w oknie partii EAH wpada w zasięg okrętów na orbicie
  const r = raidWorld({ raiders: 3, defenders: 2, dist: 0.3, frames: 400 });
  const order = r.events.map((e) => e.kind).join(' → ');
  assert(order === 'EAH → DSCS' && r.banners.length === 1 && r.lines.length === 1 && (r.banners[0]?.result?.raidBattleIds?.length ?? 0) === 2,
    `A1i kolejność odwrotna (${order}): też jeden baner i jedna linia`);
  const rc = raidWorld({ raiders: 3, defenders: 2, dist: 0.3, frames: 400, announce: 'plain' });
  assert(rc.banners.length === 2, `A1i-K KONTROLA: odwrotna bez grupy — ${rc.banners.length} banery`);
});

// ═══ A2 — dwa rajdy ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('A2 — dwa osobne rajdy (obrona kolonii bez podejścia) — dwa banery');
guard('A2', () => {
  const w = raidWorld({ raiders: 2, defenders: 0, dist: 0.3, tower: 3, grid: 2, frames: 600, secondRaidAtFrame: 200 });
  const eahs = w.events.filter((e) => e.kind === 'EAH');
  assert(eahs.length === 2 && w.events.every((e) => e.kind === 'EAH'), `A2-0 świadek: dwie bitwy EAH, żadnego podejścia (${w.events.map((e) => e.kind).join(', ')})`);
  assert(w.banners.length === 2 && w.banners.every((b) => !b.result.raidBattleIds), `A2a dwa banery, nic nie scalone (${w.banners.length})`);
  assert(w.lines.length === 2 && w.lines.every((l) => !String(l).startsWith('merged:')), 'A2b dwie linie bitwy, każda swoja');
});

// ═══ A3 — grupa nie wisi ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('A3 — rajderzy przylecieli, EAH bez bitwy (cel już własny): baner podejścia wychodzi sam po oknie łaski');
guard('A3', () => {
  const w = raidWorld({ raiders: 2, defenders: 1, dist: 0.6, tower: 0, grid: 0, frames: 6500, ownTarget: true });
  const ds = w.events.find((e) => e.kind === 'DSCS');
  const survivors = w.raid.filter((v) => !v.isWreck);
  assert(!!ds && w.events.length === 1 && survivors.length > 0, `A3-0 świadek: jedna bitwa (DSCS), ocalali rajderzy: ${survivors.length}`);
  assert(w.banners.length === 1 && w.banners[0].battleId === ds?.battleId && w.ann.holding === 0, `A3a baner podejścia wyszedł (${w.banners.length}), grupa zamknięta`);
  assert(w.released[0] > (ds?.f ?? 0) + 30, `A3b wyszedł dopiero po przylocie i oknie łaski (klatka ${w.released[0]} vs starcie ${ds?.f})`);
});

// ═══ A5–A7 — na co grupa czeka (piny luk z baterii mutantów) ════════════════════════════════════════════════════
console.log('A5 — podejście daleko od kolonii (pikieta): grupa czeka, aż ocaleli dolecą (sufit czekania wydłużony — samo czekanie)');
guard('A5', () => {
  const w = raidWorld({ raiders: 3, defenders: 1, dist: 1.4, picketAU: 0.9, tower: 3, grid: 2, frames: 16300, holdMaxMs: 400000 });
  const ds = w.events.find((e) => e.kind === 'DSCS'), ea = w.events.find((e) => e.kind === 'EAH');
  assert(!!ds && !!ea && ea.f - ds.f > 300, `A5-0 świadek: między podejściem a bitwą o kolonię ${ea && ds ? ea.f - ds.f : '?'} klatek (okno łaski grupy ≈ 108)`);
  const n = w.events.length;
  assert(w.banners.length === 1 && (w.banners[0]?.result?.raidBattleIds?.length ?? 0) === n && n >= 2,
    `A5a jeden baner po wszystkich ${n} bitwach rajdu (${w.events.map((e) => e.kind).join(' → ')}; banery: ${w.banners.length})`);
  const c = raidWorld({ raiders: 3, defenders: 1, dist: 1.4, picketAU: 0.9, tower: 3, grid: 2, frames: 16300, announce: 'plain' });
  assert(c.banners.length === n, `A5-K KONTROLA: bez grupy — ${c.banners.length} banery`);
  // SUFIT (domyślny, 15 s prezentacji): rajderzy gonią kolonię dłużej — baner podejścia wychodzi po sufit, bitwy o kolonię — osobno
  const d = raidWorld({ raiders: 3, defenders: 1, dist: 1.4, picketAU: 0.9, tower: 3, grid: 2, frames: 16300 });
  const dsF = d.events.find((e) => e.kind === 'DSCS')?.f ?? 0, capF = Math.round(RAL.RAID_ANNOUNCE?.HOLD_MAX_MS / 16);
  assert(d.cappedAt.length === 1 && d.released[0] - dsF >= capF - 2 && d.released[0] - dsF <= capF + 200 && d.banners[0]?.battleId === ds?.battleId,
    `A5c sufit: baner podejścia po ${d.released[0] - dsF} klatkach (sufit ${capF}), sam — rajderzy dalej w drodze`);
  assert(d.banners.length === n && d.ann.holding === 0, `A5d po sufit bitwy o kolonię mają własne banery (${d.banners.length} na ${n} bitwy)`);
});
console.log('A6 — baner bitwy o kolonię czeka na koniec powtórki: grupa czeka na niego, nie wychodzi z samym podejściem');
guard('A6', () => {
  const w = raidWorld({ raiders: 2, defenders: 1, dist: 0.6, tower: 3, grid: 2, frames: 6400, holdColonyFrames: 600 });
  const ea = w.events.find((e) => e.kind === 'EAH');
  assert(!!ea && w.banners.length === 1 && (w.banners[0]?.result?.raidBattleIds?.length ?? 0) === 2 && w.released[0] >= ea.f + 600,
    `A6a jeden baner, PO banerze kolonii (klatka ${w.released[0]} ≥ ${ea ? ea.f + 600 : '?'})`);
});
// ⚠ Klauzula „na orbicie celu = przyleciał” chroni przed misją `attack` spoza MOS, która zostaje na statku na orbicie celu, gdy EAH bitwy
//   nie daje (MOS zeruje misję przy przylocie wyłącznie dla własnych rozkazów; misja narzędzia `cvOrbitalBattle` po starciu DSCS wraca
//   jako `null` — zmierzone, więc w łańcuchu bitew stanu nie da się zbudować). Dlatego pin na samym predykacie (wykonanie).
console.log('A7 — `raidBusy`: kto jest „w drodze”');
guard('A7', () => {
  const at = (state, dockedAt, extra = {}) => ({ id: 'r1', position: { state, dockedAt }, ...extra });
  const atk = { type: 'attack', targetId: 'p_home' };
  const busy = (v, inCombat = () => false) => RAL.raidBusy?.(v, { inCombat });
  assert(busy(at('in_transit', null, { mission: atk })) === true, 'A7a w locie z misją ataku — w drodze');
  assert(busy(at('orbiting', 'p_home', { mission: atk })) === false, 'A7b na orbicie celu z misją ataku — przyleciał (EAH bez bitwy nie zawiesza grupy)');
  assert(busy(at('orbiting', 'p_other', { mission: atk })) === true, 'A7c na orbicie INNEGO ciała z misją ataku — dalej w drodze');
  assert(busy(at('in_transit', null, { _suspendedMission: atk })) === true, 'A7d misja ataku zawieszona na czas starcia — w drodze');
  assert(busy(at('orbiting', 'p_home'), (id) => id === 'r1') === true, 'A7e w aktywnym starciu — w drodze (kolejność odwrotna)');
  assert(busy(at('orbiting', null, { isWreck: true, mission: atk })) === false && busy(null) === false && busy(at('orbiting', null)) === false,
    'A7f wrak, brak statku, bez misji — nie czeka');
});

// ═══ A4 — scalanie ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('A4 — mergeRaidBattles');
guard('A4', () => {
  // CV-Z (Finding 721) — A4b przecelowane świadomie: pinowało sumę `lossesA/B` z DWÓCH jednostek (DSCS — statki, EAH — HP: 2 + 40 = 42),
  // czyli sam defekt. Teraz straty scalonego rajdu = utracone OKRĘTY (DSCS z `lossesA/B` przy `source: 'dscs'`, EAH z `shipLosses`).
  const dsc = { battleId: 'd1', playerSide: 'A', source: 'dscs', result: { id: 'd1', winner: 'B', lossesA: 2, lossesB: 0, turns: 15, location: { point: { x: 1, y: 1 } } } };
  const col = { battleId: 'e1', playerSide: 'B', warId: 'w1', source: 'orbital', shipLosses: { A: 3, B: 0 }, result: { id: 'e1', winner: 'B', lossesA: 120, lossesB: 40, turns: 9, location: { planetId: 'p', point: null } } };
  const m = RAL.mergeRaidBattles?.([dsc, col]);
  assert(m && m.result.winner === 'B' && m.playerSide === 'B' && m.warId === 'w1' && m.result.location.planetId === 'p', 'A4a orientacja, wojna i miejsce — z ostatniej bitwy (kolonia)');
  assert(m && m.result.lossesB === 2 && m.result.lossesA === 3 && m.shipLosses?.B === 2 && m.shipLosses?.A === 3 && m.result.turns === 24, `A4b utracone okręty gracza 2 + 0 = ${m?.result?.lossesB}, wroga 0 + 3 = ${m?.result?.lossesA} (nie 42 / 120 z HP), tury 24`);
  assert(dsc.result.lossesA === 2 && col.result.turns === 9 && !('raidBattleIds' in col.result), 'A4c wejście nietknięte');
  assert(RAL.mergeRaidBattles?.([col]) === col, 'A4d jedna bitwa — ten sam obiekt');
});

// ═══ B1 — #713 EAH ════════════════════════════════════════════════════════════════════════════════════════════════
console.log('B1 — #713: wpis skutków EAH — przejęty w trakcie zdarzenia nie wychodzi; nieprzejęty po skutkach; flaga OFF jak dotąd');
guard('B1', () => {
  const sc = { raiders: 2, defenders: 0, dist: 0.3, tower: 3, grid: 2, frames: 120, announce: 'plain' };
  const free = raidWorld(sc);
  const p = free.payloads.find((x) => x.fx?.kind === 'orbital');
  assert(!!p && p.result.winner === 'B' && Array.isArray(p.fx.logEntries) && p.fx.logEntries.length === 1, 'B1-0 świadek: obrona wygrywa, `fx.logEntries` niesie jeden wpis skutków (zestrzeleni)');
  const txt = p?.fx?.logEntries?.[0]?.text;
  const pushed = free.log.filter((e) => e.text === txt);
  const lastWreck = free.seq.lastIndexOf('wreck'), logAt = free.seq.lastIndexOf('log');
  assert(pushed.length === 1 && lastWreck >= 0 && logAt > lastWreck, `B1a nieprzejęty: EAH pisze go raz, PO wrakach (wpis ${logAt}, ostatni wrak ${lastWreck})`);
  const held = raidWorld({ ...sc, claim: true });
  const tx2 = held.claimed[0]?.text;
  assert(typeof tx2 === 'string' && tx2.length > 0 && tx2 === txt && held.log.filter((e) => e.text === txt).length === 0, 'B1b przejęty (`fx.logHeld`): ten sam wpis w `fx.logEntries`, EAH go nie pisze');
  F.cvOrbital = false;
  const off = raidWorld(sc);
  F.cvOrbital = FLAG0;
  const po = off.payloads.find((x) => x.result?.location?.planetId);
  assert(po && po.fx === null && off.log.filter((e) => e.text === txt).length === 1, 'B1c flaga OFF: bez `fx`, wpis skutków jak dotąd');
  // treść 1:1 z dawnych gałęzi skutków (pat / remis / wygrana napastnika — bez wpisu)
  const E = new EnemyAttackHandler();
  const mk = (winner, extra = {}) => E._orbitalLogEntry?.({ result: { winner, ...extra }, count: 3, firstVessel: { name: 'X' }, systemId: 'sys_t' });
  const stale = mk('draw', { endReason: 'no_damage_possible' }), draw = mk('draw');
  assert(typeof E._orbitalLogEntry === 'function' && mk('A') === null && mk('B')?.severity === 'info' && stale?.severity === 'warn' && draw?.severity === 'warn' && stale.text !== draw.text,
    'B1d wpis: napastnik wygrał — brak; obrona — info; pat i remis — dwa różne ostrzeżenia');
  assert(/if \(logEntry && !fx\?\.logHeld\) evtLog\?\.push\(logEntry\);/.test(EAH_SRC) && /if \(fx\) fx\.logEntries = logEntry \? \[logEntry\] : \[\];/.test(EAH_SRC)
    && EAH_SRC.indexOf('fx.logEntries = logEntry') < EAH_SRC.indexOf("EventBus.emit('battle:resolved'"), 'B1e źródło EAH: wpis do `fx` PRZED zdarzeniem, zapis po skutkach tylko bez przejęcia');
});

// ═══ B2 — #713 GameScene ═════════════════════════════════════════════════════════════════════════════════════════
console.log('B2 — #713: GameScene — linia, skutki i „Utracono kontakt” powtórki czekają na jej koniec');
guard('B2', () => {
  const line = handlerAt(GS, 'battle:resolved', 1);
  assert(/handle\?\.\(\{ warId, battleId, result, fx \}\) === true\) \{\s*fx\.logHeld = true;\s*\(this\._orbitalLogHold \?\?= new Map\(\)\)\.set\(battleId, \{ line: this\._battleLogEntry\(\{ warId, result, shipLosses: fx\.shipsLost \}\), extras: fx\.logEntries \?\? \[\] \}\);/.test(line),
    'B2a linia bitwy powtórki + wpisy skutków EAH przejęte i trzymane do końca powtórki');
  const end = handlerAt(GS, 'combatfx:orbitalReplayEnd');
  const iLine = end.indexOf('_writeBattleLine(held.line'), iEx = end.indexOf('held.extras'), iC = end.indexOf("_noteContact('lost'"), iB = end.indexOf('_queueBanner(b)');
  assert(iLine > 0 && iEx > iLine && iC > iEx && iB > iC, 'B2b koniec powtórki: linia → skutki → kontakty → baner (kolejność jak poza widokiem)');
  const lost = handlerAt(GS, 'intel:vesselContactLost');
  assert(/reason === 'wrecked' && GAME_CONFIG\.FEATURES\?\.cvOrbital \? this\.threeRenderer\?\.cvOrbital\?\.heldBattleOf\?\.\(vesselId\) : null/.test(lost) && /_orbitalContactHold/.test(lost),
    'B2c „Utracono kontakt” wraku, który w powtórce jeszcze nie zginął — trzymany pod jej bitwą');
  assert(/this\._releaseRaids\(nowMs\)/.test(body(GS, '  _tickAnnouncements(realNowMs) {')), 'B2d klatka ogłoszeń zwalnia rajdy');
  assert(/offerBanner\(b\)/.test(body(GS, '  _queueBanner(b) {')) && /offerLine\(battleIds\)/.test(body(GS, '  _writeBattleLine(entry, battleIds = []) {'))
    && /this\._writeBattleLine\(o\.entry, o\.battleIds/.test(body(GS, '  _writeNarration(outs) {')), 'B2e baner i linia (także narratora klastra) przez bramkę rajdu');
  const bnr = handlerAt(GS, 'battle:resolved', 0);
  const iNote = bnr.indexOf('this._noteRaidBattle('), iGate = bnr.indexOf('if (!sides.playerInvolved) return;');
  assert(iNote > iGate && iGate > 0 && /if \(GAME_CONFIG\.FEATURES\?\.cvOrbital\) this\._noteRaidBattle/.test(bnr), 'B2f bitwa trafia do rajdu po bramkach banera, pod flagą `cvOrbital`');
  // linie odwrotu (`vessel:autoRetreatIssued`, UIManager) bitwy orbitalnej w powtórce — decyzja po zdarzeniu, wstrzymane, wrak bez linii
  const ret = handlerAt(UI, 'vessel:autoRetreatIssued');
  const retEnd = UI.slice(UI.indexOf("EventBus.on('combatfx:orbitalReplayEnd'"), UI.indexOf("EventBus.on('combatfx:orbitalReplayEnd'") + 600);
  assert(/!String\(battleId\)\.startsWith\('battle_ds_'\)/.test(ret) && /queueMicrotask\(\(\) => \{\s*if \(orb\.replays\?\.has\?\.\(battleId\)\)/.test(ret)
    && /_orbitalRetreatHold/.test(ret) && /if \(window\.KOSMOS\?\.vesselManager\?\.getVessel\?\.\(h\.vesselId\)\?\.isWreck\) continue;/.test(retEnd),
    'B2h UIManager: linia odwrotu strony bitwy orbitalnej w powtórce czeka na jej koniec, wrak bez linii (#632); DSCS i poza widokiem — od razu');
  // `CvOrbital.heldBattleOf` — wykonanie na stanie powtórki
  const o = new CvOrbital({ _presClock: { nowMs: 0 } });
  o.replays.set('b1', { battleId: 'b1', rep: { kills: { v1: 3 } }, shown: new Set() });
  const a = o.heldBattleOf?.('v1'), b = o.heldBattleOf?.('v9');
  o.replays.get('b1').shown.add('v1');
  assert(a === 'b1' && b === null && o.heldBattleOf?.('v1') === null, 'B2g `heldBattleOf`: zaplanowane niepokazane — bitwa; obcy / już pokazany — null');
});

// ═══ C1 — Finding 157 ═════════════════════════════════════════════════════════════════════════════════════════════
console.log('C1 — Finding 157: auto-slow klasyfikuje gracza kanonem na każdej ścieżce orbitalnej');
guard('C1', () => {
  const h = handlerAt(UI, 'battle:resolved');
  assert(/isPlayerParticipant\(result\.participantA\)/.test(h) && /isPlayerParticipant\(result\.participantB\)/.test(h) && /_triggerAutoSlowIfTime\(/.test(h)
    && !/fx|warId|vessel_group|empireId ===|type ===/.test(h), 'C1a UIManager: auto-slow = kanon na obu uczestnikach, bez innych warunków (bez `fx`, wojny, rodzaju)');
  const cases = [];
  const warW = raidWorld({ raiders: 2, defenders: 0, dist: 0.3, tower: 3, grid: 2, frames: 120, announce: 'plain' });
  cases.push(['obrona kolonii z wojną (cvOrbital ON)', warW.payloads.find((x) => x.result?.location?.planetId)]);
  const skW = raidWorld({ raiders: 2, defenders: 0, dist: 0.3, frames: 120, announce: 'plain', war: false });
  cases.push(['potyczka EAH bez wojny', skW.payloads.find((x) => x.result?.location?.planetId)]);
  F.cvOrbital = false;
  const offW = raidWorld({ raiders: 2, defenders: 0, dist: 0.3, tower: 3, grid: 2, frames: 120, announce: 'plain' });
  F.cvOrbital = FLAG0;
  cases.push(['obrona kolonii, flaga OFF', offW.payloads.find((x) => x.result?.location?.planetId)]);
  const fb = read('src/systems/WarSystem.js');
  const fbPart = /participantB:\s*\{\s*type:\s*'player',\s*empireId:\s*'player'/.test(fb) ? { result: { participantA: { type: 'empire', empireId: EMP }, participantB: { type: 'player', empireId: 'player' } } } : null;
  cases.push(['forceBattle (kształt z WarSystem)', fbPart]);
  const ok = cases.filter(([, p]) => p && (isPlayerParticipant(p.result.participantA) || isPlayerParticipant(p.result.participantB)));
  assert(ok.length === cases.length, `C1b gracz rozpoznany na każdej ścieżce: ${cases.map(([n, p]) => `${n}: ${p ? 'tak' : 'BRAK'}`).join('; ')}`);
  assert(cases[1][1]?.warId === null && cases[0][1]?.warId != null, 'C1c świadek: ścieżka wojny ma `warId`, potyczka — nie (obie ścieżki naprawdę przebiegły)');
});

// ═══ D1 — §3.1-6 ══════════════════════════════════════════════════════════════════════════════════════════════════
console.log('D1 — §3.1-6: po powtórce wiersz wyniku na pasku walki + linia bitwy w Dzienniku');
guard('D1', () => {
  const o = new CvOrbital({ _presClock: { nowMs: 0 }, cvTuning: { ...ORB_TUNING } });
  window.KOSMOS = window.KOSMOS ?? {};
  window.KOSMOS.activeSystemId = 'sys_t';
  const venc = { id: 'orb:b1', orbital: true, isActive: false, sideA: { vesselIds: ['a1'], joinedVesselIds: [], ownerEmpireId: EMP }, sideB: { vesselIds: ['d1'], joinedVesselIds: [], ownerEmpireId: 'player' },
    vesselStates: new Map([['a1', { hp: 0, hpStart: 100 }], ['d1', { hp: 60, hpStart: 100 }]]), location: { systemId: 'sys_t', planetId: 'p_home', point: { x: 1, y: 2 } }, currentRound: 14, timeline: [] };
  const st = { battleId: 'b1', encId: 'orb:b1', venc, deferred: new Map(), holdHidden: new Set(), outcome: 'victory', stageIds: [] };
  o.replays.set('b1', st); o._byEnc.set('orb:b1', st);
  o._end(st, 'ended');
  const e0 = o.endedEncounters?.() ?? [];
  o.r._presClock.nowMs = ORB_TUNING.ORB_RESULT_LINGER_MS + 1;
  const e1 = o.endedEncounters?.() ?? [];
  assert(e0.length === 1 && e0[0].outcome === 'victory' && e1.length === 0, `D1a wiersz wyniku po końcu powtórki (${e0.length}), znika po ${ORB_TUNING.ORB_RESULT_LINGER_MS} ms prezentacji (${e1.length})`);
  const st2 = { ...st, battleId: 'b2', encId: 'orb:b2', venc: { ...venc, id: 'orb:b2' } };
  o.replays.set('b2', st2); o._byEnc.set('orb:b2', st2); o.r._presClock.nowMs = 0; o._recent = [];
  o._end(st2, 'aborted');
  assert((o.endedEncounters?.() ?? [1]).length === 0, 'D1b przerwana powtórka (zmiana układu) — bez wiersza wyniku');
  assert(orbitalOutcome({ winner: 'B' }) === 'victory' && orbitalOutcome({ winner: 'A' }) === 'defeat' && orbitalOutcome({ winner: 'draw' }) === 'draw'
    && orbitalOutcome({ winner: 'draw', endReason: 'safety_cap' }) === 'stalemate', 'D1c wynik z perspektywy gracza (EAH: B = gracz)');
  // CombatStrip — wiersz wyniku rysuje słowo wyniku zamiast „R n”
  o.r._presClock.nowMs = 0; o._recent = [{ venc, outcome: 'victory', endedAt: 0 }];
  const texts = [];
  const ctx = new Proxy({ font: '10px monospace' }, { get(t0, k) { if (k === 'measureText') return (s) => ({ width: [...String(s)].length * 6 });
    if (k === 'fillText') return (s) => texts.push(String(s)); if (k in t0) return t0[k]; return () => {}; }, set(t0, k, v) { t0[k] = v; return true; } });
  const K = { threeRenderer: { cvOrbital: o }, deepSpaceCombatSystem: { listActive: () => [] }, vesselManager: { getVessel: () => null }, activeSystemId: 'sys_t',
    empireRegistry: { get: () => ({ name: 'Testowe' }) }, intelSystem: { getVesselContact: () => ({ quality: 'contact' }) } };
  const s0 = new CombatStrip();
  s0.draw(ctx, 1600, 1041, { K, insets: { left: 0, right: 0, top: 28, bottom: 62 } });
  const word = t('combatStrip.result.victory');
  assert(!!s0.rect && texts.some((x) => x.includes(word)) && !texts.some((x) => /^R\d+$/.test(x)), `D1d pasek walki: wiersz z „${word}”, bez „R n” (${texts.length} napisów)`);
  // KONTROLA: ta sama bitwa w trakcie powtórki — „R n”, bez słowa wyniku
  texts.length = 0; o._recent = [];
  const live = { ...venc, isActive: true };
  o.replays.set('b3', { battleId: 'b3', encId: 'orb:b1', venc: live, deferred: new Map(), holdHidden: new Set(), stageIds: [] }); o._byEnc.set('orb:b1', o.replays.get('b3'));
  new CombatStrip().draw(ctx, 1600, 1041, { K, insets: { left: 0, right: 0, top: 28, bottom: 62 } });
  assert(texts.some((x) => /^R14$/.test(x)) && !texts.some((x) => x.includes(word)), 'D1e KONTROLA: w trakcie powtórki — „R14”, bez słowa wyniku');
  const end = handlerAt(GS, 'combatfx:orbitalReplayEnd');
  assert(/_writeBattleLine\(held\.line, \[battleId\]\)/.test(end), 'D1f linia bitwy (`log.battleLine`) wychodzi w Dzienniku po końcu powtórki');
});

F.cvOrbital = FLAG0;
console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
