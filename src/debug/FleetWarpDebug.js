// FleetWarpDebug — ARC GALAXY G4: pomocniki konsolowe bramki skoku floty (docs/design/GALAXY_G4_GATE_CHECKLIST.md). Wszystkie wywołania bez
// cudzysłowów. Rozpięte w `KOSMOS.debug` (GameScene). Nic w grze ich nie woła; bramka gra na kopii zapisu.
//   fleetWarpRig(kind)      — flota „G4”: 3 fregaty przy domu. 1 = wszyscy zdolni; 2 = trzeci bez napędu warp (K5); 3 = trzeci w rezerwie (K6)
//   fleetWarpPlan(n)        — faza 1 do najbliższego układu o trasie n skoków: etykieta wpisu menu, ETA, wiążący, odmowa
//   fleetWarpIssue(n)       — ten sam rozkaz co klik wpisu menu; `unchanged` = członkowie i rekord co do bitu przy odmowie
//   fleetWarpState()        — odczyt: członkowie (układ, stan, przeskoki), rekord, przyloty per układ (ten sam tick), linie Dziennika
//   fleetWarpDivert(i)      — i-ty członek (od 1) zjeżdża z trasy i leci własnym skokiem gdzie indziej
//   fleetWarpStop()         — Stop floty: ta sama metoda co chip „Stop” panelu floty i „Anuluj rozkaz” w Dowództwie
//   fleetWarpOwnOrder(i)    — i-ty członek (od 1) dostaje własny skok do najbliższego układu: czy po Stopie jest wolny
//   fleetWarpAI()           — para okrętów AI: `issueGroupAttack` przy fleetWarp ON i OFF, odczyt SB54
//   fleetWarpSave()         — zapis do slotu (ta sama ścieżka co menu); po nim F5 i „Kontynuuj”
// ⚠ Dane gry dają dziś JEDNĄ prędkość skoku (każdy `engine_warp`: 18 LY/rok), więc blokady prędkości nie da się zobaczyć bez nadpisania. Rig
//   nadpisuje `WarpRouteSystem._baseWarpSpeed` na czas sesji (6 / 12 / 18 LY/rok) — kod gry tego nie zna. Po wczytaniu trasa niesie swoją zablokowaną
//   prędkość w zapisie (`warpRoute.speedLY`), więc nadpisanie nie jest wtedy potrzebne.

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { spawnEnemyRaider } from './SpawnTestEnemy.js';
import { warpDist3D } from '../utils/WarpRoutePlanner.js';
import { systemIdOf } from '../utils/SystemScope.js';
import { fleetWarpMenuOption, fleetWarpStatusLine, runGalaxyFleetWarpOrder } from '../ui/GalaxyWarpLogic.js';

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

    fleetWarpAI() {
      const k = K(), vm = k.vesselManager, cfg = GAME_CONFIG.FEATURES;
      const empire = (k.empireRegistry?.listAll?.() ?? []).find((e) => k.directorProduction?.capitalOf?.(e.id));
      if (!empire) return { ok: false, reason: 'no_ai_empire' };
      const systemId = systemIdOf(EntityManager.get(k.directorProduction.capitalOf(empire.id)?.planetId));
      // Istniejąca furtka debugowa: `createAIVessel` należy wyłącznie do puli floty (AI STRIKES BACK, keeper `sb1_fleet_pool` T10e).
      const spawn = () => {
        const r = spawnEnemyRaider({ empireId: empire.id, systemId, autoOrder: false });
        return vm.getVessel(r?.vesselId) ?? null;
      };
      const body = k.homePlanet;
      const run = (flag) => {
        const was = cfg.fleetWarp;
        cfg.fleetWarp = flag;
        const a = spawn(), b = spawn();
        const r = k.orderService.issueGroupAttack([a?.id, b?.id], { targetBodyId: body.id, targetSystemId: systemIdOf(body), groupId: 'g4_k9' });
        const shape = (v) => ({ type: v.mission?.type ?? null, to: v.mission?.toSystemId ?? null, warpSpeed: v.mission?.warpSpeed ?? null, pending: v.pendingOrder?.kind ?? null, group: v.pendingOrder?.groupId ?? null, route: v.warpRoute ?? null, warpGroupId: v.mission?.warpGroupId ?? null });
        const out = { ok: r?.ok === true, composite: r?.composite ?? null, sameAngle: Number.isFinite(a?.mission?.arrivalAngle) && a.mission.arrivalAngle === b?.mission?.arrivalAngle, a: shape(a), b: shape(b) };
        for (const v of [a, b]) if (v) vm.destroyVessel(v.id, { reason: 'dismantled' });
        cfg.fleetWarp = was;
        return out;
      };
      const on = run(true), off = run(false);
      return { empire: empire.id, on, sameAsOff: JSON.stringify(on) === JSON.stringify(off) };
    },
  };
}
