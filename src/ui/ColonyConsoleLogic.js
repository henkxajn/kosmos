// ColonyConsoleLogic — konsola Kolonii (ARC COLONY SPHERE, CS-8): czysta logika, testowalna bez płótna.
//
// Konsola = szablon 4-strefowy z ARC KONSOLE (docs/design/CONSOLES_PLAN.md) dla kolonii na KULI (siatka geo) — każdej, także
// gdy flaga `FEATURES.colonySphere` jest dziś OFF (flaga decyduje tylko o siatce NOWYCH kolonii). Kolonie płaskie (stare zapisy)
// — dzisiejsze okno kolonii bez zmian (decyzja 6).
//   nagłówek   — nazwa kolonii + populacja, przełącznik [ KOLONIA ] [ STACJA ], soczewki, tryb budowy, [ x ]
//   lista      — kolonie i placówki gracza (klik przełącza aktywną kolonię) + karta planety
//   bohater    — kula CS-7 w ramie bohatera
//   inspektor  — wg zaznaczenia: pole / budynek / budowa / zamówienie / jednostka / paleta trybu budowy / podsumowanie
//   pas        — kolejka budowy (postęp, anuluj, kolejność zamówień)
// Reguły ARC KONSOLE: zero cichych odmów (wyłączone + powód + co zrobić), każde zaznaczenie coś zmienia, kontekst na ekranie.

import { BUILDINGS } from '../data/BuildingsData.js';
import { TERRAIN_TYPES } from '../map/HexTile.js';

// Wymiary stref (px logiczne) — jedna tabela, strojenie na bramce właściciela.
export const COLONY_CONSOLE = Object.freeze({
  LIST_W: 236,          // lewa strefa: lista kolonii + karta planety
  INSP_W: 336,          // inspektor
  STRIP_H: 78,          // pas kolejki budowy
  LIST_MAX_FRAC: 0.38,  // lista kolonii zajmuje najwyżej tyle wysokości lewej strefy (reszta — karta planety)
  LIST_MIN_ROWS: 3,
  PORTRAIT: 72,         // portret budynku w inspektorze
  ROW_ICON: 22,         // ikona budynku w wierszu listy budowy / palety
  BUILD_ROW_H: 36,      // wiersz listy budowy (nazwa + koszt)
  QUEUE_CARD_W: 190,    // karta kolejki w pasie
});

/**
 * Konsola rysuje się dla KAŻDEJ kolonii na siatce geo, niezależnie od bieżącej flagi (D-CS-28 pkt 1 po bramce = D-CS-27 pkt 1:
 * kolonia geo z zapisu nie ma innego okna; F5 zeruje flagę, a kolonia zostaje na kuli). Flaga `colonySphere` decyduje wyłącznie
 * o rodzaju siatki NOWYCH kolonii. Siatka płaska = dzisiejsze okno kolonii.
 */
export function colonyConsoleActive(grid) {
  return grid?.kind === 'geo';
}

/** Specyfikacja `consoleZones` konsoli Kolonii (gniazdo paska walki wyłączone — nagłówek niesie czipy kolonii). */
export function colonyConsoleSpec(clock = null) {
  return { variant: '4zone', listW: COLONY_CONSOLE.LIST_W, inspW: COLONY_CONSOLE.INSP_W, stripH: COLONY_CONSOLE.STRIP_H,
    combatSlotW: 0, clock };
}

// ── Lista kolonii ───────────────────────────────────────────────────────────

/**
 * Wiersze listy kolonii i placówek gracza. Grupy = układy gwiezdne (nagłówek grupy tylko gdy układów > 1);
 * w grupie najpierw pełne kolonie, potem placówki; kolejność w obrębie rodzaju jak w menedżerze kolonii.
 * @param {Array<object>} colonies wpisy kolonii gracza (`planetId`, `name` / `planet.name`, `isOutpost`, `planet.systemId`, `civSystem`)
 * @param {{ viewedId?:string|null, activeId?:string|null, systemNameOf?:(systemId:string)=>string|null }} [o]
 * @returns {Array<{group:true,label:string}|{id:string,label:string,kind:'colony'|'outpost',pop:number|null,active:boolean,viewed:boolean}>}
 */
export function colonyListRows(colonies, { viewedId = null, activeId = null, systemNameOf = () => null } = {}) {
  const groups = new Map();
  for (const c of colonies ?? []) {
    if (!c?.planetId) continue;
    const sys = c.planet?.systemId ?? c.systemId ?? 'sys_home';
    if (!groups.has(sys)) groups.set(sys, []);
    groups.get(sys).push(c);
  }
  const out = [];
  for (const [sys, list] of groups) {
    if (groups.size > 1) out.push({ group: true, label: systemNameOf(sys) ?? sys });
    const ordered = [...list.filter((c) => !c.isOutpost), ...list.filter((c) => !!c.isOutpost)];
    for (const c of ordered) {
      const civ = c.civSystem ?? null;
      out.push({
        id: c.planetId,
        label: c.planet?.name ?? c.name ?? c.planetId,
        kind: c.isOutpost ? 'outpost' : 'colony',
        pop: c.isOutpost || !civ ? null : Math.floor(civ.humans ?? civ.population ?? 0),
        active: c.planetId === activeId,
        viewed: c.planetId === viewedId,
      });
    }
  }
  return out;
}

/** Wysokość listy kolonii w lewej strefie: treść, ale nie więcej niż `LIST_MAX_FRAC` strefy i nie mniej niż 3 wiersze. */
export function colonyListHeight(rowCount, groupCount, zoneH, rowH, groupH) {
  const content = rowCount * rowH + groupCount * groupH;
  const max = Math.max(COLONY_CONSOLE.LIST_MIN_ROWS * rowH, Math.floor(zoneH * COLONY_CONSOLE.LIST_MAX_FRAC));
  return Math.max(0, Math.min(content, max));
}

// ── Karta planety ───────────────────────────────────────────────────────────

const signed = (v, digits = 0) => `${v > 0 ? '+' : ''}${Number(v).toFixed(digits)}`;

/**
 * Wiersze karty planety (lewa strefa pod listą). `env` = wynik `computeEnvironmentEffects` (pasma i wpływy) albo null.
 * Każdy wiersz: `labelKey` (i18n), `value` (tekst gotowy poza jednostką z `unitKey`), `bandKey` (pasmo, i18n) i `effects`
 * (linie wpływu `{key, params, tone}` do pod-wiersza).
 */
export function planetCardRows(planet, env = null) {
  if (!planet) return [];
  const tempC = planet.temperatureC ?? planet.surface?.temperature ?? 0;
  return [
    { id: 'temperature', labelKey: 'colonyInfo.temperature', value: `${signed(tempC)} °C`,
      bandKey: env?.temperature?.bandKey ?? null, effects: env?.temperature?.effects ?? [] },
    { id: 'gravity', labelKey: 'colonyInfo.gravity', value: `${(planet.surfaceGravity ?? 1).toFixed(2)} g`,
      bandKey: env?.gravity?.bandKey ?? null, effects: env?.gravity?.effects ?? [] },
    { id: 'atmosphere', labelKey: 'colonyInfo.atmosphere', valueKey: `colonyInfo.atm.${planet.atmosphere || 'none'}`,
      bandKey: null, effects: env?.atmosphere?.effects ?? [] },
    { id: 'water', labelKey: 'colonyInfo.water', valueKey: env?.water?.hasWater ? 'colonyInfo.waterYes' : 'colonyInfo.waterNo',
      bandKey: null, effects: env?.water?.effects ?? [] },
    { id: 'mass', labelKey: 'colonyInfo.mass', value: (planet.physics?.mass ?? 1).toFixed(2), unitKey: 'colonyInfo.massUnit',
      bandKey: null, effects: [] },
    { id: 'radius', labelKey: 'colonyInfo.radius', value: (planet.surfaceRadius ?? 1).toFixed(2), unitKey: 'colonyInfo.radiusUnit',
      bandKey: null, effects: [] },
  ];
}

/** Statystyka pól karty planety: wszystkie / pod zabudowę (teren `buildable`) / zajęte (budynek, budowa, zamówienie, stolica). */
export function tileStatsOf(tiles) {
  let total = 0, buildable = 0, used = 0;
  for (const tile of tiles ?? []) {
    if (!tile) continue;
    total++;
    if (TERRAIN_TYPES[tile.type]?.buildable) buildable++;
    if (tile.buildingId || tile.underConstruction || tile.pendingBuild || tile.capitalBase) used++;
  }
  return { total, buildable, used };
}

// ── Inspektor ───────────────────────────────────────────────────────────────

export const INSPECTOR_KINDS = Object.freeze(['palette', 'unit', 'building', 'construction', 'pending', 'tile', 'station', 'summary']);

/**
 * Stan inspektora z zaznaczenia. Pierwszeństwo: tryb budowy (paleta) → jednostka → pole → widok stacji → podsumowanie.
 * Zaznaczenie pola lub jednostki zawsze zmienia inspektor (reguła ARC KONSOLE); widok stacji ustępuje zaznaczeniu.
 * @param {{ buildMode?:boolean, unit?:object|null, unitCount?:number, tile?:object|null, station?:boolean, preview?:boolean }} s
 * @returns {{ kind:string, capital?:boolean, multi?:boolean, canBuild?:boolean }}
 */
export function inspectorStateOf(s = {}) {
  if (s.buildMode && !s.preview) return { kind: 'palette' };
  if (s.unit) return { kind: 'unit', multi: (s.unitCount ?? 1) > 1 };
  const tile = s.tile ?? null;
  if (tile) {
    if (tile.buildingId) return { kind: 'building', capital: !!tile.capitalBase };
    if (tile.underConstruction) return { kind: 'construction' };
    if (tile.pendingBuild) return { kind: 'pending' };
    return { kind: 'tile', capital: !!tile.capitalBase, canBuild: !s.preview };
  }
  if (s.station && !s.preview) return { kind: 'station' };
  return { kind: 'summary' };
}

/**
 * Portret w gnieździe inspektora / wiersza: PNG budynku, a gdy go brak — znak kategorii w TYM SAMYM gnieździe (bez emoji).
 * Stolica (pole `capitalBase` bez własnego budynku) używa portretu budynku-stolicy.
 * @param {string|null} buildingId
 * @param {(id:string)=>boolean} hasPng
 * @returns {{ kind:'png', id:string }|{ kind:'category', category:string }}
 */
export function portraitSpecOf(buildingId, hasPng = () => false) {
  const b = buildingId ? BUILDINGS[buildingId] : null;
  if (b && hasPng(b.id)) return { kind: 'png', id: b.id };
  return { kind: 'category', category: b?.category ?? 'civil' };
}

/** Id budynku-stolicy (portret pola stolicy). */
export const CAPITAL_BUILDING_ID = Object.keys(BUILDINGS).find((id) => BUILDINGS[id].isCapital) ?? 'colony_base';

/**
 * Znaki kategorii — łamane w kwadracie 0…1 (rysuje je widok w barwie kategorii). Każda kategoria budynków z danych ma swój znak;
 * nieznana → `civil`. Bez emoji i bez liter: kształt czytelny przy 22 px.
 */
export const CATEGORY_GLYPHS = Object.freeze({
  mining:         [[[0.15, 0.85], [0.5, 0.2], [0.85, 0.85], [0.15, 0.85]], [[0.33, 0.52], [0.67, 0.52]]],
  energy:         [[[0.58, 0.1], [0.28, 0.55], [0.5, 0.55], [0.42, 0.9], [0.72, 0.45], [0.5, 0.45], [0.58, 0.1]]],
  food:           [[[0.5, 0.9], [0.5, 0.3]], [[0.5, 0.3], [0.25, 0.12]], [[0.5, 0.3], [0.75, 0.12]], [[0.5, 0.55], [0.22, 0.4]], [[0.5, 0.55], [0.78, 0.4]]],
  population:     [[[0.15, 0.85], [0.15, 0.45], [0.5, 0.15], [0.85, 0.45], [0.85, 0.85], [0.15, 0.85]], [[0.42, 0.85], [0.42, 0.6], [0.58, 0.6], [0.58, 0.85]]],
  research:       [[[0.4, 0.12], [0.4, 0.45], [0.18, 0.86], [0.82, 0.86], [0.6, 0.45], [0.6, 0.12]], [[0.33, 0.12], [0.67, 0.12]], [[0.29, 0.66], [0.71, 0.66]]],
  space:          [[[0.5, 0.08], [0.68, 0.4], [0.68, 0.72], [0.32, 0.72], [0.32, 0.4], [0.5, 0.08]], [[0.32, 0.6], [0.16, 0.86]], [[0.68, 0.6], [0.84, 0.86]], [[0.42, 0.72], [0.42, 0.9]], [[0.58, 0.72], [0.58, 0.9]]],
  military:       [[[0.5, 0.1], [0.84, 0.24], [0.84, 0.54], [0.5, 0.9], [0.16, 0.54], [0.16, 0.24], [0.5, 0.1]]],
  market:         [[[0.5, 0.12], [0.86, 0.5], [0.5, 0.88], [0.14, 0.5], [0.5, 0.12]], [[0.32, 0.5], [0.68, 0.5]]],
  civil:          [[[0.12, 0.34], [0.5, 0.12], [0.88, 0.34], [0.12, 0.34]], [[0.24, 0.34], [0.24, 0.78]], [[0.5, 0.34], [0.5, 0.78]], [[0.76, 0.34], [0.76, 0.78]], [[0.12, 0.86], [0.88, 0.86]]],
  governance:     [[[0.26, 0.9], [0.26, 0.14]], [[0.26, 0.14], [0.84, 0.3], [0.26, 0.5]]],
  infrastructure: [[[0.1, 0.72], [0.9, 0.72]], [[0.1, 0.72], [0.3, 0.36], [0.5, 0.72], [0.7, 0.36], [0.9, 0.72]], [[0.3, 0.36], [0.7, 0.36]]],
  synthetic:      [[[0.2, 0.3], [0.8, 0.3], [0.8, 0.82], [0.2, 0.82], [0.2, 0.3]], [[0.5, 0.3], [0.5, 0.12]], [[0.36, 0.5], [0.42, 0.5]], [[0.58, 0.5], [0.64, 0.5]], [[0.38, 0.68], [0.62, 0.68]]],
});

export function categoryGlyphOf(category) { return CATEGORY_GLYPHS[category] ?? CATEGORY_GLYPHS.civil; }

// ── Lista budowy pola i paleta trybu budowy ─────────────────────────────────

/** Braki względem stanu magazynu: `[{ key, need, have, short }]` tylko dla pozycji, których nie starcza. */
export function missingOf(cost, haveOf = () => 0) {
  const out = [];
  for (const [key, need] of Object.entries(cost ?? {})) {
    const have = haveOf(key) ?? 0;
    if (have < need) out.push({ key, need, have, short: need - have });
  }
  return out;
}

/** Stany wiersza budowy. `ok` — buduj od razu; `queue` — brak surowców, klik dodaje zamówienie do kolejki;
 *  `locked` — bramka terenu / klimatu (wyłączone, powód); `foreign` — cudza kolonia (wyłączone, powód). */
export const BUILD_ROW = Object.freeze({ OK: 'ok', QUEUE: 'queue', LOCKED: 'locked', FOREIGN: 'foreign' });

/**
 * Wiersze listy budowy dla pola (tryb „pole → budynek"). Koszt = RZECZYWISTY koszt na tym polu (pas szerokości wliczony):
 * `costOf(id)` czyta `BuildingSystem.previewBuildCost`, czyli to samo, co pobierze `_build` (Finding 780).
 * @param {{ entries:Array<{id:string,locked?:boolean,reason?:string|null}>, costOf:(id:string)=>object|null,
 *           haveOf:(key:string)=>number, ordersOk?:boolean }} p
 *   `entries` — wynik dzisiejszej bramki listy (`_getAvailableBuildings`: werdykt `evaluatePlacement`, klimat = locked + powód)
 * @returns {Array<{ id:string, category:string, cost:object, missing:Array, state:string, enabled:boolean, reasonKey:string|null }>}
 */
export function tileBuildRows({ entries, costOf, haveOf, ordersOk = true }) {
  const rows = [];
  for (const e of entries ?? []) {
    const b = BUILDINGS[e.id];
    if (!b) continue;
    const cost = costOf(e.id) ?? {};
    const missing = missingOf(cost, haveOf);
    let state = BUILD_ROW.OK, reasonKey = null;
    if (!ordersOk) { state = BUILD_ROW.FOREIGN; reasonKey = 'colonyConsole.reason.foreign'; }
    else if (e.locked) { state = BUILD_ROW.LOCKED; reasonKey = e.reason ?? 'colonyConsole.reason.terrain'; }
    else if (missing.length) { state = BUILD_ROW.QUEUE; reasonKey = 'colonyConsole.reason.queue'; }
    rows.push({ id: e.id, category: b.category ?? 'civil', cost, missing, state,
      enabled: state === BUILD_ROW.OK || state === BUILD_ROW.QUEUE, reasonKey });
  }
  return rows;
}

/** Kolejność kategorii w palecie trybu budowy i w liście budowy pola (kategorie spoza listy — na końcu, alfabetycznie). */
export const CATEGORY_ORDER = Object.freeze(['population', 'food', 'energy', 'mining', 'civil', 'research', 'market', 'space',
  'military', 'governance', 'infrastructure', 'synthetic']);

export function sortByCategory(rows) {
  const rank = (c) => { const i = CATEGORY_ORDER.indexOf(c); return i < 0 ? CATEGORY_ORDER.length : i; };
  return [...(rows ?? [])].sort((a, b) => rank(a.category) - rank(b.category) || String(a.category).localeCompare(String(b.category)));
}

/** Kategorie obecne w wierszach, w kolejności palety, z licznikiem pozycji. */
export function categoriesOf(rows) {
  const count = new Map();
  for (const r of rows ?? []) count.set(r.category, (count.get(r.category) ?? 0) + 1);
  return sortByCategory([...count.keys()].map((category) => ({ category }))).map((c) => ({ id: c.category, count: count.get(c.category) }));
}

// ── Kolejka budowy (pas) ────────────────────────────────────────────────────

/**
 * Wiersze pasa kolejki: najpierw budowy w toku (biegną równolegle — bez zmiany kolejności), potem zamówienia oczekujące na
 * surowce w kolejności opłacania (te można przesuwać: wcześniejsze pierwsze dostaje brakujące surowce).
 * @param {{ construction?:Iterable<[string, object]>, pending?:Iterable<[string, object]> }} q wpisy `BuildingSystem`
 * @returns {Array<{ id:string, tileKey:string, kind:'construction'|'pending', buildingId:string, isUpgrade:boolean,
 *            targetLevel:number|null, frac:number, yearsLeft:number|null, cost:object|null, canEarlier:boolean, canLater:boolean }>}
 */
export function queueRows({ construction = [], pending = [] } = {}) {
  const rows = [];
  for (const [tileKey, e] of construction) {
    const bt = Number(e?.buildTime) || 0;
    const frac = bt > 0 ? Math.max(0, Math.min(1, (e.progress ?? 0) / bt)) : 1;
    rows.push({ id: `c:${tileKey}`, tileKey, kind: 'construction', buildingId: e.buildingId, isUpgrade: !!e.isUpgrade,
      targetLevel: e.targetLevel ?? null, frac, yearsLeft: bt > 0 ? Math.max(0, bt - (e.progress ?? 0)) : 0, cost: null,
      canEarlier: false, canLater: false });
  }
  const pend = [...pending];
  pend.forEach(([tileKey, e], i) => {
    rows.push({ id: `p:${tileKey}`, tileKey, kind: 'pending', buildingId: e.buildingId, isUpgrade: !!e.isUpgrade,
      targetLevel: e.targetLevel ?? null, frac: 0, yearsLeft: null, cost: e.cost ?? null,
      canEarlier: i > 0, canLater: i < pend.length - 1 });
  });
  return rows;
}

// ── Nagłówek ────────────────────────────────────────────────────────────────

export const CONSOLE_LENS_CHIPS = Object.freeze(['terrain', 'deposits', 'ownership', 'supply']);

/**
 * Czipy nagłówka w trzech grupach: widok (kolonia / stacja), soczewki, tryb budowy. `enabled: false` niesie `reasonKey`
 * (podpowiedź: dlaczego i co zrobić) — czip zostaje widoczny.
 * @param {{ lens?:string, supply?:boolean, buildMode?:boolean, station?:boolean, stationAvailable?:boolean,
 *           stationReasonKey?:string|null, canBuild?:boolean, buildReasonKey?:string|null }} s
 */
export function headerChips(s = {}) {
  const view = [
    { id: 'view:colony', labelKey: 'colonyConsole.view.colony', active: !s.station, enabled: true },
    { id: 'view:station', labelKey: 'colonyConsole.view.station', active: !!s.station, enabled: s.stationAvailable !== false,
      reasonKey: s.stationAvailable === false ? (s.stationReasonKey ?? 'colonyConsole.reason.stationTech') : null },
  ];
  const lens = CONSOLE_LENS_CHIPS.map((id) => ({
    id: `lens:${id}`, labelKey: id === 'supply' ? 'colonyConsole.lens.supply' : `colonySphere.lens.${id}`,
    active: id === 'supply' ? !!s.supply : (!s.supply && s.lens === id), enabled: true,
  }));
  const build = [{ id: 'build', labelKey: 'colonyConsole.buildMode', active: !!s.buildMode, enabled: s.canBuild !== false,
    reasonKey: s.canBuild === false ? (s.buildReasonKey ?? 'colonyConsole.reason.foreign') : null }];
  return { view, lens, build };
}

/** Następny stan soczewek po kliknięciu czipu: `{ lens, supply }`. Klik aktywnego czipu wyłącza go; zaopatrzenie i soczewka
 *  wykluczają się (zaopatrzenie zastępuje wypełnienia soczewki na kuli). */
export function lensAfterChip(state, chipId) {
  const lens = state?.lens ?? 'none', supply = !!state?.supply;
  if (chipId === 'supply') return { lens: 'none', supply: !supply };
  if (!CONSOLE_LENS_CHIPS.includes(chipId)) return { lens, supply };
  return { lens: (!supply && lens === chipId) ? 'none' : chipId, supply: false };
}

// ── Podsumowanie kolonii (nic nie zaznaczone) ───────────────────────────────

/** Liczba budynków wg kategorii (z aktywnych wpisów `BuildingSystem._active`), w kolejności palety. */
export function buildingCountsByCategory(activeEntries) {
  const rows = [];
  for (const e of activeEntries ?? []) {
    const b = e?.building;
    if (!b || b.isCapital) continue;
    rows.push({ category: b.category ?? 'civil' });
  }
  return categoriesOf(rows);
}

/**
 * Model podsumowania kolonii: populacja, mieszkania, wzrost, satysfakcja, bezrobocie, alarmy. Placówka / podgląd nie mają
 * cywilizacji — `civ: null` daje sam nagłówek rodzaju.
 */
export function colonySummaryOf(colony) {
  const civ = colony?.civSystem ?? null;
  const kind = colony?.isPreview ? 'preview' : colony?.isOutpost ? 'outpost' : 'colony';
  if (!civ || kind !== 'colony') return { kind, hasCiv: false };
  const humans = Math.floor(civ.humans ?? civ.population ?? 0);
  const housing = civ.housing ?? 0;
  const unemployed = civ.unemployed ?? 0;
  return {
    kind, hasCiv: true, humans, housing,
    housingFrac: housing > 0 ? Math.max(0, Math.min(1, humans / housing)) : 0,
    growth: civ.getAnnualGrowth?.() ?? 0,
    satisfaction: Math.round(civ.satisfaction ?? 50),
    unemployed, unemployedFrac: humans > 0 ? unemployed / humans : 0,
    famine: !!civ.isFamine, unrest: !!civ.isUnrest,
  };
}

/** Wiersze warstw załogi do podsumowania: tylko warstwy z etatami albo pracownikami; liczby całkowite. */
export function workforceRowsOf(breakdown) {
  const out = [];
  for (const r of breakdown ?? []) {
    const jobs = Math.round(Number(r?.jobs) || 0), workers = Math.round(Number(r?.workers) || 0);
    if (jobs <= 0 && workers <= 0) continue;
    out.push({ type: r.type, namePL: r.namePL ?? r.type, nameEN: r.nameEN ?? r.namePL ?? r.type, jobs, workers });
  }
  return out;
}

// ── Jednostka naziemna: rozkazy inspektora ──────────────────────────────────

export const UNIT_PACK_ORG_COST = 15;   // koszt organizacji zwinięcia garnizonu (jak panel jednostki)

/**
 * Rozkazy jednostki w inspektorze. Każdy rozkaz ma typ dzisiejszej strefy trafień (`unit*`) — mechanika bez zmian; rozkaz
 * niedostępny zostaje na liście jako wyłączony z powodem (`reasonKey` mówi też, co zrobić). Jednostka obca — tylko «odznacz».
 * @param {object} unit
 * @param {{ isEnemy?:boolean, inCombat?:boolean, canAnalyze?:boolean, hasSupportCandidates?:boolean, hasCombatSystem?:boolean }} c
 * @returns {Array<{ type:string, labelKey:string, params?:Array, enabled:boolean, danger?:boolean, reasonKey?:string|null, reasonParams?:Array }>}
 */
export function unitOrdersOf(unit, c = {}) {
  const out = [];
  if (!unit) return out;
  if (!c.isEnemy) {
    const idle = unit.status === 'idle';
    // garnizon: rozłóż / zwiń / anuluj
    if (unit.deployState === 'deploying' || unit.deployState === 'packing') {
      out.push({ type: 'unitCancelDeploy', labelKey: 'colonyConsole.order.cancelDeploy', enabled: true });
    } else if (unit.deployState === 'mobile') {
      const ok = unit.status !== 'moving';
      out.push({ type: 'unitDeploy', labelKey: 'colonyConsole.order.deploy', enabled: ok, reasonKey: ok ? null : 'colonyConsole.reason.unitMoving' });
    } else if (unit.deployState === 'deployed') {
      const ok = (unit.org ?? 0) >= UNIT_PACK_ORG_COST;
      out.push({ type: 'unitPackUp', labelKey: 'colonyConsole.order.pack', params: [UNIT_PACK_ORG_COST], enabled: ok,
        reasonKey: ok ? null : 'colonyConsole.reason.unitOrg', reasonParams: [UNIT_PACK_ORG_COST] });
    }
    // wsparcie bitwy z dystansu
    if ((unit.range ?? 1) >= 2 && !c.inCombat) {
      if (unit.supportTarget) out.push({ type: 'unitClearSupport', labelKey: 'colonyConsole.order.clearSupport', enabled: true });
      else if (c.hasCombatSystem) out.push({ type: 'unitSupportStart', labelKey: 'colonyConsole.order.support', enabled: !!c.hasSupportCandidates,
        reasonKey: c.hasSupportCandidates ? null : 'colonyConsole.reason.noBattle' });
    }
    // skan obszaru / analiza anomalii
    out.push({ type: 'unitSurvey', labelKey: 'colonyConsole.order.survey', enabled: idle, reasonKey: idle ? null : 'colonyConsole.reason.unitBusy' });
    if (c.canAnalyze) out.push({ type: 'unitAnalyze', labelKey: 'colonyConsole.order.analyze', enabled: idle, reasonKey: idle ? null : 'colonyConsole.reason.unitBusy' });
  }
  out.push({ type: 'drawerOpenUnit', labelKey: 'colonyConsole.order.details', enabled: true });   // pełna karta jednostki (klawisz I)
  out.push({ type: 'unitDeselect', labelKey: 'colonyConsole.order.deselect', enabled: true });
  return out;
}

// ── Jednostka naziemna: transport (załadunek / rozładunek na statek z ładownią wojsk) ──

/**
 * Wiersze transportu w inspektorze jednostki: statki gracza zadokowane w TEJ kolonii, które mają ładownię wojsk. Klik otwiera
 * dzisiejsze okno załadunku / rozładunku wojsk dla statku. Brak statku → jeden wiersz wyłączony z powodem (i co zrobić).
 * @param {Array<object>} vessels statki zadokowane w kolonii (`VesselManager.getVesselsAt`)
 * @returns {Array<{ id:string|null, name:string, used:number, capacity:number, enabled:boolean, reasonKey:string|null }>}
 */
export function troopTransportRows(vessels) {
  const rows = [];
  for (const v of vessels ?? []) {
    const cap = v?.troopCapacity ?? 0;
    if (!(cap > 0)) continue;
    if (v.ownerEmpireId || (v.owner && v.owner !== 'player')) continue;
    rows.push({ id: v.id, name: v.name ?? v.id, used: v.troopBayUsed ?? 0, capacity: cap, enabled: true, reasonKey: null });
  }
  if (!rows.length) rows.push({ id: null, name: '', used: 0, capacity: 0, enabled: false, reasonKey: 'colonyConsole.reason.noTransport' });
  return rows;
}

// ── Finding 740 — założenie placówki nie zmienia aktywnej kolonii ───────────

/**
 * Czy po założeniu placówki przełączyć na nią aktywną kolonię. Flaga OFF — jak dotąd (zawsze). Flaga ON (decyzja właściciela
 * 2026-11-18): tylko gdy gracz nie ma aktywnej pełnej kolonii (`isOutpost !== true`); placówka trafia na listę konsoli.
 */
export function shouldActivateFoundedOutpost(features, activeColony) {
  if (features?.colonySphere !== true) return true;
  return !(activeColony && activeColony.isOutpost !== true);
}
