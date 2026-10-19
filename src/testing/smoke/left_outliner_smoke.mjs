// ═══════════════════════════════════════════════════════════════════════════════
// left_outliner_smoke — KEEPER ARKUSZA UI, U2 (lewy outliner)
// Rejestr: `docs/design/UI_PLAN.md` §4.3, §5 (decyzje 3, 4, 5), §7.5, §7.8–§7.10, §7.12, §7.17.
// ─────────────────────────────────────────────────────────────────────────────
// WYKONANIE prawdziwego `LeftOutliner` (`draw` na atrapie ctx z rejestrem napisów i prostokątów, `hitTest`,
// `handleWheel`, `updateHover`) na świecie w EntityManagerze; prawdziwe `MapInsets` i ich konsumenci, którzy importują
// się pod node (`FleetGroupPanel`, `FleetCommandPanel`, `PanelDock`, `BottomContext`, `StationPanel`, kadr „Obserwuj”
// `watchSafeRect`). `UIManager` i `ThreeRenderer` nie importują się pod node (THREE) — montaż i ich wcięcia: piny
// źródłowe (komentarze zdjęte).
//
// PINY (krok U2-2):
//   L1  decyzja 4 — tabela `leftOutlinerShown` (tryb cywilizacji, globus, stan użytkownika, overlay, rozwinięty Dok)
//   L2  `draw`: geometria §7.17 (x 0, od dolnej krawędzi belki do górnej krawędzi paska nawigacji), tło
//       półprzezroczyste, nagłówek „UKŁADY [n]”, wiersze układów w kolejności drzewa, ciała tylko w rozwiniętym
//       (bieżącym) układzie, „○” przy ciele nierozpoznanym
//   L3  `hitTest` — intencje (reguła U1): strzałka = zwiń / rozwiń (bez przełączania); klik w inny układ =
//       `switchActiveSystem`; w bieżący = `resetToSystemView`; ciało: 1. klik zaznaczenie bez kamery, 2. klik focus;
//       ciało z innego układu wg §7.8; ciało z kolonią nie zmienia aktywnej kolonii (§7.10); klik poza kolumną nie
//       pochłonięty
//   L4  D-UI-10 (ciała): wiersz zaznaczonego ciała podświetlony; zaznaczenie z mapy rozwija zwinięty układ i przewija do
//       wiersza (§7.12); zaznaczenie w bieżącym układzie nie zostawia jawnego stanu zwinięcia; D-UI-4 — jawny stan
//       tylko tam, gdzie różni się od domyślnego (▸ i ▾ na innym układzie — po przejściu do niego rozwinięty)
//   L5  wcięcia `MapInsets` + konsumenci: lewa krawędź za outlinerem (150), gdy widoczny; 0, gdy ukryty (overlay,
//       rozwinięty Dok, stan użytkownika, poza trybem cywilizacji); dół bez zmian; kadr „Obserwuj” z `leftW`
//   L6  `isOver` / kółko / najechanie
//   L7  montaż w `UIManager` (piny źródłowe): konstrukcja, `KOSMOS.leftOutliner`, blokada kamery, kolejność kliku (POD
//       listą kolonii z belki i dziennikiem), kolejność rysowania (przed listą kolonii i pływającymi panelami), kółko,
//       najechanie, bez podpowiedzi mapy 3D pod kolumną; panel statku z `MapInsets`; renderer — `leftW` kadru
//
// ⚠ Moduły POWSTAJĄ w U2-2 — importy dynamiczne w try/catch (pin DEGRADUJE, nie przerywa suity przy fail-first).
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import EventBus      from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { THEME, bgAlpha } from '../../config/ThemeConfig.js';
import { t, setLocale } from '../../i18n/i18n.js';

let LO = null, MI = null;
try { LO = await import('../../ui/LeftOutliner.js'); } catch { /* piny padną */ }
try { MI = await import('../../ui/MapInsets.js'); } catch { /* piny padną */ }

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const body = (code, sig) => { const i = code.indexOf(sig); return i < 0 ? '' : code.slice(i, code.indexOf('\n  }\n', i) + 4); };

setLocale('pl');
const W = 1280, H = 720;

/** Atrapa ctx: rejestr napisów i prostokątów z bieżącym `fillStyle`; `measureText` — 6 px na znak. */
const recCtx = () => {
  const calls = { text: [], rects: [] };
  let fillStyle = '#000';
  return new Proxy({}, {
    get(o, k) {
      if (k === '_calls') return calls;
      if (k === 'fillStyle') return fillStyle;
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'fillText') return (s, x, y) => { calls.text.push({ s: String(s), x, y, fillStyle }); };
      if (k === 'fillRect') return (x, y, w, h) => { calls.rects.push({ x, y, w, h, fillStyle }); };
      if (k in o) return o[k];
      return () => {};
    },
    set(o, k, v) { if (k === 'fillStyle') fillStyle = v; else o[k] = v; return true; },
  });
};

// ── Świat: dwa układy, ciała w EntityManagerze, stuby rejestrów gry ──────────────────────────────────────────────
const evs = [], ops = [];
for (const ev of ['body:selected', 'body:deselected', 'vessel:focus', 'station:selected', 'station:focus']) EventBus.on(ev, (p) => evs.push([ev, p]));
const P1 = { id: 'P1', type: 'planet', name: 'Mstow', systemId: 'sys_home', orbital: { a: 1.0 }, explored: true };
const M1 = { id: 'M1', type: 'moon', name: 'Wancerzow', systemId: 'sys_home', parentPlanetId: 'P1', orbital: { a: 0.04 }, explored: true };
const D1 = { id: 'D1', type: 'planetoid', name: 'Plt-7', systemId: 'sys_home', orbital: { a: 2.0 }, explored: false };
const PA = { id: 'PA', type: 'planet', name: 'Alioth b', systemId: 'sys_A', orbital: { a: 1.0 }, explored: true };
const STARS = [{ id: 'star_h', type: 'star', name: 'TOI-4493', systemId: 'sys_home' }, { id: 'star_a', type: 'star', name: 'Alioth', systemId: 'sys_A' }];
const resetWorld = (extra = []) => {
  EntityManager.clear?.();
  for (const e of [...STARS, P1, M1, D1, PA, ...extra]) EntityManager.add(e);
};
resetWorld();
const SYSTEMS = [
  { systemId: 'sys_home', galaxyStar: null },
  { systemId: 'sys_A', explored: true, galaxyStar: { id: 'sys_A', name: 'Alioth', distanceLY: 4.6, explored: true } },
];
const COLONIES = [{ planetId: 'P1', name: 'Mstow', isOutpost: false, isHomePlanet: true, ownerEmpireId: null, planet: P1 }];
let overlayOpen = false, dockExpanded = false, dockRes = 0;
const UM = {
  _selectedEntity: null,
  getSelectedVesselIds: () => [], getSelectedVesselId: () => null, getSelectedFleetId: () => null,
  setSelectedVesselId: (id) => ops.push(['select', id]),
  overlayManager: { isAnyOpen: () => overlayOpen, openPanel: (id, o) => ops.push(['openPanel', id, o ?? null]) },
};
const SSM = {
  activeSystemId: 'sys_home',
  getAllSystems: () => SYSTEMS,
  switchActiveSystem(s) { ops.push(['switch', s]); this.activeSystemId = s; globalThis.window.KOSMOS.activeSystemId = s; return true; },
};
Object.assign(globalThis.window.KOSMOS, {
  civMode: true, planetGlobeOpen: false, activeSystemId: 'sys_home',
  uiManager: UM, starSystemManager: SSM,
  threeRenderer: { _pingedEnemyId: null, resetToSystemView: () => { ops.push(['reset']); return true; } },
  stationPanel: { visible: false, _stationId: null, _float: { minimized: false } },
  tacticalDock: { isExpanded: () => dockExpanded, getReservedHeight: () => dockRes },
  colonyManager: { getAllColonies: () => COLONIES, getColony: (id) => COLONIES.find((c) => c.planetId === id) ?? null,
    switchActiveColony: (id) => ops.push(['switchActiveColony', id]), activePlanetId: 'P1' },
  stationSystem: { getAllStations: () => [] },
});
const K = globalThis.window.KOSMOS;
const reset = (o = {}) => {
  evs.length = 0; ops.length = 0;
  UM._selectedEntity = o.entity ?? null;
  overlayOpen = !!o.overlay; dockExpanded = !!o.dockExp; dockRes = o.dockRes ?? 0;
  SSM.activeSystemId = o.active ?? 'sys_home'; K.activeSystemId = SSM.activeSystemId;
  K.civMode = o.civ ?? true;
};
const LeftOutliner = LO?.LeftOutliner;
const newLO = () => { const lo = LeftOutliner ? new LeftOutliner() : null; K.leftOutliner = lo; return lo; };
const draw = (lo, ctx = recCtx()) => { const tr = lo?.draw?.(ctx, W, H, { colonies: COLONIES, groundUnits: [] }); return { tr, ctx }; };
const target = (lo, type, id) => (lo?._clickTargets ?? []).find((z) => z.type === type && (z.systemId === id || z.bodyId === id)) ?? null;
const clickAt = (lo, z, dx = 60) => (z ? lo?.hitTest?.(z.x + dx, z.y + z.h / 2, W, H) : null);

// ═══ L1 ═══════════════════════════════════════════════════════════════════════
header('L1  decyzja 4 — kiedy lewy outliner jest nad mapą');
{
  const f = LO?.leftOutlinerShown;
  ok(typeof f === 'function', 'L1-0 `leftOutlinerShown` istnieje');
  const s = (o) => (typeof f === 'function' ? f({ civMode: true, globeOpen: false, userVisible: true, overlayOpen: false, dockExpanded: false, ...o }) : null);
  ok(s({}) === true, 'L1a tryb cywilizacji, sama mapa — widoczny');
  ok(s({ overlayOpen: true }) === false && s({ dockExpanded: true }) === false,
    'L1b SEDNO: overlay pełnoekranowy otwarty albo Dok taktyczny rozwinięty — ukryty (decyzja 4)');
  ok(s({ userVisible: false }) === false && s({ civMode: false }) === false && s({ globeOpen: true }) === false,
    'L1c stan użytkownika „ukryty”, poza trybem cywilizacji, podgląd globusa — ukryty');
}

// ═══ L2 ═══════════════════════════════════════════════════════════════════════
header('L2  draw — geometria (§7.17), nagłówek, wiersze, „○”');
{
  reset(); const lo = newLO();
  const { tr, ctx } = draw(lo);
  const c = ctx._calls;
  ok(!!tr && Array.isArray(tr.systems) && tr.systems.length === 2, 'L2-0 `draw` zwraca drzewo z tej klatki (2 układy)');
  const bg = c.rects.find((r) => r.x === 0 && r.w === 150);
  ok(!!bg && bg.y === 28 && bg.h === 720 - 28 - 42, `L2a kolumna 150 px od y 28 (dół górnej belki) do górnej krawędzi paska nawigacji (y ${720 - 42}) — jest ${bg ? `${bg.y}+${bg.h}` : '—'}`);
  ok(!!bg && bg.fillStyle === bgAlpha(0.6), `L2b tło półprzezroczyste \`bgAlpha(0.6)\` (jest ${bg?.fillStyle})`);
  const text = c.text.map((x) => x.s);
  ok(text.includes(t('leftOutliner.systems', 2).toUpperCase()) && text.includes('UKŁADY [2]'), 'L2c nagłówek „UKŁADY [2]” (i18n)');
  const sysT = (lo?._clickTargets ?? []).filter((z) => z.type === 'system').map((z) => z.systemId);
  ok(sysT.join(' ') === 'sys_home sys_A', 'L2d wiersze układów w kolejności drzewa (dom, potem reszta)');
  const bodies = (lo?._clickTargets ?? []).filter((z) => z.type === 'body').map((z) => z.bodyId);
  ok(bodies.join(' ') === 'P1 M1 D1', `L2e ciała tylko w rozwiniętym (bieżącym) układzie: P1, księżyc M1, planetoida D1 (jest ${bodies.join(' ')})`);
  const tM1 = target(lo, 'body', 'M1'), tP1 = target(lo, 'body', 'P1');
  const txM1 = c.text.find((x) => x.s === 'Wancerzow'), txP1 = c.text.find((x) => x.s === 'Mstow');
  ok(!!txM1 && !!txP1 && txM1.x > txP1.x && !!tM1 && !!tP1 && tM1.y > tP1.y, 'L2f księżyc wcięty pod planetą');
  ok(text.includes('○') && !!c.text.find((x) => x.s === 'Plt-7' && x.fillStyle === THEME.textDim), 'L2g ciało nierozpoznane z „○” (decyzja 5 (b))');
  ok(text.includes('TOI-4493') && text.includes('Alioth'), 'L2h nazwy układów = nazwy gwiazd');
}

// ═══ L3 ═══════════════════════════════════════════════════════════════════════
header('L3  hitTest — intencje klików (reguła U1)');
{
  reset(); const lo = newLO(); draw(lo);
  const tA = target(lo, 'system', 'sys_A');
  reset(); const r0 = tA ? lo.hitTest(tA.x + 6, tA.y + 9, W, H) : null;
  ok(r0 === true && ops.length === 0 && lo?.isExpanded?.('sys_A', 'sys_home') === true, 'L3a strzałka układu → rozwiń, BEZ przełączania układu');
  draw(lo);
  ok(!!target(lo, 'body', 'PA'), 'L3b … po rozwinięciu ciała innego układu na liście');
  reset(); clickAt(lo, target(lo, 'system', 'sys_A'));
  ok(JSON.stringify(ops) === '[["switch","sys_A"]]', 'L3c SEDNO: klik w INNY układ → `switchActiveSystem` (D-UI-5)');
  reset(); lo?._expanded?.clear?.(); draw(lo);
  clickAt(lo, target(lo, 'system', 'sys_home'));
  ok(JSON.stringify(ops) === '[["reset"]]', 'L3d klik w BIEŻĄCY układ → `resetToSystemView` (§7.9)');
  reset(); clickAt(lo, target(lo, 'body', 'P1'));
  ok(evs.length === 1 && evs[0][0] === 'body:selected' && evs[0][1]?.entity?.id === 'P1' && evs[0][1]?.focus === false && ops.length === 0,
    'L3e SEDNO: ciało, 1. klik → `body:selected { focus: false }` (karta, kamera stoi)');
  ok(evs.length === 1 && evs[0][0] === 'body:selected' && !ops.some((o) => o[0] === 'switchActiveColony'),
    'L3f ciało z kolonią: klik obsłużony (`body:selected`), aktywna kolonia BEZ zmiany (§7.10)');
  reset({ entity: P1 }); clickAt(lo, target(lo, 'body', 'P1'));
  ok(evs.length === 1 && evs[0][1]?.focus === true, 'L3g ciało zaznaczone (karta), 2. klik → `body:selected { focus: true }`');
  reset(); lo?._expanded?.set?.('sys_A', true); draw(lo);
  clickAt(lo, target(lo, 'body', 'PA'));
  ok(evs[0]?.[1]?.focus === false && !ops.some((o) => o[0] === 'switch'), 'L3h ciało z INNEGO układu, 1. klik → bez przełączania (§7.8)');
  reset({ entity: PA }); clickAt(lo, target(lo, 'body', 'PA'));
  ok(JSON.stringify(ops) === '[["switch","sys_A"]]' && evs.length === 1 && evs[0][1]?.entity?.id === 'PA' && evs[0][1]?.focus === true,
    'L3i … 2. klik → przełączenie układu, potem kamera');
  reset(); const hd = (lo?._clickTargets ?? []).find((z) => z.type === 'header');
  ok(!!hd && lo.hitTest(hd.x + 20, hd.y + 5, W, H) === true && ops.length === 0 && evs.length === 0, 'L3j nagłówek — klik pochłonięty, bez akcji');
  ok(!!lo && lo.hitTest(200, 300, W, H) === false && lo.hitTest(75, 10, W, H) === false, 'L3k KONTROLA: klik poza kolumną (mapa, górna belka) NIE pochłonięty');
  ok(!!lo && lo.hitTest(75, 640, W, H) === true && ops.length === 0, 'L3l puste miejsce w kolumnie — pochłonięty (nie przecieka na mapę)');
  reset({ overlay: true });
  ok(!!lo && lo.hitTest(75, 100, W, H) === false, 'L3m KONTROLA: przy otwartym overlayu outliner nie łapie klików (decyzja 4)');
}

// ═══ L4 ═══════════════════════════════════════════════════════════════════════
header('L4  D-UI-10 — podświetlenie i przewinięcie do zaznaczonego ciała (§7.12)');
{
  reset({ entity: P1 }); const lo = newLO();
  const { ctx } = draw(lo);
  const tP1 = target(lo, 'body', 'P1');
  const sel = ctx._calls.rects.find((r) => tP1 && r.y === tP1.y && r.fillStyle === THEME.accentMed);
  ok(!!sel, 'L4a SEDNO: wiersz zaznaczonego ciała (karta) podświetlony (`accentMed`)');
  reset(); const { ctx: c2 } = draw(lo);
  ok(!!tP1 && c2._calls.text.some((x) => x.s === 'Mstow') && !c2._calls.rects.some((r) => r.y === tP1.y && r.fillStyle === THEME.accentMed),
    'L4b bez zaznaczenia — wiersz narysowany, bez podświetlenia');
  reset(); lo?._expanded?.clear?.();
  EventBus.emit('body:selected', { entity: PA, focus: false });
  draw(lo);
  ok(lo?.isExpanded?.('sys_A', 'sys_home') === true && !!target(lo, 'body', 'PA'), 'L4c SEDNO: zaznaczenie ciała w zwiniętym układzie (z mapy / innej powierzchni) rozwija układ');
  lo?._expanded?.clear?.();
  EventBus.emit('body:selected', { entity: P1, focus: false });
  ok(!!lo?._expanded && !lo._expanded.has('sys_home'), 'L4d zaznaczenie w bieżącym (rozwiniętym) układzie — bez jawnego stanu (domyślne zwijanie po przejściu zostaje)');
  // D-UI-4 — jawny stan zwinięcia tylko tam, gdzie różni się od domyślnego (bieżący rozwinięty, reszta zwinięta).
  // Bramka U2 (przebieg walidatora, K3 → K11): ▸ i ▾ na Kochabie zostawiały jawne „zwinięty”, więc po przejściu do
  // Kochabu jego ciała były schowane.
  lo?._expanded?.clear?.();
  lo?.toggleExpanded?.('sys_A', 'sys_home'); lo?.toggleExpanded?.('sys_A', 'sys_home');
  ok(!!lo?._expanded && !lo._expanded.has('sys_A') && lo.isExpanded?.('sys_A', 'sys_A') === true,
    'L4g SEDNO: ▸ i ▾ na innym układzie — bez jawnego stanu; po przejściu do niego rozwinięty (reguła domyślna)');
  lo?.toggleExpanded?.('sys_home', 'sys_home');
  ok(lo?._expanded?.get?.('sys_home') === false && lo?.isExpanded?.('sys_home', 'sys_A') === false && lo?.isExpanded?.('sys_home', 'sys_home') === false,
    'L4h KONTROLA: zwinięcie BIEŻĄCEGO układu pamiętane (jawne „zwinięty” — także po powrocie do niego)');
  lo?.toggleExpanded?.('sys_A', 'sys_home');
  ok(lo?._expanded?.get?.('sys_A') === true && lo?.isExpanded?.('sys_A', 'sys_home') === true, 'L4i KONTROLA: rozwinięcie innego układu pamiętane');
  lo?._expanded?.clear?.(); lo?._expanded?.set?.('sys_home', false);
  EventBus.emit('body:selected', { entity: P1, focus: false });
  ok(!!lo?._expanded && !lo._expanded.has('sys_home') && lo.isExpanded?.('sys_home', 'sys_home') === true && lo.isExpanded?.('sys_home', 'sys_A') === false,
    'L4j SEDNO: zaznaczenie w zwiniętym BIEŻĄCYM układzie rozwija go bez jawnego stanu — po przejściu do innego układu wraca zwinięcie domyślne');
  // przewinięcie: 60 planetoid w sys_A — ostatnia poza widokiem
  const many = []; for (let i = 0; i < 60; i++) many.push({ id: `PD${i}`, type: 'planetoid', name: `Plt-${i}`, systemId: 'sys_A', orbital: { a: 2 + i * 0.1 }, explored: true });
  resetWorld(many);
  reset(); const lo2 = newLO(); lo2?._expanded?.set?.('sys_A', true); draw(lo2);
  ok(lo2?._maxScroll > 0, `L4e KONTROLA: lista dłuższa niż kolumna (max przewinięcia ${lo2?._maxScroll})`);
  EventBus.emit('body:selected', { entity: many[59], focus: false });
  draw(lo2);
  const tl = target(lo2, 'body', 'PD59');
  ok(lo2?._scrollY > 0 && !!tl && tl.y >= 28 + 18 && tl.y + tl.h <= 720 - 42, `L4f SEDNO: lista przewinięta do zaznaczonego ciała (przewinięcie ${lo2?._scrollY}, wiersz y ${tl?.y})`);
  resetWorld();
}

// ═══ L5 ═══════════════════════════════════════════════════════════════════════
header('L5  wcięcia obszaru mapy (`MapInsets`) i konsumenci');
{
  const cm = MI?.computeMapInsets;
  ok(typeof cm === 'function' && typeof MI?.getMapInsets === 'function', 'L5-0 `MapInsets` eksportuje `computeMapInsets` i `getMapInsets`');
  const civ = cm ? cm({ civMode: true, leftW: 150, dockH: 44 }) : null;
  const gen = cm ? cm({ civMode: false, leftW: 150 }) : null;
  ok(JSON.stringify(civ) === '{"left":150,"right":0,"top":28,"bottom":86}', `L5a tryb cywilizacji: lewo 150, góra 28, dół 42 + Dok 44 (jest ${JSON.stringify(civ)})`);
  ok(JSON.stringify(gen) === '{"left":0,"right":0,"top":46,"bottom":26}', `L5b Generator: bez outlinera, górny pasek 46, dolny 26 (jest ${JSON.stringify(gen)})`);
  reset(); const lo = newLO();
  const gi = (o) => { reset(o); return MI?.getMapInsets?.(K)?.left ?? null; };
  ok(gi({}) === 150, 'L5c SEDNO: lewy outliner nad mapą → wcięcie lewe 150');
  ok(gi({ overlay: true }) === 0 && gi({ dockExp: true }) === 0 && gi({ civ: false }) === 0, 'L5d overlay / rozwinięty Dok / poza trybem cywilizacji → 0');
  reset(); if (lo) lo.visible = false; ok(MI?.getMapInsets?.(K)?.left === 0, 'L5e stan użytkownika „ukryty” → 0'); if (lo) lo.visible = true;

  // PanelDock — belki zminimalizowanych paneli
  const { PanelDock } = await import('../../ui/PanelDock.js');
  reset(); const pd = new PanelDock();
  ok(pd._geom(W, H).leftX === 158, `L5f PanelDock: belki za outlinerem (leftX ${pd._geom(W, H).leftX})`);
  reset({ overlay: true }); ok(pd._geom(W, H).leftX === 8, 'L5g KONTROLA: outliner ukryty → leftX 8 jak dotąd');
  reset({ dockRes: 44 }); ok(pd._geom(W, H).bottomReserved >= 42 + 44, 'L5h dół: pasek nawigacji + Dok taktyczny (bez zmian)');

  // BottomContext — karta ciała
  const { BottomContext } = await import('../../ui/BottomContext.js');
  reset(); const bc = new BottomContext(); const b1 = bc._bounds(W, H);
  ok(b1.ox === 150 && b1.ow === W - 150 - 150, `L5i karta ciała: obszar od x 150 (prawe 150 px szuflady — jak dotąd); jest ox ${b1.ox}, ow ${b1.ow}`);
  reset({ overlay: true }); const b0 = bc._bounds(W, H);
  ok(b0.ox === 0 && b0.ow === W - 150, 'L5j KONTROLA: outliner ukryty → ox 0 jak dotąd');

  // FleetGroupPanel / FleetCommandPanel — chip zminimalizowany (lewy dół)
  const V = { v1: { id: 'v1', name: 'Furia', shipId: 'hull_frigate' } };
  K.vesselManager = { getVessel: (id) => V[id] ?? null };
  const { FleetGroupPanel } = await import('../../ui/FleetGroupPanel.js');
  reset(); const fg = new FleetGroupPanel(); fg.visible = true; fg._ids = ['v1']; fg._minimized = true;
  fg.draw(recCtx(), W, H);
  ok(fg._drawnRect?.x === 158, `L5k panel grupy statków za outlinerem (x ${fg._drawnRect?.x})`);
  reset({ overlay: true }); fg.draw(recCtx(), W, H);
  ok(fg._drawnRect?.x === 8, 'L5l KONTROLA: outliner ukryty → x 8 jak dotąd');
  const { FleetCommandPanel } = await import('../../ui/FleetCommandPanel.js');
  K.fleetSystem = { getFleet: (id) => (id === 'f1' ? { id: 'f1', name: 'Flota I', memberIds: ['v1'] } : null) };
  reset(); const fc = new FleetCommandPanel(); fc.visible = true; fc._fleetId = 'f1'; fc._minimized = true;
  fc.draw(recCtx(), W, H);
  ok(fc._drawnRect?.x === 158, `L5m panel floty za outlinerem (x ${fc._drawnRect?.x})`);

  // StationPanel — kotwica przy stacji po lewej: panel nie wchodzi pod outliner
  const { StationPanel } = await import('../../ui/StationPanel.js');
  EntityManager.add({ id: 'st1', type: 'station', name: 'Stacja Mstow', bodyId: 'P1', systemId: 'sys_home', ownerEmpireId: 'player',
    depot: { inventory: new Map() }, modules: [], tier: 1, createdYear: 10 });
  K.threeRenderer.getStationScreenPosition = () => ({ x: 20, y: 300 });
  reset(); const sp = new StationPanel(); sp._stationId = 'st1'; sp.visible = true;
  let threw = null; try { sp.draw(recCtx(), W, H); } catch (e) { threw = e; }
  ok(!threw && sp._lastRect?.px >= 150, `L5n StationPanel: przy stacji 20 px od lewej krawędzi panel zaczyna się za outlinerem (px ${sp._lastRect?.px}${threw ? ', wyjątek ' + threw.message : ''})`);
  reset({ overlay: true }); sp._float.reanchor?.(); sp.draw(recCtx(), W, H);
  ok(sp._lastRect?.px < 150, `L5o KONTROLA: outliner ukryty → panel może stanąć przy lewej krawędzi (px ${sp._lastRect?.px})`);
  delete K.threeRenderer.getStationScreenPosition;

  // Kadr „Obserwuj” — `watchSafeRect` z `leftW`
  const CW = await import('../../renderer/CombatWatchLogic.js');
  const r1 = CW.watchSafeRect({ W: 1600, H: 900, uiScale: 1.25, topBarH: 46, bottomH: 42, rightW: 150, leftW: 150 });
  const r0 = CW.watchSafeRect({ W: 1600, H: 900, uiScale: 1.25, topBarH: 46, bottomH: 42, rightW: 150 });
  ok(r1.x0 === 150 * 1.25 + CW.COMBAT_WATCH.MARGIN_PX, `L5p kadr „Obserwuj”: lewa krawędź prostokąta za outlinerem (x0 ${r1.x0})`);
  ok(r0.x0 === CW.COMBAT_WATCH.MARGIN_PX, 'L5q KONTROLA: bez `leftW` — x0 = margines (jak dotąd)');
}

// ═══ L6 ═══════════════════════════════════════════════════════════════════════
header('L6  isOver / kółko / najechanie');
{
  reset(); const lo = newLO(); draw(lo);
  ok(!!lo && lo.isOver(75, 300, W, H) === true, 'L6a punkt w kolumnie — nad outlinerem (blokada kamery)');
  ok(!!lo && lo.isOver(75, 20, W, H) === false && lo.isOver(75, 700, W, H) === false && lo.isOver(160, 300, W, H) === false,
    'L6b górna belka, pasek nawigacji, mapa za kolumną — NIE');
  reset({ overlay: true }); ok(!!lo && lo.isOver(75, 300, W, H) === false, 'L6c przy otwartym overlayu — NIE (decyzja 4)');
  reset(); ok(!!lo && lo.handleWheel(75, 300, 40, W, H) === false, 'L6d krótka lista — kółko nie pochłonięte (nic do przewinięcia)');
  const many = []; for (let i = 0; i < 60; i++) many.push({ id: `PE${i}`, type: 'planetoid', name: `E-${i}`, systemId: 'sys_home', orbital: { a: 3 + i * 0.1 }, explored: true });
  resetWorld(many); reset(); draw(lo);
  const y0 = lo?._scrollY ?? 0;
  ok(!!lo && lo.handleWheel(75, 300, 40, W, H) === true && lo._scrollY === y0 + 40, 'L6e długa lista — kółko przewija');
  resetWorld(); reset(); if (lo) lo._scrollY = 0; draw(lo);
  const tP = target(lo, 'body', 'P1');
  if (tP) lo?.updateHover?.(tP.x + 30, tP.y + 5, W, H);
  ok(lo?._hoverKey === 'body:P1', `L6f najechanie na wiersz ciała (klucz ${lo?._hoverKey})`);
  lo?.updateHover?.(400, 300, W, H);
  ok(lo?._hoverKey === null, 'L6g poza kolumną — bez podświetlenia');
}

// ═══ L7 ═══════════════════════════════════════════════════════════════════════
header('L7  montaż w UIManager i rendererze (piny źródłowe)');
{
  const ui = src('../../scenes/UIManager.js');
  ok(ui.length > 50000, `L7-0 KONTROLA: źródło UIManagera wczytane (${ui.length} zn.)`);
  ok(/this\._leftOutliner\s*=\s*new LeftOutliner\(\)/.test(ui) && /window\.KOSMOS\.leftOutliner\s*=\s*this\._leftOutliner/.test(ui),
    'L7a konstrukcja + `KOSMOS.leftOutliner` (rezerwa `MapInsets`)');
  const iou = body(ui, '  isOverUI(rawX, rawY) {');
  ok(/this\._leftOutliner\?\.isOver\?\.\(x, y, W, H\)/.test(iou), 'L7b blokada kamery (`isOverUI`)');
  const hc = body(ui, '  handleClick(x, y) {');
  const iLO = hc.indexOf('this._leftOutliner?.hitTest?.('), iTRD = hc.indexOf('this._topResourceDrawer?.handleClick?.(');
  const iLog = hc.indexOf('this._eventLogDrawer?.handleClick?.('), iOv = hc.indexOf('if (this.overlayManager.isAnyOpen()) {');
  ok(iLO > 0 && iTRD > 0 && iLog > 0 && iOv > 0, 'L7c-0 KONTROLA: wywołania w `handleClick` znalezione');
  ok(iLO > iTRD && iLO > iLog && iLO < iOv, 'L7c SEDNO: klik outlinera PO liście kolonii z belki i dzienniku (leżą nad nim), przed overlayem');
  const dr = body(ui, '  _draw() {');
  const dLO = dr.indexOf('this._leftOutliner.draw('), dTRD = dr.indexOf('this._topResourceDrawer.draw(');
  const dSP = dr.indexOf('this.stationPanel.draw('), dFG = dr.indexOf('this.fleetGroupPanel.draw(');
  ok(dLO > 0 && dLO < dTRD && dLO < dSP && dLO < dFG, 'L7d rysowanie: outliner PRZED listą kolonii z belki i pływającymi panelami (§7.17)');
  ok(/this\._leftOutliner\.draw\(ctx, W, H, \{ colonies: this\._cachedColonies, groundUnits: this\._outlinerState\?\.groundUnits/.test(dr),
    'L7e dane drzewa: wszystkie kolonie (cache) i jednostki naziemne z tej samej listy co prawy Outliner');
  ok(/this\._leftOutliner\?\.handleWheel\?\.\(x, y, delta, W, H\)/.test(body(ui, '  handleWheel(rawX, rawY, deltaY) {')), 'L7f kółko');
  ok(/this\._leftOutliner\?\.updateHover\?\.\(x, y, W, H\)/.test(body(ui, '  handleMouseMove(x, y) {')), 'L7g najechanie');
  ok(/this\._leftOutliner\?\.isOver\?\.\(x, y, W, H\)/.test(body(ui, '  isPointerOverFloatingPanel(rawX, rawY) {')),
    'L7h bez podpowiedzi mapy 3D pod kolumną (`isPointerOverFloatingPanel`)');
  const vpb = body(ui, '  _vesselPanelBounds(W, H) {');
  ok(/getMapInsets\(window\.KOSMOS\)/.test(vpb) && /ox: ins\.left \+ 8/.test(vpb) && /H - ins\.bottom - oy/.test(vpb),
    'L7i panel statku (tryb kompaktowy): obszar clampu z `MapInsets` (za outlinerem, nad dołem)');
  const tr = src('../../renderer/ThreeRenderer.js');
  ok(/leftW: civ \? getMapInsets\(window\.KOSMOS\)\.left : 0/.test(body(tr, '  _computeWatchFit(enc) {')),
    'L7j kadr „Obserwuj” (`_computeWatchFit`): `leftW` z `MapInsets`');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
