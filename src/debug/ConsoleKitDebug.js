// ConsoleKitDebug — pomocniki konsoli przeglądarki dla zestawu konsol (ARC KONSOLE K0a, docs/design/CONSOLES_PLAN.md).
// Bez cudzysłowów (wklejka właściciela zamienia cudzysłowy na typograficzne):
//   KOSMOS.debug.consoleKit.scene()        — { flag, mode, filter, skipping, rendered, skipped } (liczniki pętli renderu)
//   KOSMOS.debug.consoleKit.live()         — tryb domyślny: ostra, przyciemniona scena renderuje się dalej pod konsolą
//   KOSMOS.debug.consoleKit.glass()        — debug: filtr + zasłona, composer pominięty po świeżej klatce (zamrożony świat)
//   KOSMOS.debug.consoleKit.opaque()       — nieprzezroczyste tło, composer pominięty (debug; kandydat na ustawienie wydajności)
//   KOSMOS.debug.consoleKit.tune.blur = 6  — pokrętła szkła: blur (px), bright, sat, scrim, fadeMs — liczby, skutek od następnej klatki
//   KOSMOS.debug.consoleKit.on() / off()   — FEATURES.consoleKit (czytana w chwili użycia)
//   KOSMOS.debug.consoleKit.tuneKit({...}) / tuneLayout({...}) — pokrętła rysowania i układu stref; reset() — wszystko domyślne

import { GAME_CONFIG } from '../config/GameConfig.js';
import { tuneConsoleKit, resetConsoleKit } from '../ui/ConsoleKit.js';
import { tuneConsoleLayout, resetConsoleLayout } from '../ui/ConsoleLayoutLogic.js';
import { CONSOLE_GLASS, CONSOLE_GLASS_DEFAULTS } from '../ui/ConsoleSceneLogic.js';

export function consoleKitDebugHelpers({ getRenderer }) {
  const dirty = () => { const ui = window.KOSMOS?.uiManager; if (ui) ui._dirty = true; };
  const setFlag = (v) => { GAME_CONFIG.FEATURES.consoleKit = v; dirty(); return GAME_CONFIG.FEATURES.consoleKit; };
  const setMode = (m) => { CONSOLE_GLASS.mode = m; dirty(); return m; };
  // Pokrętła szkła: przypisanie liczby → wartość + odświeżenie zasłony UI (rysowanej na żądanie); inne klucze / nie-liczby pominięte.
  const tune = new Proxy(CONSOLE_GLASS, {
    set(obj, k, v) {
      if (k !== 'mode' && k in CONSOLE_GLASS_DEFAULTS && Number.isFinite(v) && v >= 0) { obj[k] = v; dirty(); }
      return true;
    },
  });
  return {
    consoleKit: {
      scene: () => ({ flag: GAME_CONFIG.FEATURES.consoleKit === true, knobMode: CONSOLE_GLASS.mode,
        ...(getRenderer()?.getConsoleSceneStats?.() ?? {}) }),
      glass: () => setMode('glass'),
      live: () => setMode('live'),
      opaque: () => setMode('opaque'),
      tune,
      on: () => setFlag(true),
      off: () => setFlag(false),
      tuneKit: (patch) => { const r = tuneConsoleKit(patch); dirty(); return r; },
      tuneLayout: (patch) => { const r = tuneConsoleLayout(patch); dirty(); return r; },
      reset: () => { Object.assign(CONSOLE_GLASS, CONSOLE_GLASS_DEFAULTS); const r = { glass: { ...CONSOLE_GLASS }, kit: resetConsoleKit(), layout: resetConsoleLayout() }; dirty(); return r; },
    },
  };
}
