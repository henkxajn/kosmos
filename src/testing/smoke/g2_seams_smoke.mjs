// G2-0 — AI GARRISON: piny DZISIEJSZYCH szwów, które kolejne kroki G2 zmienią ŚWIADOMIE.
//
// Ten plik niczego nie naprawia. Utrwala zachowanie, na którym stoją dalsze kroki arca
// (`docs/design/AI_GARRISON_PLAN.md` §3, §6), tak żeby każda ich zmiana PRZESTAWIAŁA pin celowo,
// a nie po cichu. Pin, który padnie, mówi: „to jest szew X, zmieniłeś go — przepisz pin razem
// z decyzją, która za tym stoi”.
//
//   P1  `createUnit` — wartości domyślne: `factionId 'humanity'`, `owner 'player'`, rozkładany
//       archetyp startuje `'mobile'`; forma 5-argumentowa zastępuje `opts` przez `{ factionId }`,
//       więc jednostka trafia do GRACZA (Finding 323, 324).
//       → zmieni go: decyzja o domyślnych wartościach `createUnit` (G2 tego NIE robi).
//   P2  jednostka utworzona tylko z `{ owner: <imperium> }` na kolonii z 0 Kr: liczona do utrzymania
//       jak jednostka gracza, w 1. civY przechodzi w `offline`, przestaje być obrońcą i zostaje
//       rozwiązana do 5. civY (Finding 323). Kontrola: z `factionId` imperium zostaje aktywna.
//       → zmieni go: przejście `launchInvasion` na `createAIUnit` (G2b) albo zmiana filtra utrzymania (329).
//   P3  kafle kolonii AI po bootstrapie mają `owner === null` — stolica i placówka (Finding 318).
//       → zmieni go: stempel kafli przy bootstrapie/materializacji.
//   P4  `_findGroundUnitSpawn`: pełna kolonia AI z lądową stolicą — pierwsza jednostka staje NA kaflu
//       stolicy; stolica na oceanie — na lądowym kaflu z pierścienia 1; placówka (bez `capitalBase`) —
//       na PIERWSZYM lądowym kaflu siatki w kolejności `toArray()`, niezależnie od budynków.
//       ⚠ Od G2-K1 (Finding 336) generowanie nie stawia stolic AI na oceanie — P4b stoi na kolonii
//         SKONSTRUOWANEJ (kafel stolicy przestawiony na ocean: kształt zapisu sprzed G2-K1).
//       → zmieni go: reguła rozmieszczenia garnizonu (G2-3).
//   P5  predykaty przejęcia i `launchInvasion` nie pytają o wojnę: w stanie POKOJU gracz przejmuje
//       kolonię AI (`_tryPlayerCapture`), AI ląduje (`launchInvasion`) i przejmuje kolonię gracza
//       (`_tickCaptureChecks`) (Finding 317).
//       → zmieni go: bramka wojny D4 (G2-2).
//   P6  `captureColonyForPlayer`, `transferColony` i `removeColony` nie ruszają jednostek naziemnych
//       na ciele — jednostki poprzedniego właściciela zostają (Finding 319).
//       → zmieni go: usuwanie jednostek przy zmianie właściciela/zniszczeniu (D6, G2-3).
//
// ⚠ Harness: `bootWithDirector` (prawdziwy `GameCore` z imperiami AI i stosem Directora, domyślne
//   ziarno galaktyki — do G2-K1 stolica emp_001 stała w nim na OCEANIE; od G2-K1 obie stolice AI
//   są lądowe). Upływ czasu
//   w P2 przez prawdziwy `time:tick` (`Ticker`), czyli przez to samo
//   `ColonyManager._tickGroundUnitUpkeep`, co w grze.
// ⚠ Każdy pin ma ŚWIADKA (np. „status relacji = peace”, „siatka ma kafle”, „jednostka istnieje”) —
//   pin na pustym zbiorze albo na nieistniejącej jednostce przechodziłby jałowo.

import '../headless/env.js';           // MUSI być pierwszy
import EntityManager from '../../core/EntityManager.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import { InvasionSystem } from '../../systems/InvasionSystem.js';
import { EmpireColonyBootstrap } from '../../systems/EmpireColonyBootstrap.js';
import { UNIT_ARCHETYPES } from '../../data/unitArchetypes.js';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

// ── Harness ──────────────────────────────────────────────────────────────────────────────

function boot() {
  // `bootWithDirector` (a nie goły `GameCore.boot`): odsiewa PRNG i czyści `gameState` przed KAŻDYM
  // bootem, więc każdy pin dostaje TĘ SAMĄ galaktykę (domyślne ziarno). Goły `GameCore.boot` w tym
  // samym procesie dawał przy każdym wywołaniu inny świat — gałąź „stolica na oceanie” w P4
  // raz była, raz nie (zmierzone przy pisaniu tego pliku).
  const { core, K, ticker } = bootWithDirector({ quiet: true });
  const cm  = core.colonyManager;
  const gum = K.groundUnitManager;
  const home = cm.getColony(K.homePlanet.id);
  const aiFull = cm.getAllColonies().filter(c => c.ownerEmpireId && !c.isOutpost);
  return { core, K, cm, gum, home, aiFull, ticker };
}

const capitalOf = (col) => col?.grid?.toArray?.().find(t => t?.capitalBase) ?? null;
const landCapital = (w) => w.aiFull.find(c => { const t = capitalOf(c); return t && t.type !== 'ocean'; }) ?? null;
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs((-a.q - a.r) - (-b.q - b.r))) / 2;

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

// ── P1 — wartości domyślne createUnit ────────────────────────────────────────────────────
{
  console.log('\nP1 — createUnit: wartości domyślne i forma 5-argumentowa');
  const w = boot();
  const col = landCapital(w);
  const emp = col?.ownerEmpireId;
  const cap = capitalOf(col);
  assert(!!col && !!cap && !!UNIT_ARCHETYPES.garrison_unit?.supportsDeploy,
    `świadek: kolonia AI z lądową stolicą (${col?.planetId}) i rozkładany archetyp garrison_unit`);

  const a = w.gum.createUnit('garrison_unit', col.planetId, cap.q, cap.r, { owner: emp });
  assert(a?.owner === emp && a?.factionId === 'humanity',
    `P1a: { owner: imperium } bez factionId ⇒ factionId 'humanity' (owner=${a?.owner}, factionId=${a?.factionId})`);

  const b = w.gum.createUnit('garrison_unit', col.planetId, cap.q, cap.r, {});
  assert(b?.owner === 'player', `P1b: opts bez owner ⇒ owner 'player' (${b?.owner})`);
  assert(b?.deployState === 'mobile' && b?.attack === 0,
    `P1c: rozkładany archetyp startuje 'mobile' — staty wozu, dmg 0 (deployState=${b?.deployState}, attack=${b?.attack})`);

  const c = w.gum.createUnit('garrison_unit', emp, col.planetId, cap.q, cap.r);
  assert(c?.owner === 'player' && c?.factionId === emp && c?.planetId === col.planetId,
    `P1d: forma 5-argumentowa (archetyp, frakcja, ciało, q, r) ⇒ owner 'player' mimo frakcji imperium ` +
    `(owner=${c?.owner}, factionId=${c?.factionId})`);
}

// ── P2 — jednostka z samym { owner } na kolonii z 0 Kr ──────────────────────────────────
{
  console.log('\nP2 — { owner: imperium } na kolonii AI z 0 Kr: utrzymanie gracza → offline → rozwiązanie');
  const w = boot();
  const col = landCapital(w);
  const emp = col?.ownerEmpireId;
  const cap = capitalOf(col);
  col.credits = 0;
  const u = w.gum.createUnit('garrison_unit', col.planetId, cap.q, cap.r, { owner: emp, deployState: 'deployed' });
  const ctl = w.gum.createUnit('garrison_unit', col.planetId, cap.q, cap.r,
    { owner: emp, factionId: emp, deployState: 'deployed' });
  assert(!!u && !!ctl && col.credits === 0, `świadek: dwie jednostki AI na ${col?.planetId}, kredyty kolonii = 0`);

  const trace = [];
  for (let y = 1; y <= 6; y++) {
    w.ticker.run(1, { tickSize: 1.0 });
    trace.push({ y, alive: w.gum._units.has(u.id), status: w.gum.getUnit(u.id)?.status ?? null,
                 ctl: w.gum.getUnit(ctl.id)?.status ?? null });
  }
  assert(trace[0].status === 'offline', `P2a: w 1. civY jednostka przechodzi w 'offline' (${trace[0].status})`);
  const goneAt = trace.find(x => !x.alive)?.y ?? null;
  assert(goneAt !== null && goneAt <= 5, `P2b: rozwiązana najpóźniej w 5. civY (zniknęła w ${goneAt}. civY)`);
  const defenderOnlyCtl = InvasionSystem.hasLivingDefender(
    w.gum.getUnitsOnPlanet(col.planetId).filter(x => x.id !== ctl.id), 'player');
  assert(defenderOnlyCtl === false,
    `P2c: bez jednostki kontrolnej na ciele hasLivingDefender(…, 'player') = false (${defenderOnlyCtl})`);
  assert(trace.every(x => x.ctl === 'idle'),
    `P2 kontrola: jednostka z factionId imperium przez 6 civY aktywna (${trace.map(x => x.ctl).join(',')})`);
}

// ── P3 — kafle kolonii AI po bootstrapie mają owner null ────────────────────────────────
{
  console.log('\nP3 — kafle kolonii AI: owner null po bootstrapie (stolica i placówka)');
  const w = boot();
  const col = w.aiFull[0];
  const tiles = col?.grid?.toArray?.() ?? [];
  assert(tiles.length > 0, `świadek: siatka kolonii AI ${col?.planetId} ma ${tiles.length} kafli`);
  const notNull = tiles.filter(t => t.owner != null).length;
  assert(notNull === 0, `P3a: wszystkie kafle pełnej kolonii AI mają owner null (niepustych: ${notNull})`);

  const out = bootstrapAiOutpost(w, col.ownerEmpireId);
  const otiles = out?.grid?.toArray?.() ?? [];
  assert(!!out && out.isOutpost && otiles.length > 0,
    `świadek: placówka AI ${out?.planetId} (isOutpost=${out?.isOutpost}), ${otiles.length} kafli`);
  const onotNull = otiles.filter(t => t.owner != null).length;
  assert(onotNull === 0, `P3b: wszystkie kafle placówki AI mają owner null (niepustych: ${onotNull})`);
}

// ── P4 — gdzie staje pierwsza jednostka (_findGroundUnitSpawn) ──────────────────────────
{
  console.log('\nP4 — _findGroundUnitSpawn: kolonia AI i placówka AI');
  const w = boot();
  let land = 0;
  for (const col of w.aiFull) {
    const cap = capitalOf(col);
    if (cap.type === 'ocean') continue;          // od G2-K1 generowanie takich nie daje — P4b niżej
    land++;
    const sp = w.cm._findGroundUnitSpawn(col);
    assert(sp?.q === cap.q && sp?.r === cap.r,
      `P4a: ${col.planetId} — lądowa stolica (${cap.type}) ⇒ spawn NA kaflu stolicy (${sp?.q},${sp?.r})`);
  }
  assert(land >= 1, `świadek: kolonie AI z lądową stolicą (${land})`);

  // P4b — stolica na oceanie, SKONSTRUOWANA (G2-K1): kafel stolicy przestawiony na ocean, klucz
  //   `capital_q,r` bez zmian — kształt zapisu sprzed naprawy generowania.
  const oc = w.aiFull[0];
  const ocap = capitalOf(oc);
  ocap.type = 'ocean';
  const osp = w.cm._findGroundUnitSpawn(oc);
  const ot = oc.grid.get(osp?.q, osp?.r);
  assert(ocap.type === 'ocean' && oc.grid.getNeighbors(ocap.q, ocap.r).some(n => n && n.type !== 'ocean'),
    `świadek: ${oc.planetId} — stolica przestawiona na ocean (${ocap.q},${ocap.r}), w pierścieniu 1 jest ląd`);
  assert(!!ot && ot.type !== 'ocean' && hexDist(osp, ocap) === 1,
    `P4b: ${oc.planetId} — stolica na oceanie ⇒ spawn na lądowym kaflu pierścienia 1 (${osp?.q},${osp?.r}: ${ot?.type})`);

  const out = bootstrapAiOutpost(w, w.aiFull[0].ownerEmpireId);
  const tiles = out?.grid?.toArray?.() ?? [];
  const firstLand = tiles.find(t => t && t.type !== 'ocean');
  const blds = tiles.filter(t => t && (t.buildingId || t.capitalBase));
  const sp = out ? w.cm._findGroundUnitSpawn(out) : null;
  assert(!!out && blds.length > 0 && !tiles.some(t => t?.capitalBase),
    `świadek: placówka bez capitalBase, z ${blds.length} kaflami budynków`);
  assert(!!sp && !!firstLand && sp.q === firstLand.q && sp.r === firstLand.r,
    `P4c: placówka ⇒ spawn na PIERWSZYM lądowym kaflu siatki (${sp?.q},${sp?.r}) — ` +
    `odległość do najbliższego budynku ${sp && blds.length ? Math.min(...blds.map(b => hexDist(sp, b))) : '?'}`);
}

// ── P5 — przejęcia i desant AI bez terminu wojny ─────────────────────────────────────────
{
  console.log('\nP5 — przejęcie i launchInvasion nie pytają o wojnę');
  const w = boot();
  const inv = w.K.invasionSystem;
  const dipl = w.K.diplomacySystem;

  // P5a — gracz przejmuje kolonię AI w stanie pokoju
  const col = landCapital(w);
  const emp = col?.ownerEmpireId;
  const cap = capitalOf(col);
  const st = dipl.getStatus(emp);
  cap.owner = 'player';                       // okupacja stolicy już zakończona (stan wejściowy)
  assert(st === 'peace' && w.gum.getUnitsOnPlanet(col.planetId).length === 0,
    `świadek: relacja z ${emp} = ${st}, na ciele 0 jednostek`);
  const took = inv._tryPlayerCapture(col.planetId);
  assert(took === true && !w.cm.getColony(col.planetId)?.ownerEmpireId && dipl.getStatus(emp) === 'peace',
    `P5a: _tryPlayerCapture przejmuje kolonię AI w POKOJU (wynik ${took}, ` +
    `właściciel ${w.cm.getColony(col.planetId)?.ownerEmpireId ?? 'gracz'})`);

  // P5b — AI ląduje na kolonii gracza w stanie pokoju
  const other = w.aiFull.find(c => c !== col)?.ownerEmpireId ?? emp;
  const st2 = dipl.getStatus(other);
  const res = inv.launchInvasion(other, w.home.planetId, 2);
  const landed = (res?.landed ?? []).map(id => w.gum.getUnit(id)).filter(Boolean);
  assert(st2 === 'peace' && res?.success === true && landed.length === 2 && landed.every(u => u.owner === other),
    `P5b: launchInvasion w POKOJU (${st2}) ląduje ${landed.length} jednostek ${other} na ${w.home.planetId}`);

  // P5c — AI przejmuje kolonię gracza w stanie pokoju (aktywny rekord inwazji, stolica w ręku AI)
  const hcap = capitalOf(w.home);
  hcap.owner = other;
  const playerAlive = w.gum.getUnitsOnPlanet(w.home.planetId).filter(u => (u.owner ?? 'player') === 'player').length;
  inv._tickCaptureChecks(1);
  assert(playerAlive === 0 && w.cm.getColony(w.home.planetId)?.ownerEmpireId === other && dipl.getStatus(other) === 'peace',
    `P5c: _tickCaptureChecks przejmuje kolonię GRACZA w POKOJU (jednostek gracza ${playerAlive}, ` +
    `właściciel ${w.cm.getColony(w.home.planetId)?.ownerEmpireId})`);
}

// ── P6 — zmiana właściciela / zniszczenie ciała nie rusza jednostek ─────────────────────
{
  console.log('\nP6 — captureColonyForPlayer / transferColony / removeColony zostawiają jednostki');
  const w = boot();
  const col = landCapital(w);
  const emp = col?.ownerEmpireId;
  const cap = capitalOf(col);

  const g = w.gum.createUnit('garrison_unit', col.planetId, cap.q, cap.r, { owner: emp, factionId: emp });
  w.cm.captureColonyForPlayer(col.planetId, 'g2_seams');
  assert(!w.cm.getColony(col.planetId)?.ownerEmpireId && w.gum.getUnit(g.id)?.owner === emp,
    `P6a: po captureColonyForPlayer jednostka poprzedniego właściciela (${emp}) zostaje na ciele`);

  const hcap = capitalOf(w.home);
  const p = w.gum.createUnit('shock_infantry', w.home.planetId, hcap.q, hcap.r, { owner: 'player', factionId: 'humanity' });
  w.cm.transferColony(w.home.planetId, emp, 'g2_seams');
  assert(w.cm.getColony(w.home.planetId)?.ownerEmpireId === emp && w.gum.getUnit(p.id)?.owner === 'player',
    `P6b: po transferColony jednostka gracza zostaje na ciele przejętym przez ${emp}`);

  const other = w.aiFull.find(c => c !== col && c.ownerEmpireId) ?? null;
  const ocap = capitalOf(other);
  const o = w.gum.createUnit('garrison_unit', other.planetId, ocap.q, ocap.r,
    { owner: other.ownerEmpireId, factionId: other.ownerEmpireId });
  w.cm.removeColony(other.planetId, 'destroyed');
  assert(!w.cm.getColony(other.planetId) && w.gum.getUnit(o.id)?.planetId === other.planetId,
    `P6c: po removeColony jednostka zostaje zarejestrowana na ciele bez kolonii (osierocona)`);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
