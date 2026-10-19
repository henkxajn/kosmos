// TopBarFormatLogic — czyste helpery górnej belki surowców (ARKUSZ UI, U0-3: D-UI-12 + Findingi 474, 475, 479).
//
// Bez DOM / canvas / i18n / window → testowalne headless. Wzór NavPeekCardLogic: język i funkcja pomiaru tekstu
// są PARAMETRAMI, nie importami. Zawiera:
//   • format liczby w komórce wg języka i progu 10 000 (12 400 → „12,4k" PL / „12.4k" EN; 9 999 w całości) —
//     Finding 479 (dawniej zawsze kropka i skrót już od 1 000);
//   • pełną liczbę z separatorem tysięcy (kredyty — D-UI-12 „zawsze w całości"; tooltipy) i deltę do tooltipu;
//   • strzałkę trendu zamiast liczby delty (decyzja 1 (a), podpisana 2026-10-18);
//   • szablony szerokości komórek z `measure(tekst, font)` dla AKTYWNEGO fontu. Font efektywny to preset motywu
//     z ekranu tytułowego (Share Tech Mono / Rajdhani), nie Space Mono z ThemeConfig — Rajdhani jest
//     proporcjonalny, więc szablon bierze NAJSZERSZĄ cyfrę, nie „8". Liczone raz na klucz fontu (zmiana presetu
//     F7 / motywu = nowy klucz = nowy pomiar);
//   • plan wiersza: stałe komórki od lewej (x tokenu k identyczny w KAŻDYM wierszu listy — Finding 474), kredyty
//     przypięte do prawego końca i nigdy nieucinane (Finding 475), strefa nazwy 200 → podłoga 160 przy ujemnym
//     budżecie, dopiero potem zrzucenie ostatnich ZWYKŁYCH tokenów;
//   • skracanie tekstu z wielokropkiem (nazwa kolonii w zwężonej strefie).

import { fmtInt, fmtDec } from './NavPeekCardLogic.js';

export const ABBREV_FROM     = 10_000;  // D-UI-12: skrót liczb od 10 000 (próg potwierdzony 2026-10-18)
export const NAME_ZONE_W     = 200;     // strefa nazwy kolonii + POP — szerokość domyślna (px logiczne)
export const NAME_ZONE_MIN_W = 160;     // podłoga strefy nazwy przy ujemnym budżecie (decyzja właściciela 2026-10-18)
export const NAME_GAP        = 6;       // separator strefy nazwy → pierwszy token
export const RIGHT_PAD       = 4;       // prawy margines pasma (za kredytami)
export const ICON_SIZE       = 16;      // ikona PNG tokenu (= ROW_H − 8)
export const ICON_GAP        = 2;       // ikona → wartość
export const VALUE_GAP       = 2;       // wartość → strzałka trendu
export const TOKEN_GAP       = 3;       // komórka → następna komórka
export const HINT_MIN_W      = 16;      // rezerwa na chevron „▾N" przy >1 kolonii
export const TREND_UP        = '▲';
export const TREND_DOWN      = '▼';
export const ELLIPSIS        = '…';

// Szablony wartości komórki (8 = cyfra; podmieniana na NAJSZERSZĄ cyfrę fontu) — postaci fmtBeltValue dla wartości
// osiąganych w grze (< 10 mln): „88,8k" (10 000–99 949), „8888" (1 000–9 999), „888,8" (< 1 000 z ułamkiem), „888k"
// (do 999 499), „8,8M" (do 9,9 mln). Z obu separatorami — szablon nie zależy od języka (klucz pomiaru to font).
// W fontach monospace wszystkie postaci 5-znakowe mają tę samą szerokość; w proporcjonalnym Rajdhani najszersza
// realna jest „444,4" (cyfry szersze od przecinka i „k"). Postaci ≥ 10 mln („12,3M", „123M", „G") świadomie POZA
// szablonem: „M" w Rajdhani jest o 3,2 px szersze od „k", a takie zapasy surowców w grze nie występują (największy
// w zapisach właściciela: 1,3 mln) — przy takiej wartości tekst może wejść ≤ 3 px w miejsce strzałki.
const VALUE_TEMPLATES = ['88,8k', '88.8k', '8888', '888,8', '888.8', '888k', '8,8M', '8.8M'];
const CREDITS_TEMPLATE = '8 888 888';   // kredyty: 7 cyfr z separatorami tysięcy (fmtInt)

/** Liczba w komórce belki: < 1 000 — całkowita albo z jednym miejscem; 1 000–9 999 — pełne cyfry; od 10 000 skrót. */
export function fmtBeltValue(n, locale = 'pl') {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a < 1000) {
    const r1 = Math.round(a * 10) / 10;
    if (r1 === 0) return '0';
    return sign + (Number.isInteger(r1) ? String(r1) : fmtDec(r1, 1, locale));
  }
  const r = Math.round(a);
  if (r < ABBREV_FROM) return sign + String(r);
  return sign + _abbrev(a, locale);
}

// 10 000–99 949 → „12,4k" · 99 950–999 499 → „100k"…„999k" · potem M, G tą samą regułą (granice z zaokrągleniem,
// żeby nigdy nie wyszło „100,0k" ani „1000k" — szablon ma 5 znaków).
function _abbrev(a, locale) {
  let v = a / 1e3, suf = 'k';
  if (v >= 999.5) { v = a / 1e6; suf = 'M'; }
  if (suf === 'M' && v >= 999.5) { v = a / 1e9; suf = 'G'; }
  if (v < 99.95) return fmtDec(v, 1, locale) + suf;
  return String(Math.round(v)) + suf;
}

/** Wartość ze znakiem (bilans energii): „+22", „-1500", „-12,4k"; zero bez znaku. */
export function fmtBeltSigned(n, locale = 'pl') {
  if (!Number.isFinite(n)) return '—';
  const s = fmtBeltValue(Math.abs(n), locale);
  if (s === '0') return '0';
  return (n < 0 ? '-' : '+') + s;
}

/** Pełna liczba całkowita z separatorem tysięcy — kredyty (D-UI-12: zawsze w całości). */
export function fmtBeltFull(n, locale = 'pl') {
  return fmtInt(n, locale);
}

/** Dokładna ilość do tooltipu: z separatorem tysięcy; < 1 000 z jednym miejscem, gdy ułamek. */
export function fmtBeltPrecise(n, locale = 'pl') {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a < 1000 && !Number.isInteger(Math.round(a * 10) / 10)) return fmtDec(n, 1, locale);
  return fmtInt(n, locale);
}

/** Delta do tooltipu (decyzja 1 (a) — liczba trendu przeniesiona z belki do tooltipu): „+1,2" / „-0,4". */
export function fmtBeltDelta(n, locale = 'pl') {
  if (!Number.isFinite(n)) return '—';
  return (n < 0 ? '-' : '+') + fmtDec(Math.abs(n), 1, locale);
}

/** Strzałka trendu: ▲ gdy delta > próg, ▼ gdy < −próg, inaczej null (komórka bez strzałki). */
export function trendGlyph(delta, threshold = 0.05) {
  if (!Number.isFinite(delta)) return null;
  if (delta > threshold) return TREND_UP;
  if (delta < -threshold) return TREND_DOWN;
  return null;
}

/** Klucz pomiaru fontu (zmiana rodziny lub rozmiarów = nowy pomiar szablonów). */
export function beltFontKey(theme) {
  return `${theme?.fontFamily}|${theme?.fontSizeSmall}|${theme?.fontSizeNormal}`;
}

/**
 * Szablony szerokości dla aktywnego fontu.
 * @param {(text:string, font:string) => number} measure
 * @param {{ value:string, small:string }} fonts — pełne ciągi fontu canvas (np. „11px 'Share Tech Mono', monospace")
 * @returns {{ widestDigit, valueW, signedW, prospW, creditsW, arrowW, hintW }}
 */
export function measureBeltTemplates(measure, fonts) {
  let D = '0', dw = -1;
  for (const d of '0123456789') {
    const w = measure(d, fonts.value);
    if (w > dw) { dw = w; D = d; }
  }
  const sub = (tpl) => tpl.replace(/8/g, D);
  const valueW = Math.max(...VALUE_TEMPLATES.map(tp => measure(sub(tp), fonts.value)));
  const signedW = Math.max(...VALUE_TEMPLATES.map(tp =>
    Math.max(measure('+' + sub(tp), fonts.value), measure('-' + sub(tp), fonts.value))));
  return {
    widestDigit: D,
    valueW,
    signedW,
    prospW: measure(sub('888'), fonts.value),                   // dobrobyt 0–100
    creditsW: measure(sub(CREDITS_TEMPLATE), fonts.value),      // kredyty 7-cyfrowe z separatorami
    arrowW: Math.max(measure(TREND_UP, fonts.small), measure(TREND_DOWN, fonts.small)),
    hintW: Math.max(HINT_MIN_W, measure('▾' + D + D, fonts.small)),
  };
}

/**
 * Plan wiersza belki. Wszystkie wiersze listy dostają TEN SAM plan (te same komórki, ta sama prawa krawędź),
 * więc x tokenu k jest identyczny w każdym wierszu, a prawy brzeg kredytów — wspólny.
 * @param {{ px?:number, rowW:number, cells:number[], creditsW?:number, nameW?:number, nameMinW?:number }} o
 *   rowW — szerokość wiersza bez rezerwy chevronu; cells — szerokości komórek ZWYKŁYCH tokenów (z TOKEN_GAP);
 *   creditsW — slot kredytów (ikona + odstęp + tekst) albo 0, gdy kolonia nie ma kredytów.
 * @returns {{ nameW:number, tokenX0:number, xs:number[], visible:number, creditsX:number|null,
 *             creditsRight:number, deficit:number }}
 */
export function planBeltRow({ px = 0, rowW, cells, creditsW = 0, nameW = NAME_ZONE_W, nameMinW = NAME_ZONE_MIN_W }) {
  const creditsRight = px + rowW - RIGHT_PAD;
  const creditsX = creditsW > 0 ? creditsRight - creditsW : creditsRight;
  const need = cells.reduce((a, w) => a + w, 0);
  const deficit = need - (creditsX - (px + nameW + NAME_GAP));
  const nw = deficit > 0 ? Math.max(nameMinW, nameW - Math.ceil(deficit)) : nameW;
  const tokenX0 = px + nw + NAME_GAP;
  const xs = [];
  let x = tokenX0;
  for (const w of cells) {
    if (x + w > creditsX + 1e-6) break;   // przepełnienie: znikają OSTATNIE zwykłe tokeny — kredyty nigdy
    xs.push(x);
    x += w;
  }
  return { nameW: nw, tokenX0, xs, visible: xs.length, creditsX: creditsW > 0 ? creditsX : null,
    creditsRight, deficit: Math.max(0, deficit) };
}

/** Tekst przycięty do maxW z wielokropkiem (całość, gdy się mieści; '' gdy nie mieści się nawet „…"). */
export function ellipsize(text, maxW, measure) {
  const s = String(text ?? '');
  if (measure(s) <= maxW) return s;
  const ell = measure(ELLIPSIS);
  if (ell > maxW) return '';
  const chars = [...s];
  let lo = 0, hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(chars.slice(0, mid).join('') + ELLIPSIS) <= maxW) lo = mid; else hi = mid - 1;
  }
  return chars.slice(0, lo).join('').trimEnd() + ELLIPSIS;
}
