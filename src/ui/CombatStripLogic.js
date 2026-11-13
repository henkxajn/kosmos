// CombatStripLogic — ARC COMBAT VISUALS, krok CV-6b2 (COMBAT_VISUALS_PLAN.md §3.2-16, §3.2-23, §4 CV-6b2; Findingi 629, 630,
// 639): czysta logika PASKA WALKI, który zastąpił kartę walki (`CombatHUD`, usuniętą w CV-Z). Rysunek, pomiar tekstu
// i strefy — `CombatStrip`; spięcie z hostem (rysunek, klik, kółko, kursor, Esc) — `UIManager`.
//   • JEDNOSTKA = KLASTER STARĆ — ta sama reguła co scena bitwy, baner wyniku i Dziennik (`encounterClusters`: pozycje
//     LOGICZNE uczestników, ten sam układ, środki ≤ `STAGE.CLUSTER_AU`; Finding 638): jedna linia na bitwę, nigdy na starcie;
//   • zwinięty (domyślnie): linia na bitwę — miejsce · własne żywe / wszystkie + pasek HP + % · wróg tak samo · runda ·
//     [ Obserwuj ] · [ ▼ ]; najwyżej `MAX_LINES` linii, dalej „+N”; rozwinięty (▼, jedna bitwa naraz): okręty obu stron
//     (nazwa · klasa · pasek HP i tarczy, zniszczone przygaszone) i ostatnie linie logu rund; ▲ / Esc zwija;
//   • mgła wojny jak karta dziś: w starciu z graczem wróg widoczny (karta nazywa go od pierwszej rundy), poza nim — wywiad
//     ≥ contact (`isEndpointVisibleInCombat`); okręt niewidoczny nie wchodzi do liczb, a strona pokazuje „?”;
//   • położenie: krawędź OBSZARU MAPY z `MapInsets` (#629) — nigdy pod kolumnami outlinerów ani pod pasem dolnym; domyślnie
//     pod górną belką (`EDGE` 'top'; 'bottom' — nad pasem dolnym, do porównania z konsoli); prostokąt z ostatniej klatki niesie
//     krawędź (`edge`): kadr „Obserwuj” trzyma bitwę POD paskiem u góry albo NAD nim u dołu (`watchSafeRect`);
//   • „Obserwuj” emituje `camera:watchBattle` z dzisiejszym ładunkiem (id starcia klastra, układ, punkt — jak wiersz karty pod
//     `cvStage`); chip reżysera (CV-7) — do tego czasu nie istnieje.
// Czysty: bez three, bez DOM, bez `window` — świat (pozycje, wywiad, nazwy) podaje wołający; wykonuje się pod node (keeper
// `cv_strip_smoke`).
import { encounterClusters } from '../renderer/combat/BattleStageLogic.js';
import { mergeEncounterView } from './BattleClusterLogic.js';
import { isEndpointVisibleInCombat, isPlayerEngagement, isEngagementInView } from '../utils/VesselFxLogic.js';

// Stałe (px logiczne). Strojenie na bramce — z konsoli: `KOSMOS.combatStrip.tune({ EDGE: 'bottom' })` (przeżywa do F5).
export const COMBAT_STRIP_DEFAULTS = Object.freeze({
  EDGE: 'top',            // 'top' — pod górną belką; 'bottom' — nad pasem dolnym (rozwinięcie rośnie w górę)
  GAP: 4,                 // odstęp paska od krawędzi obszaru mapy
  SIDE_MARGIN: 10,        // odstęp od kolumn outlinerów
  PAD_X: 6, PAD_Y: 3,     // margines treści
  LINE_H: 15,             // linia bitwy (zwinięta)
  LINE_GAP: 2,
  MORE_H: 12,             // linia „+N”
  MAX_LINES: 3,
  MIN_W: 280, MAX_W: 640, // szerokość paska (klamra także do szerokości obszaru mapy)
  LOC_MAX_W: 170,         // kolumna miejsca bitwy — przycięta z wielokropkiem
  FIELD_GAP: 10,          // odstęp pól linii
  BAR_W: 34, BAR_H: 3,    // pasek HP strony w linii
  CHIP_GAP: 6, CHIP_PAD_Y: 1, CHIP_HIT_PAD_X: 2,
  BAR_ALPHA: 0.72,        // tło — ciemny pasek bez ramki (jak panel statku T5 i przypięta etykieta HUD)
  SUB_ALPHA: 0.78, DIM_ALPHA: 0.62, EYEBROW_ALPHA: 0.62, EYEBROW_SPACING: 1,
  CHIP_ALPHA: 0.9, CHIP_HOVER_FILL: 0.18, BAR_TRACK_ALPHA: 0.35, DEAD_ALPHA: 0.4,
  DETAIL_GAP: 2,          // odstęp rozwinięcia od linii
  DETAIL_ROW_H: 13,       // wiersz okrętu / linii logu
  DETAIL_LOG_LINES: 5,
  DETAIL_MAX_FRAC: 0.45,  // rozwinięcie najwyżej taka część wysokości ekranu (dalej przewija się)
  SECTION_GAP: 4, COL_GAP: 12,
  MICRO_BAR_W: 34, MICRO_BAR_H: 2,
  SCROLL_STEP: 0.5, SCROLLBAR_W: 2,
  BANNER_GAP: 4,          // odstęp pod banerem pickera (DOM, góra ekranu), gdy pasek u góry
  TOOLTIP_MAX_W: 420,
});
export const COMBAT_STRIP = { ...COMBAT_STRIP_DEFAULTS };

/** Strojenie z konsoli: nieznane klucze pominięte; liczby skończone, `EDGE` — 'top' | 'bottom'. Zwraca bieżące wartości. */
export function tuneCombatStrip(patch = {}) {
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (!(k in COMBAT_STRIP_DEFAULTS)) continue;
    if (k === 'EDGE') { if (v === 'top' || v === 'bottom') COMBAT_STRIP.EDGE = v; continue; }
    if (Number.isFinite(v)) COMBAT_STRIP[k] = v;
  }
  return { ...COMBAT_STRIP };
}
export function resetCombatStrip() { Object.assign(COMBAT_STRIP, COMBAT_STRIP_DEFAULTS); return { ...COMBAT_STRIP }; }

// M1 „bitwy do końca” (decyzja 33) — starcie nie ma limitu rund, więc pasek pokazuje samą rundę („R n”). Dawniej tu stało
// `ROUND_CAP = 20` (lustro `DeepSpaceCombatSystem.MAX_ROUNDS`) i pole `maxRounds` w linii bitwy („R n/20”).

const byIdAsc = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
const sideKeyOfPlayer = (e) => (e?.sideA?.ownerEmpireId === 'player' ? 'sideA' : e?.sideB?.ownerEmpireId === 'player' ? 'sideB' : null);
const otherKey = (k) => (k === 'sideA' ? 'sideB' : 'sideA');
const idsOf = (side) => [...(side?.vesselIds ?? []), ...(side?.joinedVesselIds ?? [])];

/**
 * Strona bitwy w pasku: okręty (widoczne i ukryte mgłą) i sumy z WIDOCZNYCH.
 * @param {Array<{id:string, enc:object}>} members
 */
function sideStats(members, { isEnemy, inPlayerEngagement, quality, nameOf, classOf, presented = null }) {
  const ships = [];
  let alive = 0, total = 0, hp = 0, hpStart = 0, hidden = 0;
  for (const { id, enc } of members) {
    const st = enc?.vesselStates?.get?.(id) ?? null;
    const visible = isEndpointVisibleInCombat({ isEnemy, quality: quality(id), inPlayerEngagement });
    // ARC CV-4a (flaga `cvWeapons`, Finding 614) — HP / osłona POKAZYWANE (rejestr salw: spadają w chwili trafienia); bez rejestru — stan logiczny.
    const pr = presented && st ? presented(id, st) : null;
    const h = Math.max(0, Number(pr ? pr.hp : st?.hp) || 0), h0 = Math.max(0, Number(st?.hpStart) || 0);
    // ARC CV-8a — pula obrony planety (powtórka bitwy orbitalnej, `uncounted`): HP w pasku siły strony, bez liczby okrętów i wiersza
    if (st?.uncounted) { hp += h; hpStart += h0; continue; }
    const sh = Math.max(0, Number(pr ? pr.shield : st?.shieldHP) || 0), sh0 = Math.max(0, Number(st?.shieldHPStart) || 0);
    const isAlive = h > 0;
    ships.push({ id, visible, alive: isAlive, hp: h, hpStart: h0, shield: sh, shieldStart: sh0,
      name: visible ? (nameOf?.(id) ?? id) : null, cls: visible ? (classOf?.(id) ?? null) : null });
    if (!visible) { hidden++; continue; }
    total++; if (isAlive) alive++;
    hp += h; hpStart += h0;
  }
  return { ships, alive, total, hp, hpStart, hidden, pct: hpStart > 0 ? Math.max(0, Math.min(1, hp / hpStart)) : 0 };
}

/**
 * Bitwy paska — jedna na klaster aktywnych starć, w kolejności: najpierw oglądany układ, potem reszta; wewnątrz — id
 * klastra rosnąco (stabilnie między klatkami). Starcie, któremu nie da się policzyć środka (brak pozycji i punktu), dostaje
 * własną bitwę (nic nie znika z paska).
 * @param {object[]} encounters — aktywne starcia (`DSCS.listActive()`)
 * @param {{ getPos:(id:string)=>({x:number,y:number}|null), radius:number, activeSystemId?:string|null,
 *           quality?:(id:string)=>string, labelFor?:(owner:string|null, count:number)=>string,
 *           nameOf?:(id:string)=>string, classOf?:(id:string)=>string|null,
 *           presented?:(id:string, st:object)=>({hp:number, shield:number}|null) }} env
 *   presented — ARC CV-4a: HP / osłona pokazywane (rejestr salw renderera, flaga `cvWeapons`); brak / null — stan logiczny
 * @returns {object[]}
 */
export function stripBattles(encounters, env = {}) {
  const list = (encounters ?? []).filter((e) => e && e.id != null && e.isActive !== false);
  if (!list.length) return [];
  const { getPos = () => null, radius = 0, activeSystemId = null, quality = () => 'unknown', labelFor = null,
    nameOf = null, classOf = null, presented = null } = env;
  const byId = new Map(list.map((e) => [String(e.id), e]));
  const clusters = (radius > 0 && typeof getPos === 'function') ? encounterClusters(list, getPos, radius) : [];
  const covered = new Set(clusters.flatMap((c) => c.encounterIds));
  for (const e of list) if (!covered.has(String(e.id))) clusters.push({ id: String(e.id), encounterIds: [String(e.id)] });
  const rows = [];
  for (const cl of clusters) {
    const encs = cl.encounterIds.map((id) => byId.get(String(id))).filter(Boolean).sort((a, b) => byIdAsc(a.id, b.id));
    if (!encs.length) continue;
    const primary = encs[0];
    const playerIn = encs.some((e) => sideKeyOfPlayer(e) != null);
    const inPlayerEngagement = encs.some((e) => isPlayerEngagement(e));
    const own = [], foe = [], seen = new Set();
    let ownOwner = null, foeOwner = null;
    for (const e of encs) {
      const pk = sideKeyOfPlayer(e) ?? 'sideA';
      const ok = otherKey(pk);
      if (ownOwner == null) ownOwner = e[pk]?.ownerEmpireId ?? null;
      if (foeOwner == null) foeOwner = e[ok]?.ownerEmpireId ?? null;
      for (const id of idsOf(e[pk])) if (!seen.has(id)) { seen.add(id); own.push({ id, enc: e }); }
      for (const id of idsOf(e[ok])) if (!seen.has(id)) { seen.add(id); foe.push({ id, enc: e }); }
    }
    const common = { inPlayerEngagement, quality, nameOf, classOf, presented };
    // Własna strona (gracz) zawsze widoczna; w bitwie bez gracza (dziś DSCS jej nie zakłada) obie strony przez bramkę wywiadu.
    const ownSide = sideStats(own, { ...common, isEnemy: !playerIn });
    const foeSide = sideStats(foe, { ...common, isEnemy: true });
    const label = (owner, s) => (labelFor ? labelFor(owner, s.total + s.hidden) : String(owner ?? ''));
    const point = primary.location?.point ?? null;
    rows.push({
      id: String(primary.id),
      encounterIds: encs.map((e) => String(e.id)),
      systemId: primary.location?.systemId ?? null,
      point: point && Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : null,
      inView: isEngagementInView({ encounterSystemId: primary.location?.systemId, activeSystemId }),
      player: playerIn,
      round: Math.max(0, ...encs.map((e) => Number(e.currentRound) || 0)),
      own: { ...ownSide, owner: ownOwner, label: label(ownOwner, ownSide), role: playerIn ? 'primary' : 'foreign' },
      enemy: { ...foeSide, owner: foeOwner, label: label(foeOwner, foeSide), role: 'alert' },
      encounters: encs,
    });
  }
  return rows.sort((a, b) => (a.inView === b.inView ? byIdAsc(a.id, b.id) : a.inView ? -1 : 1));
}

/**
 * Ładunek „Obserwuj” bitwy paska — DZISIEJSZY kształt `camera:watchBattle` (karta walki: id starcia wiersza, jego układ,
 * punkt). Wiersz karty pod `cvStage` to klaster z id i miejscem starcia o NAJMNIEJSZYM id (`mergeEncounterView`) — tu to samo.
 * @returns {{encounterId:string, systemId:string|null, x:number, y:number}|null} null — brak punktu (karta nie rysowała przycisku)
 */
export function stripWatchPayload(row) {
  if (!row?.point) return null;
  return { encounterId: row.id ?? null, systemId: row.systemId ?? null, x: row.point.x, y: row.point.y };
}

/**
 * Ostatnie zdarzenia logu rund bitwy (najnowsze najpierw) — oś rund scalona jak w karcie (`mergeEncounterView`). Nazwy
 * okrętów ukrytych mgłą — „?”.
 * @param {object} row — z `stripBattles`
 * @param {{ n?:number, nameOf?:(id:string)=>string, weaponOf?:(moduleId:string)=>string, roundLabel?:(r:number)=>string,
 *           miss?:string, shield?:string, shown?:(encounterId:string, round:number, index:number)=>boolean }} o
 *   shown — ARC CV-4a: zdarzenie już pokazane (rejestr salw, flaga `cvWeapons`); brak — każde
 * @returns {Array<{ text:string, side:'own'|'enemy' }>}
 */
export function stripLog(row, { n = COMBAT_STRIP.DETAIL_LOG_LINES, nameOf = (id) => id, weaponOf = (m) => m,
  roundLabel = (r) => `R${r}`, miss = 'miss', shield = 'shield', shown = null } = {}) {
  if (!row?.encounters?.length || !(n > 0)) return [];
  const merged = row.encounters.length === 1 ? row.encounters[0] : mergeEncounterView(row.encounters);
  // ARC CV-4a (flaga `cvWeapons`, Finding 614) — linia zdarzenia dopiero po jego TRAFIENIU w prezentacji (rejestr salw); obiekt rundy
  // → starcie (widok scalony trzyma te same obiekty rund), indeks zdarzenia = indeks w `round.events` = indeks w ładunku FX.
  const encOfRound = typeof shown === 'function' ? new Map() : null;
  if (encOfRound) for (const e of row.encounters) for (const r of e?.timeline ?? []) encOfRound.set(r, e.id);
  const ownIds = new Set(row.own.ships.map((s) => s.id));
  const vis = new Map([...row.own.ships, ...row.enemy.ships].map((s) => [s.id, s.visible]));
  const nm = (id) => (vis.get(id) === false ? '?' : (nameOf(id) ?? String(id)));
  const out = [];
  const tl = merged?.timeline ?? [];
  for (let i = tl.length - 1; i >= 0 && out.length < n; i--) {
    const r = tl[i];
    const evs = r?.events ?? [];
    for (let j = evs.length - 1; j >= 0 && out.length < n; j--) {
      const ev = evs[j];
      if (encOfRound && !shown(encOfRound.get(r), r.round, j)) continue;
      const dmg = Math.round(Number(ev.damage) || 0), blk = Math.round(Number(ev.blockedByShield) || 0);
      const info = !ev.hit ? miss
        : (blk > 0 && dmg === 0) ? `${shield} ${blk}`
        : blk > 0 ? `−${dmg} · ${shield} ${blk}`
        : `−${dmg}`;
      out.push({ text: `${roundLabel(r.round ?? 0)} ${nm(ev.attacker)} → ${nm(ev.target)} (${weaponOf(ev.weapon)}) ${info}`,
        side: ownIds.has(ev.attacker) ? 'own' : 'enemy' });
    }
  }
  return out;
}

/**
 * Wysokość treści rozwinięcia (px): nagłówki stron, wiersze okrętów (dłuższa strona), odstęp, nagłówek logu i jego linie.
 * @param {{ ownN:number, enemyN:number, logN:number }} p
 */
export function stripDetailHeight({ ownN = 0, enemyN = 0, logN = 0 } = {}, S = COMBAT_STRIP) {
  const rows = Math.max(1, ownN, enemyN);
  return 2 * S.PAD_Y + S.DETAIL_ROW_H + rows * S.DETAIL_ROW_H + S.SECTION_GAP + S.DETAIL_ROW_H + Math.max(1, logN) * S.DETAIL_ROW_H;
}

/**
 * Układ paska w obszarze mapy (px logiczne).
 *   • obszar = ekran bez wcięć `MapInsets` (kolumny outlinerów, górna belka, pasek nawigacji + pas dolny / Dok) i bez
 *     marginesów `SIDE_MARGIN` / `GAP`; szerokość paska = treść w klamrze [MIN_W, MAX_W] ∩ szerokość obszaru; środek
 *     poziomy = środek obszaru;
 *   • `EDGE` 'top' — blok linii pod górną krawędzią obszaru (a pod banerem pickera, gdy ten wisi nad paskiem), rozwinięcie
 *     POD blokiem; 'bottom' — blok nad dolną krawędzią, rozwinięcie NAD blokiem; rozwinięcie najwyżej do krawędzi obszaru
 *     i `DETAIL_MAX_FRAC` wysokości ekranu — reszta przewija się;
 *   • pole `rect` = blok ∪ rozwinięcie, z krawędzią — dla kadru „Obserwuj” i przeszkód paneli.
 * @param {{ W:number, H:number, insets:{left:number,right:number,top:number,bottom:number}, lines:number, overflow?:boolean,
 *           naturalW:number, detailH?:number, banner?:{x:number,y:number,w:number,h:number}|null, edge?:string }} p
 */
export function stripLayout({ W, H, insets, lines, overflow = false, naturalW = 0, detailH = 0, banner = null, edge = null }, S = COMBAT_STRIP) {
  const ins = { left: Math.max(0, insets?.left ?? 0), right: Math.max(0, insets?.right ?? 0), top: Math.max(0, insets?.top ?? 0), bottom: Math.max(0, insets?.bottom ?? 0) };
  const ax0 = ins.left + S.SIDE_MARGIN, ax1 = W - ins.right - S.SIDE_MARGIN;
  const ay0 = ins.top + S.GAP, ay1 = H - ins.bottom - S.GAP;
  const areaW = Math.max(0, ax1 - ax0);
  const lo = Math.min(S.MIN_W, areaW), hi = Math.min(S.MAX_W, areaW);
  // W górę: zaokrąglenie w dół ucinałoby ułamek piksela treści (miejsce przycięte wielokropkiem mimo zapasu).
  const w = Math.max(lo, Math.min(hi, Math.ceil(Number(naturalW) || 0)));
  const x = Math.round(Math.max(ax0, Math.min(ax1 - w, (ax0 + ax1) / 2 - w / 2)));
  const n = Math.max(0, Math.floor(lines) || 0);
  const blockH = n > 0 ? 2 * S.PAD_Y + n * S.LINE_H + (n - 1) * S.LINE_GAP + (overflow ? S.MORE_H : 0) : 0;
  const ed = (edge ?? S.EDGE) === 'bottom' ? 'bottom' : 'top';
  let y;
  if (ed === 'top') {
    y = ay0;
    const b = banner;
    if (b && Number.isFinite(b.y) && Number.isFinite(b.h) && b.x < x + w && b.x + b.w > x && b.y + b.h > y - S.BANNER_GAP) {
      y = Math.max(y, b.y + b.h + S.BANNER_GAP);
    }
    y = Math.min(y, Math.max(ay0, ay1 - blockH));   // blok zawsze w obszarze
  } else {
    y = Math.max(ay0, ay1 - blockH);
  }
  y = Math.round(y);
  const lineRects = [];
  for (let i = 0; i < n; i++) lineRects.push({ x, y: y + S.PAD_Y + i * (S.LINE_H + S.LINE_GAP), w, h: S.LINE_H });
  const more = overflow && n > 0 ? { x, y: y + S.PAD_Y + n * S.LINE_H + (n - 1) * S.LINE_GAP, w, h: S.MORE_H } : null;
  const block = { x, y, w, h: blockH };
  let detail = null;
  if (n > 0 && detailH > 0) {
    const cap = Math.floor(H * S.DETAIL_MAX_FRAC);
    if (ed === 'top') {
      const dy = y + blockH + S.DETAIL_GAP;
      const viewH = Math.max(0, Math.min(detailH, ay1 - dy, cap));
      if (viewH > 0) detail = { x, y: dy, w, h: viewH, contentH: detailH, maxScroll: Math.max(0, detailH - viewH) };
    } else {
      const viewH = Math.max(0, Math.min(detailH, y - S.DETAIL_GAP - ay0, cap));
      if (viewH > 0) detail = { x, y: y - S.DETAIL_GAP - viewH, w, h: viewH, contentH: detailH, maxScroll: Math.max(0, detailH - viewH) };
    }
  }
  const top = Math.min(block.y, detail?.y ?? block.y);
  const bot = Math.max(block.y + block.h, detail ? detail.y + detail.h : block.y + block.h);
  const rect = n > 0 ? { x, y: top, w, h: bot - top, edge: ed } : null;
  return { edge: ed, area: { x0: ax0, x1: ax1, y0: ay0, y1: ay1 }, block, lines: lineRects, more, detail, rect };
}

/** Strefa kliku pod punktem (ostatnia narysowana wygrywa — chipy przed tłem: tło dopisywane na końcu jako 'body'). */
export function stripHitAt(zones, x, y) {
  for (const z of zones ?? []) if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return z;
  return null;
}
