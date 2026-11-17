// ARC KONSOLE K3 — keeper konsoli grupy Ekonomii, część A: Budżet + Przepływy (docs/design/CONSOLES_PLAN.md §1.2, D-K-15, D-K-16,
// D-K-20; Finding 725 — efekt podatku).
//
// A — dostępność akcji ON == OFF na stronę (inwentarz typów stref jak K1c-A / K2): Budżet — `close`, `tax_slider` (+ skutek
//     handlera: ta sama stawka z tej samej względnej pozycji X); Przepływy — `close`, `flow_res` (te same id w tej samej kolejności,
//     skutek: wybór zasobu). Nowe typy konsoli: `tab` (czipy grupy), `budget_line` (wybór linii).
// D — D-K-16: żadna linia lewej kolumny nie znika — każda linia, którą dziś rysuje kolumna (strefy `resource_hover` ścieżki OFF +
//     bilans energii), jest w górnej szufladzie (zbiór z WYKONANIA `TopResourceDrawer._colonyTokens`) albo w bloku inspektora
//     konsoli (strefy `resource_hover` ścieżki ON); stany: globalnie, wybrana kolonia, wybrana stacja-sierota, globalnie ze stacją.
//     Świadkowie: towar spoza paliwa jest w kolumnie OFF i w bloku ON; linia magazynu stacji jest w bloku ON.
// G — czipy grupy [ BUDŻET ] [ PRODUKCJA ] [ HANDEL ] [ RYNEK ] [ PRZEPŁYWY ]: kolejność, klik → openPanel z właściwym id, HANDEL / RYNEK
//     ustawiają zakładkę Handlu, reszta stanu Handlu zostaje; pas subnav znika nad Budżetem i Przepływami (K4: i nad Produkcją),
//     zostaje przy fladze OFF.
// P — K4 (zmiana podpisana): Produkcja przy fladze ON jest konsolą (strefy konsoli, dziennik ≠ OFF), przy OFF — dzisiejszą stroną
//     (czipy `colony_filter`, bez stref konsoli). Równość OFF z bazą f2a3604 — dziennik rysunku w probe (worktree), keeper
//     `console_production_smoke.mjs` pinuje resztę Produkcji.
// S — geometria: strefy w ramie konsoli przy 1600×1041 i 1280×833 (wiersze w prostokącie listy, suwak w bohaterze, blok w
//     inspektorze); wejście konsoli (klik / kółko) bez window.inner* — handler wykonany przy podmienionym innerWidth.
// T — Finding 725: efekt podatku przez t() (PL = dzisiejszy tekst, EN przetłumaczony; źródło bez gałęzi isPL); tekst konsoli bez
//     surowych id snake_case. N — netto i linie Budżetu = dzisiejszy wzór; ticker = dzisiejsze filtry.
//
// Bez pinów na stałych rysowania. Moduły nowe importowane dynamicznie (pin degraduje, nie przerywa).

import '../headless/env.js';
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { setLocale, t } from '../../i18n/i18n.js';
import EntityManager from '../../core/EntityManager.js';
import { MINED_RESOURCES, HARVESTED_RESOURCES } from '../../data/ResourcesData.js';
import { COMMODITIES } from '../../data/CommoditiesData.js';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const ECL = await tryImport('../../ui/EconomyConsoleLogic.js');
const EO = await tryImport('../../ui/EconomyOverlay.js');
const TO = await tryImport('../../ui/TradeOverlay.js');
const TRD = await tryImport('../../ui/TopResourceDrawer.js');
const CL = await tryImport('../../ui/ConsoleLayoutLogic.js');
const CPD = await tryImport('../../ui/CivPanelDrawer.js');
const ROLES = await tryImport('../../ui/ConsoleRolesLogic.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const safe = (fn, d = null) => { try { return fn(); } catch (e) { console.log('  ! ' + e.message); return d; } };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n').replace(/\/\/.*$/gm, '');
setLocale('pl');
const F = GAME_CONFIG.FEATURES;
const saved = { consoleKit: F.consoleKit, consoleEconomy: F.consoleEconomy };
const setEco = (on) => { F.consoleKit = true; F.consoleEconomy = on; };

// ── atrapa płótna: zapis tekstów + pełny dziennik wywołań (porównanie ON == OFF) ──
function recCtx() {
  const texts = [], log = [];
  const st = { canvas: { width: 1600, height: 1041 } };
  const ctx = new Proxy(st, {
    get: (o, k) => {
      if (k === 'fillText') return (s, x, y) => { texts.push(String(s)); log.push(['fillText', String(s), x, y, o.fillStyle, o.font]); };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => { log.push(['gradient', String(k)]); return { addColorStop: () => {} }; };
      if (k === 'getImageData') return () => ({ data: [] });
      if (k in o) return o[k];
      return (...a) => { log.push([String(k), ...a]); };
    },
    set: (o, k, v) => { o[k] = v; log.push(['set', String(k), v]); return true; },
  });
  return { ctx, texts, log };
}

// ── świat-atrapa: 2 kolonie gracza (+ placówka), stacja-sierota, jednostki, flota ──
const COM_X = Object.values(COMMODITIES).find((c) => c.id !== 'fuel' && c.recipe)?.id ?? 'steel_plates';
function makeResSys({ inv = {}, rate = {}, producers = {}, energy = { balance: 5, production: 10, consumption: 5, brownout: false }, research = 0 } = {}) {
  const inventory = new Map(Object.entries(inv));
  const observed = new Map(Object.entries(rate));
  if (research) observed.set('research', research);
  return {
    inventory, energy, research: { amount: 10, perYear: research },
    _deltaTracker: { observedPerYear: observed },
    _producers: new Map(Object.entries(producers)),
    getAmount: (id) => inventory.get(id) ?? 0,
    inventorySnapshot: () => ({ ...inv, _observedPerYear: { ...rate }, _energy: energy }),
  };
}
function makeWorld({ withStation = true, selected = null } = {}) {
  const calls = { open: [] };
  const colA = { planetId: 'col_a', name: 'Alfa', ownerEmpireId: 'player', isOutpost: false, credits: 1200, creditsPerYear: 14.5,
    resourceSystem: makeResSys({ inv: { Fe: 500, food: 80, fuel: 30, [COM_X]: 12 }, rate: { Fe: -3.2, food: 2.5, [COM_X]: 0.7 },
      producers: { building_1_1: { Fe: 4, food: 3 }, civilization_consumption: { food: -6 } }, research: 3.5 }),
    buildingSystem: { _active: new Map([['1_1', { building: { id: 'mine' } }]]), _deposits: [], _cachedMineLevel: 0 },
    civSystem: { getTotalLaborCost: () => 6 }, factorySystem: null, prosperitySystem: { prosperity: 55, targetProsperity: 60 } };
  const colB = { planetId: 'col_b', name: 'Beta', ownerEmpireId: 'player', isOutpost: false, credits: 300, creditsPerYear: -2,
    resourceSystem: makeResSys({ inv: { Fe: 40, water: 20 }, rate: { Fe: -1, water: 1 }, producers: { building_2_2: { water: 2, Fe: -5 } } }),
    buildingSystem: { _active: new Map([['2_2', { building: { id: 'mine' } }]]), _deposits: [], _cachedMineLevel: 0 },
    civSystem: { getTotalLaborCost: () => 2 }, factorySystem: null };
  const out = { planetId: 'col_o', name: 'Placówka', ownerEmpireId: 'player', isOutpost: true, credits: 0, creditsPerYear: 0,
    resourceSystem: makeResSys({ inv: { Si: 7 } }), buildingSystem: { _active: new Map(), _deposits: [] }, factorySystem: null };
  const cols = [colA, colB, out];
  let taxRate = 0.08;
  const colMgr = {
    getPlayerColonies: () => cols, getAllColonies: () => cols, activePlanetId: 'col_a',
    getColony: (id) => cols.find((c) => c.planetId === id) ?? null,
    calculateTaxIncome: (c) => (c.planetId === 'col_a' ? 20 : 5),
    get taxRate() { return taxRate; }, set taxRate(v) { taxRate = Math.max(0, Math.min(0.25, v)); },
    constructor: { GROUND_UNIT_UPKEEP: { shock_infantry: { credits: 2 }, garrison_unit: { credits: 5 } } },
  };
  EntityManager.clear?.();
  if (withStation) {
    EntityManager.add({ id: 'st_1', type: 'station', name: 'Orbita-9', ownerEmpireId: 'player', depotDetached: true,
      depot: { inventory: new Map([['Cu', 15], ['fuel', 4], [COM_X, 2]]), getAmount: () => 0 } });
  }
  const trade = { _tab: 'trade', _marketEmpireId: 'emp_x', _marketGoodId: 'Fe', _marketQty: 33, _scrollLeft: 5, _scrollRight: 6, _closeQtyInput() {} };
  const om = { active: 'budget', overlays: { trade }, openPanel(id) { calls.open.push(id); this.active = id; } };
  window.KOSMOS = {
    colonyManager: colMgr, overlayManager: om,
    vesselManager: { getTotalFleetUpkeep: () => 11, getFleetUpkeepBreakdown: () => ({ deployed: 10, reserve: 1, total: 11, deployedCount: 2, reserveCount: 1 }),
      getAllVessels: () => [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }] },
    groundUnitManager: { _units: new Map([['u1', { owner: 'player', archetypeId: 'shock_infantry' }], ['u2', { owner: 'player', archetypeId: 'garrison_unit' }]]) },
  };
  return { calls, colMgr, trade, om, cols };
}
function makeOverlay(page, selected = null) {
  const ov = new EO.EconomyOverlay();
  ov.visible = true;
  ov._selectedColonyId = selected;
  window.KOSMOS.overlayManager.active = page;
  return ov;
}
function render(page, on, { W = 1600, H = 1041, selected = null, negNet = false } = {}) {
  setEco(on);
  if (negNet) {
    // netto budżetu < 0: utrzymanie floty ponad przychody
    window.KOSMOS.vesselManager.getTotalFleetUpkeep = () => 900;
    window.KOSMOS.vesselManager.getFleetUpkeepBreakdown = () => ({ deployed: 900, reserve: 0, total: 900, deployedCount: 3, reserveCount: 0 });
  }
  const ov = makeOverlay(page, selected);
  const r = recCtx();
  safe(() => ov.draw(r.ctx, W, H));
  const posTexts = r.log.filter((e) => e[0] === 'fillText').map((e) => ({ s: e[1], x: e[2], y: e[3], color: e[4] }));
  const gradients = r.log.filter((e) => e[0] === 'gradient').length;
  const net = page === 'budget' ? safe(() => ECL.budgetNet(ov._gatherBudgetData()), null) : null;
  return { ov, ...r, ptexts: posTexts, gradients, net, roles: ROLES ? ROLES.consoleRoles() : null, zones: ov._hitZones ?? [] };
}
const types = (zs) => new Set(zs.map((z) => z.type));
// świadek: render ON naprawdę jest konsolą (strefy konsoli zapisane) — bez niego piny „ON == OFF” byłyby zielone na bazie
const isKit = (r) => !!r?.ov?.consoleZones;
const idsOf = (zs, type, key) => zs.filter((z) => z.type === type).map((z) => z.data?.[key]);

// ═══ A — dostępność akcji ON == OFF ═══════════════════════════════════════════════════════════════════════════════
console.log('A — akcje ON == OFF');
if (!EO) { assert(false, 'A EconomyOverlay importuje się'); } else {
  makeWorld();
  const bOff = render('budget', false), bOn = render('budget', true);
  assert(types(bOff.zones).has('tax_slider') && types(bOff.zones).has('close'), 'A0 kontrola: OFF Budżet ma close + tax_slider');
  for (const ty of ['close', 'tax_slider']) assert(isKit(bOn) && types(bOn.zones).has(ty), `A1 Budżet ON (konsola) ma strefę ${ty}`);
  assert(types(bOn.zones).has('tab') && types(bOn.zones).has('budget_line'), 'A2 Budżet ON ma czipy grupy (tab) i linie (budget_line)');
  // skutek suwaka: ta sama względna pozycja → ta sama stawka
  const effect = (r, frac) => {
    const w = makeWorld(); const z = r.zones.find((q) => q.type === 'tax_slider');
    if (!z) return null;
    window.KOSMOS.overlayManager.active = 'budget';
    setEco(r === bOn);
    r.ov._hitZones = r.zones; r.ov.consoleZones = r.ov.consoleZones ?? null;
    const x = z.data.barX + z.data.barW * frac, y = z.y + z.h / 2;
    safe(() => r.ov.handleClick(x, y));
    return w.colMgr.taxRate;
  };
  for (const frac of [0.2, 0.64, 1]) {
    const off = effect(bOff, frac), on = effect(bOn, frac);
    assert(isKit(bOn) && off != null && on === off, `A3 tax_slider (konsola) przy ${frac}: ON ${on} == OFF ${off}`);
  }
  makeWorld();
  const fOff = render('flows', false), fOn = render('flows', true);
  const fo = idsOf(fOff.zones, 'flow_res', 'resId'), fn = idsOf(fOn.zones, 'flow_res', 'resId');
  assert(fo.length >= 3, `A4 kontrola: OFF Przepływy mają ${fo.length} wierszy flow_res`);
  assert(isKit(fOn) && JSON.stringify(fo) === JSON.stringify(fn), `A5 flow_res konsoli == OFF (id i kolejność): ${fn.join(',')}`);
  assert(isKit(fOn) && types(fOn.zones).has('close'), 'A6 Przepływy (konsola) mają close');
  const last = fOn.zones.filter((z) => z.type === 'flow_res').pop();
  setEco(true); window.KOSMOS.overlayManager.active = 'flows';
  if (last) safe(() => fOn.ov.handleClick(last.x + 4, last.y + last.h / 2));
  assert(isKit(fOn) && last && fOn.ov._flowSelectedResId === last.data.resId, 'A7 klik wiersza flow_res konsoli wybiera zasób (handler jak dziś)');
  const bl = bOn.zones.filter((z) => z.type === 'budget_line').find((z) => z.data.lineId === 'fleet');
  setEco(true); window.KOSMOS.overlayManager.active = 'budget';
  if (bl) safe(() => bOn.ov.handleClick(bl.x + 4, bl.y + bl.h / 2));
  assert(bOn.ov._budgetLine === 'fleet', 'A8 klik linii Budżetu wybiera linię');
}

// ═══ D — D-K-16: żadna linia nie znika ═══════════════════════════════════════════════════════════════════════════
console.log('D — D-K-16');
const drawerIdsExec = (() => {
  if (!TRD) return null;
  const w = makeWorld();
  const toks = safe(() => TRD.TopResourceDrawer.prototype._colonyTokens.call(
    { _globalResearch: () => ({ amount: 0, perYear: 0 }) }, w.cols[0])?.items, []);
  const ids = new Set();
  for (const it of toks ?? []) {
    if (it.kind === 'energy') ids.add('energy');
    else if ((it.kind === 'resource' || it.kind === 'commodity') && it.id) ids.add(it.id);
  }
  return ids;
})();
assert(drawerIdsExec && drawerIdsExec.has('Fe') && drawerIdsExec.has('energy'), `D0 świadek: szuflada (wykonana) ma Fe + energię (${drawerIdsExec?.size ?? 0} linii)`);
const drawerModel = safe(() => ECL?.drawerLineIds?.(), null);
assert(drawerModel && drawerIdsExec && drawerModel.size === drawerIdsExec.size && [...drawerIdsExec].every((i) => drawerModel.has(i)),
  'D1 drawerLineIds() == zbiór z wykonania TopResourceDrawer._colonyTokens');
const states = [
  { name: 'globalnie', withStation: false, selected: null },
  { name: 'globalnie + stacja-sierota', withStation: true, selected: null },
  { name: 'wybrana kolonia', withStation: true, selected: 'col_a' },
  { name: 'wybrana stacja', withStation: true, selected: 'st_1' },
];
let witnessGood = false, witnessStation = false;
for (const s of states) {
  for (const page of ['budget', 'flows']) {
    makeWorld({ withStation: s.withStation });
    const off = render(page, false, { H: 5000, selected: s.selected });
    makeWorld({ withStation: s.withStation });
    // polerka K3 (uwaga 2): blok magazynu tylko na Przepływach — linia kolumny OFF dowolnej strony osiągalna w szufladzie albo w bloku Przepływów
    const on = render('flows', true, { H: 5000, selected: s.selected });
    const colIds = new Set([...idsOf(off.zones, 'resource_hover', 'resourceId'), 'energy']);
    const blockIds = new Set(idsOf(on.zones, 'resource_hover', 'resourceId'));
    const stationSel = s.selected === 'st_1';
    // stacja wybrana: szuflada (tylko kolonie) jej nie pokazuje → wszystkie linie stacji muszą być w bloku (poza energią)
    // stacja wybrana: szuflada pokazuje tylko kolonie → każda linia stacji (poza bilansem energii — stacja nie ma systemu energii)
    // musi stać w bloku; inaczej — w szufladzie albo w bloku
    const missing = [...colIds].filter((id) => (stationSel ? (id !== 'energy' && !blockIds.has(id))
      : !(drawerIdsExec?.has(id) || blockIds.has(id))));
    assert(isKit(on) && colIds.size > 3 && missing.length === 0, `D2 ${page} · ${s.name}: każda linia kolumny (${colIds.size}) w szufladzie lub bloku${missing.length ? ' — brak: ' + missing.join(',') : ''}`);
    if (isKit(on) && !s.selected && blockIds.has(COM_X) && colIds.has(COM_X)) witnessGood = true;
    if (isKit(on) && s.withStation && !s.selected && blockIds.has('Cu')) witnessStation = true;
    assert(!types(on.zones).has('toggle_cat') || on.zones.filter((z) => z.type === 'toggle_cat').every((z) => z.data.catKey === 'commodities'),
      `D3 ${page} · ${s.name}: toggle_cat tylko dla towarów (wydobywalne / zbieralne są w szufladzie)`);
  }
}
assert(witnessGood, `D4 świadek: towar spoza paliwa (${COM_X}) jest w kolumnie OFF i w bloku ON`);
assert(witnessStation, 'D5 świadek: magazyn stacji-sieroty (Cu) jest w bloku ON (globalnie)');
{
  makeWorld({ withStation: true });
  const on = render('flows', true, { H: 5000, selected: 'st_1' });
  const blockIds = new Set(idsOf(on.zones, 'resource_hover', 'resourceId'));
  assert(isKit(on) && blockIds.has('Cu') && blockIds.has('fuel'), 'D6 wybrana stacja: jej linie z zapasem (Cu, paliwo) w bloku ON (Przepływy)');
}
{
  // D7 — polerka K3 (uwaga 2): Budżet ON nie ma bloku magazynu (świadek: Przepływy ON go mają)
  makeWorld({ withStation: true });
  const bud = render('budget', true, { H: 5000 });
  makeWorld({ withStation: true });
  const flo = render('flows', true, { H: 5000 });
  const blockT = (r) => r.zones.filter((q) => q.type === 'resource_hover' || q.type === 'toggle_cat').length;
  assert(isKit(bud) && isKit(flo) && blockT(flo) > 3 && blockT(bud) === 0,
    `D7 blok magazynu tylko na Przepływach (Budżet ${blockT(bud)} stref, Przepływy ${blockT(flo)})`);
}

// ═══ U — pas Budżetu opisany jako surowce; deficyt budżetu pierwszy (polerka K3, uwaga 1) ═══════════════════════
console.log('U — pas Budżetu');
{
  const tk = { deficits: [{ id: 'Fe', rate: -3, stock: 10 }], surpluses: [] };
  const neg = safe(() => ECL.budgetStripItems(-12.5, tk), null);
  const pos = safe(() => ECL.budgetStripItems(4, tk), null);
  const empty = safe(() => ECL.budgetStripItems(0, { deficits: [], surpluses: [] }), null);
  assert(neg?.budget?.tone === 'alert' && neg.budget.net === -12.5, 'U1 netto < 0 → pierwsza pozycja pasa = deficyt budżetu w roli alert');
  assert(pos && pos.budget === null && empty && empty.budget === null, 'U2 netto ≥ 0 → brak pozycji budżetu (4 i 0)');
  const keys = [...(neg?.rows ?? []).map((r) => r.key), neg?.emptyKey];
  const pl = keys.map((k) => (k ? t(k) : ''));
  assert(keys.length === 3 && pl.every((s) => /^Surowce/.test(s)), `U3 etykiety pasa (i pusty pas) mówią „Surowce”: ${pl.join(' | ')}`);
  // wykonanie: ujemne netto → pierwszy napis pasa to deficyt budżetu w kolorze alert
  makeWorld();
  const on = render('budget', true, { negNet: true });
  const strip = on.ov.consoleZones?.strip;
  const inStrip = (on.ptexts ?? []).filter((q) => strip && q.y >= strip.y && q.y <= strip.y + strip.h).sort((a, b) => a.y - b.y || a.x - b.x);
  const first = inStrip[0];
  assert(isKit(on) && first && first.s.toUpperCase().startsWith(t('econ.console.budgetDeficit').toUpperCase()) && first.color === on.roles?.alert,
    `U4 wykonanie (netto ${on.net?.toFixed?.(1)}): pierwszy napis pasa „${first?.s ?? '—'}” w roli alert`);
}

// ═══ L — bohater Przepływów w tercjach (polerka K3, uwaga 3) ═════════════════════════════════════════════════════
console.log('L — układ Przepływów');
{
  const r = { x: 100, y: 50, w: 900, h: 600 };
  const L = safe(() => ECL.flowHeroLayout(r, 4, 3), null);
  const third = r.w / 3;
  const inThird = (c, k) => c.x >= r.x + k * third - 0.5 && c.x + c.w <= r.x + (k + 1) * third + 0.5;
  assert(L && inThird(L.prodCol, 0) && inThird(L.consCol, 2) && Math.abs(L.centre.cx - (r.x + r.w / 2)) < 0.5,
    'L1 producenci w lewej tercji, zasób w środku, konsumenci w prawej');
  assert(L && L.prodHeader.x >= L.prodCol.x && L.prodHeader.x <= L.prodCol.x + L.prodCol.w && L.consHeader.x >= L.consCol.x
    && L.consHeader.x <= L.consCol.x + L.consCol.w && L.prodHeader.y < L.prodYs[0] && L.consHeader.y < L.consYs[0],
    'L2 nagłówki PRODUCENCI / KONSUMENCI nad swoimi kolumnami');
  const span = L ? L.prodYs[L.prodYs.length - 1] - L.prodYs[0] : 0;
  assert(L && L.prodYs.length === 4 && L.consYs.length === 3 && span > r.h * 0.4, `L3 węzły rozłożone na wysokość bohatera (rozpiętość ${Math.round(span)} px z ${r.h})`);
  assert(L && L.band(1) > L.band(0.5) && L.band(0.5) > L.band(0.05) && L.band(0) >= 1, 'L4 grubość pasma rośnie z wartością');
  makeWorld();
  const on = render('flows', true);
  assert(isKit(on) && (on.gradients ?? 0) > 0, `L5 wykonanie: lokalne przyciemnienie K1c-B pod środkiem (${on.gradients ?? 0} gradient)`);
}

// ═══ G — czipy grupy i subnav ════════════════════════════════════════════════════════════════════════════════════
console.log('G — czipy grupy');
{
  const w = makeWorld();
  const on = render('budget', true);
  const tabs = on.zones.filter((z) => z.type === 'tab').map((z) => z.data.id);
  assert(JSON.stringify(tabs) === JSON.stringify(['budget', 'economy', 'trade', 'market', 'flows']), `G1 czipy w kolejności: ${tabs.join(',')}`);
  const click = (id, from = 'budget') => {
    const ww = makeWorld(); setEco(true);
    const r = render(from, true);
    const z = r.zones.find((q) => q.type === 'tab' && q.data.id === id);
    if (z) safe(() => r.ov.handleClick(z.x + 2, z.y + 2));
    return ww;
  };
  const wE = click('economy'); assert(wE.calls.open.at(-1) === 'economy', 'G2 [ PRODUKCJA ] → openPanel(economy)');
  const wF = click('flows'); assert(wF.calls.open.at(-1) === 'flows', 'G3 [ PRZEPŁYWY ] → openPanel(flows)');
  const wM = click('market');
  assert(wM.calls.open.at(-1) === 'trade' && wM.trade._tab === 'market', 'G4 [ RYNEK ] → openPanel(trade) + zakładka market');
  assert(wM.calls.open.at(-1) === 'trade' && wM.trade._marketEmpireId === 'emp_x' && wM.trade._marketGoodId === 'Fe' && wM.trade._marketQty === 33,
    'G5 Handel zachowuje stan przy przełączeniu (imperium, towar, ilość)');
  const wT = click('trade');
  assert(wT.calls.open.at(-1) === 'trade' && wT.trade._tab === 'trade', 'G6 [ HANDEL ] → openPanel(trade) + zakładka trade');
  const wB = click('budget');
  assert(wB.calls.open.length === 0, 'G7 aktywny czip nie otwiera ponownie (kontrola)');
  void w;
  // subnav
  if (CPD) {
    makeWorld(); setEco(true);
    window.KOSMOS.overlayManager.active = 'budget';
    const hB = CPD.getSubNavHeight();
    window.KOSMOS.overlayManager.active = 'flows';
    const hF = CPD.getSubNavHeight();
    window.KOSMOS.overlayManager.active = 'economy';
    const hP = CPD.getSubNavHeight();
    setEco(false);
    window.KOSMOS.overlayManager.active = 'budget';
    const hOff = CPD.getSubNavHeight();
    setEco(false);
    window.KOSMOS.overlayManager.active = 'economy';
    const hPOff = CPD.getSubNavHeight();
    assert(hB === 0 && hF === 0, `G8 ON: brak pasa subnav nad Budżetem i Przepływami (${hB}, ${hF})`);
    assert(hP === 0 && hOff > 0 && hPOff > 0, `G9 K4: ON bez pasa subnav nad Produkcją (${hP}); OFF — pas nad Budżetem i Produkcją (${hOff}, ${hPOff})`);
  } else assert(false, 'G8 CivPanelDrawer importuje się');
}

// ═══ P — Produkcja niezmieniona przy fladze ON ═══════════════════════════════════════════════════════════════════
console.log('P — Produkcja: ON = konsola, OFF = dzisiejsza strona');
{
  makeWorld(); const off = render('economy', false);
  makeWorld(); const on = render('economy', true);
  const a = JSON.stringify(off.log), b = JSON.stringify(on.log);
  assert(isKit(on) && off.log.length > 50 && a !== b, `P1 K4: Produkcja ON jest konsolą (strefy konsoli; dziennik ON ≠ OFF, ${off.log.length} wywołań OFF)`);
  assert(!isKit(off) && off.zones.some((z) => z.type === 'colony_filter') && !off.zones.some((z) => z.type === 'tab'),
    'P2 K4: Produkcja OFF — dzisiejsza strona (czipy colony_filter, bez czipów grupy w nagłówku)');
  makeWorld(); const bOff = render('budget', false);
  makeWorld(); const bOn = render('budget', true);
  assert(JSON.stringify(bOff.log) !== JSON.stringify(bOn.log), 'P3 kontrola: Budżet ON ≠ OFF (dziennik rozróżnia)');
}

// ═══ S — geometria i wejście ═════════════════════════════════════════════════════════════════════════════════════
console.log('S — geometria');
const inside = (r, f) => r.x >= f.x - 0.5 && r.y >= f.y - 0.5 && r.x + r.w <= f.x + f.w + 0.5 && r.y + r.h <= f.y + f.h + 0.5;
for (const [W, H] of [[1600, 1041], [1280, 833]]) {
  for (const page of ['budget', 'flows']) {
    makeWorld();
    const on = render(page, true, { W, H });
    const z = on.ov.consoleZones;
    if (!z) { assert(false, `S0 ${page} ${W}×${H}: consoleZones zapisane`); continue; }
    assert(on.zones.length > 5 && on.zones.every((q) => inside(q, z.frame)), `S1 ${page} ${W}×${H}: ${on.zones.length} stref w ramie konsoli`);
    const rowT = page === 'budget' ? 'budget_line' : 'flow_res';
    const lr = on.ov._consoleListRect;
    assert(on.zones.filter((q) => q.type === rowT).every((q) => inside(q, lr)), `S2 ${page} ${W}×${H}: wiersze listy w prostokącie listy`);
    const ir = on.ov._consoleInspRect;
    assert(on.zones.filter((q) => q.type === 'resource_hover' || q.type === 'toggle_cat').every((q) => inside(q, ir)),
      `S3 ${page} ${W}×${H}: blok magazynu w inspektorze`);
    if (page === 'budget') {
      const ts = on.zones.find((q) => q.type === 'tax_slider');
      assert(ts && inside(ts, z.hero), `S4 budget ${W}×${H}: suwak podatku w bohaterze`);
      if (z.clock) assert(!on.zones.some((q) => q.type !== 'tab' && q.type !== 'close' && CL?.zonesOverlap?.(q, z.clock)), `S5 budget ${W}×${H}: strefy nie wchodzą pod zegar`);
    }
  }
}
{
  // wejście bez window.inner*: podmieniony innerWidth nie zmienia klik / kółka konsoli
  makeWorld();
  const on = render('budget', true);
  const iw = window.innerWidth, ih = window.innerHeight;
  window.innerWidth = 333; window.innerHeight = 222;
  const bl = on.zones.find((q) => q.type === 'budget_line' && q.data.lineId === 'tax');
  setEco(true); window.KOSMOS.overlayManager.active = 'budget';
  const hit = bl ? safe(() => on.ov.handleClick(bl.x + 3, bl.y + 3)) : false;
  const lr = on.ov._consoleListRect, ir = on.ov._consoleInspRect;
  safe(() => on.ov.handleScroll(40, ir.x + 4, ir.y + 4));
  safe(() => on.ov.handleScroll(40, lr.x + 4, lr.y + 4));
  window.innerWidth = iw; window.innerHeight = ih;
  assert(hit === true && on.ov._budgetLine === 'tax', 'S6 klik konsoli przy podmienionym innerWidth trafia (geometria ze stref)');
  assert(on.ov._kitScrollInsp === 20 && on.ov._kitScrollList === 20, 'S7 kółko: inspektor i lista przewijane osobno ze stref ostatniej klatki');
  const s = src('../../ui/EconomyOverlay.js');
  const kitBlocks = [...s.matchAll(/if \(kitPage\(\)\) \{([\s\S]*?)\n    \}/g)].map((m) => m[1]);
  assert(kitBlocks.length >= 2 && kitBlocks.every((b) => !/window\.inner/.test(b)), `S8 źródło: gałęzie kitPage w handlerach bez window.inner* (${kitBlocks.length})`);
}

// ═══ T / N — Finding 725, surowe id, wzory ═══════════════════════════════════════════════════════════════════════
console.log('T/N — 725, id, wzory');
{
  makeWorld(); setEco(false);
  const ov = makeOverlay('budget');
  const pl = { 0.02: '✓ Dotacja konsumpcji +6%', 0.08: '● Neutralne', 0.16: '⚠ Konsumpcja -12%', 0.24: '✗ Konsumpcja -37% — ryzyko protestu' };
  for (const [r, exp] of Object.entries(pl)) assert(ov._getTaxEffectLabel(Number(r)) === exp, `T1 PL efekt podatku ${r}: „${exp}” (tekst bez zmian)`);
  setLocale('en');
  assert(ov._getTaxEffectLabel(0.24) === '✗ Consumption -37% — protest risk' && ov._getTaxEffectLabel(0.08) === '● Neutral', 'T2 EN efekt podatku przetłumaczony');
  setLocale('pl');
  const s = src('../../ui/EconomyOverlay.js');
  assert(!/isPL/.test(s) && /econPanel\.taxEffect/.test(src('../../ui/EconomyConsoleLogic.js')), 'T3 źródło: bez gałęzi isPL; klucze econPanel.taxEffect.*');
  for (const page of ['budget', 'flows']) {
    makeWorld();
    const on = render(page, true);
    const raw = on.texts.filter((x) => /\b[a-z]+_[a-z_]+\b/.test(x));
    assert(isKit(on) && on.texts.length > 10 && raw.length === 0, `T4 ${page}: tekst konsoli bez surowych id snake_case${raw.length ? ' — ' + raw.slice(0, 3).join(' | ') : ''}`);
  }
  makeWorld();
  const offB = render('budget', false);
  assert(offB.texts.some((x) => /_/.test(x) === false), 'T5 kontrola: ścieżka OFF rysuje tekst (atrapa działa)');
}
if (ECL) {
  const w = makeWorld();
  const ov = makeOverlay('budget');
  const d = ov._gatherBudgetData();
  const netOld = d.totalCreditsPerYear + d.taxIncome - d.totalUnitUpkeep - d.totalFleetUpkeep - (d.totalLaborCost ?? 0);
  assert(Math.abs(ECL.budgetNet(d) - netOld) < 1e-9 && Math.abs(ECL.budgetTotals(d).net - netOld) < 1e-9, `N1 netto = dzisiejszy wzór (${netOld.toFixed(1)})`);
  const lines = ECL.budgetLines(d).filter((l) => !l.group);
  assert(['trade', 'tax', 'labor', 'units', 'fleet', 'fleet_reserve', 'treasury', 'research'].every((id) => lines.some((l) => l.id === id)),
    'N2 linie Budżetu: handel, podatki, płace, jednostki, flota + rezerwa, skarbiec, badania');
  const tk = ECL.budgetTicker(d.globalResources, (await import('../../data/ResourcesData.js')).ALL_RESOURCES);
  assert(tk.deficits[0]?.id === 'Fe' && tk.surpluses.some((s) => s.id === 'food'), 'N3 ticker: Fe w deficytach, żywność w nadwyżkach (dzisiejsze filtry)');
  const dia = ECL.flowDiagram({ producers: { a: 5, b: 1 }, consumers: { c: 9 } });
  assert(dia.bottleneck === true && dia.net === -3 && Math.abs(dia.cons[0].frac - 1) < 1e-9, 'N4 diagram: konsumpcja > produkcja = wąskie gardło, pasmo pełne = 1');
  const many = ECL.flowDiagram({ producers: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`p${i}`, 9 - i])), consumers: {} }, 6);
  assert(many.prod.length === 6 && many.prod[5].type === '__more' && many.prod[5].count === 4, 'N5 diagram: ponad 6 węzłów → węzeł zbiorczy (+4)');
  assert(ECL.taxRateFromX(150, 100, 200) === 0.06 && ECL.taxRateFromX(-5, 100, 200) === 0, 'N6 stawka z X: ta sama reguła (klamra, krok 1 %)');
  void w;
} else assert(false, 'N EconomyConsoleLogic importuje się');

Object.assign(F, saved);
console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail) process.exit(1);
