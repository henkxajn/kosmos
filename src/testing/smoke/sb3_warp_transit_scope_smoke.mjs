// sb3_warp_transit_scope_smoke.mjs — AI STRIKES BACK S3/2 (SB59): statek W SKOKU nie jest w żadnym układzie
// (Findingi 151 i 427).
//
// `null` w `vessel.systemId` znaczy ŚWIADOMIE „statek jest między układami” (`VesselManager._resolveSystemId`), a nie
// „nie wiemy”. Dwa żywe miejsca sklejały go z układem własną koercją:
//   * `ProximitySystem._checkPair` — `(v.systemId ?? 'sys_home')`: statek w skoku był „w domu”, na współrzędnych
//     sprzed skoku — wykrywał, był wykrywany i wchodził w zasięg walki (Finding 151);
//   * `ObservatorySystem._tickVesselDetection` — `(v.systemId ?? sysId)`: statek w skoku był „w oglądanym układzie”
//     (Finding 427; przy obserwatorium 4+ zasięg ∞ — każdy skok).
// Brak pola (stary zapis) = `sys_home` — bez zmian (kontrole T1d, T2c).
// ⚠ POZA ZAKRESEM: trzy filtry mapy 2D `FleetManagerOverlay` (utajone za `commandTacticalMap:false`) mają tę samą
//   koercję (dopisek 151), ale `fleet_engage_scope` T12c/T12d pinują je dosłownie jako dokument zakresu 166 — zostają
//   nietknięte (T3f pinuje, że ten slice ich nie ruszył).
//
// PINY (fail-first na S3-7, `84d8638`):
//   T1  ProximitySystem — pary: kontrola (ten sam układ), statek w skoku, oba w skoku, stary zapis, inny układ,
//       para ZAMYKA SIĘ, gdy statek skacze (wykonanie `_checkPair`).
//   T2  ObservatorySystem — wykrycie: kontrola, statek w skoku, stary zapis, wykrycie GAŚNIE, gdy statek skacze
//       (wykonanie `_tickVesselDetection`, kolonia z prawdziwym wpisem obserwatorium poziomu 1).
//   T3  źródło (komentarze zdjęte): TRIPWIRE ProximitySystem i ObservatorySystem bez własnej koercji + granica zakresu
//       (filtry mapy 2D nietknięte).

import '../headless/env.js';               // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import EventBus                  from '../../core/EventBus.js';
import EntityManager             from '../../core/EntityManager.js';
import { VesselManager }         from '../../systems/VesselManager.js';
import { ProximitySystem }       from '../../systems/ProximitySystem.js';
import { ObservatorySystem }     from '../../systems/ObservatorySystem.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

const AU = 110;

function resetWorld() {
  EventBus.clear();
  EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 10 }, activeSystemId: 'sys_home' };
  // ⚠ Gwiazda KAŻDEGO układu stoi w (0,0) — to jest MECHANIZM defektu, nie skrót fixture'u.
  EntityManager.add({ id: 'star_home', type: 'star', name: 'Sol',    systemId: 'sys_home', x: 0, y: 0 });
  EntityManager.add({ id: 'star_24',   type: 'star', name: 'Diphda', systemId: 'sys_024', x: 0, y: 0 });
}

/** Statek w układzie `sys` (`null` = w skoku; `'ABSENT'` = pole usunięte — stary zapis), w ramce tego układu. */
function ship(vm, { sys = 'sys_home', xAU = 1.0, yAU = 0, empire = null, name } = {}) {
  const v = vm.createAndRegister('hull_frigate', 'p_none', { name: name ?? `v_${sys}_${xAU}`, modules: ['weapon_laser'] });
  if (sys === 'ABSENT') delete v.systemId; else v.systemId = sys;
  v.position.x = xAU * AU; v.position.y = yAU * AU;
  v.position.state = 'orbiting';
  v.position.dockedAt = null;
  v.status = 'idle'; v.mission = null;
  if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; }
  return v;
}

function record(...names) {
  const out = Object.fromEntries(names.map(n => [n, []]));
  for (const n of names) EventBus.on(n, (e) => out[n].push(e));
  return out;
}

const pairOf = (e, a, b) => (e.vesselAId === a.id && e.vesselBId === b.id) || (e.vesselAId === b.id && e.vesselBId === a.id);
const keyOf = (a, b) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);

// ════════════════════════════════════════════════════════════════════════════════════════
header('T1 — ProximitySystem: statek w skoku nie tworzy pary (detekcja ani zasięg walki)');
{
  resetWorld();
  const vm = new VesselManager();
  window.KOSMOS.vesselManager = vm;
  const prox = new ProximitySystem(vm);
  const ev = record('vessel:proximityEnter', 'vessel:proximityExit', 'vessel:combatRangeEnter');
  const count = () => ev['vessel:proximityEnter'].length + ev['vessel:combatRangeEnter'].length;

  // T1a — KONTROLA: ten sam układ, 0,05 AU od siebie ⇒ para i zasięg walki (pin mierzy detekcję, nie ciszę).
  const me = ship(vm, { sys: 'sys_home', xAU: 1.00, name: 'Furia' });
  const foe = ship(vm, { sys: 'sys_home', xAU: 1.05, empire: 'emp_001', name: 'Wrog' });
  prox._checkPair(me, foe);
  assert(ev['vessel:proximityEnter'].some(e => pairOf(e, me, foe)) && ev['vessel:combatRangeEnter'].some(e => pairOf(e, me, foe)),
    'T1a KONTROLA: dwa uzbrojone kadłuby w TYM SAMYM układzie, 0,05 AU ⇒ `proximityEnter` i `combatRangeEnter`');

  // T1b — statek wroga W SKOKU, te same surowe współrzędne co kontrola.
  const warp = ship(vm, { sys: null, xAU: 1.05, empire: 'emp_001', name: 'W skoku' });
  const before = count();
  prox._checkPair(me, warp);
  assert(count() === before && !prox._activePairs.has(keyOf(me, warp)),
    `T1b statek W SKOKU (systemId null) nie tworzy pary z kadłubem w domu (zdarzeń: ${count() - before}) — było: „w domu” na współrzędnych sprzed skoku`);

  // T1c — oba w skoku: też żadnej pary (było: oba „w sys_home”).
  const warp2 = ship(vm, { sys: null, xAU: 1.06, empire: null, name: 'Gracz w skoku' });
  const b2 = count();
  prox._checkPair(warp2, warp);
  assert(count() === b2, `T1c dwa statki W SKOKU nie tworzą pary (zdarzeń: ${count() - b2})`);

  // T1d — KONTROLA: stary zapis (pole `systemId` usunięte) = `sys_home` — dalej para.
  const old = ship(vm, { sys: 'ABSENT', xAU: 1.04, empire: 'emp_001', name: 'Stary zapis' });
  prox._checkPair(me, old);
  assert(ev['vessel:proximityEnter'].some(e => pairOf(e, me, old)),
    'T1d KONTROLA: kadłub ze STAREGO zapisu (bez pola `systemId`) jest w `sys_home` — para powstaje jak dotąd');

  // T1e — KONTROLA: inny układ (istniejący guard 2026-07-15) — bez pary.
  const alien = ship(vm, { sys: 'sys_024', xAU: 1.05, empire: 'emp_001', name: 'Obcy uklad' });
  prox._checkPair(me, alien);
  assert(!ev['vessel:proximityEnter'].some(e => pairOf(e, me, alien)),
    'T1e KONTROLA: kadłub z INNEGO układu nie tworzy pary (guard 2026-07-15 bez zmian)');

  // T1f — para ZAMYKA SIĘ, gdy wróg skacze: aktywna para + `systemId` → null ⇒ `proximityExit`.
  assert(prox._activePairs.has(keyOf(me, foe)), 'T1f-0 WARUNEK SCENY: para Furia–Wrog jest aktywna');
  foe.systemId = null;
  prox._checkPair(me, foe);
  assert(ev['vessel:proximityExit'].some(e => pairOf(e, me, foe)) && !prox._activePairs.has(keyOf(me, foe)),
    'T1f para ZAMYKA SIĘ (`proximityExit`), gdy wróg wchodzi w skok — było: para trwała, statek „został w domu”');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T2 — ObservatorySystem: statek w skoku nie jest wykrywany w oglądanym układzie');
{
  resetWorld();
  const vm = new VesselManager();
  window.KOSMOS.vesselManager = vm;
  // Kolonia gracza z PRAWDZIWYM wpisem obserwatorium poziomu 1 (zasięg 3 AU) — ścieżka `getVesselDetectionRangeAU`.
  const colony = {
    planetId: 'p_home', name: 'Dom',
    planet: { id: 'p_home', x: 1.0 * AU, y: 0, systemId: 'sys_home' },
    buildingSystem: { _active: new Map([['h_obs', { building: { id: 'observatory' }, level: 1 }]]) },
  };
  window.KOSMOS.colonyManager = { getAllColonies: () => [colony] };
  const obs = new ObservatorySystem();
  const ev = record('vessel:detectionChanged');
  const detectedNow = (v) => ev['vessel:detectionChanged'].filter(e => e.vesselId === v.id).at(-1)?.detected === true;

  assert(obs.getVesselDetectionRangeAU(colony) === 3, `T2-0 WARUNEK SCENY: obserwatorium poz. 1 ⇒ zasięg 3 AU (${obs.getVesselDetectionRangeAU(colony)})`);

  // T2a — KONTROLA: wróg w oglądanym układzie, 0,5 AU od kolonii ⇒ wykryty.
  const foe = ship(vm, { sys: 'sys_home', xAU: 1.5, empire: 'emp_001', name: 'Wrog' });
  // T2b — wróg W SKOKU, 0,5 AU od kolonii w surowych współrzędnych.
  const warp = ship(vm, { sys: null, xAU: 1.5, yAU: 0.1, empire: 'emp_001', name: 'W skoku' });
  // T2c — KONTROLA: wróg ze starego zapisu (bez pola `systemId`) = `sys_home`.
  const old = ship(vm, { sys: 'ABSENT', xAU: 1.4, empire: 'emp_001', name: 'Stary zapis' });
  obs._tickVesselDetection(0.01);
  assert(detectedNow(foe) && obs.isVesselDetected(foe.id),
    'T2a KONTROLA: wróg w oglądanym układzie, w zasięgu obserwatorium ⇒ wykryty (pin mierzy detekcję, nie ciszę)');
  assert(!obs.isVesselDetected(warp.id) && !ev['vessel:detectionChanged'].some(e => e.vesselId === warp.id),
    'T2b wróg W SKOKU nie jest wykryty w oglądanym układzie — było: liczony na współrzędnych sprzed skoku (Finding 427)');
  assert(obs.isVesselDetected(old.id), 'T2c KONTROLA: wróg ze STAREGO zapisu (bez pola) jest w `sys_home` — wykryty jak dotąd');

  // T2d — wykrycie GAŚNIE, gdy wykryty wróg wchodzi w skok.
  foe.systemId = null;
  obs._tickVesselDetection(0.01);
  assert(!obs.isVesselDetected(foe.id) && ev['vessel:detectionChanged'].some(e => e.vesselId === foe.id && e.detected === false),
    'T2d wykrycie GAŚNIE (`detected: false`), gdy wróg wchodzi w skok — było: zostawał „widoczny” w układzie');
}

// ════════════════════════════════════════════════════════════════════════════════════════
header('T3 — źródło: ProximitySystem i ObservatorySystem bez własnej koercji; filtry mapy 2D nietknięte');
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
  const fmo = strip(readFileSync('src/ui/FleetManagerOverlay.js', 'utf8').replace(/\r\n/g, '\n'));
  const prox = strip(readFileSync('src/systems/ProximitySystem.js', 'utf8').replace(/\r\n/g, '\n'));
  const obs = strip(readFileSync('src/systems/ObservatorySystem.js', 'utf8').replace(/\r\n/g, '\n'));

  // KONTROLA PINU: zdejmowanie komentarzy działa i zostawia kod (inaczej „brak wzorca” byłby jałowy).
  assert(/const enemyVisible = allVessels\.filter\(/.test(fmo) && /_checkPair\(v1, v2\) \{/.test(prox) && /_tickVesselDetection\(/.test(obs),
    'T3-0 KONTROLA PINU: kod po zdjęciu komentarzy zawiera filtr `enemyVisible`, `_checkPair` i `_tickVesselDetection`');
  assert(!/\?\? 'sys_home'/.test(prox) && /const sameSystem = isSameSystemStrict\(v1, v2\);/.test(prox),
    'T3d TRIPWIRE: ProximitySystem nie ma własnej koercji `?? \'sys_home\'` — para z kanonu fail-closed');
  assert(!/\(v\.systemId \?\? sysId\)/.test(obs) && /if \(systemIdOf\(v\) !== sysId\) continue;/.test(obs),
    'T3e TRIPWIRE: ObservatorySystem filtruje układ statku kanonem `systemIdOf`');
  // GRANICA ZAKRESU: filtry mapy 2D (utajone) zostają, jak pinuje `fleet_engage_scope` T12c/T12d.
  assert(/\(v\.systemId \?\? 'sys_home'\) === sysId/.test(fmo) && /\(v\.systemId \?\? 'sys_home'\) !== sysId/.test(fmo),
    'T3f GRANICA ZAKRESU: filtry mapy 2D `FleetManagerOverlay` (utajone) nietknięte — pinowane jako zakres 166 w `fleet_engage_scope`');
}

console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
