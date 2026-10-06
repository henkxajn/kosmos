# OTWARTE FINDINGI — INDEKS PRZEKROJOWY

> **Stan na 2026-08-31** (po zamknięciu W3-32 + 186/187 + **86/87/190** + **188** + **130** + **GATE B2 / Z2**;
> otwarte z tych rund: **189**, **191**, **192**, **193**, **195**-**198**, **201**, **202**,
> **204**, **205**, **207**, **208**, **211**-**214**, **216**; **215** WDROŻONY, live-gate 2026-09-01;
> **ZAMKNIĘTE 2026-08-31**: **210**
> (slice TARGET_FALLTHROUGH, `1e633d4`, live-gate §8 PASS) oraz — w slice'ie
> DEFENSE_SCOPE (live-gate §7 PASS) — **199** (commity `792a034`/`b2e94ef`/`6e48460`),
> **200** i **209** (commit 1) oraz **203** i **206** (commit 3 — ROZPUSZCZONE przez wariant V4,
> nie naprawione) · **Save v101** ·
> Sweep: **193/193 OK, 0 FAIL, 24 advisory** (`run-all.mjs`).
>
> **Aktualizacja 2026-09-06 — arc VISUALS 1.0 (slice'y V0 + V1) ZAMKNIęTY.** Ma od dziś własny
> rejestr macierzysty `VISUALS_PLAN.md` i **WŁASNĄ PRZESTRZEŃ NAZW `V-`** — patrz ⚠ niżej,
> jego numery **kolidują** z 246-254 arca ekonomicznego. Sweep w tej rundzie: **211/211 OK, 0 FAIL,
> 28 advisory**.
>
> **Aktualizacja 2026-09-07 — slice V2 (Sun 2.0) ZAMKNIĘTY, arc VISUALS 1.0 bez otwartego frontu.**
> Przestrzeń `V-` rośnie do **V-270**. Zamknięte w V2: **V-260** (`033e794`), **V-265** (`b7c7360`),
> **V-266** (`1079cd9`). Nowe otwarte: **V-261**-**V-264** (Dyson wizualnie), **V-267**, **V-268**
> (głębia i wnętrze tarczy), **V-269**, **V-270**. Sweep: **212/212 OK, 0 FAIL**.
>
> **Aktualizacja 2026-09-17 — slice 275 ZAMKNIĘTY + read-only weryfikacja statusów (reguła W3-32).** Sweep: **229/229 OK, 0 FAIL**.
> • **275** ✅ (`2ddc115`, live-gate PASS §1-§5) — preempcja dwufazowa w `FleetSystem.issueFleetOrder`; NOWE z tego slice'u:
> **278** (podwójny wpis Stop `fleet:orderCompleted(cancelled)` + surowy slug `replaced/manual`, rodzina 271/113, pasażer 269) ·
> **279** (`dispatchDockTo` omija `FleetSystem` ⇒ stale `fleet.activeOrder`) · **280** (picker FCP engage celuje w NIEWYKRYTEGO wroga —
> asymetria producentów, semantyka detekcji, własny slice). Rejestr: `VESSEL_ORDERS_PLAN.md` §275-280.
> • **217** ✅ i **223** ✅ były ZAMKNIĘTE KODEM od 2026-09-01 (`c73ab33`+`ff614ba` / `8226dcc`), a ich kolumny statusu w rejestrze
> mówiły „🔴 OTWARTY" — flipnięte. ⚠ **227** jest od dziś WIĄŻĄCĄ blokadą obserwabla 223 (`launch_pad` poza `BUILD_PRIORITY` ⇒
> `tradingColonies` puste dla kolonii AI) — indeks go nie miał, dopisany w A8. **216** zostaje 🟠 z notatką pomiarową; **193** —
> korekta nazwy metody (`_passiveTick`, NIE `_tickPassiveListening`). Żywe potwierdzone w kodzie: **195**, **95**, **65**, **193**.
> • **Close-out 2026-09-17 (późny):** **270** ✅ (`0e940bc` + `444af73`: T11c CRLF-safe, **`.gitattributes` `text=auto eol=lf`**, cztery
> keepery zależne od checkoutu W DRUGĄ STRONĘ; **świeży checkout = 229/229 twardo**) · **269** 📋 A-MIN PODPISANY (picker ×5 + 278a ×2 +
> 3 statusy z 266 — wariant (i)/(ii) = DECYZJA WŁAŚCICIELA, implementacja w następnej sesji; `check-i18n` sink `textContent` + advisory) ·
> **klasa 113 ZMIERZONA**: 247 literałów z diakrytykami w 28 plikach (`src/ui`+GameScene+ThreeRenderer), ~163 widoczne dla gracza
> (ColonyOverlay 49, GameScene ~35) ⇒ osobny przyszły arc. Rejestr: `VESSEL_ORDERS_PLAN.md` §269/§270/§278.
>
> **Aktualizacja 2026-09-19 — slice 272 ZAMKNIĘTY; RODZINA 255 DOMKNIĘTA W CAŁOŚCI.** Sweep: **231/231 OK, 0 FAIL**.
> • **272** ✅ (`fc81fb8`, live-gate PASS §1-§3) — Powrót floty **per CZŁONEK** (opcja A właściciela): każdy do
> najbliższej WŁASNEJ kolonii w SWOIM układzie, członek bez celu **odmawiany GŁOŚNO** zamiast wysyłany w cudzą ramkę
> (cicha była ścieżka PRZYJĘTA, nie odrzucona — MOS goły punkt przyjmuje, 263 odmawia doku, statek dryfuje).
> ⚠ **D-272-1 = korekta podpisu PO POMIARZE**: sygnowany fallback „cel reprezentanta” jest ZBIOREM PUSTYM realnych
> celów ⇒ był tym samym defektem pod inną nazwą. NOWE z tego slice’u: **282** (etykieta „Skok warp” po PRZYLOCIE —
> ⚠ hipoteza „brak `mission = null`” **OBALONA źródłem**: misja jest po przylocie NOŚNA (`_redirectInterstellarVessel`
> jej wymaga), defekt siedzi w mapowaniu etykiety bez terminu `phase`; ⚠ powierzchnia zgłoszona jako „Outliner” tego
> napisu **nie produkuje**). Rejestr: `VESSEL_ORDERS_PLAN.md` §272/§282.
> • **RODZINA 255 (ramka układu w rozkazach floty) ZAMKNIĘTA W CAŁOŚCI**: **147** · **154** · **263** · **255**
> (leg D + wiersze 8/9) · **256** · **266** · **267** · **273** · **166 (ENGAGE)** · **268** · **275** · **270** ·
> **269** · **272**. Otwarte drobne z całego arca: **227**, **278b**, **279**, **280**, **281**, **282**.
> • ~~Dalej wg planu właściciela: pivot **D4-slim → W4-simple**~~ — ✅ **ARC ZAMKNIĘTY 2026-09-30** (W4-simple → DS-1 → DS-2 → DS-3; nota na końcu tego bloku). Zostają żywe 🔴 **195** / **95** /
> **65** / **193** + pomiar **216** jako przerywniki.
>
> **Aktualizacja 2026-09-29 — arc WOJNA I POKÓJ / W4-simple ZAMKNIĘTY (pokój terytorialny).** Sweep: **241/241 OK,
> 0 FAIL, 31 advisory** · `check-i18n` PASS (pl=en=**3402**) · save **v101 bez migracji** przez cały arc.
> • **Dowieziona pętla:** księga zdobyczy (`war.captures[]`) → term `territorial_terms` + **dwa pre-warunki**
> (stolica nigdy; sufit = połowa puli ODDAWALNEJ, D-WP-8) → wykonanie cesji z re-walidacją fail-closed
> + **wymuszony NAP** → stół pokoju i odznaka **Okupowana** → **depesza AI** (AI samo prosi o pokój)
> i **zero kary za odmowę** (cooldown 1 rok, symetryczny). ⚠ **Wypadkowa D-WP-14: auto-pokoju nie ma już
> po ŻADNEJ ze stron** — próg wyczerpania gracza to MELDUNEK, nie podpis w jego imieniu.
> Commity: `d08ded2` · `af7591b` · `34ad9b0` · `0afb02c` · `7c84a55`+`3920aa9` · `016dd46`+`de68900`+`6d957a1`
> · **WP-5**: `e617869` (C0) + `c858639` (C1) + docs. Plan/decyzje D-WP-1..17: `WOJNA_I_POKOJ_MASTER_PLAN.md`
> §„W4-simple — delivered"; sekcja arcu w `CLAUDE.md`.
> • **NOWE findingi z close-outu: #283-#298** (rejestr: `VESSEL_ORDERS_PLAN.md` §283-298).
> 🟠 **283** (`transferColony:942` dopisuje kolonię do imperium, nigdy nie odpisuje poprzedniemu — lustro
> `captureColonyForPlayer:992-993` odpisuje; uzbraja się przy **D5**) · 🟠 **284** (przejęcie przez gracza
> zostawia zadokowane statki AI w hangarze — `transferColony:867` je niszczy, `captureColonyForPlayer` nie
> ma ANI JEDNEGO odwołania do `vesselManager`; rodzina **95**) · 🟠 **285** (`_tryAdoptStation` bez triggera
> `colony:capturedByPlayer` — stacja-sierota nie wraca do matki po odbiciu ciała) · ⚪ **286**
> (`colony.fleet` po cesji trzyma id statków wypchniętych na orbitę, `DiplomacySystem:741-748`) ·
> 🟠 **287** („wojna bez wojny" — `createWar:179-180` zwraca ISTNIEJĄCY, także nieaktywny rekord przy
> kolizji `war_<a>_<b>_<rok>`, a `getWarBetween:155` filtruje po `active` ⇒ `getWarWith` = `null` przy
> „trwającej" wojnie) · ⚪ **288** (`DEV_FULL = 20` saturuje strefy wpływów; ⚠ liczba „devScore ≈ 195"
> jest ZE ZGŁOSZENIA, nie z pomiaru) · ⚪ **289** (`addFront:202-203` i `recordBattle:462/:478` czytają
> `war.fronts`/`war.battles` bez `?? []` — ta sama klasa, przed którą broni się `getCaptures:169`) ·
> ⚪ **290** (`war.fronts[]` i `CAPTURE_GRACE_YEARS` martwe — zero czytelników) · 🟠 **291** (rozejm
> bramkuje **0 z 4** dróg do wojny, wymuszony NAP **3 z 4**, przycisk gracza otwarty Z PROJEKTU;
> napięcie zamrożone na `TRUCE_TENSION_CAP = 30`, bo `_tickTensionDecay:1004` pomija pary spoza `'peace'`
> ⇒ **DS-1**, decyzja właściciela) · ⚪ **292** (`RECENT_REFUSAL_YEARS = 2` nie opisuje pokoju — ten ma
> per-czasownikowe okno 1 roku) · ⚪ **293** (tooltip planetarny — ⚠ **zgłoszenie NIE potwierdziło się
> w pierwszym pomiarze**: `ThreeRenderer:3373` renderuje okupację przez `t()`; wpis zostaje jako
> OBSERWACJA do pomiaru, nie defekt) · ⚪ **294** (dwa stringi „akcja gracza": `'player_war_panel'`
> w `WarOverlay:656` vs `'player_action'` w `DiplomacyOverlay:603/606`) · 🟠 **295** (⚠ **korekta
> zgłoszenia**: gałąź `namePL` NIE jest martwa — `EmpireRegistry:76-77` ustawia `name` I `namePL`;
> defekt jest gorszy i odwrotny: `nameEN` **nie jest czytane nigdy**, więc gracz EN widzi polską nazwę
> imperium w każdym wpisie dyplomatycznym Dziennika — klasa **113** w lustrzanym odbiciu) ·
> ⚪ **296** (`log.diplo.autoPeaceRefused` sierota po WP-4/C5) · ✅ **297 ZAMKNIĘTY** w C0 (`e617869`):
> `warOverlay.declareHint` obiecywało klawisz **(Y)**, którego nie ma — dyplomacja siedzi pod **(D)**.
> 🟠 **298** (**pokój status quo PIERZE ZDOBYCZE** — `recaptured` liczy WYŁĄCZNIE księgę BIEŻĄCEJ wojny,
> `AcceptanceEngine:604`; stolica gracza utracona w wojnie #1 jest w wojnie #2 zwykłym ciałem AI
> liczonym do sufitu — zmierzone na gate'cie: `dev 100` vs sufit **79,5** ⇒ nieodzyskiwalna przy stole.
> ⚠ **Decyzja właściciela ODŁOŻONA**: czy `recaptured` ma patrzeć w historię wojen pary; każdy wariant
> dotyka `territorial_ceiling`, czyli rdzenia D-WP-8 ⇒ slice z własnym gate'em, nie jednolinijkowiec).
> • ✅ **GATE PEŁNEJ PĘTLI PASS (2026-09-29)** na KOPII realnego zapisu („Liga Trzech Słońc", `emp_001`,
> `border_incident`, `peaceCost 30`), zero błędów w konsoli: wojna → desant AI na stolicę → księga
> `{entity_2 player→emp_001 via invasion}` → 🏴 → **staging 29/29 = 0 depesz, `changeExhaustion +2` =
> 1 depesza** → depesza status quo → ⇄ kontrpropozycja → **odmowa przy 29/31** z `recent_refusal` **0.0**
> (D-WP-4 na żywo: kara nie istnieje) + „ponowna propozycja za 1 l." → pokój status quo + NAP + rozejm 10
> (D-WP-13 na żywo) → druga wojna → **cesja wykonana** (`via: 'cession'`, właściciel = gracz, NAP + rozejm).
> ⚠ **`isHomePlanet` przeżywa pełną pętlę — NIE MA findingu**: zmierzone headless `true → false → true`
> (`transferColony` kasuje `ColonyManager:910`, cesja AI→gracz idzie przez `captureColonyForPlayer`
> `DiplomacySystem:721` i przywraca `ColonyManager:1013`, **bramkowane tożsamością** z
> `window.KOSMOS.homePlanet.id`; kontrola: przejęcie CUDZEJ kolonii zostawia `false` i dokładnie jeden dom)
> ⇒ odzyskana stolica **jest** chroniona przez `cessionHomeWorld` przy kolejnym stole.

> • ⚠ **Dwie reguły warsztatu z tej rundy:** `node --check` **w potoku z `head` zwraca exit `head`, nie
> `node`** — kontrolą jest URUCHOMIENIE keepera (zmierzone: plik przeszedł `--check`, a literał JS był
> rozcięty prawdziwym przełamem linii); **heredoc w tym harnessie zwija `\\` → `\`** i przy większym
> pliku rozjeżdża parsowanie ⇒ złożone pliki pisać `Write`em, skrypty łatające trzymać na JEDNYM
> poziomie escapingu.
> • **Otwarte po arcu:** **DS-1** (NAP `expiresYear` + ticker + beat; dwie decyzje właściciela z §291) ·
> **DS-2** (odnowienie traktatu + 4. rząd) · **DS-3** (`gift`) · **WP-R** (reparacje jako debuff produkcji
> wojennej: `reparationsUntilYear` + guard na istniejącej akcji `pressureResponse`,
> `DirectorRuleData:109/:137`). Poza 1.0: `threaten`, pełna okupacja, reparacje w kredytach, **D5**.

> **Aktualizacja 2026-09-29 (późna) — slice DS-1 ZAMKNIĘTY: pakt ma koniec, rozejm ma zęby.**
> Sweep: **244/244 OK, 0 FAIL, 31 advisory** · `check-i18n` PASS (pl=en=**3409**, +7 kluczy) ·
> save **v101 bez migracji** · bez flagi (rollback = `git revert`).
> • **Dowieziony kształt** — C0 `9cb1e4e` (rekord traktatu ma JEDEN kształt niezależnie od producenta;
> wymuszony NAP wnosił do zapisu SZEŚĆ pól zamiast dwóch, cztery martwe) → C1 `602500c` (**pakt wygasa**:
> `NAP_YEARS = 10` + ticker + beat, **D-WP-5**) → C2 `71e0d24` (**rozejm bramkuje `declareWar`** dla
> KAŻDEGO powodu, `canWar` = LUSTRO bramki; napięcie stygnie także w rozejmie, ale do
> `TRUCE_TENSION_FLOOR = 15`, **D-WP-7 / D-DS-1b / D-DS-2c**) → C3 `3b5039c` (panel mówi prawdę: nazwa
> przez `t()` zamiast sluga `non_aggression`, rok końca w slocie, licznik lat na wyszarzonym ⚔).
> ⚠ **Cała oszczędność slice'u: WYGAŚNIĘCIE = USUNIĘCIE REKORDU, NIE ZMIANA PREDYKATU.** `hasTreaty`
> pyta wyłącznie o `id`, więc KAŻDY konsument (8 bezpośrednich wywołań predykatu — 6 na fasadzie, 2 na modelu — + 7 przez `hasTradeAgreement`, w tym
> bramka wojny `declareWar:358` i bramka ultimatum `:1095`) jest poprawny bez jednej linii zmiany;
> predykat „ma traktat, ale przeterminowany" zrobiłby z każdego pominiętego konsumenta cichą dziurę
> w bramce wojny. Termin stempluje JEDEN pisarz (`RelationsModel.addTreaty:266`) i **warunkowo** —
> bezwarunkowy zrobiłby z handlu i sojuszu traktaty terminowe (balans, którego nikt nie podpisywał).
> **D-DS-3**: brak `expiresYear` w starym zapisie jest CZYTANY (`signedYear + NAP_YEARS`), nie dopisywany.
> • ✅ **291 ZAMKNIĘTY** (obie połówki, obie jako decyzja właściciela): przycisk gracza **zostaje otwarty
> POZA rozejmem** i jest zamknięty w nim; rozejm **odmraża** napięcie, ale do podłogi 15, nie do zera
> (pełny decay skasowałby 30 w pół roku wyświetlanego — siedem i pół roku PRZED końcem rozejmu).
> • **NOWE findingi z DS-1: #299-#305** (rejestr: `VESSEL_ORDERS_PLAN.md` §299-305), wszystkie ⚪.
> ⚪ **299** (`_tickTreatyExpiry:1055` woła `removeTreaty` z pominięciem `breakTreaty:807-808`, więc
> wygaśnięcie **nie sprząta sprzężonego modyfikatora opinii**; pominięcie kary +15 jest POPRAWNE —
> wygaśnięcie nie jest złamaniem umowy. Dziś nieszkodliwe i **zmierzone**: zbiory „traktat z modyfikatorem"
> `{trade_agreement}` i „traktat z terminem" `{non_aggression}` są rozłączne; uzbraja się przy pierwszym
> traktacie z terminem I modyfikatorem) · ⚪ **300** (nazwa traktatu ma **DWA źródła**: katalogowe
> `namePL`/`nameEN`/`descPL`/`descEN` = **12 napisów z zerem czytelników** obok żywego `t('treaty.*')`
> z C3 — ta sama chirurgia, którą D1 wykonało na `minTrust`/`accept`/`blocksWar`/`yearlyTrust` w TYM
> SAMYM pliku) · ⚪ **301** (**dwie nowe bramki wojny AI są NIEWIDOCZNE w audycie**: `declareWar` zwraca
> goły `false` w `:348`/`:358`, `diplomacy:warRefused` leci wyłącznie dla `player_action`, a ani ono, ani
> `diplomacy:treatyExpired` nie są w `DebugLog.TRACKED_EVENTS` — przy czym precedens stoi trzy linie
> niżej w tym samym pliku: brak śledzenia `invasion:blocked` kosztował **GATE 3 §2 jedną sesję**.
> Przyszły gate „czemu AI nie wypowiada wojny" czyta CISZĘ) · ⚪ **302** (ta sama `rel.truceYearsLeft` ma
> w JEDNYM panelu **dwa zaokrąglenia**: chip `:317` `toFixed(0)` vs przycisk `:561` `Math.ceil` — dla 9,4
> „ROZEJM — 9 lat" nad „⚔ ROZEJM — 10 L."; rozjazd przez połowę każdego roku. Odstający jest CHIP).
> • **Z listy właściciela, mechanizm zmierzony przy wpisywaniu:** ⚪ **303** (`WarOverlay:368` podaje
> `peaceCdYears` do `t()` **bez zaokrąglenia** ⇒ gracz widzi „☮ POKÓJ — ZA 0.8333 L.”; lekarstwo `Math.ceil`
> stoi już obok, na ⚔ z C3 — rodzina **302**, po obu wpisach są **trzy** liczniki lat i **dwie** formuły) ·
> ⚪ **304** (`tools/check-i18n.mjs:115` — `(?<![\w$.])t\s*\(` z **ASCII-only `\w`**: polska litera diakrytyczna
> nie blokuje lookbehinda, więc `kształt (` czyta się jako wywołanie `t(`. **Regex URUCHOMIONY**: `kształt (rekord)`
> i `kształt(x)` MATCH, a `komplet (` / `wart (` / `element(` / `format(` / `.at(` — nie. Złapane w C0, **obejściem
> było przeredagowanie tekstu**, nie poprawka narzędzia; to **czwarty** fałszywy pozytyw `T_CALL` po trzech z komentarzy.
> Lekarstwo `(?<![\p{L}\p{N}_$.])…/u` **sprawdzone wykonaniem**) · ⚪ **305** (**obecność floty unieważnia odwilż**:
> `TRESPASS_YEARS = 1.0` < `PEACE_QUIET_YEARS = 2.0`, więc jeden orbitujący zwiadowca odnawia wpis pamięci szybciej,
> niż okno ciszy zdąży się zamknąć ⇒ `_tickTensionDecay:1080` **nigdy** nie rusza. ZAPROJEKTOWANE, nie defekt kodu —
> ale kasuje w całości odwilż z C2, bezterminowo i **bez żadnego sygnału dla gracza**; balans incydentów, decyzja
> właściciela).
> ⚠ **#306 NIE POWSTAŁ:** zgłoszone „HUD nie odświeża roku przy ręcznym `gameTime`” to **istniejący 168** —
> `time:display` ma DOKŁADNIE JEDNEGO producenta (`TimeSystem.update:84`), bramkowanego na `:70` przez
> `isPaused || multiplier === 0`; `0aacf8c` zasiał `EventLogSystem._currentYear` i HUD-u nie ruszył (z projektu).
> Zamiast duplikatu — odwołanie w protokole gate'ów czasowych (pkt 3).
> • ⚠ **Reguła warsztatu z tej rundy:** **pin na liczbie eksportów WSPÓLNEGO pliku ma mieć DOKŁADNIE
> JEDNEGO właściciela** — przeniesienie jednej stałej (`TRUCE_TENSION_CAP` → `OpinionModifierData`)
> zapaliło TRZY keepery z trzech różnych slice'ów, bo każdy pinował „ile eksportów ma ten plik" jako
> kontrolę własnego. Taki pin mierzy tempo rozwoju CUDZEGO pliku i uczy czytać czerwień jako szum.
> ⚠ **Druga:** **re-aim keepera na NOWY eksport importuje go NAMESPACE'OWO, z `?? null`** — statyczny import
> symbolu, który dopiero powstaje w tym commicie, wywala CAŁY plik keepera na linkowaniu ESM, więc
> w fail-first **żaden pin nie dostaje koloru**, także zielone kontrole (złapał worktree w C1, re-aim
> `wp_peace_seams` na `treatyExpiryYear`). Lekcja „pin musi DEGRADOWAĆ, nie PRZERYWAĆ” na poziomie MODUŁU.
> • **Otwarte po DS-1:** **DS-2** (odnowienie paktu + przycisk; `diplomacy:treatyExpired` emitowane
> z pełnym ładunkiem i **czeka** — jedyny konsument to beat Dziennika `UIManager:1732`) · **DS-3**
> (`gift`; term `offer` jest w silniku KOMPLETNY — `AcceptanceEngine:143`, `OFFER_HALF_KR = 500`, wagi
> 10-25 per archetyp, `counterHintFor` już liczy lukę w kredytach — **nikt go nie karmi**, bo żadne UI
> nie wkłada `offer` do propozycji; kanał kredytów `spendFromTreasury` też już istnieje) · **WP-R** ·
> **298** (decyzja właściciela nadal odłożona).
>
> **Aktualizacja 2026-09-30 — DS-2 + DS-3 ZAMKNIĘTE; ARC „D4-slim → W4-simple" ZAMKNIĘTY W CAŁOŚCI.**
> ➕ **Po WP-R (nota niżej) cały rozdział Wojna i Pokój ma JEDNĄ otwartą pozycję: #298.**
> Sweep: **246/246 OK, 0 FAIL, 31 advisory** · `check-i18n` PASS pl = en **3417** · save **v101 bez migracji**.
> • **DS-2** ✅ (`02de4a5` C1 + `8821f93` C2) — **pakt da się ODNOWIĆ w oknie 3 lat przed końcem**
> (`NAP_RENEW_WINDOW_YEARS`), a slot PAKT ma TRZY etykiety: „ODNÓW PAKT" (aktywny) / „PAKT — ODNÓW ZA {0} L."
> (poza oknem) / „PAKT — ODMÓWILI, ZA {0} L." (świeża odmowa). ⚠ Okno **3 jest WYPROWADZONE**, nie wybrane:
> `RECENT_REFUSAL_YEARS = 2`, więc okno ≤ 2 znaczyłoby, że PIERWSZA odmowa zjada całe okno. `signedYear`
> NIETKNIĘTY; odnowienie idzie przez MODEL, nie `signTreaty`, więc producentów traktatu zostaje DWA.
> • **DS-3** ✅ (`acc7547`) — **dar dołączony do propozycji** (D-DS-7 kształt B, D-DS-8, D-DS-9). ⚠ Kształt
> **wymuszony POMIAREM**: kara `recent_refusal` waży 25, a `offer` **nasyca się na +20**, więc po stemplu
> dar był bezsilny przy **każdej** kwocie (zmierzone: MILION Kr → score −5 przy progu 10), a modal odmowy
> otwiera się PO stemplu ⇒ **dar uchyla świeżą odmowę, na jedną ocenę**; odmowa osłodzonej propozycji
> stempluje normalnie (jedna PŁATNA próba). ⚠ Nasycenie +20 jest GRANICĄ PROJEKTU: `opinion` waży 40, więc
> imperium, które nas naprawdę nienawidzi, **nie jest do kupienia**.
> • ✅ **306 ZAMKNIĘTY** (`counterHint` produkowany od E1 i nigdy nieczytany — modal daru jest jego pierwszym
> konsumentem). ⚠ **SPROSTOWANIE NUMERACJI:** wpis §299-305 mówi „Nie ma #306" — to prawda o INNYM
> kandydacie (HUD/rok = duplikat 168, numeru nie dostał). Numer #306 przydzielił findingowi `counterHint`
> blok przekazania DS-2 i w tym kształcie wszedł do commita `acc7547`; zostaje przy `counterHint`.
> • **NOWY finding: ⚪ 307** — beaty traktatowe (`napRenewed`, `giftSent`) idą **tylko** do Dziennika, choć
> rodzina dyplomatyczna jest rozjechana na pół: **cztery** zdarzenia mają toast (`aiEnvoy` — jawnie jako
> „BUG6 — widoczny toast", `peaceSigned`, `peaceRejected`, `envoyRefused`), **sześć** nie. Brakuje REGUŁY,
> które zdarzenie zasługuje na toast; kandydat opisany w rejestrze, NIEPODPISANY.
> • ⚠ **Reguła warsztatu z tej rundy, najdroższa z trzech ostatnich: ŚWIADEK W KAŻDYM PINIE, KTÓRY MOŻE BYĆ
> PRAWDZIWY BEZ MIERZONEJ FUNKCJI.** Zmierzone fail-firstem **trzy razy pod rząd**: 13/41 → **5/49** (C1) ·
> 68/20 → **63/25** (C2) · 25/38 → **19/44** (DS-3). ⇒ kontrola pinu musi być zielona po OBU stronach;
> **pin, który na bazie PADA, nie jest kontrolą i nie wolno go tak etykietować** (w C2 trzy takie były).
> • ⚠ **Druga:** `TRACKED_EVENTS` **nie jest eksportowane** z `DebugLog.js` — audyt czyta się przez
> `KOSMOS.debugLog.query({kind})`. Złapała to walidacja jednolinijkowców gate'u na żywym silniku, PO tym jak
> mój własny wrapper zamaskował błąd, nie awaitując wyniku: **wrapper walidacji też wymaga kontroli.**
> • **Otwarte po tym arcu:** **WP-R** (reparacje — tam dar przestaje być jednorazowy i dziedziczy regułę
> kolejności D-DS-8) · **298** (pokój status quo pierze zdobycze) · **301** (`warRefused`/`treatyExpired`
> nadal poza `TRACKED_EVENTS` — DS-2/C1 zamknął tylko połowę sąsiednią; zmierzone: `query` zwraca **0**) ·
> **307**. Rejestr: `VESSEL_ORDERS_PLAN.md` §306-307; plan: `WOJNA_I_POKOJ_MASTER_PLAN.md` §„DS-2 / DS-3 — delivered".
> • ⚠ **OBSERWACJA BEZ NUMERU (do rozstrzygnięcia właściciela, czy zasługuje na #308):** live-gate zgłosił
> „panel to **D**, nie Y" — i po pomiarze jest to **gorsze, niż brzmi**. `OverlayManager._keyMap:24` ma
> `'d': 'diplomacy'` i klawisza `'y'` w tej mapie NIE MA, ale `GameScene:4752` (`case 'KeyY'`)
> **TOGGLUJE TRYB TAKTYCZNY** przy `FEATURES.tacticalMode = true` (default ON) i `civMode`. Stara instrukcja
> „klawisz Y" nie jest więc bezczynna — **przestawia graczowi kamerę**. Zasięg: `CLAUDE.md:3181` (poprawione
> w tym commicie) + `src/ui/DiplomacyOverlay.js:1` (komentarz w KODZIE, świadomie nietknięty — inny temat
> commita). ⚠ To ta sama rodzina co **ZAMKNIĘTY #297** (`warOverlay.declareHint` obiecywał (Y)); tamto
> zamknięcie naprawiło **napis dla gracza**, nie komentarze. ⚠ Przy okazji: komentarz keepera
> `wp_peace_cooldown_smoke:417` twierdzi, że „`y` NIE JEST ZWIĄZANE Z NICZYM" — prawda o mapie OVERLAYÓW,
> nieprawda o grze.
>
> **Aktualizacja 2026-09-30 (późna) — WP-R ZAMKNIĘTE; ROZDZIAŁ WOJNA I POKÓJ: otwarte tylko #298.**
> Sweep: **247/247 OK, 0 FAIL, 31 advisory** · `check-i18n` PASS pl = en **3424** · save **v101 bez migracji**.
> • **WP-R** ✅ (`61e3abc` C1 silnik + `87d692d` C2 stół/chip/beaty, live-gate PASS) — **reparacje jako
> BLOKADA PRODUKCJI WOJENNEJ AI**, druga połowa podpisu D-WP-1(c). Kredyty odrzucone jako fikcja
> („AI płaci" — AI nie ma powtarzalnego dochodu ani jednej bramki kredytowej).
> ⚠ **BLOKADA ZAMYKA DWIE DROGI, i to jest sedno D-WPR-1** (zmierzone w fazie A): produkcja
> (`pressureResponse` → `queueWarships` → `startShipBuild` — JEDYNA produkcyjna ścieżka okrętu AI
> w normalnej grze) **oraz** mobilizacja rezerwy (`mobilize_reserve`, guard `empireOutgunnedByPlayer`,
> czyli odpala dokładnie po wygranej gracza). Zamknięcie samej produkcji znaczyłoby „nie wolno wam
> budować, ale wolno uzbroić wszystko, co macie".
> ⚠ **WAGA 25 WYPROWADZONA**, nie wybrana: tło `offer_peace` 10,00 / 21,00 / 48,50 przy exh 30/50/100,
> przewrót `u = (w−10)/(55+0,5w)` ⇒ **exh ≈ 52** (ponad `peaceCost` 30), a przy exh 100 **+32** zapasu —
> rozbite AI nie może blokować KOŃCA WOJNY o ten warunek. Skala: dojrzała kolonia = −3,89 pkt ⇒ 25 ≈
> sześć kolonii.
> ⚠ **Jedyny realny defekt fazy A:** `_buildTermsContext` zwracał `null` przy braku cesji, czyniąc pokój
> „status quo + blokada zbrojeń" NIEWIDZIALNYM dla silnika — a to najprawdopodobniejszy ruch gracza.
> • **NOWY finding: ⚪ 308** — przełącznik jest BINARNY, a silnik od pierwszego dnia umie gałkę lat
> (`raw ∝ years / REPARATIONS_YEARS`); brakuje wyłącznie widżetu, a gałka ma cenę PROJEKTOWĄ (1 rok
> kosztowałby −2,5 pkt, mniej niż jedna kolonia) ⇒ po 1.0. Rejestr: `VESSEL_ORDERS_PLAN.md` §308.
> • ⚠ **SPROSTOWANIE, KTÓRE NIE DOSTAŁO NUMERU:** planowałem #309 „`directorMobilization` nie jest na
> `window.KOSMOS`" — **nieprawda**, `GameScene` wystawia WSZYSTKIE SIEDEM systemów Directora
> (:460-464, :471, :476-477). Mój grep miał `| head -5`, a odpowiedź stała na szóstej pozycji. Błąd
> wszedł do raportu i do **wiadomości commita `87d692d`**; docs go poprawiają. Reguła warsztatu:
> **grep ucięty przez `head` NIE JEST POMIAREM** — zwraca wynik, więc czyta się jak odpowiedź (ta sama
> rodzina co pin celujący w martwą ścieżkę).
> • ⚠ **Dwa WYMUSZONE re-aimy, których audyt fazy A nie przewidział** (raport, nie łata — oba piny
> miały RACJĘ): `acceptance_engine` pinuje etykietę KAŻDEGO termu w pl I en (⇒ 1 z 7 par i18n musiała
> wejść w C1, podział 1 + 6), a `wp_peace_cooldown` T1g to anti-drift anchor wag `offer_peace`, gdzie
> `drift` był PUSTY, a padł LICZNIK KLUCZY. Trzeci kandydat (`balans_diplomacy_telemetry`) czysty.
> • ⚠ **Trzecie w jednym slice'ie wystąpienie: NOWY SYMBOL WOŁANY WPROST ZABIJA CAŁY PRZEBIEG**
> (`getReparationsUntilYear`, guard, `_onHit(undefined)`) — za każdym razem fail-first pokazywał crash
> zamiast kolorów, także dla ZIELONYCH kontroli. Plus: **skrypt łatający = PLIK i zawsze
> `open(p,'wb')`** (tryb tekstowy na Windows zamienił CAŁY keeper LF→CRLF), oraz **przyrząd gate'u nie
> może pisać zegara na podstawie fallbacku** (`?? 0` ustawiło `gameTime` na 0,2 po naturalnym
> wygaśnięciu reparacji).
> • **STAN ROZDZIAŁU WOJNA I POKÓJ:** W4-simple → DS-1 → DS-2 → DS-3 → **WP-R** zamknięte. Otwarte
> **wyłącznie #298** (pokój status quo pierze zdobycze — decyzja właściciela, każdy wariant dotyka
> `territorial_ceiling`, czyli rdzenia D-WP-8). Drobne poza rozdziałem: **307** (toasty dla całej
> rodziny traktatowej), **308**.
>
> **Aktualizacja 2026-10-02 — AI GARRISON G1 ZAMKNIĘTY: walka naziemna się rozstrzyga.**
> Sweep: **248/248 OK, 0 FAIL, 31 advisory** · `check-i18n` PASS pl = en **3424** · save **v101 bez migracji**.
> • **65** ✅ (`f5e30e5` D5b — wspólny `DEFAULT_MORALE`; `85411d0` D5a — martwy wyjątek garnizonu;
> `f868ae8` D5c — próg odwrotu 20 → 5). Bramka live właściciela PASS. Rejestr macierzysty 65:
> `AI_CAPTURE_PLAN.md` §65; plan, decyzje D1–D7 i nowe findingi: **`AI_GARRISON_PLAN.md`**.
> • **NOWE: #309–#325** (rejestr: `AI_GARRISON_PLAN.md` §6) — 🔴 **317** (lądowanie i podbój w czasie
> POKOJU) · 🟠 **309**, **310** (→ G1b), **311**, **318**, **319**, **321**, **323** · ⚪ **312-316**,
> **320**, **322**, **324**, **325**.
> • **Korekty:** **49** zamknięty po stronie DANYCH (`transport_assault` od `0e6ea0d`, nikt go nie
> zamawia ⇒ reszta = **201**) · **50** zaniżony (znikały OBIE strony) i **zastąpiony przez D7**
> (archetypy wszędzie, krok G2b).
>
> **Aktualizacja 2026-10-02 (późna) — AI GARRISON G1b ZAMKNIĘTY: ogień jednoczesny, POP jednostek wracają do domu.**
> Sweep: **250/250 OK, 0 FAIL, 31 advisory** · `check-i18n` PASS pl = en **3426** · save **v101 bez migracji**.
> • ✅ **309** (`c0a3d5c`) · **310** (`a42ec93`) · **312** (`03688f0`) · **326** (`c7c5a74`; numer nadany przy
> podpisie zakresu) — zamknięcia w rejestrze macierzystym `AI_GARRISON_PLAN.md` §6; wiersze 309/310/312 zdjęte
> z A5. Bramka live właściciela PASS (`AI_GARRISON_PLAN.md` §5c).
> • **NOWE: #327–#335** (rejestr: `AI_GARRISON_PLAN.md` §6) — 🟠 **328**, **329**, **330**, **333**, **335** ·
> ⚪ **327**, **331**, **334**; **332** ✅ zamknięty w commicie dokumentacji G1b (tabela zdarzeń `groundUnit:*`
> w `CLAUDE.md` poprawiona do stanu z grepa).
> ⚠ **333 to defekt z rekoncyliacji A0:** nieoddana część POP po śmierci jednostki z `rate < 1` zostaje
> zablokowana NA ZAWSZE i dalej liczy się do populacji (zmierzone: +0,3 po 27 miesiącach, zero wywołań
> usuwających ludzi). **Nienaprawiony — do decyzji właściciela.** Wiersz A9 „niezweryfikowane” (AI-vs-AI)
> dostał numer **331**: mechanizm potwierdzony w kodzie, osiągalność dalej niezmierzona.
>
> **Aktualizacja 2026-10-02 (wieczór) — AI GARRISON: G2-0 i G2-1 ZROBIONE, decyzje D8–D18, krok G1c.**
> Sweep: **252/252 OK, 0 FAIL, 31 advisory** · `check-i18n` PASS pl = en **3426** · save **v101 bez migracji**.
> • ✅ **G2-0** (`4d6ac63`, `g2_seams_smoke` 26/26 — piny szwów, które kolejne kroki zmienią świadomie) · ✅ **G2-1**
> (`82c9196`, `GroundUnitManager.createAIUnit`, `g2_create_ai_unit_smoke` 26/26). Decyzje **D8–D18** (podpis
> 2026-10-02): `AI_GARRISON_PLAN.md` §1; faza A G2 (audyt i pomiar na `2a97bfe`, raport poza repo): §5e.
> • **NOWE: #336–#342** (rejestr: `AI_GARRISON_PLAN.md` §6) — 🔴 **336** (stolica AI na oceanie — kolonii nie da
> się przejąć z ziemi), **337** (łazik przejmuje kolonię AI w pokoju) · 🟠 **338** („Wyładuj” bez kapsuł, dominacji
> i wojny), **339** (przejęcia nie pytają o wojnę; żaden keeper przejęcia nie ustawia wojny) · ⚪ **340**
> (`INVASION_UNIT_POOLS` bez kluczy żywych archetypów), **341** (uprząż vs fixture: 2,2–3,1× mniej POP AI),
> **342** (`homeColonyId: null` wraca z zapisu jako id ciała).
> • **323** rozszerzony o zmierzony skutek (jednostka z samym `{ owner }` → `offline` → rozwiązana), bez nowego
> numeru. Podwójne potrącenie utrzymania jednostek naziemnych to istniejący wpis backlogu
> (`KOSMOS_backlog_niezrealizowane.md` §„🔴 Podwójne pobranie Kr za jednostki naziemne”), nie nowy finding.
> • **Krok G1c** (rodzina „utrata POP”: **333**, **330**, **328**, **329**; kierunek 333/330 podpisany 2026-10-02)
> stoi w kolejce **po G3**: G2-K1 → G2-2 → G2-3 → G2-4 → G2b → G3 → **G1c** (`AI_GARRISON_PLAN.md` §3).
>
> **Aktualizacja 2026-10-03 — AI GARRISON: G2-K1 ZROBIONY (commity 2026-10-02; stolice na oceanie + bliźniak AI).**
> Sweep: **253/253 OK, 0 FAIL, 31 advisory** · `check-i18n` PASS pl = en **3426** · save **v101 bez migracji**.
> • ✅ **336** (`8ea5af3` + `44967a3`) — zamknięcie w rejestrze macierzystym `AI_GARRISON_PLAN.md` §6; wiersz zdjęty z A6.
> • **NOWE: #343–#347** (rejestr: `AI_GARRISON_PLAN.md` §6) — 🟠 **343** (zwykłe budynki AI na oceanie — martwy test
> `tile.buildable`, 46 z 476 na 14 ziarnach; osobny, późniejszy slice), **344** (desant AI na krawędzi bez drogi do
> stolicy), **347** (`HexGrid.getNeighbors` asymetryczne — plik krytyczny) · ⚪ **345** (uśpiony nadpis typów kafli
> z `_biome.png`), **346** (stolice AI na (−1,2), także na lodzie — obserwacja).
> • Odpowiedzi właściciela z sesji G2-K1 (bliźniak AI w G2-K1, slice dla 343, próg D9 10–24 = `garrison_unit`,
> rejestracja 344): `AI_GARRISON_PLAN.md` §5h.
>
> **Aktualizacja 2026-10-03 (późna) — AI GARRISON: G2-2 ZAMKNIĘTY (bramka wojny D13 + D13a).**
> Sweep: **254/254 OK, 0 FAIL, 31 advisory** · `check-i18n` PASS pl = en **3428** · save **v101 bez migracji**.
> • ✅ **317** · **337** · **338** · **339** (`6391b23` keepery: wojna w setupie · `48c94dd` bramka wojny · `dbfbbd6` D13a)
> — zamknięcia w rejestrze macierzystym `AI_GARRISON_PLAN.md` §6; wiersze zdjęte z A8. Bramka live właściciela PASS
> (`AI_GARRISON_PLAN.md` §5j). **D13a** (2026-10-03): jedyną drogą wojsk na ciało innego imperium są kapsuły
> desantowe — „Wyładuj” z ładowni nigdy, także w wojnie (`cargoUnloadRefusal`, `WarGate.js`).
> • **NOWE: #348–#357** (rejestr: `AI_GARRISON_PLAN.md` §6) — 🟠 **348** (okupacja i walka trwają w pokoju → G2-4/D14),
> **349** („Wyładuj” bez terenu; nad ciałem bez kolonii celem jest dom), **353** (zabranie wojsk z cudzego ciała: sukces
> w UI, jednostki na ziemi — **blokuje D14**, audyt G2-4), **354** (płatnik utrzymania = kolonia CIAŁA: kolonia AI płaci
> za jednostkę gracza albo jej brak ją rozwiązuje — rodzina **329**) · ⚪ **350** (surowe slugi odmów zrzutu), **351**
> (ciche odmowy away team), **352** (`force_invasion` — odmowa tylko w konsoli), **355** (opóźnienie mapy w trybie
> zrzutu; **345** wykluczony w kodzie), **356** („undefined” w oknie ładowni), **357** („Player Empire” w dymku ciała
> wroga + populacja bez mgły wojny).
> • ⚠ **Otwarte pytanie do właściciela:** przepięcie pinu `g2_war_gate_smoke` **W9d** wyszło poza pre-approval D13a
> (obejmował tylko W2) — `AI_GARRISON_PLAN.md` §5k.
>
> **Aktualizacja 2026-10-03 (wieczór) — AI GARRISON: G2-3a ZROBIONY (planer garnizonu) + rewizja drabiny D9.**
> Sweep: **255/255 OK, 0 FAIL, 31 advisory** · `check-i18n` PASS pl = en **3428** · save **v101 bez migracji**.
> • ✅ **G2-3a** (`053fcc0`) — planer garnizonu: czyste funkcje nad jedną tabelą danych (`src/data/GarrisonData.js`),
> odczyt `KOSMOS.debug.garrisonPlan()`; niczego nie tworzy (mobilizacja = **G2-3b**). Keeper `g2_planner_smoke` 77/77.
> • **D9 po rewizji** (2026-10-03): poniżej 6 → morale 30 · 6–13 → 50 · 14–19 → 100 + co trzecia jednostka CIAŁA
> `rocket_artillery` · 20 i więcej → jw. × 1,25 — bo suma fabryk zatrzymuje się na 20 (fixture 20 i 20 przy gy 60,
> uprząż najwyżej 24 przy gy 100). Plan fixture'u GATE-S4: limit 13, stolica 7 (w tym 2× artyleria), po jednej
> jednostce na sześciu innych ciałach — `AI_GARRISON_PLAN.md` §5l.
> • Odpowiedzi właściciela (a)–(g) — `AI_GARRISON_PLAN.md` §5m; **otwarte pytanie W9d zamknięte** (przepięcie zostaje).
> • Bez nowych findingów.
>
> **Aktualizacja 2026-10-03 (noc) — AI GARRISON: G2-3b ZAMKNIĘTY (mobilizacja garnizonów AI + usuwanie jednostek AI
> + stempel kafli).** Sweep: **256/256 OK, 0 FAIL, 31 advisory** · `check-i18n` PASS pl = en **3428** · save **v101 bez migracji**.
> • ✅ **318** (`2437725`) · **319** dla jednostek imperiów AI (`24beea4`; jednostki gracza → **358**) · **324** w zakresie D6
> (`6fc2c8d`) — zamknięcia w rejestrze macierzystym `AI_GARRISON_PLAN.md` §6; wiersze zdjęte z A6/A8. Mobilizacja (D15):
> `6fc2c8d`. Bramka live właściciela PASS (`AI_GARRISON_PLAN.md` §5o).
> • **NOWE: #358–#362** (rejestr: `AI_GARRISON_PLAN.md` §6) — 🟠 **358** (los jednostki gracza na ciele zniszczonym albo
> oddanym AI → G2-4: R3/R7), **359** (licznik okupacji biegnie przy żywym wrogu → G2-4: R2) · ⚪ **360** (imperium bez pełnej
> kolonii mobilizuje się dopiero przy następnej wojnie albo wczytaniu → G3: uzgadnianie co rok), **361** (martwe pole
> `rocket_artillery.terrainModifiers`), **362** (kopia przedimportowa nie mieści się przy dużym zapisie — tylko
> `console.warn`; pomiar: uprząż 0,97 mln znaków przy gy 60–100, fixture GATE-S4 2,09 mln; limit ok. 5,24 mln znaków na
> wszystkie klucze).
> • Rozszerzone bez nowego numeru: **345** / **355** (widoczny `GET 404` na `_biome.png` przy każdym otwarciu mapy kolonii).
> • **Zakres G2-4 (R1–R7) podpisany 2026-10-03** — `AI_GARRISON_PLAN.md` §5p; **354** wchodzi do G2-4 w zakresie płatnika
> jednostki gracza (R6), reszta rodziny **329** zostaje w G1c.
>
> **Aktualizacja 2026-10-04 — AI GARRISON: G2-4 ZAMKNIĘTY (wycofanie po pokoju, R1–R7).** Sweep: **257/257 OK, 0 FAIL,
> 31 advisory** · `check-i18n` PASS pl = en **3440** · save **v101 bez migracji**.
> • ✅ **348** · **359** (`cd1fc46`, R1/R2) · **358** (`1a41c62` + `39c9227`, R3/R7) · **353** · **354** dla jednostek gracza
> (`8c82cf7`, R6) — zamknięcia w rejestrze macierzystym `AI_GARRISON_PLAN.md` §6; wiersze zdjęte z A5/A6. Commity:
> `edd6fd1` · `cd1fc46` · `1a41c62` · `8c82cf7` · `39c9227` · `1fefcdc` (§5q). Bramka live właściciela 2026-10-04:
> **silnik PASS, trzy wady widoku** (§5r) — brak meldunku o utracie wojsk w terminie, „Unknown empire” we wpisach
> wycofania obok nazwy imperium we wpisie pokoju, „duch” jednostki na otwartej mapie kolonii.
> • **NOWE: #363–#367** (rejestr: `AI_GARRISON_PLAN.md` §6) — 🟠 **363** (pokój nie cofa okupacji kafli; nowa wojna daje
> przejęcie kolonii AI bez wojsk), **364** (ostrzał z orbity bez bramki wojny) · ⚪ **365** (łazik usunięty w terminie
> albo z ciałem zostawia `awayTeamUnitId`), **366** (stare zapisy: jednostki gracza w pokoju na cudzym ciele bez flagi),
> **367** (R4 i R7 bez wpisu w Dzienniku).
> • Odpowiedzi właściciela po G2-4 (§5s): **363** → F1, **364** → F2, **366** → F3, **367** → F4; wady z bramki → F5–F7;
> **365** bez decyzji.
>
> **Aktualizacja 2026-10-04 (wieczór) — AI GARRISON: follow-upy G2-4 (F1–F7) ZAMKNIĘTE + poprawki po bramce; G2
> ZAMKNIĘTE.** Sweep: **259/259 OK, 0 FAIL, 31 advisory** · `check-i18n` PASS pl = en **3448** · save **v101 bez migracji**.
> • ✅ **363** (`39e2df6`, F1) · **364** (`4c60e5b`, F2) · **366** (`86a6d2a`, F3) · **367** (`30bc68c`, F4) · **365**
> (`96c636f`, poprawka (g)) — zamknięcia w rejestrze macierzystym `AI_GARRISON_PLAN.md` §6; wiersze zdjęte z A5/A9.
> F5–F7: `f8f9cdb` · `8785b41` · `f90bc14` (§5t). Bramka live właściciela follow-upów 2026-10-04 **PASS** (§5u).
> • **NOWE: #368–#378** (rejestr: `AI_GARRISON_PLAN.md` §6) — ✅ zamknięte od razu poprawkami po bramce: **368**
> (`5fefe33`, (d)), **369** (`8427b0a`, (e)), **371** (`cafd6e8`, (b)), **376** (`2c9511f`, (f)) · 🟠 **370** (ostrzeżenie
> „został miesiąc” nie gaśnie — poprawka (a) gotowa jako łatka, **wstrzymana**: zaczerwienia trzy istniejące asercje;
> decyzja właściciela, §5v) · ⚪ **372** (trzy reguły nazwy imperium), **374** (martwy `FleetTabPanel`), **375** (polskie
> literały w `ColonyOverlay`/`CargoLoadModal`), **377** (polska gramatyka „z {0}” w trzech innych wpisach) — etap polerki UI ·
> **373** (akcje silnika bez bramki `in_cargo`) — później · **378** (zapisy z martwym `awayTeamUnitId`; obejście „Zbierz”).
> • Pozostałe kroki arca: **G3** · **G1c** · **G2b** (`AI_GARRISON_PLAN.md` §3).
>
> **Aktualizacja 2026-10-05 — AI GARRISON: G3 ZAMKNIĘTY (odrastanie strat, uzgadnianie mobilizacji co rok, widoczność
> garnizonu, wpis o mobilizacji).** Sweep: **260/260 OK, 0 FAIL, 31 advisory** · `check-i18n` PASS pl = en **3455** ·
> save **v101 bez migracji**.
> • ✅ **360** (`47b1b96`, G3-2 — uzgadnianie mobilizacji na granicy roku gry) — zamknięcie w rejestrze macierzystym
> `AI_GARRISON_PLAN.md` §6; wiersz zdjęty z A8. Commity G3: `47b1b96` · `b3fe807` · `92d1b8e` (§5x). Bramka live
> właściciela 2026-10-05 **PASS** (§5y); G3-2 nie był ćwiczony na żywo (keeper R7).
> • **370** — poprawka (a) **po terminie** (`8cd8d7c`, odpowiedź właściciela 2026-10-05): powrót wojny gasi „został
> miesiąc” zawsze, także po terminie; meldunek o utracie zostaje (§5z). ⚠ Wiersze **370** i **378** zdjęte z A9 dopiero
> teraz — oba zamknięto 2026-10-04 (`dcc4c6f`, `5c49b36`), a commit dokumentacji `2e845cf` tego indeksu nie dotknął.
> • **NOWY: #379** (rejestr: `AI_GARRISON_PLAN.md` §6) — 🟠 mapa kolonii obcego ciała rysuje wrogie jednostki naziemne
> bez względu na wywiad (karta ciała mówi „nieznany”, mapa pokazuje garnizon) → follow-up **(h)** z osobną bramką
> w przeglądarce.
> • **375** rozszerzony bez nowego numeru o `DropTroopsModal` (polskie literały także w EN).
> • Pozostałe kroki arca: **G1c** → **G2b** (`AI_GARRISON_PLAN.md` §3).
>
> **Aktualizacja 2026-10-06 — AI GARRISON: G1c ZAMKNIĘTY (rodzina „utrata POP”) + follow-up (h) (379) + follow-upy 380/381.**
> Sweep: **262/262 OK, 0 FAIL, 31 advisory** · `check-i18n` PASS pl = en **3455** · save **v101 bez migracji**.
> • ✅ **379** (`ad0a615`, follow-up (h)) · **333** (`b1eac7a`) · **330** (`0fbbd59`) · **328** (`4a4f909`) · **329** (`732507d`) ·
> **327** (`4d625a9`) · zmiana R7 (`790f3b7`) — zamknięcia w rejestrze macierzystym `AI_GARRISON_PLAN.md` §6; wiersze zdjęte
> z A5/A6/A8. Bramka live właściciela 2026-10-06 **PASS** (`AI_GARRISON_PLAN.md` §5zb).
> • **NOWE: #380–#383** (rejestr: `AI_GARRISON_PLAN.md` §6) — ✅ **380** (`b926d81`, Q2: przejęcie kolonii zrywa więzi POP
> jednostek poprzedniego właściciela) · ✅ **381** (`1c90ea4`, Q5: przejęcie anuluje kolejkę rekrutacji) · ⚪ **382** (karta
> ciała liczy ukryte jednostki — uśpiony) · 🟠 **383** (mapa obcej kolonii: panel kafla — budynek z danymi albo menu budowy —
> bez względu na wywiad; decyzja właściciela).
> • Pozostały krok arca: **G2b** (`AI_GARRISON_PLAN.md` §3).
>
> **Aktualizacja 2026-10-06 (wieczór) — AI GARRISON: G2b ZAMKNIĘTY (desant AI na archetypach); ARC AI GARRISON ZAMKNIĘTY.**
> Sweep: **263/263 OK, 0 FAIL, 31 advisory** · `check-i18n` PASS pl = en **3455** · save **v101 bez migracji**.
> • ✅ **323** (`f027e7c`, S2 — ostatnia ścieżka AI przez `createAIUnit`) · ✅ **340** (`980043f` + `23a87e5`, S1 + S3 — pula
> desantu usunięta) — zamknięcia w rejestrze macierzystym `AI_GARRISON_PLAN.md` §6; wiersze zdjęte z A8. **50** — D7
> wdrożone (wiersz A8 zaktualizowany; rejestr macierzysty `W3_PLAN.md` §50 nietknięty). Bramka live właściciela 2026-10-06
> **PASS** (`AI_GARRISON_PLAN.md` §5ze).
> • **NOWE: #384–#390** (rejestr: `AI_GARRISON_PLAN.md` §6) — 🟠 **384** (desant z ładowni AI duplikuje ładunek — uśpiony,
> uzbraja się z desantem z ładowni) · ⚪ **385** (bramki mobilności AI czytają tabelę legacy) · **386** (`SpawnTestEnemy`
> omija `createAIUnit` — debug) · **387** (jednostki legacy AI ze starych zapisów nie do zabicia — pomiar) · **388** (T6c
> `g2_ocean_capital_smoke` zależny od `Math.random`) · **389** (ułamkowy `troopCount`: ⌈n⌉ → ⌊n⌋) · **390** (nieaktualne
> teksty o puli w dwóch keeperach).
> • **383** — kierunek właściciela: reguła widoczności **379**, etap polerki UI.
> • Poza arciem: limit floty, odbicie kolonii, przyczółek — następny arc (faza A — audyt, poza repo).
>
> **Aktualizacja 2026-10-06 (noc) — NOWY ARC AI STRIKES BACK: plan, audyt fazy A, decyzje SB1–SB12.**
> Plan + rejestr macierzysty: `AI_STRIKES_BACK_PLAN.md` (§6); audyt fazy A (na `8b72c47`): `AI_STRIKES_BACK_AUDIT.md`.
> • **NOWE: #391–#396** (rejestr: `AI_STRIKES_BACK_PLAN.md` §6) — 🔴 **391** (`deployVessel` odmawia kadłubowi AI,
> także kurierowi, gdy zalega flota GRACZA) · 🟠 **392** (guard `empireHasFreeCrew` martwy dla AI) · 🟠 **393** (rezerwa
> AI odbiera graczowi dominację orbitalną) · 🟠 **394** (zadokowany kadłub AI odbiera dominację, a walki z nim nie ma;
> UI każe „wygrać bitwę”) · ⚪ **395** (adnotacja `directorOrigin` na złym kadłubie) · 🟠 **396** (desant z bitwy liczy
> pojemność, nie ładunek — rodzina 384). **391–394** → slice **S0**.
> • ✅ **50** — zamknięty w rejestrze macierzystym `W3_PLAN.md` §50 (decyzja SB12: D7 wdrożone w G2b); wiersz zdjęty z A8.
>
> **Aktualizacja 2026-10-06 (noc, później) — AI STRIKES BACK: S0 ZAMKNIĘTY (bramka live PASS).**
> Commity `9c73023` (S0-1) · `e73c890` (S0-2 + przecelowanie R1/R2) · `cf2a598` (S0-3a+b + przecelowanie R3/R4) ·
> `eb6c06e` (poprawki tekstowe). Rejestr: `AI_STRIKES_BACK_PLAN.md` §6; zapis bramki §5a, wynik §5b; decyzje **SB13–SB19**
> (zakres S1) w §2.
> • ✅ **391** · **392** · **393** · **394** — zamknięte; wiersze zdjęte z A8. **395**, **396** bez zmian.
> • **NOWE: #397–#406** — ✅ **397** · **399** · **402** (poprawki tekstowe, `eb6c06e`) · ⚪ **398** (odczyt „wolna
> załoga” → S1, SB19) · ⚪ **400** (guard `empireHasFreeCrew` bez konsumenta) · ⚪ **401** (księga abstrakcyjna odbiera
> dominację) · ⚪ **403** (`getPlanetOrbitalController` bez konsumenta) · ⚪ **404** (dwa polskie literały ostrzału) ·
> ⚪ **405** (flash `drop.noDominance` w praktyce niewidoczny) · 🟠 **406** (tryb zrzutu zrzuca po utracie dominacji).
> • Następny: **S1** (pula, limit floty, tabela strojenia; SB1–SB3, SB9, SB13–SB19).


---

## ⚠ CZYM TEN PLIK JEST, A CZYM NIE JEST — czytaj przed dopisaniem czegokolwiek

**To jest INDEKS, nie rejestr.** Repo ma już regułę zapisaną i kupioną doświadczeniem:
**żadnego siódmego rejestru — finding zamyka się w SWOIM rejestrze macierzystym**
(memory `close-findings-in-their-own-registry`).

Z tego wynikają trzy zasady użycia:

1. **Zamknięcie findingu wpisuje się w rejestrze macierzystym** (mapa numeracji niżej),
   a tutaj **najwyżej** zdejmuje się wiersz. Nigdy odwrotnie.
2. **Nowy finding NIE powstaje tutaj.** Powstaje w rejestrze slice'u, który go znalazł.
3. **Ten plik wolno wyrzucić w całości** bez utraty informacji. Jeśli kiedykolwiek przestanie
   to być prawdą — stał się siódmym rejestrem i trzeba go rozebrać.

**Po co więc istnieje:** numeracja 1-177 jest ciągła przez **sześć** dokumentów, więc pytanie
„co jest dziś otwarte" wymagało przeczytania sześciu plików i trzech osobnych przestrzeni nazw.
Ten plik odpowiada na nie w jednym miejscu — i **grupuje findingi po MECHANIZMIE**, żeby dało się
planować slice'y, a nie tylko je liczyć.

---

## ⚠ DEFEKT SAMEJ NUMERACJI — do rozstrzygnięcia, NIEZASTOSOWANY

**Numery 165 i 166 są użyte DWA RAZY, w tym samym pliku (`VESSEL_ORDERS_PLAN.md`), tego samego dnia.**
Trzy audyty domykały się równolegle i każdy wziął „następny wolny numer".

| nr | wpis **A** (wcześniejszy w pliku) | wpis **B** (tabela audytu Dziennika) |
|---|---|---|
| **165** | obrona orbitalna nie ma PRZEBIEGU (audyt 157) | tekst Dziennika renderowany przy emisji i persystowany |
| **166** | `_handleFleetEngage` — lista wrogów wg kamery (audyt 138/142) | `EnemyAttackHandler` ×4 — polskie literały |

**Rekomendacja (NIE zastosowana — czeka na decyzję właściciela):** wpisy **A zostają** (są starsze
w pliku i mają już odnośniki z `BATTLE_RESULT_CLASSIFICATION_AUDIT.md` oraz
`SYSTEM_SCOPE_138_142_AUDIT.md`), wpisy **B dostają 178 i 179**. Wpis 166B jest już **zamknięty**
(`ffc72fb`), więc przenumerowanie go jest czysto porządkowe; 165B jest **zaparkowany**, więc też nic
nie blokuje.
⚠ Do czasu decyzji w tym pliku obowiązuje zapis **165a/165b** i **166a/166b**.

### 🔴 NAWRÓT TEJ SAMEJ KLASY — 2026-09-06, tym razem MIĘDZY RÓWNOLEGŁYMI SESJAMI

**Numery 246-254 są użyte dwa razy**: arc **VISUALS** (V0/V1) i arc **EKONOMIA AI** brali
„następny wolny numer” **jednocześnie, z dwóch sesji**. Różnica wobec 165/166 jest istotna:
tamta kolizja siedziała w JEDNYM pliku, ta **jest już w HISTORII COMMITÓW** —
`git log --oneline` pokazuje `fix(visuals): Finding 246` i `feat(246): E3H` obok siebie, a to
**dwa różne defekty**. Pełna tabela kolizji: `VISUALS_PLAN.md` §Kolizja numeracji.

✅ **ROZSTRZYGNIĘTE 2026-09-06 (PODPISANE):** **nie przenumerowujemy** — arc VISUALS dostaje
prefiks **`V-`** (wzorem **W2 1-14**, już dziś osobnej przestrzeni). Obowiązuje w całym repo:

> **numer goły z zakresu 246-254 = arc EKONOMIA AI · `V-<nr>` = arc VISUALS**

Wariant zastosowany do 165/166 (nowe numery dla wpisów B) **tutaj nie działa**: numery są w treści
commitów, których nie przepisujemy, więc renumeracja dodałaby TRZECIĄ wersję prawdy zamiast
usunąć dwuznaczność. Prefiks jest jedyną zmianą, która działa **wstecz**.
⚠ **Commity VISUALS sprzed decyzji nie zostały przepisane** (piszą „Finding 246/247/250/251”) —
prefiks rozstrzyga **odczyt**, nie zapis historyczny.
⚠ **Wzorzec do naśladowania przy 165/166**, które **dalej czekają na decyzję**: tam kolizja nie
weszła do historii commitów, więc renumeracja jest wciąż wykonalna — to **nie jest** ten sam
przypadek i nie rozstrzyga się go automatycznie tą decyzją.

---

## Mapa numeracji — gdzie mieszka który zakres

| zakres | rejestr macierzysty |
|---|---|
| **1-16** | `W3_PLAN.md` §Findings filed (not fixed in W3) |
| **17-51** | `W3_PLAN.md` §Added at GATE 1/2/3 |
| **52-68** | `AI_CAPTURE_PLAN.md` §Findings filed |
| **69-80** | `docs/audit/COLONY_OWNERSHIP_GATE_AUDIT.md` |
| **81-114 · 126-128 · 159-160** | `COLONY_OWNERSHIP_GUARD_PLAN.md` |
| **115-129** | `UNIFIED_VESSEL_ORDERS_AUDIT.md` §7 |
| **130-158 · 161-185** | `VESSEL_ORDERS_PLAN.md` §7 + §Findings z live-gate'ów |
| **309-390** | `AI_GARRISON_PLAN.md` §6 Rejestr findingów arca (2026-10-02–06; 326-335 z sesji G1b; 336-342 z fazy A G2 i z G2-1; 343-347 z sesji G2-K1; 348-357 z sesji i bramki live G2-2; 358-362 z sesji i bramki G2-3b; 363-367 z sesji G2-4; 368-378 z sesji zamykającej G2-4; 379 z sesji G3; 380-383 z sesji zamykającej G3 i bramki G1c; 384-390 z sesji G2b) |
| **391-406** | `AI_STRIKES_BACK_PLAN.md` §6 Rejestr findingów arca (2026-10-06; 391-396 kandydaci K1–K6 audytu fazy A, `AI_STRIKES_BACK_AUDIT.md`; 397-404 kandydaci notatki przekazania S0; 405-406 obserwacje z bramki S0) |
| **W2 1-14** | `W2_PLAN.md` §Findings filed — ⚠ **OSOBNA przestrzeń nazw**, to NIE te same numery |
| **V-246 … V-275** | `VISUALS_PLAN.md` §Rejestr findingów arca — ⚠ **OSOBNA przestrzeń nazw**, 🔴 **koliduje** z 246-254 wyżej |
| bez numeru | `KOSMOS_backlog_niezrealizowane.md` · `VO3B_PLAN.md` §9 (GATE B2) |

---

## Granica dowodu tego indeksu

**Zweryfikowane W ŹRÓDLE przy tworzeniu pliku** (2026-08-27): `86` · `87` · `90` · `123` (reszta) ·
`W3-1` (**ZAMKNIĘTY** — bramka `isInService` stoi dziś w `MovementOrderSystem:240`, powód
`vessel_in_reserve`, obejmuje wszystkie typy rozkazów) · `W3-2` (**POTWIERDZONY jako otwarty** —
filtr rezerwy jest **tylko** w `_wreckPlayerVesselsInSystem:376`, `_resolveBatchedBattle:76` go nie ma) ·
`W3-7` · `W3-8` · `W3-10` · `124` (**ZAMKNIĘTY** — cztery kłamstwa o doku usunięte przy naprawie 125).

**Przepisane z rejestrów BEZ ponownego pomiaru:** cała reszta. W szczególności **72 · 73 · 84 · 85 ·
91 · 92 · 93 · 94** są po arcu D1-D6 prawdopodobnie latentne albo zdegradowane do higieny, ale
**nie sprawdzałem ich po kolei** — przed planowaniem czegokolwiek z tej grupy trzeba je przemierzyć.

**Niezweryfikowane w przeglądarce:** slice 138+142 ma **live-gate PENDING** (kod wszedł, sweep czysty).

**Zamknięte 2026-08-27** (zdjęte z tego indeksu): 108 · 109 · 110 · 119 · 124 · 137 · 138 · 139 · 140 ·
142 · 150 · 155 · 157 · 160 · 166b-176 · 177 · W3-1 · W2-9.
**Zamknięte 2026-08-29 (runda 2):** **190** (pętla pauzy — domknięta dopiero za DRUGIM podejściem, pierwsza diagnoza obalona pomiarem — ZGŁOSZONA PRZEZ WŁAŚCICIELA w live-gate 86/87 i naprawiona w TYM SAMYM commicie, bo inaczej 87 dowoziłby regresję rozgrywki razem z funkcją) · **86** (termin tożsamości w `BuildingSystem`, G12 zielone bez dotknięcia) · **87** — ⚠ **SPROSTOWANY**: opisany mechanizm NIE ISTNIAŁ (`ColonyManager` nie ma akcesora `colonies`, `git log -S` pusty), skutek był ODWROTNY (brak alarmu o własnej koloni poza macierzystą), a treść wpisu okazała się opisem **pułapki w naprawie**. Trzy kopie martwej gałęzi naprawione razem.

**Zamknięte 2026-08-29:** **W3-32** — ⚠ okazał się zamknięty już **2026-08-18** (`61bdffe`),
czyli DZIEWIĘĆ DNI przed powstaniem tego pliku; wiersz był przepisany bez pomiaru i stał tu jako
pozycja nr 1 rekomendacji. Przy okazji audytu wyszła i została zamknięta jego **stanowa reszta** —
**186** (żywy od pierwszej tury: mgła nad układami AI przebita OR-em nad lustrem `sysData.explored`;
darmowy spis ciał w tierze 3 bez obserwatorium + wejście w widok 3D cudzego układu) i **187**
(ten sam mechanizm na ścieżce przylotu, latentny). Rejestr macierzysty obu: `VESSEL_ORDERS_PLAN.md`
§Findings z audytu W3-32; kanon `src/utils/SystemExploration.js`, keeper
`system_exploration_canon_smoke` 21/21.
⚠ **Wniosek dla tego pliku, nie dla tamtych findingów:** przed planowaniem czegokolwiek z listy
„przepisane bez ponownego pomiaru" **uruchom keeper i `git log -S`**. Jedno wywołanie odjęło cały
slice z kolejki.
**Przeklasyfikowane:** 159 (utajony za flagą) · 165b (zaparkowany).

---

# A · REJESTR PRZEKROJOWY — OTWARTE

Legenda: 🔴 defekt żywy i dotkliwy · 🟠 realny, ograniczony · ⚪ obserwacja/higiena ·
⬜ świadomie zaparkowany lub utajony.

## A1 — Zakres układu („globalne id ≠ położenie"), reszta po 138/142

| # | | opis | uwaga |
|---|---|---|---|
| **151** | 🟠 | `ProximitySystem:187` ma własną koercję `?? 'sys_home'`, która połyka `null` = tranzyt warp | bramkuje **detekcję i intel**, nie tylko walkę |
| **152** | 🟠 | POI **nie ma pola `systemId` w ogóle** | naprawa = nowe pole + **migracja zapisu** |
| **153** | 🟠 | `EmpireLogisticsSystem:240-242` dobiera outposty bez terminu układu, kurier bez warpu | **osiągalność NIEZMIERZONA** |
| **154** | 🟠 | `AutoRetreatSystem._findNearestFriendlyPlanet` dalej bez terminu układu | **ŻYWA** przez trzy przyciski „Powrót do bazy" (`FMO:4581`, `FleetGroupPanel:445`, `FleetCommandPanel:384`) |
| **166a** | 🟠 | `FMO._handleFleetEngage:4534` — lista wrogów wg KAMERY, poziom floty | **ODCZYT, nie pomiar** (D-SS6) |
| **123** | 🟠 | reszta po naprawie: `_calcDistAU` = surowy hypot na dwóch ramkach karmi `reachable` | dwie z trzech ścieżek zamknięte |

## A2 — Prawdomówność rozkazów (slice **ORDER_TRUTHFULNESS**, §7a — uzasadniony i oszacowany)

| # | | opis |
|---|---|---|
| **141** | 🟠 | **30 z 41** powodów odmowy bez klucza i18n; **6 z 15** producentów połyka odmowę całkowicie. Silnik mówi — UI połyka |
| **145** | 🔴 | `OrderService.issueReturn:206` połyka `false` i zwraca `{ok:true}` — **fasada kłamie o sukcesie**, a sama odmowa jest fałszywa (`exploration` bez `returnYear` → NaN → „brak paliwa" statkowi z 27 AU zasięgu) |
| **127** | ⚪ | `vessel:orderIssued` ma ZERO subskrybentów, a tabela w `CLAUDE.md` deklaruje dwóch |

## A3 — VESSEL_ORDERS: to, co zamyka PODPISANY plan (VO-4 = P3 · VO-5 = P5 · VO-6/7 = P4)

| # | | opis | trafia do |
|---|---|---|---|
| **120** | 🟠 | statek w locie ma **jedną** akcję; menu to zaszyty automat na `position.state` | P3 |
| **121** | 🟠 | `moveToPoint` bezpowrotnie gasi panel obcego układu (rekon, kolonizacja, rozładunek, powrót) | P4 |
| **128** | ⚪ | `survey.canExecute` dopuszcza `orbiting`, menu pokazuje wyłącznie w kubełku `docked` | P3 |
| **129** | ⚪ | `arriveAtTarget(a, b)` — drugi argument nie istnieje w sygnaturze | P4 |
| **132** | 🟠 | `drop_troops` bierze cel z `position.dockedAt` bez guardu na `null` | VO-4 (R-8) |
| **133** | 🟠 | `_suspendMissionIfAny` snapshotuje tylko przy `in_transit` — orbitujący kolonizator z `engage` traci misję bez śladu | residuum P1 |
| **134** | ⚪ | `foreign_recon` zaszyty w 3 miejscach poza `VesselManager`/`FMO` (w tym predykat końca gry) | inwentarz P4 |
| **136** | ⚪ | `ExpeditionPanel:453` — latentny (zero importerów) | P4 |
| **144** | 🟠 | `exploration/orbiting_body` **nie ma żadnego samodomknięcia** — statek zajęty na zawsze (zmierzone: 200 lat gry) | **znika z konstrukcji** w P4 |
| **146** | 🔴 | leg powrotny bez rekordu w `MissionSystem` **nigdy się nie kończy**; po ośmiu „Powrotach" dystans do domu **rośnie** | **znika z konstrukcji** w P4 |
| **147** | 🟠 | rozkaz ruchu **kasuje misję statku w skoku warp** — MOS nie ma bramki na `warp_transit` | `OrderService` albo P4 |

## A4 — Pula logistyczna

| # | | opis |
|---|---|---|
| **148** | 🟠 | rozkaz ruchu zostawia zlecenie przypisane: `_driveVessel` bramkuje na `docked`, a rozkaz kończy w `orbiting` ⇒ statek stoi **przy koloni docelowej z ładunkiem** i nie rozładowuje (93 lata, 0 dostarczone) |
| **149** | ⚪ | `removeFromPool` nie zwalnia przydziału — zlecenie dalej wypisuje statek wyjęty z puli |

## A5 — Walka: narracja, rekordy, przebieg, czas

| # | | opis |
|---|---|---|
| ~~130~~ | ✅ | **ZAMKNIĘTY 2026-08-31** — migawka/wznowienie misji uogólnione na OBIE strony (`_pauseSideForCombat` / `_resolveMissionsPostBattle`, flaga `m4EnemyCombatMissionPause`). ⚠ To nie był brak mechanizmu, tylko **asymetria**: gracz miał go od `046976d`. ⚠ Z2 NIE był tym zamknięty — **domknął go osobny slice „AI wraca po ataku" 2026-08-31** (`AI_RECALL_PLAN.md`): zamiatacz `DirectorRecall` + composite `recall` w `OrderService` + termin układu macierzystego w puli uderzeniowej. `EnemyAttackHandler:245` **nadal** parkuje (świadoma granica, pin `ai_strike_recall_smoke` T8) — okno parkowania skrócone do ≤ 1 roku wyświetlanego. `docs/design/AI_COMBAT_MISSION_PLAN.md` |
| **156** | 🟠 | jedna bitwa DSCS-w-wojnie zostawia **DWA rekordy** w `gameState.battles` o niepowiązanych id — i duplikat **idzie do zapisu** |
| **158** | 🟠 | `BattleIntroModal` — zaszyty polski + nagłówki „AGRESOR/OBROŃCA" postawione na indeksach uczestników (to nie są role wojny) |
| **161** | 🟠 | baner bitwy **odpauzowuje ręcznie zapauzowaną grę** — czyta `timeSystem.paused`, a pole nazywa się `isPaused` ⇒ `wasPaused` zawsze `false` |
| **162** | 🟠 | potyczka bez wojny daje **dwie linie Dziennika**, jedna zaszyta po polsku (EAH pisze własny wpis obok kanonicznego `log.battleLine`) |
| **163** | 🟠 | `showBattleOutcome` — drugi blok zaszytego polskiego w tym samym pliku; **najczęściej oglądane okno walki w grze** (także po pominięciu kina) |
| **164** | 🟠 | przełącznik auto-slow **nie ma producenta** — `time:autoSlowToggle` zero nadawców, pole nieserializowane ⇒ gracz **nie może** tego wyłączyć; resztki w `time:display` i `BottomBar` |
| **165a** | 🟠 | obrona orbitalna **nie ma PRZEBIEGU** — jedno `resolveBattle`, brak `vessel:engaged`, brak rund ⇒ walka o stolicę jest wyłącznie wynikiem po fakcie |
| **W3-26** | 🟠 | `playerVesselsToBattleUnit([])` fabrykuje obrońcę `{hp:100, weapons:[]}`; fantom pinowany jako zachowanie silnika, kandydat do balansu |
| **311** | 🟠 | `SupplyCoverageSystem.js:162` zapisuje legacy jednostce gracza `supply = 0` przez `?? 0` ⇒ zero obrażeń + atrycja (klasa 65, inne pole) |
| **313** | ⚪ | `_tryRetreat` zostawia `_path`, zawsze ucieka w +q, wchodzi na obcy kafel — rozszerza **56** |
| **314** | ⚪ | martwe człony `_scoreTarget` `'scout'`/`'ranged'` (`CombatSystem.js:361`, `:364`) — instancje noszą lustro legacy |
| **315** | ⚪ | `GroundUnitManager.attackUnit` martwa (zero wołających); komentarze `GroundUnitFactory.js:10`, `:139` mówią inaczej |
| **316** | ⚪ | `ColonyOverlay.js:2706` — `NaN` morale dla jednostki z `supply`, bez `morale` (wąska ścieżka) |
| **335** | 🟠 | rozbita jednostka AI schodzi na sąsiedni heks i wraca w kółko (`_tryRetreat` +10 morale, `CombatSystem.js:449`; pościg AI `GroundUnitManager.js:997`) — rok pata na bramce G1b; rozszerza **313** |
| **347** | 🟠 | `HexGrid.getNeighbors` **nie jest symetryczne** (zawijanie per rząd, `HexGrid.js:123-145`): 64 z 956 / 82 z 1760 par bez pary zwrotnej — A*, ucieczka i rozstawienie po pierścieniach dziedziczą kierunkowość; plik krytyczny, naprawa wymaga planu. `AI_GARRISON_PLAN.md` §6 |
| **373** | ⚪ | akcje silnika bez bramki `'in_cargo'` — `GroundUnitManager.deploy` (`:548`), `packUp` (`:570`), `startSurvey` (`:420`), `startAnalysis` (`:438`); `moveUnit` ma ją od F7 (`f90bc14`); z UI nieosiągalne po przycinaniu zaznaczenia (F7) — później. `AI_GARRISON_PLAN.md` §6 |

## A6 — Własność / kolonia: reszta po arcu BRAMKA WŁASNOŚCI

| # | | opis | uwaga |
|---|---|---|---|
| **95** | 🔴 | statek ze stoczni orbitalnej na koloni WTÓRNEJ po utracie stolicy wychodzi jako **obcy kontakt** i nie trafia na listę rozmieszczenia | OBSERWOWANE, **niezbadane** |
| **96** | ⚠ | czy utrata głównej koloni osierocą stację **drugiej** koloni (`transferColony` nie emituje `colony:destroyed`) | niepotwierdzone |
| **F6** | 🟠 | **brak płatnika = flota DARMOWA** — `_resolvePayHomeId` → `null`, `_tickVesselMaintenance` robi `continue` | pin w `fleet_upkeep_payer_smoke`; wymaga **trzeciego szczebla drabiny** |
| **90** | ⚪ | `isTestEnemy` nadal nieserializowane ⇒ `undefined` po każdym wczytaniu | ✔ zweryfikowane |
| **83** | ⚪ | `destroyEmpire:230-238` nie odpina kolonii ⇒ kolonia skasowanego imperium wraca z wczytania jako kolonia GRACZA | dziś debug/sandbox |
| **88 · 89** | ⚪ | dwie migracje kluczują się na `isHomePlanet` i przyznają realne korzyści · **cztery** ścieżki `game:over` kluczują się ENCJĄ, nie flagą | ograniczenie na przyszłość |
| **112** | 🟠 | ekran „CIVILIZATION DESTROYED" **nie ma pojęcia zawijania** — pięć gołych `fillText` w ramce o zaszytych `DW=420, DH=180`; nowy powód ma 100 zn. wobec 49 | helper `_wrapText:2800` istnieje **w tej samej klasie** |
| **113** | 🟠 | ten sam ekran ma **zaszyty polski** (`Czas przetrwania…`, `NOWA GRA`) | wpis SAMODZIELNY wobec 112 (inna przyczyna) |
| **114** | ⚪ | `debugLog.query` pusty przy działającym ekranie — mechanizm sprawny, przyczyna środowiskowa | wartością wpisu jest **reguła**: `debugLog` nie przeżywa restartu sceny |
| **126** | 🟠 | trzy flashe budowy po polsku (`ColonyOverlay:171-173`) | w baseline Findingu 177 |
| **127o** | ⬜ | backlog: lazy-init loadera w `PlanetTextureUtils:16` odblokowałby `ColonyOverlay` pod node | **największa luka testowa repo** |
| **128o** | 🟠 | cztery wejścia nawigacyjne wołają `switchActiveColony` wprost — bezpieczne **przez odmowę**, ale żadne nie oferuje **stanu neutralnego** | stąd UX z GATE OG-3 §3 |
| **72 · 73 · 84 · 85 · 91 · 92 · 93 · 94** | ⚪ | filed przy audycie własności; po D1-D6 prawdopodobnie **latentne albo higiena** | ⚠ **nie weryfikowane po kolei** |
| **357** | ⚪ | dymek ciała na mapie 3D: „Player Empire” przy KAŻDEJ kolonii, także wroga, i jej populacja bez mgły wojny (`TooltipContent.js:147-155`, od `670d027`) | naprawa przez kanon `SystemReveal` (**188**), nie jednolinijkowiec |

## A7 — Kolonizacja (98-107, BEZ decyzji o zakresie)

| # | opis |
|---|---|
| **98** | kolonia statku rozwiązywana bez filtru własności — ugryzie, gdy kolonia zostanie USUNIĘTA |
| **99** | afordancja kolonizacji **znika** zamiast pokazać się zablokowana z powodem |
| **100** | `MissionSystem.createMission('colonize', …)` ma **ZERO** wołających produkcyjnych |
| **101 · 105** | komentarz `MovementOrderSystem:1857` („orbiting bez `dockedAt`") jest nieprawdziwy — dwa niezależne potwierdzenia |
| **102** | trasa „obca" blokuje POPy załogi **na zawsze** (surowy `_vessels.delete` zamiast `destroyVessel`) |
| **103** | `_redirectInterstellarVessel` omija bramkowanie startu; paliwo **klampuje zamiast odmawiać** |
| **104** | **dwie równoległe implementacje kolonizacji** — wspólna przyczyna 102 i 107 |
| **106** | przycisk kolonizacji zostaje **aktywny** po odmowie (defekt węższy niż pierwotny tytuł „ślepy zaułek") |
| **107** | trasa „obca" **osierocą jednostki w ładowni desantowej** (`troop_bay`) |

## A8 — AI: produkcja, desant, wiedza, zachowanie

| # | | opis | uwaga |
|---|---|---|---|
| **49** | 🟠 | ⚠ **KOREKTA 2026-10-02 — zamknięty po stronie DANYCH**: `transport_assault` jest w katalogu od `0e6ea0d`; **nikt go nie zamawia** (jedyny `template:` w regułach to `science_probe`) ⇒ reszta żyje jako **201** | `W3_PLAN.md` §49 · `AI_GARRISON_PLAN.md` §7 |
| **53** | 🟠 | „wieczna inwazja" na placówce gracza — rekord `active:true` nie może wygasnąć i trafia do **każdego** zapisu | |
| **54** | 🟠 | startowy garnizon gracza wisi na **efekcie ubocznym UI**; kolonie wtórne i placówki: 0 jednostek na zawsze | |
| **55** | 🟠 | kolonia macierzysta nie ma siatki do pierwszego otwarcia mapy ⇒ `launchInvasion` zwraca `no_grid` | |
| **56 · 57 · 58 · 59 · 60 · 61 · 64 · 66 · 67 · 68** | 🟠/⚪ | drugi mover (`CombatSystem._tryRetreat`) · martwa dysjunkcja `capitalBase` · kafle placówki **nigdy** nie dostają stempla `owner` · najeźdźcy zostają po przejęciu · `startGroundUnitBuild` bez guardu właściciela · `autoPlaceBuilding` bez guardu placówki · kłamliwy komentarz `HexTile:321` · `_autoSpawnRover` · legacy `infantry` w katalogu · redesign `INVASION_UNIT_POOLS` | |
| **62 · 63** | ⚪ | kolizje `PhysicsSystem` nie są bramkowane scenariuszem (rozjazd z dokumentacją) · `empire:colonyRemoved` brak w `DebugLog.TRACKED_EVENTS` | |
| **W3-2** | 🟠 | `_resolveBatchedBattle` **nie filtruje rezerwy**, a `_wreckPlayerVesselsInSystem` **filtruje** ⇒ kadłub rezerwowy AI walczy, kadłub gracza jest zwolniony z wrakowania | ✔ zweryfikowane w źródle |
| **W3-3** | 🟠 | **AI nigdy nie demobilizuje** — każdy `withdrawVessel` jest po stronie gracza ⇒ rezerwy drenują populację AI monotonicznie | |
| **191** | 🟠 | prognoza kolizji skanuje `activeSystemId` (KAMERA), a włącza ją `getMaxObservatoryLevel()` liczone po WSZYSTKICH koloniach gracza bez terminu układu ⇒ obserwatorium z układu A działa w układzie B, gdy tam patrzysz | rodzina „brak granicy systemu"; kierunek naprawy **projektowy**, nie techniczny. ⚠ **był WARUNKIEM KONIECZNYM 190** (jak 130+Z2) — 190 domknięto zawężeniem czyszczenia, ale pytanie „czy obserwatorium ma widzieć obce układy” zostaje **projektowe**; ✅ **POTWIERDZONY NA ŻYWO** (1 obserwatorium, alerty z 2 układów) |
| **192** | 🟠 | prognoza propaguje **stałe elementy orbitalne** do 700 lat, a świat ma perturbacje; `MARGIN_PERCENT` sztywne niezależnie od horyzontu, a **47 % zagrożeń leży 350+ lat w przyszłość** | zastąpiło **obaloną pomiarem** hipotezę „niepowtarzalność detekcji”; wymaga pomiaru rozjazdu model↔świat |
| **189** | 🟠 | `CivilizationSystem._updateUnrest:1104` czyta prosperity **AKTYWNEJ** koloni dla KAŻDEJ koloni ⇒ kolonie AI wpadają w niepokój, gdy kryzys ma gracz | zmiana **BALANSU** (niepokój globalny → lokalny), własny pomiar; `CivilizationSystem` nie ma referencji do swojego `ProsperitySystem` |
| ~~188~~ | ✅ | **ZAMKNIĘTY 2026-08-31** — mgła wojny STRATCOM rozdzielona na oś MIEJSCA i oś WŁAŚCICIELA (kanon `SystemReveal.js`). ⚠ reweali było **sześć**, nie trzy; nazwa w panelu była już poprawna, wyciekała na mapie | `docs/design/STRATCOM_REVEAL_PLAN.md` |
| **193** | 🔴 | **`IntelSystem._passiveTick` (⚠ korekta 2026-09-17: rejestr pisał `_tickPassiveListening` — takiej metody NIE MA; `:288`, wołana z `:82`) MARTWA od napisania** — czyta `col.systemId` z tablicy **stringów**; `inRange` zawsze `false`, więc „8 lat w 10 ly → rumor" nie odpaliło ani razu | trzecia gałąź klasy Findingu 87; ZMIERZONE wykonaniem. ⚠ ożywić dopiero PO 188 (inaczej wyciek staje się automatyczny) — i to zmiana **tempa gry**, nie higiena |
| ~~194~~ | ✅ | **`debug.dumpIntel()` nie raportował imperiów** — `getAll`/`getEmpireContact` nie istnieją (są `listAll`/`getLevel`); pętla bez obrotu | ZAMKNIĘTY 2026-08-31 przy gate 188; czwarty przypadek klasy 87/193 |
| **W3-4** | 🟠 | `ThreatAssessment` to prawda **globalna**, nie bramkowana intelem; 3 z 7 metod publicznych bez konsumentów | |
| **W3-5** | ⚪ | `director.posture` pisany, serializowany i **czytany przez nikogo**; `director:doctrineAssigned` emitowany w nicość | |
| **W3-6** | ⚪ | jednostka ETA pomylona **12×** (JSDoc civYears vs arytmetyka `gameTime`) — bezwładna po retirementcie W3-8, ożyje z abstrakcyjnymi flotami | |
| **W3-7** | 🟠 | `WarSystem._isPlayerInSystem:556` liczy **każdą** kolonię, w tym AI ⇒ kolonia AI czyni „gracz jest obecny" prawdą. Bezpośrednie wejście do decyzji o ataku | ✔ zweryfikowane w źródle |
| **W3-8** | 🟠 | pasywne odkrywanie rumoru **nigdy nie odpaliło** — `emp.colonies` to tablica **stringów**, więc `col.systemId` = `undefined` ⇒ `inRange` zawsze false, a `PASSIVE_RUMOR_LY/YEARS` są martwe | ✔ zweryfikowane w źródle |
| **W3-9 · W3-10** | 🟠 | `ArmySystem` **nigdy nieaudytowany** (żywy, wpięty, serializowany) · `CombatSystem` **nie ma `serialize` w ogóle** ⇒ po wczytaniu `combat:hexResolved` nie odpala | ✔ 10 zweryfikowane |
| **W3-11 · W3-12 · W3-15** | 🟠 | `offer_peace` bez gałęzi blokady stempluje `peace_refused` i ustawia cooldown, którego kod jawnie zabrania · podstawa `war_status` nieaktualna · `buildScheduledEventPopup` nie czyta per-button `onClick` | **wszystkie trzy to warunki wstępne W4** |
| **W3-13 · W3-14** | ⚪ | historia bitew przycinana do **50** przy serialize (dowody wygasają przy wczytaniu) · martwe powierzchnie krzywiące grepy | |
| **W3-16 · W2-12** | 🟠 | dwa dalsze site'y bez rozproszenia seeda: `DirectorPressure._pickRoamer` · **pierwszy kontakt to zsynchronizowana para sond z jednego namiaru w KAŻDEJ partii** (226°/227°, ZMIERZONE) | sonda `probe-firstcontact-seed.mjs` |
| **W3-23 · W3-27** | ⚪ | bramka portu jest nieaktywna dla AI **tylko przez przypadek katalogu** — dzień, w którym dojdzie cięższy szablon, AI zacznie **cicho** odmawiać startów · AI ma **jeden skok bez limitu odległości** | |
| **GATE B2 (a)** | 🟠 | **produkcja okrętów AI stoi na głodzie komodytów** — `startShipBuild` zwraca `queued`, a `ORDER_TTL_DISPLAYED_YEARS = 3.0` kasuje zlecenie **cicho** (`director:orderExpired`) | `VO3B_PLAN.md` §9 · **rodzina:** `docs/BALANS_PHASE2_AI.md` §4.1/§4.2/§5 — połowa PLACÓWKOWA tej samej rodziny, ZMIERZONA i zapisana jako naprawiona w BALANS Phase 3; ta (okrętowa) jest obserwacją PO tych fiksach. Warunek wstępny: **178** |
| **195** | 🔴 | `VesselManager._onColonyDestroyed:1136` przepisuje `vessel.colonyId` **bez terminu właściciela** — także statkom AI — na kolonię GRACZA (`_resolvePlayerHomePort`, AC-8), po czym robi `startReturn({force:true})`. Rodzina Findingu 97 | osiągalność NIEZMIERZONA (wymaga śmierci ciała w trakcie lotu), ale ścieżka bezwarunkowa. ⚠ Slice Z2 go **OMIJA, nie naprawia**: `issueRecall` nie czyta `colonyId`. `VESSEL_ORDERS_PLAN.md` |
| **199** | ✅ | **ZAMKNIĘTY 2026-08-31** (slice DEFENSE_SCOPE, live-gate §7 PASS) — naprawa rozpadła się na DWIE osie: **kompetencja** (eskadra gradowana do realnej siły obrońcy, BEZ clampa ⇒ własny powód `target_beyond_reach`) i **zakres** (V4: budynki bronią swojego ciała, okręty całego układu). ⚠ Pomiar OBALIŁ ramę zlecenia — ani V1, ani V2 nie usuwały porażki | keeper `defense_scope_smoke` 50/50 · ⚠ odsłoniło **210** · `DEFENSE_SCOPE_PLAN.md` |
| **200** | ✅ | **ZAMKNIĘTY 2026-08-31** (commit 1/3 DEFENSE_SCOPE, `792a034`) — bezbronny kadłub wnosi HP, ale **zero broni**. ⚠ Fallbacków były **DWA**, nie jeden: zdjęcie samego `BattleSystem:262` to **BUFF 2→5** (`normalizeFleet` podstawiał `{damage:5}`) — naprawa wymagała obu | keeper `defense_scope_smoke` 19/19, fail-first 10/9 · `VESSEL_ORDERS_PLAN.md` §200 · plan `DEFENSE_SCOPE_PLAN.md` |
| **209** | ✅ | **ZAMKNIĘTY 2026-08-31** (ten sam commit, `792a034`) — `WarSystem:597` i `EnemyAttackHandler:120` opisywały obrońcę-widmo jako „ZERO broni", a `normalizeFleet` dawał mu laser dmg 5 (zmierzone: 129 obrażeń). Klasa „predykat opisany w komentarzu ≠ egzekwowany" | pin `defense_scope_smoke` T7 · `VESSEL_ORDERS_PLAN.md` §209 |
| **210** | ✅ | **ZAMKNIĘTY 2026-08-31** (slice TARGET_FALLTHROUGH, `1e633d4`, live-gate §8 PASS) — fall-through **w porządku wartości** (D-210-1 = A, rozstrzygnięte pomiarem przeciw re-sortowi po koszcie), trzy stany terminalne drabiny, `skippedHead`, (c) nie milczy. ⚠ Na gate'cie zaobserwowano **pełną pętlę rozgrywki**: AI bierze zdobywalną kolonię → gracz fortyfikuje → AI odmawia zamiast powtórzyć błąd | keeper `defense_scope_smoke` 69/69 · ⚠ **202 jest następną dystorsją** (D-210-6) · `TARGET_FALLTHROUGH_PLAN.md` |
| **212** | ⚪ | `ScheduledEventPopup._loadVideo:378` nie cachuje porażki ⇒ przy nieosiągalnym serwerze każde zdarzenie ponawia łańcuch `fetch(HEAD)` | ⚠ **hipoteza „brak plików” OBALONA**: `assets/event-videos/` ma 21 plików z `alert.mp4`/`default.mp4`; trigger **środowiskowy** (Live Server), łańcuch degraduje poprawnie. Realne tylko: brak negatywnego cache'u |
| **213** | ⚪ | `TEMPLATE_ROLES` zna rolę `'courier'`, ale żaden szablon jej nie ma — kurierzy powstają przez `startShipBuild('hull_small')` wprost | istotne dla gate'u 208 (rozróżnienie kurier↔okręt wojenny) |
| **214** | 🟠 | `_feedCommodityDemand` przepuszcza `Fe` (bo `getSafetyStockTarget('Fe')`=1) i karmi nim **FactorySystem, który rud nie produkuje** — sygnał wygląda na działający i nie robi nic | rodzina **180**; konsekwencja: nie ma ŻADNEGO kanału popytu na rudy |
| **215** | 🟡 | **WDROŻONY 2026-08-31, LIVE-GATE PENDING (2026-09-01)** (slice 215, C1 `ade36d8` + C2 `2b27e4f`) — próg `freePops` był dla AI nieosiągalny Z KONSTRUKCJI (`_employedPops` liczy ETATY, a `ColonyAutoExpander` stawia ich więcej niż POPów ⇒ `freePops` = 0 na stałe). Population 2.0 Faza 2 zdjęła takie bramki, ale **przeoczyła ścieżkę AI**: `_enoughFreePops` (0,05) zabija **kuriera**, `EmpireStrategySystem:432` (8) zabija **pełną kolonię AI**; placówka nie jest bramkowana i dlatego istnieje | **ZMIERZONE**: freePops 5,00→0,00 od gy ~6; 0 kurierów; 0 statków w 35 gy. Łańcuch: brak kuriera → brak **Nt** → `quantum_cores`/`antimatter_cells` 0 → `warp_cores` 0 → **208**. `COURIER_LOAD_ORDER_PLAN.md` |
| **216** | 🟠 | **kolonie AI zakładają się i NIE ROSNĄ** — mediana pop w gy100 = pop założycielska, `grew` 0,0-0,7/100 gy, płasko we wszystkich rozmiarach transferu | ⚠ hipoteza (NIE diagnoza): ta sama równowaga etatów/`freePops` od środka młodej koloni. Nie bramkowało D-215-1c. `AI_POP_GATES_PLAN.md` §2.2. ⚠ **DO POMIARU (2026-09-17):** mechanizm w kodzie ŻYWY (`bootstrapColony` bez `startBuildings`), ale po pomiarze weszły R4 `aiScaleBasicInfra` (farm+well dynamicznie), S1, S4a — obserwabl NIEZMIERZONY ponownie; odczyt: `KOSMOS.debug.colonies()` na `GATE-S4-fresh-gy60` |
| **227** | 🔴 | **założone kolonie AI NIGDY nie dostają portu** — `launch_pad` jest w `targets` archetypu, ale NIE w `ColonyAutoExpander.BUILD_PRIORITY` (`:145`, sprawdzone 2026-09-17) ⇒ `_hasSpaceport` odsiewa je z `tradingColonies` ⇒ handel wewnętrzny AI cichy MIMO zamknięcia 223 | od 2026-09-17 WIĄŻĄCA blokada obserwabla 223; naprawa = jedna linia, ale zmienia kolejność budowy w KAŻDEJ koloni AI ⇒ własny pomiar i podpis. `VESSEL_ORDERS_PLAN.md` §227 |
| **211** | ⚪ | **„Player retreated” o bitwie, w której gracz nie wystawił żadnego statku.** `GameScene:2521-2524` pyta tylko o `result.retreated === sides.playerSide`, nigdy o KSZTAŁT strony; `resolveBattle` ustawia `retreated` z progu HP agnostycznie wobec tego, czy jednostka to flota, czy PLANETA | ⚪ **zero skutków stanowych** (`AutoRetreatSystem:62` wychodzi na `type !== 'vessel_group'`). PRE-EXISTING, ale commit 3 zwiększył częstotliwość (obrońcą częściej jednostka budynkowa). Rodzina 155/157/162 |
| **201** | 🟠 | **`transport_assault` istnieje, ale nigdy nie dojdzie do desantu.** `0e6ea0d` domknął połowę katalogową Findingu 49 ⇒ werdykt `AI_DROP_HULL_AUDIT.md` (”w katalogu nie ma ani jednego wpisu z `troop_bay_*`/`drop_pods`”) jest **NIEAKTUALNY** i wymaga nagłówka korygującego. Zastąpiły go dwie nowe blokady: szablon **nie ma gniazda broni** ⇒ `hasWeapons` w `strikeReadyVessels` wyklucza go z każdego uderzenia ⇒ `_onVesselGroupVictory` zawsze widzi `droppers.length === 0`; oraz **żadna reguła katalogu go nie nazywa** (`template:` tylko `science_probe`) ⇒ AI go **nie buduje** | ⚠ **ten sam temat co stały warunek W3 „katalog transportowca AI”** i findingi 49/50 — jeden przyszły gate. `DEFENSE_SCOPE_PLAN.md` §13 |
| **202** | 🟠 | **`targetValue` jest per-UKŁAD, a rankuje cele per-CIAŁO** (`DirectorOffensive:206`) ⇒ dwie kolonie w jednym układzie zawsze remisują na wartości | **ZŁAGODZONY** commitem 2: porządek rozstrzyga teraz gradowany `needed`, nie boolean. Sam człon wartości dalej nie różnicuje ciał — D-199-5 = W2 |
| **203** | ✅ | **ZAMKNIĘTY 2026-08-31** (commit 3) — **ROZPUSZCZONY, nie naprawiony**: wariant V4 zostawia okręty w zakresie UKŁADU, więc zakres obrońcy == zakres `_wreckPlayerVesselsInSystem` i stan „nie bronił, a zginął” jest nieosiągalny z konstrukcji | pin `defense_scope_smoke` **T16** · `DEFENSE_SCOPE_PLAN.md` §7.2 |
| **204** | 🟠 | **Dwa predykaty obecności nie zgadzają się co do tego, kto jest graczem.** `WarSystem.hasPlayerPresenceInSystem:603` filtruje własność; `_isPlayerInSystem:556` (bramka `_fleetArrived`) używa **`getAllColonies()` bez filtru** ⇒ kolonia **AI** w układzie czyni `playerPresent === true` | osiągalny tylko ze starej ścieżki flot abstrakcyjnych — dlatego przeżył utwardzenie bliźniaka w W3-4b. Rodzina 97/195 |
| **205** | ⚪ | **`battle:orbitalDominance` ma ZERO subskrybentów** — `WarSystem:369` emituje z komentarzem „dla InvasionSystem i UI”, a `InvasionSystem` czyta dominację na żądanie przez `getOrbitalController` | rodzina 197 · `station:orphaned` |
| **206** | ✅ | **ZAMKNIĘTY 2026-08-31** (commit 3) — `defense_tower` miał dwie prace w dwóch zakresach (katastrofy per-kolonia, obrona orbitalna per-układ); po V4 obie są **per-kolonia**, zgodnie z opisem budynku | `DEFENSE_SCOPE_PLAN.md` §5 |
| **207** | ⚪ | **Werdykt `strikeReport` zaszywał regułę eskadry** (`GameScene`, `ready.length < 2`) — był LUSTREM progu, nie progiem | **ZAMKNIĘTY faktycznie** commitem 2 (D-199-7): dwa ostatnie szczeble liczą tą samą metodą co decyzja i w tej samej kolejności. Wiersz zostaje jako ostrzeżenie klasy „lustro progu” |
| **208** | 🟠 | **GATE B2 (a) — produkcja okrętów AI stoi (numer nadany 2026-08-31).** `startShipBuild` zwraca `queued`, a `ORDER_TTL_DISPLAYED_YEARS = 3.0` kasuje zlecenie **cicho** (`director:orderExpired`). **180-182 tego NIE zamknęły** — 181/182 naprawiły dostępność komponentów, ale ten wpis jest obserwacją **po** tych fiksach, a jego warunek wstępny **178** jest otwarty (kurier ładuje wyłącznie `MINED_RESOURCES`, trasa jednokierunkowa) | ⚠ **NASTĘPNY PO 199, PRZED 154** (decyzja właściciela): po commicie 2 AI przestaje ginąć, ale odzyskanie uderzenia wymaga trzeciego kadłuba, którego 208 nie przepuszcza. `VO3B_PLAN.md` §9 · warunek wstępny: **178** |
| **196** | 🟠 | `no_idle_hull` (VO-3b) jest w ścieżce REGUŁY nieosiągalny — guard `empireHasStrikeForce` odcina przed akcją i przed rzutem | **nie defekt, ostrzeżenie metodyczne**: „dlaczego ofensywa AI stoi" NIE da się odczytać z `director:strikeRefused`; użyj `strikeReport`/`directorRules`, inaczej gate mierzy ciszę |
| **197** | 🟠 | `war:peaceSigned` ma ZERO konsumentów poza `DebugLog` — żaden system nie reaguje na pokój | ZŁAGODZONY przez Z2 (reguła powrotu świadomie bez guardu wojny, D-Z2-8), ale pytanie „jak flota AI reaguje na pokój" należy do **W4** |
| **198** | ⚪ | `DSCS._findActiveEncounterContaining` jest de facto publiczny (8 konsumentów po Z2, w tym renderer); prefiks `_` kłamie o roli | kosmetyka. ⚠ Pytanie „czy trzeba zbudować predykat »statek w starciu«" padło już DWA razy (F130 §8, Z2) — odpowiedź oba razy: **istnieje** |
| **178** | 🟠 | **kurierzy AI: wysłano ≫ dostarczono** (HEAD 12→2, 12→2, 8→0; `214127a` 14→4, 14→4, 11→1) — obecne po OBU stronach A/B ⇒ **stan zastany, nie regresja**; 4/8 imperiów buduje ZERO kurierów; zatrzask `pendingBuildRoute` zapalony na koniec mimo W1-6. ⚠ **zmierzony LICZNIK `stats.delivered`, NIE przepływ towaru** — pierwszy krok to porównanie magazynów placówka↔stolica (klasa 106). ⚠ **Poszerzone 2026-08-28:** kanału NIE MA dla **całej klasy towarów wytwarzanych** — `_loadByRarity` ładuje wyłącznie `MINED_RESOURCES`, a trasa jest jednokierunkowa (outpost → stolica) ⇒ wtórne kolonie AI nigdy nie dostają komponentów; pomiar przepływu potwierdzi zero **z definicji** | `VESSEL_ORDERS_PLAN.md` §Findings z A/B ekonomii AI · sonda `probe-ai-economy-health.mjs` · kandydat na warunek wstępny **GATE B2 (a)** |
| **179** | ⚪ | kolonizacja **bota referencyjnego** pada na `2335c4b` (VO-2): mediana ciał gracza 5 → 1, w 8/8 seedach, AI nietknięte. ⚠ **bot headless, NIE ścieżka UI** — właściciel gra regularnie i objawu nie widzi, VO-2 przeszedł live-gate ⇒ **nie cytować jako bug rozgrywki**. Zapisane, bo przekrzywia punkt odniesienia panelu BALANS | niski priorytet, decyzja właściciela 2026-08-28 |
| **180** | ⬜ | **(d) BRAK PROCESU — paliwo AI.** `_scanFuelDemand()` zwraca `[]` bezwarunkowo (paliwo to produkt rafinerii, nie fabryki); obie rafinerie są dla AI otwarte technologicznie (`exploration` w `startingTechs`, `popCost: 0`, koszt trywialny), ale `BUILD_PRIORITY` to zamknięta lista 10 pozycji **bez rafinerii** (grep `refinery` w warstwie decyzyjnej AI = 0). Kurier nie uniesie towaru (`MINED_RESOURCES` only), trasa jednokierunkowa. `H` ma `rarity: 5` ⇒ zwożony pierwszy i nieprzetwarzany (żywa gra: `emp_001` H = 78 620 przy `fuel` = 0) | **UTAJONY** — statki AI zwolnione z bramek paliwowych (`canReach:588`, `canJump:818`), więc dziś nic nie blokuje. ⚠ Gate na tej naprawie **zmierzy ciszę**, dopóki zwolnienie stoi; naprawa ma sens tylko RAZEM ze zdjęciem zwolnienia. Klasa W3-23. NIE rodzina B2(a) (grep: `fuel` poza kosztami statków). `VESSEL_ORDERS_PLAN.md` §Findings z A/B ekonomii AI |
| **183** | 🟡 | **wyciek drzewa technologii gracza do placówek AI** (`EmpireColonyBootstrap:385-390`) — ZMIERZONE tożsamościowo: **każda placówka AI** czyta `window.KOSMOS.techSystem` (drzewo GRACZA), pełne kolonie czytają własne `aiTech` | trop z diagnozy (c); zakres skutku niezmierzony (czy placówki w ogóle czytają techy) — **do sprawdzenia PRZED slice'em (c)** |
| **184** | 🟡 | **deklarowana bramka tech ≠ egzekwowana — 4 z 12 towarów, u GRACZA tak samo jak u AI** — `isRecipeAvailable` to OR trzech gałęzi, a `isCommodityUnlocked` przebija `requiresTech`: `android_worker`←`robotics` (w `startingTechs` AI, więc otwarte od pierwszej tury), `antimatter_cells`←`antimatter_containment`, `quantum_processors`←`quantum_physics`, `warp_cores`←`warp_drive` | **pytanie PROJEKTOWE, nie bug** — która strona jest prawdą, rozstrzyga projektant. ⚠ `requiresTech` **nie jest wiarygodnym opisem bramki**; efektywną czytać z OBU źródeł |
| **185** | 🟠 | **`military_supplies` nieosiągalne dla OBU archetypów AI** — wydzielone z 181 przy jego zamykaniu. `military_logistics` (150 rp) nie ma w żadnym planie badań, a jej prereq **`ground_warfare` też jest spoza kolejki**, więc koszt to cała gałąź, nie 150 rp. Brak obejścia przez `unlockCommodity`. Towar zasila zaopatrzenie naziemne (`BuildingsData:765`) i magazyn statku zaopatrzeniowego (`ShipsData:132`) | **świadomie poza zakresem** (F4). ⚠ Należy do slice'u **GROUND** (rodzina 49/50), nie do ekonomii AI. ⚠ Wycenić dopiero po sprawdzeniu, czy jednostki naziemne AI w ogóle czytają ten towar — legacy model z 50 może go omijać |
| **320** | ⚪ | `diplomacy:warDeclared` nie niesie `declaredBy`, a `UIManager.js:1624` go czyta | istotne dla G2 (materializacja przy wypowiedzeniu) |
| **321** | 🟠 | wydobycie kopalń (`receive` wprost, `BuildingSystem.js:2598`) niewidoczne dla `getPerYear`/`getGrossPerYear` | powód D1/D3; wpływ na UI niezmierzony |
| **322** | ⚪ | trzy definicje stolicy AI: `capitalOf`, bliźniaczy `_pickCapital`, statyczne `homeSystemId` | wybrać jedno źródło przed G2 |
| **325** | ⚪ | żaden archetyp AI nie bada technologii morale (ani `ground_warfare`); bonusy przy rekrutacji i tak czytają drzewo GRACZA | rodzina **185**; zastąpione przez **D7** |
| **341** | ⚪ | uprząż headless: POP imperiów AI przy gy 60 2,2–3,1× niższy niż w fixture GATE-S4 (limit 3–5 wobec 11); przyczyna nieznana, ziarnistość ticka wykluczona | instrument ⇒ **D18** (kalibracja na fixture) |
| **343** | 🟠 | zwykłe budynki AI stają na **oceanie** — martwy test `tile.buildable` (`EmpireColonyBootstrap.js:731`); 46 z 476 na 14 ziarnach (`research_station`, `shipyard`, `launch_pad`); takiego budynku nie da się okupować | osobny, późniejszy slice (zmienia rozmieszczenie budynków AI) |
| **344** | 🟠 | desant AI ląduje na krawędzi **bez drogi do stolicy** — `_findLandingHexes` (`InvasionSystem.js:500`) nie sprawdza osiągalności; 33 z 486 kafli strefy na koloniach AI (czapa polarna odcięta oceanem albo asymetria **347**), 0 z 249 na koloniach gracza | bez kroku; istotne dla G2-3 i G2b |
| **346** | ⚪ | stolice AI na jednej współrzędnej (−1,2) — remis punktacji, wygrywa pierwszy kafel rzędu 2; w fixture 5 z 11 na `ice_sheet` | obserwacja; rodzina **322** |
| **349** | 🟠 | „Wyładuj” bez sprawdzenia terenu (`CargoLoadModal.js:405` → `Vessel.js:743-745`); nad ciałem BEZ kolonii celem jest kolonia MACIERZYSTA (`FleetManagerOverlay.js:3074-3075`) — reszta **338** dla ciał własnych i niczyich | niemierzone (DOM); bez kroku |
| **361** | ⚪ | martwe pole `rocket_artillery.terrainModifiers` (`unitArchetypes.js:72`, `mountains: Infinity`) — zero czytelników; planer stawia artylerię na górach (fixture GATE-S4: emp_001 heks (0,2)) | bez kroku |
| **382** | ⚪ | karta ciała liczy ukryte (stealth) jednostki wroga, których mapa nie pokazuje — `readGarrisonReadout` bez filtra stealth (`GarrisonReadout.js:40-41`) wobec `isGroundUnitVisibleToPlayer` (`GroundVisibility.js:60`); dron ukryty + garnizon ⇒ mapa 1, karta 2 | uśpiony (garnizony AI bez dronów); bez decyzji. `AI_GARRISON_PLAN.md` §6 |
| **383** | 🟠 | mapa obcej kolonii: klik na kafel otwiera panel kafla bez względu na wywiad (`ColonyOverlay.js:961`, `:4835`) — budynek z produkcją z żywych stawek tej kolonii albo menu budowy gracza (wygaszone, D4=W3); osiągalne bez własnych jednostek w trybach zrzutu, ostrzału i away teamu | kierunek właściciela 2026-10-06: reguła **379**, etap polerki UI. `AI_GARRISON_PLAN.md` §6 |
| **384** | 🟠 | desant z ładowni zrzutowców AI duplikuje ładunek — `_onVesselGroupVictory` przekazuje `launchInvasion` TYPY jednostek z `v.groundUnits` (`InvasionSystem.js:300-307`), a ta tworzy nowe; w `InvasionSystem` zero `removeUnit`/rozładunku ⇒ oryginały zostają w ładowni | uśpiony (Findingi **49**, **201**); uzbraja się z desantem AI z ładowni. `AI_GARRISON_PLAN.md` §6 |
| **385** | ⚪ | bramki mobilności `_tickCombatAI` (`GroundUnitManager.js:1160`, `:1180`) czytają tabelę legacy `getUnitStats`, która dla archetypu zwraca domyślne `speedHex: 1.5` (`GroundUnitData.js:86-91`) ⇒ każdy archetyp „mobilny”, także `garrison_unit` | bez skutku w G2b (fala bez listy — typy ruchome). `AI_GARRISON_PLAN.md` §6 |
| **386** | ⚪ | `SpawnTestEnemy` stawia marines przez `createUnit` z pominięciem `createAIUnit` (`SpawnTestEnemy.js:148`) — właściciel i frakcja poprawne, morale archetypu (15) zamiast szczebla D9 | tylko debug (bramki z imperium testowym). `AI_GARRISON_PLAN.md` §6 |
| **387** | ⚪ | jednostki legacy AI ze starych zapisów praktycznie nie do zabicia w walce z garnizonem — w pomiarze G2b strata 0,0 w każdej z 18 komórek, przejęcie 96–100 % także przy 4 obrońcach z morale +90 | tylko stare zapisy (bez migracji); mechanizm z kodu: morale `?? DEFAULT_MORALE`, `hp: 60`. `AI_GARRISON_PLAN.md` §6 |
| **389** | ⚪ | ułamkowy `troopCount`: dawna pętla dawała ⌈n⌉ jednostek, skład szczebla daje ⌊n⌋ (`GarrisonPlanner.js:88`, `:123`) | żywi wołający podają liczby całkowite; różnica tylko w gałęzi `_onBattleResolved` bez producenta (`InvasionSystem.js:354`). `AI_GARRISON_PLAN.md` §6 |
| **395** | ⚪ | adnotacja `directorOrigin` trafia na zły kadłub — `_awaitingClaim` zdejmowane `shift()` przy każdym ukończonym kadłubie kolonii (`DirectorProduction.js:202-203`, `:237-241`); fixture: `v_28` | diagnostyka, bez wpływu na walkę. `AI_STRIKES_BACK_PLAN.md` §6 |
| **396** | 🟠 | desant z bitwy liczy POJEMNOŚĆ, nie ładunek (`InvasionSystem.js:294-295`, `:307`) — pusta ładownia daje do 6 jednostek z każdej wygranej bitwy; D2: 12 z 0 przewiezionych | uśpiony (49/201); rodzina **384**; → **S3** (SB7, SB8). `AI_STRIKES_BACK_PLAN.md` §6 |
| **398** | ⚪ | odczyt wywiadu „wolna załoga: {0} POP” (`IntelOverlay.js:296-298`) pokazuje `freePops` stolicy AI, który od S0-2 nie bramkuje mobilizacji AI | → **S1** (SB19: odczyt floty / limitu). `AI_STRIKES_BACK_PLAN.md` §6 |
| **400** | ⚪ | guard `empireHasFreeCrew` zarejestrowany (`DirectorProduction.js:479`), a od S0-2 bez konsumenta w katalogu reguł | martwy, nieszkodliwy; decyzja przy S1. `AI_STRIKES_BACK_PLAN.md` §6 |
| **401** | ⚪ | gałąź księgi abstrakcyjnej `_hasHostileFleetInSystem` (`WarSystem.js:950-962`) odbiera dominację flotą o `strength > 0` także w drodze (`destSystemId`), bez pojęcia „da się walczyć” | stare zapisy i floty debugowe (producentów brak od W3-8). `AI_STRIKES_BACK_PLAN.md` §6 |
| **403** | ⚪ | `WarSystem.getPlanetOrbitalController` (`:1039`) — zero konsumentów | martwy. `AI_STRIKES_BACK_PLAN.md` §6 |
| **406** | 🟠 | tryb zrzutu otwarty przy dominacji zrzuca także po jej utracie — klik heksu (`ColonyOverlay.js:4693-4745`) → `dropTroop` (`Vessel.js:788`) → `unloadGroundUnit` (`:749`) nie sprawdzają dominacji ani położenia statku; dominacja tylko przy wejściu w tryb (`:333`) | z bramki S0; osiągalność niezmierzona; kandydat do **S3**. `AI_STRIKES_BACK_PLAN.md` §6 |

## A9 — Higiena dokumentacji / i18n / zapis

| # | | opis | uwaga |
|---|---|---|---|
| **165b** | ⬜ | tekst wpisu Dziennika renderowany PRZY EMISJI i persystowany (200 wpisów w save) ⇒ po zmianie języka Dziennik jest dwujęzyczny **z konstrukcji** | **jedyna pozycja z bumpem zapisu**; zaparkowana decyzją właściciela |
| **167 residuum** | ⚪ | gałąź macierzysta pokazuje nazwę **PLANETY** w miejscu nazwy **UKŁADU** | widoczne w każdej bitwie u siebie |
| **159** | ⬜ | `map_body` ma tę samą klasę co 109, ale `commandTacticalMap:false` ⇒ **utajony**, wraca z flagą | NIE planować |
| **dług baseline `check-i18n`** | 🟠 | **62 napisy w 11 plikach UI** siedzą w zapadce Findingu 177 (w tym 112/113/126 i 9 w martwym `PlanetScene`) | zapadka nie pozwala go **powiększyć**; spłata = osobna praca |
| **76 · 93** | ⚪ | `BuildingSystem.deployFromCargo()` z `CLAUDE.md` **nie istnieje** · liczba keeperów w `CLAUDE.md` nieaktualna (dziś **186**) | Załącznik A przy sprzątaniu |
| **331** | ⚪ | walka naziemna **AI-vs-AI**: zero ognia (strony nie-graczy scalone, `CombatSystem.js:188-194`, `:295`), a `GameScene.js:5473` / `:5487` loguje graczowi „bitwę” i pokazuje raport | dawny wiersz „niezweryfikowane”: mechanizm potwierdzony w kodzie, osiągalność niezmierzona (**D5**) |
| **334** | ⚪ | karta jednostki w `ColonyOverlay`: polskie literały (statusy `:2660-2667`, przyciski `:2858`/`:2880`, flash `:5449`) i surowe id w tytule (`unit.type.toUpperCase()`, `:2641`) — klasa **113**, `check-i18n` ślepy | obserwacja z bramki G1b (ekran mieszał EN i PL) |
| **342** | ⚪ | `homeColonyId: null` jednostki AI wraca z zapisu jako id ciała (`GroundUnitManager.js:1459`, `:1522`) | dziś nieszkodliwe (`_ownedHomeColony` sprawdza właściciela, `popCost` 0); `null` zostaje decyzją właściciela |
| **345** | ⚪ | **uśpiony** nadpis `tile.type` z `_biome.png` w `ColonyOverlay._applyBiomeMap` — na siatce współdzielonej z silnikiem zmieniałby teren od samego otwarcia mapy; plików 0 na 216 | uzbraja się przy generowaniu tekstur z `--biome-map` / `--all-maps`; **widoczny `GET 404`** przy każdym otwarciu mapy kolonii (bramka G2-3b) |
| **350** | ⚪ | pozostałe odmowy zrzutu pokazują surowy slug — `t('drop.failed', reason)` (`ColonyOverlay.js:4683`) | klasa **271**/**113**; etap polerki UI (odpowiedź właściciela G2-2 (f)) |
| **351** | ⚪ | ciche odmowy away team — powód tylko dla `not_at_war` (`ColonyOverlay.js:4608-4609`); `no_vessel` / `no_gum` / `create_failed` bez słowa; literał `🤖 Away Team wylądował` (`:4611`) | etap polerki UI (odpowiedź (e)) |
| **352** | ⚪ | odmowa dźwigni `force_invasion` tylko w `console.warn` (`WarOverlay.js:729`) | rodzina **287** („wojna bez wojny”) |
| **355** | ⚪ | mapa kolonii cudzego ciała otwiera się z opóźnieniem przy wejściu w tryb zrzutu — **345 wykluczony w kodzie** (`_loadBiomeMap` asynchroniczne, nic na nie nie czeka) | przyczyna niezmierzona; `GET 404` z bramki G2-3b zgodny z wykluczeniem |
| **356** | ⚪ | okno ładowni: „undefined” jako nazwa łazika (`CargoLoadModal.js:328`, brak fallbacku `?? u.type`, który ma `ColonyOverlay.js:3339`) + nazwy archetypów z `descriptionPL` | klasa **113** |
| **362** | ⚪ | kopia przedimportowa nie mieści się przy dużym zapisie (`SaveSystem.js:462-465`, best-effort, tylko `console.warn`) — od ok. 2,6 mln znaków na zapis; ostrzeżenie o dużym zapisie dopiero od 3,5 mln (`:136`) | zaprojektowane (W2 GATE 1); pomiar: uprząż 0,97 mln znaków, fixture GATE-S4 2,09 mln. `AI_GARRISON_PLAN.md` §6 |
| **372** | ⚪ | trzy reguły nazwy imperium: strona traktatu bez warunku wywiadu (`EmpireName.js:19`), obserwacja — pełna przy `detailed` (`NotificationCenter.js:645`), panel dyplomacji — od `contact` (`DiplomacyOverlay.js:231`, `:311`); czwarta kopia pierwszej w `UIManager.js:1638` | **(c)** — etap polerki UI. `AI_GARRISON_PLAN.md` §6 |
| **374** | ⚪ | martwy `FleetTabPanel`: słucha `vessel:openCargoModal` (`FleetTabPanel.js:206`), a nikt go nie importuje; okno ładowni otwiera Dowództwo wprost (`FleetManagerOverlay.js:2786-2789`) | etap polerki UI. `AI_GARRISON_PLAN.md` §6 |
| **375** | ⚪ | polskie literały: „Błąd ostrzału: …” z surowym slugiem (`ColonyOverlay.js:4677`) i okno ładowni (`CargoLoadModal.js:125`, `:358`, `:381`, `:398`, `:439`, `:445`, `:500`); od G3 także okno zrzutu desantu (`DropTroopsModal.js:49`, `:121`, `:142`, `:146`, `:157`, `:159`, `:171`) | klasa **113**; etap polerki UI. `AI_GARRISON_PLAN.md` §6 |
| **377** | ⚪ | polska gramatyka „z {0}” przy nazwie imperium w trzech innych wpisach: `log.diplo.napExpired` (`UIManager.js:1733`), `log.diplo.napRenewed` (`:1740`), `log.skirmish` (`:1638`) | rodzina **371** (✅ `cafd6e8`); etap polerki UI. `AI_GARRISON_PLAN.md` §6 |
| **388** | ⚪ | T6c `g2_ocean_capital_smoke` zależny od strumienia `Math.random` — tasowanie heksów lądowania (`InvasionSystem.js:566`); setup S1 dokłada dwa losowania (`g2_ocean_capital_smoke.mjs:336`) | pin kruchy — przewróci się przy zmianie liczby losowań w ścieżce desantu. `AI_GARRISON_PLAN.md` §6 |
| **390** | ⚪ | nieaktualne teksty o `INVASION_UNIT_POOLS`: komunikat `w3_seams_smoke.mjs:355`, nagłówek `ground_morale_resolution_smoke.mjs:11` | asercje zielone; tekst historyczny, nieedytowany. `AI_GARRISON_PLAN.md` §6 |
| **404** | ⚪ | dwa polskie literały ostrzału z orbity w `ColonyOverlay`: `'Brak amunicji'` (`:260`), `'Brak dominacji orbitalnej'` (`:269`) | klasa 113/375; polerka UI. `AI_STRIKES_BACK_PLAN.md` §6 |
| **405** | ⚪ | flash `drop.noDominance` w praktyce niewidoczny — rysuje go tylko otwarta mapa kolonii (`ColonyOverlay.js:917`, `:1052-1064`), gałąź odmowy (`:333-335`) wraca przed otwarciem mapy (`:347`), a na pauzie pętla UI nie rysuje bez `_dirty` (`UIManager.js:2184-2196`); przy wyszarzonym przycisku żadna ścieżka UI do niej nie dochodzi | z bramki S0; widoczna odmowa = panel statku. `AI_STRIKES_BACK_PLAN.md` §6 |

---

# B · REJESTR W2 — osobna numeracja 1-14

| # | opis |
|---|---|
| **1** | historyczny wyciek załogi w zapisach v100 (Decision 8 grandfathers) — pozycja BALANS, jeśli się ujawni jako nierekrutowalny POP |
| **2** | `ActionCatalog` **podwójnie martwy** — każda akcja `BUILD_SHIP` harnessu jest odrzucana; filtr `status === 'docked'` na wartości, której `status` nigdy nie przyjmuje |
| **3** | `FleetPictureLogic` — **zero pokrycia** przy sześciu konsumentach i statusie „single source of truth" dla każdej soczewki floty |
| **4** | `ShipyardOverlay:435` czyta **globalne** `freePops`, gdy reszta pliku czyta aktywną kolonię |
| **5** | dwie **martwe** powierzchnie stoczniowe lustrzane wobec żywej (`FleetTabPanel`, `FMO._drawLeftFleets`) — grep prowadzi do złego pliku |
| **6** | **trzy formuły „netto Kr/rok" już się nie zgadzają** (`NavPeekProviders:125`, `ColonyOverlay:2111`, vs Civ/Economy) |
| **7** | obowiązek re-pomiaru R-2 (`BORDER_LY` ≥ 60 lat wyświetlanych, outposty osobno od kolonii) |
| **8** | cap magazynu **nie ma mierzalnego podmiotu** — „hoarding at scale" jest dla AI dziś nieosiągalny |
| ~~**9**~~ | ✅ **ZAMKNIĘTE 2026-08-27** (`ed084da`, N1 — `_tickArrearsRetry`, wyjście z zaległości w ciągu miesiąca gry) |
| **10** | materializowane floty AI omijały model załogi — ⚠ **temat w większości rozpuszczony przez retirement W3-8**; residuum: sonda pierwszego kontaktu + spawnery debug |
| **11** | wariancja ekspansji AI należy do **imperium i seeda**, nie do progu silnika |
| **12** | patrz W3-16 — pierwszy kontakt bez rozproszenia seeda |
| **13** | wiersz dzwonka mobilizacji **nie otwiera niczego** (`default: return;`), a subtitle fizycznie się nie mieści (320 px, `nowrap`) |
| **14** | deploy-pod-zaległością ma **dwie przeciwne konwencje** jednej odmowy — `ShipyardOverlay` chowa hit-zonę, `FMO` rejestruje ją i odmawia do Dziennika |

⚠ **W2 §Pułapka 2 — niezaadresowana:** `_tickRepair` szuka stoczni po `entry.buildingId`, a wpisy
`BuildingSystem._active` mają `entry.building.id` ⇒ **naprawa statków jest martwa u wszystkich**.
Włączenie jej to zmiana balansu, własny commit i własny pomiar.

---

# B2 · REJESTR VISUALS — osobna numeracja `V-246 … V-275`

> Rejestr macierzysty: **`VISUALS_PLAN.md`**. Tu są **tylko wiersze OTWARTE** — zamknięcia
> wpisuje się tam, nie tutaj (reguła 1 tego pliku).
> 🔴 **Numer goły ≠ numer z prefiksem `V-`** — patrz §Nawrót klasy wyżej.

| # | opis |
|---|---|
| **V-248** | 🟠 `_starLight.color` **przypisany** (nie skopiowany) tą samą instancją `THREE.Color`, co uniform `uColor` rdzenia gwiazdy ⇒ mutacja światła **przemalowuje gwiazdę**. ⚠ Dyson etap 4 świadomie na tym stoi ⇒ rozprzęganie to **decyzja wizualna**, nie higiena |
| **V-249** | 🟠 wyróżnienie orbit w trybie taktycznym **cicho zanika po ~3 s** — `_rebuildAllOrbits` podmienia linie co 180 klatek, a boost zostaje na **zwolnionych** materiałach; **pre-existing, niezależny od V-246** |
| **V-252** | zimny bake globusa po C0 — **regresja PRZYJĘTA** świadomie w V1 |
| **V-253** | rozjazd palety **mapa ↔ globus** |
| **V-254** | martwy `renderBodyThumbnail` — ⚠ **nie usuwać** (decyzja z C1a) |
| **V-255** | ⚪ dwa pozostałe zaszyte kroki `0.016` (`_colonyMarkers.tick`, `_animateTradeFireflies`) — połowa tempa przy 30 fps; bliźniaki V-250, **świadomie nietknięte w C2** |
| **V-258** | precesja `Ry·Rz` przy pochyleniu osi |
| **V-259** | pętla wycieku w `_syncGlobe` — canvas + kontekst **na klatkę** w gałęzi `catch` |
| **V-261** | 🟠 **pierścienie Dysona wymiarowane wobec promienia sprzed `STAR_CORE_SCALE`** (zaszyte `starRadius = 1.6` wobec tarczy `r * 3.0`) ⇒ pierścień etapu 1 i wewnętrzne pierścienie 2-3 leżą **wewnątrz** nieprzezroczystej tarczy |
| **V-262** | 🔴 **stan wizualny Dysona nie przeżywa wczytania zapisu ani zmiany układu** — jedyny emitent to `_onSegmentCompleted`, a słuchacz rejestruje się PO `restore()`; przy 20/20 zdarzeń już nie ma, więc utrata jest **TRWAŁA**, a panel dalej melduje etap 4 z 4 |
| **V-263** | 🟠 **etapy 3 i 4 nie dotykają tarczy gwiazdy** — zmienia się wyłącznie `_starLight.intensity` (+ barwa na etapie 4, przez alias V-248); i18n obiecuje graczowi trzy rzeczy, których renderer nie implementuje |
| **V-264** | 🟠 **sfera klikalna gwiazdy MNIEJSZA od tarczy** (`r * 2.5` wobec `r * 3.0`), a komentarz twierdzi odwrotnie; zewnętrzne 16,7 % promienia martwe dla kliknięć. ⚠ Świadomie NIE naprawione w V2 (U4) — powiększenie przy V-267 złapałoby planety orbit wewnętrznych |
| **V-267** | 🔴 **sześć ręcznie pisanych ShaderMaterialów pisze głębię STAŁOPRZECINKOWĄ do bufora LOGARYTMICZNEGO** (brak chunków `logdepthbuf_*` przy `logarithmicDepthBuffer: true`) ⇒ **planeta z DOWOLNEJ odległości wygrywa test z gwiazdą**; potwierdzone na gate'cie S3. ⚠ Naprawa zmienia okluzję gwiazdy wobec KAŻDEJ planety — własny slice. **⚠ Od V3 nie jest to już tylko odczyt ze źródła**: sonda zmierzyła skutek liczbowo (9477 → 0 px), a live gate potwierdził go w grze — patrz V-271 |
| **V-268** | 🟡 **kamera wchodzi do wnętrza tarczy i nic tego nie pilnuje** — `_minDist` 0.3 wobec promienia rdzenia 2,29-4,57, a klik w gwiazdę tylko obniża podłogę (bez auto-zoomu) ⇒ jedno kliknięcie i scroll; `FrontSide` wycina rdzeń i korona zalewa ekran. V2 ogranicza **własny** wkład sufitem, zalania nie naprawia |
| **V-269** | ⚪ `isTextureInCache` **wyeksportowane i nigdy niewołane** — cache chroni dziś wyłącznie to, że `Material.dispose()` w three tylko wysyła zdarzenie |
| **V-270** | 🟠 **przekręcenie `LIVE_GAS.OMEGA_DEG` na żywo jest SKOKIEM POŁOŻENIA, nie zmianą prędkości** (`uGasTime` akumulowane bez wrapu, ω mnożone przez pełny czas) — a to było pokrętło, którym V1 stroił ω **dwa razy**. Kształt naprawy: faza akumulowana w JS (D-V2u, zastosowane w V2) |
| **V-271** | 🔴 **warstwa chmur nad tarczą planety jest MARTWA** — instancja V-267 o innym skutku (nie „przebijanie", tylko funkcja shipowana i niewidoczna). `FrontSide` r = 1.025 R z `depthTest: true` pisze głębię stałoprzecinkową i przegrywa z log-głębią rdzenia. **ZMIERZONE** sondą V3 (9477 → **0** px wewnątrz tarczy) i **POTWIERDZONE W GRZE** na live gate'cie V3 (chmury tylko jako obwódka przy krawędziach). ⚠ Nie jest to regresja V3 |
| **V-272** | 🟠 **księżyce z `atmosphere === 'thin'` nie dostają ani powłoki, ani chmur** — `getAtmosphereMoon` potrafi to zwrócić, `_addMoonMesh` nie buduje żadnej warstwy. ⚠ Świadomie NIE naprawione w V3 (D-V3l): dodanie powłok czyni mapę BARDZIEJ wyrazistą, odwrotnie do zlecenia |
| **V-273** | 🟠 **`_updatePlanetMesh` odbudowuje wyłącznie rdzeń** — powłoka i chmury zachowują promień i istnienie sprzed zmiany; planeta, która ZYSKA atmosferę, nigdy jej nie dostanie, a która STRACI — nigdy nie zgubi |
| **V-274** | ⚪ **szara zasłona fog-of-war (`radius * 1.03`) leży WEWNĄTRZ powłoki (1.08)** — niezbadane ciało jest wyszarzone i jednocześnie nosi halo. Po V3 halo jest już tylko dzienne; pytanie „czy zasłona ma tłumić też powłokę" zostaje |
| **V-275** | ⚪ **rodzina V-253: mapa daje wszystkim planetom skalistym i lodowym ten sam `0x4488ff`** (bo `glowColor` jest `null` dla `rocky`/`gas`/`ice`), a `PlanetShader.createUniforms` ma gotową tablicę `atmColors` per typ. ⚠ Świadomie poza V3 (D-V3o): zmiana koloru wszystkich planet naraz zabrudziłaby gate'owi odczyt zmiany oświetleniowej |

**Zamknięte w arcu** (szczegóły i pomiary w rejestrze macierzystym): **V-246** · **V-247**
(oba w V0) · **V-250** (`cc12e04`) · **V-251** (`58628f8`) · **V-257** (`0f20904` + `118f837`) ·
**V-260** (`033e794`) · **V-265** (`b7c7360`) · **V-266** (`1079cd9`) — trzy ostatnie w V2 ·
**V-256** — ⚠ zamknięty **JAKO ZGODNY Z PROJEKTEM**: do gazowca nie prowadzi żadna ścieżka UI
do mapy kolonii (tylko placówki-rafinerie, celowo jak przy planetoidach), więc zgłoszenie
znaczyło „funkcji nie ma z projektu”, a nie „jest zepsuta”.

---

# C · Bez numeru

**Podwójne pobranie Kr za jednostki naziemne** (`KOSMOS_backlog_niezrealizowane.md`, ZMIERZONE,
świadomie nienaprawione). `ColonyManager._tickGroundUnitUpkeep:1543-1546` odejmuje kredyty **ręcznie**
i emituje `trade:spendCredits`, które ma żywego odbiorcę.
⚠ Bogata kolonia płaci **2×**, biedna **1×** (bramka salda `CivilianTradeSystem:879`) — bez tego niuansu
pomiar wygląda na losowy. Kadencja w latach **cywilizacyjnych** = 12 rozliczeń na rok gry.
Bliźniak przy rekrutacji (`:1441-1442`) **niezmierzony**; trzy inne miejsca używają przeciwnej konwencji.
⚠ **Keeper naprawy MUSI mieć bogatą kolonię w fixture** — inaczej bramka salda ukryje drugie pobranie
i test przejdzie **jałowo**.

---

# D · CO SIĘ ŁĄCZY, A CO NIE

> Ocena po **MECHANIZMIE**, nie po podobieństwie tytułów. Wzorzec: rozstrzygnięcie 110/159/160 —
> trzy findingi o „mapie STRATCOM", z których dwa nie miały ze sobą nic wspólnego.

## D1 — Łączyć

### ① ~~`130` + GATE B2 `Z2`~~ — ✅ ZAMKNIĘTE (2026-08-31), ale **NIE jako jeden slice**
⚠ **PRZESŁANKA TEGO WPISU ZOSTAŁA OBALONA POMIAREM.** Brzmiała: „130 jest warunkiem koniecznym
Z2 — rajder, który miałby wrócić do domu, **nie ma czym**, bo migawki nie ma". Pomiar
(`AI_COMBAT_MISSION_PLAN` §2, potem `AI_RECALL_PLAN` §0) pokazał, że **w migawce NIGDY nie było
nogi powrotnej**: `_issueAttack` wydaje `moveToPoint` przemianowany na `attack`, czyli bilet
w jedną stronę — wznowienie zawróciłoby rajdera do planety, przy której już stoi.
⇒ 130 zamknięto osobno (`77c1092`), Z2 osobno (`AI_RECALL_PLAN.md`), i to była właściwa kolejność:
Z2 wymagał **zbudowania** mechanizmu powrotu, nie odtworzenia go z migawki.
**Lekcja procesowa:** związek dwóch findingów jest hipotezą jak każda inna — `git log -S` i sonda
PRZED planowaniem, nie po.

### ② `49` + GATE B2 `(a)` — slice „AI ma czym desantować"
Różne przyczyny, **identyczny widoczny skutek**: AI nigdy nie wystawia transportowca. Sam wpis
w katalogu i tak umrze na głodzie komodytów i TTL 3 lat ⇒ **naprawa pojedyncza wyglądałaby jak brak
naprawy**. Idą razem albo wcale.
⚠ **Aktualizacja 2026-10-02:** wpis w katalogu już JEST (`transport_assault`, `0e6ea0d`) — `49` zamknięty
po stronie danych; to, czego brakuje (nikt go nie zamawia, brak gniazda broni), żyje jako **201**.

### ③ `50` + `65` + `56` + `54` + `58` + `67` + `68` — slice **GROUND**
`65` jest **przyczyną** `50` (dwie linie: `?? 0` vs `?? 100`). `56` to drugi mover, który GROUND
obudzi. `54`/`58` to warunki wstępne uczciwego pomiaru (kto w ogóle ma jednostki, czyj jest kafel).
`67`/`68` to redesign katalogu. **Jeden slice balansowy, nie siedem poprawek.** Dołącza tu S12
(morale) i R13 (RNG) z wcześniejszych rejestrów.
⚠ **Aktualizacja 2026-10-02:** `65` ✅ zamknięty w **AI GARRISON G1** razem z S12 (morale); `50`
**zastąpiony przez D7** (archetypy wszędzie — krok G2b); `56` rozszerzony przez **313**. Dalsza praca nad
tą grupą idzie w `AI_GARRISON_PLAN.md` (G1b ✅ 2026-10-02 → G2 → G2b → G3), nie w osobnym slice'ie GROUND. `313` rozszerzony dalej przez
**335** (pętla odwrotu AI, bramka G1b).

### ④ `141` + `145` + `127` — slice **ORDER_TRUTHFULNESS** (już uzasadniony w §7a)
Jeden chokepoint (`MOS.issueOrder:181-246` — wszystkie 9 gałęzi `_issueX` wychodzi tym samym
`return`), jeden konsument w `UIManager`, gotowy wzorzec w repo (`_toastReturnFailed` +
`_warpErrLabel`). `145` wchodzi, bo to **odmowa raportująca sukces** — ta sama powierzchnia.
⚠ **Rozdzielić na wejściu:** część „powiedz powód" jest tutaj, **korzeń NaN-a** (`exploration`
bez `returnYear`) należy do **P4**.
⚠ Trzy rzeczy do nazwania w podpisie (zmierzone): chokepoint **nie pokryje** odmów sprzed wejścia
do MOS ani blokad w locie · konieczny filtr `isEnemyVessel` · ryzyko **podwójnego komunikatu**
przy producentach fan-out.

### ⑤ `161` + `164` — mini-slice „gracz odzyskuje kontrolę nad czasem"
Oba na styku `TimeSystem` ↔ UI, oba drobne, i **oba wymagają tej samej decyzji**: czyja wola
wygrywa o zegar. `164` ma nierozstrzygnięty zakres (podłączyć przełącznik vs wyciąć resztki) —
rozstrzyga się go **raz, dla całej powierzchni**.

### ⑥ `112` + `113` + `158` + `163` + `162` + `126` — spłata baseline i18n na ekranach o najwyższym ruchu
Wszystkie siedzą w tej samej zapadce (Finding 177) i wszystkie to jeden rodzaj edycji.
`112` to inny **mechanizm** (brak zawijania), ale **te same pięć `fillText`** — rozdzielenie
znaczyłoby dotknięcie tej funkcji dwa razy. `162` wchodzi, bo naprawą jest **skasowanie wpisu EAH**
(kanoniczny `log.battleLine` już go pokrywa), a nie tłumaczenie.
⚠ `DH = 180` zostawia ~20 px zapasu ⇒ zawinięty powód **zderzy się** z linią niżej; to jest praca,
nie jednolinijkowiec.

### ⑦ `154` + `166a` — granica układu w selektorach POZIOMU FLOTY
Ten sam kształt naprawy co zamknięte `138`/`142`, z gotowym wzorcem (`systemIdOf`, **fail-open** —
nie `getByTypeInSystem`, które jest fail-CLOSED) i gotowym keeperem.
⚠ Cena: `154` dotyka przycisku używanego w normalnej grze — to decyzja o **promieniu rażenia**,
nie konflikt mechanizmu.

### ⑧ `148` + `149` — księga przydziałów `TransportOrderSystem`
Oba to „przydział nie zostaje zwolniony", jeden plik, jeden keeper.

### ⑨ `95` + `96` — jeden **AUDYT**, nie slice naprawczy
Dzielą scenę i jedną sesję pomiarową u właściciela. Obie są **obserwacjami**, nie pomiarami —
naprawa bez pomiaru byłaby zgadywaniem.
⚠ Kontekst czyniący `95` prawdopodobnym: `createAndRegister:186-211` **nigdy** nie stempluje
własności, więc stempel wroga musi pochodzić **skądinąd** — i to trzeba znaleźć.

### ⑩ `podwójne Kr` + `F6` — przecieki pieniądza
Oba to realny **przepływ** (nie wyświetlanie) i oba wymagają tego samego kształtu dowodu:
**kredyty w czasie, nie zwrotka**. `W2-6` (trzy niezgodne formuły) można dołożyć jako trzeci,
ale to warstwa prezentacji — inny rodzaj dowodu.

## D2 — NIE łączyć, i dlaczego konkretnie

| nie łączyć | powód (mechanizm, nie gust) |
|---|---|
| `151` z `152`/`153`/`154` | **`151` ma ODWROTNY kierunek fail** (fail-closed dla walki vs fail-open dla rozkazów) — jeden podpis nie może zawierać dwóch przeciwnych odpowiedzi na to samo pytanie. Do tego `151` bramkuje **intel**, więc jego gate mierzy co innego. Rozstrzygnięte pomiarem w `SYSTEM_SCOPE_138_142_AUDIT.md` §5.3 |
| `152` z czymkolwiek | to **brak POLA**, nie zły filtr ⇒ naprawa = dodanie pola + **migracja zapisu**, czyli decyzja o zakresie |
| `153` z czymkolwiek | **osiągalność niezmierzona** — gate zmierzyłby ciszę. Najpierw pomiar, czy AI w ogóle zakłada outposty poza układem stolicy |
| `156` z narracją (`158`/`162`/`163`) | `156` dotyka **treści zapisu**, reszta to napisy. Wspólny slice zamieniłby zerowe ryzyko w ryzyko formatu |
| `165a` z `164` | `165a` to **zmiana projektu** (dać EAH przebieg albo przenieść obronę orbitalną na potok DSCS, z własnym pomiarem tempa); `164` to podłączenie przełącznika. Wspólny gate nie umiałby powiedzieć, co zadziałało |
| `146`/`144`/`121` osobno od **P4** | kuszące, bo bolą — ale **znikają z konstrukcji**, gdy `foreign_*` dostanie rekord w `MissionSystem`. Naprawa punktowa to praca do wyrzucenia |
| `W3-11` z czymkolwiek dziś | to **warunek wstępny W4**, nie samodzielny defekt: bez stołu pokojowego nie ma czego nim zepsuć |
| `W3-7` z `W3-8` | brzmią jak jedna „wiedza AI", ale `7` to bramka **decyzji o ataku** (zmiana zachowania AI = balans), a `8` to zwykły bug typu (tablica stringów) o zerowym ryzyku. Sklejenie podniosłoby taniemu fixowi próg dowodu do gate'u balansowego |
| `98-107` jako „kolonizacja" | to nie jest jedna rzecz: `100`/`102`/`104`/`105`/`107` **rozpuszcza P4** · `99`/`106` to UI/afordancja · `98` to własność · `103` to bramkowanie startu. Wspólny slice odtworzyłby dokładnie stan, który `104` opisuje jako defekt |

## D3 — Osobno, bo tak zdecydował właściciel albo bo to nie jest defekt

`165b` (zaparkowany; jedyny bump zapisu) · `159` (utajony za flagą) · `127o` (backlog: lazy-init
loadera) · `W2-7` / `W2-8` / `W2-11` (obowiązki **pomiarowe**, nie usterki) · `114` (środowiskowe —
wartością jest zapisana reguła, nie naprawa).

---

# E · Rekomendacja kolejności — trzy pozycje, każda z innego powodu

1. ~~**`W3-32`**~~ — ✅ **wykonane 2026-08-29**, a właściwie: **zamknięte 2026-08-18**, o czym ten
   plik nie wiedział. Audyt dowiózł zamiast tego jego stanową resztę (186 + 187). Wiersz zostaje
   jako ślad procesowy: **pozycja nr 1 rekomendacji była nieaktualna**, bo przepisano ją z rejestru
   bez uruchomienia keepera.
2. **`87` + `86`** — dwa **zmierzone w źródle** przecieki „kolonia AI wpływa na grę gracza":
   jeden **pauzuje grę fałszywym alarmem o utracie stolicy**, drugi zabiera **−30 % produkcji**.
   Ta sama rodzina co domknięty arc własności, ta sama tania naprawa, ten sam kształt keepera.
3. ~~**① `130` + `Z2`**~~ — ✅ **wykonane 2026-08-31**, w dwóch slice'ach zamiast jednego.
   ⚠ Uzasadnienie („dopóki rajder parkuje z wyzerowaną misją, każdy pomiar tempa wojny mierzy
   artefakt") było **trafne co do kierunku i błędne co do mechanizmu**: pomiar pokazał, że tempo
   jest zaciśnięte przez `strike_player_target.cooldown = 5.0`, a Z2 psuł nie CZĘSTOTLIWOŚĆ, tylko
   **dolot** (ostrzeżenie 0,0 zamiast 5,1 roku) i **trwałą okupację** orbity. Patrz `AI_RECALL_PLAN.md` §3.

⚠ **Kolejka wielosesyjna uzgodniona z właścicielem 2026-08-29:** (1) szybka seria `W3-32` →
`87`+`86` → `130`+`Z2`; (2) `151` · `152` · `153` · `154` **osobno**, każdy z innego powodu
wykluczenia (§D2); (3) trzy duże sloty pełnym cyklem audyt→pomiar→plan→implementacja→live-gate:
**GROUND** (49, 50, 65, 56, 54, 58, 67, 68 + `185`) · **kolonizacja** (98-107, ⚠ §D2: to NIE jest
jedna rzecz — zakres rozstrzygnąć na wejściu) · **ORDER_TRUTHFULNESS** (141, 145, 127).

---

## Utrzymanie tego pliku

- **Zamknąłeś finding?** Wpisz to w rejestrze macierzystym (mapa numeracji wyżej), a **tutaj zdejmij
  wiersz**. Nigdy odwrotnie.
- **Znalazłeś finding?** Zapisz w rejestrze slice'u, który go znalazł. Tutaj **co najwyżej** dopisz
  wiersz z odsyłaczem.
- **Ten plik nie jest źródłem prawdy o niczym.** Przy rozbieżności wygrywa rejestr macierzysty.
