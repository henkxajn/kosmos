// KEEPER — bramka układu dla stacji orbitalnych na mapie 3D.
// Plan: docs/plans/fix-stacje-3d-bramka-ukladu.md · PREREKWIZYT Director S4 (zasiew stacji AI).
//
// PO CO: `_addStationMesh` nie miał bramki `systemId` (sprite'y statków i mapa 2D miały), więc
// `station:created` z restore — który ZAWSZE wraca do `sys_home` — dawał mesh stacjom ze
// WSZYSTKICH układów. Bez ciała kotwiczącego w scenie `_tickOrbitingStations` nie mógł ich
// spozycjonować, więc zostawały w origin, czyli jako ikonki przy gwieździe układu domowego.
// Do dziś dotyczyło to rzadkiego przypadku (gracz ma stację w innym układzie); po zasiewie
// stacji AI (Director S4) odpalałoby to na KAŻDĄ nową partię i każde wczytanie.
//
// Dwie warstwy dowodu, bo `ThreeRenderer` nie da się zaimportować w node (bare specifier `three`
// + `three/addons/*` z importmapy) — wzór: `pop4_droids_smoke.mjs`, `galaxy_seed_smoke.mjs`.
//
//   T1  WYKONANIE prawdziwej reguły (StationRenderLogic — moduł BEZ importu THREE)
//   T2  asercje źródłowe na ThreeRenderer: bramka jest i stoi PRZED budową meshu
//   T3  zdublowany filtr w _restoreActiveSystemStations ZNIKNĄŁ (jedno źródło reguły)
//   T4  inwariant „nie da się spozycjonować ⇒ mesh niewidoczny" w _tickOrbitingStations
//   T5  ⚠ PIN ZAKRESU: bramka jest o UKŁADZIE, nie o właścicielu — stacja AI w aktywnym
//       układzie ma się renderować (inaczej Director S4 straciłby widoczny żeton)

import { readFileSync } from 'node:fs';
import { isStationInActiveSystem, stationSystemId, DEFAULT_SYSTEM_ID }
  from '../../renderer/StationRenderLogic.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const TR = readFileSync('src/renderer/ThreeRenderer.js', 'utf8');

/** Ciało metody z ThreeRenderer (od sygnatury do następnej metody na tym samym wcięciu). */
function methodBody(src, signature) {
  const i = src.indexOf(signature);
  if (i < 0) return '';
  const rest = src.slice(i + signature.length);
  const end = rest.search(/\n {2}[A-Za-z_][\w$]*\(|\n {2}\/\*\*/);
  return rest.slice(0, end < 0 ? rest.length : end);
}

// ── T1 — wykonanie reguły ───────────────────────────────────────────────────
console.log('\nT1: reguła widoczności (wykonanie, nie odczyt)');
{
  assert(isStationInActiveSystem({ id: 's1', systemId: 'sys_home' }, 'sys_home') === true,
    'T1a: stacja sys_home przy aktywnym sys_home → widoczna');
  assert(isStationInActiveSystem({ id: 's2', systemId: 'sys_042' }, 'sys_home') === false,
    'T1b: stacja z OBCEGO układu przy aktywnym sys_home → NIEwidoczna (rdzeń zgłoszenia)');
  assert(isStationInActiveSystem({ id: 's3', systemId: 'sys_home' }, 'sys_042') === false,
    'T1c: stacja sys_home przy aktywnym sys_042 → NIEwidoczna');
  assert(isStationInActiveSystem({ id: 's4' }, 'sys_home') === true,
    'T1d: stacja BEZ systemId traktowana jak sys_home (parytet z Station.js)');
  assert(isStationInActiveSystem({ id: 's5', systemId: 'sys_home' }, undefined) === true,
    'T1e: activeSystemId undefined → fallback sys_home (ścieżka przed ustawieniem w GameScene)');
  assert(isStationInActiveSystem(null, 'sys_home') === false && isStationInActiveSystem(undefined, 'x') === false,
    'T1f: null/undefined station → false, bez rzutu');
  assert(stationSystemId({}) === DEFAULT_SYSTEM_ID && DEFAULT_SYSTEM_ID === 'sys_home',
    'T1g: DEFAULT_SYSTEM_ID = sys_home i jest domyślną wartością stationSystemId');
}

// ── T2 — bramka w JEDYNYM punkcie tworzenia meshu ───────────────────────────
console.log('\nT2: bramka w _addStationMesh, PRZED budową meshu');
{
  assert(/import \{ isStationInActiveSystem \} from '\.\/StationRenderLogic\.js';/.test(TR),
    'T2a: ThreeRenderer importuje regułę z modułu THREE-free');
  const body = methodBody(TR, '_addStationMesh(station) {');
  assert(body.length > 0, 'T2b: metoda _addStationMesh odnaleziona');
  const gateAt = body.indexOf('isStationInActiveSystem');
  const groupAt = body.indexOf('new THREE.Group()');
  assert(gateAt >= 0, 'T2c: bramka jest obecna w ciele metody');
  assert(groupAt >= 0 && gateAt < groupAt,
    'T2d: bramka stoi PRZED `new THREE.Group()` — nie tworzymy meshu, żeby go zaraz wyrzucić');
  assert(/window\.KOSMOS\?\.activeSystemId/.test(body),
    'T2e: bramka czyta aktywny układ z window.KOSMOS.activeSystemId');
}

// ── T3 — jedno źródło reguły ────────────────────────────────────────────────
console.log('\nT3: zdublowany filtr zniknął z _restoreActiveSystemStations');
{
  const body = methodBody(TR, '_restoreActiveSystemStations() {');
  assert(body.length > 0, 'T3a: metoda odnaleziona');
  assert(!/systemId/.test(body),
    'T3b: metoda NIE porównuje już systemId sama — filtr żyje wyłącznie w _addStationMesh');
  assert(/_addStationMesh\(st\)/.test(body),
    'T3c: …ale nadal deleguje każdą stację do _addStationMesh (idempotentnie)');
}

// ── T4 — inwariant pozycjonowania ───────────────────────────────────────────
console.log('\nT4: „nie da się spozycjonować ⇒ mesh niewidoczny"');
{
  const body = methodBody(TR, '_tickOrbitingStations() {');
  assert(body.length > 0, 'T4a: metoda odnaleziona');
  const hides = (body.match(/visible = false/g) ?? []).length;
  assert(hides >= 3,
    `T4b: co najmniej trzy ścieżki ukrywają mesh (brak orbity / brak ciała / brak pozycji) — jest ${hides}`);
  assert(/visible = true/.test(body),
    'T4c: …i jedna przywraca widoczność po udanym spozycjonowaniu (inaczej mesh znikłby na stałe)');
  assert(!/if \(!orb\) continue;/.test(body) && !/if \(!planetPos\) continue;/.test(body),
    'T4d: stare `continue` (zostawiające mesh w origin) już nie istnieją');
}

// ── T5 — PIN ZAKRESU ────────────────────────────────────────────────────────
console.log('\nT5: PIN — bramka jest o UKŁADZIE, nie o właścicielu');
{
  // Director S4 zasieje stację imperium AI jako WIDOCZNY żeton potencjału militarnego.
  // Gdyby ktoś „przy okazji" dołożył tu filtr właściciela, żeton przestałby istnieć dla
  // gracza w układzie AI — i nikt by tego nie zauważył, bo nic by nie padło.
  const aiStation = { id: 'st_ai', systemId: 'sys_042', ownerEmpireId: 'emp_001' };
  assert(isStationInActiveSystem(aiStation, 'sys_042') === true,
    'T5a: stacja AI w AKTYWNYM układzie jest widoczna — właściciel nie ma tu nic do rzeczy');
  // ⚠ Kod BEZ komentarzy: nagłówek modułu TŁUMACZY, że nie importuje THREE i nie zna
  // właściciela — surowy grep trafiłby we własne wyjaśnienie i pin świeciłby na czerwono
  // za samo bycie opisanym. (Ten test złapał to na sobie przy pierwszym uruchomieniu.)
  const logic = readFileSync('src/renderer/StationRenderLogic.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert(!/ownerEmpireId|isPlayer|'player'/.test(logic),
    'T5b: KOD reguły nie zna pojęcia właściciela (ani ownerEmpireId, ani „player")');
  assert(!/\bfrom ['"]three/.test(logic) && !/THREE\./.test(logic),
    'T5c: moduł nie importuje THREE ani go nie używa — dlatego ten test może go WYKONAĆ, a nie tylko przeczytać');
  assert(/THREE/.test(readFileSync('src/renderer/ThreeRenderer.js', 'utf8')),
    'T5d: kontrola pinu — THREE ISTNIEJE w repo (ThreeRenderer), więc T5c nie przechodzi przez pomyłkę w regexie');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
