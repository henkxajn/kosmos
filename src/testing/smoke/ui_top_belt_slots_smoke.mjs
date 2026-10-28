// Keeper ARKUSZ UI, U0-3 (D-UI-12 + Findingi 474, 475, 476, 479, 481, 482; decyzja 1 (a); czip ⚔ — opcja 1):
// górna belka surowców na STAŁYCH komórkach + czip walk przy pasku zegara.
//
// Wykonaniowo: prawdziwe TopResourceDrawer / BottomControlBar / BottomBar / TopBar na atrapie ctx, której measureText
// liczy szerokości z TABELI GLIFÓW zmierzonej w Chrome 155 (100 px, addytywna — szerokość napisu = suma glifów, Δ 0;
// `kosmos-handover/ui-u0/results/glyph_table.json`) dla trzech fontów belki: Share Tech Mono (4 motywy ekranu
// tytułowego), Rajdhani (Neon Cyber — proporcjonalny), Space Mono (preset `default`, tylko F7). W = 1280, H = 720.
//   PINY (padają na kodzie sprzed U0-3):
//     F*  format liczby PL / EN (próg 10 000, kredyty z separatorem, delta do tooltipu, strzałka trendu) — 479,
//     A1  x tokenu k identyczny w KAŻDYM wierszu listy (4 kolonie o różnych liczbach) — 474,
//     A2  prawy brzeg kredytów wspólny dla wszystkich wierszy,
//     B*  dla każdego z trzech fontów: 17 tokenów + ▾N + kredyty 7-cyfrowe mieszczą się bez ucinania przy >1 kolonii,
//         komórki rozłączne, kredyty w całości przy prawym końcu, strefa nazwy ≥ 160 (Space Mono < 200) — 475,
//     E1  18 tokenów (plakietka puli hubu) + duże liczby: kredyty dalej w całości, ewentualnie znika TYLKO koniec listy,
//     N1  nazwa kolonii z wielokropkiem w zwężonej strefie (POP mieści się w strefie),
//     R*  strzałki ▲ / ▼ zamiast liczby delty; liczba delty w tooltipie wg języka (decyzja 1 (a)),
//     L*  liczby w belce wg języka (12,4k PL / 12.4k EN; 9 999 w całości),
//     M*  szerokość komórki = szablon AKTYWNEGO fontu, przeliczona po zmianie presetu (i z powrotem),
//     C*  czip walk: na lewo od paska zegara (nie przecina pasma belki ani klastra zegara), etykieta przez i18n,
//         klik → toggleMinimize, rząd stały — nie jedzie z kartą peek (ARKUSZ UI U3-0b: karta wyłączona, C6
//         przecelowane); BottomBar nie rysuje już czipu w górnej belce — 481, 482,
//     T1  TopBar.isOver w civMode kończy się na belce 28 px — 476.
//   WYMAGANIA (B1, B4, B4b — „17 tokenów + ▾N + kredyty mieszczą się"): sprawdzane na nowym kodzie; w Share Tech Mono
//   i Rajdhani prawdziwe także przed U0-3 (stary układ skracał kredyty do „8.9M" i przytulał komórki), w Space Mono
//   padają na starym kodzie. Defekty 474 / 475 odróżniają A1, A2, B2, B3.
//   KONTROLE (zielone po obu stronach): K*. NIEZMIENNIKI (z natury prawdziwe także przed U0-3): B5 podłoga strefy
//   nazwy 160, E2 przepełnienie zrzuca wyłącznie koniec listy.
// Uruchom: node src/testing/smoke/ui_top_belt_slots_smoke.mjs
import '../headless/env.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };

// Tabela glifów (px przy 100 px) — pomiar measureText w Chrome 155, `kosmos-handover/ui-u0/results/glyph_table.json`.
const GLYPHS = {
  stm: {
    "0":54,"1":54,"2":54,"3":54,"4":54,"5":54,"6":54,"7":54,"8":54,"9":54,",":54,".":54," ":54,"+":54,"-":54,
    "k":54,"M":54,"G":54,"/":54,"(":54,")":54,"[":54,"]":54,"|":54,":":54,"%":54,"#":54,"…":54,"—":54,"–":54,
    "·":54,"₡":54.98,"a":54,"b":54,"c":54,"d":54,"e":54,"f":54,"g":54,"h":54,"i":54,"j":54,"l":54,"m":54,"n":54,
    "o":54,"p":54,"q":54,"r":54,"s":54,"t":54,"u":54,"v":54,"w":54,"x":54,"y":54,"z":54,"A":54,"B":54,"C":54,
    "D":54,"E":54,"F":54,"H":54,"I":54,"J":54,"K":54,"L":54,"N":54,"O":54,"P":54,"Q":54,"R":54,"S":54,"T":54,
    "U":54,"V":54,"W":54,"X":54,"Y":54,"Z":54,"ą":54.98,"ć":54.98,"ę":54.98,"ł":54.98,"ń":54.98,"ó":54,"ś":54.98,
    "ź":54.98,"ż":54.98,"Ą":54.98,"Ć":54.98,"Ę":54.98,"Ł":54.98,"Ń":54.98,"Ó":54,"Ś":54.98,"Ź":54.98,"Ż":54.98,
    "▲":54.98,"▼":54.98,"▴":54.98,"▾":54.98,"▸":54.98,"⚠":86.133,"⚔":76.123,"👤":137.305,"🔬":137.305,"⚡":137.305,
    "⭐":137.305,"🪙":137.305,"🔔":137.305,"☰":89.795,"▶":86.133,"⏸":100,
  },
  raj: {
    "0":51.4,"1":31.7,"2":47.8,"3":49.6,"4":52,"5":48.2,"6":49.7,"7":38,"8":51.9,"9":49.7,",":19.1,".":19.1,
    " ":26.7,"+":52.3,"-":31.2,"k":43.1,"M":69.6,"G":53.9,"/":39.6,"(":28.3,")":28.3,"[":28.7,"]":28.7,"|":20.7,
    ":":19.1,"%":71.7,"#":67.7,"…":59.1,"—":53.7,"–":40.8,"·":20.7,"₡":72.217,"a":50.2,"b":50.4,"c":39.4,"d":50.4,
    "e":49.2,"f":30.3,"g":50.6,"h":50.7,"i":21,"j":21,"l":21,"m":76.9,"n":50.7,"o":49.6,"p":50.4,"q":50.2,"r":31.3,
    "s":43.1,"t":34.7,"u":50.7,"v":41.6,"w":68.3,"x":41.3,"y":45.9,"z":40.5,"A":53.3,"B":54.6,"C":54.2,"D":55.7,
    "E":48.1,"F":45.9,"H":57,"I":23,"J":49.9,"K":53,"L":45.1,"N":57.9,"O":55.3,"P":52.4,"Q":55.6,"R":53.4,"S":56.2,
    "T":42,"U":55.2,"V":50,"W":79.4,"X":50.4,"Y":49.3,"Z":48.2,"ą":55.615,"ć":50,"ę":55.615,"ł":22.217,"ń":55.615,
    "ó":49.6,"ś":50,"ź":50,"ż":50,"Ą":66.699,"Ć":72.217,"Ę":66.699,"Ł":55.615,"Ń":72.217,"Ó":55.3,"Ś":66.699,
    "Ź":61.084,"Ż":61.084,"▲":98.975,"▼":98.975,"▴":83.545,"▾":83.545,"▸":83.545,"⚠":86.133,"⚔":76.123,
    "👤":137.305,"🔬":137.305,"⚡":137.305,"⭐":137.305,"🪙":137.305,"🔔":137.305,"☰":89.795,"▶":86.133,"⏸":100,
  },
  spm: {
    "0":61.2,"1":61.2,"2":61.2,"3":61.2,"4":61.2,"5":61.2,"6":61.2,"7":61.2,"8":61.2,"9":61.2,",":61.2,".":61.2,
    " ":61.2,"+":61.2,"-":61.2,"k":61.2,"M":61.2,"G":61.2,"/":61.2,"(":61.2,")":61.2,"[":61.2,"]":61.2,"|":61.2,
    ":":61.2,"%":61.2,"#":61.2,"…":61.2,"—":61.2,"–":61.2,"·":61.2,"₡":54.98,"a":61.2,"b":61.2,"c":61.2,"d":61.2,
    "e":61.2,"f":61.2,"g":61.2,"h":61.2,"i":61.2,"j":61.2,"l":61.2,"m":61.2,"n":61.2,"o":61.2,"p":61.2,"q":61.2,
    "r":61.2,"s":61.2,"t":61.2,"u":61.2,"v":61.2,"w":61.2,"x":61.2,"y":61.2,"z":61.2,"A":61.2,"B":61.2,"C":61.2,
    "D":61.2,"E":61.2,"F":61.2,"H":61.2,"I":61.2,"J":61.2,"K":61.2,"L":61.2,"N":61.2,"O":61.2,"P":61.2,"Q":61.2,
    "R":61.2,"S":61.2,"T":61.2,"U":61.2,"V":61.2,"W":61.2,"X":61.2,"Y":61.2,"Z":61.2,"ą":54.98,"ć":54.98,"ę":54.98,
    "ł":54.98,"ń":54.98,"ó":61.2,"ś":54.98,"ź":54.98,"ż":54.98,"Ą":54.98,"Ć":54.98,"Ę":54.98,"Ł":54.98,"Ń":54.98,
    "Ó":61.2,"Ś":54.98,"Ź":54.98,"Ż":54.98,"▲":54.98,"▼":54.98,"▴":54.98,"▾":54.98,"▸":54.98,"⚠":86.133,"⚔":76.123,
    "👤":137.305,"🔬":137.305,"⚡":137.305,"⭐":137.305,"🪙":137.305,"🔔":137.305,"☰":89.795,"▶":86.133,"⏸":100,
  },
};

const famOf = (font) => /Rajdhani/.test(font) ? 'raj' : /Space Mono/.test(font) ? 'spm' : 'stm';
function measure(text, font) {
  const px = parseFloat(font) || 10;
  const tb = GLYPHS[famOf(font)];
  let w = 0;
  for (const ch of String(text)) w += (tb[ch] ?? tb['0']);
  return w * px / 100;
}
function recCtx() {
  const st = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif', textAlign: 'left',
    textBaseline: 'alphabetic', globalAlpha: 1, filter: 'none', globalCompositeOperation: 'source-over',
    shadowColor: 'transparent', shadowBlur: 0, shadowOffsetY: 0 };
  const calls = [];
  return new Proxy(st, {
    get(t, p) {
      if (p === 'calls') return calls;
      if (p in t) return t[p];
      if (p === 'measureText') return (s) => ({ width: measure(s, t.font) });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      return (...args) => { calls.push({ op: p, args, fill: t.fillStyle, font: t.font, align: t.textAlign }); };
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}
const texts = (ctx) => ctx.calls.filter(c => c.op === 'fillText').map(c => ({ s: String(c.args[0]), x: c.args[1], y: c.args[2], font: c.font, fill: c.fill, align: c.align }));
function ext(tx) {
  const w = measure(tx.s, tx.font);
  return tx.align === 'right' ? [tx.x - w, tx.x] : tx.align === 'center' ? [tx.x - w / 2, tx.x + w / 2] : [tx.x, tx.x + w];
}

// ── Moduły gry ──────────────────────────────────────────────────────────────────────────────────
const { TopResourceDrawer } = await import('../../ui/TopResourceDrawer.js');
const { BottomControlBar } = await import('../../ui/BottomControlBar.js');
const { BottomBar } = await import('../../ui/BottomBar.js');
const { TopBar } = await import('../../ui/TopBar.js');
const { THEME, PRESET_THEMES, applyPreset } = await import('../../config/ThemeConfig.js');
const { setLocale, t } = await import('../../i18n/i18n.js');
const { MINED_RESOURCES, HARVESTED_RESOURCES } = await import('../../data/ResourcesData.js');
const { bottomNavBarRect, navSlotLayout } = await import('../../ui/BottomNavBarLogic.js');
const { NAV_GROUPS } = await import('../../ui/CivPanelDrawer.js');
let FL = null;
try { FL = await import('../../ui/TopBarFormatLogic.js'); } catch (e) { console.log('  (brak TopBarFormatLogic:', e.message.split('\n')[0], ')'); }
const fl = (name, ...a) => { try { return FL?.[name]?.(...a); } catch (e) { return `ERR ${e.message}`; } };

// ⚠ PRZECELOWANE (ARKUSZ HUD paczka B, Finding 564): pasmo belki do prawej krawędzi okna — dawne wcięcie `EDGE_R = 6`
//   (wyzwalacz wysuwanego outlinera) usunięte z `TopResourceDrawer`, więc chevron „▾N” i kredyty kończą się na W.
const W = 1280, H = 720, EDGE_R = 0, BAND_H = 28;
const RES = [...Object.keys(MINED_RESOURCES), ...Object.keys(HARVESTED_RESOURCES), 'fuel'];
const ORDER = [...RES, 'research', 'energy', 'prosperity', 'hubpool'];
const PRESET = { stm: 'ambient_1', raj: 'neon_cyber', spm: 'default' };
const FONT_LABEL = { stm: 'Share Tech Mono', raj: 'Rajdhani', spm: 'Space Mono' };
const usePreset = (k) => { applyPreset(PRESET_THEMES[PRESET[k]]); };

function colony(id, name, o = {}) {
  const snap = {};
  for (const k of RES) snap[k] = typeof o.res === 'object' ? (o.res[k] ?? 0) : (o.res ?? 100);
  snap._perYear = o.delta ?? {};
  snap._energy = { production: 100, consumption: 80, balance: o.energy ?? 20 };
  return { planetId: id, name, systemId: 'sys_home', credits: o.credits ?? 1234,
    resourceSystem: { inventorySnapshot: () => snap, research: { amount: o.research ?? 10, perYear: o.researchPerYear ?? 0 } },
    civSystem: { population: 20, freePops: 2, employed: 18, _lockedPops: 0 },
    prosperitySystem: o.noProsp ? null : { prosperity: o.prosp ?? 55, targetProsperity: o.prospTarget ?? (o.prosp ?? 55) } };
}
function scene(cols, extra = {}) {
  window.KOSMOS = { civMode: true, uiScale: 1, uiManager: { _dirty: false, _timeState: { isPaused: true, multiplierIndex: 1, displayText: '03/06/120' } },
    colonyManager: { activePlanetId: cols[0].planetId, getAllColonies: () => cols, getColony: (id) => cols.find(c => c.planetId === id) ?? null,
      switchActiveColony() {} },
    starSystemManager: { activeSystemId: 'sys_home', switchActiveSystem() {} },
    overlayManager: { openPanel() {}, active: null, isAnyOpen: () => false },
    notificationCenter: { getActiveCount: () => 0 },
    ...extra };
}
function frames(d, n = 30) { let c = null; for (let i = 0; i < n; i++) { c = recCtx(); d.draw(c, W, H); } return c; }
function rowsOf(d) {
  const rows = new Map();
  for (const h of d._hitItems) {
    const key = h.tip?.id ?? h.tip?.kind;
    if (!key || key === 'pop') continue;
    if (!rows.has(h.y)) rows.set(h.y, []);
    rows.get(h.y).push({ key, x: h.x, w: h.w });
  }
  return rows;
}

// ═══ F — format liczb (czysty moduł) ═══════════════════════════════════════════════════════════
console.log('\n── F: format liczb PL / EN ──');
const FT = [
  ['fmtBeltValue', [12400, 'pl'], '12,4k'], ['fmtBeltValue', [12400, 'en'], '12.4k'],
  ['fmtBeltValue', [9999, 'pl'], '9999'], ['fmtBeltValue', [9999, 'en'], '9999'],
  ['fmtBeltValue', [523.74, 'pl'], '523,7'], ['fmtBeltValue', [523.74, 'en'], '523.7'],
  ['fmtBeltValue', [10000, 'pl'], '10,0k'], ['fmtBeltValue', [99950, 'pl'], '100k'],
  ['fmtBeltValue', [999500, 'pl'], '1,0M'], ['fmtBeltValue', [1234567, 'en'], '1.2M'],
  ['fmtBeltFull', [1234567, 'pl'], '1 234 567'], ['fmtBeltFull', [8888888, 'en'], '8 888 888'],
  ['fmtBeltSigned', [22, 'pl'], '+22'], ['fmtBeltSigned', [-1500, 'pl'], '-1500'], ['fmtBeltSigned', [0, 'pl'], '0'],
  ['fmtBeltSigned', [-12345, 'en'], '-12.3k'],
  ['fmtBeltDelta', [1.24, 'pl'], '+1,2'], ['fmtBeltDelta', [-0.44, 'en'], '-0.4'],
  ['trendGlyph', [0.2, 0.05], '▲'], ['trendGlyph', [-0.2, 0.05], '▼'], ['trendGlyph', [0.01, 0.05], null],
];
for (const [fn, args, want] of FT) {
  const got = fl(fn, ...args);
  ok(got === want, `F ${fn}(${args.join(', ')}) = ${JSON.stringify(got)} (oczekiwane ${JSON.stringify(want)})`);
}

// ═══ A — kolumny równe w każdym wierszu (474) ═══════════════════════════════════════════════════
console.log('\n── A: 4 kolonie o różnych liczbach, lista rozwinięta (Share Tech Mono) ──');
usePreset('stm');
const big = (v) => Object.fromEntries(RES.map(k => [k, v]));
const A_COLS = [
  colony('a1', 'Alfa', { res: big(3), credits: 10, energy: 5, prosp: 12 }),
  colony('a2', 'Beta', { res: big(9999), credits: 9999, energy: -150, prosp: 64 }),
  colony('a3', 'Gamma', { res: big(12400), credits: 123456, energy: 2200, prosp: 100 }),
  colony('a4', 'Delta', { res: big(1234567), credits: 9876543, energy: -12345, prosp: 7 }),
];
scene(A_COLS);
const dA = new TopResourceDrawer();
frames(dA, 2);
dA.handleClick(700, 14);
frames(dA, 40);
const rowsA = rowsOf(dA);
ok(rowsA.size === 4, `K1 [kontrola] 4 wiersze z tokenami (aktywny + 3 rozwinięte) — ${rowsA.size}`);
const allRows = [...rowsA.values()];
let misaligned = 0, compared = 0;
for (const k of ORDER) {
  const xs = allRows.map(r => r.find(c => c.key === k)?.x).filter(x => x != null);
  if (xs.length !== allRows.length) continue;
  compared++;
  if (Math.max(...xs) - Math.min(...xs) > 1e-6) misaligned++;
}
ok(compared >= 16 && misaligned === 0, `A1 x tokenu k identyczny w każdym wierszu — porównane ${compared} tokenów, rozjechane ${misaligned}`);
const crRights = allRows.map(r => r.find(c => c.key === 'credits')).filter(Boolean).map(c => c.x + c.w);
ok(crRights.length === 4 && Math.max(...crRights) - Math.min(...crRights) < 1e-6, `A2 prawy brzeg kredytów wspólny we wszystkich wierszach — ${crRights.map(v => v.toFixed(1)).join(' / ')}`);

// ═══ B — budżet: 17 tokenów + ▾N + kredyty 7-cyfrowe dla trzech fontów (475) ════════════════════
// Delty jak w prawdziwej grze (zapis Polonia r79: strzałka przy prawie każdym surowcu) — bez nich stary układ
// („przytulanie" bez liczb delty) jest ciasny i scena nie odróżnia kodów.
const BIG_DELTA = Object.fromEntries(RES.map((k, i) => [k, i % 2 ? -4.5 : 12.3]));
const BIG_COLS = () => [0, 1, 2, 3].map(i => colony(`b${i}`, ['Alfa', 'Beta', 'Gamma', 'Delta'][i],
  { res: big(88888), delta: BIG_DELTA, credits: 8888888, energy: -12345, prosp: 100, prospTarget: 90, research: 22222, researchPerYear: 3.2 }));
for (const f of ['stm', 'raj', 'spm']) {
  console.log(`\n── B: ${FONT_LABEL[f]} — 4 kolonie, duże liczby, kredyty 8 888 888 ──`);
  usePreset(f);
  scene(BIG_COLS());
  const d = new TopResourceDrawer();
  const c = frames(d, 6);
  const row = rowsOf(d).get(3) ?? [];
  const regular = row.filter(r => r.key !== 'credits');
  const cr = row.find(r => r.key === 'credits');
  ok(regular.length === 16 && !!cr, `B1 [wymaganie] ${FONT_LABEL[f]}: 16 zwykłych tokenów + kredyty w aktywnym wierszu — ${regular.length} + ${cr ? 1 : 0}`);
  const tx = texts(c).filter(x => x.y < BAND_H);
  const crTxt = tx.find(x => x.s === '8 888 888');
  ok(!!crTxt, `B2 ${FONT_LABEL[f]}: kredyty narysowane w całości („8 888 888")`);
  const hintW = d._metrics?.hintW ?? 16;
  const chevronLeft = (W - EDGE_R) - hintW;
  const crRight = crTxt ? ext(crTxt)[1] : NaN;
  ok(crTxt && Math.abs(crRight - (chevronLeft - 4)) < 1e-6, `B3 ${FONT_LABEL[f]}: kredyty przypięte do prawego końca wiersza (prawy brzeg ${crRight.toFixed?.(1)} = ${(chevronLeft - 4).toFixed(1)})`);
  const sorted = [...regular].sort((a, b) => a.x - b.x);
  let overlaps = 0;
  for (let i = 1; i < sorted.length; i++) if (sorted[i - 1].x + sorted[i - 1].w > sorted[i].x + 1e-6) overlaps++;
  const lastEnd = sorted.length ? sorted[sorted.length - 1].x + sorted[sorted.length - 1].w : 0;
  ok(overlaps === 0 && cr && lastEnd <= cr.x + 1e-6 && cr.x + cr.w <= chevronLeft + 1e-6,
    `B4 [wymaganie] ${FONT_LABEL[f]}: komórki rozłączne, ostatnia kończy się przed kredytami (${lastEnd.toFixed(1)} ≤ ${cr?.x.toFixed(1)}), kredyty przed chevronem`);
  const glyph = tx.filter(x => /^▾/.test(x.s));
  const textOver = tx.filter(x => !/^[▾▴]/.test(x.s) && ext(x)[1] > chevronLeft + 1e-6);
  ok(glyph.length === 1 && textOver.length === 0, `B4b [wymaganie] ${FONT_LABEL[f]}: chevron „${glyph[0]?.s}" i żaden tekst pod nim (wychodzi: ${textOver.length})`);
  const leftW = d._colonyRects[0]?.w ?? 0;
  ok(leftW >= 160, `B5 [niezmiennik] ${FONT_LABEL[f]}: strefa nazwy ≥ 160 (podłoga) — ${leftW}`);
  if (f === 'spm') ok(leftW < 200, `B6 Space Mono: strefa nazwy zwężona, bo budżet ujemny — ${leftW} (< 200)`);
  else ok(leftW === 200, `K2 [kontrola] ${FONT_LABEL[f]}: strefa nazwy bez zwężania — ${leftW}`);
  // ARKUSZ HUD paczka B (Finding 564) — pasmo belki (strefa aktywnego wiersza) = W okna.
  ok(d._triggerRect?.x === 0 && d._triggerRect?.w === W, `B7 SEDNO (564) ${FONT_LABEL[f]}: pasmo belki od 0 do W (jest x ${d._triggerRect?.x}, w ${d._triggerRect?.w})`);
}

// ═══ E — 18 tokenów (plakietka puli hubu): kredyty dalej w całości ═══════════════════════════
console.log('\n── E: Space Mono, 18 tokenów (plakietka puli), duże liczby ──');
usePreset('spm');
scene(BIG_COLS(), { systemPoolService: { getHubLinkInfo: (id) => ({ status: 'linked', anchorPlanetId: id, anchorName: 'X' }), getPoolSnapshot: () => null } });
const dE = new TopResourceDrawer();
const cE = frames(dE, 6);
const rowE = rowsOf(dE).get(3) ?? [];
const keysE = rowE.filter(r => r.key !== 'credits').sort((a, b) => a.x - b.x).map(r => r.key);
const prefix = ORDER.slice(0, keysE.length);
ok(texts(cE).some(x => x.s === '8 888 888') && rowE.some(r => r.key === 'credits'),
  `E1 kredyty w całości przy 18 tokenach — widocznych zwykłych ${keysE.length}/17`);
ok(keysE.length >= 16 && keysE.every((k, i) => k === prefix[i]), `E2 [niezmiennik] znika najwyżej KONIEC listy (widoczne = początek kolejności: …${keysE.slice(-2).join(', ')})`);

// ═══ N — nazwa z wielokropkiem ═════════════════════════════════════════════════════════════════
console.log('\n── N: długa nazwa w zwężonej strefie (Space Mono) ──');
usePreset('spm');
const nCols = BIG_COLS(); nCols[0].name = 'Zjednoczona Federacja Planetarna';
scene(nCols);
const dN = new TopResourceDrawer();
const cN = frames(dN, 4);
const leftN = dN._colonyRects[0]?.w ?? 0;
const zoneTexts = texts(cN).filter(x => x.y < BAND_H && x.x < leftN);
const nameTx = zoneTexts.find(x => x.x === 8);
const zoneEnd = Math.max(...zoneTexts.map(x => ext(x)[1]));
ok(!!nameTx && nameTx.s.endsWith('…') && zoneEnd <= leftN + 1e-6,
  `N1 nazwa z wielokropkiem („${nameTx?.s}"), nazwa + POP mieszczą się w strefie ${leftN} (koniec ${zoneEnd.toFixed(1)})`);

// ═══ R — strzałki trendu zamiast liczby delty; delta w tooltipie wg języka ═════════════════════
console.log('\n── R: strzałki trendu (Share Tech Mono, PL) ──');
usePreset('stm');
setLocale('pl');
const R_COLS = [colony('r1', 'Alfa', { res: 500, delta: { C: 3, Fe: -3, Si: 0.01 } }), colony('r2', 'Beta')];
scene(R_COLS);
const dR = new TopResourceDrawer();
const cR = frames(dR, 4);
const txR = texts(cR).filter(x => x.y < BAND_H);
const up = txR.filter(x => x.s === '▲'), down = txR.filter(x => x.s === '▼');
ok(up.length === 1 && up[0].fill === THEME.success && down.length === 1 && down[0].fill === THEME.danger,
  `R1 ▲ (kolor zysku) przy C, ▼ (kolor straty) przy Fe, brak strzałki przy Si — ▲${up.length} ▼${down.length}`);
const signed = txR.filter(x => /^[+-]\d/.test(x.s));
ok(signed.length === 1 && signed[0].s === '+20', `R2 w belce brak liczb delty — jedyna liczba ze znakiem to bilans energii: ${signed.map(x => x.s).join(', ')}`);
const hitC = dR._hitItems.find(h => h.tip?.id === 'C' && h.y === 3);
if (hitC) dR.handleMouseMove(hitC.x + 2, hitC.y + 2);
const tipTxt = (dR._hoverTip?.lines ?? []).map(l => l.text).join(' | ');
ok(tipTxt.includes(t('ui.change', '+3,0')), `R3 liczba delty w tooltipie wg języka („${t('ui.change', '+3,0')}"): ${tipTxt.slice(0, 90)}`);

// ═══ L — liczby w belce wg języka (479) ═════════════════════════════════════════════════════════
console.log('\n── L: format w belce PL / EN ──');
const L_COLS = () => [colony('l1', 'Alfa', { res: { C: 12400, Fe: 9999, Si: 523.7 } }), colony('l2', 'Beta')];
for (const [loc, k124, k523] of [['pl', '12,4k', '523,7'], ['en', '12.4k', '523.7']]) {
  setLocale(loc);
  scene(L_COLS());
  const d = new TopResourceDrawer();
  const tx = texts(frames(d, 3)).filter(x => x.y < BAND_H).map(x => x.s);
  ok(tx.includes(k124) && tx.includes('9999') && tx.includes(k523), `L ${loc.toUpperCase()}: 12 400 → „${k124}", 9 999 → „9999", 523,7 → „${k523}"`);
}
setLocale('pl');

// ═══ M — szerokość komórki z szablonu AKTYWNEGO fontu, przeliczana po zmianie presetu ═════════════
console.log('\n── M: zmiana presetu fontu (STM → Space Mono → STM) ──');
const cellOf = (d) => { const r = (rowsOf(d).get(3) ?? []).filter(c => c.key !== 'credits').sort((a, b) => a.x - b.x); return r.length > 1 ? r[1].x - r[0].x : NaN; };
// Oczekiwana komórka PNG liczona NIEZALEŻNIE z tabeli glifów: najszersza cyfra fontu podstawiona do realnych postaci
// wartości (reguła właściciela: najszerszy szablon) — w monospace = 5 znaków, w Rajdhani wygrywa „DDD,D".
const expectCell = (f) => { const s = f === 'raj' ? 10 : 9, n = f === 'raj' ? 12 : 11; const tb = GLYPHS[f];
  const D = '0123456789'.split('').reduce((a, c) => (tb[c] > tb[a] ? c : a), '0');
  const w = (str) => [...str].reduce((a, ch) => a + tb[ch], 0) * n / 100;
  const val = Math.max(...['DD,Dk', 'DD.Dk', 'DDDD', 'DDD,D', 'DDD.D', 'DDDk', 'D,DM', 'D.DM'].map(tp => w(tp.replace(/D/g, D))));
  return 16 + 2 + val + 2 + Math.max(tb['▲'], tb['▼']) * s / 100 + 3; };
scene(BIG_COLS());
const dM = new TopResourceDrawer();
usePreset('stm'); frames(dM, 3); const m1 = cellOf(dM);
usePreset('spm'); frames(dM, 3); const m2 = cellOf(dM);
usePreset('raj'); frames(dM, 3); const m3 = cellOf(dM);
usePreset('stm'); frames(dM, 3); const m4 = cellOf(dM);
ok(Math.abs(m1 - expectCell('stm')) < 1e-6 && Math.abs(m4 - m1) < 1e-6, `M1 Share Tech Mono: komórka PNG = szablon ${expectCell('stm').toFixed(2)} (zmierzone ${m1.toFixed?.(2)}, po powrocie ${m4.toFixed?.(2)})`);
ok(Math.abs(m2 - expectCell('spm')) < 1e-6, `M2 Space Mono (F7): komórka = szablon ${expectCell('spm').toFixed(2)} (zmierzone ${m2.toFixed?.(2)})`);
ok(Math.abs(m3 - expectCell('raj')) < 1e-6, `M3 Rajdhani: komórka = szablon z NAJSZERSZĄ cyfrą ${expectCell('raj').toFixed(2)} (zmierzone ${m3.toFixed?.(2)})`);

// ═══ C — czip walk przy pasku zegara (481, 482) ═════════════════════════════════════════════════
const rect = bottomNavBarRect(W, H);
const slots = navSlotLayout(rect, NAV_GROUPS.length);
const prev = slots[slots.length - 2], last = slots[slots.length - 1];
const inter = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
for (const [f, loc] of [['stm', 'pl'], ['raj', 'en'], ['spm', 'pl']]) {
  console.log(`\n── C: czip walk — ${FONT_LABEL[f]}, ${loc.toUpperCase()} ──`);
  usePreset(f); setLocale(loc);
  const toggles = [];
  scene([colony('c1', 'Alfa'), colony('c2', 'Beta')], {
    combatHud: { isMinimized: () => true, hasActiveEncounters: () => true, toggleMinimize: () => toggles.push(1) },
    deepSpaceCombatSystem: { listActive: () => [{}, {}, {}] },
  });
  const bar = new BottomControlBar();
  bar.draw(recCtx(), W, H, window.KOSMOS.uiManager._timeState);
  const chip = bar._chipRect, bg = bar._bgRect;
  ok(!!chip && chip.label === t('combat.hudChipN', 3), `C1 czip widoczny, etykieta przez i18n: „${chip?.label}"`);
  ok(!!chip && !inter(chip, { x: 0, y: 0, w: W, h: BAND_H }), `C2 czip nie przecina pasma górnej belki (y ${chip?.y})`);
  const cluster = [bar._bellRect, bar._menuRect, bar._playRect, ...bar._speedRects, bg];
  ok(!!chip && !cluster.some(r => inter(chip, r)) && chip.x + chip.w <= bg.x - 4 + 1e-6 && chip.x >= prev.x,
    `C3 czip na lewo od paska zegara, nad przedostatnim slotem: x ${chip?.x}…${chip ? chip.x + chip.w : '?'} ≤ ${bg.x - 4}, ≥ ${prev.x}`);
  ok(!!chip && chip.y === bg.y && chip.h === bg.h, `C4 czip w tym samym rzędzie co pasek zegara (y ${chip?.y} = ${bg.y})`);
  const cx = chip ? chip.x + chip.w / 2 : -1, cy = chip ? chip.y + chip.h / 2 : -1;
  const r1 = bar.handleClick(cx, cy);
  ok(r1 === true && toggles.length === 1 && bar.isOver(cx, cy), `C5 klik w czip → toggleMinimize (${toggles.length}×), blokada kamery nad czipem`);
  const dr = new TopResourceDrawer(); frames(dr, 2);
  ok(!!chip && dr.handleClick(cx, cy) === false && !dr.isOver(cx, cy), 'C5b pasmo belki nie pochłania kliku w czip (czip poza prostokątem pasma — 482)');
}
setLocale('pl'); usePreset('stm');

// ⚠ PRZECELOWANIE (ARKUSZ UI U3-0b, decyzja właściciela 2026-10-19 — karty peek WYŁĄCZONE bez zamiennika): C6 pinowało
//   „czip i pasek zegara jadą w górę z kartą peek swojego slotu”. Karty nie ma, więc rząd jest STAŁY — tuż nad paskiem
//   nawigacji. Ta sama scena (atrapa karty zgłaszająca górę 500 / 450) — teraz NIC się nie przesuwa.
console.log('\n── C6: rząd czipu i paska zegara stały — bez karty peek (U3-0b) ──');
const prevPrimary = NAV_GROUPS[NAV_GROUPS.length - 2].primary, lastPrimary = NAV_GROUPS[NAV_GROUPS.length - 1].primary;
const peekAt = { [prevPrimary]: null, [lastPrimary]: null };
scene([colony('c1', 'Alfa')], {
  combatHud: { isMinimized: () => true, hasActiveEncounters: () => true, toggleMinimize() {} },
  deepSpaceCombatSystem: { listActive: () => [{}] },
  bottomNavBar: { _peek: { peekTopY: (g) => peekAt[g] ?? null } },
});
const barP = new BottomControlBar();
barP.draw(recCtx(), W, H, window.KOSMOS.uiManager._timeState);
const baseY = barP._bgRect.y;
ok(baseY === H - 6 - 36 - 20 && barP._chipRect?.y === baseY,
  `C6-0 KONTROLA: rząd tuż nad paskiem nawigacji (y ${baseY} = H − 6 − 36 − 20), czip w tym samym rzędzie (${barP._chipRect?.y})`);
peekAt[prevPrimary] = 500;
barP.draw(recCtx(), W, H, window.KOSMOS.uiManager._timeState);
ok(barP._chipRect?.y === baseY && barP._bgRect.y === baseY,
  `C6a atrapa karty przedostatniego slotu (góra 500) → czip zostaje (${barP._chipRect?.y}), pasek zegara też (${barP._bgRect.y}) — dawniej czip 480`);
peekAt[prevPrimary] = null; peekAt[lastPrimary] = 450;
barP.draw(recCtx(), W, H, window.KOSMOS.uiManager._timeState);
ok(barP._chipRect?.y === baseY && barP._bgRect.y === baseY,
  `C6b atrapa karty ostatniego slotu (góra 450) → pasek zegara zostaje (${barP._bgRect.y}) — dawniej 430`);
const srcBCB = readFileSync(fileURLToPath(new URL('../../ui/BottomControlBar.js', import.meta.url)), 'utf8');
const codeBCB = srcBCB.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
ok(/_stripTop\(H\) \{/.test(codeBCB) && (codeBCB.match(/this\._stripTop\(H\)/g) ?? []).length === 2 && !/peekTopY|_peek\b/.test(codeBCB),
  'C6c czip i pasek zegara liczą rząd JEDNYM `_stripTop(H)` (dwa wywołania, bez parametru slotu), zero odczytu karty peek w pliku');

console.log('\n── C7: BottomBar nie rysuje już czipu w górnej belce ──');
scene([colony('c1', 'Alfa')], {
  combatHud: { isMinimized: () => true, hasActiveEncounters: () => true, toggleMinimize() { throw new Error('toggle z BottomBar'); } },
  deepSpaceCombatSystem: { listActive: () => [{}, {}] },
});
const bb = new BottomBar();
const cBB = recCtx();
bb.draw(cBB, W, H, { stability: null, logSystem: null, logEntriesFallback: [], audioEnabled: true, musicEnabled: true, autoSlow: true, civMode: true });
const bbChip = texts(cBB).filter(x => x.s.includes('⚔'));
let hitOld = null; try { hitOld = bb._hitTestTopButtons(W - 45, 16); } catch (e) { hitOld = `ERR ${e.message}`; }
ok(bbChip.length === 0 && hitOld === false, `C7 BottomBar: zero czipu w górnej belce (${bbChip.length}), stare miejsce czipu nie reaguje (${hitOld})`);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const srcBB = readFileSync(fileURLToPath(new URL('../../ui/BottomBar.js', import.meta.url)), 'utf8');
ok(!/Walki|Battles/.test(strip(srcBB)) && !/Walki|Battles/.test(codeBCB), 'C8 etykieta czipu bez literału w kodzie BottomBar / BottomControlBar (tylko i18n)');

// ═══ T — TopBar.isOver kończy się na belce (476) ═══════════════════════════════════════════════
console.log('\n── T: blokada kamery nad belką ──');
const tb = new TopBar();
window.KOSMOS.civMode = true;
ok(tb.isOver(500, 28) === true && tb.isOver(500, 30) === false, `T1 civMode: y 28 → ${tb.isOver(500, 28)}, y 30 → ${tb.isOver(500, 30)} (dawny martwy pas 28–46)`);
window.KOSMOS.civMode = false;
ok(tb.isOver(500, 40) === true, `K4 [kontrola] tryb Generator (pasek 46 px): y 40 → ${tb.isOver(500, 40)}`);
window.KOSMOS.civMode = true;
const dT = new TopResourceDrawer(); scene([colony('t1', 'Alfa'), colony('t2', 'Beta')]); frames(dT, 2);
ok(dT.handleClick(640, 300) === false && dT.handleClick(640, 40) === false, 'K5 [kontrola] pasmo belki nie pochłania kliku poza swoim prostokątem (mapa, pas pod belką)');

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
