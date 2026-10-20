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
//
// Krok U1-2: zaznaczenie ciała (`_selectedEntityId`) osobno od celu kamery (`_focusEntityId`); `body:selected { focus }`
// z `focus` domyślnie `true`; odznaczenie bez ruchu kamery (decyzja 2a, Finding 473).
//   T9  WYKONANIE słuchaczy `body:selected` / `body:deselected` wyciętych ze źródła na atrapie renderera:
//       `focus: false` → zaznaczenie bez polecenia kamery; brak `focus` → ciąg kamery jak przed U1 (kontrola);
//       odznaczenie → śledzenie zakończone, zero ruchu. Piny źródłowe: `_focusEntityId` czytane wyłącznie przez
//       `_updateCameraFocus`; siedem miejsc wizualizacji czyta `_selectedEntityId`; blokada podglądu obserwatorium
//       nietknięta (kontrola).
//
// Krok U1-3: producenci reguły — mapa 3D (`ThreeRenderer.handleClick`; jeden picker na gest, scena zaznacza z jego
// wyniku), dwuklik bez ColonyOverlay i bez `vessel:focus` (2b), plakietki i etykiety mapy, dzisiejszy Outliner (statek,
// kolonia bez zmiany aktywnej kolonii — §7.10, stacja; obiekt z innego układu — §7.8), karta ciała z doku, wróg (2d),
// Dok taktyczny (2c). „KONTROLA” = zachowanie, które U1 zostawia (zielone po obu stronach).
//   T10 WYKONANIE `Outliner.hitTest` · T11 `MapLabelLayer.handleClick` · T12 `TacticalDock._onHit` · T13 `BottomContext`
//   T14 `ThreeRenderer.handleClick` i T15 `GameScene._handleTacticalLeftClick` (wycięte ze źródła, atrapa `this`) ·
//   T16 dwuklik (wycięty słuchacz) · T17 fokus statku bez sprite'a po przełączeniu układu · T18 pamięć pingu wroga ·
//   T19 picker kliku tylko widocznych sprite'ów.
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
  // ARKUSZ UI U3-2 — przecelowanie: prawy outliner to kolumna nad mapą (`OutlinerColumn`), klik działa tylko, gdy kolumna
  // jest widoczna (tryb cywilizacji — decyzja 4); dawniej szuflada odpowiadała zawsze. Asercje bez zmian.
  const civ0 = globalThis.KOSMOS.civMode; globalThis.KOSMOS.civMode = true;
  const hit = (target) => { o._clickTargets = [{ ...target, x: W - 150, y: 100, w: 150, h: 16 }]; return o.hitTest(W - 140, 105, W, H); };
  rec.reset = 0; rec.switched = [];
  const r1 = hit({ type: 'system', systemId: 'sys_home' });
  ok(r1 === true && rec.reset === 1 && rec.switched.length === 0, 'T4a klik w BIEŻĄCY układ → `resetToSystemView` (dawniej no-op)');
  rec.reset = 0; rec.switched = [];
  hit({ type: 'system', systemId: 'sys_044' });
  ok(JSON.stringify(rec.switched) === '["sys_044"]' && rec.reset === 0, 'T4b KONTROLA: inny układ → przełączenie (kadr `frameSystem` w `initSystem`)');
  globalThis.KOSMOS.civMode = civ0;
}

// ═══ T5 ═════════════════════════════════════════════════════════════════════
// ARKUSZ UI U3-3 — przecelowanie: chipy układów usunięte (wyłączone w U2-3, §7.18; ich rolę ma lewy outliner, a regułę
// §7.9 dla bieżącego układu pinują T4 i `left_outliner` L3). Pin: klik w dawny rząd chipów nie przełącza i nie jest
// pochłaniany przez warstwę etykiet; w źródle nie ma kodu chipów.
header('T5  MapLabelLayer — bez chipów układów (U3-3; §7.18)');
{
  const { MapLabelLayer } = await import('../../ui/MapLabelLayer.js');
  const m = new MapLabelLayer();
  rec.reset = 0; rec.switched = [];
  const r1 = m.handleClick(20, 35);
  ok(r1 === false && rec.reset === 0 && rec.switched.length === 0 && !('_chipZones' in m),
    'T5a klik w dawny rząd chipów — niepochłonięty, bez przełączenia i bez resetu (warstwa bez stref chipów)');
  const ml = src('../../ui/MapLabelLayer.js');
  ok(ml.length > 1000 && !/_drawSystemChips|_chipZones|buildSystemChips|layoutSystemChips/.test(ml), 'T5b źródło: bez rysowania, stref i kliku chipów');
  ok(/handleClick\(x, y\) \{/.test(ml), 'T5c KONTROLA: metoda kliku warstwy etykiet istnieje (plakietki, stacje — T11)');
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

// ═══ T9 ═════════════════════════════════════════════════════════════════════
header('T9  U1-2: zaznaczenie ciała ≠ cel kamery (słuchacze ThreeRenderer wycięte ze źródła, WYKONANIE na atrapie)');
{
  // Atrapa renderera: kamera rejestruje KAŻDE wywołanie (ruch celu, dystansu, kadru i progu zoomu).
  const CAM = ['focusOn', 'focusOnInstant', 'focusOnSmooth', 'setMinDist', 'setTargetDist', 'snapDist', 'flyTo', 'frameSystem',
    'resetToCenter', 'updateCameraFocus'];
  const mkR = (over = {}) => {
    const calls = [];
    const cam = { _targetDist: 50 };
    for (const m of CAM) cam[m] = (...a) => calls.push([m, ...a]);
    return { calls, _cameraController: cam,
      _selectedEntityId: 'old', _focusEntityId: 'camBody', _focusVesselId: 'v9', _focusStationId: 's9',
      _starGroup: { position: { x: 0, z: 0 } },
      _updateCameraFocus() { calls.push(['updateCameraFocus']); },
      _getEntityRadius: () => 0.25,
      _colonyMarkers: { show: () => calls.push(['markers.show']), hide: () => calls.push(['markers.hide']) },
      _hideColonyTooltip() {}, _planets: new Map([['p1', { group: {} }]]),
      _showPlanetoidOrbit() {}, _hideAllMoonOrbits() {}, _showMoonOrbit() {}, _hideAllPlanetoidOrbits() {},
      _rebuildAllOrbits() { calls.push(['rebuildOrbits']); }, ...over };
  };
  globalThis.KOSMOS.colonyManager = { hasColony: (id) => id === 'p1', getColony: () => ({ grid: {} }) };
  const camCalls = (r) => r.calls.filter(c => CAM.includes(c[0]));
  const P1 = { id: 'p1', type: 'planet' };

  // pierwszy klik reguły D-UI-5: `focus: false`
  const r1 = mkR();
  const sel = compileListener(TR_SRC, 'body:selected', r1);
  sel?.({ entity: P1, focus: false });
  ok(r1._selectedEntityId === 'p1', 'T9a `body:selected { focus: false }` — zaznaczenie ciała ustawione (`_selectedEntityId`)');
  ok(!!sel && camCalls(r1).length === 0 && r1._focusEntityId === 'camBody' && r1._focusVesselId === 'v9' && r1._focusStationId === 's9',
    'T9b … ZERO poleceń kamery, pola śledzenia nietknięte (jest: ' + JSON.stringify(camCalls(r1)) + ')');
  ok(r1.calls.some(c => c[0] === 'markers.show') && r1.calls.some(c => c[0] === 'rebuildOrbits'),
    'T9c KONTROLA: … wizualizacja zaznaczenia (znaczniki kolonii, złota orbita) — jak przed U1');
  // emitent spoza reguły: brak pola `focus` = true (zachowanie sprzed U1)
  const r2 = mkR();
  const sel2 = compileListener(TR_SRC, 'body:selected', r2);
  sel2?.({ entity: P1 });
  ok(r2._focusEntityId === 'p1' && r2._focusVesselId === null && r2._focusStationId === null,
    'T9d KONTROLA: `body:selected` bez `focus` (Dziennik, Obserwatorium, Dowództwo, starty) — kamera śledzi ciało jak dotąd');
  ok(r2._selectedEntityId === 'p1', 'T9d2 … i zaznacza je (`_selectedEntityId`)');
  ok(JSON.stringify(camCalls(r2)) === '[["setMinDist",0.3],["updateCameraFocus"],["setTargetDist",1.5]]',
    'T9e KONTROLA: … ten sam ciąg poleceń kamery co przed U1 (jest: ' + JSON.stringify(camCalls(r2)) + ')');
  // odznaczenie (klik w pustkę, ✕ karty ciała)
  const r3 = mkR({ _selectedEntityId: 'p1', _focusEntityId: 'p1', _focusVesselId: 'v1', _focusStationId: 's1' });
  const des = compileListener(TR_SRC, 'body:deselected', r3);
  des?.();
  ok(!!des && [r3._selectedEntityId, r3._focusEntityId, r3._focusVesselId, r3._focusStationId].every(v => v === null),
    'T9f `body:deselected` — zaznaczenie zdjęte, śledzenie obiektu zakończone (kamera stoi w miejscu)');
  ok(!!des && camCalls(r3).length > 0 && camCalls(r3).every(c => c[0] === 'setMinDist'),
    'T9g `body:deselected` — ZERO ruchu kamery, tylko próg zoomu (473; był `focusOn(gwiazda)`) — jest: ' + JSON.stringify(camCalls(r3)));

  // pin ŹRÓDŁOWY: `_focusEntityId` czytane WYŁĄCZNIE przez `_updateCameraFocus` (pole kamery; blokada obserwatorium)
  const tr = TR_SRC;
  const ucfStart = tr.indexOf('  _updateCameraFocus() {');
  const ucfEnd = ucfStart + methodBody(tr, '  _updateCameraFocus() {').length;
  const reads = [...tr.matchAll(/this\._focusEntityId(?!\s*=[^=])/g)].map(m => m.index);
  const outside = reads.filter(i => !(i > ucfStart && i < ucfEnd));
  ok(ucfStart > 0 && reads.length > 0 && outside.length === 0,
    'T9h odczyty `_focusEntityId` wyłącznie w `_updateCameraFocus` (poza nim: ' + outside.length + ')');
  const veil = methodBody(tr, '  _syncBodyScanVeil() {');
  const SITES = [
    ['znaczniki kolonii (odświeżenie)', /!this\._colonyMarkers\.entityId \|\| !this\._selectedEntityId/.test(tr)],
    ['hover: orbita planetoidy',         /if \(id !== this\._selectedEntityId\) \{/.test(listenerText(tr, 'planet:hover'))],
    ['hover: orbita planety',            /if \(id === this\._selectedEntityId\) return;/.test(listenerText(tr, 'planet:hover'))],
    ['filtr orbit',                      /this\._selectedEntityId/.test(methodBody(tr, '  _applyOrbitFilter() {'))],
    ['złota orbita',                     /const isFocused = planet\.id === this\._selectedEntityId;/.test(tr)],
    ['tooltip znaczników kolonii',       /const focusId = this\._selectedEntityId;/.test(tr)],
    ['zasłona podglądu obserwatorium',   (veil.match(/this\._selectedEntityId/g) ?? []).length === 3],
  ];
  for (const [name, hit] of SITES) ok(hit, 'T9i wizualizacja zaznaczenia czyta `_selectedEntityId`: ' + name);
  ok(/this\._focusEntityId = null;\s*this\._selectedEntityId = null;/.test(methodBody(tr, '  _disposeAllMeshes() {')),
    'T9j przebudowa sceny (zmiana układu) zdejmuje też zaznaczenie');
  const ucf = methodBody(tr, '  _updateCameraFocus() {');
  ok(/if \(this\._observatoryPreviewActive\) this\._cameraController\.focusOnInstant\(x, z, y\);/.test(ucf)
    && /if \(this\._observatoryPreviewActive\) this\._updateCameraFocus\(\);/.test(tr),
    'T9k KONTROLA (bez zmian w U1): podgląd obserwatorium — twarda blokada kamery na `_focusEntityId` co klatkę');
}

// ═══ wspólne dla T10–T19 (U1-3) ══════════════════════════════════════════════
// Stan gry w kształcie, z którego reguła czyta zaznaczenie (UIManager, StationPanel, ping wroga) + rejestr zdarzeń.
const EventBus = (await import('../../core/EventBus.js')).default;
const { isEnemyVessel } = await import('../../entities/Vessel.js');
const { GAME_CONFIG } = await import('../../config/GameConfig.js');
const { worldToGameplay } = await import('../../utils/CoordTransform.js');
const evs = [];
for (const ev of ['vessel:focus', 'station:focus', 'station:selected', 'body:selected', 'body:deselected',
  'camera:focusTarget', 'colony:switched', 'planet:colonize']) EventBus.on(ev, (p) => evs.push([ev, p]));
const VESSELS = {
  v1: { id: 'v1', systemId: 'sys_home' }, v2: { id: 'v2', systemId: 'sys_home' }, v3: { id: 'v3', systemId: 'sys_home' },
  vA: { id: 'vA', systemId: 'sys_A' },    vT: { id: 'vT', systemId: null },
  x1: { id: 'x1', systemId: 'sys_home', ownerEmpireId: 'emp_001' },
};
const P1 = { id: 'p1', type: 'planet', systemId: 'sys_home' };
const PB = { id: 'pB', type: 'planet', systemId: 'sys_B' };
const STAR_H = { id: 'star_h', type: 'star', systemId: 'sys_home' };
const ops = [];
let selSet = [];
const UM = {
  _selectedEntity: null,
  getSelectedVesselIds: () => [...selSet], getSelectedVesselId: () => selSet[0] ?? null, getSelectedFleetId: () => null,
  setSelectedVesselId(id) { ops.push(['select', id]); selSet = id == null ? [] : [id]; },
  addToSelection(id) { ops.push(['add', id]); if (!selSet.includes(id)) selSet.push(id); },
  toggleSelection(id) { ops.push(['toggle', id]); },
  clearSelection() { ops.push(['clear']); selSet = []; },
  isPickerActive: () => false, overlayManager: { isAnyOpen: () => false, openPanel: (id) => ops.push(['openPanel', id]) },
  isOverUI: () => false,
};
const TRS = {   // stub renderera dla producentów spoza renderera (Outliner, MapLabelLayer, Dok)
  _pingedEnemyId: null,
  pingEnemyTarget(id) { ops.push(['pingEnemy', id]); this._pingedEnemyId = id; },
  pingVessel(id) { ops.push(['ping', id]); },
  resetToSystemView() { ops.push(['reset']); return true; },
};
const SP = { visible: false, _stationId: null, _float: { minimized: false } };
Object.assign(globalThis.KOSMOS, {
  uiManager: UM, threeRenderer: TRS, stationPanel: SP, activeSystemId: 'sys_home',
  vesselManager: { getVessel: (id) => VESSELS[id] ?? null },
  starSystemManager: { activeSystemId: 'sys_home', switchActiveSystem(s) { ops.push(['switch', s]); return true; } },
  colonyManager: { getColony: (id) => ({ planetId: id, planet: id === 'pB' ? PB : P1, systemId: id === 'pB' ? 'sys_B' : 'sys_home', name: 'K' }),
    switchActiveColony: (id) => ops.push(['switchActiveColony', id]), hasColony: () => true },
  overlayManager: { openPanel: (id) => ops.push(['openPanel', id]) },
});
const EM = (await import('../../core/EntityManager.js')).default;
const reset = (o = {}) => {
  evs.length = 0; ops.length = 0; selSet = o.sel ?? [];
  UM._selectedEntity = o.entity ?? null; TRS._pingedEnemyId = o.pinged ?? null;
  SP.visible = !!o.station; SP._stationId = o.station ?? null;
};
const evNames = () => evs.map(e => e[0]);
const cam = () => evs.filter(e => e[0] === 'vessel:focus' || e[0] === 'station:focus' || (e[0] === 'body:selected' && e[1]?.focus !== false))
  .concat(ops.filter(o => o[0] === 'reset').map(o => ['reset']));

// ═══ T10 ════════════════════════════════════════════════════════════════════
header('T10 WYKONANIE Outliner.hitTest — wiersz statku, kolonii, stacji (§7.8, §7.10)');
{
  const { Outliner } = await import('../../ui/Outliner.js');
  const o = new Outliner();
  // ARKUSZ UI U3-2 — przecelowanie jak w T4: kolumna widoczna tylko w trybie cywilizacji (decyzja 4). Asercje bez zmian.
  const civ0 = globalThis.KOSMOS.civMode; globalThis.KOSMOS.civMode = true;
  const hit = (target, x = W - 140) => { o._clickTargets = [{ ...target, x: W - 150, y: 100, w: 150, h: 18 }]; return o.hitTest(x, 105, W, H); };
  o._lastMouseMods = { ctrl: false };
  reset(); hit({ type: 'vessel', vesselId: 'v1' });
  ok(JSON.stringify(ops) === '[["select","v1"]]' && cam().length === 0, 'T10a statek, 1. klik → zaznaczenie + okno, kamera stoi (dawniej `vessel:focus` od razu)');
  reset({ sel: ['v1'] }); hit({ type: 'vessel', vesselId: 'v1' });
  ok(JSON.stringify(evs) === '[["vessel:focus",{"vesselId":"v1"}]]' && ops.length === 0, 'T10b statek zaznaczony, 2. klik → `vessel:focus`, zaznaczenie bez zmian');
  reset(); hit({ type: 'vessel', vesselId: 'vA' });
  ok(JSON.stringify(ops) === '[["select","vA"]]' && cam().length === 0, 'T10c statek z INNEGO układu, 1. klik → zaznaczenie BEZ przełączania układu (§7.8)');
  reset({ sel: ['vA'] }); hit({ type: 'vessel', vesselId: 'vA' });
  ok(JSON.stringify(ops) === '[["switch","sys_A"]]' && JSON.stringify(evs) === '[["vessel:focus",{"vesselId":"vA"}]]',
    'T10d … 2. klik → przełączenie układu, potem `vessel:focus` (Finding 478)');
  reset({ sel: ['vT'] }); hit({ type: 'vessel', vesselId: 'vT' });
  ok(ops.length === 0 && JSON.stringify(evs) === '[["vessel:focus",{"vesselId":"vT"}]]', 'T10e statek w tranzycie warp, 2. klik → focus bez przełączania (układ nieznany)');
  o._lastMouseMods = { ctrl: true }; reset(); hit({ type: 'vessel', vesselId: 'v2' });
  ok(JSON.stringify(ops) === '[["toggle","v2"]]' && evs.length === 0, 'T10f KONTROLA: CTRL+klik → przełączenie zbioru, bez kamery');
  o._lastMouseMods = { ctrl: false };
  globalThis.KOSMOS.civMode = civ0;
}
// ARKUSZ UI U3-3 — przecelowanie T10g–o: wiersze kolonii i stacji przeszły z prawego outlinera do LEWEGO (decyzja 3) —
// ta sama reguła i te same oczekiwania; ikona 🗺 prawego → 🪖N lewego (jedyne wejście „mapa ciała” z outlinera).
{
  const { LeftOutliner } = await import('../../ui/LeftOutliner.js');
  const lo = new LeftOutliner();
  const civ0 = globalThis.KOSMOS.civMode; globalThis.KOSMOS.civMode = true;
  if (!EM.get('p1')) EM.add(P1);
  if (!EM.get('pB')) EM.add(PB);
  const hitL = (target, x = 60) => { lo._clickTargets = [{ ...target, x: 0, y: 100, w: 150, h: 18 }]; return lo.hitTest(x, 105, W, H); };
  const col = (id) => ({ type: 'body', bodyId: id, systemId: id === 'pB' ? 'sys_B' : 'sys_home', recognized: true, name: 'K', colony: 'colony' });
  reset(); hitL(col('p1'));
  ok(evs.length === 1 && evs[0][0] === 'body:selected' && evs[0][1]?.entity?.id === 'p1' && evs[0][1]?.focus === false,
    'T10g kolonia (wiersz ciała w lewym), 1. klik → `body:selected { focus: false }` (karta ciała, kamera stoi)');
  ok(!ops.some(x => x[0] === 'switchActiveColony') && !evNames().includes('colony:switched') && !evNames().includes('camera:focusTarget'),
    'T10h … aktywna kolonia NIE zmienia się (§7.10; dawniej `switchActiveColony` + `colony:switched` + `camera:focusTarget`)');
  reset({ entity: P1 }); hitL(col('p1'));
  ok(evs.length === 1 && evs[0][0] === 'body:selected' && evs[0][1]?.focus === true, 'T10i kolonia zaznaczona, 2. klik → `body:selected { focus: true }`');
  reset(); hitL(col('pB'));
  ok(!ops.some(x => x[0] === 'switch') && evs[0]?.[1]?.focus === false, 'T10j kolonia w INNYM układzie, 1. klik → bez przełączania układu');
  reset({ entity: PB }); hitL(col('pB'));
  ok(JSON.stringify(ops) === '[["switch","sys_B"]]' && evs.length === 1 && evs[0][1]?.entity?.id === 'pB' && evs[0][1]?.focus === true,
    'T10k … 2. klik → przełączenie układu, potem kamera');
  reset(); hitL({ type: 'ground', bodyId: 'p1', systemId: 'sys_home', count: 1 });
  ok(JSON.stringify(ops) === '[["switchActiveColony","p1"],["openPanel","colony"]]', 'T10l KONTROLA: 🪖N (dawniej ikona 🗺 prawego) → mapa kolonii (aktywna kolonia się zmienia — jak dotąd)');
  reset(); hitL({ type: 'station', stationId: 's1', systemId: 'sys_home' });
  ok(JSON.stringify(evs) === '[["station:selected",{"stationId":"s1"}]]', 'T10m stacja, 1. klik → panel stacji, kamera stoi (dawniej panel + `station:focus`)');
  reset({ station: 's1' }); hitL({ type: 'station', stationId: 's1', systemId: 'sys_home' });
  ok(JSON.stringify(evs) === '[["station:focus",{"stationId":"s1"}]]', 'T10n stacja w otwartym panelu, 2. klik → `station:focus`');
  reset({ station: 's2' }); hitL({ type: 'station', stationId: 's2', systemId: 'sys_C' });
  ok(JSON.stringify(ops) === '[["switch","sys_C"]]' && JSON.stringify(evs) === '[["station:focus",{"stationId":"s2"}]]',
    'T10o stacja z INNEGO układu, 2. klik → przełączenie, potem kamera');
  globalThis.KOSMOS.civMode = civ0;
}

// ═══ T11 ════════════════════════════════════════════════════════════════════
header('T11 WYKONANIE MapLabelLayer.handleClick — plakietka własna / wroga, etykieta stacji (decyzja 2d)');
{
  const { MapLabelLayer } = await import('../../ui/MapLabelLayer.js');
  const m = new MapLabelLayer();
  m._vesselHitZones = [{ x: 100, y: 100, w: 60, h: 14, vesselIds: ['v1', 'v2'], isEnemy: false },
                       { x: 100, y: 200, w: 60, h: 14, vesselIds: ['x1'], isEnemy: true }];
  m._chipZones = [];
  m._hitZones = [{ x: 100, y: 300, w: 60, h: 14, stationId: 's1' }];
  reset(); m.handleClick(110, 105);
  ok(JSON.stringify(ops) === '[["select","v1"],["add","v2"]]' && cam().length === 0, 'T11a KONTROLA (jak przed U1): plakietka własna (klaster), 1. klik → zaznaczenie zbioru, kamera stoi');
  reset({ sel: ['v1', 'v2'] }); m.handleClick(110, 105);
  ok(JSON.stringify(evs) === '[["vessel:focus",{"vesselId":"v1"}]]' && ops.length === 0, 'T11b … 2. klik w ten sam zbiór → kamera na liderze (dawniej drugiego kliku brak)');
  reset(); m.handleClick(110, 205);
  ok(JSON.stringify(ops) === '[["pingEnemy","x1"]]' && cam().length === 0, 'T11c plakietka wroga, 1. klik → ping celu, kamera stoi (dawniej `vessel:focus` od razu)');
  reset({ pinged: 'x1' }); m.handleClick(110, 205);
  ok(JSON.stringify(evs) === '[["vessel:focus",{"vesselId":"x1"}]]' && ops.length === 0, 'T11d KONTROLA (zgodne z dawnym „zawsze kamera”): 2. klik (ten sam wróg) → `vessel:focus`');
  reset(); m.handleClick(110, 305);
  ok(JSON.stringify(evs) === '[["station:selected",{"stationId":"s1"}]]', 'T11e etykieta stacji, 1. klik → panel, kamera stoi');
  reset({ station: 's1' }); m.handleClick(110, 305);
  ok(JSON.stringify(evs) === '[["station:focus",{"stationId":"s1"}]]', 'T11f … 2. klik → `station:focus`');
}

// ═══ T12 ════════════════════════════════════════════════════════════════════
header('T12 WYKONANIE TacticalDock._onHit — „drugi klik” zamiast dwukliku 300 ms (decyzja 2c)');
{
  const { TacticalDock } = await import('../../ui/TacticalDock.js');
  const dock = Object.create(TacticalDock.prototype);
  dock._markDirty = () => {};
  dock._lastMouseMods = { ctrl: false };
  reset(); dock._onHit({ type: 'row', data: { id: 'v1' } });
  ok(JSON.stringify(ops) === '[["select","v1"],["ping","v1"]]' && cam().length === 0, 'T12a KONTROLA (jak przed U1): 1. klik → zaznaczenie + ping FX, kamera stoi');
  const realNow = performance.now.bind(performance); const t0 = realNow(); performance.now = () => t0 + 5000;
  ops.length = 0; evs.length = 0; dock._onHit({ type: 'row', data: { id: 'v1' } });
  performance.now = realNow;
  ok(JSON.stringify(evs) === '[["vessel:focus",{"vesselId":"v1"}]]' && ops.length === 0, 'T12b 2. klik w zaznaczony statek po 5 s → `vessel:focus` (bez okna czasu)');
  reset({ sel: ['v2'] }); dock._onHit({ type: 'row', data: { id: 'v1' } });
  ok(JSON.stringify(ops) === '[["select","v1"],["ping","v1"]]' && cam().length === 0, 'T12c KONTROLA (jak przed U1): klik w INNY statek niż zaznaczony → zaznaczenie (nie kamera)');
  dock._lastMouseMods = { ctrl: true }; reset(); dock._onHit({ type: 'row', data: { id: 'v2' } });
  ok(JSON.stringify(ops) === '[["toggle","v2"]]' && evs.length === 0, 'T12d KONTROLA: CTRL+klik → przełączenie zbioru');
  const td = src('../../ui/TacticalDock.js');
  ok(!/DOCK_DBLCLICK_MS|_lastRowClick/.test(td), 'T12e źródło: okno dwukliku i jego pola zdjęte');
}

// ═══ T13 ════════════════════════════════════════════════════════════════════
header('T13 WYKONANIE BottomContext — przywrócenie karty z doku bez kamery');
{
  const { BottomContext } = await import('../../ui/BottomContext.js');
  const reg = new Map();
  globalThis.KOSMOS.panelDock = { register: (k, o) => reg.set(k, o), unregister: (k) => reg.delete(k), has: (k) => reg.has(k) };
  const bc = new BottomContext();
  bc._minimize(P1);
  reset(); reg.get('body:p1')?.onRestore?.();
  const sel = evs.find(e => e[0] === 'body:selected');
  ok(!!sel && sel[1]?.entity === P1 && sel[1]?.focus === false, 'T13a przywrócenie karty → `body:selected { focus: false }` (karta wraca, kamera stoi)');
  ok(bc._minimized === false && !reg.has('body:p1'), 'T13b KONTROLA: karta zdjęta z doku i rozwinięta (s34b)');
}

// ═══ T14 ════════════════════════════════════════════════════════════════════
header('T14 WYKONANIE ThreeRenderer.handleClick (wycięte ze źródła) — mapa 3D, jeden picker na gest');
{
  const hc = compileMethod(TR_SRC, 'handleClick', {
    EventBus, isEnemyVessel, CLICK_INTENT: CI?.CLICK_INTENT, clickObject: CI?.clickObject,
    resolveClickIntent: CI?.resolveClickIntent, readClickSelection: CI?.readClickSelection, applyClickIntent: CI?.applyClickIntent,
  });
  const R = { _pickVesselForClick: () => null, _mouse: {}, camera: {}, _stations: new Map(), _clickable: [], _entityByUUID: new Map(),
    _ray: { hitsStation: [], hitsBody: [], setFromCamera() {}, intersectObjects(objs, rec) { return rec ? this.hitsStation : this.hitsBody; } },
    get _pingedEnemyId() { return TRS._pingedEnemyId; },
    pingEnemyTarget: (id) => TRS.pingEnemyTarget(id), resetToSystemView: () => TRS.resetToSystemView() };
  globalThis.KOSMOS.threeRenderer = R;
  const run = (o = {}, mods = {}) => {
    reset(o);
    R._pickVesselForClick = () => o.pick ?? null;
    R._stations = new Map(o.stationHit ? [['s1', { mesh: {} }]] : []);
    R._ray.hitsStation = o.stationHit ? [{ object: { userData: { stationId: 's1' } } }] : [];
    R._ray.hitsBody = o.body ? [{ object: { uuid: 'u1' } }] : [];
    R._entityByUUID = new Map(o.body ? [['u1', o.body]] : []);
    return hc ? hc.call(R, 640, 360, mods) : undefined;
  };
  ok(!!hc, 'T14-0 KONTROLA: `handleClick` wycięte i skompilowane');
  let r = run({ pick: 'v1' });
  ok(r === true && cam().length === 0 && R.lastClickPick?.vesselId === 'v1', 'T14a własny statek, 1. klik → BEZ kamery; wynik pickera dla sceny (`lastClickPick`)');
  r = run({ pick: 'v1', sel: ['v1'] });
  ok(JSON.stringify(evs) === '[["vessel:focus",{"vesselId":"v1"}]]', 'T14b KONTROLA (zgodne z dawnym „zawsze kamera”): własny statek zaznaczony, 2. klik → `vessel:focus`');
  r = run({ pick: 'v1', sel: ['v1'] }, { ctrl: true });
  ok(evs.length === 0, 'T14c CTRL+klik zaznaczonego statku → bez kamery (zbiór przełącza scena)');
  r = run({ pick: 'x1' });
  ok(JSON.stringify(ops) === '[["pingEnemy","x1"]]' && evs.length === 0, 'T14d wróg, 1. klik → ping celu, kamera stoi (decyzja 2d)');
  r = run({ pick: 'x1', pinged: 'x1' });
  ok(JSON.stringify(evs) === '[["vessel:focus",{"vesselId":"x1"}]]', 'T14e KONTROLA (zgodne z dawnym „zawsze kamera”): wróg pingowany, 2. klik → `vessel:focus`');
  r = run({ stationHit: true });
  ok(r === true && JSON.stringify(evs) === '[["station:selected",{"stationId":"s1"}]]', 'T14f stacja, 1. klik → panel, kamera stoi');
  r = run({ stationHit: true, station: 's1' });
  ok(JSON.stringify(evs) === '[["station:focus",{"stationId":"s1"}]]', 'T14g stacja w otwartym panelu, 2. klik → `station:focus`');
  r = run({ body: P1 });
  ok(r === true && evs.length === 1 && evs[0][1]?.entity === P1 && evs[0][1]?.focus === false, 'T14h ciało, 1. klik → `body:selected { focus: false }`');
  r = run({ body: P1, entity: P1 });
  ok(evs.length === 1 && evs[0][1]?.focus === true, 'T14i ciało zaznaczone, 2. klik → `body:selected { focus: true }`');
  r = run({ body: STAR_H, entity: STAR_H });
  ok(JSON.stringify(ops) === '[["reset"]]' && evs.length === 0, 'T14j gwiazda zaznaczona, 2. klik → `resetToSystemView` (kadr układu, nie wnętrze tarczy)');
  r = run({});
  ok(r === false && JSON.stringify(evNames()) === '["body:deselected"]' && R.lastClickPick?.vesselId === null, 'T14k pustka → `body:deselected`, pick pusty');
  globalThis.KOSMOS.threeRenderer = TRS;
}

// ═══ T15 ════════════════════════════════════════════════════════════════════
header('T15 WYKONANIE GameScene._handleTacticalLeftClick (wycięte) — zaznaczenie z pickera renderera, CTRL');
{
  const GS_SRC = src('../../scenes/GameScene.js');
  const scope = { GAME_CONFIG, isEnemyVessel, worldToGameplay };
  const tl = compileMethod(GS_SRC, '_handleTacticalLeftClick', scope);
  const sp = compileMethod(GS_SRC, '_selectFromClickPick', scope);
  let rayTarget = { type: 'empty', worldPoint: { x: 0, z: 0 } };
  // Dawny picker sceny w gałęzi canvas (`tr?._getVesselAtScreen?.(x, y, 40)` — najbliższy statek, bez preferencji
  // najechanego); w kodzie U1 nieczytany. Atrapa pozwala wykonać ten sam przypadek na kodzie sprzed U1.
  let oldNearest = null;
  const G = { planetScene: null, uiManager: UM, _resolveClickTarget: () => rayTarget, _selectFromClickPick: sp,
    threeRenderer: { _getVesselAtScreen: () => oldNearest } };
  // Cel kliku: w ZWYKŁEJ grze `#planet-canvas` (z-index 4 nad `#event-layer`, `display: block` z reguły
  // `#game-container canvas` — zmierzone, U1) → gałąź canvas; inny element (np. ekran ładowania tuż po wczytaniu)
  // → gałąź z raycastem sceny.
  const ev = (o = {}) => (o.canvas
    ? { target: { id: 'planet-canvas', tagName: 'CANVAS', closest: () => null }, ctrlKey: !!o.ctrl, clientX: 640, clientY: 360 }
    : { target: { id: 'loading-screen', tagName: 'DIV', closest: () => null }, ctrlKey: !!o.ctrl, clientX: 640, clientY: 360 });
  const go = (pick, ray, o = {}) => { reset({ sel: o.sel ?? ['v9'] }); rayTarget = ray; oldNearest = o.oldNearest ?? pick ?? null; tl?.call(G, ev(o), pick == null ? { vesselId: null } : { vesselId: pick }); return [...ops]; };
  ok(!!tl, 'T15-0 KONTROLA: `_handleTacticalLeftClick` wycięte i skompilowane');
  // — gałąź canvas (zwykła gra)
  ok(JSON.stringify(go('v1', null, { canvas: true, oldNearest: 'v3' })) === '[["select","v1"]]',
    'T15i gałąź canvas (zwykła gra): zaznacza statek z pickera renderera — najechany `v1`, choć najbliższy jest `v3` (dawniej scena zaznaczała `v3`, a renderer fokusował `v1`)');
  ok(JSON.stringify(go('v2', null, { canvas: true, ctrl: true })) === '[["toggle","v2"]]', 'T15j KONTROLA (jak dotąd): gałąź canvas, CTRL+klik w statek → przełączenie zbioru');
  ok(JSON.stringify(go(null, null, { canvas: true })) === '[["clear"]]', 'T15k KONTROLA (jak dotąd): gałąź canvas, bez statku (pustka albo ciało) → odznaczenie zbioru');
  ok(JSON.stringify(go(null, null, { canvas: true, ctrl: true })) === '[]', 'T15l KONTROLA (jak dotąd): gałąź canvas, CTRL bez statku → zbiór zachowany');
  ok(JSON.stringify(go('x1', null, { canvas: true })) === '[]', 'T15m KONTROLA (jak dotąd): gałąź canvas, wróg → bez zaznaczenia i bez odznaczenia');
  // — gałąź poza canvas (raycast sceny)
  ok(JSON.stringify(go('v1', { type: 'empty', worldPoint: { x: 0, z: 0 } })) === '[["select","v1"]]',
    'T15a poza canvas: picker renderera = statek, raycast sceny = pustka → ZAZNACZENIE (dawniej odznaczenie — zmierzone, U1)');
  ok(JSON.stringify(go('v2', { type: 'empty', worldPoint: { x: 0, z: 0 } }, { ctrl: true })) === '[["toggle","v2"]]',
    'T15b poza canvas: CTRL+klik w statek → przełączenie zbioru (dawniej pojedyncze zaznaczenie albo odznaczenie)');
  ok(JSON.stringify(go(null, { type: 'empty', worldPoint: { x: 0, z: 0 } })) === '[["clear"]]', 'T15c KONTROLA: poza canvas, pustka → odznaczenie zbioru');
  ok(JSON.stringify(go(null, { type: 'planet', worldPoint: { x: 0, z: 0 } })) === '[]', 'T15d KONTROLA: poza canvas, ciało → zbiór bez zmian (jak dotąd)');
  ok(JSON.stringify(go('x1', { type: 'empty', worldPoint: { x: 0, z: 0 } })) === '[]', 'T15e poza canvas: wróg → bez zaznaczenia i bez odznaczenia');
  ok(JSON.stringify(go(null, { type: 'empty', worldPoint: { x: 0, z: 0 } }, { ctrl: true })) === '[]', 'T15f poza canvas: CTRL+pustka → zbiór zachowany');
  const body = methodBody(GS_SRC, '  _handleTacticalLeftClick(');
  // ⚠ Dawne wywołanie miało postać `tr?._getVesselAtScreen?.(` — wzorzec musi przepuścić `?.` przed nawiasem (bez tego
  // pin był zielony także na kodzie sprzed U1). Drugi picker to też gałąź `ownVessel` z raycastu sceny.
  ok(body.length > 0 && !/_getVesselAtScreen\s*(?:\?\.)?\s*\(/.test(body) && !/ownVessel/.test(body),
    'T15g źródło: scena nie ma własnego pickera statku (ani `_getVesselAtScreen`, ani gałęzi `ownVessel` z raycastu sceny)');
  ok(/this\.threeRenderer\.handleClick\(x, y, \{ ctrl: e\.ctrlKey \}\);\s*[\s\S]{0,200}this\._handleTacticalLeftClick\(e, this\.threeRenderer\.lastClickPick\);/.test(GS_SRC),
    'T15h źródło: klik → renderer (z CTRL), potem scena z TYM SAMYM wynikiem pickera');
}

// ═══ T16 ════════════════════════════════════════════════════════════════════
header('T16 WYKONANIE dwukliku GameScene (wycięty słuchacz) — bez ColonyOverlay i bez vessel:focus (decyzja 2b)');
{
  const GS_SRC = src('../../scenes/GameScene.js');
  const sig = "window.addEventListener('dblclick', (e) => {";
  const i = GS_SRC.indexOf(sig);
  const txt = i < 0 ? '' : GS_SRC.slice(i + "window.addEventListener('dblclick', ".length, GS_SRC.indexOf('\n    });', i) + '\n    }'.length);
  const S = { planetScene: null, uiManager: UM, colonyManager: globalThis.KOSMOS.colonyManager,
    threeRenderer: { _hoverVesselId: 'v1', _getVesselAtScreen: () => 'v1', getEntityAtScreen: () => ({ ...P1, lifeScore: 90 }),
      getScreenPosition: () => ({ x: 1, y: 1 }), _focusEntityId: null, _selectedEntityId: null } };
  const fn = compileWith(txt, { EventBus, EntityManager: EM }, S);
  ok(!!fn, 'T16-0 KONTROLA: słuchacz dwukliku wycięty i skompilowany');
  globalThis.KOSMOS.civMode = true; reset();
  fn?.({ clientX: 640, clientY: 360 });
  ok(!!fn && evs.length === 0 && ops.length === 0, 'T16a tryb cywilizacji: dwuklik w statek / kolonię → NIC (dawniej `vessel:focus` / ColonyOverlay)');
  globalThis.KOSMOS.civMode = false; S.threeRenderer._hoverVesselId = null; S.threeRenderer._getVesselAtScreen = () => null; reset();
  fn?.({ clientX: 640, clientY: 360 });
  ok(JSON.stringify(evNames()) === '["planet:colonize"]', 'T16b KONTROLA: poza trybem cywilizacji — planeta z życiem → kolonizuj (jak dotąd)');
  globalThis.KOSMOS.civMode = true;
  ok(!/_focusEntityId/.test(GS_SRC), 'T16c źródło: scena nie czyta pola kamery `_focusEntityId` (dwuklik — zaznaczenie `_selectedEntityId`)');
}

// ═══ T17 ════════════════════════════════════════════════════════════════════
header('T17 WYKONANIE vessel:focus (wycięty słuchacz) — statek bez sprite\'a po przełączeniu układu (§7.8, 478)');
{
  const WS = Number((TR_SRC.match(/const WORLD_SCALE = (\d+(?:\.\d+)?);/) ?? [])[1]);
  const Sfn = (v) => v / WS;
  const out = [];
  const bus = { emit: (n, p) => out.push([n, p]) };
  const calls = [];
  const cc = { _targetDist: 50, _goalTarget: { x: 0, y: 0, z: 0 },
    setMinDist: (d) => calls.push(['setMinDist', d]), setTargetDist: (d) => { calls.push(['setTargetDist', d]); cc._targetDist = d; },
    focusOnInstant(x, z, y) { calls.push(['focusOnInstant', x, z, y]); this._goalTarget = { x, y, z }; }, focusOn: () => calls.push(['focusOn']) };
  const R = { _cameraController: cc, _vessels: new Map(), _stations: new Map(), _planets: new Map(), _moons: new Map(), _entityByUUID: new Map(),
    _focusEntityId: 'p0', _focusVesselId: null, _focusStationId: 's0', _focusEncounterId: null, _pendingVesselFocus: null };
  globalThis.KOSMOS.vesselManager = { getVessel: (id) => id === 'vA' ? { id: 'vA', systemId: 'sys_A', position: { x: 220, y: -110, state: 'orbiting', dockedAt: null } } : null };
  globalThis.KOSMOS.activeSystemId = 'sys_A';
  const vf = compileListener(TR_SRC, 'vessel:focus', R, { EventBus: bus, S: Sfn });
  vf?.({ vesselId: 'vA' });
  ok(!!vf && R._pendingVesselFocus?.vesselId === 'vA' && R._focusEntityId === null && R._focusStationId === null,
    'T17a brak sprite\'a, statek w OGLĄDANYM układzie → fokus oczekujący, dotychczasowe śledzenie przerwane (dawniej cichy no-op)');
  ok(calls.some(c => c[0] === 'focusOnInstant' && Math.abs(c[1] - 220 / WS) < 1e-9 && Math.abs(c[2] + 110 / WS) < 1e-9),
    'T17b cel kamery od razu na pozycji logicznej statku');
  const ap = compileMethod(TR_SRC, '_applyPendingVesselFocus', { EventBus: bus });
  out.length = 0; ap?.call(R, 'vA');
  ok(!!ap && JSON.stringify(out) === '[["vessel:focus",{"vesselId":"vA"}]]' && R._pendingVesselFocus === null,
    'T17c sprite stanął, cel kamery bez zmian → dokończ fokus (`vessel:focus`, teraz ze śledzeniem sprite\'a)');
  out.length = 0; R._pendingVesselFocus = { vesselId: 'vA', goal: { x: 1, y: 2, z: 3 } }; cc._goalTarget = { x: 9, y: 9, z: 9 };
  ap?.call(R, 'vA');
  ok(!!ap && out.length === 0 && R._pendingVesselFocus === null, 'T17d kamerę w międzyczasie przejął ktoś inny → fokus przepada (bez szarpnięcia)');
  ok(/this\._applyPendingVesselFocus\(vessel\.id\);/.test(methodBody(TR_SRC, '  _addVesselModel3D(vessel, modelPath) {'))
    && /this\._applyPendingVesselFocus\(vessel\.id\);/.test(methodBody(TR_SRC, '  _addVesselSpriteFallback(vessel) {')),
    'T17e źródło: dokończenie wołane, gdy stanie model GLB i gdy stanie sprite zapasowy');
  globalThis.KOSMOS.activeSystemId = 'sys_home';
  globalThis.KOSMOS.vesselManager = { getVessel: (id) => VESSELS[id] ?? null };
}

// ═══ T18 ════════════════════════════════════════════════════════════════════
header('T18 pamięć pingu wroga gaśnie przy każdym innym zaznaczeniu (wycięte słuchacze ThreeRenderer)');
{
  const R = { _pingedEnemyId: 'x1', _selectedVesselId: null };
  compileListener(TR_SRC, 'ui:selectionChanged', R)?.({ vesselId: 'v1' });
  ok(R._pingedEnemyId === null, 'T18a zaznaczenie statku → ping wroga zapomniany');
  R._pingedEnemyId = 'x1';
  compileListener(TR_SRC, 'station:selected', R)?.({ stationId: 's1' });
  ok(R._pingedEnemyId === null, 'T18b panel stacji → ping wroga zapomniany');
  ok(/pingEnemyTarget\(vesselId\) \{[\s\S]{0,120}this\.pingVessel\(vesselId\);\s*this\._pingedEnemyId = vesselId;/.test(TR_SRC),
    'T18c `pingEnemyTarget` = ping FX + zapamiętanie celu');
  ok(/this\._pingedEnemyId = null;/.test(listenerText(TR_SRC, 'body:selected')) && /this\._pingedEnemyId = null;/.test(listenerText(TR_SRC, 'body:deselected'))
    && /this\._pingedEnemyId = null;/.test(methodBody(TR_SRC, '  _disposeAllMeshes() {')),
    'T18d … także przy zaznaczeniu / odznaczeniu ciała i zmianie układu');
}

// ═══ T19 ════════════════════════════════════════════════════════════════════
header('T19 WYKONANIE pickera kliku — wyłącznie WIDOCZNE sprite\'y (wróg ukryty mgłą wojny nie jest celem)');
{
  const gv = compileMethod(TR_SRC, '_getVesselAtScreen', {});
  const pv = compileMethod(TR_SRC, '_pickVesselForClick', {});
  const spr = (nx, ny, visible) => ({ visible, getWorldPosition(v) { v.x = nx; v.y = ny; v.z = 0; } });
  const R = { camera: {}, renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) } },
    _tmpPickVec: { x: 0, y: 0, z: 0, project() {} },
    _vessels: new Map([['xHidden', { sprite: spr(0, 0, false) }], ['vOwn', { sprite: spr(20 / 640, 0, true) }]]),
    _hoverVesselId: 'xHidden' };
  R._getVesselAtScreen = gv;
  ok(!!gv && gv.call(R, 640, 360, 40) === 'xHidden', 'T19a KONTROLA: picker bez filtra (hover, PPM) — najbliższy, także ukryty (jak dotąd)');
  ok(!!gv && gv.call(R, 640, 360, 40, true) === 'vOwn', 'T19b picker kliku (`visibleOnly`) — ukryty pominięty, widoczny 20 px dalej wybrany');
  ok(!!pv && pv.call(R, 640, 360) === 'vOwn', 'T19c `_pickVesselForClick`: najechany, ale ukryty wróg nie przejmuje kliku');
  R._hoverVesselId = 'vOwn';
  ok(!!pv && pv.call(R, 700, 600) === 'vOwn', 'T19d … najechany WIDOCZNY statek wygrywa (klik zamiarowy)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
