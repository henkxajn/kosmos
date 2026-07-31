// C6c-1 — cap „1 stacja na grupę (planeta+księżyce)": derywacja stationGroupOf + pure resolver.
// Dowód DEKOUPLINGU: importuje TYLKO StationGroup (+ EntityManager przez nie), ZERO SystemPoolService.
// Uruchom: node src/testing/smoke/station_group_smoke.mjs
import EntityManager from '../../core/EntityManager.js';
import { stationGroupAnchorId, stationGroupOf, resolveStationGroupState } from '../../utils/StationGroup.js';

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { console.log('  PASS  ' + n); pass++; } else { console.error('  FAIL  ' + n); fail++; } };

// ── Fixtures: planeta P {M1,M2}, planeta Q {N}, samotna planeta R ──
EntityManager.clear();
const P  = { id: 'P',  type: 'planet' };
const Q  = { id: 'Q',  type: 'planet' };
const R  = { id: 'R',  type: 'planet' };
const M1 = { id: 'M1', type: 'moon', parentPlanetId: 'P' };
const M2 = { id: 'M2', type: 'moon', parentPlanetId: 'P' };
const N  = { id: 'N',  type: 'moon', parentPlanetId: 'Q' };
[P, Q, R, M1, M2, N].forEach(b => EntityManager.add(b));

// ── T1: anchor ──
console.log('--- T1: stationGroupAnchorId ---');
ok('planeta → własne id', stationGroupAnchorId(P) === 'P');
ok('księżyc → parentPlanetId', stationGroupAnchorId(M1) === 'P');
ok('księżyc bez parenta → własne id', stationGroupAnchorId({ id: 'X', type: 'moon' }) === 'X');
ok('null → null', stationGroupAnchorId(null) === null);

// ── T2: members (planeta+księżyce) ──
console.log('--- T2: stationGroupOf members ---');
const gP = stationGroupOf(P);
ok('grupa P = {P,M1,M2}', gP.anchorId === 'P' && new Set(gP.memberBodyIds).size === 3 && ['P', 'M1', 'M2'].every(id => gP.memberBodyIds.includes(id)));
const gM1 = stationGroupOf(M1);
ok('grupa M1 = grupa P (ta sama kotwica)', gM1.anchorId === 'P' && gM1.memberBodyIds.length === 3);
const gQ = stationGroupOf(Q);
ok('grupa Q = {Q,N} (rozłączna z P)', gQ.anchorId === 'Q' && gQ.memberBodyIds.length === 2 && gQ.memberBodyIds.includes('N') && !gQ.memberBodyIds.includes('M1'));
const gR = stationGroupOf(R);
ok('samotna planeta R = {R}', gR.anchorId === 'R' && gR.memberBodyIds.length === 1);
ok('brak ciała → pusta grupa', stationGroupOf(null).anchorId === null && stationGroupOf(null).memberBodyIds.length === 0);

// ── T3: resolveStationGroupState (pure, injected lookups) ──
console.log('--- T3: resolveStationGroupState ---');
const noStations = () => [];
const noColony = () => null;
ok('pusta grupa → build', resolveStationGroupState(gP, { getStationsAt: noStations, getColony: noColony }).state === 'build');

// stacja GRACZA na M2 → exists (+ stationBodyId = LOKALIZACJA)
const withStation = (bid) => bid === 'M2' ? [{ id: 'st1', bodyId: 'M2', ownerEmpireId: null }] : [];
const rExists = resolveStationGroupState(gP, { getStationsAt: withStation, getColony: noColony });
ok('stacja na członku → exists (stationBodyId=M2)', rExists.state === 'exists' && rExists.stationBodyId === 'M2');
ok('exists NIE niesie przeciążonego bodyId', rExists.bodyId === undefined && rExists.targetBodyId === undefined);

// stacja WROGA na M2 → NIE exists (filtr gracza) → build
const enemyStation = (bid) => bid === 'M2' ? [{ id: 'st2', bodyId: 'M2', ownerEmpireId: 'ai_1' }] : [];
ok('stacja wroga → NIE exists (build)', resolveStationGroupState(gP, { getStationsAt: enemyStation, getColony: noColony }).state === 'build');

// pending order (kolonia P, target M1) → pending (+ targetBodyId = CEL, nie wystawca)
const colonyWithPending = (bid) => bid === 'P' ? { pendingStationOrders: [{ id: 'o1', targetBodyId: 'M1' }] } : null;
const rPending = resolveStationGroupState(gP, { getStationsAt: noStations, getColony: colonyWithPending });
ok('pending w grupie → pending (targetBodyId=M1)', rPending.state === 'pending' && rPending.targetBodyId === 'M1');
ok('pending NIE niesie stationBodyId', rPending.stationBodyId === undefined && rPending.bodyId === undefined);

// exists ma priorytet nad pending
const rBoth = resolveStationGroupState(gP, { getStationsAt: withStation, getColony: colonyWithPending });
ok('exists > pending (priorytet)', rBoth.state === 'exists');

// pending na ciało SPOZA grupy (target N ∉ {P,M1,M2}) → build (nie łapie cudzej grupy)
const colonyPendingOther = (bid) => bid === 'P' ? { pendingStationOrders: [{ id: 'o2', targetBodyId: 'N' }] } : null;
ok('pending na obcy target → build (nie myli grup)', resolveStationGroupState(gP, { getStationsAt: noStations, getColony: colonyPendingOther }).state === 'build');

console.log(`\n=== WYNIK: ${pass} PASS / ${fail} FAIL (z ${pass + fail}) ===`);
process.exit(fail === 0 ? 0 : 1);
