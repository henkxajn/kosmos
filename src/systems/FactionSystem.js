// FactionSystem — system frakcji wewnętrznych (Faza C1 + C3)
//
// Dwie frakcje wewnętrzne (presja polityczna, NIE wybór gracza):
//   • Konfederaci Misji (slider 70-100) — chcą zostać i kolonizować
//   • Poszukiwacze Drogi (slider 0-30)  — chcą wrócić do Ziemi
//
// Suwak 0-100 i napięcie 0-100 kształtują się decyzjami gracza.
// LeaderSystem działa niezależnie — FactionSystem go nie zastępuje.
//
// Faza C3: eventy narracyjne (NarrativeEventsData) sprawdzane co rok w
// _checkNarrativeEvents() oraz emitowane przez _checkTensionThresholds()
// gdy napięcie przekroczy 71 (faction_crisis_protest).
//
// Komunikacja:
//   Nasłuchuje:
//     'faction:sliderShift'  { delta, reason }     — przesunięcie suwaka
//     'time:tick'            { civDeltaYears }     — akumulator do _yearlyUpdate()
//   Emituje:
//     'faction:sliderChanged'    { slider, delta, reason, zone }
//     'faction:modifiersUpdated' { zone, slider, tension, modifiers }
//     'faction:highTension'      { tension, year }
//     'faction:crisis'           { tension, dominantFaction, year }
//     'faction:crisisResolved'   { year }
//     'narrative:eventTriggered' { event, gameYear, sliderDirectionForMinority? }

import EventBus from '../core/EventBus.js';
import { NARRATIVE_EVENTS, NARRATIVE_EVENTS_BY_ID } from '../data/NarrativeEventsData.js';

// ── Strefy suwaka (0 = pełni Poszukiwacze, 100 = pełni Konfederaci) ────────
// Dokumentacja zakresów; granice są zsynchronizowane z getCurrentZone() poniżej.
//   seekers_max       0-15   → -25% produkcja przemysłowa
//   seekers           16-30  → -10% prosperity
//   seekers_mild      31-50  → -5% wzrost populacji
//   balanced          51-69  → brak kar (optymalna strefa)
//   confederates_mild 70-84  → -10% research, anomalie rzadsze
//   confederates      85-100 → -25% research i eksploracja

// Ile lat suwak musi być w ekstremum zanim napięcie zaczyna rosnąć
const TENSION_DELAY_YEARS = 10;

export class FactionSystem {
  constructor() {
    this.slider          = 50;   // startowa równowaga
    this.tension         = 0;    // napięcie 0-100
    this._yearsInExtreme = 0;    // licznik lat w ekstremum (>=85 lub <=15)
    this._crisisActive   = false;

    // Akumulator czasu (FactionSystem tyka rocznie)
    // Nasłuchujemy time:tick i akumulujemy civDeltaYears (mechaniki 4X biegną szybciej niż fizyka)
    this._accumYears = 0;

    // ── Faza C3 ─────────────────────────────────────────────────────────
    // IDs jednorazowych eventów narracyjnych już wystrzelonych
    this._triggeredEvents = new Set();
    // Guard żeby narracyjny faction_crisis_protest nie spamował co tick
    this._narrativeCrisisFired = false;

    // ── Faza C4: lock ──────────────────────────────────────────────────
    // Frakcje są zablokowane na starcie — odblokowują się gdy koloniści
    // odkryją Ziemię. Dopóki locked=true:
    //   • _yearlyUpdate pomija update tension/zone effects/narrative events
    //   • TopBar pomija HUD wskaźnik suwaka frakcji
    //   • _shiftSlider działa cicho (logika może aktualizować suwak,
    //     ale nie emituje eventów które byłyby widoczne dla gracza)
    this._locked = true;

    // ── Faza C5: narodziny frakcji ─────────────────────────────────────
    // Rok w którym odblokowano frakcje — używany przez two_sides_emerge
    // (event narracyjny 5 lat po unlock) i ewentualne future delayed eventy
    this._unlockedYear = null;
    // Czy event first_sabotage już się odpalił (raz w grze, po extreme slider)
    this._sabotageTriggered = false;

    EventBus.on('faction:sliderShift', ({ delta, reason }) => {
      this._shiftSlider(delta, reason);
    });

    // Brak time:yearPassed w grze — używamy time:tick + akumulator civDeltaYears
    EventBus.on('time:tick', ({ civDeltaYears }) => {
      if (!window.KOSMOS?.civMode) return;
      this._accumYears += civDeltaYears;
      if (this._accumYears < 1) return;
      const years = Math.floor(this._accumYears);
      this._accumYears -= years;
      const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
      for (let y = 0; y < years; y++) {
        this._yearlyUpdate(gameYear);
      }
    });
  }

  // ── Roczna pętla (wywoływana z time:tick po akumulacji do 1 roku) ────────
  _yearlyUpdate(gameYear) {
    // Faza C4: dopóki frakcje zablokowane — pomiń całą logikę tension/zone/narrative
    if (this._locked) return;
    this._updateTension(gameYear);
    this._applyZoneEffects();
    this._checkNarrativeEvents(gameYear);
  }

  // ── Faza C4: lock API ─────────────────────────────────────────────────────
  get isLocked() { return this._locked; }

  // Odblokuj frakcje (wywoływane gdy koloniści odkryją Ziemię)
  unlock() {
    if (!this._locked) return;
    this._locked = false;
    // Faza C5: zapisz rok unlock — używany przez condition `two_sides_emerge`
    this._unlockedYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    EventBus.emit('faction:unlocked', { year: this._unlockedYear });
  }

  // ── Publiczne API ─────────────────────────────────────────────────────────

  // Pobierz aktualną strefę suwaka
  getCurrentZone() {
    const s = this.slider;
    if (s <= 15) return 'seekers_max';
    if (s <= 30) return 'seekers';
    if (s <= 50) return 'seekers_mild';
    if (s <= 69) return 'balanced';
    if (s <= 84) return 'confederates_mild';
    return 'confederates';
  }

  // Pobierz mnożnik dla danego stat w aktualnej strefie (1.0 jeśli brak modyfikatora)
  // mult < 1.0 = kara, mult > 1.0 = bonus
  // Faza C5: gdy frakcje są zablokowane (przed odkryciem Ziemi) — zawsze 1.0
  getModifier(stat) {
    if (this._locked) return 1.0;
    const zone = this.getCurrentZone();
    const mods = ZONE_MODIFIERS[zone] ?? {};
    return mods[stat] ?? 1.0;
  }

  // Pobierz dominującą frakcję ('confederates' | 'seekers' | 'balanced')
  getDominantFaction() {
    if (this.slider >= 70) return 'confederates';
    if (this.slider <= 30) return 'seekers';
    return 'balanced';
  }

  // Publiczne API: przesuń suwak (dla zewnętrznych systemów które nie chcą emitować eventu)
  // Wewnętrznie deleguje do _shiftSlider który emituje faction:sliderChanged.
  shiftSlider(delta, reason = '') {
    this._shiftSlider(delta, reason);
  }

  // ── Wewnętrzna logika ─────────────────────────────────────────────────────

  // Przesuń suwak o delta (+ = w stronę Konfederatów, - = Poszukiwacze)
  _shiftSlider(delta, reason = '') {
    const old = this.slider;
    this.slider = Math.max(0, Math.min(100, this.slider + delta));

    if (this.slider !== old) {
      EventBus.emit('faction:sliderChanged', {
        slider: this.slider,
        delta:  this.slider - old,
        reason,
        zone:   this.getCurrentZone(),
      });
    }
  }

  _updateTension(gameYear) {
    // Faza C5: pierwszy sabotaż — odpala raz w grze gdy slider osiągnie ekstremum
    // (>75 = Konfederaci dominują, mniejszość Seekers podpala; <25 odwrotnie)
    if (!this._sabotageTriggered && (this.slider > 75 || this.slider < 25)) {
      this._sabotageTriggered = true;
      const sabotageEvent = NARRATIVE_EVENTS_BY_ID['first_sabotage'];
      if (sabotageEvent) {
        EventBus.emit('narrative:eventTriggered', {
          event:    sabotageEvent,
          gameYear,
        });
      }
    }

    const zone      = this.getCurrentZone();
    const inExtreme = (zone === 'seekers_max' || zone === 'confederates');
    const inHigh    = (zone === 'seekers' || zone === 'confederates_mild');
    const inBalance = (zone === 'balanced');

    // Zliczaj lata w ekstremum
    if (inExtreme) {
      this._yearsInExtreme++;
    } else {
      this._yearsInExtreme = Math.max(0, this._yearsInExtreme - 1);
    }

    // Napięcie rośnie szybko gdy długo w ekstremum
    if (this._yearsInExtreme > TENSION_DELAY_YEARS) {
      this.tension = Math.min(100, this.tension + 5);
    }
    // Napięcie rośnie wolniej przy wysokim suwaku (poza ekstremum)
    else if (inHigh) {
      this.tension = Math.min(100, this.tension + 1);
    }
    // Napięcie spada przy równowadze
    else if (inBalance) {
      this.tension = Math.max(0, this.tension - 5);
    }

    // Sprawdź progi napięcia i emituj eventy
    this._checkTensionThresholds(gameYear);
  }

  _checkTensionThresholds(gameYear) {
    const t = this.tension;

    if (t >= 86 && !this._crisisActive) {
      this._crisisActive = true;
      // Faza C5: zamiast surowego faction:crisis emit, wystaw narracyjny event
      // colony_separation_threat (z 3 opcjami: pozwól odejść / negocjuj / odmów).
      // Stary faction:crisis nie jest już potrzebny — UI/handlery używają narrative chain.
      const sepEvent = NARRATIVE_EVENTS_BY_ID['colony_separation_threat'];
      if (sepEvent) {
        EventBus.emit('narrative:eventTriggered', {
          event:    sepEvent,
          gameYear,
        });
      }
    } else if (t >= 71 && t < 86) {
      EventBus.emit('faction:highTension', { tension: t, year: gameYear });
    }

    // Reset stanu kryzysu gdy napięcie spada — niezależnie od _crisisActive,
    // resetuje też narracyjny guard żeby crisis_protest mógł powtórzyć się przy następnym napięciu.
    if (t < 50) {
      if (this._crisisActive) {
        this._crisisActive = false;
        EventBus.emit('faction:crisisResolved', { year: gameYear });
      }
      this._narrativeCrisisFired = false;
    }

    // Faza C3: emit narracyjny faction_crisis_protest gdy napięcie ≥71 (raz na cykl)
    if (t >= 71 && !this._narrativeCrisisFired) {
      this._narrativeCrisisFired = true;
      const crisisEvent = NARRATIVE_EVENTS_BY_ID['faction_crisis_protest'];
      if (crisisEvent) {
        EventBus.emit('narrative:eventTriggered', {
          event:                       crisisEvent,
          gameYear,
          // Kierunek shifta przy "Ustąp mniejszości": jeśli Konfederaci dominują (slider>50),
          // mniejszością są Poszukiwacze → shift ujemny (-1×). Jeśli odwrotnie — shift dodatni.
          sliderDirectionForMinority:  this.slider > 50 ? -1 : +1,
        });
      }
    }
  }

  // ── Faza C3: eventy narracyjne ────────────────────────────────────────────
  // Sprawdzane co rok (z _yearlyUpdate). Iteruje po NARRATIVE_EVENTS, sprawdza
  // condition() każdego eventu. Jednorazowe (once:true) są zapisywane w _triggeredEvents.
  // Eventy bez condition (np. faction_crisis_protest) są pomijane — triggerowane przez inny mechanizm.
  _checkNarrativeEvents(gameYear) {
    // Bez kolonii domowej — pomiń (gracz jeszcze nie jest w 4X civMode)
    const hp = window.KOSMOS?.homePlanet;
    if (!hp) return;
    const colony = window.KOSMOS?.colonyManager?.getColony(hp.id);
    if (!colony) return;

    for (const event of NARRATIVE_EVENTS) {
      // Pomiń jednorazowe które już były
      if (event.once && this._triggeredEvents.has(event.id)) continue;
      // Pomiń eventy bez condition (triggerowane przez inny mechanizm)
      if (typeof event.condition !== 'function') continue;

      // Sprawdź warunek (defensywnie — wyjątek nie powinien zatrzymać pętli)
      let ok = false;
      try {
        ok = event.condition(gameYear, colony, this);
      } catch (e) {
        console.warn(`[FactionSystem] Błąd condition() eventu ${event.id}:`, e);
        continue;
      }
      if (!ok) continue;

      // Zarejestruj jednorazowe i triggeruj
      if (event.once) this._triggeredEvents.add(event.id);
      EventBus.emit('narrative:eventTriggered', { event, gameYear });
    }
  }

  _applyZoneEffects() {
    // Emituj aktualne modyfikatory żeby inne systemy mogły je odczytać
    const zone = this.getCurrentZone();
    EventBus.emit('faction:modifiersUpdated', {
      zone,
      slider:    this.slider,
      tension:   this.tension,
      modifiers: ZONE_MODIFIERS[zone] ?? {},
    });
  }

  // ── Serialize / Restore ───────────────────────────────────────────────────

  serialize() {
    return {
      slider:               this.slider,
      tension:              this.tension,
      yearsInExtreme:       this._yearsInExtreme,
      crisisActive:         this._crisisActive,
      accumYears:           this._accumYears,
      // Faza C3: persisted eventy narracyjne
      triggeredEvents:      [...this._triggeredEvents],
      narrativeCrisisFired: this._narrativeCrisisFired,
      // Faza C4: lock state
      locked:               this._locked,
      // Faza C5: narodziny frakcji
      unlockedYear:         this._unlockedYear,
      sabotageTriggered:    this._sabotageTriggered,
    };
  }

  restore(data) {
    if (!data) return;
    this.slider          = data.slider          ?? 50;
    this.tension         = data.tension         ?? 0;
    this._yearsInExtreme = data.yearsInExtreme  ?? 0;
    this._crisisActive   = data.crisisActive    ?? false;
    this._accumYears     = data.accumYears      ?? 0;
    // Faza C3
    this._triggeredEvents      = new Set(data.triggeredEvents ?? []);
    this._narrativeCrisisFired = data.narrativeCrisisFired ?? false;
    // Faza C4: lock state — domyślnie locked dla legacy save
    this._locked = data.locked ?? true;
    // Faza C5: narodziny frakcji — defensywne defaults dla legacy
    this._unlockedYear      = data.unlockedYear      ?? null;
    this._sabotageTriggered = data.sabotageTriggered ?? false;
  }
}

// ── Modyfikatory per strefa ─────────────────────────────────────────────────
// mult < 1.0 = kara, mult > 1.0 = bonus
// Każdy system konsumujący sam decyduje czy uwzględnia dany stat (przez getModifier()).
const ZONE_MODIFIERS = {
  seekers_max: {
    industryProduction: 0.75,   // -25% produkcja przemysłowa
    prosperity:         0.90,   // -10% prosperity
    popGrowth:          0.95,   // -5% wzrost populacji
  },
  seekers: {
    prosperity: 0.90,           // -10% prosperity
    popGrowth:  0.95,           // -5% wzrost populacji
  },
  seekers_mild: {
    popGrowth: 0.95,            // -5% wzrost populacji
  },
  balanced: {
    // brak kar — optymalna strefa
  },
  confederates_mild: {
    research:      0.90,        // -10% research
    anomalyChance: 0.80,        // anomalie rzadsze
  },
  confederates: {
    research:        0.75,      // -25% research
    explorationSpeed: 0.75,     // -25% eksploracja
    anomalyChance:    0.60,     // anomalie znacznie rzadsze
  },
};

// ── Mapowanie budynków na shift suwaka ──────────────────────────────────────
// BuildingSystem konsultuje tę tabelę po ukończeniu budowy.
// Faza D2b: dodane heritage_dome, anomaly_research_lab, deep_space_array.
export const BUILDING_SLIDER_SHIFTS = {
  // Faza C5 — budynki frakcyjne (governance)
  confederation_hall:     +8,   // Hala Konfederatów
  seekers_institute:      -8,   // Instytut Poszukiwaczy
  mediation_center:        0,   // Centrum Mediacji — neutralne, redukuje tylko napięcie
  // Faza D2b — Pamięć i Tożsamość (civil)
  memory_vault:           +3,   // Skarbiec Pamięci ("pamiętamy Ziemię ale jesteśmy tu")
  mission_archive:        -4,   // Archiwum Misji ("pamiętamy skąd przyszliśmy")
  heritage_dome:          +2,   // Kopuła Dziedzictwa ("odtwarzamy Ziemię — ale tu")
  // Faza D2b — Nauka i Eksploracja (research)
  directional_observatory: -6,  // Obserwatorium Kierunkowe ("szukamy drogi powrotnej")
  anomaly_research_lab:   -3,   // Laboratorium Anomalii ("badamy skok — wrócimy")
  deep_space_array:       -5,   // Tablica Głębokiego Kosmosu ("nasłuchujemy przestrzeni")
};

// ── Mapowanie technologii FTL na shift suwaka ───────────────────────────────
// TechSystem konsultuje tę tabelę po zbadaniu technologii.
// Postęp w FTL = nadzieja na powrót → suwak w stronę Poszukiwaczy.
export const TECH_SLIDER_SHIFTS = {
  warp_theory:               -6,
  warp_drive:                -8,
  interstellar_colonization: -8,
};
