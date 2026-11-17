// ConsoleLayoutLogic — czysta geometria konsoli (ARC KONSOLE K0a, docs/design/CONSOLES_PLAN.md §3, D-K-1, D-K-17).
//
// JEDNO źródło geometrii i skali UI dla ekranu konsoli: overlay liczy strefy RAZ w draw() (`consoleZones`) i trzyma
// wynik; obsługa wejścia (klik / ruch / kółko) czyta zapamiętane strefy — nigdy `window.inner*` (Finding 734 / ryzyko 2:
// pięć ekranów liczyło skalę UI po swojemu i kliknięcia rozjeżdżały się z rysunkiem).
//
// Szablon 4-strefowy (D-K-1): (1) nagłówek — tytuł + czipy podzakładek + [ x ]; (2) lista — to, co gracz wybiera;
// (3) bohater — jedna duża rzecz ekranu; (4) inspektor — szczegóły wyboru + akcje; opcjonalny pas pod bohaterem
// (kolejka / oś czasu / pochylnia). Wariant 3-strefowy (D-K-14): bez bohatera, szeroka lista, pas pod listą.
// Rezerwacje: prostokąt klastra zegara i dzwonka (zawsze na wierzchu, rysowany przez BottomControlBar — Finding 727)
// oraz gniazdo paska walki po prawej w nagłówku (D-K-17).
//
// Bez DOM i canvas — testowalne pod node (keeper `console_layout_smoke.mjs`). Wszystkie wymiary w px LOGICZNYCH.

import { COSMIC } from '../config/LayoutConfig.js';
import { bottomNavBarRect, navSlotLayout } from './BottomNavBarLogic.js';
import { BOTTOM_STRIP_H } from './MapInsets.js';

// Skala UI względem bazowego 1280×720 — ta sama reguła co `UIManager._recalcDimensions` (px okna → px logiczne).
export const UI_BASE_W = 1280;
export const UI_BASE_H = 720;

// Stałe układu (px logiczne). Strojenie z konsoli przeglądarki: `KOSMOS.debug.consoleKit.tuneLayout({ LIST_W: 300 })`.
export const CONSOLE_LAYOUT_DEFAULTS = Object.freeze({
  HEADER_H: 30,        // pasmo nagłówka (tytuł, czipy, [ x ])
  LIST_W: 280,         // szerokość listy (wariant 4-strefowy)
  INSP_W: 340,         // szerokość inspektora
  STRIP_H: 112,        // wysokość pasa (0 = pas wyłączony)
  GAP: 10,             // odstęp między strefami
  PAD: 12,             // margines wewnętrzny ramy konsoli
  CLOSE_W: 34,         // gniazdo [ x ] w nagłówku
  COMBAT_SLOT_W: 520,  // gniazdo paska walki w nagłówku (0 = bez gniazda). K0b: 280 (= COMBAT_STRIP.MIN_W) → 520 — linia paska
                       //   z czipami [ Obserwuj ] / [ Reżyser ] / [ ▼ ] ma naturalnie ≈ 510 px; w 280 tekst nachodził na siebie
  MIN_HERO_W: 240,     // poniżej — lista i inspektor kurczą się proporcjonalnie
  MIN_TITLE_W: 160,    // gniazdo walki nie zjada tytułu i czipów poniżej tej szerokości
  ZONE_INSET: 6,       // wcięcie treści wewnątrz ramy strefy (`insetRect`)
});
export const CONSOLE_LAYOUT = { ...CONSOLE_LAYOUT_DEFAULTS };

// Specyfikacje ekranów (id overlayu → spec `consoleZones` + `scrimAlpha` zasłony szkła, D-K-5 poprawione). Brak wpisu =
// wartości domyślne (`CONSOLE_LAYOUT`, `CONSOLE_GLASS.scrim`). Ekrany dopisują tu swoje wymiary w krokach K0b+.
// (Nadpisanie zasłony Cywilizacji 0,25 zdjęte po bramce K0a — zasłona 0 wszędzie, świat ostry i przyciemniony.)
export const CONSOLE_SCREEN_SPECS = {};

// Ekrany przebudowane na zestawie konsoli (id overlayu → klucz flagi `FEATURES`, D-K-20). Ekran zestawu rysuje własny nagłówek
// z czipami podzakładek — pas subnav grupy nie jest wtedy rysowany ani trafiany, a overlay zaczyna się tuż pod górną belką;
// pasek walki siada w gnieździe nagłówka (D-K-17). Każdy wpis wymaga też `consoleKit` (żywa, przyciemniona scena za tekstem).
// K2: Dyplomacja i Wojny (jedna flaga rodziny) — z Wywiadem cała grupa Dyplomacji jest na czipach nagłówka.
// K3: Budżet, Przepływy i Handel (Handel + Rynek) — rodzina Ekonomii, jedna flaga. K4: Produkcja (`economy`) dołącza — pięć czipów, bez subnav.
export const CONSOLE_KIT_SCREENS = Object.freeze({ intel: 'consoleIntel', shipyard: 'consoleShipyard',
  diplomacy: 'consoleDiplomacy', war: 'consoleDiplomacy', budget: 'consoleEconomy', flows: 'consoleEconomy',
  trade: 'consoleEconomy', economy: 'consoleEconomy' });

/** Czy overlay `id` rysuje się teraz jako ekran zestawu konsoli (flagi czytane w chwili wywołania). */
export function isKitScreen(id, features) {
  const key = id ? CONSOLE_KIT_SCREENS[id] : null;
  return !!key && features?.consoleKit === true && features?.[key] === true;
}

/**
 * K1c-B (D-K-12 a) — dokąd prowadzi skrót zakładki: z konsolą Stoczni klawisz U (`unit_design`) otwiera projektanta Stoczni
 * (konsola Stoczni JEST projektantem). Projektant jednostek naziemnych zostaje w Dowództwo → Naziemne i w szkicu Kolonii.
 * Flagi OFF → id bez zmian (dzisiejszy ekran U).
 */
export function routeOverlayId(id, features) {
  return id === 'unit_design' && isKitScreen('shipyard', features) ? 'shipyard' : id;
}

/** Strojenie stałych układu: nieznane klucze i nie-liczby pominięte; zwraca bieżące wartości. */
export function tuneConsoleLayout(patch = {}) {
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (k in CONSOLE_LAYOUT_DEFAULTS && Number.isFinite(v) && v >= 0) CONSOLE_LAYOUT[k] = v;
  }
  return { ...CONSOLE_LAYOUT };
}
export function resetConsoleLayout() { Object.assign(CONSOLE_LAYOUT, CONSOLE_LAYOUT_DEFAULTS); return { ...CONSOLE_LAYOUT }; }

/**
 * Widok logiczny z rozmiaru okna (px CSS): `scale` = min(innerW/1280, innerH/720), `W`/`H` = px logiczne (zaokrąglone).
 * Ta sama reguła co UIManager — jedyne miejsce, z którego ekran konsoli bierze skalę (zamiast `window.inner*` w handlerach).
 * @returns {{ scale:number, W:number, H:number }}
 */
export function uiViewport(innerW, innerH) {
  const iw = Math.max(1, Number(innerW) || 0), ih = Math.max(1, Number(innerH) || 0);
  const scale = Math.min(iw / UI_BASE_W, ih / UI_BASE_H);
  return { scale, W: Math.round(iw / scale), H: Math.round(ih / scale) };
}

/** Prostokąt z granic overlayu `{ox, oy, ow, oh}` (BaseOverlay._getOverlayBounds) albo przepuszcza `{x, y, w, h}`. */
export function boundsRect(b) {
  if (!b) return { x: 0, y: 0, w: 0, h: 0 };
  if ('ox' in b) return { x: b.ox, y: b.oy, w: b.ow, h: b.oh };
  return { x: b.x ?? 0, y: b.y ?? 0, w: b.w ?? 0, h: b.h ?? 0 };
}

/**
 * Prostokąt klastra zegara i dzwonka pod overlayem pełnoekranowym: ostatni slot paska nawigacji, pas `BOTTOM_STRIP_H` tuż nad
 * paskiem (ta sama rachuba co `BottomControlBar.draw` z `strip = null`).
 * @returns {{ x:number, y:number, w:number, h:number }|null}
 */
export function consoleClockRect(W, H, navCount) {
  if (!(navCount > 0)) return null;
  const slots = navSlotLayout(bottomNavBarRect(W, H), navCount);
  const last = slots[slots.length - 1];
  if (!last) return null;
  const y = H - COSMIC.BOTTOM_LOG_TRIG_H - COSMIC.BOTTOM_NAV_H - BOTTOM_STRIP_H;
  return { x: last.x, y, w: last.w, h: BOTTOM_STRIP_H };
}

const R = (x, y, w, h) => ({ x: Math.round(x), y: Math.round(y), w: Math.max(0, Math.round(w)), h: Math.max(0, Math.round(h)) });
const overlapsX = (r, x0, x1) => !!r && r.w > 0 && r.x < x1 && r.x + r.w > x0;

/**
 * Strefy konsoli w granicach overlayu.
 * @param {{x,y,w,h}|{ox,oy,ow,oh}} bounds — granice overlayu (px logiczne)
 * @param {{ variant?:'4zone'|'3zone', listW?:number, inspW?:number, stripH?:number, headerH?:number,
 *           clock?:{x,y,w,h}|null, combatSlotW?:number }} [spec] — brakujące pola z `CONSOLE_LAYOUT`; `stripH: 0` — bez pasa;
 *           `combatSlotW: 0` — bez gniazda walki; `clock` — prostokąt klastra zegara (`consoleClockRect`), strefy pod nim
 *           kończą się nad nim
 * @returns {{ variant:string, frame, header, title, close, combatSlot, clock, list, hero, inspector, strip, body }}
 *   `hero` = null w wariancie 3-strefowym; `strip` = null przy `stripH` 0; `combatSlot` = null bez gniazda
 */
export function consoleZones(bounds, spec = {}) {
  const L = CONSOLE_LAYOUT;
  const b = boundsRect(bounds);
  const s = spec ?? {};
  const variant = s.variant === '3zone' ? '3zone' : '4zone';
  const headerH = Number.isFinite(s.headerH) ? Math.max(0, s.headerH) : L.HEADER_H;
  const stripH = Number.isFinite(s.stripH) ? Math.max(0, s.stripH) : L.STRIP_H;
  let listW = Number.isFinite(s.listW) ? Math.max(0, s.listW) : L.LIST_W;
  let inspW = Number.isFinite(s.inspW) ? Math.max(0, s.inspW) : L.INSP_W;
  const combatW = Number.isFinite(s.combatSlotW) ? Math.max(0, s.combatSlotW) : L.COMBAT_SLOT_W;
  const { GAP: gap, PAD: pad } = L;

  // ── Nagłówek: [tytuł + czipy …] [gniazdo walki] [ x ] ──
  const header = R(b.x, b.y, b.w, headerH);
  const close = R(header.x + header.w - pad - L.CLOSE_W, header.y, Math.min(L.CLOSE_W, Math.max(0, header.w - 2 * pad)), headerH);
  const titleX = header.x + pad;
  let combatSlot = null;
  if (combatW > 0) {
    const w = Math.min(combatW, Math.max(0, close.x - gap - titleX - L.MIN_TITLE_W - gap));
    if (w > 0) combatSlot = R(close.x - gap - w, header.y, w, headerH);
  }
  const titleRight = (combatSlot ? combatSlot.x : close.x) - gap;
  const title = R(titleX, header.y, titleRight - titleX, headerH);

  // ── Ciało ──
  const top = b.y + headerH + gap;
  const bottom = b.y + b.h - pad;
  const left = b.x + pad, right = b.x + b.w - pad;
  const clock = s.clock && s.clock.w > 0 ? R(s.clock.x, s.clock.y, s.clock.w, s.clock.h) : null;
  // Dół kolumny [x0, x1]: nad klastrem zegara, gdy ten na nią zachodzi (Finding 727).
  const bottomAt = (x0, x1) => (overlapsX(clock, x0, x1) && clock.y < bottom ? Math.min(bottom, clock.y - gap) : bottom);

  const avail = Math.max(0, right - left);
  let list, hero = null, inspector, strip = null;
  if (variant === '4zone') {
    // Wąsko: lista i inspektor kurczą się proporcjonalnie, bohater trzyma MIN_HERO_W (o ile w ogóle się mieści).
    const need = listW + inspW + 2 * gap + L.MIN_HERO_W;
    if (need > avail && listW + inspW > 0) {
      const k = Math.max(0, avail - 2 * gap - L.MIN_HERO_W) / (listW + inspW);
      listW = Math.floor(listW * k); inspW = Math.floor(inspW * k);
    }
    const lx = left, ix = right - inspW;
    const hx = lx + listW + gap, hw = Math.max(0, ix - gap - hx);
    list = R(lx, top, listW, bottomAt(lx, lx + listW) - top);
    inspector = R(ix, top, inspW, bottomAt(ix, right) - top);
    const heroBottom = bottomAt(hx, hx + hw);
    if (stripH > 0) {
      const sh = Math.min(stripH, Math.max(0, heroBottom - top - gap));
      strip = R(hx, heroBottom - sh, hw, sh);
      hero = R(hx, top, hw, strip.y - gap - top);
    } else {
      hero = R(hx, top, hw, heroBottom - top);
    }
  } else {
    inspW = Math.min(inspW, Math.max(0, avail - gap));
    const ix = right - inspW;
    const lw = Math.max(0, ix - gap - left);
    inspector = R(ix, top, inspW, bottomAt(ix, right) - top);
    const listBottom = bottomAt(left, left + lw);
    if (stripH > 0) {
      const sh = Math.min(stripH, Math.max(0, listBottom - top - gap));
      strip = R(left, listBottom - sh, lw, sh);
      list = R(left, top, lw, strip.y - gap - top);
    } else {
      list = R(left, top, lw, listBottom - top);
    }
  }
  return { variant, frame: R(b.x, b.y, b.w, b.h), header, title, close, combatSlot, clock, list, hero, inspector, strip,
    body: R(left, top, avail, bottom - top) };
}

/** Prostokąt pomniejszony o `d` px z każdej strony (treść wewnątrz ramy strefy); nigdy ujemny. */
export function insetRect(r, d = CONSOLE_LAYOUT.ZONE_INSET) {
  if (!r) return null;
  return R(r.x + d, r.y + d, r.w - 2 * d, r.h - 2 * d);
}

/** Nazwa strefy pod punktem (`header` | `list` | `hero` | `inspector` | `strip` | `clock`) albo null. Zegar ma pierwszeństwo. */
export function zoneAt(zones, x, y) {
  if (!zones) return null;
  const inR = (r) => !!r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  for (const k of ['clock', 'header', 'list', 'hero', 'inspector', 'strip']) if (inR(zones[k])) return k;
  return null;
}

/** Prostokąty stref się nie nakładają (poza klastrem zegara, który leży NAD konsolą) — kontrola dla keepera i bramki. */
export function zonesOverlap(zones) {
  const rs = ['header', 'list', 'hero', 'inspector', 'strip'].map((k) => zones?.[k]).filter((r) => r && r.w > 0 && r.h > 0);
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], c = rs[j];
      if (a.x < c.x + c.w && a.x + a.w > c.x && a.y < c.y + c.h && a.y + a.h > c.y) return true;
    }
  }
  return false;
}
