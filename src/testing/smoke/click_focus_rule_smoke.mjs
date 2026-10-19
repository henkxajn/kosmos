// Keeper ARKUSZ UI, U1 — reguła klik/focus (D-UI-5; decyzja 2 a–d; UI_PLAN §4.2, §7.7–§7.9).
//
// Krok U1-1: czysta reguła (`ClickIntentLogic`) + domyślny widok układu (`ThreeRenderer.resetToSystemView`, klawisz
// Home, klik w BIEŻĄCY układ w Outlinerze i chipie mapy).
//   T0  moduł reguły istnieje i eksportuje API (import DYNAMICZNY — na kodzie sprzed U1 piny degradują, nie przerywają).
//   T1  tabela intencji: obiekt spoza zaznaczenia → `select`; bieżące zaznaczenie → `focus`; bieżące w INNYM układzie →
//       `switchSystem+focus` (§7.8); tranzyt (układ `null`) → `focus` bez przełączania; klaster = dokładnie ten zbiór;
//       statek przy N ≥ 2 → `select` (§7.7: lider przy N == 1).
//   T2  `readClickSelection` czyta ISTNIEJĄCY stan (zbiór statków, lider, karta ciała, otwarty StationPanel, ping wroga,
//       układ widoku z dwiema rezerwami).
//   T3  `applyClickIntent`: `select` nigdy nie wydaje polecenia kamery; `focus` nie zmienia zaznaczenia;
//       `switchSystem+focus` — najpierw przełączenie układu, potem kamera; odmowa przełączenia = nic; gwiazda — focus =
//       `resetToSystemView`.
//   T4  WYKONANIE `Outliner.hitTest` — nagłówek BIEŻĄCEGO układu → `resetToSystemView`; innego → przełączenie (kontrola).
//   T5  WYKONANIE `MapLabelLayer.handleClick` — aktywny chip układu → `resetToSystemView`; inny → przełączenie (kontrola).
//   T6  `ThreeRenderer.resetToSystemView` (renderer nie importuje się pod node): pin ŹRÓDŁOWY + WYKONANIE metody
//       wyciętej ze źródła na atrapie `this` — zeruje WSZYSTKIE pola kamery (472), potem kadr `frameSystem`; podgląd
//       obserwatorium i lot intro — bez resetu.
//   T7  pin ŹRÓDŁOWY `GameScene` (scena nie importuje się pod node): Home → `resetToSystemView` (471); stary
//       `resetToCenter` bez wołającego.
//   T8  NIEZMIENNIK (zielony po obu stronach): WYKONANIE `ThreeCameraController.prototype.frameSystem` na atrapie —
//       kadr układu z wymogu bramki U0: zasięg × 20 w [70; 450]; zapis Polonia gy79 (`sys_home`, 22,338 AU) → 446,76.
// Uruchom: node src/testing/smoke/click_focus_rule_smoke.mjs
import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
const header = (s) => console.log(`\n── ${s}`);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
const methodBody = (code, sig) => { const i = code.indexOf(sig); return i < 0 ? '' : code.slice(i, code.indexOf('\n  }\n', i) + 4); };
// Wykonanie kodu, którego moduł NIE importuje się pod node (ThreeRenderer, GameScene — THREE / postprocessing): tekst
// funkcji wycięty ze źródła (bez komentarzy) i oceniony z atrapą `this`; identyfikatory modułu (EventBus, importy) podane
// jawnie w `scope`. Brak funkcji w źródle (kod sprzed U1) → `null`, a pin pada zamiast przerywać suitę.
const compileWith = (text, scope, thisArg) => {
  if (!text) return null;
  try {
    const names = Object.keys(scope);
    const make = new Function(...names, '__src', 'return eval("(" + __src + ")");');
    return make.call(thisArg, ...names.map(n => scope[n]), text);
  } catch (e) { return null; }
};
// Metoda klasy `nazwa(args) { … }` → funkcja wołana z dowolnym `this`.
const compileMethod = (code, name, scope = {}) => {
  const b = methodBody(code, `  ${name}(`);
  return b ? compileWith('function ' + b.trim().slice(name.length), scope, null) : null;
};
// Słuchacz `EventBus.on('<zdarzenie>', safe(<funkcja strzałkowa>))` → funkcja strzałkowa z `this` = atrapa.
const listenerText = (code, ev) => {
  const sig = `EventBus.on('${ev}', safe(`;
  const i = code.indexOf(sig);
  if (i < 0) return '';
  const end = code.indexOf('\n    }));', i);
  return end < 0 ? '' : code.slice(i + sig.length, end + '\n    }'.length);
};
const compileListener = (code, ev, thisArg, scope = {}) => compileWith(listenerText(code, ev), scope, thisArg);
const TR_SRC = src('../../renderer/ThreeRenderer.js');

// ⚠ DYNAMICZNIE i w try/catch — moduł POWSTAJE w U1-1: statyczny import wywróciłby całą suitę na kodzie sprzed U1.
let CI = null;
try { CI = await import('../../ui/ClickIntentLogic.js'); } catch { /* piny padną */ }
const call = (fn, ...a) => { try { return fn ? fn(...a) : undefined; } catch (e) { return `WYJĄTEK: ${e.message}`; } };

// ═══ T0 ═════════════════════════════════════════════════════════════════════
header('T0  moduł reguły');
const API = ['CLICK_INTENT', 'clickTargetKey', 'selectionKeys', 'resolveClickIntent', 'readClickSelection',
  'applyClickIntent', 'clickObject', 'vesselTarget', 'enemyTarget', 'vesselsTarget', 'stationTarget', 'bodyTarget'];
ok(!!CI && API.every(k => k in CI), `T0 ClickIntentLogic eksportuje: ${API.join(', ')}`);
ok(CI?.CLICK_INTENT?.SELECT === 'select' && CI?.CLICK_INTENT?.FOCUS === 'focus'
  && CI?.CLICK_INTENT?.SWITCH_FOCUS === 'switchSystem+focus', 'T0b trzy intencje: select / focus / switchSystem+focus');

// ═══ T1 ═════════════════════════════════════════════════════════════════════
header('T1  tabela intencji (§7.7, §7.8)');
const SEL = (o = {}) => ({ vesselIds: [], leadId: null, entityId: null, stationId: null, fleetId: null,
  pingedEnemyId: null, activeSystemId: 'sys_home', ...o });
const V = (id, sys = 'sys_home') => ({ type: 'vessel', id, systemId: sys });
const ROWS = [
  ['statek, nic nie zaznaczone',                    V('v1'),                                  SEL(),                                             'select'],
  ['statek = lider przy N == 1',                    V('v1'),                                  SEL({ vesselIds: ['v1'], leadId: 'v1' }),          'focus'],
  ['statek w zbiorze N == 2 (lider) → select',      V('v1'),                                  SEL({ vesselIds: ['v1', 'v2'], leadId: 'v1' }),    'select'],
  ['inny statek niż lider',                         V('v2'),                                  SEL({ vesselIds: ['v1'], leadId: 'v1' }),          'select'],
  ['statek z INNEGO układu, zaznaczony',            V('v1', 'sys_A'),                         SEL({ vesselIds: ['v1'], leadId: 'v1' }),          'switchSystem+focus'],
  ['statek z innego układu, NIEzaznaczony',         V('v1', 'sys_A'),                         SEL(),                                             'select'],
  ['statek w tranzycie (null), zaznaczony',         V('v1', null),                            SEL({ vesselIds: ['v1'], leadId: 'v1' }),          'focus'],
  ['klaster = ten sam zbiór (inna kolejność)',      { type: 'vessels', ids: ['v1', 'v2'] },   SEL({ vesselIds: ['v2', 'v1'], leadId: 'v2' }),    'focus'],
  ['klaster ≠ zbiór (podzbiór)',                    { type: 'vessels', ids: ['v1', 'v2'] },   SEL({ vesselIds: ['v1'], leadId: 'v1' }),          'select'],
  ['plakietka jednego statku = lider',              { type: 'vessels', ids: ['v1'] },         SEL({ vesselIds: ['v1'], leadId: 'v1' }),          'focus'],
  ['ciało = zaznaczone (karta)',                    { type: 'body', id: 'e1' },               SEL({ entityId: 'e1' }),                           'focus'],
  ['ciało ≠ zaznaczone',                            { type: 'body', id: 'e2' },               SEL({ entityId: 'e1' }),                           'select'],
  ['ciało z innego układu = zaznaczone',            { type: 'body', id: 'e1', systemId: 'sys_B' }, SEL({ entityId: 'e1' }),                     'switchSystem+focus'],
  ['stacja = otwarta w StationPanel',               { type: 'station', id: 's1' },            SEL({ stationId: 's1' }),                          'focus'],
  ['stacja ≠ otwarta',                              { type: 'station', id: 's2' },            SEL({ stationId: 's1' }),                          'select'],
  ['wróg = ostatnio pingowany',                     { type: 'enemy', id: 'x1' },              SEL({ pingedEnemyId: 'x1' }),                      'focus'],
  ['wróg ≠ pingowany',                              { type: 'enemy', id: 'x2' },              SEL({ pingedEnemyId: 'x1' }),                      'select'],
  ['statek, gdy zaznaczone jest CIAŁO o tym id',    V('e1'),                                  SEL({ entityId: 'e1' }),                           'select'],
  ['ciało, gdy liderem jest statek o tym id',       { type: 'body', id: 'v1' },               SEL({ vesselIds: ['v1'], leadId: 'v1' }),          'select'],
  ['cel bez id',                                    { type: 'vessel' },                       SEL(),                                             null],
];
for (const [name, target, sel, want] of ROWS) {
  const got = call(CI?.resolveClickIntent, target, sel);
  ok(got === want, `T1 ${name} → ${want} (jest: ${JSON.stringify(got)})`);
}

// ═══ T2 ═════════════════════════════════════════════════════════════════════
header('T2  readClickSelection — istniejący stan');
{
  const K = {
    uiManager: { getSelectedVesselIds: () => ['v3'], getSelectedVesselId: () => 'v3', _selectedEntity: { id: 'e7' },
      getSelectedFleetId: () => 'f2' },
    stationPanel: { visible: true, _stationId: 's9', _float: { minimized: false } },
    threeRenderer: { _pingedEnemyId: 'x4' },
    activeSystemId: 'sys_C',
  };
  const s = call(CI?.readClickSelection, K) ?? {};
  ok(JSON.stringify(s.vesselIds) === '["v3"]' && s.leadId === 'v3', 'T2a statki: zbiór i lider z UIManagera');
  ok(s.entityId === 'e7', 'T2b ciało: `_selectedEntity` (karta ciała)');
  ok(s.stationId === 's9', 'T2c stacja: otwarty StationPanel');
  ok(s.pingedEnemyId === 'x4' && s.fleetId === 'f2' && s.activeSystemId === 'sys_C', 'T2d ping wroga, flota, układ widoku');
  const K2 = { ...K, stationPanel: { visible: true, _stationId: 's9', _float: { minimized: true } }, activeSystemId: undefined,
    starSystemManager: { activeSystemId: 'sys_D' } };
  const s2 = call(CI?.readClickSelection, K2) ?? {};
  ok(s2.stationId === null, 'T2e stacja ZMINIMALIZOWANA do doku nie jest bieżącym zaznaczeniem (klik ją przywraca)');
  ok(s2.activeSystemId === 'sys_D', 'T2f układ widoku: rezerwa `starSystemManager.activeSystemId` (nowa gra bez pola)');
  const s3 = call(CI?.readClickSelection, {}) ?? {};
  ok(s3.activeSystemId === 'sys_home' && Array.isArray(s3.vesselIds) && s3.vesselIds.length === 0,
    'T2g pusty KOSMOS → nic nie zaznaczone, układ `sys_home`');
}

// ═══ T3 ═════════════════════════════════════════════════════════════════════
header('T3  applyClickIntent — wykonanie');
function world({ switchOk = true } = {}) {
  const log = [];
  const K = {
    uiManager: {
      setSelectedVesselId: (id) => log.push(['select', id]),
      addToSelection:      (id) => log.push(['add', id]),
    },
    threeRenderer: {
      pingEnemyTarget:   (id) => log.push(['ping', id]),
      resetToSystemView: ()   => { log.push(['reset']); return true; },
    },
    starSystemManager: { switchActiveSystem: (sys) => { log.push(['switch', sys]); return switchOk; } },
  };
  const emit = (name, p) => log.push(['emit', name, p]);
  return { K, emit, log };
}
const camCmd = (log) => log.filter(e => (e[0] === 'emit' && (e[1] === 'vessel:focus' || e[1] === 'station:focus'
  || (e[1] === 'body:selected' && e[2]?.focus !== false))) || e[0] === 'reset');
const STAR = { id: 'star_1', type: 'star' };
const PLANET = { id: 'p1', type: 'planet' };
{
  const cases = [
    ['vessel',  { type: 'vessel', id: 'v1', systemId: 'sys_home' }],
    ['vessels', { type: 'vessels', ids: ['v1', 'v2'], systemId: 'sys_home' }],
    ['enemy',   { type: 'enemy', id: 'x1', systemId: 'sys_home' }],
    ['station', { type: 'station', id: 's1', systemId: 'sys_home' }],
    ['body',    { type: 'body', id: 'p1', entity: PLANET, systemId: 'sys_home' }],
    ['gwiazda', { type: 'body', id: 'star_1', entity: STAR, systemId: 'sys_home' }],
  ];
  for (const [name, tg] of cases) {
    const w = world();
    call(CI?.applyClickIntent, tg, 'select', w);
    ok(w.log.length > 0 && camCmd(w.log).length === 0, `T3a ${name}: select — zaznaczenie / okno, ZERO poleceń kamery (${JSON.stringify(w.log)})`);
  }
  let w = world(); call(CI?.applyClickIntent, cases[0][1], 'select', w);
  ok(JSON.stringify(w.log) === '[["select","v1"]]', 'T3b statek select → `setSelectedVesselId`');
  w = world(); call(CI?.applyClickIntent, cases[0][1], 'focus', w);
  ok(JSON.stringify(w.log) === '[["emit","vessel:focus",{"vesselId":"v1"}]]', 'T3c statek focus → `vessel:focus`, zaznaczenie bez zmian');
  w = world(); call(CI?.applyClickIntent, { ...cases[0][1], systemId: 'sys_A' }, 'switchSystem+focus', w);
  ok(JSON.stringify(w.log) === '[["switch","sys_A"],["emit","vessel:focus",{"vesselId":"v1"}]]',
    'T3d statek z innego układu: NAJPIERW przełączenie układu, potem kamera (§7.8, Finding 478)');
  w = world({ switchOk: false }); call(CI?.applyClickIntent, { ...cases[0][1], systemId: 'sys_X' }, 'switchSystem+focus', w);
  ok(JSON.stringify(w.log) === '[["switch","sys_X"]]', 'T3e odmowa przełączenia (nieznany układ) → nic więcej');
  w = world(); call(CI?.applyClickIntent, cases[1][1], 'select', w);
  ok(JSON.stringify(w.log) === '[["select","v1"],["add","v2"]]', 'T3f klaster select → lider + reszta zbioru');
  w = world(); call(CI?.applyClickIntent, cases[1][1], 'focus', w);
  ok(JSON.stringify(w.log) === '[["emit","vessel:focus",{"vesselId":"v1"}]]', 'T3g klaster focus → kamera na liderze');
  w = world(); call(CI?.applyClickIntent, cases[2][1], 'select', w);
  ok(JSON.stringify(w.log) === '[["ping","x1"]]', 'T3h wróg select → ping celu (decyzja 2d)');
  w = world(); call(CI?.applyClickIntent, cases[2][1], 'focus', w);
  ok(JSON.stringify(w.log) === '[["emit","vessel:focus",{"vesselId":"x1"}]]', 'T3i wróg focus → `vessel:focus`');
  w = world(); call(CI?.applyClickIntent, cases[3][1], 'select', w);
  ok(JSON.stringify(w.log) === '[["emit","station:selected",{"stationId":"s1"}]]', 'T3j stacja select → `station:selected` (panel)');
  w = world(); call(CI?.applyClickIntent, cases[3][1], 'focus', w);
  ok(JSON.stringify(w.log) === '[["emit","station:focus",{"stationId":"s1"}]]', 'T3k stacja focus → `station:focus`');
  w = world(); call(CI?.applyClickIntent, cases[4][1], 'select', w);
  ok(w.log.length === 1 && w.log[0][1] === 'body:selected' && w.log[0][2]?.entity === PLANET && w.log[0][2]?.focus === false,
    'T3l ciało select → `body:selected { focus: false }`');
  w = world(); call(CI?.applyClickIntent, cases[4][1], 'focus', w);
  ok(w.log.length === 1 && w.log[0][1] === 'body:selected' && w.log[0][2]?.focus === true, 'T3m ciało focus → `body:selected { focus: true }`');
  w = world(); call(CI?.applyClickIntent, cases[5][1], 'focus', w);
  ok(JSON.stringify(w.log) === '[["reset"]]', 'T3n gwiazda focus → `resetToSystemView` (kadr układu, nie wnętrze tarczy)');
  w = world(); call(CI?.applyClickIntent, { type: 'body', id: 'p9', systemId: 'sys_home' }, 'select', w);
  ok(!!CI?.applyClickIntent && w.log.length === 0, 'T3o ciało bez encji → nic (świadek: funkcja istnieje)');
  // clickObject = intencja z bieżącego stanu + wykonanie
  const w2 = world();
  w2.K.uiManager.getSelectedVesselIds = () => ['v1']; w2.K.uiManager.getSelectedVesselId = () => 'v1';
  call(CI?.clickObject, { type: 'vessel', id: 'v1', systemId: 'sys_home' }, w2);
  ok(JSON.stringify(w2.log) === '[["emit","vessel:focus",{"vesselId":"v1"}]]', 'T3p clickObject: zaznaczony lider → focus');
}

// ═══ wspólne dla T4–T5 ═══════════════════════════════════════════════════════
const rec = { reset: 0, switched: [] };
globalThis.KOSMOS.threeRenderer = { resetToSystemView: () => { rec.reset++; return true; } };
globalThis.KOSMOS.starSystemManager = { activeSystemId: 'sys_home', switchActiveSystem: (s) => { rec.switched.push(s); return true; } };
const W = 1280, H = 720;

// ═══ T4 ═════════════════════════════════════════════════════════════════════
header('T4  WYKONANIE Outliner.hitTest — nagłówek układu (§7.9)');
{
  const { Outliner } = await import('../../ui/Outliner.js');
  const o = new Outliner();
  const hit = (target) => { o._clickTargets = [{ ...target, x: W - 150, y: 100, w: 150, h: 16 }]; return o.hitTest(W - 140, 105, W, H); };
  rec.reset = 0; rec.switched = [];
  const r1 = hit({ type: 'system', systemId: 'sys_home' });
  ok(r1 === true && rec.reset === 1 && rec.switched.length === 0, 'T4a klik w BIEŻĄCY układ → `resetToSystemView` (dawniej no-op)');
  rec.reset = 0; rec.switched = [];
  hit({ type: 'system', systemId: 'sys_044' });
  ok(JSON.stringify(rec.switched) === '["sys_044"]' && rec.reset === 0, 'T4b KONTROLA: inny układ → przełączenie (kadr `frameSystem` w `initSystem`)');
}

// ═══ T5 ═════════════════════════════════════════════════════════════════════
header('T5  WYKONANIE MapLabelLayer.handleClick — chip układu (§7.9)');
{
  const { MapLabelLayer } = await import('../../ui/MapLabelLayer.js');
  const m = new MapLabelLayer();
  m._chipZones = [{ x: 10, y: 30, w: 80, h: 18, chip: { systemId: 'sys_home', isActive: true } },
                  { x: 10, y: 50, w: 80, h: 18, chip: { systemId: 'sys_008', isActive: false } }];
  rec.reset = 0; rec.switched = [];
  const r1 = m.handleClick(20, 35);
  ok(r1 === true && rec.reset === 1 && rec.switched.length === 0, 'T5a aktywny chip → `resetToSystemView` (dawniej świadomy no-op)');
  rec.reset = 0; rec.switched = [];
  m.handleClick(20, 55);
  ok(JSON.stringify(rec.switched) === '["sys_008"]' && rec.reset === 0, 'T5b KONTROLA: inny chip → przełączenie układu');
}

// ═══ T6 ═════════════════════════════════════════════════════════════════════
header('T6  źródło ThreeRenderer.resetToSystemView (Findingi 472, 473)');
{
  const tr = TR_SRC;
  const b = methodBody(tr, '  resetToSystemView() {');
  ok(b.length > 0, 'T6-0 KONTROLA: `resetToSystemView` znaleziona');
  const zero = [/this\._focusEntityId\s*=\s*null/, /this\._focusVesselId\s*=\s*null/, /this\._focusStationId\s*=\s*null/,
    /this\._autoFocus\s*=\s*null/, /this\._focusEncounterId\s*=\s*null/];
  ok(zero.every(r => r.test(b)), 'T6a zeruje WSZYSTKIE pola śledzenia kamery (ciało, statek, stacja, auto-fokus, punkt walki)');
  ok(/if \(this\._watch\) this\._endWatch\(\);/.test(b), 'T6b „Obserwuj” kończone przez `_endWatch` (oddaje minDist sprzed obserwacji)');
  const fr = b.indexOf('this._frameActiveSystem()');
  ok(fr > b.indexOf('this._focusStationId') && fr > b.indexOf('this._endWatch()'), 'T6c kadr `frameSystem` PO wyzerowaniu (pętla renderu nie cofnie resetu)');
  ok(/if \(this\._observatoryPreviewActive \|\| this\._cinematicDriver\) return false;/.test(b)
    && b.indexOf('return false;', b.indexOf('_observatoryPreviewActive')) < b.indexOf('this._focusEntityId'),
    'T6d podgląd obserwatorium i lot intro trzymają kamerę — reset przed nimi ustępuje');
  // WYKONANIE: metoda wycięta ze źródła, `this` = atrapa renderera z kamerą rejestrującą wywołania.
  const reset = compileMethod(TR_SRC, 'resetToSystemView');
  const mk = (over = {}) => {
    const calls = [];
    const f = { calls, _observatoryPreviewActive: false, _cinematicDriver: null,
      _watch: { encounterId: 'enc_1' }, _autoFocus: { encounterId: 'enc_2' }, _focusEncounterId: { x: 1, y: 2 },
      _focusEntityId: 'p1', _focusVesselId: 'v1', _focusStationId: 's1',
      _cameraController: { frameSystem: () => calls.push('frameSystem'), setMinDist: (d) => calls.push(['setMinDist', d]) },
      _endWatch() { calls.push('endWatch'); this._watch = null; },
      _frameActiveSystem() { calls.push('frame'); },
      ...over };
    return f;
  };
  const f1 = mk();
  const r1 = reset ? reset.call(f1) : undefined;
  ok(r1 === true && [f1._focusEntityId, f1._focusVesselId, f1._focusStationId, f1._autoFocus, f1._focusEncounterId, f1._watch].every(v => v === null),
    'T6f WYKONANIE: wszystkie pola kamery wyzerowane (ciało, statek, stacja, auto-fokus, punkt walki, „Obserwuj”)');
  ok(JSON.stringify(f1.calls) === '["endWatch",["setMinDist",0.3],"frame"]',
    `T6g WYKONANIE: kolejność — koniec „Obserwuj”, domyślny min zoom, kadr układu (jest: ${JSON.stringify(f1.calls)})`);
  const f2 = mk({ _observatoryPreviewActive: true });
  const r2 = reset ? reset.call(f2) : undefined;
  ok(r2 === false && f2.calls.length === 0 && f2._focusEntityId === 'p1', 'T6h WYKONANIE: podgląd obserwatorium — reset ustępuje (kamera dalej na ciele)');
  const f3 = mk({ _cinematicDriver: () => {} });
  const r3 = reset ? reset.call(f3) : undefined;
  ok(r3 === false && f3.calls.length === 0, 'T6i WYKONANIE: lot intro — reset ustępuje');
  const fa = methodBody(tr, '  _frameActiveSystem() {');
  ok(/frameSystem\(this\._computeSystemExtentAU\(\)\)/.test(fa), 'T6e KONTROLA (bez zmian w U1): `_frameActiveSystem` = `frameSystem(zasięg układu)`');
}

// ═══ T7 ═════════════════════════════════════════════════════════════════════
header('T7  źródło GameScene — klawisz Home (Finding 471)');
{
  const gs = src('../../scenes/GameScene.js');
  const sw = gs.slice(gs.indexOf("case 'Space':"), gs.indexOf("case 'KeyY':"));
  ok(sw.length > 0, "T7-0 KONTROLA: przełącznik klawiszy (`case 'Space'` … `case 'KeyY'`) znaleziony");
  ok(/case 'Home':/.test(sw) && /resetToSystemView\?\.\(\)/.test(sw), 'T7a Home → `resetToSystemView` (H zjada w trybie cywilizacji skrót Kolonii)');
  ok(!/resetToCenter\(/.test(gs), 'T7b `resetToCenter` bez wołającego w scenie (reset niepełny — 472)');
}

// ═══ T8 ═════════════════════════════════════════════════════════════════════
header('T8  WYKONANIE frameSystem — kadr układu (wymóg z bramki U0)');
{
  let TCC = null;
  try { ({ ThreeCameraController: TCC } = await import('../../renderer/ThreeCameraController.js')); } catch { /* */ }
  const vec = () => ({ x: 9, y: 9, z: 9, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
  const frame = (au) => { const f = { _goalTarget: vec(), _target: vec(), _theta: 2, _phi: 2 }; TCC.prototype.frameSystem.call(f, au); return f; };
  ok(!!TCC?.prototype?.frameSystem, 'T8-0 KONTROLA: `ThreeCameraController.frameSystem` dostępna');
  const p = TCC ? frame(22.338) : {};
  ok(Math.abs(p._dist - 446.76) < 0.01 && p._targetDist === p._dist && p._defaultDist === p._dist,
    `T8a NIEZMIENNIK: Polonia gy79 (22,338 AU) → kadr 446,76 j. (jest: ${p._dist?.toFixed?.(2)})`);
  ok(p._goalTarget?.x === 0 && p._goalTarget?.z === 0 && p._target?.x === 0 && p._theta === 0.3 && p._phi === 1.1,
    'T8b NIEZMIENNIK: cel = gwiazda (0, 0, 0), kąty domyślne');
  ok(TCC && frame(1)._dist === 70 && frame(40)._dist === 450, 'T8c NIEZMIENNIK: granice kadru 70 (mały układ) / 450 (duży)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
