// DirectorOffensive — WYBÓR CELU I UDERZENIE (WOJNA I POKÓJ 1.0, workstream B, W3-5).
//
// PO CO TEN PLIK ISTNIEJE. Do W3-4 obce imperium nie miało dokąd polecieć: obie doktryny są
// domowe, a jedyny producent misji `attack` był cheatem debugowym. W3-4/W3-4b dały MECHANIZM
// (rozkaz uderzenia + prawdziwa podróż międzygwiezdna). Brakowało DECYZJI: kogo i kiedy uderzyć.
// To jest ta decyzja — i pierwszy raz w historii tej gry AI wybiera cel SAMO.
//
// ── DLACZEGO REGUŁA, A NIE TRZECIA DOKTRYNA (korekta C-2 audytu) ────────────────────────────
// Doktryna to katalogowy wpis, którego jedyną odpowiedzią jest `assignDoctrine`, a jej nazwa
// jest walidowana twardym testem stringa w PIĘCIU miejscach. Model doktryny NIE POTRAFI wyrazić
// CELU — i to nie jest brak, tylko granica tamtej abstrakcji („jak się zachowuj", nie „kogo
// zaatakuj"). Wybór celu dostaje więc własną regułę i własną akcję.
//
// ── CZTERY OGRANICZENIA, KTÓRE UKSZTAŁTOWAŁY TĘ REGUŁĘ (każde kupione pomiarem) ─────────────
//
//  1. ZASIĘG OGRANICZA REGUŁA, NIE TRANSPORT (§Findings 27). `WarpRouteSystem.canOrder` odrzuca
//     statki AI, więc jadą one przez `dispatchInterstellar` — skok POJEDYNCZY i BEZ limitu
//     długości. Gdyby ta reguła nie stawiała granicy, imperium uderzałoby przez pół galaktyki
//     za jeden bak oparów. Granicą jest POWŁOKA GRANICZNA z `InfluenceMap` (5 LY, zmierzone
//     w R-2): bijemy w to, co sąsiaduje z naszą przestrzenią.
//
//  2. SAMOTNY RAJDER NIE SKRUSZY BRONIONEJ KOLONII (§Findings 34 — zmierzone DWA razy na
//     GATE 2: AI oddało graczowi dwa darmowe zwycięstwa i 7,2 własnego wyczerpania). Przeciw
//     celowi z obroną wysyłamy ESKADRĘ (2+) albo NIE WYSYŁAMY NIC. „Za mało okrętów" jest
//     PIERWSZOKLASOWYM powodem odmowy, nie cichym pominięciem.
//
//  3. RZUT MIESZA ZIARNO GALAKTYKI (§Findings 24 / lekcja pierwszego kontaktu). Klucz rzutu
//     `dir:<reguła>:<imperium>:<próba>` jest STRUKTURALNY — bez soli galaktyki KAŻDA partia
//     dawałaby ten sam rok i ten sam wybór. ⚠ Solimy WYŁĄCZNIE tę regułę (`saltGalaxySeed`),
//     bo zmiana `rollFires` globalnie przesunęłaby losy pierwszego kontaktu, nacisku
//     i mobilizacji — to byłaby zmiana balansu przemycona w slice'ie o czym innym.
//
//  4. WOJNA JEST WARUNKIEM WSTĘPNYM, NIE SKUTKIEM. `EnemyAttackHandler` potrafi wypowiedzieć
//     wojnę przy przylocie, ale AI wybierające cel W CZASIE POKOJU obeszłoby całą warstwę
//     dyplomacji (D1/D2) i napięcie, które do wojny prowadzi (korekta C-4: cele wojenne
//     zaczepiają się o `declare_war`, nie o `MilitaryAI`). Ta reguła działa WYŁĄCZNIE w wojnie.
//
// ⚠ AKCJA NIGDY NIE RZUCA — `_firePending` biegnie POZA per-regułowym try/catch, więc wyjątek
//   stąd zabiłby tik każdego imperium ustawionego po nas (ta sama zasada co w `DirectorMobilization`).
// ⚠ Uderzenie idzie WYŁĄCZNIE przez `OrderService.issueAttack` — jedyny orkiestrator
//   multi-system. Ta reguła nie zna się na skokach i nie ma prawa się poznać.

import { DirectorProbes, DirectorGuards, DirectorActions } from './DirectorRegistry.js';
import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';
import { GAME_CONFIG } from '../../config/GameConfig.js';
import { isEnemyVessel, hasWeapons, isInService } from '../../entities/Vessel.js';
import { PLAYER_OWNER_ID } from '../ThreatAssessment.js';

/** Ile okrętów wysyłamy na cel BRONIONY (§Findings 34 — samotny rajder ginie za darmo). */
export const SQUADRON_VS_DEFENDED = 2;
/** Ile na cel bez obrony. */
export const SQUADRON_VS_UNDEFENDED = 1;
/** Górna klamra jednego uderzenia — imperium nie wysyła wszystkiego, co ma. */
export const MAX_STRIKE_SIZE = 3;

export class DirectorOffensive {
  // ── Pomocnicze ────────────────────────────────────────────────────────────────────────────

  /** Kanon stolicy — WYŁĄCZNIE `directorProduction.capitalOf` (jak produkcja, doktryny, mobilizacja). */
  _capitalBodyId(empireId) {
    return window.KOSMOS?.directorProduction?.capitalOf?.(empireId)?.planetId ?? null;
  }

  /** Z2 — układ macierzysty imperium = układ jego stolicy. `null` gdy stolicy nie ma. */
  _homeSystemIdOf(empireId) {
    const capId = this._capitalBodyId(empireId);
    if (!capId) return null;
    return EntityManager.get(capId)?.systemId ?? null;
  }

  /**
   * Z2 (D-Z2-5) — czy okręt jest w AKTYWNYM starciu.
   *
   * ⚠ To NIE jest nowy predykat, tylko szósty leniwy odczyt TEGO SAMEGO
   * (`DSCS._findActiveEncounterContaining`) — dokładnie jak `MovementOrderSystem`,
   * `ProximitySystem`, `FleetSystem` i `ThreeRenderer`. Nowa publiczna nazwa byłaby drugim
   * słownikiem na to samo zdarzenie. Fail-open: bez DSCS nie ma bitwy, której trzeba by bronić.
   * @private
   */
  _inActiveEncounter(vesselId) {
    const dscs = window.KOSMOS?.deepSpaceCombatSystem;
    if (!dscs?._findActiveEncounterContaining) return false;
    return !!dscs._findActiveEncounterContaining(vesselId);
  }

  /**
   * Okręty gotowe do UDERZENIA MIĘDZYGWIEZDNEGO.
   *
   * ⚠ Filtr zdolności skoku to `warpFuel.max > 0` — WŁASNOŚĆ, nie id szablonu (D4, zmierzone:
   * obie eskorty dają 5, `frigate_system_defender` 0). Dzięki temu FRG-3 zostaje w domu swoim
   * WŁASNYM projektem, a nowy szablon z bakiem dołącza do puli bez dotykania tego kodu.
   */
  strikeReadyVessels(empireId) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr?._vessels) return [];
    // Z2 (D-Z2-4) — TERMIN UKŁADU MACIERZYSTEGO. Do Z2 pula przyjmowała okręt stojący na
    // orbicie planety GRACZA, więc rajder po uderzeniu bił stamtąd co cooldown z dystansu 0 AU.
    // ⚠ Ten filtr NIE jest ostrożnością „na wszelki wypadek": bez niego reguła uderzenia
    // (`strike_player_target`) i reguła powrotu (`recall_strike_force`) ścigałyby się o TEN SAM
    // kadłub, a zwycięzcę rozstrzygałaby KOLEJNOŚĆ KLUCZY w `DIRECTOR_RULES` — bo
    // `DirectorSystem.tickEmpire` iteruje `Object.values(katalog)`. Filtr czyni wynik
    // niezależnym od kolejności; pinuje to `ai_strike_recall_smoke` T10.
    const gated  = GAME_CONFIG.FEATURES?.aiStrikeRecall !== false;
    const homeSys = gated ? this._homeSystemIdOf(empireId) : null;
    const out = [];
    for (const v of vMgr._vessels.values()) {
      if (!v || v.isWreck) continue;
      if (!isEnemyVessel(v)) continue;
      if ((v.ownerEmpireId ?? v.owner) !== empireId) continue;
      if (!hasWeapons(v)) continue;              // kurier nie uderza
      if (!isInService(v)) continue;             // rezerwa nie walczy (W2)
      if (!(v.warpFuel?.max > 0)) continue;      // D4 — własność, nie szablon
      if (v.mission) continue;                   // ma zajęcie
      if (v.movementOrder) continue;             // już pod rozkazem
      if (v.pendingOrder) continue;              // composite w toku (skok→uderzenie)
      if (gated && homeSys && (v.systemId ?? 'sys_home') !== homeSys) continue;   // Z2 — poza domem
      if (gated && this._inActiveEncounter(v.id)) continue;                       // Z2 — właśnie się bije
      out.push(v);
    }
    return out;
  }

  /**
   * VO-3b (D-VO1b-5) — kadłuby STRUKTURALNIE zdolne do uderzenia: własne, uzbrojone, w służbie,
   * z bakiem warp. BEZ predykatów zajętości (`mission`/`movementOrder`/`pendingOrder`).
   *
   * ⚠ PO CO OSOBNA PĘTLA, skoro to prawie `strikeReadyVessels`: bo tamta jest PULĄ, a ta jest
   * DIAGNOZĄ. Odmowa `no_warp_capable_hull` przy pełnym baku i sprawnych kadłubach KŁAMIE
   * o stanie świata — a GATE B2 mierzy właśnie rozkład powodów odmowy i na kłamiącym powodzie
   * byłby ślepy. Świadomie NIE refaktoryzuję puli do wspólnego helpera: D-VO1b-6 trzyma predykaty
   * pul nietknięte, a keeper `vo3b_order_clear` T7 pinuje to źródłowo.
   */
  _warpCapableHulls(empireId) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr?._vessels) return [];
    const out = [];
    for (const v of vMgr._vessels.values()) {
      if (!v || v.isWreck) continue;
      if (!isEnemyVessel(v)) continue;
      if ((v.ownerEmpireId ?? v.owner) !== empireId) continue;
      if (!hasWeapons(v)) continue;
      if (!isInService(v)) continue;
      if (!(v.warpFuel?.max > 0)) continue;
      out.push(v);
    }
    return out;
  }

  /**
   * Kolonie GRACZA leżące W ZASIĘGU imperium — czyli w jego przestrzeni roszczonej albo
   * w powłoce granicznej (§Findings 27: to REGUŁA stawia granicę, nie warstwa transportu).
   *
   * ⚠ Kolonie gracza bierzemy po STEMPLE WŁASNOŚCI (`getPlayerColonies`), nigdy po nazwie —
   * `getAllColonies` zwraca kolonie WSZYSTKICH właścicieli (§Findings 20, na tym stanął GATE 1).
   */
  reachableTargets(empireId) {
    const colMgr = window.KOSMOS?.colonyManager;
    const imap   = window.KOSMOS?.influenceMap;
    if (!colMgr?.getPlayerColonies || !imap) return [];

    const out = [];
    for (const col of colMgr.getPlayerColonies()) {
      const body = EntityManager.get(col.planetId);
      const sysId = body?.systemId;
      if (!sysId) continue;
      if (!imap.isClaimedBy(sysId, empireId) && !imap.isInBorderZone(sysId, empireId)) continue;
      out.push({ colony: col, body, systemId: sysId });
    }
    return out;
  }

  /** Sonda katalogowa — ile celów gracza mamy w zasięgu. */
  countReachableTargets(empireId) {
    return this.reachableTargets(empireId).length;
  }

  /**
   * Czy cel jest BRONIONY? Dwa źródła, oba realne: budynki obronne kolonii ORAZ okręty gracza
   * w tym układzie. Świadomie NIE pytamy `ThreatAssessment` o globalną siłę gracza — tu chodzi
   * o to, co stoi NAD TYM CIAŁEM, a nie o to, ile gracz ma w całej galaktyce.
   */
  isDefended(target) {
    const actives = target?.colony?.buildingSystem?._active;
    if (actives) {
      for (const entry of actives.values()) {
        const id = entry?.building?.id;
        if (id === 'defense_tower' || id === 'defense_grid') return true;
      }
    }
    const vMgr = window.KOSMOS?.vesselManager;
    if (vMgr?._vessels) {
      for (const v of vMgr._vessels.values()) {
        if (!v || v.isWreck) continue;
        if (isEnemyVessel(v)) continue;
        if (!isInService(v)) continue;
        if ((v.systemId ?? 'sys_home') !== target.systemId) continue;
        if (hasWeapons(v)) return true;
      }
    }
    return false;
  }

  /**
   * Wartość celu — po co go w ogóle bić. `TerritoryService.getSystemDevScore` to JEDYNY
   * istniejący w tej grze licznik „ile ten układ znaczy" (audyt S19 znalazł go BEZ konsumenta);
   * używamy go zamiast pisać drugi scorer. Brak serwisu → 1 (wszystkie cele równe).
   */
  targetValue(target) {
    const ts = window.KOSMOS?.territoryService;
    const dev = ts?.getSystemDevScore?.(target.systemId);
    return Number.isFinite(dev) && dev > 0 ? dev : 1;
  }

  /**
   * Wybór celu: najcenniejszy, a przy remisie — słabiej broniony.
   * Deterministyczny (żadnego RNG): los jest w RZUCIE reguły, nie w wyborze celu — inaczej
   * ten sam zapis dawałby po wczytaniu inny cel.
   */
  pickTarget(empireId) {
    const cands = this.reachableTargets(empireId);
    if (cands.length === 0) return null;
    const scored = cands.map(c => ({ ...c, value: this.targetValue(c), defended: this.isDefended(c) }));
    scored.sort((a, b) => (b.value - a.value) || (Number(a.defended) - Number(b.defended))
                       || String(a.body.id).localeCompare(String(b.body.id)));
    return scored[0];
  }

  // ── AKCJA ─────────────────────────────────────────────────────────────────────────────────

  /**
   * @param {object} ctx    — { empireId, empire, year, ruleId } z DirectorSystem
   * @param {{maxShips?:number}} params
   * @returns {{launched:number, reason?:string}} — odmowa jest WYNIKIEM, nie wyjątkiem
   */
  launchStrike(ctx, params = {}) {
    const { empireId } = ctx ?? {};
    const year = ctx?.year ?? (window.KOSMOS?.timeSystem?.gameTime ?? 0);
    try {
      const target = this.pickTarget(empireId);
      if (!target) return this._refuse(empireId, 'no_target_in_reach', year);

      const ready = this.strikeReadyVessels(empireId);
      if (ready.length === 0) {
        // D-VO1b-5 — drabina odmów ma być PRAWDOMÓWNA. Dwa różne stany świata dostają dwa różne
        // powody: „nie mam czym skoczyć" vs „mam, ale wszystko zajęte". Dotąd oba mówiły to
        // pierwsze — a to jest kanał, z którego GATE B2 czyta, DLACZEGO ofensywa AI stoi.
        const hulls = this._warpCapableHulls(empireId);
        if (hulls.length === 0) return this._refuse(empireId, 'no_warp_capable_hull', year);
        // Z2 (D-Z2-4) — TRZECI SZCZEBEL DRABINY. `no_idle_hull` znaczy „kadłuby są, ale każdy ma
        // zajęcie". Po dołożeniu terminu układu powstał stan trzeci: kadłuby są WOLNE, tylko
        // żadnego nie ma W DOMU (właśnie wracają z uderzenia). Bez własnej nazwy ten stan
        // kłamałby o świecie — a `director:strikeRefused` jest JEDYNYM kanałem, z którego widać,
        // dlaczego ofensywa AI stoi. Filtr jest DIAGNOZĄ, nie drugą pulą (jak `_warpCapableHulls`).
        const idle = hulls.filter(v => !v.mission && !v.movementOrder && !v.pendingOrder);
        if (idle.length === 0) return this._refuse(empireId, 'no_idle_hull', year, { hulls: hulls.length });
        return this._refuse(empireId, 'no_hull_at_home', year,
          { hulls: hulls.length, idleAway: idle.length, homeSystemId: this._homeSystemIdOf(empireId) });
      }

      // §Findings 34 — przeciw obronie lecimy eskadrą albo wcale.
      const needed = target.defended ? SQUADRON_VS_DEFENDED : SQUADRON_VS_UNDEFENDED;
      if (ready.length < needed) {
        return this._refuse(empireId, 'insufficient_squadron', year,
          { needed, available: ready.length, defended: target.defended });
      }

      const cap = Math.min(Number(params.maxShips ?? MAX_STRIKE_SIZE), MAX_STRIKE_SIZE);
      const send = ready.slice(0, Math.max(needed, Math.min(cap, ready.length)));

      const os = window.KOSMOS?.orderService;
      if (!os?.issueAttack) return this._refuse(empireId, 'no_order_service', year);

      let launched = 0;
      const rejected = [];
      for (const v of send) {
        const r = os.issueAttack(v.id, { targetBodyId: target.body.id });
        if (r?.ok) launched++;
        else rejected.push({ vesselId: v.id, reason: r?.reason ?? 'unknown' });
      }

      if (launched === 0) return this._refuse(empireId, 'all_orders_rejected', year, { rejected });

      // Fakt goły — BEZ nazwy imperium i bez wpisu do Dziennika gracza. Bramkę jakości
      // kontaktu zakłada odbiorca (`NotificationCenter`, W3-7) — ten sam wzór co mobilizacja.
      EventBus.emit('director:strikeLaunched', {
        empireId, year, count: launched,
        targetSystemId: target.systemId,
        defended: target.defended,
        rejected: rejected.length,
      });
      return { launched, targetBodyId: target.body.id, targetSystemId: target.systemId };
    } catch (err) {
      // Reguła NIE MA PRAWA wywrócić tiku — patrz nagłówek.
      console.error('[DirectorOffensive] launchStrike rzucił — uderzenie pominięte', err);
      return { launched: 0, reason: 'exception' };
    }
  }

  _refuse(empireId, reason, year, extra = {}) {
    EventBus.emit('director:strikeRefused', { empireId, reason, year, ...extra });
    return { launched: 0, reason, ...extra };
  }
}

/**
 * Rejestracja nazw katalogowych. ⚠ MUSI biec PRZED `new DirectorSystem()` — konstruktor
 * rozwiązuje każdą nazwę z katalogu i RZUCA przy braku.
 *
 * ⚠ `empireAtWarWithPlayer` jest NOWY (katalog miał dotąd wyłącznie wariant zaprzeczony
 * `empireNotAtWarWithPlayer`). Nie odwracamy tamtego w miejscu użycia, bo guardy są nazwami
 * w danych — czytelność katalogu jest tu ważniejsza niż jedna funkcja mniej.
 */
export function registerOffensiveBehaviors(instance, { allowOverride = false } = {}) {
  DirectorProbes.register('reachablePlayerTargets',
    ({ empireId }) => instance.countReachableTargets(empireId), { allowOverride });

  DirectorGuards.register('empireAtWarWithPlayer',
    ({ empireId }) => !!window.KOSMOS?.warSystem?.getWarWith?.(empireId)?.active, { allowOverride });

  DirectorGuards.register('empireHasStrikeForce',
    ({ empireId }) => instance.strikeReadyVessels(empireId).length > 0, { allowOverride });

  DirectorActions.register('launchStrike',
    (ctx, params) => instance.launchStrike(ctx, params), { allowOverride });
}

export default DirectorOffensive;
