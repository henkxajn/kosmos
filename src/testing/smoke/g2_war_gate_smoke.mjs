// G2-2 — AI GARRISON: BRAMKA WOJNY (D13; Findingi 317, 337, 338, 339).
//
// D13: każde lądowanie jednostki naziemnej GRACZA na ciele należącym do INNEGO imperium — kapsuły
// desantowe, „Wyładuj” z ładowni, away team — wymaga WOJNY z właścicielem ciała, sprawdzanej W CHWILI
// LĄDOWANIA. Ciała niczyje i własne są zwolnione; rozejm i pakt o nieagresji blokują (to nie wojna).
// `launchInvasion` (AI) dostaje to samo sprawdzenie. OBA predykaty przejęcia wymagają wojny między
// zdobywcą a właścicielem. Źródło prawdy: status relacji `'war'` (nie rekord wojny). Ładowanie wojsk
// na statki — zawsze dozwolone. Spawny debugowe — zwolnione.
//
//   W0  jeden predykat (`src/utils/WarGate.js`): tabela stanów — niczyje, własne, wojna, pokój, rozejm,
//       NAP, brak rekordu relacji, strona AI, brak systemu dyplomacji (fail-closed dla obcego ciała).
//   W1  pokój: każda ścieżka lądowania gracza na ciało AI odmawia i na ciele NIE pojawia się jednostka
//       (przed naprawą: ląduje). Kontrola: spawn debugowy (`createUnit`) nie jest bramkowany.
//   W2  wojna: każda ścieżka działa jak przed zmianą.
//   W3  rozejm i NAP: odmowa.
//   W4  ciało niczyje i własne: dozwolone w pokoju.
//   W5  pokój: jednostka gracza stojąca na kolonii AI bez obrońcy NIE przejmuje jej — szturmowiec
//       i łazik badawczy (Finding 337) (przed naprawą: przejmuje); wojna: przejmuje jak dotąd.
//   W6  strona AI: `launchInvasion` odmawia w pokoju (z meldunkiem `invasion:blocked`), ląduje w wojnie;
//       predykat przejęcia AI wymaga wojny.
//   W7  ładowanie wojsk z obcego ciała w pokoju — dozwolone.
//   W8  ciało, które zmienia właściciela w czasie transportu wojsk, oceniane jest wg właściciela
//       W CHWILI LĄDOWANIA.
//   W9  ścieżki DOM (ColonyOverlay: zrzut i away team; CargoLoadModal: „Wyładuj”) — piny źródłowe:
//       wołają bramkę i pokazują powód przez i18n. Co pokazuje dopiero przeglądarka — w raporcie bramki.
//   W10 i18n: powód odmowy istnieje w PL i EN.
//
// ⚠ Ścieżki DOM (`ColonyOverlay`, `CargoLoadModal`) nie są tu wykonywane: `ColonyOverlay` nie importuje
//   się pod node (`THREE.TextureLoader`), a modal ładowni to czysty DOM. Wykonaniem pinujemy funkcje,
//   które one wołają (`dropTroop`, `unloadGroundUnit`, `VesselManager.deployAwayTeam`, `canExecute`).
// ⚠ Moduł bramki ładowany DYNAMICZNIE: przed naprawą go nie ma, a import statyczny wywróciłby cały plik
//   i żaden pin nie dostałby koloru (lekcja „pin musi degradować, nie przerywać”).
// ⚠ Każdy pin wykluczający ma ŚWIADKA (jednostka istnieje, jest w ładowni, ciało ma właściciela),
//   inaczej przechodziłby jałowo na pustym zbiorze.

import '../headless/env.js';           // MUSI być pierwszy
import EntityManager from '../../core/EntityManager.js';
import EventBus from '../../core/EventBus.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { loadGroundUnit, unloadGroundUnit, dropTroop } from '../../entities/Vessel.js';
import { FLEET_ACTIONS } from '../../data/FleetActions.js';
import plDict from '../../i18n/pl.js';
import enDict from '../../i18n/en.js';
import { readFileSync } from 'node:fs';

let WG = null;
try { WG = await import('../../utils/WarGate.js'); } catch { WG = null; }

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const REASON_KEY = 'fleet.reason.notAtWar';
const reasonPL = plDict[REASON_KEY] ?? null;

// ── Harness ──────────────────────────────────────────────────────────────────────────────

function world() {
  // `bootWithDirector` odsiewa PRNG i czyści `gameState` przed KAŻDYM bootem — ten sam świat w każdym
  // bloku. Domyślne ziarno: kolonie AI entity_79 (emp_001) i entity_188 (emp_002), relacje gracz–AI
  // `peace`, brak rekordu relacji AI–AI (zmierzone przy pisaniu pliku).
  const { core, K, ticker } = bootWithDirector({ quiet: true });
  const cm = core.colonyManager;
  const aiFull = cm.getAllColonies().filter(c => c.ownerEmpireId && !c.isOutpost);
  return {
    core, K, cm, ticker,
    gum: K.groundUnitManager, vm: K.vesselManager, inv: K.invasionSystem, dipl: K.diplomacySystem,
    rel: K.diplomacySystem.relations,
    home: cm.getColony(K.homePlanet.id),
    aiFull,
  };
}

const capitalOf = (col) => col?.grid?.toArray?.().find(t => t?.capitalBase) ?? null;
const landTile  = (col, not = []) => col?.grid?.toArray?.()
  .find(t => t && t.type !== 'ocean' && !t.capitalBase && !not.some(n => n.q === t.q && n.r === t.r)) ?? null;
const unitsOn   = (w, planetId) => w.gum.getUnitsOnPlanet(planetId);
const isOnBody  = (w, planetId, unitId) => unitsOn(w, planetId).some(u => u.id === unitId);

/** Statek desantowy gracza z modułem away team, zadokowany w domu. */
function playerShip(w) {
  const v = w.vm.createAndRegister('hull_small', w.home.planetId);
  v.canDropTroops = true;
  v.troopCapacity = 12;
  v.troopBayUsed  = 0;
  v.groundUnits   = [];
  v.modules       = [...(v.modules ?? []), 'science_away_team'];
  v.status        = 'idle';
  return v;
}

/** Jednostka gracza utworzona w domu i załadowana na statek (prawdziwe `loadGroundUnit`). */
function loadedUnit(w, v, archetypeId = 'shock_infantry') {
  const t = landTile(w.home);
  const u = w.gum.createUnit(archetypeId, w.home.planetId, t.q, t.r, { owner: 'player', factionId: 'humanity' });
  const res = loadGroundUnit(v, u);
  return { u, loaded: res?.ok === true && u.status === 'in_cargo' && v.groundUnits.includes(u.id) };
}

/** Statek „dolatuje” na orbitę ciała (stan, w którym gracz klika zrzut / away team / ładownię). */
function orbit(v, bodyId) {
  v.position = { ...v.position, state: 'orbiting', dockedAt: bodyId };
  v.status = 'idle';
}

const actState = (w) => ({ colonyManager: w.cm, vesselManager: w.vm });
const canDrop  = (w, v) => FLEET_ACTIONS.drop_troops.canExecute(v, actState(w));
const canAway  = (w, v) => FLEET_ACTIONS.send_away_team.canExecute(v, actState(w));
const refusedForWar = (r) => r?.ok === false && !!reasonPL && r.reason === reasonPL;

/** Ciało bez kolonii w układzie imperium AI (planetoida). */
function unownedBody(w, empireId) {
  const sysId = w.K.empireRegistry.get(empireId)?.homeSystemId;
  return (EntityManager.getByTypeInSystem('planetoid', sysId) ?? []).find(b => !w.cm.getColony(b.id)) ?? null;
}

/**
 * Wszystkie trzy ścieżki lądowania gracza na ciało `bodyId` (każda na świeżym statku i jednostce):
 * kapsuły (`canExecute` + `dropTroop`), „Wyładuj” (`unloadGroundUnit`), away team (`canExecute` +
 * `deployAwayTeam`). Zwraca, co się stało.
 */
function tryAllPaths(w, bodyId, q, r) {
  const out = {};
  // Kapsuły desantowe
  {
    const v = playerShip(w);
    const { u, loaded } = loadedUnit(w, v);
    orbit(v, bodyId);
    out.dropCan = canDrop(w, v);
    out.drop = dropTroop(v, u, bodyId, q, r);
    out.dropLanded = isOnBody(w, bodyId, u.id);
    out.dropInHold = u.status === 'in_cargo' && v.groundUnits.includes(u.id);
    out.dropWitness = loaded;
  }
  // „Wyładuj” z ładowni
  {
    const v = playerShip(w);
    const { u, loaded } = loadedUnit(w, v);
    orbit(v, bodyId);
    out.unload = unloadGroundUnit(v, u, bodyId, q, r);
    out.unloadLanded = isOnBody(w, bodyId, u.id);
    out.unloadInHold = u.status === 'in_cargo' && v.groundUnits.includes(u.id);
    out.unloadWitness = loaded;
  }
  // Away team
  {
    const v = playerShip(w);
    orbit(v, bodyId);
    out.awayCan = canAway(w, v);
    const before = unitsOn(w, bodyId).filter(x => x.type === 'science_rover').length;
    out.away = w.vm.deployAwayTeam(v.id, bodyId, q, r);
    out.awayLanded = unitsOn(w, bodyId).filter(x => x.type === 'science_rover').length - before;
    out.awayTeamId = v.awayTeamUnitId ?? null;
  }
  return out;
}

// ── W0 — jeden predykat ──────────────────────────────────────────────────────────────────
{
  console.log('\nW0 — predykat bramki wojny (src/utils/WarGate.js): tabela stanów');
  const has = !!WG && typeof WG.warGateRefusal === 'function' && typeof WG.areAtWar === 'function' &&
              typeof WG.bodyOwnerOf === 'function';
  assert(has && WG.NOT_AT_WAR === 'not_at_war',
    `W0a: moduł eksportuje warGateRefusal, areAtWar, bodyOwnerOf i NOT_AT_WAR (${has ? 'jest' : 'brak'})`);
  const R = (a, p) => has ? WG.warGateRefusal(a, p) : 'BRAK';
  const w = world();
  const [c1, c2] = w.aiFull;
  const e1 = c1.ownerEmpireId, e2 = c2.ownerEmpireId;
  const free = unownedBody(w, e1);
  assert(!!free && e1 === 'emp_001' && e2 === 'emp_002' && w.rel.getStatus('player', e1) === 'peace' &&
         !w.rel.has(e1, e2),
    `świadek: ciało niczyje ${free?.id}, kolonie ${c1.planetId} (${e1}) i ${c2.planetId} (${e2}); gracz–${e1} peace; brak rekordu ${e1}–${e2}`);
  assert(has && WG.bodyOwnerOf(c1.planetId) === e1 && WG.bodyOwnerOf(w.home.planetId) === 'player' &&
         WG.bodyOwnerOf(free?.id) === null && WG.bodyOwnerOf(null) === null,
    `W0b: bodyOwnerOf — kolonia AI ⇒ imperium, kolonia gracza ⇒ 'player', ciało bez kolonii ⇒ null`);
  assert(R('player', free?.id) === null && R('player', w.home.planetId) === null,
    `W0c: ciało niczyje i własne — zwolnione (${R('player', free?.id)}, ${R('player', w.home.planetId)})`);
  assert(R('player', c1.planetId) === 'not_at_war',
    `W0d: ciało AI w pokoju ⇒ not_at_war (${R('player', c1.planetId)})`);
  w.dipl.declareWar(e1, 'g2_2_w0');
  assert(w.dipl.getStatus(e1) === 'war' && R('player', c1.planetId) === null && R(e1, w.home.planetId) === null,
    `W0e: wojna ⇒ zwolnione w OBIE strony (gracz→${e1}: ${R('player', c1.planetId)}, ${e1}→gracz: ${R(e1, w.home.planetId)})`);
  assert(R('player', c2.planetId) === 'not_at_war',
    `W0f: wojna z ${e1} nie otwiera ciał ${e2} (${R('player', c2.planetId)})`);
  w.rel.setStatus('player', e1, 'truce', { truceUntilYear: 999 }, 'g2_2_w0');
  assert(R('player', c1.planetId) === 'not_at_war' && R(e1, w.home.planetId) === 'not_at_war',
    `W0g: rozejm ⇒ not_at_war w obie strony (${R('player', c1.planetId)})`);
  w.rel.setStatus('player', e1, 'peace', {}, 'g2_2_w0');
  w.rel.addTreaty('player', e1, { id: 'non_aggression' });
  assert(w.rel.hasTreaty('player', e1, 'non_aggression') && R('player', c1.planetId) === 'not_at_war',
    `W0h: pakt o nieagresji ⇒ not_at_war (${R('player', c1.planetId)})`);
  let threw = false, r12 = null;
  try { r12 = R(e1, c2.planetId); } catch { threw = true; }
  assert(!threw && r12 === 'not_at_war' && (has ? WG.areAtWar(e1, e2) === false : false),
    `W0i: strona AI — ${e1} na ciele ${e2} bez rekordu relacji ⇒ not_at_war, bez wyjątku (${r12})`);
  assert(has && WG.areAtWar('player', 'player') === false && WG.areAtWar(null, e1) === false &&
         WG.areAtWar('player_legacy', e1) === false,
    'W0j: areAtWar nie rzuca na złe id (to samo id, null, stary klucz) — false');
  const dip = window.KOSMOS.diplomacySystem;
  window.KOSMOS.diplomacySystem = null;
  const noDip = [R('player', c1.planetId), R('player', w.home.planetId), R('player', free?.id)];
  window.KOSMOS.diplomacySystem = dip;
  assert(noDip[0] === 'not_at_war' && noDip[1] === null && noDip[2] === null,
    `W0k: bez systemu dyplomacji obce ciało ⇒ not_at_war (fail-closed); własne i niczyje dalej zwolnione (${noDip.map(String).join(', ')})`);
}

// ── W1 — pokój: każda ścieżka lądowania gracza na ciało AI odmawia ──────────────────────
{
  console.log('\nW1 — pokój: kapsuły, „Wyładuj” i away team na ciało AI — odmowa, na ciele brak jednostki');
  const w = world();
  const col = w.aiFull[0];
  const emp = col.ownerEmpireId;
  const t = landTile(col);
  assert(w.dipl.getStatus(emp) === 'peace' && !!t && unitsOn(w, col.planetId).length === 0,
    `świadek: ${col.planetId} (${emp}) w pokoju, kafel lądowy (${t?.q},${t?.r}), 0 jednostek na ciele`);
  const o = tryAllPaths(w, col.planetId, t.q, t.r);
  assert(o.dropWitness && o.unloadWitness, 'świadek: jednostki załadowane prawdziwym loadGroundUnit (in_cargo, w ładowni)');
  assert(refusedForWar(o.dropCan),
    `W1a: drop_troops.canExecute ⇒ odmowa z powodem „${reasonPL}” (${JSON.stringify(o.dropCan)})`);
  assert(o.drop?.ok === false && o.drop?.reason === 'not_at_war' && !o.dropLanded && o.dropInHold,
    `W1b: dropTroop ⇒ not_at_war, jednostka zostaje w ładowni (${JSON.stringify(o.drop)}, na ciele: ${o.dropLanded})`);
  assert(o.unload === false && !o.unloadLanded && o.unloadInHold,
    `W1c: unloadGroundUnit („Wyładuj”) ⇒ false, jednostka zostaje w ładowni (wynik ${o.unload}, na ciele: ${o.unloadLanded})`);
  assert(refusedForWar(o.awayCan),
    `W1d: send_away_team.canExecute ⇒ odmowa z powodem „${reasonPL}” (${JSON.stringify(o.awayCan)})`);
  assert(o.away?.ok === false && o.away?.reason === 'not_at_war' && o.awayLanded === 0 && o.awayTeamId === null,
    `W1e: deployAwayTeam ⇒ not_at_war, łazik nie ląduje (${JSON.stringify(o.away)}, łazików: +${o.awayLanded})`);
  // Kontrola: spawn debugowy NIE jest lądowaniem — D13 go nie bramkuje.
  const dbg = w.gum.createUnit('shock_infantry', col.planetId, t.q, t.r, { owner: 'player', factionId: 'humanity' });
  assert(!!dbg && isOnBody(w, col.planetId, dbg.id),
    'W1 kontrola: spawn debugowy (createUnit) na ciele AI w pokoju — jednostka powstaje (spawny zwolnione)');
}

// ── W2 — wojna: każda ścieżka działa jak przed zmianą ───────────────────────────────────
{
  console.log('\nW2 — wojna: kapsuły, „Wyładuj” i away team na ciało AI — działają');
  const w = world();
  const col = w.aiFull[0];
  const emp = col.ownerEmpireId;
  const t = landTile(col);
  w.dipl.declareWar(emp, 'g2_2_w2');
  assert(w.dipl.getStatus(emp) === 'war', `świadek: wojna z ${emp} (status ${w.dipl.getStatus(emp)})`);
  const o = tryAllPaths(w, col.planetId, t.q, t.r);
  assert(o.dropCan?.ok === true && o.drop?.ok === true && o.dropLanded,
    `W2a: kapsuły — canExecute ok, dropTroop ok, jednostka na ciele (${JSON.stringify(o.dropCan)}, ${JSON.stringify(o.drop)})`);
  assert(o.unload === true && o.unloadLanded,
    `W2b: „Wyładuj” — jednostka na ciele (${o.unload})`);
  assert(o.awayCan?.ok === true && o.awayLanded === 1 && !!o.awayTeamId,
    `W2c: away team — canExecute ok, łazik ląduje (${JSON.stringify(o.awayCan)}, +${o.awayLanded})`);
}

// ── W3 — rozejm i NAP: odmowa ───────────────────────────────────────────────────────────
{
  console.log('\nW3 — rozejm i pakt o nieagresji: odmowa na każdej ścieżce');
  for (const mode of ['truce', 'nap']) {
    const w = world();
    const col = w.aiFull[0];
    const emp = col.ownerEmpireId;
    const t = landTile(col);
    if (mode === 'truce') w.rel.setStatus('player', emp, 'truce', { truceUntilYear: 999 }, 'g2_2_w3');
    else w.rel.addTreaty('player', emp, { id: 'non_aggression' });
    const st = w.dipl.getStatus(emp);
    assert(mode === 'truce' ? st === 'truce' : (st === 'peace' && w.dipl.hasTreaty(emp, 'non_aggression')),
      `świadek (${mode}): status ${st}${mode === 'nap' ? ', NAP podpisany' : ''}`);
    const o = tryAllPaths(w, col.planetId, t.q, t.r);
    assert(refusedForWar(o.dropCan) && o.drop?.reason === 'not_at_war' && !o.dropLanded &&
           o.unload === false && !o.unloadLanded &&
           refusedForWar(o.awayCan) && o.away?.reason === 'not_at_war' && o.awayLanded === 0,
      `W3 (${mode}): kapsuły, „Wyładuj” i away team — odmowa, na ciele brak jednostki ` +
      `(drop ${JSON.stringify(o.drop)}, unload ${o.unload}, away ${JSON.stringify(o.away)})`);
  }
}

// ── W4 — ciało niczyje i własne: dozwolone w pokoju ─────────────────────────────────────
{
  console.log('\nW4 — ciało niczyje i własne: dozwolone w pokoju');
  const w = world();
  const emp = w.aiFull[0].ownerEmpireId;
  const free = unownedBody(w, emp);
  assert(!!free && !w.cm.getColony(free.id) && w.dipl.getStatus(emp) === 'peace',
    `świadek: ciało niczyje ${free?.id} w układzie ${emp}, pokój`);
  const of = tryAllPaths(w, free.id, 0, 0);
  assert(o_ok(of) && of.dropCan?.ok === true && of.awayCan?.ok === true,
    `W4a: ciało niczyje — kapsuły, „Wyładuj” i away team lądują (drop ${JSON.stringify(of.drop)}, unload ${of.unload}, ` +
    `away ${JSON.stringify(of.away)})`);
  const ht = landTile(w.home);
  const oh = tryAllPaths(w, w.home.planetId, ht.q, ht.r);
  assert(o_ok(oh) && oh.dropCan?.ok === true && oh.awayCan?.ok === true,
    `W4b: własne ciało — kapsuły, „Wyładuj” i away team lądują (drop ${JSON.stringify(oh.drop)}, unload ${oh.unload})`);
}
function o_ok(o) {
  return o.drop?.ok === true && o.dropLanded && o.unload === true && o.unloadLanded && o.awayLanded === 1;
}

// ── W5 — przejęcie przez gracza wymaga wojny ────────────────────────────────────────────
/** Jednostka gracza stoi na kaflu stolicy kolonii AI (bez obrońców); prawdziwe ticki. */
function standOnCapital(war, archetypeId) {
  const w = world();
  const col = w.aiFull[0];
  const emp = col.ownerEmpireId;
  const cap = capitalOf(col);
  if (war) w.dipl.declareWar(emp, 'g2_2_w5');
  // Kształt Findingu 337: łazik (forma 4-argumentowa jak w `deployAwayTeam`) albo szturmowiec gracza.
  const u = archetypeId === 'science_rover'
    ? w.gum.createUnit('science_rover', col.planetId, cap.q, cap.r)
    : w.gum.createUnit(archetypeId, col.planetId, cap.q, cap.r, { owner: 'player', factionId: 'humanity' });
  if (u) u.homeColonyId = w.home.planetId;
  w.home.credits = 1e6;
  const defenders = unitsOn(w, col.planetId).filter(x => (x.owner ?? 'player') !== 'player').length;
  let at = null;
  for (let y = 1; y <= 14; y++) {
    w.ticker.run(1, { tickSize: 1.0 });
    if (!w.cm.getColony(col.planetId)?.ownerEmpireId) { at = y; break; }
  }
  return { col, emp, cap, u, defenders, status: w.dipl.getStatus(emp), took: at !== null, at,
           capOwner: cap.owner, unitAlive: !!w.gum.getUnit(u?.id) };
}
{
  console.log('\nW5 — pokój: jednostka gracza na stolicy AI bez obrońcy nie przejmuje (szturmowiec, łazik); wojna: przejmuje');
  for (const arch of ['shock_infantry', 'science_rover']) {
    const p = standOnCapital(false, arch);
    assert(!!p.u && p.unitAlive && p.defenders === 0 && p.status === 'peace',
      `świadek (${arch}, pokój): jednostka gracza na stolicy ${p.col.planetId} (${p.cap.q},${p.cap.r}), obrońców 0, status ${p.status}`);
    assert(p.took === false,
      `W5 (${arch}): w POKOJU kolonia AI nie przechodzi na gracza przez 14 civY ` +
      `(przejęta: ${p.took}${p.at ? ' w ' + p.at + '. civY' : ''}; kafel stolicy: ${p.capOwner ?? 'null'})`);
    const wr = standOnCapital(true, arch);
    assert(wr.status === 'war' && wr.defenders === 0 && wr.took === true,
      `W5 kontrola (${arch}, wojna): kolonia przechodzi na gracza (przejęta: ${wr.took}${wr.at ? ' w ' + wr.at + '. civY' : ''})`);
  }
}

// ── W6 — strona AI ───────────────────────────────────────────────────────────────────────
{
  console.log('\nW6 — strona AI: launchInvasion i predykat przejęcia AI wymagają wojny');
  const w = world();
  const emp = w.aiFull[0].ownerEmpireId;
  const blocked = [];
  EventBus.on('invasion:blocked', (e) => blocked.push(e));
  const enemyOnHome = () => unitsOn(w, w.home.planetId).filter(u => u.owner === emp).length;
  assert(w.dipl.getStatus(emp) === 'peace' && enemyOnHome() === 0,
    `świadek: ${emp} w pokoju z graczem, 0 jednostek ${emp} na ${w.home.planetId}`);
  const rp = w.inv.launchInvasion(emp, w.home.planetId, 2);
  const recP = w.inv.listAll().filter(i => i.planetId === w.home.planetId && i.aggressor === emp).length;
  assert(rp?.success === false && rp?.reason === 'not_at_war' && enemyOnHome() === 0 && recP === 0,
    `W6a: launchInvasion w POKOJU ⇒ not_at_war, 0 jednostek, 0 rekordów inwazji (${JSON.stringify(rp)}, rekordów ${recP})`);
  const bl = blocked.find(b => b.empireId === emp && b.reason === 'not_at_war');
  assert(!!bl && bl.planetId === w.home.planetId,
    `W6b: odmowa melduje invasion:blocked { reason: not_at_war } (śledzone przez DebugLog) (${JSON.stringify(bl ?? null)})`);
  w.dipl.declareWar(emp, 'g2_2_w6');
  // Przyrost, nie stan bezwzględny: przed naprawą W6a już wysadziło 2 jednostki, a ten pin jest
  // KONTROLĄ („w wojnie działa jak dotąd”) — ma być zielony po obu stronach.
  const beforeWar = enemyOnHome();
  const rw = w.inv.launchInvasion(emp, w.home.planetId, 2);
  assert(rw?.success === true && (rw?.landed?.length ?? 0) === 2 && enemyOnHome() - beforeWar === 2,
    `W6c kontrola: launchInvasion w WOJNIE ląduje 2 jednostki ${emp} (${JSON.stringify({ success: rw?.success, landed: rw?.landed?.length })})`);
  // Predykat przejęcia AI: aktywny rekord, stolica gracza w ręku AI, zero obrońców gracza.
  const hcap = capitalOf(w.home);
  hcap.owner = emp;
  const playerAlive = unitsOn(w, w.home.planetId).filter(u => (u.owner ?? 'player') === 'player').length;
  w.rel.setStatus('player', emp, 'peace', {}, 'g2_2_w6');
  w.inv._tickCaptureChecks(1);
  const ownerPeace = w.cm.getColony(w.home.planetId)?.ownerEmpireId ?? null;
  assert(playerAlive === 0 && w.inv.getInvasionForPlanet(w.home.planetId)?.aggressor === emp && ownerPeace === null,
    `W6d: przy statusie POKOJU predykat przejęcia AI nie przejmuje (aktywna kampania ${emp}, obrońców gracza ${playerAlive}, właściciel ${ownerPeace ?? 'gracz'})`);
  w.rel.setStatus('player', emp, 'war', {}, 'g2_2_w6');
  w.inv._tickCaptureChecks(1);
  assert(w.cm.getColony(w.home.planetId)?.ownerEmpireId === emp,
    `W6e kontrola: w WOJNIE ten sam stan ⇒ kolonia przechodzi na ${emp} (${w.cm.getColony(w.home.planetId)?.ownerEmpireId})`);
}

// ── W7 — ładowanie wojsk z obcego ciała w pokoju ────────────────────────────────────────
{
  console.log('\nW7 — ładowanie wojsk z obcego ciała w pokoju: dozwolone');
  const w = world();
  const col = w.aiFull[0];
  const t = landTile(col);
  const u = w.gum.createUnit('shock_infantry', col.planetId, t.q, t.r, { owner: 'player', factionId: 'humanity' });
  const v = playerShip(w);
  orbit(v, col.planetId);
  assert(w.dipl.getStatus(col.ownerEmpireId) === 'peace' && isOnBody(w, col.planetId, u.id),
    `świadek: jednostka gracza na ciele ${col.planetId} (${col.ownerEmpireId}), pokój, statek na orbicie`);
  const r = loadGroundUnit(v, u);
  assert(r?.ok === true && u.status === 'in_cargo' && v.groundUnits.includes(u.id) && !isOnBody(w, col.planetId, u.id),
    `W7: loadGroundUnit z obcego ciała w POKOJU ⇒ ok, jednostka w ładowni (${JSON.stringify(r)})`);
}

// ── W8 — zmiana właściciela w czasie transportu: decyduje właściciel w chwili lądowania ─
{
  console.log('\nW8 — ciało zmienia właściciela w czasie transportu: decyduje chwila lądowania');
  // A: rozkaz wydany w wojnie z właścicielem; w trakcie lotu ciało przechodzi na imperium w pokoju.
  {
    const w = world();
    const [c1, c2] = w.aiFull;
    const e1 = c1.ownerEmpireId, e2 = c2.ownerEmpireId;      // PRZED przerzutem — `c1` mutuje w miejscu
    const t = landTile(c1);
    w.dipl.declareWar(e1, 'g2_2_w8');
    const v = playerShip(w);
    const { u, loaded } = loadedUnit(w, v);
    orbit(v, c1.planetId);
    const canAtOrder = canDrop(w, v);
    const moved = w.cm.transferColony(c1.planetId, e2, 'g2_2_w8');
    const owner = w.cm.getColony(c1.planetId)?.ownerEmpireId;
    assert(loaded && canAtOrder?.ok === true && moved === true && owner === e2 &&
           w.dipl.getStatus(e2) === 'peace',
      `świadek A: przy rozkazie ciało ${e1} (wojna, canExecute ${canAtOrder?.ok}); w locie przechodzi na ${owner} (pokój)`);
    const r = dropTroop(v, u, c1.planetId, t.q, t.r);
    assert(r?.ok === false && r?.reason === 'not_at_war' && !isOnBody(w, c1.planetId, u.id) && u.status === 'in_cargo',
      `W8a: lądowanie oceniane wg NOWEGO właściciela ⇒ not_at_war, jednostka w ładowni (${JSON.stringify(r)})`);
    assert(refusedForWar(canDrop(w, v)),
      'W8b: ponowna ocena akcji po zmianie właściciela ⇒ odmowa z powodem');
  }
  // B: rozkaz w pokoju (odmowa), w trakcie lotu ciało przechodzi na imperium, z którym jest wojna.
  {
    const w = world();
    const [c1, c2] = w.aiFull;
    const e1 = c1.ownerEmpireId, e2 = c2.ownerEmpireId;      // PRZED przerzutem — `c2` mutuje w miejscu
    const t = landTile(c2);
    w.dipl.declareWar(e1, 'g2_2_w8');
    const v = playerShip(w);
    const { u, loaded } = loadedUnit(w, v);
    orbit(v, c2.planetId);
    const canAtOrder = canDrop(w, v);
    const moved = w.cm.transferColony(c2.planetId, e1, 'g2_2_w8');
    assert(loaded && moved === true && w.cm.getColony(c2.planetId)?.ownerEmpireId === e1 &&
           w.dipl.getStatus(e2) === 'peace' && w.dipl.getStatus(e1) === 'war',
      `świadek B: przy rozkazie ciało ${e2} (pokój, canExecute ${canAtOrder?.ok}); w locie przechodzi na ${e1} (wojna)`);
    const r = dropTroop(v, u, c2.planetId, t.q, t.r);
    assert(r?.ok === true && isOnBody(w, c2.planetId, u.id),
      `W8c kontrola: lądowanie wg właściciela w chwili lądowania (wojna) ⇒ ok (${JSON.stringify(r)})`);
  }
}

// ── W9 — ścieżki DOM: piny źródłowe ─────────────────────────────────────────────────────
{
  console.log('\nW9 — ścieżki DOM wołają bramkę i podają powód przez i18n (piny źródłowe)');
  const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
  const co = strip(readFileSync(new URL('../../ui/ColonyOverlay.js', import.meta.url), 'utf8'));
  const cl = strip(readFileSync(new URL('../../ui/CargoLoadModal.js', import.meta.url), 'utf8'));
  const msg = /t\('fleet\.reason\.notAtWar'\)/;

  const reqStart = co.indexOf("EventBus.on('vessel:dropTroopsRequest'");
  const req = reqStart >= 0 ? co.slice(reqStart, co.indexOf('this._dropMode = true;', reqStart)) : '';
  assert(req.length > 0 && /warGateRefusal\(\s*'player'\s*,\s*targetId\s*\)/.test(req) && msg.test(req),
    'W9a: ColonyOverlay — wejście w tryb zrzutu pyta bramkę (warGateRefusal(\'player\', targetId)) i pokazuje powód');

  const dropStart = co.indexOf('if (this._dropMode && tile) {');
  const dropBlk = dropStart >= 0 ? co.slice(dropStart, co.indexOf('// ── Tryb wyboru bitwy', dropStart) >= 0
    ? co.indexOf('// ── Tryb wyboru bitwy', dropStart) : co.indexOf('this._supportMode && tile', dropStart)) : '';
  assert(dropBlk.length > 0 && /dropTroop\(/.test(dropBlk) && /NOT_AT_WAR/.test(dropBlk) && msg.test(dropBlk) &&
         /_finishDropMode\(\s*\w+\s*\)\s*;\s*return true;/.test(dropBlk),
    'W9b: ColonyOverlay — klik zrzutu: odmowa dropTroop kończy tryb Z POWODEM (nie nadpisanym przez „zakończono”)');

  const landStart = co.indexOf('if (this._landingMode && tile) {');
  const landBlk = landStart >= 0 ? co.slice(landStart, co.indexOf('// ── Tryb ostrzału', landStart) >= 0
    ? co.indexOf('// ── Tryb ostrzału', landStart) : co.indexOf('this._strikeMode && tile', landStart)) : '';
  assert(landBlk.length > 0 && /deployAwayTeam\(/.test(landBlk) && /\.ok\s*===\s*false/.test(landBlk) && msg.test(landBlk),
    'W9c: ColonyOverlay — klik away team: odmowa deployAwayTeam pokazuje powód zamiast komunikatu o lądowaniu');

  assert(/warGateRefusal\(/.test(cl) && msg.test(cl) && /unloadGroundUnit\(/.test(cl) &&
         /if\s*\(\s*!\s*unloadGroundUnit\(/.test(cl),
    'W9d: CargoLoadModal — „Wyładuj” pyta bramkę, sprawdza wynik unloadGroundUnit i pokazuje powód');
  // Kontrola pinu: wycięcie komentarzy nie zjada kodu (w źródle zostaje wołanie dropTroop i deployAwayTeam).
  assert(/dropTroop\(/.test(co) && /deployAwayTeam\(/.test(co) && /unloadGroundUnit\(/.test(cl),
    'W9 kontrola pinu: po wycięciu komentarzy kod ścieżek nadal jest widoczny');
}

// ── W10 — i18n ───────────────────────────────────────────────────────────────────────────
{
  console.log('\nW10 — i18n: powód odmowy w PL i EN');
  const pl = plDict[REASON_KEY], en = enDict[REASON_KEY];
  assert(typeof pl === 'string' && pl.length > 0 && typeof en === 'string' && en.length > 0 && pl !== en,
    `W10: ${REASON_KEY} istnieje w PL i EN i różni się (PL „${pl ?? '—'}”, EN „${en ?? '—'}”)`);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
