// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// console_layout_smoke — KEEPER ARC KONSOLE, krok K0a (geometria stref konsoli; flaga `consoleKit`)
// Plan: `docs/design/CONSOLES_PLAN.md` §3 (ConsoleLayoutLogic), §4 ryzyko 2, D-K-1, D-K-14, D-K-17; Finding 727.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (wyłącznie logika — bez pinów na stałych rysunku):
//   L1 skala UI: `uiViewport` = reguła UIManagera (1600×1041 → 1,25 i 1280×833 logicznie; 1280×833 → 1,0 i to samo W×H)
//   L2 wariant 4-strefowy w granicach overlayu: komplet stref, brak nakładania, wszystko w ramie, całkowite px
//   L3 rezerwa klastra zegara: kolumny pod zegarem kończą się nad nim, inne nie (świadek: bez zegara — do dołu ramy)
//   L4 gniazdo paska walki w nagłówku: między tytułem a [ x ], tytuł ≥ MIN_TITLE_W; `combatSlotW: 0` → brak gniazda
//   L5 wariant 3-strefowy: bez bohatera, lista szersza niż w 4-strefowym, pas pod listą
//   L6 pas wyłączony: `strip` null, bohater do dołu kolumny
//   L7 wąsko / szeroko: lista i inspektor kurczą się, bohater trzyma minimum; ultraszeroko — szerokości z specyfikacji
//   L8 `zoneAt` / `zonesOverlap` (świadek nakładania) / `consoleClockRect` = ostatni slot nawigacji nad paskiem
// ⚠ Fail-first: moduł powstaje w K0a — import dynamiczny w try/catch, piny DEGRADUJĄ (czerwone), suita się nie przerywa.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';
import { COSMIC } from '../../config/LayoutConfig.js';
import { bottomNavBarRect, navSlotLayout } from '../../ui/BottomNavBarLogic.js';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const CL = await tryImport('../../ui/ConsoleLayoutLogic.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const safe = (fn, d = null) => { try { return fn(); } catch (e) { console.log('  ! ' + e.message); return d; } };
const inside = (r, f) => !!r && !!f && r.x >= f.x && r.y >= f.y && r.x + r.w <= f.x + f.w && r.y + r.h <= f.y + f.h;
const ints = (z) => ['header', 'list', 'hero', 'inspector', 'strip', 'close', 'title'].every((k) => !z[k] || ['x', 'y', 'w', 'h'].every((p) => Number.isInteger(z[k][p])));

// Granice overlayu jak BaseOverlay._getOverlayBounds w civMode (zakładka w grupie — z pasem subnav).
const overlayBounds = (W, H) => {
  const top = COSMIC.TOP_BAND_H + COSMIC.MAP_MODE_H + (COSMIC.SUBNAV_H ?? 0);
  return { ox: 0, oy: top, ow: W, oh: H - top - (COSMIC.BOTTOM_NAV_H + COSMIC.BOTTOM_LOG_TRIG_H) - (COSMIC.RESOURCE_BAR_H ?? 0) };
};
const NAV = 7;

console.log('\n── L0 kontrola (zielona po obu stronach): pas nawigacji i jego sloty ──');
{
  const slots = navSlotLayout(bottomNavBarRect(1280, 833), NAV);
  assert(slots.length === NAV && slots[NAV - 1].x + slots[NAV - 1].w === 1280, 'L0 7 slotów, ostatni dochodzi do prawej krawędzi');
}

console.log('\n── L1 skala UI ──');
{
  const a = safe(() => CL.uiViewport(1600, 1041)), b = safe(() => CL.uiViewport(1280, 833));
  assert(!!a && a.scale === 1.25 && a.W === 1280 && a.H === 833, `L1 1600×1041 → skala 1,25, logicznie 1280×833 (${JSON.stringify(a)})`);
  assert(!!b && b.scale === 1 && b.W === 1280 && b.H === 833, `L1 1280×833 → skala 1,0, logicznie 1280×833 (${JSON.stringify(b)})`);
  const c = safe(() => CL.uiViewport(2560, 1080));
  assert(!!c && c.scale === 1.5 && c.W === 1707 && c.H === 720, `L1 ultraszeroko 2560×1080 → 1,5 i 1707×720 (${JSON.stringify(c)})`);
}

const W = 1280, H = 833;
const ob = overlayBounds(W, H);
const clock = safe(() => CL.consoleClockRect(W, H, NAV));
const z4 = safe(() => CL.consoleZones(ob, { clock }));

console.log('\n── L2 wariant 4-strefowy ──');
{
  assert(!!z4 && z4.variant === '4zone' && ['header', 'list', 'hero', 'inspector', 'strip'].every((k) => z4[k] && z4[k].w > 0 && z4[k].h > 0),
    'L2 komplet stref: nagłówek, lista, bohater, inspektor, pas (wszystkie niepuste)');
  assert(!!z4 && CL.zonesOverlap(z4) === false, 'L2 strefy się nie nakładają');
  const fr = z4 && CL.boundsRect(ob);
  assert(!!z4 && ['header', 'list', 'hero', 'inspector', 'strip'].every((k) => inside(z4[k], fr)), 'L2 każda strefa w granicach overlayu');
  assert(!!z4 && ints(z4), 'L2 współrzędne całkowite');
  assert(!!z4 && z4.list.x < z4.hero.x && z4.hero.x + z4.hero.w <= z4.inspector.x && z4.strip.y > z4.hero.y + z4.hero.h - 1
    && z4.strip.x === z4.hero.x && z4.strip.w === z4.hero.w, 'L2 kolejność: lista | bohater (pas pod nim) | inspektor');
  assert(!!z4 && z4.list.w === CL.CONSOLE_LAYOUT.LIST_W && z4.inspector.w === CL.CONSOLE_LAYOUT.INSP_W, 'L2 szerokości listy i inspektora z domyślnych');
}

console.log('\n── L3 rezerwa klastra zegara (Finding 727) ──');
{
  const g = CL?.CONSOLE_LAYOUT?.GAP ?? 0;
  assert(!!z4 && !!clock && z4.inspector.y + z4.inspector.h <= clock.y - g, `L3 inspektor kończy się nad zegarem (dół ${z4 && z4.inspector.y + z4.inspector.h} ≤ ${clock && clock.y - g})`);
  const noClock = safe(() => CL.consoleZones(ob, {}));
  const frBottom = ob.oy + ob.oh - (CL?.CONSOLE_LAYOUT?.PAD ?? 0);
  assert(!!noClock && noClock.inspector.y + noClock.inspector.h === frBottom, 'L3 świadek: bez zegara inspektor schodzi do dołu ramy');
  assert(!!z4 && z4.list.y + z4.list.h === frBottom, 'L3 lista (poza zegarem) schodzi do dołu ramy');
  assert(!!z4 && CL.zoneAt(z4, clock.x + 2, clock.y + 2) === 'clock', 'L3 punkt w klastrze zegara → strefa „clock” (pierwszeństwo)');
}

console.log('\n── L4 gniazdo paska walki (D-K-17) ──');
{
  const cs = z4?.combatSlot, t = z4?.title, cl = z4?.close;
  assert(!!cs && cs.y === z4.header.y && cs.h === z4.header.h && cs.x >= t.x + t.w && cs.x + cs.w <= cl.x, 'L4 gniazdo w nagłówku między tytułem a [ x ]');
  assert(!!t && t.w >= CL.CONSOLE_LAYOUT.MIN_TITLE_W, `L4 tytuł i czipy mają ≥ MIN_TITLE_W (${t?.w})`);
  const off = safe(() => CL.consoleZones(ob, { clock, combatSlotW: 0 }));
  assert(!!off && off.combatSlot === null && off.title.w > t.w, 'L4 `combatSlotW: 0` → brak gniazda, tytuł szerszy');
}

console.log('\n── L5 wariant 3-strefowy (D-K-14) ──');
{
  const z3 = safe(() => CL.consoleZones(ob, { variant: '3zone', clock }));
  assert(!!z3 && z3.hero === null && z3.variant === '3zone', 'L5 bez bohatera');
  assert(!!z3 && z3.list.w > z4.list.w + z4.hero.w, 'L5 lista szersza niż lista + bohater w 4-strefowym');
  assert(!!z3 && z3.strip && z3.strip.x === z3.list.x && z3.strip.w === z3.list.w && z3.strip.y >= z3.list.y + z3.list.h, 'L5 pas pod listą');
  assert(!!z3 && CL.zonesOverlap(z3) === false, 'L5 brak nakładania');
}

console.log('\n── L6 pas wyłączony ──');
{
  const zs = safe(() => CL.consoleZones(ob, { clock, stripH: 0 }));
  assert(!!zs && zs.strip === null && zs.hero.h > z4.hero.h + z4.strip.h, 'L6 `stripH: 0` → brak pasa, bohater do dołu kolumny');
}

console.log('\n── L7 wąsko / szeroko ──');
{
  const narrow = safe(() => CL.consoleZones({ x: 0, y: 0, w: 700, h: 500 }, {}));
  assert(!!narrow && narrow.hero.w >= CL.CONSOLE_LAYOUT.MIN_HERO_W - 1 && narrow.list.w < CL.CONSOLE_LAYOUT.LIST_W
    && narrow.inspector.w < CL.CONSOLE_LAYOUT.INSP_W && CL.zonesOverlap(narrow) === false,
    `L7 wąsko (700 px): lista ${narrow?.list.w} / inspektor ${narrow?.inspector.w} kurczą się, bohater ${narrow?.hero.w} trzyma minimum`);
  const tiny = safe(() => CL.consoleZones({ x: 0, y: 0, w: 120, h: 80 }, {}));
  assert(!!tiny && ['list', 'hero', 'inspector', 'strip'].every((k) => !tiny[k] || (tiny[k].w >= 0 && tiny[k].h >= 0)), 'L7 skrajnie mało miejsca: bez ujemnych wymiarów');
  const vw = CL?.uiViewport(2560, 1080);
  const wide = vw && safe(() => CL.consoleZones(overlayBounds(vw.W, vw.H), { clock: CL.consoleClockRect(vw.W, vw.H, NAV) }));
  assert(!!wide && wide.list.w === CL.CONSOLE_LAYOUT.LIST_W && wide.hero.w > z4.hero.w && CL.zonesOverlap(wide) === false,
    'L7 ultraszeroko: lista z specyfikacji, nadmiar idzie do bohatera');
  const spec = safe(() => CL.consoleZones(ob, { listW: 200, inspW: 400, headerH: 40 }));
  assert(!!spec && spec.list.w === 200 && spec.inspector.w === 400 && spec.header.h === 40, 'L7 specyfikacja ekranu nadpisuje domyślne');
}

console.log('\n── L8 zoneAt / zonesOverlap / consoleClockRect ──');
{
  assert(!!z4 && CL.zoneAt(z4, z4.hero.x + 5, z4.hero.y + 5) === 'hero' && CL.zoneAt(z4, z4.list.x + 1, z4.list.y + 1) === 'list'
    && CL.zoneAt(z4, z4.header.x + 50, z4.header.y + 5) === 'header' && CL.zoneAt(z4, -5, -5) === null, 'L8 zoneAt rozpoznaje strefy i pustkę');
  assert(!!CL && CL.zonesOverlap({ list: { x: 0, y: 0, w: 10, h: 10 }, hero: { x: 5, y: 5, w: 10, h: 10 } }) === true, 'L8 świadek: nakładanie wykryte');
  const last = navSlotLayout(bottomNavBarRect(W, H), NAV)[NAV - 1];
  assert(!!clock && clock.x === last.x && clock.w === last.w && clock.y + clock.h === H - COSMIC.BOTTOM_NAV_H - COSMIC.BOTTOM_LOG_TRIG_H,
    'L8 klaster zegara = ostatni slot nawigacji, tuż nad paskiem');
  assert(!!CL && CL.consoleClockRect(W, H, 0) === null, 'L8 bez slotów → brak klastra');
  const ins = CL && CL.insetRect({ x: 10, y: 20, w: 100, h: 50 }, 6);
  assert(!!ins && ins.x === 16 && ins.y === 26 && ins.w === 88 && ins.h === 38 && CL.insetRect({ x: 0, y: 0, w: 4, h: 4 }, 6).w === 0,
    'L8 insetRect: wcięcie z każdej strony, nigdy ujemne');
  const before = CL && { ...CL.CONSOLE_LAYOUT };
  const t = CL && CL.tuneConsoleLayout({ LIST_W: 300, BOGUS: 1, INSP_W: -5 });
  assert(!!t && t.LIST_W === 300 && !('BOGUS' in t) && t.INSP_W === before.INSP_W, 'L8 strojenie: znany klucz przyjęty, nieznany i ujemny pominięte');
  CL?.resetConsoleLayout();
  assert(!!CL && CL.CONSOLE_LAYOUT.LIST_W === before.LIST_W, 'L8 reset przywraca domyślne');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
