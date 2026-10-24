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
//   • za flagą `FEATURES.bodyCardSide` (brak klucza = OFF — dzisiejsze kotwice karty ciała, panelu statku i stacji).
// Czysty poza `objectScreenDisc` (czyta renderer z przekazanego `K` — atrapa w keeperze).
import { makeHudProjector } from './HudProjection.js';

/** Flaga karty z boku tarczy — `true` wyłącznie przy `features.bodyCardSide === true` (brak klucza = OFF). */
export const isBodyCardSideOn = (features) => features?.bodyCardSide === true;

export const CARD_SIDE = Object.freeze({
  GAP: 16,      // odstęp karty od krawędzi tarczy (px logiczne)
  EDGE: 4,      // margines wewnątrz obszaru mapy (jak `computeFloatingPlacement`)
  NO_ANCHOR_X: 12, NO_ANCHOR_Y: 12,   // obiekt za kamerą — lewy-górny róg obszaru mapy (jak dziś)
  SWITCH_MIN_MS: 400,   // [ms czasu realnego] najkrótszy odstęp między zmianami strony (histereza)
  RESET_IDLE_MS: 1000,  // [ms] karta nierysowana dłużej — następne pokazanie wybiera stronę od nowa (nowe zaznaczenie)
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// [j.] najmniejsza głębia kotwicy karty przed kamerą (mniej niż `HUD_NEAR_CLIP` radaru — podłoga zoomu stacji 0,005 j.)
const OBJECT_NEAR_CLIP = 1e-4;

/**
 * Położenie lewego-górnego rogu karty z boku tarczy.
 * @param {{ disc:{x:number,y:number,r:number}|null, PW:number, PH:number, bounds:{ox,oy,ow,oh}, gap?:number,
 *   prevSide?:'right'|'left'|null, lockSide?:boolean }} p — tarcza (środek i promień, px logiczne; `null` — obiekt za kamerą),
 *   wymiary karty, obszar mapy; `prevSide` — strona trzymana (histereza): zostaje, póki karta się na niej mieści; gdy nie —
 *   druga strona, jeśli się mieści; żadna — bez zmiany; `lockSide` — strona `prevSide` bez względu na miejsce (karta
 *   przycięta do kadru)
 * @returns {{ px:number, py:number, side:'right'|'left'|null, anchored:boolean, overDisc:boolean, fits:boolean }}
 */
export function computeSideCardPlacement({ disc, PW, PH, bounds, gap = CARD_SIDE.GAP, prevSide = null, lockSide = false }) {
  const { ox, oy, ow, oh } = bounds;
  const E = CARD_SIDE.EDGE;
  const xMin = ox + E, xMax = Math.max(xMin, ox + ow - PW - E);
  const yMin = oy + E, yMax = Math.max(yMin, oy + oh - PH - E);
  if (!disc || !Number.isFinite(disc.x) || !Number.isFinite(disc.y)) {
    return { px: clamp(ox + CARD_SIDE.NO_ANCHOR_X, xMin, xMax), py: clamp(oy + CARD_SIDE.NO_ANCHOR_Y, yMin, yMax), side: null, anchored: false, overDisc: false, fits: false };
  }
  const r = Math.max(0, Number.isFinite(disc.r) ? disc.r : 0);
  const right = disc.x + r + gap, left = disc.x - r - gap - PW;
  const fitsR = right + PW <= ox + ow - E, fitsL = left >= ox + E;
  const held = prevSide === 'right' || prevSide === 'left' ? prevSide : null;
  let side;
  if (held && lockSide) side = held;
  else if (held) {
    const other = held === 'right' ? 'left' : 'right';
    const fits = { right: fitsR, left: fitsL };
    side = fits[held] ? held : (fits[other] ? other : held);   // zmiana tylko, gdy bieżąca strona wychodzi poza obszar mapy
  } else if (fitsR) side = 'right';
  else if (fitsL) side = 'left';
  else side = ((ox + ow - E) - (disc.x + r)) >= ((disc.x - r) - (ox + E)) ? 'right' : 'left';   // większy zapas
  const px = clamp(side === 'right' ? right : left, xMin, xMax);
  const py = clamp(disc.y - PH / 2, yMin, yMax);
  return { px, py, side, anchored: true, overDisc: cardOverDisc({ px, py, PW, PH }, disc), fits: side === 'right' ? fitsR : fitsL };
}

/**
 * Pamięć strony jednej karty (histereza 493). `place` jak `computeSideCardPlacement` + `key` (obiekt karty — zmiana obiektu =
 * wybór strony od nowa) i `now` (czas realny, ms). Strona trzymana; zmiana tylko, gdy na bieżącej karta wyszłaby poza obszar
 * mapy, i nie częściej niż co `SWITCH_MIN_MS` (wcześniej — karta zostaje po swojej stronie, przycięta do kadru).
 */
export function makeCardSideMemory() {
  let key, side = null, switchedAt = -Infinity, lastAt = -Infinity;
  return {
    place({ key: k, disc, PW, PH, bounds, gap = CARD_SIDE.GAP, now = 0 }) {
      if (k !== key || !(now - lastAt <= CARD_SIDE.RESET_IDLE_MS) || now < lastAt) {
        key = k; side = null; switchedAt = -Infinity;
      }
      lastAt = now;
      let pl = computeSideCardPlacement({ disc, PW, PH, bounds, gap, prevSide: side });
      if (pl.side && side && pl.side !== side && now - switchedAt < CARD_SIDE.SWITCH_MIN_MS) {
        pl = computeSideCardPlacement({ disc, PW, PH, bounds, gap, prevSide: side, lockSide: true });
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
 * Tarcza obiektu na ekranie (px logiczne): środek i promień — ciało (`getBodyWorldInfo`), statek (`getVesselWorldInfo`),
 * stacja (`getStationWorldInfo`) rzutowane wspólnym projektorem HUD. `null` — obiekt za kamerą albo nie w scenie.
 * @param {object} K — `window.KOSMOS`
 * @param {'body'|'vessel'|'station'} kind
 */
export function objectScreenDisc(K, kind, id) {
  const tr = K?.threeRenderer;
  if (!tr || id == null) return null;
  const view = tr.getHudView?.();
  if (!view) return null;
  const w = kind === 'vessel' ? tr.getVesselWorldInfo?.(id)
    : kind === 'station' ? tr.getStationWorldInfo?.(id)
    : tr.getBodyWorldInfo?.(id);
  if (!w) return null;
  const s = K.uiScale > 0 ? K.uiScale : Math.min((view.cssW ?? 1280) / 1280, (view.cssH ?? 720) / 720);
  const proj = makeHudProjector({ ...view, uiScale: s });
  // Próg głębi niższy niż dla okręgów radaru: kamera schodzi do 0,005 j. od stacji (podłoga zoomu) — obiekt przed kamerą
  // nadal ma kotwicę (inaczej karta skakała do rogu obszaru mapy przy samej podłodze zoomu).
  const p = proj?.point(w.x, w.y, w.z, OBJECT_NEAR_CLIP);
  if (!p) return null;
  return { x: p.x, y: p.y, r: w.r > 0 ? w.r * proj.pxPerWorld(p.depth) : 0 };
}
