// HudCombatLogic — ARC COMBAT VISUALS, krok CV-6a (COMBAT_VISUALS_PLAN.md §2.6, D-CV-20, D-CV-22; Findingi 633, 653 (a),
// 666, 674): czysta logika WARSTWY TAKTYCZNEJ bitwy — podwarstwy HUD 2D `HudCombatLayer` (flaga `cvTactical`, wymaga `cvStage`).
//   • ZOOM SEMANTYCZNY w jednym ruchu: krycie ikon = 1 − smoothstep(8, 24, px_L) — to samo `px_L` (długość fregaty na ekranie
//     w głębi środka RYSOWANEJ bitwy, `ThreeRenderer._tickBattleStage`), które steruje sceną; kino (px_L ≥ 24) — bez ikon i bez
//     mikropasków; daleko — gdy rysowana bitwa jest za mała na ikony, JEDEN znak bitwy („⚔ 10 : 9”, dwa paski siły, runda) z histerezą;
//   • MGŁA WOJNY = `isEndpointVisibleInCombat` (pasek walki, smugi, znacznik statku): widoczny — pełna ikona (klasa, HP); wróg
//     `rumor` poza starciem z graczem — ikona „nieznany” bez klasy i HP (w położeniu, które gracz zna — duch `rumor`); reszta — nic;
//     linie ognia tylko między dwoma widocznymi końcami, liczby znaku — tylko z widocznych (ukryty — „?” jak w pasku);
//   • ANTI-OVERLAP: odpychanie w granicy przesunięcia, a gdy nie wystarcza — mikrostos (najpierw tej samej strony); po układzie
//     żadne dwie ikony nie leżą bliżej niż `TAC_ICON_MIN_SEP` px (gwarancja z konstrukcji — scalanie kończy się na jednym węźle);
//   • LINIE OGNIA w czasach REJESTRU SALW (CV-4a): strzał widoczny od `fireAt` przez `TAC_FIRE_MS` (zegar prezentacji — pauza
//     zatrzymuje), pudło — linia za cel, nigdy od okrętu po jego pokazanym zniszczeniu; budżet na klatkę;
//   • MIKROPASKI = HP / osłona POKAZYWANE z rejestru (spadają w chwili trafienia), martwy — bez pasków;
//   • PASMA ZASIĘGU zaznaczonego / najechanego statku przez prawo sceny (decyzja 20 — scena zawsze, stopień 1): promień =
//     lerp(zasięg w skali prawdziwej, odstęp pary na scenie G(d), stopień) — to samo prawo, które kładzie pary na scenie;
//   • role kolorów (D-CV-22): własny `primary`, wróg `alert`, obcy `foreign`, pasma / ramka `dim` — kolory z motywu (`HudPalette`).
// Czysty: bez three, bez DOM, bez `window`, zero kolorów na sztywno, zero `Math.random`. Wykonuje się pod node (keeper
// `cv_tactical_logic_smoke`).
import { smoothstep } from '../renderer/combat/SemanticZoomLogic.js';
import { stageGap } from '../renderer/combat/BattleStageLogic.js';
import { isEndpointVisibleInCombat } from '../utils/VesselFxLogic.js';
import { stripWatchPayload } from './CombatStripLogic.js';   // decyzja 46 (2) — klik w znak bitwy = „Obserwuj” paska walki

// Pokrętła (alias w `KOSMOS.threeRenderer.cvTuning` — `FxEngine.LIVE_CV_FX` rozkłada ten obiekt; strojenie, bez pinów).
export const TAC_TUNING = Object.freeze({
  TAC_ICON_PX_LO: 8,          // [px CSS] px_L fregaty, od którego ikony zaczynają gasnąć (przekazanie do kina)
  TAC_ICON_PX_HI: 24,         // [px CSS] px_L, przy którym ikony znikają (kino — to samo PX_HI co pełna scena)
  TAC_GLYPH_ENTER_PX: 36,     // [px log.] rozpiętość rysowanej bitwy, poniżej której ikony zastępuje znak bitwy
  TAC_GLYPH_EXIT_PX: 52,      // [px log.] rozpiętość, powyżej której znak wraca do ikon (histereza)
  TAC_ICON_SCALE: 1,          // mnożnik rozmiaru sylwetek
  TAC_ICON_MIN_SEP: 12,       // [px log.] najmniejszy odstęp środków ikon po układzie (anti-overlap)
  TAC_NUDGE_MAX: 7,           // [px log.] najdalsze przesunięcie ikony z jej miejsca przed scaleniem w mikrostos
  TAC_FIRE_MS: 420,           // [ms prezentacji] czas życia linii ognia od chwili strzału z rejestru
  TAC_FIRE_MAX: 28,           // budżet linii ognia na klatkę (najmłodsze)
  TAC_FIRE_ALPHA: 0.85,       // krycie linii ognia w chwili strzału (gaśnie liniowo)
  TAC_FIRE_MISS_PX: 14,       // [px log.] pudło — linia za cel o tyle
  TAC_BAR_MIN_PXL: 4,         // [px CSS] px_L, od którego pod ikonami są mikropaski (miejsce)
  TAC_BAR_W: 14, TAC_BAR_H: 2,  // [px log.] mikropasek HP (osłona — 1 px pod nim)
  TAC_VEL_S: 0.8,             // [s prezentacji] wektor prędkości = droga rysowana w tym czasie
  TAC_VEL_MAX_PX: 16,         // [px log.] najdłuższy wektor prędkości
  TAC_FRAME_PAD: 12,          // [px log.] margines ramki starcia wokół ikon
  TAC_FRAME_ARM: 9,           // [px log.] ramię narożnika ramki
  TAC_FRAME_ALPHA: 0.5,
  TAC_BAND_ALPHA: 0.55,       // krycie pasm zasięgu (rola `dim`)
  TAC_BAND_SEGMENTS: 56,      // odcinki okręgu pasma (rzut)
  TAC_WRECK_ALPHA: 0.42,      // krycie ikony wraku (przekreślona, przygaszona)
  TAC_ICON_ALPHA: 0.92,       // krycie ikony żywej (× przekazanie zoomu)
  TAC_HIT_PX: 8,              // [px log.] promień kliku / najechania ikony
  TAC_GLYPH_BAR_W: 22,        // [px log.] pasek siły w znaku bitwy
  TAC_ARROW_MARGIN: 14,       // [px log.] strzałka bitwy poza kadrem — odstęp od krawędzi obszaru mapy (decyzja 46 (3))
  TAC_NAME_GAP: 3,            // [px log.] nazwa CTRL — odstęp od ikony (decyzja 46 (1))
  TAC_NAME_LEAD: 16,          // [px log.] nazwa CTRL — drugi pierścień miejsc (z nitką do ikony), gdy obok ikony nie ma miejsca
});

export const TAC = { ...TAC_TUNING };

/**
 * Czy warstwa taktyczna działa (flaga `cvTactical` i scena `cvStage` — scena podaje klastry starć i `px_L`). JEDNO źródło dla
 * podwarstwy, etykiet i znaczników uczestników (HUD) i pasków HP 3D (renderer): przy OFF wszystko jak dziś.
 */
export function tacActive(features) {
  return !!(features?.cvTactical && features?.cvStage);
}

/** Bieżące pokrętła: alias `cvTuning` (gdy jest) nad domyślnymi; brak / zła wartość — domyślna. */
export function tacTuning(live = null) {
  if (!live) return TAC;
  const out = {};
  for (const k of Object.keys(TAC_TUNING)) {
    const v = live[k];
    out[k] = Number.isFinite(v) ? v : TAC_TUNING[k];
  }
  return out;
}

// ── Zoom semantyczny ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Krycie ikon z długości fregaty na ekranie [px CSS] — 1 − smoothstep(LO, HI, px_L): pełne daleko, zero w kinie. Monotonicznie
 * nierosnące w px_L. Brak miary (bitwa bez sceny — np. przy ciele bez rysunku) — pełne (dalekie) krycie.
 */
export function tacIconAlpha(pxL, T = TAC) {
  if (!Number.isFinite(pxL) || pxL <= 0) return 1;
  return 1 - smoothstep(T.TAC_ICON_PX_LO, T.TAC_ICON_PX_HI, pxL);
}

/**
 * Tryb znaku bitwy z histerezą: wchodzi poniżej ENTER, wychodzi powyżej EXIT (ENTER < EXIT) — rozpiętość tuż przy progu nie
 * miga między znakiem a ikonami. Rozpiętość nieznana — bez zmiany.
 * @param {boolean} prev — tryb z poprzedniej klatki (pierwsza klatka: false)
 * @param {number} extentPx — rozpiętość rysowanej bitwy [px log.] (większy bok prostokąta ikon)
 */
export function tacGlyphMode(prev, extentPx, T = TAC) {
  if (!Number.isFinite(extentPx)) return !!prev;
  const enter = Math.min(T.TAC_GLYPH_ENTER_PX, T.TAC_GLYPH_EXIT_PX), exit = Math.max(T.TAC_GLYPH_ENTER_PX, T.TAC_GLYPH_EXIT_PX);
  if (prev) return !(extentPx > exit);
  return extentPx < enter;
}

// ── Mgła wojny (bramka = pasek walki, smugi, znacznik statku) ───────────────────────────────────────────────────────────

/**
 * Widoczność uczestnika w warstwie taktycznej: `'full'` — `isEndpointVisibleInCombat` (własny; wróg w starciu z graczem albo
 * wywiad ≥ contact): ikona z klasą, HP, linie ognia; `'unknown'` — wróg z wywiadem `rumor` poza starciem z graczem: ikona
 * „nieznany” bez klasy i HP; `'hidden'` — nic.
 */
export function tacVisibility({ isEnemy = false, quality = null, inPlayerEngagement = false } = {}) {
  if (isEndpointVisibleInCombat({ isEnemy: isEnemy === true, quality, inPlayerEngagement: inPlayerEngagement === true })) return 'full';
  if (isEnemy === true && quality === 'rumor') return 'unknown';
  return 'hidden';
}

/** Klasa sylwetki: okręty — klasa kadłuba; reszta — cywilny; niewidoczny w pełni — nieznany (bez klasy). */
export function tacIconClass(sizeClass, visibility) {
  if (visibility !== 'full') return 'unknown';
  if (sizeClass === 'frigate' || sizeClass === 'destroyer' || sizeClass === 'battleship') return sizeClass;
  return 'civilian';
}

/**
 * Rola koloru (D-CV-22): strona gracza — `primary`; przeciwnik w bitwie z graczem — `alert`; strona bitwy BEZ gracza — wg relacji
 * z graczem (`hostile`: wojna albo pasmo opinii „wrogie” — `alert`, inaczej `foreign`, jak znacznik statku SM-1).
 * @param {{ playerSide:boolean, playerBattle:boolean, hostile?:boolean }} p
 */
export function tacRole({ playerSide = false, playerBattle = true, hostile = false } = {}) {
  if (playerSide) return 'primary';
  if (playerBattle) return 'alert';
  return hostile === true ? 'alert' : 'foreign';
}

// ── Anti-overlap ────────────────────────────────────────────────────────────────────────────────────────────────────

// [px] luz odstępu: odpychanie rozsuwa o tyle więcej niż brak, naruszenie liczy się od minSep − luz (zbieżność iteracji
// bez scalania par, które stoją w odstępie co do ułamka piksela).
const SEP_SLACK = 0.02;
const byIdStr = (a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);

/**
 * Układ ikon bez stosu: odpychanie par bliżej niż `TAC_ICON_MIN_SEP` (każda ikona najdalej `TAC_NUDGE_MAX` od swojego miejsca),
 * a pary, których odpychanie nie rozdzieli, scalane w MIKROSTOS (najpierw ta sama rola, w ostateczności stos mieszany) — po
 * czym układ od nowa. Każde scalenie zmniejsza liczbę węzłów, więc pętla kończy się najpóźniej na jednym węźle: po układzie
 * żadne dwa węzły nie są bliżej niż `minSep` (gwarancja). Deterministyczne (kolejność id).
 * @param {Array<{id:string, x:number, y:number, role:string}>} items — px logiczne
 * @returns {Array<{ids:string[], role:string|null, roles:object, x:number, y:number, ox:number, oy:number, stack:boolean}>}
 */
export function tacLayoutIcons(items, T = TAC) {
  const minSep = Math.max(0, T.TAC_ICON_MIN_SEP), maxNudge = Math.max(0, T.TAC_NUDGE_MAX);
  let nodes = (items ?? []).filter((it) => it && Number.isFinite(it.x) && Number.isFinite(it.y)).slice().sort(byIdStr)
    .map((it) => ({ ids: [String(it.id)], role: it.role ?? null, roles: { [it.role ?? '-']: 1 }, ox: it.x, oy: it.y, x: it.x, y: it.y }));
  if (nodes.length < 2 || !(minSep > 0)) return nodes.map(finishNode);
  // Granica pętli liczona RAZ (liczba węzłów maleje przy scaleniu): ≤ n − 1 scaleń + ostatni układ i sprawdzenie.
  const maxRounds = nodes.length + 2;
  for (let guard = 0; guard < maxRounds; guard++) {
    relax(nodes, minSep, maxNudge);
    const v = worstPair(nodes, minSep);
    if (!v) break;
    const [i, j] = v;
    const a = nodes[i], b = nodes[j];
    const n = a.ids.length + b.ids.length;
    const merged = {
      ids: [...a.ids, ...b.ids].sort(),
      role: a.role === b.role ? a.role : null,
      roles: mergeCounts(a.roles, b.roles),
      ox: (a.ox * a.ids.length + b.ox * b.ids.length) / n, oy: (a.oy * a.ids.length + b.oy * b.ids.length) / n,
    };
    merged.x = merged.ox; merged.y = merged.oy;
    nodes = nodes.filter((_, k) => k !== i && k !== j);
    nodes.push(merged);
    nodes.sort((p, q) => (p.ids[0] < q.ids[0] ? -1 : p.ids[0] > q.ids[0] ? 1 : 0));
  }
  return nodes.map(finishNode);
}

function finishNode(nd) {
  return { ...nd, stack: nd.ids.length > 1 };
}

function mergeCounts(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
}

// Odpychanie (iteracje): para bliżej niż minSep rozsuwa się po połowie braku; kierunek — wektor między środkami, przy
// pokryciu — kąt z indeksów (deterministyczny); przesunięcie od miejsca obcinane do maxNudge (stos — tak samo).
function relax(nodes, minSep, maxNudge) {
  for (let it = 0; it < 24; it++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= minSep) continue;
        if (d < 1e-6) { const ang = ((i * 7 + j * 13) % 16) * (Math.PI / 8); dx = Math.cos(ang); dy = Math.sin(ang); d = 1; }
        else { dx /= d; dy /= d; }
        const push = (minSep - Math.min(d, minSep)) / 2 + SEP_SLACK;
        moveClamped(a, -dx * push, -dy * push, maxNudge);
        moveClamped(b, dx * push, dy * push, maxNudge);
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function moveClamped(nd, dx, dy, maxNudge) {
  let x = nd.x + dx, y = nd.y + dy;
  const ox = x - nd.ox, oy = y - nd.oy, r = Math.hypot(ox, oy);
  if (r > maxNudge) { const k = maxNudge / r; x = nd.ox + ox * k; y = nd.oy + oy * k; }
  nd.x = x; nd.y = y;
}

// Para do scalenia, gdy odstęp jest gdzieś naruszony: najpierw naruszająca para TEJ SAMEJ roli (najbliższa); gdy żadna para tej
// samej roli nie narusza (np. stos jednej strony blokuje pojedyncze ikony drugiej) — najbliższa para tej samej roli w promieniu
// 2 × odstęp (scalenie zwalnia miejsce bez mieszania stron); w ostateczności najbliższa naruszająca para (stos mieszany). Brak
// naruszeń — null.
function worstPair(nodes, minSep) {
  let any = null, anyD = Infinity, same = null, sameD = Infinity, near = null, nearD = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[j].x - nodes[i].x, nodes[j].y - nodes[i].y);
      const sr = nodes[i].role != null && nodes[i].role === nodes[j].role;
      if (d < minSep - SEP_SLACK) {
        if (d < anyD) { anyD = d; any = [i, j]; }
        if (sr && d < sameD) { sameD = d; same = [i, j]; }
      }
      if (sr && d < 2 * minSep && d < nearD) { nearD = d; near = [i, j]; }
    }
  }
  if (!any) return null;
  return same ?? near ?? any;
}

/** Najmniejszy odstęp środków węzłów [px] (Infinity przy < 2 węzłach) — odczyt i keeper. */
export function tacMinSeparation(nodes) {
  let m = Infinity;
  for (let i = 0; i < (nodes?.length ?? 0); i++) for (let j = i + 1; j < nodes.length; j++) {
    m = Math.min(m, Math.hypot(nodes[j].x - nodes[i].x, nodes[j].y - nodes[i].y));
  }
  return m;
}

// ── Linie ognia (rejestr salw CV-4a) ────────────────────────────────────────────────────────────────────────────────

/**
 * Linie ognia widoczne w chwili `nowMs` (zegar prezentacji): wpisy rejestru z `fireAt ≤ now < fireAt + TAC_FIRE_MS`, których
 * strzelec nie został pokazany jako zniszczony PRZED strzałem (`killAt(attacker) ≤ fireAt` — pomijany), oba końce widoczne
 * (`visible(id)`); najmłodsze najpierw, najwyżej `TAC_FIRE_MAX`. `age` ∈ [0, 1) — część czasu życia.
 * @param {object[]} entries — wpisy rund rejestru (`CombatLedger.roundsOf(…).entries`)
 * @param {number} nowMs
 * @param {{ killAt?:(id:string)=>number|null, visible?:(id:string)=>boolean }} env
 * @returns {Array<{key:string, attacker:string, target:string, hit:boolean, kind:string, fireAt:number, age:number}>}
 */
export function tacFireLines(entries, nowMs, { killAt = () => null, visible = () => true } = {}, T = TAC) {
  const life = Math.max(1, T.TAC_FIRE_MS);
  const now = Number(nowMs);
  if (!Number.isFinite(now)) return [];
  const out = [];
  for (const x of entries ?? []) {
    if (!x || !Number.isFinite(x.fireAt)) continue;
    const dt = now - x.fireAt;
    if (dt < 0 || dt >= life) continue;
    const k = killAt(x.attacker);
    if (Number.isFinite(k) && k <= x.fireAt) continue;
    if (!visible(x.attacker) || !visible(x.target)) continue;
    out.push({ key: `${x.encounterId}:${x.round}:${x.index}`, attacker: String(x.attacker), target: String(x.target), hit: x.hit === true,
      kind: x.kind ?? 'kinetic', fireAt: x.fireAt, age: dt / life });
  }
  out.sort((a, b) => b.fireAt - a.fireAt || (a.key < b.key ? -1 : 1));
  return out.slice(0, Math.max(0, Math.floor(T.TAC_FIRE_MAX)));
}

/** Styl linii ognia wg rodzaju broni (kolor zostaje rolą strzelca): laser — ciągła cienka, kinetyk — krótkie kreski, rakieta — kropki. */
export function tacFireStyle(kind) {
  if (kind === 'laser') return { dash: [], width: 1 };
  if (kind === 'missile') return { dash: [1, 3], width: 1.6 };
  return { dash: [4, 3], width: 1.2 };
}

/** Koniec linii pudła: przedłużenie za cel o `missPx` (w kierunku strzelec → cel). */
export function tacMissEnd(a, t, missPx) {
  const dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy);
  if (!(d > 1e-6)) return { x: t.x + missPx, y: t.y };
  return { x: t.x + (dx / d) * missPx, y: t.y + (dy / d) * missPx };
}

// ── Mikropaski i znak bitwy ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Mikropasek: części HP i osłony z wartości POKAZYWANYCH (rejestr; brak — stan logiczny); martwy (HP 0 albo pokazane
 * zniszczenie) — null (bez pasków). Osłona — null, gdy statek jej nie ma.
 * @param {{hp:number, hpStart:number, shieldHP:number, shieldHPStart:number}|null} st — stan starcia (DSCS)
 * @param {{hp:number, shield:number, killed?:boolean}|null} presented — `ThreeRenderer.cvPresentedState`
 */
export function tacMicroBars(st, presented = null) {
  if (!st) return null;
  const h0 = Math.max(0, Number(st.hpStart) || 0), s0 = Math.max(0, Number(st.shieldHPStart) || 0);
  const hp = Math.max(0, Number(presented ? presented.hp : st.hp) || 0);
  const sh = Math.max(0, Number(presented ? presented.shield : st.shieldHP) || 0);
  if (presented?.killed === true || !(hp > 0) || !(h0 > 0)) return null;
  return { hp: Math.min(1, hp / h0), shield: s0 > 0 ? Math.min(1, sh / s0) : null };
}

/**
 * Treść znaku bitwy z uczestników: żywi / wszyscy i część HP WIDOCZNYCH na stronę (ukryci — `hidden`, liczba „?” jak w pasku).
 * @param {Array<{side:'own'|'enemy', visibility:string, alive:boolean, hp:number, hpStart:number}>} members
 */
export function tacGlyphCounts(members) {
  const side = () => ({ alive: 0, total: 0, hidden: 0, hp: 0, hpStart: 0, pct: 0 });
  const s = { own: side(), enemy: side() };
  for (const m of members ?? []) {
    const t = m.side === 'own' ? s.own : s.enemy;
    if (m.visibility !== 'full') { t.hidden++; continue; }
    t.total++;
    if (m.alive) t.alive++;
    t.hp += Math.max(0, Number(m.hp) || 0); t.hpStart += Math.max(0, Number(m.hpStart) || 0);
  }
  for (const t of [s.own, s.enemy]) t.pct = t.hpStart > 0 ? Math.max(0, Math.min(1, t.hp / t.hpStart)) : 0;
  return s;
}

// ── Pasma zasięgu ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Promień pasma zasięgu na scenie [j.]: zasięg w skali prawdziwej d = rangeAU × auToWU, na scenie — odstęp pary G(d) prawa
 * sceny (z rozsunięciem — `law` klastra), przy skali awaryjnej — d × scale; rysowany = lerp(d, scena, stopień). Monotoniczny
 * w zasięgu (G monotoniczne). Zły zasięg — 0.
 * @param {number} rangeAU
 * @param {{ auToWU:number, blend?:number, law?:{ALPHA:number,K:number}|null, fallbackScale?:number|null }} p
 */
export function tacBandRadiusWU(rangeAU, { auToWU, blend = 1, law = null, fallbackScale = null } = {}) {
  if (!(rangeAU > 0) || !(auToWU > 0)) return 0;
  const d = rangeAU * auToWU;
  const staged = Number.isFinite(fallbackScale) && fallbackScale > 0 ? d * fallbackScale : (law ? stageGap(d, law) : d);
  const b = Number.isFinite(blend) ? Math.max(0, Math.min(1, blend)) : 1;
  return d + (staged - d) * b;
}

/** Unikalne zasięgi broni (AU, rosnąco) — pasma pokazują każdy raz. */
export function tacUniqueRanges(ranges) {
  const out = [];
  for (const r of [...(ranges ?? [])].filter((v) => v > 0).sort((a, b) => a - b)) {
    if (!out.length || Math.abs(r - out[out.length - 1]) > 1e-9) out.push(r);
  }
  return out;
}

// ── Klik i najechanie ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Strefa ikony pod punktem (px logiczne): najbliższy środek w promieniu `r` (remis — pierwszy na liście, czyli niższy węzeł);
 * strefy niosą WŁASNE id statków (położenie RYSOWANE — scena i choreografia), więc klik trafia statek, który gracz widzi, a nie
 * ten, którego położenie logiczne leży pod kursorem.
 * @param {Array<{x:number, y:number, ids:string[]}>} zones
 */
export function tacHitAt(zones, x, y, r) {
  let best = null, bestD = Infinity;
  for (const z of zones ?? []) {
    const d = Math.hypot(z.x - x, z.y - y);
    if (d <= r && d < bestD) { bestD = d; best = z; }
  }
  return best;
}

// ── Sylwetki (geometria glifu; px logiczne, nos w +x przed obrotem) ──────────────────────────────────────────────────

const SHAPES = Object.freeze({
  frigate:    [[4.4, 0], [-3, -2.8], [-1.5, 0], [-3, 2.8]],
  destroyer:  [[5.6, 0], [1.3, -2.2], [-3.8, -2.2], [-5.2, -3.6], [-4.3, 0], [-5.2, 3.6], [-3.8, 2.2], [1.3, 2.2]],
  battleship: [[6.8, 0], [3.8, -2.9], [-5.1, -2.9], [-6.8, -1.4], [-6.8, 1.4], [-5.1, 2.9], [3.8, 2.9]],
  civilian:   [[4, 0], [2.2, -2.1], [-3.4, -2.1], [-3.4, 2.1], [2.2, 2.1]],
  unknown:    [[0, -3.8], [3.8, 0], [0, 3.8], [-3.8, 0]],
});

/**
 * Wielokąt sylwetki w px logicznych: klasa, środek, kąt nosa na ekranie (rad; null — bez obrotu), skala.
 * @returns {{pts:number[], nose:{x:number,y:number}|null, r:number}}
 */
export function tacIconShape(cls, cx, cy, angle, scale = 1) {
  const base = SHAPES[cls] ?? SHAPES.unknown;
  const turn = cls !== 'unknown' && Number.isFinite(angle);
  const c = turn ? Math.cos(angle) : 1, s = turn ? Math.sin(angle) : 0;
  const pts = [];
  let r = 0;
  for (const [px, py] of base) {
    const x = px * scale, y = py * scale;
    pts.push(cx + x * c - y * s, cy + x * s + y * c);
    r = Math.max(r, Math.hypot(x, y));
  }
  const nose = turn ? { x: cx + base[0][0] * scale * c, y: cy + base[0][0] * scale * s } : null;
  return { pts, nose, r };
}

// ── Decyzja właściciela 46 (2026-11-13) ─────────────────────────────────────────────────────────────────────────────────

/**
 * (2) Klik w znak bitwy = „Obserwuj” tej bitwy — DOKŁADNIE ładunek paska walki (`stripWatchPayload`): starcie klastra o NAJMNIEJSZYM
 * id (kolejność jak `stripBattles`), jego układ i punkt. Brak punktu — null (pasek też nie rysuje wtedy przycisku).
 * @param {object[]} encs — starcia klastra
 */
export function tacWatchPayload(encs) {
  const list = (encs ?? []).filter((e) => e && e.id != null);
  if (!list.length) return null;
  const primary = [...list].sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0))[0];
  const pt = primary.location?.point ?? null;
  return stripWatchPayload({ id: String(primary.id), systemId: primary.location?.systemId ?? null,
    point: pt && Number.isFinite(pt.x) && Number.isFinite(pt.y) ? { x: pt.x, y: pt.y } : null });
}

/**
 * (3) Bitwa poza kadrem — JEDNA strzałka krawędzi na bitwę (zamiast strzałek statków): gdy ŻADEN rzut uczestnika nie leży w obszarze
 * mapy, strzałka siedzi na krawędzi obszaru (oś większego przekroczenia — ta sama reguła co strzałki etykiet `edgeIndicators`) w
 * kierunku środka rzutów. Uczestnik w kadrze albo brak rzutów (bitwa za kamerą — jak strzałki etykiet) — null.
 * @param {Array<{x:number,y:number}>} pts — rzuty uczestników (px logiczne; null — za kamerą)
 * @param {{x0:number,y0:number,x1:number,y1:number}} r — obszar mapy
 */
export function tacBattleArrow(pts, r, margin = TAC.TAC_ARROW_MARGIN) {
  const ps = (pts ?? []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!ps.length || !r) return null;
  if (ps.some((p) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1)) return null;
  let cx = 0, cy = 0;
  for (const p of ps) { cx += p.x; cy += p.y; }
  cx /= ps.length; cy /= ps.length;
  const dx = cx < r.x0 ? r.x0 - cx : (cx > r.x1 ? cx - r.x1 : 0);
  const dy = cy < r.y0 ? r.y0 - cy : (cy > r.y1 ? cy - r.y1 : 0);
  const edge = (dx >= dy) ? (cx < r.x0 ? 'left' : 'right') : (cy < r.y0 ? 'top' : 'bottom');
  const m = Math.max(0, margin);
  const x = edge === 'left' ? r.x0 + m : edge === 'right' ? r.x1 - m : Math.min(Math.max(cx, r.x0 + m), r.x1 - m);
  const y = edge === 'top' ? r.y0 + m : edge === 'bottom' ? r.y1 - m : Math.min(Math.max(cy, r.y0 + m), r.y1 - m);
  return { edge, x, y, toward: { x: cx, y: cy } };
}

/**
 * (1) Nazwy przy CTRL przy ikonach walki — rozkład bez kupy: każda nazwa próbuje miejsc obok SWOJEJ ikony — pierścień 1 (prawo, lewo,
 * dół, góra, potem skosy; odstęp `gap` od promienia ikony), a gdy tam ciasno — pierścień 2 o `lead` px dalej (nazwa z nitką do ikony,
 * `lead: true`); bierze pierwsze wolne (bez nachodzenia na nazwy już postawione, ikony i przeszkody, w obszarze mapy); bez wolnego
 * miejsca — nazwa pominięta (nigdy na innej). Kolejność deterministyczna: od góry ekranu, potem id.
 * @param {Array<{id:string, x:number, y:number, r:number, w:number, h:number}>} items — kotwica (środek ikony), promień ikony, wymiar nazwy
 * @param {{ obstacles?:Array<{x:number,y:number,w:number,h:number}>, icons?:Array<{x:number,y:number,r:number}>, rect?:object, gap?:number,
 *           lead?:number }} o
 * @returns {Array<{id:string, x:number, y:number, w:number, h:number, side:string, lead:boolean}>} prostokąty nazw (lewy górny róg)
 */
export function tacPlaceNames(items, { obstacles = [], icons = [], rect = null, gap = TAC.TAC_NAME_GAP, lead = TAC.TAC_NAME_LEAD } = {}) {
  const placed = [];
  const hitRect = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const hitIcon = (a, c) => {
    const nx = Math.max(a.x, Math.min(c.x, a.x + a.w)), ny = Math.max(a.y, Math.min(c.y, a.y + a.h));
    return Math.hypot(nx - c.x, ny - c.y) < c.r;
  };
  const inRect = (a) => !rect || (a.x >= rect.x0 && a.y >= rect.y0 && a.x + a.w <= rect.x1 && a.y + a.h <= rect.y1);
  const order = [...(items ?? [])].filter((it) => it && Number.isFinite(it.x) && Number.isFinite(it.y))
    .sort((a, b) => a.y - b.y || (String(a.id) < String(b.id) ? -1 : 1));
  const ring = (r, isLead) => {
    const d = r * Math.SQRT1_2;
    return [
      { side: 'E', x: (it) => it.x + r, y: (it) => it.y - it.h / 2 },
      { side: 'W', x: (it) => it.x - r - it.w, y: (it) => it.y - it.h / 2 },
      { side: 'S', x: (it) => it.x - it.w / 2, y: (it) => it.y + r },
      { side: 'N', x: (it) => it.x - it.w / 2, y: (it) => it.y - r - it.h },
      { side: 'NE', x: (it) => it.x + d, y: (it) => it.y - d - it.h },
      { side: 'SE', x: (it) => it.x + d, y: (it) => it.y + d },
      { side: 'NW', x: (it) => it.x - d - it.w, y: (it) => it.y - d - it.h },
      { side: 'SW', x: (it) => it.x - d - it.w, y: (it) => it.y + d },
    ].map((c) => ({ ...c, lead: isLead }));
  };
  for (const it of order) {
    const r1 = Math.max(0, it.r ?? 0) + gap;
    const cands = [...ring(r1, false), ...(lead > 0 ? ring(r1 + lead, true) : [])];
    for (const c of cands) {
      const a = { x: c.x(it), y: c.y(it), w: it.w, h: it.h };
      if (!inRect(a)) continue;
      if (placed.some((p) => hitRect(a, p)) || obstacles.some((o) => hitRect(a, o))) continue;
      if (icons.some((ic) => ic.id !== it.id && hitIcon(a, ic))) continue;
      placed.push({ id: String(it.id), x: a.x, y: a.y, w: a.w, h: a.h, side: c.side, lead: c.lead });
      break;
    }
  }
  return placed;
}

/**
 * Statek z pasmami zasięgu: najechany, jeśli się nadaje (widoczny w pełni, żywy), inaczej pierwszy nadający się zaznaczony. Kursor nad
 * wrakiem albo ikoną „nieznany” nie gasi pasm zaznaczonego statku (dawniej najechanie wygrywało zawsze).
 * @param {{ hoverId:string|null, selectedIds:Iterable<string>, qualifies:(id:string)=>boolean }} p
 */
export function tacBandTarget({ hoverId = null, selectedIds = [], qualifies = () => false } = {}) {
  if (hoverId != null && qualifies(String(hoverId))) return String(hoverId);
  for (const id of selectedIds ?? []) if (qualifies(String(id))) return String(id);
  return null;
}
