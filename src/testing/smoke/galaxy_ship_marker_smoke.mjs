// Keeper ARC GALAXY, krok G2 / T5 — ZNACZNIK STATKU NA PŁYCIE (docs/design/GALAXY_PLAN.md §4 G2; idiom SM-1 mapy układu).
// Protokół lekki F8: keeper wyłącznie dla LOGIKI (tabela kształt × rola, agregacja floty, końce trasy, mgła obcych,
// rozstrzygacz relacji) — bez pinów na stałych rysunku i bez kontroli na poprzednim commicie.
//   M0  API modułu `GalaxyShipMarkerLogic`
//   M1  tabela kształtu i roli: tranzyt → daszek, przy gwieździe → romb; własny `primary` / obcy `foreign` / wróg `alert`;
//       zaznaczony = grubsza kreska i pełne krycie (stałe SM-1 reużyte, nie kopiowane)
//   M2  geometria: daszek WYCENTROWANY na punkcie trasy, obrócony w kierunku podróży (także kierunek zerowy → w prawo);
//       romb nad kwadratem trafienia gwiazdy
//   M3  agregacja floty: ≥ 2 członków na jednym przeskoku = JEDEN znacznik w środku ciężkości z licznikiem; pojedynczy,
//       flota rozproszona po różnych celach i samotny członek floty — bez zbijania; zaznaczony członek podświetla całość
//   M4  końce trasy: flota — od układu ODLOTU, pojedynczy — od punktu tranzytu, brak celu → nic
//   M5  mgła obcych: `contact` → znacznik, `rumor` → duch, reszta → nic; krycie × `intelOpacity`
//   M6  rozstrzygacz relacji: własny / obcy / wróg (wojna, pasmo wrogie, rajder bez imperium), pamięć per imperium, wyjątek
//       zależności ≠ wrogość
//   M7  indeks floty (członkostwo z `listFleets`, zapas `vessel.fleetId`), napis „×N”, kotwica napisu, strefa kliku, przeszkoda
//   M8  piny źródłowe: zero kolorów i zero kopii stałych SM-1 w module logiki; warstwa szyny rysuje przez `shipMarkerSpec`
//   M9  BATERIA MUTACYJNA (zamiennik fail-first: moduł powstaje w tym kroku, więc na HEAD nie ma czego uruchomić) — każda z
//       mutacji logiki musi zostać ZABITA przez co najmniej jeden pin M1–M7
// Uruchom: node src/testing/smoke/galaxy_ship_marker_smoke.mjs
import '../headless/env.js';           // MUSI być pierwszy
import fs from 'node:fs';

let pass = 0, fail = 0;
const header = (s) => console.log(`\n── ${s}`);
const near = (a, b, e = 1e-6) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const urlOf = (rel) => new URL(rel, import.meta.url);
const readSrc = (rel) => fs.readFileSync(urlOf(rel), 'utf8').replace(/\r\n/g, '\n');

let SM = null, HM = null, GL = null;
try { SM = await import('../../ui/GalaxyShipMarkerLogic.js'); } catch (e) { console.log('  (GalaxyShipMarkerLogic:', e.message + ')'); }
try { HM = await import('../../ui/HudShipMarkerLogic.js'); } catch (e) { console.log('  (HudShipMarkerLogic:', e.message + ')'); }
try { GL = await import('../../ui/GalaxyModeLogic.js'); } catch (e) { console.log('  (GalaxyModeLogic:', e.message + ')'); }

/**
 * Zestaw pinów logiki na DOWOLNYM module (prawdziwym albo zmutowanym). Zwraca { n, fails }.
 * Pin musi DEGRADOWAĆ, nie PRZERYWAĆ: wołanie funkcji, której nie ma, daje wyjątek-tekst, a nie przerwanie przebiegu.
 */
function suite(M, say) {
  const fails = [];
  let n = 0;
  const ok = (c, m) => { n++; if (c) say('  ✓', m); else { fails.push(m); say('  ✗ FAIL:', m); } };
  const call = (fn, ...a) => { try { return typeof fn === 'function' ? fn(...a) : undefined; } catch (e) { return `WYJĄTEK: ${e.message}`; } };
  const hdr = (s) => say(`\n── ${s}`);
  const MS = HM.HUD_SHIP_MARKER;
  const R = GL.GALAXY_PICK_HALF_PX;

  // ── M0 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  hdr('M0 API modułu');
  for (const name of ['GALAXY_SHIP_MARKER', 'unitDir', 'shiftGeometry', 'transitGeometry', 'parkedGeometry', 'shipMarkerSpec',
    'makeRelationResolver', 'buildFleetIndex', 'groupTransitByFleet', 'fleetTag', 'tagAnchor', 'markerHitRect',
    'markerObstacle', 'foreignDrawKind', 'routeEndpoints', 'anySelected']) {
    ok(M[name] !== undefined, `eksport ${name}`);
  }

  // ── M1 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  hdr('M1 tabela kształtu i roli');
  const ROLE_OF = { own: 'primary', foreign: 'foreign', enemy: 'alert' };     // tabela oczekiwań (nie z kodu)
  for (const motion of ['transit', 'parked']) {
    for (const relation of ['own', 'foreign', 'enemy']) {
      const sp = call(M.shipMarkerSpec, { motion, relation, cx: 100, cy: 80, dir: { x: 1, y: 0 } });
      ok(sp && sp.kind === (motion === 'transit' ? 'chevron' : 'diamond'), `${motion}/${relation}: kształt ${motion === 'transit' ? 'daszek' : 'romb'}`);
      ok(sp && sp.role === ROLE_OF[relation], `${motion}/${relation}: rola ${ROLE_OF[relation]}`);
    }
  }
  const spU = call(M.shipMarkerSpec, { motion: 'transit', relation: 'own', selected: false, cx: 10, cy: 10, dir: { x: 1, y: 0 } });
  const spS = call(M.shipMarkerSpec, { motion: 'transit', relation: 'own', selected: true, cx: 10, cy: 10, dir: { x: 1, y: 0 } });
  ok(spU && near(spU.width, MS.MARKER_WIDTH), 'niezaznaczony: kreska = MARKER_WIDTH SM-1 (stała reużyta)');
  ok(spU && spS && spS.width > spU.width && near(spS.width / spU.width, M.GALAXY_SHIP_MARKER.SELECTED_WIDTH_MUL), 'zaznaczony: kreska grubsza o SELECTED_WIDTH_MUL');
  ok(spU && spS && spS.alpha > spU.alpha && near(spS.alpha, MS.SELECTED_ALPHA) && near(spU.alpha, MS.MARKER_ALPHA), 'krycie: zaznaczony = SELECTED_ALPHA, niezaznaczony = MARKER_ALPHA');
  ok(spU && spU.selected === false && spS && spS.selected === true, 'pole `selected` w opisie');
  ok(call(M.shipMarkerSpec, { motion: 'bzdura', relation: 'own', cx: 0, cy: 0 })?.motion === 'parked', 'nieznany ruch → romb (bez wyjątku)');

  // ── M2 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  hdr('M2 geometria');
  const H2 = MS.MARKER_H / 2;
  const gR = call(M.transitGeometry, { cx: 100, cy: 50, dir: { x: 1, y: 0 } });
  ok(gR && gR.kind === 'chevron' && gR.closed === false, 'tranzyt: daszek otwarty');
  ok(gR && near(gR.pts[2], 100 + H2) && near(gR.pts[3], 50), 'dir (1,0): wierzchołek w przód o MARKER_H/2 od punktu trasy');
  ok(gR && near(gR.pts[0], 100 - H2) && near(gR.pts[4], 100 - H2) && near(gR.pts[1], 50 + MS.MARKER_W / 2) && near(gR.pts[5], 50 - MS.MARKER_W / 2),
    'dir (1,0): podstawa za punktem, rozpiętość MARKER_W (daszek WYCENTROWANY na trasie)');
  ok(gR && near(gR.rect.x + gR.rect.w / 2, 100, 1) && near(gR.rect.y + gR.rect.h / 2, 50, 1), 'prostokąt znacznika wokół punktu trasy');
  const gD = call(M.transitGeometry, { cx: 100, cy: 50, dir: { x: 0, y: 1 } });
  ok(gD && near(gD.pts[2], 100) && near(gD.pts[3], 50 + H2), 'dir (0,1): wierzchołek w dół');
  const gN = call(M.transitGeometry, { cx: 100, cy: 50, dir: { x: 3, y: 4 } });
  ok(gN && near(gN.pts[2], 100 + 0.6 * H2) && near(gN.pts[3], 50 + 0.8 * H2), 'dir nieunormowany (3,4) → kierunek (0,6; 0,8)');
  for (const bad of [null, { x: 0, y: 0 }, { x: NaN, y: 1 }, { x: Infinity, y: 1 }, {}]) {
    const g = call(M.transitGeometry, { cx: 100, cy: 50, dir: bad });
    ok(g && g.kind === 'chevron' && near(g.pts[2], 100 + H2), `kierunek ${JSON.stringify(bad)} → daszek w prawo (tranzyt nigdy nie degraduje do rombu)`);
  }
  ok(call(M.unitDir, { x: 0, y: 5 })?.y === 1 && call(M.unitDir, { x: 0, y: 0 })?.x === 1, 'unitDir: normalizacja i zapas (1,0)');
  const gP = call(M.parkedGeometry, { cx: 100, cy: 50 });
  ok(gP && gP.kind === 'diamond' && gP.closed === true, 'przy gwieździe: romb zamknięty');
  ok(gP && gP.rect.y + gP.rect.h <= 50 - R + 1e-6, 'romb stoi NAD kwadratem trafienia gwiazdy (nie zasłania celu kliku)');
  ok(gP && near(gP.rect.x + gP.rect.w / 2, 100, 1), 'romb wyśrodkowany nad gwiazdą');
  const gSh = call(M.shiftGeometry, gR, 5, -2);
  ok(gSh && near(gSh.pts[0], gR.pts[0] + 5) && near(gSh.pts[1], gR.pts[1] - 2) && near(gSh.rect.x, gR.rect.x + 5) && near(gSh.rect.y, gR.rect.y - 2) && near(gSh.rect.w, gR.rect.w),
    'shiftGeometry przesuwa punkty i prostokąt, rozmiar bez zmian');

  // ── M3 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  hdr('M3 agregacja floty');
  const E = (id, gx, fromId = 'A', toId = 'B') => ({ v: { id }, gx, gy: 0, gz: 0, fromId, toId });
  const fleetOf = (map) => (id) => (map[id] ?? null);
  const entries = [E('a1', 0), E('a2', 2), E('a3', 4), E('s1', 9), E('b1', 20, 'A', 'B'), E('b2', 22, 'A', 'C'), E('c1', 30)];
  const fm = { a1: 'F1', a2: 'F1', a3: 'F1', b1: 'F2', b2: 'F2', c1: 'F3' };
  const groups = call(M.groupTransitByFleet, entries, fleetOf(fm), new Set()) ?? [];
  const byLead = (id) => (Array.isArray(groups) ? groups.find((g) => String(g.leadId) === id) : null);
  const gF1 = byLead('a1');
  ok(Array.isArray(groups) && groups.length === 5, 'F1 (3) + singleton + F2 rozproszona (2) + samotny F3 = 5 znaczników');
  ok(gF1 && gF1.fleet === true && gF1.count === 3 && gF1.ids.length === 3, 'F1: JEDEN znacznik floty z licznikiem 3');
  ok(gF1 && near(gF1.gx, 2) && near(gF1.gy, 0) && near(gF1.gz, 0), 'F1: pozycja = środek ciężkości członków');
  ok(gF1 && gF1.fromId === 'A' && gF1.toId === 'B' && gF1.fleetId === 'F1' && gF1.key === 'fF1|A|B', 'F1: przeskok i klucz grupy');
  const gS = byLead('s1');
  ok(gS && gS.fleet === false && gS.count === 1 && gS.fleetId === null && gS.key === 'vs1' && gS.ids.length === 1, 'statek bez floty: pojedynczy znacznik');
  const gB1 = byLead('b1'), gB2 = byLead('b2');
  ok(gB1 && gB2 && gB1.fleet === false && gB2.fleet === false && gB1.count === 1 && gB2.count === 1, 'członkowie jednej floty na RÓŻNYCH przeskokach nie zbijają się');
  const gC = byLead('c1');
  ok(gC && gC.fleet === false && gC.count === 1 && gC.key === 'vc1', 'samotny członek floty (jeden w tranzycie) → pojedynczy, bez „×1”');
  const gSel = call(M.groupTransitByFleet, entries, fleetOf(fm), new Set(['a2'])) ?? [];
  const selF1 = Array.isArray(gSel) ? gSel.find((g) => String(g.leadId) === 'a1') : null;
  const selS = Array.isArray(gSel) ? gSel.find((g) => String(g.leadId) === 's1') : null;
  ok(selF1 && selF1.selected === true, 'zaznaczony JEDEN członek (nie prowadzący) podświetla cały znacznik floty');
  ok(selS && selS.selected === false, 'zaznaczenie floty nie dotyka obcego znacznika (świadek: pojedynczy niezaznaczony)');
  ok(Array.isArray(groups) && groups.filter((g) => g.selected).length === 0, 'bez zaznaczenia nic nie jest podświetlone');
  const gRev = call(M.groupTransitByFleet, entries.slice().reverse(), fleetOf(fm), new Set()) ?? [];
  const revF1 = Array.isArray(gRev) ? gRev.find((g) => g.fleet && g.fleetId === 'F1') : null;
  ok(revF1 && revF1.leadId === 'a1' && near(revF1.gx, 2) && revF1.ids.join() === 'a1,a2,a3', 'kolejność wejścia nie zmienia prowadzącego, środka ani listy członków');
  ok(Array.isArray(call(M.groupTransitByFleet, [null, { gx: 1 }], null)) && call(M.groupTransitByFleet, [null, { gx: 1 }], null).length === 0, 'wpisy bez statku pominięte');

  // ── M4 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  hdr('M4 końce trasy');
  const A = { id: 'A', x: 10, y: 0, z: 0 }, B = { id: 'B', x: 20, y: 5, z: 0 }, C = { id: 'C', x: 40, y: 0, z: 0 };
  const byId = new Map([['A', A], ['B', B], ['C', C]]);
  const epF = call(M.routeEndpoints, gF1, byId);
  ok(epF && near(epF.from.x, 10) && near(epF.from.y, 0) && epF.to === B, 'flota: trasa od układu ODLOTU do układu celu');
  const epS = call(M.routeEndpoints, gS, byId);
  ok(epS && near(epS.from.x, 9) && epS.to === B, 'pojedynczy: trasa od punktu tranzytu do układu celu');
  ok(call(M.routeEndpoints, { ...gF1, toId: 'Z' }, byId) === null, 'brak układu celu → null (nie ma czego rysować)');
  const epNoFrom = call(M.routeEndpoints, { ...gF1, fromId: 'Z' }, byId);
  ok(epNoFrom && near(epNoFrom.from.x, 2) && epNoFrom.to === B, 'flota bez znanego układu odlotu → od środka ciężkości (nie gubi trasy)');

  // ── M5 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  hdr('M5 mgła obcych');
  ok(call(M.foreignDrawKind, 'contact') === 'marker', 'kontakt → znacznik');
  ok(call(M.foreignDrawKind, 'rumor') === 'ghost', 'pogłoska → duch „?”');
  ok(call(M.foreignDrawKind, 'unknown') === null && call(M.foreignDrawKind, undefined) === null && call(M.foreignDrawKind, null) === null, 'nieznany / brak → nic');
  const spFog = call(M.shipMarkerSpec, { motion: 'transit', relation: 'foreign', intelOpacity: 0.5, cx: 0, cy: 0, dir: { x: 1, y: 0 } });
  ok(spFog && near(spFog.alpha, MS.MARKER_ALPHA * 0.5), 'krycie obcego × intelOpacity');

  // ── M6 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  hdr('M6 rozstrzygacz relacji');
  let warCalls = 0;
  const resolve = call(M.makeRelationResolver, {
    isEnemy: (v) => v.enemy === true,
    atWar: (id) => { warCalls++; return id === 'e1'; },
    hostileBand: (id) => id === 'e2',
  });
  const rel = (v) => call(resolve, v);
  ok(rel({ id: 'o' }) === 'own', 'własny statek → own');
  ok(rel({ id: 'x', enemy: true, ownerEmpireId: 'e1' }) === 'enemy', 'obcy w wojnie → enemy');
  ok(rel({ id: 'y', enemy: true, ownerEmpireId: 'e2' }) === 'enemy', 'obcy z pasmem „wrogie” → enemy');
  ok(rel({ id: 'z', enemy: true, ownerEmpireId: 'e3' }) === 'foreign', 'obcy w pokoju → foreign (świadek obu poprzednich)');
  ok(rel({ id: 'r', enemy: true }) === 'enemy', 'rajder bez imperium → enemy');
  ok(rel({ id: 'w', enemy: true, owner: 'e1' }) === 'enemy', 'imperium z pola `owner` (nie `player`) → rozstrzygane tak samo');
  ok(rel({ id: 'p', enemy: true, owner: 'player' }) === 'enemy', 'owner `player` nie jest imperium → rajder (enemy)');
  warCalls = 0;
  const r2 = call(M.makeRelationResolver, { isEnemy: (v) => v.enemy === true, atWar: () => { warCalls++; return true; }, hostileBand: () => false });
  call(r2, { id: '1', enemy: true, ownerEmpireId: 'e9' }); call(r2, { id: '2', enemy: true, ownerEmpireId: 'e9' }); call(r2, { id: '3', enemy: true, ownerEmpireId: 'e9' });
  ok(warCalls === 1, 'pamięć per imperium: dyplomacja pytana raz na klatkę przygotowania');
  const r3 = call(M.makeRelationResolver, { isEnemy: () => true, atWar: () => { throw new Error('brak'); }, hostileBand: () => { throw new Error('brak'); } });
  ok(call(r3, { id: '1', ownerEmpireId: 'e5' }) === 'foreign', 'wyjątek zależności ≠ wrogość (obcy zostaje foreign)');

  // ── M7 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
  hdr('M7 indeks floty, napis, kotwica, strefa, przeszkoda');
  const idx = call(M.buildFleetIndex, [{ id: 'F1', memberIds: ['a1', 7] }, null], [{ id: 'a1', fleetId: 'F9' }, { id: 'a3', fleetId: 'F2' }, { id: 'a4' }, { id: 7 }]);
  ok(idx instanceof Map && idx.get('a1') === 'F1', 'członkostwo z listFleets wygrywa z lustrem vessel.fleetId');
  ok(idx instanceof Map && idx.get('a3') === 'F2', 'zapas: vessel.fleetId, gdy flota nie wymienia statku');
  ok(idx instanceof Map && idx.has('a4') === false, 'statek bez floty — brak wpisu (świadek: a3 jest)');
  ok(idx instanceof Map && idx.get('7') === 'F1', 'id liczbowe i tekstowe to ten sam statek');
  ok(call(M.fleetTag, 3) === '×3' && call(M.fleetTag, 12) === '×12', 'napis floty „×N”');
  const rc = { x: 10, y: 20, w: 7, h: 10 };
  const ta = call(M.tagAnchor, rc);
  ok(ta && near(ta.x, 17 + M.GALAXY_SHIP_MARKER.TAG_GAP_PX) && near(ta.y, 25), 'kotwica napisu: za prawą krawędzią, na środku wysokości');
  const hr = call(M.markerHitRect, rc), P = M.GALAXY_SHIP_MARKER.HIT_PAD;
  ok(hr && near(hr.x, 10 - P) && near(hr.y, 20 - P) && near(hr.w, 7 + 2 * P) && near(hr.h, 10 + 2 * P), 'strefa kliku = prostokąt + margines');
  const ob = call(M.markerObstacle, rc);
  ok(ob && near(ob.cx, 13.5) && near(ob.cy, 25) && ob.r >= 5, 'przeszkoda etykiet: okrąg opisany na znaczniku');
  ok(call(M.anySelected, [{ id: 'a' }, { id: 'b' }], new Set(['b'])) === true && call(M.anySelected, [{ id: 'a' }], new Set(['b'])) === false, 'anySelected: tak/nie');

  return { n, fails };
}

// ── przebieg na prawdziwym module ─────────────────────────────────────────────────────────────────────────────────────
header('Moduł prawdziwy');
if (!SM || !HM || !GL) {
  fail++;
  console.log('  ✗ FAIL: brak modułu / zależności — przebieg przerwany');
} else {
  const real = suite(SM, console.log);
  pass += real.n - real.fails.length; fail += real.fails.length;

  // ── M8 piny źródłowe ────────────────────────────────────────────────────────────────────────────────────────────────
  header('M8 piny źródłowe');
  const srcLogic = stripComments(readSrc('../../ui/GalaxyShipMarkerLogic.js'));
  const srcRail = stripComments(readSrc('../../ui/HudGalaxyRailLayer.js'));
  const colourRx = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;
  const copyRx = /\b(MARKER_W|MARKER_H|MARKER_WIDTH|MARKER_GAP_PX|MARKER_ALPHA|SELECTED_ALPHA|DIAMOND_PX)\s*:/;
  const okS = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
  okS(!colourRx.test(srcLogic), 'logika znacznika: zero kolorów (rola po NAZWIE, kolor z `F.roles`)');
  okS(!copyRx.test(srcLogic), 'logika znacznika: zero kopii stałych SM-1 (reużyte z `HudShipMarkerLogic`)');
  okS(colourRx.test('const c = "#ff00aa";') && copyRx.test('MARKER_W: 10,'), 'kontrola pinów: regexy rzeczywiście łapią kolor i kopię stałej');
  okS(/from '\.\/HudShipMarkerLogic\.js'/.test(srcLogic) && /markerGeometry/.test(srcLogic) && /markerAlpha/.test(srcLogic), 'logika importuje geometrię i krycie z SM-1');
  okS(/shipMarkerSpec/.test(srcRail) && /roles\[spec\.role\]/.test(srcRail), 'warstwa szyny rysuje przez `shipMarkerSpec` i kolor roli z `F.roles`');
  okS(!colourRx.test(srcRail.replace(/rgba?\(\s*0\s*,\s*0\s*,\s*0[^)]*\)/g, '')), 'warstwa szyny: zero własnych kolorów znacznika');

  // ── M9 bateria mutacyjna ─────────────────────────────────────────────────────────────────────────────────────────────
  header('M9 bateria mutacyjna (zamiennik fail-first)');
  const origSrc = readSrc('../../ui/GalaxyShipMarkerLogic.js');
  const abs = (rel) => urlOf(rel).href;
  const MUTANTS = [
    ['rola stała zamiast z relacji', "role: shipMarkerRole(relation),", "role: 'primary',"],
    ['daszek bez cofnięcia na punkt trasy', 'shiftGeometry(g, -d.x * back, -d.y * back)', 'shiftGeometry(g, 0, 0)'],
    ['zaznaczony bez grubszej kreski', '(selected ? GALAXY_SHIP_MARKER.SELECTED_WIDTH_MUL : 1)', '1'],
    ['klucz floty bez celu przeskoku', "const key = `f${fid}|${t.fromId ?? ''}|${t.toId ?? ''}`;", 'const key = `f${fid}`;'],
    ['samotny członek też jest flotą', 'FLEET_MIN: 2,', 'FLEET_MIN: 1,'],
    ['pogłoska rysowana jak kontakt', "if (mode === 'rumor') return 'ghost';", "if (mode === 'rumor') return 'marker';"],
    ['trasa floty od środka zamiast od odlotu', 'if (group.fleet) {', 'if (false) {'],
    ['zaznaczenie floty tylko gdy WSZYSCY', 'selected: (fleet ? ids : [ids[0]]).some(', 'selected: (fleet ? ids : [ids[0]]).every('],
    ['napis z lewej krawędzi znacznika', 'x: rect.x + rect.w + GALAXY_SHIP_MARKER.TAG_GAP_PX', 'x: rect.x + GALAXY_SHIP_MARKER.TAG_GAP_PX'],
    ['romb zasłania kwadrat gwiazdy', 'markerGeometry({ cx, cy, discR: GALAXY_PICK_HALF_PX })', 'markerGeometry({ cx, cy, discR: 0 })'],
    ['napis floty bez znaku mnożenia', 'return `×${count}`;', 'return `x${count}`;'],
    ['pozycja floty = suma zamiast średniej', 'gx: sum.x / n', 'gx: sum.x'],
    ['kolejność wejścia wpływa na prowadzącego', '.sort((a, b) => String(a.v.id).localeCompare(String(b.v.id)))', ''],
    ['indeks floty: lustro bije listę', 'if (v && v.fleetId != null && !idx.has(String(v.id))) idx.set(String(v.id), v.fleetId);', 'if (v && v.fleetId != null) idx.set(String(v.id), v.fleetId);'],
    ['kierunek: składowa nieskończona przepuszczona', 'if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { x: 1, y: 0 };', 'if (false) return { x: 1, y: 0 };'],
  ];
  for (const [name, from, to] of MUTANTS) {
    const cnt = origSrc.split(from).length - 1;
    if (cnt !== 1) { okS(false, `mutacja „${name}” — kotwica występuje ${cnt}× (musi być dokładnie 1; mutacja nie zaaplikowana = pin jałowy)`); continue; }
    let code = origSrc.replace(from, () => to)
      .replace("from './HudShipMarkerLogic.js'", `from '${abs('../../ui/HudShipMarkerLogic.js')}'`)
      .replace("from './GalaxyModeLogic.js'", `from '${abs('../../ui/GalaxyModeLogic.js')}'`);
    let mut = null, err = null;
    try { mut = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')); } catch (e) { err = e.message; }
    if (!mut) { okS(false, `mutacja „${name}” — moduł nie załadował się (${err})`); continue; }
    // ⚠ żadne `ok` z mutanta nie trafia do liczników prawdziwego przebiegu — liczymy tylko, czy cokolwiek padło.
    const r = suite(mut, () => {});
    okS(r.fails.length > 0, `mutacja „${name}” ZABITA (${r.fails.length} pin${r.fails.length === 1 ? '' : 'y'} czerwone: ${r.fails.slice(0, 2).join(' | ')})`);
  }
}

console.log(`\n${fail ? '✗' : '✓'} galaxy_ship_marker_smoke: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
