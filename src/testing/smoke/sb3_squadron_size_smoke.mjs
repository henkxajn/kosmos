// ═══════════════════════════════════════════════════════════════════════════════
// sb3_squadron_size_smoke — KEEPER wielkości eskadry jako kluczy strojenia (AI STRIKES BACK S3, sesja 2 — decyzja SB56).
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §2.
// ─────────────────────────────────────────────────────────────────────────────
// CO ZMIENIA: mnożnik eskadry (`requiredSquadron`: potrzebne = ceil(HP obrońcy × mnożnik / HP kadłuba)) i sufit eskadry
//   były stałymi (`SQUADRON_HP_RATIO` 1,5, `MAX_STRIKE_SIZE` 3; reguła uderzenia miała dodatkowo `maxShips: 3` w danych).
//   SB56: oba to KLUCZE tabeli strojenia (`squadronHpRatio` domyślnie 1,0, `squadronMaxShips` domyślnie 3), czytane
//   W CHWILI UŻYCIA (przez planer eskadry `StrikeWavePlanner`); `sbTuning()` pokazuje eskadrę potrzebną wobec dostępnej.
//
// ⚠ Harness jak `w3_target_selection_smoke` (prawdziwy `GameCore`, MOS, OrderService, `DirectorOffensive` z rejestracją;
//   mapa wpływów — atrapa o jawnym kontrakcie; pula wyłączona — wzór R-B2b).
// ⚠ Moduły importowane przestrzenią nazw z `catch` — na kodzie sprzed S3/2 suita degraduje do czerwieni.
//
// PINY:
//   T1  klucze: domyślnie 1,0 (liczba 0,1..10) i 3 (całkowita 1..24); odmowy typu i zakresu; reset
//   T2  odczyt w chwili użycia: ta sama obrona (wieża Lv3, 120 HP; kadłuby 120 HP) — mnożnik 1,5 → potrzebne 2,
//       1,0 → 1; `SQUADRON_HP_RATIO` / `MAX_STRIKE_SIZE` = wartości domyślne kluczy
//   T3  sufit z klucza: potrzebne 4 przy sufitcie 3 — `target_beyond_reach`; sufit 5 i 5 okrętów — start, rusza 5 (reguła
//       nie ma już stałej `maxShips` w danych)
//   T4  SB56 wprost (domyślne 1,0): jeden rajder RUSZA na cel z wieżą Lv3 (przy 1,5 — `insufficient_squadron`)
//   T5  konsola: `printSquadronNeeds` — wiersz na (imperium, cel) z potrzebne / sufit / dostępne / werdykt; werdykt
//       zgodny z decyzją `launchStrike`; `sbTuning()` w `GameScene` drukuje eskadrę
//   T6  źródło: decyzje czytają klucze (`squadronHpRatio()`, `squadronMaxShips()`), nie stałe
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import EntityManager from '../../core/EntityManager.js';
import { createVessel } from '../../entities/Vessel.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { readFileSync } from 'node:fs';

const OFF  = await import('../../systems/director/DirectorOffensive.js').catch(() => null);
const DATA = await import('../../data/StrikesBackData.js').catch(() => null);
const TUN  = await import('../../utils/StrikesBackTuning.js').catch(() => null);
const WP   = await import('../../utils/StrikeWavePlanner.js').catch(() => null);
const RULES = await import('../../data/DirectorRuleData.js').catch(() => null);

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const tun = (name, ...a) => (typeof TUN?.[name] === 'function' ? TUN[name](...a) : undefined);

const RAIDER = ['engine_warp', 'warp_tank', 'armor_heavy', 'weapon_laser'];

function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
}
function boot() {
  const core = new GameCore();
  quiet(() => core.boot({ quiet: true, scenario: 'civilization' }));
  if (window.KOSMOS.fleetPoolSystem) window.KOSMOS.fleetPoolSystem.enabled = false;
  window.KOSMOS.movementOrderSystem = new MovementOrderSystem(core.vesselManager);
  window.KOSMOS.orderService = new OrderService();
  const off = OFF?.DirectorOffensive ? new OFF.DirectorOffensive() : null;
  if (off) OFF.registerOffensiveBehaviors(off, { allowOverride: true });
  window.KOSMOS.directorOffensive = off;
  const empireId = core.empireRegistry.listAll()[0]?.id;
  const cap = core.colonyManager.getAllColonies().find(c => c.ownerEmpireId === empireId) ?? null;
  window.KOSMOS.directorProduction = { capitalOf: () => cap };
  const home = window.KOSMOS.homePlanet;
  window.KOSMOS.influenceMap = { isClaimedBy: () => false, isInBorderZone: (s) => s === home.systemId };
  quiet(() => window.KOSMOS.diplomacySystem?.declareWar?.(empireId, 'keeper_setup'));
  return { core, off, empireId, cap, capBody: EntityManager.get(cap.planetId), home };
}
function spawn(w, n, name = 'Rajder') {
  return Array.from({ length: n }, (_, i) => {
    const v = createVessel('hull_frigate', w.capBody.id, { name: `${name}${i}`, modules: [...RAIDER], x: w.capBody.x ?? 0, y: w.capBody.y ?? 0, systemId: w.capBody.systemId });
    v.ownerEmpireId = w.empireId; v.owner = w.empireId; v.isEnemy = true;
    v.position.state = 'orbiting'; v.position.dockedAt = w.capBody.id; v.mission = null; v.movementOrder = null;
    w.core.vesselManager._vessels.set(v.id, v);
    return v;
  });
}
function defend(w, level, id = 'def_probe') {
  w.core.colonyManager.getColony(w.home.id)?.buildingSystem?._active?.set(id, { building: { id: 'defense_tower' }, level, jobs: 0 });
}

// ═══ T1 — klucze ══════════════════════════════════════════════════════════════
header('T1  klucze `squadronHpRatio` i `squadronMaxShips`');
{
  const T = DATA?.SB_TUNING ?? {};
  assert(T.squadronHpRatio?.default === 1.0 && T.squadronHpRatio.type === 'number' && T.squadronHpRatio.min === 0.1 && T.squadronHpRatio.max === 10,
    'T1a `squadronHpRatio`: domyślnie 1,0, liczba 0,1..10');
  assert(T.squadronMaxShips?.default === 3 && T.squadronMaxShips.type === 'int' && T.squadronMaxShips.min === 1 && T.squadronMaxShips.max === 24,
    'T1b `squadronMaxShips`: domyślnie 3, całkowita 1..24');
  const a = tun('setTuning', 'squadronHpRatio', 0), b = tun('setTuning', 'squadronMaxShips', 2.5), c = tun('setTuning', 'squadronMaxShips', 0);
  assert(a?.ok === false && a.reason === 'out_of_range' && b?.ok === false && b.reason === 'wrong_type' && c?.ok === false && c.reason === 'out_of_range',
    'T1c odmowy zakresu i typu');
  const s = tun('setTuning', 'squadronMaxShips', 5), r = tun('resetTuning', 'squadronMaxShips');
  assert(s?.ok === true && WP?.squadronMaxShips?.() === 3 && r?.ok === true, 'T1d zmiana i reset (po resecie odczyt = 3)');
}

// ═══ T2 — odczyt w chwili użycia ══════════════════════════════════════════════
header('T2  mnożnik czytany w chwili użycia');
{
  const w = boot();
  defend(w, 3);
  const ready = spawn(w, 2);
  const t = w.off?.pickTarget?.(w.empireId);
  tun('setTuning', 'squadronHpRatio', 1.5);
  const n15 = w.off?.requiredSquadron?.(t, ready);
  tun('resetTuning', 'squadronHpRatio');
  const n10 = w.off?.requiredSquadron?.(t, ready);
  console.log(`     obrona ${n10?.defenderHp} HP, kadłub ${n10?.perShipHp} HP · potrzebne: 1,5 → ${n15?.needed}, 1,0 → ${n10?.needed}`);
  assert(t?.defended === true && n10?.defenderHp > 0, 'T2-0 cel broniony (wieża Lv3), zmierzone HP obrońcy');
  assert(n15?.needed === 2 && n10?.needed === 1, 'T2a ta sama obrona: mnożnik 1,5 → 2 okręty, 1,0 → 1 (klucz czytany przy decyzji)');
  assert(OFF?.SQUADRON_HP_RATIO === 1.0 && OFF?.MAX_STRIKE_SIZE === 3, 'T2b `SQUADRON_HP_RATIO` i `MAX_STRIKE_SIZE` = wartości domyślne kluczy');
}

// ═══ T3 — sufit z klucza ══════════════════════════════════════════════════════
header('T3  sufit eskadry z klucza');
{
  const w = boot();
  defend(w, 5, 'def_a'); defend(w, 5, 'def_b');
  const ready = spawn(w, 5);
  const t = w.off?.pickTarget?.(w.empireId);
  const need = w.off?.requiredSquadron?.(t, ready)?.needed;
  const r3 = w.off?.launchStrike?.({ empireId: w.empireId, year: 10 });
  tun('setTuning', 'squadronMaxShips', 5);
  const r5 = w.off?.launchStrike?.({ empireId: w.empireId, year: 11 });
  tun('resetTuning', 'squadronMaxShips');
  console.log(`     potrzebne ${need} · sufit 3: ${r3?.reason ?? r3?.launched} · sufit 5: ruszyło ${r5?.launched}`);
  assert(need > 3 && need <= 5, `T3-0 obrona wymaga ${need} okrętów (między 3 a 5)`);
  assert(r3?.launched === 0 && r3.reason === 'target_beyond_reach', 'T3a KONTROLA (zielona po obu stronach): sufit 3 — `target_beyond_reach`');
  assert(r5?.launched === 5, 'T3b sufit 5 przy 5 okrętach — rusza 5 (sufit z klucza, nie ze stałej w danych)');
  assert(RULES?.DIRECTOR_RULES?.strike_player_target?.response?.params?.maxShips === undefined,
    'T3c reguła uderzenia nie niesie stałej `maxShips` w danych');
}

// ═══ T4 — SB56 wprost ═════════════════════════════════════════════════════════
header('T4  SB56: przy domyślnym 1,0 jeden rajder rusza na cel z wieżą Lv3');
{
  const w = boot();
  defend(w, 3);
  const [solo] = spawn(w, 1, 'Samotny');
  tun('setTuning', 'squadronHpRatio', 1.5);
  const r15 = w.off?.launchStrike?.({ empireId: w.empireId, year: 10 });
  tun('resetTuning', 'squadronHpRatio');
  const r10 = w.off?.launchStrike?.({ empireId: w.empireId, year: 11 });
  console.log(`     1,5: ${r15?.reason} (potrzebne ${r15?.needed}) · 1,0: ruszyło ${r10?.launched} (potrzebne ${r10?.needed})`);
  assert(r15?.launched === 0 && r15.reason === 'insufficient_squadron' && r15.needed === 2, 'T4a KONTROLA (zielona po obu stronach): mnożnik 1,5 — odmowa `insufficient_squadron` (potrzebne 2)');
  assert(r10?.launched === 1 && r10.needed === 1 && !!solo?.pendingOrder, 'T4b mnożnik 1,0 (domyślny) — jeden rajder rusza (potrzebne 1)');
}

// ═══ T5 — konsola ═════════════════════════════════════════════════════════════
header('T5  konsola: eskadra potrzebna wobec dostępnej');
{
  const w = boot();
  defend(w, 3);
  spawn(w, 1);
  const tbl = console.table;
  let printed = null;
  console.table = (rows) => { printed = rows; };
  const rows = WP?.printSquadronNeeds?.(window.KOSMOS) ?? null;
  console.table = tbl;
  const cols = ['imperium', 'rodzaj', 'cel', 'uklad', 'obronaHP', 'kadlubHP', 'mnoznik', 'potrzebne', 'sufit', 'dostepne', 'werdykt'];
  const row = rows?.find(r => r.imperium === w.empireId && r.cel === w.home.id);
  const dec = w.off?.launchStrike?.({ empireId: w.empireId, year: 10 });
  console.log(`     ${JSON.stringify(row)} · decyzja: ${dec?.launched > 0 ? 'start' : dec?.reason}`);
  assert(Array.isArray(rows) && rows.length >= 1 && rows.every(r => JSON.stringify(Object.keys(r)) === JSON.stringify(cols)) && printed === rows,
    'T5a wiersz na (imperium, cel): rodzaj, potrzebne, sufit, dostępne, werdykt');
  assert(row?.potrzebne === 1 && row.sufit === 3 && row.dostepne === 1 && row.werdykt === 'start' && dec?.launched === 1,
    'T5b werdykt zgodny z decyzją uderzenia (start)');
  const gs = src('../../scenes/GameScene.js');
  assert(/eskadra:\s*printSquadronNeeds\(window\.KOSMOS\)/.test(gs), 'T5c `KOSMOS.debug.sbTuning()` drukuje eskadrę');
}

// ═══ T6 — źródło ══════════════════════════════════════════════════════════════
header('T6  decyzje czytają klucze');
{
  const off = src('../../systems/director/DirectorOffensive.js');
  const req = off.slice(off.indexOf('  requiredSquadron(target, ready = []) {'), off.indexOf('  pickTarget(empireId) {'));
  assert(/squadronHpRatio\(\)/.test(req) && !/SQUADRON_HP_RATIO\s*\)/.test(req), 'T6a `requiredSquadron` mnoży przez klucz (`squadronHpRatio()`)');
  assert((off.match(/squadronMaxShips\(\)/g) ?? []).length >= 3, 'T6b sufit w wyborze celu i w uderzeniu z klucza (`squadronMaxShips()`)');
}

console.log(`\n═══ sb3_squadron_size_smoke: ${pass} PASS / ${fail} FAIL ═══`);
if (fail > 0) process.exit(1);
