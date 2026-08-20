// STAN „GRACZ BEZ ŻADNEJ KOLONII" — panele nie wywracają pętli rysowania.
//
// PO CO: GATE P0 §6 złapał NA ŻYWO crash powtarzający się CO KLATKĘ (przycinał ekran):
//   TypeError: Cannot read properties of null (reading 'planetId')
//     at ColonyManager._canRecruitMoreUnits → GroundUnitPanel._drawActions → .draw
//     → FleetManagerOverlay._drawGroundTab
// Stan wyjściowy jest POPRAWNY i PODPISANY (D9=W3, `_detachActiveColony`): gracz bez kolonii ma
// `activePlanetId === null` i odpięte `resourceSystem`/`civSystem`/`buildingSystem`. Wadą było to,
// że helper rekrutacji zakładał żywą kolonię.
//
// ⚠ KSZTAŁT BŁĘDU, dla następnego czytelnika: wołający miał
//     colonyMgr?._canRecruitMoreUnits?.(colony, archId) ?? true
//   — opcjonalne łańcuchowanie chroni ODBIORNIK, nigdy ARGUMENT. `colony` szło do środka jako
//   `null` i dopiero tam wybuchało. Dlatego guard stoi w HELPERZE (to on jest kontraktem), a nie
//   w wołającym: poprawka po stronie wołającego zostawiłaby minę następnemu wywołaniu.
//
//   T1  `_canRecruitMoreUnits(null, …)` → `false`, bez wyjątku.  KONTROLA PINU: z żywą kolonią
//       nadal odpowiada sensownie (nie zabetonowaliśmy `false`).
//   T2  `_getMaxGroundUnits(null)` → 0, bez wyjątku.  KONTROLA PINU: żywa kolonia → ≥ 2.
//   T3  WYKONANIE — `GroundUnitPanel.draw` z `getColony: () => null` NIE rzuca. To jest dosłowne
//       odtworzenie awarii z gate'u (ten sam komunikat), a nie jej opis.
//       KONTROLA PINU: z żywą kolonią `draw` też przechodzi — inaczej test przechodziłby dlatego,
//       że rysowanie jest no-opem.
//   T4  Ścieżka KLIKNIĘCIA: `startGroundUnitBuild` na nieistniejącej koloni → `colony_not_found`,
//       bez wyjątku (crash w handlerze byłby równie realny jak w `draw`).
//
// ⚠ Ten keeper NIE dotyka bramki własności (D1-D6, niepodpisane). Mierzy wyłącznie to, że stan
//    zero-kolonii nie wywraca UI.
//
// Uruchom: node src/testing/smoke/zero_colony_panels_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import { GroundUnitPanel } from '../../ui/GroundUnitPanel.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const EMP = 'emp_001';

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  window.KOSMOS.civMode = true;
  return { core, home: window.KOSMOS.homePlanet, cm: core.colonyManager };
}

/**
 * Atrapa ctx: każda metoda no-op, `measureText` zwraca szerokość, a `fillText` NAGRYWA napisy.
 * Nagrywanie jest potrzebne T5 — inaczej „nie rysujemy pustej kłódki" nie da się odróżnić od
 * „nie rysujemy nic", a to dwie różne rzeczy.
 */
const stubCtx = (sink = []) => new Proxy({ _text: sink }, {
  get: (t, k) => {
    if (k === '_text') return sink;
    if (k in t) return t[k];
    if (k === 'measureText') return (t[k] = () => ({ width: 10 }));
    if (k === 'fillText')    return (t[k] = (s) => { sink.push(String(s)); });
    return (t[k] = () => {});
  },
  set: () => true,
});

/** Panel z wstrzykniętym `getColony` — jedyne wejście, którym sterujemy stanem. */
const makePanel = (getColony) => new GroundUnitPanel({
  addHit: () => {}, getHoverZone: () => null, getMouse: () => ({ x: -1, y: -1 }), getColony,
});

const tryDraw = (getColony, sink) => {
  try { makePanel(getColony).draw(stubCtx(sink), 0, 0, 400, 600); return null; }
  catch (e) { return e; }
};

// ── T1 — helper capu przy braku koloni ─────────────────────────────────────────────────────
console.log('T1 — `_canRecruitMoreUnits(null, …)` odpowiada, zamiast wybuchać');
{
  const { cm } = boot();
  let threw = null, val;
  try { val = cm._canRecruitMoreUnits(null, 'shock_infantry'); } catch (e) { threw = e; }

  assert(threw === null,
    `T1 SEDNO: brak wyjątku przy \`colony === null\` (było: ${threw ? threw.message : '—'})`);
  assert(val === false,
    'T1 SEDNO 2: odpowiedź brzmi NIE MOŻNA — bez koloni nie ma gdzie ani z czego rekrutować ' +
    '(wołający miał `?? true`, co kłamałoby w drugą stronę, gdyby wyjątek nie leciał wcześniej)');
}
{
  // KONTROLA PINU — z żywą kolonią helper nadal liczy cap, a nie zwraca `false` na sztywno.
  const { cm, home } = boot();
  const colony = cm.getColony(home.id);
  assert(cm._canRecruitMoreUnits(colony, 'shock_infantry') === true,
    'T1 KONTROLA PINU: świeża kolonia (zero jednostek) MOŻE rekrutować — guard nie zabetonował `false`');
}

// ── T2 — cap jednostek przy braku koloni ───────────────────────────────────────────────────
console.log('T2 — `_getMaxGroundUnits(null)` → 0, bez wyjątku');
{
  const { cm } = boot();
  let threw = null, val;
  try { val = cm._getMaxGroundUnits(null); } catch (e) { threw = e; }
  assert(threw === null && val === 0,
    `T2 SEDNO: brak koloni ⇒ zero miejsc (dostano: ${threw ? 'THROW ' + threw.message : val})`);
}
{
  // KONTROLA PINU — żywa kolonia dostaje realny cap (min 2 wg Population 2.0).
  const { cm, home } = boot();
  assert(cm._getMaxGroundUnits(cm.getColony(home.id)) >= 2,
    'T2 KONTROLA PINU: żywa kolonia ma cap ≥ 2 (pin mierzy gałąź null, nie kasuje mechaniki)');
}

// ── T3 — WYKONANIE: pętla rysowania panelu przy zero kolonii ───────────────────────────────
console.log('T3 — `GroundUnitPanel.draw` przy zero kolonii NIE rzuca (odtworzenie awarii z gate’u)');
{
  boot();
  const err = tryDraw(() => null);
  assert(err === null,
    `T3 SEDNO: rysowanie panelu jednostek naziemnych przechodzi przy \`getColony() === null\`. ` +
    `To jest DOSŁOWNIE ścieżka z GATE P0 §6 (${err ? err.message : 'brak wyjątku'})`);
}
{
  // KONTROLA PINU — z żywą kolonią `draw` też przechodzi. Bez tego T3 mógłby przechodzić dlatego,
  // że przy `null` panel wychodzi wcześnie i nic nie rysuje.
  const { cm, home } = boot();
  const colony = cm.getColony(home.id);
  const err = tryDraw(() => colony);
  assert(err === null,
    `T3 KONTROLA PINU: z żywą kolonią \`draw\` również przechodzi — test nie mierzy pustego przebiegu ` +
    `(${err ? err.message : 'brak wyjątku'})`);
}

// ── T4 — ścieżka kliknięcia ────────────────────────────────────────────────────────────────
console.log('T4 — rekrutacja na nieistniejącej koloni odmawia, zamiast wybuchać');
{
  const { cm } = boot();
  let threw = null, res;
  try { res = cm.startGroundUnitBuild(null, 'shock_infantry'); } catch (e) { threw = e; }
  assert(threw === null && res?.ok === false && res?.reason === 'colony_not_found',
    `T4 SEDNO: handler kliknięcia odmawia z \`colony_not_found\` (dostano: ` +
    `${threw ? 'THROW ' + threw.message : JSON.stringify(res)})`);
}

// ── T5 — żadnej „gołej kłódki" bez komunikatu ──────────────────────────────────────────────
console.log('T5 — przy zero kolonii nie malujemy czerwonej kłódki bez treści');
{
  boot();
  const sink = [];
  const err = tryDraw(() => null, sink);
  const bareLock = sink.filter(s => s.trim() === '🔒');

  assert(err === null && bareLock.length === 0,
    `T5 SEDNO: zero napisów „🔒" bez treści (znaleziono ${bareLock.length}). Powód \`no_colony\` nie ` +
    'ma własnego tekstu, więc gałąź kłódki malowała sam czerwony znak zakazu — bez wyjaśnienia, ' +
    'dokładnie wtedy, gdy gracz najbardziej go potrzebuje');
  assert(sink.length > 0,
    'T5 KONTROLA PINU 1: panel W OGÓLE coś narysował — inaczej T5 przechodziłby, bo `draw` nic nie robi');
}
{
  // KONTROLA PINU 2 — kłódka Z TREŚCIĄ nadal się maluje, gdy powód jest realny (brak koszar).
  // Świeża kolonia gracza nie ma koszar, więc `_getGatingStatus` zwraca `barracks`.
  const { cm, home } = boot();
  const colony = cm.getColony(home.id);
  const sink = [];
  tryDraw(() => colony, sink);
  const locks = sink.filter(s => s.startsWith('🔒'));
  assert(locks.length > 0 && locks.every(s => s.trim().length > 2),
    `T5 KONTROLA PINU 2: przy realnym powodzie kłódka NADAL się maluje i ma treść ` +
    `(${JSON.stringify(locks)}) — nie wyciszyliśmy całej gałęzi gatingu`);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} zero_colony_panels: ${pass} PASS, ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
