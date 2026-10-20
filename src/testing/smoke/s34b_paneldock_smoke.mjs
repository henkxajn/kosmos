// S3.4b C2 — smoke: PanelDockLogic (czysta logika układu doku zminimalizowanych paneli).
// Uruchom: node src/testing/smoke/s34b_paneldock_smoke.mjs
//
// PRZECELOWANY W ARKUSZ UI U4-3 (UI_PLAN §4.5, decyzja (c) — „koniec stosu pionowego”): dawniej piny
// `computeDockSlots` — belki 156 × 24 px stackowane PIONOWO w lewym dolnym rogu mapy (funkcja usunięta razem ze stosem).
// Ta sama struktura T1–T5, teraz dla `layoutDockChips` — chipy w JEDNYM rzędzie na pasie dolnym:
//   T1 pusty dok → brak chipów i „+N”
//   T2 1 chip → pozycja na lewym końcu rzędu + wymiary
//   T3 N chipów, które się mieszczą → rząd W PRAWO (rosnące x, krok = szerokość + odstęp), y/h stałe, bez „+N”
//   T4 brak miejsca → ostatnie miejsce zajmuje „+N” (N = liczba niewidocznych, `first` = pierwszy niewidoczny); rząd
//      węższy niż sam „+N” → nic
//   T5 index w chipie mapuje na wpis
// Stałe chipa (16 px, odstęp 4, najwyżej 110 px) — decyzja (c).

const { layoutDockChips: L, DOCK_CHIP_H, DOCK_CHIP_GAP, DOCK_CHIP_MAX_W } = await import('../../ui/PanelDockLogic.js');
// Pin degraduje, nie przerywa: na drzewie sprzed U4-3 funkcji nie ma — każdy pin pada (świadek `HAS` w każdym), bez wyjątku.
const HAS = typeof L === 'function';
const layoutDockChips = HAS ? L : () => ({ chips: [], more: null });

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name}`); } };

const span = { x0: 154, x1: 1000, y: 660, h: 16, gap: 4, moreW: 28 };

// ── T0 — stałe decyzji (c) ─────────────────────────────────────────────────────
T('0.1 chip 16 px, odstęp 4, najwyżej 110 px', DOCK_CHIP_H === 16 && DOCK_CHIP_GAP === 4 && DOCK_CHIP_MAX_W === 110);

// ── T1 — pusty ─────────────────────────────────────────────────────────────
{
  const r = layoutDockChips([], span);
  T('1.1 pusty dok → brak chipów', HAS && r.chips.length === 0 && r.more === null);
}

// ── T2 — jeden chip ────────────────────────────────────────────────────────
{
  const r = layoutDockChips([80], span);
  T('2.1 jeden chip', r.chips.length === 1 && r.more === null);
  T('2.2 x = lewy koniec rzędu', r.chips[0]?.x === 154);
  T('2.3 y = rząd na pasie', r.chips[0]?.y === 660);
  T('2.4 w = szerokość chipa', r.chips[0]?.w === 80);
  T('2.5 h = wysokość rzędu', r.chips[0]?.h === 16);
  T('2.6 index = 0', r.chips[0]?.index === 0);
}

// ── T3 — rząd w prawo ──────────────────────────────────────────────────────
{
  const r = layoutDockChips([80, 100, 60], span);
  const c = r.chips;
  T('3.1 trzy chipy, bez „+N”', c.length === 3 && r.more === null);
  T('3.2 i=0 na lewym końcu', c[0]?.x === 154);
  T('3.3 rząd W PRAWO (rosnące x)', c[0]?.x < c[1]?.x && c[1]?.x < c[2]?.x);
  T('3.4 krok = szerokość + odstęp', c[1]?.x - c[0]?.x === 84 && c[2]?.x - c[1]?.x === 104);
  T('3.5 y stałe', c.length === 3 && c.every(z => z.y === 660));
  T('3.6 h stałe', c.length === 3 && c.every(z => z.h === 16));
}

// ── T4 — brak miejsca → „+N” ───────────────────────────────────────────────
{
  // Rząd 154..460 (306 px): 100 + 4 + 100 + 4 + 28 = 236 ≤ 306, trzeci chip (100) z „+N” by się nie zmieścił.
  const tight = { ...span, x1: 460 };
  const r = layoutDockChips([100, 100, 100, 100], tight);
  T('4.1 dwa chipy + „+N”', r.chips.length === 2 && r.more !== null);
  T('4.2 „+N” — N = liczba niewidocznych (2), first = 2', r.more?.count === 2 && r.more?.first === 2);
  T('4.3 „+N” po ostatnim chipie (x 154 + 2·104), szerokość moreW', r.more?.x === 154 + 208 && r.more?.w === 28);
  T('4.4 „+N” mieści się w rzędzie', r.more && r.more.x + r.more.w <= 460);
  // Wszystkie się mieszczą bez „+N”, choć z rezerwą na „+N” by się nie zmieściły — bez chipa „+N”.
  const exact = layoutDockChips([100, 100], { ...span, x1: 154 + 204 });
  T('4.5 dokładnie na styk — oba chipy, bez „+N”', HAS && exact.chips.length === 2 && exact.more === null);
  // Rząd węższy niż sam „+N” — nic.
  const none = layoutDockChips([100, 100], { ...span, x1: 154 + 20 });
  T('4.6 rząd węższy niż „+N” → brak chipów i „+N”', HAS && none.chips.length === 0 && none.more === null);
  // Rząd na sam „+N” (pierwszy chip z rezerwą się nie mieści) — „+N” z całością.
  const onlyMore = layoutDockChips([100, 100], { ...span, x1: 154 + 60 });
  T('4.7 miejsce tylko na „+N” → „+N” ze wszystkimi', onlyMore.chips.length === 0 && onlyMore.more?.count === 2 && onlyMore.more?.first === 0);
}

// ── T5 — index mapuje wpis ───────────────────────────────────────────────────
{
  const r = layoutDockChips([50, 50, 50, 50], span);
  T('5.1 indeksy 0..3', r.chips.map(z => z.index).join(',') === '0,1,2,3');
}

console.log(`\nS3.4b C2 PanelDock smoke: ${pass}/${pass + fail} ${fail === 0 ? 'PASS' : 'FAIL'}`);
process.exit(fail === 0 ? 0 : 1);
