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
//   T1  186 SEDNO — panel detalu na układzie AI: brak `cluster_switch`, status „Niezbadany",
//       zero wierszy spisu. Mierzone PRZEBIEGIEM PRAWDZIWEJ FUNKCJI RYSUJĄCEJ, nie źródłowo.
//   T2  KONTROLA PINU — układ ZBADANY przez gracza dalej daje wszystkie trzy. Bramkujemy
//       stan wiedzy, nie funkcję panelu.
//   T3  186 drugi site — `_drawWarpOrderPanel` (`:6784`). Bramka była tam ŚWIADOMIE SKOPIOWANA
//       (Finding 108/Z4, komentarz w źródle), więc kanon musi ruszyć OBA site'y albo żaden.
//   T4  187 SEDNO — przylot WROGA nie zapala `explored`; kontrola: przylot GRACZA zapala.
//   T5  `StarSystemManager.restore` fail-CLOSED (było `?? true`); kontrola: sys_home i jawne
//       `explored:true` dalej zbadane.
//   T6  kanon sam w sobie: fail-closed na śmieciach i ŚLEPY na lustro `sysData.explored`.
//   T7  pin źródłowy z kontrolą pinu: w `FleetManagerOverlay` nie ma już odczytu `.explored`
//       z rekordu `StarSystemManager`, a kanon jest zaimportowany.

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { t } from '../../i18n/i18n.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const { StarSystemManager }   = await import('../../systems/StarSystemManager.js');
const { FleetManagerOverlay } = await import('../../ui/FleetManagerOverlay.js');
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

function drawDetail(star, ssMgr) {
  const host = Object.create(FleetManagerOverlay.prototype);
  host._hitZones = [];
  const ctx = mkCtx();
  host._drawStratcomDetail(ctx, 0, 0, 900, 600, star, ssMgr, null, null);
  return { zones: host._hitZones, texts: ctx.texts };
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

// ── T1 / T2 ──────────────────────────────────────────────────────────────────
console.log('T1/T2 — panel detalu STRATCOM: układ AI vs układ zbadany przez gracza');
{
  const ai = drawDetail(aiStar, ss);
  assert(!ai.zones.some(z => z.type === 'cluster_switch'),
    'T1 SEDNO: układ AI NIE wystawia przycisku „Przełącz widok" (cluster_switch) — lustro ' +
    '`sysData.explored` zostaje true po resecie bootstrapu i w OR-ze :6249 wygrywało, dając ' +
    'graczowi wejście do widoku 3D cudzego układu');
  assert(ai.texts.includes(LBL_UNEXPLORED) && !ai.texts.includes(LBL_EXPLORED),
    `T1 SEDNO: status układu AI = „${LBL_UNEXPLORED}", nie „${LBL_EXPLORED}"`);
  assert(!ai.texts.includes(LBL_TOTAL),
    `T1 SEDNO: brak wiersza spisu („${LBL_TOTAL}") — bez obserwatorium (maxTier=0) poprawną ` +
    'odpowiedzią jest kontrolka „locked", a nie darmowy spis ciał w tierze 3');

  const own = drawDetail(ownStar, ss);
  assert(own.zones.some(z => z.type === 'cluster_switch'),
    'T2 KONTROLA PINU: układ zbadany przez gracza DALEJ ma „Przełącz widok" — bramkujemy stan ' +
    'wiedzy, nie funkcję panelu');
  assert(own.texts.includes(LBL_EXPLORED),
    `T2 KONTROLA PINU: status układu zbadanego = „${LBL_EXPLORED}"`);
  assert(own.texts.includes(LBL_TOTAL),
    'T2 KONTROLA PINU: spis ciał dla układu ODWIEDZONEGO zostaje (wiedza kupiona przylotem)');
}

// ── T3 — drugi site tej samej bramki ─────────────────────────────────────────
console.log('T3 — panel rozkazu warp (:6784) rusza razem z panelem detalu');
{
  const v = createVessel('hull_frigate', 'entity_3', {
    name: 'Zwiadowca', modules: ['engine_warp', 'warp_tank'], x: 0, y: 0, systemId: 'sys_home',
  });
  v.warpFuel = { current: 10, max: 10, consumption: 1 };
  const vMgr = { getVessel: (id) => (id === v.id ? v : null) };

  const draw = (star) => {
    const host = Object.create(FleetManagerOverlay.prototype);
    host._hitZones = [];
    host._selectedWarpShipId = v.id;
    const ctx = mkCtx();
    host._drawWarpOrderPanel(ctx, 0, 0, 900, 600, star, vMgr);
    return host._hitZones;
  };

  assert(!draw(aiStar).some(z => z.type === 'cluster_switch'),
    'T3 SEDNO: panel rozkazu warp na układzie AI też NIE wystawia „Przełącz widok". Bramka ' +
    'jest tam ŚWIADOMIE SKOPIOWANA z panelu detalu (Finding 108/Z4, komentarz w źródle) — ' +
    'jedno źródło prawdy musi ruszyć OBA site\'y, inaczej zostaje nieutwardzony bliźniak');
  assert(draw(ownStar).some(z => z.type === 'cluster_switch'),
    'T3 KONTROLA PINU: na układzie zbadanym wejście do widoku zostaje — Finding 108 wymaga, ' +
    'żeby tryb rozkazu NIE odcinał jedynej drogi do układu');
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
console.log('T7 — pin źródłowy: FMO nie czyta już lustra');
{
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const fmo = stripComments(readFileSync(join(SRC, 'ui', 'FleetManagerOverlay.js'), 'utf8'));
  assert(!/sysReg\w*\s*\??\.explored/.test(fmo),
    'T7 SEDNO: żaden odczyt `sysReg….explored` w FleetManagerOverlay — lustro nie ma prawa ' +
    'wrócić jako źródło prawdy (kod czytany BEZ komentarzy, żeby opis nie zaliczał pinu)');
  assert(/SystemExploration\.js/.test(fmo),
    'T7 KONTROLA PINU: kanon JEST zaimportowany — inaczej pin wyżej przechodziłby także wtedy, ' +
    'gdyby ktoś po prostu usunął bramkę razem z funkcją');
}

console.log(`\n═══ ${pass} PASS, ${fail} FAIL ═══`);
process.exit(fail === 0 ? 0 : 1);
