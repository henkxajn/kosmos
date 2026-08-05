// ═══════════════════════════════════════════════════════════════
// BALANS 1.0 — Phase 2 — AI EMPIRE telemetry runner (ostatni slice Phase 2)
// Uruchom: node src/testing/headless/balans-ai-telemetry.mjs [--class=REAL] [--seeds=8] [--gy=45]
// ───────────────────────────────────────────────────────────────
// Ten slice NIE waliduje stałej — DIAGNOZUJE PODEJRZANĄ REGRESJĘ warstwy decyzyjnej AI
// (`EmpireStrategySystem` = kolonizacja, `ColonyAutoExpander` = rozbudowa kolonii).
// Imperia AI grają REALNĄ ekonomią kolonii, więc Population 2.0 trafiła też w nie —
// pytanie brzmi, czy ich warstwa decyzyjna nadąża.
//
// Pytania slice'u (mierzymy, NIE naprawiamy — HARD #1; naprawy = WOJNA I POKÓJ):
//   • czy AI zostaje w tyle za graczem MIMO przewagi startowej (18 darmowych budynków,
//     darmowe techy, POP na start)? od kiedy i o ile?
//   • KTÓRE decyzje odpalają, blokują się albo nie robią nic — i z jakim POWODEM?
//   • czy stall AI to ta sama ściana komponentów co u gracza (slice ZASOBY), czy odrębna
//     awaria warstwy decyzyjnej?
//
// Przebieg: TEN SAM wspólny `balans-driver.mjs` co POP/ZASOBY/ROI/CENY (identyczny boot,
// bot i budżet akcji) z JEDNĄ zmienioną zmienną: `aiEmpires: true` (imperia + warstwy B/C
// AI żyją). Zdarzenia losowe zostają WYŁĄCZONE (solo) — jedna zmienna naraz.
// Wszystko w GAME-YEARS (HARD #3).
// ═══════════════════════════════════════════════════════════════

import './env.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { runSeedPanel, CIV_PER_GY } from './balans-driver.mjs';
import {
  AiTelemetry, AI_TELEMETRY_DEFAULTS, AI_DROID_ID,
  outpostKitCost, summarizeSeed, aggregatePanel, verdict,
} from './AiTelemetry.js';
import {
  AI_HEALTH_THRESHOLDS, evaluateThresholds, rollupWarns, formatWarn,
} from './AiThresholds.js';
import { renderAiReport } from '../report/AiReport.js';

function arg(name, def) {
  const a = process.argv.find(s => s.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
}
const PLANET_CLASS = arg('class', 'REAL');
const N_SEEDS      = parseInt(arg('seeds', '8'));
const TARGET_GY    = parseFloat(arg('gy', '45'));
const SEED_PREFIX  = arg('seed', 'balans-gate1');

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, '..', 'reports', 'balans');

const fmt = (n, d = 1) => (n == null ? '—' : (Math.round(n * 10 ** d) / 10 ** d).toString());
const pct = (x) => (x == null ? '—' : Math.round(x * 100) + '%');
const shortSeed = (s) => String(s).replace(new RegExp(`^${SEED_PREFIX}_`), 'seed_');

console.log(`\n═══ BALANS Phase 2 — AI IMPERIA — class=${PLANET_CLASS}, seeds=${N_SEEDS}, target=${TARGET_GY}gy ═══`);
console.log(`    driver: ten sam co POP/ZASOBY/ROI/CENY + aiEmpires=true (zdarzenia losowe OFF)`);
console.log(`    zestaw placówki AI (solar+mine): ${JSON.stringify(outpostKitCost())}\n`);

// ── Przebieg panelu ───────────────────────────────────────────────
const seeds = runSeedPanel({
  seeds: N_SEEDS, seedPrefix: SEED_PREFIX, planetClass: PLANET_CLASS, targetGy: TARGET_GY,
  makeTelemetry: () => new AiTelemetry(),
  opts: { aiEmpires: true },
  // Dziennik decyzji wisi na instancji czujnika (stan boczny obok szeregu) — driver
  // zwraca ją w `r.telemetry`, więc zdejmujemy go per seed tu, w onSeed.
  onSeed: (r) => ({ decisions: r.telemetry?.getDecisions?.() ?? null }),
});
for (const s of seeds) {
  s.summary = summarizeSeed(s.series, s.decisions);
  s.health  = evaluateThresholds(s.series);
}

const agg = aggregatePanel(seeds.map(s => s.summary));
const v   = verdict(agg);

// ── 1. SONDA ZALEŻNOŚCI (undefined = ZNALEZISKO, nie skip) ───────
console.log('── SONDA ZALEŻNOŚCI — czy warstwa decyzyjna AI w ogóle ma na czym stać ──');
const deps = seeds[0]?.series?.[0]?.deps ?? [];
const missing = deps.filter(d => !d.resolved);
for (const d of deps) {
  console.log(`  ${d.resolved ? 'OK  ' : '‼ BRAK'} ${d.key.padEnd(24)} ${d.usedBy}`);
}
console.log(missing.length
  ? `  ‼ ZNALEZISKO: ${missing.length} odczytów rozwiązuje się do undefined → ciche no-opy w ścieżce decyzyjnej`
  : '  wszystkie odczyty rozwiązane — brak cichego no-opu z tego powodu');

// ── 2. Kamienie milowe per imperium ──────────────────────────────
console.log('\n── IMPERIA AI — kamienie milowe (GAME-LATA) ──');
console.log('seed     | imperium              | archetyp      | 1.placówka | 3 ciała | ciała koniec | POP start→koniec | etaty obsadzone | budynki | decyzja na koniec');
console.log('---------+-----------------------+---------------+------------+---------+--------------+------------------+-----------------+---------+------------------');
for (const s of seeds) {
  for (const e of s.summary.empires) {
    console.log(
      `${shortSeed(s.seed).padEnd(8)} | ${String(e.name).slice(0, 21).padEnd(21)} | ${String(e.archetype).padEnd(13)} | ` +
      `${fmt(e.firstOutpostGy, 0).padStart(10)} | ${fmt(e.first3ColoniesGy, 0).padStart(7)} | ` +
      `${String(e.coloniesEnd + e.outpostsEnd).padStart(12)} | ${String(e.popStart + '→' + e.popEnd).padStart(16)} | ` +
      `${pct(e.emplRateEnd).padStart(15)} | ${String(e.buildingsEnd).padStart(7)} | ${String(e.decisionEnd ?? '—')}`);
  }
}

// ── 3. Porównanie bazowe AI vs GRACZ (ten sam seed, ten sam przebieg) ──
console.log('\n── PORÓWNANIE BAZOWE — AI vs GRACZ na TYM SAMYM seedzie ──');
console.log('  (AI ma zaprojektowaną przewagę startową: darmowe budynki + darmowe techy → nie POWINNO zostawać w tyle)');
console.log('seed     | gracz: ciała | POP | budynki | etaty | ‖ AI (mediana): ciała | POP | budynki | etaty');
console.log('---------+--------------+-----+---------+-------+---‖----------------------+-----+---------+------');
for (const s of seeds) {
  const p = s.summary.player;
  const es = s.summary.empires;
  const m = (f) => {
    const vals = es.map(f).filter(x => x != null).sort((a, b) => a - b);
    if (!vals.length) return null;
    return vals[Math.floor(vals.length / 2)];
  };
  console.log(
    `${shortSeed(s.seed).padEnd(8)} | ${String(p.coloniesEnd + p.outpostsEnd).padStart(12)} | ${String(p.popEnd).padStart(3)} | ` +
    `${String(p.buildingsEnd).padStart(7)} | ${pct(p.emplRateEnd).padStart(5)} | ‖ ` +
    `${fmt(m(e => e.coloniesEnd + e.outpostsEnd), 0).padStart(20)} | ${fmt(m(e => e.popEnd), 0).padStart(3)} | ` +
    `${fmt(m(e => e.buildingsEnd), 0).padStart(7)} | ${pct(m(e => e.emplRateEnd)).padStart(5)}`);
}
console.log(`\n  MEDIANA PANELU — ciała: gracz ${fmt(agg.medPlayerColoniesEnd, 0)} vs AI ${fmt(agg.medAiColoniesEnd, 0)}` +
  ` · POP: gracz ${fmt(agg.medPlayerPopEnd, 0)} vs AI ${fmt(agg.medAiPopEnd, 0)}` +
  ` · budynki: gracz ${fmt(agg.medPlayerBuildingsEnd, 0)} vs AI ${fmt(agg.medAiBuildingsEnd, 0)}`);
console.log(`  obsada etatów (ludzie+droidy / etaty): gracz ${pct(agg.medPlayerEmplRateEnd)} vs AI ${pct(agg.medAiEmplRateEnd)}` +
  ` · nieobsadzone etaty AI na koniec (mediana): ${fmt(agg.medAiUnfilledEnd, 1)}`);
console.log(`  pierwsza placówka AI (mediana): ${fmt(agg.medFirstOutpostGy, 0)} gy · imperia bez ŻADNEJ placówki: ${agg.neverOutpost}/${agg.empiresObserved}`);

// ── 4. Dziennik decyzji — co odpala, co się blokuje, co jest ciche ──
console.log('\n── DZIENNIK DECYZJI — akcje, które REALNIE padły (cały panel) ──');
const allActions = seeds.flatMap(s => (s.decisions?.actions ?? []).map(a => ({ ...a, seed: shortSeed(s.seed) })));
const effective  = allActions.filter(a => a.effective || a.outcome === 'fired');
const byKind = {};
for (const a of allActions) {
  const k = `${a.system}:${a.kind}:${a.outcome}`;
  byKind[k] = (byKind[k] ?? 0) + 1;
}
for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(6)} × ${k}`);
}
console.log(`  RAZEM: ${allActions.length} zarejestrowanych prób, z czego SKUTECZNYCH: ${effective.length}`);

console.log('\n── DZIENNIK DECYZJI — „oceniło i NIC nie zrobiło" (POWÓD, nigdy cichy skip) ──');
console.log('  ile razy | system   | moduł        | powód                  | przykład (pełny tekst)');
console.log('  ---------+----------+--------------+------------------------+-----------------------');
const noopRoll = new Map();
for (const s of seeds) for (const n of (s.decisions?.noops ?? [])) {
  const k = `${n.system}|${n.module}|${n.reasonKey}`;
  const rec = noopRoll.get(k) ?? { ...n, count: 0 };
  rec.count += n.count;
  noopRoll.set(k, rec);
}
for (const n of [...noopRoll.values()].sort((a, b) => b.count - a.count)) {
  console.log(`  ${String(n.count).padStart(8)} | ${n.system.padEnd(8)} | ${n.module.padEnd(12)} | ${n.reasonKey.padEnd(22)} | ${String(n.sample ?? '').slice(0, 90)}`);
}

// ── 5. Co blokuje placówkę (rozbicie brakującego zestawu) ────────
console.log('\n── CO BLOKUJE PLACÓWKĘ AI — brakujące pozycje zestawu na KONIEC przebiegu ──');
const shortRoll = new Map();
for (const s of seeds) for (const e of s.summary.empires) {
  for (const item of e.outpostShortEnd ?? []) {
    const rec = shortRoll.get(item.id) ?? { id: item.id, empires: 0, totalShort: 0 };
    rec.empires++; rec.totalShort += item.short;
    shortRoll.set(item.id, rec);
  }
}
if (shortRoll.size === 0) {
  console.log('  (żadne imperium nie kończy z brakiem — zestaw placówki osiągalny)');
} else {
  for (const r of [...shortRoll.values()].sort((a, b) => b.empires - a.empires)) {
    console.log(`  ${r.id.padEnd(22)} brakuje u ${r.empires}/${agg.empiresObserved} imperiów (średni brak ${fmt(r.totalShort / r.empires, 1)})`);
  }
}
const droidStalls = {};
for (const s of seeds) for (const r of s.series) for (const e of r.empires ?? []) {
  if (e.droidStall?.kind) droidStalls[e.droidStall.kind] = (droidStalls[e.droidStall.kind] ?? 0) + 1;
}
if (Object.keys(droidStalls).length) {
  console.log(`  powód stallu produkcji ${AI_DROID_ID} (lata×imperia): ` +
    Object.entries(droidStalls).map(([k, n]) => `${k}=${n}`).join(', '));
}

// ── 6. Progi zdrowia (WARN) ──────────────────────────────────────
console.log('\n── PROGI ZDROWIA IMPERIUM (wstępne, do przestrojenia — kryteria POMIARU, nie stałe gry) ──');
console.log(`  ${JSON.stringify(AI_HEALTH_THRESHOLDS)}`);
const warnRoll = rollupWarns(seeds.map(s => s.health.warns));
const totalChecks = seeds.reduce((a, s) => a + s.health.checks.filter(c => c.status !== 'n/a').length, 0);
const totalWarns  = seeds.reduce((a, s) => a + s.health.warns.length, 0);
console.log(`  naruszenia: ${totalWarns} / ${totalChecks} sprawdzeń (panel ${N_SEEDS} seedów × ${agg.empiresObserved / N_SEEDS} imperiów)`);
for (const r of warnRoll) {
  console.log(`  ${String(r.count).padStart(4)} × ${r.code.padEnd(22)} (imperiów: ${r.empires}, seedów: ${r.seeds})  np. ${r.sample}`);
}
console.log('\n  pierwsze naruszenia w szczegółach (per seed, do 3 na seed):');
for (const s of seeds) {
  for (const w of s.health.warns.slice(0, 3)) console.log(`  ${shortSeed(s.seed)}  ${formatWarn(w)}`);
}

// ── 7. Werdykt ────────────────────────────────────────────────────
console.log(`\n  ► WERDYKT (outcome ${v.outcome}): ${v.label}`);
console.log(`  crashes: ${seeds.filter(s => s.crashed).length}/${seeds.length}` +
  `  · knoby pomiaru: ${JSON.stringify(AI_TELEMETRY_DEFAULTS)}  · 1 gy = ${CIV_PER_GY} civ-lat`);

// ── 8. Zapis JSON + HTML (kontrakt launchera: `<prefix>-report-<CLASS>.html`) ──
mkdirSync(OUT_DIR, { recursive: true });
const payload = {
  meta: {
    tool: 'BALANS 1.0 Phase 2 — AI empire telemetry (diagnoza podejrzewanej regresji warstwy decyzyjnej AI)',
    planetClass: PLANET_CLASS, seeds: N_SEEDS, targetGy: TARGET_GY, seedPrefix: SEED_PREFIX,
    civPerGy: CIV_PER_GY,
    knobs: { ...AI_TELEMETRY_DEFAULTS },
    unit: 'game-years (1 gy = 12 civ-yr)',
    run: 'wspólny balans-driver + aiEmpires=true (imperia AI + warstwy decyzyjne B/C); zdarzenia losowe WYŁĄCZONE',
    scope: 'imperia AI (EmpireStrategySystem + ColonyAutoExpander) vs bot referencyjny gracza w TYM SAMYM przebiegu',
    outpostKit: outpostKitCost(),
    note: 'read-only instrument — zero stałych balansu, zero zmian w logice AI; opakowania metod zwracają oryginalne wyniki',
  },
  thresholds: { ...AI_HEALTH_THRESHOLDS },
  seeds: seeds.map(s => ({
    seed: s.seed, crashed: s.crashed, summary: s.summary, health: s.health,
    decisions: s.decisions, series: s.series,
  })),
  panel: { ...agg, verdict: v, thresholdFirstOutpostGy: AI_HEALTH_THRESHOLDS.FIRST_OUTPOST_GY },
};
const jsonPath = join(OUT_DIR, `ai-telemetry-${PLANET_CLASS}.json`);
writeFileSync(jsonPath, JSON.stringify(payload));

const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<title>BALANS Phase 2 — IMPERIA AI (${PLANET_CLASS})</title>` +
  `<style>html,body{margin:0}</style></head><body>${renderAiReport(payload)}</body></html>`;
const htmlPath = join(OUT_DIR, `ai-report-${PLANET_CLASS}.html`);
writeFileSync(htmlPath, html);

console.log(`\n  JSON:   ${jsonPath}`);
console.log(`  RAPORT: ${htmlPath}\n`);
