// textures — decyzje kodowania tekstur normalizatora (ARC COMBAT VISUALS, krok CV-1b; D-CV-15 + warunek §3.1-4). Czyste
// funkcje: KTÓRA tekstura, JAK kodowana; samo kodowanie (sharp) robi CLI.
//
// ZASADY (D-CV-15, warunek §3.1-4, zlecenie CV-1b):
//   • limit 2K (master, preset High) i wariant 1K (`<slot>@1k.glb`, presety Medium / Low — CV-2b);
//   • KOLOR BAZOWY bez widocznej straty i BEZ PUCHNIĘCIA: JPEG ≤ limitu zostaje BAJT W BAJT (żadnego ponownego kodowania
//     4:2:0 — cienki cyjan klucza by się rozlał); gdy trzeba zmniejszyć albo źródło jest PNG — WebP BEZSTRATNY;
//   • MAPY NORMALNYCH najpierw (dziś 67 % wagi folderu). Jakość wybrana na arkuszu kontaktowym wobec PNG (2026-11-11,
//     RTX 3070, three r171, zbliżenie ze światłem ślizgowym): WebP stratny (zawsze podpróbkowanie 4:2:0 — wektory X / Y
//     siedzą w chrominancji) daje PSNR 36–43 dB na 2K i 30 dB na 1K (do 7 % pikseli różnych o > 12 poziomów) — WIDAĆ na
//     zbliżeniu; WebP near-lossless 60 daje 48–53 dB, zero takich pikseli — nie widać, przy −38 … −56 % rozmiaru PNG.
//     ⇒ master 2K i stare modele 1K: near-lossless 60; wariant 1K dla słabszych maszyn: stratny q90 (najmniejszy);
//   • metallic-roughness: WebP stratny q90 (źródło Meshy to już JPEG 4:2:0);
//   • emisja / okluzja: bez zmian, chyba że trzeba zmniejszyć (wtedy bezstratnie);
//   • „tylko tam, gdzie to zmniejsza plik": kodowanie bez zmiany rozmiaru, które nie daje mniejszych bajtów ⇒ źródło zostaje.
// Bez Draco / meshopt / KTX2 — loader gry nie ma dekoderów (§1 Q6).

export const TEX_CAP = Object.freeze({ '2k': 2048, '1k': 1024 });

/** Ustawienia kodowania wg roli i wariantu (pokrętła — zmiana tylko po arkuszu kontaktowym). */
export const ENCODE = Object.freeze({
  normal: Object.freeze({ '2k': { format: 'webp', nearLossless: true, quality: 60 }, '1k': { format: 'webp', quality: 90, smartSubsample: true }, legacy: { format: 'webp', nearLossless: true, quality: 60 } }),
  metallicRoughness: Object.freeze({ '2k': { format: 'webp', quality: 90, smartSubsample: true }, '1k': { format: 'webp', quality: 90, smartSubsample: true }, legacy: null }),
  baseColor: Object.freeze({ lossless: { format: 'webp', lossless: true } }),
});

const MIME_OF = Object.freeze({ webp: 'image/webp', png: 'image/png', jpeg: 'image/jpeg' });
export const mimeOf = (format) => MIME_OF[format] ?? null;

/**
 * Plan kodowania jednej tekstury.
 * @param {{ role: 'baseColor'|'normal'|'metallicRoughness'|'emissive'|'occlusion'|'other', mime: string, width: number, height: number }} t
 * @param {'2k'|'1k'|'legacy'} target — master 2K, wariant 1K, przebieg po starych modelach (tylko kompresja, bez skalowania)
 * @returns {{ action: 'keep'|'encode', resize: number|null, enc: object|null, keepIfNotSmaller: boolean, why: string }}
 */
export function planTexture(t, target) {
  const cap = target === '1k' ? TEX_CAP['1k'] : TEX_CAP['2k'];
  const big = Math.max(t.width || 0, t.height || 0);
  const resize = target !== 'legacy' && big > cap ? cap : null;
  const isJpeg = t.mime === 'image/jpeg', isPng = t.mime === 'image/png', isWebp = t.mime === 'image/webp';
  switch (t.role) {
    case 'baseColor':
      if (!resize && isJpeg) return { action: 'keep', resize: null, enc: null, keepIfNotSmaller: false, why: 'JPEG w limicie — bajty bez zmian' };
      if (!resize && isWebp) return { action: 'keep', resize: null, enc: null, keepIfNotSmaller: false, why: 'WebP w limicie — bez zmian' };
      if (!resize && isPng) return { action: 'encode', resize: null, enc: ENCODE.baseColor.lossless, keepIfNotSmaller: true, why: 'WebP bezstratny' };
      return { action: 'encode', resize, enc: ENCODE.baseColor.lossless, keepIfNotSmaller: false, why: 'WebP bezstratny' };
    case 'normal': {
      const enc = ENCODE.normal[target];
      if (!enc) return { action: 'keep', resize: null, enc: null, keepIfNotSmaller: false, why: 'bez zmian' };
      if (!resize && isWebp) return { action: 'keep', resize: null, enc: null, keepIfNotSmaller: false, why: 'już WebP' };
      return { action: 'encode', resize, enc, keepIfNotSmaller: !resize, why: enc.nearLossless ? 'bez widocznej straty' : `stratnie q${enc.quality}` };
    }
    case 'metallicRoughness':
    case 'occlusion': {
      const enc = ENCODE.metallicRoughness[target];
      if (!enc) return resize ? { action: 'encode', resize, enc: ENCODE.baseColor.lossless, keepIfNotSmaller: false, why: `zmniejszenie do ${resize} px` }
        : { action: 'keep', resize: null, enc: null, keepIfNotSmaller: false, why: 'bez zmian (stary model — strata pokoleniowa nie jest warta kilkudziesięciu KB)' };
      if (!resize && isWebp) return { action: 'keep', resize: null, enc: null, keepIfNotSmaller: false, why: 'już WebP' };
      return { action: 'encode', resize, enc, keepIfNotSmaller: !resize, why: `stratnie q${enc.quality}` };
    }
    default:
      if (resize) return { action: 'encode', resize, enc: ENCODE.baseColor.lossless, keepIfNotSmaller: false, why: `zmniejszenie do ${resize} px — WebP bezstratny` };
      return { action: 'keep', resize: null, enc: null, keepIfNotSmaller: false, why: 'bez zmian' };
  }
}

/**
 * Wynik kodowania: zostawić źródło, gdy nowe bajty nie są mniejsze, a plan na to pozwala (bez zmiany rozmiaru).
 * @returns {boolean} true = użyj nowych bajtów
 */
export function acceptEncoded(plan, srcBytes, outBytes) {
  if (plan.action !== 'encode') return false;
  if (plan.keepIfNotSmaller && outBytes >= srcBytes) return false;
  return true;
}

/** Rola tekstury w materiale glTF (gltf-transform: nazwa slotu `baseColorTexture` itd.). */
export function roleOfSlot(slotName) {
  if (slotName === 'baseColorTexture') return 'baseColor';
  if (slotName === 'normalTexture') return 'normal';
  if (slotName === 'metallicRoughnessTexture') return 'metallicRoughness';
  if (slotName === 'emissiveTexture') return 'emissive';
  if (slotName === 'occlusionTexture') return 'occlusion';
  return 'other';
}
