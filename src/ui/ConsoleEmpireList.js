// ConsoleEmpireList — lista obcych imperiów na zestawie konsoli (ARC KONSOLE K0b; Dyplomacja użyje jej w K2).
//
// Wiersz dwulinijkowy: kropka archetypu (barwa tożsamości imperium — dana z `EmpireData`, tylko od `contact`; poniżej rola dim),
// nazwa w mgle, pod nią etykieta poziomu wywiadu, archetyp po prawej (od `contact`). Zaznaczenie, hover, przycięcie, przewijanie
// i strefy — `ConsoleKit.drawList` (podkreślenie primary + nawiasy narożne). Reguły mgły i treść wiersza — `EmpireListLogic`.
// Hak `extra(ctx, view, rect, state)` — dorysowanie w wierszu. K2: `line1Right(view)` → `{ text, tone }` — prawy napis pierwszej
// linii (Dyplomacja: stan relacji · napięcie); nazwa jest skracana o jego szerokość. Bez opcji — wiersz jak w K0b.

import { THEME } from '../config/ThemeConfig.js';
import { drawList, revealScroll } from './ConsoleKit.js';
import { truncateText } from './HudLabelLogic.js';

export const EMPIRE_ROW_H = 36;    // wysokość wiersza listy imperiów (px logiczne)
const DOT_R = 4;                   // promień kropki archetypu
const PAD_X = 10;

const font = (size, bold = false) => `${bold ? 'bold ' : ''}${size}px ${THEME.fontFamily}`;

/**
 * Lista imperiów w prostokącie. `views` — `EmpireListLogic.empireRowView` (id, name, masked, levelKey, levelTone, archName,
 * archColor). Zwraca wynik `drawList` (`zones` typu 'row' z id imperium, `contentH`, `scroll` po klamrze).
 * @param {{ selectedId?:string|null, hoverId?:string|null, scroll?:number, levelLabel:(view)=>string,
 *           extra?:(ctx, view, rect, state)=>void, line1Right?:(view)=>({text:string,tone?:string}|null) }} o
 */
export function drawEmpireList(ctx, rect, views, roles, { selectedId = null, hoverId = null, scroll = 0, levelLabel, extra = null, line1Right = null } = {}) {
  const renderRow = (c, v, r, st) => {
    const cy1 = r.y + 13, cy2 = r.y + 26;
    c.textBaseline = 'middle';
    // kropka archetypu
    c.fillStyle = v.archColor ?? roles.dim;
    c.beginPath(); c.arc(r.x + PAD_X, cy1, DOT_R, 0, Math.PI * 2); c.fill();
    // archetyp po prawej (od kontaktu)
    let archW = 0;
    c.font = font(THEME.fontSizeSmall);
    if (v.archName) {
      c.fillStyle = roles.dim; c.textAlign = 'right';
      const a = truncateText(v.archName, Math.floor(r.w * 0.45), (s) => c.measureText(s).width);
      c.fillText(a, r.x + r.w - PAD_X, cy2);
      archW = c.measureText(a).width + 8;
      c.textAlign = 'left';
    }
    // K2 — prawy napis pierwszej linii (opcjonalny)
    let rightW = 0;
    const r1 = line1Right ? line1Right(v) : null;
    if (r1?.text) {
      c.font = font(THEME.fontSizeSmall);
      c.fillStyle = roles[r1.tone] ?? roles.dim; c.textAlign = 'right';
      const s1 = truncateText(String(r1.text), Math.floor(r.w * 0.5), (s) => c.measureText(s).width);
      c.fillText(s1, r.x + r.w - PAD_X, cy1);
      rightW = c.measureText(s1).width + 8;
      c.textAlign = 'left';
    }
    // nazwa (mgła: „???” w roli dim)
    c.font = font(THEME.fontSizeNormal, true);
    c.fillStyle = v.masked ? roles.dim : roles.primary;
    c.globalAlpha = st.sel || st.hov || v.masked ? 1 : 0.9;
    c.fillText(truncateText(v.name, r.w - 2 * PAD_X - 10 - rightW, (s) => c.measureText(s).width), r.x + PAD_X + 10, cy1);
    c.globalAlpha = 1;
    // poziom wywiadu
    c.font = font(THEME.fontSizeSmall);
    c.fillStyle = roles[v.levelTone] ?? roles.dim;
    const lv = String(levelLabel ? levelLabel(v) : v.levelKey);
    c.fillText(truncateText(lv, r.w - 2 * PAD_X - 10 - archW, (s) => c.measureText(s).width), r.x + PAD_X + 10, cy2);
    if (extra) extra(c, v, r, st);
  };
  return drawList(ctx, rect, views, roles, { selectedId, hoverId, scroll, rowH: EMPIRE_ROW_H, renderRow });
}

/** Czysta: przewinięcie odsłaniające zaznaczone imperium (wiersze `EMPIRE_ROW_H`). */
export function revealEmpire(views, id, scroll, viewH) {
  return revealScroll(views, id, scroll, viewH, EMPIRE_ROW_H);
}
