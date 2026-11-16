// ConsoleSceneLogic — czy pod otwartą konsolą scena 3D ma się nie renderować (ARC KONSOLE K0a, D-K-5, Finding 730).
//
// Pod każdą zakładką scena układu renderowała się w 60 kl/s (5,3 ms GPU na klatkę przy 1600×1041), choć była zasłonięta albo
// prześwitywała przez tekst. Przy `FEATURES.consoleKit` ON: otwarta konsola = nieprzezroczyste tło `bgPrimary` na całym
// `#ui-canvas` + ThreeRenderer pomija WYŁĄCZNIE przebieg composera (wszystkie tiki — powtórka walki, reżyser CV, zegary HUD,
// kamera — biegną dalej, więc pierwsza klatka po zamknięciu jest świeża). Obserwatorium jest zwolnione (potrzebuje sceny).
//
// Jedno źródło decyzji dla OBU stron: UIManager (tło) i ThreeRenderer (pominięcie) pytają o ten sam predykat w chwili
// rysowania — renderer CIĄGNIE stan co klatkę (nie czeka na zdarzenie), więc nie ma klatki, w której mapa wraca bez sceny.
// Bez DOM i canvas — testowalne pod node (keeper `console_scene_smoke.mjs`).

// Zakładki spoza grup nawigacji, które też są ekranami pełnoekranowymi (U — projektant; P — populacja za flagą).
export const CONSOLE_EXTRA_TAB_IDS = Object.freeze(['unit_design', 'population']);
// Zwolnione z pominięcia sceny: Obserwatorium pokazuje podgląd ciała NA scenie (`enterObservatoryPreview`).
export const CONSOLE_SCENE_EXEMPT_IDS = Object.freeze(['observatory']);

// ── Tryby tła konsoli (D-K-5 poprawione przez właściciela 2026-11-16: świat widoczny i RUCHOMY za konsolą — ostry, tylko
//    przyciemniony; bez rozmycia i bez zasłony) ──
//   live (domyślny): scena renderuje się dalej pod konsolą (≈ 5,5 ms/klatkę — koszt przyjęty przez właściciela); filtr CSS na
//     płótnie WebGL (jasność `bright`; `blur` 0, `sat` 1 — pokrętła zostają), zasłona `bgPrimary` o kryciu `scrim` (domyślnie 0);
//   glass (debug): jak live, ale composer pominięty po jednej świeżej klatce (zamrożony świat, tiki biegną);
//   opaque (debug): nieprzezroczyste tło, composer pominięty, bez filtra.
//   glass i opaque — kandydaci na przyszłe ustawienie wydajności dla słabszych GPU (bez UI ustawień teraz).
export const CONSOLE_BG_MODES = Object.freeze(['glass', 'live', 'opaque']);
// Pokrętła szkła — czytane CO KLATKĘ (konsola: `KOSMOS.debug.consoleKit.tune.blur = 6` — skutek od następnej klatki).
export const CONSOLE_GLASS_DEFAULTS = Object.freeze({
  mode: 'live',
  blur: 0,          // px CSS rozmycia sceny (0 = ostra)
  bright: 0.4,      // jasność sceny pod konsolą (1 = bez zmian)
  sat: 1,           // nasycenie (1 = bez zmian)
  scrim: 0,         // krycie zasłony bgPrimary (domyślne; ekran może nadpisać w specyfikacji — `CONSOLE_SCREEN_SPECS`)
  fadeMs: 150,      // przejście filtra przy otwarciu i zamknięciu
});
export const CONSOLE_GLASS = { ...CONSOLE_GLASS_DEFAULTS };

/** Tryb tła: znany tryb albo domyślny (`CONSOLE_GLASS_DEFAULTS.mode`). */
export function consoleBgMode(knobs = CONSOLE_GLASS) {
  return CONSOLE_BG_MODES.includes(knobs?.mode) ? knobs.mode : CONSOLE_GLASS_DEFAULTS.mode;
}

/**
 * Decyzja tła dla jednej klatki renderera (czysta — tabela keepera).
 * @param {{ covered:boolean, mode:string, wasCovered:boolean }} s — `covered` = `consoleSceneActive`; `wasCovered` — czy
 *   poprzednia klatka była już pod konsolą w trybie z pominięciem (pierwsza klatka szkła renderuje się świeżo)
 * @returns {{ filter:boolean, skip:boolean, scrim:boolean, opaque:boolean }}
 */
export function consoleBackdrop(s) {
  if (!s?.covered) return { filter: false, skip: false, scrim: false, opaque: false };
  const mode = CONSOLE_BG_MODES.includes(s.mode) ? s.mode : CONSOLE_GLASS_DEFAULTS.mode;
  if (mode === 'opaque') return { filter: false, skip: true, scrim: false, opaque: true };
  if (mode === 'live') return { filter: true, skip: false, scrim: true, opaque: false };
  return { filter: true, skip: s.wasCovered === true, scrim: true, opaque: false };
}

/** Krycie zasłony dla ekranu: `spec.scrimAlpha` (specyfikacja ekranu) albo pokrętło `scrim`; klamra [0, 1]. */
export function consoleScrimAlpha(spec, knobs = CONSOLE_GLASS) {
  const v = Number.isFinite(spec?.scrimAlpha) ? spec.scrimAlpha
    : Number.isFinite(knobs?.scrim) ? knobs.scrim : CONSOLE_GLASS_DEFAULTS.scrim;
  return Math.max(0, Math.min(1, v));
}

/** Wartość CSS `filter` szkła z pokręteł (liczby nieskończone → wartości domyślne). */
export function glassFilterCss(knobs = CONSOLE_GLASS) {
  const n = (v, d) => (Number.isFinite(v) ? v : d);
  const D = CONSOLE_GLASS_DEFAULTS;
  return `blur(${n(knobs?.blur, D.blur)}px) brightness(${n(knobs?.bright, D.bright)}) saturate(${n(knobs?.sat, D.sat)})`;
}

/**
 * Zbiór id overlayów-zakładek objętych tłem konsoli: członkowie grup nawigacji (`NAV_GROUPS`) + dodatkowe zakładki,
 * minus zwolnione. Panele boczne (`eventLog`, `poi`) nie są zakładkami.
 * @param {Array<{members:string[]}>} navGroups
 * @returns {Set<string>}
 */
export function consoleTabIds(navGroups, extras = CONSOLE_EXTRA_TAB_IDS, exempt = CONSOLE_SCENE_EXEMPT_IDS) {
  const out = new Set();
  for (const g of navGroups ?? []) for (const m of g?.members ?? []) out.add(m);
  for (const id of extras ?? []) out.add(id);
  for (const id of exempt ?? []) out.delete(id);
  return out;
}

/**
 * Czy konsola zasłania scenę (tło nieprzezroczyste + pominięcie composera).
 * @param {{ enabled:boolean, civMode:boolean, globeOpen?:boolean, cleanView?:boolean, activeId:string|null,
 *           visible:boolean, tabIds:Set<string> }} s
 *   `visible` — widoczność aktywnego overlayu (ta sama, którą sprawdza `OverlayManager.draw`): overlay zamknięty od środka
 *   (przycisk [x]) przestaje zasłaniać scenę od razu, zanim menedżer wyzeruje `active`.
 */
export function consoleSceneActive(s) {
  if (!s || s.enabled !== true) return false;
  if (!s.civMode || s.globeOpen || s.cleanView) return false;   // poza civMode / globus / czysty widok — UI nie rysuje overlayu
  if (!s.activeId || s.visible !== true) return false;
  return !!s.tabIds?.has?.(s.activeId);
}
