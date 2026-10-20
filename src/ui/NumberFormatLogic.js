// NumberFormatLogic — czyste formatery liczb UI (separator tysięcy, miejsca dziesiętne, znak, mieszkańcy, procent) wg
// języka (`locale` = 'pl' | 'en' — parametr, nie import). Bez DOM / canvas / i18n / window → testowalne headless.
//
// ARKUSZ UI U4-1 (UI_PLAN §4.5, decyzja 4): przeniesione BIT W BIT z `NavPeekCardLogic` (karty peek dolnego paska usunięte
// w U4-1; karty wyłączone w U3-0b). Konsumenci: `TopBarFormatLogic` (komórki górnej belki).

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
