// ConsoleBackdropLogic — czytelność tekstu konsoli nad jasnym tłem (ARC KONSOLE KZ, Finding 755; docs/design/CONSOLES_PLAN.md).
//
// Problem: konsola leży nad żywą, przyciemnioną sceną (filtr CSS `brightness(0.4)` na płótnie WebGL). Nad jasnym fragmentem sceny
// (poświata gwiazdy, oświetlona tarcza planety z bliska) tekst konsoli — role dim / primary + stała poświata K0b (2 px) — traci
// kontrast. Reguła (decyzja właściciela po pierwszym podejściu z przyciemnianiem stref — widoczny szary prostokąt): rośnie POŚWIATA
// TEKSTU, nie tło. Każda linia tekstu konsoli (czipy nagłówka, lista, bohater, inspektor, pas) dostaje poświatę o sile zależnej od
// zmierzonej jasności tła POD NIĄ; nad ciemnym tłem nic się nie zmienia (siła 0 → tekst rysowany dokładnie jak dotąd).
//
// Pomiar: ThreeRenderer po renderze klatki pod konsolą (co `SAMPLE_MS`) zmniejsza płótno WebGL na GPU do siatki `GRID_W × GRID_H`
// i czyta ją ASYNCHRONICZNIE (WebGL2: blit → readPixels do PBO → fence; dane odbierane w późniejszej klatce, gdy fence jest gotowy —
// klatka nigdy nie czeka). Bez WebGL2: pomiar tylko przy otwarciu konsoli i ruchu kamery, nigdy na zegar (`samplerAction`).
// Jasność komórek (0..1, sRGB → luminancja względna, PRZED filtrem CSS) trafia do `CONSOLE_BACKDROP`. Ta logika mnoży ją
// przez jasność filtra (`CONSOLE_GLASS.bright`) — liczy się to, co widzi gracz.
// Bez DOM i canvas — testowalne pod node (keeper `console_backdrop_smoke.mjs`).

// Pokrętła (strojenie: `KOSMOS.debug.consoleKit.tuneBackdrop({ HALO_MAX: 9 })`).
export const CONSOLE_BACKDROP_DEFAULTS = Object.freeze({
  GRID_W: 48,          // siatka próbkowania (komórki) — tło płótna WebGL zmniejszone do GRID_W × GRID_H
  GRID_H: 28,
  SAMPLE_MS: 200,      // odstęp pomiaru pod konsolą (ms czasu rzeczywistego)
  PCTL: 0.85,          // percentyl jasności komórek pod tekstem / strefą (jasne fragmenty psują czytelność, nie średnia)
  LUMA_ON: 0.08,       // jasność widziana (po filtrze) — poniżej: poświata bez zmian
  LUMA_FULL: 0.30,     // jasność widziana — od niej poświata pełna
  HALO_MAX: 7,         // promień poświaty przy pełnej sile (px; bazowy promień = CONSOLE_KIT.HALO_BLUR)
  PASSES_MAX: 2,       // dodatkowe przebiegi poświaty przy pełnej sile (krycie cienia rośnie z liczbą przebiegów)
  EM_W: 0.6,           // szerokość znaku fontu monospace w em (szacunek prostokąta linii bez measureText)
});
export const CONSOLE_BACKDROP_KNOBS = { ...CONSOLE_BACKDROP_DEFAULTS };

export function tuneConsoleBackdrop(patch = {}) {
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (k in CONSOLE_BACKDROP_DEFAULTS && Number.isFinite(v) && v >= 0) CONSOLE_BACKDROP_KNOBS[k] = v;
  }
  return { ...CONSOLE_BACKDROP_KNOBS };
}
export function resetConsoleBackdrop() { Object.assign(CONSOLE_BACKDROP_KNOBS, CONSOLE_BACKDROP_DEFAULTS); return { ...CONSOLE_BACKDROP_KNOBS }; }

// Ostatni pomiar (pisze ThreeRenderer, czyta rysunek konsoli). `luma` — Float32Array GRID_W × GRID_H wierszami albo null.
export const CONSOLE_BACKDROP = { gw: 0, gh: 0, luma: null, at: 0, costMs: 0, mode: null };

/** Wyczyść pomiar (konsola zamknięta / brak sceny / błąd) — tekst wraca do poświaty bazowej. */
export function clearBackdropSample(store = CONSOLE_BACKDROP) { store.gw = 0; store.gh = 0; store.luma = null; store.at = 0; }

/** Luminancja względna piksela sRGB (0..255 na kanał) → 0..1 (Rec. 709 na wartościach zlinearyzowanych). */
export function srgbLuma(r, g, b) {
  const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Siatka jasności z danych RGBA o wymiarach gw × gh, wierszami od góry. `flipY` — dane z `readPixels` (początek w lewym DOLNYM rogu).
 */
export function lumaGridFromRgba(data, gw, gh, flipY = false) {
  const out = new Float32Array(gw * gh);
  for (let r = 0; r < gh; r++) {
    const src = flipY ? gh - 1 - r : r;
    for (let c = 0; c < gw; c++) { const i = (src * gw + c) * 4; out[r * gw + c] = srgbLuma(data[i], data[i + 1], data[i + 2]); }
  }
  return out;
}

/**
 * Decyzja próbnika na tę klatkę (czysta — tabela keepera):
 *   'clear'    — konsola zamknięta, a jest pomiar albo odczyt w toku → wyczyść (bez pomiaru pod mapą);
 *   'poll'     — odczyt asynchroniczny w toku → sprawdź fence BEZ czekania (dane albo nic);
 *   'start'    — async: brak pomiaru albo minęło SAMPLE_MS → zleć nowy odczyt (blit + PBO + fence);
 *   'fallback' — bez async: TYLKO przy otwarciu konsoli, braku pomiaru albo ruchu kamery (nigdy na zegar);
 *   'idle'     — nic.
 * @param {{ covered:boolean, wasCovered:boolean, now:number, lastAt:number, pending:boolean, hasSample:boolean, asyncOk:boolean,
 *           camMoved:boolean }} s
 */
export function samplerAction(s, knobs = CONSOLE_BACKDROP_KNOBS) {
  if (!s?.covered) return s?.hasSample || s?.pending ? 'clear' : 'idle';
  if (s.asyncOk) {
    if (s.pending) return 'poll';
    if (!s.hasSample || s.now - s.lastAt >= knobs.SAMPLE_MS) return 'start';
    return 'idle';
  }
  if (!s.wasCovered || !s.hasSample || s.camMoved) return 'fallback';
  return 'idle';
}

/**
 * Jasność WIDZIANA pod prostokątem (px logiczne UI): percentyl `PCTL` komórek siatki, które prostokąt pokrywa, × jasność filtra.
 * W, H — rozmiar logiczny płótna UI (oba płótna pokrywają okno). null = brak pomiaru albo prostokąt poza płótnem.
 */
export function zoneLuma(sample, rect, W, H, bright = 1, knobs = CONSOLE_BACKDROP_KNOBS) {
  const { gw, gh, luma } = sample ?? {};
  if (!luma || !(gw > 0) || !(gh > 0) || !rect || !(W > 0) || !(H > 0)) return null;
  const c0 = Math.max(0, Math.floor((rect.x / W) * gw)), c1 = Math.min(gw - 1, Math.ceil(((rect.x + rect.w) / W) * gw) - 1);
  const r0 = Math.max(0, Math.floor((rect.y / H) * gh)), r1 = Math.min(gh - 1, Math.ceil(((rect.y + rect.h) / H) * gh) - 1);
  if (c1 < c0 || r1 < r0) return null;
  const v = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) v.push(luma[r * gw + c]);
  v.sort((a, b) => a - b);
  const p = Math.min(1, Math.max(0, Number(knobs.PCTL) || 0));
  return v[Math.min(v.length - 1, Math.floor(p * (v.length - 1) + 0.5))] * Math.max(0, Number(bright) || 0);
}

/** Decyzja: jasność widziana → siła poświaty 0..1 (0 ≤ LUMA_ON, liniowo do 1 przy LUMA_FULL; brak pomiaru → 0). */
export function haloStrength(luma, knobs = CONSOLE_BACKDROP_KNOBS) {
  if (luma == null || !Number.isFinite(luma)) return 0;
  const on = knobs.LUMA_ON, full = Math.max(knobs.LUMA_FULL, on + 1e-6);
  return Math.max(0, Math.min(1, (luma - on) / (full - on)));
}

/**
 * Siła → poświata linii: null przy sile 0 (rysunek bez zmian), inaczej { blur, passes } — promień od bazowego do HALO_MAX,
 * dodatkowe przebiegi 1..PASSES_MAX (krycie). Monotoniczne w sile.
 */
export function haloFor(t, baseBlur, knobs = CONSOLE_BACKDROP_KNOBS) {
  if (!(t > 0)) return null;
  const s = Math.min(1, t);
  const base = Math.max(0, Number(baseBlur) || 0);
  return { blur: base + s * Math.max(0, knobs.HALO_MAX - base), passes: Math.max(1, Math.ceil(s * knobs.PASSES_MAX)) };
}

/** Rozmiar fontu (px) z napisu CSS `ctx.font` (np. "bold 11px 'Share Tech Mono'"); brak → 12. */
export function fontPx(font) {
  const m = /(\d+(?:\.\d+)?)px/.exec(String(font ?? ''));
  return m ? Number(m[1]) : 12;
}

/**
 * Szacunkowy prostokąt linii tekstu (px logiczne) bez measureText: szerokość = znaki × EM_W × rozmiar (font konsoli jest
 * monospace), wyrównanie poziome z `textAlign`, pionowe z `textBaseline`.
 */
export function textRect(text, x, y, font, align = 'left', baseline = 'alphabetic', knobs = CONSOLE_BACKDROP_KNOBS) {
  const px = fontPx(font);
  const w = Math.max(1, String(text ?? '').length * knobs.EM_W * px);
  const x0 = align === 'right' || align === 'end' ? x - w : align === 'center' ? x - w / 2 : x;
  const y0 = baseline === 'top' || baseline === 'hanging' ? y : baseline === 'middle' ? y - px / 2 : baseline === 'bottom' || baseline === 'ideographic' ? y - px : y - px * 0.8;
  return { x: x0, y: y0, w, h: px };
}

/** Strefy konsoli objęte regułą (diagnostyka i pin „per strefa”): każdy tekst konsoli leży w jednej z nich. */
export const HALO_ZONE_KEYS = Object.freeze(['header', 'list', 'hero', 'inspector', 'strip']);

/** Plan per strefa: { key, luma, t } dla stref obecnych w `zones` (t = siła poświaty nad tą strefą). */
export function zoneHaloPlan(zones, sample, W, H, bright, knobs = CONSOLE_BACKDROP_KNOBS) {
  const out = [];
  for (const key of HALO_ZONE_KEYS) {
    const rect = zones?.[key];
    if (!rect || !(rect.w > 0) || !(rect.h > 0)) continue;
    const luma = zoneLuma(sample, rect, W, H, bright, knobs);
    out.push({ key, luma, t: haloStrength(luma, knobs) });
  }
  return out;
}

/** Czy nowy pomiar różni się od poprzedniego na tyle, by przerysować UI (kwantyzacja 1/32 jasności). */
export function sampleSignature(luma) {
  if (!luma) return '';
  let s = '';
  for (let i = 0; i < luma.length; i++) s += String.fromCharCode(48 + Math.min(63, Math.round(luma[i] * 32)));
  return s;
}
