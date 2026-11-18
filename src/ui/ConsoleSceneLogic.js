// ConsoleSceneLogic — czy pod otwartą konsolą scena 3D ma się nie renderować (ARC KONSOLE K0a, D-K-5, Finding 730).
//
// Otwarta zakładka-konsola ma za sobą żywy, ostry, przyciemniony świat (D-K-5 poprawione przez właściciela 2026-11-16): scena
// renderuje się dalej (≈ 5,5 ms/klatkę — koszt przyjęty; Finding 730 otwarty), płótno WebGL dostaje filtr CSS z pokręteł
// `CONSOLE_GLASS`, a UIManager maluje zasłonę `bgPrimary` o kryciu `scrim` (domyślnie 0). Obserwatorium jest zwolnione.
// KZ-Kit: na stałe — flaga `consoleKit` i tryby debug `glass` / `opaque` usunięte (żaden ekran ani ustawienie ich nie używało;
// gdyby wróciła potrzeba trybu wydajności dla słabszych GPU — historia w git, commit KZ-Kit).
//
// Jedno źródło decyzji dla OBU stron: UIManager (zasłona) i ThreeRenderer (filtr) pytają o ten sam predykat w chwili
// rysowania — renderer CIĄGNIE stan co klatkę (nie czeka na zdarzenie).
// Bez DOM i canvas — testowalne pod node (keeper `console_scene_smoke.mjs`).

// Zakładki spoza grup nawigacji, które też są ekranami pełnoekranowymi (U — projektant; P — populacja za flagą).
export const CONSOLE_EXTRA_TAB_IDS = Object.freeze(['unit_design', 'population']);
// Zwolnione z pominięcia sceny: Obserwatorium pokazuje podgląd ciała NA scenie (`enterObservatoryPreview`).
export const CONSOLE_SCENE_EXEMPT_IDS = Object.freeze(['observatory']);

// ── Pokrętła tła konsoli (ustawienia właściciela 2026-11-16: ostra scena, jasność 0,4, bez rozmycia i zasłony) ──
// Czytane CO KLATKĘ (konsola: `KOSMOS.debug.consoleKit.tune.bright = 0.5` — skutek od następnej klatki).
export const CONSOLE_GLASS_DEFAULTS = Object.freeze({
  blur: 0,          // px CSS rozmycia sceny (0 = ostra)
  bright: 0.4,      // jasność sceny pod konsolą (1 = bez zmian)
  sat: 1,           // nasycenie (1 = bez zmian)
  scrim: 0,         // krycie zasłony bgPrimary (domyślne; ekran może nadpisać w specyfikacji — `CONSOLE_SCREEN_SPECS`)
  fadeMs: 150,      // przejście filtra przy otwarciu i zamknięciu
});
export const CONSOLE_GLASS = { ...CONSOLE_GLASS_DEFAULTS };

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
 * Czy konsola leży nad sceną (filtr płótna WebGL + zasłona + zgaszone plakietki mapy).
 * @param {{ civMode:boolean, globeOpen?:boolean, cleanView?:boolean, activeId:string|null,
 *           visible:boolean, tabIds:Set<string> }} s
 *   `visible` — widoczność aktywnego overlayu (ta sama, którą sprawdza `OverlayManager.draw`): overlay zamknięty od środka
 *   (przycisk [x]) przestaje zasłaniać scenę od razu, zanim menedżer wyzeruje `active`.
 */
export function consoleSceneActive(s) {
  if (!s) return false;
  if (!s.civMode || s.globeOpen || s.cleanView) return false;   // poza civMode / globus / czysty widok — UI nie rysuje overlayu
  if (!s.activeId || s.visible !== true) return false;
  return !!s.tabIds?.has?.(s.activeId);
}

/**
 * ARC KONSOLE K7-A (decyzja właściciela na bramce K7-A) — reguła zestawu dla KAŻDEGO ekranu konsoli: plakietki i znaczniki mapy
 * nie są rysowane, gdy konsola zasłania scenę; wracają po zamknięciu. Warstwa HUD (`#hud-canvas`: etykiety ciał i statków,
 * alarmy, trasy) gaśnie już pod każdym overlayem (`hudGate` → `overlay`); tu — rodziny sprite'ów-znaczników w scenie 3D,
 * gaszone TYLKO na czas renderu klatki (`ThreeRenderer._hideConsoleMapBadges`, wzór `_applyFlightFade`) — bez zmiany stanu.
 * Scena (gwiazda, planety, orbity, modele statków, efekty) zostaje. Klucz = pole rodziny w ThreeRenderer.
 */
export const CONSOLE_HIDDEN_MAP_BADGES = Object.freeze([
  'colonyBuildingMarkers',   // ikony budynków kolonii na planecie (`ColonyBuildingMarkers`)
  'lifeGlows',               // kropka planety gracza / życia (`_lifeGlows`)
  'tacticalGlyphs',          // tryb Y: glify statków
  'tacticalGhosts',          // tryb Y: duchy ETA w punktach celu
  'tacticalOrbitMarkers',    // tryb Y: znaczniki przyszłej pozycji na orbitach
  'enemyAlertMarkers',       // pulsujące znaczniki wrogów
  'poiSprites',              // znaczniki punktów zainteresowania (POI)
]);

/** Czy w tej klatce gasić plakietki mapy: konsola leży nad sceną (ten sam predykat co filtr i zasłona). */
export function consoleHidesMapBadges(covered) {
  return covered === true;
}
