// OpinionModifierData — katalog modyfikatorów opinii (WOJNA I POKÓJ 1.0, faza D1).
//
// Opinia pary imperiów = Σ aktywnych modyfikatorów po stronie właściciela, clamp ±100.
// NIGDY nie jest przechowywana — liczy się ją z tej listy, dzięki czemu rozbicie
// („dlaczego nas nie lubią") w UI dostajemy za darmo.
//
// Ten plik to WYŁĄCZNIE dane: wartości, tempo zanikania, tryb łączenia i klucz i18n.
// Cała matematyka siedzi w src/utils/OpinionMath.js, cały stan w
// src/systems/diplomacy/RelationsModel.js. Balans strojymy TUTAJ i nigdzie indziej.
//
// ⚠ Id modyfikatorów są 1:1 z wartościami `type` we wpisach pamięci relacji
// (memory[].type). Dzięki temu D2 (Acceptance Engine) może pokazać DOWÓD przy każdej
// pozycji rozbicia („pamiętamy zdradę paktu") bez tabeli tłumaczącej jedno na drugie.
// Dlatego pojedyncze `surveillance` ze specyfikacji rozbite jest na
// research_intrusion / trespassing — tak jak nazywają się incydenty w DiplomacySystem.

// ── Tryby łączenia przy powtórnym dodaniu tego samego modyfikatora ──────────
// refresh    — JEDEN wpis na (id, owner); value PODMIENIANE, rok resetowany.
// accumulate — JEDEN wpis na (id, owner); value SUMOWANE, rok resetowany.
//
// `accumulate` istnieje dla parytetu ze starym `changeTrust`, który sumował każde
// zdarzenie (dziesięć zbrojnych wizyt = −50, nie −5). Świadomie NIE ma trybu „stack"
// (wpis per zdarzenie): rosnące tablice w save to koszt bez zysku, a decay per-instancja
// wróci w D2, jeśli okaże się potrzebny.
export const COMBINE = {
  REFRESH:    'refresh',
  ACCUMULATE: 'accumulate',
};

/**
 * Katalog modyfikatorów. Pola:
 *   id           — musi równać się kluczowi (pilnuje tego smoke)
 *   labelKey     — klucz i18n etykiety w rozbiciu opinii
 *   defaultValue — wartość użyta gdy wywołanie nie poda własnej (punkty opinii)
 *   decayPerYear — punkty opinii na 1 rok WYŚWIETLANY; 0 = nie zanika
 *                  (D2/E6 — patrz nota „JEDNOSTKA CZASU" pod katalogiem)
 *   combine      — COMBINE.REFRESH | COMBINE.ACCUMULATE
 *   persistent   — żyje tak długo jak jego źródło (traktat, stan wojny); nie zanika
 *   rampPerYear / rampMax / treatyId — tylko modyfikatory narastające (patrz trade_partner)
 */
export const OPINION_MODIFIERS = {
  // Osad po starym `trust` — zasiewany WYŁĄCZNIE przez migrację v99→v100.
  // Skala 1:1: legacy = trust − 50, więc mostek D2 (50 + opinia) odtwarza dokładnie
  // stary trust i progi traktatów wypadają tam, gdzie wypadały przed D1.
  legacy_relations: {
    id: 'legacy_relations', labelKey: 'diplo.mod.legacyRelations',
    defaultValue: 0, decayPerYear: 2, combine: COMBINE.REFRESH, persistent: false,
  },

  // Nasz emisariusz: +5 przy dotarciu, +5 przy powrocie (MissionSystem).
  envoy_goodwill: {
    id: 'envoy_goodwill', labelKey: 'diplo.mod.envoyGoodwill',
    defaultValue: +5, decayPerYear: 1, combine: COMBINE.ACCUMULATE, persistent: false,
  },

  // Delegacja przysłana przez AI (AlienCivSystem, co 15 lat cyw.).
  their_envoy: {
    id: 'their_envoy', labelKey: 'diplo.mod.theirEnvoy',
    defaultValue: +3, decayPerYear: 1, combine: COMBINE.ACCUMULATE, persistent: false,
  },

  // Uzbrojony statek gracza wszedł do ich układu.
  military_presence: {
    id: 'military_presence', labelKey: 'diplo.mod.militaryPresence',
    defaultValue: -5, decayPerYear: 2, combine: COMBINE.ACCUMULATE, persistent: false,
  },

  // Gracz zestrzelił sondę pierwszego kontaktu (Director S5, decyzja 4).
  //
  // ⚠ Przelot jest zestrzeliwalny Z KONSTRUKCJI: nie ma pojęcia „neutralny obcy statek",
  // więc uzbrojony statek gracza wykona na bezbronnej sondzie jednostronną egzekucję.
  // Slice 1 dowozi MINIMUM — duży minus opinii + wpis pamięci. Raiser reputacji
  // `aggression +20` z `DIPLOMACY_BACKBONE.md` §1.2 zostaje D4, bo dziś ŻADEN raiser
  // reputacji nie istnieje (korekta K-2 z D2) i pojedynczy wyjątek byłby niespójny.
  //
  // ACCUMULATE, nie REFRESH: drugi zestrzelony przelot ma boleć bardziej niż pierwszy.
  first_contact_kill: {
    id: 'first_contact_kill', labelKey: 'diplo.mod.firstContactKill',
    defaultValue: -25, decayPerYear: 1, combine: COMBINE.ACCUMULATE, persistent: false,
  },

  // Nacisk militarny w POWŁOCE GRANICZNEJ (Director S6, decyzja 7).
  //
  // ⚠ ŚWIADOMIE OSOBNY TYP, nie reużycie `military_presence`. Tamten nalicza się przy wejściu
  // do przestrzeni ROSZCZONEJ; ten dotyczy wyłącznie powłoki granicznej. Zbiory są rozłączne
  // (`InfluenceMap`), więc jeden czyn daje JEDEN wiersz w rozbiciu opinii — to jest punkt
  // nienegocjowalny GATE 3. Kanał: `opinion` (NIGDY `tension` — L1-L2 grożą, nie wypowiadają).
  border_pressure: {
    id: 'border_pressure', labelKey: 'diplo.mod.borderPressure',
    defaultValue: -8, decayPerYear: 2, combine: COMBINE.ACCUMULATE, persistent: false,
  },

  // Statek badawczy wszedł do ich układu.
  research_intrusion: {
    id: 'research_intrusion', labelKey: 'diplo.mod.researchIntrusion',
    defaultValue: -3, decayPerYear: 2, combine: COMBINE.ACCUMULATE, persistent: false,
  },

  // Statek badawczy zalega w ich układzie (naliczane co TRESPASS_YEARS).
  trespassing: {
    id: 'trespassing', labelKey: 'diplo.mod.trespassing',
    defaultValue: -5, decayPerYear: 2, combine: COMBINE.ACCUMULATE, persistent: false,
  },

  // Stan wojny. Persistent — zdejmowany przy offerPeace, ustępuje miejsca recent_war.
  // Zastępuje stare „wojna zeruje trust na zawsze": relacje mogą się odbudować.
  at_war: {
    id: 'at_war', labelKey: 'diplo.mod.atWar',
    defaultValue: -40, decayPerYear: 0, combine: COMBINE.REFRESH, persistent: true,
  },

  // Ślad po zakończonej wojnie.
  recent_war: {
    id: 'recent_war', labelKey: 'diplo.mod.recentWar',
    defaultValue: -15, decayPerYear: 2, combine: COMBINE.REFRESH, persistent: false,
  },

  // Aktywna umowa handlowa. NARASTAJĄCY: +12 na rok WYŚWIETLANY do rampMax — to jest
  // odpowiednik starego `TREATY_TYPES.trade_agreement.yearlyTrust = 1`, czyli jedyna
  // poza-emisariuszami droga do wysokiego zaufania. Wartość naliczona trzymana jest
  // na TYM wpisie (jedno źródło prawdy) i znika razem z traktatem.
  //
  // ⚠ D2/E6: `rampPerYear` 1 → 12 to NIE przyspieszenie, a TA SAMA prędkość w nowej
  // jednostce — ramp NIGDY nie był bramkowany flagą zanikania, więc jest mechanizmem
  // ŻYWYM i zawężona decyzja 3 wymaga zachowania odczuwalnego tempa CO DO CYFRY.
  // Zmierzone: 0 → +50 zajmuje 4,167 roku wyświetlanego przed i po zmianie.
  trade_partner: {
    id: 'trade_partner', labelKey: 'diplo.mod.tradePartner',
    defaultValue: 0, decayPerYear: 0, combine: COMBINE.REFRESH, persistent: true,
    rampPerYear: +12, rampMax: +50, treatyId: 'trade_agreement',
  },

};

// ── JEDNOSTKA CZASU CAŁEJ DYPLOMACJI (D2/E6) ────────────────────────────────
//
// WSZYSTKIE tempa i okresy dyplomacji liczą się w latach WYŚWIETLANYCH — tych samych,
// które gracz widzi na pasku czasu (`timeSystem.gameTime`) i którymi od zawsze mierzyły
// TRUCE_YEARS, RECENT_REFUSAL_YEARS i ERRATIC_EPOCH_YEARS. Przelicznik: 1 rok
// wyświetlany = CIV_TIME_SCALE (12) lat cywilizacyjnych. Konwersja siedzi w JEDNYM
// miejscu — w ticku `DiplomacySystem` (`dy = steps / CIV_TIME_SCALE`); katalog, model
// i matematyka nie znają już roku cywilizacyjnego.
//
// Dlaczego `decayPerYear` zostało przy TYCH SAMYCH cyfrach (a ramp dostał ×12):
// zanikanie modyfikatorów jest za flagą `FEATURES.diplomacyDecay`, która do E6 była
// WYŁĄCZONA — w zaszytym buildzie te tempa NIGDY nie działały, więc nie ma
// odczuwalnego tempa do zachowania (pomiar: probe-diplomacy-time-units §B0). Ich tempo
// jest ustalane RAZ, tutaj, świadomie: cyfry zostają, jednostka staje się rokiem
// wyświetlanym. Efekt zmierzony — dobra wola z emisariusza żyje 4,58 roku wyświetlanego,
// ślad po wojnie 7,33, osad po starym zaufaniu 14,75 — czyli to samo pasmo, w którym
// siedzą rozejm (10), epoka humoru (10), łaska po ultimatum (3) i karencja odmowy (2).
// Alternatywa (×12 także tutaj) dawała 0,17–1,25 roku i czyniła tryb `accumulate`
// emisariusza arytmetycznie martwym (§B5). Podpisane: zawężona decyzja 3, 2026-08-10.

// ⚠ `threatened_by_you` USUNIĘTY w D2/E2 — to jest Decyzja 1 fazy, wykonana.
// Wpis miał sprzęgać napięcie z opinią (−10 przy napięciu > 60). D2 rozstrzygnął ten
// wybór na korzyść TERMU `tension` w Acceptance Engine: napięcie wchodzi do decyzji
// wprost, ze znakiem zależnym od czasownika (sprzyja paktowi i pokojowi, szkodzi
// sojuszowi). Trzymanie obu naraz byłoby PODWÓJNYM LICZENIEM — napięcie wpływałoby na
// wynik raz jako term, a drugi raz przez opinię, która sama jest termem.
// Wpis nigdy nie był wpinany w tick, więc usunięcie nie zmienia żadnego zachowania;
// zostawienie go byłoby martwą daną udającą funkcję (audyt R9). Razem z nim znikają
// dwa klucze i18n `diplo.mod.threatenedByYou` (pl + en).
// Wariant kompromisowy (panel dorysowuje wiersz „Czują się zagrożeni" w rozbiciu
// AKCEPTACJI, nie opinii) pozostaje dostępny jako decyzja o UI w E4 — nie wymaga
// powrotu tego wpisu.

// ── Skala opinii ────────────────────────────────────────────────────────────
// 1 punkt opinii = 1 punkt starego trustu; 0 = dawne neutralne 50. Zakres jest
// DWA RAZY szerszy niż stary trust — nadmiarowe ±50 to miejsce na ciężkie
// modyfikatory (at_war −40, w przyszłości „zniszczyli naszą flotę" −50).
export const OPINION_MIN = -100;
export const OPINION_MAX =  100;

// Progi pasm statusu — lustro starych progów trustu (≤29 wrogi, ≥65 przyjazny).
// Status „sojusznik" nadal WYŁĄCZNIE z traktatu alliance, nie z liczby.
export const OPINION_HOSTILE_MAX  = -21;
export const OPINION_FRIENDLY_MIN = +15;

// Poniżej tej wartości bezwzględnej zanikający modyfikator znika z listy.
export const MODIFIER_EPSILON = 0.5;

// Pojemność pierścienia pamięci relacji (poprzednio lastIncidents = 10).
export const MEMORY_MAX = 20;

// Ile OSTATNICH wpisów pamięci widzi inferCasusBelli. Okno węższe niż MEMORY_MAX
// celowo: casus belli liczy wystąpienia typów, więc poszerzenie pierścienia bez
// tego okna po cichu zmieniłoby dobierane CB (a z nim exhaustionRate/peaceCost).
export const CB_MEMORY_WINDOW = 10;

// Długość rozejmu w latach gry. Jedno źródło dla offerPeace i migracji v100.
// Po upływie status wraca do 'peace' — bez tego rozejm był stanem terminalnym
// i decay napięcia zamierał na zawsze po pierwszej wojnie (audyt R7).
export const TRUCE_YEARS = 10;
