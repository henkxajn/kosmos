// NotificationCenter — centralny rejestr "silent" notyfikacji
//
// Niektóre eventy (odkrycia ciał z misji recon, pasywne skanowanie obserwatorium)
// nie powinny pauzować gry i pokazywać pełnoekranowego popup. Zamiast tego:
//   1. Trafiają tutaj jako notyfikacje z payloadem.
//   2. BottomBar pokazuje dzwonek 🔔 z badge count.
//   3. Klik bell → NotificationDropdown z listą grup (auto-grupowanie po typie).
//   4. Klik wiersza → emit 'notify:openDetail' → MissionEventModal w trybie noPause.
//   5. Równolegle wpis trafia do EventLogSystem (searchable history).
//
// Architektura skalowalna: dodanie nowej kategorii = nowy _handleX + grupa.

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { t } from '../i18n/i18n.js';
import { empireLogName } from '../utils/EmpireName.js';   // G2-4 F6 — nazwa strony traktatu (jak wpis pokoju)
import { areAtWar } from '../utils/WarGate.js';             // G2-4 (a) — ostrzeżenie gaśnie, gdy wraca wojna
import { withdrawalDeadlineReached } from './WithdrawalSystem.js';   // G2-4 (a) — ten sam próg terminu co usunięcie

const MAX_ITEMS = 50;

// G1b/S3 — powód rozwiązania jednostki naziemnej → klucz wpisu w Dzienniku. Powód spoza mapy = brak wpisu.
const DISBAND_JOURNAL_KEYS = {
  no_credits:      'event.groundUnit.disbanded',          // „… rozwiązana (brak utrzymania)" — klucz istniał, bez czytelnika
  morale_collapse: 'event.groundUnit.disbandedMorale',
};

export class NotificationCenter {
  /**
   * AC-9 — okno zbiorcze meldunków o utracie kafli, w latach WYŚWIETLANYCH.
   * 0.5 roku = tyle, ile trwa okupacja JEDNEGO kafla z budynkiem (`OCCUPY_DURATION`), więc
   * pierwsza salwa pustych kafli mieści się w jednym meldunku, a każdy kolejny budynek
   * doczekuje się własnego.
   */
  static TILE_LOSS_COOLDOWN_YEARS = 0.5;

  constructor() {
    this._items = [];        // {id, type, severity, source, timestamp, year, title, subtitle, payload, dismissed}
    this._nextId = 1;
    // AC-9 — agregacja utraty kafli. `tile:ownerChanged` leci PER KAFEL, a maszerujący najeźdźca
    // przewraca kilka pustych kafli w kilka tików: bez agregacji dzwonek dostałby serię wpisów
    // o jednym wydarzeniu. Klucz: planetId → { pending, lastNotifiedYear }.
    this._tileLoss = new Map();

    // Subskrypcje — silent events (NIE pauzują gry)
    EventBus.on('expedition:reconProgress',  e => this._handleReconProgress(e));
    EventBus.on('expedition:reconComplete',  e => this._handleReconComplete(e));
    EventBus.on('observatory:discovered',    e => this._handleObservatoryDiscovered(e));
    EventBus.on('observatory:vesselScanComplete', e => this._handleVesselScanComplete(e));
    // Finding 190 — prognoza kolizji dołącza do rodzeństwa obserwatorium (dzwonek, bez pauzy).
    EventBus.on('observatory:collisionAlert', e => this._handleCollisionAlert(e));
    // W2-7 — mobilizacja rezerwy obcego imperium. Bramka jakości kontaktu SIEDZI W HANDLERZE
    // (patrz `_handleMobilized`): `add()` dubluje wszystko do Dziennika, więc filtrować trzeba
    // PRZED nim, a nie po.
    EventBus.on('director:mobilized', e => this._handleMobilized(e));
    // W3-7 (S25) — desant i utrata kolonii miały ZERO subskrybentów UI w całym drzewie.
    EventBus.on('invasion:launched',  e => this._handleInvasionLaunched(e));
    EventBus.on('colony:captured',    e => this._handleColonyCaptured(e));
    // AC-9 — dwa zdarzenia, które do tej pory NIE MIAŁY ANI JEDNEGO konsumenta w całym drzewie:
    // `tile:ownerChanged` (gracz tracił teren i nie dostawał o tym ani słowa) oraz
    // `invasion:repelled` (odparcie desantu szło wyłącznie do `DebugLog`). Pierwsze jest
    // dokładnie tym sygnałem, którego brak sprawiał, że marsz najeźdźcy wyglądał jak cisza.
    EventBus.on('tile:ownerChanged',  e => this._handleTileOwnerChanged(e));
    EventBus.on('invasion:repelled',  e => this._handleInvasionRepelled(e));
    // G1b — POP-y jednostki naziemnej PRZEPADŁY, bo jej kolonia macierzysta nie należy już do
    //   właściciela jednostki (albo jej nie ma). Bez tego wpisu strata byłaby cicha.
    EventBus.on('groundUnit:popsLost', e => this._handleGroundUnitPopsLost(e));
    // G1b/S3 (Finding 312) — `groundUnit:disbanded` nie miał ANI JEDNEGO subskrybenta: rozwiązanie
    //   jednostki (brak utrzymania, załamanie morale) nie zostawiało śladu w Dzienniku.
    EventBus.on('groundUnit:disbanded', e => this._handleGroundUnitDisbanded(e));
    // G2-4 (D14, R5) — wycofanie wojsk po pokoju (producent: `WithdrawalSystem`). Pokój i utrata po terminie —
    //   wpis w Dzienniku; ostrzeżenie miesiąc przed terminem — Dziennik I dzwonek.
    EventBus.on('withdrawal:ordered', e => this._handleWithdrawalOrdered(e));
    EventBus.on('withdrawal:warning', e => this._handleWithdrawalWarning(e));
    EventBus.on('withdrawal:expired', e => this._handleWithdrawalExpired(e));
    // G2-4 F4 (Finding 367) — R4 i R7 szły WYŁĄCZNIE do audytu: gracz nie wiedział, że wojska AI zeszły z jego kolonii
    //   przy pokoju, ani że jego oddział zginął razem z ciałem. Oba — sam wpis w Dzienniku, bez dzwonka.
    EventBus.on('withdrawal:aiRemoved',   e => this._handleWithdrawalAiRemoved(e));
    EventBus.on('garrison:unitsRemoved',  e => this._handleGarrisonUnitsRemoved(e));
    // G2-4 (a) w wersji OGRANICZONEJ (decyzja właściciela 2026-10-04, Finding 370) — ostrzeżenie „został miesiąc” gaśnie
    //   samo PRZED terminem, gdy straciło przedmiot: na ciele nie została żadna oflagowana jednostka z ostrzeżenia
    //   (załadowane, flaga zdjęta albo jednostki usunięte inną drogą) albo wróciła wojna z właścicielem ciała. Zdarzenia —
    //   od razu, także na pauzie; tick — ostrzeżenie odtworzone z zapisu (jednostki wracają z zapisu PO dzwonku).
    //   ⚠ W TERMINIE NIE GAŚNIE: obok staje meldunek o utracie i plakietka rośnie — tak gracz zauważa stratę. Pełną wersję
    //   (gaśnie także w terminie) właściciel odrzucił: meldunek ZASTĘPOWAŁ ostrzeżenie, plakietka stała (2 → 2), a dzwonek
    //   nie ma innego sygnału „nowe” niż liczba. Od terminu wpis jest rozstrzygnięty — gasi go wyłącznie gracz.
    const retire = () => this._retireMootWithdrawalWarnings();
    EventBus.on('withdrawal:cleared',    retire);
    EventBus.on('groundUnit:removed',    retire);
    EventBus.on('diplomacy:warDeclared', retire);
    EventBus.on('time:tick',             retire);
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Wszystkie aktywne (nie odrzucone) notyfikacje, najnowsze na początku. */
  getActive() {
    return this._items.filter(n => !n.dismissed);
  }

  /** Aktywne pogrupowane po `type`. Returns [{type, items[]}, …] po recency. */
  getGrouped() {
    const groups = new Map();
    for (const n of this.getActive()) {
      if (!groups.has(n.type)) groups.set(n.type, []);
      groups.get(n.type).push(n);
    }
    // Posortuj grupy po recency najnowszej notyfikacji
    return Array.from(groups.entries())
      .map(([type, items]) => ({ type, items }))
      .sort((a, b) => (b.items[0]?.timestamp ?? 0) - (a.items[0]?.timestamp ?? 0));
  }

  /** Liczba aktywnych — dla badge count w BottomBar. */
  getActiveCount() {
    return this.getActive().length;
  }

  /** Pobierz notyfikację po ID (do otwarcia detail modal). */
  getById(id) {
    return this._items.find(n => n.id === id) ?? null;
  }

  /** Oznacz pojedynczą jako odrzuconą. */
  dismiss(id) {
    const n = this._items.find(x => x.id === id);
    if (!n || n.dismissed) return false;
    n.dismissed = true;
    EventBus.emit('notify:dismissed', { id });
    EventBus.emit('notify:listChanged', { count: this.getActiveCount() });
    return true;
  }

  /** Odrzuć wszystkie. */
  dismissAll() {
    let changed = 0;
    for (const n of this._items) {
      if (!n.dismissed) { n.dismissed = true; changed++; }
    }
    if (changed > 0) {
      EventBus.emit('notify:listChanged', { count: 0 });
    }
    return changed;
  }

  /** Dodaj notyfikację (publiczne — można wołać z zewnątrz dla nowych kategorii). */
  add(notif) {
    // Dedupe: jeśli ten sam type+bodyId w ostatnich 200ms — pomiń.
    // ObservatorySystem emituje JEDNOCZEŚNIE 'observatory:discovered' + 'expedition:reconProgress'
    // (vide ObservatorySystem.js L232 + L239) — bez dedupe odkrycie = 2 notyfikacje.
    const bodyId = notif.payload?.bodyId;
    if (bodyId) {
      const now = Date.now();
      const dup = this._items.find(n =>
        !n.dismissed
        && n.type === notif.type
        && n.payload?.bodyId === bodyId
        && (now - (n.timestamp ?? 0)) < 200
      );
      if (dup) return null;
    }

    notif.id = `notif_${this._nextId++}`;
    notif.timestamp = Date.now();
    notif.year = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    notif.dismissed = false;
    this._items.unshift(notif);
    if (this._items.length > MAX_ITEMS) this._items.length = MAX_ITEMS;

    EventBus.emit('notify:added', { notif });
    EventBus.emit('notify:listChanged', { count: this.getActiveCount() });

    // Równolegle do EventLog (searchable history) — EventLogSystem.push() emituje 'eventLog:push'
    const logChannel = notif.logChannel ?? 'intel';
    const logSeverity = (notif.severity === 'danger' || notif.severity === 'alert') ? 'alert'
                      : (notif.severity === 'warning' || notif.severity === 'warn') ? 'warn'
                      : 'info';
    window.KOSMOS?.eventLogSystem?.push({
      text: notif.logText ?? notif.title,
      channel: logChannel,
      severity: logSeverity,
      entityRef: notif.payload?.bodyId ?? null,
    });

    return notif.id;
  }

  // ── Save / restore ──────────────────────────────────────────────────────

  serialize() {
    // Nie zapisujemy odrzuconych — clean state po reload
    const active = this._items.filter(n => !n.dismissed);
    return {
      nextId: this._nextId,
      items: active.map(n => ({
        id: n.id,
        type: n.type,
        severity: n.severity,
        source: n.source,
        timestamp: n.timestamp,
        year: n.year,
        title: n.title,
        subtitle: n.subtitle,
        payload: n.payload,
      })),
    };
  }

  restore(data) {
    if (!data) return;
    this._items = (data.items ?? []).map(n => ({ ...n, dismissed: false }));
    this._nextId = data.nextId ?? (this._items.length + 1);
    EventBus.emit('notify:listChanged', { count: this.getActiveCount() });
  }

  // ── Handlery silent events ──────────────────────────────────────────────

  _handleReconProgress({ expedition, body, discovered }) {
    if (!body) return;
    this.add({
      type: 'discovery_body',
      severity: 'info',
      source: 'reconProgress',
      title: t('notif.discoveryTitle', body.name ?? '?'),
      subtitle: this._bodySubtitle(body),
      payload: {
        bodyId: body.id,
        bodyType: body.type,
        bodyName: body.name,
        expeditionId: expedition?.id ?? null,
        vesselId: expedition?.vesselId ?? null,
        discoveredCount: Array.isArray(discovered) ? discovered.length : 0,
      },
    });
  }

  _handleReconComplete({ expedition, scope, discovered }) {
    // full_system → jedno podsumowanie misji (wciąż grupowane jako discovery_body)
    if (scope === 'full_system') {
      const count = Array.isArray(discovered) ? discovered.length : 0;
      this.add({
        type: 'discovery_body',
        severity: 'info',
        source: 'reconComplete',
        title: t('notif.reconCompleteTitle', count),
        subtitle: expedition?.vesselId
          ? t('notif.reconCompleteSubtitle', window.KOSMOS?.vesselManager?.getVessel(expedition.vesselId)?.name ?? '?')
          : '',
        payload: {
          scope: 'full_system',
          discoveredIds: Array.isArray(discovered) ? [...discovered] : [],
          expeditionId: expedition?.id ?? null,
          vesselId: expedition?.vesselId ?? null,
          targetName: expedition?.targetName ?? null,
        },
      });
      return;
    }

    // target / nearest — pojedyncze ciało
    if (Array.isArray(discovered) && discovered.length > 0) {
      const bodyId = discovered[0];
      const body = this._findBody(bodyId);
      this.add({
        type: 'discovery_body',
        severity: 'info',
        source: 'reconCompleteTarget',
        title: t('notif.discoveryTitle', body?.name ?? bodyId),
        subtitle: this._bodySubtitle(body),
        payload: {
          scope: scope ?? 'target',
          bodyId,
          bodyType: body?.type,
          bodyName: body?.name,
          expeditionId: expedition?.id ?? null,
          vesselId: expedition?.vesselId ?? null,
        },
      });
    }
  }

  _handleObservatoryDiscovered({ body, discovered, colonyName }) {
    if (!body) return;
    // Dedupe robi this.add() (ObservatorySystem emituje observatory:discovered + expedition:reconProgress).
    this.add({
      type: 'discovery_body',
      severity: 'info',
      source: 'observatoryDiscovered',
      title: t('notif.discoveryTitle', body.name ?? '?'),
      subtitle: this._bodySubtitle(body),
      payload: {
        bodyId: body.id,
        bodyType: body.type,
        bodyName: body.name,
        colonyName: colonyName ?? null,
      },
    });
  }

  // Finding 190 — prognoza kolizji. Wcześniej to zdarzenie PAUZOWAŁO grę i zostawiało jedną
  // linię w Dzienniku; teraz jest cichym meldunkiem jak reszta obserwatorium. Bramka
  // `isPlayerColony` jest po stronie producenta wyliczona, ale pytamy o nią i tutaj — dzwonek
  // gracza nie ma meldować kolizji, które go nie dotyczą.
  _handleCollisionAlert({ bodyA, bodyB, yearsUntil, margin, isPlayerColony }) {
    if (!isPlayerColony || !bodyA || !bodyB) return;
    const nameA = bodyA.name ?? '?';
    const nameB = bodyB.name ?? '?';
    const years = Math.round(yearsUntil ?? 0);
    this.add({
      type: 'collision_alert',
      severity: 'warn',
      source: 'collisionForecast',
      logChannel: 'intel',          // spójnie z observatory:discovered
      title: t('notif.collisionTitle', nameA, nameB),
      subtitle: t('notif.collisionSubtitle', years, margin ?? 0),
      logText: t('log.collisionForecastColony', nameA, nameB, years, margin ?? 0),
      payload: { bodyId: bodyA.id, bodyBId: bodyB.id, yearsUntil: years },
    });
  }

  // Reforma detekcji — ukończony skan wrogiego statku (rumor→contact). Po skanie
  // statek JEST zidentyfikowany → wolno ujawnić nazwę + imperium (fog-of-war zdjęty).
  _handleVesselScanComplete({ vesselId, vessel }) {
    const v = vessel ?? window.KOSMOS?.vesselManager?.getVessel?.(vesselId);
    const reg = window.KOSMOS?.empireRegistry;
    const empId = v?.ownerEmpireId ?? v?.owner ?? null;
    const empName = (empId && reg?.get?.(empId)?.name) ? reg.get(empId).name : t('intel.unknownEmpire');
    const vName = v?.name ?? vesselId;
    this.add({
      type: 'vessel_scan',
      severity: 'info',
      source: 'observatoryScan',
      title: t('notif.vesselScanTitle', vName),
      subtitle: empName,
      logChannel: 'intel',
      logText: t('notif.vesselScanTitle', vName),
      payload: { vesselId, empireId: empId },
    });
  }

  /**
   * W2-7 — obce imperium OBSADZA okręty z rezerwy.
   *
   * ⚠ TO JEST BRAMKA MGŁY WOJNY, NIE FILTR HAŁASU. `add()` bezwarunkowo dubluje każdą
   *   notyfikację do Dziennika gracza na kanale `intel`, więc niebramkowany wpis oznaczałby,
   *   że gracz czyta mobilizację obcych BEZ ŻADNEGO rozpoznania — dokładnie ta klasa, którą
   *   Slice 1 zamykał dwa razy (stocznie AI, potem życie kolonii AI). Wymagamy `contact`:
   *   na `rumor` wiadomo, że ktoś tam jest, ale nie co robi.
   * ⚠ Gate stoi TUTAJ, u odbiorcy, a nie u producenta — `director:mobilized` jest też ścieżką
   *   audytu (`DebugLog`), a ta ma widzieć wszystko (kanał deweloperski jest celowo niebramkowany).
   * ⚠ Bez nazwy imperium przy braku `detailed`: `add()` nie ma dedupe dla naszego payloadu
   *   (dedupe działa wyłącznie po `payload.bodyId`), więc jedynym hamulcem częstotliwości jest
   *   rzut raz na rok wyświetlany po stronie reguły.
   *
   * ⚠ DWA SZCZEBLE UJAWNIENIA — to jest ROZBIEŻNOŚĆ ZAMIERZONA, nie przeoczenie. Ten wpis
   *   wymaga `contact`, a liczby rezerwy w panelu wywiadu (`knownReserve`/`knownCrewCapacity`)
   *   piszą się dopiero na `detailed`. Na `contact` gracz wie WIĘC, ŻE przeciwnik obsadza
   *   okręty — bo to jest zdarzenie, które da się zaobserwować — ale nie wie ILE ich ma
   *   w magazynie, bo to wynik rozpoznania, nie obserwacji. Wyrównanie obu do jednego szczebla
   *   albo odebrałoby graczowi widoczne zdarzenie, albo rozdało pełną kolejność bojową za darmo.
   */
  _handleMobilized({ empireId, count }) {
    if (!empireId || !(count > 0)) return;
    const intel = window.KOSMOS?.intelSystem;
    if (!intel?.isAtLeast?.(empireId, 'contact')) return;      // fail-closed: brak modułu ⇒ brak wpisu

    const reg = window.KOSMOS?.empireRegistry;
    const named = intel.isAtLeast(empireId, 'detailed');
    const empName = (named && reg?.get?.(empireId)?.name) ? reg.get(empireId).name : t('intel.unknownEmpire');
    this.add({
      type: 'mobilization',
      severity: 'warn',
      source: 'directorMobilization',
      title: t('notif.mobilizationTitle', empName),
      subtitle: t('notif.mobilizationSubtitle', count),
      logChannel: 'intel',
      logText: t('notif.mobilizationTitle', empName),
      payload: { empireId, count },
    });
  }

  /**
   * W3-7 — DESANT NA TWOJĄ KOLONIĘ. Do tego commitu `invasion:launched` /
   * `invasion:troopsLanded` docierały WYŁĄCZNIE do `DebugLog` — zero subskrybentów UI
   * w całym drzewie (audyt S25). Gracz mógł stracić kolonię, nie zobaczywszy ani jednego
   * komunikatu o tym, że ktokolwiek wylądował.
   *
   * ⚠ ŚWIADOME ODSTĘPSTWO OD WZORCA `_handleMobilized`: tam bramka `contact` zamyka CAŁE
   * powiadomienie, bo mobilizacja dzieje się w CUDZYM układzie i jest wynikiem obserwacji.
   * Desant dzieje się NA TWOJEJ PLANECIE — nie da się go „nie zauważyć", więc zdarzenie
   * pokazujemy ZAWSZE, a stopniujemy TOŻSAMOŚĆ najeźdźcy (nazwa dopiero przy `detailed`,
   * ta sama drabina ujawnienia co w W2-7). Zamknięcie całego wpisu za `contact` znaczyłoby,
   * że nieznane imperium zajmuje kolonię w ciszy — to nie jest mgła wojny, to ślepota.
   */
  _handleInvasionLaunched({ empireId, planetId, troops }) {
    if (!planetId) return;
    const colony = window.KOSMOS?.colonyManager?.getColony?.(planetId);
    const colonyName = colony?.name ?? planetId;
    this.add({
      type: 'invasion',
      severity: 'alert',
      source: 'invasionSystem',
      title: t('notif.invasionTitle', colonyName),
      subtitle: t('notif.invasionSubtitle', this._empireLabel(empireId), troops ?? 0),
      logChannel: 'combat',
      logText: t('notif.invasionTitle', colonyName),
      payload: { empireId, planetId, troops },
    });
  }

  /**
   * W3-7 — UTRATA KOLONII. Zastępuje natywny `alert()` (blokujące okno przeglądarki,
   * `GameScene.js:2339`), które przy okazji odpalało się TAKŻE dla przerzutów AI→AI
   * (§Findings 22). Bramka własności siedzi u nadawcy i tutaj — jedno bez drugiego
   * zostawia następnego konsumenta na tej samej minie.
   */
  _handleColonyCaptured({ colonyName, planetId, newOwner, previousOwner, wasHomePlanet, reason }) {
    if ((previousOwner ?? 'player') !== 'player') return;      // nie nasza strata — cisza

    // ⚠ WP-3 — cesja przy stole pokoju idzie kanałem DYPLOMACJI z severity `info`.
    //   Do WP-3 dziedziczyła po utracie w walce: `alert` + kanał `combat` (Walka) + tytuł
    //   „⚠ Kolonia utracona". Podpisany pokój nie jest zdarzeniem bojowym i nie ma prawa
    //   wyglądać jak desant — to jest cała treść tej gałęzi.
    if (reason === 'cession') {
      this.add({
        type: 'colonyCeded',
        severity: 'info',
        source: 'diplomacySystem',
        title: t('notif.colonyCededTitle', colonyName ?? planetId),
        subtitle: t('notif.colonyCededSubtitle', this._empireLabel(newOwner)),
        logChannel: 'diplomacy',
        logText: t('log.cession', colonyName ?? planetId, this._empireLabel(newOwner)),
        payload: { planetId, newOwner, reason },
      });
      return;
    }
    this.add({
      type: 'colonyLost',
      severity: 'alert',
      source: 'colonyManager',
      title: t(wasHomePlanet ? 'notif.capitalLostTitle' : 'notif.colonyLostTitle',
               colonyName ?? planetId),
      subtitle: t('notif.colonyLostSubtitle', this._empireLabel(newOwner)),
      logChannel: 'combat',
      logText: t(wasHomePlanet ? 'notif.capitalLostTitle' : 'notif.colonyLostTitle',
                 colonyName ?? planetId),
      payload: { planetId, newOwner, wasHomePlanet },
    });
  }

  /**
   * AC-9 — GRACZ WIDZI, ŻE TRACI KAFLE.
   *
   * `tile:ownerChanged` (`GroundUnitManager:619`) miał **zero subskrybentów** — okupacja była
   * całkowicie niema, więc marsz najeźdźcy przez kolonię wyglądał dla gracza jak nic. To była
   * biała plama dokładnie w miejscu, o które chodzi w tym slice.
   *
   * ⚠ AGREGACJA, NIE JEDEN WPIS NA KAFEL. Pusty kafel przewraca się NATYCHMIAST przy wejściu
   *   jednostki (`_captureHexOnEntry`), a maszerujący oddział przechodzi ich kilka w kilku
   *   tikach — bez okna zbiorczego dzwonek dostałby serię notyfikacji o jednym wydarzeniu.
   *   Liczymy straty per ciało i meldujemy nie częściej niż raz na `TILE_LOSS_COOLDOWN_YEARS`
   *   roku WYŚWIETLANEGO, podając ILE kafli przepadło od poprzedniego meldunku.
   * ⚠ „Strata" znaczy: kafel NALEŻĄCEJ DO GRACZA kolonii przeszedł w NIE-gracza. Po przejęciu
   *   kolonii dalsze flipy dzieją się już na ciele AI — i wtedy milczymy, bo to nie jest
   *   strata gracza, tylko porządki u nowego właściciela.
   */
  _handleTileOwnerChanged({ planetId, newOwner }) {
    if (!planetId) return;
    if ((newOwner ?? 'player') === 'player') return;              // odzysk, nie strata
    const colony = window.KOSMOS?.colonyManager?.getColony?.(planetId);
    if (!colony || colony.ownerEmpireId) return;                  // nie nasze ciało — cisza

    const now = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const agg = this._tileLoss.get(planetId) ?? { pending: 0, lastNotifiedYear: -Infinity };
    agg.pending += 1;
    this._tileLoss.set(planetId, agg);

    if (now - agg.lastNotifiedYear < NotificationCenter.TILE_LOSS_COOLDOWN_YEARS) return;

    const lost = agg.pending;
    agg.pending = 0;
    agg.lastNotifiedYear = now;

    this.add({
      type: 'tileLost',
      severity: 'warn',
      source: 'groundUnitManager',
      title: t('notif.tileLostTitle', colony.name ?? planetId),
      subtitle: t('notif.tileLostSubtitle', lost, this._empireLabel(newOwner)),
      logChannel: 'combat',
      logText: t('notif.tileLostTitle', colony.name ?? planetId),
      payload: { planetId, newOwner, lost },
    });
  }

  /**
   * AC-9 — ODPARCIE DESANTU. `invasion:repelled` szło dotąd wyłącznie do `DebugLog`, więc
   * gracz, który właśnie wybił najeźdźców, nie dostawał o tym ani słowa. To jest domknięcie
   * pary: skoro meldujemy stratę terenu, meldujemy też jej koniec.
   */
  _handleInvasionRepelled({ planetId }) {
    if (!planetId) return;
    const colony = window.KOSMOS?.colonyManager?.getColony?.(planetId);
    if (!colony || colony.ownerEmpireId) return;                  // odparcie na cudzym ciele nas nie dotyczy
    this._tileLoss.delete(planetId);                              // kampania skończona — licznik zeruje się

    this.add({
      type: 'invasionRepelled',
      severity: 'info',
      source: 'invasionSystem',
      title: t('notif.invasionRepelledTitle', colony.name ?? planetId),
      subtitle: t('notif.invasionRepelledSubtitle'),
      logChannel: 'combat',
      logText: t('notif.invasionRepelledTitle', colony.name ?? planetId),
      payload: { planetId },
    });
  }

  /**
   * G1b (S2/S4) — POP-y jednostki GRACZA przepadły: jej kolonia macierzysta została zniszczona albo
   * przejęta (albo jednostka jej nie ma). SAM WPIS W DZIENNIKU, bez dzwonka — i NICZEGO nie zwalnia:
   * zwalnianie należy do `ColonyManager`, ten handler tylko melduje.
   */
  _handleGroundUnitPopsLost({ owner, type, customName, planetId, amount }) {
    if ((owner ?? 'player') !== 'player') return;                 // POP-y imperium AI to nie nasza sprawa
    if (!(amount > 0)) return;
    this._journal(t('event.groundUnit.popsLost', amount.toFixed(1), this._groundUnitLabel(type, customName)),
      'combat', 'warn', planetId ?? null);
  }

  /**
   * G1b/S3 (Finding 312) — jednostka naziemna GRACZA rozwiązana: z braku utrzymania (`no_credits`) albo
   * przez załamanie morale (`morale_collapse`). SAM WPIS W DZIENNIKU, bez dzwonka, z powodem w treści.
   * ⚠ Ten handler NIGDY nie zwalnia POP-ów: utrzymanie zwalnia inline PRZED emisją, a rozpad morale —
   *   `CombatSystem` przez `ColonyManager.releaseGroundUnitPops`. Zwalnianie tutaj = podwójny zwrot.
   * ⚠ Powód spoza mapy ⇒ brak wpisu (żaden tekst nie może kłamać o przyczynie).
   */
  _handleGroundUnitDisbanded({ owner, type, customName, planetId, reason }) {
    if ((owner ?? 'player') !== 'player') return;                 // rozwiązanie jednostki AI to nie nasz meldunek
    const key = DISBAND_JOURNAL_KEYS[reason];
    if (!key) return;
    this._journal(t(key, this._groundUnitLabel(type, customName)), 'combat', 'warn', planetId ?? null);
  }

  /**
   * G2-4 (D14, R5) — pokój podpisany, jednostki gracza na ciele drugiej strony muszą się wycofać: ILE jednostek,
   * KTÓRE ciało, TERMIN. Sam wpis w Dzienniku (kanał dyplomacji — to skutek traktatu), bez dzwonka; dzwonek dopiero
   * przy ostrzeżeniu. Ciało nazwą CIAŁA, nie cudzej kolonii (wzór Outlinera — moje buty to nie bilet do nazwy wroga).
   * G2-4 F6 — imperium nazwą STRONY TRAKTATU (`empireLogName`, jak wpis pokoju), nie regułą mgły wojny `_empireLabel`.
   * G2-4 (f) — uzgodnienie przy WCZYTANIU (F3, `reason: 'load'`) nie jest podpisaniem pokoju: własne brzmienie, bez
   *   „Peace with …” — N jednostek na ciele nazwanego imperium musi się wycofać do daty. Glif ⚑ i kanał bez zmian.
   */
  _handleWithdrawalOrdered({ empireId, planetId, count, deadlineYear, reason }) {
    if (!planetId || !(count > 0)) return;
    const key = reason === 'load' ? 'event.withdrawal.orderedLoad' : 'event.withdrawal.ordered';
    this._journal(t(key, empireLogName(empireId), count, this._bodyName(planetId),
      this._dateLabel(deadlineYear)), 'diplomacy', 'warn', planetId);
  }

  /** G2-4 (R5) — miesiąc do terminu wycofania: Dziennik I dzwonek (gracz ma jeszcze czas zabrać wojska). */
  _handleWithdrawalWarning({ empireId, planetId, unitIds, count, deadlineYear }) {
    if (!planetId || !(count > 0)) return;
    const body = this._bodyName(planetId);
    const date = this._dateLabel(deadlineYear);
    this.add({
      type: 'withdrawalWarning',
      severity: 'warn',
      source: 'withdrawalSystem',
      title: t('notif.withdrawalWarningTitle', body),
      subtitle: t('notif.withdrawalWarningSubtitle', count, date),
      logChannel: 'combat',
      logText: t('event.withdrawal.warning', count, body, date),
      // `bodyId` — wpis w Dzienniku dostaje odnośnik do ciała (`add()` → `entityRef`)
      payload: { bodyId: planetId, planetId, empireId: empireId ?? null, unitIds: [...(unitIds ?? [])],
                 deadlineYear: deadlineYear ?? null },
    });
  }

  /**
   * G2-4 (a) w wersji ograniczonej (Finding 370) — czy ostrzeżenie „został miesiąc” straciło przedmiot PRZED terminem:
   * wróciła wojna z właścicielem ciała albo żadna jednostka z ostrzeżenia nie stoi już na tym ciele z flagą wycofania
   * (nie w ładowni). Od terminu (`withdrawalDeadlineReached` — ten sam próg co usunięcie jednostek) — NIE: wpis jest
   * rozstrzygnięty, obok stoi meldunek o utracie. Bez rejestru jednostek — nie zgadujemy (zostaje).
   * ⚠ Granica: ostatnia jednostka załadowana w tym samym ticku, który przeskakuje termin, zostawia ostrzeżenie
   *   (zachowanie sprzed (a)) — tick widzi już termin, a strat nie było.
   */
  _withdrawalWarningMoot(n) {
    const p = n?.payload ?? {};
    const now = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    if (Number.isFinite(p.deadlineYear) && withdrawalDeadlineReached(now, p.deadlineYear)) return false;
    if (p.empireId && areAtWar('player', p.empireId)) return true;
    const gum = window.KOSMOS?.groundUnitManager;
    if (typeof gum?.getUnit !== 'function') return false;
    return !(p.unitIds ?? []).some(id => {
      const u = gum.getUnit(id);
      return !!u?.withdrawal && u.planetId === p.planetId && u.status !== 'in_cargo';
    });
  }

  /** G2-4 (a) — gasi (odrzuca) każde aktywne ostrzeżenie „został miesiąc”, które straciło przedmiot przed terminem. */
  _retireMootWithdrawalWarnings() {
    for (const n of this._items) {
      if (n.dismissed || n.type !== 'withdrawalWarning') continue;
      if (this._withdrawalWarningMoot(n)) this.dismiss(n.id);
    }
  }

  /**
   * G2-4 (R5) — termin minął, jednostki przepadły (jak polegli): Dziennik I dzwonek, raz na ciało, z nazwą ciała i liczbą.
   * ⚠ F5 (bramka live 2026-10-04): był tu SAM wpis w Dzienniku — powstawał (kanał Walka, nieukryty), ale jedyną
   *   warstwą bez kliknięcia jest dzwonek, a w nim wisiało już tylko „został miesiąc” dla ciała, z którego jednostek nie
   *   było; Dziennik to wysuwana szuflada, która zamknięta nie rysuje ani linii ⇒ gracz nie wiedział, że stracił wojska.
   *   Jeden wpis w Dzienniku daje `add()` (`logText`) — bez drugiego `_journal`.
   * ⚠ Typ `withdrawalExpired`, NIE `withdrawalWarning`: `add()` odrzuca ten sam typ i to samo ciało w ciągu 200 ms
   *   czasu realnego, a przy wysokiej prędkości ostrzeżenie i termin dzieli kilkadziesiąt ms — wspólny typ zjadłby utratę.
   */
  _handleWithdrawalExpired({ empireId, planetId, unitIds, count }) {
    if (!planetId || !(count > 0)) return;
    const body = this._bodyName(planetId);
    this.add({
      type: 'withdrawalExpired',
      severity: 'warn',
      source: 'withdrawalSystem',
      title: t('notif.withdrawalExpiredTitle', body),
      subtitle: t('notif.withdrawalExpiredSubtitle', count),
      logChannel: 'combat',
      logText: t('event.withdrawal.expired', count, body),
      // `bodyId` — wpis w Dzienniku dostaje odnośnik do ciała (`add()` → `entityRef`)
      payload: { bodyId: planetId, planetId, empireId: empireId ?? null, unitIds: [...(unitIds ?? [])], count },
    });
  }

  /**
   * G2-4 F4 (R4, Finding 367) — pokój zdjął jednostki imperium z ciała GRACZA. Sam wpis w Dzienniku, kanał dyplomacji
   * (skutek traktatu), z nazwą strony traktatu (`empireLogName`, jak wpis pokoju) i ciała.
   * G2-4 (d) — to samo przy WCZYTANIU starego zapisu (`reason: 'load'`): bez podpisania pokoju, więc własne brzmienie,
   *   bez „Peace with …” (wzór wpisu F3 przy wczytaniu, (f)).
   */
  _handleWithdrawalAiRemoved({ empireId, planetId, count, reason }) {
    if (!planetId || !(count > 0)) return;
    const key = reason === 'load' ? 'event.withdrawal.aiRemovedLoad' : 'event.withdrawal.aiRemoved';
    this._journal(t(key, empireLogName(empireId), count, this._bodyName(planetId)), 'diplomacy', 'info', planetId);
  }

  /**
   * G2-4 F4 (R7, Finding 367) — jednostki GRACZA zniknęły razem ze zniszczonym ciałem. Sam wpis w Dzienniku, kanał
   * walki. Ślad jednostek AI (osobna emisja `GarrisonSystem`) i zmiana właściciela ciała — bez wpisu.
   * Nazwa ciała z ładunku: po zniszczeniu encji zwykle już nie ma.
   */
  _handleGarrisonUnitsRemoved({ planetId, cause, owners, count, bodyName }) {
    if (cause !== 'body_destroyed' || !planetId || !(count > 0)) return;
    if (!(owners ?? []).some(o => (o ?? 'player') === 'player')) return;
    this._journal(t('event.groundUnit.lostWithBody', count, bodyName ?? this._bodyName(planetId)),
      'combat', 'warn', planetId);
  }

  // ── Helpery ──────────────────────────────────────────────────────────────

  /** G2-4 — nazwa CIAŁA (nie kolonii) albo id, gdy ciała nie ma. */
  _bodyName(planetId) {
    return this._findBody(planetId)?.name ?? planetId;
  }

  /** G2-4 — data w formacie zegara gry (`TimeSystem.formatTime`); bez systemu czasu — rok z dwoma miejscami. */
  _dateLabel(years) {
    if (!Number.isFinite(years)) return '?';
    return window.KOSMOS?.timeSystem?.formatTime?.(years) ?? years.toFixed(2);
  }

  /**
   * G1b — wpis WYŁĄCZNIE do Dziennika, bez dzwonka (`add()` dubluje do obu). Dla zdarzeń, które
   * mają zostawić ślad w historii, ale nie wołać gracza.
   */
  _journal(text, channel, severity, entityRef = null) {
    window.KOSMOS?.eventLogSystem?.push({ text, channel, severity, entityRef });
  }

  /** G1b — etykieta jednostki naziemnej: nazwa nadana przez gracza albo nazwa typu (jak w Outlinerze). */
  _groundUnitLabel(type, customName) {
    if (customName) return customName;
    return type ? t(`groundUnit.${type}`) : '?';
  }

  /**
   * Nazwa imperium wg drabiny ujawnienia: pełna dopiero przy `detailed`, wcześniej anonim.
   * Fail-closed przy braku `IntelSystem` — nie rozdajemy tożsamości, gdy nie ma czym mierzyć.
   */
  _empireLabel(empireId) {
    if (!empireId) return t('intel.unknownEmpire');
    const intel = window.KOSMOS?.intelSystem;
    const named = intel?.isAtLeast?.(empireId, 'detailed');
    const name = window.KOSMOS?.empireRegistry?.get?.(empireId)?.name;
    return (named && name) ? name : t('intel.unknownEmpire');
  }

  _bodySubtitle(body) {
    if (!body) return '';
    const type = body.planetType ?? body.type ?? '?';
    const orbit = body.orbital?.a;
    return orbit != null ? `${type} • ${orbit.toFixed(2)} AU` : `${type}`;
  }

  _findBody(bodyId) {
    if (!bodyId) return null;
    const TYPES = ['planet', 'moon', 'asteroid', 'comet', 'planetoid'];
    for (const t of TYPES) {
      const found = EntityManager.getByType(t).find(b => b.id === bodyId);
      if (found) return found;
    }
    return null;
  }
}
