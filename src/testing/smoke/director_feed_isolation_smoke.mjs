// GATE 1 — keeper DWÓCH ROZBIEŻNOŚCI z przebiegu 3 (workstream C, Slice 1, po S4).
//
// R1 — WYCIEK WYWIADU. Zdarzenia `fleet:*` emituje KAŻDA stocznia w grze, także kolonii AI,
//      a subskrybenci Dziennika nie filtrowali właściciela. Gracz czytał „Stocznia: budowa
//      hull_frigate" i „Statek gotowy" dla zbrojeń OBCEGO imperium (fregaty buduje wyłącznie
//      AI) oraz meldunki kurierów AI. To nie szum — to **darmowy wywiad**, omijający warstwę
//      intelu, która miała wymagać skanu. DebugLog zostaje NIEFILTROWANY (kanał deweloperski).
//
// R2 — ZGUBIONA ADNOTACJA SZABLONU. `directorOrigin` ginął na obu trasach, bo brał się
//      z rejestru w pamięci. Teraz jest WYPROWADZANY z (kadłub, moduły) — tak jak własność
//      z kolonii. Przyszłe reguły eskalacji liczą po nim „ile fregat nacisku już stoi".
//
//   T1  bramka Dziennika: build AI = ZERO wpisów, build gracza = wpisy jak dotąd
//   T2  wszystkie cztery emisje fleet:* niosą planetId (bez tego bramka jest ślepa)
//   T3  kurierzy AI nie meldują się w Dzienniku, statki gracza tak
//   T4  odwrócenie resolvera: każdy szablon katalogu odtwarzalny z (kadłub, moduły)
//   T5  rozłączność katalogu — dwa szablony nie mogą dać tego samego ładunku
//   T6  adnotacja przeżywa BRAK rejestru (przeładowanie) i ścieżkę pending→queue
//   T7  directorOrigin jest serializowany (round-trip zapisu)

import '../headless/env.js';                 // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import EventBus from '../../core/EventBus.js';
import { DirectorProduction, matchTemplateId } from '../../systems/director/DirectorProduction.js';
import { SHIP_TEMPLATES } from '../../data/ShipTemplateData.js';
import { resolveTemplate } from '../../utils/ShipTemplateResolver.js';
import { isPlayerColonyEvent } from '../../utils/JournalScope.js';

let pass = 0, fail = 0;
const A = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const codeOnly = (p) => readFileSync(p, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const UI = codeOnly('src/scenes/UIManager.js');
const CM = codeOnly('src/systems/ColonyManager.js');

/**
 * Ciało JEDNEGO subskrybenta — od `EventBus.on('<ev>'` do początku NASTĘPNEJ subskrypcji.
 *
 * ⚠ Okno o stałej szerokości (tak było wcześniej: `slice(i, i+260)`) PRZECIEKA do sąsiada:
 * zdjęcie bramki z `civ:famine` nie wywracało pinu, bo w oknie siedziała jeszcze bramka
 * stojącego zaraz za nim `civ:famineLifted`. Pin spełniony przez CUDZY kod to pin martwy —
 * złapane próbą fail-first, nie przeglądem.
 */
function handlerBodies(src, ev) {
  const out = [];
  for (const m of src.matchAll(new RegExp(`EventBus\\.on\\('${ev}'`, 'g'))) {
    const i = m.index;
    const next = src.indexOf('EventBus.on(', i + 12);
    out.push(src.slice(i, next > i ? next : src.length));
  }
  return out;
}
const handlerBody = (src, ev) => handlerBodies(src, ev)[0] ?? null;

// ── T1/T2/T3 — bramka Dziennika ─────────────────────────────────────────────
console.log('\nT1/T2/T3: bramka właściciela w Dzienniku gracza');
{
  // Warstwa 1: WYKONANIE PRAWDZIWEGO predykatu — tego samego modułu, który importuje
  // UIManager. Wcześniej test trzymał tu KOPIĘ i kopia się rozjechała (kanon własności
  // zmienił się w kodzie, w teście został stary warunek). Teraz dryf jest niemożliwy.
  window.KOSMOS = {
    colonyManager: {
      getColony: (id) => (id === 'p_ai' ? { planetId: 'p_ai', ownerEmpireId: 'emp_001' }
        : id === 'p_player' ? { planetId: 'p_player' }
        : id === 'p_player_explicit' ? { planetId: 'p_player_explicit', ownerEmpireId: 'player' } : null),
    },
  };
  A(isPlayerColonyEvent('p_ai') === false, 'T1a: zdarzenie kolonii AI → ODRZUCONE');
  A(isPlayerColonyEvent('p_player') === true, 'T1b: zdarzenie kolonii gracza → przepuszczone');
  A(isPlayerColonyEvent('p_obca') === false, 'T1c: nieznane planetId → fail-closed (odrzucone)');
  A(isPlayerColonyEvent(undefined) === true,
    'T1d: emisja BEZ planetId → przepuszczona (nie wyciszamy nieotagowanych zdarzeń gracza)');
  A(isPlayerColonyEvent('p_player_explicit') === true,
    'T1d2: jawne ownerEmpireId="player" → kolonia GRACZA (kanon ColonyManager.isPlayerColony; '
    + 'lokalna kopia `!ownerEmpireId` uznawała ją za AI i wyciszała wpisy gracza)');

  // Warstwa 2: asercje źródłowe — czy predykat jest RZECZYWIŚCIE wpięty w każdy subskrybent.
  A(/_isPlayerColonyEvent\(planetId\)/.test(UI), 'T1e: predykat istnieje w UIManagerze');
  for (const ev of ['fleet:buildStarted', 'fleet:shipCompleted', 'fleet:buildFailed', 'fleet:buildQueued']) {
    const body = handlerBody(UI, ev) ?? '';
    A(/_isPlayerColonyEvent\(planetId\)/.test(body), `T1f/${ev}: subskrybent ma bramkę`);
    A(/\(\{ planetId/.test(body), `T2/${ev}: …i destrukturyzuje planetId z payloadu`);
  }
  // Emitent MUSI dokładać planetId, inaczej bramka jest ślepa (fail-closed → cisza wszędzie).
  A(!/fleet:buildFailed', \{ reason/.test(CM),
    'T2e: ŻADNA emisja fleet:buildFailed nie jest już bez planetId');
  A((CM.match(/fleet:buildFailed', \{ planetId/g) ?? []).length >= 7,
    'T2f: wszystkie emisje buildFailed niosą planetId (7 miejsc w startShipBuild)');

  // Kurierzy AI — KAŻDY subskrybent z osobna (vessel:docked ma dwóch).
  for (const ev of ['vessel:launched', 'vessel:docked']) {
    const bodies = handlerBodies(UI, ev);
    A(bodies.length > 0 && bodies.every((b) => /isEnemyVessel\(vessel\)/.test(b)),
      `T3/${ev}: KAŻDY subskrybent (${bodies.length}) odsiewa statki wroga`);
  }
  A(/'director:shipRejected'/.test(readFileSync('src/core/DebugLog.js', 'utf8')),
    'T3c: DebugLog pozostaje NIEFILTROWANY — kanał deweloperski widzi wszystko');
}

// ── T4/T5 — odwrócenie resolvera ────────────────────────────────────────────
console.log('\nT4/T5: adnotacja szablonu wyprowadzana z (kadłub, moduły)');
{
  const ALL = { isResearched: () => true };
  for (const id of Object.keys(SHIP_TEMPLATES)) {
    const r = resolveTemplate(id, ALL);
    if (!r.ok) { A(false, `T4/${id}: szablon nie rozwiązuje się (${r.reason})`); continue; }
    A(matchTemplateId(r.hullId, r.modules) === id,
      `T4/${id}: (${r.hullId} + ${r.modules.length} modułów) → z powrotem „${id}"`);
  }
  A(matchTemplateId('hull_frigate', ['engine_warp']) === null,
    'T4z: przypadkowy ładunek NIE jest dopasowywany (null, nie zgadywanie)');
  A(matchTemplateId(null, null) === null, 'T4y: śmieciowe wejście → null, bez rzutu');

  // Rozłączność katalogu — bez niej adnotacja mogłaby po cichu wskazać zły szablon.
  const seen = new Map();
  let collision = null;
  for (const id of Object.keys(SHIP_TEMPLATES)) {
    const r = resolveTemplate(id, ALL);
    if (!r.ok) continue;
    const k = `${r.hullId}|${[...r.modules].sort().join(',')}`;
    if (seen.has(k)) collision = `${seen.get(k)} ↔ ${id}`;
    seen.set(k, id);
  }
  A(collision === null,
    `T5a: żadne dwa szablony nie dają tego samego ładunku na tym samym kadłubie ${collision ?? ''}`);
}

// ── T6 — adnotacja bez rejestru ─────────────────────────────────────────────
console.log('\nT6: adnotacja przeżywa brak rejestru (przeładowanie + pending→queue)');
{
  const capital = { planetId: 'p_cap', ownerEmpireId: 'emp_001' };
  window.KOSMOS = {
    timeSystem: { gameTime: 10 },
    colonyManager: { getColony: (id) => (id === 'p_cap' ? capital : null), getAllColonies: () => [capital] },
  };
  const prod = new DirectorProduction();
  const r = resolveTemplate('frigate_system_defender', { isResearched: () => true });

  // ZERO wiedzy Directora — dokładnie jak po przeładowaniu strony albo po promocji
  // pending→queue, którą ColonyManager robi sam.
  prod._awaitingClaim.clear();
  const v = { id: 'v_1', shipId: r.hullId, colonyId: 'p_cap', modules: r.modules };
  let ev = null;
  EventBus.on('director:shipCompleted', (d) => { ev = d; });
  EventBus.emit('vessel:created', { vessel: v });

  A(v.ownerEmpireId === 'emp_001', 'T6a: własność (regresja poprzedniej naprawy) — nadal działa');
  A(v.directorOrigin === 'frigate_system_defender',
    `T6b: adnotacja ODTWORZONA bez rejestru (jest „${v.directorOrigin}")`);
  A(ev?.templateId === 'frigate_system_defender', 'T6c: …i trafia do zdarzenia audytu');

  // Statek NIE z katalogu — adnotacji nie zmyślamy.
  const other = { id: 'v_2', shipId: 'hull_small', colonyId: 'p_cap', modules: ['cargo_small'] };
  EventBus.emit('vessel:created', { vessel: other });
  A(other.ownerEmpireId === 'emp_001' && other.directorOrigin === undefined,
    'T6d: statek spoza katalogu ma właściciela, ale BEZ adnotacji (nie zgadujemy)');
  prod.dispose(); EventBus.clear();
}

// ── T7 — round-trip zapisu ──────────────────────────────────────────────────
console.log('\nT7: directorOrigin przeżywa zapis i wczytanie');
{
  const VM = readFileSync('src/systems/VesselManager.js', 'utf8');
  A(/directorOrigin:\s*v\.directorOrigin/.test(VM), 'T7a: serialize zapisuje directorOrigin');
  A(/directorOrigin:\s*vd\.directorOrigin/.test(VM), 'T7b: restore odczytuje directorOrigin');
  A((VM.match(/directorOrigin/g) ?? []).length >= 2,
    'T7c: obie strony round-tripu obecne — bez tego adnotacja ginęłaby przy wczytaniu, '
    + 'czyli dokładnie tam, gdzie zginęła w gate\'cie');
}

// ── T8 — WARSTWA KOLONII (trzecia warstwa tego samego wycieku) ──────────────
// Spot-check po GATE 1 pokazał, że naprawa stoczni (831a3e7) nie objęła zdarzeń ŻYCIA
// kolonii: gracz nadal czytał w Dzienniku o głodzie i niepokojach w koloniach AI.
console.log('\nT8: zdarzenia życia kolonii AI nie trafiają do Dziennika gracza');
{
  const { CivilizationSystem } = await import('../../systems/CivilizationSystem.js');

  // Dziennik-atrapa spięty PRAWDZIWYM predykatem — dokładnie tak, jak robi to UIManager.
  const journal = [];
  const sub = (d) => { if (isPlayerColonyEvent(d?.planetId)) journal.push(d); };
  EventBus.on('civ:famine', sub);

  const colonies = {
    p_ai:     { planetId: 'p_ai', ownerEmpireId: 'emp_001' },
    p_player: { planetId: 'p_player' },
  };
  window.KOSMOS = { colonyManager: { getColony: (id) => colonies[id] ?? null } };

  // PRAWDZIWY emitent: CivilizationSystem doprowadzony do głodu (zapas <1 roku, flow<0).
  const starve = (planetId) => {
    const civ = new CivilizationSystem({ population: 8, housing: 40 },
      { isResearched: () => false }, { id: planetId, name: planetId });
    // `_resourceSnap` to getter czytający resourceSystem.snapshot() — karmimy go u ŹRÓDŁA
    // (pusty magazyn, ujemny bilans), a nie podmianą pola.
    civ.resourceSystem = { snapshot: () => ({ food: { amount: 0, perYear: -5 } }) };
    civ._updateFamine();
    return civ;
  };

  const before = journal.length;
  starve('p_ai');
  A(journal.length === before,
    `T8a: głód w kolonii AI → ZERO wpisów w Dzienniku (było ${journal.length - before})`);

  starve('p_player');
  A(journal.length === before + 1,
    'T8b: głód w kolonii GRACZA → wpis obecny (bramka nie wycisza własnych zdarzeń)');
  A(journal[journal.length - 1]?.planetId === 'p_player', 'T8c: …i to wpis właściwej kolonii');
  EventBus.clear();

  // Bramka wpięta w KAŻDY subskrybent warstwy kolonii (źródło BEZ komentarzy — inaczej pin
  // dałby się spełnić samym opisem defektu).
  for (const ev of ['civ:unrest', 'civ:unrestLifted', 'civ:famine', 'civ:famineLifted',
                    'civ:popBorn', 'civ:popDied', 'civ:epochChanged']) {
    const body = handlerBody(UI, ev) ?? '';
    A(/_isPlayerColonyEvent\(planetId\)/.test(body), `T8d/${ev}: subskrybent ma bramkę`);
  }
  // Dwa wycieki, których NIE było w spisie planu — znalezione dopiero pełnym audytem.
  A(/_isPlayerColonyEvent\(colonyId\)/.test(handlerBody(UI, 'trade:imported') ?? ''),
    'T8e: trade:imported — dostawy kurierów AI odsiane (bramka po colonyId)');
  A(/_isPlayerColonyEvent\(planetId\)/.test(handlerBody(UI, 'impact:colonyDamage') ?? ''),
    'T8f: impact:colonyDamage — uderzenie w kolonię AI odsiane');

  // Bramka bez danych jest ŚLEPA: `civ:popDied` ma dziewięciu emitentów, a tylko dwóch
  // niosło planetId. Poniższe pinuje otagowanie pozostałych (fail-open na siedmiu trasach).
  const MS = codeOnly('src/systems/MissionSystem.js');
  A((MS.match(/civ:popDied'.*planetId: exp\.originColonyId/g) ?? []).length === 3,
    'T8g: wszystkie trzy emisje civ:popDied w MissionSystem niosą planetId');
  const IDS = codeOnly('src/systems/ImpactDamageSystem.js');
  A(/civ:popDied'.*population: civSystem\.population, planetId/.test(IDS),
    'T8h: ImpactDamageSystem przekazuje planetId do civ:popDied');
  A(/_killPops\(civSystem, killCount, planetId\)/.test(IDS),
    'T8i: …bo _applyDamage przekazuje planetId w dół do _killPops');
  const RES = codeOnly('src/systems/RandomEventSystem.js');
  A((RES.match(/civ:pop(Born|Died)'.*planetId: colony\.planetId/g) ?? []).length === 2,
    'T8j: RandomEventSystem taguje obie emisje (player-scoped, ale inwariant trzymany lokalnie)');
  const CS = codeOnly('src/systems/CivilizationSystem.js');
  A(/civ:epochChanged'[\s\S]{0,200}planetId:\s*this\._colonyId/.test(CS),
    'T8k: civ:epochChanged niesie planetId — epoka kolonii AI to nie epoka gracza');

  // DebugLog NIETKNIĘTY — kanał deweloperski ma widzieć wszystko, także kolonie AI.
  const DBG = codeOnly('src/core/DebugLog.js');
  A(!/isPlayerColonyEvent/.test(DBG), 'T8l: DebugLog pozostaje bez bramki właściciela');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
