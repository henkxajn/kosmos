// KEEPER — ARC COLONY SPHERE CS-10b: karta bitwy naziemnej na żywo (D-CS-31) + Finding 797 (znacznik bitwy tylko w bitwie)
// + Finding 798 (runda w `getBattleStateAt`).
//
// Uruchom: node src/testing/smoke/colony_battle_card_smoke.mjs
//
// A  Finding 797 — znacznik bitwy / okno z pola tylko dla bitwy wg systemu walki (wojna + walczące jednostki)
//   A1  czyste: `unitPlacements` z predykatem `battleAt` — pole wspólne w pokoju: układ obok siebie, BEZ znacznika; bitwa: znacznik
//   A2  wykonanie (prawdziwy świat): pokój → `isBattleAt` false; wojna → true; jednostka offline nie walczy (jak pętla walki)
//   A3  źródło: kula rysuje znacznik na `st.battle` (domyślnie bez predykatu — brak znacznika); konsola podaje `isBattleAt`
//   A4  Finding 798 — `getBattleStateAt().round` = liczba rozegranych rund (dawny klucz `_` dawał zawsze 0)
// B  rekord bitwy z PRAWDZIWYCH rund (`CombatSystem.tick(1)` → zdarzenia → `ColonyBattleFeed`)
//   B1  start raz na bitwę; runda rekordu = runda zdarzenia; HP po rundzie; utraty i dziennik; wynik = `combat:hexResolved`
//   B2  model karty: na żywo (HP spada) i po końcu (wynik zostaje, choć pole już nie jest sporne)
// C  otwarcie: konsola tej kolonii → okno samo (raz); inna kolonia / zamknięta konsola → meldunek; klik meldunku → konsola + okno
// D  okno (wykonanie): runda, „na żywo”, utracone jednostki nieklikalne, dziennik, wynik po końcu i brak samozamknięcia
// E  szwy: GameScene podpina rekord i klik meldunku; dzwonek bez zdublowanego wpisu Dziennika; pomocnik prawdziwej bitwy

import '../headless/env.js'; // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n' + s);
const tryImport = async (p) => { try { return await import(p); } catch (e) { console.log('    (import ' + p + ') ' + e.message); return null; } };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const src = (rel) => { try { return readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const body = (s, head) => { const i = s.indexOf(head); if (i < 0) return ''; let d = 0; for (let j = s.indexOf('{', i + head.length - 1); j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) return s.slice(i, j + 1); } return ''; };
function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
}

const FEED = (await tryImport('../../ui/ColonyBattleFeed.js')) ?? {};
const UL = (await tryImport('../../renderer/ColonyUnitLogic.js')) ?? {};
const BW = (await tryImport('../../ui/ColonyBattleWindow.js')) ?? {};
const { bootWithDirector } = await import('../headless/DirectorHarness.js');
const { CombatSystem } = await import('../../systems/CombatSystem.js');
const { NotificationCenter } = await import('../../systems/NotificationCenter.js');
const { default: EventBus } = await import('../../core/EventBus.js');
const { t } = await import('../../i18n/i18n.js');
const { geodesicTopology } = await import('../../map/GeodesicTopology.js');
const { tileGraphOf } = await import('../../map/TileGraph.js');

// ── A1 — czyste rozstawienie ───────────────────────────────────────────────────────────────────
header('A  Finding 797 — battle marker only for a battle the combat system fights');
if (!UL.unitPlacements) assert(false, 'A1 unitPlacements missing'); else {
  const topo = geodesicTopology(3);
  const mk = (id, owner) => ({ id, q: 10, r: -1, planetId: 'p', owner, status: 'idle', archetypeId: 'shock_infantry', hp: 10, hpMax: 10, _path: [] });
  const units = [mk('a', 'player'), mk('b', 'emp_001')];
  const peace = UL.unitPlacements({ units, topo, battleAt: () => false });
  const war = UL.unitPlacements({ units, topo, battleAt: (i) => i === 10 });
  const legacy = UL.unitPlacements({ units, topo });
  const sp = peace.stacks[0], sw = war.stacks[0];
  assert(sp?.contested === true && sp.battle === false && UL.battleTilesOf(peace).length === 0 && UL.unitFrameDelayMs(peace) === Infinity
    && sw?.battle === true && UL.battleTilesOf(war).length === 1 && UL.unitFrameDelayMs(war) < Infinity
    && peace.items.every(i => i.contested) && legacy.stacks[0]?.battle === true,
  'A1 shared tile in peace: side-by-side layout kept, NO battle marker, no effect frames; battle → marker + frames; no predicate (pure CS-10 callers) → as before');
}

// ── świat: prawdziwa dyplomacja, prawdziwy GroundUnitManager i CombatSystem ───────────────────
function boot() {
  const { core, K } = quiet(() => bootWithDirector({ quiet: true }));
  if (K.garrisonSystem) K.garrisonSystem.enabled = false;
  if (K.fleetPoolSystem) K.fleetPoolSystem.enabled = false;
  K.combatSystem = new CombatSystem();
  const cm = core.colonyManager;
  const home = cm.getColony(K.homePlanet.id);
  home.credits = 1e6;
  const emp = cm.getAllColonies().find(c => c.ownerEmpireId)?.ownerEmpireId ?? null;
  const tiles = tileGraphOf(home.grid).tiles().filter(x => x.type !== 'ocean' && !x.capitalBase && !x.buildingId
    && K.groundUnitManager.getUnitsAtHex(home.planetId, x.q, x.r).length === 0);
  return { core, K, cm, gum: K.groundUnitManager, dip: K.diplomacySystem, home, emp, tiles };
}
const w = boot();
const own = (t, arch = 'shock_infantry') => { const u = w.gum.createUnit(arch, w.home.planetId, t.q, t.r, { owner: 'player', factionId: 'humanity' }); u.homeColonyId = w.home.planetId; return u; };
const ai = (t, arch = 'shock_infantry', morale = 60) => w.gum.createAIUnit({ archetypeId: arch, empireId: w.emp, planetId: w.home.planetId, q: t.q, r: t.r, morale, deployed: true })?.unit ?? null;

{
  const T = w.tiles[0], pid = w.home.planetId;
  const u1 = own(T), e1 = ai(T);
  const peaceBattle = w.K.combatSystem.isBattleAt?.(pid, T.q, T.r), peaceContested = w.K.combatSystem.isHexContested(pid, T.q, T.r);
  quiet(() => w.dip.declareWar(w.emp, 'keeper_setup'));
  const warBattle = w.K.combatSystem.isBattleAt?.(pid, T.q, T.r);
  u1.status = 'offline';
  const offBattle = w.K.combatSystem.isBattleAt?.(pid, T.q, T.r), offContested = w.K.combatSystem.isHexContested(pid, T.q, T.r);
  const loop = w.K.combatSystem._findContestedHexes(w.gum).some(h => h.planetId === pid && h.q === T.q && h.r === T.r);
  assert(!!u1 && !!e1 && !!w.emp && peaceBattle === false && peaceContested === false && warBattle === true,
    `A2a executed (real world): own + empire unit on one tile — peace: no battle; war declared: battle (${peaceBattle} → ${warBattle})`);
  assert(offBattle === false && loop === false && offContested === true,
    'A2b offline own unit: no battle (same as the combat loop `_findContestedHexes`), while the old tooltip predicate still says contested (witness)');
  w.gum.removeUnit(u1.id); w.gum.removeUnit(e1.id);
}
{
  const us = stripComments(src('src/ui/ColonySphereUnits.js')), co = stripComments(src('src/ui/ColonyOverlay.js'));
  const click = body(co, '  _sphereClick(colony, grid, tile, x, y) {');
  assert(/if \(st\.battle\) \{/.test(us) && !/if \(st\.contested\) \{/.test(us) && /typeof s\.battleAt === 'function' \? s\.battleAt : \(\) => false/.test(us),
    'A3a sphere HUD: the crossed blades are drawn for `battle` stacks; without a predicate in the state there is no marker');
  assert(/battleAt: colony \? \(i\) => !!window\.KOSMOS\?\.combatSystem\?\.isBattleAt\?\.\(colony\.planetId, i, -1\)/.test(co)
    && /combatSystem\?\.isBattleAt\?\.\(colony\.planetId, at\.q, at\.r\)/.test(click) && !/isHexContested/.test(click),
  'A3b console: the unit sync passes CombatSystem.isBattleAt; a click opens the window only for a battle (not merely a shared tile)');
}
{
  const T = w.tiles[1], pid = w.home.planetId;
  const a = own(T), b = ai(T, 'shock_infantry', 100);
  a.hp = a.hpMax = a.currentHP = 400; b.hp = b.hpMax = b.currentHP = 400; a.morale = a.maxMorale = 100;
  const cs = w.K.combatSystem;
  quiet(() => { cs.tick(1); cs.tick(1); });
  const st = cs.getBattleStateAt(pid, T.q, T.r);
  assert(st?.round === 2, `A4 Finding 798: getBattleStateAt().round = rounds fought (2), was always 0 (key "_" vs "|"): ${st?.round}`);
  w.gum.removeUnit(a.id); w.gum.removeUnit(b.id);
  quiet(() => cs.tick(1));   // pole przestaje być sporne → rozstrzygnięcie (porządek)
}

// ── B — prawdziwe rundy → rekord ──────────────────────────────────────────────────────────────
header('B  battle record from real combat rounds');
let feed = null, starts = [], rec = null, events = { round: [], destroyed: [], resolved: [] };
if (!FEED.ColonyBattleFeed) assert(false, 'B ColonyBattleFeed missing'); else {
  const T = w.tiles[2], pid = w.home.planetId;
  feed = new FEED.ColonyBattleFeed({ kosmos: () => w.K, onStart: (r) => starts.push(r.key) }).attach(EventBus);
  w.K.colonyBattleFeed = feed;
  const onR = (p) => { if (p.planetId === pid && p.q === T.q && p.r === T.r) events.round.push(p.round); };
  const onD = (p) => events.destroyed.push(p.unitId);
  const onH = (p) => { if (p.planetId === pid && p.q === T.q && p.r === T.r) events.resolved.push(p); };
  EventBus.on('combat:round', onR); EventBus.on('groundUnit:destroyed', onD); EventBus.on('combat:hexResolved', onH);
  const mine = [own(T), own(T), own(T, 'rocket_artillery')];
  for (const u of mine) u.morale = u.maxMorale = 100;
  const theirs = [ai(T), ai(T), ai(T)];
  const ids = new Set([...mine, ...theirs].map(u => u.id));
  const hp0 = mine.reduce((s, u) => s + u.hp, 0);
  const cs = w.K.combatSystem;
  quiet(() => cs.tick(1));
  rec = feed.get(pid, T.q, T.r);
  const live1 = FEED.battleCardModel(rec, cs.getBattleStateAt(pid, T.q, T.r), {}, null);
  const hp1 = [...rec.units.values()].filter(u => u.owner === 'player').reduce((s, u) => s + (u.state === 'alive' ? u.hp : 0), 0);
  assert(starts.length === 1 && rec?.started && rec.round === 1 && events.round[0] === 1 && rec.units.size === 6 && [...rec.units.keys()].every(id => ids.has(id))
    && rec.log.some(e => e.kind === 'round' && e.round === 1),
  `B1a round 1: start reported once, record round 1, all 6 units on the roster, round line in the log (starts ${starts.length}, roster ${rec?.units.size})`);
  assert(hp1 < hp0 && live1?.ownHp === hp1 && live1.round === 1 && live1.ended === false && live1.outcome === null,
    `B1b HP after the round come from the hits (own ${hp0} → ${hp1}); live card model shows round 1, not ended`);
  let guard = 0;
  quiet(() => { while (events.resolved.length === 0 && guard++ < 400) cs.tick(1); });
  const killsLogged = rec.log.filter(e => e.kind === 'kill').length + rec.log.filter(e => e.kind === 'collapse').length;
  const gone = [...rec.units.values()].filter(u => u.state !== 'alive');
  const destroyedHere = events.destroyed.filter(id => ids.has(id));
  assert(starts.length === 1 && rec.round === events.round[events.round.length - 1] && events.round.every((r, i) => r === i + 1),
    `B1c ${rec.round} rounds: record round follows every combat:round; start still reported once`);
  assert(destroyedHere.length > 0 && destroyedHere.every(id => rec.units.get(id)?.state === 'destroyed') && gone.length >= destroyedHere.length,
    `B1d every unit destroyed in combat is marked destroyed on the roster (${destroyedHere.length}); lost/retreated ${gone.length}`);
  const killRounds = rec.log.filter(e => e.kind === 'kill').map(e => e.round);
  assert(killsLogged > 0 && killRounds.every(r => r >= 1 && r <= rec.round),
    'B1e kills logged with the round in which they happened (events before combat:round belong to the next round)');
  const res = events.resolved[0];
  assert(rec.ended === true && rec.winnerId === (res?.winnerId ?? null) && rec.log[rec.log.length - 1]?.kind === 'result'
    && FEED.battleOutcome(rec) === (res?.winnerId === 'player' ? 'win' : (res?.winnerId ? 'loss' : 'draw')),
  `B1f result = combat:hexResolved (winner ${res?.winnerId}); last log line = result; outcome ${FEED.battleOutcome(rec)}`);
  const after = FEED.battleCardModel(rec, cs.getBattleStateAt(pid, T.q, T.r), {}, null);
  assert(!!after && after.ended && after.outcome === FEED.battleOutcome(rec) && after.log.length <= FEED.BATTLE_FEED.MAX_LOG && after.log.length > 0
    && (after.ownLost + after.enemyLost) >= destroyedHere.length,
  'B2 card model after the end: still there (tile no longer contested), outcome, losses, last log lines');
  EventBus.off('combat:round', onR); EventBus.off('groundUnit:destroyed', onD); EventBus.off('combat:hexResolved', onH);
}

// ── C — otwarcie okna / meldunek ─────────────────────────────────────────────────────────────
header('C  auto-open once per battle; notification when the console is elsewhere');
if (!FEED.battleStartAction || !FEED.handleBattleStart) assert(false, 'C battleStartAction / handleBattleStart missing'); else {
  const A = FEED.battleStartAction, r0 = { planetId: 'p1', autoOpened: false, notified: false };
  assert(A({ rec: r0, consoleOn: true, consolePlanetId: 'p1' }) === 'open'
    && A({ rec: r0, consoleOn: true, consolePlanetId: 'p1', windowBusy: true }) === 'none'
    && A({ rec: r0, consoleOn: true, consolePlanetId: 'p2', playerSide: true, sphere: true }) === 'notify'
    && A({ rec: r0, consoleOn: false, playerSide: true, sphere: true }) === 'notify'
    && A({ rec: r0, consoleOn: false, playerSide: true, sphere: false }) === 'none'
    && A({ rec: r0, consoleOn: false, playerSide: false, sphere: true }) === 'none'
    && A({ rec: { ...r0, autoOpened: true }, consoleOn: true, consolePlanetId: 'p1' }) === 'none'
    && A({ rec: { ...r0, notified: true }, consoleOn: false, playerSide: true, sphere: true }) === 'none',
  'C1 decision: console on that colony → open (not over another live battle window); elsewhere + own units + sphere colony → notify; flat / AI-only → none; once');
  const mkRec = (q) => ({ key: FEED.battleKey('p1', q, -1), planetId: 'p1', q, r: -1, units: new Map([['u', { owner: 'player' }]]), autoOpened: false, notified: false, ended: false });
  const added = [], opened = [];
  const ov = { visible: true, _consoleOn: true, _cBattle: null, _getColony: () => ({ planetId: 'p1' }) };
  const K = { overlayManager: { active: 'colony', overlays: { colony: ov }, openPanel: (id, o) => opened.push([id, o]) }, colonyManager: { getColony: () => ({ grid: { kind: 'geo' }, planet: { name: 'Terra' } }) },
    notificationCenter: { add: (n) => { added.push(n); return 'n1'; } }, combatSystem: { isBattleAt: () => true }, colonyBattleFeed: { get: () => null }, uiManager: {} };
  const ra = mkRec(5);
  const a1 = FEED.handleBattleStart(K, ra), a2 = FEED.handleBattleStart(K, ra);
  assert(a1 === 'open' && ov._cBattle?.q === 5 && ov._cBattle.planetId === 'p1' && ra.autoOpened === true && a2 === 'none' && added.length === 0,
    'C2 executed: console on the battle colony → window opens by itself, once (second start of the same record → nothing)');
  const rb = mkRec(9);
  const a3 = FEED.handleBattleStart(K, rb);
  assert(a3 === 'none' && ov._cBattle.q === 5, 'C3 executed: another live battle already in the window → it stays (the new one has its marker)');
  ov._consoleOn = false; ov.visible = false; K.overlayManager.active = null;
  const rc = mkRec(12);
  const a4 = FEED.handleBattleStart(K, rc, { t, nameOf: () => 'Terra' });
  const n = added[0];
  assert(a4 === 'notify' && added.length === 1 && n.source === 'groundBattle' && n.type === 'groundBattle' && n.noLog === true
    && n.payload.planetId === 'p1' && n.payload.q === 12 && n.payload.r === -1 && n.title === t('notif.groundBattleTitle', 'Terra') && rc.notified,
  'C4 executed: console closed → one bell notification (ground battle, colony name, tile), no duplicate Event Log line');
  ov._cBattle = null;
  const ok = FEED.openBattleCard({ ...K, colonyBattleFeed: { get: () => rc } }, n.payload);
  assert(ok && opened.length === 1 && opened[0][0] === 'colony' && opened[0][1].colonyId === 'p1' && ov._cBattle?.q === 12 && rc.autoOpened === true,
    'C5 executed: clicking the notification opens the colony console of that colony with the battle window');
  // prawdziwy NotificationCenter: noLog → bez wpisu Dziennika
  const pushes = [];
  const saveLog = w.K.eventLogSystem;
  w.K.eventLogSystem = { push: (e) => pushes.push(e) };
  const nc = new NotificationCenter();
  const id1 = nc.add({ type: 'groundBattle', severity: 'danger', source: 'groundBattle', noLog: true, title: 'x', payload: { planetId: 'p1', bodyId: 'p1' } });
  const id2 = nc.add({ type: 'tileLost', severity: 'warning', source: 'x', title: 'y', payload: {} });
  w.K.eventLogSystem = saveLog;
  assert(!!id1 && !!id2 && pushes.length === 1 && nc._items.length >= 2, 'C6 executed: NotificationCenter `noLog` adds the bell entry without an Event Log line (control: a normal entry still logs)');
}

// ── D — okno ───────────────────────────────────────────────────────────────────────────────────
header('D  battle window draws the live card and keeps the outcome');
function countCtx() {
  const texts = [];
  return new Proxy({}, { get: (_, k) => (k === 'texts' ? texts : (k === 'measureText' ? () => ({ width: 40 }) : (k === 'getTransform' ? () => ({ a: 1 }) : (...a) => { if (k === 'fillText') texts.push(String(a[0])); }))), set: () => true });
}
if (!BW.drawBattleWindow || !rec) assert(false, 'D drawBattleWindow / record missing'); else {
  const zones = [], ov = { _cBattle: { planetId: rec.planetId, q: rec.q, r: rec.r }, _hoverZone: null, _addHit: (x, y, ww, h, type, data) => zones.push({ type, data }), _graphFor: () => null };
  const roles = { primary: '#0ff', dim: '#555', alert: '#f50', positive: '#0f0' };
  const Z = { hero: { x: 0, y: 0, w: 1000, h: 700 }, inspector: { x: 700, y: 300, w: 300, h: 300 } };
  const saveW = globalThis.window.KOSMOS;
  globalThis.window.KOSMOS = w.K;
  const c = countCtx(), h = BW.drawBattleWindow(ov, c, Z, roles);
  const ended = c.texts.some(s => s.includes(t(rec.winnerId === 'player' ? 'colonyBattle.outcomeWin' : (FEED.battleOutcome(rec) === 'loss' ? 'colonyBattle.outcomeLoss' : 'colonyBattle.outcomeDraw'))));
  const lostIds = [...rec.units.values()].filter(u => u.state !== 'alive').map(u => u.id);
  const clickable = zones.filter(z => z.type === 'drawerUnitClick').map(z => z.data.unitId);
  assert(h > 0 && ov._cBattle !== null && ended && c.texts.some(s => s.includes(t('colonyBattle.round', rec.round))) && !c.texts.some(s => s.includes(t('colonyBattle.live'))),
    `D1 executed: battle over → the window stays with the outcome and the final round; no "live" tag`);
  assert(lostIds.length > 0 && lostIds.every(id => !clickable.includes(id)) && c.texts.some(s => s.includes(t('colonyBattle.stDestroyed')) || s.includes(t('colonyBattle.stRetreated')) || s.includes(t('colonyBattle.stCollapsed')))
    && zones.some(z => z.type === 'cBattleSelectOwn') === false && zones[zones.length - 1].type === 'floatPanel',
  'D2 executed: lost units stay on the card marked, not clickable; "select our units" off after the end; absorber last');
  const line = FEED.battleLogLine(rec.log[rec.log.length - 1]);
  assert(!!line && c.texts.some(s => s.includes(t(line.key, ...line.args))), 'D3 executed: the log lines are drawn (last = result)');
  ov._cBattle = null; zones.length = 0;
  const h0 = BW.drawBattleWindow(ov, countCtx(), Z, roles);
  // na żywo: nowa bitwa, jedna runda
  const T = w.tiles[3], pid = w.home.planetId;
  const a = own(T), b = ai(T, 'shock_infantry', 100);
  a.hp = a.hpMax = a.currentHP = 300; b.hp = b.hpMax = b.currentHP = 300; a.morale = a.maxMorale = 100;
  quiet(() => w.K.combatSystem.tick(1));
  ov._cBattle = { planetId: pid, q: T.q, r: T.r };
  const c2 = countCtx(), h2 = BW.drawBattleWindow(ov, c2, Z, roles);
  assert(h0 === 0 && h2 > 0 && c2.texts.some(s => s.includes(t('colonyBattle.live'))) && c2.texts.some(s => s.includes(t('colonyBattle.round', 1)))
    && zones.some(z => z.type === 'cBattleSelectOwn') && zones.some(z => z.type === 'drawerUnitClick' && z.data.unitId === a.id),
  'D4 executed: live battle → round 1 with the "live" tag, own row clickable, select-own chip; no window open → nothing drawn');
  globalThis.window.KOSMOS = saveW;
}
feed?.detach?.();

// ── E — szwy ───────────────────────────────────────────────────────────────────────────────────
header('E  wiring');
{
  const gs = stripComments(src('src/scenes/GameScene.js')), nc = stripComments(src('src/systems/NotificationCenter.js')), nd = stripComments(src('src/ui/NotificationDropdown.js'));
  const fd = stripComments(src('src/ui/ColonyBattleFeed.js')), dbg = stripComments(src('src/debug/ColonyUnitsPolishDebug.js'));
  assert(/window\.KOSMOS\.colonyBattleFeed\?\.detach\?\.\(\);/.test(gs) && /new ColonyBattleFeed\(\{[\s\S]{0,200}onStart: \(rec\) => handleBattleStart\(window\.KOSMOS, rec/.test(gs) && /\}\)\.attach\(EventBus\)/.test(gs)
    && /notif\?\.source === 'groundBattle' && notif\.payload\) openBattleCard\(window\.KOSMOS, notif\.payload\)/.test(gs),
  'E1 GameScene: one battle record per scene (previous detached), start → handleBattleStart, notification click → openBattleCard');
  const add = body(nc, '  add(notif) {');
  assert(/if \(notif\.noLog\) return notif\.id;/.test(add) && add.indexOf('notif.noLog') < add.indexOf('eventLogSystem') && add.indexOf("EventBus.emit('notify:added'") < add.indexOf('notif.noLog')
    && /groundBattle: +'⚔'/.test(nd) && /case 'groundBattle': +return t\('notif\.group\.groundBattle'\)/.test(nd),
  'E2 bell: `noLog` skips only the Event Log line (after the bell events); ground-battle group with its icon and title');
  assert(fd.length > 3000 && /export class ColonyBattleFeed/.test(fd) && !/Math\.random|Date\.now|\bimport\b/.test(fd) && !/\.(removeUnit|moveUnit|createUnit|createAIUnit)\(/.test(fd) && !/\bu\.hp\s*=|\bunit\.hp\s*=/.test(fd),
    'E3 feed is read-only: no imports, no randomness, no unit writes (no combat rule change)');
  const gb = body(dbg, 'export function csGroundBattle() {');
  assert(/declareWar\?\.\(empire, 'debug_cs10b'\)/.test(gb) && /gum\.createUnit\(/.test(gb) && /gum\.createAIUnit\(/.test(gb) && !/_runBattleRound|_resolveFire/.test(dbg)
    && /cs\.tick\(1\)/.test(body(dbg, 'export function csBattleRound() {')),
  'E4 owner helper: real battle (war + units through the game seams); one round = the public combat tick, never private combat code');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
