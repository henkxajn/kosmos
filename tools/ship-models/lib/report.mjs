// report — raport normalizacji dla właściciela, PO POLSKU (ARC COMBAT VISUALS, krok CV-1b; plan §2.11, F10, D-CV-14). Czyste
// funkcje: z faktów zebranych przez CLI → werdykty i tekst (drukowany w konsoli i zapisywany jako `incoming/<slot>.report.txt`).
//
// WERDYKTY wobec standardu modelu F10: ✔ spełnia · ⚠ odstępstwo (model działa, ale warto poprawić następny) · ℹ informacja ·
// ☐ tego program nie zmierzy — sprawdź oczami (napisy / logo, liczba dysz). Program NIE udaje pomiaru, którego nie ma.

/** Trójkąty: powyżej — ostrzeżenie (D-CV-14 (a): tylko ostrzeżenie, liczbę trójkątów ustawia się w Meshy). */
export const TRIS_WARN = 15000;
/** Kadłub „nie czarny": średnia jasność obszaru UV (luma 0–255) co najmniej… */
export const HULL_MEAN_LUMA_MIN = 100;
/** …i udział tekseli prawie czarnych (luma < 40) najwyżej… [%] */
export const HULL_DARK_PCT_MAX = 35;
/** Cyjan klucza tylko na światłach: zapalony obszar UV najwyżej… [%] (okna, światła, pierścień — nie płyty kadłuba). */
export const CYAN_LIGHTS_PCT_MAX = 3;
/** Docelowa wielkość mastera 2K (zlecenie CV-1b: ≲ 5 MB) — informacja w raporcie, nie warunek. */
export const TARGET_2K_MB = 5;

const nbsp = ' ';
/** Liczba całkowita z odstępem tysięcy: 9882 → „9 882". */
export const fmtInt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, nbsp);
/** Liczba z przecinkiem dziesiętnym. */
export const fmtDec = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—');
/** Bajty → „9,99 MB" / „310 KB". */
export const fmtSize = (b) => (b >= 1048576 ? `${fmtDec(b / 1048576, 2)} MB` : `${fmtInt(b / 1024)} KB`);
const MIME_NAME = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' };
export const fmtTex = (t, withNote = true) => (t ? `${MIME_NAME[t.mime] ?? t.mime} ${t.width}${nbsp}px ${fmtSize(t.bytes)}${withNote && t.note ? ` (${t.note})` : ''}` : '—');
const ROLE_NAME = { baseColor: 'kolor bazowy', normal: 'normalne', metallicRoughness: 'metal/szorstkość', emissive: 'emisja', occlusion: 'okluzja', other: 'inna' };

/**
 * Werdykty F10 z faktów.
 * @param {object} f — fakty (pola niżej)
 * @returns {{ mark: '✔'|'⚠'|'ℹ'|'☐', text: string }[]}
 */
export function verdicts(f) {
  const v = [];
  const one = f.meshes === 1 && f.primitives === 1 && f.materials === 1;
  v.push(one ? { mark: '✔', text: 'jedna siatka, jeden materiał' }
    : { mark: '⚠', text: `siatek ${f.meshes}, części ${f.primitives}, materiałów ${f.materials} — gra to obsłuży, ale standard to jedna siatka i jeden materiał` });
  v.push(f.tris <= TRIS_WARN ? { mark: '✔', text: `trójkąty: ${fmtInt(f.tris)} (zalecane do ${fmtInt(TRIS_WARN)})` }
    : { mark: '⚠', text: `trójkąty: ${fmtInt(f.tris)} — więcej niż ${fmtInt(TRIS_WARN)}; w Meshy ustaw mniejszą liczbę (gra to zniesie, ale w bitwie 10 na 10 takich statków może być 20)` });
  const t = f.textures ?? {};
  const pbr = t.baseColor && t.normal && t.metallicRoughness;
  v.push(pbr ? { mark: '✔', text: 'tekstury PBR: kolor bazowy, normalne, metal/szorstkość' }
    : { mark: '⚠', text: `brakuje tekstur: ${['baseColor', 'normal', 'metallicRoughness'].filter((r) => !t[r]).map((r) => ROLE_NAME[r]).join(', ')}` });
  if (f.hull) {
    const ok = f.hull.meanLuma >= HULL_MEAN_LUMA_MIN && f.hull.darkPct <= HULL_DARK_PCT_MAX;
    v.push(ok ? { mark: '✔', text: `kadłub nie jest czarny (średnia jasność ${fmtInt(f.hull.meanLuma)}/255, ciemne ${fmtDec(f.hull.darkPct, 1)} %)` }
      : { mark: '⚠', text: `kadłub ciemny (średnia jasność ${fmtInt(f.hull.meanLuma)}/255, ciemne ${fmtDec(f.hull.darkPct, 1)} % powierzchni) — w grze ratuje go światło czytelności, ale jaśniejszy kadłub czyta się lepiej, zwłaszcza pod czerwoną gwiazdą` });
  }
  if (f.cyan) {
    const p = f.cyan.pctOfCovered;
    if (p <= 0) v.push({ mark: 'ℹ', text: 'brak cyjanu klucza — same z siebie nie świecą żadne okna; światła kliknie się w Workshopie (CV-1c)' });
    else if (p <= CYAN_LIGHTS_PCT_MAX) v.push({ mark: '✔', text: `cyjan klucza na ${fmtDec(p, 3)} % powierzchni — tyle co światła / pierścień, nie płyty kadłuba` });
    else v.push({ mark: '⚠', text: `cyjan klucza na ${fmtDec(p, 2)} % powierzchni — dużo; świecić będzie wszystko, co cyjanowe (standard: cyjan tylko na oknach i światłach)` });
  }
  v.push(f.bow?.confident ? { mark: '✔', text: `dziób rozpoznany pewnie (${f.bow.source})` }
    : { mark: '⚠', text: `dziób rozpoznany NIEPEWNIE (${f.bow?.source ?? '?'}) — sprawdź w grze, czy statek leci dziobem; jeśli nie, kliknij dziób w Workshopie (CV-1c)` });
  v.push({ mark: '☐', text: 'jedna dysza silnika na rufie — tego program nie policzy; smuga wychodzi ze środka rufy, obejrzyj model w grze' });
  v.push({ mark: '☐', text: 'bez napisów i logo — tego program nie widzi; obejrzyj model w grze' });
  return v;
}

/**
 * Tekst raportu.
 * @param {object} f — fakty: slot, when, input { file, bytes, sha256 }, tris, verts, vertsWelded, meshes, primitives,
 *   materials, rawExtent [3], longestAxis 'X'|'Y'|'Z', bow { side, source, confident }, nozzle { p, r }, uvCoveragePct,
 *   cyan { pctOfCovered, pctOfTexture }, hull { meanLuma, darkPct }, textures { role: { before, after2k, after1k } },
 *   sizes { before, out2k, out1k }, hardpoints { path, from, why, kept }, written [ścieżki], archived [ścieżki],
 *   orientation { rotated: boolean, warnings: [] }, dry: boolean
 * @returns {string}
 */
export function formatReport(f) {
  const L = [];
  const line = (s = '') => L.push(s);
  const bar = '═'.repeat(66);
  line(bar);
  line(` KOSMOS — raport normalizacji modelu statku${f.dry ? '   (PRÓBA — nic nie zapisano)' : ''}`);
  line(` Slot: ${f.slot}      ${f.when}`);
  line(` Plik źródłowy: ${f.input.file}  (${fmtSize(f.input.bytes)})`);
  line(bar);
  line('');
  line('GEOMETRIA');
  line(`  Trójkąty:      ${fmtInt(f.tris)}`);
  line(`  Wierzchołki:   ${fmtInt(f.verts)}${f.vertsWelded !== f.verts ? ` → ${fmtInt(f.vertsWelded)} po scaleniu identycznych` : ' (bez duplikatów)'}`);
  line(`  Siatki / części / materiały: ${f.meshes} / ${f.primitives} / ${f.materials}`);
  line(`  Wymiary pliku: ${f.rawExtent.map((x) => fmtDec(x, 3)).join(' × ')} (najdłuższa oś ${f.longestAxis})`);
  line(`  Po normalizacji: środek w (0, 0, 0), długość 1,0 wzdłuż osi X, dziób w −X${f.orientation?.rotated ? ' (model obrócony)' : ' (bez obrotu)'}`);
  line(`  Dziób: ${f.bow.side} — ${f.bow.source}`);
  line(`  Dysza: (${f.nozzle.p.map((x) => fmtDec(x, 3)).join('; ')}), promień ${fmtDec(f.nozzle.r, 3)}`);
  for (const w of f.orientation?.warnings ?? []) line(`  ⚠ ${w}`);
  line('');
  line('TEKSTURY            przed  →  po (2K — gra)  ·  po (1K — słabsze komputery, CV-2b)');
  for (const [role, row] of Object.entries(f.textures ?? {})) {
    line(`  ${(ROLE_NAME[role] ?? role).padEnd(18)}${fmtTex(row.before, false)}`);
    line(`  ${''.padEnd(18)}→ 2K: ${fmtTex(row.after2k)}${row.after1k ? `  ·  1K: ${fmtTex(row.after1k)}` : ''}`);
  }
  line('');
  line('ROZMIAR PLIKU');
  line(`  ${fmtSize(f.sizes.before)} → ${fmtSize(f.sizes.out2k)} (2K)${f.sizes.out1k ? ` · ${fmtSize(f.sizes.out1k)} (1K)` : ''}`);
  if (f.sizes.out2k > TARGET_2K_MB * 1048576) {
    line(`  ℹ powyżej celu ${TARGET_2K_MB} MB: kolor bazowy zostaje bajt w bajt (cienki cyjan bez ponownej kompresji), a mapa normalnych`);
    line('    jest kompresowana bez widocznej straty (zbliżenie w grze); stratna kompresja dałaby mniej, ale widać ją z bliska.');
  }
  line('');
  line('POWIERZCHNIA (tekstura bazowa, obszar UV)');
  line(`  Pokrycie UV: ${fmtDec(f.uvCoveragePct, 1)} % tekstury`);
  if (f.cyan) line(`  Cyjan klucza (maska gry): ${fmtDec(f.cyan.pctOfCovered, 3)} % obszaru UV (${fmtDec(f.cyan.pctOfTexture, 3)} % tekstury)`);
  if (f.hull) line(`  Jasność kadłuba: średnio ${fmtInt(f.hull.meanLuma)}/255, prawie czarne ${fmtDec(f.hull.darkPct, 1)} %`);
  line('');
  line('STANDARD MODELU (F10)');
  for (const v of verdicts(f)) line(`  ${v.mark} ${v.text}`);
  line('');
  line('HARDPOINTY');
  line(`  ${f.hardpoints.path}`);
  line(`  ${f.hardpoints.from === 'incoming' ? 'przeniesione z hardpoints/incoming/' : f.hardpoints.from === 'slot' ? 'zachowane z poprzedniej normalizacji' : 'nowe, z pomiaru'} — ${f.hardpoints.why}`);
  if (f.hardpoints.kept?.length) line(`  zachowane pola: ${f.hardpoints.kept.join(', ')}`);
  line('');
  if (f.written?.length) {
    line(f.dry ? 'ZAPISAŁBY' : 'ZAPISANE');
    for (const p of f.written) line(`  ${p}`);
  }
  if (f.archived?.length) {
    line('ARCHIWUM (stare pliki, poza git)');
    for (const p of f.archived) line(`  ${p}`);
  }
  line('');
  line('CO DALEJ (gra otwarta, konsola F12, polecenia bez cudzysłowów; po teście F5 BEZ zapisu)');
  line('  KOSMOS.debug.cvParade()  — 24 statki testowe w locie, każdy slot; ten model w swoim slocie');
  if (/(frigate|destroyer|battleship)$/.test(f.slot)) line(`  KOSMOS.debug.cvBattle(${f.slot.startsWith('warp_') ? '{warp: 1}' : ''})  — bitwa 10 na 10 tymi okrętami`);
  line('  Wieżyczki i okna kliknie się w Model Workshop (CV-1c).');
  return L.join('\n') + '\n';
}
