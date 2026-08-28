// ═══════════════════════════════════════════════════════════════
// SONDA READ-ONLY — zdrowie ekonomii AI: fabryki + statki + kurierzy
// Uruchom: node src/testing/headless/probe-ai-economy-health.mjs [--seeds=4] [--gy=45]
// ───────────────────────────────────────────────────────────────
// AiTelemetry mierzy DECYZJE (placówki, droidy) i NIE dotyka dwóch rzeczy,
// o które pyta ten pomiar:
//   • czy fabryki AI w ogóle produkują (nie tylko `automation_droid`),
//   • czy AI buduje statki TRANSPORTOWE (kurierzy `EmpireLogisticsSystem`).
// ⚠ Ograniczenie ZMIERZONE, nie założone: `GameCore.js` NIE montuje Directora,
//   więc ścieżka OKRĘTÓW WOJENNYCH (`DirectorOffensive` → `startShipBuild`) jest
//   tu z definicji niewidoczna. Mierzymy wyłącznie kurierów logistycznych.
// Niczego nie naprawia. Nic nie zapisuje poza stdout.
// ═══════════════════════════════════════════════════════════════
import './env.js';
import { runOneGame } from './balans-driver.mjs';
import { COMMODITIES } from '../../data/CommoditiesData.js';

const arg = (n, d) => (process.argv.find(s => s.startsWith(`--${n}=`)) ?? `=${d}`).split('=')[1];
const N_SEEDS   = parseInt(arg('seeds', '4'));
const TARGET_GY = parseFloat(arg('gy', '45'));

const nullTelemetry = { sample() {}, getSeries() { return []; } };
const med = (a) => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

console.log(`\n═══ SONDA ekonomii AI — seeds=${N_SEEDS}, target=${TARGET_GY}gy ═══`);

const rows = [];
for (let i = 1; i <= N_SEEDS; i++) {
  const seed = `ai-econ_${i}`;
  const r = runOneGame({ seed, planetClass: 'REAL', targetGy: TARGET_GY,
                         telemetry: nullTelemetry, opts: { aiEmpires: true } });
  const K = window.KOSMOS;
  const reg  = K.empireRegistry;
  const logi = K.empireLogisticsSystem;
  const vm   = K.vesselManager;
  const cm   = K.colonyManager;

  const empires = reg?.listAll?.() ?? [];
  for (const emp of empires) {
    const colonies = (cm?.getAllColonies?.() ?? []).filter(c => c.ownerEmpireId === emp.id);
    const capital  = colonies.find(c => !c.isOutpost) ?? colonies[0] ?? null;
    const fs = capital?.factorySystem;

    // ── fabryka: co realnie produkuje, na czym stoi ──
    const allocs = fs?.getAllocations?.() ?? [];
    const producing = allocs.filter(a => (a.rate ?? a.pointsPerYear ?? 0) > 0 && !a.stallReason);
    const stalls = {};
    for (const a of allocs) if (a.stallReason) {
      const key = a.stallReason?.kind ?? String(a.stallReason).split(/[ |(]/)[0];
      stalls[key] = (stalls[key] ?? 0) + 1;
    }
    // zapasy towarów w stolicy (ile RÓŻNYCH towarów ma niezerowy stan)
    // ⚠ rudy NIE są towarami — bez tego rozdziału ~200k jednostek rudy udaje produkcję fabryki.
    const inv = capital?.resourceSystem?.inventory;
    let commodityKinds = 0, commodityUnits = 0, oreUnits = 0;
    const zeroCommodities = [];
    if (inv) {
      const entries = inv instanceof Map ? [...inv.entries()] : Object.entries(inv);
      for (const [k, v] of entries) {
        if (COMMODITIES[k]) { if (v > 0) { commodityKinds++; commodityUnits += v; } else zeroCommodities.push(k); }
        else if (v > 0 && !['research'].includes(k)) oreUnits += v;
      }
    }

    // ── statki: kurierzy logistyczni ──
    const L = logi?._ensureLogistics?.(emp) ?? emp.logistics ?? null;
    const stats  = L?.stats ?? {};
    const routes = L?.routes?.length ?? 0;
    const courierIds = (L?.routes ?? []).flatMap(rt => rt.courierIds ?? []);
    const liveCouriers = courierIds.filter(id => vm?.getVessel?.(id)).length;
    // wszystkie statki należące do kolonii tego imperium (dowolna ścieżka budowy)
    const colIds = new Set(colonies.map(c => c.planetId));
    const owned = (vm?.getAllVessels?.() ?? []).filter(v => colIds.has(v.colonyId));

    rows.push({
      seed: i, emp: emp.name?.slice(0, 22) ?? emp.id, arch: emp.archetype ?? '—',
      colonies: colonies.length,
      recipes: allocs.length, producing: producing.length, stalls,
      commodityKinds, commodityUnits: Math.round(commodityUnits), oreUnits: Math.round(oreUnits),
      zeroCommodities: zeroCommodities.length,
      routes, built: stats.built ?? 0, dispatched: stats.dispatched ?? 0,
      delivered: stats.delivered ?? 0, liveCouriers, ownedVessels: owned.length,
      pendingLatch: L?.pendingBuildRoute ?? null,
    });
  }
}

console.log('\n── FABRYKI AI (stolica, koniec przebiegu) ──');
console.log('seed | imperium               | archetyp      | towarów≠0 | sztuk towarów | rud | towary na ZERZE | stalle');
for (const r of rows) {
  const st = Object.entries(r.stalls).map(([k, v]) => `${k}×${v}`).join(' ') || '—';
  console.log(`  ${r.seed}  | ${String(r.emp).padEnd(22)} | ${String(r.arch).padEnd(13)} | ${String(r.commodityKinds).padStart(9)} | ${String(r.commodityUnits).padStart(13)} | ${String(r.oreUnits).padStart(6)} | ${String(r.zeroCommodities).padStart(15)} | ${st}`);
}

console.log('\n── STATKI AI — kurierzy transportowi (jedyna ścieżka widoczna headless) ──');
console.log('seed | imperium               | trasy | zbudowano | wysłano | dostarczono | żywych kurierów | statków ogółem | zatrzask');
for (const r of rows) {
  console.log(`  ${r.seed}  | ${String(r.emp).padEnd(22)} | ${String(r.routes).padStart(5)} | ${String(r.built).padStart(9)} | ${String(r.dispatched).padStart(7)} | ${String(r.delivered).padStart(11)} | ${String(r.liveCouriers).padStart(15)} | ${String(r.ownedVessels).padStart(14)} | ${r.pendingLatch ?? '—'}`);
}

console.log('\n── PODSUMOWANIE (mediany panelu) ──');
// ⚠ `getAllocations()` na KONIEC przebiegu bywa puste (kolejka fabryki wyczerpana przy
// zaspokojonych safety-stockach) — dlatego NIE raportujemy „receptur z produkcją" jako miary
// zdrowia: zero znaczyłoby tu „nic do roboty", nie „fabryka stoi". Miarą jest STAN MAGAZYNU.
console.log(`  różnych towarów w magazynie: ${med(rows.map(r => r.commodityKinds))} · sztuk towarów: ${med(rows.map(r => r.commodityUnits))} · rud: ${med(rows.map(r => r.oreUnits))}`);
console.log(`  towary utrzymywane na ZERZE (mediana): ${med(rows.map(r => r.zeroCommodities))}`);
console.log(`  kurierzy zbudowani: ${med(rows.map(r => r.built))} · wysłani: ${med(rows.map(r => r.dispatched))} · dostarczone: ${med(rows.map(r => r.delivered))}`);
console.log(`  imperia z ZEROWĄ produkcją statków: ${rows.filter(r => r.built === 0).length}/${rows.length}`);
console.log(`  imperia z ZEROWĄ produkcją towarów: ${rows.filter(r => r.commodityUnits === 0).length}/${rows.length}`);
