// D8 — partia zaczyna się PUSTA: zero jednostek startowych (commit AC-3, slice AI_CAPTURE).
//
// PO CO: do AC-3 silnik dawał graczowi wojsko za darmo w TRZECH miejscach, z czego trzecie
// odnawiało się w nieskończoność. Intencja właściciela: *„gra powinna zaczynać się bez żadnych
// jednostek, gracz i AI budują wszystko od zera"*. To nie jest kosmetyka — to warunek, przy
// którym symetryczny predykat „armia wybita" (AC-5) w ogóle ma sens: skoro nikt nie dostaje
// wojska gratis, „ktokolwiek żywy broni tego ciała" jest uczciwą regułą dla obu kierunków.
//
// ⚠ To jest ODWRÓCENIE pinu (f) z `ai_capture_seams_smoke` (AC-0). Tamten pinował ISTNIENIE
//    trzech producentów; ten pinuje ich BRAK. Oba są celowe i oba są w planie.
//
//   T1  Trzej producenci ZNIKNĘLI (pin źródłowy, komentarze zdejmowane):
//       `GameScene._initRoverSpawnListener` (metoda + rejestracja) · `createUnit('science_rover')`
//       i `createUnit('infantry')` w `GameScene` · `ColonyOverlay._autoSpawnRover` (wywołanie + metoda).
//   T2  KONTROLA PINU — trzy ścieżki, które D8 ma ZOSTAWIĆ, dalej istnieją: rekrutacja
//       (`ColonyManager`), grupa badawcza (`VesselManager.deployAwayTeam`), desant AI
//       (`InvasionSystem`). Bez tego keeper przechodziłby też wtedy, gdyby ktoś wyciął
//       tworzenie jednostek W CAŁOŚCI.
//   T3  KONTROLA PINU — skaner nie jest wszystkożerny (token, którego nie ma, nie jest znajdowany;
//       token, który JEST, jest znajdowany).
//   T4  WYKONANIE — świeży boot: zero jednostek naziemnych na koloni gracza, a fabryka jednostek
//       ŻYJE (ręczne `createUnit` działa) ⇒ zero nie bierze się z zepsutego `GroundUnitManager`.
//   T5  WYKONANIE — typ `infantry` ZOSTAJE w katalogu (`INVASION_UNIT_POOLS` używa go dla pięciu
//       archetypów imperiów). D8 zdejmuje darmowe jednostki GRACZA, a nie zdolność desantową AI.
//
// ⚠ Dlaczego T1 jest pinem ŹRÓDŁOWYM, a nie wykonaniowym: `src/scenes/GameScene.js` i
//    `src/ui/ColonyOverlay.js` NIE IMPORTUJĄ SIĘ pod node (GameScene ciągnie
//    `three/addons/postprocessing/EffectComposer.js` spoza `exports` pakietu `three`;
//    ColonyOverlay wywraca się na `THREE.TextureLoader is not a constructor`). Żadnego z trzech
//    producentów nie da się w tym harnessie uruchomić — więc „zero jednostek po boocie" w headless
//    NIE dowodzi D8 (było prawdą także przed nią). Dowód mieszka w źródle + w GATE 1 (przeglądarka).
//
// ⚠ ŚWIADOMIE POZA ZAKRESEM: stare zapisy. `GroundUnitManager.restore` odtwarza to, co w zapisie
//    już jest, a D8 usuwa PRODUCENTÓW, nie jednostki. Partia w toku wczyta rovera i piechotę —
//    są widoczne, własne i rozwiązywalne ręcznie (`UnitCardPanel` → disband). Wyczyszczenie ich
//    byłoby MIGRACJĄ (bump + wpis w `SaveMigration`) i jest poza tym planem (§Save strategy pkt 4).
//
// Uruchom: node src/testing/smoke/startup_units_zero_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy
import { GameCore } from '../headless/GameCore.js';
import { INVASION_UNIT_POOLS } from '../../data/GroundUnitData.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const { readFileSync } = await import('node:fs');
const { join } = await import('node:path');

// ⚠ Komentarze zdejmowane PRZED szukaniem (memory `source-pin-strip-comments`) — inaczej pin
//   łapie własne wyjaśnienie, które AC-3 zostawił w miejscu usuniętego producenta.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (...p) => stripComments(readFileSync(join(SRC, ...p), 'utf8'));

const scene    = read('scenes', 'GameScene.js');
const overlay  = read('ui', 'ColonyOverlay.js');
const vessels  = read('systems', 'VesselManager.js');
const colonies = read('systems', 'ColonyManager.js');
const invasion = read('systems', 'InvasionSystem.js');

// ── T1 — trzej producenci zniknęli ──────────────────────────────────────────────────────────
console.log('T1 — trzej producenci darmowych jednostek startowych NIE ISTNIEJĄ');
{
  assert(!/_initRoverSpawnListener\s*\(\s*\)\s*\{/.test(scene),
    'T1 poz. 1+2: metoda `_initRoverSpawnListener` USUNIĘTA z `GameScene`');
  assert(!/this\._initRoverSpawnListener\s*\(/.test(scene),
    'T1 poz. 1+2: …i jej REJESTRACJA też. Rejestracja nie była bramkowana `savedData`, więc pusta ' +
    'skorupa zostawiłaby uzbrojony nasłuch `planet:buildResult` czekający na jedynego żywego ' +
    'producenta zdarzenia — fallback stolicy w `ColonyOverlay`');
  assert(!/createUnit\('science_rover'/.test(scene),
    'T1 poz. 1: `GameScene` nie tworzy już startowego `science_rover` na kaflu stolicy');
  assert(!/createUnit\('infantry'/.test(scene),
    'T1 poz. 2: `GameScene` nie tworzy już startowej `infantry` na kaflu sąsiednim — to była ' +
    'JEDYNA jednostka gracza o roli `military` od t=0 i jedyna, która blokowała przejęcie');
  assert(!/_autoSpawnRover/.test(overlay),
    'T1 poz. 3: `ColonyOverlay._autoSpawnRover` zniknął w CAŁOŚCI (wywołanie z `show()` + metoda). ' +
    'Bramki tej metody to „planeta macierzysta" i „na planecie nie ma ŻADNEJ jednostki" — czyli ' +
    'stawiała rovera dokładnie wtedy, gdy planeta pustoszała, a więc w końcówce inwazji');
  assert(!/createUnit\('science_rover'/.test(overlay),
    'T1 poz. 3: …i w `ColonyOverlay` nie ma już żadnego tworzenia łazika');
}

// ── T2 — kontrola pinu: ścieżki, które D8 ZOSTAWIA ──────────────────────────────────────────
console.log('T2 KONTROLA PINU — trzy ścieżki „za decyzję gracza / przeciwnika" ŻYJĄ');
{
  assert(/mgr\.createUnit\(archetypeId,\s*factionId,\s*colony\.planetId/.test(colonies),
    'T2: REKRUTACJA (`ColonyManager`) dalej tworzy jednostki — koszary + POP + kolejka. To jest ' +
    'świadomy wydatek gracza i ma zostać');
  assert(/createUnit\('science_rover',\s*planetId/.test(vessels),
    'T2: GRUPA BADAWCZA (`VesselManager.deployAwayTeam`) dalej tworzy rovera — gracz sam wybiera ' +
    'kafel lądowania, więc to decyzja, nie prezent');
  assert(/gum\.createUnit\(type,\s*planetId,\s*hex\.q,\s*hex\.r/.test(invasion),
    'T2: DESANT AI (`InvasionSystem.launchInvasion`) dalej tworzy jednostki — to przeciwnik, ' +
    'a nie darmowe wojsko gracza');
  assert(/gum\.createUnit\(archetypeId,\s*pid/.test(scene),
    'T2: dźwignia debug (`KOSMOS.debug.spawnMyUnit`) zostaje — jawne wywołanie z konsoli');
}

// ── T3 — kontrola pinu: skaner dyskryminuje ─────────────────────────────────────────────────
console.log('T3 KONTROLA PINU — skaner znajduje to, co jest, i nie znajduje tego, czego nie ma');
{
  assert(/_migrateStringFleets\s*\(\s*\)\s*\{/.test(scene) && /class ColonyOverlay/.test(overlay),
    'T3: skaner CZYTA ŻYWE ŹRÓDŁO — w tych samych plikach znajduje rzeczy, które NA PEWNO tam są ' +
    '(`GameScene._migrateStringFleets`, `class ColonyOverlay`). Bez tego literówka w ścieżce dałaby ' +
    'pusty odczyt i wszystkie zakazy z T1 spełniłyby się za darmo');
  assert(/EventBus\.on\(/.test(scene),
    'T3: …i `GameScene` NADAL subskrybuje eventy (usunęliśmy JEDEN nasłuch, nie mechanizm)');
  assert(!/createUnit\('battleship'/.test(scene) && !/createUnit\('battleship'/.test(overlay),
    'T3: token, którego w źródle nie ma, NIE jest znajdowany');
  assert(scene.length > 1000 && overlay.length > 1000,
    `T3: oba pliki wczytane i niepuste (${scene.length} / ${overlay.length} znaków po zdjęciu ` +
    'komentarzy) — pusty odczyt dałby „wszystkie zakazy spełnione" za darmo');
}

// ── T4 — wykonanie: zero jednostek, ale fabryka żyje ────────────────────────────────────────
console.log('T4 WYKONANIE — świeży boot: zero jednostek gracza, przy ŻYWEJ fabryce jednostek');
{
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  const home = window.KOSMOS.homePlanet;
  const gum = core.groundUnitManager;

  assert(gum.getUnitsOnPlanet(home.id).length === 0,
    'T4: na koloni gracza nie ma ŻADNEJ jednostki naziemnej po boocie');
  assert([...gum._units.values()].filter(u => (u.owner ?? 'player') === 'player').length === 0,
    'T4: …i w całym rejestrze nie ma ani jednej jednostki GRACZA');

  const col = core.colonyManager.getColony(home.id);
  const cap = col.grid.toArray().find(t => t?.capitalBase);
  const made = gum.createUnit('science_rover', home.id, cap.q, cap.r);
  assert(!!made && gum.getUnitsOnPlanet(home.id).length === 1,
    'T4 KONTROLA PINU: ręczne `createUnit` DZIAŁA — czyli zero wyżej bierze się z braku ' +
    'PRODUCENTÓW, a nie z zepsutego `GroundUnitManager`');
}

// ── T5 — katalog jednostek AI nietknięty ────────────────────────────────────────────────────
console.log('T5 — typ `infantry` ZOSTAJE w katalogu (D8 nie rozbraja AI)');
{
  const users = Object.entries(INVASION_UNIT_POOLS)
    .filter(([, pool]) => Array.isArray(pool) && pool.includes('infantry'))
    .map(([arch]) => arch);
  assert(users.length >= 5,
    `T5: \`INVASION_UNIT_POOLS\` używa \`infantry\` dla ${users.length} archetypów imperiów ` +
    `(${users.join(', ')}). Skasowanie tego typu ODEBRAŁOBY AI zdolność desantu — należy do ` +
    'slice\'u GROUND (Findings 67-68), nie do D8');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
