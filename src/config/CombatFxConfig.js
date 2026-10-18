// CombatFxConfig — wspólne stałe efektów walki/FX na mapie 3D (Konsola Dowodzenia, Slice 0).
//
// Jedno źródło prawdy dla kolorów broni — wcześniej zduplikowane w BattleView3D
// (kino) i potrzebne też w ThreeRenderer (smugi na żywej mapie). Oba importują stąd.
//
// Kategorie broni z ShipModulesData (stats.category): short/medium/long.

// Kolor lasera/pocisku per kategoria broni (DSCS tick-based timeline).
// short = cyan (laser), medium = amber (kinetic), long = red (missile/long).
export const WEAPON_COLOR_BY_CATEGORY = {
  short:  0x60E0FF,  // cyan
  medium: 0xFFD060,  // amber
  long:   0xFF6060,  // red
};

export const DEFAULT_WEAPON_COLOR = 0xFFFFFF;

// Zwraca kolor smugi dla podanej kategorii (fallback = biały).
export function weaponColor(category) {
  return WEAPON_COLOR_BY_CATEGORY[category] ?? DEFAULT_WEAPON_COLOR;
}

// ── Wspólny silnik FX (ThreeRenderer._activeEffects) ─────────────────────────
// Twardy limit jednocześnie żywych efektów (drop-oldest przy przekroczeniu) —
// zapobiega zalaniu sceny przy wielu starciach / wysokiej kompresji czasu.
export const FX_MAX_ACTIVE = 120;

// Czasy życia (ms) — port z BattleView3D (_spawnEventVolley/_updateEffects).
export const FX_TRACER_MS      = 260;   // smuga lasera
export const FX_FLASH_MS       = 460;   // błysk trafienia (expand 1→3, fade)
export const FX_FLASH_DELAY_MS = 150;   // opóźnienie błysku po smudze
export const FX_SHIELD_MS      = 360;   // pierścień tarczy (blocked)
export const FX_RING_MS        = 1500;  // rozszerzający pierścień (skan/puls) — dłużej = widoczny
export const FX_PING_MS        = 1300;  // „ping" ukończenia (dłużej widoczny)

// POLISH P2b (D3, A7) — tempo efektów salwy OGLĄDANEGO starcia z czasu realnego rundy R (`timeSystem.combatRoundMs()`,
// klucz `combatRoundMs`, domyślnie 400 ms). Stałe wyżej strojono pod dawne 110 ms na rundę: przy 400 ms smuga (260 ms)
// gasła w ~2/3 rundy, a salwa kolejnej rundy startowała po dziurze. Teraz smuga, błysk i pierścień tarczy trwają
// ~1,2 rundy (salwa trzyma się do następnej — bez dziury między salwami kolejnych rund, każda wciąż osobno: starsza już
// gaśnie), rozrzut salwy R / 10, uderzenie po ~0,375 R; nigdy krócej niż stałe (przy 110 ms — dokładnie jak dawniej).
export const FX_PACE_K = 1.2;
export function combatFxPace(roundMs) {
  const R = Number.isFinite(roundMs) && roundMs > 0 ? roundMs : 110;
  return {
    tracerMs:     Math.max(FX_TRACER_MS, Math.round(FX_PACE_K * R)),
    flashMs:      Math.max(FX_FLASH_MS, Math.round(FX_PACE_K * R)),
    flashDelayMs: Math.max(FX_FLASH_DELAY_MS, Math.round(0.375 * R)),
    shieldMs:     Math.max(FX_SHIELD_MS, Math.round(FX_PACE_K * R)),
    staggerMs:    Math.max(40, Math.round(R / 10)),
  };
}

// Kolory FX nie-bojowe.
export const FX_SHIELD_COLOR = 0x66ccff;  // tarcza (cyan-blue)
export const FX_SCAN_COLOR   = 0x44ddff;  // skan (cyan)
