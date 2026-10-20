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
// PINY (krok U2-3 — decyzja 3, Finding 486, §7.18):
//   L8  wiersze ciał: glif kolonii gracza (🏛 z POP / ⛺ placówka), ⚑ przy kolonii AI, stacja gracza pod ciałem-matką,
//       🪖N i ⏳N po prawej (strefy przed strefą wiersza)
//   L9  🪖N → mapa TEGO ciała (`openPanel('colony', { colonyId })`): obce ciało — aktywna kolonia nietknięta; własne —
//       aktywna kolonia przełączona (KONTROLA); ⏳N = klik w wiersz ciała; podpowiedzi ○ / 🪖N / ⏳N
//   L10 wiersz stacji — reguła U1: 1. klik `station:selected`, 2. klik (panel otwarty) `station:focus`; stacja z innego
//       układu wg §7.8; podświetlenie wiersza stacji w otwartym panelu
//   L11 Finding 486 — `syncBodyCardOnSystemSwitch` (karta spoza układu docelowego → `body:deselected { reason }`; z układu
//       docelowego → `body:selected { focus: false }`; bez karty → nic); StationPanel nie zamyka się przy tym
//       odznaczeniu (KONTROLA: zwykłe odznaczenie zamyka); nasłuch `system:switched` w UIManagerze (pin źródłowy)
//   L12 §7.18 — chipy układów nie rysują się (statki w dwóch układach — dawniej rząd chipów); plakietki flot zostają
//       (KONTROLA)
//
// PINY (krok U2-4 — §7.16, decyzja 4, Finding 483):
//   L13 klawisze — `outlinerKeyAction` (e.code Comma / Period / KeyB, z modyfikatorem — nic) i `applyOutlinerToggle`
//       („B”: którykolwiek widoczny → oba schowane, oba schowane → oba pokazane)
//   L14 stan użytkownika: lewy schowany klawiszem — bez rysowania, trafień, wcięcia; decyzja 4 i klawisz niezależne
//       (stan przeżywa otwarcie overlayu); podpowiedź klawiszy w nagłówku (PL / EN)
//   L15 GameScene: klawisze w przełączniku `e.code`, tylko w trybie cywilizacji, przez `toggleOutliners` (pin
//       źródłowy); UIManager `toggleOutliners` — oba stany, prawy schowany bez wysuniętej szuflady
//   L16 prawy outliner — od ARKUSZ UI U3-2 kolumna nad mapą (`OutlinerColumn`, jak lewy): wejścia w UIManagerze bez
//       własnej flagi widoczności (klawisz i decyzja 4 — wewnątrz kolumny), w warstwie lewego; bez szuflady (piny
//       źródłowe; wykonanie — `right_outliner_smoke`)
//   L17 Finding 483 — kolejność rysowania: etykiety mapy → lewy outliner → lista kolonii z belki → Dok / paski →
//       pływające panele; kolejność kliku: pływające panele → lista kolonii → dziennik → lewy outliner → etykiety mapy
//       (piny źródłowe, komentarze zdjęte)
//
// PINY (ARKUSZ UI U3-0 — Finding 489):
//   L18 statek GRACZA w niezbadanym układzie odsłania go na liście (`treeContext` czyta rejestr statków); statek
//       wroga — nie (filtr `isEnemyVessel` w `treeContext`); KONTROLA: bez Twojego statku oba układy poza listą
//
// PRZECELOWANIA (ARKUSZ UI U3-2):
//   L2a — kolumna kończy się nad PASEM DOLNYM (`MapInsets.BOTTOM_STRIP_H` 20 px nad paskiem nawigacji — dziś pasek
//         zegara; U4 wypełni pas na całą szerokość), nie na pasku nawigacji: decyzja właściciela z promptu U3
//         („zakończ OBA outlinery nad nim już teraz”); intencja pinu (geometria §7.17) bez zmian.
//   L2a2 — NOWY pin arytmetyki pasa dolnego (`MapInsets.outlinerBottomInset`; pada na drzewie sprzed U3-2).
//   L15c / L15d / L16 — prawy outliner przestał być szufladą z flagą `_outlinerUserVisible` (U3-2: kolumna jak lewy,
//         `visible` i decyzja 4 wewnątrz `OutlinerColumn.isShown`); piny pilnują tej samej intencji (klawisz działa we
//         wszystkich wejściach) w nowym kształcie montażu.
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
  ok(!!bg && bg.y === 28 && bg.h === 720 - 28 - 62, `L2a kolumna 150 px od y 28 (dół górnej belki) do górnej krawędzi pasa dolnego (y ${720 - 62} — 20 px nad paskiem nawigacji; U3-2) — jest ${bg ? `${bg.y}+${bg.h}` : '—'}`);
  ok(MI?.BOTTOM_STRIP_H === 20 && MI?.outlinerBottomInset?.({ bottom: 42 }, true) === 62 && MI?.outlinerBottomInset?.({ bottom: 42 + 64 }, true) === 106
    && MI?.outlinerBottomInset?.({ bottom: 26 }, false) === 26,
    'L2a2 `outlinerBottomInset`: tryb cywilizacji — nad pasem dolnym (42 + 20), rezerwa Doku wygrywa, gdy większa; Generator bez zmian');
  ok(!!bg && bg.fillStyle === bgAlpha(0.6), `L2b tło półprzezroczyste \`bgAlpha(0.6)\` (jest ${bg?.fillStyle})`);
  const text = c.text.map((x) => x.s);
  ok(text.includes(t('leftOutliner.systems', 2).toUpperCase()) && text.includes('UKŁADY [2]'), 'L2c nagłówek „UKŁADY [2]” (i18n)');
  const sysT = (lo?._clickTargets ?? []).filter((z) => z.type === 'system').map((z) => z.systemId);
  ok(sysT.join(' ') === 'sys_home sys_A', 'L2d wiersze układów w kolejności drzewa (dom, potem reszta)');
  const bodies = (lo?._clickTargets ?? []).filter((z) => z.type === 'body').map((z) => z.bodyId);
  ok(bodies.join(' ') === 'P1 M1 D1', `L2e ciała tylko w rozwiniętym (bieżącym) układzie: P1, księżyc M1, planetoida D1 (jest ${bodies.join(' ')})`);
  const tM1 = target(lo, 'body', 'M1'), tP1 = target(lo, 'body', 'P1');
  // pierwszy napis wiersza (glif albo nazwa) — wcięcie wiersza, niezależnie od glifu kolonii przed nazwą
  const rowX = (z) => (z ? Math.min(...c.text.filter((x) => x.y === z.y + 12).map((x) => x.x)) : NaN);
  ok(!!tM1 && !!tP1 && rowX(tM1) > rowX(tP1) && tM1.y > tP1.y, `L2f księżyc wcięty pod planetą (x ${rowX(tP1)} → ${rowX(tM1)})`);
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

// ═══ wspólne dla L8–L10 (U2-3) ═══════════════════════════════════════════════════════════════════════════════════
// Świat z kolonią AI, placówką gracza, stacją gracza i jednostkami naziemnymi gracza.
const CA = { id: 'CA', type: 'planet', name: 'Alioth c', systemId: 'sys_A', orbital: { a: 2.0 }, explored: true };
const U1 = { id: 'U1', type: 'planetoid', name: 'Plt-11', systemId: 'sys_home', orbital: { a: 3.0 }, explored: false };
const OUT = { planetId: 'D1', name: 'Plt-7', isOutpost: true, ownerEmpireId: null, planet: D1 };
const AIC = { planetId: 'CA', name: 'Alioth c [WRÓG]', isOutpost: false, ownerEmpireId: 'emp_001', planet: CA };
const ST1 = { id: 'st1', type: 'station', name: 'Stacja Mstow', bodyId: 'P1', systemId: 'sys_home', ownerEmpireId: 'player',
  depot: { inventory: new Map() }, modules: [], tier: 1, createdYear: 10 };
const STB = { id: 'stB', type: 'station', name: 'Stacja Alioth', bodyId: 'PA', systemId: 'sys_A', ownerEmpireId: 'player',
  depot: { inventory: new Map() }, modules: [], tier: 1, createdYear: 10 };
const COLS3 = [...COLONIES, OUT, AIC];
const GU3 = [{ planetId: 'CA' }, { planetId: 'CA' }, { planetId: 'P1' }];
const world3 = () => {
  resetWorld([CA, U1, ST1, STB]);
  K.colonyManager.getAllColonies = () => COLS3;
  K.colonyManager.getColony = (id) => COLS3.find((c) => c.planetId === id) ?? null;
  K.stationSystem.getAllStations = () => [ST1, STB];
  K.overlayManager = { openPanel: (id, o) => ops.push(['openPanel', id, o ?? null]) };
};
const restore3 = () => {
  resetWorld();
  K.colonyManager.getAllColonies = () => COLONIES;
  K.colonyManager.getColony = (id) => COLONIES.find((c) => c.planetId === id) ?? null;
  K.stationSystem.getAllStations = () => [];
};
const draw3 = (lo, queue = 0) => {
  const ctx = recCtx();
  const qBS = { serializeQueue: () => new Array(queue).fill(1), serializePendingQueue: () => [] };
  COLONIES[0].buildingSystem = qBS;
  lo?.draw?.(ctx, W, H, { colonies: COLS3, groundUnits: GU3 });
  return ctx;
};

// ═══ L8 ═══════════════════════════════════════════════════════════════════════
header('L8  wiersze ciał: glify kolonii, stacje, 🪖N / ⏳N (decyzja 3)');
{
  world3(); reset(); const lo = newLO(); if (lo) lo._expanded.set('sys_A', true);
  const ctx = draw3(lo, 2);
  const c = ctx._calls;
  const rowText = (z) => (z ? c.text.filter((x) => x.y === z.y + 12).map((x) => x.s) : []);
  const tP1 = target(lo, 'body', 'P1'), tD1 = target(lo, 'body', 'D1'), tCA = target(lo, 'body', 'CA');
  ok(rowText(tP1).includes('🏛') && rowText(tD1).includes('⛺') && rowText(tCA).includes('⚑'),
    `L8a SEDNO: glif na wierszu ciała — 🏛 kolonia gracza, ⛺ placówka gracza, ⚑ kolonia AI (P1 ${rowText(tP1).join(' ')} · D1 ${rowText(tD1).join(' ')} · CA ${rowText(tCA).join(' ')})`);
  ok(rowText(tCA).includes('Alioth c') && !c.text.some((x) => x.s.includes('[WRÓG]')), 'L8b KONTROLA: kolonia AI — nazwa CIAŁA, nie nadana przez wroga (strażnik: przed U2-3 lista znała tylko nazwy ciał)');
  const tS1 = (lo?._clickTargets ?? []).find((z) => z.type === 'station' && z.stationId === 'st1');
  ok(!!tS1 && !!tP1 && tS1.y === tP1.y + 16 && c.text.some((x) => x.s === '🛰 Stacja Mstow'), 'L8c stacja gracza tuż pod ciałem-matką (🛰)');
  const gCA = (lo?._clickTargets ?? []).find((z) => z.type === 'ground' && z.bodyId === 'CA');
  const gP1 = (lo?._clickTargets ?? []).find((z) => z.type === 'ground' && z.bodyId === 'P1');
  const qP1 = (lo?._clickTargets ?? []).find((z) => z.type === 'queue' && z.bodyId === 'P1');
  ok(!!gCA && gCA.count === 2 && rowText(tCA).includes('🪖2') && !!gP1 && rowText(tP1).includes('🪖1'),
    'L8d 🪖N przy ciele — 2 jednostki na kolonii AI (desant), 1 na własnej');
  ok(!!qP1 && qP1.count === 2 && rowText(tP1).includes('⏳2') && !rowText(tCA).some((x) => x.startsWith('⏳')),
    'L8e ⏳N przy kolonii gracza; przy kolonii AI — brak');
  const zs = lo?._clickTargets ?? [];
  ok(!!gCA && zs.indexOf(gCA) < zs.indexOf(tCA) && !!qP1 && zs.indexOf(qP1) < zs.indexOf(tP1) && gCA.x > 100,
    'L8f strefy znaczników przed strefą wiersza (pierwsza trafiona), przy prawej krawędzi kolumny');
  restore3();
}

// ═══ L9 ═══════════════════════════════════════════════════════════════════════
header('L9  🪖N → mapa ciała (droga desantu), ⏳N, podpowiedzi');
{
  world3(); reset(); const lo = newLO(); if (lo) lo._expanded.set('sys_A', true);
  draw3(lo, 2);
  const gCA = (lo?._clickTargets ?? []).find((z) => z.type === 'ground' && z.bodyId === 'CA');
  reset(); const r = gCA ? lo.hitTest(gCA.x + 2, gCA.y + 4, W, H) : null;
  ok(r === true && JSON.stringify(ops) === '[["openPanel","colony",{"colonyId":"CA"}]]' && evs.length === 0,
    'L9a SEDNO: 🪖N na obcym ciele → `openPanel(\'colony\', { colonyId })` TEGO ciała; aktywna kolonia nietknięta, bez zaznaczenia');
  const gP1 = (lo?._clickTargets ?? []).find((z) => z.type === 'ground' && z.bodyId === 'P1');
  reset(); if (gP1) lo.hitTest(gP1.x + 2, gP1.y + 4, W, H);
  ok(JSON.stringify(ops) === '[["switchActiveColony","P1"],["openPanel","colony",{"colonyId":"P1"}]]',
    'L9b KONTROLA: 🪖N na własnej kolonii → aktywna kolonia przełączona (HUD za graczem) + jej mapa');
  const qP1 = (lo?._clickTargets ?? []).find((z) => z.type === 'queue' && z.bodyId === 'P1');
  reset(); if (qP1) lo.hitTest(qP1.x + 2, qP1.y + 4, W, H);
  ok(evs.length === 1 && evs[0][0] === 'body:selected' && evs[0][1]?.entity?.id === 'P1' && evs[0][1]?.focus === false && ops.length === 0,
    'L9c ⏳N — klik jak w wiersz ciała (zaznaczenie, kamera stoi)');
  if (gCA) lo.updateHover(gCA.x + 2, gCA.y + 4, W, H);
  ok(lo?._tip?.text === t('leftOutliner.groundUnits', 2), `L9d podpowiedź 🪖N (${lo?._tip?.text})`);
  if (qP1) lo.updateHover(qP1.x + 2, qP1.y + 4, W, H);
  ok(lo?._tip?.text === t('leftOutliner.queue', 2), `L9e podpowiedź ⏳N (${lo?._tip?.text})`);
  const tU1 = target(lo, 'body', 'U1');
  if (tU1) lo.updateHover(tU1.x + 30, tU1.y + 4, W, H);
  ok(lo?._tip?.text === t('leftOutliner.unrecognized', 'Plt-11'), `L9f podpowiedź „○” — ciało nierozpoznane bez kolonii (${lo?._tip?.text})`);
  const tP1 = target(lo, 'body', 'P1');
  if (tP1) lo.updateHover(tP1.x + 30, tP1.y + 4, W, H);
  ok(lo?._tip === null, 'L9g KONTROLA: ciało rozpoznane bez znaczników — bez podpowiedzi');
  setLocale('en');
  ok(t('leftOutliner.groundUnits', 2) !== 'leftOutliner.groundUnits' && t('leftOutliner.groundUnits', 2) !== t('leftOutliner.queue', 2),
    'L9h podpowiedzi także po angielsku');
  setLocale('pl');
  restore3();
}

// ═══ L10 ══════════════════════════════════════════════════════════════════════
header('L10 wiersz stacji — reguła U1 (§7.8), podświetlenie');
{
  world3(); reset(); const lo = newLO(); if (lo) lo._expanded.set('sys_A', true);
  draw3(lo);
  const tS = (id) => (lo?._clickTargets ?? []).find((z) => z.type === 'station' && z.stationId === id) ?? null;
  reset(); clickAt(lo, tS('st1'));
  ok(JSON.stringify(evs) === '[["station:selected",{"stationId":"st1"}]]', 'L10a stacja, 1. klik → `station:selected` (panel, kamera stoi)');
  reset(); K.stationPanel.visible = true; K.stationPanel._stationId = 'st1';
  clickAt(lo, tS('st1'));
  ok(JSON.stringify(evs) === '[["station:focus",{"stationId":"st1"}]]', 'L10b stacja w otwartym panelu, 2. klik → `station:focus`');
  const ctx = draw3(lo);
  const z1 = tS('st1');
  ok(!!z1 && ctx._calls.rects.some((r) => r.y === z1.y && r.fillStyle === THEME.accentMed), 'L10c wiersz stacji w otwartym panelu podświetlony');
  reset(); K.stationPanel._stationId = 'stB'; draw3(lo);
  clickAt(lo, tS('stB'));
  ok(JSON.stringify(ops) === '[["switch","sys_A"]]' && JSON.stringify(evs) === '[["station:focus",{"stationId":"stB"}]]',
    'L10d stacja z INNEGO układu, 2. klik → przełączenie układu, potem kamera');
  K.stationPanel.visible = false; K.stationPanel._stationId = null;
  restore3();
}

// ═══ L11 ══════════════════════════════════════════════════════════════════════
header('L11 Finding 486 — karta ciała przy przełączeniu układu');
{
  let CI = null; try { CI = await import('../../ui/ClickIntentLogic.js'); } catch { /* */ }
  const f = CI?.syncBodyCardOnSystemSwitch;
  ok(typeof f === 'function', 'L11-0 `syncBodyCardOnSystemSwitch` istnieje');
  const run = (entity, sys) => { const out = []; const r = typeof f === 'function' ? f(entity, sys, (n, p) => out.push([n, p])) : undefined; return { r, out }; };
  const a = run(P1, 'sys_A');
  ok(a.r === 'deselect' && JSON.stringify(a.out) === '[["body:deselected",{"reason":"system_switch"}]]',
    'L11a SEDNO: karta ciała SPOZA układu docelowego → `body:deselected { reason: \'system_switch\' }`');
  const b = run(PA, 'sys_A');
  ok(b.r === 'reselect' && b.out.length === 1 && b.out[0][0] === 'body:selected' && b.out[0][1]?.entity === PA && b.out[0][1]?.focus === false,
    'L11b karta ciała Z układu docelowego → zostaje, renderer dostaje zaznaczenie z powrotem (`focus: false`, kamera stoi)');
  const c = run(null, 'sys_A');
  ok(c.r === null && c.out.length === 0, 'L11c KONTROLA: bez karty — nic');
  const { StationPanel } = await import('../../ui/StationPanel.js');
  const sp = new StationPanel(); sp.visible = true; sp._stationId = 'st1';
  EventBus.emit('body:deselected', { reason: 'system_switch' });
  ok(sp.visible === true, 'L11d StationPanel NIE zamyka się przy odznaczeniu z przełączenia układu (jak przed 486)');
  EventBus.emit('body:deselected');
  ok(sp.visible === false, 'L11e KONTROLA: zwykłe odznaczenie (pustka / ✕ karty) zamyka panel stacji jak dotąd');
  const ui = src('../../scenes/UIManager.js');
  ok(/EventBus\.on\('system:switched', \(\{ systemId \} = \{\}\) => \{\s*syncBodyCardOnSystemSwitch\(this\._selectedEntity, systemId,/.test(ui),
    'L11f UIManager: nasłuch `system:switched` stosuje regułę do karty (`_selectedEntity`)');
}

// ═══ L12 ══════════════════════════════════════════════════════════════════════
header('L12 §7.18 — chipy układów wyłączone, plakietki flot zostają');
{
  const { MapLabelLayer } = await import('../../ui/MapLabelLayer.js');
  const mk = (id, sys) => ({ id, name: id, shipId: 'hull_frigate', systemId: sys, status: 'idle', mission: null,
    position: { state: 'orbiting', x: 0, y: 0, dockedAt: null }, fuel: { current: 10, max: 10 }, modules: [] });
  const vs = [mk('v1', 'sys_home'), mk('v2', 'sys_home'), mk('v3', 'sys_A')];
  K.vesselManager = { getAllVessels: () => vs, getVessel: (id) => vs.find((v) => v.id === id) ?? null };
  K.uiPrefs = {};
  const tr = { getVesselScreenPosition: (id) => (id === 'v1' ? { x: 400, y: 300 } : id === 'v2' ? { x: 404, y: 300 } : null),
    getCameraDistance: () => 50 };
  reset(); const m = new MapLabelLayer();
  let threw = null; try { m.drawVesselLabels(recCtx(), tr, W, H, 1); } catch (e) { threw = e; }
  ok(!threw, `L12-0 KONTROLA: \`drawVesselLabels\` bez wyjątku (${threw?.message ?? 'ok'})`);
  ok(m._chipZones.length === 0, `L12a SEDNO: statki gracza w dwóch układach — ŻADEN chip układu (strefy chipów: ${m._chipZones.length})`);
  ok(m._vesselHitZones.length >= 1, `L12b KONTROLA: plakietka floty (klaster dwóch statków) nadal rysowana (${m._vesselHitZones.length})`);
}

// ═══ L13 ══════════════════════════════════════════════════════════════════════
header('L13 klawisze outlinerów (§7.16)');
{
  const ka = LO?.outlinerKeyAction, tg = LO?.applyOutlinerToggle;
  ok(typeof ka === 'function' && typeof tg === 'function', 'L13-0 `outlinerKeyAction` i `applyOutlinerToggle` istnieją');
  const k = (code, mods = {}) => (typeof ka === 'function' ? ka({ code, ...mods }) : undefined);
  ok(k('Comma') === 'left' && k('Period') === 'right' && k('KeyB') === 'both', 'L13a SEDNO: „,” lewy, „.” prawy, „B” oba (e.code — układ klawiatury bez znaczenia)');
  ok(k('Comma', { shiftKey: true }) === null && k('KeyB', { ctrlKey: true }) === null && k('Period', { altKey: true }) === null && k('KeyB', { metaKey: true }) === null,
    'L13b z modyfikatorem (Shift / Ctrl — tryby przytrzymania, Alt, Meta) — nic');
  ok(k('KeyM') === null && k('Home') === null, 'L13c KONTROLA: inne klawisze — nic');
  const T = (a, st) => (typeof tg === 'function' ? JSON.stringify(tg(a, st)) : null);
  ok(T('left', { left: true, right: true }) === '{"left":false,"right":true}' && T('right', { left: true, right: true }) === '{"left":true,"right":false}',
    'L13d „,” / „.” przełączają tylko swój panel');
  ok(T('both', { left: true, right: true }) === '{"left":false,"right":false}' && T('both', { left: false, right: true }) === '{"left":false,"right":false}'
    && T('both', { left: false, right: false }) === '{"left":true,"right":true}',
    'L13e „B”: którykolwiek widoczny → oba schowane; oba schowane → oba pokazane');
  ok(typeof tg === 'function' && tg('x', {}) === null, 'L13f nieznana akcja → null');
}

// ═══ L14 ══════════════════════════════════════════════════════════════════════
header('L14 stan użytkownika lewego outlinera, decyzja 4, podpowiedź klawiszy');
{
  reset(); const lo = newLO();
  if (lo) lo.visible = false;
  const { tr } = draw(lo);
  ok(tr === null && (lo?._clickTargets ?? []).length === 0 && lo?.isOver?.(75, 300, W, H) === false && MI?.getMapInsets?.(K)?.left === 0,
    'L14a KONTROLA (stan `visible` od U2-2): schowany — bez rysowania, trafień, blokady kamery i wcięcia');
  reset({ overlay: true }); if (lo) lo.visible = true;
  ok(lo?.isShown?.(K) === false, 'L14b KONTROLA (decyzja 4 od U2-2): overlay otwarty — ukryty mimo stanu „widoczny”');
  reset(); ok(lo?.isShown?.(K) === true, 'L14c KONTROLA: overlay zamknięty — wraca (stan użytkownika przeżył overlay)');
  reset({ overlay: true }); if (lo) lo.visible = false; reset();
  ok(lo?.isShown?.(K) === false, 'L14d KONTROLA: schowany przy otwartym overlayu — po zamknięciu zostaje schowany');
  if (lo) lo.visible = true; draw(lo);
  const hd = (lo?._clickTargets ?? []).find((z) => z.type === 'header');
  if (hd) lo.updateHover(hd.x + 20, hd.y + 5, W, H);
  ok(!!hd && lo?._tip?.text === t('leftOutliner.keyHint') && /„,”/.test(lo?._tip?.text ?? '') && /„B”/.test(lo?._tip?.text ?? ''),
    `L14e podpowiedź klawiszy po najechaniu na nagłówek (${lo?._tip?.text})`);
  setLocale('en'); const en = t('leftOutliner.keyHint'); setLocale('pl');
  ok(en !== 'leftOutliner.keyHint' && en !== t('leftOutliner.keyHint') && /B/.test(en), `L14f podpowiedź klawiszy po angielsku (${en})`);
  const { ctx } = draw(lo);
  ok(ctx._calls.text.some((x) => x.s === '[ , ]'), 'L14g klawisz przy nagłówku („[ , ]”)');
}

// ═══ L15 ══════════════════════════════════════════════════════════════════════
header('L15 GameScene / UIManager — klawisze (piny źródłowe)');
{
  const gs = src('../../scenes/GameScene.js');
  const sw = gs.slice(gs.indexOf("case 'Space':"), gs.indexOf("case 'F7':"));
  ok(sw.length > 0, 'L15-0 KONTROLA: przełącznik `e.code` w keydown znaleziony');
  ok(/case 'Comma':\s*case 'Period':\s*case 'KeyB': \{\s*const act = window\.KOSMOS\?\.civMode \? outlinerKeyAction\(e\) : null;\s*if \(act && this\.uiManager\?\.toggleOutliners\?\.\(act\)\) e\.preventDefault\(\);/.test(sw),
    'L15a SEDNO: „,” „.” „B” w przełączniku `e.code`, tylko w trybie cywilizacji, przez `toggleOutliners`');
  ok(/import \{ outlinerKeyAction \} from '\.\.\/ui\/LeftOutliner\.js'/.test(gs), 'L15b reguła klawiszy z czystego helpera (`outlinerKeyAction`)');
  const ui = src('../../scenes/UIManager.js');
  const tog = body(ui, '  toggleOutliners(action) {');
  ok(/applyOutlinerToggle\(action, \{ left: this\._leftOutliner\.visible !== false, right: this\._outliner\.visible !== false \}\)/.test(tog)
    && /this\._leftOutliner\.visible = next\.left;/.test(tog) && /this\._outliner\.visible = next\.right;/.test(tog),
    'L15c `toggleOutliners` — oba stany z jednej reguły (`applyOutlinerToggle`), prawy przez `visible` kolumny (U3-2)');
  ok(tog.length > 0 && !/_slideProgress|_hideAt|_drawerMode|_outlinerUserVisible/.test(ui),
    'L15d prawy schowany — kolumna (bez szuflady): w UIManagerze ani stanu szuflady, ani osobnej flagi widoczności (U3-2)');
}

// ═══ L16 ══════════════════════════════════════════════════════════════════════
header('L16 prawy outliner — kolumna w warstwie lewego; klawisz i decyzja 4 wewnątrz kolumny (piny źródłowe, U3-2)');
{
  const ui = src('../../scenes/UIManager.js');
  const has = (sig, re) => re.test(body(ui, sig));
  ok(has('  isOverUI(rawX, rawY) {', /this\._outliner\?\.isOver\?\.\(x, y, W, H\)/), 'L16a blokada kamery (`isOver` kolumny — z jej widocznością)');
  const hc = body(ui, '  handleClick(x, y) {');
  const iLO = hc.indexOf('this._leftOutliner?.hitTest?.('), iRO = hc.indexOf('this._outliner?.hitTest?.('), iLbl = hc.indexOf('this._mapLabelLayer?.handleClick?.(');
  ok(iLO > 0 && iRO > iLO && iRO < iLbl && hc.split('this._outliner?.hitTest?.(').length === 2,
    'L16b klik — jedno wywołanie, zaraz po lewym (pod listą kolonii i dziennikiem), przed etykietami mapy (decyzja 4)');
  ok(has('  handleWheel(rawX, rawY, deltaY) {', /if \(this\._outliner\?\.handleWheel\?\.\(x, y, delta, W, H\)\) return true;/), 'L16c kółko (bez własnej bramki — widoczność sprawdza kolumna)');
  ok(has('  handleMouseMove(x, y) {', /this\._outliner\?\.updateHover\?\.\(x, y, W, H\)/), 'L16d najechanie');
  const dr = body(ui, '  _draw() {');
  const dLO = dr.indexOf('this._leftOutliner.draw('), dRO = dr.indexOf('this._outliner.draw('), dTRD = dr.indexOf('this._topResourceDrawer.draw(');
  ok(dLO > 0 && dRO > dLO && dRO < dTRD && dr.split('this._outliner.draw(').length === 2,
    'L16e rysowanie — raz, w warstwie lewego (po nim, przed listą kolonii z belki i pływającymi panelami)');
  ok(/if \(civMode && !globeOpen\) this\._outliner\.drawTooltip\(ctx, W, H\);/.test(dr), 'L16f podpowiedź prawego (widoczność sprawdza kolumna)');
  ok(dr.length > 0 && !/_outliner\?\.isAnimating/.test(dr) && !/_drawerMode/.test(dr), 'L16g bez animacji i trybu szuflady');
  ok(/window\.KOSMOS\.rightOutliner = this\._outliner;/.test(ui), 'L16h kolumna wystawiona w `KOSMOS.rightOutliner` (wcięcie prawe `MapInsets`, strojenie)');
}

// ═══ L17 ══════════════════════════════════════════════════════════════════════
header('L17 Finding 483 — kolejność rysowania i kliku (piny źródłowe)');
{
  const ui = src('../../scenes/UIManager.js');
  const dr = body(ui, '  _draw() {');
  const at = (n) => dr.indexOf(n);
  const dLbl = at('this._mapLabelLayer.draw('), dVL = at('this._mapLabelLayer.drawVesselLabels('), dAll = at('this._drawAllLabels(ctx, tr)');
  const dLO = at('this._leftOutliner.draw('), dTRD = at('this._topResourceDrawer.draw(ctx, W, H)'), dDock = at('this.tacticalDock.draw(');
  const dNav = at('this._bottomNavBar.draw('), dSP = at('this.stationPanel.draw('), dFG = at('this.fleetGroupPanel.draw('), dBr = at('this._drawSelectionBrackets(');
  ok([dLbl, dVL, dAll, dLO, dTRD, dDock, dNav, dSP, dFG, dBr].every((i) => i > 0), 'L17-0 KONTROLA: wszystkie wywołania w `_draw` znalezione');
  ok(dAll < dLO && dLbl < dLO && dVL < dLO, 'L17a SEDNO: etykiety mapy (plakietki kolonii / stacji / flot, CTRL) PRZED lewym outlinerem');
  ok(dLO < dTRD && dTRD < dDock && dTRD < dNav, 'L17b KONTROLA (od U2-2): lewy outliner → lista kolonii z belki → Dok taktyczny / paski');
  ok(dTRD < dSP && dTRD < dFG && dBr > dVL, 'L17c KONTROLA: lista kolonii POD pływającymi panelami; ramki zaznaczenia nadal PO etykietach');
  const hc = body(ui, '  handleClick(x, y) {');
  const c = (n) => hc.indexOf(n);
  const cSP = c('this.stationPanel?.handleClick?.('), cFC = c('this.fleetCommandPanel?.handleClick?.('), cTRD = c('this._topResourceDrawer?.handleClick?.(');
  const cLog = c('this._eventLogDrawer?.handleClick?.('), cLO = c('this._leftOutliner?.hitTest?.('), cLbl = c('this._mapLabelLayer?.handleClick?.(');
  ok([cSP, cFC, cTRD, cLog, cLO, cLbl].every((i) => i > 0), 'L17d-0 KONTROLA: wszystkie wywołania w `handleClick` znalezione');
  ok(cSP < cTRD && cFC < cTRD && cTRD < cLog && cLog < cLO && cLO < cLbl,
    'L17d SEDNO: klik — pływające panele → lista kolonii → dziennik → lewy outliner → etykiety mapy (tak jak leżą na ekranie)');
  ok(c('this._mapLabelLayer?.handleClick?.(') === hc.lastIndexOf('this._mapLabelLayer?.handleClick?.('), 'L17e KONTROLA: jedno wywołanie kliku etykiet');
}

// ═══ L18 ══════════════════════════════════════════════════════════════════════
header('L18 ARKUSZ UI U3-0 (Finding 489) — statek GRACZA odsłania układ na liście; statek wroga — nie');
{
  // Dwa niezbadane układy (`galaxyStar.explored = false` — jak Akhernar i Wezen w Polonii gy79): w `sys_B` Twój statek,
  // w `sys_C` statek wroga. Prawdziwy `LeftOutliner.draw` czyta statki z rejestru (`treeContext`) — wroga odfiltrowuje
  // TUTAJ (logika drzewa nie zna `isEnemyVessel`).
  const SB = { systemId: 'sys_B', explored: true, galaxyStar: { id: 'sys_B', name: 'Akhernar', distanceLY: 6.0, explored: false } };
  const SC = { systemId: 'sys_C', explored: true, galaxyStar: { id: 'sys_C', name: 'Wezen', distanceLY: 21.8, explored: false } };
  SYSTEMS.push(SB, SC);
  resetWorld([{ id: 'star_b', type: 'star', name: 'Akhernar', systemId: 'sys_B' }, { id: 'star_c', type: 'star', name: 'Wezen', systemId: 'sys_C' }]);
  const vOwn = { id: 'v_16', name: 'Galileo', systemId: 'sys_B' };
  const vEnemy = { id: 'x_1', name: 'Rajder', systemId: 'sys_C', ownerEmpireId: 'emp_002' };
  const setVessels = (vs) => { K.vesselManager = { getAllVessels: () => vs, getVessel: (id) => vs.find((v) => v.id === id) ?? null }; };
  const listed = (lo) => (lo?._clickTargets ?? []).filter((z) => z.type === 'system').map((z) => z.systemId);
  reset(); setVessels([vOwn, vEnemy]); const lo = newLO(); draw(lo);
  const l1 = listed(lo);
  console.log('     układy: ' + l1.join(' '));
  ok(l1.includes('sys_B'), 'L18a SEDNO: niezbadany układ z Twoim statkiem — na liście (dosłowne D-UI-3)');
  ok(l1.length > 0 && !l1.includes('sys_C'), 'L18b statek WROGA w niezbadanym układzie go nie odsłania (wróg odfiltrowany w `treeContext`)');
  reset(); setVessels([vEnemy]); draw(lo);
  const l2 = listed(lo);
  ok(l2.length > 0 && !l2.includes('sys_B') && !l2.includes('sys_C'), 'L18c KONTROLA: bez Twojego statku — oba niezbadane układy poza listą');
  SYSTEMS.splice(SYSTEMS.indexOf(SB), 2);
  delete K.vesselManager;
  resetWorld();
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
