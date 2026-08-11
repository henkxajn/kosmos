// DirectorProduction — produkcja okrętów wojennych AI (workstream C, Slice 1, commit S4).
//
// ⚠ KOLEJNOŚĆ OD FUNDAMENTU W GÓRĘ (Ruling 1 z pomiaru S0). Ten plik dowozi NAJPIERW
// stempel własności i guardy, a zamówienia z szablonów stoją DOPIERO NA NICH. Powód jest
// zmierzony, nie estetyczny: S0/V4 pokazał, że jedyny istniejący konsument `startShipBuild`
// po stronie AI **nie odpalił ani razu** w 4 seedach × 400 lat cyw. Director jest PIERWSZYM
// realnym użytkownikiem tej ścieżki i nie ma prawa niczego po niej zakładać.
//
// ── CZTERY RZECZY, KTÓRE MUSZĄ ISTNIEĆ, ZANIM PADNIE PIERWSZE ZAMÓWIENIE ─────────────
//
//  1. WŁASNY STEMPEL WŁASNOŚCI (V3c). Okręt zbudowany przez kolonię AI wychodzi ze stoczni
//     BEZ WŁAŚCICIELA — zmierzone: `v_1/hull_frigate` z `ownerEmpireId === undefined`.
//     Istniejący stempel `EmpireLogisticsSystem._onVesselCreatedClaim` NIE nadaje się do
//     reużycia: filtruje `shipId === 'hull_small'` i obsługuje DOKŁADNIE JEDEN oczekiwany
//     build na imperium (`logi.pendingBuildRoute`). Director ma własne okno oczekiwania,
//     kluczowane inaczej, i **nie dotyka** pola logistyki — oba mogą budować równolegle.
//
//  2. GUARD ZAŁOGOWY (V3z). `startShipBuild` odmawia TWARDO przy braku wolnych POPów
//     (nie kolejkuje), a zmierzona połowa kolonii AI stoi na `freePops = 0` przez 400 lat.
//     Bez tego guardu reguła nacisku „odpalałaby" i cicho nie robiła nic.
//
//  3. GUARD STOCZNI (decyzja 6). Brak stoczni = brak produkcji, odsiewane **cicho, ale
//     z wpisem w DebugLogu** — nigdy po cichu-po cichu.
//
//  4. GUARD STACJI ORBITALNEJ (orzeczenie R-3). Produkcja okrętów wojennych AI wymaga
//     stacji nad planetą macierzystą imperium. Stacja jest ŻETONEM uprawnienia, nie
//     fabryką: okręt dalej powstaje w stoczni NAZIEMNEJ przez `startShipBuild`, a stacja
//     jest warunkiem, bez którego Director nie wystawia zamówienia.
//     ⚠ Świadomie NIE ruszamy zwolnienia AI z bramki kadłubowej w `ColonyManager:857`:
//     odwróciłoby dwa zacommitowane piny S3.4d, wypchnęło odmowy dla AI w powiadomienia
//     GRACZA (`UIManager:765` nie filtruje właściciela) i byłoby bramką BEZ TRASY —
//     nie istnieje ścieżka AI do `queueStationShip`. Bramka żyje TUTAJ, u zamawiającego.

import EventBus from '../../core/EventBus.js';
import { DirectorGuards, DirectorActions } from './DirectorRegistry.js';

/** Ile lat WYŚWIETLANYCH zlecenie może czekać na surowce, zanim wygaśnie (Ruling 2, fallback). */
export const ORDER_TTL_DISPLAYED_YEARS = 3.0;

/** Znacznik na zleceniu w `colony.pendingShipOrders` — nasze, nie ColonyManagera. */
const TTL_FIELD = 'directorExpiryYear';

/** Znacznik na statku — dowód, że to Director go zamówił (diagnostyka, nie logika). */
const ORIGIN_FIELD = 'directorOrigin';

export class DirectorProduction {
  constructor() {
    /**
     * Okno oczekiwania na stempel: colonyId → { empireId, templateId, expiresYear }.
     * ⚠ Kluczowane po KOLONII, nie po imperium — inaczej dwa równoległe zamówienia tego
     * samego imperium (stolica + druga kolonia) nadpisałyby się nawzajem, dokładnie tak
     * jak robi to jednoelementowy `logi.pendingBuildRoute`.
     */
    this._awaitingClaim = new Map();

    this._onVesselCreated = (payload) => this._claimVessel(payload?.vessel ?? payload);
    this._onTick = () => this._sweepExpiredOrders();

    EventBus.on('vessel:created', this._onVesselCreated);
    EventBus.on('time:tick', this._onTick);
  }

  dispose() {
    EventBus.off('vessel:created', this._onVesselCreated);
    EventBus.off('time:tick', this._onTick);
    this._awaitingClaim.clear();
  }

  // ── Kolaboratorzy — GŁOŚNO (audyt R12) ────────────────────────────────────

  _require(name) {
    const dep = window.KOSMOS?.[name];
    if (!dep) throw new Error(`[DirectorProduction] brak kolaboratora \`window.KOSMOS.${name}\``);
    return dep;
  }

  /** Rok WYŚWIETLANY (zegar gracza) — jednostka wszystkich `*Years` w workstreamie C. */
  _year() { return this._require('timeSystem').gameTime ?? 0; }

  // ── Rozwiązywanie stolicy ─────────────────────────────────────────────────

  /**
   * Stolica imperium = pierwsza PEŁNA kolonia z żywym `resourceSystem`.
   * Lustro `EmpireLogisticsSystem._pickCapital` — celowo ta sama definicja, żeby
   * „gdzie AI buduje kuriera" i „gdzie AI buduje okręt" nie rozjechały się po cichu.
   */
  capitalOf(empireId) {
    const reg = this._require('empireRegistry');
    const colonies = reg.getColoniesByEmpire?.(empireId) ?? [];
    for (const c of colonies) {
      if (c && !c.isOutpost && c.resourceSystem) return c;
    }
    return null;
  }

  // ── GUARDY ────────────────────────────────────────────────────────────────

  hasShipyard(empireId) {
    const capital = this.capitalOf(empireId);
    if (!capital) return false;
    return (this._require('colonyManager')._getShipyardLevel?.(capital) ?? 0) > 0;
  }

  /**
   * Czy stolica ma wolne POPy na załogę `crewCost`.
   * ⚠ `crewCost` kadłubów jest mnożone ×4 PRZY IMPORCIE (`HullsData.js:287`), więc
   * czytamy je z ŻYWEJ definicji przekazanej przez wołającego, nigdy z literału.
   */
  hasFreeCrew(empireId, crewCost) {
    const capital = this.capitalOf(empireId);
    if (!capital) return false;
    return (capital.civSystem?.freePops ?? 0) >= (Number(crewCost) || 0);
  }

  /**
   * Orzeczenie R-3: imperium musi posiadać stację orbitalną.
   * Rejestr stacji nie ma indeksu po właścicielu — skan jest tani (stacji są jednostki).
   */
  hasOrbitalStation(empireId) {
    const ss = this._require('stationSystem');
    return (ss.getAllStations?.() ?? []).some((s) => s?.ownerEmpireId === empireId);
  }

  // ── Stempel własności (fundament 1) ───────────────────────────────────────

  /** Otwórz okno oczekiwania — wołane TUŻ PRZED `startShipBuild`. */
  expectVessel(colonyId, empireId, templateId) {
    this._awaitingClaim.set(colonyId, { empireId, templateId, openedYear: this._year() });
  }

  /**
   * Nadaj właściciela świeżo zbudowanemu okrętowi.
   *
   * ⚠ BEZ filtra po `shipId` — to jest wprost poprawka luki V3c, przez którą stempel
   * logistyki przepuszcza wyłącznie `hull_small`. Rozstrzygamy po KOLONII-BUDOWNICZYM,
   * bo to jedyne, co statek o sobie wie w chwili `vessel:created`.
   */
  _claimVessel(vessel) {
    if (!vessel?.id) return;
    if (vessel.ownerEmpireId) return;                    // ktoś już ostemplował (np. logistyka)
    const pending = this._awaitingClaim.get(vessel.colonyId);
    if (!pending) return;                                // nie nasz build — nie dotykamy

    vessel.ownerEmpireId  = pending.empireId;
    vessel.owner          = pending.empireId;
    vessel.isEnemy        = true;                        // `isEnemyVessel` czyta te trzy pola
    vessel[ORIGIN_FIELD]  = pending.templateId;

    this._awaitingClaim.delete(vessel.colonyId);
    EventBus.emit('director:shipCompleted', {
      empireId: pending.empireId, vesselId: vessel.id,
      shipId: vessel.shipId, templateId: pending.templateId,
    });
  }

  // ── TTL zleceń oczekujących (Ruling 2, zawór bezpieczeństwa) ──────────────

  /** Ostemplowanie ostatnio dodanego zlecenia oczekującego terminem ważności. */
  _stampTtl(colony, templateId) {
    const list = colony?.pendingShipOrders;
    if (!Array.isArray(list) || list.length === 0) return null;
    const order = list[list.length - 1];               // `startShipBuild` pushuje synchronicznie
    order[TTL_FIELD] = this._year() + ORDER_TTL_DISPLAYED_YEARS;
    order.directorTemplateId = templateId;
    return order;
  }

  /**
   * Usuń zlecenia, które przeterminowały czekanie na surowce.
   *
   * ⚠ To NIE jest „twarde odcięcie" z Rulingu 2 — sprzężenie ekonomiczne (poniżej) ma
   * doprowadzić komodyty ZANIM ten zawór zadziała. TTL istnieje po to, żeby nieudane
   * zamówienie **nigdy nie zostało wiecznie wiszącą zjawą** blokującą slot i mylącą intel.
   */
  _sweepExpiredOrders() {
    const cm = window.KOSMOS?.colonyManager;
    if (!cm?.getAllColonies) return;                     // sweep bywa wołany przed pełnym wire-upem
    const now = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    for (const colony of cm.getAllColonies()) {
      const list = colony?.pendingShipOrders;
      if (!Array.isArray(list) || list.length === 0) continue;
      for (let i = list.length - 1; i >= 0; i--) {
        const o = list[i];
        if (o?.[TTL_FIELD] == null || now < o[TTL_FIELD]) continue;
        list.splice(i, 1);
        EventBus.emit('director:orderExpired', {
          empireId: colony.ownerEmpireId ?? null,
          colonyId: colony.planetId,
          shipId: o.shipId,
          templateId: o.directorTemplateId ?? null,
          waitedYears: ORDER_TTL_DISPLAYED_YEARS,
        });
      }
    }
  }

  // ── Sprzężenie ekonomiczne (Ruling 2) ─────────────────────────────────────

  /**
   * Wepchnij brakujące komodyty w priorytety produkcji kolonii.
   *
   * To jest WARIANT WYBRANY z Rulingu 2 — sprzężenie, nie ślepe czekanie i nie twarde
   * odcięcie. Okazał się TANI, bo maszyneria już istnieje i jest tą samą, której używa
   * bootstrap AI: `factorySystem.setDemandBonus` + tryb `reactive`
   * (`EmpireColonyBootstrap.js:181-188`). Fabryka przezbraja się na deficyt, stocznia
   * dowozi, a intel widzi OBIE fazy: najpierw popyt fabryki, potem kolejkę stoczni.
   *
   * Surowce kopalne (Fe/Ti/Cu…) świadomie POMIJAMY — te nie są produkowane przez
   * fabrykę, więc bonus popytu nic by dla nich nie znaczył; na nie działa TTL.
   */
  _feedCommodityDemand(colony, cost, empireId) {
    const fs = colony?.factorySystem;
    if (!fs?.setDemandBonus) return [];
    const missing = [];
    for (const [id, need] of Object.entries(cost ?? {})) {
      if (!fs.isKnownCommodity?.(id) && !fs.getSafetyStockTarget?.(id)) continue;
      const have = colony.resourceSystem?.getAmount?.(id) ?? 0;
      const gap = Math.ceil(need - have);
      if (gap <= 0) continue;
      const cur = fs.getSafetyStockTarget?.(id) ?? 0;
      fs.setDemandBonus(id, Math.max(0, cur) + gap);
      missing.push({ commodityId: id, gap });
    }
    if (missing.length) {
      fs.setMode?.('reactive');                          // bez tego bonus popytu jest martwy
      EventBus.emit('director:commodityDemand', {
        empireId, colonyId: colony.planetId, missing,
      });
    }
    return missing;
  }
}

// ── Rejestracja nazwanych zachowań ──────────────────────────────────────────

/**
 * Wpina guardy do rejestru Directora. Wołane RAZ, przy tworzeniu instancji w GameScene.
 * Nazwy są kontraktem katalogu reguł (`DirectorRuleData`) — nieznana nazwa RZUCA przy
 * starcie, więc literówka wywala dev-build, a nie ujawnia się po godzinie gry.
 */
export function registerProductionGuards(production, { allowOverride = false } = {}) {
  const opts = { allowOverride };
  DirectorGuards.register('empireHasShipyard',
    (ctx) => production.hasShipyard(ctx.empireId), opts);
  DirectorGuards.register('empireHasOrbitalStation',
    (ctx) => production.hasOrbitalStation(ctx.empireId), opts);
  // Załoga: próg zależy od kadłuba, więc guard sprawdza NAJTAŃSZY sensowny przypadek
  // (jeden POP). Twardy próg per kadłub liczy dopiero akcja, gdy zna wynik resolvera.
  DirectorGuards.register('empireHasFreeCrew',
    (ctx) => production.hasFreeCrew(ctx.empireId, 1), opts);
}

export { TTL_FIELD, ORIGIN_FIELD };
export default DirectorProduction;
