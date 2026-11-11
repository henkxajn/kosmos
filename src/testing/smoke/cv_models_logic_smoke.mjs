// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_models_logic_smoke — KEEPER ARC COMBAT VISUALS, krok CV-1a (logika; F11 — bez pinów na stałych rysunku)
// Plan: `docs/design/COMBAT_VISUALS_PLAN.md` §2.11, §4 CV-1a; D-CV-11 / D-CV-12; Findingi 620, 621, 622.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (czyste moduły, bez Three.js):
//   T1 schemat hardpointów v1: dokument poprawny przechodzi; każda z mutacji (nieznany klucz, zły schemat / wersja, dziób
//      zerowy, rama nieprostopadła, promień dyszy poza zakresem, powtórzone id wieżyczki, rozmiar światła 0, zły kolor, WYCOFANY
//      tryb „points", hueTol 90) — odrzucona z nazwanym błędem. KONTROLA: dopuszczalna zmiana (notes) przechodzi.
//   T2 pliki na dysku: każdy plik w `assets/models/ships/hardpoints/` (i `incoming/`) waliduje się; KAŻDY slot resolvera
//      (24 + default) ma plik; `slot` = nazwa pliku; sha256 starego GLB = `source.sha256` (wykrywa model podmieniony bez
//      hardpointów); indeks `incoming/index.json` = dokładnie pliki w `incoming/`.
//   T3 wartości zapasowe: poprawne dla każdego slotu; dziób zapasu ZGODNY z plikiem pomiaru dla każdego starego slotu; lista
//      wyjątków +X ma dokładnie jeden wpis (`nonwarp_large_science`, Finding 621). KONTROLA: pusta lista wyjątków ⇒ niezgodność.
//   T4 kwaternion ramy: dzioby ±X / ±Z / ±Y → +Z, góra → +Y; |q| = 1; góra nieprostopadła rzutowana; w KAŻDYM pliku dziób → +Z,
//      a kierunek smugi dyszy → za rufę (−Z).
//   T5 kurs: rama kanoniczna — dziób wzdłuż ruchu (w locie i na orbicie, Finding 622: pochodna wzoru `OrbitalSpaceSystem`);
//      ścieżka OFF — wzory co do bitu jak dziś (`atan2 + π/2`, `θ + π`, przechył); przechył kanoniczny w stronę skrętu.
//   T6 slot ze ścieżki modelu; T7 pamięć hardpointów (plik / 404 / dokument niepoprawny / wyjątek fetch ⇒ zapas, nigdy odrzucenie;
//      jedno żądanie na slot; indeks `incoming`; nadpisanie).
//   T8 maska koloru-klucza (lustro GLSL w JS): progi TWARDE na siatce (barwa w odległości ≥ hueTol, nasycenie ≤ satMin, jasność
//      ≤ valMin ⇒ 0), pełna maska wewnątrz; barwa ≥ 194° przy domyślnych ⇒ 0 dla KAŻDEGO nasycenia. KONTROLA: hueTol 30 zapala 205°.
//   T9 PRAWDZIWE TEKSTURY 6 modeli właściciela (fixture `models/CV1a-incoming-key-colour.json.gz` — kolory z obszaru UV,
//      dekoder Chrome): panele niebieskie (barwa ≥ 205°) — wiele tekseli, ZERO zapalonych; pierścień warp zapalony (warp > 0,3 %),
//      wersje bez warp ≈ 0; % zapalonych zgodny z pomiarem. KONTROLA: szersze progi zapalają panele (instrument umie paść).
//   T10 źródło: zero `Math.random` w nowych modułach; ścieżka OFF renderera zachowana; flaga czytana przy stawianiu statku.
//   T5r (kontrola właściciela CV-1a) kurs spoczynkowy i pochylenie wraku ramy kanonicznej = orientacja ścieżki OFF w świecie;
//      KONTROLA: dawny zapis Eulera na ramie kanonicznej daje inny obraz. T11 stager — układ pod najciemniejszą / najjaśniejszą gwiazdą.
// ⚠ Importy CV-1a dynamiczne w try/catch — przy fail-first piny DEGRADUJĄ (czerwone), suita się nie przerywa.
// ⚠ PRZECELOWANE ŚWIADOMIE w CV-1b (2026-11-11): T2d / T4c pinowały LICZBY ze stanu CV-1a (6 wpisów indeksu incoming, ≥ 31 plików
//   = 27 slotów + 6 incoming), a CV-1b z projektu PRZENIÓSŁ sześć modeli właściciela do slotów (wpisy i pliki incoming zdjęte —
//   plan §4 CV-1b „From CV-1a"). Niezmienniki zostają: indeks = dokładnie pliki incoming/, każdy plik — dziób → +Z, smuga za rufą.
//   T2e pinował modele właściciela w incoming/ — dziś te same modele żyją w slotach (`source.normalizer` = normalize-ship@1),
//   więc pin obejmuje oba miejsca i wymaga ŚWIADKA (pusty zbiór nie przechodzi). Liczby po podmianie pinuje `cv_normalizer_logic_smoke`.

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { VESSEL_MODEL_KEYS } from '../../renderer/VesselModelResolver.js';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const SC = await tryImport('../../data/ShipHardpointsSchema.js');
const HP = await tryImport('../../renderer/ShipHardpoints.js');
const KC = await tryImport('../../renderer/KeyColourEmission.js');

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const block = async (title, fn) => { header(title); try { await fn(); } catch (e) { assert(false, `${title} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
const HP_DIR = 'assets/models/ships/hardpoints/';
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const vnear = (a, b, e = 1e-9) => a.every((x, i) => near(x, b[i], e));

// ── T1 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('T1 schemat hardpointów v1 — poprawny przechodzi, mutacje odrzucone z błędem', () => {
  const base = HP.defaultHardpoints('warp_frigate');
  assert(SC.validateHardpoints(base).ok, 'T1a dokument zapasowy jest poprawny');
  const mut = (f) => { const d = JSON.parse(JSON.stringify(base)); f(d); return SC.validateHardpoints(d); };
  const cases = [
    ['nieznany klucz', (d) => { d.nozzle = []; }, /nieznany klucz/],
    ['zły schemat', (d) => { d.schema = 'x'; }, /schema/],
    ['zła wersja', (d) => { d.version = 2; }, /version/],
    ['dziób zerowy', (d) => { d.frame.bow = [0, 0, 0]; }, /frame/],
    ['rama nieprostopadła', (d) => { d.frame.up = [-1, 0.2, 0]; d.frame.bow = [-1, 0, 0]; }, /prostopadłe/],
    ['promień dyszy 0,9', (d) => { d.nozzles[0].r = 0.9; }, /nozzles\[0\]\.r/],
    ['powtórzone id wieżyczki', (d) => { d.weapons = [{ id: 'W1', p: [0, 0, 0], d: null }, { id: 'W1', p: [0.1, 0, 0], d: null }]; }, /powtórzone/],
    ['rozmiar światła 0', (d) => { d.lights = [{ p: [0, 0, 0], size: 0 }]; }, /lights\[0\]\.size/],
    ['zły kolor światła', (d) => { d.lights = [{ p: [0, 0, 0], size: 0.01, colour: 'cyan' }]; }, /colour/],
    ['wycofany tryb „points"', (d) => { d.keyColour.mode = 'points'; }, /keyColour\.mode/],
    ['hueTol 90', (d) => { d.keyColour.hueTol = 90; }, /hueTol/],
    ['punkt poza przestrzenią', (d) => { d.nozzles[0].p = [2, 0, 0]; }, /nozzles\[0\]\.p/],
  ];
  for (const [name, f, re] of cases) { const v = mut(f); assert(!v.ok && v.errors.some((e) => re.test(e)), `T1b odrzucony: ${name} (${v.errors[0] ?? 'ok'})`); }
  const ctl = mut((d) => { d.notes = 'kontrola'; d.lights = [{ p: [0.1, 0, 0.02], size: 0.012, colour: '#7ff4ff', gain: 3 }]; });
  assert(ctl.ok, 'T1c nie-jałowość: dopuszczalna zmiana (notes, światło poprawne) przechodzi');
});

// ── T2 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('T2 pliki hardpointów na dysku — poprawne, komplet slotów, sha256 starych modeli, indeks incoming', () => {
  const files = readdirSync(new URL(HP_DIR, ROOT)).filter((f) => f.endsWith('.json'));
  const inc = readdirSync(new URL(HP_DIR + 'incoming/', ROOT)).filter((f) => f.endsWith('.json') && f !== 'index.json');
  const docs = new Map();
  let bad = [];
  for (const f of files) { const d = JSON.parse(read(HP_DIR + f)); docs.set(f.replace('.json', ''), d); const v = SC.validateHardpoints(d); if (!v.ok || d.slot !== f.replace('.json', '')) bad.push(f); }
  for (const f of inc) { const d = JSON.parse(read(HP_DIR + 'incoming/' + f)); const v = SC.validateHardpoints(d); if (!v.ok || d.slot !== f.replace('.json', '')) bad.push('incoming/' + f); }
  assert(files.length >= 25 && bad.length === 0, `T2a ${files.length} plików slotów + ${inc.length} incoming — wszystkie poprawne, slot = nazwa pliku (złe: ${bad.join(', ') || '—'})`);
  const missing = [...VESSEL_MODEL_KEYS, 'default'].filter((k) => !docs.has(k));
  assert(missing.length === 0, `T2b każdy slot resolvera (24 + default) ma plik hardpointów (brak: ${missing.join(', ') || '—'})`);
  const stale = [];
  for (const [slot, d] of docs) {
    const glb = new URL('assets/models/ships/' + d.source.file, ROOT);
    if (!existsSync(glb)) { stale.push(slot + ' (brak GLB)'); continue; }
    const sha = createHash('sha256').update(readFileSync(glb)).digest('hex');
    if (sha !== d.source.sha256) stale.push(slot);
  }
  assert(stale.length === 0, `T2c sha256 każdego starego GLB = source.sha256 pliku hardpointów (nieaktualne: ${stale.join(', ') || '—'})`);
  const idx = JSON.parse(read(HP_DIR + 'incoming/index.json'));
  assert(JSON.stringify([...idx.slots].sort()) === JSON.stringify(inc.map((f) => f.replace('.json', '')).sort()),
    `T2d indeks incoming = dokładnie pliki incoming/ (${idx.slots.join(', ') || 'pusty — CV-1b przeniósł modele do slotów'})`);
  const incDocs = inc.map((f) => JSON.parse(read(HP_DIR + 'incoming/' + f)));
  const ownerSlotDocs = [...docs.values()].filter((d) => d.source.normalizer === 'normalize-ship@1');
  const owner = [...incDocs.map((d) => ({ d, file: 'incoming/' + d.slot + '.glb' })), ...ownerSlotDocs.map((d) => ({ d, file: d.source.input?.file }))];
  assert(owner.length >= 6 && owner.every(({ d, file }) => d.keyColour.mode === 'mask' && file === 'incoming/' + d.slot + '.glb' && d.lights.length === 0 && d.weapons.length === 0),
    `T2e modele właściciela (${incDocs.length} w incoming/, ${ownerSlotDocs.length} w slotach po normalizatorze): maska ON, źródło incoming/<slot>.glb, bez świateł i wieżyczek (klika je Workshop CV-1c)`);
});

// ── T3 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('T3 wartości zapasowe — poprawne, dziób zgodny z pomiarem, jeden wyjątek +X', () => {
  const keys = [...VESSEL_MODEL_KEYS, 'default'];
  assert(keys.every((k) => SC.validateHardpoints(HP.defaultHardpoints(k)).ok), 'T3a zapas poprawny dla każdego slotu resolvera');
  const aft = keys.every((k) => { const d = HP.defaultHardpoints(k), q = HP.frameQuaternion(d.frame);
    return HP.rotateVec(q, d.nozzles[0].p)[2] < -0.45 && HP.rotateVec(q, d.nozzles[0].d)[2] < -0.99; });
  assert(aft, 'T3a2 dysza zapasu na RUFIE w ramie kanonicznej (z ≈ −0,5), smuga za rufę — dla każdego slotu (też wyjątku +X)');
  const disagree = [];
  for (const k of keys) { const d = JSON.parse(read(HP_DIR + k + '.json')); if (!vnear(d.frame.bow, HP.defaultHardpoints(k).frame.bow)) disagree.push(k); }
  assert(disagree.length === 0, `T3b dziób zapasu = dziób z pomiaru dla każdego slotu (niezgodne: ${disagree.join(', ') || '—'})`);
  assert(HP.BOW_PLUS_X_SLOTS.length === 1 && HP.BOW_PLUS_X_SLOTS[0] === 'nonwarp_large_science', 'T3c lista wyjątków dziobu +X = [nonwarp_large_science] (Finding 621)');
  // KONTROLA: zapas bez wyjątku (dziób −X dla wszystkich) — pin T3b widzi niezgodność.
  const d = JSON.parse(read(HP_DIR + 'nonwarp_large_science.json'));
  assert(d.frame.bow[0] === 1 && !vnear(d.frame.bow, [-1, 0, 0]), 'T3d nie-jałowość: plik nonwarp_large_science ma dziób +X — zapas bez wyjątku byłby niezgodny');
});

// ── T4 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('T4 kwaternion ramy kanonicznej — dziób → +Z, góra → +Y; w każdym pliku smuga za rufą', () => {
  const frames = [[[-1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 1, 0]], [[0, 0, 1], [0, 1, 0]], [[0, 0, -1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1]], [[0, -1, 0], [1, 0, 0]]];
  for (const [bow, up] of frames) {
    const q = HP.frameQuaternion({ bow, up });
    assert(near(Math.hypot(...q), 1, 1e-12) && vnear(HP.rotateVec(q, bow), [0, 0, 1], 1e-12) && vnear(HP.rotateVec(q, up), [0, 1, 0], 1e-12),
      `T4a dziób [${bow}] / góra [${up}] → +Z / +Y (q = [${q.map((x) => x.toFixed(3))}])`);
  }
  const q = HP.frameQuaternion({ bow: [-1, 0, 0], up: [-0.3, 1, 0.1] });
  assert(vnear(HP.rotateVec(q, [-1, 0, 0]), [0, 0, 1], 1e-12) && HP.rotateVec(q, [0, 1, 0])[1] > 0.9, 'T4b góra nieprostopadła zrzutowana — dziób dalej dokładnie +Z');
  const all = [...readdirSync(new URL(HP_DIR, ROOT)).filter((f) => f.endsWith('.json')).map((f) => HP_DIR + f),
    ...readdirSync(new URL(HP_DIR + 'incoming/', ROOT)).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => HP_DIR + 'incoming/' + f)];
  const wrong = [];
  for (const f of all) {
    const d = JSON.parse(read(f)); const qq = HP.frameQuaternion(d.frame);
    const b = HP.rotateVec(qq, d.frame.bow), nd = HP.rotateVec(qq, d.nozzles[0].d), np = HP.rotateVec(qq, d.nozzles[0].p);
    if (!vnear(b, [0, 0, 1], 1e-9) || nd[2] > -0.9 || np[2] > -0.3) wrong.push(f);
  }
  assert(wrong.length === 0 && all.length >= 27, `T4c ${all.length} plików: dziób → +Z, dysza za rufą (z < −0,3), smuga ku −Z (złe: ${wrong.join(', ') || '—'})`);
});

// ── T5 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('T5 kurs: rama kanoniczna wzdłuż ruchu (lot, orbita), ścieżka OFF co do bitu, przechył w stronę skrętu', () => {
  // Wrapper obraca się wokół Y o `yaw`: lokalne +Z → (sin, 0, cos); lokalne −X → (−cos, 0, sin) (Three.js, Euler XYZ).
  const bowCanon = (yaw) => [Math.sin(yaw), Math.cos(yaw)];
  const bowLegacy = (yaw) => [-Math.cos(yaw), Math.sin(yaw)];
  let worst = 1, legacyBit = true;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2, dx = Math.cos(a) * (1 + i), dz = Math.sin(a) * (1 + i), l = Math.hypot(dx, dz);
    const b = bowCanon(HP.yawToward(dx, dz, true));
    worst = Math.min(worst, (b[0] * dx + b[1] * dz) / l);
    if (HP.yawToward(dx, dz, false) !== Math.atan2(dx, dz) + Math.PI / 2) legacyBit = false;
    const lb = bowLegacy(HP.yawToward(dx, dz, false));
    worst = Math.min(worst, (lb[0] * dx + lb[1] * dz) / l);
  }
  assert(worst > 1 - 1e-12, `T5a w locie: dziób kanoniczny (+Z) i dawny (−X) wzdłuż kierunku do celu (min cos ${worst.toFixed(12)})`);
  assert(legacyBit, 'T5b ścieżka OFF: yawToward(…, false) === atan2(dx, dz) + π/2 co do bitu');
  // Orbita: pozycja z formuły `OrbitalSpaceSystem.getPosition` (x = r·sinφ·cosθ, z = r·sinφ·sinθ, θ = θ₀ + ω·t) — prędkość
  // z różnicy pozycji (pochodna numeryczna), dziób kanoniczny wzdłuż niej; dawne `θ + π` — przeciwnie do ruchu w części orbity.
  const pos = (th) => [Math.sin(1.1) * Math.cos(th), Math.sin(1.1) * Math.sin(th)];
  let worstOrb = 1, legacyMin = 1, legacyOrbBit = true;
  for (const omega of [0.4, -0.3]) {
    for (let i = 0; i < 48; i++) {
      const th = (i / 48) * Math.PI * 2, dt = 1e-6;
      const p0 = pos(th), p1 = pos(th + omega * dt); const v = [p1[0] - p0[0], p1[1] - p0[1]]; const lv = Math.hypot(...v);
      const b = bowCanon(HP.orbitYaw(th, omega, true));
      worstOrb = Math.min(worstOrb, (b[0] * v[0] + b[1] * v[1]) / lv);
      if (HP.orbitYaw(th, omega, false) !== th + Math.PI) legacyOrbBit = false;
      const lb = bowLegacy(th + Math.PI);
      legacyMin = Math.min(legacyMin, (lb[0] * v[0] + lb[1] * v[1]) / lv);
    }
  }
  assert(worstOrb > 1 - 1e-6, `T5c orbita (ω > 0 i ω < 0): dziób kanoniczny wzdłuż ruchu orbity (min cos ${worstOrb.toFixed(9)}) — Finding 622`);
  assert(legacyOrbBit && legacyMin < -0.99, `T5d ścieżka OFF: orbitYaw(…, false) === θ + π co do bitu; dawny dziób bywa PRZECIWNY ruchowi (min cos ${legacyMin.toFixed(3)})`);
  assert(HP.bankRoll(0.02, true) < 0 && HP.bankRoll(-0.02, true) > 0 && HP.bankRoll(0.02, false) === Math.max(-0.5, Math.min(0.5, 0.02 * 12)) && HP.bankRoll(1, true) === -0.5,
    'T5e przechył: kanoniczny w stronę skrętu (skręt w lewo ⇒ obrót Z < 0), ścieżka OFF co do bitu, limit ±0,5');
});

// KONTROLA (bez modułów CV-1a — zielona po obu stronach zmiany): dawny wzór kursu na orbicie z renderera (`pos.theta + Math.PI`,
// dziób modelu w lokalnym −X) obraca dziób PRZECIWNIE do ruchu orbity w części okrążenia — Finding 622 jest w źródle, a instrument
// T5c (pochodna formuły `OrbitalSpaceSystem.getPosition`) umie to zobaczyć.
await block('T5k KONTROLA — dawny kurs orbity `θ + π` w źródle renderera bywa przeciwny ruchowi', () => {
  assert(/entry\.sprite\.rotation\.y = [^\n]*pos\.theta \+ Math\.PI/.test(strip(read('src/renderer/ThreeRenderer.js'))), 'T5k-a wzór `pos.theta + Math.PI` w `_tickOrbitingVessels`');
  let mn = 1;
  for (let i = 0; i < 48; i++) {
    const th = (i / 48) * Math.PI * 2, v = [-Math.sin(th), Math.cos(th)], yaw = th + Math.PI;
    mn = Math.min(mn, -Math.cos(yaw) * v[0] + Math.sin(yaw) * v[1]);
  }
  assert(mn < -0.99, `T5k-b dziób (lokalne −X po obrocie θ + π) vs ruch orbity: min cos ${mn.toFixed(3)} (przeciwnie)`);
});

// ── T5r ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Kontrola właściciela CV-1a (2026-11-11): statek bez znanego kierunku (stojący wróg w bitwie, wrak z zapisu) — kurs 0 ramy
// kanonicznej to dziób +Z, a ścieżka OFF pokazywała dziób −X (model z dziobem −X przy kursie 0) ⇒ obrót o 90°. Kurs spoczynkowy
// i pochylenie wraku mają dawać TĘ SAMĄ orientację w świecie co ścieżka OFF. Obroty liczone NIEZALEŻNIE (macierze Eulera XYZ
// Three.js: v' = Rx(Ry(Rz(v)))), nie tym samym wzorem kwaternionu, który testujemy.
await block('T5r kurs spoczynkowy i pochylenie wraku — orientacja w świecie jak ścieżka OFF', () => {
  const Rx = (a, v) => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)];
  const Ry = (a, v) => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
  const Rz = (a, v) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];
  const euler = (x, y, z, v) => Rx(x, Ry(y, Rz(z, v)));
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // Dziób kanoniczny (+Z) przy kursie spoczynkowym = dziób OFF (−X modelu) przy kursie 0 = −X świata.
  assert(vnear(Ry(HP.REST_YAW_CANONICAL, [0, 0, 1]), euler(0, 0, 0, [-1, 0, 0]), 1e-12) && vnear(Ry(HP.REST_YAW_CANONICAL, [0, 1, 0]), [0, 1, 0], 1e-12),
    'T5r-a kurs spoczynkowy: dziób ramy kanonicznej w świecie = dziób ścieżki OFF przy kursie 0 (−X), góra +Y');
  // Wrak: wrapper OFF = Euler(rx, yawOff, rz) na modelu z dziobem −X; wrapper kanoniczny = `wreckTiltQuaternion(yaw, rx, rz)`
  // na modelu z dziobem +Z, yawOff = yaw + π/2 (kurs w locie, kurs spoczynkowy — ta sama zależność).
  let worst = 1, n = 0;
  for (const yaw of [HP.REST_YAW_CANONICAL, 0, 0.7, -2.4, 3.1]) {
    for (const rx of [-0.2, 0, 0.13]) {
      for (const rz of [-0.3, 0.07, 0.3]) {
        const q = HP.wreckTiltQuaternion(yaw, rx, rz);
        const yOff = yaw + Math.PI / 2;
        worst = Math.min(worst, dot3(HP.rotateVec(q, [0, 0, 1]), euler(rx, yOff, rz, [-1, 0, 0])), dot3(HP.rotateVec(q, [0, 1, 0]), euler(rx, yOff, rz, [0, 1, 0])));
        n++;
      }
    }
  }
  assert(n === 45 && worst > 1 - 1e-12, `T5r-b pochylenie wraku: dziób i góra w świecie jak ścieżka OFF w ${n} przypadkach (min cos ${worst.toFixed(13)})`);
});

// KONTROLA (bez modułów CV-1a — zielona po obu stronach zmiany, osobny blok: nie zależy od pinów wyżej): samo przepisanie Eulera
// z i x na wrapper kanoniczny (kod CV-1a przed kontrolą właściciela) daje inny obraz niż OFF (przechył wokół dziobu zamiast
// pochylenia nosa) — instrument T5r-b umie zobaczyć różnicę.
await block('T5rk KONTROLA — dawny zapis Eulera z / x na ramie kanonicznej ≠ orientacja ścieżki OFF', () => {
  const Rx = (a, v) => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)];
  const Ry = (a, v) => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
  const Rz = (a, v) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];
  const euler = (x, y, z, v) => Rx(x, Ry(y, Rz(z, v)));
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let naive = 1;
  for (const rz of [-0.3, 0.3]) naive = Math.min(naive, dot3(euler(0.1, -Math.PI / 2, rz, [0, 0, 1]), euler(0.1, 0, rz, [-1, 0, 0])));
  assert(naive < 1 - 1e-3, `T5rk-a dawny zapis Eulera na ramie kanonicznej ≠ ścieżka OFF (min cos dziobu ${naive.toFixed(4)})`);
});

// ── T6 / T7 ────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('T6 slot ze ścieżki modelu', () => {
  const s = (p) => JSON.stringify(HP.slotOfModelPath(p));
  assert(s('assets/models/ships/warp_frigate.glb') === '{"slot":"warp_frigate","variant":"slot"}'
    && s('assets/models/ships/incoming/warp_frigate.glb') === '{"slot":"warp_frigate","variant":"incoming"}'
    && s('assets/models/ships/default.glb') === '{"slot":"default","variant":"slot"}' && HP.slotOfModelPath('x.png') === null,
    'T6a slot / incoming / default / nie-GLB');
  assert(HP.hardpointsUrl('warp_frigate') === 'assets/models/ships/hardpoints/warp_frigate.json'
    && HP.hardpointsUrl('warp_frigate', 'incoming') === 'assets/models/ships/hardpoints/incoming/warp_frigate.json', 'T6b URL pliku hardpointów');
});

await block('T7 pamięć hardpointów — nigdy nie odrzuca, jedno żądanie na slot, zapas przy błędzie', async () => {
  const docs = { 'assets/models/ships/hardpoints/warp_frigate.json': JSON.parse(read(HP_DIR + 'warp_frigate.json')),
    'assets/models/ships/hardpoints/bad.json': { schema: 'x' }, 'assets/models/ships/hardpoints/incoming/index.json': { slots: ['warp_frigate', 'BAD SLOT'] } };
  let calls = 0; const warns = [];
  const C = new HP.ShipHardpointsCache({ fetchJson: async (url) => { calls++; if (url.includes('boom')) throw new Error('net'); return docs[url] ?? null; }, warn: (m) => warns.push(m) });
  const [a, b] = await Promise.all([C.load('warp_frigate'), C.load('warp_frigate')]);
  assert(a === b && a === docs['assets/models/ships/hardpoints/warp_frigate.json'] && calls === 1, 'T7a plik wczytany raz (dwa równoległe żądania — jedno pobranie)');
  const miss = await C.load('nonwarp_large_science');
  assert(miss.frame.bow[0] === 1 && warns.length === 1 && C.stats().fallback.includes('nonwarp_large_science'), 'T7b brak pliku ⇒ zapas (dziób +X dla wyjątku), jedno ostrzeżenie');
  const bad = await C.load('bad');
  const boom = await C.load('boom');
  assert(SC.validateHardpoints(bad).ok && SC.validateHardpoints(boom).ok && warns.length === 3, 'T7c dokument niepoprawny i wyjątek fetch ⇒ zapas (bez odrzucenia), ostrzeżenia');
  const idx = await C.loadIncomingIndex();
  assert(idx instanceof Set && idx.size === 1 && idx.has('warp_frigate'), 'T7d indeks incoming (zły wpis odfiltrowany)');
  C.setOverride('warp_frigate', 'slot', { ...a, lights: [{ p: [0, 0, 0], size: 0.01 }] });
  assert(C.get('warp_frigate').lights.length === 1, 'T7e nadpisanie w pamięci ma pierwszeństwo');
  const N = new HP.ShipHardpointsCache({});
  assert((await N.load('x')).slot === 'x', 'T7f bez fetch ⇒ zapas od razu');
});

// ── T8 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('T8 maska koloru-klucza (lustro GLSL) — progi twarde na siatce, pełna wewnątrz', () => {
  const kc = SC.KEY_COLOUR_DEFAULTS;
  // Siatka sRGB 8 bit co 3 — 85³ ≈ 614 tys. próbek: progi twarde liczone barwą / nasyceniem / jasnością z tej samej funkcji.
  let viol = 0, outside = 0, inside = 0, full = 0, blueSeen = 0;
  for (let r = 0; r < 256; r += 3) for (let g = 0; g < 256; g += 3) for (let b = 0; b < 256; b += 3) {
    const m = KC.keyColourMask(r, g, b, kc);
    const R = r / 255, G = g / 255, B = b / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
    const s = mx > 0 ? d / mx : 0, h = KC.hueOf(r, g, b);
    let dh = Math.abs(h - kc.hue); dh = Math.min(dh, 360 - dh);
    if (m < 0 || m > 1) viol++;
    if (d > 1e-5 && (dh >= kc.hueTol || s <= kc.satMin || mx <= kc.valMin)) { outside++; if (m !== 0) viol++; }
    if (d > 1e-5 && h >= 194 && h <= 330) { blueSeen++; if (m !== 0) viol++; }
    if (d > 1e-5 && dh <= kc.hueTol - kc.soft * KC.KC_HUE_SOFT_DEG && s >= kc.satMin + kc.soft && mx >= kc.valMin + kc.soft) { inside++; if (m === 1) full++; }
  }
  assert(viol === 0 && outside > 100000 && blueSeen > 50000, `T8a domyślne parametry: poza progami maska = 0 dokładnie (${outside} próbek), barwa 194–330° = 0 (${blueSeen}) — naruszeń ${viol}`);
  assert(inside > 50 && full === inside, `T8b wewnątrz progów (minus rampa soft) maska = 1 (${full}/${inside})`);
  const wide = { ...kc, hueTol: 30, satMin: 0.15, valMin: 0.2 };
  assert(KC.keyColourMask(80, 150, 200, kc) === 0 && KC.keyColourMask(80, 150, 200, wide) > 0, 'T8c nie-jałowość: barwa 205° — 0 przy domyślnych, > 0 przy hueTol 30 (instrument umie zapalić)');
  assert(KC.keyColourGain({ ...kc, mode: 'mask' }) === kc.gain && KC.keyColourGain({ ...kc, mode: 'none' }) === 0, 'T8d tryb: mask → wzmocnienie, none → 0');
  const glsl = KC.KC_PARS_GLSL;
  assert(glsl.includes(`uKcSoft * ${KC.KC_HUE_SOFT_DEG.toFixed(1)}`) && /1\.0 - kcStep\(max\(0\.0, uKcHueTol - sd\), uKcHueTol, dh\)/.test(glsl)
    && /kcStep\(uKcSatMin, uKcSatMin \+ ss, sat\) \* kcStep\(uKcValMin, uKcValMin \+ ss, mx\)/.test(glsl),
    'T8e GLSL i JS liczą maskę tym samym wzorem (rampa barwy do wewnątrz, progi nasycenia / jasności z soft)');
});

// ── T9 ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('T9 PRAWDZIWE tekstury 6 modeli właściciela — panele niebieskie nigdy, pierścień warp tak', () => {
  const fx = JSON.parse(gunzipSync(readFileSync(new URL('src/testing/fixtures/models/CV1a-incoming-key-colour.json.gz', ROOT))).toString('utf8'));
  assert(fx.schema === 'kosmos-cv1a-keycolour-fixture' && fx.files.length === 6, 'T9a fixture: 6 plików, schemat');
  const decode = (b64) => { const buf = Buffer.from(b64, 'base64'); const out = []; let i = 0, prev = 0;
    const rd = () => { let n = 0, m = 1, c; do { c = buf[i++]; n += (c & 0x7f) * m; m *= 128; } while (c & 0x80); return n; };
    while (i < buf.length) { prev += rd(); out.push([prev, rd()]); } return out; };
  const kc = SC.KEY_COLOUR_DEFAULTS;
  const wide = { ...kc, hueTol: 30, satMin: 0.12, valMin: 0.2 };
  for (const f of fx.files) {
    const e = decode(f.entries);
    let lit = 0, panels = 0, panelsLit = 0, wideLit = 0;
    for (const [k, n] of e) {
      const r = k >> 16, g = (k >> 8) & 255, b = k & 255, m = KC.keyColourMask(r, g, b, kc);
      lit += m * n;
      if (KC.hueOf(r, g, b) >= 205) { panels += n; if (m > 0) panelsLit += n; if (KC.keyColourMask(r, g, b, wide) > 0) wideLit += n; }
    }
    const pct = 100 * lit / f.covered, pctAll = 100 * lit / (f.texW * f.texH);
    const warp = f.slot.startsWith('warp_');
    assert(e.length === f.unique && panels > 10000 && panelsLit === 0 && (warp ? pct > 0.3 : pct < 0.01) && Math.abs(pct - f.measured.litPctOfCovered) < 0.002,
      `T9b ${f.slot}: zapalone ${pct.toFixed(3)} % obszaru UV (${pctAll.toFixed(3)} % tekstury), panele ≥ 205°: ${panels} tekseli, zapalonych ${panelsLit}`);
    if (f.slot.endsWith('battleship')) assert(wideLit > 0, `T9c nie-jałowość ${f.slot}: progi szerokie (hueTol 30, nasycenie 0,12) zapalają panele (${wideLit} tekseli)`);
  }
});

// ── T10 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
await block('T10 źródło: bez Math.random, ścieżka OFF zachowana, flaga przy stawianiu statku', () => {
  const NEW = ['src/data/ShipHardpointsSchema.js', 'src/renderer/ShipHardpoints.js', 'src/renderer/KeyColourEmission.js', 'src/renderer/ShipLightPoints.js', 'src/renderer/ShipModelRig.js'];
  assert(NEW.every((f) => !/Math\.random/.test(strip(read(f)))), 'T10a zero Math.random w nowych modułach CV-1a');
  const tr = strip(read('src/renderer/ThreeRenderer.js'));
  const body = (sig) => { const i = tr.indexOf(sig); return i < 0 ? '' : tr.slice(i, tr.indexOf('\n  }\n', i)); };
  const add = body('  _addVesselModel3D(vessel, modelPath) {');
  assert(/^\s*_addVesselModel3D\(vessel, modelPath\) \{\s*if \(GAME_CONFIG\.FEATURES\?\.cvModels\) \{ this\._addVesselModelCv\(vessel, modelPath\); return; \}/.test(add)
    && /if \(isEnemy\) \{|\} else if \(isEnemy\) \{/.test(add) && /wrapper\.rotation\.y = Math\.atan2\(dx, dy\) \+ Math\.PI \/ 2;/.test(add),
    'T10b `_addVesselModel3D`: flaga czytana przy stawianiu (pierwsza instrukcja), dalej dawna ścieżka bez zmian');
  assert(/entry\.canonical \? yawToward\(dx, dy, true\) : Math\.atan2\(dx, dy\) \+ Math\.PI \/ 2/.test(tr)
    && /entry\.canonical \? orbitYaw\(pos\.theta, orb\.omega, true\) : pos\.theta \+ Math\.PI/.test(tr)
    && /cone\.scale\.x = intensity \* \(0\.85 \+ 0\.3 \* flick\);/.test(tr),
    'T10c kurs w locie, kurs na orbicie i smuga — gałąź kanoniczna wg `entry.canonical`, wzory ścieżki OFF co do znaku');
});

// ── T11 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Kontrola właściciela CV-1a (2026-11-11) — stager `cvBattle({ star })` / `cvParade({ star })`: układ do oglądania pod
// najciemniejszą (1) / najjaśniejszą (2) gwiazdą wśród wygenerowanych (liczby — polecenia konsoli bez cudzysłowów).
const ST = await tryImport('../../debug/CvBattleStager.js');
await block('T11 stager: układ pod najciemniejszą / najjaśniejszą gwiazdą (wygenerowane układy, klasa wg jasności)', () => {
  const sys = [{ id: 'sys_home', cls: 'F' }, { id: 'sys_020', cls: 'G' }, { id: 'sys_063', cls: 'K' }, { id: 'sys_023', cls: 'K' }, { id: 'sys_x', cls: null }];
  const dim = ST.cvPickStarSystem({ star: 1, systems: sys, activeId: 'sys_home' });
  const dimHere = ST.cvPickStarSystem({ star: 1, systems: sys, activeId: 'sys_063' });
  const bright = ST.cvPickStarSystem({ star: 2, systems: sys, activeId: 'sys_063' });
  const withM = ST.cvPickStarSystem({ star: 1, systems: [...sys, { id: 'sys_009', cls: 'M' }], activeId: 'sys_home' });
  assert(dim?.systemId === 'sys_023' && dim.cls === 'K' && dimHere?.systemId === 'sys_063' && bright?.systemId === 'sys_home' && bright.cls === 'F'
    && withM?.systemId === 'sys_009' && withM.cls === 'M' && withM.classes.join() === 'M,K,G,F',
    `T11a star 1 — najciemniejsza klasa (oglądany układ, gdy pasuje, inaczej pierwszy wg id), star 2 — najjaśniejsza (${dim?.systemId}, ${dimHere?.systemId}, ${bright?.systemId}, ${withM?.systemId})`);
  assert([0, 3, 'x', null].every((v) => ST.cvPickStarSystem({ star: v, systems: sys }) === null) && ST.cvPickStarSystem({ star: 1, systems: [] }) === null,
    'T11b inna wartość `star` albo brak układów z klasą gwiazdy — null (stager nie przełącza widoku)');
});

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
