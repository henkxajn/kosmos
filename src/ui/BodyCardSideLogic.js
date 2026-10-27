// BodyCardSideLogic — ARKUSZ HUD, paczka A, Finding 493 (HUD_PLAN.md §4.2a; UI_PLAN.md §6): karta obiektu (ciało, statek,
// stacja) kotwiczona Z BOKU tarczy, nie przy jej środku. Dawniej karta ciała stała 18 px od ŚRODKA ciała
// (`computeFloatingPlacement`) — po fokusie (tarcza 71–133 px promienia na środku ekranu) zakrywała 33–41 % tarczy i radar
// zaznaczonego ciała.
//   • domyślnie na prawo od krawędzi tarczy (odstęp `GAP`), flip na lewo przy braku miejsca w obszarze mapy, NIGDY nad
//     tarczą, gdy którakolwiek strona się mieści; przy zoomie karta idzie za krawędzią tarczy (promień rośnie), nie za
//     środkiem; pionowo — środek karty na wysokości środka tarczy, w kadrze;
//   • HISTEREZA (strojenie 1, 2026-10-24 — migotanie lewo↔prawo przy zoomie na stację): strona wybrana przy zaznaczeniu
//     obiektu i TRZYMANA; zmiana tylko, gdy karta na bieżącej stronie wyszłaby poza obszar mapy (a druga strona się mieści),
//     nie częściej niż co `SWITCH_MIN_MS` czasu realnego (`makeCardSideMemory` — jedna pamięć na kartę: ciała, panel statku,
//     panel stacji);
//   • promień w px z TEGO SAMEGO projektora co warstwa HUD (`HudProjection` z `ThreeRenderer.getHudView`): ciało — sfera
//     siatki, statek — połowa rozmiaru modelu, stacja — sfera modelu; wszystko w px LOGICZNYCH UI (dzisiejsza kotwica brała
//     px CSS jako logiczne — przy skali UI ≠ 1 przesunięta, Finding 528);
//   • flaga `bodyCardSide` — na stałe ON od REFORMY ZAKŁADEK T4 (dawne kotwice OFF — Finding 528 — usunięte); tarcza
//     obiektu (`objectScreenDisc`) mieszka od T4 w `HudProjection`;
//   • PRZESZKODY (REFORMA ZAKŁADEK T3, strojenie 1, Finding 544): panel statku przy prawym outlinerze (`cardObstacles`) —
//     karta ciała / stacji staje po stronie WOLNEJ (w obszarze mapy i bez przeszkody); żadna wolna — strona z większym
//     prześwitem (miejsce między krawędzią tarczy a krawędzią mapy albo przeszkodą). Przeszkoda nie czeka na histerezę.
//     Bez przeszkód — dokładnie jak wyżej.
// Czysty poza `cardObstacles` (czyta z przekazanego `K` — atrapa w keeperze).

export const CARD_SIDE = Object.freeze({
  GAP: 16,      // odstęp karty od krawędzi tarczy (px logiczne)
  EDGE: 4,      // margines wewnątrz obszaru mapy (jak `computeFloatingPlacement`)
  NO_ANCHOR_X: 12, NO_ANCHOR_Y: 12,   // obiekt za kamerą — lewy-górny róg obszaru mapy (jak dziś)
  SWITCH_MIN_MS: 400,   // [ms czasu realnego] najkrótszy odstęp między zmianami strony (histereza)
  RESET_IDLE_MS: 1000,  // [ms] karta nierysowana dłużej — następne pokazanie wybiera stronę od nowa (nowe zaznaczenie)
  OBSTACLE_PAD: 4,      // [px logiczne] odstęp karty od przeszkody (panel statku przy outlinerze — T3, strojenie 1, 544)
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Przeszkody z prawidłowymi liczbami (null / NaN / zerowy rozmiar — pominięte). */
function validRects(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((o) => o && [o.x, o.y, o.w, o.h].every(Number.isFinite) && o.w > 0 && o.h > 0);
}

/** Czy karta `{x, y, w, h}` zachodzi na którąś przeszkodę (z odstępem `CARD_SIDE.OBSTACLE_PAD`). */
function hitsObstacle(a, obs) {
  const P = CARD_SIDE.OBSTACLE_PAD;
  return obs.some((o) => a.x < o.x + o.w + P && a.x + a.w > o.x - P && a.y < o.y + o.h + P && a.y + a.h > o.y - P);
}

/**
 * Prześwit stron (Finding 544 — żadna strona wolna): miejsce w poziomie od krawędzi tarczy do krawędzi obszaru mapy albo
 * przeszkody leżącej w pasie wysokości karty — po prawej i po lewej (px logiczne, ≥ 0).
 */
function sideClearance(disc, r, py, PH, bounds, obs) {
  const E = CARD_SIDE.EDGE, P = CARD_SIDE.OBSTACLE_PAD;
  const rEdge = disc.x + r, lEdge = disc.x - r;
  let limR = bounds.ox + bounds.ow - E, limL = bounds.ox + E;
  for (const o of obs) {
    if (!(o.y - P < py + PH && o.y + o.h + P > py)) continue;   // przeszkoda poza pasem wysokości karty
    if (o.x + o.w + P > rEdge) limR = Math.min(limR, Math.max(rEdge, o.x - P));
    if (o.x - P < lEdge) limL = Math.max(limL, Math.min(lEdge, o.x + o.w + P));
  }
  return { right: Math.max(0, limR - rEdge), left: Math.max(0, lEdge - limL) };
}

/**
 * Położenie lewego-górnego rogu karty z boku tarczy.
 * @param {{ disc:{x:number,y:number,r:number}|null, PW:number, PH:number, bounds:{ox,oy,ow,oh}, gap?:number,
 *   prevSide?:'right'|'left'|null, lockSide?:boolean }} p — tarcza (środek i promień, px logiczne; `null` — obiekt za kamerą),
 *   wymiary karty, obszar mapy; `prevSide` — strona trzymana (histereza): zostaje, póki karta się na niej mieści; gdy nie —
 *   druga strona, jeśli się mieści; żadna — bez zmiany; `lockSide` — strona `prevSide` bez względu na miejsce (karta
 *   przycięta do kadru); `obstacles` — prostokąty, których karta nie zakrywa (panel statku przy outlinerze, 544): strona
 *   „wolna” = w obszarze mapy i bez przeszkody; żadna wolna — większy prześwit (`sideClearance`)
 * @returns {{ px:number, py:number, side:'right'|'left'|null, anchored:boolean, overDisc:boolean, fits:boolean,
 *   blocked:boolean }} blocked — karta na wybranej stronie zachodzi na przeszkodę
 */
export function computeSideCardPlacement({ disc, PW, PH, bounds, gap = CARD_SIDE.GAP, prevSide = null, lockSide = false, obstacles = null }) {
  const { ox, oy, ow, oh } = bounds;
  const E = CARD_SIDE.EDGE;
  const xMin = ox + E, xMax = Math.max(xMin, ox + ow - PW - E);
  const yMin = oy + E, yMax = Math.max(yMin, oy + oh - PH - E);
  if (!disc || !Number.isFinite(disc.x) || !Number.isFinite(disc.y)) {
    return { px: clamp(ox + CARD_SIDE.NO_ANCHOR_X, xMin, xMax), py: clamp(oy + CARD_SIDE.NO_ANCHOR_Y, yMin, yMax), side: null, anchored: false, overDisc: false, fits: false, blocked: false };
  }
  const r = Math.max(0, Number.isFinite(disc.r) ? disc.r : 0);
  const right = disc.x + r + gap, left = disc.x - r - gap - PW;
  const fitsR = right + PW <= ox + ow - E, fitsL = left >= ox + E;
  const held = prevSide === 'right' || prevSide === 'left' ? prevSide : null;
  const py = clamp(disc.y - PH / 2, yMin, yMax);
  // T3, strojenie 1 (544): karta na każdej stronie (po klamrze do kadru) a przeszkody.
  const obs = validRects(obstacles);
  const hit = { right: false, left: false };
  if (obs.length) {
    for (const s of ['right', 'left']) hit[s] = hitsObstacle({ x: clamp(s === 'right' ? right : left, xMin, xMax), y: py, w: PW, h: PH }, obs);
  }
  let side;
  if (!hit.right && !hit.left) {
    // Żadna przeszkoda nie dotyka kandydatów — dokładnie jak przed strojeniem (histereza 493).
    if (held && lockSide) side = held;
    else if (held) {
      const other = held === 'right' ? 'left' : 'right';
      const fits = { right: fitsR, left: fitsL };
      side = fits[held] ? held : (fits[other] ? other : held);   // zmiana tylko, gdy bieżąca strona wychodzi poza obszar mapy
    } else if (fitsR) side = 'right';
    else if (fitsL) side = 'left';
    else side = ((ox + ow - E) - (disc.x + r)) >= ((disc.x - r) - (ox + E)) ? 'right' : 'left';   // większy zapas
  } else {
    // Przeszkoda: strona wolna (w kadrze i bez przeszkody) — trzymana, potem druga; żadna — większy prześwit (remis — trzymana).
    const free = { right: fitsR && !hit.right, left: fitsL && !hit.left };
    const order = held ? [held, held === 'right' ? 'left' : 'right'] : ['right', 'left'];
    if (held && lockSide) side = held;
    else side = order.find((s) => free[s]) ?? null;
    if (!side) {
      const c = sideClearance(disc, r, py, PH, bounds, obs);
      side = c.right > c.left ? 'right' : c.left > c.right ? 'left' : order[0];
    }
  }
  const px = clamp(side === 'right' ? right : left, xMin, xMax);
  return { px, py, side, anchored: true, overDisc: cardOverDisc({ px, py, PW, PH }, disc), fits: side === 'right' ? fitsR : fitsL,
    blocked: side === 'right' ? hit.right : hit.left };
}

/**
 * Pamięć strony jednej karty (histereza 493). `place` jak `computeSideCardPlacement` + `key` (obiekt karty — zmiana obiektu =
 * wybór strony od nowa) i `now` (czas realny, ms). Strona trzymana; zmiana tylko, gdy na bieżącej karta wyszłaby poza obszar
 * mapy, i nie częściej niż co `SWITCH_MIN_MS` (wcześniej — karta zostaje po swojej stronie, przycięta do kadru).
 * `obstacles` — jak w `computeSideCardPlacement`; strona trzymana zasłonięta przez przeszkodę NIE czeka na histerezę (karta
 * nie stoi pod panelem statku przez `SWITCH_MIN_MS` — strojenie 1 T3, 544).
 */
export function makeCardSideMemory() {
  let key, side = null, switchedAt = -Infinity, lastAt = -Infinity;
  return {
    place({ key: k, disc, PW, PH, bounds, gap = CARD_SIDE.GAP, now = 0, obstacles = null }) {
      if (k !== key || !(now - lastAt <= CARD_SIDE.RESET_IDLE_MS) || now < lastAt) {
        key = k; side = null; switchedAt = -Infinity;
      }
      lastAt = now;
      let pl = computeSideCardPlacement({ disc, PW, PH, bounds, gap, prevSide: side, obstacles });
      if (pl.side && side && pl.side !== side && now - switchedAt < CARD_SIDE.SWITCH_MIN_MS) {
        const kept = computeSideCardPlacement({ disc, PW, PH, bounds, gap, prevSide: side, lockSide: true, obstacles });
        if (!kept.blocked) pl = kept;
      }
      if (pl.side && pl.side !== side) {
        if (side) switchedAt = now;   // pierwszy wybór (zaznaczenie) nie jest zmianą
        side = pl.side;
      }
      return pl;
    },
    get side() { return side; },
  };
}

/** Czy karta (prostokąt) zachodzi na tarczę (koło). */
export function cardOverDisc({ px, py, PW, PH }, disc) {
  if (!disc) return false;
  const r = Math.max(0, disc.r ?? 0);
  const nx = clamp(disc.x, px, px + PW), ny = clamp(disc.y, py, py + PH);
  return (disc.x - nx) ** 2 + (disc.y - ny) ** 2 < r * r;
}

/**
 * Przeszkody kart z boku tarczy (REFORMA ZAKŁADEK T3, strojenie 1, Finding 544): panel statku przy prawym outlinerze
 * narysowany w ostatniej klatce (`UIManager.getShipPanelObstacle` — `null` bez panelu). Karta ciała i panel stacji podają
 * wynik do `place({ …, obstacles })`.
 * @param {object} K — `window.KOSMOS`
 * @returns {Array<{x:number,y:number,w:number,h:number}>}
 */
export function cardObstacles(K) {
  const r = K?.uiManager?.getShipPanelObstacle?.() ?? null;
  return r ? [r] : [];
}
