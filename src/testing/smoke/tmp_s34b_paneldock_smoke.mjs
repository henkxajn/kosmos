// S3.4b C2 — smoke: PanelDockLogic.computeDockSlots (czysta logika slotów doku).
// Uruchom: node src/testing/smoke/tmp_s34b_paneldock_smoke.mjs
//   T1 pusty dok → []
//   T2 1 belka → pozycja bazowa (lewy-dół nad rezerwą) + wymiary
//   T3 N belek → stack PIONOWO W GÓRĘ (malejące y, krok = barH+gap) + x/w stałe
//   T4 overflow guard (topLimit) → obcięcie liczby belek
//   T5 index w slocie mapuje na wpis

const { computeDockSlots } = await import('../../ui/PanelDockLogic.js');

let pass = 0, fail = 0;
const T = (name, cond) => { if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name}`); } };

const geom = { H: 800, barW: 156, barH: 24, gap: 4, leftX: 8, bottomReserved: 42, marginBottom: 6, topLimit: 46 };
const baseY = 800 - 42 - 6 - 24;   // 728

// ── T1 — pusty ─────────────────────────────────────────────────────────────
T('1.1 count=0 → []', JSON.stringify(computeDockSlots(0, geom)) === '[]');

// ── T2 — jedna belka ────────────────────────────────────────────────────────
{
  const s = computeDockSlots(1, geom);
  T('2.1 jedna belka', s.length === 1);
  T('2.2 y = baseY', s[0].y === baseY);
  T('2.3 x = leftX', s[0].x === 8);
  T('2.4 w = barW', s[0].w === 156);
  T('2.5 h = barH', s[0].h === 24);
  T('2.6 index = 0', s[0].index === 0);
}

// ── T3 — stack w górę ────────────────────────────────────────────────────────
{
  const s = computeDockSlots(3, geom);
  T('3.1 trzy belki', s.length === 3);
  T('3.2 i=0 najniżej (baseY)', s[0].y === baseY);
  T('3.3 stack w GÓRĘ (malejące y)', s[0].y > s[1].y && s[1].y > s[2].y);
  T('3.4 krok = barH+gap (28)', (s[0].y - s[1].y) === 28 && (s[1].y - s[2].y) === 28);
  T('3.5 x stałe', s.every(z => z.x === 8));
  T('3.6 w stałe', s.every(z => z.w === 156));
}

// ── T4 — overflow guard ──────────────────────────────────────────────────────
{
  // Niska wysokość → tylko najniższa belka mieści się nad topLimit.
  const tight = { H: 120, barW: 156, barH: 24, gap: 4, leftX: 8, bottomReserved: 42, marginBottom: 6, topLimit: 46 };
  const bY = 120 - 42 - 6 - 24;   // 48
  T('4.1 baseY (tight) = 48', bY === 48);
  const s = computeDockSlots(3, tight);
  T('4.2 overflow → tylko 1 belka (2. na y=20 < topLimit 46)', s.length === 1);
  T('4.3 mieszcząca się belka na baseY', s[0].y === 48);
  // topLimit=0 → nadal chroni przed ujemnym y (3. belka na y=-8 odpada)
  const s2 = computeDockSlots(3, { ...tight, topLimit: 0 });
  T('4.4 topLimit=0 → 2 belki (3. na y=-8 < 0 odpada)', s2.length === 2);
  // topLimit ujemny (wyłącznik guardu) → wszystkie 3
  const s3 = computeDockSlots(3, { ...tight, topLimit: -1000 });
  T('4.5 topLimit=-1000 → wszystkie 3', s3.length === 3);
}

// ── T5 — index mapuje wpis ───────────────────────────────────────────────────
{
  const s = computeDockSlots(4, geom);
  T('5.1 indeksy 0..3', s.map(z => z.index).join(',') === '0,1,2,3');
}

console.log(`\nS3.4b C2 PanelDock smoke: ${pass}/${pass + fail} ${fail === 0 ? 'PASS' : 'FAIL'}`);
process.exit(fail === 0 ? 0 : 1);
