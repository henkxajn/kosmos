// FleetWarpDebug — ARC GALAXY G4: pomocniki konsolowe bramki skoku floty (docs/design/GALAXY_G4_GATE_CHECKLIST.md). Wszystkie wywołania bez
// cudzysłowów. Rozpięte w `KOSMOS.debug` (GameScene). Nic w grze ich nie woła; bramka gra na kopii zapisu.
//   fleetWarpRig(kind)      — flota „G4”: 3 fregaty przy domu. 1 = wszyscy zdolni; 2 = trzeci bez napędu warp (K5); 3 = trzeci w rezerwie (K6)
//   fleetWarpPlan(n)        — faza 1 do najbliższego układu o trasie n skoków: etykieta wpisu menu, ETA, wiążący, odmowa
//   fleetWarpIssue(n)       — ten sam rozkaz co klik wpisu menu; `unchanged` = członkowie i rekord co do bitu przy odmowie
//   fleetWarpBattle(i)      — członek i (od 0) w starciu: odsunięty od reszty, zbrojny rajder obok, gra na pauzie (bramka 607)
//   fleetWarpState()        — odczyt: członkowie (układ, stan, przeskoki), rekord, przyloty per układ (ten sam tick), linie Dziennika
//   fleetWarpDivert(i)      — i-ty członek (od 1) zjeżdża z trasy i leci własnym skokiem gdzie indziej
//   fleetWarpStop()         — Stop floty: ta sama metoda co chip „Stop” panelu floty i „Anuluj rozkaz” w Dowództwie
//   fleetWarpOwnOrder(i)    — i-ty członek (od 1) dostaje własny skok do najbliższego układu: czy po Stopie jest wolny
//   fleetWarpSave()         — zapis do slotu (ta sama ścieżka co menu); po nim F5 i „Kontynuuj”
// Finding 603 (docs/design/GALAXY_603_GATE_CHECKLIST.md), domyślnie zaznaczony statek:
//   probe603(id)            — odczyt: stan, układ, misja, rozkaz żywy i ostatni, trasa, rdzenie, Rejestr, płyta, starcie; `patients` = statki w stanie z 603
//   probe603Rig()           — zaznacza okręt solo ze skokiem w układzie z wrogiem, kamera na jego układzie
//   probe603Engage() / probe603Patrol() / probe603Cores(x) — rozkaz na zaznaczonym statku; rdzenie = x
//   probe603Warp(n)         — ten sam rozkaz co klik wpisu menu, do najbliższego układu o trasie n skoków
//   probe603Enemy()         — rajder 5 AU od statku, gra na pauzie · probe603Battle(weak) — zbrojny rajder obok statku + engage + start (weak = 1: rajder na 1 HP, statek wygrywa)
//                             · starcia, gra na pauzie
//   probe603AI()            — para AI rusza na dom gracza; kolejne wywołania: odczyt · probe603Rail() — liczba statków przy gwiazdach szyny
// ⚠ Dane gry dają dziś JEDNĄ prędkość skoku (każdy `engine_warp`: 18 LY/rok), więc blokady prędkości nie da się zobaczyć bez nadpisania. Rig
//   nadpisuje `WarpRouteSystem._baseWarpSpeed` na czas sesji (6 / 12 / 18 LY/rok) — kod gry tego nie zna. Po wczytaniu trasa niesie swoją zablokowaną
//   prędkość w zapisie (`warpRoute.speedLY`), więc nadpisanie nie jest wtedy potrzebne.

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { spawnEnemyRaider } from './SpawnTestEnemy.js';
import { warpDist3D } from '../utils/WarpRoutePlanner.js';
import { systemIdOf } from '../utils/SystemScope.js';
import { fleetWarpMenuOption, fleetWarpStatusLine, runGalaxyFleetWarpOrder, runGalaxyWarpOrder, warpMenuOption } from '../ui/GalaxyWarpLogic.js';
import { galaxyShipRail } from '../ui/GalaxyChromeLogic.js';
import { buildRegistryRows } from '../ui/FleetRegistryLogic.js';
import { hasWeapons, isEnemyVessel, isInService } from '../entities/Vessel.js';

const RIG_NAME = 'G4';
const RIG_MEMBERS = Object.freeze([
  { name: 'G4-wolny',   speedLY: 6,  cores: 10 },   // najwolniejszy — wyznacza ETA
  { name: 'G4-wiazacy', speedLY: 12, cores: 5 },    // najmniejszy zasięg (40 LY) — członek wiążący
  { name: 'G4-szybki',  speedLY: 18, cores: 10 },
]);
const WARP_MODULES = Object.freeze(['engine_warp', 'warp_tank', 'warp_tank']);   // 10 rdzeni, 0,125 rdzenia/LY

const K = () => window.KOSMOS;
const round = (x, d = 3) => (Number.isFinite(x) ? Number(x.toFixed(d)) : x);

let rig = { fleetId: null, vesselIds: [], logSeen: new Set() };   // `logSeen` — wpisy Dziennika sprzed rigu
const speedOverride = new Map();
const targetsByHops = new Map();
const arrivals = new Map();        // systemId → Map(vesselId → gameTime)
const toasts = [];                 // teksty toastów od ostatniego rozkazu / rigu
let recorderOn = false;
let speedPatched = false;

function installRecorder() {
  if (recorderOn) return;
  recorderOn = true;
  EventBus.on('interstellar:arrived', ({ vessel, systemId }) => {
    if (!vessel?.fleetId || vessel.fleetId !== currentFleet()?.id) return;
    if (!arrivals.has(systemId)) arrivals.set(systemId, new Map());
    arrivals.get(systemId).set(vessel.id, K().timeSystem?.gameTime ?? 0);
  });
  EventBus.on('ui:toast', ({ text }) => { toasts.push(text); });
}

function patchSpeeds() {
  const wrs = K().warpRouteSystem;
  if (speedPatched || !wrs) return;
  speedPatched = true;
  const real = wrs._baseWarpSpeed.bind(wrs);
  wrs._baseWarpSpeed = (v) => speedOverride.get(v?.id) ?? real(v);
}

function currentFleet() {
  const fs = K().fleetSystem;
  const all = fs?.listFleets?.() ?? [];
  return fs?.getFleet?.(rig.fleetId)
    ?? all.find((f) => f.activeOrder?.type === 'warp')
    ?? all.find((f) => f.name === RIG_NAME)
    ?? fs?.getFleet?.(K().uiManager?.getSelectedFleetId?.())
    ?? all[0] ?? null;
}

const membersOf = (fleet) => (fleet?.memberIds ?? []).map((id) => K().vesselManager?.getVessel?.(id)).filter(Boolean);
const systemName = (id) => K().galaxyData?.systems?.find((s) => s.id === id)?.name ?? id;

/** Najbliższy układ o trasie dokładnie n skoków z układu floty (najpierw przyjmowany przez fazę 1). Pamięć: rozkaz w locie nie ma już planu. */
function targetFor(n, fleet) {
  const members = membersOf(fleet);
  const from = members.find((v) => systemIdOf(v) != null);
  const key = `${from ? systemIdOf(from) : 'flight'}:${n}`;
  if (targetsByHops.has(key)) return targetsByHops.get(key);
  if (!from) return [...targetsByHops.entries()].find(([k]) => k.endsWith(`:${n}`))?.[1] ?? null;
  const systems = K().galaxyData?.systems ?? [];
  const origin = systems.find((s) => s.id === systemIdOf(from));
  const sorted = systems.filter((s) => s.id !== origin?.id).sort((a, b) => warpDist3D(origin, a) - warpDist3D(origin, b));
  let fallback = null;
  for (const s of sorted) {
    const plan = K().warpRouteSystem.planGroupJourney(members, s.id);
    if (plan.hops?.length !== n + 1) continue;
    if (plan.ok) { targetsByHops.set(key, s.id); return s.id; }
    fallback ??= s.id;
  }
  if (fallback) targetsByHops.set(key, fallback);
  return fallback;
}

function snapshot(fleet) {
  const ids = new Set(fleet?.memberIds ?? []);
  return JSON.stringify({
    vessels: K().vesselManager.serialize().vessels.filter((v) => ids.has(v.id)),
    fleet: K().fleetSystem.serialize().fleets.find((f) => f.id === fleet?.id) ?? null,
  });
}

function planReadout(fleet, target) {
  const o = fleetWarpMenuOption({ fleetId: fleet?.id, targetSystemId: target, K: K() });
  const fuel = {};
  for (const [id, cores] of Object.entries(o.plan.fuelByMember ?? {})) fuel[K().vesselManager.getVessel(id)?.name ?? id] = round(cores);
  return {
    ok: o.available, reason: o.reason, target: `${systemName(target)} [${target}]`,
    hops: o.hops, route: (o.plan.hops ?? []).map(systemName).join(' > '), totalLY: round(o.plan.totalLY), etaYears: round(o.etaYears), groupSpeedLY: o.plan.groupSpeedLY ?? null,
    binding: o.bindingName, fuelNeed: round(o.fuelNeed), fuelHave: round(o.fuelHave), fuelByMember: fuel,
    labelPL: o.labelPL, labelEN: o.labelEN, refusal: o.reasonText,
    members: (o.plan.members ?? []).map((m) => `${m.name}: ${m.reason}`),
  };
}

// Poprzedni rig po nazwie: autozapis potrafi wnieść go do slotu, a po wczytaniu pamięć modułu jest pusta.
function removeOldRig() {
  const fs = K().fleetSystem, vm = K().vesselManager;
  const riggedName = new Set(RIG_MEMBERS.map((m) => m.name));
  for (const f of fs?.listFleets?.() ?? []) if (f.name === RIG_NAME) fs.disbandFleet?.(f.id, 'manual');
  for (const v of [...(vm?.getAllVessels?.() ?? [])]) if (riggedName.has(v.name)) vm.destroyVessel?.(v.id, { reason: 'dismantled' });
  rig = { fleetId: null, vesselIds: [], logSeen: new Set() };
  speedOverride.clear(); targetsByHops.clear(); arrivals.clear(); toasts.length = 0;
}

export function fleetWarpDebugHelpers() {
  return {
    fleetWarpRig(kind = 1) {
      const k = K(), vm = k.vesselManager, fs = k.fleetSystem, home = k.homePlanet;
      if (!vm || !fs || !home) return { ok: false, reason: 'no_world' };
      removeOldRig();
      installRecorder();
      patchSpeeds();
      const fleet = fs.createFleet(RIG_NAME);
      const members = RIG_MEMBERS.map((spec, i) => {
        const third = i === 2;
        const v = vm.createAndRegister('hull_frigate', home.id, { name: spec.name, modules: third && kind === 2 ? ['engine_ion'] : [...WARP_MODULES] });
        if (v.warpFuel?.max > 0) v.warpFuel.current = spec.cores;
        speedOverride.set(v.id, spec.speedLY);
        if (third && kind === 3) v.serviceState = 'stored';
        if (i === 1) vm.undockToOrbit?.(v.id);   // mieszanka: dok + orbita
        fs.addMember(fleet.id, v.id);
        return v;
      });
      rig = { fleetId: fleet.id, vesselIds: members.map((v) => v.id), logSeen: new Set(k.eventLogSystem?.getEntries?.() ?? []) };
      k.uiManager?.setSelectedFleetId?.(fleet.id);
      return {
        ok: true, fleet: fleet.name, kind, home: systemIdOf(members[0]),
        members: members.map((v) => ({ name: v.name, state: v.position?.state, speedLY: speedOverride.get(v.id), cores: v.warpFuel?.current ?? 0, tank: v.warpFuel?.max ?? 0, service: v.serviceState ?? 'active' })),
      };
    },

    fleetWarpPlan(n = 1) {
      const fleet = currentFleet();
      const target = targetFor(n, fleet);
      return target ? planReadout(fleet, target) : { ok: false, reason: 'no_target_with_hops', hops: n };
    },

    fleetWarpIssue(n = 1) {
      const fleet = currentFleet();
      const target = targetFor(n, fleet);
      if (!target) return { ok: false, reason: 'no_target_with_hops', hops: n };
      installRecorder();
      arrivals.clear(); toasts.length = 0;
      const before = snapshot(fleet);
      const r = runGalaxyFleetWarpOrder({ fleetId: fleet.id, targetSystemId: target, K: K() });
      return {
        ok: r.ok, reason: r.res?.reason ?? null, target: `${systemName(target)} [${target}]`, text: r.text,
        hops: r.res?.hops?.length ? r.res.hops.length - 1 : null, route: (r.res?.hops ?? []).map(systemName).join(' > '),
        etaYears: round(r.res?.etaYears), binding: K().vesselManager.getVessel(r.res?.bindingMemberId)?.name ?? null,
        members: (r.res?.members ?? []).map((m) => `${m.name}: ${m.reason}`),
        unchanged: snapshot(fleet) === before,
      };
    },

    /** Bramka 607: członek `i` floty w starciu, gra na pauzie. Odsunięty od reszty: skład starcia zbiera statki w promieniu, a odmowa ma nazwać tylko jego. */
    fleetWarpBattle(i = 0) {
      const k = K(), vm = k.vesselManager, fleet = currentFleet(), v = vm?.getVessel?.(fleet?.memberIds?.[i]);
      if (!v) return { ok: false, reason: 'no_member', index: i };
      k.timeSystem?.pause?.();
      if (v.position?.state === 'docked') vm.undockToOrbit?.(v.id);
      Object.assign(v.position, { x: v.position.x + 5 * GAME_CONFIG.AU_TO_PX, state: 'orbiting', dockedAt: null });
      const e = raiderNear(v, 0.1);
      if (!e) return { ok: false, reason: 'no_raider' };
      EventBus.emit('vessel:combatRangeEnter', { vesselAId: v.id, vesselBId: e.id, distanceAU: 0.1, sameFaction: false });
      const enc = k.deepSpaceCombatSystem?._findActiveEncounterContaining?.(v.id) ?? null;
      return { ok: !!enc, reason: enc ? null : 'no_encounter', member: v.name, enemy: e.name, armed: hasWeapons(e), encounter: enc?.id ?? null,
        inEncounter: membersOf(fleet).filter((m) => enc?.vesselStates?.has(m.id)).map((m) => m.name) };
    },

    fleetWarpState() {
      installRecorder();
      const k = K(), fleet = currentFleet(), members = membersOf(fleet);
      const ao = fleet?.activeOrder ?? null;
      const rows = members.map((v) => {
        const r = v.warpRoute, m = v.mission;
        return {
          name: v.name, sys: v.systemId, state: v.position?.state, phase: m?.phase ?? null, to: m?.toSystemId ?? null,
          leg: r ? `${(r.legIndex ?? 0) + 1}/${r.hops.length - 1}` : null, route: r?.hops?.join('>') ?? null, group: r?.groupId ?? null, speedLY: r?.speedLY ?? null,
          warpSpeed: m?.warpSpeed ?? null, arrivalYear: round(m?.arrivalYear, 4), cores: round(v.warpFuel?.current), x: round(v.position?.x, 1), y: round(v.position?.y, 1),
        };
      });
      const flying = rows.filter((r) => r.route);
      const hopsSeen = {};
      for (const [sys, byVessel] of arrivals) {
        const times = [...byVessel.values()];
        hopsSeen[sys] = { members: times.length, sameTick: new Set(times).size === 1, gameTime: round(times[0], 4) };
      }
      const names = new Set(members.map((v) => v.name));
      const log = (k.eventLogSystem?.getEntries?.() ?? []).filter((e) => !rig.logSeen.has(e)).map((e) => e.text);
      return {
        year: round(k.timeSystem?.gameTime, 4),
        fleet: fleet?.name ?? null,
        order: ao ? { type: ao.type, target: ao.targetSystemId, hops: ao.hops?.join('>') ?? null, group: ao.groupId ?? null, startedYear: round(ao.startedYear, 4) } : null,
        line: fleet ? fleetWarpStatusLine(fleet, k) : null,
        members: rows,
        sameHops: flying.length > 0 && new Set(flying.map((r) => r.route)).size === 1,
        sameArrival: flying.length > 0 && new Set(flying.map((r) => r.arrivalYear)).size === 1,
        arrivals: hopsSeen,
        logFleet: log.filter((t) => fleet && t.startsWith(`${fleet.name}: `)),
        logMembers: log.filter((t) => [...names].some((n) => t.startsWith(`${n}: `))),
        toastFleet: toasts.filter((t) => fleet && t.startsWith(`${fleet.name}: `)),
        toastMembers: toasts.filter((t) => [...names].some((n) => t.startsWith(`${n}: `))),
      };
    },

    fleetWarpStop() {
      const fleet = currentFleet();
      return { stopped: K().fleetSystem.cancelFleetOrder(fleet?.id, 'manual'), fleet: fleet?.name ?? null };
    },

    fleetWarpOwnOrder(i = 2) {
      const k = K(), v = membersOf(currentFleet())[i - 1];
      if (!v) return { ok: false, reason: 'no_member' };
      const systems = k.galaxyData?.systems ?? [];
      const here = systems.find((s) => s.id === v.systemId);
      const to = here ? systems.filter((s) => s.id !== here.id).sort((a, b) => warpDist3D(here, a) - warpDist3D(here, b))[0] : null;
      const r = k.orderService.issueWarp(v.id, to?.id);
      return { ok: r?.ok === true, reason: r?.reason ?? null, member: v.name, to: to ? `${to.name} [${to.id}]` : null, warpSpeed: v.mission?.warpSpeed ?? null, group: v.warpRoute?.groupId ?? null };
    },

    fleetWarpDivert(i = 2) {
      const k = K(), fleet = currentFleet(), v = membersOf(fleet)[i - 1];
      if (!v?.warpRoute) return { ok: false, reason: 'not_on_route' };
      const route = new Set(v.warpRoute.hops);
      const stopsAt = v.mission?.toSystemId ?? null;
      const systems = k.galaxyData?.systems ?? [];
      const stop = systems.find((s) => s.id === stopsAt);
      const elsewhere = systems.filter((s) => !route.has(s.id)).sort((a, b) => warpDist3D(stop, a) - warpDist3D(stop, b))[0] ?? null;
      // Wprost statek w skoku rozkazu nie przyjmie (`in_transit`): najpierw schodzi z trasy, kończy bieżący skok i dopiero wtedy leci sam.
      const direct = k.orderService.issueWarp(v.id, elsewhere?.id);
      k.warpRouteSystem.abortJourney(v.id, 'diverted');
      const onArrived = ({ vessel }) => {
        if (vessel?.id !== v.id) return;
        EventBus.off('interstellar:arrived', onArrived);
        k.orderService.issueWarp(v.id, elsewhere?.id);
      };
      EventBus.on('interstellar:arrived', onArrived);
      return { ok: true, member: v.name, direct: `${direct?.ok}:${direct?.reason ?? ''}`, stopsAt: systemName(stopsAt), thenTo: `${elsewhere?.name} [${elsewhere?.id}]` };
    },

    fleetWarpSave() {
      EventBus.emit('game:save');
      return { ok: true, year: round(K().timeSystem?.gameTime, 4) };
    },

    // ── Finding 603 (docs/design/GALAXY_603_GATE_CHECKLIST.md) ──
    probe603(vesselId = K().uiManager?.getSelectedVesselId?.() ?? probe603Last) {
      const k = K(), v = k.vesselManager?.getVessel?.(vesselId), patients = warpPatients();
      if (!v) return { ok: false, reason: 'no_vessel', patients };
      probe603Last = v.id;   // wrak traci zaznaczenie, a bramka czyta go dalej
      const m = v.mission, mo = v.movementOrder, r = v.warpRoute, last = v.lastOrder, year = k.timeSystem?.gameTime ?? 0;
      const row = buildRegistryRows([v], { pictureCtx: {} })[0] ?? null;
      const tr = galaxyShipRail({ vessels: [v], systems: k.galaxyData?.systems ?? [] }).transit?.[0] ?? null;
      return {
        name: v.name, year: round(year), state: v.position?.state, status: v.status, wreck: !!v.isWreck, system: v.systemId, dockedAt: v.position?.dockedAt ?? null, xy: [round(v.position?.x, 1), round(v.position?.y, 1)],
        mission: m ? `${m.type}/${m.phase ?? null}` : null, to: m?.toSystemId ?? null, arrivalYear: round(m?.arrivalYear ?? null), galProgress: round(m?.galProgress ?? null),
        order: mo ? `${mo.type}/${mo.status}` : null, lastOrder: last ? `${last.type}/${last.status}/${last.blockReason ?? null}` : null, inOrderIndex: k.movementOrderSystem?._byVessel?.has?.(v.id) === true,
        route: r ? `${(r.hops ?? []).join('>')} leg ${r.legIndex}` : null, cores: round(v.warpFuel?.current ?? null), suspended: v._suspendedMission?.type ?? null,
        registry: row ? [row.stateKey, row.activityKey, round(row.eta?.year ?? null)] : null, plate: tr ? [round(tr.gx, 2), round(tr.gy, 2), tr.toId] : 'at_star',
        encounter: k.deepSpaceCombatSystem?._findActiveEncounterContaining?.(v.id)?.id ?? null, canOrder: k.warpRouteSystem?.canOrder?.(v), patients,
      };
    },

    probe603Rig() {
      const k = K(), inFleet = new Set((k.fleetSystem?.listFleets?.() ?? []).flatMap((f) => f.memberIds ?? []));
      const v = ships().find((x) => !isEnemyVessel(x) && !x.isWreck && isInService(x) && x.warpFuel?.max > 0 && hasWeapons(x) && !inFleet.has(x.id)
        && x.position?.state !== 'in_transit' && x.systemId != null && nearestEnemy(x));
      if (!v) return { ok: false, reason: 'no_ship' };
      k.uiManager?.setSelectedFleetId?.(null);
      k.uiManager?.setSelectedVesselId?.(v.id);
      if (k.activeSystemId !== v.systemId) k.starSystemManager?.switchActiveSystem?.(v.systemId);
      const e = nearestEnemy(v);
      return { ok: true, ship: v.name, system: `${systemName(v.systemId)} [${v.systemId}]`, cores: round(v.warpFuel.current), enemy: e.name, enemyAU: round(auBetween(v, e), 2) };
    },

    probe603Engage() {
      const k = K(), v = selectedShip(), e = v && nearestEnemy(v);
      if (!e) return { ok: false, reason: v ? 'no_enemy_in_system' : 'no_selection' };
      const r = k.movementOrderSystem.issueOrder(v.id, { type: 'engage', targetEntityId: e.id });
      return { ok: r?.ok === true, reason: r?.reason ?? null, target: e.name, order: v.movementOrder ? `${v.movementOrder.type}/${v.movementOrder.status}` : null };
    },

    probe603Patrol() {
      const k = K(), v = selectedShip();
      if (!v) return { ok: false, reason: 'no_selection' };
      const au = GAME_CONFIG.AU_TO_PX, { x, y } = v.position;
      const r = k.movementOrderSystem.issueOrder(v.id, { type: 'patrol', patrolRoute: [{ x: x + au, y }, { x: x + 2 * au, y }] });
      return { ok: r?.ok === true, reason: r?.reason ?? null, state: v.position?.state };
    },

    probe603Cores(x) {
      const v = selectedShip();
      if (!v?.warpFuel) return { ok: false, reason: 'no_selection' };
      v.warpFuel.current = x;
      return { ok: true, cores: v.warpFuel.current };
    },

    /** Ten sam rozkaz co klik wpisu menu gwiazdy, do najbliższego układu o trasie n skoków. `unchanged` — statek co do bitu przy odmowie. */
    probe603Warp(n = 1) {
      const k = K(), v = selectedShip() ?? k.vesselManager?.getVessel?.(probe603Last);   // Esc zdejmuje zaznaczenie, a bramka prowadzi dalej ten sam statek
      if (!v) return { ok: false, reason: 'no_selection' };
      const t = targetForShip(v, n);
      if (!t) return { ok: false, reason: 'no_target_with_hops', hops: n };
      const before = shipBits(v), res = runGalaxyWarpOrder({ vesselIds: [v.id], targetSystemId: t.id, K: k });
      return { ok: res.fails.length === 0, reason: res.fails[0]?.reason ?? null, text: res.text, target: `${systemName(t.id)} [${t.id}]`, etaYears: round(t.etaYears), unchanged: shipBits(v) === before };
    },

    /** Rajder 5 AU od zaznaczonego statku, bez rozkazu i bez starcia, gra na pauzie (bezczynnego rajdera AI odwołuje `DirectorRecall` przy pierwszym ticku). */
    probe603Enemy() {
      K().timeSystem?.pause?.();
      const v = selectedShip(), e = v && raiderNear(v, 5);
      return e ? { ok: true, enemy: e.name, armed: hasWeapons(e), enemyAU: round(auBetween(v, e), 2) } : { ok: false, reason: v ? 'no_raider' : 'no_selection' };
    },

    /** Zbrojny rajder 0,1 AU od statku, rozkaz `engage` i start starcia, gra na pauzie: skok można wydać W TRAKCIE walki. `weak`: rajder na 1 HP, statek wygrywa (bramka 607, K1). */
    probe603Battle(weak = 0) {
      const k = K(), v = selectedShip();
      if (!v) return { ok: false, reason: 'no_selection' };
      k.timeSystem?.pause?.();
      const e = raiderNear(v, 0.1);
      if (!e) return { ok: false, reason: 'no_raider' };
      if (weak) e.combatDamage = { hpMissing: 1e9, shieldMissing: 1e9 };
      const o = k.movementOrderSystem.issueOrder(v.id, { type: 'engage', targetEntityId: e.id });
      EventBus.emit('vessel:combatRangeEnter', { vesselAId: v.id, vesselBId: e.id, distanceAU: 0.1, sameFaction: false });
      return { ok: o?.ok === true, reason: o?.reason ?? null, enemy: e.name, armed: hasWeapons(e), encounter: k.deepSpaceCombatSystem?._findActiveEncounterContaining?.(v.id)?.id ?? null };
    },

    /** Pierwsze wywołanie: para AI ze stolicy rusza na dom gracza (`issueGroupAttack`). Kolejne: odczyt, bez nowego rozkazu. */
    probe603AI() {
      const k = K(), vm = k.vesselManager, home = k.homePlanet;
      if (!ai603) {
        const empire = aiEmpire();
        if (!empire) return { ok: false, reason: 'no_ai_empire' };
        const systemId = systemIdOf(EntityManager.get(k.directorProduction.capitalOf(empire.id)?.planetId));
        const ids = [0, 1].map(() => spawnEnemyRaider({ empireId: empire.id, systemId, autoOrder: false })?.vesselId);
        const r = k.orderService.issueGroupAttack(ids, { targetBodyId: home.id, targetSystemId: systemIdOf(home), groupId: 'g603_k5' });
        ai603 = { ids, target: systemIdOf(home), issued: r?.ok === true, composite: r?.composite ?? null };
      }
      const members = ai603.ids.map((id) => vm.getVessel(id)).filter(Boolean).map((v) => ({
        name: v.name, system: v.systemId, state: v.position?.state, mission: v.mission ? `${v.mission.type}/${v.mission.phase ?? null}` : null,
        arrivalYear: round(v.mission?.arrivalYear ?? null), pending: v.pendingOrder?.kind ?? null, order: v.movementOrder ? `${v.movementOrder.type}/${v.movementOrder.status}` : null,
      }));
      return { issued: ai603.issued, composite: ai603.composite, year: round(k.timeSystem?.gameTime ?? 0), target: ai603.target, arrived: members.length > 0 && members.every((m) => m.system === ai603.target), members };
    },

    /** Szyna płyty: ile statków przy gwieździe (do obejrzenia: gwiazda z dokładnie 4). */
    probe603Rail() {
      const k = K(), { bySystem, transit } = galaxyShipRail({ vessels: ships(), systems: k.galaxyData?.systems ?? [] });
      const rows = [...bySystem.entries()].map(([id, list]) => ({ star: systemName(id), id, ships: list.length })).sort((a, b) => a.ships - b.ships);
      return { transit: transit.length, rows };
    },
  };
}

// ── Finding 603 — wspólne dla pomocników bramki ──
let ai603 = null;   // para AI z K5
let probe603Last = null;   // ostatni statek odczytu: domyślny, gdy nic nie jest zaznaczone
const ships = () => K().vesselManager?.getAllVessels?.() ?? [];
const selectedShip = () => K().vesselManager?.getVessel?.(K().uiManager?.getSelectedVesselId?.()) ?? null;
const auBetween = (a, b) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) / GAME_CONFIG.AU_TO_PX;
const aiEmpire = () => (K().empireRegistry?.listAll?.() ?? []).find((e) => K().directorProduction?.capitalOf?.(e.id)) ?? null;
const shipBits = (v) => JSON.stringify([v.position, v.status, v.systemId, v.mission, v.movementOrder, v.warpFuel, v.warpRoute ?? null]);
const nearestEnemy = (v) => ships().filter((e) => isEnemyVessel(e) && !e.isWreck && e.systemId === v.systemId).sort((a, b) => auBetween(v, a) - auBetween(v, b))[0] ?? null;

/** Rajder AI w układzie statku, `au` od niego. Istniejąca furtka debugowa (`spawnEnemyRaider`). Rodzi się w najbliższym układzie i zostaje przestawiony: furtka odmawia układu domowego (Finding 277), a flota z `fleetWarpRig` stoi przy domu. */
function raiderNear(v, au) {
  const empire = aiEmpire();
  if (!empire) return null;
  const r = spawnEnemyRaider({ empireId: empire.id, autoOrder: false }), e = K().vesselManager.getVessel(r?.vesselId);
  if (!e) return null;
  e.systemId = v.systemId;
  Object.assign(e.position, { x: v.position.x + au * GAME_CONFIG.AU_TO_PX, y: v.position.y, state: 'orbiting', dockedAt: null });
  return e;
}

/** Statki gracza w tranzycie warp z żywym rozkazem albo poza `in_transit` — stan z Findingu 603. Pusta lista = zapis zdrowy. */
function warpPatients() {
  return ships().filter((v) => !isEnemyVessel(v) && !v.isWreck && v.mission?.type === 'interstellar_jump' && v.mission?.phase === 'warp_transit'
    && (v.movementOrder?.status === 'active' || v.position?.state !== 'in_transit')).map((v) => `${v.name} [${v.id}] ${v.position?.state}`);
}

/** Najbliższy układ o trasie dokładnie n skoków wg wpisu menu (także przy braku paliwa: trasa częściowa). */
function targetForShip(v, n) {
  const k = K(), systems = k.galaxyData?.systems ?? [], origin = systems.find((s) => s.id === systemIdOf(v));
  if (!origin) return null;
  const sorted = systems.filter((s) => s.id !== origin.id).sort((a, b) => warpDist3D(origin, a) - warpDist3D(origin, b));
  for (const s of sorted) {
    const o = warpMenuOption({ vessel: v, targetSystemId: s.id, systems, canOrder: (x) => k.warpRouteSystem.canOrder(x), K: k });
    if (o.hops === n) return { id: s.id, etaYears: o.etaYears };
  }
  return null;
}
