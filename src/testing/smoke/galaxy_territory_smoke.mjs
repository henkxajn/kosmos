// Keeper ARC GALAXY, krok G2-3 — TERYTORIUM na płycie galaktyki (docs/design/GALAXY_PLAN.md §4 G2; D-GX-15 (a); Finding 599).
// Protokół lekki F8: keeper wyłącznie dla LOGIKI (eksport pola, widoczność, sygnatura ładunku, szew sporny, aureole, słupki,
// zasłony, przebudowa przy zmianie sygnatury) — bez pinów na stałych rysunku i bez kontroli na poprzednim commicie.
// Finding 599: matematyka pola / pętli / sporności / zrostu (`tmp_territory_b3`), mgła (`b4`) i ładunek 3D (`b5`) — dotąd
// poza sweepem — PRZENIESIONA tutaj (części B3 / B4 / B5 — asercje bez zmian treści).
//   R0  API (`GalaxyTerritoryLogic`, `GalaxyTerritory`)
//   R1  eksport POLA: `Float32Array field` na tej samej siatce co maska (nx·ny), maska = f / ISO · 128 (nasycona), pole bez
//       nasycenia; hash nie zależy od eksportu (dwa przeliczenia tych samych danych — ten sam hash)
//   B3  (z `tmp_territory_b3`, 10 przypadków) pętle, zrost, devScore, sporność, `territory:merged`, podbój, tick civMonth,
//       utrata ≠ zrost, klaster przy krawędzi
//   B4  (z `tmp_territory_b4`) mgła wojny: gracz pełne, AI contact / detailed pełne (+ wojna), rumor zarys, unknown nic
//   B5  (z `tmp_territory_b5`) ładunek 3D Stratcomu (sygnatura content-hash) + `TerritoryField.getVersion`
//   R2  ładunek płyty: warstwy widoczne (unknown pominięty — także w szwie), pole przekazane, sygnatura = siatka + barwa + tryb
//       + wojna + hash (deterministyczna; zmiana każdego składnika — nowa)
//   R3  szew sporny: maksimum pól POZOSTAŁYCH właścicieli per teksel (własne pole pominięte, brak pola — null)
//   R4  aureole własności: gracz zawsze, AI od `contact`; bez właściciela — nic
//   R5  słupki: układy gracza + zaznaczona, bez duplikatów
//   R6  zasłony: 2 trójkąty na odcinek pętli, `v` 0 (podstawa) → 1 (szczyt), pętla < 3 pkt — pominięta
//   R7  `GalaxyTerritory` (three.core): płaszczyzna + zasłona na widocznego właściciela, przebudowa WYŁĄCZNIE przy zmianie
//       sygnatury (miesięczne przeliczenie tych samych danych — bez przebudowy), pokrętła czytane co klatkę, chunki głębi
//       logarytmicznej przy `logDepth` (V4)
// Uruchom: node src/testing/smoke/galaxy_territory_smoke.mjs
import '../headless/env.js';           // MUSI być pierwszy
import * as T3 from '../../lib/three.core.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import EventBus from '../../core/EventBus.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗ FAIL:', m); } };
const header = (s) => console.log(`\n── ${s}`);
const call = (fn, ...a) => { try { return fn ? fn(...a) : undefined; } catch (e) { return `WYJĄTEK: ${e.message}`; } };

let TL = null, GT = null, TF = null, TS = null, TRL = null;
try { TL = await import('../../ui/GalaxyTerritoryLogic.js'); } catch (e) { console.log('  (GalaxyTerritoryLogic:', e.message + ')'); }
try { GT = await import('../../renderer/GalaxyTerritory.js'); } catch (e) { console.log('  (GalaxyTerritory:', e.message + ')'); }
try { TF = await import('../../systems/TerritoryField.js'); } catch (e) { console.log('  (TerritoryField:', e.message + ')'); }
try { TS = await import('../../systems/TerritoryService.js'); } catch (e) { console.log('  (TerritoryService:', e.message + ')'); }
try { TRL = await import('../../ui/TerritoryRenderLogic.js'); } catch (e) { console.log('  (TerritoryRenderLogic:', e.message + ')'); }

const setKosmos = (k) => { globalThis.window.KOSMOS = k; globalThis.KOSMOS = k; };
const loopArea = (loop) => { const p = loop.pts; let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; } return Math.abs(a) / 2; };
const totalArea = (t) => (t ? t.loops.reduce((s, l) => s + loopArea(l), 0) : 0);
function mockKosmos(ownedFn, positions, gameTime = 100) {
  const systems = Object.entries(positions).map(([id, p]) => ({ id, x: p.x, y: p.y, z: 0 }));
  const svc = {
    getSystemOwner:    (id)  => ownedFn().find((o) => o.systemId === id)?.owner ?? null,
    getOwnedSystems:   (oid) => ownedFn().filter((o) => o.owner === oid).map((o) => ({ systemId: o.systemId, devScore: o.devScore, kind: o.kind ?? 'colony' })),
    getSystemDevScore: (id)  => ownedFn().find((o) => o.systemId === id)?.devScore ?? 0,
    getEmpireColor:    (oid) => (oid === 'player' ? '#33ccff' : '#B03030'),
    reindex:           () => {},
  };
  setKosmos({ territoryService: svc, galaxyData: { systems }, timeSystem: { gameTime } });
  return svc;
}
const ov0 = GAME_CONFIG.FEATURES.territoryOverlay;
GAME_CONFIG.FEATURES.territoryOverlay = true;

header('R0  API');
{
  const need = ['plateTerritoryVisibility', 'othersMaxField', 'buildPlateTerritoryPayload', 'plateOwnerHalos', 'plateRiserIds', 'curtainGeometry'];
  const miss = need.filter((k) => !(TL && k in TL));
  ok(miss.length === 0, `R0a GalaxyTerritoryLogic — ${need.length} eksportów (brak: ${miss.join(', ') || '—'})`);
  ok(typeof GT?.GalaxyTerritory === 'function', 'R0b GalaxyTerritory');
}

header('R1  eksport pola');
{
  mockKosmos(() => [{ systemId: 'sA', owner: 'player', devScore: 20 }], { sA: { x: 0, y: 0 } });
  const tf = new TF.TerritoryField();
  const td = tf.getTerritory('player');
  const mb = td?.maskBounds;
  ok(td?.field instanceof Float32Array && td.field.length === mb.nx * mb.ny && td.mask.length === td.field.length, 'R1a pole = Float32Array na siatce maski (nx·ny)');
  const ISO = GAME_CONFIG.TERRITORY.ISO;
  let maxF = 0, consistent = true;
  for (let k = 0; k < td.field.length; k++) {
    maxF = Math.max(maxF, td.field[k]);
    if (td.mask[k] !== Math.min(255, Math.round((td.field[k] / ISO) * 128))) consistent = false;
  }
  ok(consistent, 'R1b maska = f / ISO · 128 (ten sam teksel)');
  ok(maxF > 2 * ISO - 1e-6 && maxF > 0.99, `R1c pole bez nasycenia maski (maks. ${maxF.toFixed(3)} — rdzeń ponad 2 × ISO)`);
  const h1 = td.hash; tf.recompute(); const h2 = tf.getTerritory('player').hash;
  ok(typeof h1 === 'string' && h1 === h2, 'R1d hash bez zmian przy ponownym przeliczeniu tych samych danych');
  tf.dispose();
}

header('B3  pętle, zrost, sporność (z tmp_territory_b3)');
{
  mockKosmos(() => [{ systemId: 'sA', owner: 'player', devScore: 10 }], { sA: { x: 0, y: 0 } });
  let tf = new TF.TerritoryField(); let t = tf.getTerritory('player');
  ok(t?.loops.length === 1 && t?.color === '#33ccff', 'B3-T1 1 układ → 1 pętla, kolor gracza');
  tf.dispose();
  mockKosmos(() => [{ systemId: 'sA', owner: 'player', devScore: 20 }, { systemId: 'sB', owner: 'player', devScore: 20 }], { sA: { x: 0, y: 0 }, sB: { x: 2, y: 0 } });
  tf = new TF.TerritoryField(); ok(tf.getTerritory('player').loops.length === 1, 'B3-T2 2 blisko → 1 zlana pętla'); tf.dispose();
  mockKosmos(() => [{ systemId: 'sA', owner: 'player', devScore: 20 }, { systemId: 'sB', owner: 'player', devScore: 20 }], { sA: { x: 0, y: 0 }, sB: { x: 15, y: 0 } });
  tf = new TF.TerritoryField(); ok(tf.getTerritory('player').loops.length === 2, 'B3-T3 2 daleko → 2 pętle'); tf.dispose();
  mockKosmos(() => [{ systemId: 'sA', owner: 'player', devScore: 5 }], { sA: { x: 0, y: 0 } });
  const lo = new TF.TerritoryField(); const aLo = totalArea(lo.getTerritory('player')); lo.dispose();
  mockKosmos(() => [{ systemId: 'sA', owner: 'player', devScore: 20 }], { sA: { x: 0, y: 0 } });
  const hi = new TF.TerritoryField(); const aHi = totalArea(hi.getTerritory('player')); hi.dispose();
  ok(aHi > aLo * 1.5, 'B3-T4 wzrost devScore → większe pole');
  mockKosmos(() => [{ systemId: 'sP', owner: 'player', devScore: 20 }, { systemId: 'sE', owner: 'emp_001', devScore: 20 }], { sP: { x: 0, y: 0 }, sE: { x: 5, y: 0 } });
  tf = new TF.TerritoryField(); ok(tf.getTerritory('player').loops.some((l) => l.contested), 'B3-T5 AI obok → pętla gracza sporna'); tf.dispose();
  {
    let owned = [{ systemId: 'sA', owner: 'player', devScore: 20 }, { systemId: 'sB', owner: 'player', devScore: 20 }];
    mockKosmos(() => owned, { sA: { x: 0, y: 0 }, sB: { x: 12, y: 0 }, sBridge: { x: 6, y: 0 } }, 300);
    tf = new TF.TerritoryField();
    const start2 = tf.getTerritory('player').loops.length === 2;
    let merged = 0; const cb = (d) => { if (d.ownerId === 'player') merged++; }; EventBus.on('territory:merged', cb);
    owned = [...owned, { systemId: 'sBridge', owner: 'player', devScore: 20 }];
    EventBus.emit('territory:ownersChanged', {});
    ok(start2 && tf.getTerritory('player').loops.length === 1 && merged >= 1, 'B3-T6 most: 2 pętle → 1, `territory:merged` strzela');
    EventBus.off('territory:merged', cb); tf.dispose();
  }
  if (TS?.TerritoryService) {
    const colonies = [{ planetId: 'sX', systemId: 'sysX', ownerEmpireId: 'emp_001', isOutpost: true, civSystem: { population: 0 }, buildingSystem: { _active: { size: 2 } } }];
    const koz = { colonyManager: { getAllColonies: () => colonies }, stationSystem: { getAllStations: () => [] }, gameState: { get: () => '#33ccff' },
      empireRegistry: { get: () => ({ color: '#B03030', archetype: 'xenophage' }) }, galaxyData: { systems: [{ id: 'sysX', x: 5, y: 5, z: 0 }] }, timeSystem: { gameTime: 400 } };
    setKosmos(koz);
    const svc = new TS.TerritoryService(); koz.territoryService = svc;
    tf = new TF.TerritoryField();
    const before = !!tf.getTerritory('emp_001') && tf.getTerritory('player') === null;
    colonies[0].ownerEmpireId = null;
    EventBus.emit('colony:capturedByPlayer', { planetId: 'sX' });
    ok(before && !!tf.getTerritory('player') && tf.getTerritory('emp_001') === null && tf.getTerritory('player').color === '#33ccff',
      'B3-T7 podbój (prawdziwy TerritoryService): pole zmienia właściciela AI → gracz');
    tf.dispose(); svc.dispose();
  } else ok(false, 'B3-T7 TerritoryService niedostępny');
  {
    let dev = 5;
    const svc = { getSystemOwner: (id) => (id === 'sG' ? 'player' : null), getOwnedSystems: (oid) => (oid === 'player' ? [{ systemId: 'sG', devScore: dev, kind: 'colony' }] : []),
      getSystemDevScore: () => dev, getEmpireColor: () => '#33ccff', reindex: () => {} };
    setKosmos({ territoryService: svc, galaxyData: { systems: [{ id: 'sG', x: 0, y: 0, z: 0 }] }, timeSystem: { gameTime: 100 } });
    tf = new TF.TerritoryField();
    const a1 = totalArea(tf.getTerritory('player'));
    dev = 20;
    const a1b = totalArea(tf.getTerritory('player'));
    globalThis.KOSMOS.timeSystem.gameTime = 100.2;
    EventBus.emit('time:tick', {});
    const a2 = totalArea(tf.getTerritory('player'));
    ok(Math.abs(a1b - a1) < 1e-6 && a2 > a1 * 1.5, 'B3-T8 wzrost devScore bez zdarzenia — łapie dopiero tick po civMonth');
    tf.dispose();
  }
  {
    let owned = [{ systemId: 'sA', owner: 'player', devScore: 20 }, { systemId: 'sB', owner: 'player', devScore: 20 }];
    mockKosmos(() => owned, { sA: { x: 0, y: 0 }, sB: { x: 15, y: 0 } }, 500);
    tf = new TF.TerritoryField();
    const two = tf.getTerritory('player').loops.length === 2;
    let merged = 0; const cb = (d) => { if (d.ownerId === 'player') merged++; }; EventBus.on('territory:merged', cb);
    owned = [{ systemId: 'sA', owner: 'player', devScore: 20 }];
    EventBus.emit('territory:ownersChanged', {});
    ok(two && tf.getTerritory('player').loops.length === 1 && merged === 0, 'B3-T9 utrata odległej kolonii (2 → 1 pętla) — `territory:merged` NIE strzela');
    EventBus.off('territory:merged', cb); tf.dispose();
  }
  mockKosmos(() => [{ systemId: 'e1', owner: 'player', devScore: 20 }, { systemId: 'e2', owner: 'player', devScore: 20 }, { systemId: 'e3', owner: 'player', devScore: 20 }],
    { e1: { x: 22, y: 0 }, e2: { x: 22, y: 1 }, e3: { x: 22, y: -1 } });
  tf = new TF.TerritoryField(); t = tf.getTerritory('player');
  ok(t.loops.length === 1 && totalArea(t) > 0 && Number.isFinite(totalArea(t)), 'B3-T10 klaster przy krawędzi galaktyki → 1 zamknięta pętla');
  tf.dispose();
}

header('B4  mgła wojny (z tmp_territory_b4)');
{
  const LEVELS = { player: 'n/a', ai_contact: 'contact', ai_detailed: 'detailed', ai_rumor: 'rumor', ai_unknown: 'unknown' };
  const WARS = new Set(['ai_contact']);
  const res = call(() => TRL.resolveTerritoryVisibility(['player', 'ai_contact', 'ai_detailed', 'ai_rumor', 'ai_unknown'],
    { isPlayer: (o) => o === 'player', intelLevelOf: (o) => LEVELS[o], isAtWarWith: (o) => WARS.has(o) })) ?? [];
  const by = new Map(res.map((r) => [r.ownerId, r]));
  ok(by.get('player')?.mode === 'full' && by.get('player')?.atWar === false, 'B4a gracz → pełne, bez wojny');
  ok(by.get('ai_contact')?.mode === 'full' && by.get('ai_contact')?.atWar === true, 'B4b AI contact → pełne + wojna');
  ok(by.get('ai_detailed')?.mode === 'full' && by.get('ai_detailed')?.atWar === false, 'B4c AI detailed → pełne');
  ok(by.get('ai_rumor')?.mode === 'outline' && by.get('ai_rumor')?.atWar === false, 'B4d AI rumor → sam zarys');
  ok(by.get('ai_unknown')?.mode === 'skip' && res.length === 5, 'B4e AI unknown → nic; kolejność i liczba zachowane');
  const pv = call(() => TL.plateTerritoryVisibility([{ ownerId: 'player' }, { ownerId: 'ai_rumor' }, { ownerId: 'ai_unknown' }],
    { intelLevelOf: (o) => LEVELS[o], isAtWarWith: () => false })) ?? [];
  ok(pv.map((v) => v.mode).join(',') === 'full,outline,skip', 'B4f płyta — ten sam kanon mgły (`resolveTerritoryVisibility`)');
}

const mb1 = { nx: 1, ny: 1, x0: 0, y0: 0, cell: 1 };
const terrs = () => [
  { ownerId: 'player', color: '#33ccff', mask: new Uint8Array([200]), maskBounds: mb1, loops: [{ pts: [{ x: 0, y: 0 }] }], hash: 'hP', field: new Float32Array([1.2]) },
  { ownerId: 'emp_contact', color: '#B03030', mask: new Uint8Array([200]), maskBounds: mb1, loops: [{ pts: [{ x: 1, y: 1 }] }], hash: 'hC', field: new Float32Array([0.9]) },
  { ownerId: 'emp_rumor', color: '#4A5A80', mask: new Uint8Array([200]), maskBounds: mb1, loops: [{ pts: [{ x: 2, y: 2 }] }], hash: 'hR', field: new Float32Array([0.7]) },
  { ownerId: 'emp_unknown', color: '#C89040', mask: new Uint8Array([200]), maskBounds: mb1, loops: [{ pts: [{ x: 3, y: 3 }] }], hash: 'hU', field: new Float32Array([5.0]) },
];
const LV = { emp_contact: 'contact', emp_rumor: 'rumor', emp_unknown: 'unknown' };

header('B5  ładunek 3D Stratcomu + wersja pola (z tmp_territory_b5)');
{
  const territories = terrs();
  const vis = TRL?.resolveTerritoryVisibility?.(territories.map((x) => x.ownerId), { isPlayer: (o) => o === 'player', intelLevelOf: (o) => LV[o], isAtWarWith: () => false });
  const payload = call(() => TRL.buildTerritory3DPayload(territories, vis, { fillAlpha: 0.07 }));
  const by = new Map((payload?.layers ?? []).map((l) => [l.colorHex, l]));
  ok(payload?.fillAlpha === 0.07 && payload?.layers?.length === 3, 'B5-A1/A2 fillAlpha przekazany, unknown pominięty (3 warstwy)');
  ok(by.get('#33ccff')?.mode === 'full' && by.get('#33ccff')?.mask != null && by.get('#B03030')?.mode === 'full', 'B5-A3/A4 gracz i AI contact — pełne z maską');
  ok(by.get('#4A5A80')?.mode === 'outline' && by.get('#4A5A80')?.mask == null, 'B5-A5 AI rumor — zarys bez tintu');
  ok((payload?.layers ?? []).every((l) => Array.isArray(l.loops)) && payload?.sig?.includes?.('#33ccff'), 'B5-A6/A7 warstwy z pętlami, sygnatura niepusta');
  const again = call(() => TRL.buildTerritory3DPayload(territories, vis))?.sig;
  const changed = call(() => TRL.buildTerritory3DPayload(territories.map((x) => (x.ownerId === 'emp_contact' ? { ...x, hash: 'ZZZZ' } : x)), vis))?.sig;
  ok(again === payload?.sig && changed !== payload?.sig, 'B5-A8/A9 sygnatura deterministyczna, zmienia się z hashem');
  const svc = { getSystemOwner: (id) => (id === 'sG' ? 'player' : null), getOwnedSystems: (oid) => (oid === 'player' ? [{ systemId: 'sG', devScore: 10, kind: 'colony' }] : []),
    getSystemDevScore: () => 10, getEmpireColor: () => '#33ccff', reindex: () => {} };
  setKosmos({ territoryService: svc, galaxyData: { systems: [{ id: 'sG', x: 0, y: 0, z: 0 }] }, timeSystem: { gameTime: 100 } });
  const tf = new TF.TerritoryField();
  const v0 = tf.getVersion(); tf.getTerritory('player'); const v1 = tf.getVersion(); tf.recompute(); const v2 = tf.getVersion();
  ok(v0 === 0 && v1 === 1 && v2 === 2, 'B5-B1..B3 `getVersion` rośnie z każdym przeliczeniem');
  tf.dispose();
}

header('R2  ładunek płyty');
{
  const territories = terrs();
  const vis = TL?.plateTerritoryVisibility?.(territories, { intelLevelOf: (o) => LV[o], isAtWarWith: (o) => o === 'emp_contact' });
  const p = call(() => TL.buildPlateTerritoryPayload(territories, vis));
  ok(p?.layers?.map?.((l) => `${l.ownerId}:${l.mode}`).join(',') === 'player:full,emp_contact:full,emp_rumor:outline', 'R2a warstwy widoczne (unknown pominięty)');
  ok(p?.layers?.[0]?.field?.[0] === territories[0].field[0] && p?.grid?.nx === 1 && p?.layers?.[1]?.atWar === true, 'R2b pole przekazane, siatka, flaga wojny');
  const sig = p?.sig;
  const re = (mut) => call(() => TL.buildPlateTerritoryPayload(mut(terrs()), TL.plateTerritoryVisibility(mut(terrs()), { intelLevelOf: (o) => LV[o], isAtWarWith: (o) => o === 'emp_contact' })))?.sig;
  ok(re((x) => x) === sig, 'R2c sygnatura deterministyczna (te same dane — bez przebudowy)');
  ok(re((x) => x.map((q) => (q.ownerId === 'player' ? { ...q, hash: 'X' } : q))) !== sig, 'R2d zmiana hasha pola — nowa sygnatura');
  ok(re((x) => x.map((q) => (q.ownerId === 'player' ? { ...q, color: '#00ff00' } : q))) !== sig, 'R2e zmiana barwy — nowa sygnatura');
  const pNoWar = call(() => TL.buildPlateTerritoryPayload(territories, TL.plateTerritoryVisibility(territories, { intelLevelOf: (o) => LV[o], isAtWarWith: () => false })));
  ok(pNoWar?.sig !== sig, 'R2f zmiana stanu wojny — nowa sygnatura');
  const pMode = call(() => TL.buildPlateTerritoryPayload(territories, TL.plateTerritoryVisibility(territories, { intelLevelOf: (o) => ({ ...LV, emp_rumor: 'contact' })[o], isAtWarWith: (o) => o === 'emp_contact' })));
  ok(pMode?.sig !== sig, 'R2g zmiana trybu (zarys → pełne) — nowa sygnatura');
  ok(!(p?.layers ?? []).some((l) => l.others?.[0] === 5.0), 'R2h pole nieznanego (unknown) NIE wchodzi do szwu spornego (nie zdradza terytorium)');
}

header('R3  szew sporny');
{
  const a = new Float32Array([0.1, 0.9, 0.4]), b = new Float32Array([0.8, 0.2, 0.4]), c = new Float32Array([0.3, 0.3, 1.5]);
  const r = call(() => TL.othersMaxField([a, b, c, null, new Float32Array(2)]));
  ok(Array.from(r?.[0] ?? []).map((v) => +v.toFixed(3)).join(',') === '0.8,0.3,1.5', 'R3a warstwa A: maksimum pól B i C per teksel (własne pominięte)');
  ok(Array.from(r?.[2] ?? []).map((v) => +v.toFixed(3)).join(',') === '0.8,0.9,0.4', 'R3b warstwa C: maksimum A i B');
  ok(r?.[3] === null && (r?.[4]?.length === 2 && r[4][0] === 0), 'R3c brak pola — null; inna długość siatki — nie miesza się');
}

header('R4  aureole własności');
{
  const systems = [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }];
  const owner = { s1: 'player', s2: 'emp_a', s3: 'emp_b' };
  const h = call(() => TL.plateOwnerHalos({ systems, ownerOf: (id) => owner[id] ?? null, colorOf: (o) => (o === 'player' ? '#33ccff' : '#aa3333'),
    intelAtLeast: (o, lvl) => o === 'emp_a' && lvl === 'contact' })) ?? [];
  ok(h.map((x) => `${x.systemId}:${x.ownerId}`).join(',') === 's1:player,s2:emp_a', 'R4a gracz zawsze, AI od `contact`, AI bez kontaktu i układ bez właściciela — nic');
  ok(h[0]?.color === '#33ccff', 'R4b barwa = tożsamość imperium (paleta)');
}

header('R5  słupki');
{
  ok(call(() => TL.plateRiserIds({ ownedIds: ['a', 'b', 'a'], selectedId: 'c' }))?.join(',') === 'a,b,c', 'R5a układy gracza + zaznaczona, bez duplikatów');
  ok(call(() => TL.plateRiserIds({ ownedIds: ['a'], selectedId: 'a' }))?.join(',') === 'a', 'R5b zaznaczona własna — jeden słupek');
}

header('R6  zasłony');
{
  const sq = { pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] };
  const g = call(() => TL.curtainGeometry([sq, { pts: [{ x: 5, y: 5 }, { x: 6, y: 5 }] }], 0.5));
  ok(g?.count === 4 * 6, 'R6a 4 odcinki × 2 trójkąty = 24 wierzchołki; pętla < 3 pkt — pominięta');
  let base = true, top = true;
  for (let i = 0; i < (g?.count ?? 0); i++) {
    const y = g.position[i * 3 + 1], v = g.v[i];
    if (v === 0 && y !== 0) base = false;
    if (v === 1 && Math.abs(y - 0.5) > 1e-6) top = false;
  }
  ok(base && top, 'R6b podstawa y = 0 (v = 0), szczyt y = wysokość (v = 1) — krycie gaśnie z wysokością');
  ok(g?.position?.[2] === 0 && g?.position?.[3] === 1, 'R6c płaszczyzna płyty: x = gx, z = gy galaktyki');
}

header('R7  GalaxyTerritory — przebudowa przy zmianie sygnatury');
{
  const tr = GT?.GalaxyTerritory ? new GT.GalaxyTerritory(T3, { logDepth: true, layer: 1 }) : null;
  const territories = [
    { ownerId: 'player', color: '#33ccff', maskBounds: { nx: 4, ny: 4, x0: -2, y0: -2, cell: 1 }, loops: [{ pts: [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }] }],
      hash: 'h1', field: new Float32Array(16).fill(0.6) },
    { ownerId: 'emp_c', color: '#B03030', maskBounds: { nx: 4, ny: 4, x0: -2, y0: -2, cell: 1 }, loops: [], hash: 'h2', field: new Float32Array(16).fill(0.3) },
  ];
  const vis = TL?.plateTerritoryVisibility?.(territories, { intelLevelOf: () => 'contact', isAtWarWith: () => false });
  const payload = TL?.buildPlateTerritoryPayload?.(territories, vis);
  const opts = { colorOf: (hex) => new T3.Color(hex), outlineColor: new T3.Color(0.4, 0.4, 0.4), iso: 0.5 };
  const b1 = call(() => tr.apply(payload, opts));
  const info = call(() => tr.info());
  ok(b1 === true && info?.owners?.length === 2 && info.owners[0].plane && info.owners[0].curtain && !info.owners[1].curtain,
    'R7a płaszczyzna na właściciela, zasłona tylko z pętlami');
  const again = TL?.buildPlateTerritoryPayload?.(territories, vis);
  const b2 = call(() => tr.apply(again, opts));
  ok(b2 === false && tr?._rebuilds === 1, 'R7b te same dane (miesięczne przeliczenie) — bez przebudowy tekstur');
  const b3 = call(() => tr.apply(TL.buildPlateTerritoryPayload(territories.map((q, i) => (i === 0 ? { ...q, hash: 'h1b' } : q)), vis), opts));
  ok(b3 === true && tr?._rebuilds === 2, 'R7c zmiana sygnatury — przebudowa');
  call(() => tr.tick({ time: 3, fade: 0.5, knobs: { TERR_POOL_ALPHA: 0.2, TERR_CORE_MULT: 2, TERR_RIM_PX: 1.5, TERR_RIM_I: 1, TERR_SEAM_PX: 2,
    TERR_SEAM_I: 1.2, TERR_BREATH: 0.01, TERR_CURTAIN_A: 0.3, TERR_CURTAIN_LY: 0.8 } }));
  const it0 = tr?._items?.[0];
  ok(it0?.plane?.material?.uniforms?.uPoolA?.value === 0.2 && it0?.plane?.material?.uniforms?.uFade?.value === 0.5 && it0?.curtain?.scale?.y === 0.8,
    'R7d pokrętła wyglądu czytane co klatkę (krycie, gaśnięcie z płytą, wysokość zasłony)');
  const vs = it0?.plane?.material?.vertexShader ?? '', fs = it0?.plane?.material?.fragmentShader ?? '';
  ok(/logdepthbuf/i.test(vs) && /logdepthbuf/i.test(fs), 'R7e chunki głębi logarytmicznej (V4) przy `logDepth`');
  ok(it0?.plane?.layers?.mask === 2, 'R7f warstwa płyty (kamera trybu układu i raycast układu ich nie widzą)');
  call(() => tr.dispose());
  ok(tr?._items?.length === 0, 'R7g `dispose` zwalnia warstwy');
}

header('R8  styl szwu spornego (T6) — wagi i uniformy');
{
  const w = (s) => { const p = call(() => TL.seamStyleParams(s)); return p && typeof p === 'object' ? `${p.white}/${p.hatch}/${p.rimOverlap}` : String(p); };
  ok(w(0) === '1/0/1' && w(1) === '0/1/1' && w(2) === '0/0/0.5', 'R8a tabela stylów 0 / 1 / 2 → wagi (biały / kreskowanie / krycie krawędzi w nakładaniu)');
  const bad = [undefined, null, NaN, Infinity, 1.5, '1', -1, 3, 99, {}];
  ok(bad.every((v) => w(v) === '1/0/1'), 'R8b wartość spoza {0,1,2} (brak, NaN, ułamek, tekst, poza zakresem) → styl 0');
  const a = call(() => TL.seamStyleParams(1)), b = call(() => TL.seamStyleParams(1));
  if (a && typeof a === 'object') a.white = 7;
  ok(b?.white === 0 && call(() => TL.seamStyleParams(1))?.white === 0 && Object.isFrozen(TL?.SEAM_STYLES), 'R8c zwrot to kopia (mutacja nie psuje tabeli); tabela zamrożona');

  const mk = () => {
    const tr = GT?.GalaxyTerritory ? new GT.GalaxyTerritory(T3, { logDepth: false, layer: 1 }) : null;
    const terr = [
      { ownerId: 'player', color: '#33ccff', maskBounds: { nx: 4, ny: 4, x0: -2, y0: -2, cell: 1 }, loops: [], hash: 'h1', field: new Float32Array(16).fill(0.6) },
      { ownerId: 'emp_c', color: '#B03030', maskBounds: { nx: 4, ny: 4, x0: -2, y0: -2, cell: 1 }, loops: [], hash: 'h2', field: new Float32Array(16).fill(0.3) },
    ];
    const vis = TL?.plateTerritoryVisibility?.(terr, { intelLevelOf: () => 'contact', isAtWarWith: () => false });
    call(() => tr.apply(TL.buildPlateTerritoryPayload(terr, vis), { colorOf: (hex) => new T3.Color(hex), iso: 0.5 }));
    return tr;
  };
  const base = { TERR_POOL_ALPHA: 0.2, TERR_CORE_MULT: 2, TERR_RIM_PX: 1.5, TERR_RIM_I: 1, TERR_SEAM_PX: 2, TERR_SEAM_I: 1.2, TERR_BREATH: 0.01,
    TERR_CURTAIN_A: 0.3, TERR_CURTAIN_LY: 0.8 };
  const uni = (tr, i) => { const u = tr?._items?.[i]?.plane?.material?.uniforms; return u ? `${u.uSeamWhite.value}/${u.uSeamHatch.value}/${u.uRimOverlap.value}` : 'brak'; };
  const tr = mk();
  ok(tr?._items?.length === 2, 'R8d fixture: dwie płaszczyzny (dwóch widocznych właścicieli)');
  call(() => tr.tick({ time: 1, fade: 1, knobs: { ...base, TERR_SEAM_STYLE: 0 } }));
  ok(uni(tr, 0) === '1/0/1' && uni(tr, 1) === '1/0/1', 'R8e styl 0 = tożsamość: uniformy 1 / 0 / 1 na każdej płaszczyźnie (dotychczasowy wynik)');
  call(() => tr.tick({ time: 1, fade: 1, knobs: { ...base } }));
  ok(uni(tr, 0) === '1/0/1', 'R8f brak pokrętła w knobach → styl 0 (stare knoby bez TERR_SEAM_STYLE)');
  call(() => tr.tick({ time: 1, fade: 1, knobs: { ...base, TERR_SEAM_STYLE: 1 } }));
  ok(uni(tr, 0) === '0/1/1' && uni(tr, 1) === '0/1/1', 'R8g styl 1 → kreskowanie obu płaszczyzn, bez bieli');
  call(() => tr.tick({ time: 1, fade: 1, knobs: { ...base, TERR_SEAM_STYLE: 2 } }));
  ok(uni(tr, 0) === '0/0/0.5' && uni(tr, 1) === '0/0/0.5', 'R8h styl 2 → bez szwu, krawędzie w nakładaniu × 0,5');
  call(() => tr.tick({ time: 1, fade: 1, knobs: { ...base, TERR_SEAM_STYLE: 'x' } }));
  ok(uni(tr, 0) === '1/0/1', 'R8i powrót do stylu 0 (także z wartości błędnej) w następnej klatce — uniformy nie „zostają” po poprzednim stylu');
  call(() => tr.tick({ time: 1, fade: 1 }));
  let live = null;
  try { live = (await import('../../ui/GalaxyModeLogic.js')).LIVE_GALAXY; } catch (e) { console.log('  (GalaxyModeLogic:', e.message + ')'); }
  ok(live?.TERR_SEAM_STYLE === 0 && uni(tr, 0) === '1/0/1', 'R8j domyślne pokrętło (LIVE_GALAXY) = styl 0 → uniformy 1 / 0 / 1');
  call(() => tr.dispose());
}

GAME_CONFIG.FEATURES.territoryOverlay = ov0;
console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
