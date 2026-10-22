// ═══════════════════════════════════════════════════════════════════════════════
// KEEPER — ARKUSZ HUD H0-2: orbity w kolorach motywu za flagą `FEATURES.hudOrbits` (HUD_PLAN.md §2.6, §4.1; D-HUD-7,
// D-HUD-15; Findingi 510, 511, 512).
// Uruchom: node src/testing/smoke/hud_orbits_smoke.mjs
//
// Przy ON: orbity planet / pierścienie księżyców / orbity planetoid w kolorach z tokenów `orbitLine` (domyślne, filtr)
// i `orbitColony` (dom, kolonie); zaznaczona — rola `primary`; niestabilna — `alert` w kryciu kolonii; krycie =
// dzisiejsze × 0,8; filtr „Żadne” chowa wszystkie orbity poza orbitą zaznaczonego ciała (511; D-HUD-7 uzupełnienie 3b,
// 2026-10-22 — planeta, księżyc, planetoida); przebudowa przy zmianie flagi, epoki motywu (F7)
// i domu (wczytanie zapisu — 510) co klatkę w pętli renderu (także w pauzie); po SHIFT widoczność z preferencji.
// Przy OFF: dzisiejszy kod co do bitu (hexy 0x003828 / 0x005540 / 0x007852 …).
//
// `ThreeRenderer` nie importuje się pod node — jego metody i słuchacze WYCIĘTE ze źródła i WYKONANE na atrapie `this`
// z atrapą THREE (wzór `click_focus_rule` T9 / `zoom_floor`); `HudOrbitLogic` / `HudPalette` — prawdziwe moduły
// (import dynamiczny — powstają w H0: brak modułu na starym drzewie = pin pada, suita się nie przerywa).
// PINY: SEDNO — pada na drzewie sprzed H0; KONTROLA — zielona po obu stronach (ścieżka OFF = dzisiejszy kod);
// STRAŻNIK — zielony po obu stronach, ale pada, gdy ścieżka ON zepsuje własność, którą dziś daje kod sprzed H0
// (zabija go mutacja — bateria `mutations/run_mutants.mjs`). Poprawka 3b (2026-10-22): piny O5a/O5b przecelowane,
// O5e/O5f/O5h — SEDNO poprawki (padają na drzewie H0-2 sprzed 3b, `302b008`), O5i — KONTROLA, O5g — STRAŻNIK poprawki
// (zielony na `302b008` i po 3b; na kotwicy `6496b38`, bez ścieżki ON, pada — tam najechanie w trakcie SHIFT odsłania
// orbity do następnej klatki renderu).
//   O0  API i montaż: moduł logiki, flaga `hudOrbits` (domyślnie ON), `_syncHudOrbits` w pętli renderu (nie w syncu fizyki)
//   O1  kolory: ON — z tokenów (motyw z rozjechanymi tokenami + 5 motywów ekranu tytułowego); OFF — dzisiejsze hexy co do bitu
//   O2  krycie × 0,8 (planety, księżyce, planetoidy, zaznaczona, najechana); tabela bazowa = krycia ścieżki OFF (wykonanie)
//   O3  przebudowa: epoka motywu (F7) i flaga ON ↔ OFF — bez biegu gry; OFF + zmiana epoki — bez pracy
//   O4  510 — orbita domu / kolonii po wczytaniu zapisu widoczna bez ticku (synchronizacja klatki), przy OFF — jak dziś
//   O5  511 + 3b — filtr „Żadne” przy ON: widoczna WYŁĄCZNIE orbita zaznaczonego ciała (planeta 0,56, księżyc 0,24,
//       planetoida 0,28 — `primary`); przeskakuje z zaznaczeniem, znika przy odznaczeniu; najechana — bez orbity; SHIFT
//       chowa także zaznaczoną; przy OFF — jak dziś: dom i kolonia zostają, zaznaczona (złota 0,7) też
//   O6  SHIFT: przebudowa w trakcie czystego widoku → po wyjściu widoczność z filtra — z klatką renderu między przebudową
//       a puszczeniem Shift (jak w grze; przy OFF orbity planetoid zostają ukryte na stałe — defekt sprzed H0, zmierzony
//       w grze) i bez niej (okno jednej klatki — przy OFF orbita ukryta filtrem wraca); przy ON oba zamknięte
//   O7  najechanie: planeta — `primary` 0,4; planetoida — `orbitLine` 0,16; zjazd kursora — stan domyślny
//   O8  klucz synchronizacji (czysta funkcja) i zwalnianie zasobów przy przebudowie planetoid
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import * as TC from '../../config/ThemeConfig.js';   // namespace — `themeEpoch` powstaje w H0
import { GAME_CONFIG } from '../../config/GameConfig.js';

let pass = 0, fail = 0;
const ok = (c, label) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const near = (a, b, e = 1e-12) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const hx = (n) => (Number.isInteger(n) ? '0x' + n.toString(16).padStart(6, '0') : String(n));

let HOL = null, HP = null;
try { HOL = await import('../../renderer/HudOrbitLogic.js'); } catch { HOL = null; }
try { HP = await import('../../ui/HudPalette.js'); } catch { HP = null; }
const { THEME, PRESET_THEMES, applyPreset, applyTheme } = TC;
const epoch = () => (typeof TC.themeEpoch === 'function' ? TC.themeEpoch() : 0);

// ── Źródło `ThreeRenderer` (bez komentarzy, LF) i wycinanie metod / słuchaczy ────────────────────────────────────
const TR = strip(readFileSync(new URL('../../renderer/ThreeRenderer.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
const methodBody = (code, sig) => { const i = code.indexOf(sig); return i < 0 ? '' : code.slice(i, code.indexOf('\n  }\n', i) + 4); };
const compileWith = (text, scope, thisArg) => {
  if (!text) return null;
  try {
    const names = Object.keys(scope);
    const make = new Function(...names, '__src', 'return eval("(" + __src + ")");');
    return make.call(thisArg, ...names.map((n) => scope[n]), text);
  } catch (e) { console.log('    (kompilacja: ' + e.message + ')'); return null; }
};
const compileMethod = (name, scope) => {
  const b = methodBody(TR, `\n  ${name}(`);
  return b ? compileWith('function ' + b.trim().slice(name.length), scope, null) : null;
};
const listenerText = (ev) => {
  const sig = `EventBus.on('${ev}', safe(`;
  const i = TR.indexOf(sig);
  if (i < 0) return '';
  const end = TR.indexOf('\n    }));', i);
  return end < 0 ? '' : TR.slice(i + sig.length, end + '\n    }'.length);
};

// ── Atrapa THREE ─────────────────────────────────────────────────────────────────────────────────────────────────
class FColor { constructor(v) { this.hex = typeof v === 'number' ? v >>> 0 : (v instanceof FColor ? v.hex : 0); } setHex(h) { this.hex = h >>> 0; return this; } getHex() { return this.hex; } }
class FMat { constructor(o = {}) { this.color = o.color instanceof FColor ? o.color : new FColor(o.color ?? 0xffffff); this.transparent = !!o.transparent; this.opacity = o.opacity ?? 1; this.disposed = false; } dispose() { this.disposed = true; } }
class FGeo { setFromPoints(p) { this.n = p.length; return this; } dispose() { this.disposed = true; } }
class FLine { constructor(g, m) { this.geometry = g; this.material = m; this.visible = true; this.userData = {}; } }
class FVec3 { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } }
let _uuid = 0;
class FMesh { constructor(g, m) { this.geometry = g; this.material = m; this.uuid = 'u' + (++_uuid); this.userData = {}; this.position = { set() {} }; } }
const THREE = { Line: FLine, BufferGeometry: FGeo, LineBasicMaterial: FMat, Color: FColor, Vector3: FVec3,
  SphereGeometry: class { dispose() {} }, MeshStandardMaterial: FMat, Mesh: FMesh };

// ── Świat: układ z domem, kolonią, planetą z życiem, zwykłą, niestabilną i drugą zwykłą; księżyce; planetoidy ─────
const P = (id, a, extra = {}) => ({ id, type: 'planet', orbital: { a, e: 0.05, inclinationOffset: 0.3 }, lifeScore: 0, orbitalStability: 1, ...extra });
const HOME = P('p_home', 1.0, { lifeScore: 80 }), COL = P('p_col', 1.6), LIFE = P('p_life', 2.2, { lifeScore: 10 });
const PLAIN = P('p_plain', 3.0), UNST = P('p_unst', 4.0, { orbitalStability: 0.3 }), SEL = P('p_sel', 5.0);
const PLANETS = [HOME, COL, LIFE, PLAIN, UNST, SEL];
const PDS = [{ id: 'pd1', type: 'planetoid', orbital: { a: 6, e: 0.1, inclinationOffset: 0 } }, { id: 'pd2', type: 'planetoid', orbital: { a: 7, e: 0.2, inclinationOffset: 1 } }];
const MOONS = [{ id: 'm1', type: 'moon', parentPlanetId: 'p_home', orbital: { a: 0.002, e: 0.01, inclinationOffset: 0 }, x: 1, y: 1, physics: { mass: 0.001 } },
  { id: 'm2', type: 'moon', parentPlanetId: 'p_col', orbital: { a: 0.003, e: 0.02, inclinationOffset: 0.5 }, x: 2, y: 2, physics: { mass: 0.002 } }];
const ALL = [...PLANETS, ...PDS, ...MOONS];
const EntityManager = {
  getByTypeInSystem: (type) => (type === 'planet' ? PLANETS : type === 'planetoid' ? PDS : []),
  get: (id) => ALL.find((e) => e.id === id) ?? null,
};
const COLONIES = new Set(['p_home', 'p_col']);
const colonyManager = { getColony: (id) => (COLONIES.has(id) ? { planetId: id } : null), hasColony: (id) => COLONIES.has(id) };
const K = globalThis.window.KOSMOS ?? (globalThis.window.KOSMOS = {});
const setWorld = ({ home = HOME, colMgr = colonyManager } = {}) => {
  K.activeSystemId = 'sys_home'; K.homePlanet = home ?? undefined; K.colonyManager = colMgr ?? undefined;
};

// Flaga sterowana przez keeper (atrapa GAME_CONFIG w zasięgu metod) — definicja `hudOrbitsOn` WYCIĘTA ze źródła.
const FLAGS = { hudOrbits: true };
const GC = { FEATURES: FLAGS };
const hudOrbitsSrc = TR.match(/const hudOrbitsOn = (\(\) => [^;]+);/)?.[1] ?? '';
const hudOrbitsOn = compileWith(hudOrbitsSrc, { isHudOrbitsOn: HOL?.isHudOrbitsOn, GAME_CONFIG: GC }, null) ?? (() => false);
const SCOPE = {
  THREE, S: (v) => v / 10, AU: GAME_CONFIG.AU_TO_PX, WORLD_SCALE: 10, EntityManager, GAME_CONFIG: GC, EventBus: { emit() {} },
  hudOrbitsOn, themeEpoch: () => epoch(),
  planetOrbitStyle: HOL?.planetOrbitStyle, moonOrbitStyle: HOL?.moonOrbitStyle, planetoidOrbitStyle: HOL?.planetoidOrbitStyle,
  applyOrbitStyle: HOL?.applyOrbitStyle, orbitPalette: HOL?.orbitPalette, hudOrbitSyncKey: HOL?.hudOrbitSyncKey,
  resolveTextureType: () => null, loadPlanetTextures: () => ({}), hashCode: () => 1, TEXTURE_VARIANTS: 3,
};
const METHODS = ['_buildOrbit', '_rebuildAllOrbits', '_restoreOrbitDefaults', 'setOrbitFilter', '_applyOrbitFilter',
  '_addMoonMesh', '_showMoonOrbit', '_hideAllMoonOrbits', '_buildPlanetoidOrbit', '_showPlanetoidOrbit', '_hideAllPlanetoidOrbits',
  '_rebuildPlanetoidOrbits', 'setCleanView', '_applyCleanViewVisibility',
  '_syncHudOrbits', '_hudRefreshAllOrbits', '_hudRebuildPlanetoidOrbits', '_hudOrbitState', '_hudStylePlanetOrbit',
  '_hudStyleMoonRing', '_hudStylePlanetoidOrbit', '_hudRestylePlanetOrbits', '_hudRestyleMoonRings', '_hudRestylePlanetoidOrbits',
  '_hudRestyleOrbits'];
const COMPILED = Object.fromEntries(METHODS.map((m) => [m, compileMethod(m, SCOPE)]));
const LISTEN = Object.fromEntries(['planet:hover', 'body:selected', 'body:deselected', 'orbits:filterChanged']
  .map((ev) => [ev, listenerText(ev)]));

/** Atrapa renderera ze stanem scenicznym i PRAWDZIWYMI metodami; scena zbudowana jak `initSystem` (planety, księżyce, planetoidy). */
const mkR = ({ filter = 'all', build = true } = {}) => {
  const scene = { objs: new Set(), add(o) { this.objs.add(o); }, remove(o) { this.objs.delete(o); } };
  const r = {
    scene, _star: { x: 0, y: 0 }, _orbits: new Map(), _planetoidOrbits: new Map(), _moons: new Map(),
    _planets: new Map(PLANETS.map((p) => [p.id, { group: { kids: [], add(o) { this.kids.push(o); } } }])),
    _orbitFilter: filter, _selectedEntityId: null, _hudOrbitKey: null, _hudHoverOrbitId: null, _cleanView: undefined,
    _clickable: [], _entityByUUID: new Map(), _bakePlanetTexture: () => null,
    _tacticalOrbitMarkers: new Map(), _tradeLines: [], _tradeFireflies: [], _vessels: new Map(), _sensorRingMeshes: new Map(),
    _predictionConeMeshes: new Map(), _enemyAlertMarkers: new Map(), _tacticalGlyphs: new Map(), _hpBars: new Map(),
    _colonyMarkers: { show() {}, hide() {} }, _hideColonyTooltip() {}, _getEntityRadius: () => 0.2, _cameraController: null,
  };
  for (const [m, f] of Object.entries(COMPILED)) if (f) r[m] = f;
  for (const [ev, txt] of Object.entries(LISTEN)) r['on:' + ev] = compileWith(txt, SCOPE, r);
  if (build) {
    r._rebuildAllOrbits?.();
    for (const m of MOONS) r._addMoonMesh?.(m);
    for (const p of PDS) r._buildPlanetoidOrbit?.(p);
  }
  return r;
};
const ln = (r, id) => r._orbits.get(id) ?? r._planetoidOrbits.get(id) ?? r._moons.get(id)?.ring ?? null;
const st = (l) => (l ? { c: l.material.color.getHex(), o: l.material.opacity, v: l.visible } : null);
const allOrbitLines = (r) => [...r._orbits.values(), ...r._planetoidOrbits.values(), ...[...r._moons.values()].map((e) => e.ring)];
const visibleCount = (r) => allOrbitLines(r).filter((l) => l?.visible).length;
const select = (r, ent) => r['on:body:selected']?.({ entity: ent, focus: false });
// Token → 0xRRGGBB parserem KEEPERA (niezależnym od testowanego modułu): '#rrggbb' albo 'rgb(a)(r,g,b[,a])', krycie pomijane.
const tokInt = (s) => {
  const m = String(s ?? '').match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return (+m[1] << 16) | (+m[2] << 8) | +m[3];
  return /^#[0-9a-f]{6}$/i.test(String(s)) ? parseInt(String(s).slice(1), 16) : NaN;
};

// Motyw z ROZJECHANYMI tokenami (w presetach orbitLine = orbitColony = accent w RGB — pin musi rozróżniać źródła).
const SPLIT = () => {
  applyPreset(PRESET_THEMES.ambient_1);
  applyTheme({ orbitLine: PRESET_THEMES.ambient_2.orbitLine, orbitColony: PRESET_THEMES.ambient_3.orbitColony,
    accent: PRESET_THEMES.ambient_4.accent });   // zielony accent ↔ czerwony danger zlewa się w deuteranopii ⇒ alert = warning (B2)
};

// ═══ O0 ══════════════════════════════════════════════════════════════════════
header('O0  API i montaż');
{
  ok(['planetOrbitStyle', 'moonOrbitStyle', 'planetoidOrbitStyle', 'applyOrbitStyle', 'orbitPalette', 'hudOrbitSyncKey', 'isHudOrbitsOn']
    .every((k) => typeof HOL?.[k] === 'function'), 'O0a SEDNO: `src/renderer/HudOrbitLogic.js` — style orbit, paleta, klucz synchronizacji, flaga');
  ok(GAME_CONFIG.FEATURES.hudOrbits === true, `O0b SEDNO: \`FEATURES.hudOrbits\` = true (domyślnie ON po bramce H0; jest: ${GAME_CONFIG.FEATURES.hudOrbits})`);
  ok(HOL?.isHudOrbitsOn?.({}) === false && HOL?.isHudOrbitsOn?.({ hudOrbits: 1 }) === false && HOL?.isHudOrbitsOn?.({ hudOrbits: true }) === true,
    'O0c SEDNO: brak klucza = OFF, tylko `=== true` włącza');
  const loop = methodBody(TR, '\n  _startLoop() {');
  const phys = listenerText('physics:updated');
  ok(/this\._syncHudOrbits\(\);/.test(loop) && !/_syncHudOrbits/.test(phys) && !/_syncHudOrbits/.test(methodBody(TR, '\n  _syncPlanetMeshes(')),
    'O0d SEDNO: `_syncHudOrbits()` w pętli renderu (`_startLoop` — także w pauzie), nie w syncu fizyki');
  ok(!!hudOrbitsSrc && /GAME_CONFIG\.FEATURES/.test(hudOrbitsSrc), 'O0e SEDNO: `hudOrbitsOn` czyta flagę FUNKCJĄ z `GAME_CONFIG.FEATURES` (przestawienie w konsoli działa)');
  const missing = METHODS.filter((m) => !COMPILED[m]);
  ok(missing.length === 0, `O0f SEDNO: metody ścieżki ON wycięte ze źródła i skompilowane (brak: ${missing.join(', ') || '—'})`);
}

// ═══ O1 ══════════════════════════════════════════════════════════════════════
header('O1  kolory — ON z tokenów, OFF dzisiejsze hexy');
{
  setWorld(); FLAGS.hudOrbits = true; SPLIT();
  const r = mkR({ filter: 'all' });
  select(r, SEL);
  const want = { line: tokInt(THEME.orbitLine), colony: tokInt(THEME.orbitColony), primary: tokInt(THEME.accent), alert: tokInt(HP?.resolveHudRoles?.()?.alert) };
  const cand = [THEME.orbitLine, THEME.orbitColony, THEME.accent, THEME.danger, THEME.warning].map(tokInt);
  const distinct = new Set(cand).size === 5 && cand.every(Number.isInteger);
  ok(distinct, `O1a KONTROLA: motyw testowy rozróżnia źródła — orbitLine / orbitColony / accent / danger / warning: ${cand.map(hx).join(' · ')}`);
  const c = (id) => ln(r, id)?.material.color.getHex();
  ok(c('p_home') === want.colony && c('p_col') === want.colony, `O1b SEDNO: dom i kolonia — \`orbitColony\` (${hx(c('p_home'))}, ${hx(c('p_col'))})`);
  ok(c('p_life') === want.line && c('p_plain') === want.line, `O1c SEDNO: planeta z życiem i zwykła — \`orbitLine\` (${hx(c('p_life'))}, ${hx(c('p_plain'))})`);
  ok(c('p_sel') === want.primary, `O1d SEDNO: zaznaczona — \`primary\` (${hx(c('p_sel'))})`);
  ok(c('p_unst') === want.alert && HP?.resolveHudRoles?.()?.alertSource === 'warning',
    `O1e SEDNO: niestabilna — rola \`alert\` (${hx(c('p_unst'))}; zielony primary ↔ czerwony danger ⇒ ${HP?.resolveHudRoles?.()?.alertSource})`);
  ok(c('m1') === want.line && c('pd1') === want.line, `O1f SEDNO: pierścień księżyca i orbita planetoidy — \`orbitLine\` (${hx(c('m1'))}, ${hx(c('pd1'))})`);
  select(r, PDS[0]);
  ok(c('pd1') === want.primary && c('p_sel') === want.line, `O1g SEDNO: zaznaczona planetoida — \`primary\`; zwolniona planeta — \`orbitLine\` (${hx(c('pd1'))}, ${hx(c('p_sel'))})`);
  select(r, MOONS[1]);
  ok(c('m2') === want.primary && c('m1') === want.line, `O1h SEDNO: zaznaczony księżyc — \`primary\`; drugi — \`orbitLine\` (${hx(c('m2'))}, ${hx(c('m1'))})`);
  // 5 motywów ekranu tytułowego — kolory z ICH tokenów
  for (const [id, pk] of [['Amber Noir', 'ambient_1'], ['Cold Blue', 'ambient_2'], ['Galactic Violet', 'ambient_3'], ['Biopunk Green', 'ambient_4'], ['Neon Cyber', 'neon_cyber']]) {
    applyPreset(PRESET_THEMES[pk]);
    const r5 = mkR({ filter: 'all' });
    const roles = HP?.resolveHudRoles?.();
    const okc = ln(r5, 'p_home')?.material.color.getHex() === tokInt(THEME.orbitColony) && ln(r5, 'p_plain')?.material.color.getHex() === tokInt(THEME.orbitLine)
      && ln(r5, 'p_unst')?.material.color.getHex() === tokInt(roles?.alert) && ln(r5, 'm1')?.material.color.getHex() === tokInt(THEME.orbitLine);
    ok(okc, `O1i SEDNO: ${id} — dom ${hx(ln(r5, 'p_home')?.material.color.getHex())} · zwykła ${hx(ln(r5, 'p_plain')?.material.color.getHex())} · niestabilna ${hx(ln(r5, 'p_unst')?.material.color.getHex())} (${roles?.alertSource})`);
  }
  // OFF — dzisiejszy kod co do bitu
  FLAGS.hudOrbits = false; SPLIT();
  const o = mkR({ filter: 'all' });
  select(o, SEL);
  const oc = (id) => ln(o, id)?.material.color.getHex();
  ok(oc('p_plain') === 0x003828 && oc('p_life') === 0x005540 && oc('p_home') === 0x007852,
    `O1j KONTROLA: OFF — zwykła 0x003828, życie 0x005540, dom 0x007852 (jest: ${hx(oc('p_plain'))}, ${hx(oc('p_life'))}, ${hx(oc('p_home'))})`);
  ok(oc('p_unst') === 0x553322 && oc('p_sel') === 0xffc832 && oc('m1') === 0x445566 && oc('pd1') === 0x554433,
    `O1k KONTROLA: OFF — niestabilna 0x553322, zaznaczona 0xffc832, księżyc 0x445566, planetoida 0x554433`);
  o._orbitFilter = 'planetoids'; o._applyOrbitFilter?.();
  ok(oc('p_home') === 0x007852 && oc('p_col') === 0x005540, `O1l KONTROLA: OFF — \`_restoreOrbitDefaults\`: dom 0x007852, kolonia 0x005540`);
  FLAGS.hudOrbits = true;
}

// ═══ O2 ══════════════════════════════════════════════════════════════════════
header('O2  krycie × 0,8; tabela bazowa = krycia ścieżki OFF');
{
  const B = HOL?.ORBIT_BASE_OPACITY ?? {};
  // Tabela bazowa = to, co NAPRAWDĘ daje ścieżka OFF (wykonanie, nie regex)
  setWorld(); FLAGS.hudOrbits = false; applyPreset(PRESET_THEMES.ambient_1);
  const o = mkR({ filter: 'all' });
  const off = { home: st(ln(o, 'p_home')).o, plain: st(ln(o, 'p_plain')).o, col: NaN };
  o._orbitFilter = 'planetoids'; o._applyOrbitFilter?.(); off.col = st(ln(o, 'p_col')).o;
  o._orbitFilter = 'all'; o._applyOrbitFilter?.();
  off.moon = st(ln(o, 'm1')).o; off.pd = st(ln(o, 'pd1')).o;
  select(o, SEL); off.sel = st(ln(o, 'p_sel')).o;
  select(o, MOONS[0]); off.moonSel = st(ln(o, 'm1')).o;
  select(o, PDS[0]); off.pdSel = st(ln(o, 'pd1')).o;
  o['on:planet:hover']?.({ entityId: 'p_plain' }); off.hover = st(ln(o, 'p_plain')).o;
  o['on:planet:hover']?.({ entityId: 'pd2' }); off.pdHover = st(ln(o, 'pd2')).o;
  const pairs = [['planetHome', off.home], ['planetColony', off.col], ['planetFilter', off.plain], ['planetSelected', off.sel],
    ['planetHover', off.hover], ['moonFilter', off.moon], ['moonSelected', off.moonSel], ['planetoidFilter', off.pd],
    ['planetoidSelected', off.pdSel], ['planetoidHover', off.pdHover]];
  const bad = pairs.filter(([k, v]) => !near(B[k], v));
  ok(Object.keys(B).length === 10 && bad.length === 0,
    `O2a SEDNO: ORBIT_BASE_OPACITY = krycia ścieżki OFF (${pairs.map(([k, v]) => `${k} ${v}`).join(' · ')}${bad.length ? ' — RÓŻNE: ' + bad.map((b) => b[0]).join(', ') : ''})`);
  ok(HOL?.HUD_ORBIT_OPACITY_MULT === 0.8, 'O2b SEDNO: mnożnik krycia 0,8 (D-HUD-7)');
  // ON — krycie × 0,8 na żywych metodach
  FLAGS.hudOrbits = true; SPLIT();
  const r = mkR({ filter: 'all' });
  const on = { home: st(ln(r, 'p_home')).o, col: st(ln(r, 'p_col')).o, plain: st(ln(r, 'p_plain')).o, unst: st(ln(r, 'p_unst')).o,
    moon: st(ln(r, 'm1')).o, pd: st(ln(r, 'pd1')).o };
  select(r, SEL); on.sel = st(ln(r, 'p_sel')).o;
  select(r, MOONS[0]); on.moonSel = st(ln(r, 'm1')).o;
  select(r, PDS[0]); on.pdSel = st(ln(r, 'pd1')).o;
  r['on:planet:hover']?.({ entityId: 'p_plain' }); on.hover = st(ln(r, 'p_plain')).o;
  r['on:planet:hover']?.({ entityId: 'pd2' }); on.pdHover = st(ln(r, 'pd2')).o;
  const exp = { home: 0.15, col: 0.10, plain: 0.08, unst: 0.10, moon: 0.15, pd: 0.12, sel: 0.7, moonSel: 0.30, pdSel: 0.35, hover: 0.5, pdHover: 0.20 };
  const wrong = Object.entries(exp).filter(([k, v]) => !near(on[k], v * 0.8));
  ok(wrong.length === 0, `O2c SEDNO: ON — krycie × 0,8: ${Object.entries(on).map(([k, v]) => `${k} ${+v.toFixed(4)}`).join(' · ')}${wrong.length ? ' — ZŁE: ' + wrong.map((w) => w[0]).join(', ') : ''}`);
}

// ═══ O3 ══════════════════════════════════════════════════════════════════════
header('O3  przebudowa: epoka motywu (F7), flaga ON ↔ OFF — bez biegu gry');
{
  setWorld(); FLAGS.hudOrbits = true; applyPreset(PRESET_THEMES.ambient_2);
  const r = mkR({ filter: 'all' });
  select(r, MOONS[0]);
  r._syncHudOrbits?.();                                  // klatka 1 — klucz ustawiony
  const first = st(ln(r, 'p_plain'));
  let rebuilds = 0;
  const realRebuild = r._rebuildAllOrbits;
  r._rebuildAllOrbits = function () { rebuilds++; return realRebuild?.call(this); };
  r._syncHudOrbits?.(); r._syncHudOrbits?.();
  ok(!!r._syncHudOrbits && rebuilds === 0, `O3a SEDNO: kolejne klatki bez zmiany — bez przebudowy (${rebuilds})`);
  applyPreset(PRESET_THEMES.neon_cyber);                // F7 / ekran tytułowy — epoka +1
  r._syncHudOrbits?.();
  ok(rebuilds === 1 && st(ln(r, 'p_plain'))?.c === tokInt(THEME.orbitLine) && first?.c === tokInt(PRESET_THEMES.ambient_2.orbitLine),
    `O3b SEDNO: zmiana motywu → przebudowa w następnej klatce (${hx(first?.c)} → ${hx(st(ln(r, 'p_plain'))?.c)}; przebudowy: ${rebuilds})`);
  ok(st(ln(r, 'm1'))?.c === tokInt(THEME.accent) && near(st(ln(r, 'm1'))?.o, 0.24),
    'O3c SEDNO: zaznaczony księżyc po przebudowie — nadal `primary` 0,24 (zaznaczenie przeżywa przebudowę)');
  const preOff = { m1: st(ln(r, 'm1'))?.c, pd1: st(ln(r, 'pd1'))?.o };   // świadek: przed przejściem ON → OFF stan ON
  FLAGS.hudOrbits = false;                               // ON → OFF w konsoli
  r._syncHudOrbits?.();
  ok(rebuilds === 2 && st(ln(r, 'p_plain'))?.c === 0x003828 && near(st(ln(r, 'p_plain'))?.o, 0.08)
    && st(ln(r, 'p_home'))?.c === 0x007852 && near(st(ln(r, 'p_home'))?.o, 0.15),
    `O3d SEDNO: ON → OFF — dzisiejsze hexy i krycia (zwykła ${hx(st(ln(r, 'p_plain'))?.c)} ${st(ln(r, 'p_plain'))?.o}, dom ${hx(st(ln(r, 'p_home'))?.c)} ${st(ln(r, 'p_home'))?.o})`);
  ok(preOff.m1 === tokInt(PRESET_THEMES.neon_cyber.accent) && near(preOff.pd1, 0.096)
    && st(ln(r, 'm1'))?.c === 0x445566 && near(st(ln(r, 'm1'))?.o, 0.30) && st(ln(r, 'm2'))?.c === 0x445566 && near(st(ln(r, 'm2'))?.o, 0.15)
    && st(ln(r, 'pd1'))?.c === 0x554433 && near(st(ln(r, 'pd1'))?.o, 0.12),
    `O3e SEDNO: ON → OFF — pierścienie z ${hx(preOff.m1)} wracają do 0x445566 (zaznaczony 0,30, drugi 0,15), planetoida z ${preOff.pd1} do 0x554433 0,12 — jak dzisiejszy kod po zaznaczeniu`);
  applyPreset(PRESET_THEMES.ambient_3);                  // OFF + zmiana motywu
  r._syncHudOrbits?.();
  ok(rebuilds === 2 && st(ln(r, 'p_plain'))?.c === 0x003828, `O3f SEDNO: OFF + zmiana motywu — bez przebudowy (ścieżka OFF bez pracy; przebudowy: ${rebuilds})`);
  FLAGS.hudOrbits = true;                                // OFF → ON
  r._syncHudOrbits?.();
  ok(rebuilds === 3 && st(ln(r, 'p_plain'))?.c === tokInt(THEME.orbitLine) && st(ln(r, 'm1'))?.c === tokInt(THEME.accent),
    `O3g SEDNO: OFF → ON — kolory z motywu bez biegu gry (${hx(st(ln(r, 'p_plain'))?.c)})`);
  const ep = epoch(); applyTheme({ accent: THEME.accent });
  ok(epoch() === ep + 1, 'O3h SEDNO: `applyTheme` podbija epokę (wejście O3b)');
}

// ═══ O4 ══════════════════════════════════════════════════════════════════════
header('O4  510 — orbita domu i kolonii po wczytaniu zapisu, bez ticku');
{
  // Scena budowana PRZED odtworzeniem kolonii i domu (GameScene: initSystem → … → colonyManager.restore → setTimeout(dom)).
  for (const on of [true, false]) {
    FLAGS.hudOrbits = on; applyPreset(PRESET_THEMES.ambient_1);
    setWorld({ home: null, colMgr: null });
    const r = mkR({ filter: 'planetoids' });
    const before = { home: ln(r, 'p_home')?.visible, col: ln(r, 'p_col')?.visible };
    setWorld();                                           // odtworzenie: kolonie + dom (bez ticku, bez `_syncPlanetMeshes`)
    r._syncHudOrbits?.();                                 // klatka pętli renderu (pauza: pętla działa, fizyka stoi)
    const after = { home: ln(r, 'p_home')?.visible, col: ln(r, 'p_col')?.visible, homeC: ln(r, 'p_home')?.material.color.getHex() };
    if (on) {
      ok(before.home === false && before.col === false, `O4a KONTROLA: przed odtworzeniem orbita domu i kolonii ukryta (stan sceny po wczytaniu)`);
      ok(after.home === true && after.col === true && after.homeC === tokInt(THEME.orbitColony),
        `O4b SEDNO: ON — po odtworzeniu, BEZ ticku: dom i kolonia widoczne, kolor \`orbitColony\` (${hx(after.homeC)})`);
    } else {
      ok(before.home === false && after.home === false && after.col === false,
        'O4c KONTROLA: OFF — jak dziś: orbita domu i kolonii ukryta do pierwszej przebudowy (510 przy OFF zostaje)');
    }
  }
  setWorld(); FLAGS.hudOrbits = true;
  // Dom ustawiony PÓŹNIEJ niż pierwsza klatka (kolejność zegara przeglądarki) — klucz zawiera id domu.
  applyPreset(PRESET_THEMES.ambient_2);
  setWorld({ home: null });
  const r = mkR({ filter: 'planetoids' });
  r._syncHudOrbits?.();
  const mid = ln(r, 'p_home')?.material.opacity;
  setWorld();
  r._syncHudOrbits?.();
  ok(near(mid, 0.08) && near(ln(r, 'p_home')?.material.opacity, 0.12),
    `O4d SEDNO: dom ustawiony po pierwszej klatce — kolejna klatka podnosi orbitę do krycia domu (${mid} → ${ln(r, 'p_home')?.material.opacity})`);
}

// ═══ O5 ══════════════════════════════════════════════════════════════════════
header('O5  511 + 3b — filtr „Żadne”: wyłącznie orbita zaznaczonego ciała');
{
  // D-HUD-7 uzupełnienie 3b (decyzja właściciela 2026-10-22): przy „Żadne” zostaje orbita ZAZNACZONEGO ciała — planety,
  // pierścień księżyca, orbita planetoidy (`primary`, krycie zaznaczonej × 0,8); reszta ukryta, także dom, kolonie
  // i najechana (511). Piny „tylko zaznaczona” niosą ŚWIADKA — linia widoczna jest TĄ zaznaczoną (pusta lista nie zdaje).
  setWorld(); FLAGS.hudOrbits = true; applyPreset(PRESET_THEMES.ambient_3);
  const r = mkR({ filter: 'all' });
  const vis = () => allOrbitLines(r).filter((l) => l?.visible);
  const only = (id) => { const v = vis(); return v.length === 1 && v[0] === ln(r, id); };
  select(r, SEL);
  const before = visibleCount(r);
  r['on:orbits:filterChanged']?.({ mode: 'none' });
  const after = visibleCount(r), s5 = st(ln(r, 'p_sel'));
  ok(before === allOrbitLines(r).length && before >= 10 && only('p_sel') && s5?.c === tokInt(THEME.accent) && near(s5?.o, 0.56),
    `O5a SEDNO: ON — „Żadne” przy zaznaczonej planecie: ${before} → ${after} widocznych — wyłącznie zaznaczona, \`primary\` 0,56 (${hx(s5?.c)} ${s5?.o}); dom, kolonia i reszta ukryte`);
  r['on:planet:hover']?.({ entityId: 'p_plain' });
  const hovP = only('p_sel') && ln(r, 'p_plain')?.visible === false;
  r['on:planet:hover']?.({ entityId: 'pd2' });
  const hovPd = only('p_sel') && ln(r, 'pd2')?.visible === false;
  ok(hovP && hovPd, `O5b SEDNO: ON — „Żadne” + najechanie (planeta, planetoida): najechana bez orbity, widoczna nadal wyłącznie zaznaczona (${hovP}, ${hovPd})`);
  r['on:planet:hover']?.({ entityId: null });
  r['on:orbits:filterChanged']?.({ mode: 'planetoids' });
  ok(ln(r, 'p_home')?.visible === true && ln(r, 'p_col')?.visible === true && ln(r, 'pd1')?.visible === true && ln(r, 'p_plain')?.visible === false,
    'O5c KONTROLA: kursor zjechał, powrót do „Planetoidy” — dom, kolonia i planetoidy widoczne, zwykła planeta nie (jak dziś)');
  FLAGS.hudOrbits = false;
  const o = mkR({ filter: 'all' });
  o['on:orbits:filterChanged']?.({ mode: 'none' });
  const offVis = allOrbitLines(o).filter((l) => l.visible);
  ok(offVis.length === 2 && ln(o, 'p_home').visible && ln(o, 'p_col').visible,
    `O5d KONTROLA: OFF — jak dziś: przy „Żadne” zostają dom i kolonia (${offVis.length})`);
  FLAGS.hudOrbits = true;
  // Zaznaczenie przeskakuje: planeta → księżyc → planetoida (poprzednia orbita znika).
  r['on:orbits:filterChanged']?.({ mode: 'none' });
  select(r, MOONS[0]);
  const mOnly = only('m1'), ms = st(ln(r, 'm1'));
  select(r, PDS[0]);
  const pOnly = only('pd1'), ps = st(ln(r, 'pd1'));
  ok(mOnly && ms?.c === tokInt(THEME.accent) && near(ms?.o, 0.24) && pOnly && ps?.c === tokInt(THEME.accent) && near(ps?.o, 0.28),
    `O5e SEDNO: ON — „Żadne”: zaznaczenie przeskakuje — pierścień księżyca \`primary\` 0,24 (${mOnly}), potem orbita planetoidy \`primary\` 0,28 (${pOnly}); poprzednia znika`);
  const preDesel = vis().length;                                   // świadek: 1 — zaznaczona planetoida
  r['on:body:deselected']?.();
  ok(preDesel === 1 && visibleCount(r) === 0, `O5f SEDNO: ON — „Żadne” + odznaczenie: ${preDesel} → ${visibleCount(r)} — orbita zaznaczonego ciała znika`);
  // SHIFT przy „Żadne”: czysty widok chowa także zaznaczoną — również po restylu w trakcie (najechanie); po puszczeniu wraca.
  select(r, SEL);
  const preShift = vis().length;
  r.setCleanView?.(true);
  r['on:planet:hover']?.({ entityId: 'p_plain' });                // restyl w trakcie czystego widoku
  const during = visibleCount(r);
  r['on:planet:hover']?.({ entityId: null });
  ok(r._cleanView === true && during === 0,
    `O5g STRAŻNIK: ON — „Żadne” + SHIFT: czysty widok chowa także orbitę zaznaczonego ciała, również po restylu w trakcie (${during})`);
  r.setCleanView?.(false);
  ok(preShift === 1 && only('p_sel'), `O5h SEDNO: ON — „Żadne” po puszczeniu SHIFT: wraca wyłącznie orbita zaznaczonej (${preShift} → ${during} → ${vis().length})`);
  // OFF — jak dziś: zaznaczenie przy „Żadne” pokazuje zaznaczoną (złotą) obok domu i kolonii.
  FLAGS.hudOrbits = false;
  select(o, SEL);
  const offSel = allOrbitLines(o).filter((l) => l.visible), os = st(ln(o, 'p_sel'));
  ok(offSel.length === 3 && os?.v === true && os?.c === 0xffc832 && near(os?.o, 0.7) && ln(o, 'p_home').visible && ln(o, 'p_col').visible,
    `O5i KONTROLA: OFF — jak dziś: zaznaczenie przy „Żadne” — zaznaczona ${hx(os?.c)} ${os?.o} + dom + kolonia (${offSel.length})`);
  FLAGS.hudOrbits = true;
}

// ═══ O6 ══════════════════════════════════════════════════════════════════════
header('O6  SHIFT (czysty widok) — po wyjściu widoczność z preferencji');
{
  // `frame` — czy między przebudową a puszczeniem Shift wypada klatka renderu. W grze pętla renderu przy czystym widoku
  // CO KLATKĘ woła `_applyCleanViewVisibility(true)` (zapamiętuje widoczność nowych linii i je chowa), więc „bez klatki”
  // to okno jednej klatki: puszczenie Shift tuż po przebudowie, zanim pętla renderu ją obsłużyła.
  // ZMIERZONE w prawdziwej grze (sonda `probe_shift_running_h0.mjs`: Shift 6 s przy biegnącej grze, dwa okresowe
  // odświeżenia w czystym widoku): kod sprzed H0 — orbity planetoid 18/18 → 0/18 po puszczeniu i 0/18 po kolejnych 7 s
  // (`_rebuildPlanetoidOrbits` kopiuje widoczność ze starych, ukrytych linii); kod H0 przy ON — 18/18 i 18/18.
  for (const on of [true, false]) {
    for (const frame of [false, true]) {
      setWorld(); FLAGS.hudOrbits = on; applyPreset(PRESET_THEMES.ambient_2);
      const r = mkR({ filter: 'planetoids' });
      r._syncHudOrbits?.();
      const pre = allOrbitLines(r).map((l) => l.visible);
      r.setCleanView?.(true);
      const hiddenAll = visibleCount(r) === 0;
      r._rebuildAllOrbits?.();                              // przebudowa w trakcie SHIFT (co 180 klatek w biegu / epoka)
      r._rebuildPlanetoidOrbits?.();
      const duringVis = visibleCount(r);
      if (frame) r._applyCleanViewVisibility?.(true);      // klatka renderu przy czystym widoku (jak `_startLoop`)
      r.setCleanView?.(false);
      const post = allOrbitLines(r).map((l) => l.visible);
      const same = pre.length === post.length && pre.every((v, i) => v === post[i]);
      const homeVis = ln(r, 'p_home')?.visible === true;
      if (on && !frame) {
        ok(hiddenAll && duringVis === 0, `O6a SEDNO: ON — w czystym widoku orbity ukryte, także zaraz po przebudowie, przed klatką renderu (${duringVis})`);
        ok(same && ln(r, 'p_plain')?.visible === false, `O6b SEDNO: ON — puszczenie Shift w oknie jednej klatki po przebudowie: widoczność z filtra „Planetoidy” (zwykła planeta ukryta; zgodne z przed SHIFT: ${same})`);
      } else if (on && frame) {
        const pdVis = [...r._planetoidOrbits.values()].filter((l) => l.visible).length;
        ok(hiddenAll && same && homeVis && pdVis === r._planetoidOrbits.size && pdVis > 0 && ln(r, 'p_plain')?.visible === false,
          `O6d SEDNO: ON — przebudowa planet i planetoid w trakcie SHIFT + klatka renderu (jak w grze): po wyjściu widoczność z filtra — orbity planetoid wracają ${pdVis}/${r._planetoidOrbits.size}, dom wraca (zgodne z przed SHIFT: ${same})`);
      } else if (!on && !frame) {
        ok(hiddenAll && ln(r, 'p_plain')?.visible === true,
          'O6c KONTROLA: OFF — utajony wyścig sprzed H0: puszczenie Shift w oknie jednej klatki po przebudowie odsłania orbitę zwykłej planety mimo filtra');
      } else {
        const pdVis = [...r._planetoidOrbits.values()].filter((l) => l.visible).length;
        ok(hiddenAll && homeVis && ln(r, 'p_plain')?.visible === false && r._planetoidOrbits.size > 0 && pdVis === 0,
          `O6e KONTROLA: OFF — jak dziś w grze: przebudowa planetoid w trakcie SHIFT + klatka renderu → po wyjściu orbity planetoid UKRYTE ${pdVis}/${r._planetoidOrbits.size} (kopia widoczności z ukrytych linii; orbita domu wraca)`);
      }
    }
  }
  FLAGS.hudOrbits = true;
}

// ═══ O7 ══════════════════════════════════════════════════════════════════════
header('O7  najechanie');
{
  setWorld(); FLAGS.hudOrbits = true; SPLIT();
  const r = mkR({ filter: 'planetoids' });
  r['on:planet:hover']?.({ entityId: 'p_plain' });
  const h = st(ln(r, 'p_plain'));
  ok(h?.v === true && h?.c === tokInt(THEME.accent) && near(h?.o, 0.4), `O7a SEDNO: najechana planeta (filtr ją chowa) — widoczna, \`primary\` 0,4 (${hx(h?.c)} ${h?.o})`);
  r['on:planet:hover']?.({ entityId: 'pd2' });
  const pd = st(ln(r, 'pd2'));
  ok(pd?.v === true && pd?.c === tokInt(THEME.orbitLine) && near(pd?.o, 0.16) && ln(r, 'p_plain')?.visible === false,
    `O7b SEDNO: najechana planetoida — \`orbitLine\` 0,16; planeta wraca do stanu domyślnego (${hx(pd?.c)} ${pd?.o})`);
  r['on:planet:hover']?.({ entityId: null });
  ok(near(ln(r, 'pd2')?.material.opacity, 0.096) && ln(r, 'p_plain')?.visible === false, 'O7c SEDNO: zjazd kursora — stan domyślny (planetoida 0,096)');
}

// ═══ O8 ══════════════════════════════════════════════════════════════════════
header('O8  klucz synchronizacji i zasoby');
{
  const k = HOL?.hudOrbitSyncKey;
  ok(k?.({}, 3, 'p') === null && k?.({ hudOrbits: true }, 3, 'p') === '3|p' && k?.({ hudOrbits: true }, 4, 'p') !== k?.({ hudOrbits: true }, 3, 'p')
    && k?.({ hudOrbits: true }, 3, null) !== k?.({ hudOrbits: true }, 3, 'p'), 'O8a SEDNO: klucz — null przy OFF; zmienia się z epoką i domem');
  setWorld(); FLAGS.hudOrbits = true;
  const r = mkR({ filter: 'all' });
  const old = [...r._planetoidOrbits.values()];
  r._rebuildPlanetoidOrbits?.();
  ok(old.length === 2 && old.every((l) => l.geometry.disposed && l.material.disposed && !r.scene.objs.has(l)) && r._planetoidOrbits.size === 2,
    'O8b STRAŻNIK: przebudowa planetoid zwalnia geometrię i materiał starych linii, zdejmuje je ze sceny (przy ON jak dziś)');
  // Pamięć palety po WARTOŚCIACH tokenów: zmiana jednego tokenu (pole koloru w F7 — bez epoki) widoczna w następnym wywołaniu.
  applyPreset(PRESET_THEMES.ambient_1);
  const p1 = HOL?.orbitPalette?.();
  THEME.orbitLine = PRESET_THEMES.ambient_3.orbitLine;            // bezpośredni zapis — jak pole koloru w F7
  const p2 = HOL?.orbitPalette?.();
  ok(p1?.line === tokInt(PRESET_THEMES.ambient_1.orbitLine) && p2?.line === tokInt(PRESET_THEMES.ambient_3.orbitLine)
    && p2?.colony === p1?.colony,
    `O8c SEDNO: paleta orbit — zmiana pojedynczego tokenu widoczna w następnym wywołaniu (${hx(p1?.line)} → ${hx(p2?.line)}; kolonia bez zmian)`);
}

applyPreset(PRESET_THEMES.default);
FLAGS.hudOrbits = true;
console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
