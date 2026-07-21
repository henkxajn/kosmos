// Smoke — Faza 1 „Obraz Operacyjny" (M1-light): czysta logika zbieracza etykiet flotowych.
// Slice 1a: toLogicalPx (px CSS → /UI_SCALE, Aneks A.3) + gatherVesselLabels (mgła wojny:
// rumor → '?', unknown → brak) + vesselLabelLOD (progi kolonii NIETKNIĘTE) + edgeIndicators
// (clamp + sektory) + buildSystemChips (grupowanie po systemId + tranzyt).
//
// Uruchomienie: node tmp_fleet_map_labels_smoke.mjs

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = { KOSMOS: {} };

const {
  toLogicalPx, vesselLabelLOD, gatherVesselLabels, edgeIndicators, buildSystemChips,
  labelLOD, LOD_PLAQUE_FULL, LOD_PLAQUE_FADE, LOD_MARKER_FADE, LABEL_FADE_END,
  VESSEL_DETAIL_FULL, EDGE_MARGIN,
  layoutSystemChips, CHIP_W, CHIP_H, CHIP_GAP, CHIP_LEFT_M, CHIP_TOP,
  systemDisplayName,
} = await import('./src/ui/MapLabelLogic.js');

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else      { fail++; console.error(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
}
function header(txt) { console.log(`\n── ${txt} ──`); }

let _vid = 1;
function makeVessel(over = {}) {
  return {
    id: `v_${_vid++}`,
    name: `Statek ${_vid}`,
    modules: [],
    position: { x: 0, y: 0, state: 'docked', dockedAt: 'col_1' },
    status: 'idle',
    mission: null,
    movementOrder: null,
    fuel: { current: 80, max: 100 },
    warpFuel: { current: 0, max: 0 },
    systemId: 'sys_home',
    fleetId: null,
    cargoMax: 0,
    ...over,
  };
}

// ── T1 — toLogicalPx: px CSS → /UI_SCALE (wymóg twardy Aneks A.3) ────────────
header('T1: toLogicalPx');
{
  const p = toLogicalPx({ x: 1305, y: 869 }, 1.0195);
  check('T1 dzieli przez uiScale (1305/1.0195)', Math.abs(p.x - 1305 / 1.0195) < 1e-9 && Math.abs(p.y - 869 / 1.0195) < 1e-9);
  check('T1 uiScale=1 → identyczność', toLogicalPx({ x: 640, y: 360 }, 1).x === 640);
  check('T1 null pos → null', toLogicalPx(null, 1) === null);
  check('T1 NaN pos → null', toLogicalPx({ x: NaN, y: 0 }, 1) === null);
  check('T1 zły uiScale (0/NaN) → dzielnik 1', toLogicalPx({ x: 100, y: 50 }, 0).x === 100
        && toLogicalPx({ x: 100, y: 50 }, NaN).x === 100);
}

// ── T2 — gatherVesselLabels: filtracja + mgła wojny ──────────────────────────
header('T2: gatherVesselLabels');
{
  const positions = new Map();
  const ctx = {
    getScreenPos: (id) => positions.get(id) ?? null,
    pictureCtx: {},
    enemyQuality: (id) => ({ e_unknown: 'unknown', e_rumor: 'rumor', e_contact: 'contact' }[id] ?? 'unknown'),
    activeSystemId: 'sys_home',
    selectedIds: new Set(['v_sel']),
  };

  const vOwn    = makeVessel({ id: 'v_own', name: 'Własny', fleetId: 'f_1' });
  const vSel    = makeVessel({ id: 'v_sel', name: 'Wybrany' });
  const vDmg    = makeVessel({ id: 'v_dmg', name: 'Uszkodzony', damaged: true });
  const vWreck  = makeVessel({ id: 'v_wreck', isWreck: true, status: 'destroyed' });
  const vOther  = makeVessel({ id: 'v_other', systemId: 'sys_alcor' });
  const vWarp   = makeVessel({ id: 'v_warp', systemId: null, mission: { type: 'interstellar_jump', arrivalYear: 60 } });
  const vNoPos  = makeVessel({ id: 'v_nopos' });
  const eUnk    = makeVessel({ id: 'e_unknown', isEnemy: true });
  const eRum    = makeVessel({ id: 'e_rumor', name: 'Wrogi Krążownik', isEnemy: true, fleetId: 'ef_1' });
  const eCon    = makeVessel({ id: 'e_contact', name: 'Zidentyfikowany', isEnemy: true });

  for (const id of ['v_own', 'v_sel', 'v_dmg', 'v_wreck', 'v_other', 'v_warp', 'e_unknown', 'e_rumor', 'e_contact']) {
    positions.set(id, { x: 100, y: 100 });
  }
  positions.delete('v_nopos');
  positions.set('v_nopos', null);

  const pts = gatherVesselLabels(
    [vOwn, vSel, vDmg, vWreck, vOther, vWarp, vNoPos, eUnk, eRum, eCon], ctx);
  const byId = new Map(pts.map(p => [p.id, p]));

  check('T2 własny statek zebrany (name/fleetId/kind own)',
        byId.get('v_own')?.name === 'Własny' && byId.get('v_own')?.fleetId === 'f_1' && byId.get('v_own')?.kind === 'own');
  check('T2 wybrany → selected:true', byId.get('v_sel')?.selected === true);
  check('T2 damaged → alertCount ≥ 1', (byId.get('v_dmg')?.alertCount ?? 0) >= 1);
  check('T2 wrak POMINIĘTY', !byId.has('v_wreck'));
  check('T2 inny układ POMINIĘTY', !byId.has('v_other'));
  check('T2 tranzyt (systemId null) POMINIĘTY (idzie do chipu)', !byId.has('v_warp'));
  check('T2 brak pozycji (za kamerą) POMINIĘTY', !byId.has('v_nopos'));
  check('T2 wróg unknown POMINIĘTY (mgła wojny)', !byId.has('e_unknown'));
  check("T2 wróg rumor → ANONIM: name '?', bez fleetId, kind enemy",
        byId.get('e_rumor')?.name === '?' && byId.get('e_rumor')?.fleetId === null && byId.get('e_rumor')?.kind === 'enemy');
  check('T2 wróg rumor → alertCount 0 (bez leakowania stanu)', byId.get('e_rumor')?.alertCount === 0);
  check('T2 wróg contact → pełna nazwa', byId.get('e_contact')?.name === 'Zidentyfikowany');
  check("T2 glif: własny → '○' (scout), rumor → null (rola ukryta), contact → '○'",
        byId.get('v_own')?.glyph === '○' && byId.get('e_rumor')?.glyph === null
        && byId.get('e_contact')?.glyph === '○');
  check('T2/2e punkt niesie activityKey + etaYear + etaMoving (profil tactical)',
        typeof byId.get('v_own')?.activityKey === 'string'
        && byId.get('v_own')?.activityKey.startsWith('fleetPicture.')
        && (byId.get('v_own')?.etaYear === null || Number.isFinite(byId.get('v_own')?.etaYear))
        && typeof byId.get('v_own')?.etaMoving === 'boolean');
}

// ── T3 — vesselLabelLOD (progi kolonii nietknięte) ───────────────────────────
header('T3: vesselLabelLOD + regresja progów kolonii');
{
  const near = vesselLabelLOD(100);
  check('T3 blisko (100) → cluster 1, detail 1', near.clusterAlpha === 1 && near.detailAlpha === 1);
  const mid = vesselLabelLOD(150);
  check('T3 środek (150) → detail w cross-fade (0..1), cluster 1',
        mid.clusterAlpha === 1 && mid.detailAlpha > 0 && mid.detailAlpha < 1);
  const far = vesselLabelLOD(250);
  check('T3 daleko (250) → detail 0, cluster 1 (świadomość w tle)',
        far.clusterAlpha === 1 && far.detailAlpha === 0);
  // 1e (BUG playtestu): frameSystem po przełączeniu układu ląduje na 380..450 —
  // plakietki klastrów NIE mogą tam gasnąć. Fade dystansowy klastrów usunięty.
  check('T3/1e frameSystem-dist (380/450/450+) → cluster ZAWSZE 1',
        vesselLabelLOD(380).clusterAlpha === 1 && vesselLabelLOD(450).clusterAlpha === 1
        && vesselLabelLOD(600).clusterAlpha === 1);
  check('T3 null → pełny detal', vesselLabelLOD(null).detailAlpha === 1);
  check('T3 REGRESJA: progi kolonii labelLOD bez zmian (150/215/300/360)',
        LOD_PLAQUE_FULL === 150 && LOD_PLAQUE_FADE === 215 && LOD_MARKER_FADE === 300 && LABEL_FADE_END === 360);
  const colonyLod = labelLOD(100);
  check('T3 REGRESJA: labelLOD(100) → plakietka pełna', colonyLod.plaqueAlpha === 1 && colonyLod.markerAlpha === 0);
  check('T3 progi statków ≠ progi kolonii (osobne stałe)', VESSEL_DETAIL_FULL !== LOD_PLAQUE_FULL);
}

// ── T4 — edgeIndicators: clamp + sektory ─────────────────────────────────────
header('T4: edgeIndicators');
{
  const W = 1280, H = 720, m = EDGE_MARGIN;
  const off = edgeIndicators([
    { x: -200, y: 300, tone: 'move' },                      // lewa
    { x: 1500, y: 100, tone: 'idle', alertCount: 1 },       // prawa, band górny
    { x: 1600, y: 120, tone: 'combat', alertCount: 2 },     // prawa, ten sam band → grupa
    { x: 640, y: 360, tone: 'idle' },                       // W KADRZE → pomijany
  ], W, H);
  check('T4 w kadrze pomijany (3 punkty → 2 strzałki po grupowaniu)', off.length === 2);
  const left = off.find(o => o.edge === 'left');
  check('T4 lewa: x = margin, y clamp zachowany', left && left.x === m && left.y === 300);
  const right = off.find(o => o.edge === 'right');
  check('T4 prawa: grupa 2 statków w tym samym sektorze (count 2)', right && right.count === 2);
  check('T4 prawa: worstTone combat + alertCount zsumowany (3)',
        right && right.worstTone === 'combat' && right.alertCount === 3);
  check('T4 prawa: x = W - margin', right && right.x === W - m);

  const corner = edgeIndicators([{ x: -500, y: -100, tone: 'idle' }], W, H);
  check('T4 róg: dominująca oś (dx>dy) → edge left', corner[0]?.edge === 'left');
  const clampY = edgeIndicators([{ x: -50, y: -900, tone: 'idle' }], W, H);
  check('T4 clamp do marginesu (y ujemny → edge top, y=margin)',
        clampY[0]?.edge === 'top' && clampY[0]?.y === m);
}

// ── T5 — buildSystemChips: grupowanie po systemId + tranzyt ──────────────────
header('T5: buildSystemChips');
{
  const ctx = {
    activeSystemId: 'sys_home',
    systemName: (id) => ({ sys_home: 'Nowa Ziemia', sys_alcor: 'Alcor' }[id] ?? null),
    pictureCtx: {},
  };
  const chips = buildSystemChips([
    makeVessel({ systemId: 'sys_home' }),
    makeVessel({ systemId: 'sys_home', damaged: true }),
    makeVessel({ systemId: 'sys_alcor' }),
    makeVessel({ systemId: null, mission: { type: 'interstellar_jump', arrivalYear: 60 } }),
    makeVessel({ systemId: 'sys_alcor', isEnemy: true }),                    // wróg — pomijany
    makeVessel({ systemId: 'sys_home', isWreck: true, status: 'destroyed' }), // wrak — pomijany
  ], ctx);

  check('T5 trzy chipy (home, alcor, tranzyt)', chips.length === 3);
  check('T5 sort: aktywny pierwszy, tranzyt ostatni',
        chips[0]?.systemId === 'sys_home' && chips[2]?.isTransit === true);
  const home = chips.find(c => c.systemId === 'sys_home');
  check('T5 home: count 2 (wrak nie liczony), alertCount 1 (damaged), isActive, nazwa z ctx',
        home?.count === 2 && home?.alertCount === 1 && home?.isActive === true && home?.name === 'Nowa Ziemia');
  const alcor = chips.find(c => c.systemId === 'sys_alcor');
  check('T5 alcor: count 1 (wróg nie liczony), nieaktywny', alcor?.count === 1 && alcor?.isActive === false);
  const transit = chips.find(c => c.isTransit);
  check('T5 tranzyt: systemId null, count 1', transit?.systemId === null && transit?.count === 1);
  check('T5 brak własnych statków → zero chipów', buildSystemChips([], ctx).length === 0);
}

// ── T6 — layoutSystemChips: poziomy rząd pod paskiem surowców (chipy od lewej) ─
header('T6: layoutSystemChips');
{
  const W = 1280, H = 720;
  const chips = [{ systemId: 'a' }, { systemId: 'b' }, { systemId: null, isTransit: true }];
  const rects = layoutSystemChips(chips, W, H);
  check('T6 trzy recty, poziomy rząd (wspólny y = CHIP_TOP)',
        rects.length === 3 && rects.every(r => r.y === CHIP_TOP));
  check('T6 pierwszy chip przy lewej krawędzi (CHIP_LEFT_M)',
        rects[0].x === CHIP_LEFT_M);
  check('T6 chip za chipem od lewej (x += CHIP_W + CHIP_GAP)',
        rects[1].x === rects[0].x + CHIP_W + CHIP_GAP && rects[2].x === rects[1].x + CHIP_W + CHIP_GAP);
  check('T6 rect niesie swój chip', rects[2].chip.isTransit === true);
  const many = layoutSystemChips(Array.from({ length: 60 }, (_, i) => ({ systemId: `s${i}` })), W, H);
  check('T6 clamp do szerokości ekranu (60 chipów → mniej rectów, wszystkie w kadrze)',
        many.length < 60 && many.every(r => r.x + r.w <= W));
  check('T6 opts chipWidths + left + maxRight',
        (() => { const r = layoutSystemChips([{ systemId: 'x' }, { systemId: 'y' }], W, H, { chipWidths: [50, 60], left: 100, maxRight: 300 }); return r.length === 2 && r[0].x === 100 && r[0].w === 50 && r[1].x === 100 + 50 + CHIP_GAP && r[1].w === 60; })());
  check('T6 puste wejście → pusta lista', layoutSystemChips([], W, H).length === 0);
}

// ── T7 — slice 1e: „switch tam i z powrotem" + nazwa układu macierzystego ────
header('T7: 1e — powrót do układu + systemDisplayName');
{
  // Scenariusz repro z playtestu (poziom logiki warstwy): te same mapy histerezy
  // przez 3 „klatki": home → obcy układ → powrót. Punkty MUSZĄ wrócić.
  const mk = (sys) => [
    makeVessel({ id: 'w_1', systemId: 'sys_home', fleetId: 'f_1' }),
    makeVessel({ id: 'w_2', systemId: 'sys_home', fleetId: 'f_1' }),
  ].map(v => ({ ...v }));
  const positions = new Map([['w_1', { x: 100, y: 100 }], ['w_2', { x: 120, y: 100 }]]);
  const ctxFor = (activeSystemId) => ({
    getScreenPos: (id) => positions.get(id) ?? null,
    pictureCtx: {}, enemyQuality: () => 'unknown',
    activeSystemId, selectedIds: new Set(),
  });
  const f1 = gatherVesselLabels(mk(), ctxFor('sys_home'));
  check('T7 klatka1 (home): 2 punkty', f1.length === 2);
  const f2 = gatherVesselLabels(mk(), ctxFor('sys_alcor'));
  check('T7 klatka2 (obcy układ): 0 punktów (filtr układu)', f2.length === 0);
  const f3 = gatherVesselLabels(mk(), ctxFor('sys_home'));
  check('T7 klatka3 (POWRÓT do home): punkty WRACAJĄ (2)', f3.length === 2);
  // …a przy dystansie kadrowania układu (450) plakietki klastrów żyją:
  check('T7 vesselLabelLOD(450).clusterAlpha === 1 (fix zniknięć)',
        vesselLabelLOD(450).clusterAlpha === 1);

  // systemDisplayName: rejestr → gwiazda → id (nigdy surowe id gdy jest nazwa)
  const sources = {
    systems: [{ systemId: 'sys_alcor', galaxyStar: { name: 'Alcor' } }],
    starName: (id) => (id === 'sys_home' ? 'Helios Prime' : null),
  };
  check("T7 układ z rejestru → 'Alcor'", systemDisplayName('sys_alcor', sources) === 'Alcor');
  check("T7 macierzysty poza rejestrem → nazwa GWIAZDY 'Helios Prime'",
        systemDisplayName('sys_home', sources) === 'Helios Prime');
  check("T7 brak wszystkiego → fallback id", systemDisplayName('sys_x', sources) === 'sys_x');
  check('T7 puste sources → id (bez rzucania)', systemDisplayName('sys_home', {}) === 'sys_home');
}

console.log(`\n═══ WYNIK: ${pass} PASS / ${fail} FAIL ═══`);
process.exit(fail ? 1 : 0);
