// ConsoleRolesLogic — role HUD dla ekranów konsoli (ARC KONSOLE K0b, decyzja właściciela C: mocniejsza rola dim TYLKO na konsolach).
//
// Na żywej scenie przyciemnionej do 0,4 tekst w roli dim (etykiety sekcji, klucze, nieaktywne czipy) bladł, najbardziej na orbitach.
// Konsola dostaje te same role co mapa, z jedną zmianą: `dim` przesunięte w stronę tekstu głównego (`textPrimary`) o `DIM_LIFT`
// (pokrętło zestawu `KOSMOS.debug.consoleKit.tuneKit({ DIM_LIFT: 0.5 })`). Mapa i HUD — bez zmian (`resolveHudRoles`).
// Kolory składane z tokenów motywu (krycie tokenu nałożone na czerń — tło sceny), wynik jako #rrggbb. Czysta, testowalna pod node.

import { THEME } from '../config/ThemeConfig.js';
import { resolveHudRoles, themeToken, tokenRgb } from './HudPalette.js';
import { CONSOLE_KIT } from './ConsoleKit.js';

const hex2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');

/** Czysta: kolor #rrggbb w proporcji `t` między tokenami `a` i `b` (0 = a, 1 = b); nieczytelny token → null. */
export function mixTokens(a, b, t) {
  const ca = tokenRgb(a), cb = tokenRgb(b);
  if (!ca || !cb) return null;
  const k = Math.max(0, Math.min(1, Number(t) || 0));
  return `#${hex2(ca[0] + (cb[0] - ca[0]) * k)}${hex2(ca[1] + (cb[1] - ca[1]) * k)}${hex2(ca[2] + (cb[2] - ca[2]) * k)}`;
}

/** Role konsoli: `resolveHudRoles` + `dim` podniesione o `lift` (domyślnie `CONSOLE_KIT.DIM_LIFT`); lift 0 → role jak na mapie. */
export function consoleRoles(theme = THEME, lift = CONSOLE_KIT.DIM_LIFT) {
  const roles = resolveHudRoles(theme);
  if (!(lift > 0)) return roles;
  const dim = mixTokens(roles.dim, themeToken(theme, 'textPrimary'), lift);
  return dim ? { ...roles, dim } : roles;
}
