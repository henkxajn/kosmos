// CivilizationConsoleLogic — czysta logika konsol grupy Cywilizacji (ARC KONSOLE K5, docs/design/CONSOLES_PLAN.md §1.2, §19;
// na stałe od KZ — flaga zdjęta).
//
// Bez DOM i canvas — testowalne pod node (keeper `console_civilization_smoke.mjs`). Widok: `CivilizationConsoleView.js`.
//  • czipy grupy [ CYWILIZACJA ] [ SFERA DYSONA ] (zastępują pas subnav grupy, jak czipy Ekonomii);
//  • Cywilizacja: wiersze listy w sekcjach Imperium / Frakcje / Historia, widok frakcji (poparcie, żądania, skutki), grupowanie
//    powtórzeń kroniki, gniazdo emblematu (obraz albo nazwa imperium — nigdy pusta rama);
//  • Sfera Dysona: stan segmentu i fazy (zbudowany / bieżący / zablokowany), bieżąca faza, postęp całości, wiersze kosztu
//    segmentu (potrzeba vs magazyn planety domowej), bramka dostawy → klucz powodu i18n, ścieżka końca gry.
// Liczby gry czytane z tych samych źródeł co dzisiejsze panele (DysonSystem.getState / canDeliver, FactionSystem) — bez nowych wzorów.

import { DYSON_PHASES, DYSON_SEGMENTS, SEGMENT_TO_PHASE } from '../data/DysonData.js';

// ── Czipy grupy ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Kolejność czipów grupy Cywilizacji (= członkowie grupy nawigacji). */
export const CIV_GROUP_CHIP_IDS = Object.freeze(['civilization', 'dyson']);
const CIV_CHIP_LABEL_KEY = Object.freeze({ civilization: 'civPanel.civilization', dyson: 'civPanel.dyson' });

/** Czipy nagłówka `{ id, label, active }` (etykiety przez `tFn` — te same co dzisiejszy pas subnav). */
export function civGroupChips(activeId, tFn) {
  return CIV_GROUP_CHIP_IDS.map((id) => ({ id, label: tFn(CIV_CHIP_LABEL_KEY[id]), active: id === activeId }));
}

/**
 * Klik czipu grupy: otwiera overlay członka (jak klik w pas subnav). Stan instancji (wybór, przewinięcie) zostaje — overlay nie jest
 * tworzony na nowo. Gdy czip = aktywny overlay — bez skutku. Zwraca id celu albo null.
 */
export function applyCivChip(id, om) {
  if (!CIV_GROUP_CHIP_IDS.includes(id)) return null;
  if (om && om.active !== id) om.openPanel?.(id);
  return id;
}

// ── Cywilizacja: frakcje ─────────────────────────────────────────────────────────────────────────────────────────────

export const FACTION_IDS = Object.freeze(['confederates', 'seekers']);
export const FACTION_NAME_KEY = Object.freeze({ confederates: 'civConsole.facConfederates', seekers: 'civConsole.facSeekers' });
export const FACTION_DEMAND_KEY = Object.freeze({ confederates: 'civConsole.demandConfederates', seekers: 'civConsole.demandSeekers' });
// Strefy suwaka, w których frakcja przeważa (granice = FactionSystem.getCurrentZone)
export const FACTION_ZONES = Object.freeze({
  confederates: Object.freeze(['confederates_mild', 'confederates']),
  seekers: Object.freeze(['seekers_mild', 'seekers', 'seekers_max']),
});
// Statystyki modyfikatorów stref → klucze etykiet (te same co dzisiejszy panel)
export const MOD_LABEL_KEY = Object.freeze({
  research: 'civOverlay.modResearch', industryProduction: 'civOverlay.modIndustry', prosperity: 'civOverlay.modProsperity',
  popGrowth: 'civOverlay.modPopGrowth', explorationSpeed: 'civOverlay.modExploration', anomalyChance: 'civOverlay.modAnomaly',
});

/** Poparcie frakcji 0–100 z suwaka (0 = pełni Poszukiwacze, 100 = pełni Konfederaci). */
export function factionSupport(fid, slider) {
  const s = Math.max(0, Math.min(100, Number(slider) || 0));
  return fid === 'confederates' ? s : 100 - s;
}

/**
 * Widok frakcji dla inspektora.
 * @param {string} fid — 'confederates' | 'seekers'
 * @param {{slider:number,tension:number,locked:boolean,zone:string}|null} fac — migawka FactionSystem
 * @param {{ buildingShifts?:object, techShifts?:object, zoneModifiers?:object }} tables — tabele FactionSystem
 * @returns {{ id, locked, support, dominant, zone, tension, pushers:Array<{kind,id,shift}>, effects:Array<{zone,active,mods}> }}
 */
export function factionView(fid, fac, tables = {}) {
  const locked = !fac || fac.locked === true;
  const support = fac ? factionSupport(fid, fac.slider) : 0;
  const zones = FACTION_ZONES[fid] ?? [];
  const sign = fid === 'confederates' ? 1 : -1;
  const pushers = [];
  for (const [id, shift] of Object.entries(tables.buildingShifts ?? {})) if (shift * sign > 0) pushers.push({ kind: 'building', id, shift });
  for (const [id, shift] of Object.entries(tables.techShifts ?? {})) if (shift * sign > 0) pushers.push({ kind: 'tech', id, shift });
  pushers.sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift));
  const effects = zones.map((zone) => ({
    zone,
    active: !locked && fac?.zone === zone,
    mods: Object.entries(tables.zoneModifiers?.[zone] ?? {}).map(([stat, mult]) => ({ stat, mult })),
  }));
  return {
    id: fid, locked, support, dominant: !locked && zones.includes(fac?.zone),
    zone: fac?.zone ?? 'balanced', tension: fac ? Math.max(0, Math.min(100, Number(fac.tension) || 0)) : 0, pushers, effects,
  };
}

// ── Cywilizacja: kronika ─────────────────────────────────────────────────────────────────────────────────────────────

/** Klucz grupy wpisu kroniki: typ kamienia milowego (powtórzenia z cooldownem), awaryjnie nazwa. */
export function historyKey(entry) {
  return String(entry?.type ?? entry?.namePL ?? entry?.nameEN ?? '?');
}

/**
 * Grupowanie powtórzeń kroniki: wpisy tego samego typu → jedna grupa z licznikiem, latami (pierwszy / ostatni) i koloniami.
 * Nazwa i ikona — z najnowszego wpisu. Kolejność: najnowsze na górze (jak dzisiejsza kronika).
 * @param {Array<{year,type,namePL,nameEN,icon,loyaltyPerm,identityValue,colName}>} entries
 * @param {'pl'|'en'} locale
 */
export function historyGroups(entries, locale = 'pl') {
  const en = locale === 'en';
  const map = new Map();
  for (const e of entries ?? []) {
    const key = historyKey(e);
    let g = map.get(key);
    if (!g) {
      g = { key, type: e.type ?? null, count: 0, firstYear: Infinity, lastYear: -Infinity, colonies: [], icon: null, name: '',
        loyaltyPerm: 0, identityValue: 0 };
      map.set(key, g);
    }
    g.count++;
    const y = Number(e.year);
    const yy = Number.isFinite(y) ? y : 0;
    if (yy < g.firstYear) g.firstYear = yy;
    if (yy >= g.lastYear) {
      g.lastYear = yy;
      g.icon = e.icon ?? '•';
      g.name = (en ? (e.nameEN ?? e.namePL) : (e.namePL ?? e.nameEN)) ?? '';
    }
    if (e.colName && !g.colonies.includes(e.colName)) g.colonies.push(e.colName);
    g.loyaltyPerm += Number(e.loyaltyPerm) || 0;
    g.identityValue += Number(e.identityValue) || 0;
  }
  return [...map.values()].sort((a, b) => (b.lastYear - a.lastYear) || a.key.localeCompare(b.key));
}

// ── Cywilizacja: emblemat ────────────────────────────────────────────────────────────────────────────────────────────

/** Ścieżka emblematu gracza (właściciel dostarcza sam: biały znak na przezroczystym tle, 512×512). */
export const EMBLEM_PATH = 'assets/ui/emblems/player.png';

/** Gniazdo emblematu: obraz załadowany → 'image', w przeciwnym razie (brak pliku, błąd, ładowanie, node) → 'name'. */
export function emblemSlot(img) {
  return img && img.complete === true && Number(img.naturalWidth) > 0 && img.failed !== true ? 'image' : 'name';
}

// ── Cywilizacja: wiersze listy ───────────────────────────────────────────────────────────────────────────────────────

/** Rodzaj pozycji z id wiersza: 'empire' | 'leader' | 'colony' | 'faction' | 'history' | null. */
export function civItemKind(id) {
  const s = String(id ?? '');
  if (s === 'empire' || s === 'leader') return s;
  if (s.startsWith('col:')) return 'colony';
  if (s.startsWith('fac:')) return 'faction';
  if (s.startsWith('hist:')) return 'history';
  return null;
}

/**
 * Wiersze listy Cywilizacji (sekcje Imperium / Frakcje / Historia). Kolonie — dzisiejsza kolejność (pełne kolonie po POP malejąco,
 * placówki na końcu); każda niesie `planetId` (strefa `goto_colony`).
 * @param {{ perColony:Array, leaderName:string|null, factions:{slider,locked}|null, groups:Array, activePlanetId }} d
 */
export function civListRows(d, tFn) {
  const rows = [];
  rows.push({ group: true, label: tFn('civConsole.secEmpire') });
  rows.push({ id: 'empire', label: tFn('civConsole.itemOverview') });
  rows.push({ id: 'leader', label: d.leaderName ?? tFn('civConsole.noLeader'), dimmed: !d.leaderName });
  const cols = [...(d.perColony ?? [])].sort((a, b) => {
    if (!!a.isOutpost !== !!b.isOutpost) return a.isOutpost ? 1 : -1;
    return (b.pop ?? 0) - (a.pop ?? 0);
  });
  for (const c of cols) {
    rows.push({ id: `col:${c.planetId}`, planetId: c.planetId, label: c.name, dimmed: !!c.isOutpost,
      active: c.planetId === d.activePlanetId, value: c.isOutpost ? tFn('civConsole.outpostShort') : (c.pop ?? 0).toFixed(1) });
  }
  rows.push({ group: true, label: tFn('civConsole.secFactions') });
  for (const fid of FACTION_IDS) {
    const locked = !d.factions || d.factions.locked === true;
    rows.push({ id: `fac:${fid}`, label: tFn(FACTION_NAME_KEY[fid]), dimmed: locked,
      value: locked ? '—' : `${Math.round(factionSupport(fid, d.factions.slider))}%` });
  }
  rows.push({ group: true, label: tFn('civConsole.secHistory') });
  const groups = d.groups ?? [];
  if (groups.length === 0) rows.push({ id: 'hist:', label: tFn('civOverlay.historyEmpty'), dimmed: true });
  for (const g of groups) {
    rows.push({ id: `hist:${g.key}`, label: `${g.icon ?? '•'} ${g.name}`, value: g.count > 1 ? `×${g.count}` : String(g.lastYear) });
  }
  return rows;
}

/**
 * Tabela «Kolonie i placówki» w inspektorze przeglądu imperium: każda kolonia i placówka gracza (kolumny dzisiejszej tabeli kolonii,
 * Kr/rok zamiast stanu kredytów). Kolejność jak lista: pełne kolonie po POP malejąco, placówki na końcu.
 * @param {Array} perColony — `_gatherData().perColony`
 * @param {Object<string,number>} krYearById — planetId → Kr/rok kolonii (`col.creditsPerYear`)
 */
export function colonyTableRows(perColony, krYearById = {}) {
  return [...(perColony ?? [])].sort((a, b) => {
    if (!!a.isOutpost !== !!b.isOutpost) return a.isOutpost ? 1 : -1;
    return (b.pop ?? 0) - (a.pop ?? 0);
  }).map((c) => ({
    planetId: c.planetId, name: c.name, kind: c.isOutpost ? 'outpost' : 'colony',
    pop: c.isOutpost ? null : (c.pop ?? 0), prosperity: c.isOutpost ? null : (c.prosperity ?? 0),
    krYear: Number(krYearById[c.planetId]) || 0, ships: c.fleetCount ?? 0, buildings: c.buildings ?? 0,
  }));
}

// ── Sfera Dysona: stany ──────────────────────────────────────────────────────────────────────────────────────────────

/** Technologia odblokowująca fazę (faza I — Inżynieria Sfery Dysona, bez pola w danych). */
export function phaseTech(phase) { return phase?.requiresTech ?? 'dyson_engineering'; }

/**
 * Stan segmentu: 'built' (ukończony) | 'current' (otwarty na dostawy) | 'locked' (faza zablokowana albo brak technologii segmentu).
 * @param {number} segId
 * @param {{active,unlockedPhases,segments}|null} st — DysonSystem.getState()
 * @param {(techId:string)=>boolean} [isResearched]
 */
export function segmentState(segId, st, isResearched = () => false) {
  const seg = st?.segments?.[segId];
  if (seg?.completed) return 'built';
  if (!st?.active) return 'locked';
  const phaseId = SEGMENT_TO_PHASE[segId];
  if (!(st.unlockedPhases ?? []).includes(phaseId)) return 'locked';
  const req = DYSON_SEGMENTS[segId]?.requiresTech;
  if (req && !isResearched(req)) return 'locked';
  return 'current';
}

/** Stan fazy: 'done' (wszystkie segmenty) | 'current' (odblokowana, niedokończona) | 'locked'. */
export function phaseState(phase, st) {
  const segs = phase?.segments ?? [];
  if (segs.length > 0 && segs.every((s) => st?.segments?.[s]?.completed)) return 'done';
  if (st?.active && (st.unlockedPhases ?? []).includes(phase.id)) return 'current';
  return 'locked';
}

/** Bieżąca faza: pierwsza niedokończona odblokowana; wszystkie gotowe → ostatnia; nic odblokowane → null. Zwraca {phase, index}. */
export function currentPhase(st) {
  let lastDone = null;
  for (let i = 0; i < DYSON_PHASES.length; i++) {
    const s = phaseState(DYSON_PHASES[i], st);
    if (s === 'current') return { phase: DYSON_PHASES[i], index: i };
    if (s === 'done') lastDone = { phase: DYSON_PHASES[i], index: i };
  }
  if (lastDone && DYSON_PHASES.every((p) => phaseState(p, st) === 'done')) return lastDone;
  return null;
}

/** Postęp całości: ukończone segmenty i ułamek dostaw (średnia postępów segmentów 0..1). */
export function overallProgress(st) {
  const ids = Object.keys(DYSON_SEGMENTS);
  let sum = 0, built = 0;
  for (const id of ids) {
    const s = st?.segments?.[id];
    if (s?.completed) { built++; sum += 1; } else sum += Math.max(0, Math.min(1, Number(s?.progress) || 0));
  }
  return { built, total: ids.length, frac: ids.length ? sum / ids.length : 0 };
}

/**
 * Wiersze kosztu segmentu: potrzeba (efektywna — `ceil(koszt × mnożnik)`, ten sam wzór co DysonSystem) vs dostarczone vs magazyn
 * planety domowej. `short` = brakuje w magazynie do pełnej reszty; `none` = w magazynie zero, a reszta > 0.
 */
export function segmentCostRows(segId, st, costMult = 1, stockOf = () => 0) {
  const def = DYSON_SEGMENTS[segId];
  const seg = st?.segments?.[segId];
  if (!def) return [];
  return Object.entries(def.cost).map(([res, base]) => {
    const need = Math.ceil(base * costMult);
    const delivered = Math.min(need, Number(seg?.delivered?.[res]) || 0);
    const remaining = Math.max(0, need - delivered);
    const stock = Math.max(0, Number(stockOf(res)) || 0);
    return { res, need, delivered, remaining, stock, short: remaining > 0 && stock < remaining, none: remaining > 0 && stock <= 0 };
  });
}

// Powód silnika (DysonSystem.canDeliver / deliver) → klucz i18n z tym, co zrobić
export const DELIVER_REASON_KEY = Object.freeze({
  notUnlocked: 'civConsole.dyReasonNotUnlocked',
  invalidSegment: 'civConsole.dyReasonInvalid',
  alreadyCompleted: 'civConsole.dyReasonCompleted',
  phaseNotUnlocked: 'civConsole.dyReasonPhaseLocked',
  segmentTechRequired: 'civConsole.dyReasonSegmentTech',
  noResourceSystem: 'civConsole.dyReasonNoHome',
  nothingToDeliver: 'civConsole.dyReasonNoStock',
  noSelection: 'civConsole.dyReasonSelect',
});

/**
 * Bramka [ DOSTARCZ ]: wynik `canDeliver` silnika + magazyn (silnik odrzuca `nothingToDeliver`, gdy żaden brakujący surowiec nie
 * leży w magazynie — dziś po cichu). Zwraca `{ ok, reason, reasonKey, tech? }`.
 */
export function deliverGate(segId, can, costRows) {
  if (segId == null) return { ok: false, reason: 'noSelection', reasonKey: DELIVER_REASON_KEY.noSelection };
  if (!can?.ok) {
    const reason = can?.reason ?? 'notUnlocked';
    return { ok: false, reason, reasonKey: DELIVER_REASON_KEY[reason] ?? DELIVER_REASON_KEY.notUnlocked, tech: can?.tech ?? null };
  }
  const any = (costRows ?? []).some((r) => r.remaining > 0 && r.stock > 0);
  if (!any) return { ok: false, reason: 'nothingToDeliver', reasonKey: DELIVER_REASON_KEY.nothingToDeliver };
  return { ok: true, reason: null, reasonKey: null };
}

/**
 * Ścieżka końca gry: Faza I → II → III → IV → Brama Skoku (technologia) → decyzja końcowa. Każdy krok: 'done' | 'current' | 'todo';
 * `current` = pierwszy niezrobiony (tu jest gracz). Koniec gry = 20/20 segmentów + Konstrukcja Bramy Skoku (GameScene._triggerEndgame).
 */
export function endgamePath(st, jumpGateResearched) {
  const steps = DYSON_PHASES.map((p) => ({ id: p.id, kind: 'phase', phase: p, done: phaseState(p, st) === 'done',
    built: p.segments.filter((s) => st?.segments?.[s]?.completed).length, total: p.segments.length }));
  steps.push({ id: 'jump_gate', kind: 'tech', done: !!jumpGateResearched });
  const all = steps.every((s) => s.done);
  steps.push({ id: 'ending', kind: 'ending', done: all });
  let cur = false;
  for (const s of steps) {
    if (s.done) s.status = 'done';
    else if (!cur) { s.status = 'current'; cur = true; } else s.status = 'todo';
  }
  return steps;
}

/** Wiersze listy Dysona: fazy (nagłówki grup) → segmenty (wszystkie 20, także zablokowane — wybór pokazuje, czemu). */
export function dysonListRows(st, tFn, locale = 'pl', isResearched = () => false) {
  const en = locale === 'en';
  const rows = [];
  DYSON_PHASES.forEach((p, i) => {
    const built = p.segments.filter((s) => st?.segments?.[s]?.completed).length;
    rows.push({ group: true, label: `${tFn(`civConsole.phaseN${i + 1}`)} · ${en ? p.nameEN : p.namePL} · ${built}/${p.segments.length}` });
    for (const segId of p.segments) {
      const def = DYSON_SEGMENTS[segId];
      const state = segmentState(segId, st, isResearched);
      const prog = Math.round((Number(st?.segments?.[segId]?.progress) || 0) * 100);
      rows.push({ id: segId, segId, state, label: `${segId}. ${en ? def.nameEN : def.namePL}`, dimmed: state === 'locked',
        value: state === 'built' ? '✓' : state === 'locked' ? '🔒' : `${prog}%` });
    }
  });
  return rows;
}

/**
 * Geometria pierścienia bohatera: 20 łuków w 4 fazach, start u góry, zgodnie z ruchem wskazówek. Kąty w radianach.
 * @returns {Array<{segId, phaseIdx, a0, a1, mid}>}
 */
export function ringArcs(phaseGap = 0.10, segGap = 0.025) {
  const n = Object.keys(DYSON_SEGMENTS).length;
  const usable = 2 * Math.PI - DYSON_PHASES.length * phaseGap;
  const per = usable / n;
  const out = [];
  let a = -Math.PI / 2 + phaseGap / 2;
  DYSON_PHASES.forEach((p, pi) => {
    for (const segId of p.segments) {
      out.push({ segId, phaseIdx: pi, a0: a + segGap / 2, a1: a + per - segGap / 2, mid: a + per / 2 });
      a += per;
    }
    a += phaseGap;
  });
  return out;
}
