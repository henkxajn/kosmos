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
import { resolveTemplate } from '../../utils/ShipTemplateResolver.js';
import { SHIP_TEMPLATES } from '../../data/ShipTemplateData.js';
import { unitFromKey } from '../../utils/DirectorRuleMath.js';
import { HULLS } from '../../data/HullsData.js';

/** Ile lat WYŚWIETLANYCH zlecenie może czekać na surowce, zanim wygaśnie (Ruling 2, fallback). */
export const ORDER_TTL_DISPLAYED_YEARS = 3.0;

/** Znacznik na zleceniu w `colony.pendingShipOrders` — nasze, nie ColonyManagera. */
const TTL_FIELD = 'directorExpiryYear';

/** Znacznik na statku — dowód, że to Director go zamówił (diagnostyka, nie logika). */
const ORIGIN_FIELD = 'directorOrigin';

/**
 * Odwrócenie resolvera: z (kadłub, moduły) na identyfikator szablonu.
 *
 * Czysta funkcja porównująca WIELOZBIÓR modułów — kolejność slotów nie ma znaczenia,
 * a duplikaty (FRG-3 nosi dwie wyrzutnie) muszą się zgadzać co do liczby. Dopasowanie
 * jest jednoznaczne, dopóki żadne dwa szablony nie dają tego samego ładunku na tym samym
 * kadłubie; keeper pinuje tę rozłączność, więc kolidujący wpis w katalogu wywali test,
 * a nie po cichu przekłamie adnotację.
 *
 * ⚠ Dlaczego wyprowadzamy, zamiast wieźć w zleceniu: ładunek JEST już wieziony —
 * `modules` przechodzi całą drogę `startShipBuild` → `shipQueues`/`pendingShipOrders` →
 * `fleet:shipCompleted` → `createVessel`. Dokładanie drugiego, równoległego kanału na tę
 * samą informację oznaczałoby kolejny stan do zgubienia.
 */
export function matchTemplateId(hullId, modules, catalog = SHIP_TEMPLATES) {
  if (!hullId || !Array.isArray(modules)) return null;
  const key = (arr) => [...arr].sort().join('|');
  const want = key(modules);
  for (const [id, tpl] of Object.entries(catalog ?? {})) {
    if (!tpl?.hullTiers?.includes(hullId)) continue;
    // Szablon o stałych ładunkach: pierwsza pozycja każdego slotu to jego jedyny wybór
    // przy pełnym techu. Porównujemy z KAŻDYM wariantem drabinki, żeby dopasowanie
    // działało też dla okrętu zbudowanego na niższym szczeblu technologicznym.
    const slots = tpl.slots ?? [];
    const variants = slots.reduce(
      (acc, s) => acc.flatMap((prefix) => (s.tiers ?? []).map((m) => [...prefix, m])),
      [[]],
    );
    for (const v of variants) {
      if (key(v) === want) return id;
      // slot `required:false` mógł wypaść przy braku pojemności/techu
      const trimmed = v.filter((_, i) => slots[i]?.required !== false);
      if (key(trimmed) === want) return id;
    }
  }
  return null;
}

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
  //
  // 🔴 PRZEPISANE PO GATE 1 (FAIL na G1.5/G1.6). Pierwsza wersja wyprowadzała WŁASNOŚĆ
  // z rejestru oczekiwań kluczowanego po kolonii i otwieranego W CHWILI ZAMÓWIENIA.
  // Reprodukcja wykonaniem pokazała TRZY niezależne dziury w tym pomyśle — każda sama
  // wystarczała, żeby okręt AI wyszedł ze stoczni bez właściciela, a `isEnemyVessel`
  // (`Vessel.js:385-391`, same testy prawdziwościowe) uznaje BRAK pól za statek GRACZA:
  //
  //   (1) NADPISANIE — jeden slot na kolonię, a zamówienie opiewa na N okrętów.
  //       Drugie `expectVessel` kasowało pierwsze; co najwyżej jeden statek dostawał stempel.
  //   (2) KASOWANIE SĄSIADA — nieudane N-te zamówienie w tej samej pętli robiło
  //       `delete` na oknie, którego wciąż potrzebowało UDANE zamówienie 1. To był
  //       zmierzony przebieg z gate'u: `count:2`, stocznia lv1 → drugi build odrzucony
  //       przez brak slotu → okno skasowane, zanim pierwszy okręt w ogóle powstał.
  //   (3) BRAK OKNA NA ŚCIEŻCE pending→queue — `_tickPendingShipOrders` przenosi zlecenie
  //       do stoczni SAMO, bez udziału Directora, więc każdy okręt, który czekał na
  //       surowce, był bez stempla Z KONSTRUKCJI.
  //   (+) i tak nieserializowany: zapis/wczytanie między zamówieniem a ukończeniem
  //       gubiło okno bezpowrotnie.
  //
  // ⇒ WŁASNOŚĆ JEST TERAZ STRUKTURALNA: wyprowadzamy ją z KOLONII-BUDOWNICZEGO, którą
  // statek niesie w sobie (`vessel.colonyId`, ustawiane w `createVessel` i przekazywane
  // przez całą ścieżkę `fleet:shipCompleted` → `_onShipCompleted`). Nie ma okna, nie ma
  // czasu życia, nie ma czego zgubić — kolonia AI z definicji buduje okręty imperium,
  // które ją posiada. Rejestr zostaje WYŁĄCZNIE jako adnotacja „z którego szablonu",
  // i jego brak nigdy nie wpływa na własność.

  /**
   * Zanotuj, z jakiego szablonu poszło zamówienie — WYŁĄCZNIE adnotacja diagnostyczna.
   * ⚠ Wołane PO udanym `startShipBuild`, nigdy przed: notowanie z góry było źródłem
   * dziur (1) i (2). Kolejka, nie pojedynczy slot — jedna kolonia może budować N okrętów.
   */
  expectVessel(colonyId, empireId, templateId) {
    if (!this._awaitingClaim.has(colonyId)) this._awaitingClaim.set(colonyId, []);
    this._awaitingClaim.get(colonyId).push({ empireId, templateId, openedYear: this._year() });
  }

  /**
   * Nadaj właściciela świeżo zbudowanemu okrętowi — Z KOLONII, która go zbudowała.
   *
   * ⚠ BEZ filtra po `shipId` (luka V3c: stempel logistyki przepuszcza tylko `hull_small`)
   * i BEZ zależności od tego, czy Director akurat pamięta to zamówienie. Obejmuje więc
   * także okręty, których Director nie zamawiał — i to jest POPRAWNE: statek zbudowany
   * przez kolonię imperium należy do tego imperium, kropka. Stan zastany (brak pól =
   * „statek gracza") był defektem, nie funkcją.
   */
  _claimVessel(vessel) {
    if (!vessel?.id) return;
    if (vessel.ownerEmpireId) return;                    // ktoś już ostemplował (np. logistyka)

    const colony = window.KOSMOS?.colonyManager?.getColony?.(vessel.colonyId);
    const empireId = colony?.ownerEmpireId;
    if (!empireId || empireId === 'player') return;      // kolonia GRACZA — nie nasza sprawa

    vessel.ownerEmpireId = empireId;
    vessel.owner         = empireId;
    vessel.isEnemy       = true;                         // `isEnemyVessel` czyta te trzy pola

    // ── Adnotacja szablonu ──────────────────────────────────────────────────
    // 🔴 GATE 1, rozbieżność 2: adnotacja ginęła na OBU trasach, bo brała się z rejestru
    // w pamięci — a ten nie przeżywa ani przeładowania strony, ani promocji pending→queue
    // (`_tickPendingShipOrders` nie wie o Directorze). Dokładnie ta sama wada, którą przy
    // WŁASNOŚCI naprawiliśmy strukturalnie; tu naprawiamy ją tą samą zasadą.
    //
    // ⇒ Adnotacja jest teraz WYPROWADZANA z tego, co statek NIESIE (kadłub + moduły),
    // przez odwrócenie resolvera. Nie ma czego zgubić: działa po przeładowaniu, na obu
    // trasach i dla okrętów zamówionych przed restartem. Rejestr zostaje wyłącznie jako
    // szybka ścieżka (i sprzątanie kolejki), ale wynik NIE zależy od jego obecności.
    const queue = this._awaitingClaim.get(vessel.colonyId);
    const note = queue?.shift() ?? null;
    if (queue && queue.length === 0) this._awaitingClaim.delete(vessel.colonyId);

    const templateId = note?.templateId ?? matchTemplateId(vessel.shipId, vessel.modules);
    if (templateId) vessel[ORIGIN_FIELD] = templateId;

    EventBus.emit('director:shipCompleted', {
      empireId, vesselId: vessel.id, shipId: vessel.shipId, templateId: templateId ?? null,
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

  // ── AKCJA: zamówienie okrętów z szablonu (NA fundamencie) ─────────────────

  /**
   * `queueWarships` — zamów N okrętów z szablonu w stoczni stolicy imperium.
   *
   * @param {{empireId:string, empire?:object, ruleId?:string, year?:number}} ctx
   * @param {{template:string, count?:number|[number,number]}} params
   * @returns {{ok:boolean, queued?:number, reason?:string, detail?:object}}
   *
   * ⚠ „ECONOMY EXECUTES" (orzeczenie R-1): NIE spawnujemy statku. Wołamy tę samą
   * `startShipBuild`, której używa gracz i logistyka — dzięki temu powstaje KOLEJKA,
   * w którą intel może zajrzeć, a `buildTime` fregaty (5.0) daje darmowe napięcie
   * dramaturgiczne. Natychmiastowy spawn nie zostawiłby po sobie nic do obejrzenia.
   */
  queueWarships(ctx, params = {}) {
    const empireId = ctx?.empireId;
    const templateId = params.template;
    const reject = (reason, detail) => {
      EventBus.emit('director:shipRejected', { empireId, templateId, reason, detail: detail ?? null });
      return { ok: false, reason, detail };
    };
    if (!empireId || !templateId) return reject('bad_params');

    // ⚠ KOLEJNOŚĆ SPRAWDZEŃ = KOLEJNOŚĆ DIAGNOZY. Najpierw braki STRUKTURALNE (imperium
    // nie ma gdzie budować), potem bramka POLITYCZNA (R-3). Odwrotna kolejność mówiłaby
    // o imperium bez stolicy „brak stacji orbitalnej", co jest prawdą bezużyteczną —
    // reason ma odtwarzać realną ścieżkę decyzyjną, nie kolejność dopisywania guardów.
    const capital = this.capitalOf(empireId);
    if (!capital) return reject('no_capital');
    const cm = this._require('colonyManager');
    if ((cm._getShipyardLevel?.(capital) ?? 0) <= 0) return reject('no_shipyard');

    // R-3: żeton uprawnienia. Guard reguły już to sprawdził, ale akcja jest publiczna
    // (devtools, przyszłe reguły) — bramka musi obowiązywać także wtedy.
    if (!this.hasOrbitalStation(empireId)) return reject('no_orbital_station');

    // Szablon rozwiązywany DRZEWEM TECHU IMPERIUM, nigdy gracza (Slice 2 S3 dało
    // koloniom AI własny `techSystem`; fallback na globalny byłby cichym kłamstwem).
    const techSystem = capital.techSystem;
    if (!techSystem?.isResearched) return reject('no_empire_tech');
    const resolved = resolveTemplate(templateId, {
      techSystem,
      archetype: ctx.empire?.archetype ?? null,
    });
    if (!resolved.ok) return reject(resolved.reason, resolved.detail);

    const hull = HULLS[resolved.hullId];
    const crewCost = hull?.crewCost ?? 0;                 // ŻYWA wartość (×4 przy imporcie)
    const wanted = this._pickCount(params.count, ctx, templateId);

    let queued = 0, started = 0;
    for (let i = 0; i < wanted; i++) {
      // Załoga: twarda bramka `startShipBuild` (odmowa, nie kolejka) — sprawdzamy PRZED,
      // żeby odmowa miała nasz powód i wpis, a nie ginęła w `fleet:buildFailed`.
      if (!this.hasFreeCrew(empireId, crewCost)) {
        if (queued + started === 0) return reject('no_crew', { crewCost, hullId: resolved.hullId });
        break;                                            // część floty zamówiona — to nie porażka
      }

      const res = cm.startShipBuild(capital.planetId, resolved.hullId, resolved.modules);

      if (!res?.ok) {
        // ⚠ NIC nie sprzątamy — adnotacje sąsiednich, UDANYCH zamówień z tej samej pętli
        // muszą przeżyć. Kasowanie tu było dziurą (2) z gate'u: `count:2` przy stoczni lv1
        // odrzucało drugi build i zabierało adnotację pierwszemu.
        if (queued + started === 0) return reject('build_refused', { reason: res?.reason ?? null });
        break;
      }
      // Adnotacja PO sukcesie — notowanie z góry było źródłem dziur (1) i (2).
      this.expectVessel(capital.planetId, empireId, templateId);
      if (res.queued) {
        queued++;
        const order = this._stampTtl(capital, templateId);
        // Sprzężenie ekonomiczne — brakujące komodyty w priorytety produkcji kolonii.
        this._feedCommodityDemand(capital, order?.cost ?? {}, empireId);
      } else {
        started++;
      }
    }

    EventBus.emit('director:shipQueued', {
      empireId, colonyId: capital.planetId, templateId,
      hullId: resolved.hullId, modules: resolved.modules,
      started, queued, requested: wanted,
    });
    return { ok: true, started, queued, hullId: resolved.hullId };
  }

  /**
   * Ile sztuk zamówić. Zakres `[min,max]` rozstrzygany DETERMINISTYCZNIE z klucza
   * (reguła:imperium:szablon) — nie `Math.random`, bo wynik musi być ten sam po zapisie
   * i wczytaniu gry, inaczej gracz przeładowaniem przewija los.
   */
  _pickCount(count, ctx, templateId) {
    if (Array.isArray(count)) {
      const [lo, hi] = count;
      const min = Math.max(1, Math.floor(lo ?? 1));
      const max = Math.max(min, Math.floor(hi ?? min));
      const u = unitFromKey(`${ctx?.ruleId ?? 'director'}:${ctx?.empireId}:${templateId}:count`);
      return min + Math.floor(u * (max - min + 1));
    }
    return Math.max(1, Math.floor(Number(count) || 1));
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
  DirectorActions.register('queueWarships',
    (ctx, params) => production.queueWarships(ctx, params), opts);
}

export { TTL_FIELD, ORIGIN_FIELD };
export default DirectorProduction;
