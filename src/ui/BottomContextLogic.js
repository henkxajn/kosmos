// BottomContextLogic — czyste helpery pływającego panelu planety (redesign UI v1, Slice 1).
//
// Wydzielone z BottomContext, by logikę pozycjonowania dało się testować bez DOM/canvas
// (wzór StationPanelLogic). Brief 1E: ciało w prawej połowie ekranu → panel po LEWEJ od niego;
// ciało w lewej połowie → panel po PRAWEJ; zawsze clamp tak, by cała karta mieściła się
// w obszarze mapy (między sidebarem, Outlinerem, TopBarem i dolnym paskiem).

const GAP = 18;   // odstęp panelu od ciała (px)
const EDGE = 4;   // margines wewnątrz obszaru mapy (px)

/**
 * Policz pozycję lewego-górnego rogu pływającej karty.
 * @param {object}  p
 * @param {{x:number,y:number}|null} p.bodyScreen — ekranowa pozycja ciała (null = za kamerą).
 * @param {number}  p.PW       — szerokość karty.
 * @param {number}  p.PH       — wysokość karty.
 * @param {{ox:number,oy:number,ow:number,oh:number}} p.bounds — obszar mapy (origin + rozmiar).
 * @param {number}  p.screenW  — szerokość ekranu (do decyzji lewa/prawa połowa).
 * @returns {{px:number, py:number, anchored:boolean}}
 */
export function computeFloatingPlacement({ bodyScreen, PW, PH, bounds, screenW }) {
  const { ox, oy, ow, oh } = bounds;
  let px, py;

  if (bodyScreen) {
    // Ciało w prawej połowie → panel po lewej, inaczej po prawej.
    const isRightHalf = bodyScreen.x > screenW / 2;
    px = isRightHalf ? bodyScreen.x - PW - GAP : bodyScreen.x + GAP;
    py = bodyScreen.y - PH / 2;
  } else {
    // Brak kotwicy (ciało za kamerą) → lewy-górny róg obszaru mapy.
    px = ox + 12;
    py = oy + 12;
  }

  // Clamp — cała karta wewnątrz obszaru mapy.
  px = Math.max(ox + EDGE, Math.min(ox + ow - PW - EDGE, px));
  py = Math.max(oy + EDGE, Math.min(oy + oh - PH - EDGE, py));

  return { px, py, anchored: !!bodyScreen };
}
