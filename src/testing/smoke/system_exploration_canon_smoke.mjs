// KANON „UKŁAD ZBADANY" — keeper Findingów 186 (żywy) i 187 (latentny).
//
// PO CO: `StarSystemManager.generateAndRegister` ustawia DWIE flagi — `galaxyStar.explored`
// (`:105`) i lustro `sysData.explored` (`:114`). `EmpireColonyBootstrap:612-615` resetuje
// TYLKO pierwszą, z komentarzem formułującym regułę projektu wprost: „Gracz nie ma free intel
// na system AI — musi zrobić własny recon". Pięciu konsumentów czyta `galaxyStar` (poprawnie;
// `Outliner:185-186` wprost pisze, dlaczego NIE ufa lustru), a DWAJ czytali OBIE flagi przez OR:
// `FleetManagerOverlay:6249` (panel detalu STRATCOM) i `:6784` (panel rozkazu warp). W OR-ze
// wygrywa nigdy-nie-resetowane lustro, więc domowy układ KAŻDEGO imperium AI był dla panelu
// „Zbadany" od pierwszej tury: pełny spis ciał w tierze 3 (bez obserwatorium!) plus przycisk
// „Przełącz widok" prowadzący do widoku 3D cudzego układu.
//
// ⚠ TO JEST NIEZAMKNIĘTA POŁOWA W3-32. Tamten finding nazwał DWIE szkody: pauzę z fałszywą
//   treścią (zamknięta w `61bdffe` bramką właściciela w `MissionEventModal:634`) ORAZ „darmowy
//   skan układu". Poprawka zamknęła skan WIDOCZNY w popupie; skan STANOWY mieszkał u producenta.
//
// ⚠ DLACZEGO TO PRZEŻYŁO TAK DŁUGO: nazwa układu ma TRZECI predykat (`_systemDisplayName:6355`,
//   samo `sys.explored`) i zostaje „???". Panel WYGLĄDA na zamglony, oddając spis i wejście.
//
//   T1  186 SEDNO — przypięcie gwiazdy układu AI (tryb galaktyki): brak [ Wejdź ], status „Niezbadany",
//       brak linii ciał. Mierzone PRZEBIEGIEM PRAWDZIWEJ podwarstwy nazw płyty (`_g2Pin`), nie źródłowo.
//   T2  KONTROLA PINU — układ ZBADANY przez gracza dalej daje wszystkie trzy. Bramkujemy
//       stan wiedzy, nie funkcję przypięcia.
//   T3  186 — JEDNA bramka wejścia (`GalaxyModeController.canEnter`, D-GX-13): układ AI zamknięty, zbadany
//       otwarty; przypięcie, lewy i prawy outliner pytają tę samą funkcję (pin źródłowy).
//   T4  187 SEDNO — przylot WROGA nie zapala `explored`; kontrola: przylot GRACZA zapala.
//   T5  `StarSystemManager.restore` fail-CLOSED (było `?? true`); kontrola: sys_home i jawne
//       `explored:true` dalej zbadane.
//   T6  kanon sam w sobie: fail-closed na śmieciach i ŚLEPY na lustro `sysData.explored`.
//   T7  pin źródłowy z kontrolą pinu: ani `FleetManagerOverlay`, ani moduły trybu galaktyki nie czytają
//       `.explored` z rekordu `StarSystemManager`, a kanon jest zaimportowany przez bramkę wejścia.
// ⚠ PRZECELOWANE 2026-11-07 (ARC GALAXY G5-B — zakładka Stratcom usunięta, D-GX-21): T1/T2 czytały panel detalu Stratcomu
//   (`_drawStratcomDetail`), T3 — panel rozkazu warp (`_drawWarpOrderPanel`); oba zniknęły z zakładką. Następcą jest przypięcie
//   gwiazdy w trybie galaktyki (G2): [ Wejdź ] z bramki `canEnter` (wygenerowany ∧ zbadany kanonem ∨ własna obecność), linia
//   stanu zbadania i linia ciał (`galaxyBodiesLine` — liczby z `StarSystemManager` WYŁĄCZNIE przy znanym miejscu). Zamiar bez
//   zmian: lustro `sysData.explored` nie otwiera ani wejścia, ani spisu ciał. T7: kontrola „kanon zaimportowany” przeniesiona
//   z FMO (który po usunięciu zakładki nie czyta już stanu zbadania wcale) na `GalaxyModeController` i podwarstwę nazw płyty.

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { t } from '../../i18n/i18n.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const { StarSystemManager }   = await import('../../systems/StarSystemManager.js');
const { HudGalaxyLabelLayer }  = await import('../../ui/HudGalaxyLabelLayer.js');
const { GalaxyModeController } = await import('../../ui/GalaxyModeController.js');
const { galaxyWorldContext, buildGalaxySystemList } = await import('../../ui/GalaxyOutlinerLogic.js');
const { createVessel }        = await import('../../entities/Vessel.js');
const VesselManagerMod        = await import('../../systems/VesselManager.js');
const VesselManager           = VesselManagerMod.VesselManager ?? VesselManagerMod.default;

// ── Atrapa ctx: nagrywa KAŻDY napis, resztę przyjmuje bez ruchu ──────────────
function mkCtx() {
  const texts = [];
  const noop = () => {};
  return {
    texts,
    fillText: (s) => texts.push(String(s)),
    strokeText: (s) => texts.push(String(s)),
    fillRect: noop, strokeRect: noop, beginPath: noop, arc: noop, fill: noop, stroke: noop,
    save: noop, restore: noop, clip: noop, rect: noop, moveTo: noop, lineTo: noop,
    createRadialGradient: () => ({ addColorStop: noop }),
    measureText: (s) => ({ width: String(s).length * 6 }),
    setLineDash: noop,
    fillStyle: '#fff', strokeStyle: '#fff', lineWidth: 1,
    font: '10px sans-serif', textAlign: 'left', globalAlpha: 1,
  };
}

// Gracz BEZ obserwatorium — każdy spis ciał obcego układu jest tu darmowym intelem.
const OBS_NONE = {
  getSystemScanResult:   () => null,
  getSystemScanProgress: () => null,
  getMaxSystemScanTier:  () => 0,
};

const mkStar = (id, extra = {}) => ({
  id, name: `Gwiazda ${id}`, x: 10, y: -6, z: 2,
  spectralType: 'G', luminosity: 1.0, explored: false, ...extra,
});

// Przypięcie gwiazdy (tryb galaktyki): prawdziwa podwarstwa nazw płyty, wiersz z prawdziwego `buildGalaxySystemList`, bramka
// wejścia — prawdziwa metoda kontrolera (`canEnter`) na świecie z `galaxyWorldContext`.
const canEnter = (id, world) => GalaxyModeController.prototype.canEnter.call({}, id, world);
function pinOf(star) {
  const K = window.KOSMOS;
  K.galaxyMode = { canEnter };
  const world = galaxyWorldContext(K);
  const row = buildGalaxySystemList({ ...world, includeUnknown: true }).byId.get(String(star.id));
  const pin = row ? new HudGalaxyLabelLayer({ ctx: null })._g2Pin(K, row, new Map(), world, 'pl') : null;
  return { pin, row, world, lines: pin?.lines ?? [], buttons: (pin?.buttons ?? []).map((b) => b.id) };
}

const ss = new StarSystemManager();
window.KOSMOS = window.KOSMOS ?? {};
window.KOSMOS.starSystemManager = ss;
window.KOSMOS.observatorySystem = OBS_NONE;

const aiStar  = mkStar('sys_ai');
const ownStar = mkStar('sys_seen');
window.KOSMOS.galaxyData = { systems: [aiStar, ownStar] };

// Układ AI: wygenerowany przy bootstrapie imperium, z resetem jak w EmpireColonyBootstrap:615.
ss.generateAndRegister(aiStar);
aiStar.explored = false;
// ⚠ LUSTRO ZOSTAJE ZAPALONE — I TO JEST SEDNO FIXTURE'U, nie jego zaniedbanie. Tak wygląda
//   KAŻDY zapis sprzed tej poprawki (`serialize:238` niósł `true`, `restore` je odtwarzał) oraz
//   każdy rekord sprzed domknięcia (a). Bez tej linii T1 przechodziłby jałowo — lustro byłoby
//   fałszywe samo z siebie i test nie mierzyłby niczego. Kanon ma je IGNOROWAĆ, nie zakładać,
//   że ktoś je wcześniej zgasił.
ss.getSystem('sys_ai').explored = true;

// Układ ZBADANY przez gracza — przez PRAWDZIWĄ ścieżkę pisarza (własny przylot), nie przez
// ustawienie flagi z ręki. Generacja od tej poprawki NIE odkrywa układu (Finding 186/187),
// więc kontrola pinu musi przejść dokładnie tą drogą, którą chodzi gracz.
ss.generateAndRegister(ownStar);
{
  const { createVessel: mkV } = await import('../../entities/Vessel.js');
  const scout = mkV('hull_frigate', 'entity_3', { name: 'Pionier', x: 0, y: 0 });
  VesselManager.prototype._tickInterstellar.call({}, scout, {
    type: 'interstellar_jump', phase: 'warp_transit', toSystemId: 'sys_seen',
    targetName: 'Cel', arrivalYear: 10, departYear: 0, distLY: 4,
  }, 11);
}

const LBL_EXPLORED   = t('fleet.clusterExplored');
const LBL_UNEXPLORED = t('fleet.clusterUnexplored');
const LBL_TOTAL      = t('fleet.scanTotal');

// ── T1 / T2 ────────────────────────────────────────────────────────────────
console.log('T1/T2 — przypięcie gwiazdy (tryb galaktyki): układ AI vs układ zbadany przez gracza');
const LBL_BODIES = String(t('fleet.scanPlanets')).toLowerCase();
{
  const ai = pinOf(aiStar);
  assert(!!ai.pin, 'KONTROLA PINU: przypięcie układu AI powstało (wiersz w liście galaktyki, includeUnknown)');
  assert(!ai.buttons.includes('enter'),
    'T1 SEDNO: układ AI NIE wystawia [ Wejdź ] — lustro `sysData.explored` zostaje true po resecie bootstrapu, a wejście ' +
    'do widoku 3D cudzego układu było dokładnie skutkiem Findingu 186');
  assert(ai.lines.includes(LBL_UNEXPLORED) && !ai.lines.includes(LBL_EXPLORED),
    `T1 SEDNO: status układu AI = „${LBL_UNEXPLORED}", nie „${LBL_EXPLORED}"`);
  assert(!ai.lines.some((l) => String(l).includes(LBL_BODIES)),
    `T1 SEDNO: brak linii ciał („${LBL_BODIES} …") — bez obserwatorium (maxTier=0) i bez znanego miejsca liczby ciał ` +
    'z `StarSystemManager` byłyby darmowym spisem');

  const own = pinOf(ownStar);
  assert(own.buttons.includes('enter'),
    'T2 KONTROLA PINU: układ zbadany przez gracza DALEJ ma [ Wejdź ] — bramkujemy stan wiedzy, nie funkcję przypięcia');
  assert(own.lines.includes(LBL_EXPLORED), `T2 KONTROLA PINU: status układu zbadanego = „${LBL_EXPLORED}"`);
  assert(own.lines.some((l) => String(l).includes(LBL_BODIES)),
    'T2 KONTROLA PINU: linia ciał dla układu ODWIEDZONEGO zostaje (wiedza kupiona przylotem)');
}

// ── T3 — jedna bramka wejścia ────────────────────────────────────────────────
console.log('T3 — jedna bramka wejścia (`canEnter`) dla przypięcia i outlinerów');
{
  const world = galaxyWorldContext(window.KOSMOS);
  assert(canEnter('sys_ai', world) === false,
    'T3 SEDNO: `canEnter` zamyka układ AI (wygenerowany, lustro zapalone, gwiazda niezbadana)');
  assert(canEnter('sys_seen', world) === true,
    'T3 KONTROLA PINU: układ zbadany przylotem gracza jest otwarty — Finding 108 wymaga, żeby wejście do układu zostało');
  const rows = buildGalaxySystemList({ ...world, includeUnknown: true }).byId;
  assert(rows.get('sys_ai')?.enterable === false && rows.get('sys_seen')?.enterable === true,
    'T3: wiersz lewego outlinera ma tę samą odpowiedź co `canEnter` (AI zamknięty, zbadany otwarty)');
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const src = (f) => strip(readFileSync(join(SRC, 'ui', f), 'utf8'));
  const viaPure = ['GalaxyModeController.js', 'GalaxyOutlinerLogic.js'].filter((f) => /isSystemEnterable\(/.test(src(f)));
  const viaGate = ['HudGalaxyLabelLayer.js', 'Outliner.js'].filter((f) => /canEnter\?\.\(|canEnter\(/.test(src(f)));
  assert(viaPure.length === 2 && viaGate.length === 2,
    `T3: jedna reguła wejścia — isSystemEnterable w kontrolerze (canEnter) i w liście lewego outlinera (${JSON.stringify(viaPure)}), ` +
    `przypięcie i prawy outliner pytają canEnter (${JSON.stringify(viaGate)}) — bez nieutwardzonego bliźniaka (dawniej bramka panelu ` +
    'rozkazu była SKOPIOWANA z panelu detalu, Finding 108/Z4)');
}

// ── T4 — 187: przylot obcego nie zapala eksploracji ──────────────────────────
console.log('T4 — przylot międzygwiezdny: właściciel decyduje, czy układ staje się zbadany');
{
  const tick = VesselManager.prototype._tickInterstellar;
  const mkMission = (toSystemId) => ({
    type: 'interstellar_jump', phase: 'warp_transit', toSystemId,
    targetName: 'Cel', arrivalYear: 10, departYear: 0, distLY: 4,
  });

  const freshStar = mkStar('sys_fresh');
  window.KOSMOS.galaxyData.systems.push(freshStar);
  const enemy = createVessel('hull_frigate', 'entity_3', { name: 'Rajder AI', x: 0, y: 0 });
  enemy.ownerEmpireId = 'emp_001'; enemy.owner = 'emp_001'; enemy.isEnemy = true;
  tick.call({}, enemy, mkMission('sys_fresh'), 11);
  assert(freshStar.explored === false,
    'T4 SEDNO: przylot WROGIEGO statku NIE oznacza układu jako zbadanego. ' +
    '`_tickInterstellar:2709` woła generateAndRegister dla DOWOLNEGO statku, a ta funkcja ' +
    'zapala `galaxyStar.explored` — czyli przebija mgłę także na mapie i w Outlinerze');

  const freshStar2 = mkStar('sys_fresh2');
  window.KOSMOS.galaxyData.systems.push(freshStar2);
  const mine = createVessel('hull_frigate', 'entity_3', { name: 'Mój zwiadowca', x: 0, y: 0 });
  tick.call({}, mine, mkMission('sys_fresh2'), 11);
  assert(freshStar2.explored === true,
    'T4 KONTROLA PINU: przylot WŁASNEGO statku DALEJ odkrywa układ — to jest cała treść ' +
    'eksploracji i nie wolno jej zgasić przy okazji');
}

// ── T5 — restore fail-closed ─────────────────────────────────────────────────
console.log('T5 — StarSystemManager.restore: brak pola ≠ „zbadany"');
{
  const ss2 = new StarSystemManager();
  ss2.restore({ systems: [
    { systemId: 'sys_old',  starEntityId: 'e1', planetIds: [], moonIds: [], planetoidIds: [] },
    { systemId: 'sys_home', starEntityId: 'e2', planetIds: [], moonIds: [], planetoidIds: [] },
    { systemId: 'sys_yes',  starEntityId: 'e3', planetIds: [], moonIds: [], planetoidIds: [], explored: true },
  ] });
  assert(ss2.getSystem('sys_old').explored === false,
    'T5 SEDNO: wpis bez pola `explored` wraca jako NIEzbadany — `?? true` było fail-OPEN ' +
    'w miejscu, które opisuje mgłę wojny');
  assert(ss2.getSystem('sys_home').explored === true,
    'T5 KONTROLA PINU: sys_home zostaje zbadany bez pola (dom zna się z definicji)');
  assert(ss2.getSystem('sys_yes').explored === true,
    'T5 KONTROLA PINU: jawne `explored:true` przechodzi bez zmian — zero migracji zapisu');
}

// ── T6 — kanon ───────────────────────────────────────────────────────────────
console.log('T6 — kanon SystemExploration: fail-closed i ślepy na lustro');
{
  // Brak modułu = nazwane porażki, nie stack trace: keeper ma DZIAŁAĆ także wtedy, gdy ktoś
  // skasuje kanon — inaczej ostatnie testy nie zdążą się wykonać i wynik będzie nieczytelny.
  let SE = null;
  try { SE = await import('../../utils/SystemExploration.js'); }
  catch { SE = null; }
  assert(!!SE, 'T6: moduł kanonu `src/utils/SystemExploration.js` istnieje');
  if (!SE) SE = { isSystemExplored: () => null, isSystemExploredData: () => null, isSystemExploredId: () => null };
  assert(SE.isSystemExplored(null) === false && SE.isSystemExplored('sys_ai') === false,
    'T6: `isSystemExplored` fail-CLOSED na null i na STRINGU — `\'sys_ai\'.explored` to ' +
    'undefined, więc string musi odpaść jawnie (pułapka z `ColonyOwnership.isPlayerColony`)');
  assert(SE.isSystemExplored({ id: 'x', explored: true }) === true &&
         SE.isSystemExplored({ id: 'x', isHome: true }) === true,
    'T6 KONTROLA PINU: gwiazda zbadana oraz dom są zbadane');
  assert(SE.isSystemExploredData({ systemId: 'sys_ai', explored: true, galaxyStar: aiStar }) === false,
    'T6 SEDNO: rekord StarSystemManager z `explored:true` w LUSTRZE, ale z niezbadaną ' +
    '`galaxyStar`, jest NIEzbadany — to dokładnie kształt danych, który tworzy bootstrap AI');
  assert(SE.isSystemExploredData({ systemId: 'sys_home', explored: false, galaxyStar: null }) === true,
    'T6 KONTROLA PINU: sys_home nie ma wpisu w galaxyData (`registerHomeSystem:65`), więc musi ' +
    'przechodzić po identyfikatorze — inaczej kanon zgasiłby własny układ gracza');
  assert(SE.isSystemExploredId('sys_seen') === true && SE.isSystemExploredId('sys_ai') === false,
    'T6: wejście po identyfikatorze rozwiązuje gwiazdę z galaxyData');
}

// ── T7 — pin źródłowy z kontrolą pinu ────────────────────────────────────────
console.log('T7 — pin źródłowy: ani FMO, ani tryb galaktyki nie czytają lustra');
{
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const read = (rel) => stripComments(readFileSync(join(SRC, ...rel.split('/')), 'utf8'));
  const files = ['ui/FleetManagerOverlay.js', 'ui/GalaxyModeController.js', 'ui/HudGalaxyLabelLayer.js', 'ui/GalaxyOutlinerLogic.js', 'ui/GalaxyChromeLogic.js'];
  const mirror = files.filter((f) => /sysReg\w*\s*\??\.explored|getSystem\??\.?\([^)]*\)\s*\??\.explored/.test(read(f)));
  assert(mirror.length === 0,
    `T7 SEDNO: żaden odczyt lustra (\`sysReg….explored\` / \`getSystem(…).explored\`) w FMO i modułach trybu galaktyki (czytają: ${JSON.stringify(mirror)}) — ` +
    'lustro nie ma prawa wrócić jako źródło prawdy (kod czytany BEZ komentarzy, żeby opis nie zaliczał pinu)');
  assert(/SystemExploration\.js/.test(read('ui/GalaxyModeController.js')) && /SystemExploration\.js/.test(read('ui/HudGalaxyLabelLayer.js')),
    'T7 KONTROLA PINU: kanon JEST zaimportowany przez bramkę wejścia i przypięcie — inaczej pin wyżej przechodziłby także wtedy, ' +
    'gdyby ktoś po prostu usunął bramkę razem z funkcją');
}

console.log(`\n═══ ${pass} PASS, ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
