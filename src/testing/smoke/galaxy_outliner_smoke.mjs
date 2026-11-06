// Keeper ARC GALAXY, krok G1 — LEWY outliner w trybie galaktyki (docs/design/GALAXY_PLAN.md §4 G1; D-GX-9, D-GX-10,
// D-GX-11). Protokół lekki F8: keeper wyłącznie dla LOGIKI (lista, kolejność, przygaszenie, dwie osie, wejście, klik,
// drzewo trybu układu) — bez pinów na stałych rysunku.
//   O0  API `GalaxyOutlinerLogic`
//   O1  SEDNO: lista galaktyki = `reveal.name` kanonu (`SystemRevealWorld`) ∨ własna obecność — na prawdziwej galaktyce
//       z generatora (72 układy, różne szczeble wywiadu, skany, zbadane)
//   O2  przygaszenie + ○: miejsce nieznane (`!reveal.place` ∧ brak obecności); obecność TRWAŁA w niezbadanym układzie (zapis
//       sprzed 186, Findingi 480 / 489) — na liście i nieprzygaszona. ⚠ Połowa „sam statek” O2c ŚWIADOMIE ODWRÓCONA po G3 (decyzja
//       właściciela, F3): statek nie daje nazwy — wiersz „???”, przygaszony; pinuje ją O11
//   O3  kolejność D-UI-2 rozszerzona: dom → układy z kolonią z POP → placówka / stacja → reszta wg odległości
//   O4  linia informacji i właściciel z kanonu: odległość ly · klasa widmowa · liczba kolonii; `fleet.stratcomEmpire*`
//       (imperium przy `contact`, obce przy `rumor`, nieznany bez wywiadu, Twoje Imperium przy własnej kolonii)
//   O5  SEDNO: obce kolonie wg DWÓCH OSI — nazwy CIAŁ (nigdy nazwa nadana przez wroga) przy miejscu ∧ `contact`;
//       „?” przy samym istnieniu właściciela; nic bez wywiadu; populacja wyłącznie przy `detailed`
//   O6  własne kolonie i stacje — zawsze w rozwinięciu, także w niezbadanym układzie
//   O7  bramka wejścia (186) na wierszu: wygenerowany ∧ (zbadany ∨ obecność); wiersz niewygenerowany — podpowiedź
//       `leftOutliner.cannotEnter`; 2. klik nie wchodzi przez kontroler
//   O8  klik: korzeń „GALAKTYKA” (tryb układu) → wejście; „← Układ: <aktywny>” → wyjście; wiersz — 1. klik zaznaczenie,
//       2. klik wejście, strzałka — rozwinięcie bez zaznaczenia; własna kolonia / stacja → wejście z fokusem
//   O9  SEDNO: drzewo trybu układu bez zmian — model z flagą ON = [korzeń] + model z flagą OFF (co do bajtu JSON);
//       flaga OFF — brak korzenia; wiersze układów w tej samej kolejności
//   O10 rozwinięcie: domyślnie gwiazda zaznaczona; jawny stan użytkownika tylko tam, gdzie różni się od domyślnego
//   O11 po G3 (F3, reguła D-UI-3 w trybie galaktyki): układ ze statkiem gracza albo cel jego skoku na liście także bez `reveal.name` —
//       „???” + przygaszenie; prawdziwa nazwa nigdzie w rysunku; wejście wg bramki G1 (cel skoku jej nie otwiera); KONTROLA: flaga OFF jak w G1
// Uruchom: node src/testing/smoke/galaxy_outliner_smoke.mjs
import '../headless/env.js';           // MUSI być pierwszy
import EventBus      from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { THEME } from '../../config/ThemeConfig.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { t, setLocale } from '../../i18n/i18n.js';
import { fmtDec } from '../../ui/NumberFormatLogic.js';
import { systemRevealFromWorld } from '../../utils/SystemRevealWorld.js';

let GOL = null, LO = null, GG = null, STL = null;
try { GOL = await import('../../ui/GalaxyOutlinerLogic.js'); } catch (e) { console.log('  (GalaxyOutlinerLogic:', e.message + ')'); }
try { LO = await import('../../ui/LeftOutliner.js'); } catch (e) { console.log('  (LeftOutliner:', e.message + ')'); }
try { GG = await import('../../generators/GalaxyGenerator.js'); } catch { /* piny padną */ }
try { STL = await import('../../ui/SystemTreeLogic.js'); } catch { /* piny padną */ }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
const header = (s) => console.log(`\n── ${s}`);
const call = (fn, ...a) => { try { return fn ? fn(...a) : undefined; } catch (e) { return `WYJĄTEK: ${e.message}`; } };
setLocale('pl');
const W = 1280, H = 720;
const FOR = STL?.PRESENCE_GLYPH?.foreign ?? '⚑', COL = STL?.PRESENCE_GLYPH?.colony ?? '🏛';

/** Atrapa ctx: rejestr napisów z bieżącym `fillStyle`; `measureText` — 6 px na znak (wzór `left_outliner_smoke`). */
const recCtx = () => {
  const calls = { text: [] };
  let fillStyle = '#000';
  return new Proxy({}, {
    get(o, k) {
      if (k === '_calls') return calls;
      if (k === 'fillStyle') return fillStyle;
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'fillText') return (s, x, y) => { calls.text.push({ s: String(s), x, y, fillStyle }); };
      if (k in o) return o[k];
      return () => {};
    },
    set(o, k, v) { if (k === 'fillStyle') fillStyle = v; else o[k] = v; return true; },
  });
};

// ── Świat: celowo różnorodny — każdy przypadek reguły ma swój układ ─────────────────────────────────────────────────
const LEVEL = ['unknown', 'rumor', 'contact', 'detailed'];
const intelLvl = { emp_A: 'contact', emp_B: 'rumor', emp_C: 'contact', emp_D: 'unknown' };
const atLeast = (emp, lvl) => LEVEL.indexOf(intelLvl[emp] ?? 'unknown') >= LEVEL.indexOf(lvl);
const SYS = [
  { id: 'sys_home', name: 'Dom', isHome: true, x: 0, y: 0, z: 0, distanceLY: 0, spectralType: 'G', explored: true },
  { id: 'sys_col', name: 'Kochab', x: 6, y: 1, z: 0, distanceLY: 6.2, spectralType: 'K', explored: true },
  { id: 'sys_out', name: 'Pollux', x: 4, y: 0, z: 0, distanceLY: 4.0, spectralType: 'K', explored: false },
  { id: 'sys_sta', name: 'Vega', x: 5, y: 0, z: 0, distanceLY: 5.0, spectralType: 'A', explored: true },
  { id: 'sys_scan', name: 'Altair', x: 3, y: 0, z: 0, distanceLY: 3.0, spectralType: 'A', explored: false },
  { id: 'sys_ship', name: 'Mizar', x: 3.5, y: 0, z: 0, distanceLY: 3.5, spectralType: 'F', explored: false },
  { id: 'sys_aiA', name: 'Thuban', x: 8, y: 0, z: 0, distanceLY: 8.0, spectralType: 'M', explored: true, empireId: 'emp_A' },
  { id: 'sys_aiB', name: 'Wezen', x: 9, y: 0, z: 0, distanceLY: 9.0, spectralType: 'F', explored: false, empireId: 'emp_B' },
  { id: 'sys_aiC', name: 'Deneb', x: 10, y: 0, z: 0, distanceLY: 10.0, spectralType: 'A', explored: false, empireId: 'emp_C' },
  { id: 'sys_unk', name: 'Sekret', x: 2, y: 0, z: 0, distanceLY: 2.0, spectralType: 'M', explored: false },
  { id: 'sys_aiD', name: 'Cien', x: 2.5, y: 0, z: 0, distanceLY: 2.5, spectralType: 'M', explored: false, empireId: 'emp_D' },
];
const generated = new Set(['sys_home', 'sys_col', 'sys_out', 'sys_sta', 'sys_ship', 'sys_aiA']);
const scans = new Set(['sys_scan']);
const BODIES = [
  { id: 'star_home', type: 'star', name: 'Dom', systemId: 'sys_home' },
  { id: 'H1', type: 'planet', name: 'Ziemia', systemId: 'sys_home', orbital: { a: 1 } },
  { id: 'C1', type: 'planet', name: 'Kochab c', systemId: 'sys_col', orbital: { a: 1 } },
  { id: 'O1', type: 'moon', name: 'Pollux b-I', systemId: 'sys_out', orbital: { a: 0.1 } },
  { id: 'V1', type: 'planet', name: 'Vega d', systemId: 'sys_sta', orbital: { a: 2 } },
  { id: 'T1', type: 'planet', name: 'Thuban b', systemId: 'sys_aiA', orbital: { a: 1 } },
  { id: 'B1', type: 'planet', name: 'Wezen c', systemId: 'sys_aiB', orbital: { a: 1 } },
  { id: 'D1', type: 'planet', name: 'Deneb e', systemId: 'sys_aiC', orbital: { a: 1 } },
  { id: 'st_1', type: 'station', name: 'Stacja Vega', systemId: 'sys_sta', bodyId: 'V1' },
];
const COLONIES = [
  { planetId: 'H1', name: 'Ziemia', isHomePlanet: true, isOutpost: false, ownerEmpireId: null, civSystem: { population: 40 } },
  { planetId: 'C1', name: 'Nowa Ziemia', isOutpost: false, ownerEmpireId: null, civSystem: { population: 8 } },
  { planetId: 'O1', name: 'Placówka Pollux', isOutpost: true, ownerEmpireId: null },
  { planetId: 'T1', name: 'Ula Vyr Prime', isOutpost: false, ownerEmpireId: 'emp_A', civSystem: { population: 12.4 } },
  { planetId: 'B1', name: 'Bastion Wroga', isOutpost: false, ownerEmpireId: 'emp_B', civSystem: { population: 30 } },
  { planetId: 'D1', name: 'Gniazdo Deneb', isOutpost: false, ownerEmpireId: 'emp_C', civSystem: { population: 5 } },
];
const STATIONS = [{ id: 'st_1', name: 'Stacja Vega', bodyId: 'V1', systemId: 'sys_sta', ownerEmpireId: null }];
const VESSELS = [{ id: 'v_1', name: 'Kurier', systemId: 'sys_ship', position: { state: 'orbiting' } }];
const ops = [];
const GM = {
  isActive: false, selectedSystemId: null,
  enter: (r) => ops.push(['enter', r]), exit: (r) => ops.push(['exit', r]),
  select: (id) => { ops.push(['select', id]); GM.selectedSystemId = id; },
  enterSystem: (id) => ops.push(['enterSystem', id]),
  enterBody: (b) => ops.push(['enterBody', b?.id]), enterStation: (s) => ops.push(['enterStation', s?.id]),
};
const SSM = { activeSystemId: 'sys_home', getSystem: (id) => (generated.has(id) ? { systemId: id } : null),
  getAllSystems: () => [...generated].map((id) => ({ systemId: id, galaxyStar: SYS.find((s) => s.id === id) })) };
const resetEntities = () => { EntityManager.clear?.(); for (const e of BODIES) EntityManager.add({ ...e }); };
resetEntities();
Object.assign(globalThis.window.KOSMOS, {
  civMode: true, planetGlobeOpen: false, activeSystemId: 'sys_home',
  galaxyData: { systems: SYS }, galaxyMode: GM, starSystemManager: SSM, entityManager: EntityManager,
  intelSystem: { isAtLeast: (emp, lvl) => atLeast(emp, lvl) },
  observatorySystem: { getSystemScanResult: (id) => (scans.has(id) ? { tier: 1 } : null) },
  empireRegistry: { get: (id) => ({ emp_A: { name: 'Liga Thubańska' }, emp_C: { name: 'Konsorcjum Deneb' } })[id] ?? null },
  colonyManager: { getAllColonies: () => COLONIES, getColony: (id) => COLONIES.find((c) => c.planetId === id) ?? null },
  stationSystem: { getAllStations: () => STATIONS },
  vesselManager: { getAllVessels: () => VESSELS },
  uiManager: { _selectedEntity: null, getSelectedVesselIds: () => [], getSelectedVesselId: () => null, getSelectedFleetId: () => null,
    overlayManager: { isAnyOpen: () => false } },
  threeRenderer: { _pingedEnemyId: null, resetToSystemView: () => true },
  stationPanel: { visible: false }, tacticalDock: { isExpanded: () => false, getReservedHeight: () => 0 },
});
const K = globalThis.window.KOSMOS;
const listNow = () => GOL?.buildGalaxySystemList?.({ ...GOL.galaxyWorldContext(K, { colonies: COLONIES, groundUnits: [] }) });
const rowOf = (list, id) => list?.byId?.get(id) ?? null;

// ═══ O0 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('O0  API');
{
  const need = ['GALAXY_GROUP', 'UNKNOWN_PLACE_GLYPH', 'systemPresenceIndex', 'buildGalaxySystemList', 'galaxyWorldContext',
    'isWarpCapable', 'buildGalaxyShipView', 'galaxyShipSectionOrder'];
  ok(need.every((k) => GOL && k in GOL), `O0a GalaxyOutlinerLogic — ${need.length} eksportów`);
  ok(typeof LO?.LeftOutliner === 'function', 'O0b LeftOutliner (importuje się pod node — prawdziwy `draw` / `hitTest`)');
}

// ═══ O1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('O1  lista = reveal.name ∨ obecność — prawdziwa galaktyka (72 układy), kanon `SystemRevealWorld`');
{
  const gal = GG?.GalaxyGenerator?.generate?.(777) ?? { systems: [] };
  const sys = gal.systems.map((s) => ({ ...s }));
  const lv = {};
  sys.forEach((s, i) => {
    if (!s.isHome && i % 4 === 1) s.empireId = `emp_${i % 3}`;   // trzy imperia na różnych szczeblach
    if (!s.isHome) s.explored = (i % 7 === 0);
  });
  lv.emp_0 = 'rumor'; lv.emp_1 = 'contact'; lv.emp_2 = 'unknown';
  const scanSet = new Set(sys.filter((s, i) => i % 11 === 3).map((s) => s.id));
  const K2 = { galaxyData: { systems: sys }, activeSystemId: 'sys_home', entityManager: EntityManager,
    intelSystem: { isAtLeast: (emp, l) => LEVEL.indexOf(lv[emp] ?? 'unknown') >= LEVEL.indexOf(l) },
    observatorySystem: { getSystemScanResult: (id) => (scanSet.has(id) ? { tier: 1 } : null) },
    starSystemManager: { getSystem: () => null }, colonyManager: { getAllColonies: () => [] }, vesselManager: { getAllVessels: () => [] } };
  const list = GOL?.buildGalaxySystemList?.({ ...GOL.galaxyWorldContext(K2, { colonies: [], groundUnits: [] }) });
  const listed = new Set((list?.rows ?? []).map((r) => r.systemId));
  const canon = new Set(sys.filter((s) => s.isHome || systemRevealFromWorld(K2, s).name === true).map((s) => s.id));
  const same = listed.size === canon.size && [...canon].every((id) => listed.has(id));
  ok(sys.length === 72 && same && canon.size > 5 && canon.size < 72,
    `O1a SEDNO: wiersze listy ≡ układy z \`reveal.name\` (lista ${listed.size}, kanon ${canon.size}, ze 72)`);
  const dimOk = (list?.rows ?? []).every((r) => r.dim === !(r.isHome || systemRevealFromWorld(K2, r.sys).place === true));
  ok(dimOk && (list?.rows ?? []).some((r) => r.dim) && (list?.rows ?? []).some((r) => !r.dim),
    'O1b przygaszenie ≡ `!reveal.place` (świadkowie obu stanów na liście)');
  ok((list?.rows ?? []).every((r) => r.sys?.empireId !== 'emp_2' || r.placeKnown), 'O1c imperium bez wywiadu — jego niezbadane układy poza listą (świadek: tylko zbadane / skanowane)');
}

// ═══ O2 / O3 ══════════════════════════════════════════════════════════════════════════════════════════════════════
header('O2  przygaszenie, obecność w niezbadanym układzie');
const L = listNow();
{
  const ids = (L?.rows ?? []).map((r) => r.systemId);
  ok(!ids.includes('sys_unk') && !ids.includes('sys_aiD'), 'O2a układ bez nazwy i bez obecności — poza listą (także imperium bez wywiadu)');
  ok(rowOf(L, 'sys_aiB')?.dim === true && rowOf(L, 'sys_aiC')?.dim === true && rowOf(L, 'sys_scan')?.dim === false && rowOf(L, 'sys_aiA')?.dim === false,
    'O2b przygaszone: nazwa z `rumor` / `contact` bez miejsca; jasne: skan obserwatorium, zbadany');
  ok(rowOf(L, 'sys_out')?.dim === false && rowOf(L, 'sys_out')?.placeKnown === true && rowOf(L, 'sys_out')?.label === 'Pollux',
    'O2c własna placówka w NIEZBADANYM układzie — na liście, jasna, z nazwą (Finding 480; połowa „sam statek” — O11)');

  header('O3  kolejność D-UI-2 rozszerzona');
  ok(ids.join(' ') === 'sys_home sys_col sys_out sys_sta sys_scan sys_ship sys_aiA sys_aiB sys_aiC',
    `O3a dom → kolonia z POP → placówka (4,0 ly) / stacja (5,0 ly) → reszta wg odległości (${ids.join(' ')})`);
}

// ── rysunek lewego outlinera w trybie galaktyki ─────────────────────────────────────────────────────────────────────
const newLO = () => { const lo = LO?.LeftOutliner ? new LO.LeftOutliner() : null; K.leftOutliner = lo; return lo; };
const drawLO = (lo) => { const ctx = recCtx(); call(() => lo.draw(ctx, W, H, { colonies: COLONIES, groundUnits: [] })); return ctx._calls.text; };
const texts = (calls) => calls.map((c) => c.s);
const zone = (lo, type, id) => (lo?._clickTargets ?? []).find((z) => z.type === type && (id == null || z.systemId === id || z.bodyId === id || z.stationId === id)) ?? null;
const hit = (lo, z, dx = 60) => (z ? call(() => lo.hitTest(z.x + dx, z.y + z.h / 2, W, H)) : null);

// ═══ O4 / O5 / O6 ═════════════════════════════════════════════════════════════════════════════════════════════════
header('O4  linia informacji i właściciel — kanon');
{
  GM.isActive = true; GM.selectedSystemId = 'sys_aiA';
  const lo = newLO();
  for (const id of ['sys_col', 'sys_aiB', 'sys_aiC', 'sys_sta', 'sys_out']) call(() => lo._toggleGalaxyExpanded(id, 'sys_aiA'));
  const drawn = drawLO(lo), tx = texts(drawn);
  // Treść linii — z MODELU (logika); rysunek przycina do szerokości kolumny (`_fit`), więc napis rysowany to prefiks.
  const mtx = (call(() => lo._model(K, { colonies: COLONIES, groundUnits: [] }))?.items ?? []).map((i) => i.text).filter(Boolean);
  const info = (d, sp, n) => t('leftOutliner.galaxyInfo', fmtDec(d, 1, 'pl'), sp, n);
  ok(mtx.includes(info(8, 'M', '1')) && mtx.includes(info(6.2, 'K', '1')) && mtx.includes(info(9, 'F', '?')),
    `O4a linia informacji: „${info(8, 'M', '1')}”, „${info(6.2, 'K', '1')}”, układ z obcą kolonią nieznaną — liczba „?”`);
  ok(mtx.includes(t('fleet.stratcomEmpire', 'Liga Thubańska')) && mtx.includes(t('fleet.stratcomEmpireForeign'))
    && mtx.includes(t('fleet.stratcomEmpire', 'Konsorcjum Deneb')) && mtx.includes(t('fleet.stratcomEmpire', t('territory.playerEmpire'))),
    'O4b właściciel: imperium przy `contact` (także bez miejsca), „obce imperium” przy `rumor`, „Twoje Imperium” przy własnej kolonii');
  const vegaOwner = mtx.includes(t('fleet.stratcomEmpireUnknown'));
  ok(vegaOwner, 'O4c układ bez imperium i bez własnej kolonii (sama stacja) — „Właściciel: nieznany” (reguła panelu Stratcom)');
  ok(tx.includes('UKŁADY [9]') && tx.includes(t('leftOutliner.backToSystem', 'Dom')), 'O4d nagłówek liczy wiersze listy; pierwszy wiersz „← Układ: Dom”');
  const lineDrawn = (full) => tx.some((s) => s === full || (s.endsWith('…') && full.startsWith(s.slice(0, -1))));
  ok(lineDrawn(info(8, 'M', '1')) && lineDrawn(t('fleet.stratcomEmpire', 'Konsorcjum Deneb')), 'O4e linie modelu są rysowane (całe albo przycięte do kolumny)');
  const cutZ = (lo?._clickTargets ?? []).find((z) => z.type === 'gline' && z.cut === true && z.text === t('fleet.stratcomEmpire', 'Konsorcjum Deneb'));
  if (cutZ) call(() => lo.updateHover(cutZ.x + 40, cutZ.y + 4, W, H));
  const tipCut = lo?._tip?.text;
  const fullZ = (lo?._clickTargets ?? []).find((z) => z.type === 'gline' && z.cut === false);
  if (fullZ) call(() => lo.updateHover(fullZ.x + 40, fullZ.y + 4, W, H));
  ok(!!cutZ && tipCut === t('fleet.stratcomEmpire', 'Konsorcjum Deneb') && !!fullZ && lo?._tip == null,
    'O4f linia obcięta do kolumny — pełny tekst w podpowiedzi; KONTROLA: linia cała — bez podpowiedzi');

  header('O5  obce kolonie — dwie osie');
  ok(mtx.includes(`${FOR} Thuban b`) && !mtx.some((s) => s.includes('Ula Vyr')) && !tx.some((s) => s.includes('Ula Vyr')),
    'O5a SEDNO: miejsce ∧ `contact` — nazwa CIAŁA („Thuban b”), nigdy nazwa nadana przez wroga');
  ok(!mtx.some((s) => s.includes('POP') && s.includes('Thuban')), 'O5b przy `contact` — bez populacji');
  ok(mtx.filter((s) => s === t('leftOutliner.foreignColoniesUnknown')).length === 2
    && ![...mtx, ...tx].some((s) => s.includes('Wezen c') || s.includes('Deneb e') || s.includes('Bastion') || s.includes('Gniazdo')),
    'O5c `rumor` (Wezen) i `contact` BEZ miejsca (Deneb) — „obce kolonie: ?”, żadnej nazwy');
  intelLvl.emp_A = 'detailed';
  const mtx2 = (call(() => lo._model(K, { colonies: COLONIES, groundUnits: [] }))?.items ?? []).map((i) => i.text).filter(Boolean);
  ok(mtx2.includes(`${FOR} Thuban b · 12 POP`), 'O5d populacja wyłącznie przy `detailed` („· 12 POP”)');
  intelLvl.emp_A = 'unknown';
  const L2 = listNow();
  ok(rowOf(L2, 'sys_aiA')?.foreign?.kind === 'none' && rowOf(L2, 'sys_aiA')?.owner?.kind === 'unknown' && rowOf(L2, 'sys_aiA')?.colonyCount === '0',
    'O5e bez wywiadu — obce kolonie: nic (nawet „?”), właściciel nieznany; układ zostaje na liście (zbadany)');
  intelLvl.emp_A = 'contact';

  header('O6  własne kolonie i stacje — zawsze');
  ok(tx.includes(`${COL} Nowa Ziemia`) && tx.includes('🛰 Stacja Vega') && tx.includes(`${STL?.PRESENCE_GLYPH?.outpost ?? '⛺'} Placówka Pollux`),
    'O6a rozwinięcie: własna kolonia (nazwa nadana przez gracza), stacja, placówka w NIEZBADANYM układzie');
  ok(!!zone(lo, 'gcol', 'C1') && !!zone(lo, 'gsta', 'st_1') && !!zone(lo, 'gcol', 'O1'), 'O6b wiersze własnych obiektów są klikalne');
  const dimRow = drawLO(lo).find((c) => c.s === 'Wezen');
  ok(!!dimRow && dimRow.fillStyle === THEME.textDim && texts(drawLO(lo)).includes(GOL?.UNKNOWN_PLACE_GLYPH ?? '○'), 'O6c wiersz przygaszony: nazwa `textDim`, znacznik ○');
}

// ═══ O7 / O8 ══════════════════════════════════════════════════════════════════════════════════════════════════════
header('O7  bramka wejścia (186) na wierszu');
{
  const L3 = listNow();
  ok(rowOf(L3, 'sys_col')?.enterable === true && rowOf(L3, 'sys_out')?.enterable === true && rowOf(L3, 'sys_ship')?.enterable === true
    && rowOf(L3, 'sys_scan')?.enterable === false && rowOf(L3, 'sys_aiB')?.enterable === false && rowOf(L3, 'sys_aiC')?.enterable === false,
    'O7a wygenerowany ∧ (zbadany ∨ obecność): kolonia / placówka w niezbadanym / statek — tak; skan bez wygenerowania, układy AI niezbadane — nie');
  GM.isActive = true; GM.selectedSystemId = null;
  const lo = newLO(); drawLO(lo);
  const zs = zone(lo, 'gsys', 'sys_scan');
  if (zs) call(() => lo.updateHover(zs.x + 60, zs.y + 4, W, H));
  ok(lo?._tip?.text === t('leftOutliner.cannotEnter'), `O7b podpowiedź wiersza bez wejścia („${lo?._tip?.text}”)`);
  const zc = zone(lo, 'gsys', 'sys_col');
  if (zc) call(() => lo.updateHover(zc.x + 60, zc.y + 4, W, H));
  ok(lo?._tip == null || lo._tip.text !== t('leftOutliner.cannotEnter'), 'O7c KONTROLA: wiersz z wejściem — bez tej podpowiedzi');

  header('O8  klik');
  ops.length = 0; GM.selectedSystemId = null;
  hit(lo, zone(lo, 'gsys', 'sys_col'));
  ok(JSON.stringify(ops) === '[["select","sys_col"]]', `O8a 1. klik w wiersz — zaznaczenie gwiazdy na płycie (${JSON.stringify(ops)})`);
  drawLO(lo); ops.length = 0;
  hit(lo, zone(lo, 'gsys', 'sys_col'));
  ok(JSON.stringify(ops) === '[["enterSystem","sys_col"]]', 'O8b 2. klik w zaznaczony — wejście (kontroler sprawdza bramkę 186)');
  drawLO(lo); ops.length = 0;
  const za = zone(lo, 'gsys', 'sys_aiB');
  if (za) call(() => lo.hitTest(za.x + 4, za.y + 4, W, H));
  ok(ops.length === 0 && lo?._galaxyExpandedOf?.('sys_aiB', GM.selectedSystemId) === true, 'O8c strzałka — rozwinięcie, bez zaznaczenia i wejścia');
  drawLO(lo); ops.length = 0;
  hit(lo, zone(lo, 'galaxyBack'));
  ok(JSON.stringify(ops) === '[["exit","outliner"]]', 'O8d „← Układ: …” — wyjście z trybu galaktyki');
  GM.selectedSystemId = 'sys_col'; drawLO(lo); ops.length = 0;
  hit(lo, zone(lo, 'gcol', 'C1'), 40);
  ok(JSON.stringify(ops) === '[["enterBody","C1"]]', 'O8e własna kolonia w rozwinięciu — wejście z fokusem na ciele');
  GM.selectedSystemId = 'sys_sta'; drawLO(lo); ops.length = 0;
  hit(lo, zone(lo, 'gsta', 'st_1'), 40);
  ok(JSON.stringify(ops) === '[["enterStation","st_1"]]', 'O8f własna stacja w rozwinięciu — wejście z fokusem na stacji');
  GM.isActive = false; GM.selectedSystemId = null;
  const ls = newLO(); drawLO(ls); ops.length = 0;
  hit(ls, zone(ls, 'galaxyRoot'));
  ok(JSON.stringify(ops) === '[["enter","outliner"]]', 'O8g tryb układu: wiersz „GALAKTYKA” — wejście w tryb galaktyki');
  const zr = zone(ls, 'galaxyRoot');
  if (zr) call(() => ls.updateHover(zr.x + 60, zr.y + 4, W, H));
  ok(ls?._tip?.text === t('bottomBar.mapModeHint'), 'O8h podpowiedź korzenia — klawisz trybu mapy');
}

// ═══ O9 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('O9  drzewo trybu układu bez zmian (flaga ON = korzeń + OFF)');
{
  GM.isActive = false;
  const flag0 = GAME_CONFIG.FEATURES.galaxyView;
  const lo = newLO();
  const modelAt = (on) => { GAME_CONFIG.FEATURES.galaxyView = on; const m = call(() => lo._model(K, { colonies: COLONIES, groundUnits: [] })); GAME_CONFIG.FEATURES.galaxyView = flag0; return m; };
  const mOn = modelAt(true), mOff = modelAt(false);
  const strip = (m) => JSON.stringify({ title: m?.title, keyHint: m?.keyHint, items: m?.items, result: m?.result, active: m?.active });
  ok(mOn?.items?.[0]?.kind === 'galaxyRoot' && !mOff?.items?.some?.((i) => i.kind === 'galaxyRoot'), 'O9a flaga ON — pierwszy wiersz korzenia; OFF — brak');
  ok(strip(mOff) === strip({ ...mOn, items: mOn?.items?.slice?.(1) }) && (mOff?.items?.length ?? 0) > 3,
    `O9b SEDNO: reszta modelu co do bajtu JSON jak przy OFF (${mOff?.items?.length ?? 0} wierszy drzewa)`);
  const drawAt = (on) => { GAME_CONFIG.FEATURES.galaxyView = on; const tx = drawLO(lo); GAME_CONFIG.FEATURES.galaxyView = flag0; return tx; };
  const tOn = drawAt(true), tOff = drawAt(false);
  const sysOrder = (calls) => calls.map((c) => c.s).filter((s) => ['Dom', 'Kochab', 'Pollux', 'Vega', 'Mizar', 'Thuban'].includes(s));
  ok(JSON.stringify(sysOrder(tOn)) === JSON.stringify(sysOrder(tOff)) && texts(tOn).includes('GALAKTYKA') && !texts(tOff).includes('GALAKTYKA'),
    'O9c rysunek: te same wiersze drzewa w tej samej kolejności; „GALAKTYKA” tylko przy ON');
}

// ═══ O10 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('O10 rozwinięcie — domyślnie zaznaczona gwiazda');
{
  const lo = newLO();
  ok(lo?._galaxyExpandedOf?.('sys_col', 'sys_col') === true && lo?._galaxyExpandedOf?.('sys_col', 'sys_aiA') === false, 'O10a domyślnie rozwinięta wyłącznie gwiazda zaznaczona');
  call(() => lo._toggleGalaxyExpanded('sys_col', 'sys_col'));
  ok(lo?._galaxyExpanded?.get?.('sys_col') === false, 'O10b zwinięcie zaznaczonej — jawny stan (różni się od domyślnego)');
  call(() => lo._toggleGalaxyExpanded('sys_col', 'sys_col'));
  ok(lo?._galaxyExpanded?.has?.('sys_col') === false, 'O10c powrót do domyślnego — bez jawnego stanu (D-UI-4)');
  EventBus.emit('galaxy:selectionChanged', { systemId: 'sys_aiA' });
  ok(lo?._revealKey === 'gsys:sys_aiA', 'O10d zaznaczenie gwiazdy na płycie — odsłonięcie wiersza (przewinięcie listy)');
}

// ═══ O11 ══════════════════════════════════════════════════════════════════════════════════════════════════════════
header('O11 statek i cel skoku listują układ bez nazwy (F3)');
{
  const fWarp = GAME_CONFIG.FEATURES.galaxyWarp;
  GAME_CONFIG.FEATURES.galaxyWarp = true;   // sekcja pinuje ścieżkę ON niezależnie od domyślnej flagi (przebieg całości z OFF)
  GM.isActive = true; GM.selectedSystemId = null;
  const r0 = rowOf(listNow(), 'sys_ship');
  ok(r0?.known === false && r0?.label === '???' && r0?.dim === true && r0?.placeKnown === false && r0?.name === 'Mizar',
    'O11a SEDNO: sam statek w niezbadanym układzie — wiersz „???”, przygaszony (świadomie odwrócone wobec G1)');
  ok(r0?.enterable === true && r0?.own === true, 'O11b wejście wg bramki G1: wygenerowany ∧ obecność — można wejść');
  const lo = newLO();
  const drawn = drawLO(lo);
  const mark = drawn.find((c) => c.s === '???');
  ok(!!mark && mark.fillStyle === THEME.textDim && texts(drawn).includes(GOL?.UNKNOWN_PLACE_GLYPH ?? '○') && !texts(drawn).includes('Mizar'),
    'O11c rysunek: „???” w `textDim`, znacznik ○, prawdziwej nazwy nie ma');
  const za = zone(lo, 'gsys', 'sys_ship');
  ops.length = 0; hit(lo, za);
  ok(JSON.stringify(ops) === '[["select","sys_ship"]]', 'O11d klik wiersza „???” — zaznaczenie jak każdy wiersz');
  drawLO(lo); ops.length = 0; hit(lo, zone(lo, 'gsys', 'sys_ship'));
  ok(JSON.stringify(ops) === '[["enterSystem","sys_ship"]]', 'O11e 2. klik — wejście przez kontroler (bramka G1)');
  GM.selectedSystemId = null;
  K.activeSystemId = 'sys_ship';
  const back = call(() => newLO()._model(K, { colonies: COLONIES, groundUnits: [] }))?.items?.[0];
  ok(back?.kind === 'galaxyBack' && back?.name === '???', 'O11p wiersz powrotu „← Układ: …” przy aktywnym układzie bez nazwy — „???”');
  K.activeSystemId = 'sys_home';

  // Cel skoku: układ bez nazwy, bez statku na miejscu.
  const inTransit = { id: 'v_t', name: 'Skoczek', systemId: null, position: { state: 'orbiting', dockedAt: null },
    mission: { type: 'interstellar_jump', phase: 'warp_transit', toSystemId: 'sys_unk' } };
  VESSELS.push(inTransit);
  const r1 = rowOf(listNow(), 'sys_unk');
  ok(r1?.label === '???' && r1?.dim === true && r1?.known === false, 'O11f SEDNO: cel skoku bez nazwy — na liście jako „???”, przygaszony');
  ok(r1?.enterable === false && r1?.own === false, 'O11g cel skoku nie otwiera wejścia: nie ma tam obecności');
  generated.add('sys_unk');
  ok(rowOf(listNow(), 'sys_unk')?.enterable === false, 'O11h nawet wygenerowany: bramka G1 pyta o obecność, nie o cel skoku');
  generated.delete('sys_unk');
  ok(rowOf(listNow(), 'sys_scan')?.label === 'Altair' && rowOf(listNow(), 'sys_col')?.label === 'Kochab', 'O11i KONTROLA: układy z nazwą — nazwa w etykiecie wiersza');
  VESSELS.pop();
  ok(!rowOf(listNow(), 'sys_unk'), 'O11j KONTROLA: statek w tranzycie zniknął — cel znów poza listą (O2a nie jest jałowe)');

  // Koniec trasy wieloprzeskokowej też jest celem.
  VESSELS.push({ id: 'v_r', name: 'Trasa', systemId: 'sys_col', position: { state: 'orbiting', dockedAt: 'C1' }, mission: null,
    warpRoute: { hops: ['sys_col', 'sys_scan', 'sys_aiD'], legIndex: 0 } });
  ok(rowOf(listNow(), 'sys_aiD')?.label === '???', 'O11k koniec trasy wieloprzeskokowej — cel skoku (imperium bez wywiadu: tylko „???”)');
  VESSELS.pop();

  // Obecność trwała daje nazwę; statek obok niej niczego nie zmienia.
  const pres = call(() => GOL.systemPresenceIndex({ colonies: [], vessels: [{ id: 'a', systemId: 'x' }, { id: 'b', systemId: null,
    mission: { type: 'interstellar_jump', phase: 'warp_transit', toSystemId: 'y' } }], groundUnits: [{ planetId: 'g1' }],
    systemOfBody: () => 'z' }));
  const ex = pres?.get?.('x'), ey = pres?.get?.('y'), ez = pres?.get?.('z');
  ok(ex?.ship === true && ex?.own === true && ex?.named === false, 'O11l indeks: statek — obecność, ale nie nazwa');
  ok(ey?.inbound === 1 && ey?.own === false && ey?.ship === false, 'O11m indeks: cel skoku — licznik w drodze, bez obecności');
  ok(ez?.troops === true && ez?.named === true && ez?.own === true, 'O11n indeks: wojska — obecność trwała (dają nazwę)');

  // Flaga OFF — stan sprzed kroku.
  GAME_CONFIG.FEATURES.galaxyWarp = false;
  VESSELS.push(inTransit);
  const off = listNow();
  ok(rowOf(off, 'sys_ship')?.label === 'Mizar' && rowOf(off, 'sys_ship')?.dim === false && !rowOf(off, 'sys_unk'),
    'O11o KONTROLA OFF: statek daje nazwę (G1), cel skoku poza listą — przyrząd widzi różnicę');
  VESSELS.pop();
  GAME_CONFIG.FEATURES.galaxyWarp = fWarp;
  GM.isActive = false;
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
