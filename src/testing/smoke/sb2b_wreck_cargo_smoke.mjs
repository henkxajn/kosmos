// ═══════════════════════════════════════════════════════════════════════════════
// sb2b_wreck_cargo_smoke — KEEPER Findingu 418 (AI STRIKES BACK, pre-S3, decyzja SB41)
// Rejestr: `docs/design/AI_STRIKES_BACK_PLAN.md` §6 (418).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: jednostki naziemne w ładowni ginęły ze statkiem wyłącznie w `VesselManager.destroyVessel`. Wrak tamtędy
//   nie przechodzi: `_turnIntoWreck` nie dotykał ładowni, `dropTroop` i tryb zrzutu nie pytały o wrak (S2, bramka:
//   wrak `v_35` z `gu_27`, `dropTroop` → `{ok: true}` przy dominacji gracza), a `_tickWreckCleanup` kasował wrak
//   z pominięciem `destroyVessel` — jednostki zostawały `in_cargo` bez statku na zawsze, ich POP zablokowane.
// SB41: jednostki w ładowni giną, gdy statek staje się wrakiem, z TYM SAMYM rozliczeniem co każda śmierć; `dropTroop`
//   odmawia wrakowi; otwarty tryb zrzutu nad wrakiem się zamyka.
//
// ⚠ Harness jak `g1c_pop_loss_smoke`: prawdziwy `GameCore` (ColonyManager, GroundUnitManager, kolonie AI z bootstrapu),
//   rekrutacja PRAWDZIWĄ ścieżką; wrak — PRAWDZIWY `EnemyAttackHandler._turnIntoWreck` (punkt w przestrzeni, jak DSCS).
// ⚠ `ColonyOverlay` nie importuje się pod node (`PlanetTextureUtils` → `THREE.TextureLoader`) ⇒ zamknięcie trybu zrzutu
//   pinowane ŹRÓDŁOWO (kod bez komentarzy, LF) — z kontrolą: istniejące mapowanie 406 jest widoczne tą samą metodą.
//
// PINY:
//   T1  wrak z jednostką GRACZA w ładowni: `groundUnit:destroyed` dokładnie raz (`transport_lost`), jednostka usunięta,
//       ładownia pusta; rozliczenie POP domu (blokada, populacja, kolejka zwrotów) = rozliczenie `destroyVessel`
//       (KONTROLA: ta sama jednostka zgubiona dotychczasową drogą w drugim, identycznym świecie)
//   T2  wrak z jednostką AI w ładowni (`createAIUnit`): jednostka usunięta, ładownia pusta (podstawa S3)
//   T3  `dropTroop` z wraku odmawia (`vessel_is_wreck`) także przy dominacji gracza; jednostka zostaje w ładowni;
//       KONTROLA — ten sam statek żywy: zrzut przechodzi
//   T4  zapis sprzed SB41: wrak z ładunkiem sprzątany po czasie życia — jednostka ginie (rozliczenie jak `destroyVessel`)
//   T5  tryb zrzutu: `ColonyOverlay` zamyka go na `vessel:wrecked` statku trybu i mapuje `vessel_is_wreck` na tekst;
//       klucze PL + EN istnieją (zero nowych); KONTROLA — mapowanie 406 widoczne tą samą metodą
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GameCore } from '../headless/GameCore.js';
import { ColonyManager } from '../../systems/ColonyManager.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import * as VS from '../../entities/Vessel.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));

function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
}
function boot() {
  const core = new GameCore();
  quiet(() => core.boot({ quiet: true, scenario: 'civilization' }));
  const K = window.KOSMOS;
  K.enemyAttackHandler = K.enemyAttackHandler ?? new EnemyAttackHandler();
  const cm = core.colonyManager;
  cm._getBarracksLevel = () => 1;
  cm._getBarracksSlots = () => 3;
  if (K.garrisonSystem) K.garrisonSystem.enabled = false;
  if (K.fleetPoolSystem) K.fleetPoolSystem.enabled = false;
  const home = cm.getColony(K.homePlanet.id);
  const ai = cm.getAllColonies().find(c => c.ownerEmpireId && !c.isOutpost);
  const w = { core, K, cm, gum: K.groundUnitManager, vm: K.vesselManager, home, ai, emp: ai.ownerEmpireId, destroyed: [] };
  EventBus.on('groundUnit:destroyed', (e) => w.destroyed.push(e));
  return w;
}
function recruit(w, colony, archetypeId = 'shock_infantry') {
  const cost = { ...(ColonyManager.GROUND_UNIT_BUILD_COSTS[archetypeId] ?? {}),
                 ...(ColonyManager.GROUND_UNIT_COMMODITY_COSTS[archetypeId] ?? {}) };
  colony.credits = Math.max(colony.credits ?? 0, 10000);
  for (const [k, v] of Object.entries(cost)) colony.resourceSystem.receive({ [k]: v });
  const before = new Set(w.gum._units.keys());
  const r = quiet(() => w.cm.startGroundUnitBuild(colony.planetId, archetypeId));
  if (!r?.ok) throw new Error(`rekrutacja ${archetypeId} odrzucona: ${JSON.stringify(r)}`);
  quiet(() => w.cm._tickGroundUnitBuilds(ColonyManager.GROUND_UNIT_BUILD_TIMES[archetypeId] ?? 5));
  const id = [...w.gum._units.keys()].find(k => !before.has(k));
  if (!id) throw new Error(`rekrutacja ${archetypeId}: jednostka nie powstała`);
  return w.gum.getUnit(id);
}
function transport(w, unit, { owner = null, pods = false } = {}) {
  const v = w.vm.createAndRegister('hull_small', owner ? w.ai.planetId : w.home.planetId);
  v.troopCapacity = 12; v.troopBayUsed = 0; v.groundUnits = [];
  if (pods) v.canDropTroops = true;
  if (owner) { v.ownerEmpireId = owner; v.owner = owner; v.isEnemy = true; }
  const ok = VS.loadGroundUnit(v, unit)?.ok === true;
  return { v, ok };
}
const lockOf = (c) => c?.civSystem?._lockedPerStrata?.laborer ?? 0;
const humansOf = (c) => c?.civSystem?.humans ?? NaN;
const pendingOf = (c) => (c?._pendingPopReturns ?? []).map(e => e.amount).reduce((a, b) => a + b, 0);
const wreck = (w, v) => quiet(() => w.K.enemyAttackHandler._turnIntoWreck(v, { x: v.position.x + 5, y: v.position.y }, w.K.timeSystem.gameTime));
/** Ciało niczyje w układzie domowym (zrzut bez bramki wojny; dominacja gracza w domu). */
function neutralBody(w) {
  const sys = EntityManager.get(w.home.planetId)?.systemId;
  return ['moon', 'planet', 'planetoid'].flatMap(tp => EntityManager.getByType(tp))
    .find(b => b.systemId === sys && b.id !== w.home.planetId && !w.cm.getColony(b.id)) ?? null;
}

// ═══ T1 — wrak z jednostką gracza ═════════════════════════════════════════════════
console.log('\nT1  wrak z jednostką GRACZA w ładowni — ginie, rozliczenie jak `destroyVessel`');
{
  // świat A — dotychczasowa droga (`destroyVessel`): wzorzec rozliczenia
  const a = boot();
  const ua = recruit(a, a.home);
  const { v: va, ok: okA } = transport(a, ua);
  const L0a = lockOf(a.home), H0a = humansOf(a.home), P0a = pendingOf(a.home);
  quiet(() => a.vm.destroyVessel(va.id));
  const refA = { dl: lockOf(a.home) - L0a, dh: humansOf(a.home) - H0a, dp: pendingOf(a.home) - P0a };

  // świat B — wrak
  const b = boot();
  const ub = recruit(b, b.home);
  const { v: vb, ok: okB } = transport(b, ub);
  const L0 = lockOf(b.home), H0 = humansOf(b.home), P0 = pendingOf(b.home);
  const n0 = b.destroyed.length;
  wreck(b, vb);
  const got = { dl: lockOf(b.home) - L0, dh: humansOf(b.home) - H0, dp: pendingOf(b.home) - P0 };
  const evs = b.destroyed.slice(n0).filter(e => e.unitId === ub.id);
  console.log(`     destroyVessel: blokada ${refA.dl.toFixed(3)}, populacja ${refA.dh.toFixed(3)}, kolejka ${refA.dp.toFixed(3)} · wrak: ${got.dl.toFixed(3)}, ${got.dh.toFixed(3)}, ${got.dp.toFixed(3)}`);
  assert(okA && okB && ua.popCost > 0 && ub.popCost > 0 && vb.isWreck === true,
    'T1-0 KONTROLA: jednostki gracza (koszt POP > 0) załadowane w obu światach, statek B jest wrakiem');
  assert(Math.abs(refA.dl) + Math.abs(refA.dh) + Math.abs(refA.dp) > 1e-6,
    'T1-0b KONTROLA: dotychczasowa droga (`destroyVessel`) rozlicza POP (wzorzec niejałowy)');
  assert(evs.length === 1 && evs[0].cause === 'transport_lost', 'T1a `groundUnit:destroyed` dokładnie raz, przyczyna `transport_lost`');
  assert(!b.gum.getUnit(ub.id) && (vb.groundUnits ?? []).length === 0 && (vb.troopBayUsed ?? 0) === 0,
    'T1b jednostka usunięta, ładownia wraku pusta');
  assert(near(got.dl, refA.dl) && near(got.dh, refA.dh) && near(got.dp, refA.dp),
    'T1c rozliczenie POP domu = rozliczenie `destroyVessel` (blokada, populacja, kolejka zwrotów)');
}

// ═══ T2 — wrak z jednostką AI ═════════════════════════════════════════════════════
console.log('\nT2  wrak z jednostką AI w ładowni (`createAIUnit`)');
{
  const w = boot();
  const spot = w.cm._findGroundUnitSpawn(w.ai);
  const r = w.gum.createAIUnit({ archetypeId: 'shock_infantry', empireId: w.emp, planetId: w.ai.planetId, q: spot.q, r: spot.r, morale: 50 });
  const u = r?.unit;
  const { v, ok } = transport(w, u, { owner: w.emp });
  wreck(w, v);
  assert(r?.ok && ok, 'T2-0 KONTROLA: jednostka AI utworzona i załadowana');
  assert(!w.gum.getUnit(u.id) && (v.groundUnits ?? []).length === 0, 'T2 jednostka AI zginęła z wrakiem, ładownia pusta');
}

// ═══ T3 — dropTroop z wraku ═══════════════════════════════════════════════════════
console.log('\nT3  `dropTroop` z wraku odmawia także przy dominacji');
{
  const w = boot();
  const nb = neutralBody(w);
  const dom = w.K.warSystem.hasOrbitalDominanceInSystem('player', nb?.systemId);
  // zapis sprzed SB41: wrak, który ZACHOWAŁ ładunek (bez zdarzenia `vessel:wrecked`)
  const u1 = recruit(w, w.home);
  const { v: v1 } = transport(w, u1, { pods: true });
  v1.isWreck = true; v1.status = 'destroyed';
  const res = VS.dropTroop(v1, u1, nb.id, 0, 0);
  // KONTROLA: ten sam układ, statek żywy
  const u2 = recruit(w, w.home);
  const { v: v2 } = transport(w, u2, { pods: true });
  const res2 = VS.dropTroop(v2, u2, nb.id, 0, 0);
  console.log(`     dominacja gracza: ${dom} · wrak: ${JSON.stringify(res)} · żywy: ${JSON.stringify(res2)}`);
  assert(!!nb && dom === true, 'T3-0 KONTROLA: ciało niczyje w domu, gracz ma dominację');
  assert(res?.ok === false && res.reason === VS.VESSEL_IS_WRECK && res.reason === 'vessel_is_wreck'
    && v1.groundUnits.includes(u1.id) && u1.status === 'in_cargo',
    'T3a wrak: odmowa `vessel_is_wreck`, jednostka zostaje w ładowni');
  assert(res2?.ok === true && !v2.groundUnits.includes(u2.id) && u2.planetId === nb.id, 'T3b KONTROLA: żywy statek zrzuca');
}

// ═══ T4 — zapis sprzed SB41: sprzątanie wraku z ładunkiem ══════════════════════════
console.log('\nT4  zapis sprzed SB41 — wrak z ładunkiem sprzątany po czasie życia');
{
  const a = boot();
  const ua = recruit(a, a.home);
  const { v: va } = transport(a, ua);
  const L0a = lockOf(a.home), P0a = pendingOf(a.home);
  quiet(() => a.vm.destroyVessel(va.id));
  const refA = { dl: lockOf(a.home) - L0a, dp: pendingOf(a.home) - P0a };

  const w = boot();
  const u = recruit(w, w.home);
  const { v } = transport(w, u);
  v.isWreck = true; v.status = 'destroyed'; v.wreckedAt = w.K.timeSystem.gameTime - 31;   // wrak z zapisu, ładunek żywy
  const L0 = lockOf(w.home), P0 = pendingOf(w.home);
  const n0 = w.destroyed.length;
  w.vm._tickWreckCleanup();
  const evs = w.destroyed.slice(n0).filter(e => e.unitId === u.id);
  assert(!w.vm.getVessel(v.id), 'T4-0 KONTROLA: wrak sprzątnięty po czasie życia');
  assert(evs.length === 1 && !w.gum.getUnit(u.id), 'T4a jednostka zginęła przy sprzątaniu (nie została `in_cargo` bez statku)');
  assert(near(lockOf(w.home) - L0, refA.dl) && near(pendingOf(w.home) - P0, refA.dp), 'T4b rozliczenie jak `destroyVessel`');
}

// ═══ T5 — tryb zrzutu w ColonyOverlay (źródło) ═════════════════════════════════════
console.log('\nT5  tryb zrzutu: zamknięcie na `vessel:wrecked` i tekst odmowy');
{
  const co = src('../../ui/ColonyOverlay.js');
  const sub = /EventBus\.on\('vessel:wrecked',[^\n]*this\._closeDropModeOnWreck\(/.test(co);
  const m = co.match(/\n  _closeDropModeOnWreck\(vesselId\) \{[\s\S]*?\n  \}/);
  const body = m?.[0] ?? '';
  assert(sub && /this\._dropMode/.test(body) && /this\._dropVesselId !== vesselId/.test(body)
    && /this\._finishDropMode\(t\('drop\.failed', t\('vessel\.reasonVesselIsWreck'\)\)\)/.test(body),
    'T5a `ColonyOverlay` zamyka tryb zrzutu na `vessel:wrecked` statku trybu, z tekstem „statek to wrak”');
  assert(/res\?\.reason === VESSEL_IS_WRECK\s*\?\s*t\('drop\.failed', t\('vessel\.reasonVesselIsWreck'\)\)/.test(co),
    'T5b klik trybu zrzutu: odmowa `vessel_is_wreck` → tekst, nie surowy slug');
  assert(/res\?\.reason === NO_ORBITAL_DOMINANCE\s*\?\s*t\('drop\.lostDominance'\)/.test(co),
    'T5-0 KONTROLA: istniejące mapowanie 406 widoczne tą samą metodą');
  const pl = readFileSync(new URL('../../i18n/pl.js', import.meta.url), 'utf8');
  const en = readFileSync(new URL('../../i18n/en.js', import.meta.url), 'utf8');
  assert(['"drop.failed"', "'vessel.reasonVesselIsWreck'"].every(k => pl.includes(k) && en.includes(k)),
    'T5c klucze `drop.failed` i `vessel.reasonVesselIsWreck` istnieją w PL i EN (zero nowych)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
