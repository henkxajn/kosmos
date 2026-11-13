// Keeper ARC GALAXY, krok G2-2 — CHROM trybu galaktyki (docs/design/GALAXY_PLAN.md §4 G2; D-GX-16, D-GX-17 (c), D-GX-22).
// Protokół lekki F8: keeper wyłącznie dla LOGIKI (model przypięcia, tabela stanów skanu, anty-lustro treści, reguła wskaźnika,
// gęstość nazw, szyna statków, zasięg i blipy) — bez pinów na stałych rysunku i bez kontroli na poprzednim commicie.
//   H0  API (`GalaxyChromeLogic`, `ObservatoryRange`, `chipLayersFor`)
//   H9  uwaga: od poprawek po G3 (F5) szyna domyślnie nie ma nazw — geometria wierszy pinowana przy chipie [O] włączonym
//   H13 po G3 (F5): tabela widoczności nazw szyny (domyślnie / chip [O] / najechana / zaznaczona / kursor na wierszu / zaznaczony statek)
//   H14 po G3 (F4): CTRL+klik wiersza szyny wygrywa z gwiazdą SĄSIADA pod kursorem; zwykły klik — gwiazda (Finding 110)
//   H1  przyciski przypięcia: [ Wejdź ] tylko dla układu do wejścia, [ Wyślij ▼ ] zawsze obecny i włączony, chip skanu;
//       [ Beacon ] / [ Gate ] pominięte (D-GX-17 (c))
//   H2  tabela stanów chipu skanu (dom, w toku, zbadany, brak obserwatorium, poza zasięgiem / bramka wyłączona, wynik pełny,
//       wynik niższy, limit, zwykły)
//   H3  akcje przypięcia: wyłączony przycisk mówi powód (bez wywołań), [ Wejdź ] → wlot, [ Skanuj ] → ten sam backend
//       i trzy komunikaty odmowy (jeden dom skanu w kodzie), [ Anuluj skan ] → anulowanie ręczne
//   H4  linia skanu w rozwinięciu („Skanowanie… 42% · 1,3 lat”), wyniki wg tieru; rozwinięcie ≤ 4 linie
//   H5  ANTY-LUSTRO (16 stanów: zbadany × skan × wywiad unknown / rumor / contact / detailed): nazwa na płycie ≡ wiersz
//       lewego outlinera ≡ nagłówek przypięcia; linia właściciela przypięcia ≡ ta sama funkcja co wiersz outlinera —
//       WYKONANIE prawdziwej podwarstwy `HudGalaxyLabelLayer` na atrapie świata
//   H6  reguła wskaźnika (klik ≡ najechanie — Finding 109): przycisk > nazwa przypiętej > reszta przypięcia (pochłonięta) >
//       gwiazda pod kursorem (wygrywa z nazwą sąsiada — Finding 110) > nazwa; klik prawdziwej podwarstwy
//   H7  gęstość nazw (D-GX-16): nigdy nie chowane — dom, własne, zaznaczona, najechana, cel nurkowania, skanowana; reszta
//       chowa się przy nakładaniu (prawdziwe `placeLabels`)
//   H8  szyna — model (zbiór Stratcomu): własne z bakiem warp albo w skoku; wróg i wrak poza; tranzyt — punkt na linii skoku;
//       kolejność stała (nazwa, id)
//   H9  szyna — geometria i strefy (z `stratcom_ship_icon` T1–T7): wiersze NIGDY na kwadracie wyboru gwiazdy, kafelkowane bez
//       nakładania, „+N” bez strefy, gwiazda poza kadrem — bez stref (cull), klik wiersza → wiersz prawego outlinera, gwiazda
//       pod kursorem wygrywa (WYKONANIE `HudGalaxyRailLayer`)
//   H10 zasięg obserwatorium (z `warp_stratcom` W13): tabela Lv → ly bez zmian, środek = dom, metryka płaska; jedno źródło
//       tabeli (`ObservatoryRange`); blipy obcych: kontakt pełny / plotka duch / poza zasięgiem — nic
//   H11 chipy warstw w trybie galaktyki: [R] [T] [E] i „Okręty” na miejscu [O]
//   H12 pierścień pingu w kawałkach z ciągłą fazą kropek (koszt rasteryzacji ścieżki o obwiedni całego ekranu)
// PRZECELOWANE 2026-11-07 (ARC GALAXY G5-B — flagi `galaxyView` / `galaxyLook` / `galaxyWarp` na stałe ON, ścieżki OFF i zakładka
//   Stratcom usunięte): ustawianie flag w setupie (plik, H13, H14) zdjęte — bez czytelnika. H1b — [ Wyślij ▼ ] zawsze włączony
//   (powód null; dawny parametr `sendEnabled` bez czytelnika, stała `GALAXY_CHROME.NOT_YET` usunięta); H3a — wyłączony przycisk
//   z prawdziwego producenta (chip skanu bez obserwatorium) zamiast dawnego „Wyślij — G3”; H3e — trzy komunikaty skanu mają
//   jeden dom (`GalaxyChromeLogic`; żyły też w usuniętym `case 'stratcom_scan'` FMO); H6 — bez obejścia `L._look` (ścieżka G1
//   usunięta); H10e — FMO bez `_getStratcomRangeLY` i bez własnej tabeli, tabela wyłącznie w `utils/ObservatoryRange.js`;
//   H11a–H11d — sygnatury `chipLayersFor(galaxyActive)` / `chipsForMode(chips, galaxyActive)`: w trybie galaktyki „Okręty”
//   zawsze (H11b / H11d — dawny parametr chipu bez czytelnika); H13f — sama funkcja czysta (próg domyślny 1).
//   WYCOFANE: H13a wiersz „flaga OFF — nazwy i „+1” jak w G2”, H14c (OFF: przy CTRL gwiazda wygrywa).
// Uruchom: node src/testing/smoke/galaxy_chrome_smoke.mjs
import '../headless/env.js';           // MUSI być pierwszy
import fs from 'node:fs';
import { t, setLocale, getLocale } from '../../i18n/i18n.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
const header = (s) => console.log(`\n── ${s}`);
const call = (fn, ...a) => { try { return fn ? fn(...a) : undefined; } catch (e) { return `WYJĄTEK: ${e.message}`; } };
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
// Pliki produkcyjne `src/` (bez keeperów i bibliotek) — piny „jeden dom” (H3e, H10e); komentarze zdejmowane tylko z trafień.
const SRC_URL = new URL('../../', import.meta.url);
const walkJs = (u) => fs.readdirSync(u, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walkJs(new URL(`${e.name}/`, u)) : e.name.endsWith('.js') ? [new URL(e.name, u)] : []);
const PROD = walkJs(SRC_URL).map((u) => ({ rel: u.href.slice(SRC_URL.href.length), u }))
  .filter((f) => !f.rel.startsWith('testing/') && !f.rel.startsWith('lib/'));
/** Pliki produkcyjne (ścieżka względem `src/`), których KOD pasuje do `re` (bez flagi `g`); `skip` — pominięte prefiksy. */
const prodFilesMatching = (needle, re, skip = []) => PROD
  .filter((f) => !skip.some((p) => f.rel.startsWith(p)))
  .filter((f) => { const s = fs.readFileSync(f.u, 'utf8'); return s.includes(needle) && re.test(stripComments(s.replace(/\r\n/g, '\n'))); })
  .map((f) => f.rel);

let CL = null, OR = null, HC = null, GOL = null, HGL = null, HGR = null, HLL = null, GL = null;
try { CL = await import('../../ui/GalaxyChromeLogic.js'); } catch (e) { console.log('  (GalaxyChromeLogic:', e.message + ')'); }
try { OR = await import('../../utils/ObservatoryRange.js'); } catch (e) { console.log('  (ObservatoryRange:', e.message + ')'); }
try { HC = await import('../../ui/HudLayerChipsLogic.js'); } catch (e) { console.log('  (HudLayerChipsLogic:', e.message + ')'); }
try { GOL = await import('../../ui/GalaxyOutlinerLogic.js'); } catch (e) { console.log('  (GalaxyOutlinerLogic:', e.message + ')'); }
try { HGL = await import('../../ui/HudGalaxyLabelLayer.js'); } catch (e) { console.log('  (HudGalaxyLabelLayer:', e.message + ')'); }
try { HGR = await import('../../ui/HudGalaxyRailLayer.js'); } catch (e) { console.log('  (HudGalaxyRailLayer:', e.message + ')'); }
try { HLL = await import('../../ui/HudLabelLogic.js'); } catch (e) { console.log('  (HudLabelLogic:', e.message + ')'); }
try { GL = await import('../../ui/GalaxyModeLogic.js'); } catch (e) { console.log('  (GalaxyModeLogic:', e.message + ')'); }
let HGP = null;
try { HGP = await import('../../ui/HudGalaxyPingLayer.js'); } catch (e) { console.log('  (HudGalaxyPingLayer:', e.message + ')'); }

const loc0 = getLocale();
setLocale?.('pl');

header('H0  API');
{
  const need = ['GALAXY_CHROME', 'UNNAMED_SYSTEM', 'galaxyOwnerText', 'galaxyInfoText', 'galaxyDisplayName', 'galaxyPinHeader',
    'galaxyScanLine', 'galaxyBodiesLine', 'galaxyExpansionLines', 'galaxyScanChip', 'galaxyPointerTarget', 'stripLeadSymbol', 'galaxyPinButtons',
    'runGalaxyPinAction', 'galaxyLabelEssential', 'galaxyShipRail', 'railLayout', 'galaxyBlipMode', 'galaxyEnemyBlips', 'galaxyChromeAlpha'];
  const miss = need.filter((k) => !(CL && k in CL));
  ok(miss.length === 0, `H0a GalaxyChromeLogic — ${need.length} eksportów (brak: ${miss.join(', ') || '—'})`);
  ok(OR && ['STRATCOM_LY_BY_LEVEL', 'observatoryRangeLY', 'planarDistanceLY', 'inObservatoryRange'].every((k) => k in OR), 'H0b ObservatoryRange — 4 eksporty');
  ok(typeof HC?.chipLayersFor === 'function', 'H0c HudLayerChipsLogic.chipLayersFor');
}

header('H1  przyciski przypięcia');
{
  const chip = CL?.galaxyScanChip?.({ maxTier: 2, inRange: true });
  const b1 = call(() => CL.galaxyPinButtons({ enterable: true, scanChip: chip, t }));
  ok(Array.isArray(b1) && b1.map((b) => b.id).join(',') === 'enter,send,scan', `H1a układ do wejścia: [ Wejdź ] [ Wyślij ▼ ] [ Skanuj ] (${b1?.map?.((b) => b.id)})`);
  const send = b1?.find?.((b) => b.id === 'send');
  // G5-B: dawny parametr `sendEnabled` (ścieżka OFF — „G3”) bez czytelnika: także `false` niczego nie wyłącza.
  const sendOld = call(() => CL.galaxyPinButtons({ enterable: true, scanChip: chip, sendEnabled: false, t }))?.find?.((b) => b.id === 'send');
  ok(send?.enabled === true && send?.reason === null && send?.label === t('galaxyPin.send')
    && sendOld?.enabled === true && sendOld?.reason === null && !!CL?.GALAXY_CHROME && !('NOT_YET' in CL.GALAXY_CHROME),
    'H1b [ Wyślij ▼ ] obecny i zawsze włączony (powód null); `sendEnabled` bez czytelnika, stałej `GALAXY_CHROME.NOT_YET` brak');
  ok(b1?.[0]?.label === 'Wejdź' && b1?.[2]?.label === 'Skanuj układ', 'H1c napisy z i18n (bez wiodącego symbolu)');
  const b2 = call(() => CL.galaxyPinButtons({ enterable: false, scanChip: null, t }));
  ok(b2?.map?.((b) => b.id).join(',') === 'send', 'H1d układ bez wejścia, dom bez chipu skanu — tylko [ Wyślij ▼ ]');
  ok(!(b1 ?? []).some((b) => /beacon|gate/i.test(b.id)), 'H1e [ Beacon ] / [ Gate ] pominięte (D-GX-17 (c))');
}

header('H2  tabela stanów chipu skanu');
{
  const S = (o) => call(() => CL.galaxyScanChip({ maxTier: 2, inRange: true, rangeGate: true, ...o }));
  const show = (c) => (c ? `${c.id}:${c.enabled ? 'on' : 'off'}:${c.reasonKey ?? '-'}` : 'null');
  const rows = [
    [{ isHome: true }, 'null'],
    [{ scanning: true }, 'scanCancel:on:-'],
    [{ explored: true }, 'scan:off:fleet.scanComplete'],
    [{ maxTier: 0 }, 'scan:off:fleet.scanLocked'],
    [{ inRange: false }, 'scan:off:tooltip.menu.outOfRange'],
    [{ inRange: false, rangeGate: false }, 'scan:on:-'],
    [{ resultTier: 2 }, 'scanMore:off:fleet.scanComplete'],
    [{ resultTier: 1 }, 'scanMore:on:-'],
    [{ atLimit: true }, 'scan:off:fleet.scanLimitToast'],
    [{ atLimit: true, resultTier: 1 }, 'scanMore:off:fleet.scanLimitToast'],
    [{}, 'scan:on:-'],
  ];
  const bad = rows.filter(([o, exp]) => show(S(o)) !== exp).map(([o, exp]) => `${JSON.stringify(o)} → ${show(S(o))} (oczek. ${exp})`);
  ok(bad.length === 0, `H2a ${rows.length} stanów (${bad.join(' | ') || 'zgodne'})`);
  ok(S({ scanning: true, explored: true })?.id === 'scanCancel', 'H2b skan w toku wygrywa z każdym innym stanem (zawsze da się anulować)');
}

header('H3  akcje przypięcia');
{
  const log = [];
  const obs = { startSystemScan: (id) => { log.push(['start', id]); return obs._ok; }, cancelSystemScan: (id, r) => { log.push(['cancel', id, r]); return true; },
    getMaxSystemScanTier: () => obs._tier, getActiveSystemScans: () => obs._active, getMaxConcurrentSystemScans: () => 1, _ok: true, _tier: 2, _active: [] };
  const K = { observatorySystem: obs, galaxyMode: { enterSystem: (id) => { log.push(['enter', id]); return true; } } };
  const toasts = [];
  const run = (btn) => call(() => CL.runGalaxyPinAction(btn, { systemId: 'sys_x', K, t, toast: (s) => toasts.push(s) }));
  // Wyłączony przycisk z prawdziwego producenta: chip skanu bez obserwatorium (G5-B — [ Wyślij ▼ ] nie bywa już wyłączony).
  const off = call(() => CL.galaxyPinButtons({ enterable: false, scanChip: CL.galaxyScanChip({ maxTier: 0, inRange: true }), t }))
    ?.find?.((b) => b.id === 'scan');
  const r0 = run(off);
  ok(off?.enabled === false && r0 === 'disabled' && toasts[0] === t('fleet.scanLocked') && log.length === 0,
    'H3a wyłączony przycisk (chip skanu bez obserwatorium) — sam powód, bez wywołań');
  ok(run({ id: 'enter', enabled: true }) === 'enter' && log.some((e) => e[0] === 'enter' && e[1] === 'sys_x'), 'H3b [ Wejdź ] → `galaxyMode.enterSystem` (wlot)');
  log.length = 0; toasts.length = 0;
  ok(run({ id: 'scan', enabled: true }) === 'scan' && log[0]?.[0] === 'start', 'H3c [ Skanuj ] → `ObservatorySystem.startSystemScan` (ten sam backend)');
  obs._ok = false; obs._tier = 0; run({ id: 'scan', enabled: true });
  obs._tier = 2; obs._active = [{}]; run({ id: 'scanMore', enabled: true });
  obs._active = []; run({ id: 'scan', enabled: true });
  ok(toasts.join('|') === [t('fleet.scanLockedToast'), t('fleet.scanLimitToast'), t('fleet.scanBusyToast')].join('|'),
    'H3d odmowa backendu — trzy komunikaty (blokada / limit / zajęty)');
  // G5-B: zakładka Stratcom usunięta (z nią `case 'stratcom_scan'` FMO) — skan ma w kodzie JEDEN dom: przypięcie płyty.
  const homes = ['fleet.scanLockedToast', 'fleet.scanLimitToast', 'fleet.scanBusyToast']
    .map((k) => prodFilesMatching(k, new RegExp(`'${k.replace(/\./g, '\\.')}'`), ['i18n/']));
  ok(homes.every((h) => h.join(',') === 'ui/GalaxyChromeLogic.js'),
    `H3e trzy komunikaty skanu — jeden dom: GalaxyChromeLogic, FMO bez nich (${homes.map((h) => h.join('+') || '—').join(' | ')})`);
  log.length = 0;
  ok(run({ id: 'scanCancel', enabled: true }) === 'scanCancel' && log[0]?.[0] === 'cancel' && log[0]?.[2] === 'manual', 'H3f [ Anuluj skan ] → anulowanie ręczne');
}

header('H4  linia skanu, rozwinięcie');
{
  const fmt = (v, d) => v.toFixed(d).replace('.', ',');
  const l1 = call(() => CL.galaxyScanLine({ scanning: { pct: 0.42, progress: 0.42 * 2.3, durationYears: 2.3 } }, { t, fmtDec: fmt }));
  ok(l1 === `${t('fleet.scanProgress', 42)} · ${t('fleet.etaYears', '1,3')}`, `H4a skan w toku — postęp i pozostały czas (${l1})`);
  const l2 = call(() => CL.galaxyScanLine({ result: { tier: 3, counts: { total: 17 } } }, { t }));
  const l3 = call(() => CL.galaxyScanLine({ result: { tier: 1, counts: { planets: 5 } } }, { t }));
  ok(l2 === `${t('fleet.scanTotal')}: 17` && l3 === `${t('fleet.scanPlanets')}: 5` && call(() => CL.galaxyScanLine({}, { t })) === null,
    'H4b wynik wg tieru (3 — razem ciał, 1 — planety); brak skanu — brak linii');
  const row = { owner: { kind: 'unknown' }, distanceLY: 4.2, spectral: 'K', colonyCount: '0' };
  const lines = call(() => CL.galaxyExpansionLines(row, { t, explored: false, scanLine: l1 }));
  ok(Array.isArray(lines) && lines.length === 4 && lines[3] === l1 && lines[2] === t('fleet.clusterUnexplored'), 'H4c rozwinięcie: właściciel · informacja · stan · skan (4 linie)');
  ok(call(() => CL.galaxyExpansionLines(row, { t, explored: true }))?.length === 3, 'H4d bez skanu — 3 linie');
}

// ── Atrapa świata dla podwarstw (H5, H6, H9) ──
const RANK = { unknown: 0, rumor: 1, contact: 2, detailed: 3 };
function mkWorld({ explored = false, scanned = false, intel = 'unknown', selected = null, vessels = [], starPx = null } = {}) {
  const systems = [
    { id: 'sys_home', name: 'Sol', isHome: true, x: 0, y: 0, z: 0, explored: true, spectralType: 'G', distanceLY: 0 },
    { id: 'sys_x', name: 'Kappa Ceti', x: 3, y: 1, z: 0.2, explored, empireId: 'emp_1', spectralType: 'K', distanceLY: 3.2 },
  ];
  const K = {
    civMode: true, galaxyData: { systems }, activeSystemId: 'sys_home',
    galaxyMode: { isActive: true, isFlying: false, selectedSystemId: selected, diveTargetId: () => null, canEnter: (id) => id === 'sys_home',
      onPlateClick: (id) => K._log.push(['plate', id]) },
    threeRenderer: {
      getGalaxyStarsWorld: () => systems.map((s) => ({ id: s.id, x: s.x * 200, y: s.z * 200, z: s.y * 200 })),
      galaxyStarAt: () => K._starUnder ?? null, getGalaxyAnchorLy: () => ({ x: 0, y: 0, z: 0 }),
      _cameraController: { _targetDist: 6000, minDist: 1200 }, _galaxyChromeAlpha: null, _galaxyFadeT0: -1e9,
    },
    starSystemManager: { activeSystemId: 'sys_home', getSystem: (id) => (id === 'sys_home' ? {} : null) },
    entityManager: { get: () => null }, colonyManager: { getAllColonies: () => [] }, stationSystem: { getAllStations: () => [] },
    vesselManager: { getAllVessels: () => vessels },
    intelSystem: { isAtLeast: (emp, lvl) => emp === 'emp_1' && RANK[intel] >= RANK[lvl], getVesselContact: () => null },
    observatorySystem: { getSystemScanResult: (id) => (scanned && id === 'sys_x' ? { tier: 1, counts: { planets: 4 } } : null),
      getActiveSystemScans: () => [], getMaxObservatoryLevel: () => 4, getMaxSystemScanTier: () => 2, getMaxConcurrentSystemScans: () => 1,
      getSystemScanProgress: () => null },
    empireRegistry: { get: (id) => (id === 'emp_1' ? { name: 'Liga Trzech Słońc' } : null) },
    uiManager: { _outlinerState: { groundUnits: [] } },
    rightOutliner: { _onHit: (z) => K._log.push(['row', z.vesselId]) },
    _log: [], _starUnder: null, _starPx: starPx,
  };
  return K;
}
const F0 = (K, o = {}) => ({ K, now: 1000, pointer: null, att: { layers: { labels: true } }, sim: 0, mapRect: { x: 0, y: 0, w: 1280, h: 800 }, ...o });

header('H5  anty-lustro: nazwa na płycie ≡ wiersz outlinera ≡ nagłówek przypięcia (16 stanów)');
{
  const bad = [];
  let named = 0;
  for (const explored of [false, true]) for (const scanned of [false, true]) for (const intel of ['unknown', 'rumor', 'contact', 'detailed']) {
    const tag = `e${explored ? 1 : 0}s${scanned ? 1 : 0}${intel}`;
    // Płyta (bez zaznaczenia): nazwa obecna?
    const Kp = mkWorld({ explored, scanned, intel });
    globalThis.window.KOSMOS = Kp;
    const Lp = HGL?.HudGalaxyLabelLayer ? new HGL.HudGalaxyLabelLayer({ ctx: null }) : null;
    call(() => Lp.prepare(F0(Kp)));
    const plate = Lp?._prep?.items?.find?.((i) => i.id === 'sys_x')?.text ?? null;
    // Wiersz lewego outlinera (lista bez nieznanych — jak `LeftOutliner`).
    const world = GOL?.galaxyWorldContext?.(Kp, { groundUnits: [] });
    const row = GOL?.buildGalaxySystemList?.(world)?.byId?.get?.('sys_x') ?? null;
    // Przypięcie (zaznaczona): nagłówek i linia właściciela.
    const Ks = mkWorld({ explored, scanned, intel, selected: 'sys_x' });
    globalThis.window.KOSMOS = Ks;
    const Ls = HGL?.HudGalaxyLabelLayer ? new HGL.HudGalaxyLabelLayer({ ctx: null }) : null;
    call(() => Ls.prepare(F0(Ks)));
    const pinText = Ls?._prep?.items?.find?.((i) => i.id === 'sys_x')?.text ?? null;
    const pin = Ls?._g2?.p?.pin ?? null;
    const rowAll = GOL?.buildGalaxySystemList?.({ ...GOL.galaxyWorldContext(Ks, { groundUnits: [] }), includeUnknown: true })?.byId?.get?.('sys_x');
    const header = rowAll ? CL?.galaxyPinHeader?.(rowAll) : null;
    const ownerOutliner = rowAll ? CL?.galaxyOwnerText?.(rowAll.owner, { t, empireName: (id) => Ks.empireRegistry.get(id)?.name ?? null }) : null;
    const hasName = plate != null;
    if (hasName) named++;
    const okState = hasName === (row != null)
      && (hasName ? plate === GL?.galaxyLabelText?.('Kappa Ceti', 'pl') : true)
      && (hasName ? pinText === plate && header === 'KAPPA CETI' : pinText === CL?.UNNAMED_SYSTEM && header === CL?.UNNAMED_SYSTEM)
      && pin?.lines?.[0] === ownerOutliner;
    if (!okState) bad.push(`${tag}: płyta=${plate} wiersz=${row ? 'tak' : 'nie'} przypięcie=${pinText}/${header} właściciel=${pin?.lines?.[0]}|${ownerOutliner}`);
  }
  ok(bad.length === 0, `H5a 16/16 stanów zgodnych (${bad.join(' || ') || 'zgodne'})`);
  ok(named > 0 && named < 16, `H5b KONTROLA: stany z nazwą i bez nazwy oba występują (z nazwą: ${named}/16)`);
}

header('H6  reguła wskaźnika (klik ≡ najechanie)');
{
  const P = (o) => call(() => CL.galaxyPointerTarget(o));
  ok(P({ pinZone: { kind: 'btn', id: 'scan', starId: 'a' }, nameZone: { id: 'b' }, starUnder: 'c' })?.kind === 'btn', 'H6a przycisk przypięcia wygrywa ze wszystkim');
  ok(P({ pinZone: { kind: 'name', starId: 'a' } })?.kind === 'pinName' && P({ pinZone: { kind: 'name', starId: 'a' } })?.id === 'a', 'H6b nazwa przypiętej — jej gwiazda');
  ok(P({ pinZone: { kind: 'body', starId: 'a' }, starUnder: 'z' })?.kind === 'pinBody', 'H6c reszta przypięcia — pochłonięta (gwiazda pod spodem nie łapie)');
  ok(P({ nameZone: { id: 'b' }, starUnder: 'c' })?.id === 'c', 'H6d gwiazda pod kursorem wygrywa z nazwą sąsiada (Finding 110)');
  ok(P({ nameZone: { id: 'b' } })?.id === 'b' && P({})?.kind === null, 'H6e sama nazwa — jej gwiazda; nic — nic');
  // Klik prawdziwej podwarstwy.
  const K = mkWorld({ explored: true, selected: 'sys_x' });
  globalThis.window.KOSMOS = K;
  const L = HGL?.HudGalaxyLabelLayer ? new HGL.HudGalaxyLabelLayer({ ctx: null }) : null;
  call(() => L.prepare(F0(K)));
  if (L) {
    L._g2.pinZones = [{ kind: 'btn', id: 'send', starId: 'sys_x', x: 100, y: 100, w: 40, h: 12 },
      { kind: 'name', starId: 'sys_x', x: 90, y: 80, w: 120, h: 14 }, { kind: 'body', starId: 'sys_x', x: 90, y: 80, w: 120, h: 60 }];
    L._g2.zones = [{ x: 400, y: 400, w: 60, h: 14, id: 'sys_home' }];
  }
  const plates = () => K._log.filter((e) => e[0] === 'plate').map((e) => e[1]);
  const r1 = call(() => L.handleClick(110, 105, 0, 0)); const p1 = plates().length;
  const r2 = call(() => L.handleClick(95, 85, 0, 0)); const p2 = plates();
  const r3 = call(() => L.handleClick(95, 130, 0, 0)); const p3 = plates().length;
  K._starUnder = 'sys_x';
  const r4 = call(() => L.handleClick(410, 405, 0, 0)); const p4 = plates().length;
  K._starUnder = null;
  const r5 = call(() => L.handleClick(410, 405, 0, 0)); const p5 = plates();
  ok(r1 === true && p1 === 0, 'H6f klik przycisku — pochłonięty (akcja przypięcia, bez kliku gwiazdy)');
  ok(r2 === true && p2.length === 1 && p2[0] === 'sys_x', 'H6g klik nazwy przypiętej — klik jej gwiazdy');
  ok(r3 === true && p3 === 1, 'H6h klik reszty przypięcia — pochłonięty, bez kliku gwiazdy');
  ok(r4 === false && p4 === 1, 'H6i nazwa sąsiada nad gwiazdą pod kursorem — klik oddany płycie (wybór gwiazdy pod kursorem)');
  ok(r5 === true && p5.length === 2 && p5[1] === 'sys_home', 'H6j sama nazwa — klik jej gwiazdy');
}

header('H7  gęstość nazw');
{
  const E = (o) => call(() => CL.galaxyLabelEssential(o));
  ok(['home', 'own', 'selected', 'hovered', 'dive', 'scanning'].every((k) => E({ [k]: true }) === true) && E({}) === false,
    'H7a nigdy nie chowane: dom, własne, zaznaczona, najechana, cel nurkowania, skanowana; reszta — nie');
  // Gęsto: 30 nazw przy jednej gwieździe w małym kadrze — kandydaci (pod gwiazdą + 56 standardowych) się kończą.
  const rect = { x: 0, y: 0, w: 260, h: 160 };
  const it = (key, essential) => ({ key, id: key, ax: 130, ay: 80, clear: 4, gapBelow: 3, w: 80, h: 14, essential, prio: essential ? 0 : 5000 });
  const many = (ess) => Array.from({ length: 30 }, (_, i) => it('n' + i, ess));
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const res = call(() => HLL.placeLabels(many(false), { rect, candidatesOf: GL.galaxyLabelCandidates, hideOnOverlap: (x) => x.essential !== true }));
  const pl = res?.placed ?? [];
  ok(pl.length > 0 && (res?.hidden?.length ?? 0) > 0 && !pl.some((a, i) => pl.some((q, j) => i < j && overlap(a, q))),
    `H7b zwykłe nazwy bez wolnego miejsca — schowane (pokażą się przy najechaniu), postawione bez nakładania (${pl.length} / ${res?.hidden?.length})`);
  const res2 = call(() => HLL.placeLabels(many(true), { rect, candidatesOf: GL.galaxyLabelCandidates, hideOnOverlap: (x) => x.essential !== true }));
  ok(res2?.placed?.length === 30 && (res2?.hidden?.length ?? 0) === 0, 'H7c nazwy nigdy nie chowane — wszystkie 30 postawione mimo nakładania');
  const res3 = call(() => HLL.placeLabels(many(false), { rect, candidatesOf: GL.galaxyLabelCandidates }));
  ok(res3?.placed?.length === 30 && (res3?.hidden?.length ?? 0) === 0, 'H7d KONTROLA: bez reguły gęstości (warstwa układu) — nic nie chowane, jak dotąd');
}

const V = (o) => ({ id: o.id, name: o.name, systemId: o.systemId ?? 'sys_home', warpFuel: { max: o.warp === false ? 0 : 2, current: 1 },
  mission: o.mission ?? null, isWreck: !!o.isWreck, ownerEmpireId: o.enemy ? 'emp_1' : undefined, position: { state: 'orbiting' } });

header('H8  szyna — model');
{
  const systems = [{ id: 'sys_home', x: 0, y: 0, z: 0 }, { id: 'sys_x', x: 3, y: 1, z: 0.4 }];
  const vessels = [
    V({ id: 'v2', name: 'Bravo' }), V({ id: 'v1', name: 'Alfa' }), V({ id: 'v3', name: 'Alfa' }),
    V({ id: 'v4', name: 'Bez napędu', warp: false }), V({ id: 'v5', name: 'Wrak', isWreck: true }), V({ id: 'e1', name: 'Wróg', enemy: true }),
    V({ id: 'v6', name: 'Skok', warp: false, systemId: null,
      mission: { type: 'interstellar_jump', phase: 'warp_transit', fromSystemId: 'sys_home', toSystemId: 'sys_x', galProgress: 0.5, currentGalX: 1.5, currentGalY: 0.5 } }),
  ];
  const r = call(() => CL.galaxyShipRail({ vessels, systems }));
  const home = r?.bySystem?.get?.('sys_home')?.map?.((v) => v.id) ?? [];
  ok(home.join(',') === 'v1,v3,v2', `H8a własne z bakiem warp przy gwieździe swojego układu, kolejność nazwa → id (${home})`);
  ok(!home.includes('v4') && !home.includes('v5') && !home.includes('e1'), 'H8b bez napędu, wrak i wróg — poza szyną');
  const tr = r?.transit?.[0];
  ok(r?.transit?.length === 1 && tr?.v?.id === 'v6' && tr.gx === 1.5 && tr.gy === 0.5 && Math.abs(tr.gz - 0.2) < 1e-12, 'H8c w skoku — punkt na linii skoku (z interpolowane)');
}

header('H9  szyna — geometria, strefy, klik');
{
  const half = GL?.GALAXY_PICK_HALF_PX ?? 11;
  const lay = call(() => CL.railLayout({ ax: 400, ay: 300, rows: [1, 2, 3, 4, 5].map(() => ({ w: 60, h: 14 })), pickHalf: half, maxRows: 3 }));
  ok(lay?.rows?.length === 3 && lay?.plus?.count === 2, 'H9a 5 statków, 3 wiersze + „+2”');
  ok((lay?.rows ?? []).every((q) => q.x > 400 + half), 'H9b SEDNO (Finding 110): żaden wiersz nie leży na kwadracie wyboru gwiazdy');
  const r0 = lay?.rows?.[0];
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  ok(!!r0 && Math.abs(r0.y + r0.h / 2 - 300) < 1e-9 && !lay.rows.some((a, i) => lay.rows.some((b, j) => i < j && overlap(a, b))),
    'H9c pierwszy wiersz wyśrodkowany na gwieździe, wiersze kafelkowane bez nakładania');
  // Prawdziwa podwarstwa szyny — strefy i klik.
  const vessels = [1, 2, 3, 4, 5].map((i) => V({ id: `v${i}`, name: `Statek ${i}` }));
  const K = mkWorld({ vessels });
  K.uiPrefs = { hudLayers: { ships: true } };   // chip [O] włączony — nazwy wszędzie (gęstość domyślna: H13)
  globalThis.window.KOSMOS = K;
  const R = HGR?.HudGalaxyRailLayer ? new HGR.HudGalaxyRailLayer({ ctx: null }) : null;
  const proj = { point: (x, y, z) => (x === 0 && z === 0 ? { x: 400, y: 300 } : { x: 400 + x * 0.1, y: 300 + z * 0.1 }) };
  const F = F0(K, { sel: {} });
  call(() => R.prepare(F)); const c = call(() => R.collect(F, proj));
  const zones = R?._zones ?? [];
  ok(c?.rows?.length === 3 && c?.plus?.length === 1 && zones.length === 3, 'H9d strefy wyłącznie dla wierszy — „+N” bez strefy');
  ok(zones.every((z) => z.x > 400 + half), 'H9e strefy szyny poza kwadratem wyboru gwiazdy');
  const projOff = { point: () => ({ x: -500, y: -500 }) };
  call(() => R.prepare(F)); call(() => R.collect(F, projOff));
  ok((R?._zones ?? []).length === 0, 'H9f gwiazda poza kadrem — bez wierszy i bez stref (cull)');
  call(() => R.prepare(F)); call(() => R.collect(F, proj));
  const z0 = zones[0];
  const hit = call(() => R.handleClick(z0.x + 2, z0.y + 2, 0, 0));
  ok(hit === true && K._log.some((e) => e[0] === 'row' && e[1] === 'v1'), 'H9g klik wiersza = klik wiersza prawego outlinera (ten sam statek)');
  K._log.length = 0; K._starUnder = 'sys_x';
  ok(call(() => R.handleClick(z0.x + 2, z0.y + 2, 0, 0)) === false && K._log.length === 0, 'H9h gwiazda pod kursorem wygrywa z wierszem szyny');
  K._starUnder = null;
}

header('H13 gęstość szyny — tabela widoczności nazw (F5)');
{
  const list = [1, 2, 3, 4].map((i) => V({ id: `v${i}`, name: `Statek ${i}` }));
  const half = GL?.GALAXY_PICK_HALF_PX ?? 11;
  const proj = { point: (x, y, z) => (x === 0 && z === 0 ? { x: 400, y: 300 } : { x: 400 + x * 0.1, y: 300 + z * 0.1 }) };
  // id wierszy + tekst „+N” przy gwieździe domu; 4 statki, limit wierszy = 3.
  const state = ({ ships = false, hover = false, selStar = false, selShips = [], onRow = false, vessels = list } = {}) => {
    const K = mkWorld({ vessels, selected: selStar ? 'sys_home' : null });
    K.uiPrefs = { hudLayers: ships ? { ships: true } : {} };
    globalThis.window.KOSMOS = K;
    const hud = { ctx: null, hoverObjectKey: () => (hover ? 'galaxy:sys_home' : null) };
    const R = new HGR.HudGalaxyRailLayer(hud);
    if (onRow) R._zones = [{ x: 500, y: 500, w: 50, h: 14, vesselId: 'v1', systemId: 'sys_home' }];
    const F = F0(K, { sel: { vesselIds: selShips, leadId: selShips[0] ?? null }, pointer: onRow ? { lx: 510, ly: 505, overUI: false } : null });
    R.prepare(F);
    const c = R.collect(F, proj);
    return { rows: (c?.rows ?? []).map((r) => r.vesselId).join(','), plus: (c?.plus ?? []).map((p) => p.text).join(','), zones: R._zones.length,
      parked: (c?.parked ?? []).map((p) => p.count).join(','), R, K };
  };
  const one = list.slice(0, 1), two = list.slice(0, 2);
  const table = [
    ['domyślnie — bez nazw, sam „+N”', {}, '', '+4'],
    // ⚠ G4-B — ODWRÓCONE ŚWIADOMIE (decyzja właściciela): szyna rozwinięta pokazuje „+reszta” od jednego statku; dawne oczekiwanie (bez „+1”) chowało czwarty statek.
    ['chip [O] — nazwy; jeden statek ponad limit wierszy — „+1”', { ships: true }, 'v1,v2,v3', '+1'],
    ['gwiazda najechana', { hover: true }, 'v1,v2,v3', '+1'],
    ['gwiazda zaznaczona', { selStar: true }, 'v1,v2,v3', '+1'],
    ['kursor na wierszu gwiazdy', { onRow: true }, 'v1,v2,v3', '+1'],
    ['zaznaczony statek — tylko jego nazwa', { selShips: ['v3'] }, 'v3', '+3'],
    ['dwa zaznaczone', { selShips: ['v2', 'v3'] }, 'v2,v3', '+2'],
    ['samotny statek — sam znacznik, bez „+N”', { vessels: one }, '', ''],
    ['samotny statek zaznaczony — nazwa, bez „+N”', { vessels: one, selShips: ['v1'] }, 'v1', ''],
    ['dwa statki — „+2”', { vessels: two }, '', '+2'],
    ['dwa statki, jeden zaznaczony — nazwa, bez „+1”', { vessels: two, selShips: ['v1'] }, 'v1', ''],
  ];
  const bad = [];
  for (const [label, o, rows, plus] of table) {
    const s = call(() => state(o));
    if (s?.rows !== rows || s?.plus !== plus) bad.push(`${label}: ${s?.rows}/${s?.plus} (oczek. ${rows}/${plus})`);
  }
  ok(bad.length === 0, `H13a SEDNO: ${table.length} stanów (${bad.join(' | ') || 'zgodne'})`);
  const d = call(() => state({}));
  ok(d?.zones === 0, 'H13b domyślnie bez stref kliku — gwiazda zachowuje klik, „+N” bez strefy');
  const lay = call(() => CL.railLayout({ ax: 400, ay: 300, rows: [], hidden: 4, rowH: 14, pickHalf: half, plusW: 20 }));
  ok(lay?.rows?.length === 0 && lay?.plus?.count === 4 && lay?.plus?.h === 14 && Math.abs(lay.plus.y + 7 - 300) < 1e-9 && lay.plus.x > 400 + half,
    'H13c „+N” bez wierszy: na miejscu pierwszego wiersza, poza kwadratem wyboru gwiazdy');
  ok(call(() => CL.railVisibleShips(list, { open: false }))?.length === 0 && call(() => CL.railVisibleShips(null, { open: true }))?.length === 0,
    'H13d model: bez zaznaczenia — nikt; brak listy — pusto');
  const lone = call(() => state({ vessels: one }));
  ok(lone?.parked === '1' && lone?.plus === '' && lone?.zones === 0 && lone?.R?._obstacles?.length === 1,
    'H13e SEDNO: samotny statek — znacznik zostaje, „+N” nie ma ani paska, ani przeszkody dla nazw płyty');
  const lay1 = call(() => CL.railLayout({ ax: 400, ay: 300, rows: [], hidden: 1, rowH: 14, pickHalf: half, plusW: 20, plusMin: 2 }));
  const lay2 = call(() => CL.railLayout({ ax: 400, ay: 300, rows: [], hidden: 2, rowH: 14, pickHalf: half, plusW: 20, plusMin: 2 }));
  const layDef = call(() => CL.railLayout({ ax: 400, ay: 300, rows: [], hidden: 1, rowH: 14, pickHalf: half, plusW: 20 }));
  ok(lay1?.plus === null && lay2?.plus?.count === 2 && layDef?.plus?.count === 1,
    'H13f próg „+N” w geometrii: N = 1 przy progu 2 — nic, N = 2 — jest; KONTROLA: bez parametru progu (domyślnie 1) — „+1”');

  header('H14 CTRL+klik wiersza szyny (F4)');
  const K = mkWorld({ vessels: list, selected: 'sys_home' });
  K.uiPrefs = {};
  globalThis.window.KOSMOS = K;
  const R = new HGR.HudGalaxyRailLayer({ ctx: null, hoverObjectKey: () => null });
  const F = F0(K, { sel: {} });
  R.prepare(F); R.collect(F, proj);
  const z = R._zones[0];
  K._starUnder = 'sys_x';   // gwiazda SĄSIADA pod wierszem — dawny powód odmowy
  ok(call(() => R.handleClick(z.x + 2, z.y + 2, 0, 0)) === false && K._log.length === 0, 'H14a KONTROLA (Finding 110): zwykły klik — gwiazda pod kursorem wygrywa');
  K.rightOutliner._lastMouseMods = { shift: false, ctrl: true };
  ok(call(() => R.handleClick(z.x + 2, z.y + 2, 0, 0)) === true && K._log.some((e) => e[0] === 'row' && e[1] === z.vesselId),
    'H14b SEDNO: CTRL+klik — wiersz wygrywa z gwiazdą sąsiada; idzie przez ten sam `_onHit` co wiersz outlinera');
  K._starUnder = null;
  ok(z.systemId === 'sys_home', 'H14d strefa niesie układ wiersza (kursor na wierszu trzyma nazwy po zejściu z gwiazdy)');
}

header('H10 zasięg obserwatorium i blipy');
{
  const L = OR?.STRATCOM_LY_BY_LEVEL;
  ok(Array.isArray(L) && L.join(',') === '0,0,0,0,5,10,15', 'H10a tabela poziom → ly bez zmian (Lv0–3 = 0, Lv4 = 5, Lv5 = 10, Lv6 = 15)');
  ok(OR?.observatoryRangeLY?.(3) === 0 && OR?.observatoryRangeLY?.(4) === 5 && OR?.observatoryRangeLY?.(9) === 15 && OR?.observatoryRangeLY?.(-1) === 0,
    'H10b Lv3 — zasięg 0 (bramka zamknięta, jak W13a); powyżej tabeli — ostatni wpis');
  ok(OR?.inObservatoryRange?.({ x: 3, y: 4, z: 99 }, { x: 0, y: 0 }, 5) === true && OR?.inObservatoryRange?.({ x: 3, y: 4.1 }, { x: 0, y: 0 }, 5) === false,
    'H10c środek = dom, metryka PŁASKA (oś z pominięta — D-GX-22)');
  ok(OR?.inObservatoryRange?.({ x: 0, y: 0 }, { x: 0, y: 0 }, 0) === false, 'H10d zasięg 0 — nic (także sam dom)');
  // G5-B: zakładka Stratcom usunięta — FMO nie liczy już zasięgu; tabela ma jeden dom, płyta czyta ją przez `observatoryRangeLY`.
  const src = (p) => stripComments(fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
  const fmo = src('../../ui/FleetManagerOverlay.js'), ping = src('../../ui/HudGalaxyPingLayer.js');
  const tableHomes = prodFilesMatching('STRATCOM_LY_BY_LEVEL', /\bSTRATCOM_LY_BY_LEVEL\s*=(?!=)/);
  ok(!/_getStratcomRangeLY|STRATCOM_LY_BY_LEVEL/.test(fmo) && tableHomes.join(',') === 'utils/ObservatoryRange.js'
    && /import\s*\{[^}]*\bobservatoryRangeLY\b[^}]*\}\s*from\s*'\.\.\/utils\/ObservatoryRange\.js'/.test(ping) && /\bobservatoryRangeLY\(/.test(ping),
    `H10e FMO bez _getStratcomRangeLY i bez własnej tabeli; tabela wyłącznie w ObservatoryRange (${tableHomes.join(', ') || '—'}), ping czyta observatoryRangeLY`);
  const enemy = (id, gx, gy) => ({ id, ownerEmpireId: 'emp_1', mission: { phase: 'warp_transit', currentGalX: gx, currentGalY: gy, fromSystemId: 'a', toSystemId: 'b', galProgress: 0.5 } });
  const vs = [enemy('c1', 1, 1), enemy('r1', 2, 1), enemy('far', 9, 9)];
  const q = { c1: 'contact', r1: 'rumor' };
  const bl = call(() => CL.galaxyEnemyBlips({ vessels: vs, systems: [{ id: 'a', z: 0 }, { id: 'b', z: 1 }], home: { x: 0, y: 0 }, rangeLY: 5, qualityOf: (id) => q[id] ?? 'unknown' }));
  ok(bl?.map?.((b) => `${b.v.id}:${b.mode}`).join(',') === 'c1:contact,r1:rumor', 'H10f blipy obcych w skoku: kontakt — pełny, plotka — duch, poza zasięgiem — nic');
  ok(call(() => CL.galaxyEnemyBlips({ vessels: vs, systems: [], home: { x: 0, y: 0 }, rangeLY: 0 }))?.length === 0, 'H10g zasięg 0 (Lv < 4) — żadnych obcych blipów');
}

header('H11 chipy warstw w trybie galaktyki');
{
  ok(HC?.chipLayersFor?.(true)?.join(',') === 'radar,routes,labels,ships' && HC?.chipLayersFor?.(false)?.join(',') === 'radar,routes,labels,orbits',
    'H11a tryb galaktyki: [R] ping, [T] szlaki + trasy, [E] nazwy, miejsce [O] — „Okręty” (zawsze); tryb układu — wszystkie 4');
  // G5-B: dawny drugi parametr (chip „Okrętów”; `false` — ścieżka OFF) bez czytelnika.
  ok(HC?.chipLayersFor?.(true, false)?.join(',') === 'radar,routes,labels,ships' && HC?.chipLayersFor?.(false, false)?.join(',') === 'radar,routes,labels,orbits',
    'H11b dawny parametr chipu „Okrętów” bez czytelnika — `false` niczego nie zabiera; tryb układu bez zmian');
  const row = ['radar', 'routes', 'labels', 'orbits'].map((layer, i) => ({ layer, x: i * 30, y: 0, w: 28, h: 16 }));
  const gal = HC?.chipsForMode?.(row, true) ?? [];
  ok(gal.map((c) => c.layer).join(',') === 'radar,routes,labels,ships' && gal[3]?.x === row[3].x, 'H11c chip „Okręty” stoi na miejscu [O] (rząd nie skacze)');
  ok((HC?.chipsForMode?.(row, false) ?? []).map((c) => c.layer).join(',') === 'radar,routes,labels,orbits'
    && (HC?.chipsForMode?.(row, true, false) ?? []).map((c) => c.layer).join(',') === 'radar,routes,labels,ships',
    'H11d KONTROLA: tryb układu — orbity; dawny trzeci parametr bez czytelnika — w trybie galaktyki „Okręty” zostają');
}

header('H12 pierścień pingu w kawałkach (koszt rasteryzacji)');
{
  // Łuk 40 odcinków po 5 px (offset startowy 2,5) → kawałki po ≤ 16 odcinków, ciągła faza kropek.
  const pts = []; for (let i = 0; i <= 40; i++) pts.push(i * 5, 0);
  const parts = call(() => HGP.splitBoundary([{ pts, offset: 2.5 }], 16)) ?? [];
  const segs = parts.map((c) => c.pts.length / 2 - 1);
  ok(parts.length === 3 && segs.join(',') === '16,16,8', `H12a 40 odcinków → kawałki 16 / 16 / 8 (${segs.join(', ')})`);
  ok(parts.map((c) => c.offset).join(',') === '2.5,82.5,162.5', 'H12b faza kropek ciągła: offset = długość biegu do początku kawałka');
  ok(parts[0]?.pts?.[parts[0].pts.length - 2] === parts[1]?.pts?.[0], 'H12c kawałki stykają się (koniec = początek następnego)');
  ok((call(() => HGP.splitBoundary([{ pts: [0, 0, 5, 0], offset: 1 }])) ?? [])[0]?.offset === 1 && call(() => HGP.splitBoundary([]))?.length === 0,
    'H12d krótki bieg — jeden kawałek bez zmian; brak granicy — nic');
}

{ // T4: linia ciał układu (zbadany / skan) — bez zmyślania danych
  const B = (a) => call(() => CL.galaxyBodiesLine(a, { t }));
  setLocale('pl');
  ok(B({ placeKnown: true, sysData: { planetIds: [1,2,3], moonIds: [1], planetoidIds: [] } }) === 'planety 3 · księżyce 1 · planetoidy 0', 'T4a układ zbadany → liczby ze StarSystemManager (PL)');
  setLocale('en');
  ok(B({ placeKnown: true, sysData: { planetIds: [1], moonIds: [], planetoidIds: [1,2] } }) === 'planets 1 · moons 0 · planetoids 2', 'T4b EN');
  setLocale('pl');
  ok(B({ scanResult: { tier: 1, counts: { planets: 4, moons: 9, planetoids: 7 } } }) === 'planety 4', 'T4c skan tier1 → tylko planety (nie ujawnia więcej)');
  ok(B({ scanResult: { tier: 3, counts: { planets: 4, moons: 9, planetoids: 7 } } }) === 'planety 4 · księżyce 9 · planetoidy 7', 'T4d skan tier3 → komplet');
  ok(B({ scanResult: { tier: 2 } }) === 'skan: brak danych o ciałach', 'T4e skan bez liczb → komunikat braku danych');
  ok(B({ placeKnown: false, sysData: { planetIds: [1] } }) === null && B({}) === null, 'T4f brak źródła / miejsce nieznane → null (bez zmyślania)');
}

setLocale?.(loc0);
header('H15 flota zaparkowana przy gwieździe — „⛬ ×N” przy rombie (Finding 605, G5-C)');
{
  let STL = null;
  try { STL = await import('../../ui/ShipTreeLogic.js'); } catch (e) { console.log('  (ShipTreeLogic:', e.message + ')'); }
  const proj = { point: (x, y, z) => (x === 0 && z === 0 ? { x: 400, y: 300 } : { x: 400 + x * 0.1, y: 300 + z * 0.1 }) };
  const ships = (ids) => ids.map((id) => V({ id, name: `Statek ${id}` }));
  // Gwiazda domu, gęstość domyślna (bez nazw), bez zaznaczonych statków — liczy się wyłącznie romb, jego napis i „+N”.
  const state = ({ ids, fleets = [], selFleet = null, open = false }) => {
    const K = mkWorld({ vessels: ships(ids) });
    K.uiPrefs = { hudLayers: open ? { ships: true } : {} };
    K.fleetSystem = { listFleets: () => fleets };
    globalThis.window.KOSMOS = K;
    const R = new HGR.HudGalaxyRailLayer({ ctx: null, hoverObjectKey: () => null });
    const F = F0(K, { sel: selFleet != null ? { fleetId: selFleet } : {} });
    const key = call(() => R.prepare(F));
    const c = call(() => R.collect(F, proj));
    const d = call(() => R.debug()) ?? { markers: [], plus: [], rows: [] };
    const texts = [];
    const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'fillText' ? (s) => texts.push(String(s)) : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
    const roles = new Proxy({}, { get: () => '#ffffff' });
    call(() => R.draw(ctx, { ...F, roles }, c));
    return { m: d.markers[0] ?? {}, plus: d.plus.map((p) => p.text), rows: d.rows.length, key, texts, R };
  };
  const g = STL?.FLEET_NODE_GLYPH ?? '⛬';
  const f1 = { id: 'f1', memberIds: ['v1', 'v2', 'v3'] }, f2 = { id: 'f2', memberIds: ['v4', 'v5'] };
  const table = [
    ['sama flota (3)', { ids: ['v1', 'v2', 'v3'], fleets: [f1] }, `${g} ×3`, ''],
    ['statki luźne (3) — reguła „+N” bez zmian', { ids: ['v1', 'v2', 'v3'] }, null, '+3'],
    ['flota (3) + luźne (2)', { ids: ['v1', 'v2', 'v3', 'v7', 'v8'], fleets: [f1] }, `${g} ×3`, '+2'],
    ['flota (3) + luźny (1) — „+N” od dwóch, jak dotąd', { ids: ['v1', 'v2', 'v3', 'v7'], fleets: [f1] }, `${g} ×3`, ''],
    ['jeden członek floty przy gwieździe — statek luźny', { ids: ['v1', 'v7'], fleets: [f1] }, null, '+2'],
    ['dwie floty', { ids: ['v1', 'v2', 'v3', 'v4', 'v5'], fleets: [f1, f2] }, `${g} ×3 ${g} ×2`, ''],
  ];
  for (const [label, o, tag, plus] of table) {
    const s = state(o);
    ok((s.m.tag ?? null) === tag && s.plus.join() === plus && s.m.n === o.ids.length,
      `H15a ${label}: napis ${JSON.stringify(s.m.tag ?? null)}, „+N” ${JSON.stringify(s.plus.join())}, romb liczy ${s.m.n}`);
  }
  const fleetOnly = state({ ids: ['v1', 'v2', 'v3'], fleets: [f1] });
  ok(fleetOnly.texts.includes(`${g} ×3`), `H15b napis floty naprawdę się rysuje (fillText: ${JSON.stringify(fleetOnly.texts)})`);
  const tg = fleetOnly.R?._last?.parked?.[0]?.tags?.[0];
  ok(!!tg && (fleetOnly.R?._obstacles ?? []).some((r) => r.x === tg.x && r.w === tg.w), 'H15c napis floty jest przeszkodą dla nazw płyty');
  const selA = state({ ids: ['v1', 'v2', 'v3', 'v4', 'v5'], fleets: [f1, f2], selFleet: 'f2' });
  const selN = state({ ids: ['v1', 'v2', 'v3', 'v4', 'v5'], fleets: [f1, f2] });
  ok(selA.m.sel === true && JSON.stringify(selA.m.tagSel) === JSON.stringify([`${g} ×2`]) && selN.m.sel === false && (selN.m.tagSel ?? []).length === 0,
    `H15d zaznaczona flota wyróżnia romb i WYŁĄCZNIE swój napis (${JSON.stringify(selA.m.tagSel)}; bez zaznaczenia ${JSON.stringify(selN.m.tagSel)})`);
  ok(typeof selA.key === 'string' && selA.key !== selN.key, 'H15e zaznaczenie floty zmienia klucz podwarstwy (bez tego napis nie przerysowałby się)');
  const moved = state({ ids: ['v1', 'v2', 'v3'], fleets: [{ id: 'f1', memberIds: ['v1', 'v2'] }] });
  ok(moved.key !== fleetOnly.key, 'H15f zmiana składu floty zmienia klucz podwarstwy');
  const open = state({ ids: ['v1', 'v2', 'v3', 'v7'], fleets: [f1], open: true });
  ok(open.rows === 3 && open.plus.join() === '+1' && open.m.tag === `${g} ×3`,
    `H15g chip [O]: wiersze z nazwami jak dotąd (limit 3 + „+1”), napis floty zostaje (${open.rows}, ${open.plus.join()}, ${open.m.tag})`);
  const outl = stripComments(fs.readFileSync(new URL('../../ui/Outliner.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
  ok(STL?.FLEET_NODE_GLYPH === '⛬' && /fillText\(FLEET_NODE_GLYPH/.test(outl) && !/fillText\('⛬'/.test(outl),
    'H15h jedno źródło glifu: prawy outliner i płyta czytają `FLEET_NODE_GLYPH`');
}

header('H16 szyna ustępuje rozwinięciu gwiazdy (Finding 608, G5-C)');
{
  const half = GL?.GALAXY_PICK_HALF_PX ?? 11;
  const over = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const partsOf = (lay) => [...(lay?.rows ?? []), ...(lay?.plus ? [lay.plus] : [])];
  const pick = { x: 400 - half, y: 300 - half, w: 2 * half, h: 2 * half };
  const base = { ax: 400, ay: 300, pickHalf: half, maxRows: 3, rowH: 14, plusW: 20, plusMin: 2 };
  const three = [60, 50, 70].map((w) => ({ w, h: 14 }));
  // Tabela ułożenia: [opis, pola, oczekiwana strona].
  const table = [
    ['bez rozwinięcia — po prawej, jak dotąd', { rows: three, blockers: [] }, 'right'],
    ['rozwinięcie po prawej stronie gwiazdy — po lewej', { rows: three, blockers: [{ x: 420, y: 290, w: 120, h: 60 }] }, 'left'],
    ['rozwinięcie wyśrodkowane pod gwiazdą (obie strony) — pod nim', { rows: three, blockers: [{ x: 330, y: 305, w: 140, h: 50 }] }, 'below'],
    ['rozwinięcie nad gwiazdą — po prawej, bez zmian', { rows: three, blockers: [{ x: 340, y: 220, w: 140, h: 60 }] }, 'right'],
    ['rozwinięcie po lewej — po prawej, bez zmian', { rows: three, blockers: [{ x: 260, y: 290, w: 120, h: 60 }] }, 'right'],
    ['przypięcie (wyższe, z wierszem akcji) po prawej — po lewej', { rows: three, blockers: [{ x: 418, y: 286, w: 200, h: 110 }] }, 'left'],
    ['sam „+N” (zwinięta) pod rozwinięciem po prawej — po lewej', { rows: [], hidden: 3, blockers: [{ x: 415, y: 292, w: 100, h: 40 }] }, 'left'],
    ['sąsiad przykryty cudzym rozwinięciem — schowany (rozwinięcie wygrywa)', { rows: three, hide: true, blockers: [{ x: 420, y: 290, w: 120, h: 60 }] }, 'hidden'],
    ['sąsiad poza cudzym rozwinięciem — po prawej, jak dotąd', { rows: three, hide: true, blockers: [{ x: 340, y: 220, w: 140, h: 60 }] }, 'right'],
  ];
  const plain = call(() => CL.railLayout({ ...base, rows: three }));
  for (const [label, o, side] of table) {
    const lay = call(() => CL.railPlacement?.({ ...base, ...o }));
    const parts = partsOf(lay);
    ok(lay?.side === side && (side === 'hidden' ? parts.length === 0 : parts.length > 0) && !parts.some((r) => o.blockers.some((b) => over(r, b))) && !parts.some((r) => over(r, pick)),
      `H16a ${label}: strona ${lay?.side}, żaden wiersz pod rozwinięciem ani na kwadracie wyboru (Finding 110)`);
  }
  const same = call(() => CL.railPlacement?.({ ...base, rows: three, blockers: [] }));
  ok(JSON.stringify(same?.rows) === JSON.stringify(plain?.rows) && JSON.stringify(same?.plus) === JSON.stringify(plain?.plus),
    'H16b bez rozwinięcia ułożenie co do bajtu jak `railLayout`');
  const below = call(() => CL.railPlacement?.({ ...base, rows: three, blockers: [{ x: 330, y: 305, w: 140, h: 50 }] }));
  ok(below?.rows?.[0]?.x === 330 && below.rows[0].y >= 355 && below.rows.every((r, i, a) => i === 0 || r.y > a[i - 1].y),
    'H16c pod rozwinięciem: od jego lewej krawędzi, w dół, kolejność wierszy zachowana');
  // Rozwinięcie gwiazdy przypiętej przykrywa „+N” gwiazdy SĄSIEDNIEJ (decyzja właściciela po bramce G5-C, 2026-11-07): rozwinięcie wygrywa —
  // szyna gwiazdy rozwinięcia ustępuje (tu: pod nie), szyna sąsiada chowa się razem ze strefami. Sąsiad poza rozwinięciem — po prawej, jak dotąd.
  {
    const E = { x: 595, y: 411, w: 200, h: 86, id: 'sys_k' };
    const st = (sid, ax, ay, n, hidden) => ({ sid, ax, ay, dims: Array.from({ length: n }, () => ({ w: 60, h: 14 })), visible: Array.from({ length: n }, (_, i) => ({ id: `${sid}_${i}` })),
      texts: Array.from({ length: n }, (_, i) => `s${i}`), font: '9px x', size: 9, rowH: 14, plusText: `+${hidden}`, hiddenLoose: hidden, plusW: 20 });
    const R = new HGR.HudGalaxyRailLayer({ ctx: null });
    R._prep = { on: true, selIds: new Set(), rowSid: null };
    const lay = (rails) => { R._rails = rails; R._expansions = [E]; const raw = call(() => R._layRails(null));
      return raw && typeof raw === 'object' ? raw : { rows: [], plus: [], zones: [] }; };   // `call` oddaje napis przy wyjątku — wiersz ma zgasnąć, nie przerwać przebieg
    const out = lay([st('sys_home', 640, 416, 0, 4), st('sys_k', 695, 402, 2, 0)]);
    ok(out.rows.length === 2 && out.rows.every((r) => r.side === 'below' && !over(r, E)) && out.plus.length === 0
      && out.zones.length === 2 && out.zones.every((z) => z.systemId === 'sys_k'),
      `H16n SEDNO: rozwinięcie wygrywa — wiersze jego gwiazdy pod nim, „+N” sąsiada schowany razem ze strefą (${out.rows.map((r) => r.side).join(',')} · +N ${out.plus.length})`);
    const far = lay([st('sys_far', 300, 200, 0, 4), st('sys_k', 695, 402, 2, 0)]);
    ok(far.plus.length === 1 && far.plus[0].side === 'right' && far.plus[0].x > 300,
      `H16o sąsiad poza rozwinięciem: „+N” po prawej stronie swojej gwiazdy, jak dotąd (${far.plus[0]?.side})`);
  }

  // Prawdziwa para podwarstw: szyna + nazwy płyty. Najpierw dwie klatki bez uwagi (nazwa stoi wyśrodkowana pod gwiazdą, szyna zwinięta),
  // potem najechanie albo zaznaczenie: rozwinięcie rośnie w miejscu (trzyma kandydata), a szyna otwiera wiersze. Sprawdzane w KAŻDEJ klatce.
  const pair = ({ pin = false } = {}) => {
    const K = mkWorld({ vessels: [1, 2, 3].map((i) => V({ id: `v${i}`, name: `Statek ${i}` })) });
    K.uiPrefs = { hudLayers: {} };
    globalThis.window.KOSMOS = K;
    let wakes = 0;
    const hud = { ctx: null, _galaxySublayers: [], hoverObjectKey: () => L.hoverObjectKey?.() ?? null, wake: () => { wakes++; } };
    const R = new HGR.HudGalaxyRailLayer(hud), L = new HGL.HudGalaxyLabelLayer(hud);
    hud._galaxySublayers.push(R, L);
    const proj = { point: (x, y, z) => (x === 0 && z === 0 ? { x: 400, y: 300 } : { x: 400 + x * 0.1, y: 300 + z * 0.1 }) };
    const F = F0(K, { sel: {}, pointer: null });
    const overlaps = [], wk = [];
    let exp = null;
    for (let i = 0; i < 6; i++) {
      const on = i >= 2;
      K._starUnder = on && !pin ? 'sys_home' : null;
      K.galaxyMode.selectedSystemId = on && pin ? 'sys_home' : null;
      F.pointer = on && !pin ? { lx: 400, ly: 300, rawX: 400, rawY: 300, overUI: false } : null;
      F.now = 1000 + i * 400;
      const w0 = wakes;
      call(() => R.prepare(F)); call(() => L.prepare(F)); call(() => R.collect(F, proj)); call(() => L.collect(F, proj));
      wk.push(wakes - w0);
      exp = (L._g2?.last?.labels ?? []).find((l) => l.id === 'sys_home' && l.expFrom !== Infinity) ?? null;
      if (exp && (R._last?.rows ?? []).length > 0) overlaps.push((R._last.rows).some((r) => over(r, exp)));
    }
    return { K, R, F, exp, rows: R._last?.rows ?? [], overlaps, wk };
  };
  for (const [label, o] of [['najechanie', {}], ['przypięcie (gwiazda zaznaczona)', { pin: true }]]) {
    const s = pair(o);
    ok(!!s.exp && s.rows.length === 3 && s.overlaps.length >= 3, `H16d ${label}: KONTROLA — rozwinięcie jest, wiersze szyny otwarte w ${s.overlaps.length} klatkach`);
    ok(s.overlaps.length >= 3 && s.overlaps.every((x) => !x) && s.rows.every((r) => r.side === 'below'),
      `H16e ${label}: SEDNO — w żadnej klatce wiersz nie leży pod rozwinięciem; rozwinięcie wyśrodkowane — wiersze pod nim (${s.rows[0]?.side}, ${JSON.stringify(s.overlaps)})`);
    ok(s.wk.slice(-2).every((w) => w === 0), `H16f ${label}: potem spoczynek — bez budzenia klatek (${s.wk.join(',')})`);
  }
  // Kursor na wierszu: rozwinięcie gaśnie (zejście z gwiazdy), a wiersz nie ucieka spod kursora. KONTROLA: kursor obok — szyna wraca na prawo.
  {
    const s = pair({});
    const r0 = s.rows[0];
    const onRow = { lx: r0.x + 2, ly: r0.y + 2, rawX: r0.x + 2, rawY: r0.y + 2, overUI: false };
    call(() => s.R.prepare({ ...s.F, pointer: onRow }));
    call(() => s.R.yieldToExpansions?.([]));
    const n0 = s.R._last?.rows?.[0];
    ok(r0?.side === 'below' && !!n0 && n0.x === r0.x && n0.y === r0.y, `H16g kursor na wierszu: rozwinięcie zgasło, wiersz stoi (${r0?.side} ${r0?.x},${r0?.y} → ${n0?.x},${n0?.y})`);
    const s2 = pair({});
    call(() => s2.R.prepare({ ...s2.F, pointer: null }));
    call(() => s2.R.yieldToExpansions?.([]));
    const back = s2.R._last?.rows?.[0];
    ok(!!back && back.x > 400 + half, `H16g′ KONTROLA: kursor poza wierszem — szyna stoi po prawej stronie gwiazdy (x ${back?.x})`);
  }

  // Otwarty picker skoku leży nad kartą walki (obserwacja z bramki 607): karta wycina go z rysunku i przepuszcza w nim kliki.
  let SP = null, HL = null, CH = null;
  try { SP = await import('../../ui/HudGalaxySendPickerLayer.js'); } catch (e) { console.log('  (picker:', e.message + ')'); }
  try { HL = await import('../../ui/HudLayer.js'); } catch (e) { console.log('  (HudLayer:', e.message + ')'); }
  const box = { x: 500, y: 600, w: 220, h: 120 };
  const picker = SP?.HudGalaxySendPickerLayer ? new SP.HudGalaxySendPickerLayer({ ctx: null }) : null;
  if (picker) picker._last = { box: { ...box }, zones: [] };
  globalThis.window.KOSMOS = { galaxyMode: { isActive: true, isFlying: false, sendPicker: { systemId: 'sys_x' } } };
  const openA = call(() => picker?.openBox?.());
  globalThis.window.KOSMOS.galaxyMode.sendPicker = null;
  const openB = call(() => picker?.openBox?.());
  ok(JSON.stringify(openA) === JSON.stringify(box) && openB === null, 'H16h picker zgłasza swój prostokąt tylko otwarty');
  globalThis.window.KOSMOS.galaxyMode.sendPicker = { systemId: 'sys_x' };
  const rects = call(() => HL?.HudLayer?.prototype?.uiPassThroughRects?.call({ _gate: { shown: true }, _shown: true, _activeSublayers: () => [picker, { openBox: () => null }] }));
  ok(JSON.stringify(rects) === JSON.stringify([box]), 'H16i HudLayer: prostokąty nad panelami UI = otwarty picker');
  // CV-Z — przecelowane świadomie: karta walki `CombatHUD` usunięta (flaga `cvStrip` zdjęta); wycięcie pickera niesie pasek walki
  //   (`CombatStrip` — rysunek z wycięciem i klik / kursor przepuszczone, wykonanie w `cv_strip_smoke` P7k). Tu: źródło paska.
  const cs = stripComments(fs.readFileSync(new URL('../../ui/CombatStrip.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
  ok(/this\._holes = K\?\.hudLayer\?\.uiPassThroughRects\?\.\(\) \?\? \[\];/.test(cs) && /ctx\.clip\('evenodd'\)/.test(cs)
    && !fs.existsSync(new URL('../../ui/CombatHUD.js', import.meta.url)),
    'H16j–H16m (CV-Z) wycięcie pickera niesie pasek walki (czyta `uiPassThroughRects`, rysuje z `evenodd`); karty `CombatHUD` nie ma');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
