// ColonyConsolePagesLogic — modele stron osadzonych w konsoli Kolonii (ARC COLONY SPHERE CS-8c, plan §3.17).
//
// Czysta logika (bez canvas, bez window, bez i18n): wiersze, tony ról konsoli (`primary` / `dim` / `alert`), stany
// włączony / wyłączony z kluczem powodu i18n (reguła ARC KONSOLE: żadnej cichej odmowy — element wyłączony mówi dlaczego
// i co zrobić). Rysuje `ColonyConsolePages.js`; dane czyta tam z systemów gry tymi samymi wywołaniami co dzisiejsze
// zakładki okna kolonii (Załoga / Populacja / Stacja), modal rekrutacji, pickery stacji i szuflada grupy jednostek.

/** Strojenie stron (bramka właściciela): okna obok strefy inspektora, wiersz Załogi, szuflada grupy. */
export const COLONY_PAGES = Object.freeze({
  WINDOW_W: 400,        // okno (rekrutacja, pickery stacji) — szerokość, przy lewej krawędzi inspektora
  WINDOW_GAP: 8,        // odstęp okna / szuflady od strefy inspektora i od krawędzi bohatera
  CREW_ROW_H: 34,       // wiersz warstwy Załogi (dwie linie)
  CREW_STEP_W: 92,      // stepper „[-] wartość [+]”
  CREW_SUMMARY_H: 76,   // przypięte podsumowanie Załogi u dołu strony
  DRAWER_W: 440,        // szuflada grupy jednostek
  DRAWER_H: 104,
  DRAWER_ICONS: 8,      // jednostek w rzędzie szuflady (reszta jako „+N”)
});

/** Strony konsoli → klucz przewijania (`_cScroll`). Dzisiejsze identyfikatory zakładek okna kolonii. */
export const CONSOLE_PAGES = Object.freeze(['workforce', 'populacja', 'stacja']);
export const pageScrollKey = (tab) => `pg_${tab}`;

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
/** Ton wartości 0–1: poniżej progu `low` — alert (dzisiejszy kolor ostrzegawczy czerwony), inaczej primary. */
export const fracTone = (frac, low) => (clamp01(frac) < low ? 'alert' : 'primary');

// ── Załoga ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Wiersze tabeli Załogi (dzisiejsza `_drawWorkforceTableV2`): warstwa, płaca, cel udziału ze stepperem, obsada, droidy.
 * Steppery wyłączone z powodem tam, gdzie dziś nie miały strefy (cicha odmowa). Na cudzej kolonii (`ordersOk` false)
 * strefy zostają (bramka własności `_onHit` odmawia z powodem) — widok tylko przygasza.
 * @param {Array<object>} breakdown `civ.getWorkforceBreakdown()`
 * @param {{ ordersOk?:boolean, stateOf?:(type:string)=>string, previewOf?:(type:string)=>object }} c
 */
export function crewRowsOf(breakdown, { ordersOk = true, stateOf = () => 'off', previewOf = () => null } = {}) {
  return (Array.isArray(breakdown) ? breakdown : []).map((r) => {
    const grossJobs = r.grossJobs ?? 0, workers = r.workers ?? 0, synthetic = r.synthetic ?? 0;
    const active = grossJobs > 0 || workers > 0 || synthetic > 0;
    const base = { type: r.type, namePL: r.namePL ?? r.type, nameEN: r.nameEN ?? r.namePL ?? r.type, active };
    if (!active) return base;
    const sharePct = Math.round((r.target ?? 0) * 100);
    const state = stateOf(r.type) ?? 'off';
    const prev = previewOf(r.type) ?? { target: 0, desired: 0, current: 0, delta: 0, capped: false };
    const staffing = clamp01(r.staffing ?? 0);
    const noJobs = grossJobs <= 0;
    return {
      ...base,
      wage: Number(r.wage ?? 0).toFixed(1),
      wageTone: (r.pressure ?? 0) > 0.25 ? 'alert' : 'dim',
      sharePct, state, preview: prev,
      shareText: sharePct > 0 ? `${sharePct}%≈${state === 'unreachable' ? `${prev.desired}!` : prev.target}` : '0%',
      shareTone: sharePct <= 0 ? 'dim' : state === 'unreachable' ? 'alert' : state === 'active' ? 'primary' : 'dim',
      targetMinus: { enabled: !noJobs, reasonKey: noJobs ? 'colonyPages.reason.noJobs' : null },
      targetPlus:  { enabled: !noJobs, reasonKey: noJobs ? 'colonyPages.reason.noJobs' : null },
      stateTip: sharePct > 0 && !noJobs,
      staffing, staffTone: staffing >= 0.9 ? 'alert' : 'primary', saturated: staffing >= 0.9,
      capText: `${workers}${synthetic > 0 ? `+${synthetic}D` : ''}/${grossJobs}`,
      droids: synthetic,
      droidMinus: { enabled: synthetic > 0, reasonKey: synthetic > 0 ? null : 'synthetic.reason.no_synthetic' },
      droidPlus:  { enabled: synthetic < grossJobs, reasonKey: synthetic < grossJobs ? null : 'synthetic.reason.no_open_slot' },
      foreign: !ordersOk,
    };
  });
}

/**
 * Przypięte podsumowanie Załogi (dzisiejsza `_drawWorkforceSummaryV2`): bezrobotni, satysfakcja, dobrobyt + trend, wzrost,
 * bilans przychód − płace. `prosperity` null → wiersz pominięty (dziś: tylko dla kolonii z globalnym systemem dobrobytu).
 */
export function crewSummaryOf({ humans = 0, unemployed = 0, satisfaction = 50, prosperity = null, growth = 0, income = 0, wages = 0 } = {}) {
  const h = Math.floor(humans), frac = h > 0 ? unemployed / h : 0;
  const rows = [
    { id: 'unemployed', labelKey: 'workforce.unemployed', value: `${unemployed} (${Math.round(frac * 100)}%)`, tone: frac > 0.10 ? 'alert' : 'primary' },
    { id: 'satisfaction', labelKey: 'workforce.satisfaction', value: `${Math.round(satisfaction)}%`, tone: 'primary', tip: 'satisfaction' },
  ];
  if (prosperity) {
    const cur = prosperity.cur ?? 50, tgt = prosperity.tgt ?? 50;
    const up = tgt > cur + 0.5, down = tgt < cur - 0.5;
    rows.push({ id: 'prosperity', labelKey: 'workforce.prosperity', value: `${Math.round(cur)} ${up ? '↑' : down ? '↓' : '→'} ${Math.round(tgt)}`, tone: down ? 'alert' : up ? 'primary' : 'dim' });
  }
  rows.push({ id: 'growth', labelKey: 'workforce.growth', value: `+${Number(growth).toFixed(1)}`, unitKey: 'workforce.perYear', tone: growth > 0 ? 'primary' : 'dim', tip: 'growth' });
  const net = income - wages;
  rows.push({ id: 'net', labelKey: 'workforce.net', value: `+${income.toFixed(0)} − ${wages.toFixed(0)} = ${net >= 0 ? '+' : ''}${net.toFixed(0)}`, unit: 'Kr', unitKey: 'workforce.perYear', tone: net >= 0 ? 'primary' : 'alert', wide: true });
  return rows;
}

// ── Podpowiedzi wielowierszowe (dzisiejsze podpowiedzi HTML Załogi; w konsoli były wygaszone) ────────────────────────

/** Linia podpowiedzi: `{ key, args, tone, bold }` (tłumaczy widok) albo `{ text, tone }` (gotowy tekst z danych gry). */
export function growthTipLines(g) {
  if (!g) return [];
  const f2 = (v) => Number(v ?? 0).toFixed(2);
  const out = [{ key: 'colonyPages.tip.growthTitle', args: [f2(g.growth)], bold: true }];
  if (g.blockReason) out.push({ key: `workforce.growthTip.block.${g.blockReason}`, args: [], tone: 'alert' });
  out.push({ key: 'colonyPages.tip.kv', args: [{ key: 'workforce.growthTip.base' }, f2(g.base)] });
  out.push({ key: 'colonyPages.tip.kv', args: [{ key: 'workforce.growthTip.prosperity' }, `×${f2(g.prosperityMult)}`] });
  out.push({ key: 'colonyPages.tip.kv', args: [{ key: 'workforce.growthTip.planet' }, `×${f2(g.planetMod)}`] });
  if (Math.abs((g.factionMult ?? 1) - 1) > 0.005) out.push({ key: 'colonyPages.tip.kv', args: [{ key: 'workforce.growthTip.faction' }, `×${f2(g.factionMult)}`] });
  out.push({ key: 'colonyPages.tip.kv', args: [{ key: 'workforce.growthTip.taper' }, `×${f2(g.taper)}`] });
  out.push({ key: 'colonyPages.tip.kv', args: [{ key: 'workforce.growthTip.capacity' }, `${Math.floor(g.humans ?? 0)}/${Math.floor(g.capacity ?? 0)} (${Math.round((g.fillFrac ?? 0) * 100)}%)`] });
  if (g.capped) out.push({ key: 'workforce.growthTip.capped', args: [f2(g.cap)], tone: 'dim' });
  return out;
}

export function satisfactionTipLines(s) {
  if (!s) return [];
  const sign = (v) => `${v >= 0 ? '+' : ''}${Number(v ?? 0).toFixed(1)}`;
  return [
    { key: 'colonyPages.tip.satTitle', args: [Math.round(s.satisfaction ?? 0)], bold: true },
    { key: 'colonyPages.tip.kv', args: [{ key: 'workforce.satTip.base' }, String(s.base ?? 0)] },
    { key: 'colonyPages.tip.kvNote', args: [{ key: 'workforce.satTip.emp' }, sign(s.empTerm), { key: 'workforce.satTip.unemp', args: [Math.round((s.unemploymentRate ?? 0) * 100)] }] },
    { key: 'colonyPages.tip.kv', args: [{ key: 'workforce.satTip.crowd' }, sign(s.crowdTerm)] },
    { key: 'colonyPages.tip.kvTax', args: [{ key: 'workforce.satTip.tax' }, sign(s.taxTerm), Math.round((s.taxRate ?? 0) * 100)] },
  ];
}

export function targetTipLines(state, prev) {
  const p = prev ?? { target: 0, desired: 0, current: 0, delta: 0 };
  const shown = state === 'unreachable' ? p.desired : p.target;
  const out = [{ key: 'workforce.targetPreview.title', args: [shown, p.current], bold: true }];
  if (p.delta) out.push({ key: 'workforce.targetPreview.delta', args: [p.delta > 0 ? `+${p.delta}` : String(p.delta)] });
  if (state && state !== 'off') out.push({ key: `workforce.targetState.${state}`, args: [], tone: 'dim', wrap: true });
  return out;
}

/** Budynki zatrudniające warstwę: `[[nazwa, liczba], …]` → linie (pusta lista — linia „brak budynków”). */
export function strataTipLines(strataName, entries) {
  const out = [{ key: 'workforce.buildingsUsing', args: [strataName], bold: true }];
  if (!entries?.length) out.push({ key: 'workforce.noBuildings', args: [], tone: 'dim' });
  for (const [name, n] of entries ?? []) out.push({ text: `${name}${n > 1 ? ` ×${n}` : ''}` });
  return out;
}

// ── Populacja ────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Strona Populacji (dzisiejsza `_drawPopulationTab`, tylko odczyt): sześć sekcji, te same dane i progi barw
 * (czerwień dzisiejszej zakładki = rola alert). Wejście: migawka zebrana z systemów kolonii przez widok.
 * Wiersz: `bar` {label|labelKey, frac, value, tone} · `kv` {label|labelKey, value, tone} · `note` {key|text, args, tone}.
 */
export function populationPageOf(s = {}) {
  const sections = [];
  // 1. Stabilność — lojalność / tożsamość + cechy kulturowe + zdarzenia aktywne
  const st = [];
  const loy = clamp01((s.loyalty ?? 80) / 100);
  st.push({ kind: 'bar', labelKey: 'popPanel.loyaltyLabel', frac: loy, value: `${Math.round(s.loyalty ?? 80)}%`, tone: fracTone(loy, 0.3) });
  const idf = clamp01((s.identity ?? 0) / 100);
  st.push({ kind: 'bar', labelKey: 'popPanel.identityLabel', frac: idf, value: `${Math.round(s.identity ?? 0)}`, tone: idf > 0.2 ? 'primary' : 'dim' });
  st.push({ kind: 'sub', labelKey: 'popPanel.traitsLabel' });
  if (!s.traits?.length) st.push({ kind: 'note', key: 'colonyInfo.popTab.noTraits', tone: 'dim' });
  for (const tr of s.traits ?? []) { st.push({ kind: 'note', text: tr.name, tone: 'primary' }); if (tr.effect) st.push({ kind: 'note', text: tr.effect, tone: 'dim', indent: 8 }); }
  st.push({ kind: 'sub', labelKey: 'popPanel.activeEvents' });
  if (!s.events?.length) st.push({ kind: 'note', key: 'popPanel.noEvents', tone: 'dim' });
  for (const ev of s.events ?? []) { st.push({ kind: 'kv', labelKey: ev.nameKey, valueKey: 'popPanel.activeLabel', tone: 'alert' }); st.push({ kind: 'note', key: ev.descKey, tone: 'dim', indent: 8 }); }
  sections.push({ titleKey: 'colonyInfo.popTab.stabilityTitle', rows: st });
  // 2. Potrzeby — żywność / woda / energia (pokrycie z puli bez kary)
  const nd = [];
  for (const n of s.needs ?? []) {
    nd.push({ kind: 'bar', label: n.name, labelKey: n.nameKey, frac: clamp01(n.ratio), value: `${Math.round(clamp01(n.ratio) * 100)}%`, tone: fracTone(n.ratio, 0.5) });
    if (n.pooled) nd.push({ kind: 'note', key: 'popPanel.fedFromPool', tone: 'primary', indent: 8 });
    else if (n.ratio < 0.5) nd.push({ kind: 'note', key: 'popPanel.deficit', args: [n.name ?? { key: n.nameKey }, n.penalty], tone: 'alert', indent: 8 });
  }
  sections.push({ titleKey: 'popPanel.needsTitle', rows: nd });
  // 3. Dobrobyt — 5 warstw + czynnik wzrostu
  const pr = [];
  for (const [key, labelKey] of [['survival', 'popPanel.layerSurvival'], ['infrastructure', 'popPanel.layerInfra'], ['functioning', 'popPanel.layerFunctioning'],
    ['comfort', 'popPanel.layerComfort'], ['luxury', 'popPanel.layerLuxury']]) {
    const v = clamp01(s.layers?.[key] ?? 0);
    pr.push({ kind: 'bar', labelKey, frac: v, value: `${Math.round(v * 100)}%`, tone: fracTone(v, 0.3) });
  }
  pr.push({ kind: 'note', key: 'colonyInfo.popTab.prosperityGrowthFactor', args: [Number(s.growthMult ?? 1).toFixed(1)], tone: 'dim' });
  sections.push({ titleKey: 'colonyInfo.popTab.prosperityLayers', rows: pr });
  // 4. Konsumpcja — epoka + dobra konsumpcyjne (zablokowane: przygaszone z kłódką słowną)
  const cg = [];
  if (s.epoch) {
    cg.push({ kind: 'note', key: 'popPanel.epochScoreLabel', args: [{ key: s.epoch.nameKey }, s.epoch.score], tone: 'dim' });
    for (const g of s.goods ?? []) {
      if (!g.unlocked) cg.push({ kind: 'kv', label: g.name, valueKey: 'colonyPages.locked', tone: 'dim', dimLabel: true });
      else cg.push({ kind: 'kv', label: g.name, valueKey: 'colonyInfo.popTab.goodsRate', valueArgs: [g.production.toFixed(1), g.demand.toFixed(1)], tone: fracTone(g.sat, 0.5) });
    }
  }
  sections.push({ titleKey: 'popPanel.consumerGoods', rows: cg });
  // 5. Grupy społeczne — satysfakcja warstw (bez liczności — ta jest na stronie Załogi)
  const sg = [];
  if (!s.strata?.length) sg.push({ kind: 'note', text: '—', tone: 'dim' });
  for (const g of s.strata ?? []) {
    const r = clamp01((g.satisfaction ?? 0) / 100);
    sg.push({ kind: 'bar', label: g.name, frac: r, value: `${Math.round(g.satisfaction ?? 0)}%`, tone: fracTone(r, 0.3) });
  }
  sections.push({ titleKey: 'colonyInfo.popTab.strataSatisfaction', rows: sg });
  // 6. Zakwaterowanie — sloty per budynek + suma
  const hs = [];
  if (s.housing == null) hs.push({ kind: 'note', key: 'popPanel.noHousingData', tone: 'dim' });
  else if (!s.housing.length) hs.push({ kind: 'note', key: 'popPanel.noHousingBuildings', tone: 'dim' });
  else {
    let total = 0;
    for (const b of s.housing) { total += b.housing; hs.push({ kind: 'kv', label: `${b.name} Lv${b.level}`, valueKey: 'popPanel.slotsCount', valueArgs: [b.housing], tone: 'primary' }); }
    hs.push({ kind: 'kv', labelKey: 'popPanel.totalLabel', valueKey: 'popPanel.totalSlots', valueArgs: [total], tone: 'primary', total: true });
  }
  sections.push({ titleKey: 'popPanel.housingTitle', rows: hs });
  return sections;
}

// ── Stacja ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Formularz budowy stacji (stan „build”): cele (planeta + księżyce), koszt z magazynem, czip budowy. Budowa jest zawsze
 * dostępna — bez surowców zlecenie czeka w kolejce (dzisiejsza reguła, notka `station.buildWait`).
 */
export function stationBuildOf({ targets = [], selectedId = null, cost = [], canAfford = false } = {}) {
  const sel = targets.some((b) => b.id === selectedId) ? selectedId : (targets[0]?.id ?? null);
  return {
    selectedId: sel,
    targets: targets.map((b) => ({ id: b.id, name: b.name ?? b.id, moon: b.type === 'moon', sel: b.id === sel })),
    pickable: targets.length > 1,
    cost: cost.map((c) => ({ id: c.id, name: c.name ?? c.id, have: Math.floor(c.have ?? 0), need: c.need, tone: (c.have ?? 0) >= c.need ? 'primary' : 'alert' })),
    canAfford: !!canAfford,
    noteKey: canAfford ? 'station.buildAfford' : 'station.buildWait',
  };
}

/** Status modułu → klucz i ton (dzisiejsze ✓ / ⚡✗ / 👥✗ / ✗ słowami). */
export function moduleStatusOf(m) {
  if (m?.active !== false) return { key: 'colonyPages.module.on', tone: 'primary' };
  if (m.inactiveReason === 'no_power') return { key: 'colonyPages.module.noPower', tone: 'alert' };
  if (m.inactiveReason === 'no_crew') return { key: 'colonyPages.module.noCrew', tone: 'alert' };
  return { key: 'colonyPages.module.off', tone: 'alert' };
}

/**
 * Zarządzanie stacją grupy (stan „exists”; dzisiejsze `drawStationManageCompact`): statystyki, moduły z rozbiórką
 * (zasiedlony habitat — strefa odmowy z powodem, jak dziś), zamówienia modułów, „dodaj moduł” (pełne sloty — wyłączony z
 * powodem; dziś znikał), stocznia i jej kolejka. Depot czyta widok (pula systemu / magazyn kolonii macierzystej).
 * @param {object} station
 * @param {{ moduleDef:(type:string)=>object|null, maxModules:number }} defs
 */
export function stationManageOf(station, { moduleDef = () => null, maxModules = 8 } = {}) {
  const mods = station?.modules ?? [], pend = station?.pendingModuleOrders ?? [];
  let prod = 0, cons = 0;
  for (const m of mods) {
    if (m.active === false) continue;
    const e = moduleDef(m.moduleType)?.energy ?? 0;
    if (e > 0) prod += e; else cons += -e;
  }
  const net = prod - cons;
  const used = mods.length + pend.length;
  return {
    stats: [
      { labelKey: 'station.mgmt.crew', value: `${station?.pop ?? 0}/${station?.popCapacity ?? 0}`, tone: 'primary' },
      { labelKey: 'colonyPages.station.energy', value: `+${prod} / -${cons} = ${net >= 0 ? '+' : ''}${net}`, tone: net >= 0 ? 'primary' : 'alert' },
      { labelKey: 'station.mgmt.shipyard', valueKey: station?.hasActiveShipyard ? 'station.mgmt.on' : 'station.mgmt.off', tone: station?.hasActiveShipyard ? 'primary' : 'dim' },
      { labelKey: 'station.mgmt.tradeCap', value: String(station?.tradeCapacity ?? 0), tone: 'primary' },
    ],
    noCrewHint: mods.some((m) => m.active === false && m.inactiveReason === 'no_crew'),
    slotsUsed: used, maxModules,
    modules: mods.map((m) => {
      const def = moduleDef(m.moduleType) ?? {};
      const cap = (def.popCapacity ?? 0) * (m.level || 1);
      const blocked = cap > 0 && (station?.pop ?? 0) > ((station?.popCapacity ?? 0) - cap);
      return { id: m.id, moduleType: m.moduleType, level: (def.maxLevel ?? 1) > 1 ? (m.level ?? 1) : null, status: moduleStatusOf(m), dim: m.active === false,
        demolish: { type: blocked ? 'station_mgmt_demolish_blocked' : 'station_mgmt_demolish', blocked } };
    }),
    pending: pend.map((o) => ({ id: o.id, moduleType: o.moduleType, building: o.status === 'building',
      frac: o.buildTime > 0 ? Math.min(1, (o.progress ?? 0) / o.buildTime) : 0 })),
    addModule: { enabled: used < maxModules, reasonKey: used < maxModules ? null : 'colonyPages.reason.slotsFull', reasonArgs: [used, maxModules] },
    shipyard: !!station?.hasActiveShipyard,
    shipQueue: (station?.shipQueues ?? []).map((q, i) => ({ index: i, shipId: q.shipId, frac: q.buildTime > 0 ? Math.min(1, (q.progress ?? 0) / q.buildTime) : 0 })),
  };
}

/** Koszt z magazynu stacji → wiersze `{id, need, have, short}` + lista braków. */
export function depotCostOf(cost, haveOf = () => 0) {
  const parts = Object.entries(cost ?? {}).map(([id, need]) => { const have = Number(haveOf(id)) || 0; return { id, need, have, short: have < need }; });
  return { parts, afford: parts.every((p) => !p.short), missing: parts.filter((p) => p.short).map((p) => p.id) };
}

/**
 * Picker modułów (dzisiejszy `drawModulePicker`): każdy typ modułu z kosztem z depotu i stanem; niebudowalny wiersz =
 * wyłączony z powodem (dziś: przycisk bez strefy — cicha odmowa). Kolejność powodów jak dzisiejsza etykieta przycisku.
 */
export function modulePickerRowsOf(types, station, { moduleDef = () => null, costOf = () => ({}), techOk = () => true, maxModules = 8, haveOf = () => 0 } = {}) {
  const used = (station?.modules?.length ?? 0) + (station?.pendingModuleOrders?.length ?? 0);
  const full = used >= maxModules;
  return (types ?? []).map((type) => {
    const def = moduleDef(type) ?? {};
    const locked = !!def.requires && !techOk(def.requires);
    const c = depotCostOf(costOf(type), haveOf);
    const already = !!def.unique && ((station?.modules ?? []).some((m) => m.moduleType === type) || (station?.pendingModuleOrders ?? []).some((o) => o.moduleType === type));
    let reasonKey = null, reasonArgs = [];
    if (locked) { reasonKey = 'colonyPages.reason.tech'; reasonArgs = [def.requires]; }
    else if (already) reasonKey = 'colonyPages.reason.unique';
    else if (full) { reasonKey = 'colonyPages.reason.slotsFull'; reasonArgs = [used, maxModules]; }
    else if (!c.afford) { reasonKey = 'colonyPages.reason.depotShort'; reasonArgs = [c.missing]; }
    return { type, energy: def.energy ?? 0, crew: def.popWork ?? 0, cost: c.parts, locked, canBuild: reasonKey === null, reasonKey, reasonArgs };
  });
}

/** Picker statków (dzisiejszy `drawShipPicker`): projekty gracza; nieznany kadłub pominięty; wyłączony wiersz z powodem. */
export function shipPickerRowsOf(designs, { hullOf = () => null, costOf = () => ({}), techOk = () => true, haveOf = () => 0 } = {}) {
  const out = [];
  for (const tpl of designs ?? []) {
    const hull = hullOf(tpl.hullId);
    if (!hull) continue;
    const mods = (tpl.modules ?? []).filter(Boolean);
    const locked = !!hull.requires && !techOk(hull.requires);
    const c = depotCostOf(costOf(hull, mods), haveOf);
    let reasonKey = null, reasonArgs = [];
    if (locked) { reasonKey = 'colonyPages.reason.tech'; reasonArgs = [hull.requires]; }
    else if (!c.afford) { reasonKey = 'colonyPages.reason.depotShort'; reasonArgs = [c.missing]; }
    out.push({ hullId: tpl.hullId, modules: mods, name: tpl.name ?? null, modCount: mods.length, cost: c.parts, locked, canBuild: reasonKey === null, reasonKey, reasonArgs });
  }
  return out;
}

// ── Rekrutacja ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Stan przycisku rekrutacji — ta sama kolejność warunków co `GroundUnitPanel._drawActions` i strona Jednostek Dowództwa:
 * kolonia → blokada archetypu (technologia / koszary) → wolny slot koszar → limit jednostek → koszt.
 */
export function recruitStateOf({ hasColony = true, gate = { unlocked: true }, slots = 0, queue = 0, capOK = true, maxUnits = 0, canAfford = true } = {}) {
  let reasonKey = null, reasonArgs = [];
  if (!hasColony) reasonKey = 'cmdPages.ground.reasonNoColony';
  else if (!gate?.unlocked) {
    if (gate?.reason === 'tech') { reasonKey = 'cmdPages.ground.reasonTech'; reasonArgs = [gate.missing ?? '?']; }
    else { reasonKey = 'cmdPages.ground.reasonBarracks'; reasonArgs = [gate?.requiredLv ?? '?', gate?.currentLv ?? 0]; }
  } else if (queue >= slots) { reasonKey = 'cmdPages.ground.reasonSlots'; reasonArgs = [queue, slots]; }
  else if (!capOK) { reasonKey = 'cmdPages.ground.reasonCap'; reasonArgs = [maxUnits]; }
  else if (!canAfford) reasonKey = 'cmdPages.ground.reasonCost';
  return { canRecruit: reasonKey === null, reasonKey, reasonArgs };
}

// ── Szuflada grupy jednostek ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Szuflada grupy (dzisiejsza `_drawBottomDrawer`): nagłówek (armia albo liczba zaznaczonych), jednostki z HP, akcje.
 * Akcje jak dziś (jedna armia: podziel / nazwa / rozwiąż; grupa: połącz / szczegóły; jedna: szczegóły) — „połącz” poza
 * jednym polem nie znika, tylko jest wyłączone z powodem.
 * @param {Array<{id:string, hp:number, hpMax:number, dmg?:number}>} units
 * @param {{ army?:{id:string,name:string,kills?:number,tileLabel?:string}|null, sameTile?:boolean }} c
 */
export function groupDrawerOf(units, { army = null, sameTile = false } = {}) {
  const list = Array.isArray(units) ? units : [];
  const n = list.length;
  const rows = list.map((u) => ({ id: u.id, hpFrac: u.hpMax > 0 ? clamp01(u.hp / u.hpMax) : 0 }))
    .map((r) => ({ ...r, tone: r.hpFrac < 0.3 ? 'alert' : 'primary' }));
  const actions = [];
  if (army) {
    actions.push({ id: 'split', type: 'armySplitFromDrawer', labelKey: 'colonyPages.drawer.split', data: { armyId: army.id }, enabled: true });
    actions.push({ id: 'rename', type: 'armyRename', labelKey: 'colonyPages.drawer.rename', data: { armyId: army.id }, enabled: true });
    actions.push({ id: 'disband', type: 'armyDisband', labelKey: 'colonyPages.drawer.disband', data: { armyId: army.id }, enabled: true, danger: true });
  } else if (n >= 2) {
    actions.push({ id: 'merge', type: 'armyCreateFromSelection', labelKey: 'colonyPages.drawer.merge', data: {}, enabled: !!sameTile,
      reasonKey: sameTile ? null : 'colonyPages.reason.mergeSameTile' });
    actions.push({ id: 'details', type: 'drawerOpenGroup', labelKey: 'colonyPages.drawer.details', data: {}, enabled: true });
  } else if (n === 1) {
    actions.push({ id: 'details', type: 'drawerOpenUnit', labelKey: 'colonyPages.drawer.details', data: { unitId: list[0].id }, enabled: true });
  }
  let sums = null;
  if (army) {
    sums = { dmg: 0, hp: 0, hpMax: 0, kills: army.kills ?? 0 };
    for (const u of list) { sums.dmg += u.dmg ?? 0; sums.hp += u.hp ?? 0; sums.hpMax += u.hpMax ?? 0; }
  }
  return {
    titleKey: army ? 'colonyPages.drawer.army' : 'colonyPages.drawer.selected',
    titleArgs: army ? [army.name, n, army.tileLabel ?? ''] : [n],
    army: !!army, count: n, rows, actions, sums,
  };
}

// ── Okna obok strefy konsoli ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Okno (rekrutacja, picker stacji) przy LEWEJ krawędzi inspektora, na wysokości jego góry, w obrębie bohatera — reguła
 * ARC KONSOLE „okna obok strefy konsoli” (nie na środku kuli).
 * @param {{hero:object, inspector:object}} zones
 * @returns {{x:number,y:number,w:number,h:number}|null}
 */
export function windowNextToInspector(zones, wantH, { w = COLONY_PAGES.WINDOW_W, gap = COLONY_PAGES.WINDOW_GAP } = {}) {
  const hero = zones?.hero, insp = zones?.inspector;
  if (!hero || !insp) return null;
  const ww = Math.max(160, Math.min(w, hero.w - 2 * gap));
  const x = Math.max(hero.x + gap, insp.x - gap - ww);
  const y = Math.max(hero.y + gap, insp.y);
  const h = Math.max(80, Math.min(wantH, hero.y + hero.h - gap - y));
  return { x, y, w: ww, h };
}

/** Szuflada grupy: przy lewej krawędzi inspektora, u dołu bohatera (nad pasem kolejki), nie pod środkiem kuli. */
export function drawerRect(zones, { w = COLONY_PAGES.DRAWER_W, h = COLONY_PAGES.DRAWER_H, gap = COLONY_PAGES.WINDOW_GAP } = {}) {
  const hero = zones?.hero, insp = zones?.inspector;
  if (!hero || !insp) return null;
  const ww = Math.max(200, Math.min(w, hero.w - 2 * gap));
  return { x: Math.max(hero.x + gap, insp.x - gap - ww), y: hero.y + hero.h - gap - h, w: ww, h };
}
