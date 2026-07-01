// optimize-ship-textures.mjs — batchowe skalowanie tekstur w modelach statków GLB.
//
// Tekstury 2048×2048 w assets/models/ships/*.glb zajmują ~89 MB VRAM każda
// (2048² × 4 bajty × 1.33 na mipmapy). Zejście do 1024×1024 tnie to ~4× (~22 MB).
// Skrypt re-enkoduje KAŻDĄ teksturę przez sharp z limitem rozmiaru (tylko downscale —
// tekstury już ≤ limitu zostają nietknięte pod względem wymiarów), zachowując format.
//
// Wymaga (jednorazowo):
//   npm i -D @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions
//   (sharp jest już zależnością projektu)
//
// Użycie:
//   node optimize-ship-textures.mjs                 → zapis z suffixem _opt (bezpieczne)
//   node optimize-ship-textures.mjs --overwrite     → nadpisz oryginały in-place
//   node optimize-ship-textures.mjs --max 512       → inny limit (domyślnie 1024)
//   node optimize-ship-textures.mjs --dry           → tylko raport, bez zapisu
//   node optimize-ship-textures.mjs --dir <ścieżka> → inny katalog (domyślnie assets/models/ships)

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Parsowanie argumentów CLI ────────────────────────────────────────────
function parseArgs(argv) {
  const a = { overwrite: false, dry: false, max: 1024, dir: 'assets/models/ships' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--overwrite') a.overwrite = true;
    else if (arg === '--dry')  a.dry = true;
    else if (arg === '--max')  a.max = parseInt(argv[++i], 10) || 1024;
    else if (arg === '--dir')  a.dir = argv[++i];
  }
  return a;
}
const opts = parseArgs(process.argv.slice(2));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const fmtMB = (bytes) => (bytes / 1024 / 1024).toFixed(1) + ' MB';

async function optimizeOne(filePath, { max, overwrite, dry }) {
  const doc = await io.read(filePath);
  const srcStat = await fs.stat(filePath);

  // Wymiary PRZED — z surowych bajtów tekstur (sharp metadata).
  const textures = doc.getRoot().listTextures();
  let biggest = 0;
  for (const tex of textures) {
    const img = tex.getImage();
    if (!img) continue;
    try {
      const meta = await sharp(Buffer.from(img)).metadata();
      biggest = Math.max(biggest, meta.width || 0, meta.height || 0);
    } catch { /* nie-rastrowy format — pomiń */ }
  }

  // Downscale + re-enkode. resize [max,max] tylko ZMNIEJSZA (fit inside),
  // brak targetFormat = zachowaj format źródłowy per tekstura.
  await doc.transform(
    textureCompress({
      encoder: sharp,
      resize: [max, max],
      resizeFilter: 'lanczos3',
    }),
  );

  const name = path.basename(filePath, '.glb');
  const outPath = overwrite
    ? filePath
    : path.join(path.dirname(filePath), `${name}_opt.glb`);

  if (dry) {
    console.log(`  [dry] ${path.basename(filePath)}  (${textures.length} tex, max ${biggest}px)  → ${path.basename(outPath)}`);
    return { srcBytes: srcStat.size, dstBytes: srcStat.size, texCount: textures.length, biggest };
  }

  await io.write(outPath, doc);
  const dstStat = await fs.stat(outPath);
  console.log(
    `  ✓ ${path.basename(filePath).padEnd(28)} ${fmtMB(srcStat.size).padStart(9)} → ${fmtMB(dstStat.size).padStart(9)}` +
    `  (${textures.length} tex, max ${biggest}px→≤${max})  ${path.basename(outPath)}`,
  );
  return { srcBytes: srcStat.size, dstBytes: dstStat.size, texCount: textures.length, biggest };
}

async function main() {
  const dir = path.resolve(__dirname, opts.dir);
  const entries = await fs.readdir(dir);
  const files = entries
    .filter((f) => f.toLowerCase().endsWith('.glb'))
    .filter((f) => !f.toLowerCase().endsWith('_opt.glb'))  // nie re-optymalizuj wyników
    .map((f) => path.join(dir, f))
    .sort();

  if (files.length === 0) {
    console.error(`Brak plików .glb w ${dir}`);
    process.exit(1);
  }

  console.log(`Optymalizacja ${files.length} modeli w ${dir}`);
  console.log(`  limit tekstur: ${opts.max}px | tryb: ${opts.dry ? 'DRY (bez zapisu)' : opts.overwrite ? 'NADPISZ oryginały' : 'suffix _opt'}\n`);

  let totalSrc = 0, totalDst = 0, failed = 0;
  for (const file of files) {
    try {
      const r = await optimizeOne(file, opts);
      totalSrc += r.srcBytes;
      totalDst += r.dstBytes;
    } catch (err) {
      failed++;
      console.error(`  ✗ ${path.basename(file)}: ${err.message}`);
    }
  }

  console.log(`\nGotowe. Suma na dysku: ${fmtMB(totalSrc)} → ${fmtMB(totalDst)}` +
    (opts.dry ? ' (dry)' : ` (${(100 * (1 - totalDst / totalSrc)).toFixed(0)}% mniej)`) +
    (failed ? `  |  ${failed} błędów` : ''));
}

main().catch((err) => { console.error(err); process.exit(1); });
