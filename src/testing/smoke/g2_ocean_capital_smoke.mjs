// G2-K1 — AI GARRISON: stolice kolonii AI na oceanie (D17, Finding 336).
//
// Kolonii AI, której stolica stoi na kaflu oceanu, nie da się przejąć z ziemi: okupacja wymaga
// STANIA na kaflu, na ocean nie wejdzie żadna jednostka (koszt ruchu = Infinity), a predykat
// przejęcia `InvasionSystem.holdsDecisiveGround` żąda właśnie kafla stolicy. Przyczyna:
// `EmpireColonyBootstrap._placeBuildingSmart` odrzucał kafle warunkiem `tile.buildable === false`,
// a kafel siatki takiego pola nie ma (`buildable` żyje wyłącznie w `TERRAIN_TYPES`) — test był
// martwy od napisania (`0acd7d9`), więc stolica szła na pierwszy kafel o najwyższej punktacji,
// także oceaniczny.
//
//   T0  jedno źródło „da się stanąć”: tabela kosztu ruchu i predykat `isStandableTile` mieszkają
//       w danych (`GroundUnitData`), a ruch jednostek czyta tę samą tabelę; jedyny teren nie do
//       stania = ocean. Kontrola wykonaniem: ruch odrzuca cel na oceanie, przyjmuje cel lądowy.
//   T1  generowanie (C-S1): na 14 ziarnach każda stolica kolonii AI — macierzystej i założonej
//       ścieżką ekspansji (`bootstrapColony`) — stoi na kaflu, na którym da się stanąć.
//   T2  stare zapisy (C-S2): stolica, na której nie da się stanąć, bez obrońców — gracz trzymający
//       JEDEN kafel z budynkiem przejmuje kolonię (reguła placówki).
//   T3  kontrola: stolica, na której da się stanąć — trzymanie innego kafla z budynkiem NIE wystarcza.
//   T4  kontrola: placówka AI przejmowana dokładnie jak dotąd.
//   T5  zapis ze stolicą na oceanie wczytuje się bez zmian (stolica nie przenoszona, bez migracji),
//       a T2 trzyma po wczytaniu.
//   T6  bliźniak AI (`GroundUnitManager._findTerritorialGoal`): kolonia GRACZA ze stolicą, na której
//       nie da się stanąć, bez obrońców — desant AI maszeruje na kafel z budynkiem i przejmuje ją
//       regułą placówki (przed naprawą: marsz na stolicę = `no_path`, nigdy). Kontrola: stolica
//       lądowa — marsz na stolicę i przejęcie dokładnie jak przed zmianą.
//
// ⚠ Wyrocznia „da się stanąć” w T1–T5 to literał `type !== 'ocean'`; T0 wiąże ją z tabelą ruchu
//   (gdyby doszedł drugi teren nie do przejścia, T0 padnie pierwszy i powie, co zmienić).
// ⚠ Stolica na oceanie w T2 i T5 jest SKONSTRUOWANA: kafel stolicy kolonii AI przestawiony na ocean.
//   To kształt starego zapisu (stolica nie przenoszona, klucz `capital_q,r` w `_active` zgodny
//   z kaflem); po naprawie generowanie już takich kolonii nie daje.
// ⚠ Upływ czasu przez prawdziwy `time:tick` (`Ticker`): okupacja kafla w `GroundUnitManager`,
//   skan przejęć gracza w `InvasionSystem` — te same ścieżki co w grze.

import '../headless/env.js';           // MUSI być pierwszy
import EntityManager from '../../core/EntityManager.js';
import EventBus from '../../core/EventBus.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { HEADLESS_GALAXY_SEED } from '../headless/GameCore.js';
import { SaveSystem } from '../../systems/SaveSystem.js';
import { EmpireColonyBootstrap } from '../../systems/EmpireColonyBootstrap.js';
import { TERRAIN_TYPES } from '../../map/HexTile.js';
// Przestrzeń nazw, nie import nazwany: przed naprawą tych eksportów nie ma, a import nazwany
// wywróciłby cały plik przy linkowaniu i żaden pin nie dostałby koloru.
import * as GUD from '../../data/GroundUnitData.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Harness ──────────────────────────────────────────────────────────────────────────────

const OUTPOST_CAPTURE_CIVY = 8;                          // T4: zmierzone przed G2-K1
const TWIN_LAND_CAPTURE_CIVY = 11;                       // T6 kontrola: zmierzone przed bliźniakiem AI
const canStand  = (t) => !!t && t.type !== 'ocean';      // wyrocznia — T0 wiąże ją z tabelą ruchu
const capitalOf = (col) => col?.grid?.toArray?.().find(t => t?.capitalBase) ?? null;
const hexDist   = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs((-a.q - a.r) - (-b.q - b.r))) / 2;

function world(seed = HEADLESS_GALAXY_SEED) {
  // `bootWithDirector` odsiewa PRNG i czyści `gameState` przed KAŻDYM bootem — każde ziarno daje
  // w jednym procesie ten sam świat co w osobnym (zmierzone na 14 ziarnach przy pisaniu pliku).
  const { core, K, ticker } = bootWithDirector({ seed, quiet: true });
  const cm = core.colonyManager;
  return {
    core, K, cm, ticker,
    gum: K.groundUnitManager,
    home: cm.getColony(K.homePlanet.id),
    aiFull: cm.getAllColonies().filter(c => c.ownerEmpireId && !c.isOutpost),
  };
}

/** Placówka AI założona TĄ SAMĄ ścieżką co `EmpireStrategySystem` (solar + kopalnia). */
function bootstrapAiOutpost(w, empireId) {
  const emp = w.K.empireRegistry.get(empireId);
  const sysId = emp?.homeSystemId;
  const body = (EntityManager.getByTypeInSystem('planetoid', sysId) ?? [])
    .find(b => !w.cm.getColony(b.id));
  if (!body) return null;
  EmpireColonyBootstrap.bootstrapAutonomousOutpost(empireId, sysId, body.id, 'autonomous_solar_farm');
  EmpireColonyBootstrap.bootstrapAutonomousOutpost(empireId, sysId, body.id, 'autonomous_mine');
  return w.cm.getColony(body.id);
}

/**
 * Gracz trzyma JEDEN kafel z budynkiem (nie stolicę): prawdziwa jednostka na kaflu najbliższym
 * stolicy, prawdziwe `time:tick`. Zwraca, czy i w którym civY kolonia przeszła na gracza.
 */
function holdOneBuildingTile(w, col, years = 24) {
  // D13 (G2-2) — przejęcie wymaga WOJNY z właścicielem; ten plik testuje regułę terenu, nie pokój.
  //   Wojna wypowiadana TUTAJ, po świadkach bloków (T2 przypina „pokój” stanu wejściowego).
  // G2-3b (D15) — od mobilizacji wojna wystawia garnizon AI; reguła terenu mierzona na NIEBRONIONEJ
  //   kolonii, więc setup wyłącza mobilizację (zgoda właściciela 2026-10-03; asercje bez zmian).
  if (w.K.garrisonSystem) w.K.garrisonSystem.enabled = false;
  w.K.diplomacySystem.declareWar(col.ownerEmpireId, 'keeper_setup');
  const cap = capitalOf(col);
  const pick = col.grid.toArray()
    .filter(t => t && t.buildingId && !t.capitalBase && canStand(t))
    .sort((a, b) => hexDist(a, cap ?? a) - hexDist(b, cap ?? b))[0] ?? null;
  if (!pick) return null;
  const u = w.gum.createUnit('shock_infantry', col.planetId, pick.q, pick.r,
    { owner: 'player', factionId: 'humanity' });
  // Płatnikiem utrzymania jest kolonia macierzysta gracza z zapasem Kr — inaczej jednostka mogłaby
  // przejść w `offline` z braku kredytów, a to nie jest przedmiot tego pliku.
  if (u) u.homeColonyId = w.home.planetId;
  w.home.credits = 1e6;
  let at = null;
  for (let y = 1; y <= years; y++) {
    w.ticker.run(1, { tickSize: 1.0 });
    if (!w.cm.getColony(col.planetId)?.ownerEmpireId) { at = y; break; }
  }
  const unit = u ? w.gum.getUnit(u.id) : null;
  return {
    took: at !== null, at, tile: pick,
    unitOk: !!unit && unit.q === pick.q && unit.r === pick.r && (unit.hp ?? 0) > 0,
    heldOwner: pick.owner,
    defenders: w.gum.getUnitsOnPlanet(col.planetId).filter(x => (x.owner ?? 'player') !== 'player').length,
  };
}

/**
 * Round-trip przez PRODUKCYJNĄ ścieżkę zapisu, w kolejności z gry: serializacja → restore →
 * relink (bez relinku odtworzone kolonie nie mają właściciela — `colony_ownership_load_smoke`).
 */
function roundTrip(cm) {
  // Instancja tylko do serializacji: bez `timeSystem`, więc jej autozapis na `time:tick` rzucałby
  // przy każdym interwale (zmierzone przy pisaniu pliku) — wyłączony.
  const ss = new SaveSystem();
  ss._autosaveInterval = 0;
  const c4x = ss._serializeCiv4x();
  cm._colonies.clear();
  cm._activePlanetId = null;
  cm.restore(c4x, null);
  EmpireColonyBootstrap.relinkColoniesAfterRestore(c4x.empireTech);
  return c4x;
}

// ── T0 — jedno źródło „da się stanąć” ─────────────────────────────────────────────────────
{
  console.log('\nT0 — jedno źródło „da się stanąć”: tabela ruchu i predykat w danych');
  const table = GUD.GROUND_MOVE_COST ?? null;
  const pred  = typeof GUD.isStandableTile === 'function' ? GUD.isStandableTile : null;
  assert(!!table && !!pred,
    `T0a: GroundUnitData eksportuje GROUND_MOVE_COST i isStandableTile (tabela ${!!table}, predykat ${!!pred})`);

  const terrains = Object.keys(TERRAIN_TYPES);
  const blocked = table ? terrains.filter(k => !Number.isFinite(table[k] ?? 1)) : [];
  assert(blocked.length === 1 && blocked[0] === 'ocean',
    `T0b: jedyny teren nie do stania w tabeli ruchu = ocean (${blocked.join(',') || '—'}) — wyrocznia T1–T5 jest prawdziwa`);

  const agree = !!pred && terrains.every(k => pred({ type: k }) === (k !== 'ocean'));
  assert(agree && pred?.(null) === false && pred?.({ type: 'teren_nieznany' }) === true,
    'T0c: isStandableTile zgodny z tabelą dla każdego terenu; brak kafla ⇒ nie; nieznany teren ⇒ tak (jak ruch: koszt ?? 1)');

  // Pin źródłowy (kod bez komentarzy): ruch nie ma już WŁASNEJ tabeli — czyta tę z danych.
  const src = readFileSync(new URL('../../systems/GroundUnitManager.js', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const ownTable = /const\s+MOVE_COST\s*=\s*\{/.test(src);
  const usesData = /import\s*\{[^}]*\bGROUND_MOVE_COST\b[^}]*\}\s*from\s*'\.\.\/data\/GroundUnitData\.js'/.test(src);
  assert(!ownTable && usesData,
    `T0d: GroundUnitManager czyta GROUND_MOVE_COST z danych, bez własnej tabeli (własna ${ownTable}, import ${usesData})`);

  // Kontrola wykonaniem — prawda ruchu, niezależna od tej zmiany.
  const w = world();
  let land = null, ocean = null, land2 = null;
  outer: for (const col of w.aiFull) {
    for (const t of col.grid.toArray()) {
      if (!t || t.type !== 'ocean') continue;
      const nb = col.grid.getNeighbors(t.q, t.r).filter(n => n && n.type !== 'ocean');
      for (const l of nb) {
        const l2 = col.grid.getNeighbors(l.q, l.r).find(n => n && n.type !== 'ocean' && !(n.q === t.q && n.r === t.r));
        if (l2) { land = { col, t: l }; ocean = t; land2 = l2; break outer; }
      }
    }
  }
  assert(!!land && !!ocean && !!land2, `świadek: siatka AI z kaflem oceanu sąsiadującym z lądem (${land?.col.planetId})`);
  if (land) {
    const u = w.gum.createUnit('shock_infantry', land.col.planetId, land.t.q, land.t.r, { owner: 'player', factionId: 'humanity' });
    const toOcean = w.gum.moveUnit(u.id, ocean.q, ocean.r);
    const toLand  = w.gum.moveUnit(u.id, land2.q, land2.r);
    assert(toOcean === false && toLand === true,
      `T0e kontrola: ruch odrzuca cel na oceanie (${toOcean}) i przyjmuje sąsiedni cel lądowy (${toLand})`);
    w.gum.removeUnit(u.id);
  }
}

// ── T1 — generowanie: stolice AI na kaflach, na których da się stanąć ────────────────────
{
  console.log('\nT1 — generowanie (C-S1): stolice kolonii AI na 14 ziarnach');
  const SEEDS = [HEADLESS_GALAXY_SEED, 987654321, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  let homeCaps = 0, expCaps = 0, expTried = 0, prefixPickOcean = 0, gridsWithOcean = 0;
  const bad = [];
  const check = (seed, col, kind) => {
    const tiles = col.grid?.toArray?.() ?? [];
    if (tiles.some(t => t?.type === 'ocean')) gridsWithOcean++;
    const cap = tiles.find(t => t?.capitalBase);
    if (!cap) { bad.push(`${seed}:${col.planetId}:${kind}:BRAK_STOLICY`); return; }
    if (!canStand(cap)) bad.push(`${seed}:${col.planetId}:${kind}:${cap.q},${cap.r}:${cap.type}`);
  };
  for (const seed of SEEDS) {
    const w = world(seed);
    for (const col of w.aiFull) {
      homeCaps++;
      // Kafel (-1,2) wygrywał punktację KAŻDEJ stolicy AI przed naprawą (zmierzone: 28/28 na 14
      // ziarnach) — świadek, że próbka zawiera konfigurację defektu.
      if (col.grid?.get?.(-1, 2)?.type === 'ocean') prefixPickOcean++;
      check(seed, col, 'macierzysta');
    }
    // Druga ścieżka `_placeBuildingSmart`: kolonia ekspansji AI (`bootstrapColony`, domyślny zestaw
    // budynków ze stolicą na czele) — po jednej na imperium, na pierwszym wolnym ciele skalistym.
    for (const emp of w.K.empireRegistry.listAll()) {
      const sysId = emp.homeSystemId;
      const body = [...(EntityManager.getByTypeInSystem('planet', sysId) ?? []), ...(EntityManager.getByTypeInSystem('moon', sysId) ?? [])]
        .find(b => b.planetType !== 'gas' && !w.cm.getColony(b.id));
      if (!body) continue;
      expTried++;
      let col = null;
      try { col = EmpireColonyBootstrap.bootstrapColony(emp.id, sysId, body.id, {}); } catch { col = null; }
      if (!col) { bad.push(`${seed}:${body.id}:ekspansja:NIE_ZAŁOŻONA`); continue; }
      expCaps++;
      check(seed, col, 'ekspansja');
    }
  }
  assert(homeCaps >= 28 && expCaps >= 14 && expCaps === expTried,
    `świadek: ${homeCaps} kolonii macierzystych AI i ${expCaps}/${expTried} kolonii ekspansji na 14 ziarnach`);
  assert(prefixPickOcean >= 1 && gridsWithOcean >= 1,
    `świadek: kafel (-1,2) jest oceanem na ${prefixPickOcean} siatkach macierzystych; siatek z oceanem: ${gridsWithOcean}`);
  assert(bad.length === 0,
    `T1: każda stolica AI stoi na kaflu, na którym da się stanąć (złych: ${bad.length}${bad.length ? ' — ' + bad.join(' ') : ''})`);
}

// ── T2 — stara stolica na oceanie: reguła placówki ───────────────────────────────────────
{
  console.log('\nT2 — stolica, na której nie da się stanąć: gracz trzymający jeden kafel z budynkiem przejmuje');
  const w = world();
  const col = w.aiFull[0];
  const emp = col?.ownerEmpireId;
  const cap = capitalOf(col);
  cap.type = 'ocean';                                   // kształt starego zapisu
  assert(!!col && cap?.type === 'ocean' && w.gum.getUnitsOnPlanet(col.planetId).length === 0 &&
         w.K.diplomacySystem.getStatus(emp) === 'peace',
    `świadek: kolonia ${col?.planetId} (${emp}) ze stolicą na oceanie (${cap?.q},${cap?.r}), 0 jednostek na ciele`);
  const r = holdOneBuildingTile(w, col);
  assert(!!r && r.unitOk && r.defenders === 0 && r.tile.owner === 'player',
    `świadek: jednostka gracza stoi na kaflu z budynkiem (${r?.tile?.q},${r?.tile?.r}: ${r?.tile?.buildingId}), ` +
    `kafel jest gracza (${r?.heldOwner}), obrońców 0`);
  assert(r?.took === true,
    `T2: kolonia przechodzi na gracza regułą placówki (przejęta: ${r?.took}${r?.at ? ' w ' + r.at + '. civY' : ''})`);
}

// ── T3 — kontrola: stolica, na której da się stanąć ──────────────────────────────────────
{
  console.log('\nT3 — kontrola: stolica lądowa — inny kafel z budynkiem nie wystarcza');
  const w = world();
  // OSTATNIA kolonia AI z lądową stolicą: przed naprawą pierwsza (emp_001) ma na domyślnym ziarnie
  // stolicę na oceanie, więc wybór „od końca” daje TĘ SAMĄ kolonię w obu przebiegach.
  const col = [...w.aiFull].reverse().find(c => canStand(capitalOf(c))) ?? null;
  const cap = capitalOf(col);
  assert(!!col && canStand(cap), `świadek: kolonia ${col?.planetId} ze stolicą lądową (${cap?.q},${cap?.r}: ${cap?.type})`);
  const r = holdOneBuildingTile(w, col);
  assert(!!r && r.unitOk && r.defenders === 0 && r.tile.owner === 'player' && cap.owner !== 'player',
    `świadek: gracz trzyma kafel z budynkiem (${r?.tile?.q},${r?.tile?.r}), stolica nie jego (${cap?.owner ?? 'null'})`);
  assert(r?.took === false,
    `T3 kontrola: bez stolicy kolonia ze stolicą lądową NIE przechodzi na gracza przez 24 civY (przejęta: ${r?.took})`);
}

// ── T4 — kontrola: placówka AI jak dotąd ─────────────────────────────────────────────────
{
  console.log('\nT4 — kontrola: placówka AI przejmowana jak dotąd');
  const w = world();
  const out = bootstrapAiOutpost(w, w.aiFull[0].ownerEmpireId);
  assert(!!out && out.isOutpost && !capitalOf(out) && out.grid.toArray().some(t => t?.buildingId),
    `świadek: placówka AI ${out?.planetId} bez stolicy, z kaflami budynków`);
  const r = holdOneBuildingTile(w, out);
  assert(!!r && r.unitOk && r.defenders === 0,
    `świadek: jednostka gracza stoi na kaflu z budynkiem placówki (${r?.tile?.q},${r?.tile?.r})`);
  // 8. civY — zmierzone na kodzie sprzed G2-K1 (okupacja 6 civY + skan przejęć raz na civY).
  assert(r?.took === true && r.at === OUTPOST_CAPTURE_CIVY,
    `T4 kontrola: placówka przechodzi na gracza w ${OUTPOST_CAPTURE_CIVY}. civY, jak przed zmianą ` +
    `(przejęta: ${r?.took}${r?.at ? ' w ' + r.at + '. civY' : ''})`);
}

// ── T5 — zapis ze stolicą na oceanie ─────────────────────────────────────────────────────
{
  console.log('\nT5 — zapis ze stolicą na oceanie: wczytanie bez zmian, potem T2');
  const w = world();
  const col = w.aiFull[0];
  const emp = col?.ownerEmpireId;
  const cap = capitalOf(col);
  const key = `${cap.q},${cap.r}`;
  cap.type = 'ocean';
  const before = col.grid.toArray().map(t => `${t.q},${t.r}:${t.type}:${t.capitalBase ? 1 : 0}:${t.buildingId ?? '-'}`).join('|');
  roundTrip(w.cm);
  const col2 = w.cm.getColony(col.planetId);
  const cap2 = capitalOf(col2);
  const after = col2?.grid?.toArray?.().map(t => `${t.q},${t.r}:${t.type}:${t.capitalBase ? 1 : 0}:${t.buildingId ?? '-'}`).join('|');
  assert(!!col2 && col2 !== col && col2.ownerEmpireId === emp,
    `świadek: kolonia ${col?.planetId} odtworzona z zapisu (nowy obiekt), właściciel ${col2?.ownerEmpireId}`);
  assert(!!cap2 && `${cap2.q},${cap2.r}` === key && cap2.type === 'ocean' && after === before,
    `T5a: stolica wraca na TEN SAM kafel oceanu (${cap2?.q},${cap2?.r}: ${cap2?.type}); cała siatka bez zmian (${after === before})`);
  assert([...col2.buildingSystem._active.keys()].includes(`capital_${key}`),
    `T5b: wpis stolicy w budynkach kolonii nadal pod capital_${key} — stolica nie przeniesiona`);
  const r = holdOneBuildingTile(w, col2);
  assert(!!r && r.unitOk && r.defenders === 0 && r.tile.owner === 'player',
    `świadek: po wczytaniu jednostka gracza trzyma kafel z budynkiem (${r?.tile?.q},${r?.tile?.r})`);
  assert(r?.took === true,
    `T5c: po wczytaniu kolonia przechodzi na gracza regułą placówki (przejęta: ${r?.took}${r?.at ? ' w ' + r.at + '. civY' : ''})`);
}

// ── T6 — bliźniak AI: marsz terytorialny omija stolicę, na której nie da się stanąć ──────
/**
 * Kolonia GRACZA ze stolicą „jak u AI” (kolonia macierzysta emp_002 przejęta przez gracza — kształt
 * np. cesji), atakowana desantem DRUGIEGO imperium w stanie wojny, bez obrońców gracza na ciele.
 * Prawdziwe ścieżki: `launchInvasion`, marsz `_tickCombatAI`, okupacja, `_tickCaptureChecks`.
 * ⚠ Wojna jest wypowiedziana JAWNIE: przejęcie przez AI jest aktem wojny (D13, G2-2), więc ten
 *   test nie może zależeć od tego, czy bramka wojny już istnieje.
 * ⚠ Kolonia `aiFull[1]` i dwie jednostki desantu: na domyślnym ziarnie jedna ląduje na krawędzi
 *   bez drogi do żadnego celu (`no_path` — osobny finding), druga ma drogę. Zmierzone przed zmianą.
 */
function aiRetakeRun(capitalOnOcean) {
  const w = world();
  const col = w.aiFull[1] ?? null;
  const agg = w.aiFull[0]?.ownerEmpireId ?? null;
  const cap = capitalOf(col);
  if (capitalOnOcean && cap) cap.type = 'ocean';
  const owned = !!col && w.cm.captureColonyForPlayer(col.planetId, 'g2_k1_twin') === true;
  // Migawka PRZED desantem — po udanym przejęciu `col.ownerEmpireId` to już agresor.
  const playerOwnedBefore = owned && !col.ownerEmpireId;
  const war = !!agg && w.K.diplomacySystem.declareWar(agg, 'g2_k1_twin') === true;
  const playerUnits = col ? w.gum.getUnitsOnPlanet(col.planetId).filter(u => (u.owner ?? 'player') === 'player').length : -1;
  const goals = [];
  EventBus.on('groundUnit:territorialIntent', (e) => { if (e?.planetId === col?.planetId) goals.push(e); });
  const res = (col && agg) ? w.K.invasionSystem.launchInvasion(agg, col.planetId, 2) : null;
  let at = null;
  for (let y = 1; y <= 24 && col; y++) {
    w.ticker.run(1, { tickSize: 1.0 });
    if (w.cm.getColony(col.planetId)?.ownerEmpireId === agg) { at = y; break; }
  }
  return {
    col, agg, cap, owned, playerOwnedBefore, war, playerUnits, goals, res,
    status: agg ? w.K.diplomacySystem.getStatus(agg) : null,
    took: at !== null, at,
  };
}
{
  console.log('\nT6 — bliźniak AI: kolonia gracza ze stolicą nie do stania — desant AI przejmuje ją regułą placówki');
  const o = aiRetakeRun(true);
  assert(o.playerOwnedBefore && o.cap?.type === 'ocean' && o.war && o.status === 'war' &&
         o.playerUnits === 0 && o.res?.success === true && (o.res?.landed?.length ?? 0) === 2,
    `świadek: kolonia gracza ${o.col?.planetId} ze stolicą na oceanie (${o.cap?.q},${o.cap?.r}), wojna z ${o.agg} (${o.status}), ` +
    `0 jednostek gracza na ciele, desant ${o.res?.landed?.length ?? 0} jednostek`);
  const onCapital = o.goals.filter(g => g.goalQ === o.cap?.q && g.goalR === o.cap?.r).length;
  assert(onCapital === 0 && o.goals.some(g => g.goalKind === 'building'),
    `T6a: cel marszu AI to kafel z budynkiem, nie stolica na oceanie (na stolicę: ${onCapital}; ` +
    `cele: ${o.goals.map(g => `${g.goalQ},${g.goalR}:${g.goalKind}`).join(' ') || '—'})`);
  assert(o.took === true,
    `T6b: AI przejmuje kolonię gracza ze stolicą nie do stania (przejęta: ${o.took}${o.at ? ' w ' + o.at + '. civY' : ''})`);

  const l = aiRetakeRun(false);
  assert(l.playerOwnedBefore && canStand(l.cap) && l.war && l.playerUnits === 0 && l.res?.success === true,
    `świadek: ta sama kolonia ze stolicą lądową (${l.cap?.q},${l.cap?.r}: ${l.cap?.type}), wojna, 0 obrońców`);
  assert(l.goals.some(g => g.goalKind === 'capital' && g.goalQ === l.cap?.q && g.goalR === l.cap?.r) &&
         l.took === true && l.at === TWIN_LAND_CAPTURE_CIVY,
    `T6c kontrola: stolica lądowa — marsz na stolicę i przejęcie w ${TWIN_LAND_CAPTURE_CIVY}. civY, jak przed zmianą ` +
    `(przejęta: ${l.took}${l.at ? ' w ' + l.at + '. civY' : ''})`);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
