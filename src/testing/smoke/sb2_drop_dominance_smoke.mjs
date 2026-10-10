// AI STRIKES BACK S2 — keeper B2 (SB35, Finding 406): `dropTroop` odmawia zrzutu bez dominacji orbitalnej właściciela
// jednostki — w CHWILI ZRZUTU, nie tylko przy wejściu w tryb. Plan: `docs/design/AI_STRIKES_BACK_PLAN.md` §6 (406).
//
//   D1  wojna; nad kolonią AI w jej układzie UZBROJONY kadłub AI na ORBICIE (walczący w przestrzeni) — zrzut gracza:
//       odmowa `no_orbital_dominance`, jednostka zostaje w ładowni; świadek: dominacja gracza `false` przed zrzutem
//   D2  KONTROLA: ten sam kadłub ZADOKOWANY (nie odbiera dominacji, S0-3) — zrzut przechodzi, jednostka na ciele
//   D3  KONTROLA: ciało WŁASNE gracza — zrzut przechodzi mimo wrogiego kadłuba na orbicie w tym układzie (jak przy
//       wejściu w tryb: własne kolonie bez bitwy); świadek: dominacja gracza w tym układzie `false`
//   D4  strona AI (jedna reguła dla obu stron): jednostka imperium nad kolonią GRACZA z uzbrojonym okrętem gracza na
//       orbicie — odmowa; KONTROLA: bez okrętu gracza — zrzut przechodzi
//   D5  mapa kolonii: tryb zrzutu mapuje odmowę `NO_ORBITAL_DOMINANCE` na `t('drop.lostDominance')` i kończy tryb z tym
//       komunikatem (`_finishDropMode(msg)`) — pin źródłowy (ColonyOverlay nie importuje się pod node)
//   D6  i18n: `drop.lostDominance` PL + EN, różne języki, inny tekst niż „wygraj bitwę” (`drop.noDominance`)
//   D7  komentarze mówią prawdę: `WarSystem` i nagłówek `dropTroop` nie twierdzą już, że dominację sprawdza wyłącznie
//       wołający
//
// ⚠ Świat: `bootWithDirector`; pula WYŁĄCZONA w setupie (`fleetPoolSystem.enabled = false` — narzędzie testów, R-B2b),
//   żeby scena miała dokładnie jeden kadłub AI. Wzór sceny: sonda audytu S2 `probe406_b.mjs`.
// ⚠ Fail-first: na drzewie sprzed poprawki czerwone D1, D4, D5, D6, D7; KONTROLE (D2, D3, D4b) zielone po obu stronach.

import '../headless/env.js';           // MUSI być pierwszy
import EventBus from '../../core/EventBus.js';
import { bootWithDirector } from '../headless/DirectorHarness.js';
import * as VS from '../../entities/Vessel.js';
import { templateTraits } from '../../utils/FleetPoolPlanner.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC  = path.resolve(here, '../..');
const readRaw = (r) => readFileSync(path.join(SRC, r), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
const quiet = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };

const DOMINANCE = 'no_orbital_dominance';

/** Uzbrojony kadłub `owner` w układzie ciała `bodyId`, w stanie `state` przy tym ciele. */
function placeHull(K, owner, bodyId, state) {
  const body = K.entityManager.get(bodyId);
  const t = templateTraits('frigate_system_defender');
  const g = VS.createVessel(t.hullId, bodyId, { name: 'H', modules: [...t.modules], systemId: body.systemId, x: body.x, y: body.y });
  if (owner !== 'player') { g.ownerEmpireId = owner; g.owner = owner; g.isEnemy = true; }
  g.serviceState = 'active';
  g.position.state = state; g.position.dockedAt = bodyId;
  K.vesselManager._vessels.set(g.id, g);
  quiet(() => EventBus.emit('vessel:created', { vessel: g }));
  return g;
}

/** Statek z kapsułami nad ciałem `bodyId` z załadowaną jednostką `unit`. */
function dropShip(K, homeId, bodyId, unit, owner = 'player') {
  const body = K.entityManager.get(bodyId);
  const v = K.vesselManager.createAndRegister('hull_small', homeId);
  if (owner !== 'player') { v.ownerEmpireId = owner; v.owner = owner; v.isEnemy = true; }
  v.canDropTroops = true; v.troopCapacity = 12; v.troopBayUsed = 0; v.groundUnits = []; v.status = 'idle';
  v.systemId = body.systemId;
  const load = VS.loadGroundUnit(v, unit);
  v.position = { ...v.position, state: 'orbiting', dockedAt: bodyId, x: body.x, y: body.y };
  return { v, load };
}

/** Scena gracza: wojna z imperium kolonii AI, jednostka gracza w ładowni nad tą kolonią, kadłub AI w stanie `state`. */
function playerScene(state) {
  const { core, K } = quiet(() => bootWithDirector({ quiet: true }));
  K.fleetPoolSystem.enabled = false;
  const cm = core.colonyManager, gum = K.groundUnitManager;
  const home = cm.getColony(K.homePlanet.id);
  const ai = cm.getAllColonies().find((c) => c.ownerEmpireId && !c.isOutpost);
  quiet(() => K.diplomacySystem.declareWar(ai.ownerEmpireId, 'keeper_setup'));
  const ht = home.grid.toArray().find((x) => x && x.type !== 'ocean' && !x.capitalBase);
  const u = gum.createUnit('shock_infantry', home.planetId, ht.q, ht.r, { owner: 'player', factionId: 'humanity' });
  const { v, load } = dropShip(K, home.planetId, ai.planetId, u);
  const g = state ? placeHull(K, ai.ownerEmpireId, ai.planetId, state) : null;
  const land = ai.grid.toArray().find((x) => x && x.type !== 'ocean' && !x.capitalBase);
  const dom = K.warSystem.playerHasOrbitalDominance(ai.planetId);
  const res = VS.dropTroop(v, u, ai.planetId, land.q, land.r);
  return { K, ai, u, v, g, load, dom, res, onBody: u.planetId === ai.planetId && u.status !== 'in_cargo', inCargo: v.groundUnits.includes(u.id) && u.status === 'in_cargo' };
}

// ── D1 / D2 — kolonia AI: kadłub na orbicie / w doku ─────────────────────────────────────────────
console.log('\nD1 — kadłub AI na orbicie: zrzut odmówiony w chwili zrzutu');
{
  const s = playerScene('orbiting');
  assert(s.load?.ok === true && s.dom === false && s.res?.ok === false && s.res?.reason === DOMINANCE && s.inCargo,
    `D1: dominacja gracza ${s.dom} → dropTroop ${JSON.stringify(s.res)}, jednostka w ładowni: ${s.inCargo}`);
}
console.log('\nD2 — KONTROLA: ten sam kadłub w DOKU — zrzut przechodzi');
{
  const s = playerScene('docked');
  assert(s.load?.ok === true && s.dom === true && s.res?.ok === true && s.onBody,
    `D2 (KONTROLA): kadłub AI w doku — dominacja ${s.dom}, dropTroop ${JSON.stringify(s.res)}, jednostka na ciele: ${s.onBody}`);
}

// ── D3 — ciało własne ────────────────────────────────────────────────────────────────────────────
console.log('\nD3 — KONTROLA: zrzut na WŁASNĄ kolonię nie pyta o dominację');
{
  const { core, K } = quiet(() => bootWithDirector({ quiet: true }));
  K.fleetPoolSystem.enabled = false;
  const cm = core.colonyManager, gum = K.groundUnitManager;
  const home = cm.getColony(K.homePlanet.id);
  const emp = K.empireRegistry.listIds()[0];
  quiet(() => K.diplomacySystem.declareWar(emp, 'keeper_setup'));
  const tiles = home.grid.toArray().filter((x) => x && x.type !== 'ocean' && !x.capitalBase);
  const u = gum.createUnit('shock_infantry', home.planetId, tiles[0].q, tiles[0].r, { owner: 'player', factionId: 'humanity' });
  const { v, load } = dropShip(K, home.planetId, home.planetId, u);
  placeHull(K, emp, home.planetId, 'orbiting');
  const dom = K.warSystem.playerHasOrbitalDominance(home.planetId);
  const res = VS.dropTroop(v, u, home.planetId, tiles[1].q, tiles[1].r);
  assert(load?.ok === true && dom === false && res?.ok === true && u.status !== 'in_cargo',
    `D3 (KONTROLA): własna kolonia, dominacja gracza ${dom} — dropTroop ${JSON.stringify(res)}`);
}

// ── D4 — strona AI ───────────────────────────────────────────────────────────────────────────────
console.log('\nD4 — strona AI: ta sama reguła dla jednostki imperium nad kolonią gracza');
{
  const scene = (withPlayerHull) => {
    const { core, K } = quiet(() => bootWithDirector({ quiet: true }));
    K.fleetPoolSystem.enabled = false;
    const cm = core.colonyManager, gum = K.groundUnitManager;
    const home = cm.getColony(K.homePlanet.id);
    const ai = cm.getAllColonies().find((c) => c.ownerEmpireId && !c.isOutpost);
    const emp = ai.ownerEmpireId;
    quiet(() => K.diplomacySystem.declareWar(emp, 'keeper_setup'));
    const at = ai.grid.toArray().find((x) => x && x.type !== 'ocean' && !x.capitalBase);
    const r = gum.createAIUnit({ archetypeId: 'shock_infantry', empireId: emp, planetId: ai.planetId, q: at.q, r: at.r, morale: 50, deployed: false });
    const { v, load } = dropShip(K, ai.planetId, home.planetId, r.unit, emp);
    if (withPlayerHull) placeHull(K, 'player', home.planetId, 'orbiting');
    const dom = K.warSystem.hasOrbitalDominanceInSystem(emp, K.entityManager.get(home.planetId).systemId);
    const land = home.grid.toArray().find((x) => x && x.type !== 'ocean' && !x.capitalBase);
    const res = VS.dropTroop(v, r.unit, home.planetId, land.q, land.r);
    return { ok: r.ok, load, dom, res, inCargo: v.groundUnits.includes(r.unit.id) };
  };
  const a = scene(true);
  assert(a.ok && a.load?.ok === true && a.dom === false && a.res?.ok === false && a.res?.reason === DOMINANCE && a.inCargo,
    `D4: okręt gracza na orbicie — dominacja imperium ${a.dom}, dropTroop ${JSON.stringify(a.res)}`);
  const b = scene(false);
  assert(b.ok && b.load?.ok === true && b.dom === true && b.res?.ok === true && !b.inCargo,
    `D4b (KONTROLA): bez okrętu gracza — dominacja imperium ${b.dom}, dropTroop ${JSON.stringify(b.res)}`);
}

// ── D5 — mapa kolonii ────────────────────────────────────────────────────────────────────────────
console.log('\nD5 — mapa kolonii: odmowa widoczna w otwartym trybie zrzutu');
{
  const co = stripComments(readRaw('ui/ColonyOverlay.js'));
  const at = co.indexOf('const res = dropTroop(vessel, unit, this._dropPlanetId, tile.q, tile.r);');
  const blk = at >= 0 ? co.slice(at, at + 900) : '';
  const mapIdx = blk.search(/res\?\.reason\s*===\s*NO_ORBITAL_DOMINANCE\s*\?\s*t\('drop\.lostDominance'\)/);
  const finIdx = blk.indexOf('this._finishDropMode(msg);');
  assert(at > 0 && mapIdx > 0 && finIdx > mapIdx,
    `D5: blok kliknięcia trybu zrzutu — NO_ORBITAL_DOMINANCE → t('drop.lostDominance') → _finishDropMode(msg) (@${mapIdx} < @${finIdx})`);
  assert(/import\s*\{[^}]*\bNO_ORBITAL_DOMINANCE\b[^}]*\}\s*from\s*'\.\.\/entities\/Vessel\.js'/.test(co) && VS.NO_ORBITAL_DOMINANCE === DOMINANCE,
    `D5b: ColonyOverlay importuje stałą powodu z Vessel.js (${VS.NO_ORBITAL_DOMINANCE})`);
}

// ── D6 — i18n ────────────────────────────────────────────────────────────────────────────────────
console.log('\nD6 — i18n PL + EN');
{
  const PL = (await import('../../i18n/pl.js')).default, EN = (await import('../../i18n/en.js')).default;
  const k = 'drop.lostDominance';
  assert(typeof PL[k] === 'string' && PL[k].length > 0 && typeof EN[k] === 'string' && EN[k].length > 0 && PL[k] !== EN[k]
    && PL[k] !== PL['drop.noDominance'] && EN[k] !== EN['drop.noDominance'],
    `D6: ${k} — PL „${PL[k]}”, EN „${EN[k]}” (inny niż drop.noDominance)`);
}

// ── D7 — komentarze ──────────────────────────────────────────────────────────────────────────────
console.log('\nD7 — komentarze nie twierdzą już, że dominację sprawdza wyłącznie wołający');
{
  const ws = readRaw('systems/WarSystem.js'), vs = readRaw('entities/Vessel.js');
  assert(ws.length > 1000 && vs.length > 1000 && !/dominacji NIE sprawdza/.test(ws) && !/dominacji orbitalnej \(sprawdza caller\)/.test(vs),
    'D7: WarSystem.playerHasOrbitalDominance i nagłówek dropTroop — bez „dominacji NIE sprawdza” / „(sprawdza caller)”');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
