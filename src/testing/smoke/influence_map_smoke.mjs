// DIRECTOR SLICE 1 — keeper mapy wpływów (commit S2, workstream C; orzeczenie R-2).
//
// PO CO: mapa wpływów jest FUNDAMENTEM współdzielonym z D3 — nacisk militarny (S6) i
// incydenty granic (D3) będą czytać te same zbiory. Pomyłka w geometrii nie wywala gry,
// tylko po cichu przesuwa granice imperiów, czyli zmienia balans bez śladu.
//
//   T1  promień roszczony rośnie z devScore między R_MIN a R_MAX i tam się nasyca
//   T2  ⚠ PIN KOREKTY K-2: strefa NIE zależy od baku warp ŻADNEGO statku
//   T3  odczyt A (decyzja 9): outer = r_roszczony + BORDER_LY, powłoka NA ZEWNĄTRZ
//   T4  metryka 3D (decyzja 10): oś z liczy się tak samo jak x/y
//   T5  zbiory claimed i border są ROZŁĄCZNE; roszczenie pochłania powłokę
//   T6  układ sporny nie należy „do obu" jako roszczony — etykieta jest jednoznaczna
//   T7  systemsWithinLY: granica domknięta (<=), zero = tylko punkt
//   T8  ⚠ PIN DUPLIKATU: formuła promienia w TerritoryField.js wciąż zgadza się z InfluenceMath
//   T9  stała BORDER_LY istnieje w GameConfig i ma wartość z pomiaru R-2

// ⚠ `env.js` MUSI być pierwszy: sam `InfluenceMath` jest czysty, ale odczyt stałych
// przez `GameConfig.js` ciągnie `i18n.js`, a ten sięga po `localStorage` już przy imporcie.
import '../headless/env.js';
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import {
  claimedRadiusLY, borderOuterRadiusLY, classifySystem, classifyGalaxy,
  distanceLY, systemsWithinLY,
} from '../../utils/InfluenceMath.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const CFG = GAME_CONFIG.TERRITORY;
const sys = (id, x, y = 0, z = 0) => ({ id, x, y, z });
const src = (system, claimedR) => ({ system, claimedR });

/**
 * Kod bez komentarzy. Pin K-2 (T2) pyta o ZALEŻNOŚĆ, a nie o słownictwo — oba pliki
 * tłumaczą w nagłówku, DLACZEGO nie zależą od baku warp, więc surowy grep po treści
 * pliku łapałby własne wyjaśnienie i pin świeciłby na czerwono za samo bycie opisanym.
 * (Ten test złapał dokładnie to na sobie przy pierwszym uruchomieniu.)
 */
const codeOnly = (path) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')      // bloki /* … */
  .replace(/(^|[^:])\/\/.*$/gm, '$1');    // linie // … (bez zjadania „://" w URL-ach)

// ── T1 — promień z devScore ─────────────────────────────────────────────────
console.log('\nT1: promień roszczony rośnie z devScore i nasyca się na R_MAX');
{
  const r0   = claimedRadiusLY('colony', 0, CFG);
  const rMid = claimedRadiusLY('colony', CFG.DEV_FULL / 2, CFG);
  const rFul = claimedRadiusLY('colony', CFG.DEV_FULL, CFG);
  const rOver = claimedRadiusLY('colony', CFG.DEV_FULL * 10, CFG);
  assert(r0 === CFG.R_MIN_LY, `T1a: devScore 0 → R_MIN (${CFG.R_MIN_LY})`);
  assert(rFul === CFG.R_MAX_LY, `T1b: devScore = DEV_FULL → R_MAX (${CFG.R_MAX_LY})`);
  assert(rMid > r0 && rMid < rFul, 'T1c: pomiędzy — rośnie monotonicznie');
  assert(rOver === CFG.R_MAX_LY, 'T1d: powyżej DEV_FULL NASYCA SIĘ (nie rośnie w nieskończoność)');
  assert(claimedRadiusLY('station', 999, CFG) === CFG.R_STATION_LY,
    'T1e: stacja ma własny, stały promień niezależny od devScore');
}

// ── T2 — PIN KOREKTY K-2 ────────────────────────────────────────────────────
console.log('\nT2: PIN K-2 — strefa NIE zależy od baku warp żadnego statku');
{
  // „Jeden skok" nie ma definicji galaktycznej: maxHopLY = warpFuel.max / consumption,
  // czyli własność STATKU. Gdyby strefa od tego zależała, dwa statki widziałyby dwie
  // różne granice tego samego imperium. Dowód wykonaniem: żadna funkcja tego modułu
  // nie przyjmuje statku ani paliwa — a te same wejścia dają ten sam wynik niezależnie
  // od tego, co akurat lata po galaktyce.
  const source = src(sys('A', 0), 2.0);
  const target = sys('B', 5.0);
  const c1 = classifySystem(target, source, CFG.BORDER_LY);
  const c2 = classifySystem(target, source, CFG.BORDER_LY);
  assert(c1 === c2 && c1 === 'border', 'T2a: klasyfikacja jest funkcją geometrii, powtarzalna');

  const mathCode = codeOnly('src/utils/InfluenceMath.js');
  assert(!/warpFuel|maxHopLY|vessel/i.test(mathCode),
    'T2b: KOD InfluenceMath nie odwołuje się do warpFuel/maxHopLY/vessel — strefa jest własnością GALAKTYKI');
  const mapCode = codeOnly('src/systems/InfluenceMap.js');
  assert(!/warpFuel|maxHopLY|vesselManager/i.test(mapCode),
    'T2c: KOD InfluenceMap też nie — ani jeden statek nie wpływa na kształt granicy');
  assert(/warpFuel|maxHopLY/.test(readFileSync('src/utils/WarpRoutePlanner.js', 'utf8')),
    'T2d: kontrola pinu — te pojęcia ISTNIEJĄ w repo (WarpRoutePlanner), więc T2b/T2c nie przechodzą przez pomyłkę');
}

// ── T3 — odczyt A ───────────────────────────────────────────────────────────
console.log('\nT3: odczyt A — powłoka leży NA ZEWNĄTRZ przestrzeni roszczonej');
{
  const B = CFG.BORDER_LY;
  assert(borderOuterRadiusLY(4.0, B) === 4.0 + B, `T3a: outer = r + BORDER (4.0 → ${4.0 + B})`);
  assert(borderOuterRadiusLY(1.5, B) === 1.5 + B, `T3b: outer skaluje się z r (1.5 → ${1.5 + B})`);
  assert(borderOuterRadiusLY(4.0, B) > borderOuterRadiusLY(1.5, B),
    'T3c: rozwinięte imperium ma SZERSZĄ strefę niż świeże — odwrotnie niż w odrzuconym odczycie B');

  const source = src(sys('home', 0), 4.0);
  assert(classifySystem(sys('in', 3.9), source, B) === 'claimed',  'T3d: tuż wewnątrz roszczenia → claimed');
  assert(classifySystem(sys('edge', 4.0), source, B) === 'claimed', 'T3e: DOKŁADNIE na promieniu → claimed (granica domknięta)');
  assert(classifySystem(sys('shell', 4.0 + B - 0.01), source, B) === 'border', 'T3f: w powłoce → border');
  assert(classifySystem(sys('rim', 4.0 + B), source, B) === 'border', 'T3g: DOKŁADNIE na krawędzi powłoki → border');
  assert(classifySystem(sys('out', 4.0 + B + 0.01), source, B) === 'outside', 'T3h: tuż za powłoką → outside');
}

// ── T4 — metryka 3D ─────────────────────────────────────────────────────────
console.log('\nT4: metryka 3D — oś z liczy się tak samo jak x/y');
{
  assert(Math.abs(distanceLY(sys('a', 0, 0, 0), sys('b', 0, 0, 5)) - 5) < 1e-9,
    'T4a: przesunięcie WYŁĄCZNIE w z daje odległość 5 (rzut 2D dałby 0)');
  assert(Math.abs(distanceLY(sys('a', 3, 4, 0), sys('b', 0, 0, 0)) - 5) < 1e-9, 'T4b: 3-4-5 w płaszczyźnie');
  assert(Math.abs(distanceLY(sys('a', 1, 2, 2), sys('b', 0, 0, 0)) - 3) < 1e-9, 'T4c: 1-2-2 → 3 w trzech osiach');

  // Realny skutek: układ „obok" w rzucie, ale wysoko w z, NIE jest w strefie.
  const source = src(sys('home', 0, 0, 0), 1.5);
  const tall = sys('tall', 0, 0, 1.5 + CFG.BORDER_LY + 1);
  assert(classifySystem(tall, source, CFG.BORDER_LY) === 'outside',
    'T4d: układ odległy tylko w z wypada ze strefy — rzut 2D fałszywie wciągnąłby go do środka');
}

// ── T5 — rozłączność i pochłanianie ─────────────────────────────────────────
console.log('\nT5: claimed i border są rozłączne; roszczenie pochłania powłokę');
{
  const B = CFG.BORDER_LY;
  const systems = [sys('core', 0), sys('near', 1.0), sys('far', 3.0)];
  // Dwa źródła: „near" leży w roszczeniu drugiego i w powłoce pierwszego.
  const sources = [src(sys('core', 0), 0.5), src(sys('s2', 1.2), 0.5)];
  const { claimed, border } = classifyGalaxy(systems, sources, B);
  assert([...claimed].every((id) => !border.has(id)), 'T5a: zbiory są ROZŁĄCZNE');
  assert(claimed.has('near'), 'T5b: układ roszczony przez DOWOLNE źródło jest claimed…');
  assert(!border.has('near'), 'T5c: …i NIE jest jednocześnie border (roszczenie pochłania powłokę)');
  assert(claimed.has('core'), 'T5d: układ w rdzeniu jest claimed');
}

// ── T6 — układ sporny ───────────────────────────────────────────────────────
console.log('\nT6: układ sporny ma jednoznaczną etykietę na właściciela');
{
  const systems = [sys('X', 0)];
  const a = classifyGalaxy(systems, [src(sys('A', 0), 1.0)], CFG.BORDER_LY);
  const b = classifyGalaxy(systems, [src(sys('B', 0.5), 1.0)], CFG.BORDER_LY);
  assert(a.claimed.has('X') && b.claimed.has('X'),
    'T6a: ten sam układ może być roszczony PRZEZ DWÓCH właścicieli osobno (spór jest realny)');
  assert(a.claimed.size === 1 && a.border.size === 0,
    'T6b: ale w obrębie JEDNEGO właściciela etykieta jest pojedyncza');
}

// ── T7 — systemsWithinLY ────────────────────────────────────────────────────
console.log('\nT7: systemsWithinLY — granica domknięta');
{
  const systems = [sys('a', 0), sys('b', 2), sys('c', 5)];
  const origin = sys('o', 0);
  assert(JSON.stringify(systemsWithinLY(origin, systems, 2)) === JSON.stringify(['a', 'b']),
    'T7a: promień 2 łapie układ DOKŁADNIE w odległości 2 (<=, nie <)');
  assert(systemsWithinLY(origin, systems, 0).length === 1, 'T7b: promień 0 łapie tylko punkt zerowy');
  assert(systemsWithinLY(origin, [], 10).length === 0, 'T7c: pusta galaktyka → pusty wynik (bez rzutu)');
  assert(systemsWithinLY(origin, systems, 99).length === 3, 'T7d: wielki promień łapie wszystko');
}

// ── T8 — PIN DUPLIKATU FORMUŁY ──────────────────────────────────────────────
console.log('\nT8: PIN — formuła promienia w TerritoryField wciąż zgadza się z InfluenceMath');
{
  // Decyzja 3 zabrania ruszać render, więc formuła istnieje w DWÓCH miejscach.
  // Duplikat pilnowany asercją źródłową jest tańszy niż refaktor renderu w slice o danych,
  // ale MUSI być pilnowany — inaczej granice reguł i granice rysunku cicho się rozjadą.
  const tf = readFileSync('src/systems/TerritoryField.js', 'utf8');
  assert(/cfg\.R_STATION_LY/.test(tf) && /cfg\.R_MIN_LY/.test(tf) && /cfg\.R_MAX_LY/.test(tf),
    'T8a: TerritoryField wciąż buduje promień z R_STATION_LY / R_MIN_LY / R_MAX_LY');
  assert(/o\.devScore\s*\/\s*DEV_FULL/.test(tf),
    'T8b: …i wciąż normalizuje devScore przez DEV_FULL — ta sama krzywa co claimedRadiusLY');
  assert(!/BORDER_LY/.test(tf),
    'T8c: TerritoryField NIE zna BORDER_LY — strefa graniczna jest danymi reguł, nie rysunkiem (decyzja 3)');
}

// ── T9 — stała z pomiaru ────────────────────────────────────────────────────
console.log('\nT9: BORDER_LY pochodzi z pomiaru R-2');
{
  assert(typeof CFG.BORDER_LY === 'number' && CFG.BORDER_LY > 0,
    `T9a: GAME_CONFIG.TERRITORY.BORDER_LY istnieje (= ${CFG.BORDER_LY} LY)`);
  assert(CFG.BORDER_LY === 5.0, 'T9b: wartość = 5.0 LY — orzeczenie R-2 po pomiarze pokrycia 17,7%');
  const gc = readFileSync('src/config/GameConfig.js', 'utf8');
  assert(/BORDER_LY[\s\S]{0,400}?probe-border-zone-coverage|probe-border-zone-coverage[\s\S]{0,400}?BORDER_LY/.test(gc),
    'T9c: stała niesie w komentarzu wskazanie sondy, która ją zmierzyła (dyscyplina jednostek D2/E6)');
}

// ── T10 — INTEGRACJA: serwis musi zgadzać się z sondą pomiarową ─────────────
console.log('\nT10: InfluenceMap na żywym boocie zgadza się z liczbą z pomiaru R-2');
{
  // Sonda `probe-border-zone-coverage.mjs` policzyła pokrycie WŁASNĄ pętlą, a serwis
  // liczy je swoją. Jeśli te dwie liczby się rozjadą, jedna z nich kłamie — a to jest
  // dokładnie ten rodzaj cichego rozjazdu, przez który stała 5 LY zostałaby utwardzona
  // na podstawie pomiaru, którego kod produkcyjny nie realizuje.
  const { GameCore } = await import('../headless/GameCore.js');
  const { TerritoryService } = await import('../../systems/TerritoryService.js');
  const { InfluenceMap } = await import('../../systems/InfluenceMap.js');

  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization', galaxySeed: -55555, aiEmpires: true });
  window.KOSMOS.territoryService = new TerritoryService();
  const im = new InfluenceMap();

  const owners = im.listOwners();
  assert(owners.includes('player'), 'T10a: gracz jest właścicielem w mapie wpływów');
  const ai = owners.filter((o) => o !== 'player');
  assert(ai.length === 2, `T10b: dwa imperia AI (EmpireGenerator.js:20) — zmierzone ${ai.length}`);

  // Rozłączność na PRAWDZIWYCH danych, nie tylko na zabawkowych zbiorach z T5.
  for (const o of owners) {
    const c = new Set(im.getClaimedSystems(o));
    assert(im.getBorderSystems(o).every((id) => !c.has(id)),
      `T10c/${o}: claimed ∩ border = ∅ na żywej galaktyce`);
  }

  // Unia stref obu imperiów AI = liczba z tabeli 1 sondy dla tego seeda (22/72 = 30,6%).
  const union = new Set();
  for (const o of ai) {
    for (const id of im.getClaimedSystems(o)) union.add(id);
    for (const id of im.getBorderSystems(o))  union.add(id);
  }
  const total = window.KOSMOS.galaxyData.systems.length;
  assert(total === 72, `T10d: galaktyka ma 72 układy (zmierzone ${total})`);
  assert(union.size === 22,
    `T10e: strefa AI obejmuje 22/72 układów — DOKŁADNIE liczba z sondy dla seeda -55555 `
    + `(zmierzone ${union.size}). Rozjazd = serwis i pomiar liczą co innego`);

  // Powłoka naprawdę jest na zewnątrz: układ roszczony ma ujemny dystans do roszczenia.
  const someClaimed = im.getClaimedSystems(ai[0])[0];
  if (someClaimed) {
    assert(im.distanceToClaimLY(someClaimed, ai[0]) <= 0,
      'T10f: układ roszczony ma dystans do roszczenia ≤ 0 (leży wewnątrz)');
  }
  im.dispose();
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
