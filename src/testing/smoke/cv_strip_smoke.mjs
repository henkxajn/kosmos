// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// cv_strip_smoke — KEEPER ARC COMBAT VISUALS, krok CV-6b2 „pasek walki zamiast karty” (flaga `cvStrip`; §3.2-16, §3.2-23,
//   §4 CV-6b2; Findingi 629, 630, 639). Plan: `docs/design/COMBAT_VISUALS_PLAN.md`.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CO PINUJE (wyłącznie logika — F11; bez pinów na stałych rysunku):
//   P1 układ (czysty `stripLayout`): przy 1280×833 i 1600×1041 (px logiczne), z outlinerami i bez, z Dokiem, 1 i 3 linie, „+N”,
//      rozwinięcie krótkie i dłuższe niż miejsce, obie krawędzie — prostokąt w obszarze mapy z `MapInsets`, nigdy nad kolumnami
//      outlinerów ani nad pasem dolnym; rozwinięcie przewija się, gdy nie mieści się; pasek u góry staje pod banerem pickera;
//      KONTROLA (#629): dzisiejsza karta (prawdziwy `CombatHUD`) przy 1280×833 wchodzi na pas dolny
//   P2 bitwy = klastry (prawdziwe DSCS + stager `cvBattle({ nA: 4, nB: 4, split: 1 })` w świecie bez renderera): cztery starcia,
//      JEDNA bitwa paska; liczby i sumy HP stron = sumy starć (przed i w trakcie walki); mgła wojny = `isEndpointVisibleInCombat`
//      na każdym okręcie (bitwa gracza — wróg widoczny przy wywiadzie „nieznany”; bitwa bez gracza — „?”, przy contact — widoczny)
//   P3 „Obserwuj”: ładunek paska == ładunek dzisiejszej karty pod `cvStage` (prawdziwe kliknięcia obu — `camera:watchBattle`)
//   P4 Dziennik (#639) na tym samym rozegranym split 4v4: pod flagą JEDNA linia bitwy i JEDNA linia potyczki na klaster —
//      prawdziwe metody `GameScene` (`_narrateBattleCluster`, `_clusterNarratorOf`, `_battleLogEntry`) i `UIManager.skirmishLineText`
//      wycięte ze źródła; wynik scalony jak baner (straty sumą, tury maks.); KONTROLA: bez flagi — linia na starcie (4 + 4);
//      świadek: DSCS ogłosił 4 bitwy, `WarSystem` 4 potyczki
//      ⚠ PRZECELOWANE ŚWIADOMIE (#675, krok poza CV, decyzja właściciela §3.2-25): ogłoszenie czeka okno łaski, a dobicie zaczęte
//      w nim ze statkami tej bitwy dołącza do tej samej linii i banera — uprząż tyka okna jak pętla gry (`_tickAnnouncements`
//      po `timeSystem.update`) i podpina `vessel:engaged` → `_joinBattleGrace`; niezależna definicja bitwy (P4a) łączy starcia
//      nakładające się w czasie ORAZ starcie zaczęte w oknie łaski po końcu starcia, z którym dzieli statek (dawniej: dobicie
//      = druga bitwa — split 4v4 dawał 2 linie i 2 banery). P4i: z oknem — jedna bitwa; KONTROLA w P4i: okno 0 — po dwie
//   P5 ☰ „Auto-fokus bitwy” (#630): przełącznik w uiPrefs, wiersz menu z i18n, zapis i wczytanie (kształt `SaveSystem` /
//      `GameScene`) — stan przeżywa; `combatFxVisible` bez czytelnika w kodzie (KONTROLA: komentarz o wycofaniu jest)
//   P6 flaga OFF = dzisiejsza karta: `combatHud.getPanelRect` / `isMinimized` bez flagi jak dotąd, z flagą — pasek; UIManager
//      rysuje i klika kartę wyłącznie bez flagi; `watchSafeRect` z krawędzią 'top' zaczyna się POD paskiem (KONTROLA: bez krawędzi
//      — dzisiejszy wzór)
//   P7 obsługa paska (logika stref): „Obserwuj” emituje, ▾ / ▴ rozwija jedną bitwę, Esc zwija (raz), kółko przewija rozwinięcie
//      i jest pochłonięte nad paskiem, klik w pasek pochłonięty, poza nim — nie; 5 bitew → 3 linie i „+N”; kursor „rączki”
//   P8 źródło: pierścień starcia i biały błysk trafienia pod flagą — nie, paski HP 3D zostają (CV-6a); Esc w kaskadzie `GameScene`;
//      i18n PL + EN; (M1) linia rundy „R n” bez limitu — brak `ROUND_CAP` / `maxRounds` (dawniej lustro `MAX_ROUNDS`)
//
// ⚠ Fail-first: moduły `CombatStrip`, `CombatStripLogic`, `CombatNarration` powstają w tym kroku — importy dynamiczne w try/catch,
//   każdy blok łapie wyjątek: piny DEGRADUJĄ (czerwone), suita się nie przerywa.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════

import '../headless/env.js';           // MUSI być pierwszy
import { reseed }                from '../headless/env.js';
import { readFileSync }          from 'node:fs';
import EventBus                  from '../../core/EventBus.js';
import EntityManager             from '../../core/EntityManager.js';
import { GAME_CONFIG }           from '../../config/GameConfig.js';
import { COSMIC, BOTTOM_RESERVED } from '../../config/LayoutConfig.js';
import { TimeSystem }            from '../../systems/TimeSystem.js';
import { VesselManager }         from '../../systems/VesselManager.js';
import { MovementOrderSystem }   from '../../systems/MovementOrderSystem.js';
import { ProximitySystem }       from '../../systems/ProximitySystem.js';
import { VesselCombatSystem }    from '../../systems/VesselCombatSystem.js';
import { DeepSpaceCombatSystem } from '../../systems/DeepSpaceCombatSystem.js';
import { EnemyAttackHandler }    from '../../systems/EnemyAttackHandler.js';
import { OrbitalSpaceSystem }    from '../../systems/OrbitalSpaceSystem.js';
import { WarSystem }             from '../../systems/WarSystem.js';
import { setNextVesselId }       from '../../entities/Vessel.js';
import { t, setLocale }          from '../../i18n/i18n.js';
import * as FX                   from '../../utils/VesselFxLogic.js';
import * as CW                   from '../../renderer/CombatWatchLogic.js';
import { normalize as normalizeBattleLocation, isDeepSpace as isDeepSpaceBattle } from '../../utils/BattleLocation.js';
import { resolveBattleSides, battleWinnerName } from '../../utils/BattleSides.js';
import { systemDisplayName }     from '../../ui/MapLabelLogic.js';
import { clusterPeerIds, clusterRadiusPx, clusterBannerStep } from '../../ui/BattleClusterLogic.js';
import * as BCX                  from '../../ui/BattleClusterLogic.js';   // #675 — okno łaski (nowe eksporty: przestrzeń nazw — fail-first bez błędu linkowania)
import { PresentationClock }     from '../../renderer/combat/PresentationClock.js';   // #675 — zegar okien ogłoszeń w `_tickAnnouncements`
import { CombatHUD }             from '../../ui/CombatHUD.js';
import { BottomBar }             from '../../ui/BottomBar.js';

const tryImport = async (rel) => { try { return await import(rel); } catch (e) { console.log(`  ! import ${rel}: ${e.message}`); return null; } };
const SL = await tryImport('../../ui/CombatStripLogic.js');
const SR = await tryImport('../../ui/CombatStrip.js');
const NR = await tryImport('../../ui/CombatNarration.js');
const STAGER = await tryImport('../../debug/CvBattleStager.js');
const CNX = await tryImport('../../ui/ContactNarration.js');   // #640 — zakres `_tickAnnouncements` (partie kontaktów)
const RALX = await tryImport('../../ui/RaidAnnounceLogic.js');   // ARC CV-8b (#635) — bramka rajdu w metodach `GameScene`

let pass = 0, fail = 0;
const assert = (c, l) => { if (c) { console.log('  ✓ ' + l); pass++; } else { console.log('  ✗ ' + l); fail++; } };
const header = (s) => console.log('\n── ' + s + ' ──');
const block = (title, fn) => { header(title); try { fn(); } catch (e) { assert(false, `${title} — wyjątek (pin degraduje, nie przerywa): ${e.message}`); } };
const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
const F = GAME_CONFIG.FEATURES;
setLocale('pl');

// Metoda klasy wycięta ze źródła (sygnatura na początku linii z wcięciem 2) i skompilowana z zakresem.
const methodSrc = (code, name) => {
  const i = code.indexOf(`\n  ${name}(`);
  if (i < 0) return null;
  const end = code.indexOf('\n  }\n', i);
  return end < 0 ? null : code.slice(i + 1, end + 4);
};
const compile = (code, name, scope = {}) => {
  const src = methodSrc(code, name);
  if (!src) { console.log(`  ! brak metody ${name}`); return null; }
  try { return new Function(...Object.keys(scope), `return function ${src.trim().slice(name.length)};`)(...Object.values(scope)); }
  catch (e) { console.log(`  ! kompilacja ${name}: ${e.message}`); return null; }
};
const GS = read('src/scenes/GameScene.js');
const UI = read('src/scenes/UIManager.js');
const TR = read('src/renderer/ThreeRenderer.js');

// Atrapa ctx: pomiar 0,6 em na znak, każda inna metoda — nic.
const mkCtx = () => {
  const st = { font: '10px monospace' };
  return new Proxy(st, {
    get(o, k) {
      if (k === 'measureText') return (s) => ({ width: [...String(s)].length * (Number(/(\d+(?:\.\d+)?)px/.exec(o.font)?.[1]) || 10) * 0.6 });
      if (k in o) return o[k];
      return () => {};
    },
    set(o, k, v) { o[k] = v; return true; },
  });
};
const inside = (r, a) => !!r && r.x >= a.x0 - 1e-9 && r.x + r.w <= a.x1 + 1e-9 && r.y >= a.y0 - 1e-9 && r.y + r.h <= a.y1 + 1e-9;
const overlap = (a, b) => !!a && !!b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ═══ P1 — układ ═══════════════════════════════════════════════════════════════════════════════════════════════════
block('P1 — układ w obszarze mapy z MapInsets (#629), obie krawędzie, rozwinięcie, baner pickera', () => {
  const S = SL.COMBAT_STRIP;
  const civBottom = BOTTOM_RESERVED + 20;   // pasek nawigacji + listwa dziennika + pas dolny (`MapInsets`, tryb cywilizacji)
  const sizes = [[1280, 833], [1600, 1041]];
  const insetSets = [
    { name: 'outlinery', left: 190, right: 210, top: COSMIC.TOP_BAND_H, bottom: civBottom },
    { name: 'bez outlinerów', left: 0, right: 0, top: COSMIC.TOP_BAND_H, bottom: civBottom },
    { name: 'Dok taktyczny', left: 190, right: 210, top: COSMIC.TOP_BAND_H, bottom: BOTTOM_RESERVED + 128 },
  ];
  let checked = 0, bad = [];
  for (const [W, H] of sizes) for (const ins of insetSets) for (const edge of ['top', 'bottom'])
    for (const lines of [1, 3]) for (const overflow of [false, true]) for (const detailH of [0, 150, 3000]) {
      const L = SL.stripLayout({ W, H, insets: ins, lines, overflow, naturalW: 470, detailH, edge });
      const map = { x0: ins.left, x1: W - ins.right, y0: ins.top, y1: H - ins.bottom };
      const cols = [{ x: 0, y: 0, w: ins.left, h: H }, { x: W - ins.right, y: 0, w: ins.right, h: H }].filter((c) => c.w > 0);
      const strip = { x: 0, y: H - ins.bottom, w: W, h: ins.bottom };
      const ok = inside(L.rect, map) && !cols.some((c) => overlap(L.rect, c)) && !overlap(L.rect, strip)
        && L.rect.edge === edge
        && (detailH === 0 ? L.detail == null : (L.detail && L.detail.h <= detailH && L.detail.maxScroll === detailH - L.detail.h))
        && (edge === 'top' ? (L.block.y === ins.top + S.GAP && (!L.detail || L.detail.y > L.block.y))
          : (L.block.y + L.block.h === H - ins.bottom - S.GAP && (!L.detail || L.detail.y + L.detail.h < L.block.y)));
      checked++;
      if (!ok) bad.push(`${W}×${H} ${ins.name} ${edge} ${lines}${overflow ? '+N' : ''} d${detailH}`);
    }
  assert(checked === 144 && bad.length === 0, `P1a ${checked} układów: prostokąt w obszarze mapy, bez kolumn outlinerów i pasa dolnego, krawędź i rozwinięcie po właściwej stronie${bad.length ? ' — źle: ' + bad.slice(0, 3).join('; ') : ''}`);
  const big = SL.stripLayout({ W: 1280, H: 833, insets: insetSets[0], lines: 1, naturalW: 470, detailH: 3000, edge: 'top' });
  assert(big.detail && big.detail.maxScroll > 0 && big.detail.h <= Math.floor(833 * S.DETAIL_MAX_FRAC),
    `P1b rozwinięcie dłuższe niż miejsce przewija się (okno ${big.detail?.h} px z ${big.detail?.contentH}, przewinięcie ${big.detail?.maxScroll})`);
  const wide = SL.stripLayout({ W: 1280, H: 833, insets: insetSets[0], lines: 1, naturalW: 5000 });
  const narrow = SL.stripLayout({ W: 1280, H: 833, insets: insetSets[0], lines: 1, naturalW: 10 });
  assert(wide.block.w === Math.min(S.MAX_W, 1280 - 400 - 2 * S.SIDE_MARGIN) && narrow.block.w === S.MIN_W
    && Math.abs((wide.block.x + wide.block.w / 2) - (190 + (1280 - 400) / 2)) <= 1,
    `P1c szerokość w klamrze [${S.MIN_W}, ${S.MAX_W}] ∩ obszar, środek = środek obszaru mapy (${wide.block.w} / ${narrow.block.w} px)`);
  // Baner pickera nad paskiem (DOM, góra ekranu) — pasek staje pod nim; baner z boku — bez zmian.
  const ins = insetSets[0];
  const plain = SL.stripLayout({ W: 1280, H: 833, insets: ins, lines: 2, naturalW: 470, edge: 'top' });
  const banner = { x: plain.block.x + 50, y: 16, w: 300, h: 30 };
  const under = SL.stripLayout({ W: 1280, H: 833, insets: ins, lines: 2, naturalW: 470, edge: 'top', banner });
  const aside = SL.stripLayout({ W: 1280, H: 833, insets: ins, lines: 2, naturalW: 470, edge: 'top', banner: { ...banner, x: 2, w: 100 } });
  assert(under.block.y === banner.y + banner.h + S.BANNER_GAP && aside.block.y === plain.block.y && plain.block.y < under.block.y,
    `P1d pasek u góry staje pod banerem pickera (y ${plain.block.y} → ${under.block.y}); KONTROLA: baner obok — y bez zmian (${aside.block.y})`);
  // KONTROLA #629 — dzisiejsza karta (prawdziwy `CombatHUD`, bez flagi) przy 1280×833 wchodzi na pas dolny obszaru mapy.
  const saved = globalThis.window.KOSMOS;
  const states = new Map([['a1', { hp: 90, hpStart: 120, weapons: [] }], ['b1', { hp: 90, hpStart: 120, weapons: [] }]]);
  const enc = { id: 'encounter_1', isActive: true, currentRound: 2, timeline: [], location: { systemId: 'sys_home', planetId: null, point: { x: 0, y: 0 } },
    sideA: { vesselIds: ['a1'], joinedVesselIds: [], ownerEmpireId: 'player', label: 'Gracz' },
    sideB: { vesselIds: ['b1'], joinedVesselIds: [], ownerEmpireId: 'emp_x', label: 'X' }, vesselStates: states };
  const fl = F.cvStrip, fs = F.cvStage; F.cvStrip = false; F.cvStage = false;
  let card = null;
  try {
    globalThis.window.KOSMOS = { civMode: true, activeSystemId: 'sys_home', deepSpaceCombatSystem: { listActive: () => [enc] },
      vesselManager: { _vessels: new Map(), getVessel: () => null }, starSystemManager: { getAllSystems: () => [] } };
    const hud = new CombatHUD(); hud.draw(mkCtx(), 1280, 833); card = hud.getPanelRect();
  } finally { globalThis.window.KOSMOS = saved; F.cvStrip = fl; F.cvStage = fs; }
  const stripBand = { x: 0, y: 833 - civBottom, w: 1280, h: 20 };
  const stripRect = SL.stripLayout({ W: 1280, H: 833, insets: { left: 0, right: 0, top: COSMIC.TOP_BAND_H, bottom: civBottom }, lines: 1, naturalW: 470 }).rect;
  assert(!!card && overlap(card, stripBand) && !overlap(stripRect, stripBand),
    `P1e KONTROLA #629: karta (y ${card?.y}–${card ? card.y + card.h : '—'}) wchodzi na pas dolny (y ${stripBand.y}–${stripBand.y + 20}); pasek — nie`);
});

// ═══ Świat bez renderera: DSCS + stager + WarSystem (potyczka) ════════════════════════════════════════════════════
const AU = GAME_CONFIG.AU_TO_PX;
const SYS = 'sys_t';
const EMP = 'emp_t';
const clock = { now: 1e7 };
performance.now = () => clock.now;
let ts, vm, dscs, saveSys;
const out = { battles: [], skirmishes: [], log: [], legacy: [], watch: [] };

function world() {
  EventBus.clear(); EntityManager.clear();
  global.window = global.window ?? {};
  clock.now = 1e7;
  setNextVesselId(1);
  ts = new TimeSystem();
  ts.gameTime = 100.00002;
  ts.multiplierIndex = 1;
  window.KOSMOS = { timeSystem: ts, activeSystemId: SYS };
  EntityManager.add({ id: 'star_t', type: 'star', name: 'G', systemId: SYS, x: 0, y: 0, mass: 1 });
  EntityManager.add({ id: 'p_home', type: 'planet', name: 'Dom', systemId: SYS, x: -4 * AU, y: 0, radius: 6, mass: 1, visual: { radius: 6 } });
  vm = new VesselManager(); const mos = new MovementOrderSystem(vm); const prox = new ProximitySystem(vm);
  dscs = new DeepSpaceCombatSystem(vm); new VesselCombatSystem(vm); const eah = new EnemyAttackHandler(); const oss = new OrbitalSpaceSystem();
  saveSys = { _autosaveInterval: 1 };
  const cols = [{ planetId: 'p_home', name: 'Dom', isOutpost: false, resourceSystem: {}, fleet: [] }];
  const empires = [{ id: EMP, name: 'Testowe Imperium' }];
  Object.assign(window.KOSMOS, {
    civMode: true, homePlanet: EntityManager.get('p_home'), vesselManager: vm, movementOrderSystem: mos,
    proximitySystem: prox, deepSpaceCombatSystem: dscs, enemyAttackHandler: eah, orbitalSpaceSystem: oss,
    resourceSystem: { inventory: new Map(), getAmount: () => 0, canAfford: () => true, spend: () => true, receive: () => {} },
    techSystem: { isResearched: () => true, getFuelEfficiency: () => 1, getShipSpeedMultiplier: () => 1, getShipRangeMultiplier: () => 1, getMultiplier: () => 1 },
    colonyManager: { activePlanetId: 'p_home', getColony: (id) => cols.find(c => c.planetId === id) ?? null, getAllColonies: () => cols, getPlayerColonies: () => cols, isPlayerColony: () => true },
    eventLogSystem: { push: (e) => out.log.push(e), pushLegacy: () => {} },
    intelSystem: { getVesselContact: () => ({ quality: 'unknown' }), getLevel: () => 'unknown', isAtLeast: () => false },
    empireRegistry: { listAll: () => empires, get: (id) => empires.find(e => e.id === id) ?? null },
    // Potyczka: imperium w POKOJU z graczem — `WarSystem._classifyBattle` emituje `war:skirmish` (gałąź (c)).
    diplomacySystem: { getStatus: () => 'peace', getTension: () => 50, changeTension: () => {}, addMemory: () => {}, getMemory: () => [] },
    debug: { combatTrace: false },
  });
  new WarSystem();   // słucha `battle:resolved` PRZED narratorem — kolejność jak w `GameScene` (:365 vs słuchacz Dziennika)
  out.battles = []; out.skirmishes = []; out.log = []; out.legacy = []; out.watch = [];
  EventBus.on('battle:resolved', ({ battleId }) => { if (String(battleId).startsWith('battle_ds_')) out.battles.push(battleId); });
  EventBus.on('war:skirmish', (p) => out.skirmishes.push(p.battleId));
  EventBus.on('camera:watchBattle', (p) => out.watch.push(p));
}
const helpers = () => STAGER?.cvBattleDebugHelpers?.({ getRenderer: () => null, getSaveSystem: () => saveSys }) ?? null;
let onFrame = null;   // #675 — zaczep klatki: okna ogłoszeń (`GameScene._tickAnnouncements`) jak w pętli gry
const frame = (ms) => { clock.now += ms; ts.update(ms); onFrame?.(clock.now); };
const vessel = (id) => vm?.getVessel?.(id) ?? null;
const env = () => ({ getPos: (id) => vessel(id)?.position ?? null, radius: clusterRadiusPx(AU), activeSystemId: SYS,
  quality: (id) => window.KOSMOS.intelSystem.getVesselContact(id).quality,
  labelFor: (owner) => (owner === 'player' ? t('battle.player') : (window.KOSMOS.empireRegistry.get(owner)?.name ?? t('battle.unknownForce'))),
  nameOf: (id) => vessel(id)?.name ?? id });
// Sumy starć wprost (bez logiki paska): strona gracza / wroga.
const directSums = (encs) => {
  const s = { own: { alive: 0, total: 0, hp: 0, hpStart: 0 }, enemy: { alive: 0, total: 0, hp: 0, hpStart: 0 } };
  for (const e of encs) for (const k of ['sideA', 'sideB']) {
    const own = e[k].ownerEmpireId === 'player';
    for (const id of [...e[k].vesselIds, ...e[k].joinedVesselIds]) {
      const st = e.vesselStates.get(id), d = own ? s.own : s.enemy;
      d.total++; if (st.hp > 0) d.alive++; d.hp += Math.max(0, st.hp); d.hpStart += st.hpStart;
    }
  }
  return s;
};
const sumsOf = (row) => ({ own: { alive: row.own.alive, total: row.own.total, hp: row.own.hp, hpStart: row.own.hpStart },
  enemy: { alive: row.enemy.alive, total: row.enemy.total, hp: row.enemy.hp, hpStart: row.enemy.hpStart } });
const sameSums = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ═══ P2 / P3 — klastry, sumy, mgła, „Obserwuj” ════════════════════════════════════════════════════════════════════
block('P2 — bitwy paska = klastry starć (split 4v4), sumy stron = sumy starć, mgła wojny = `isEndpointVisibleInCombat`', () => {
  reseed('cv6b2-strip'); world();
  const st = helpers()?.cvBattle({ seed: 1, nA: 4, nB: 4, split: true });
  const encs = dscs.listActive();
  const rows = SL.stripBattles(encs, env());
  assert(st?.ok === true && encs.length === 4 && rows.length === 1 && rows[0].encounterIds.length === 4,
    `P2a split 4v4: ${encs.length} starcia (świadek), pasek — ${rows.length} bitwa z ${rows[0]?.encounterIds.length} starciami`);
  assert(sameSums(sumsOf(rows[0]), directSums(encs)) && rows[0].own.total === 4 && rows[0].enemy.total === 4,
    `P2b przed walką: liczby i HP stron = sumy starć (${JSON.stringify(sumsOf(rows[0]))})`);
  ts.play();
  for (let n = 0; n < 6000 && dscs.listActive().length && (dscs.listActive()[0]?.currentRound ?? 0) < 6; n++) frame(16);
  const encs2 = dscs.listActive(), rows2 = SL.stripBattles(encs2, env());
  const dmg = directSums(encs2);
  assert(encs2.length >= 1 && rows2.length === 1 && sameSums(sumsOf(rows2[0]), dmg) && dmg.own.hp + dmg.enemy.hp < dmg.own.hpStart + dmg.enemy.hpStart,
    `P2c w trakcie walki (runda ${encs2[0]?.currentRound}): sumy paska = sumy starć, HP spadło (${Math.round(dmg.own.hp + dmg.enemy.hp)} < ${Math.round(dmg.own.hpStart + dmg.enemy.hpStart)})`);
  // Mgła: bitwa gracza przy wywiadzie „nieznany” — wróg widoczny; każdy okręt jak predykat.
  const r = rows2[0];
  const agree = r.enemy.ships.every((s) => s.visible === FX.isEndpointVisibleInCombat({ isEnemy: true, quality: 'unknown', inPlayerEngagement: true }));
  assert(r.enemy.hidden === 0 && r.enemy.ships.every((s) => s.visible) && agree,
    'P2d bitwa gracza: wróg widoczny przy wywiadzie „nieznany” (jak karta — `isEndpointVisibleInCombat`, starcie z graczem)');
  ts.pause();
});

block('P2e — bitwa BEZ gracza: wróg ukryty mgłą („?”), przy wywiadzie contact — widoczny; okręt po okręcie jak predykat', () => {
  const states = new Map([['x1', { hp: 50, hpStart: 60 }], ['x2', { hp: 0, hpStart: 60 }], ['y1', { hp: 40, hpStart: 60 }]]);
  const enc = { id: 'encounter_ai', isActive: true, currentRound: 3, timeline: [], location: { systemId: 'sys_t', planetId: null, point: { x: 0, y: 0 } },
    sideA: { vesselIds: ['x1', 'x2'], joinedVesselIds: [], ownerEmpireId: 'emp_a' }, sideB: { vesselIds: ['y1'], joinedVesselIds: [], ownerEmpireId: 'emp_b' },
    vesselStates: states };
  const hid = SL.stripBattles([enc], { quality: () => 'unknown' })[0];
  const seen = SL.stripBattles([enc], { quality: () => 'contact' })[0];
  const pred = (q) => FX.isEndpointVisibleInCombat({ isEnemy: true, quality: q, inPlayerEngagement: false });
  assert(hid.player === false && hid.own.hidden === 2 && hid.enemy.hidden === 1 && hid.own.total === 0 && hid.enemy.total === 0
    && [...hid.own.ships, ...hid.enemy.ships].every((s) => s.visible === pred('unknown') && s.name === null),
    'P2e bez gracza, wywiad „nieznany”: obie strony ukryte (liczby „?”, bez nazw) — jak predykat');
  assert(seen.own.hidden === 0 && seen.own.total === 2 && seen.own.alive === 1 && seen.enemy.total === 1
    && [...seen.own.ships, ...seen.enemy.ships].every((s) => s.visible === pred('contact')),
    'P2f KONTROLA: ten sam stan przy wywiadzie contact — widoczne, liczby i żywi policzone');
});

block('P3 — „Obserwuj”: ładunek paska == ładunek karty pod `cvStage` (prawdziwe kliknięcia, `camera:watchBattle`)', () => {
  reseed('cv6b2-strip'); world();
  helpers()?.cvBattle({ seed: 1, nA: 4, nB: 4, split: true });
  const fl = F.cvStrip, fs = F.cvStage;
  F.cvStage = true; F.cvStrip = false;
  const hud = new CombatHUD(); hud.draw(mkCtx(), 1600, 1041);
  const btn = hud._watchBtns?.[0] ?? null;
  hud.handleClick(btn.x + 1, btn.y + 1);
  const cardEmit = out.watch.splice(0);
  F.cvStrip = true;
  const strip = new SR.CombatStrip();
  strip.draw(mkCtx(), 1600, 1041, { K: window.KOSMOS, insets: { left: 0, right: 0, top: 28, bottom: 62 } });
  const z = strip._zones.find((q) => q.kind === 'watch');
  strip.handleClick(z.x + 1, z.y + 1);
  const stripEmit = out.watch.splice(0);
  F.cvStrip = fl; F.cvStage = fs;
  const row = SL.stripBattles(dscs.listActive(), env())[0];
  assert(hud._watchBtns.length === 1 && cardEmit.length === 1 && stripEmit.length === 1
    && JSON.stringify(stripEmit[0]) === JSON.stringify(cardEmit[0]) && JSON.stringify(SL.stripWatchPayload(row)) === JSON.stringify(cardEmit[0]),
    `P3 karta (1 wiersz na klaster) i pasek emitują to samo: ${JSON.stringify(stripEmit[0])}`);
});

// ═══ P4 — Dziennik ═══════════════════════════════════════════════════════════════════════════════════════════════
// Prawdziwe metody `GameScene` / `UIManager` ze źródła; słuchacze — jak w `GameScene` (routing pinowany źródłem w P8).
const gsScope = { window: globalThis.window, GAME_CONFIG, t, EntityManager, normalizeBattleLocation, isDeepSpaceBattle, systemDisplayName,
  resolveBattleSides, battleWinnerName, ClusterNarrator: NR?.ClusterNarrator, encounterIdOfBattle: NR?.encounterIdOfBattle, clusterPeerIds, clusterRadiusPx,
  clusterBannerStep, clusterGraceJoin: BCX.clusterGraceJoin, clusterBannerDue: BCX.clusterBannerDue, clusterGraceMs: BCX.clusterGraceMs,
  PresentationClock, ContactBatcher: CNX?.ContactBatcher, CONTACT_NARRATION: CNX?.CONTACT_NARRATION, contactLogEntry: CNX?.contactLogEntry,
  // ARC CV-8b (#635) — bramka rajdu w metodach `GameScene` (PRZECELOWANE ŚWIADOMIE: zakres kompilacji i lista metod niżej)
  RaidAnnouncer: RALX?.RaidAnnouncer, raidEnemyIds: RALX?.raidEnemyIds, stillRaiding: RALX?.stillRaiding, raidBusy: RALX?.raidBusy, RAID_ANNOUNCE: RALX?.RAID_ANNOUNCE };
function runNarration(flagOn, { graceRounds = null } = {}) {
  reseed('cv6b2-strip'); world();
  F.cvStrip = flagOn;
  const keepGrace = BCX.CLUSTER_GRACE?.ROUNDS;
  if (graceRounds != null && BCX.CLUSTER_GRACE) BCX.CLUSTER_GRACE.ROUNDS = graceRounds;
  const scope = { ...gsScope, window: globalThis.window };
  const gs = { starSystemManager: { getAllSystems: () => [] }, timeSystem: ts, _battleQueue: [] };
  gs._battleLogEntry = compile(GS, '_battleLogEntry', scope);
  gs._clusterNarratorOf = compile(GS, '_clusterNarratorOf', scope);
  gs._narrateBattleCluster = compile(GS, '_narrateBattleCluster', scope);
  gs._clusterBattleBanners = compile(GS, '_clusterBattleBanners', scope);   // baner gry (CV-3a2) — ten sam strumień
  // #675 — okno łaski: te same metody co gra (zegar prezentacji, wyjście po oknie, dołączenie dobicia, wpisy narratora)
  for (const m of ['_tickAnnouncements', '_announceNowMs', '_battleGraceMs', '_releaseBattleGrace', '_joinBattleGrace', '_writeNarration',
    '_queueBanner', '_writeBattleLine', '_noteRaidBattle', '_releaseRaids']) {   // ARC CV-8b — bramka rajdu (#635)
    gs[m] = compile(GS, m, scope);
  }
  const ui = { lines: [] };
  ui.skirmishLineText = compile(UI, 'skirmishLineText', { window: globalThis.window, t });
  ui._log = (text, type) => out.legacy.push({ text, type });
  gs.uiManager = ui;
  // słuchacz Dziennika `GameScene` (routing) i słuchacz potyczki `UIManager` / spóźnionej potyczki `GameScene`
  EventBus.on('battle:resolved', ({ warId, battleId, result }) => {
    if (!result) return;
    if (!warId && F.cvStrip && NR.isClusterNarrated(battleId)) { gs._narrateBattleCluster({ battleId, result }); return; }
    const e = gs._battleLogEntry({ warId, result }); if (e) window.KOSMOS.eventLogSystem.push(e);
  });
  EventBus.on('war:skirmish', ({ empireId, battleId }) => {
    if (F.cvStrip && NR.isClusterNarrated(battleId)) return;
    ui._log(ui.skirmishLineText(empireId), 'combat');
  });
  EventBus.on('war:skirmish', ({ empireId, battleId }) => {
    if (!F.cvStrip || !NR.isClusterNarrated(battleId)) return;
    for (const text of gs._clusterNarratorOf().onSkirmish({ empireId, battleId })) ui._log(text, 'combat');
  });
  const results = [], banners = [], spans = new Map();
  // baner gry: wynik gotowy od razu (okno łaski 0) albo po oknie (`_releaseBattleGrace` → kolejka → `_tryShowNextBattle`)
  gs._tryShowNextBattle = function () { while (this._battleQueue.length) banners.push(this._battleQueue.shift()); };
  EventBus.on('battle:resolved', ({ battleId, result }) => {
    if (!String(battleId).startsWith('battle_ds_')) return;
    results.push({ battleId, ...result });
    // id starcia z id bitwy liczone TU (nie modułem pod testem): `battle_ds_X` ↔ `encounter_X` (DSCS `_finalizeBattle`)
    const sp = spans.get(String(battleId).replace(/^battle_ds_/, 'encounter_')); if (sp) sp.end = clock.now;
    banners.push(...(gs._clusterBattleBanners?.({ battleId, result }) ?? []));
  });
  EventBus.on('vessel:engaged', ({ encounterId, sideA, sideB }) => {
    if (encounterId && !spans.has(encounterId)) spans.set(encounterId, { start: clock.now, end: Infinity, ships: [...(sideA ?? []), ...(sideB ?? [])] });
  });
  // słuchacz dołączenia `GameScene` (#675; routing pinowany źródłem w `announce_once_smoke` G6b)
  EventBus.on('vessel:engaged', ({ encounterId, sideA, sideB }) => gs._joinBattleGrace?.({ encounterId, vesselIds: [...(sideA ?? []), ...(sideB ?? [])] }));
  onFrame = (now) => gs._tickAnnouncements?.(now);
  // ⚠ PRZECELOWANIE M1 „bitwy do końca” (decyzja 33, 2026-11-11): ziarno 1 → 2. W ziarnie 1 dobiciem (P4i) było ponowne zwarcie #657
  //   po odwrocie AI — M1 je usuwa (odwrót to lot, uciekający nie wraca od razu). W ziarnie 2 ocalali dwóch skończonych pojedynków
  //   zwierają się w chwili końca — to samo pytanie #675 (5 starć: 4 pojedynki + dobicie; z oknem 1 bitwa, okno 0 — 2), ta sama
  //   scena co `announce_once_smoke` G1.
  const st = helpers()?.cvBattle({ seed: 2, nA: 4, nB: 4, split: true });
  ts.play();
  // Bez starcia (np. świat niekompletny) — bez pętli: suita ma się skończyć i pokazać czerwone piny, nie wisieć.
  if (dscs.listActive().length) for (let n = 0; n < 60000; n++) { frame(16); if (!dscs.listActive().length) break; }
  // #675 — ogłoszenie czeka okno łaski: dalsze klatki, aż banery i linie wyjdą (najwyżej 10 s czasu gry)
  for (let n = 0; n < 625 && ((gs._battleClusterHold?.length ?? 0) || (gs._clusterNarrator?.holding ?? 0)); n++) frame(16);
  const graceMs = gs._battleGraceMs?.() ?? 0;
  onFrame = null;
  ts.pause();
  F.cvStrip = true;
  if (BCX.CLUSTER_GRACE) BCX.CLUSTER_GRACE.ROUNDS = keepGrace;
  const battleLines = out.log.filter((e) => /^⚔ Bitwa/.test(e.text));
  const skLines = out.legacy.filter((e) => /^⚔ Potyczka/.test(e.text));
  // Bitwy NIEZALEŻNIE od narratora: starcia, których okresy aktywności się nakładają (koniec wyłącznie), ORAZ — od #675 — starcie
  // zaczęte w oknie łaski po końcu starcia, z którym dzieli statek (dobicie należy do tej samej bitwy); łączone przechodnio;
  // wszystkie w jednym miejscu (szyk stagera). Okno łaski 0 — dobicie zaczęte w chwili końca poprzedniego starcia to następna bitwa.
  const ids = [...spans.keys()].sort();
  const par = new Map(ids.map((i) => [i, i]));
  const root = (i) => { while (par.get(i) !== i) i = par.get(i); return i; };
  const sharesShip = (A, B) => A.ships.some((x) => B.ships.includes(x));
  const graceJoin = (A, B) => graceMs > 0 && Number.isFinite(A.end) && B.start >= A.end && B.start - A.end <= graceMs && sharesShip(A, B);
  for (const a of ids) for (const b of ids) {
    if (a >= b) continue;
    const A = spans.get(a), B = spans.get(b);
    if ((A.start < B.end && B.start < A.end) || graceJoin(A, B) || graceJoin(B, A)) par.set(root(b), root(a));
  }
  const groups = new Map();
  for (const i of ids) { const r = root(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
  return { st, battleLines, skLines, results, banners, groups: [...groups.values()], battles: [...out.battles], skirmishes: [...out.skirmishes],
    legacy: [...out.legacy], log: [...out.log], graceMs };
}

block('P4 — Dziennik (#639): split 4v4 — JEDNA linia bitwy i JEDNA linia potyczki na bitwę (klaster); bez flagi — linia na starcie', () => {
  const fl = F.cvStrip;
  const ON = runNarration(true);
  const OFF = runNarration(false);
  F.cvStrip = fl;
  const nEnc = ON.battles.length, nBat = ON.groups.length;
  assert(ON.st?.ok === true && nEnc >= 4 && ON.skirmishes.length === nEnc && nBat >= 1 && nBat < nEnc,
    `P4a świadek: DSCS ogłosił ${nEnc} starć, \`WarSystem\` — ${ON.skirmishes.length} potyczek (mechanika NA STARCIE nietknięta); oś czasu — ${nBat} bitw(y) (${ON.groups.map((g) => g.length).join(' + ')} starć)`);
  assert(ON.battleLines.length === nBat && ON.skLines.length === nBat && ON.banners.length === nBat,
    `P4b pod flagą: ${ON.battleLines.length} linii bitwy, ${ON.skLines.length} linii potyczki, ${ON.banners.length} banerów — po jednym na bitwę (${nBat})`);
  assert(ON.skLines.length > 0 && ON.battleLines.length > 0
    && ON.skLines.every((e) => e.type === 'combat') && ON.battleLines.every((e) => e.channel === 'combat'),
    'P4c linia potyczki na kanale walki (`_log(…, combat)` jak `UIManager`), linia bitwy — wpis `combat`');
  // Wynik scalony jak baner: straty sumą, tury maks. — dla każdej bitwy z osi czasu (gracz po stronie A w starciach stagera).
  const byEnc = new Map(ON.results.map((r) => [String(r.battleId).replace(/^battle_ds_/, 'encounter_'), r]));
  const expect = ON.groups.map((g) => {
    const rs = g.map((id) => byEnc.get(id)).filter(Boolean);
    return `${Math.round(rs.reduce((a, r) => a + (r.lossesA ?? 0), 0))}/${Math.round(rs.reduce((a, r) => a + (r.lossesB ?? 0), 0))}, ${Math.max(...rs.map((r) => r.turns ?? 0))} tur`;
  });
  assert(expect.length === ON.battleLines.length && expect.every((x, i) => ON.battleLines[i]?.text.includes(x)),
    `P4d każda linia niesie wynik swojej bitwy scalony jak baner (straty sumą, tury maks.): ${expect.join(' · ')}`);
  assert(OFF.battleLines.length === nEnc && OFF.skLines.length === nEnc,
    `P4e KONTROLA bez flagi: linia na starcie — ${OFF.battleLines.length} linii bitwy i ${OFF.skLines.length} potyczek (dzisiejszy Dziennik)`);
  // Id starć niosą przyrostek zajętości z `gameState` (pamięta bitwy poprzedniego świata) — porównanie WYNIKÓW w kolejności rozstrzygnięć.
  const sig = (R) => R.results.map((r) => [r.winner, r.lossesA, r.lossesB, r.turns]);
  if (JSON.stringify(sig(OFF)) !== JSON.stringify(sig(ON))) { console.log('     ON ', JSON.stringify(sig(ON))); console.log('     OFF', JSON.stringify(sig(OFF))); }
  assert(JSON.stringify(sig(OFF)) === JSON.stringify(sig(ON)),
    'P4f wyniki starć z flagą i bez — identyczne (narrator nie dotyka walki)');
  // #675 — pin naprawy: z oknem łaski dobicie dołącza (jedna bitwa); KONTROLA w środku: okno 0 (zachowanie sprzed kroku) — druga bitwa
  const fl0 = F.cvStrip;
  const G0 = runNarration(true, { graceRounds: 0 });
  F.cvStrip = fl0;
  assert(ON.graceMs > 0 && nBat === 1 && ON.battleLines.length === 1 && G0.graceMs === 0 && G0.groups.length === 2
    && G0.battleLines.length === 2 && G0.skLines.length === 2 && G0.banners.length === 2,
    `P4i #675 dobicie w oknie łaski (${ON.graceMs} ms) — ${nBat} bitwa, ${ON.battleLines.length} linia; KONTROLA okno 0 — ${G0.groups.length} bitwy, ${G0.battleLines.length} linie bitwy, ${G0.skLines.length} potyczki, ${G0.banners.length} banery`);
});

block('P4g — spóźniona potyczka (po opowiedzianej grupie): jedna linia, druga nigdy; potyczka czekająca — z linią grupy', () => {
  const lines = [];
  const N = new NR.ClusterNarrator({ lineFor: (r) => ({ text: `B ${r.turns}`, channel: 'combat' }), skirmishTextFor: (id) => `S ${id}` });
  const res = (n) => ({ turns: n, winner: 'A', lossesA: 0, lossesB: 1, participantA: { type: 'vessel_group', empireId: 'player' }, participantB: { type: 'vessel_group', empireId: 'emp' } });
  N.onSkirmish({ empireId: 'emp', battleId: 'battle_ds_1' });
  const a = N.onBattleResolved({ battleId: 'battle_ds_1', result: res(3), peerIds: ['encounter_2'], isActive: (id) => id === 'encounter_2' });
  const b = N.onBattleResolved({ battleId: 'battle_ds_2', result: res(5), peerIds: [], isActive: () => false });
  const late1 = N.onSkirmish({ empireId: 'emp', battleId: 'battle_ds_2' });
  const late2 = N.onSkirmish({ empireId: 'emp2', battleId: 'battle_ds_2' });
  lines.push(...a, ...b);
  assert(a.length === 0 && b.length === 2 && b[0].kind === 'skirmish' && b[1].kind === 'battle' && b[1].entry.text === 'B 5' && b[1].size === 2,
    'P4g grupa czeka na drugie starcie; potem potyczka PRZED linią bitwy, tury maks. (5), rozmiar 2');
  assert(late1.length === 0 && late2.length === 1 && late2[0] === 'S emp2' && NR.isClusterNarrated('battle_ds_9') && !NR.isClusterNarrated('b_eah_1'),
    'P4h spóźniona potyczka tego samego imperium — bez dubla; innego — jedna linia; narrator tylko dla bitew DSCS');
});

// ═══ P5 — ☰ „Auto-fokus bitwy” (#630) ════════════════════════════════════════════════════════════════════════════
block('P5 — ☰ „Auto-fokus bitwy”: uiPrefs, wiersz menu, zapis → wczytanie; `combatFxVisible` wycofany', () => {
  const P = BottomBar.prototype;
  const saved = globalThis.window.KOSMOS;
  globalThis.window.KOSMOS = { uiPrefs: { sensorOverlayVisible: false, fleetMapLabelsVisible: true } };
  const self = { _autosaveOption: 'year', _getAutosaveLabel: () => 'rok', _getOrbitLabel: () => 'o' };
  const rowOf = () => P._getMenuRows.call(self, true, true).find((r) => r.id === 'battleAutoFocus');
  const r0 = rowOf();
  const v1 = P._toggleBattleAutoFocus.call(self);
  const r1 = rowOf();
  // zapis (kształt `SaveSystem`: `{ ...uiPrefs }`) → nowa sesja (domyślne z `main.js`) → wczytanie (`GameScene`: scalenie)
  const save = JSON.parse(JSON.stringify({ uiPrefs: window.KOSMOS.uiPrefs ? { ...window.KOSMOS.uiPrefs } : {} }));
  window.KOSMOS = { uiPrefs: { sensorOverlayVisible: false, fleetMapLabelsVisible: true } };
  window.KOSMOS.uiPrefs = { ...(window.KOSMOS.uiPrefs ?? {}), ...save.uiPrefs };
  const afterLoad = window.KOSMOS.uiPrefs.battleAutoFocus;
  const r2 = rowOf();
  const v2 = P._toggleBattleAutoFocus.call(self);
  globalThis.window.KOSMOS = saved;
  assert(r0?.label === t('menu.battleAutoFocus') && r0.valueOn === true && r0.value === t('menu.on'),
    `P5a wiersz menu „${r0?.label}” — domyślnie WŁ (brak klucza ≠ false)`);
  assert(v1 === false && r1?.valueOn === false && afterLoad === false && r2?.valueOn === false && v2 === true,
    'P5b przełącznik: WŁ → WYŁ, zapis i wczytanie zachowują WYŁ, ponowny klik → WŁ');
  const ss = strip(read('src/systems/SaveSystem.js')), gsS = strip(GS), trS = strip(TR);
  assert(/uiPrefs:\s*window\.KOSMOS\?\.uiPrefs \? \{ \.\.\.window\.KOSMOS\.uiPrefs \} : \{\}/.test(ss)
    && /window\.KOSMOS\.uiPrefs = \{ \.\.\.\(window\.KOSMOS\.uiPrefs \?\? \{\}\), \.\.\.savedData\.uiPrefs \}/.test(gsS)
    && /uiPrefs\?\.battleAutoFocus === false\) return;/.test(trS),
    'P5c łańcuch w źródle: zapis niesie uiPrefs, wczytanie scala, renderer czyta `battleAutoFocus` przy starcie starcia');
  // CV-Z — przecelowane świadomie: komentarz o wycofaniu siedział w `_onCombatRoundFx` (usuniętym razem z salwą CV-2a); KONTROLA nazwy
  //   klucza — w dokumentacji zapisu (plan) zamiast w rendererze.
  assert(!/combatFxVisible/.test(trS) && !/combatFxVisible/.test(strip(read('src/ui/BottomBar.js'))) && /combatFxVisible/.test(read('docs/design/COMBAT_VISUALS_PLAN.md')),
    'P5d `uiPrefs.combatFxVisible` bez czytelnika w kodzie (KONTROLA: klucz opisany w planie)');
});

// ═══ P6 — flaga OFF = karta ══════════════════════════════════════════════════════════════════════════════════════
block('P6 — flaga OFF = dzisiejsza karta; prostokąt panelu i czip; `watchSafeRect` z krawędzią', () => {
  const saved = globalThis.window.KOSMOS, fl = F.cvStrip, fs = F.cvStage;
  const states = new Map([['a1', { hp: 90, hpStart: 120, weapons: [] }], ['b1', { hp: 70, hpStart: 120, weapons: [] }]]);
  const enc = { id: 'encounter_1', isActive: true, currentRound: 2, timeline: [], location: { systemId: 'sys_home', planetId: null, point: { x: 0, y: 0 } },
    sideA: { vesselIds: ['a1'], joinedVesselIds: [], ownerEmpireId: 'player', label: 'Gracz' },
    sideB: { vesselIds: ['b1'], joinedVesselIds: [], ownerEmpireId: 'emp_x', label: 'X' }, vesselStates: states };
  let cardRect = null, offRect = null, onRect = null, minOff = null, minOn = null, minNoStrip = null, stripRect = null;
  try {
    F.cvStage = false;
    globalThis.window.KOSMOS = { civMode: true, activeSystemId: 'sys_home', deepSpaceCombatSystem: { listActive: () => [enc] },
      vesselManager: { _vessels: new Map(), getVessel: () => null }, starSystemManager: { getAllSystems: () => [] } };
    const hud = new CombatHUD();
    F.cvStrip = false; hud.draw(mkCtx(), 1280, 833); cardRect = hud.getPanelRect();
    const strip = new SR.CombatStrip(); strip.draw(mkCtx(), 1280, 833, { K: window.KOSMOS, insets: { left: 0, right: 0, top: 28, bottom: 62 } });
    stripRect = strip.getPanelRect();
    window.KOSMOS.combatStrip = strip;
    offRect = hud.getPanelRect();
    F.cvStrip = true; onRect = hud.getPanelRect();
    hud._minimized = true;
    minOn = hud.isMinimized(); F.cvStrip = false; minOff = hud.isMinimized();
    delete window.KOSMOS.combatStrip; F.cvStrip = true; minNoStrip = hud.isMinimized();
  } finally { globalThis.window.KOSMOS = saved; F.cvStrip = fl; F.cvStage = fs; }
  assert(!!cardRect && JSON.stringify(offRect) === JSON.stringify(cardRect) && !('edge' in cardRect),
    'P6a bez flagi `combatHud.getPanelRect()` = prostokąt karty (także gdy pasek istnieje)');
  assert(!!stripRect && JSON.stringify(onRect) === JSON.stringify(stripRect) && onRect.edge === 'top',
    `P6b z flagą — prostokąt paska z krawędzią (${JSON.stringify(onRect)})`);
  assert(minOn === false && minOff === true && minNoStrip === true,
    'P6c czip „⚔ Walki”: z flagą i paskiem karta nie jest „zminimalizowana”; bez flagi / bez paska — jak dotąd');
  const ui = strip(UI);
  assert(/if \(civMode && !globeOpen && !GAME_CONFIG\.FEATURES\?\.cvStrip\) this\.combatHud\.draw\(ctx, W, H\);/.test(ui)
    && /if \(civMode && !globeOpen && GAME_CONFIG\.FEATURES\?\.cvStrip\) \{\s*this\.combatStrip\.draw\(/.test(ui)
    && /\} else this\.combatStrip\?\.clear\?\.\(\);/.test(ui)
    && /if \(!GAME_CONFIG\.FEATURES\?\.cvStrip && this\.combatHud\?\.handleClick\?\.\(x, y\)\) return true;/.test(ui)
    && /else this\.combatHud\?\.handleMouseMove\?\.\(x, y\);/.test(ui),
    'P6d `UIManager`: karta rysowana, klikana i najeżdżana WYŁĄCZNIE bez flagi; pasek z flagą (bez niej — czyszczony)');
  const base = { W: 1600, H: 1041, uiScale: 1.25, topBarH: 46, bottomH: 62, rightW: 210, leftW: 190 };
  const top = CW.watchSafeRect({ ...base, hudRect: { x: 400, y: 32, w: 470, h: 40, edge: 'top' } });
  const old = CW.watchSafeRect({ ...base, hudRect: { x: 400, y: 32, w: 470, h: 40 } });
  const none = CW.watchSafeRect({ ...base, hudRect: null });
  const m = CW.COMBAT_WATCH.MARGIN_PX;
  assert(top.y0 === 72 * 1.25 + m && top.y1 === none.y1 && !top.fallback,
    `P6e kadr „Obserwuj” z paskiem u góry zaczyna się POD nim (y0 ${top.y0} = (32 + 40) · 1,25 + ${m}), dół bez zmian`);
  assert(old.y1 === 32 * 1.25 - m || old.fallback === true,
    `P6f KONTROLA: ten sam prostokąt bez krawędzi — dzisiejszy wzór (panel na dole: koniec nad nim, y1 ${old.y1}${old.fallback ? ', zapas' : ''})`);
});

// ═══ P7 — obsługa paska ══════════════════════════════════════════════════════════════════════════════════════════
block('P7 — obsługa: „Obserwuj”, ▾ / ▴, Esc, kółko, pochłanianie kliku, „+N”, kursor', () => {
  const saved = globalThis.window.KOSMOS;
  const mk = (id, n, at, sys = 'sys_home') => {
    const states = new Map(); const ids = { a: [], b: [] };
    for (const side of ['a', 'b']) for (let i = 0; i < n; i++) { const vid = `${id}_${side}${i}`; ids[side].push(vid); states.set(vid, { hp: 60 + i, hpStart: 100, shieldHP: 5, shieldHPStart: 10 }); }
    return { id, isActive: true, currentRound: 4, location: { systemId: sys, planetId: null, point: { ...at } },
      timeline: [{ round: 1, events: [{ attacker: ids.a[0], target: ids.b[0], weapon: 'weapon_laser', hit: true, damage: 8, blockedByShield: 0 }] }],
      sideA: { vesselIds: ids.a, joinedVesselIds: [], ownerEmpireId: 'player' }, sideB: { vesselIds: ids.b, joinedVesselIds: [], ownerEmpireId: 'emp_x' }, vesselStates: states };
  };
  const pos = new Map();
  const encs = [0, 1, 2, 3, 4].map((k) => mk(`encounter_${k}`, k === 0 ? 10 : 2, { x: k * 5 * AU, y: 0 }));
  for (const e of encs) for (const id of [...e.sideA.vesselIds, ...e.sideB.vesselIds]) pos.set(id, { ...e.location.point });
  const emitted = [];
  try {
    globalThis.window.KOSMOS = { civMode: true, activeSystemId: 'sys_home', deepSpaceCombatSystem: { listActive: () => encs },
      vesselManager: { getVessel: (id) => (pos.has(id) ? { id, name: `Okręt ${id}`, position: pos.get(id), hullId: 'hull_frigate' } : null) },
      starSystemManager: { getAllSystems: () => [] }, intelSystem: { getVesselContact: () => ({ quality: 'unknown' }) }, empireRegistry: { get: () => ({ name: 'Rój' }) } };
    const s = new SR.CombatStrip();
    const ins = { left: 190, right: 210, top: 28, bottom: 62 };
    s.draw(mkCtx(), 1280, 300, { insets: ins });
    const d0 = s.debug();
    const lines = d0.zones.filter((z) => z.kind === 'toggle').length;
    assert(d0.battles.length === 5 && lines === 3 && d0.zones.some((z) => z.kind === 'more'),
      `P7a 5 bitew → ${lines} linie i „+N” (pozostałe ${d0.battles.length - lines})`);
    const w = s._zones.find((z) => z.kind === 'watch');
    s.handleClick(w.x + 1, w.y + 1, { emit: (n, p) => emitted.push([n, p]) });
    assert(emitted.length === 1 && emitted[0][0] === 'camera:watchBattle' && emitted[0][1].encounterId === 'encounter_0',
      `P7b „Obserwuj” → \`camera:watchBattle\` (${JSON.stringify(emitted[0]?.[1])})`);
    const tg = s._zones.find((z) => z.kind === 'toggle');
    assert(s.handleClick(tg.x + 1, tg.y + 1) === true && s.expandedId === 'encounter_0', 'P7c ▾ rozwija tę bitwę');
    s.draw(mkCtx(), 1280, 300, { insets: ins });
    const D = s._detail;
    assert(!!D && D.contentH > D.h && s._maxScroll > 0 && D.y >= s.getPanelRect().y && D.y + D.h <= 300 - ins.bottom,
      `P7d rozwinięcie 10 na 10 przy 300 px wysokości przewija się (okno ${D?.h} z ${D?.contentH} px), w obszarze mapy`);
    const sc0 = s._scroll;
    const wheelD = s.handleWheel(D.x + 5, D.y + 5, 40), sc1 = s._scroll;
    const blk = s._zones.find((z) => z.kind === 'body');
    const wheelB = s.handleWheel(blk.x + 2, blk.y + blk.h - 2, 40), sc2 = s._scroll;
    const wheelOut = s.handleWheel(5, 5, 40);
    assert(wheelD === true && sc1 > sc0 && wheelB === true && sc2 === sc1 && wheelOut === false,
      `P7e kółko nad rozwinięciem przewija (${sc0} → ${sc1}), nad blokiem — pochłonięte bez przewinięcia, poza paskiem — nie`);
    assert(s.handleClick(blk.x + 2, blk.y + blk.h - 2) === true && s.handleClick(5, 5) === false && s.expandedId === 'encounter_0',
      'P7f klik w pasek poza chipem pochłonięty (rozwinięcie zostaje), poza paskiem — nie');
    const t2 = s._zones.filter((z) => z.kind === 'toggle')[1];
    s.handleClick(t2.x + 1, t2.y + 1);
    const switched = s.expandedId;
    assert(switched !== 'encounter_0' && s.collapse() === true && s.expandedId === null && s.collapse() === false,
      `P7g ▾ innej bitwy przełącza rozwinięcie (${switched}); Esc zwija raz, drugi — nic`);
    const chip = s.chipAt(w.x + 1, w.y + 1), body = s.chipAt(blk.x + 2, blk.y + blk.h - 2);
    const mDet = compile(UI, '_detectHoverBtn', { H: 300, W: 1280, COSMIC, CIV_PANEL_Y: 0, CIV_SIDEBAR_W: 0 });
    const self = { _outliner: null, _shipPanelHud: null, _fleetPanelHud: null, combatStrip: s };
    assert(chip === 'watch' && body === null && mDet?.call(self, w.x + 1, w.y + 1) === 'combatstrip' && mDet?.call(self, blk.x + 2, blk.y + blk.h - 2) === null,
      'P7h kursor „rączki” tylko nad chipem paska (`_detectHoverBtn`), nad resztą paska — zwykły');
    const mEsc = compile(UI, 'combatStripEscape', { GAME_CONFIG });
    const um = { combatStrip: s, _dirty: false };
    s.handleClick(tg.x + 1, tg.y + 1);
    const e1 = mEsc?.call(um), e2 = mEsc?.call(um);
    const fl = F.cvStrip; s.handleClick(tg.x + 1, tg.y + 1); F.cvStrip = false; const e3 = mEsc?.call(um); F.cvStrip = fl;
    assert(e1 === true && um._dirty === true && e2 === false && e3 === false,
      'P7i `UIManager.combatStripEscape`: rozwinięty — Esc skonsumowany; zwinięty — nie; bez flagi — nie');
  } finally { globalThis.window.KOSMOS = saved; }
});

block('P7j — rozwinięcie idzie za BITWĄ: najmniejsze starcie klastra kończy się (id klastra się zmienia), dobicie ocalałych', () => {
  const saved = globalThis.window.KOSMOS;
  const st = (hp) => ({ hp, hpStart: 100, shieldHP: 0, shieldHPStart: 0 });
  const mk = (id, a, b, at) => ({ id, isActive: true, currentRound: 3, timeline: [], location: { systemId: 'sys_home', planetId: null, point: { ...at } },
    sideA: { vesselIds: a, joinedVesselIds: [], ownerEmpireId: 'player' }, sideB: { vesselIds: b, joinedVesselIds: [], ownerEmpireId: 'emp_x' },
    vesselStates: new Map([...a, ...b].map((v) => [v, st(80)])) });
  const e1 = mk('encounter_1', ['a1'], ['b1'], { x: 0, y: 0 }), e2 = mk('encounter_2', ['a2'], ['b2'], { x: 2, y: 0 });
  const far = mk('encounter_9', ['a9'], ['b9'], { x: 9 * AU, y: 0 });
  const pos = new Map([['a1', { x: 0, y: 0 }], ['b1', { x: 1, y: 0 }], ['a2', { x: 2, y: 0 }], ['b2', { x: 3, y: 0 }], ['a9', { x: 9 * AU, y: 0 }], ['b9', { x: 9 * AU + 1, y: 0 }]]);
  let active = [e1, e2, far];
  try {
    globalThis.window.KOSMOS = { civMode: true, activeSystemId: 'sys_home', deepSpaceCombatSystem: { listActive: () => active },
      vesselManager: { getVessel: (id) => (pos.has(id) ? { id, name: id, position: pos.get(id) } : null) }, starSystemManager: { getAllSystems: () => [] } };
    const s = new SR.CombatStrip();
    const ins = { left: 0, right: 0, top: 28, bottom: 62 };
    s.draw(mkCtx(), 1280, 833, { insets: ins });
    const tg = s._zones.find((z) => z.kind === 'toggle' && z.id === 'encounter_1');
    s.handleClick(tg.x + 1, tg.y + 1);
    active = [e2, far];                     // najmniejsze starcie klastra skończone — klaster ma teraz id encounter_2
    s.draw(mkCtx(), 1280, 833, { insets: ins });
    const afterId = s.expandedId;
    const e5 = mk('encounter_5', ['a2'], ['b9x'], { x: 2, y: 0 });   // dobicie: nowe starcie z okrętem tej bitwy
    pos.set('b9x', { x: 3, y: 0 });
    active = [e5, far];
    s.draw(mkCtx(), 1280, 833, { insets: ins });
    const mopId = s.expandedId;
    active = [far];                         // bitwa skończona całkiem — rozwinięcie się zwija, nie przeskakuje na inną bitwę
    s.draw(mkCtx(), 1280, 833, { insets: ins });
    const endId = s.expandedId;
    assert(afterId === 'encounter_2' && mopId === 'encounter_5' && endId === null,
      `P7j rozwinięcie: encounter_1 → (koniec najmniejszego starcia) ${afterId} → (dobicie tym samym okrętem) ${mopId} → (koniec bitwy) ${endId}; KONTROLA: bitwa obok (encounter_9) nie przejmuje rozwinięcia`);
  } finally { globalThis.window.KOSMOS = saved; }
});

block('P7k — parytet z kartą (G5-C): prostokąt HUD nad paskiem (otwarty picker skoku) — klik i kursor idą do HUD, pasek go nie zasłania', () => {
  const saved = globalThis.window.KOSMOS;
  const st = { hp: 80, hpStart: 100, shieldHP: 0, shieldHPStart: 0 };
  const enc = { id: 'encounter_1', isActive: true, currentRound: 2, timeline: [], location: { systemId: 'sys_home', planetId: null, point: { x: 0, y: 0 } },
    sideA: { vesselIds: ['a1'], joinedVesselIds: [], ownerEmpireId: 'player' }, sideB: { vesselIds: ['b1'], joinedVesselIds: [], ownerEmpireId: 'emp_x' },
    vesselStates: new Map([['a1', { ...st }], ['b1', { ...st }]]) };
  const pos = new Map([['a1', { x: 0, y: 0 }], ['b1', { x: 1, y: 0 }]]);
  let holes = [];
  const clips = [];
  const ctx = new Proxy(mkCtx(), { get(o, k) { if (k === 'clip') return (rule) => clips.push(rule ?? 'nonzero'); return o[k]; } });
  try {
    globalThis.window.KOSMOS = { civMode: true, activeSystemId: 'sys_home', deepSpaceCombatSystem: { listActive: () => [enc] },
      vesselManager: { getVessel: (id) => (pos.has(id) ? { id, name: id, position: pos.get(id) } : null) }, starSystemManager: { getAllSystems: () => [] },
      hudLayer: { uiPassThroughRects: () => holes } };
    const s = new SR.CombatStrip();
    const ins = { left: 190, right: 210, top: 28, bottom: 62 };
    s.draw(ctx, 1280, 833, { insets: ins });
    const w = s._zones.find((z) => z.kind === 'watch');
    const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
    const clipsOff = clips.length;
    const emitted = [];
    const ctlOver = s.isOver(cx, cy), ctlChip = s.chipAt(cx, cy);
    holes = [{ x: cx - 4, y: cy - 4, w: 8, h: 8 }];
    s.draw(ctx, 1280, 833, { insets: ins });
    const holeOver = s.isOver(cx, cy), holeChip = s.chipAt(cx, cy), holeClick = s.handleClick(cx, cy, { emit: (n, p) => emitted.push([n, p]) });
    const besideOver = s.isOver(w.x + w.w - 1, cy);
    assert(ctlOver === true && ctlChip === 'watch',
      `P7k KONTROLA: bez wycięcia ten punkt to chip „Obserwuj” paska (isOver ${ctlOver}, chip ${ctlChip})`);
    assert(holeOver === false && holeChip === null && holeClick === false && emitted.length === 0 && besideOver === true,
      `P7k nad wycięciem pickera HUD pasek nie łapie kliku ani kursora (isOver ${holeOver}, klik ${holeClick}), obok wycięcia — tak (${besideOver})`);
    assert(clipsOff === 0 && clips.includes('evenodd'),
      `P7k rysunek paska z wycięciem tylko, gdy HUD je podaje (bez — ${clipsOff} przycięć, z — ${JSON.stringify(clips)})`);
  } finally { globalThis.window.KOSMOS = saved; }
});

// ═══ P8 — źródło, i18n, stała rund ═══════════════════════════════════════════════════════════════════════════════
block('P8 — źródło: pierścień i biały błysk pod flagą — nie, paski HP 3D zostają; Esc w kaskadzie; routing Dziennika; i18n', () => {
  const tr = strip(TR), gs = strip(GS), ui = strip(UI);
  // CV-Z — przecelowane świadomie: pierścień starcia ukrywany bez flagi, biały błysk P2b usunięty razem z dawnymi smugami.
  assert((/\n\s+this\._hideEncounterRings\(\);/.test(tr) || !/_tickEngagementMarkers\(/.test(tr)) && !/_spawnHitGlow/.test(tr)
    && /\n\s+this\._syncCombatHpBars\(\);/.test(tr),
    'P8a bez pierścienia starcia i białego błysku (P2b — kod usunięty); paski HP 3D bez bramki (zostają do CV-6a)');
  const iEsc = gs.indexOf('um?.combatStripEscape?.()'), iModal = gs.indexOf('escapeHeldByModal('), iFleet = gs.indexOf('escapeClosesFleetPanel(');
  assert(iEsc > iModal && iEsc < iFleet && iModal > 0,
    'P8b Esc: rozwinięty pasek zwija się po oknie DOM, przed panelem floty i zaznaczeniem (`GameScene`)');
  // ARC CV-8b (#635) — PRZECELOWANE ŚWIADOMIE: linia „reszty” idzie przez `_writeBattleLine` (bramka rajdu), routing bez zmian
  assert(/if \(!warId && GAME_CONFIG\.FEATURES\?\.cvStrip && isClusterNarrated\(battleId\)\) \{\s*this\._narrateBattleCluster\(\{ battleId, result \}\);\s*return;\s*\}\s*this\._writeBattleLine\(this\._battleLogEntry\(\{ warId, result(, shipLosses: orbital \? fx\.shipsLost : null)? \}\), \[battleId\]\);/.test(gs)
    && /if \(GAME_CONFIG\.FEATURES\?\.cvStrip && isClusterNarrated\(battleId\)\) return;\s*this\._log\(this\.skirmishLineText\(empireId\), 'combat'\);/.test(ui)
    && (gs.match(/t\(\s*'log\.battleLine'/g) ?? []).length === 1 && (ui.match(/t\(\s*'log\.skirmish'/g) ?? []).length === 1,
    'P8c routing Dziennika: bitwa DSCS pod flagą → narrator klastra, reszta → linia jak dotąd; potyczka DSCS pod flagą nie w `UIManager`; jeden autor każdej linii');
  const pl = read('src/i18n/pl.js'), en = read('src/i18n/en.js');
  const keys = ['combatStrip.round', 'combatStrip.more', 'combatStrip.log', 'combatStrip.logRound', 'combatStrip.miss', 'combatStrip.shield',
    'combatStrip.watchHint', 'combatStrip.expand', 'combatStrip.collapse', 'menu.battleAutoFocus'];
  const has = (src, k) => new RegExp(`'${k.replace('.', '\\.')}':`).test(src);
  assert(keys.every((k) => has(pl, k) && has(en, k)), `P8d i18n: ${keys.length} kluczy w PL i EN`);
  // ⚠ PRZECELOWANIE M1 (decyzja 33, 2026-11-11): starcie nie ma już limitu rund — dawne P8e pinowało lustro `ROUND_CAP` ==
  //   `MAX_ROUNDS` (20, „R n/20”). Teraz: moduł bez limitu, klucz rundy z samą rundą (PL i EN „R{0}”).
  assert(!('ROUND_CAP' in SL) && /'combatStrip\.round':\s*'R\{0\}',/.test(pl) && /'combatStrip\.round':\s*'R\{0\}',/.test(en),
    'P8e (M1) bez limitu rund: brak `ROUND_CAP`, klucz `combatStrip.round` = „R{0}” w PL i EN');
});

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
