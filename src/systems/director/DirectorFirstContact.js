// DirectorFirstContact — łańcuch pierwszego kontaktu (workstream C, Slice 1, commit S5).
//
// Sondy/guardy/akcje reguły `first_contact` + cykl życia PRZELOTU: spawn (createVessel →
// stempel własności → rejestr → `vessel:created`/`vessel:launched`), kurs przez układ gracza,
// despawn na wyjściu, przejęcie beatu narracyjnego i konsekwencja zestrzelenia.
//
// ⚠ TRZY RZECZY, KTÓRE POCHODZĄ Z AUDYTU (§Audit C/D), NIE Z GUSTU:
//
//  1. NIE MA „neutralnego obcego statku". `isEnemyVessel` zwraca true dla `isEnemy===true`
//     LUB `owner!=='player'` LUB `ownerEmpireId!=='player'` (`Vessel.js:385-391`), więc sonda
//     badawcza obcych jest wroga Z KONSTRUKCJI i uzbrojony statek gracza może ją zestrzelić
//     jednostronnie (`DeepSpaceCombatSystem`: „uzbrojony vs bezbronny = walka rusza normalnie").
//     To NIE jest defekt do naprawy w Slice 1 — to jest powód, dla którego istnieje
//     `first_contact_kill` (decyzja 4).
//
//  2. DETEKCJA JEST DARMOWA I PEWNA. Radar obserwatorium nasyca się na L4 (`Infinity`), a próg
//     reguły to L5 (decyzja 3 — bramka NARRACYJNA, nie sensoryczna). Przelotu nie da się
//     przegapić i to jest przyjęte świadomie. Realnym problemem był nadmiar, nie brak:
//     DWA popupy o tym samym zdarzeniu — stąd przejęcie beatu (decyzja 5).
//
//  3. KURS MUSI PRZEŻYĆ ZAPIS. `VesselManager.serialize` ma BIAŁĄ LISTĘ pól, więc kurs
//     dopisany na obiekcie statku (`vessel.flyby = …`) zginąłby przy wczytaniu i sonda
//     zawisłaby na zawsze w połowie układu. Kurs mieszka w `gameState.director.flybys`
//     (wzór pod-domeny — decyzja 7, zero migracji: pusty domyślny kształt).

import EventBus from '../../core/EventBus.js';
import gameState from '../../core/GameState.js';
import { createVessel } from '../../entities/Vessel.js';
import { resolveTemplate } from '../../utils/ShipTemplateResolver.js';
import { DirectorProbes, DirectorGuards, DirectorActions } from './DirectorRegistry.js';
import { queueMissionEvent } from '../../ui/MissionEventModal.js';
import { t } from '../../i18n/i18n.js';

/** Ile lat WYŚWIETLANYCH trwa przelot od wejścia do wyjścia z układu. */
const FLYBY_DURATION_YEARS = 6.0;
/** Promień wejścia/wyjścia w px sceny (poza orbitami, ale w zasięgu radaru L5 = ∞). */
const FLYBY_RADIUS_PX = 2600;

export class DirectorFirstContact {
  constructor() {
    this._onTick = ({ deltaYears } = {}) => this._tickFlybys(deltaYears);
    this._onSighting = (payload) => this._onFirstSighting(payload);
    this._onLost = (payload) => this._onVesselLost(payload);

    EventBus.on('time:tick', this._onTick);
    EventBus.on('vessel:firstSighting', this._onSighting);
    EventBus.on('vessel:wrecked', this._onLost);
    EventBus.on('vessel:destroyed', this._onLost);
  }

  dispose() {
    EventBus.off('time:tick', this._onTick);
    EventBus.off('vessel:firstSighting', this._onSighting);
    EventBus.off('vessel:wrecked', this._onLost);
    EventBus.off('vessel:destroyed', this._onLost);
  }

  /**
   * Kształt `director.flybys` PO restore (decyzja 7 — `GameState.restore` podmienia domenę
   * w całości, więc pod-klucz dodany później nie uzupełniłby się w starym zapisie).
   */
  static initSubdomain() {
    if (!gameState.get('director.flybys')) gameState.set('director.flybys', {}, 'director_init');
  }

  // ── Kolaboratorzy — GŁOŚNO (zasada 1 architektury Directora) ───────────────

  _require(name) {
    const dep = window.KOSMOS?.[name];
    if (!dep) throw new Error(`[DirectorFirstContact] brak kolaboratora \`window.KOSMOS.${name}\``);
    return dep;
  }

  _year() { return this._require('timeSystem').gameTime ?? 0; }

  // ── Rejestr przelotów ─────────────────────────────────────────────────────

  /** Czy statek jest AKTYWNYM przelotem pierwszego kontaktu. */
  isFlyby(vesselId) {
    if (!vesselId) return false;
    return !!gameState.get(`director.flybys.${vesselId}`);
  }

  getFlyby(vesselId) { return gameState.get(`director.flybys.${vesselId}`) ?? null; }

  // ── AKCJA: przelot sondy badawczej ────────────────────────────────────────

  /**
   * Spawnuje sondę obcych na krawędzi układu gracza i wysyła ją kursem NA WYLOT.
   * Wzór spawnu: createVessel → stempel własności → rejestr → `vessel:created` +
   * `vessel:launched`. (⚠ W3-8: pierwowzór `EmpireFleetMaterializer` już nie istnieje —
   * to jest dziś jedyne żywe miejsce z tym wzorem.)
   *
   * ⚠ `colonyId` przekazywany do `createVessel` to POZYCJA (planeta gracza), nie właściciel —
   * ta sama pułapka, którą `CLAUDE.md` opisuje przy S3.4d. Właściciel idzie stemplem niżej.
   */
  scienceFlyby(ctx, params = {}) {
    const { empireId, empire } = ctx;
    const templateId = params.template ?? 'science_probe';
    // Lewary gate'u (NIE dla reguły — ta nie podaje żadnego z nich): wolniejszy przelot daje
    // graczowi czas na przechwycenie, mniejszy promień stawia sondę bliżej domu. Bez tego
    // zestrzelenie jest praktycznie nietestowalne — statki gracza są wolniejsze od sondy.
    const durationYears = Number(params.durationYears) > 0 ? Number(params.durationYears) : FLYBY_DURATION_YEARS;
    const radiusPx      = Number(params.radiusPx)      > 0 ? Number(params.radiusPx)      : FLYBY_RADIUS_PX;

    const reg = this._require('empireRegistry');
    const vm  = this._require('vesselManager');
    const emp = empire ?? reg.get(empireId);

    // Sonda OBCYCH nie zależy od techu gracza; imperium ma własną drabinkę, a `science_probe`
    // ma gwarantowane dno (`engine_chemical` z `requires: null`), więc resolve nie może zawieść
    // z powodu techu. `ctx` MUSI nieść źródło techu — resolver rzuca zamiast degradować.
    const r = resolveTemplate(templateId, { isResearched: () => true, archetype: emp?.archetype });
    if (!r?.ok) {
      EventBus.emit('director:flybyRejected', { empireId, templateId, reason: r?.reason ?? 'resolve_failed' });
      return null;
    }

    const home = window.KOSMOS?.homePlanet;
    const hx = home?.x ?? 0;
    const hy = home?.y ?? 0;

    // Kurs deterministyczny per imperium — ten sam seed daje ten sam przelot (bez Math.random,
    // żeby przebieg gate'u był powtarzalny).
    const ang = this._courseAngle(empireId);
    const fromX = hx + Math.cos(ang) * radiusPx;
    const fromY = hy + Math.sin(ang) * radiusPx;
    const toX   = hx - Math.cos(ang) * radiusPx;
    const toY   = hy - Math.sin(ang) * radiusPx;

    let vessel;
    try {
      vessel = createVessel(r.hullId, home?.id ?? 'sys_home', {
        modules:  r.modules,
        x: fromX, y: fromY,
        systemId: window.KOSMOS?.homeSystemId ?? 'sys_home',
        name:     `${emp?.namePL ?? emp?.name ?? 'Obcy'} — ${t('director.flybyProbeName')}`,
      });
    } catch (e) {
      // GŁOŚNO (zasada 1) — spawn, który zawiódł po cichu, to dokładnie ten tryb awarii,
      // przez który martwe `EconAI`/`MilitaryAI` przetrwały niezauważone.
      console.warn(`[DirectorFirstContact] createVessel fail dla ${r.hullId}:`, e.message);
      EventBus.emit('director:flybyRejected', { empireId, templateId, reason: `createVessel: ${e.message}` });
      return null;
    }

    vessel.ownerEmpireId = empireId;
    vessel.owner         = empireId;
    vessel.isEnemy       = true;
    vessel.position.state    = 'orbiting';
    vessel.position.dockedAt = null;
    vessel.status            = 'idle';

    vm._vessels.set(vessel.id, vessel);

    const year = this._year();
    gameState.set(`director.flybys.${vessel.id}`, {
      empireId, templateId,
      fromX, fromY, toX, toY,
      startYear: year,
      endYear:   year + durationYears,
      beatFired: false,
    }, 'director_flyby_started');

    EventBus.emit('vessel:created',  { vessel });
    EventBus.emit('vessel:launched', { vessel });

    EventBus.emit('director:flybyStarted', { empireId, vesselId: vessel.id, templateId });
    return vessel.id;
  }

  /**
   * Przesuwa AKTYWNY przelot o wektor (dx, dy) — razem z kursem.
   *
   * ⚠ Bez rebasowania kursu teleport sondy jest BEZUŻYTECZNY: `_tickFlybys` liczy pozycję
   * z `fromX/fromY → toX/toY` co tik, więc nadpisałby ją przy najbliższym tiku. Lewar do
   * gate'u (G2.16/G2.17) musi przesunąć JEDNO I DRUGIE.
   *
   * @returns {boolean} czy statek był przelotem (i został przesunięty)
   */
  shiftFlybyCourse(vesselId, dx, dy) {
    const fb = this.getFlyby(vesselId);
    if (!fb) return false;
    gameState.set(`director.flybys.${vesselId}`, {
      ...fb,
      fromX: fb.fromX + dx, fromY: fb.fromY + dy,
      toX:   fb.toX   + dx, toY:   fb.toY   + dy,
    }, 'director_flyby_shift');
    return true;
  }

  /** Kąt kursu wyprowadzony z id imperium — deterministyczny, bez Math.random. */
  _courseAngle(empireId) {
    let h = 0;
    for (const ch of String(empireId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return ((h % 360) * Math.PI) / 180;
  }

  // ── Ruch + despawn ────────────────────────────────────────────────────────

  _tickFlybys() {
    const all = gameState.get('director.flybys') ?? {};
    const ids = Object.keys(all);
    if (ids.length === 0) return;

    const vm = window.KOSMOS?.vesselManager;
    if (!vm) return;
    const year = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const moved = [];

    for (const id of ids) {
      const fb = all[id];
      if (!fb) continue;
      const vessel = vm.getVessel?.(id);

      // Statek zniknął inaczej niż przez nasz despawn (zestrzelony, wygaszony wrak) —
      // rejestr nie może zostać ze zjawą.
      if (!vessel) { gameState.set(`director.flybys.${id}`, null, 'director_flyby_gone'); continue; }
      if (vessel.isWreck) continue;   // wrak zostaje na scenie; kurs się nie liczy

      const span = Math.max(1e-6, (fb.endYear ?? 0) - (fb.startYear ?? 0));
      const tRaw = (year - (fb.startYear ?? 0)) / span;
      const tt   = Math.max(0, Math.min(1, tRaw));

      vessel.position.x = fb.fromX + (fb.toX - fb.fromX) * tt;
      vessel.position.y = fb.fromY + (fb.toY - fb.fromY) * tt;
      moved.push(vessel);

      if (tRaw >= 1) this._despawn(id, fb, 'exited_system');
    }

    // ⚠ MESH PO WCZYTANIU ZAPISU (rozbieżność 1 z GATE 2). Sonda jest jedynym statkiem, którego
    // NIE rusza `VesselManager._updatePositions`, więc nigdy nie trafiała do `moving[]` w
    // `vessel:positionUpdate`. A to jest JEDYNY kanał, którym `ThreeRenderer._syncVesselPositions`
    // leniwie ODTWARZA brakujący sprite (`if (!entry) _addVesselSprite`). Skutek: po wczytaniu
    // zapisu stan żył (kurs, rejestr, panel floty), ale na mapie 3D nie było nic — ta sama klasa
    // wady co `fix-stacje-3d-bramka-ukladu` (restore odtwarza STAN, nie MESH).
    //
    // System, który rusza statkami, ma obowiązek ogłaszać ruch tym samym kanałem co wszyscy
    // pozostali — inaczej każdy konsument pozycji (sprite, radar, stożki) musi znać wyjątek.
    if (moved.length) EventBus.emit('vessel:positionUpdate', { vessels: moved });
  }

  _despawn(vesselId, fb, reason) {
    const vm = window.KOSMOS?.vesselManager;
    vm?._vessels?.delete(vesselId);
    window.KOSMOS?.threeRenderer?._removeVesselSprite?.(vesselId);
    gameState.set(`director.flybys.${vesselId}`, null, 'director_flyby_done');
    EventBus.emit('vessel:destroyed', { vesselId });
    EventBus.emit('director:flybyEnded', { empireId: fb?.empireId ?? null, vesselId, reason });
  }

  // ── Beat narracyjny (decyzja 5 — Director PRZEJMUJE) ──────────────────────

  /**
   * `ObservatorySystem` oznacza wykrycie przelotu flagą `firstContactFlyby`, GameScene swój
   * generyczny popup wtedy pomija, a gracz dostaje TEN beat. Jeden fakt = jeden popup.
   */
  _onFirstSighting({ vessel, empireId, firstContactFlyby } = {}) {
    if (!firstContactFlyby || !vessel) return;
    const fb = this.getFlyby(vessel.id);
    if (!fb || fb.beatFired) return;

    gameState.set(`director.flybys.${vessel.id}`, { ...fb, beatFired: true }, 'director_flyby_beat');

    // Intel imperium → `rumor` (idempotentne; ścieżka detekcji też to robi).
    window.KOSMOS?.intelSystem?.advanceIntel?.(empireId, 'rumor', 'first_contact_flyby');

    const empName = window.KOSMOS?.empireRegistry?.get?.(empireId)?.name ?? t('director.unknownEmpire');
    // Kanał BEZ przycisku, który cokolwiek robi — beat jest czysto narracyjny, więc mieści
    // się w Slice 1 (czasowniki dyplomatyczne to D4).
    queueMissionEvent({
      severity:    'info',
      barTitle:    t('director.firstContactBar'),
      barRight:    '',
      svgKey:      'report',
      svgLabel:    '🛸',
      // ⚠ WIDEO WPROST. Bez `videoSrc` `buildScheduledEventPopup` wybiera plik z `svgKey` przez
      //   `SVG_TO_VIDEO` (`ScheduledEventPopup.js:443-446`), a 'report' → 'science' — czyli flagowy
      //   beat pierwszego kontaktu leciał na generyku, mimo że `first_contact.mp4` leżał w repo.
      //   Nazwa pliku wystarcza WYŁĄCZNIE na łańcuchu zdarzeń harmonogramowych (`<event.id>.mp4`,
      //   `GameScene.js:3030`), a ta reguła nim nie jest. Jawny `videoSrc` to wzorzec wspierany
      //   (`DiplomacyRefusalModal.js:107` podaje `videoSrc: []`, żeby wideo WYŁĄCZYĆ), a `_loadVideo`
      //   sprawdza każdy src zapytaniem HEAD, więc ogniwa zapasowe są bezpieczne.
      videoSrc:    ['assets/event-videos/first_contact.mp4', 'assets/event-videos/science.mp4', 'assets/event-videos/default.mp4'],
      prompt:      '> OBSERVE_',
      headline:    t('director.firstContactTitle'),
      description: t('director.firstContactBody', empName),
      buttons:     [{ label: '[ENTER] OK', primary: true }],
    });

    EventBus.emit('director:firstContactBeat', { empireId, vesselId: vessel.id });
  }

  // ── Konsekwencja zestrzelenia (decyzja 4) ─────────────────────────────────

  _onVesselLost({ vesselId, vessel } = {}) {
    const id = vesselId ?? vessel?.id;
    if (!id) return;
    const fb = this.getFlyby(id);
    if (!fb) return;                       // nie nasz statek albo już rozliczony

    // Rozliczamy WYŁĄCZNIE zestrzelenie. Naturalne wyjście z układu przechodzi przez
    // `_despawn`, który czyści wpis PRZED emisją `vessel:destroyed`, więc tu nie dotrze.
    gameState.set(`director.flybys.${id}`, null, 'director_flyby_killed');

    const dipl = window.KOSMOS?.diplomacySystem;
    dipl?.addOpinionModifier?.(fb.empireId, 'player', 'first_contact_kill', { source: `flyby_${id}` });
    dipl?.addMemory?.(fb.empireId, 'first_contact_kill', { vesselId: id, year: this._year() });

    EventBus.emit('director:firstContactKill', { empireId: fb.empireId, vesselId: id });
  }
}

/**
 * Rejestracja nazw w rejestrach Directora. Osobna funkcja (wzór `registerProductionGuards`),
 * bo rejestry są modułowe, a instancja systemu — nie.
 */
export function registerFirstContactBehaviors(instance, { allowOverride = false } = {}) {
  DirectorProbes.register('playerObservatoryLevel', () => {
    const obs = window.KOSMOS?.observatorySystem;
    if (!obs) throw new Error('[DirectorFirstContact] brak `window.KOSMOS.observatorySystem`');
    return obs.getMaxObservatoryLevel();      // tylko kolonie GRACZA (filtr w ObservatorySystem)
  }, { allowOverride });

  DirectorGuards.register('empireNotAtWarWithPlayer', ({ empireId }) => {
    const dipl = window.KOSMOS?.diplomacySystem;
    if (!dipl) throw new Error('[DirectorFirstContact] brak `window.KOSMOS.diplomacySystem`');
    return dipl.getStatus(empireId) !== 'war';
  }, { allowOverride });

  DirectorActions.register('scienceFlyby', (ctx, params) => instance.scienceFlyby(ctx, params), { allowOverride });
}
