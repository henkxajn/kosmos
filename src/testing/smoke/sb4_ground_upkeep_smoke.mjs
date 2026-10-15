// ═══════════════════════════════════════════════════════════════════════════════
// sb4_ground_upkeep_smoke — KEEPER Findingów 444 i 445 — żołd jednostek naziemnych (AI STRIKES BACK S4, sesja 3 — SB80).
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §6 (444, 445).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA:
//   • 444 — `ColonyManager._tickGroundUnitUpkeep` płacił kubłem ATOMOWYM: płatnik pokrywał cały kubeł albo nic — brak 1 Kr
//     wyłączał wszystkie jego jednostki (po 5 latach cywilizacyjnych — rozwiązanie `no_credits`). SB80 (a): płacimy tylu
//     jednostkom, ilu starcza kasy; nieopłacone naliczają zaległość KAŻDA z osobna. Kolejność opłacania (najtańsze
//     pierwsze, potem id jednostki) — wybór implementacji: przy tej samej kasie opłaca najwięcej jednostek.
//   • 445 — podwójne pobranie Kr: wołający odejmował kwotę ręcznie I emitował `trade:spendCredits`, którego subskrybent
//     (`CivilianTradeSystem.spendCredits`) odejmował ją drugi raz (zmierzone D3: 100 → 68 przy kuble 16). Ten sam wzór przy
//     rekrutacji (`startGroundUnitBuild`). Teraz jedno pobranie: zdarzenie `trade:spendCredits` (subskrybent odejmuje).
//
// ⚠ Harness: prawdziwy `GameCore` (z `CivilianTradeSystem`); żołd — `ColonyManager._tickGroundUnitUpkeep(1.0)` wprost.
//   Liczby właściciela („kasa 10, 4 jednostki po 4 Kr”) — tabela żołdu szturmu podmieniona w scenie na 4 Kr (przywracana);
//   kolejność opłacania — prawdziwa tabela (artyleria 10 Kr, szturm 2 Kr).
//
// PINY (fail-first na `88ea70a` — S4-11):
//   T1  445: kasa 100, kubeł 16 (4 × 4 Kr) — po roku 84 (jedno pobranie), wszystkie opłacone
//   T2  444: kasa 10, 4 jednostki po 4 Kr — 2 opłacone, 2 nieopłacone (`offline`, zaległość 1), kasa 2
//   T3  444: zaległość naliczana osobno — przy 10 Kr na rok te same 2 opłacone, 2 nieopłacone rozwiązane po 5 latach
//   T4  kolejność: kasa 10, artyleria (10 Kr) + 2 × szturm (2 Kr) — opłacone szturmy, artyleria nie; kasa 6
//   T5  445: rekrutacja szturmu (100 Kr) — kasa 1000 → 900 (jedno pobranie)
//   T6  KONTROLA (zielona po obu stronach): kasa pokrywa wszystko — wszystkie opłacone, bez zaległości
// ═══════════════════════════════════════════════════════════════════════════════

import { reseed } from '../headless/env.js';           // MUSI być pierwszy
import gameState from '../../core/GameState.js';
import { GameCore } from '../headless/GameCore.js';
import { ColonyManager } from '../../systems/ColonyManager.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');

function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
}
function boot() {
  reseed('kosmos-default');
  gameState.restore(null);
  const core = new GameCore();
  quiet(() => core.boot({ quiet: true, scenario: 'civilization' }));
  const K = window.KOSMOS;
  const cm = K.colonyManager;
  if (K.garrisonSystem) K.garrisonSystem.enabled = false;
  const home = cm.getColony(K.homePlanet.id);
  return { core, K, cm, gum: K.groundUnitManager, home };
}
/** Jednostka gracza z domem = stolica (płatnik). */
function unit(w, archetypeId = 'shock_infantry') {
  const u = w.gum.createUnit(archetypeId, w.home.planetId, 0, 0, { owner: 'player', factionId: 'humanity' });
  u.homeColonyId = w.home.planetId;
  return u;
}
const upkeep = (w, n = 1) => { for (let i = 0; i < n; i++) quiet(() => w.cm._tickGroundUnitUpkeep(1.0)); };
const paid = (u) => (u.unpaidYears ?? 0) === 0 && u.status !== 'offline';
/** Scena z żołdem szturmu podmienionym na `kr` (liczby właściciela); tabela przywracana. */
function withShockUpkeep(kr, fn) {
  const real = ColonyManager.GROUND_UNIT_UPKEEP.shock_infantry;
  ColonyManager.GROUND_UNIT_UPKEEP.shock_infantry = { energy: 0, credits: kr };
  try { return fn(); } finally { ColonyManager.GROUND_UNIT_UPKEEP.shock_infantry = real; }
}

// ═══ T1 — 445: jedno pobranie ═════════════════════════════════════════════════
header('T1  445 — jedno pobranie (kasa 100, kubeł 16)');
withShockUpkeep(4, () => {
  const w = boot();
  const us = [unit(w), unit(w), unit(w), unit(w)];
  w.home.credits = 100;
  upkeep(w);
  console.log(`     kasa 100 → ${w.home.credits} · opłacone ${us.filter(paid).length}/4`);
  assert(w.home.credits === 84 && us.every(paid), 'T1a po roku 84 (jedno pobranie kubła 16), wszystkie opłacone');
});

// ═══ T2 — 444: tylu, ilu starcza kasy ═════════════════════════════════════════
header('T2  444 — płacimy tylu, ilu starcza kasy (kasa 10, 4 × 4 Kr)');
withShockUpkeep(4, () => {
  const w = boot();
  const us = [unit(w), unit(w), unit(w), unit(w)];
  w.home.credits = 10;
  upkeep(w);
  const ok = us.filter(paid);
  const bad = us.filter(u => !paid(u));
  console.log(`     opłacone ${ok.map(u => u.id)} · nieopłacone ${bad.map(u => `${u.id}:${u.status}:${u.unpaidYears}`)} · kasa ${w.home.credits}`);
  assert(ok.length === 2 && bad.length === 2 && bad.every(u => u.status === 'offline' && u.unpaidYears === 1) && w.home.credits === 2,
    'T2a 2 opłacone, 2 nieopłacone (`offline`, zaległość 1), kasa 2');
});

// ═══ T3 — 444: zaległość osobno ═══════════════════════════════════════════════
header('T3  444 — zaległość naliczana osobno');
withShockUpkeep(4, () => {
  const w = boot();
  const us = [unit(w), unit(w), unit(w), unit(w)];
  for (let y = 0; y < ColonyManager.UPKEEP_GRACE_CIVYEARS; y++) { w.home.credits = 10; upkeep(w); }
  const alive = us.filter(u => !!w.gum.getUnit(u.id));
  console.log(`     po ${ColonyManager.UPKEEP_GRACE_CIVYEARS} latach: żyją ${alive.map(u => `${u.id}:${u.unpaidYears}`)}`);
  assert(alive.length === 2 && alive.every(paid) && JSON.stringify(alive.map(u => u.id)) === JSON.stringify(us.slice(0, 2).map(u => u.id)),
    'T3a te same 2 opłacane co roku (bez zaległości), 2 nieopłacone rozwiązane po 5 latach');
});

// ═══ T4 — kolejność opłacania ═════════════════════════════════════════════════
header('T4  kolejność: najtańsze pierwsze (prawdziwa tabela)');
{
  const w = boot();
  const art = unit(w, 'rocket_artillery');
  const s1 = unit(w), s2 = unit(w);
  w.home.credits = 10;
  upkeep(w);
  console.log(`     artyleria ${art.status}:${art.unpaidYears} · szturm ${s1.status}:${s1.unpaidYears}, ${s2.status}:${s2.unpaidYears} · kasa ${w.home.credits}`);
  assert(paid(s1) && paid(s2) && !paid(art) && w.home.credits === 6, 'T4a kasa 10: opłacone 2 szturmy (2 Kr), artyleria (10 Kr) nie; kasa 6');
}

// ═══ T5 — 445: rekrutacja ═════════════════════════════════════════════════════
header('T5  445 — rekrutacja: jedno pobranie');
{
  const w = boot();
  w.cm._getBarracksLevel = () => 1;
  w.cm._getBarracksSlots = () => 3;
  const cost = { ...(ColonyManager.GROUND_UNIT_BUILD_COSTS.shock_infantry ?? {}), ...(ColonyManager.GROUND_UNIT_COMMODITY_COSTS.shock_infantry ?? {}) };
  for (const [k, v] of Object.entries(cost)) w.home.resourceSystem.receive({ [k]: v });
  w.home.credits = 1000;
  const r = quiet(() => w.cm.startGroundUnitBuild(w.home.planetId, 'shock_infantry'));
  const kr = ColonyManager.GROUND_UNIT_CREDITS_BUILD.shock_infantry;
  console.log(`     rekrutacja ${JSON.stringify(r?.ok)} · koszt ${kr} · kasa 1000 → ${w.home.credits}`);
  assert(r?.ok === true && w.home.credits === 1000 - kr, `T5a kasa 1000 → ${1000 - kr} (jedno pobranie ${kr} Kr)`);
}

// ═══ T6 — kontrola ════════════════════════════════════════════════════════════
header('T6  KONTROLA: kasa pokrywa wszystko');
{
  const w = boot();
  const us = [unit(w), unit(w, 'garrison_unit')];
  w.home.credits = 10000;
  upkeep(w, 3);
  assert(us.every(paid), 'T6a wszystkie opłacone, bez zaległości (3 lata)');
}

console.log(`\n═══ sb4_ground_upkeep_smoke: ${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
