// NarrativeEventsData — eventy narracyjne frakcji (Faza C3)
//
// Eventy które opowiadają historię kolonii przez lata i przesuwają suwak frakcji.
// Triggerowane przez FactionSystem._checkNarrativeEvents() na podstawie warunków,
// LUB przez FactionSystem._checkTensionThresholds() (faction_crisis_protest).
//
// Struktura eventu narracyjnego:
//   id:          unikalny klucz
//   once:        bool — czy triggeruje tylko raz w historii gry
//   condition:   (gameYear, colony, factionSystem) => bool — kiedy się odpali
//                (jeśli brak — event triggerowany przez inny mechanizm, np. tension)
//   severity:    'info' | 'warning' | 'danger' | 'discovery' — styl popupu
//   titlePL/EN:  nagłówek
//   descPL/EN:   pełny tekst opowieści
//   svgKey:      klucz z SVG_ICONS w TerminalPopupBase ('alert' | 'colony' | 'discovery' | 'recon' | 'report' | 'disaster' | 'impact' | 'deposit')
//   choice:      bool — czy wymaga decyzji (TAK/NIE)
//   sliderDelta: number — automatyczny shift suwaka (gdy choice=false)
//   optionA/B:   { labelPL, labelEN, sliderDelta, effectDescPL/EN } — gdy choice=true
//
// Konwencja shifta suwaka:
//   + = w stronę Konfederatów (zostajemy)
//   - = w stronę Poszukiwaczy (wracamy)

export const NARRATIVE_EVENTS = [

  // ── KAMIEŃ MILOWY 1 — Pierwsze dziecko ─────────────────────────────────
  {
    id: 'first_child_born',
    once: true,
    // 5 lat od założenia kolonii — pierwsze pokolenie urodzone w nowym domu
    condition: (gameYear, colony) =>
      colony && (gameYear - (colony.founded ?? 0)) >= 5,
    severity: 'discovery',
    titlePL: 'Pierwsze dziecko urodzone tu',
    titleEN: 'First Child Born Here',
    descPL: 'Ma na imię Nova. Urodziła się 47 280 lat świetlnych od Ziemi, na planecie którą jej rodzice wybrali zamiast domu. Nigdy nie zobaczy Ziemi. Dla niej — to jest dom.',
    descEN: 'Her name is Nova. Born 47,280 light years from Earth, on a planet her parents chose instead of home. She will never see Earth. For her — this is home.',
    svgKey: 'colony',           // brak 'population' w SVG_ICONS — colony wizualnie pasuje
    choice: false,
    sliderDelta: +4,            // przesuwa w stronę Konfederatów — tu jest życie
  },

  // ── KAMIEŃ MILOWY 2 — Ostatni który pamiętał ───────────────────────────
  {
    id: 'last_who_remembered',
    once: true,
    // 80 lat — pierwsze pokolenie osiąga starość, ostatni żyjący widzieli Ziemię
    condition: (gameYear, colony) =>
      colony && (gameYear - (colony.founded ?? 0)) >= 80,
    severity: 'warning',
    titlePL: 'Ostatni który pamiętał',
    titleEN: 'The Last One Who Remembered',
    descPL: 'Dziś zmarł Ezra Kowalski, lat 94. Był ostatnią osobą w kolonii która widziała Ziemię na własne oczy. Pamiętał zapach deszczu w Krakowie. Pamiętał kolor nieba. Odszedł ze sobą wszystko czego nie da się opisać słowami.',
    descEN: 'Ezra Kowalski, age 94, died today. He was the last person in the colony who had seen Earth with his own eyes. He remembered the smell of rain in Kraków. He remembered the color of the sky. He took with him everything that cannot be put into words.',
    svgKey: 'alert',
    choice: false,
    sliderDelta: -6,            // śmierć ostatniego świadka — wzmaga tęsknotę
  },

  // ── DECYZJA POKOLENIOWA 1 — 50 lat ─────────────────────────────────────
  {
    id: 'generational_decision_1',
    once: true,
    condition: (gameYear, colony) =>
      colony && (gameYear - (colony.founded ?? 0)) >= 50,
    severity: 'warning',
    titlePL: 'Decyzja Pokoleniowa',
    titleEN: 'Generational Decision',
    descPL: 'Nowe pokolenie kolonistów dorastało tu od urodzenia. Dla nich ta planeta jest domem — nie tymczasowym miejscem. Rada pyta: czy program Powrotu nadal jest priorytetem?',
    descEN: 'A new generation of colonists grew up here from birth. For them this planet is home — not a temporary place. The council asks: is the Return program still a priority?',
    svgKey: 'discovery',         // brak 'research' — discovery pasuje (przełom decyzyjny)
    choice: true,
    optionA: {
      labelPL: 'Tak — wracamy do domu',
      labelEN: 'Yes — we return home',
      sliderDelta: -15,
      effectDescPL: 'Suwak frakcji przesuwa się mocno w stronę Poszukiwaczy',
      effectDescEN: 'Faction slider shifts strongly toward Seekers',
    },
    optionB: {
      labelPL: 'Nie — jesteśmy w domu',
      labelEN: 'No — we are home',
      sliderDelta: +15,
      effectDescPL: 'Suwak frakcji przesuwa się mocno w stronę Konfederatów',
      effectDescEN: 'Faction slider shifts strongly toward Confederates',
    },
  },

  // ── DECYZJA POKOLENIOWA 2 — 100 lat ────────────────────────────────────
  {
    id: 'generational_decision_2',
    once: true,
    condition: (gameYear, colony) =>
      colony && (gameYear - (colony.founded ?? 0)) >= 100,
    severity: 'warning',
    titlePL: 'Decyzja Pokoleniowa — Drugie Pokolenie',
    titleEN: 'Generational Decision — Second Generation',
    descPL: 'Minęło sto lat. Żyje już trzecie pokolenie kolonistów. Nikt żyjący nie widział Ziemi. Kroniki mówią o niej jak o legendzie. Czy nadal budujemy ku niej drogę?',
    descEN: 'A hundred years have passed. The third generation of colonists is alive. No one living has seen Earth. The chronicles speak of it like a legend. Do we still build a road toward it?',
    svgKey: 'discovery',
    choice: true,
    optionA: {
      labelPL: 'Tak — pamięć zobowiązuje',
      labelEN: 'Yes — memory obliges',
      sliderDelta: -12,
      effectDescPL: 'Suwak przesuwa się w stronę Poszukiwaczy',
      effectDescEN: 'Slider shifts toward Seekers',
    },
    optionB: {
      labelPL: 'Nie — legenda nie jest domem',
      labelEN: 'No — a legend is not a home',
      sliderDelta: +12,
      effectDescPL: 'Suwak przesuwa się w stronę Konfederatów',
      effectDescEN: 'Slider shifts toward Confederates',
    },
  },

  // ── DECYZJA POKOLENIOWA 3 — 200 lat (Próg) ─────────────────────────────
  {
    id: 'generational_decision_3',
    once: true,
    condition: (gameYear, colony) =>
      colony && (gameYear - (colony.founded ?? 0)) >= 200,
    severity: 'warning',
    titlePL: 'Decyzja Pokoleniowa — Próg',
    titleEN: 'Generational Decision — The Threshold',
    descPL: 'Dwieście lat. Sfera Dysona rośnie. Brama jest możliwa. Pytanie nie jest już teoretyczne: jeśli da się wrócić — czy chcemy?',
    descEN: 'Two hundred years. The Dyson Sphere grows. The Gate is possible. The question is no longer theoretical: if we can return — do we want to?',
    svgKey: 'discovery',         // brak 'energy' — discovery wizualnie najbliżej
    choice: true,
    optionA: {
      labelPL: 'Wracamy — to jest cel',
      labelEN: 'We return — that is the goal',
      sliderDelta: -20,
      effectDescPL: 'Silne przesunięcie ku Poszukiwaczom',
      effectDescEN: 'Strong shift toward Seekers',
    },
    optionB: {
      labelPL: 'Zostajemy — zbudowaliśmy coś większego',
      labelEN: 'We stay — we built something greater',
      sliderDelta: +20,
      effectDescPL: 'Silne przesunięcie ku Konfederatom',
      effectDescEN: 'Strong shift toward Confederates',
    },
  },

  // ── ZIMA POKOLENIOWA — 60 lat — utrata sensu ───────────────────────────
  {
    id: 'generational_winter_1',
    once: true,
    condition: (gameYear, colony) =>
      colony && (gameYear - (colony.founded ?? 0)) >= 60,
    severity: 'danger',
    titlePL: 'Zmęczenie Misją',
    titleEN: 'Mission Fatigue',
    descPL: 'Raporty psychologów są niepokojące. Nowe pokolenie nie rozumie po co Sfera Dysona, nie wierzy w Ziemię której nie widziało, nie chce poświęcać życia na projekt dziadków. Produkcja spada. Nie z kryzysu ekonomicznego — z utraty sensu.',
    descEN: 'Psychologist reports are alarming. The new generation does not understand why the Dyson Sphere, does not believe in an Earth they have never seen, does not want to sacrifice their lives for their grandparents\' project. Production falls. Not from economic crisis — from loss of meaning.',
    svgKey: 'alert',
    choice: true,
    optionA: {
      labelPL: 'Program "Dziedzictwo" — pokaż im historię',
      labelEN: '"Heritage" Program — show them history',
      sliderDelta: +5,
      effectDescPL: '+10 morale, lekkie przesunięcie ku Konfederatom',
      effectDescEN: '+10 morale, slight shift toward Confederates',
    },
    optionB: {
      labelPL: 'Przyspiesz program Powrotu — daj im cel',
      labelEN: 'Accelerate Return program — give them a goal',
      sliderDelta: -5,
      effectDescPL: '+10 morale, lekkie przesunięcie ku Poszukiwaczom',
      effectDescEN: '+10 morale, slight shift toward Seekers',
    },
  },

  // ── KRYZYS FRAKCYJNY — przy napięciu ≥71 ───────────────────────────────
  // NIE używa condition — triggerowany przez FactionSystem._checkTensionThresholds
  // once:false — może powtarzać się gdy napięcie znowu rośnie po resetcie
  {
    id: 'faction_crisis_protest',
    once: false,
    severity: 'danger',
    titlePL: 'Kryzys Frakcyjny',
    titleEN: 'Faction Crisis',
    descPL: 'Napięcie między frakcjami osiągnęło punkt krytyczny. Mniejszość organizuje sabotaż i protesty. Dostawy surowców są zagrożone.',
    descEN: 'Tension between factions has reached a critical point. The minority is organizing sabotage and protests. Resource supplies are at risk.',
    svgKey: 'alert',
    choice: true,
    optionA: {
      labelPL: 'Ustąp mniejszości',
      labelEN: 'Concede to minority',
      // Kierunek shifta zależy od dominującej frakcji — handler w GameScene
      // czyta sliderDirectionForMinority i mnoży tę bazową wartość przez ±1.
      sliderDelta: 15,
      effectDescPL: 'Suwak przesuwa się ku mniejszości, napięcie spada',
      effectDescEN: 'Slider shifts toward minority, tension drops',
    },
    optionB: {
      labelPL: 'Stłum siłą',
      labelEN: 'Suppress by force',
      sliderDelta: 0,
      effectDescPL: 'Napięcie spada ale prosperity -20 przez 10 lat',
      effectDescEN: 'Tension drops but prosperity -20 for 10 years',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  Faza C5 — NARODZINY FRAKCJI (łańcuch eventów po odkryciu Ziemi)
  // ═══════════════════════════════════════════════════════════════════════

  // ── 1. Odkrycie położenia Ziemi (triggerowane przez TechSystem) ────────
  {
    id: 'earth_located',
    once: true,
    condition: null,            // triggerowany przez TechSystem (kronika_lokalizacji)
    severity: 'discovery',
    titlePL: '47 280 lat świetlnych',
    titleEN: '47,280 Light Years',
    descPL: 'Obserwatorium skalibrowane. Znamy kierunek. Znamy odległość.\n\n47 280 lat świetlnych od Ziemi.\n\nPrzy obecnej technologii: niemożliwe za życia kogokolwiek z nas. Może za życia naszych dzieci. Może nigdy.\n\nKoloniści reagują różnie.',
    descEN: 'Observatory calibrated. We know the direction. We know the distance.\n\n47,280 light years from Earth.\n\nAt current technology: impossible in any of our lifetimes. Perhaps in our children\'s. Perhaps never.\n\nThe colonists react differently.',
    svgKey: 'discovery',
    choice: false,
    sliderDelta: 0,
    onComplete: 'faction_birth', // GameScene handler chainuje first_voices_of_division
  },

  // ── 2. Pierwsze głosy podziału (chained po earth_located) ──────────────
  {
    id: 'first_voices_of_division',
    once: true,
    condition: null,            // triggerowany przez chain (faction_birth)
    severity: 'warning',
    titlePL: 'Pierwsze głosy podziału',
    titleEN: 'First Voices of Division',
    descPL: 'Przez pierwsze tygodnie po odkryciu koloniści milczeli. Teraz zaczęli mówić — i nie mówią jednym głosem.\n\nJedni twierdzą że skoro wiemy gdzie jest Ziemia, musimy zbudować drogę powrotną. Inni pytają: po co? Tu mamy planetę, zasoby, przyszłość.\n\nTo nie jest jeszcze konflikt. Ale jest zaczątkiem czegoś czego nie da się zatrzymać.',
    descEN: 'For the first weeks after the discovery the colonists were silent. Now they speak — and not with one voice.\n\nSome say we must build a way back. Others ask: why? We have a planet here.\n\nThis is not yet a conflict. But it is the beginning of something that cannot be stopped.',
    svgKey: 'alert',
    choice: false,
    sliderDelta: 0,
  },

  // ── 3. Dwie strony (5 lat po odblokowaniu frakcji) ─────────────────────
  // Używa condition (5 lat od _unlockedYear) zamiast null — chain z opóźnieniem
  // jest realizowany przez _checkNarrativeEvents tickujący co rok.
  {
    id: 'two_sides_emerge',
    once: true,
    condition: (gameYear, colony, factionSystem) =>
      factionSystem
      && !factionSystem.isLocked
      && factionSystem._unlockedYear != null
      && (gameYear - factionSystem._unlockedYear) >= 5,
    severity: 'warning',
    titlePL: 'Dwie strony',
    titleEN: 'Two Sides',
    descPL: 'Minęło pięć lat od odkrycia. Podział jest teraz wyraźny.\n\nCi którzy wierzą że tu jest ich dom — nazywają siebie Konfederatami Misji. Ci którzy wierzą że muszą wrócić — nazywają siebie Poszukiwaczami Drogi.\n\nTwój lider zajął stanowisko. Kolonia patrzy na ciebie.',
    descEN: 'Five years have passed since the discovery. The division is now clear.\n\nThose who believe this is their home call themselves the Confederation of the Mission. Those who believe they must return call themselves the Seekers of the Way.\n\nYour leader has taken a position. The colony watches you.',
    svgKey: 'alert',
    choice: false,
    sliderDelta: 0,
    onComplete: 'show_faction_assignment',  // GameScene pokazuje popup ze zmianą frakcji lidera
  },

  // ── 4. Pierwszy sabotaż (triggerowany gdy slider extreme: >75 lub <25) ─
  // FactionSystem._updateTension wyzwala raz po _sabotageTriggered=false
  {
    id: 'first_sabotage',
    once: true,
    condition: null,            // triggerowany przez FactionSystem._updateTension
    severity: 'danger',
    titlePL: 'Pierwszy sabotaż',
    titleEN: 'First Sabotage',
    descPL: 'Ktoś uszkodził reaktor w sektorze 7. Trzy osoby ranne. Sprawcy nieznani.\n\nTo pierwszy fizyczny akt przemocy między kolonistami od dnia lądowania. Wszyscy wiedzą kto za tym stoi — nikt nie ma dowodów.\n\nDotychczas był to spór filozoficzny. Teraz jest czymś więcej.',
    descEN: 'Someone damaged the reactor in sector 7. Three people injured. Perpetrators unknown.\n\nThis is the first physical act of violence between colonists since landing day. Everyone knows who is behind it — no one has proof.\n\nUntil now this was a philosophical dispute. Now it is something more.',
    svgKey: 'disaster',
    choice: true,
    optionA: {
      labelPL: 'Śledztwo — znajdź sprawców',
      labelEN: 'Investigation — find the perpetrators',
      sliderDelta: 0,
      effectDescPL: 'Napięcie -15, prosperity -5 przez 5 lat',
      effectDescEN: 'Tension -15, prosperity -5 for 5 years',
    },
    optionB: {
      labelPL: 'Amnestia — zapomnij i idź dalej',
      labelEN: 'Amnesty — forget and move on',
      sliderDelta: 0,
      effectDescPL: 'Napięcie -25 ale morale -10',
      effectDescEN: 'Tension -25 but morale -10',
    },
  },

  // ── 5. Groźba separacji (triggerowany gdy tension ≥86) ─────────────────
  // Zastępuje stary faction:crisis EventBus emit w _checkTensionThresholds
  {
    id: 'colony_separation_threat',
    once: false,                // może powtarzać się gdy kryzys znowu narasta
    condition: null,            // triggerowany przez FactionSystem._checkTensionThresholds
    severity: 'danger',
    titlePL: 'Groźba separacji',
    titleEN: 'Threat of Separation',
    descPL: 'Delegacja mniejszości złożyła formalny wniosek o założenie niezależnej kolonii w odległym układzie. Twierdzą że nie mogą żyć pod obecnym kierownictwem.\n\nTo nie jest już protest. To jest ultimatum.',
    descEN: 'The minority delegation has filed a formal request to found an independent colony in a distant system. They claim they cannot live under current leadership.\n\nThis is no longer a protest. This is an ultimatum.',
    svgKey: 'alert',
    choice: true,
    optionA: {
      labelPL: 'Pozwól im odejść',
      labelEN: 'Let them go',
      sliderDelta: 0,
      effectDescPL: 'Tracisz 20% populacji, napięcie spada do 30',
      effectDescEN: 'You lose 20% of population, tension drops to 30',
    },
    optionB: {
      labelPL: 'Negocjuj — daj im autonomię',
      labelEN: 'Negotiate — grant them autonomy',
      sliderDelta: 0,
      effectDescPL: 'Napięcie -30, prosperity -10 przez 10 lat',
      effectDescEN: 'Tension -30, prosperity -10 for 10 years',
    },
    optionC: {
      labelPL: 'Odmów — kolonia jest jedna',
      labelEN: 'Refuse — the colony is one',
      sliderDelta: 0,
      effectDescPL: 'Napięcie +20, ryzyko sabotażu rośnie drastycznie',
      effectDescEN: 'Tension +20, sabotage risk rises drastically',
    },
  },

];

// Mapa po id dla szybkiego lookupu (np. faction_crisis_protest)
export const NARRATIVE_EVENTS_BY_ID = NARRATIVE_EVENTS.reduce((acc, e) => {
  acc[e.id] = e;
  return acc;
}, {});
