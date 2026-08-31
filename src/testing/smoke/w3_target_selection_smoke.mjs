// W3 — keeper reguły wyboru celu (commit W3-5, WOJNA I POKÓJ 1.0, workstream B).
//
// PO CO: to jest commit, w którym AI po raz pierwszy w historii tej gry wybiera cel SAMO.
// Wszystko poniżej pinuje własności, których brak byłby NIEWIDOCZNY w grze aż do momentu,
// w którym zrobiłby szkodę — każda z nich jest kupiona konkretnym błędem z tego arca.
//
//   T1  reguła jest w katalogu i przechodzi walidator; `delay: 0` W CAŁYM katalogu
//       (uśpiony crash `_firePending` zostaje uśpiony — §Findings 26 / `w2_ai_mobilization` T4)
//   T2  ⚠ SÓL GALAKTYKI: dwie galaktyki dają RÓŻNE rzuty tej reguły, a wszystkie POZOSTAŁE
//       reguły mają rzuty BIT W BIT te same (sól jest opt-in, nie globalna) — instrument,
//       którego zabrakło przy pierwszym kontakcie (§Findings 24)
//   T3  ZASIĘG: celem jest wyłącznie kolonia gracza w przestrzeni roszczonej albo w powłoce
//       granicznej imperium (§Findings 27 — transport dałby skok przez pół galaktyki)
//   T4  ⚠ ESKADRA: przeciw celowi BRONIONEMU reguła wysyła tyle, ile trzeba, albo NIC
//       (`insufficient_squadron`); przeciw słabo bronionemu wystarcza jeden
//       (§Findings 34 — zmierzone dwa razy na GATE 2)
//
// ⚠ T4 ZOSTAŁ ŚWIADOMIE ODWRÓCONY 2026-08-31 (slice DEFENSE_SCOPE, commit 2, D-199-1).
//   Poprzednia wersja pinowała `r1.needed === SQUADRON_VS_DEFENDED`, czyli **stały próg 2 dla
//   czegokolwiek bronionego** — a to jest dokładnie ta gruba reguła, którą Finding 199 każe
//   zastąpić. Boolean nie odróżniał wieży Lv1 od pełnej siatki orbitalnej, więc AI albo szło
//   za słabo (samobójstwo), albo wymagało eskadry tam, gdzie starczał jeden okręt.
//   INTENCJA oryginału („samotny rajder nie ma prawa skruszyć bronionego celu, dwa mają")
//   jest ZACHOWANA i pinowana dalej — zmienia się wyłącznie ŹRÓDŁO liczby: teraz pochodzi
//   z jednostki, którą bitwa naprawdę zbuduje (`requiredSquadron`), a nie ze stałej.
//   Stałe `SQUADRON_VS_DEFENDED`/`SQUADRON_VS_UNDEFENDED` USUNIĘTE — nie miały już czytelnika
//   w produkcji, a martwy knob to knob, który kłamie.
//   T5  DOBÓR OKRĘTÓW po WŁASNOŚCI `warpFuel.max > 0`, nigdy po id szablonu (D4); rezerwa,
//       kurier i okręt pod rozkazem są pomijane
//   T6  guardy naprawdę bramkują (wojna + posiadanie okrętu zdolnego do skoku)
//   T7  akcja NIGDY nie rzuca — odmowa jest WYNIKIEM (`_firePending` biegnie poza try/catch,
//       więc wyjątek zabiłby tik każdego imperium ustawionego po nas)
//   T8  uderzenie idzie przez `OrderService.issueAttack` (composite), a nie ręcznie sklejoną misję
//
// ⚠ Harness nie montuje MOS/OrderService/InfluenceMap — stawiamy je ręcznie.

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from './../headless/GameCore.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { createVessel } from '../../entities/Vessel.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { OrderService } from '../../systems/OrderService.js';
import { DirectorOffensive, registerOffensiveBehaviors,
         MAX_STRIKE_SIZE } from '../../systems/director/DirectorOffensive.js';
import { DIRECTOR_RULES } from '../../data/DirectorRuleData.js';
import { rollFires } from '../../utils/DirectorRuleMath.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const RAIDER = ['engine_warp', 'warp_tank', 'armor_heavy', 'weapon_laser'];
const DEFENDER = ['engine_ion', 'armor_standard', 'weapon_kinetic'];   // bez baku warp

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  window.KOSMOS.movementOrderSystem = new MovementOrderSystem(core.vesselManager);
  window.KOSMOS.orderService = new OrderService();
  const off = new DirectorOffensive();
  registerOffensiveBehaviors(off, { allowOverride: true });
  const empireId = core.empireRegistry.listAll()[0]?.id;
  const cap = core.colonyManager.getAllColonies().find(c => c.ownerEmpireId === empireId) ?? null;
  window.KOSMOS.directorProduction = { capitalOf: () => cap };
  return { core, off, empireId, cap };
}

/** Mapa wpływów jako ATRAPA o jawnym kontrakcie — harness nie montuje prawdziwej. */
function stubInfluence({ claimed = [], border = [] } = {}) {
  window.KOSMOS.influenceMap = {
    isClaimedBy:    (sysId) => claimed.includes(sysId),
    isInBorderZone: (sysId) => border.includes(sysId),
  };
}

function spawnAiHull(core, empireId, body, { modules = RAIDER, name = 'Rajder' } = {}) {
  const v = createVessel('hull_frigate', body.id, {
    name, modules: [...modules], x: body.x ?? 0, y: body.y ?? 0, systemId: body.systemId,
  });
  v.ownerEmpireId = empireId; v.owner = empireId; v.isEnemy = true;
  v.position.state = 'orbiting'; v.position.dockedAt = body.id;
  v.mission = null; v.movementOrder = null;
  core.vesselManager._vessels.set(v.id, v);
  return v;
}

// ── T1 — katalog + delay:0 ──────────────────────────────────────────────────
console.log('T1 — reguła w katalogu, `delay: 0` w CAŁYM katalogu');
{
  const rule = DIRECTOR_RULES.strike_player_target;
  assert(!!rule, 'T1: reguła `strike_player_target` istnieje w katalogu produkcyjnym');
  assert(rule?.trigger?.probe === 'reachablePlayerTargets' && rule?.trigger?.gte === 1,
    'T1: trigger to OBECNOŚĆ CELU W ZASIĘGU (nie siła, nie licznik lat)');
  assert(Array.isArray(rule?.guard) && rule.guard.includes('empireAtWarWithPlayer'),
    'T1: wojna jest WARUNKIEM WSTĘPNYM — AI nie wybiera celu w czasie pokoju (korekta C-4)');
  assert(rule?.response?.action === 'launchStrike', 'T1: odpowiedź to własna akcja, nie doktryna');

  // ⚠ Pin KATALOGOWY, nie regułowy: `_firePending` dereferencuje `null`, który zostawia
  //   `gameState.set(key, null)`, POZA oboma try/catch. Jedna reguła z `delay > 0` zabiłaby
  //   tik wszystkich kolejnych imperiów.
  const bad = Object.values(DIRECTOR_RULES).filter(r => (r?.delay ?? 0) !== 0).map(r => r.id);
  assert(bad.length === 0,
    `T1 SEDNO: KAŻDA reguła katalogu ma \`delay: 0\` (${Object.keys(DIRECTOR_RULES).length} reguł). ` +
    `Z opóźnieniem: ${bad.join(', ') || '—'}`);
}

// ── T2 — sól galaktyki (opt-in) ─────────────────────────────────────────────
console.log('T2 — ⚠ dwie galaktyki = różne rzuty TEJ reguły, reszta katalogu bit w bit');
{
  const cfg = DIRECTOR_RULES.strike_player_target.roll;
  assert(cfg?.saltGalaxySeed === true, 'T2: reguła PROSI o sól galaktyki (opt-in w danych)');

  // Ten sam (reguła, imperium, próba), dwa różne ziarna galaktyki → sekwencje MUSZĄ się różnić.
  const seqFor = (salt) => Array.from({ length: 40 }, (_, i) =>
    rollFires('strike_player_target', 'emp_001', i + 1, cfg, 1, salt) ? '1' : '0').join('');
  const a = seqFor('-1652911923');
  const b = seqFor('131797258');
  assert(a !== b,
    `T2 SEDNO: sekwencje rzutów RÓŻNE (${a.slice(0, 12)}… vs ${b.slice(0, 12)}…) — bez soli KAŻDA ` +
    'partia odpalałaby pierwsze uderzenie w tym samym roku, dokładnie jak zsynchronizowany ' +
    'pierwszy kontakt');

  // ⚠ KONTROLA PINU: sól jest OPT-IN. Reguły bez `saltGalaxySeed` muszą dawać TĘ SAMĄ sekwencję
  //   co przed W3-5 — inaczej dosypalibyśmy zmianę balansu (inne lata pierwszego kontaktu,
  //   nacisku, mobilizacji) do slice'u o czym innym.
  const mob = DIRECTOR_RULES.mobilize_reserve.roll;
  const noSalt = Array.from({ length: 40 }, (_, i) =>
    rollFires('mobilize_reserve', 'emp_001', i + 1, mob, 1) ? '1' : '0').join('');
  const emptySalt = Array.from({ length: 40 }, (_, i) =>
    rollFires('mobilize_reserve', 'emp_001', i + 1, mob, 1, '') ? '1' : '0').join('');
  assert(noSalt === emptySalt,
    'T2 KONTROLA PINU: reguła BEZ soli daje sekwencję identyczną z wywołaniem sprzed W3-5 ' +
    '(domyślna sól pusta) — żadna istniejąca reguła nie drgnęła');
  assert(Object.values(DIRECTOR_RULES).filter(r => r.roll?.saltGalaxySeed).length === 1,
    'T2: dokładnie JEDNA reguła prosi dziś o sól — dosypywanie jej hurtem to osobna decyzja');
}

// ── T3 — zasięg z InfluenceMap ──────────────────────────────────────────────
console.log('T3 — cel MUSI leżeć w przestrzeni roszczonej albo w powłoce granicznej');
{
  const { off, empireId } = boot();
  const home = window.KOSMOS.homePlanet;

  stubInfluence({ claimed: [], border: [] });
  assert(off.countReachableTargets(empireId) === 0,
    'T3: poza zasięgiem — ZERO celów, choć kolonia gracza istnieje (granicę stawia REGUŁA)');

  stubInfluence({ border: [home.systemId] });
  const targets = off.reachableTargets(empireId);
  assert(targets.length === 1 && targets[0].body.id === home.id,
    `T3 SEDNO: kolonia gracza w powłoce granicznej JEST celem (${targets.length}) — bijemy w to, ` +
    'co sąsiaduje z naszą przestrzenią, a nie w to, dokąd dolatuje bak');

  stubInfluence({ claimed: [home.systemId] });
  assert(off.countReachableTargets(empireId) === 1,
    'T3: przestrzeń roszczona też się liczy (dwa źródła zasięgu, jedna reguła)');
}

// ── T4 — eskadra przeciw obronie ────────────────────────────────────────────
console.log('T4 — ⚠ przeciw celowi BRONIONEMU: eskadra albo nic');
{
  const { core, off, empireId, cap } = boot();
  const home = window.KOSMOS.homePlanet;
  const capBody = EntityManager.get(cap.planetId);
  stubInfluence({ border: [home.systemId] });
  window.KOSMOS.diplomacySystem?.declareWar?.(empireId, 'w3_5_probe');

  // Cel BRONIONY — wieża obronna Lv3 (120 HP) w kolonii gracza. ⚠ Poziom dobrany tak, żeby
  // GRADOWANY próg wynosił 2 przy kadłubach `hull_frigate` (120 HP): ceil(120·1.5/120) = 2.
  const defActives = core.colonyManager.getColony(home.id)?.buildingSystem?._active;
  defActives?.set('def_probe', { building: { id: 'defense_tower' }, level: 3, jobs: 0 });
  const target = off.pickTarget(empireId);
  assert(target?.defended === true, 'T4: reguła WIDZI obronę planetarną celu');

  // Jeden rajder — za mało.
  const v1 = spawnAiHull(core, empireId, capBody, { name: 'Samotny' });
  const r1 = off.launchStrike({ empireId, year: 10 });
  assert(r1?.launched === 0 && r1?.reason === 'insufficient_squadron',
    `T4 SEDNO: jeden okręt na broniony cel = ODMOWA (\`${r1?.reason}\`, potrzeba ${r1?.needed}). ` +
    'Zmierzone dwa razy na GATE 2: samotny rajder oddaje graczowi darmowe zwycięstwo ' +
    'i 3,6 własnego wyczerpania za każdym razem');
  assert(!v1.mission && !v1.movementOrder, 'T4: odmowa NIE rusza okrętu (nie ma półśrodków)');
  assert(r1?.needed === 2 && r1?.needed <= MAX_STRIKE_SIZE,
    `T4: próg eskadry (${r1?.needed}) pochodzi z GRADOWANIA — z jednostki, którą bitwa naprawdę ` +
    'zbuduje (`requiredSquadron`), a nie ze stałej „2 na cokolwiek bronionego" (D-199-1)');
  assert((r1?.defenderHp ?? 0) > 0,
    `T4: odmowa niesie ZMIERZONĄ siłę obrońcy (${r1?.defenderHp} HP) — bez tej liczby ` +
    'powód „za mała eskadra" jest nieweryfikowalny');

  // Drugi rajder — eskadra kompletna.
  spawnAiHull(core, empireId, capBody, { name: 'Skrzydłowy' });
  const r2 = off.launchStrike({ empireId, year: 12 });
  assert(r2?.launched >= 2,
    `T4 SEDNO: przy dwóch okrętach uderzenie RUSZA (${r2?.launched}) — to jest cała różnica ` +
    'między karmieniem gracza a realnym zagrożeniem');
  assert(r2?.targetSystemId === home.systemId, 'T4: i celuje w układ gracza');

  // ⚠ KONTROLA ODWRÓCENIA (D-199-1): SŁABSZA obrona wymaga MNIEJ okrętów. Stary boolean
  //   odpowiadał „2" na jedno i drugie — i to jest dokładnie ta ślepota, którą 199 zamyka.
  defActives?.set('def_probe', { building: { id: 'defense_tower' }, level: 1, jobs: 0 });
  const weak = off.pickTarget(empireId);
  const sqWeak = off.requiredSquadron(weak, off.strikeReadyVessels(empireId));
  assert(weak?.defended === true && sqWeak.needed < 2,
    `T4 KONTROLA: cel DALEJ jest „broniony" (bool ${weak?.defended}), ale gradowanie widzi, ` +
    `że starczy ${sqWeak.needed} okręt(y) przy ${sqWeak.defenderHp} HP obrony — boolean by tego nie odróżnił`);
}

// ── T5 — dobór okrętów po WŁASNOŚCI ─────────────────────────────────────────
console.log('T5 — dobór po `warpFuel.max > 0`, nie po id szablonu (D4)');
{
  const { core, off, empireId, cap } = boot();
  const capBody = EntityManager.get(cap.planetId);

  const raider = spawnAiHull(core, empireId, capBody, { name: 'Z bakiem' });
  const sysDef = spawnAiHull(core, empireId, capBody, { modules: DEFENDER, name: 'Bez baku' });
  const stored = spawnAiHull(core, empireId, capBody, { name: 'W rezerwie' });
  stored.serviceState = 'stored';
  const busy = spawnAiHull(core, empireId, capBody, { name: 'Zajęty' });
  busy.mission = { type: 'attack', targetId: 'x' };

  const ready = off.strikeReadyVessels(empireId).map(v => v.name);
  assert(ready.length === 1 && ready[0] === 'Z bakiem',
    `T5 SEDNO: do uderzenia kwalifikuje się TYLKO kadłub z bakiem warp (${ready.join(', ') || '—'}). ` +
    `Odpadły: bez baku (${sysDef.warpFuel?.max}), rezerwa, zajęty — każdy z INNEGO powodu`);
  assert(raider.warpFuel?.max > 0 && sysDef.warpFuel?.max === 0,
    'T5 KONTROLA PINU: różnica jest REALNA (5 vs 0), a nie wymyślona przez filtr');
}

// ── T6 — guardy naprawdę bramkują ───────────────────────────────────────────
console.log('T6 — guardy: wojna + posiadanie okrętu zdolnego do skoku');
{
  const { core, off, empireId, cap } = boot();
  const capBody = EntityManager.get(cap.planetId);
  const { DirectorGuards } = await import('../../systems/director/DirectorRegistry.js');

  const atWar = DirectorGuards.resolve('empireAtWarWithPlayer');
  const hasForce = DirectorGuards.resolve('empireHasStrikeForce');
  assert(typeof atWar === 'function' && typeof hasForce === 'function',
    'T6: oba guardy zarejestrowane pod nazwami z katalogu (inaczej DirectorSystem RZUCA przy starcie)');

  assert(atWar({ empireId }) === false, 'T6: bez wojny guard mówi NIE…');
  window.KOSMOS.diplomacySystem?.declareWar?.(empireId, 'w3_5_probe');
  assert(atWar({ empireId }) === true, 'T6: …a po wypowiedzeniu wojny TAK');

  assert(hasForce({ empireId }) === false, 'T6: bez okrętu zdolnego do skoku guard mówi NIE…');
  spawnAiHull(core, empireId, capBody, { name: 'Rajder' });
  assert(hasForce({ empireId }) === true, 'T6: …a z okrętem TAK');
}

// ── T7 — akcja nigdy nie rzuca ──────────────────────────────────────────────
console.log('T7 — odmowa jest WYNIKIEM, nie wyjątkiem (tik innych imperiów przeżywa)');
{
  const { off, empireId } = boot();
  stubInfluence({ claimed: [], border: [] });

  let threw = false, res = null;
  try { res = off.launchStrike({ empireId, year: 5 }); } catch (_) { threw = true; }
  assert(!threw && res?.launched === 0 && res?.reason === 'no_target_in_reach',
    `T7: brak celu → \`${res?.reason}\`, bez wyjątku`);

  // Kolaborator wywrócony celowo — akcja ma to PRZEŻYĆ, bo `_firePending` biegnie poza try/catch.
  window.KOSMOS.influenceMap = { isClaimedBy: () => { throw new Error('boom'); },
                                 isInBorderZone: () => false };
  let threw2 = false, res2 = null;
  try { res2 = off.launchStrike({ empireId, year: 6 }); } catch (_) { threw2 = true; }
  assert(!threw2 && res2?.launched === 0,
    'T7 SEDNO: nawet gdy kolaborator RZUCA, akcja zwraca wynik. Wyjątek stąd zabiłby tik ' +
    'każdego imperium ustawionego po nas w pętli — razem z jego EconAI i MilitaryAI');
}

// ── T8 — uderzenie idzie przez OrderService ─────────────────────────────────
console.log('T8 — rozkaz przez `OrderService.issueAttack` (composite), nie ręczna misja');
{
  const { core, off, empireId, cap } = boot();
  const home = window.KOSMOS.homePlanet;
  const capBody = EntityManager.get(cap.planetId);
  stubInfluence({ border: [home.systemId] });
  window.KOSMOS.diplomacySystem?.declareWar?.(empireId, 'w3_5_probe');

  const v = spawnAiHull(core, empireId, capBody, { name: 'Rajder' });
  const events = [];
  EventBus.on('director:strikeLaunched', (d) => events.push(d));

  const r = off.launchStrike({ empireId, year: 20 });
  assert(r?.launched === 1, `T8: uderzenie wystartowało (${r?.launched})`);
  assert(v.mission?.type === 'interstellar_jump' && v.pendingOrder?.kind === 'attack',
    `T8 SEDNO: okręt jest w SKOKU z zamiarem uderzenia w \`pendingOrder\` (\`${v.mission?.type}\`) — ` +
    'czyli poleciał prawdziwą ścieżką produkcyjną, a nie dostał ręcznie sklejonej misji');
  assert(events.length === 1 && events[0].empireId === empireId && !events[0].empireName,
    'T8: zdarzenie `director:strikeLaunched` niesie GOŁY fakt — bez nazwy imperium; bramkę ' +
    'jakości kontaktu zakłada odbiorca (W3-7), bo producentów może być więcej');
}

console.log(`\n═══ ${pass} PASS, ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
