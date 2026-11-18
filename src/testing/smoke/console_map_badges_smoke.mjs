// ARC KONSOLE K7-A (decyzja właściciela na bramce K7-A) — keeper: plakietki i znaczniki mapy nie są rysowane pod ŻADNĄ konsolą,
// wracają po zamknięciu. Reguła zestawu: `ConsoleSceneLogic.CONSOLE_HIDDEN_MAP_BADGES` + `consoleHidesMapBadges`; wykonanie
// w `ThreeRenderer._hideConsoleMapBadges` (gaszenie TYLKO na czas renderu klatki, cofnięte zaraz po nim — bez zmiany stanu).
// Warstwa HUD (`#hud-canvas`: etykiety ciał i statków, alarmy) gaśnie już pod każdym overlayem — pin `hudGate` → `overlay`.
//
//   L  logika: lista rodzin (7, bez duplikatów), predykat (tylko konsola zasłania scenę), `hudGate` pod overlayem
//   R  źródło ThreeRenderer (nie importuje się pod node — piny źródłowe, komentarze zdjęte): każda rodzina z listy ma czytelnika,
//      gaszenie wołane w pętli przed composerem i cofane w `finally`, warunek = predykat konsoli (ten sam co tło)
//   E  wykonanie metody na atrapie renderera (prototyp przez źródło nie jest dostępny — symulacja kontraktu: zgaś widoczne,
//      przywróć dokładnie zgaszone)

import '../headless/env.js';   // MUSI być pierwszy
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; if (process.env.VERBOSE) console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ FAIL: ' + m); } };
const header = (s) => console.log('\n── ' + s);

let CS = {};
try { CS = await import('../../ui/ConsoleSceneLogic.js'); } catch (e) { console.log('  (ConsoleSceneLogic: ' + e.message + ')'); }
const { hudGate } = await import('../../ui/HudLayer.js').catch(() => ({ hudGate: null }));
const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const FAMILIES = ['colonyBuildingMarkers', 'lifeGlows', 'tacticalGlyphs', 'tacticalGhosts', 'tacticalOrbitMarkers', 'enemyAlertMarkers', 'poiSprites'];

header('L  lista rodzin i predykat');
const list = CS.CONSOLE_HIDDEN_MAP_BADGES ?? [];
ok(Array.isArray(list) && list.length === FAMILIES.length && FAMILIES.every((f) => list.includes(f)), `L: 7 rodzin plakietek (${list.join(',')})`);
ok(list.length > 0 && new Set(list).size === list.length, 'L: bez duplikatów (świadek: lista niepusta)');
ok(Object.isFrozen(list), 'L: lista zamrożona');
ok(CS.consoleHidesMapBadges?.(true) === true, 'L: konsola zasłania scenę → gaś');
ok(CS.consoleHidesMapBadges?.(false) === false && CS.consoleHidesMapBadges?.(undefined) === false, 'L: bez konsoli (także flaga OFF) → rysuj');
const K = { civMode: true, uiManager: { overlayManager: { isAnyOpen: () => true } }, threeRenderer: {} };
ok(hudGate?.(K)?.reason === 'overlay', 'L: kontrola — warstwa HUD gaśnie pod każdym overlayem (hudGate → overlay)');

header('R  źródło ThreeRenderer');
const src = strip(read('../../renderer/ThreeRenderer.js'));
const m = src.match(/_hideConsoleMapBadges\(\) \{([\s\S]*?)\n  \}/);
ok(!!m, 'R: świadek — metoda _hideConsoleMapBadges');
const body = m?.[1] ?? '';
for (const f of FAMILIES) ok(new RegExp(`\\b${f}\\s*:\\s*\\(\\)\\s*=>`).test(body), `R: rodzina ${f} ma czytelnika`);
ok(/for \(const key of CONSOLE_HIDDEN_MAP_BADGES\)/.test(body), 'R: iteracja po liście z logiki (jedno źródło)');
ok(/o\.visible = false; hidden\.push\(o\)/.test(body) && /for \(const o of hidden\) o\.visible = true/.test(body), 'R: gaś widoczne, przywróć dokładnie zgaszone');
const loop = src.match(/this\._consoleBackdropTick\(\);([\s\S]*?)this\._sceneRenderFrames\+\+;/)?.[1] ?? '';   // KZ-Kit: tik tła bez decyzji o pominięciu
ok(loop.length > 0, 'R: świadek — fragment pętli renderu');
ok(/const undoBadges = consoleHidesMapBadges\(this\._consoleCovered === true\) \? this\._hideConsoleMapBadges\(\) : null;/.test(loop), 'R: warunek = predykat konsoli (ten sam stan co filtr tła, `_consoleCovered`)');
const iU = loop.indexOf('undoBadges = '), iR = loop.indexOf('this._composer.render()'), iF = loop.indexOf('if (undoBadges) undoBadges();');
ok(iU >= 0 && iR > iU && iF > iR && /finally \{[\s\S]*if \(undoBadges\) undoBadges\(\);/.test(loop), 'R: gaszenie przed composerem, cofnięcie w finally po renderze');

header('E  kontrakt gaszenia (atrapa)');
// ta sama treść metody wykonana na atrapie: wyciągamy ciało i budujemy funkcję (pin wykonaniowy kontraktu, bez three)
let run = null;
if (body) try { run = new Function('CONSOLE_HIDDEN_MAP_BADGES', `return function() {${body}}`)(list); } catch (e) { ok(false, 'E: ciało metody kompiluje się: ' + e.message); }
if (run) {
  const sp = (visible) => ({ visible });
  const r = {
    _colonyMarkers: { _markers: new Map([['a', sp(true)], ['b', sp(false)]]) },
    _lifeGlows: new Map([['p', sp(true)]]), _tacticalGlyphs: new Map([['v', sp(true)]]), _tacticalGhosts: new Map([['v', sp(true)]]),
    _tacticalOrbitMarkers: new Map([['k', sp(true)]]), _enemyAlertMarkers: new Map([['e', sp(true)]]),
    _poiSprites: new Map([['poi', { sprite: sp(true), type: 'x' }]]),
  };
  const undo = run.call(r);
  const all = [...r._colonyMarkers._markers.values(), ...r._lifeGlows.values(), ...r._tacticalGlyphs.values(), ...r._tacticalGhosts.values(),
    ...r._tacticalOrbitMarkers.values(), ...r._enemyAlertMarkers.values(), ...[...r._poiSprites.values()].map((e) => e.sprite)];
  ok(all.every((o) => o.visible === false), 'E: pod konsolą wszystkie plakietki zgaszone');
  ok(r._consoleBadgesHidden === 7, `E: licznik zgaszonych = widoczne przed (${r._consoleBadgesHidden})`);
  if (typeof undo === 'function') undo();
  ok(typeof undo === 'function', 'E: metoda zwraca funkcję cofającą');
  ok(r._colonyMarkers._markers.get('a').visible === true && r._colonyMarkers._markers.get('b').visible === false, 'E: po renderze przywrócone dokładnie (niewidoczna zostaje niewidoczna)');
  ok(all.filter((o) => o.visible).length === 7, 'E: po zamknięciu — 7 widocznych jak przed');
}

console.log(`\n${fail === 0 ? '✓ PASS' : '✗ FAIL'} — ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
