// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ship_hologram_smoke — KEEPER ARC KONSOLE, krok K1a (`ShipHologramRenderer`; flaga `shipHologram` zdjęta w KZ-Shipyard)
// Plan: `docs/design/CONSOLES_PLAN.md` §2 B1–B4, D-K-4 / D-K-7 / D-K-10 / D-K-11.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (logika i kontrakt — bez pinów na stałych wyglądu):
//   H1 klucz modelu projektu = reguła VesselModelResolver: kadłuby bojowe 1:1, cywilne wg roli z modułów (habitat → colony,
//      science → science, reszta → cargo), oś warp z Komory Warp; 24 klucze osiągalne; kolejność ścieżek wczytywania
//   H2 WYKONANIEM na prawdziwym Three.js r171: po budowie modelu, przebudowie krawędzi, renderach (atrapa GL), podmianie
//      modelu, przemalowaniu i `release()` materiały i geometria szablonu (scena główna) są nietknięte — te same uuid,
//      ten sam JSON, zero zdarzeń `dispose`, macierze węzłów bez zmian; klony dzielą geometrię, nie materiał
//   H3 fallback: brak kontekstu (createGL rzuca) · utrata kontekstu (preventDefault, potem powrót) · budżet (mediana > budżet
//      po ≥ 8 próbkach) · wymuszony; priorytet przyczyn; sylwetka rysowana bez WebGL; nic nie rzuca
//   H4 bezczynność: bez zmian i bez obrotu `draw` nie renderuje (tylko komponuje); obrót → render co klatkę; ukryty = 0
//   H5 `release()` zwalnia kontekst (dispose + forceContextLoss, słuchacze zdjęci); następny rysunek tworzy nowy
//   H6 GLSL: stałe łańcuchy bez grawisów i bez interpolacji (próba kompilacji w Chrome z błędną kontrolą — sonda K1a)
//   H7 pokrętła w klamrze, trwałość (bez klucza flagi; podgląd debug otwiera się bez warunku), haki UIManagera (predykat sceny
//      konsoli, rysunek, animacja). KZ-Shipyard: piny «FEATURES.shipHologram ON» i «flaga OFF → podgląd odmawia» (ścieżka OFF)
//      zamienione na pin trwałości (brak klucza) i pin otwarcia (open() tworzy podgląd, rejestruje go w UIManager, close() zwalnia).
// ⚠ Fail-first: moduły powstają w K1a — importy dynamiczne, piny DEGRADUJĄ (czerwone), suita się nie przerywa.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';
import { readFileSync } from 'node:fs';
import { SHIP_MODULES } from '../../data/ShipModulesData.js';
import { VESSEL_MODEL_KEYS } from '../../renderer/VesselModelResolver.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';

const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);
const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const L = await tryImport('../../renderer/ShipHologramLogic.js');
const S = await tryImport('../../renderer/ShipHologramScene.js');
const R = await tryImport('../../renderer/ShipHologramRenderer.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const safe = (fn, d = null) => { try { return fn(); } catch (e) { console.log('  ! ' + e.message); return d; } };
console.log('\n── H0 moduły K1a (bez nich bloki wykonania niżej są pomijane — ten pin jest ich czerwonym zastępcą) ──');
assert(!!L && !!S && !!R, 'H0 ShipHologramLogic / ShipHologramScene / ShipHologramRenderer importują się');
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
const tick = () => Promise.resolve();
const settle = async () => { for (let i = 0; i < 40; i++) await tick(); };

// ── atrapy świata ──
function rec2d() {
  const c = { lines: 0, strokes: 0, draws: 0, globalAlpha: 1, globalCompositeOperation: 'source-over', strokeStyle: '', lineWidth: 1, fillStyle: '',
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() { c.lines++; }, stroke() { c.strokes++; }, clearRect() {}, closePath() {}, fill() { c.fills = (c.fills ?? 0) + 1; },
    drawImage() { c.draws++; }, fillText() {}, getTransform: () => ({ a: 1 }) };
  return c;
}
function fakeCanvas(w = 1, h = 1) {
  const ls = {};
  const ctx = rec2d();
  return { width: w, height: h, ctx, ls, getContext: () => ctx,
    addEventListener(t, f) { (ls[t] ??= []).push(f); }, removeEventListener(t, f) { ls[t] = (ls[t] ?? []).filter((x) => x !== f); },
    fire(t) { let prevented = false; for (const f of ls[t] ?? []) f({ preventDefault: () => { prevented = true; } }); return prevented; } };
}
function fakeGL(canvas, { onRender = null } = {}) {
  const ctx = { RGBA: 1, UNSIGNED_BYTE: 2, readPixels: () => { if (onRender) onRender('sync'); }, getExtension: () => null };
  return { canvas, renders: 0, disposed: 0, lost: 0, size: null, ctx, viewports: [], autoClear: true, clear() {}, setScissorTest() {}, setScissor() {},
    setViewport(x, y, w, h) { this.viewports.push([x, y, w, h]); },
    render() { this.renders++; if (onRender) onRender('render'); }, setSize(w, h) { this.size = [w, h]; },
    setPixelRatio() {}, setClearColor() {}, dispose() { this.disposed++; }, forceContextLoss() { this.lost++; }, getContext() { return ctx; } };
}
// Szablon «sceny głównej»: prawdziwe obiekty Three.js, materiał jak w GLB (MeshStandardMaterial), dwa poziomy węzłów.
function makeTemplate() {
  const root = new THREE.Group(); root.name = 'gltf_scene';
  const child = new THREE.Group(); child.position.set(0.2, 0.1, -0.3); child.rotation.set(0.1, 0.4, 0); child.scale.set(2, 2, 2);
  const g1 = new THREE.BoxGeometry(1, 0.3, 0.4), g2 = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 12);
  const m1 = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.5, metalness: 0.3 }), m2 = new THREE.MeshStandardMaterial({ color: 0x334455 });
  const a = new THREE.Mesh(g1, m1), b = new THREE.Mesh(g2, m2); b.position.set(-0.4, 0, 0);
  root.add(child); child.add(a); child.add(b);
  return { root, geoms: [g1, g2], mats: [m1, m2], nodes: [root, child, a, b] };
}
const snap = (t) => JSON.stringify({
  mats: t.mats.map((m) => ({ uuid: m.uuid, json: m.toJSON(), version: m.version })),
  geoms: t.geoms.map((g) => ({ uuid: g.uuid, attrs: Object.keys(g.attributes), pos: Array.from(g.attributes.position.array.slice(0, 24)),
    bb: g.boundingBox, version: g.attributes.position.version })),
  nodes: t.nodes.map((n) => ({ uuid: n.uuid, mw: Array.from(n.matrixWorld.elements), m: Array.from(n.matrix.elements), mat: n.material?.uuid ?? null,
    children: n.children.length, parent: n.parent?.uuid ?? null })),
});

// ═══ H1 klucz modelu ═══
console.log('\n── H1 klucz modelu projektu (D-K-10) ──');
{
  const bySlot = (t) => Object.values(SHIP_MODULES).filter((m) => m.slotType === t).map((m) => m.id);
  const hab = bySlot('habitat')[0], sci = bySlot('science')[0], cargo = bySlot('cargo')[0];
  assert(!!(hab && sci && cargo && SHIP_MODULES.warp_tank), `H1 świadkowie modułów: habitat ${hab}, science ${sci}, cargo ${cargo}, warp_tank`);
  const k = (h, m) => safe(() => L.designModelKey(h, m), null);
  assert(k('hull_frigate', []) === 'nonwarp_frigate' && k('hull_destroyer', []) === 'nonwarp_destroyer' && k('hull_cruiser', []) === 'nonwarp_battleship',
    'H1 kadłuby bojowe 1:1 (krążownik → battleship)');
  assert(k('hull_frigate', ['warp_tank']) === 'warp_frigate', 'H1 Komora Warp → oś warp');
  assert(k('hull_medium', []) === 'nonwarp_medium_cargo' && k('hull_medium', [cargo]) === 'nonwarp_medium_cargo', 'H1 cywilny bez roli → cargo');
  assert(k('hull_medium', [sci]) === 'nonwarp_medium_science' && k('hull_medium', [hab]) === 'nonwarp_medium_colony', 'H1 rola z modułów: science / colony');
  assert(k('hull_medium', [sci, hab]) === 'nonwarp_medium_colony', 'H1 priorytet colony > science');
  assert(k('hull_large', [hab, 'warp_tank']) === 'warp_large_colony' && k('hull_small', [sci, 'warp_tank']) === 'warp_small_science',
    'H1 podmiana na żywo: dołożenie habitatu / Komory zmienia klucz');
  assert(k('hull_medium', ['passenger_module']) === 'nonwarp_medium_colony', 'H1 moduł pasażerski → model colony (jak mapa)');
  const reach = new Set();
  for (const h of ['hull_small', 'hull_medium', 'hull_large', 'hull_frigate', 'hull_destroyer', 'hull_cruiser'])
    for (const m of [[], [sci], [hab]]) for (const w of [[], ['warp_tank']]) reach.add(k(h, [...m, ...w]));
  assert(reach.size === 24 && VESSEL_MODEL_KEYS.every((x) => reach.has(x)), `H1 wszystkie 24 klucze osiągalne z projektanta (${reach.size})`);
  const p1 = safe(() => L.modelLoadPaths('warp_frigate'), []), p2 = safe(() => L.modelLoadPaths('nonwarp_medium_cargo'), []);
  assert(p1[0] === 'assets/models/ships/warp_frigate@1k.glb' && p1[1] === 'assets/models/ships/warp_frigate.glb' && p1.at(-1) === 'assets/models/ships/default.glb'
    && p2.length === 2 && p2[0] === 'assets/models/ships/nonwarp_medium_cargo.glb', 'H1 ścieżki: bojowe @1k → 2K → default; cywilne 2K → default');
  let cur = 'nonwarp_small_science'; const seen = new Set([cur]);
  for (let i = 0; i < 24; i++) { cur = safe(() => L.cycleModelKey(cur, 1), cur); seen.add(cur); }
  assert(seen.size === 24 && safe(() => L.cycleModelKey('nonwarp_small_science', -1)) === 'warp_battleship', 'H1 next/prev obiegają 24 klucze');
}

// ═══ H2 scena główna nietknięta ═══
console.log('\n── H2 materiały i geometria sceny głównej nietknięte (wykonanie, Three.js r171) ──');
{
  const t1 = makeTemplate(), t2 = makeTemplate();
  // stan «po scenie głównej»: macierze świata policzone tak, jak zrobiłby to render mapy
  t1.root.updateMatrixWorld(true); t2.root.updateMatrixWorld(true);
  const disposeEvents = []; for (const t of [t1, t2]) for (const o of [...t.mats, ...t.geoms]) o.addEventListener('dispose', () => disposeEvents.push(o.uuid));
  const before1 = snap(t1), before2 = snap(t2);
  const templates = { a_key: t1.root, b_key: t2.root };
  let glRef = null; let clock = 0; let rendered = false;
  const r = R ? new R.ShipHologramRenderer({ THREE, createCanvas: fakeCanvas, createGL: (c) => (glRef = fakeGL(c)),
    loadTemplate: async (key) => ({ template: templates[key], path: `assets/models/ships/${key}.glb` }), loadFrame: async () => ({ bow: [-1, 0, 0], up: [0, 1, 0] }),
    getColor: () => '#ffb000', getEpoch: () => 1, now: () => (clock += 16), tuning: { ...L.HOLO_TUNING_DEFAULTS } }) : null;
  if (r) {
    r.setModel('a_key'); await settle();
    const ctx = rec2d();
    safe(() => r.draw(ctx, { x: 0, y: 0, w: 300, h: 200 }));
    r.tuning.edgeAngle = 65; safe(() => r.draw(ctx, { x: 0, y: 0, w: 300, h: 200 }));
    r.tuning.xray = 1; safe(() => r.draw(ctx, { x: 0, y: 0, w: 300, h: 200 }));
    r.setModel('b_key'); await settle(); safe(() => r.draw(ctx, { x: 0, y: 0, w: 300, h: 200 }));
    r.setMode('plan'); safe(() => r.draw(ctx, { x: 0, y: 0, w: 300, h: 200 }));
    r.setForcedFallback(true); safe(() => r.draw(ctx, { x: 0, y: 0, w: 300, h: 200 }));
    const m = r._models.get('a_key');
    const clones = m ? m.parts.flatMap((p) => [p.depth, p.holo]) : [];
    assert(clones.length === 4 && clones.every((c) => t1.geoms.includes(c.geometry)), 'H2 klony dzielą geometrię szablonu (4 siatki = 2 × głębia + hologram)');
    assert(clones.length > 0 && clones.every((c) => !t1.mats.includes(c.material)), 'H2 klony NIE dzielą materiału szablonu');
    rendered = !!(glRef && glRef.renders >= 3);
    assert(rendered, `H2 świadek: model renderowany (${glRef?.renders ?? 0} renderów atrapy)`);
    r.release();
  }
  assert(rendered && snap(t1) === before1 && snap(t2) === before2, 'H2 materiały (uuid, JSON, wersja), geometria i macierze węzłów szablonu bez zmian po użyciu i release');
  assert(rendered && disposeEvents.length === 0, `H2 zero zdarzeń dispose na materiałach / geometrii szablonu (${disposeEvents.length})`);
  // świadek mutacji: podmiana materiału na szablonie zmienia odcisk (pin umie być czerwony)
  const t3 = makeTemplate(); t3.root.updateMatrixWorld(true); const b3 = snap(t3); t3.nodes[2].material = new THREE.MeshBasicMaterial();
  assert(snap(t3) !== b3, 'H2 kontrola: odcisk wykrywa podmianę materiału');
}

// ═══ H3 fallback ═══
console.log('\n── H3 fallback (D-K-11) ──');
{
  const fs = (o) => safe(() => L.fallbackState(o), {});
  assert(fs({}).fallback === false && fs({}).reason === null, 'H3 bez przyczyn — hologram');
  assert(fs({ forced: true, contextLost: true, budgetTripped: true }).reason === 'forced' && fs({ contextFailed: true, contextLost: true }).reason === 'context_failed'
    && fs({ contextLost: true, budgetTripped: true }).reason === 'context_lost' && fs({ budgetTripped: true }).reason === 'budget', 'H3 priorytet przyczyn');
  assert(safe(() => L.budgetExceeded([9, 9, 9, 9, 9, 9, 9], 4)) === false && safe(() => L.budgetExceeded([9, 9, 9, 9, 9, 9, 9, 9], 4)) === true
    && safe(() => L.budgetExceeded([1, 1, 1, 1, 9, 9, 9, 9, 1], 4)) === false, 'H3 budżet: mediana, minimum 8 próbek');

  const mk = (extra = {}) => {
    const tpl = makeTemplate(); let clock = 0;
    const o = { THREE, createCanvas: fakeCanvas, loadTemplate: async () => ({ template: tpl.root, path: 'assets/models/ships/x_key.glb' }),
      loadFrame: async () => null, getColor: () => '#33ccff', getEpoch: () => 1, now: () => (clock += 1), tuning: { ...L.HOLO_TUNING_DEFAULTS }, ...extra };
    return o;
  };
  // (a) kontekst się nie tworzy
  if (R) {
    const r = new R.ShipHologramRenderer(mk({ createGL: () => { throw new Error('Error creating WebGL context.'); } }));
    r.setModel('x_key'); await settle();
    const ctx = rec2d(); let threw = false, res = null;
    try { res = r.draw(ctx, { x: 0, y: 0, w: 200, h: 120 }); } catch (e) { threw = true; }
    const sil = [...r._silCache.values()][0];
    assert(!threw && res?.fallback === true && r.info().reason === 'context_failed', 'H3 brak kontekstu → sylwetka, bez wyjątku');
    assert(!!sil && sil.ctx.lines > 0 && ctx.draws === 1, `H3 sylwetka narysowana Canvas 2D bez WebGL (${sil?.ctx.lines ?? 0} linii) i złożona w prostokąt`);
  }
  // (b) utrata kontekstu i powrót
  if (R) {
    let gl = null; const r = new R.ShipHologramRenderer(mk({ createGL: (c) => (gl = fakeGL(c)) }));
    r.setModel('x_key'); await settle(); const ctx = rec2d();
    r.draw(ctx, { x: 0, y: 0, w: 200, h: 120 });
    const prevented = gl?.canvas.fire('webglcontextlost');
    const n0 = gl?.renders ?? 0; let threw = false;
    try { r.draw(ctx, { x: 0, y: 0, w: 200, h: 120 }); } catch (e) { threw = true; }
    assert(prevented === true && r.info().reason === 'context_lost' && !threw && gl.renders === n0, 'H3 utrata kontekstu → preventDefault, sylwetka, brak renderu, bez wyjątku');
    gl.canvas.fire('webglcontextrestored');
    r.draw(ctx, { x: 0, y: 0, w: 200, h: 120 });
    assert(r.info().fallback === false && gl.renders === n0 + 1, 'H3 przywrócony kontekst → hologram wraca');
  }
  // (c) budżet: każdy synchroniczny odczyt «trwa» 6 ms > 4 ms
  if (R) {
    let clock = 0; let gl = null;
    const r = new R.ShipHologramRenderer(mk({ now: () => clock, createGL: (c) => (gl = fakeGL(c, { onRender: (w) => { if (w === 'sync') clock += 6; } })) }));
    r.setModel('x_key'); await settle(); const ctx = rec2d();
    let firstTrip = -1;
    for (let i = 0; i < 12; i++) { clock += 16; r.markDirty(); r.draw(ctx, { x: 0, y: 0, w: 200, h: 120 }); if (firstTrip < 0 && r.info().reason === 'budget') firstTrip = i + 1; }
    assert(firstTrip === 8 && r.info().gpuMsMedian === 6, `H3 mediana 6 ms > budżet 4 ms → sylwetka po 8. próbce (${firstTrip})`);
    const n0 = gl.renders; r.markDirty(); r.draw(ctx, { x: 0, y: 0, w: 200, h: 120 });
    assert(gl.renders === n0, 'H3 po przekroczeniu budżetu hologram nie renderuje');
    r.tuning.budgetMs = 50; clock += 16; r.draw(ctx, { x: 0, y: 0, w: 200, h: 120 });
    assert(r.info().fallback === false && gl.renders === n0 + 1, 'H3 zmiana pokrętła budżetu zeruje próbki i wraca do hologramu');
  }
  // (d) wymuszony
  if (R) {
    let gl = null; const r = new R.ShipHologramRenderer(mk({ createGL: (c) => (gl = fakeGL(c)) }));
    r.setModel('x_key'); await settle(); const ctx = rec2d();
    r.setForcedFallback(true); r.draw(ctx, { x: 0, y: 0, w: 200, h: 120 });
    assert(r.info().reason === 'forced' && gl === null, 'H3 wymuszona sylwetka — kontekst WebGL nawet nie tworzony');
    r.setForcedFallback(false); r.draw(ctx, { x: 0, y: 0, w: 200, h: 120 });
    assert(r.info().fallback === false && gl?.renders === 1, 'H3 zdjęcie wymuszenia → hologram');
  }
}

// ═══ H4 bezczynność ═══
console.log('\n── H4 bezczynność = brak renderów ──');
if (R) {
  const tpl = makeTemplate(); let clock = 0; let gl = null;
  const r = new R.ShipHologramRenderer({ THREE, createCanvas: fakeCanvas, createGL: (c) => (gl = fakeGL(c)),
    loadTemplate: async () => ({ template: tpl.root, path: 'assets/models/ships/x.glb' }), loadFrame: async () => null,
    getColor: () => '#ffffff', getEpoch: () => 1, now: () => clock, tuning: { ...L.HOLO_TUNING_DEFAULTS } });
  assert(safe(() => L.shouldRender({ visible: false, dirty: true, spinning: true, fading: true })) === false
    && safe(() => L.shouldRender({ visible: true })) === false && safe(() => L.shouldRender({ visible: true, spinning: true })) === true, 'H4 decyzja: ukryty nigdy; widoczny tylko przy zmianie / animacji');
  r.setModel('x'); await settle(); r.setSpin(false);
  const ctx = rec2d(); const rect = { x: 10, y: 10, w: 240, h: 160 };
  r.draw(ctx, rect); const n0 = gl.renders;
  for (let i = 0; i < 30; i++) { clock += 16; r.draw(ctx, rect); }
  assert(n0 === 1 && gl.renders === 1 && ctx.draws === 31 && r.isAnimating() === false, `H4 30 klatek bez zmian: 0 nowych renderów, tylko kompozycja (${gl.renders - n0} / ${ctx.draws})`);
  r.setSpin(true);
  for (let i = 0; i < 10; i++) { clock += 16; r.draw(ctx, rect); }
  assert(gl.renders === 11 && r.isAnimating() === true, `H4 obrót → render co klatkę (${gl.renders - 1} / 10)`);
  r.setMode('plan'); clock += 16; r.draw(ctx, rect); const n2 = gl.renders;
  for (let i = 0; i < 5; i++) { clock += 16; r.draw(ctx, rect); }
  assert(gl.renders === n2 && r.isAnimating() === false, 'H4 widok plan: bez obrotu, bez renderów w bezczynności');
  const n3 = gl.renders; clock += 5000;   // gospodarz ukryty — draw nie jest wołane
  assert(gl.renders === n3, 'H4 ukryty gospodarz: 0 pracy');
  r.release();
}

// ═══ H5 release ═══
console.log('\n── H5 release zwalnia kontekst ──');
if (R) {
  const tpl = makeTemplate(); const gls = [];
  const r = new R.ShipHologramRenderer({ THREE, createCanvas: fakeCanvas, createGL: (c) => { const g = fakeGL(c); gls.push(g); return g; },
    loadTemplate: async () => ({ template: tpl.root, path: 'assets/models/ships/x.glb' }), loadFrame: async () => null,
    getColor: () => '#ffffff', getEpoch: () => 1, tuning: { ...L.HOLO_TUNING_DEFAULTS } });
  r.setModel('x'); await settle(); r.draw(rec2d(), { x: 0, y: 0, w: 100, h: 80 });
  const g0 = gls[0];
  const lsBefore = (g0?.canvas.ls.webglcontextlost ?? []).length;
  r.release();
  assert(g0 && g0.disposed === 1 && g0.lost === 1, 'H5 dispose + forceContextLoss');
  assert(lsBefore === 1 && (g0.canvas.ls.webglcontextlost ?? []).length === 0 && (g0.canvas.ls.webglcontextrestored ?? []).length === 0, 'H5 słuchacze kontekstu zdjęci');
  assert(r.info().context === 'none' && r.info().model === null, 'H5 po release brak kontekstu i modelu');
  safe(() => r.release());
  r.setModel('x'); await settle(); r.draw(rec2d(), { x: 0, y: 0, w: 100, h: 80 });
  assert(gls.length === 2 && gls[1].renders === 1, 'H5 ponowne użycie tworzy nowy kontekst (leniwie)');
  r.release();
}

// ═══ H6 GLSL ═══
console.log('\n── H6 GLSL bez interpolacji i grawisów ──');
{
  const vs = S?.HOLO_VERT ?? '', fsrc = S?.HOLO_FRAG ?? '';
  assert(vs.includes('void main()') && fsrc.includes('void main()') && fsrc.includes('uniform vec3 uCol'), 'H6 świadek: łańcuchy shaderów istnieją');
  assert(vs.length > 0 && fsrc.length > 0 && ![vs, fsrc].some((s) => s.includes('`') || s.includes('${')), 'H6 łańcuchy (niepuste) bez grawisów i bez ${');
  const scene = safe(() => stripComments(src('../../renderer/ShipHologramScene.js')), '');
  const block = scene.slice(scene.indexOf('export const HOLO_VERT'), scene.indexOf('export function createHoloMaterials'));
  assert(block.length > 100 && !block.includes('`') && !/\+\s*[A-Za-z_$][\w$.]*\s*\+/.test(block.replace(/'[^']*'/g, "''")),
    'H6 źródło: stałe shaderów to wyłącznie literały w apostrofach sklejane plusem (bez zmiennych)');
  const m = safe(() => S.createHoloMaterials(THREE, '#ff8800'), null);
  assert(m && m.holo.vertexShader === vs && m.holo.fragmentShader === fsrc && m.holo.uniforms.uCol && m.holo.uniforms.uRim, 'H6 materiał używa stałych łańcuchów; wartości per obiekt tylko uniformami');
  const c0 = m ? m.holo.uniforms.uCol.value.getHexString(THREE.LinearSRGBColorSpace) : '';
  if (m) S.recolorHoloMaterials(THREE, m, '#00ff00');
  assert(c0 === 'ff8800' && m?.holo.uniforms.uCol.value.getHexString(THREE.LinearSRGBColorSpace) === '00ff00' && m?.holo.version === 0,
    'H6 zmiana motywu przemalowuje uniform (bez nowego programu)');
}

// ═══ H7 pokrętła, flaga, haki ═══
console.log('\n── H7 pokrętła, flaga, haki UIManagera ──');
{
  const t = { ...(L?.HOLO_TUNING_DEFAULTS ?? {}) };
  safe(() => L.tuneHologram({ edgeAngle: 200, edgeAlpha: -1, rim: 'x', bogus: 3, spin: 1.5 }, t));
  assert(t.edgeAngle === 89 && t.edgeAlpha === 0 && t.rim === L?.HOLO_TUNING_DEFAULTS?.rim && !('bogus' in t) && t.spin === 1.5, 'H7 pokrętła w klamrze, nie-liczby i obce klucze pominięte');
  assert(L?.HOLO_TUNING_DEFAULTS?.edgeAngle === 30 && L?.HOLO_TUNING_DEFAULTS?.budgetMs === 4 && L?.HOLO_TUNING_DEFAULTS?.xray === 0,
    'H7 domyślne po oglądaniu właściciela: próg 30°, budżet 4 ms, xray 0');
  assert(!('shipHologram' in GAME_CONFIG.FEATURES) && 'consoleKit' in GAME_CONFIG.FEATURES, 'H7 trwałość: klucza shipHologram nie ma w FEATURES (świadek: consoleKit jest)');
  const ui = stripComments(src('../../scenes/UIManager.js'));
  const pred = ui.slice(ui.indexOf('isConsoleSceneActive() {'), ui.indexOf('consoleSceneActive({', ui.indexOf('isConsoleSceneActive() {')));
  assert(/consoleKit !== true\) return false;\s*if \(this\._holoDebug\?\.isOpen === true\) return true;/.test(pred), 'H7 podgląd = scena konsoli (po fladze consoleKit)');
  assert(ui.includes('if (this._holoDebug?.isOpen) this._holoDebug.draw(ctx, W, H);') && ui.includes('|| (this._holoDebug?.isAnimating?.() ?? false)'), 'H7 rysunek i animacja podglądu w UIManager');
  const D = await tryImport('../../debug/ShipHologramDebug.js');
  const uiStub = { _dirty: false, _holoDebug: null };
  const h = D ? D.shipHologramDebugHelpers({ getUIManager: () => uiStub }).holo : null;
  const closed0 = h ? h.info() : null;
  const opened = safe(() => h.open(), null);
  const info1 = h ? h.info() : null;
  assert(closed0 === 'closed' && !!opened && typeof opened === 'object' && opened.mode === '3q' && info1?.open === true
    && uiStub._holoDebug?.isOpen === true && uiStub._dirty === true,
  'H7 trwałość: open() bez warunku flagi — tworzy podgląd, rejestruje go w UIManager (`_holoDebug`), prosi o klatkę');
  const closedMsg = h ? safe(() => h.close(), null) : null;
  assert(closedMsg === 'closed' && uiStub._holoDebug === null && h?.info()?.open === false, 'H7 close() zamyka podgląd i zdejmuje go z UIManagera');
  const dsrc = stripComments(src('../../debug/ShipHologramDebug.js'));
  assert(!/GAME_CONFIG|FEATURES/.test(dsrc) && /open: \(\) => \{/.test(dsrc), 'H7 ShipHologramDebug nie czyta FEATURES (świadek: open() w źródle)');
  const rect = safe(() => L.debugViewerRect(1280, 833), {});
  assert(rect.w === 900 && rect.h === 640 && rect.x === 190 && rect.y === 97, 'H7 prostokąt podglądu 900×640 wyśrodkowany');
}

// ═══ H8 rysunek techniczny (sylwetka i plan) ═══
console.log('\n── H8 rysunek techniczny: kadr z zasięgów modelu, plan = bok + góra ──');
{
  // szeroki model (burta ±0,35 — jak nonwarp_small_science): oba rzuty w swoich pasach
  const ext = { min: [-0.5, -0.12, -0.35], max: [0.5, 0.12, 0.35] };
  const lay = safe(() => L.technicalLayout(1125, 800, ext), null);
  const inR = (pt, r) => pt[0] >= r.x && pt[0] <= r.x + r.w && pt[1] >= r.y && pt[1] <= r.y + r.h;
  const corners = [];
  for (const x of [ext.min[0], ext.max[0]]) for (const y of [ext.min[1], ext.max[1]]) for (const z of [ext.min[2], ext.max[2]]) corners.push([x, y, z]);
  assert(!!lay && corners.every(([x, y]) => inR(lay.sideXY(x, y), lay.side)) && corners.every(([x, , z]) => inR(lay.topXZ(x, z), lay.top)),
    'H8 szeroka burta: rzut z boku w pasie boku, rzut z góry w pasie góry (dawny stały kadr wychodził z pasu)');
  const off = { min: [-0.3, 0.1, 0.05], max: [0.7, 0.3, 0.25] };
  const l2 = safe(() => L.technicalLayout(900, 640, off), null);
  const sm = l2 ? l2.sideXY(0.2, 0.2) : [0, 0], tm = l2 ? l2.topXZ(0.2, 0.15) : [0, 0];
  assert(!!l2 && Math.abs(sm[0] - 450) < 1e-6 && Math.abs(sm[1] - (l2.side.y + l2.side.h / 2)) < 1e-6 && Math.abs(tm[1] - (l2.top.y + l2.top.h / 2)) < 1e-6,
    'H8 każdy widok wyśrodkowany na swoim zasięgu (model poza środkiem układu)');
  const cs = safe(() => L.planViewCamera('side', lay), null), ct = safe(() => L.planViewCamera('top', lay), null);
  assert(!!(cs && ct && cs.up[1] === 1 && cs.pos[2] > 0 && ct.up[2] === -1 && ct.pos[1] > 0 && Math.abs(ct.halfW * 2 * lay.scale - lay.top.w) < 1e-6),
    'H8 kamery planu: bok z +Z (góra +Y), góra z +Y (góra ekranu −Z — burta +Z w dół jak sylwetka), skala = skala układu');
  if (R) {
    const tpl = makeTemplate(); let gl = null; let clock = 0;
    const r = new R.ShipHologramRenderer({ THREE, createCanvas: fakeCanvas, createGL: (c) => (gl = fakeGL(c)),
      loadTemplate: async () => ({ template: tpl.root, path: 'assets/models/ships/x.glb' }), loadFrame: async () => null,
      getColor: () => '#ffffff', getEpoch: () => 1, now: () => (clock += 16), tuning: { ...L.HOLO_TUNING_DEFAULTS } });
    r.setModel('x'); await settle(); r.setMode('plan');
    r.draw(rec2d(), { x: 0, y: 0, w: 300, h: 200 });
    const vps = gl?.viewports ?? [];
    assert(gl?.renders === 2 && vps.length === 3 && vps[0][1] > vps[1][1] && vps[2][2] === 300,
      `H8 plan = 2 rendery (bok wyżej na ekranie = większe y od dołu, potem góra), viewport przywrócony (${gl?.renders})`);
    const m = r._models.get('x');
    assert(!!m?.extent && m.extent.max[0] > m.extent.min[0] && m.extent.max[2] > m.extent.min[2], 'H8 model niesie zasięg w ramie wyświetlania');
    r.setForcedFallback(true); r.draw(rec2d(), { x: 0, y: 0, w: 300, h: 200 });
    const sil = [...r._silCache.values()][0];
    assert(!!sil && sil.ctx.draws >= 2 && sil.ctx.lines > 0, 'H8 sylwetka: maska wypełnienia i kontur złożone obrazami + krawędzie');
    r.release();
  }
  // Obieg: zamknięta bryła (sześcian — ściany przednie i tylne) → w rzucie każdy trójkąt maski ma ten sam znak pola
  // (przy regule nonzero przeciwne obiegi się znoszą — pomiar K1a: maska medium cargo 965 px zamiast kadłuba).
  if (S) {
    const box = new THREE.BoxGeometry(1, 0.4, 0.6).toNonIndexed();
    const tri = Float32Array.from(box.attributes.position.array);
    const canv = [];
    const mk = (w, h) => { const pts = []; const c = { width: w, height: h, pts, ctx: null };
      c.ctx = { ...rec2d(), moveTo(x, y) { pts.push(['M', x, y]); }, lineTo(x, y) { pts.push(['L', x, y]); }, closePath() {}, fill() {} };
      c.getContext = () => c.ctx; canv.push(c); return c; };
    const lay2 = L.technicalLayout(600, 400, { min: [-0.5, -0.2, -0.3], max: [0.5, 0.2, 0.3] });
    safe(() => S.drawSilhouette(rec2d(), new Float32Array(0), lay2, { color: '#fff', triangles: tri, createCanvas: mk, w: 600, h: 400 }));
    const pts = canv[0]?.pts ?? []; const areas = [];
    for (let i = 0; i + 2 < pts.length; i++) if (pts[i][0] === 'M') { const [a, b, c] = [pts[i], pts[i + 1], pts[i + 2]];
      areas.push((b[1] - a[1]) * (c[2] - a[2]) - (c[1] - a[1]) * (b[2] - a[2])); }
    const nonZero = areas.filter((x) => Math.abs(x) > 1e-9);
    assert(nonZero.length >= 8 && (nonZero.every((x) => x > 0) || nonZero.every((x) => x < 0)),
      `H8 maska: wszystkie trójkąty rzutu w jednym obiegu (${nonZero.length} niezerowych z ${areas.length})`);
  }
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
