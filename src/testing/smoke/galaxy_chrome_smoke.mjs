// Keeper ARC GALAXY, krok G2-2 — CHROM trybu galaktyki (docs/design/GALAXY_PLAN.md §4 G2; D-GX-16, D-GX-17 (c), D-GX-22).
// Protokół lekki F8: keeper wyłącznie dla LOGIKI (model przypięcia, tabela stanów skanu, anty-lustro treści, reguła wskaźnika,
// gęstość nazw, szyna statków, zasięg i blipy) — bez pinów na stałych rysunku i bez kontroli na poprzednim commicie.
//   H0  API (`GalaxyChromeLogic`, `ObservatoryRange`, `chipLayersFor`)
//   H9  uwaga: od poprawek po G3 (F5) szyna domyślnie nie ma nazw — geometria wierszy pinowana przy chipie [O] włączonym
//   H13 po G3 (F5): tabela widoczności nazw szyny (domyślnie / chip [O] / najechana / zaznaczona / kursor na wierszu / zaznaczony statek / OFF)
//   H14 po G3 (F4): CTRL+klik wiersza szyny wygrywa z gwiazdą SĄSIADA pod kursorem; zwykły klik — gwiazda (Finding 110); OFF jak przed krokiem
//   H1  przyciski przypięcia: [ Wejdź ] tylko dla układu do wejścia, [ Wyślij ▼ ] obecny i WYŁĄCZNY do G3, chip skanu;
//       [ Beacon ] / [ Gate ] pominięte (D-GX-17 (c))
//   H2  tabela stanów chipu skanu (dom, w toku, zbadany, brak obserwatorium, poza zasięgiem / bramka wyłączona, wynik pełny,
//       wynik niższy, limit, zwykły)
//   H3  akcje przypięcia: wyłączony przycisk mówi powód (bez wywołań), [ Wejdź ] → wlot, [ Skanuj ] → ten sam backend
//       i te same trzy komunikaty odmowy co Stratcom, [ Anuluj skan ] → anulowanie ręczne
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
//       ze Stratcomem; blipy obcych: kontakt pełny / plotka duch / poza zasięgiem — nic
//   H11 chipy warstw w trybie galaktyki: [R] [T] [E], [O] bez chipu
//   H12 pierścień pingu w kawałkach z ciągłą fazą kropek (koszt rasteryzacji ścieżki o obwiedni całego ekranu)
// Uruchom: node src/testing/smoke/galaxy_chrome_smoke.mjs
import '../headless/env.js';           // MUSI być pierwszy
import fs from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { t, setLocale, getLocale } from '../../i18n/i18n.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
const header = (s) => console.log(`\n── ${s}`);
const call = (fn, ...a) => { try { return fn ? fn(...a) : undefined; } catch (e) { return `WYJĄTEK: ${e.message}`; } };
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

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
const flagV = GAME_CONFIG.FEATURES.galaxyView, flagL = GAME_CONFIG.FEATURES.galaxyLook;
GAME_CONFIG.FEATURES.galaxyView = true; GAME_CONFIG.FEATURES.galaxyLook = true;

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
  ok(send?.enabled === false && send?.reason === 'G3' && send?.label === t('galaxyPin.send'), 'H1b [ Wyślij ▼ ] obecny, wyłączony do G3 (podpowiedź „G3”)');
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
  const r0 = run({ id: 'send', enabled: false, reason: 'G3' });
  ok(r0 === 'disabled' && toasts[0] === 'G3' && log.length === 0, 'H3a wyłączony przycisk — sam powód, bez wywołań');
  ok(run({ id: 'enter', enabled: true }) === 'enter' && log.some((e) => e[0] === 'enter' && e[1] === 'sys_x'), 'H3b [ Wejdź ] → `galaxyMode.enterSystem` (wlot)');
  log.length = 0; toasts.length = 0;
  ok(run({ id: 'scan', enabled: true }) === 'scan' && log[0]?.[0] === 'start', 'H3c [ Skanuj ] → `ObservatorySystem.startSystemScan` (ten sam backend)');
  obs._ok = false; obs._tier = 0; run({ id: 'scan', enabled: true });
  obs._tier = 2; obs._active = [{}]; run({ id: 'scanMore', enabled: true });
  obs._active = []; run({ id: 'scan', enabled: true });
  ok(toasts.join('|') === [t('fleet.scanLockedToast'), t('fleet.scanLimitToast'), t('fleet.scanBusyToast')].join('|'),
    'H3d odmowa backendu — te same trzy komunikaty co Stratcom (blokada / limit / zajęty)');
  const fmo = stripComments(fs.readFileSync(new URL('../../ui/FleetManagerOverlay.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
  ok(['fleet.scanLockedToast', 'fleet.scanLimitToast', 'fleet.scanBusyToast'].every((k) => fmo.includes(`'${k}'`)), 'H3e KONTROLA: Stratcom używa tych samych trzech kluczy');
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
    L._look = true;
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
  const f0 = GAME_CONFIG.FEATURES.galaxyWarp;
  // id wierszy + tekst „+N” przy gwieździe domu; 4 statki, limit wierszy = 3.
  const state = ({ ships = false, hover = false, selStar = false, selShips = [], flag = true, onRow = false, vessels = list } = {}) => {
    GAME_CONFIG.FEATURES.galaxyWarp = flag;
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
    ['flaga OFF — nazwy i „+1” jak w G2', { flag: false }, 'v1,v2,v3', '+1'],
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
  const layG2 = call(() => CL.railLayout({ ax: 400, ay: 300, rows: [], hidden: 1, rowH: 14, pickHalf: half, plusW: 20 }));
  ok(lay1?.plus === null && lay2?.plus?.count === 2 && layG2?.plus?.count === 1,
    'H13f próg „+N” w geometrii: N = 1 przy progu 2 — nic, N = 2 — jest; KONTROLA: bez progu „+1” jak w G2');
  GAME_CONFIG.FEATURES.galaxyWarp = f0;

  header('H14 CTRL+klik wiersza szyny (F4)');
  GAME_CONFIG.FEATURES.galaxyWarp = true;   // pin ścieżki ON niezależnie od domyślnej flagi (przebieg całości z OFF)
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
  K._log.length = 0;
  GAME_CONFIG.FEATURES.galaxyWarp = false;
  ok(call(() => R.handleClick(z.x + 2, z.y + 2, 0, 0)) === false, 'H14c KONTROLA OFF: przy CTRL gwiazda wygrywa jak przed krokiem');
  GAME_CONFIG.FEATURES.galaxyWarp = f0;
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
  const fmo = stripComments(fs.readFileSync(new URL('../../ui/FleetManagerOverlay.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
  ok(/_getStratcomRangeLY\(\)\s*\{[^}]*observatoryRangeLY\(/.test(fmo) && !/STRATCOM_LY_BY_LEVEL\s*=/.test(fmo), 'H10e Stratcom czyta zasięg z jednego źródła (bez własnej tabeli)');
  const enemy = (id, gx, gy) => ({ id, ownerEmpireId: 'emp_1', mission: { phase: 'warp_transit', currentGalX: gx, currentGalY: gy, fromSystemId: 'a', toSystemId: 'b', galProgress: 0.5 } });
  const vs = [enemy('c1', 1, 1), enemy('r1', 2, 1), enemy('far', 9, 9)];
  const q = { c1: 'contact', r1: 'rumor' };
  const bl = call(() => CL.galaxyEnemyBlips({ vessels: vs, systems: [{ id: 'a', z: 0 }, { id: 'b', z: 1 }], home: { x: 0, y: 0 }, rangeLY: 5, qualityOf: (id) => q[id] ?? 'unknown' }));
  ok(bl?.map?.((b) => `${b.v.id}:${b.mode}`).join(',') === 'c1:contact,r1:rumor', 'H10f blipy obcych w skoku: kontakt — pełny, plotka — duch, poza zasięgiem — nic');
  ok(call(() => CL.galaxyEnemyBlips({ vessels: vs, systems: [], home: { x: 0, y: 0 }, rangeLY: 0 }))?.length === 0, 'H10g zasięg 0 (Lv < 4) — żadnych obcych blipów');
}

header('H11 chipy warstw w trybie galaktyki');
{
  ok(HC?.chipLayersFor?.(true)?.join(',') === 'radar,routes,labels' && HC?.chipLayersFor?.(false)?.join(',') === 'radar,routes,labels,orbits',
    'H11a tryb galaktyki: [R] ping, [T] szlaki + trasy, [E] nazwy; [O] bez chipu (tryb układu — wszystkie 4)');
  ok(HC?.chipLayersFor?.(true, true)?.join(',') === 'radar,routes,labels,ships' && HC?.chipLayersFor?.(false, true)?.join(',') === 'radar,routes,labels,orbits',
    'H11b G3: w trybie galaktyki miejsce [O] mają „Okręty”; tryb układu bez zmian');
  const row = ['radar', 'routes', 'labels', 'orbits'].map((layer, i) => ({ layer, x: i * 30, y: 0, w: 28, h: 16 }));
  const gal = HC?.chipsForMode?.(row, true, true) ?? [];
  ok(gal.map((c) => c.layer).join(',') === 'radar,routes,labels,ships' && gal[3]?.x === row[3].x, 'H11c chip „Okręty” stoi na miejscu [O] (rząd nie skacze)');
  ok((HC?.chipsForMode?.(row, true, false) ?? []).map((c) => c.layer).join(',') === 'radar,routes,labels'
    && (HC?.chipsForMode?.(row, false, true) ?? []).map((c) => c.layer).join(',') === 'radar,routes,labels,orbits',
    'H11d KONTROLA: flaga OFF — miejsce puste jak w G2; tryb układu — orbity');
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

GAME_CONFIG.FEATURES.galaxyView = flagV; GAME_CONFIG.FEATURES.galaxyLook = flagL;
setLocale?.(loc0);
console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
