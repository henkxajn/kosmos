#!/usr/bin/env node
// normalize-ship — normalizator modeli statków (ARC COMBAT VISUALS, krok CV-1b; plan `docs/design/COMBAT_VISUALS_PLAN.md`
// §2.11, §3 D-CV-13 / 14 / 15, warunek §3.1-4). Narzędzie deweloperskie — gra go nie importuje (żadnej flagi w grze).
//
// UŻYCIE (właściciel nie potrzebuje terminala — wystarczy przeciągnąć plik GLB na `normalize-ship.bat`):
//   node tools/ship-models/normalize-ship.mjs <slot>            model z assets/models/ships/incoming/<slot>.glb → slot gry
//   node tools/ship-models/normalize-ship.mjs --from <plik.glb>  kopiuje plik do incoming/ (slot z nazwy pliku albo pytanie)
//   node tools/ship-models/normalize-ship.mjs --podglad <slot>   tylko hardpointy kandydata w incoming/ (podgląd w grze:
//                                                               `await KOSMOS.debug.cvIncoming(1)`), slot bez zmian
//   node tools/ship-models/normalize-ship.mjs --legacy [slot…]   jednorazowo: kompresja tekstur starych modeli (geometria bez zmian)
//   npm run ship -- <slot>                                     to samo co pierwsza linia
// Opcje: --dry (nic nie zapisuje, tylko raport) · --no-1k (bez wariantu 1K)
//
// CO ROBI z modelem (kolejność z planu §2.11): czyta incoming/<slot>.glb → raport „przed" → wypieka transformacje węzłów →
// scala identyczne wierzchołki / duplikaty / nieużywane → centruje → skaluje (najdłuższy wymiar 1,0) → obraca (najdłuższa oś
// na X, dziób na −X — zgadnięty z gęstości wierzchołków w ostatnich 8 % długości albo z hardpointów, jeśli są) → tekstury
// (lib/textures.mjs) → archiwizuje stary slot w assets/models/ships/_archive/ (poza git) → zapisuje <slot>.glb (2K) i
// <slot>@1k.glb (presety Medium / Low — CV-2b) → tworzy albo SCALA hardpoints/<slot>.json (lib/hardpoints.mjs) → raport PL
// (konsola + incoming/<slot>.report.txt). Wyjście bez Draco / meshopt / KTX2 — loader gry nie ma dekoderów.
//
// ⚠ Zapis plików w assets/ przeładowuje kartę gry otwartą przez Live Server — zamknij grę przed uruchomieniem.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';

import * as G from './lib/geometry.mjs';
import { rasterizeUvCoverage, coveredCount } from './lib/uv.mjs';
import { keyColourStats, hullLuma } from './lib/texstats.mjs';
import { planTexture, acceptEncoded, roleOfSlot, mimeOf } from './lib/textures.mjs';
import { NORMALIZER_ID, LEGACY_PASS_ID, rotateHardpoints, measuredHardpoints, pickCarried, mergeHardpoints, withSource, removeFromIndex, formatHardpointsJson } from './lib/hardpoints.mjs';
import { SHIP_SLOTS, isShipSlot, slotFromFileName, suggestSlots } from './lib/slots.mjs';
import { formatReport, fmtSize } from './lib/report.mjs';
import { validateHardpoints, KEY_COLOUR_DEFAULTS } from '../../src/data/ShipHardpointsSchema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHIPS = path.join(ROOT, 'assets/models/ships');
const INCOMING = path.join(SHIPS, 'incoming');
const HP_DIR = path.join(SHIPS, 'hardpoints');
const HP_INCOMING = path.join(HP_DIR, 'incoming');
const ARCHIVE = path.join(SHIPS, '_archive');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// ── zależności (sharp + glTF-Transform — devDependencies w package.json; D-CV-13) ─────────────────────────────────────────
async function loadDeps() {
  try {
    const core = await import('@gltf-transform/core');
    const ext = await import('@gltf-transform/extensions');
    const fn = await import('@gltf-transform/functions');
    const sharp = (await import('sharp')).default;
    return { core, ext, fn, sharp };
  } catch (e) {
    console.error('\n✖ Brak bibliotek normalizatora (sharp, glTF-Transform).');
    console.error('  W folderze gry uruchom raz:  npm ci   — albo poproś Claude o instalację.');
    console.error('  (Stub `three` dla testów jest w git — `src/testing/fixtures/three-stub` — i `npm ci` odtwarza go sam, Finding 683.)');
    console.error(`  (szczegóły: ${e.message})\n`);
    process.exit(2);
  }
}

function parseArgs(argv) {
  const a = { slot: null, from: null, legacy: false, podglad: false, dry: false, no1k: false, help: false, slots: [] };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (s === '--from') a.from = argv[++i];
    else if (s === '--legacy') a.legacy = true;
    else if (s === '--podglad' || s === '--preview') a.podglad = true;
    else if (s === '--dry') a.dry = true;
    else if (s === '--no-1k') a.no1k = true;
    else if (s === '--help' || s === '-h') a.help = true;
    else if (s.startsWith('--')) throw new Error(`nieznana opcja ${s}`);
    else a.slots.push(s);
  }
  a.slot = a.slots[0] ?? null;
  return a;
}

const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
const when = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const INDEX_NOTES = 'Sloty z hardpointami dla kandydatów w assets/models/ships/incoming/ (pliki GLB poza git). Podgląd w grze: await KOSMOS.debug.cvIncoming(1). Wpis dodaje normalize-ship --podglad <slot>, zdejmuje podmiana slotu (normalize-ship <slot>).';
const readJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);

// ── glTF: zebranie siatki, role tekstur ───────────────────────────────────────────────────────────────────────────────────

/** Role tekstur dokumentu (pierwszeństwo: kolor bazowy > normalne > MR / okluzja > emisja). */
function textureRoles(doc) {
  const rank = { baseColor: 0, normal: 1, metallicRoughness: 2, occlusion: 3, emissive: 4, other: 5 };
  const roles = new Map();
  for (const mat of doc.getRoot().listMaterials()) {
    for (const [slotName, tex] of [['baseColorTexture', mat.getBaseColorTexture()], ['normalTexture', mat.getNormalTexture()], ['metallicRoughnessTexture', mat.getMetallicRoughnessTexture()], ['occlusionTexture', mat.getOcclusionTexture()], ['emissiveTexture', mat.getEmissiveTexture()]]) {
      if (!tex) continue;
      const role = roleOfSlot(slotName), have = roles.get(tex);
      if (!have || rank[role] < rank[have]) roles.set(tex, role);
    }
  }
  for (const tex of doc.getRoot().listTextures()) if (!roles.has(tex)) roles.set(tex, 'other');
  return roles;
}

function meshFacts(doc) {
  let verts = 0, tris = 0, primitives = 0;
  const meshes = doc.getRoot().listMeshes();
  for (const m of meshes) for (const p of m.listPrimitives()) {
    primitives++;
    const n = p.getAttribute('POSITION')?.getCount() ?? 0;
    verts += n;
    tris += (p.getIndices()?.getCount() ?? n) / 3;
  }
  return { verts, tris: Math.round(tris), meshes: meshes.length, primitives, materials: doc.getRoot().listMaterials().length };
}

/** Wszystkie pozycje (po wypieczeniu węzłów — przestrzeń siatki = świat sceny) jako jedna płaska tablica. */
function allPositions(doc) {
  const parts = [];
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const a = p.getAttribute('POSITION'); if (a) parts.push(a.getArray()); }
  const n = parts.reduce((s, a) => s + a.length, 0), out = new Float64Array(n);
  let o = 0; for (const a of parts) { out.set(a, o); o += a.length; }
  return out;
}

/** Wypieczenie transformacji węzłów w wierzchołki (gra liczy bbox ze sceny z transformacjami — tu robimy to raz, na stałe). */
function bakeNodeTransforms(doc, fn) {
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh()) continue;
    const users = node.getMesh().listParents().filter((p) => p.propertyType === 'Node');
    if (users.length > 1) node.setMesh(node.getMesh().clone());   // siatka współdzielona przez kilka węzłów — każdy dostaje własną kopię
  }
}

const isIdentity = (m) => m.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-12);

async function normalizeGeometry(doc, deps) {
  const { fn } = deps;
  // flatten — wszystkie węzły pod korzeń sceny z zachowaniem transformacji świata; potem wypieczenie macierzy w siatkę.
  bakeNodeTransforms(doc, fn);
  await doc.transform(fn.flatten());
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    const wm = node.getWorldMatrix();
    if (mesh && !isIdentity(wm)) fn.transformMesh(mesh, wm);
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
  await doc.transform(fn.weld(), fn.dedup(), fn.prune());
}

// ── tekstury ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function texMeta(sharp, bytes, mime) {
  const m = await sharp(Buffer.from(bytes)).metadata();
  return { mime, width: m.width, height: m.height, bytes: bytes.byteLength };
}

async function encodeWithPlan(sharp, bytes, plan) {
  let s = sharp(Buffer.from(bytes), { limitInputPixels: false });
  if (plan.resize) s = s.resize(plan.resize, plan.resize, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: true });
  const e = plan.enc;
  if (e.format === 'webp') s = s.webp({ quality: e.quality ?? 90, lossless: !!e.lossless, nearLossless: !!e.nearLossless, smartSubsample: !!e.smartSubsample, effort: 6 });
  else if (e.format === 'jpeg') s = s.jpeg({ quality: e.quality ?? 95, chromaSubsampling: '4:4:4', mozjpeg: true });
  else s = s.png({ compressionLevel: 9 });
  const { data, info } = await s.toBuffer({ resolveWithObject: true });
  return { bytes: new Uint8Array(data), mime: mimeOf(e.format), width: info.width, height: info.height };
}

/**
 * Tekstury dokumentu wg planu dla wariantu; `originals` = bajty źródłowe (wariant 1K koduje się ZE ŹRÓDŁA, nie z mastera 2K).
 * @returns {Promise<Map<string, {role, before, after}>>} wiersze raportu wg roli
 */
async function applyTexturePlan(doc, deps, target, originals) {
  const { sharp, ext } = deps;
  const roles = textureRoles(doc);
  const rows = new Map();
  const all = [];
  let webp = false;
  const texList = doc.getRoot().listTextures();
  for (let i = 0; i < texList.length; i++) {
    const tex = texList[i];
    const src = originals ? originals[i] : { bytes: tex.getImage(), mime: tex.getMimeType() };
    if (originals) tex.setImage(src.bytes).setMimeType(src.mime);
    const role = roles.get(tex) ?? 'other';
    const before = await texMeta(sharp, src.bytes, src.mime);
    const plan = planTexture({ role, mime: before.mime, width: before.width, height: before.height }, target);
    let after = { ...before, note: plan.why.startsWith('JPEG') ? 'bajty bez zmian' : 'bez zmian' };
    let changed = false;
    if (plan.action === 'encode') {
      const out = await encodeWithPlan(sharp, src.bytes, plan);
      if (acceptEncoded(plan, before.bytes, out.bytes.byteLength)) {
        tex.setImage(out.bytes).setMimeType(out.mime);
        after = { mime: out.mime, width: out.width, height: out.height, bytes: out.bytes.byteLength, note: plan.why };
        changed = true;
      } else after = { ...before, note: 'bez zmian — kompresja nie zmniejszała' };
    }
    if (tex.getMimeType() === 'image/webp') webp = true;
    const row = { role, before, after, changed };
    all.push(row);
    if (!rows.has(role)) rows.set(role, row);
  }
  rows.all = all;
  // EXT_texture_webp: deklaracja tylko, gdy w pliku jest WebP (GLTFLoader r171 ją obsługuje — §3.1-4).
  const have = doc.getRoot().listExtensionsUsed().find((x) => x.extensionName === 'EXT_texture_webp');
  if (webp) doc.createExtension(ext.EXTTextureWebP).setRequired(true);
  else if (have) have.dispose();
  return rows;
}

// ── statystyki powierzchni (raport) ───────────────────────────────────────────────────────────────────────────────────────

async function surfaceStats(doc, deps) {
  const { sharp } = deps;
  const mat = doc.getRoot().listMaterials().find((m) => m.getBaseColorTexture());
  if (!mat) return { uvCoveragePct: 0, cyan: null, hull: null };
  const tex = mat.getBaseColorTexture();
  const { data, info } = await sharp(Buffer.from(tex.getImage())).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  let mask = new Uint8Array(W * H);
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    if (p.getMaterial()?.getBaseColorTexture() !== tex) continue;
    const uv = p.getAttribute('TEXCOORD_0'); if (!uv) continue;
    const part = rasterizeUvCoverage(uv.getArray(), p.getIndices()?.getArray() ?? null, W, H);
    for (let i = 0; i < mask.length; i++) mask[i] |= part[i];
  }
  const kc = { ...KEY_COLOUR_DEFAULTS, mode: 'mask' };
  const ks = keyColourStats(data, info.channels, mask, kc);
  const hl = hullLuma(data, info.channels, mask);
  return { uvCoveragePct: (100 * coveredCount(mask)) / (W * H), cyan: { pctOfCovered: ks.pctOfCovered, pctOfTexture: ks.pctOfTexture }, hull: { meanLuma: hl.meanLuma, darkPct: hl.nearBlackPct } };
}

// ── zapis ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function archiveFile(src, name) {
  const dst = path.join(ARCHIVE, name);
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
  return dst;
}
function writeJson(p, doc) { fs.writeFileSync(p, typeof doc === 'string' ? doc : formatHardpointsJson(doc)); }

// ── tryb główny: incoming/<slot>.glb → slot gry ───────────────────────────────────────────────────────────────────────────

async function normalizeSlot(slot, deps, opts) {
  const { core, ext } = deps;
  const inputPath = path.join(INCOMING, slot + '.glb');
  if (!fs.existsSync(inputPath)) throw new Error(`brak pliku ${rel(inputPath)} — wrzuć model do incoming/ albo przeciągnij go na normalize-ship.bat`);
  const io = new core.NodeIO().registerExtensions(ext.ALL_EXTENSIONS);
  const rawBytes = fs.readFileSync(inputPath);
  const input = { file: 'incoming/' + slot + '.glb', bytes: rawBytes.length, sha256: sha256(rawBytes) };
  const doc = await io.readBinary(new Uint8Array(rawBytes));
  const before = meshFacts(doc);
  input.verts = before.verts; input.tris = before.tris;

  await normalizeGeometry(doc, deps);
  const welded = meshFacts(doc);
  // bajty źródłowe tekstur PO dedup / prune (lista tekstur może się skrócić) — wariant 1K koduje się z nich, nie z mastera 2K
  const texBefore = doc.getRoot().listTextures().map((t) => ({ bytes: t.getImage().slice(), mime: t.getMimeType() }));

  // dziób i obrót: z przeniesionych hardpointów (ten sam model) albo ze zgadnięcia
  const incomingDoc = readJson(path.join(HP_INCOMING, slot + '.json'));
  const slotDocPath = path.join(HP_DIR, slot + '.json');
  const slotDoc = readJson(slotDocPath);
  const carried = pickCarried({ incomingDoc, slotDoc, input });
  const pos = allPositions(doc);
  const bb = G.bboxOf(pos);
  const L = G.longestAxisOf(bb);
  const guess = G.guessBow(pos, L, { bb });
  let R, orientWarnings = [], bowInfo;
  if (carried.from === 'slot' && Array.isArray(carried.doc.source?.input?.rotation)) {
    R = carried.doc.source.input.rotation;   // ta sama przestrzeń wyjściowa co poprzednio — punkty bez przeliczeń
    bowInfo = { side: '−X (jak w poprzedniej normalizacji)', source: 'obrót zapisany przy poprzedniej normalizacji', confident: true };
  } else {
    let bowAxis = L, bowSign = guess.sign, upAxis = 1, upSign = 1, source;
    if (carried.from === 'incoming') {
      const b = G.dominantAxis(carried.doc.frame.bow), u = G.dominantAxis(carried.doc.frame.up);
      bowAxis = b.axis; bowSign = b.sign; upAxis = u.axis; upSign = u.sign;
      source = `z hardpointów incoming/ (zgadnięcie z gęstości: ${guess.sign === bowSign && L === bowAxis ? 'zgodne' : 'INNE — wygrywa plik'})`;
    } else {
      source = `gęstość wierzchołków w ostatnich 8 % długości: ${guess.sign < 0 ? `${guess.atMin} z przodu, ${guess.atMax} z tyłu` : `${guess.atMax} z przodu, ${guess.atMin} z tyłu`}`;
    }
    const o = G.orientationFor({ bowAxis, bowSign, upAxis, upSign });
    R = o.R;
    if (o.warnings.includes('up_was_bow_axis')) orientWarnings.push('model stał „pionowo" (najdłuższa oś = góra) — sprawdź w Workshopie, gdzie jest góra');
    const confident = carried.from === 'incoming' || guess.confident;
    bowInfo = { side: `${bowSign < 0 ? '−' : '+'}${G.axisName(bowAxis)} w pliku → −X po normalizacji`, source, confident };
  }
  const M = G.normalizationMatrix(bb, R);
  for (const mesh of doc.getRoot().listMeshes()) deps.fn.transformMesh(mesh, M);
  const outPos = allPositions(doc);
  const nozzle = G.measureNozzle(outPos);

  doc.getRoot().getAsset().generator = `KOSMOS ${NORMALIZER_ID} (glTF-Transform ${core.VERSION})`;

  // tekstury: master 2K, potem wariant 1K ze źródeł
  const rows2k = await applyTexturePlan(doc, deps, '2k', null);
  const out2k = await io.writeBinary(doc);
  let out1k = null, rows1k = null;
  if (!opts.no1k) {
    const d1 = deps.fn.cloneDocument(doc);
    rows1k = await applyTexturePlan(d1, deps, '1k', texBefore);
    out1k = await io.writeBinary(d1);
  }
  const surf = await surfaceStats(doc, deps);

  // hardpointy: pomiar + przeniesienie + źródło
  const measured = measuredHardpoints({ slot, nozzle, keyMode: 'mask' });
  const carriedDoc = carried.from === 'incoming' ? rotateHardpoints(carried.doc, R) : carried.from === 'slot' ? carried.doc : null;
  const { doc: merged, kept } = mergeHardpoints(measured, carriedDoc);
  const hp = withSource(merged, { file: slot + '.glb', sha256: sha256(out2k), input });
  hp.source.input.rotation = R.map((r) => r.slice());
  // notatka pochodzenia: przy ponownej normalizacji tego samego modelu zostaje (punkty mają to samo pochodzenie)
  hp.notes = carried.from === 'slot' && typeof carried.doc.notes === 'string' ? carried.doc.notes
    : `${NORMALIZER_ID} (${when()}): model właściciela w slocie; ${carried.from === 'incoming' ? 'dziób, dysza i maska przeniesione z hardpoints/incoming/ (pomiar CV-1a / Workshop)' : 'dziób i dysza z pomiaru normalizatora'}. Wieżyczki i światła klika Model Workshop (CV-1c).`;
  const v = validateHardpoints(hp);
  if (!v.ok) throw new Error('plik hardpointów niepoprawny — nic nie zapisano: ' + v.errors.join('; '));

  // zapis (najpierw archiwum)
  const written = [], archived = [];
  const slotGlb = path.join(SHIPS, slot + '.glb');
  const slot1k = path.join(SHIPS, slot + '@1k.glb');
  const st = stamp();
  if (!opts.dry) {
    if (fs.existsSync(slotGlb)) archived.push(rel(archiveFile(slotGlb, `${slot}__${st}.glb`)));
    if (fs.existsSync(slot1k)) archived.push(rel(archiveFile(slot1k, `${slot}@1k__${st}.glb`)));
    if (slotDoc) archived.push(rel(archiveFile(slotDocPath, `${slot}__${st}.json`)));
    const incHp = path.join(HP_INCOMING, slot + '.json');
    if (fs.existsSync(incHp)) archived.push(rel(archiveFile(incHp, `${slot}__${st}.incoming.json`)));
    fs.writeFileSync(slotGlb, out2k); written.push(rel(slotGlb));
    if (out1k) { fs.writeFileSync(slot1k, out1k); written.push(rel(slot1k)); }
    writeJson(slotDocPath, hp); written.push(rel(slotDocPath));
    if (fs.existsSync(incHp)) fs.rmSync(incHp);
    const idxPath = path.join(HP_INCOMING, 'index.json');
    const idx = readJson(idxPath);
    if (idx && Array.isArray(idx.slots) && idx.slots.includes(slot)) { writeJson(idxPath, JSON.stringify(removeFromIndex(idx, slot), null, 2) + '\n'); written.push(rel(idxPath) + ' (wpis zdjęty)'); }
  } else {
    written.push(rel(slotGlb), ...(out1k ? [rel(slot1k)] : []), rel(slotDocPath));
  }

  const textures = {};
  for (const [role, row] of rows2k) textures[role] = { before: row.before, after2k: row.after, after1k: rows1k?.get(role)?.after ?? null };
  const facts = {
    slot, when: when(), dry: !!opts.dry, input,
    tris: before.tris, verts: before.verts, vertsWelded: welded.verts,
    meshes: before.meshes, primitives: before.primitives, materials: before.materials,
    rawExtent: G.extentOf(bb), longestAxis: G.axisName(L),
    orientation: { rotated: !R.every((r, i) => r.every((x, j) => x === (i === j ? 1 : 0))), warnings: orientWarnings },
    bow: bowInfo, nozzle: { p: hp.nozzles[0].p, r: hp.nozzles[0].r },
    uvCoveragePct: surf.uvCoveragePct, cyan: surf.cyan, hull: surf.hull, textures,
    sizes: { before: rawBytes.length, out2k: out2k.byteLength, out1k: out1k?.byteLength ?? 0 },
    hardpoints: { path: rel(slotDocPath), from: carried.from, why: carried.why, kept },
    written, archived,
  };
  const text = formatReport(facts);
  if (!opts.dry) fs.writeFileSync(path.join(INCOMING, slot + '.report.txt'), text);
  return { text, facts, hp };
}

// ── tryb podglądu: hardpointy kandydata w incoming/ (bez podmiany slotu) ──────────────────────────────────────────────────

async function previewSlot(slot, deps, opts) {
  const { core, ext } = deps;
  const inputPath = path.join(INCOMING, slot + '.glb');
  if (!fs.existsSync(inputPath)) throw new Error(`brak pliku ${rel(inputPath)}`);
  const io = new core.NodeIO().registerExtensions(ext.ALL_EXTENSIONS);
  const rawBytes = fs.readFileSync(inputPath);
  const doc = await io.readBinary(new Uint8Array(rawBytes));
  const facts = meshFacts(doc);
  await normalizeGeometry(doc, deps);   // wypieczone węzły = przestrzeń, którą gra normalizuje przy stawianiu statku
  const pos = allPositions(doc), bb = G.bboxOf(pos), L = G.longestAxisOf(bb), g = G.guessBow(pos, L, { bb });
  const { R } = G.orientationFor({ bowAxis: L, bowSign: g.sign });
  const out = G.transformPositions(G.normalizationMatrix(bb, R), pos);
  const noz = G.measureNozzle(out);
  const RT = [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];
  // dokument w przestrzeni wyjściowej → z powrotem do przestrzeni znormalizowanej SUROWEGO pliku (tam czyta go cvIncoming)
  const hp = rotateHardpoints(measuredHardpoints({ slot, nozzle: noz, keyMode: 'mask' }), RT);
  hp.source = { file: 'incoming/' + slot + '.glb', sha256: sha256(rawBytes), normalizer: null };
  hp.notes = `${NORMALIZER_ID} --podglad (${when()}): kandydat w incoming/ przed podmianą slotu; dziób z gęstości wierzchołków (${g.atMin} / ${g.atMax}), dysza = środek przekroju 3 % przy rufie. Podgląd w grze: await KOSMOS.debug.cvIncoming(1).`;
  const v = validateHardpoints(hp);
  if (!v.ok) throw new Error('plik hardpointów niepoprawny: ' + v.errors.join('; '));
  const idxPath = path.join(HP_INCOMING, 'index.json');
  if (!opts.dry) {
    ensureDir(HP_INCOMING);
    writeJson(path.join(HP_INCOMING, slot + '.json'), hp);
    const idx = readJson(idxPath) ?? { slots: [], notes: INDEX_NOTES };
    if (!idx.slots.includes(slot)) idx.slots = [...idx.slots, slot].sort();
    writeJson(idxPath, JSON.stringify(idx, null, 2) + '\n');
  }
  return `Podgląd kandydata ${slot}: ${facts.tris} trójkątów, dziób ${g.sign < 0 ? '−' : '+'}${G.axisName(L)} (${g.atMin} / ${g.atMax}), dysza (${noz.p.join(', ')}).\n` +
    `${opts.dry ? 'Zapisałby' : 'Zapisane'}: ${rel(path.join(HP_INCOMING, slot + '.json'))} + wpis w ${rel(idxPath)}.\nW grze: await KOSMOS.debug.cvIncoming(1)\n`;
}

// ── tryb jednorazowy: stare modele — tylko tekstury ───────────────────────────────────────────────────────────────────────

async function legacyPass(slots, deps, opts) {
  const { core, ext } = deps;
  const io = new core.NodeIO().registerExtensions(ext.ALL_EXTENSIONS);
  const files = fs.readdirSync(SHIPS).filter((f) => /^[a-z0-9_]+\.glb$/.test(f)).map((f) => f.slice(0, -4)).sort();
  const todo = slots.length ? slots : files;
  const rows = [], st = stamp();
  // duplikaty PRZED przebiegiem: identyczne pliki w folderze + stare modele podmienionych slotów (archiwum), np. stara fregata warp
  const preSha = new Map();
  for (const slot of files) preSha.set(slot, sha256(fs.readFileSync(path.join(SHIPS, slot + '.glb'))));
  if (fs.existsSync(ARCHIVE)) {
    for (const f of fs.readdirSync(ARCHIVE).filter((x) => /^[a-z0-9_]+__\d{8}-\d{6}\.glb$/.test(x)).sort()) {
      const slot = f.split('__')[0], key = `${slot} (stary model sprzed podmiany, w _archive/)`;
      if (![...preSha.keys()].includes(key)) preSha.set(key, sha256(fs.readFileSync(path.join(ARCHIVE, f))));
    }
  }
  for (const slot of todo) {
    const glb = path.join(SHIPS, slot + '.glb');
    const hpPath = path.join(HP_DIR, slot + '.json');
    const hp = readJson(hpPath);
    if (!fs.existsSync(glb)) { rows.push({ slot, skip: 'brak pliku' }); continue; }
    if (hp?.source?.normalizer === NORMALIZER_ID) { rows.push({ slot, skip: 'model właściciela po normalizacji — pominięty' }); continue; }
    const bytes = fs.readFileSync(glb);
    const doc = await io.readBinary(new Uint8Array(bytes));
    const texRows = await applyTexturePlan(doc, deps, 'legacy', null);
    const changed = texRows.all.filter((r) => r.changed);
    if (!changed.length) { rows.push({ slot, skip: 'nic do zmniejszenia', before: bytes.length }); continue; }
    const out = await io.writeBinary(doc);
    if (out.byteLength >= bytes.length) { rows.push({ slot, skip: 'plik nie maleje', before: bytes.length }); continue; }
    if (!opts.dry) {
      archiveFile(glb, `legacy/${slot}__${st}.glb`);
      fs.writeFileSync(glb, out);
      if (hp) {
        const d = JSON.parse(JSON.stringify(hp));
        d.source = { ...d.source, sha256: sha256(out), normalizer: LEGACY_PASS_ID };
        const v = validateHardpoints(d);
        if (!v.ok) throw new Error(`${slot}: hardpointy niepoprawne po aktualizacji: ${v.errors.join('; ')}`);
        writeJson(hpPath, d);
      }
    }
    rows.push({ slot, before: bytes.length, after: out.byteLength, textures: changed.map((r) => `${r.role}: ${r.before.mime.replace('image/', '')} ${fmtSize(r.before.bytes)} → ${r.after.mime.replace('image/', '')} ${fmtSize(r.after.bytes)}`) });
  }
  const group = (m) => { const by = new Map(); for (const [k, h] of m) by.set(h, [...(by.get(h) ?? []), k]); return [...by.values()].filter((g) => g.length > 1); };
  const dups = group(preSha);
  // po przebiegu identyczne wejście daje identyczne wyjście (kodowanie deterministyczne) — kontrola
  const postSha = new Map();
  for (const slot of files) postSha.set(slot, sha256(fs.readFileSync(path.join(SHIPS, slot + '.glb'))));
  const dupsAfter = group(postSha);
  return { rows, dups, dupsAfter };
}

// ── wejście z pliku (przeciągnięcie na .bat) ──────────────────────────────────────────────────────────────────────────────

async function resolveFrom(file) {
  const src = path.resolve(file);
  if (!fs.existsSync(src)) throw new Error(`nie ma pliku ${src}`);
  if (!/\.glb$/i.test(src)) throw new Error('to nie jest plik .glb — z Meshy pobierz model w formacie GLB');
  let slot = slotFromFileName(src);
  if (!slot) {
    console.log(`\nNazwa pliku „${path.basename(src)}" nie jest nazwą slotu. Do którego slotu wstawić ten model?`);
    const hint = suggestSlots(path.basename(src, path.extname(src)));
    SHIP_SLOTS.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${s}${hint.includes(s) ? '   ← pasuje do nazwy' : ''}`));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const ans = (await rl.question('\nWpisz numer albo nazwę slotu (Enter = anuluj): ')).trim();
      if (!ans) throw new Error('anulowano — nic nie zmieniono');
      slot = /^\d+$/.test(ans) ? SHIP_SLOTS[Number(ans) - 1] : slotFromFileName(ans + '.glb');
      if (!slot) throw new Error(`„${ans}" to nie slot — nic nie zmieniono`);
      // potwierdzenie: numer z listy łatwo pomylić (10 = nonwarp_frigate, nie warp_frigate) — bez „t" nic się nie zmienia
      const ok = (await rl.question(`Wstawić „${path.basename(src)}" do slotu ${slot}? Obecny model slotu trafi do archiwum. [t = tak, Enter = nie]: `)).trim().toLowerCase();
      if (ok !== 't' && ok !== 'tak') throw new Error('nie potwierdzono — nic nie zmieniono');
    } finally { rl.close(); }
  }
  ensureDir(INCOMING);
  const dst = path.join(INCOMING, slot + '.glb');
  if (path.resolve(dst) !== src) {
    if (fs.existsSync(dst) && sha256(fs.readFileSync(dst)) !== sha256(fs.readFileSync(src))) archiveFile(dst, `${slot}__${stamp()}.incoming.glb`);
    fs.copyFileSync(src, dst);
    console.log(`Skopiowano do ${rel(dst)}`);
  }
  return slot;
}

const HELP = `
KOSMOS — normalizator modeli statków (CV-1b)

Jak wstawić nowy model do gry:
  1. Pobierz model z Meshy jako plik GLB.
  2. Nazwij plik nazwą slotu, np. warp_frigate.glb (inna nazwa — program zapyta o slot).
  3. Zamknij grę w przeglądarce (zapis plików przeładowuje kartę).
  4. Przeciągnij plik na tools/ship-models/normalize-ship.bat.
  5. Przeczytaj raport (zostaje też w assets/models/ships/incoming/<slot>.report.txt).
  6. Otwórz grę i obejrzyj: w konsoli (F12) KOSMOS.debug.cvParade() albo KOSMOS.debug.cvBattle({warp: 1}).

Sloty:
  ${SHIP_SLOTS.join(', ')}

Z terminala: node tools/ship-models/normalize-ship.mjs <slot>  (albo: npm run ship -- <slot>)
  --dry        tylko raport, nic nie zapisuje
  --podglad    tylko podgląd kandydata w grze (await KOSMOS.debug.cvIncoming(1)), slot bez zmian
  --legacy     jednorazowa kompresja tekstur starych modeli
Opis i standard modelu: assets/models/ships/README_modele_statkow.md
`;

// ── main ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error('✖ ' + e.message); process.exit(1); }
  if (opts.help) { console.log(HELP); return; }
  const deps = await loadDeps();
  if (opts.legacy) {
    const { rows, dups, dupsAfter } = await legacyPass(opts.slots, deps, opts);
    const L = [`KOSMOS — jednorazowy przebieg po starych modelach (${LEGACY_PASS_ID}, ${when()})${opts.dry ? '  (PRÓBA)' : ''}`, ''];
    let sb = 0, sa = 0;
    for (const r of rows) {
      if (r.skip) { L.push(`  – ${r.slot.padEnd(24)} ${r.skip}`); if (r.before) { sb += r.before; sa += r.before; } continue; }
      sb += r.before; sa += r.after;
      L.push(`  ✔ ${r.slot.padEnd(24)} ${fmtSize(r.before)} → ${fmtSize(r.after)}   (${r.textures.join('; ')})`);
    }
    L.push('', `Razem: ${fmtSize(sb)} → ${fmtSize(sa)}`);
    L.push('', 'Identyczne pliki (ten sam model w kilku slotach — czekają na własne modele; normalizator niczego za nie nie wymyśla):');
    for (const g of dups) L.push(`  = ${g.join(' = ')}`);
    if (!dups.length) L.push('  brak');
    L.push(`  (po przebiegu nadal identyczne: ${dupsAfter.map((g) => g.join(' = ')).join('; ') || 'brak'})`);
    const text = L.join('\n') + '\n';
    console.log(text);
    if (!opts.dry) { ensureDir(INCOMING); fs.writeFileSync(path.join(INCOMING, 'legacy-pass.report.txt'), text); }
    return;
  }
  let slot = opts.slot;
  if (opts.from) slot = await resolveFrom(opts.from);
  if (!slot) { console.error('✖ Podaj slot (np. warp_frigate) albo przeciągnij plik GLB na normalize-ship.bat.'); process.exit(1); }
  if (!isShipSlot(slot)) { console.error(`✖ „${slot}" to nie slot gry. Sloty: ${SHIP_SLOTS.join(', ')}`); process.exit(1); }
  if (opts.podglad) { console.log(await previewSlot(slot, deps, opts)); return; }
  const { text } = await normalizeSlot(slot, deps, opts);
  console.log(text);
  if (!opts.dry) console.log(`Raport zapisany: ${rel(path.join(INCOMING, slot + '.report.txt'))}`);
}

main().catch((e) => { console.error('\n✖ ' + (e?.message ?? e)); process.exit(1); });
