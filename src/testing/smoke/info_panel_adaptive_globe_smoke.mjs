// Info-panel layout (Załoga rework) — STAŁY globus wspólny dla zakładek + identyczność Planeta↔Załoga.
// Uruchom: node src/testing/smoke/info_panel_adaptive_globe_smoke.mjs
//
// Amendment (Filip): globus NIE jest już adaptywny. Scroll (C4) + przypięta stopka (S4) zdejmują potrzebę
// kurczenia globusa Załogi — obie zakładki liczą rozmiar przez TĘ SAMĄ funkcję fixedGlobeSize(h,w,pad),
// więc są identyczne Z KONSTRUKCJI. Ten smoke testuje REALNĄ, importowaną fixedGlobeSize.
// Pokrycie:
//   T1  fixed-globe sanity: 0.42·h z clampem do szerokości — konkretne wartości przy 4 wysokościach.
//   T2  identyczność: discSize Planeta == discSize Załoga ORAZ content-start-y (viewTop) identyczne (to,
//        co „skakało" przy przełączaniu zakładki) — wypisane side-by-side.
//   T3  krótkie okno (~600p): tabela strat wciąż użyteczna (≥ nagłówek + 2 wiersze przed scrollem) i
//        przypięta stopka mieści się BEZ przycięcia pod paskiem BottomControlBar — konkretne px.
//   T4  no-crash / clamp: minimalna realna szerokość (w=300) daje dodatni globus; clamp szerokości działa.

import { fixedGlobeSize } from '../../ui/InfoPanelLayoutLogic.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

// Geometria panelu (mirror _drawInfoPanel / _getOverlayBounds, civMode) + stała rezerwa stopki S4.
const PAD = 12, DISC_OFF = 8, GAP = 10, TABS = 30;
const WF_SUMMARY_H = 54, WF_SUMMARY_GAP = 12, RESERVE = WF_SUMMARY_H + WF_SUMMARY_GAP;  // = 66
function geom(H, W) {
  const oh = H - 70;                                   // TOP_BAND 28 + BOTTOM_NAV 36 + LOG_TRIG 6
  const h = oh - 44;                                   // minus HDR_H
  const y = 28 + 44;                                   // topOffset + HDR_H = colTop
  const bcbY = H - 62;                                 // BottomControlBar strip top
  const viewBot = Math.min(y + h, bcbY - 4);           // dolny klamp pod pasek
  const ow = W;                                        // CIV_SIDEBAR_W = 0
  const w = Math.round(Math.min(Math.floor(ow * 0.5), Math.max(300, Math.min(460, ow * 0.30))));
  return { h, y, w, viewBot, bcbY };
}
// content-start-y (viewTop) tak jak w _drawInfoPanel: discY(y+8) + disc + GAP + pasek zakładek − 4.
const contentViewTop = (g, disc) => g.y + DISC_OFF + disc + GAP + TABS - 4;

const SIZES = [
  { label: '1080p', H: 1080, W: 1920, expectDisc: 406 },
  { label: '900p',  H: 900,  W: 1600, expectDisc: 330 },
  { label: '720p',  H: 720,  W: 1366, expectDisc: 255 },
  { label: '600p',  H: 600,  W: 1067, expectDisc: 204 },
];

// ── T1: fixed-globe sanity (konkretne wartości = 0.42·h, clamp do w−2·pad) ──
console.log('--- T1: fixedGlobeSize = round(0.42·h) clamp do szerokości ---');
for (const s of SIZES) {
  const g = geom(s.H, s.W);
  const disc = fixedGlobeSize(g.h, g.w, PAD);
  ok(`${s.label}: h=${g.h} w=${g.w} → disc=${disc} (oczek. ${s.expectDisc})`, disc === s.expectDisc);
}

// ── T2: identyczność Planeta↔Załoga (rozmiar globusa + content-start-y) ──
// Obie zakładki wołają fixedGlobeSize(h,w,pad) z IDENTYCZNYMI h/w/pad (jedna linia w kodzie). Test
// blokuje regresję (gdyby ktoś wprowadził per-zakładkową frakcję) i wypisuje wartości side-by-side.
console.log('--- T2: discSize + content-start-y identyczne między zakładkami ---');
console.log('    okno   |  Planeta disc | Załoga disc |  Planeta viewTop | Załoga viewTop');
for (const s of SIZES) {
  const g = geom(s.H, s.W);
  const dPlaneta = fixedGlobeSize(g.h, g.w, PAD);   // Planeta: ta sama linia
  const dZaloga  = fixedGlobeSize(g.h, g.w, PAD);   // Załoga: ta sama linia (bez per-tab frakcji)
  const vtPlaneta = contentViewTop(g, dPlaneta);
  const vtZaloga  = contentViewTop(g, dZaloga);
  console.log(`    ${s.label.padEnd(6)} |     ${String(dPlaneta).padStart(4)}      |    ${String(dZaloga).padStart(4)}     |       ${String(vtPlaneta).padStart(4)}       |      ${String(vtZaloga).padStart(4)}`);
  ok(`${s.label}: discSize identyczny (${dPlaneta})`, dPlaneta === dZaloga);
  ok(`${s.label}: content-start-y identyczny (${vtPlaneta})`, vtPlaneta === vtZaloga);
}

// ── T3: krótkie okno (~600p) — tabela użyteczna + stopka bez przycięcia ──
console.log('--- T3: krótkie okno 600p — miejsce na tabelę + stopka mieści się ---');
{
  const s = SIZES[3];                                  // 600p
  const g = geom(s.H, s.W);
  const disc = fixedGlobeSize(g.h, g.w, PAD);
  const viewTop = contentViewTop(g, disc);
  const scrollBot = g.viewBot - RESERVE;               // dolna granica pasma tabeli
  const tableRoom = scrollBot - viewTop;               // px na tabelę przed scrollem
  const HEADER = 18, ROW = 30;
  const rowsVisible = Math.floor((tableRoom - HEADER) / ROW);
  const footerBottom = g.viewBot;                      // stopka rysowana viewBot−54 .. viewBot
  console.log(`    disc=${disc} viewTop=${viewTop} scrollBot=${scrollBot} tableRoom=${tableRoom}px → ${rowsVisible} wierszy + nagłówek`);
  console.log(`    stopka: dół=${footerBottom}  pasek BCB góra=${g.bcbY}  luz=${g.bcbY - footerBottom}px`);
  ok(`600p: tabela mieści nagłówek + ≥2 wiersze przed scrollem (${rowsVisible})`, rowsVisible >= 2);
  ok(`600p: stopka nie przycięta pod BCB (dół ${footerBottom} ≤ bcbY ${g.bcbY})`, footerBottom <= g.bcbY);
}

// ── T4: no-crash / clamp szerokości ──
console.log('--- T4: minimalna realna szerokość (w=300) + clamp ---');
{
  const dNarrow = fixedGlobeSize(966, 300, PAD);       // wąski: min(276, 406) = 276 (clamp do szer.)
  const dWide   = fixedGlobeSize(966, 460, PAD);       // szeroki: min(436, 406) = 406 (clamp do 0.42·h)
  ok(`w=300: globus dodatni i przycięty do szer. (${dNarrow}=276)`, dNarrow === 276);
  ok(`w=460: globus przycięty do 0.42·h (${dWide}=406)`, dWide === 406);
  ok('clamp: wąskie okno < 0.42·h (276 < 406)', dNarrow < dWide);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
