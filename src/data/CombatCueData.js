// CombatCueData — tabela sygnał walki → id dźwięku (ARC COMBAT VISUALS, krok CV-2b; plan §2.9, F8, D-CV-19).
//
// Szyna sygnałów: silnik FX emituje `combatfx:cue` w czasie PREZENTACJI (`src/renderer/combat/CombatCueBus.js`), a słuchacz
// `AudioSystem._onCombatCue` pyta tę tabelę o id dźwięku. Dziś WSZYSTKIE pozycje są puste (`null`) — słuchacz nie gra
// niczego (D-CV-19 (a): bez słyszalnej zmiany). Dźwięki dojdą osobnym krokiem: wpisać id w odpowiednią komórkę.
//
// Rodzaje (`kind`) i drugi klucz:
//   fire / impact / shieldHit — po BRONI (`weapon`: laser / kinetic / missile; kategoria modułu short / medium / long);
//   explosion / destroyed / kill — po ROZMIARZE (`size`: small / medium / large; klasa kadłuba).
// Dziś silnik emituje fire, impact, shieldHit (każda salwa) i destroyed (wybuch wraku); `explosion` (wybuchy pocisków,
// eksplozje wtórne) dojdzie z CV-5 — komórki są już w tabeli. ARC CV-4a (flaga `cvWeapons`): fire / impact / shieldHit
// w chwilach z REJESTRU SALW (strzał, trafienie), do tego `kill` — zniszczenie w chwili trafienia zabijającego (po rozmiarze).

export const COMBAT_CUE_SOUNDS = Object.freeze({
  fire:      Object.freeze({ laser: null, kinetic: null, missile: null }),
  impact:    Object.freeze({ laser: null, kinetic: null, missile: null }),
  shieldHit: Object.freeze({ laser: null, kinetic: null, missile: null }),
  explosion: Object.freeze({ small: null, medium: null, large: null }),
  destroyed: Object.freeze({ small: null, medium: null, large: null }),
  // ARC CV-4a — zniszczenie okrętu w chwili TRAFIENIA ZABIJAJĄCEGO (rejestr salw, flaga `cvWeapons`; po rozmiarze kadłuba).
  kill:      Object.freeze({ small: null, medium: null, large: null }),
});

/** Rodzaje sygnałów (kolejność = kolejność tabeli). */
export const CUE_KINDS = Object.freeze(Object.keys(COMBAT_CUE_SOUNDS));
/** Rodzaje kluczowane bronią (reszta — rozmiarem). */
export const CUE_WEAPON_KINDS = Object.freeze(['fire', 'impact', 'shieldHit']);
export const CUE_WEAPONS = Object.freeze(['laser', 'kinetic', 'missile']);
export const CUE_SIZES = Object.freeze(['small', 'medium', 'large']);

/**
 * Id dźwięku dla sygnału albo `null` (brak wpisu, nieznany rodzaj / klucz, pusty sygnał).
 * @param {{ kind?:string, weapon?:string|null, size?:string|null }} cue
 * @returns {string|null}
 */
export function cueSoundId(cue) {
  const row = COMBAT_CUE_SOUNDS[cue?.kind];
  if (!row) return null;
  const key = CUE_WEAPON_KINDS.includes(cue.kind) ? cue.weapon : cue.size;
  const id = typeof key === 'string' ? row[key] : null;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
