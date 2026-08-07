// AcceptanceWeightData — katalog termów, wag i progów Acceptance Engine
// (WOJNA I POKÓJ 1.0, faza D2, commit E1).
//
// Decyzja o propozycji dyplomatycznej = Σ (raw termu × waga termu) ≥ próg czasownika.
// Każdy term zwraca `raw` ZNORMALIZOWANY do −1..+1, a waga mówi, ile PUNKTÓW wyniku
// warte jest pełne wychylenie. Dzięki temu rozbicie w UI czyta się w jednej jednostce
// („opinia +18, osobowość +24, napięcie −7"), a strojenie sprowadza się do liczb TUTAJ.
//
// Ten plik to WYŁĄCZNIE dane. Podział całej fazy — lustro D1:
//   AcceptanceWeightData.js  → dane (termy, wagi, progi, nadpisania)  ← TEN plik
//   AcceptanceMath.js        → matematyka (sumowanie, rozbicie, próg, counterHint)
//   AcceptanceEngine.js      → ewaluatory termów + budowa kontekstu z window.KOSMOS
//
// ⚠ BALANS STROIMY TUTAJ I NIGDZIE INDZIEJ. Liczby poniżej to PIERWSZA WERSJA sprzed
// pomiaru — macierze akceptacji z E7 (`archetyp × objective × czasownik`) są przyrządem,
// którym E2 przelicza dawne progi 60/75/80 na wagi. Kotwice parytetu siedzą w
// `acceptance_engine_smoke` (sekcja P7) i mają PAŚĆ, gdy ktoś ruszy te liczby bez pomiaru.
//
// ⚠ REGUŁA ANTY-PODWÓJNEGO-LICZENIA (twarda, decyzja fazy D2 §6):
// jeden incydent wchodzi do wyniku dokładnie JEDNYM kanałem. Opinia jest termem, więc
// nic, co już zasila modyfikator opinii, nie może zasilać drugiego termu. Kanały spisane
// są w INCIDENT_CHANNELS na dole pliku i pilnowane asercjami, nie komentarzem.

// ── Status termu — uczciwość zamiast udawanej kompletności (audyt R9) ────────
// Backbone §2.1 opisuje jedenaście termów jako gotowe. Pięć z nich w D2 nie może
// działać w pełni i mówimy to WPROST — w danych, w rozbiciu i w artefakcie E7.
export const TERM_STATUS = {
  // Liczy się i ma źródło danych — pełnoprawny.
  LIVE:    'live',
  // Zawsze zwraca 0, świadomie. Naprawa poza fazą; NIE stroić wag względem zera.
  STUB:    'stub',
  // Liczy poprawnie, ale nikt jeszcze nie zasila wejścia (wkład = 0 w praktyce).
  UNFED:   'unfed',
  // Liczy, ma źródło, ale widzi tylko wycinek świata (reszta w późniejszej fazie).
  PARTIAL: 'partial',
};

/**
 * Katalog termów. Pola:
 *   id       — musi równać się kluczowi (pilnuje smoke)
 *   labelKey — klucz i18n wiersza w rozbiciu akceptacji
 *   unit     — słowny opis tego, co znaczy raw = +1 (dokumentacja dla strojącego)
 *   status   — TERM_STATUS (patrz wyżej); zmienia się wraz z fazami, to jest cel
 *   note     — dlaczego status jest taki, jaki jest (kotwica do planu/korekty)
 */
export const ACCEPTANCE_TERMS = {
  opinion: {
    id: 'opinion', labelKey: 'diplo.term.opinion', status: TERM_STATUS.LIVE,
    unit: '+1 = opinia +100 (maksymalna sympatia oceniającego do proponującego)',
    note: 'Koń roboczy. Reuse D1: RelationsModel.getOpinion — bez nowej matematyki.',
  },
  tension: {
    id: 'tension', labelKey: 'diplo.term.tension', status: TERM_STATUS.LIVE,
    unit: '+1 = napięcie 100 (raw ZAWSZE 0..+1; kierunek niesie ZNAK WAGI)',
    note: 'Znak zależy od czasownika: napięcie SPRZYJA paktowi i pokojowi, SZKODZI sojuszowi ' +
          'i emisariuszowi. Dlatego w VERB_ACCEPTANCE waga bywa ujemna — term nigdy nie zmienia znaku sam.',
  },
  relative_power: {
    id: 'relative_power', labelKey: 'diplo.term.relativePower', status: TERM_STATUS.STUB,
    unit: '+1 = oceniający miażdżąco silniejszy (docelowo; DZIŚ ZAWSZE 0)',
    note: 'K-1 / audyt R2: oba estymatory siły gracza są zepsute identycznie ' +
          '(`v.modules.some(m => /weapon_/.test(m?.id ?? \'\'))` na tablicy STRINGÓW → zawsze false). ' +
          'Naprawa przesuwa milRatio z ~0 na realne wartości i może natychmiast wepchnąć imperia w WAR, ' +
          'więc idzie do WAR_BACKBONE razem ze wspólnym threat assessment. Wagi zostawiamy AUTORSKIE ' +
          '(nie zerowe), żeby WAR_BACKBONE miał od czego zacząć — ale wkład jest pinowany na 0.',
  },
  war_status: {
    id: 'war_status', labelKey: 'diplo.term.warStatus', status: TERM_STATUS.LIVE,
    unit: '+1 = wyczerpanie wojną o 100 punktów PONAD cenę pokoju z casus belli',
    note: 'Jedyny konsument `casusBelli.peaceCost`, który do D2 nie miał ŻADNEGO czytelnika. ' +
          'Używany wyłącznie przez offer_peace — dla pozostałych czasowników wojna jest ' +
          'PRE-WARUNKIEM (blokada), nie składnikiem wyniku.',
  },
  personality: {
    id: 'personality', labelKey: 'diplo.term.personality', status: TERM_STATUS.LIVE,
    unit: '+1 = osie osobowości maksymalnie sprzyjają temu czasownikowi',
    note: 'Rzut wektora archetypu na osie wskazane przez czasownik (personalityAxes). ' +
          'Oś nieznana / brak imperium → 0.5 (środek skali) → wkład 0.',
  },
  reputation: {
    id: 'reputation', labelKey: 'diplo.term.reputation', status: TERM_STATUS.UNFED,
    unit: '−1 = proponujący ma reputację agresora 100',
    note: 'K-2: ReputationLedger istnieje i zanika, ale NIC nie podnosi agresji — raisery ' +
          '(niesprowokowana wojna, podbój, zerwany traktat) to D4. Term liczy poprawnie, ' +
          'wejście jest zerem. NIE stroić wag pod ten term przed D4.',
  },
  offer: {
    id: 'offer', labelKey: 'diplo.term.offer', status: TERM_STATUS.UNFED,
    unit: '+1 = łapówka nieskończona (malejące przyrosty, patrz OFFER_HALF_KR)',
    note: 'K-4: mechanizm gotowy, ale D2 NIE daje UI oferty (czasownik `gift` jest w D4), ' +
          'więc proposal.offer jest zawsze pusty ⇒ wkład 0. AI może używać wewnętrznie, ' +
          'a counterHint już dziś liczy, ILE kredytów zamknęłoby lukę.',
  },
  memory: {
    id: 'memory', labelKey: 'diplo.term.memory', status: TERM_STATUS.UNFED,
    unit: '−1 = pełne okno pamięci to same ciężkie zdrady',
    note: 'PUŁAPKA PODWÓJNEGO LICZENIA: wszystkie DZIŚ zapisywane typy pamięci wchodzą już ' +
          'do wyniku innym kanałem (opinia albo napięcie) — patrz INCIDENT_CHANNELS. Term punktuje ' +
          'WYŁĄCZNIE typy kanału `memory`, a takich dziś NIE MA. Wyłączne dowody (zerwany pakt, ' +
          'zdrada sojuszu) zapisuje dopiero D4 i wtedy MEMORY_EVIDENCE_WEIGHTS się zapełni.',
  },
  recent_refusal: {
    id: 'recent_refusal', labelKey: 'diplo.term.recentRefusal', status: TERM_STATUS.UNFED,
    unit: '−1 = odmowa dosłownie przed chwilą (liniowo do 0 przez RECENT_REFUSAL_YEARS)',
    note: 'Stan (`verbCooldowns` na rekordzie pary) zapisuje dopiero E4 — do tego czasu ' +
          'kontekst niesie pusty obiekt i term zwraca 0. To on kończy spamowanie przyciskiem.',
  },
  third_party: {
    id: 'third_party', labelKey: 'diplo.term.thirdParty', status: TERM_STATUS.PARTIAL,
    unit: '+1 = układ sojuszy w pełni sprzyja (sojusznik / wróg naszego wroga)',
    note: 'K-5: pary AI↔AI instancjonuje dopiero D5, więc w D2 term widzi wyłącznie relacje ' +
          'gracz↔AI plus wojny z WarSystem — `ally_of_our_enemy` będzie prawie zawsze zerem.',
  },
  erratic_noise: {
    id: 'erratic_noise', labelKey: 'diplo.term.erraticNoise', status: TERM_STATUS.UNFED,
    unit: '±1 = pełne wychylenie szumu (waga 15 ⇒ deklarowane w backbone ±15 punktów)',
    note: 'Rzut cechy `erratic` przy generacji imperium dokłada E5 — do tego czasu traits[] jest ' +
          'puste i term zwraca 0. Szum jest DETERMINISTYCZNY (para × czasownik × epoka ' +
          'ERRATIC_EPOCH_YEARS), nie losowany przy każdym kliknięciu: inaczej gracz klikałby ' +
          'ten sam przycisk aż trafi.',
  },
};

export const ACCEPTANCE_TERM_IDS = Object.keys(ACCEPTANCE_TERMS);

// ── Pre-warunki (twarde blokady PRZED liczeniem wyniku) ─────────────────────
// Odpowiadają temu, co dziś robi `proposeTreaty` zanim w ogóle spojrzy na progi.
// Blokada NIE jest odmową ocenianą punktami — nie ma rozbicia, jest powód.
export const PRECONDITIONS = {
  not_at_war:         { id: 'not_at_war',         reasonKey: 'diplo.reject.atWar' },
  at_war:             { id: 'at_war',             reasonKey: 'diplo.reject.notAtWar' },
  not_already_signed: { id: 'not_already_signed', reasonKey: 'diplo.reject.alreadySigned' },
};

// ── Czasowniki ──────────────────────────────────────────────────────────────
//
// PROGI — skąd te liczby (kotwica parytetu dla E2):
//
// Dzisiejszy `proposeTreaty` to KONIUNKCJA dwóch bramek (osobowość ORAZ zaufanie). Suma
// ważona NIE odtworzy koniunkcji dla dowolnego wektora osobowości — wysoka opinia zawsze
// skompensuje słabą osobowość. Odtwarza ją natomiast DOKŁADNIE dla rosteru, który w grze
// faktycznie istnieje: oba imperia AI (industrialist i jego klon expansionist) mają
// aggression 0.3 / trade 0.9, więc obie bramki osobowości i tak przechodzą i jedyną realną
// bramką jest opinia (trust 60/75/80 ⇒ opinia 10/25/30).
//
// Stąd wzór progu:  próg = wkład osobowości TEGO rosteru + dawny próg opinii × waga/100.
//   trade_agreement:  0.8 × 30 = 24   +  10 × 40/100 =  4   ⇒ 28
//   non_aggression:   0.4 × 35 = 14   +  25 × 40/100 = 10   ⇒ 24
//   alliance:         0.8 × 35 = 28   +  30 × 50/100 = 15   ⇒ 43
// Wagi opinii dobrane tak, by granica wypadła MIĘDZY dawnym progiem a progiem minus jeden
// punkt opinii — inaczej „parytet" byłby przypadkiem, a nie własnością.
//
// ⚠ PARYTET OBOWIĄZUJE PRZY NAPIĘCIU 0 i pustych pozostałych termach. Dawny kod IGNOROWAŁ
// napięcie; tutaj ono waży (sprzyja paktowi, szkodzi sojuszowi i umowie). To jest ZAMIERZONA
// zmiana z backbone §2.1 — jej rozmiar mierzy macierz z E7, nie zgadujemy go tutaj.
// Rozbieżności dla archetypów spoza rosteru są równie zamierzone (i też mierzone).
//
// Pola czasownika:
//   threshold       — wynik ≥ próg ⇒ akceptacja
//   terms           — { termId: waga w PUNKTACH za pełne wychylenie raw }
//   personalityAxes — { oś: współczynnik } dla termu `personality` (znak = kierunek)
//   preconditions   — twarde blokady sprawdzane PRZED liczeniem
//   treatyId        — dla czasowników traktatowych (bramka not_already_signed)
export const VERB_ACCEPTANCE = {
  // Umowa handlowa. Dziś: pers.trade ≥ 0.5 && trust ≥ 60 (⇒ opinia ≥ 10).
  // Parytet rosteru: osobowość 24 pkt + opinia 10 × 0,40 = 4 pkt ⇒ próg 28.
  trade_agreement: {
    id: 'trade_agreement',
    treatyId: 'trade_agreement',
    threshold: 28,
    preconditions: ['not_at_war', 'not_already_signed'],
    personalityAxes: { trade: +1 },
    terms: {
      opinion: 40, personality: 30, tension: -10, memory: 20, reputation: 15,
      third_party: 10, recent_refusal: 25, offer: 20, relative_power: 10, erratic_noise: 15,
    },
  },

  // Pakt o nieagresji. Dziś: pers.aggression ≤ 0.4 && trust ≥ 75 (⇒ opinia ≥ 25).
  // Parytet rosteru: osobowość 14 pkt + opinia 25 × 0,40 = 10 pkt ⇒ próg 24.
  // ⚠ ZAMIERZONA ZMIANA: napięcie ma znak DODATNI — imperium na krawędzi wojny CHĘTNIEJ
  // podpisze pakt (backbone §2.1). Przy wysokim napięciu pakt bywa więc łatwiejszy niż dziś.
  non_aggression: {
    id: 'non_aggression',
    treatyId: 'non_aggression',
    threshold: 24,
    preconditions: ['not_at_war', 'not_already_signed'],
    personalityAxes: { aggression: -1 },
    terms: {
      opinion: 40, personality: 35, tension: +20, memory: 20, reputation: 15,
      third_party: 10, recent_refusal: 25, offer: 20, relative_power: 20, erratic_noise: 15,
    },
  },

  // Sojusz. Dziś: pers.aggression ≤ 0.3 && trust ≥ 80 (⇒ opinia ≥ 30).
  // Parytet rosteru: osobowość (0,4 + 0,4) × 35 = 28 pkt + opinia 30 × 0,50 = 15 pkt ⇒ próg 43.
  // Napięcie ze znakiem UJEMNYM — sojusz to zaufanie, nie desperacja.
  alliance: {
    id: 'alliance',
    treatyId: 'alliance',
    threshold: 43,
    preconditions: ['not_at_war', 'not_already_signed'],
    personalityAxes: { aggression: -1, trade: +0.5 },
    terms: {
      opinion: 50, personality: 35, tension: -25, memory: 25, reputation: 20,
      third_party: 20, recent_refusal: 25, offer: 15, relative_power: 20, erratic_noise: 15,
    },
  },

  // Propozycja pokoju. NIE MA dzisiejszego odpowiednika do parytetu — `offerPeace`
  // ustawia rozejm bezwarunkowo (audyt R5), więc każdy wynik ≠ „zawsze tak" jest zmianą
  // rozgrywki. Próg 0 = „przeważ argumenty"; ciężar leży na wyczerpaniu wojną.
  offer_peace: {
    id: 'offer_peace',
    threshold: 0,
    preconditions: ['at_war'],
    personalityAxes: { aggression: -1 },
    terms: {
      war_status: 55, opinion: 20, personality: 25, tension: +10, memory: 15,
      reputation: 10, third_party: 10, recent_refusal: 20, offer: 25, relative_power: 30,
      erratic_noise: 15,
    },
  },

  // Emisariusz (misja abstrakcyjna, bez lotu). Dziś: cel NIE MA głosu.
  // Próg ujemny — delegację przyjmuje się domyślnie; odmowa to wyjątek dla imperiów
  // wrogich ORAZ napiętych. Świadomie BEZ pre-warunku `not_at_war`: emisariusz w czasie
  // wojny to sensowna sonda pokojowa, a modyfikator at_war (−40) i tak zwykle ją utrąci.
  improve_relations: {
    id: 'improve_relations',
    threshold: -10,
    preconditions: [],
    personalityAxes: { secrecy: -1, trade: +0.5 },
    terms: {
      opinion: 25, personality: 20, tension: -20, memory: 15, reputation: 15,
      third_party: 5, recent_refusal: 25, offer: 10, erratic_noise: 15,
    },
  },
};

export const ACCEPTANCE_VERB_IDS = Object.keys(VERB_ACCEPTANCE);

// ⚠ `declare_war` ŚWIADOMIE NIE MA wpisu: wypowiedzenie wojny jest jednostronne —
// nikt go nie akceptuje (backbone §3.2). Casus belli + reputacja to D4.

// ── Nadpisania wag: archetyp (kultura) ──────────────────────────────────────
// `terms` to MNOŻNIKI wagi bazowej, `thresholdDelta` to dodatek do progu (punkty).
// BRAK WPISU = brak nadpisań. Industrialist i expansionist celowo nie mają wpisu:
// są jedynymi imperiami w grze, więc to na nich stoi parytet E2 — mnożnik na nich
// przesunąłby kotwicę i zmieszał „silnik ocenia inaczej" z „kultura ocenia inaczej".
export const ARCHETYPE_WEIGHT_OVERRIDES = {
  xenophage:    { terms: { opinion: 0.7, tension: 1.4 },              thresholdDelta: +20 },
  swarm:        { terms: { opinion: 0.5 },                            thresholdDelta: +35 },
  isolationist: { terms: { tension: 1.3, third_party: 0.5 },          thresholdDelta: +10 },
  trader:       { terms: { offer: 1.5 },                              thresholdDelta:  -8 },
  hegemon:      { terms: { relative_power: 1.5, opinion: 0.9 },       thresholdDelta:  +5 },
};

// ── Nadpisania wag: objective (agenda) ──────────────────────────────────────
// ⚠ PUSTE W E1 I TO NIE JEST PLACEHOLDER FUNKCJI, tylko brak strojenia: mechanizm
// nadpisań działa i jest przetestowany, ale wartości wypełnia E5 razem ze swoim
// live-gate'em („ten sam archetyp z różnym objective akceptuje MIERZALNIE inaczej").
// Pusta tabela jest w smoke przypięta jako no-op, żeby diff E5 był widoczny co do punktu.
export const OBJECTIVE_WEIGHT_OVERRIDES = {};

// ── Skala i stałe strojenia ─────────────────────────────────────────────────

// Ile kredytów daje POŁOWĘ maksymalnego wkładu termu `offer` (malejące przyrosty).
export const OFFER_HALF_KR = 500;

// Jak długo (lata GRY — te same, w których liczy `timeSystem.gameTime`) świeża odmowa
// obciąża kolejną próbę. Backbone: −20 przez 2 lata; tu 2 lata × waga 25 ⇒ −25 tuż po odmowie.
export const RECENT_REFUSAL_YEARS = 2;

// Ile OSTATNICH wpisów pamięci relacji widzi term `memory`.
// ⚠ ŚWIADOMIE OSOBNA GAŁKA od `CB_MEMORY_WINDOW` (D1, też 10), mimo tej samej wartości:
// tamto okno wybiera casus belli LICZĄC wystąpienia typów, więc jego poszerzenie po cichu
// przecenia wojny. Zlanie obu w jedną stałą zrobiłoby z akceptacji zakładnika tamtej decyzji.
export const MEMORY_WINDOW = 10;

// Długość epoki szumu `erratic` (lata GRY) — co tyle imperium „zmienia humor".
export const ERRATIC_EPOCH_YEARS = 10;

// Wkłady cząstkowe termu `third_party` (przed clampem do ±1).
export const THIRD_PARTY_WEIGHTS = {
  our_ally:               +0.5,   // proponujący jest naszym sojusznikiem
  ally_of_our_enemy:      -0.4,   // za każdego wspólnie znanego wroga, z którym jest w sojuszu
  at_war_with_our_enemy:  +0.3,   // wróg naszego wroga
};

// Maksymalna luka (w punktach wyniku), przy której counterHint w ogóle proponuje łapówkę.
// Powyżej — odmowa jest merytoryczna i sugerowanie kredytów byłoby kłamstwem.
export const COUNTER_HINT_MAX_GAP = 40;

// Zaokrąglenie sugerowanej łapówki w górę do wielokrotności (Kr) — okrągłe liczby w UI.
export const COUNTER_HINT_KR_STEP = 50;

// ── Kanały incydentów — egzekucja reguły anty-podwójnego-liczenia ────────────
//
// Każdy typ wpisu pamięci relacji (`memory[].type`, pisany przez DiplomacySystem.addMemory)
// wchodzi do wyniku akceptacji DOKŁADNIE JEDNYM kanałem:
//   'opinion' — ma swój modyfikator w OPINION_MODIFIERS ⇒ liczy się przez term `opinion`
//   'tension' — podbija napięcie ⇒ liczy się przez term `tension`
//   'status'  — zmienia stan pary (wojna/rozejm) ⇒ liczy się przez pre-warunki i `war_status`
//   'memory'  — NIE MA innego kanału ⇒ punktuje go term `memory`
//
// Term `memory` czyta WYŁĄCZNIE typy kanału 'memory'. Smoke sprawdza to wykonaniem,
// nie komentarzem — i pilnuje, by żaden typ kanału 'opinion' nie zniknął z katalogu modyfikatorów.
//
// ⚠ `territorial_violation` i `surveillance_scan` mają TRZECIEGO czytelnika — inferCasusBelli.
// To nie jest podwójne liczenie: CB wybiera CENĘ pokoju (peaceCost), nie dokłada punktów.
export const INCIDENT_CHANNELS = {
  military_presence:     'opinion',
  research_intrusion:    'opinion',
  trespassing:           'opinion',
  territorial_violation: 'tension',
  surveillance_scan:     'tension',
  warning_issued:        'tension',
  ultimatum_issued:      'tension',
  war_declared:          'status',
  peace_offered:         'status',
};

// Wagi dowodów dla termu `memory` — TYLKO typy kanału 'memory'.
//
// ⚠ PUSTE, I TO JEST WYNIK ANALIZY, NIE NIEDOKOŃCZONA ROBOTA: każdy typ, który
// dzisiejszy kod faktycznie zapisuje, ma już inny kanał (patrz INCIDENT_CHANNELS).
// Wyłączne dowody z backbone (`broke_treaty_with_us` i spółka) NIE ISTNIEJĄ — `breakTreaty`
// dokłada napięcie i zdejmuje modyfikator, ale NIE pisze wpisu pamięci. Zapełni to D4
// razem z czasownikami zdrady; wtedy pin „tabela jest pusta" w smoke ma PAŚĆ i zostać
// świadomie zaktualizowany.
export const MEMORY_EVIDENCE_WEIGHTS = {};
