// ═══════════════════════════════════════════════════════════════
// BottleneckDetector — detekcja problemów balansu i mechanik
// ─────────────────────────────────────────────────────────────
// Każdy detektor to obiekt z .check(core, civYear, report, metrics) → flag | null
// Detektory używają Metrics (rozszerzane wewnątrz) + inspekcji stanu systemów.
// ═══════════════════════════════════════════════════════════════

import { Metrics } from './Metrics.js';

/** Factory — tworzy wszystkie standardowe detektory z wspólnym Metrics */
export function createStandardDetectors() {
  const metrics = new Metrics();

  const detectors = [
    // ── POP_STAGNATION: POP nie zmienia się przez 50 civYears ────
    {
      name: 'POP_STAGNATION',
      check(core, civYear) {
        const pop = core.civSystem?.population ?? 0;
        metrics.record(civYear, 'pop', pop);
        if (civYear < 50) return null;
        const delta = metrics.delta('pop', civYear, 50);
        if (delta !== null && Math.abs(delta) < 1 && pop < 15) return 'POP_STAGNATION';
        return null;
      },
    },

    // ── RESOURCE_STALL: inventory Fe stały >100 civYears ─────────
    {
      name: 'RESOURCE_STALL',
      check(core, civYear) {
        const fe = core.resourceSystem?.getAmount?.('Fe') ?? 0;
        metrics.record(civYear, 'fe', fe);
        if (civYear < 100) return null;
        const delta = metrics.delta('fe', civYear, 100);
        if (delta !== null && Math.abs(delta) < 5) return 'RESOURCE_STALL';
        return null;
      },
    },

    // ── TECH_IRRELEVANCE: brak nowych technologii przez 100 civYears ─
    {
      name: 'TECH_IRRELEVANCE',
      check(core, civYear) {
        const techs = core.techSystem?._researched?.size ?? 0;
        metrics.record(civYear, 'techs', techs);
        if (civYear < 100) return null;
        const delta = metrics.delta('techs', civYear, 100);
        if (delta !== null && delta === 0) return 'TECH_IRRELEVANCE';
        return null;
      },
    },

    // ── FLEET_UNUSED: rocketry zbadane ale 0 statków przez 100+ civYears ─
    {
      name: 'FLEET_UNUSED',
      check(core, civYear) {
        const hasRocketry = core.techSystem?.isResearched?.('rocketry') ?? false;
        if (!hasRocketry) return null;
        if (!metrics.latest('rocketry_at')) {
          metrics.record(civYear, 'rocketry_at', civYear);
        }
        const rocketryAt = metrics.latest('rocketry_at');
        if (civYear - rocketryAt < 100) return null;
        const vessels = core.vesselManager?.getAllVessels?.()?.length ?? 0;
        if (vessels === 0) return 'FLEET_UNUSED';
        return null;
      },
    },

    // ── DIPLOMACY_DEAD: max hostility = 0 przez >200 civYears ────
    {
      name: 'DIPLOMACY_DEAD',
      check(core, civYear) {
        if (civYear < 200) return null;
        const dipl = core.diplomacySystem;
        const empires = core.empireRegistry?.listAll?.() ?? [];
        if (empires.length === 0) return null;
        let maxHostility = 0;
        for (const emp of empires) {
          const h = dipl?.getHostility?.(emp.id) ?? 0;
          if (h > maxHostility) maxHostility = h;
        }
        metrics.record(civYear, 'maxHostility', maxHostility);
        // Przez ostatnie 200 civYears — sprawdź średnią
        const recent = metrics.since('maxHostility', civYear - 200);
        if (recent.length < 10) return null;
        const avg = recent.reduce((s, p) => s + p.value, 0) / recent.length;
        if (avg < 1) return 'DIPLOMACY_DEAD';
        return null;
      },
    },

    // ── RUNAWAY_LEADER: gracz lub 1 empire > 2× suma innych ─────
    {
      name: 'RUNAWAY_LEADER',
      check(core, civYear) {
        if (civYear < 300) return null;
        const reg = core.empireRegistry;
        const empires = reg?.listAll?.() ?? [];
        if (empires.length < 2) return null;
        const powers = empires.map(e => (e.military?.power ?? 0) + (e.tech?.level ?? 0) * 50);
        const maxP = Math.max(...powers);
        const sumRest = powers.reduce((s, p) => s + p, 0) - maxP;
        if (maxP > sumRest * 2 && maxP > 100) return 'RUNAWAY_LEADER';
        return null;
      },
    },

    // ── EVENT_CASCADE: >4 random events jednocześnie aktywne ─────
    {
      name: 'EVENT_CASCADE',
      check(core) {
        const active = core.randomEventSystem?._activeEvents?.size ?? 0;
        if (active >= 4) return 'EVENT_CASCADE';
        return null;
      },
    },

    // ── STALEMATE: żadne key metrics się nie zmieniły przez 250+ civYears ─
    {
      name: 'STALEMATE',
      check(core, civYear) {
        if (civYear < 300) return null;
        const pop = core.civSystem?.population ?? 0;
        const techs = core.techSystem?._researched?.size ?? 0;
        const colonies = core.colonyManager?.getAllColonies?.()?.length ?? 0;
        const buildings = core.buildingSystem?._active?.size ?? 0;
        const state = `${pop}|${techs}|${colonies}|${buildings}`;
        metrics.record(civYear, 'state_sig', state);
        // Czy ostatnie 250 civYears są identyczne?
        const recent = metrics.since('state_sig', civYear - 250);
        if (recent.length < 20) return null;
        const allSame = recent.every(p => p.value === state);
        if (allSame) return 'STALEMATE';
        return null;
      },
    },

    // ── COLONY_LOCK: ekspedycje wiszą >50 civYears w transit ──────
    {
      name: 'COLONY_LOCK',
      check(core, civYear) {
        const missions = core.missionSystem?._missions ?? core.missionSystem?.missions;
        if (!missions) return null;
        const list = missions instanceof Map ? Array.from(missions.values()) : Array.isArray(missions) ? missions : Object.values(missions);
        for (const m of list) {
          if (m?.status === 'in_transit' || m?.status === 'in_flight') {
            const launched = m.launchedAtGameTime ?? m.launchedAt ?? null;
            if (launched != null && civYear / 12 - launched > 50 / 12) return 'COLONY_LOCK';
          }
        }
        return null;
      },
    },
  ];

  return { detectors, metrics };
}
