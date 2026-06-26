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

// Kolory FX nie-bojowe.
export const FX_SHIELD_COLOR = 0x66ccff;  // tarcza (cyan-blue)
export const FX_SCAN_COLOR   = 0x44ddff;  // skan (cyan)
