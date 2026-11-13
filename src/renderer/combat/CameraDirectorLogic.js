// CameraDirectorLogic — KAMERA REŻYSERA bitwy (ARC COMBAT VISUALS, krok CV-7; plan §2.7, D-CV-23, D-CV-24 pogodzone z D-CV-9
// w §3.1-3; Findingi 658, 710; flaga `cvDirector`).
//
// Czysta logika: bez three, bez DOM, bez `window` — wykonuje się pod node (keeper `cv_director_logic_smoke` — wykonaniem, nie
// lekturą). Klej z rendererem — `src/renderer/CvDirector.js` (kamera, chip, zegary, wstrząs, przewodnik 9:16).
//
// Cztery części:
//   1. HARMONOGRAM UJĘĆ (`DirectorSchedule`) — deterministyczny z ziarna starcia i zniszczeń z rejestru salw (CV-4a), na zegarze
//      PREZENTACJI (pauza = pauza: reżyser stoi). Ujęcia: plan ogólny (powolny obrót wokół całej rysowanej bitwy), za okrętem
//      flagowym, pojedynek (dwa okręty: najzajętszy strzelec → cel), przelot (nisko, wzdłuż lecącej fregaty — kurs choreografii
//      2.0), bohater (wielkie zniszczenie: niszczyciel i większe albo ostatni okręt strony — ujęcie TUŻ PRZED trafieniem
//      zabijającym, które rejestr zna z wyprzedzeniem, i trzymanie przez wybuch CV-5), szeroki kadr (co kilka ujęć — bitwa
//      wypełnia kadr, #710) i wynik (szeroki kadr na koniec). Reguły: to samo ujęcie nigdy dwa razy z rzędu; każde ujęcie trwa
//      co najmniej `DIR_SHOT_MIN_MS` (także przed wynikiem); bohater ma WŁASNY rytm — przerywa ujęcie, które trwa już co najmniej
//      `DIR_HERO_PREEMPT_MIN_MS` (inaczej czeka albo przepada); cięcie (przelot, bohater spoza kadru) najwyżej raz na `DIR_CUT_GAP_MS`
//      (`shotCut`) — tempo po kontroli właściciela CV-7 (2026-11-13: „tempo przejść ujęć trochę zbyt szybkie”).
//   2. SPOWOLNIENIE BOHATERA (`PresentationWarp`) — wyłącznie prezentacja (§3.1-3): 0,35× przez najwyżej 0,8 s czasu realnego,
//      dodatkowe opóźnienie twardo ≤ 1,5 R (ujęcie kończy się wcześniej), potem doganianie 1,25×; nowy bohater dopiero przy
//      opóźnieniu < 1 R; bitwa skończona w trakcie spowolnienia albo doganiania — reszta zdarzeń w tempie 1,25× po końcu logiki.
//      Tempo rund (`combatRoundMs`) i logika nietknięte — mnożnik dostają WYŁĄCZNIE zegary prezentacji (jedno źródło: FX,
//      choreografia, rejestr i HUD czytają te zegary).
//   3. KADR UJĘCIA (`frameShot`) — na `fitWatchFrame` (pozycje RYSOWANE, scena bitwy) w prostokącie bezpiecznym (pasek walki,
//      `MapInsets`) albo w prostokącie 9:16 (`promoSafe916`); STRAŻNICY (`guardCamera`): kamera nigdy w kadłubie, w ciele ani
//      w gwieździe, linia widzenia nigdy przez gwiazdę.
//   4. WSTRZĄS (`ShakeState`) — mały, wyłącznie prezentacja, przy bliskich wielkich trafieniach i wybuchach w kadrze, ze skalą
//      rozmiaru i odległości, z sufitem, nigdy w zoomie taktycznym.
// Losowość wyłącznie z ziarna (mulberry32 rejestru salw) — nigdy `Math` losujący (reguła CV-0b).
// Jednostki: czasy [ms] (prezentacji, chyba że napisano „realnego”), odległości [j.] świata 3D (1 AU = 11 j.), kąty kamery
// kontrolera — θ (azymut) i φ (kąt biegunowy od osi +Y) w radianach, pokrętła kątów w stopniach.

import { fitWatchFrame, cameraBasis } from '../CombatWatchLogic.js';
import { ledgerHash, ledgerRng } from './CombatLedgerLogic.js';

/**
 * Pokrętła reżysera — na żywo (`KOSMOS.threeRenderer.cvTuning.DIR_*`, alias w `LIVE_CV_FX`); czytane co klatkę i przy każdym
 * ujęciu. Bez pinów na wartościach (F11) — keeper czyta liczby z tej tabeli.
 */
export const DIR_TUNING = Object.freeze({
  // Harmonogram
  // Tempo — kontrola właściciela CV-7 (2026-11-13): „ujęcia OK, tempo przejść ujęć trochę zbyt szybkie” (było: minimum 1,8 s,
  // ujęcia 1,8–5 s, przejście 0,9 s, wynik 3,5 s).
  DIR_SHOT_MIN_MS:      3500,   // najkrótsze ujęcie (każde — także przed wynikiem; przerwanie przez bohatera — DIR_HERO_PREEMPT_MIN_MS)
  DIR_EST_MIN_MS:       5000,   // plan ogólny (dłuższy — wejście w bitwę)
  DIR_EST_MAX_MS:       6500,
  DIR_FOLLOW_MIN_MS:    4500,   // za okrętem flagowym
  DIR_FOLLOW_MAX_MS:    7000,
  DIR_DUEL_MIN_MS:      4000,   // pojedynek
  DIR_DUEL_MAX_MS:      6000,
  DIR_FLYBY_MIN_MS:     3500,   // przelot
  DIR_FLYBY_MAX_MS:     4500,
  DIR_WIDE_MIN_MS:      4000,   // szeroki kadr
  DIR_WIDE_MAX_MS:      6000,
  DIR_HERO_PREEMPT_MIN_MS: 1800,  // bohater przerywa ujęcie trwające już co najmniej tyle (rytm bohatera bez zmian po kontroli)
  DIR_CUT_GAP_MS:       20000,  // cięcie (przelot, bohater spoza kadru) najwyżej raz na tyle; inaczej — przejście wygładzone
  DIR_WIDE_EVERY:       3,      // najwyżej tyle ujęć między szerokimi kadrami
  DIR_W_FOLLOW:         3,      // wagi wyboru ujęcia
  DIR_W_DUEL:           3,
  DIR_W_FLYBY:          2,
  DIR_W_WIDE:           1.5,
  DIR_W_NOVEL:          2.5,    // mnożnik wagi ujęcia nieobecnego w ostatnich 4 ujęciach (różnorodność)
  DIR_RESULT_HOLD_MS:   5000,   // kadr wyniku (dłuższy — wyjście z bitwy), potem kamera wraca do gracza
  // Ruchy kamery
  DIR_EASE_MS:          1400,   // przejście między ujęciami (wygładzone; było 900 — kontrola właściciela)
  DIR_HERO_EASE_MS:     450,    // dojazd do bohatera
  DIR_SMOOTH_MS:        260,    // stała czasowa śledzenia celu ujęcia
  DIR_ANGLE_SMOOTH_MS:  420,    // stała czasowa kątów (kurs okrętu skręca — kamera za nim płynnie)
  DIR_ORBIT_DEG_S:      7,      // obrót planu ogólnego [°/s prezentacji]
  DIR_WIDE_DRIFT_DEG_S: 2.5,    // dryf szerokiego kadru i wyniku
  DIR_EST_PHI_DEG:      58,     // kąt od pionu (90° = w płaszczyźnie statków) — plan ogólny
  DIR_WIDE_PHI_DEG:     63,
  DIR_FOLLOW_PHI_DEG:   76,
  DIR_DUEL_PHI_DEG:     73,
  DIR_FLYBY_PHI_DEG:    83,
  DIR_HERO_PHI_DEG:     70,
  DIR_EST_WIDE:         1.3,    // plan ogólny dalej niż kadr dopasowany (×)
  DIR_FOLLOW_SIDE_DEG:  28,     // za okrętem, z boku
  DIR_FOLLOW_LEN:       6,      // [długości kadłuba] najbliżej za okrętem flagowym
  DIR_DUEL_LEN:         5,      // [długości kadłuba] najbliżej przy pojedynku
  DIR_FLYBY_LEN:        3.2,    // [długości kadłuba] przelot
  DIR_FLYBY_START_DEG:  55,     // przelot: kąt kamery od kursu na początku (z przodu z boku) …
  DIR_FLYBY_END_DEG:    150,    // … i na końcu (z tyłu z boku)
  DIR_HERO_LEN:         5,      // [długości kadłuba] bohater
  DIR_HERO_SIDE_DEG:    38,     // bohater: kamera po drugiej stronie celu, z boku linii strzału
  DIR_MAX_DIST:         12,     // [j.] najdalszy kadr
  DIR_FRAME_INSET:      0.07,   // zapas kadru (ułamek boku prostokąta z każdej strony) — wygładzenie kamery nie wypycha szybkich okrętów
  // Bohater i spowolnienie (§3.1-3)
  DIR_HERO_LOOKAHEAD_MS: 2600,  // rejestr zna zniszczenie najwyżej tyle przed chwilą — dalej nie planujemy
  DIR_HERO_LEAD_MS:     700,    // ujęcie bohatera zaczyna się tyle przed trafieniem zabijającym
  DIR_HERO_LEAD_MIN_MS: 260,    // gdy nie da się zacząć choćby tyle przed — bohater przepada (zniszczenie w bieżącym ujęciu)
  DIR_HERO_HOLD_MS:     1800,   // trzymanie po trafieniu (wybuch CV-5)
  DIR_HERO_GAP_MS:      5000,   // najkrótszy odstęp między końcem bohatera a następnym
  DIR_HERO_SLOW:        0.35,   // tempo prezentacji w spowolnieniu (×)
  DIR_HERO_SLOW_MAX_MS: 800,    // [ms realnego] najdłuższe spowolnienie
  DIR_HERO_SLOW_LEAD_MS: 240,   // spowolnienie zaczyna się tyle przed trafieniem zabijającym
  DIR_HERO_LAG_CAP_R:   1.5,    // [R] twardy sufit dodatkowego opóźnienia
  DIR_HERO_REARM_LAG_R: 1.0,    // [R] nowy bohater dopiero poniżej tego opóźnienia
  DIR_CATCHUP:          1.25,   // tempo doganiania (×)
  // Strażnicy
  DIR_CLEAR_HULL_K:     2.6,    // kamera ≥ tyle długości kadłuba od środka każdego okrętu (bliżej — olbrzymi kadłub na pierwszym planie)
  DIR_CLEAR_BODY_K:     1.25,   // ≥ tyle promieni ciała
  DIR_CLEAR_STAR_K:     1.5,    // ≥ tyle promieni gwiazdy; linia widzenia omija kulę o tym promieniu
  DIR_PHI_MIN_DEG:      12,     // najwyżej nad płaszczyzną (strażnik gwiazdy podnosi kamerę)
  DIR_PHI_MAX_DEG:      86,     // najniżej
  // Wstrząs (wyłącznie prezentacja)
  DIR_SHAKE_MAX_DEG:    0.55,   // sufit kąta
  DIR_SHAKE_DECAY_S:    1.8,    // zanik „urazu” [1/s prezentacji]
  DIR_SHAKE_KILL_S:     0.35,   // zniszczenie fregaty / niszczyciela / pancernika (× 1 / 1,6 / 2,4)
  DIR_SHAKE_HIT:        0.08,   // wielkie trafienie (rakieta albo ≥ DIR_SHAKE_HIT_DMG)
  DIR_SHAKE_HIT_DMG:    30,
  DIR_SHAKE_PX_MIN:     16,     // [px] długość fregaty w głębi zdarzenia: poniżej — zero (zoom taktyczny)
  DIR_SHAKE_PX_FULL:    48,     // [px] od tej — pełny
  DIR_SHAKE_MANUAL:     0,      // 1 — wstrząs także bez reżysera (wybór gracza)
  // 9:16 (rolki) — prostokąt bezpieczny w kadrze 9:16 wyśrodkowanym na ekranie (strefy podpisów i przycisków rolek)
  DIR_916_TOP:          0.10,   // ułamek wysokości kadru
  DIR_916_BOTTOM:       0.18,
  DIR_916_SIDE:         0.07,   // ułamek szerokości kadru
  DIR_916_DARK:         0.55,   // przyciemnienie poza kadrem (przewodnik)
  DIR_916_CAPTURE_FRAME: 1,     // tryb nagrywania: 1 — cienka ramka (poza kadrem), 0 — nic
});

export const DIR = { ...DIR_TUNING };

/** Bieżące pokrętła: alias `cvTuning` (gdy jest) nad domyślnymi; brak / zła wartość — domyślna. */
export function dirTuning(live = null) {
  if (!live) return DIR;
  const out = {};
  for (const k of Object.keys(DIR_TUNING)) {
    const v = live[k];
    out[k] = Number.isFinite(v) ? v : DIR_TUNING[k];
  }
  return out;
}

export const SHOT = Object.freeze({
  ESTABLISHING: 'establishing', FOLLOW: 'follow', DUEL: 'duel', FLYBY: 'flyby', HERO: 'hero', WIDE: 'wide', RESULT: 'result',
});

const D2R = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth01 = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const fin = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const wrapPi = (a) => { let x = (a + Math.PI) % (2 * Math.PI); if (x < 0) x += 2 * Math.PI; return x - Math.PI; };

/**
 * Cięcie zamiast przejścia: przelot — tak; bohater — gdy podmiot poza kadrem; oba najwyżej raz na `DIR_CUT_GAP_MS` od ostatniego
 * cięcia (kontrola właściciela CV-7: mniej twardych cięć). Reszta — przejście wygładzone.
 * @param {{ type:string, subjectInView?:boolean, sinceCutMs?:number }} p
 */
export function shotCut({ type, subjectInView = true, sinceCutMs = Infinity } = {}, T = DIR) {
  const gapOk = !(sinceCutMs < Math.max(0, T.DIR_CUT_GAP_MS));
  if (type === SHOT.FLYBY) return gapOk;
  if (type === SHOT.HERO) return !subjectInView && gapOk;
  return false;
}

/** Klasa kadłuba → ranga (fregata 1, niszczyciel 2, pancernik 3; reszta 0). */
export function classRank(cls) {
  return cls === 'battleship' ? 3 : cls === 'destroyer' ? 2 : cls === 'frigate' ? 1 : 0;
}

/**
 * Czy zniszczenie zasługuje na bohatera: niszczyciel lub większy, albo ostatni żywy okręt swojej strony.
 * @param {{ cls?:string, lastOfSide?:boolean }} k
 */
export function heroWorthy(k) {
  return !!k && (classRank(k.cls) >= 2 || k.lastOfSide === true);
}

/** Czas trwania ujęcia z jego przedziału (≥ `DIR_SHOT_MIN_MS`). */
export function shotDuration(type, u, T = DIR) {
  const r = {
    [SHOT.ESTABLISHING]: [T.DIR_EST_MIN_MS, T.DIR_EST_MAX_MS],
    [SHOT.FOLLOW]: [T.DIR_FOLLOW_MIN_MS, T.DIR_FOLLOW_MAX_MS],
    [SHOT.DUEL]: [T.DIR_DUEL_MIN_MS, T.DIR_DUEL_MAX_MS],
    [SHOT.FLYBY]: [T.DIR_FLYBY_MIN_MS, T.DIR_FLYBY_MAX_MS],
    [SHOT.WIDE]: [T.DIR_WIDE_MIN_MS, T.DIR_WIDE_MAX_MS],
  }[type] ?? [T.DIR_WIDE_MIN_MS, T.DIR_WIDE_MAX_MS];
  const lo = Math.max(T.DIR_SHOT_MIN_MS, r[0]), hi = Math.max(lo, r[1]);
  return lo + (hi - lo) * clamp(Number(u) || 0, 0, 1);
}

/**
 * Wybór następnego ujęcia (bez bohatera i wyniku): nigdy to samo co poprzednie; szeroki kadr wymuszony po `DIR_WIDE_EVERY`
 * ujęciach bez niego; reszta — wagi z tabeli wśród dostępnych (okręt flagowy, para, lecąca fregata), ujęcie nieobecne w ostatnich
 * czterech (`recent`) z wagą × DIR_W_NOVEL (różnorodność — bez tego przelot potrafił nie paść ani razu w bitwie).
 * @param {{ prev?:string|null, sinceWide?:number, available?:{follow?:boolean,duel?:boolean,flyby?:boolean}, recent?:string[], u?:number }} p
 */
export function nextShotType({ prev = null, sinceWide = 0, available = {}, recent = [], u = 0 } = {}, T = DIR) {
  const cand = [];
  const nov = (t, w) => [t, recent.includes(t) ? w : w * Math.max(1, T.DIR_W_NOVEL)];
  if (available.follow) cand.push(nov(SHOT.FOLLOW, T.DIR_W_FOLLOW));
  if (available.duel) cand.push(nov(SHOT.DUEL, T.DIR_W_DUEL));
  if (available.flyby) cand.push(nov(SHOT.FLYBY, T.DIR_W_FLYBY));
  cand.push([SHOT.WIDE, T.DIR_W_WIDE]);
  const list = cand.filter(([t, w]) => t !== prev && w > 0);
  if (prev !== SHOT.WIDE && sinceWide >= T.DIR_WIDE_EVERY) return SHOT.WIDE;
  if (!list.length) return prev === SHOT.WIDE ? (available.follow ? SHOT.FOLLOW : SHOT.ESTABLISHING) : SHOT.WIDE;
  const sum = list.reduce((a, [, w]) => a + w, 0);
  let x = clamp(Number(u) || 0, 0, 0.999999) * sum;
  for (const [t, w] of list) { if (x < w) return t; x -= w; }
  return list[list.length - 1][0];
}

/**
 * Harmonogram ujęć jednej bitwy — maszyna stanów na zegarze prezentacji. Deterministyczny: to samo ziarno i ta sama sekwencja
 * wejść (`step`) → te same ujęcia (typ, chwile, podmioty z list posortowanych przez wołającego).
 */
export class DirectorSchedule {
  constructor({ seed = 0 } = {}) {
    this.seed = (Number(seed) >>> 0);
    this.index = 0;              // licznik ujęć (ziarno ujęcia)
    this.shot = null;            // bieżące ujęcie
    this.history = [];           // typy kolejnych ujęć
    this.sinceWide = 0;
    this.heroDone = new Set();   // okręty, które miały już bohatera
    this.lastHeroEndMs = -Infinity;
    this.pendingHero = null;     // { id, at, startAt, attacker }
    this.log = [];               // ostatnie ujęcia { type, startMs, endMs, subject }
  }

  /** Generator ujęcia `i` (z ziarna bitwy). */
  rng(i = this.index) { return ledgerRng(ledgerHash('cv7-director', this.seed, i)); }

  _begin(type, nowMs, T, extra = {}) {
    const rng = this.rng(this.index);
    const u = rng();
    const dur = type === SHOT.HERO || type === SHOT.RESULT ? 0 : shotDuration(type, u, T);
    const shot = { type, index: this.index, startMs: nowMs, endMs: type === SHOT.RESULT ? Infinity : nowMs + dur,
      side: rng() < 0.5 ? -1 : 1, pick: rng(), ...extra };
    shot.baseEndMs = shot.endMs;   // koniec własny ujęcia — przycięcie przez bohatera nie jest trwałe (bohater może przepaść)
    this.index++;
    this.history.push(type);
    if (this.history.length > 64) this.history.shift();
    this.sinceWide = type === SHOT.WIDE || type === SHOT.ESTABLISHING || type === SHOT.RESULT ? 0 : this.sinceWide + 1;
    if (this.shot) this.log.push({ type: this.shot.type, startMs: this.shot.startMs, endMs: Math.min(this.shot.endMs, nowMs),
      subject: this.shot.subjectId ?? null });
    if (this.log.length > 40) this.log.shift();
    this.shot = shot;
    return shot;
  }

  /**
   * Krok harmonogramu w chwili `nowMs`.
   * @param {number} nowMs
   * @param {{ available?:{follow?:boolean,duel?:boolean,flyby?:boolean},
   *           kills?:Array<{id:string, at:number, hero?:boolean, attacker?:string|null}>,
   *           heroAllowed?:boolean, done?:boolean }} ctx
   *   kills — zniszczenia zaplanowane w rejestrze, jeszcze nie pokazane (chwila `at` = trafienie zabijające); `hero` — godne
   *   bohatera; heroAllowed — spowolnienie może ruszyć (opóźnienie < 1 R); done — logika skończona i nic już nie czeka
   * @returns {object} bieżące ujęcie
   */
  step(nowMs, ctx = {}, T = DIR) {
    const now = Number(nowMs) || 0;
    const MIN = Math.max(0, T.DIR_SHOT_MIN_MS);
    if (!this.shot) this._begin(SHOT.ESTABLISHING, now, T);
    const cur = this.shot;
    if (cur.type === SHOT.RESULT) return cur;

    // Bohater w toku — do końca trzymania.
    if (cur.type === SHOT.HERO) {
      if (now < cur.endMs) return cur;
      this.lastHeroEndMs = cur.endMs;
      this.pendingHero = null;
    }

    // Kandydat na bohatera: najwcześniejsze zniszczenie godne bohatera w horyzoncie rejestru, bez bohatera dotąd.
    this.pendingHero = null;
    if (ctx.heroAllowed !== false && now - this.lastHeroEndMs >= T.DIR_HERO_GAP_MS && cur.type !== SHOT.HERO) {
      const ks = (ctx.kills ?? []).filter((k) => k && k.hero && !this.heroDone.has(k.id) && Number.isFinite(k.at)
        && k.at > now && k.at - now <= T.DIR_HERO_LOOKAHEAD_MS).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
      const k = ks[0];
      if (k) {
        const startAt = Math.max(k.at - T.DIR_HERO_LEAD_MS, cur.startMs + Math.max(0, T.DIR_HERO_PREEMPT_MIN_MS), now);
        if (k.at - startAt >= T.DIR_HERO_LEAD_MIN_MS) this.pendingHero = { id: k.id, at: k.at, startAt, attacker: k.attacker ?? null };
      }
    }
    const ph = this.pendingHero;
    if (ph && now >= ph.startAt) {
      this.heroDone.add(ph.id);
      this.pendingHero = null;
      const shot = this._begin(SHOT.HERO, now, T, { subjectId: ph.id, attackerId: ph.attacker, killAt: ph.at });
      shot.endMs = ph.at + Math.max(0, T.DIR_HERO_HOLD_MS);
      return shot;
    }

    // Koniec bitwy (logika skończona, nic już nie czeka): wynik — po najkrótszym czasie bieżącego ujęcia.
    if (ctx.done) {
      const s = this.shot;   // bohater dotarł tu wyłącznie po końcu trzymania (wyżej)
      if (s.type === SHOT.HERO || now >= s.startMs + MIN) return this._begin(SHOT.RESULT, now, T);
      return s;
    }

    const s = this.shot;
    // Przycięcie przez czekającego bohatera liczone w KAŻDYM kroku od końca własnego (≥ DIR_HERO_PREEMPT_MIN_MS z konstrukcji startAt):
    // bohater odrzucony później (opóźnienie ≥ 1 R) przywraca koniec własny — ujęcie nie zostaje krótsze niż minimum.
    if (s.type !== SHOT.HERO && Number.isFinite(s.baseEndMs)) s.endMs = ph ? Math.min(s.baseEndMs, ph.startAt) : s.baseEndMs;
    if (s.type === SHOT.HERO || now >= s.endMs) {
      // Bohater tuż — bieżące ujęcie trwa do niego (nowe byłoby krótsze niż minimum).
      if (ph && s.type !== SHOT.HERO && ph.startAt - now < MIN) { s.endMs = s.baseEndMs = Math.max(s.baseEndMs, ph.startAt); return s; }
      const rng = this.rng(this.index);
      const type = nextShotType({ prev: s.type, sinceWide: this.sinceWide, available: ctx.available ?? {}, recent: this.history.slice(-4), u: rng() }, T);
      const n = this._begin(type, now, T);
      if (ph && n.endMs > ph.startAt) n.endMs = ph.startAt;
      return n;
    }
    return s;
  }
}

/**
 * Spowolnienie prezentacji przy bohaterze (§3.1-3) — mnożnik tempa obu zegarów prezentacji na klatkę i dodatkowe opóźnienie
 * prezentacji względem logiki (`lagMs` = ∫ krok realny · (1 − tempo)).
 *   idle → slow (startHero: tylko przy opóźnieniu < DIR_HERO_REARM_LAG_R · R, poza spowolnieniem) → catchup (koniec spowolnienia:
 *   ≤ DIR_HERO_SLOW_MAX_MS realnego albo opóźnienie = DIR_HERO_LAG_CAP_R · R, albo endHero) → idle (opóźnienie 0).
 *   Logika skończona w trakcie spowolnienia albo doganiania — reszta w tempie DIR_CATCHUP do końca prezentacji (`done` zeruje).
 * Klatka dzielona na części, więc granice są DOKŁADNE (keeper): spowolnienie nie dłużej niż limit, opóźnienie nie ponad sufit.
 */
export class PresentationWarp {
  constructor() { this.reset(); this.heroes = 0; this.maxLagMs = 0; this.minRate = 1; this.slowTotalMs = 0; }

  reset() { this.phase = 'idle'; this.lagMs = 0; this.slowMs = 0; this.rate = 1; this.tail = false; }

  canStartHero(R, T = DIR) { return this.phase !== 'slow' && this.lagMs < Math.max(0, T.DIR_HERO_REARM_LAG_R) * (R > 0 ? R : 1150); }

  startHero(R, T = DIR) {
    if (!this.canStartHero(R, T)) return false;
    this.phase = 'slow'; this.slowMs = 0; this.heroes++;
    return true;
  }

  endHero() { if (this.phase === 'slow') this.phase = this.lagMs > 0 ? 'catchup' : 'idle'; }

  /**
   * Krok o `realDtMs` czasu realnego (krok zegara prezentacji przed mnożnikiem).
   * @param {number} realDtMs
   * @param {{ paused?:boolean, R?:number, ended?:boolean, done?:boolean }} s — ended: logika bitwy skończona; done: i nic już
   *   nie czeka (prezentacja skończona)
   * @returns {number} mnożnik tempa prezentacji tej klatki
   */
  step(realDtMs, { paused = false, R = 1150, ended = false, done = false } = {}, T = DIR) {
    if (done) { this.reset(); return 1; }
    const slow = clamp(Number(T.DIR_HERO_SLOW) || 0.35, 0.05, 1);
    const fast = Math.max(1, Number(T.DIR_CATCHUP) || 1.25);
    const RR = R > 0 ? R : 1150;
    if (ended && (this.phase !== 'idle' || this.lagMs > 0)) this.tail = true;
    const dt = Number(realDtMs);
    if (paused || !(dt > 0)) { this.rate = this.phase === 'slow' ? slow : (this.phase === 'catchup' || this.tail) ? fast : 1; return this.rate; }
    let left = dt, pres = 0;
    // Spowolnienie — do limitu czasu realnego i sufitu opóźnienia.
    if (this.phase === 'slow') {
      const timeLeft = Math.max(0, T.DIR_HERO_SLOW_MAX_MS - this.slowMs);
      const capLeft = Math.max(0, T.DIR_HERO_LAG_CAP_R * RR - this.lagMs);
      const byCap = slow < 1 ? capLeft / (1 - slow) : Infinity;
      const part = Math.min(left, timeLeft, byCap);
      pres += part * slow; this.lagMs += part * (1 - slow); this.slowMs += part; this.slowTotalMs += part; left -= part;
      if (part >= timeLeft - 1e-9 || part >= byCap - 1e-9) this.phase = this.lagMs > 0 ? 'catchup' : 'idle';
      if (this.lagMs > T.DIR_HERO_LAG_CAP_R * RR) this.lagMs = T.DIR_HERO_LAG_CAP_R * RR;
      this.maxLagMs = Math.max(this.maxLagMs, this.lagMs);   // szczyt opóźnienia — przed doganianiem w tej samej klatce
    }
    // Doganianie (także „ogon” po końcu logiki: tempo DIR_CATCHUP do końca prezentacji).
    if (left > 0 && (this.phase === 'catchup' || this.tail)) {
      if (this.lagMs > 0) {
        const need = this.lagMs / (fast - 1 || Infinity);
        const part = Math.min(left, need);
        pres += part * fast; this.lagMs = Math.max(0, this.lagMs - part * (fast - 1)); left -= part;
        if (this.lagMs <= 1e-9) { this.lagMs = 0; if (!this.tail) this.phase = 'idle'; }
      }
      if (left > 0 && this.tail) { pres += left * fast; left = 0; this.phase = 'catchup'; }
    }
    if (left > 0) { pres += left; left = 0; if (this.phase === 'catchup' && this.lagMs <= 0 && !this.tail) this.phase = 'idle'; }
    this.rate = pres / dt;
    this.maxLagMs = Math.max(this.maxLagMs, this.lagMs);
    this.minRate = Math.min(this.minRate, this.rate);
    return this.rate;
  }
}

// ── Kadr ujęcia ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Azymut θ kamery kontrolera, przy którym kamera stoi od celu w kierunku poziomym (dx, dz). */
export function thetaOfDir(dx, dz) { return Math.atan2(dz, dx); }

/** Pozycja kamery kontrolera dla stanu { target, theta, phi, dist } (jak `ThreeCameraController._applyCamera`). */
export function cameraPos(g) {
  const s = Math.sin(g.phi);
  return { x: g.target.x + g.dist * s * Math.cos(g.theta), y: g.target.y + g.dist * Math.cos(g.phi),
    z: g.target.z + g.dist * s * Math.sin(g.theta) };
}

/** Kierunek poziomy okrętu (kurs choreografii albo prędkość rysowana), znormalizowany; brak — null. */
function headingOf(s) {
  const h = s?.heading;
  if (h && Number.isFinite(h.x) && Number.isFinite(h.z)) { const l = Math.hypot(h.x, h.z); if (l > 1e-9) return { x: h.x / l, z: h.z / l }; }
  return null;
}

/** Wybór z listy posortowanej przez wołającego, z ułamkiem ziarna ujęcia `u` ∈ [0, 1). */
export function pickBy(list, u) {
  if (!list?.length) return null;
  return list[Math.min(list.length - 1, Math.floor(clamp(Number(u) || 0, 0, 0.999999) * list.length))];
}

/**
 * Podmioty ujęć ze sceny (wołający podaje okręty z polami { id, alive, side: 'own'|'enemy', cls, len, x,y,z, heading, speed,
 * engaged }): okręt flagowy (największy żywy kadłub gracza; remis — więcej zaangażowania, potem id; bez gracza — najbardziej
 * zaangażowany), para pojedynku (z wołającego — najzajętsza para strzelec → cel), fregaty w ruchu (do przelotu, posortowane
 * po id). Deterministyczne.
 */
export function shotSubjects(ships = [], pairs = []) {
  const alive = ships.filter((s) => s && s.alive && fin(s));
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const own = alive.filter((s) => s.side === 'own');
  const pool = own.length ? own : alive;
  const flagship = [...pool].sort((a, b) => classRank(b.cls) - classRank(a.cls) || (b.engaged ?? 0) - (a.engaged ?? 0) || byId(a, b))[0] ?? null;
  const ids = new Set(alive.map((s) => s.id));
  const pair = (pairs ?? []).find((p) => p && ids.has(p.attacker) && ids.has(p.target) && p.attacker !== p.target) ?? null;
  const frigates = alive.filter((s) => s.cls === 'frigate' && (s.speed ?? 0) > 0 && headingOf(s)).sort(byId);
  return { flagship, pair, frigates };
}

/**
 * Cel kamery ujęcia — { target, theta, phi, dist } (przed strażnikami i wygładzeniem) albo null (brak punktów).
 * @param {object} shot — z harmonogramu (+ `theta0` ustawione przez klej przy starcie ujęcia: θ kamery w tej chwili)
 * @param {{ ships: object[], byId: Map<string, object>, subjects?: object, pair?: object|null }} scene
 * @param {{ fovDeg:number, aspect:number, W:number, H:number, safe:{x0,x1,y0,y1} }} view
 */
export function frameShot(shot, scene, view, nowMs, T = DIR) {
  if (!shot || !scene || !view) return null;
  const now = Number(nowMs) || 0;
  const el = Math.max(0, now - (shot.startMs ?? now));
  const all = (scene.ships ?? []).filter(fin);
  const alive = all.filter((s) => s.alive);
  const fit = (pts, theta, phi, minD) => fitWatchFrame({ points: pts, theta, phi, fovDeg: view.fovDeg, aspect: view.aspect,
    W: view.W, H: view.H, safe: view.safe, minD: Math.max(0.02, minD ?? 0.4), maxD: Math.max(0.5, T.DIR_MAX_DIST) });
  const theta0 = Number.isFinite(shot.theta0) ? shot.theta0 : 0;
  const wideOf = (pts, theta, phiDeg, k = 1) => {
    if (!pts.length) return null;
    const minL = Math.max(...pts.map((p) => p.len ?? 0.016));
    const f = fit(pts, theta, phiDeg * D2R, minL * 3);
    if (!f) return null;
    return { target: f.target, theta, phi: phiDeg * D2R, dist: Math.min(T.DIR_MAX_DIST, f.dist * k) };
  };
  const get = (id) => (id != null ? scene.byId?.get?.(id) ?? null : null);
  switch (shot.type) {
    case SHOT.ESTABLISHING:
      return wideOf(all, theta0 + shot.side * T.DIR_ORBIT_DEG_S * D2R * el / 1000, T.DIR_EST_PHI_DEG, T.DIR_EST_WIDE);
    case SHOT.WIDE:
      return wideOf(alive.length ? alive : all, theta0 + shot.side * T.DIR_WIDE_DRIFT_DEG_S * D2R * el / 1000, T.DIR_WIDE_PHI_DEG, 1);
    case SHOT.RESULT:   // ocalali (po końcu bitwy scena się rozchodzi — wraki dryfują w skali prawdziwej); bez ocalałych — wszyscy
      return wideOf(alive.length ? alive : all, theta0 + shot.side * T.DIR_WIDE_DRIFT_DEG_S * D2R * el / 1000, T.DIR_WIDE_PHI_DEG, 1.15);
    case SHOT.FOLLOW: {
      const s = get(shot.subjectId);
      if (!fin(s)) return null;
      const h = headingOf(s) ?? (() => { const t = get(shot.targetId); return fin(t) ? { x: t.x - s.x, z: t.z - s.z } : { x: 1, z: 0 }; })();
      const th = thetaOfDir(-h.x, -h.z) + shot.side * T.DIR_FOLLOW_SIDE_DEG * D2R;
      const t = get(shot.targetId);
      const pts = fin(t) && t.alive !== false ? [s, t] : [s];
      const f = fit(pts, th, T.DIR_FOLLOW_PHI_DEG * D2R, (s.len ?? 0.016) * T.DIR_FOLLOW_LEN);
      return f ? { target: f.target, theta: th, phi: T.DIR_FOLLOW_PHI_DEG * D2R, dist: f.dist } : null;
    }
    case SHOT.DUEL: {
      const a = get(shot.subjectId), b = get(shot.targetId);
      if (!fin(a) || !fin(b)) return fin(a) ? frameShot({ ...shot, type: SHOT.FOLLOW }, scene, view, now, T) : null;
      // prostopadle do linii pary w chwili startu ujęcia (kąt zatrzaśnięty — stabilny plan dwóch okrętów, bez obrotu kamery za parą),
      // strona bliższa kamerze w chwili startu (ciągłość)
      if (!Number.isFinite(shot.duelTheta)) {
        const base = thetaOfDir(b.x - a.x, b.z - a.z);
        const c1 = base + Math.PI / 2, c2 = base - Math.PI / 2;
        shot.duelTheta = Math.abs(wrapPi(c1 - theta0)) <= Math.abs(wrapPi(c2 - theta0)) ? c1 : c2;
      }
      const th = shot.duelTheta + shot.side * T.DIR_WIDE_DRIFT_DEG_S * D2R * el / 1000;
      const f = fit([a, b], th, T.DIR_DUEL_PHI_DEG * D2R, Math.max(a.len ?? 0.016, b.len ?? 0.016) * T.DIR_DUEL_LEN);
      return f ? { target: f.target, theta: th, phi: T.DIR_DUEL_PHI_DEG * D2R, dist: f.dist } : null;
    }
    case SHOT.FLYBY: {
      const s = get(shot.subjectId);
      if (!fin(s)) return null;
      const h = headingOf(s) ?? { x: 1, z: 0 };
      const dur = Math.max(1, (Number.isFinite(shot.endMs) ? shot.endMs : now) - shot.startMs);
      const k = smooth01(el / dur);
      const rel = (T.DIR_FLYBY_START_DEG + (T.DIR_FLYBY_END_DEG - T.DIR_FLYBY_START_DEG) * k) * D2R;
      const th = thetaOfDir(h.x, h.z) + shot.side * rel;
      return { target: { x: s.x, y: s.y, z: s.z }, theta: th, phi: T.DIR_FLYBY_PHI_DEG * D2R, dist: (s.len ?? 0.016) * T.DIR_FLYBY_LEN };
    }
    case SHOT.HERO: {
      const v = get(shot.subjectId);
      if (!fin(v)) return null;
      const k = get(shot.attackerId);
      const base = fin(k) ? thetaOfDir(v.x - k.x, v.z - k.z) : theta0;
      const th = base + shot.side * T.DIR_HERO_SIDE_DEG * D2R;
      const minD = (v.len ?? 0.016) * T.DIR_HERO_LEN;
      // okręt-zabójca w kadrze, gdy blisko; inaczej sam bohater (dystans z podłogi)
      const pts = fin(k) && Math.hypot(k.x - v.x, k.y - v.y, k.z - v.z) < minD * 3 ? [v, k] : [v];
      const f = fit(pts, th, T.DIR_HERO_PHI_DEG * D2R, minD);
      return f ? { target: f.target, theta: th, phi: T.DIR_HERO_PHI_DEG * D2R, dist: f.dist } : null;
    }
    default: return null;
  }
}

/**
 * Strażnicy kamery: pozycja kamery poza kulą każdego okrętu (DIR_CLEAR_HULL_K · długość), ciała (DIR_CLEAR_BODY_K · promień)
 * i gwiazdy (DIR_CLEAR_STAR_K · promień); odcinek kamera → cel nie przecina kuli gwiazdy. Kolejno: dalej od celu wzdłuż osi
 * widzenia (kadłub, ciało, gwiazda), wyżej nad płaszczyzną (gwiazda w linii widzenia), na koniec odwrócony azymut.
 * @param {{target,theta,phi,dist}} g
 * @param {{ ships?:Array<{x,y,z,len}>, bodies?:Array<{x,y,z,r}>, star?:{x,y,z,r}|null }} obs
 * @returns {{target,theta,phi,dist, guarded:string[]}}
 */
export function guardCamera(g, obs = {}, T = DIR) {
  if (!g || !fin(g.target)) return g;
  const out = { target: { ...g.target }, theta: g.theta, phi: clamp(g.phi, T.DIR_PHI_MIN_DEG * D2R, T.DIR_PHI_MAX_DEG * D2R), dist: g.dist, guarded: [] };
  const spheres = [];
  for (const s of obs.ships ?? []) if (fin(s)) spheres.push({ x: s.x, y: s.y, z: s.z, r: Math.max(1e-6, (s.len ?? 0.016) * T.DIR_CLEAR_HULL_K), kind: 'hull' });
  for (const b of obs.bodies ?? []) if (fin(b) && b.r > 0) spheres.push({ x: b.x, y: b.y, z: b.z, r: b.r * T.DIR_CLEAR_BODY_K, kind: 'body' });
  const star = obs.star && fin(obs.star) && obs.star.r > 0 ? { x: obs.star.x, y: obs.star.y, z: obs.star.z, r: obs.star.r * T.DIR_CLEAR_STAR_K, kind: 'star' } : null;
  if (star) spheres.push(star);
  const segHitsStar = () => {
    if (!star) return false;
    const c = cameraPos(out), t = out.target;
    const dx = t.x - c.x, dy = t.y - c.y, dz = t.z - c.z;
    const L2 = dx * dx + dy * dy + dz * dz || 1;
    const k = clamp(((star.x - c.x) * dx + (star.y - c.y) * dy + (star.z - c.z) * dz) / L2, 0, 1);
    const px = c.x + dx * k - star.x, py = c.y + dy * k - star.y, pz = c.z + dz * k - star.z;
    return px * px + py * py + pz * pz < star.r * star.r;
  };
  const pushOut = () => {
    let moved = false;
    for (let pass = 0; pass < 6; pass++) {
      const b = cameraBasis(out.theta, out.phi).zc;
      let any = false;
      for (const s of spheres) {
        const tx = out.target.x - s.x, ty = out.target.y - s.y, tz = out.target.z - s.z;
        const t2 = tx * tx + ty * ty + tz * tz;
        if (t2 <= s.r * s.r) continue;   // cel w kuli (np. sam podmiot ujęcia) — nie wypychamy celu, tylko kamerę poza nią niżej
        const c = cameraPos(out);
        const cx = c.x - s.x, cy = c.y - s.y, cz = c.z - s.z;
        if (cx * cx + cy * cy + cz * cz >= s.r * s.r) continue;
        // |t + d·zc − s|² = r² → d² + 2d (zc·(t − s)) + |t − s|² − r² = 0 — większy pierwiastek
        const bq = b.x * tx + b.y * ty + b.z * tz;
        const disc = bq * bq - (t2 - s.r * s.r);
        const d = -bq + Math.sqrt(Math.max(0, disc));
        if (d > out.dist) { out.dist = d * 1.0001 + 1e-6; any = true; moved = true; if (!out.guarded.includes(s.kind)) out.guarded.push(s.kind); }
      }
      if (!any) break;
    }
    return moved;
  };
  // podmiot w kuli (cel = środek okrętu): kamera co najmniej na promieniu tej kuli od celu
  for (const s of spheres) {
    const tx = out.target.x - s.x, ty = out.target.y - s.y, tz = out.target.z - s.z;
    if (tx * tx + ty * ty + tz * tz <= s.r * s.r) {
      const need = s.r + Math.hypot(tx, ty, tz);
      if (out.dist < need) { out.dist = need * 1.0001; if (!out.guarded.includes(s.kind)) out.guarded.push(s.kind); }
    }
  }
  pushOut();
  for (let i = 0; i < 10 && segHitsStar(); i++) {
    out.phi = Math.max(T.DIR_PHI_MIN_DEG * D2R, out.phi - 0.12);
    if (!out.guarded.includes('starLine')) out.guarded.push('starLine');
    pushOut();
  }
  if (segHitsStar()) { out.theta += Math.PI; pushOut(); }
  return out;
}

/** Odległość kamery od powierzchni najbliższej kuli strażników (≥ 0 — poza wszystkimi) — do keepera i odczytu. */
export function cameraClearance(g, obs = {}, T = DIR) {
  const c = cameraPos(g);
  let m = Infinity;
  for (const s of obs.ships ?? []) if (fin(s)) m = Math.min(m, Math.hypot(c.x - s.x, c.y - s.y, c.z - s.z) - (s.len ?? 0.016) * T.DIR_CLEAR_HULL_K);
  for (const b of obs.bodies ?? []) if (fin(b) && b.r > 0) m = Math.min(m, Math.hypot(c.x - b.x, c.y - b.y, c.z - b.z) - b.r * T.DIR_CLEAR_BODY_K);
  if (obs.star && fin(obs.star) && obs.star.r > 0) m = Math.min(m, Math.hypot(c.x - obs.star.x, c.y - obs.star.y, c.z - obs.star.z) - obs.star.r * T.DIR_CLEAR_STAR_K);
  return m;
}

/** Wygładzenie stanu kamery ku celowi (krok `dtMs`): cel i φ liniowo, θ najkrótszą drogą, dystans w skali logarytmicznej. */
export function approachCamera(cur, goal, dtMs, T = DIR) {
  if (!cur) return goal ? { target: { ...goal.target }, theta: goal.theta, phi: goal.phi, dist: goal.dist } : null;
  if (!goal) return cur;
  const kt = 1 - Math.exp(-Math.max(0, dtMs) / Math.max(1, T.DIR_SMOOTH_MS));
  const ka = 1 - Math.exp(-Math.max(0, dtMs) / Math.max(1, T.DIR_ANGLE_SMOOTH_MS));
  return {
    target: { x: cur.target.x + (goal.target.x - cur.target.x) * kt, y: cur.target.y + (goal.target.y - cur.target.y) * kt,
      z: cur.target.z + (goal.target.z - cur.target.z) * kt },
    theta: cur.theta + wrapPi(goal.theta - cur.theta) * ka,
    phi: cur.phi + (goal.phi - cur.phi) * ka,
    dist: Math.exp(Math.log(Math.max(1e-6, cur.dist)) + (Math.log(Math.max(1e-6, goal.dist)) - Math.log(Math.max(1e-6, cur.dist))) * kt),
  };
}

/** Przejście między ujęciami: `from` → `to` z wagą w (wygładzoną smoothstep), θ najkrótszą drogą, dystans logarytmicznie. */
export function blendCamera(from, to, w) {
  if (!from) return to;
  if (!to) return from;
  const k = smooth01(w);
  return {
    target: { x: from.target.x + (to.target.x - from.target.x) * k, y: from.target.y + (to.target.y - from.target.y) * k,
      z: from.target.z + (to.target.z - from.target.z) * k },
    theta: from.theta + wrapPi(to.theta - from.theta) * k,
    phi: from.phi + (to.phi - from.phi) * k,
    dist: Math.exp(Math.log(Math.max(1e-6, from.dist)) * (1 - k) + Math.log(Math.max(1e-6, to.dist)) * k),
  };
}

/** Czy stan kamery kontrolera zmienił ktoś inny niż reżyser (wejście gracza): porównanie z ostatnim zapisem reżysera. */
export function cameraTaken(written, now, eps = 1e-6) {
  if (!written || !now) return false;
  const d = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) > eps;
  return d(written.theta, now.theta) || d(written.phi, now.phi) || d(written.dist, now.dist)
    || d(written.target.x, now.target.x) || d(written.target.y, now.target.y) || d(written.target.z, now.target.z)
    || now.animating === true;
}

// ── Wstrząs ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Uraz od zdarzenia: rodzaj ('kill' z klasą / 'hit' z obrażeniami), długość fregaty w głębi zdarzenia [px], czy w kadrze. */
export function shakeTrauma({ kind = 'hit', cls = null, dmg = 0, missile = false, pxL = 0, inFrame = true } = {}, T = DIR) {
  if (!inFrame) return 0;
  const lo = T.DIR_SHAKE_PX_MIN, hi = Math.max(lo + 1e-6, T.DIR_SHAKE_PX_FULL);
  const near = smooth01((Number(pxL) - lo) / (hi - lo));
  if (!(near > 0)) return 0;
  if (kind === 'kill') return T.DIR_SHAKE_KILL_S * (cls === 'battleship' ? 2.4 : cls === 'destroyer' ? 1.6 : 1) * near;
  if (missile || Number(dmg) >= T.DIR_SHAKE_HIT_DMG) return T.DIR_SHAKE_HIT * near;
  return 0;
}

/** Stan wstrząsu: uraz [0, 1] zanika na zegarze prezentacji; kąt = sufit · uraz² · szum deterministyczny (sumy sinusów). */
export class ShakeState {
  constructor() { this.trauma = 0; this.t = 0; this.peak = 0; }
  add(x) { if (x > 0) { this.trauma = Math.min(1, this.trauma + x); this.peak = Math.max(this.peak, this.trauma); } }
  step(dtMs, T = DIR) {
    const dt = Math.max(0, Number(dtMs) || 0);
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - dt / 1000 * Math.max(0, T.DIR_SHAKE_DECAY_S));
  }
  /** { yaw, pitch, roll } [rad] — zero bez urazu. */
  offset(T = DIR) {
    const a = Math.max(0, T.DIR_SHAKE_MAX_DEG) * D2R * this.trauma * this.trauma;
    if (!(a > 0)) return { yaw: 0, pitch: 0, roll: 0 };
    const s = this.t / 1000;
    const n = (f1, f2, p) => (Math.sin(s * f1 + p) * 0.6 + Math.sin(s * f2 + p * 1.7) * 0.4);
    return { yaw: a * n(37.1, 61.3, 0.3), pitch: a * n(41.7, 53.9, 1.9), roll: a * 0.5 * n(29.3, 47.1, 3.1) };
  }
}

// ── 9:16 ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Kadr 9:16 wyśrodkowany na ekranie W × H [px]: pełna wysokość (węższy ekran — pełna szerokość). */
export function promoRect916(W, H) {
  if (!(W > 0) || !(H > 0)) return null;
  let h = H, w = H * 9 / 16;
  if (w > W) { w = W; h = W * 16 / 9; }
  const x0 = (W - w) / 2, y0 = (H - h) / 2;
  return { x0, x1: x0 + w, y0, y1: y0 + h };
}

/** Prostokąt kadru reżysera: prostokąt bezpieczny zwężony o `DIR_FRAME_INSET` boku z każdej strony (zapas na wygładzenie kamery). */
export function insetRect(r, T = DIR) {
  if (!r) return r;
  const k = clamp(Number(T.DIR_FRAME_INSET) || 0, 0, 0.3);
  const dx = (r.x1 - r.x0) * k, dy = (r.y1 - r.y0) * k;
  return { ...r, x0: r.x0 + dx, x1: r.x1 - dx, y0: r.y0 + dy, y1: r.y1 - dy };
}

/** Prostokąt bezpieczny w kadrze 9:16 (strefy podpisów u góry i u dołu, margines boczny); opcjonalnie pod paskiem walki. */
export function promoSafe916(crop, T = DIR, { stripBottom = null } = {}) {
  if (!crop) return null;
  const w = crop.x1 - crop.x0, h = crop.y1 - crop.y0;
  const out = { x0: crop.x0 + w * T.DIR_916_SIDE, x1: crop.x1 - w * T.DIR_916_SIDE,
    y0: crop.y0 + h * T.DIR_916_TOP, y1: crop.y1 - h * T.DIR_916_BOTTOM, fallback: false };
  if (Number.isFinite(stripBottom) && stripBottom > out.y0 && stripBottom < out.y1 - 60) out.y0 = stripBottom;
  return out;
}

/**
 * Nakładka 9:16 (przewodnik): wygląd w zależności od trybu — zwykły: ramka + przyciemnienie poza kadrem; tryb nagrywania: cienka
 * ramka POZA kadrem (wycięcie kadru jej nie łapie) albo nic.
 */
export function promoGuideStyle({ on = false, capture = false } = {}, T = DIR) {
  if (!on) return { visible: false };
  if (capture) return T.DIR_916_CAPTURE_FRAME ? { visible: true, dark: 0, frame: true, outside: true } : { visible: false };
  return { visible: true, dark: clamp(T.DIR_916_DARK, 0, 0.95), frame: true, outside: true };
}

// ── Chip reżysera ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Stan chipa i przejście po kliku: 'off' → 'armed' (reżyser prowadzi bitwę w widoku), 'armed' → 'off', 'paused' (gracz przejął
 * kamerę) → 'armed' (wznowienie).
 */
export function chipNext(state) {
  return state === 'off' ? 'armed' : state === 'paused' ? 'armed' : 'off';
}
