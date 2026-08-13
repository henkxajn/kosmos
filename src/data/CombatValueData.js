// CombatValueData — cennik wartości bojowej (W1-2, WOJNA I POKÓJ 1.0, workstream B).
//
// JEDYNE miejsce, w którym mieszka balans siły wyprowadzonej. `ThreatMath` liczy, ten plik
// wycenia. Strojenie idzie tutaj i nigdzie indziej — nigdy w kodzie (decyzje 3 i 9 z `W1_PLAN.md`).
//
// ── Zasada: wyceniamy POLA, nigdy ID modułów (decyzja 3) ────────────────────────────────────
// Waga wisi na NAZWIE POLA statystyki, nie na `weapon_kinetic` czy `armor_heavy`. Dzięki temu
// trzeci typ pancerza — albo dowolny nowy moduł — wycenia się SAM, bez jednej linijki kodu.
// To jest konkretna odpowiedź na `WAR_BACKBONE §7`: „dwa typy pancerza dziś, więcej później —
// tabela musi być danymi".
//
// ── Jednostka: HP (decyzja 2) ───────────────────────────────────────────────────────────────
// Wszystkie wagi są w EKWIWALENCIE HP, bo tożsamość „strength = HP" jest w tym repo wymuszona
// KODEM, nie konwencją:
//   • `BattleSystem.empireFleetToBattleUnit` ustawia `hp = strength` 1:1,
//   • `WarSystem` odejmuje straty liczone w HP wprost od `fleet.strength`.
// Dzięki temu wartość wyprowadzona jest współmierna z każdym konsumentem wrażliwym na skalę
// (`composeFromStrength` → floor(strength/50), `InvasionSystem.MIN_SURVIVING_STRENGTH_TO_LAND`,
// bramka `strength > 30` w MilitaryAI, seed bitwy) — bez dotykania choćby jednego z nich.
//
// ⚠ Skąd DAMAGE_PER_HP = 10, czyli dlaczego akurat 10. Nie z sufitu: ta sama funkcja
// `empireFleetToBattleUnit` buduje wiązkę broni jako `damage = strength / 10`. Skoro w księdze
// abstrakcyjnej 10 punktów siły ODPOWIADA 1 punktowi obrażeń, to 1 obrażenie warte jest 10 HP.
// Kurs wymiany jest więc odczytany z istniejącego adaptera, nie wymyślony.

/**
 * Wagi pól — ekwiwalent HP za jednostkę pola.
 *
 * Podział na dwa źródła jest naturalny, nie arbitralny: trzy pierwsze to własność KADŁUBA
 * (`HullsData`), pięć kolejnych to statystyki MODUŁÓW (`ShipModulesData.stats`). Razem dokładnie
 * osiem pól wymienionych w decyzji 9.
 */
export const COMBAT_VALUE_WEIGHTS = {
  // ── Pola kadłuba (HullsData) ──────────────────────────────────────────────────────────────
  /** `baseHP` — definicja jednostki. Nie ruszać bez przeliczenia całej reszty tabeli. */
  hp:          1.0,
  /** `baseArmor` — pancerz odejmuje obrażenia OD KAŻDEGO trafienia, więc jego wartość rośnie
   *  z długością starcia. Przy obrażeniach broni rzędu 5–12 i bitwie ~10–20 trafień jeden punkt
   *  pancerza oszczędza kilkanaście HP. */
  armor:       12,
  /** `baseEvasion` (0..1) — mnożnik przeżywalności wyceniony liniowo, PER KADŁUB (nie jako
   *  średnia floty), więc skaluje się z liczebnością. Fregata (0.20) dostaje +12 HP-ekwiwalentu. */
  evasion:     60,

  // ── Pola statystyk modułów (ShipModulesData.stats) ────────────────────────────────────────
  /** `damage` — kurs z `empireFleetToBattleUnit` (patrz nota wyżej): 1 obrażenie = 10 HP. */
  damage:      10,
  /** `shieldHP` — po prostu dodatkowa pula punktów. */
  shieldHP:    1.0,
  /** `shieldRegen` — punkty odzyskiwane co rundę; przy starciu rzędu 10 rund to ×10. */
  shieldRegen: 10,
  /** `armorRating` — TA SAMA wielkość fizyczna co `armor` kadłuba, więc TA SAMA waga.
   *  Rozbieżność między nimi byłaby błędem, nie strojeniem. */
  armorRating: 12,
  /** `hpBonus` — TA SAMA wielkość co `hp` kadłuba, więc ta sama waga (patrz wyżej). */
  hpBonus:     1.0,
};

/** Fallbacki kadłuba — te same liczby, których używa `playerVesselsToBattleUnit`, żeby dwie
 *  wyceny tego samego kadłuba nie rozjechały się na brakującym polu. */
export const HULL_FALLBACKS = {
  hp:      50,
  armor:   0,
  evasion: 0.1,
};

/**
 * Podłoga obrony planetarnej w MIANOWNIKU `milRatio` — w tych samych jednostkach HP.
 *
 * ⚠ TO JEST GAŁKA BALANSU, nie stała techniczna, i wchodzi z konieczności strukturalnej.
 * Stary estymator miał wpisane `let total = 100 // bazowa siła obronna kolonii` i NIGDY nie
 * zwracał zera — dzięki temu `milRatio = playerMil > 0 ? … : 1.0` zawsze wchodziło w gałąź
 * dzielenia. `ThreatAssessment` liczy WYŁĄCZNIE kadłuby, więc gracz bez ani jednego okrętu
 * daje 0 — a wtedy ternary wpada w **`milRatio = 1.0`**, czyli powyżej `MIL_RATIO_WAR = 0.7`.
 * Bez tej podłogi samo wpięcie licznika wywołałoby dokładnie tę eskalację, którą K-1 wykluczył
 * jako niemożliwą — tyle że INNĄ DROGĄ (przez zerowy mianownik, nie przez pojawienie się licznika).
 *
 * Wartość: ~jedna fregata (goły kadłub 156, bojowa 248). Czyta się to jako „zasiedlony świat
 * jest wart mniej więcej jednego okrętu obrony". Pierwsze przybliżenie do przestrojenia w BALANS,
 * gdy istnieje już ekonomia militarna AI — nie wynik pomiaru.
 */
export const PLAYER_DEFENSE_BASELINE_HP = 250;

/**
 * Pola, które ŚWIADOMIE nie mają ceny — zapis decyzji, nie przeoczenie.
 *
 * `tracking`, `rangeAU`, `fireCooldownYears`, `category`, `armorPierce`:
 *   realnie wpływają na wynik starcia, ale NIE liniowo i nie w oderwaniu od `damage`
 *   (broń z `tracking` 0.8 i 0.5 różni się o ~60% skuteczności TEGO SAMEGO `damage`).
 *   Wyceniane osobnym, addytywnym współczynnikiem dawałyby liczbę gorszą niż ich brak.
 *   Decyzja 9 wymienia OSIEM pól i tych nie ma na liście — wchodzą, gdy ktoś przyniesie
 *   model nieliniowy razem z gate'em, który go zweryfikuje.
 * `attackPower`, `survivalBonus`:
 *   starsze pola „misyjne" (przeżywalność ekspedycji), nieczytane przez żaden silnik walki.
 * `troopCapacity`, `orbitalStrike`, `colonistCapacity`:
 *   zdolności naziemne/desantowe — to inna oś niż siła w kosmosie.
 */
export const DELIBERATELY_UNPRICED = Object.freeze([
  'tracking', 'rangeAU', 'fireCooldownYears', 'category', 'armorPierce',
  'attackPower', 'survivalBonus',
  'troopCapacity', 'orbitalStrike', 'colonistCapacity',
]);
