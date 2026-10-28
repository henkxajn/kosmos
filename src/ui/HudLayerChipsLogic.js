// HudLayerChipsLogic — ARKUSZ HUD paczka B (B-3; D-HUD-7, D-HUD-13, D-HUD-14; HUD_PLAN.md §4.5): czysta logika CHIPÓW
// WARSTW na pasie dolnym i klawiszy — [R] radar · [T] trasy · [E] etykiety · [O] orbity (EN: [S] [R] [L] [O]).
// Czysty: bez three i bez DOM, bez `window`; stan podaje wołający (`window.KOSMOS.uiPrefs`).
//   • stan w `uiPrefs.hudLayers = { radar, routes, labels, orbits }` (zapis gry, v101 bez migracji — `?? true`); brak klucza —
//     warstwa włączona; `radar` wchłania dawny `uiPrefs.hudRadarVisible` (ARKUSZ HUD H1 — ☰ „Radar”): odczyt starego klucza
//     zachowany, zapis idzie wyłącznie do `hudLayers.radar` (stary klucz usunięty — jedno źródło);
//   • [O] wyłączone = filtr orbit „Żadne” bez ruszania wyboru z menu ☰ (orbita zaznaczonego ciała zostaje — D-HUD-7, 3b);
//     [E] wyłączone = etykiety stałe znikają, przypięcie i etykiety na żądanie (najechanie, zaznaczenie, alert) zostają;
//     [T] wyłączone = bez tras; [R] = ten sam przełącznik co ☰ „Radar” (tryb Y nadal wymusza radar);
//   • klawisze Digit6–Digit9 (kolejność = kolejność chipów; `e.code` — niezależnie od układu klawiatury), wyłącznie z fokusem na
//     mapie: tryb cywilizacji, bez overlayu, bez okna DOM, bez modyfikatorów (Shift — czysty widok, Ctrl — etykiety CTRL);
//   • chipy w idiomie chipów T5 (tekst „[ R ]”, 16 px — `CHIP_SPACED`, decyzja właściciela 2026-10-28): włączony — rola
//     `primary`; wyłączony — rola `dim`, przekreślony (`CHIP_OFF_STYLE` 'strike'; wariant „bez nawiasów” — 'bare'); szerokość
//     chipu ta sama w obu stanach (przełączenie nie przesuwa rzędu).

/** Warstwy chipów — kolejność rzędu i klawiszy. */
export const HUD_LAYER_KEYS = Object.freeze(['radar', 'routes', 'labels', 'orbits']);

/** Klawisze (`KeyboardEvent.code`) → warstwa (D-HUD-14). */
export const HUD_LAYER_CODES = Object.freeze({ Digit6: 'radar', Digit7: 'routes', Digit8: 'labels', Digit9: 'orbits' });

/** Klawisz (cyfra) warstwy — podpowiedź chipu. */
export const HUD_LAYER_KEY_LABEL = Object.freeze({ radar: '6', routes: '7', labels: '8', orbits: '9' });

// Stałe (px logiczne). Strojenie na bramce — z konsoli: `KOSMOS.hudLayer.tune({ CHIP_OFF_STYLE: 'bare' })`.
export const HUD_CHIPS_DEFAULTS = Object.freeze({
  CHIP_H: 16,               // wysokość chipu (rząd w pasie 20 px)
  CHIP_GAP: 4,              // odstęp chipów i od lewego końca pasa (jak dawny rząd doku)
  CHIP_PAD_X: 3,            // zapas szerokości chipu (każda strona)
  CHIP_ALPHA: 0.9,          // tekst chipu (jak chipy T5)
  CHIP_OFF_ALPHA: 0.9,      // tekst chipu wyłączonego (rola `dim` niesie przygaszenie)
  CHIP_HOVER_FILL: 0.18,    // podświetlenie pod kursorem (rola `primary`)
  CHIP_STRIKE_WIDTH: 1,     // przekreślenie (wariant „strike”)
  CHIP_OFF_STYLE: 'strike', // wyłączony: 'strike' — „[ R ]” przekreślone · 'bare' — samo „R” bez nawiasów
  CHIP_SPACED: 1,           // 1 — „[ R ]” (spacje jak w chipach T5), 0 — „[R]”
});
export const HUD_CHIPS = { ...HUD_CHIPS_DEFAULTS };

const C = HUD_CHIPS;

// ── Stan warstw ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Stan czterech warstw z `uiPrefs` (brak — włączone; radar — także dawny `hudRadarVisible`). */
export function readHudLayers(uiPrefs) {
  const L = uiPrefs?.hudLayers ?? {};
  const radar = typeof L.radar === 'boolean' ? L.radar : uiPrefs?.hudRadarVisible !== false;
  return {
    radar,
    routes: L.routes !== false,
    labels: L.labels !== false,
    orbits: L.orbits !== false,
  };
}

/** Zapis stanu warstwy (mutuje `uiPrefs`); radar — usuwa dawny klucz (jedno źródło). Zwraca nowy stan wszystkich warstw. */
export function setHudLayer(uiPrefs, layer, on) {
  if (!uiPrefs || !HUD_LAYER_KEYS.includes(layer)) return readHudLayers(uiPrefs);
  const L = (uiPrefs.hudLayers && typeof uiPrefs.hudLayers === 'object') ? { ...uiPrefs.hudLayers } : {};
  L[layer] = on === true;
  uiPrefs.hudLayers = L;
  if (layer === 'radar' && 'hudRadarVisible' in uiPrefs) delete uiPrefs.hudRadarVisible;
  return readHudLayers(uiPrefs);
}

/** Przełączenie warstwy; zwraca nowy stan warstwy. */
export function toggleHudLayer(uiPrefs, layer) {
  if (!HUD_LAYER_KEYS.includes(layer)) return null;
  const now = readHudLayers(uiPrefs)[layer];
  return setHudLayer(uiPrefs, layer, !now)[layer];
}

// ── Klawisze ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Warstwa dla `KeyboardEvent.code` albo `null`. */
export function layerForKeyCode(code) { return HUD_LAYER_CODES[code] ?? null; }

/**
 * Czy klawisz warstwy działa (fokus na mapie): tryb cywilizacji, bez overlayu pełnoekranowego, bez okna DOM i sceny planety,
 * bez modyfikatorów.
 */
export function layerKeyAllowed({ civMode = false, overlayOpen = false, modalOpen = false, planetSceneOpen = false,
  ctrl = false, alt = false, meta = false, shift = false } = {}) {
  return civMode === true && !overlayOpen && !modalOpen && !planetSceneOpen && !ctrl && !alt && !meta && !shift;
}

// ── Chipy ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Tekst chipu: włączony „[ R ]” (`CHIP_SPACED` 0 — „[R]”); wyłączony — przekreślony albo samo „R” (`CHIP_OFF_STYLE`). */
export function chipText(letter, on) {
  const L = String(letter ?? '');
  const br = C.CHIP_SPACED ? `[ ${L} ]` : `[${L}]`;
  if (on) return { text: br, strike: false };
  return C.CHIP_OFF_STYLE === 'bare' ? { text: L, strike: false } : { text: br, strike: true };
}

/** Szerokość chipu (px): tekst z nawiasami (najszerszy z dwóch stanów) + zapas — ta sama dla włączonego i wyłączonego. */
export function chipWidth(letter, measure) {
  const L = String(letter ?? '');
  const br = C.CHIP_SPACED ? `[ ${L} ]` : `[${L}]`;
  const w = Math.max(measure?.(br) ?? br.length * 6, measure?.(L) ?? L.length * 6);
  return Math.ceil(w) + 2 * C.CHIP_PAD_X;
}

/**
 * Rząd chipów od lewego końca pasa: `x0` — lewy koniec pasa (`MapInsets.left`), `stripTop` / `stripH` — pas; chipy po kolei
 * z odstępem `CHIP_GAP`, wyśrodkowane w pionie. `limitX` — granica z prawej (pierwszy element klastra po prawej); chip, który
 * by ją przekroczył — pominięty (wąskie okno).
 * @returns {Array<{ layer:string, x:number, y:number, w:number, h:number }>}
 */
export function layoutLayerChips({ x0, stripTop, stripH, widths, limitX = Infinity }) {
  const out = [];
  const h = C.CHIP_H, y = stripTop + (stripH - h) / 2;
  let x = x0 + C.CHIP_GAP;
  for (let i = 0; i < HUD_LAYER_KEYS.length; i++) {
    const w = widths?.[i] ?? 0;
    if (!(w > 0) || x + w > limitX - C.CHIP_GAP) break;
    out.push({ layer: HUD_LAYER_KEYS[i], x, y, w, h });
    x += w + C.CHIP_GAP;
  }
  return out;
}

/** Chip pod punktem (px logiczne) albo `null`. */
export function chipAt(chips, x, y) {
  for (const c of chips ?? []) if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return c;
  return null;
}

// ── Strojenie ────────────────────────────────────────────────────────────────────────────────────────────────────────

export function tuneHudChips(patch = {}) {
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (!(k in HUD_CHIPS_DEFAULTS)) continue;
    const d = HUD_CHIPS_DEFAULTS[k];
    if (typeof d === 'number' && Number.isFinite(v)) HUD_CHIPS[k] = v;
    else if (typeof d === 'string' && typeof v === 'string') HUD_CHIPS[k] = v;
  }
  return { ...HUD_CHIPS };
}
export function resetHudChips() { Object.assign(HUD_CHIPS, HUD_CHIPS_DEFAULTS); return { ...HUD_CHIPS }; }
