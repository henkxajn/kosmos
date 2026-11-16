// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// console_kit_smoke — KEEPER ARC KONSOLE, krok K0a (zestaw rysujący konsol `ConsoleKit`; flaga `consoleKit`)
// Plan: `docs/design/CONSOLES_PLAN.md` §3, D-K-1, D-K-19.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (kontrakt i logika — bez pinów na stałych rysunku):
//   K1 zero literałów kolorów w źródle zestawu (hex / rgb / rgba / hsl / nazwy) — kolory tylko z ról i tokenów motywu
//   K2 WYKONANIEM na nagrywającym kontekście: każdy przypisany kolor ∈ wartości ról `resolveHudRoles(THEME)` ∪ `bgPrimary`,
//      w KAŻDYM z 5 motywów zakładek (świadek: nagrano niepustą listę kolorów i co najmniej trzy różne role)
//   K3 lista: przewijanie w klamrze, strefy wierszy tylko w pasie widoku, nagłówki grup bez strefy, `revealScroll`
//   K4 czipy akcji: disabled bez strefy trafień, off/danger ze strefą i stanem; wiersze łamane w `maxW`
//   K5 nagłówek: strefy czipów podzakładek i [ x ]; `kitZoneAt` — pierwsza wygrywa
//   K6 `bracketCornersRect`: cztery narożniki w rogach prostokąta, ramię w klamrze; token `fontSizeInstrument` (D-K-19)
//      > `fontSizeLarge` w każdym presecie, który ustawia `fontSizeLarge`
// ⚠ Fail-first: moduły powstają w K0a — importy dynamiczne, piny DEGRADUJĄ (czerwone), suita się nie przerywa.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';
import { readFileSync } from 'node:fs';
import { THEME, PRESET_THEMES, applyPreset, DEFAULT_THEME } from '../../config/ThemeConfig.js';
import { resolveHudRoles } from '../../ui/HudPalette.js';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const KIT = await tryImport('../../ui/ConsoleKit.js');
const ATT = await tryImport('../../ui/HudAttentionLogic.js');
const CL = await tryImport('../../ui/ConsoleLayoutLogic.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const safe = (fn, d = null) => { try { return fn(); } catch (e) { console.log('  ! ' + e.message); return d; } };

// Nagrywający kontekst Canvas 2D: zapisuje każde przypisanie fillStyle / strokeStyle.
function recCtx() {
  const colors = [];
  const st = { fillStyle: '', strokeStyle: '' };
  const ctx = {
    colors, font: '10px monospace', textAlign: 'left', textBaseline: 'alphabetic', lineWidth: 1, globalAlpha: 1,
    measureText: (s) => ({ width: String(s).length * 6 }),
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, rect() {}, clip() {},
    fillRect() {}, strokeRect() {}, fillText() {},
  };
  for (const k of ['fillStyle', 'strokeStyle']) {
    Object.defineProperty(ctx, k, { get: () => st[k], set: (v) => { st[k] = v; colors.push(v); } });
  }
  return ctx;
}

console.log('\n── K0 kontrola (zielona po obu stronach): role motywu ──');
{
  const r = resolveHudRoles(THEME);
  assert(['primary', 'dim', 'alert', 'foreign'].every((k) => typeof r[k] === 'string' && r[k].length > 0), 'K0 resolveHudRoles daje 4 role');
}

console.log('\n── K1 zero literałów kolorów w źródle ──');
{
  let text = '';
  try { text = readFileSync(new URL('../../ui/ConsoleKit.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1'); } catch (e) { console.log('  ! ' + e.message); }
  const lit = text.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(|['"](?:white|black|red|green|blue|yellow|cyan|magenta|gray|grey|orange|transparent)['"]/g) ?? [];
  assert(text.length > 0 && lit.length === 0, `K1 brak literałów kolorów (znaleziono: ${JSON.stringify(lit.slice(0, 5))})`);
  assert(text.includes('resolveHudRoles') === false && /roles\.primary/.test(text) && /roles\.dim/.test(text) && /roles\.alert/.test(text),
    'K1 zestaw dostaje role od wołającego (nie rozwiązuje ich sam) i używa ról primary / dim / alert');
}

function drawEverything(ctx, roles) {
  const zones = CL.consoleZones({ x: 0, y: 52, w: 1280, h: 739 }, { clock: CL.consoleClockRect(1280, 833, 7) });
  KIT.drawConsoleBackground(ctx, { x: 0, y: 0, w: 1280, h: 833 });
  KIT.drawZoneFrame(ctx, zones.hero, roles);
  for (const k of ['list', 'inspector', 'strip']) KIT.drawZoneRule(ctx, zones[k], 'Strefa', roles);
  KIT.drawSelectBrackets(ctx, { x: 5, y: 5, w: 80, h: 18 }, roles);
  KIT.drawConsoleHeader(ctx, zones, roles, { title: 'Wywiad', chips: [{ id: 'a', label: 'Dyplomacja' }, { id: 'b', label: 'Wywiad', active: true }], hoverId: 'close' });
  const rows = [{ group: true, label: 'Imperia' }, ...Array.from({ length: 40 }, (_, i) => ({ id: 'r' + i, label: 'Imperium ' + i, value: String(i * 7), tone: i % 5 ? undefined : 'alert' }))];
  KIT.drawList(ctx, zones.list, rows, roles, { selectedId: 'r3', hoverId: 'r5', scroll: 40 });
  KIT.drawEyebrow(ctx, 10, 10, 200, 'Sekcja', roles);
  KIT.drawKvRow(ctx, 10, 30, 200, 'Populacja', '1 204', roles, { unit: 'POP' });
  KIT.drawBar(ctx, 10, 50, 200, 0.4, roles, { tone: 'alert' });
  KIT.drawInstrument(ctx, 10, 60, roles, { label: 'Kredyty', value: '12 480', unit: 'Kr', delta: '+120/r', deltaTone: 'primary' });
  KIT.drawChipRow(ctx, 10, 120, 300, [{ id: 'n', label: 'Buduj' }, { id: 'd', label: 'Brak', state: 'disabled' }, { id: 'o', label: 'Auto', state: 'off' }, { id: 'x', label: 'Złom', state: 'danger' }], roles, { hoverId: 'n' });
  KIT.drawQueueChips(ctx, zones.strip, [{ id: 'q1', label: 'Fregata', sub: '3/10', frac: 0.3 }, { id: 'q2', label: 'Kopalnia', sub: '1/4', frac: 0.25, tone: 'foreign' }], roles);
  KIT.drawTimelineLanes(ctx, zones.strip, [{ id: 'l1', label: 'Flota A', spans: [{ t0: 0, t1: 4, label: 'lot' }, { t0: 5, t1: 8, tone: 'alert' }] }], roles, { t0: 0, t1: 10, now: 3 });
}

console.log('\n── K2 wykonaniem: kolory tylko z ról i tła, 5 motywów ──');
{
  const THEMES = ['ambient_1', 'ambient_2', 'ambient_3', 'ambient_4', 'neon_cyber'];   // Amber Noir, Cold Blue, Galactic Violet, Biopunk Green, Neon Cyber (TitleScene presetKey)
  const snapshot = { ...THEME };
  for (const name of THEMES) {
    const preset = PRESET_THEMES[name];
    if (!preset) { assert(false, `K2 ${name}: brak presetu`); continue; }
    applyPreset(preset);
    const roles = resolveHudRoles(THEME);
    const allowed = new Set([roles.primary, roles.dim, roles.alert, roles.foreign, THEME.bgPrimary]);
    const ctx = recCtx();
    const ok = safe(() => { drawEverything(ctx, roles); return true; }, false);
    const bad = ctx.colors.filter((c) => !allowed.has(c));
    const used = new Set(ctx.colors.filter((c) => allowed.has(c)));
    assert(ok && ctx.colors.length > 20 && bad.length === 0 && used.size >= 3,
      `K2 ${name}: ${ctx.colors.length} przypisań, ${used.size} różnych dozwolonych, obcych: ${JSON.stringify([...new Set(bad)].slice(0, 3))}`);
  }
  for (const k of Object.keys(DEFAULT_THEME)) THEME[k] = snapshot[k];
}

const roles = resolveHudRoles(THEME);

console.log('\n── K3 lista ──');
{
  const rect = { x: 0, y: 100, w: 200, h: 90 };
  const rows = [{ group: true, label: 'G' }, ...Array.from({ length: 20 }, (_, i) => ({ id: 'r' + i, label: 'R' + i }))];
  const K = KIT?.CONSOLE_KIT ?? {};
  const contentH = K.GROUP_H + 20 * K.ROW_H;
  const res = safe(() => KIT.drawList(recCtx(), rect, rows, roles, { scroll: 99999 }));
  assert(!!res && res.contentH === contentH && res.scroll === contentH - rect.h, `K3 przewijanie w klamrze (max ${contentH - rect.h}, jest ${res?.scroll})`);
  assert(!!res && res.zones.length > 0 && res.zones.every((z) => z.type === 'row' && z.y >= rect.y - 0.5 && z.y + z.h <= rect.y + rect.h + 0.5),
    `K3 strefy wierszy tylko w pasie widoku (${res?.zones.length})`);
  const top = safe(() => KIT.drawList(recCtx(), rect, rows, roles, { scroll: -50 }));
  assert(!!top && top.scroll === 0 && top.zones.every((z) => z.id !== undefined) && top.zones[0].y === rect.y + K.GROUP_H,
    'K3 nagłówek grupy bez strefy; pierwszy wiersz pod nim');
  const rv = safe(() => KIT.revealScroll(rows, 'r15', 0, rect.h));
  assert(rv === K.GROUP_H + 16 * K.ROW_H - rect.h, `K3 revealScroll odsłania zaznaczony wiersz (${rv})`);
  assert(safe(() => KIT.revealScroll(rows, 'r1', 0, rect.h)) === 0, 'K3 revealScroll: widoczny — bez zmiany');
}

console.log('\n── K4 czipy akcji ──');
{
  const chips = [{ id: 'n', label: 'Buduj' }, { id: 'd', label: 'Brak', state: 'disabled' }, { id: 'o', label: 'Auto', state: 'off' }, { id: 'x', label: 'Złom', state: 'danger' }];
  const r = safe(() => KIT.drawChipRow(recCtx(), 0, 0, 1000, chips, roles));
  assert(!!r && r.zones.length === 3 && !r.zones.some((z) => z.id === 'd'), 'K4 disabled bez strefy trafień');
  assert(!!r && r.zones.find((z) => z.id === 'o')?.state === 'off' && r.zones.find((z) => z.id === 'x')?.state === 'danger', 'K4 off i danger ze strefą i stanem');
  const narrow = safe(() => KIT.drawChipRow(recCtx(), 0, 0, 90, chips, roles));
  assert(!!narrow && narrow.h > r.h && narrow.zones.every((z) => z.x + z.w <= 90 + 1 || z.x === 0), 'K4 wąsko: wiersze łamane w maxW');
  assert(KIT?.chipLabel('buduj') === '[ BUDUJ ]', 'K4 etykieta czipu „[ WERSALIKI ]”');
}

console.log('\n── K5 nagłówek i kitZoneAt ──');
{
  const zones = CL && CL.consoleZones({ x: 0, y: 52, w: 1280, h: 739 }, {});
  const hz = safe(() => KIT.drawConsoleHeader(recCtx(), zones, roles, { title: 'Ekonomia', chips: [{ id: 'budget', label: 'Budżet' }, { id: 'trade', label: 'Handel', active: true }] }));
  assert(!!hz && hz.filter((z) => z.type === 'tab').map((z) => z.id).join() === 'budget,trade' && hz.some((z) => z.type === 'close'),
    'K5 strefy czipów podzakładek i [ x ]');
  assert(!!hz && hz.every((z) => z.y >= zones.header.y && z.y + z.h <= zones.header.y + zones.header.h), 'K5 strefy w paśmie nagłówka');
  const a = { id: 'a', x: 0, y: 0, w: 10, h: 10 }, b = { id: 'b', x: 0, y: 0, w: 20, h: 20 };
  assert(KIT?.kitZoneAt([a, b], 5, 5)?.id === 'a' && KIT?.kitZoneAt([a, b], 15, 15)?.id === 'b' && KIT?.kitZoneAt([a], 50, 50) === null, 'K5 kitZoneAt: pierwsza wygrywa, pustka → null');
}

console.log('\n── K6 nawiasy prostokąta i token instrumentu ──');
{
  const c = safe(() => ATT.bracketCornersRect({ x: 10, y: 20, w: 100, h: 50 }, 8), []);
  const byId = Object.fromEntries((c ?? []).map((k) => [k.id, k]));
  assert(c.length === 4 && byId.tl.pts[2] === 10 && byId.tl.pts[3] === 20 && byId.br.pts[2] === 110 && byId.br.pts[3] === 70,
    'K6 narożniki w rogach prostokąta');
  assert(byId.tl && byId.tl.pts[1] === 28 && byId.tl.pts[4] === 18, 'K6 ramię = 8 px');
  const cl = safe(() => ATT.bracketCornersRect({ x: 0, y: 0, w: 10, h: 6 }, 50), []);
  assert(cl.length === 4 && cl[0].rect.w === 3, 'K6 ramię w klamrze do połowy krótszego boku');
  assert((safe(() => ATT.bracketCornersRect({ x: 0, y: 0, w: 0, h: 5 }, 5), null) ?? [1]).length === 0, 'K6 pusty prostokąt → brak narożników');
  const withLarge = Object.entries(PRESET_THEMES).filter(([, p]) => Number.isFinite(p.fontSizeLarge));
  assert(Number.isFinite(DEFAULT_THEME.fontSizeInstrument) && DEFAULT_THEME.fontSizeInstrument > DEFAULT_THEME.fontSizeLarge
    && withLarge.length > 0 && withLarge.every(([, p]) => Number.isFinite(p.fontSizeInstrument) && p.fontSizeInstrument > p.fontSizeLarge),
    `K6 fontSizeInstrument > fontSizeLarge w motywie domyślnym i w ${withLarge.length} presetach`);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
