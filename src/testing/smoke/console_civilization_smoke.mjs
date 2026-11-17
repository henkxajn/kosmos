// ARC KONSOLE K5 / KZ — keeper konsol Cywilizacji i Sfery Dysona (docs/design/CONSOLES_PLAN.md §1.2, §19; na stałe od KZ-Civ).
//
// A — inwentarz akcji konsoli (piny bezwzględne z dzisiejszej ścieżki konsoli, KZ-Civ): Cywilizacja — dokładny zbiór typów stref
//     w każdym stanie inspektora, `close`, zbiór `goto_colony` (planetId) = wszystkie kolonie; Dyson — dokładny zbiór typów stref
//     na segment, każdy z 20 segmentów wybieralny, `deliverMax` / `deliverPercent` dla wybranego segmentu, gdy silnik przyjmie
//     dostawę; skutek handlera (`goto_colony` przełącza aktywną kolonię, `deliverMax` naprawdę dostarcza).
// C — czipy grupy zastępują pas subnav (wysokość 0, drawSubNav nic nie rysuje) bez żadnej flagi i zachowują stan instancji.
// G — bramki [ DOSTARCZ ]: każdy powód silnika (faza zablokowana, technologia segmentu, brak surowców, ukończony, sfera zablokowana)
//     → brak strefy dostawy + tekst powodu i18n z nazwą technologii; ŚWIADEK: silnik naprawdę odmawia (deliverMax → ok: false).
// M — mapowanie stanów segmentu / fazy, bieżąca faza, postęp, ścieżka końca gry, pierścień 20 łuków, koszt efektywny = wzór silnika.
// H — grupowanie powtórzeń kroniki (licznik, lata, kolonie, kolejność) i wiersze listy z licznikiem.
// E — gniazdo emblematu: obraz załadowany → obraz (drawImage), brak / błąd / ładowanie → nazwa imperium (nigdy pusta rama).
// N — bez surowych id i kluczy snake_case w tekście konsoli; ŚWIADEK: segment wymaga `dyson_collector`, konsola pokazuje jego nazwę.
// S — geometria przy 1600×1041 i 1280×833: strefy wewnątrz ramy / stref konsoli, czipy dostawy nie pod zegarem; wejście bez
//     window.inner* (kółko i klik z ostatniej klatki); konsola nie tworzy elementów DOM `<input>`.
// Bez pinów na stałych rysowania. Moduły jeszcze nieistniejące importowane dynamicznie (pin degraduje, nie przerywa).

import '../headless/env.js';
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { setLocale, t } from '../../i18n/i18n.js';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const CL = await tryImport('../../ui/CivilizationConsoleLogic.js');
const CO = await tryImport('../../ui/CivilizationOverlay.js');
const DO = await tryImport('../../ui/DysonOverlay.js');
const DS = await tryImport('../../systems/DysonSystem.js');
const LL = await tryImport('../../ui/ConsoleLayoutLogic.js');
const CPD = await tryImport('../../ui/CivPanelDrawer.js');
const DD = await tryImport('../../data/DysonData.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const safe = (fn, d = null) => { try { return fn(); } catch (e) { console.log('  ! ' + e.message); return d; } };
const src = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n').replace(/\/\/.*$/gm, ''); } catch { return ''; } };
setLocale('pl');
const F = GAME_CONFIG.FEATURES;

// ── atrapa płótna: tekst (cyfry w kratce sklejane po linii bazowej) + drawImage ──
function recCtx() {
  const texts = [], images = [];
  let lastY = null;
  const ctx = new Proxy({ canvas: { width: 1600, height: 1041 } }, {
    get: (o, k) => {
      if (k === 'fillText') return (s, x, y) => {
        if (lastY !== null && y === lastY && texts.length) texts[texts.length - 1] += String(s); else texts.push(String(s));
        lastY = y;
      };
      if (k === 'drawImage') return (img) => images.push(img);
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k in o) return o[k];
      return () => {};
    },
    set: (o, k, v) => { o[k] = v; return true; },
  });
  return { ctx, texts, images };
}

// ── świat ──
const W = 1280, H = 833;
const HIST = [
  { year: 10, type: 'disaster_survived', namePL: 'Katastrofa 10', nameEN: 'Disaster 10', icon: '☄', loyaltyPerm: -3, identityValue: 12 },
  { year: 40, type: 'disaster_survived', namePL: 'Katastrofa 40', nameEN: 'Disaster 40', icon: '☄', loyaltyPerm: -3, identityValue: 12 },
  { year: 5, type: 'colony_founded', namePL: 'Założenie', nameEN: 'Founding', icon: '⌂' },
];
function makeWorld(o = {}) {
  const calls = { switched: [], opened: [] };
  const stock = { Fe: 9999, Si: 9999, Cu: 9999, Ti: 9999, Nt: 0, Hv: 0, Xe: 0, ...(o.stock ?? {}) };
  const resSys = { getAmount: (r) => stock[r] ?? 0, spend: (c) => { for (const [k, v] of Object.entries(c)) stock[k] -= v; return true; },
    removeProducer() {}, registerProducer() {} };
  const techs = new Set(o.techs ?? []);
  const cols = [
    { planetId: 'p_home', name: 'Dom', creditsPerYear: 5, founded: 1, civSystem: { population: 12, maxPopulation: 20, loyalty: 70, colonyHistory: HIST.slice(0, 2) }, prosperitySystem: { prosperity: 55 } },
    { planetId: 'p_two', name: 'Druga', creditsPerYear: 2, founded: 20, civSystem: { population: 4, maxPopulation: 8, loyalty: 60, colonyHistory: HIST.slice(2) }, prosperitySystem: { prosperity: 35 } },
    { planetId: 'p_out', name: 'Placowka', isOutpost: true, founded: 30, civSystem: null },
  ];
  const cm = { activePlanetId: 'p_home', getPlayerColonies: () => cols, getColony: (id) => (id === 'p_home' ? { name: 'Dom', resourceSystem: resSys } : null),
    calculateTaxIncome: () => 1, switchActiveColony: (id) => { calls.switched.push(id); cm.activePlanetId = id; } };
  const ds = DS ? new DS.DysonSystem() : null;
  window.KOSMOS = {
    civMode: true, civName: 'NovaSentinel', homePlanet: { id: 'p_home', name: 'Dom' }, dysonSystem: ds, colonyManager: cm,
    techSystem: { isResearched: (id) => techs.has(id) }, resourceSystem: resSys,
    buildingSystem: { _getBuildingLevel: () => 0 }, vesselManager: { getAllVessels: () => [], getTotalFleetUpkeep: () => 0 },
    civilianTradeSystem: { getAllConnections: () => [1, 2] }, timeSystem: { gameTime: 60 },
    leaderSystem: { activeLeader: 'viktor_havel', activeFaction: 'seekers', getMultiplier: () => 1 },
    factionSystem: { isLocked: o.facLocked ?? false, slider: 22, tension: 40, getCurrentZone: () => 'seekers', getModifier: () => 1 },
    overlayManager: { active: o.active ?? 'civilization', overlays: {}, openPanel: (id) => { calls.opened.push(id); window.KOSMOS.overlayManager.active = id; } },
  };
  if (ds && o.dyson) ds.restore(JSON.parse(JSON.stringify(o.dyson)));   // restore trzyma referencję — klon
  return { calls, stock, ds, cm };
}
const civDraw = (ov) => { const r = recCtx(); ov.visible = true; ov.draw(r.ctx, W, H); return { ...r, zones: ov._hitZones.slice() }; };
const types = (zs) => new Set(zs.map((z) => z.type));
const DY_P1 = { active: true, unlockedPhases: ['phase_1'], completedCount: 1, researchBonus: 5,
  segments: { 1: { delivered: { Fe: 5000, Si: 2000 }, completed: true }, 2: { delivered: { Fe: 100 }, completed: false } } };
const DY_P4 = { active: true, unlockedPhases: ['phase_1', 'phase_2', 'phase_3', 'phase_4'], completedCount: 0, researchBonus: 0, segments: {} };

// ══ A — inwentarz akcji konsoli (piny bezwzględne, KZ-Civ) ══
console.log('\nA — inwentarz akcji konsoli');
{
  const CIV_TYPES = 'civ_item,close,goto_colony,tab';
  const civRows = [];
  for (const sel of ['empire', 'leader', 'col:p_home', 'col:p_out', 'fac:seekers', 'hist:disaster_survived']) {
    makeWorld();
    const ov = CO ? new CO.CivilizationOverlay() : null;
    if (ov) ov._kitSel = sel;
    const d = ov ? safe(() => civDraw(ov), { zones: [] }) : { zones: [] };
    civRows.push({ sel, kit: !!ov?.consoleZones, types: [...types(d.zones)].sort().join(','), close: d.zones.filter((z) => z.type === 'close').length,
      cols: [...new Set(d.zones.filter((z) => z.type === 'goto_colony').map((z) => z.data.planetId))].sort().join(',') });
  }
  const badT = civRows.filter((r) => !r.kit || r.types !== CIV_TYPES);
  assert(civRows.length === 6 && badT.length === 0, `A0 Cywilizacja: w każdym stanie inspektora typy stref = {${CIV_TYPES}} (${badT.map((r) => `${r.sel}:${r.types}`).join(' | ')})`);
  assert(civRows.every((r) => r.cols === 'p_home,p_out,p_two'), `A1 Cywilizacja: zbiór goto_colony = wszystkie 3 kolonie w każdym stanie (${civRows[0].cols})`);
  assert(civRows.every((r) => r.close === 1), 'A2 Cywilizacja: dokładnie jedno [ x ] w każdym stanie');
  // skutek handlera goto_colony na konsoli
  const w = makeWorld();
  const ov = CO ? new CO.CivilizationOverlay() : null;
  const d = ov ? safe(() => civDraw(ov), { zones: [] }) : { zones: [] };
  const z = d.zones.find((q) => q.type === 'goto_colony' && q.data.planetId === 'p_two');
  if (z) safe(() => ov._onHit(z));
  assert(w.calls.switched.join() === 'p_two' && ov?._kitSel === 'col:p_two', `A3 goto_colony: przełącza aktywną kolonię i otwiera jej inspektor (${w.calls.switched}, ${ov?._kitSel})`);
  // Dyson: dokładny zbiór typów stref na segment (otwarty z magazynem → dostawa; ukończony / zablokowany → bez dostawy)
  const DY_TYPES = { 2: 'close,deliverMax,deliverPercent,selectSegment,tab', 1: 'close,selectSegment,tab', 7: 'close,selectSegment,tab' };
  const dyBad = [];
  const dz = {};
  for (const seg of [2, 1, 7]) {
    makeWorld({ active: 'dyson', dyson: DY_P1 });
    const dv = DO ? new DO.DysonOverlay() : null;
    if (dv) dv._selectedSeg = seg;
    const r = dv ? safe(() => civDraw(dv), { zones: [] }) : { zones: [] };
    const ty = [...types(r.zones)].sort().join(',');
    if (!dv?.consoleZones || ty !== DY_TYPES[seg]) dyBad.push(`${seg}:${ty}`);
    if (seg === 2) Object.assign(dz, { sel: new Set(r.zones.filter((q) => q.type === 'selectSegment').map((q) => q.data.segmentId)),
      max: r.zones.filter((q) => q.type === 'deliverMax' && q.data.segmentId === 2).length === 1,
      pct: r.zones.filter((q) => q.type === 'deliverPercent' && q.data.segmentId === 2 && q.data.percent === 0.10).length === 1, dv, zones: r.zones, kit: !!dv?.consoleZones });
  }
  assert(dyBad.length === 0, `A4 Dyson: typy stref na segment 2 / 1 / 7 = dokładne zbiory (${dyBad.join(' | ')})`);
  assert(dz.kit && dz.max && dz.pct, 'A5 Dyson: deliverMax i deliverPercent (10 %) dla segmentu 2, gdy silnik przyjmie dostawę');
  assert(dz.kit && dz.sel.size === 20, `A6 Dyson: wybór segmentu — wszystkie 20 segmentów (${dz.sel?.size})`);
  const zin = (r) => (q) => !!r && q.x >= r.x - 1 && q.y >= r.y - 1 && q.x + q.w <= r.x + r.w + 1 && q.y + q.h <= r.y + r.h + 1;
  const segSet = (pred) => new Set(dz.zones.filter((q) => q.type === 'selectSegment' && pred(q)).map((q) => q.data.segmentId));
  const inList = segSet(zin(dz.dv?._consoleListRect)), inHero = segSet(zin(dz.dv?.consoleZones?.hero));
  assert(inList.size === 20 && inHero.size === 20, `A7 Dyson ON: każdy z 20 segmentów wybieralny w liście i na pierścieniu bohatera (zablokowany pokazuje powód) — lista ${inList.size}, pierścień ${inHero.size}`);
  // skutek deliverMax na konsoli
  const w2 = makeWorld({ active: 'dyson', dyson: DY_P1 });
  const dv = DO ? new DO.DysonOverlay() : null;
  if (dv) dv._selectedSeg = 2;
  const r2 = dv ? safe(() => civDraw(dv), { zones: [] }) : { zones: [] };
  const zm = r2.zones.find((q) => q.type === 'deliverMax');
  const before = w2.ds?.getProgress?.(2) ?? 0;
  if (zm) safe(() => dv._onHit(zm));
  const after = w2.ds?.getProgress?.(2) ?? 0;
  assert(!!dv?.consoleZones && after > before, `A8 deliverMax na konsoli dostarcza (postęp ${before.toFixed(3)} → ${after.toFixed(3)})`);
}

// ══ T — «Kolonie i placówki» w inspektorze przeglądu imperium ══
console.log('\nT — tabela kolonii i placówek');
{
  const rows = CL?.colonyTableRows?.([{ planetId: 'a', name: 'A', pop: 2, prosperity: 40, fleetCount: 1, buildings: 3 },
    { planetId: 'o', name: 'O', isOutpost: true, fleetCount: 0, buildings: 1 }, { planetId: 'b', name: 'B', pop: 9, prosperity: 60, fleetCount: 4, buildings: 8 }], { a: 3, b: -2 }) ?? [];
  assert(rows.map((r) => `${r.planetId}:${r.kind}`).join() === 'b:colony,a:colony,o:outpost' && rows[1].krYear === 3 && rows[2].pop === null && rows[0].ships === 4,
    `T1 każda kolonia i placówka (kolonie po POP, placówki na końcu), Kr/rok, statki, budynki (${rows.map((r) => r.planetId).join()})`);
  const w = makeWorld();
  const ov = CO ? new CO.CivilizationOverlay() : null;
  const d = ov ? safe(() => civDraw(ov), { zones: [], texts: [] }) : { zones: [], texts: [] };
  const ir = ov?._consoleInspRect, lr = ov?._consoleListRect;
  const inR = (r) => (q) => !!r && q.x >= r.x - 1 && q.y >= r.y - 1 && q.x + q.w <= r.x + r.w + 1 && q.y + q.h <= r.y + r.h + 1;
  const insp = d.zones.filter((q) => q.type === 'goto_colony' && inR(ir)(q));
  const list = d.zones.filter((q) => q.type === 'goto_colony' && inR(lr)(q));
  assert(insp.map((q) => q.data.planetId).sort().join() === 'p_home,p_out,p_two' && d.texts.some((q) => q.includes(t('civConsole.typeOutpost'))),
    `T2 inspektor przeglądu: wiersz dla każdej kolonii i placówki ze strefą goto_colony (${insp.map((q) => q.data.planetId)})`);
  const zi = insp.find((q) => q.data.planetId === 'p_two'), zl = list.find((q) => q.data.planetId === 'p_two');
  if (zi) safe(() => ov._onHit(zi));
  const viaInsp = [w.calls.switched.slice(), ov?._kitSel];
  w.calls.switched.length = 0; w.cm.activePlanetId = 'p_home'; if (ov) ov._kitSel = 'empire';
  if (zl) safe(() => ov._onHit(zl));
  const viaList = [w.calls.switched.slice(), ov?._kitSel];
  assert(!!zi && !!zl && zi.type === zl.type && JSON.stringify(zi.data) === JSON.stringify(zl.data) && JSON.stringify(viaInsp) === JSON.stringify(viaList) && viaList[1] === 'col:p_two',
    `T3 klik wiersza tabeli == klik kolonii na liście (ten sam typ, dane i skutek: ${JSON.stringify(viaInsp)})`);
}

// ══ C — czipy zamiast subnav, stan zachowany ══
console.log('\nC — czipy grupy zastępują pas subnav');
{
  makeWorld({ active: 'civilization' });
  const kit = !!LL?.isKitScreen?.('civilization', F) && !!LL?.isKitScreen?.('dyson', F);
  const sub = safe(() => CPD?.getSubNavHeight?.(), -1);
  assert(kit && sub === 0, `C1 obie strony grupy są ekranami zestawu, pas subnav 0 (kit ${kit}, ${sub})`);
  // KZ-Civ — trwałość: ekran zestawu bez żadnej flagi (puste FEATURES, consoleKit OFF) i bez klucza flagi w FEATURES
  const perm = ['civilization', 'dyson'].every((id) => LL?.isKitScreen?.(id, {}) === true && LL?.isKitScreen?.(id, { consoleKit: false }) === true);
  assert(perm && !('consoleCivilization' in F) && LL?.PERMANENT_KIT_SCREENS?.includes?.('dyson') && !LL?.CONSOLE_KIT_SCREENS?.civilization,
    `C2 trwałość: Cywilizacja i Dyson są ekranami zestawu bez flag (klucz consoleCivilization zdjęty: ${!('consoleCivilization' in F)})`);
  makeWorld({ active: 'civilization' });
  const ov = CO ? new CO.CivilizationOverlay() : null;
  const d = ov ? safe(() => civDraw(ov), { zones: [] }) : { zones: [] };
  const tabs = d.zones.filter((z) => z.type === 'tab').map((z) => z.data.id);
  assert(tabs.join() === 'civilization,dyson', `C3 czipy nagłówka [ CYWILIZACJA ] [ SFERA DYSONA ] (${tabs})`);
  const chips = CL?.civGroupChips?.('dyson', t) ?? [];
  assert(chips.map((c) => c.label).join('|') === `${t('civPanel.civilization')}|${t('civPanel.dyson')}` && chips[1]?.active === true,
    'C4 etykiety czipów = dzisiejsze etykiety pasa subnav; aktywny czip = bieżąca strona');
  if (ov) ov._kitSel = 'fac:seekers';
  const zt = d.zones.find((z) => z.type === 'tab' && z.data.id === 'dyson');
  if (zt) safe(() => ov._onHit(zt));
  assert(window.KOSMOS.overlayManager.active === 'dyson' && ov?._kitSel === 'fac:seekers', `C5 czip otwiera Dysona, wybór Cywilizacji zostaje (${window.KOSMOS.overlayManager.active}, ${ov?._kitSel})`);
  const self = d.zones.find((z) => z.type === 'tab' && z.data.id === 'civilization');
  window.KOSMOS.overlayManager.active = 'civilization';
  const n0 = window.KOSMOS.overlayManager.openPanel.length;
  if (self) safe(() => ov._onHit(self));
  assert(!!ov?.consoleZones && window.KOSMOS.overlayManager.active === 'civilization' && n0 >= 0, 'C6 czip bieżącej strony bez skutku');
}

// ══ G — bramki dostawy → wyłączone + powód ══
console.log('\nG — bramki [ DOSTARCZ ]');
{
  const cases = [
    { name: 'faza zablokowana', dyson: DY_P1, seg: 7, key: 'civConsole.dyReasonPhaseLocked', tech: 'dyson_collector', offZone: false },
    { name: 'technologia segmentu', dyson: DY_P4, seg: 20, key: 'civConsole.dyReasonSegmentTech', tech: 'jump_gate_construction', offZone: true },
    { name: 'brak surowców', dyson: DY_P1, seg: 2, stock: { Fe: 0, Cu: 0, Ti: 0 }, key: 'civConsole.dyReasonNoStock', offZone: true },
    { name: 'sfera zablokowana', dyson: null, seg: 1, key: 'civConsole.dyReasonNotUnlocked', offZone: false },
  ];
  const { TECHS } = await import('../../data/TechData.js');
  const { getName } = await import('../../i18n/i18n.js');
  for (const c of cases) {
    const res = {};
    const wg = makeWorld({ active: 'dyson', dyson: c.dyson, stock: c.stock });
    const dv = DO ? new DO.DysonOverlay() : null;
    if (dv) dv._selectedSeg = c.seg;
    res.true = dv ? safe(() => civDraw(dv), { zones: [], texts: [] }) : { zones: [], texts: [] };
    const engine = safe(() => wg.ds?.deliverMax?.(c.seg), null);
    const onZone = res.true.zones.some((z) => (z.type === 'deliverMax' || z.type === 'deliverPercent') && z.data.segmentId === c.seg);
    const reason = t(c.key, c.tech ? getName(TECHS[c.tech], 'tech') : '');
    const shown = res.true.texts.some((s) => s.includes(reason.slice(0, 30)));
    assert(!onZone && shown && !reason.includes('{0}'), `G ${c.name}: ON bez strefy dostawy + powód «${reason.slice(0, 50)}…»`);
    if (c.offZone) assert(engine && engine.ok === false, `G ${c.name}: ŚWIADEK — silnik naprawdę odmawia dostawy (${JSON.stringify(engine)?.slice(0, 60)})`);
  }
  // ukończony segment: brak czipów, tekst «Segment ukończony»
  makeWorld({ active: 'dyson', dyson: DY_P1 });
  const dv = DO ? new DO.DysonOverlay() : null;
  if (dv) dv._selectedSeg = 1;
  const r = dv ? safe(() => civDraw(dv), { zones: [], texts: [] }) : { zones: [], texts: [] };
  assert(!r.zones.some((z) => z.type === 'deliverMax') && r.texts.some((s) => s.includes(t('dyson.segmentComplete'))), 'G ukończony: bez akcji, «Segment ukończony»');
  // czysta mapa powodów
  const g = CL?.deliverGate;
  assert(g?.(3, { ok: true }, [{ remaining: 5, stock: 0 }])?.reasonKey === 'civConsole.dyReasonNoStock'
    && g?.(3, { ok: true }, [{ remaining: 5, stock: 1 }])?.ok === true
    && g?.(3, { ok: false, reason: 'alreadyCompleted' }, [])?.reasonKey === 'civConsole.dyReasonCompleted'
    && g?.(null, null, [])?.reasonKey === 'civConsole.dyReasonSelect', 'G deliverGate: powód silnika / magazyn → klucz i18n');
  const keys = Object.values(CL?.DELIVER_REASON_KEY ?? {});
  const PL = (await import('../../i18n/pl.js')).default, EN = (await import('../../i18n/en.js')).default;
  assert(keys.length >= 8 && keys.every((k) => PL[k] && EN[k]), `G klucze powodów istnieją w PL i EN (${keys.length})`);
}

// ══ M — stany segmentu / fazy ══
console.log('\nM — mapowanie stanów Dysona');
{
  const isR = (id) => id === 'jump_gate_construction';
  const st = { active: true, unlockedPhases: ['phase_1', 'phase_4'], segments: { 1: { completed: true }, 2: { progress: 0.5 } } };
  const s = (id, r = () => false) => CL?.segmentState?.(id, st, r);
  assert(s(1) === 'built' && s(2) === 'current' && s(7) === 'locked' && s(16) === 'current' && s(20) === 'locked' && s(20, isR) === 'current',
    'M1 segmentState: zbudowany / bieżący / zablokowany (faza, technologia segmentu 20)');
  assert(CL?.segmentState?.(1, { active: false, segments: {} }) === 'locked', 'M2 sfera nieaktywna → zablokowany');
  const P = DD?.DYSON_PHASES ?? [];
  const allDone = { active: true, unlockedPhases: ['phase_1'], segments: Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [i, { completed: true }])) };
  assert(CL?.phaseState?.(P[0], allDone) === 'done' && CL?.phaseState?.(P[1], allDone) === 'locked' && CL?.phaseState?.(P[0], st) === 'current',
    'M3 phaseState: gotowa / bieżąca / zablokowana');
  assert(CL?.currentPhase?.(st)?.index === 0 && CL?.currentPhase?.({ active: false, segments: {} }) === null, 'M4 currentPhase: pierwsza niedokończona odblokowana; nic → null');
  const op = CL?.overallProgress?.(st);
  assert(op?.built === 1 && op?.total === 20 && Math.abs(op.frac - 1.5 / 20) < 1e-9, `M5 overallProgress (${op?.built}/${op?.total}, ${op?.frac})`);
  const path = CL?.endgamePath?.(allDone, false) ?? [];
  assert(path.length === 6 && path[0].status === 'done' && path[1].status === 'current' && path[5].status === 'todo' && path[4].id === 'jump_gate',
    `M6 ścieżka końca gry: 4 fazy → Brama → koniec, «tu jesteś» = pierwszy niezrobiony (${path.map((x) => x.status[0]).join('')})`);
  const arcs = CL?.ringArcs?.() ?? [];
  assert(arcs.length === 20 && arcs.every((a, i) => i === 0 || a.a0 > arcs[i - 1].a0) && new Set(arcs.map((a) => a.segId)).size === 20,
    'M7 pierścień: 20 łuków, rosnące kąty, każdy segment raz');
  // koszt efektywny = wzór silnika
  makeWorld({ dyson: DY_P1 });
  window.KOSMOS.buildingSystem = { _getBuildingLevel: (id) => (id === 'orbital_fabricator' ? 2 : 0) };
  const ds = window.KOSMOS.dysonSystem;
  const mult = ds?.getCostMultiplier?.();
  const rows = CL?.segmentCostRows?.(2, ds?.getState?.(), mult, () => 0) ?? [];
  const need = rows.reduce((a, r) => a + r.need, 0), got = rows.reduce((a, r) => a + r.delivered, 0);
  assert(mult === 0.8 && rows.length > 0 && Math.abs(got / need - (ds?.getProgress?.(2) ?? -1)) < 1e-9, `M8 koszt efektywny wierszy = postęp silnika (×${mult})`);
}

// ══ H — kronika ══
console.log('\nH — grupowanie kroniki');
{
  const ent = [...HIST.slice(0, 2).map((h) => ({ ...h, colName: 'Dom' })), { ...HIST[0], year: 50, colName: 'Druga' }, { ...HIST[2], colName: 'Druga' }];
  const gs = CL?.historyGroups?.(ent, 'pl') ?? [];
  const d = gs.find((g) => g.key === 'disaster_survived');
  assert(gs.length === 2 && d?.count === 3 && d?.firstYear === 10 && d?.lastYear === 50 && d?.name === 'Katastrofa 10'.replace('10', '10') && d.colonies.join() === 'Dom,Druga',
    `H1 powtórzenia typu → jedna grupa ×3, lata 10–50, kolonie (${d?.count}, ${d?.firstYear}–${d?.lastYear})`);
  assert(gs[0]?.key === 'disaster_survived' && d?.loyaltyPerm === -9, 'H2 kolejność: najnowsze na górze; suma trwałej lojalności');
  assert(CL?.historyGroups?.(ent, 'en')?.[1]?.name === 'Founding', 'H3 nazwa w języku gry');
  makeWorld();
  const ov = CO ? new CO.CivilizationOverlay() : null;
  const r = ov ? safe(() => civDraw(ov), { texts: [], zones: [] }) : { texts: [], zones: [] };
  assert(r.texts.some((s) => /×2/.test(s)) && r.zones.some((z) => z.type === 'civ_item' && z.data.id === 'hist:disaster_survived'),
    'H4 lista / oś kroniki: grupa z licznikiem ×2 i strefą wyboru');
}

// ══ E — emblemat ══
console.log('\nE — gniazdo emblematu');
{
  assert(CL?.emblemSlot?.({ complete: true, naturalWidth: 512 }) === 'image', 'E1 obraz załadowany → obraz');
  assert(['name', 'name', 'name', 'name'].join() === [null, { complete: false, naturalWidth: 0 }, { complete: true, naturalWidth: 0 }, { complete: true, naturalWidth: 512, failed: true }]
    .map((i) => CL?.emblemSlot?.(i)).join(), 'E2 brak / ładowanie / pusty / błąd → nazwa');
  assert(CL?.EMBLEM_PATH === 'assets/ui/emblems/player.png', 'E3 ścieżka emblematu właściciela');
  makeWorld();
  const ov = CO ? new CO.CivilizationOverlay() : null;
  const a = ov ? safe(() => civDraw(ov), { texts: [], images: [] }) : { texts: [], images: [] };
  assert(a.texts.some((s) => s === 'NOVASENTINEL'), 'E4 brak pliku (node, bez Image) → nazwa imperium dużym krojem w bohaterze');
  // mock Image z env.js nigdy się nie «ładuje»; obraz jest już w cache widoku → «załaduj» go przez prototyp mocka
  const P = globalThis.Image?.prototype;
  const desc = (v) => ({ get: () => v, configurable: true });
  if (P) { Object.defineProperty(P, 'complete', desc(true)); Object.defineProperty(P, 'naturalWidth', desc(512)); Object.defineProperty(P, 'naturalHeight', desc(512)); }
  const b = ov ? safe(() => civDraw(ov), { texts: [], images: [] }) : { texts: [], images: [] };
  if (P) { delete P.complete; delete P.naturalWidth; delete P.naturalHeight; }
  assert(b.images.length >= 2 && a.images.length === 0, `E5 plik obecny → emblemat (i portret) rysowany obrazem (drawImage × ${b.images.length})`);
}

// ══ N — bez surowych id ══
console.log('\nN — bez surowych id');
{
  const RAW = /\b[a-z]+_[a-z_]+\b|civConsole\.|civOverlay\.|dyson\.[a-z]/;
  const bad = [];
  for (const sel of ['empire', 'leader', 'col:p_home', 'col:p_out', 'fac:seekers', 'fac:confederates', 'hist:disaster_survived']) {
    for (const locked of [false, true]) {
      makeWorld({ facLocked: locked });
      const ov = CO ? new CO.CivilizationOverlay() : null;
      if (ov) ov._kitSel = sel;
      const r = ov ? safe(() => civDraw(ov), { texts: [] }) : { texts: [] };
      bad.push(...r.texts.filter((s) => RAW.test(s)));
    }
  }
  for (const [dy, seg] of [[DY_P1, 2], [DY_P1, 7], [DY_P4, 20], [null, 1], [DY_P1, 1]]) {
    makeWorld({ active: 'dyson', dyson: dy });
    const dv = DO ? new DO.DysonOverlay() : null;
    if (dv) dv._selectedSeg = seg;
    const r = dv ? safe(() => civDraw(dv), { texts: [] }) : { texts: [] };
    bad.push(...r.texts.filter((s) => RAW.test(s)));
  }
  assert(bad.length === 0 && CO && DO, `N1 konsole: żadnego id / klucza snake_case w tekście (${bad.slice(0, 3).join(' | ')})`);
  // ŚWIADEK (KZ-Civ, zamiast kontroli OFF): segment zablokowanej fazy wymaga `dyson_collector` — konsola pokazuje jego NAZWĘ
  makeWorld({ active: 'dyson', dyson: DY_P1 });
  const { TECHS: TX } = await import('../../data/TechData.js');
  const { getName: gn } = await import('../../i18n/i18n.js');
  const dv = DO ? new DO.DysonOverlay() : null;
  if (dv) dv._selectedSeg = 7;
  const r = dv ? safe(() => civDraw(dv), { texts: [] }) : { texts: [] };
  const nm = TX?.dyson_collector ? gn(TX.dyson_collector, 'tech') : '';
  assert(nm.length > 3 && nm !== 'dyson_collector' && r.texts.some((s) => s.includes(nm)) && !r.texts.some((s) => s.includes('dyson_collector')),
    `N2 ŚWIADEK: segment 7 wymaga dyson_collector — konsola pisze «${nm}», nie id`);
}

// ══ S — geometria i wejście ══
console.log('\nS — geometria (1600×1041, 1280×833) i wejście');
{
  for (const [iw, ih] of [[1600, 1041], [1280, 833]]) {
    const vp = LL?.uiViewport?.(iw, ih) ?? { W, H };
    for (const page of ['civilization', 'dyson']) {
      makeWorld({ active: page, dyson: DY_P1 });
      const ov = page === 'civilization' ? (CO ? new CO.CivilizationOverlay() : null) : (DO ? new DO.DysonOverlay() : null);
      if (!ov) { assert(false, `S ${page} brak modułu`); continue; }
      if (page === 'dyson') ov._selectedSeg = 2;
      const r = recCtx(); ov.visible = true;
      safe(() => ov.draw(r.ctx, vp.W, vp.H));
      const z = ov.consoleZones;
      const f = z?.frame;
      const inF = (q) => f && q.x >= f.x - 1 && q.y >= f.y - 1 && q.x + q.w <= f.x + f.w + 1 && q.y + q.h <= f.y + f.h + 1;
      const zs = ov._hitZones ?? [];
      const clock = z?.clock;
      const hitsClock = (q) => clock && q.x < clock.x + clock.w && q.x + q.w > clock.x && q.y < clock.y + clock.h && q.y + q.h > clock.y;
      const acts = zs.filter((q) => q.type === 'deliverMax' || q.type === 'deliverPercent');
      assert(zs.length > 3 && zs.every(inF) && !LL?.zonesOverlap?.(z), `S ${iw}×${ih} ${page}: ${zs.length} stref w ramie konsoli, strefy konsoli rozłączne`);
      if (page === 'dyson') assert(acts.length === 2 && acts.every((q) => !hitsClock(q) && q.x >= z.inspector.x - 1), `S ${iw}×${ih} dyson: czipy dostawy w inspektorze, nie pod zegarem`);
      // klik w środek strefy z ostatniej klatki trafia ją (bez window.inner*)
      const saved = { w: globalThis.innerWidth, h: globalThis.innerHeight };
      globalThis.innerWidth = 1; globalThis.innerHeight = 1; window.innerWidth = 1; window.innerHeight = 1;
      // wiersz INNY niż bieżący wybór — klik musi zmienić stan (skutek handlera, nie tylko pochłonięcie)
      const cur = () => (page === 'dyson' ? ov._selectedSeg : ov._kitSel);
      const rowId = (q) => (page === 'dyson' ? q.data.segmentId : q.data.id);
      const row = zs.find((q) => q.type === (page === 'dyson' ? 'selectSegment' : 'civ_item') && rowId(q) !== cur());
      const ok = row ? ov.handleClick(row.x + row.w / 2, row.y + row.h / 2) : false;
      const lr = ov._consoleListRect ?? { x: -9, y: -9 };
      const scr = safe(() => ov.handleScroll(100, lr.x + 5, lr.y + 5), false);
      window.innerWidth = saved.w; window.innerHeight = saved.h; globalThis.innerWidth = saved.w; globalThis.innerHeight = saved.h;
      assert(ok === true && !!row && cur() === rowId(row) && scr === true && (ov._kitScrollList ?? 0) > 0, `S ${iw}×${ih} ${page}: klik (wybór → ${row ? rowId(row) : '?'}) i kółko ze stref ostatniej klatki (window.inner* = 1)`);
    }
  }
  const kitSrc = src('../../ui/CivilizationConsoleView.js') + src('../../ui/CivilizationConsoleLogic.js');
  const ovSrc = (s) => ((s.match(/\n  handleClick\(x, y\) \{[\s\S]*?\n  }\n/) ?? [''])[0] + (s.match(/\n  handleScroll\(delta, x, y\) \{[\s\S]*?\n  }\n/) ?? [''])[0]);
  const a = ovSrc(src('../../ui/CivilizationOverlay.js')), b = ovSrc(src('../../ui/DysonOverlay.js'));
  assert(a.length > 50 && b.length > 50 && !/inner(Width|Height)/.test(a + b + kitSrc), 'S wejście konsoli i widok bez window.inner*');
  assert(kitSrc.length > 100 && !/createElement\(\s*['"]input/.test(kitSrc), 'S konsole nie tworzą DOM <input> (brak pól do pozycjonowania)');
}

// ══ D — pomocniki bramki (bez cudzysłowów) ══
console.log('\nD — KOSMOS.debug.civConsole');
{
  const DBG = await tryImport('../../debug/CivConsoleDebug.js');
  const w = makeWorld({ facLocked: true });
  const EB = (await import('../../core/EventBus.js')).default;
  window.KOSMOS.eventBus = EB;
  window.KOSMOS.factionSystem.unlock = () => { window.KOSMOS.factionSystem.isLocked = false; };
  let got = {};
  window.KOSMOS.resourceSystem.receive = (g) => { got = g; };
  const h = DBG?.civConsoleDebugHelpers?.({ getRenderer: () => ({ _dysonStage: 0, _dysonRingsGroup: null }), getUIManager: () => null })?.civConsole;
  const d0 = safe(() => h?.state()?.dyson?.active, null);
  const d1 = safe(() => h?.stageDyson()?.active, null);
  const f1 = safe(() => h?.unlockFactions()?.locked, null);
  safe(() => h?.stageStock(1));
  assert(d0 === false && d1 === true && w.ds?.getState?.().unlockedPhases.includes('phase_1'), 'D1 stageDyson(): faza I otwarta zdarzeniem silnika');
  assert(f1 === false && got.Fe > 0 && safe(() => h?.state()?.star3d?.stage, null) === 0, 'D2 unlockFactions(), stageStock(1), state() z etapem gwiazdy 3D');
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} console_civilization_smoke: ${pass} ✓ / ${fail} ✗`);
process.exitCode = fail === 0 ? 0 : 1;
