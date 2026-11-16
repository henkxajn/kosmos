// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ship_anchors_smoke — KEEPER ARC KONSOLE, krok K1b (kotwice modułów: dane + loader + domyślne, tryb «kotwice» Model
// Workshopu, podgląd na hologramie). Plan: `docs/design/CONSOLES_PLAN.md` §2 B3 / B5, D-K-8, D-K-9. Tylko logika
// (bez pinów na stałych rysunku).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
//   A1 schemat: tabela przyjmij / odrzuć (nieznany klucz, nieznana rola, powtórzona rola, nieskończona / poza zakresem
//      współrzędna, zła wersja, zły slot); każdy plik z dysku `anchors/` poprawny (świadek: zepsuta kopia odrzucona).
//   A2 domyślne: 24 dokumenty hardpointów z dysku — 6 ról w kolejności, drive = dysza, deterministyczne, różne punkty,
//      dziób wg ramy (slot z dziobem +X ma uzbrojenie po +X), grzbiet nad brzuchem; nigdy nie rzuca na śmieciach.
//   A3 loader: plik nad domyślnymi, plik niepoprawny / zły slot ⇒ same domyślne, śmieci nie rzucają; pamięć: brak pliku,
//      wyjątek fetch, plik niepoprawny (jedno ostrzeżenie), równoległe prośby = jedno żądanie.
//   A4 moduł → rola: KAŻDY moduł `SHIP_MODULES` ma rolę; mapowanie z planu; grupowanie; kontrola: nieznany typ ⇒ null.
//   A5 WorkshopLogic: postaw / przesuń / przywróć / zapis — obieg przez tekst pliku; no-op bez nowego stanu; dokument
//      hardpointów i jego podpis NIE widzą kotwic; sesja niesie kotwice; «z pliku» przywraca kotwice.
//   A6 układ etykiet: bez nakładania na jednej stronie, w prostokącie, deterministyczny; `label:false` — sam znacznik.
//   A7 hologram (prawdziwy three r171, atrapa GL): kotwice wczytywane LENIWIE (0 żądań przy setModel/draw); rzut — plan:
//      dziób w lewo, grzbiet nad brzuchem, punkt w obu pasach; 3/4 — dziób w lewo; bbox znormalizowany modelu.
//   A8 nietknięte: ścisły schemat hardpointów dalej odrzuca klucz `anchors`; brak kotwic w ShipHardpointsSchema.
//   A9 i18n: `shipAnchor.<rola>` w PL i EN; podgląd debug bez cudzysłowów (`KOSMOS.debug.holo.anchors()`).
//   A10 (przegląd właściciela K1b): uzbrojenie domyślne = środek wieżyczek W1…Wn (gdy są), każdy punkt domyślny przyciągnięty do
//      kadłuba — na PRAWDZIWYCH siatkach 24 modeli (GLB czytane przez @gltf-transform): ≤ SNAP_EPS od siatki, deterministyczne;
//      najbliższy punkt trójkąta sprawdzony niezależnie (gęste próbkowanie trójkąta); hologram i Workshop podają siatkę.
// ⚠ Moduły nowe importowane dynamicznie — przy braku modułu piny DEGRADUJĄ (czerwone), suita się nie przerywa.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { SHIP_MODULES } from '../../data/ShipModulesData.js';
import { VESSEL_MODEL_KEYS } from '../../renderer/VesselModelResolver.js';

let pass = 0, fail = 0;
const assert = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const safe = (f, d = null) => { try { return f(); } catch (e) { return d; } };
const section = async (name, fn) => { console.log('\n── ' + name + ' ──'); try { await fn(); } catch (e) { fail++; console.log(`  ✗ ${name}: wyjątek ${e?.stack?.split('\n').slice(0, 3).join(' | ') ?? e}`); } };
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

const SCH = await tryImport('../../data/ShipAnchorsSchema.js');
const AN = await tryImport('../../renderer/ShipAnchors.js');
const WL = await tryImport('../../../tools/model-workshop/WorkshopLogic.js');
const OV = await tryImport('../../ui/ShipAnchorOverlayLogic.js');
const HPS = await import('../../data/ShipHardpointsSchema.js');
assert(!!SCH && !!AN && !!WL && !!OV, 'A0 ShipAnchorsSchema / ShipAnchors / WorkshopLogic / ShipAnchorOverlayLogic importują się');

const ROLES = ['drive', 'weapons', 'defence', 'hold', 'mission', 'habitat'];
const hpDir = new URL('../../../assets/models/ships/hardpoints/', import.meta.url);
const ancDir = new URL('../../../assets/models/ships/anchors/', import.meta.url);
const hpDoc = (slot) => JSON.parse(readFileSync(new URL(slot + '.json', hpDir), 'utf8'));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// ═══ A1 schemat ═══
await section('A1 schemat kotwic (D-K-9)', async () => {
  const v = (d, o) => safe(() => SCH.validateAnchors(d, o), { ok: null, errors: ['wyjątek'] });
  assert(JSON.stringify(SCH.ANCHOR_ROLES) === JSON.stringify(ROLES), 'A1 role (≤ 6, D-K-8): drive, weapons, defence, hold, mission, habitat');
  const good = { v: 1, slot: 'warp_frigate', anchors: [{ role: 'drive', p: [0.45, 0, 0] }, { role: 'weapons', p: [-0.2, 0.05, 0] }] };
  const table = [
    ['poprawny', good, true],
    ['pusta lista', { v: 1, slot: 'warp_frigate', anchors: [] }, true],
    ['wszystkie 6 ról', { v: 1, slot: 'x', anchors: ROLES.map((role, i) => ({ role, p: [i / 10 - 0.3, 0, 0] })) }, true],
    ['nieznany klucz na górze', { ...good, notes: 'x' }, false],
    ['nieznany klucz w kotwicy', { ...good, anchors: [{ role: 'drive', p: [0, 0, 0], d: [1, 0, 0] }] }, false],
    ['nieznana rola', { ...good, anchors: [{ role: 'shields', p: [0, 0, 0] }] }, false],
    ['powtórzona rola', { ...good, anchors: [{ role: 'hold', p: [0, 0, 0] }, { role: 'hold', p: [0.1, 0, 0] }] }, false],
    ['NaN', { ...good, anchors: [{ role: 'drive', p: [NaN, 0, 0] }] }, false],
    ['Infinity', { ...good, anchors: [{ role: 'drive', p: [0, Infinity, 0] }] }, false],
    ['poza przestrzenią', { ...good, anchors: [{ role: 'drive', p: [0, 1.5, 0] }] }, false],
    ['p = 2 liczby', { ...good, anchors: [{ role: 'drive', p: [0, 0] }] }, false],
    ['p = tekst', { ...good, anchors: [{ role: 'drive', p: ['0', 0, 0] }] }, false],
    ['wersja 2', { ...good, v: 2 }, false],
    ['brak slotu', { v: 1, anchors: [] }, false],
    ['slot z wielkich liter', { ...good, slot: 'Warp_Frigate' }, false],
    ['anchors nie tablica', { ...good, anchors: {} }, false],
    ['kotwica = null', { ...good, anchors: [null] }, false],
    ['dokument = tablica', [], false],
    ['dokument = null', null, false],
  ];
  const bad = table.filter(([, d, want]) => v(d).ok !== want);
  assert(bad.length === 0, `A1 tabela przyjmij / odrzuć — ${table.length} przypadków` + (bad.length ? ' ✗ ' + bad.map((b) => b[0]).join(', ') : ''));
  assert(v(good, { slot: 'warp_frigate' }).ok === true && v(good, { slot: 'warp_destroyer' }).ok === false, 'A1 oczekiwany slot (nazwa pliku) — niezgodność to błąd');
  // tekst pliku → parse → ten sam dokument, kolejność ról kanoniczna
  const shuffled = { v: 1, slot: 'x', anchors: [{ role: 'habitat', p: [0.1, 0.2, -0.05] }, { role: 'drive', p: [0.5, 0, 0] }] };
  const txt = safe(() => SCH.formatAnchorsJson(shuffled), '');
  const back = safe(() => JSON.parse(txt), null);
  assert(!!back && v(back).ok && back.anchors[0].role === 'drive' && back.anchors[1].role === 'habitat' && txt.endsWith('}\n') && !txt.includes('\r'),
    'A1 formatAnchorsJson: poprawny JSON, role w kolejności ANCHOR_ROLES, LF i nowa linia na końcu');
  // pliki z dysku
  const files = existsSync(ancDir) ? readdirSync(ancDir).filter((f) => f.endsWith('.json')) : [];
  const badFiles = files.filter((f) => !v(JSON.parse(readFileSync(new URL(f, ancDir), 'utf8')), { slot: f.replace(/\.json$/, '') }).ok);
  const unknownSlot = files.filter((f) => !VESSEL_MODEL_KEYS.includes(f.replace(/\.json$/, '')));
  assert(badFiles.length === 0 && unknownSlot.length === 0, `A1 pliki anchors/ z dysku: ${files.length}, wszystkie poprawne i dla kluczy modeli gry`
    + (badFiles.length ? ' ✗ ' + badFiles.join(', ') : '') + (unknownSlot.length ? ' ✗ obce: ' + unknownSlot.join(', ') : ''));
  const corrupt = { ...good, anchors: [...good.anchors, { role: 'drive', p: [0, 0, 0] }] };
  assert(v(corrupt).ok === false, 'A1 świadek: zepsuta kopia (powtórzona rola) odrzucona — pin plików z dysku nie jest pustym «every»');
});

// ═══ A2 domyślne ═══
const BBOX = { min: [-0.5, -0.12, -0.18], max: [0.5, 0.12, 0.18] };
await section('A2 kotwice domyślne (§2 B3)', async () => {
  let okAll = 0, det = 0, sep = 0, drive = 0, dorsal = 0, bowSide = 0;
  for (const slot of VESSEL_MODEL_KEYS) {
    const hp = hpDoc(slot);
    const a = AN.computeDefaultAnchors({ hardpoints: hp, bbox: BBOX });
    const b = AN.computeDefaultAnchors({ hardpoints: JSON.parse(JSON.stringify(hp)), bbox: { min: [...BBOX.min], max: [...BBOX.max] } });
    if (a.length === 6 && a.every((x, i) => x.role === ROLES[i] && x.p.every(Number.isFinite) && x.p.every((c) => Math.abs(c) <= 1))) okAll++;
    if (JSON.stringify(a) === JSON.stringify(b)) det++;
    let minD = Infinity;
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) minD = Math.min(minD, dist(a[i].p, a[j].p));
    if (minD >= AN.ANCHOR_MIN_SEPARATION) sep++;
    if (dist(a[0].p, hp.nozzles[0].p) < 1e-4) drive++;
    const up = hp.frame.up, by = (r) => a.find((x) => x.role === r).p, d = (p, v) => p[0] * v[0] + p[1] * v[1] + p[2] * v[2];
    // strona widoczna z kamery 3/4: żadna rola reguły pod spodem (składowa «góra» ≥ 0) i każda na grzbiecie albo prawej burcie
    const right = [up[1] * hp.frame.bow[2] - up[2] * hp.frame.bow[1], up[2] * hp.frame.bow[0] - up[0] * hp.frame.bow[2], up[0] * hp.frame.bow[1] - up[1] * hp.frame.bow[0]];
    if (['weapons', 'defence', 'hold', 'mission', 'habitat'].filter((r) => r !== 'weapons' || !AN.turretCentroid(hp)).every((r) => d(by(r), up) >= -1e-9 && (d(by(r), up) > 0.01 || d(by(r), right) > 0.01))) dorsal++;
    if (d(by('mission'), hp.frame.bow) > 0.1 && d(by('habitat'), hp.frame.bow) < -0.1) bowSide++;
  }
  const n = VESSEL_MODEL_KEYS.length;
  assert(n === 24, 'A2 świadek: 24 klucze modeli');
  assert(okAll === n, `A2 6 ról w kolejności ANCHOR_ROLES, punkty skończone w przestrzeni (${okAll}/${n})`);
  assert(det === n, `A2 deterministyczne — te same wejścia ⇒ te same punkty (${det}/${n})`);
  assert(sep === n, `A2 żadne dwie role nie wypadają w jednym miejscu (≥ ${AN.ANCHOR_MIN_SEPARATION}) (${sep}/${n})`);
  assert(drive === n, `A2 drive = dysza z pliku hardpointów (${drive}/${n})`);
  assert(dorsal === n, `A2 role reguły po stronie widocznej z kamery 3/4 (grzbiet / prawa burta, nic pod spodem) (${dorsal}/${n})`);
  assert(bowSide === n, `A2 misja przed śródokręciem / habitat na rufie wzdłuż «dziobu» ramy z pliku (${bowSide}/${n})`);
  const plusX = hpDoc('nonwarp_large_science');
  const w = AN.computeDefaultAnchors({ hardpoints: plusX, bbox: BBOX }).find((x) => x.role === 'mission').p;
  assert(plusX.frame.bow[0] > 0 && w[0] > 0.15, 'A2 slot z dziobem +X (nonwarp_large_science) — misja (0,2 ku dziobowi) po +X (rama z pliku, nie stałe −X)');
  // kontrola: inny bbox ⇒ inne punkty (pin zależy od bbox), dysza bez zmian
  const c = AN.computeDefaultAnchors({ hardpoints: hpDoc('warp_frigate'), bbox: { min: [-0.5, -0.3, -0.3], max: [0.5, 0.3, 0.3] } });
  const c0 = AN.computeDefaultAnchors({ hardpoints: hpDoc('warp_frigate'), bbox: BBOX });
  assert(JSON.stringify(c[4].p) !== JSON.stringify(c0[4].p) && JSON.stringify(c[0].p) === JSON.stringify(c0[0].p), 'A2 kontrola: bbox zmienia role reguły (misja), dysza bez zmian');
  const junk = [undefined, null, {}, { hardpoints: 5 }, { hardpoints: { frame: { bow: [0, 0, 0], up: [NaN, 1, 0] }, nozzles: [{ p: 'x' }] } },
    { bbox: { min: [1, 1, 1], max: [0, 0, 0] } }, { bbox: { min: [NaN, 0, 0], max: [1, 1, 1] } }, { hardpoints: { frame: { bow: [0, 1, 0], up: [0, 1, 0] } } }];
  const r = junk.map((j) => safe(() => AN.computeDefaultAnchors(j), null));
  assert(r.every((x) => Array.isArray(x) && x.length === 6 && x.every((q) => q.p.every(Number.isFinite))), 'A2 śmieci na wejściu — nie rzuca, 6 skończonych punktów');
});

// ═══ A3 loader ═══
await section('A3 loader: plik nad domyślnymi, nigdy nie rzuca', async () => {
  const hp = hpDoc('warp_destroyer');
  const file = { v: 1, slot: 'warp_destroyer', anchors: [{ role: 'weapons', p: [-0.1, 0.09, 0.02] }, { role: 'hold', p: [0.05, -0.08, 0] }] };
  const r = AN.anchorsFor('warp_destroyer', { file, hardpoints: hp, bbox: BBOX });
  const def = AN.computeDefaultAnchors({ hardpoints: hp, bbox: BBOX });
  assert(r.anchors.length === 6 && r.anchors.every((a, i) => a.role === ROLES[i]) && r.fromFile === 2 && r.fileOk === true, 'A3 6 ról, 2 z pliku');
  assert(JSON.stringify(r.anchors[1].p) === JSON.stringify(file.anchors[0].p) && r.anchors[1].src === 'file'
    && JSON.stringify(r.anchors[3].p) === JSON.stringify(file.anchors[1].p) && r.anchors[3].src === 'file', 'A3 role z pliku = punkty pliku, src «file»');
  assert([0, 2, 4, 5].every((i) => r.anchors[i].src === 'default' && JSON.stringify(r.anchors[i].p) === JSON.stringify(def[i].p)), 'A3 pozostałe role = domyślne, src «default»');
  const wrongSlot = AN.anchorsFor('warp_frigate', { file, hardpoints: hp, bbox: BBOX });
  assert(wrongSlot.fromFile === 0 && wrongSlot.fileOk === false, 'A3 plik innego klucza ⇒ same domyślne (fileOk false)');
  const corrupt = AN.anchorsFor('warp_destroyer', { file: { ...file, extra: 1 }, hardpoints: hp, bbox: BBOX });
  assert(corrupt.fromFile === 0 && corrupt.fileOk === false && corrupt.anchors.every((a) => a.src === 'default'), 'A3 plik niepoprawny ⇒ w całości pominięty');
  const junk = [[undefined], [null, null], [42, { file: 'x' }], ['warp_frigate', { file: [], hardpoints: [], bbox: 'x' }], ['a', { file: { v: 1, slot: 'a', anchors: [{ role: 'drive', p: [1, 2] }] } }]];
  assert(junk.every((args) => { const x = safe(() => AN.anchorsFor(...args), null); return x && x.anchors.length === 6; }), 'A3 śmieci — anchorsFor nie rzuca, zawsze 6 kotwic');
  // pamięć podręczna
  const calls = [];
  const warns = [];
  const docs = { warp_frigate: { v: 1, slot: 'warp_frigate', anchors: [{ role: 'drive', p: [0.48, 0, 0] }] }, warp_destroyer: { v: 1, slot: 'x', anchors: [] } };
  const cache = new AN.ShipAnchorsCache({ fetchJson: async (url) => { calls.push(url); if (url.includes('boom')) throw new Error('net'); return docs[url.match(/([a-z_]+)\.json$/)[1]] ?? null; },
    warn: (m) => warns.push(m) });
  const [a1, a2] = await Promise.all([cache.load('warp_frigate'), cache.load('warp_frigate')]);
  assert(a1 === a2 && a1?.anchors?.length === 1 && calls.length === 1 && calls[0] === 'assets/models/ships/anchors/warp_frigate.json', 'A3 równoległe prośby — jedno żądanie, właściwy URL');
  assert((await cache.load('nonwarp_frigate')) === null && cache.get('nonwarp_frigate') === null && cache.get('nope') === undefined, 'A3 brak pliku ⇒ null (domyślne), niewczytany ⇒ undefined');
  assert((await cache.load('boom')) === null, 'A3 wyjątek fetch ⇒ null (nie odrzuca)');
  const inv = await cache.load('warp_destroyer');
  await cache.load('warp_destroyer');
  assert(inv === null && warns.length === 1 && warns[0].includes('warp_destroyer'), 'A3 plik niepoprawny (zły slot) ⇒ null + jedno ostrzeżenie');
  assert(cache.anchorsFor('warp_frigate', { hardpoints: hpDoc('warp_frigate'), bbox: BBOX }).anchors[0].src === 'file', 'A3 cache.anchorsFor używa wczytanego pliku');
  cache.invalidate('warp_frigate');
  assert(cache.get('warp_frigate') === undefined, 'A3 invalidate — następny load wczyta plik ponownie');
  const noFetch = new AN.ShipAnchorsCache({});
  assert((await noFetch.load('warp_frigate')) === null && (await noFetch.load('../evil')) === null, 'A3 bez fetch / zły klucz ⇒ null');
});

// ═══ A4 moduł → rola ═══
await section('A4 moduł → rola (pełne pokrycie ShipModulesData)', async () => {
  const ids = Object.keys(SHIP_MODULES);
  const unmapped = ids.filter((id) => !SCH.moduleAnchorRole(SHIP_MODULES[id]));
  assert(ids.length >= 30, `A4 świadek: ${ids.length} modułów`);
  assert(unmapped.length === 0, 'A4 KAŻDY moduł ma rolę' + (unmapped.length ? ' ✗ ' + unmapped.join(', ') : ''));
  const want = { propulsion: 'drive', weapon: 'weapons', armor: 'defence', shield: 'defence', cargo: 'hold', fuel: 'hold', science: 'mission', special: 'mission', troop: 'mission', habitat: 'habitat' };
  const wrong = ids.filter((id) => SCH.moduleAnchorRole(SHIP_MODULES[id]) !== want[SHIP_MODULES[id].slotType]);
  assert(wrong.length === 0, 'A4 mapowanie wg planu (napęd, broń, pancerz+tarcza, ładownia+paliwo/warp, nauka+specjalne+desant, habitat)');
  assert(SCH.moduleAnchorRole(SHIP_MODULES.warp_tank) === 'hold' && SCH.moduleAnchorRole(SHIP_MODULES.shield_basic) === 'defence', 'A4 zbiornik warp → hold, tarcza → defence');
  assert(Object.values(SCH.MODULE_ROLE_BY_SLOT_TYPE).every((r) => ROLES.includes(r)), 'A4 mapowanie wskazuje tylko istniejące role');
  assert(SCH.moduleAnchorRole({ slotType: 'nope' }) === null && SCH.moduleAnchorRole(null) === null && SCH.moduleAnchorRole({ slotType: 'toString' }) === null,
    'A4 kontrola: nieznany typ slotu / null / klucz prototypu ⇒ null');
  const g = AN.groupModulesByRole(['engine_ion', 'weapon_laser', 'armor_standard', 'shield_basic', 'cargo_small', 'xyz'], SHIP_MODULES);
  assert(g.groups.drive[0] === 'engine_ion' && g.groups.defence.join() === 'armor_standard,shield_basic' && g.unmapped.join() === 'xyz' && Object.keys(g.groups).join() === ROLES.join(),
    'A4 grupowanie po rolach (K1c — lista na jednej linii), nieznany id ⇒ unmapped');
});

// ═══ A5 WorkshopLogic ═══
await section('A5 Workshop — postaw / przesuń / przywróć / zapis', async () => {
  const slot = 'warp_frigate';
  const doc = hpDoc(slot);
  const base = WL.editFromDoc(doc);
  const e0 = WL.withAnchors(base, null, slot);
  assert(JSON.stringify(e0.anchors) === '{}', 'A5 brak pliku kotwic ⇒ żadna rola nie postawiona');
  const e1 = WL.placeAnchor(e0, 'weapons', [-0.21234567, 0.0612, 0.00001]);
  const e2 = WL.moveAnchor(e1, 'weapons', [-0.2, 0.07, 0]);
  const e3 = WL.placeAnchor(e2, 'habitat', [0.25, 0.05, -0.01]);
  assert(e1 !== e0 && e1.anchors.weapons && !e0.anchors.weapons, 'A5 postaw — nowy stan, stary nietknięty');
  assert(JSON.stringify(e2.anchors.weapons) === JSON.stringify([-0.2, 0.07, 0]), 'A5 przesuń — nowy punkt roli');
  assert(WL.placeAnchor(e3, 'shields', [0, 0, 0]) === e3 && WL.placeAnchor(e3, 'drive', [NaN, 0, 0]) === e3, 'A5 nieznana rola / punkt nieskończony ⇒ ten sam stan');
  const e4 = WL.resetAnchor(e3, 'weapons');
  assert(!('weapons' in e4.anchors) && 'habitat' in e4.anchors && WL.resetAnchor(e4, 'weapons') === e4, 'A5 przywróć domyślną usuwa rolę; drugi raz — ten sam stan (bez pustego kroku)');
  const r = WL.anchorsDocFromEdit(slot, e3);
  assert(r.ok && r.doc.anchors.map((a) => a.role).join() === 'weapons,habitat' && SCH.validateAnchors(r.doc, { slot }).ok, 'A5 zapis: tylko postawione role, kolejność ANCHOR_ROLES, dokument poprawny');
  const text = SCH.formatAnchorsJson(r.doc);
  const reload = WL.withAnchors(base, JSON.parse(text), slot);
  assert(WL.anchorsSignature(slot, reload) === WL.anchorsSignature(slot, e3) && JSON.stringify(reload.anchors.habitat) === JSON.stringify([0.25, 0.05, -0.01]),
    'A5 obieg: stan → tekst pliku → stan — ten sam podpis i punkty');
  const rr = WL.anchorsDocFromEdit(slot, WL.placeAnchor(e0, 'drive', [-0.212345678, 0, 0]));
  assert(rr.doc.anchors[0].p[0] === -0.2123, 'A5 punkty zaokrąglone do 4 miejsc (jak hardpointy)');
  assert(WL.anchorsDocFromEdit(slot, { ...e0, anchors: { hold: [0, 2, 0] } }).ok === false && WL.anchorsDocFromEdit(slot, { ...e0, anchors: { foo: [0, 0, 0] } }).ok === false,
    'A5 punkt poza przestrzenią / nieznana rola ⇒ odmowa (żaden niepoprawny plik nie powstaje)');
  // gra czyta to, co zapisał Workshop
  const g = AN.anchorsFor(slot, { file: JSON.parse(text), hardpoints: doc, bbox: BBOX });
  assert(g.fromFile === 2 && g.anchors.find((a) => a.role === 'weapons').src === 'file', 'A5 plik z Workshopu wczytuje się w grze (anchorsFor) z tymi samymi rolami');
  // hardpointy ślepe na kotwice
  assert(WL.editSignature(doc, e0) === WL.editSignature(doc, e3) && JSON.stringify(WL.buildDoc(doc, e3)) === JSON.stringify(WL.buildDoc(doc, e0)),
    'A5 dokument i podpis hardpointów nie widzą kotwic (zapis hardpointów bez zmian)');
  assert(!('anchors' in WL.buildDoc(doc, e3)) && WL.docFromEdit(doc, e3).ok, 'A5 dokument hardpointów bez klucza anchors, dalej poprawny');
  // sesja i «z pliku»
  const h = WL.createHistory(e3);
  const back = WL.restoreSession(WL.sessionSnapshot({ slot, history: h, fileSig: 'x' }));
  assert(back && JSON.stringify(back.history.present.anchors) === JSON.stringify(e3.anchors), 'A5 sesja (przeładowanie po zapisie) niesie kotwice');
  const old = WL.restoreSession(WL.sessionSnapshot({ slot, history: WL.createHistory(base), fileSig: 'x' }));
  assert(!!old && old.history.present.anchors === undefined, 'A5 sesja sprzed K1b (bez pola anchors) dalej się wczytuje');
  assert(WL.restoreSession(WL.sessionSnapshot({ slot, history: WL.createHistory({ ...e3, anchors: [1] }) })) === null, 'A5 sesja z anchors = tablica ⇒ odrzucona');
  const fileEdit = WL.withAnchors(base, JSON.parse(text), slot);
  const rev = WL.revertPart(WL.resetAllAnchors(fileEdit), fileEdit, 'anchors');
  assert(WL.anchorsSignature(slot, rev) === WL.anchorsSignature(slot, fileEdit) && JSON.stringify(WL.resetAllAnchors(fileEdit).anchors) === '{}', 'A5 «wszystkie domyślne» i «z pliku»');
  const rows = WL.anchorRows(e3, AN.computeDefaultAnchors({ hardpoints: doc, bbox: BBOX }));
  assert(rows.length === 6 && rows[1].src === 'file' && rows[0].src === 'default' && rows.every((x) => x.def && x.p), 'A5 wiersze podglądu: 6 ról, źródło, punkt domyślny (blade kółka)');
  const ws = stripComments(src('../../../tools/model-workshop/workshop.js'));
  assert(/WL\.placeAnchor\(/.test(ws) && /WL\.moveAnchor\(/.test(ws) && /WL\.resetAnchor\(/.test(ws) && /WL\.anchorsDocFromEdit\(/.test(ws)
    && /computeDefaultAnchors\(/.test(ws) && /formatAnchorsJson\(/.test(ws), 'A5 strona woła logikę (postaw / przesuń / przywróć / zapis) i domyślne gry');
  assert(/writeDocTo\(dir, S\.slot, S\.variant, text\)/.test(ws) && /getHardpointsDir\(\)/.test(ws) && /formatHardpointsJson\(r\.doc\)/.test(ws),
    'A5 ścieżka zapisu hardpointów nietknięta (writeDocTo / getHardpointsDir / formatHardpointsJson)');
  const html = src('../../../tools/model-workshop/index.html');
  assert(['bow', 'nozzle', 'weapons', 'lights', 'select', 'anchors'].every((m) => html.includes(`data-mode="${m}"`)) && html.includes('id="ancSaveBtn"') && html.includes('id="saveBtn"'),
    'A5 tryby strony: wszystkie dotychczasowe + «anchors»; dwa osobne przyciski zapisu');
});

// ═══ A6 układ etykiet ═══
await section('A6 układ etykiet (idiom HUD)', async () => {
  const rect = { x: 100, y: 50, w: 900, h: 640 };
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let overlaps = 0, outside = 0, sets = 0;
  for (let k = 0; k < 300; k++) {
    const items = ROLES.map((role) => ({ key: role, x: rect.x + 60 + rnd() * (rect.w - 120), y: rect.y + 20 + rnd() * (rect.h - 40), text: role.toUpperCase(), label: true }));
    if (k % 3 === 0) items.forEach((it) => { it.x = rect.x + rect.w / 2 + (rnd() - 0.5) * 40; it.y = rect.y + rect.h / 2 + (rnd() - 0.5) * 30; });   // ciasno w środku
    const out = OV.layoutAnchorLabels(items, rect, { measure: (s) => s.length * 6.5 });
    sets++;
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) if (out[i].side === out[j].side && OV.labelsOverlap(out[i], out[j])) overlaps++;
    for (const e of out) if (e.line[0] < rect.x || e.line[1] > rect.x + rect.w || e.elbow[1] - OV.ANCHOR_OVERLAY.ROW_H < rect.y || e.elbow[1] > rect.y + rect.h) outside++;
  }
  assert(sets === 300 && overlaps === 0, `A6 etykiety jednej strony się nie nakładają (300 zestawów, ⅓ ciasno w środku): ${overlaps}`);
  assert(outside === 0, `A6 etykiety w prostokącie gospodarza: ${outside} poza`);
  const two = OV.layoutAnchorLabels([{ key: 'a', x: 200, y: 300, text: 'A' }, { key: 'b', x: 200, y: 300, text: 'B' }], rect);
  assert(OV.labelsOverlap(two[0], { ...two[0] }) === true, 'A6 kontrola: ta sama etykieta nakłada się sama na siebie (pin nakładania działa)');
  const lr = OV.layoutAnchorLabels([{ key: 'l', x: 200, y: 300, text: 'L' }, { key: 'r', x: 900, y: 300, text: 'R' }], rect);
  assert(lr[0].side === -1 && lr[0].line[1] <= 200 && lr[1].side === 1 && lr[1].line[0] >= 900, 'A6 etykiety na zewnątrz (lewa połowa → w lewo, prawa → w prawo)');
  const nl = OV.layoutAnchorLabels([{ key: 't', x: 500, y: 500, text: 'T', label: false }], rect);
  assert(nl.length === 1 && nl[0].elbow === null && nl[0].side === 0, 'A6 label:false — sam znacznik (widok «góra» planu)');
  const a = JSON.stringify(OV.layoutAnchorLabels(two, rect)), b = JSON.stringify(OV.layoutAnchorLabels(two, rect));
  assert(a === b, 'A6 deterministyczny');
});

// ═══ A7 hologram ═══
await section('A7 hologram: leniwe wczytanie + rzut kotwic (three r171)', async () => {
  const THREE = await import(new URL('../../lib/three.module.js', import.meta.url).href);
  const R = await import('../../renderer/ShipHologramRenderer.js');
  const fake2d = () => ({ save() {}, restore() {}, drawImage() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, closePath() {},
    fillText() {}, getTransform: () => ({ a: 1 }) });
  const fakeCanvas = (w = 1, h = 1) => ({ width: w, height: h, getContext: () => fake2d(), addEventListener() {}, removeEventListener() {} });
  const fakeGL = (canvas) => ({ canvas, autoClear: true, clear() {}, setScissorTest() {}, setScissor() {}, setViewport() {}, render() {}, setSize() {},
    setPixelRatio() {}, setClearColor() {}, dispose() {}, forceContextLoss() {}, getContext: () => ({ getExtension: () => null, readPixels() {}, RGBA: 1, UNSIGNED_BYTE: 1 }) });
  // statek: kadłub wzdłuż X (dziób −X), długość 2, grzbiet +Y — bbox znany analitycznie
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 0.6), new THREE.MeshStandardMaterial()));
  const calls = [];
  const hp = { frame: { bow: [-1, 0, 0], up: [0, 1, 0] }, nozzles: [{ p: [0.5, 0, 0], d: [1, 0, 0], r: 0.04 }] };
  const ren = new R.ShipHologramRenderer({ THREE, createCanvas: fakeCanvas, createGL: (c) => fakeGL(c),
    loadTemplate: async () => ({ template: root, path: 'assets/models/ships/warp_frigate.glb' }), loadFrame: async () => hp.frame,
    loadAnchors: async (key, hpSlot) => { calls.push([key, hpSlot]); return { hardpoints: hp, file: { v: 1, slot: 'warp_frigate', anchors: [{ role: 'hold', p: [0, -0.1, 0] }] } }; },
    getColor: () => '#ffb000', getEpoch: () => 1, now: () => 0, onChange: () => {} });
  ren.setModel('warp_frigate');
  await settle();
  const rect = { x: 0, y: 0, w: 900, h: 640 };
  ren.draw(fakeCanvas().getContext(), rect);
  assert(calls.length === 0, 'A7 setModel + draw — 0 wczytań kotwic (leniwie, bez żądań przy samym hologramie)');
  const nb = ren._model?.normBox;
  assert(!!nb && Math.abs(nb.max[0] - 0.5) < 1e-6 && Math.abs(nb.max[1] - 0.1) < 1e-6 && Math.abs(nb.min[2] + 0.15) < 1e-6, 'A7 bbox modelu w przestrzeni znormalizowanej (2×0,4×0,6 → ±0,5 / ±0,1 / ±0,15)');
  assert(ren.anchors() === null && ren.anchors() === null, 'A7 pierwsze anchors() — null (wczytuje), drugie w trakcie — null');
  await settle();
  assert(calls.length === 1 && calls[0][0] === 'warp_frigate' && calls[0][1] === 'warp_frigate', 'A7 jedno wczytanie na klucz (klucz modelu + slot hardpointów)');
  const a = ren.anchors();
  assert(!!a && a.anchors.length === 6 && a.fromFile === 1 && a.anchors[3].src === 'file' && a.anchors[0].src === 'default', 'A7 kotwice: plik nad domyślnymi');
  const by = (pts, role, view) => pts.find((q) => a.anchors[q.i].role === role && q.view === view);
  ren.setSpin(false); ren.setMode('plan');
  ren.draw(fakeCanvas().getContext(), rect);
  const P = ren.projectPoints(a.anchors.map((x) => x.p), rect);
  assert(P.length === 12 && P.filter((q) => q.view === 'side').length === 6 && P.filter((q) => q.view === 'top').length === 6, 'A7 plan: każda kotwica w obu pasach (bok + góra)');
  assert(by(P, 'weapons', 'side').x < by(P, 'drive', 'side').x && by(P, 'weapons', 'top').x < by(P, 'habitat', 'top').x, 'A7 plan: dziób w lewo (uzbrojenie na lewo od napędu)');
  assert(by(P, 'weapons', 'side').y < by(P, 'mission', 'side').y,'A7 plan, bok: grzbiet nad brzuchem');
  assert(by(P, 'defence', 'top').y > by(P, 'hold', 'top').y, 'A7 plan, góra: prawa burta (+Z) w dół ekranu — jak rysunek techniczny');
  assert(P.every((q) => q.x >= rect.x && q.x <= rect.x + rect.w && q.y >= rect.y && q.y <= rect.y + rect.h), 'A7 plan: punkty w prostokącie');
  ren.setMode('3q');
  ren.draw(fakeCanvas().getContext(), rect);
  const Q = ren.projectPoints(a.anchors.map((x) => x.p), rect);
  assert(Q.length === 6 && Q.every((q) => q.view === '3q' && q.depth > 0), 'A7 3/4: jeden punkt na kotwicę, przed kamerą');
  assert(by(Q, 'weapons', '3q').x < by(Q, 'drive', '3q').x && by(Q, 'weapons', '3q').y < by(Q, 'mission', '3q').y, 'A7 3/4: dziób w lewo, grzbiet wyżej');
  ren.setForcedFallback(true);
  assert(ren.projectPoints([[0, 0, 0]], rect).length === 2, 'A7 sylwetka (fallback) — rzut jak plan (ten sam układ rysunku)');
  assert(safe(() => ren.projectPoints(null, rect), 'x').length === 0 && safe(() => ren.projectPoints([[1]], rect), 'x').length === 0, 'A7 śmieci — pusty wynik, bez wyjątku');
});

// ═══ A8 / A9 ═══
await section('A8 hardpointy nietknięte · A9 i18n i podgląd', async () => {
  const hp = hpDoc('warp_frigate');
  assert(HPS.validateHardpoints(hp).ok === true && HPS.validateHardpoints({ ...hp, anchors: [] }).ok === false, 'A8 ścisły schemat hardpointów: plik poprawny, klucz «anchors» dalej błędem (D-K-9 a)');
  assert(!/anchor/i.test(stripComments(src('../../data/ShipHardpointsSchema.js'))), 'A8 ShipHardpointsSchema bez kotwic');
  const pl = src('../../i18n/pl.js'), en = src('../../i18n/en.js');
  assert(ROLES.every((r) => pl.includes(`'shipAnchor.${r}':`) && en.includes(`'shipAnchor.${r}':`)), 'A9 etykiety ról w PL i EN');
  const dbg = stripComments(src('../../debug/ShipHologramDebug.js'));
  assert(/anchors:\s*\(\)\s*=>/.test(dbg) && /anchorsInfo:\s*\(\)\s*=>/.test(dbg) && /drawShipAnchors\(/.test(dbg), 'A9 KOSMOS.debug.holo.anchors() / anchorsInfo() bez argumentów (bez cudzysłowów)');
  const ov = stripComments(src('../../ui/ShipAnchorOverlay.js'));
  assert(/roles\.primary/.test(ov) && /setLineDash/.test(ov) && /src === 'file'/.test(ov) && !/#[0-9a-f]{3,6}\b/i.test(ov),
    'A9 nakładka: barwa z roli motywu (primary), domyślne odróżnione kryciem i przerywaną linią, bez stałych kolorów');
});

// ═══ A10 centroid wieżyczek + przyciąganie do kadłuba ═══
await section('A10 uzbrojenie = środek wieżyczek, domyślne na kadłubie (prawdziwe siatki)', async () => {
  // niezależna kontrola najbliższego punktu trójkąta: gęste próbkowanie barycentryczne
  let seed = 777; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) - 0.5;
  let worst = 0;
  for (let k = 0; k < 60; k++) {
    const a = [rnd(), rnd(), rnd()], b = [rnd(), rnd(), rnd()], c = [rnd(), rnd(), rnd()], p = [rnd() * 2, rnd() * 2, rnd() * 2];
    const q = AN.closestPointOnTriangle(p, a, b, c), dq = dist(p, q);
    let best = Infinity;
    const N = 60;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N - i; j++) {
      const u = i / N, v = j / N, w = 1 - u - v;
      best = Math.min(best, dist(p, [a[0] * w + b[0] * u + c[0] * v, a[1] * w + b[1] * u + c[1] * v, a[2] * w + b[2] * u + c[2] * v]));
    }
    worst = Math.max(worst, dq - best);   // dq ≤ best (z dokładnością do siatki próbek)
  }
  assert(worst <= 1e-9, `A10 najbliższy punkt trójkąta ≤ każdego z 1891 próbek trójkąta (60 losowych trójkątów; nadwyżka ${worst.toExponential(1)})`);
  assert(AN.closestPointOnMesh([0, 0, 0], null) === null && AN.closestPointOnMesh([0, 0, 0], new Float32Array(3)) === null && AN.closestPointOnMesh([NaN, 0, 0], new Float32Array(9)) === null,
    'A10 brak siatki / śmieci ⇒ null (domyślne bez przyciągania)');
  // siatki GLB
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const req = createRequire(new URL('../../../package.json', import.meta.url));
  const core = await import(pathToFileURL(req.resolve('@gltf-transform/core')).href);
  const ext = await import(pathToFileURL(req.resolve('@gltf-transform/extensions')).href);
  const io = new core.NodeIO().registerExtensions(ext.ALL_EXTENSIONS);
  const mul = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
  const meshOf = async (slot) => {
    const doc = await io.readBinary(new Uint8Array(readFileSync(new URL(`../../../assets/models/ships/${slot}.glb`, import.meta.url))));
    const raw = [];
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh(); if (!mesh) continue;
      const wm = node.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
        const n = idx ? idx.getCount() : pos.getCount();
        for (let i = 0; i < n; i++) raw.push(mul(wm, pos.getElement(idx ? idx.getScalar(i) : i, [])));
      }
    }
    const lo = [0, 1, 2].map((i) => Math.min(...raw.map((v) => v[i]))), hi = [0, 1, 2].map((i) => Math.max(...raw.map((v) => v[i])));
    const c = lo.map((v, i) => (v + hi[i]) / 2), m = Math.max(...hi.map((v, i) => v - lo[i]));
    const tris = new Float32Array(raw.length * 3);
    raw.forEach((v, k) => { for (let i = 0; i < 3; i++) tris[k * 3 + i] = (v[i] - c[i]) / m; });
    return { tris, bbox: { min: lo.map((v, i) => (v - c[i]) / m), max: hi.map((v, i) => (v - c[i]) / m) } };
  };
  let onHull = 0, det = 0, centroid = 0, withTurrets = 0, snappedAll = 0, worstD = 0, visible = 0;
  const report = [];
  for (const slot of VESSEL_MODEL_KEYS) {
    const hp = hpDoc(slot);
    const { tris, bbox } = await meshOf(slot);
    const d1 = AN.computeDefaultAnchors({ hardpoints: hp, bbox, triangles: tris });
    const d2 = AN.computeDefaultAnchors({ hardpoints: JSON.parse(JSON.stringify(hp)), bbox, triangles: tris.slice() });
    if (JSON.stringify(d1) === JSON.stringify(d2)) det++;
    const nz = hp.nozzles[0].p.map((x) => Math.round(x * 1e4) / 1e4 || 0);
    if (d1.slice(1).every((a) => a.snapped === true) && d1[0].snapped !== true && JSON.stringify(d1[0].p) === JSON.stringify(nz)) snappedAll++;
    const vis = (q) => { const f = AN.anchorFrame(hp.frame); return q[0] * f.up[0] + q[1] * f.up[1] + q[2] * f.up[2] >= -0.005 || q[0] * f.right[0] + q[1] * f.right[1] + q[2] * f.right[2] > 0; };
    if (vis(d1[3].p) && vis(d1[4].p)) visible++;
    const ds = d1.slice(1).map((a) => AN.closestPointOnMesh(a.p, tris).d);
    worstD = Math.max(worstD, ...ds);
    if (ds.every((x) => x <= AN.SNAP_EPS)) onHull++;
    const tc = AN.turretCentroid(hp);
    if (tc) {
      withTurrets++;
      const plain = AN.computeDefaultAnchors({ hardpoints: hp, bbox }).find((a) => a.role === 'weapons').p;
      const snap = AN.closestPointOnMesh(tc, tris).p.map((x) => Math.round(x * 1e4) / 1e4 || 0);
      if (dist(plain, tc) < 1e-4 && dist(d1[1].p, snap) < 1e-4) centroid++;
    }
    report.push(slot + ':' + (tc ? 'W' + hp.weapons.length : '-'));
  }
  const n = VESSEL_MODEL_KEYS.length;
  // dane: wieżyczki tylko w części modeli (2026-11-16: warp_frigate; właściciel dokliknie 5 bojowych) — cywilne bez W* ⇒ reguła bbox
  assert(withTurrets >= 1 && withTurrets < n, `A10 świadkowie: modele z wieżyczkami ${withTurrets}, bez — ${n - withTurrets} (${report.filter((r) => !r.endsWith('-')).join(' ')})`);
  assert(centroid === withTurrets, `A10 uzbrojenie domyślne = środek wieżyczek (bez siatki) i jego rzut na kadłub (z siatką) (${centroid}/${withTurrets})`);
  assert(det === n, `A10 domyślne z siatką deterministyczne (${det}/${n})`);
  assert(snappedAll === n, `A10 5 ról przyciągniętych, NAPĘD = środek dyszy z pliku (bez przyciągania) (${snappedAll}/${n})`);
  assert(onHull === n, `A10 każdy przyciągnięty punkt domyślny ≤ ${AN.SNAP_EPS} od siatki (${onHull}/${n}; najgorszy ${worstD.toExponential(2)})`);
  assert(visible === n, `A10 ŁADOWNIA i MISJA po przyciągnięciu na grzbiecie albo prawej burcie (widoczne z kamery 3/4) (${visible}/${n})`);
  // kontrola: bez siatki reguła bbox wisi w powietrzu przy wąskim dziobie (pin przyciągania nie jest pusty)
  const { tris: ft, bbox: fb } = await meshOf('warp_battleship');
  const floating = AN.computeDefaultAnchors({ hardpoints: hpDoc('warp_battleship'), bbox: fb }).slice(1).filter((a) => AN.closestPointOnMesh(a.p, ft).d > 0.01).map((a) => a.role);
  assert(floating.length > 0, `A10 kontrola: bez siatki role reguły warp_battleship wiszą > 0,01 od kadłuba (${floating.join(', ')})`);
  const noTur = AN.computeDefaultAnchors({ hardpoints: { ...hpDoc('warp_frigate'), weapons: [] }, bbox: BBOX }).find((a) => a.role === 'weapons').p;
  assert(Math.abs(noTur[0] - (-0.35)) < 1e-4, 'A10 bez wieżyczek — uzbrojenie wg reguły bbox (dziób 0,35)');
  const ren = stripComments(src('../../renderer/ShipHologramRenderer.js')), ws = stripComments(src('../../../tools/model-workshop/workshop.js'));
  assert(/modelNormTriangles\(/.test(ren) && /triangles: tris/.test(ren) && /templateNormTriangles\(THREE, tpl\)/.test(ws) && /triangles: S\.trisN/.test(ws),
    'A10 hologram i Workshop podają siatkę (ta sama funkcja normalizacji — domyślne w Workshopie = w grze)');
});

console.log(`\nship_anchors_smoke: ${pass} PASS, ${fail} FAIL`);
process.exitCode = fail ? 1 : 0;
