// ═══════════════════════════════════════════════════════════════
// SONDA READ-ONLY — dlaczego zaawansowane komponenty AI stoją na zerze
// Uruchom: node src/testing/headless/probe-ai-advanced-components.mjs [--seeds=2] [--gy=60]
// ───────────────────────────────────────────────────────────────
// Rozstrzyga TRZY hipotezy per towar, osobno, bez zgadywania:
//   (a) PRIORYTET  — AI umie i ma z czego, ale nigdy nie zamawia (brak popytu)
//   (b) ŁAŃCUCH    — umie i chce, ale brakuje składnika (surowca albo półproduktu)
//   (c) ZDOLNOŚĆ   — bramka tech, której AI nie ma ANI w startingTechs, ANI w researchQueue
// Kolejność testów jest istotna: (c) przebija (b), a (b) przebija (a) — towar bez
// technologii nie może „nie mieć priorytetu", bo nie wchodzi nawet do katalogu.
// Niczego nie naprawia. Nic nie zapisuje poza stdout.
// ═══════════════════════════════════════════════════════════════
import './env.js';
import { runOneGame } from './balans-driver.mjs';
import { COMMODITIES } from '../../data/CommoditiesData.js';
import { ARCHETYPES } from '../../data/EmpireData.js';

// Plan technologiczny AI = czego dane imperium kiedykolwiek MOZE sie nauczyc
// (startingTechs + researchQueue JEGO archetypu). Bramka spoza tego zbioru jest
// NIEPRZEKRACZALNA -- to cala roznica miedzy -jeszcze nie- a -nigdy-.
// UWAGA: plan jest PER ARCHETYP. EXPANSIONIST NIE jest czystym klonem INDUSTRIALIST --
// nadpisuje wlasna researchQueue (m.in. fusion_power, plasma_physics, warp_drive_mk2),
// wiec zaszycie jednego planu na sztywno dawalo falszywe -NIGDY- dla drugiego archetypu.
const techPlanFor = (archetype) => new Set([
  ...(ARCHETYPES[archetype]?.startingTechs ?? []),
  ...(ARCHETYPES[archetype]?.researchQueue ?? []),
]);

const arg = (n, d) => (process.argv.find(s => s.startsWith(`--${n}=`)) ?? `=${d}`).split('=')[1];
const N_SEEDS   = parseInt(arg('seeds', '2'));
const TARGET_GY = parseFloat(arg('gy', '60'));

const WATCH = ['warp_cores', 'quantum_cores', 'quantum_processors', 'plasma_cores',
               'antimatter_cells', 'military_supplies', 'fuel',
               'structural_alloys', 'conductor_bundles', 'electronic_systems'];

const nullTelemetry = { sample() {}, getSeries() { return []; } };
console.log(`\n═══ SONDA — zaawansowane komponenty AI (seeds=${N_SEEDS}, ${TARGET_GY} gy) ═══`);

const verdicts = new Map();
for (let i = 1; i <= N_SEEDS; i++) {
  const r = runOneGame({ seed: `ai-adv_${i}`, planetClass: 'REAL', targetGy: TARGET_GY,
                         telemetry: nullTelemetry, opts: { aiEmpires: true } });
  const K = window.KOSMOS;
  const cm = K.colonyManager;
  for (const emp of (K.empireRegistry?.listAll?.() ?? [])) {
    // Stolica: LUSTRO rezolwera gry (EmpireLogisticsSystem._pickCapital) — iterujemy
    // getColoniesByEmpire, bo jego kolejnosc to kolejnosc REJESTRACJI w EmpireRegistry,
    // czyli stempel bootstrapu (stolica rejestrowana pierwsza). Poprzednia heurystyka
    // (pierwsza kolonia bez isOutpost z getAllColonies) czytala kolejnosc GLOBALNEGO
    // rejestru kolonii i potrafila zwrocic kolonie WTORNA -- stad sprzeczne werdykty
    // o tym samym archetypie. Nie wymyslamy trzeciej definicji stolicy.
    const cols = K.empireRegistry?.getColoniesByEmpire?.(emp.id) ?? [];
    const cap  = cols.find(c => c && !c.isOutpost && c.resourceSystem) ?? null;
    if (!cap?.factorySystem) continue;
    const fs = cap.factorySystem, rs = cap.resourceSystem;
    const ts = cap.buildingSystem?.techSystem ?? K.techSystem;
    // Trop wycieku (EmpireColonyBootstrap:385-390): kolonia bez wlasnego techSystem
    // zostaje z GLOBALNYM drzewem gracza. Porownanie TOZSAMOSCI, nie zawartosci.
    const leak = (c) => (c.buildingSystem?.techSystem ?? null) === K.techSystem ? 'GRACZ' : 'wlasny';
    console.log(`  techSystem stolicy: ${leak(cap)}  |  wszystkie kolonie imperium: ` +
      cols.map(c => `${c.planetId}${c.isOutpost ? '(out)' : ''}=${leak(c)}`).join(' '));
    const demand = new Set((fs.reactiveDemand ?? []).map(d => d.commodityId));

    console.log(`\n── ${emp.name} (${emp.archetype}) · seed ${i} · stolica ${cap.planetId} ──`);
    console.log('towar                | tier | tech            | znana | zapas | popyt | brakujące składniki       | WERDYKT');
    for (const cid of WATCH) {
      const def = COMMODITIES[cid];
      const tech = def?.requiresTech ?? null;
      const known = tech ? !!ts?.isResearched?.(tech) : true;
      const stock = Math.round(rs?.getAmount?.(cid) ?? 0);
      const missing = (fs._getMissingIngredients?.(def?.recipe, cid) ?? [])
        .map(m => (typeof m === 'string' ? m : (m.id ?? m.commodityId ?? JSON.stringify(m))));
      const sustain = fs._colonyCanSustainRecipe?.(cid) ?? null;
      // Kolejnosc testow jest KONTRAKTEM: tech spoza planu to -nigdy-, tech w planie ale
      // niezbadany to -jeszcze nie-; zlanie ich w jedno zamazuje cala diagnoze.
      // _getMissingIngredients mowi o STANIE TERAZ, _colonyCanSustainRecipe o ZDOLNOSCI
      // W OGOLE -- dlatego brak zrodla bije chwilowy niedobor.
      const planned = tech ? techPlanFor(emp.archetype).has(tech) : true;
      let verdict;
      if (!known && !planned)             verdict = '(c) ZDOLNOSC - tech POZA planem AI (nigdy)';
      else if (!known)                    verdict = '(c) ZDOLNOSC - tech w kolejce, jeszcze nie';
      else if (sustain === false)         verdict = '(b) LANCUCH - brak zrodla lokalnie';
      else if (stock > 0)                 verdict = 'OK - produkowany';
      else if (!demand.has(cid))          verdict = '(a) PRIORYTET - zero popytu';
      else if (missing.length)            verdict = '(b) LANCUCH - chwilowy brak skladnika';
      else                                verdict = '(a) PRIORYTET - popyt bez FP';
      verdicts.set(cid, (verdicts.get(cid) ?? []).concat(verdict));
      console.log(`${cid.padEnd(20)} | ${String(def?.tier ?? '?').padStart(4)} | ${String(tech ?? '—').padEnd(15)} | ${(known ? 'tak' : (planned ? 'jesz' : 'NIGDY')).padEnd(5)} | ${String(stock).padStart(5)} | ${(demand.has(cid) ? 'tak' : 'nie').padEnd(5)} | ${(missing.join(',') || '—').slice(0, 25).padEnd(25)} | ${verdict}`);
    }
  }
}

console.log('\n── WERDYKT ZBIORCZY (wszystkie imperia × seedy) ──');
for (const cid of WATCH) {
  const v = verdicts.get(cid) ?? [];
  const uniq = [...new Set(v)];
  console.log(`  ${cid.padEnd(20)} ${uniq.join(' | ')}${uniq.length > 1 ? '   ⚠ NIEJEDNORODNY' : ''}`);
}
