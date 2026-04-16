// ═══════════════════════════════════════════════════════════════
// ConclusionsEngine — generuje wnioski actionable z agregatu raportu
// ─────────────────────────────────────────────────────────────
// Każda reguła bierze (aggregate, games) i zwraca conclusion lub null.
// Wynik sortujemy po severity: critical → warning → info.
// Cel: powiedzieć userowi CO zmienić w bocie lub w grze, z konkretnymi dowodami.
// ═══════════════════════════════════════════════════════════════

/**
 * @param {object} aggregate — wynik Reporter.getAggregate()
 * @param {Array} games — GameReport.toJSON() per gra
 * @returns {Array<Conclusion>}
 */
export function generateConclusions(aggregate, games) {
  const conclusions = [];

  // ── Skróty dla czytelności ──
  const fs = aggregate.finalStats ?? {};
  const ev = aggregate.eventTotals ?? {};
  const sh = aggregate.shortageByResource ?? {};
  const tb = aggregate.techsByBranch ?? {};
  const ships = aggregate.shipsBuiltByType ?? {};
  const flags = aggregate.flagHistogram ?? {};
  const n = aggregate.games ?? games?.length ?? 1;
  const avgY = aggregate.avgYears ?? 0;
  const pct = (k) => flags[k] ? ((flags[k] / n) * 100).toFixed(0) + '%' : '0%';
  const flagPctN = (k) => flags[k] ? flags[k] / n : 0;

  // Helper — sprawdza czy bot miał shipyard (z per-gra data)
  const hasShipyardAvg = games && games.some(g => {
    const byCat = g.finalState?.buildingsByCategory;
    return byCat?.space?.byId?.shipyard > 0;
  });
  const hasFactoryAvg = games && games.some(g => {
    const byCat = g.finalState?.buildingsByCategory;
    return byCat?.mining?.byId?.factory > 0 || byCat?.industrial?.byId?.factory > 0;
  });
  const avgFactoryCount = games ? games.reduce((s, g) => {
    const b = g.finalState?.buildingsByCategory ?? {};
    let c = 0;
    for (const cat of Object.values(b)) c += (cat.byId?.factory ?? 0) + (cat.byId?.light_factory ?? 0) + (cat.byId?.heavy_factory ?? 0);
    return s + c;
  }, 0) / (games.length || 1) : 0;

  // ═══════════════════════════════════════════════════════
  // BOT — zachowanie
  // ═══════════════════════════════════════════════════════

  // Brak kolonizacji
  if ((ev.coloniesFounded ?? 0) === 0 && (ev.outpostsFounded ?? 0) === 0 && avgY >= 200) {
    conclusions.push({
      id: 'no_colonization',
      severity: 'critical',
      category: 'bot',
      title: 'Boty nie kolonizują innych planet',
      evidence: `coloniesFounded=0 i outpostsFounded=0 w ${n} grach. Średnia długość gry: ${avgY} civYears.`,
      suggestion: `Dodaj w RuleBot: (1) Badaj tech orbital_survey → rocketry → exploration → colonization. (2) Po zbudowaniu shipyard — buduj cargo_ship z modułem habitat_pod. (3) Po rekonesansie rocky planet (explored=true), wyślij misję colonize z tym statkiem. Obecnie bot zatrzymuje się przed ścieżką space.`,
      data: { games: n, avgYears: avgY },
    });
  }

  // Brak eksploracji
  if ((ev.observatoryDiscoveries ?? 0) === 0 && (ev.missionsComplete ?? 0) === 0 && avgY >= 200) {
    conclusions.push({
      id: 'no_exploration',
      severity: 'critical',
      category: 'bot',
      title: 'Boty nie eksplorują układu',
      evidence: `0 discoveries z obserwatorium, 0 zakończonych misji. ${ev.vesselsLaunched ?? 0} statków wystartowało.`,
      suggestion: `1) Dodaj wcześnie w opening: 'observatory' gdy pop >= 3 (auto-odkrywa ciała). 2) Po zbudowaniu science_vessel, emituj expedition:sendRequest z type='recon' na najbliższe niezbadane ciało (EntityManager.getAll().filter(e => !e.explored && e.type !== 'star')).`,
      data: { discoveries: ev.observatoryDiscoveries ?? 0 },
    });
  }

  // Brak floty
  if ((fs.avg_vessels ?? 0) === 0 && avgY >= 300) {
    const techsOK = (tb.space ?? 0) > 0;
    conclusions.push({
      id: 'no_fleet',
      severity: techsOK ? 'critical' : 'warning',
      category: 'bot',
      title: 'Boty nie budują floty',
      evidence: `avg_vessels=0 mimo ${avgY} civYears. Tech space zbadane: ${tb.space ?? 0}. Shipyard kiedyś był: ${hasShipyardAvg ? 'TAK' : 'NIE'}.`,
      suggestion: hasShipyardAvg
        ? `Shipyard istnieje ale bot nie kolejkuje ships. Emituj fleet:buildRequest {shipId: 'science_vessel'} — wymaga exploration tech + zasoby Fe 80, Ti 15, Cu 10, structural_alloys 4, polymer_composites 3, electronic_systems 2.`
        : `Bot nawet nie buduje shipyard. Dodaj regułę: gdy pop >= 6 + tech 'exploration' + canBuild('shipyard') → zbuduj.`,
      data: { avgVessels: fs.avg_vessels, techSpace: tb.space },
    });
  }

  // Factory underuse
  if (avgFactoryCount < 1 && avgY >= 200) {
    conclusions.push({
      id: 'no_factory',
      severity: 'critical',
      category: 'bot',
      title: 'Boty nie stawiają fabryk',
      evidence: `Średnio ${avgFactoryCount.toFixed(1)} factory/gra. Bez fabryk nie ma commodities → nie ma habitatów/mine/shipyard.`,
      suggestion: `RuleBot powinien mieć factory WCZEŚNIE w opening order (przed habitat). Fabryka produkuje commodities które są wymagane dla każdego budynku Tier 1+. Bez fabryki bot stagnuje na starter commodities.`,
      data: { avgFactory: avgFactoryCount },
    });
  } else if (avgFactoryCount < 2 && (fs.avg_pop ?? 0) >= 6) {
    conclusions.push({
      id: 'too_few_factories',
      severity: 'warning',
      category: 'bot',
      title: 'Za mało fabryk dla skali imperium',
      evidence: `avg_factories=${avgFactoryCount.toFixed(1)}, avg_pop=${fs.avg_pop}. Jedna fabryka = 1 punkt produkcji — nie nadąża.`,
      suggestion: `Dodaj P8b w RuleBot: build 2-gi factory gdy pop >= 6, 3-ci gdy pop >= 10.`,
      data: { avgFactory: avgFactoryCount, pop: fs.avg_pop },
    });
  }

  // Factory mode (domyślny "manual" = bot musi ręcznie enqueue)
  if (hasFactoryAvg && ev.buildSuccess > 5 && (ev.shortages ?? 0) > 10) {
    conclusions.push({
      id: 'factory_mode_manual',
      severity: 'warning',
      category: 'bot',
      title: 'Fabryki prawdopodobnie działają w trybie manual',
      evidence: `Fabryki istnieją, bot buduje, ale shortages=${ev.shortages}. Manual mode wymaga że bot sam kolejkuje — reactive produkuje automatycznie co brakuje.`,
      suggestion: `ActionAdapter: dodaj FACTORY_SET_MODE → EventBus.emit('factory:setMode', {mode}). RuleBot: po zbudowaniu factory wywołaj raz. FactorySystem wspiera 'reactive' i 'priority' — reactive produkuje deficyt, priority pracuje z templatem (patrz FactorySystem line 97).`,
      data: { shortages: ev.shortages },
    });
  }

  // Tech zbyt wolny
  if ((fs.avg_techs ?? 0) < 8 && avgY >= 400) {
    conclusions.push({
      id: 'tech_slow',
      severity: 'warning',
      category: 'bot',
      title: 'Tempo badań bardzo wolne',
      evidence: `avg_techs=${fs.avg_techs} po ${avgY} civYears. Oczekiwany tempo ~1 tech / 20 civYears (=${Math.round(avgY/20)}).`,
      suggestion: `Bot nie buduje lab/research_station. Dodaj lab WCZEŚNIEJ (np. pop >= 3). Także: upgrade research_station do Lv3+ zwielokrotnia badania.`,
      data: { avgTechs: fs.avg_techs, avgYears: avgY },
    });
  }

  // Brak space branch tech
  if ((tb.space ?? 0) === 0 && avgY >= 300) {
    conclusions.push({
      id: 'no_space_tech',
      severity: 'critical',
      category: 'bot',
      title: 'Boty nie badają technologii kosmicznych',
      evidence: `0 space-branch techs zbadanych. Bez orbital_survey → rocketry → exploration → colonization żadna flota/ekspansja nie jest możliwa.`,
      suggestion: `Dodaj w RuleBot TECH_PRIORITY: ['orbital_survey', 'rocketry', 'exploration', 'colonization'] — badane SEKWENCYJNIE jak tylko dostępne.`,
      data: { techSpace: tb.space ?? 0 },
    });
  }

  // ═══════════════════════════════════════════════════════
  // EKONOMIA / POPULACJA
  // ═══════════════════════════════════════════════════════

  // Pop death spiral
  if ((ev.popDied ?? 0) > (ev.popBorn ?? 0) && (ev.popDied ?? 0) > 10) {
    const ratio = (ev.popDied / Math.max(1, ev.popBorn)).toFixed(2);
    conclusions.push({
      id: 'pop_death_spiral',
      severity: 'critical',
      category: 'economy',
      title: 'Ujemny bilans populacji — imperium wymiera',
      evidence: `popDied=${ev.popDied} vs popBorn=${ev.popBorn} (${ratio}× więcej zgonów).`,
      suggestion: `Częste przyczyny: brak food/water (zobacz shortages), brak housing (pop > housing → bezdomni giną), impact events. Bot powinien priorytetyzować food+water+housing przed technologiami.`,
      data: { popDied: ev.popDied, popBorn: ev.popBorn },
    });
  }

  // Water shortage
  if ((sh.water ?? 0) > n * 2) {
    conclusions.push({
      id: 'water_crisis',
      severity: 'critical',
      category: 'economy',
      title: 'Krytyczny brak wody',
      evidence: `water shortage: ${sh.water} razy w ${n} grach (${(sh.water/n).toFixed(1)}/gra).`,
      suggestion: `Bot nie rozbudowuje well'ów. Każda dodatkowa well = +6 water/rok. Dodaj rule: gdy waterRate < pop×0.5 → build well (lub upgrade istniejącego). Ice_sheet biom daje baseYield water +2.5 — idealna lokalizacja.`,
      data: { waterShortages: sh.water },
    });
  }

  // Food shortage
  if ((sh.food ?? 0) > n * 1.5) {
    conclusions.push({
      id: 'food_crisis',
      severity: 'warning',
      category: 'economy',
      title: 'Częsty brak żywności',
      evidence: `food shortage: ${sh.food} razy w ${n} grach.`,
      suggestion: `Farm +10 food/rok bazowo, plains terrain ×1.4 bonus. Tech 'hydroponics' i 'agriculture' zwielokrotniają. Bot powinien budować 1 farm per 2 POP.`,
      data: { foodShortages: sh.food },
    });
  }

  // Inne shortage
  for (const [res, count] of Object.entries(sh)) {
    if (res === 'water' || res === 'food') continue;
    if (count > n * 1.5) {
      conclusions.push({
        id: `shortage_${res}`,
        severity: 'warning',
        category: 'economy',
        title: `Częsty brak surowca: ${res}`,
        evidence: `${count} shortages w ${n} grach.`,
        suggestion: `Jeśli to commodity — dodaj do FactorySystem priorytet lub włącz reactive mode. Jeśli mineral — buduj więcej kopalni (mine category).`,
        data: { [res]: count },
      });
    }
  }

  // Low prosperity
  if ((fs.avg_prosperity ?? 0) < 30 && avgY >= 200) {
    conclusions.push({
      id: 'low_prosperity',
      severity: 'warning',
      category: 'economy',
      title: 'Niska prosperity (ogólne zadowolenie)',
      evidence: `avg_prosperity=${fs.avg_prosperity} (skala 0-100). Poniżej 50 growth rate pop jest ograniczony.`,
      suggestion: `Prosperity zależy od: resources per capita, stability, buildings quality, trade, housing. Buduj więcej mieszkań, fabryk (consumer goods), handluj (market buildings).`,
      data: { prosperity: fs.avg_prosperity },
    });
  }

  // Housing stuck
  if ((fs.avg_housing ?? 0) <= 4 && (fs.avg_pop ?? 0) > 4) {
    conclusions.push({
      id: 'housing_limit',
      severity: 'warning',
      category: 'bot',
      title: 'Bot zatrzymał się na housing = 4 (tylko Stolica)',
      evidence: `avg_housing=${fs.avg_housing} mimo avg_pop=${fs.avg_pop}. Habitat lv1 = +3 housing. Nie ma upgrade lub nowych habitatów.`,
      suggestion: `Problem: habitat kosztuje pressure_modules:4 — starter ma tylko 4 na 1 habitat. Factory produkująca pressure_modules jest konieczna dla expansion. Sprawdź czy bot ma factory ORAZ enqueue pressure_modules.`,
      data: { housing: fs.avg_housing, pop: fs.avg_pop },
    });
  }

  // ═══════════════════════════════════════════════════════
  // DIPLOMACJA / WOJNA
  // ═══════════════════════════════════════════════════════

  if (flagPctN('DIPLOMACY_DEAD') === 1.0 && avgY >= 400) {
    conclusions.push({
      id: 'diplomacy_dead',
      severity: 'info',
      category: 'game',
      title: 'Zero interakcji dyplomatycznych z obcymi imperiami',
      evidence: `DIPLOMACY_DEAD w 100% gier. Mimo że obce imperia istnieją (${games?.[0]?.finalState?.empires?.length ?? 0}/grę), hostility = 0.`,
      suggestion: `Albo: (1) gra wymaga że gracz pierwszy kontaktuje obcych przez recon/colonization — boty tego nie robią. (2) Gra powinna generować więcej incydentów (automatyczne spotkania z flotą obcych). Sprawdź czy AlienCivSystem ma trigger zwiększający hostility z czasem lub granicę ekspansji.`,
      data: { empires: games?.[0]?.finalState?.empires?.length ?? 0 },
    });
  }

  // ═══════════════════════════════════════════════════════
  // GRA
  // ═══════════════════════════════════════════════════════

  if ((ev.randomEvents ?? 0) > n * 20) {
    conclusions.push({
      id: 'random_events_overload',
      severity: 'info',
      category: 'game',
      title: 'Bardzo dużo wydarzeń losowych',
      evidence: `${ev.randomEvents} eventów w ${n} grach (${(ev.randomEvents/n).toFixed(1)}/gra, ~${((ev.randomEvents/n)/(avgY/100)).toFixed(1)} na 100 civYears).`,
      suggestion: `Rozważ obniżenie częstotliwości RandomEventSystem (RANDOM_EVENT_INTERVAL) albo zwiększenie proporcji positive events (obecnie widać dużo destruktywnych).`,
      data: { events: ev.randomEvents, games: n },
    });
  }

  if (flagPctN('STALEMATE') >= 0.5) {
    conclusions.push({
      id: 'stalemate_frequent',
      severity: 'warning',
      category: 'bot',
      title: 'Stagnacja gry (STALEMATE)',
      evidence: `STALEMATE w ${pct('STALEMATE')} gier. Żadne kluczowe metryki nie zmieniły się przez 250+ civYears.`,
      suggestion: `Bot wypadł z pętli wzrost. Dodaj escape hatch: jeśli żadnej decyzji przez 50 civYears nie zmieniła stanu, wymuś upgrade najstarszego budynku lub scrap + build coś innego.`,
      data: {},
    });
  }

  // ═══════════════════════════════════════════════════════
  // Pozytywne (info)
  // ═══════════════════════════════════════════════════════

  if ((ev.coloniesFounded ?? 0) > 0) {
    conclusions.push({
      id: 'colonization_working',
      severity: 'info',
      category: 'bot',
      title: '✓ Boty kolonizują',
      evidence: `${ev.coloniesFounded} kolonii i ${ev.outpostsFounded} outpostów założonych w ${n} grach.`,
      suggestion: 'Kontynuuj w tym kierunku — rozbudowuj o więcej parzących planet.',
      data: { colonies: ev.coloniesFounded },
    });
  }

  // Sort: critical > warning > info
  const order = { critical: 0, warning: 1, info: 2 };
  conclusions.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
  return conclusions;
}

/** Helper: wygeneruj krótki summary text z conclusions */
export function summaryText(conclusions) {
  if (conclusions.length === 0) return 'Brak wniosków — run wygląda OK.';
  const lines = [];
  const critical = conclusions.filter(c => c.severity === 'critical');
  const warning  = conclusions.filter(c => c.severity === 'warning');
  const info     = conclusions.filter(c => c.severity === 'info');
  lines.push(`── WNIOSKI (${conclusions.length}) ──`);
  if (critical.length > 0) {
    lines.push(`\n🔴 KRYTYCZNE (${critical.length}):`);
    for (const c of critical) lines.push(`  • ${c.title}`);
  }
  if (warning.length > 0) {
    lines.push(`\n🟡 OSTRZEŻENIA (${warning.length}):`);
    for (const c of warning) lines.push(`  • ${c.title}`);
  }
  if (info.length > 0) {
    lines.push(`\n🟢 INFO (${info.length}):`);
    for (const c of info) lines.push(`  • ${c.title}`);
  }
  return lines.join('\n');
}
