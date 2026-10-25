// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — ARKUSZ HUD paczka A, Finding 493: karta obiektu (ciało, statek, stacja) Z BOKU tarczy (`BodyCardSideLogic`) —
// HUD_PLAN.md §4.2a, §4.0 aneks 2026-10-23 (keeper WYŁĄCZNIE dla logiki położenia — px tarczy i kadr → położenie karty).
// Uruchom: node src/testing/smoke/body_card_side_smoke.mjs
//
//   C0  API i flaga `bodyCardSide` (brak klucza = OFF)
//   C1  położenie: domyślnie na prawo od krawędzi tarczy (odstęp), flip w lewo przy braku miejsca, NIGDY nad tarczą, gdy
//       którakolwiek strona się mieści; przy zoomie idzie za krawędzią (promień rośnie — karta odsuwa się o tyle samo);
//       pionowo — środek tarczy, w kadrze; obiekt za kamerą — róg obszaru mapy (jak dziś)
//   C2  tarcza z WSPÓLNEGO projektora HUD (px logiczne, skala UI): ciało, statek, stacja; za kamerą — brak
//   C3  scena ZF: Nowa Ziemia po fokusie (tarcza 71–133 px promienia na środku kadru) — karta obok tarczy, nie na niej
//   C4  montaż (piny źródłowe): karta ciała, panel statku i panel stacji — położenie z boku (z pamięcią strony) przy ON,
//       dzisiejsze kotwice przy OFF
//   C5  histereza strony (strojenie 1, 2026-10-24 — migotanie lewo↔prawo przy zoomie na stację): strona wybrana przy
//       zaznaczeniu i trzymana; zmiana tylko, gdy karta na bieżącej stronie wyszłaby poza obszar mapy (i druga się mieści),
//       nie częściej niż co 400 ms; nowy obiekt / karta schowana dłużej — wybór od nowa; KONTROLA: ta sama scena bez pamięci
//       migocze (scena odtwarza zgłoszenie)
//   C6  PRZESZKODA (REFORMA ZAKŁADEK T3, strojenie 1, Finding 544): panel statku przy prawym outlinerze — karta ciała /
//       stacji na wolnej stronie (scena K12: KONTROLA — bez przeszkody karta zachodzi na panel); żadna wolna — większy
//       prześwit; przeszkoda nie czeka na histerezę; przeszkoda poza kandydatami — wynik jak bez niej; `cardObstacles`;
//       montaż: karta ciała i panel stacji podają przeszkody, `UIManager` — prostokąt z ostatniej klatki tylko przy ON
//   ⚠ C4a — wzorzec wywołania uzupełniony o `obstacles: cardObstacles(window.KOSMOS)` (strojenie 1 T3; to samo wywołanie).
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import * as T3 from '../../lib/three.core.js';

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const src = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), 'utf8'); } catch { return ''; } };
const tryImport = async (p) => { try { return await import(p); } catch (e) { console.log('    (' + p + ': ' + e.message + ')'); return null; } };
const call = (f, ...a) => { try { return f?.(...a); } catch (e) { console.log('    (wyjątek: ' + e.message + ')'); return undefined; } };

const CS = await tryImport('../../ui/BodyCardSideLogic.js');

// ═══ C0 ══════════════════════════════════════════════════════════════════════
header('C0  API i flaga');
{
  const need = ['isBodyCardSideOn', 'CARD_SIDE', 'computeSideCardPlacement', 'makeCardSideMemory', 'cardOverDisc', 'objectScreenDisc'];
  const missing = need.filter((n) => CS?.[n] === undefined);
  ok(missing.length === 0, `C0a: \`BodyCardSideLogic\` — ${need.length} eksportów (brak: ${missing.join(', ') || '—'})`);
  ok(/\bbodyCardSide:\s*true,/.test(strip(src('../../config/GameConfig.js'))), 'C0b: `FEATURES.bodyCardSide: true` w GameConfig');
  ok(CS?.isBodyCardSideOn?.({ bodyCardSide: true }) === true && CS?.isBodyCardSideOn?.({}) === false, 'C0c: flaga — brak klucza = OFF');
}

// ═══ C1 ══════════════════════════════════════════════════════════════════════
const B = { ox: 150, oy: 28, ow: 980, oh: 742.8 };          // obszar mapy (px logiczne) — okno pomiarowe 1600×1041 przy skali 1,25
const place = (disc, PW = 260, PH = 300, bounds = B) => call(CS?.computeSideCardPlacement, { disc, PW, PH, bounds });
header('C1  z boku tarczy: prawo, flip w lewo, nigdy nad tarczą, za krawędzią przy zoomie');
{
  const gap = CS?.CARD_SIDE?.GAP ?? NaN;
  const a = place({ x: 500, y: 400, r: 40 });
  ok(a?.side === 'right' && Math.abs(a.px - (500 + 40 + gap)) < 1e-9 && a.overDisc === false && a.anchored === true,
    `C1a: domyślnie na prawo — lewa krawędź karty ${gap} px od krawędzi tarczy (px ${a?.px})`);
  const b = place({ x: 950, y: 400, r: 40 });
  ok(b?.side === 'left' && Math.abs((b.px + 260) - (950 - 40 - gap)) < 1e-9 && b.overDisc === false,
    `C1b: brak miejsca po prawej — flip w lewo (prawa krawędź karty ${gap} px od tarczy)`);
  const c1 = place({ x: 640, y: 400, r: 71 }), c2 = place({ x: 640, y: 400, r: 133 });
  ok(c1?.side === 'right' && c2?.side === 'right' && Math.abs((c2.px - c1.px) - (133 - 71)) < 1e-9,
    'C1c: zoom (promień 71 → 133 px) — karta idzie za krawędzią tarczy, nie za środkiem');
  const d = place({ x: 600, y: 60, r: 30 });
  ok(d && d.py >= B.oy && d.py + 300 <= B.oy + B.oh && Math.abs(place({ x: 600, y: 400, r: 30 }).py - (400 - 150)) < 1e-9,
    'C1d: pionowo — środek karty na wysokości środka tarczy, przycięty do kadru');
  const e = place(null);
  ok(e?.anchored === false && e.side === null && e.px === B.ox + CS.CARD_SIDE.NO_ANCHOR_X && e.py === B.oy + CS.CARD_SIDE.NO_ANCHOR_Y,
    'C1e: obiekt za kamerą (brak tarczy) — róg obszaru mapy (jak dziś)');
  // Nigdy nad tarczą, gdy którakolwiek strona się mieści — siatka położeń i promieni.
  let bad = 0, tried = 0;
  for (let x = B.ox + 10; x <= B.ox + B.ow - 10; x += 37) for (let y = B.oy + 10; y <= B.oy + B.oh - 10; y += 41) for (const r of [0, 5, 30, 90, 150]) {
    const fitsR = x + r + gap + 260 <= B.ox + B.ow - 4, fitsL = x - r - gap - 260 >= B.ox + 4;
    if (!fitsR && !fitsL) continue;
    tried++;
    const p = place({ x, y, r });
    if (!p || p.overDisc || CS.cardOverDisc({ px: p.px, py: p.py, PW: 260, PH: 300 }, { x, y, r })) bad++;
  }
  ok(tried > 200 && bad === 0, `C1f: ${tried} położeń tarczy, w których któraś strona się mieści — karta nad tarczą: ${bad}`);
  const huge = place({ x: 640, y: 400, r: 420 });
  ok(huge?.anchored === true && huge.px >= B.ox && huge.px + 260 <= B.ox + B.ow, 'C1g: tarcza większa niż kadr — karta w kadrze (strona z większym zapasem)');
}

// ═══ C2 ══════════════════════════════════════════════════════════════════════
const mkCam = (pos, look = [0, 0, 0]) => { const c = new T3.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000); c.position.set(...pos); c.lookAt(...look); c.updateMatrixWorld(); return c; };
const viewOf = (cam) => ({ view: cam.matrixWorldInverse.elements.slice(), proj: cam.projectionMatrix.elements.slice(), fovDeg: 55, cssW: 1600, cssH: 1041, worldPerAU: 11 });
const NZ = { x: 6.2, y: 0, z: 0, r: 0.3 };
const camAt = (dist) => mkCam([NZ.x, dist * 0.5, dist * 0.866], [NZ.x, 0, 0]);
const KST = (cam) => ({
  uiScale: 1.25,
  threeRenderer: {
    getHudView: () => viewOf(cam),
    getBodyWorldInfo: (id) => (id === 'p_nz' ? { ...NZ } : null),
    getVesselWorldInfo: (id) => (id === 'v_1' ? { x: 6.5, y: 0.3, z: 0.2, r: 0.02 } : null),
    getStationWorldInfo: (id) => (id === 'st_1' ? { x: 6.55, y: 0, z: 0.05, r: 0.012 } : null),
  },
});
header('C2  tarcza z projektora HUD (px logiczne, skala UI)');
{
  const cam = camAt(2);
  const d = call(CS?.objectScreenDisc, KST(cam), 'body', 'p_nz');
  const v = new T3.Vector3(NZ.x, NZ.y, NZ.z).project(cam);
  const ex = (v.x * 0.5 + 0.5) * 1600 / 1.25, ey = (-v.y * 0.5 + 0.5) * 1041 / 1.25;
  const fpx = (1041 / 2) / Math.tan((55 / 2) * Math.PI / 180) / 1.25;      // ogniskowa w px logicznych
  const er = 0.3 / 2 * fpx;                                                 // promień przy odległości 2 j.
  ok(!!d && Math.abs(d.x - ex) < 0.01 && Math.abs(d.y - ey) < 0.01 && Math.abs(d.r - er) / er < 0.01,
    `C2a: ciało — środek i promień jak rzut kamery w px logicznych (r ${d?.r?.toFixed?.(1)} ≈ ${er.toFixed(1)} px)`);
  const dv = call(CS?.objectScreenDisc, KST(cam), 'vessel', 'v_1'), ds = call(CS?.objectScreenDisc, KST(cam), 'station', 'st_1');
  ok(dv?.r > 0 && ds?.r > 0 && dv.r < d.r && ds.r < d.r, 'C2b: statek i stacja — tarcza z rozmiaru modelu (mniejsza niż planety)');
  const behind = mkCam([NZ.x + 5, 0.5, 0], [NZ.x + 10, 0.5, 0]);          // Nowa Ziemia za kamerą
  ok(call(CS?.objectScreenDisc, KST(behind), 'body', 'p_nz') === null && call(CS?.objectScreenDisc, KST(cam), 'body', 'nope') === null,
    'C2c: za kamerą / nie w scenie — brak tarczy (karta w rogu, jak dziś)');
  // Podłoga zoomu stacji (0,005 j.) leży bliżej niż próg głębi okręgów radaru (0,01 j.) — kotwica karty ma przetrwać.
  const ST = { x: 6.55, y: 0, z: 0.05 };
  const close = mkCam([ST.x, 0.003, ST.z + 0.0052], [ST.x, 0, ST.z]);
  const dClose = call(CS?.objectScreenDisc, KST(close), 'station', 'st_1');
  const HP = await tryImport('../../ui/HudProjection.js');
  const projD = HP?.makeHudProjector?.({ ...viewOf(close), uiScale: 1.25 });
  const defNull = projD ? projD.point(ST.x, ST.y, ST.z) : 'brak';
  ok(!!dClose && Math.abs(dClose.x - 640) < 2 && dClose.r > 100 && defNull === null,
    `C2d: stacja 0,006 j. przed kamerą (bliżej niż próg radaru 0,01 j.) — tarcza jest (r ${dClose?.r?.toFixed?.(0)} px), karta nie skacze do rogu; KONTROLA: domyślny próg projektora ją odrzuca`);
}

// ═══ C3 ══════════════════════════════════════════════════════════════════════
header('C3  scena ZF: Nowa Ziemia po fokusie — karta obok tarczy');
{
  // ZF gy120, okno pomiarowe: po fokusie tarcza Nowej Ziemi 71–133 px promienia na środku kadru (dziś karta 18 px od
  // ŚRODKA zakrywa 33–41 % tarczy i radar — Finding 493).
  for (const r of [71, 133]) {
    const p = place({ x: 640, y: 416.4, r }, 258, 330);
    ok(p?.side === 'right' && p.overDisc === false && p.px >= 640 + r, `C3: promień ${r} px — karta po prawej, ${(p?.px - 640 - r).toFixed?.(0)} px od krawędzi tarczy, nie na tarczy`);
  }
}

// ═══ C4 ══════════════════════════════════════════════════════════════════════
header('C4  montaż (piny źródłowe): ON — z boku, OFF — dzisiejsze kotwice');
{
  const bc = strip(src('../../ui/BottomContext.js'));
  ok(/if \(isBodyCardSideOn\(GAME_CONFIG\.FEATURES\)\) \{\s*this\._sideMem \?\?= makeCardSideMemory\(\);\s*pl = this\._sideMem\.place\(\{ key: entity\.id, disc: objectScreenDisc\(window\.KOSMOS, 'body', entity\.id\), PW, PH, bounds,\s*obstacles: cardObstacles\(window\.KOSMOS\), now: performance\.now\(\) \}\);\s*\} else \{\s*const sp = window\.KOSMOS\?\.threeRenderer\?\.getBodyScreenPosition\?\.\(entity\.id\) \?\? null;\s*pl = computeFloatingPlacement\(/.test(bc),
    'C4a: karta ciała — z boku tarczy z pamięcią strony (klucz = ciało) przy ON; przy OFF `computeFloatingPlacement` jak dziś');
  const sp = strip(src('../../ui/StationPanel.js'));
  ok(/if \(isBodyCardSideOn\(GAME_CONFIG\.FEATURES\)\) \{[\s\S]{0,300}?this\._sideMem \?\?= makeCardSideMemory\(\);\s*const pl = this\._sideMem\.place\(\{ key: this\._stationId, disc: objectScreenDisc\(window\.KOSMOS, 'station', this\._stationId\)[\s\S]{0,300}?\} else \{\s*const sp = window\.KOSMOS\?\.threeRenderer\?\.getStationScreenPosition\?\.\(this\._stationId\);\s*if \(sp\) \{ ax = sp\.x \+ 18;/.test(sp),
    'C4b: panel stacji — z boku modelu z pamięcią strony (klucz = stacja) przy ON; przy OFF `sp.x + 18` jak dziś');
  const ui = strip(src('../../scenes/UIManager.js'));
  ok(/const disc = isBodyCardSideOn\(GAME_CONFIG\.FEATURES\) \? objectScreenDisc\(window\.KOSMOS, 'vessel', this\._selectedVesselId\) : null;[\s\S]{0,200}?this\._vesselPanelSide \?\?= makeCardSideMemory\(\);\s*const pl = this\._vesselPanelSide\.place\(\{ key: this\._selectedVesselId, disc, PW: w, PH: h, bounds: b, now: performance\.now\(\) \}\);[\s\S]{0,300}?\} else \{\s*const sp = window\.KOSMOS\?\.threeRenderer\?\.getVesselScreenPosition\?\.\(this\._selectedVesselId\);\s*a\s*= resolveVesselPanelAnchor\(/.test(ui),
    'C4c: panel statku — z boku modelu z pamięcią strony (klucz = statek) przy ON (bez sprite\'a — kotwica zapasowa); przy OFF `resolveVesselPanelAnchor` jak dziś');
  ok(/getMapInsets/.test(bc) && /getMapInsets/.test(sp) && /_vesselPanelBounds\(W, H\) \{[\s\S]{0,1200}?getMapInsets\(window\.KOSMOS\)/.test(ui),
    'C4d: KONTROLA — kadr karty: obszar mapy z `MapInsets` (pod outlinerami i pasem; zielona po obu stronach)');
  // ⚠ C4c PRZECELOWANY 2026-10-24 (REFORMA ZAKŁADEK T3, `TABS_REFORM_PLAN.md` §5.3, za zgodą): pin wyżej — ścieżka
  //   `shipPanelOutliner` OFF (493 dla panelu statku); przy ON panel statku stoi przy wierszu prawego outlinera, a gałąź
  //   T3 wraca ZANIM `_vesselPanelBounds` dojdzie do kotwicy z boku modelu (karta ciała i panel stacji — bez zmian, do T2).
  ok(/_vesselPanelBounds\(W, H\) \{[\s\S]{0,800}?if \(isShipPanelOutlinerOn\(GAME_CONFIG\.FEATURES\)\) return this\._shipPanelAtOutliner\(W, H, w, h\);[\s\S]{0,800}?const disc = isBodyCardSideOn\(GAME_CONFIG\.FEATURES\)/.test(ui),
    'C4c-T3: przy ON panel statku bez kotwicy z boku modelu — gałąź wiersza outlinera przed `objectScreenDisc`');
}

// ═══ C5 ══════════════════════════════════════════════════════════════════════
header('C5  histereza strony karty (migotanie lewo↔prawo przy zoomie na stację)');
{
  // Scena zgłoszenia: panel stacji (440 px) przy stacji na środku kadru, zoom — promień tarczy rośnie; żadna strona się nie
  // mieści, a położenie drga o ułamki px (animacja kamery). Bez pamięci strona zależy od tego drgania.
  const PWs = 440, PHs = 320;
  const seq = [];
  for (let i = 0; i < 40; i++) seq.push({ x: 640 + (i % 2 ? 0.3 : -0.3), y: 400 + (i % 3) * 0.2, r: 30 + i * 2 });
  const bare = seq.map((d) => place(d, PWs, PHs)?.side);
  const flipsBare = bare.filter((s, i) => i > 0 && s !== bare[i - 1]).length;
  ok(flipsBare >= 5, `C5 KONTROLA: ta sama scena BEZ pamięci migocze (${flipsBare} zmian strony w 40 klatkach) — scena odtwarza zgłoszenie`);
  const mem = call(CS?.makeCardSideMemory);
  const held = seq.map((d, i) => mem?.place?.({ key: 'st_1', disc: d, PW: PWs, PH: PHs, bounds: B, now: 1000 + i * 16 })?.side);
  const flipsHeld = held.filter((s, i) => i > 0 && s !== held[i - 1]).length;
  ok(!!mem && held.every((s) => s === held[0]) && flipsHeld === 0, `C5a: z pamięcią — strona stała przez cały zoom (${held[0]}, ${flipsHeld} zmian)`);
  // Strona trzymana, póki karta się na niej mieści — także gdy druga byłaby „lepsza”.
  const m2 = call(CS?.makeCardSideMemory);
  const a1 = m2?.place?.({ key: 'p_nz', disc: { x: 950, y: 400, r: 40 }, PW: 260, PH: 300, bounds: B, now: 0 });          // przy prawej krawędzi — lewa
  const a2 = m2?.place?.({ key: 'p_nz', disc: { x: 500, y: 400, r: 40 }, PW: 260, PH: 300, bounds: B, now: 2000 - 1200 });  // prawa by się zmieściła
  ok(a1?.side === 'left' && a2?.side === 'left' && a2.fits === true, 'C5b: strona trzymana, póki karta się na niej mieści (lewa zostaje, choć prawa jest wolna)');
  // Zmiana, gdy na bieżącej stronie karta wyszłaby poza obszar mapy (a druga się mieści); kolejna — nie wcześniej niż po 400 ms.
  const m3 = call(CS?.makeCardSideMemory);
  const L = (x, now) => m3?.place?.({ key: 'v_1', disc: { x, y: 400, r: 20 }, PW: 260, PH: 300, bounds: B, now })?.side;
  const s0 = L(500, 0);          // prawa
  const s1 = L(200, 100);        // lewa wyszłaby poza kadr? — nie: prawa nadal się mieści → zostaje prawa
  const s2 = L(1000, 200);       // prawa poza kadrem → lewa (pierwsza zmiana)
  const s3 = L(200, 300);        // lewa poza kadrem → chce prawej, ale < 400 ms od zmiany → zostaje lewa
  const s4 = L(200, 650);        // ≥ 400 ms → prawa
  ok(s0 === 'right' && s1 === 'right' && s2 === 'left' && s3 === 'left' && s4 === 'right',
    `C5c: zmiana tylko przy wyjściu poza obszar mapy, nie częściej niż co ${CS?.CARD_SIDE?.SWITCH_MIN_MS} ms (${[s0, s1, s2, s3, s4].join(' → ')})`);
  const lock = m3?.place?.({ key: 'v_1', disc: { x: 200, y: 400, r: 20 }, PW: 260, PH: 300, bounds: B, now: 700 });
  ok(lock && lock.px >= B.ox && lock.px + 260 <= B.ox + B.ow, 'C5d: karta zawsze w obszarze mapy (przy wstrzymanej zmianie — przycięta do kadru)');
  // Nowy obiekt — wybór od nowa (prawa preferowana); karta schowana dłużej niż RESET_IDLE_MS — też od nowa.
  const n1 = m2?.place?.({ key: 'p_moon', disc: { x: 500, y: 400, r: 10 }, PW: 260, PH: 300, bounds: B, now: 900 });
  const m4 = call(CS?.makeCardSideMemory);
  m4?.place?.({ key: 'p_x', disc: { x: 950, y: 400, r: 10 }, PW: 260, PH: 300, bounds: B, now: 0 });               // lewa
  const back = m4?.place?.({ key: 'p_x', disc: { x: 500, y: 400, r: 10 }, PW: 260, PH: 300, bounds: B, now: 5000 });  // po przerwie
  ok(n1?.side === 'right' && back?.side === 'right', 'C5e: nowy obiekt albo ponowne pokazanie karty po przerwie — strona wybrana od nowa');
}

// ═══ C6 ══════════════════════════════════════════════════════════════════════
header('C6  przeszkoda — panel statku przy prawym outlinerze (T3, strojenie 1, Finding 544)');
{
  // Scena K12 (ZF gy120, okno właściciela — logicznie 1280×945): tarcza Nowej Ziemi przy x 639, panel „Frachtu” przy wierszu
  // prawego outlinera x 830–1130, y 98–398; obszar mapy 150–1130 × 28–883.
  const BK = { ox: 150, oy: 28, ow: 980, oh: 855 };
  const PANEL = { x: 830, y: 98, w: 300, h: 300 };
  const disc = { x: 639, y: 472, r: 7 };
  const PW = 260, PH = 260;
  const over = (p, o) => !!p && p.px < o.x + o.w && p.px + PW > o.x && p.py < o.y + o.h && p.py + PH > o.y;
  const bare = call(CS?.computeSideCardPlacement, { disc, PW, PH, bounds: BK });
  const withP = call(CS?.computeSideCardPlacement, { disc, PW, PH, bounds: BK, obstacles: [PANEL] });
  ok(bare?.side === 'right' && over(bare, PANEL), `C6-0 KONTROLA: bez przeszkody karta po prawej zachodzi na panel statku (px ${bare?.px}) — scena odtwarza 544`);
  ok(withP?.side === 'left' && !over(withP, PANEL) && withP.blocked === false && withP.overDisc === false && withP.fits === true,
    `C6a SEDNO: z przeszkodą — karta po lewej, wolna, nie na tarczy (px ${withP?.px})`);
  // Przeszkoda nie czeka na histerezę: zmiana strony 20 ms po poprzedniej, gdy trzymana strona leży pod przeszkodą.
  const OB = { x: 180, y: 300, w: 300, h: 200 };   // zasłania lewą stronę tarczy (500, 400)
  const seq = (obs3, disc3) => {
    const m = call(CS?.makeCardSideMemory);
    const a = m?.place?.({ key: 'p', disc: { x: 500, y: 400, r: 20 }, PW, PH: 300, bounds: B, now: 0 })?.side;      // prawa
    const b = m?.place?.({ key: 'p', disc: { x: 1000, y: 400, r: 20 }, PW, PH: 300, bounds: B, now: 20 })?.side;   // prawa poza kadrem → lewa
    const c = m?.place?.({ key: 'p', disc: disc3, PW, PH: 300, bounds: B, now: 40, obstacles: obs3 });
    return { a, b, c };
  };
  const blockedSeq = seq([OB], { x: 500, y: 400, r: 20 });
  ok(blockedSeq.a === 'right' && blockedSeq.b === 'left' && blockedSeq.c?.side === 'right' && blockedSeq.c.blocked === false,
    `C6b przeszkoda na trzymanej stronie — zmiana od razu, 20 ms po poprzedniej (${blockedSeq.a} → ${blockedSeq.b} → ${blockedSeq.c?.side})`);
  const lockSeq = seq([], { x: 200, y: 400, r: 20 });
  ok(lockSeq.b === 'left' && lockSeq.c?.side === 'left', `C6b KONTROLA: bez przeszkody histereza trzyma stronę 400 ms (${lockSeq.b} → ${lockSeq.c?.side})`);
  // Żadna strona wolna — większy prześwit (tarcza większa niż kadr, panel po prawej w pasie karty).
  const big = { x: 640, y: 450, r: 300 }, PANEL2 = { x: 830, y: 300, w: 300, h: 300 };
  const bigBare = call(CS?.computeSideCardPlacement, { disc: big, PW, PH, bounds: BK });
  const bigP = call(CS?.computeSideCardPlacement, { disc: big, PW, PH, bounds: BK, obstacles: [PANEL2] });
  ok(bigBare?.side === 'right' && bigBare.fits === false, 'C6c KONTROLA: tarcza większa niż kadr bez przeszkody — strona z większym zapasem kadru (prawa, remis)');
  ok(bigP?.side === 'left' && bigP.blocked === false, `C6c żadna strona wolna, panel po prawej — strona z większym prześwitem (lewa, px ${bigP?.px})`);
  // Przeszkoda poza kandydatami — wynik jak bez niej (co do pola).
  const far = { x: 900, y: 800, w: 100, h: 40 };
  const s0 = call(CS?.computeSideCardPlacement, { disc: { x: 500, y: 400, r: 20 }, PW, PH, bounds: BK });
  const s1 = call(CS?.computeSideCardPlacement, { disc: { x: 500, y: 400, r: 20 }, PW, PH, bounds: BK, obstacles: [far, null, { x: NaN, y: 0, w: 1, h: 1 }] });
  ok(!!s0 && JSON.stringify(s0) === JSON.stringify(s1), 'C6d KONTROLA (niezmiennik): przeszkoda poza kandydatami (i wpisy nieprawidłowe) — wynik co do pola jak bez niej');
  const mem = call(CS?.makeCardSideMemory);
  const mp = mem?.place?.({ key: 'p_nz', disc, PW, PH, bounds: BK, obstacles: [PANEL], now: 0 });
  ok(mp?.side === 'left' && mp.blocked === false, 'C6e pamięć strony podaje przeszkody (scena K12 — lewa)');
  const K0 = { uiManager: { getShipPanelObstacle: () => null } }, K1 = { uiManager: { getShipPanelObstacle: () => ({ ...PANEL }) } };
  const o0 = call(CS?.cardObstacles, K0), o1 = call(CS?.cardObstacles, K1), o2 = call(CS?.cardObstacles, {});
  ok(Array.isArray(o0) && o0.length === 0 && Array.isArray(o2) && o2.length === 0 && o1?.length === 1 && o1[0].x === 830,
    'C6f `cardObstacles`: panel statku z `UIManager.getShipPanelObstacle` — jest → [prostokąt], brak → []');
  // Montaż (piny źródłowe).
  const sp = strip(src('../../ui/StationPanel.js')), bcx = strip(src('../../ui/BottomContext.js')), ui = strip(src('../../scenes/UIManager.js'));
  ok(/key: this\._stationId, disc: objectScreenDisc\(window\.KOSMOS, 'station', this\._stationId\), PW, PH,\s*bounds: \{ ox: b\.ox, oy: b\.oy, ow: b\.ow, oh: b\.oh \}, obstacles: cardObstacles\(window\.KOSMOS\), now: performance\.now\(\) \}\);/.test(sp)
    && /obstacles: cardObstacles\(window\.KOSMOS\), now: performance\.now\(\)/.test(bcx),
    'C6g montaż: panel stacji i karta ciała podają przeszkody (`cardObstacles(window.KOSMOS)`)');
  const go = ui.slice(ui.indexOf('  getShipPanelObstacle() {'), ui.indexOf('  _noteShipPanelDrawn(rect) {'));
  ok(/if \(!isShipPanelOutlinerOn\(GAME_CONFIG\.FEATURES\)\) return null;/.test(go) && /shipPanelDrawn = this\._fleetOverlay\?\._vesselPanelRect \?\? null;/.test(ui)
    && /if \(isShipPanelOutlinerOn\(GAME_CONFIG\.FEATURES\)\) this\._noteShipPanelDrawn\(shipPanelDrawn\);/.test(ui),
    'C6h montaż: `UIManager` — prostokąt panelu z ostatniej klatki, tylko przy `shipPanelOutliner` (OFF — brak przeszkody, karty jak dziś)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
