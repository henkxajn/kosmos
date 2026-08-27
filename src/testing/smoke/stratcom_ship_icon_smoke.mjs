// Finding 110 — keeper: IKONA STATKU NA MAPIE GALAKTYKI JEST KLIKALNA.
// Plan: docs/design/STRATCOM_SHIP_ICON_PLAN.md (S1-S7 = podpisane). Audyt: docs/audit/STRATCOM_110_159_160_AUDIT.md §1.
//
// PO CO: ikona wlasnego statku rysuje sie STRATCOM_FAN_DY = -13 px NAD gwiazda, a strefa
// `cluster_star` siega tylko `hitR = max(r+5, 11)` w gore ⇒ SRODEK IKONY NIE LEZY W STREFIE NIGDY
// (zmierzone: 81 % ikony poza strefa nawet przy jednym statku). Wachlarz rozsuwa ikony o ±22,5 px
// przy polszerokosci strefy 11, wiec skrajne ikony szesciostatkowego wachlarza maja z gwiazda
// 0 % wspolnego pola. Ikony W TRANZYCIE warp (`starS: null`, rysowane MIEDZY gwiazdami) nie maja
// w poblizu ZADNEJ strefy. Klik tam byl cicho polykany przez terminalne `return true`.
//
// ⚠ WARIANT (c), PODPISANY: ikona przechwytuje WLASNY klik (wybiera STATEK, typ `warp_ship_select`
//   — reuse handlera z listy po lewej), a reszta strefy gwiazdy dziala jak dzis (wybiera UKLAD).
//   Jedyny wariant spojny ze statkami w tranzycie, ktore nie maja obok siebie gwiazdy.
//
// ⚠ SZEROKOSC STREFY == KROK WACHLARZA i to jest decyzja projektowa (S3), nie przypadek: strefy
//   ikon KAFELKUJA wachlarz i nie nachodza na siebie. Szersze strefy wymagalyby tie-breaku miedzy
//   ikonami, czyli dokladnie tej dwuznacznosci, ktora usuwal Finding 109. T6 mierzy krok
//   Z REALNEJ SCIEZKI RYSUJACEJ (odleglosc srodkow kolejnych ikon), wiec nie duplikuje stalej.
//
// ⚠ CULL WIDOCZNOSCI JEST OBOWIAZKOWY (S4), nie kosmetyczny. `ctx.clip()` przycina RYSOWANIE, ale
//   `_hitZones` to zwykle prostokaty — clip ich nie dotyczy. Petla gwiazd ma jawny cull i DLATEGO
//   strefy gwiazd nie uciekaja poza mape; petla blipow culla nie miala, bo dotad tylko rysowala.
//   Bez culla strefa ikony z ukladu poza kadrem wyladowalaby NAD LEWA LISTA statkow warp — a ze
//   lista rysuje sie WCZESNIEJ, phantom pushowany POZNIEJ wygralby `topMostZoneAt`. T7 to pinuje.
//
//   T1  klik w ikone (flota 1) → `warp_ship_select` z wlasciwym vesselId   (fail-first)
//   T2  klik w KAZDA z 6 ikon wachlarza → TA ikona, 6/6; licznik „+N" bez strefy  (fail-first)
//   T3  ikona W TRANZYCIE warp → `warp_ship_select`                        (fail-first)
//   T4  STRAZNIK: klik w gwiazde dalej `cluster_star`
//   T5  STRAZNIK (E3/Z1): absorber `warp_order_bg` nadal bije ikone + kontrola pinu
//   T6  strefy ikon KAFELKUJA wachlarz — 0 par nachodzacych (pin projektowy S3)
//   T7  CULL (S4): blip poza kadrem NIE pushuje strefy + kontrola pinu       (fail-first)
//   T8  TRIPWIRE (S1): strefa `cluster_star` jest SYMETRYCZNA wokol glifu
//   T9  regresja 109: `pickStarZone` przy dolozonych strefach ikon dalej po najblizszym glifie

import '../headless/env.js';           // MUSI byc pierwszy
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FleetManagerOverlay } from '../../ui/FleetManagerOverlay.js';
import { resolveStratcomZone } from '../../ui/StratcomHitLogic.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// Prostokat mapy galaktyki. Lewa lista statkow warp zyje na LEWO od niego (x < VIEW.x) —
// to jest realny cel phantom-strefy z T7.
const VIEW = { x: 200, y: 100, w: 800, h: 500 };

/** ctx-atrapa rejestrujaca REALNE wspolrzedne rysowania (wzor: probe z audytu §1). */
function recCtx() {
  const pts = [];
  return {
    save() {}, restore() {}, beginPath() {}, closePath() {}, fill() {}, stroke() {},
    moveTo(x, y) { pts.push([x, y]); }, lineTo(x, y) { pts.push([x, y]); },
    arc() {}, fillText() {}, measureText() { return { width: 0 }; },
    _pts: pts,
  };
}
const drawnCenter = (pts) => pts.length
  ? { x: (Math.min(...pts.map(p => p[0])) + Math.max(...pts.map(p => p[0]))) / 2,
      y: (Math.min(...pts.map(p => p[1])) + Math.max(...pts.map(p => p[1]))) / 2 }
  : null;

function mkOverlay() {
  const o = Object.create(FleetManagerOverlay.prototype);
  o._selectedWarpShipId = null;
  o._hitZones = [];
  return o;
}

/** Strefa gwiazdy dokladnie tak, jak buduje ja petla gwiazd (`hitR = max(r+5, 11)`). */
const starZone = (systemId, sx, sy, hitR = 11) =>
  ({ x: sx - hitR, y: sy - hitR, w: hitR * 2, h: hitR * 2, type: 'cluster_star', data: { systemId } });

/**
 * Jeden krok petli blipow: narysuj ikone (prawdziwa sciezka) i pushnij strefe (prawdziwa metoda).
 * Zwraca { at, drawn } — `at` to punkt ZWROCONY przez `_drawStratcomOwnBlip`, `drawn` to punkt
 * ZMIERZONY z realnego rysowania. Rozjazd miedzy nimi = dwa niezalezne rachunki tej samej
 * geometrii, czyli dokladnie ta klasa, ktora naprawial Finding 109.
 */
function drawAndPush(o, e, sx, sy, view = VIEW) {
  const c = recCtx();
  const at = o._drawStratcomOwnBlip(c, e, sx, sy);
  const drawn = drawnCenter(c._pts);
  // fail-first: przed naprawa metody nie ma ⇒ zadna strefa nie powstaje (klik polkniety)
  if (typeof o._pushShipBlipHitZone === 'function') o._pushShipBlipHitZone(e, at, view);
  return { at, drawn };
}

const blip = (id, fanIdx = 0, fanCount = 1, inTransit = false) =>
  ({ v: { id }, fanIdx, fanCount, inTransit, starS: inTransit ? null : { id: 'sys_A' } });

const pickAt = (zones, p) => resolveStratcomZone(zones, p.x, p.y);

// ── T1 — rdzen: pojedynczy statek ──
console.log('\nT1 — klik w ikone pojedynczego statku');
{
  const o = mkOverlay();
  const SX = 400, SY = 300;
  const { at, drawn } = drawAndPush(o, blip('v_alfa'), SX, SY);

  assert(drawn !== null, 'kontrola pinu: ikona realnie sie narysowala');
  assert(drawn.y < SY - 8, `kontrola pinu: ikona lezy NAD gwiazda (y=${drawn?.y} < ${SY - 8})`);
  // ⚠ Tolerancja 1 px w OSI Y jest ZMIERZONA, nie na wyrost: trojkat statku rysuje sie
  //   NIESYMETRYCZNIE wzgledem kotwicy (wierzcholek −4,5, podstawa +3,5), wiec srodek jego bboxa
  //   lezy dokladnie 0,5 px NAD punktem kotwiczenia. Realny rozjazd, ktorego ten pin pilnuje
  //   (zly indeks wachlarza), ma skale KROKU WACHLARZA = 9 px — tolerancja go nie przepusci.
  assert(at && at.x === drawn.x && Math.abs(at.y - drawn.y) <= 1,
    `\`_drawStratcomOwnBlip\` ZWRACA punkt kotwiczenia ikony (zwrocil ${at ? `${at.x},${at.y}` : 'null'}, narysowany srodek ${drawn.x},${drawn.y}) — jedno zrodlo geometrii`);

  const zones = [starZone('sys_A', SX, SY), ...o._hitZones];
  const hit = pickAt(zones, drawn);
  assert(hit?.type === 'warp_ship_select', `klik w ikone → warp_ship_select (dostal: ${hit?.type ?? 'BRAK — klik polkniety'})`);
  assert(hit?.data?.vesselId === 'v_alfa', 'trafiony wlasciwy statek');

  const star = resolveStratcomZone(zones, SX, SY);
  assert(star?.type === 'cluster_star', 'kontrola pinu: klik w srodek gwiazdy dalej wybiera UKLAD');
}

// ── T2 — wachlarz: kazda ikona swoja ──
console.log('\nT2 — wachlarz 6 statkow: kazda ikona trafia SWOJ statek');
{
  const o = mkOverlay();
  const SX = 400, SY = 300;
  const drawnPts = [];
  for (let i = 0; i < 6; i++) drawnPts.push(drawAndPush(o, blip('v_' + i, i, 6), SX, SY).drawn);

  const zones = [starZone('sys_A', SX, SY), ...o._hitZones];
  let ok = 0;
  for (let i = 0; i < 6; i++) {
    const hit = pickAt(zones, drawnPts[i]);
    if (hit?.type === 'warp_ship_select' && hit.data.vesselId === 'v_' + i) ok++;
  }
  assert(ok === 6, `kazda z 6 ikon trafia swoj statek (${ok}/6)`);

  // skrajne ikony leza CALKOWICIE poza strefa gwiazdy — to one byly najgorsze przed naprawa
  const sz = starZone('sys_A', SX, SY);
  const outside = drawnPts.filter(p => p.x < sz.x || p.x > sz.x + sz.w).length;
  assert(outside >= 2, `kontrola pinu: >=2 ikony leza poza strefa gwiazdy takze w poziomie (${outside})`);

  // licznik „+N" (fanIdx >= STRATCOM_FAN_MAX) — rysuje tekst, nie statek ⇒ BEZ strefy (S6)
  const o2 = mkOverlay();
  const before = o2._hitZones.length;
  const { at } = drawAndPush(o2, blip('v_nadmiar', 6, 9), SX, SY);
  assert(at === null || at === undefined, 'licznik „+N" nie zwraca punktu ikony');
  assert(o2._hitZones.length === before, 'licznik „+N" nie pushuje strefy (S6)');
}

// ── T3 — statek w tranzycie warp (brak gwiazdy w poblizu) ──
console.log('\nT3 — ikona statku W TRANZYCIE warp');
{
  const o = mkOverlay();
  // punkt miedzy gwiazdami: zadna strefa `cluster_star` tam nie siega
  const TX = 600, TY = 350;
  const { at, drawn } = drawAndPush(o, blip('v_tranzyt', 0, 1, true), TX, TY);

  assert(drawn !== null, 'kontrola pinu: ikona tranzytowa realnie sie narysowala');
  assert(at && at.x === drawn.x && Math.abs(at.y - drawn.y) <= 1,
    'tranzyt: zwrocony punkt == punkt kotwiczenia (ta sama tolerancja 0,5 px co T1 — asymetria trojkata)');
  assert(drawn.y > TY - 8, 'kontrola pinu: tranzyt NIE dostaje offsetu wachlarza (ikona w punkcie trasy)');

  const zonesBez = [starZone('sys_A', 400, 300)];
  assert(resolveStratcomZone(zonesBez, drawn.x, drawn.y) === null,
    'kontrola pinu: bez strefy ikony klik w tranzyt trafia w PUSTKE (stan sprzed naprawy)');

  const hit = pickAt([...zonesBez, ...o._hitZones], drawn);
  assert(hit?.type === 'warp_ship_select' && hit.data.vesselId === 'v_tranzyt',
    `klik w ikone tranzytowa → warp_ship_select (dostal: ${hit?.type ?? 'BRAK'})`);
}

// ── T4 — STRAZNIK: gwiazda dalej wybiera uklad ──
console.log('\nT4 — STRAZNIK: strefa gwiazdy nietknieta');
{
  const o = mkOverlay();
  const SX = 400, SY = 300;
  drawAndPush(o, blip('v_alfa'), SX, SY);
  const zones = [starZone('sys_A', SX, SY), ...o._hitZones];
  assert(resolveStratcomZone(zones, SX, SY)?.type === 'cluster_star', 'srodek gwiazdy → cluster_star');
  assert(resolveStratcomZone(zones, SX, SY + 8)?.type === 'cluster_star', 'dol strefy gwiazdy → cluster_star');
  assert(resolveStratcomZone(zones, SX + 8, SY)?.type === 'cluster_star', 'bok strefy gwiazdy → cluster_star');
}

// ── T5 — STRAZNIK (E3/Z1): absorber panelu rozkazu nadrzedny ──
console.log('\nT5 — STRAZNIK: absorber `warp_order_bg` bije ikone');
{
  const o = mkOverlay();
  const SX = 400, SY = 300;
  const { drawn } = drawAndPush(o, blip('v_alfa'), SX, SY);
  const base = [starZone('sys_A', SX, SY), ...o._hitZones];

  const hitBez = pickAt(base, drawn);
  assert(hitBez?.type === 'warp_ship_select', 'kontrola pinu: bez absorbera klik trafia ikone');

  const zAbs = [...base, { x: 300, y: 250, w: 200, h: 120, type: 'warp_order_bg', data: {} }];
  assert(pickAt(zAbs, drawn)?.type === 'warp_order_bg',
    'z absorberem: klik w ikone POD panelem rozkazu → panel, nie statek');
}

// ── T6 — pin projektowy S3: strefy ikon KAFELKUJA, nie nachodza ──
console.log('\nT6 — strefy ikon kafelkuja wachlarz (pin decyzji S3)');
{
  const o = mkOverlay();
  const SX = 400, SY = 300;
  const pts = [];
  for (let i = 0; i < 6; i++) pts.push(drawAndPush(o, blip('v_' + i, i, 6), SX, SY).drawn);

  // krok wachlarza MIERZONY z realnej sciezki rysujacej — bez duplikowania stalej w tescie
  const step = Math.abs(pts[1].x - pts[0].x);
  assert(step > 0, `kontrola pinu: krok wachlarza zmierzony z rysowania = ${step} px`);

  const zs = o._hitZones.filter(z => z.type === 'warp_ship_select');
  assert(zs.length === 6, `powstalo 6 stref ikon (${zs.length})`);
  // ⚠ OBA ponizsze piny musza wymagac NIEPUSTEGO zbioru — `every` i petla par przechodza
  //   JALOWO na pustej tablicy, czyli swiecilyby na zielono dokladnie tam, gdzie jest defekt.
  assert(zs.length === 6 && zs.every(z => z.w <= step),
    `szerokosc strefy (${zs[0]?.w ?? 'BRAK STREF'}) <= krok wachlarza (${step}) ⇒ brak nakladania z konstrukcji`);

  let overlaps = 0;
  for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) {
    const a = zs[i], b = zs[j];
    if (Math.abs((a.x + a.w / 2) - (b.x + b.w / 2)) < a.w
     && Math.abs((a.y + a.h / 2) - (b.y + b.h / 2)) < a.h) overlaps++;
  }
  assert(zs.length === 6 && overlaps === 0, `0 par nachodzacych stref ikon (${overlaps}, stref: ${zs.length})`);
}

// ── T7 — CULL (S4): blip poza kadrem nie pushuje strefy ──
console.log('\nT7 — CULL: blip poza kadrem mapy NIE tworzy phantom-strefy');
{
  const o = mkOverlay();
  // ikona wyladowalaby NA LEWO od mapy — tam, gdzie zyje lewa lista statkow warp
  drawAndPush(o, blip('v_poza'), VIEW.x - 120, 300);
  assert(o._hitZones.length === 0,
    `blip poza kadrem: 0 stref (dostal: ${o._hitZones.length}) — inaczej phantom nad lewa lista`);

  const o2 = mkOverlay();
  drawAndPush(o2, blip('v_w_kadrze'), VIEW.x + 200, 300);
  assert(o2._hitZones.length === 1, 'kontrola pinu: blip W KADRZE tworzy strefe (cull nie jest za ostry)');

  // druga strona kadru — symetria bramki
  const o3 = mkOverlay();
  drawAndPush(o3, blip('v_prawo'), VIEW.x + VIEW.w + 120, 300);
  assert(o3._hitZones.length === 0, 'blip poza PRAWA krawedzia: 0 stref');

  const o4 = mkOverlay();
  drawAndPush(o4, blip('v_dol'), VIEW.x + 200, VIEW.y + VIEW.h + 120);
  assert(o4._hitZones.length === 0, 'blip pod DOLNA krawedzia: 0 stref');
}

// ── T8 — TRIPWIRE (S1): strefa gwiazdy MUSI zostac symetryczna wokol glifu ──
console.log('\nT8 — TRIPWIRE: `cluster_star` symetryczna wokol glifu (chroni kanon 109)');
{
  const src = readFileSync(fileURLToPath(new URL('../../ui/FleetManagerOverlay.js', import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')     // bloki
    .replace(/^\s*\/\/.*$/gm, '');        // linie komentarza (lekcja: source-pin-strip-comments)
  const push = src.split('\n').find(l => l.includes("type: 'cluster_star'"));
  assert(!!push, 'kontrola pinu: linia pushu strefy `cluster_star` znaleziona w zrodle');
  const symmetric = /x:\s*sx\s*-\s*hitR\s*,\s*y:\s*sy\s*-\s*hitR\s*,\s*w:\s*hitR\s*\*\s*2\s*,\s*h:\s*hitR\s*\*\s*2/.test(push ?? '');
  assert(symmetric,
    'strefa gwiazdy jest SYMETRYCZNA (sx±hitR, sy±hitR). ⚠ JESLI TO PADLO: ktos rozciagnal strefe. '
    + '`pickStarZone` liczy odleglosc do SRODKA STREFY, wiec asymetria PRZESUWA kotwice celowania '
    + 'i cofa Finding 109 (zmierzone: 2 przewroty dla gwiazd roznych w osi Y; okno nakladania +59%). '
    + 'Zanim rozciagniesz — dodaj JAWNA kotwice `data.cx/cy` i naucz `pickStarZone` jej uzywac '
    + '(zmierzone: z kotwica 4/4 poprawnych tam, gdzie bez niej 2 przewroty). Plan: STRATCOM_SHIP_ICON_PLAN.md §3/S1.');
}

// ── T9 — regresja 109 przy dolozonych strefach ikon ──
console.log('\nT9 — regresja 109: rozstrzyganie miedzy gwiazdami nietkniete przez strefy ikon');
{
  const o = mkOverlay();
  const A = { sx: 400, sy: 300 }, B = { sx: 414, sy: 300 };
  drawAndPush(o, blip('v_a'), A.sx, A.sy);
  const zones = [starZone('sys_A', A.sx, A.sy), starZone('sys_B', B.sx, B.sy), ...o._hitZones];

  // kursor blizej A, na wysokosci gwiazd (ponizej pasma ikony)
  const nearA = resolveStratcomZone(zones, 403, 302);
  assert(nearA?.type === 'cluster_star' && nearA.data.systemId === 'sys_A',
    'kursor blizej sys_A → sys_A (kanon 109 dziala mimo stref ikon)');
  const nearB = resolveStratcomZone(zones, 411, 302);
  assert(nearB?.type === 'cluster_star' && nearB.data.systemId === 'sys_B',
    'kursor blizej sys_B → sys_B');
}

console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} — pass ${pass} / fail ${fail}`);
process.exit(fail === 0 ? 0 : 1);
