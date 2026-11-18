// ConsoleKitDebug — pomocniki konsoli przeglądarki dla zestawu konsol (ARC KONSOLE K0a, docs/design/CONSOLES_PLAN.md).
// Bez cudzysłowów (wklejka właściciela zamienia cudzysłowy na typograficzne):
//   KOSMOS.debug.consoleKit.scene()        — { covered, filter, rendered, badgesHidden } (stan tła konsoli w pętli renderu)
//   KOSMOS.debug.consoleKit.tune.bright = 0.5 — pokrętła tła: blur (px), bright, sat, scrim, fadeMs — liczby, skutek od następnej klatki
//   KOSMOS.debug.consoleKit.tuneKit({...}) / tuneLayout({...}) — pokrętła rysowania i układu stref; reset() — wszystko domyślne
//   KOSMOS.debug.consoleKit.tuneBackdrop({ HALO_MAX: 9 }) / backdrop() — Finding 755: poświata tekstu rośnie nad jasnym tłem
// KZ-Kit: flaga `consoleKit` i tryby `glass()` / `live()` / `opaque()` / `on()` / `off()` usunięte (tło konsoli jest na stałe).

import { tuneConsoleKit, resetConsoleKit } from '../ui/ConsoleKit.js';
import { tuneConsoleLayout, resetConsoleLayout } from '../ui/ConsoleLayoutLogic.js';
import { CONSOLE_GLASS, CONSOLE_GLASS_DEFAULTS } from '../ui/ConsoleSceneLogic.js';
import { tuneConsoleBackdrop, resetConsoleBackdrop, CONSOLE_BACKDROP } from '../ui/ConsoleBackdropLogic.js';   // KZ Finding 755

export function consoleKitDebugHelpers({ getRenderer }) {
  const dirty = () => { const ui = window.KOSMOS?.uiManager; if (ui) ui._dirty = true; };
  // Pokrętła tła: przypisanie liczby → wartość + odświeżenie zasłony UI (rysowanej na żądanie); inne klucze / nie-liczby pominięte.
  const tune = new Proxy(CONSOLE_GLASS, {
    set(obj, k, v) {
      if (k in CONSOLE_GLASS_DEFAULTS && Number.isFinite(v) && v >= 0) { obj[k] = v; dirty(); }
      return true;
    },
  });
  return {
    consoleKit: {
      scene: () => ({ ...(getRenderer()?.getConsoleSceneStats?.() ?? {}) }),
      tune,
      tuneKit: (patch) => { const r = tuneConsoleKit(patch); dirty(); return r; },
      tuneLayout: (patch) => { const r = tuneConsoleLayout(patch); dirty(); return r; },
      // KZ Finding 755 — progi i siła poświaty tekstu nad jasnym tłem; backdrop() — ostatni pomiar (siatka, czas, koszt ms)
      tuneBackdrop: (patch) => { const r = tuneConsoleBackdrop(patch); dirty(); return r; },
      backdrop: () => ({ gw: CONSOLE_BACKDROP.gw, gh: CONSOLE_BACKDROP.gh, at: CONSOLE_BACKDROP.at, costMs: CONSOLE_BACKDROP.costMs, mode: CONSOLE_BACKDROP.mode, max: CONSOLE_BACKDROP.luma ? Math.max(...CONSOLE_BACKDROP.luma) : null }),
      reset: () => { Object.assign(CONSOLE_GLASS, CONSOLE_GLASS_DEFAULTS); const r = { glass: { ...CONSOLE_GLASS }, kit: resetConsoleKit(), layout: resetConsoleLayout(), backdrop: resetConsoleBackdrop() }; dirty(); return r; },
    },
  };
}
