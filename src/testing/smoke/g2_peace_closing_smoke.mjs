// G2-4 — ZAMKNIĘCIE (2026-10-04): drobne poprawki podpisane przez właściciela po bramce follow-upów F1–F7
// (odpowiedzi 2026-10-04, `docs/design/AI_GARRISON_PLAN.md`; rejestr tamże, §6, #368 i dalej).
//
//   Zb  (b) — polski wpis pokoju (`log.diplo.peaceSigned`) po „z” gramatyczny dla każdej nazwy: „Pokój z imperium {0}”
//       (ta sama forma co wpis wycofania po F6); angielski bez zmian; wpis pokoju w Dzienniku bierze tekst z tego klucza
//       (pin źródłowy — `UIManager` nie importuje się pod node).
//   Zf  (f) — wpis w Dzienniku z uzgodnienia F3 przy WCZYTANIU ma własne brzmienie, bez „Peace with”: N jednostek na
//       ciele nazwanego imperium musi się wycofać do daty (prawdziwy `serialize` → `restore` → `armLoadReconcile`, jak
//       blok wczytania `GameScene`); kontrola: wpis przy podpisaniu pokoju zostaje „⚑ Peace with …”.
//   Zd  (d) — stary zapis: jednostki AI stojące na ciele GRACZA, gdy ich imperium nie jest z graczem w wojnie, znikają
//       w tym samym uzgodnieniu przy wczytaniu co F3 (R4 dla zapisów sprzed G2-4); JEDEN wpis w Dzienniku na ciało, bez
//       „Peace with”; kontrole: imperium w WOJNIE z graczem, jednostka AI na własnym ciele, sesja bez wczytania.
//   Ze  (e) — stary zapis: kafle kolonii zajęte przez stronę, która NIE jest w wojnie z właścicielem kolonii (wojna
//       zakończona pokojem PRZED F1), wracają przy wczytaniu do właściciela kolonii, a liczniki okupacji tej strony są
//       zerowane (reguła F1 — `revertPeaceOccupation`); skutek: nowa wojna nie daje przejęcia kolonii AI bez wojsk;
//       kontrole: strona w WOJNIE (kafle i liczniki zostają), para AI↔AI (poza zakresem, 331), sesja bez wczytania.
//   Zg  (g) Finding 365 — łazik zwiadu usunięty dowolną drogą (termin wycofania, zniszczone ciało, śmierć od ostrzału)
//       zdejmuje `vessel.awayTeamUnitId`: „Zbierz” znika z akcji statku, „Wyślij zespół” i „Powrót” nie są blokowane
//       (oferta akcji liczona `getAvailableActions` — tą samą funkcją co panel statku); kontrole: zwykłe „Zbierz” zgłasza
//       id łazika (`vessel:awayTeamCollected`), żywy łazik trzyma odnośnik.
//   Za  (a) w wersji OGRANICZONEJ (decyzja właściciela 2026-10-04, Finding 370) — ostrzeżenie „został miesiąc”
//       (`withdrawalWarning`) gaśnie samo PRZED terminem, gdy straciło przedmiot: załadunek ostatniej oflagowanej
//       jednostki (częściowy — zostaje), jednostka usunięta inną drogą, powrót wojny (od razu, bez ticku), nieaktualne
//       ostrzeżenie z zapisu (na pierwszym ticku). W TERMINIE nie gaśnie: obok staje meldunek o utracie, a liczba
//       aktywnych w dzwonku rośnie; od terminu gasi je wyłącznie gracz — także gdy wojna wróci później (kontrole).
//       Jeden próg terminu dla usunięcia jednostek i dla dzwonka: `withdrawalDeadlineReached` (pin wykonaniowy + źródłowy).
//
// ⚠ Harness jak `g2_peace_followups_smoke`: `bootWithDirector` (prawdziwa dyplomacja, wojna i pokój) + własny
//   `CombatSystem`, Dziennik i dzwonek (GameCore ich nie montuje; po boocie, bo boot czyści EventBus); mobilizacja
//   garnizonów AI wyłączona (wojna stawiałaby jednostki planu).
// ⚠ Każdy pin wykluczający ma ŚWIADKA (zdarzenie albo stan, który dowodzi, że scena się odbyła).
// ⚠ Źródło bez komentarzy (pin nie może łapać własnego wyjaśnienia) i z LF (pin niezależny od checkoutu).

import '../headless/env.js';           // MUSI być pierwszy
import gameState from '../../core/GameState.js';
import debugLog from '../../core/DebugLog.js';
import EntityManager from '../../core/EntityManager.js';
import { isStandableTile } from '../../data/GroundUnitData.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { CombatSystem } from '../../systems/CombatSystem.js';
import { EventLogSystem } from '../../systems/EventLogSystem.js';
import { NotificationCenter } from '../../systems/NotificationCenter.js';
import { empireLogName } from '../../utils/EmpireName.js';
import EventBus from '../../core/EventBus.js';
import * as FA from '../../data/FleetActions.js';
import * as VS from '../../entities/Vessel.js';
// Namespace, nie import nazwany: na kodzie sprzed (a) eksportu `withdrawalDeadlineReached` nie ma, a import nazwany
// wywróciłby linkowanie CAŁEJ suity — żaden pin nie dostałby koloru.
import * as WSmod from '../../systems/WithdrawalSystem.js';
import { readFileSync } from 'node:fs';
import { t, setLocale, getLocale } from '../../i18n/i18n.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));

// ── Harness ──────────────────────────────────────────────────────────────────────────────
function quiet(fn) {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
}
/** Świat: domyślne ziarno, gracz w pokoju z AI, mobilizacja wyłączona, prawdziwy CombatSystem, Dziennik i dzwonek. */
function boot({ garrison = false } = {}) {
  const { core, K, ticker } = quiet(() => bootWithDirector({ quiet: true }));
  if (!garrison && K.garrisonSystem) K.garrisonSystem.enabled = false;
  K.combatSystem = new CombatSystem();
  K.eventLogSystem = new EventLogSystem();
  K.notificationCenter = new NotificationCenter();
  const cm = core.colonyManager;
  const aiFull = cm.getAllColonies().filter(c => c.ownerEmpireId && !c.isOutpost);
  const home = cm.getColony(K.homePlanet.id);
  home.credits = 1e6;
  // Kafle kolonii gracza niosą 'player' — w grze stempluje je `ColonyOverlay._ensureGrid` / założenie kolonii.
  for (const t0 of tilesOf(home)) if (t0.owner == null) t0.owner = 'player';
  const col = aiFull[0], emp = col?.ownerEmpireId;
  return { core, K, ticker, cm, gum: K.groundUnitManager, dipl: K.diplomacySystem, home, aiFull, col, emp };
}
const run = (w, civY) => quiet(() => w.ticker.run(civY, { tickSize: 1.0 }));
const declare = (w, emp = w.emp) => quiet(() => w.dipl.declareWar(emp, 'keeper_setup'));
/** Pokój PRAWDZIWĄ ścieżką `offerPeace` (wyczerpanie obu stron 100 ⇒ akceptacja). */
function signPeace(w, emp = w.emp) {
  const war = w.K.warSystem.getWarWith(emp);
  if (war) gameState.set('wars.' + war.id, { ...war, exhaustion: { player: 100, [emp]: 100 } }, 'g2_4_closing');
  return quiet(() => w.dipl.offerPeace(emp, 'keeper_setup', { terms: null, playerInitiated: false }));
}
const tilesOf = (col) => (col?.grid?.toArray?.() ?? []).filter(Boolean);
function freeTiles(w, col, { building = null } = {}) {
  return tilesOf(col).filter(t0 => isStandableTile(t0) && !t0.capitalBase
    && (building === null || (building ? !!t0.buildingId : !t0.buildingId))
    && w.gum.getUnitsAtHex(col.planetId, t0.q, t0.r).length === 0);
}
function playerUnit(w, planetId, t0, { arch = 'shock_infantry' } = {}) {
  const u = w.gum.createUnit(arch, planetId, t0.q, t0.r, { owner: 'player', factionId: 'humanity' });
  u.homeColonyId = w.home.planetId;
  u.morale = u.maxMorale = 100;
  return u;
}
/** Jednostka imperium (jedyne wejście `createAIUnit`). */
function aiUnit(w, emp, planetId, t0, arch = 'garrison_unit') {
  return w.gum.createAIUnit({ archetypeId: arch, empireId: emp, planetId, q: t0.q, r: t0.r, morale: 100, deployed: true })?.unit ?? null;
}
const journal = (w, channel, re) => (w.K.eventLogSystem?.getEntries?.() ?? []).filter(e => e.channel === channel && re.test(e.text));
const counter = (t0) => [t0?.occupyEmpireId ?? null, t0?.occupyStart ?? null];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Nowa wojna po rozejmie: rozejm kończony UCZCIWĄ drogą (status relacji), potem wypowiedzenie gracza. */
function warAgain(w, emp = w.emp) {
  w.dipl.relations.setStatus('player', emp, 'peace');
  return quiet(() => w.dipl.declareWar(emp, 'player_action'));
}
const auditOf = (kind) => debugLog.query({ kind });
/** Wczytanie jak blok wczytania `GameScene`: prawdziwy zapis i odtworzenie jednostek, uzbrojenie uzgodnienia, tick. */
function loadAndTick(w) {
  const data = JSON.parse(JSON.stringify(w.gum.serialize()));
  w.gum.restore(data);
  const loadYear = w.K.timeSystem.gameTime;
  w.K.withdrawalSystem.armLoadReconcile();
  run(w, 1);
  return loadYear;
}

// ── Zb — (b): polski wpis pokoju po „z” ───────────────────────────────────────────────────
{
  console.log('\nZb — (b) polski wpis pokoju po „z” gramatyczny dla każdej nazwy; angielski bez zmian');
  const prev = getLocale();
  setLocale('pl');
  const pl = t('log.diplo.peaceSigned', 'Liga Trzech Słońc', '10');
  const plOrd = t('event.withdrawal.ordered', 'Liga Trzech Słońc', 2, 'Thuban d', '07/01/121');
  setLocale('en');
  const en = t('log.diplo.peaceSigned', 'Liga Trzech Słońc', '10');
  setLocale(prev);
  assert(pl.includes('Pokój z imperium Liga Trzech Słońc') && !/\bz Liga\b/.test(pl) && pl.includes('10'),
    `Zb: PL — „Pokój z imperium {0}” (nazwa w mianowniku jako dopowiedzenie), długość rozejmu zostaje: ${pl}`);
  assert(plOrd.includes('Pokój z imperium Liga Trzech Słońc'),
    `Zb kontrola: wzór F6 — wpis wycofania tej samej chwili ma już tę formę: ${plOrd}`);
  assert(en === '☮ Peace with Liga Trzech Słońc — 10-year truce', `Zb kontrola: EN bez zmian — ${en}`);
  const um = src('../../scenes/UIManager.js');
  const iPeace = um.indexOf("EventBus.on('diplomacy:peaceSigned'");
  assert(iPeace > 0 && /t\(\s*'log\.diplo\.peaceSigned'/.test(um.slice(iPeace, iPeace + 400)),
    'Zb kontrola pinu: wpis pokoju w Dzienniku (UIManager, diplomacy:peaceSigned) bierze tekst z log.diplo.peaceSigned — pin celuje w żywą ścieżkę');
}

// ── Zf — (f): wpis uzgodnienia F3 przy wczytaniu ──────────────────────────────────────────
{
  console.log('\nZf — (f) wpis z uzgodnienia przy WCZYTANIU: własne brzmienie bez „Peace with” — N jednostek na ciele imperium X do daty');
  const prev = getLocale();
  setLocale('en');
  const w = boot();
  const free = freeTiles(w, w.col, { building: false });
  const p1 = playerUnit(w, w.col.planetId, free[0]);
  playerUnit(w, w.col.planetId, free[1]);
  run(w, 1);
  const loadYear = loadAndTick(w);
  const f1 = w.gum.getUnit(p1.id)?.withdrawal ?? null;
  const name = empireLogName(w.emp);
  const body = EntityManager.get(w.col.planetId)?.name;
  const date = w.K.timeSystem.formatTime(f1?.deadline ?? 0);
  const jr = journal(w, 'diplomacy', /⚑/);
  const expected = t('event.withdrawal.orderedLoad', name, 2, body, date);
  const keyEn = expected !== 'event.withdrawal.orderedLoad';
  setLocale('pl');
  const plText = t('event.withdrawal.orderedLoad', 'Liga Trzech Słońc', 2, 'Thuban d', '07/01/121');
  setLocale(prev);
  assert(!!f1 && Math.abs(f1.deadline - (loadYear + 0.5)) < 1e-9 && jr.length === 1 && w.dipl.getStatus(w.emp) !== 'war'
      && !!body && !!name,
    `świadek: wczytanie w pokoju (${w.dipl.getStatus(w.emp)}) — flaga z terminem wczytanie + 0,5 i JEDEN wpis ⚑ w Dyplomacji (${jr.length})`);
  assert(keyEn && plText !== 'event.withdrawal.orderedLoad' && !/\{\d\}/.test(expected) && !/\{\d\}/.test(plText),
    'Zf: klucz event.withdrawal.orderedLoad istnieje w EN i PL, wszystkie wstawki podstawione');
  assert(jr.length === 1 && jr[0].text === expected && !/Peace with/.test(jr[0].text),
    `Zf: wpis przy wczytaniu bez „Peace with”: ${jr[0]?.text ?? '—'}`);
  assert(jr.length === 1 && jr[0].text.includes(name) && jr[0].text.includes(body) && jr[0].text.includes(date)
      && /\b2\b/.test(jr[0].text),
    'Zf kontrola: wpis nadal nazywa imperium, ciało, liczbę jednostek i datę terminu (zmienia się brzmienie, nie treść)');
  assert(!/Pokój z/.test(plText) && plText.includes('ciele imperium Liga Trzech Słońc') && plText.includes('Thuban d'),
    `Zf: PL bez „Pokój z”, ciało nazwanego imperium: ${plText}`);
}
{
  console.log('\nZf kontrola — wpis przy PODPISANIU pokoju zostaje „⚑ Peace with …” (brzmienie zależy od powodu, nie od sesji)');
  const prev = getLocale();
  setLocale('en');
  const w = boot();
  declare(w);
  const u = playerUnit(w, w.col.planetId, freeTiles(w, w.col, { building: false })[0]);
  const ok = signPeace(w);
  const f = w.gum.getUnit(u.id)?.withdrawal ?? null;
  const expected = t('event.withdrawal.ordered', empireLogName(w.emp), 1, EntityManager.get(w.col.planetId)?.name,
    w.K.timeSystem.formatTime(f?.deadline ?? 0));
  const jr = journal(w, 'diplomacy', /⚑/);
  setLocale(prev);
  assert(ok === true && !!f && jr.length === 1 && jr[0].text === expected && /^⚑ Peace with /.test(jr[0].text),
    `Zf kontrola: pokój — wpis „⚑ Peace with …” bez zmian: ${jr[0]?.text ?? '—'}`);
}

// ── Zd — (d): stary zapis — jednostki AI na ciałach gracza bez wojny ──────────────────────
{
  console.log('\nZd — (d) wczytanie: jednostki AI stojące bez wojny na ciele gracza znikają (R4 dla starych zapisów), jeden wpis na ciało');
  const prev = getLocale();
  setLocale('en');
  const w = boot();
  const col2 = w.aiFull.find(c => c.ownerEmpireId && c.ownerEmpireId !== w.emp);
  const emp2 = col2?.ownerEmpireId ?? null;
  declare(w, emp2);                                                  // z drugim imperium trwa wojna (kontrola)
  const tH = freeTiles(w, w.home, { building: false });
  const a1 = aiUnit(w, w.emp, w.home.planetId, tH[0]);               // stan zapisu sprzed G2-4: pokój, wojska AI na ciele gracza
  const a2 = aiUnit(w, w.emp, w.home.planetId, tH[1]);
  const aWar = aiUnit(w, emp2, w.home.planetId, tH[2]);              // kontrola: imperium w WOJNIE z graczem
  const aOwn = aiUnit(w, w.emp, w.col.planetId, freeTiles(w, w.col, { building: false })[0]);   // kontrola: własne ciało
  run(w, 1);
  const alive0 = !!a1 && !!a2 && !!w.gum.getUnit(a1.id) && !!w.gum.getUnit(a2.id);
  const status0 = w.dipl.getStatus(w.emp);
  debugLog.clear();
  loadAndTick(w);
  const audit = auditOf('withdrawal:aiRemoved').filter(x => x.data?.planetId === w.home.planetId);
  const body = EntityManager.get(w.home.planetId)?.name;
  const expected = t('event.withdrawal.aiRemovedLoad', empireLogName(w.emp), 2, body);
  const jr = journal(w, 'diplomacy', /☮/).filter(e => e.text.includes(body));
  setLocale(prev);
  assert(alive0 && status0 !== 'war' && !!aWar && !!aOwn && w.dipl.getStatus(emp2) === 'war' && !!body,
    `świadek: przed wczytaniem dwie jednostki ${w.emp} stoją bez wojny (${status0}) na ciele gracza; ${emp2} w wojnie z graczem`);
  assert(!w.gum.getUnit(a1.id) && !w.gum.getUnit(a2.id),
    'Zd: po wczytaniu jednostki imperium bez wojny zniknęły z ciała gracza');
  assert(audit.length === 1 && audit[0].data?.count === 2 && audit[0].data?.reason === 'load' && audit[0].data?.empireId === w.emp,
    `Zd: audyt withdrawal:aiRemoved raz na ciało (${audit.length}), jednostek ${audit[0]?.data?.count}, powód ${audit[0]?.data?.reason}`);
  assert(jr.length === 1 && jr[0].text === expected && !/Peace with/.test(jr[0].text) && /\b2\b/.test(jr[0].text),
    `Zd: JEDEN wpis w Dzienniku (Dyplomacja) na ciało, bez „Peace with”: ${jr[0]?.text ?? '—'}`);
  assert(!!w.gum.getUnit(aWar.id) && !!w.gum.getUnit(aOwn.id),
    'Zd kontrola: jednostka imperium w WOJNIE z graczem i jednostka AI na własnym ciele — zostają');
}
{
  console.log('\nZd kontrola — sesja BEZ wczytania: jednostka AI bez wojny na ciele gracza zostaje (uzgodnienie należy do wczytania)');
  const w = boot();
  const a = aiUnit(w, w.emp, w.home.planetId, freeTiles(w, w.home, { building: false })[0]);
  run(w, 3);
  assert(!!a && !!w.gum.getUnit(a.id) && w.dipl.getStatus(w.emp) !== 'war',
    'Zd kontrola: bez wczytania jednostka AI stoi dalej (zachowanie sesji bez zmian)');
}

// ── Ze — (e): stary zapis — kafle zajęte w wojnie zakończonej przed F1 ────────────────────
/**
 * Świat „zapisu sprzed F1”: rozejm z `emp` po wojnie, w której gracz zajął kafel stolicy AI, a `emp` — kafel kolonii
 * gracza; liczniki okupacji obu stron zawieszone; z `emp2` trwa wojna (kafle i liczniki tej pary — kontrola); kafel
 * kolonii `emp` należący do `emp2` (para AI↔AI — kontrola).
 */
function preF1Scene() {
  const w = boot();
  const col2 = w.aiFull.find(c => c.ownerEmpireId && c.ownerEmpireId !== w.emp);
  const emp2 = col2?.ownerEmpireId ?? null;
  declare(w, emp2);                                                   // z drugim imperium trwa wojna
  w.dipl.relations.setStatus('player', w.emp, 'truce');               // pokój zawarty PRZED F1 (stan zapisu)
  const cap = tilesOf(w.col).find(t0 => t0.capitalBase);
  cap.owner = 'player';                                               // kafel stolicy AI zajęty w tamtej wojnie
  const hTiles = freeTiles(w, w.home, { building: false });
  const hEmp = hTiles[0]; hEmp.owner = w.emp;                          // kafel kolonii gracza zajęty przez emp
  const hCnt = hTiles[1]; hCnt.occupyEmpireId = w.emp; hCnt.occupyStart = 0;   // zawieszony licznik emp na kolonii gracza
  const eCnt = freeTiles(w, w.col, { building: true })[0] ?? freeTiles(w, w.col)[0];
  eCnt.occupyEmpireId = 'player'; eCnt.occupyStart = 0;              // zawieszony licznik gracza na kolonii emp
  const hWar = hTiles[2]; hWar.owner = emp2;                          // kontrola: emp2 (wojna) na kolonii gracza
  const hWarCnt = hTiles[3]; hWarCnt.occupyEmpireId = emp2; hWarCnt.occupyStart = 0;
  const wTile = freeTiles(w, col2, { building: false })[0]; wTile.owner = 'player';   // kontrola: gracz na kolonii emp2 (wojna)
  const aiai = freeTiles(w, w.col, { building: false }).find(t0 => t0 !== eCnt); aiai.owner = emp2;   // kontrola: para AI↔AI
  return { w, emp2, col2, cap, hEmp, hCnt, eCnt, hWar, hWarCnt, wTile, aiai };
}
{
  // ⚠ Liczniki mierzone BEZPOŚREDNIO po `reconcileAfterLoad` (to on biegnie na pierwszym ticku po wczytaniu), przed
  //   jakimkolwiek tickiem okupacji: `GroundUnitManager._cleanupStaleOccupations` zeruje w każdym ticku licznik, przy
  //   którym nie stoi okupant, więc pin po ticku przechodziłby bez poprawki (jałowo).
  console.log('\nZe — (e) uzgodnienie przy wczytaniu: liczniki okupacji stron bez wojny zerowane (pomiar przed tickiem okupacji)');
  const s = preF1Scene();
  const { w } = s;
  const before = [counter(s.hCnt), counter(s.eCnt), counter(s.hWarCnt)];
  w.K.withdrawalSystem.reconcileAfterLoad(w.K.timeSystem.gameTime);
  assert(same(before, [[w.emp, 0], ['player', 0], [s.emp2, 0]]),
    'świadek: przed uzgodnieniem liczniki obu stron rozejmu i strony w wojnie są zawieszone');
  assert(same(counter(s.hCnt), [null, null]) && same(counter(s.eCnt), [null, null]),
    `Ze: liczniki okupacji stron bez wojny wyzerowane (${JSON.stringify(counter(s.hCnt))}, ${JSON.stringify(counter(s.eCnt))})`);
  assert(same(counter(s.hWarCnt), [s.emp2, 0]),
    `Ze kontrola: licznik strony w WOJNIE (${s.emp2}) nietknięty (${JSON.stringify(counter(s.hWarCnt))})`);
}
{
  console.log('\nZe — (e) wczytanie: kafle zajęte przez stronę bez wojny z właścicielem kolonii wracają do właściciela kolonii');
  const s = preF1Scene();
  const { w } = s;
  const before = [s.cap.owner, s.hEmp.owner];
  const status0 = w.dipl.getStatus(w.emp);
  debugLog.clear();
  loadAndTick(w);
  const audit = auditOf('withdrawal:tilesReverted');
  const onCol = audit.filter(x => x.data?.planetId === w.col.planetId && x.data?.reason === 'load');
  const onHome = audit.filter(x => x.data?.planetId === w.home.planetId && x.data?.reason === 'load');
  assert(same(before, ['player', w.emp]) && status0 === 'truce' && w.dipl.getStatus(s.emp2) === 'war',
    `świadek: zapis sprzed F1 — rozejm z ${w.emp} (${status0}), kafel stolicy AI należy do gracza, kafel kolonii gracza do ${w.emp}`);
  assert(s.cap.owner === w.emp && s.hEmp.owner === 'player',
    `Ze: po wczytaniu kafel stolicy AI wrócił do ${w.emp} (${s.cap.owner}), kafel kolonii gracza do gracza (${s.hEmp.owner})`);
  assert(onCol.length === 1 && onCol[0].data?.empireId === w.emp && onCol[0].data?.owner === w.emp
      && onHome.length === 1 && onHome[0].data?.empireId === w.emp && onHome[0].data?.owner === 'player',
    `Ze: audyt withdrawal:tilesReverted z reason 'load' raz na kolonię (kolonia ${w.emp}: ${onCol.length}, kolonia gracza: ${onHome.length})`);
  assert(s.hWar.owner === s.emp2 && s.wTile.owner === 'player',
    `Ze kontrola: para w WOJNIE — kafel ${s.emp2} na kolonii gracza i kafel gracza na kolonii ${s.emp2} zostają`);
  assert(s.aiai.owner === s.emp2,
    `Ze kontrola: para AI↔AI (kafel ${s.emp2} na kolonii ${w.emp}) — bez zmian (poza zakresem, 331)`);
  const war = warAgain(w);
  run(w, 2);
  assert(war !== false && w.gum.getUnitsOnPlanet(w.col.planetId).length === 0 && w.cm.getColony(w.col.planetId)?.ownerEmpireId === w.emp,
    `Ze: skutek — nowa wojna z ${w.emp} bez jednej jednostki na ciele nie daje przejęcia kolonii (właściciel po 2 civY: ${w.cm.getColony(w.col.planetId)?.ownerEmpireId ?? 'player'})`);
}
{
  console.log('\nZe kontrola — sesja BEZ wczytania: kafle zajęte przed F1 zostają (uzgodnienie należy do wczytania), mechanizm przejęcia żywy');
  const s = preF1Scene();
  const { w } = s;
  run(w, 1);
  const kept = s.cap.owner === 'player' && s.hEmp.owner === w.emp;
  const war = warAgain(w);
  run(w, 2);
  assert(kept && war !== false && !w.cm.getColony(w.col.planetId)?.ownerEmpireId,
    `Ze kontrola: bez wczytania kafle zostają (${s.cap.owner}, ${s.hEmp.owner}), a nowa wojna daje przejęcie bez wojsk — scena mierzy realny mechanizm (#363)`);
}

// ── Zg — (g) Finding 365: łazik zwiadu a odnośnik statku ──────────────────────────────────
/** Statek gracza z modułem zespołu badawczego na orbicie ciała `planetId`; łazik na powierzchni — prawdziwe `deployAwayTeam`. */
function roverShip(w, planetId, t0) {
  const v = w.K.vesselManager.createAndRegister('hull_small', w.home.planetId);
  v.modules = [...(v.modules ?? []), 'science_away_team'];
  v.systemId = EntityManager.get(planetId)?.systemId ?? v.systemId;
  v.status = 'idle';
  v.position.state = 'orbiting';
  v.position.dockedAt = planetId;
  const res = w.K.vesselManager.deployAwayTeam(v.id, planetId, t0.q, t0.r);
  return { v, res, roverId: res?.unitId ?? null };
}
/** Oferta akcji statku tak, jak liczy ją panel statku (`getAvailableActions`). */
const offer = (w, v) => FA.getAvailableActions(v, { colonyManager: w.cm });
const ids = (list) => list.map(a => a.action.id);
const reasonOf = (list, id) => list.find(a => a.action.id === id)?.reason ?? null;
/** Ciało bez kolonii w układzie domowym (niczyje — łazik ląduje bez wojny). */
function neutralBody(w, skip = []) {
  const sys = EntityManager.get(w.home.planetId)?.systemId;
  return ['moon', 'planet', 'planetoid'].flatMap(tp => EntityManager.getByType(tp))
    .find(b => b.systemId === sys && b.id !== w.home.planetId && !w.cm.getColony(b.id) && !skip.includes(b.id)) ?? null;
}
{
  console.log('\nZg — (g) łazik usunięty w TERMINIE wycofania: statek traci odnośnik, „Zbierz” znika, „Powrót” nie czeka na zbiórkę');
  const w = boot();
  declare(w);
  const { v, res, roverId } = roverShip(w, w.col.planetId, freeTiles(w, w.col, { building: false })[0]);
  const deployed = res?.ok === true && v.awayTeamUnitId === roverId && ids(offer(w, v)).includes('collect_away_team');
  const ok = signPeace(w);
  const flagged = !!w.gum.getUnit(roverId)?.withdrawal;
  run(w, 7);
  const after = offer(w, v);
  assert(deployed && ok && flagged && !w.gum.getUnit(roverId) && v.position.state === 'orbiting' && ids(after).includes('send_away_team'),
    `świadek: łazik ${roverId} na ciele ${w.emp} (wojna), pokój z flagą, w terminie usunięty; statek dalej na orbicie, gałąź zespołu w ofercie`);
  assert(v.awayTeamUnitId == null, `Zg: odnośnik statku wyzerowany (awayTeamUnitId: ${v.awayTeamUnitId})`);
  assert(!ids(after).includes('collect_away_team'), `Zg: „Zbierz” nie jest oferowane (${ids(after).join(', ')})`);
  assert(FA.FLEET_ACTIONS.return_home.canExecute(v, {}).reason !== t('fleet.reason.collectAwayFirst'),
    'Zg: „Powrót” nie jest blokowany przez „najpierw zbierz zespół” (FleetActions.return_home)');
}
{
  console.log('\nZg — (g) łazik usunięty razem ze ZNISZCZONYM ciałem (R7): statek traci odnośnik');
  const w = boot();
  const b = neutralBody(w);
  const { v, res, roverId } = roverShip(w, b?.id, { q: 0, r: 0 });
  const deployed = res?.ok === true && v.awayTeamUnitId === roverId;
  quiet(() => EntityManager.remove(b.id));
  assert(!!b && deployed && !EntityManager.get(b.id) && !w.gum.getUnit(roverId),
    `świadek: łazik ${roverId} na ciele niczyim ${b?.id}, ciało usunięte, łazik zniknął (R7)`);
  assert(v.awayTeamUnitId == null, `Zg: odnośnik statku wyzerowany (awayTeamUnitId: ${v.awayTeamUnitId})`);
  assert(FA.FLEET_ACTIONS.collect_away_team.canExecute({ ...v, position: { ...v.position, state: 'orbiting' } }, {}).reason
      === t('fleet.reason.noAwayTeamDeployed'),
    'Zg: „Zbierz” odmawia „brak zespołu na powierzchni” (nie ma czego zbierać)');
}
{
  console.log('\nZg — (g) łazik ZGINĄŁ (ostrzał z orbity na ciało niczyje): statek traci odnośnik, „Wyślij zespół” znów dostępne');
  const w = boot();
  const b = neutralBody(w);
  const { v, res, roverId } = roverShip(w, b?.id, { q: 0, r: 0 });
  const deployed = res?.ok === true && v.awayTeamUnitId === roverId;
  const sendBefore = reasonOf(offer(w, v), 'send_away_team');
  const dead = [];
  EventBus.on('groundUnit:destroyed', (e) => { if (e.unitId === roverId) dead.push(e.cause); });
  EventBus.emit('groundUnit:orbitalStrike', { vesselId: v.id, planetId: b.id, q: 0, r: 0, damage: 9999, ownerId: 'player' });
  const after = offer(w, v);
  assert(!!b && deployed && sendBefore === t('fleet.reason.awayTeamDeployed') && dead.length === 1 && dead[0] === 'orbital_strike'
      && !w.gum.getUnit(roverId) && v.position.state === 'orbiting',
    `świadek: łazik ${roverId} na ${b?.id}; przed ostrzałem „Wyślij” odmawia „${sendBefore}”; łazik zginął (${dead.join(',')})`);
  assert(v.awayTeamUnitId == null && !ids(after).includes('collect_away_team'),
    `Zg: odnośnik wyzerowany (${v.awayTeamUnitId}), „Zbierz” nie jest oferowane`);
  assert(after.find(a => a.action.id === 'send_away_team')?.ok === true,
    `Zg: „Wyślij zespół” znów dostępne (${reasonOf(after, 'send_away_team') || 'ok'})`);
}
{
  console.log('\nZg kontrole — zwykłe „Zbierz” zgłasza id łazika; żywy łazik trzyma odnośnik');
  const w = boot();
  const b = neutralBody(w);
  const { v, res, roverId } = roverShip(w, b?.id, { q: 0, r: 0 });
  run(w, 2);
  const keptId = v.awayTeamUnitId ?? null;
  const kept = res?.ok === true && keptId === roverId && !!w.gum.getUnit(roverId) && ids(offer(w, v)).includes('collect_away_team');
  const got = [];
  EventBus.on('vessel:awayTeamCollected', (e) => got.push(e));
  EventBus.emit('vessel:collectAwayTeam', { vesselId: v.id });
  assert(kept, `Zg kontrola: żywy łazik po 2 civY — odnośnik ${keptId ?? '—'} zostaje, „Zbierz” w ofercie`);
  assert(got.length === 1 && got[0].unitId === roverId && v.awayTeamUnitId == null && !w.gum.getUnit(roverId),
    `Zg kontrola: „Zbierz” — vessel:awayTeamCollected z id łazika (${got[0]?.unitId}), łazik zdjęty, odnośnik wyzerowany`);
}

// ── Za — (a) w wersji ograniczonej (Finding 370): ostrzeżenie „został miesiąc” gaśnie samo PRZED terminem ─────────
const warningsOn = (w, planetId) => (w.K.notificationCenter?.getActive?.() ?? [])
  .filter(n => n.type === 'withdrawalWarning' && n.payload?.planetId === planetId);
const lossesOn = (w, planetId) => (w.K.notificationCenter?.getActive?.() ?? [])
  .filter(n => n.type === 'withdrawalExpired' && n.payload?.planetId === planetId);
const step = (w, civY) => quiet(() => w.ticker.run(civY, { tickSize: civY }));
/** Jednostka gracza do ładowni świeżego statku (prawdziwe `loadGroundUnit`). */
function loadIntoShip(w, u) {
  const v = w.K.vesselManager.createAndRegister('hull_small', w.home.planetId);
  v.troopCapacity = 12; v.troopBayUsed = 0; v.groundUnits = [];
  return VS.loadGroundUnit(v, u)?.ok === true;
}
/** Scena: wojna, jednostki gracza na kolonii AI, pokój (flaga), 5 civY — ostrzeżenie w dzwonku, termin w 6. civY. */
function warnedScene(n = 1) {
  const w = boot();
  declare(w);
  const free = freeTiles(w, w.col, { building: false });
  const units = Array.from({ length: n }, (_, i) => playerUnit(w, w.col.planetId, free[i]));
  const ok = signPeace(w);
  const deadline = w.gum.getUnit(units[0].id)?.withdrawal?.deadline ?? null;
  run(w, 5);
  return { w, units, ok, deadline, before: warningsOn(w, w.col.planetId).length };
}
{
  console.log('\nZa1 — (a) W TERMINIE ostrzeżenie NIE gaśnie: obok staje meldunek o utracie, liczba w dzwonku rośnie');
  const s = warnedScene(1);
  const { w } = s;
  const cntBefore = w.K.notificationCenter.getActiveCount();
  run(w, 1);                                                          // termin w 6. civY
  const cntAfter = w.K.notificationCenter.getActiveCount();
  assert(s.ok === true && s.before === 1 && !w.gum.getUnit(s.units[0].id) && lossesOn(w, w.col.planetId).length === 1,
    `świadek: pokój, ostrzeżenie przed terminem (${s.before}); w terminie jednostka usunięta, meldunek o utracie (${lossesOn(w, w.col.planetId).length})`);
  assert(warningsOn(w, w.col.planetId).length === 1, 'Za1 kontrola: w terminie ostrzeżenie zostaje obok meldunku o utracie');
  assert(cntAfter === cntBefore + 1, `Za1 kontrola: liczba aktywnych w dzwonku rośnie o meldunek (${cntBefore} → ${cntAfter})`);
  run(w, 2);
  assert(warningsOn(w, w.col.planetId).length === 1, 'Za1 kontrola: po terminie ostrzeżenie czeka na gracza — samo nie gaśnie');
}
{
  console.log('\nZa2 — (a) załadunek: przy częściowym ostrzeżenie zostaje, po ostatniej oflagowanej jednostce gaśnie przed terminem');
  const s = warnedScene(2);
  const { w } = s;
  const [u1, u2] = s.units;
  const l1 = loadIntoShip(w, u1);
  step(w, 0.25);
  const partial = warningsOn(w, w.col.planetId).length;
  const f2 = !!w.gum.getUnit(u2.id)?.withdrawal;
  const l2 = loadIntoShip(w, u2);
  step(w, 0.25);
  assert(s.ok === true && s.before === 1 && l1 && l2 && !w.gum.getUnit(u1.id)?.withdrawal && !w.gum.getUnit(u2.id)?.withdrawal
      && s.deadline !== null && w.K.timeSystem.gameTime < s.deadline,
    `świadek: pokój, ostrzeżenie (${s.before}); obie jednostki załadowane przed terminem (${w.K.timeSystem.gameTime.toFixed(3)} < ${s.deadline?.toFixed?.(3)}), flagi zdjęte`);
  assert(partial === 1 && f2, `Za2 kontrola: po załadunku jednej z dwóch ostrzeżenie zostaje (${partial}) — druga stoi z flagą (${f2})`);
  assert(warningsOn(w, w.col.planetId).length === 0, 'Za2: po załadunku ostatniej oflagowanej jednostki ostrzeżenie zgasło');
  run(w, 2);
  assert(lossesOn(w, w.col.planetId).length === 0,
    'Za2 kontrola: po terminie bez meldunku o utracie — wojska zabrane w czasie');
}
{
  console.log('\nZa3 — (a) wojna z właścicielem ciała wraca: ostrzeżenie gaśnie od razu (bez ticku — także na pauzie)');
  const s = warnedScene(1);
  const { w } = s;
  const war = warAgain(w);
  assert(s.ok === true && s.before === 1 && war !== false && w.dipl.getStatus(w.emp) === 'war' && !w.gum.getUnit(s.units[0].id)?.withdrawal,
    `świadek: pokój, ostrzeżenie (${s.before}); wojna wróciła (${w.dipl.getStatus(w.emp)}), flaga zdjęta`);
  assert(warningsOn(w, w.col.planetId).length === 0, 'Za3: wojna wróciła — ostrzeżenie zgasło bez czekania na tick');
}
{
  console.log('\nZa4 — (a) jednostka z ostrzeżenia usunięta inną drogą przed terminem (np. rozwiązanie): ostrzeżenie gaśnie');
  const s = warnedScene(1);
  const { w } = s;
  const removed = w.gum.removeUnit(s.units[0].id);
  assert(s.ok === true && s.before === 1 && removed === true && w.K.timeSystem.gameTime < s.deadline,
    `świadek: pokój, ostrzeżenie (${s.before}); jednostka zdjęta z rejestru przed terminem`);
  assert(warningsOn(w, w.col.planetId).length === 0, 'Za4: na ciele nie została oflagowana jednostka — ostrzeżenie zgasło');
}
{
  console.log('\nZa5 — (a) zapis: nieaktualne ostrzeżenie sprzed terminu gaśnie na pierwszym ticku; ostrzeżenie po terminie zostaje');
  const w = boot();
  run(w, 1);
  const nc = w.K.notificationCenter;
  const now = w.K.timeSystem.gameTime;
  const item = (id, deadlineYear) => ({ id, type: 'withdrawalWarning', severity: 'warn', source: 'withdrawalSystem',
    timestamp: 0, year: now, title: 'x', subtitle: 'x',
    payload: { bodyId: w.col.planetId, planetId: w.col.planetId, empireId: w.emp, unitIds: ['gu_nie_ma'], deadlineYear } });
  nc.restore({ nextId: 9, items: [item('notif_7', now + 0.4), item('notif_8', now - 0.01)] });
  const before = [nc.getById('notif_7')?.dismissed, nc.getById('notif_8')?.dismissed];
  run(w, 1);
  assert(same(before, [false, false]) && w.K.timeSystem.gameTime < now + 0.4,
    `świadek: oba ostrzeżenia odtworzone z zapisu jako aktywne; czas przed terminem pierwszego`);
  assert(nc.getById('notif_7')?.dismissed === true, 'Za5: ostrzeżenie sprzed terminu bez oflagowanych jednostek zgasło na pierwszym ticku');
  assert(nc.getById('notif_8')?.dismissed === false, 'Za5 kontrola: ostrzeżenie po terminie zostaje (od terminu gasi je gracz)');
}
{
  console.log('\nZa6 — (a) po terminie wraca wojna: rozstrzygnięte ostrzeżenie zostaje (gasi je wyłącznie gracz)');
  const s = warnedScene(1);
  const { w } = s;
  run(w, 2);                                                          // termin w 6. civY
  const after = warningsOn(w, w.col.planetId).length;
  const war = warAgain(w);
  assert(s.ok === true && after === 1 && lossesOn(w, w.col.planetId).length === 1 && war !== false && w.dipl.getStatus(w.emp) === 'war',
    `świadek: termin minął (meldunek o utracie), ostrzeżenie w dzwonku (${after}); wojna wróciła (${w.dipl.getStatus(w.emp)})`);
  assert(warningsOn(w, w.col.planetId).length === 1, 'Za6 kontrola: po terminie powrót wojny ostrzeżenia nie gasi');
}
{
  console.log('\nZa7 — (a) jeden próg terminu dla usunięcia jednostek i dla dzwonka');
  const fn = WSmod.withdrawalDeadlineReached;
  const exec = typeof fn === 'function'
    ? [fn(0.5, 0.5), fn(0.5 - 1e-10, 0.5), fn(0.5 - 1e-6, 0.5), fn(0.6, 0.5)] : null;
  assert(same(exec, [true, true, false, true]),
    `Za7: withdrawalDeadlineReached — termin, tolerancja 1e-9 jak usunięcie, przed terminem nie (${JSON.stringify(exec)})`);
  const ws = src('../../systems/WithdrawalSystem.js');
  const nc = src('../../systems/NotificationCenter.js');
  assert(/withdrawalDeadlineReached\(now,\s*w\.deadline\)/.test(ws) && !/now\s*>=\s*w\.deadline\s*-\s*EPS\)/.test(ws),
    'Za7: usunięcie po terminie (`WithdrawalSystem._tick`) pyta wspólnego predykatu');
  assert(/withdrawalDeadlineReached\(now,\s*p\.deadlineYear\)/.test(nc),
    'Za7: dzwonek (`NotificationCenter`) pyta tego samego predykatu');
  assert(/now\s*>=\s*w\.deadline\s*-\s*WITHDRAWAL_WARNING_YEARS\s*-\s*EPS/.test(ws),
    'Za7 kontrola pinu: źródło czytane bez komentarzy, próg ostrzeżenia na swoim miejscu — pin nie jest ślepy');
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
