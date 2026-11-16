// ShipAnchorOverlay — rysunek kotwic modułów na hologramie (ARC KONSOLE, krok K1b; CONSOLES_PLAN.md §2 B3).
// Znacznik + odnośnik + podkreślenie + etykieta roli WIELKIMI literami (idiom HUD), barwy wyłącznie z ról motywu:
// kotwica z pliku właściciela — `primary` pełna; wartość domyślna gry — `primary` przygaszona i przerywana (widać, które modele
// czekają na Workshop).
// Rzut 3D → ekran: `ShipHologramRenderer.projectPoints` (ta sama poza co ostatnia klatka: obrót, plan, sylwetka).
// Układ etykiet: `ShipAnchorOverlayLogic.layoutAnchorLabels`. K1c doda listę modułów pod etykietą (ta sama linia).

import { t } from '../i18n/i18n.js';
import { ANCHOR_OVERLAY, layoutAnchorLabels } from './ShipAnchorOverlayLogic.js';

const DEFAULT_ALPHA = 0.5;       // krycie kotwicy domyślnej (plik właściciela = 1)
const DEFAULT_DASH = [3, 3];     // [px log.] odnośnik kotwicy domyślnej — przerywany

/** Etykieta roli (i18n, WIELKIE litery). */
export function anchorRoleLabel(role) { return String(t('shipAnchor.' + role)).toUpperCase(); }

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} renderer — `ShipHologramRenderer` (anchors(), projectPoints())
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @param {{ roles: { primary:string }, font: string }} style
 * @returns {{ drawn:number, fromFile:number, pending:boolean }}
 */
export function drawShipAnchors(ctx, renderer, rect, { roles, font }) {
  const res = renderer?.anchors?.();
  if (!res) return { drawn: 0, fromFile: 0, pending: true };
  const pts = renderer.projectPoints(res.anchors.map((a) => a.p), rect, ctx);
  ctx.save();
  ctx.font = font;
  const items = pts.map((q) => {
    const a = res.anchors[q.i];
    return { key: a.role + ':' + q.view, role: a.role, x: q.x, y: q.y, src: a.src, text: anchorRoleLabel(a.role), label: q.view !== 'top' };
  });
  const placed = layoutAnchorLabels(items, rect, { measure: (s) => ctx.measureText(s).width });
  const o = ANCHOR_OVERLAY;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 1;
  for (const e of placed) {
    const file = e.src === 'file';
    // Obie w `primary` (rola `dim` w Amber Noir ginie na ciemnym tle — kontakt K1b); domyślna: przygaszona, przerywana, pusty znacznik.
    ctx.strokeStyle = roles.primary; ctx.fillStyle = roles.primary;
    ctx.globalAlpha = file ? 1 : DEFAULT_ALPHA;
    ctx.setLineDash?.(file ? [] : DEFAULT_DASH);
    // znacznik: z pliku — pierścień z kropką; domyślny — sam pierścień
    ctx.beginPath(); ctx.arc(e.x, e.y, o.MARK_R, 0, Math.PI * 2); ctx.stroke();
    if (file) { ctx.beginPath(); ctx.arc(e.x, e.y, 1.3, 0, Math.PI * 2); ctx.fill(); }
    if (!e.elbow) continue;
    // odnośnik od krawędzi znacznika do łokcia, potem podkreślenie
    const dx = e.elbow[0] - e.x, dy = e.elbow[1] - e.y, d = Math.hypot(dx, dy) || 1;
    const lx = e.side < 0 ? e.line[1] : e.line[0];
    ctx.beginPath();
    ctx.moveTo(e.x + dx / d * o.MARK_R, e.y + dy / d * o.MARK_R);
    ctx.lineTo(lx, e.elbow[1]);
    ctx.lineTo(e.side < 0 ? e.line[0] : e.line[1], e.elbow[1]);
    ctx.stroke();
    ctx.fillText(e.text, e.textX, e.elbow[1] - 3);
  }
  ctx.restore();
  return { drawn: placed.length, fromFile: res.fromFile, pending: false };
}
