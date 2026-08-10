// DirectorRuleData — katalog reguł ReactionDirectora (workstream C, Slice 1, commit S1).
//
// Ten plik to WYŁĄCZNIE DANE: wyzwalacz, warunki, opóźnienie, odpowiedź, modyfikator
// osobowości, cooldown. Balans reguł strojymy TUTAJ i nigdzie indziej — cała matematyka
// siedzi w `src/utils/DirectorRuleMath.js`, cały stan w `src/systems/director/DirectorSystem.js`.
// Wzór pliku: `OpinionModifierData.js` (płaska mapa `id → obiekt`, `id` równy kluczowi,
// pilnowane smoke'iem).
//
// ⚠ S1 CELOWO NIE DODAJE ŻADNEJ REGUŁY. Katalog jest pusty, a poniżej stoi KONTRAKT
// (kształt + przykład), przez który muszą przejść wpisy S5 (pierwszy kontakt) i S6
// (nacisk militarny). Kształt waliduje `validateRule` — czysto, więc test łapie wadliwy
// wpis zanim ten dojdzie do silnika. To jest ta sama dyscyplina, co „E1 stoi samodzielnie"
// w D2: najpierw kontrakt i testy, potem konsumenci.
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

/** Katalog reguł. S1: PUSTY — wpisy dokładają S5 (pierwszy kontakt) i S6 (nacisk L1-L2). */
export const DIRECTOR_RULES = {};

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
