// GalaxyChromeLogic — ARC GALAXY, krok G2-2 (docs/design/GALAXY_PLAN.md §4 G2; D-GX-13, D-GX-16, D-GX-17 (c), D-GX-22;
// rama F5): CZYSTA logika CHROMU płyty galaktyki w idiomie etykiet mapy układu — treść rozwinięcia najechania (≤ 4 linie),
// przypięcie z wierszem akcji i stanem skanu, reguła gęstości nazw, szyna statków przy gwieździe, tryb blipu obcego skoku warp,
// krycie chromu przy locie. Rysunek, odczyt świata i strefy kliku — podwarstwy HUD trybu galaktyki (`HudGalaxyLabelLayer`,
// `HudGalaxyRailLayer`, `HudGalaxyPingLayer`, `HudGalaxyRouteLayer`).
//   • ANTY-LUSTRO (Finding 188 → trzy powierzchnie): nazwa układu na płycie, w nagłówku przypięcia i w wierszu lewego
//     outlinera wynika z JEDNEJ reguły (`GalaxyOutlinerLogic.isGalaxyNameKnown` — `reveal.name` ∨ własna obecność);
//     właściciel i linia informacji — z tych samych funkcji co wiersz outlinera (`galaxyOwnerText`, `galaxyInfoText`).
//     Przypięcie / najechanie gwiazdy bez nazwy pokazuje „???” (nazwa na płycie — nic, wiersz — brak).
//   • PRZYPIĘCIE (D-GX-17 (c)): [ Wejdź ] (tylko gdy da się wejść — bramka G1), [ Wyślij ▼ ] (obecny, wyłączony do G3),
//     [ Skanuj ] / [ Skanuj dokładniej ] / [ Anuluj skan ] — skan ma tu JEDYNY przyszły dom (wymóg właściciela 2026-10-31):
//     `ObservatorySystem.startSystemScan` / `cancelSystemScan`, ta sama bramka obserwatorium (tier ≥ 1) i zasięg
//     (`STRATCOM_LY_BY_LEVEL` przez `ObservatoryRange` — D-GX-22, pokrętło `SCAN_RANGE_GATE`), te same komunikaty; chip
//     wyłączony z powodem (brak obserwatorium / poza zasięgiem / już zbadany / limit równoczesnych skanów). [ Beacon ] /
//     [ Gate ] POMINIĘTE (D-GX-17 (c) — bez mechaniki, §7 O5).
//   • GĘSTOŚĆ (D-GX-16): nigdy nie chowane — dom, własne, zaznaczona (= przypięta), najechana, cel nurkowania, skanowana;
//     pozostałe chowane przy nakładaniu, odsłaniane najechaniem; „pod gwiazdą, wyśrodkowana” jako pierwszy kandydat.
//   • SZYNA statków: wiersze OBOK gwiazdy (na prawo), nigdy na kwadracie wyboru gwiazdy (±`GALAXY_PICK_HALF_PX`) —
//     niezmiennik Findingu 110 (ikona nie kradnie kliku gwiazdy) przeniesiony z wachlarza Stratcomu; wiersze kafelkują
//     (bez nakładania), ponad `RAIL_MAX_ROWS` — „+N” bez strefy kliku; gwiazda poza kadrem — bez wierszy i bez stref.
//   • BLIP obcego skoku warp (dzisiejszy kanon Stratcomu, `_stratcomWarpBlipMode`): w zasięgu obserwatorium od domu (płasko),
//     wywiad o STATKU `contact` / `detailed` → pełny blip + linia trasy, inaczej duch „?” (bez trasy); własne — zawsze.
// Czysty: bez `window`, bez three, bez DOM; `t`, formatery i kanały świata podaje wołający.
import { GALAXY_PICK_HALF_PX } from './GalaxyModeLogic.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { systemIdOf } from '../utils/SystemScope.js';
import { inObservatoryRange } from '../utils/ObservatoryRange.js';

// Układ (px logiczne) i pokrętła logiki. Strojenie wyglądu — stałe rysunku w podwarstwach (bez pinów keepera).
export const GALAXY_CHROME = Object.freeze({
  MAX_LINES: 4,            // linie rozwinięcia najechania / przypięcia (idiom T1)
  RAIL_GAP_PX: 3,          // odstęp szyny od krawędzi kwadratu wyboru gwiazdy
  RAIL_MAX_ROWS: 3,        // wiersze szyny; dalsze — „+N” (bez strefy kliku)
  RAIL_PLUS_MIN: 2,        // G3: od tylu statków bez wiersza rysuje się „+N” (samotny statek — sam znacznik)
  RAIL_ROW_GAP: 1,         // odstęp wierszy szyny
  NOT_YET: 'G3',           // powód wyłączonego [ Wyślij ▼ ] (rozkaz warp z płyty — krok G3)
});

/** Przypięcie / najechanie gwiazdy bez nazwy — nagłówek (nazwa na płycie i wiersz outlinera — brak). */
export const UNNAMED_SYSTEM = '???';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ── Treść (wspólna z lewym outlinerem — anty-lustro) ─────────────────────────────────────────────────────────────────

/**
 * Właściciel układu — klucze panelu Stratcom (`fleet.stratcomEmpire*`): imperium wg osi właściciela, gracz, obcy, nieznany.
 * Ta sama funkcja zasila wiersz rozwinięcia lewego outlinera i linię przypięcia.
 * @param {{kind:'player'|'identity'|'foreign'|'unknown', empireId?:string|null}} owner — z `buildGalaxySystemList`
 * @param {{ t:Function, empireName?:(id:string)=>string|null }} o
 */
export function galaxyOwnerText(owner, { t, empireName = () => null } = {}) {
  if (owner?.kind === 'player') return t('fleet.stratcomEmpire', t('territory.playerEmpire'));
  if (owner?.kind === 'identity') return t('fleet.stratcomEmpire', empireName(owner.empireId) ?? '?');
  if (owner?.kind === 'foreign') return t('fleet.stratcomEmpireForeign');
  return t('fleet.stratcomEmpireUnknown');
}

/** Linia informacji: odległość ly · klasa widmowa · liczba kolonii (`leftOutliner.galaxyInfo`). */
export function galaxyInfoText(row, { t, fmtLy = (v) => num(v).toFixed(1) } = {}) {
  return t('leftOutliner.galaxyInfo', fmtLy(row?.distanceLY ?? 0), row?.spectral ?? '?', row?.colonyCount ?? '0');
}

/** Nazwa układu na powierzchni (`null` — bez nazwy: płyta nic, wiersz outlinera brak, przypięcie „???”). */
export function galaxyDisplayName(row) {
  return row?.known === true ? String(row.name ?? row.systemId ?? '') : null;
}

/** Nagłówek przypięcia / najechania (wersaliki — idiom nazw płyty). */
export function galaxyPinHeader(row, upper = (s) => String(s).toUpperCase()) {
  const n = galaxyDisplayName(row);
  return n == null ? UNNAMED_SYSTEM : upper(n);
}

/**
 * Linia skanu w rozwinięciu: w toku — „Skanowanie… 42% · 0,6 lat” (`fleet.scanProgress` + `fleet.etaYears`); ukończony —
 * skrót liczb wg osiągniętego tieru; brak — `null`.
 * @param {{ scanning?:{pct:number, progress:number, durationYears:number}|null, result?:{tier:number, counts:object}|null }} scan
 */
export function galaxyScanLine(scan, { t, fmtDec = (v, d) => num(v).toFixed(d) } = {}) {
  const s = scan?.scanning;
  if (s) {
    const rem = Math.max(0, num(s.durationYears) - num(s.progress));
    return `${t('fleet.scanProgress', Math.round(clamp01(num(s.pct)) * 100))} · ${t('fleet.etaYears', fmtDec(rem, 1))}`;
  }
  const r = scan?.result;
  if (r?.counts) {
    const c = r.counts;
    if (r.tier >= 3) return `${t('fleet.scanTotal')}: ${num(c.total)}`;
    if (r.tier >= 2) return `${t('fleet.scanPlanets')}: ${num(c.planets)} · ${t('fleet.scanMoons')}: ${num(c.moons)}`;
    return `${t('fleet.scanPlanets')}: ${num(c.planets)}`;
  }
  return null;
}

/**
 * G2 T4 — linia ciał układu: „planety N · księżyce N · planetoidy N”. Źródło (bez zmyślania danych):
 *   • układ wygenerowany i miejsce znane (`placeKnown`) → liczby z `StarSystemManager` (długości list id);
 *   • inaczej wynik skanu — tylko to, co ujawnia jego tier (1: planety, 2: + księżyce, 3: + planetoidy);
 *   • wynik skanu bez liczb → „skan: brak danych o ciałach”; brak źródła → `null` (linia nie powstaje).
 * @param {{ placeKnown?:boolean, sysData?:{planetIds?:any[], moonIds?:any[], planetoidIds?:any[]}|null,
 *   scanResult?:{tier:number, counts?:object}|null }} p
 */
export function galaxyBodiesLine({ placeKnown = false, sysData = null, scanResult = null } = {}, { t } = {}) {
  const low = (k) => String(t(k)).toLowerCase();
  const fmt = (pairs) => pairs.map(([k, n]) => `${low(k)} ${num(n)}`).join(' · ');
  if (placeKnown && sysData && Array.isArray(sysData.planetIds)) {
    return fmt([['fleet.scanPlanets', sysData.planetIds.length], ['fleet.scanMoons', sysData.moonIds?.length ?? 0],
      ['fleet.scanPlanetoids', sysData.planetoidIds?.length ?? 0]]);
  }
  if (!scanResult) return null;
  const c = scanResult.counts;
  if (!c) return t('galaxyPin.noBodyData');
  const pairs = [['fleet.scanPlanets', c.planets]];
  if (scanResult.tier >= 2) pairs.push(['fleet.scanMoons', c.moons]);
  if (scanResult.tier >= 3) pairs.push(['fleet.scanPlanetoids', c.planetoids]);
  return fmt(pairs);
}

/**
 * Rozwinięcie najechania / przypięcia (≤ 4 linie): właściciel · informacja (odległość, klasa, kolonie) · stan zbadania ·
 * skan (w toku albo wynik).
 */
export function galaxyExpansionLines(row, { t, ownerText, infoText, explored = false, scanLine = null } = {}) {
  const out = [ownerText ?? galaxyOwnerText(row?.owner, { t }), infoText ?? galaxyInfoText(row, { t }),
    t(explored ? 'fleet.clusterExplored' : 'fleet.clusterUnexplored')];
  if (scanLine) out.push(scanLine);
  return out.filter((s) => typeof s === 'string' && s.length > 0).slice(0, GALAXY_CHROME.MAX_LINES);
}

// ── Skan (jedyny przyszły dom — przypięcie) ──────────────────────────────────────────────────────────────────────────

/**
 * Stan chipu skanu przypięcia (tabela stanów — keeper):
 *   dom → brak chipu · skan w toku → [ Anuluj skan ] · zbadany → wyłączony „✓ Pełny skan” · obserwatorium < Lv2 →
 *   wyłączony „🔒 Wymaga Obs. Lv2” · poza zasięgiem (bramka zasięgu włączona) → wyłączony „Cel poza zasięgiem” · wynik
 *   na najwyższym tierze → wyłączony „✓ Pełny skan” · limit równoczesnych skanów → wyłączony (komunikat limitu) · wynik
 *   niższy → [ Skanuj dokładniej ] · inaczej → [ Skanuj ].
 * @param {{ isHome?:boolean, explored?:boolean, maxTier?:number, resultTier?:number|null, scanning?:boolean,
 *   atLimit?:boolean, inRange?:boolean, rangeGate?:boolean }} s
 * @returns {{ id:'scan'|'scanMore'|'scanCancel', labelKey:string, enabled:boolean, reasonKey:string|null }|null}
 */
export function galaxyScanChip({ isHome = false, explored = false, maxTier = 0, resultTier = null, scanning = false,
  atLimit = false, inRange = true, rangeGate = true } = {}) {
  if (isHome) return null;
  if (scanning) return { id: 'scanCancel', labelKey: 'fleet.scanCancel', enabled: true, reasonKey: null };
  const off = (reasonKey, id = 'scan') => ({ id, labelKey: id === 'scanMore' ? 'fleet.scanMore' : 'fleet.opsScan', enabled: false, reasonKey });
  if (explored) return off('fleet.scanComplete');
  if (!(maxTier > 0)) return off('fleet.scanLocked');
  if (rangeGate && inRange !== true) return off('tooltip.menu.outOfRange');
  const more = Number.isFinite(resultTier) && resultTier > 0;
  if (more && resultTier >= maxTier) return off('fleet.scanComplete', 'scanMore');
  if (atLimit) return off('fleet.scanLimitToast', more ? 'scanMore' : 'scan');
  return more
    ? { id: 'scanMore', labelKey: 'fleet.scanMore', enabled: true, reasonKey: null }
    : { id: 'scan', labelKey: 'fleet.opsScan', enabled: true, reasonKey: null };
}

// ── Cel wskaźnika (klik ≡ najechanie) ────────────────────────────────────────────────────────────────────────────────

/**
 * Cel wskaźnika nad płytą — JEDNA reguła dla kliku i najechania (Finding 109: oba wskazują ten sam układ):
 * przycisk przypięcia > nazwa przypiętej (jej gwiazda) > reszta przypięcia (pochłonięta — gwiazda pod spodem nie łapie,
 * reguła absorbera) > gwiazda pod kursorem (wygrywa z nazwą sąsiada — Finding 110) > nazwa (jej gwiazda) > nic.
 * @param {{ pinZone?:{kind:'btn'|'name'|'body', id?:string, starId?:string}|null, nameZone?:{id:string}|null,
 *   starUnder?:string|null }} p
 * @returns {{ kind:'btn'|'pinName'|'pinBody'|'star'|'name'|null, id:string|null, btnId?:string }}
 */
export function galaxyPointerTarget({ pinZone = null, nameZone = null, starUnder = null } = {}) {
  if (pinZone) {
    const id = pinZone.starId != null ? String(pinZone.starId) : null;
    if (pinZone.kind === 'btn') return { kind: 'btn', id, btnId: pinZone.id };
    return { kind: pinZone.kind === 'name' ? 'pinName' : 'pinBody', id };
  }
  if (starUnder != null) return { kind: 'star', id: String(starUnder) };
  if (nameZone) return { kind: 'name', id: String(nameZone.id) };
  return { kind: null, id: null };
}

/** Napis przycisku bez wiodącego symbolu („🔭 Skanuj układ” → „Skanuj układ”) — idiom chipów etykiet. */
export function stripLeadSymbol(s) {
  return String(s ?? '').replace(/^[^\p{L}\p{N}]+/u, '');
}

/**
 * Przyciski przypięcia: [ Wejdź ] (gdy da się wejść), [ Wyślij ▼ ] (aktywny z flagą `galaxyWarp`), chip skanu (`galaxyScanChip`).
 * @returns {Array<{ id:string, label:string, enabled:boolean, reason:string|null }>} — `reason`: tekst powodu wyłączenia
 */
export function galaxyPinButtons({ enterable = false, scanChip = null, sendEnabled = false, t } = {}) {
  const out = [];
  if (enterable) out.push({ id: 'enter', label: t('galaxyPin.enter'), enabled: true, reason: null });
  out.push({ id: 'send', label: t('galaxyPin.send'), enabled: sendEnabled === true, reason: sendEnabled === true ? null : GALAXY_CHROME.NOT_YET });
  if (scanChip) {
    out.push({ id: scanChip.id, label: stripLeadSymbol(t(scanChip.labelKey)), enabled: scanChip.enabled === true,
      reason: scanChip.reasonKey ? t(scanChip.reasonKey) : null });
  }
  return out;
}

/**
 * Wykonanie przycisku przypięcia (keeper pinuje wywołania):
 *   enter      → `K.galaxyMode.enterSystem(id)` (lot, gdy włączony — bramka 186 w kontrolerze);
 *   send       → `K.galaxyMode.toggleSendPicker(id)` (picker statków, G3-B);
 *   scan / scanMore → `K.observatorySystem.startSystemScan(id)`; odmowa → komunikat jak w Stratcomie (limit / brak
 *                obserwatorium / już skanowany);
 *   scanCancel → `cancelSystemScan(id, 'manual')`;
 *   wyłączony  → komunikat z powodem (bez akcji).
 * @returns {string|null} — co zrobiono
 */
export function runGalaxyPinAction(btn, { systemId, K = null, toast = null, t } = {}) {
  if (!btn || systemId == null) return null;
  if (btn.enabled !== true) {
    if (btn.reason) toast?.(btn.reason, 'warn');
    return 'disabled';
  }
  const obs = K?.observatorySystem;
  switch (btn.id) {
    case 'enter':
      return K?.galaxyMode?.enterSystem?.(systemId) ? 'enter' : 'enterRefused';
    case 'send':
      K?.galaxyMode?.toggleSendPicker?.(systemId);
      return 'send';
    case 'scan':
    case 'scanMore': {
      const ok = obs?.startSystemScan?.(systemId) === true;
      if (!ok) {
        const maxTier = obs?.getMaxSystemScanTier?.() ?? 0;
        const atLimit = !!obs && (obs.getActiveSystemScans?.()?.length ?? 0) >= (obs.getMaxConcurrentSystemScans?.() ?? 1);
        toast?.(t(maxTier <= 0 ? 'fleet.scanLockedToast' : atLimit ? 'fleet.scanLimitToast' : 'fleet.scanBusyToast'), 'warn');
        return 'scanRefused';
      }
      return 'scan';
    }
    case 'scanCancel':
      return obs?.cancelSystemScan?.(systemId, 'manual') ? 'scanCancel' : null;
    default:
      return null;
  }
}

// ── Gęstość nazw (D-GX-16) ───────────────────────────────────────────────────────────────────────────────────────────

/** Nazwa nigdy nie chowana: dom, własne, zaznaczona (= przypięta), najechana, cel nurkowania, skanowana. */
export function galaxyLabelEssential({ home = false, own = false, selected = false, hovered = false, dive = false,
  scanning = false } = {}) {
  return home || own || selected || hovered || dive || scanning;
}

// ── Szyna statków ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Model szyny (lustro `_stratcomOwnShipBlips` Stratcomu — ten sam zbiór): własne statki z bakiem warp albo w trakcie skoku;
 * w tranzycie warp — punkt na linii skoku (galaktyka x, y z misji; z — interpolacja między układami wg `galProgress`);
 * pozostałe — wiersze przy gwieździe swojego układu (kolejność: nazwa, potem id — stała między klatkami).
 * @param {{ vessels:Array, systems:Array }} p
 * @returns {{ bySystem: Map<string, object[]>, transit: Array<{ v:object, gx:number, gy:number, gz:number, fromId, toId }> }}
 */
export function galaxyShipRail({ vessels = [], systems = [] } = {}) {
  const byId = new Map((systems ?? []).map((s) => [String(s?.id), s]));
  const bySystem = new Map(), transit = [];
  for (const v of vessels ?? []) {
    if (!v || v.isWreck || isEnemyVessel(v)) continue;
    const m = v.mission;
    const jumping = m?.type === 'interstellar_jump';
    if (!(Number(v.warpFuel?.max) > 0) && !jumping) continue;
    if (jumping && m.phase === 'warp_transit') {
      const a = byId.get(String(m.fromSystemId)), b = byId.get(String(m.toSystemId));
      const p = Number.isFinite(m.galProgress) ? clamp01(m.galProgress) : 0.5;
      transit.push({ v, gx: num(m.currentGalX ?? m.fromGalX ?? a?.x), gy: num(m.currentGalY ?? m.fromGalY ?? a?.y),
        gz: num(a?.z) + (num(b?.z) - num(a?.z)) * p, fromId: m.fromSystemId ?? null, toId: m.toSystemId ?? null });
      continue;
    }
    const sid = systemIdOf(v);
    if (sid == null || !byId.has(String(sid))) continue;
    const k = String(sid);
    if (!bySystem.has(k)) bySystem.set(k, []);
    bySystem.get(k).push(v);
  }
  const key = (v) => `${String(v.name ?? '')}\u0000${String(v.id)}`;
  for (const list of bySystem.values()) list.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  return { bySystem, transit };
}

/**
 * ARC GALAXY G3 — gęstość szyny: które statki przy gwieździe mają wiersz z nazwą. Gwiazda otwarta (najechana, zaznaczona, kursor na jej
 * wierszu, chip [O] „Okręty” włączony) — wszystkie; inaczej wyłącznie statki zaznaczone. Reszta to „+N” przy znaczniku (od `RAIL_PLUS_MIN`).
 * @param {Array<object>} list — statki przy gwieździe (`galaxyShipRail`)
 * @param {{ open?:boolean, selIds?:Set<string>|null }} o
 * @returns {Array<object>} statki z wierszem, w kolejności listy
 */
export function railVisibleShips(list, { open = false, selIds = null } = {}) {
  const all = list ?? [];
  return open ? [...all] : all.filter((v) => selIds?.has?.(String(v?.id)) === true);
}

/**
 * Geometria szyny przy gwieździe (px logiczne): wiersze od `x0 = ax + pickHalf + gap` (nigdy na kwadracie wyboru gwiazdy),
 * pierwszy wyśrodkowany w pionie na gwieździe, kolejne w dół, bez nakładania; ponad `maxRows` — „+N” (bez strefy kliku).
 * `hidden` — statki bez wiersza (gęstość, `railVisibleShips`), wliczone do „+N”; bez wierszy „+N” stoi na miejscu pierwszego
 * (`rowH` — jego wysokość). `plusMin` — od tylu statków rysuje się „+N”; poniżej — brak (bez paska i bez przeszkody).
 * @param {{ ax:number, ay:number, rows:Array<{w:number, h:number}>, pickHalf?:number, gap?:number, maxRows?:number,
 *   plusW?:number, rowGap?:number, hidden?:number, rowH?:number, plusMin?:number }} p
 * @returns {{ rows:Array<{x:number, y:number, w:number, h:number, index:number}>, plus:{x:number, y:number, w:number, h:number, count:number}|null }}
 */
export function railLayout({ ax, ay, rows = [], pickHalf = GALAXY_PICK_HALF_PX, gap = GALAXY_CHROME.RAIL_GAP_PX,
  maxRows = GALAXY_CHROME.RAIL_MAX_ROWS, plusW = 18, rowGap = GALAXY_CHROME.RAIL_ROW_GAP, hidden = 0, rowH = 0, plusMin = 1 } = {}) {
  const x0 = num(ax) + pickHalf + gap;
  const shown = rows.slice(0, Math.max(0, maxRows));
  const h0 = shown[0]?.h ?? rows[0]?.h ?? rowH;
  let y = num(ay) - h0 / 2;
  const out = [];
  shown.forEach((r, i) => { out.push({ x: x0, y, w: Math.max(0, num(r.w)), h: Math.max(0, num(r.h)), index: i }); y += num(r.h) + rowGap; });
  const rest = rows.length - shown.length + Math.max(0, num(hidden));
  const plus = rest >= Math.max(1, plusMin) ? { x: x0, y, w: plusW, h: h0, count: rest } : null;
  return { rows: out, plus };
}

/** Tryb blipu statku na płycie (kanon Stratcomu): własny — `self`; obcy z wywiadem `contact` / `detailed` — `contact`, inaczej `rumor`. */
export function galaxyBlipMode(v, quality = 'unknown') {
  if (!isEnemyVessel(v)) return 'self';
  return (quality === 'contact' || quality === 'detailed') ? 'contact' : 'rumor';
}

/**
 * Obce statki w skoku warp widoczne na płycie: w zasięgu obserwatorium od domu (płasko — D-GX-22), z trybem blipu.
 * @returns {Array<{ v:object, gx:number, gy:number, gz:number, fromId, toId, mode:'contact'|'rumor' }>}
 */
export function galaxyEnemyBlips({ vessels = [], systems = [], home = { x: 0, y: 0 }, rangeLY = 0, qualityOf = () => 'unknown' } = {}) {
  const byId = new Map((systems ?? []).map((s) => [String(s?.id), s]));
  const out = [];
  for (const v of vessels ?? []) {
    if (!v || v.isWreck || !isEnemyVessel(v)) continue;
    const m = v.mission;
    if (!m || m.phase !== 'warp_transit') continue;
    const gx = num(m.currentGalX), gy = num(m.currentGalY);
    if (!inObservatoryRange({ x: gx, y: gy }, home, rangeLY)) continue;
    const a = byId.get(String(m.fromSystemId)), b = byId.get(String(m.toSystemId));
    const p = Number.isFinite(m.galProgress) ? clamp01(m.galProgress) : 0.5;
    out.push({ v, gx, gy, gz: num(a?.z) + (num(b?.z) - num(a?.z)) * p, fromId: m.fromSystemId ?? null, toId: m.toSystemId ?? null,
      mode: galaxyBlipMode(v, qualityOf(v.id)) });
  }
  return out;
}

// ── Krycie chromu i chipy ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Krycie podwarstw trybu galaktyki: w trakcie lotu — z osi czasu lotu (`flightAlpha`); poza lotem — rozjaśnienie od wejścia
 * w tryb (`fadeT0`, `fadeMs` — twarde cięcie G1).
 */
export function galaxyChromeAlpha({ flightAlpha = null, now = 0, fadeT0 = -Infinity, fadeMs = 250 } = {}) {
  if (Number.isFinite(flightAlpha)) return clamp01(flightAlpha);
  if (!(fadeMs > 0)) return 1;
  return clamp01((num(now) - (Number.isFinite(fadeT0) ? fadeT0 : -Infinity)) / fadeMs);
}
