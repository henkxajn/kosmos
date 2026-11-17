// ARC KONSOLE K3 — keeper konsoli grupy Ekonomii, część A: Budżet + Przepływy (docs/design/CONSOLES_PLAN.md §1.2, D-K-15, D-K-16,
// D-K-20; Finding 725 — efekt podatku).
//
// KZ-E — grupa Ekonomii jest konsolą na stałe (flaga usunięta, stara strona usunięta). Dawne porównania ON == OFF / ON ⊇ OFF
// zamienione na piny bezwzględne, wartości zmierzone na dzisiejszej ścieżce (= stara ścieżka ON; dziennik rysunku równy bajt
// w bajt przed / po KZ-E). Żadna akcja nie traci pokrycia.
//
// A — inwentarz typów stref na stronę i stan (globalnie, wybrana kolonia, wybrana stacja): Budżet ⊇ `tab`, `close`,
//     `budget_line`, `tax_slider`; Przepływy ⊇ `tab`, `close`, `flow_res`, `toggle_cat`, `resource_hover`. Skutki handlerów:
//     `tax_slider` — stawka z względnej pozycji X (0.2 → 0.05, 0.64 → 0.16, 1 → 0.25; świadek: stawka startowa 0.08 inna);
//     `flow_res` — id w kolejności Fe, food, water (świat-atrapa), klik wybiera zasób; `budget_line` — klik wybiera linię.
// D — D-K-16: żadna linia dawnej lewej kolumny nie znika — oczekiwany zbiór linii na stan (dane dzisiejsze: surowce wydobywalne +
//     zbieralne + bilans energii; globalnie — towary z zapasem w świecie-atrapie; wybrana kolonia / stacja — wszystkie towary)
//     jest w górnej szufladzie (zbiór z WYKONANIA `TopResourceDrawer._colonyTokens`) albo w bloku inspektora Przepływów (strefy
//     `resource_hover`); wybrana stacja — wyłącznie w bloku (szuflada pokazuje kolonie). Globalnie ze stacją-sierotą: każda linia
//     magazynu stacji z zapasem w bloku. Świadkowie: towar spoza paliwa w bloku; linia magazynu stacji (Cu) w bloku.
// G — czipy grupy [ BUDŻET ] [ PRODUKCJA ] [ HANDEL ] [ RYNEK ] [ PRZEPŁYWY ]: kolejność, klik → openPanel z właściwym id, HANDEL / RYNEK
//     ustawiają zakładkę Handlu, reszta stanu Handlu zostaje; brak pasa subnav nad Budżetem, Przepływami, Produkcją i Handlem —
//     także przy `consoleKit` = false (kontrola: Wywiad / Dyplomacja / Wojna mają wtedy pas). Trwałość: `isKitScreen` zwraca true
//     dla budget / flows / trade / economy bez flag i przy `consoleKit` = false; intel / shipyard / diplomacy / war nadal wymagają
//     swoich flag (kontrola).
// P — Produkcja jest konsolą: strefy konsoli, inwentarz ⊇ `tab`, `close`, `prod_scope_toggle`, `prod_good`; keeper
//     `console_production_smoke.mjs` pinuje resztę Produkcji.
// S — geometria: strefy w ramie konsoli przy 1600×1041 i 1280×833 (wiersze w prostokącie listy, suwak w bohaterze, blok w
//     inspektorze); wejście konsoli (klik / kółko) bez window.inner* — handler wykonany przy podmienionym innerWidth; źródło:
//     ciała handleClick / handleScroll / handleMouseMove (bez komentarzy, niepuste — świadek) bez window.inner.
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
const saved = { consoleKit: F.consoleKit };
F.consoleKit = true;   // warunek bazowy (scena za tekstem); grupa Ekonomii od niego nie zależy — pin G10 / G11

// ── atrapa płótna: zapis tekstów + pełny dziennik wywołań ──
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
function render(page, { W = 1600, H = 1041, selected = null, negNet = false } = {}) {
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
// świadek: render naprawdę jest konsolą (strefy konsoli zapisane)
const isKit = (r) => !!r?.ov?.consoleZones;
const idsOf = (zs, type, key) => zs.filter((z) => z.type === type).map((z) => z.data?.[key]);

// ═══ A — inwentarz akcji i skutki handlerów (piny bezwzględne, KZ-E) ════════════════════════════════════════════
console.log('A — akcje konsoli');
// stany: globalnie, wybrana kolonia, wybrana stacja-sierota (świat ze stacją)
const A_STATES = [null, 'col_a', 'st_1'];
const A_NEED = {
  budget: ['tab', 'close', 'budget_line', 'tax_slider'],
  flows: ['tab', 'close', 'flow_res', 'toggle_cat', 'resource_hover'],
};
if (!EO) { assert(false, 'A EconomyOverlay importuje się'); } else {
  for (const [page, need] of Object.entries(A_NEED)) {
    for (const sel of A_STATES) {
      makeWorld({ withStation: true });
      const r = render(page, { selected: sel });
      const ty = types(r.zones);
      const miss = need.filter((q) => !ty.has(q));
      assert(isKit(r) && miss.length === 0, `A1 ${page} · ${sel ?? 'globalnie'}: strefy ⊇ ${need.join(', ')}${miss.length ? ' — brak: ' + miss.join(',') : ''}`);
    }
  }
  makeWorld();
  const bOn = render('budget');
  // skutek suwaka: względna pozycja X → stawka (klamra 0–0.25, krok 1 %); świadek: stawka startowa 0.08 różna od każdej oczekiwanej
  const effect = (frac) => {
    const w = makeWorld(); const z = bOn.zones.find((q) => q.type === 'tax_slider');
    if (!z || !(z.data?.barW > 0)) return null;
    window.KOSMOS.overlayManager.active = 'budget';
    const before = w.colMgr.taxRate;
    const x = z.data.barX + z.data.barW * frac, y = z.y + z.h / 2;
    safe(() => bOn.ov.handleClick(x, y));
    return { before, after: w.colMgr.taxRate };
  };
  for (const [frac, exp] of [[0.2, 0.05], [0.64, 0.16], [1, 0.25]]) {
    const e = effect(frac);
    assert(isKit(bOn) && e && e.before === 0.08 && e.after === exp, `A3 tax_slider przy ${frac}: stawka ${e?.before} → ${e?.after} (oczekiwana ${exp})`);
  }
  makeWorld();
  const fOn = render('flows');
  const fn = idsOf(fOn.zones, 'flow_res', 'resId');
  assert(isKit(fOn) && JSON.stringify(fn) === JSON.stringify(['Fe', 'food', 'water']), `A5 flow_res: id i kolejność Fe, food, water (${fn.join(',')})`);
  const last = fOn.zones.filter((z) => z.type === 'flow_res').pop();
  window.KOSMOS.overlayManager.active = 'flows';
  const selBefore = fOn.ov._flowSelectedResId;
  if (last) safe(() => fOn.ov.handleClick(last.x + 4, last.y + last.h / 2));
  assert(isKit(fOn) && last && selBefore !== last.data.resId && fOn.ov._flowSelectedResId === last.data.resId,
    `A7 klik wiersza flow_res wybiera zasób (${selBefore} → ${fOn.ov._flowSelectedResId})`);
  const bl = bOn.zones.filter((z) => z.type === 'budget_line').find((z) => z.data.lineId === 'fleet');
  window.KOSMOS.overlayManager.active = 'budget';
  const lineBefore = bOn.ov._budgetLine;
  if (bl) safe(() => bOn.ov.handleClick(bl.x + 4, bl.y + bl.h / 2));
  assert(lineBefore !== 'fleet' && bOn.ov._budgetLine === 'fleet', `A8 klik linii Budżetu wybiera linię (${lineBefore} → ${bOn.ov._budgetLine})`);
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
// oczekiwane linie dawnej lewej kolumny (zmierzone na bazie 762726c, wyrażone danymi dzisiejszymi — bez renderu starej strony):
// surowce wydobywalne + zbieralne + bilans energii; globalnie — towary z zapasem w świecie-atrapie (COM_X, paliwo; magazyn
// stacji-sieroty Cu / paliwo / COM_X mieści się w tym zbiorze); wybrana kolonia / stacja — wszystkie towary
const idList = (x) => (Array.isArray(x) ? x.map((r) => r?.id ?? r) : Object.keys(x ?? {}));
const BASE_LINES = [...idList(MINED_RESOURCES), ...idList(HARVESTED_RESOURCES), 'energy'];
const ALL_GOODS = Object.keys(COMMODITIES);
const STATION_DEPOT = ['Cu', 'fuel', COM_X];   // magazyn st_1 z zapasem (świat-atrapa)
assert(BASE_LINES.includes('Fe') && BASE_LINES.includes('food') && ALL_GOODS.includes(COM_X) && ALL_GOODS.includes('fuel') && COM_X !== 'fuel',
  `D1b świadek: oczekiwany zbiór niepusty (${BASE_LINES.length} linii bazowych, ${ALL_GOODS.length} towarów, towar spoza paliwa ${COM_X})`);
const states = [
  { name: 'globalnie', withStation: false, selected: null, expect: [...BASE_LINES, COM_X, 'fuel'] },
  { name: 'globalnie + stacja-sierota', withStation: true, selected: null, expect: [...BASE_LINES, COM_X, 'fuel', ...STATION_DEPOT] },
  { name: 'wybrana kolonia', withStation: true, selected: 'col_a', expect: [...BASE_LINES, ...ALL_GOODS] },
  // stacja nie ma systemu energii — bez bilansu energii
  { name: 'wybrana stacja', withStation: true, selected: 'st_1', expect: [...BASE_LINES.filter((i) => i !== 'energy'), ...ALL_GOODS] },
];
let witnessGood = false, witnessStation = false;
for (const s of states) {
  makeWorld({ withStation: s.withStation });
  // polerka K3 (uwaga 2): blok magazynu tylko na Przepływach — linia osiągalna w szufladzie albo w bloku Przepływów
  const on = render('flows', { H: 5000, selected: s.selected });
  const blockIds = new Set(idsOf(on.zones, 'resource_hover', 'resourceId'));
  const stationSel = s.selected === 'st_1';
  // stacja wybrana: szuflada pokazuje tylko kolonie → każda linia stacji musi stać w bloku; inaczej — w szufladzie albo w bloku
  const exp = [...new Set(s.expect)];
  const missing = exp.filter((id) => (stationSel ? !blockIds.has(id) : !(drawerIdsExec?.has(id) || blockIds.has(id))));
  assert(isKit(on) && exp.length > 3 && missing.length === 0, `D2 ${s.name}: każda oczekiwana linia (${exp.length}) w szufladzie lub bloku${missing.length ? ' — brak: ' + missing.join(',') : ''}`);
  if (isKit(on) && !s.selected && blockIds.has(COM_X)) witnessGood = true;
  if (isKit(on) && s.withStation && !s.selected && blockIds.has('Cu')) witnessStation = true;
  if (s.withStation && !s.selected) {
    const missSt = STATION_DEPOT.filter((id) => !blockIds.has(id));
    assert(isKit(on) && missSt.length === 0, `D2b ${s.name}: każda linia magazynu stacji (${STATION_DEPOT.join(', ')}) w bloku${missSt.length ? ' — brak: ' + missSt.join(',') : ''}`);
  }
  const tc = on.zones.filter((z) => z.type === 'toggle_cat');
  assert(tc.length > 0 && tc.every((z) => z.data.catKey === 'commodities'),
    `D3 ${s.name}: toggle_cat tylko dla towarów (wydobywalne / zbieralne są w szufladzie; ${tc.length} stref)`);
}
assert(witnessGood, `D4 świadek: towar spoza paliwa (${COM_X}) jest w bloku Przepływów (globalnie)`);
assert(witnessStation, 'D5 świadek: magazyn stacji-sieroty (Cu) jest w bloku Przepływów (globalnie)');
{
  makeWorld({ withStation: true });
  const on = render('flows', { H: 5000, selected: 'st_1' });
  const blockIds = new Set(idsOf(on.zones, 'resource_hover', 'resourceId'));
  assert(isKit(on) && blockIds.has('Cu') && blockIds.has('fuel'), 'D6 wybrana stacja: jej linie z zapasem (Cu, paliwo) w bloku (Przepływy)');
}
{
  // D7 — polerka K3 (uwaga 2): Budżet nie ma bloku magazynu (świadek: Przepływy go mają)
  makeWorld({ withStation: true });
  const bud = render('budget', { H: 5000 });
  makeWorld({ withStation: true });
  const flo = render('flows', { H: 5000 });
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
  const on = render('budget', { negNet: true });
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
  const on = render('flows');
  assert(isKit(on) && (on.gradients ?? 0) > 0, `L5 wykonanie: lokalne przyciemnienie K1c-B pod środkiem (${on.gradients ?? 0} gradient)`);
}

// ═══ G — czipy grupy i subnav ════════════════════════════════════════════════════════════════════════════════════
console.log('G — czipy grupy');
{
  const w = makeWorld();
  const on = render('budget');
  const tabs = on.zones.filter((z) => z.type === 'tab').map((z) => z.data.id);
  assert(JSON.stringify(tabs) === JSON.stringify(['budget', 'economy', 'trade', 'market', 'flows']), `G1 czipy w kolejności: ${tabs.join(',')}`);
  const click = (id, from = 'budget') => {
    const ww = makeWorld();
    const r = render(from);
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
  // subnav — grupa Ekonomii bez pasa, także przy consoleKit = false (KZ-E: trwałe ekrany zestawu)
  if (CPD) {
    const ECO_IDS = ['budget', 'flows', 'economy', 'trade'];
    const subnav = (id) => { window.KOSMOS.overlayManager.active = id; return CPD.getSubNavHeight(); };
    makeWorld();
    const kitOn = ECO_IDS.map(subnav);
    assert(kitOn.every((h) => h === 0), `G8 consoleKit ON: brak pasa subnav nad Budżetem, Przepływami, Produkcją, Handlem (${kitOn.join(', ')})`);
    F.consoleKit = false;
    const kitOff = ECO_IDS.map(subnav);
    // kontrola: te same warunki, ekrany z flagą zestawu (Wywiad / Dyplomacja / Wojna) mają wtedy pas
    const ctrl = ['intel', 'diplomacy', 'war'].map(subnav);
    F.consoleKit = true;
    // świadek: id Ekonomii są w grupie nawigacji (bez trwałości dostałyby pas)
    const grouped = ECO_IDS.every((id) => CPD.isGroupedId?.(id) === true);
    assert(grouped && kitOff.every((h) => h === 0), `G9 consoleKit OFF: nadal brak pasa nad grupą Ekonomii (${kitOff.join(', ')}; id w grupie: ${grouped})`);
    assert(ctrl.every((h) => h > 0), `G9b kontrola: consoleKit OFF — Wywiad / Dyplomacja / Wojna mają pas (${ctrl.join(', ')})`);
  } else assert(false, 'G8 CivPanelDrawer importuje się');
  // trwałość: isKitScreen bez flag
  if (CL?.isKitScreen) {
    const ECO_IDS = ['budget', 'flows', 'trade', 'economy'];
    const noFlags = ECO_IDS.filter((id) => CL.isKitScreen(id, {}) !== true || CL.isKitScreen(id, { consoleKit: false }) !== true
      || CL.isKitScreen(id, undefined) !== true);
    assert(noFlags.length === 0, `G10 isKitScreen(budget / flows / trade / economy) = true bez flag i przy consoleKit false${noFlags.length ? ' — nie: ' + noFlags.join(',') : ''}`);
    const OTHER = ['intel', 'shipyard', 'diplomacy', 'war'];
    const allOn = { consoleKit: true, consoleIntel: true, consoleShipyard: true, consoleDiplomacy: true };
    const ctrlBad = OTHER.filter((id) => CL.isKitScreen(id, {}) !== false || CL.isKitScreen(id, { ...allOn, consoleKit: false }) !== false
      || CL.isKitScreen(id, allOn) !== true);
    assert(ctrlBad.length === 0, `G11 kontrola: intel / shipyard / diplomacy / war nadal wymagają flag (bez flag false, z flagami true)${ctrlBad.length ? ' — źle: ' + ctrlBad.join(',') : ''}`);
  } else assert(false, 'G10 ConsoleLayoutLogic.isKitScreen importuje się');
}

// ═══ P — Produkcja jest konsolą ═══════════════════════════════════════════════════════════════════════════════════
console.log('P — Produkcja: konsola');
{
  for (const sel of A_STATES) {
    makeWorld({ withStation: true });
    const on = render('economy', { selected: sel });
    const need = ['tab', 'close', 'prod_scope_toggle', 'prod_good'];
    const ty = types(on.zones);
    const miss = need.filter((q) => !ty.has(q));
    assert(isKit(on) && on.log.length > 50 && miss.length === 0,
      `P1 Produkcja · ${sel ?? 'globalnie'}: konsola, strefy ⊇ ${need.join(', ')}${miss.length ? ' — brak: ' + miss.join(',') : ''}`);
  }
}

// ═══ S — geometria i wejście ═════════════════════════════════════════════════════════════════════════════════════
console.log('S — geometria');
const inside = (r, f) => r.x >= f.x - 0.5 && r.y >= f.y - 0.5 && r.x + r.w <= f.x + f.w + 0.5 && r.y + r.h <= f.y + f.h + 0.5;
for (const [W, H] of [[1600, 1041], [1280, 833]]) {
  for (const page of ['budget', 'flows']) {
    makeWorld();
    const on = render(page, { W, H });
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
  const on = render('budget');
  const iw = window.innerWidth, ih = window.innerHeight;
  window.innerWidth = 333; window.innerHeight = 222;
  const bl = on.zones.find((q) => q.type === 'budget_line' && q.data.lineId === 'tax');
  window.KOSMOS.overlayManager.active = 'budget';
  const hit = bl ? safe(() => on.ov.handleClick(bl.x + 3, bl.y + 3)) : false;
  const lr = on.ov._consoleListRect, ir = on.ov._consoleInspRect;
  safe(() => on.ov.handleScroll(40, ir.x + 4, ir.y + 4));
  safe(() => on.ov.handleScroll(40, lr.x + 4, lr.y + 4));
  window.innerWidth = iw; window.innerHeight = ih;
  assert(hit === true && on.ov._budgetLine === 'tax', 'S6 klik konsoli przy podmienionym innerWidth trafia (geometria ze stref)');
  assert(on.ov._kitScrollInsp === 20 && on.ov._kitScrollList === 20, 'S7 kółko: inspektor i lista przewijane osobno ze stref ostatniej klatki');
  // źródło: ciała handlerów wejścia (komentarze zdjęte) — geometria tylko ze stref ostatniej klatki / _uiScale
  const s = src('../../ui/EconomyOverlay.js').replace(/\/\*[\s\S]*?\*\//g, '');
  const body = (name) => {
    const m = new RegExp(`\\n  ${name}\\([^)]*\\) \\{`).exec(s);
    if (!m) return '';
    let i = m.index + m[0].length, depth = 1;
    const start = i;
    for (; i < s.length && depth > 0; i++) { if (s[i] === '{') depth++; else if (s[i] === '}') depth--; }
    return s.slice(start, i - 1);
  };
  const bodies = { handleClick: body('handleClick'), handleScroll: body('handleScroll'), handleMouseMove: body('handleMouseMove') };
  // świadek: wyciągnięte ciała niepuste i czytają swoje źródło geometrii
  const wit = /consoleZones/.test(bodies.handleClick) && /consoleZones/.test(bodies.handleScroll) && /_uiScale/.test(bodies.handleMouseMove);
  const dirty = Object.entries(bodies).filter(([, b]) => /window\.inner/.test(b)).map(([k]) => k);
  assert(wit && dirty.length === 0, `S8 źródło: handleClick / handleScroll / handleMouseMove bez window.inner* (długości ${Object.values(bodies).map((b) => b.length).join('/')})${dirty.length ? ' — w: ' + dirty.join(',') : ''}`);
}

// ═══ T / N — Finding 725, surowe id, wzory ═══════════════════════════════════════════════════════════════════════
console.log('T/N — 725, id, wzory');
{
  makeWorld();
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
    const on = render(page);
    const raw = on.texts.filter((x) => /\b[a-z]+_[a-z_]+\b/.test(x));
    assert(isKit(on) && on.texts.length > 10 && raw.length === 0, `T4 ${page}: tekst konsoli bez surowych id snake_case${raw.length ? ' — ' + raw.slice(0, 3).join(' | ') : ''}`);
  }
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
