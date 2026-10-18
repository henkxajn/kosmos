// ═══════════════════════════════════════════════════════════════════════════════
// combat_marker_life_smoke — KEEPER Findingu 457 (POLISH P2a, krok P2-5)
// Rejestr: `docs/design/POLISH_PLAN.md` §6 (457) i §11 (P2a).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: znacznik starcia (czerwony pierścień) odświeżała WYŁĄCZNIE salwa (`combat:roundFx`, tylko rundy ze strzałem),
//   a po 1600 ms CZASU REALNEGO bez odświeżenia znikał — przy 400 ms na rundę (P1, CP2) także W TRAKCIE starcia (rundy
//   bez strzału: zbliżanie, odliczanie broni) i W PAUZIE (P2 §10.6: luki 416 ms i 1808 ms przy aktywnym starciu).
// KSZTAŁT: znacznik żyje wg STANU starcia — jest, dopóki starcie aktywne i w oglądanym układzie (także w pauzie), znika
//   z jego końcem (`planEngagementMarkers` w `VesselFxLogic`, renderer synchronizuje co klatkę z
//   `deepSpaceCombatSystem.listActive()`); 1600 ms zostaje WYŁĄCZNIE dla imitacji bitew orbitalnych (`kind: 'burst'`).
// ⚠ `ThreeRenderer` nie importuje się pod node ⇒ plan wykonaniem (także na PRAWDZIWYM cyklu życia starcia DSCS:
//   rundy co 110 ms zegara starcia, rundy bez strzału, pauza 10 s bez tików), renderer — pin źródłowy.
//
// PINY:
//   T1  starcie aktywne w oglądanym układzie: znacznik powstaje raz, potem trwa (bez duplikatów)
//   T2  koniec starcia (nieaktywne / zniknęło z listy) — znacznik zdjęty w tej samej klatce
//   T3  starcie w innym układzie — brak znacznika; przełączenie widoku na układ starcia — jest; z powrotem — zdjęty
//   T4  imitacja bitwy orbitalnej (`burst`): 1600 ms — trwa przy 1600, zdjęta po 1601 ms
//   T5  PRAWDZIWE starcie DSCS (wykonanie): znacznik w KAŻDEJ klatce aktywnego starcia — przez rundy bez strzału
//       i przez pauzę 10 s (zegar realny płynie, tików brak) — i brak po rozstrzygnięciu (KONTROLA: dzisiejsza reguła
//       — salwa + 1600 ms — na tym samym przebiegu GUBI znacznik w trakcie starcia)
//   T6  źródło `ThreeRenderer`: `_tickEngagementMarkers` przez plan ze `listActive()` i układem widoku; salwa nie stawia
//       znacznika; imitacja orbitalna = `'burst'`; bez stałej 1600 w synchronizacji starć
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import * as DSCSmod            from '../../systems/DeepSpaceCombatSystem.js';
import * as FX                 from '../../utils/VesselFxLogic.js';
import { readFileSync }        from 'node:fs';

const { DeepSpaceCombatSystem, ROUND_INTERVAL_MS } = DSCSmod;

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
// Plan powstaje w tym kroku — przez przestrzeń nazw: na kodzie sprzed kroku pin DEGRADUJE (null), nie przerywa.
const plan = (o) => (typeof FX.planEngagementMarkers === 'function' ? FX.planEngagementMarkers(o) : null);

const AU  = GAME_CONFIG.AU_TO_PX;
const SYS = 'sys_t';
const EMP = 'emp_t';

/** Atrapa znaczników renderera: Map id → { kind, lastTouchMs }; jedna „klatka” = plan + zastosowanie (jak renderer). */
function frame(markers, encounters, activeSystemId, nowMs) {
  const p = plan({ markers: [...markers].map(([id, m]) => ({ id, kind: m.kind, lastTouchMs: m.lastTouchMs })),
    encounters, activeSystemId, nowMs, burstTtlMs: FX.ENGAGEMENT_BURST_TTL_MS ?? 1600 });
  if (!p) return { ok: false, created: 0, disposed: 0 };
  for (const id of p.dispose) markers.delete(id);
  for (const u of p.upsert) markers.set(u.id, { kind: 'encounter', lastTouchMs: nowMs, x: u.x, y: u.y });
  return { ok: true, created: p.upsert.length, disposed: p.dispose.length };
}
const encOf = (id, systemId, isActive = true) => ({ id, isActive, systemId, point: { x: 10, y: -5 } });

// ═══ T1 ═══════════════════════════════════════════════════════════════════════
header('T1  starcie aktywne w oglądanym układzie — znacznik raz, potem trwa');
{
  const m = new Map();
  const a = frame(m, [encOf('e1', 'sys_home')], 'sys_home', 0);
  let dup = 0, gone = 0;
  for (let t = 16; t <= 5000; t += 16) { const r = frame(m, [encOf('e1', 'sys_home')], 'sys_home', t); dup += r.created; if (!m.has('e1')) gone++; }
  assert(a.ok && a.created === 1 && m.has('e1'), 'T1a pierwsza klatka — znacznik powstaje');
  assert(a.ok && dup === 0 && gone === 0, 'T1b 5 s klatek — trwa, bez duplikatów (dziś: gaśnie po 1600 ms bez salwy)');
}

// ═══ T2 ═══════════════════════════════════════════════════════════════════════
header('T2  koniec starcia — znacznik zdjęty w tej samej klatce');
{
  const m = new Map();
  frame(m, [encOf('e1', 'sys_home')], 'sys_home', 0);
  const r1 = frame(m, [encOf('e1', 'sys_home', false)], 'sys_home', 16);
  const m2 = new Map(); frame(m2, [encOf('e2', 'sys_home')], 'sys_home', 0);
  const r2 = frame(m2, [], 'sys_home', 16);
  assert(r1.ok && !m.has('e1') && r1.disposed === 1, 'T2a starcie nieaktywne — zdjęty');
  assert(r2.ok && !m2.has('e2') && r2.disposed === 1, 'T2b starcie zniknęło z listy aktywnych — zdjęty');
}

// ═══ T3 ═══════════════════════════════════════════════════════════════════════
header('T3  starcie w innym układzie');
{
  const m = new Map();
  const r0 = frame(m, [encOf('e1', 'sys_059')], 'sys_home', 0);
  const r1 = frame(m, [encOf('e1', 'sys_059')], 'sys_059', 16);
  const r2 = frame(m, [encOf('e1', 'sys_059')], 'sys_home', 32);
  assert(r0.ok && m.size === 0 && r0.created === 0, 'T3a widok `sys_home`, starcie w `sys_059` — brak znacznika');
  assert(r1.ok && r1.created === 1, 'T3b widok przełączony na `sys_059` — znacznik jest');
  assert(r2.ok && r2.disposed === 1 && m.size === 0, 'T3c widok z powrotem na `sys_home` — zdjęty');
}

// ═══ T4 ═══════════════════════════════════════════════════════════════════════
header('T4  imitacja bitwy orbitalnej (`burst`) — 1600 ms');
{
  const m = new Map([['orbital_1_2', { kind: 'burst', lastTouchMs: 1000 }]]);
  const a = frame(m, [], 'sys_home', 2600);
  const kept = m.has('orbital_1_2');
  const b = frame(m, [], 'sys_home', 2601);
  assert(a.ok && kept && FX.ENGAGEMENT_BURST_TTL_MS === 1600, 'T4a trwa przy 1600 ms od dotknięcia (czas życia 1600)');
  assert(b.ok && !m.has('orbital_1_2'), 'T4b zdjęta po 1601 ms');
}

// ═══ T5 ═══════════════════════════════════════════════════════════════════════
header('T5  PRAWDZIWE starcie DSCS — znacznik w każdej klatce aktywnego starcia (rundy bez strzału, pauza 10 s)');
{
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 100, simClockMs: 1000 }, activeSystemId: SYS };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Home', systemId: SYS, x: -3 * AU, y: 0, radius: 4, mass: 1, visual: { radius: 4 } });
  const vMgr = new VesselManager(); const mos = new MovementOrderSystem(vMgr); const dscs = new DeepSpaceCombatSystem(vMgr);
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  Object.assign(window.KOSMOS, {
    civMode: true, vesselManager: vMgr, movementOrderSystem: mos, deepSpaceCombatSystem: dscs,
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find((c) => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: () => {} }, debug: { combatTrace: false },
  });
  const ship = (x, y, name, modules, empire = null) => {
    const v = vMgr.createAndRegister('hull_frigate', 'p_home', { name, modules });
    v.position.x = x; v.position.y = y; v.position.state = 'orbiting'; v.position.dockedAt = null;
    v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.systemId = SYS;
    if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; }
    return v;
  };
  // fregata gracza z laserem (0,05 AU) i wróg z rakietami (0,30 AU) z 0,25 AU: pierwsze rundy bez strzału gracza
  // (zbliżanie), rakieta co 5 rund — rundy bez żadnego strzału są w tym przebiegu
  const me = ship(0, 2 * AU, 'Me', ['weapon_laser', 'engine_ion']);
  const foe = ship(0, 2 * AU + 0.25 * AU, 'Foe', ['weapon_missile', 'engine_ion', 'armor_heavy'], EMP);
  const salvos = [];
  EventBus.on('combat:roundFx', (p) => salvos.push(window.KOSMOS.timeSystem.simClockMs));
  mos.issueOrder(me.id, { type: 'engage', targetEntityId: foe.id, issuedBy: 'keeper' });
  const ok = dscs.handleCombatRangeEnter(me.id, foe.id, false);
  const enc = [...dscs._activeEncounters.values()][0] ?? null;
  // klatki 16 ms czasu realnego; zegar starcia jak siatka przy 400 ms na rundę (110 ms zegara co ~400 ms realnych);
  // pauza 10 s realnych po rundzie 3 — zegar starcia stoi, `_tick` nie jest wołany (jak gra w pauzie)
  const m = new Map(); const mOld = new Map();
  let real = 0, accClock = 0, framesActive = 0, framesNoMarker = 0, oldGaps = 0, pauseFrames = 0, pauseNoMarker = 0, paused = false, pauseLeft = 0, endedFrameMarker = null;
  let lastSalvoReal = null;
  for (let f = 0; f < 4000; f++) {
    real += 16;
    if (!paused && enc.isActive && enc.currentRound >= 3 && pauseLeft === 0 && !enc._keeperPaused) { paused = true; pauseLeft = 10000; enc._keeperPaused = true; }
    if (paused) { pauseLeft -= 16; pauseFrames++; if (pauseLeft <= 0) paused = false; }
    else if (enc.isActive) {
      accClock += 16 * 110 / 400;
      while (accClock >= 16) { accClock -= 16; window.KOSMOS.timeSystem.simClockMs += 16; const n0 = salvos.length; dscs._tick(16 / 1000 / 365.25 * 12); if (salvos.length > n0) lastSalvoReal = real; }
    }
    const list = dscs.listActive().map((e) => ({ id: e.id, isActive: e.isActive, systemId: e.location?.systemId, point: e.location?.point }));
    frame(m, list, SYS, real);
    // dzisiejsza reguła (KONTROLA): znacznik odświeżany salwą, gaśnie po 1600 ms bez salwy
    if (lastSalvoReal === real) mOld.set(enc.id, real);
    if (mOld.has(enc.id) && real - mOld.get(enc.id) > 1600) mOld.delete(enc.id);
    if (enc.isActive) {
      framesActive++;
      if (!m.has(enc.id)) framesNoMarker++;
      if (paused && !m.has(enc.id)) pauseNoMarker++;
      if (salvos.length > 0 && !mOld.has(enc.id)) oldGaps++;
    } else { endedFrameMarker = m.has(enc.id); break; }
  }
  console.log(`     starcie: rund ${enc?.currentRound}, salw ${salvos.length}, klatek aktywnych ${framesActive} (w pauzie ${pauseFrames}); bez znacznika: ${framesNoMarker}; dzisiejsza reguła — klatek bez znacznika po 1. salwie: ${oldGaps}`);
  assert(ok === true && salvos.length > 0 && pauseFrames >= 600 && !enc.isActive, 'T5-0 KONTROLA: starcie rozstrzygnięte, salwy były, pauza 10 s (≥ 600 klatek) w trakcie');
  assert(oldGaps > 0, 'T5-1 KONTROLA: dzisiejsza reguła (salwa + 1600 ms) na tym przebiegu gubi znacznik w trakcie aktywnego starcia');
  assert(framesActive > 0 && framesNoMarker === 0 && pauseNoMarker === 0, 'T5 SEDNO: znacznik w KAŻDEJ klatce aktywnego starcia — także w rundach bez strzału i w pauzie 10 s');
  assert(framesActive > 0 && framesNoMarker === 0 && endedFrameMarker === false, 'T5b znacznik był przez całe starcie i zniknął w pierwszej klatce po rozstrzygnięciu (świadek: obecność w trakcie)');
}

// ═══ T6 ═══════════════════════════════════════════════════════════════════════
header('T6  źródło `ThreeRenderer`');
{
  const tr = strip(readFileSync(new URL('../../renderer/ThreeRenderer.js', import.meta.url), 'utf8'));
  const body = (sig) => { const i = tr.indexOf(sig); return i < 0 ? '' : tr.slice(i, tr.indexOf('\n  }\n', i)); };
  const mk = body('  _tickEngagementMarkers(nowMs) {');
  assert(mk.length > 0 && body('  _onCombatRoundFx(payload) {').includes('_spawnCombatTracer('), 'T6-0 KONTROLA: obie metody znalezione');
  assert(/planEngagementMarkers\(/.test(mk) && /listActive\?\.\(\)/.test(mk) && /activeSystemId:\s*window\.KOSMOS\?\.activeSystemId/.test(mk),
    'T6a synchronizacja: plan ze `listActive()` i układem widoku');
  assert(!/\b1600\b/.test(mk) && /ENGAGEMENT_BURST_TTL_MS/.test(mk), 'T6b bez stałej 1600 w synchronizacji (czas życia wyłącznie imitacji orbitalnej)');
  assert(!body('  _onCombatRoundFx(payload) {').includes('_upsertEngagementMarker('), 'T6c salwa nie stawia znacznika (cykl życia = stan starcia)');
  assert(/_upsertEngagementMarker\('orbital_'[^;]*'burst'\)/.test(body('  _spawnBattleBurst(gx, gy) {')), 'T6d imitacja bitwy orbitalnej — znacznik `burst`');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
