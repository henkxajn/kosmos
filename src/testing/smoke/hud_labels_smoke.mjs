// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — ARKUSZ HUD paczka A, H2: etykiety na warstwie HUD 2D (`HudLabelLogic`, `HudLabelLayer`) — HUD_PLAN.md §4.3, §4.0
// aneks 2026-10-23 (keepery WYŁĄCZNIE dla logiki: strefy kliku, LOD, anti-overlap i kadr, mgła wojny, `uiPrefs`, budżet
// klatek — bez pinów na stałych rysunku). D-HUD-5, D-HUD-6, D-HUD-16; Findingi 497, 503, 513, 514, 515, 525.
// Uruchom: node src/testing/smoke/hud_labels_smoke.mjs
//
//   L0  API; flaga `hudLabels` usunięta (B-Z — na stałe ON)
//   L1  LOD stosu — deterministyczna funkcja średnicy tarczy kotwicy → stan („+N” / szyna / każdy przy swoim obiekcie)
//   L2  anti-overlap i kadr na scenach ZF gy120 (wejście rozkładu zapisane z prawdziwej gry): 200 j. (dziś 10 par
//       nakładających się plakietek), 450 j., 12 j. — zero nakładań etykiet, zero etykiet poza obszarem mapy; ta sama
//       odpowiedź przy tym samym wejściu; poprzedni wybór miejsca wygrywa, gdy nadal ważny (bez skoków)
//   L3  stres: wiele etykiet przy jednej kotwicy — zero nakładań; etykieta większa niż kadr — schowana
//   L4  strefa kliku: najwyższa strefa; punkt na tarczy ciała wygrywa (487, 503)
//   L5  warstwa (stub świata, prawdziwy `HudLayer` + `HudLabelLayer`): zwinięta grupa → klik zaznacza KOTWICĘ (przypiętą — wychodzi
//       ze stosu), drugi klik — kamera (D-UI-5 bez zmian); środek gwiazdy przy 450 j. → bez strefy etykiety (503); szyna — strefa na
//       wiersz (stacja → panel stacji); mgła wojny (unknown — brak, rumor — „?”, contact — nazwa; sprite ukryty — brak, 485);
//       strzałki krawędzi bez etykiet w kadrze (497); `uiPrefs.fleetMapLabelsVisible` — bez statków; poza trybem
//       cywilizacji warstwa schowana — klik nie łapie
//   L6  zegary: fade-in na czasie REALNYM (działa w pauzie), potem spoczynek — 0 wywołań ctx (budżet klatek)
//   L7  montaż (piny źródłowe — UIManager nie importuje się pod node): plakietek `MapLabelLayer` brak (B-Z); klik
//       etykiet HUD przed raycastem (karta ciała — dawniej nad etykietami, 515 — usunięta w T4); kursor do warstwy;
//       kolejność podwarstw
//   L8  ucinanie z „…” (513) — pełna nazwa, gdy się mieści
//   L9  tarcza obiektu z projektora HUD (`HudProjection.objectScreenDisc` — przeniesione z `BodyCardSideLogic` w T4; piny
//       dawnego `body_card_side_smoke` C2): ciało, statek, stacja; za kamerą — brak; stacja bliżej niż próg radaru — jest
//   L10 (ARKUSZ HUD paczka B, Finding 568 — decyzja właściciela 2026-10-28, wariant „b”) JEDNA reguła nazwy obcego statku:
//       etykieta (`MapLabelLogic.gatherVesselLabels`), rozwinięcie T1 (`LabelHoverLogic.enemyVesselExpansionLines`) i linia
//       treści alertu (`HudAlertLogic.alertIdentity`) — przy każdej jakości wywiadu ta sama odpowiedź „nazwa / bez nazwy” co
//       `VesselReveal.enemyVesselNamed` (nazwa od `contact`); trzy powierzchnie pytają tę funkcję (pin źródłowy)
//
//   ⚠ PRZECELOWANE 2026-10-26 (REFORMA ZAKŁADEK T2, `TABS_REFORM_PLAN.md` §5.3, za zgodą): L5c–L5f opisują klik zwiniętej
//     grupy i etykietę na tarczy przy `labelPin` OFF (dzisiejszy kod, piny bez zmian — blok L5 przestawia flagę). Przy ON
//     zaznaczona kotwica jest PRZYPIĘTA: wychodzi ze stosu do własnej etykiety z wierszem akcji („+N” rozkłada się), 2. klik
//     trafia linię nazwy przypiętej, a przypięta etykieta na tarczy wygrywa z tarczą (przycisk > etykieta > tarcza) —
//     warianty „-T2” (pełne piny: `label_pin_smoke`).
//   ⚠ PRZECELOWANE 2026-10-27 (REFORMA ZAKŁADEK T4, `TABS_REFORM_PLAN.md` §5.10): flaga kroku `labelPin` na stałe ON (klucz
//     usunięty) — warianty OFF L5c, L5d, L5f usunięte (w trybie cywilizacji tej ścieżki już nie ma); jedynymi zostają L5c-T2,
//     L5d-T2, L5f-T2. L5e (środek gwiazdy) stoi przed blokiem przypięcia — bez zaznaczenia. L7c — karta ciała usunięta (bez
//     porządku „PO karcie”); L9 — piny `objectScreenDisc` z usuniętego `body_card_side_smoke` (C2).
//   ⚠ PRZECELOWANE 2026-10-28 (ARKUSZ HUD B-Z — flagi HUD na stałe ON, ścieżki OFF usunięte, `MapLabelLayer` usunięty):
//     L0a / L0c / L0d — predykat i klucz flagi usunięte; L5o — warstwa schowana poza trybem cywilizacji (dawniej: flaga
//     OFF); L7a / L7b — brak plakietek `MapLabelLayer` (moduł, import, rysunek, klik); L7c — klik etykiet HUD bez gałęzi
//     flagi. Przełącznik flagi w keeperze usunięty.
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import * as T3 from '../../lib/three.core.js';
import EventBus from '../../core/EventBus.js';

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const src = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), 'utf8'); } catch { return ''; } };
const tryImport = async (p) => { try { return await import(p); } catch (e) { console.log('    (' + p + ': ' + e.message + ')'); return null; } };

const LL = await tryImport('../../ui/HudLabelLogic.js');
const LLay = await tryImport('../../ui/HudLabelLayer.js');
const HL = await tryImport('../../ui/HudLayer.js');
const FEATURES = GAME_CONFIG.FEATURES;

// ═══ L0 ══════════════════════════════════════════════════════════════════════
header('L0  API (flaga `hudLabels` usunięta — B-Z)');
{
  const need = ['HUD_LABELS', 'stackLOD', 'atLeastLOD', 'collapsedText', 'groupByAnchor', 'placeLabels', 'labelCandidates',
    'overlappingPairs', 'threadGeometry', 'railRows', 'railBlockSize', 'resolveLabelClick', 'layoutTabular', 'truncateText', 'fadeAlpha', 'updateBorn',
    'ctrlLabelStyle', 'insideRect'];
  const missing = need.filter((n) => LL?.[n] === undefined);
  ok(missing.length === 0, `L0a: \`HudLabelLogic\` — ${need.length} eksportów (brak: ${missing.join(', ') || '—'})`);
  ok(typeof LLay?.HudLabelLayer === 'function', 'L0b: `HudLabelLayer`');
  ok(!/\bhudLabels:\s*(true|false),/.test(strip(src('../../config/GameConfig.js'))) && FEATURES.hudLabels === undefined,
    'L0c (B-Z): klucz `FEATURES.hudLabels` usunięty z GameConfig');
  ok(!!LL && LL.isHudLabelsOn === undefined, 'L0d (B-Z): predykat flagi `isHudLabelsOn` usunięty — warstwa etykiet bez rozgałęzień');
}

// ═══ L1 ══════════════════════════════════════════════════════════════════════
header('L1  LOD stosu — funkcja średnicy tarczy kotwicy (px) → stan');
{
  const R = LL?.HUD_LABELS ?? {};
  const C = R.STACK_COLLAPSE_PX, E = R.STACK_EXPAND_PX;
  ok(C > 0 && E > C, `L1a: progi zwinięcia ${C} px < rozwinięcia ${E} px (stałe — strojenie okiem)`);
  const f = LL?.stackLOD;
  ok(f?.(0.29, 3) === 'collapsed' && f?.(C - 0.01, 3) === 'collapsed' && f?.(C, 3) === 'rail' && f?.(E - 0.01, 3) === 'rail'
    && f?.(E, 3) === 'spread' && f?.(300, 3) === 'spread',
    'L1b: < zwinięcia — „+N”; [zwinięcie, rozwinięcie) — szyna; ≥ rozwinięcia — każdy przy swoim obiekcie');
  ok(f?.(NaN, 2) === 'collapsed' && f?.(null, 2) === 'collapsed' && f?.(500, 1) === 'single' && f?.(0, 1) === 'single',
    'L1c: brak tarczy (za kamerą) — zwinięta; jedna etykieta w grupie — bez stosu');
  const PX = [0.29, 3.22, 10.75, 32.24, 64.49];
  const seq = PX.map((px) => f?.(px, 3));
  const RANK = { collapsed: 1, rail: 2, spread: 3 };
  ok(seq.every((s) => RANK[s] != null) && JSON.stringify(seq) === JSON.stringify(PX.map((px) => f?.(px, 3)))
    && seq.every((s, i) => i === 0 || RANK[s] >= RANK[seq[i - 1]]),
    `L1d: deterministyczna i monotoniczna — większa tarcza nigdy mniej rozwinięta (ZF Nowa Ziemia przy 450 / 40 / 12 / 4 / 2 j.: ${seq.join(' / ')})`);
  ok(LL?.atLeastLOD?.('collapsed', 'rail') === 'rail' && LL?.atLeastLOD?.('spread', 'rail') === 'spread' && LL?.atLeastLOD?.('single', 'rail') === 'rail',
    'L1e: zaznaczony członek inny niż kotwica wymusza co najmniej szynę');
  ok(LL?.collapsedText?.('NOWA ZIEMIA', 2) === 'NOWA ZIEMIA +2' && LL?.collapsedText?.('FOBOS', 0) === 'FOBOS', 'L1f: tekst zwiniętej grupy „NOWA ZIEMIA +2”');
  const g = LL?.groupByAnchor?.([
    { key: 's:st', kind: 'station', id: 'st', anchorId: 'p_nz' }, { key: 'c:p_moon', kind: 'colony', id: 'p_moon', anchorId: 'p_nz' },
    { key: 'c:p_nz', kind: 'colony', id: 'p_nz', anchorId: 'p_nz' }, { key: 'c:p_fob', kind: 'colony', id: 'p_fob', anchorId: 'p_x' }]);
  ok(g?.get?.('p_nz')?.map((x) => x.key).join(',') === 'c:p_nz,c:p_moon,s:st' && g?.get?.('p_x')?.length === 1,
    'L1g: grupa = kotwica (planeta) → księżyce → stacje; Fobos (księżyc innej planety) — osobna grupa');
}

// ═══ L2 ══════════════════════════════════════════════════════════════════════
// Wejście rozkładu zapisane z PRAWDZIWEJ gry (ZF gy120, `probe_a_place_dump.mjs`, `HudLabelLayer.debugPlacement`):
// prostokąty etykiet (px logiczne), kotwice, przeszkody (tarcze), kadr = obszar mapy z `MapInsets`.
const SCENES = {
  owner_d200: { rect: { x: 150, y: 28, w: 980, h: 855.36 }, items: [
    { key: 'g:entity_5', kind: 'group', prio: 1, ax: 640, ay: 472.68, clear: 0.32, w: 96.6, h: 17 },
    { key: 'c:entity_7', kind: 'colony', prio: 2, ax: 619.15, ay: 433.52, clear: 0.12, w: 39, h: 17 },
    { key: 'c:entity_36', kind: 'colony', prio: 2, ax: 725.01, ay: 274.16, clear: 0.24, w: 19.8, h: 17 },
    { key: 'c:entity_40', kind: 'colony', prio: 2, ax: 649.72, ay: 376.69, clear: 0.43, w: 51.8, h: 17 },
    { key: 'k:v_3,v_35', kind: 'vessel', prio: 4, ax: 627.49, ay: 438.88, clear: 3, w: 32.55, h: 17 }],
    obstacles: [{ cx: 655.2, cy: 462.25, r: 15.98 }, { cx: 885.16, cy: 584.41, r: 3.16 }] },
  phaseA_d200: { rect: { x: 150, y: 28, w: 980, h: 742.8 }, items: [
    { key: 'g:entity_5', kind: 'group', prio: 1, ax: 640, ay: 416.4, clear: 0.28, w: 96.6, h: 17 },
    { key: 'c:entity_7', kind: 'colony', prio: 2, ax: 621.64, ay: 381.9, clear: 0.1, w: 39, h: 17 },
    { key: 'c:entity_36', kind: 'colony', prio: 2, ax: 714.89, ay: 241.52, clear: 0.21, w: 19.8, h: 17 },
    { key: 'c:entity_40', kind: 'colony', prio: 2, ax: 648.56, ay: 331.84, clear: 0.38, w: 51.8, h: 17 },
    { key: 'k:v_3,v_35', kind: 'vessel', prio: 4, ax: 628.98, ay: 386.62, clear: 3, w: 32.55, h: 17 }],
    obstacles: [{ cx: 653.39, cy: 407.21, r: 14.07 }] },
  owner_d450: { rect: { x: 150, y: 28, w: 980, h: 855.36 }, items: [
    { key: 'g:entity_5', kind: 'group', prio: 1, ax: 640, ay: 472.68, clear: 0.14, w: 96.6, h: 17 },
    { key: 'c:entity_7', kind: 'colony', prio: 2, ax: 630.28, ay: 454.42, clear: 0.05, w: 39, h: 17 },
    { key: 'c:entity_36', kind: 'colony', prio: 2, ax: 689.63, ay: 356.8, clear: 0.14, w: 19.8, h: 17 },
    { key: 'c:entity_40', kind: 'colony', prio: 2, ax: 644.88, ay: 424.46, clear: 0.22, w: 51.8, h: 17 },
    { key: 'k:v_3,v_35', kind: 'vessel', prio: 4, ax: 634.27, ay: 457.01, clear: 3, w: 32.55, h: 17 }],
    obstacles: [{ cx: 646.84, cy: 467.98, r: 7.19 }] },
  owner_d12: { rect: { x: 150, y: 28, w: 980, h: 855.36 }, items: [
    { key: 'r:entity_5', kind: 'rail', prio: 1, ax: 640, ay: 472.68, clear: 5.37, w: 113.2, h: 55 },
    { key: 'c:entity_7', kind: 'colony', prio: 2, ax: 490.72, ay: 192.26, clear: 0.83, w: 39, h: 17 },
    { key: 'c:entity_36', kind: 'colony', prio: 2, ax: 823.3, ay: 44.64, clear: 0.51, w: 19.8, h: 17 },
    { key: 'c:entity_40', kind: 'colony', prio: 2, ax: 678.06, ay: 96.61, clear: 1.69, w: 51.8, h: 17 },
    { key: 'k:v_3', kind: 'vessel', prio: 4, ax: 430.1, ay: 240.43, clear: 2, w: 51.3, h: 17 }],
    obstacles: [{ cx: 827.1, cy: 344.19, r: 196.67 }, { cx: 640, cy: 472.68, r: 5.37 }, { cx: 489.71, cy: 197.05, r: 5.56 }, { cx: 514.86, cy: 122.15, r: 10.92 }] },
};
header('L2  anti-overlap i kadr — sceny ZF gy120 (200 j.: dziś 10 nakładających się par plakietek)');
{
  for (const [name, sc] of Object.entries(SCENES)) {
    const res = LL?.placeLabels?.(sc.items, { rect: sc.rect, obstacles: sc.obstacles }) ?? { placed: [], hidden: sc.items.map((i) => i.key) };
    const pairs = LL?.overlappingPairs?.(res.placed, 0) ?? [[0, 0]];
    const outside = res.placed.filter((p) => !LL?.insideRect?.(p, sc.rect, 0));
    ok(res.placed.length === sc.items.length && res.hidden.length === 0 && pairs.length === 0 && outside.length === 0,
      `L2 ${name}: ${res.placed.length}/${sc.items.length} etykiet, nakładające się pary ${pairs.length}, poza obszarem mapy ${outside.length}`);
  }
  const sc = SCENES.owner_d200;
  const a = LL?.placeLabels?.(sc.items, { rect: sc.rect, obstacles: sc.obstacles });
  const b = LL?.placeLabels?.([...sc.items].reverse(), { rect: sc.rect, obstacles: sc.obstacles });
  const sig = (r) => (r?.placed ?? []).map((p) => `${p.key}@${p.x.toFixed(2)},${p.y.toFixed(2)}`).sort().join('|');
  ok(!!a && sig(a) === sig(b), 'L2e: ta sama odpowiedź przy tym samym wejściu (także w innej kolejności — priorytet + klucz)');
  // Bez skoków: poprzedni wybór (inny ważny kandydat) wygrywa nad pierwszym kandydatem.
  const it = { key: 'x', ax: 600, ay: 500, clear: 0, w: 40, h: 16, prio: 2 };
  const fresh = LL?.placeLabels?.([it], { rect: sc.rect, obstacles: [] })?.placed?.[0];
  const prev = new Map([['x', 1]]);
  const kept = LL?.placeLabels?.([it], { rect: sc.rect, obstacles: [], prev })?.placed?.[0];
  ok(fresh?.cand === 0 && kept?.cand === 1 && kept?.side === 'W', `L2f: poprzedni kandydat (W) zostaje, gdy ważny — bez skoku na pierwszy (E): ${fresh?.side} → ${kept?.side}`);
  const blocked = LL?.placeLabels?.([it], { rect: sc.rect, obstacles: [{ x: 540, y: 470, w: 60, h: 40 }], prev })?.placed?.[0];
  ok(blocked && blocked.cand !== 1 && blocked.overlap === 0, `L2g: poprzedni kandydat zablokowany — nowy bez nakładania (kandydat ${blocked?.cand})`);
  // Przeszkody: odczyt zasięgu radaru (525) i tarcza gwiazdy — etykieta ich nie dotyka.
  const readout = { x: 610, y: 470, w: 50, h: 13 };
  const rr = LL?.placeLabels?.([{ ...it, ax: 615, ay: 500 }], { rect: sc.rect, obstacles: [readout, { cx: 650, cy: 520, r: 25 }] })?.placed?.[0];
  ok(rr && rr.overlap === 0 && LL?.rectOverlapArea?.(rr, readout) === 0 && !LL?.rectCircleOverlap?.(rr, 650, 520, 25),
    'L2h: etykieta omija odczyt zasięgu radaru (525) i tarczę ciała');
}

// ═══ L3 ══════════════════════════════════════════════════════════════════════
header('L3  stres — wiele etykiet przy jednej kotwicy; etykieta większa niż kadr');
{
  const rect = { x: 150, y: 28, w: 980, h: 742.8 };
  const items = Array.from({ length: 12 }, (_, i) => ({ key: 'k' + i, ax: 640, ay: 400, clear: 2, w: 60 + i * 3, h: 17, prio: 2 }));
  const res = LL?.placeLabels?.(items, { rect, obstacles: [] });
  const pairs = LL?.overlappingPairs?.(res?.placed ?? [], 0) ?? [[0, 0]];
  ok((res?.placed?.length ?? 0) === 12 && pairs.length === 0 && (res?.placed ?? []).every((p) => LL.insideRect(p, rect, 0)),
    `L3a: 12 etykiet przy jednej kotwicy — położone ${res?.placed?.length}, nakładające się pary ${pairs.length}, wszystkie w kadrze`);
  const edge = LL?.placeLabels?.([{ key: 'e', ax: rect.x + 3, ay: rect.y + 3, clear: 0, w: 80, h: 17, prio: 2 }], { rect })?.placed?.[0];
  ok(edge && LL.insideRect(edge, rect, 0), `L3b: kotwica w rogu kadru — etykieta w kadrze (${edge?.x?.toFixed(1)}, ${edge?.y?.toFixed(1)})`);
  const huge = LL?.placeLabels?.([{ key: 'h', ax: 600, ay: 400, clear: 0, w: 2000, h: 17, prio: 2 }], { rect });
  ok(huge?.placed?.length === 0 && huge?.hidden?.[0] === 'h', 'L3c: etykieta szersza niż kadr — schowana (nie poza obszarem mapy)');
}

// ═══ L4 ══════════════════════════════════════════════════════════════════════
header('L4  strefa kliku — najwyższa strefa; tarcza ciała wygrywa (487, 503)');
{
  const zones = [{ x: 10, y: 10, w: 50, h: 20, key: 'a', target: { type: 'body', id: 'A' } }, { x: 30, y: 15, w: 50, h: 20, key: 'b', target: { type: 'station', id: 'B' } }];
  ok(LL?.resolveLabelClick?.(zones, 40, 20)?.key === 'b', 'L4a: dwie strefy pod punktem — wygrywa ostatnio narysowana (wierzch)');
  ok(LL?.resolveLabelClick?.(zones, 15, 12)?.key === 'a' && LL?.resolveLabelClick?.(zones, 200, 200) === null, 'L4b: punkt w jednej strefie / poza strefami');
  ok(LL?.resolveLabelClick?.(zones, 40, 20, () => true) === null && LL?.resolveLabelClick?.(zones, 40, 20, () => false)?.key === 'b',
    'L4c: punkt na tarczy ciała → brak trafienia etykiety (klik idzie do raycastu tarcz)');
}

// ═══ Świat (stub) — prawdziwy `HudLayer` + `HudLabelLayer` ═══════════════════════════════════════════════════
const K = globalThis.window.KOSMOS ?? (globalThis.window.KOSMOS = {});
const mkCam = (pos, look = [0, 0, 0]) => { const c = new T3.PerspectiveCamera(55, 1600 / 1041, 0.001, 5000); c.position.set(...pos); c.lookAt(...look); c.updateMatrixWorld(); return c; };
const viewOf = (cam) => ({ view: cam.matrixWorldInverse.elements.slice(), proj: cam.projectionMatrix.elements.slice(), fovDeg: 55, cssW: 1600, cssH: 1041, worldPerAU: 11 });
// Ciała (j. świata): gwiazda w (0,0,0) r 3,6; Nowa Ziemia (kolonia, dom), Nowy Księżyc (kolonia na księżycu NZ), stacja przy NZ,
// Fobos (księżyc innej planety).
const BODIES = {
  star: { x: 0, y: 0, z: 0, r: 3.6 }, p_nz: { x: 6.2, y: 0, z: 0, r: 0.3 }, p_moon: { x: 6.7, y: 0, z: 0.25, r: 0.1 },
  st_1: { x: 6.55, y: 0, z: 0.05, r: 0 }, p_x: { x: -8, y: 0, z: 9, r: 0.25 }, p_fob: { x: -8.3, y: 0, z: 9.2, r: 0.05 },
};
const ENT = {
  star: { id: 'star', type: 'star', name: 'Kepler' }, p_nz: { id: 'p_nz', type: 'planet', name: 'Nowa Ziemia' },
  p_moon: { id: 'p_moon', type: 'moon', name: 'Nowy Księżyc', parentPlanetId: 'p_nz' }, p_x: { id: 'p_x', type: 'planet', name: 'Kepler-4799 h' },
  p_fob: { id: 'p_fob', type: 'moon', name: 'Fobos', parentPlanetId: 'p_x' },
};
const mkCol = (pid, o = {}) => ({ planetId: pid, planet: { id: pid, name: ENT[pid].name, systemId: 'sys_home' }, civSystem: { population: 400, freePops: 223 }, ...o });
const COLS = [mkCol('p_nz'), mkCol('p_moon'), mkCol('p_fob')];
const STATIONS = [{ id: 'st_1', name: 'Stacja Nowa Ziemia', bodyId: 'p_nz', pop: 10, popCapacity: 40, modules: [], ownerEmpireId: null }];
const V = (id, o = {}) => ({ id, shipId: 'hull_small', serviceState: 'active', systemId: 'sys_home', isWreck: false, modules: [],
  fuel: { current: 10, max: 10 }, position: { x: 0, y: 0, state: 'in_transit', dockedAt: null }, ...o });
const W0 = { cam: null, camEpoch: 1, lead: null, ids: [], entity: null, sim: null, vessels: [], sprites: {}, hidden: new Set(), intel: {},
  onDisc: () => false, cardRect: null };
const SPR = (id) => (W0.sprites[id] ? { ...W0.sprites[id], r: 0.02 } : null);
const setWorld = () => {
  globalThis.innerWidth = 1600; globalThis.innerHeight = 1041;
  Object.assign(K, {
    civMode: true, activeSystemId: 'sys_home', uiScale: 1.25, planetGlobeOpen: false, uiPrefs: {}, homePlanet: { id: 'p_nz' },
    uiManager: {
      _cleanView: false, overlayManager: { isAnyOpen: () => false },
      getSelectedVesselIds: () => [...W0.ids], getSelectedVesselId: () => W0.lead,
      get _selectedEntity() { return W0.entity ? { id: W0.entity } : null; }, getSelectedFleetId: () => null,
      setSelectedVesselId: (id) => { W0.lead = id; W0.ids = id ? [id] : []; }, addToSelection: (id) => { W0.ids.push(id); },
      _bottomContext: { get _cardRect() { return W0.cardRect; } }, _mapSurface: () => null,
    },
    threeRenderer: {
      _cleanView: false, _renderingEnabled: true, _contextLost: false, _pingedEnemyId: null, renderer: { getPixelRatio: () => 1.5 },
      _hoverPlanetId: null, _planets: new Map([['p_nz', {}], ['p_x', {}]]), _moons: new Map([['p_moon', {}], ['p_fob', {}]]),
      get _vessels() { return new Map(Object.keys(W0.sprites).map((id) => [id, { sprite: { visible: !W0.hidden.has(id) } }])); },
      getCameraMoveEpoch: () => W0.camEpoch, getHudView: () => viewOf(W0.cam),
      getBodyWorldInfo: (id) => (BODIES[id] ? { ...BODIES[id] } : null),
      getVesselWorldPosition: (id) => (W0.sprites[id] ? { ...W0.sprites[id] } : null), getVesselWorldInfo: SPR,
      _isOnBodyDisc: (x, y) => W0.onDisc(x, y), _getVesselAtScreen: () => null,
    },
    entityManager: { get: (id) => ENT[id] ?? null, getByType: (t) => Object.values(ENT).filter((e) => e.type === t) },
    colonyManager: { getPlayerColonies: () => [...COLS], getAllColonies: () => [...COLS], getColony: (id) => COLS.find((c) => c.planetId === id) ?? null },
    stationSystem: { getAllStations: () => [...STATIONS] },
    vesselManager: { getAllVessels: () => [...W0.vessels], getVessel: (id) => W0.vessels.find((v) => v.id === id) ?? null, isImmobilized: () => false,
      getVesselSensorRangeAU: () => 2.5 },
    intelSystem: { getVesselContact: (id) => (W0.intel[id] ? { quality: W0.intel[id] } : null) },
    techSystem: { getMultiplier: () => 1 },
    timeSystem: { get simClockMs() { return W0.sim; }, gameTime: 120 },
    tacticalMode: { isActive: false },
    leftOutliner: { getReservedWidth: () => 150 }, rightOutliner: { getReservedWidth: () => 150 },
    tacticalDock: { getReservedHeight: () => 0 },
    starSystemManager: { switchActiveSystem: () => true },
  });
};
setWorld();
const mkCtx = () => {
  const t = { calls: [] };
  return new Proxy(t, {
    get(o, p) { if (p === 'calls') return o.calls; if (Object.prototype.hasOwnProperty.call(o, p)) return o[p]; return (...a) => { o.calls.push([String(p), ...a]); }; },
    set(o, p, v) { o.calls.push(['=' + String(p), v]); o[p] = v; return true; },
  });
};
const mkHud = () => {
  const ctx = mkCtx(); const cv = { width: 0, height: 0, getContext: () => ctx };
  const lab = LLay?.HudLabelLayer ? new LLay.HudLabelLayer(null) : null;
  const hud = HL?.HudLayer && lab ? new HL.HudLayer(cv, { autoStart: false, sublayers: [lab] }) : null;
  if (lab && hud) lab._hud = hud;
  return { ctx, lab, hud, frame: (now) => (hud ? hud.frame(now) : null), dbg: () => lab?.debug?.() ?? null };
};
const CAM_FAR = mkCam([383.13, 204.12, 118.52]);                 // widok układu ~450 j.
const CAM_MID = mkCam([6.2 + 17.5, 15, 10], [6.2, 0, 0]);        // ~25 j. od Nowej Ziemi — tarcza ~19 px (szyna)
const labelBy = (d, key) => d?.labels?.find((l) => l.key === key) ?? null;
// Rzut punktu świata do px LOGICZNYCH / CSS (jak warstwa).
const projLogical = (cam, p) => { const v = new T3.Vector3(p.x, p.y, p.z).project(cam); return { x: (v.x * 0.5 + 0.5) * 1600 / 1.25, y: (-v.y * 0.5 + 0.5) * 1041 / 1.25 }; };

// ═══ L5 ══════════════════════════════════════════════════════════════════════
header('L5  warstwa: zwinięta grupa, gwiazda (503), szyna, mgła wojny, strzałki (497), warstwa schowana');
{
  W0.cam = CAM_FAR; W0.camEpoch++;
  const H = mkHud();
  const emitted = [];
  const onSel = (e) => emitted.push({ id: e?.entity?.id ?? null, focus: e?.focus });
  EventBus.on('body:selected', onSel);
  const st = H.frame(1000);
  const d = H.dbg();
  const g = labelBy(d, 'g:p_nz');
  ok(st === 'drawn' && !!g && g.text[0] === 'NOWA ZIEMIA +2' && !labelBy(d, 'c:p_moon') && !labelBy(d, 's:st_1'),
    `L5a: widok układu — stos Nowej Ziemi zwinięty: „${g?.text?.[0]}” (bez osobnych etykiet księżyca i stacji)`);
  const fob = labelBy(d, 'c:p_fob');
  ok(!!fob && fob.text[0] === 'FOBOS', 'L5b: Fobos (księżyc innej planety bez kolonii) — osobna etykieta, wersaliki');
  const zones = () => H.lab?._zones ?? [];
  const click = (x, y) => (H.hud?.handleClick ? H.hud.handleClick(x, y, x * 1.25, y * 1.25) : undefined);
  // 503 — środek gwiazdy przy 450 j.: żadna strefa etykiety go nie pokrywa; a nawet gdyby — tarcza wygrywa.
  const sc = projLogical(CAM_FAR, BODIES.star);
  const zoneAtStar = LL?.resolveLabelClick?.(zones(), sc.x, sc.y);
  ok(zoneAtStar === null && zones().length > 0, `L5e: środek gwiazdy (${sc.x.toFixed(1)}, ${sc.y.toFixed(1)}) — bez strefy etykiety (dziś: strefa stacji, 503)`);
  // ── L5c-T2 / L5d-T2 / L5f-T2 — kotwica przypięta wychodzi ze stosu do własnej etykiety (REFORMA ZAKŁADEK T2; od T4 jedyna ścieżka) ──
  W0.camEpoch++; H.frame(1110);
  const zT = zones().find((q) => q.key === 'g:p_nz');
  emitted.length = 0;
  const rT1 = zT ? click(zT.x + zT.w / 2, zT.y + zT.h / 2) : undefined;
  W0.entity = 'p_nz';                                             // gra: `body:selected` = przypięcie
  H.frame(1120); H.frame(1400);
  const dT = H.dbg();
  const pinL = (dT?.labels ?? []).find((l) => l.pinLabel);
  const restT = labelBy(dT, 'g:p_nz');
  ok(rT1 === true && emitted[0]?.id === 'p_nz' && emitted[0]?.focus === false && pinL?.key === 'c:p_nz' && pinL?.text?.[0] === 'NOWA ZIEMIA'
    && restT?.text?.[0] === 'NOWY KSIĘŻYC +1', `L5c-T2: 1. klik zwiniętej → kotwica przypięta we własnej etykiecie „${pinL?.text?.[0]}”, reszta „${restT?.text?.[0]}”`);
  const nameZ = dT?.pin?.zones?.find((q) => q.kind === 'name');
  const rT2 = nameZ ? click(nameZ.x + 2, nameZ.y + 2) : undefined;
  ok(rT2 === true && emitted.length === 2 && emitted[1].id === 'p_nz' && emitted[1].focus === true, 'L5d-T2: drugi klik w linię nazwy przypiętej kotwicy → kamera (`focus: true`)');
  const bodyZ = dT?.pin?.zones?.find((q) => q.kind === 'body');
  W0.onDisc = () => true;
  const rT3 = bodyZ ? click(bodyZ.x + 2, bodyZ.y + bodyZ.h - 3) : undefined;
  W0.onDisc = () => false;
  ok(rT3 === true && emitted.length === 2, 'L5f-T2: punkt przypiętej etykiety na tarczy ciała — klik pochłonięty przez przypięcie (przycisk > etykieta > tarcza), bez zdarzeń');
  W0.entity = null;
  W0.camEpoch++; H.frame(1450);
  // Szyna przy średnim zbliżeniu — strefa na wiersz; wiersz stacji → panel stacji.
  W0.cam = CAM_MID; W0.camEpoch++;
  H.frame(1200);
  const d2 = H.dbg();
  const rail = labelBy(d2, 'r:p_nz');
  ok(!!rail && rail.text.join('|') === 'NOWA ZIEMIA|NOWY KSIĘŻYC|Stacja Nowa Ziemia', `L5g: zbliżenie — szyna: ${rail ? rail.text.join(' / ') : '—'}`);
  const stZone = zones().find((q) => q.key === 's:st_1');
  const stEv = [];
  const onSt = (e) => stEv.push(e?.stationId);
  EventBus.on('station:selected', onSt);
  const r4 = stZone ? click(stZone.x + 3, stZone.y + 3) : false;
  EventBus.off('station:selected', onSt);
  ok(r4 === true && stEv[0] === 'st_1', 'L5h: wiersz stacji w szynie — własna strefa, klik → `station:selected`');
  EventBus.off('body:selected', onSel);
  // Mgła wojny i sprite'y (statki w kadrze CAM_MID).
  W0.vessels = [V('v_own', { name: 'Kurier', fleetId: null, position: { x: 680, y: 30, state: 'in_transit', dockedAt: null } }),
    V('v_un', { name: 'Ukryty', isEnemy: true, ownerEmpireId: 'emp_1', position: { x: 600, y: 60, state: 'orbiting', dockedAt: null } }),
    V('v_rum', { name: 'Rajder', isEnemy: true, ownerEmpireId: 'emp_1', position: { x: 700, y: 60, state: 'orbiting', dockedAt: null } }),
    V('v_con', { name: 'Furiat', isEnemy: true, ownerEmpireId: 'emp_2', position: { x: 760, y: -40, state: 'orbiting', dockedAt: null } })];
  W0.sprites = { v_own: { x: 6.8, y: 0.3, z: 0.4 }, v_un: { x: 5.6, y: 0.3, z: 0.8 }, v_rum: { x: 7.0, y: 0.3, z: 0.9 }, v_con: { x: 7.9, y: 0.3, z: -0.6 } };
  W0.intel = { v_un: 'unknown', v_rum: 'rumor', v_con: 'contact' };
  W0.lead = 'v_own'; W0.ids = ['v_own'];
  W0.camEpoch++; H.frame(1300);
  const d3 = H.dbg();
  const txt = (d3?.labels ?? []).map((l) => l.text.join(' / '));
  ok(!txt.some((s) => /ukryty/.test(s)) && txt.some((s) => /kurier/.test(s)), 'L5i: wróg `unknown` — bez etykiety (mgła wojny; świadek: etykieta własnego statku jest)');
  ok(txt.some((s) => s === '⚠ ?'), `L5j: wróg \`rumor\` — anonimowy „⚠ ?” (bez nazwy i bez danych)`);
  ok(txt.some((s) => /^⚠ (\S+ )?furiat/.test(s)) && txt.some((s) => /(^|\s)kurier( \/ |$)/.test(s)),
    `L5k: wróg \`contact\` — nazwa; statek zaznaczony — etykieta małymi literami (${txt.filter((s) => /furiat|kurier/.test(s)).join(' | ')})`);
  W0.hidden.add('v_con'); W0.camEpoch++; H.frame(1400);
  const d3b = H.dbg()?.labels ?? [];
  ok(!d3b.some((l) => /furiat/.test(l.text.join(' '))) && d3b.some((l) => /kurier/.test(l.text.join(' '))),
    'L5l: sprite wroga ukryty (mgła) — bez etykiety, mimo jakości `contact` (485; świadek: własny statek z etykietą)');
  W0.hidden.clear();
  // 497 — statek poza kadrem, ŻADNEJ etykiety statku w kadrze: strzałka krawędzi i tak jest.
  W0.vessels = [V('v_far', { name: 'Daleki', position: { x: 0, y: 0, state: 'in_transit', dockedAt: null } })];
  // Punkt PRZED kamerą, poza kadrem w prawo (NDC x = 1,6) — za kamerą statek nie ma ani etykiety, ani strzałki (jak dziś).
  const off = new T3.Vector3(1.6, 0, 0.9999).unproject(CAM_MID);
  W0.sprites = { v_far: { x: off.x, y: off.y, z: off.z } };
  W0.lead = null; W0.ids = []; W0.intel = {};
  W0.camEpoch++; H.frame(1500);
  const d4 = H.dbg();
  ok((d4?.arrows ?? []).length >= 1 && !(d4?.labels ?? []).some((l) => l.kind === 'vessel'), `L5m: statek poza kadrem bez etykiet statków w kadrze — strzałka krawędzi (${(d4?.arrows ?? []).length}, 497)`);
  // `uiPrefs.fleetMapLabelsVisible === false` — bez etykiet i strzałek statków; ciała zostają.
  K.uiPrefs.fleetMapLabelsVisible = false; W0.camEpoch++; H.frame(1600);
  const d5 = H.dbg();
  ok((d5?.arrows ?? []).length === 0 && (d5?.labels ?? []).some((l) => l.kind === 'rail'), 'L5n: ☰ „Plakietki floty” wyłączone — bez statków, ciała zostają');
  delete K.uiPrefs.fleetMapLabelsVisible;
  // Poza trybem cywilizacji — warstwa schowana: klik w strefę z ostatniej klatki nie łapie (dawniej: flaga OFF — pusto).
  const zLast = zones()[0] ?? null;
  K.civMode = false; W0.camEpoch++; const stHid = H.frame(1700);
  const rHid = zLast ? click(zLast.x + zLast.w / 2, zLast.y + zLast.h / 2) : undefined;
  K.civMode = true;
  ok(!!zLast && rHid === false, `L5o (B-Z): poza trybem cywilizacji — warstwa schowana (${stHid}), klik w strefę etykiety „${zLast?.key}” nie łapie`);
  W0.camEpoch++; H.frame(1750);
  const zBack = zones().find((q) => q.key === zLast?.key) ?? null;
  ok(!!zBack && click(zBack.x + zBack.w / 2, zBack.y + zBack.h / 2) === true,
    'L5o KONTROLA: tryb cywilizacji z powrotem — ta sama strefa łapie klik (pin nie jest jałowy)');
  // Ramka zaznaczenia (`fcBrackets`) leży NAD warstwą HUD — etykieta zaznaczonego statku poza ramką i paskami zasobów.
  W0.vessels = [V('v_own', { name: 'Kurier', fleetId: null, position: { x: 680, y: 30, state: 'in_transit', dockedAt: null } })];
  W0.sprites = { v_own: { x: 6.8, y: 0.3, z: 0.4 } }; W0.intel = {}; W0.lead = 'v_own'; W0.ids = ['v_own'];
  const RB = LL?.HUD_LABELS ?? {};
  const sp = projLogical(CAM_MID, W0.sprites.v_own);
  const B = (RB.BRACKET_HALF ?? 17) + 2;
  const sq = { x: sp.x - B, y: sp.y - B, w: 2 * B, h: 2 * B + (RB.BRACKET_BARS ?? 14) };
  const ownBox = (fc) => {
    const was = FEATURES.fcBrackets; FEATURES.fcBrackets = fc;
    const Hb = mkHud(); W0.camEpoch++; Hb.frame(1800);
    FEATURES.fcBrackets = was;
    return (Hb.dbg()?.labels ?? []).find((l) => /kurier/.test(l.text.join(' '))) ?? null;
  };
  const onB = ownBox(true), offB = ownBox(false);
  ok(!!onB && (LL?.rectOverlapArea?.(onB, sq) ?? 1) === 0,
    `L5p: ramki zaznaczenia ON — etykieta zaznaczonego statku poza ramką i paskami (etykieta x ${onB?.x}, y ${onB?.y}; ramka ${sq.x.toFixed(1)}–${(sq.x + sq.w).toFixed(1)})`);
  ok(!!offB && (LL?.rectOverlapArea?.(offB, sq) ?? 0) > 0, 'L5p KONTROLA: bez ramek etykieta stoi w obszarze, który zajęłaby ramka (pin nie jest jałowy)');
  W0.vessels = []; W0.sprites = {}; W0.lead = null; W0.ids = [];
  // Strzałki krawędzi (497, strojenie 1): kolor WYŁĄCZNIE z ról motywu — własne `primary` (także z alertem), obce `foreign`.
  const offR = new T3.Vector3(1.6, 0, 0.9999).unproject(CAM_MID), offL = new T3.Vector3(-1.6, 0.2, 0.9999).unproject(CAM_MID);
  W0.vessels = [V('v_al', { name: 'Uszkodzony', damaged: true, position: { x: 0, y: 0, state: 'in_transit', dockedAt: null } }),
    V('v_en', { name: 'Najeźdźca', isEnemy: true, ownerEmpireId: 'emp_1', position: { x: 0, y: 0, state: 'in_transit', dockedAt: null } })];
  W0.sprites = { v_al: { x: offR.x, y: offR.y, z: offR.z }, v_en: { x: offL.x, y: offL.y, z: offL.z } };
  W0.intel = { v_en: 'contact' };
  const Ha = mkHud(); W0.camEpoch++; Ha.frame(1900);
  const arr = Ha.dbg()?.arrows ?? [];
  const own = arr.find((a) => a.edge === 'right'), foe = arr.find((a) => a.edge === 'left');
  ok(own?.role === 'primary' && foe?.role === 'foreign', `L5q: strzałka własnego statku z alertem — rola \`primary\`, obcego — \`foreign\` (${own?.role}, ${foe?.role})`);
  const HP = await tryImport('../../ui/HudPalette.js');
  const TC = await tryImport('../../config/ThemeConfig.js');
  const roles = HP?.resolveHudRoles?.(TC?.THEME) ?? {};
  const fills = [];
  { let fs = null; for (const c of Ha.ctx.calls) { if (c[0] === '=fillStyle') fs = c[1]; else if (c[0] === 'fill') fills.push(fs); } }
  ok(fills.length >= 2 && fills.includes(roles.primary) && fills.includes(roles.foreign) && fills.every((f) => Object.values(roles).includes(f)),
    `L5q: wypełnienia strzałek = kolory ról motywu (${[...new Set(fills)].join(', ')})`);
  const lay = strip(src('../../ui/HudLabelLayer.js'));
  ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(lay), 'L5r: warstwa etykiet bez kolorów na sztywno (zero literałów #hex / rgb w kodzie)');
  W0.vessels = []; W0.sprites = {}; W0.intel = {};
}

// ═══ L6 ══════════════════════════════════════════════════════════════════════
header('L6  zegary: fade-in na czasie realnym (także w pauzie), potem spoczynek — 0 wywołań ctx');
{
  ok(LL?.fadeAlpha?.(1000, 1000) === 0 && Math.abs((LL?.fadeAlpha?.(1075, 1000) ?? 0) - 0.5) < 1e-9 && LL?.fadeAlpha?.(1150, 1000) === 1,
    'L6a: fade-in 0 → 0,5 → 1 w 150 ms czasu realnego');
  const born = new Map();
  const f1 = LL?.updateBorn?.(born, ['a', 'b'], 0), f2 = LL?.updateBorn?.(born, ['a'], 100), f3 = LL?.updateBorn?.(born, ['a', 'c'], 200);
  ok(f1 === true && born.has('a') && !born.has('b') && f2 === true && f3 === true && born.get('c') === 200 && born.get('a') === 0,
    'L6b: nowa etykieta rodzi się teraz; zniknięta — zapomniana; „trwa fade” dopóki któraś < 150 ms');
  W0.cam = CAM_FAR; W0.camEpoch++; W0.sim = null;     // pauza: zegar symulacji stoi (null przed pierwszym tikiem)
  const H = mkHud();
  const a = H.frame(5000);
  const b = H.frame(5050);                                         // fade trwa — rysuje mimo braku zmian świata
  const c = H.frame(5200);                                         // fade skończony — ostatnia klatka
  const n0 = H.ctx.calls.length;
  const d = H.frame(5300), e = H.frame(5400);
  ok(a === 'drawn' && b === 'drawn' && c === 'drawn' && d === 'idle' && e === 'idle' && H.ctx.calls.length === n0,
    `L6c: pauza — fade-in rysuje do końca (czas realny), potem spoczynek: ${a}/${b}/${c}/${d}/${e}, 0 wywołań ctx`);
}

// ═══ L7 ══════════════════════════════════════════════════════════════════════
header('L7  montaż (piny źródłowe): plakietek MapLabelLayer brak; klik HUD przed raycastem; kursor; kolejność podwarstw');
{
  const ui = strip(src('../../scenes/UIManager.js'));
  let mapLabelModule = true;
  try { readFileSync(new URL('../../ui/MapLabelLayer.js', import.meta.url)); } catch { mapLabelModule = false; }
  ok(!mapLabelModule && ui.length > 50000 && !/MapLabelLayer|_mapLabelLayer/.test(ui),
    'L7a (B-Z): plakietki kolonii, stacji i flot (`MapLabelLayer`) usunięte — moduł, import i rysunek w UIManager');
  const hc = ui.slice(ui.indexOf('  handleClick(x, y) {'), ui.indexOf('  _getAllVesselsForColony('));
  const iTop = hc.indexOf('this._bottomBar.hitTest('),
    iHud = hc.indexOf('hudLayer?.handleClick?.('), iAct = hc.indexOf('this._hitTestActionPanel(');
  ok(hc.length > 0 && !/_mapLabelLayer|isHudLabelsOn/.test(hc),
    'L7b (B-Z): klik — bez plakietek `MapLabelLayer` i bez gałęzi flagi etykiet');
  ok(iTop > 0 && iHud > iTop && iAct > iHud && /civMode/.test(hc.slice(iTop, iHud)) && !/_bottomContext|_bodyCardEntity/.test(hc),
    `L7c: klik etykiet HUD po pasku dolnym, przed końcem łańcucha UI (pasek ${iTop} < HUD ${iHud} < akcje ${iAct}); karty ciała brak (T4)`);
  const mm = ui.slice(ui.indexOf('  handleMouseMove(x, y) {'), ui.indexOf('  handleMouseMove(x, y) {') + 600);
  ok(/hudLayer\?\.setPointer\?\.\(x \/ UI_SCALE, y \/ UI_SCALE, x, y, this\.isOverUI\(x, y\)\)/.test(mm), 'L7d: kursor do warstwy HUD (px logiczne + CSS, flaga „nad UI”)');
  const hl = strip(src('../../ui/HudLayer.js'));
  // ARKUSZ HUD paczka B — po etykietach podwarstwa nawiasów i alertów (`HudFocusLayer`, czyta etykiety tej klatki).
  // PRZECELOWANE 2026-10-29 (ZNACZNIK STATKU SM-1): między radarem a etykietami może stać znacznik statku (`HudShipMarkerLayer`)
  //   — też zbierany przed etykietami (jego prostokąty są przeszkodami etykiet).
  ok(/_defaultSublayers\(\)\s*\{\s*return \[[^\]]*new HudRadarLayer\(this\), (?:new HudShipMarkerLayer\(this\), )?new HudLabelLayer\(this\)(?:, new HudFocusLayer\(this\))?\];/.test(hl),
    'L7e: podwarstwy gry — radar (i znacznik statku), potem etykiety (zbierane po nich — czytają przeszkody warstw zebranych wcześniej); paczka B — nawiasy po etykietach');
}

// ═══ L8 ══════════════════════════════════════════════════════════════════════
header('L8  ucinanie z „…” (513)');
{
  const w = (s) => s.length * 6;
  ok(LL?.truncateText?.('Stacja Nowa Ziemia', 200, w) === 'Stacja Nowa Ziemia', 'L8a: pełna nazwa, gdy się mieści (dziś `.slice(0, 16)` — „Stacja Nowa Ziem”)');
  const t = LL?.truncateText?.('Bardzo długa nazwa stacji orbitalnej', 60, w) ?? '';
  ok(t.endsWith('…') && w(t) <= 60, `L8b: za długa — ucięta z „…” („${t}”)`);
}

// ═══ L9 ══════════════════════════════════════════════════════════════════════
// Piny dawnego `body_card_side_smoke` C2 (keeper usunięty w REFORMIE ZAKŁADEK T4 razem z kartą ciała) — tarcza obiektu
// z WSPÓLNEGO projektora HUD (`HudProjection.objectScreenDisc`, woła warstwa etykiet: stacja pod kursorem, `coversPoint`).
header('L9  tarcza obiektu z projektora HUD (`objectScreenDisc`)');
{
  let HP = null; try { HP = await import('../../ui/HudProjection.js'); } catch (e) { console.log('    (' + e.message + ')'); }
  const disc = (K, kind, id) => { try { return HP?.objectScreenDisc?.(K, kind, id); } catch (e) { console.log('    (' + e.message + ')'); return undefined; } };
  const NZ = { x: 6.2, y: 0, z: 0, r: 0.3 };
  const camAt = (dist) => mkCam([NZ.x, dist * 0.5, dist * 0.866], [NZ.x, 0, 0]);
  const KST = (cam) => ({ uiScale: 1.25, threeRenderer: {
    getHudView: () => viewOf(cam),
    getBodyWorldInfo: (id) => (id === 'p_nz' ? { ...NZ } : null),
    getVesselWorldInfo: (id) => (id === 'v_1' ? { x: 6.5, y: 0.3, z: 0.2, r: 0.02 } : null),
    getStationWorldInfo: (id) => (id === 'st_1' ? { x: 6.55, y: 0, z: 0.05, r: 0.012 } : null),
  } });
  const cam = camAt(2);
  const d = disc(KST(cam), 'body', 'p_nz');
  const v = new T3.Vector3(NZ.x, NZ.y, NZ.z).project(cam);
  const ex = (v.x * 0.5 + 0.5) * 1600 / 1.25, ey = (-v.y * 0.5 + 0.5) * 1041 / 1.25;
  const fpx = (1041 / 2) / Math.tan((55 / 2) * Math.PI / 180) / 1.25;      // ogniskowa w px logicznych
  const er = 0.3 / 2 * fpx;                                                 // promień przy odległości 2 j.
  ok(!!d && Math.abs(d.x - ex) < 0.01 && Math.abs(d.y - ey) < 0.01 && Math.abs(d.r - er) / er < 0.01,
    `L9a: ciało — środek i promień jak rzut kamery w px logicznych (r ${d?.r?.toFixed?.(1)} ≈ ${er.toFixed(1)} px)`);
  const dv = disc(KST(cam), 'vessel', 'v_1'), ds = disc(KST(cam), 'station', 'st_1');
  ok(dv?.r > 0 && ds?.r > 0 && dv.r < d.r && ds.r < d.r, 'L9b: statek i stacja — tarcza z rozmiaru modelu (mniejsza niż planety)');
  const behind = mkCam([NZ.x + 5, 0.5, 0], [NZ.x + 10, 0.5, 0]);          // Nowa Ziemia za kamerą
  ok(disc(KST(behind), 'body', 'p_nz') === null && disc(KST(cam), 'body', 'nope') === null, 'L9c: za kamerą / nie w scenie — brak tarczy');
  // Podłoga zoomu stacji (0,005 j.) leży bliżej niż próg głębi okręgów radaru (0,01 j.) — tarcza ma przetrwać.
  const ST = { x: 6.55, y: 0, z: 0.05 };
  const close = mkCam([ST.x, 0.003, ST.z + 0.0052], [ST.x, 0, ST.z]);
  const dClose = disc(KST(close), 'station', 'st_1');
  const projD = HP?.makeHudProjector?.({ ...viewOf(close), uiScale: 1.25 });
  const defNull = projD ? projD.point(ST.x, ST.y, ST.z) : 'brak';
  ok(!!dClose && Math.abs(dClose.x - 640) < 2 && dClose.r > 100 && defNull === null,
    `L9d: stacja 0,006 j. przed kamerą (bliżej niż próg radaru 0,01 j.) — tarcza jest (r ${dClose?.r?.toFixed?.(0)} px); KONTROLA: domyślny próg projektora ją odrzuca`);
}

// ═══ L10 ═════════════════════════════════════════════════════════════════════
header('L10  Finding 568 — jedna reguła nazwy obcego statku (etykieta · rozwinięcie T1 · linia alertu)');
{
  const ML = await tryImport('../../ui/MapLabelLogic.js');
  const LH = await tryImport('../../ui/LabelHoverLogic.js');
  const AL = await tryImport('../../ui/HudAlertLogic.js');
  const VR = await tryImport('../../utils/VesselReveal.js');
  const I18 = await tryImport('../../i18n/i18n.js');
  const tt = I18?.t ?? ((k) => k);
  const NAME = 'Furiat', ROLE = 'Okręt testowy';
  const foe = V('v_e', { name: NAME, isEnemy: true, ownerEmpireId: 'emp_1' });
  const QS = ['unknown', 'rumor', 'contact', 'detailed', 'RUMOR', 'secret'];
  const label = (q) => { try { return ML?.gatherVesselLabels?.([foe], { getScreenPos: () => ({ x: 10, y: 10 }), enemyQuality: () => q, activeSystemId: 'sys_home' })?.[0] ?? null; } catch (e) { return { err: e.message }; } };
  const t1 = (q) => { try { return LH?.enemyVesselExpansionLines?.({ quality: q, roleLabel: ROLE }, tt)?.[0] ?? null; } catch { return null; } };
  const alertId = (q) => { try { return AL?.alertIdentity?.({ quality: q, roleLabel: ROLE, name: NAME }, tt) ?? null; } catch { return null; } };
  const rows = QS.map((q) => ({ q, named: VR?.enemyVesselNamed?.(q) === true, lbl: label(q), t1: t1(q), al: alertId(q) }));
  const namedQs = rows.filter((r) => r.named).map((r) => r.q).join(',');
  ok(typeof VR?.enemyVesselNamed === 'function' && namedQs === 'contact,detailed',
    `L10a SEDNO: reguła — nazwa od \`contact\` (${namedQs || '—'}); każda inna jakość (także nieznany napis) — bez nazwy`);
  const shown = rows.filter((r) => r.q !== 'unknown');
  const agree = shown.every((r) => !!r.lbl && (r.lbl.name === NAME) === r.named && (r.al === NAME) === r.named
    && (r.t1 === ROLE) === r.named && (r.named || r.t1 === tt('intel.unidentifiedContact')));
  ok(agree, `L10b SEDNO: etykieta, rozwinięcie T1 i linia alertu — ta sama odpowiedź przy każdej jakości (${shown.map((r) => `${r.q}: ${r.lbl?.name ?? '—'} / ${r.t1 ?? '—'} / ${r.al ?? '—'}`).join(' · ')})`);
  ok(label('unknown') === null && rows.find((r) => r.q === 'rumor')?.lbl?.name === '?' && rows.find((r) => r.q === 'contact')?.lbl?.name === NAME,
    'L10c KONTROLA: `unknown` — bez etykiety, `rumor` — „?”, `contact` — nazwa (etykieta jak przed 568)');
  const uses = ['../../ui/MapLabelLogic.js', '../../ui/LabelHoverLogic.js', '../../ui/HudAlertLogic.js'].filter((p) => /\benemyVesselNamed\(/.test(strip(src(p))));
  ok(uses.length === 3, `L10d: trzy powierzchnie pytają \`VesselReveal.enemyVesselNamed\` (${uses.length}/3 — jedno źródło progu)`);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
