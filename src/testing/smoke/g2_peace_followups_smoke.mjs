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
import { isStandableTile } from '../../data/GroundUnitData.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { CombatSystem } from '../../systems/CombatSystem.js';
import { EventLogSystem } from '../../systems/EventLogSystem.js';
import { NotificationCenter } from '../../systems/NotificationCenter.js';
import * as TO from '../../utils/TileOwnership.js';
import { readFileSync } from 'node:fs';
import { t } from '../../i18n/i18n.js';
import * as FA from '../../data/FleetActions.js';
import * as VS from '../../entities/Vessel.js';

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

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
