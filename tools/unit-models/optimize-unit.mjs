#!/usr/bin/env node
// optimize-unit — odchudzanie ciężkich modeli jednostek naziemnych (ARC COLONY SPHERE, krok CS-10; plan §3.19).
// Narzędzie deweloperskie — gra go nie importuje.
//
// UŻYCIE:
//   node tools/unit-models/optimize-unit.mjs --report                 raport wszystkich GLB w assets/units/ground (nic nie zapisuje)
//   node tools/unit-models/optimize-unit.mjs <plik.glb> [--dry]        odchudź jeden model w miejscu (oryginał → _originals/)
//   node tools/unit-models/optimize-unit.mjs --over-budget [--dry]     odchudź każdy model ponad budżet rozmiaru
// Opcje: --tris N (cel trójkątów, domyślnie 30000 — tyle mają pozostałe modele jednostek) · --error E (limit błędu
//   upraszczania jako ułamek rozmiaru siatki, domyślnie 0.01) · --tex N (maks. bok tekstury, domyślnie 512) ·
//   --meshopt <katalog> (tylko nadpisanie: inny katalog z node_modules/meshoptimizer; domyślnie pakiet z devDependencies repo —
//   `npm i` go instaluje, D-CS-30 pkt 7)
//
// CO ROBI: dedup → weld → simplify (meshoptimizer) → prune → tekstury większe niż limit zmniejsza (sharp) → zapis GLB.
// Wyjście BEZ Draco / meshopt / KTX2 — loader gry nie ma dekoderów (ta sama zasada co `tools/ship-models`).
// Oryginał trafia do `assets/units/ground/_originals/<frakcja>__<nazwa>__<data>.glb` (poza ścieżką gry, poza git).
//
// ⚠ Zapis plików w assets/ przeładowuje kartę gry otwartą przez Live Server — zamknij grę przed uruchomieniem.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { UNIT_GLB_BUDGET } from '../../src/renderer/ColonyUnitLogic.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const UNITS = path.join(ROOT, 'assets/units/ground');
const ORIGINALS = path.join(UNITS, '_originals');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] != null ? args[i + 1] : def; };
const TARGET_TRIS = Number(opt('--tris', UNIT_GLB_BUDGET.targetTriangles));
const MAX_ERROR = Number(opt('--error', 0.01));
const MAX_TEX = Number(opt('--tex', UNIT_GLB_BUDGET.maxTexturePx));
const DRY = flag('--dry');
const mb = (bytes) => `${(bytes / 1048576).toFixed(2)} MB`;

function listGlbs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('_')) continue;   // _originals i inne archiwa — poza ścieżką gry
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listGlbs(p));
    else if (/\.glb$/i.test(e.name)) out.push(p);
  }
  return out.sort();
}

function statsOf(doc) {
  const r = doc.getRoot();
  let tris = 0, verts = 0;
  for (const m of r.listMeshes()) for (const p of m.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), idx = p.getIndices();
    verts += pos?.getCount() ?? 0;
    tris += (idx ? idx.getCount() : (pos?.getCount() ?? 0)) / 3;
  }
  const tex = r.listTextures().map(t => (t.getSize() ?? [0, 0]));
  return { tris: Math.round(tris), verts, maxTex: tex.reduce((m, s) => Math.max(m, s[0], s[1]), 0), textures: tex.length };
}

async function loadSimplifier() {
  const dir = opt('--meshopt', null);
  const tries = dir ? [pathToFileURL(path.join(path.resolve(dir), 'node_modules/meshoptimizer/index.js')).href] : ['meshoptimizer'];
  for (const spec of tries) {
    try { const m = await import(spec); await m.MeshoptSimplifier.ready; return m.MeshoptSimplifier; } catch (_) { /* następna próba */ }
  }
  throw new Error('meshoptimizer not found — it is a devDependency: run `npm i` in the repo (or pass --meshopt <dir with node_modules/meshoptimizer>)');
}

const { NodeIO } = await import('@gltf-transform/core');
const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function report() {
  let total = 0, over = 0;
  console.log(`Unit GLBs in assets/units/ground (budget ${mb(UNIT_GLB_BUDGET.maxBytes)} per file, ${UNIT_GLB_BUDGET.maxTriangles} triangles):`);
  for (const f of listGlbs(UNITS)) {
    const size = fs.statSync(f).size; total += size;
    const s = statsOf(await io.read(f));
    const bad = size > UNIT_GLB_BUDGET.maxBytes || s.tris > UNIT_GLB_BUDGET.maxTriangles;
    if (bad) over++;
    console.log(`  ${bad ? 'OVER' : 'ok  '} ${mb(size).padStart(9)} ${String(s.tris).padStart(8)} tris ${String(s.verts).padStart(7)} verts tex ${s.textures}×≤${s.maxTex}  ${path.relative(ROOT, f).replace(/\\/g, '/')}`);
  }
  console.log(`  total ${mb(total)}, over budget: ${over}`);
  return over;
}

async function optimize(file) {
  const abs = path.resolve(file);
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  const before = fs.statSync(abs).size;
  const doc = await io.read(abs);
  const s0 = statsOf(doc);
  const { dedup, weld, simplify, prune, textureCompress } = await import('@gltf-transform/functions');
  const steps = [dedup(), weld()];
  if (s0.tris > TARGET_TRIS * 1.05) {
    const simplifier = await loadSimplifier();
    steps.push(simplify({ simplifier, ratio: TARGET_TRIS / s0.tris, error: MAX_ERROR, lockBorder: false }));
  }
  steps.push(prune());
  await doc.transform(...steps);
  if (s0.maxTex > MAX_TEX) {
    const sharp = (await import('sharp')).default;
    await doc.transform(textureCompress({ encoder: sharp, resize: [MAX_TEX, MAX_TEX] }));
  }
  const s1 = statsOf(doc);
  const bytes = await io.writeBinary(doc);
  console.log(`${rel}\n  before ${mb(before)} · ${s0.tris} tris · ${s0.verts} verts · tex ≤${s0.maxTex}\n  after  ${mb(bytes.byteLength)} · ${s1.tris} tris · ${s1.verts} verts · tex ≤${s1.maxTex}`);
  if (DRY) { console.log('  --dry: nothing written'); return; }
  fs.mkdirSync(ORIGINALS, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const keep = path.join(ORIGINALS, `${path.basename(path.dirname(abs))}__${path.basename(abs, '.glb')}__${stamp}.glb`);
  if (!fs.existsSync(keep)) fs.copyFileSync(abs, keep);
  fs.writeFileSync(abs, bytes);
  console.log(`  original kept at ${path.relative(ROOT, keep).replace(/\\/g, '/')}`);
}

if (flag('--report')) {
  await report();
} else if (flag('--over-budget')) {
  for (const f of listGlbs(UNITS)) if (fs.statSync(f).size > UNIT_GLB_BUDGET.maxBytes) await optimize(f);
} else {
  const file = args.find(a => /\.glb$/i.test(a));
  if (!file) { console.error('usage: optimize-unit.mjs --report | <file.glb> [--dry] | --over-budget [--dry]'); process.exit(1); }
  await optimize(file);
}
