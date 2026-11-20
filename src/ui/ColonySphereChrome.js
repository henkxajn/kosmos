// ColonySphereChrome — rama bohatera kuli kolonii w barwach motywu (ARC COLONY SPHERE, krok CS-7).
//
// Rysowana Canvas 2D NAD obrazem kuli: narożniki ramy, podpis ciała (nazwa · archetyp · liczba pól), stan widoku
// (soczewka / tryb budowy / zaopatrzenie) z legendą barw, podpowiedź sterowania, znacznik widoku 2D. Barwy wyłącznie
// z ról HUD (`resolveHudRoles`) i tokenów THEME — arkusz kontaktowy pokazuje ramę w 5 motywach.

import { THEME } from '../config/ThemeConfig.js';
import { resolveHudRoles, tokenRgb } from './HudPalette.js';
import { t } from '../i18n/i18n.js';

const CORNER = 16;       // długość ramienia narożnika [px]
const PAD = 10;          // margines napisów od ramy [px]
const PLATE = 'rgba(2,4,8,0.62)';   // podkład pod napisy (tło okna kolonii)

/** Barwy nakładki kuli z motywu (dla `ColonySphereRenderer.setColors`): [r, g, b, a] w 0…1. */
export function sphereThemeColors(theme = THEME) {
  const roles = resolveHudRoles(theme);
  const acc = tokenRgb(roles.primary) ?? [0, 255, 180], txt = tokenRgb(roles.foreign) ?? [170, 200, 192];
  const f = (c, a) => [c[0] / 255, c[1] / 255, c[2] / 255, a];
  return {
    grid: f(txt, 0.46),
    hover: [1, 1, 1, 0.95],
    selection: f(acc, 1),
    own: [100 / 255, 160 / 255, 255 / 255, 0.9],       // jak granice mapy 2D (#64A0FF / #D85A30)
    foreign: [216 / 255, 90 / 255, 48 / 255, 0.9],
    accentBytes: [acc[0], acc[1], acc[2]],
  };
}

/**
 * Rama i podpisy bohatera.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number, y:number, w:number, h:number}} rect kadr kuli
 * @param {object} info
 * @param {string} [info.title] nazwa ciała
 * @param {string} [info.archetype] id archetypu ciała (nazwa z i18n)
 * @param {number} [info.tiles] liczba pól
 * @param {string} [info.lens] soczewka ('none' = brak)
 * @param {boolean} [info.build] tryb budowy
 * @param {boolean} [info.supply] pokrycie zaopatrzenia
 * @param {{key:string, rgb:number[]}[]} [info.legend] legenda barw (`sphereLegend`)
 * @param {boolean} [info.fallback] widok 2D
 * @param {boolean} [info.hint] pokaż podpowiedź sterowania
 */
export function drawSphereChrome(ctx, rect, info = {}) {
  const roles = resolveHudRoles(THEME);
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = THEME.border;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // Narożniki ramy
  ctx.strokeStyle = roles.primary; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.85;
  const cs = [[x + 4, y + 4, 1, 1], [x + w - 4, y + 4, -1, 1], [x + 4, y + h - 4, 1, -1], [x + w - 4, y + h - 4, -1, -1]];
  ctx.beginPath();
  for (const [cx, cy, sx, sy] of cs) { ctx.moveTo(cx + sx * CORNER, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * CORNER); }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Podkład pod napis: kula bywa jasna (chmury, lód) — napisy ramy muszą zostać czytelne.
  const plate = (px, py, pw, ph) => { ctx.fillStyle = PLATE; ctx.fillRect(Math.round(px), Math.round(py), Math.round(pw), Math.round(ph)); };

  // Podpis ciała (lewy górny róg)
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  let ty = y + PAD + 2;
  const sub = [];
  if (info.archetype) sub.push(t(`archetype.${info.archetype}.name`));
  if (Number.isFinite(info.tiles)) sub.push(t('colonySphere.tiles', info.tiles));
  const subText = sub.join('  ·  ');
  const titleText = info.title ? String(info.title).toUpperCase() : '';
  if (titleText || subText) {
    ctx.font = `bold 12px ${THEME.fontFamily}`;
    let tw = titleText ? ctx.measureText(titleText).width : 0;
    ctx.font = `10px ${THEME.fontFamily}`;
    if (subText) tw = Math.max(tw, ctx.measureText(subText).width);
    plate(x + PAD, ty - 4, tw + 12, (titleText ? 16 : 0) + (subText ? 14 : 0) + 6);
  }
  if (titleText) {
    ctx.font = `bold 12px ${THEME.fontFamily}`;
    ctx.fillStyle = roles.primary;
    ctx.fillText(titleText, x + PAD + 6, ty);
    ty += 16;
  }
  if (subText) {
    ctx.font = `10px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(subText, x + PAD + 6, ty);
  }

  // Stan widoku + legenda (lewy dolny róg)
  const mode = info.build ? t('colonySphere.mode.build') : (info.supply ? t('colonySphere.mode.supply')
    : (info.lens && info.lens !== 'none' ? t('colonySphere.lens', t(`colonySphere.lens.${info.lens}`)) : null));
  ctx.textBaseline = 'alphabetic';
  let by = y + h - PAD - 2;
  if (info.fallback) {
    ctx.font = `10px ${THEME.fontFamily}`;
    ctx.fillStyle = roles.alert;
    ctx.fillText(t('colonySphere.fallback2d'), x + PAD + 6, by);
    by -= 15;
  }
  const legend = info.legend ?? [];
  if (legend.length) {
    ctx.font = `10px ${THEME.fontFamily}`;
    let lx = x + PAD + 6;
    let lw = 0;
    for (const item of legend) lw += 13 + ctx.measureText(t(`colonySphere.legend.${item.key}`)).width + 14;
    plate(x + PAD, by - 12, lw, 17);
    for (const item of legend) {
      const label = t(`colonySphere.legend.${item.key}`);
      ctx.fillStyle = `rgb(${item.rgb[0]},${item.rgb[1]},${item.rgb[2]})`;
      ctx.fillRect(lx, by - 8, 9, 9);
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(label, lx + 13, by);
      lx += 13 + ctx.measureText(label).width + 14;
    }
    by -= 16;
  }
  if (mode) {
    ctx.font = `bold 11px ${THEME.fontFamily}`;
    plate(x + PAD, by - 12, ctx.measureText(mode.toUpperCase()).width + 12, 17);
    ctx.fillStyle = roles.primary;
    ctx.fillText(mode.toUpperCase(), x + PAD + 6, by);
  }

  // Podpowiedź sterowania (prawy górny róg — dół zajmuje legenda)
  if (info.hint !== false) {
    ctx.font = `10px ${THEME.fontFamily}`;
    const hw = ctx.measureText(t('colonySphere.hint')).width;
    plate(x + w - PAD - 12 - hw, y + PAD - 2, hw + 12, 17);
    ctx.fillStyle = THEME.textSecondary;
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(t('colonySphere.hint'), x + w - PAD - 6, y + PAD + 2);
  }
  ctx.restore();
}
