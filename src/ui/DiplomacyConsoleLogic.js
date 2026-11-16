// DiplomacyConsoleLogic — czysta logika konsoli Dyplomacji (ARC KONSOLE K2, docs/design/CONSOLES_PLAN.md §1.2).
//
// Zasady:
//  • lista — DZISIEJSZY zbiór i kolejność Dyplomacji (relacje z wywiadem ≥ `rumor`, napięcie malejąco); treść wiersza i mgła —
//    wspólne `EmpireListLogic.empireRowView` (te same reguły co Wywiad, bez forka);
//  • akcje — LUSTRO reguł `DiplomacyOverlay._drawRight` (te same warunki włączenia, te same typy stref i dane); powód wyłączenia
//    to tekst podpowiedzi, nie nowa reguła;
//  • Finding 724 — postawa AI (`fsm.state`) i klucze zdarzeń pamięci idą przez etykiety i18n; nieznany przyszły klucz → czytelna
//    etykieta ogólna, nigdy surowe id.
//
// Bez DOM i canvas — testowalne pod node (keeper `console_diplomacy_smoke.mjs`).

import { intelRank, INTEL_LEVEL_RANK } from './EmpireListLogic.js';

/** Finding 724 — etykiety stanów automatu AI (`AlienCivSystem.STATES`). */
export const STANCE_LABEL_KEY = Object.freeze({
  IDLE:        'diplo.stance.idle',
  EXPANDING:   'diplo.stance.expanding',
  REARMING:    'diplo.stance.rearming',
  AGGRESSIVE:  'diplo.stance.aggressive',
  WAR:         'diplo.stance.war',
  RETREAT:     'diplo.stance.retreat',
  NEGOTIATING: 'diplo.stance.negotiating',
});
export const STANCE_FALLBACK_KEY = 'diplo.stance.unknown';

/**
 * Finding 724 — etykiety typów pamięci relacji: wszyscy producenci `addMemory` w `src/` (DiplomacySystem, WarSystem, Director)
 * i katalog `AcceptanceWeightData.INCIDENT_CHANNELS` (stan na K2; keeper pilnuje kompletności).
 */
export const MEMORY_LABEL_KEY = Object.freeze({
  border_pressure:       'diplo.memEvent.borderPressure',
  first_contact_kill:    'diplo.memEvent.firstContactKill',
  military_presence:     'diplo.memEvent.militaryPresence',
  peace_offered:         'diplo.memEvent.peaceOffered',
  peace_refused:         'diplo.memEvent.peaceRefused',
  research_intrusion:    'diplo.memEvent.researchIntrusion',
  skirmish:              'diplo.memEvent.skirmish',
  surveillance_scan:     'diplo.memEvent.surveillanceScan',
  territorial_violation: 'diplo.memEvent.territorialViolation',
  trespassing:           'diplo.memEvent.trespassing',
  ultimatum_issued:      'diplo.memEvent.ultimatumIssued',
  war_declared:          'diplo.memEvent.warDeclared',
  warning_issued:        'diplo.memEvent.warningIssued',
});
export const MEMORY_FALLBACK_KEY = 'diplo.memEvent.unknown';

export function stanceLabelKey(state) { return STANCE_LABEL_KEY[state] ?? STANCE_FALLBACK_KEY; }
export function memoryLabelKey(type) { return MEMORY_LABEL_KEY[type] ?? MEMORY_FALLBACK_KEY; }

// Limity jak dziś (prawa kolumna DiplomacyOverlay): rozbicie TOP 5 + wiersz „+ N więcej”, pamięć — 3 najnowsze.
export const DIPLO_CONSOLE = Object.freeze({ MAX_BREAKDOWN_ROWS: 5, MEMORY_ROWS: 3 });

/**
 * Wpisy listy — dzisiejsza Dyplomacja: relacje z wywiadem ≥ `rumor` (bez systemu wywiadu — wszystkie), napięcie malejąco
 * (sortowanie stabilne, jak `Array.sort` dziś).
 * @param {Array<{empireId:string,tension?:number}>} relations
 * @param {((id:string)=>string)|null} levelOf — poziom wywiadu imperium; null = brak systemu wywiadu
 */
export function diplomacyEntries(relations, levelOf) {
  return (relations ?? [])
    .filter((r) => !levelOf || intelRank(levelOf(r.empireId)) >= INTEL_LEVEL_RANK.rumor)
    .sort((a, b) => (b.tension ?? 0) - (a.tension ?? 0));
}

/** Status relacji (dziś: peace | truce | war; rozejm z licznikiem lat) + sojusz (traktat). Ton — rola palety. */
export function relationStatusView(rel, { alliance = false } = {}) {
  const status = rel?.status ?? 'peace';
  const truceLeft = rel?.truceYearsLeft ?? 0;
  const truceYears = status === 'truce' && truceLeft > 0 ? truceLeft.toFixed(0) : null;
  return {
    status,
    key: truceYears != null ? 'diplo.truceYearsLeft' : (`diplo.state.${status}`),
    args: truceYears != null ? [truceYears] : [],
    tone: status === 'war' ? 'alert' : status === 'truce' ? 'dim' : 'primary',
    alliance: !!alliance,
  };
}

/** Pozycja na skali −100…+100 → 0…1 (opinia); 0…100 → 0…1 (napięcie). Wejście nie-liczbowe → środek / zero. */
export function opinionFrac(op) { return (Math.max(-100, Math.min(100, Number(op) || 0)) + 100) / 200; }
export function tensionFrac(ten) { return Math.max(0, Math.min(100, Number(ten) || 0)) / 100; }
/** Ton liczby opinii (role): dodatnia primary, ujemna alert, zero dim. */
export function opinionTone(op) { const v = Math.round(Number(op) || 0); return v > 0 ? 'primary' : v < 0 ? 'alert' : 'dim'; }
/** Ton napięcia (role) — drabina 40/60 jak dziś (zielony / żółty / czerwony → primary / dim / alert). */
export function tensionTone(ten) { const v = Number(ten) || 0; return v >= 60 ? 'alert' : v >= 40 ? 'dim' : 'primary'; }

/**
 * Akcje relacji — LUSTRO `DiplomacyOverlay._drawRight` (wiersze 1–3, kolejność slotów jak dziś). Każda pozycja: `type` = typ
 * strefy trafienia (`declare_war`, `offer_peace`, `send_envoy`, `propose_trade` | `toggle_auto_trade`, `propose_pact` |
 * `renew_pact`, `propose_alliance`), `label`, `enabled`, `tone` ('danger' | 'primary'), `reason` (tekst podpowiedzi wyłączonej).
 * @param {{ empireId:string, rel:object, isContact:boolean, hasEnvoyVessel:boolean, hasTreaty:(id:string)=>boolean,
 *           canRenewPact:boolean, pactLeft:number|null, pactRefusalLeft:number, napWindowYears:number,
 *           autoTradeOn:boolean }} p
 * @param {(key:string, ...args)=>string} t
 */
export function diplomacyActions(p, t) {
  const { empireId, rel, isContact } = p;
  const notWar = rel?.status !== 'war';
  const inTruce = rel?.status === 'truce';
  const truceLeftYears = Math.max(1, Math.ceil(Number(rel?.truceYearsLeft) || 0));
  const noContact = t('diplo.reason.noContact');
  const data = { empireId };
  const out = [];

  // Wiersz 1: wojna / pokój
  const canWar = notWar && isContact && !inTruce;
  out.push({ type: 'declare_war', tone: 'danger', enabled: canWar, data,
    label: inTruce ? t('diplo.btn.declareWarTruce', truceLeftYears) : t('diplo.btn.declareWar'),
    reason: canWar ? null : !isContact ? noContact : !notWar ? t('diplo.reject.atWar') : t('diplo.reject.truceHolds', truceLeftYears) });
  const canPeace = rel?.status === 'war' && isContact;
  out.push({ type: 'offer_peace', tone: 'primary', enabled: canPeace, data, label: t('diplo.btn.offerPeace'),
    reason: canPeace ? null : !isContact ? noContact : t('diplo.reject.notAtWar') });

  // Wiersz 2: emisariusz / umowa handlowa (gdy stoi — przełącznik auto-handlu)
  const canEnvoy = isContact && !!p.hasEnvoyVessel;
  out.push({ type: 'send_envoy', tone: 'primary', enabled: canEnvoy, data, label: t('diplo.btn.envoy'),
    reason: canEnvoy ? null : !isContact ? noContact : t('diplo.reason.noEnvoy') });
  const proposeReason = (treatyId) => (!isContact ? noContact : !notWar ? t('diplo.reject.atWar')
    : p.hasTreaty(treatyId) ? t('diplo.reject.alreadySigned') : null);
  const canPropose = (treatyId) => isContact && notWar && !p.hasTreaty(treatyId);
  if (p.hasTreaty('trade_agreement')) {
    const on = p.autoTradeOn !== false;
    out.push({ type: 'toggle_auto_trade', tone: on ? 'primary' : 'danger', enabled: true, data, reason: null,
      label: `${t('market.autoTrade')}: ${on ? t('market.on') : t('market.off')}` });
  } else {
    const ok = canPropose('trade_agreement');
    out.push({ type: 'propose_trade', tone: 'primary', enabled: ok, data, label: t('diplo.btn.trade'),
      reason: ok ? null : proposeReason('trade_agreement') });
  }

  // Wiersz 3: pakt (propozycja LUB odnowienie — dwa stany slotu, D-DS-6) / sojusz
  if (p.hasTreaty('non_aggression')) {
    const ok = isContact && p.canRenewPact === true;
    const lbl = ok ? t('diplo.btn.pactRenew')
      : (p.pactLeft != null && p.pactLeft > p.napWindowYears
        ? t('diplo.btn.pactRenewIn', Math.max(1, Math.ceil(p.pactLeft - p.napWindowYears)))
        : t('diplo.btn.pactRenewCooldown', Math.max(1, Math.ceil(p.pactRefusalLeft ?? 0))));
    out.push({ type: 'renew_pact', tone: 'primary', enabled: ok, data, label: lbl,
      reason: ok ? null : !isContact ? noContact : lbl });
  } else {
    const ok = canPropose('non_aggression');
    out.push({ type: 'propose_pact', tone: 'primary', enabled: ok, data, label: t('diplo.btn.pact'),
      reason: ok ? null : proposeReason('non_aggression') });
  }
  const okAlly = canPropose('alliance');
  out.push({ type: 'propose_alliance', tone: 'primary', enabled: okAlly, data, label: t('diplo.btn.alliance'),
    reason: okAlly ? null : proposeReason('alliance') });
  return out;
}

/** Ton komunikatu (flash) z dzisiejszej barwy: zielony (zaakceptowany) → primary, reszta (odrzucony, ostrzeżenie) → alert. */
export function flashTone(color) { return String(color ?? '').toUpperCase() === '#60B090' ? 'primary' : 'alert'; }
