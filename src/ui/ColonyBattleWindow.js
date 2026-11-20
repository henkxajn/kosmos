// ARC COLONY SPHERE CS-10b — okno bitwy naziemnej na kolonii z kulą (konsola Kolonii, plan §3.20).
//
// Mapa płaska nie ma osobnego okna bitwy: walka jest automatyczna (Victoria 2 — CombatSystem), gracz widzi „⚔ W BITWIE” w panelu
// jednostki, panel stosu i listę grupy (`I`). Na kuli bitwa była tylko znacznikiem; to okno pokazuje stan pola spornego z
// `CombatSystem.getBattleStateAt` (strony, runda, teren — metoda „do tooltipa” bez czytelnika) w idiomie konsol, obok strefy
// inspektora u góry bohatera. Otwiera je klik w znacznik bitwy / w pole sporne; zamyka ✕ albo koniec bitwy.
// Tylko odczyt + zaznaczenie własnych jednostek pola (te same strefy co szuflada grupy) — żadnej nowej mechaniki.
//
// D-CS-31 (poprawka właściciela): karta bitwy NA ŻYWO — rekord `ColonyBattleFeed` (zdarzenia walki) daje rundę, HP obu
// stron po każdej rundzie, utracone jednostki, krótki dziennik ostatnich zdarzeń i wynik. Okno otwiera się samo na starcie
// bitwy w konsoli tej kolonii (`handleBattleStart`); po końcu bitwy zostaje z wynikiem do zamknięcia ✕.

import { THEME } from '../config/ThemeConfig.js';
import { t } from '../i18n/i18n.js';
import { UNIT_ARCHETYPES } from '../data/unitArchetypes.js';
import { drawBar, drawActionChip, drawZoneFrame, drawConsoleBackground, CONSOLE_KIT } from './ConsoleKit.js';
import { truncateText } from './HudLabelLogic.js';
import { battleWindowModel, battleWindowRect, BATTLE_WINDOW } from '../renderer/ColonyUnitPolishLogic.js';
import { archName, unitArt } from './ColonyConsolePages.js';
import { tileGraphOf } from '../map/TileGraph.js';
import { battleCardModel, battleLogLine, BATTLE_FEED } from './ColonyBattleFeed.js';

const F = (sz, b = false) => `${b ? 'bold ' : ''}${sz}px ${THEME.fontFamily}`;
const fit = (ctx, s, w) => truncateText(String(s ?? ''), Math.max(0, w), (q) => ctx.measureText(q).width);
const hov = (ov, x, y) => { const hz = ov._hoverZone; return !!hz && hz.x === x && hz.y === y; };

/**
 * Stan okna dla otwartego pola (`ov._cBattle = { planetId, q, r }`) albo null (brak bitwy i brak rekordu — okno się zamyka).
 * Z rekordem karty (`KOSMOS.colonyBattleFeed`) — przebieg na żywo i wynik po końcu; bez niego — sam stan pola (CS-10b v1).
 */
export function battleStateFor(kosmos, b) {
  if (!b) return null;
  const st = kosmos?.combatSystem?.getBattleStateAt?.(b.planetId, b.q, b.r) ?? null;
  const grid = kosmos?.colonyManager?.getColony?.(b.planetId)?.grid ?? null;
  const type = grid ? (tileGraphOf(grid)?.tile?.({ q: b.q, r: b.r })?.type ?? null) : null;
  const rec = kosmos?.colonyBattleFeed?.get?.(b.planetId, b.q, b.r) ?? null;
  if (rec && (rec.started || rec.ended)) return battleCardModel(rec, st, UNIT_ARCHETYPES, type);
  const m = battleWindowModel(st, UNIT_ARCHETYPES, type);
  return m ? { ...m, ownLost: 0, enemyLost: 0, ended: false, outcome: null, log: [] } : null;
}

const LOG_ROW_H = 14;
const STATE_KEY = { destroyed: 'colonyBattle.stDestroyed', retreated: 'colonyBattle.stRetreated', collapsed: 'colonyBattle.stCollapsed' };
const OUTCOME_KEY = { win: 'colonyBattle.outcomeWin', loss: 'colonyBattle.outcomeLoss', draw: 'colonyBattle.outcomeDraw' };

/**
 * Rysuj okno bitwy. Zwraca wysokość (0 — nic; bitwa skończona → okno zamknięte).
 * Strefy: `cBattleClose`, `cBattleSelectOwn` ({ planetId, q, r }), `drawerUnitClick` ({ unitId }) dla własnych, absorber `floatPanel`.
 */
export function drawBattleWindow(ov, ctx, zones, roles) {
  const b = ov._cBattle;
  if (!b) return 0;
  const m = battleStateFor(typeof window !== 'undefined' ? window.KOSMOS : null, b);
  if (!m) { ov._cBattle = null; return 0; }
  const W = BATTLE_WINDOW, rows = Math.max(m.own.length, m.enemy.length, 1);
  const logRows = m.log.length ? Math.min(m.log.length, BATTLE_FEED.MAX_LOG) : 0;
  const logH = logRows ? logRows * LOG_ROW_H + 8 : 0;
  const r = battleWindowRect(zones, W.HEAD_H + Math.min(rows, W.MAX_ROWS) * W.ROW_H + logH + W.FOOT_H);
  if (!r) return 0;
  drawConsoleBackground(ctx, r);
  drawZoneFrame(ctx, r, roles, { tone: m.ended && m.outcome === 'win' ? 'primary' : 'alert' });
  ctx.save(); ctx.textBaseline = 'middle';
  ctx.font = F(THEME.fontSizeSmall, true); ctx.fillStyle = roles.alert;
  const tileLabel = ov._graphFor?.(b.planetId)?.idOf?.({ q: b.q, r: b.r }) ?? String(b.q);
  ctx.fillText(fit(ctx, t('colonyBattle.title', tileLabel).toUpperCase(), r.w - 40), r.x + 8, r.y + 11);
  ctx.font = F(THEME.fontSizeSmall - 1); ctx.fillStyle = roles.dim;
  const tk = m.terrainKey ? `terrain.${m.terrainKey}.name` : null, terrain = tk ? t(tk) : '';
  const live = m.ended ? '' : ` · ${t('colonyBattle.live')}`;
  ctx.fillText(fit(ctx, t('colonyBattle.round', m.round) + live + (terrain && terrain !== tk ? ` · ${terrain}` : ''), r.w - 16), r.x + 8, r.y + 27);
  // ✕
  const cx = r.x + r.w - 22, cy = r.y + 3;
  ctx.font = F(THEME.fontSizeSmall, true); ctx.fillStyle = hov(ov, cx, cy) ? roles.primary : roles.dim; ctx.fillText('✕', cx + 6, cy + 9);
  ov._addHit(cx, cy, 18, 18, 'cBattleClose', {});
  // dwie kolumny: własne | wróg (sumy HP nad listą)
  const colW = (r.w - 24) / 2, top = r.y + W.HEAD_H;
  const side = (list, x, tone, label, hp, hpMax, own, lost) => {
    ctx.font = F(THEME.fontSizeSmall - 1, true); ctx.fillStyle = tone === 'alert' ? roles.alert : roles.primary;
    const alive = list.filter(u => (u.state ?? 'alive') === 'alive').length;
    ctx.fillText(fit(ctx, `${label} · ${alive}` + (lost ? ` · ${t('colonyBattle.lost', lost)}` : ''), colW - 4), x, top - 10);
    drawBar(ctx, x, top - 3, colW - 4, hpMax ? hp / hpMax : 0, roles, { tone });
    list.slice(0, W.MAX_ROWS).forEach((u, i) => {
      const y = top + 4 + i * W.ROW_H;
      const gone = (u.state ?? 'alive') !== 'alive';
      if (own && !gone && hov(ov, x - 2, y)) { ctx.save(); ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(x - 2, y, colW, W.ROW_H - 2); ctx.restore(); }
      ctx.save();
      if (gone) ctx.globalAlpha = 0.45;   // utracona / wycofana jednostka zostaje w składzie, przyciemniona
      const art = own ? unitArt(ov, u.archetypeId) : null;
      if (art) ctx.drawImage(art, x, y + 1, W.ROW_H - 4, W.ROW_H - 4);
      ctx.font = F(THEME.fontSizeSmall - 1); ctx.fillStyle = gone ? roles.dim : roles.primary;
      const tx = x + (art ? W.ROW_H : 0);
      ctx.fillText(fit(ctx, archName(u.archetypeId), colW - (tx - x) - 6), tx, y + 7);
      if (gone) {
        ctx.fillStyle = u.state === 'retreated' ? roles.dim : roles.alert;
        ctx.fillText(fit(ctx, '✖ ' + t(STATE_KEY[u.state] ?? STATE_KEY.destroyed), colW - (tx - x) - 6), tx, y + 16);
      } else drawBar(ctx, tx, y + 14, colW - (tx - x) - 8, u.hpFrac, roles, { tone, h: 3 });
      ctx.restore();
      if (own && !gone) ov._addHit(x - 2, y, colW, W.ROW_H - 2, 'drawerUnitClick', { unitId: u.id, tip: `${archName(u.archetypeId)} · HP ${Math.round(u.hp)}/${Math.round(u.hpMax)}`, tipTone: 'dim' });
    });
    if (list.length > W.MAX_ROWS) { ctx.font = F(THEME.fontSizeSmall - 1); ctx.fillStyle = roles.dim; ctx.fillText(`+${list.length - W.MAX_ROWS}`, x, top + 4 + W.MAX_ROWS * W.ROW_H + 4); }
  };
  side(m.own, r.x + 8, 'primary', t('colonyBattle.own'), m.ownHp, m.ownHpMax, true, m.ownLost);
  side(m.enemy, r.x + 16 + colW, 'alert', t('colonyBattle.enemy'), m.enemyHp, m.enemyHpMax, false, m.enemyLost);
  // dziennik: ostatnie zdarzenia (bilans rundy, utraty, odwroty, wynik)
  if (logRows) {
    const ly = top + Math.min(rows, W.MAX_ROWS) * W.ROW_H + 6;
    ctx.save(); ctx.strokeStyle = roles.dim; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.moveTo(r.x + 8, ly - 3); ctx.lineTo(r.x + r.w - 8, ly - 3); ctx.stroke(); ctx.restore();
    ctx.font = F(THEME.fontSizeSmall - 2);
    m.log.slice(-logRows).forEach((e, i) => {
      const ln = battleLogLine(e);
      if (!ln) return;
      const args = ln.unit !== undefined ? [...ln.args, archName(ln.unit)] : ln.args;
      ctx.fillStyle = roles[ln.tone] ?? roles.dim;
      ctx.fillText(fit(ctx, t(ln.key, ...args), r.w - 16), r.x + 8, ly + 5 + i * LOG_ROW_H);
    });
  }
  ctx.restore();
  // akcja: zaznacz własne jednostki pola (jak „zaznacz stos” mapy płaskiej) + podpowiedź o odwrocie (panel jednostki)
  const ay = r.y + r.h - W.FOOT_H + 6, aw = Math.min(160, r.w - 16);
  const can = !m.ended && m.own.some(u => (u.state ?? 'alive') === 'alive');
  drawActionChip(ctx, r.x + 8, ay, aw, roles, { label: t('colonyBattle.selectOwn'), enabled: can, hover: hov(ov, r.x + 8, ay) });
  ov._addHit(r.x + 8, ay, aw, CONSOLE_KIT.CHIP_H, can ? 'cBattleSelectOwn' : 'cReason', can ? { planetId: b.planetId, q: b.q, r: b.r } : { tip: t('colonyBattle.noOwn') });
  ctx.save(); ctx.textBaseline = 'middle'; ctx.font = F(THEME.fontSizeSmall - 1); ctx.fillStyle = roles.dim;
  // po końcu bitwy zamiast podpowiedzi — wynik (okno zostaje do zamknięcia ✕)
  if (m.ended) { ctx.font = F(THEME.fontSizeSmall - 1, true); ctx.fillStyle = m.outcome === 'win' ? roles.primary : roles.alert; }
  const foot = m.ended ? t(OUTCOME_KEY[m.outcome] ?? OUTCOME_KEY.draw) : t('colonyBattle.retreatHint');
  ctx.fillText(fit(ctx, foot, r.w - aw - 28), r.x + aw + 16, ay + CONSOLE_KIT.CHIP_H / 2);
  ctx.restore();
  ov._addHit(r.x, r.y, r.w, r.h, 'floatPanel', {});   // absorber: klik w okno nie przebija na kulę
  return r.h;
}
