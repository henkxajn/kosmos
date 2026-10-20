// NavPeekProviders — predykaty plakietek alertów na kaflach dolnego paska nawigacji (ARKUSZ UI U4-1).
//
// Dawniej model danych karty „peek” (wiersze + alert) dla każdej grupy nawigacji. Karty wyłączone w U3-0b, usunięte
// w U4-1 (UI_PLAN §4.5, decyzja 4): plakietka kafla (`BottomNavBar`) czytała z karty wyłącznie OBECNOŚĆ alertu, więc
// zostały same warunki — bez wierszy, tekstów i kluczy i18n (`navPeek.*` usunięte). Warunki bez zmian wobec dawnego
// `getPeekAlert` (keeper `nav_slot_alerts_smoke`: tabela grup × kryzysów z wynikiem sprzed U4-1 jako wzorcem).
//
// Czyta ŻYWE dane z window.KOSMOS. Mgła wojny u źródła — wyłącznie getPlayerColonies() (NIGDY getAllColonies),
// statki wroga pomijane. Wszystko guardowane ?. — przed trybem cywilizacji systemy bywają undefined.

import { isEnemyVessel } from '../entities/Vessel.js';

const K = () => window.KOSMOS || {};
const _playerColonies = () => K().colonyManager?.getPlayerColonies?.() ?? [];
const _fullColonies   = () => _playerColonies().filter(c => !c.isOutpost);
const _sum = (arr, fn) => arr.reduce((s, x) => s + (fn(x) || 0), 0);

// Kryzys pojedynczej kolonii: głód / brak wody / brak energii (brownout) / niepokój.
function _colonyInCrisis(c) {
  const civ = c.civSystem, rs = c.resourceSystem;
  if (civ?.isFamine) return true;
  const waterNet = rs?.getPerYear?.('water');
  if (waterNet != null && waterNet < 0 && (rs?.getAmount?.('water') ?? 0) < (civ?.population ?? 0)) return true;
  if (rs?.energy?.brownout) return true;
  if (civ?.isUnrest) return true;
  return false;
}

// ⚙ Gospodarka — bilans kredytów (handel + podatki − utrzymanie floty) ujemny albo brownout w którejkolwiek kolonii.
function _economyAlert() {
  const cols = _playerColonies(), full = _fullColonies();
  const cm = K().colonyManager;
  const tradeFlow = _sum(cols, c => c.creditsPerYear);
  const tax = cm?.calculateTaxIncome ? _sum(full, c => cm.calculateTaxIncome(c)) : 0;
  const fleetUp = K().vesselManager?.getTotalFleetUpkeep?.() ?? 0;
  const net = tradeFlow + tax - fleetUp;
  return net < 0 || cols.some(c => c.resourceSystem?.energy?.brownout);
}

// 🤝 Dyplomacja — wojna, ultimatum albo napięcie ≥ 60 w którejkolwiek widocznej relacji.
function _diplomacyAlert() {
  const dip = K().diplomacySystem, war = K().warSystem;
  const wars = war?.listActive?.() ?? [];
  const visible = dip?.listVisiblePlayerRelations?.() ?? [];
  const maxHost = visible.length ? Math.round(Math.max(0, ...visible.map(r => r.tension ?? 0))) : 0;
  return wars.length > 0 || visible.some(r => r.ultimatumStartYear != null) || maxHost >= 60;
}

// 🚀 Flota — którykolwiek własny statek (nie wrak) unieruchomiony za utrzymanie.
function _fleetAlert() {
  const vm = K().vesselManager;
  const own = (vm?.getAllVessels?.() ?? []).filter(v => !isEnemyVessel(v) && !v.isWreck);
  return own.some(v => !!vm?.isImmobilized?.(v));
}

// 🧬 Technologie — nauka płynie (tempo > 0), a żaden slot badań nie jest zajęty.
function _techAlert() {
  const rs = K().researchSystem;
  const rate = rs?.getTotalRate?.() ?? 0;
  const slotsUsed = rs?.activeResearch?.length ?? 0;
  return rate > 0 && slotsUsed === 0;
}

/**
 * Czy kafel grupy nawigacji ma plakietkę alertu. Grupy jak w dawnym routerze kart (także 'population' — dziś bez kafla,
 * C7/C8). Poza trybem cywilizacji i dla nieznanej grupy — false.
 * @param {string} groupId — `primary` grupy z `NAV_GROUPS`
 * @returns {boolean}
 */
export function hasSlotAlert(groupId) {
  if (!window.KOSMOS?.civMode) return false;
  switch (groupId) {
    case 'civilization': return _fullColonies().some(_colonyInCrisis);
    case 'economy':      return _economyAlert();
    case 'colony':       return _fullColonies().some(_colonyInCrisis);
    case 'population':   return _fullColonies().slice(0, 3).some(_colonyInCrisis);   // dawna karta: pierwsze trzy kolonie
    case 'diplomacy':    return _diplomacyAlert();
    case 'fleet':        return _fleetAlert();
    case 'tech':         return _techAlert();
    case 'shipyard':     return false;
    default:             return false;
  }
}
