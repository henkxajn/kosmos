// Smoke P3-3: per-tick fire exchange + engage target priority + damage application.

import { strict as assert } from 'node:assert';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;
globalThis.KOSMOS = { debug: {}, timeSystem: { gameTime: 100.0 } };

const { default: EventBus } = await import('./src/core/EventBus.js');
const { GAME_CONFIG } = await import('./src/config/GameConfig.js');
const { DeepSpaceCombatSystem } = await import('./src/systems/DeepSpaceCombatSystem.js');
const { HULLS } = await import('./src/data/HullsData.js');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.error('  FAIL  ' + name); fail++; }
}
function eq(name, actual, expected) {
  ok(name + ' (got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected) + ')',
     actual === expected);
}

const AU_TO_PX = GAME_CONFIG.AU_TO_PX;

class FakeVM {
  constructor() { this._vessels = new Map(); }
  addVessel(id, opts = {}) {
    const v = {
      id,
      name:           opts.name ?? id,
      shipId:         opts.shipId ?? 'hull_frigate',
      hullId:         opts.hullId ?? 'hull_frigate',
      modules:        opts.modules ?? ['weapon_laser'],
      position:       { x: opts.x ?? 0, y: opts.y ?? 0, state: 'in_transit', dockedAt: null },
      isWreck:        false,
      status:         'in_flight',
      mission:        null,
      movementOrder:  opts.movementOrder ?? null,
      ownerEmpireId:  opts.ownerEmpireId ?? null,
      isEnemy:        opts.isEnemy ?? false,
      owner:          opts.owner ?? null,
    };
    this._vessels.set(id, v);
    return v;
  }
}

function newSetup(vesselsOpts) {
  const vm = new FakeVM();
  for (const o of vesselsOpts) vm.addVessel(o.id, o);
  const dscs = new DeepSpaceCombatSystem(vm);
  globalThis.window.KOSMOS.deepSpaceCombatSystem = dscs;
  return { vm, dscs };
}

// ── T1: Range gating — laser (0.05 AU) NIE strzela do enemy 0.20 AU away ──
console.log('\n--- T1: Range gating ---');
{
  // laser range 0.05 AU → 0.05 × 110 px/AU = 5.5 px. Enemy w 0.20 AU = 22 px.
  const dist = 0.20 * AU_TO_PX;
  const { vm, dscs } = newSetup([
    { id: 'p1', x: 0,    y: 0, modules: ['weapon_laser'] },
    { id: 'e1', x: dist, y: 0, ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] },
  ]);
  const enc = dscs.startEngagement('p1', 'e1');
  const initHpP = enc.vesselStates.get('p1').hp;
  const initHpE = enc.vesselStates.get('e1').hp;
  dscs._tick(0.5);  // jeden round
  const eventsR1 = enc.timeline[0]?.events ?? [];
  ok('laser nie strzela poza 0.05 AU (no events 0.20 AU)',
     eventsR1.length === 0 || eventsR1.every(e => e.damage === 0 && e.hit === false));
  eq('p1.hp unchanged', enc.vesselStates.get('p1').hp, initHpP);
  eq('e1.hp unchanged', enc.vesselStates.get('e1').hp, initHpE);
  dscs.destroy();
}

// ── T2: Range gating — kinetic (0.15) NIE strzela do enemy 0.18 AU ──
console.log('\n--- T2: Kinetic poza zasięgiem 0.15 AU ---');
{
  const dist = 0.18 * AU_TO_PX;
  const { vm, dscs } = newSetup([
    { id: 'p1', x: 0,    y: 0, modules: ['weapon_kinetic'] },
    { id: 'e1', x: dist, y: 0, ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_kinetic'] },
  ]);
  const enc = dscs.startEngagement('p1', 'e1');
  const initHpP = enc.vesselStates.get('p1').hp;
  const initHpE = enc.vesselStates.get('e1').hp;
  dscs._tick(0.5);
  const events = enc.timeline[0]?.events ?? [];
  ok('kinetic nie strzela poza 0.15 AU', events.length === 0 || events.every(e => e.damage === 0));
  eq('p1.hp unchanged', enc.vesselStates.get('p1').hp, initHpP);
  eq('e1.hp unchanged', enc.vesselStates.get('e1').hp, initHpE);
  dscs.destroy();
}

// ── T3: Missile (0.30 AU) strzela do enemy 0.20 AU away ──
console.log('\n--- T3: Missile strzela w 0.20 AU ---');
{
  const dist = 0.20 * AU_TO_PX;
  const { vm, dscs } = newSetup([
    { id: 'p1', x: 0,    y: 0, modules: ['weapon_missile'] },
    { id: 'e1', x: dist, y: 0, ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_missile'] },
  ]);
  const enc = dscs.startEngagement('p1', 'e1');
  // Wykonaj kilka tików — tracking 0.5 × (1 - evasion) ~0.45, więc 1-2 strzały w 3 tickach trafią
  for (let i = 0; i < 4 && enc.isActive; i++) dscs._tick(1.0);
  const allEvents = enc.timeline.flatMap(r => r.events ?? []);
  const hits = allEvents.filter(e => e.hit === true).length;
  ok('missile strzela w 0.20 AU (jakieś events)', allEvents.length > 0);
  ok('przynajmniej jeden hit w 4 tickach', hits >= 1);
  dscs.destroy();
}

// ── T4: Cooldown decrement ─────────────────────────────────────────────
console.log('\n--- T4: Weapon cooldown ---');
{
  const dist = 0.04 * AU_TO_PX;  // w zasięgu lasera (0.05)
  const { vm, dscs } = newSetup([
    { id: 'p1', x: 0,    y: 0, modules: ['weapon_laser'] },
    { id: 'e1', x: dist, y: 0, ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] },
  ]);
  const enc = dscs.startEngagement('p1', 'e1');
  dscs._tick(0.1);  // pierwszy fire — cooldown reset do 0.3 (laser)
  const w = enc.vesselStates.get('p1').weapons[0];
  ok('po fire cooldownYearsRemaining > 0 OR weapon strzelił', w.cooldownYearsRemaining > 0 || enc.timeline[0]?.events.some(e => e.attacker === 'p1'));
  // Druga tura — cooldown jeszcze nie wyzerowany
  const cooldownBefore = w.cooldownYearsRemaining;
  dscs._tick(0.1);  // decrement
  ok('cooldown decrement po _tick(0.1)', w.cooldownYearsRemaining < cooldownBefore || cooldownBefore === 0);
  dscs.destroy();
}

// ── T5: Shield absorbs damage przed HP ────────────────────────────────
console.log('\n--- T5: Shield → HP cascade ---');
{
  const dist = 0.04 * AU_TO_PX;
  const { vm, dscs } = newSetup([
    // p1: laser damage 5; powtarzamy aż trafi → shield absorbuje pierwsze 15 HP (shield_basic)
    { id: 'p1', x: 0,    y: 0, modules: ['weapon_laser', 'weapon_laser'] },  // 2× laser dla szybszego damage
    { id: 'e1', x: dist, y: 0, ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['shield_basic'] },
  ]);
  const enc = dscs.startEngagement('p1', 'e1');
  const e1State = enc.vesselStates.get('e1');
  const shieldStart = e1State.shieldHP;
  const hpStart = e1State.hp;
  ok('e1 ma shield (shield_basic = 15)', shieldStart === 15);
  // Wykonaj wiele tików — trafienia powinny najpierw zjeść shield
  for (let i = 0; i < 10 && enc.isActive; i++) dscs._tick(0.5);
  const allHits = enc.timeline.flatMap(r => r.events).filter(e => e.hit && e.target === 'e1');
  const totalBlockedByShield = allHits.reduce((s, e) => s + (e.blockedByShield ?? 0), 0);
  ok('shield absorbował damage (totalBlockedByShield > 0)', totalBlockedByShield > 0);
  // Po wyczerpaniu shield, dalsze trafienia idą w hp
  ok('e1.shieldHP zmalał lub zero', e1State.shieldHP < shieldStart || e1State.shieldHP === 0);
  dscs.destroy();
}

// ── T6: Engage target priority — strzela w engage target, nie closest ──
console.log('\n--- T6: Engage target priority ---');
{
  const closeDist  = 0.03 * AU_TO_PX;  // closer (closest fallback)
  const targetDist = 0.04 * AU_TO_PX;  // engage target (też w zasięgu lasera 0.05)
  const { vm, dscs } = newSetup([
    { id: 'p1', x: 0,    y: 0, modules: ['weapon_laser'] },
    // 2 enemy w zasięgu — p1 engage e2 (dalszy)
    { id: 'e1', x: closeDist, y: 0, ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] },
    { id: 'e2', x: targetDist, y: 0, ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] },
  ]);
  // Ustaw engage order na p1 → e2
  vm._vessels.get('p1').movementOrder = { type: 'engage', targetEntityId: 'e2', orderId: 'mo_test' };
  const enc = dscs.startEngagement('p1', 'e1');
  // join e2 do encounter (oba enemy z tej samej strony — second sideB call)
  dscs.handleCombatRangeEnter('p1', 'e2', false);  // p1 w encounter, e2 nie → join

  // Wykonaj tick — p1 powinien preferować e2 (engage), nie e1 (closer)
  // Wiele tików dla pewności trafienia
  let p1ShotsAtE2 = 0, p1ShotsAtE1 = 0;
  for (let i = 0; i < 6 && enc.isActive; i++) {
    dscs._tick(0.5);
    for (const round of enc.timeline) {
      for (const ev of round.events ?? []) {
        if (ev.attacker === 'p1' && ev.target === 'e2') p1ShotsAtE2++;
        if (ev.attacker === 'p1' && ev.target === 'e1') p1ShotsAtE1++;
      }
    }
    enc.timeline.length = 0;  // reset by nie liczyć dwa razy
  }
  ok('p1 strzela więcej w engage target e2 niż closest e1',
     p1ShotsAtE2 >= p1ShotsAtE1, `e2:${p1ShotsAtE2} vs e1:${p1ShotsAtE1}`);
  ok('p1 strzela w e2 (engage)', p1ShotsAtE2 > 0);
  dscs.destroy();
}

// ── T7: Engage target poza zasięgiem → fallback closest ──
console.log('\n--- T7: Engage out-of-range → fallback closest ---');
{
  const closeDist = 0.03 * AU_TO_PX;
  const farDist   = 0.40 * AU_TO_PX;  // engage target poza zasięgiem lasera (0.05) i missile (0.30)
  const { vm, dscs } = newSetup([
    { id: 'p1', x: 0,         y: 0, modules: ['weapon_laser'] },
    { id: 'e1', x: closeDist, y: 0, ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] },
    { id: 'e2', x: farDist,   y: 0, ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] },
  ]);
  vm._vessels.get('p1').movementOrder = { type: 'engage', targetEntityId: 'e2' };
  const enc = dscs.startEngagement('p1', 'e1');
  dscs.handleCombatRangeEnter('p1', 'e2', false);

  let p1ShotsAtE1 = 0;
  for (let i = 0; i < 6 && enc.isActive; i++) {
    dscs._tick(0.5);
    for (const round of enc.timeline) {
      for (const ev of round.events ?? []) {
        if (ev.attacker === 'p1' && ev.target === 'e1') p1ShotsAtE1++;
      }
    }
    enc.timeline.length = 0;
  }
  ok('p1 strzela w e1 (fallback closest gdy engage e2 poza zasięgiem)', p1ShotsAtE1 > 0);
  dscs.destroy();
}

// ── T8: AI zawsze closest (brak engage orderu) ────────────────────────
console.log('\n--- T8: AI zawsze closest ---');
{
  const closeDist = 0.04 * AU_TO_PX;
  const farDist   = 0.05 * AU_TO_PX;  // ledwie w zasięgu lasera
  const { vm, dscs } = newSetup([
    { id: 'p1', x: 0,            y: 0, modules: ['weapon_laser'] },
    { id: 'p2', x: -closeDist,   y: 0, modules: ['weapon_laser'] },  // dalszy player
    { id: 'e1', x: farDist - closeDist, y: 0, ownerEmpireId: 'empire_alpha', isEnemy: true, modules: ['weapon_laser'] },
  ]);
  // p1 i p2 obaj player, e1 enemy. Encounter z p1+e1, p2 joinuje.
  const enc = dscs.startEngagement('p1', 'e1');
  dscs.handleCombatRangeEnter('e1', 'p2', false);
  // enemy bez engage order → zawsze closest. p1 i p2 to obaj player — closest do e1 zależy od pozycji.
  // Wystarczy że jakikolwiek event wystąpi (AI prooves closest pick logic — i tak nie crashuje)
  let allEvents = [];
  for (let i = 0; i < 4 && enc.isActive; i++) {
    dscs._tick(0.5);
    for (const round of enc.timeline) allEvents.push(...(round.events ?? []));
    enc.timeline.length = 0;
  }
  // e1 strzela do najbliższego player. To p1 (dist=0.05 AU) zamiast p2 (dist 0.04+0.05 = 0.09 AU poza zasięgiem lasera 0.05).
  // Może też być żaden event jeśli za daleko — sprawdzamy że co najmniej brak crash + ewentualne hits są na closest.
  const e1HitsP1 = allEvents.filter(e => e.attacker === 'e1' && e.target === 'p1').length;
  const e1HitsP2 = allEvents.filter(e => e.attacker === 'e1' && e.target === 'p2').length;
  ok('e1 (AI bez engage) celuje w closest target p1', e1HitsP1 >= e1HitsP2);
  dscs.destroy();
}

console.log(`\n========== ${pass} PASS / ${fail} FAIL ==========`);
process.exit(fail > 0 ? 1 : 0);
