// AI STRIKES BACK S1 (sesja 2) — keeper PULI okrętów imperium AI (SB1, SB2, SB14 zm. SB21, SB18, SB20, SB22).
// Plan: `docs/design/AI_STRIKES_BACK_PLAN.md` §2 (SB1–SB25).
//
//   T1  tabela: wzorzec D, E, E, E (SB20) i minimum 2 kadłubów z bakiem (SB21); KAŻDY klucz tabeli ma konsumenta
//       w `src/` (KONTROLA detektora: klucz zmyślony — bez konsumenta)
//   T2  walidacja: wzorzec tylko ze ZNANYCH i UZBROJONYCH szablonów (odmowa z listą szablonów, stan bez zmian),
//       minimum z zakresem; zapis z błędnym wzorcem — pominięty przy wczytaniu, poprawna wartość obok zostaje
//   T3  cechy szablonów „wszystko zbadane” (SB22): D bez baku, E z bakiem, sonda i transportowiec nieuzbrojone;
//       dla KAŻDEGO archetypu wzorzec rozwiązuje się na `hull_frigate` (nie `hull_small` — ścieżka kuriera nietknięta)
//   T4  plan — przypadki właściciela: limit 2 / 0 → D, E · 6 / 0 → D, E, E, E, D, E · 6 / 6 D → +2 E ponad limit ·
//       6 / 3 D → +3 E; dodatkowe: minimum ponad limitem przy pełnym limicie, limit wypełniony, wzorzec bez baku
//   T5  `VesselManager.createAIVessel` — JEDYNE wejście: przy stolicy, w doku, w służbie, załoga 0, stempel i pochodzenie
//       PRZED `vessel:created`; adnotacja zamówienia stoczni NIE zdjęta (Finding 395 — KONTROLA: ścieżka stoczni ją
//       zdejmuje); bez POP i bez utrzymania (KONTROLA: kadłub gracza podnosi utrzymanie); odmowy bez tworzenia
//   T6  mobilizacja: wojna → pula raz (flaga), trzy wejścia (`war_declared` / `reconcile_at_war` / `reconcile_yearly`),
//       bez stolicy i pod reparacjami — nic i bez flagi (nie-jałowość: po usunięciu przeszkody — pula); pokój — nic;
//       `isAtWar` = lustro garnizonu
//   T7  zapis → wczytanie: flaga `empires.<id>.fleetPool` i `origin: 'pool'` przeżywają (v101, bez migracji)
//   T8  powiadomienie: istniejące `_handleMobilized` (bramka `contact`, liczba = utworzone), bez nowych kluczy
//   T9  odczyt konsoli: z bakiem, pula tak/nie, co pula dołoży teraz
//   T10 wpięcie: GameScene + lokator, parytet GameCore, audyt w `TRACKED_EVENTS`, jedno wejście tworzenia
//
// ⚠ Fail-first: moduły puli powstają w tym slice — import przestrzeni nazw / dynamiczny w try/catch i wywołania przez
//   pomocnika, żeby na kodzie sprzed puli piny DEGRADOWAŁY (czerwone), a nie przerywały suitę.
// ⚠ Każdy pin wykluczający ma świadka w tym samym asercie; KONTROLA = zielona po OBU stronach.
// ⚠ Świat: `bootWithDirector` (prawdziwa dyplomacja i Director); dwa imperia AI, stolice przy starcie POP 24 → limit 2.

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import debugLog from '../../core/DebugLog.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import * as VS from '../../entities/Vessel.js';
import { SHIP_TEMPLATES } from '../../data/ShipTemplateData.js';
import { ARCHETYPES } from '../../data/EmpireData.js';
import { NotificationCenter } from '../../systems/NotificationCenter.js';
import { VesselManager } from '../../systems/VesselManager.js';
import { t } from '../../i18n/i18n.js';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const DATA = await import('../../data/StrikesBackData.js').catch(() => null);
const TUN  = await import('../../utils/StrikesBackTuning.js').catch(() => null);
const tun  = (name, ...args) => (typeof TUN?.[name] === 'function' ? TUN[name](...args) : undefined);
const PL   = await import('../../utils/FleetPoolPlanner.js').catch(() => null);
const pl   = (name, ...args) => (typeof PL?.[name] === 'function' ? PL[name](...args) : undefined);
const FL   = await import('../../utils/FleetLimit.js').catch(() => null);
const fl   = (name, ...args) => (typeof FL?.[name] === 'function' ? FL[name](...args) : undefined);

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC  = path.resolve(here, '../..');
const read = (r) => (existsSync(path.join(SRC, r)) ? readFileSync(path.join(SRC, r), 'utf8').replace(/\r\n/g, '\n') : '');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
const srcFiles = () => {
  const out = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) { if (!p.includes(`${path.sep}testing`)) walk(p); } else if (/\.(m?js)$/.test(n)) out.push(p); } };
  walk(SRC);
  return out;
};
const rel = (f) => path.relative(SRC, f).replace(/\\/g, '/');

const D = 'frigate_system_defender', E = 'frigate_missile_escort', L = 'frigate_laser_escort';
const quiet = (fn) => { const l = console.log, w = console.warn, tb = console.table; console.log = () => {}; console.warn = () => {}; console.table = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; console.table = tb; } };
const boot = () => { const { core, K, ticker } = quiet(() => bootWithDirector({ quiet: true })); return { core, K, ticker, vm: core.vesselManager, emps: K.empireRegistry.listIds() }; };
const run = (w, civY) => quiet(() => w.ticker.run(civY, { tickSize: 1.0 }));
const declare = (K, emp) => quiet(() => K.diplomacySystem.declareWar(emp, 'keeper_setup'));
const fps = (K) => K.fleetPoolSystem ?? null;
const flagOf = (K, emp) => K.empireRegistry.get(emp)?.fleetPool ?? null;
const armedOf = (w, emp) => w.vm.getAllVessels().filter((v) => !v.isWreck && (v.ownerEmpireId ?? v.owner) === emp && VS.hasWeapons(v));
const capOf = (K, emp) => K.directorProduction.capitalOf(emp)?.planetId ?? null;

// ── T1 — tabela: klucze puli, konsumenci ───────────────────────────────────────────────────────
console.log('\nT1 — tabela strojenia: wzorzec i minimum z bakiem; każdy klucz ma konsumenta');
{
  const T = DATA?.SB_TUNING ?? {};
  assert(same(T.fleetPoolPattern?.default, [D, E, E, E]) && T.fleetPoolPattern?.type === 'templateList',
    `T1a: SB20 — wzorzec domyślny D, E, E, E (${JSON.stringify(T.fleetPoolPattern?.default)})`);
  assert(T.fleetMinWarpHulls?.default === 2 && T.fleetMinWarpHulls?.type === 'int',
    `T1b: SB21 — minimum kadłubów z bakiem 2 (${T.fleetMinWarpHulls?.default})`);
  const files = srcFiles().filter((f) => !/StrikesBackData\.js$|StrikesBackTuning\.js$/.test(f));
  const texts = files.map((f) => [rel(f), stripComments(readFileSync(f, 'utf8'))]);
  const consumers = (key) => texts.filter(([, s]) => new RegExp(`\\b${key}\\b`).test(s)).map(([r]) => r);
  const keys = Object.keys(T);
  const orphan = keys.filter((k) => consumers(k).length === 0);
  assert(keys.length >= 5 && orphan.length === 0,
    `T1c: każdy klucz tabeli ma konsumenta w src/ (${keys.length} kluczy; bez konsumenta: ${orphan.join(', ') || 'brak'})`);
  assert(consumers('fleetNoSuchKnobForKeeper').length === 0 && consumers('fleetPopPerHull').length > 0,
    'T1d (KONTROLA detektora): klucz zmyślony — bez konsumenta; klucz S1-1 — z konsumentem');
}

// ── T2 — walidacja ─────────────────────────────────────────────────────────────────────────────
console.log('\nT2 — walidacja wzorca i minimum; odmowy niczego nie zmieniają');
{
  boot();
  const stateOf = () => JSON.stringify(gameState.get('strikesBackTuning') ?? null);
  assert(same(pl('armedTemplateIds'), [L, E, D]),
    `T2a: wzorzec przyjmuje wyłącznie uzbrojone szablony katalogu (${JSON.stringify(pl('armedTemplateIds'))})`);
  assert(!!SHIP_TEMPLATES.science_probe && !!SHIP_TEMPLATES.transport_assault,
    'T2b (KONTROLA): katalog ma też szablony NIEuzbrojone (sonda, transportowiec) — jest co odrzucić');
  tun('setTuning', 'fleetPopPerHull', 40);                      // stan niedomyślny — odmowa ma czego NIE zmienić
  const cases = [
    ['fleetPoolPattern', D, 'wrong_type'],
    ['fleetPoolPattern', [], 'wrong_type'],
    ['fleetPoolPattern', Array(25).fill(D), 'wrong_type'],
    ['fleetPoolPattern', [D, 1], 'wrong_type'],
    ['fleetPoolPattern', ['bogus'], 'unknown_template'],
    ['fleetPoolPattern', [D, 'science_probe'], 'unknown_template'],
    ['fleetPoolPattern', ['transport_assault'], 'unknown_template'],
    ['fleetMinWarpHulls', -1, 'out_of_range'],
    ['fleetMinWarpHulls', 101, 'out_of_range'],
    ['fleetMinWarpHulls', '2', 'wrong_type'],
    ['fleetMinWarpHulls', 2.5, 'wrong_type'],
  ];
  for (const [key, value, reason] of cases) {
    const before = stateOf();
    const r = tun('setTuning', key, value);
    const line = r ? (TUN?.describeRefusal?.(r) ?? '') : '';
    const named = reason === 'unknown_template' ? [L, E, D].every((x) => line.includes(x)) : line.includes(key);
    assert(r?.ok === false && r.reason === reason && named && stateOf() === before,
      `T2c: sbSet(${key}, ${JSON.stringify(value).slice(0, 40)}) → ${reason}; „${line.slice(0, 110)}”; stan bez zmian`);
  }
  const ok = tun('setTuning', 'fleetPoolPattern', [L, D]);
  const ok2 = tun('setTuning', 'fleetMinWarpHulls', 0);
  assert(ok?.ok === true && same(tun('getTuning', 'fleetPoolPattern'), [L, D]) && ok2?.ok === true && tun('getTuning', 'fleetMinWarpHulls') === 0,
    'T2d (nie-jałowość odmów): poprawny wzorzec i minimum 0 tuż po odmowach są przyjęte');
  gameState.restore({ strikesBackTuning: { fleetPoolPattern: [D, 'science_probe'], fleetMinWarpHulls: 4 } });
  const san = tun('sanitizeTuningAfterRestore');
  assert(same(san?.ignored, [{ key: 'fleetPoolPattern', reason: 'invalid_value' }]) && tun('getTuning', 'fleetMinWarpHulls') === 4
    && same(tun('getTuning', 'fleetPoolPattern'), [D, E, E, E]),
    `T2e: zapis z nieuzbrojonym szablonem we wzorcu — wzorzec pominięty (domyślny), minimum 4 zostaje (${JSON.stringify(san?.ignored)})`);
  tun('resetTuning');
}

// ── T3 — cechy szablonów „wszystko zbadane” ────────────────────────────────────────────────────
console.log('\nT3 — cechy szablonów (SB22)');
{
  const tr = (id, arch = null) => pl('templateTraits', id, arch) ?? {};
  assert(tr(D).armed === true && tr(D).warp === false && tr(D).hullId === 'hull_frigate',
    `T3a: ${D} — uzbrojony, BEZ baku, hull_frigate (${JSON.stringify({ a: tr(D).armed, w: tr(D).warp, h: tr(D).hullId })})`);
  assert(tr(E).armed === true && tr(E).warp === true && tr(L).armed === true && tr(L).warp === true,
    'T3b: obie eskorty — uzbrojone, z bakiem warp');
  assert(tr('science_probe').ok === true && tr('science_probe').armed === false && tr('transport_assault').armed === false
    && tr('transport_assault').warp === true, 'T3c: sonda i transportowiec — nieuzbrojone (transportowiec ma bak)');
  const bad = [];
  for (const arch of Object.keys(ARCHETYPES)) {
    for (const id of [D, E]) {
      const x = tr(id, arch);
      if (x.hullId !== 'hull_frigate' || x.warp !== (id === E) || x.armed !== true) bad.push(`${arch}/${id}:${x.hullId}`);
    }
  }
  assert(Object.keys(ARCHETYPES).length >= 7 && PL && bad.length === 0,
    `T3d: każdy z ${Object.keys(ARCHETYPES).length} archetypów — D i E na hull_frigate, klasy bez zmian (odstępstwa: ${bad.join(', ') || 'brak'})`);
}

// ── T4 — plan: przypadki właściciela ───────────────────────────────────────────────────────────
console.log('\nT4 — plan puli (przypadki właściciela)');
{
  const P = [D, E, E, E];
  const plan = (limit, warpHulls, noWarpHulls, pattern = P, minWarp = 2) => pl('planPool', { limit, pattern, minWarp, warpHulls, noWarpHulls })?.add ?? null;
  assert(same(plan(2, 0, 0), [D, E]), `T4a: limit 2, 0 kadłubów → D, E (${JSON.stringify(plan(2, 0, 0))})`);
  assert(same(plan(6, 0, 0), [D, E, E, E, D, E]), `T4b: limit 6, 0 → D, E, E, E, D, E (${JSON.stringify(plan(6, 0, 0))})`);
  assert(same(plan(6, 0, 6), [E, E]), `T4c: limit 6, 6 defenderów → +2 eskorty PONAD limit (${JSON.stringify(plan(6, 0, 6))})`);
  assert(same(plan(6, 0, 3), [E, E, E]), `T4d: limit 6, 3 defendery → +3 eskorty (${JSON.stringify(plan(6, 0, 3))})`);
  assert(same(plan(2, 1, 1), [E]) && same(plan(6, 6, 0), []) && same(plan(6, 2, 4), []) && same(plan(6, 1, 5), [E]),
    'T4e: minimum ponad pełnym limitem (2: D+E → +E; 6: 1 E + 5 D → +E); limit pełny i minimum spełnione → nic');
  const noTank = pl('planPool', { limit: 2, pattern: [D], minWarp: 2, warpHulls: 0, noWarpHulls: 2 });
  assert(same(noTank?.add, []) && noTank?.missingWarpTemplate === 2 && noTank?.tankTemplate === null,
    `T4f: wzorzec bez szablonu z bakiem — brakujących nie ma z czego dołożyć (brak ${noTank?.missingWarpTemplate})`);
  const naive = (limit, w, n) => [D, E, E, E, D, E].slice(0, limit).slice(w + n);   // „tylko do limitu”
  assert(!same(naive(6, 0, 6), [E, E]) && !same(naive(6, 0, 3), [E, E, E]),
    'T4g (KONTROLA dyskryminacji): reguła „tylko do limitu” dałaby inne wyniki w T4c i T4d');
}

// ── T5 — jedyne wejście tworzenia kadłuba puli ─────────────────────────────────────────────────
console.log('\nT5 — VesselManager.createAIVessel');
{
  const w = boot();
  const emp = w.emps[0];
  const cap = capOf(w.K, emp);
  const capBody = w.K.entityManager.get(cap);
  const capCol = w.core.colonyManager.getColony(cap);
  const make = (spec) => (typeof w.vm.createAIVessel === 'function' ? quiet(() => w.vm.createAIVessel(spec)) : undefined);
  // świadek: adnotacja zamówienia w kolejce stoczni stolicy (oba nasłuchujące `DirectorProduction`)
  const dps = [w.core.directorProduction, w.K.directorProduction].filter(Boolean);
  for (const dp of dps) dp._awaitingClaim.set(cap, [{ empireId: emp, templateId: L, openedYear: 0 }]);
  const seen = [];
  const onCreated = ({ vessel }) => seen.push({ id: vessel.id, owner: vessel.ownerEmpireId, origin: vessel.origin });
  EventBus.on('vessel:created', onCreated);
  const pop0 = capCol.civSystem.population, locked0 = JSON.stringify(capCol.civSystem._lockedPerStrata ?? null);
  const up0 = w.vm.getTotalFleetUpkeep();
  const n0 = w.vm.getAllVessels().length;
  const rE = make({ templateId: E, empireId: emp, planetId: cap });
  const v = rE?.vessel;
  assert(rE?.ok === true && v?.position?.state === 'docked' && v.position.dockedAt === cap && v.systemId === capBody?.systemId
    && v.serviceState === 'active' && (v.crewLocked ?? 0) === 0 && v.ownerEmpireId === emp && v.owner === emp && v.isEnemy === true,
    `T5a: eskorta przy stolicy ${cap} (${capBody?.systemId}), w doku, w służbie, załoga 0, stempel imperium`);
  assert(v?.origin === 'pool' && v?.directorOrigin === E && VS.isFleetLimitHull(v, emp) && v?.warpFuel?.max === 5 && v?.warpFuel?.current === 0
    && v?.fuel?.current === v?.fuel?.max && capCol.fleet.includes(v?.id),
    'T5b: pochodzenie „pool”, adnotacja = szablon; liczy się do limitu; bak warp 5 (pusty), paliwo pełne; w `colony.fleet` stolicy');
  assert(seen.length === 1 && seen[0].owner === emp && seen[0].origin === 'pool',
    `T5c: jedno vessel:created — ze stemplem właściciela i pochodzenia W CHWILI zdarzenia (${JSON.stringify(seen)})`);
  assert(v && dps.length === 2 && dps.every((dp) => dp._awaitingClaim.get(cap)?.length === 1),
    'T5d: Finding 395 — adnotacja zamówienia stoczni stolicy NIE zdjęta przez kadłub puli (obie instancje); świadek: kadłub powstał');
  const prod = quiet(() => w.vm.createAndRegister('hull_frigate', cap, { modules: ['engine_ion', 'weapon_kinetic'] }));
  assert(prod?.ownerEmpireId === emp && dps.some((dp) => !dp._awaitingClaim.has(cap)),
    'T5e (KONTROLA mechanizmu): kadłub ścieżką stoczni (`createAndRegister`) adnotację zdejmuje — kolejka jest żywa');
  assert(v && capCol.civSystem.population === pop0 && JSON.stringify(capCol.civSystem._lockedPerStrata ?? null) === locked0
    && w.vm.getTotalFleetUpkeep() === up0,
    'T5f: bez POP (populacja i blokady stolicy bez zmian) i bez utrzymania; świadek: kadłub puli powstał');
  const pv = VS.createVessel('hull_frigate', w.K.homePlanet.id, { modules: ['engine_ion', 'weapon_kinetic'] });
  w.vm._vessels.set(pv.id, pv);
  assert(w.vm.getTotalFleetUpkeep() > up0, 'T5g (KONTROLA): kadłub GRACZA podnosi utrzymanie floty — miara żywa');
  w.vm._vessels.delete(pv.id);
  const nOk = w.vm.getAllVessels().length;
  const refusals = [
    ['player', { templateId: E, empireId: 'player', planetId: cap }, 'not_ai_empire'],
    ['nieznane imperium', { templateId: E, empireId: 'emp_404', planetId: cap }, 'unknown_empire'],
    ['dom gracza', { templateId: E, empireId: emp, planetId: w.K.homePlanet.id }, 'not_own_body'],
    ['szablon', { templateId: 'bogus', empireId: emp, planetId: cap }, 'unknown_template'],
  ].map(([lbl, spec, reason]) => { const r = make(spec); return { lbl, ok: r?.ok === false && r.reason === reason, got: r?.reason }; });
  assert(refusals.every((r) => r.ok) && w.vm.getAllVessels().length === nOk && nOk === n0 + 2,
    `T5h: odmowy bez tworzenia (${refusals.map((r) => `${r.lbl}:${r.got}`).join(' · ')}); świadek: poprawne wywołanie utworzyło kadłub`);
  EventBus.off('vessel:created', onCreated);
}

// ── T6 — mobilizacja: trzy wejścia, raz, bez stolicy, reparacje, pokój ──────────────────────────
console.log('\nT6 — mobilizacja puli');
{
  // (a) wojna wypowiedziana
  const w = boot();
  const [e1, e2] = w.emps;
  assert(armedOf(w, e1).length === 0 && armedOf(w, e2).length === 0 && !flagOf(w.K, e1),
    'T6a (świadek): przy starcie żadne imperium nie ma uzbrojonego kadłuba ani flagi puli');
  declare(w.K, e1);
  const f1 = flagOf(w.K, e1);
  const hulls1 = armedOf(w, e1);
  assert(f1?.mobilized === true && f1.reason === 'war_declared' && f1.created === 2 && f1.limit === 2 && f1.planned === 2
    && f1.armedBefore === 0 && f1.regrowthYear === Math.floor(w.K.timeSystem.gameTime + 1e-9),
    `T6b: wojna → flaga puli (${JSON.stringify(f1)})`);
  assert(same(hulls1.map((v) => v.directorOrigin), [D, E]) && hulls1.every((v) => v.origin === 'pool' && v.serviceState === 'active'
    && v.position.state === 'docked' && v.position.dockedAt === capOf(w.K, e1)) && !flagOf(w.K, e2) && armedOf(w, e2).length === 0,
    `T6c: pula D, E w doku stolicy, w służbie; drugie imperium (bez wojny) — nic (${hulls1.map((v) => v.directorOrigin).join(', ')})`);
  const logged = debugLog.query({ kind: 'fleetPool:mobilized', empireId: e1 });
  assert(logged.length === 1 && hulls1.length === 2 && same(logged[0].data?.vesselIds, hulls1.map((v) => v.id)),
    'T6d: jeden wpis audytu fleetPool:mobilized z id kadłubów');
  const again = quiet(() => fps(w.K)?.mobilizeEmpire(e1, 'war_declared'));
  assert(again?.ok === false && again.reason === 'already_mobilized' && armedOf(w, e1).length === 2
    && debugLog.query({ kind: 'fleetPool:mobilizeSkipped', empireId: e1 }).some((x) => x.data?.reason === 'already_mobilized'),
    'T6e: druga mobilizacja — odmowa already_mobilized, nic nowego, ślad audytu');
  // (b) bez stolicy — nic i bez flagi; nie-jałowość: ze stolicą — pula
  const orig = w.K.directorProduction.capitalOf.bind(w.K.directorProduction);
  w.K.directorProduction.capitalOf = (id) => (id === e2 ? null : orig(id));
  declare(w.K, e2);
  const noCap = !flagOf(w.K, e2) && armedOf(w, e2).length === 0
    && debugLog.query({ kind: 'fleetPool:mobilizeSkipped', empireId: e2 }).some((x) => x.data?.reason === 'no_capital');
  w.K.directorProduction.capitalOf = orig;
  const withCap = quiet(() => fps(w.K)?.mobilizeEmpire(e2, 'reconcile_yearly'));
  assert(noCap && withCap?.ok === true && flagOf(w.K, e2)?.created === 2,
    'T6f: bez stolicy — nic i bez flagi (no_capital); świadek: ze stolicą ta sama mobilizacja tworzy pulę');
  // (c) reparacje — nic i bez flagi
  const w2 = boot();
  const [r1] = w2.emps;
  w2.K.diplomacySystem.relations.setReparationsUntilYear('player', r1, w2.K.timeSystem.gameTime + 10, 'keeper');
  declare(w2.K, r1);
  const blocked = !flagOf(w2.K, r1) && armedOf(w2, r1).length === 0
    && debugLog.query({ kind: 'fleetPool:mobilizeSkipped', empireId: r1 }).some((x) => x.data?.reason === 'reparations');
  w2.K.diplomacySystem.relations.setReparationsUntilYear('player', r1, null, 'keeper');
  const afterRep = quiet(() => fps(w2.K)?.mobilizeEmpire(r1, 'reconcile_yearly'));
  assert(blocked && afterRep?.ok === true && armedOf(w2, r1).length === 2,
    'T6g: pod reparacjami — nic i bez flagi (reparations); świadek: po ich końcu pula powstaje');
  // (d) pierwszy tick: wojna bez zdarzenia → reconcile_at_war
  const w3 = boot();
  const [a1] = w3.emps;
  w3.K.diplomacySystem.relations.setStatus('player', a1, 'war', {}, 'keeper_no_event');
  const pre = flagOf(w3.K, a1);
  run(w3, 1);
  assert(!pre && flagOf(w3.K, a1)?.reason === 'reconcile_at_war' && armedOf(w3, a1).length === 2,
    `T6h: zapis „w wojnie” bez zdarzenia — pula na PIERWSZYM ticku (${flagOf(w3.K, a1)?.reason}); świadek: przed tickiem bez flagi`);
  // (e) granica roku: wojna bez zdarzenia po pierwszym ticku → reconcile_yearly
  const w4 = boot();
  const [b1] = w4.emps;
  run(w4, 1);
  w4.K.diplomacySystem.relations.setStatus('player', b1, 'war', {}, 'keeper_no_event');
  run(w4, 10);
  const mid = flagOf(w4.K, b1);
  run(w4, 1);
  assert(!mid && flagOf(w4.K, b1)?.reason === 'reconcile_yearly' && armedOf(w4, b1).length === 2,
    `T6i: wojna bez zdarzenia w trakcie roku — pula na granicy roku (${flagOf(w4.K, b1)?.reason}); świadek: rok przed granicą bez flagi`);
  // (f) pokój — nic
  const w5 = boot();
  run(w5, 24);
  assert(w5.emps.every((e) => !flagOf(w5.K, e) && armedOf(w5, e).length === 0) && typeof fps(w5.K)?.mobilizeEmpire === 'function',
    'T6j: 2 lata pokoju — żadnej puli, żadnego kadłuba; świadek: system puli zamontowany');
  // (g) isAtWar — lustro garnizonu (żywy świat w5: pokój, potem wojna z pierwszym imperium)
  const pairs = [];
  for (const e of w5.emps) pairs.push([fps(w5.K)?.isAtWar?.(e), w5.K.garrisonSystem.isAtWar(e)]);
  declare(w5.K, w5.emps[0]);
  for (const e of w5.emps) pairs.push([fps(w5.K)?.isAtWar?.(e), w5.K.garrisonSystem.isAtWar(e)]);
  assert(pairs.length === 4 && pairs.every(([a, b]) => a === b) && pairs.some(([a]) => a === true) && pairs.some(([a]) => a === false),
    `T6k: isAtWar puli = isAtWar garnizonu w pokoju i w wojnie (${JSON.stringify(pairs)})`);
  // (h) wyłącznik keeperów
  const w6 = boot();
  if (fps(w6.K)) fps(w6.K).enabled = false;
  declare(w6.K, w6.emps[0]);
  assert(fps(w6.K)?.enabled === false && !flagOf(w6.K, w6.emps[0]) && armedOf(w6, w6.emps[0]).length === 0,
    'T6l: `enabled = false` (setup keeperów) — wojna nie tworzy puli');
}

// ── T7 — zapis i wczytanie ─────────────────────────────────────────────────────────────────────
console.log('\nT7 — flaga i pochodzenie przeżywają zapis');
{
  const w = boot();
  const e1 = w.emps[0];
  declare(w.K, e1);
  const gsJson = JSON.stringify(gameState.serialize());
  const vmJson = JSON.stringify(quiet(() => w.vm.serialize()));
  gameState.restore(null);
  const blank = flagOf(w.K, e1);
  gameState.restore(JSON.parse(gsJson));
  const vm2 = new VesselManager();
  const empty = vm2.getAllVessels().length;
  quiet(() => vm2.restore(JSON.parse(vmJson)));
  const pool = vm2.getAllVessels().filter((v) => v.origin === 'pool');
  assert(!blank && flagOf(w.K, e1)?.mobilized === true && flagOf(w.K, e1)?.created === 2,
    'T7a: flaga empires.<id>.fleetPool przeżywa zapis i wczytanie (świadek: świeży stan bez flagi)');
  assert(empty === 0 && pool.length === 2 && same(pool.map((v) => v.directorOrigin), [D, E])
    && pool.every((v) => v.ownerEmpireId === e1 && v.serviceState === 'active'),
    `T7b: origin 'pool' i adnotacja przeżywają zapis VesselManager (${pool.length})`);
}

// ── T8 — powiadomienie ─────────────────────────────────────────────────────────────────────────
console.log('\nT8 — istniejące powiadomienie o mobilizacji');
{
  boot();
  const nc = new NotificationCenter();
  const at = (level) => { window.KOSMOS.intelSystem = { isAtLeast: (_id, want) => {
    const R = { unknown: 0, rumor: 1, contact: 2, detailed: 3 }; return R[level] >= R[want]; } }; };
  at('rumor');
  EventBus.emit('fleetPool:mobilized', { empireId: 'emp_001', created: 2 });
  const n0 = nc.getActive().length;
  at('contact');
  EventBus.emit('fleetPool:mobilized', { empireId: 'emp_001', created: 0 });
  const nZero = nc.getActive().length;
  EventBus.emit('fleetPool:mobilized', { empireId: 'emp_001', created: 2 });
  const act = nc.getActive();
  assert(n0 === 0 && nZero === 0 && act.length === 1 && act[0].type === 'mobilization' && act[0].logChannel === 'intel'
    && act[0].subtitle === t('notif.mobilizationSubtitle', 2),
    `T8: plotka — nic; kontakt, 0 kadłubów — nic; kontakt, 2 — wpis mobilizacji (${act[0]?.subtitle ?? '—'})`);
}

// ── T9 — odczyt konsoli ────────────────────────────────────────────────────────────────────────
console.log('\nT9 — odczyt konsoli per imperium');
{
  const w = boot();
  const [e1, e2] = w.emps;
  declare(w.K, e1);
  let rows = [];
  const tb = console.table;
  console.table = (r) => { rows = r; };
  try { fl('printFleetLimits', w.K); } finally { console.table = tb; }
  const r1 = rows.find((r) => r.imperium === e1), r2 = rows.find((r) => r.imperium === e2);
  assert(r1?.zBakiem === 1 && r1?.pula === 'tak' && r1?.pulaDoda === `${E} x1`,
    `T9a: imperium z pulą — z bakiem 1, pula tak, dołoży ${E} x1 (minimum 2) (${JSON.stringify({ z: r1?.zBakiem, p: r1?.pula, d: r1?.pulaDoda })})`);
  assert(r2?.zBakiem === 0 && r2?.pula === 'nie' && r2?.pulaDoda === `${D} x1, ${E} x1`,
    `T9b: imperium bez puli — pula nie, dołoży ${D} x1, ${E} x1 (${JSON.stringify({ z: r2?.zBakiem, p: r2?.pula, d: r2?.pulaDoda })})`);
}

// ── T10 — wpięcie ──────────────────────────────────────────────────────────────────────────────
console.log('\nT10 — wpięcie: GameScene, GameCore, DebugLog, NotificationCenter, jedno wejście tworzenia');
{
  const gs = stripComments(read('scenes/GameScene.js'));
  assert(/import\s*\{\s*FleetPoolSystem\s*\}\s*from\s*'\.\.\/systems\/FleetPoolSystem\.js'/.test(gs)
    && /this\.fleetPoolSystem\s*=\s*new FleetPoolSystem\(\)/.test(gs) && /window\.KOSMOS\.fleetPoolSystem\s*=\s*this\.fleetPoolSystem/.test(gs),
    'T10a: GameScene konstruuje FleetPoolSystem i wpisuje go do lokatora');
  const gc = stripComments(read('testing/headless/GameCore.js'));
  assert(/new FleetPoolSystem\(\)/.test(gc) && /K\.fleetPoolSystem\s*=\s*this\.fleetPoolSystem/.test(gc),
    'T10b: parytet — GameCore montuje FleetPoolSystem');
  const dl = stripComments(read('core/DebugLog.js'));
  const tracked = dl.slice(dl.indexOf('const TRACKED_EVENTS = ['), dl.indexOf('];', dl.indexOf('const TRACKED_EVENTS = [')));
  assert(['fleetPool:mobilized', 'fleetPool:mobilizeSkipped', 'fleetPool:createRefused'].every((e) => tracked.includes(`'${e}'`)),
    'T10c: fleetPool:mobilized / mobilizeSkipped / createRefused w DebugLog.TRACKED_EVENTS');
  const nc = stripComments(read('systems/NotificationCenter.js'));
  assert(/EventBus\.on\('fleetPool:mobilized',\s*e\s*=>\s*this\._handleMobilized\(/.test(nc),
    'T10d: NotificationCenter kieruje fleetPool:mobilized do istniejącego _handleMobilized');
  const callers = srcFiles().filter((f) => /\.createAIVessel\(/.test(stripComments(readFileSync(f, 'utf8')))).map(rel).sort();
  const pool = stripComments(read('systems/FleetPoolSystem.js'));
  assert(same(callers, ['systems/FleetPoolSystem.js']) && pool.length > 0 && !/_vessels\.set|createVessel\(|createAndRegister\(/.test(pool),
    `T10e: kadłuby puli powstają wyłącznie przez createAIVessel, wołane tylko z FleetPoolSystem (${JSON.stringify(callers)})`);
}

console.log(`\n[sb1_fleet_pool_smoke] PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
