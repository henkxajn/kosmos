// Finding 130 — keeper: MISJA RAJDERA AI PRZEZYWA STARCIE, TAK JAK MISJA GRACZA.
// Plan + podpisane decyzje D-130-1..4 (W1): docs/design/AI_COMBAT_MISSION_PLAN.md.
//
// PO CO: `DeepSpaceCombatSystem.startEngagement` traktowal obie strony ASYMETRYCZNIE —
//   for (const v of sideBVessels) this._freezeAsStationary(v, dominantDocked);  // AI: mission = null
//   if (ownerA === 'player') this._pausePlayerSideForCombat(sideAVessels, ...);  // gracz: migawka
// Strona B dostawala `mission = null` BEZ migawki i BEZ wznowienia. Dwie szkody:
//   1. `EnemyAttackHandler:42` bramkuje na `mission.type === 'attack'`, wiec przechwycenie
//      w glebokiej przestrzeni PO CICHU KASOWALO cale uderzenie AI.
//   2. `DirectorOffensive.strikeReadyVessels:82` ma `if (v.mission) continue` — zerowanie misji
//      WPISYWALO rajdera z powrotem do puli uderzeniowej w tej samej chwili.
//
// ⚠ TO NIE BYL BRAK MECHANIZMU, TYLKO ASYMETRIA. Migawka/wznowienie istnialy od `046976d`,
//   ale wylacznie dla gracza (`m4PlayerCombatMissionPause`). D-130-1 uogolnia te sciezke.
//
// ⚠ ODWROCENIE PINU W T2 (Z2, 2026-08-31) — SWIADOME. Kontrola pinu brzmiala „z wyzerowana
//   misja rajder BYL w puli W TRAKCIE WALKI". Z2 (`ai_strike_recall_smoke` T3) celowo to
//   ZAMKNAL: pula uderzeniowa wyklucza teraz statek w aktywnym starciu, bo inaczej Director
//   moglby wyslac na nowe uderzenie okret, ktory wlasnie sie bije — a nowy rozkaz ruchu
//   wyprowadzilby go z babla starcia i `DSCS._handleCombatRangeExit` policzylby strone AI jako
//   UCIEKAJACA (darmowe zwyciestwo gracza). INTENCJA oryginalu — „to misja, a nie przypadek,
//   trzyma rajdera poza pula" — zostala: mierzymy ja teraz PO domknieciu starcia.
//
// ⚠ GRANICA SLICE'U — T4 PINUJE JA WPROST. `EnemyAttackHandler:245` (dokowanie rajdera przy
//   planecie GRACZA po wygranej + drugie bezwarunkowe zerowanie misji) jest NIETKNIETY. Z2
//   („rajder parkuje w ukladzie gracza") ZOSTAJE OTWARTY. Zielony keeper NIE znaczy, ze Z2
//   zamkniete — pelna anatomia w planie §3.
//
// ⚠ KEEPER WYKONANIOWY na PRAWDZIWYCH systemach (VesselManager + MovementOrderSystem +
//   DirectorOffensive + DSCS importuja sie headless — zweryfikowane).
//
//   T1  symetria: obie strony dostaja migawke i obie wznawiaja (fail-first: AI nie dostaje)
//   T2  RDZEN ZWIAZKU Z Z2: rajder ze wznowiona misja NIE wraca do puli uderzeniowej
//   T3  warstwa ORDER przejela w trakcie walki → migawka porzucona, bez wyscigu
//   T4  PIN GRANICY: EnemyAttackHandler nietkniety ⇒ Z2 dalej otwarty
//   T5  kill-switch `m4EnemyCombatMissionPause` OFF → zachowanie sprzed naprawy, bit w bit

import '../headless/env.js';           // MUSI byc pierwszy
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { DirectorOffensive } from '../../systems/director/DirectorOffensive.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const EMP = 'emp_001';

// Ksztalt WZIETY Z PRODUKCJI, nie wymyslony: `modules` to tablica ID (string[]) — `hasWeapons`
// czyta `SHIP_MODULES[modId]`. Pierwsza wersja sondy dala tu obiekty i statki po cichu wypadly
// z walki jako „unarmed"; zlapal to dopiero `KOSMOS.debug.combatTrace`.
// ⚠ `missionLog: []` jest OBOWIAZKOWE — prawdziwe `_resumeMissionAfterOrder` woła `addMissionLog`.
//   Bez tego pola keeper wywracal sie na TypeError, czyli fixture znowu nie modelowal produkcji.
const mkV = (id, enemy, mission) => ({
  id, name: id,
  ownerEmpireId: enemy ? EMP : undefined,
  owner: enemy ? EMP : 'player',
  isWreck: false, systemId: 'sys_home', serviceState: 'active', status: 'on_mission',
  hp: 100, maxHp: 100, shield: 0, armor: 0, speedAU: 1.0,
  warpFuel: { current: 5, max: 10 }, fuel: { current: 5, max: 10 },
  modules: ['weapon_laser'],
  mission, missionLog: [],
  position: { state: 'in_transit', dockedAt: null, x: 1, y: 1 },
});

const mkMission = (type, targetId) => ({
  type, targetId, phase: 'in_system',
  startX: 0, startY: 0, targetX: 50, targetY: 50,
  departYear: 0, arrivalYear: 10,
});

/** Swiat gry: prawdziwe VM-podobne repo + PRAWDZIWY MovementOrderSystem. */
function mkWorld({ enemyFlag = true } = {}) {
  GAME_CONFIG.FEATURES.m4PlayerCombatMissionPause = true;
  GAME_CONFIG.FEATURES.m4EnemyCombatMissionPause  = enemyFlag;

  const raider = mkV('v_ai', true,  mkMission('attack', 'p_home'));
  const mine   = mkV('v_me', false, mkMission('recon',  'p_far'));
  const vessels = new Map([[raider.id, raider], [mine.id, mine]]);

  // Cel misji musi ISTNIEC, inaczej `_resumeMissionAfterOrder` porzuca misje (target lost).
  const bodies = new Map([
    ['p_home', { id: 'p_home', name: 'Dom',  systemId: 'sys_home', x: 50, y: 50 }],
    ['p_far',  { id: 'p_far',  name: 'Daleka', systemId: 'sys_home', x: 80, y: 80 }],
  ]);

  const vm = {
    _vessels: vessels,
    getVessel: (id) => vessels.get(id),
    getAllVessels: () => [...vessels.values()],
    _findEntity: (id) => bodies.get(id) ?? null,
    _predictPosition: (id) => bodies.get(id) ?? null,
    _calcRoute: () => ({ waypoints: [] }),
    isImmobilized: () => false,
  };
  // Wznowienie bierzemy PRAWDZIWE (VesselManager.prototype) — to ono jest kontraktem.
  vm._resumeMissionAfterOrder = VMProto._resumeMissionAfterOrder.bind(vm);

  window.KOSMOS = { vesselManager: vm, empireRegistry: { get: () => ({ id: EMP }), listAll: () => [{ id: EMP }] } };
  const mos = new MovementOrderSystem(vm);
  window.KOSMOS.movementOrderSystem = mos;

  const dscs = new DeepSpaceCombatSystem(vm);
  window.KOSMOS.deepSpaceCombatSystem = dscs;
  return { raider, mine, vm, mos, dscs, off: new DirectorOffensive() };
}

// Prototyp VesselManagera — bierzemy prawdziwe `_resumeMissionAfterOrder` bez konstruowania
// calego systemu (konstruktor rejestruje ~20 subskrypcji EventBus, ktore tu tylko szumia).
const { VesselManager } = await import('../../systems/VesselManager.js');
const VMProto = VesselManager.prototype;

/** Wywolanie rozstrzygniecia po bitwie. Istnienie funkcji jest ASERCJA (fail-first: brak),
 *  a nie cichym `?.` — inaczej po naprawie literowka w nazwie dalaby zielony, jalowy przebieg. */
function resolvePost(w, enc, battleId = 'b1') {
  const fn = w.dscs._resolveMissionsPostBattle;
  assert(typeof fn === 'function',
    'PRE: `_resolveMissionsPostBattle` istnieje (D-130-1 — uogolniona sciezka obu stron)');
  if (typeof fn === 'function') fn.call(w.dscs, enc, battleId);
}

/** Rozegraj starcie do konca i zwroc stan obu statkow. */
function engageAndResolve(w) {
  const enc = w.dscs.startEngagement(w.mine.id, w.raider.id);
  const afterEngage = {
    raiderMission: w.raider.mission?.type ?? null,
    raiderSnap:    w.raider._suspendedMission?.type ?? null,
    mineSnap:      w.mine._suspendedMission?.type ?? null,
  };
  return { enc, afterEngage };
}

// ── T1 — symetria migawki ───────────────────────────────────────────────────
console.log('T1 — obie strony dostaja migawke misji przy zaangazowaniu');
{
  const w = mkWorld();
  const { enc, afterEngage } = engageAndResolve(w);
  assert(!!enc, 'T1: starcie realnie powstalo (warunek nie-jalowosci)');
  assert(afterEngage.raiderMission === null, 'T1: misja rajdera zdjeta na czas walki (jak u gracza)');
  assert(afterEngage.mineSnap === 'recon',   'T1 kontrola pinu: gracz ma migawke (dzialalo juz przed naprawa)');
  assert(afterEngage.raiderSnap === 'attack','T1: RAJDER TEZ ma migawke (rdzen 130; fail-first: BRAK)');
}

// ── T2 — RDZEN ZWIAZKU Z Z2 ─────────────────────────────────────────────────
console.log('T2 — wznowiona misja trzyma rajdera POZA pula uderzeniowa');
{
  const w = mkWorld();
  assert(w.off.strikeReadyVessels(EMP).length === 0,
    'T2 kontrola pinu: przed walka rajder ma misje → poza pula');

  w.dscs.startEngagement(w.mine.id, w.raider.id);
  const enc = [...w.dscs._activeEncounters.values()][0];
  assert(!!enc, 'T2 kontrola pinu: encounter realnie istnieje (inaczej reszta T2 byla by jalowa)');
  resolvePost(w, enc);

  // ⚠ Z2 — DOMKNIECIE STARCIA JEST WYMOGIEM POMIARU, nie kosmetyka. Pula wyklucza teraz takze
  //   statek W TRWAJACYM starciu (`ai_strike_recall_smoke` T3), wiec bez tej linii ponizsze
  //   asercje mierzylyby filtr Z2 zamiast wznowionej misji z F130 — czyli przechodzilyby
  //   z NIEWLASCIWEGO powodu.
  enc.isActive = false;

  const restored = w.raider.mission?.type ?? null;
  const inPoolAfter = w.off.strikeReadyVessels(EMP).map(v => v.id);
  assert(restored === 'attack', 'T2: misja rajdera WZNOWIONA po bitwie');
  assert(!inPoolAfter.includes('v_ai'),
    'T2: rajder ze wznowiona misja NIE wraca do puli uderzeniowej (lagodzi Z2)');

  // Kontrola pinu — INTENCJA ORYGINALU zachowana na innym nosniku: to MISJA trzyma rajdera
  // poza pula. Mierzymy ja PO starciu, bo „w trakcie" przestalo byc prawda (patrz naglowek).
  w.raider.mission = null;
  assert(w.off.strikeReadyVessels(EMP).map(v => v.id).includes('v_ai'),
    'T2 kontrola pinu: z WYZEROWANA misja rajder JEST w puli — to jest mechanizm, nie domysl');
}

// ── T3 — warstwa ORDER przejela ─────────────────────────────────────────────
console.log('T3 — gdy warstwa rozkazow przejela sterowanie, migawka jest porzucana');
{
  const w = mkWorld();
  w.dscs.startEngagement(w.mine.id, w.raider.id);
  // ⚠ WARUNEK NIE-JALOWOSCI: bez tej asercji T3 przechodzil na NIENAPRAWIONYM kodzie, bo
  //   „migawka porzucona" jest trywialnie prawdziwe, gdy migawki nigdy nie bylo.
  assert(w.raider._suspendedMission?.type === 'attack',
    'T3 kontrola pinu: rajder NAJPIERW ma migawke (inaczej reszta T3 jest jalowa)');
  // Symuluj: cos wydalo rajderowi nowa misje w trakcie walki (np. odwrot AutoRetreatSystem).
  w.raider.mission = mkMission('move_to_point', 'p_far');
  const enc3 = [...w.dscs._activeEncounters.values()][0];
  resolvePost(w, enc3);
  assert(w.raider.mission?.type === 'move_to_point',
    'T3: sterowanie zostaje przy warstwie order (bez wyscigu o misje)');
  assert(w.raider._suspendedMission === undefined,
    'T3: migawka porzucona, nie osierocona');
}

// ── T4 — PIN GRANICY SLICE'U (Z2 dalej otwarty) ─────────────────────────────
console.log('T4 — PIN GRANICY: EnemyAttackHandler NIETKNIETY, Z2 zostaje otwarty');
{
  const src = readFileSync(new URL('../../systems/EnemyAttackHandler.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert(/v\.position\.dockedAt\s*=\s*planetId/.test(src),
    'T4: EAH nadal DOKUJE rajdera przy planecie gracza po wygranej — Z2 NIE jest zamkniety tym slicem');
  assert(/v\.mission\s*=\s*null/.test(src),
    'T4: EAH nadal zeruje misje bezwarunkowo (drugi producent parkowania, plan §3)');
  assert(!/_suspendMissionIfAny/.test(src),
    'T4: EAH swiadomie NIE dostal migawki — to osobny slice „AI wraca po ataku"');
}

// ── T5 — kill-switch ────────────────────────────────────────────────────────
console.log('T5 — `m4EnemyCombatMissionPause` OFF przywraca zachowanie sprzed naprawy');
{
  const w = mkWorld({ enemyFlag: false });
  w.dscs.startEngagement(w.mine.id, w.raider.id);
  assert(w.raider.mission === null && w.raider._suspendedMission === undefined,
    'T5: przy OFF rajder traci misje bez migawki (dokladnie stan sprzed naprawy)');
  assert(w.mine._suspendedMission?.type === 'recon',
    'T5 kontrola pinu: flaga AI NIE dotyka sciezki gracza');
}

console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} — ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
