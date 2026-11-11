// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_normalizer_logic_smoke — KEEPER ARC COMBAT VISUALS, krok CV-1b (normalizator modeli statków; logika — F11, bez pinów na
// stałych rysunku). Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §2.11, §4 CV-1b; D-CV-13 / 14 / 15, warunek §3.1-4.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (czyste funkcje `tools/ship-models/lib/*` na syntetycznych siatkach w pamięci + pliki slotów z dysku):
//   N1 bbox / środek / skala: macierz normalizacji daje środek (0,0,0) i najdłuższy wymiar 1,0 — także po obrocie osi.
//   N2 zgadywanie dziobu z gęstości wierzchołków w ostatnich 8 % długości: na osiach X / Y / Z, w obie strony; symetryczna
//      bryła = niepewne. KONTROLA: zamiana gęstości końców odwraca odpowiedź.
//   N3 obrót: dla każdej osi i zwrotu dziobu i góry — permutacja ze znakami, wyznacznik +1, dziób → −X, góra → +Y.
//   N4 dysza z przekroju rufy: punkt na końcu rufy w osi przekroju, promień w przedziale.
//   N5 hardpointy: SCALANIE zachowuje kliknięte punkty (światła, wieżyczki, dysza, strojenie maski), obrót przenosi punkty;
//      wybór źródła: incoming tego samego pliku → przeniesione, incoming innego pliku → pomiar od nowa, poprzednia normalizacja
//      tego samego modelu → zachowana, dokument STAREGO modelu slotu → NIE scalany (KONTROLA: jego punkty nie trafiają na nowy
//      kadłub); zapis JSON wraca do tego samego dokumentu; `source.input` przechodzi walidację, zepsuty — nie.
//   N6 rasteryzacja UV (środek teksela, zawijanie, trójkąt zdegenerowany = 0); N7 statystyki tekstury: maska koloru-klucza
//      gry (cyjan liczony, niebieskie panele ≥ 194° nie, poza obszarem UV nie), jasność kadłuba.
//   N8 werdykty raportu: progi trójkątów / ciemnego kadłuba / cyjanu / niepewnego dziobu; rzeczy niemierzalne jako ☐, nigdy ✔.
//   N9 plan tekstur: kolor bazowy JPEG w limicie — BAJTY BEZ ZMIAN, żadna ścieżka koloru bazowego nie jest stratna;
//      zmniejszenie — bezstratnie; „tylko gdy mniejszy". N10 nazwy slotów z nazw plików.
//   N11 ROUND-TRIP na PRAWDZIWYCH plikach slotów (własny parser GLB, bez zależności npm): sześć modeli właściciela —
//      sha256 = hardpointy, normalizator i plik wejściowy zapisane, tylko rozszerzenia obsługiwane przez loader gry (bez
//      Draco / meshopt / KTX2), obrazy JPEG / PNG / WebP z deklaracją EXT_texture_webp, geometria wyśrodkowana i długości
//      1,0 wzdłuż X, wariant 1K z tą samą geometrią; PRAWDZIWY rig gry (`buildShipRig`, three r171) na tej geometrii z tymi
//      hardpointami: model znormalizowany, dziób w ramie kanonicznej +Z, smuga za rufą. Stare modele po przebiegu tekstur:
//      geometria nietknięta (dysza zmierzona ponownie = dysza z pliku pomiaru CV-1a).
//   N12 źródło: zero `Math.random` w narzędziu; determinizm czystego potoku (dwa przebiegi = te same liczby).
// ⚠ GLTFLoader gry przychodzi z CDN (w node jest tylko stub `three`) — samo parsowanie loaderem sprawdza przebieg na żywym
//   silniku (kosmos-handover/cv-1b); tu przypięty jest kontrakt pliku, na którym loader polega, i rig gry na tych danych.
// ⚠ Importy narzędzia dynamiczne w try/catch — przy braku modułu piny DEGRADUJĄ (czerwone), suita się nie przerywa.
// ⚠ PRZECELOWANE ŚWIADOMIE po łącznej kontroli właściciela CV-1b + CV-1c (2026-11-11): N11f wymagał dyszy = pomiar normalizatora
//   dla KAŻDEGO slotu. Od CV-1c dyszę może ustawić właściciel w Workshopie (dopisek „Model Workshop <data>:” w notes) — taki slot
//   ma dyszę w prostopadłościanie modelu, w rufowej połowie; reszta slotów — równość jak dotąd, ze świadkiem (≥ 1 slot równością).
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { exhaustGradientColors } from '../../utils/VesselFxLogic.js';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const G   = await tryImport('../../../tools/ship-models/lib/geometry.mjs');
const UV  = await tryImport('../../../tools/ship-models/lib/uv.mjs');
const TS  = await tryImport('../../../tools/ship-models/lib/texstats.mjs');
const TX  = await tryImport('../../../tools/ship-models/lib/textures.mjs');
const HPL = await tryImport('../../../tools/ship-models/lib/hardpoints.mjs');
const SL  = await tryImport('../../../tools/ship-models/lib/slots.mjs');
const RP  = await tryImport('../../../tools/ship-models/lib/report.mjs');
const SC  = await tryImport('../../data/ShipHardpointsSchema.js');
const HP  = await tryImport('../../renderer/ShipHardpoints.js');
const RIG = await tryImport('../../renderer/ShipModelRig.js');
const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const block = async (title, fn) => { header(title); try { await fn(); } catch (e) { assert(false, `${title} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const vnear = (a, b, e = 1e-9) => a.every((x, i) => near(x, b[i], e));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// ── syntetyczny „statek": rufa gęsta (siatka dysz), nos rzadki i zwężony; oś długości, zwrot dziobu, przesunięcie, skala ──
function synthShip({ axis = 0, bowSign = -1, centre = [3, -2, 5], scale = 7.5 } = {}) {
  const pts = [];
  const put = (u, a, b) => { const p = [0, 0, 0]; const others = [0, 1, 2].filter((k) => k !== axis); p[axis] = u; p[others[0]] = a; p[others[1]] = b; pts.push(p); };
  for (let i = 0; i <= 40; i++) { const u = -0.5 + i / 40; const w = 0.08 + 0.06 * Math.min(1, (u + 0.5) * 3); for (const [a, b] of [[w, w], [-w, w], [w, -w], [-w, -w]]) put(u, a * 0.9, b * 0.6); }
  for (let i = 0; i < 300; i++) { const t = i / 300; put(0.47 + 0.03 * ((i * 37) % 100) / 100, 0.04 * Math.cos(t * 40), 0.03 * Math.sin(t * 40)); }   // dysza przy u = +0,5
  put(-0.5, 0, 0);   // czubek nosa
  // u = +0,5 to RUFA; dziób w −u ⇒ dla bowSign = +1 odbij oś długości
  const out = new Float64Array(pts.length * 3);
  pts.forEach((p, i) => { const q = p.slice(); if (bowSign > 0) q[axis] = -q[axis]; for (let k = 0; k < 3; k++) out[i * 3 + k] = q[k] * scale + centre[k]; });
  return out;
}

// ── N1 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('N1 bbox, środek, skala — normalizacja daje środek 0 i najdłuższy wymiar 1,0', () => {
  const pos = synthShip({ axis: 0, bowSign: -1, centre: [3, -2, 5], scale: 7.5 });
  const bb = G.bboxOf(pos);
  assert(G.longestAxisOf(bb) === 0 && vnear(G.centreOf(bb), [3 + 7.5 * 0, -2, 5], 0.5), `N1a oś najdłuższa X, środek ≈ przesunięcie (${G.centreOf(bb).map((x) => x.toFixed(2))})`);
  const out = G.transformPositions(G.normalizationMatrix(bb, G.IDENTITY3), pos), ob = G.bboxOf(out), oe = G.extentOf(ob);
  assert(vnear(G.centreOf(ob), [0, 0, 0], 1e-12) && near(Math.max(...oe), 1, 1e-12) && near(oe[0], 1, 1e-12), `N1b po normalizacji: środek (0,0,0), najdłuższy wymiar 1,0 wzdłuż X (${oe.map((x) => x.toFixed(4))})`);
  const posZ = synthShip({ axis: 2, bowSign: 1, centre: [-1, 4, 2], scale: 0.3 });
  const bbZ = G.bboxOf(posZ), gz = G.guessBow(posZ, 2, { bb: bbZ });
  const { R } = G.orientationFor({ bowAxis: 2, bowSign: gz.sign });
  const outZ = G.transformPositions(G.normalizationMatrix(bbZ, R), posZ), obZ = G.bboxOf(outZ), oeZ = G.extentOf(obZ);
  assert(vnear(G.centreOf(obZ), [0, 0, 0], 1e-12) && near(oeZ[0], 1, 1e-12) && oeZ[1] < 1 && oeZ[2] < 1, `N1c model wzdłuż Z: po obrocie najdłuższa oś X, środek 0, długość 1,0 (${oeZ.map((x) => x.toFixed(4))})`);
});

// ── N2 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('N2 zgadywanie dziobu z gęstości końców (8 % długości) — osie X / Y / Z, oba zwroty', () => {
  let ok = 0, n = 0;
  for (const axis of [0, 1, 2]) for (const s of [-1, 1]) {
    const pos = synthShip({ axis, bowSign: s });
    const g = G.guessBow(pos, axis);
    n++; if (g.sign === s && g.confident) ok++;
  }
  assert(ok === n, `N2a dziób zgadnięty pewnie w ${ok} / ${n} (oś × zwrot)`);
  const pos = synthShip({ axis: 0, bowSign: -1 }), g = G.guessBow(pos, 0);
  assert(g.sign === -1 && g.atMax > g.atMin * 3, `N2b rufa (+X) gęsta: ${g.atMax} wobec ${g.atMin} przy nosie`);
  // KONTROLA: ta sama bryła odbita — odpowiedź się odwraca (pin mierzy gęstość, nie stały znak).
  const flipped = synthShip({ axis: 0, bowSign: 1 }), gf = G.guessBow(flipped, 0);
  assert(gf.sign === 1 && gf.atMin === g.atMax && gf.atMax === g.atMin, 'N2c nie-jałowość: odbita bryła — liczności końców zamienione, dziób w +X');
  const sym = new Float64Array([-0.5, 0, 0, 0.5, 0, 0, -0.49, 0.1, 0, 0.49, 0.1, 0, 0, 0.2, 0]);
  assert(!G.guessBow(sym, 0).confident, 'N2d bryła symetryczna — zgadnięcie NIEPEWNE (raport każe sprawdzić w grze)');
});

// ── N3 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('N3 obrót — permutacja ze znakami, wyznacznik +1, dziób → −X, góra → +Y', () => {
  let ok = 0, n = 0, warn = 0;
  for (const bowAxis of [0, 1, 2]) for (const bowSign of [-1, 1]) for (const upAxis of [0, 1, 2]) for (const upSign of [-1, 1]) {
    const { R, warnings } = G.orientationFor({ bowAxis, bowSign, upAxis, upSign });
    const bv = [0, 0, 0]; bv[bowAxis] = bowSign;
    const good = G.isSignedPermutation(R) && G.det3(R) === 1 && vnear(G.mul3v(R, bv), [-1, 0, 0]);
    let upOk = true;
    if (upAxis !== bowAxis) { const uv = [0, 0, 0]; uv[upAxis] = upSign; upOk = vnear(G.mul3v(R, uv), [0, 1, 0]); } else if (warnings.includes('up_was_bow_axis')) warn++;
    n++; if (good && upOk) ok++;
  }
  assert(ok === n, `N3a ${ok} / ${n} kombinacji: obrót właściwy (det +1), dziób → −X, góra → +Y`);
  assert(warn === 12, `N3b góra na osi dziobu (model „pionowy" — 3 osie × 2 zwroty dziobu × 2 zwroty góry) — ostrzeżenie w raporcie, obrót dalej poprawny (${warn} / 12)`);
  assert(vnear(G.orientationFor({ bowAxis: 0, bowSign: -1 }).R.flat(), G.IDENTITY3.flat()), 'N3c model już dziobem w −X, górą w +Y — obrót tożsamościowy (plik bez obrotu)');
});

// ── N4 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('N4 dysza z przekroju rufy', () => {
  const pos = synthShip({ axis: 0, bowSign: -1, centre: [0, 0, 0], scale: 1 });
  const out = G.transformPositions(G.normalizationMatrix(G.bboxOf(pos), G.IDENTITY3), pos);
  const nz = G.measureNozzle(out);
  assert(near(nz.p[0], 0.5, 1e-9) && Math.abs(nz.p[1]) < 0.02 && Math.abs(nz.p[2]) < 0.02 && vnear(nz.d, [1, 0, 0]), `N4a dysza na końcu rufy w osi (${nz.p}), smuga +X`);
  assert(nz.r >= G.NOZZLE_R_RANGE[0] && nz.r <= G.NOZZLE_R_RANGE[1], `N4b promień w przedziale (${nz.r})`);
});

// ── N5 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('N5 hardpointy — scalanie zachowuje kliknięte punkty, wybór źródła, zapis i walidacja', () => {
  const measured = HPL.measuredHardpoints({ slot: 'warp_frigate', nozzle: { p: [0.5, 0, 0], d: [1, 0, 0], r: 0.05 }, keyMode: 'mask' });
  assert(SC.validateHardpoints({ ...measured, source: { ...measured.source, sha256: 'a'.repeat(64) } }).ok, 'N5a dokument z pomiaru poprawny (schemat v1)');
  // dokument z incoming/ w przestrzeni SUROWEGO pliku, którego dziób leży w +Z (model z Meshy obrócony): kliknięte światła i wieżyczki
  const incoming = { ...HP.defaultHardpoints('warp_frigate'), source: { file: 'incoming/warp_frigate.glb', sha256: 'b'.repeat(64), normalizer: null },
    frame: { bow: [0, 0, 1], up: [0, 1, 0] }, nozzles: [{ p: [0, 0.01, -0.5], d: [0, 0, -1], r: 0.033 }],
    weapons: [{ id: 'W1', p: [0.02, 0.06, 0.2], d: null }], lights: [{ p: [0.03, 0.02, 0.4], size: 0.01, colour: '#ff2020', gain: 4 }],
    keyColour: { ...SC.KEY_COLOUR_DEFAULTS, mode: 'mask', hue: 186, hueTol: 10 }, notes: 'klikane w Workshopie' };
  const input = { file: 'incoming/warp_frigate.glb', sha256: 'b'.repeat(64), verts: 9354, tris: 9882 };
  const pick = HPL.pickCarried({ incomingDoc: incoming, slotDoc: null, input });
  assert(pick.from === 'incoming', 'N5b incoming opisuje ten plik (sha256) — przeniesiony');
  const b = G.dominantAxis(incoming.frame.bow);
  const { R } = G.orientationFor({ bowAxis: b.axis, bowSign: b.sign });
  const rot = HPL.rotateHardpoints(incoming, R);
  assert(vnear(rot.frame.bow, [-1, 0, 0]) && vnear(rot.frame.up, [0, 1, 0]) && vnear(rot.nozzles[0].p, [0.5, 0.01, 0]) && vnear(rot.nozzles[0].d, [1, 0, 0]),
    `N5c obrót przenosi ramę i dyszę (dziób +Z → −X; dysza ${rot.nozzles[0].p})`);
  assert(vnear(rot.lights[0].p, G.mul3v(R, incoming.lights[0].p).map((x) => Math.round(x * 1000) / 1000 + 0)) && vnear(rot.weapons[0].p, [-0.2, 0.06, 0.02]),
    `N5d światło i wieżyczka obrócone razem z kadłubem (W1 → ${rot.weapons[0].p})`);
  const { doc: merged, kept } = HPL.mergeHardpoints(measured, rot);
  assert(kept.join() === HPL.CARRIED_FIELDS.join() && merged.lights.length === 1 && merged.lights[0].colour === '#ff2020' && merged.weapons[0].id === 'W1'
    && merged.keyColour.hue === 186 && merged.nozzles[0].r === 0.033, 'N5e SCALANIE: światło, wieżyczka, dysza i strojenie maski z incoming przeżywają (pomiar ich nie nadpisuje)');
  const withSrc = HPL.withSource(merged, { file: 'warp_frigate.glb', sha256: 'c'.repeat(64), input });
  assert(withSrc.source.normalizer === HPL.NORMALIZER_ID && withSrc.source.input.sha256 === input.sha256 && SC.validateHardpoints(withSrc).ok,
    'N5f źródło: nowy plik, normalizator, plik wejściowy — dokument poprawny');
  // ponowna normalizacja tego samego modelu: dokument slotu (z source.input) zachowany
  const again = HPL.pickCarried({ incomingDoc: null, slotDoc: withSrc, input });
  assert(again.from === 'slot', 'N5g ponowna normalizacja tego samego pliku — punkty slotu zachowane');
  const retextured = HPL.pickCarried({ incomingDoc: null, slotDoc: withSrc, input: { ...input, sha256: 'd'.repeat(64) } });
  assert(retextured.from === 'slot', 'N5h ten sam model z nową teksturą (ta sama liczba wierzchołków i trójkątów) — punkty zachowane');
  // KONTROLA: dokument STAREGO modelu slotu (pomiar CV-1a, bez source.input) NIE jest scalany na nowy kadłub
  const legacyDoc = { ...HP.defaultHardpoints('warp_frigate'), lights: [{ p: [0.1, 0, 0], size: 0.01 }], source: { file: 'warp_frigate.glb', sha256: 'e'.repeat(64), normalizer: null } };
  const fresh = HPL.pickCarried({ incomingDoc: null, slotDoc: legacyDoc, input });
  assert(fresh.from === null && fresh.doc === null, 'N5i nie-jałowość: punkty starego modelu slotu NIE trafiają na nowy model (pomiar od nowa)');
  const stale = HPL.pickCarried({ incomingDoc: { ...incoming, source: { ...incoming.source, sha256: 'f'.repeat(64) } }, slotDoc: null, input });
  assert(stale.from === null, 'N5j hardpointy incoming innego pliku (inny sha256) — pomiar od nowa, nie przeniesienie');
  const txt = HPL.formatHardpointsJson({ ...withSrc, source: { ...withSrc.source, input: { ...withSrc.source.input, rotation: R } } });
  const back = JSON.parse(txt);
  assert(JSON.stringify(back.frame) === JSON.stringify(withSrc.frame) && JSON.stringify(back.source.input.rotation) === JSON.stringify(R) && txt.endsWith('\n') && !txt.includes('\r'),
    'N5k zapis JSON wraca do tego samego dokumentu (wektory i macierz w jednej linii, LF)');
  assert(SC.validateHardpoints(back).ok && !SC.validateHardpoints({ ...back, source: { ...back.source, input: { file: 'x.txt', sha256: 'zz' } } }).ok,
    'N5l `source.input` poprawny przechodzi walidację, zepsuty (plik nie .glb, zły sha256) — odrzucony');
  assert(JSON.stringify(HPL.removeFromIndex({ slots: ['a', 'warp_frigate', 'b'], notes: 'n' }, 'warp_frigate')) === JSON.stringify({ slots: ['a', 'b'], notes: 'n' }), 'N5m podmiana slotu zdejmuje wpis z indeksu incoming');
});

// ── N6 / N7 ────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('N6 rasteryzacja UV, N7 statystyki tekstury (maska gry, jasność)', () => {
  const W = 64, H = 64;
  const half = UV.rasterizeUvCoverage([0, 0, 1, 0, 0, 1], null, W, H);
  const c = UV.coveredCount(half);
  assert(c > 0.45 * W * H && c < 0.55 * W * H, `N6a trójkąt na pół tekstury pokrywa ≈ 50 % (${(100 * c / (W * H)).toFixed(1)} %)`);
  const wrap = UV.rasterizeUvCoverage([1.0, 0, 1.25, 0, 1.0, 0.25], null, W, H), wrapRef = UV.rasterizeUvCoverage([0, 0, 0.25, 0, 0, 0.25], null, W, H);
  assert(UV.coveredCount(wrap) === UV.coveredCount(wrapRef) && UV.coveredCount(wrap) > 0, 'N6b UV poza [0; 1] zawijane jak próbnik REPEAT');
  assert(UV.coveredCount(UV.rasterizeUvCoverage([0.2, 0.2, 0.4, 0.4, 0.6, 0.6], null, W, H)) === 0, 'N6c trójkąt zdegenerowany w UV — nic nie pokrywa');
  // tekstura 4×1: cyjan klucza, niebieski panel 210°, szary, cyjan POZA obszarem UV
  const px = new Uint8Array([20, 235, 235, 70, 120, 200, 128, 128, 128, 20, 235, 235]);
  const cov = new Uint8Array([1, 1, 1, 0]);
  const kc = { ...SC.KEY_COLOUR_DEFAULTS, mode: 'mask' };
  const ks = TS.keyColourStats(px, 3, cov, kc);
  assert(ks.covered === 3 && ks.litTexels === 1 && near(ks.pctOfCovered, 100 / 3, 1e-9), `N7a cyjan klucza liczony, panel 210° nie, teksel poza UV pominięty (${ks.pctOfCovered.toFixed(2)} % obszaru)`);
  const hl = TS.hullLuma(new Uint8Array([10, 10, 10, 200, 200, 200]), 3, new Uint8Array([1, 1]));
  assert(near(hl.nearBlackPct, 50) && hl.meanLuma > 100 && hl.meanLuma < 110, `N7b jasność kadłuba: prawie czarne 50 %, średnia ${hl.meanLuma.toFixed(1)}`);
});

// ── N8 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('N8 werdykty raportu wobec standardu F10', () => {
  const base = { meshes: 1, primitives: 1, materials: 1, tris: 9882, textures: { baseColor: 1, normal: 1, metallicRoughness: 1 }, hull: { meanLuma: 140, darkPct: 5 }, cyan: { pctOfCovered: 0.557 }, bow: { confident: true, source: 'x' } };
  const marks = (f) => Object.fromEntries(RP.verdicts(f).map((v) => [v.text.split(/[ :(]/)[0], v.mark]));
  const ok = RP.verdicts(base);
  assert(ok.filter((v) => v.mark === '✔').length === 6 && ok.filter((v) => v.mark === '☐').length === 2 && !ok.some((v) => v.mark === '⚠'), 'N8a model zgodny: 6 × ✔, 2 × ☐ (napisy, dysza — niemierzalne), bez ⚠');
  assert(RP.verdicts({ ...base, tris: 29238 }).some((v) => v.mark === '⚠' && /trójkąty/.test(v.text)), 'N8b trójkąty > 15 tys. — ⚠ (tylko ostrzeżenie, D-CV-14 (a))');
  assert(RP.verdicts({ ...base, hull: { meanLuma: 83, darkPct: 48.5 } }).some((v) => v.mark === '⚠' && /ciemny/.test(v.text)), 'N8c kadłub ciemny — ⚠');
  assert(marks({ ...base, cyan: { pctOfCovered: 0 } }).brak === 'ℹ' && RP.verdicts({ ...base, cyan: { pctOfCovered: 12 } }).some((v) => v.mark === '⚠' && /cyjan/.test(v.text)), 'N8d cyjan: brak — ℹ, dużo — ⚠');
  assert(RP.verdicts({ ...base, bow: { confident: false, source: 'x' } }).some((v) => v.mark === '⚠' && /NIEPEWNIE/.test(v.text)), 'N8e niepewny dziób — ⚠ (sprawdź w grze)');
  assert(!RP.verdicts(base).some((v) => v.mark === '✔' && /(napis|logo|dysz)/i.test(v.text)), 'N8f napisy / logo i liczba dysz NIGDY jako ✔ (program tego nie mierzy)');
  const txt = RP.formatReport({ slot: 'warp_frigate', when: 't', input: { file: 'incoming/warp_frigate.glb', bytes: 10e6 }, tris: 9882, verts: 9354, vertsWelded: 9354, meshes: 1, primitives: 1, materials: 1,
    rawExtent: [1.9, 0.3, 0.3], longestAxis: 'X', bow: { side: '−X', source: 's', confident: true }, nozzle: { p: [0.5, 0, 0], r: 0.046 }, uvCoveragePct: 52, cyan: { pctOfCovered: 0.557, pctOfTexture: 0.289 },
    hull: { meanLuma: 140, darkPct: 5 }, textures: {}, sizes: { before: 10e6, out2k: 6.5e6, out1k: 1.9e6 }, hardpoints: { path: 'p', from: 'incoming', why: 'w', kept: ['frame'] }, written: [], archived: [] });
  assert(/GEOMETRIA/.test(txt) && /TEKSTURY/.test(txt) && /STANDARD MODELU/.test(txt) && /HARDPOINTY/.test(txt) && /cvBattle\(\{warp: 1\}\)/.test(txt) && /0,557/.test(txt), 'N8g raport po polsku: sekcje, przecinek dziesiętny, linia cvBattle bez cudzysłowów dla okrętu warp');
});

// ── N9 / N10 ───────────────────────────────────────────────────────────────────────────────────────────────────────
await block('N9 plan tekstur (kolor bazowy nigdy stratnie), N10 nazwy slotów', () => {
  const keep = TX.planTexture({ role: 'baseColor', mime: 'image/jpeg', width: 2048, height: 2048 }, '2k');
  assert(keep.action === 'keep' && keep.enc === null, 'N9a kolor bazowy JPEG 2K — bajty bez zmian (bez ponownego 4:2:0)');
  const big = TX.planTexture({ role: 'baseColor', mime: 'image/jpeg', width: 4096, height: 4096 }, '2k');
  assert(big.action === 'encode' && big.resize === 2048 && big.enc.lossless === true, 'N9b kolor bazowy 4K → 2K bezstratnie');
  const k1 = TX.planTexture({ role: 'baseColor', mime: 'image/jpeg', width: 2048, height: 2048 }, '1k');
  assert(k1.resize === 1024 && k1.enc.lossless === true, 'N9c wariant 1K koloru bazowego — bezstratnie');
  const png = TX.planTexture({ role: 'baseColor', mime: 'image/png', width: 1024, height: 1024 }, 'legacy');
  assert(png.action === 'encode' && png.enc.lossless && png.keepIfNotSmaller && TX.acceptEncoded(png, 100, 120) === false && TX.acceptEncoded(png, 100, 80) === true, 'N9d PNG bazowy → bezstratny WebP tylko, gdy mniejszy');
  let lossyBase = false;
  for (const target of ['2k', '1k', 'legacy']) for (const mime of ['image/jpeg', 'image/png', 'image/webp']) for (const w of [512, 1024, 2048, 4096]) {
    const p = TX.planTexture({ role: 'baseColor', mime, width: w, height: w }, target);
    if (p.action === 'encode' && !p.enc.lossless) lossyBase = true;
  }
  assert(!lossyBase, 'N9e ŻADNA ścieżka koloru bazowego nie jest stratna (cienki cyjan klucza — D-CV-15)');
  const n2 = TX.planTexture({ role: 'normal', mime: 'image/png', width: 2048, height: 2048 }, '2k'), nl = TX.planTexture({ role: 'normal', mime: 'image/png', width: 1024, height: 1024 }, 'legacy');
  assert(n2.action === 'encode' && n2.enc.format === 'webp' && nl.enc.format === 'webp' && nl.resize === null && nl.keepIfNotSmaller, 'N9f mapy normalnych → WebP (master 2K, stare modele bez zmiany rozmiaru, tylko gdy mniejsze)');
  assert(TX.planTexture({ role: 'metallicRoughness', mime: 'image/jpeg', width: 1024, height: 1024 }, 'legacy').action === 'keep', 'N9g stare modele: metal / szorstkość bez zmian');
  assert(SL.slotFromFileName('C:\\Users\\x\\Downloads\\Warp_Frigate (1).glb') === 'warp_frigate' && SL.slotFromFileName('nonwarp-battleship.GLB') === 'nonwarp_battleship'
    && SL.slotFromFileName('my ship.glb') === null && SL.SHIP_SLOTS.length === 25, 'N10a slot z nazwy pliku (kopia z Pobranych, myślniki, wielkie litery); obca nazwa → pytanie');
  assert(SL.suggestSlots('frigate_v2').includes('warp_frigate') && SL.suggestSlots('frigate_v2').includes('nonwarp_frigate'), 'N10b podpowiedź slotów dla nazwy „frigate_v2"');
});

// ── N11 — round-trip na prawdziwych plikach ────────────────────────────────────────────────────────────────────────
function parseGlb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('to nie GLB');
  const total = dv.getUint32(8, true);
  let off = 12, json = null, bin = null;
  while (off < total) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true), data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(data)); else if (type === 0x004e4942) bin = data;
    off += 8 + len;
  }
  return { version: dv.getUint32(4, true), json, bin };
}
function accessorArray(glb, idx) {
  const a = glb.json.accessors[idx], bv = glb.json.bufferViews[a.bufferView];
  const T = { 5126: [Float32Array, 'getFloat32'], 5123: [Uint16Array, 'getUint16'], 5125: [Uint32Array, 'getUint32'], 5121: [Uint8Array, 'getUint8'] }[a.componentType];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const stride = bv.byteStride || T[0].BYTES_PER_ELEMENT * n, base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const dv = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength), out = new T[0](a.count * n);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = dv[T[1]](base + i * stride + k * T[0].BYTES_PER_ELEMENT, true);
  return out;
}
const imageMime = (glb, i) => glb.json.images[i].mimeType;
const FORBIDDEN = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_meshopt_compression', 'KHR_texture_basisu'];

await block('N11 round-trip: sześć modeli właściciela w slotach + rig gry na ich geometrii; stare modele — geometria nietknięta', () => {
  const NEW6 = ['nonwarp_frigate', 'warp_frigate', 'nonwarp_destroyer', 'warp_destroyer', 'nonwarp_battleship', 'warp_battleship'];
  const EXH = { gradient: exhaustGradientColors({ isEnemy: false }), hdr: 4.5 };
  const L = 0.016;
  const bad = [], rigBad = [], kBad = [], nozBad = [];
  let nozMeasured = 0, nozClicked = 0, nozCtl = null;
  // dysza ustawiona w Workshopie: w prostopadłościanie modelu (|c| ≤ 0,5) i po stronie przeciwnej do dziobu (rufowa połowa)
  const workshopNozzleOk = (hp) => { const p = hp.nozzles[0].p, b = hp.frame.bow;
    return p.every((c) => Math.abs(c) <= 0.5 + 1e-9) && -(p[0] * b[0] + p[1] * b[1] + p[2] * b[2]) > 0; };
  for (const slot of NEW6) {
    const buf = readFileSync(new URL(`assets/models/ships/${slot}.glb`, ROOT));
    const hp = JSON.parse(read(`assets/models/ships/hardpoints/${slot}.json`));
    const glb = parseGlb(buf), j = glb.json;
    const why = [];
    if (sha256(buf) !== hp.source.sha256) why.push('sha256');
    if (hp.source.normalizer !== HPL.NORMALIZER_ID || hp.source.input?.file !== `incoming/${slot}.glb` || !SC.validateHardpoints(hp).ok) why.push('źródło');
    const used = j.extensionsUsed ?? [];
    if (used.some((e) => e !== 'EXT_texture_webp') || FORBIDDEN.some((e) => JSON.stringify(j).includes(e))) why.push('rozszerzenia');
    const mimes = j.images.map((im, i) => imageMime(glb, i));
    if (mimes.some((m) => !['image/jpeg', 'image/png', 'image/webp'].includes(m)) || (mimes.includes('image/webp') && !used.includes('EXT_texture_webp'))) why.push('obrazy');
    const mat = j.materials[0], baseImg = j.textures[mat.pbrMetallicRoughness.baseColorTexture.index].source;
    if (imageMime(glb, baseImg) !== 'image/jpeg') why.push('kolor bazowy nie JPEG (miał zostać bajt w bajt)');
    if (j.nodes.some((n) => n.matrix || n.translation || n.rotation || n.scale)) why.push('transformacja węzła');
    const prim = j.meshes[0].primitives[0], acc = j.accessors[prim.attributes.POSITION];
    const c = acc.min.map((v, k) => (v + acc.max[k]) / 2), e = acc.max.map((v, k) => v - acc.min[k]);
    if (c.some((x) => Math.abs(x) > 1e-4) || Math.abs(e[0] - 1) > 1e-4 || e[1] >= 1 || e[2] >= 1) why.push('geometria nie znormalizowana');
    // wariant 1K: ta sama geometria
    const k1 = new URL(`assets/models/ships/${slot}@1k.glb`, ROOT);
    if (!existsSync(k1)) kBad.push(slot + ' (brak pliku)');
    else {
      const k = parseGlb(readFileSync(k1));
      const ka = k.json.accessors[k.json.meshes[0].primitives[0].attributes.POSITION];
      if (JSON.stringify(ka.min) !== JSON.stringify(acc.min) || JSON.stringify(ka.max) !== JSON.stringify(acc.max) || (k.json.extensionsUsed ?? []).some((x) => x !== 'EXT_texture_webp')) kBad.push(slot);
    }
    if (why.length) bad.push(`${slot}: ${why.join(', ')}`);
    // PRAWDZIWY rig gry na tej geometrii z tymi hardpointami (three r171)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(accessorArray(glb, prim.attributes.POSITION)), 3));
    geo.setIndex(new THREE.BufferAttribute(accessorArray(glb, prim.indices), 1));
    const tpl = new THREE.Group(); tpl.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial()));
    const rig = RIG.buildShipRig({ THREE, template: tpl, hardpoints: hp, targetSize: L, kind: 'own', exhaust: EXH });
    rig.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.model), sz = box.getSize(new THREE.Vector3());
    const q = rig.canon.getWorldQuaternion(new THREE.Quaternion());
    const bow = new THREE.Vector3(...hp.frame.bow).applyQuaternion(q);
    const apex = rig.exhaust ? rig.exhaust.getWorldPosition(new THREE.Vector3()) : null;
    const ok = Math.abs(Math.max(sz.x, sz.y, sz.z) - L) < 1e-6 && Math.abs(sz.z - L) < 1e-6 && bow.z > 0.999 && apex && apex.z / L < -0.45;
    if (!ok) rigBad.push(`${slot} (rozmiar ${sz.z.toFixed(4)}, dziób z ${bow.z.toFixed(3)}, smuga ${apex ? (apex.z / L).toFixed(3) : '—'})`);
    // dysza z pliku = dysza zmierzona na geometrii slotu (pomiar CV-1a przeniesiony bez przesunięcia). ⚠ PRZECELOWANE ŚWIADOMIE
    // po łącznej kontroli właściciela CV-1b + CV-1c (2026-11-11): dyszę może teraz ustawić właściciel w Workshopie (dopisek
    // „Model Workshop <data>:” w notes) — wtedy równość z pomiarem nie obowiązuje; dysza ma leżeć w prostopadłościanie modelu
    // w rufowej połowie. Pozostałe sloty — równość jak dotąd (świadek: co najmniej jeden slot sprawdzony równością).
    const pos = accessorArray(glb, prim.attributes.POSITION), nz = G.measureNozzle(pos);
    const clicked = /Model Workshop \d{4}-\d{2}-\d{2}:/.test(hp.notes ?? '');
    if (clicked) {
      if (!workshopNozzleOk(hp)) nozBad.push(`${slot} (Workshop): dysza poza rufową połową modelu ${hp.nozzles[0].p}`);
      if (!nozCtl) nozCtl = hp;
      nozClicked++;
    } else {
      nozMeasured++;
      if (!vnear(nz.p, hp.nozzles[0].p, 1e-9)) nozBad.push(`${slot}: ${nz.p} ≠ ${hp.nozzles[0].p}`);
    }
  }
  assert(bad.length === 0, `N11a sześć slotów: sha256 = hardpointy, źródło zapisane, tylko EXT_texture_webp (bez Draco / meshopt / KTX2), obrazy dekodowalne, kolor bazowy JPEG, węzeł bez transformacji, geometria wyśrodkowana o długości 1,0 wzdłuż X (złe: ${bad.join('; ') || '—'})`);
  assert(kBad.length === 0, `N11b wariant @1k: ta sama geometria, te same dozwolone rozszerzenia (złe: ${kBad.join(', ') || '—'})`);
  // N11c — KONTROLA zielona po obu stronach (rig normalizuje każdą geometrię): dane slotu i hardpointy działają w ścieżce gry.
  assert(rigBad.length === 0, `N11c rig gry (buildShipRig, three r171) na geometrii slotu: model znormalizowany do klasy, dziób z pliku → +Z ramy kanonicznej, smuga za rufą (złe: ${rigBad.join('; ') || '—'})`);
  // KONTROLA PINU: ta sama dysza z Workshopu przeniesiona na DZIÓB albo poza model musi zostać odrzucona
  const nozFlip = nozCtl && workshopNozzleOk({ ...nozCtl, nozzles: [{ ...nozCtl.nozzles[0], p: nozCtl.nozzles[0].p.map((c) => -c) }] });
  const nozOut = nozCtl && workshopNozzleOk({ ...nozCtl, nozzles: [{ ...nozCtl.nozzles[0], p: [0.8, 0, 0] }] });
  assert(nozCtl == null || (nozFlip === false && nozOut === false), `N11f-ctl KONTROLA PINU: dysza z Workshopu odbita na dziób albo poza model — odrzucona (${nozCtl ? 'sprawdzone na ' + nozCtl.slot : 'brak slotu z Workshopu'})`);
  assert(nozBad.length === 0 && nozMeasured >= 1, `N11f dysza zmierzona WPROST na geometrii pliku = dysza z hardpointów (geometria w przestrzeni znormalizowanej, punkt przeniesiony bez przesunięcia) — ${nozMeasured} slotów równością, ${nozClicked} z dyszą z Workshopu w rufowej połowie (złe: ${nozBad.join('; ') || '—'})`);
  // stare modele po przebiegu tekstur: dysza zmierzona na geometrii = dysza z pliku pomiaru CV-1a ⇒ geometria nietknięta
  const docs = readdirSync(new URL('assets/models/ships/hardpoints/', ROOT)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(read('assets/models/ships/hardpoints/' + f)));
  const legacy = docs.filter((d) => d.source.normalizer !== HPL.NORMALIZER_ID);
  const moved = [];
  let passed = 0;
  for (const d of legacy) {
    const glb = parseGlb(readFileSync(new URL('assets/models/ships/' + d.source.file, ROOT)));
    const j = glb.json;
    if ((j.extensionsUsed ?? []).some((e) => e !== 'EXT_texture_webp') || FORBIDDEN.some((e) => JSON.stringify(j).includes(e))) { moved.push(d.slot + ' (rozszerzenia)'); continue; }
    if (j.images.some((im) => im.mimeType === 'image/webp') && !(j.extensionsUsed ?? []).includes('EXT_texture_webp')) { moved.push(d.slot + ' (WebP bez deklaracji)'); continue; }
    const pos = accessorArray(glb, j.meshes[0].primitives[0].attributes.POSITION), bb = G.bboxOf(pos);
    const sign = d.frame.bow[0] < 0 ? -1 : 1, { R } = G.orientationFor({ bowAxis: 0, bowSign: sign });
    const out = G.transformPositions(G.normalizationMatrix(bb, R), pos), nz = G.measureNozzle(out);
    const RT = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
    const raw = G.mul3v(RT, nz.p).map((x) => Math.round(x * 1000) / 1000 + 0);
    if (!vnear(raw, d.nozzles[0].p, 1e-9)) moved.push(`${d.slot} (${raw} ≠ ${d.nozzles[0].p})`); else passed++;
  }
  assert(legacy.length >= 21 && moved.length === 0 && legacy.every((d) => d.source.normalizer === null || d.source.normalizer === HPL.LEGACY_PASS_ID),
    `N11d ${passed} / ${legacy.length} starych modeli: geometria nietknięta przez przebieg tekstur (dysza zmierzona = pomiar CV-1a), loader bez dekoderów, znacznik ${HPL.LEGACY_PASS_ID} albo null (złe: ${moved.join(', ') || '—'})`);
  const idx = JSON.parse(read('assets/models/ships/hardpoints/incoming/index.json'));
  assert(NEW6.every((s) => !idx.slots.includes(s) && !existsSync(new URL(`assets/models/ships/hardpoints/incoming/${s}.json`, ROOT))),
    'N11e podmiana slotu zdjęła wpisy z indeksu incoming i pliki hardpoints/incoming/<slot>.json (cvIncoming nie podmienia już tych slotów)');
});

// ── N12 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('N12 źródło narzędzia: bez Math.random, czysty potok deterministyczny', () => {
  const files = ['tools/ship-models/normalize-ship.mjs', ...readdirSync(new URL('tools/ship-models/lib/', ROOT)).map((f) => 'tools/ship-models/lib/' + f)];
  assert(files.length >= 8 && files.every((f) => !/Math\.random/.test(strip(read(f)))), `N12a zero Math.random w ${files.length} plikach narzędzia`);
  const run = () => {
    const pos = synthShip({ axis: 2, bowSign: 1, centre: [1, 2, 3], scale: 4 });
    const bb = G.bboxOf(pos), g = G.guessBow(pos, 2, { bb }), { R } = G.orientationFor({ bowAxis: 2, bowSign: g.sign });
    const out = G.transformPositions(G.normalizationMatrix(bb, R), pos);
    return JSON.stringify(HPL.measuredHardpoints({ slot: 'warp_frigate', nozzle: G.measureNozzle(out) })) + Array.from(out.slice(0, 30)).join();
  };
  assert(run() === run(), 'N12b dwa przebiegi czystego potoku na tej samej siatce — identyczny wynik');
  const cli = strip(read('tools/ship-models/normalize-ship.mjs'));
  assert(/validateHardpoints\(hp\)/.test(cli) && cli.indexOf('validateHardpoints(hp)') < cli.indexOf('fs.writeFileSync(slotGlb'), 'N12c CLI waliduje hardpointy PRZED zapisem slotu (niepoprawny dokument = nic nie zapisane)');
  assert(/archiveFile\(slotGlb/.test(cli) && cli.indexOf('archiveFile(slotGlb') < cli.indexOf('fs.writeFileSync(slotGlb'), 'N12d stary slot trafia do archiwum, zanim zostanie nadpisany');
});

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
