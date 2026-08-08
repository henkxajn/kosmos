// DiplomacyRefusalModal — „dlaczego NIE" (WOJNA I POKÓJ 1.0, faza D2, commit E4).
//
// PIERWSZY KONSUMENT `breakdown` z Acceptance Engine. Do E3 dyplomacja mówiła „tak"
// na wszystko, więc rozbicie nie miało czego wyjaśniać; E3 pozwolił odmówić, ale odmowa
// mówiła wyłącznie linijką w Dzienniku i toastem. Ten moduł pokazuje ROZBICIE DOSŁOWNIE:
// te same wiersze i te same liczby, którymi silnik podjął decyzję.
//
// ⚠ ŚWIADOMIE BEZ IMPORTU `Acceptance*`. Pin P14 (`acceptance_engine_smoke`) trzyma import
// silnika WYŁĄCZNIE w DiplomacySystem, żeby balans nie zaczął wyciekać do paneli. Wszystko,
// czego potrzebuje ten plik, przychodzi w payloadzie zdarzenia (wiersze niosą `labelKey`)
// albo przez projekcje fasady (`getVisibleBreakdown`, `getRefusalYearsLeft`).
//
// Kanał: `queueMissionEvent` → `buildScheduledEventPopup` (jedyny popup z listą opcji;
// backbone §3.3 wskazał go jako kanał odpowiedzi dyplomatycznych).
// ⚠ Przyciski w tym kanale są WYŁĄCZNIE zamykające: `buildScheduledEventPopup` nie czyta
// `onClick` z konfiguracji przycisku, a `MissionEventModal` podpina `dismiss()` każdemu,
// który nie ma znacznika `_hasCustomClick` (a nic go nie ustawia). Modal odmowy niczego
// nie potrzebuje ponad OK — gdyby kiedyś potrzebował, trzeba najpierw naprawić kanał.

import EventBus from '../core/EventBus.js';
import { t, getName } from '../i18n/i18n.js';
import { TREATY_TYPES } from '../data/TreatyData.js';
import { formatStatLine, formatSectionTitle } from './TerminalPopupBase.js';
import { queueMissionEvent } from './MissionEventModal.js';

// Ile wierszy rozbicia pokazujemy. Wiersze przychodzą POSORTOWANE malejąco po |wkład|,
// więc obcięcie zabiera najmniej znaczące.
// ⚠ Powód jest twardy: karta popupu NIE MA przewijania (`.se-body` bez max-height/overflow,
// w odróżnieniu od `.at-right` w TerminalPopupBase), więc długa tabela wyszłaby poza ekran.
// `offer_peace` waży JEDENAŚCIE termów — bez limitu to realny przypadek, nie teoria.
const MAX_ROWS = 6;

/**
 * Nazwa imperium, z degradacją do id (modal nie może zniknąć przez brak nazwy).
 * ⚠ NIE `getName(emp)`: imperia niosą `name` (nazwa własna z generatora), a nie
 * `namePL`/`nameEN`, więc `getName` bez prefiksu zszedłby aż do `item.id` i pokazał
 * graczowi „emp_001". Lustro `_empName` z UIManager — ten sam wybór pola.
 */
function _empName(empireId) {
  const emp = window.KOSMOS?.empireRegistry?.get?.(empireId);
  return emp?.namePL ?? emp?.name ?? empireId ?? '?';
}

// Znak U+2212 (MINUS SIGN), nie dywiz — w monospace czyta się jak liczba ujemna, nie łącznik.
const _sign = (v) => (v > 0 ? '+' : '−');
const _mag  = (v) => { const a = Math.abs(Number(v) || 0); return Number.isInteger(a) ? String(a) : a.toFixed(1); };
const _fmt  = (v) => `${_sign(v)}${_mag(v)}`;

/**
 * Buduje treść modala z wyniku silnika. CZYSTA — bierze `result` i nazwy, zwraca HTML.
 * Wydzielona, żeby smoke sprawdzał ZAWARTOŚĆ (wiersze, sumowanie, obcięcie) bez DOM.
 *
 * @param {Object} result — zwrotka `evaluateProposal` (score/threshold/breakdown/blocked/reasonKey)
 * @param {Object} [opts]
 * @param {number} [opts.cooldownYearsLeft] — ile lat świeża odmowa jeszcze obciąża
 * @param {Function} [opts.translate] — wstrzykiwane `t` (headless test bez i18n runtime)
 * @param {Array}  [opts.rows] — gotowe wiersze widoczne (fasada je filtruje); brak ⇒ liczone tu
 */
export function buildRefusalContent(result, { cooldownYearsLeft = 0, translate = t, rows = null } = {}) {
  const tr = translate;
  let html = '';

  // Blokada twarda nie ma rozbicia — ma POWÓD. Pokazanie pustej tabeli sugerowałoby
  // ocenę „na styk", a tu oceny w ogóle nie było (AcceptanceEngine: `breakdown: []`).
  if (result?.blocked) {
    html += formatSectionTitle(tr('diploRefusal.blockedTitle'));
    html += formatStatLine(tr('diploRefusal.reason'), tr(result.reasonKey ?? 'diploRefusal.unknownReason'), 'at-stat-neg');
    return html;
  }

  const visible = rows ?? (result?.breakdown ?? []).filter(r => (Number(r?.value) || 0) !== 0);
  const shown   = visible.slice(0, MAX_ROWS);
  const hidden  = visible.length - shown.length;

  html += formatSectionTitle(tr('diploRefusal.whyTitle'));
  for (const row of shown) {
    html += formatStatLine(tr(row.labelKey), _fmt(row.value), row.value > 0 ? 'at-stat-pos' : 'at-stat-neg');
  }
  if (hidden > 0) html += formatStatLine(tr('diploRefusal.moreFactors'), String(hidden), 'at-stat-neu');

  html += formatSectionTitle(tr('diploRefusal.verdictTitle'));
  html += formatStatLine(tr('diploRefusal.score'), _fmt(result?.score ?? 0), 'at-stat-neg');
  html += formatStatLine(tr('diploRefusal.threshold'), _fmt(result?.threshold ?? 0), 'at-stat-neu');

  // „Kolejna próba jest droższa" — bez tego `recent_refusal` karze, nie mówiąc za co.
  if (cooldownYearsLeft > 0) {
    html += formatStatLine(tr('diploRefusal.cooldown'), tr('diploRefusal.cooldownYears', _mag(cooldownYearsLeft)), 'at-stat-neu');
  }
  return html;
}

/** Wspólne wystawienie popupu — jedna ścieżka dla wszystkich trzech odmów. */
function _show({ empireId, verb, result, headlineKey, descKey, descArg }) {
  const dipl = window.KOSMOS?.diplomacySystem;
  const name = _empName(empireId);
  queueMissionEvent({
    severity:    'warning',
    // ⚠ BEZ WIDEO, świadomie. Pusta tablica omija auto-dobór z `svgKey`
    // (`buildScheduledEventPopup`: `if (!config.videoSrc && config.svgKey)`), a potem
    // blok wideo w ogóle się nie rysuje (`videoSrc.length > 0`). Dwa powody: (1) karta
    // popupu NIE MA przewijania, a ramka wideo zjada ~190 px, których tabela rozbicia
    // potrzebuje; (2) to jest komunikat-depesza, nie zdarzenie z obrazkiem.
    videoSrc:    [],
    barTitle:    t('diploRefusal.barTitle'),
    headline:    t(headlineKey, name),
    description: descArg == null ? t(descKey, name) : t(descKey, name, descArg),
    contentHTML: buildRefusalContent(result, {
      // Fasada filtruje wiersze (jedno źródło reguły „co warto pokazać", patrz
      // DiplomacySystem.getVisibleBreakdown); brak fasady ⇒ czysty fallback w builderze.
      rows: dipl?.getVisibleBreakdown ? dipl.getVisibleBreakdown(result) : null,
      cooldownYearsLeft: dipl?.getRefusalYearsLeft?.(empireId, verb) ?? 0,
    }),
    buttons: [{ label: t('diploRefusal.ok'), primary: true }],
  });
}

/**
 * Wpięcie kanału odmów. Wołane raz, obok `initMissionEvents`.
 *
 * ⚠ Zdarzeniowo, nie z handlerów kliknięć: ta sama odmowa może przyjść z panelu
 * dyplomacji, z panelu wojny albo z powrotu misji emisariusza. Jedno miejsce zamiast
 * trzech kopii — i przyszłe ścieżki (propozycje AI w D4/D5) wpinają się bez zmian tutaj.
 */
export function initDiplomacyRefusals() {
  EventBus.on('diplomacy:treatyRejected', ({ empireId, treatyId, result }) => {
    // `already_signed` to nie odmowa, tylko klik w nic — Dziennik też go pomija.
    if (result?.reasonKey === 'diplo.reject.alreadySigned') return;
    if (!result) return;
    _show({
      empireId, verb: treatyId, result,
      headlineKey: 'diploRefusal.headlineTreaty',
      descKey:     'diploRefusal.descTreaty',
      descArg:     getName(TREATY_TYPES[treatyId] ?? {}) || treatyId,
    });
  });

  EventBus.on('diplomacy:peaceRejected', ({ empireId, result, playerInitiated }) => {
    // ⚠ TYLKO świadoma propozycja gracza. Auto-pokój z wyczerpania idzie tą samą metodą
    // i PONAWIA się przy każdej kolejnej bitwie (E3) — modal otwierałby się w środku
    // serii starć, pauzując grę za każdym razem. Dodatnia bramka, nie negatywna:
    // brak pola ⇒ brak modala (cisza jest bezpieczniejsza niż spam).
    if (playerInitiated !== true || !result) return;
    _show({
      empireId, verb: 'offer_peace', result,
      headlineKey: 'diploRefusal.headlinePeace',
      descKey:     'diploRefusal.descPeace',
    });
  });

  EventBus.on('diplomacy:envoyRefused', ({ empireId, result }) => {
    if (!result) return;
    _show({
      empireId, verb: 'improve_relations', result,
      headlineKey: 'diploRefusal.headlineEnvoy',
      descKey:     'diploRefusal.descEnvoy',
    });
  });
}
