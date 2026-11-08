// RendererRng — losowość WARSTWY WIZUALNEJ, odcięta od strumienia gry (ARC COMBAT VISUALS, CV-0b, Finding 612).
//
// Z `Math.random` gra losuje stan świata: sloty orbit (piszą pozycje logiczne statków), kąty przylotu, heksy desantu,
// walkę naziemną, szum wywiadu. Każde losowanie zjedzone przez rysunek przesuwało ten strumień — ten sam zapis
// rozwijał się inaczej zależnie od tego, co było na ekranie. Dlatego KAŻDE czysto wizualne losowanie (faza migotania,
// przechył wraku, świetliki handlu, gwiazdy tła ekranów, losowanie strzelca w kinie bitwy, szum hex) idzie stąd.
//
// ⚠ Granica: NIE przenosić tu losowania, którego wynik trafia do stanu gry (orbita, kąt przylotu, heks, identyfikator,
//   kolejność kandydatów) — te zostają na `Math.random` (lista w `docs/design/COMBAT_VISUALS_PLAN.md` §4 CV-0b).
// Ziarno stałe: ta sama sekwencja w każdej sesji (sondy klatek są powtarzalne); wynik zależy wyłącznie od kolejności
// wywołań warstwy wizualnej, nigdy od gry.

import { RNG } from '../sim/rng.js';

const DEFAULT_SEED = 'kosmos-renderer';

let _rng = new RNG(DEFAULT_SEED);

/** Liczba z [0, 1) z prywatnego strumienia warstwy wizualnej — zamiennik `Math.random` w kodzie rysującym. */
export function rendererRandom() {
  return _rng.next();
}

/** Przywróć strumień do znanego ziarna (keepery, sondy). */
export function reseedRendererRandom(seed = DEFAULT_SEED) {
  _rng = new RNG(String(seed));
}
