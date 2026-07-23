// NavPeekCardLogic — czyste helpery karty "peek" dolnego paska nawigacji.
//
// Bez DOM/canvas/i18n → testowalne headless (wzór BottomNavBarLogic/FleetGroupPanelLogic).
// Zawiera: geometrię karty (pozycja nad slotem + clamp do ekranu), krok animacji
// wysuwania (slide translacyjny BEZ skalowania), oraz formatery liczb (locale jako
// PARAMETR, nie import i18n — inaczej moduł nie byłby headless-pure).

// ── Stałe wyglądu/animacji (knoby) ──────────────────────────────────────────
export const PEEK_CARD_W    = 236;   // px — MINIMALNA/referencyjna szerokość (realna = szerokość slotu)
export const PEEK_CARD_H    = 150;   // px — fallback wysokości (realna liczona dynamicznie z wierszy)
export const PEEK_CARD_GAP  = 0;     // px — karta DOBITA do paska (flush) = wysuwa się z kafla, nie dymek
export const PEEK_EDGE      = 4;     // px — inset od krawędzi ekranu przy clampie poziomym
export const PEEK_SLIDE_FRAC = 1.0;  // pełne wysunięcie — kafelek wyjeżdża CAŁY zza paska (drawer)
export const PEEK_ANIM_MS   = 190;   // czas animacji wysuwania/chowania

// ── Wymiary treści (baner + wiersze) — zagęszczone, żeby stała wysokość ~mieściła treść ──
export const PEEK_BANNER_H = 36;   // px — baner z grafiką przycisku (góra karty)
export const PEEK_ROW_H    = 14;   // px — wiersz kv / alert
export const PEEK_HEAD_H   = 15;   // px — nagłówek sekcji (odrobinę wyższy)
export const PEEK_PAD_TOP  = 4;    // px — odstęp baner→pierwszy wiersz
export const PEEK_PAD_BOT  = 2;    // px — dolny margines (ostatni wiersz przy samym dole)

/** Dynamiczna wysokość karty z listy wierszy (kind: 'head' wyższy niż kv/alert). */
export function peekContentHeight(rows) {
  let h = PEEK_BANNER_H + PEEK_PAD_TOP;
  for (const r of (rows || [])) h += (r && r.kind === 'head' ? PEEK_HEAD_H : PEEK_ROW_H);
  return h + PEEK_PAD_BOT;
}

// STAŁA wysokość karty (niezależna od treści) — mieści najbogatszą kartę, jednakowa dla
// wszystkich slotów (brak skoków wysokości przy najeżdżaniu). Clamp do miejsca nad paskiem.
export const PEEK_FIXED_H   = 172;   // px — stała wysokość = pełna karta Production (top-5) co do wiersza
export const PEEK_TOP_MARGIN = 36;   // px — min. odstęp od góry ekranu (pod górną belką)

export function peekCardFixedHeight(navTopY) {
  return Math.max(140, Math.min(PEEK_FIXED_H, navTopY - PEEK_TOP_MARGIN));
}

// Y startowe wierszy: DOSUNIĘTE DO DOŁU (ostatni wiersz przy krawędzi karty) gdy treść się mieści;
// gdy przekracza dostępne miejsce (bogate karty) — wyrównaj do góry pod banerem i utnij nadmiar u dołu.
export function peekRowsStartY(cardTopY, cardH, totalRowsH) {
  const bottomLimit = cardTopY + cardH - PEEK_PAD_BOT;
  const available   = cardH - PEEK_BANNER_H - PEEK_PAD_TOP - PEEK_PAD_BOT;
  return totalRowsH <= available ? (bottomLimit - totalRowsH) : (cardTopY + PEEK_BANNER_H + PEEK_PAD_TOP);
}

/** Suma wysokości wierszy (head wyższy niż kv/alert). */
export function peekRowsTotalHeight(rows) {
  let h = 0;
  for (const r of (rows || [])) h += (r && r.kind === 'head' ? PEEK_HEAD_H : PEEK_ROW_H);
  return h;
}
export const PEEK_HIDE_DELAY = 160;  // ms zwłoki schowania po zjechaniu kursora (można wjechać na kartę)
export const PEEK_HOVER_DELAY = 500; // ms — kursor musi spocząć na slocie tyle czasu, zanim karta się wysunie
                                     // (blokuje przypadkowe wywołanie przy zwykłym przejechaniu myszą)

// ── Easing ──────────────────────────────────────────────────────────────────
export function easeOutCubic(p) {
  const c = Math.max(0, Math.min(1, p));
  return 1 - Math.pow(1 - c, 3);
}

// ── Krok progresu animacji w stronę celu (0/1) ──────────────────────────────
// cur/target 0..1, dtMs = delta czasu klatki, durMs = czas pełnej animacji.
export function stepProgress(cur, target, dtMs, durMs = PEEK_ANIM_MS) {
  const step = (durMs > 0 ? dtMs / durMs : 1);
  if (cur < target) return Math.min(target, cur + step);
  if (cur > target) return Math.max(target, cur - step);
  return cur;
}

// ── Geometria karty ─────────────────────────────────────────────────────────
/** X karty: wyśrodkowana na środku slotu, clamp do [edge, W-cardW-edge]. */
export function peekCardX(slotCenterX, cardW = PEEK_CARD_W, W = 0, edge = PEEK_EDGE) {
  const x = slotCenterX - cardW / 2;
  const maxX = Math.max(edge, W - cardW - edge);
  return Math.round(Math.max(edge, Math.min(maxX, x)));
}

/** Y karty w pozycji SPOCZYNKOWEJ (w pełni wysunięta): tuż nad paskiem nav. */
export function peekCardRestY(navTopY, cardH = PEEK_CARD_H, gap = PEEK_CARD_GAP) {
  return Math.round(navTopY - gap - cardH);
}

/** Pionowe przesunięcie (w DÓŁ) w trakcie wysuwania — 0 gdy p=1 (spoczynek). */
export function peekSlideOffset(p, cardH = PEEK_CARD_H, frac = PEEK_SLIDE_FRAC) {
  return (1 - easeOutCubic(p)) * frac * cardH;
}

/** X grotu (▼) wskazującego slot — clamp do wnętrza karty. */
export function peekArrowX(slotCenterX, cardX, cardW = PEEK_CARD_W) {
  return Math.round(Math.max(cardX + 14, Math.min(cardX + cardW - 14, slotCenterX)));
}

/** Punkt w prostokącie (null-safe). */
export function pointInRect(rect, x, y) {
  return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

// ── Formatery liczb (locale = 'pl' | 'en', tylko separator/sufiksy) ──────────
const THIN = ' '; // wąska spacja jako separator tysięcy

function _group(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

/** Liczba całkowita z separatorem tysięcy: 12480 → "12 480". */
export function fmtInt(n, locale = 'pl') {
  if (!isFinite(n)) return '—';
  const neg = n < 0;
  const s = _group(Math.round(Math.abs(n)).toString());
  return (neg ? '-' : '') + s;
}

/** Liczba z miejscami dziesiętnymi; separator ',' (pl) / '.' (en). */
export function fmtDec(n, digits = 1, locale = 'pl') {
  if (!isFinite(n)) return '—';
  const sep = locale === 'en' ? '.' : ',';
  const fixed = Number(n).toFixed(digits);
  const neg = fixed.startsWith('-');
  const [ip, fp] = (neg ? fixed.slice(1) : fixed).split('.');
  const grouped = _group(ip);
  return (neg ? '-' : '') + grouped + (fp ? sep + fp : '');
}

/** Ze znakiem: +34,5 / -45 / +0. */
export function fmtSigned(n, digits = 0, locale = 'pl') {
  if (!isFinite(n)) return '—';
  const abs = digits > 0 ? fmtDec(Math.abs(n), digits, locale) : fmtInt(Math.abs(n), locale);
  return (n < 0 ? '-' : '+') + abs;
}

/** Mieszkańcy skalowani: 45000 → "45 tys." (pl) / "45k" (en); 1.2e6 → "1,2 mln"/"1.2M". */
export function fmtPeople(n, locale = 'pl') {
  if (!isFinite(n)) return '—';
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  const U = locale === 'en' ? { k: 'k', m: 'M', b: 'B' } : { k: ' tys.', m: ' mln', b: ' mld' };
  if (a >= 1e9) return sign + fmtDec(a / 1e9, 1, locale) + U.b;
  if (a >= 1e6) return sign + fmtDec(a / 1e6, 1, locale) + U.m;
  if (a >= 1e3) return sign + fmtDec(a / 1e3, a >= 1e4 ? 0 : 1, locale) + U.k;
  return sign + fmtInt(a, locale);
}

/** Ułamek 0..1 → "45%". */
export function fmtPct(frac) {
  if (!isFinite(frac)) return '—';
  return Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
}
