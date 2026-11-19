// colony_sphere_shader_smoke — keeper kroku CS-6a (ARC COLONY SPHERE; plan §3.6): wspólny shader powierzchni.
//
// Krok WIZUALNY (protokół lekki): piny tylko na LOGIKĘ — palety i ich zmienność, determinizm, kształt uniformów,
// cykl życia tekstury, okablowanie flagi. Żadnych pinów na stałe rysowania (barwy, siła reliefu — stroi właściciel).
// Kompilację GLSL sprawdza sonda w prawdziwej przeglądarce: `node src/testing/headless/probe-cs6a-shader.mjs --compile`.
//
//   node src/testing/smoke/colony_sphere_shader_smoke.mjs

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
let pass = 0, fail = 0;
function assert(c, msg) { if (c) { pass++; console.log('  ✅ ' + msg); } else { fail++; console.log('  ❌ ' + msg); } }
const read = (rel) => { try { return readFileSync(path.join(REPO, rel), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const imp = async (rel) => { try { return await import('../../../' + rel); } catch (e) { console.log('  (import ' + rel + ': ' + (e?.message ?? e) + ')'); return {}; } };

const { BODY_ARCHETYPES = [] } = await imp('src/data/BodyArchetypes.js');
const P = await imp('src/data/BodyPalettes.js');
const L = await imp('src/utils/SurfacePaletteLogic.js');
const S = await imp('src/renderer/SurfaceShader.js');
const SF = await imp('src/utils/SurfaceField.js');
const LD = await imp('src/renderer/LogDepthChunks.js');

const surfaceRows = BODY_ARCHETYPES.filter(a => a.family !== 'gas');
const body = (id, seed, extra = {}) => {
  const fam = BODY_ARCHETYPES.find(a => a.id === id)?.family ?? 'planet';
  return { id: id + seed, type: fam, bodyArchetype: id, surfaceSeed: seed >>> 0, waterCoverage: id === 'terran' ? 0.7 : null, ...extra };
};
const seeds = Array.from({ length: 40 }, (_, i) => (Math.imul(i + 1, 0x9E3779B1) ^ 0x5bd1e995) >>> 0);

console.log('\n── S1: tabela palet ──');
{
  const rows = P.BODY_PALETTES ?? {};
  assert(surfaceRows.length >= 18, `świadek: ${surfaceRows.length} archetypów powierzchni w BODY_ARCHETYPES`);
  const missing = surfaceRows.filter(a => !rows[a.id]).map(a => a.id);
  assert(surfaceRows.length > 0 && missing.length === 0, `każdy archetyp powierzchni ma wiersz palety${missing.length ? ' — brak: ' + missing.join(', ') : ''}`);
  const bad = [], few = [];
  for (const [id, row] of Object.entries(rows)) {
    const slots = P.SURFACE_LOOK_SLOTS?.[row.look]?.length ?? -1;
    const sets = row.variantsByPalette ? Object.entries(row.variantsByPalette) : [['', row.variants ?? []]];
    for (const [key, vs] of sets) {
      if (vs.length < 4) few.push(id + (key ? '/' + key : '') + '=' + vs.length);
      for (const v of vs) if (v.colors.length !== slots || !v.colors.every(c => /^#[0-9a-f]{6}$/i.test(c))) bad.push(id + ':' + v.id);
    }
    if (!(row.look in (P.SURFACE_LOOKS ?? {}))) bad.push(id + ':look');
  }
  assert(Object.keys(rows).length > 0 && bad.length === 0, `każdy wariant ma komplet barw swojego wyglądu (#rrggbb)${bad.length ? ' — ' + bad.join(', ') : ''}`);
  assert(Object.keys(rows).length > 0 && few.length === 0, `każdy archetyp (i typ planetoidy) ma ≥ 4 warianty palety${few.length ? ' — ' + few.join(', ') : ''}`);
  assert(Object.values(P.SURFACE_LOOK_SLOTS ?? { x: new Array(99) }).every(s => s.length <= (P.SURFACE_PALETTE_SLOTS ?? 0)), 'żaden wygląd nie potrzebuje więcej slotów niż ma shader');
}

console.log('\n── S2: determinizm ──');
{
  const a = L.resolveSurfaceLook?.(body('desert', 777), 'K'), b = L.resolveSurfaceLook?.(body('desert', 777), 'K');
  assert(!!a && !!b && a.variantA === b.variantA && a.colors.every((c, i) => c === b.colors[i]), 'to samo ciało i gwiazda → identyczna paleta');
  assert(!!a && L.paletteDistance?.(a, b) === 0, 'świadek miary: identyczne palety mają odległość 0');
  const srcs = ['src/data/BodyPalettes.js', 'src/utils/SurfacePaletteLogic.js', 'src/renderer/SurfaceShader.js'].map(f => strip(read(f)));
  assert(srcs.every(s => s.length > 500) && srcs.every(s => !/Math\.random/.test(s)), 'palety, logika i shader nie używają Math.random');
  assert(!!a && a.colors instanceof Float32Array && a.colors.length === 24 && a.colors.every(c => c >= 0 && c <= 1), 'paleta = 8 barw liniowego RGB w [0, 1]');
}

console.log('\n── S3: „żadne dwa ciała takie same" ──');
{
  const rows = [];
  for (const a of surfaceRows) {
    const types = a.id === 'planetoid' ? ['metallic', 'carbonaceous', 'silicate'] : [null];
    for (const pt of types) {
      const looks = seeds.map(s => L.resolveSurfaceLook?.(body(a.id, s, pt ? { planetoidType: pt } : {}), 'G'));
      if (looks.some(l => !l)) { rows.push({ id: a.id, min: -1, med: -1 }); continue; }
      const d = [];
      for (let i = 0; i < looks.length; i++) for (let j = i + 1; j < looks.length; j++) d.push(L.paletteDistance(looks[i], looks[j]));
      d.sort((x, y) => x - y);
      rows.push({ id: a.id + (pt ? '/' + pt : ''), min: d[0], med: d[d.length >> 1], variants: new Set(looks.map(l => l.variantA)).size });
    }
  }
  const dup = rows.filter(r => !(r.min > 0.002));
  assert(rows.length >= 18 && dup.length === 0, `40 ziaren × każdy archetyp: żadna para palet nie jest (prawie) identyczna${dup.length ? ' — ' + dup.map(r => r.id + ' ' + r.min.toFixed(4)).join(', ') : ''}`);
  const flat = rows.filter(r => !(r.med > 0.03));
  assert(rows.length >= 18 && flat.length === 0, `mediana odległości palet w archetypie jest wyraźna (> 0.03)${flat.length ? ' — ' + flat.map(r => r.id + ' ' + r.med.toFixed(3)).join(', ') : ''}`);
  const mono = rows.filter(r => !(r.variants >= 3));
  assert(rows.length >= 18 && mono.length === 0, `40 ziaren trafia w ≥ 3 różne warianty bazowe każdego archetypu${mono.length ? ' — ' + mono.map(r => r.id).join(', ') : ''}`);
  const met = L.resolveSurfaceLook?.(body('planetoid', 5, { planetoidType: 'metallic' }), 'G'), car = L.resolveSurfaceLook?.(body('planetoid', 5, { planetoidType: 'carbonaceous' }), 'G');
  assert(!!met && !!car && L.paletteDistance(met, car) > 0.02, 'planetoida: typ (metallic / carbonaceous) zmienia paletę przy tym samym ziarnie');
}

console.log('\n── S4: klasa gwiazdy ──');
{
  const warmth = (l) => { let r = 0, b = 0; for (let s = 0; s < 3; s++) { r += l.colors[s * 3]; b += l.colors[s * 3 + 2]; } return r / (b || 1e-9); };
  const ok = ['desert', 'barren', 'ice'].every(id => {
    const m = L.resolveSurfaceLook?.(body(id, 4242), 'M'), g = L.resolveSurfaceLook?.(body(id, 4242), 'G'), f = L.resolveSurfaceLook?.(body(id, 4242), 'F');
    return m && g && f && m.variantA === g.variantA && warmth(m) > warmth(g) && warmth(g) > warmth(f);
  });
  assert(ok, 'to samo ciało: albedo cieplejsze przy M niż G, chłodniejsze przy F (wariant bazowy bez wag gwiazdy ten sam)');
  const sM = S.surfaceSunColor?.(1, 0.147, 0.063, Math.PI) ?? [0, 0, 0], sW = S.surfaceSunColor?.(1, 1, 1, Math.PI) ?? [0, 0, 0];
  assert(sM[0] > sM[1] && sM[1] > sM[2] && sM[1] / sM[0] > 0.5, `światło gwiazdy M: ciepłe, ale nie monochromatyczne (g/r = ${(sM[1] / sM[0]).toFixed(2)})`);
  assert(Math.abs(sW[0] - 1) < 1e-9 && Math.abs(sW[1] - 1) < 1e-9 && Math.abs(sW[2] - 1) < 1e-9, 'białe światło o intensywności π → (1, 1, 1) (skala Lamberta jak MeshStandardMaterial)');
  const counts = (cls) => { let n = 0; for (const s of seeds) if (L.resolveSurfaceLook?.(body('terran', s), cls)?.variantA === 'crimson') n++; return n; };
  assert(counts('M') > counts('F'), `wagi wariantów: czerwona roślinność częstsza przy M (${counts('M')}/40) niż przy F (${counts('F')}/40)`);
}

console.log('\n── S5: ciała bez wyglądu ──');
{
  assert(!!L.resolveSurfaceLook?.(body('terran', 9), 'G'), 'świadek: terran z ziarnem ma wygląd');
  assert(L.resolveSurfaceLook?.({ type: 'planet', bodyArchetype: 'gas_warm', surfaceSeed: 9 }, 'G') === null, 'gazowiec → null (GasGiantShader zostaje, D-CS-5)');
  assert(L.resolveSurfaceLook?.({ type: 'planet', bodyArchetype: 'terran' }, 'G') === null, 'brak surfaceSeed → null (stara ścieżka)');
  assert(L.resolveSurfaceLook?.({ type: 'planet', bodyArchetype: 'toxic', surfaceSeed: 9 }, 'G') === null, 'nieznany archetyp → null');
  assert(L.resolveSurfaceLook?.({ type: 'star', bodyArchetype: 'terran', surfaceSeed: 9 }, 'G') === null, 'nie-ciało (gwiazda) → null');
  const t = body('terran', 31337);
  const arch = BODY_ARCHETYPES.find(a => a.id === 'terran');
  assert(L.surfaceSeaLevelOf?.(t) === SF.seaLevelOf?.(t.surfaceSeed, arch, { waterCoverage: 0.7, palette: null }) && L.surfaceSeaLevelOf?.(t) > 0, 'poziom morza shadera = poziom morza SurfaceField (jeden kanon)');
  assert(L.surfaceSeaLevelOf?.(body('barren', 5)) === -1, 'ciało bez morza → −1');
}

console.log('\n── S6: teksty GLSL ──');
{
  const frag = S.SURFACE_FRAG ?? '', vert = S.SURFACE_VERT ?? '';
  assert(frag.length > 4000 && !frag.includes('`') && !vert.includes('`'), 'GLSL bez odwrotnych apostrofów');
  const raw = read('src/renderer/SurfaceShader.js');
  const lit = raw.slice(raw.indexOf('export const SURFACE_VERT'), raw.indexOf('export const SURFACE_VERT_LOGDEPTH'));
  assert(lit.length > 4000 && !lit.includes('${'), 'literały GLSL bez interpolacji ${…} (wartości per ciało tylko przez uniformy)');
  const looks = Object.values(P.SURFACE_LOOKS ?? {});
  const branches = [...frag.matchAll(/uLook == (\d+)/g)].map(m => +m[1]);
  assert(looks.length === 10 && looks.every(v => v === looks.length - 1 || branches.includes(v)), `każdy wygląd ma gałąź w shaderze (${branches.length} + else)`);
  assert(/uniform sampler2D uCityLights/.test(frag) && /uCityGain/.test(frag), 'slot świateł miast (uCityLights) jest w shaderze (CS-9)');
  assert(/textureLod\(uMap/.test(frag) && !/texture2D\(uMap|texture\(uMap/.test(frag), 'mapa próbkowana tylko z jawnym LOD (bez szwu na południku)');
  assert(!/varying vec2 vUv|\buv\b\s*;/.test(vert), 'mapowanie z kierunku w przestrzeni obiektu, nie z UV siatki');
  assert(LD.hasLogDepth?.(S.SURFACE_FRAG_LOGDEPTH) && LD.hasLogDepth?.(S.SURFACE_VERT_LOGDEPTH) && !LD.hasLogDepth?.(frag), 'wariant log depth ma chunki, wariant bazowy nie');
  assert(LD.stripLogDepth?.(S.SURFACE_FRAG_LOGDEPTH) === frag && LD.stripLogDepth?.(S.SURFACE_VERT_LOGDEPTH) === vert, 'wariant log depth = derywacja bazowego (round-trip co do bajtu)');
  assert(/#include <tonemapping_fragment>/.test(frag) && /#include <colorspace_fragment>/.test(frag), 'wyjście przez tone mapping i przestrzeń barw renderera');
}

console.log('\n── S7: uniformy i cykl życia tekstury (atrapa THREE) ──');
{
  let live = 0;
  class DataTexture { constructor(data, w, h) { this.image = { data, width: w, height: h }; live++; } dispose() { live--; this.disposed = true; } }
  class ShaderMaterial {
    constructor(o) { Object.assign(this, o); this.userData = {}; this._l = []; }
    addEventListener(t, f) { if (t === 'dispose') this._l.push(f); }
    dispose() { for (const f of this._l) f(); }
  }
  const T = { DataTexture, ShaderMaterial, RGBAFormat: 1, UnsignedByteType: 2, RepeatWrapping: 3, ClampToEdgeWrapping: 4, LinearFilter: 5, LinearMipmapLinearFilter: 6, NoColorSpace: '' };
  const la = L.resolveSurfaceLook?.(body('terran', 1), 'G'), lb = L.resolveSurfaceLook?.(body('ice', 2), 'G');
  const ma = la && S.createSurfaceMaterial?.(T, la, { logDepth: true, surfaceSeed: 1 }), mb = lb && S.createSurfaceMaterial?.(T, lb, { logDepth: true, surfaceSeed: 2 });
  assert(!!ma && !!mb && ma.fragmentShader === mb.fragmentShader && ma.vertexShader === mb.vertexShader, 'dwa różne ciała → TEN SAM tekst programu (jeden program w cache three)');
  assert(!!ma && ma.uniforms.uSunPos === mb.uniforms.uSunPos && ma.uniforms.uSunColor === mb.uniforms.uSunColor && ma.uniforms.uTune === mb.uniforms.uTune, 'światło i strojenie: uniformy WSPÓLNE (jeden obiekt)');
  assert(!!ma && ma.uniforms.uPal !== mb.uniforms.uPal && ma.uniforms.uLook.value !== mb.uniforms.uLook.value && ma.uniforms.uMapMix !== mb.uniforms.uMapMix, 'paleta, wygląd i przejście: uniformy PER ciało');
  assert(!!ma && ma.uniforms.uMapMix.value === 0 && ma.uniforms.uCityGain.value === 0 && !!ma.uniforms.uCityLights.value, 'start: barwa zastępcza (uMapMix 0), światła miast wyłączone, slot zajęty teksturą');
  const base = live;
  const map = { data: new Uint8Array(8 * 4 * 4), w: 8, h: 4 };
  const ok1 = S.applySurfaceMap?.(T, ma, map, 0.56, false);
  assert(ok1 === true && live === base + 1 && ma.uniforms.uMap.value.image.data === map.data && ma.uniforms.uMapSize.value[0] === 8 && ma.uniforms.uA.value[0] === 0.56 && ma.uniforms.uMapMix.value === 0,
    'applySurfaceMap: tekstura na bajtach cache, rozmiar i poziom morza w uniformach, przejście startuje od 0');
  S.applySurfaceMap?.(T, ma, map, 0.56, true);
  assert(live === base + 1 && ma.uniforms.uMapMix.value === 1, 'ponowna mapa zwalnia poprzednią teksturę; instant → uMapMix 1');
  ma?.dispose();
  assert(live === base && ma?.userData.surfaceMapTexture === null, 'material.dispose() zwalnia teksturę mapy (brak wycieku przy zmianie układu)');
  assert(S.applySurfaceMap?.(T, { userData: {} }, map, -1) === false, 'applySurfaceMap ignoruje obcy materiał');
}

console.log('\n── S8: okablowanie flagi (piny źródłowe, komentarze zdjęte) ──');
{
  const tr = strip(read('src/renderer/ThreeRenderer.js'));
  const cfg = strip(read('src/config/GameConfig.js'));
  assert(/\bsharedSurface:\s*false,/.test(cfg), 'FEATURES.sharedSurface istnieje i jest domyślnie OFF');
  assert(/_sharedSurfaceMaterial\(body\) \{\s*if \(!GAME_CONFIG\.FEATURES\?\.sharedSurface\) return null;/.test(tr), 'flaga OFF: _sharedSurfaceMaterial zwraca null w PIERWSZEJ instrukcji');
  assert(/else if \(\(material = this\._sharedSurfaceMaterial\(planet\)\)\)/.test(tr) && /let mat = this\._sharedSurfaceMaterial\(moon\);\s*if \(!mat\) try \{/.test(tr)
    && /let mat = this\._sharedSurfaceMaterial\(p\);\s*if \(!mat\) try \{/.test(tr), 'trzy ścieżki budowy (planeta / księżyc / planetoida): null → dzisiejszy kod');
  assert(/_tickSharedSurfaces\(\) \{\s*if \(this\._sharedSurfaces\.size === 0\) return;/.test(tr), 'pusty rejestr (flaga OFF) → tick wychodzi w pierwszej instrukcji');
  assert(/EventBus\.on\('surface:ready'/.test(tr) && /cache\.prefetchSystem\(/.test(tr), 'renderer słucha surface:ready i woła prefetchSystem');
  assert((tr.match(/this\._legacyBodyMaterial\(/g) ?? []).length === 1 && /rebuildBodySurfaces\(\) \{[\s\S]*?this\._legacyBodyMaterial\(/.test(tr), 'instrument A/B (_legacyBodyMaterial) woła tylko rebuildBodySurfaces');
  const baked = (tr.match(/this\._bakePlanetTexture\(/g) ?? []).length;
  assert(baked === 7, `wywołania _bakePlanetTexture: 6 dzisiejszych (3 budowy + 3 rebake) + 1 w instrumencie A/B (jest ${baked})`);
  assert(!/SurfaceCache\.js/.test(tr), 'ThreeRenderer nie importuje systemu SurfaceCache (sięga leniwie przez window.KOSMOS)');
  const sh = strip(read('src/renderer/SurfaceShader.js'));
  assert((sh.match(/^import /gm) ?? []).length === 1 && /from '\.\/LogDepthChunks\.js'/.test(sh), 'SurfaceShader importuje wyłącznie LogDepthChunks (THREE wstrzykiwane)');
  assert(/window\.csShared\s*=\s*window\.KOSMOS\.debug\?\.csShared;/.test(strip(read('src/scenes/GameScene.js'))), 'alias konsoli csShared');
  const sfDiffGuard = strip(read('src/utils/SurfacePaletteLogic.js'));
  assert(/import \{ seaLevelOf \} from '\.\/SurfaceField\.js'/.test(sfDiffGuard), 'logika palet bierze z SurfaceField tylko seaLevelOf');
}

console.log('\n── S9: strojenie CS-6a (§3.6.1) — mapa bohatera na zbliżeniu, wspólne światło gwiazdy ──');
{
  const T = S.SURFACE_HERO_PX ?? { enter: NaN, exit: NaN, steal: NaN }, dec = S.surfaceHeroDecision ?? (() => null);
  assert(T.enter > T.exit && T.exit > 0 && T.steal > 1, 'próg wejścia mapy bohatera > próg wyjścia (histereza), przejęcie wymaga wyraźnie większej tarczy');
  assert(dec(0, T.enter - 1, false) === 'none' && dec(0, T.enter, false) === 'best', 'brak bohatera: ciało dostaje mapę bohatera dopiero od progu wejścia');
  assert(dec(T.exit, T.exit, true) === 'keep' && dec(T.exit - 1, T.exit - 1, true) === 'none', 'bohater zostaje do progu wyjścia, poniżej wraca do LOD');
  assert(dec(T.enter, T.enter * T.steal, false) === 'keep' && dec(T.enter, T.enter * T.steal + 1, false) === 'best', 'inne ciało przejmuje mapę bohatera tylko gdy jest wyraźnie większe');
  assert(dec(T.exit - 1, T.enter - 1, false) === 'none' && dec(T.exit - 1, T.enter, false) === 'best', 'bohater pod progiem wyjścia: następny tylko od progu wejścia');
  // Surowe światło gwiazdy + dopełnienie = światło shadera powierzchni (jedna barwa dla skał i gazowców).
  const sums = [[1, 0.147, 0.063], [1, 0.6, 0.35], [1, 1, 1], [0.32, 0.03, 0.6]].map(([r, g, b]) => {
    const fill = S.surfaceFillLightColor?.(r, g, b) ?? [NaN, NaN, NaN], sun = S.surfaceSunColor?.(r, g, b, Math.PI) ?? [0, 0, 0];
    return fill.every(c => c >= 0) && Math.abs(r + fill[0] - sun[0]) < 1e-9 && Math.abs(g + fill[1] - sun[1]) < 1e-9 && Math.abs(b + fill[2] - sun[2]) < 1e-9;
  });
  assert(sums.length === 4 && sums.every(Boolean), 'PointLight gwiazdy + światło dopełniające = surfaceSunColor (M, K, biała, fioletowa Dysona), dopełnienie nieujemne');
  const fw = S.surfaceFillLightColor?.(1, 1, 1) ?? [1, 1, 1];
  assert(fw.every(c => Math.abs(c) < 1e-9), 'biała gwiazda: dopełnienie zerowe (kontrola — nie rozjaśnia sceny)');
  const tr = strip(read('src/renderer/ThreeRenderer.js'));
  const tick = tr.slice(tr.indexOf('_tickSharedSurfaces() {'), tr.indexOf('sharedSurfaceStats() {'));
  assert(tick.indexOf('if (this._sharedSurfaces.size === 0) return;') >= 0 && tick.indexOf('this._syncSharedFillLight(true)') > tick.indexOf('if (this._sharedSurfaces.size === 0) return;')
    && (tr.match(/new THREE\.PointLight\(0x000000/g) ?? []).length === 1, 'światło dopełniające powstaje wyłącznie za bramką rejestru (flaga OFF: scena ma tylko surowy PointLight)');
  assert(/if \(!GAME_CONFIG\.FEATURES\?\.sharedSurface\) this\._syncSharedFillLight\(false\)/.test(tr), 'csShared → OFF gasi światło dopełniające');
  assert(/cache\.request\(rec\.body, 'hero', 'focus'\)/.test(tr) && /cache\.get\(rec\.body, 'hero'\)/.test(tr), 'mapa bohatera idzie z SurfaceCache (worker), priorytet focus');
}

console.log(`\n=== colony_sphere_shader_smoke: ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
