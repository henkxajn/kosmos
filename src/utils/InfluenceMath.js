// InfluenceMath — czysta geometria stref wpływu (workstream C, Slice 1, commit S2).
//
// ZERO zależności od `window`, Three, EventBus i `Math.random` — w pełni node-testowalny
// (wzór: `WarpRoutePlanner.js`, `OpinionMath.js`, `DirectorRuleMath.js`). Stan świata
// wchodzi argumentami, nigdy globalem. Cały stan siedzi w `src/systems/InfluenceMap.js`.
//
// ⚠ JEDNOSTKA: KAŻDA odległość i promień w tym pliku jest w LATACH ŚWIETLNYCH (LY),
// bo w takich jednostkach są pozycje układów (`GalaxyGenerator` — `x/y/z`, `distanceLY`).
// Nic tu nie jest w AU ani w pikselach mapy.
//
// ── DWIE PODPISANE WŁASNOŚCI, KTÓRE TEN PLIK REALIZUJE ──────────────────────────────
//
// (1) STREFA JEST PROMIENIEM W LY, NIE „JEDNYM SKOKIEM" (korekta K-2 / orzeczenie R-2).
//     „Jeden skok" nie ma w tej grze definicji galaktycznej: `WarpRoutePlanner` buduje
//     krawędzie w locie z `warpDist3D(a,b) ≤ maxHopLY`, gdzie `maxHopLY = warpFuel.max /
//     warpFuel.consumption` — własność KONKRETNEGO STATKU. Dwa statki widzą dwa różne grafy,
//     więc „strefa graniczna" oparta na skokach byłaby różna dla każdego statku gracza.
//     Tutaj strefa NIE zależy od żadnego statku. Keeper pinuje to wprost.
//
// (2) METRYKA 3D, NIE RZUT 2D (decyzja 10). Mierzymy `x/y/z` — dokładnie tak jak
//     `warpDist3D` (`WarpRoutePlanner.js:32-37`), bo to ona rządzi realną osiągalnością.
//     `TerritoryField` liczy pole w rzucie 2D (`:81`), ale to warstwa RENDERU; jej
//     uproszczenie nie jest kontraktem. Zmierzone: rzut 2D zawyża pokrycie o 1,4–5,6 pkt
//     proc. (`probe-border-zone-coverage.mjs`, tabela 3).

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp  = (a, b, t) => a + (b - a) * t;

/**
 * Odległość między układami w LY, w pełnych trzech wymiarach.
 * LUSTRO `warpDist3D` (`WarpRoutePlanner.js:32-37`) — celowo ta sama metryka co
 * osiągalność warp, żeby „strefa" i „da się tam dolecieć" mierzyły ten sam świat.
 */
export function distanceLY(a, b) {
  const dx = (a?.x ?? 0) - (b?.x ?? 0);
  const dy = (a?.y ?? 0) - (b?.y ?? 0);
  const dz = (a?.z ?? 0) - (b?.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Promień przestrzeni ROSZCZONEJ układu, w LY.
 *
 * ⚠ To jest DRUGA kopia formuły, która żyje też inline w `TerritoryField.js:78-80`.
 * Świadomie NIE refaktoryzujemy tamtej — decyzja 3 planu mówi „zero zmian wizualnych,
 * TerritoryField/Stratcom nietknięte", a render jest tu stroną, której ten slice nie ma
 * prawa ruszyć. Zamiast tego keeper `influence_map_smoke` trzyma **asercję źródłową** na
 * `TerritoryField.js`: gdy tamta formuła się zmieni, test padnie i każe zsynchronizować
 * obie. Duplikat pilnowany jest tańszy niż refaktor renderu w slice'ie o danych.
 *
 * @param {'colony'|'outpost'|'station'} kind
 * @param {number} devScore — pop + budynki (indeks `TerritoryService`)
 * @param {{R_MIN_LY:number, R_MAX_LY:number, R_STATION_LY:number, DEV_FULL:number}} cfg
 */
export function claimedRadiusLY(kind, devScore, cfg) {
  if (kind === 'station') return cfg.R_STATION_LY;
  const t = clamp((Number(devScore) || 0) / cfg.DEV_FULL, 0, 1);
  return clamp(lerp(cfg.R_MIN_LY, cfg.R_MAX_LY, t), cfg.R_MIN_LY, cfg.R_MAX_LY);
}

/**
 * Zewnętrzny promień strefy GRANICZNEJ, w LY — **ODCZYT A** (decyzja 9):
 * powłoka leży NA ZEWNĄTRZ przestrzeni roszczonej, `outer = r_roszczony + BORDER_LY`.
 *
 * Wariant odrzucony (B): `max(r_roszczony, BORDER_LY)` — przy `R_MAX_LY 4.0` i stałej
 * 5 LY dawałby rozwiniętemu imperium powłokę **1 LY grubości**, czyli im potężniejsze
 * imperium, tym CIEŃSZA jego strefa nacisku. Zmierzone: 2,8–12,5 % pokrycia wobec
 * 11,1–30,6 % dla A — nacisk militarny praktycznie przestałby się wyzwalać.
 */
export function borderOuterRadiusLY(claimedR, borderLY) {
  return (Number(claimedR) || 0) + (Number(borderLY) || 0);
}

/**
 * Które układy leżą w promieniu `radiusLY` od punktu `origin`.
 * Czysta pętla — koszt `O(n)`; wołający decyduje, ile razy ją odpali.
 *
 * @param {{x:number,y:number,z:number}} origin
 * @param {Array<{id:string,x:number,y:number,z:number}>} systems
 * @param {number} radiusLY
 * @returns {string[]} identyfikatory układów, w kolejności wejściowej
 */
export function systemsWithinLY(origin, systems, radiusLY) {
  const out = [];
  for (const s of systems ?? []) {
    if (distanceLY(s, origin) <= radiusLY) out.push(s.id);
  }
  return out;
}

/**
 * Klasyfikacja JEDNEGO układu względem JEDNEGO źródła wpływu.
 * @returns {'claimed'|'border'|'outside'}
 */
export function classifySystem(system, source, borderLY) {
  const d = distanceLY(system, source.system);
  if (d <= source.claimedR) return 'claimed';
  if (d <= borderOuterRadiusLY(source.claimedR, borderLY)) return 'border';
  return 'outside';
}

/**
 * Pełna klasyfikacja galaktyki względem WIELU źródeł jednego właściciela.
 * „Roszczony" wygrywa nad „granicznym" — układ w rdzeniu jednego skupiska i w powłoce
 * drugiego jest ROSZCZONY, bo silniejsze roszczenie pochłania słabsze.
 *
 * @param {Array} systems
 * @param {Array<{system:object, claimedR:number}>} sources
 * @param {number} borderLY
 * @returns {{ claimed: Set<string>, border: Set<string> }} zbiory ROZŁĄCZNE
 */
export function classifyGalaxy(systems, sources, borderLY) {
  const claimed = new Set();
  const border  = new Set();
  for (const s of systems ?? []) {
    let best = 'outside';
    for (const src of sources ?? []) {
      const c = classifySystem(s, src, borderLY);
      if (c === 'claimed') { best = 'claimed'; break; }
      if (c === 'border') best = 'border';
    }
    if (best === 'claimed') claimed.add(s.id);
    else if (best === 'border') border.add(s.id);
  }
  return { claimed, border };
}
