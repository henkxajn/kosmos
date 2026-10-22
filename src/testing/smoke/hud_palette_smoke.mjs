// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — ARKUSZ HUD H0-1: role kolorów HUD z motywu + epoka motywu (HUD_PLAN.md §2.10, §4.1; D-HUD-2, D-HUD-15).
// Uruchom: node src/testing/smoke/hud_palette_smoke.mjs
//
// Role (D-HUD-2, reguła B2 z pomiaru fazy A): primary = `accent`, dim = `textDim`, foreign = `textPrimary`, alert =
// `danger`, a `warning`, gdy najgorsze ΔE2000(primary, danger) < 10 („najgorsze” = minimum z oka normalnego i trzech
// symulacji daltonizmu Machado 2009). Tokeny czytane przy KAŻDYM wywołaniu. Epoka motywu: `applyPreset` / `applyTheme`
// podbijają licznik `themeEpoch()` (warstwy 3D przebudowują się przy zmianie).
//
// PINY (SEDNO — pada na drzewie sprzed H0; KONTROLA — zielona po obu stronach). Moduł `HudPalette.js` i getter epoki
// powstają w H0 — import dynamiczny / namespace (brak modułu na starym drzewie = pin pada, suita się nie przerywa).
//   P0  API: `resolveHudRoles`, `hudContrastReport` (HudPalette) i `themeEpoch` (ThemeConfig)
//   P1  role na 5 motywach ekranu tytułowego (lista ze źródła `TitleScene.js`, zastosowana jak na ekranie — `applyPreset`):
//       primary / dim / foreign = tokeny; alert: Amber Noir, Cold Blue, Galactic Violet — `danger`; Biopunk Green,
//       Neon Cyber — `warning`
//   P2  najgorsze ΔE2000 KAŻDEJ z 6 par ról ≥ 10 na 5 motywach; dosłowna reguła „primary ostrzegawczy → warning”
//       dawałaby w Amber Noir parę < 1 (powód B2)
//   P3  raport dla WSZYSTKICH presetów (`PRESET_THEMES` — 23) — liczby skończone, alert ∈ {danger, warning}
//   P4  zero kolorów na sztywno i zero importów three / DOM w module (źródło bez komentarzy) + kontrola detektora
//   P5  tokeny czytane co wywołanie: zmiana `accent` / `danger` widoczna w następnym wywołaniu (także reguła alertu)
//   P6  epoka: +1 przy `applyPreset` i `applyTheme` (też `loadTheme` / `resetTheme` przez `applyTheme`); `saveTheme`
//       i bezpośredni zapis `THEME[key]` — bez zmiany
//   P7  `tokenRgbInt` — kanały tokenu bez krycia (orbity 3D); `tokenRgb` — krycie na czerni (raport)
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy (localStorage dla loadTheme / resetTheme)
import { readFileSync } from 'node:fs';
import * as TC from '../../config/ThemeConfig.js';   // namespace — `themeEpoch` powstaje w H0

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : String(v));

let HP = null;
try { HP = await import('../../ui/HudPalette.js'); } catch { HP = null; }
const roles = (t) => HP?.resolveHudRoles?.(t) ?? null;
const report = (t) => HP?.hudContrastReport?.(t) ?? null;
const epoch = () => (typeof TC.themeEpoch === 'function' ? TC.themeEpoch() : NaN);
const { THEME, PRESET_THEMES, DEFAULT_THEME, applyPreset, applyTheme } = TC;

// Motywy ekranu tytułowego — ze źródła `TitleScene.js` (id + presetKey), nie z listy w keeperze.
const TS_SRC = readFileSync(new URL('../../scenes/TitleScene.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ssBlock = TS_SRC.slice(TS_SRC.indexOf('const SS_THEMES = ['), TS_SRC.indexOf('];', TS_SRC.indexOf('const SS_THEMES = [')));
const TITLE = [...ssBlock.matchAll(/id:\s*'([a-z_]+)'[\s\S]*?presetKey:\s*'([a-z_0-9]+)'/g)].map((m) => ({ id: m[1], preset: m[2] }));
const EXPECT_ALERT = { amber_noir: 'danger', cold_blue: 'danger', galactic_violet: 'danger', biopunk_green: 'warning', neon_cyber: 'warning' };

// ═══ P0 ══════════════════════════════════════════════════════════════════════
header('P0  API');
{
  ok(typeof HP?.resolveHudRoles === 'function' && typeof HP?.hudContrastReport === 'function',
    'P0a SEDNO: `src/ui/HudPalette.js` — `resolveHudRoles` i `hudContrastReport`');
  ok(typeof TC.themeEpoch === 'function', 'P0b SEDNO: `ThemeConfig.themeEpoch()` — licznik epoki motywu');
  ok(HP?.HUD_MIN_DE === 10, 'P0c SEDNO: próg rozróżnialności ról `HUD_MIN_DE` = 10 (reguła alertu i kryterium par)');
}

// ═══ P1 ══════════════════════════════════════════════════════════════════════
header('P1  role na 5 motywach ekranu tytułowego');
{
  ok(TITLE.length === 5 && TITLE.every((t) => PRESET_THEMES[t.preset]) && TITLE.every((t) => t.id in EXPECT_ALERT),
    `P1a KONTROLA: ekran tytułowy — 5 motywów, presety istnieją (${TITLE.map((t) => t.id + '→' + t.preset).join(', ')})`);
  for (const t of TITLE) {
    applyPreset(PRESET_THEMES[t.preset]);
    const r = roles();
    const tokOk = !!r && r.primary === THEME.accent && r.dim === THEME.textDim && r.foreign === THEME.textPrimary;
    const want = EXPECT_ALERT[t.id];
    const alertOk = !!r && r.alertSource === want && r.alert === THEME[want];
    ok(tokOk && alertOk, `P1b SEDNO: ${t.id} — primary ${r?.primary} · dim ${r?.dim} · foreign ${r?.foreign} · alert ${r?.alert} (${r?.alertSource}; oczekiwane ${want})`);
  }
}

// ═══ P2 ══════════════════════════════════════════════════════════════════════
header('P2  najgorsze ΔE2000 każdej pary ról ≥ 10 (oko normalne + protanopia / deuteranopia / tritanopia)');
{
  for (const t of TITLE) {
    applyPreset(PRESET_THEMES[t.preset]);
    const rep = report();
    const pairs = rep ? Object.entries(rep.pairs) : [];
    const all = pairs.length === 6 && pairs.every(([, p]) => p && p.worst >= 10);
    ok(all && rep.ok === true, `P2a SEDNO: ${t.id} — ${pairs.map(([n, p]) => `${n} ${f1(p?.worst)}`).join(' · ') || 'brak raportu'}`);
  }
  // Powód B2: dosłowne „primary w barwie ostrzegawczej → alert = warning” w Amber Noir.
  applyPreset(PRESET_THEMES.ambient_1);
  const lit = HP?.worstDeltaE && HP?.tokenRgb ? HP.worstDeltaE(HP.tokenRgb(THEME.accent), HP.tokenRgb(THEME.warning)) : null;
  ok(!!lit && lit.worst < 1 && lit.deuteranopia < 1 && roles()?.alertSource === 'danger',
    `P2b SEDNO: Amber Noir — primary↔warning najgorsze ΔE ${f1(lit?.worst)} (deuteranopia ${lit ? lit.deuteranopia.toFixed(2) : '?'}) < 1 ⇒ reguła B2 bierze danger`);
}

// ═══ P3 ══════════════════════════════════════════════════════════════════════
header('P3  raport dla wszystkich presetów (PRESET_THEMES)');
{
  const keys = Object.keys(PRESET_THEMES);
  const rows = [];
  for (const k of keys) {
    applyPreset(PRESET_THEMES[k]);
    const rep = report();
    rows.push({ k, rep });
    if (rep) console.log(`     ${k.padEnd(20)} alert ${rep.roles.alertSource.padEnd(7)} min ${f1(rep.minWorst).padStart(5)} ${rep.ok ? '  ' : '⚠ '}`
      + Object.entries(rep.pairs).map(([n, p]) => `${n} ${f1(p?.worst)}`).join(' · '));
  }
  const good = rows.every(({ rep }) => rep && Number.isFinite(rep.minWorst) && ['danger', 'warning'].includes(rep.roles.alertSource)
    && Object.values(rep.pairs).every((p) => p && Number.isFinite(p.worst) && Number.isFinite(p.wcag)));
  ok(rows.length === keys.length && keys.length >= 23 && good,
    `P3a SEDNO: raport dla ${rows.filter((r) => r.rep).length} / ${keys.length} presetów — liczby skończone, alert ∈ {danger, warning}`);
  const below = rows.filter(({ rep }) => rep && !rep.ok).map(({ k }) => k);
  const titlePresets = new Set(TITLE.map((t) => t.preset));
  ok(!!HP && below.every((k) => !titlePresets.has(k)),
    `P3b SEDNO: presety z parą < 10 — wyłącznie spoza ekranu tytułowego (F7): ${below.join(', ') || '—'}`);
}

// ═══ P4 ══════════════════════════════════════════════════════════════════════
header('P4  zero kolorów na sztywno, zero three / DOM w module');
{
  const COLOR_LITERALS = [/0x[0-9a-fA-F]{6}\b/, /['"`]#[0-9a-fA-F]{3,8}['"`]/, /rgba?\(\s*\d/, /hsla?\(\s*\d/];
  const IMPORTS = [/from\s+['"]three/, /\bdocument\./, /\bwindow\./];
  const detect = (code) => [...COLOR_LITERALS, ...IMPORTS].filter((re) => re.test(code)).map((re) => re.source);
  let code = '';
  try { code = strip(readFileSync(new URL('../../ui/HudPalette.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')); } catch { code = ''; }
  const hits = detect(code);
  ok(code.length > 2000 && hits.length === 0, `P4a SEDNO: HudPalette.js bez komentarzy (${code.length} zn.) — trafienia detektora: ${hits.join(', ') || 'brak'}`);
  const fake = "const a = '#ff8800'; const b = 0x00ff00; const c = 'rgba(1, 2, 3, 0.5)'; import x from 'three';";
  ok(detect(fake).length === 4, `P4b KONTROLA: detektor łapie literał '#rrggbb', 0xRRGGBB, rgba(…) i import three (${detect(fake).length}/4)`);
}

// ═══ P5 ══════════════════════════════════════════════════════════════════════
header('P5  tokeny czytane przy każdym wywołaniu');
{
  applyPreset(PRESET_THEMES.ambient_2);
  const r0 = roles();
  const otherAccent = PRESET_THEMES.ambient_3.accent;
  applyTheme({ accent: otherAccent });
  const r1 = roles();
  ok(!!r0 && r0.primary === PRESET_THEMES.ambient_2.accent && r1?.primary === otherAccent,
    `P5a SEDNO: zmiana \`accent\` widoczna w następnym wywołaniu (${r0?.primary} → ${r1?.primary})`);
  applyTheme({ accent: THEME.danger });   // primary = danger ⇒ ΔE 0 ⇒ alert = warning
  const r2 = roles();
  applyPreset(PRESET_THEMES.ambient_2);
  const r3 = roles();
  ok(r2?.alertSource === 'warning' && r2.alert === THEME.warning && r3?.alertSource === 'danger',
    `P5b SEDNO: reguła alertu liczona na bieżących tokenach (accent = danger → ${r2?.alertSource}; powrót → ${r3?.alertSource})`);
  const nc = { ...DEFAULT_THEME, ...PRESET_THEMES.neon_cyber };
  ok(roles(nc)?.alertSource === 'warning' && roles(nc)?.primary === nc.accent && roles()?.primary === THEME.accent,
    'P5c SEDNO: jawny obiekt motywu (Neon Cyber) — role z niego, bez wpływu na `THEME`');
}

// ═══ P6 ══════════════════════════════════════════════════════════════════════
header('P6  epoka motywu');
{
  const e0 = epoch();
  applyPreset(PRESET_THEMES.ambient_1);
  const e1 = epoch();
  applyTheme({ accent: PRESET_THEMES.ambient_4.accent });
  const e2 = epoch();
  ok(Number.isFinite(e0) && e1 === e0 + 1 && e2 === e1 + 1, `P6a SEDNO: applyPreset +1, applyTheme +1 (${e0} → ${e1} → ${e2})`);
  TC.saveTheme();
  const e3 = epoch();
  TC.loadTheme();          // localStorage z zapisanym motywem → applyTheme
  const e4 = epoch();
  TC.resetTheme();         // → applyTheme(DEFAULT_THEME)
  const e5 = epoch();
  ok(Number.isFinite(e3) && e3 === e2 && e4 === e3 + 1 && e5 === e4 + 1,
    `P6b SEDNO: saveTheme bez zmiany (${e2} → ${e3}); loadTheme +1 (${e4}); resetTheme +1 (${e5})`);
  THEME.accent = PRESET_THEMES.ambient_3.accent;   // bezpośredni zapis (pole koloru w F7) — epoka stoi
  ok(Number.isFinite(e5) && epoch() === e5, `P6c SEDNO (granica): bezpośredni zapis \`THEME[key]\` epoki nie podbija (${epoch()})`);
  ok(THEME.accent === PRESET_THEMES.ambient_3.accent, 'P6d KONTROLA: bezpośredni zapis zmienia `THEME` (stan dla P6c)');
}

// ═══ P7 ══════════════════════════════════════════════════════════════════════
header('P7  token → kolor 3D / kolor raportu');
{
  const line = PRESET_THEMES.ambient_1.orbitLine;   // 'rgba(196,152,48,0.06)'
  const m = String(line).match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)/);
  const want = m ? (+m[1] << 16) | (+m[2] << 8) | +m[3] : null;
  ok(!!m && HP?.tokenRgbInt?.(line) === want, `P7a SEDNO: tokenRgbInt(${line}) = 0x${want?.toString(16)} — kanały bez krycia`);
  const acc = PRESET_THEMES.ambient_1.accent;
  ok(HP?.tokenRgbInt?.(acc) === parseInt(acc.slice(1), 16), `P7b SEDNO: tokenRgbInt(${acc}) = 0x${acc.slice(1)}`);
  const comp = HP?.tokenRgb?.(line);
  ok(!!comp && m && comp[0] === Math.round(+m[1] * +m[4]) && comp[2] === Math.round(+m[3] * +m[4]),
    `P7c SEDNO: tokenRgb — krycie ${m?.[4]} nałożone na czerń (${comp?.join(', ')})`);
  ok(HP?.tokenRgbInt?.('nie-kolor') === null && HP?.parseColorToken?.(undefined) === null, 'P7d SEDNO: nie-kolor → null');
}

applyPreset(PRESET_THEMES.default);
console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
