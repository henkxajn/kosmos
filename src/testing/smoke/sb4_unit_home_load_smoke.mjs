// ═══════════════════════════════════════════════════════════════════════════════
// sb4_unit_home_load_smoke — KEEPER Findingu 443 (i 342) — dom jednostki naziemnej przeżywa zapis i wczytanie
// (AI STRIKES BACK S4, sesja 3 — decyzja SB79, wariant a). Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §6 (443);
// `docs/design/AI_GARRISON_PLAN.md` §6 (342).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: `GroundUnitManager.serialize` zapisywał `homeColonyId ?? planetId`, a `restore` odtwarzał tak samo — jednostka
//   BEZ domu (więź zerwana przy utracie kolonii — 380, `debug.spawnMyUnit`) wracała z zapisu z domem = ciało, na którym stoi.
//   Płatnikiem żołdu jest dom należący do gracza, więc po wczytaniu płaciła kolonia ciała (zmierzone D3: zdobyte Propus c,
//   0 Kr → 8/8 rozwiązane `no_credits` 0,42 roku po wczytaniu), a przed wczytaniem — stolica gracza. SB79 (a): dom jednostki
//   przeżywa zapis i wczytanie (brak domu zostaje brakiem domu), płaci stolica właściciela jak przed wczytaniem. Zapisy
//   sprzed poprawki (v101 bez migracji) naprawiane przy wczytaniu: jednostka gracza BEZ więzi POP (`popCost` 0 przy
//   archetypie, który POP kosztuje) z domem = ciało, na którym stoi, traci ten dom (to ślad starego zapisu).
//
// ⚠ Harness: prawdziwy `GameCore`; zapis i wczytanie — `GroundUnitManager.serialize` → `restore` (ten sam proces);
//   żołd — `ColonyManager._tickGroundUnitUpkeep(1.0)`; płatnik — `_groundUnitPayerId`. Kolonia C gracza (8 POP, 0 Kr)
//   obok stolicy (1000 Kr).
//
// PINY (fail-first na `1625162` — S4-10):
//   T1  jednostka gracza bez domu (więź zerwana) na kolonii C: zapis → wczytanie — dom dalej `null`, płaci stolica
//   T2  zapis sprzed poprawki (dom = ciało, `popCost` 0, szturm): wczytanie — dom `null`, płaci stolica
//   T3  żołd po wczytaniu: 6 lat cywilizacyjnych — jednostka żyje, bez zaległości (płaci stolica; C ma 0 Kr)
//   T4  jednostka AI bez domu: zapis → wczytanie — dom dalej `null` (Finding 342)
//   T5  KONTROLE (zielone po obu stronach): jednostka z więzią POP (szturm z kolonii C) — dom C, płaci C; dron rozpoznawczy
//       z kolonii C (archetyp bez kosztu POP) — dom C; zapis bez pola `homeColonyId` (legacy) — dom = ciało
// ═══════════════════════════════════════════════════════════════════════════════

import { reseed } from '../headless/env.js';           // MUSI być pierwszy
import EntityManager from '../../core/EntityManager.js';
import gameState from '../../core/GameState.js';
import { GameCore } from '../headless/GameCore.js';

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
  const sys = EntityManager.get(home.planetId).systemId;
  const b = ['planet', 'moon'].flatMap(t => EntityManager.getByTypeInSystem(t, sys)).find(x => !cm.getColony(x.id));
  quiet(() => cm.createColony(b.id, {}, 8, 0));
  const C = cm.getColony(b.id);
  home.credits = 1000;
  C.credits = 0;
  const ai = cm.getAllColonies().find(c => c.ownerEmpireId && !c.isOutpost);
  return { core, K, cm, gum: K.groundUnitManager, home, C, ai };
}
/** Kafel jednostki — miejsce na ciele nie jest przedmiotem testu (świeża kolonia nie ma jeszcze siatki: (0,0)). */
const tileOf = (colony) => colony.grid?.toArray?.().find(t => !t.capitalBase) ?? { q: 0, r: 0 };
/** Zapis i wczytanie jednostek naziemnych (ten sam proces); zwraca jednostkę o tym id po wczytaniu. */
function saveLoad(w, id, mutate = null) {
  const data = JSON.parse(JSON.stringify(w.gum.serialize()));
  if (mutate) mutate(data.units.find(u => u.id === id), data);
  quiet(() => w.gum.restore(data));
  return w.gum.getUnit(id);
}
/** Jednostka gracza bez więzi POP (stan po zerwaniu więzi — 380): `popCost` 0, dom `null`. */
function unbound(w, archetypeId = 'shock_infantry') {
  const t = tileOf(w.C);
  const u = w.gum.createUnit(archetypeId, w.C.planetId, t.q, t.r, { owner: 'player', factionId: 'humanity' });
  u.popCost = 0;
  u.homeColonyId = null;
  return u;
}

// ═══ T1 — dom bez zmian po wczytaniu ══════════════════════════════════════════
header('T1  jednostka gracza bez domu: zapis → wczytanie');
{
  const w = boot();
  const u0 = unbound(w);
  const payer0 = w.cm._groundUnitPayerId(u0);
  const u = saveLoad(w, u0.id);
  const payer = w.cm._groundUnitPayerId(u);
  console.log(`     przed: dom ${u0.homeColonyId} · płatnik ${payer0} · po: dom ${u?.homeColonyId} · płatnik ${payer} (stolica ${w.home.planetId}, C ${w.C.planetId})`);
  assert(payer0 === w.home.planetId, 'T1a KONTROLA: przed wczytaniem płaci stolica gracza');
  assert(u && u.homeColonyId === null && payer === w.home.planetId, 'T1b po wczytaniu dom dalej `null`, płaci stolica (nie kolonia C, na której stoi)');
}

// ═══ T2 — naprawa zapisu sprzed poprawki ══════════════════════════════════════
header('T2  zapis sprzed poprawki (dom = ciało)');
{
  const w = boot();
  const u0 = unbound(w);
  const u = saveLoad(w, u0.id, (rec) => { rec.homeColonyId = rec.planetId; });
  const payer = w.cm._groundUnitPayerId(u);
  console.log(`     po wczytaniu: dom ${u?.homeColonyId} · płatnik ${payer}`);
  assert(u && u.homeColonyId === null && payer === w.home.planetId, 'T2a jednostka bez więzi POP z domem = ciało — dom `null`, płaci stolica');
}

// ═══ T3 — żołd po wczytaniu ═══════════════════════════════════════════════════
header('T3  żołd po wczytaniu');
{
  const w = boot();
  const u0 = unbound(w);
  const u = saveLoad(w, u0.id);
  for (let i = 0; i < 6; i++) quiet(() => w.cm._tickGroundUnitUpkeep(1.0));
  const alive = !!w.gum.getUnit(u0.id);
  console.log(`     po 6 civY: żyje ${alive} · zaległość ${w.gum.getUnit(u0.id)?.unpaidYears} · Kr stolicy ${w.home.credits} · Kr C ${w.C.credits}`);
  assert(alive && u.unpaidYears === 0 && u.status !== 'offline', 'T3a 6 lat cywilizacyjnych — żyje, bez zaległości (płaci stolica, C ma 0 Kr)');
}

// ═══ T4 — jednostka AI bez domu (342) ═════════════════════════════════════════
header('T4  jednostka AI bez domu (Finding 342)');
{
  const w = boot();
  const t = tileOf(w.C);
  const r = w.gum.createAIUnit({ archetypeId: 'shock_infantry', empireId: w.ai.ownerEmpireId, planetId: w.C.planetId, q: t.q, r: t.r, morale: 50 });
  const u = r?.ok ? saveLoad(w, r.unit.id) : null;
  console.log(`     przed: dom ${r?.unit?.homeColonyId} · po: dom ${u?.homeColonyId}`);
  assert(r?.ok && r.unit.homeColonyId === null && u && u.homeColonyId === null, 'T4a dom `null` przeżywa zapis i wczytanie');
}

// ═══ T5 — kontrole ════════════════════════════════════════════════════════════
header('T5  KONTROLE');
{
  const w = boot();
  const t = tileOf(w.C);
  const u0 = w.gum.createUnit('shock_infantry', w.C.planetId, t.q, t.r, { owner: 'player', factionId: 'humanity' });
  u0.popCost = 0.6;
  u0.homeColonyId = w.C.planetId;
  const u = saveLoad(w, u0.id);
  assert(u?.homeColonyId === w.C.planetId && w.cm._groundUnitPayerId(u) === w.C.planetId,
    'T5a KONTROLA: jednostka z więzią POP z kolonii C — dom C, płaci C');
}
{
  const w = boot();
  const t = tileOf(w.C);
  const u0 = w.gum.createUnit('recon_drone', w.C.planetId, t.q, t.r, { owner: 'player', factionId: 'humanity' });
  u0.popCost = 0;
  u0.homeColonyId = w.C.planetId;
  const u = saveLoad(w, u0.id);
  assert(u?.homeColonyId === w.C.planetId, 'T5b KONTROLA: dron rozpoznawczy z kolonii C (archetyp bez kosztu POP) — dom C');
}
{
  const w = boot();
  const t = tileOf(w.C);
  const u0 = w.gum.createUnit('shock_infantry', w.C.planetId, t.q, t.r, { owner: 'player', factionId: 'humanity' });
  u0.popCost = 0.6;
  u0.homeColonyId = w.C.planetId;
  const u = saveLoad(w, u0.id, (rec) => { delete rec.homeColonyId; });
  assert(u?.homeColonyId === w.C.planetId, 'T5c KONTROLA: zapis bez pola `homeColonyId` (legacy) — dom = ciało');
}

console.log(`\n═══ sb4_unit_home_load_smoke: ${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
