// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — ARKUSZ UI poprawka 501 (rodzina V-268): podłoga zoomu przy gwieździe (UI_PLAN §4.7; decyzje (a)–(d)
// właściciela z 2026-10-21).
// Uruchom: node src/testing/smoke/zoom_floor_smoke.mjs
//
// Cel kamery (`_goalTarget`) w obrębie STAR_ZONE_MULT × R od środka gwiazdy (strefa; R — promień rdzenia aktywnego
// układu, `ThreeRenderer._sunCoreRadius`) ⇒ dystans od celu nie schodzi poniżej STAR_FLOOR_MULT × R (a); cel dalej —
// podłoga z fokusu (`_minDist`: 0,3 / 0,15 / 0,05 / 0,005) jak dotąd. Fokus na gwieździe = domyślny widok układu (cel
// w środku gwiazdy) — podłoga obowiązuje (b). Dwie stałe nazwane: strefa 1,3 (c), podłoga 2,2 — decyzja właściciela po
// oku K1 bramki 501 (2026-10-21: przy maksymalnym zbliżeniu cała tarcza w kadrze). Strefa NIE rośnie z podłogą — planeta
// na orbicie wewnętrznej („Nowa Ziemia”, 6,2 j. od środka gwiazdy) leży między nimi i zostaje przy podłodze z fokusu.
// Jedna ścieżka (d): kółko (`wheelZoom`), suwak (prawy koniec toru = podłoga efektywna `minDist`) i auto-zoom
// (`setTargetDist` / `snapDist` / `flyTo`). Cel kamery nietknięty przez zoom; odznaczenie ciała kamery nie rusza (473).
//
// PINY (SEDNO pada na drzewie sprzed poprawki 501; KONTROLA — zielona po obu stronach; STRAŻNIK — zielony po obu
// stronach, pada na mutacji „jedna stała 2,2 dla strefy i podłogi”). Kamera = atrapa na PRAWDZIWYM
// prototypie `ThreeCameraController` (konstruktor woła THREE — stub `three` pod node go nie ma). `ThreeRenderer` nie
// importuje się pod node — jego metody i słuchacze wycięte ze źródła i WYKONANE na atrapie `this` (wzór
// `click_focus_rule` T6 / T9). Suwak — prawdziwy `BottomControlBar` na atrapie ctx (wzór `zoom_slider`).
//   F0  stałe `STAR_ZONE_MULT` 1,3 (strefa) i `STAR_FLOOR_MULT` 2,2 (podłoga) — dokładne wartości decyzji; API
//       `setStarCoreRadius`, `minDist`
//   F1  TABELA: cel na gwieździe / 1,2 R / 1,4 R / na planecie 0,55 AU / na planecie 6,2 j. (między strefą a podłogą —
//       STRAŻNIK) / fokus na gwieździe × kółko do oporu / suwak — prawy koniec / auto-zoom — wartość = podłoga
//       oczekiwana, cel kamery bez zmian w każdej komórce
//   F2  klasy gwiazd M / K / G / F (promień ze wzoru `renderStar` na masie klasy) — podłoga = STAR_FLOOR_MULT × R przy celu
//       w gwieździe; podłoga idzie za promieniem TARCZY (`_sunCoreRadius`), nie za masą; przy podłodze tarcza mieści się
//       w pionie kadru (FOV kamery ze źródła renderera)
//   F3  podłoga z fokusu poza strefą bez zmian (księżyc 0,15, statek 0,05, stacja 0,005); w strefie — STAR_FLOOR_MULT × R
//   F4  `setMinDist` i `setStarCoreRadius` nie ruszają kamery; odznaczenie (słuchacz `body:deselected`) — kamera stoi,
//       kolejny ząbek przy ciele poza strefą bez odskoku
//   F5  auto-zoom fokusu liczy podłogę wobec NOWEGO celu: statek / stacja z kadru układu (cel w gwieździe) → 0,9 / 0,3;
//       ciało w strefie — auto-zoom zatrzymany na podłodze
//   F6  tryb taktyczny: wejście (cel = środek układu) i wyjście — dystans sprzed trybu 1:1 (`flyTo`: cel przed dystansem)
//   F7  „Obserwuj”: `_minDist` dalej = podłoga z fokusu — koniec obserwacji oddaje ją 1:1 (`_endWatch` wycięty ze źródła)
//   F8  renderer podaje promień: `setCameraController` (WYKONANIE) i `renderStar` (pin źródłowy — ten sam `_sunCoreRadius`,
//       z którego powstaje kula rdzenia); kolejność rozruchu w `GameScene`
//   F9  bez gwiazdy (promień 0 / brak pola) — podłoga z fokusu (atrapy keeperów sprzed poprawki); śmieci w promieniu → 0
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import * as CCmod from '../../renderer/ThreeCameraController.js';   // namespace — obie stałe powstają w 501
import { BottomControlBar } from '../../ui/BottomControlBar.js';
import { TacticalModeController } from '../../ui/TacticalModeController.js';
import { applyClickIntent, CLICK_INTENT } from '../../ui/ClickIntentLogic.js';

const TCC = CCmod.ThreeCameraController;
// Wartości oczekiwane z TYCH stałych (F0a pinuje ich dokładne wartości); brak eksportu (drzewo sprzed 501) — wartości decyzji.
const ZONE = CCmod.STAR_ZONE_MULT ?? 1.3;    // strefa: cel w obrębie ZONE × R od środka gwiazdy
const FLOOR = CCmod.STAR_FLOOR_MULT ?? 2.2;  // podłoga w strefie: FLOOR × R od celu

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e * Math.max(1, Math.abs(b));
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : String(v));

// Wycinanie kodu, który NIE importuje się pod node (wzór `click_focus_rule`): tekst wycięty ze źródła bez komentarzy,
// oceniony z atrapą `this`; identyfikatory modułu podane jawnie w `scope`. Brak w źródle → `null` (pin pada, nie przerywa).
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
const CC_SRC = src('../../renderer/ThreeCameraController.js');

// ── Atrapy ───────────────────────────────────────────────────────────────────────────────────────────────────────
class Vec {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  lerp(v, a) { this.x += (v.x - this.x) * a; this.y += (v.y - this.y) * a; this.z += (v.z - this.z) * a; return this; }
}
const gwiazdaR = (mass) => 3.0 * Math.max(0.6, Math.min(1.6, 0.6 + mass * 0.6));   // wzór `renderStar` (F8e pinuje źródło)
const R_G = gwiazdaR(1.0);                    // 3,6 j. — gwiazda typu G (tabela F1)
const ZONE_G = ZONE * R_G;                    // 4,68 j. — promień strefy przy 1,3
const FLOOR_G = FLOOR * R_G;                  // 7,92 j. — podłoga przy 2,2
const NZ_GAME = 6.2;                          // „Nowa Ziemia” w grze — 6,2 j. od środka gwiazdy (bramka 501, K3)
const AU = 11;                                // 1 AU = 11 j. świata (AU_TO_PX 110 / WORLD_SCALE 10)
const NZ_POS = new Vec(0.55 * AU * Math.cos(0.7), 0, 0.55 * AU * Math.sin(0.7));   // „Nowa Ziemia” — 0,55 AU (zapis ZF)
const W = 1280, H = 833;
const TS = { isPaused: true, multiplierIndex: 1, displayText: '03/06/48' };
const K = globalThis.window.KOSMOS ?? (globalThis.window.KOSMOS = {});

/** Kamera na PRAWDZIWYM prototypie; `starR` — promień przez publiczne API (na kodzie sprzed 501 — brak metody, no-op). */
const mkCam = ({ dist = 116, min = 0.3, starR = R_G, target = new Vec() } = {}) => {
  const c = Object.create(TCC.prototype);
  Object.assign(c, { _theta: 0.3, _phi: 1.1, _goalTheta: null, _goalPhi: null, _defaultDist: 116, _dist: dist, _targetDist: dist,
    _minDist: min, _target: new Vec(target.x, target.y, target.z), _goalTarget: new Vec(target.x, target.y, target.z) });
  if (starR != null) c.setStarCoreRadius?.(starR);
  return c;
};
const tgt = (c) => [c._goalTarget.x, c._goalTarget.y, c._goalTarget.z];
const sameTgt = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-12);

/** Atrapa renderera z PRAWDZIWYMI metodami wyciętymi ze źródła (fokus ciała, reset widoku, kadr układu). */
const mkRenderer = (cam, bodies = []) => {
  const r = {
    _cameraController: cam, _star: { id: 'star', type: 'star' }, _sunCoreRadius: R_G,
    _observatoryPreviewActive: false, _cinematicDriver: null, _watch: null, _autoFocus: null, _focusEncounterId: null,
    _focusEntityId: null, _focusVesselId: null, _focusStationId: null, _selectedEntityId: null, _pingedEnemyId: null,
    _planets: new Map(), _moons: new Map(), _planetoids: new Map(), _vessels: new Map(), _stations: new Map(),
    _colonyMarkers: { show() {}, hide() {} },
    _getEntityRadius: () => 0.15,
    _showPlanetoidOrbit() {}, _hideAllMoonOrbits() {}, _showMoonOrbit() {}, _hideAllPlanetoidOrbits() {}, _rebuildAllOrbits() {},
    _hideColonyTooltip() {}, _endWatch() { this._watch = null; },
    _computeSystemExtentAU: () => 5.8,                        // atrapa: zasięg układu 5,8 AU → kadr 116 j.
  };
  for (const b of bodies) r._planets.set(b.id, { group: { position: b.pos } });
  r._updateCameraFocus = compileMethod(TR_SRC, '_updateCameraFocus');
  r._frameActiveSystem = compileMethod(TR_SRC, '_frameActiveSystem');
  r.resetToSystemView = compileMethod(TR_SRC, 'resetToSystemView');
  return r;
};
const SCOPE = { EventBus: { emit() {} }, S: (v) => v / 10 };

// Wejścia zoomu
const wheelToStop = (cam) => { let last = NaN; for (let i = 0; i < 2000 && cam._targetDist !== last; i++) { last = cam._targetDist; cam.wheelZoom?.(-1000); } return cam._targetDist; };
const recCtx = () => {
  const calls = []; let fillStyle = '#000';
  return new Proxy({}, {
    get(o, k) {
      if (k === '_calls') return calls;
      if (k === 'fillStyle') return fillStyle;
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (['fillRect', 'strokeRect', 'fillText', 'stroke'].includes(k)) return (...args) => { calls.push({ op: k, args }); };
      if (k in o) return o[k];
      return () => {};
    },
    set(o, k, v) { if (k === 'fillStyle') fillStyle = v; else o[k] = v; return true; },
  });
};
const knobX = (ctx) => { const k = ctx._calls.find((c) => c.op === 'fillRect' && c.args[2] === 6 && c.args[3] === 12); return k ? k.args[0] + 3 : null; };
/** Suwak: przeciągnięcie gałki do PRAWEGO końca toru (prawdziwy `BottomControlBar`); zwraca dystans i pozycję gałki. */
const sliderRight = (cam) => {
  K.threeRenderer = { _cameraController: cam };
  const bar = new BottomControlBar();
  bar.draw(recCtx(), W, H, TS, { left: 150 });
  const tr = bar._zoomTrack, y = H - 42 - 10;
  if (!tr) return { dist: NaN, knobAtRight: false };
  const began = bar.tryBeginZoomDrag(tr.x + tr.w / 2, y);   // wciśnięcie na torze, ruch daleko za prawy koniec — „do oporu”
  bar.handleZoomDrag(tr.x + tr.w + 40);
  bar.endZoomDrag();
  if (!began) return { dist: NaN, knobAtRight: false };
  const kx = knobX((() => { const c = recCtx(); bar.draw(c, W, H, TS, { left: 150 }); return c; })());
  return { dist: cam._targetDist, knobAtRight: kx != null && Math.abs(kx - (tr.x + tr.w)) <= 0.51 };
};
/** Auto-zoom: trzy wejścia z dystansem poniżej każdej podłogi — `setTargetDist`, `snapDist`, `flyTo({ dist })`. */
const autoZoom = (mk) => {
  const a = mk(); a.setTargetDist(0.001);
  const b = mk(); b.snapDist(0.001);
  const c = mk(); c.flyTo({ dist: 0.001 });
  return { a, b, c };
};

// ═══ F0 ══════════════════════════════════════════════════════════════════════
header('F0  stała i API podłogi przy gwieździe');
{
  const z = CCmod.STAR_ZONE_MULT, f = CCmod.STAR_FLOOR_MULT;
  ok(z === 1.3 && f === 2.2,
    `F0a SEDNO: stałe eksportowane — strefa \`STAR_ZONE_MULT\` 1,3 (decyzja (c)), podłoga \`STAR_FLOOR_MULT\` 2,2 (decyzja po oku K1 bramki 501) (jest: ${z} / ${f})`);
  const d = Object.getOwnPropertyDescriptor(TCC.prototype, 'minDist');
  ok(typeof TCC.prototype.setStarCoreRadius === 'function' && typeof d?.get === 'function',
    'F0b SEDNO: `setStarCoreRadius(r)` i getter `minDist` (podłoga efektywna) na prototypie kontrolera');
  ok(/\.\s*minDist\b/.test(methodBody(CC_SRC, '  wheelZoom(')) && /\.\s*minDist\b/.test(methodBody(CC_SRC, '  setTargetDist('))
    && !/_minDist/.test(methodBody(CC_SRC, '  wheelZoom(')) && !/_minDist/.test(methodBody(CC_SRC, '  setTargetDist(')),
    'F0c SEDNO: kółko (`wheelZoom`) i auto-zoom (`setTargetDist`) klamrują do `minDist` — jedna ścieżka (d)');
  const gm = methodBody(CC_SRC, '  get minDist(');
  ok((CC_SRC.match(/Math\.hypot\(/g) ?? []).length === 1 && /<=\s*STAR_ZONE_MULT \* R\b/.test(gm)
    && /Math\.max\(this\._minDist, STAR_FLOOR_MULT \* R\)/.test(gm),
    'F0d SEDNO: strefa z `STAR_ZONE_MULT`, podłoga z `STAR_FLOOR_MULT` — dwie stałe; odległość celu od środka gwiazdy liczona w jednym miejscu');
}

// ═══ F1 ══════════════════════════════════════════════════════════════════════
header(`F1  TABELA (gwiazda G: R = ${f3(R_G)} j.; strefa = ${ZONE} × R = ${f3(ZONE_G)} j., podłoga w strefie = ${FLOOR} × R = ${f3(FLOOR_G)} j.; poza strefą 0,3)`);
{
  const ang = 0.5;
  const at = (k) => new Vec(k * R_G * Math.cos(ang), 0, k * R_G * Math.sin(ang));
  // Tuż w strefie / tuż poza nią — względem STAŁEJ STREFY (przy 1,3: dokładnie 1,2 R / 1,4 R z tabeli decyzji).
  const kIn = ZONE - 0.1, kOut = ZONE + 0.1;
  const kTxt = (k) => k.toFixed(1).replace('.', ',');
  // Wiersze: jak powstaje cel kamery (stan PRZED wejściem zoomu) + podłoga oczekiwana. Planeta na orbicie — 2. klik
  // (słuchacz `body:selected` ze źródła, auto-zoom 0,9). Wiersz F — STRAŻNIK: cel między strefą a podłogą (planeta
  // „Nowa Ziemia” tam, gdzie stoi w grze) — przy jednej stałej 2,2 dla strefy i podłogi planeta weszłaby do strefy,
  // a kółko zatrzymałoby się 7,92 od niej (regresja, której szukamy).
  const planet = (pos) => () => {
    const c = mkCam(); const r = mkRenderer(c, [{ id: 'nz', pos }]);
    const sel = compileListener(TR_SRC, 'body:selected', r, SCOPE);
    call(sel, r, { entity: { id: 'nz', type: 'planet' } });
    return c;
  };
  const NZ_GAME_POS = new Vec(NZ_GAME * Math.cos(0.7), 0, NZ_GAME * Math.sin(0.7));
  const rows = [
    { id: 'A', label: 'cel na gwieździe (kadr układu `frameSystem`)', want: FLOOR_G, tag: 'SEDNO',
      mk: () => { const c = mkCam({ dist: 50, target: new Vec(9, 0, 9) }); c.frameSystem(5.8); return c; } },
    { id: 'B', label: `cel ${kTxt(kIn)} R od środka (\`focusOn\`)`, want: FLOOR_G, tag: 'SEDNO',
      mk: () => { const c = mkCam(); c.focusOn(at(kIn).x, at(kIn).z); return c; } },
    { id: 'C', label: `cel ${kTxt(kOut)} R od środka (\`focusOn\`)`, want: 0.3, tag: 'KONTROLA',
      mk: () => { const c = mkCam(); c.focusOn(at(kOut).x, at(kOut).z); return c; } },
    { id: 'D', label: 'cel na planecie („Nowa Ziemia” 0,55 AU — 2. klik: słuchacz `body:selected`)', want: 0.3, tag: 'KONTROLA',
      mk: planet(NZ_POS) },
    { id: 'E', label: 'fokus na gwieździe (2. klik w gwiazdę: `applyClickIntent` → `resetToSystemView`)', want: FLOOR_G, tag: 'SEDNO',
      mk: () => {
        const c = mkCam({ dist: 0.9, target: NZ_POS }); const r = mkRenderer(c);
        K.threeRenderer = r;
        applyClickIntent({ type: 'body', id: 'star', entity: { id: 'star', type: 'star' }, systemId: 'sys_home' }, CLICK_INTENT.FOCUS, { K, emit() {} });
        return c;
      } },
    { id: 'F', label: `cel na planecie 6,2 j. od środka („Nowa Ziemia” w grze) — między strefą ${f3(ZONE_G)} a podłogą ${f3(FLOOR_G)}`,
      want: 0.3, tag: 'STRAŻNIK', mk: planet(NZ_GAME_POS) },
  ];
  for (const row of rows) {
    const tag = row.tag;
    // Świadek: scena faktycznie postawiona (cel kamery tam, gdzie wiersz mówi).
    const w0 = row.mk();
    const dist0 = Math.hypot(...tgt(w0));
    // Wiersz F: świadek dyskryminacji — cel MIĘDZY strefą a podłogą (inaczej pin nie odróżnia dwóch stałych od jednej).
    const placed = row.id === 'A' || row.id === 'E' ? dist0 === 0 && w0._targetDist === 116
      : row.id === 'B' ? near(dist0, kIn * R_G) : row.id === 'C' ? near(dist0, kOut * R_G)
      : row.id === 'F' ? near(dist0, NZ_GAME) && ZONE_G < dist0 && dist0 < FLOOR_G && near(w0._targetDist, 0.9)
      : near(dist0, 0.55 * AU) && near(w0._targetDist, 0.9);
    ok(placed, `F1${row.id}-0 KONTROLA: scena — ${row.label}: cel ${f3(dist0)} j. od środka gwiazdy, dystans ${f3(w0._targetDist)}`);
    // kółko do oporu
    const c1 = row.mk(); const t1 = tgt(c1); const d1 = wheelToStop(c1);
    ok(near(d1, row.want) && sameTgt(t1, tgt(c1)), `F1${row.id}a ${tag}: kółko do oporu → ${f3(d1)} (oczekiwane ${f3(row.want)}), cel kamery bez zmian`);
    // suwak — prawy koniec
    const c2 = row.mk(); const t2 = tgt(c2); const s = sliderRight(c2);
    ok(near(s.dist, row.want) && s.knobAtRight && sameTgt(t2, tgt(c2)),
      `F1${row.id}b ${tag}: suwak do prawego końca → ${f3(s.dist)} (oczekiwane ${f3(row.want)}), gałka na prawym końcu = podłoga efektywna, cel bez zmian`);
    // auto-zoom
    const az = autoZoom(row.mk);
    const vals = [az.a._targetDist, az.b._targetDist, az.c._targetDist];
    const tOk = [az.a, az.b, az.c].every((c) => sameTgt(tgt(row.mk()), tgt(c)));
    ok(vals.every((v) => near(v, row.want)) && near(az.b._dist, row.want) && tOk,
      `F1${row.id}c ${tag}: auto-zoom (\`setTargetDist\` / \`snapDist\` / \`flyTo\` z 0,001) → ${vals.map(f3).join(' / ')} (oczekiwane ${f3(row.want)}), cel bez zmian`);
  }
}

// ═══ F2 ══════════════════════════════════════════════════════════════════════
header('F2  klasy gwiazd — podłoga = STAR_FLOOR_MULT × R tarczy (cel w gwieździe, kółko do oporu)');
{
  // R ze wzoru `renderStar` na masie klasy. ⚠ Dziś `renderStar` dostaje masę 1,0 dla KAŻDEJ gwiazdy — czyta `star.mass`,
  // a encja `Star` trzyma masę w `physics.mass` (kandydat 502) — więc w grze każda tarcza ma 3,6 j. (zapis ZF: Kepler-4799,
  // typ M — tarcza 3,6, podłoga 4,68; bramka K1/K2). Kontroler dostaje promień TARCZY (`_sunCoreRadius`), nie masę —
  // naprawa 502 przesunie podłogę razem z tarczą bez zmian w kontrolerze.
  const classes = [['M (0,27 — dolny skraj)', 0.27], ['M', 0.3], ['K', 0.7], ['G (dziś: każda gwiazda w grze)', 1.0], ['F', 1.4], ['F (1,54 — górny skraj)', 1.54]];
  const got = classes.map(([n, m]) => { const R = gwiazdaR(m); const c = mkCam({ starR: R }); c.frameSystem(5.8); return { n, R, d: wheelToStop(c) }; });
  ok(got.every((g) => near(g.d, FLOOR * g.R)),
    `F2a SEDNO: ${got.map((g) => `${g.n}: R ${f3(g.R)} → ${f3(g.d)}`).join(' · ')}`);
  ok(got.every((g) => g.d > g.R), 'F2b SEDNO: podłoga zawsze POZA kulą rdzenia (dystans od środka > R) — kamera nie wchodzi do tarczy');
  // Kamera na ZMIERZONEJ podłodze (kółko do oporu, cel w środku gwiazdy): promień kątowy tarczy asin(R / d) ≤ połowa
  // pionowego FOV kamery (55° — ze źródła renderera) — cała tarcza mieści się w pionie kadru (decyzja po oku K1: przy 1,3
  // i 1,5 R tarcza szersza niż kadr). Liczone z dystansu, na którym kamera stanęła — nie ze stałej.
  const fov = Number(/this\.camera = new THREE\.PerspectiveCamera\((\d+(?:\.\d+)?),/.exec(TR_SRC)?.[1]);
  const ang = got.map((g) => (g.d > g.R ? Math.asin(g.R / g.d) * 180 / Math.PI : NaN));
  ok(fov === 55 && ang.every((a) => a <= fov / 2),
    `F2c SEDNO: kamera na podłodze — cała tarcza w pionie kadru: promień kątowy ${[...new Set(ang.map((a) => (Number.isFinite(a) ? a.toFixed(1) + '°' : 'kamera w tarczy')))].join(' / ')} (każda klasa) ≤ połowa FOV ${fov / 2}° (FOV ${fov}° z \`ThreeRenderer\`)`);
}

// ═══ F3 ══════════════════════════════════════════════════════════════════════
header('F3  podłoga z fokusu: poza strefą bez zmian, w strefie — STAR_FLOOR_MULT × R');
{
  const out = [0.15, 0.05, 0.005].map((m) => { const c = mkCam({ min: m, target: NZ_POS, dist: 1 }); return { m, d: wheelToStop(c), md: c.minDist }; });
  ok(out.every((o) => near(o.d, o.m)), `F3a KONTROLA: cel przy „Nowej Ziemi” — księżyc / statek / stacja: ${out.map((o) => f3(o.d)).join(' / ')} (podłoga z fokusu jak dotąd)`);
  ok(out.every((o) => near(o.md, o.m)), 'F3b SEDNO: `minDist` poza strefą = podłoga z fokusu (getter czyta `_minDist`)');
  const inZone = [0.15, 0.05, 0.005].map((m) => { const c = mkCam({ min: m }); return wheelToStop(c); });
  ok(inZone.every((d) => near(d, FLOOR_G)), `F3c SEDNO: cel w gwieździe przy podłodze z fokusu 0,15 / 0,05 / 0,005 → ${inZone.map(f3).join(' / ')} (max z podłogą gwiazdy)`);
}

// ═══ F4 ══════════════════════════════════════════════════════════════════════
header('F4  próg nie rusza kamery; odznaczenie — kamera stoi (473)');
{
  const a = mkCam({ dist: 0.3, target: NZ_POS }); const ta = tgt(a);
  a.setMinDist(5);
  ok(a._targetDist === 0.3 && a._dist === 0.3 && sameTgt(ta, tgt(a)), 'F4a KONTROLA: `setMinDist` podnosi próg bez ruchu kamery (dystans 0,3, cel bez zmian)');
  const b = mkCam({ dist: 0.3, starR: null }); const tb = tgt(b);
  b.setStarCoreRadius?.(R_G);
  ok(typeof b.setStarCoreRadius === 'function' && b._targetDist === 0.3 && sameTgt(tb, tgt(b)) && near(b.minDist, FLOOR_G),
    `F4b SEDNO: \`setStarCoreRadius\` przyjmuje promień (podłoga efektywna ${f3(b.minDist)}) bez ruchu kamery (dystans 0,3, cel bez zmian)`);
  // Odznaczenie po fokusie na „Nowej Ziemi” i kółku do oporu (bramka K3 → K4): słuchacz `body:deselected` ze źródła.
  const c = mkCam(); const r = mkRenderer(c, [{ id: 'nz', pos: NZ_POS }]);
  call(compileListener(TR_SRC, 'body:selected', r, SCOPE), r, { entity: { id: 'nz', type: 'planet' } });
  wheelToStop(c);
  const tc = tgt(c), dc = c._targetDist;
  const des = compileListener(TR_SRC, 'body:deselected', r, SCOPE);
  call(des, r);
  ok(!!des && near(dc, 0.3) && c._targetDist === dc && sameTgt(tc, tgt(c)) && c._minDist === 0.3 && r._focusEntityId === null,
    `F4c KONTROLA: odznaczenie przy „Nowej Ziemi” — śledzenie zakończone, dystans ${f3(c._targetDist)} i cel bez zmian`);
  c.wheelZoom(-100);
  ok(near(c._targetDist, 0.3) && sameTgt(tc, tgt(c)),
    `F4d KONTROLA: kolejny ząbek do przodu po odznaczeniu — ${f3(c._targetDist)} (bez odskoku do ${f3(FLOOR_G)}: podłoga tylko przy celu w strefie — (a))`);
}

// ═══ F5 ══════════════════════════════════════════════════════════════════════
header('F5  auto-zoom fokusu liczy podłogę wobec NOWEGO celu');
{
  const sys = () => { const c = mkCam(); c.frameSystem(5.8); return c; };   // kadr układu — cel w gwieździe (strefa)
  const cv = sys(); const rv = mkRenderer(cv);
  rv._vessels.set('v1', { sprite: { position: new Vec(20, 0.3, 5) } });
  call(compileListener(TR_SRC, 'vessel:focus', rv, SCOPE), rv, { vesselId: 'v1' });
  ok(near(cv._targetDist, 0.9) && cv._minDist === 0.05 && near(cv._goalTarget.x, 20),
    `F5a KONTROLA: fokus statku z kadru układu → auto-zoom ${f3(cv._targetDist)} (cel przestawiony PRZED dystansem — podłoga liczona przy statku)`);
  const cs = sys(); const rs = mkRenderer(cs);
  rs._stations.set('s1', { mesh: { position: new Vec(15, 0.2, -4) } });
  call(compileListener(TR_SRC, 'station:focus', rs, SCOPE), rs, { stationId: 's1' });
  ok(near(cs._targetDist, 0.3) && cs._minDist === 0.005 && near(cs._goalTarget.x, 15),
    `F5b KONTROLA: fokus stacji z kadru układu → ${f3(cs._targetDist)}`);
  const kIn = ZONE - 0.1;   // ciało tuż w strefie (1,2 R przy strefie 1,3)
  const cb = sys(); const rb = mkRenderer(cb, [{ id: 'inner', pos: new Vec(kIn * R_G, 0, 0) }]);
  call(compileListener(TR_SRC, 'body:selected', rb, SCOPE), rb, { entity: { id: 'inner', type: 'planet' } });
  ok(near(cb._targetDist, FLOOR_G) && near(cb._goalTarget.x, kIn * R_G),
    `F5c SEDNO: fokus ciała w strefie (${kIn.toFixed(1).replace('.', ',')} R) — auto-zoom (0,9) zatrzymany na podłodze ${f3(cb._targetDist)}`);
}

// ═══ F6 ══════════════════════════════════════════════════════════════════════
header('F6  tryb taktyczny — wyjście przywraca dystans 1:1 (flyTo: cel przed dystansem)');
{
  const c = mkCam({ dist: 0.3, target: NZ_POS });
  K.threeRenderer = { _cameraController: c };
  const tm = new TacticalModeController();
  const t0 = tgt(c);
  tm.enter();
  const inMode = { active: tm.isActive, dist: c._targetDist, centre: Math.hypot(...tgt(c)) === 0 };
  tm.exit('key');
  ok(inMode.active && inMode.centre && near(inMode.dist, 116), `F6a KONTROLA: wejście — cel = środek układu, dystans kadru ${f3(inMode.dist)}`);
  ok(near(c._targetDist, 0.3) && sameTgt(t0, tgt(c)),
    `F6b KONTROLA: wyjście — dystans ${f3(c._targetDist)} przy „Nowej Ziemi” (1:1 ze stanem sprzed trybu; nie ${f3(FLOOR_G)} z celu w gwieździe)`);
  const fb = methodBody(CC_SRC, '  flyTo(');
  ok(fb.indexOf('this._goalTarget.set(') > 0 && fb.indexOf('this._goalTarget.set(') < fb.indexOf('this.setTargetDist(dist)'),
    'F6c SEDNO: `flyTo` ustawia cel PRZED dystansem (podłoga zależy od celu)');
}

// ═══ F7 ══════════════════════════════════════════════════════════════════════
header('F7  „Obserwuj” — `_minDist` zostaje podłogą z fokusu');
{
  const end = compileMethod(TR_SRC, '_endWatch');
  // Obserwacja w strefie (cel w gwieździe), próg obniżony przez `_startWatch` do 0,05.
  const c = mkCam({ dist: 2, min: 0.05 });
  const r = mkRenderer(c);
  r._watch = { encounterId: 'enc', fitDist: true, minDistBefore: 0.3, minDistSet: 0.05, goal: null, dist: null };
  call(end, r);
  ok(!!end && c._minDist === 0.3 && r._watch === null && c._targetDist === 2,
    `F7a KONTROLA: koniec obserwacji — podłoga z fokusu oddana 1:1 (\`_minDist\` ${c._minDist}); dystans ${c._targetDist} ponad nią — bez ruchu kamery`);
  // Dystans poniżej podłogi sprzed obserwacji → `_endWatch` przycina go przez `setTargetDist` — w strefie do podłogi gwiazdy.
  const c2 = mkCam({ dist: 0.1, min: 0.05 });
  const r2 = mkRenderer(c2);
  r2._watch = { encounterId: 'enc', fitDist: true, minDistBefore: 0.3, minDistSet: 0.05, goal: null, dist: null };
  call(end, r2);
  ok(!!end && c2._minDist === 0.3 && near(c2._targetDist, FLOOR_G),
    `F7c SEDNO: koniec obserwacji z kamerą 0,1 od celu w gwieździe — przycięcie tą samą ścieżką do podłogi efektywnej ${f3(c2._targetDist)}`);
  const sw = methodBody(TR_SRC, '  _startWatch(');
  ok(/const minDistBefore = cc\._minDist;/.test(sw) && /minDistSet: cc\._minDist/.test(sw),
    'F7b KONTROLA: `_startWatch` zapamiętuje `_minDist` (podłogę z fokusu — nie efektywną)');
}

// ═══ F8 ══════════════════════════════════════════════════════════════════════
header('F8  renderer podaje promień tarczy (`_sunCoreRadius`)');
{
  const setCC = compileMethod(TR_SRC, 'setCameraController');
  const c = mkCam({ starR: null, dist: 40 });
  const r = mkRenderer(null); r._sunCoreRadius = 2.3686829004063505;
  call(setCC, r, c);
  ok(!!setCC && r._cameraController === c && c._starCoreRadius === 2.3686829004063505 && c._targetDist === 116 && near(c.minDist, FLOOR * 2.3686829004063505),
    `F8a SEDNO: \`setCameraController\` (WYKONANIE) — promień tarczy z renderera ${c._starCoreRadius} (wartość spoza domyślnych), kadr układu ${c._targetDist}, podłoga ${f3(c.minDist)}`);
  const c2 = mkCam({ starR: null }); const r2 = mkRenderer(null); r2._star = null;
  call(setCC, r2, c2);
  ok(c2._starCoreRadius === 0, `F8b SEDNO: bez gwiazdy (\`_star\` null) — promień 0 (jest: ${c2._starCoreRadius})`);
  const rs = methodBody(TR_SRC, '  renderStar(star) {');
  const iSet = rs.indexOf('this._sunCoreRadius = r * STAR_CORE_SCALE;'), iPass = rs.indexOf('this._cameraController?.setStarCoreRadius?.(this._sunCoreRadius);');
  ok(iSet > 0 && iPass > iSet && /new THREE\.SphereGeometry\(r \* STAR_CORE_SCALE, 64, 64\)/.test(rs),
    'F8c SEDNO: `renderStar` podaje kamerze `_sunCoreRadius` (= r × STAR_CORE_SCALE — promień kuli rdzenia) PO jego wyliczeniu');
  const gs = src('../../scenes/GameScene.js');
  const iInit = gs.indexOf('this.threeRenderer.initSystem(star, planets, planetesimals, moons);'), iCam = gs.indexOf('this.threeRenderer.setCameraController(this.cameraController);');
  ok(iInit > 0 && iCam > iInit, 'F8d KONTROLA: rozruch — `initSystem` (renderStar) PRZED `setCameraController` (dlatego promień podaje także on)');
  ok(/const STAR_CORE_SCALE = 3\.0;/.test(TR_SRC) && /const r = Math\.max\(0\.6, Math\.min\(1\.6, 0\.6 \+ starMass \* 0\.6\)\);/.test(rs),
    'F8e KONTROLA: wzór promienia tarczy w `renderStar` = wzór keepera (F1, F2)');
}

// ═══ F9 ══════════════════════════════════════════════════════════════════════
header('F9  bez gwiazdy — podłoga z fokusu');
{
  const legacy = Object.create(TCC.prototype);
  Object.assign(legacy, { _targetDist: 85, _minDist: 0.3, _goalTarget: { x: 0, y: 0, z: 0 } });   // atrapa sprzed 501 (bez promienia)
  ok(near(wheelToStop(legacy), 0.3), 'F9a KONTROLA: atrapa bez pola promienia (keepery sprzed 501), cel w środku — podłoga 0,3');
  const junk = [NaN, -2, 0, undefined, Infinity].map((v) => { const c = mkCam({ starR: null }); c.setStarCoreRadius?.(v); return c._starCoreRadius; });
  ok(junk.every((v) => v === 0), `F9b SEDNO: promień NaN / ujemny / 0 / brak / ∞ → 0 (bez podłogi przy gwieździe; jest: ${junk.join(', ')})`);
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
