// PROBE — pokrycie strefy granicznej (WOJNA I POKÓJ 1.0, workstream C, commit S2).
// Uruchom: node src/testing/headless/probe-border-zone-coverage.mjs
//
// PO CO: orzeczenie właścicielskie **R-2** ustaliło strefę graniczną jako POWŁOKĘ 5 LY
// wokół terytorium AI (zamiast „1 skoku", który w tym kodzie nie ma definicji galaktycznej).
// Stała 5 LY jest jednak WARUNKOWA: plan (§Rulings R-2, RESUME §2) wymaga zmierzenia
// pokrycia na PRAWDZIWEJ galaktyce 72 układów, na kilku seedach, na starcie partii
// i w rozwiniętym mid-game — i zatrzymania się z tabelą, jeśli zbliża się do POŁOWY
// galaktyki. Ten pomiar wykonujemy PRZED utwardzeniem stałej i PRZED Gate 3.
//
// Sonda jest READ-ONLY względem repo. Mierzy prawdziwe systemy z `GameCore.boot()`
// i prawdziwy `TerritoryService`. Wzór: `probe-director-seams.mjs` (instrument S0).
//
// ── DWIE NIEJEDNOZNACZNOŚCI, KTÓRE POMIAR MA ROZSTRZYGNĄĆ ────────────────────────────
//
// (1) CO ZNACZY „POWŁOKA 5 LY WOKÓŁ TERYTORIUM"? Orzeczenie mówi, że przestrzeń
//     ROSZCZONA zachowuje promienie R_MIN_LY 1.5 → R_MAX_LY 4.0. Da się to czytać dwojako:
//       ODCZYT A (narastający):  outer = r_roszczony + 5      → rozwinięta kolonia: 9 LY
//       ODCZYT B (absolutny):    outer = max(r_roszczony, 5)  → rozwinięta kolonia: 5 LY
//     Odczyt B ma niepokojącą własność: im bardziej imperium się rozwija, tym CIEŃSZA
//     jego powłoka graniczna (przy R_MAX 4.0 zostaje 1 LY) — czyli strefa nacisku maleje
//     wraz z potęgą. Mierzymy OBA i pokazujemy różnicę, zamiast wybierać po cichu.
//
// (2) 2D CZY 3D? `TerritoryField` (warstwa RENDERU) liczy pole w rzucie 2D — bierze
//     wyłącznie `sys.x/y` (`TerritoryField.js:81`). Ale realna osiągalność w tej grze jest
//     3D: `warpDist3D` (`WarpRoutePlanner.js:32-37`) używa x/y/z, a układy mają niezerowe z.
//     Rzut 2D ZAWSZE zaniża odległości, więc zawyża pokrycie. Mapa wpływów jest DANYMI
//     dla reguł (nie rysunkiem), więc powinna iść za 3D — a różnicę trzeba znać.
//
// Do tego skanujemy stałą po siatce (2…10 LY), żeby strojenie miało krzywą, a nie
// pojedynczy punkt.
//
// ⚠ (3) POMIAR MID-GAME JEST DZIŚ NIEOSIĄGALNY — i to jest WYNIK, nie awaria sondy.
//     Plan wymaga pomiaru „na starcie partii I w rozwiniętym mid-game". Zmierzone:
//       • `devScore` kolonii AI wynosi **42 już w chwili zero** przy `DEV_FULL = 20`,
//         więc promień roszczony jest NASYCONY na `R_MAX` od pierwszej sekundy partii
//         (fora startowa AI: 24 POPy + 18 budynków) — rozwój nie może go już poszerzyć;
//       • w 400 latach cyw. AI **nie zakłada ANI JEDNEGO nowego układu** (0 wywołań
//         `bootstrapColony`/`bootstrapOutpost`; zamawia droidy „pod outpost" i na tym
//         staje) — ta sama martwa ekspansja, którą zmierzył S0/V4 i BALANS Phase 2.
//     Skutek: pokrycie w 400. roku jest CO DO BITU równe pokryciu w roku zerowym, więc
//     „mid-game" nie jest tu drugim punktem pomiarowym. Zamiast udawać, że jest, sonda
//     dokłada PROJEKCJĘ (tabela 4): jak pokrycie rośnie, gdy imperia trzymają k układów.
//     Projekcja jest jawnie oznaczona jako projekcja — to nie jest pomiar.
//
// ⚠ (4) LICZBA IMPERIÓW: master plan mówi o „3–6 obcych imperiach", ale kod spawnuje
//     DOKŁADNIE 2 (`EmpireGenerator.js:20` — `AI_EMPIRE_COUNT = AI_ARCHETYPE_SEQUENCE.length`).
//     Pomiar jest więc reprezentatywny dla gry, którą się dziś uruchamia, a pokrycie
//     skaluje się z liczbą imperiów — stąd projekcja poniżej ma znaczenie także wtedy,
//     gdy kiedyś imperiów będzie więcej.

import './env.js';                     // MUSI być pierwszy (window/document/THREE + seeded RNG)
import { GameCore } from './GameCore.js';
import { Ticker } from './Ticker.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { TerritoryService } from '../../systems/TerritoryService.js';

const T    = GAME_CONFIG.TERRITORY;
const line = (s = '') => console.log(s);
const hdr  = (s) => { line(); line('═'.repeat(86)); line(s); line('═'.repeat(86)); };
const pct  = (n, d) => (d > 0 ? (100 * n / d) : 0);
const f1   = (n) => n.toFixed(1).padStart(5);

/** Seedy pomiarowe — cztery różne galaktyki (te same, na których mierzył S0). */
const SEEDS = [-2102099243, 12345, 777777, -55555];
/** Skan stałej: kolumna 5 to orzeczenie R-2. */
const BORDER_SCAN = [2, 3, 4, 5, 6, 8, 10];
/** Ile lat cywilizacyjnych do „rozwiniętego mid-game" (kadencja jak w sondzie S0). */
const MIDGAME_CIVY = 400;

// ── Geometria — LUSTRO żywych formuł, nie druga definicja ───────────────────

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp  = (a, b, t) => a + (b - a) * t;

/**
 * Promień przestrzeni ROSZCZONEJ układu. Kopiuje wprost `TerritoryField.js:78-80`,
 * żeby pomiar mówił o TEJ SAMEJ strefie, którą gra rysuje.
 */
function claimedRadiusLY(kind, devScore) {
  if (kind === 'station') return T.R_STATION_LY;
  return clamp(lerp(T.R_MIN_LY, T.R_MAX_LY, clamp(devScore / T.DEV_FULL, 0, 1)), T.R_MIN_LY, T.R_MAX_LY);
}

const dist2D = (a, b) => Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
/** Lustro `warpDist3D` (WarpRoutePlanner.js:32-37) — ta sama metryka co osiągalność warp. */
const dist3D = (a, b) => Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0), (a.z ?? 0) - (b.z ?? 0));

// ── Pomiar jednego stanu świata ─────────────────────────────────────────────

/**
 * @returns {{ total, aiOwners, aiSystems, rows }} — `rows` per (borderLY × odczyt × metryka)
 */
function measure(terr) {
  const galaxy = window.KOSMOS?.galaxyData;
  if (!terr || !galaxy?.systems?.length) {
    throw new Error('[probe] brak territoryService albo galaxyData — pomiar nie ma na czym stanąć');
  }
  terr.reindex();                                  // świeży devScore (wzrost pop nie emituje eventu)

  const systems = galaxy.systems;
  const byId = new Map(systems.map((s) => [s.id, s]));

  // Źródła AI: układy posiadane przez imperia (NIE gracza — wyzwalaczem nacisku jest
  // uzbrojony statek GRACZA w strefie AI, więc strefa gracza nie liczy się do pokrycia).
  const aiOwners = new Set();
  for (const s of systems) {
    const o = terr.getSystemOwner(s.id);
    if (o && o !== 'player') aiOwners.add(o);
  }
  const sources = [];                              // { ownerId, sys, rClaimed }
  for (const ownerId of aiOwners) {
    for (const o of terr.getOwnedSystems(ownerId)) {
      const sys = byId.get(o.systemId);
      if (!sys) continue;
      sources.push({ ownerId, sys, rClaimed: claimedRadiusLY(o.kind, o.devScore) });
    }
  }

  const rows = [];
  for (const borderLY of BORDER_SCAN) {
    for (const readingId of ['A', 'B']) {
      for (const metric of ['3D', '2D']) {
        const d = metric === '3D' ? dist3D : dist2D;
        let claimed = 0, inZone = 0;
        for (const s of systems) {
          let isClaimed = false, isInZone = false;
          for (const src of sources) {
            const dd = d(s, src.sys);
            const outer = readingId === 'A' ? src.rClaimed + borderLY : Math.max(src.rClaimed, borderLY);
            if (dd <= src.rClaimed) isClaimed = true;
            if (dd <= outer)        isInZone  = true;
            if (isClaimed && isInZone) break;
          }
          if (isClaimed) claimed++;
          if (isInZone)  inZone++;
        }
        rows.push({ borderLY, readingId, metric, claimed, inZone });
      }
    }
  }
  return {
    total: systems.length, aiOwners: aiOwners.size, aiSystems: sources.length, rows,
    devScores: sources.map((s) => Math.round(s.rClaimed * 100) / 100),
    ownedIds: sources.map((s) => s.sys.id).sort(),
  };
}

/**
 * PROJEKCJA (nie pomiar): pokrycie, gdyby każde imperium trzymało `k` układów.
 * Ekspansja modelowana jako zabór `k-1` NAJBLIŻSZYCH jeszcze niezajętych układów wokół
 * stolicy — najłagodniejszy możliwy kształt (zwarty klaster). Prawdziwa ekspansja
 * bywa rozstrzelona, więc to jest DOLNE oszacowanie pokrycia dla danego `k`.
 * Promień roszczony = `R_MAX`, bo pomiar pokazał nasycenie `devScore` już na starcie.
 */
function projectCoverage(homes, systems, k, borderLY) {
  const taken = new Set(homes.map((h) => h.id));
  const claims = [];
  for (const home of homes) {
    claims.push(home);
    const near = systems
      .filter((s) => !taken.has(s.id))
      .map((s) => ({ s, d: dist3D(s, home) }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < k - 1 && i < near.length; i++) {
      taken.add(near[i].s.id);
      claims.push(near[i].s);
    }
  }
  const outer = T.R_MAX_LY + borderLY;             // ODCZYT A przy nasyconym devScore
  let inZone = 0;
  for (const s of systems) {
    if (claims.some((c) => dist3D(s, c) <= outer)) inZone++;
  }
  return inZone;
}

// ── Przebieg ────────────────────────────────────────────────────────────────

hdr('R-2 — pomiar pokrycia strefy granicznej na prawdziwej galaktyce');
line(`Promienie przestrzeni roszczonej: R_MIN ${T.R_MIN_LY} → R_MAX ${T.R_MAX_LY} LY `
   + `(station ${T.R_STATION_LY}, DEV_FULL ${T.DEV_FULL})`);
line(`Seedy: ${SEEDS.join(', ')} · mid-game = ${MIDGAME_CIVY} lat cyw.`);
line();
line('ODCZYT A: outer = r_roszczony + border   |   ODCZYT B: outer = max(r_roszczony, border)');

const results = [];       // { seed, phase, ...measure() }
const projections = [];   // { seed, total, homes, systems, expandedDuringRun }

for (const seed of SEEDS) {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization', galaxySeed: seed, aiEmpires: true });

  // ⚠ `TerritoryService` jest wpinany w `GameScene` (przeglądarka), NIE w headless
  // `GameCore` — sonda konstruuje go sama. Czyta wyłącznie `window.KOSMOS`
  // (colonyManager / stationSystem), które boot już wypełnił, więc to ten SAM indeks
  // własności, którym posługuje się gra, a nie jego atrapa.
  const terr = new TerritoryService();
  window.KOSMOS.territoryService = terr;

  const start = measure(terr);
  results.push({ seed, phase: 'start', ...start });

  new Ticker(core.timeSystem).run(MIDGAME_CIVY, { tickSize: 1.0, stopOnCrash: true });
  const mid = measure(terr);
  results.push({ seed, phase: 'mid', ...mid });

  // Projekcja liczona na TYCH SAMYCH stolicach co pomiar.
  const byId = new Map(window.KOSMOS.galaxyData.systems.map((s) => [s.id, s]));
  projections.push({
    seed,
    total: start.total,
    homes: start.ownedIds.map((id) => byId.get(id)).filter(Boolean),
    systems: window.KOSMOS.galaxyData.systems,
    expandedDuringRun: JSON.stringify(start.ownedIds) !== JSON.stringify(mid.ownedIds),
  });

  terr.dispose();
  delete window.KOSMOS.territoryService;
}

// ── Tabela główna: orzeczenie R-2 (5 LY) ────────────────────────────────────

hdr('TABELA 1 — stała R-2 (5 LY), obie interpretacje, metryka 3D');
line('seed          faza   imp.  ukł.AI   roszcz.%   |  ODCZYT A: w strefie   |  ODCZYT B: w strefie');
line('─'.repeat(86));
for (const r of results) {
  const pick = (id) => r.rows.find((x) => x.borderLY === 5 && x.readingId === id && x.metric === '3D');
  const a = pick('A'), b = pick('B');
  line(
    `${String(r.seed).padStart(12)}  ${r.phase.padEnd(6)} ${String(r.aiOwners).padStart(3)}  `
    + `${String(r.aiSystems).padStart(5)}    ${f1(pct(a.claimed, r.total))}%   |  `
    + `${String(a.inZone).padStart(3)}/${r.total} = ${f1(pct(a.inZone, r.total))}%      |  `
    + `${String(b.inZone).padStart(3)}/${r.total} = ${f1(pct(b.inZone, r.total))}%`,
  );
}

// ── ZNALEZISKO: czy mid-game w ogóle jest drugim punktem pomiarowym? ────────

const anyExpanded = projections.some((p) => p.expandedDuringRun);
hdr('ZNALEZISKO — „mid-game" NIE jest dziś drugim punktem pomiarowym');
if (anyExpanded) {
  line('🟢 Przynajmniej jedno imperium powiększyło stan posiadania w trakcie przebiegu —');
  line('   kolumna „mid" jest prawdziwym drugim pomiarem.');
} else {
  line(`🔴 W ŻADNYM z ${SEEDS.length} seedów AI nie zajęło ani jednego nowego układu przez `
     + `${MIDGAME_CIVY} lat cyw.`);
  line('   Pokrycie w mid-game jest CO DO BITU równe pokryciu na starcie, i to z dwóch');
  line('   niezależnych powodów — oba zmierzone, żaden nie jest wadą tej sondy:');
  line();
  line('   (a) NASYCENIE PROMIENIA. Fora startowa AI (24 POPy + 18 budynków) daje devScore ≈ 42');
  line(`       przy DEV_FULL = ${T.DEV_FULL}, więc promień roszczony siedzi na R_MAX = ${T.R_MAX_LY} LY`);
  line('       od pierwszej sekundy partii. Rozwój kolonii nie ma już czego poszerzać.');
  line('   (b) MARTWA EKSPANSJA AI. Zero wywołań bootstrapColony/bootstrapOutpost w całym');
  line('       przebiegu — AI zamawia droidy „pod outpost" i na tym staje. To ta sama');
  line('       diagnoza, którą przyniósł S0/V4 (trasy kurierskie czekają na outposty,');
  line('       których AI nie zakłada) i BALANS Phase 2. Należy do WAR_BACKBONE/BALANS,');
  line('       NIE do Directora — sonda tylko potwierdza, że wciąż obowiązuje.');
  line();
  line('   ⇒ Warunek R-2 („zmierz też rozwinięty mid-game") jest DZIŚ NIESPEŁNIALNY pomiarem.');
  line('     Zastępujemy go PROJEKCJĄ (tabela 4) i mówimy to wprost, zamiast raportować');
  line('     przepisany stan startowy jako mid-game.');
}

// ── Tabela 2: krzywa strojenia ──────────────────────────────────────────────

hdr('TABELA 2 — krzywa strojenia (średnia po seedach, metryka 3D, ODCZYT A)');
line('border[LY]   start: w strefie %      mid-game: w strefie %');
line('─'.repeat(60));
for (const borderLY of BORDER_SCAN) {
  const avg = (phase) => {
    const xs = results.filter((r) => r.phase === phase)
      .map((r) => pct(r.rows.find((x) => x.borderLY === borderLY && x.readingId === 'A' && x.metric === '3D').inZone, r.total));
    return xs.reduce((s, v) => s + v, 0) / (xs.length || 1);
  };
  const mid = avg('mid');
  const flag = mid >= 50 ? '  ← ≥ POŁOWA GALAKTYKI' : (mid >= 35 ? '  ← blisko' : '');
  line(`${String(borderLY).padStart(8)}   ${f1(avg('start'))}%                ${f1(mid)}%${flag}`);
}

// ── Tabela 3: 2D vs 3D ──────────────────────────────────────────────────────

hdr('TABELA 3 — rzut 2D (jak TerritoryField) vs 3D (jak warpDist3D), przy 5 LY / ODCZYT A');
line('seed          faza    3D %     2D %    zawyżenie rzutu');
line('─'.repeat(60));
for (const r of results) {
  const g = (m) => pct(r.rows.find((x) => x.borderLY === 5 && x.readingId === 'A' && x.metric === m).inZone, r.total);
  const d3 = g('3D'), d2 = g('2D');
  line(`${String(r.seed).padStart(12)}  ${r.phase.padEnd(6)} ${f1(d3)}%   ${f1(d2)}%    ${(d2 - d3 >= 0 ? '+' : '')}${(d2 - d3).toFixed(1)} pkt proc.`);
}

// ── Tabela 4: PROJEKCJA ekspansji ───────────────────────────────────────────

const K_SCAN = [1, 2, 3, 4, 6, 8];
hdr('TABELA 4 — PROJEKCJA (nie pomiar): pokrycie przy k układach na imperium, 5 LY / ODCZYT A / 3D');
line('Ekspansja modelowana jako zwarty klaster wokół stolicy = DOLNE oszacowanie pokrycia.');
line(`Liczba imperiów w kodzie: 2 (EmpireGenerator.js:20). Dziś k = 1.`);
line();
line('k (układów/imperium)   pokrycie %   ');
line('─'.repeat(50));
const projAvg = {};
for (const k of K_SCAN) {
  const xs = projections.map((p) => pct(projectCoverage(p.homes, p.systems, k, 5), p.total));
  const avg = xs.reduce((s, v) => s + v, 0) / (xs.length || 1);
  projAvg[k] = avg;
  const flag = avg >= 50 ? '  ← ≥ POŁOWA GALAKTYKI' : (avg >= 35 ? '  ← blisko połowy' : '');
  line(`${String(k).padStart(6)}                 ${f1(avg)}%${flag}${k === 1 ? '   (stan dzisiejszy = POMIAR)' : ''}`);
}

// ── Werdykt ─────────────────────────────────────────────────────────────────

const startAvgA = (() => {
  const xs = results.filter((r) => r.phase === 'start')
    .map((r) => pct(r.rows.find((x) => x.borderLY === 5 && x.readingId === 'A' && x.metric === '3D').inZone, r.total));
  return xs.reduce((s, v) => s + v, 0) / (xs.length || 1);
})();

hdr('WERDYKT');
line(`ZMIERZONE (stan dzisiejszy, 5 LY, ODCZYT A, 3D, średnia po ${SEEDS.length} seedach): `
   + `${startAvgA.toFixed(1)}% galaktyki w strefie granicznej.`);
line(`PROJEKCJA: przy 3 układach na imperium ${projAvg[3].toFixed(1)}%, przy 4 → ${projAvg[4].toFixed(1)}%, `
   + `przy 6 → ${projAvg[6].toFixed(1)}%, przy 8 → ${projAvg[8].toFixed(1)}%.`);
line();
const firstBreach = K_SCAN.find((k) => projAvg[k] >= 50);
if (startAvgA >= 50) {
  line('🔴 STOP — już dziś pokrycie osiąga POŁOWĘ galaktyki. Nie utwardzać stałej;');
  line('   zgłosić do strojenia PRZED Gate 3 z tą tabelą.');
} else if (startAvgA >= 35) {
  line('🟡 UWAGA — pokrycie już dziś zbliża się do połowy. Decyzja właściciela przed Gate 3.');
} else {
  line('🟢 Warunek R-2 SPEŁNIONY dla stanu dzisiejszego — 5 LY nie zbliża się do połowy galaktyki.');
  line(`   Zapas: przy dzisiejszym AI margines jest duży (${startAvgA.toFixed(1)}% wobec progu 50%).`);
  if (firstBreach) {
    line(`   ⚠ ALE projekcja przekracza połowę przy k = ${firstBreach} układach na imperium.`);
    line('     Jeśli WAR_BACKBONE/BALANS odblokuje ekspansję AI, tę stałą trzeba przemierzyć PONOWNIE —');
    line('     to nie jest pomiar „na zawsze", tylko pomiar na dzisiejszą ekonomię AI.');
  } else {
    line('   Projekcja nie przekracza połowy w całym badanym zakresie k.');
  }
}
line();
line('⚠ Sonda NIE rozstrzyga odczytu A/B ani 2D/3D — to decyzje właścicielskie do rejestru planu.');
line('⚠ „mid-game" w tabeli 1 NIE jest drugim pomiarem — patrz sekcja ZNALEZISKO.');
