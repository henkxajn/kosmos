// DirectorDoctrine — dwie doktryny operacyjne na postawie (W1-5, WOJNA I POKÓJ 1.0, workstream B).
//
// P1 mówi: trzy CIENKIE warstwy. Postawa strategiczna (już jest — `director.posture`) →
// DOKTRYNA operacyjna (ten plik) → egzekucja taktyczna (istniejące DSCS/BattleSystem, nietknięte).
// Doktryny to STANY na postawie, nie nowa maszyneria: dane w katalogu reguł + JEDNA zarejestrowana
// akcja, dokładnie jak `pressureResponse` z S6 (decyzja 7).
//
// Surowiec bierze się sam: V15 zmierzył, że okręty z nacisku L1/L2 lądują ZADOKOWANE przy stolicy
// AI i NIC ich nigdy nie rusza. `frigate_system_defender` nie ma baku warp Z ZAŁOŻENIA — to już
// jest zasób pod `defend_home`.
//
// ── Dwie doktryny ───────────────────────────────────────────────────────────────────────────
//   defend_home    — garnizon. Okręt STOI przy stolicy; przy braku zagrożenia NIE dostaje rozkazu
//                    ruchu (trzymanie pozycji to brak ruchu, nie rozkaz „stój"). Jeśli zabłądził
//                    poza stolicę, dostaje `moveToPoint` z powrotem.
//   patrol_border  — ⚠ K-4: patrol WEWNĄTRZSYSTEMOWY po ZEWNĘTRZNYCH orbitach WŁASNEGO układu
//                    AI, czyli po stronie, z której nadlatuje gracz. Pierwotne „patrolowanie
//                    granicy" w LY jest NIEWYRAŻALNE dzisiejszą maszynerią: `InfluenceMap` mówi
//                    o UKŁADACH w skali lat świetlnych, a rozkazy `MovementOrderSystem` są
//                    w współrzędnych WEWNĄTRZ układu — mostka między nimi nie ma. Prawdziwy
//                    patrol międzysystemowy czeka na model rozmieszczenia z W2.
//
// ⚠ Kanał rozkazu: `MOS.issueOrder` z `bypassFuelCheck` (decyzja 12), wzorem produkcyjnym
// `AutoRetreatSystem`. Kolonie AI NIE trzymają paliwa, więc bez obejścia powtarzalny patrol
// zostałby prędzej czy później odrzucony. To jest konsekwencja ZADEKLAROWANA, nie ukryta —
// stoi w skrypcie gate'u. Odrzucone: `dispatchOnMission` (cicho przycina paliwo i omija cały
// system rozkazów).
//
// ⚠ Stan pod `director.doctrine` — SIOSTRZANY klucz, NIE `director.posture` (decyzja 14).
// Keeper nacisku pinuje dokładny, trzypolowy kształt `posture`, a V12 pokazał, że `level` nie
// jest nawet monotoniczne (L1 potrafi nadpisać stempel L2 po swoim cooldownie) — kiepskie
// źródło prawdy dla doktryny. Domena `director` już istnieje w `createDefaultState`, więc
// żadnego NOWEGO klucza najwyższego poziomu nie dokładamy (decyzja 8).

import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import EntityManager from '../../core/EntityManager.js';
import { DirectorProbes, DirectorGuards, DirectorActions } from './DirectorRegistry.js';
import { isEnemyVessel, hasWeapons } from '../../entities/Vessel.js';

/** Ile promienia orbity zewnętrznej bierzemy na pierścień patrolu (1.0 = po orbicie skrajnej). */
const PATROL_RING_FACTOR = 0.9;
/** O ile radianów przesuwa się punkt patrolu przy każdym kolejnym wydaniu rozkazu. */
const PATROL_STEP_RAD = Math.PI / 3;
/** Minimalny promień pierścienia, gdyby układ okazał się mikroskopijny (AU). */
const PATROL_MIN_RADIUS_AU = 6;
/** Górna klamra pierścienia (AU) — patrol pilnuje PODEJŚCIA, nie obłoku kometarnego. */
const PATROL_MAX_RADIUS_AU = 30;

export class DirectorDoctrine {
  /**
   * Kształt `director.doctrine` PO restore. Wołane tą samą ścieżką co `DirectorPressure`
   * i `DirectorSystem` — czyli TYLKO przy wczytaniu zapisu; na nowej grze klucz jest
   * `undefined`, więc KAŻDY czytelnik musi być defensywny (`?? {}`). To jest ta sama
   * pułapka, którą V12 opisał dla `posture`.
   */
  static initSubdomain() {
    if (!gameState.get('director.doctrine')) gameState.set('director.doctrine', {}, 'director_init');
  }

  static get(empireId) {
    return gameState.get(`director.doctrine.${empireId}`) ?? null;
  }

  // ── Sonda ─────────────────────────────────────────────────────────────────────────────────

  /**
   * Ile UZBROJONYCH, BEZCZYNNYCH okrętów imperium stoi przy jego stolicy.
   * „Bezczynny" = bez misji i bez rozkazu ruchu — czyli dokładnie stan opisany w V15.
   */
  countIdleArmedAtCapital(empireId) {
    return this._idleArmedAtCapital(empireId).length;
  }

  // ── Akcja ─────────────────────────────────────────────────────────────────────────────────

  /**
   * Przypisz doktrynę bezczynnym okrętom przy stolicy.
   * @param {object} ctx    — { empireId, year } z DirectorSystem
   * @param {object} params — { doctrine: 'defend_home' | 'patrol_border', count?: number }
   */
  assignDoctrine(ctx, params = {}) {
    const { empireId, year } = ctx ?? {};
    const doctrine = params.doctrine;
    if (doctrine !== 'defend_home' && doctrine !== 'patrol_border') {
      throw new Error(`[DirectorDoctrine] nieznana doktryna: ${doctrine}`);
    }
    const wanted = Math.max(1, params.count ?? 2);
    const pool = this._idleArmedAtCapital(empireId);
    if (pool.length === 0) return { assigned: 0, doctrine };

    const chosen = pool.slice(0, wanted);
    const assignedIds = [];
    for (const v of chosen) {
      const ok = doctrine === 'patrol_border'
        ? this._sendOnPatrol(v, empireId, year)
        : this._holdAtHome(v, empireId);
      if (ok) assignedIds.push(v.id);
    }

    const prev = DirectorDoctrine.get(empireId) ?? {};
    gameState.set(`director.doctrine.${empireId}`, {
      ...prev,
      [doctrine]: assignedIds,
      lastAssignedYear: year ?? 0,
    }, `director_doctrine_${doctrine}`);

    EventBus.emit('director:doctrineAssigned', { empireId, doctrine, vesselIds: assignedIds });
    return { assigned: assignedIds.length, doctrine };
  }

  // ── Realizacja doktryn ────────────────────────────────────────────────────────────────────

  /**
   * `defend_home` — garnizon. Okręt PRZY stolicy nie dostaje żadnego rozkazu: trzymanie pozycji
   * to BRAK ruchu, a nie rozkaz „stój". Wydawanie mu `moveToPoint` na własną orbitę zwolniłoby
   * orbitę w `OrbitalSpaceSystem` i wywołało desync sprite'a opisany dla Engage.
   */
  _holdAtHome(vessel, empireId) {
    const capitalId = this._capitalBodyId(empireId);
    if (!capitalId) return false;
    if (vessel.position?.dockedAt === capitalId) return true;      // już na miejscu — HOLD
    return this._issue(vessel, {
      type: 'moveToPoint', targetBodyId: capitalId,
      issuedBy: 'doctrine_defend_home', bypassFuelCheck: true,
    });
  }

  /**
   * `patrol_border` — posterunek przy jednej z ZEWNĘTRZNYCH planet własnego układu.
   *
   * ⚠ Celujemy w CIAŁO (`targetBodyId`), nie w wolny punkt, i to jest wymuszone zachowaniem
   * `MovementOrderSystem`: `_issueMoveToPoint` i tak PRZYCIĄGA wolny punkt do najbliższego
   * ciała (`_findBodyNearPoint`), a potem przewiduje jego pozycję na moment przylotu — bo
   * „leć do X" ma w tej grze znaczyć „orbituj X". Pierwsza wersja podawała punkt na
   * pierścieniu 17 AU i MOS przyciągnął go do przypadkowej KOMETY, wysyłając patrol na
   * **102 AU** — poza układ. Wybór ciała wprost jest deterministyczny i trzyma patrol tam,
   * gdzie ma być: na zewnętrznych orbitach, po stronie, z której nadlatuje gracz.
   */
  _sendOnPatrol(vessel, empireId, year) {
    const bodyId = this._patrolBodyId(empireId, vessel, year);
    if (!bodyId) return false;
    const body = EntityManager.get(bodyId);
    if (!body) return false;
    // ⚠ CIAŁO **i** punkt zapasowy — `validateOrder` wymaga `targetPoint` dla `moveToPoint`
    // nawet przy podanym ciele (ten sam wzór co `buildOrderSpec` dla planety: bodyId +
    // fallback point). Punkt to bieżąca pozycja ciała; MOS i tak przeliczy ją na pozycję
    // przewidywaną w momencie przylotu.
    return this._issue(vessel, {
      type: 'moveToPoint', targetBodyId: bodyId,
      targetPoint: { x: body.x ?? 0, y: body.y ?? 0 },
      issuedBy: 'doctrine_patrol_border', bypassFuelCheck: true,
    });
  }

  _issue(vessel, spec) {
    const mos = window.KOSMOS?.movementOrderSystem;
    // Głośno (R12): brak systemu rozkazów to błąd wpięcia, nie stan gry.
    if (!mos?.issueOrder) throw new Error('[DirectorDoctrine] brak `window.KOSMOS.movementOrderSystem`');
    const res = mos.issueOrder(vessel.id, spec);
    if (!res?.ok) {
      console.warn('[DirectorDoctrine] rozkaz odrzucony', { vesselId: vessel.id, spec: spec.type, reason: res?.reason });
      return false;
    }
    return true;
  }

  // ── Pomocnicze ────────────────────────────────────────────────────────────────────────────

  /** Stolica WYŁĄCZNIE przez kanoniczny akcesor — reguła skryptów gate'ów. */
  _capitalBodyId(empireId) {
    const cap = window.KOSMOS?.directorProduction?.capitalOf?.(empireId);
    return cap?.planetId ?? cap?.id ?? null;
  }

  _capitalBody(empireId) {
    const id = this._capitalBodyId(empireId);
    if (!id) return null;
    return window.KOSMOS?.colonyManager?.getColony?.(id)
      ? window.KOSMOS?.entityManager?.get?.(id) ?? null
      : window.KOSMOS?.entityManager?.get?.(id) ?? null;
  }

  /** Uzbrojone, bezczynne okręty imperium stojące przy jego stolicy. */
  _idleArmedAtCapital(empireId) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr?._vessels) return [];
    const capitalId = this._capitalBodyId(empireId);
    if (!capitalId) return [];
    const out = [];
    for (const v of vMgr._vessels.values()) {
      if (!v || v.isWreck) continue;
      if (!isEnemyVessel(v)) continue;                       // tylko okręty AI
      if ((v.ownerEmpireId ?? v.owner) !== empireId) continue;
      if (!hasWeapons(v)) continue;                          // doktryny są dla okrętów BOJOWYCH
      if (v.position?.dockedAt !== capitalId) continue;      // stan z V15: zadokowany przy stolicy
      if (v.mission) continue;                               // ma zajęcie
      if (v.movementOrder) continue;                         // już pod doktryną albo rozkazem
      out.push(v);
    }
    return out;
  }

  /**
   * Punkt na pierścieniu ZEWNĘTRZNYCH orbit układu stolicy. Kąt przesuwa się z każdym
   * wydaniem rozkazu, więc kolejne rozkazy tworzą obchód, a nie dryf w jedno miejsce.
   */
  _patrolBodyId(empireId, vessel, year) {
    const capital = this._capitalBody(empireId);
    const systemId = capital?.systemId ?? vessel.systemId ?? 'sys_home';
    const outer = this._outerPlanets(systemId);
    if (outer.length === 0) return null;
    // Ziarno: id statku + rok — deterministyczne, ale różne dla różnych okrętów, więc dwa
    // patrole nie ustawiają się przy tej samej planecie, a kolejne rozkazy tworzą obchód.
    const seed = this._hash(vessel.id) + Math.floor(Number(year) || 0);
    return outer[seed % outer.length].id;
  }

  /**
   * Kandydaci na posterunek: PLANETY własnego układu leżące na zewnętrznej połowie orbit,
   * posortowane od najdalszej. Bez komet i planetoid — patrol pilnuje PODEJŚCIA do
   * zamieszkanego układu, a nie peryferii obłoku kometarnego.
   */
  _outerPlanets(systemId) {
    const planets = (EntityManager.getByTypeInSystem('planet', systemId) ?? [])
      .filter(p => Number(p?.orbital?.a) > 0)
      .sort((a, b) => (Number(b.orbital.a) || 0) - (Number(a.orbital.a) || 0));
    if (planets.length === 0) return [];
    const maxA = Number(planets[0].orbital.a) || 0;
    const cut = maxA * PATROL_RING_FACTOR;
    const outer = planets.filter(p => (Number(p.orbital.a) || 0) >= Math.min(cut, maxA));
    return outer.length > 0 ? outer : [planets[0]];
  }

  /**
   * Promień pierścienia patrolu = orbita najdalszej PLANETY × współczynnik.
   *
   * ⚠ Liczymy WYŁĄCZNIE planety. Pierwsza wersja brała maksimum po WSZYSTKICH ciałach układu
   * i wychodziło **102 AU** — bo w układzie siedzą komety i planetoidy o ogromnych półosiach.
   * Patrol obronny ma pilnować PODEJŚCIA do zamieszkanego układu, a nie lecieć na peryferie
   * obłoku kometarnego; okręt z takim rozkazem po prostu odleciałby z gry.
   * Klamra `PATROL_MAX_RADIUS_AU` chroni przed układem-dziwolągiem.
   */
  _outerRadiusAU(systemId) {
    // ⚠ EntityManager importowany WPROST, nie przez `window.KOSMOS`: to singleton RDZENIA,
    //   nie system (CLAUDE.md zabrania importów system↔system; rdzeń jest w porządku — tak
    //   samo robi WarSystem). Pierwsza wersja czytała `window.KOSMOS.entityManager`, którego
    //   HEADLESS NIE MONTUJE — promień cicho spadał do podłogi 6 AU i patrol tuliłby się do
    //   gwiazdy zamiast pilnować podejścia. Dokładnie ten rodzaj cichego no-opu, którego
    //   zakazuje R12, i widać go było dopiero po zajrzeniu do liczby.
    let maxA = 0;
    for (const e of EntityManager.getByTypeInSystem('planet', systemId) ?? []) {
      const a = Number(e?.orbital?.a) || 0;
      if (a > maxA) maxA = a;
    }
    const r = maxA * PATROL_RING_FACTOR;
    return Math.min(PATROL_MAX_RADIUS_AU, Math.max(PATROL_MIN_RADIUS_AU, r));
  }

  _hash(s) {
    let h = 0;
    for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0;
    return Math.abs(h);
  }
}

/**
 * Rejestracja nazw katalogowych. ⚠ MUSI biec PRZED `new DirectorSystem()` — konstruktor
 * rozwiązuje każdą nazwę z katalogu i RZUCA przy braku (decyzja 7). `allowOverride: true`
 * jak wszystkie trzy istniejące rejestratory.
 */
export function registerDoctrineBehaviors(instance, { allowOverride = false } = {}) {
  DirectorProbes.register('idleArmedVesselsAtCapital',
    ({ empireId }) => instance.countIdleArmedAtCapital(empireId), { allowOverride });

  DirectorActions.register('assignDoctrine',
    (ctx, params) => instance.assignDoctrine(ctx, params), { allowOverride });

  // Doktryna ma sens tylko dla imperium, które w ogóle ma czym dowodzić — sonda i tak to
  // sprawdza, ale guard trzyma czytelność reguły w katalogu.
  DirectorGuards.register('empireHasIdleWarships',
    ({ empireId }) => instance.countIdleArmedAtCapital(empireId) > 0, { allowOverride });
}
