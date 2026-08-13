// PROBE — weryfikacja szwów W1 (WOJNA I POKÓJ 1.0, workstream B, commit W1-0).
// Uruchom: node src/testing/headless/probe-war-seams.mjs
//
// PO CO: audyt W1 (`docs/design/W1_PLAN.md`) OBALIŁ dwa ostrzeżenia, które przez cztery
// dokumenty kopiowano jako pewnik (K-1, K-2), i ZAOSTRZYŁ trzecie (K-3). Na tych trzech
// twierdzeniach stoi kształt całego slice'u: czy R2 to lewar czy zwykła poprawność, czy
// jest co „przechodzić" z abstrakcyjnej księgi na realne kadłuby, i gdzie naprawdę biegnie
// linia księgowania bitew. Zanim padnie pierwsza linijka kodu produkcyjnego — dowodzimy ich
// WYKONANIEM na żywym boocie, nie odczytem źródła.
//
//   W1 (K-1, REFUTED) — `milRatio ≡ 0` DZIŚ, bo LICZNIKA nie ma: `createEmpire` wycina
//                       `military` z whitelisty, a `updateMilitaryPower` jest no-opem.
//                       Naprawa R2 rusza MIANOWNIK — FSM się nie drgnie.
//   W2 (K-2, REFUTED) — `empire.fleets` zostaje PUSTE przez całą partię bez cheatu
//                       debugowego ⇒ nie ma okresu „oba istnieją", nie ma czego godzić.
//   W3 (K-3, CONFIRMED) — bitwa z EnemyAttackHandler niesie PRAWDZIWY `warId`, a mimo to
//                       omija `recordBattle`: zero exhaustion, brak wpisu w `war.battles[]`.
//   W4 (V20 / P6)     — kurier na horyzoncie, który ZAWIERA outposty (≥200 civY, kilka
//                       seedów). `shipBuildRequested` i `courierClaimed` liczone OSOBNO:
//                       pierwsze dowodzi, że dyspozytor odpalił, drugie — że kurier dojechał.
//
// Sonda jest READ-ONLY względem repo: niczego nie edytuje i nie pisze do `reports/`.
// Wzór: `probe-director-seams.mjs` (instrument S0 Director Slice 1).

import './env.js';                     // MUSI być pierwszy (window/document/THREE + seeded RNG)
import { GameCore, HEADLESS_GALAXY_SEED } from './GameCore.js';
import { Ticker } from './Ticker.js';
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { createVessel } from '../../entities/Vessel.js';
import { EnemyAttackHandler } from '../../systems/EnemyAttackHandler.js';
import { estimatePlayerMilitary } from '../../systems/ai/UtilityAI.js';

const CIV = GAME_CONFIG.CIV_TIME_SCALE;
const line = (s = '') => console.log(s);
const hdr  = (s) => { line(); line('═'.repeat(78)); line(s); line('═'.repeat(78)); };

const findings = [];
const record = (id, verdict, detail) => {
  findings.push({ id, verdict, detail });
  line(`  [${verdict}] ${id} — ${detail}`);
};

/** Dokładnie ta arytmetyka co `AlienCivSystem.js:106` — kopiowana CELOWO, żeby sonda
 *  mierzyła formułę silnika, a nie własną parafrazę. */
const milRatioOf = (emp, playerEstimate) =>
  playerEstimate > 0 ? (emp.military?.power ?? 0) / playerEstimate : 1.0;

// ════════════════════════════════════════════════════════════════════════════
// W1 — K-1: licznika nie ma, więc milRatio ≡ 0 (naprawa R2 niczego nie przesuwa)
// ════════════════════════════════════════════════════════════════════════════
hdr('W1 (K-1, REFUTED) — milRatio ≡ 0, bo LICZNIK `empire.military.power` nie istnieje');

{
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });

  const reg     = core.empireRegistry;
  const empires = reg.listAll();
  const acs     = core.alienCivSystem;

  // ── (a) Oba estymatory żyją i zwracają liczbę — to jest MIANOWNIK ──
  const estUtility = estimatePlayerMilitary();
  const estAlien   = acs._estimatePlayerMilitary();
  line(`  imperiów w partii:                      ${empires.length}`);
  line(`  UtilityAI.estimatePlayerMilitary():     ${estUtility}`);
  line(`  AlienCivSystem._estimatePlayerMilitary(): ${estAlien}`);
  record('W1a', estUtility !== estAlien ? 'POTWIERDZONE (dryf V1/V2)' : 'NIEOCZEKIWANE',
    estUtility !== estAlien
      ? `dwa estymatory ROZJECHANE (${estUtility} vs ${estAlien}) — V1 dolicza kolonie ×40, V2 nie; ` +
        `dwie osobne edycje tej samej funkcji, które nie zgadzają się co do znaczenia bazy`
      : `oba estymatory zwracają ${estUtility} — dryfu V1/V2 nie widać w tym boocie`);

  // ── (b) LICZNIK: `military` nie przeżywa nawet jawnego przekazania do createEmpire ──
  const probeEmp = reg.createEmpire({
    id: 'emp_w1probe', archetype: empires[0]?.archetype ?? 'industrialist',
    military: { power: 200 },            // ⚠ SpawnTestEnemy:97 i CombatSandbox:383 robią dokładnie to
    resources: { production: 999 },
  });
  const droppedMilitary  = probeEmp.military  === undefined;
  const droppedResources = probeEmp.resources === undefined;
  line();
  line(`  createEmpire({ military:{power:200} }) → emp.military = ${JSON.stringify(probeEmp.military)}`);
  line(`  createEmpire({ resources:{...} })      → emp.resources = ${JSON.stringify(probeEmp.resources)}`);
  record('W1b', (droppedMilitary && droppedResources) ? 'POTWIERDZONE' : 'ZŁAMANE',
    (droppedMilitary && droppedResources)
      ? 'whitelist `createEmpire` MILCZĄCO wycina `military` i `resources` — licznik nie ma jak powstać'
      : `whitelist przepuściła military=${JSON.stringify(probeEmp.military)} resources=${JSON.stringify(probeEmp.resources)}`);

  // ── (c) `updateMilitaryPower` — udokumentowany no-op ──
  reg.updateMilitaryPower('emp_w1probe', 500, 'probe');
  const afterUpdate = reg.get('emp_w1probe')?.military?.power;
  record('W1c', afterUpdate === undefined ? 'POTWIERDZONE' : 'ZŁAMANE',
    afterUpdate === undefined
      ? 'updateMilitaryPower(+500) NIE zapisuje nic (backward-compat stub Slice 1) — drugiej drogi do licznika brak'
      : `updateMilitaryPower zapisał power=${afterUpdate} — stub jednak żyje`);

  // ── (d) SEDNO K-1: milRatio dla KAŻDEGO imperium jest zerem ──
  const ratios = empires.map(e => ({ id: e.id, r: milRatioOf(e, estAlien) }));
  line();
  for (const { id, r } of ratios) line(`    ${id.padEnd(12)} military=${JSON.stringify(empires.find(e => e.id === id).military)}  milRatio=${r}`);
  const allZero = ratios.length > 0 && ratios.every(x => x.r === 0);
  record('W1d', allZero ? 'POTWIERDZONE' : 'ZŁAMANE',
    allZero
      ? `milRatio ≡ 0 dla wszystkich ${ratios.length} imperiów — ostrzeżenie „naprawa R2 wepchnie imperia w ` +
        `AGGRESSIVE/WAR" jest FAŁSZYWE (K-1); R2 to poprawność, nie lewar`
      : `milRatio NIE jest zerem: ${JSON.stringify(ratios)}`);

  // ── (e) KONTROLA PINU: gdyby licznik ISTNIAŁ, ta sama formuła dałaby wartość ≠ 0 ──
  // Bez tej kontroli pin „milRatio ≡ 0" jest nieodróżnialny od pinu, który nic nie liczy.
  const withNumerator = milRatioOf({ military: { power: 300 } }, estAlien);
  record('W1e', withNumerator > 0 ? 'POTWIERDZONE (kontrola pinu)' : 'ZŁAMANE',
    withNumerator > 0
      ? `ta sama formuła z licznikiem 300 daje ${withNumerator.toFixed(2)} — zero z W1d pochodzi z BRAKU DANYCH, ` +
        `nie z martwej asercji; dopisanie writera `.trim() + '`military.power` MUSI ten pin zaczerwienić'
      : 'formuła zwraca 0 nawet z licznikiem — pin W1d nic nie mierzy');

  // ── (f) Bramka R2: czy UZBROJONY statek rusza dziś estymatorem? ──
  // To jest właściwy defekt R2 — predykat `m?.id` na tablicy STRINGÓW jest zawsze false.
  const vMgr = core.vesselManager;
  const home = window.KOSMOS.homePlanet;
  const before = { utility: estimatePlayerMilitary(), alien: acs._estimatePlayerMilitary() };
  const armed = createVessel('hull_frigate', home.id, {
    name: 'Sonda W1 (uzbrojona)', modules: ['engine_ion', 'armor_standard', 'weapon_kinetic'],
    x: home.x ?? 0, y: home.y ?? 0, systemId: 'sys_home',
  });
  vMgr._vessels.set(armed.id, armed);
  const after = { utility: estimatePlayerMilitary(), alien: acs._estimatePlayerMilitary() };
  line();
  line(`  modules statku (kształt): ${JSON.stringify(armed.modules)}`);
  line(`  estymator UtilityAI:   ${before.utility} → ${after.utility}  (Δ ${after.utility - before.utility})`);
  line(`  estymator AlienCiv:    ${before.alien} → ${after.alien}  (Δ ${after.alien - before.alien})`);
  // ⚠ Ta sekcja mierzy stan, KTÓRY W1-1 ZMIENIA. Pomiar PRZED naprawą (commit W1-0):
  //   Δutility = 0, Δalien = 0 — uzbrojony kadłub nie ruszał niczym. Po W1-1 oba mają dać +30.
  //   Sonda nie zakłada odpowiedzi — RAPORTUJE zmierzoną i mówi, po której stronie naprawy stoi.
  const blindUtility = after.utility - before.utility === 0;
  const blindAlien   = after.alien   - before.alien   === 0;
  const reactsBoth   = (after.utility - before.utility) === 30 && (after.alien - before.alien) === 30;
  record('W1f',
    (blindUtility && blindAlien) ? 'POTWIERDZONE (defekt R2 — stan PRZED W1-1)'
      : reactsBoth ? 'POTWIERDZONE (R2 naprawione — stan PO W1-1)' : 'NIEOCZEKIWANE',
    (blindUtility && blindAlien)
      ? 'UZBROJONY statek NIE rusza ŻADNYM estymatorem — `m?.id` na tablicy stringów zwraca `undefined`, ' +
        'regex nie ma czego dopasować; to jest R2 zmierzone, nie odczytane'
      : reactsBoth
        ? 'oba estymatory reagują na uzbrojony kadłub gracza po +30 — naprawa R2 (W1-1) jest na miejscu ' +
          'i bliźniaki zgadzają się co do wyniku'
        : `estymatory rozjechane po naprawie (Δutility=${after.utility - before.utility}, ` +
          `Δalien=${after.alien - before.alien}) — spodziewane 0/0 przed W1-1 albo 30/30 po`);

  // ── (g) V5 — po naprawie predykatu wpadnie WROGI kadłub, bo filtru właściciela NIE MA ──
  const enemyId = empires[0]?.id ?? 'emp_001';
  const enemy = createVessel('hull_frigate', home.id, {
    name: 'Sonda W1 (wrogi)', modules: ['engine_ion', 'armor_standard', 'weapon_kinetic'],
    x: home.x ?? 0, y: home.y ?? 0, systemId: 'sys_home',
  });
  enemy.ownerEmpireId = enemyId; enemy.owner = enemyId; enemy.isEnemy = true;
  vMgr._vessels.set(enemy.id, enemy);
  const wreck = createVessel('hull_frigate', home.id, {
    name: 'Sonda W1 (wrak)', modules: ['engine_ion', 'armor_standard', 'weapon_kinetic'],
    x: home.x ?? 0, y: home.y ?? 0, systemId: 'sys_home',
  });
  wreck.isWreck = true;
  vMgr._vessels.set(wreck.id, wreck);

  // Ile kadłubów policzyłby SAM naprawiony predykat, gdyby nie było filtru właściciela/wraku…
  const all = [...vMgr._vessels.values()];
  const armedByFixedPredicate = all.filter(v => (v.modules ?? []).some(m => /^weapon_/.test(String(m))));
  const enemyOrWreck = armedByFixedPredicate.filter(v => v.isWreck || (v.ownerEmpireId && v.ownerEmpireId !== 'player'));
  // …a ile NAPRAWDĘ liczy dzisiejszy estymator. Różnica = wartość filtru z V5.
  const estWithForeign = estimatePlayerMilitary();
  const filteredOut = estWithForeign === after.utility;
  line();
  line(`  sam predykat (bez filtru) policzyłby: ${armedByFixedPredicate.length} kadłubów`);
  line(`  z tego CUDZYCH lub WRAKÓW:            ${enemyOrWreck.length} (${enemyOrWreck.map(v => v.name).join(', ')})`);
  line(`  estymator PRZED dostawieniem cudzych: ${after.utility}   PO: ${estWithForeign}`);
  record('W1g', enemyOrWreck.length === 0 ? 'NIEROZSTRZYGNIĘTE'
      : filteredOut ? 'POTWIERDZONE (filtr V5 działa — stan PO W1-1)' : 'POTWIERDZONE (pułapka V5 realna — stan PRZED W1-1)',
    enemyOrWreck.length === 0
      ? 'nie udało się postawić wrogiego/martwego kadłuba — pułapki V5 nie zmierzono'
      : filteredOut
        ? `${enemyOrWreck.length} CUDZYCH/martwych kadłubów NIE podniosło estymatora (${after.utility} → ` +
          `${estWithForeign}) — filtr właściciela i wraku z V5 jest na miejscu`
        : `sama naprawa predykatu wpuściłaby ${enemyOrWreck.length} CUDZYCH/martwych kadłubów do „siły gracza" ` +
          `(${after.utility} → ${estWithForeign}) — filtr MUSI wejść tym samym commitem (V5)`);
}

// ════════════════════════════════════════════════════════════════════════════
// W2 — K-2: abstrakcyjna księga flot jest pusta przez całą partię
// ════════════════════════════════════════════════════════════════════════════
hdr('W2 (K-2, REFUTED) — `empire.fleets` zostaje PUSTE bez cheatu debugowego');

{
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });

  const CIV_YEARS = 200;
  new Ticker(core.timeSystem).run(CIV_YEARS, { tickSize: 1.0, stopOnCrash: true });

  const empires = core.empireRegistry.listAll();
  const rows = empires.map(e => ({ id: e.id, fleets: (e.fleets ?? []).length }));
  const totalFleets = rows.reduce((s, r) => s + r.fleets, 0);

  // Realne kadłuby AI — DRUGA POŁOWA K-2: aktywa bez reprezentacji abstrakcyjnej.
  const aiVessels = [...core.vesselManager._vessels.values()]
    .filter(v => v?.ownerEmpireId && v.ownerEmpireId !== 'player' && !v.isWreck);

  line(`  ${CIV_YEARS} civY (~${(CIV_YEARS / CIV).toFixed(0)} lat wyświetlanych)`);
  for (const r of rows) line(`    ${r.id.padEnd(12)} fleets=${r.fleets}`);
  line(`  Σ wpisów w abstrakcyjnej księdze: ${totalFleets}`);
  line(`  REALNYCH kadłubów AI (stemplowanych): ${aiVessels.length}` +
       (aiVessels.length ? ` (${aiVessels.map(v => v.shipId).join(', ')})` : ''));

  record('W2a', totalFleets === 0 ? 'POTWIERDZONE' : 'ZŁAMANE',
    totalFleets === 0
      ? `księga `.trim() + '`empire.fleets` PUSTA po ' + `${CIV_YEARS} civY — „okres przejściowy, w którym oba ` +
        `istnieją" jest PUSTY (K-2); derived strength może wejść jako czysty read-model`
      : `księga NIE jest pusta (${totalFleets} wpisów) — okres przejściowy jednak istnieje: ${JSON.stringify(rows)}`);

  // ⚠ Gdy kadłubów AI nie ma, POWÓD jest strukturalny, nie „za krótkie okno": harness
  // NIE montuje `stationSystem`, więc żeton stacji z R-3 nigdy nie zostaje zasiany
  // (`EmpireBootstrap` mówi to wprost w logu) i produkcja okrętów wojennych AI jest
  // ZABLOKOWANA U ŹRÓDŁA. Każdy keeper W1, który potrzebuje wrogiego kadłuba, musi go
  // postawić SAM — na naturalną produkcję AI w headless nie ma co liczyć.
  const harnessHasStationSystem = !!window.KOSMOS?.stationSystem;
  record('W2b', aiVessels.length > 0 ? 'POTWIERDZONE (odwrotna luka)' : 'OSTRZEŻENIE (ograniczenie harnessu)',
    aiVessels.length > 0
      ? `${aiVessels.length} REALNYCH kadłubów AI istnieje BEZ jakiejkolwiek reprezentacji abstrakcyjnej — ` +
        `luka jest ODWROTNA do tej, którą opisuje P2`
      : `AI nie zbudowało kadłuba, bo harness NIE montuje stationSystem (${harnessHasStationSystem ? 'jest' : 'BRAK'}) ⇒ ` +
        `żeton stacji z R-3 niezasiany ⇒ produkcja okrętów wojennych AI zablokowana U ŹRÓDŁA. ` +
        `Odwrotnej luki NIE DA SIĘ zmierzyć w headless — keepery W1 muszą stawiać wrogie kadłuby ręcznie`);
}

// ════════════════════════════════════════════════════════════════════════════
// W3 — K-3: bitwa EAH niesie warId i MIMO TO omija recordBattle
// ════════════════════════════════════════════════════════════════════════════
hdr('W3 (K-3, CONFIRMED) — bitwa EnemyAttackHandler z warId OMIJA recordBattle');

{
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  new Ticker(core.timeSystem).run(12, { tickSize: 1.0, stopOnCrash: true });

  const K       = window.KOSMOS;
  const warSys  = core.warSystem;
  const vMgr    = core.vesselManager;
  const home    = K.homePlanet;
  const empireId = core.empireRegistry.listAll()[0]?.id;

  // Szpieg na JEDYNYM producencie exhaustion (WarSystem.js:168-169).
  let recordBattleCalls = 0;
  const origRecord = warSys.recordBattle.bind(warSys);
  warSys.recordBattle = (...a) => { recordBattleCalls++; return origRecord(...a); };

  // Wrogi kadłub NA ORBICIE planety gracza — dokładnie stan, który EAH zbiera (`:88-97`).
  const enemy = createVessel('hull_frigate', home.id, {
    name: 'Najeźdźca W1', modules: ['engine_ion', 'armor_standard', 'weapon_kinetic'],
    x: home.x ?? 0, y: home.y ?? 0, systemId: 'sys_home',
  });
  enemy.ownerEmpireId = empireId; enemy.owner = empireId; enemy.isEnemy = true;
  enemy.position.state = 'orbiting'; enemy.position.dockedAt = home.id;
  enemy.systemId = 'sys_home';
  vMgr._vessels.set(enemy.id, enemy);

  // ⚠ Wojnę deklarujemy SAMI, PRZED bitwą. Bez tego stan „przed" jest nullem (EAH deklaruje
  // wojnę dopiero w trakcie) i pin „exhaustion bez zmian" przechodzi VACUOUSLY — złapane
  // przez keeper `war_seams_smoke`, który był w tym miejscu ostrzejszy od sondy.
  core.diplomacySystem.declareWar(empireId, 'probe_seam');

  const eah = new EnemyAttackHandler();
  // Omijamy WYŁĄCZNIE 500 ms timer batchowania — reszta ścieżki jest prawdziwa.
  eah._pendingBattles.set(home.id, {
    arrivedVesselIds: new Set([enemy.id]),
    firstVesselYear:  K.timeSystem?.gameTime ?? 0,
    timerId: null,
  });

  const resolved = [];
  const onResolved = (p) => resolved.push(p);
  EventBus.on('battle:resolved', onResolved);

  const warBefore = warSys.getWarWith?.(empireId);
  const exhaustBefore = warBefore ? { ...warBefore.exhaustion } : null;
  const battlesBefore = warBefore ? warBefore.battles.length : 0;

  eah._resolveBatchedBattle(home.id);

  EventBus.off('battle:resolved', onResolved);
  warSys.recordBattle = origRecord;

  const warAfter = warSys.getWarWith?.(empireId);
  const withWarId = resolved.filter(p => p?.warId);
  const battlesAfter = warAfter ? warAfter.battles.length : 0;
  const exhaustAfter = warAfter ? { ...warAfter.exhaustion } : null;

  line(`  wojna PRZED bitwą:            ${warBefore ? warBefore.id : '— (brak)'}`);
  line(`  wojna PO bitwie:              ${warAfter ? warAfter.id : '— (brak)'}  (EAH deklaruje ją SAM, :110-118)`);
  line(`  battle:resolved wyemitowane:  ${resolved.length}  z warId: ${withWarId.length}`);
  line(`  wywołań recordBattle:         ${recordBattleCalls}`);
  line(`  war.battles[]:                ${battlesBefore} → ${battlesAfter}`);
  line(`  exhaustion:                   ${JSON.stringify(exhaustBefore)} → ${JSON.stringify(exhaustAfter)}`);
  line(`  wpisów w gameState.battles:   ${Object.keys(gameState.get('battles') ?? {}).length}`);

  const bypassed = withWarId.length > 0 && recordBattleCalls === 0;
  record('W3a', bypassed ? 'POTWIERDZONE' : 'NIEROZSTRZYGNIĘTE',
    bypassed
      ? `bitwa niesie PRAWDZIWY warId (${withWarId[0].warId}) i NIE dotyka recordBattle ani razu — ` +
        `to jest K-3 zmierzone`
      : `nie odtworzono szwu: emisje=${resolved.length} zWarId=${withWarId.length} recordBattle=${recordBattleCalls}`);

  // Porównanie NIE tolerujące nulla — patrz nota przy declareWar wyżej.
  const noExhaustion = exhaustBefore != null && exhaustAfter != null &&
    JSON.stringify(exhaustBefore) === JSON.stringify(exhaustAfter);
  record('W3b', (bypassed && battlesAfter === battlesBefore) ? 'POTWIERDZONE' : 'NIEROZSTRZYGNIĘTE',
    (bypassed && battlesAfter === battlesBefore)
      ? `bitwa NIE dopisała się do war.battles[] — jest niewidoczna nawet w WarOverlay, który czyta tę tablicę`
      : `war.battles[] zmieniło się ${battlesBefore} → ${battlesAfter}`);

  record('W3c', (bypassed && noExhaustion) ? 'POTWIERDZONE' : 'NIEROZSTRZYGNIĘTE',
    (bypassed && noExhaustion)
      ? `exhaustion NIE drgnęło — a jest to NOŚNE wejście akceptacji pokoju (waga 55 na offer_peace), ` +
        `więc D2 systematycznie ZANIŻA cenę pokoju dokładnie w wojnach realnie toczonych`
      : `exhaustion zmieniło się: ${JSON.stringify(exhaustBefore)} → ${JSON.stringify(exhaustAfter)}`);
}

// ════════════════════════════════════════════════════════════════════════════
// W4 — kurier na horyzoncie, KTÓRY ZAWIERA outposty (V20 / P6)
// ════════════════════════════════════════════════════════════════════════════
hdr('W4 (V20 / P6) — kurier AI: dyspozytor vs dostawa, na horyzoncie z outpostami');

{
  // V4 z Director S0 mierzył 400 civY i zobaczył ZERO — ale wtedy nie było outpostów
  // w oknie. K-5 obalił diagnozę „złe kluczowanie": ścieżka jest spójna, brakowało
  // wyłącznie outpostów. Mierzymy PONOWNIE, licząc DWA zdarzenia OSOBNO:
  //   shipBuildRequested = dyspozytor odpalił   ·   courierClaimed = kurier dojechał.
  const SEEDS = [HEADLESS_GALAXY_SEED, 12345, 777777];
  const CIV_YEARS = 400;          // ten sam horyzont co V4 z S0 — wyniki są porównywalne
  const CHECKPOINT = 50;          // próbkowanie po drodze: łapie outpost, który POWSTAŁ i został awansowany
  const rows = [];

  for (const seed of SEEDS) {
    const core = new GameCore();
    core.boot({ quiet: true, scenario: 'civilization', galaxySeed: seed, aiEmpires: true });

    let requested = 0, claimed = 0, outpostFounded = 0;
    const failReasons = [];
    const onReq   = () => requested++;
    const onClaim = () => claimed++;
    const onFail  = ({ reason }) => failReasons.push(reason);
    // `outpost:founded` łapie outpost NAWET jeśli później zniknie/awansuje — inaczej
    // odczyt końcowy myli „nigdy nie było" z „było i się skończyło".
    const onOutpost = () => outpostFounded++;
    EventBus.on('logistics:shipBuildRequested', onReq);
    EventBus.on('logistics:courierClaimed',     onClaim);
    EventBus.on('fleet:buildFailed',            onFail);
    EventBus.on('outpost:founded',              onOutpost);

    const aiOf = () => core.colonyManager.getAllColonies().filter(c => c.ownerEmpireId && c.ownerEmpireId !== 'player');
    const ticker = new Ticker(core.timeSystem);
    let peakOutposts = 0;
    for (let done = 0; done < CIV_YEARS; done += CHECKPOINT) {
      ticker.run(CHECKPOINT, { tickSize: 1.0, stopOnCrash: true });
      peakOutposts = Math.max(peakOutposts, aiOf().filter(c => c.isOutpost).length);
    }

    EventBus.off('logistics:shipBuildRequested', onReq);
    EventBus.off('logistics:courierClaimed',     onClaim);
    EventBus.off('fleet:buildFailed',            onFail);
    EventBus.off('outpost:founded',              onOutpost);

    const aiCols  = aiOf();
    const outposts = aiCols.filter(c => c.isOutpost);

    // Zatrzask V20: `empire.logistics.pendingBuildRoute` bez TTL i bez nasłuchu na fleet:buildFailed.
    // Stan siedzi WPROST na obiekcie imperium (`_ensureLogistics`), nie w osobnej mapie.
    const logiState = core.empireRegistry.listAll().map(e => ({
      id: e.id,
      latched: e.logistics?.pendingBuildRoute ?? null,
      routes:  e.logistics?.routes?.length ?? 0,
      stats:   e.logistics?.stats ?? null,
    }));

    rows.push({ seed, aiCols: aiCols.length, outposts: outposts.length, peakOutposts, outpostFounded,
                requested, claimed, fails: [...new Set(failReasons)], logiState });
  }

  line(`  ${CIV_YEARS} civY (~${(CIV_YEARS / CIV).toFixed(0)} lat wyświetlanych) × ${SEEDS.length} seedów, ` +
       `próbkowanie co ${CHECKPOINT} civY`);
  line();
  line('  seed          kolonieAI  outp.KONIEC  outp.SZCZYT  outpost:founded  ŻĄDANIA  DOSTAWY  fleet:buildFailed');
  line('  ' + '─'.repeat(104));
  for (const r of rows) {
    line(`  ${String(r.seed).padStart(12)}  ${String(r.aiCols).padStart(9)}  ${String(r.outposts).padStart(11)}  ` +
         `${String(r.peakOutposts).padStart(11)}  ${String(r.outpostFounded).padStart(15)}  ` +
         `${String(r.requested).padStart(7)}  ${String(r.claimed).padStart(7)}  ${JSON.stringify(r.fails)}`);
  }
  line();
  for (const r of rows) {
    const latched = r.logiState.filter(s => s.latched);
    if (latched.length) line(`  seed ${r.seed}: ZATRZAŚNIĘTE imperia → ${JSON.stringify(latched)}`);
  }

  const anyOutposts  = rows.some(r => r.peakOutposts > 0 || r.outpostFounded > 0);
  const anyRequested = rows.some(r => r.requested > 0);
  const anyClaimed   = rows.some(r => r.claimed > 0);
  const anyLatched   = rows.some(r => r.logiState.some(s => s.latched));

  // ⚠ Werdykty MUSZĄ odzwierciedlać zmierzony stan, nie zakładany. Pierwszy przebieg tej
  // sondy mówił „dyspozytor nie odpalił MIMO OUTPOSTÓW" przy zerze outpostów — komunikat
  // diagnostyczny odtwarzał ścieżkę, której nie było (memory `diagnostic-reasons-mirror-decision-path`).
  record('W4a', anyOutposts ? 'POTWIERDZONE' : 'OSTRZEŻENIE (przesłanka pomiaru niespełniona)',
    anyOutposts
      ? `horyzont ZAWIERA outposty (szczyt ${rows.map(r => r.peakOutposts).join('/')}, założeń ` +
        `${rows.map(r => r.outpostFounded).join('/')}) — warunek konieczny tras kurierskich spełniony`
      : `ŻADEN z ${SEEDS.length} seedów nie założył ANI JEDNEGO outpostu przez ${CIV_YEARS} civY ` +
        `(~${(CIV_YEARS / CIV).toFixed(0)} lat wyśw.) — ani na koniec, ani w szczycie, ani wg zdarzenia ` +
        `outpost:founded. AI zakłada PEŁNE kolonie (${rows.map(r => r.aiCols).join('/')}), nie outposty. ` +
        `Przesłanki pomiaru kuriera NIE DA SIĘ spełnić dzisiejszym AI — to potwierdza „niedobór outpostów ` +
        `to prawdziwy sufit" (§Findings filed 1) i jest pozycją BALANS, nie naprawą W1`);

  record('W4b', anyRequested ? 'POTWIERDZONE' : (anyOutposts ? 'ZŁAMANE' : 'NIEROZSTRZYGNIĘTE'),
    anyRequested
      ? `dyspozytor kuriera ODPALIŁ (${rows.map(r => r.requested).join('/')} żądań) — ścieżka jest wykonywana, nie tylko zadeklarowana`
      : anyOutposts
        ? `outposty SĄ, a dyspozytor NIE odpalił ani razu — blokada leży MIĘDZY outpostem a zleceniem budowy`
        : `zero żądań, ale i zero outpostów — o ścieżce dyspozytora ten przebieg NIE ROZSTRZYGA ` +
          `(brak warunku koniecznego, nie dowód defektu)`);

  record('W4c', anyClaimed ? 'POTWIERDZONE' : (anyRequested ? 'OSTRZEŻENIE' : 'NIEROZSTRZYGNIĘTE'),
    anyClaimed
      ? `kurier faktycznie DOJECHAŁ (${rows.map(r => r.claimed).join('/')} przejęć) — pętla domknięta end-to-end`
      : anyRequested
        ? 'żądania są, ale ŻADEN kurier nie został przejęty — pętla urywa się MIĘDZY zleceniem a ' +
          '`vessel:created` (dokładnie zatrzask `pendingBuildRoute` bez TTL — W1-6)'
        : 'brak żądań ⇒ brak dostaw; ten przebieg nie mówi nic o odcinku zlecenie→kurier');

  record('W4d', anyLatched ? 'POTWIERDZONE (zatrzask realny)' : 'NIEROZSTRZYGNIĘTE',
    anyLatched
      ? 'co najmniej jedno imperium kończy przebieg z ZATRZAŚNIĘTYM `pendingBuildRoute` — to jest defekt, który naprawia W1-6'
      : `na końcu przebiegu żaden zatrzask nie wisi (żądań: ${rows.map(r => r.requested).join('/')}) — ` +
        `keeper W1-6 MUSI odtworzyć zatrzask celowo, bo naturalny przebieg go nie produkuje`);
}

// ════════════════════════════════════════════════════════════════════════════
hdr('PODSUMOWANIE');
for (const f of findings) line(`  ${f.verdict.padEnd(26)} ${f.id}  ${f.detail}`);
const broken = findings.filter(f => f.verdict === 'ZŁAMANE');
const unresolved = findings.filter(f => f.verdict.startsWith('NIEROZSTRZYGNIĘTE'));
line();
line(`  potwierdzonych: ${findings.length - broken.length - unresolved.length} · nierozstrzygniętych: ${unresolved.length} · ZŁAMANYCH: ${broken.length}`);
if (broken.length > 0) {
  line();
  line('  ⛔ CO NAJMNIEJ JEDNO NOŚNE TWIERDZENIE PADŁO — kształt W1 wymaga ponownej decyzji.');
}
line();
