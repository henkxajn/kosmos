// HudOrbitLogic — styl orbit w kolorach motywu (ARKUSZ HUD H0, D-HUD-7, D-HUD-15; HUD_PLAN.md §2.6, §4.1, §5.0).
// Czysty moduł: bez three, bez DOM, zero kolorów na sztywno — barwy z tokenów motywu (`orbitLine`, `orbitColony`)
// i ról HUD (`HudPalette.resolveHudRoles`: zaznaczona i najechana — `primary`, niestabilna — `alert`), czytanych przy
// KAŻDYM wywołaniu. Używany WYŁĄCZNIE przy fladze `FEATURES.hudOrbits` (brak klucza = OFF); ścieżka OFF zostaje
// w `ThreeRenderer` co do bitu (dzisiejsze hexy).
//   • krycie = dzisiejsze × 0,8 (D-HUD-7); dzisiejsze — tabela ORBIT_BASE_OPACITY, lustro literałów ścieżki OFF
//     (pilnowane keeperem `hud_orbits_smoke` na źródle `ThreeRenderer`); grubość bez zmian (1 px bufora, bez Line2);
//   • dom i kolonie — `orbitColony`; reszta — `orbitLine`; zaznaczona — `primary` (planeta, księżyc, planetoida);
//     najechana planeta — `primary` (dawne złoto najechania = złoto zaznaczenia); najechana planetoida — `orbitLine`
//     w kryciu najechania; niestabilna planeta — `alert` w kryciu kolonii;
//   • kolor tokenu bez jego krycia (krycie linii ustala tabela — tokeny mają 0,05–0,20, dawałyby niewidoczne orbity);
//   • filtr „Żadne” chowa wszystkie orbity POZA orbitą zaznaczonego ciała (planety, księżyca, planetoidy) — dom,
//     kolonie i najechaną też (Finding 511; D-HUD-7 uzupełnienie 3b, decyzja właściciela 2026-10-22);
//   • czysty widok (SHIFT) — orbity ukryte; po wyjściu widoczność liczona tu, ze stanu (nie z `_cvVis`).
import { THEME } from '../config/ThemeConfig.js';
import { resolveHudRoles, themeToken, tokenRgbInt } from '../ui/HudPalette.js';

// D-HUD-7: krycie orbit = dzisiejsze × 0,8.
export const HUD_ORBIT_OPACITY_MULT = 0.8;

// Dzisiejsze krycia ścieżki OFF (`ThreeRenderer`): planety — `_buildOrbit` / `_restoreOrbitDefaults` / `planet:hover`;
// księżyce — `_addMoonMesh` / `_hideAllMoonOrbits` / `_showMoonOrbit`; planetoidy — `_buildPlanetoidOrbit` /
// `_hideAllPlanetoidOrbits` / `body:selected` (0,35) / `planet:hover` (0,20).
export const ORBIT_BASE_OPACITY = Object.freeze({
  planetHome: 0.15, planetColony: 0.10, planetFilter: 0.08, planetSelected: 0.7, planetHover: 0.5,
  moonFilter: 0.15, moonSelected: 0.30,
  planetoidFilter: 0.12, planetoidSelected: 0.35, planetoidHover: 0.20,
});

/** Flaga orbit HUD — `true` wyłącznie przy `features.hudOrbits === true` (brak klucza = OFF). */
export const isHudOrbitsOn = (features) => features?.hudOrbits === true;

/** Czy filtr orbit (menu ☰: 'all' | 'planets_moons' | 'planetoids' | 'none') pokazuje orbity rodzaju `kind`. */
export function orbitFilterShows(filter, kind) {
  if (kind === 'planetoid') return filter === 'all' || filter === 'planetoids';
  return filter === 'all' || filter === 'planets_moons';   // 'planet', 'moon'
}

// Tokeny, od których zależą barwy orbit (alert — `danger` albo `warning` wg reguły ról).
const PALETTE_TOKENS = ['orbitLine', 'orbitColony', 'accent', 'danger', 'warning'];
// Pamięć barw po WARTOŚCIACH tokenów (czysta funkcja wejść — zmiana tokenu = nowy klucz, więc zmiana motywu jest widoczna
// od razu; pamięć oszczędza parsowanie tokenów przy KAŻDEJ orbicie — przebudowa orbit bez regresji kosztu, K7 bramki H0).
const _paletteMemo = new Map();

/** Barwy orbit z motywu (liczby 0xRRGGBB): domyślna, kolonii, zaznaczona (`primary`), niestabilna (`alert`). */
export function orbitPalette(theme = THEME) {
  const key = PALETTE_TOKENS.map((k) => themeToken(theme, k)).join('|');
  let pal = _paletteMemo.get(key);
  if (!pal) {
    const roles = resolveHudRoles(theme);
    pal = Object.freeze({
      line: tokenRgbInt(themeToken(theme, 'orbitLine')),
      colony: tokenRgbInt(themeToken(theme, 'orbitColony')),
      primary: tokenRgbInt(roles.primary),
      alert: tokenRgbInt(roles.alert),
    });
    if (_paletteMemo.size > 32) _paletteMemo.clear();
    _paletteMemo.set(key, pal);
  }
  return pal;
}

const M = HUD_ORBIT_OPACITY_MULT;
const B = ORBIT_BASE_OPACITY;
// Czysty widok (SHIFT) chowa wszystko, także zaznaczoną; filtr „Żadne” — wszystko poza zaznaczoną (D-HUD-7 uzupełnienie 3b).
const hide = (s) => s.cleanView === true || (s.filter === 'none' && !s.selected);

/**
 * Orbita planety. `s`: { isHome, isColonized, unstable, selected, hovered, filter, cleanView, palette? } — `palette`
 * (z `orbitPalette`) podany przez wołającego, gdy styluje partię linii (jedno liczenie barw na partię).
 * @returns {{ visible: boolean, color: number, opacity: number }}
 */
export function planetOrbitStyle(s, theme = THEME) {
  const pal = s.palette ?? orbitPalette(theme);
  let visible = true, color, opacity;
  if (s.selected) { color = pal.primary; opacity = B.planetSelected * M; }
  else if (s.hovered) { color = pal.primary; opacity = B.planetHover * M; }
  else if (s.isHome) { color = pal.colony; opacity = B.planetHome * M; }
  else if (s.isColonized) { color = pal.colony; opacity = B.planetColony * M; }
  else { visible = orbitFilterShows(s.filter, 'planet'); color = pal.line; opacity = B.planetFilter * M; }
  if (s.unstable && !s.selected && !s.hovered) { color = pal.alert; opacity = B.planetColony * M; }
  if (hide(s)) visible = false;
  return { visible, color, opacity };
}

/** Pierścień orbity księżyca. `s`: { selected, filter, cleanView }. */
export function moonOrbitStyle(s, theme = THEME) {
  const pal = s.palette ?? orbitPalette(theme);
  let visible, color, opacity;
  if (s.selected) { visible = true; color = pal.primary; opacity = B.moonSelected * M; }
  else { visible = orbitFilterShows(s.filter, 'moon'); color = pal.line; opacity = visible ? B.moonFilter * M : 0; }
  if (hide(s)) visible = false;
  return { visible, color, opacity };
}

/** Orbita planetoidy. `s`: { selected, hovered, filter, cleanView }. */
export function planetoidOrbitStyle(s, theme = THEME) {
  const pal = s.palette ?? orbitPalette(theme);
  let visible = true, color, opacity;
  if (s.selected) { color = pal.primary; opacity = B.planetoidSelected * M; }
  else if (s.hovered) { color = pal.line; opacity = B.planetoidHover * M; }
  else { visible = orbitFilterShows(s.filter, 'planetoid'); color = pal.line; opacity = B.planetoidFilter * M; }
  if (hide(s)) visible = false;
  return { visible, color, opacity };
}

/** Nadaje linii orbity styl (`material.color.setHex`, `material.opacity`, `visible`). Kolor nieczytelny — bez zmiany barwy. */
export function applyOrbitStyle(line, style) {
  if (!line?.material || !style) return;
  if (Number.isInteger(style.color)) line.material.color.setHex(style.color);
  line.material.opacity = style.opacity;
  line.visible = style.visible;
}

/**
 * Klucz przebudowy orbit (`ThreeRenderer._syncHudOrbits`, co klatkę): `null` przy OFF (bez pracy — ścieżka OFF);
 * przy ON — epoka motywu + id domu gracza (po wczytaniu zapisu dom pojawia się po zbudowaniu sceny — Finding 510).
 */
export function hudOrbitSyncKey(features, epoch, homeId) {
  if (!isHudOrbitsOn(features)) return null;
  return `${epoch}|${homeId ?? ''}`;
}
