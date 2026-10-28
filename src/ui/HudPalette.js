// HudPalette — role kolorów warstwy HUD mapy z motywu UI (ARKUSZ HUD H0, D-HUD-2; HUD_PLAN.md §2.10, §5.0).
//
// Cztery role, każda = TOKEN motywu (obiekt `THEME`, `ThemeConfig.js`) czytany przy KAŻDYM wywołaniu — zmiana motywu
// (ekran tytułowy, F7 w trakcie gry) widoczna od razu, bez pamięci stanu motywu:
//   primary  = `accent`       — własne obiekty, etykiety, ping, trasy
//   dim      = `textDim`      — przygaszone
//   foreign  = `textPrimary`  — obce
//   alert    = `danger`, a `warning`, gdy najgorsze ΔE2000(primary, danger) < HUD_MIN_DE (10)
// „Najgorsze” = minimum z oka normalnego i trzech symulacji daltonizmu (Machado, Oliveira, Fernandes 2009, nasilenie
// 1,0 — protanopia, deuteranopia, tritanopia). To reguła B2 z pomiaru fazy A: dosłowne „primary w barwie ostrzegawczej
// → alert = warning” daje w Amber Noir ΔE 0,44 w deuteranopii, czyli alert nieodróżnialny od primary (§1.1 (3)).
// Kontrast luminancji (WCAG) między rolami jest niski we wszystkich motywach (1,03–1,9) — role rozróżnia barwa, dlatego
// miarą jest ΔE z symulacją daltonizmu (raport niżej podaje obie).
//
// Czysty moduł: bez three, bez DOM, ZERO kolorów na sztywno — barwy wyłącznie z tokenów motywu. Algorytmy koloru
// (sRGB ↔ liniowe, CIELAB D65, ΔE2000, macierze Machado) przeniesione z sondy fazy A
// (`kosmos-handover/hud-phase-a/probes/theme_contrast.mjs`) — wyniki liczone tutaj, nie kopiowane.
import { THEME, DEFAULT_THEME } from '../config/ThemeConfig.js';

// Próg rozróżnialności ról: najgorsze ΔE2000 poniżej ⇒ role „zlewają się” (reguła alertu i kryterium keepera).
export const HUD_MIN_DE = 10;

// Tokeny ról stałych (alert — reguła wyżej). Jedno źródło nazw dla raportu i keepera.
export const HUD_ROLE_TOKENS = Object.freeze({ primary: 'accent', dim: 'textDim', foreign: 'textPrimary' });

// Kolejność par w raporcie (każda para ról).
const ROLE_KEYS = ['primary', 'dim', 'alert', 'foreign'];

/** Token motywu (`theme[key]`, brak — wartość domyślna z `DEFAULT_THEME`). Czytany przy każdym wywołaniu. */
export function themeToken(theme, key) {
  return theme?.[key] ?? DEFAULT_THEME[key];
}

// ── Kolor tokenu ───────────────────────────────────────────────────

const RGB_RE = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/i;
const HASH_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Token koloru → `{ r, g, b, a }` (kanały 0–255, krycie 0–1); `null` — nie kolor. Formaty: `#rgb`, `#rrggbb`,
 *  `#rrggbbaa`, `rgb(…)`, `rgba(…)`. */
export function parseColorToken(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim();
  const m = s.match(RGB_RE);
  if (m) {
    const a = m[4] != null ? Number(m[4]) : 1;
    return { r: clamp255(+m[1]), g: clamp255(+m[2]), b: clamp255(+m[3]), a: Math.max(0, Math.min(1, a)) };
  }
  const h = s.match(HASH_RE);
  if (!h) return null;
  let x = h[1];
  if (x.length === 3) x = x.split('').map((c) => c + c).join('');
  const n = (i) => parseInt(x.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: x.length === 8 ? n(6) / 255 : 1 };
}

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

/** Token → `[r, g, b]` po nałożeniu krycia tokenu na tło `bg` (domyślnie czerń — tło sceny mapy). */
export function tokenRgb(str, bg = [0, 0, 0]) {
  const c = parseColorToken(str);
  if (!c) return null;
  return [c.r, c.g, c.b].map((v, i) => Math.round(v * c.a + bg[i] * (1 - c.a)));
}

/** Token → liczba 0xRRGGBB (kanały tokenu BEZ krycia — krycie materiału 3D ustala osobno jego właściciel). */
export function tokenRgbInt(str) {
  const c = parseColorToken(str);
  if (!c) return null;
  return (c.r << 16) | (c.g << 8) | c.b;
}

// ── Kolorymetria (sRGB, CIELAB D65, ΔE2000, Machado 2009) ──────────

const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const toS = (l) => { l = Math.min(1, Math.max(0, l)); const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055; return Math.round(c * 255); };
const luminance = (rgb) => { const [r, g, b] = rgb.map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

/** Kontrast luminancji WCAG 2.x (1–21). */
export function wcagContrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const lab = (rgb) => {
  const [r, g, b] = rgb.map(toLin);
  let X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  let Z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;
  X /= 0.95047; Z /= 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

/** ΔE2000 (CIE 2000) między dwoma kolorami `[r, g, b]`. */
export function deltaE2000(c1, c2) {
  const [L1, a1, b1] = lab(c1), [L2, a2, b2] = lab(c2);
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hue = (a, b) => { if (a === 0 && b === 0) return 0; const x = Math.atan2(b, a) * 180 / Math.PI; return x < 0 ? x + 360 : x; };
  const h1p = hue(a1p, b1), h2p = hue(a2p, b2);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) { if (Math.abs(h1p - h2p) > 180) hbp += (hbp < 360 ? 360 : -360); hbp /= 2; }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * hbp * Math.PI / 180)
    + 0.32 * Math.cos((3 * hbp + 6) * Math.PI / 180) - 0.20 * Math.cos((4 * hbp - 63) * Math.PI / 180);
  const dTh = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const Sl = 1 + 0.015 * Math.pow(Lbp - 50, 2) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTh * Math.PI / 180) * Rc;
  return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh));
}

// Machado, Oliveira, Fernandes 2009 — symulacja dichromatyzmu, nasilenie 1,0 (macierze na liniowym RGB).
export const CVD_MATRICES = Object.freeze({
  protanopia:   [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia:   [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
});

/** Kolor `[r, g, b]` widziany przy dichromatyzmie `kind` ('protanopia' | 'deuteranopia' | 'tritanopia'). */
export function simulateCvd(rgb, kind) {
  const M = CVD_MATRICES[kind];
  const l = rgb.map(toLin);
  return M.map((row) => toS(row[0] * l[0] + row[1] * l[1] + row[2] * l[2]));
}

/** ΔE2000 przy oku normalnym i w trzech symulacjach daltonizmu; `worst` — minimum z czterech. */
export function worstDeltaE(c1, c2) {
  const out = { normal: deltaE2000(c1, c2) };
  for (const kind of Object.keys(CVD_MATRICES)) out[kind] = deltaE2000(simulateCvd(c1, kind), simulateCvd(c2, kind));
  out.worst = Math.min(out.normal, out.protanopia, out.deuteranopia, out.tritanopia);
  return out;
}

// Pamięć wyniku reguły alertu po WARTOŚCIACH tokenów (czysta funkcja wejść — zmiana tokenu = nowy klucz, więc zmiana
// motywu jest widoczna od razu; pamięć oszczędza tylko liczenie ΔE przy każdej orbicie / klatce).
const _alertMemo = new Map();

function alertSourceFor(primaryTok, dangerTok) {
  const key = primaryTok + '|' + dangerTok;
  let src = _alertMemo.get(key);
  if (src === undefined) {
    const p = tokenRgb(primaryTok), d = tokenRgb(dangerTok);
    src = p && d && worstDeltaE(p, d).worst < HUD_MIN_DE ? 'warning' : 'danger';
    if (_alertMemo.size > 64) _alertMemo.clear();
    _alertMemo.set(key, src);
  }
  return src;
}

// ── Role HUD ───────────────────────────────────────────────────────

/**
 * Role kolorów HUD z motywu (D-HUD-2, reguła B2) — tokeny czytane przy KAŻDYM wywołaniu.
 * @returns {{ primary: string, dim: string, alert: string, foreign: string, alertSource: 'danger'|'warning' }}
 *   wartości ról = tokeny motywu (napisy koloru, gotowe dla Canvas 2D; dla 3D — `tokenRgbInt`).
 */
export function resolveHudRoles(theme = THEME) {
  const primary = themeToken(theme, HUD_ROLE_TOKENS.primary);
  const alertSource = alertSourceFor(primary, themeToken(theme, 'danger'));
  return {
    primary,
    dim: themeToken(theme, HUD_ROLE_TOKENS.dim),
    alert: themeToken(theme, alertSource),
    foreign: themeToken(theme, HUD_ROLE_TOKENS.foreign),
    alertSource,
  };
}

/**
 * Barwa roli HUD dla obiektów 3D (ARKUSZ HUD paczka B, D-HUD-16): liczba 0xRRGGBB z tokenu roli (bez krycia — krycie
 * materiału ustala jego właściciel). Tokeny czytane przy każdym wywołaniu — zmiana motywu widoczna od razu; nieznana rola
 * albo nieczytelny token — `primary`.
 */
export function hudRoleHex(role, theme = THEME) {
  const roles = resolveHudRoles(theme);
  return tokenRgbInt(roles[role] ?? roles.primary) ?? tokenRgbInt(roles.primary);
}

/**
 * Raport kontrastu ról motywu (keeper, bramka): każda para ról — ΔE2000 przy oku normalnym, w trzech symulacjach
 * daltonizmu i najgorszy przypadek, plus WCAG; `minWorst` — najgorsza para; `ok` ⇔ każda para ≥ HUD_MIN_DE.
 * Kolory ról z kryciem tokenu nałożonym na czerń (tło sceny mapy).
 */
export function hudContrastReport(theme = THEME) {
  const roles = resolveHudRoles(theme);
  const rgb = Object.fromEntries(ROLE_KEYS.map((k) => [k, tokenRgb(roles[k])]));
  const pairs = {};
  for (let i = 0; i < ROLE_KEYS.length; i++) {
    for (let j = i + 1; j < ROLE_KEYS.length; j++) {
      const a = ROLE_KEYS[i], b = ROLE_KEYS[j];
      pairs[`${a}-${b}`] = rgb[a] && rgb[b]
        ? { ...worstDeltaE(rgb[a], rgb[b]), wcag: wcagContrast(rgb[a], rgb[b]) }
        : null;
    }
  }
  const worsts = Object.values(pairs).map((p) => (p ? p.worst : NaN));
  const minWorst = Math.min(...worsts);
  const p = tokenRgb(roles.primary), d = tokenRgb(themeToken(theme, 'danger')), w = tokenRgb(themeToken(theme, 'warning'));
  return {
    roles,
    pairs,
    minWorst,
    ok: Number.isFinite(minWorst) && minWorst >= HUD_MIN_DE,
    primaryDanger: p && d ? worstDeltaE(p, d) : null,
    primaryWarning: p && w ? worstDeltaE(p, w) : null,
  };
}
