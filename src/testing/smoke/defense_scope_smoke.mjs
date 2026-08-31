// DEFENSE SCOPE — keeper slice'u „AI atakuje to, czego nie jest w stanie zdobyc"
// (Findingi 199 + 200). Plan + podpisane decyzje D-199-1..8: docs/design/DEFENSE_SCOPE_PLAN.md.
//
// STAN: COMMIT 1 z trzech. Pinuje WYLACZNIE D-199-6 (Finding 200) — „bezbronny kadlub wnosi
//   HP, ale ZERO broni". Commit 2 (gradowana eskadra) i commit 3 (V4 — zakres ciala dla
//   budynkow) dopisza tu wlasne piny.
//
// PO CO: `WarSystem._playerVesselsInSystem` nie filtruje po uzbrojeniu, wiec do jednostki
//   obroncy wchodzi KAZDY statek gracza w ukladzie — takze frachtowiec bez modulu broni.
//   Do tego `BattleSystem.playerVesselsToBattleUnit:262` dawalo takiemu kadlubowi bron
//   `{damage:2}` w prezencie. Gracz bez ani jednego okretu wojennego wystawial wiec
//   UZBROJONA jednostke. Sciezki walki byly w tej sprawie NIEZGODNE: `DSCS.startEngagement`
//   ma bramke „anyArmed" (`36d9551`) i ODMAWIA starcia bezbronnych, a sciezka orbitalna
//   (`EnemyAttackHandler` → `_buildPlayerBattleUnit`) tej bramki nie ma i UZBRAJALA.
//
// ⚠ DWA FALLBACKI, NIE JEDEN — I TO JEST CALA LEKCJA TEGO COMMITU.
//   Sprawdzenie wlasciciela przed implementacja („czy `resolveBattle` konczy sie czysto przy
//   `weapons: []`?") wykrylo, ze `BattleSystem.normalizeFleet` ma WLASNY, drugi fallback
//   (`{damage:5}`), wiec zdjecie samego pierwszego to BUFF 2 → 5, a nie rozbrojenie.
//   ZMIERZONE (obrazenia zadane napastnikowi przez bezbronnego handlowca, 6 ziaren):
//     pancerz 0 : 34 → 85     pancerz 2 : 20 → 71
//     pancerz 5 : 17 → 51     pancerz 10: 17 → 17   (prog `max(1, dmg - armor*0.4)` zrownuje)
//   ⇒ T1 i T2 sa DWUWARSTWOWE: warstwa (a) pyta o wyjscie `playerVesselsToBattleUnit`,
//     warstwa (b) o to, co WIDZI `resolveBattle`. Pin jednowarstwowy przechodzi na pierwszym
//     fallbacku i NIGDY nie zobaczy drugiego — dokladnie tak ten buff sie chowal.
//
// ⚠ SKUTEK PO STRONIE AI JEST SYMETRYCZNY I ZAMIERZONY (T6): `EnemyAttackHandler:144` buduje
//   `enemyUnit` tym samym helperem, wiec bezbronny kadlub AI tez traci prezentowa bron.
//
// ⚠ `weapons: undefined` TO NIE JEST „bezbronny" (T3). Jawna pusta lista = deklaracja braku
//   uzbrojenia; brak pola = dane niepelne. Domyslny lekki laser zostaje WYLACZNIE dla
//   drugiego przypadku — inaczej kazdy przyszly producent jednostki, ktory zapomni pola,
//   po cichu wystawilby cel treningowy.
//
//   T1  bezbronny kadlub gracza: brak broni (a) i ZERO obrazen w bitwie (b)
//   T2  jawne `weapons: []` przechodzi przez `normalizeFleet` (drugi fallback)
//   T3  KONTROLA PROMIENIA RAZENIA: brak pola `weapons` DALEJ dostaje domyslna bron
//   T4  integracja: `_buildPlayerBattleUnit` dla koloni bez obrony i bez okretu wojennego
//   T5  REGRESJA: prawdziwa bron z budynkow obronnych PRZEZYWA (ginie tylko prezentowa)
//   T6  symetria: bezbronny kadlub AI (konsument `EnemyAttackHandler:144`) tez bez broni
//   T7  Finding 209: obronca-widmo NAPRAWDE jest bezbronny (komentarze zrodlowe mowily tak
//       od W3-4b, a `normalizeFleet` dawal mu laser dmg 5)

import '../headless/env.js';           // MUSI byc pierwszy
import EntityManager from '../../core/EntityManager.js';
import { WarSystem } from '../../systems/WarSystem.js';
import { resolveBattle, playerVesselsToBattleUnit } from '../../systems/BattleSystem.js';
import { HULLS } from '../../data/HullsData.js';
import { SHIP_MODULES } from '../../data/ShipModulesData.js';
import { createVessel, hasWeapons } from '../../entities/Vessel.js';
import { resolveTemplate } from '../../utils/ShipTemplateResolver.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const SYS = 'sys_home', CAP = 'p_cap', SEC = 'p_sec';
const SEEDS = [101, 12345, 777, 4242, 90210, 31337];

EntityManager.clear();
EntityManager.add({ id: CAP, name: 'Stolica', type: 'planet', systemId: SYS, x: 110, y: 0 });
EntityManager.add({ id: SEC, name: 'Wtorna',  type: 'planet', systemId: SYS, x: 330, y: 0 });

const mkActives = (list) => {
  const m = new Map();
  list.forEach((x, i) => m.set('t' + i, { building: { id: x.id }, level: x.level }));
  return m;
};

const RTPL = resolveTemplate('frigate_laser_escort', { isResearched: () => true });

/** Bezbronny frachtowiec gracza — zero modulow broni. */
function mkCargo(id, dockedAt = CAP) {
  const v = createVessel('hull_small', dockedAt, {
    name: 'Kupiec-' + id, modules: ['engine_ion', 'cargo_small'], systemId: SYS,
  });
  v.position = { state: 'orbiting', dockedAt, x: dockedAt === CAP ? 110 : 330, y: 0 };
  return v;
}

/** Uzbrojona fregata — kontrola pinu dla T1. */
function mkFrigate(id, dockedAt = CAP) {
  const v = createVessel(RTPL.hullId, dockedAt, {
    name: 'Fregata-' + id, modules: [...RTPL.modules], systemId: SYS,
  });
  v.position = { state: 'orbiting', dockedAt, x: dockedAt === CAP ? 110 : 330, y: 0 };
  return v;
}

/**
 * ⚠ NAPASTNIK CELOWO BEZ MODULU PANCERZA. Przy pancerzu >= 10 prog
 * `Math.max(1, dmg - armor*0.4)` zrownuje dmg 2 i dmg 5 do 1 obrazenia na trafienie —
 * pin bylby wtedy nierozroznialny miedzy „naprawione" a „podmienione na mocniejszy fallback".
 */
function mkAttacker(n = 2) {
  const arr = [];
  const mods = RTPL.modules.filter(m => !/armor/.test(m));
  for (let i = 0; i < n; i++) {
    const v = createVessel(RTPL.hullId, 'p_ai', { name: 'R' + i, modules: [...mods], systemId: SYS });
    v.ownerEmpireId = 'emp_001';
    arr.push(v);
  }
  return playerVesselsToBattleUnit(arr, HULLS, SHIP_MODULES, n + ' rajderow');
}

/** Ile obrazen ZADAL obronca (B) napastnikowi (A) — suma po ziarnach. */
function damageDealtByDefender(attacker, defender) {
  let total = 0;
  for (const s of SEEDS) {
    total += resolveBattle(attacker, defender,
      { casusBelli: 'border_incident', location: { systemId: SYS, planetId: SEC, point: null }, seed: s }).lossesA;
  }
  return total;
}

function mkWorld({ capDef = [], secDef = [], vessels = [] } = {}) {
  const cap = { planetId: CAP, buildingSystem: { _active: mkActives(capDef) } };
  const sec = { planetId: SEC, buildingSystem: { _active: mkActives(secDef) } };
  const map = new Map(vessels.map(v => [v.id, v]));
  window.KOSMOS = {
    vesselManager: { _vessels: map, getVessel: id => map.get(id), getAllVessels: () => [...map.values()] },
    colonyManager: { getAllColonies: () => [cap, sec], getPlayerColonies: () => [cap, sec] },
    entityManager: EntityManager,
    timeSystem: { gameTime: 40 },
  };
  return { cap, sec, vessels: map };
}

// ── T1 — bezbronny kadlub gracza: DWIE WARSTWY ──────────────────────────────────────────────
console.log('T1 — bezbronny frachtowiec nie wnosi broni (a: helper, b: to, co widzi resolveBattle)');
{
  const cargo = mkCargo('a');
  const fleet = [cargo];

  assert(fleet.length > 0 && !hasWeapons(cargo),
    'T1 NIEJALOWOSC: tablica wejsciowa NIEPUSTA i kadlub faktycznie bezbronny ' +
    '(dla pustej tablicy pusta lista broni wychodzi INNA galezia — patrz T7)');

  const unit = playerVesselsToBattleUnit(fleet, HULLS, SHIP_MODULES, 'kupiec');
  assert(Array.isArray(unit.weapons) && unit.weapons.length === 0,
    `T1a: helper NIE dokleja broni bezbronnemu kadlubowi (jest: ${JSON.stringify(unit.weapons)})`);
  assert((unit.hp ?? 0) > 0,
    `T1a kontrola: kadlub DALEJ wnosi HP (${unit.hp}) — rozbrajamy, nie usuwamy z bitwy`);

  const enemy = mkAttacker(2);
  assert(enemy.armor < 10,
    `T1 NIEJALOWOSC: napastnik ma pancerz ${enemy.armor} < 10 — przy >= 10 prog ` +
    '`max(1, dmg - armor*0.4)` zrownuje dmg 2 i dmg 5 i pin przestaje rozrozniac warianty');

  const dealt = damageDealtByDefender(enemy, unit);
  assert(dealt === 0,
    `T1b: bezbronny obronca zadaje ZERO obrazen przez pelna sciezke resolveBattle (zadal: ${dealt})`);
}

// ── T1 kontrola pinu — uzbrojony kadlub bez zmian ───────────────────────────────────────────
console.log('T1 KONTROLA PINU — uzbrojona fregata DALEJ wnosi swoja bron');
{
  const frigate = mkFrigate('a');
  const unit = playerVesselsToBattleUnit([frigate], HULLS, SHIP_MODULES, 'fregata');
  assert(unit.weapons.length > 0 && unit.weapons.every(w => (w.damage ?? 0) > 0),
    `T1 kontrola: uzbrojony kadlub ma realne bronie (${JSON.stringify(unit.weapons)}) — ` +
    'czyli T1a mierzy BRAK UZBROJENIA, a nie globalne wykasowanie broni');
  const dealt = damageDealtByDefender(mkAttacker(2), unit);
  assert(dealt > 0,
    `T1 kontrola: uzbrojony obronca DALEJ zadaje obrazenia (${dealt}) — inaczej T1b bylby ` +
    'spelniony przez zepsucie calej matematyki bitwy');
}

// ── T2 — drugi fallback: `normalizeFleet` ───────────────────────────────────────────────────
console.log('T2 — jawne `weapons: []` przechodzi przez normalizeFleet (DRUGI fallback)');
{
  const defender = { label: 'B', hp: 30, shieldHP: 0, armor: 0, evasion: 0.25, techMult: 1, morale: 1, weapons: [] };
  const dealt = damageDealtByDefender(mkAttacker(2), defender);
  assert(dealt === 0,
    `T2: jednostka z JAWNIE pusta lista broni zadaje ZERO (zadala: ${dealt}). ` +
    'Przed naprawa `normalizeFleet` podstawial tu `{damage:5}` — MOCNIEJSZY niz usuwany fallback dmg 2');
}

// ── T3 — KONTROLA PROMIENIA RAZENIA ─────────────────────────────────────────────────────────
console.log('T3 — brak POLA `weapons` to NIE deklaracja bezbronnosci (dane niepelne)');
{
  const noField = { label: 'B', hp: 200, shieldHP: 0, armor: 0, evasion: 0.25, techMult: 1, morale: 1 };
  const dealt = damageDealtByDefender(mkAttacker(2), noField);
  assert(dealt > 0,
    `T3: jednostka BEZ pola \`weapons\` dalej dostaje domyslna bron (zadala: ${dealt}) — ` +
    'inaczej kazdy producent, ktory zapomni pola, po cichu wystawilby cel treningowy');
}

// ── T4 — integracja przez `_buildPlayerBattleUnit` ──────────────────────────────────────────
console.log('T4 — kolonia BEZ obrony i BEZ okretu wojennego wystawia jednostke NIEUZBROJONA');
{
  const cargo = mkCargo('b');
  mkWorld({ capDef: [], secDef: [], vessels: [cargo] });
  const war = new WarSystem();
  const unit = war._buildPlayerBattleUnit(SYS);

  assert((unit.hp ?? 0) > 0 && !hasWeapons(cargo),
    `T4 NIEJALOWOSC: obronca istnieje (hp ${unit.hp}) i jedyny statek jest bezbronny — ` +
    'pin nie mierzy „pustego ukladu"');
  assert((unit.weapons ?? []).length === 0,
    `T4: jednostka obroncy nie ma ANI JEDNEJ broni (jest: ${JSON.stringify(unit.weapons)})`);
  const dealt = damageDealtByDefender(mkAttacker(2), unit);
  assert(dealt === 0, `T4: i zadaje ZERO obrazen w bitwie (zadala: ${dealt})`);
}

// ── T5 — REGRESJA: prawdziwa bron z budynkow przezywa ───────────────────────────────────────
console.log('T5 — REGRESJA: bron z budynkow obronnych PRZEZYWA (ginie wylacznie prezentowa)');
{
  const cargo = mkCargo('c');
  mkWorld({ capDef: [{ id: 'defense_grid', level: 1 }, { id: 'defense_tower', level: 2 }], vessels: [cargo] });
  const war = new WarSystem();
  const unit = war._buildPlayerBattleUnit(SYS);

  // defense_grid Lv1 = +10 dmg, defense_tower Lv2 = +5*2 = +10 dmg  ⇒  20
  const dmgs = (unit.weapons ?? []).map(w => w.damage);
  assert(dmgs.length === 1 && dmgs[0] === 20,
    `T5: zostaje DOKLADNIE JEDNA bron, ta z budynkow (dmg 20). Jest: ${JSON.stringify(unit.weapons)}`);
  assert(!dmgs.includes(2),
    'T5: prezentowa bron dmg 2 zniknela z jednostki, w ktorej realna bron dalej stoi');
  const dealt = damageDealtByDefender(mkAttacker(2), unit);
  assert(dealt > 0,
    `T5 kontrola pinu: obrona z budynkow DALEJ strzela (${dealt}) — T4 mierzy brak uzbrojenia, ` +
    'a nie rozbrojenie kazdego obroncy');
}

// ── T6 — symetria po stronie AI ─────────────────────────────────────────────────────────────
console.log('T6 — SYMETRIA: bezbronny kadlub AI (konsument EnemyAttackHandler:144) tez bez broni');
{
  // `EnemyAttackHandler` agreguje wrogow TYM SAMYM helperem — skutek jest zamierzony.
  const hull = createVessel('hull_small', 'p_ai', {
    name: 'Kurier AI', modules: ['engine_ion', 'cargo_small'], systemId: SYS,
  });
  hull.ownerEmpireId = 'emp_001';
  assert(!hasWeapons(hull),
    'T6 NIEJALOWOSC: kadlub AI jest faktycznie bezbronny (inaczej pin nie ma o czym mowic)');

  const unit = playerVesselsToBattleUnit([hull], HULLS, SHIP_MODULES, 'kurier AI');
  assert((unit.weapons ?? []).length === 0 && (unit.hp ?? 0) > 0,
    `T6: bezbronny kadlub AI tez wnosi HP (${unit.hp}) i ZERO broni — zmiana jest symetryczna`);
}

// ── T7 — Finding 209: obronca-widmo ─────────────────────────────────────────────────────────
console.log('T7 — Finding 209: obronca-widmo NAPRAWDE jest bezbronny (komentarze mowily tak od W3-4b)');
{
  const phantom = playerVesselsToBattleUnit([], HULLS, SHIP_MODULES, 'widmo');
  assert((phantom.weapons ?? []).length === 0 && phantom.hp === 100,
    `T7a: widmo to {hp:100, weapons:[]} — tak jak opisuja je WarSystem:597 i EnemyAttackHandler:120 ` +
    `(jest: hp ${phantom.hp}, ${JSON.stringify(phantom.weapons)})`);
  const dealt = damageDealtByDefender(mkAttacker(2), phantom);
  assert(dealt === 0,
    `T7b: i NAPRAWDE nie strzela (zadal: ${dealt}). Przed naprawa komentarz mowil „ZERO broni", ` +
    'a `normalizeFleet` dawal widmu laser dmg 5 — predykat opisany w komentarzu != egzekwowany');
}

console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} — ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
