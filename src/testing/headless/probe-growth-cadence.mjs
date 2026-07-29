// ═══════════════════════════════════════════════════════════════
// PROBE (pomiar, Slice 5A POINT 2) — KADENCJA wzrostu logistycznego
// Uruchom: node src/testing/headless/probe-growth-cadence.mjs
// ───────────────────────────────────────────────────────────────
// Pytanie Filipa (gate 5A, POINT 2): z capem 1.0/civYr widać nowy POP ~co
// GAME-MONTH (~12× za szybko). Czy to LEAK (regresja kadencji / druga ścieżka
// wzrostu / podwójny fire) czy CORRECT-but-fast (cap /civYr × 12 civYr/gameYr)?
//
// Metoda (WIERNA — napędza PRAWDZIWY TimeSystem, nie ręczne civDeltaYears=1):
//   • TimeSystem @1d/s (multiplierIndex=1) — DOMYŚLNA prędkość ORAZ cel auto-slow.
//   • Frame-loop z UŁAMKOWYM civDeltaYears (~0.137/tick, nigdy nie ląduje na
//     granicy civYear) → STRESUJE akumulator `_accumYears` w _update.
//   • Wrap `_updateLogisticGrowth`: liczy WYWOŁANIA + PROMOCJE (Δ_unemployed
//     tylko w obrębie tej metody) + indeks civYear (detekcja double-fire).
//   • Izolacja: _updatePopDeath/_updateFamine/_updateUnrest → no-op (śmierć NIE
//     zafałszowuje kadencji; mierzymy CZYSTY wzrost przy cap-saturacji).
//
// WERDYKT:
//   calls === floor(civYearsElapsed)  → wzrost RAZ/civYear (brak leaku/double-fire).
//   promotions/gameYear ≈ 12          → cap saturuje → CORRECT-but-fast (nie leak).
//   promotions/gameYear >> 12 lub calls > civYears → LEAK (napraw leak, nie stałą).
// ═══════════════════════════════════════════════════════════════

import './env.js'; // MUST be first
import EventBus from '../../core/EventBus.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { ResourceSystem } from '../../systems/ResourceSystem.js';
import { CivilizationSystem } from '../../systems/CivilizationSystem.js';
import { TimeSystem } from '../../systems/TimeSystem.js';
import { MAX_GROWTH_PER_YEAR } from '../../data/PopulationData.js';

const CIV_TIME_SCALE = GAME_CONFIG.CIV_TIME_SCALE; // 12

// ── Kolonia gracza: breathable, mid-pop, DUŻE housing (cap-saturacja) ─────────
const planet = { id: 'home', atmosphere: 'breathable', temperatureC: 15, surfaceGravity: 1.0 };
const civ = new CivilizationSystem({}, null, planet);
civ.resourceSystem = new ResourceSystem({});
civ.housing = 400;                       // Σ housing — pozostaje daleko od cap przez cały pomiar
for (const s of Object.values(civ.strata)) s.count = 0;
civ.strata.laborer.count = 80;           // humans≈80 → uncapped ~2.1/civYr → SATURUJE cap 1.0
civ._growthProgress = 0;
civ._unemployed = 0;

window.KOSMOS = { civMode: true, civSystem: civ, timeSystem: { gameTime: 0 } };

// Izolacja: usuń śmierć/kryzysy (nie zmieniają kadencji wzrostu, ale zafałszowałyby
// „promocje/gameYear" przez ubytek humans). Mierzymy CZYSTĄ kadencję wzrostu.
civ._updatePopDeath = () => {};
civ._updateFamine   = () => {};
civ._updateUnrest   = () => {};

// ── Instrumentacja: wrap _updateLogisticGrowth ───────────────────────────────
const origGrowth = civ._updateLogisticGrowth.bind(civ);
let calls = 0;
let promotions = 0;
const callCivYearIdx = [];               // indeks civYear przy każdym wywołaniu (detekcja double-fire)
let expectedCivYears = 0;                // akumulator prawdy (sumujemy civDeltaYears feedowane)

civ._updateLogisticGrowth = function () {
  const u0 = this._unemployed;
  origGrowth();
  calls++;
  promotions += (this._unemployed - u0);
  callCivYearIdx.push(Math.floor(expectedCivYears + 1e-9));
};

// ── Pętla: PRAWDZIWY TimeSystem @1d/s, ułamkowy civDeltaYears/tick ────────────
const time = new TimeSystem();
time.setMultiplier(1);                   // 1d/s — domyślna prędkość + cel auto-slow
time.isPaused = false;
window.KOSMOS.timeSystem = time;

// deltaMs tak dobrany, by civDeltaYears/tick = TICK_CIV (ułamek NIE dzielący 1 równo)
const TICK_CIV = 0.137;                   // civYears per tick (irracjonalny wzgl. 1 → stresuje akumulator)
const mult = GAME_CONFIG.TIME_MULTIPLIERS[1];   // 1/365.25 (gameYr/s)
const deltaMs = (TICK_CIV / (CIV_TIME_SCALE * mult)) * 1000;

const TOTAL_GAME_YEARS = 10;
const TOTAL_CIV_YEARS  = TOTAL_GAME_YEARS * CIV_TIME_SCALE;  // 120
const TOTAL_TICKS = Math.ceil(TOTAL_CIV_YEARS / TICK_CIV);

// Per-gameYear bucket
const perGameYear = [];                   // { gy, civYearsThisGY, callsThisGY, promosThisGY, popEnd, humansEnd, growthNow }
let prevGameYearFloor = 0;
let callsAtGYStart = 0, promosAtGYStart = 0, civYearsAtGYStart = 0;

console.log(`Pipeline: TimeSystem @1d/s | mult=${mult.toFixed(6)} gameYr/s | civDeltaYears/tick=${TICK_CIV} | deltaMs/tick=${deltaMs.toFixed(1)}`);
console.log(`Kolonia: breathable, housing=400, start humans=80 (cap-saturacja) | MAX_GROWTH_PER_YEAR=${MAX_GROWTH_PER_YEAR}/civYr`);
console.log('');
console.log('gy | civYr(this) | growthCalls(this) | promos(this) | pop  humans   growth/civYr(getAnnualGrowth)');
console.log('---+-------------+-------------------+--------------+------------------------------------------');

for (let tick = 0; tick < TOTAL_TICKS; tick++) {
  time.isPaused = false;
  time.update(deltaMs);
  expectedCivYears += TICK_CIV;

  const gyFloor = Math.floor(time.gameTime + 1e-9);
  if (gyFloor > prevGameYearFloor) {
    const callsThisGY  = calls - callsAtGYStart;
    const promosThisGY = promotions - promosAtGYStart;
    const civYearsThisGY = expectedCivYears - civYearsAtGYStart;
    perGameYear.push({
      gy: gyFloor, civYearsThisGY, callsThisGY, promosThisGY,
      popEnd: civ.population, humansEnd: civ.humans, growthNow: civ.getAnnualGrowth(),
    });
    console.log(
      `${String(gyFloor).padStart(2)} | ${civYearsThisGY.toFixed(2).padStart(11)} | ${String(callsThisGY).padStart(17)} | ${String(promosThisGY).padStart(12)} | ${String(civ.population).padStart(3)} ${civ.humans.toFixed(2).padStart(7)}   ${civ.getAnnualGrowth().toFixed(4)}`
    );
    callsAtGYStart = calls; promosAtGYStart = promotions; civYearsAtGYStart = expectedCivYears;
    prevGameYearFloor = gyFloor;
  }
}

// ── Werdykt ──────────────────────────────────────────────────────────────────
console.log('\n═══ WERDYKT KADENCJI ═══');
const floorCiv = Math.floor(expectedCivYears + 1e-9);
console.log(`Sumaryczne civYears feedowane: ${expectedCivYears.toFixed(3)} (floor=${floorCiv})`);
console.log(`_updateLogisticGrowth wywołań:  ${calls}`);
console.log(`Promocje (nowe POP-y łącznie):  ${promotions}`);

// (1) Kadencja: dokładnie floor(civYears) wywołań?
const cadenceOk = calls === floorCiv;
console.log(`\n(1) calls === floor(civYears)?  ${cadenceOk ? 'TAK' : 'NIE'}  (${calls} vs ${floorCiv})`);
console.log(`    → ${cadenceOk ? 'wzrost RAZ na civYear — BRAK regresji akumulatora' : '⚠ ROZJAZD — potencjalny leak/podwójny fire'}`);

// (2) Double-fire: czy jakiś indeks civYear powtórzył się?
const seen = new Set(); let dup = 0;
for (const idx of callCivYearIdx) { if (seen.has(idx)) dup++; else seen.add(idx); }
console.log(`\n(2) double-fire (powtórzony indeks civYear)?  ${dup === 0 ? 'BRAK (0)' : '⚠ ' + dup + ' powtórzeń'}`);

// (3) Tempo: promocje/gameYear w reżimie cap-saturacji ≈ 12?
const satWindow = perGameYear.slice(1, 6);   // gy2..gy6, gdy humans jeszcze cap-saturuje
const avgPromosPerGY = satWindow.reduce((a, r) => a + r.promosThisGY, 0) / (satWindow.length || 1);
const avgCallsPerGY  = satWindow.reduce((a, r) => a + r.callsThisGY, 0) / (satWindow.length || 1);
console.log(`\n(3) reżim cap-saturacji (gy2..gy6): śr. promocje/gameYear=${avgPromosPerGY.toFixed(2)}  śr. calls/gameYear=${avgCallsPerGY.toFixed(2)}`);
console.log(`    Oczekiwane przy cap 1.0/civYr × ${CIV_TIME_SCALE} civYr/gameYr = ~${CIV_TIME_SCALE} promocji/gameYear.`);
const fast = avgPromosPerGY >= CIV_TIME_SCALE - 2 && avgPromosPerGY <= CIV_TIME_SCALE + 1;

// (4) real-time cadence przy 1d/s
const realSecPerCivYear = 1 / (CIV_TIME_SCALE * mult);     // s realne na 1 civYear @1d/s
console.log(`\n(4) real-time @1d/s: 1 civYear = ${realSecPerCivYear.toFixed(1)} s realne = 1 game-month → nowy POP co ~${realSecPerCivYear.toFixed(0)} s (przy cap-saturacji).`);

console.log('\n═══ KONKLUZJA ═══');
if (cadenceOk && dup === 0 && fast) {
  console.log('CORRECT-but-FAST: wzrost odpala DOKŁADNIE raz/civYear (brak leaku, brak double-fire,');
  console.log('brak drugiej ścieżki). „~1 POP/game-month" = cap 1.0/civYear × 12 civYr/gameYr = poprawna');
  console.log('kadencja, tylko RATE za wysoki. → retune MAX_GROWTH_PER_YEAR (NIE naprawiaj „leaku").');
} else {
  console.log('⚠ ANOMALIA — patrz werdykty (1)-(3). Jeśli calls>civYears lub double-fire>0 → LEAK: napraw');
  console.log('mechanizm PRZED zmianą stałej (memory rule: NIE obniżaj stałej nad leakiem).');
}
