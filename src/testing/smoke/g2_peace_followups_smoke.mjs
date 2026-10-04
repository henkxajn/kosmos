// G2-4 — PO BRAMCE (2026-10-04): poprawki podpisane przez właściciela (F1–F4) i wady z bramki live (F5–F7).
// Rejestr: `docs/design/AI_GARRISON_PLAN.md` §6 (#363–#367 i dalej); zakres G2-4: §5p.
//
//   B1  F1 #363 — przy POKOJU kafle zajęte w wojnie wracają do właściciela kolonii, po OBU stronach, a liczniki
//       okupacji są zerowane; kolonie i okupanci STRON TRZECICH nietknięci; nowa wojna nie daje przejęcia kolonii AI
//       bez wojsk (kontrola: ten sam świat z kaflem stolicy gracza — daje, czyli scena mierzy realny mechanizm).
//   B2  F2 #364 — ostrzał z orbity na ciało INNEGO imperium wymaga wojny z jego właścicielem: dostępność akcji (powód
//       widoczny dla gracza), wystrzał (`fireOrbitalStrike` — odmowa PRZED zużyciem amunicji), strażnik silnika
//       (`groundUnit:orbitalStrike` w pokoju nie zadaje obrażeń, odmowa w audycie); wojna i własne ciało — kontrole.
//       Żądanie ostrzału w `ColonyOverlay` (nie importuje się pod node) — pin źródłowy z kontrolą na bramce desantu.
//   B3  F3 #366 — stary zapis: jednostki gracza stojące w POKOJU na ciele innego imperium, bez flagi, dostają ją przy
//       WCZYTANIU (prawdziwy `serialize` → `restore`, uzbrojenie jak w `GameScene`), termin = chwila wczytania + 0,5 roku;
//       bez dublowania (istniejąca flaga i jej termin nietknięte); kontrole: wojna, ładownia, własne ciało, sesja BEZ
//       wczytania (sceny keeperów z jednostkami w pokoju — np. `g2_after_peace_smoke` A2 — zostają nietknięte).
//   B4  F6 (bramka 2026-10-04) — wpis wycofania nazywa imperium tym samym źródłem i tą samą regułą wywiadu co wpis
//       pokoju tej samej chwili (bez „Unknown empire”); `UIManager._empName` deleguje do tego samego źródła (pin
//       źródłowy — `UIManager` nie importuje się pod node); polski tekst po „z” gramatycznie dla każdej nazwy; reguła mgły
//       wojny dla obserwacji imperium (mobilizacja W2-7) — nietknięta (kontrola).
//   B5  F4 #367 — wpisy w Dzienniku: R4 (jednostki AI zdjęte z ciał gracza przy pokoju — kanał Dyplomacja, nazwa strony
//       traktatu i ciała) i R7 (jednostka gracza utracona razem z ciałem — kanał Walka, NAZWA ciała także wtedy, gdy
//       encji już nie ma: ciało z kolonią i bez); kontrola: usunięcie wyłącznie jednostek AI nie daje wpisu.
//   B6  F5 (bramka 2026-10-04) — termin wycofania usuwa jednostki: JEDEN wpis w Dzienniku i JEDEN w dzwonku NA CIAŁO,
//       z nazwą ciała i liczbą utraconych; na warstwie UI, którą montuje gra (plakietka dzwonka `BottomControlBar`,
//       lista `NotificationDropdown`); utrata nie ginie w deduplikacji, gdy ostrzeżenie tego samego ciała padło
//       kilkadziesiąt ms wcześniej (wysoka prędkość czasu); kontrola: załadunek przed terminem — bez meldunku.
//
// ⚠ Harness: `bootWithDirector` (prawdziwa dyplomacja, wojna i pokój) + własny `CombatSystem`, Dziennik i dzwonek
//   (GameCore ich nie montuje; po boocie, bo boot czyści EventBus). Mobilizacja garnizonów AI WYŁĄCZONA w scenach,
//   które jej nie mierzą (wojna stawiałaby jednostki planu).
// ⚠ Każdy pin wykluczający ma ŚWIADKA (migawka sprzed akcji albo zdarzenie, które dowodzi, że scena się odbyła).
// ⚠ Symbole nowe w tej serii ładowane jako PRZESTRZEŃ NAZW — przed naprawą ich nie ma, a import nazwany wywróciłby
//   plik i żaden pin nie dostałby koloru (lekcja „pin musi degradować, nie przerywać”).

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import debugLog from '../../core/DebugLog.js';
import EntityManager from '../../core/EntityManager.js';
import { isStandableTile } from '../../data/GroundUnitData.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { CombatSystem } from '../../systems/CombatSystem.js';
import { EventLogSystem } from '../../systems/EventLogSystem.js';
import { NotificationCenter } from '../../systems/NotificationCenter.js';
import * as TO from '../../utils/TileOwnership.js';
import { readFileSync } from 'node:fs';
import { t, setLocale, getLocale } from '../../i18n/i18n.js';
import * as FA from '../../data/FleetActions.js';
import * as VS from '../../entities/Vessel.js';
import { BottomControlBar } from '../../ui/BottomControlBar.js';
import * as ND from '../../ui/NotificationDropdown.js';
let ENmod = null;
try { ENmod = await import('../../utils/EmpireName.js'); } catch { ENmod = null; }

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

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
  // Kafle kolonii gracza niosą 'player' — w grze stempluje je `ColonyOverlay._ensureGrid` / założenie kolonii;
  //   uprząż zostawia `null` (wzór `g2_after_peace_smoke`).
  for (const t of tilesOf(home)) if (t.owner == null) t.owner = 'player';
  const col = aiFull[0], emp = col?.ownerEmpireId;
  return { core, K, ticker, cm, gum: K.groundUnitManager, dipl: K.diplomacySystem, home, aiFull, col, emp };
}
const run = (w, civY) => quiet(() => w.ticker.run(civY, { tickSize: 1.0 }));
const declare = (w, emp = w.emp) => quiet(() => w.dipl.declareWar(emp, 'keeper_setup'));
/** Pokój PRAWDZIWĄ ścieżką `offerPeace` (wyczerpanie obu stron 100 ⇒ akceptacja). */
function signPeace(w, emp = w.emp, terms = null) {
  const war = w.K.warSystem.getWarWith(emp);
  if (war) gameState.set('wars.' + war.id, { ...war, exhaustion: { player: 100, [emp]: 100 } }, 'g2_4_followups');
  return quiet(() => w.dipl.offerPeace(emp, 'keeper_setup', { terms, playerInitiated: false }));
}
/** Nowa wojna po pokoju: rozejm kończony UCZCIWĄ drogą (status relacji), potem wypowiedzenie gracza. */
function warAgain(w, emp = w.emp) {
  w.dipl.relations.setStatus('player', emp, 'peace');
  return quiet(() => w.dipl.declareWar(emp, 'player_action'));
}
const tilesOf = (col) => (col?.grid?.toArray?.() ?? []).filter(Boolean);
const capitalOf = (col) => tilesOf(col).find(t => t.capitalBase) ?? null;
function freeTiles(w, col, { building = null } = {}) {
  return tilesOf(col).filter(t => isStandableTile(t) && !t.capitalBase
    && (building === null || (building ? !!t.buildingId : !t.buildingId))
    && w.gum.getUnitsAtHex(col.planetId, t.q, t.r).length === 0);
}
function playerUnit(w, planetId, t, { arch = 'shock_infantry', morale = 100 } = {}) {
  const u = w.gum.createUnit(arch, planetId, t.q, t.r, { owner: 'player', factionId: 'humanity' });
  u.homeColonyId = w.home.planetId;
  if (morale != null) { u.morale = u.maxMorale = morale; }
  return u;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const bell = (w, type) => (w.K.notificationCenter?.getActive?.() ?? []).filter(n => n.type === type);
const counter = (t) => [t?.occupyEmpireId ?? null, t?.occupyStart ?? null];
/** Źródło bez komentarzy (pin nie może łapać własnego wyjaśnienia) i z LF (pin niezależny od checkoutu). */
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const src = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
/** Statek z baterią ostrzału na orbicie ciała `planetId` (moduł `orbital_strike_battery` — kształt `Vessel.js:222-226`). */
function strikeVessel(w, planetId, ammo = 5) {
  const v = w.K.vesselManager.createAndRegister('hull_small', w.home.planetId);
  v.orbitalStrike = { damage: 20, cooldownYears: 0.5, ammoCapacity: 10, ammoType: 'orbital_shells', ammoCurrent: ammo,
                      cooldownUntilYear: 0 };
  v.position.state = 'orbiting';
  v.position.dockedAt = planetId;
  return v;
}
/** Jednostka imperium (jedyne wejście `createAIUnit`). */
function aiUnit(w, emp, planetId, t0, arch = 'garrison_unit') {
  return w.gum.createAIUnit({ archetypeId: arch, empireId: emp, planetId, q: t0.q, r: t0.r, morale: 100, deployed: true })?.unit ?? null;
}

// ── B1 — F1 #363: pokój cofa okupację kafli, po obu stronach ─────────────────────────────
{
  console.log('\nB1a — TileOwnership.revertPeaceOccupation: kafle drugiej strony pokoju wracają, liczniki obu stron zerowane, trzecia strona nietknięta');
  const R = TO.revertPeaceOccupation;
  const mk = (q, owner, occ = null) => ({ q, r: 0, owner, occupyEmpireId: occ, occupyStart: occ ? 7 : null });
  const tiles = [mk(0, 'emp_A'), mk(1, 'player'), mk(2, 'emp_B'), mk(3, 'player', 'emp_A'), mk(4, 'emp_A', 'player'),
                 mk(5, 'emp_B', 'emp_B'), mk(6, 'player', 'emp_B'), mk(7, 'emp_B', 'player')];
  let res = null;
  try { res = typeof R === 'function' ? R({ toArray: () => tiles }, 'player', 'emp_A') : null; } catch { res = null; }
  assert(typeof R === 'function', 'B1a: TileOwnership eksportuje revertPeaceOccupation (jedno źródło reguły „co pokój cofa”)');
  assert(!!res && same(tiles.map(t => t.owner), ['player', 'player', 'emp_B', 'player', 'player', 'emp_B', 'player', 'emp_B'])
      && same((res.reverted ?? []).map(x => x.q), [0, 4]),
    `B1a: kafle emp_A na kolonii gracza → gracz (q 0 i 4), reszta bez zmian (właściciele ${tiles.map(t => t.owner).join('/')})`);
  assert(!!res && res.reset === 2 && same(counter(tiles[3]), [null, null]) && same(counter(tiles[4]), [null, null])
      && same(counter(tiles[5]), ['emp_B', 7]) && same(counter(tiles[6]), ['emp_B', 7]),
    `B1a: liczniki stron pokoju zerowane (${res?.reset}), liczniki strony trzeciej (emp_B) zostają`);
  // ⚠ Licznik WŁAŚCICIELA kolonii zerowany tylko na kaflu cofniętym od drugiej strony: gracz odbijający kafel zajęty przez
  //   emp_B (z którym wojna trwa) nie traci postępu przez pokój z emp_A.
  assert(!!res && tiles[7].owner === 'emp_B' && same(counter(tiles[7]), ['player', 7]),
    `B1a: odbijanie kafla strony trzeciej trwa — kafel emp_B z licznikiem gracza bez zmian (${tiles[7].owner}, ${counter(tiles[7])})`);
  let empty = 'brak';
  try { empty = typeof R === 'function' ? R(null, 'player', 'emp_A') : 'brak'; } catch { empty = 'wyjątek'; }
  assert(typeof R === 'function' && empty?.reverted?.length === 0 && empty?.reset === 0,
    'B1a: siatka nieistniejąca ⇒ nic do cofnięcia (bez wyjątku)');
}
{
  console.log('\nB1b — pokój (prawdziwe offerPeace): kafle zajęte w wojnie wracają do właściciela kolonii — obie strony, liczniki zerowane');
  const w = boot();
  declare(w);
  const emp = w.emp;
  const capAI = capitalOf(w.col);
  const emptyAI = freeTiles(w, w.col, { building: false })[0];
  const bldAI = freeTiles(w, w.col, { building: true })[0];
  const hFree = freeTiles(w, w.home, { building: false });
  const hBld = freeTiles(w, w.home, { building: true })[0];
  const col2 = w.aiFull.find(c => c.ownerEmpireId && c.ownerEmpireId !== emp) ?? null;
  const emp2 = col2?.ownerEmpireId ?? null;
  const t2 = col2 ? freeTiles(w, col2, { building: false })[0] : null;
  // REALNA okupacja (świadek, że stan „kafel AI = gracz” powstaje w grze): jednostka gracza na pustym kaflu AI w wojnie.
  playerUnit(w, w.col.planetId, emptyAI);
  run(w, 1);
  const realOcc = emptyAI.owner === 'player';
  // Stan jak #363 (konstruowany — wzór pomiaru z rejestru): kafel stolicy AI = gracz, licznik gracza na kaflu z budynkiem
  //   AI; po stronie gracza — kafel z budynkiem i pusty kafel zajęte przez imperium, licznik imperium na pustym kaflu.
  const now = w.K.timeSystem.gameTime;
  capAI.owner = 'player';
  bldAI.occupyEmpireId = 'player'; bldAI.occupyStart = now;
  hBld.owner = emp;
  hFree[0].owner = emp;
  hFree[1].occupyEmpireId = emp; hFree[1].occupyStart = now;
  // Strony trzecie: kafel kolonii innego imperium zajęty przez gracza; kafel gracza zajęty przez inne imperium.
  if (t2) t2.owner = 'player';
  if (emp2) { hFree[2].owner = emp2; hFree[2].occupyEmpireId = emp2; hFree[2].occupyStart = now; }
  const flips = [];
  EventBus.on('tile:ownerChanged', (e) => flips.push(e));
  const ok = signPeace(w);
  assert(ok === true && w.dipl.getStatus(emp) === 'truce' && realOcc && !!capAI && !!bldAI && !!hBld && !!col2 && !!t2,
    `świadek: pokój przyjęty (${ok}, ${w.dipl.getStatus(emp)}); pusty kafel AI zajęty REALNĄ okupacją w wojnie (${realOcc}); strona trzecia ${emp2}`);
  assert(capAI.owner === emp && emptyAI.owner === emp && same(counter(bldAI), [null, null]),
    `B1b: kolonia ${emp} — kafel stolicy i kafel zajęty okupacją wracają do ${emp} (${capAI.owner}/${emptyAI.owner}), licznik gracza wyzerowany`);
  assert(hBld.owner === 'player' && hFree[0].owner === 'player' && same(counter(hFree[1]), [null, null]),
    `B1c: kolonia gracza — kafle zajęte przez ${emp} wracają do gracza (${hBld.owner}/${hFree[0].owner}), licznik ${emp} wyzerowany`);
  assert(t2?.owner === 'player' && hFree[2].owner === emp2 && hFree[2].occupyEmpireId === emp2,
    `B1d kontrola: strona trzecia nietknięta — kafel ${emp2} zajęty przez gracza zostaje (${t2?.owner}), kafel gracza zajęty przez ${emp2} zostaje (${hFree[2].owner})`);
  const back = flips.filter(e => e.newOwner === (e.planetId === w.home.planetId ? 'player' : emp));
  assert(flips.length === 4 && back.length === 4 && bell(w, 'tileLost').length === 0,
    `B1e: każdy cofnięty kafel emituje tile:ownerChanged do właściciela kolonii (${flips.length}), dzwonek bez „utraty terenu” (${bell(w, 'tileLost').length})`);
  const audit = debugLog.query({ kind: 'withdrawal:tilesReverted' });
  const sum = audit.reduce((a, e) => a + (e.data?.count ?? 0), 0);
  assert(audit.length === 2 && sum === 4,
    `B1f: audyt withdrawal:tilesReverted — jeden wpis na kolonię strony pokoju (${audit.length}), razem kafli ${sum}`);
  run(w, 3);
  assert(emptyAI.owner === emp && capAI.owner === emp,
    `B1g: w rozejmie kafel nie wraca do gracza, choć jego jednostka dalej na nim stoi (po 3 civY: ${emptyAI.owner})`);

  console.log('\nB1h — #363: nowa wojna po pokoju NIE daje przejęcia kolonii AI bez wojsk');
  const again = warAgain(w);
  run(w, 2);
  const stillAI = w.cm.getColony(w.col.planetId)?.ownerEmpireId === emp;
  assert(again !== false && w.dipl.getStatus(emp) === 'war' && stillAI,
    `B1h: wojna wraca (${w.dipl.getStatus(emp)}), po 2 civY kolonia nadal ${emp} — kafel stolicy cofnięty przy pokoju (${capAI.owner})`);
}
{
  console.log('\nB1h kontrola — ten sam świat, ale kafel stolicy AI zostawiony graczowi (stan sprzed poprawki): przejęcie bez wojsk');
  const w = boot();
  declare(w);
  const emp = w.emp;
  const capAI = capitalOf(w.col);
  const ok = signPeace(w);
  capAI.owner = 'player';                                 // świat, w którym pokój NIE cofnął okupacji
  const again = warAgain(w);
  run(w, 2);
  const units = w.gum.getUnitsOnPlanet(w.col.planetId).length;
  assert(ok === true && again !== false && units === 0 && !w.cm.getColony(w.col.planetId)?.ownerEmpireId,
    `B1h kontrola: przy kaflu stolicy gracza i zerze jednostek (${units}) kolonia przechodzi w 2 civY — mechanizm #363 jest żywy`);
}

// ── B2 — F2 #364: ostrzał z orbity na obce ciało tylko w wojnie ────────────────────────
{
  console.log('\nB2a — dostępność „Ostrzał z orbity”: ciało imperium w pokoju — odmowa z powodem; wojna i własne ciało — dostępna');
  const w = boot();
  // Dominacja orbitalna to INNA bramka (w pokoju i tak `true` — #364); tu mierzymy wyłącznie wojnę.
  w.K.warSystem.playerHasOrbitalDominance = () => true;
  const act = FA.FLEET_ACTIONS?.orbital_strike;
  const state = { colonyManager: w.cm };
  const V = strikeVessel(w, w.col.planetId);
  const Vh = strikeVessel(w, w.home.planetId);
  const peace = act?.canExecute?.(V, state);
  const own = act?.canExecute?.(Vh, state);
  declare(w);
  const war = act?.canExecute?.(V, state);
  const notAtWar = t('fleet.reason.strikeNotAtWar');
  assert(w.dipl.getStatus(w.emp) === 'war' && peace?.ok === false && peace?.reason === notAtWar,
    `B2a: pokój z ${w.emp} — akcja niedostępna z powodem „${notAtWar}” (${JSON.stringify(peace)})`);
  assert(war?.ok === true && own?.ok === true,
    `B2a kontrola: wojna — dostępna (${JSON.stringify(war)}); własne ciało w pokoju — dostępna (${JSON.stringify(own)})`);
  // ⚠ Klucz lądowania (fleet.reason.notAtWar) mówi o LĄDOWANIU — dla ostrzału kłamałby o czynności.
  assert(t('fleet.reason.strikeNotAtWar') !== 'fleet.reason.strikeNotAtWar' && t('fleet.reason.strikeNotAtWar') !== t('fleet.reason.notAtWar'),
    'B2a: powód ostrzału ma własny klucz, różny od powodu lądowania');
}
{
  console.log('\nB2b — wystrzał (fireOrbitalStrike): w pokoju odmowa PRZED zużyciem amunicji i cooldownu; wojna i własne ciało — strzela');
  const w = boot();
  const fire = VS.fireOrbitalStrike;
  const V = strikeVessel(w, w.col.planetId, 5);
  const Vw = strikeVessel(w, w.col.planetId, 5);         // kontrola wojny — statek nietknięty strzałem w pokoju
  const Vh = strikeVessel(w, w.home.planetId, 5);
  const year = w.K.timeSystem.gameTime;
  let peace = null, own = null, war = null;
  try { peace = fire(V, year, w.col.planetId); } catch (e) { peace = { thrown: e.message }; }
  const afterPeace = [V.orbitalStrike.ammoCurrent, V.orbitalStrike.cooldownUntilYear];
  try { own = fire(Vh, year, w.home.planetId); } catch (e) { own = { thrown: e.message }; }
  declare(w);
  try { war = fire(Vw, year, w.col.planetId); } catch (e) { war = { thrown: e.message }; }
  assert(peace?.ok === false && peace?.reason === 'not_at_war' && same(afterPeace, [5, 0]),
    `B2b: pokój — odmowa „not_at_war” (${JSON.stringify(peace)}), amunicja i cooldown nietknięte (${afterPeace})`);
  assert(war?.ok === true && Vw.orbitalStrike.ammoCurrent === 4 && own?.ok === true && Vh.orbitalStrike.ammoCurrent === 4,
    `B2b kontrola: wojna — strzela (amunicja 5 → ${Vw.orbitalStrike.ammoCurrent}); własne ciało w pokoju — strzela (${Vh.orbitalStrike.ammoCurrent})`);
}
{
  console.log('\nB2c — strażnik silnika: groundUnit:orbitalStrike na ciele imperium w pokoju nie zadaje obrażeń (odmowa w audycie); wojna i własne ciało — zadaje');
  const w = boot();
  const tAI = freeTiles(w, w.col, { building: false })[0];
  const tH = freeTiles(w, w.home, { building: false })[0];
  const g = aiUnit(w, w.emp, w.col.planetId, tAI);
  const p = playerUnit(w, w.home.planetId, tH);
  const hpG0 = g?.hp, hpP0 = p?.hp;
  const strike = (planetId, t0) => EventBus.emit('groundUnit:orbitalStrike',
    { vesselId: 'b2c_probe', planetId, q: t0.q, r: t0.r, damage: 3, ownerId: 'player' });
  strike(w.col.planetId, tAI);
  const hpPeace = g?.hp;
  strike(w.home.planetId, tH);
  const refused = debugLog.query({ kind: 'groundUnit:orbitalStrikeRefused' });
  declare(w);
  const hpPreWar = g?.hp;
  strike(w.col.planetId, tAI);
  assert(!!g && hpG0 > 3 && hpPeace === hpG0 && refused.length === 1 && refused[0].data?.reason === 'not_at_war',
    `B2c: pokój — garnizon ${w.emp} nietknięty (${hpG0} → ${hpPeace}), odmowa w audycie: ${refused.length} (${refused[0]?.data?.reason ?? '—'})`);
  assert(g?.hp === hpPreWar - 3 && p?.hp === hpP0 - 3,
    `B2c kontrola: wojna — garnizon ${hpPreWar} → ${g?.hp}; własne ciało w pokoju (ogień bratobójczy dozwolony) — ${hpP0} → ${p?.hp}`);
}
{
  console.log('\nB2d — pin źródłowy ColonyOverlay: żądanie ostrzału pyta bramkę wojny PRZED wejściem w tryb; wystrzał podaje ciało i tłumaczy odmowę');
  const co = src('../../ui/ColonyOverlay.js');
  const iReq = co.indexOf("EventBus.on('vessel:orbitalStrikeRequest'");
  const req = iReq >= 0 ? co.slice(iReq, co.indexOf('this._strikeMode = true', iReq)) : '';
  assert(/warGateRefusal\(\s*'player'\s*,\s*targetId\s*\)/.test(req) && /t\(\s*'fleet\.reason\.strikeNotAtWar'\s*\)/.test(req),
    'B2d: handler vessel:orbitalStrikeRequest pyta warGateRefusal(player, targetId) i pokazuje fleet.reason.strikeNotAtWar PRZED trybem ostrzału');
  const iClick = co.indexOf('if (this._strikeMode && tile)');
  const click = iClick >= 0 ? co.slice(iClick, iClick + 1600) : '';
  assert(/fireOrbitalStrike\(\s*vessel\s*,\s*gameYear\s*,\s*this\._strikePlanetId\s*\)/.test(click)
      && /NOT_AT_WAR/.test(click) && /t\(\s*'fleet\.reason\.strikeNotAtWar'\s*\)/.test(click),
    'B2d: klik w trybie ostrzału podaje ciało do fireOrbitalStrike i tłumaczy odmowę NOT_AT_WAR przez t()');
  const iDrop = co.indexOf("EventBus.on('vessel:dropTroopsRequest'");
  const drop = iDrop >= 0 ? co.slice(iDrop, iDrop + 1200) : '';
  assert(/warGateRefusal\(\s*'player'\s*,\s*targetId\s*\)/.test(drop),
    'B2d kontrola pinu: ten sam wzorzec łapie bramkę desantu (G2-2) w tym pliku — pin nie jest ślepy');
}

// ── B3 — F3 #366: stary zapis — flaga przy wczytaniu ─────────────────────────────────────
/** Świat „zapisu sprzed G2-4”: jednostki gracza w pokoju na ciele AI bez flagi, ciało drugiej strony w wojnie itd. */
function oldSaveScene() {
  const w = boot();
  const emp = w.emp;
  const col2 = w.aiFull.find(c => c.ownerEmpireId && c.ownerEmpireId !== emp) ?? null;
  const emp2 = col2?.ownerEmpireId ?? null;
  const free1 = freeTiles(w, w.col, { building: false });
  const p1 = playerUnit(w, w.col.planetId, free1[0]);
  const p2 = playerUnit(w, w.col.planetId, free1[1]);
  const pOld = playerUnit(w, w.col.planetId, free1[2]);              // już z flagą (zapis z G2-4)
  pOld.withdrawal = { empireId: emp, orderedYear: 0, deadline: 0.4, warned: false };
  const pCargo = playerUnit(w, w.col.planetId, free1[3]);            // w ładowni nad tym ciałem
  pCargo.status = 'in_cargo';
  const pHome = playerUnit(w, w.home.planetId, freeTiles(w, w.home, { building: false })[0]);
  const pWar = col2 ? playerUnit(w, col2.planetId, freeTiles(w, col2, { building: false })[0]) : null;
  if (emp2) quiet(() => w.dipl.declareWar(emp2, 'keeper_setup'));     // z drugim imperium trwa wojna
  return { w, emp, emp2, col2, p1, p2, pOld, pCargo, pHome, pWar };
}
{
  console.log('\nB3a — wczytanie starego zapisu: jednostki gracza w pokoju na ciele imperium dostają flagę (termin = wczytanie + 0,5)');
  const s = oldSaveScene();
  const { w, emp } = s;
  const WS = w.K.withdrawalSystem;
  run(w, 1);
  const before = [s.p1, s.p2].map(u => w.gum.getUnit(u.id)?.withdrawal ?? null);
  // Wczytanie: prawdziwy zapis i odtworzenie jednostek, potem uzbrojenie — dokładnie jak blok wczytania `GameScene`.
  const data = JSON.parse(JSON.stringify(w.gum.serialize()));
  w.gum.restore(data);
  const loadYear = w.K.timeSystem.gameTime;
  const ordered = [];
  EventBus.on('withdrawal:ordered', (e) => ordered.push(e));
  let armed = true;
  try { WS.armLoadReconcile(); } catch { armed = false; }
  run(w, 1);
  const f1 = w.gum.getUnit(s.p1.id)?.withdrawal ?? null;
  const f2 = w.gum.getUnit(s.p2.id)?.withdrawal ?? null;
  assert(same(before, [null, null]) && w.dipl.getStatus(emp) !== 'war' && !!w.gum.getUnit(s.p1.id),
    `świadek: przed wczytaniem jednostki gracza stoją w pokoju (${w.dipl.getStatus(emp)}) na ciele ${emp} BEZ flagi i bez terminu (stan #366)`);
  assert(armed && !!f1 && !!f2 && f1.empireId === emp && Math.abs(f1.deadline - (loadYear + 0.5)) < 1e-9
      && Math.abs(f1.orderedYear - loadYear) < 1e-9 && f1.warned === false && f2.deadline === f1.deadline,
    `B3a: obie jednostki z flagą ${JSON.stringify(f1)} — termin = chwila wczytania (${loadYear.toFixed(4)}) + 0,5`);
  const mine = ordered.filter(e => e.planetId === w.col.planetId);
  const jr = (w.K.eventLogSystem?.getEntries?.() ?? []).filter(e => /⚑/.test(e.text) && e.channel === 'diplomacy');
  assert(mine.length === 1 && mine[0].count === 2 && mine[0].reason === 'load' && jr.length === 1,
    `B3a: JEDEN meldunek na ciało (${mine.length}, jednostek ${mine[0]?.count}, powód ${mine[0]?.reason}) i jeden wpis w Dzienniku (${jr.length})`);
  const fo = w.gum.getUnit(s.pOld.id)?.withdrawal ?? null;
  assert(!!fo && fo.deadline === 0.4 && fo.orderedYear === 0,
    `B3b kontrola: bez dublowania — flaga już obecna zostaje z WŁASNYM terminem (${fo?.deadline}), nie dostaje drugiego`);
  const pc = w.gum.getUnit(s.pCargo.id), ph = w.gum.getUnit(s.pHome.id), pw = s.pWar ? w.gum.getUnit(s.pWar.id) : null;
  assert(!pc?.withdrawal && !ph?.withdrawal && !!s.pWar && !pw?.withdrawal && w.dipl.getStatus(s.emp2) === 'war',
    `B3c kontrola: bez flagi — w ładowni (${!!pc?.withdrawal}), na własnym ciele (${!!ph?.withdrawal}), na ciele ${s.emp2} w WOJNIE (${!!pw?.withdrawal})`);
  run(w, 2);
  const again = ordered.filter(e => e.planetId === w.col.planetId);
  assert(again.length === 1 && w.gum.getUnit(s.p1.id)?.withdrawal?.deadline === f1?.deadline,
    `B3d: uzgodnienie jednorazowe — kolejne ticki bez nowych meldunków (${again.length}) i bez zmiany terminu`);
}
{
  console.log('\nB3e — kontrola: sesja BEZ wczytania (nowa gra, sceny keeperów) — jednostki w pokoju na ciele imperium nie dostają flagi');
  const s = oldSaveScene();
  run(s.w, 3);
  assert(!s.w.gum.getUnit(s.p1.id)?.withdrawal && !s.w.gum.getUnit(s.p2.id)?.withdrawal && !!s.w.gum.getUnit(s.p1.id),
    'B3e: bez uzbrojenia przy wczytaniu flagi nie ma (uzgodnienie należy do WCZYTANIA, nie do pierwszego ticku sesji)');
}
{
  console.log('\nB3f — pin źródłowy GameScene: uzbrojenie uzgodnienia stoi w bloku wczytania, PO odtworzeniu jednostek');
  const gs = src('../../scenes/GameScene.js');
  const iRes = gs.indexOf('this.groundUnitManager.restore(c4x.groundUnitManager)');
  const iArm = gs.search(/this\.withdrawalSystem\??\.armLoadReconcile\??\.?\(\s*\)/);
  assert(iRes > 0 && iArm > iRes && iArm - iRes < 600,
    `B3f: armLoadReconcile wołane zaraz po groundUnitManager.restore (${iRes} < ${iArm})`);
  assert(iRes > 0 && gs.indexOf('this.groundUnitManager.restore(', iRes + 1) < 0,
    'B3f kontrola pinu: jedno odtworzenie jednostek w scenie — pin wskazuje właściwe miejsce');
}

// ── B4 — F6: nazwa imperium we wpisach wycofania ──────────────────────────────────────────
{
  console.log('\nB4a — pokój (prawdziwe offerPeace) przy wywiadzie poniżej detailed: wpis wycofania nazywa imperium jak wpis pokoju');
  const w = boot();
  declare(w);
  playerUnit(w, w.col.planetId, freeTiles(w, w.col, { building: false })[0]);
  const emp = w.emp;
  const rec = w.K.empireRegistry?.get?.(emp);
  const name = rec?.namePL ?? rec?.name ?? null;              // źródło i reguła wpisu pokoju (`UIManager._empName`)
  const detailed = w.K.intelSystem?.isAtLeast?.(emp, 'detailed') === true;
  const ok = signPeace(w);
  const ord = (w.K.eventLogSystem?.getEntries?.() ?? []).filter(e => /⚑/.test(e.text) && e.channel === 'diplomacy');
  assert(ok === true && !detailed && !!name && ord.length === 1,
    `świadek: pokój przyjęty, wywiad o ${emp} poniżej detailed (stara reguła ukryłaby nazwę), jeden wpis wycofania (${ord.length})`);
  assert(ord.length === 1 && ord[0].text.includes(name) && !ord[0].text.includes(t('intel.unknownEmpire')),
    `B4a: wpis wycofania nazywa imperium „${name}”, bez „${t('intel.unknownEmpire')}” (${ord[0]?.text})`);
  const fn = ENmod?.empireLogName;
  assert(typeof fn === 'function' && fn(emp) === name && fn(null) === '?' && fn('emp_nie_ma') === 'emp_nie_ma',
    'B4b: EmpireName.empireLogName — jedno źródło nazwy imperium w meldunkach o traktacie (namePL ?? name ?? id ?? „?”)');
  // Mgła wojny dla OBSERWACJI imperium (mobilizacja W2-7, utrata kafli) zostaje w NotificationCenter._empireLabel.
  assert(w.K.notificationCenter._empireLabel(emp) === t('intel.unknownEmpire'),
    'B4d kontrola: reguła mgły wojny dla obserwacji imperium (_empireLabel, detailed) nietknięta');
}
{
  console.log('\nB4b — pin źródłowy UIManager: wpis pokoju bierze nazwę z tego samego źródła (EmpireName.empireLogName)');
  const um = src('../../scenes/UIManager.js');
  const iDef = um.search(/const\s+_empName\s*=/);
  const def = iDef >= 0 ? um.slice(iDef, um.indexOf(';', iDef) + 1) : '';
  assert(/import\s*\{\s*empireLogName\s*\}\s*from\s*'\.\.\/utils\/EmpireName\.js'/.test(um)
      && /empireLogName\s*\(/.test(def) && !/namePL/.test(def),
    `B4b: UIManager._empName deleguje do empireLogName, bez własnej kopii wyrażenia (${def.replace(/\s+/g, ' ').slice(0, 90)})`);
  const iPeace = um.indexOf("EventBus.on('diplomacy:peaceSigned'");
  assert(iDef >= 0 && iPeace > 0 && /_empName\(\s*empireId\s*\)/.test(um.slice(iPeace, iPeace + 400)),
    'B4b kontrola pinu: wpis pokoju (diplomacy:peaceSigned) woła _empName — pin celuje w żywą ścieżkę');
}
{
  console.log('\nB4c — gramatyka: polski wpis wycofania po „z” poprawny dla każdej nazwy; angielski bez zmian');
  const prev = getLocale();
  setLocale('pl');
  const pl = t('event.withdrawal.ordered', 'Liga Trzech Słońc', 2, 'Thuban d', '07/01/121');
  setLocale('en');
  const en = t('event.withdrawal.ordered', 'Liga Trzech Słońc', 2, 'Thuban d', '07/01/121');
  setLocale(prev);
  assert(pl.includes('z imperium Liga Trzech Słońc') && !/\bz Liga\b/.test(pl),
    `B4c: PL — „z imperium {0}” (nazwa w mianowniku jako dopowiedzenie): ${pl}`);
  assert(en.startsWith('⚑ Peace with Liga Trzech Słońc'), `B4c kontrola: EN bez zmian — ${en}`);
}

// ── B5 — F4 #367: wpisy w Dzienniku dla R4 i R7 ───────────────────────────────────────────
const journalAt = (w, channel, re) => (w.K.eventLogSystem?.getEntries?.() ?? []).filter(e => e.channel === channel && re.test(e.text));
const reEsc = (s) => new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
{
  console.log('\nB5a — R4: pokój zdejmuje jednostki AI z kolonii gracza — wpis w Dzienniku (Dyplomacja): kto, ile, z którego ciała');
  const w = boot();
  declare(w);
  const tH = freeTiles(w, w.home, { building: false });
  const a1 = aiUnit(w, w.emp, w.home.planetId, tH[0]);
  const a2 = aiUnit(w, w.emp, w.home.planetId, tH[1]);
  const rec = w.K.empireRegistry?.get?.(w.emp);
  const empName = rec?.namePL ?? rec?.name;
  const bodyName = EntityManager.get(w.home.planetId)?.name;
  const ok = signPeace(w);
  const audit = debugLog.query({ kind: 'withdrawal:aiRemoved' });
  assert(ok === true && !!a1 && !!a2 && !w.gum.getUnit(a1.id) && !w.gum.getUnit(a2.id) && audit.length === 1 && audit[0].data?.count === 2,
    `świadek: pokój przyjęty, dwie jednostki ${w.emp} zdjęte z kolonii gracza (audyt aiRemoved: ${audit.length}, ${audit[0]?.data?.count})`);
  const e = journalAt(w, 'diplomacy', reEsc(bodyName)).filter(x => x.text.includes(empName));
  assert(e.length === 1 && /\b2\b/.test(e[0].text) && e[0].text !== 'event.withdrawal.aiRemoved',
    `B5a: JEDEN wpis (Dyplomacja) z nazwą strony traktatu, liczbą jednostek i ciałem: ${e[0]?.text ?? '—'}`);
}
{
  console.log('\nB5b — R7: ciało z kolonią zniszczone (EntityManager.remove — encji już nie ma) — wpis (Walka) z NAZWĄ ciała, nie id');
  const w = boot();
  declare(w);
  const land = freeTiles(w, w.col, { building: false });
  const u = playerUnit(w, w.col.planetId, land[0]);
  const ai = aiUnit(w, w.emp, w.col.planetId, land[1]);
  const bodyName = EntityManager.get(w.col.planetId)?.name;
  quiet(() => EntityManager.remove(w.col.planetId));
  await new Promise((r) => queueMicrotask(r));         // po mikrozadaniu ColonyManagera (`colony:destroyed`)
  const audit = debugLog.query({ kind: 'garrison:unitsRemoved' }).filter(x => x.data?.planetId === w.col.planetId);
  assert(!EntityManager.get(w.col.planetId) && !w.cm.getColony(w.col.planetId) && !w.gum.getUnit(u.id) && !w.gum.getUnit(ai?.id)
      && audit.length === 2 && !!bodyName && bodyName !== w.col.planetId,
    `świadek: ciało ${w.col.planetId} („${bodyName}”) i kolonia usunięte, jednostka gracza i ${w.emp} zniknęły (audyt: ${audit.length})`);
  const e = journalAt(w, 'combat', reEsc(bodyName));
  const raw = journalAt(w, 'combat', reEsc(w.col.planetId));
  assert(e.length === 1 && /\b1\b/.test(e[0].text) && raw.length === 0,
    `B5b: JEDEN wpis (Walka) z nazwą ciała i liczbą 1 — bez surowego id (${e[0]?.text ?? '—'})`);
  assert(audit.some(x => (x.data?.owners ?? []).every(o => o && o !== 'player')) && e.length <= 1,
    `B5b kontrola: jednostki AI usunięte z tym samym ciałem (osobny ślad audytu) NIE dają drugiego wpisu (${e.length} ≤ 1)`);
  assert(audit.every(x => x.data?.bodyName === bodyName),
    `B5b: ślad audytu niesie nazwę ciała (${JSON.stringify(audit.map(x => x.data?.bodyName))})`);
}
{
  console.log('\nB5c — R7: ciało BEZ kolonii zniszczone — wpis (Walka) z nazwą ciała');
  const w = boot();
  const sys = EntityManager.get(w.home.planetId)?.systemId;
  const b1 = ['moon', 'planet', 'planetoid'].flatMap(tp => EntityManager.getByType(tp))
    .find(b => b.systemId === sys && b.id !== w.home.planetId && !w.cm.getColony(b.id));
  const u = playerUnit(w, b1?.id, { q: 0, r: 0 });
  const bodyName = b1?.name;
  quiet(() => EntityManager.remove(b1.id));
  assert(!!b1 && !EntityManager.get(b1.id) && !w.gum.getUnit(u.id) && !!bodyName,
    `świadek: ciało bez kolonii ${b1?.id} („${bodyName}”) usunięte, jednostka gracza zniknęła`);
  const e = journalAt(w, 'combat', reEsc(bodyName));
  assert(e.length === 1 && /\b1\b/.test(e[0].text) && journalAt(w, 'combat', reEsc(b1.id)).length === 0,
    `B5c: JEDEN wpis (Walka) z nazwą ciała (${e[0]?.text ?? '—'})`);
}

// ── B6 — F5: meldunek o utracie wojsk w terminie ─────────────────────────────────────────
/** Plakietka dzwonka tak, jak rysuje ją gra (`BottomControlBar._drawBell`) — tekst liczby albo '' bez plakietki. */
function bellBadge() {
  const sink = [];
  const ctx = new Proxy({}, { get: (o, k) => k === 'measureText' ? (() => ({ width: 10 }))
    : k === 'fillText' ? ((s) => sink.push(String(s))) : (k in o ? o[k] : (o[k] = () => {})),
    set: (o, k, v) => { o[k] = v; return true; } });
  new BottomControlBar()._drawBell(ctx, { x: 0, y: 0, w: 24, h: 20 }, 10);
  return sink.filter(s => s !== '🔔').join('');
}
/** Lista dzwonka tak, jak renderuje ją gra (`NotificationDropdown`, atrapa DOM z env.js) — surowy HTML. */
function bellListHtml() {
  ND.openNotificationDropdown({ anchorX: 100, scale: 1, barH: 30 });
  const root = document.body.children.find(el => el.className === 'kosmos-notification-dropdown');
  const html = String(root?.innerHTML ?? '');
  ND.closeNotificationDropdown();
  return html;
}
{
  console.log('\nB6a — termin wycofania na dwóch ciałach: JEDEN wpis w Dzienniku i JEDEN w dzwonku na ciało (nazwa ciała, liczba)');
  const w = boot();
  const col2 = w.aiFull.find(c => c.ownerEmpireId && c.ownerEmpireId !== w.emp);
  const emp2 = col2?.ownerEmpireId;
  declare(w); declare(w, emp2);
  const l1 = freeTiles(w, w.col, { building: false });
  const l2 = freeTiles(w, col2, { building: false });
  const a1 = playerUnit(w, w.col.planetId, l1[0]), a2 = playerUnit(w, w.col.planetId, l1[1]);
  const b1 = playerUnit(w, col2.planetId, l2[0]);
  const ok1 = signPeace(w), ok2 = signPeace(w, emp2);
  const n1 = EntityManager.get(w.col.planetId)?.name, n2 = EntityManager.get(col2.planetId)?.name;
  let badgeBefore = null, badgeAfter = null, cntBefore = null, cntAfter = null, goneAt = null;
  for (let y = 1; y <= 7; y++) {
    run(w, 1);
    if (y === 5) { badgeBefore = bellBadge(); cntBefore = w.K.notificationCenter.getActiveCount(); }
    if (goneAt === null && !w.gum.getUnit(a1.id) && !w.gum.getUnit(b1.id)) {
      goneAt = y; badgeAfter = bellBadge(); cntAfter = w.K.notificationCenter.getActiveCount();
    }
  }
  assert(ok1 === true && ok2 === true && goneAt === 6 && !w.gum.getUnit(a2.id) && !!n1 && !!n2,
    `świadek: pokój z ${w.emp} i ${emp2} w tej samej chwili; termin usunął 2 jednostki z „${n1}” i 1 z „${n2}” w ${goneAt}. civY`);
  const lost = w.K.notificationCenter.getActive().filter(n => n.type === 'withdrawalExpired');
  const forBody = (pid) => lost.filter(n => n.payload?.planetId === pid);
  assert(lost.length === 2 && forBody(w.col.planetId).length === 1 && forBody(col2.planetId).length === 1,
    `B6a: dzwonek — JEDEN meldunek o utracie na ciało (${lost.length}: ${lost.map(n => n.title).join(' | ')})`);
  const t1 = forBody(w.col.planetId)[0], t2 = forBody(col2.planetId)[0];
  assert(!!t1 && t1.title.includes(n1) && /\b2\b/.test(t1.subtitle) && !!t2 && t2.title.includes(n2) && /\b1\b/.test(t2.subtitle),
    `B6a: meldunek nazywa ciało i liczbę utraconych („${t1?.title}” / „${t1?.subtitle}”; „${t2?.title}” / „${t2?.subtitle}”)`);
  const j1 = (w.K.eventLogSystem?.getEntries?.() ?? []).filter(e => e.text === t('event.withdrawal.expired', 2, n1) && e.channel === 'combat');
  const j2 = (w.K.eventLogSystem?.getEntries?.() ?? []).filter(e => e.text === t('event.withdrawal.expired', 1, n2) && e.channel === 'combat');
  assert(j1.length === 1 && j2.length === 1,
    `B6a kontrola: Dziennik — JEDEN wpis o utracie na ciało (${j1.length}, ${j2.length}), bez podwójnego zapisu`);
  assert(cntBefore >= 2 && badgeBefore === String(cntBefore) && badgeAfter === String(cntAfter) && cntAfter - cntBefore >= 2,
    `B6b: plakietka dzwonka, jak ją rysuje gra — przed terminem ${badgeBefore}, w ticku terminu ${badgeAfter} (przyrost ≥ 2: meldunki o utracie)`);
  const html = bellListHtml();
  assert(html.includes(t('notif.group.withdrawalExpired')) && html.includes(t1?.title ?? '∅') && html.includes(t2?.title ?? '∅'),
    `B6b: lista dzwonka (NotificationDropdown) pokazuje grupę „${t('notif.group.withdrawalExpired')}” i oba meldunki`);
  assert(t('notif.group.withdrawalExpired') !== 'notif.group.withdrawalExpired' && t('notif.withdrawalExpiredTitle', 'X') !== 'notif.withdrawalExpiredTitle',
    'B6b: klucze meldunku istnieją (bez surowego klucza w UI)');
}
{
  console.log('\nB6c — wysoka prędkość czasu: ostrzeżenie i termin TEGO SAMEGO ciała w jednym ciągu ticków — utrata nie ginie w deduplikacji');
  const w = boot();
  declare(w);
  const u = playerUnit(w, w.col.planetId, freeTiles(w, w.col, { building: false })[0]);
  const ok = signPeace(w);
  const t0 = Date.now();
  run(w, 7);                                            // ostrzeżenie (5. civY) i termin (6.) w kilkudziesięciu ms czasu realnego
  const dt = Date.now() - t0;
  const warn = w.K.notificationCenter.getActive().filter(n => n.type === 'withdrawalWarning' && n.payload?.planetId === w.col.planetId);
  const lost = w.K.notificationCenter.getActive().filter(n => n.type === 'withdrawalExpired' && n.payload?.planetId === w.col.planetId);
  assert(ok === true && !w.gum.getUnit(u.id) && warn.length === 1,
    `świadek: pokój, ostrzeżenie w dzwonku (${warn.length}), jednostka usunięta w terminie; 7 civY w ${dt} ms czasu realnego`);
  assert(lost.length === 1,
    `B6c: meldunek o utracie w dzwonku mimo ostrzeżenia tego samego ciała tuż przed nim (${lost.length})`);
}
{
  console.log('\nB6d — kontrola: jednostka załadowana przed terminem — flaga zdjęta, bez meldunku o utracie');
  const w = boot();
  declare(w);
  const u = playerUnit(w, w.col.planetId, freeTiles(w, w.col, { building: false })[0]);
  const ok = signPeace(w);
  const v = w.K.vesselManager.createAndRegister('hull_small', w.home.planetId);
  v.troopCapacity = 12; v.troopBayUsed = 0; v.groundUnits = [];
  const loaded = VS.loadGroundUnit(v, u)?.ok === true;
  run(w, 7);
  const lost = w.K.notificationCenter.getActive().filter(n => n.type === 'withdrawalExpired');
  const j = (w.K.eventLogSystem?.getEntries?.() ?? []).filter(e => e.channel === 'combat' && /⚑/.test(e.text));
  assert(ok === true && loaded && !!w.gum.getUnit(u.id) && !w.gum.getUnit(u.id)?.withdrawal && lost.length === 0 && j.length === 0,
    `B6d kontrola: załadowana jednostka żyje bez flagi; meldunków o utracie: dzwonek ${lost.length}, Dziennik ${j.length}`);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
