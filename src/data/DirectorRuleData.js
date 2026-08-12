// DirectorRuleData — katalog reguł ReactionDirectora (workstream C, Slice 1, commit S1).
//
// Ten plik to WYŁĄCZNIE DANE: wyzwalacz, warunki, opóźnienie, odpowiedź, modyfikator
// osobowości, cooldown. Balans reguł strojymy TUTAJ i nigdzie indziej — cała matematyka
// siedzi w `src/utils/DirectorRuleMath.js`, cały stan w `src/systems/director/DirectorSystem.js`.
// Wzór pliku: `OpinionModifierData.js` (płaska mapa `id → obiekt`, `id` równy kluczowi,
// pilnowane smoke'iem).
//
// ⚠ HISTORIA KATALOGU: S1 celowo zostawił go PUSTYM (najpierw kontrakt i testy, potem
// konsumenci — ta sama dyscyplina co „E1 stoi samodzielnie" w D2). Wpisy dołożyły S5
// (`first_contact`) i S6 (`military_pressure_l1/l2`). Kształt każdego waliduje `validateRule`,
// więc wadliwy wpis pada w teście, zanim dojdzie do silnika.
//
// ⚠ KAŻDA reguła katalogu jest oceniana w KAŻDYM ticku dla KAŻDEGO imperium — także ta, która
// istnieje głównie jako cel eskalacji. Dlatego `military_pressure_l2` ma WŁASNY, cięższy próg
// wyzwalacza (≥3 statki), a nie tylko wejście przez `escalatesTo`: bez tego odpalałaby się
// samodzielnie na tych samych warunkach co L1.
//
// ⚠ JEDNOSTKA CZASU: każde pole `*Years`, `delay` i `roll.unit` mówi o latach
// WYŚWIETLANYCH (zegar gracza). `roll.unit` musi być wpisane DOSŁOWNIE — walidator tego
// pilnuje, bo przegląd fazy D2/E6 znalazł trzy komentarze kłamiące o własnej jednostce
// i to jest tańszy bezpiecznik niż kolejny taki przegląd.

/**
 * KONTRAKT WPISU
 *
 * {
 *   id:        'first_contact',            // === klucz w mapie
 *
 *   // Skąd bierze się FAKT. 'poll' = odczyt sondy w ticku, 'event' = subskrypcja EventBusa.
 *   trigger:   { kind: 'poll',  probe: 'playerObservatoryLevel', gte: 5 }
 *           |  { kind: 'event', on: 'director:borderPresence', where: { armed: true } },
 *
 *   // Nazwy predykatów z rejestru DirectorGuards. Wszystkie muszą przejść.
 *   guard:     ['empireNotAtWarWithPlayer'],
 *
 *   // Kumulatywny rzut roczny. Pomijalny — reguła bez `roll` odpala od razu po guardach.
 *   roll:      { startPct: 10, stepPct: 10, capPct: 100, unit: 'displayedYear' },
 *
 *   // Ile lat WYŚWIETLANYCH od decyzji do odpowiedzi. 0 = natychmiast.
 *   delay:     1.0,
 *
 *   // Nazwa akcji z rejestru DirectorActions + jej parametry (dane, nie kod).
 *   response:  { action: 'scienceFlyby', params: { template: 'science_probe' } },
 *
 *   // JEDNA oś osobowości archetypu → mnożnik szansy. Slice 1 nie robi tabel krzyżowych.
 *   personalityMod: { axis: 'science', at0: 0.5, at1: 1.5 },
 *
 *   // `once: true` = raz na parę (imperium↔gracz), na zawsze. Inaczej `years`.
 *   cooldown:  { once: true } | { years: 5.0 },
 *
 *   // Opcjonalna eskalacja: powtórka w oknie przełącza na regułę wyższego szczebla.
 *   escalatesTo: 'military_pressure_l2',
 *   escalationWindowYears: 10.0,
 * }
 *
 * ⚠ DANE NIE ZAWIERAJĄ KODU. `response.action`, `guard[]` i `trigger.probe` to NAZWY
 * rozwiązywane w rejestrach (`DirectorActions`, `DirectorGuards`, `DirectorProbes`).
 * Nieznana nazwa = GŁOŚNY błąd przy starcie, nigdy cichy no-op (audyt R12 — to jest
 * dokładnie mechanizm, którym martwe `EconAI`/`MilitaryAI` przetrwały niezauważone).
 */

/** Katalog reguł. S5 dokłada `first_contact`; nacisk L1-L2 dochodzi w S6. */
export const DIRECTOR_RULES = {
  /**
   * PIERWSZY KONTAKT — obce imperium wysyła sondę badawczą przez układ gracza.
   *
   * Próg L5 jest bramką **progresji narracyjnej**, nie sensorycznej (decyzja 3): radar
   * obserwatorium nasyca się już na L4 (`VESSEL_DETECTION_RANGE[4] = Infinity`), więc
   * przelotu NIE DA SIĘ przegapić i jest to przyjęte świadomie.
   *
   * Rzut jest kumulatywny w latach WYŚWIETLANYCH (decyzja 2): 10 % w pierwszym roku,
   * +10 pkt proc. rocznie — wartość oczekiwana ~3,7 roku, czyli beat wypada w środku
   * typowej partii 30–40 lat. W latach cywilizacyjnych (1/12 roku) wystrzeliłby ~10 miesięcy
   * po L5, czyli praktycznie natychmiast — dlatego silnik liczy próbę RAZ NA ROK WYŚWIETLANY.
   *
   * `once: true` — pierwszy kontakt z danym imperium zdarza się raz na partię.
   */
  first_contact: {
    id:       'first_contact',
    trigger:  { kind: 'poll', probe: 'playerObservatoryLevel', gte: 5 },
    guard:    ['empireNotAtWarWithPlayer'],
    roll:     { startPct: 10, stepPct: 10, capPct: 100, unit: 'displayedYear' },
    delay:    0,
    response: { action: 'scienceFlyby', params: { template: 'science_probe' } },
    // Imperia „naukowe" wysyłają sondę chętniej. JEDNA oś — Slice 1 nie robi tabel krzyżowych.
    personalityMod: { axis: 'science', at0: 0.5, at1: 1.5 },
    cooldown: { once: true },
  },

  /**
   * NACISK MILITARNY L1 — uzbrojony statek gracza stoi w POWŁOCE GRANICZNEJ imperium.
   *
   * ⚠ Powłoka graniczna, a NIE przestrzeń roszczona. Wejście w przestrzeń roszczoną ma już
   * własny, automatycznie naliczany modyfikator (`military_presence` w `DiplomacySystem`),
   * więc reagowanie tu i tam podwoiłoby karę za jeden czyn (decyzja 7). Zbiory są rozłączne
   * z konstrukcji (`InfluenceMap.classifyGalaxy`) — „wszedł mi na podwórko" i „stoi tuż za
   * płotem" to w tej mechanice różne zdarzenia.
   *
   * Odpowiedź: incydent na kanale OPINII + 2 fregaty obrony układu. Napięcia NIE rusza —
   * L1–L2 mają grozić, nie wypowiadać wojnę (drabina 40/60/80 należy do L3 w Slice 2).
   */
  military_pressure_l1: {
    id:       'military_pressure_l1',
    trigger:  { kind: 'poll', probe: 'armedPlayerVesselsInBorderZone', gte: 1 },
    guard:    ['empireNotAtWarWithPlayer'],
    roll:     { startPct: 40, stepPct: 30, capPct: 100, unit: 'displayedYear' },
    delay:    0,
    response: { action: 'pressureResponse', params: { level: 1, count: 2 } },
    // Agresywne imperia reagują szybciej; ostrożne dają graczowi więcej czasu.
    personalityMod: { axis: 'aggression', at0: 0.6, at1: 1.4 },
    cooldown: { years: 5.0 },
    escalatesTo: 'military_pressure_l2',
    escalationWindowYears: 10.0,
  },

  /**
   * NACISK MILITARNY L2 — „możemy przyjść do was".
   *
   * Dwie drogi wejścia, obie zamierzone: (a) ESKALACJA — powtórka nacisku w oknie 10 lat od L1
   * przełącza odpowiedź na ten szczebel; (b) SAMODZIELNIE, gdy nacisk jest wyraźnie cięższy
   * (≥ 3 uzbrojone statki). Bez (b) reguła w katalogu byłaby oceniana co tik i nie miałaby
   * własnego warunku — a `DirectorSystem` ocenia KAŻDĄ regułę katalogu, nie tylko te wskazane
   * przez eskalację.
   *
   * Dokłada JEDEN okręt zdolny do skoku (dobór z osobowości) do fregat obrony układu.
   */
  military_pressure_l2: {
    id:       'military_pressure_l2',
    trigger:  { kind: 'poll', probe: 'armedPlayerVesselsInBorderZone', gte: 3 },
    // 🔴 `pressureEscalationReady` dołożony po GATE 3: L1 i L2 rzucają NIEZALEŻNIE, więc bez
    // tej bramki pierwszy incydent imperium potrafił być L2 (zmierzone: seedy `emp_D`, `emp_G`),
    // a obie reguły potrafiły paść w tym samym roku. Inwariant: pierwszy incydent = ZAWSZE L1.
    guard:    ['empireNotAtWarWithPlayer', 'pressureEscalationReady'],
    roll:     { startPct: 50, stepPct: 30, capPct: 100, unit: 'displayedYear' },
    delay:    0,
    response: { action: 'pressureResponse', params: { level: 2, count: 2 } },
    personalityMod: { axis: 'aggression', at0: 0.6, at1: 1.4 },
    cooldown: { years: 5.0 },
  },
};

/**
 * Przykład referencyjny — NIE jest częścią katalogu i NIGDY nie zostanie wykonany.
 * Istnieje po to, żeby kontrakt był sprawdzalny WYKONANIEM (keeper przepuszcza go
 * przez `validateRule`), a nie tylko czytelny w komentarzu. Martwy przykład, który
 * przechodzi walidator, jest tańszy niż żywa reguła dodana „na próbę".
 */
export const EXAMPLE_RULE = Object.freeze({
  id:       'example_reference_rule',
  trigger:  { kind: 'poll', probe: 'playerObservatoryLevel', gte: 5 },
  guard:    ['empireNotAtWarWithPlayer'],
  roll:     { startPct: 10, stepPct: 10, capPct: 100, unit: 'displayedYear' },
  delay:    0,
  response: { action: 'noop', params: {} },
  personalityMod: { axis: 'science', at0: 0.5, at1: 1.5 },
  cooldown: { once: true },
});
