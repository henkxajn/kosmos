// FleetPictureLogic — „Obraz Operacyjny" floty: JEDNO źródło słownika
// glifów / tonów statusu / alertów / aktywności / ETA dla wszystkich soczewek
// (M1 plakietki na mapie 3D · tryb taktyczny Y · rejestr K3 w COMMAND).
//
// Faza 0 planu `docs/KOSMOS_plan_obraz_operacyjny_v1.md` (Aneks A — wiążący).
// Weryfikacja stanu kodu: `docs/KOSMOS_obraz_operacyjny_weryfikacja.md`.
//
// Konwencja siostrzana do MapLabelLogic: moduł CZYSTY, node-importowalny,
// zero side-effectów, zero importów THREE/canvas/i18n/ThemeConfig:
//   • teksty WYŁĄCZNIE jako klucze i18n (`fleetPicture.*`) + activityArgs —
//     tłumaczy renderer przez t(); moduł nie zna języka;
//   • kolory WYŁĄCZNIE jako NAZWY tokenów ThemeConfig (STATUS_TONES) —
//     rozwiązuje widok przez toneColor(tone, THEME); zero hex-hardcodów;
//   • zależności świata (walka DSCS, immobilized, floty) wchodzą przez `ctx`.
//
// TWARDA REGUŁA (plan §0): żaden widok nie liczy glifu/tonu/ETA/alertu po
// swojemu — potrzebujesz wariantu? Zmieniasz TEN moduł, nie robisz fallbacku.
//
// Wraki: poza zakresem Obrazu Operacyjnego v1 (Aneks A.2) — buildShipEntry
// zwraca dla nich `{ excluded: true }`; powierzchnie je pomijają.

import { getPrimaryRole, isEnemyVessel } from '../entities/Vessel.js';

// ── Słownik: rola → glif ─────────────────────────────────────────────────────
// Mapowanie 7 ról getPrimaryRole() → 5 glifów koncepcji (wiele-do-jednego,
// Aneks A.1); `station` to encja (nie rola vessela) — glif dla plakietek/rejestru.
// Pole `role` we wpisie pozostaje 7-wartościowe (rejestr rozróżnia tekstem).
export const ROLE_GLYPHS = Object.freeze({
  transport: '□',
  cargo:     '□',
  warship:   '△',
  assault:   '△',
  science:   '◇',
  scout:     '○',
  colony:    '⬠',
  station:   '◈',
});

// ── Słownik: tone → token ThemeConfig ────────────────────────────────────────
// Wartości to NAZWY tokenów THEME (nie kolory!) — widok rozwiązuje przez
// toneColor(tone, THEME). Semantyka: idle=szary, move=ruch, mission=zadanie,
// combat=walka, alert=wymaga uwagi.
export const STATUS_TONES = Object.freeze({
  idle:    'textDim',
  move:    'info',
  mission: 'success',
  combat:  'danger',
  alert:   'warning',
});

// Priorytet tonów — indeks 0 = najważniejszy (plan §2: combat > alert > move >
// mission > idle). Używany przez _computeTone oraz worst-of klastrów (0b/M1).
export const TONE_PRIORITY = Object.freeze(['combat', 'alert', 'move', 'mission', 'idle']);

/** Kolor tonu z przekazanego motywu (moduł nie importuje ThemeConfig). */
export function toneColor(tone, theme) {
  return theme?.[STATUS_TONES[tone] ?? 'text'];
}

/** Najgorszy (najistotniejszy) ton z listy — worst-of dla klastrów/flot. */
export function worstTone(tones) {
  let best = 'idle';
  let bestIdx = TONE_PRIORITY.indexOf(best);
  for (const t of tones ?? []) {
    const idx = TONE_PRIORITY.indexOf(t);
    if (idx !== -1 && idx < bestIdx) { best = t; bestIdx = idx; }
  }
  return best;
}

// ── Słownik: alerty ──────────────────────────────────────────────────────────
// Hierarchia z planu §2 (mały K2): severity 1 = krytyczne, 3 = ostrzeżenie.
export const ALERT_KINDS = Object.freeze({
  stranded:     { severity: 1, i18nKey: 'fleetPicture.alert.stranded' },
  combat:       { severity: 1, i18nKey: 'fleetPicture.alert.combat' },
  blocked:      { severity: 2, i18nKey: 'fleetPicture.alert.blocked' },
  immobilized:  { severity: 2, i18nKey: 'fleetPicture.alert.immobilized' },
  lowFuel:      { severity: 3, i18nKey: 'fleetPicture.alert.lowFuel' },
  damaged:      { severity: 3, i18nKey: 'fleetPicture.alert.damaged' },
  awaitingFuel: { severity: 3, i18nKey: 'fleetPicture.alert.awaitingFuel' },
});
// Porządek wtórny sortowania przy równej severity (deterministyczny).
const ALERT_ORDER = Object.freeze(Object.keys(ALERT_KINDS));

// Próg alertu lowFuel — te same 20%, które używają paski paliwa w UI floty.
export const DEFAULT_LOW_FUEL_PCT = 0.2;

// ── Słownik: aktywność (klucze i18n) ─────────────────────────────────────────
// Misje — pełna macierz 12 typów z weryfikacji pkt 3 (w tym syntetyczne
// move_to_point/engage od MovementOrderSystem; interstellar_jump → warp).
const MISSION_ACTIVITY_KEYS = Object.freeze({
  transport:         'fleetPicture.mission.transport',
  recon:             'fleetPicture.mission.recon',
  colony:            'fleetPicture.mission.colony',
  passenger:         'fleetPicture.mission.passenger',
  envoy:             'fleetPicture.mission.envoy',
  foreign_recon:     'fleetPicture.mission.foreignRecon',
  exploration:       'fleetPicture.mission.exploration',
  mining:            'fleetPicture.mission.mining',
  attack:            'fleetPicture.mission.attack',
  move_to_point:     'fleetPicture.mission.movePoint',
  engage:            'fleetPicture.mission.engage',
  interstellar_jump: 'fleetPicture.activity.warp',
});
const MISSION_ACTIVITY_FALLBACK_KEY = 'fleetPicture.mission.generic';

// Rozkazy — pełna macierz 9 typów ORDER_TYPES (weryfikacja pkt 4).
const ORDER_ACTIVITY_KEYS = Object.freeze({
  moveToPoint: 'fleetPicture.order.moveToPoint',
  pursue:      'fleetPicture.order.pursue',
  intercept:   'fleetPicture.order.intercept',
  patrol:      'fleetPicture.order.patrol',
  escort:      'fleetPicture.order.escort',
  goToPOI:     'fleetPicture.order.goToPOI',
  engage:      'fleetPicture.order.engage',
  retreat:     'fleetPicture.order.retreat',
  dock:        'fleetPicture.order.dock',
});
const ORDER_ACTIVITY_FALLBACK_KEY = 'fleetPicture.order.generic';

// Rozkazy na ruchomy cel — ETA nie jest stałe (plan §2: confidence 'moving').
const MOVING_ETA_ORDER_TYPES = Object.freeze(['pursue', 'intercept']);

// ── Helpery wewnętrzne ───────────────────────────────────────────────────────

/** Procent zapełnienia baku 0..1; null gdy baku brak (max<=0) — np. warpFuel bez Komory Warp. */
function _tankPct(tank) {
  if (!tank || !(tank.max > 0)) return null;
  const cur = Number.isFinite(tank.current) ? tank.current : 0;
  return Math.max(0, Math.min(1, cur / tank.max));
}

/** Skończony rok albo null (guard na NaN/undefined w danych misji). */
function _finiteYear(y) {
  return Number.isFinite(y) ? y : null;
}

/** Czy wpis jest wrakiem (kanonicznie po isWreck; status='destroyed' defensywnie). */
function _isWreck(vessel) {
  return vessel?.isWreck === true || vessel?.status === 'destroyed';
}

/**
 * Alerty pojedynczego statku (posortowane wg hierarchii).
 * ctx:
 *   combatCheck(vesselId)→bool — wpięcie DSCS (encounter membership); brak = brak alertu combat.
 *   isImmobilized(vessel)→bool — wpięcie VesselManager.isImmobilized; brak = brak alertu
 *     (celowo NIE duplikujemy tu progu UPKEEP_GRACE_YEARS).
 *   lowFuelPct — próg lowFuel (default DEFAULT_LOW_FUEL_PCT).
 */
function _gatherAlerts(vessel, ctx) {
  const alerts = [];
  const add = (kind) => alerts.push({ kind, severity: ALERT_KINDS[kind].severity });

  const fuelPct = _tankPct(vessel.fuel);
  const docked  = vessel.position?.state === 'docked';

  // stranded: sucho poza dokiem (lub już zgłoszony przez VesselManager) — severity 1
  const stranded = vessel._strandedNotified === true
    || (fuelPct !== null && fuelPct <= 0 && !docked);
  if (stranded) add('stranded');

  if (ctx?.combatCheck?.(vessel.id) === true) add('combat');
  if (vessel.movementOrder?.status === 'blocked') add('blocked');
  if (ctx?.isImmobilized?.(vessel) === true) add('immobilized');

  // lowFuel tylko gdy NIE stranded (stranded nadrzędny, bez dubla)
  const lowTh = ctx?.lowFuelPct ?? DEFAULT_LOW_FUEL_PCT;
  if (!stranded && fuelPct !== null && fuelPct < lowTh) add('lowFuel');

  if (vessel.damaged === true) add('damaged');
  if (vessel._awaitingFuel === true) add('awaitingFuel');

  alerts.sort((a, b) =>
    (a.severity - b.severity) || (ALERT_ORDER.indexOf(a.kind) - ALERT_ORDER.indexOf(b.kind)));
  return alerts;
}

// ── API publiczne ────────────────────────────────────────────────────────────

/**
 * Buduje wpis obrazu operacyjnego dla statku — JEDYNE miejsce definiujące
 * rolę/glif/ton/aktywność/ETA/alerty (plan §2, sygnatura wiążąca).
 *
 * @param {object} vessel — instancja Vessel (żywa lub wrak)
 * @param {object} [ctx]  — { gameYear, fleetSystem, combatCheck, isImmobilized, lowFuelPct }
 * @returns {object|null} wpis; dla wraka `{ id, name, excluded:true }` (Aneks A.2);
 *   null dla braku vessela.
 *
 * Kształt wpisu (kontrakt):
 * { id, name, role, glyph, tone, activityKey, activityArgs,
 *   eta:{year:number|null, confidence:'firm'|'moving'},
 *   systemId (string | null — null ZOSTAJE null = tranzyt międzygwiezdny!),
 *   fleetId, fuelPct (0..1|null), warpFuelPct (0..1|null), alerts:[{kind,severity}],
 *   excluded:false }
 */
export function buildShipEntry(vessel, ctx = {}) {
  if (!vessel) return null;

  // Wraki poza zakresem v1 — powierzchnie pomijają, bez wymyślania tonu.
  if (_isWreck(vessel)) {
    return { id: vessel.id, name: vessel.name ?? null, excluded: true };
  }

  const role  = getPrimaryRole(vessel);
  const glyph = ROLE_GLYPHS[role] ?? ROLE_GLYPHS.scout;

  // Alerty tylko dla własnych statków — dane wroga (paliwo/uszkodzenia) są za
  // mgłą wojny; jego wpis służy wyłącznie renderowi glifu/tonu przez bramki intel.
  const enemy  = isEnemyVessel(vessel);
  const alerts = enemy ? [] : _gatherAlerts(vessel, ctx);

  const order       = vessel.movementOrder;
  const orderActive = order?.status === 'active';
  const state       = vessel.position?.state ?? 'docked';
  const mission     = vessel.mission ?? null;

  // Ton — JEDNA funkcja priorytetów (plan §2): combat > alert > move > mission > idle.
  let tone;
  if (ctx?.combatCheck?.(vessel.id) === true) tone = 'combat';
  else if (alerts.length > 0)                 tone = 'alert';
  else if (state === 'in_transit' || orderActive) tone = 'move';
  else if (mission)                           tone = 'mission';
  else                                        tone = 'idle';

  // Aktywność — kaskada: aktywny rozkaz > misja (powrót/warp/typ) > stan fizyczny.
  let activityKey;
  const activityArgs = [];
  if (orderActive) {
    activityKey = ORDER_ACTIVITY_KEYS[order.type] ?? ORDER_ACTIVITY_FALLBACK_KEY;
  } else if (mission) {
    activityKey = (mission.phase === 'returning')
      ? 'fleetPicture.activity.returning'
      : (MISSION_ACTIVITY_KEYS[mission.type] ?? MISSION_ACTIVITY_FALLBACK_KEY);
  } else if (vessel.status === 'refueling') {
    activityKey = 'fleetPicture.state.refueling';
  } else if (vessel._awaitingFuel === true) {
    activityKey = 'fleetPicture.state.awaitingFuel';
  } else if (state === 'docked') {
    activityKey = 'fleetPicture.state.docked';
  } else if (state === 'orbiting') {
    activityKey = 'fleetPicture.state.orbiting';
  } else if (state === 'in_transit') {
    activityKey = 'fleetPicture.state.inTransit';
  } else {
    activityKey = 'fleetPicture.state.idle';
  }

  // ETA (lata GRY, spójne z timeSystem.gameTime): mission.arrivalYear /
  // returnYear (faza powrotu) → fallback sync floty (activeOrder.arrivalSyncYear).
  // pursue/intercept = cel ruchomy → confidence 'moving' (plan §2).
  const moving = orderActive && MOVING_ETA_ORDER_TYPES.includes(order.type);
  let etaYear = null;
  if (mission) {
    etaYear = (mission.phase === 'returning')
      ? (_finiteYear(mission.returnYear) ?? _finiteYear(mission.arrivalYear))
      : _finiteYear(mission.arrivalYear);
  }
  if (etaYear === null && vessel.fleetId && ctx?.fleetSystem?.getFleet) {
    etaYear = _finiteYear(ctx.fleetSystem.getFleet(vessel.fleetId)?.activeOrder?.arrivalSyncYear);
  }

  // systemId: null ZOSTAJE null (tranzyt międzygwiezdny) — celowo NIE `?? 'sys_home'`,
  // bo `??` łapie też null i zabiłby semantykę tranzytu (weryfikacja pkt 1).
  const systemId = (vessel.systemId === undefined) ? 'sys_home' : vessel.systemId;

  return {
    id:          vessel.id,
    name:        vessel.name ?? String(vessel.id),
    role,
    glyph,
    tone,
    state,       // surowy token stanu fizycznego (kolumna „Stan" rejestru K3)
    activityKey,
    activityArgs,
    eta:         { year: etaYear, confidence: moving ? 'moving' : 'firm' },
    systemId,
    fleetId:     vessel.fleetId ?? null,
    fuelPct:     _tankPct(vessel.fuel),
    warpFuelPct: _tankPct(vessel.warpFuel),
    alerts,
    excluded:    false,
  };
}

/**
 * Zagregowane alerty floty gracza — posortowane wg hierarchii (severity 1→3,
 * w ramach severity deterministyczny porządek ALERT_ORDER, dalej stabilnie
 * wg kolejności wejścia). Wraki i statki wroga pomijane.
 *
 * @param {object[]} vessels
 * @param {object} [ctx] — jak w buildShipEntry
 * @returns {{vesselId, name, kind, severity}[]}
 */
export function collectAlerts(vessels, ctx = {}) {
  const out = [];
  for (const v of vessels ?? []) {
    if (!v || _isWreck(v) || isEnemyVessel(v)) continue;
    for (const a of _gatherAlerts(v, ctx)) {
      out.push({ vesselId: v.id, name: v.name ?? String(v.id), kind: a.kind, severity: a.severity });
    }
  }
  out.sort((a, b) =>
    (a.severity - b.severity) || (ALERT_ORDER.indexOf(a.kind) - ALERT_ORDER.indexOf(b.kind)));
  return out;
}

// ═══ Slice 0b — klastrowanie screen-space + oś czasu ═════════════════════════

/**
 * Klastruje punkty ekranowe statków (plakietki M1/trybu Y) z HISTEREZĄ:
 * wejście do klastra przy dist < enterRadius, wyjście dopiero przy
 * dist ≥ exitRadius (para, która była razem w poprzedniej klatce, trzyma się
 * do exitRadius — plakietki nie migoczą na granicy przy powolnym zoomie).
 *
 * @param {object[]} points — [{x, y, id, fleetId, tone, alertCount?}]
 *   (px LOGICZNE — po /UI_SCALE, patrz Aneks A.3; alertCount opcjonalny, default 0)
 * @param {object} [opts] — { enterRadius=44, exitRadius=56, prev:Map }
 *   `prev` = akumulator in/out: Map(pointId → klucz klastra z POPRZEDNIEJ klatki).
 *   Funkcja czyta go dla histerezy i PRZEBUDOWUJE w miejscu na potrzeby następnej
 *   klatki — wołający trzyma jedną Mapę między klatkami (jedyna dozwolona mutacja).
 * @returns {{x, y, items, label:'fleet'|'mixed', fleetId, worstTone, alertCount}[]}
 *   x,y = centroid; items = oryginalne punkty; label 'fleet' gdy WSZYSTKIE punkty
 *   mają ten sam nie-null fleetId (wtedy fleetId ustawione), inaczej 'mixed'.
 *
 * Naiwne O(n²) — akceptowalne do ~200 statków (plan §7); ewentualny
 * grid-bucketing wchodzi WEWNĄTRZ tej funkcji, bez zmiany kontraktu.
 */
export function clusterScreenPoints(points, opts = {}) {
  const enterR = opts.enterRadius ?? 44;   // px logiczne
  const exitR  = opts.exitRadius  ?? 56;   // px logiczne
  const prev   = (opts.prev instanceof Map) ? opts.prev : null;

  const pts = (points ?? []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pts.length;

  // Union-find po parach (enter LUB [exit + razem w poprzedniej klatce]).
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };

  const enter2 = enterR * enterR;
  const exit2  = exitR * exitR;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      const d2 = dx * dx + dy * dy;
      if (d2 < enter2) { union(i, j); continue; }
      if (d2 < exit2 && prev) {
        const pa = prev.get(pts[i].id);
        const pb = prev.get(pts[j].id);
        if (pa !== undefined && pa === pb) union(i, j); // histereza — byli razem
      }
    }
  }

  // Komponenty w deterministycznej kolejności wejścia.
  const byRoot = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(pts[i]);
  }

  const clusters = [];
  for (const items of byRoot.values()) {
    let sx = 0, sy = 0, alertCount = 0;
    const tones = [];
    let fleetId = items[0].fleetId ?? null;
    let sameFleet = fleetId !== null;
    for (const p of items) {
      sx += p.x; sy += p.y;
      alertCount += p.alertCount ?? 0;
      tones.push(p.tone);
      if (sameFleet && (p.fleetId ?? null) !== fleetId) sameFleet = false;
    }
    clusters.push({
      x: sx / items.length,
      y: sy / items.length,
      items,
      label:     sameFleet ? 'fleet' : 'mixed',
      fleetId:   sameFleet ? fleetId : null,
      worstTone: worstTone(tones),
      alertCount,
    });
  }

  // Przebuduj prev dla następnej klatki: id → stabilny klucz klastra
  // (najmniejsze id członka — niezależne od kolejności wejścia).
  if (prev) {
    prev.clear();
    for (const c of clusters) {
      let key = null;
      for (const p of c.items) if (key === null || String(p.id) < String(key)) key = p.id;
      for (const p of c.items) prev.set(p.id, key);
    }
  }

  return clusters;
}

/**
 * Paski osi czasu (rejestr K3) — te same dane zasilają duchy ETA trybu Y
 * (koncepcja §3.3: oś pokazuje „kiedy", mapa „gdzie" — jeden byt).
 *
 * @param {object[]} vessels — instancje Vessel (wraki i wrogowie pomijani)
 * @param {object[]} fleets  — fleetSystem.listFleets(); sync-ETA floty jako
 *   fallback paska dla członka BEZ własnej misji (pursue/hold nie mają ETA)
 * @param {number} gameYear  — timeSystem.gameTime (lata gry)
 * @returns {{entryId, confidence:'firm'|'moving', bars:[{t0,t1,kind,labelKey}]}[]}
 *   kind ∈ 'mission-<typ>' | 'return' | 'warp'; wiersz bez misji → bars:[]
 *   (docked = pusty wiersz, nie brak wiersza). Paski zdegenerowane (t1 ≤ t0,
 *   NaN, przeterminowane przyloty) są pomijane.
 */
export function buildTimelineRows(vessels, fleets, gameYear) {
  const fleetById = new Map();
  for (const f of fleets ?? []) if (f?.id) fleetById.set(f.id, f);

  const rows = [];
  for (const v of vessels ?? []) {
    if (!v || _isWreck(v) || isEnemyVessel(v)) continue;

    const order       = v.movementOrder;
    const orderActive = order?.status === 'active';
    const confidence  = (orderActive && MOVING_ETA_ORDER_TYPES.includes(order.type))
      ? 'moving' : 'firm';

    const bars = [];
    const pushBar = (t0, t1, kind, labelKey) => {
      if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) bars.push({ t0, t1, kind, labelKey });
    };

    const m = v.mission;
    if (m?.type === 'interstellar_jump') {
      // Skok warp: pasek teraz → przylot (postęp galProgress to sprawa renderu).
      pushBar(gameYear, _finiteYear(m.arrivalYear), 'warp', 'fleetPicture.activity.warp');
    } else if (m && m.phase === 'returning') {
      pushBar(gameYear, _finiteYear(m.returnYear) ?? _finiteYear(m.arrivalYear),
              'return', 'fleetPicture.activity.returning');
    } else if (m) {
      const arr = _finiteYear(m.arrivalYear);
      pushBar(gameYear, arr, `mission-${m.type}`,
              MISSION_ACTIVITY_KEYS[m.type] ?? MISSION_ACTIVITY_FALLBACK_KEY);
      const ret = _finiteYear(m.returnYear);
      if (arr !== null && ret !== null) {
        pushBar(arr, ret, 'return', 'fleetPicture.activity.returning');
      }
    } else if (v.fleetId) {
      // Bez własnej misji — sync-ETA rozkazu floty (activeOrder.arrivalSyncYear).
      const ao = fleetById.get(v.fleetId)?.activeOrder;
      if (ao) {
        pushBar(gameYear, _finiteYear(ao.arrivalSyncYear), `mission-${ao.type}`,
                ORDER_ACTIVITY_KEYS[ao.type] ?? ORDER_ACTIVITY_FALLBACK_KEY);
      }
    }

    rows.push({ entryId: v.id, confidence, bars });
  }
  return rows;
}
