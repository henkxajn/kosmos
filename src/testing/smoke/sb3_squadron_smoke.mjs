// ═══════════════════════════════════════════════════════════════════════════════
// sb3_squadron_smoke — KEEPER eskadry AI (AI STRIKES BACK S3, decyzje SB51, SB52, SB53, SB55; Findingi 396, 384)
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §2, §6.
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: desant AI z bitwy kadłubów liczył POJEMNOŚĆ ładowni (do 6) i TWORZYŁ jednostki przy lądowaniu — pusta
//   ładownia dawała falę „z niczego” (396), a jednostki z ładowni zostawały na pokładzie (384). AI nie miało żadnej drogi,
//   która wysyła transportowiec z wojskiem razem z eskortą.
// SB51–SB55: jedno wejście produkcyjne (`StrikeSquadronSystem.launchSquadron`) tworzy przy stolicy transportowiec
//   (`transport_assault`, funkcja tworzenia puli, poza limitem floty) i falę NOWYCH jednostek (floor(limit garnizonu ×
//   `strikeWaveShare`), obcięta do ładowni, skład i morale ze szczebla), ładuje ją i wysyła grupę razem; zapisuje rekord.
//   Desant ląduje DOKŁADNIE to, co jest na pokładzie; pusta ładownia — nic; zestrzelony transportowiec zabiera jednostki;
//   bez dominacji orbity — nic.
//
// ⚠ Harness: prawdziwy `GameCore` (imperia AI, kolonie, garnizon, `InvasionSystem`, `WarSystem`), dołożone MOS, OrderService,
//   EnemyAttackHandler (jak `w3_cross_system_attack_smoke`); pula i garnizon WYŁĄCZONE w setupie (wzór R-B2b) — keeper
//   mierzy eskadrę, nie mobilizację. Czas — `gameTime` + `_updatePositions` (wzór W3), bitwa — `_resolveBatchedBattle` wprost.
// ⚠ Moduły S3 importowane PRZESTRZENIĄ NAZW z `catch` — na kodzie sprzed S3 suita degraduje do czerwieni, nie wywraca się.
//
// PINY:
//   T1  planer fali: limit 13 → 6 (S,S,A,S,S,A; ładownia 10), limit 2 → 1, klamra ładowni (4 → S,S), udział 0 → 0
//   T2  wejście produkcyjne: jeden transportowiec (`transport_assault`, poza limitem floty), jednostki NOWE (garnizon stolicy
//       bez zmian), w ładowni, morale szczebla; grupa w composite z jednym kątem; rekord w zapisie (round-trip `gameState`)
//   T3  desant = ładunek: po wygranej orbicie lądują DOKŁADNIE jednostki z ładowni (te same id), ładownia pusta, żadna
//       jednostka nie powstaje przy lądowaniu; rekord `landed`
//   T4  pusta ładownia — nic nie ląduje (`invasion:blocked` `empty_cargo`), żadna jednostka nie powstaje
//   T5  zestrzelony transportowiec: jednostki giną (`transport_lost`), rekord `transport_lost`, po wygranej eskorty — brak
//       desantu (`no_drop_capable_hull`)
//   T6  bez dominacji orbity — brak desantu, ładunek zostaje na pokładzie; para — z dominacją ląduje
//   T7  odmowy niczego nie zostawiają: eskorta zajęta / strażnik / bez baku przy skoku / pusta fala / odmowa grupy (cofnięcie)
//   T8  klucz `strikeWaveShare`: domyślnie 0,5; zmiana działa w chwili odczytu; odmowy typu i zakresu; reset
//   T9  odczyt `sbTuning()` (fala na imperium) i montaż w `GameScene` + `GameCore` (lokator, dźwignia debug)
//   T10 KONTROLA (T10a, zielona po obu stronach): `launchInvasion` (gałąź abstrakcyjna, dźwignia `force_invasion`) dalej
//       tworzy jednostki z liczby; T10b: `_onVesselGroupVictory` nie woła już `launchInvasion`
//   T11 audyt: `squadron:launched` / `squadron:launchRefused` w `DebugLog.TRACKED_EVENTS`
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import gameState from '../../core/GameState.js';
import { GameCore } from '../headless/GameCore.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import * as VS from '../../entities/Vessel.js';
import { garrisonAnchor } from '../../utils/GarrisonPlanner.js';
import { readFileSync } from 'node:fs';

const WP  = await import('../../utils/StrikeWavePlanner.js').catch(() => null);
const SQS = await import('../../systems/StrikeSquadronSystem.js').catch(() => null);
const TUN = await import('../../utils/StrikesBackTuning.js').catch(() => null);

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
}
function boot() {
  const core = new GameCore();
  quiet(() => core.boot({ quiet: true, scenario: 'civilization' }));
  const K = window.KOSMOS;
  K.movementOrderSystem = new MovementOrderSystem(core.vesselManager);
  K.orderService = new OrderService();
  K.enemyAttackHandler = new EnemyAttackHandler();
  if (K.garrisonSystem) K.garrisonSystem.enabled = false;
  if (K.fleetPoolSystem) K.fleetPoolSystem.enabled = false;
  const emp = K.empireRegistry.listAll()[0].id;
  const cap = K.directorProduction.capitalOf(emp);
  const w = { core, K, vm: K.vesselManager, gum: K.groundUnitManager, inv: K.invasionSystem, sq: K.strikeSquadronSystem,
              emp, cap, home: K.homePlanet, ev: [] };
  for (const n of ['squadron:launched', 'squadron:launchRefused', 'invasion:blocked', 'invasion:troopsLanded', 'groundUnit:destroyed', 'groundUnit:created']) {
    EventBus.on(n, (d) => w.ev.push({ n, d }));
  }
  return w;
}
const evs = (w, n) => w.ev.filter(e => e.n === n).map(e => e.d);
function escorts(w, n = 2) {
  return Array.from({ length: n }, () => w.vm.createAIVessel({ templateId: 'frigate_missile_escort', empireId: w.emp, planetId: w.cap.planetId }).vessel);
}
function launch(w, es = escorts(w)) {
  const r = w.sq?.launchSquadron?.(w.emp, w.home.id, es.map(v => v.id)) ?? null;
  return { r, es, tr: r?.transportId ? w.vm.getVessel(r.transportId) : null };
}
/** Skok, potem odcinek w układzie celu — czas skacze do chwil przylotu (wzór W3). */
function fly(w, tr) {
  w.K.timeSystem.gameTime = (tr.mission?.arrivalYear ?? 0) + 0.001;
  w.vm._updatePositions(0.01);
  const T = tr.mission?.arrivalYear ?? 0;
  w.K.timeSystem.gameTime = T + 0.001;
  w.vm._updatePositions(0.01);
}
function battle(w, planetId) {
  const p = w.K.enemyAttackHandler._pendingBattles.get(planetId);
  if (p?.timerId) clearTimeout(p.timerId);
  quiet(() => w.K.enemyAttackHandler._resolveBatchedBattle(planetId));
}
const unitsOf = (w) => w.gum.getAllUnits().length;
const onPlanet = (w, pid, owner) => w.gum.getUnitsOnPlanet(pid).filter(u => u.owner === owner);

// ═══ T1 — planer fali ═════════════════════════════════════════════════════════
header('T1  planer fali (czyste funkcje)');
{
  const tierTop = { index: 3, artilleryEvery: 3, morale: 100 };
  const p13 = WP?.planWave?.({ limit: 13, share: 0.5, tier: tierTop, capacity: 32 });
  const p2  = WP?.planWave?.({ limit: 2, share: 0.5, tier: { index: 0, artilleryEvery: 0, morale: 30 }, capacity: 32 });
  const pc  = WP?.planWave?.({ limit: 13, share: 0.5, tier: tierTop, capacity: 4 });
  const p0  = WP?.planWave?.({ limit: 13, share: 0, tier: tierTop, capacity: 32 });
  const S = 'shock_infantry', A = 'rocket_artillery';
  console.log(`     limit 13: ${p13?.composition?.join(',')} (${p13?.size}/32) · limit 2: ${p2?.composition?.join(',')} · ładownia 4: ${pc?.composition?.join(',')}`);
  assert(p13?.count === 6 && same(p13.composition, [S, S, A, S, S, A]) && p13.size === 10 && p13.morale === 100,
    'T1a limit 13 × 0,5 → 6 jednostek (S,S,A,S,S,A), ładownia 10, morale szczebla 100');
  assert(p2?.count === 1 && same(p2.composition, [S]) && p2.morale === 30, 'T1b limit 2 × 0,5 → 1 jednostka');
  assert(pc?.count === 2 && same(pc.composition, [S, S]) && pc.cappedByCapacity === true && pc.wanted === 6,
    'T1c klamra ładowni: chciane 6, mieści się S,S (4 jednostki ładowni) — prefiks, nigdy ponad ładownię');
  assert(p0?.count === 0 && p0.wanted === 0, 'T1d udział 0 → fala pusta');
  assert(WP?.STRIKE_TRANSPORT_TEMPLATE === 'transport_assault' && WP?.transportCapacity?.() === 32,
    'T1e transportowiec `transport_assault`, ładownia 32 (szablon „wszystko zbadane”)');
}

// ═══ T2 — wejście produkcyjne ═════════════════════════════════════════════════
header('T2  wejście produkcyjne: transportowiec, fala NOWYCH jednostek, grupa, rekord');
{
  const w = boot();
  // Garnizon stolicy STOI przed wysłaniem (dwie jednostki) — inaczej „garnizon bez zmian” byłby prawdą o pustym zbiorze.
  const anchor = garrisonAnchor(w.cap.grid, !!w.cap.isOutpost) ?? { q: 0, r: 0 };
  for (let i = 0; i < 2; i++) {
    w.gum.createAIUnit({ archetypeId: 'garrison_unit', empireId: w.emp, planetId: w.cap.planetId, q: anchor.q, r: anchor.r, morale: 50 });
  }
  const garrisonBefore = onPlanet(w, w.cap.planetId, w.emp).map(u => u.id).sort();
  const vesselsBefore = w.vm.getAllVessels().length;
  const es = escorts(w);
  const units0 = unitsOf(w);
  const { r, tr } = launch(w, es);
  const tier = w.sq?.wavePlan?.(w.emp);
  const cargo = tr?.groundUnits ?? [];
  const us = cargo.map(id => w.gum.getUnit(id));
  console.log(`     ${JSON.stringify({ ok: r?.ok, reason: r?.reason, sq: r?.squadronId, tr: r?.transportId, units: r?.unitIds, wave: r?.wave?.composition })}`);
  assert(r?.ok === true && !!tr, 'T2-0 eskadra wysłana');
  assert(tr?.directorOrigin === 'transport_assault' && tr?.origin === 'squadron' && VS.isFleetLimitHull?.(tr) === false
    && w.vm.getAllVessels().length === vesselsBefore + 3, 'T2a JEDEN transportowiec `transport_assault` (pochodzenie `squadron`), poza limitem floty');
  assert(cargo.length === (r?.unitIds?.length ?? -1) && same(cargo, r?.unitIds) && unitsOf(w) === units0 + cargo.length
    && us.every(u => u && u.status === 'in_cargo' && u.owner === w.emp && u.popCost === 0 && u.morale === tier?.morale),
    'T2b fala: jednostki NOWE (licznik +N), w ładowni, właściciel imperium, bez POP, morale szczebla');
  assert(r?.ok === true && cargo.length > 0 && garrisonBefore.length === 2 && cargo.every(id => !garrisonBefore.includes(id))
    && same(onPlanet(w, w.cap.planetId, w.emp).map(u => u.id).sort(), garrisonBefore),
    'T2c garnizon stolicy (2 jednostki) bez zmian, fala to INNE jednostki (fala nie z garnizonu)');
  const members = [...es, tr].filter(Boolean);
  const angles = members.map(v => v.mission?.arrivalAngle);
  assert(members.length === 3 && members.every(v => v.pendingOrder?.groupId === r?.squadronId && v.mission?.type === 'interstellar_jump')
    && angles.every(a => Number.isFinite(a) && a === angles[0]), 'T2d grupa: composite z `groupId` = id eskadry, jeden kąt przylotu');
  const rec = w.sq?.getSquadron?.(r?.squadronId);
  const data = JSON.parse(JSON.stringify(gameState.serialize()));
  gameState.restore(data);
  const rec2 = w.sq?.getSquadron?.(r?.squadronId);
  assert(rec?.stage === 'launched' && rec.transportId === tr?.id && same(rec.escortIds, es.map(v => v.id)) && same(rec.unitIds, cargo)
    && same(rec2, rec), 'T2e rekord eskadry w zapisie (`strikeSquadrons`) — round-trip `gameState` bez zmian');
  assert(evs(w, 'squadron:launched').length === 1, 'T2f jedno zdarzenie `squadron:launched` (audyt)');
}

// ═══ T3 — desant = ładunek ════════════════════════════════════════════════════
header('T3  po wygranej orbicie lądują DOKŁADNIE jednostki z ładowni');
{
  const w = boot();
  const { r, tr } = launch(w);
  const aboard = [...(tr?.groundUnits ?? [])];
  if (tr) fly(w, tr);
  const units0 = unitsOf(w);
  battle(w, w.home.id);
  const landed = evs(w, 'invasion:troopsLanded');
  const onHome = onPlanet(w, w.home.id, w.emp).map(u => u.id).sort();
  console.log(`     na pokładzie ${aboard.join(',')} · wylądowało ${landed.map(e => e.unitIds.join(',')).join(' | ')} · na ciele ${onHome.join(',')}`);
  assert(r?.ok === true && aboard.length > 0, 'T3-0 eskadra z falą na pokładzie');
  assert(landed.length === 1 && same([...landed[0].unitIds].sort(), [...aboard].sort()) && same(onHome, [...aboard].sort()),
    'T3a wylądowały DOKŁADNIE jednostki z ładowni (te same id)');
  assert(r?.ok === true && aboard.length > 0 && landed.length === 1
    && (tr?.groundUnits ?? []).length === 0 && (tr?.troopBayUsed ?? 0) === 0 && unitsOf(w) === units0,
    'T3b ładownia pusta, żadna jednostka nie powstała przy lądowaniu');
  assert(landed[0]?.vesselIds?.includes(tr?.id) && w.sq?.getSquadron?.(r?.squadronId)?.stage === 'landed', 'T3c rekord eskadry: `landed`');
}

// ═══ T4 — pusta ładownia ══════════════════════════════════════════════════════
header('T4  pusta ładownia — nic nie ląduje');
{
  const w = boot();
  const { r, tr } = launch(w);
  const emptied = (tr?.groundUnits ?? []).length;                        // świadek: ładownia BYŁA pełna
  for (const id of [...(tr?.groundUnits ?? [])]) w.gum.removeUnit(id);   // ładownia opróżniona przed przylotem
  if (tr) fly(w, tr);
  const units0 = unitsOf(w);
  battle(w, w.home.id);
  assert(r?.ok === true && emptied > 0 && (tr?.groundUnits ?? []).length === 0, 'T4-0 eskadra wysłana, ładownia opróżniona');
  assert(r?.ok === true && emptied > 0
    && evs(w, 'invasion:troopsLanded').length === 0 && onPlanet(w, w.home.id, w.emp).length === 0 && unitsOf(w) === units0,
    'T4a nic nie wylądowało, żadna jednostka nie powstała');
  assert(evs(w, 'invasion:blocked').some(b => b.reason === 'empty_cargo'), 'T4b odmowa `empty_cargo` w `invasion:blocked`');
}

// ═══ T5 — zestrzelony transportowiec ══════════════════════════════════════════
header('T5  zestrzelony transportowiec zabiera falę');
{
  const w = boot();
  const { r, tr } = launch(w);
  const aboard = [...(tr?.groundUnits ?? [])];
  if (tr) quiet(() => w.K.enemyAttackHandler._turnIntoWreck(tr, { x: tr.position.x + 5, y: tr.position.y }, w.K.timeSystem.gameTime));
  const dead = evs(w, 'groundUnit:destroyed').filter(d => aboard.includes(d.unitId));
  assert(r?.ok === true && aboard.length > 0 && tr?.isWreck === true, 'T5-0 transportowiec z falą stał się wrakiem');
  assert(aboard.length > 0 && dead.length === aboard.length && dead.every(d => d.cause === 'transport_lost')
    && aboard.every(id => !w.gum.getUnit(id)),
    'T5a jednostki z ładowni zginęły (`transport_lost`)');
  assert(w.sq?.getSquadron?.(r?.squadronId)?.stage === 'transport_lost', 'T5b rekord eskadry: `transport_lost`');
  const e1 = w.vm.getVessel(r?.squadronId ? w.sq.getSquadron(r.squadronId).escortIds[0] : '');
  if (e1) fly(w, e1);
  battle(w, w.home.id);
  assert(evs(w, 'invasion:troopsLanded').length === 0 && evs(w, 'invasion:blocked').some(b => b.reason === 'no_drop_capable_hull'),
    'T5c eskorta wygrywa orbitę — desantu brak (`no_drop_capable_hull`)');
}

// ═══ T6 — dominacja ═══════════════════════════════════════════════════════════
header('T6  bez dominacji orbity — brak desantu; z dominacją — desant');
{
  const w = boot();
  const { r, tr } = launch(w);
  if (tr) fly(w, tr);
  quiet(() => w.K.diplomacySystem.declareWar(w.emp, 'keeper_setup'));
  const sys = EntityManager.get(w.home.id)?.systemId;
  const guard = w.vm.createAndRegister('hull_frigate', w.home.id, { name: 'Obrońca', modules: ['weapon_laser', 'engine_ion'] });
  guard.position.state = 'orbiting'; guard.position.dockedAt = w.home.id; guard.systemId = sys;
  gameState.set(`orbitalDominance.${sys}`, { controllerId: 'player', year: 0 }, 'keeper');
  const result = { winner: 'A', location: { systemId: sys, planetId: w.home.id, point: null },
    participantA: { type: 'vessel_group', empireId: w.emp, vesselIds: [...(r?.squadronId ? w.sq.getSquadron(r.squadronId).escortIds : []), tr?.id] },
    participantB: { type: 'player', empireId: 'player', systemId: sys } };
  const aboard = [...(tr?.groundUnits ?? [])];
  w.inv._onVesselGroupVictory({ result });
  assert(r?.ok === true && aboard.length > 0, 'T6-0 eskadra na orbicie celu z falą na pokładzie');
  assert(evs(w, 'invasion:troopsLanded').length === 0 && same(tr?.groundUnits, aboard)
    && evs(w, 'invasion:blocked').some(b => b.reason === 'no_orbital_dominance'), 'T6a bez dominacji: nic nie ląduje, ładunek na pokładzie');
  quiet(() => w.K.enemyAttackHandler._turnIntoWreck(guard, w.home.id, w.K.timeSystem.gameTime));
  gameState.set(`orbitalDominance.${sys}`, { controllerId: w.emp, year: 0 }, 'keeper');
  w.inv._onVesselGroupVictory({ result });
  const landed = evs(w, 'invasion:troopsLanded');
  assert(landed.length === 1 && same([...landed[0].unitIds].sort(), [...aboard].sort()), 'T6b (para T6a): z dominacją ląduje ładunek');
}

// ═══ T7 — odmowy ══════════════════════════════════════════════════════════════
header('T7  odmowy niczego nie zostawiają');
{
  const w = boot();
  const snap = () => ({ v: w.vm.getAllVessels().length, u: unitsOf(w), s: Object.keys(gameState.get('strikeSquadrons') ?? {}).length });
  const es = escorts(w);
  const s0 = snap();
  es[0].mission = { type: 'patrol_keeper' };
  const busy = w.sq?.launchSquadron?.(w.emp, w.home.id, es.map(v => v.id));
  es[0].mission = null;
  assert(busy?.ok === false && busy.reason === 'escort_busy' && same(snap(), s0), 'T7a eskorta zajęta — odmowa `escort_busy`, nic nie powstało');
  const defender = w.vm.createAIVessel({ templateId: 'frigate_system_defender', empireId: w.emp, planetId: w.cap.planetId }).vessel;
  const s1 = snap();
  const nowarp = w.sq?.launchSquadron?.(w.emp, w.home.id, [defender.id]);
  assert(nowarp?.ok === false && nowarp.reason === 'escort_no_warp_tank' && same(snap(), s1), 'T7b eskorta bez baku przy skoku — odmowa, nic nie powstało');
  TUN?.setTuning?.('strikeWaveShare', 0);
  const empty = w.sq?.launchSquadron?.(w.emp, w.home.id, es.map(v => v.id));
  TUN?.resetTuning?.('strikeWaveShare');
  assert(empty?.ok === false && empty.reason === 'empty_wave' && same(snap(), s1), 'T7c fala pusta (udział 0) — odmowa `empty_wave`, nic nie powstało');
  const os = w.K.orderService;
  const real = os.issueGroupAttack;
  os.issueGroupAttack = () => ({ ok: false, reason: 'keeper_refusal' });
  const refused = w.sq?.launchSquadron?.(w.emp, w.home.id, es.map(v => v.id));
  os.issueGroupAttack = real;
  assert(refused?.ok === false && refused.reason === 'group_refused' && same(snap(), s1),
    'T7d odmowa rozkazu grupy — transportowiec i jednostki COFNIĘTE (stan jak przed wołaniem)');
  assert(evs(w, 'squadron:launchRefused').length === 4 && evs(w, 'squadron:launched').length === 0, 'T7e każda odmowa w audycie (`squadron:launchRefused`)');
  const ok = w.sq?.launchSquadron?.(w.emp, w.home.id, es.map(v => v.id));
  assert(ok?.ok === true, 'T7f po odmowach te same eskorty — eskadra wysłana (odmowy niczego nie zablokowały)');
}

// ═══ T8 — klucz strojenia ═════════════════════════════════════════════════════
header('T8  klucz `strikeWaveShare`');
{
  const w = boot();
  const T = (await import('../../data/StrikesBackData.js')).SB_TUNING;
  const base = w.sq?.wavePlan?.(w.emp);
  const bad1 = TUN?.setTuning?.('strikeWaveShare', 1.5);
  const bad2 = TUN?.setTuning?.('strikeWaveShare', 'pół');
  const set = TUN?.setTuning?.('strikeWaveShare', 1.0);
  const full = w.sq?.wavePlan?.(w.emp);
  const rs = TUN?.resetTuning?.('strikeWaveShare');
  const back = w.sq?.wavePlan?.(w.emp);
  console.log(`     udział 0,5: fala ${base?.count}/${base?.limit} · 1,0: ${full?.count} · po resecie: ${back?.count}`);
  assert(T?.strikeWaveShare?.default === 0.5 && T.strikeWaveShare.type === 'number' && T.strikeWaveShare.min === 0 && T.strikeWaveShare.max === 1,
    'T8a klucz w tabeli: domyślnie 0,5, typ liczba, zakres 0..1');
  assert(bad1?.ok === false && bad1.reason === 'out_of_range' && bad2?.ok === false && bad2.reason === 'wrong_type', 'T8b odmowy zakresu i typu');
  assert(set?.ok === true && full?.count === full?.limit && base?.count === Math.floor(base.limit * 0.5) && rs?.ok === true && back?.count === base?.count,
    'T8c zmiana działa w chwili odczytu (fala = limit przy 1,0), reset przywraca');
}

// ═══ T9 — odczyt i montaż ═════════════════════════════════════════════════════
header('T9  odczyt `sbTuning()` i montaż');
{
  const w = boot();
  const log = console.table;
  let printed = null;
  console.table = (rows) => { printed = rows; };
  const rows = WP?.printStrikeWaves?.(w.K) ?? null;
  console.table = log;
  const cols = ['imperium', 'limitGarnizonu', 'udzial', 'fala', 'chciana', 'sklad', 'morale', 'ladownia', 'stolica'];
  assert(Array.isArray(rows) && rows.length === w.K.empireRegistry.listAll().length && rows.every(r => same(Object.keys(r), cols)) && printed === rows,
    'T9a `printStrikeWaves`: wiersz na imperium (limit, udział, fala, skład, morale, ładownia, stolica)');
  const gs = src('../../scenes/GameScene.js');
  assert(/window\.KOSMOS\.strikeSquadronSystem = this\.strikeSquadronSystem;/.test(gs) && /new StrikeSquadronSystem\(\)/.test(gs)
    && /fala: printStrikeWaves\(window\.KOSMOS\)/.test(gs) && /sbLaunchSquadron: \(empireId, targetBodyId, escorts = 2\) =>/.test(gs)
    && /sq\.launchSquadron\(empireId, targetBodyId, ids\)/.test(gs),
    'T9b `GameScene`: system zamontowany w lokatorze, fala w `sbTuning()`, dźwignia `sbLaunchSquadron` woła wejście produkcyjne');
  assert(w.K.strikeSquadronSystem instanceof (SQS?.StrikeSquadronSystem ?? class {}), 'T9c uprząż `GameCore`: ten sam system w lokatorze (parytet)');
}

// ═══ T10 — gałąź z liczby ═════════════════════════════════════════════════════
header('T10 `launchInvasion` dalej tworzy jednostki z liczby (KONTROLA, T10a); desant z bitwy — wyłącznie z ładunku (T10b)');
{
  const w = boot();
  quiet(() => w.K.diplomacySystem.declareWar(w.emp, 'keeper_setup'));
  const u0 = unitsOf(w);
  const res = w.inv.launchInvasion(w.emp, w.home.id, 3);
  assert(res?.success === true && res.landed.length === 3 && unitsOf(w) === u0 + 3, 'T10a `launchInvasion(…, 3)` — 3 NOWE jednostki (dźwignia, gałąź abstrakcyjna)');
  const inv = src('../../systems/InvasionSystem.js');
  const victory = inv.slice(inv.indexOf('  _onVesselGroupVictory({ result }) {'), inv.indexOf('  _onBattleResolved('));
  assert(/this\._landCargo\(empireId, target\.planetId, droppers\)/.test(victory) && !/launchInvasion\(/.test(victory)
    && !/MAX_TROOPS_PER_VESSEL_LANDING/.test(inv), 'T10b `_onVesselGroupVictory` ląduje ładunek (`_landCargo`), nie woła `launchInvasion`; klamra pojemności usunięta');
}

// ═══ T11 — audyt ══════════════════════════════════════════════════════════════
header('T11 audyt w `DebugLog.TRACKED_EVENTS`');
{
  const dl = src('../../core/DebugLog.js');
  const tracked = dl.slice(dl.indexOf('TRACKED_EVENTS'), dl.indexOf('class DebugLog'));
  assert(/'squadron:launched'/.test(tracked) && /'squadron:launchRefused'/.test(tracked) && /'invasion:blocked'/.test(tracked),
    'T11 `squadron:launched` i `squadron:launchRefused` śledzone (sprawdzenie metody: `invasion:blocked` widoczne)');
}

console.log(`\n═══ sb3_squadron_smoke: ${pass} PASS / ${fail} FAIL ═══`);
if (fail > 0) process.exit(1);
