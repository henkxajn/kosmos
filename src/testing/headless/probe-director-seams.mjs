// PROBE — weryfikacja szwów Director Slice 1 (WOJNA I POKÓJ 1.0, workstream C, commit S0).
// Uruchom: node src/testing/headless/probe-director-seams.mjs
//
// PO CO: audyt planu (`docs/design/DIRECTOR_SLICE1_PLAN.md`) przeszedł JEDNOPRZEBIEGOWO —
// przebieg adwersaryjny nie odbył się (limit budżetu ubił 8 z 9 agentów). Trzy twierdzenia
// są NOŚNE dla podpisanych decyzji 1/3/6 i szkielet Directora ma na nich stanąć, więc
// zanim cokolwiek powstanie, dowodzimy ich WYKONANIEM na żywym boocie — nie odczytem.
//
//   V1 (decyzja 1) — kadencja `AlienCivSystem._tickAll` i to, że KAŻDY krok przechodzi
//                    po WSZYSTKICH imperiach (a nie round-robin, jak twierdzi audyt §6.1).
//   V2 (audyt §A)  — `planet:constructionComplete` ma DWÓCH emitentów o RÓŻNYM payloadzie;
//                    wyzwalacz Directora bramkowany po `buildingId` musi przeżyć oba.
//   V3 (decyzja 6) — „economy executes": `startShipBuild` na kolonii AI z kadłubem WOJENNYM
//                    od początku do końca — kolejka widoczna, niedobór czeka, stempel własności.
//
// Sonda jest READ-ONLY względem repo: niczego nie edytuje, mierzy prawdziwe systemy
// z `GameCore.boot()`. Liczby z tego przebiegu wchodzą do planu jako dowód.
// Wzór: `probe-diplomacy-time-units.mjs` (instrument fazy D2/E6).

import './env.js';                     // MUSI być pierwszy (window/document/THREE + seeded RNG)
import { GameCore } from './GameCore.js';
import { Ticker } from './Ticker.js';
import EventBus from '../../core/EventBus.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { readFileSync } from 'node:fs';

const CIV = GAME_CONFIG.CIV_TIME_SCALE;
const line = (s = '') => console.log(s);
const hdr  = (s) => { line(); line('═'.repeat(78)); line(s); line('═'.repeat(78)); };

const findings = [];
const record = (id, verdict, detail) => {
  findings.push({ id, verdict, detail });
  line(`  [${verdict}] ${id} — ${detail}`);
};

// ════════════════════════════════════════════════════════════════════════════
// V1 — kadencja _tickAll + iteracja po imperiach
// ════════════════════════════════════════════════════════════════════════════
hdr('V1 (decyzja 1) — kadencja AlienCivSystem._tickAll i iteracja po imperiach');

{
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });

  const acs = core.alienCivSystem;
  const empires = core.empireRegistry.listAll();

  // Szpieg na dwóch poziomach: _tickAll = KROK, _decideNextState = raz na IMPERIUM w kroku.
  let tickAllCalls = 0;
  let decideCalls  = 0;
  const perStepEmpireCounts = [];

  const origTickAll = acs._tickAll.bind(acs);
  const origDecide  = acs._decideNextState.bind(acs);
  acs._decideNextState = (...a) => { decideCalls++; return origDecide(...a); };
  acs._tickAll = (...a) => {
    const before = decideCalls;
    tickAllCalls++;
    const r = origTickAll(...a);
    perStepEmpireCounts.push(decideCalls - before);
    return r;
  };

  const CIV_YEARS = 24;
  new Ticker(core.timeSystem).run(CIV_YEARS, { tickSize: 1.0, stopOnCrash: true });

  line(`  imperiów w partii:            ${empires.length}`);
  line(`  civYears przetickowane:       ${CIV_YEARS}`);
  line(`  wywołań _tickAll (kroków):    ${tickAllCalls}`);
  line(`  wywołań _decideNextState:     ${decideCalls}`);
  line(`  imperiów na krok (min/max):   ${Math.min(...perStepEmpireCounts)}/${Math.max(...perStepEmpireCounts)}`);
  line();

  const everyStepAllEmpires = perStepEmpireCounts.length > 0 &&
    perStepEmpireCounts.every(c => c === empires.length);
  record('V1a', everyStepAllEmpires ? 'POTWIERDZONE' : 'ZŁAMANE',
    everyStepAllEmpires
      ? `każdy krok przechodzi po WSZYSTKICH ${empires.length} imperiach (NIE round-robin — korekta K-5 planu stoi)`
      : `krok NIE obejmuje wszystkich imperiów: rozkład ${JSON.stringify(perStepEmpireCounts.slice(0, 12))}`);

  // Kadencja: 1 krok = 1 rok cywilizacyjny. Tolerancja 1 kroku na akumulator brzegowy.
  const cadenceOk = Math.abs(tickAllCalls - CIV_YEARS) <= 1;
  record('V1b', cadenceOk ? 'POTWIERDZONE' : 'ZŁAMANE',
    cadenceOk
      ? `kadencja = 1 krok / 1 rok cyw. (${tickAllCalls} kroków na ${CIV_YEARS} civY; 1 rok cyw. = 1/${CIV} roku wyświetlanego)`
      : `kadencja rozjechana: ${tickAllCalls} kroków na ${CIV_YEARS} civY`);

  // Klamra MAX_STEPS_PER_TICK — jeden ogromny tick nie może wykonać więcej niż 8 kroków.
  const beforeClamp = tickAllCalls;
  EventBus.emit('time:tick', { deltaYears: 100 / CIV, civDeltaYears: 100 });
  const clampSteps = tickAllCalls - beforeClamp;
  record('V1c', clampSteps <= 8 ? 'POTWIERDZONE' : 'ZŁAMANE',
    `pojedynczy tick 100 civY wykonał ${clampSteps} kroków (klamra MAX_STEPS_PER_TICK = 8)`);

  line();
  line('  ⇒ WNIOSEK dla decyzji 1: koszt reguł Directora liczy się jako REGUŁY × IMPERIA');
  line(`     na krok (${empires.length} imperiów), a nie REGUŁY na krok.`);
}

// ════════════════════════════════════════════════════════════════════════════
// V2 — planet:constructionComplete: dwóch emitentów, dwa payloady
// ════════════════════════════════════════════════════════════════════════════
hdr('V2 (audyt §A) — planet:constructionComplete: dwóch emitentów, dwa kształty payloadu');

{
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });

  const colony = core.colonyManager.getColony(core.colonyManager._activePlanetId);
  const captured = [];
  EventBus.on('planet:constructionComplete', (p) => captured.push(p));

  // ── Emitent 1: BuildingSystem, prawdziwa budowa z buildTime > 0 ──
  // observatory ma buildTime i requires:'orbital_survey' — nadajemy tech i surowce,
  // po czym stawiamy budynek i tickujemy aż budowa się skończy.
  core.techSystem.grantTechs(['orbital_survey']);
  colony.resourceSystem.receive({ Fe: 5000, Si: 5000, Cu: 5000, Ti: 2000, C: 2000 });
  const placed = colony.buildingSystem.autoPlaceBuilding('observatory');
  new Ticker(core.timeSystem).run(60, { tickSize: 1.0, stopOnCrash: true });

  const fromBuildingSystem = captured.find(p => p && p.buildingId);
  line(`  autoPlaceBuilding('observatory') → ${placed ? 'postawione' : 'ODMOWA'}`);
  line(`  przechwyconych zdarzeń:            ${captured.length}`);
  line(`  payload BuildingSystem:            ${fromBuildingSystem ? JSON.stringify(Object.keys(fromBuildingSystem).sort()) : '— (brak)'}`);

  record('V2a', fromBuildingSystem ? 'POTWIERDZONE' : 'NIEROZSTRZYGNIĘTE',
    fromBuildingSystem
      ? `emitent BuildingSystem niesie buildingId (klucze: ${Object.keys(fromBuildingSystem).sort().join(', ')})`
      : 'nie udało się wywołać budowy z buildTime>0 w tym boocie — twierdzenie NIEpotwierdzone wykonaniem');

  // ── Emitent 2: MissionSystem — kształt payloadu odczytany ZE ŹRÓDŁA ──
  // (ścieżka to upgrade outpost→kolonia; postawienie jej headless kosztuje więcej niż
  //  jest warte, a sam kształt jest jednolinijkowy i jednoznaczny)
  const missionSrc = readFileSync(new URL('../../systems/MissionSystem.js', import.meta.url), 'utf8');
  const emitLine = missionSrc.split('\n')
    .map((l, i) => ({ n: i + 1, l }))
    .filter(x => x.l.includes("emit('planet:constructionComplete'"))
    .map(x => `MissionSystem.js:${x.n}  ${x.l.trim()}`);
  line();
  emitLine.forEach(l => line('  ŹRÓDŁO: ' + l));
  const missionShapeIsPlanetIdOnly = emitLine.length === 1 && /\{\s*planetId:[^,}]*\}/.test(emitLine[0]);
  record('V2b', missionShapeIsPlanetIdOnly ? 'POTWIERDZONE (źródło)' : 'ZMIENIONE',
    missionShapeIsPlanetIdOnly
      ? 'drugi emitent niesie WYŁĄCZNIE {planetId} — pułapka z planu jest realna'
      : `kształt drugiego emitenta inny niż zakładał plan: ${JSON.stringify(emitLine)}`);

  // ── Konsekwencja (WYKONANIE): czy wyzwalacz bramkowany po buildingId przeżyje oba? ──
  // To jest twierdzenie, na którym stanie Director — i ono JEST wykonywalne.
  let guardFired = 0, guardThrew = 0;
  const candidateGuard = (p) => {
    try { if (p?.buildingId === 'observatory') guardFired++; }
    catch { guardThrew++; }
  };
  EventBus.on('planet:constructionComplete', candidateGuard);
  const firedBefore = guardFired;
  EventBus.emit('planet:constructionComplete', { planetId: colony.planetId });   // kształt MissionSystem
  const firedAfterTrap = guardFired;
  EventBus.emit('planet:constructionComplete', { planetId: colony.planetId, buildingId: 'observatory', isUpgrade: false, tileKey: '0_0' });
  const firedAfterReal = guardFired;

  line();
  line(`  guard po {planetId} tylko:  fired ${firedAfterTrap - firedBefore}, throw ${guardThrew}`);
  line(`  guard po pełnym payloadzie: fired ${firedAfterReal - firedAfterTrap}`);
  record('V2c',
    (guardThrew === 0 && firedAfterTrap === firedBefore && firedAfterReal > firedAfterTrap) ? 'POTWIERDZONE' : 'ZŁAMANE',
    guardThrew === 0 && firedAfterTrap === firedBefore && firedAfterReal > firedAfterTrap
      ? 'wyzwalacz bramkowany `buildingId === X` jest BEZPIECZNY wobec obu emitentów (nie rzuca, nie odpala się fałszywie)'
      : `wyzwalacz zachował się nieoczekiwanie (throw=${guardThrew})`);
}

// ════════════════════════════════════════════════════════════════════════════
// V3 — startShipBuild na kolonii AI z kadłubem WOJENNYM (decyzja 6)
// ════════════════════════════════════════════════════════════════════════════
hdr('V3 (decyzja 6) — „economy executes": startShipBuild na kolonii AI, kadłub WOJENNY');

{
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  new Ticker(core.timeSystem).run(60, { tickSize: 1.0, stopOnCrash: true });   // niech AI się zagospodaruje

  const cm = core.colonyManager;
  const { HULLS } = await import('../../data/HullsData.js');
  const FRIGATE_CREW = HULLS.hull_frigate.crewCost ?? 0;

  const aiColonies = cm.getAllColonies().filter(c => c.ownerEmpireId && c.ownerEmpireId !== 'player');
  line(`  kolonii AI po 60 civY: ${aiColonies.length}`);
  line(`  hull_frigate.crewCost: ${FRIGATE_CREW} POP (po redenominacji Population 2.0 ×4)`);
  line();
  line('  stan załogowy kolonii AI (freePops = twarda bramka startShipBuild):');
  for (const c of aiColonies) {
    line(`    ${c.planetId} (${c.ownerEmpireId}) pop=${(c.civSystem?.population ?? 0).toFixed(0)} ` +
         `free=${(c.civSystem?.freePops ?? 0).toFixed(2)} stocznia=Lv${cm._getShipyardLevel(c)}`);
  }

  // ⚠ Wybieramy kolonię, która MOŻE obsadzić okręt. Pierwsza-z-brzegu potrafi mieć
  // freePops = 0 (pomiar: jedno z dwóch imperiów siedzi na zerze przez 400 civY),
  // a wtedy mierzylibyśmy bramkę załogi zamiast ścieżki produkcji.
  const col = aiColonies.find(c => (c.civSystem?.freePops ?? 0) >= FRIGATE_CREW);
  const starved = aiColonies.filter(c => (c.civSystem?.freePops ?? 0) < FRIGATE_CREW);
  record('V3z', starved.length > 0 ? 'OSTRZEŻENIE' : 'POTWIERDZONE',
    starved.length > 0
      ? `${starved.length}/${aiColonies.length} kolonii AI NIE MA wolnych POPów na załogę fregaty (${FRIGATE_CREW}) — reguła nacisku POTRZEBUJE guardu załogowego`
      : 'wszystkie kolonie AI mają wolne POPy na załogę okrętu');

  if (!col) {
    record('V3', 'ZŁAMANE', 'ŻADNA kolonia AI nie ma wolnych POPów na fregatę — „economy executes" nie ma gdzie wykonać');
  } else {
    let syLevel = cm._getShipyardLevel(col);
    line();
    line(`  wybrana kolonia AI:    ${col.planetId} (imperium ${col.ownerEmpireId}, free=${(col.civSystem?.freePops ?? 0).toFixed(2)})`);
    line(`  poziom stoczni:        ${syLevel}`);

    // Stocznia jest warunkiem koniecznym `startShipBuild` — jeśli AI jej nie ma, stawiamy,
    // bo mierzymy ŚCIEŻKĘ PRODUKCJI, nie priorytety autorozbudowy.
    if (syLevel === 0) {
      col.resourceSystem.receive({ Fe: 5000, Si: 5000, Cu: 5000, Ti: 2000, C: 2000 });
      col.buildingSystem.autoPlaceBuilding('shipyard');
      new Ticker(core.timeSystem).run(40, { tickSize: 1.0, stopOnCrash: true });
      col._shipyardLevelDirty = true;
      syLevel = cm._getShipyardLevel(col);
      line(`  stocznia dostawiona → poziom ${syLevel}`);
    }

    // Tech kadłuba wojennego — per-imperium drzewo kolonii (nie globalne gracza).
    const techSys = col.techSystem ?? cm.techSystem;
    const hadPD = techSys?.isResearched('point_defense');
    if (!hadPD) techSys?.grantTechs(['point_defense']);
    line(`  tech point_defense:    ${hadPD ? 'było' : 'nadane na potrzeby pomiaru'}`);

    const MODULES = ['engine_ion', 'armor_standard', 'weapon_kinetic'];

    // ── V3a: NIEDOBÓR — zlecenie ma CZEKAĆ, nie zniknąć ──
    col.resourceSystem.spend({ Fe: col.resourceSystem.getAmount('Fe') });   // opróżnij Fe
    const pendingBefore = (col.pendingShipOrders ?? []).length;
    const resPoor = cm.startShipBuild(col.planetId, 'hull_frigate', MODULES);
    const pendingAfter = (col.pendingShipOrders ?? []).length;
    line();
    line(`  [niedobór] startShipBuild → ${JSON.stringify(resPoor)}`);
    line(`  [niedobór] pendingShipOrders: ${pendingBefore} → ${pendingAfter}`);
    record('V3a', (resPoor?.ok && resPoor?.queued && pendingAfter === pendingBefore + 1) ? 'POTWIERDZONE' : 'ZŁAMANE',
      (resPoor?.ok && resPoor?.queued && pendingAfter === pendingBefore + 1)
        ? 'niedobór surowców ⇒ {ok:true, queued:true} i zlecenie CZEKA w pendingShipOrders (nie ginie)'
        : `niedobór zachował się inaczej niż zakładał plan: ${JSON.stringify(resPoor)}`);

    // ── V3b: PEŁNE ZASOBY — kolejka stoczni widoczna ──
    // ⚠ Koszt liczymy Z DANYCH (kadłub + KAŻDY moduł), bo ręczna lista zawsze
    // czegoś nie ma: pierwszy przebieg tej sondy przegapił `propulsion_systems`
    // (2 szt. z `engine_ion`) i wyglądało to na odmowę silnika, a było brakiem w teście.
    const { SHIP_MODULES } = await import('../../data/ShipModulesData.js');
    const fullCost = { ...HULLS.hull_frigate.cost, ...(HULLS.hull_frigate.commodityCost ?? {}) };
    for (const m of MODULES) {
      const mod = SHIP_MODULES[m];
      for (const [k, v] of Object.entries(mod?.cost ?? {}))          fullCost[k] = (fullCost[k] ?? 0) + v;
      for (const [k, v] of Object.entries(mod?.commodityCost ?? {})) fullCost[k] = (fullCost[k] ?? 0) + v;
    }
    line();
    line(`  pełny koszt fregaty (kadłub+moduły): ${JSON.stringify(fullCost)}`);
    const stockBefore = {};
    for (const k of Object.keys(fullCost)) stockBefore[k] = +(col.resourceSystem.getAmount(k) ?? 0).toFixed(1);
    const shortAtBoot = Object.keys(fullCost).filter(k => stockBefore[k] < fullCost[k]);
    line(`  stan kolonii AI:                     ${JSON.stringify(stockBefore)}`);
    record('V3y', shortAtBoot.length === 0 ? 'POTWIERDZONE' : 'OSTRZEŻENIE',
      shortAtBoot.length === 0
        ? 'kolonia AI stać na okręt bez dosypywania'
        : `kolonia AI NIE MA ${shortAtBoot.join(', ')} — zamówienie okrętu będzie CZEKAĆ, aż fabryki dowiozą komodyty`);

    (col.pendingShipOrders ?? []).length = 0;
    const grant = {};
    for (const [k, v] of Object.entries(fullCost)) grant[k] = v * 10;
    col.resourceSystem.receive(grant);
    const queuesBefore = (col.shipQueues ?? []).length;
    const resRich = cm.startShipBuild(col.planetId, 'hull_frigate', MODULES);
    const queuesAfter = (col.shipQueues ?? []).length;
    line();
    line(`  [zasoby OK] startShipBuild → ${JSON.stringify(resRich)}`);
    line(`  [zasoby OK] shipQueues: ${queuesBefore} → ${queuesAfter}`);
    record('V3b', (resRich?.ok && !resRich?.queued && queuesAfter === queuesBefore + 1) ? 'POTWIERDZONE' : 'ZŁAMANE',
      (resRich?.ok && !resRich?.queued && queuesAfter === queuesBefore + 1)
        ? 'kadłub WOJENNY przyjęty na kolonii AI (bramka kadłubowa S3.4d zwalnia AI) i KOLEJKA JEST WIDOCZNA — intel ma w co zajrzeć'
        : `budowa okrętu na kolonii AI odrzucona/niewidoczna: ${JSON.stringify(resRich)}`);

    // ── V3c: STEMPEL WŁASNOŚCI — luka przewidziana w audycie §E ──
    const seen = [];
    EventBus.on('vessel:created', ({ vessel }) => seen.push(vessel));
    new Ticker(core.timeSystem).run(200, { tickSize: 1.0, stopOnCrash: true });
    const frigate = seen.find(v => v?.shipId === 'hull_frigate');
    line();
    line(`  statków utworzonych w oknie: ${seen.length} (${seen.map(v => v?.shipId).join(', ') || '—'})`);
    if (!frigate) {
      record('V3c', 'NIEROZSTRZYGNIĘTE', 'fregata nie ukończyła się w oknie 200 civY — stempla nie da się zmierzyć');
    } else {
      line(`  fregata ${frigate.id}: ownerEmpireId=${JSON.stringify(frigate.ownerEmpireId)} isEnemy=${JSON.stringify(frigate.isEnemy)} colonyId=${frigate.colonyId}`);
      const unowned = frigate.ownerEmpireId == null;
      record('V3c', unowned ? 'POTWIERDZONE (luka realna)' : 'NIEOCZEKIWANE',
        unowned
          ? 'okręt zbudowany przez kolonię AI NIE MA właściciela — _onVesselCreatedClaim filtruje hull_small; S4 MUSI dołożyć własny stempel'
          : `okręt dostał właściciela ${frigate.ownerEmpireId} bez udziału Directora — luka z audytu §E NIE istnieje, S4 upraszcza się`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// V4 — czy ISTNIEJĄCY konsument `startShipBuild` po stronie AI kiedykolwiek odpala?
// ════════════════════════════════════════════════════════════════════════════
hdr('V4 (kontrola klasy R1) — czy produkcja kurierów AI odpala w PEŁNEJ partii?');

{
  // Plan cytuje `EmpireLogisticsSystem:209` jako DOWÓD, że „AI już buduje statki tą ścieżką".
  // Audyt R1 uczy, że istnienie ścieżki ≠ jej wykonanie. Mierzymy WYKONANIE:
  // 400 lat cyw. = ~33 lata wyświetlane = pełna partia (D2_PLAN §B4).
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });

  let requested = 0, claimed = 0;
  const failReasons = [];
  EventBus.on('logistics:shipBuildRequested', () => requested++);
  EventBus.on('logistics:courierClaimed',     () => claimed++);
  EventBus.on('fleet:buildFailed', ({ reason }) => failReasons.push(reason));

  new Ticker(core.timeSystem).run(400, { tickSize: 1.0, stopOnCrash: true });

  const cm = core.colonyManager;
  const aiCols  = cm.getAllColonies().filter(c => c.ownerEmpireId && c.ownerEmpireId !== 'player');
  const outposts = aiCols.filter(c => c.isOutpost);
  const vessels  = [...core.vesselManager._vessels.values()];

  line(`  400 civY (~${(400 / CIV).toFixed(0)} lat wyświetlanych = pełna partia)`);
  line(`  kolonii AI: ${aiCols.length}   z tego OUTPOSTÓW: ${outposts.length}`);
  line(`  logistics:shipBuildRequested: ${requested}`);
  line(`  logistics:courierClaimed:     ${claimed}`);
  line(`  fleet:buildFailed (unikalne): ${JSON.stringify([...new Set(failReasons)])}`);
  line(`  statków w grze łącznie:       ${vessels.length}`);

  record('V4', requested > 0 ? 'POTWIERDZONE' : 'ZŁAMANE',
    requested > 0
      ? `ścieżka kurierów odpaliła ${requested}× — precedens z planu jest wykonywany, nie tylko zadeklarowany`
      : `ścieżka kurierów NIE ODPALIŁA ANI RAZU w pełnej partii (outpostów AI: ${outposts.length}; ` +
        `trasy kurierskie powstają WYŁĄCZNIE pod outposty) — precedens „AI już buduje statki" jest ` +
        `PRAWDZIWY CO DO KODU, ale NIEWYKONYWANY w praktyce`);
}

// ════════════════════════════════════════════════════════════════════════════
hdr('PODSUMOWANIE');
for (const f of findings) line(`  ${f.verdict.padEnd(24)} ${f.id}  ${f.detail}`);
const broken = findings.filter(f => f.verdict === 'ZŁAMANE');
const unresolved = findings.filter(f => f.verdict.startsWith('NIEROZSTRZYGNIĘTE'));
line();
line(`  potwierdzonych: ${findings.length - broken.length - unresolved.length} · nierozstrzygniętych: ${unresolved.length} · ZŁAMANYCH: ${broken.length}`);
if (broken.length > 0) {
  line();
  line('  ⛔ CO NAJMNIEJ JEDNO NOŚNE TWIERDZENIE PADŁO — szkielet Directora NIE MOŻE na nim stanąć.');
}
line();
