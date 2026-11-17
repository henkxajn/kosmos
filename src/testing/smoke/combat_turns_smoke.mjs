// ═══════════════════════════════════════════════════════════════════════════════
// combat_turns_smoke — KEEPER Findingu 450 (POLISH P2b, krok D5; CP24 — „450 w P2b, jeśli mały”)
// Rejestr: `docs/design/POLISH_PLAN.md` §6 (450) i §12 (P2b).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: okno wyniku bitwy w przestrzeni pokazywało zawsze „Tur: 0”, Dziennik „0 tur” / „0 turns”, lista bitew wojny
//   „0” — rekord bitwy DSCS (`_finalizeBattle`) nie miał pola `turns`, a trzej czytelnicy czytali `turns ?? 0`
//   (P2 §10.7: zmierzone w grze EN i PL przy 16 rundach).
// KSZTAŁT: jedno pole `turns: encounter.currentRound` w rekordzie bitwy DSCS; czytelnicy bez zmian. Stare rekordy bez
//   pola — `?? 0` (zapis v101 bez migracji). Napis „Tur:” zostaje (163 — backlog, CP24).
// ⚠ DSCS, `WarSystem.recordBattle` i `BattleIntroModal` importują się pod node ⇒ WYKONANIE; `GameScene` — pin źródłowy
//   (komentarze zdjęte). Lista bitew wojny: od KZ (ARC KONSOLE) rysuje ją WYŁĄCZNIE inspektor konsoli Wojen
//   (`WarConsoleView.drawInspector`; stary 2-kolumnowy panel usunięty) — T5b pin źródłowy na widoku konsoli,
//   T5b2 WYKONANIE (`WarOverlay` importuje się pod node): rekord z T3 renderuje się z liczbą tur.
//
// PINY:
//   T1  PRAWDZIWE starcie DSCS do rozstrzygnięcia: `battle:resolved` niesie `turns` = liczba rund (`currentRound`
//       = długość `timeline`; KONTROLA: starcie trwało kilka rund)
//   T2  rekord w stanie gry (`battles.<id>`) — to samo pole (jedzie w zapisie)
//   T3  `WarSystem.recordBattle` (lista bitew wojny) przepisuje `turns` z wyniku DSCS
//   T4  okno wyniku (`showBattleOutcome`): „Tur: N” z rekordu DSCS; KONTROLA: rekord bez pola (stary zapis) — „Tur: 0”
//   T5  źródło: Dziennik (`GameScene`, `log.battleLine`) i lista bitew wojny (konsola Wojen: `WarConsoleView`) czytają
//       `turns`; T5b2 — konsola rysuje „tur: N” z rekordu `recordBattle` (wykonanie); DSCS — pole w `_finalizeBattle`,
//       bez czasu realnego
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import gameState               from '../../core/GameState.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import { WarSystem }           from '../../systems/WarSystem.js';
import * as DSCSmod            from '../../systems/DeepSpaceCombatSystem.js';
import { showBattleOutcome }   from '../../ui/BattleIntroModal.js';
import { readFileSync }        from 'node:fs';
import PL                      from '../../i18n/pl.js';
import EN                      from '../../i18n/en.js';
// KZ — konsola Wojen dynamicznie: awaria importu degraduje T5b2, nie zabija przebiegu.
const WarOverlayMod = await import('../../ui/WarOverlay.js').catch((e) => { console.log('  ! import WarOverlay: ' + e.message); return null; });

const { DeepSpaceCombatSystem, ROUND_INTERVAL_MS } = DSCSmod;

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

const AU  = GAME_CONFIG.AU_TO_PX;
const SYS = 'sys_t';
const EMP = 'emp_t';

// ═══ T1 ═══════════════════════════════════════════════════════════════════════
header('T1  PRAWDZIWE starcie DSCS: `battle:resolved` niesie liczbę rund');
let res = null, enc = null;
{
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  window.KOSMOS = { timeSystem: { gameTime: 100, simClockMs: 1000 }, activeSystemId: SYS };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Home', systemId: SYS, x: -3 * AU, y: 0, radius: 4, mass: 1, visual: { radius: 4 } });
  const vMgr = new VesselManager(); const mos = new MovementOrderSystem(vMgr); const dscs = new DeepSpaceCombatSystem(vMgr);
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {} }];
  Object.assign(window.KOSMOS, {
    civMode: true, vesselManager: vMgr, movementOrderSystem: mos, deepSpaceCombatSystem: dscs,
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find((c) => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    intelSystem: { getVesselContact: () => ({ quality: 'contact' }) },
    eventLogSystem: { push: () => {} }, debug: { combatTrace: false },
  });
  const ship = (x, y, name, modules, empire = null) => {
    const v = vMgr.createAndRegister('hull_frigate', 'p_home', { name, modules });
    v.position.x = x; v.position.y = y; v.position.state = 'orbiting'; v.position.dockedAt = null;
    v.status = 'idle'; v.mission = null; v.fuel.current = v.fuel.max = 9999; v.systemId = SYS;
    if (empire) { v.ownerEmpireId = empire; v.owner = empire; v.isEnemy = true; }
    return v;
  };
  const me = ship(0, 2 * AU, 'Me', ['weapon_laser', 'engine_ion']);
  const foe = ship(0, 2 * AU + 0.28 * AU, 'Foe', ['weapon_missile', 'weapon_missile', 'engine_ion', 'armor_heavy'], EMP);
  EventBus.on('battle:resolved', (p) => { if (!res) res = p?.result ?? null; });
  mos.issueOrder(me.id, { type: 'engage', targetEntityId: foe.id, issuedBy: 'keeper' });
  dscs.handleCombatRangeEnter(me.id, foe.id, false);
  enc = dscs._findActiveEncounterContaining(foe.id);
  for (let i = 0; i < 40 && enc?.isActive; i++) { window.KOSMOS.timeSystem.simClockMs += ROUND_INTERVAL_MS; dscs._tick(0.01); }
  console.log(`     rund ${enc?.currentRound}; timeline ${res?.timeline?.length}; turns w rekordzie ${JSON.stringify(res?.turns)}`);
  assert(!!res && !enc.isActive && enc.currentRound >= 3, 'T1-0 KONTROLA: starcie rozstrzygnięte po kilku rundach');
  assert(res?.turns === enc.currentRound && res.turns === res.timeline.length, 'T1 SEDNO: `turns` = liczba rund (`currentRound` = długość `timeline`)');
}

// ═══ T2 ═══════════════════════════════════════════════════════════════════════
header('T2  rekord w stanie gry');
{
  const rec = res ? gameState.get(`battles.${res.id}`) : null;
  console.log(`     battles.${res?.id}.turns = ${JSON.stringify(rec?.turns)}`);
  assert(!!rec && rec.turns === enc.currentRound, 'T2 rekord bitwy w stanie gry (jedzie w zapisie) — to samo pole');
}

// ═══ T3 ═══════════════════════════════════════════════════════════════════════
header('T3  `WarSystem.recordBattle` — lista bitew wojny');
let warOut = null;   // rekord listy bitew wojny — T5b2 renderuje go w konsoli Wojen
{
  const war = { id: 'war_t', aggressor: 'player', defender: EMP, casusBelli: 'border_incident', battles: [] };
  gameState.set('wars.war_t', war, 'keeper');
  const fake = { getWar: () => war, _year: () => 100.5, changeExhaustion: () => {}, _battleLoserSide: () => null, _updateOrbitalDominance: () => {} };
  const out = res ? WarSystem.prototype.recordBattle.call(fake, 'war_t', res, { announce: false }) : null;
  warOut = out;
  console.log(`     rekord wojny: turns ${JSON.stringify(out?.turns)}`);
  assert(!!out && out.turns === enc.currentRound, 'T3 lista bitew wojny dostaje liczbę rund (dawniej 0)');
}

// ═══ T4 ═══════════════════════════════════════════════════════════════════════
header('T4  okno wyniku: „Tur: N”');
{
  const banner = (rec) => {
    const before = document.body.children.length;
    showBattleOutcome({ result: rec, playerSide: 'A', aggressorName: 'Gracz', defenderName: 'Liga' });
    const added = document.body.children.slice(before);
    const all = [...added, ...added.flatMap((e) => e.children ?? [])];
    return all.map((e) => e.innerHTML ?? '').find((h) => /Tur:/.test(h)) ?? '';
  };
  const h1 = res ? banner(res) : '';
  const turnsShown = Number(/Tur:\s*(\d+)/.exec(h1)?.[1]);
  const { turns, ...legacy } = res ?? {};
  const h0 = res ? banner(legacy) : '';
  const turns0 = Number(/Tur:\s*(\d+)/.exec(h0)?.[1]);
  console.log(`     okno wyniku: „Tur: ${turnsShown}” · rekord bez pola (stary zapis): „Tur: ${turns0}”`);
  assert(turns0 === 0, 'T4-0 KONTROLA: rekord bez pola — „Tur: 0” (dawny objaw, stare rekordy)');
  assert(turnsShown === enc.currentRound && turnsShown > 0, 'T4 SEDNO: okno wyniku pokazuje liczbę rund');
}

// ═══ T5 ═══════════════════════════════════════════════════════════════════════
header('T5  źródło: Dziennik, lista bitew wojny, DSCS');
{
  const gs = strip(readFileSync(new URL('../../scenes/GameScene.js', import.meta.url), 'utf8'));
  const i = gs.indexOf("t('log.battleLine'"); const line = i < 0 ? '' : gs.slice(i, gs.indexOf(')', gs.indexOf('result.turns', i)) + 1);
  assert(/result\.turns \?\? 0/.test(line), 'T5a Dziennik (`log.battleLine`) czyta `result.turns`');
  const wo = strip(readFileSync(new URL('../../ui/WarConsoleView.js', import.meta.url), 'utf8'));
  assert(/warOverlay\.battleLosses', b\.lossesA, b\.lossesB, b\.turns\)/.test(wo), 'T5b lista bitew wojny (konsola: `WarConsoleView`) czyta `b.turns`');
  // T5b2 — WYKONANIE: rekord z T3 w inspektorze konsoli Wojen (lista „ostatnie bitwy”).
  const texts = [];
  const store = {};
  const ctx = new Proxy(store, {
    get: (o, k) => {
      if (k === 'fillText') return (s) => texts.push(String(s));
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: () => {} });
      if (k in o) return o[k];
      return () => {};
    },
    set: (o, k, v) => { o[k] = v; return true; },
  });
  const savedK = window.KOSMOS;
  const bid = 'bt_turns';
  const war = { id: 'war_t', aggressor: 'player', defender: EMP, active: true, startYear: 100, casusBelli: 'border_incident',
    exhaustion: { player: 10, [EMP]: 20 }, battles: [bid] };
  window.KOSMOS = {
    timeSystem: { gameTime: 101 },
    warSystem: { listAll: () => [war], listActive: () => [war], getWar: (id) => (id === war.id ? war : null) },
    empireRegistry: { get: () => ({ id: EMP, name: 'Liga', archetype: 'militarist' }) },
    gameState: { get: (p) => (p === `battles.${bid}` ? warOut : undefined) },
    diplomacySystem: { getRefusalYearsLeft: () => 0 },
  };
  let threw = null;
  try {
    const ov = new WarOverlayMod.WarOverlay(); ov.visible = true; ov.show(); ov.draw(ctx, 1280, 833);
  } catch (e) { threw = e?.message ?? 'throw'; }
  window.KOSMOS = savedK;
  const fill = (tpl) => String(tpl ?? '').replace('{0}', warOut?.lossesA).replace('{1}', warOut?.lossesB).replace('{2}', warOut?.turns);
  const want = [PL['warOverlay.battleLosses'], EN['warOverlay.battleLosses']].filter(Boolean).map(fill);
  const battleLine = texts.find((s) => want.includes(s)) ?? null;
  console.log(`     konsola Wojen: ${JSON.stringify(battleLine)}${threw ? ' — ' + threw : ''}`);
  assert(threw === null && !!warOut && warOut.turns > 0 && want.length === 2 && battleLine !== null && battleLine.includes(String(warOut.turns)),
    'T5b2 konsola Wojen (WYKONANIE): wiersz bitwy z rekordu `recordBattle` niesie liczbę tur (' + warOut?.turns + ')');
  const ds = strip(readFileSync(new URL('../../systems/DeepSpaceCombatSystem.js', import.meta.url), 'utf8'));
  // M1 (decyzja 33) — sygnatura dostała parametr `endReason`; lokalizacja po prefiksie (intencja pinu bez zmian).
  const f = ds.indexOf('  _finalizeBattle(encounter, winner, retreated'); const fb = f < 0 ? '' : ds.slice(f, ds.indexOf('\n  }\n', f));
  assert(/turns:\s*encounter\.currentRound,/.test(fb) && !/performance\.now|Date\.now|_nowMs/.test(ds), 'T5c DSCS: pole w `_finalizeBattle`, plik bez czasu realnego');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
