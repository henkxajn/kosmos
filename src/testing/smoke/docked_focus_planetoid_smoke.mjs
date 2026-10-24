// docked_focus_planetoid_smoke.mjs — Finding 532 (REFORMA ZAKŁADEK, drobny krok przed T3 — D-TR-15 (b)).
//
// Drugi klik (reguła D-UI-5: 2. klik = focus) w statek ZADOKOWANY przy planetoidzie nic nie robił: słuchacz
// `vessel:focus` (`ThreeRenderer`) szukał miejsca postoju statku bez sprite'a wyłącznie w `_planets` i `_moons`, więc
// planetoida dawała brak pozycji — kamera stała, karty ciała brak. Zmierzone (ZF gy120): Fracht @ Nt, Dostawca II @ Cu
// i Hv — kamera STOI; planeta (Fracht III) i księżyc (Kurier II) — kamera + karta. Dotyczy statków placówek na
// planetoidach — prawy outliner, Dok taktyczny, Tab.
// Po poprawce miejsce postoju szukane także w `_planetoids` — tej samej mapie, z której rysowane są placówki
// (`getBodyWorldInfo`, `getBodyScreenPosition`): kamera na planetoidę + karta ciała, jak przy planecie.
//
// `ThreeRenderer` nie importuje się pod node — słuchacze `vessel:focus` i `body:selected` oraz `_updateCameraFocus`
// wycięte ze źródła (wzór `zoom_floor`, `click_focus_rule`), WYKONANIE na atrapie `this`; kamera na PRAWDZIWYM
// prototypie `ThreeCameraController`. Emisja `body:selected` z atrapy szyny woła wycięty słuchacz `body:selected`
// (w grze ten sam łańcuch idzie przez `EventBus`).
//
//   D0  KONTROLA: kod wycięty ze źródła (trzy funkcje)
//   D1  SEDNO: planetoida — cel kamery na pozycji planetoidy („zwraca pozycję”), `_focusEntityId` = planetoida
//   D2  SEDNO: planetoida — `body:selected` z encją planetoidy (karta ciała), łańcuch → kamera śledzi planetoidę,
//       podłoga 0,3 i auto-zoom jak przy kliknięciu tarczy
//   D3  KONTROLA: planeta — jak dotąd
//   D4  KONTROLA: księżyc — jak dotąd
//   D5  KONTROLA: stacja — `station:focus` i nic więcej
//   D6  KONTROLA: statek ze sprite'em — śledzenie sprite'a, bez karty
//   D7  KONTROLA: ciało spoza sceny (np. inny układ) — kamera stoi, bez wyjątku
//   D8  „jak przy planecie”: ślad zdarzeń planetoidy ma ten sam kształt co planety
import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import * as CCmod from '../../renderer/ThreeCameraController.js';

const TCC = CCmod.ThreeCameraController;
let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e * Math.max(1, Math.abs(b));

// Wycinanie kodu, który NIE importuje się pod node (wzór `zoom_floor`): brak w źródle → `null` (pin pada, nie przerywa).
const methodBody = (code, sig) => { const i = code.indexOf(sig); return i < 0 ? '' : code.slice(i, code.indexOf('\n  }\n', i) + 4); };
const compileWith = (text, scope, thisArg) => {
  if (!text) return null;
  try {
    const names = Object.keys(scope);
    const make = new Function(...names, '__src', 'return eval("(" + __src + ")");');
    return make.call(thisArg, ...names.map((n) => scope[n]), text);
  } catch { return null; }
};
const compileMethod = (code, name, scope = {}) => {
  const b = methodBody(code, `  ${name}(`);
  return b ? compileWith('function ' + b.trim().slice(name.length), scope, null) : null;
};
const listenerText = (code, ev) => {
  const sig = `EventBus.on('${ev}', safe(`;
  const i = code.indexOf(sig);
  if (i < 0) return '';
  const end = code.indexOf('\n    }));', i);
  return end < 0 ? '' : code.slice(i + sig.length, end + '\n    }'.length);
};
const compileListener = (code, ev, thisArg, scope = {}) => compileWith(listenerText(code, ev), scope, thisArg);
const call = (fn, self, ...a) => { try { return fn ? fn.apply(self, a) : undefined; } catch (e) { return `WYJĄTEK: ${e.message}`; } };

const TR_SRC = src('../../renderer/ThreeRenderer.js');

// ── Atrapy ───────────────────────────────────────────────────────────────────────────────────────────────────────
class Vec {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
}
/** Kamera na PRAWDZIWYM prototypie — kadr układu (cel w gwieździe, dystans 116 j.). */
const mkCam = () => {
  const c = Object.create(TCC.prototype);
  Object.assign(c, { _theta: 0.3, _phi: 1.1, _goalTheta: null, _goalPhi: null, _defaultDist: 116, _dist: 116, _targetDist: 116,
    _minDist: 0.3, _target: new Vec(), _goalTarget: new Vec() });
  return c;
};
const K = globalThis.window.KOSMOS ?? (globalThis.window.KOSMOS = {});
K.activeSystemId = 'sys_home';

// Scena: planeta, księżyc, planetoida (placówka „Nt”), stacja; pozycje różne, żeby cel kamery wskazywał ciało jednoznacznie.
const ENT = {
  planet:    { id: 'entity_5',  type: 'planet',    name: 'Nowa Ziemia' },
  moon:      { id: 'entity_6',  type: 'moon',      name: 'Nowy Księżyc' },
  planetoid: { id: 'entity_36', type: 'planetoid', name: 'Nt' },
};
const POS = { planet: new Vec(3.9, 0, 4.8), moon: new Vec(4.4, 0.02, 4.7), planetoid: new Vec(-12.6, 0, 9.3), station: new Vec(4.06, -0.11, 4.56) };
const VESSELS = {
  v_40: { id: 'v_40', name: 'Fracht III', systemId: 'sys_home', position: { state: 'docked', dockedAt: 'entity_5', x: 39, y: 48 } },
  v_14: { id: 'v_14', name: 'Kurier II', systemId: 'sys_home', position: { state: 'docked', dockedAt: 'entity_6', x: 44, y: 47 } },
  v_5:  { id: 'v_5',  name: 'Fracht', systemId: 'sys_home', position: { state: 'docked', dockedAt: 'entity_36', x: -126, y: 93 } },
  v_13: { id: 'v_13', name: 'Handlarz II', systemId: 'sys_home', position: { state: 'docked', dockedAt: 'st_1', x: 40, y: 45 } },
  v_9:  { id: 'v_9',  name: 'Zwiadowca', systemId: 'sys_home', position: { state: 'in_transit', dockedAt: null, x: 200, y: 50 } },
  v_77: { id: 'v_77', name: 'Obcy dok', systemId: 'sys_home', position: { state: 'docked', dockedAt: 'entity_999', x: 0, y: 0 } },
};
K.vesselManager = { getVessel: (id) => VESSELS[id] ?? null };
K.colonyManager = { hasColony: (id) => id === 'entity_5' || id === 'entity_36', getColony: () => null };

/** Atrapa renderera z PRAWDZIWYMI słuchaczami / metodą wyciętymi ze źródła; `log` — ślad zdarzeń szyny. */
const mkWorld = () => {
  const log = [];
  const cam = mkCam();
  const r = {
    _cameraController: cam, _observatoryPreviewActive: false,
    _focusEntityId: null, _focusVesselId: null, _focusStationId: null, _focusEncounterId: null, _pendingVesselFocus: null,
    _selectedEntityId: null, _pingedEnemyId: null,
    _planets: new Map(), _moons: new Map(), _planetoids: new Map(), _vessels: new Map(), _stations: new Map(),
    _entityByUUID: new Map(),
    _colonyMarkers: { show() {}, hide() {} },
    _getEntityRadius: (e) => (e.type === 'planetoid' ? 0.02 : e.type === 'moon' ? 0.03 : 0.15),   // wzór `_getEntityRadius`
    _showPlanetoidOrbit() {}, _hideAllMoonOrbits() {}, _showMoonOrbit() {}, _hideAllPlanetoidOrbits() {}, _rebuildAllOrbits() {},
  };
  const meshOf = (key, ent) => ({ uuid: `u_${ent.id}`, position: POS[key] });
  const pMesh = meshOf('planet', ENT.planet);
  r._planets.set(ENT.planet.id, { mesh: pMesh, group: { position: POS.planet } }); r._entityByUUID.set(pMesh.uuid, ENT.planet);
  const mMesh = meshOf('moon', ENT.moon);
  r._moons.set(ENT.moon.id, { mesh: mMesh }); r._entityByUUID.set(mMesh.uuid, ENT.moon);
  const dMesh = meshOf('planetoid', ENT.planetoid);
  r._planetoids.set(ENT.planetoid.id, { mesh: dMesh, planetoid: ENT.planetoid }); r._entityByUUID.set(dMesh.uuid, ENT.planetoid);
  r._stations.set('st_1', { mesh: { position: POS.station } });
  r._vessels.set('v_9', { sprite: { position: new Vec(20, 0.3, 5) } });
  r._updateCameraFocus = compileMethod(TR_SRC, '_updateCameraFocus');
  const bus = { emit: (ev, p) => { log.push([ev, p]); if (ev === 'body:selected') call(bodySel, r, p); } };
  const SCOPE = { EventBus: bus, S: (v) => v / 10 };
  const bodySel = compileListener(TR_SRC, 'body:selected', r, SCOPE);
  const vFocus = compileListener(TR_SRC, 'vessel:focus', r, SCOPE);
  const focus = (vesselId) => call(vFocus, r, { vesselId });
  return { r, cam, log, focus, vFocus, bodySel };
};
const tgt = (c) => ({ x: c._goalTarget.x, y: c._goalTarget.y, z: c._goalTarget.z });
const at = (c, p) => near(c._goalTarget.x, p.x) && near(c._goalTarget.z, p.z);
const evNames = (log) => log.map((e) => e[0]);

// ═══ D0 ══════════════════════════════════════════════════════════════════════
header('D0  KONTROLA: kod wycięty ze źródła');
{
  const w = mkWorld();
  ok(typeof w.vFocus === 'function' && typeof w.bodySel === 'function' && typeof w.r._updateCameraFocus === 'function',
    'D0a słuchacze `vessel:focus`, `body:selected` i `_updateCameraFocus` wycięte i skompilowane');
}

// ═══ D1 ══════════════════════════════════════════════════════════════════════
header('D1  SEDNO: statek zadokowany przy planetoidzie (Fracht @ Nt) — kamera na planetoidę');
{
  const w = mkWorld();
  const before = tgt(w.cam);
  const res = w.focus('v_5');
  ok(typeof res !== 'string', `D1-0 KONTROLA: bez wyjątku (${typeof res === 'string' ? res : 'ok'})`);
  ok(at(w.cam, POS.planetoid) && !(near(before.x, POS.planetoid.x) && near(before.z, POS.planetoid.z)),
    `D1a SEDNO: cel kamery na pozycji planetoidy (${w.cam._goalTarget.x.toFixed(2)}, ${w.cam._goalTarget.z.toFixed(2)}) — dawniej stał w (0, 0)`);
  ok(w.r._focusEntityId === ENT.planetoid.id, `D1b SEDNO: śledzenie ciała = planetoida (jest: ${w.r._focusEntityId})`);
}

// ═══ D2 ══════════════════════════════════════════════════════════════════════
header('D2  SEDNO: karta ciała planetoidy + kamera jak przy kliknięciu tarczy');
{
  const w = mkWorld();
  w.focus('v_5');
  const sel = w.log.filter((e) => e[0] === 'body:selected');
  ok(sel.length === 1 && sel[0][1]?.entity === ENT.planetoid && sel[0][1]?.focus !== false,
    `D2a SEDNO: jedno \`body:selected\` z encją planetoidy, z kamerą (karta ciała; jest ${sel.length})`);
  ok(w.r._selectedEntityId === ENT.planetoid.id, 'D2b zaznaczenie renderera = planetoida (słuchacz `body:selected` z łańcucha)');
  ok(w.cam._minDist === 0.3 && near(w.cam._targetDist, 0.8), `D2c podłoga 0,3 i auto-zoom do 0,8 — jak 2. klik w tarczę planetoidy (jest ${w.cam._minDist} / ${w.cam._targetDist})`);
  w.cam._goalTarget.set(0, 0, 0);
  call(w.r._updateCameraFocus, w.r);
  ok(at(w.cam, POS.planetoid), 'D2d kolejna klatka (`_updateCameraFocus`) trzyma kamerę na planetoidzie (śledzenie)');
}

// ═══ D3 ══════════════════════════════════════════════════════════════════════
header('D3  KONTROLA: planeta (Fracht III @ Nowa Ziemia) — jak dotąd');
{
  const w = mkWorld();
  w.focus('v_40');
  const sel = w.log.filter((e) => e[0] === 'body:selected');
  ok(at(w.cam, POS.planet) && w.r._focusEntityId === ENT.planet.id, 'D3a kamera na planecie, śledzenie planety');
  ok(sel.length === 1 && sel[0][1]?.entity === ENT.planet, 'D3b `body:selected` z encją planety (karta hangaru)');
}

// ═══ D4 ══════════════════════════════════════════════════════════════════════
header('D4  KONTROLA: księżyc (Kurier II @ Nowy Księżyc) — jak dotąd');
{
  const w = mkWorld();
  w.focus('v_14');
  const sel = w.log.filter((e) => e[0] === 'body:selected');
  ok(at(w.cam, POS.moon) && w.r._focusEntityId === ENT.moon.id, 'D4a kamera na księżycu, śledzenie księżyca');
  ok(sel.length === 1 && sel[0][1]?.entity === ENT.moon && w.cam._minDist === 0.15, 'D4b `body:selected` z encją księżyca, podłoga księżyca 0,15');
}

// ═══ D5 ══════════════════════════════════════════════════════════════════════
header('D5  KONTROLA: stacja (Handlarz II @ stacja) — `station:focus` i nic więcej');
{
  const w = mkWorld();
  const before = tgt(w.cam);
  w.focus('v_13');
  ok(JSON.stringify(w.log) === JSON.stringify([['station:focus', { stationId: 'st_1' }]]), `D5a jedyne zdarzenie: \`station:focus\` (jest ${JSON.stringify(evNames(w.log))})`);
  ok(near(w.cam._goalTarget.x, before.x) && w.r._focusEntityId === null, 'D5b ten słuchacz sam kamery nie rusza (robi to `station:focus`)');
}

// ═══ D6 ══════════════════════════════════════════════════════════════════════
header('D6  KONTROLA: statek ze sprite\'em — śledzenie sprite\'a');
{
  const w = mkWorld();
  w.focus('v_9');
  ok(w.r._focusVesselId === 'v_9' && near(w.cam._goalTarget.x, 20) && w.log.length === 0, 'D6a śledzenie statku, bez karty ciała');
}

// ═══ D7 ══════════════════════════════════════════════════════════════════════
header('D7  KONTROLA: dok przy ciele spoza sceny — kamera stoi');
{
  const w = mkWorld();
  const res = w.focus('v_77');
  ok(typeof res !== 'string' && near(w.cam._goalTarget.x, 0) && near(w.cam._goalTarget.z, 0) && w.log.length === 0 && w.r._focusEntityId === null,
    'D7a bez wyjątku, bez zdarzeń, kamera bez zmian');
}

// ═══ D8 ══════════════════════════════════════════════════════════════════════
header('D8  „jak przy planecie” — ten sam kształt śladu');
{
  const a = mkWorld(); a.focus('v_40');
  const b = mkWorld(); b.focus('v_5');
  const shape = (w) => JSON.stringify({ ev: evNames(w.log), focus: w.r._focusEntityId != null, sel: w.r._selectedEntityId != null,
    vessel: w.r._focusVesselId, station: w.r._focusStationId });
  ok(shape(a) === shape(b), `D8a planetoida = planeta: ${shape(b)}`);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
