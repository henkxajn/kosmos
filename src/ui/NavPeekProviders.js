// NavPeekProviders — model danych karty "peek" dla każdej z 7 grup nav (wersja bogata).
//
// Czyta ŻYWE dane z window.KOSMOS i buduje listę wierszy. Reguły MGŁY WOJNY wbudowane u źródła:
// wyłącznie getPlayerColonies()/getActiveColony() (NIGDY getAllColonies), wrogowie intel-gated.
// Wszystko guardowane ?. — przed civMode systemy bywają undefined.
//
// Zwraca: { rows: [row], alert: {text,tone}|null } | null.
//   row = { kind?, label, value?, tone?, bar? }  gdzie kind ∈ 'head' | 'alert' | undefined(=kv)
//   tone ∈ 'normal'|'good'|'bad'|'warn'|'accent'|'dim'. bar = { frac:0..1, tone }.
//   .alert = najważniejszy alert domeny (do pasywnego badge na slocie).

import { t, getName, getShort, getLocale } from '../i18n/i18n.js';
import { TECHS } from '../data/TechData.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { getOrderTargetInfo } from './OrderTargetInfo.js';
import { fmtInt, fmtDec, fmtSigned, fmtPeople, fmtPct } from './NavPeekCardLogic.js';

// ── Skróty ───────────────────────────────────────────────────────────────────
const K = () => window.KOSMOS || {};
const L = () => getLocale();
const _playerColonies = () => K().colonyManager?.getPlayerColonies?.() ?? [];
const _fullColonies   = () => _playerColonies().filter(c => !c.isOutpost);
const _sum = (arr, fn) => arr.reduce((s, x) => s + (fn(x) || 0), 0);
const _signTone = (n) => (n > 0 ? 'good' : n < 0 ? 'bad' : 'normal');
const _cut = (s, n = 14) => (s == null ? '' : String(s)).slice(0, n);

// ── Konstruktory wierszy ──────────────────────────────────────────────────────
const kv    = (label, value, tone = 'normal', bar) => ({ label, value, tone, bar });
const head  = (label) => ({ kind: 'head', label });
const alert = (label, tone = 'bad') => ({ kind: 'alert', label, tone });

// id ciała/stacji/kolonii → nazwa (kanon resolvera z VesselManager/FleetManagerOverlay).
function _bodyName(id) {
  if (!id) return '???';
  const e = K().entityManager?.get?.(id);
  if (e?.name) return e.name;
  const c = K().colonyManager?.getColony?.(id);
  return c?.name ?? id;
}

// typ misji → etykieta i18n (fallback = surowy typ gdy brak klucza).
function _missionLabel(type) {
  if (!type) return '—';
  const MAP = { recon: 'Recon', survey: 'Survey', deep_scan: 'DeepScan', mining: 'Mining',
    colony: 'Colony', transport: 'Transport', transit: 'Transit', foreign_recon: 'ForeignRecon',
    exploration: 'Exploration', interstellar_jump: 'Interstellar' };
  const suf = MAP[type];
  if (!suf) return type;
  const key = 'fleet.missionType' + suf;
  const v = t(key);
  return v === key ? type : v;
}

// Kryzys pojedynczej kolonii (głód / brak wody / brak energii / niepokój) lub null.
function _colonyCrisis(c) {
  const civ = c.civSystem, rs = c.resourceSystem;
  if (civ?.isFamine) return { text: t('navPeek.crisis.famine'), tone: 'bad' };
  const waterNet = rs?.getPerYear?.('water');
  if (waterNet != null && waterNet < 0 && (rs?.getAmount?.('water') ?? 0) < (civ?.population ?? 0)) {
    return { text: t('navPeek.crisis.water'), tone: 'bad' };
  }
  if (rs?.energy?.brownout) return { text: t('navPeek.crisis.energy'), tone: 'warn' };
  if (civ?.isUnrest) return { text: t('navPeek.crisis.unrest'), tone: 'warn' };
  return null;
}

// ── Router ─────────────────────────────────────────────────────────────────
export function getPeekData(groupId) {
  if (!window.KOSMOS?.civMode) return null;
  switch (groupId) {
    case 'civilization': return _civilization();
    case 'economy':      return _economy();
    case 'colony':       return _colony();
    case 'population':    return _population();
    case 'diplomacy':    return _diplomacy();
    case 'fleet':        return _fleet();
    case 'tech':         return _tech();
    default:             return null;
  }
}

/** Tylko alert (do pasywnych badge na slotach). */
export function getPeekAlert(groupId) {
  return getPeekData(groupId)?.alert ?? null;
}

// ── 🏛 Cywilizacja — POP imperium, kolonie, POP/wolne/przyrost per kolonia + alerty ──
function _civilization() {
  const cols = _playerColonies(), full = _fullColonies(), loc = L();
  const totalPop = _sum(cols, c => c.civSystem?.population);
  const out = cols.length - full.length;
  const rows = [
    kv(t('navPeek.civ.pop'), fmtDec(totalPop, 1, loc) + ' POP', 'accent'),
    kv(t('navPeek.civ.colonies'), `${full.length}` + (out ? ` (+${out})` : ''), 'normal'),
  ];
  const shown = full.slice(0, 5);
  if (shown.length) rows.push(head(t('navPeek.civ.perColony')));
  let crisisCount = 0;
  for (const c of full) if (_colonyCrisis(c)) crisisCount++;
  for (const c of shown) {
    const civ = c.civSystem;
    const pop = civ?.population ?? 0, free = civ?.freePops ?? 0, growth = civ?.populationGrowthRate ?? 0;
    rows.push(kv(_cut(c.name, 12), `${fmtDec(pop, 0, loc)}P · ${fmtDec(free, 1, loc)}fr · +${fmtPeople(growth, loc)}`, 'normal'));
    const crisis = _colonyCrisis(c);
    if (crisis) rows.push(alert(`${_cut(c.name, 10)}: ${crisis.text}`, crisis.tone));
  }
  if (full.length > shown.length) rows.push(head(t('navPeek.more', full.length - shown.length)));
  const alertObj = crisisCount > 0 ? { text: t('navPeek.civ.alertCrisis', crisisCount), tone: 'bad' } : null;
  return { rows, alert: alertObj };
}

// ── ⚙ Gospodarka/Produkcja — fabryki, kredyty, top produkcja (rok), alerty ──
function _economy() {
  const cols = _playerColonies(), full = _fullColonies(), loc = L();
  const cm = K().colonyManager;
  let used = 0, total = 0;
  for (const c of cols) { const fs = c.factorySystem; if (fs) { used += fs.usedPoints ?? 0; total += fs.totalPoints ?? 0; } }
  const treasury  = _sum(cols, c => c.credits);
  const tradeFlow = _sum(cols, c => c.creditsPerYear);
  const tax = cm?.calculateTaxIncome ? _sum(full, c => cm.calculateTaxIncome(c)) : 0;
  const fleetUp = K().vesselManager?.getTotalFleetUpkeep?.() ?? 0;
  const net = tradeFlow + tax - fleetUp;
  const brownout = cols.some(c => c.resourceSystem?.energy?.brownout);

  const rows = [
    kv(t('navPeek.eco.factories'), `${used}/${total} FP`, 'normal', { frac: total > 0 ? used / total : 0, tone: 'good' }),
    kv(t('navPeek.eco.treasury'), fmtInt(treasury, loc) + ' Kr', 'accent'),
    kv(t('navPeek.eco.balance'), fmtSigned(net, 1, loc) + t('navPeek.unit.krPerYear'), _signTone(net)),
  ];

  // Top produkcja — ostatni ZAKOŃCZONY rok gry (stabilny), fallback rok bieżący.
  const buckets = K().economyHistoryLog?.getYearlyHistory?.(3) ?? [];
  let bucket = null;
  for (let i = buckets.length - 1; i >= 0; i--) { if (!buckets[i].current) { bucket = buckets[i]; break; } }
  if (!bucket) bucket = buckets.length ? buckets[buckets.length - 1] : null;
  const produced = bucket?.produced ?? {};
  const top5 = Object.entries(produced).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (top5.length) {
    rows.push(head(t('navPeek.eco.production')));
    for (const [id, amt] of top5) rows.push(kv(getShort(id), fmtInt(amt, loc), 'normal'));
  }

  let alertObj = null;
  if (net < 0) alertObj = { text: t('navPeek.eco.alertDeficit'), tone: 'bad' };
  else if (brownout) alertObj = { text: t('navPeek.eco.alertBrownout'), tone: 'warn' };
  return { rows, alert: alertObj };
}

// ── 🏠 Kolonie — liczba + lista z wolne/wszystkie POP ──
function _colony() {
  const cols = _playerColonies(), loc = L();
  const rows = [kv(t('navPeek.col.count'), `${cols.length}`, 'accent')];
  const shown = cols.slice(0, 6);
  if (shown.length) rows.push(head(t('navPeek.col.list')));
  for (const c of shown) {
    if (c.isOutpost) { rows.push(kv(_cut(c.name, 14), t('navPeek.col.outpost'), 'dim')); continue; }
    const pop = c.civSystem?.population ?? 0, free = c.civSystem?.freePops ?? 0;
    rows.push(kv(_cut(c.name, 14), `${fmtDec(free, 1, loc)}/${fmtDec(pop, 0, loc)} POP`, 'normal',
      { frac: pop > 0 ? free / pop : 0, tone: 'accent' }));
  }
  if (cols.length > shown.length) rows.push(head(t('navPeek.more', cols.length - shown.length)));
  const crises = _fullColonies().filter(c => _colonyCrisis(c)).length;
  return { rows, alert: crises > 0 ? { text: t('navPeek.civ.alertCrisis', crises), tone: 'bad' } : null };
}

// ── 👤 Populacja — per kolonia: dobrobyt, zaludnienie, zadowolenie, dobra kons. ──
function _population() {
  const full = _fullColonies(), loc = L();
  const rows = [];
  const shown = full.slice(0, 3);
  let firstCrisis = null;
  for (const c of shown) {
    const civ = c.civSystem, ps = c.prosperitySystem;
    const loyalty = Math.round(civ?.loyalty ?? 80);
    rows.push(head(`${_cut(c.name, 12)} · ${loyalty}%`));
    // Dobrobyt
    const pros = Math.round(ps?.prosperity ?? 50);
    const prosTone = pros > 60 ? 'good' : pros > 30 ? 'warn' : 'bad';
    rows.push(kv(t('navPeek.pop.welfare'), `${pros}/100`, prosTone, { frac: pros / 100, tone: prosTone }));
    // Zaludnienie
    const pop = civ?.population ?? 0, eh = civ?.effectiveHousing;
    const inf = eh === Infinity;
    rows.push(kv(t('navPeek.pop.housing'), `${fmtDec(pop, 0, loc)}/${inf ? '∞' : fmtDec(eh ?? 0, 0, loc)} POP`, 'normal',
      inf ? undefined : { frac: eh > 0 ? pop / eh : 0, tone: 'accent' }));
    // Dobra konsumpcyjne — pokrycie (satysfakcja) uśrednione po odblokowanych dobrach
    const cov = _consumerCoverage(ps);
    const covPct = Math.round(cov * 100);
    const covTone = covPct >= 80 ? 'good' : covPct >= 40 ? 'warn' : 'bad';
    rows.push(kv(t('navPeek.pop.consumer'), `${covPct}%`, covTone, { frac: cov, tone: covTone }));
    if (!firstCrisis) firstCrisis = _colonyCrisis(c);
  }
  if (full.length > shown.length) rows.push(head(t('navPeek.more', full.length - shown.length)));
  if (!rows.length) rows.push(kv(t('navPeek.col.none'), '', 'dim'));
  return { rows, alert: firstCrisis ? { text: firstCrisis.text, tone: firstCrisis.tone } : null };
}

// Pokrycie dóbr konsumpcyjnych (0..1) — średnia getSatisfaction po odblokowanych dobrach epoki.
function _consumerCoverage(ps) {
  if (!ps?.getSatisfaction) return 0;
  const GOODS = ['basic_supplies', 'civilian_goods', 'neurostimulants'];
  let unlocked = GOODS;
  try { const e = ps._getCurrentEpoch?.(); if (e?.unlockedGoods) unlocked = GOODS.filter(g => e.unlockedGoods.includes(g)); } catch (_) {}
  if (!unlocked.length) return 0;
  let s = 0; for (const g of unlocked) s += ps.getSatisfaction(g) ?? 0;
  return s / unlocked.length;
}

// ── 🤝 Dyplomacja — bez zmian (agregaty z mgłą wojny) ──
function _diplomacy() {
  const dip = K().diplomacySystem, intel = K().intelSystem, war = K().warSystem;
  const wars = war?.listActive?.() ?? [];
  const visible = dip?.listVisible?.() ?? [];
  const known = intel?.listKnown?.() ?? [];
  const contactCount = intel?.isAtLeast ? known.filter(e => intel.isAtLeast(e.empireId, 'contact')).length : 0;
  const maxHost = visible.length ? Math.round(Math.max(0, ...visible.map(r => r.hostility ?? 0))) : 0;
  const treaties = visible.reduce((n, r) => n + (r.treaties?.length ?? 0), 0);
  const alliances = visible.filter(r => (r.treaties ?? []).some(tr => tr.id === 'alliance')).length;
  const ultimatum = visible.some(r => r.ultimatumStartYear != null);
  const hostTone = maxHost >= 60 ? 'bad' : maxHost >= 40 ? 'warn' : 'normal';
  const rows = [
    kv(t('navPeek.dip.wars'), `${wars.length}`, wars.length ? 'bad' : 'good'),
    kv(t('navPeek.dip.hostility'), visible.length ? `${maxHost}/100` : '—', hostTone,
      visible.length ? { frac: maxHost / 100, tone: hostTone } : undefined),
    kv(t('navPeek.dip.known'), `${known.length}` + (contactCount ? ` (${t('navPeek.dip.contact', contactCount)})` : ''), 'normal'),
    kv(t('navPeek.dip.treaties'), `${treaties}` + (alliances ? ` (${t('navPeek.dip.ally', alliances)})` : ''), 'normal'),
  ];
  let alertObj = null;
  if (wars.length) alertObj = { text: t('navPeek.dip.alertWar'), tone: 'bad' };
  else if (ultimatum) alertObj = { text: t('navPeek.dip.alertUltimatum'), tone: 'bad' };
  else if (maxHost >= 60) alertObj = { text: t('navPeek.dip.alertTension'), tone: 'warn' };
  return { rows, alert: alertObj };
}

// ── 🚀 Flota — liczba, zadokowane+gdzie, w locie+dokąd+misja, orbitujące ──
function _fleet() {
  const vm = K().vesselManager, loc = L();
  const all = vm?.getAllVessels?.() ?? [];
  const own = all.filter(v => !isEnemyVessel(v) && !v.isWreck);
  const wrecks = all.filter(v => !isEnemyVessel(v) && v.isWreck).length;
  const docked = own.filter(v => v.position?.state === 'docked');
  const inTransit = own.filter(v => v.position?.state === 'in_transit');
  const orbiting = own.filter(v => v.position?.state === 'orbiting');

  const rows = [kv(t('navPeek.fleet.ships'), `${own.length}` + (wrecks ? ` (${t('navPeek.fleet.wrecks', wrecks)})` : ''), 'accent')];

  // Zadokowane — grupowane po lokacji
  if (docked.length) {
    rows.push(head(t('navPeek.fleet.docked', docked.length)));
    const byLoc = new Map();
    for (const v of docked) { const l = _bodyName(v.position.dockedAt); byLoc.set(l, (byLoc.get(l) ?? 0) + 1); }
    let n = 0;
    for (const [locName, count] of byLoc) { if (n++ >= 4) break; rows.push(kv(_cut(locName, 16), `${count}`, 'normal')); }
  }

  // W locie — cel + misja (lub rozkaz bojowy z mgłą wojny)
  if (inTransit.length) {
    rows.push(head(t('navPeek.fleet.inFlight', inTransit.length)));
    for (const v of inTransit.slice(0, 5)) {
      const mo = v.movementOrder;
      const combat = mo && mo.status === 'active' && (mo.type === 'engage' || mo.type === 'pursue' || mo.type === 'intercept');
      let value, tone = 'normal';
      if (combat) {
        let info = null; try { info = getOrderTargetInfo(v); } catch (_) {}
        value = `${info?.icon ?? '⚔'} ${_cut(info?.name ?? '—', 12)}`;
        tone = 'bad';
      } else {
        const m = v.mission;
        const returning = m?.phase === 'returning';
        const dest = returning ? _bodyName(v.homeColonyId ?? v.colonyId) : (m?.targetName ?? _bodyName(m?.targetId));
        const lbl = returning ? t('navPeek.fleet.returning') : _missionLabel(m?.type);
        value = `${lbl}→${_cut(dest, 10)}`;
      }
      rows.push(kv(_cut(v.name, 12), value, tone));
    }
  }

  // Orbitujące (czekają na rozkaz)
  if (orbiting.length) {
    rows.push(head(t('navPeek.fleet.orbiting', orbiting.length)));
    for (const v of orbiting.slice(0, 3)) rows.push(kv(_cut(v.name, 12), _cut(_bodyName(v.position?.dockedAt), 12), 'dim'));
  }

  const immob = own.filter(v => vm?.isImmobilized?.(v)).length;
  return { rows, alert: immob > 0 ? { text: t('navPeek.fleet.alertImmobilized', immob), tone: 'bad' } : null };
}

// ── 🧬 Technologie + Obserwatorium (co skanuje + ETA) ──
function _tech() {
  const rs = K().researchSystem, ts = K().techSystem, obs = K().observatorySystem, loc = L();
  const active = rs?.activeResearch?.[0] ?? null;
  const techId = active?.techId ?? null;
  const name = techId && TECHS[techId] ? getName(TECHS[techId], 'tech') : t('navPeek.tech.noResearch');
  const prog = techId ? (rs?.getProgress?.(techId) ?? 0) : 0;
  const rate = rs?.getTotalRate?.() ?? 0;
  const slotsUsed = rs?.activeResearch?.length ?? 0;
  const maxSlots = rs?.getMaxSlots?.() ?? 1;
  const year = K().timeSystem?.gameTime ?? 0;
  const etaAbs = techId ? rs?.getETA?.(year, techId) : null;
  const etaRem = (etaAbs != null && isFinite(etaAbs)) ? Math.max(0, Math.ceil(etaAbs - year)) : null;
  const researched = ts?._researched?.size ?? 0;
  const totalTechs = Object.keys(TECHS).length;
  const obsLvl = obs?.getMaxObservatoryLevel?.() ?? 0;

  const rows = [
    kv(_cut(name, 16), techId ? fmtPct(prog) : '—', techId ? 'accent' : 'warn',
      techId ? { frac: prog, tone: 'accent' } : undefined),
    kv(t('navPeek.tech.rateEta'), `${fmtDec(rate, 1, loc)}${t('navPeek.unit.perYear')} · ${etaRem != null ? t('navPeek.tech.years', etaRem) : '—'}`, 'normal'),
    kv(t('navPeek.tech.slots'), `${slotsUsed}/${maxSlots} · ${researched}/${totalTechs}`, 'normal'),
    kv(t('navPeek.tech.observatory'), obsLvl > 0 ? `Lv${obsLvl}` : '—', 'dim'),
  ];

  // Aktywne skany obserwatorium — co skanuje + postęp + ETA
  const scans = obs?.getActiveBodyScans?.() ?? [];
  if (scans.length) {
    rows.push(head(t('navPeek.tech.scanning')));
    for (const s of scans.slice(0, 3)) {
      const nm = _bodyName(s.bodyId);
      const pct = Math.round((s.pct ?? 0) * 100);
      const remGame = Math.max(0, (s.durationYears ?? 0) - (s.progress ?? 0)) / 12;
      const eta = remGame >= 0.1 ? ` · ${t('navPeek.tech.years', Math.ceil(remGame))}` : '';
      rows.push(kv(_cut(nm, 12), `${pct}%${eta}`, 'normal', { frac: s.pct ?? 0, tone: 'accent' }));
    }
  }

  const alertObj = (rate > 0 && slotsUsed === 0) ? { text: t('navPeek.tech.alertWaste'), tone: 'warn' } : null;
  return { rows, alert: alertObj };
}
