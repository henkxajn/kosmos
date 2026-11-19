// colony_sphere_air_smoke — keeper kroku CS-6b (ARC COLONY SPHERE; plan §3.7): atmosfery, chmury, pokłady, ciała
// związane pływowo. Tylko LOGIKA (pętla lekka: wygląd ocenia właściciel na arkuszach cs6b-*.png).
// Uruchom: node src/testing/smoke/colony_sphere_air_smoke.mjs
//
// A1  Dane BODY_AIR: wiersz = istniejący archetyp powierzchni, ≥ 3 warianty barw, zakresy poprawne.
// A2  Kto ma powietrze: ciało bez atmosfery / planetoida / gaz → brak; ŚWIADEK: ten sam archetyp z atmosferą → jest.
//     hothouse / cryo_haze / hazy_moon zawsze. Każdy archetyp bez wiersza BODY_AIR jest bez atmosfery z definicji.
// A3  Determinizm i różnorodność: 40 ziaren na archetyp — żadne dwa nie dzielą wzoru (faza) ani barw; wszystkie warianty
//     pokładu Wenus osiągalne; cryo_haze ≠ hazy_moon (ton i gęstość); zakres pokrycia chmur z archetypu.
// A4  hazeOpacity: JEDEN parametr na ciało (uVeil.x), set / get / obcięcie do 0…1; poświata go nie ma.
// A5  GLSL (pin źródła): bez grawisów i bez interpolacji w shaderach, każdy uniform zadeklarowany = podany, warianty
//     log depth są derywacją, wspólne światło = TE SAME obiekty uniformów co powierzchnia, moduł bez three / GameConfig /
//     Math.random.
// A6  Związane pływowo: tylko planeta z flagą; punkt podgwiezdny = maksimum kanału t pola; starLockQuat trafia w gwiazdę
//     na całej orbicie, bez przeskoku i z biegunami pionowo; SurfaceAirLogic bierze z SurfaceField wyłącznie surfaceInfo.
// A7  ThreeRenderer (pin źródła — moduł nie importuje się pod node): bramka na materiale wspólnego shadera, flaga OFF
//     nie dotyka dzisiejszych chmur / poświaty / obrotu; słuchacz dispose nie usuwa dzieci z drzewa; GasGiantShader bez
//     powietrza CS-6b.

import '../headless/env.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
let pass = 0, fail = 0;
function assert(c, msg) { if (c) { pass++; console.log('  ✅ ' + msg); } else { fail++; console.log('  ❌ ' + msg); } }
const read = (rel) => { try { return readFileSync(path.join(REPO, rel), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const imp = async (rel) => { try { return await import(rel); } catch (e) { return { __err: String(e?.message ?? e) }; } };

// Piny degradują, nie przerywają: brakujący moduł = pusty obiekt, asercje czerwone.
const D = await imp('../../data/BodyAtmospheres.js');
const A = await imp('../../utils/SurfaceAirLogic.js');
const S = await imp('../../renderer/SurfaceAirShader.js');
const SS = await imp('../../renderer/SurfaceShader.js');
const DA = await imp('../../data/BodyArchetypes.js');
const SF = await imp('../../utils/SurfaceField.js');
const BY = DA.ARCHETYPE_BY_ID ?? {};
const AIR = D.BODY_AIR ?? {};
const seedOf = (i) => (Math.imul(i + 1, 0x9e3779b1) ^ 0x6b0a) >>> 0;
const body = (arch, seed, extra = {}) => ({ id: arch + '_' + seed, type: BY[arch]?.family ?? 'planet', bodyArchetype: arch, surfaceSeed: seed >>> 0, ...extra });
const ATM = { terran: 'breathable', ocean: 'breathable', jungle: 'breathable', desert: 'thin', ice: 'thin', volcanic: 'thin', tidally_locked: 'thin' };

console.log('── A1: dane BODY_AIR ──');
{
  assert(!D.__err && !A.__err && !S.__err, `moduły CS-6b się importują pod node${[D, A, S].map(m => m.__err).filter(Boolean).map(e => ' — ' + e).join('')}`);
  const ids = Object.keys(AIR);
  const hex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  const bad = [];
  for (const id of ids) {
    const r = AIR[id], a = BY[id];
    if (!a || a.family === 'gas' || a.family === 'planetoid') bad.push(id + ': archetyp');
    if (!(Array.isArray(r.variants) && r.variants.length >= 3)) bad.push(id + ': warianty');
    for (const v of r.variants ?? []) if (!(hex(v.tint) && hex(v.cloud) && hex(v.twilight) && Array.isArray(v.veil) && v.veil.length === 3 && v.veil.every(hex))) bad.push(id + '/' + v.id);
    const c = r.clouds, ve = r.veil, h = r.halo;
    if (!(c.coverage[0] <= c.coverage[1] && c.coverage[1] <= 1 && c.scale[0] <= c.scale[1] && c.band[0] <= c.band[1] && c.warp[0] <= c.warp[1] && c.drift > 0 && c.drift < 0.05)) bad.push(id + ': chmury');
    if (!(ve.opacity > 0 && ve.opacity <= 1 && ve.center > 0 && ve.center <= 1 && (ve.opaque === 0 || ve.opaque === 1) && h.thickness >= 0 && h.thickness <= 1 && h.strength > 0)) bad.push(id + ': zasłona / poświata');
  }
  assert(ids.length >= 10 && bad.length === 0, `BODY_AIR: ${ids.length} wierszy, każdy na archetypie planety / księżyca, ≥ 3 warianty barw, zakresy poprawne${bad.length ? ' — ' + bad.join(', ') : ''}`);
  assert(D.AIR_SHELL_SCALE > 1 && D.AIR_SHELL_SCALE < D.AIR_HALO_SCALE?.lo && D.AIR_HALO_SCALE?.lo < D.AIR_HALO_SCALE?.hi && D.AIR_HALO_SCALE.hi < 1.2,
    `promienie: ciało < powłoka chmur (${D.AIR_SHELL_SCALE}) < poświata (${D.AIR_HALO_SCALE?.lo}…${D.AIR_HALO_SCALE?.hi})`);
}

console.log('\n── A2: kto ma powietrze ──');
{
  const look = (b) => { try { return A.resolveAirLook?.(b) ?? null; } catch { return undefined; } };
  const withRow = Object.keys(AIR).filter(id => !AIR[id].always);
  const none = withRow.filter(id => look(body(id, 7, { atmosphere: 'none' })) === null && look(body(id, 7, {})) === null && look(body(id, 7, { atmosphere: 'brak' })) === null);
  const some = withRow.filter(id => !!look(body(id, 7, { atmosphere: ATM[id] ?? 'thin' })));
  assert(withRow.length >= 7 && none.length === withRow.length && some.length === withRow.length,
    `ciało bez atmosfery → brak powłoki (${none.length}/${withRow.length}); świadek: ten sam archetyp z atmosferą → powłoka jest (${some.length}/${withRow.length})`);
  const always = Object.keys(AIR).filter(id => AIR[id].always);
  assert(['hothouse', 'cryo_haze', 'hazy_moon'].every(id => always.includes(id)) && always.every(id => !!look(body(id, 7, {}))),
    `hothouse / cryo_haze / hazy_moon mają pokład / mgłę zawsze (${always.join(', ')})`);
  const airless = Object.keys(BY).filter(id => BY[id].family !== 'gas' && !AIR[id]);
  const leak = airless.filter(id => look(body(id, 7, { atmosphere: 'dense' })) !== null);
  assert(airless.length >= 8 && airless.includes('barren') && airless.includes('rocky_cratered') && airless.includes('planetoid') && leak.length === 0,
    `archetypy bez wiersza BODY_AIR (${airless.length}: ${airless.join(', ')}) nigdy nie dostają powłoki${leak.length ? ' — ' + leak.join(', ') : ''}`);
  assert(look({ ...body('terran', 7, { atmosphere: 'breathable' }), type: 'planetoid' }) === null && look({ ...body('terran', 7, { atmosphere: 'breathable' }), surfaceSeed: undefined }) === null
    && look(null) === null, 'planetoida / brak ziarna / null → brak powłoki (funkcja totalna)');
  const thin = look(body('desert', 7, { atmosphere: 'thin' })), full = look(body('desert', 7, { atmosphere: 'breathable' }));
  assert(!!thin && !!full && thin.hazeOpacity < full.hazeOpacity && thin.haloStrength < full.haloStrength && thin.cloudCoverage < full.cloudCoverage,
    `klasa atmosfery skaluje gęstość: thin < breathable (zasłona ${thin?.hazeOpacity.toFixed(2)} < ${full?.hazeOpacity.toFixed(2)}, chmury ${thin?.cloudCoverage.toFixed(2)} < ${full?.cloudCoverage.toFixed(2)})`);
}

console.log('\n── A3: determinizm i różnorodność ──');
{
  const N = 40, looks = {};
  for (const id of Object.keys(AIR)) looks[id] = Array.from({ length: N }, (_, i) => A.resolveAirLook?.(body(id, seedOf(i), { atmosphere: ATM[id] ?? 'dense' })));
  const again = A.resolveAirLook?.(body('terran', seedOf(3), { atmosphere: 'breathable' }));
  assert(!!again && JSON.stringify(again) === JSON.stringify(looks.terran?.[3]), 'te same dane ciała → ten sam wygląd (bez stanu, bez Math.random)');
  let minPhase = Infinity, minCol = Infinity, pairs = 0, worst = '';
  for (const id of Object.keys(AIR)) for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const a = looks[id][i], b = looks[id][j];
    if (!a || !b) { minCol = -1; continue; }
    const dp = Math.hypot(a.phase[0] - b.phase[0], a.phase[1] - b.phase[1], a.phase[2] - b.phase[2]);
    const dc = A.airDistance(a, b);
    if (dp < minPhase) minPhase = dp;
    if (dc < minCol) { minCol = dc; worst = id; }
    pairs++;
  }
  assert(pairs === Object.keys(AIR).length * N * (N - 1) / 2 && minPhase > 0.05, `żadne dwa ciała nie dzielą wzoru chmur / pasm: najmniejsza odległość faz ${minPhase.toFixed(3)} > 0.05 (${pairs} par)`);
  assert(minCol > 1e-4, `barwy powietrza nie powtarzają się w obrębie archetypu: najmniejsza odległość ${minCol.toExponential(2)} (${worst}) > 0`);
  const venus = new Set(looks.hothouse?.map(l => l?.variantA));
  assert(['cream', 'sulphur', 'tan'].every(v => venus.has(v)), `pokład Wenus: wszystkie warianty osiągalne (${[...venus].join(' / ')})`);
  const hot = looks.hothouse ?? [], cryo = looks.cryo_haze ?? [], hazy = looks.hazy_moon ?? [];
  assert(hot.every(l => l?.hazeOpacity === 1 && l.veilOpaque === 1 && l.cloudCoverage === 0), 'hothouse: pokład nieprzezroczysty (hazeOpacity 1) — powierzchnia ukryta na mapie układu');
  assert(cryo.length > 0 && cryo.every(l => l?.hazeOpacity === 0.9 && l.veilOpaque === 1) && hazy.every(l => l?.hazeOpacity === 0.86 && l.hazeOpacity < cryo[0]?.hazeOpacity),
    `cryo_haze: hazeOpacity ${cryo[0]?.hazeOpacity} (wartość właściciela, strojenie CS-6b; było 0.97), hazy_moon cieńsza i bez zmian (${hazy[0]?.hazeOpacity})`);
  const mean = (ls, k) => [0, 1, 2].map(c => ls.reduce((s, l) => s + (l?.[k]?.[c] ?? 0), 0) / ls.length);
  const mc = mean(cryo, 'veilA'), mh = mean(hazy, 'veilA');
  const toneGap = Math.hypot(mc[0] - mh[0], mc[1] - mh[1], mc[2] - mh[2]);
  assert(toneGap > 0.08 && mh[1] + mh[2] > mc[1] + mc[2], `cryo_haze i hazy_moon mają różny ton (odległość średnich barw ${toneGap.toFixed(3)} > 0.08; księżyc bledszy)`);
  const cov = (id) => looks[id].map(l => l.cloudCoverage);
  const okCov = ['terran', 'ocean', 'jungle'].every(id => Math.min(...cov(id)) >= AIR[id].clouds.coverage[0] - 1e-9 && Math.max(...cov(id)) <= AIR[id].clouds.coverage[1] + 1e-9 && Math.max(...cov(id)) - Math.min(...cov(id)) > 0.15);
  const bandSpread = Math.max(...looks.terran.map(l => l.cloudBand)) - Math.min(...looks.terran.map(l => l.cloudBand));
  assert(okCov && bandSpread > 0.5, `chmury: pokrycie w zakresie archetypu i zróżnicowane z ziarna; terran od cumulusów po pasma burzowe (rozrzut pasmowości ${bandSpread.toFixed(2)})`);
  assert(looks.desert.every(l => l.cloudCoverage < 0.15) && looks.terran.every(l => Math.abs(l.drift) > 0 && Math.abs(l.drift) < 0.03), 'desert: prawie bez chmur (< 0.15); dryf chmur wolny (< 0.03 rad/s)');
}

console.log('\n── A4: hazeOpacity — jeden parametr na ciało (atrapa THREE) ──');
{
  class ShaderMaterial { constructor(o) { Object.assign(this, o); this.userData = {}; } dispose() {} }
  const T = { ShaderMaterial, FrontSide: 0, BackSide: 1, AdditiveBlending: 2 };
  const la = A.resolveAirLook?.(body('hothouse', 11)), lb = A.resolveAirLook?.(body('terran', 12, { atmosphere: 'breathable' }));
  const ma = la && S.createAirMaterials?.(T, la, { logDepth: true }), mb = lb && S.createAirMaterials?.(T, lb, { logDepth: true });
  assert(!!ma && !!mb && ma.shell.fragmentShader === mb.shell.fragmentShader && ma.halo.fragmentShader === mb.halo.fragmentShader && ma.shell.vertexShader === mb.halo.vertexShader,
    'dwa różne ciała → TEN SAM tekst programów (per ciało tylko uniformy; wspólny cache programów three)');
  assert(!!ma && ma.shell.premultipliedAlpha === true && ma.shell.transparent && ma.shell.depthWrite === false && ma.shell.side === T.FrontSide
    && ma.halo.blending === T.AdditiveBlending && ma.halo.depthWrite === false && ma.halo.side === T.BackSide, 'powłoka: alfa premultiplikowana, front, bez zapisu głębi; poświata: addytywna, tył');
  assert(!!ma && S.hazeOpacityOf(ma.shell) === 1 && S.setHazeOpacity(ma.shell, 0.3) === 0.3 && ma.shell.uniforms.uVeil.value[0] === 0.3 && S.hazeOpacityOf(ma.shell) === 0.3,
    'setHazeOpacity / hazeOpacityOf: pokład Wenus 1 → 0.3 (uVeil.x) — parametr dla CS-7');
  assert(!!ma && S.setHazeOpacity(ma.shell, 7) === 1 && S.setHazeOpacity(ma.shell, -2) === 0 && S.setHazeOpacity(ma.shell, NaN) === null && S.setHazeOpacity(ma.halo, 0.5) === null && S.hazeOpacityOf(ma.halo) === null,
    'obcięcie do 0…1; NaN i materiał poświaty → null (parametr żyje tylko na powłoce)');
  assert(!!mb && mb.shell.uniforms.uVeil.value[0] === lb.hazeOpacity && ma.shell.uniforms.uVeil !== mb.shell.uniforms.uVeil, 'zmiana na jednym ciele nie rusza drugiego (uniform per ciało)');
  const U = SS.SURFACE_SHARED_UNIFORMS;
  assert(!!ma && !!U && ma.shell.uniforms.uSunPos === U.uSunPos && ma.shell.uniforms.uSunColor === U.uSunColor && ma.shell.uniforms.uAmbient === U.uAmbient
    && ma.halo.uniforms.uSunColor === U.uSunColor && ma.halo.uniforms.uSunPos === U.uSunPos, 'światło: TE SAME obiekty uniformów co powierzchnia (wspólna, zmiękczona barwa gwiazdy — D-CS-21)');
}

console.log('\n── A5: GLSL — pin źródła ──');
{
  const src = read('src/renderer/SurfaceAirShader.js'), code = strip(src);
  const shaders = { AIR_VERT: S.AIR_VERT, AIR_FRAG: S.AIR_FRAG, AIR_HALO_FRAG: S.AIR_HALO_FRAG };
  assert(Object.values(shaders).every(g => typeof g === 'string' && g.length > 200 && !g.includes('`') && !g.includes('${')), 'shadery: bez grawisów i bez interpolacji (wartości per ciało wyłącznie przez uniformy)');
  const decl = (g) => new Set([...g.matchAll(/^\s*uniform\s+\w+\s+(\w+)\s*;/gm)].map(m => m[1]));
  const look = A.resolveAirLook?.(body('cryo_haze', 5));
  const uShell = look ? Object.keys(S.createAirUniforms(look)) : [], uHalo = look ? Object.keys(S.createHaloUniforms(look)) : [];
  const dShell = new Set([...decl(S.AIR_VERT ?? ''), ...decl(S.AIR_FRAG ?? '')]), dHalo = new Set([...decl(S.AIR_VERT ?? ''), ...decl(S.AIR_HALO_FRAG ?? '')]);
  const miss = [...uShell.filter(u => !dShell.has(u)).map(u => 'powłoka: brak deklaracji ' + u), ...[...dShell].filter(u => !uShell.includes(u)).map(u => 'powłoka: brak wartości ' + u),
    ...uHalo.filter(u => !dHalo.has(u)).map(u => 'poświata: brak deklaracji ' + u), ...[...dHalo].filter(u => !uHalo.includes(u)).map(u => 'poświata: brak wartości ' + u)];
  assert(uShell.length >= 10 && uHalo.length >= 4 && miss.length === 0, `uniformy: zadeklarowane w GLSL = podane w materiale (powłoka ${uShell.length}, poświata ${uHalo.length})${miss.length ? ' — ' + miss.join('; ') : ''}`);
  assert([S.AIR_VERT_LOGDEPTH, S.AIR_FRAG_LOGDEPTH, S.AIR_HALO_FRAG_LOGDEPTH].every(g => typeof g === 'string' && g.includes('USE_LOGDEPTHBUF'))
    && Object.values(shaders).every(g => !String(g).includes('USE_LOGDEPTHBUF')) && /withLogDepthFragment\(AIR_FRAG\)/.test(code) && /withLogDepthFragment\(AIR_HALO_FRAG\)/.test(code),
    'warianty log depth są derywacją przez LogDepthChunks (nie ręczną kopią)');
  const imports = [...code.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]);
  assert(imports.length === 2 && imports.includes('./LogDepthChunks.js') && imports.includes('./SurfaceShader.js') && !/Math\.random/.test(code) && !/GameConfig/.test(code),
    `SurfaceAirShader importuje tylko LogDepthChunks + SurfaceShader (THREE wstrzykiwane), bez Math.random i GameConfig (${imports.join(', ')})`);
  assert(/uVeil\.x/.test(S.AIR_FRAG ?? '') && /gl_FragColor = vec4\(cloudRGB \* aC \+ veilRGB \* aV \* \(1\.0 - aC\), a\)/.test(S.AIR_FRAG ?? ''), 'fragment: zasłona skalowana uVeil.x (hazeOpacity), wynik premultiplikowany „chmury nad zasłoną"');
  const logic = strip(read('src/utils/SurfaceAirLogic.js'));
  assert(!/Math\.random/.test(logic) && !/from '.*three/.test(logic) && !/document|window\./.test(logic), 'SurfaceAirLogic: czysty moduł (bez Math.random, three, DOM)');
}

console.log('\n── A6: związane pływowo ──');
{
  // D-CS-23: orientacja ku gwieździe WYŁĄCZNIE dla archetypu tidally_locked; sama flaga (np. terran przy karle M) nie zatrzymuje obrotu.
  assert(A.isStarLocked?.({ type: 'planet', bodyArchetype: 'tidally_locked', tidallyLocked: true }) === true
    && A.isStarLocked({ type: 'planet', bodyArchetype: 'tidally_locked' }) === true
    && A.isStarLocked({ type: 'planet', bodyArchetype: 'terran', tidallyLocked: true }) === false
    && A.isStarLocked({ type: 'planet', bodyArchetype: 'desert', tidallyLocked: true }) === false
    && A.isStarLocked({ type: 'planet', tidallyLocked: true }) === false
    && A.isStarLocked({ type: 'moon', bodyArchetype: 'tidally_locked', tidallyLocked: true }) === false && A.isStarLocked(null) === false,
    'isStarLocked (D-CS-23): tylko planeta archetypu tidally_locked (świadkowie: terran / desert z flagą → false, księżyc → false)');
  const T = BY.tidally_locked, P = SF.fibonacciSphere?.(3000) ?? [];
  let worstDot = 1, unit = true, differ = new Set();
  for (let i = 0; i < 8; i++) {
    const sd = seedOf(i), sub = A.substellarDirOf?.(body('tidally_locked', sd, { tidallyLocked: true })) ?? [0, 0, 0];
    if (Math.abs(Math.hypot(...sub) - 1) > 1e-9) unit = false;
    differ.add(sub.map(v => v.toFixed(3)).join(','));
    // Oś „oka" = kierunek, wzdłuż którego rośnie kanał t pola: średnia punktów sfery ważona (t − średnia).
    let ax = 0, ay = 0, az = 0, mt = 0;
    const ts = [];
    for (let k = 0; k < 3000; k++) { const t = SF.evalAt(sd, T, null, P[k * 3], P[k * 3 + 1], P[k * 3 + 2]).t; ts.push(t); mt += t / 3000; }
    for (let k = 0; k < 3000; k++) { const w = ts[k] - mt; ax += w * P[k * 3]; ay += w * P[k * 3 + 1]; az += w * P[k * 3 + 2]; }
    const l = Math.hypot(ax, ay, az);
    worstDot = Math.min(worstDot, (ax * sub[0] + ay * sub[1] + az * sub[2]) / l);
  }
  assert(unit && worstDot > 0.97 && differ.size === 8, `substellarDirOf (tidally_locked) = środek „oka" pola: zgodność z osią kanału t ≥ 0.97 (najgorsza ${worstDot.toFixed(3)}, 8 ziaren, 8 różnych kierunków)`);
  const plain = A.substellarDirOf?.(body('hothouse', 5, { tidallyLocked: true }));
  assert(Array.isArray(plain) && plain[0] === 1 && plain[1] === 0 && plain[2] === 0, 'pozostałe związane archetypy pokazują gwieździe +x pola');
  const sub = A.substellarDirOf?.(body('tidally_locked', seedOf(2), { tidallyLocked: true })) ?? [1, 0, 0];
  let maxErr = 0, maxJump = 0, minUp = 1, maxUp = -1, prev = null;
  for (let d = 0; d <= 720; d++) {
    const a = d * Math.PI / 360, dir = [Math.cos(a), 0, Math.sin(a)];
    const q = A.starLockQuat?.(sub, dir[0] * 7.5, dir[2] * 7.5) ?? [0, 0, 0, 1];
    const r = A.rotateByQuat(sub, q), up = A.rotateByQuat([0, 1, 0], q);
    maxErr = Math.max(maxErr, Math.hypot(r[0] - dir[0], r[1] - dir[1], r[2] - dir[2]));
    minUp = Math.min(minUp, up[1]); maxUp = Math.max(maxUp, up[1]);
    if (prev) maxJump = Math.max(maxJump, 1 - Math.abs(prev[0] * q[0] + prev[1] * q[1] + prev[2] * q[2] + prev[3] * q[3]));
    prev = q.slice();
  }
  assert(maxErr < 1e-9, `starLockQuat: punkt podgwiezdny patrzy na gwiazdę w każdym położeniu orbity (błąd max ${maxErr.toExponential(1)}; długość wektora do gwiazdy dowolna)`);
  assert(maxJump < 1e-4 && maxUp - minUp < 1e-9 && minUp > 0.7, `obrót ciągły na całej orbicie (skok max ${maxJump.toExponential(1)} na 0.5°) i bieguny pionowo (up.y stałe = ${minUp.toFixed(3)})`);
  // Kontrola metody: najkrótszy łuk sub → gwiazda (quatFromTo) kołysze biegunami i przetacza ciało ~60 × szybciej, gdy
  // gwiazda mija antypodę punktu podgwiezdnego — dlatego gra składa obrót z dwóch (stały + wokół osi Y).
  let naive = 0, nMinUp = 1, nMaxUp = -1; prev = null;
  for (let d = 0; d <= 720; d++) { const a = d * Math.PI / 360, q = A.quatFromTo?.(sub, [Math.cos(a), 0, Math.sin(a)]) ?? [0, 0, 0, 1];
    const up = A.rotateByQuat([0, 1, 0], q); nMinUp = Math.min(nMinUp, up[1]); nMaxUp = Math.max(nMaxUp, up[1]);
    if (prev) naive = Math.max(naive, 1 - Math.abs(prev[0] * q[0] + prev[1] * q[1] + prev[2] * q[2] + prev[3] * q[3])); prev = q.slice(); }
  assert(nMaxUp - nMinUp > 0.5 && naive > 20 * Math.max(maxJump, 1e-9), `kontrola: najkrótszy łuk kołysze biegunami (up.y ${nMinUp.toFixed(2)}…${nMaxUp.toFixed(2)}) i przetacza ciało ${Math.round(naive / Math.max(maxJump, 1e-9))} × szybciej — miary rozróżniają metody`);
  const logic = strip(read('src/utils/SurfaceAirLogic.js'));
  const fromField = (logic.match(/import \{([^}]*)\} from '\.\/SurfaceField\.js'/) ?? [])[1]?.split(',').map(x => x.trim()).filter(Boolean) ?? [];
  assert(fromField.length === 1 && fromField[0] === 'surfaceInfo', `SurfaceAirLogic bierze z SurfaceField wyłącznie surfaceInfo (${fromField.join(', ')})`);
}

console.log('\n── A7: ThreeRenderer — pin źródła ──');
{
  const tr = strip(read('src/renderer/ThreeRenderer.js'));
  assert(/const sharedBody = material\?\.userData\?\.surfaceShader === true;/.test(tr)
    && /const hasValidAtmo = !sharedBody && !isGas && planet\.atmosphere/.test(tr) && /const hasAtmo = !sharedBody && !isGas && planet\.atmosphere/.test(tr),
    'addPlanetMesh: dzisiejsze chmury i poświata wyłączone TYLKO dla materiału wspólnego shadera (flaga OFF: sharedBody false → bez zmian)');
  assert(/if \(sharedBody\) \{[\s\S]{0,400}this\._syncSharedAir\(planet\.id, group, planet, r, mesh\.rotation\.z\);/.test(tr)
    && /if \(mat\.userData\?\.surfaceShader\) this\._syncSharedAir\(moon\.id, mesh, moon, r, 0\);/.test(tr), 'powietrze CS-6b budowane wyłącznie za bramką materiału (planeta i księżyc)');
  assert(/_starLockOf\(planet\) \{\s*if \(!GAME_CONFIG\.FEATURES\?\.sharedSurface \|\| !isStarLocked\(planet\)\) return null;/.test(tr), '_starLockOf: flaga OFF → null w pierwszej linii');
  assert(/if \(entry\.starLock\) this\._orientStarLocked\(entry, starWPos\);\s*else if \(!entry\.mesh\.material\?\.userData\?\.gasUniforms\) entry\.mesh\.rotation\.y \+= 0\.003;/.test(tr),
    'związana pływowo: orientacja ku gwieździe ZAMIAST obrotu wokół osi; wpis bez starLock = dzisiejszy obrót (linia nietknięta)');
  const lis = (tr.match(/material\.addEventListener\('dispose', \(\) => \{([\s\S]*?)\n    \}\);/) ?? [])[1] ?? '';
  assert(lis.includes('rec.air') && lis.includes('geometry.dispose()') && !/\.remove\(/.test(lis), 'słuchacz dispose zwalnia powietrze BEZ usuwania dzieci z drzewa (odpala się w środku group.traverse)');
  assert(/bodyHazeOpacity\(bodyId, value\)/.test(tr) && /rec\.air\.phase \+= wdt \* rec\.air\.look\.evolve;/.test(tr)
    && /const wdt = dt \* \(ts \? weatherRate\(ts\.multiplier, ts\.isPaused\) : 1\);/.test(tr),
    'renderer: bodyHazeOpacity (jeden parametr na ciało); dryf i ewolucja chmur na zegarze pogody (czas realny × weatherRate z zegara gry)');
  assert(/if \(pe && rec\.air\.shell\.parent === pe\.group\) rec\.air\.shell\.quaternion\.copy\(pe\.mesh\.quaternion\);/.test(tr)
    && /if \(!rec\.air\.locked\) rec\.air\.angle \+= wdt \* rec\.air\.look\.drift;/.test(tr),
    'renderer: powłoka chmur współobraca się z siatką planety (kopia orientacji co klatkę); ciało związane pływowo — bez dryfu, same wiatry pasmowe');
  const gas = strip(read('src/renderer/GasGiantShader.js'));
  assert(gas.length > 1000 && !/SurfaceAir|BodyAtmospheres|resolveAirLook/.test(gas), 'GasGiantShader nie zna powietrza CS-6b (D-CS-5: gazowce bez zmian)');
  const flags = read('src/config/GameConfig.js');
  assert(/sharedSurface:\s+false,/.test(flags), 'FEATURES.sharedSurface zostaje false w pliku');
}

console.log('\n── A8: strojenie CS-6b — pogoda, dopełnienie bez odblasku, obca roślinność ──');
{
  const W = D.AIR_WEATHER ?? {};
  const mult = [0, 1 / 365.25, 3 / 365.25, 7 / 365.25, 1 / 12, 1];   // GAME_CONFIG.TIME_MULTIPLIERS
  const rates = mult.map(m => A.weatherRate?.(m, false));
  assert(rates[0] === 0 && A.weatherRate?.(1 / 365.25, true) === 0 && A.weatherRate?.(1, true) === 0 && A.weatherRate?.(NaN) === 0,
    'weatherRate: pauza / mnożnik 0 → 0 (chmury zamrożone)');
  assert(Math.abs(rates[1] - 1) < 1e-9 && rates.every((r, i) => i === 0 || r >= rates[i - 1]) && rates[2] > rates[1] && rates[5] === W.speedCap && W.speedCap <= 3,
    `weatherRate: 1 dzień/s = 1, rośnie z prędkością gry, sufit ${W.speedCap} × (${rates.map(r => r?.toFixed?.(2)).join(' / ')})`);
  const ls = Array.from({ length: 40 }, (_, i) => A.resolveAirLook?.(body('terran', seedOf(i), { atmosphere: 'breathable' })));
  const cyc = ls.map(l => 1 / l?.evolve);
  assert(ls.every(l => l && l.evolve > 0 && Number.isFinite(l.weatherPhase) && l.cloudShade > 0 && l.cloudShade <= 1 && l.windBands >= 1 && Math.abs(l.wind) > 0.3)
    && Math.min(...cyc) >= 45 && Math.max(...cyc) <= 100 && new Set(ls.map(l => l.weatherPhase.toFixed(4))).size >= 38
    && ls.some(l => l.wind > 0) && ls.some(l => l.wind < 0),
    `pogoda z ziarna: cykl ${Math.min(...cyc).toFixed(0)}–${Math.max(...cyc).toFixed(0)} s (strojenie #2: 45…100 — wyraźnie inny układ chmur w ≈ 1 minutę), faza startowa różna między ciałami, wiatr pasmowy w obu kierunkach`);
  const FakeT = { ShaderMaterial: class { constructor(o) { Object.assign(this, o); this.userData = {}; } }, FrontSide: 0, BackSide: 1, AdditiveBlending: 2 };
  const m = ls[0] ? S.createAirMaterials?.(FakeT, ls[0], { logDepth: false }) : null;
  assert(!!m && m.shell.uniforms.uFlow?.value?.length === 4 && m.shell.uniforms.uFlow.value[0] === ls[0].weatherPhase
    && S.setAirClock?.(m.shell, 1.25, 7.5) === true && m.shell.uniforms.uShape.value[3] === 1.25 && m.shell.uniforms.uFlow.value[0] === 7.5
    && S.setAirClock(m.halo, 1, 1) === false && S.setAirClock(m.shell, NaN, NaN) === true && m.shell.uniforms.uFlow.value[0] === 7.5,
    'setAirClock: kąt dryfu → uShape.w, faza pogody → uFlow.x (tylko powłoka; NaN nie psuje stanu)');
  const frag = S.AIR_FRAG ?? '';
  assert(/uniform vec4 uFlow;/.test(frag) && !/worley|wcell/.test(frag) && /float thin = ss\(/.test(frag) && /float thick = ss\(/.test(frag) && /floor\(ph\)/.test(frag) && /floor\(ph \+ 0\.5\)/.test(frag) && /sqrt\(w1 \* w1 \+ w2 \* w2\)/.test(frag)
    && !frag.includes(String.fromCharCode(96)) && !/Math\.random/.test(strip(read('src/renderer/SurfaceAirShader.js'))),
    'fragment: dwie fazy układów pogodowych z wyrównaniem kontrastu, gęstość z dwóch ramp (woal + rdzeń), bez szumu komórkowego; bez grawisów w GLSL');

  // Dopełnienie światła gwiazdy tylko barwi: łatka chunka three + znacznik distance < 0.
  const DL = await imp('../../renderer/DiffuseOnlyLight.js');
  const lib = read('src/lib/three.module.js');
  const mm = lib.match(/var lights_fragment_begin = ("(?:[^"\\]|\\.)*")/);
  const chunk = mm ? JSON.parse(mm[1]) : '';
  const out = DL.diffuseOnlyChunk?.(chunk) ?? '';
  const loop = out.slice(out.indexOf('getPointLightInfo( pointLight'), out.indexOf('#pragma unroll_loop_end'));
  assert(chunk.length > 500 && out.length > chunk.length && /kosmosSpecKeep = reflectedLight\.directSpecular;\s*RE_Direct\([^;]*\);\s*if \( pointLight\.distance < 0\.0 \) reflectedLight\.directSpecular = kosmosSpecKeep;/.test(loop)
    && out.split('RE_Direct(').length === chunk.split('RE_Direct(').length && out.split('kosmosSpecKeep').length === 4,
    'DiffuseOnlyLight: prawdziwy chunk three (src/lib) dostaje przywrócenie odblasku po świetle ze znacznikiem — tylko w pętli świateł punktowych');
  const sc = { lights_fragment_begin: chunk }, sc2 = { lights_fragment_begin: 'void main() {}' };
  assert(DL.diffuseOnlyChunk?.(out) === out && DL.patchDiffuseOnlyPointLights?.(sc) === true && sc.lights_fragment_begin === out
    && DL.patchDiffuseOnlyPointLights(sc2) === false && sc2.lights_fragment_begin === 'void main() {}' && DL.diffuseOnlyChunk(null) === null && DL.DIFFUSE_ONLY_DISTANCE < 0,
    'DiffuseOnlyLight: idempotentna; kontrola — chunk bez kotwic zostaje nietknięty (false), znacznik = distance < 0');
  const tr = strip(read('src/renderer/ThreeRenderer.js'));
  assert(/const DIFFUSE_ONLY_OK = patchDiffuseOnlyPointLights\(THREE\.ShaderChunk\);/.test(tr)
    && /this\._sharedFillLight = new THREE\.PointLight\(0x000000, 0, DIFFUSE_ONLY_OK \? DIFFUSE_ONLY_DISTANCE : 0, 0\);/.test(tr)
    && (tr.match(/DIFFUSE_ONLY_DISTANCE/g) ?? []).length === 2 && !/DiffuseOnly|kosmosSpecKeep/.test(strip(read('src/renderer/GasGiantShader.js'))),
    'renderer: znacznik nosi WYŁĄCZNIE dopełnienie (światło gwiazdy bez zmian); GasGiantShader nietknięty (D-CS-5)');

  // Obca (bordowa) roślinność dżungli: rzadka pod G / F, częsta pod M.
  const PL = await imp('../../utils/SurfacePaletteLogic.js');
  const share = (cls) => { let n = 0; for (let i = 0; i < 600; i++) if (PL.resolveSurfaceLook?.(body('jungle', seedOf(i + 900), { atmosphere: 'breathable' }), cls)?.variantA === 'maroon') n++; return n / 600; };
  const sh = { M: share('M'), K: share('K'), G: share('G'), F: share('F') };
  assert(sh.G > 0 && sh.G < 0.04 && sh.F < 0.04 && sh.M > 0.28 && sh.K > sh.G * 3 && sh.K < sh.M,
    `jungle „maroon" jako wariant główny (600 ziaren): M ${(sh.M * 100).toFixed(1)}% · K ${(sh.K * 100).toFixed(1)}% · G ${(sh.G * 100).toFixed(1)}% · F ${(sh.F * 100).toFixed(1)}% (rzadka pod G / F, nadal osiągalna)`);
}

console.log(`\n=== colony_sphere_air_smoke: ${pass} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
