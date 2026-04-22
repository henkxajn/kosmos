// BattleSystem — abstrakcyjna symulacja starć flot
//
// Pure function (zero stanu) — wynik zależy TYLKO od wejścia + seed.
// Faza 5 zrobi cinematic wizualizację na podstawie `result.timeline`.
//
// Wejście:
//   fleetA, fleetB — { strength, hp, shieldHP, armor, weapons[], evasion, techMult, morale }
//   context — { casusBelli, location, seed }
//
// Algorytm (10-30 tur):
//   1. Każda flota strzela w przeciwnika per tura.
//   2. Damage: baza z weapons × tracking × (1 - evasion) × techMult.
//   3. Absorb: najpierw shield (regeneruje się), potem armor, potem hp.
//   4. Straty proporcjonalne do hp/starting_hp.
//   5. Koniec gdy jedna flota spadnie ≤ 20% hp (retreat) lub ≤ 0 (destroyed).
//
// Wyjście:
//   { winner: 'A'|'B'|'draw', lossesA, lossesB, turns, retreated: 'A'|'B'|null, timeline[] }

// ── Mulberry32 PRNG (seeded) ──────────────────────────────────────────────────
function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Domyślne statystyki floty — gdyby którego pola zabrakło
function normalizeFleet(raw, side) {
  const hp       = Math.max(1, raw.hp ?? raw.strength ?? 100);
  const shieldHP = Math.max(0, raw.shieldHP ?? 0);
  const armor    = Math.max(0, raw.armor ?? 0);
  const evasion  = Math.max(0, Math.min(0.9, raw.evasion ?? 0.1));
  const techMult = Math.max(0.1, raw.techMult ?? 1.0);
  const morale   = Math.max(0.1, Math.min(2.0, raw.morale ?? 1.0));
  const weapons  = Array.isArray(raw.weapons) && raw.weapons.length > 0
    ? raw.weapons
    : [{ damage: 5, tracking: 0.7, armorPierce: 0 }]; // domyślny lekki laser

  return {
    side,
    label:        raw.label ?? side,
    hpStart:      hp,
    hp,
    shieldHPMax:  shieldHP,
    shieldHP,
    shieldRegen:  Math.max(0, raw.shieldRegen ?? 0),
    armor,
    evasion,
    techMult,
    morale,
    weapons,
  };
}

/**
 * Oblicz pojedynczy strzał — zwraca { raw, afterEvasion, afterShield, afterArmor, finalHP }.
 * PRNG decyduje o trafieniu.
 */
function resolveVolley(attacker, defender, rng) {
  let total = 0;
  for (const w of attacker.weapons) {
    const tracking = Math.max(0, Math.min(1, w.tracking ?? 0.7));
    const hitChance = tracking * (1 - defender.evasion);
    if (rng() > hitChance) continue; // chybiony strzał
    const rawDmg = (w.damage ?? 0) * attacker.techMult * attacker.morale;
    // Pancerz: redukcja, ale armorPierce obniża pancerz
    const effectiveArmor = Math.max(0, defender.armor - (w.armorPierce ?? 0));
    total += Math.max(1, rawDmg - effectiveArmor * 0.4);
  }
  return total;
}

/**
 * Zaaplikuj damage do defendera — najpierw shield, potem hp.
 * Zwraca obiekt breakdown do timeline.
 */
function applyDamage(defender, damage) {
  let remaining = damage;
  let toShield = 0;
  if (defender.shieldHP > 0) {
    toShield = Math.min(defender.shieldHP, remaining);
    defender.shieldHP -= toShield;
    remaining -= toShield;
  }
  const toHP = remaining;
  defender.hp = Math.max(0, defender.hp - toHP);
  return { toShield, toHP };
}

/**
 * Główna funkcja — zwraca wynik bitwy.
 */
export function resolveBattle(fleetA, fleetB, context = {}) {
  const seed = context.seed ?? Date.now();
  const rng = mulberry32(seed);

  const A = normalizeFleet(fleetA, 'A');
  const B = normalizeFleet(fleetB, 'B');

  const MAX_TURNS = 30;
  const RETREAT_HP_PCT = 0.2; // flota retreatuje przy HP ≤ 20%
  const timeline = [];

  let turn = 0;
  let retreated = null;

  while (turn < MAX_TURNS) {
    turn++;

    // Regeneracja tarcz
    A.shieldHP = Math.min(A.shieldHPMax, A.shieldHP + A.shieldRegen);
    B.shieldHP = Math.min(B.shieldHPMax, B.shieldHP + B.shieldRegen);

    // Jednoczesny ostrzał — obie strony strzelają w tej samej turze
    const dmgToB = resolveVolley(A, B, rng);
    const dmgToA = resolveVolley(B, A, rng);

    const breakdownB = applyDamage(B, dmgToB);
    const breakdownA = applyDamage(A, dmgToA);

    timeline.push({
      turn,
      aHP: Math.round(A.hp),
      bHP: Math.round(B.hp),
      aShield: Math.round(A.shieldHP),
      bShield: Math.round(B.shieldHP),
      dmgA: Math.round(dmgToA),
      dmgB: Math.round(dmgToB),
    });

    // Warunki końca
    const aPct = A.hp / A.hpStart;
    const bPct = B.hp / B.hpStart;

    // Retreat — ta z mniejszą procentową HP jeśli < 20%
    if (aPct <= RETREAT_HP_PCT && bPct > aPct) { retreated = 'A'; break; }
    if (bPct <= RETREAT_HP_PCT && aPct > bPct) { retreated = 'B'; break; }
    // Destroyed — 0 HP
    if (A.hp <= 0 || B.hp <= 0) break;
  }

  const lossesA = Math.round(A.hpStart - A.hp);
  const lossesB = Math.round(B.hpStart - B.hp);

  let winner;
  if (retreated === 'A')      winner = 'B';
  else if (retreated === 'B') winner = 'A';
  else if (A.hp <= 0 && B.hp <= 0) winner = 'draw';
  else if (A.hp <= 0)         winner = 'B';
  else if (B.hp <= 0)         winner = 'A';
  else                        winner = A.hp > B.hp ? 'A' : 'B'; // tick-out — więcej HP wygrywa

  return {
    winner,
    retreated,
    lossesA,
    lossesB,
    turns: turn,
    finalHPA: Math.max(0, Math.round(A.hp)),
    finalHPB: Math.max(0, Math.round(B.hp)),
    timeline,
    seed,
    casusBelli: context.casusBelli ?? null,
    location:   context.location   ?? null,
  };
}

/**
 * Przelicz flotę (abstrakcyjny empires[].fleets[] entry) → wejście dla resolveBattle.
 * Abstrakcyjna flota: { strength, techLevel, morale? }
 * Wynik uproszczony: weapons derived z strength, evasion zależny od wielkości.
 */
export function empireFleetToBattleUnit(fleet, empire, label = null) {
  const strength = Math.max(1, fleet.strength ?? 100);
  const techLv   = empire?.tech?.level ?? 1;
  const techMult = 1.0 + (techLv - 1) * 0.15; // +15% na level
  const morale   = fleet.morale ?? 1.0;

  // Abstrakcyjne statystyki skalowane z strength:
  // - HP ≈ strength (1:1)
  // - shieldHP = 0 dla abstrakcyjnych flot (modułowe tarcze przyjdą z prawdziwym designem)
  // - armor = bazowy 1 (flota ma mieszankę kadłubów)
  // - evasion zależy od archetypu — xenophage/swarm ma wysoki, hegemon niski
  const arch = empire?.archetype;
  const evasion = arch === 'swarm'      ? 0.25 :
                  arch === 'xenophage'  ? 0.20 :
                  arch === 'trader'     ? 0.12 :
                  arch === 'isolationist' ? 0.18 :
                  arch === 'hegemon'    ? 0.10 :
                                          0.15;

  // "Wiązka" broni proporcjonalna do siły — 1 wirtualna broń damage=strength/10
  const weapons = [{
    damage:      Math.max(1, Math.round(strength / 10)),
    tracking:    0.65,
    armorPierce: 0,
  }];

  return {
    label:     label ?? (empire?.name ?? fleet.id ?? 'Fleet'),
    hp:        strength,
    shieldHP:  0,
    armor:     1,
    evasion,
    techMult,
    morale,
    weapons,
  };
}

/**
 * Dla statków gracza — zbiera statystyki z faktycznych Vessel instances z modułami.
 * Agreguje wiele statków w jedną flotę.
 */
export function playerVesselsToBattleUnit(vessels, hullsData, modulesData, label = 'Gracz') {
  if (!Array.isArray(vessels) || vessels.length === 0) {
    return { label, hp: 100, shieldHP: 0, armor: 0, evasion: 0.1, techMult: 1.0, morale: 1.0, weapons: [] };
  }

  let hp = 0, shieldHP = 0, shieldRegen = 0, armor = 0;
  const weapons = [];
  let evasionSum = 0, count = 0;

  for (const v of vessels) {
    // Fallback hullId ?? shipId — nowe vessele mają `shipId`, legacy mają `hullId`.
    // Wrogie vessele z createVessel używają shipId='hull_medium' itd.
    const hull = hullsData?.[v.hullId] ?? hullsData?.[v.shipId];
    if (!hull) continue;
    hp += hull.baseHP ?? 50;
    armor += hull.baseArmor ?? 0;
    evasionSum += hull.baseEvasion ?? 0.1;
    count++;
    for (const modId of v.modules ?? []) {
      const mod = modulesData?.[modId];
      if (!mod?.stats) continue;
      if (mod.stats.shieldHP)     shieldHP    += mod.stats.shieldHP;
      if (mod.stats.shieldRegen)  shieldRegen += mod.stats.shieldRegen;
      if (mod.stats.armorRating)  armor       += mod.stats.armorRating;
      if (mod.stats.damage != null) {
        weapons.push({
          damage:      mod.stats.damage,
          tracking:    mod.stats.tracking ?? 0.7,
          armorPierce: mod.stats.armorPierce ?? 0,
        });
      }
    }
  }

  return {
    label,
    hp: Math.max(1, hp),
    shieldHP,
    shieldRegen,
    armor,
    evasion: count > 0 ? evasionSum / count : 0.1,
    techMult: 1.0,
    morale:   1.0,
    weapons: weapons.length > 0 ? weapons : [{ damage: 2, tracking: 0.7 }],
  };
}

/**
 * Convenience wrapper — pojedynczy vessel → BattleUnit.
 * Reużywa pełnej logiki `playerVesselsToBattleUnit` dla tablicy o 1 elemencie.
 */
export function vesselToBattleUnit(vessel, hullsData, modulesData, label = null) {
  return playerVesselsToBattleUnit(
    vessel ? [vessel] : [],
    hullsData,
    modulesData,
    label ?? vessel?.name ?? 'Vessel'
  );
}
