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

  /**
   * DOKTRYNA: GARNIZON MACIERZYSTY (W1-5) — „to zostaje w domu".
   *
   * Okręty z nacisku L1/L2 lądują zadokowane przy stolicy i NIC ich nigdy nie rusza (V15).
   * Ta reguła nadaje im rolę: stoją jako garnizon. Przy braku zagrożenia NIE dostają rozkazu
   * ruchu — trzymanie pozycji to brak ruchu, nie rozkaz „stój".
   *
   * ⚠ BEZ `roll`, więc MUSI mieć `cooldown` (decyzja 11). Przepustnica „jeden rzut na rok
   * wyświetlany" siedzi WEWNĄTRZ `if (rule.roll)`, a `tickEmpire` biegnie co rok CYWILIZACYJNY
   * — reguła bez obu odpalałaby 12× na rok wyświetlany.
   */
  doctrine_defend_home: {
    id:       'doctrine_defend_home',
    trigger:  { kind: 'poll', probe: 'idleArmedVesselsAtCapital', gte: 1 },
    guard:    ['empireHasIdleWarships'],
    delay:    0,
    response: { action: 'assignDoctrine', params: { doctrine: 'defend_home', count: 2 } },
    cooldown: { years: 3.0 },
  },

  /**
   * DOKTRYNA: PATROL (W1-5) — „pilnujemy podejścia do własnego układu".
   *
   * ⚠ K-4: patrol jest WEWNĄTRZSYSTEMOWY, po ZEWNĘTRZNYCH orbitach WŁASNEGO układu AI —
   * czyli po stronie, z której nadlatuje gracz. Pierwotne „patrolowanie strefy granicznej"
   * w latach świetlnych jest NIEWYRAŻALNE dzisiejszą maszynerią (InfluenceMap mówi o układach
   * w LY, rozkazy MOS są w współrzędnych wewnątrz układu, mostka nie ma). Patrol
   * międzysystemowy czeka na model rozmieszczenia z W2.
   *
   * Próg wyższy niż garnizon: patrolujemy dopiero, gdy jest KIM (garnizon ma pierwszeństwo).
   */
  doctrine_patrol_border: {
    id:       'doctrine_patrol_border',
    trigger:  { kind: 'poll', probe: 'idleArmedVesselsAtCapital', gte: 3 },
    guard:    ['empireHasIdleWarships'],
    delay:    0,
    response: { action: 'assignDoctrine', params: { doctrine: 'patrol_border', count: 1 } },
    cooldown: { years: 4.0 },
  },

  /**
   * MOBILIZACJA REZERWY (W2-7) — „obsadzamy okręty, bo sami przestaliśmy być silniejsi".
   *
   * Po W2-2 każdy kadłub AI schodzi ze stoczni do REZERWY, a po W2-4 wyjście z niej kosztuje
   * POP i trwa miesiąc. Bez tej reguły floty obcych stałyby w magazynie do końca partii —
   * i tak było między W2-2 a tym commitem (świadomy stan przejściowy, opisany w §0b GATE 2).
   *
   * ⚠ ZERO AUTORSKICH PROGÓW (decyzja 22). Nie ma tu liczby „mobilizuj przy sile 0.8×", bo
   * nie umiemy jej dziś uzasadnić — strojenie należy do E7/BALANS. Decyzję niosą DWA warunki
   * bez stałych: jest KOGO obsadzić (`gte: 1` — obecność, nie próg) oraz gracz ma w SŁUŻBIE
   * więcej siły niż my (`empireOutgunnedByPlayer` — czyste porównanie). Parytet zatrzymuje
   * wyścig SAM, bo przestaje być prawdą — punkt równowagi jest własnością modelu, nie
   * wartością do wystrojenia.
   *
   * ⚠ `empireHasFreeCrew` — pierwszy konsument guardu zarejestrowanego w Slice 1 i do dziś
   * nieużywanego. Hamuje mobilizację w imperium, które nie ma ludzi do oddania. Zmierzone na
   * czystym boocie: z dwóch imperiów jedno trzyma 8-12 wolnych POP przez 400 lat cyw., drugie
   * siedzi na zerze przez lata 50-200 i odbija do 5 — guard realnie bramkuje mniej więcej
   * połowę czasu, więc NIE jest teatrem.
   *
   * ⚠ `delay: 0` — OBOWIĄZKOWO. `_firePending` biegnie POZA per-regułowym try/catch, a
   * `AlienCivSystem` woła `tickEmpire` poza własnym: odroczona odpowiedź, która rzuci, zabija
   * tik KAŻDEGO imperium ustawionego dalej w pętli. Jeden tik Directora to i tak jeden
   * wyświetlany miesiąc, więc `delay` nie miałby czym wyrazić „miesiąca mobilizacji" — ten
   * miesiąc odmierza `DEPLOY_DURATION_CIVYEARS` w `VesselManager`.
   *
   * Porcja `count: 2` (jak doktryny): mobilizacja podnosi `getStrength`, a to LICZNIK
   * `milRatio` — opróżnienie magazynu w jednym kroku potrafiłoby przeskoczyć próg wojny
   * w ciągu jednego roku cywilizacyjnego.
   */
  mobilize_reserve: {
    id:       'mobilize_reserve',
    trigger:  { kind: 'poll', probe: 'storedWarshipsAtCapital', gte: 1 },
    guard:    ['empireHasFreeCrew', 'empireOutgunnedByPlayer'],
    roll:     { startPct: 40, stepPct: 30, capPct: 100, unit: 'displayedYear' },
    delay:    0,
    response: { action: 'mobilizeVessels', params: { count: 2 } },
    // Agresywne imperia sięgają po ludzi chętniej; ostrożne dłużej trzymają ich przy pracy.
    personalityMod: { axis: 'aggression', at0: 0.6, at1: 1.4 },
    cooldown: { years: 3.0 },
  },

  /**
   * W3-5 — UDERZENIE NA CEL GRACZA. Pierwsza reguła, w której AI wybiera cel SAMO.
   *
   * Trigger to OBECNOŚĆ CELU W ZASIĘGU, nie siła: zasięg wyznacza powłoka graniczna
   * `InfluenceMap` (§Findings 27 — warstwa transportu dałaby AI skok przez pół galaktyki
   * za jeden bak oparów, więc granicę stawia reguła).
   *
   * Guardy w kolejności rosnącego kosztu: wojna (warunek wstępny, nie skutek — korekta C-4)
   * → posiadanie okrętu zdolnego do skoku. Dobór eskadry i odmowa „za mało okrętów"
   * mieszkają w akcji, bo zależą od TEGO celu (§Findings 34).
   *
   * ⚠ `saltGalaxySeed: true` — TA JEDNA reguła miesza ziarno galaktyki do klucza rzutu.
   * Bez tego każda partia dawałaby ten sam rok pierwszego uderzenia (dokładnie defekt
   * zsynchronizowanego pierwszego kontaktu). Sól jest opt-in, bo globalna zmiana `rollFires`
   * przesunęłaby losy WSZYSTKICH istniejących reguł — zmiana balansu przemycona w cudzym slice.
   *
   * ⚠ `delay: 0` OBOWIĄZKOWO — `_firePending` dereferencuje wpis, który `gameState.set(key, null)`
   * zostawia jako `null`, POZA oboma try/catch (pinowane katalogowo przez `w2_ai_mobilization` T4).
   *
   * Krzywa celowo WOLNIEJSZA niż mobilizacja (20 %, +15 pkt/rok wyświetlany): uderzenie
   * międzygwiezdne to najgłośniejsza rzecz, jaką AI robi graczowi, i ma być decyzją, nie tikiem.
   */
  strike_player_target: {
    id:       'strike_player_target',
    trigger:  { kind: 'poll', probe: 'reachablePlayerTargets', gte: 1 },
    guard:    ['empireAtWarWithPlayer', 'empireHasStrikeForce'],
    roll:     { startPct: 20, stepPct: 15, capPct: 100, unit: 'displayedYear', saltGalaxySeed: true },
    delay:    0,
    response: { action: 'launchStrike', params: { maxShips: 3 } },
    personalityMod: { axis: 'aggression', at0: 0.5, at1: 1.5 },
    cooldown: { years: 5.0 },
  },

  /**
   * Z2 — POWRÓT OKRĘTU DO DOMU. „Uderzenie się skończyło, wracamy na własną orbitę."
   *
   * Do tej reguły okręt AI po uderzeniu zostawał na orbicie planety GRACZA jako STAŁA BAZA
   * WYSUNIĘTA: bił co cooldown z dystansu 0 AU (ostrzeżenie 0,0 roku zamiast 5,1), trzymał
   * pulę hubu orbitalnego zerwaną i doliczał się do każdej kolejnej bitwy.
   *
   * ⚠ TO NIE JEST REGUŁA O TEMPIE. Zmierzone przed kodem (`AI_RECALL_PLAN.md` §2): wiążącym
   * ograniczeniem kadencji jest `cooldown` reguły UDERZENIA wyżej, a nie długość powrotu.
   * Ta reguła kupuje DOLOT (5,1 roku widocznego podejścia) i WOLNĄ ORBITĘ między uderzeniami.
   *
   * ⚠ BEZ `roll`, więc MUSI mieć `cooldown` (decyzja 11) — `tickEmpire` biegnie co rok
   * CYWILIZACYJNY, a przepustnica „jeden rzut na rok wyświetlany" siedzi WEWNĄTRZ `if (rule.roll)`.
   * Rzutu świadomie nie ma (D-Z2-3): rzut znaczyłby „okupacja utrzymuje się z jakimś
   * prawdopodobieństwem", czyli Z2 nie byłby zamknięty, tylko przerywany. `1.0` roku to
   * GRANULARNOŚĆ ZEGARA DECYZJI Directora, nie wymyślony próg balansowy.
   *
   * ⚠ BRAK GUARDU — także wojny (D-Z2-8). `war:peaceSigned` nie ma ani jednego konsumenta, więc
   * bez tego okupacja orbity gracza przeżywałaby pokój. Zamiatanie po pokoju wychodzi za darmo.
   *
   * ⚠ `delay: 0` OBOWIĄZKOWO — `_firePending` dereferencuje wpis, który `gameState.set(key, null)`
   * zostawia jako `null`, POZA oboma try/catch (pinowane katalogowo przez `w2_ai_mobilization` T4).
   *
   * `count: 3` to LUSTRO `MAX_STRIKE_SIZE` z `DirectorOffensive` — ściągamy tylu, ilu imperium
   * wysyła w jednym uderzeniu. Nie jest to nowy próg do strojenia.
   */
  recall_strike_force: {
    id:       'recall_strike_force',
    trigger:  { kind: 'poll', probe: 'strandedWarshipsAwayFromHome', gte: 1 },
    delay:    0,
    response: { action: 'recallVessels', params: { count: 3 } },
    cooldown: { years: 1.0 },
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
