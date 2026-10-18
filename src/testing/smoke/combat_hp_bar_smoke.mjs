// ═══════════════════════════════════════════════════════════════════════════════
// combat_hp_bar_smoke — KEEPER Findingu 451 (POLISH P2b, krok D2; decyzje CP16, CP18)
// Rejestr: `docs/design/POLISH_PLAN.md` §6 (451) i §12 (P2b).
// ─────────────────────────────────────────────────────────────────────────────
// CO ZAMYKA: HP pojedynczego statku nie było widoczne nigdzie — panel walki pokazuje wyłącznie zbiorcze paski stron,
//   a trafienie nie zmieniało wyglądu statku (błysk to osobna kula w kolorze broni przy celu; P2 §10.4).
// KSZTAŁT: CP16 — cienki pasek HP (~40 × 5 px ekranu) pod KAŻDYM uczestnikiem AKTYWNEGO starcia w oglądanym układzie,
//   obie strony, kolor właściciela; pojawia się ze startem starcia, znika z jego końcem (poległy w trakcie — pusty pasek).
//   CP18 — biały błysk trafienia NA MODELU, stałe 200 ms (addytywny billboard dopasowany do modelu, z podłogą 12 px).
// ⚠ `ThreeRenderer` nie importuje się pod node ⇒ plan pasków i rozmiar błysku w czystym `VesselFxLogic` (wykonanie,
//   także na PRAWDZIWYM starciu DSCS), rysowanie — pin źródłowy (komentarze zdjęte).
//
// PINY:
//   T1  `hpBarFrac` — hp / hpStart w [0, 1]; brak stanu, hpStart ≤ 0, hp ujemne → 0 / przycięte
//   T2  `planCombatHpBars` — tabela: aktywne starcie w widoku → obie strony (wróg wg właściciela strony, dołączający też);
//       starcie w innym układzie / nieaktywne → brak; poległy → pusty pasek (frac 0)
//   T3  PRAWDZIWE starcie DSCS: po każdej rundzie pasek dla KAŻDEGO uczestnika, ułamek = hp / hpStart ze stanu starcia,
//       spadek przy trafieniu (KONTROLA: trafienia w starciu są), po rozstrzygnięciu — brak pasków
//   T4  `HP_BAR` 40 × 5 px; `HIT_GLOW` biały, 200 ms (CP18); `hitGlowWorldSize` — model × 1,6, podłoga 12 px na ekranie
//   T5  źródło `ThreeRenderer` — paski: synchronizacja co klatkę w pętli renderu przez plan; rozmiar ekranowy z głębi;
//       kolor właściciela; pod modelem; usuwanie pasków spoza planu; „czysty widok” (SHIFT) je chowa
//   T6  źródło `ThreeRenderer` — błysk: każde trafienie salwy (z id celu) → `_spawnHitGlow` w chwili uderzenia; rodzaj
//       `hitGlow`, czas `HIT_GLOW.MS`, kolor biały, addytywnie, za sprite'em celu, rozmiar `hitGlowWorldSize`
// ═══════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import EventBus                from '../../core/EventBus.js';
import EntityManager           from '../../core/EntityManager.js';
import { GAME_CONFIG }         from '../../config/GameConfig.js';
import { VesselManager }       from '../../systems/VesselManager.js';
import { MovementOrderSystem } from '../../systems/MovementOrderSystem.js';
import * as DSCSmod            from '../../systems/DeepSpaceCombatSystem.js';
import * as FX                 from '../../utils/VesselFxLogic.js';
import { readFileSync }        from 'node:fs';

const { DeepSpaceCombatSystem, ROUND_INTERVAL_MS } = DSCSmod;

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const strip = (s) => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const fn = (name) => (typeof FX[name] === 'function' ? FX[name] : () => undefined);
const frac = fn('hpBarFrac'); const plan = fn('planCombatHpBars'); const glowSize = fn('hitGlowWorldSize');

const AU  = GAME_CONFIG.AU_TO_PX;
const SYS = 'sys_t';
const EMP = 'emp_t';

// ═══ T1 ═══════════════════════════════════════════════════════════════════════
header('T1  `hpBarFrac`');
{
  assert(frac({ hp: 60, hpStart: 120 }) === 0.5 && frac({ hp: 120, hpStart: 120 }) === 1, 'T1a hp / hpStart');
  assert(frac({ hp: -20.8, hpStart: 120 }) === 0 && frac({ hp: 150, hpStart: 120 }) === 1, 'T1b przycięte do [0, 1] (poległy — 0)');
  assert(frac(null) === 0 && frac({ hp: 10, hpStart: 0 }) === 0 && frac({ hp: NaN, hpStart: 10 }) === 0, 'T1c brak stanu / hpStart ≤ 0 / hp nieokreślone → 0');
}

// ═══ T2 ═══════════════════════════════════════════════════════════════════════
header('T2  `planCombatHpBars` — tabela');
{
  const enc = (o = {}) => ({ id: 'e1', isActive: true, location: { systemId: 'sys_a', point: { x: 0, y: 0 } },
    sideA: { vesselIds: ['a1', 'a2'], joinedVesselIds: ['a3'], ownerEmpireId: 'player' },
    sideB: { vesselIds: ['b1'], joinedVesselIds: [], ownerEmpireId: 'emp_x' },
    vesselStates: new Map([['a1', { hp: 120, hpStart: 120 }], ['a2', { hp: -5, hpStart: 120 }], ['a3', { hp: 30, hpStart: 120 }], ['b1', { hp: 90, hpStart: 180 }]]),
    ...o });
  const p = plan({ encounters: [enc()], activeSystemId: 'sys_a' }) ?? [];
  console.log(`     ${JSON.stringify(p)}`);
  const by = (id) => p.find((b) => b.vesselId === id);
  assert(p.length === 4 && ['a1', 'a2', 'a3', 'b1'].every((id) => !!by(id)), 'T2a SEDNO: aktywne starcie w widoku — pasek dla każdego uczestnika obu stron (dołączający też)');
  assert(by('b1')?.enemy === true && by('a1')?.enemy === false && by('b1')?.frac === 0.5 && by('a3')?.frac === 0.25, 'T2b wróg wg właściciela strony; ułamki ze stanu starcia');
  assert(by('a2')?.frac === 0, 'T2c poległy w trakcie starcia — pusty pasek (wrak dopiero na końcu starcia)');
  assert((plan({ encounters: [enc()], activeSystemId: 'sys_b' }) ?? [1]).length === 0, 'T2d starcie w innym układzie — brak pasków');
  assert((plan({ encounters: [enc({ isActive: false })], activeSystemId: 'sys_a' }) ?? [1]).length === 0, 'T2e starcie rozstrzygnięte — brak pasków');
}

// ═══ T3 ═══════════════════════════════════════════════════════════════════════
header('T3  PRAWDZIWE starcie DSCS: paski co rundę, spadek przy trafieniu, brak po rozstrzygnięciu');
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
  mos.issueOrder(me.id, { type: 'engage', targetEntityId: foe.id, issuedBy: 'keeper' });
  dscs.handleCombatRangeEnter(me.id, foe.id, false);
  const enc = dscs._findActiveEncounterContaining(foe.id);
  let rounds = 0, everyRoundAll = true, fracsMatch = true, fracChecks = 0, drops = 0, hits = 0;
  const prev = new Map();
  for (let i = 0; i < 40 && enc?.isActive; i++) {
    window.KOSMOS.timeSystem.simClockMs += ROUND_INTERVAL_MS; dscs._tick(0.01);
    const live = dscs.listActive();
    const bars = plan({ encounters: live, activeSystemId: SYS }) ?? [];
    if (!enc.isActive) { if (bars.length !== 0) everyRoundAll = false; break; }
    rounds++;
    hits += (enc.timeline.at(-1)?.events ?? []).filter((e) => e.hit && e.damage > 0).length;
    const ids = [...enc.sideA.vesselIds, ...enc.sideB.vesselIds];
    if (!ids.every((id) => bars.some((b) => b.vesselId === id))) everyRoundAll = false;
    for (const b of bars) {
      const st = enc.vesselStates.get(b.vesselId);
      fracChecks++;
      if (Math.abs(b.frac - Math.max(0, Math.min(1, st.hp / st.hpStart))) > 1e-12) fracsMatch = false;
      if (prev.has(b.vesselId) && b.frac < prev.get(b.vesselId)) drops++;
      prev.set(b.vesselId, b.frac);
    }
  }
  const after = plan({ encounters: dscs.listActive(), activeSystemId: SYS }) ?? [1];
  console.log(`     rund ${rounds}; trafień z obrażeniami ${hits}; spadków paska ${drops}; po rozstrzygnięciu pasków ${after.length}`);
  assert(rounds >= 2 && hits > 0, 'T3-0 KONTROLA: starcie trwa kilka rund i są trafienia z obrażeniami');
  assert(rounds > 0 && everyRoundAll, 'T3a SEDNO: po każdej rundzie pasek dla każdego uczestnika');
  assert(fracChecks > 0 && fracsMatch, 'T3b ułamek paska = hp / hpStart ze stanu starcia (porównań > 0 — bez pasków pin nie przechodzi jałowo)');
  assert(drops > 0, 'T3c pasek spada przy trafieniu');
  assert(!enc.isActive && after.length === 0, 'T3d po rozstrzygnięciu — brak pasków');
}

// ═══ T4 ═══════════════════════════════════════════════════════════════════════
header('T4  `HP_BAR`, `HIT_GLOW`, `hitGlowWorldSize`');
{
  assert(FX.HP_BAR?.W_PX === 40 && FX.HP_BAR?.H_PX === 5, 'T4a pasek 40 × 5 px ekranu (CP16, makieta audytu)');
  assert(FX.HIT_GLOW?.MS === 200 && FX.HIT_GLOW?.COLOR === 0xffffff, 'T4b błysk biały, stałe 200 ms (CP18)');
  const H = 805, fov = 55, wpp = (d) => 2 * d * Math.tan(fov * Math.PI / 360) / H;
  const near = glowSize({ modelSize: 0.016, depth: 0.5, fovDeg: fov, H });
  const far = glowSize({ modelSize: 0.016, depth: 6, fovDeg: fov, H });
  console.log(`     błysk fregaty: głębia 0,5 j. → ${(near / wpp(0.5)).toFixed(1)} px; głębia 6 j. → ${(far / wpp(6)).toFixed(1)} px`);
  assert(Math.abs(near - 0.016 * 1.6) < 1e-12, 'T4c z bliska — rozmiar dopasowany do modelu (× 1,6)');
  assert(Math.abs(far / wpp(6) - 12) < 1e-9, 'T4d z daleka (kadr auto-fokusu) — podłoga 12 px na ekranie');
  assert(Math.abs(glowSize({ modelSize: 0.016, depth: -1, fovDeg: fov, H }) - 0.0256) < 1e-12, 'T4e głębia nieokreślona — sam rozmiar modelu');
}

// ═══ T5 ═══════════════════════════════════════════════════════════════════════
header('T5  źródło `ThreeRenderer` — paski HP');
{
  const tr = strip(readFileSync(new URL('../../renderer/ThreeRenderer.js', import.meta.url), 'utf8'));
  const body = (sig) => { const i = tr.indexOf(sig); return i < 0 ? '' : tr.slice(i, tr.indexOf('\n  }\n', i)); };
  const loop = body('  _startLoop() {');
  assert(loop.length > 0 && /this\._syncCombatHpBars\(\)/.test(loop), 'T5a synchronizacja pasków co klatkę w pętli renderu');
  const sb = body('  _syncCombatHpBars() {');
  assert(/planCombatHpBars\(\{ encounters: list, activeSystemId: window\.KOSMOS\?\.activeSystemId \}\)/.test(sb) && /listActive\?\.\(\)/.test(sb),
    'T5b plan ze starć `listActive()` i układu widoku');
  assert(/const wpp = 2 \* depth \* tanHalf \/ H;/.test(sb) && /HP_BAR\.W_PX/.test(sb) && /HP_BAR\.H_PX/.test(sb) && /this\._viewDepth\(p\)/.test(sb),
    'T5c rozmiar EKRANOWY z głębi statku (40 × 5 px niezależnie od zbliżenia)');
  assert(/this\._factionColorHex\(v\)/.test(sb) && /vesselTargetSize\(v\) \/ 2/.test(sb) && /HP_BAR\.GAP_PX/.test(sb),
    'T5d kolor właściciela; pod modelem (promień modelu + odstęp)');
  assert(/if \(!keep\.has\(id\)\) this\._disposeHpBar\(id\)/.test(sb), 'T5e paski spoza planu (koniec starcia) usuwane');
  assert(/for \(const \[, b\] of this\._hpBars\)\s*\{ each\(b\.bg\); each\(b\.fill\); \}/.test(body('  _applyCleanViewVisibility(hidden) {')),
    'T5f „czysty widok” (SHIFT) chowa paski');
}

// ═══ T6 ═══════════════════════════════════════════════════════════════════════
header('T6  źródło `ThreeRenderer` — biały błysk trafienia');
{
  const tr = strip(readFileSync(new URL('../../renderer/ThreeRenderer.js', import.meta.url), 'utf8'));
  const body = (sig) => { const i = tr.indexOf(sig); return i < 0 ? '' : tr.slice(i, tr.indexOf('\n  }\n', i)); };
  const fx = body('  _onCombatRoundFx(payload) {');
  assert(/_spawnCombatTracer\([^;]*\{ attacker: ev\.attacker, target: ev\.target \}[,)]/.test(fx), 'T6a salwa przekazuje id strzelca i celu');
  const ct = tr.slice(tr.indexOf('  _spawnCombatTracer('), tr.indexOf('\n  }\n', tr.indexOf('  _spawnCombatTracer(')));
  const ret = ct.indexOf('if (!hit) return;'); const gl = ct.indexOf('this._spawnHitGlow(ids.target');
  assert(ret > 0 && gl > ret, 'T6b każde trafienie (z id celu) → biały błysk na modelu celu');
  const hg = body('  _spawnHitGlow(vesselId, tw, delay = 0) {');
  assert(/kind: 'hitGlow', lifetime: HIT_GLOW\.MS/.test(hg) && /color: HIT_GLOW\.COLOR/.test(hg) && /AdditiveBlending/.test(hg),
    'T6c rodzaj `hitGlow`, 200 ms, biały, addytywnie');
  assert(/ef\.mesh\.position\.copy\(e\.sprite\.position\)/.test(hg) && /hitGlowWorldSize\(/.test(hg), 'T6d za sprite\'em celu, rozmiar dopasowany do modelu (z podłogą)');
}

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
