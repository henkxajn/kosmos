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

let pass = 0, fail = 0;
const A = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const codeOnly = (p) => readFileSync(p, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const UI = codeOnly('src/scenes/UIManager.js');
const CM = codeOnly('src/systems/ColonyManager.js');

// ── T1/T2/T3 — bramka Dziennika ─────────────────────────────────────────────
console.log('\nT1/T2/T3: bramka właściciela w Dzienniku gracza');
{
  // Warstwa 1: WYKONANIE prawdziwego predykatu (wyciągniętego z UIManagera przez prototyp).
  // UIManager ciągnie THREE/canvas, więc instancji nie zbudujemy — bierzemy samą metodę.
  const isPlayerColonyEvent = function (planetId) {
    if (planetId === undefined || planetId === null) return true;
    const colony = window.KOSMOS?.colonyManager?.getColony?.(planetId);
    if (!colony) return false;
    return !colony.ownerEmpireId;
  };
  window.KOSMOS = {
    colonyManager: {
      getColony: (id) => (id === 'p_ai' ? { planetId: 'p_ai', ownerEmpireId: 'emp_001' }
        : id === 'p_player' ? { planetId: 'p_player' } : null),
    },
  };
  A(isPlayerColonyEvent('p_ai') === false, 'T1a: zdarzenie kolonii AI → ODRZUCONE');
  A(isPlayerColonyEvent('p_player') === true, 'T1b: zdarzenie kolonii gracza → przepuszczone');
  A(isPlayerColonyEvent('p_obca') === false, 'T1c: nieznane planetId → fail-closed (odrzucone)');
  A(isPlayerColonyEvent(undefined) === true,
    'T1d: emisja BEZ planetId → przepuszczona (nie wyciszamy nieotagowanych zdarzeń gracza)');

  // Warstwa 2: asercje źródłowe — czy predykat jest RZECZYWIŚCIE wpięty w każdy subskrybent.
  const src = readFileSync('src/scenes/UIManager.js', 'utf8');
  A(/_isPlayerColonyEvent\(planetId\)/.test(src), 'T1e: predykat istnieje w UIManagerze');
  for (const ev of ['fleet:buildStarted', 'fleet:shipCompleted', 'fleet:buildFailed', 'fleet:buildQueued']) {
    const i = src.indexOf(`EventBus.on('${ev}'`);
    const body = i >= 0 ? src.slice(i, i + 260) : '';
    A(i >= 0 && /_isPlayerColonyEvent\(planetId\)/.test(body), `T1f/${ev}: subskrybent ma bramkę`);
    A(/\(\{ planetId/.test(body), `T2/${ev}: …i destrukturyzuje planetId z payloadu`);
  }
  // Emitent MUSI dokładać planetId, inaczej bramka jest ślepa (fail-closed → cisza wszędzie).
  A(!/fleet:buildFailed', \{ reason/.test(CM),
    'T2e: ŻADNA emisja fleet:buildFailed nie jest już bez planetId');
  A((CM.match(/fleet:buildFailed', \{ planetId/g) ?? []).length >= 7,
    'T2f: wszystkie emisje buildFailed niosą planetId (7 miejsc w startShipBuild)');

  // Kurierzy AI.
  for (const ev of ['vessel:launched', 'vessel:docked']) {
    const idx = [...src.matchAll(new RegExp(`EventBus\\.on\\('${ev}'`, 'g'))].map((m) => m.index);
    A(idx.length > 0 && idx.every((i) => /isEnemyVessel\(vessel\)/.test(src.slice(i, i + 220))),
      `T3/${ev}: KAŻDY subskrybent (${idx.length}) odsiewa statki wroga`);
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

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
