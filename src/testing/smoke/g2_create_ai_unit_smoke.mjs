// G2-1 — AI GARRISON: wspólna funkcja `GroundUnitManager.createAIUnit` (D6, D7).
//
// PO CO: dziś jednostkę AI tworzy się `createUnit` z samym `{ owner }` (`InvasionSystem.js:130`) —
// dostaje wtedy `factionId 'humanity'`, więc utrzymanie liczy ją jak jednostkę GRACZA; na kolonii
// z 0 Kr przechodzi w 1. civY w `offline`, przestaje być obrońcą i do 5. civY zostaje rozwiązana
// (pin `g2_seams_smoke` P2). Forma 5-argumentowa oddaje ją graczowi (P1d). Jedna funkcja ma to
// zamknąć raz, dla wszystkich przyszłych wołających (materializacja garnizonu G2-3, pule desantu G2b).
//
//   T1  `owner` i `factionId` = imperium; `popCost` 0; `homeColonyId` = kolonia imperium na tym
//       ciele (pełna albo placówka), a gdy jej nie ma — `null`.
//   T2  po 10 civY prawdziwych ticków na kolonii z 0 Kr jednostka jest aktywna (nie `offline`,
//       nie rozwiązana), a `hasLivingDefender` = true. Kontrola: `createUnit` z samym `{ owner }`
//       w tym samym przebiegu przechodzi w `offline` i znika.
//   T3  żadna kolonia nie płaci za nią utrzymania (zero `trade:spendCredits` z celem
//       `ground_unit_upkeep`) i nie liczy się do limitu rekrutacji GRACZA, nawet stojąc na jego ciele.
//       Kontrole: jednostka z samym `{ owner }` — płaci i blokuje limit.
//   T4  rozkładany archetyp z `deployed = true` ma te same staty i stan, co jednostka, która
//       skończyła się rozkładać (`deploy` → `_tickDeployTransition`); z `deployed = false` — `mobile`.
//   T5  `morale` = `maxMorale` = podana wartość; archetyp bez morale dostaje 0 bez błędu.
//   T6  serialize → restore zachowuje pola z T1, T4, T5.
//   T7  nieznany archetyp albo nieznane imperium: nic nie powstaje, wywołanie zgłasza porażkę.
//       Świadek: poprawne wywołanie tworzy DOKŁADNIE jedną jednostkę. Dodatkowo (poza podpisanym
//       kształtem) odmowa dla morale niebędącego liczbą — powód `invalid_morale`.
//   T8  `garrison_unit` z morale 10 / 50 / 100 wytrzymuje pod ogniem tyle trafień, ile przewiduje
//       reguła G1 (każde trafienie −3 morale, `CombatSystem.js:38`; rozpad przy morale ≤ 0, `:254`;
//       jednostka defensywna się nie wycofuje), i rozpada się DOKŁADNIE przy trafieniu ⌈M/3⌉.
//
// ⚠ Fail-first: przed naprawą `createAIUnit` nie istnieje — wywołanie idzie przez `make()`,
//   które wtedy zwraca porażkę zamiast rzucać, więc każdy test dostaje kolor (nic się nie wywraca).
// ⚠ Harness: `bootWithDirector` — odsiewa PRNG i `gameState` przed każdym bootem, więc każdy blok
//   dostaje ten sam świat (domyślne ziarno; kolonia AI z lądową stolicą = emp_002).

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { GroundUnitManager } from '../../systems/GroundUnitManager.js';
import { CombatSystem } from '../../systems/CombatSystem.js';
import { InvasionSystem } from '../../systems/InvasionSystem.js';
import { EmpireColonyBootstrap } from '../../systems/EmpireColonyBootstrap.js';
import { UNIT_ARCHETYPES } from '../../data/unitArchetypes.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const MORALE_COST_WHEN_HIT = 3;   // `CombatSystem.js:38` (stała nieeksportowana)
const DT = 0.25;

// ── Harness ──────────────────────────────────────────────────────────────────────────────

function boot() {
  const { core, K, ticker } = bootWithDirector({ quiet: true });
  const cm  = core.colonyManager;
  const gum = K.groundUnitManager;
  const home = cm.getColony(K.homePlanet.id);
  const ai = cm.getAllColonies().find(c => {
    const cap = c.grid?.toArray?.().find(t => t?.capitalBase);
    return c.ownerEmpireId && !c.isOutpost && cap && cap.type !== 'ocean';
  });
  return { core, K, cm, gum, home, ai, emp: ai?.ownerEmpireId, ticker };
}

/** Wywołanie funkcji, która przed naprawą NIE ISTNIEJE — porażka zamiast wyjątku (fail-first). */
function make(w, spec) {
  if (typeof w.gum.createAIUnit !== 'function') return { ok: false, reason: 'NO_FUNCTION' };
  return w.gum.createAIUnit(spec);
}

const capitalOf = (col) => col?.grid?.toArray?.().find(t => t?.capitalBase) ?? null;
const landTiles = (col) => (col?.grid?.toArray?.() ?? []).filter(t => t && t.type !== 'ocean');

function bootstrapAiOutpost(w) {
  const sysId = w.K.empireRegistry.get(w.emp)?.homeSystemId;
  const body = (EntityManager.getByTypeInSystem('planetoid', sysId) ?? []).find(b => !w.cm.getColony(b.id));
  if (!body) return null;
  EmpireColonyBootstrap.bootstrapAutonomousOutpost(w.emp, sysId, body.id, 'autonomous_solar_farm');
  EmpireColonyBootstrap.bootstrapAutonomousOutpost(w.emp, sysId, body.id, 'autonomous_mine');
  return w.cm.getColony(body.id);
}

function withFixedRng(fn) {
  const real = Math.random;
  Math.random = () => 0.5;
  try { return fn(); } finally { Math.random = real; }
}

// ── T1 — tożsamość, popCost, homeColonyId ────────────────────────────────────────────────
{
  console.log('\nT1 — owner/factionId imperium, popCost 0, homeColonyId');
  const w = boot();
  const cap = capitalOf(w.ai);
  assert(!!w.ai && !!cap, `świadek: kolonia AI ${w.ai?.planetId} (${w.emp}) z lądową stolicą`);

  const r = make(w, { archetypeId: 'garrison_unit', empireId: w.emp, planetId: w.ai.planetId,
                      q: cap.q, r: cap.r, morale: 50 });
  const u = r.unit;
  assert(r.ok === true && !!u && w.gum.getUnit(u.id) === u, `T1: utworzona i zarejestrowana (ok=${r.ok}, reason=${r.reason ?? '-'})`);
  assert(u?.owner === w.emp && u?.factionId === w.emp,
    `T1a: owner i factionId = imperium (owner=${u?.owner}, factionId=${u?.factionId})`);
  assert(u?.popCost === 0, `T1b: popCost 0 (${u?.popCost})`);
  assert(u?.homeColonyId === w.ai.planetId,
    `T1c: na własnej kolonii homeColonyId = jej planetId (${u?.homeColonyId})`);

  const out = bootstrapAiOutpost(w);
  const ot = landTiles(out)[0];
  const ro = out ? make(w, { archetypeId: 'aa_platform', empireId: w.emp, planetId: out.planetId, q: ot.q, r: ot.r, morale: 50 }) : {};
  assert(!!out && ro.ok === true && ro.unit?.homeColonyId === out.planetId,
    `T1d: na własnej PLACÓWCE homeColonyId = jej planetId (${ro.unit?.homeColonyId}, placówka ${out?.planetId})`);

  const hcap = capitalOf(w.home);
  const rf = make(w, { archetypeId: 'shock_infantry', empireId: w.emp, planetId: w.home.planetId, q: hcap.q, r: hcap.r, morale: 50 });
  assert(rf.ok === true && rf.unit?.homeColonyId === null && rf.unit?.owner === w.emp,
    `T1e: na ciele bez kolonii imperium (kolonia gracza) homeColonyId = null (${rf.unit?.homeColonyId})`);
}

// ── T2 — 10 civY prawdziwych ticków przy 0 Kr ───────────────────────────────────────────
{
  console.log('\nT2 — 10 civY ticków na kolonii z 0 Kr: aktywna, broni');
  const w = boot();
  const cap = capitalOf(w.ai);
  w.ai.credits = 0;
  const r = make(w, { archetypeId: 'garrison_unit', empireId: w.emp, planetId: w.ai.planetId, q: cap.q, r: cap.r, morale: 50 });
  const ctl = w.gum.createUnit('garrison_unit', w.ai.planetId, cap.q, cap.r, { owner: w.emp, deployState: 'deployed' });
  const statuses = [];
  for (let y = 1; y <= 10; y++) {
    w.ticker.run(1, { tickSize: 1.0 });
    statuses.push(w.gum.getUnit(r.unit?.id)?.status ?? 'GONE');
  }
  const live = r.unit ? w.gum.getUnit(r.unit.id) : null;
  assert(r.ok === true && !!live && live.status !== 'offline' && (live.unpaidYears ?? 0) === 0,
    `T2a: po 10 civY aktywna (statusy: ${statuses.join(',')}; unpaidYears=${live?.unpaidYears ?? '-'})`);
  const defOnlyAi = InvasionSystem.hasLivingDefender(
    w.gum.getUnitsOnPlanet(w.ai.planetId).filter(x => x.id !== ctl.id), 'player');
  assert(r.ok === true && defOnlyAi === true, `T2b: hasLivingDefender(…, 'player') = ${defOnlyAi}`);
  assert(!w.gum._units.has(ctl.id), `T2 kontrola: createUnit z samym { owner } w tym samym przebiegu zniknęła (rozwiązana)`);
}

// ── T3 — utrzymanie i limit rekrutacji gracza ───────────────────────────────────────────
{
  console.log('\nT3 — utrzymanie: nikt nie płaci; limit rekrutacji gracza: nie liczy się');
  const run = (useAi) => {
    const w = boot();
    const cap = capitalOf(w.ai);
    w.ai.credits = 1000;                     // kredyty są — obciążenie byłoby widać
    const spends = [];
    EventBus.on('trade:spendCredits', (e) => { if (e?.purpose === 'ground_unit_upkeep') spends.push(e); });
    const made = useAi
      ? make(w, { archetypeId: 'garrison_unit', empireId: w.emp, planetId: w.ai.planetId, q: cap.q, r: cap.r, morale: 50 })
      : { ok: true, unit: w.gum.createUnit('garrison_unit', w.ai.planetId, cap.q, cap.r, { owner: w.emp }) };
    w.ticker.run(10, { tickSize: 1.0 });
    return { w, made, spends };
  };
  const a = run(true);
  assert(a.made.ok === true && !!a.w.gum.getUnit(a.made.unit?.id) && a.spends.length === 0,
    `T3a: 10 civY, kolonia z 1000 Kr — zero obciążeń 'ground_unit_upkeep' (${a.spends.length})`);
  const c = run(false);
  assert(c.spends.length > 0 && c.spends.every(e => e.colonyId === c.w.ai.planetId),
    `T3a kontrola: jednostka z samym { owner } obciąża kolonię AI (${c.spends.length} obciążeń)`);

  const w = boot();
  const hcap = capitalOf(w.home);
  const max = w.cm._getMaxGroundUnits(w.home);
  for (let i = 0; i < max - 1; i++) {
    w.gum.createUnit('shock_infantry', w.home.planetId, hcap.q, hcap.r, { owner: 'player', factionId: 'humanity' });
  }
  const before = w.cm._canRecruitMoreUnits(w.home, 'shock_infantry');
  const r = make(w, { archetypeId: 'shock_infantry', empireId: w.emp, planetId: w.home.planetId, q: hcap.q, r: hcap.r, morale: 50 });
  const after = w.cm._canRecruitMoreUnits(w.home, 'shock_infantry');
  assert(before === true && r.ok === true && after === true,
    `T3b: limit ${max}, gracz ma ${max - 1} — jednostka AI na jego ciele nie zjada miejsca (przed ${before}, po ${after})`);
  w.gum.createUnit('shock_infantry', w.home.planetId, hcap.q, hcap.r, { owner: w.emp });
  assert(w.cm._canRecruitMoreUnits(w.home, 'shock_infantry') === false,
    `T3b kontrola: jednostka z samym { owner } (factionId 'humanity') zjada ostatnie miejsce`);
}

// ── T4 — deployed od utworzenia == po rozłożeniu ────────────────────────────────────────
{
  console.log('\nT4 — garrison_unit: deployed od utworzenia == po zakończonym rozkładaniu');
  const w = boot();
  const [t1, t2] = landTiles(w.ai);
  const ra = make(w, { archetypeId: 'garrison_unit', empireId: w.emp, planetId: w.ai.planetId, q: t1.q, r: t1.r, morale: 50 });
  const rb = make(w, { archetypeId: 'garrison_unit', empireId: w.emp, planetId: w.ai.planetId, q: t2.q, r: t2.r, morale: 50, deployed: false });
  const A = ra.unit, B = rb.unit;
  assert(rb.ok === true && B?.deployState === 'mobile' && B?.attack === 0,
    `T4b: deployed = false ⇒ 'mobile' (deployState=${B?.deployState}, attack=${B?.attack})`);
  const dep = B ? w.gum.deploy(B.id) : { success: false };
  const arch = UNIT_ARCHETYPES.garrison_unit;
  for (let t = 0; t < (arch.deployTime ?? 2) + 1; t += DT) w.gum.tick(DT);
  const keys = ['deployState', 'stateTimer', 'attack', 'defense', 'range', 'speedHex', 'supplyConsumption', 'hp', 'hpMax', 'currentHP', 'org'];
  const diff = A && B ? keys.filter(k => A[k] !== B[k]) : ['NO_UNITS'];
  const sameBase = A && B && JSON.stringify(A.baseStats) === JSON.stringify(B.baseStats);
  assert(ra.ok === true && dep.success === true && B?.deployState === 'deployed' && diff.length === 0 && sameBase,
    `T4a: utworzona deployed == rozłożona przez deploy() (różnice: ${diff.join(',') || 'brak'}; ` +
    `baseStats ${sameBase ? 'równe' : 'RÓŻNE'}; A.attack=${A?.attack} A.defense=${A?.defense})`);
  const rc = make(w, { archetypeId: 'shock_infantry', empireId: w.emp, planetId: w.ai.planetId, q: t1.q, r: t1.r, morale: 50 });
  assert(rc.ok === true && rc.unit?.deployState === null,
    `T4c: archetyp nierozkładany ⇒ deployState null mimo deployed = true (${rc.unit?.deployState})`);
}

// ── T5 — morale ────────────────────────────────────────────────────────────────────────
{
  console.log('\nT5 — morale = maxMorale = podana wartość; bez morale ⇒ 0');
  const w = boot();
  const cap = capitalOf(w.ai);
  const vals = [10, 50, 100].map(m => {
    const r = make(w, { archetypeId: 'garrison_unit', empireId: w.emp, planetId: w.ai.planetId, q: cap.q, r: cap.r, morale: m });
    return { m, ok: r.ok, morale: r.unit?.morale, max: r.unit?.maxMorale };
  });
  assert(vals.every(v => v.ok === true && v.morale === v.m && v.max === v.m),
    `T5a: ${vals.map(v => `${v.m}→${v.morale}/${v.max}`).join(' · ')}`);
  const d = make(w, { archetypeId: 'recon_drone', empireId: w.emp, planetId: w.ai.planetId, q: cap.q, r: cap.r, morale: 50 });
  assert(d.ok === true && d.unit?.noMorale === true && d.unit?.morale === 0 && d.unit?.maxMorale === 0,
    `T5b: recon_drone (noMorale) ⇒ morale 0, maxMorale 0, bez błędu (ok=${d.ok}, ${d.unit?.morale}/${d.unit?.maxMorale})`);
  const hi = make(w, { archetypeId: 'garrison_unit', empireId: w.emp, planetId: w.ai.planetId, q: cap.q, r: cap.r, morale: 150 });
  assert(hi.ok === true && hi.unit?.morale === 100 && hi.unit?.maxMorale === 100,
    `T5c: morale spoza [0, 100] przycięte jak u gracza (150 → ${hi.unit?.morale}/${hi.unit?.maxMorale})`);
}

// ── T6 — serialize → restore ───────────────────────────────────────────────────────────
{
  console.log('\nT6 — serialize → restore zachowuje pola T1/T4/T5');
  const w = boot();
  const [t1, t2] = landTiles(w.ai);
  const specs = [
    { archetypeId: 'garrison_unit', empireId: w.emp, planetId: w.ai.planetId, q: t1.q, r: t1.r, morale: 50 },
    { archetypeId: 'garrison_unit', empireId: w.emp, planetId: w.ai.planetId, q: t2.q, r: t2.r, morale: 10, deployed: false },
    { archetypeId: 'recon_drone',   empireId: w.emp, planetId: w.ai.planetId, q: t1.q, r: t1.r, morale: 50 },
  ];
  const made = specs.map(s => make(w, s));
  const data = JSON.parse(JSON.stringify(w.gum.serialize()));
  const fresh = new GroundUnitManager();
  fresh.restore(data);
  const keys = ['owner', 'factionId', 'popCost', 'homeColonyId', 'deployState', 'stateTimer', 'attack', 'defense',
                'range', 'speedHex', 'morale', 'maxMorale', 'noMorale', 'org', 'maxOrg', 'supply', 'supplyCap',
                'supplyConsumption', 'hp', 'hpMax', 'status'];
  const bad = [];
  for (const r of made) {
    const a = r.unit, b = a ? fresh.getUnit(a.id) : null;
    if (!a || !b) { bad.push(`${r.reason ?? '?'}:brak`); continue; }
    for (const k of keys) if (a[k] !== b[k]) bad.push(`${a.archetypeId}.${k}: ${a[k]}→${b[k]}`);
  }
  assert(made.every(r => r.ok === true) && bad.length === 0,
    `T6: ${made.length} jednostek, ${keys.length} pól — rozjazdy: ${bad.join('; ') || 'brak'}`);
}

// ── T7 — odmowy ────────────────────────────────────────────────────────────────────────
{
  console.log('\nT7 — nieznany archetyp / nieznane imperium: nic nie powstaje');
  const w = boot();
  const cap = capitalOf(w.ai);
  const created = [];
  EventBus.on('groundUnit:created', (e) => created.push(e));
  const base = { empireId: w.emp, planetId: w.ai.planetId, q: cap.q, r: cap.r, morale: 50 };
  const n0 = w.gum._units.size;
  const ok = make(w, { ...base, archetypeId: 'garrison_unit' });
  assert(typeof w.gum.createAIUnit === 'function' && ok.ok === true && w.gum._units.size === n0 + 1 && created.length === 1,
    `świadek: funkcja istnieje, poprawne wywołanie tworzy DOKŁADNIE jedną jednostkę (+${w.gum._units.size - n0}, zdarzeń ${created.length})`);
  const cases = [
    ['legacy infantry', { ...base, archetypeId: 'infantry' }],
    ['nieznany archetyp', { ...base, archetypeId: 'nope_unit' }],
    ['nieznane imperium', { ...base, archetypeId: 'garrison_unit', empireId: 'emp_nope' }],
    ['player jako imperium', { ...base, archetypeId: 'garrison_unit', empireId: 'player' }],
    ['brak imperium', { ...base, archetypeId: 'garrison_unit', empireId: undefined }],
    // ⚠ Poza podpisanym kształtem (D7 mówi o odmowie dla archetypu i imperium): brak liczby morale
    //   to błąd wołającego — jedyna gałka AI — więc odmowa zamiast cichego domyślnego morale archetypu.
    ['morale nie-liczba', { ...base, archetypeId: 'garrison_unit', morale: undefined }],
  ];
  const n1 = w.gum._units.size, c1 = created.length;
  const res = cases.map(([label, spec]) => [label, make(w, spec)]);
  assert(typeof w.gum.createAIUnit === 'function' && res.every(([, r]) => r.ok === false && !r.unit && typeof r.reason === 'string')
         && w.gum._units.size === n1 && created.length === c1,
    `T7: ${res.map(([l, r]) => `${l}→${r.reason}`).join(' · ')} (jednostek +${w.gum._units.size - n1}, zdarzeń +${created.length - c1})`);
}

// ── T8 — morale z utworzenia rządzi rozpadem pod ogniem ─────────────────────────────────
{
  console.log('\nT8 — garrison_unit pod ogniem: rozpad przy trafieniu ⌈M/3⌉');
  const w = boot();
  // G2-4 (R1, D14): ogień na ziemi tylko w wojnie — scena ostrzału jest sceną wojenną, więc wojna w setupie
  //   (asercje bez zmian). Mobilizacja (G2-3b) wyłączona: garnizon planu stanąłby na heksach tej sceny.
  if (w.K.garrisonSystem) w.K.garrisonSystem.enabled = false;
  w.K.diplomacySystem.declareWar(w.emp, 'keeper_setup');
  const cs = new CombatSystem();
  w.K.combatSystem = cs;
  const tiles = landTiles(w.ai);
  const out = [];
  for (const [i, M] of [[0, 10], [1, 50], [2, 100]]) {
    const t = tiles[10 + i * 7];
    const r = make(w, { archetypeId: 'garrison_unit', empireId: w.emp, planetId: w.ai.planetId, q: t.q, r: t.r, morale: M });
    const g = r.unit;
    if (!g) { out.push({ M, ok: false }); continue; }
    g.hp = g.hpMax = g.currentHP = 100000;                  // izolacja: HP nie może skończyć walki przed morale
    const atk = w.gum.createUnit('garrison_unit', w.ai.planetId, t.q, t.r,
      { owner: 'player', factionId: 'humanity', deployState: 'deployed', hp: 100000 });
    atk.hpMax = 100000; atk.morale = 100; atk.maxMorale = 100;
    let hits = 0, hitsAtCollapse = null, collapseReason = null;
    const onHit = (e) => { if (e.targetId === g.id) hits++; };
    const onDis = (e) => { if (e.unitId === g.id && hitsAtCollapse === null) { hitsAtCollapse = hits; collapseReason = e.reason; } };
    EventBus.on('groundUnit:attacked', onHit);
    EventBus.on('groundUnit:disbanded', onDis);
    withFixedRng(() => { for (let s = 0; s < 200 && hitsAtCollapse === null; s++) w.gum.tick(DT); });
    EventBus.off('groundUnit:attacked', onHit);
    EventBus.off('groundUnit:disbanded', onDis);
    w.gum.removeUnit(atk.id);
    out.push({ M, ok: true, expected: Math.ceil(M / MORALE_COST_WHEN_HIT), hitsAtCollapse, collapseReason });
  }
  for (const o of out) {
    assert(o.ok && o.hitsAtCollapse === o.expected && o.collapseReason === 'morale_collapse',
      `T8 M=${o.M}: rozpad przy trafieniu ${o.hitsAtCollapse ?? '-'} (reguła G1: ${o.expected ?? '-'}; powód ${o.collapseReason ?? '-'})`);
  }
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
