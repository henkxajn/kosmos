// DESANT DA SIĘ ODNALEŹĆ I WRÓCIĆ NAD NIEGO — jednostki gracza na CUDZYM ciele.
//
// PO CO: zgłoszenie właściciela — „ekran planety, na którą desantuję, znika po zrzuceniu
// wszystkich jednostek i nie mogę potem wrócić do tego widoku, żeby poruszać wojskami".
// Objaw miał TRZY niezależne przyczyny, każda wystarczająca sama:
//
//   1. `ColonyOverlay._finishDropMode` po opróżnieniu kolejki wracał do poprzedniego overlaya
//      (`setTimeout(openPanel('fleet'), 1500)`).
//   2. Kolektor Outlinera (`UIManager`) iterował WYŁĄCZNIE kolonie GRACZA, więc oddział stojący
//      na planecie AI nie trafiał na listę NIGDY. ZMIERZONE przed naprawą: dwie żywe jednostki
//      gracza, lista widzi jedną.
//   3. Klik w jednostkę wołał `switchActiveColony(planetId)` (dla koloni AI zwraca `false` —
//      bramka własności D1) + `openPanel('colony')` BEZ `colonyId`, więc `show()` spadało na
//      `activePlanetId` i otwierała się WŁASNA kolonia. Ta sama klasa co „Obserwacja UX
//      z GATE OG-3 §3" — i ten sam kształt miał `BottomContext._doAction` („mapa ciała").
//
// ⚠ MECHANIKA DOWODZENIA NIE BYŁA ZEPSUTA — brakowało wyłącznie drogi powrotnej. Panel obcej
//   planety jest ZAPROJEKTOWANY (`ColonyOverlay._openAsColonyPanel`: „dla konkretnej planety
//   (własnej LUB obcej)"), `ColonyOrderGuard.ALWAYS_ALLOWED_HITS` ma całą rodzinę „WARSTWA
//   DOWODZENIA DESANTEM", a rozkaz ruchu (`GameScene:5427`) bramkuje po `unit.owner`, NIE po
//   właścicielu kolonii. Dlatego naprawa jest mała, a keeper pilnuje DRZWI, nie mechaniki.
//
//   T1  Kolektor `collectPlayerGroundUnits` — desant na koloni AI JEST na liście; wróg, `in_cargo`
//       i martwy NIE; polityka nazw (własna kolonia → nazwa KOLONII, obce ciało → nazwa CIAŁA).
//       + pin ŹRÓDŁOWY wpięcia w `UIManager` (ten plik nie importuje się pod node).
//   T2  Grupowanie po ciele + kolejność (ciała bez mojej koloni PIERWSZE).
//   T3  WYKONANIE — prawdziwy `Outliner.draw` na atrapie ctx i prawdziwy `hitTest`: sub-nagłówek
//       obcego ciała się rysuje, ma hit-zonę `groundBody`, a klik woła `openPanel('colony',
//       {colonyId})` z WŁAŚCIWYM id. KONTROLA PINU: własna kolonia nadal przełącza aktywną.
//   T4  WYKONANIE — `BottomContext._doAction` na obcej koloni: z moimi wojskami otwiera JEJ mapę,
//       bez wojsk NIE otwiera ani cudzej, ani własnej. KONTROLA PINU: własna kolonia bez zmian.
//   T5  Pin ŹRÓDŁOWY `_finishDropMode` (ColonyOverlay nie importuje się pod node — `TextureLoader`).
//   T6  Etykiety: KAŻDY typ jednostki ma nazwę ≠ klucz w PL i EN, i ma ikonę. Przed naprawą
//       `t('groundUnit.shock_infantry')` zwracało SAM KLUCZ → lista pokazywała „groundUni…".
//
// Uruchom: node src/testing/smoke/ground_troops_reachable_smoke.mjs

import '../headless/env.js';           // MUSI być pierwszy
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GameCore } from '../headless/GameCore.js';
import { Outliner } from '../../ui/Outliner.js';
import { BottomContext } from '../../ui/BottomContext.js';
import { resolveBodyName } from '../../utils/BodyName.js';
import { t, setLocale } from '../../i18n/i18n.js';
// ⚠ NAMESPACE, nie nazwany import: `ARCHETYPE_ICONS` POWSTAJE w tym slice, a nazwany import
//   nieistniejącego eksportu wywraca CAŁY moduł (SyntaxError) — żaden pin nie miałby koloru
//   przy pomiarze fail-first. Namespace degraduje do `undefined`, czyli do czerwonego pinu.
import * as ArchData from '../../data/unitArchetypes.js';
import { GROUND_UNITS } from '../../data/GroundUnitData.js';
import EntityManager from '../../core/EntityManager.js';
import EventBus from '../../core/EventBus.js';

// ⚠ DYNAMICZNIE I W try/catch — moduł POWSTAJE w tym slice, więc na kodzie SPRZED naprawy
//   statyczny import wywróciłby CAŁĄ suitę i żaden pin nie miałby koloru (lekcja
//   `map_click_frame_smoke`: pin musi DEGRADOWAĆ, nie PRZERYWAĆ — tu na poziomie MODUŁU).
let GroundLogic = null;
try { GroundLogic = await import('../../ui/OutlinerGroundLogic.js'); } catch { /* piny padną */ }

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
// ⚠ Komentarze zdejmowane PRZED szukaniem (memory `source-pin-strip-comments`) — inaczej pin
//   łapie własne wyjaśnienie zostawione w kodzie po usunięciu producenta.
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const read = (...p) => stripComments(readFileSync(join(SRC, ...p), 'utf8'));

/** Atrapa ctx: każda metoda no-op, `measureText` zwraca szerokość, `fillText` NAGRYWA napisy. */
const stubCtx = (sink = []) => new Proxy({ _text: sink }, {
  get: (o, k) => {
    if (k === '_text') return sink;
    if (k in o) return o[k];
    if (k === 'measureText') return (o[k] = () => ({ width: 10 }));
    if (k === 'fillText')    return (o[k] = (s) => { sink.push(String(s)); });
    return (o[k] = () => {});
  },
  set: () => true,
});

function boot() {
  const core = new GameCore();
  core.boot({ quiet: true, scenario: 'civilization' });
  window.KOSMOS.civMode = true;
  const cm  = core.colonyManager;
  const gum = window.KOSMOS.groundUnitManager;
  const ai   = cm.getAllColonies().find(c => c.ownerEmpireId);
  const mine = cm.getAllColonies().find(c => !c.ownerEmpireId);
  return { core, cm, gum, ai, mine };
}

/** Stub OverlayManagera nagrywający `openPanel` — jedyne, o co pytamy w T3/T4. */
function stubOverlayManager() {
  const calls = [];
  window.KOSMOS.overlayManager = { active: null, openPanel: (id, opts) => calls.push({ id, opts }) };
  return calls;
}

console.log('\n== T1 - kolektor widzi jednostki na KAZDYM ciele ==');
{
  const { cm, gum, ai, mine } = boot();
  const drop   = gum.createUnit('shock_infantry', ai.planetId,   0, 0, { owner: 'player' });   // desant na koloni AI
  const home   = gum.createUnit('shock_infantry', mine.planetId, 1, 0, { owner: 'player' });   // garnizon u siebie
  const enemy  = gum.createUnit('shock_infantry', ai.planetId,   2, 0, { owner: 'emp_001' });  // wróg
  const cargo  = gum.createUnit('shock_infantry', mine.planetId, 3, 0, { owner: 'player' });
  const dead   = gum.createUnit('shock_infantry', mine.planetId, 4, 0, { owner: 'player' });
  cargo.status = 'in_cargo';            // w ładowni — planetId ZOSTAJE, a jednostki na powierzchni nie ma
  dead.hp = 0; dead.currentHP = 0;

  assert(!!GroundLogic?.collectPlayerGroundUnits, 'modul OutlinerGroundLogic istnieje i eksportuje kolektor');
  const list = GroundLogic?.collectPlayerGroundUnits?.(gum.getAllUnits(), {
    getColony:   (pid) => cm.getColony(pid),
    getBodyName: resolveBodyName,
  }) ?? [];
  const ids = new Set(list.map(u => u.id));

  assert(ids.has(drop.id),   'desant na koloni AI JEST na liscie (sedno - dawniej niewidzialny)');
  assert(ids.has(home.id),   'garnizon na wlasnej koloni nadal na liscie (kontrola pinu)');
  // ⚠ KAŻDY pin wykluczający niesie ŚWIADKA (`ids.has(drop.id)`) — na pustej liście
  //   „nie zawiera X" jest prawdą JAŁOWO i świeciłoby zielono dokładnie tam, gdzie defekt.
  assert(ids.has(drop.id) && !ids.has(enemy.id), 'wroga jednostka NIE trafia na liste gracza');
  assert(ids.has(drop.id) && !ids.has(cargo.id), 'jednostka w ladowni (in_cargo) NIE udaje stojacej na powierzchni');
  assert(ids.has(drop.id) && !ids.has(dead.id),  'martwa jednostka odsiana');
  assert(list.length === 2,  `lista ma dokladnie 2 wpisy (jest ${list.length})`);

  const dropRow = list.find(u => u.id === drop.id);
  const homeRow = list.find(u => u.id === home.id);
  const aiBody  = EntityManager.get(ai.planetId);
  assert(homeRow?.planetName === mine.name,
    `wlasna kolonia -> NAZWA KOLONII (${homeRow?.planetName})`);
  // Fixture MUSI rozroznic obie polityki. Bootstrap nazywa kolonie AI tak samo jak cialo
  // ("Thuban b" == "Thuban b"), wiec bez rozjechania nazw ten pin przechodzil JALOWO —
  // nie potrafil odroznic "wzielismy nazwe ciala" od "wzielismy nazwe cudzej koloni".
  ai.name = 'WROGA-NAZWA-KOLONII';
  const list2 = GroundLogic?.collectPlayerGroundUnits?.(gum.getAllUnits(), {
    getColony:   (pid) => cm.getColony(pid),
    getBodyName: resolveBodyName,
  }) ?? [];
  const dropRow2 = list2.find(u => u.id === drop.id);
  assert(aiBody?.name !== ai.name, 'kontrola pinu: fixture faktycznie rozjezdza obie nazwy');
  assert(dropRow2?.planetName === aiBody?.name,
    `obce cialo -> nazwa CIALA (${dropRow2?.planetName})`);
  assert(!!dropRow2?.planetName && dropRow2.planetName !== ai.name,
    'obce cialo -> NIE nazwa cudzej koloni (mgla wojny: nazwa nadana przez wroga zostaje u wroga)');
  assert(!!dropRow, 'wiersz desantu obecny takze przed przemianowaniem (kontrola pinu)');

  // Pin ZRODLOWY wpiecia — `UIManager` nie importuje sie pod node (THREE.TextureLoader).
  const uim = read('scenes', 'UIManager.js');
  assert(/collectPlayerGroundUnits\(\s*guMgr\.getAllUnits\(\)/.test(uim),
    'UIManager karmi liste z getAllUnits() przez kolektor');
  assert(!/for\s*\(\s*const\s+col\s+of\s+allColonies\s*\)[\s\S]{0,200}getUnitsOnPlanet/.test(uim),
    'UIManager NIE iteruje juz kolonii gracza po jednostki naziemne');
}

console.log('\n== T2 - grupowanie po ciele ==');
{
  const units = [
    { id: 'a', planetId: 'p_mine', planetName: 'Nowy Swit' },
    { id: 'b', planetId: 'p_ai',   planetName: 'Kepler-442b' },
    { id: 'c', planetId: 'p_ai',   planetName: 'Kepler-442b' },
  ];
  const groups = GroundLogic?.groupGroundUnitsByBody?.(units, { isOwnBody: (pid) => pid === 'p_mine' }) ?? [];
  assert(groups.length === 2, `dwa ciala w wyniku (jest ${groups.length})`);
  assert(groups[0]?.planetId === 'p_ai' && groups[0]?.units.length === 2,
    'obce cialo PIERWSZE i ma obie jednostki (sily ekspedycyjne wymagaja uwagi)');
  assert(groups[1]?.planetId === 'p_mine', 'wlasna kolonia za nim');
  assert(groups[0]?.planetName === 'Kepler-442b', 'nazwa ciala przeniesiona do grupy');
  // KONTROLA PINU: bez `isOwnBody` nie wywraca sie i nadal grupuje
  const g2 = GroundLogic?.groupGroundUnitsByBody?.(units) ?? [];
  assert(g2.length === 2, 'grupowanie bez dep isOwnBody tez dziala (kontrola pinu)');
  assert(!!GroundLogic?.groupGroundUnitsByBody && GroundLogic.groupGroundUnitsByBody(null).length === 0,
    'null -> pusta lista (pin wymaga obecnosci modulu, inaczej przechodzi jalowo)');
}

console.log('\n== T3 - Outliner: WYKONANIE draw + hitTest ==');
{
  const { cm, gum, ai, mine } = boot();
  const calls = stubOverlayManager();
  const drop = gum.createUnit('shock_infantry', ai.planetId,   0, 0, { owner: 'player' });
  const home = gum.createUnit('shock_infantry', mine.planetId, 1, 0, { owner: 'player' });
  const aiBody = EntityManager.get(ai.planetId);

  // Stan budowany RECZNIE — T3 mierzy polowe Outlinerowa niezaleznie od kolektora.
  const groundUnits = [
    { ...drop, planetName: aiBody.name },
    { ...home, planetName: mine.name },
  ];
  const state = {
    colonies: [], expeditions: [], fleet: [], shipQueues: [], groundUnits,
    constructionQueue: [], pendingBuilds: [], pendingShipOrders: [],
    pendingOutpostOrders: [], factoryQueue: [], factoryAllocations: [], inventory: {},
  };

  const out = new Outliner();
  // Zwin pozostale sekcje — inaczej JEDN. NAZIEMNE (ostatnia) schodza ponizej pasma hitTestu.
  out._sections.colonies = out._sections.expeditions = out._sections.fleet = out._sections.queue = false;
  const sink = [];
  const W = 1280, H = 720;
  let threw = null;
  try { out.draw(stubCtx(sink), W, H, state); } catch (e) { threw = e; }
  assert(!threw, `draw nie rzuca (${threw?.message ?? 'ok'})`);

  const text = sink.join('\n');
  assert(text.includes(aiBody.name), `sub-naglowek z nazwa OBCEGO ciala narysowany (${aiBody.name})`);
  assert(text.includes(mine.name),   'sub-naglowek wlasnej koloni tez (kontrola pinu)');
  assert(/\(1\)/.test(text),         'licznik jednostek przy ciele');
  assert(text.includes(t('groundUnit.shock_infantry')) && !text.includes('groundUni'),
    'etykieta jednostki to NAZWA, nie obciety klucz i18n');

  const bodyZones = out._clickTargets.filter(z => z.type === 'groundBody');
  assert(bodyZones.length === 2, `dwie hit-zony groundBody (jest ${bodyZones.length})`);
  const aiZone = bodyZones.find(z => z.planetId === ai.planetId);
  assert(!!aiZone, 'obce cialo ma wlasna hit-zone');

  // KLIK w sub-naglowek obcego ciala
  calls.length = 0;
  const before = cm.activePlanetId;
  if (aiZone) out.hitTest(aiZone.x + 5, aiZone.y + 2, W, H);
  assert(calls.length === 1 && calls[0].id === 'colony' && calls[0].opts?.colonyId === ai.planetId,
    `klik otwiera panel TEGO ciala (${JSON.stringify(calls[0] ?? null)})`);
  assert(cm.activePlanetId === before,
    'aktywna kolonia gracza NIETKNIETA przy obcym ciele (bramka wlasnosci D1 respektowana)');

  // KLIK w wiersz jednostki na obcym ciele
  calls.length = 0;
  const unitZone = out._clickTargets.find(z => z.type === 'groundUnit' && z.unitId === drop.id);
  assert(!!unitZone, 'wiersz jednostki ma hit-zone z planetId');
  if (unitZone) out.hitTest(unitZone.x + 5, unitZone.y + 2, W, H);
  assert(calls.length === 1 && calls[0].opts?.colonyId === ai.planetId,
    'klik w jednostke desantu tez otwiera JEJ planete, nie moja kolonie');

  // KONTROLA PINU — wlasna kolonia nadal przelacza aktywna (HUD idzie za graczem)
  cm.switchActiveColony(mine.planetId);
  calls.length = 0;
  const myZone = bodyZones.find(z => z.planetId === mine.planetId);
  if (myZone) out.hitTest(myZone.x + 5, myZone.y + 2, W, H);
  assert(calls.length === 1 && calls[0].opts?.colonyId === mine.planetId,
    'wlasne cialo: panel otwarty z jej id');
  assert(cm.activePlanetId === mine.planetId,
    'wlasne cialo: aktywna kolonia ustawiona (kontrola pinu - nie zabetonowalismy odmowy)');
}

console.log('\n== T4 - BottomContext "mapa ciala" ==');
{
  const { cm, gum, ai, mine } = boot();
  const calls = stubOverlayManager();
  const aiBody = EntityManager.get(ai.planetId);
  const myBody = EntityManager.get(mine.planetId);
  const bc = new BottomContext();

  // (a) obca kolonia BEZ moich wojsk — nie otwiera ANI cudzej, ANI wlasnej.
  // ⚠ `analyzed` ustawiane JAWNIE, zeby zmierzyc SKUTEK (spadek do read-only podgladu), a nie
  //   sam brak skutku — inaczej pin przechodzilby jalowo w obie strony.
  aiBody.analyzed = true;
  let previewed = 0;
  EventBus.on('planet:previewMap', () => { previewed++; });
  calls.length = 0;
  const activeBefore = cm.activePlanetId;
  bc._doAction(aiBody);
  assert(!calls.some(c => c.id === 'colony' && c.opts?.colonyId == null),
    'bez wojsk: NIE otwiera panelu bez colonyId (dawniej = przeskok na wlasna kolonie)');
  assert(!calls.some(c => c.opts?.colonyId === ai.planetId),
    'bez wojsk: nie otwiera tez mapy obcego ciala');
  assert(previewed === 1, 'bez wojsk: spada do read-only podgladu (planet:previewMap), nie w pustke');
  assert(cm.activePlanetId === activeBefore, 'bez wojsk: aktywna kolonia nietknieta');

  // (b) obca kolonia Z moimi wojskami — otwiera JEJ mape
  gum.createUnit('shock_infantry', ai.planetId, 0, 0, { owner: 'player' });
  calls.length = 0;
  bc._doAction(aiBody);
  assert(calls.length === 1 && calls[0].id === 'colony' && calls[0].opts?.colonyId === ai.planetId,
    `z wojskami: otwiera mape obcego ciala (${JSON.stringify(calls[0] ?? null)})`);

  // (c) wrogie wojska na obcym ciele NIE sa biletem
  const { cm: cm2, gum: gum2, ai: ai2, mine: mine2 } = boot();
  const calls2 = stubOverlayManager();
  const aiBody2 = EntityManager.get(ai2.planetId);
  gum2.createUnit('shock_infantry', ai2.planetId, 0, 0, { owner: 'emp_001' });
  const bc2 = new BottomContext();
  calls2.length = 0;
  bc2._doAction(aiBody2);
  assert(!calls2.some(c => c.opts?.colonyId === ai2.planetId) &&
         !calls2.some(c => c.id === 'colony' && c.opts?.colonyId == null),
    'cudze wojska na cudzym ciele nie otwieraja ANI jej mapy, ANI mojej koloni (bilet = MOJE buty)');

  // KONTROLA PINU — wlasna kolonia zachowuje sie jak dotad
  calls2.length = 0;
  bc2._doAction(EntityManager.get(mine2.planetId) ?? myBody);
  assert(calls2.length === 1 && calls2[0].id === 'colony' && calls2[0].opts === undefined,
    'wlasna kolonia: openPanel("colony") bez opts - sciezka sprzed zmiany');
}

console.log('\n== T5 - _finishDropMode zostawia gracza na planecie ==');
{
  const co = read('ui', 'ColonyOverlay.js');
  const m = co.match(/_finishDropMode\s*\([\s\S]*?\n  \}/);
  assert(!!m, 'metoda _finishDropMode znaleziona w zrodle');
  const body = m?.[0] ?? '';
  assert(!!m && !/setTimeout/.test(body), 'brak auto-powrotu przez setTimeout');
  assert(!!m && !/openPanel/.test(body),  'brak openPanel - panel planety ZOSTAJE otwarty');
  assert(!/_dropReturnOverlay/.test(co), 'pole _dropReturnOverlay usuniete z calego pliku');
  // KONTROLA PINU — metoda nadal robi to, po co istnieje
  assert(/this\._dropMode\s*=\s*false/.test(body), 'kontrola pinu: tryb desantu nadal wylaczany');
  assert(/_showFlash/.test(body),                  'kontrola pinu: flash nadal pokazywany');
  assert(!/Desant (zakonczony|anulowany)/.test(co) && !/Desant zakończony|Desant anulowany/.test(co),
    'twarde polskie literaly flashy zdjete');
  for (const loc of ['pl', 'en']) {
    setLocale(loc);
    assert(t('drop.finished') !== 'drop.finished' && t('drop.cancelled') !== 'drop.cancelled',
      `[${loc}] klucze drop.finished/drop.cancelled istnieja`);
  }
  setLocale('pl');
}

console.log('\n== T6 - etykiety i ikony jednostek ==');
{
  const UNIT_ARCHETYPES = ArchData.UNIT_ARCHETYPES ?? {};
  const ARCHETYPE_ICONS = ArchData.ARCHETYPE_ICONS ?? {};
  const types = [...Object.keys(UNIT_ARCHETYPES), ...Object.keys(GROUND_UNITS)];
  assert(types.length >= 11, `mierzymy wszystkie typy jednostek (${types.length})`);
  for (const loc of ['pl', 'en']) {
    setLocale(loc);
    const missing = types.filter(id => t(`groundUnit.${id}`) === `groundUnit.${id}`);
    assert(missing.length === 0, `[${loc}] kazdy typ ma nazwe != klucz (brakuje: ${missing.join(',') || 'nic'})`);
  }
  setLocale('pl');
  const noIcon = types.filter(id => !(ARCHETYPE_ICONS[id] ?? GROUND_UNITS[id]?.icon));
  assert(noIcon.length === 0, `kazdy typ ma ikone (brakuje: ${noIcon.join(',') || 'nic'})`);
  // mapa ikon przeniesiona z GroundUnitPanel do danych — bez tego Outliner ciagnalby THREE
  const gup = read('ui', 'GroundUnitPanel.js');
  assert(!/const\s+ARCHETYPE_ICONS\s*=/.test(gup), 'GroundUnitPanel nie trzyma juz wlasnej kopii mapy ikon');
  assert(/import\s*\{[^}]*ARCHETYPE_ICONS[^}]*\}\s*from\s*'\.\.\/data\/unitArchetypes\.js'/.test(gup),
    'GroundUnitPanel importuje mape ikon z danych');
}

console.log(`\n${fail === 0 ? 'OK' : 'FAIL'} ground_troops_reachable: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
