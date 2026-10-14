// AI STRIKES BACK (SB9, SB16) — JEDNA tabela strojenia arca. Wzór: `src/data/GarrisonData.js`.
//
// Każda liczba, której używa kod arca AI STRIKES BACK, stoi TUTAJ — razem z typem i zakresem, które sprawdza komenda
// konsoli przed przyjęciem nowej wartości. Logika odczytu, zmiany, resetu i zapisu mieszka w
// `src/utils/StrikesBackTuning.js`; wartości zmienione z konsoli jadą w zapisie gry (`gameState.strikesBackTuning`),
// brak wpisu = wartość domyślna z tej tabeli.
// ⚠ ZASADA KLUCZA (polecenie S1): klucz bez konsumenta nie wchodzi do tabeli. Kolejne slice'y (S2–S4) dokładają swoje
//   klucze RAZEM z kodem, który je czyta.
// ⚠ ZERO importów — moduł danych, node-testowalny. Kształt wpisu:
//   { default, type: 'int' | 'number' | 'numberList' | 'templateList', min?, max?, length?, minLength?, maxLength?, unit }
//   'number' — liczba skończona w [min, max] (S3: udział fali).
//   'numberList' — lista liczb o stałej długości `length`; każdy element w [min, max].
//   'templateList' — lista od `minLength` do `maxLength` id szablonów okrętów; każdy ZNANY i UZBROJONY (walidacja
//   w `StrikesBackTuning`, cechy szablonu — `FleetPoolPlanner.templateTraits`).

export const SB_TUNING = Object.freeze({
  /**
   * SB3 — minimum limitu floty imperium (kadłuby). Limit = max(min, floor(POP / fleetPopPerHull)) × mnożnik szczebla.
   * Lustro `GARRISON_MIN_UNITS` drabiny garnizonu (ta sama klamra, osobne pokrętło).
   */
  fleetMinHulls: Object.freeze({ default: 2, type: 'int', min: 0, max: 100, unit: 'kadluby' }),

  /** SB3 — ile POP imperium przypada na jeden kadłub limitu (POP — suma pełnych kolonii, jak w limicie garnizonu). */
  fleetPopPerHull: Object.freeze({ default: 32, type: 'int', min: 1, max: 10000, unit: 'POP na kadlub' }),

  /**
   * SB3 — mnożnik limitu floty na KAŻDYM szczeblu drabiny garnizonu (indeks = szczebel `garrisonTier`, progi sumy
   * poziomów fabryk 0 / 6 / 14 / 20 — `GarrisonData.GARRISON_LADDER`). Domyślnie ×1,25 od 20 poziomów fabryk —
   * te same wartości co `limitMult` drabiny garnizonu; zgodność pilnuje keeper (`sb1_fleet_tuning_smoke` T1),
   * a zmiana drabiny garnizonu wymaga tu świadomej decyzji.
   */
  fleetRungMult: Object.freeze({ default: Object.freeze([1, 1, 1, 1.25]), type: 'numberList', length: 4, min: 0, max: 10, unit: 'mnoznik' }),

  /**
   * SB17, SB20 — WZORZEC składu puli okrętów: szablony z `SHIP_TEMPLATES`, wyłącznie znane i UZBROJONE, powtarzane do
   * limitu floty (limit 2 → D, E; limit 6 → D, E, E, E, D, E). Istniejące uzbrojone kadłuby pokrywają sloty swojej
   * klasy (z bakiem warp / bez baku). Konsument: `FleetLimit.readEmpirePoolPlan` → pula (`FleetPoolSystem`).
   */
  fleetPoolPattern: Object.freeze({
    default: Object.freeze(['frigate_system_defender', 'frigate_missile_escort', 'frigate_missile_escort', 'frigate_missile_escort']),
    type: 'templateList', minLength: 1, maxLength: 24, unit: 'szablony',
  }),

  /**
   * SB21 — MINIMUM kadłubów z bakiem warp imperium, TAKŻE PONAD LIMITEM floty: gdy imperium ma ich mniej, pula dokłada
   * brakujące (pierwszy szablon z bakiem we wzorcu). Konsument: `FleetLimit.readEmpirePoolPlan`.
   */
  fleetMinWarpHulls: Object.freeze({ default: 2, type: 'int', min: 0, max: 100, unit: 'kadluby z bakiem' }),

  /**
   * SB15 — ODRASTANIE puli: ile kadłubów imperium dostaje na granicy roku kalendarzowego (od mobilizacji, w wojnie
   * i w pokoju), wg tej samej reguły miejsca i wzorca co mobilizacja. Konsument: `FleetLimit.fleetRegrowthPerYear` →
   * `FleetPoolSystem._yearlyCheck`.
   */
  fleetRegrowthPerYear: Object.freeze({ default: 1, type: 'int', min: 0, max: 100, unit: 'kadluby na rok' }),

  /**
   * SB30 (S2) — ilu STRAŻNIKÓW stoi przy jednym strzeżonym ciele. Strażnik = uzbrojony kadłub w służbie BEZ baku warp,
   * NA ORBICIE ciała. 0 = brak strażników. Konsument: `FleetLimit.fleetGuardsPerBody` → `FleetPoolSystem.stationGuards`.
   */
  fleetGuardsPerBody: Object.freeze({ default: 1, type: 'int', min: 0, max: 10, unit: 'straznicy na cialo' }),

  /**
   * SB53 (S3) — wielkość FALI desantu eskadry: floor(limit garnizonu imperium × ten udział), obcięta do ładowni
   * transportowca. 0 = fala pusta (eskadra nie startuje). Fixture GATE-S4 `emp_001`: limit 13 → 6. Konsument:
   * `StrikeWavePlanner.readEmpireWavePlan` → `StrikeSquadronSystem.launchSquadron`.
   */
  strikeWaveShare: Object.freeze({ default: 0.5, type: 'number', min: 0, max: 1, unit: 'udzial limitu garnizonu' }),

  /**
   * SB56 (S3/2) — MNOŻNIK eskadry: ile razy więcej wytrzymałości ma mieć eskadra od obrońcy celu —
   * potrzebne = ceil(HP obrońcy × mnożnik / średnie HP kadłuba puli) (`DirectorOffensive.requiredSquadron`). Domyślnie 1,0
   * (do S3/2 stała 1,5 — D-199-1). Konsument: `StrikeWavePlanner.squadronHpRatio` → uderzenie (`strike_player_target`)
   * i odbijanie (`retake_lost_colony`).
   */
  squadronHpRatio: Object.freeze({ default: 1.0, type: 'number', min: 0.1, max: 10, unit: 'HP eskadry / HP obroncy' }),

  /**
   * SB56 (S3/2) — SUFIT eskadry: najwięcej okrętów jednego uderzenia albo odbicia; potrzebne ponad sufit = cel poza
   * zasięgiem (`target_beyond_reach`). Domyślnie 3 (do S3/2 stała `MAX_STRIKE_SIZE`). Konsument:
   * `StrikeWavePlanner.squadronMaxShips` → uderzenie i odbijanie.
   */
  squadronMaxShips: Object.freeze({ default: 3, type: 'int', min: 1, max: 24, unit: 'kadluby' }),

  /**
   * SB57 (S3/2) — ODBIJANIE: ile lat gry od utraty ciała (wpis księgi wojny) imperium czeka przed pierwszą próbą odbicia.
   * Konsument: `StrikeWavePlanner.retakeDelayYears` → `DirectorRetake`.
   */
  retakeDelayYears: Object.freeze({ default: 1, type: 'number', min: 0, max: 50, unit: 'lata gry' }),

  /**
   * SB57 (S3/2) — ODBIJANIE: ile lat gry od ostatniej próby na to samo ciało (wysłana eskadra) przed następną. Odmowa
   * (np. za mało okrętów) próbą nie jest. Konsument: `StrikeWavePlanner.retakeCooldownYears` → `DirectorRetake`.
   */
  retakeCooldownYears: Object.freeze({ default: 5, type: 'number', min: 0, max: 100, unit: 'lata gry' }),

  /**
   * SB70 (S4, Finding 440) — LIMIT TRZYMANIA ORBITY: ile lat gry eskadra (eskorta i transportowiec) stoi nad celem po
   * desancie (etap `landed`), zanim wróci do stolicy, choćby walka naziemna trwała dalej — wylądowana fala zostaje i walczy.
   * Konsument: `StrikeWavePlanner.squadronHoldMaxYears` → `StrikeSquadronSystem._tick`.
   */
  squadronHoldMaxYears: Object.freeze({ default: 3, type: 'number', min: 0.5, max: 20, unit: 'lata gry' }),

  /**
   * SB83 (S4/2) — KAMPANIA: ile lat gry od ostatniej próby na to samo ciało gracza (wysłana eskadra — kampanii albo
   * odbijania) przed następną kampanią na nie. Odmowa (np. za mało okrętów) próbą nie jest. Lustro `retakeCooldownYears`.
   * Konsument: `StrikeWavePlanner.campaignCooldownYears` → `DirectorCampaign`.
   */
  campaignCooldownYears: Object.freeze({ default: 5, type: 'number', min: 0, max: 100, unit: 'lata gry' }),

  /**
   * SB81 (S4/2) — WOJNA Z OKAZJI: najniższe napięcie z graczem (0–100), przy którym imperium z pulą floty i eskadrą do
   * wzięcia wypowiada wojnę (`opportunity_war`). Dla porównania: napięcie 80 to wojna z wrogości, 60 — ultimatum.
   * Konsument: `StrikeWavePlanner.warTensionMin` → `DirectorOpportunityWar`.
   */
  warTensionMin: Object.freeze({ default: 40, type: 'number', min: 0, max: 100, unit: 'napiecie' }),

  /**
   * SB82 (S4/2) — WOJNA Z OKAZJI: ile lat gry od ostatniego odpalenia reguły `opportunity_war` (tego imperium) przed
   * następnym. Odstęp między wojnami dają przede wszystkim rozejm i pakt o nieagresji (10 lat po każdym pokoju); ten klucz
   * jest cooldownem samej reguły. Konsument: `StrikeWavePlanner.aiWarCooldownYears` → `DirectorOpportunityWar`.
   */
  aiWarCooldownYears: Object.freeze({ default: 5, type: 'number', min: 0, max: 50, unit: 'lata gry' }),

  /**
   * SB85 (S4/2) — KONIEC WOJNY: ile KOLEJNYCH prób (eskadr imperium w bieżącej wojnie, zakończonych) bez zdobycia celu
   * wyczerpuje kampanię — wtedy imperium wysyła depeszę pokojową (status quo, ocena pokoju bez zmian — SB86).
   * Konsument: `StrikeWavePlanner.campaignMaxFailedAttempts` → `DirectorCampaign`.
   */
  campaignMaxFailedAttempts: Object.freeze({ default: 3, type: 'int', min: 1, max: 20, unit: 'proby' }),
});
