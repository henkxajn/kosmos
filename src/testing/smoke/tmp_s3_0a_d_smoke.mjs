// S3.0a Commit (d) — smoke test (offline). Stranding gracza (owner-gated).
//
// Pokrycie:
//   T1  i18n: 4 nowe klucze w PL i EN                                     (8 cases)
//   T2  isEnemyVessel — owner predicate (gracz vs AI)                     (4 cases)
//   T3  effectiveRange / canReach — warunek strandingu (pure)            (3 cases)
//   T4  VesselManager._maybeNotifyStranded — owner-gated alarm           (6 cases)
//   T5  dispatchOnMission NIE blokuje przy braku paliwa (AI-invariant)   (2 cases)
//   T6  Wersja save niezmieniona (80 — bez migracji w (d))               (1 case)

globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
};
globalThis.window = globalThis;
globalThis.window.KOSMOS = { debug: {} };
globalThis.document = {
  createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }),
  getElementById: () => null,
};

const plMod = await import('../../i18n/pl.js');
const enMod = await import('../../i18n/en.js');
const { effectiveRange, canReach, isEnemyVessel } = await import('../../entities/Vessel.js');
const { VesselManager } = await import('../../systems/VesselManager.js');
const { GAME_CONFIG } = await import('../../config/GameConfig.js');
const { CURRENT_VERSION } = await import('../../systems/SaveMigration.js');
const EventBus = (await import('../../core/EventBus.js')).default;

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;

let pass = 0, fail = 0;
function assert(cond, label) {
  if (cond) { console.log('  ✓ ' + label); pass++; }
  else      { console.log('  ✗ ' + label); fail++; }
}
function header(title) { console.log('\n--- ' + title + ' ---'); }

// Wyciągnij słownik z modułu i18n (default lub named).
function dict(mod) { return mod.default ?? mod.PL ?? mod.EN ?? mod; }

// ── T1 — i18n klucze ─────────────────────────────────────────────────────
header('T1: i18n nowe klucze (PL + EN)');
{
  const pl = dict(plMod), en = dict(enMod);
  const keys = ['fleet.sendMissionNoFuel', 'fleet.statusTextStranded', 'vessel.stranded', 'vessel.strandedToast'];
  for (const k of keys) {
    assert(typeof pl[k] === 'string' && pl[k].length > 0, `PL ma '${k}' (got ${JSON.stringify(pl[k])})`);
    assert(typeof en[k] === 'string' && en[k].length > 0, `EN ma '${k}' (got ${JSON.stringify(en[k])})`);
  }
}

// ── T2 — owner predicate ─────────────────────────────────────────────────
header('T2: isEnemyVessel (owner-gate)');
{
  assert(isEnemyVessel({ id: 'v1' }) === false, 'statek gracza (brak owner) → false');
  assert(isEnemyVessel({ id: 'v2', ownerEmpireId: 'player' }) === false, "ownerEmpireId 'player' → false");
  assert(isEnemyVessel({ id: 'v3', ownerEmpireId: 'emp_x' }) === true, 'ownerEmpireId obcy → true');
  assert(isEnemyVessel({ id: 'v4', isEnemy: true }) === true, 'isEnemy=true → true');
}

// ── T3 — warunek strandingu (effectiveRange) ─────────────────────────────
header('T3: effectiveRange / canReach');
{
  const low = { fuel: { current: 1, max: 10, consumption: 5 } };   // range 0.2 AU
  assert(Math.abs(effectiveRange(low) - 0.2) < 1e-9, `effectiveRange = 0.2 (got ${effectiveRange(low)})`);
  assert(canReach(low, 9) === false, 'pusty bak NIE dosięga 9 AU (stranded)');
  const full = { fuel: { current: 100, max: 100, consumption: 5 } };  // range 20 AU
  assert(canReach(full, 9) === true, 'pełny bak dosięga 9 AU (nie stranded)');
}

// ── T4 — _maybeNotifyStranded (owner-gated alarm) ────────────────────────
header('T4: VesselManager._maybeNotifyStranded');
{
  const vm = new VesselManager();
  // Home daleko: x=1100 px = 10 AU od pozycji statku (x=0).
  const home = { id: 'home', x: 1100, y: 0 };
  vm._findEntity = (id) => (id === 'home' ? home : null);
  window.KOSMOS.colonyManager = { getColony: () => null };  // brak kolonii w celu
  window.KOSMOS.timeSystem = { gameTime: 100 };

  let stranded = []; let toasts = [];
  EventBus.on('vessel:strandedNoFuel', (p) => stranded.push(p));
  EventBus.on('ui:toast', (p) => toasts.push(p));
  const strandedIds = () => stranded.map(p => p.vesselId);

  const mkVessel = (over) => ({
    id: 'vt', name: 'Test', homeColonyId: 'home', missionLog: [],
    position: { x: 0, y: 0, state: 'orbiting', dockedAt: 'body_far' },
    fuel: { current: 1, max: 10, consumption: 5 },  // range 0.2 AU << 10 AU
    ...over,
  });

  // (a) Gracz utknął → emit + flaga
  const vPlayer = mkVessel();
  vm._maybeNotifyStranded(vPlayer);
  assert(strandedIds().includes('vt') && vPlayer._strandedNotified === true, 'gracz utknął → emit vessel:strandedNoFuel + flaga');
  assert(stranded[0]?.name === 'Test', `payload niesie name (EventLog hook) (got ${stranded[0]?.name})`);
  assert(toasts.length === 1, 'gracz utknął → 1 toast');

  // (b) Idempotent: drugie wołanie nic nie emituje
  const before = stranded.length;
  vm._maybeNotifyStranded(vPlayer);
  assert(stranded.length === before, 'idempotent — drugie wołanie bez ponownego emitu');

  // (c) AI (enemy) → BRAK emisji (owner-gate)
  stranded = []; toasts = [];
  vm._maybeNotifyStranded(mkVessel({ id: 've', ownerEmpireId: 'emp_x' }));
  assert(stranded.length === 0, 'AI (enemy) → BRAK alarmu (owner-gated)');

  // (d) Doleci do domu (pełny bak) → brak alarmu
  stranded = [];
  vm._maybeNotifyStranded(mkVessel({ id: 'vf', fuel: { current: 100, max: 100, consumption: 5 } }));
  assert(stranded.length === 0, 'doleci do domu → brak alarmu');

  // (e) Przy własnej kolonii w celu → brak alarmu (może dotankować)
  stranded = [];
  window.KOSMOS.colonyManager = { getColony: (id) => (id === 'body_far' ? { id } : null) };
  vm._maybeNotifyStranded(mkVessel({ id: 'vc' }));
  assert(stranded.length === 0, 'orbituje przy własnej kolonii → brak alarmu');
}

// ── T5 — dispatchOnMission NIE blokuje braku paliwa (AI-invariant) ───────
header('T5: dispatchOnMission non-blocking (AI clamp)');
{
  const vm = new VesselManager();
  const v = {
    id: 'vai', shipId: 'hull_small', name: 'AI', missionLog: [],
    status: 'idle',
    position: { x: 0, y: 0, state: 'docked', dockedAt: 'home' },
    fuel: { current: 1, max: 10, consumption: 5 },
    _baseFuelPerAU: 5,
  };
  vm._vessels.set('vai', v);
  vm._findEntity = () => ({ id: 'home', x: 0, y: 0, systemId: 'sys_home' });
  vm._predictPosition = () => ({ x: 1100, y: 0 });
  vm._calcRoute = () => ({ waypoints: [], totalDist: 1100 });
  vm._techForVessel = () => null;
  vm._resolveEntityName = () => 'Target';
  window.KOSMOS.timeSystem = { gameTime: 0 };

  const ok = vm.dispatchOnMission('vai', {
    type: 'transport', targetId: 'tgt', targetName: 'Target',
    arrivalYear: 5, returnYear: 10, fuelCost: 9999,   // >> fuel.current
  });
  assert(ok === true, 'dispatchOnMission zwraca true mimo braku paliwa (AI non-blocking)');
  assert(v.fuel.current === 0, `paliwo sclampowane do 0 (nie zablokowane) (got ${v.fuel.current})`);
}

// ── T7 — startReturn owner-gated bramka paliwa (twardy stranding) ────────
header('T7: startReturn bramka paliwa (owner-gated)');
{
  const vm = new VesselManager();
  vm._findEntity = () => ({ id: 'home', x: 0, y: 0, systemId: 'sys_home' });
  vm._predictPosition = () => ({ x: 0, y: 0 });           // dom w origin
  vm._calcRoute = () => ({ waypoints: [], totalDist: 1100 });  // 10 AU powrotu
  window.KOSMOS.timeSystem = { gameTime: 50 };

  let blocked = [];
  EventBus.on('vessel:returnBlocked', (p) => blocked.push(p));

  const mkRetVessel = (over) => ({
    id: 'vr', name: 'Ret', colonyId: 'home', missionLog: [],
    position: { x: 1100, y: 0, state: 'orbiting', dockedAt: 'body_far' },
    fuel: { current: 1, max: 100, consumption: 5 },   // range 0.2 AU << 10 AU
    mission: { targetId: 'body_far', returnYear: 60, startX: 0, startY: 0 },
    ...over,
  });

  // (a) Gracz bez paliwa na powrót → BLOK
  const vP = mkRetVessel();
  vm._vessels.set('vr', vP);
  const okP = vm.startReturn('vr');
  assert(okP === false, 'gracz bez paliwa na powrót → startReturn false (BLOK)');
  assert(vP.position.state === 'orbiting', 'statek ZOSTAJE na orbicie (brak mutacji stanu)');
  assert(vP.mission.phase !== 'returning', 'mission.phase NIE returning (abort przed commitem)');
  assert(vP._strandedNotified === true, '_strandedNotified=true (status ⛽ Utknął)');
  assert(blocked.some(p => p.vesselId === 'vr'), 'emit vessel:returnBlocked');

  // (b) AI (enemy) bez paliwa → clamp, NIE blokowane
  blocked = [];
  const vAI = mkRetVessel({ id: 'vrai', ownerEmpireId: 'emp_x' });
  vm._vessels.set('vrai', vAI);
  const okAI = vm.startReturn('vrai');
  assert(okAI === true, 'AI bez paliwa → startReturn true (clamp, nie blokowane)');
  assert(vAI.position.state === 'in_transit', 'AI wraca (state in_transit)');
  assert(blocked.length === 0, 'AI → BRAK returnBlocked (owner-gated)');

  // (c) Gracz force:true → bypass bramki
  blocked = [];
  const vF = mkRetVessel({ id: 'vrf' });
  vm._vessels.set('vrf', vF);
  const okF = vm.startReturn('vrf', { force: true });
  assert(okF === true, 'force:true → startReturn true (emergency bypass)');
  assert(vF.position.state === 'in_transit', 'force → statek wraca');
  assert(blocked.length === 0, 'force → BRAK returnBlocked');

  // (d) Gracz z paliwem → wraca normalnie
  const vOK = mkRetVessel({ id: 'vrok', fuel: { current: 100, max: 100, consumption: 5 } });
  vm._vessels.set('vrok', vOK);
  const okOK = vm.startReturn('vrok');
  assert(okOK === true, 'gracz z paliwem → startReturn true');
  assert(vOK.position.state === 'in_transit', 'wraca (state in_transit)');
  assert(vOK.mission.phase === 'returning', 'mission.phase === returning (commit)');
}

// ── T6 — wersja save niezmieniona ────────────────────────────────────────
header('T6: CURRENT_VERSION >= 80 (bez migracji w (d))');
{
  assert(CURRENT_VERSION >= 80, `CURRENT_VERSION >= 80 (got ${CURRENT_VERSION})`);
}

// ── Podsumowanie ─────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(50)}`);
console.log(`WYNIK: ${pass} PASS / ${fail} FAIL`);
console.log('='.repeat(50));
process.exit(fail === 0 ? 0 : 1);
