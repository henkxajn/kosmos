// LabelPinLogic — REFORMA ZAKŁADEK T2 (TABS_REFORM_PLAN.md §5.1–§5.2; D-TR-1 (a) — przypięcie, D-TR-4 (a), D-TR-5 (a); treść
// wg tabel I7 §3.1 / §3.2 / §3.4): czysta logika PRZYPIĘCIA etykiety z akcjami. Rysunek, strefy kliku i odczyt świata —
// `HudLabelLayer` (gałąź za flagą `labelPin`); spięcie z kartą ciała i panelem stacji — `UIManager`, Esc — `GameScene`.
//   • PRZYPIĘCIE = ZAZNACZENIE (D-UI-5 bez zmian: 1. klik zaznacza i przypina, 2. klik — kamera): ciało = zaznaczone ciało
//     (`UIManager._selectedEntity`), stacja = panel stacji w stanie „otwarty” (`StationPanel.visible` + `_stationId`) —
//     BEZ nowego pola stanu; `readClickSelection.entityId / stationId` czyta przypięcie z konstrukcji. Przy ON karta ciała
//     i panel stacji się nie rysują i nie łapią kliku (ich stan zostaje źródłem przypięcia);
//   • jedno przypięcie naraz (D-TR-5 (a)): przypięcie stacji zdejmuje przypięcie ciała (`body:deselected` z powodem
//     `PIN_SWAP_REASON` — renderer nie rusza wtedy kamery, panel stacji go nie słucha), przypięcie ciała chowa panel stacji;
//     panel statku (T3) — osobno;
//   • akcje wołają DZISIEJSZE cele co do metody: „Mapa ciała” = `BottomContext._doAction` (wszystkie 4 warianty — w tym
//     jedyny producent `planet:previewMap`), „Raport” = `showBodyDetailModal` (orbita, fizyka, skład, złoża, ✏ — D-TR-4 (a)),
//     „Zarządzaj” = `StationPanel._onHit({ type: 'manage' })`, ✕ ciała = `body:deselected` (dzisiejsze „−” karty), ✕ stacji =
//     `StationPanel._onHit({ type: 'close' })`; listy (złoża, ruch, moduły, magazyn) — rozwijane z limitem wierszy;
//     „Mapa ciała” tylko wtedy, gdy `_doAction` coś zrobi (strojenie 1, 554 — obca kolonia bez moich wojsk i bez skanu: brak);
//   • położenie (strojenie 1, zachowanie 5): przypięty pasek rośnie W DÓŁ jak przy najechaniu (górna krawędź z przypięcia
//     położenia T1 — przypięcie po najechaniu bez skoku), a gdy wszedłby na tarczę swojego ciała, ciała-gospodarza stacji albo
//     kotwicy stosu — przesuwa się W GÓRĘ dokładnie o nadmiar; bez miejsca w kadrze — przeskakuje POD tarczę i rośnie w dół;
//     sąsiedzi ustępują jak dotąd;
//   • Esc (D-TR-5 (a), 534) zdejmuje przypięcie po zaznaczeniu statku; przy otwartym overlayu (przypięcie leży pod nim, a
//     overlay sam używa Esc — np. tryb budowy) i przy otwartym oknie DOM (raport ciała) — nie (overlay / okno dostają Esc).
// Czysty: bez three, bez DOM i bez `window`; `K` (= `window.KOSMOS`), `emit`, `t` i otwieracz raportu podaje wołający.
import { isLabelHoverActive, bodyCardAction } from './LabelHoverLogic.js';
import { HUD_LABELS, labelCandidates, rectOverlapArea, rectCircleOverlap, insideRect } from './HudLabelLogic.js';
import { readClickSelection } from './ClickIntentLogic.js';
import { systemIdOf } from '../utils/SystemScope.js';
import { isPlayerColony } from '../utils/ColonyOwnership.js';

/** Flaga kroku — `true` wyłącznie przy `features.labelPin === true` (brak klucza = OFF). */
export const isLabelPinOn = (features) => features?.labelPin === true;
/** Przypięcie stoi na rozwinięciu T1 (warstwa etykiet HUD) — wymaga `hudLabels`, `labelHover` i `labelPin`. */
export const isLabelPinActive = (features) => isLabelHoverActive(features) && isLabelPinOn(features);

// Stałe (px logiczne). Strojenie na bramce.
export const LABEL_PIN = Object.freeze({
  LIST_LIMIT: 5,            // wiersze listy w przypięciu; reszta — „+N więcej” (`fleet.manifestMore`)
  BTN_GAP: 6,               // odstęp przycisków w wierszu akcji
  ROW_PAD_Y: 2,             // wiersz akcji — zapas nad i pod tekstem (strefa kliku wyższa niż linia tekstu)
  ROW_MAX_W: 230,           // szerokość wiersza akcji — dalsze przyciski w następnym wierszu
  BTN_HIT_PAD_X: 2,         // strefa kliku przycisku — zapas w poziomie
});

/** Powód `body:deselected` przy zamianie przypięcia ciało → stacja (renderer bez polecenia kamery, panel stacji zostaje). */
export const PIN_SWAP_REASON = 'pin_swap';

/**
 * Klucz treści przypiętego obiektu (`body:X` / `station:Y`) ze stanu zaznaczenia (`readClickSelection`) albo `null`.
 * Ciało przed stacją (przy ON naraz jest najwyżej jedno — `enforceSinglePinOn*`).
 */
export function pinnedContentKey(sel) {
  if (sel?.entityId != null) return 'body:' + sel.entityId;
  if (sel?.stationId != null) return 'station:' + sel.stationId;
  return null;
}

// ── Treść przypięcia ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Nazwa przycisku z klucza karty bez dekoracji „► ” (styl etykiety: „[ Mapa ciała ]”). */
export const stripArrow = (s) => String(s ?? '').replace(/^►\s*/, '');
/** Nagłówek listy z karty bez dwukropka („Złoża:” → „Złoża”). */
export const stripColon = (s) => String(s ?? '').replace(/:\s*$/, '');

/**
 * Złoża widoczne w przypięciu — LUSTRO `BottomContext._visibleDeposits` (keeper pinuje zgodność na tabeli ciał) bez ucięcia
 * do 12 (lista przypięcia ma własny limit): zbadane ∨ dom ∨ poza trybem cywilizacji.
 */
export function visibleDeposits(entity, K) {
  if (!entity) return [];
  const deposits = Array.isArray(entity.deposits) ? entity.deposits : [];
  if (deposits.length === 0) return [];
  const homePl = K?.homePlanet;
  const isHome = !!homePl && entity.id === homePl.id;
  if (!(entity.explored || !K?.civMode || isHome)) return [];
  return deposits;
}

/**
 * Linia dystansu od planety macierzystej — LUSTRO `BottomContext._distLine` (B3 → przypięcie, I7): nie gwiazda, z orbitą,
 * tryb cywilizacji, ciało ≠ dom; ODSTĘPSTWO od karty: tylko ciało z UKŁADU domu — współrzędne są lokalne dla układu, więc
 * dystans do ciała z innego układu nie ma sensu (karta przy OFF podaje go — kandydat w raporcie T2). `distAU(entity)` podaje
 * wołający (`DistanceUtils.fromHomePlanetAU`), `fmt` — liczbę.
 * @returns {{ text:string, warn:boolean }|null}
 */
export function homeDistanceLine(entity, K, { distAU, fmt, t }) {
  if (!entity || entity.type === 'star' || !entity.orbital) return null;
  const homePl = K?.homePlanet;
  if (!K?.civMode || !homePl || entity === homePl) return null;
  if (systemIdOf(entity) !== systemIdOf(homePl)) return null;
  const d = distAU?.(entity);
  if (!Number.isFinite(d)) return null;
  return { text: t('ui.distShort', fmt ? fmt(d) : d.toFixed(2)), warn: d > 15 };
}

/** Gwiazdki bogactwa złoża — reguła karty ciała (★★★ ≥ 0,7 · ★★ ≥ 0,4 · ★). */
export function depositStars(d) {
  const pct = d?.totalAmount > 0 ? d.remaining / d.totalAmount : 0;
  const rich = d?.richness ?? pct;
  return rich >= 0.7 ? '★★★' : rich >= 0.4 ? '★★' : '★';
}

/** Wiersze listy złóż (kolejność jak na karcie): „Fe ★★★”. */
export function depositRows(deposits) {
  return (deposits ?? []).map((d) => `${d?.resourceId ?? '?'} ${depositStars(d)}`);
}

/** Wiersze listy ruchu stacji (`gatherStationTraders` — jedyny konsument przy ON): „Kurier — w drodze”. */
const TRADER_STATUS_KEY = { inbound: 'station.statusInbound', docked: 'station.statusDocked', outbound: 'station.statusOutbound' };
export function trafficRows(traders, t) {
  return (traders ?? []).map((tr) => `${tr?.name ?? tr?.vesselId ?? '?'} — ${t(TRADER_STATUS_KEY[tr?.status] ?? 'station.statusDocked')}`);
}

/**
 * Wiersze listy modułów stacji (jak panel stacji): „🏠 Habitat ✓” / „👥✗” (brak załogi) / „⚡✗” (inne wyłączenie).
 * @param {object} station
 * @param {{ modules:object, lang:string }} o — `STATION_MODULES`, język
 */
export function moduleRows(station, { modules, lang }) {
  return (station?.modules ?? []).map((m) => {
    const def = modules?.[m?.moduleType];
    const nm = (lang === 'en' ? def?.nameEN : def?.namePL) ?? m?.moduleType ?? '?';
    const badge = m?.active === false ? (m.inactiveReason === 'no_crew' ? '👥✗' : '⚡✗') : '✓';
    return `${def?.icon ?? '▪'} ${nm} ${badge}`;
  });
}

/**
 * Wiersze listy magazynu stacji (jak panel stacji): pula hubu — pozycje sumy; własny magazyn (sierota) — surowce i towary;
 * stacja z matką bez puli — brak listy (linia „magazyn: …” rozwinięcia wystarcza).
 * @param {{ mother:object|null, pool:{total:Map|Array}|null, depot:{resources:Array, commodities:Array}|null,
 *           label:(id)=>string, fmt:(n)=>string }} o
 */
export function storageRows({ mother = null, pool = null, depot = null, label = (id) => id, fmt = (n) => String(n) } = {}) {
  const row = ([id, amt]) => `${label(id)}: ${fmt(amt)}`;
  if (mother) {
    if (!pool) return [];
    return [...(pool.total ?? [])].filter(([, v]) => v > 0).map(row);
  }
  return [...(depot?.resources ?? []), ...(depot?.commodities ?? [])].filter(([, v]) => v > 0).map(row);
}

/**
 * Limit listy: pierwsze `limit` wierszy + „+N więcej” (istniejący klucz `fleet.manifestMore`).
 * @returns {{ rows:string[], more:number }}
 */
export function limitRows(rows, t, limit = LABEL_PIN.LIST_LIMIT) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length <= limit) return { rows: [...list], more: 0 };
  const more = list.length - limit;
  return { rows: [...list.slice(0, limit), t('fleet.manifestMore', more)], more };
}

/**
 * Czy „Mapa ciała” coś zrobi (strojenie 1, Finding 554) — LUSTRO `BottomContext._doAction` (keeper pinuje zgodność na tabeli
 * ciał z prawdziwym `_doAction`): akcja karty (`bodyCardAction`); obca kolonia — moje wojska na ciele ALBO pełny skan
 * (`analyzed`); bez obu `_doAction` nic nie robi. Przy ON przycisk ukryty; karta ciała przy OFF — bez zmian (`_actionLabel`).
 */
export function mapActionWorks(entity, K) {
  const act = bodyCardAction(entity, K);
  if (!act) return false;
  if (act === 'takeCiv') return true;
  const cm = K?.colonyManager;
  const homePl = K?.homePlanet;
  const isHome = !!homePl && entity.id === homePl.id;
  if (isHome || cm?.hasColony?.(entity.id)) {
    const col = cm?.getColony?.(entity.id);
    if (!col || isPlayerColony(col)) return true;                                   // własna — mapa kolonii
    const mine = (K?.groundUnitManager?.getUnitsOnPlanet?.(entity.id) ?? []).some((u) => !u.owner || u.owner === 'player');
    if (mine) return true;                                                          // obca z moimi wojskami — mapa ciała
  }
  return !!K?.civMode && entity.analyzed === true && entity.type !== 'star';       // podgląd tylko do odczytu
}

/**
 * Przyciski przypięcia CIAŁA (I7 §3.1): „Mapa ciała” (gdy karta dziś ją ma — `bodyCardAction`, lustro `_actionLabel` — i gdy
 * jej cel coś zrobi — `mapActionWorks`, 554; nazwa z klucza karty), „Raport” (nie gwiazda — `BodyDetailModal` nie opisuje
 * gwiazdy), „Złoża” (lista; gdy karta dziś je pokazuje), ✕.
 * @returns {Array<{ id:string, label:string, list?:string, open?:boolean }>}
 */
export function bodyPinButtons(entity, K, { t, openList = null } = {}) {
  const out = [];
  if (!entity) return out;
  const act = bodyCardAction(entity, K);
  if (act && mapActionWorks(entity, K)) out.push({ id: 'map', label: stripArrow(t(act === 'takeCiv' ? 'context.takeCiv' : 'context.openMap')) });
  if (entity.type !== 'star') out.push({ id: 'report', label: t('labelPin.report') });
  if (visibleDeposits(entity, K).length > 0) {
    const open = openList === 'deposits';
    out.push({ id: 'list:deposits', list: 'deposits', open, label: `${stripColon(t('ui.deposits'))} ${open ? '▲' : '▼'}` });
  }
  out.push({ id: 'close', label: '✕' });
  return out;
}

/**
 * Przyciski przypięcia STACJI (I7 §3.4): stacja gracza — „Zarządzaj” (jedyna droga z mapy do zakładki Stacja), listy (ruch,
 * moduły, magazyn — tylko niepuste; nazwy z nagłówków panelu stacji), ✕; stacja obca — sam ✕ (mgła wojny: rozwinięcie podaje
 * właściciela wg wywiadu, przypięcie nie ujawnia ruchu, modułów ani magazynu).
 * @param {{ foreign:boolean, traffic:number, modules:number, storage:number }} counts
 */
export function stationPinButtons(counts, { t, openList = null } = {}) {
  const out = [];
  if (!counts?.foreign) {
    out.push({ id: 'manage', label: t('station.mgmt.manage') });
    const list = (id, key, n) => {
      if (!(n > 0)) return;
      const open = openList === id;
      out.push({ id: 'list:' + id, list: id, open, label: `${t(key)} ${open ? '▲' : '▼'}` });
    };
    list('traffic', 'station.traders', counts?.traffic);
    list('modules', 'station.modules', counts?.modules);
    list('storage', 'station.depot', counts?.storage);
  }
  out.push({ id: 'close', label: '✕' });
  return out;
}

/**
 * Układ wiersza akcji: przyciski od lewej, kolejne wiersze po przekroczeniu `maxW` (px). `widthOf(label)` — szerokość
 * napisu przycisku („[ etykieta ]”).
 * @returns {Array<Array<{ id:string, x:number, w:number }>>} wiersze
 */
export function layoutButtonRows(buttons, widthOf, maxW = LABEL_PIN.ROW_MAX_W, gap = LABEL_PIN.BTN_GAP) {
  const rows = [];
  let row = [], x = 0;
  for (const b of buttons ?? []) {
    const w = Math.max(0, widthOf(b) || 0);
    if (row.length && x + w > maxW) { rows.push(row); row = []; x = 0; }
    row.push({ id: b.id, x, w });
    x += w + gap;
  }
  if (row.length) rows.push(row);
  return rows;
}

/** Lista otwarta w przypięciu — akordeon (jedna naraz); ponowny klik zamyka; inne przypięcie — żadna. */
export function toggleOpenList(state, ck, listId) {
  const cur = state && state.ck === ck ? state.list : null;
  return { ck, list: cur === listId ? null : listId };
}
export function openListFor(state, ck) {
  return state && state.ck === ck ? (state.list ?? null) : null;
}

// ── Rozkład z przypięciem T2 (I8.3) ──────────────────────────────────────────────────────────────────────────────────

/**
 * Prostokąt etykiety na jej przypiętym kandydacie (ta sama rachuba co `placeLabelsPinned`: kandydat liczony z wysokością
 * sprzed rozwinięcia, klamra do kadru) — `null`, gdy etykieta bez przypięcia albo bez kadru.
 */
export function pinnedBox(it, rect) {
  if (!it?.pin || !rect) return null;
  const R = HUD_LABELS;
  const cands = labelCandidates({ ...it, h: it.pin.baseH > 0 ? it.pin.baseH : it.h });
  const ci = Number.isInteger(it.pin.cand) && it.pin.cand >= 0 && it.pin.cand < cands.length ? it.pin.cand : 0;
  const c = cands[ci];
  const x = Math.max(rect.x + R.EDGE, Math.min(rect.x + rect.w - R.EDGE - it.w, c.x));
  const y = Math.max(rect.y + R.EDGE, Math.min(rect.y + rect.h - R.EDGE - it.h, c.y));
  return { x, y, w: it.w, h: it.h };
}

/**
 * Rozkład z przypięciem T2 (I8.3) — krok PRZED `placeLabelsPinned`: etykieta z przypięciem położenia T1 (najechany sąsiad,
 * szyna — rosną w dół), której przypięty prostokąt wszedłby na przypiętą etykietę T2 (`pinLabel`, na jej przypiętym
 * kandydacie), traci przypięcie (`yieldedToPin` — warstwa zapomina jej pamięć przypięcia) i w rozkładzie omija przypiętą jak
 * każda wolna etykieta: przypięta stoi, sąsiad ustępuje. Brak przypiętej albo przypięta bez przypięcia położenia (pierwsza
 * klatka) — lista bez zmian.
 * @returns {Array<object>} nowa lista (te same obiekty poza tymi, które ustąpiły)
 */
export function yieldToPinnedLabel(items, { rect } = {}) {
  const list = Array.isArray(items) ? items : [];
  const pin = list.find((it) => it?.pinLabel === true) ?? null;
  const P = pin ? pinnedBox(pin, rect) : null;
  if (!P) return [...list];
  const g = HUD_LABELS.GAP;
  const pinBox = { x: P.x - g, y: P.y - g, w: P.w + 2 * g, h: P.h + 2 * g };
  return list.map((it) => {
    if (it === pin) return it;
    const b = pinnedBox(it, rect);
    if (!b || rectOverlapArea(b, pinBox, 0) <= 0) return it;
    const { pin: _drop, ...free } = it;
    return { ...free, yieldedToPin: true };
  });
}

/**
 * Nadmiar etykiety (px) nad tarczą: o ile trzeba ją podnieść, żeby jej dolna krawędź nie weszła na tarczę `z` (koło
 * { cx, cy, r }) w pasie jej szerokości; 0 — etykieta tarczy nie dotyka albo tarcza leży całkiem obok pasa.
 */
export function discExcess(b, z) {
  if (!b || !z || !(z.r > 0) || !rectCircleOverlap(b, z.cx, z.cy, z.r)) return 0;
  const dx = Math.max(b.x - z.cx, 0, z.cx - (b.x + b.w));
  if (dx >= z.r) return 0;
  return Math.max(0, b.y + b.h - (z.cy - Math.sqrt(z.r * z.r - dx * dx)));
}

/**
 * Położenie przypiętej etykiety (strojenie 1, zachowanie 5): pasek rośnie W DÓŁ jak przy najechaniu — start = przypięcie
 * położenia T1 `pin` ({ cand, baseH } — górna krawędź jak przed rozwinięciem; bez przypięcia — pierwszy kandydat, w którym
 * etykieta o wysokości `baseH` mieści się w kadrze); gdy pasek wszedłby na tarczę swojego ciała (`it.clear`) albo na tarcze
 * `keepOut` (ciało-gospodarz stacji, kotwica stosu), przesuwa się W GÓRĘ dokładnie o nadmiar (`discExcess`); bez miejsca
 * w kadrze na przesunięcie — POD tarczę (kandydat „pod” po tej samej stronie, najniższy poziom bez kolizji; rośnie w dół).
 * Mała tarcza — nadmiar 0, przypięcie po najechaniu bez skoku. Wynik koduje położenie jako przypięcie `{ cand, baseH }`
 * (kandydat „nad” z `baseH` powiększonym o przesunięcie — ta sama rachuba co `placeLabelsPinned` i `pinnedBox`); `start` —
 * przypięcie startowe (bez przesunięcia: lista zwinięta — etykieta wraca na miejsce); żadne położenie bez kolizji — start
 * (`clean: false`, rozkład wciśnie w kadr).
 * @param {{ ax:number, ay:number, clear?:number, w:number, h:number }} it — etykieta z pełną wysokością
 * @param {{ x:number, y:number, w:number, h:number }} rect — kadr (obszar mapy)
 * @param {{ pin?:{cand:number, baseH:number}|null, baseH?:number|null, keepOut?:Array<{cx:number, cy:number, r:number}> }} o
 * @returns {{ cand:number, baseH:number, start:{cand:number, baseH:number}, shift:number, flipped:boolean, clean:boolean,
 *   x:number, y:number }|null}
 */
export function pinLabelPlacement(it, rect, { pin = null, baseH = null, keepOut = [] } = {}) {
  if (!it || !rect || !(it.w > 0) || !(it.h > 0)) return null;
  const R = HUD_LABELS;
  const base = pin?.baseH > 0 ? pin.baseH : (baseH > 0 ? baseH : it.h);
  const c0s = labelCandidates({ ...it, h: base });
  let cand = Number.isInteger(pin?.cand) && pin.cand >= 0 && pin.cand < c0s.length ? pin.cand : -1;
  if (cand < 0) cand = Math.max(0, c0s.findIndex((c) => insideRect({ x: c.x, y: c.y, w: it.w, h: base }, rect, R.EDGE)));
  const c0 = c0s[cand];
  const start = { cand, baseH: base };
  const zones = [...((it.clear ?? 0) > 0 ? [{ cx: it.ax, cy: it.ay, r: it.clear }] : []), ...(keepOut ?? [])].filter((z) => z && z.r > 0);
  const boxAt = (y, x = c0.x) => ({ x, y, w: it.w, h: it.h });
  // Kolizja = nadmiar > 0 (ta sama miara co przesunięcie — etykieta styczna do tarczy po przesunięciu nie „wchodzi” na nią
  // przez błąd zaokrąglenia).
  const hits = (b) => zones.some((z) => discExcess(b, z) > 1e-6);
  if (!c0.below) {
    // Rośnie w dół z miejsca T1; nadmiar nad tarczą — w górę o tyle (kilka obiegów: po podniesieniu może wejść na tarczę wyżej).
    let shift = 0;
    for (let k = 0; k < 6; k++) {
      const b = boxAt(c0.y - shift);
      const need = zones.reduce((m, z) => Math.max(m, discExcess(b, z)), 0);
      if (!(need > 1e-9)) break;
      shift += need;
    }
    const b = boxAt(c0.y - shift);
    if (!hits(b) && b.y >= rect.y + R.EDGE - 1e-6) return { cand, baseH: base + shift, start, shift, flipped: false, clean: true, x: b.x, y: b.y };
  } else if (!hits(boxAt(c0.y))) {
    return { cand, baseH: base, start, shift: 0, flipped: false, clean: true, x: c0.x, y: c0.y };
  }
  // Pod tarczę: kandydat „pod” po tej samej stronie (górna krawędź nie zależy od wysokości), najniższy poziom bez kolizji.
  const cs = labelCandidates(it);
  for (let lv = 0; lv < R.LEVELS; lv++) {
    const i = 2 * R.LEVELS + 2 * lv + (c0.side === 'W' ? 1 : 0), c = cs[i];
    const b = boxAt(c.y, c.x);
    if (!insideRect(b, rect, R.EDGE)) break;   // kolejne poziomy — jeszcze niżej
    if (!hits(b)) return { cand: i, baseH: it.h, start, shift: c.y - c0.y, flipped: true, clean: true, x: b.x, y: b.y };
  }
  return { cand, baseH: base, start, shift: 0, flipped: false, clean: false, x: c0.x, y: c0.y };
}

// ── Strefy kliku przypięcia (przycisk > etykieta > tarcza / sprite) ───────────────────────────────────────────────────

/**
 * Strefa przypięcia pod punktem: przycisk (`btn`), linia nazwy (`name` — klik = reguła D-UI-5: 2. klik, kamera), reszta
 * przypiętej etykiety (`body` — klik pochłonięty, nie idzie do mapy). Kolejność stref = przyciski, potem nazwa, potem całość.
 * @param {Array<{kind:'btn'|'name'|'body', x:number, y:number, w:number, h:number}>} zones
 * @returns {object|null}
 */
export function pinHitAt(zones, x, y) {
  if (!Array.isArray(zones) || !zones.length || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const inside = (z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
  for (const kind of ['btn', 'name', 'body']) {
    for (let i = zones.length - 1; i >= 0; i--) if (zones[i].kind === kind && inside(zones[i])) return zones[i];
  }
  return null;
}

// ── Akcje (dzisiejsze cele) ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Wykonanie przycisku przypięcia — DZISIEJSZE cele co do metody (keeper pinuje wywołania):
 *   map     → `K.uiManager._bottomContext._doAction(entity)` (4 warianty karty: własna kolonia — `switchActiveColony` +
 *             `openPanel('colony')`; obca z moimi wojskami — `openPanel('colony', { colonyId })`; ciało `analyzed` bez kolonii
 *             (i obca kolonia bez moich wojsk) — `planet:previewMap`; Generator — `planet:colonize`);
 *   report  → `showReport(entity)` (`showBodyDetailModal`);
 *   manage  → `K.stationPanel._onHit({ type: 'manage' })` (zakładka Stacja gospodarza; panel — przypięcie — zdjęty);
 *   close   → ciało: `body:deselected` (dzisiejsze „−”); stacja: `K.stationPanel._onHit({ type: 'close' })` (dzisiejsze ✕);
 *   list:*  → `{ toggle: <lista> }` (stan listy trzyma warstwa).
 * @returns {string|{toggle:string}|null}
 */
export function runPinAction(id, { ck, entity = null, K = null, emit = null, showReport = null } = {}) {
  const isBody = typeof ck === 'string' && ck.startsWith('body:');
  if (typeof id === 'string' && id.startsWith('list:')) return { toggle: id.slice(5) };
  switch (id) {
    case 'map':
      if (!isBody || !entity) return null;
      K?.uiManager?._bottomContext?._doAction?.(entity);
      return 'map';
    case 'report':
      if (!isBody || !entity) return null;
      showReport?.(entity);
      return 'report';
    case 'manage':
      if (isBody) return null;
      K?.stationPanel?._onHit?.({ type: 'manage' });
      return 'manage';
    case 'close':
      if (isBody) emit?.('body:deselected');
      else K?.stationPanel?._onHit?.({ type: 'close' });
      return 'close';
    default:
      return null;
  }
}

// ── Jedno przypięcie naraz i Esc (D-TR-5 (a)) ────────────────────────────────────────────────────────────────────────

/**
 * Przypięcie STACJI zdejmuje przypięcie ciała (wołane po `station:selected`, gdy panel stacji już „otwarty”): odznaczenie
 * z powodem `PIN_SWAP_REASON` — `UIManager` czyści zaznaczenie ciała, renderer orbity i znaczniki BEZ polecenia kamery,
 * panel stacji go nie słucha. Flaga OFF / poza trybem cywilizacji — nic (jak dziś: karta i panel niezależne).
 * @returns {boolean} czy zdjęto przypięcie ciała
 */
export function enforceSinglePinOnStation({ K = null, emit = null, features = null } = {}) {
  if (!isLabelPinActive(features) || !K?.civMode) return false;
  if (!K?.uiManager?._selectedEntity) return false;
  emit?.('body:deselected', { reason: PIN_SWAP_REASON });
  return true;
}

/**
 * Przypięcie CIAŁA chowa panel stacji (wołane po `body:selected`). Flaga OFF / poza trybem cywilizacji — nic.
 * @returns {boolean} czy zdjęto przypięcie stacji
 */
export function enforceSinglePinOnBody({ K = null, features = null } = {}) {
  if (!isLabelPinActive(features) || !K?.civMode) return false;
  const sp = K?.stationPanel;
  if (!sp?.visible) return false;
  sp.hide?.();
  return true;
}

/**
 * Esc nad oknem DOM `.kosmos-modal-overlay` (raport ciała otwarty z przypięcia) należy do okna — kaskada mapy (statek,
 * przypięcie, overlay, menu ☰) stoi, okno zamyka się własnym Esc. Bez tego Esc w raporcie zamykał okno i JEDNOCZEŚNIE
 * otwierał menu ☰ (zmierzone w grze). Flaga OFF / poza trybem cywilizacji — `false` (kaskada jak dziś).
 */
export function escapeHeldByModal({ K = null, features = null, domModalOpen = false } = {}) {
  return isLabelPinActive(features) && !!K?.civMode && domModalOpen === true;
}

/**
 * Esc zdejmuje przypięcie (D-TR-5 (a), Finding 534) — krok kaskady `GameScene` PO zaznaczeniu statku. Nic, gdy: flaga OFF,
 * poza trybem cywilizacji, otwarty overlay pełnoekranowy (przypięcie leży pod nim; Esc należy do overlayu — np. tryb budowy
 * mapy kolonii), otwarte okno DOM (raport ciała zamyka się własnym Esc), brak przypięcia.
 * @returns {'body'|'station'|null}
 */
export function escapeUnpin({ K = null, emit = null, features = null, overlayOpen = false, modalOpen = false } = {}) {
  if (!isLabelPinActive(features) || !K?.civMode || overlayOpen || modalOpen) return null;
  const ck = pinnedContentKey(readClickSelection(K));
  if (!ck) return null;
  if (ck.startsWith('body:')) { emit?.('body:deselected'); return 'body'; }
  K?.stationPanel?._onHit?.({ type: 'close' });
  return 'station';
}
