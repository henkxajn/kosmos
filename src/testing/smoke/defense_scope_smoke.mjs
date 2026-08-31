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
import { readFileSync } from 'node:fs';

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

// ════════════════════════════════════════════════════════════════════════════════════════════
// COMMIT 2 — D-199-1 (gradowana eskadra, BEZ clampa) + D-199-7 (prawdomowna drabina)
//            + D-199-8 (sygnatura z cialem) + przygotowanie sortu po `needed`.
//
// ⚠ POPRAWKA WLASCICIELA DO D-199-1: `needed` NIE JEST clampowane do `MAX_STRIKE_SIZE`.
//   Gdy przekracza sufit, `launchStrike` ODMAWIA wlasnym powodem `target_beyond_reach`.
//   Bez tego clamp odtwarza DOKLADNIE to samobojstwo, dla ktorego slice istnieje, tylko wyzej
//   na skali. ZMIERZONE: grid Lv3 + tower Lv5 → hp 530, needed 7, po clampie 3 rajdery (360)
//   → winner B (gracz) na czterech ziarnach. Pinuje to T11, z NIEJALOWOSCIA na `needed > 3`.
//
//   T8  `requiredSquadron` GRADUJE (>= 2 rozne wartosci) — stub ze stala musi paść
//   T9  BEZ CLAMPA: silna obrona ⇒ `target_beyond_reach`, nie start eskadra 3
//   T10 drabina jest PRAWDOMOWNA: „za slaba pula" != „za mocny cel"; kolejnosc badania
//   T11 pin uzasadnienia poprawki: przy clampie ta sama bitwa jest PRZEGRANA
//   T12 D-199-8: sygnatura przyjmuje cialo, a produkcyjny wolacz je PODAJE (pin zrodlowy)
//   T13 sort po `needed` rosnaco (przygotowanie — dziala dopiero z commitem 3)
// ════════════════════════════════════════════════════════════════════════════════════════════

const { DirectorOffensive, SQUADRON_HP_RATIO, MAX_STRIKE_SIZE, SQUADRON_VS_DEFENDED } =
  await import('../../systems/director/DirectorOffensive.js');

/** Swiat dla decyzji AI: kolonie gracza + rejestr statkow + zasieg imperium. */
function mkAiWorld({ capDef = [], secDef = [], vessels = [] } = {}) {
  const w = mkWorld({ capDef, secDef, vessels });
  window.KOSMOS.influenceMap    = { isClaimedBy: () => false, isInBorderZone: () => true };
  window.KOSMOS.territoryService = { getSystemDevScore: () => 5 };
  // ⚠ `estimateDefenderHp` pyta o obroncę TĄ SAMĄ funkcją, ktora zbuduje jednostke bitwy —
  //   wiec `warSystem` MUSI byc w locatorze, tak jak w produkcji (`GameScene:450`).
  window.KOSMOS.warSystem = new WarSystem();
  return w;
}

function mkRaider(id) {
  const v = createVessel(RTPL.hullId, 'p_ai', { name: 'Rajder-' + id, modules: [...RTPL.modules], systemId: SYS });
  v.ownerEmpireId = 'emp_001';
  v.position = { state: 'orbiting', dockedAt: 'p_ai_cap', x: 0, y: 0 };
  return v;
}

const tgtOf = (planetId) => ({
  colony: window.KOSMOS.colonyManager.getPlayerColonies().find(c => c.planetId === planetId),
  body: EntityManager.get(planetId),
  systemId: SYS,
});

// ── T8 — gradowanie ─────────────────────────────────────────────────────────────────────────
console.log('T8 — `requiredSquadron` GRADUJE: rozna obrona ⇒ rozna liczba okretow');
{
  assert(SQUADRON_HP_RATIO === 1.5,
    `T8 kontrola: \`SQUADRON_HP_RATIO\` jest NAZWANA STALA EKSPORTOWANA (${SQUADRON_HP_RATIO}) — ` +
    'jedyne pokretlo balansu tego slice\'u nie moze byc literalem we wzorze');

  const seen = new Set();
  for (const def of [[], [{ id: 'defense_tower', level: 1 }],
                     [{ id: 'defense_grid', level: 1 }, { id: 'defense_tower', level: 2 }],
                     [{ id: 'defense_grid', level: 3 }, { id: 'defense_tower', level: 5 }]]) {
    mkAiWorld({ secDef: def, vessels: [] });
    const off = new DirectorOffensive();
    seen.add(off.requiredSquadron(tgtOf(SEC)).needed);
  }
  assert(seen.size >= 2,
    `T8: rozne poziomy obrony daja ROZNE \`needed\` (${[...seen].sort((a, b) => a - b)}) — ` +
    'stub zwracajacy stala musi tu paść');
}

// ── T9 — BEZ CLAMPA ─────────────────────────────────────────────────────────────────────────
console.log('T9 — silna obrona ⇒ `target_beyond_reach`, NIE start eskadra o rozmiarze sufitu');
{
  const raiders = [mkRaider('1'), mkRaider('2'), mkRaider('3')];
  // ⚠ OBA ciala ufortyfikowane. Pod V4 `pickTarget` wybiera NAJTANSZE do wziecia, wiec
  //   fixture z jednym slabym cialem testowalby ATAK na nie, a nie odmowe (zlapane wykonaniem).
  mkAiWorld({ capDef: [{ id: 'defense_grid', level: 3 }, { id: 'defense_tower', level: 5 }], secDef: [{ id: 'defense_grid', level: 3 }, { id: 'defense_tower', level: 5 }], vessels: raiders });
  const off = new DirectorOffensive();
  const uncapped = off.requiredSquadron(tgtOf(SEC)).needed;

  assert(uncapped > MAX_STRIKE_SIZE,
    `T9 NIEJALOWOSC: \`needed\` BEZ CLAMPA (${uncapped}) przekracza sufit ${MAX_STRIKE_SIZE} — ` +
    'bez tego warunku pin przechodzilby takze dla implementacji Z clampem');

  const res = off.launchStrike({ empireId: 'emp_001', year: 40, ruleId: 'test' });
  assert(res.launched === 0 && res.reason === 'target_beyond_reach',
    `T9: odmowa wlasnym powodem (jest: launched=${res.launched}, reason=${res.reason})`);
  assert(res.needed === uncapped && res.defenderHp > 0,
    `T9: ladunek odmowy niesie PRAWDZIWE liczby {needed:${res.needed}, defenderHp:${res.defenderHp}}`);
}

// ── T10 — drabina prawdomowna ───────────────────────────────────────────────────────────────
console.log('T10 — „za slaba pula" i „za mocny cel" to DWA rozne stany swiata');
{
  // (a) cel osiagalny (needed <= sufit), ale pula za mala ⇒ insufficient_squadron
  mkAiWorld({ capDef: [{ id: 'defense_grid', level: 1 }], secDef: [{ id: 'defense_grid', level: 1 }], vessels: [mkRaider('1')] });
  let off = new DirectorOffensive();
  const needA = off.requiredSquadron(tgtOf(SEC)).needed;
  const resA = off.launchStrike({ empireId: 'emp_001', year: 40, ruleId: 'test' });
  assert(needA > 1 && needA <= MAX_STRIKE_SIZE,
    `T10a NIEJALOWOSC: cel jest OSIAGALNY (needed ${needA} <= ${MAX_STRIKE_SIZE}), a pula ma 1 okret`);
  assert(resA.reason === 'insufficient_squadron',
    `T10a: stan przejsciowy ma swoj powod (jest: ${resA.reason})`);

  // (b) ten sam ROZMIAR puli, cel nieosiagalny ⇒ target_beyond_reach (kolejnosc badania!)
  mkAiWorld({ capDef: [{ id: 'defense_grid', level: 3 }, { id: 'defense_tower', level: 5 }], secDef: [{ id: 'defense_grid', level: 3 }, { id: 'defense_tower', level: 5 }], vessels: [mkRaider('1')] });
  off = new DirectorOffensive();
  const resB = off.launchStrike({ empireId: 'emp_001', year: 40, ruleId: 'test' });
  assert(resB.reason === 'target_beyond_reach',
    `T10b: przy TEJ SAMEJ puli 1 okretu powodem jest struktura celu, nie chwilowy niedobor ` +
    `(jest: ${resB.reason}) — czyli \`target_beyond_reach\` jest badane PRZED \`insufficient_squadron\``);
  assert(resA.reason !== resB.reason,
    'T10 kontrola pinu: oba stany daja ROZNE powody — drabina nie zlala ich w jeden');
}

// ── T11 — uzasadnienie poprawki: clamp = przegrana bitwa ────────────────────────────────────
console.log('T11 — PIN UZASADNIENIA: gdyby `needed` bylo clampowane, ta bitwa jest PRZEGRANA');
{
  mkAiWorld({ secDef: [{ id: 'defense_grid', level: 3 }, { id: 'defense_tower', level: 5 }], vessels: [] });
  const war = new WarSystem();
  const defender = war._buildPlayerBattleUnit(SYS, SEC);
  const off = new DirectorOffensive();
  const needed = off.requiredSquadron(tgtOf(SEC)).needed;

  assert(needed > MAX_STRIKE_SIZE,
    `T11 NIEJALOWOSC: needed=${needed} > sufit ${MAX_STRIKE_SIZE} (inaczej clamp niczego nie zmienia)`);

  const clamped = playerVesselsToBattleUnit(
    Array.from({ length: MAX_STRIKE_SIZE }, (_, i) => mkRaider('c' + i)), HULLS, SHIP_MODULES, 'eskadra sufitowa');
  const winners = SEEDS.map(s => resolveBattle(clamped, defender,
    { casusBelli: 'border_incident', location: { systemId: SYS, planetId: SEC, point: null }, seed: s }).winner);
  assert(winners.every(w => w === 'B'),
    `T11: eskadra o rozmiarze sufitu przegrywa z ta obrona na KAZDYM ziarnie (${winners.join('')}) — ` +
    'to jest zmierzony powod, dla ktorego clamp odtwarzalby samobojstwo');
}

// ── T12 — D-199-8: sygnatura + produkcyjny wolacz ───────────────────────────────────────────
console.log('T12 — D-199-8: `_buildPlayerBattleUnit` przyjmuje cialo, a EnemyAttackHandler je PODAJE');
{
  mkAiWorld({ capDef: [{ id: 'defense_grid', level: 1 }], vessels: [] });
  const war = new WarSystem();
  const withBody = war._buildPlayerBattleUnit(SYS, CAP);
  const legacy   = war._buildPlayerBattleUnit(SYS);
  assert((withBody?.hp ?? 0) > 0 && (legacy?.hp ?? 0) > 0,
    'T12 NIEJALOWOSC: obie formy zwracaja jednostke (pin nie mierzy wyjatku)');
  assert(JSON.stringify(withBody) === JSON.stringify(legacy),
    'T12: w COMMICIE 2 cialo jeszcze NIE zmienia zakresu — zgodnosc wsteczna `forceBattle`/' +
    '`_fleetArrived` i keeperow `deploy_seams`/`w2_deploy_model` (zakres wchodzi w commicie 3)');

  // Pin ZRODLOWY (komentarze zdjete): jedyny produkcyjny wolacz podaje drugi argument.
  const eah = readFileSync(new URL('../../systems/EnemyAttackHandler.js', import.meta.url), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert(/_buildPlayerBattleUnit\?\.\(\s*systemId\s*,\s*planetId\s*\)/.test(eah),
    'T12: `EnemyAttackHandler` podaje CIALO do budowniczego obroncy — bez tego commit 3 ' +
    'zmieni sygnature, a jedyna produkcyjna sciezka po cichu zostanie na zakresie ukladu');
}

// ── T13 — sort po `needed` (przygotowanie) ──────────────────────────────────────────────────
console.log('T13 — `pickTarget` sortuje po GRADOWANYM `needed` rosnaco, nie po booleanie');
{
  const src = readFileSync(new URL('../../systems/director/DirectorOffensive.js', import.meta.url), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const sortLine = (src.match(/scored\.sort\([^;]+;/s) ?? [''])[0];
  assert(/needed/.test(sortLine),
    `T13: klucz sortowania odwoluje sie do \`needed\` (jest: ${sortLine.replace(/\s+/g, ' ').slice(0, 120)})`);
  assert(!/Number\(a\.defended\)/.test(sortLine),
    'T13: boolean `defended` NIE jest juz kluczem porzadku — wskazywal cel TRUDNIEJSZY ' +
    '(zmierzone: pod zakresem ciala bool wybiera stolice, needed wybiera slaba kolonie)');
  assert(/localeCompare/.test(sortLine),
    'T13 kontrola pinu: rozstrzygniecie remisu po id ZOSTAJE — inaczej wybor przestalby byc ' +
    'deterministyczny po wczytaniu zapisu');
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// COMMIT 3 — D-199-2 = V4: budynki obronne broniA SWOJEGO CIALA, okrety dalej calego UKLADU.
//
// ⚠ WARIANT V4, NIE V1 — i to jest podpisana decyzja, nie skrot. Przy zakresie ciala TAKZE dla
//   okretow (V1) dwie fregaty stojace w ukladzie warte sa dokladnie ZERO, wiec flota przestaje
//   byc obrona. V4 zachowuje jej sens i przy okazji ROZPUSZCZA dwie decyzje: zakres okretow
//   = zakres `_wreckPlayerVesselsInSystem` (ginie ten, ktory bronil ⇒ D-199-3/Finding 203),
//   a budynki naleza do ciala z konstrukcji, wiec zaden promien nie jest potrzebny (D-199-4).
//
//   T14 SEDNO: siatka obronna STOLICY nie broni juz koloni wtornej
//   T15 stolica broni SIEBIE bez zmian (pin, ze nie oslabilismy obrony w ogole)
//   T16 zakres WRAKOW == zakres OKRETOW (Finding 203 nieosiagalny — D-199-3 rozpuszczona)
//   T17 kill-switch `defenseScope`: para odczytu stanu przeskakuje JAKO PARA
// ════════════════════════════════════════════════════════════════════════════════════════════

const { GAME_CONFIG } = await import('../../config/GameConfig.js');
const { EnemyAttackHandler } = await import('../../systems/EnemyAttackHandler.js');

const CAPDEF = [{ id: 'defense_grid', level: 1 }, { id: 'defense_tower', level: 2 }];

// ── T14 — SEDNO ─────────────────────────────────────────────────────────────────────────────
console.log('T14 — SEDNO: siatka obronna STOLICY nie broni juz koloni wtornej');
{
  mkAiWorld({ capDef: CAPDEF, secDef: [], vessels: [] });
  const war = new WarSystem();
  const atSec = war._buildPlayerBattleUnit(SYS, SEC);
  const capHp = war._buildPlayerBattleUnit(SYS, CAP)?.hp ?? 0;

  assert(capHp >= 180,
    `T14 NIEJALOWOSC: stolica ma REALNA obrone (${capHp} HP) — bez niej „nie przeciekla" ` +
    'byloby prawda trywialnie');
  assert((atSec.hp ?? 0) < capHp,
    `T14: bitwa nad kolonia wtorna wystawia ${atSec.hp} HP, a nie ${capHp} HP ze stolicy`);
  assert(!(atSec.weapons ?? []).some(w => w.damage === 20),
    `T14: bron z budynkow STOLICY (dmg 20) NIE pojawia sie w bitwie o inne cialo ` +
    `(jest: ${JSON.stringify(atSec.weapons)})`);
}

// ── T15 — stolica broni SIEBIE ──────────────────────────────────────────────────────────────
console.log('T15 — stolica DALEJ broni siebie (nie oslabilismy obrony w ogole)');
{
  mkAiWorld({ capDef: CAPDEF, secDef: [], vessels: [] });
  const war = new WarSystem();
  const atCap = war._buildPlayerBattleUnit(SYS, CAP);
  assert((atCap.hp ?? 0) >= 180 && (atCap.weapons ?? []).some(w => w.damage === 20),
    `T15: nad WLASNYM cialem obrona wchodzi w calosci (hp ${atCap.hp}, ${JSON.stringify(atCap.weapons)}) — ` +
    'T14 mierzy PRZYNALEZNOSC obrony, a nie jej skasowanie');

  // Kontrola pinu: bez ciala (forceBattle / _fleetArrived) zakres zostaje UKLADOWY.
  const noBody = war._buildPlayerBattleUnit(SYS);
  assert((noBody.hp ?? 0) >= 180,
    `T15 KONTROLA: wywolanie BEZ ciala dalej sumuje uklad (${noBody.hp} HP) — inaczej ` +
    '`forceBattle` i `_fleetArrived`, ktore ciala nie maja, po cichu stracilyby obronce');
}

// ── T16 — zakres wrakow == zakres okretow ───────────────────────────────────────────────────
console.log('T16 — Finding 203 NIEOSIAGALNY: zakres wrakow == zakres okretow (D-199-3 rozpuszczona)');
{
  const cargo = mkCargo('t16', CAP);                       // statek stoi przy STOLICY
  mkAiWorld({ capDef: CAPDEF, secDef: [], vessels: [cargo] });
  const war = new WarSystem();

  const atSec = war._buildPlayerBattleUnit(SYS, SEC);
  assert((atSec.hp ?? 0) >= 30,
    `T16 NIEJALOWOSC: statek przy stolicy WCHODZI do bitwy o kolonie wtorna (${atSec.hp} HP) — ` +
    'to jest wlasnie roznica V4 wobec V1, w ktorym bylby wart zero');

  const eah = new EnemyAttackHandler();
  eah._wreckPlayerVesselsInSystem(SYS, 40);
  assert(cargo.isWreck === true,
    'T16: i ten sam statek ginie przy upadku ukladu — obrona i strata maja TEN SAM zakres, ' +
    'wiec nie ma stanu „nie bronil, a zginal" (Finding 203)');
}

// ── T17 — kill-switch ───────────────────────────────────────────────────────────────────────
console.log('T17 — kill-switch `defenseScope`: para odczytu stanu przeskakuje JAKO PARA');
{
  // ⚠ ODCZYT MUSI BYC CZWORKA, NIE PARA — i to jest ustalenie z WYKONANIA, nie ostroznosc.
  //   Plan przewidywal pare `[hp, needed]` czytana na koloni WTORNEJ i to bylo BLEDNE:
  //   dwie polowy tej flagi objawiaja sie na ROZNYCH celach.
  //     • polowa ZAKRESU widac na koloni wtornej   — hp 30 (ON) vs 210 (OFF);
  //     • polowa KOMPETENCJI widac na STOLICY      — needed 3 (ON) vs 2 (OFF, boolean).
  //   Na wtornej `needed` NIE drgnie (bool „niebroniona" = 1, gradowanie z 30 HP = 1), bo
  //   „kolonia bez wlasnej obrony wyglada na bezbronna" to jest DOKLADNIE Finding 199.
  const readQuad = () => {
    mkAiWorld({ capDef: CAPDEF, secDef: [], vessels: [mkCargo('t17', CAP)] });
    const war = new WarSystem();
    const off = new DirectorOffensive();
    return [
      war._buildPlayerBattleUnit(SYS, SEC)?.hp ?? 0, off.requiredSquadron(tgtOf(SEC)).needed,
      war._buildPlayerBattleUnit(SYS, CAP)?.hp ?? 0, off.requiredSquadron(tgtOf(CAP)).needed,
    ];
  };

  const before = GAME_CONFIG.FEATURES.defenseScope;
  GAME_CONFIG.FEATURES.defenseScope = true;
  const on = readQuad();
  GAME_CONFIG.FEATURES.defenseScope = false;
  const off = readQuad();
  GAME_CONFIG.FEATURES.defenseScope = before;

  assert(on[0] !== off[0],
    `T17 ZAKRES: obrona koloni wtornej wraca do ukladowej (ON ${on[0]} HP / OFF ${off[0]} HP)`);
  assert(on[3] !== off[3],
    `T17 KOMPETENCJA: prog eskadry na stolicy wraca do booleana (ON ${on[3]} / OFF ${off[3]})`);
  assert(off[3] === SQUADRON_VS_DEFENDED && off[0] === off[2],
    `T17: OFF to zachowanie SPRZED slice'u bit w bit — kazde cialo w ukladzie ma TEGO SAMEGO ` +
    `obronce (${off[0]} = ${off[2]} HP), a prog to stala ${off[3]} (= SQUADRON_VS_DEFENDED)`);
  assert(on[1] === off[1],
    `T17 KONTROLA PINU: na koloni wtornej \`needed\` sie NIE zmienia (${on[1]} = ${off[1]}) — ` +
    'to nie jest luka, tylko sam Finding 199: boolean nie widzial tam obrony, a gradowanie ' +
    'przy 30 HP tez zada jednego okretu. Polowy flagi widac na ROZNYCH celach');
  assert(GAME_CONFIG.FEATURES.defenseScope === before,
    'T17 higiena: flaga przywrocona do stanu wyjsciowego (inaczej kolejne suity w sweepie ' +
    'dziedziczylyby stan tego pinu)');
}

// ── T18 — WYPLATA slice'u: AI omija twierdze i idzie w slabe cialo ──────────────────────────
// ⚠ TEN PIN POWSTAL Z AWARII WLASNYCH FIXTUREOW T9/T10. Po wejsciu zakresu ciala oba zaczely
//   przechodzic „nie ta sciezka": AI przestalo odmawiac, bo `pickTarget` znajdowalo DRUGIE,
//   nieufortyfikowane cialo i tam szlo. To nie byl defekt — to jest dokladnie zachowanie,
//   po ktore ten slice powstal, wiec zostaje zapinowane WPROST, a nie tylko w komentarzu.
console.log('T18 — WYPLATA: AI wybiera cialo TANSZE do wziecia, a nie „pierwsze z brzegu"');
{
  mkAiWorld({
    capDef: [{ id: 'defense_grid', level: 3 }, { id: 'defense_tower', level: 5 }],   // twierdza
    secDef: [],                                                                       // slabe cialo
    vessels: [],
  });
  const off = new DirectorOffensive();
  const nCap = off.requiredSquadron(tgtOf(CAP)).needed;
  const nSec = off.requiredSquadron(tgtOf(SEC)).needed;
  assert(nCap > nSec,
    `T18 NIEJALOWOSC: ciala RZECZYWISCIE roznia sie kosztem (stolica ${nCap} vs wtorna ${nSec}) — ` +
    'pod zakresem ukladu bylyby identyczne i pin nie mialby o czym mowic');

  const pick = off.pickTarget('emp_001');
  assert(pick?.body?.id === SEC,
    `T18: regula celuje w cialo TANSZE (${pick?.body?.name}) — do 199 sortowal boolean, ` +
    'ktory przy jednakowym `defended` spadal na identyfikator i potrafil wskazac twierdze');
}

console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} — ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
