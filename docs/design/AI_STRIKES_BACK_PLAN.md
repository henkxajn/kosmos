# AI STRIKES BACK — flota, strażnik i desant AI

> **Status:** 📋 **PLAN PODPISANY 2026-10-06** — zakres (cztery pozycje, w kolejności właściciela) i decyzje
> **SB1–SB12** podpisane przez właściciela **2026-10-06**; **SB13–SB19** — tego samego dnia, przy zamknięciu S0;
> **SB20–SB25** — **2026-10-07**, odpowiedzi na pytania sesji 1 S1; **SB26–SB29** — **2026-10-08**, odpowiedzi na
> pytania sesji 2 S1; **SB30–SB36** — **2026-10-08**, podpis S2 (§2); **SB37–SB38** — **2026-10-10**, przy zamknięciu
> S2 (§2); **SB39–SB44** — **2026-10-10**, podpis S2b — poprawki przed S3 (§2); **SB45–SB48** — **2026-10-11**, przy
> zamknięciu S2b (§2); **SB49–SB60** — **2026-10-11**, podpis S3 (§2); **SB61–SB67** — **2026-10-12**, przy zamknięciu
> sesji 1 S3 (§2).
> Faza A (audyt i pomiar, bez kodu): `docs/design/AI_STRIKES_BACK_AUDIT.md` (zmierzone na `8b72c47`, kod gry `23a87e5`).
> ✅ **S0 ZAMKNIĘTY 2026-10-06** (trzy defekty: **391**, **392**, **393 + 394**; bramka live właściciela PASS — §5a,
> wynik — §5b): `9c73023` · `e73c890` · `cf2a598` · `eb6c06e`.
> ✅ **S1 — sesja 1 z 2 ZAMKNIĘTA 2026-10-07** (tabela strojenia + limit floty, bez bramki — zachowanie gry bez zmian;
> wynik, audyt, pomiary M1/M2 — §5c): `eb17f97` · `8abe84d`.
> ✅ **S1 — sesja 2 z 2 ZAMKNIĘTA 2026-10-08** (bramka w przeglądarce PASS — §5e.3): łańcuch sesji 2 zacommitowany po
> zgodzie na przecelowania R-B2a, R-B2b, R-B5 (§5e.2) — `d4f43a8` · `a1143fc` · `a8ebbfe` · `d707e3e` · `1a9f95b`;
> domknięcie (SB28, SB29, test wyłącznika puli) — `8d13485` · `5dc04d0` · `1444184` (§5e).
> ✅ **S1-8 (SB27 — plan puli do skutku) zacommitowany 2026-10-09** po zgodzie na przecelowanie **R-B6** — `6b40c30`;
> Finding **413** naprawiony — `dab5e2a` (§5f.1). **S1 ZAMKNIĘTY W CAŁOŚCI.**
> ✅ **S2 ZAMKNIĘTY 2026-10-10** (bramka właściciela w przeglądarce PASS — §5g.2): łańcuch B1–B5 zacommitowany po zgodzie
> na przecelowanie **R-S2-3** — `bf498d1` (414, SB36) · `013fd75` (406, SB35) · `d3fc782` (strażnik stolicy + R-S2-3;
> SB30, SB31, SB33, SB34) · `17c60f3` (drugie ciało, SB32) · `0eaa105` (zastępstwo i odczyt, SB33). Sesja 1 — §5f;
> zamknięcie, audyt 416 i ustaleń bramki — §5g; decyzje **SB37–SB38**; Findingi **417–419** — §6.
> ✅ **S2b ZAMKNIĘTY 2026-10-11** (poprawki przed S3; bramka właściciela w przeglądarce PASS — §5i.2): łańcuch B1–B5 —
> `a8de641` (416, SB39) · `bf634c1` (417, SB40) · `35cdebe` (418, SB41) · `e2f3285` (419, SB42) · `d833e0c` (415, SB43);
> poprawki **424** i **425** (SB47) — `5043744` · `7b37a4d`. Audyt, łańcuch, pomiary i bramka — §5h; zamknięcie — §5i;
> decyzje **SB45–SB48**. Findingi **415–419**, **424**, **425** zamknięte; **420** i **421** → S3; **422**, **423** —
> raport do zamknięcia arca (§6).
> ✅ **S3 — sesja 1 z 2 ZAMKNIĘTA 2026-10-12** (bramka S3A w przeglądarce właściciela PASS — §5k.2): łańcuch zacommitowany
> po zgodzie na przecelowanie **R-S3** — `1cf1d24` (S3-1, **421**, SB49) · `ee44424` (S3-2, **420**, SB54, SB45) ·
> `c97b73b` (S3-3 + R-S3: eskadra z ładunkiem, SB51–SB53, SB55; **396**, **384**). Przygotowanie, M5 i scenariusz bramki —
> §5j; zamknięcie — §5k; decyzje **SB61–SB67**; Findingi **426–437** — §6.
> **Następny: S3, sesja 2** (SB56–SB59, SB63–SB67). **S4** — nierozpoczęty.
> Save **v101**. Każdy slice zakłada zero migracji tam, gdzie się da: pola statku są na białych listach
> `VesselManager.serialize`/`restore` (`VesselManager.js:1475-1478`, `:1540-1547`, `:1613-1617`, `:1677-1682`), a stan
> puli i odrastania może żyć w `empires.<id>` — wzór flagi garnizonu D15 (`AI_GARRISON_PLAN.md` §1) `[doc: audyt fazy A]`.
> **Rejestr macierzysty findingów #391–#437:** ten plik, §6. Korekty cudzych rejestrów (**50**): §7.
> ⚠ Znaczniki źródła: `[code]` — przeczytane w źródle (#391–#396 na `8b72c47`, #397–#406 na `eb6c06e`, #412–#413 na
> `1444184`, #414–#416 na `dab5e2a` i na łańcuchu S2, #417–#419 na `0eaa105`, #420–#425 na `f3fb8e0` i na łańcuchu S2b, #426–#435 na `2a09ac9` i na łańcuchu S3, #436–#437 na `c97b73b`) ·
> `[measured]` — wykonane i policzone ·
> `[git]` — historia commitów · `[doc]` — przepisane z dokumentu, bez ponownego pomiaru · `[doc: audyt fazy A]` —
> z raportu fazy A (`AI_STRIKES_BACK_AUDIT.md`; sondy i wyniki poza repo,
> `C:\Users\Komputer\kosmos-handover\ai-strikes-back\`).

---

## 0. Cel

Po AI GARRISON imperium AI broni swoich ciał na ziemi, ale w przestrzeni nie ma zębów. Audyt fazy A zmierzył to wprost:

- **bez nacisku gracza AI nie buduje ani jednego okrętu w 100 lat gry** — uprząż, oba ziarna, oba imperia: 0 uzbrojonych
  kadłubów przy gy 20 / 40 / 60 / 80 / 100 `[doc: audyt fazy A, C1]`;
- **jedyny producent zamówień okrętów wojennych to odpowiedź na nacisk** (`DirectorPressure.pressureResponse`), a oba jej
  szczeble mają guard `empireNotAtWarWithPlayer` (`DirectorRuleData.js:106`, `:134`) — **w wojnie AI nie zamawia
  żadnego okrętu** `[doc: audyt fazy A, C1]`;
- **każdy kadłub ze stoczni stoi w rezerwie**: przy stałym nacisku i opłacanej flocie gracza 6–8 okrętów na 100 gy na
  imperium, 0–1 z bakiem warp, prawie wszystkie w rezerwie; w fixture GATE-S4 (gy 60) `emp_001` ma 6 uzbrojonych
  kadłubów — **0 w służbie, 6 w rezerwie** `[doc: audyt fazy A, C1]`;
- **AI nigdy nie odbija utraconej kolonii i nigdy samo nie zaczyna wojny** — jedyna droga wypowiedzenia „z inicjatywy”
  to próg napięcia 80, a desant AI z bitwy nie ma wejścia (brak zrzutowca — **49**, **201**) `[doc: audyt fazy A, C5–C6]`.

Cel arca: AI, które **oddaje cios** — ma flotę o rozmiarze wynikającym z siły imperium, trzyma okręt-strażnika na orbicie,
odbija utracone kolonie realnym lotem i realnym desantem, a w końcu samo zaczyna wojnę i prowadzi ją układ po układzie.

---

## 1. Zakres podpisany (2026-10-06)

W kolejności właściciela:

1. **limit floty z siły imperium i źródło okrętów;**
2. **strażnik przy stolicy i przy jednym cennym ciele;**
3. **odbijanie utraconych kolonii;**
4. **wojna z inicjatywy AI.**

**Wprost poza zakresem:** walka i wojny AI-vs-AI · liczba imperiów AI.

---

## 2. Decyzje podpisane (właściciel, 2026-10-06)

| # | decyzja | ślad |
|---|---|---|
| **SB1** | **Okręty pochodzą z PULI**, tworzonej przy mobilizacji (w chwili, w której stawiane są garnizony); straty odrastają **po jednym kadłubie na rok**. Prawdziwa produkcja zostaje NIETKNIĘTA, a kadłuby, które buduje, liczą się do tego samego limitu. Naprawa prawdziwej produkcji to możliwy osobny, późniejszy arc. | Audyt P1: pula `createAIVessel` (wzór `createAIUnit`) ~2 slice'y, produkcja ≥ 4 slice'y i ponowny pomiar BALANS, a nawet naprawiona daje ~0,07 okrętu/gy `[doc: audyt fazy A, P1]`. |
| **SB2** | **Kadłuby z puli nie pobierają POP na załogę** — tak jak garnizony ich nie pobierają. | Audyt P7 (2). Pociąga zdjęcie poboru załogi AI przy rozmieszczeniu — **S0-2** (§5). |
| **SB3** | **Limit floty = max(2, ⌊POP imperium / 32⌋) × mnożnik szczebla drabiny garnizonu** (×1,25 od 20 poziomów fabryk). Liczą się **wszystkie uzbrojone kadłuby**. Każda liczba jest pokrętłem (SB9). | Formuła F4 audytu: fixture gy 60 — limit **6** dla obu imperiów; uprząż gy 40/80 — **2** i **2–3** (POP uprzęży 2–3× niższy niż w fixture — Finding **341**, D18) `[doc: audyt fazy A, C3]`. |
| **SB4** | **Defekt, przez który zaległość floty GRACZA blokuje kadłuby AI, jest naprawiany** (S0). | Finding **391**. |
| **SB5** | **Strażnik stoi NA ORBICIE**, gdzie da się z nim walczyć. Kadłuby **zadokowane albo w rezerwie nie odbierają** dominacji orbitalnej. | Findingi **393**, **394**; pomiar G2: strażnik na orbicie — 1 bitwa, 2 fregaty gracza wygrywają tracąc 1 `[doc: audyt fazy A, C4]`. Druga połowa → **S0-3** (§5). |
| **SB6** | **Drugie strzeżone ciało = najcenniejsze ciało poza stolicą, w porządku planera garnizonu** (D11 arca AI GARRISON). Jego strażnik **pojawia się przy stolicy i LECI** na miejsce. | W fixture poza układem stolicy AI ma wyłącznie placówki Xe/Nt, a defender nie ma baku warp `[doc: audyt fazy A, C4]`. |
| **SB7** | **Żadnych magicznych lądowań.** Kadłuby z puli pojawiają się przy stolicy AI; wszystko potem to realny lot: wylot z układu macierzystego, tranzyt, przylot do układu celu — **widoczne dla gracza według ISTNIEJĄCYCH reguł detekcji**. Wojska przylatują **na pokładzie transportowca, który leci razem z eskortą**. Desant następuje **dopiero po wygraniu orbity i tylko wtedy, gdy transportowiec przetrwał**; zestrzelony po drodze transportowiec = brak desantu. | Zaczep `InvasionSystem._onVesselGroupVictory` istnieje; brakuje mu wejścia (zrzutowca w zwycięskiej grupie) `[doc: audyt fazy A, C5]`. Finding **396**. |
| **SB8** | **Wielkość desantu = część limitu garnizonu imperium** (domyślnie połowa), obcięta do tego, co mieści transportowiec, **powtarzana falami**, dopóki trwa wojna, a cel nie jest zdobyty. | Tabela C7 audytu (odsetek przejęć wg obrony i wielkości desantu) `[doc: audyt fazy A, C7]`. |
| **SB9** | **Jedna tabela strojenia trzyma KAŻDĄ liczbę tego arca** (POP na kadłub, mnożniki szczebli, liczba strażników, udział i limit desantu, odstęp fal, tempo odrastania). Komenda konsoli zmienia jedną wartość w trakcie gry, a odczyt drukuje tabelę i to, co z niej wynika dla każdego imperium — właściciel stroi w przeglądarce bez sesji kodu. | Wzór: `src/data/GarrisonData.js` (jedno miejsce liczb D1/D9/D10/D11, `AI_GARRISON_PLAN.md` §5l). |
| **SB10** | **Ofensywy przeciw graczowi idą układ po układzie:** układy gracza w kolejności odległości od stolicy AI, najbliższy pierwszy; stolica gracza **nie jest** preferowanym pierwszym celem. Gdy wszystkie kolonie gracza w układzie są zdobyte, AI przechodzi do następnego układu albo proponuje pokój według reguły podpisywanej przy S4. | Dzisiejszy ranking celu uderzenia — wartość malejąco, potem koszt (`DirectorOffensive.js:187-360`) `[doc: audyt fazy A, C6]`. |
| **SB11** | **Szczegółowe reguły odbijania** (wyzwalacz, kolejność, odstęp) **i wojny z inicjatywy AI** (warunki, cooldown, jak taka wojna się kończy) **podpisywane są przy S3 i S4, na zmierzonych liczbach.** | Audyt P4–P5 — opcje z liczbami, bez decyzji `[doc: audyt fazy A]`. |
| **SB12** | **Zamknięcie Findingu 50 wpisane w `W3_PLAN.md` §50.** | §7. |
| **SB13** | **Mobilizacja wojenna budzi CAŁĄ rezerwę;** guard parytetu (`empireOutgunnedByPlayer`) hamuje mobilizację **wyłącznie w pokoju**. | Bramka S0 (§5a): w pokoju parytet zatrzymał 4 z 6 fregat `emp_001` (1 314 > 618) `[measured]`. Odpowiada na kandydata 9 notatki przekazania S0 (§3, wiersz S1). |
| **SB14** | **Pula dopełnia do limitu, licząc WSZYSTKIE uzbrojone kadłuby** (konsekwencja SB3). | Fixture `emp_001`: limit 6 (F4 `[doc: audyt fazy A, C3]`), uzbrojonych kadłubów 6 (bramka S0, krok 1, §5a) — nowych kadłubów nie ma, budzą się śpiący. |
| **SB15** | **Odrastanie jak w garnizonie:** od mobilizacji jeden kadłub na granicy roku kalendarzowego, do bieżącego limitu, **także w pokoju**. | Wzór G3-1 (`GarrisonSystem.regrowEmpire`, `GARRISON_REGROWTH_PER_YEAR`; `AI_GARRISON_PLAN.md` §5x). |
| **SB16** | **Wartości strojenia zmienione z konsoli zapisują się w zapisie gry;** odczyt oznacza każdą wartość różną od domyślnej; istnieje komenda resetu. | Uzupełnia SB9. |
| **SB17** | **Skład puli jest wzorcem w tabeli strojenia;** domyślny proponuje CC z pomiaru szablonów (siła, zasięg, bak warp), właściciel zatwierdza. | Uzupełnia SB1 i SB9. |
| **SB18** | **W S1 kadłuby z puli są w służbie i ZADOKOWANE przy stolicy** (orbita to S2). Doktryn S1 nie zmienia; CC mierzy, co istniejące doktryny robią z kadłubami w służbie podczas wojny. | S2 (SB5) przenosi strażnika na orbitę. |
| **SB19** | **W S1 odczyt wywiadu „wolna załoga” zostaje zastąpiony odczytem floty / limitu.** | Finding **398** (§6). |
| **SB20** | **Domyślny skład puli: `frigate_system_defender`, potem trzy `frigate_missile_escort` — wzorzec D, E, E, E powtarzany do limitu** (limit 2 → D, E; 6 → D, E, E, E, D, E). Odpowiedź na pytanie 1 sesji 1 (§5c.5), **2026-10-07**. | Propozycja z pomiaru M1 (§5c.2). Klucz `fleetPoolPattern` tabeli strojenia — wyłącznie UZBROJONE szablony katalogu, 1–24 pozycji (§5d). |
| **SB21** | **Minimum 2 kadłubów z bakiem warp — także PONAD limitem:** pula dokłada brakujące eskorty z bakiem, nawet gdy limit jest pełny; 2 to wartość strojenia. **Zmienia SB14.** Odpowiedź na pytanie 2 (Finding **408**), **2026-10-07**. | Klucz `fleetMinWarpHulls` (domyślnie 2, zakres 0–100). Fixture `emp_001`: 6 defenderów przy limicie 6 → w wojnie +2 eskorty ponad limit, 8 w służbie (§5d) `[measured]`. |
| **SB22** | **Kadłuby puli rozwiązywane „wszystko zbadane”** — jak sonda pierwszego kontaktu (`DirectorFirstContact.js:113`), bez techu imperium. Odpowiedź na pytanie 3, **2026-10-07**. | §5d (`FleetPoolPlanner`). |
| **SB23** | **Transportowiec jest nieuzbrojony i poza limitem;** jego liczba i źródło rozstrzyga S3. Odpowiedź na pytanie 4, **2026-10-07**. | Predykat `isFleetLimitHull` (`hasWeapons`); wzorzec puli odrzuca szablony nieuzbrojone (§5d). |
| **SB24** | **Finding 407 leczony przy wczytaniu — w sesji 2, osobnym commitem.** Odpowiedź na pytanie 5, **2026-10-07**. | §5d (B1). |
| **SB25** | **Flota zachowuje własny klucz mnożnika szczebla** (`fleetRungMult`); progi szczebli wspólne z garnizonem (`garrisonTier`). Odpowiedź na pytanie 6, **2026-10-07**. | Stan S1-2 bez zmian. |
| **SB26** | **Reparacje wstrzymują tworzenie puli i odrastanie — zostaje tak, jak zbudowano** (pod reparacjami: nic, ślad audytu; po ich końcu — normalnie). Odpowiedź na pytanie 2 sesji 2 (§5d.8), **2026-10-08**. | Piny `sb1_fleet_pool_smoke` T6g, T12h; mobilizacja rezerwy w wojnie pod reparacjami — `sb1_war_reserve_smoke` R3 (§5e.5). |
| **SB27** | **Pula osiąga minimum kadłubów z bakiem w chwili UTWORZENIA, nie rok później:** limit 2 przy zerze kadłubów → D, E, E od razu. Odpowiedź na pytanie 3, **2026-10-08**. | ✅ `6b40c30` (S1-8, plan do skutku, §5e.4) — po zgodzie na przecelowanie R-B6 (§5f.1). |
| **SB28** | **Tabela strojenia odmawia wzorca bez szablonu z bakiem warp, gdy minimum z bakiem > 0 — i odwrotnej kolejności tych dwóch zmian.** Odpowiedź na pytanie 4, **2026-10-08**. | ✅ `8d13485` (S1-9): odmowa nazywa klucz do zmiany najpierw; także reset minimum (§5e.5). |
| **SB29** | **SB13 dosłownie: w wojnie guard parytetu nie hamuje.** Kadłub ukończony w wojnie, po mobilizacji, wchodzi do służby. Zamyka Finding **411**. Odpowiedź na pytanie 6, **2026-10-08**. | ✅ `5dc04d0` (S1-10): guard reguły `mobilize_reserve` przepuszcza imperium w wojnie ze zmobilizowaną pulą (§5e.5). |
| **SB30** | **Strażnik = uzbrojony kadłub W SŁUŻBIE BEZ baku warp** (dziś `frigate_system_defender`), **jeden na strzeżone ciało**; liczba strażników na ciało jest wartością strojenia (domyślnie 1). Podpis S2, **2026-10-08**. | ✅ `d3fc782` (§5f.3): `GuardPostPlanner.isGuardHull`; klucz `fleetGuardsPerBody` (0–10). |
| **SB31** | **Strażnicy mają WŁASNY roster w stanie doktryn, zapisywany w zapisie gry;** `patrol_border`, `defend_home` i pula uderzenia ich pomijają. **2026-10-08**. | ✅ `d3fc782`: `director.doctrine.<id>.guard`; `DirectorDoctrine.doctrineRoleOf` / `isGuard` / `setGuardRoster`; `DirectorOffensive.strikeReadyVessels`. |
| **SB32** | **Strzeżone ciała: stolica, potem najcenniejsze ciało W UKŁADZIE STOLICY poza stolicą, w porządku planera garnizonu;** drugie ciało dostaje strażnika WYŁĄCZNIE, gdy istnieje DRUGI kwalifikujący się kadłub. **Zmienia SB6.** Drugi strażnik pojawia się przy stolicy i LECI. **2026-10-08**. | ✅ `17c60f3`: `GuardPostPlanner.secondGuardBodyId`; lot rozkazem `moveToPoint` (ciało + punkt). |
| **SB33** | **Strażnicy obejmują stanowiska przy mobilizacji i zostają — także w pokoju.** UTRACONY strażnik jest zastępowany WYŁĄCZNIE na granicy roku kalendarzowego kwalifikującym się kadłubem zadokowanym przy stolicy; gdy takiego nie ma, stanowisko czeka (na odrastanie). **2026-10-08**. | ✅ `d3fc782` (stanowiska, kontrola miesięczna) + `0eaa105` (zastępstwo; stanowisko ciała, które przestało być strzeżone, rozwiązane). |
| **SB34** | **Dominacja orbitalna zostaje per UKŁAD.** **2026-10-08**. | Bez zmiany kodu: `WarSystem.hasOrbitalDominanceInSystem`; strażnik na orbicie odbiera ją jak każdy uzbrojony kadłub walczący w przestrzeni. |
| **SB35** | **Finding 406: bramka silnika w `dropTroop` (wersja (b) audytu S2), osobny commit.** **2026-10-08**. | ✅ `013fd75`. |
| **SB36** | **Rejestracja 414 i 415; 414 naprawiany w S2 osobnym commitem; 415 — wyłącznie raport.** **2026-10-08**. | ✅ `bf498d1` (414); §6. |
| **SB37** | **Strażnik zepchnięty ze stanowiska wraca na orbitę na granicy miesiąca** (po odwrocie, z doku, z innego ciała) — zostaje tak, jak zbudowano. Odpowiedź na pytanie 2 sesji 1 S2 (§5f.7), **2026-10-10**. | ✅ `d3fc782` (`FleetPoolSystem.stationGuards`, pętla powrotu; keeper `sb2_capital_guard_smoke` G4); bramka S2, kroki 19–21 (§5g.2). |
| **SB38** | **Przy obsadzaniu stanowisk pierwszeństwo ma stolica:** utracone stanowisko stolicy rezerwuje pierwszy kadłub-strażnik z doku, drugie ciało dostaje kadłub dopiero, gdy jest kolejny — zostaje tak, jak zbudowano. Odpowiedź na pytanie 3, **2026-10-10**. | ✅ `0eaa105` (`_pickGuardHull` z parametrem `skip`, rezerwa w `stationGuards`; keeper `sb2_guard_replacement_smoke`). |
| **SB39** | **Finding 416 naprawiony przed S3:** lot do ciała przylatuje WTEDY i TAM, gdzie ciało — bez spóźnienia wobec pokazanego ETA i bez przeskoku. Dotyczy rozkazu `moveToPoint`, wznowienia misji po bitwie i pościgu `engage` za celem zadokowanym albo na orbicie (pościg idzie za ruchem ciała). **2026-10-10**. | ✅ `a8de641` (S2b-1, §5h.2, §5i.1). |
| **SB40** | **Finding 417:** wrak nigdy się nie rusza, nigdy nie wznawia misji, nigdy nie dokuje. **2026-10-10**. | ✅ `bf634c1` (S2b-2, §5h.2, §5i.1). |
| **SB41** | **Finding 418:** jednostki naziemne w ładowni giną, gdy statek staje się wrakiem — z tym samym rozliczeniem co każda śmierć jednostki; `dropTroop` odmawia wrakowi; otwarty tryb zrzutu nad wrakiem się zamyka. **2026-10-10**. | ✅ `35cdebe` (S2b-3, §5h.2, §5i.1). |
| **SB42** | **Finding 419:** każde starcie ma unikalny identyfikator; żaden statek nie zostaje zamrożony po końcu swojego starcia. **2026-10-10**. | ✅ `e2f3285` (S2b-4, §5h.2, §5i.1); bliźniak na ścieżce wycofania (424) — `5043744` (SB47). |
| **SB43** | **Finding 415:** pierścień ruchu rysowany wyłącznie dla statku z oglądanego układu, a dla statku spoza floty gracza — tylko gdy wykrycie gracza go pokazuje. **2026-10-10**. | ✅ `d833e0c` (S2b-5, §5h.2, §5i.1). |
| **SB44** | **Finding 151 NIE w tym slice'ie** — rozstrzygany w S3 razem z ostrzeżeniem o nadlatującej flocie. **2026-10-10**. | Kod nietknięty (§5h.2). |
| **SB45** | **Finding 420 (synchronizacja przylotu floty liczona z przechwyceń członków) robiony w S3**, w commicie, w którym eskadra AI przylatuje razem; **jeden pomocnik** dla flot gracza i dla eskadry AI. Odpowiedź na pytanie 2 (§5h.5), **2026-10-11**. | → S3 (§3, §5i.5). |
| **SB46** | **Finding 421 — wyłącznie kierunek:** uzbrojony statek w starciu, który nie ma wroga w zasięgu własnej broni, zbliża się na ten zasięg, zamiast stać tam, gdzie starcie się zaczęło; **strażnik dalej trzyma orbitę**. Kształt podpisywany po pomiarze części E; kod — **pierwszy commit S3**. Odpowiedź na pytanie 3, **2026-10-11**. | Bramka S2b, krok 13: fregata z `engage` skończyła jako wrak 0,108 AU od strażnika, poza zasięgiem lasera 0,05 AU (§5i.2). Pomiar części E — poza repo (§5i.5). |
| **SB47** | **Findingi 424 i 425 naprawione teraz, na dowodzie bez przeglądarki, po jednym commicie; 422 i 423 zostają w rejestrze — wyłącznie raport, do zamknięcia arca.** Odpowiedź na pytanie 4, **2026-10-11**. | ✅ `5043744` (424) · `7b37a4d` (425) (§5i.1). |
| **SB48** | **Wrak na orbicie cmentarnej ciała dalej jedzie z ciałem — zostaje.** Odpowiedź na pytanie 5, **2026-10-11**. | Keeper `sb2b_wreck_still_smoke` T5 (KONTROLA) bez zmian. |
| **SB49** | **Finding 421, kształt O2E:** przed każdą rundą starcia uzbrojony statek, który nie ma wroga w zasięgu własnej broni, zbliża się do celu (cel `engage`, dopóki żyje, inaczej najbliższy wróg) na **0,95 × najdłuższy zasięg własnej broni**; krok na ZEGARZE STARCIA. Statek trzymający orbitę ciała stoi; uciekający — pomijany. Obie strony. Pierwszy commit S3. **2026-10-11**. | Przygotowany S3-1 (§5j.2): `DeepSpaceCombatSystem._closeToWeaponRange`; część E na kodzie S3 — scena (a): strzały gracza **94** (na `2a09ac9` 0), strażnik zniszczony 4/10 (§5j.3). |
| **SB50** | **„Przypięcie” (kadłub AI w ataku przenoszony na ciało, którego orbitę trzymają statki gracza) zostaje w S3 tak, jak zbudowano;** rejestrowane jako finding. **2026-10-11**. | Finding **426** (§6). |
| **SB51** | **Transportowiec tworzony na żądanie dla każdej fali przy stolicy AI funkcją tworzenia puli** (`transport_assault`, „wszystko zbadane”), poza limitem floty; jeden transportowiec na falę. **2026-10-11**. | Przygotowany S3-3 (§5j.2): `StrikeSquadronSystem.launchSquadron` → `VesselManager.createAIVessel` (pochodzenie `squadron`). |
| **SB52** | **Prawdziwy ładunek:** jednostki fali tworzone przy stolicy (`createAIUnit`, skład i morale szczebla imperium) jako NOWE, nie z garnizonu, i ładowane. Desant ląduje dokładnie to, co jest na pokładzie, i nic przy pustej ładowni. Zestrzelony transportowiec zabiera swoje jednostki. **2026-10-11**. | Przygotowany S3-3: `InvasionSystem._landCargo` (`dropTroop`); Findingi **396**, **384** (§6). |
| **SB53** | **Wielkość fali = ⌊limit garnizonu × udział⌋, obcięta do ładowni transportowca;** udział to klucz strojenia, domyślnie 0,5 (fixture: 6). **2026-10-11**. | Przygotowany S3-3: `StrikeWavePlanner`, klucz `strikeWaveShare` (typ `number`, 0–1); fixture `emp_001`: limit 13 → 6 (S, S, A, S, S, A; ładownia 10/32) `[measured]`. |
| **SB54** | **Lot razem:** eskadra ma JEDEN punkt przylotu po skoku i JEDNĄ chwilę przylotu do celu, ustalaną przez najwolniejszego członka; transportowiec nigdy nie przylatuje przed eskortą. Ten sam pomocnik obsługuje floty gracza (SB45). Prędkości statków, silniki i okrąg przylotu 30 AU — bez zmian. **2026-10-11**. | Przygotowany S3-2: `GroupArrival.groupArrivalYear`, `OrderService.issueGroupAttack`, `FleetSystem._bodyGroupArrival`; Finding **420**. |
| **SB55** | **Desant wyłącznie wtedy, gdy imperium eskadry trzyma orbitę i transportowiec żyje. Jedna fala na próbę.** **2026-10-11**. | Przygotowany S3-3: bramka dominacji `_onVesselGroupVictory` bez zmian; `dropTroop` (wrak, wojna, dominacja). |
| **SB56** | **Wielkość eskadry:** mnożnik `requiredSquadron` **1,0** (było 1,5), sufit **3**; oba jako klucze strojenia. **2026-10-11**. | → **S3, sesja 2** (nie kodowane w sesji 1). |
| **SB57** | **Odbijanie:** cel = ciało, które gracz przejął w BIEŻĄCEJ wojnie (księga); najpierw utracona stolica, potem porządek planera garnizonu; NOWA reguła Directora na wspólnych częściach reguły uderzenia; strażnicy wyłączeni; jedna próba na ciało na cooldown (klucz strojenia, domyślnie 5 lat); nic po pokoju. **2026-10-11**. | → **S3, sesja 2**. |
| **SB58** | **Po desancie eskorta trzyma orbitę celu, aż walka naziemna się rozstrzygnie;** potem dotychczasowe odwołanie sprowadza ją do domu. **2026-10-11**. | → **S3, sesja 2**. Dziś odwołanie (`DirectorRecall`) zabiera eskortę zaraz po desancie (M5, §5j.3). |
| **SB59** | **Ostrzeżenie:** naprawa Findingu **151** i tej samej klasy w `ObservatorySystem`; jeden wpis dzwonka przy pierwszym wykryciu uzbrojonego wrogiego kadłuba w układzie, w którym gracz ma kolonię (nowy klucz PL + EN). **2026-10-11**. | → **S3, sesja 2**; Finding **427** (§6). |
| **SB60** | **Balans obrony naziemnej nie należy do S3.** Siedmiu kandydatów z notatki przekazania zamknięcia S2b (`HANDOVER_S2B_CLOSED.md` §9.3) rejestrowanych od **426**, w podanej kolejności. **2026-10-11**. | Findingi **426–432** (§6). |
| **SB61** | **Zbliżenie (SB49) dotyczy statku ZAMROŻONEGO w miejscu startu starcia; statek, który dostał rozkaz ruchu w trakcie starcia, wykonuje rozkaz** — zostaje tak, jak zbudowano. Odpowiedź na pytanie 2 sesji 1 S3 (§5j.5), **2026-10-12**. | ✅ `1cf1d24` (S3-1): `_closeToWeaponRange` pomija statek `in_transit` (§5j.2). |
| **SB62** | **Flota GRACZA po bitwie w locie wznawia lot osobno — zostaje;** rejestrowane jako finding, wyłącznie raport. Odpowiedź na pytanie 3, **2026-10-12**. | Finding **437** (§6). |
| **SB63** | **Zmienia SB58:** po desancie transportowiec zostaje z eskortą nad celem, aż walka naziemna się rozstrzygnie; potem wszyscy wracają do stolicy istniejącym odwołaniem; transportowiec jest usuwany, gdy zadokuje przy stolicy. Zamyka Finding **434**. Odpowiedź na pytanie 4, **2026-10-12**. | → **S3, sesja 2**. |
| **SB64** | **Desant ląduje na CELU eskadry** — ciele, nad którym wygrano orbitę — nie „najpierw dom”. Odpowiedź na pytanie 5, **2026-10-12**. | → **S3, sesja 2**. |
| **SB65** | **Finding 55 (`no_grid`):** zmierzony w sesji 2 S3 dla celu odbijania; naprawa w S4. Odpowiedź na pytanie 6, **2026-10-12**. | → **S3, sesja 2** (pomiar); **S4** (naprawa). |
| **SB66** | **Finding 435:** transportowiec, który stracił całą eskortę, zawraca do stolicy, a eskadra jest przerywana; reguły bitwy planetarnej bez zmian. Odpowiedź na pytanie 7, **2026-10-12**. | → **S3, sesja 2**. |
| **SB67** | **Czas rundy starcia staje się kluczem strojenia (domyślnie dzisiejsza wartość) WYŁĄCZNIE, jeśli pomiar pokaże, że wyniki bitew od niego nie zależą.** Słowa właściciela z bramki: „walki odbywają się zbyt szybko albo czas mamy ustawiony zły do bitew” (bitwa rozstrzygnięta w ok. pół sekundy). **2026-10-12**. | → **S3, sesja 2** (pomiar najpierw); Finding **436** (§6). |

---

## 3. Plan

Estymaty i keepery zagrożone — z audytu fazy A (P6), przeniesione na slice'y podpisane. ⚠ Podpis przesunął **K3/K4**
(393, 394) z audytowego S2 (strażnik) do **S0**, więc S0 dziedziczy też keepery dominacji z audytowego S2. Kalibracja
estymat: arc AI GARRISON — 67 commitów, 9 bramek w przeglądarce, ~13 pod-slice'ów w pięć dni ⇒ ~2–3 pod-slice'y
dziennie `[doc: audyt fazy A, P6]`.

| slice | zawartość | findingi / decyzje | estymata | keepery zagrożone (audyt P6) | bramka |
|---|---|---|---|---|---|
| **S0** | trzy defekty: zaległość gracza blokuje kadłuby AI · martwy guard załogi AI i pobór POP na załogę AI · dominację odbierają wyłącznie kadłuby, z którymi da się walczyć (obie strony predykatu) | **391** · **392** · **393** · **394** · SB2 · SB4 · SB5 | 1 dzień — ✅ zamknięty 2026-10-06 (§5b) | `fleet_upkeep_imperial`, `w2_deploy_ui`, `w2_reserve_upkeep`, `w2_ai_mobilization`, `director_*` (6); z audytowego S2: `w3_dominance_persist`, `g2_peace_followups`, `combat_system_scope` | tak — **PASS 2026-10-06** (§5a): z 6 kadłubów `emp_001` w służbę weszły **2** (`v_24`, `v_25`), **4** zatrzymał parytet (`empireOutgunnedByPlayer`, 1 314 > 618) |
| **S1** | tabela strojenia + komenda konsoli + odczyt (SB9, SB16) · limit floty (SB3, SB14) · pula: kadłuby przy mobilizacji, w służbie i zadokowane przy stolicy, odrastanie 1 kadłub/rok, bez załogi (SB1, SB2, SB15, SB17, SB18) · mobilizacja wojenna całej rezerwy (SB13) · odczyt floty / limitu w wywiadzie (SB19). ⓘ Kandydat 9 notatki przekazania S0 (parytet zatrzymuje mobilizację po pierwszej porcji — 4 z 6 fregat GATE-S4 zostaje w rezerwie) NIE jest findingiem: odpowiada na niego SB13. | SB1 · SB2 · SB3 · SB9 · SB13–SB25 · 398 · 407 · 408 | 2–3 dni | Director 6–10; `deploy_seams`, `w2_deploy_model` | tak — ✅ **PASS 2026-10-08** (§5e.3). Sesja 1 ✅ 2026-10-07 (§5c): tabela strojenia i limit floty bez bramki (nic w grze ich nie czyta); jednolinijkowce części „tabela” zwalidowane w prawdziwej grze na fixture · Sesja 2 (§5d): scenariusz całego S1 (`GATE_S1.md`, poza repo) zwalidowany w prawdziwej grze na kodzie sesji i na kontroli `45ee9d2`; bramka właściciela po zgodzie na przecelowania |
| **S2** | strażnik na orbicie stolicy i drugiego ciała; strażnik drugiego ciała leci ze stolicy (SB5, SB6). ⓘ Kandydat 10 notatki przekazania S0 (zmobilizowani strażnicy stoją w doku, więc od S0-3 nie bronią orbity) NIE jest findingiem: odpowiada na niego S2. | SB5 · SB6 | 1–2 dni | `war_doctrine` (keepery dominacji z audytowego S2 przecelował S0: R3/R4, `cf2a598`) | tak |
| **S2b** | poprawki przed S3: lot do ciała przylatuje wtedy i tam, gdzie ciało (416) · wrak się nie rusza i nie wznawia misji (417) · jednostki w ładowni giną z wrakiem (418) · unikalny identyfikator starcia (419) i bitwy ścieżki natychmiastowej (424) · pierścień ruchu wyłącznie z oglądanego układu (415) · wrak nie wychodzi na misję z orbity (425) | **415–419** · **424** · **425** · SB39–SB43 · SB47 · SB48 | 1 dzień — ✅ zamknięty 2026-10-11 (§5i) | żaden istniejący keeper nie przecelowany ani nie zmieniony | tak — **PASS 2026-10-11** (§5i.2) |
| **S3** | eskadra z transportowcem · desant po wygranej orbicie · odbijanie · fale (SB7, SB8, reguły SB11). Sesja 1 (2026-10-11/12, §5j, §5k): zbliżenie w starciu, lot razem, transportowiec z ładunkiem — ✅ zacommitowane 2026-10-12 (`1cf1d24` · `ee44424` · `c97b73b`); sesja 2: SB56–SB59, SB63–SB67 | **421** (SB46, SB49 — pierwszy commit) · **420** (SB45, SB54) · **396** · 384 · SB51–SB55 · 344 · 55 · SB7 · SB8 · SB11 | 3–4 dni | z listy audytu czerwone na kodzie sesji 1 wyłącznie `w3_ai_invasion`, `ai_capture_outpost`; ponadto `sb0_fleet_defects`, `sb1_fleet_tuning`, `sb1_pool_warp_minimum` — przecelowanie R-S3 (zgoda 2026-10-12, w `c97b73b`; §5j.2); `g2b_invasion`, `battle_announce_once`, `g2_war_gate` zielone `[measured]` | tak — sesja 1: **PASS 2026-10-12** (§5k.2) |
| **S4** | wojna z inicjatywy AI · kampania układ po układzie (SB10, reguły SB11) | SB10 · SB11 | 2–3 dni | `director_pressure` (napięcie), `wp_truce_gate`, `wp_nap_expiry`, `wp_peace_seams` | tak |

Razem **~9–13 dni** (wariant puli, P1-A) — estymata uzgodniona z właścicielem 2026-10-06 (S3 3–4, S4 2–3).
ⓘ Audyt fazy A (P6) liczył S3 2–3 dni, S4 2 dni, razem ~8–11 `[doc: audyt fazy A, P6]`.

⚠ **Keepery S0 — pomiar sesji S0 (2026-10-06, klon poza repo), nie lista z audytu:** podpisane S0-2 i dosłowne
„wyłącznie” S0-3 przewracają cztery ISTNIEJĄCE piny, które mierzą stare zachowanie: `deploy_seams` T4 (kadłub z kolonii
AI płaci załogę), `w2_ai_mobilization` T4 (guard załogowy stoi w regule), `w3_dominance_persist` T3 i `w3_ai_invasion` T2
(sam kontroler bitwy odbiera dominację, bez kadłuba do walki). Z listy audytu `fleet_upkeep_imperial`, `w2_deploy_ui`
i `w2_reserve_upkeep` zostają zielone `[measured]`. Przecelowane za zgodą właściciela 2026-10-06: R1/R2 w `e73c890`,
R3/R4 w `cf2a598` (§5b).

---

## 4. Otwarte pytania do audytu S3 (zapisane przy podpisie, 2026-10-06)

1. **Transportowiec wyprzedza eskortę:** 42,9 wobec 6,6 AU/rok — przylatuje sam i walczy sam (notatka
   `ShipTemplateData.js:210-215`, „do rozstrzygnięcia przy doktrynie”); w pomiarze D4 ginie w pierwszej bitwie, więc desantu
   nie ma `[doc: audyt fazy A, C5]`. SB7 wymaga lotu razem z eskortą.
2. **Co detekcja gracza pokazuje z tranzytu międzyukładowego i przylotu** — SB7 każe pokazywać lot „według ISTNIEJĄCYCH
   reguł detekcji”; audyt fazy A nie czytał UI wywiadu o flocie AI ani pełnego `IntelSystem` (granice raportu).
3. **Czy zadokowane okręty wojenne gracza bronią kolonii, gdy przylatuje eskadra AI.** Dziś zależy od ścieżki: przylot
   z misją `attack` uruchamia bitwę `EnemyAttackHandler`, a jej obrońca (`WarSystem._buildPlayerBattleUnit` →
   `_playerVesselsInSystem`, `WarSystem.js:762-766`) bierze okręty gracza w służbie **bez względu na dok**; warstwa walki
   w przestrzeni (Proximity + DSCS) zadokowanych nie widzi wcale `[code]`. S0-3 dotyka tego pytania od strony predykatu
   dominacji — wynik i skutki dla zadokowanych okrętów gracza opisze zamknięcie S0.
   **Zamknięcie S0 (2026-10-06):** po stronie AI zadokowany (albo rezerwowy) okręt gracza nie odbiera już dominacji
   imperium (lustro 394); dziś bez skutku — jedyny czytelnik po stronie AI (`InvasionSystem._onVesselGroupVictory`)
   biegnie po wygranej AI, gdy kontrolerem jest już imperium `[code]`. Właściciel zna to lustro (odpowiedź na Q2, §5b).

---

## 5. S0 — zakres podpisany (2026-10-06)

| | zakres | finding |
|---|---|---|
| **S0-1** | `deployVessel` i każda bliźniacza bramka **nigdy** nie odmawia statkowi z powodu zaległości floty INNEGO właściciela. Imperium AI utrzymania nie płaci i nigdy nie zalega. Wszystkie miejsca, w których zaległość gracza zatrzymuje statek nie-gracza — także kuriera. | **391** |
| **S0-2** | Guard wolnych POP przy mobilizacji rezerwy jest dla AI martwy (wolne POP są tam zawsze 0). Załoga AI nie pobiera POP (SB2): **guard i każdy pobór załogi są pomijane dla kadłubów AI.** Zachowanie gracza bez zmian. | **392** |
| **S0-3** | Dominację orbitalną nad ciałem odbierają **wyłącznie** wrogie kadłuby, z którymi da się tam walczyć: w locie albo na orbicie w tym układzie. Kadłuby zadokowane albo w rezerwie jej nie odbierają. Komunikat każący graczowi najpierw wygrać bitwę pojawia się **tylko**, gdy taki kadłub istnieje. Ta sama reguła po stronie AI predykatu — z raportem, co zmienia dla zadokowanych okrętów gracza. | **393** · **394** |

**Poza zakresem S0 (tylko raport):** pula, limit, stanowisko strażnika, jakakolwiek zmiana reguł produkcji, sam DSCS,
los zadokowanych kadłubów przy przejęciu kolonii.

### 5a. Bramka S0 — zapis (2026-10-06, właściciel, przeglądarka)

Fixture `GATE-S4-fresh-gy60`, kod = drzewo `5d406b7` (zestagowane S0-1 + S0-2 + S0-3a+b, bez przecelowań). Scenariusz
i walidacja jednolinijkowców na żywym silniku headless: `kosmos-handover/ai-strikes-back-s0/gate/GATE_S0.md`,
`results/gate_validation_{after,before}.txt` (poza repo). Odczyty właściciela dosłownie:

| krok | odczyt |
|---|---|
| 0 | `{stolica:'entity_115', układ:'sys_059', długFlotyGracza:true, status:'peace', graczSilniejszy:true, rok:60.14}` |
| 1 | `v_24` Orzeł, `v_25` Wilk, `v_26` Żmija, `v_27` Sztylet, `v_28` Klinga, `v_29` Burza: wszystkie stored / docked / `entity_115` / załoga 0 |
| 2 | reguła: attempts 9, lastFiredYear 57.43244093086821, firedOnce true · rok 60.27: attempts 9, wszystkie sześć stored · rok 60.45: attempts 10, `v_24` i `v_25` mobilizing/docked/0, cztery stored, długFlotyGracza true; wpis w dzwonku się pojawił, właściciel potwierdza oczekiwany tekst z pamięci (zamknięty przed skopiowaniem) · rok 60.63: `v_24` i `v_25` active/docked/0, cztery stored, attempts 10. Krok 2b nieużyty |
| 3a | `'war'` |
| 3b | `{v:'v_30', u:'gu_14', capId:'entity_115', sys:'sys_059', zrzut:true}` |
| 3c | `{dominacja:true, naOrbicieAI:10}` — dziesięć to nieuzbrojone frachtowce `emp_001`, active/in_transit, moduły `engine_ion,cargo_small`: v_1 v_2 v_3 v_4 v_9 v_10 v_11 v_12 v_13 v_14. **WADA SCENARIUSZA:** licznik kroku nie ma filtra uzbrojenia; predykat jest poprawny |
| 3d | mapa stolicy otwarta (właściciel potwierdza); stos dotarł do `ColonyOverlay.js:347`; jedyny czerwony wpis: 404 `ocean_01_biome.png` (znany) |
| 4a | `{h:'v_24', służba:'active', stan:'orbiting', dominacja:false}` |
| 4b | przebieg 1: mapa z kroku 3d nadal otwarta; brak komunikatu · przebieg 2: `{dominacja:false, zrzut:true}`; właściciel: nic się nie pojawiło (nie podał, czy mapa była zamknięta przed przebiegiem) |
| dodatkowo | prawdziwa ścieżka UI: panel statku `v_30` pokazuje "no orbital dominance", "no own station in orbit", "no active mission"; przycisk zrzutu jest wyszarzony i nie da się go kliknąć |
| 4c | `true`; wiersz "no orbital dominance" zniknął z panelu statku |
| 5 | `{kontroler:'emp_001', dominacja:true}` |

**WERDYKT: PASS.** Kryteria 1 i 2 — jak w scenariuszu. Kryterium 3: odmowę i jej powód pokazują panel statku i wyszarzony
przycisk, nie flash. Kryterium 4: jedyny czerwony wpis we wklejonym wyjściu właściciela to znany 404.
Obserwacje z bramki → Findingi **405** (flash `drop.noDominance` w praktyce niewidoczny) i **406** (otwarty tryb zrzutu
zrzuca także po utracie dominacji), §6.

### 5b. Wynik S0 (2026-10-06)

| commit | treść | drzewo |
|---|---|---|
| `9c73023` | S0-1 (**391**): `deployVessel` pyta o zaległość floty wyłącznie przy statku gracza | `0c50e5c` |
| `e73c890` | S0-2 (**392**, SB2): załoga AI bez POP, guard `empireHasFreeCrew` zdjęty z `mobilize_reserve` + przecelowanie R1/R2 | `54f09e2` |
| `cf2a598` | S0-3a+b (**393**, **394**): NEW `isFightableInSpace` (`Vessel.js`), `WarSystem.hasOrbitalDominanceInSystem` — jedna reguła dla obu stron, także bramka desantu AI; kontroler innej strony sam nie zamyka orbity + przecelowanie R3/R4 | `12e0c5d` |
| `eb6c06e` | trzy poprawki wyłącznie tekstowe (**397**, **399**, **402**) | `bbc10d3` |

Odpowiedzi właściciela (2026-10-06): Q1 — TAK, przecelowanie R1 i R2; Q2 — TAK, S0-3b z przecelowaniem R3 i R4 (tryb
`all`), z wiedzą o lustrze po stronie gracza (zapamiętana kontrola gracza nie blokuje desantu AI, gdy okręty gracza stoją
w doku; dziś bez skutku — pytanie 3 w §4). Keeper NEW `sb0_fleet_defects_smoke` 60/60 (fail-first na bazie każdego commitu, PASS/FAIL:
8/6 · 21/9 · 45/15 `[measured]`). Przecelowane: `w2_ai_mobilization` T4 (R1), `deploy_seams` T4 (R2),
`w3_dominance_persist` T3 (R3), `w3_ai_invasion` T2 (R4); `w2_ai_mobilization` T7 — tylko tekst asercji. Sweep
**264/264 OK, 0 FAIL, 31 advisory** po każdym commicie, `check-i18n` PASS, pl = en = 3455, save v101 bez migracji
`[measured]`. Pomiar przed/po: uprząż C1 — odmowy `courier_deploy_refused` 4 392–4 498 → 0 na imperium; pięć scen C4 —
dominacja przy strażniku zadokowanym albo w rezerwie `false` → `true` `[measured]`. Sondy, łańcuch commitów i wyniki:
`kosmos-handover/ai-strikes-back-s0/` (poza repo).

### 5c. S1 — sesja 1 z 2 (2026-10-07): tabela strojenia i limit floty

Zakres sesji (polecenie właściciela): audyt (część A), dwa pomiary — **M1** szablony okrętów (SB17) i **M2** co istniejące
doktryny robią z kadłubami w służbie podczas wojny (SB18) — oraz kod: tabela strojenia z komendami konsoli (SB9, SB16)
i limit floty (SB3, SB14). **Poza zakresem tej sesji:** pula i odrastanie (SB1, SB15), kod SB13, odczyt SB19, stanowisko
strażnika, reguły doktryn i produkcji, Findingi 405 i 406. Save **v101 bez migracji** (odpowiedź właściciela na pytanie
otwarte S0). Sondy, wyniki, łatki, łańcuch commitów i notatka przekazania: `kosmos-handover/ai-strikes-back-s1/` (poza repo).

| commit | treść | drzewo |
|---|---|---|
| `eb17f97` | S1-1 (SB9, SB16): NEW `src/data/StrikesBackData.js` — jedna tabela liczb arca (wartość domyślna, typ, zakres); NEW `src/utils/StrikesBackTuning.js` — odczyt W CHWILI UŻYCIA, zmiana z walidacją (nieznany klucz, zły typ, poza zakresem ⇒ odmowa z listą kluczy albo zakresem, nic się nie zmienia), reset jednego klucza i całej tabeli, sprzątanie po wczytaniu; klucz `gameState.strikesBackTuning` (wartości zmienione z konsoli jadą w zapisie, brak klucza = wartości domyślne); `KOSMOS.debug.sbTuning()` / `sbSet(klucz, wartość)` / `sbReset(klucz?)`; `sbTuning:storedValueIgnored` w `DebugLog.TRACKED_EVENTS` | `eb5c365` |
| `8abe84d` | S1-2 (SB3, SB14): NEW `src/utils/FleetLimit.js` — limit = floor(max(min, floor(POP / POP na kadłub)) × mnożnik szczebla), POP i fabryki z `readEmpireGarrisonSnapshot`, szczebel z `garrisonTier`, zaokrąglenie jak `garrisonLimit`; odczyt per imperium (POP, fabryki, szczebel, mnożnik, limit, uzbrojone wg służby i położenia, miejsce dla puli); NEW `isFleetLimitHull` (`Vessel.js`) — jeden predykat kadłuba liczonego do limitu (`hasWeapons`, nie wrak, to imperium, każdy stan służby i położenia); `sbTuning()` drukuje też limit floty | `7c007db` |

**Weryfikacja** `[measured]`: keeper NEW `sb1_fleet_tuning_smoke` **71/71** (fail-first: część C1 na `825f541` — 4 PASS,
wyłącznie kontrole i świadek, 45 FAIL; część C2 na `eb17f97` — 52 / 19); sweep **265/265 OK, 0 FAIL, 31 advisory** po
każdym commicie; `check-i18n` PASS, pl = en = 3455, wyjście identyczne z bazą poza numerami linii 13 dynamicznych `t()`
w `GameScene` (+12); uprząż audytu C1 (ziarna `default` i `987654321` × passive / press / pressPaid, 100 gy) identyczna
bajt w bajt przed i po każdym commicie — a wynik „przed” jest identyczny z wynikiem „po” sesji S0 (przyrząd powtarzalny
między sesjami); scenariusz M2 na fixture w prawdziwej grze identyczny przed i po (poza szumem zegara startu ≤ 0,00014
roku). Drzewa commitów = drzewa łańcucha zbudowanego w klonie poza repo. EOL: `GameState.js` (189 → 193), `DebugLog.js`
(201 → 204) i `Vessel.js` (925 → 939) zostają CRLF (CR = LF); numstat bez przewróconych plików.

**Fixture GATE-S4 (gy 60) — limit floty** `[measured]`: `emp_001` — POP 185, suma poziomów fabryk 20 (szczebel 3, ×1,25) →
limit **6**, uzbrojonych **6** (wszystkie w rezerwie, w doku), miejsce dla puli **0**; `emp_002` — POP 178, fabryki 20 →
limit **6**, uzbrojonych **0**, miejsce **6**. Odczyt prawdziwej gry = odczyt statyczny zapisu.

#### 5c.1 Audyt (część A) — odczyt kodu na `825f541`

| pytanie | odpowiedź `[code]` |
|---|---|
| limit garnizonu: źródło POP | `readEmpireGarrisonSnapshot` (`GarrisonPlanner.js:331-346`): kolonie z `ownerEmpireId === imperium` (`:332-333`); POP = Σ floor(populacji) PEŁNYCH kolonii (`:337`); fabryki = Σ poziomów budynku `factory` we WSZYSTKICH jego koloniach (`:308-315`, `:338`); stolica z `capitalOf`, z terminem właściciela (`:334`, `:339`) |
| szczebel, mnożnik | `garrisonTier` (`:58-69`) — najwyższy wiersz `GARRISON_LADDER` z progiem ≤ sumy fabryk (`GarrisonData.js:32-37`: progi 0 / 6 / 14 / 20, `limitMult` 1 / 1 / 1 / 1,25) |
| zaokrąglenie | `garrisonBaseLimit` (`:49-51`) = max(2, floor(floor(POP) / 16)); `garrisonLimit` (`:76-78`) = floor(baza × mnożnik) — floor PO klamrze (`:18-22`) |
| zaczep mobilizacji i trzy wejścia | `GarrisonSystem`: `diplomacy:warDeclared` → `mobilizeEmpire(…, 'war_declared')` (`:81`, `:84`); zapis wczytany w wojnie → pierwszy tick → `reconcile` → `'reconcile_at_war'` (`:356-379`); kontrola roczna → `'reconcile_yearly'` (`:293-299`); raz na imperium (`isMobilized`, `:113-115`) |
| flaga w zapisie | `gameState.empires.<id>.garrison` — `EmpireRegistry.markGarrisonMobilized` (`EmpireRegistry.js:191-193`), `setGarrisonRegrowthYear` (`:205-208`); `empires` zadeklarowany w `createDefaultState` (`GameState.js:22`); zapis `SaveSystem.js:222`, wczytanie `GameScene.js:2146` |
| kadłub AI: tworzenie | jedyna ścieżka produkcyjna: `VesselManager._onShipCompleted` (`:1797-1808`) → `createAndRegister(…, { serviceState: 'stored' })` (`:193-216`) → `createVessel` (`Vessel.js:92`; bak warp przy narodzinach pusty, `:124-126`; `serviceState` z opcji, `:303`) → `vessel:created` → `DirectorProduction._claimVessel` (`:218-250`) stempluje `ownerEmpireId` / `owner` / `isEnemy` i `directorOrigin` |
| kadłub AI: zapis, wczytanie | białe listy `VesselManager.serialize` (właściciel `:1491-1494`, bak `:1468`, `serviceState` `:1556`) i `restore` (`:1629-1633`, `:1601`, `:1693`) |
| test uzbrojenia | `hasWeapons` (`Vessel.js:548-555`) — dowolny moduł `slotType 'weapon'`; właściciel: `ThreatAssessment._ownerOf` (`:169-172` — najpierw `isEnemyVessel`) i idiom Directora `(v.ownerEmpireId ?? v.owner) === empireId` |
| `mobilize_reserve` i parytet | `DirectorRuleData.js:214-225`: wyzwalacz `storedWarshipsAtCapital ≥ 1`, guardy `empireOutgunnedByPlayer` (`getStrength(gracz) > getStrength(imperium)`, `DirectorMobilization.js:85-89`) i `empireNotUnderReparations`; rzut 40 / 30 / 100; cooldown 3 l.; porcja 2. Sonda bierze wyłącznie kadłuby w rezerwie ZADOKOWANE przy stolicy (`:50-67`); akcja `mobilizeVessels` (`:102-152`) — bramka reparacji (`:115-118`), `deployVessel` (`:123-128`) |
| doktryny i ich guardy | `doctrine_defend_home` (`DirectorRuleData.js:153-160`: ≥ 1 bezczynny, guard `empireHasIdleWarships`, porcja 2, cooldown 3) — kadłub w doku stolicy dostaje rolę BEZ rozkazu (`DirectorDoctrine.js:136-139`); `doctrine_patrol_border` (`:173-180`: ≥ 3, porcja 1, cooldown 4) — `moveToPoint` do zewnętrznej planety WŁASNEGO układu (`:167-181`, `:285-310`). „Bezczynny” = uzbrojony, w służbie, w doku stolicy, bez misji, rozkazu i roli (`:251-279`) — kadłub z rolą nie wraca do puli |
| inne reguły na kadłubach w służbie | `strike_player_target` (`DirectorRuleData.js:249-258`): guardy `empireAtWarWithPlayer`, `empireHasStrikeForce` — pula: uzbrojony, w służbie, `warpFuel.max > 0`, w domu, wolny (`DirectorOffensive.js:121-149`); `recall_strike_force` (`:286-292`, bez guardu); produkcja L1 / L2 — guard `empireNotAtWarWithPlayer` (`:106`, `:134`) |
| opcjonalny klucz w zapisie v101 | `GameState.restore` przepuszcza WYŁĄCZNIE klucze zadeklarowane w `createDefaultState` (`GameState.js:146-157`) ⇒ nowy klucz najwyższego poziomu z pustą wartością domyślną przeżywa zapis i wczytanie bez migracji (precedensy: `orbitalDominance` `1e57d1b`, `director` `31bd81b`); `SaveMigration.CURRENT_VERSION` = 101 (`SaveMigration.js:28`) |
| odczyt „wolna załoga” (SB19 — sesja 2) | `IntelOverlay.js:296-300` → `t('intel.crewCapacity', knownCrewCapacity)` (`pl.js:3615`, `en.js:3614`); wartość z `IntelSystem._reserveReadout` (`:272-288`) = `freePops` stolicy AI; odświeżana w `advanceIntel` (`:155`) i `_refreshKnownMilitary` (`:255-258`) |

#### 5c.2 M1 — szablony okrętów AI (SB17)

Prawdziwy resolver (`resolveTemplate`), prawdziwa fabryka statku (`createVessel`, `calcShipStats`), siła miernikiem audytu
fazy A (`vesselCombatValue` = `ThreatAssessment.valueOfVessel`). **KONTROLA miernika:** 432 / 312 / 242 / 183 jak w audycie
C3 ✓. Rozwiązanie szablonu „wszystko zbadane” (tak robi `DirectorFirstContact.js:113`) i techem imperiów z fixture'u
`[measured]`:

| szablon | kadłub · moduły | uzbrojony (`hasWeapons`) | siła · HP · obrażenia · zasięg broni | AU/rok | bak warp | opuści układ | tech fixture `emp_001` / `emp_002` | kto zamawia dziś `[code]` |
|---|---|---|---|---|---|---|---|---|
| `frigate_system_defender` | `hull_frigate` · `engine_warp`, `armor_heavy`, 2 × `weapon_missile` | tak | **432** · 120 · 24 · 0,30 AU | 5,76 | 0 | **nie** | OK / OK | nacisk L1 2 ×, L2 2 × (`DirectorPressure.js:110-112`); dźwignia `aiWarships` |
| `frigate_missile_escort` | `hull_frigate` · `engine_warp`, `warp_tank`, `armor_heavy`, `weapon_missile` | tak | **312** · 120 · 12 · 0,30 AU | 6,16 | 5 rdzeni, 18 LY/rok, pełny bak 40 LY | **tak** | OK / OK | roamer L2 przy agresji ≥ 0,6 (`:113-116`, `:166-173`) |
| `frigate_laser_escort` | `hull_frigate` · `engine_warp`, `warp_tank`, `armor_heavy`, `weapon_laser` | tak | **242** · 120 · 5 · 0,05 AU | 6,61 | jw. | **tak** | OK / OK | roamer L2 przy agresji ≤ 0,4 (oba imperia fixture'u: 0,3) |
| `science_probe` | `hull_small` · `engine_fusion` (fixture: `engine_ion`), `science_lab` | **nie** | 45 · 30 · 0 | 4,28 | 0 | nie | OK / OK | `DirectorFirstContact.scienceFlyby` — tworzona wprost, bez stoczni |
| `transport_assault` | `hull_large` · 2 × `engine_warp`, `warp_tank`, 2 × `troop_bay_l`, 2 × `drop_pods` | **nie** | 183 · 180 · 0 | **42,89** | jw. | tak | ✗ `no_module` `troop_bay_l` (brak `fleet_logistics`) / ✗ | nikt (Finding 201); dźwignia `spawnEnemyRaider` |

Nowy kadłub ma pusty bak warp (`Vessel.js:126`), ale AI skacze bez sprawdzania paliwa (`VesselManager.js:871-881`: bramka
wyłącznie `warpFuel.max > 0` i zużycie > 0) ⇒ dla AI „zasięg” = sam fakt posiadania baku.
**Zasięg na fixture** (prawdziwa gra, `planAllEmpires` — ranking, który drukuje `KOSMOS.debug.garrisonPlan()`) `[measured]`:
drugie ciało D11 `emp_001` = `entity_117` „Propus d” — w układzie stolicy `sys_059`, 1,33 AU od stolicy; `emp_002` =
`entity_231` „Regulus b” — w układzie stolicy `sys_020`, 2,47 AU ⇒ w fixture dociera tam KAŻDY kadłub (lot w układzie).
Kolejne kandydaty D11 poza układem stolicy to wyłącznie placówki Xe / Nt (`emp_001`: `sys_063`, `sys_023`; `emp_002`:
`sys_047`, `sys_037`) — tam tylko kadłub z bakiem. Najbliższy układ gracza: `sys_home` — 9,19 LY od `sys_059` (powłoka
graniczna `emp_001`, cel reguły uderzenia osiągalny; skok ~0,5 roku przy 18 LY/rok) i 19,53 LY od `sys_020` (poza
zasięgiem reguły `emp_002`).

**PROPOZYCJA domyślnego składu puli — ⏳ OCZEKUJE NA WŁAŚCICIELA (SB17).** Jedna wartość tabeli (przyszły klucz, konsument:
pula w sesji 2): wzorzec `['frigate_system_defender', 'frigate_missile_escort', 'frigate_missile_escort',
'frigate_missile_escort']`, powtarzany do limitu (limit 2 → D, E; 4 → D, E, E, E; 6 → D, E, E, E, D, E). Powody:
1. **Limit bywa 2** (minimum; uprząż gy 40 — 2): pierwszy kadłub to strażnik stolicy — defender jest najsilniejszy (432)
   i z projektu nie opuszcza układu (SB5); drugi musi umieć POLECIEĆ do drugiego ciała (SB6) — w fixture to lot w układzie,
   ale następne ciała D11 to placówki w innych układach, więc tylko kadłub z bakiem obsłuży oba przypadki.
2. **Eskorta rakietowa, nie laserowa:** 312 wobec 242 siły, 12 wobec 5 obrażeń, zasięg broni 0,30 wobec 0,05 AU; laser jest
   szybszy tylko o 7 % (6,61 wobec 6,16 AU/rok).
3. **Od limitu 3–4:** dochodzą eskorty do eskadry „2+” (wymóg `DirectorOffensive` przeciw bronionemu celowi,
   `MAX_STRIKE_SIZE` 3), bez zdejmowania obu strażników.
4. **Transportowiec NIE jest uzbrojony** (`hasWeapons` = false) — wg SB3 / SB14 (i predykatu `isFleetLimitHull`) NIE liczy
   się do limitu, więc nie należy do wzorca uzbrojonego; jego źródło i liczbę rozstrzyga S3 (SB7, SB8). Dodatkowo żadne
   imperium fixture'u nie ma techu na `troop_bay_l` — pytanie 3 niżej.
5. **Zastrzeżenie SB14 (Finding 408):** wzorzec kształtuje wyłącznie NOWE kadłuby. W fixture `emp_001` ma już 6 uzbrojonych
   kadłubów bez baku warp przy limicie 6 — pula nie doda nic, więc `emp_001` nie uderzy (M2).

#### 5c.3 M2 — doktryny i kadłuby w służbie podczas wojny (SB18)

Scenariusz (wspólny kod w node i w przeglądarce): każdy kadłub z rezerwy w służbę ISTNIEJĄCĄ akcją `mobilizeVessels`
(emulacja SB13), po miesiącu przejścia zadokowany przy stolicy, wojna z każdym imperium AI, 10 lat gry; kontrola — ten
sam świat w pokoju. Guardy i sondy reguł owinięte licznikiem w rejestrze Directora (odmowa każdego guardu per reguła).
Uprząż: `bootWithDirector` + wariant `pressPaid` sondy C1 (kontrola: liczba kadłubów przy starcie = tabela C1 audytu ✓;
dwa takie same przebiegi — identyczny JSON ✓). Fixture: prawdziwa gra w izolowanym headless Chrome (kontrola rozruchu:
gy 60,117, stolica `entity_115`, 6 kadłubów w rezerwie, siła 618 / 450 ✓; konsola — wyłącznie 404 brakujących grafik)
`[measured]`:

| świat | imperium · kadłuby w służbie po miesiącu | doktryny (10 lat, wojna) | rozkazy · zeszło z doku | uderzenie: co je zatrzymało | bitwy · straty · do gracza | kontrola: pokój |
|---|---|---|---|---|---|---|
| fixture GATE-S4, gy 60 | `emp_001` · 6 (z rezerwy 6) | `defend_home` 5 (2 + 2 + 1, gy 60,2 / 63,2 / 66,3), `patrol_border` 1 (gy 60,2) | 1 × `moveToPoint` → `entity_124` · 1 / 6, 23,9 AU od stolicy, własny układ | wyzwalacz przechodzi (cel `sys_home` w zasięgu, 122 / 122); guard `empireHasStrikeForce` odmawia 121 / 121 (brak baku warp) | 0 · 0 · nie | doktryny i rozkaz te same; produkcja L1 2 ×, L2 2 × (+3 kadłuby → rezerwa; parytet odmawia mobilizacji 31 ×); uderzenie: guard `empireAtWarWithPlayer` 122 / 122 |
| fixture | `emp_002` · 0 | — | — | — | — | — |
| uprząż `default`, gy 60 | `emp_002` · 5 (z rezerwy 4) | `defend_home` 4 (gy 60,25 i 63,25); piąty (`v_11`) był w służbie już wcześniej i nie był bezczynny — wszystkie 5 stoją w doku | 0 · 0 / 5 | wyzwalacz nie przechodzi (brak celu w zasięgu) | 0 · 0 · nie | jw. + nacisk L1 2 × (+1 kadłub → rezerwa) |
| uprząż `987654321`, gy 60 | `emp_001` · 2; `emp_002` · 3 | `defend_home` 1 i 2 kadłuby | 0 · 0 | `emp_002`: `empireHasStrikeForce` 121 / 121; `emp_001`: brak celu | 0 · 0 · nie | jw. + nacisk L1 2 × (+2 i +2 kadłuby → rezerwa) |
| uprząż `default`, gy 100 | `emp_002` · 8 | `defend_home` 6, `patrol_border` 1 | 1 × → `entity_187` · 1 / 8, 6,75 AU | brak celu w zasięgu | 0 · 0 · nie | jw. + nacisk L1 2 × (+0 kadłubów) |
| uprząż `987654321`, gy 100 | `emp_001` · 6; `emp_002` · 7 | `defend_home` 4 i 5, `patrol_border` 1 i 1 | po 1 rozkazie · 1 / 6 (15,1 AU), 1 / 7 (7,9 AU) | `emp_002`: `empireHasStrikeForce` 121 / 121; `emp_001`: brak celu | 0 · 0 · nie | jw. + nacisk L1 2 × (+1 i +0 kadłubów) |

Wnioski `[measured]`: (1) **wojna nie zmienia doktryn** — rozkazy, role i kadłuby identyczne jak w pokoju; wojna zmienia
wyłącznie produkcję (L1 / L2 staje na `empireNotAtWarWithPlayer`) i bramkę uderzenia; (2) `defend_home` wciela po 2 kadłuby
co 3 lata, a kadłub z rolą nigdy nie wraca do puli bezczynnych — przy rezerwie obsadzonej naraz `patrol_border` (≥ 3
bezczynne) odpala co najwyżej raz; (3) **żaden kadłub nie opuścił układu stolicy**, zero bitew i strat; (4) w żadnym
zmierzonym świecie uderzenie nie mogło paść — albo brak celu w zasięgu, albo brak kadłuba z bakiem warp w służbie.

#### 5c.4 Przyrząd: prawdziwa gra na fixture w izolowanym headless Chrome

Headless node nie odtwarza zapisu (fixtures/README — replay zaparkowany), więc pomiary „na fixture” i walidacja
jednolinijkowców bramki biegną w PRAWDZIWEJ grze: `kosmos-handover/ai-strikes-back-s1/tools/kosmos_cdp.mjs` — własny
serwer statyczny tylko-do-odczytu, Chrome z osobnym profilem (`--user-data-dir`, `--headless=new`, SwiftShader), fixture
wczytywany produkcyjną ścieżką `SaveSystem.importSave` → „Kontynuuj”; repo, profil przeglądarki właściciela i Live
Server nietknięte. Kontrola rozruchu w każdym przebiegu (gy 60,117 · `entity_115` · 6 · 618 / 450). Jednolinijkowce
części „tabela strojenia” bramki S1 zwalidowane tym przyrządem na drzewie po S1-2 (także zapis → F5 → „Kontynuuj”),
kontrola: na `825f541` każdy krok `KOSMOS.debug.sb*` rzuca „not a function”.

#### 5c.5 Pytania do właściciela (otwarte po sesji 1)

1. **Skład puli (SB17):** przyjąć wzorzec z 5c.2 (D, E, E, E powtarzany do limitu), czy inny?
2. **Finding 408 (SB14):** fixture `emp_001` ma limit wypełniony kadłubami bez baku warp — pula nie doda eskorty, więc to
   imperium nigdy nie uderzy ani nie wyśle strażnika poza układ. Zostawić (SB14 dosłownie), czy wzorzec ma np. gwarantować
   minimum kadłubów z bakiem (przy limicie — wymiana albo nadwyżka)?
3. **Tech a pula:** kadłuby puli rozwiązywać techem imperium (fixture: obie fregaty i defender OK, transportowiec ✗ —
   brak `fleet_logistics`) czy „wszystko zbadane” jak sonda pierwszego kontaktu (`DirectorFirstContact.js:113`)?
4. **Transportowiec a limit:** potwierdzić, że NIEuzbrojony transportowiec nie liczy się do limitu (SB3 dosłownie) i ma
   własne źródło / liczbę w S3 (SB7, SB8).
5. **Finding 407:** kanoniczny fixture niesie trzy fregaty-chimery gracza — przed bramkami S3 / S4 (obrona gracza liczona
   po układzie statku) odświeżyć fixture, leczyć chimery przy wczytaniu, czy obejść w bramkach?
6. **Mnożnik szczebla floty:** dziś osobna lista w tabeli SB (domyślnie równa `limitMult` garnizonu, pilnowana keeperem) —
   ma tak zostać, czy limit floty ma brać mnożnik wprost z drabiny garnizonu (bez osobnego pokrętła)?

→ **Odpowiedzi właściciela 2026-10-07: SB20–SB25 (§2)**, w kolejności pytań 1–6; każda odpowiada na pytanie tak, jak je
zadano (sprawdzone na początku sesji 2).

### 5d. S1 — sesja 2 z 2 (2026-10-08): leczenie 407, pula, mobilizacja rezerwy, odrastanie, wywiad — kod PRZYGOTOWANY

> ✅ **Zacommitowany 2026-10-08** po bramce i zgodzie właściciela — §5e. Tekst niżej to zapis sesji 2 (stan przed commitem).

Zakres sesji (polecenie właściciela, decyzje SB20–SB25): część A — audyt bez edycji; część B — pięć przygotowanych
commitów (B1 leczenie 407 · B2 pula · B3 mobilizacja wojenna całej rezerwy · B4 odrastanie · B5 odczyt wywiadu);
część C — pomiar M3; część D — scenariusz bramki w przeglądarce; część E — ta dokumentacja (commit bezpośrednio).
**Kod jest ZASTAGOWANY w repo (stan „B5 kod”), NIE zacommitowany:** trzy podpisane decyzje odwracają piny istniejących
keeperów, a reguła sesji każe je zostawić czerwone, przygotować przecelowanie z dowodem mutacyjnym i zapytać (§5d.4).
Save **v101 bez migracji** (flaga puli w `empires.<id>.fleetPool`, pochodzenie kadłuba na białej liście statku).
**Poza zakresem (tylko raport):** stanowisko strażnika na orbicie (S2), reguły doktryn i produkcji, transportowiec
(S3), odbijanie kolonii, Findingi 405 i 406, DSCS. Sondy, wyniki, łatki, skrypt commitów i notatka przekazania:
`kosmos-handover/ai-strikes-back-s1/p2/` i `HANDOVER_S1_PART2.md` (poza repo).

#### 5d.1 Audyt (część A) — odczyt kodu na `45ee9d2`

| pytanie | odpowiedź `[code]` |
|---|---|
| 407: gdzie siedzi naprawa 256 | WYŁĄCZNIE w czasie gry, na dwóch ścieżkach dokowania: admisja `MovementOrderSystem._issueDock` (D-256a) i konsument `FleetSystem._maybeDockOnArrival` (D-256b) z bliźniakiem `_maybeAutoDockOnReturn` (263); `[git]` `10eab7e` |
| 407: czemu wczytanie nie leczy | `VesselManager.restore` przepisuje `systemId` z zapisu i woła wyłącznie `_reconcileSystemId` (Slice A, `f072da0`), który leczy WYŁĄCZNIE misje międzygwiezdne — dla statku w doku bez misji zwraca jego własny `systemId`, także co tick |
| 407: co kluczuje się na `vessel.systemId` | wyłącznie odczyty liczone na żywo, bez trwałych indeksów: `getVesselsInSystem`, `OrderService.getTraffic`, Outliner, `ProximitySystem._checkPair`, `WarSystem._playerVesselsInSystem` → `_buildPlayerBattleUnit` / `hasPlayerPresenceInSystem`, `DirectorOffensive.isDefended` / `estimateDefenderHp`, sonda nacisku `DirectorPressure`, ETA `FleetSystem`, renderer |
| 407: bezpieczne miejsce zmiany | pętla `VesselManager.restore`, PO `_reconcileSystemId`: ciała są już w `EntityManager` (`GameScene._restoreSystem` w `create()`), DebugLog podpięty, żaden indeks na `systemId` jeszcze nie powstał; stacje wracają później — dok przy stacji pominięty (w fixture 0 stacji) |
| mobilizacja garnizonu | `GarrisonSystem`: `diplomacy:warDeclared` → `mobilizeEmpire('war_declared')`; zapis w wojnie → pierwszy tick → `'reconcile_at_war'`; granica roku → `'reconcile_yearly'`; raz na imperium; bez stolicy — odmowa `no_capital` BEZ flagi; flaga `empires.<id>.garrison` (bez migracji) |
| ścieżka sondy pierwszego kontaktu | `DirectorFirstContact.scienceFlyby`: `resolveTemplate(…, { isResearched: () => true })` → `createVessel` → stempel właściciela PRZED `vessel:created` ⇒ `DirectorProduction._claimVessel` wraca od razu, kolejka adnotacji (mechanizm Findingu **395**) nietknięta |
| powiadomienie o mobilizacji | `director:mobilized` → `NotificationCenter._handleMobilized`: bramka `contact`, nazwa imperium przy `detailed`, dzwonek + Dziennik (kanał Wywiad), klucze `notif.mobilization*`; garnizon — sam wpis w Dzienniku |
| odrastanie garnizonu | rok gry = 1,0 `gameTime`, granica = wzrost `floor`; rozliczany każdy rok od `regrowthYear + 1`; bez stolicy rok przepada (bez nadrabiania); rekord bez `regrowthYear` — tylko ustawia rok |

#### 5d.2 Przygotowany łańcuch (część B)

| commit (przygotowany) | treść | decyzje · findingi |
|---|---|---|
| **B1** — S1-3 | `VesselManager._healDockedSystemId`: przy wczytaniu statek w DOKU (nie wrak, nie w skoku międzygwiezdnym), którego ciało doku leży w innym układzie, bierze układ ciała; jeden wpis `vessel:systemIdHealed` na statek (`DebugLog.TRACKED_EVENTS`); nic poza `systemId` | SB24 · **407** |
| **B2** — S1-4 | NEW `src/utils/FleetPoolPlanner.js` — plan puli: miejsce = max(limit − uzbrojone, minimum z bakiem − z bakiem, 0); sloty wzorca do limitu, istniejące kadłuby pokrywają sloty swojej klasy, niepokryte w kolejności wzorca, dopełnienie minimum — pierwszy szablon z bakiem; NEW `src/systems/FleetPoolSystem.js` (`window.KOSMOS.fleetPoolSystem`) — pula RAZ na imperium przy mobilizacji, trzy wejścia jak garnizon, flaga `empires.<id>.fleetPool`, bez stolicy / pod reparacjami — nic i bez flagi; `VesselManager.createAIVessel` — JEDNA funkcja tworzenia (dok stolicy, w służbie, załoga 0, bez POP, bez utrzymania; `origin: 'pool'` i właściciel ostemplowane PRZED `vessel:created`, więc 395 się nie powtarza); klucze `fleetPoolPattern` i `fleetMinWarpHulls` z konsumentem i walidacją; odczyt `sbTuning()` + kolumny `zBakiem`, `pula`, `pulaDoda`; powiadomienie — istniejące `_handleMobilized`, bez nowych kluczy | SB1 · SB2 · SB14 · SB18 · SB20 · SB21 · SB22 |
| **B3** — S1-5 | mobilizacja wojenna budzi CAŁĄ uzbrojoną rezerwę imperium (`deployVessel`, bez guardu parytetu); liczba w powiadomieniu = pula + obudzona rezerwa; reguła pokojowa `mobilize_reserve` (guard parytetu, porcja 2) bez zmian | SB13 |
| **B4** — S1-6 | odrastanie: po mobilizacji jeden kadłub na granicę roku kalendarzowego (`fleetRegrowthPerYear`, domyślnie 1), ta sama reguła miejsca i wzorca, także w pokoju; bez stolicy — rok przepada (jak garnizon); pod reparacjami — pominięte ze śladem audytu | SB15 |
| **B5** — S1-7 | wywiad przy „detailed”: linia `okręty uzbrojone: A / limit floty: L` (klucz `intel.fleetVsLimit` PL + EN) zamiast `wolna załoga: N POP` (`intel.crewCapacity` usunięty z obu słowników); brak systemu puli ⇒ `null`, nigdy 0 | SB19 · **398** |

#### 5d.3 Weryfikacja `[measured]`

- Keepery NEW: `sb1_dock_heal_smoke` **14/14** (fail-first na `45ee9d2` 2 / 12) · `sb1_fleet_pool_smoke` **79/79** (fail-first:
  część B2 na B1 6 / 54, część B3 61 / 6, część B4 68 / 11) · `sb1_intel_fleet_smoke` **13/13** (fail-first 2 / 11). Każdy
  pin wykluczający ma świadka; kontrole zielone po obu stronach.
- Sweep: B1 **266/266**; B2, B3, B4 „kod” **262/267**, B5 „kod” **262/268** — czerwone WYŁĄCZNIE piny odwrócone przez
  podpisane decyzje (§5d.4); z przecelowaniami **267/267**, **267/267**, **267/267**, **268/268**; `check-i18n` PASS,
  pl = en = **3455** po każdym kroku (B5: +1 klucz, −1 klucz).
- 407 w prawdziwej grze na fixture (izolowany headless Chrome): jednolinijkowiec właściciela przed — trzy chimery, po —
  `""` i trzy wpisy audytu; obrona domu gracza: `WarSystem._buildPlayerBattleUnit('sys_home', 'entity_2')` HP **30 → 360**,
  `DirectorOffensive.isDefended` false → **true**, `estimateDefenderHp` 30 → **360**, obecność gracza w `sys_060` true →
  false; sonda nacisku `emp_001` 3 → 3 (oba układy w powłoce). Konsola: 0 wyjątków.

#### 5d.4 Przecelowania pinów — ✅ ZATWIERDZONE 2026-10-08 (§5e.2; zapis sesji 2 niżej)

| przecelowanie | keeper · piny czerwone na kodzie | propozycja | dowód mutacyjny |
|---|---|---|---|
| **R-B2a** (SB1, SB20, SB21) | `sb1_fleet_tuning_smoke` — 10 asercji (T1a, T1e, T2i, T3, T4b, T5b, T8a, T8e, T11a, T12a): pinują stan sesji 1 (dokładnie 3 klucze, limit czyta tylko konsola, 13 kolumn) | klucze S1-1 jako PREFIKS tabeli + literalne wartości domyślne, „wszystko domyślne” po CAŁEJ tabeli; konsumenci limitu: konsola i pula; kolumny + `zBakiem`, `pula`, `pulaDoda` | 4 / 4 zabite: wartość domyślna 32 → 33 (10 asercji czerwonych), klucz przed prefiksem (T1a, T3), trzeci importer `FleetLimit` (T11a), brak kolumny `pulaDoda` (T12a) |
| **R-B2b** (SB1) | `w3_target_selection` (7: T4 ×5, T6, T8) · `wp_ai_peace_offer` (T1f) · `wp_test_infra` (T7a, T7b) · `g3_regrowth` (R9b): wojna tworzy pulę, więc scena keeperów (siła AI w służbie, dzwonek) się zmienia; pinują wybór celu, depeszę pokojową i Dziennik garnizonu, nie pulę | pula WYŁĄCZONA w setupie (`fleetPoolSystem.enabled = false`, wzór `garrisonSystem.enabled`); asercje bez zmian | 5 / 5 zabite: pula ignoruje wyłącznik — wszystkie cztery keepery czerwone dokładnie jak na kodzie (wyłącznik jest NOŚNY); eskadra stała 1 (T4), `war_status` ślepy na drugą stronę (T1f), depesza nie wychodzi (T7a), mobilizacja garnizonu dzwoni (R9b) |
| **R-B5** (SB19) | `w2_ai_mobilization_smoke` T5 (2 asercje: `knownCrewCapacity === 7` i null / null) | ta sama struktura pinu (odczyt z kolaboratora; brak kolaboratora ⇒ null, nie 0), nowe pola `knownArmedHulls` / `knownFleetLimit` | 2 / 2 zabite: limit = liczba kadłubów; brak systemu puli ⇒ 0 |

Kontrola: każdy z sześciu keeperów bez mutacji zielony; drzewo po każdej mutacji przywrócone bajt w bajt.
⚠ R9b mierzy dzwonek GLOBALNIE: na kodzie dzwoni powiadomienie o mobilizacji imperium z KONTAKTEM (`emp_001`) — zgodnie
z podpisem („istniejące powiadomienie”); bramkę `contact` pinuje `sb1_fleet_pool_smoke` T8 (plotka — nic).

#### 5d.5 Plan puli — przypadki właściciela (`sb1_fleet_pool_smoke` T4) `[measured]`

| limit · kadłuby przed | pula dodaje | uwagi |
|---|---|---|
| 2 · 0 | D, E | minimum 2 z bakiem dopełnia dopiero odrastanie (rok później) — pytanie 3, §5d.8; **SB27:** D, E, E od razu (⏳ S1-8, §5e.4) |
| 6 · 0 | D, E, E, E, D, E | wzorzec do limitu |
| 6 · 6 defenderów | E, E — PONAD limit | SB21 (fixture `emp_001`) |
| 6 · 3 defendery | E, E, E | 3 sloty D pokryte, 3 sloty E niepokryte |
| kontrola dyskryminacji | — | reguła „tylko do limitu” dałaby inne wyniki w dwóch ostatnich wierszach (T4g) |

#### 5d.6 M3 — pula i mobilizacja w wojnie, 10 lat gry `[measured]`

Scenariusz (wspólny kod w node i w przeglądarce): wojna z każdym imperium AI PRAWDZIWĄ ścieżką `declareWar` (pula +
obudzona rezerwa + garnizon), 10 lat gry; kontrola — ten sam świat w pokoju. Fixture: prawdziwa gra (kontrola
rozruchu: gy 60,117 · `entity_115` · 6 · 618 / 450 ✓; konsola 0 wyjątków). Wariant dodatkowy „dom bez obrony”: przed wojną
trzy fregaty gracza idą do rezerwy produkcyjną ścieżką `withdrawVessel`. Uprząż: `bootWithDirector` + nacisk `pressPaid`
(kontrola: liczba kadłubów przy gy 60 = tabela C1 audytu ✓).

| świat · wariant | imperium · limit | mobilizacja (pula · obudzone) | najwięcej uzbrojonych | doktryny | uderzenie | bitwy · straty · desant |
|---|---|---|---|---|---|---|
| fixture · wojna | `emp_001` · 6 | +2 E · 6 | 8 (8 w służbie od 1. miesiąca) | `defend_home` ×3, `patrol_border` ×2 (do `entity_124`, 24 AU, własny układ) | 2 × odmowa `target_beyond_reach` (gy 64,2 i 69,3: dom gracza broniony, 360 HP) | 0 · 0 · 0 |
| fixture · wojna | `emp_002` · 6 | +6 (D, E, E, E, D, E) · 0 | 6 | `defend_home` ×3, `patrol_border` ×1 (10,5 AU) | brak celu w zasięgu (sonda 0 / 121) | 0 · 0 · 0 |
| fixture · wojna, dom bez obrony | `emp_001` · 6 | +2 E · 6 | 8 | jw. | **UDERZENIE** 2 eskortami (`v_30`, `v_31`) gy 64,45 → `sys_home`; skok 0,6 roku, potem ~4,8 roku lotu od krawędzi układu | 2 bitwy przy `entity_2` (gy 69,9 i 70,2) — wygrywa `emp_001` (obrona kolonii 30 HP, okrętów gracza w służbie brak); desant odmówiony `no_drop_capable_hull` ×2; odwołanie 1 eskorty; 0 wraków |
| fixture · pokój (kontrola) | `emp_001` · 6 | puli brak; `mobilize_reserve` raz (2 w służbę, gy 60,5) | 9 (produkcja: 8 przy gy 68, 9 przy 69; w służbie 2) | `defend_home` ×1 | guard `empireAtWarWithPlayer` 121 / 121 | 0 · 0 · 0 |
| fixture · pokój (kontrola) | `emp_002` · 6 | puli brak | 0 | — | — | 0 · 0 · 0 |
| uprząż `default` gy 60 · wojna | `emp_001` · 2 / `emp_002` · 2 | D, E · 0 / E, E · 4 | 3 / 7 | `defend_home`, `patrol_border` ×1 (`emp_002`, 7 AU) | brak celu w zasięgu | 0 · 0 · 0; odrastanie: `emp_001` +E przy roku 61 (minimum z bakiem) |
| uprząż `987654321` gy 60 · wojna | `emp_001` · 2 / `emp_002` · 2 | E, E · 1 / E, E · 2 | 4 / 5 | `defend_home` | `emp_002`: **UDERZENIE** 2 eskortami gy 61,25 → `sys_home` | 1 bitwa przy `entity_5` (gy 66,6) — wygrywa `emp_002`; desant odmówiony `no_drop_capable_hull`; odwołanie i powrót |
| uprząż · pokój (kontrola) | oba ziarna | puli brak | `default` 0 / 6, `987654321` 4 / 5 (w służbie 1) | — | guard `empireAtWarWithPlayer` | 0 · 0 · 0 |

**Co zobaczy właściciel w swojej grze (stan jak fixture, 3 fregaty w domu):** po wypowiedzeniu wojny — w dzwonku 🔔
dwa wpisy mobilizacji (przy kontakcie: „⚓ Nieznane imperium obsadza okręty załogami — Rezerwa wchodzi do służby: 8”
i „…: 6”); stolica `emp_001` z 8 fregatami w doku, stolica `emp_002` z 6; jedna–dwie fregaty patrolują własny układ.
**Ataku nie będzie, dopóki trzy fregaty stoją w domu:** `emp_001` dwa razy w 10 lat wybiera cel i odmawia
(`target_beyond_reach` — obrona 360 HP przekracza eskadrę, a skakać umieją tylko 2 kadłuby), `emp_002` nie sięga
domu (19,5 LY). **Gdy fregaty opuszczą dom:** ~4 lata po wypowiedzeniu wojny `emp_001` wysyła 2 eskorty; po skoku widać
je przez ~5 lat, jak lecą od krawędzi układu domowego; wygrywają orbitę nad domem z obroną kolonii, ale wylądować nie
mogą (brak transportowca — S3), jedna wraca, druga zostaje na orbicie do następnego odwołania (≤ 1 rok).

#### 5d.7 Bramka w przeglądarce (część D)

Scenariusz: `kosmos-handover/ai-strikes-back-s1/gate/GATE_S1.md` (poza repo; zastępuje szkic sesji 1). Kopia fixture'u
GATE-S4, gra na pauzie poza jednym krokiem czasu, jedna komenda na krok, jeden obiekt albo napis na wynik. Kroki:
jednolinijkowiec 407 (twój odczyt z 2026-10-07 ma wrócić `""`) i ślad leczenia · tabela strojenia i limit · wojna → pula
i obudzona rezerwa (6 „w mobilizacji” na pauzie) · dzwonek · strojenie w trwającej grze · rok do przodu → odrastanie ·
panel WYWIAD (klawisz I → imperium → blok „Siła wojskowa” → `okręty uzbrojone: 9 / limit floty: 13`) · zapis → F5 →
„Kontynuuj” (flaga puli, rok odrastania i strojenie przeżywają, pula nie tworzy się drugi raz) · reset. **Każda komenda
wykonana w prawdziwej grze** (izolowany headless Chrome) na kodzie sesji i na KONTROLI `45ee9d2` (krok 1 zwraca trzy
chimery, puli nie ma, panel pokazuje „wolna załoga”, krok 17 rzuca) `[measured]`.

#### 5d.8 Pytania do właściciela (po sesji 2 — odpowiedzi 2026-10-08: SB26–SB29, §2 i §5e.2)

1. **Przecelowania R-B2a, R-B2b, R-B5 (§5d.4):** zgoda? Od niej zależy tryb skryptu commitów (wszystkie / do B4 / tylko B1).
2. **Reparacje a pula:** pula i odrastanie są wstrzymane pod reparacjami (WP-R: blokada nowej siły AI) — dodane bez
   osobnego podpisu (pin T6g, T12h). Zostawić?
3. **Limit 2 przy zerze kadłubów:** pula daje D, E (twój przypadek), więc minimum 2 kadłubów z bakiem dopełnia dopiero
   odrastanie rok później (uprząż `default`: `emp_001` +E przy roku 61). Tak ma być, czy dokładać brakującą eskortę od razu?
4. **Wzorzec bez szablonu z bakiem** przy minimum > 0 jest dziś przyjmowany, a minimum nie da się spełnić (T4f). Odmawiać
   takiego wzorca w walidacji?
5. **Finding 409:** nowy klucz PL + EN dla liczby z puli w powiadomieniu, czy zostaje „Rezerwa wchodzi do służby”?
6. **Finding 411:** kadłub ukończony w wojnie po mobilizacji — budzić go mimo parytetu (dosłowne SB13), czy zostaje
   `mobilize_reserve` z guardem (polecenie sesji)?

### 5e. S1 — domknięcie (2026-10-08): commity łańcucha, SB28 i SB29, test wyłącznika, bramka; S1-8 (SB27) czeka na zgodę

Polecenie właściciela (2026-10-08, po bramce w przeglądarce — PASS, §5e.3): zacommitować łańcuch sesji 2 (zgoda na
R-B2a, R-B2b, R-B5), dołożyć trzy poprawki podpisane jako SB27–SB29 i test wyłącznika puli (B6–B9, commit bezpośrednio
na dowodzie headless), zamknąć dokumentację; S2 — audyt wyłącznie do odczytu. Zapis **v101 bez migracji**. Sondy, wyniki,
łatki, skrypty i notatka przekazania: `kosmos-handover/ai-strikes-back-s1/p3/` i `HANDOVER_S1_CLOSED.md` (poza repo).

#### 5e.1 Commity `[git]`

| commit | drzewo | krok | temat | sweep · `check-i18n` `[measured]` |
|---|---|---|---|---|
| `d4f43a8` | `b7592e0` | S1-3 (B1) | leczenie chimer doku przy wczytaniu (407, SB24) | 266/266 · PASS 3455 |
| `a1143fc` | `76c7a01` | S1-4 (B2 + R-B2a, R-B2b) | pula okrętów (SB1, SB2, SB14 zm. SB21, SB18, SB20, SB22) | 267/267 · PASS 3455 |
| `a8ebbfe` | `cda0320` | S1-5 (B3) | wojna budzi całą uzbrojoną rezerwę (SB13) | 267/267 · PASS 3455 |
| `d707e3e` | `db7c07c` | S1-6 (B4) | odrastanie floty (SB15) | 267/267 · PASS 3455 |
| `1a9f95b` | `d797bfe` | S1-7 (B5 + R-B5) | wywiad „okręty uzbrojone / limit floty” (SB19, 398) | 268/268 · PASS 3455 (+1 / −1 klucz) |
| `8d13485` | `7e6d712` | S1-9 (B7) | para wzorzec ↔ minimum z bakiem (SB28) | 269/269 · PASS 3455 |
| `5dc04d0` | `d74d848` | S1-10 (B8) | w wojnie guard parytetu nie hamuje (SB29, 411) | 270/270 · PASS 3455 |
| `1444184` | `8ef8d62` | S1-11 (B9) | test: wyłącznik puli w grze włączony, poza zapisem | 271/271 · PASS 3455 |
| `6b40c30` | `23b6322` | S1-8 (B6 + R-B6) | plan puli do skutku (SB27) — po zgodzie na R-B6, 2026-10-09 (§5f.1) | 272/272 · PASS 3455 |

Każdy commit sprawdzony osobno (wyewidencjonowany w klonie poza repo: pełny sweep i `check-i18n`) `[measured]`. Łańcuch
sesji 2 zrobił skrypt `p2/tools/commit_S1P2.sh all` ze znacznikami zgody wypełnionymi dosłownie odpowiedziami właściciela.
⚠ Pierwsze uruchomienie: po commicie B1 przejściowy błąd systemu plików (`Permission denied` przy zapisie obiektu drzewa
`39f84d2`, poddrzewo `src/data`) w kontroli drzewa B2 na kopii indeksu; to samo obliczenie powtórzone dało `76c7a01`
(= `trees.txt`). Stan wejściowy przywrócony (HEAD `8de7efd` — `reset --soft`, indeks `63d1031` — `read-tree`; pierwszy
commit B1 osierocony), skrypt uruchomiony od nowa — pięć drzew zgodnych z `trees.txt`. Przyczyna niezbadana `[measured]`.
Po łańcuchu: drzewo robocze `src/` = indeks, CR plików CRLF zachowane (`DebugLog.js` 217, `GameCore.js` 630,
`IntelSystem.js` 674), w repo żadnego `*.PROPOSED`, status — wyłącznie obce elementy sprzed sesji.

**Uprząż C1 audytu** (pokój, 100 lat gry, ziarna `default` i `987654321`, warianty passive / press / pressPaid) — na HEAD po
łańcuchu i ponownie po B9: **6 / 6 przebiegów bajt w bajt jak wynik sesji 1** (`results/harness_c1/after_C2`); wszystkie
72 próbki — pokój `[measured]`. KONTROLA przyrządu: kopia sondy z wariantem „wojna od roku 0” (w pokoju bajt w bajt jak
sonda oryginalna); w wojnie kod S1 i `8de7efd` RÓŻNE: przed S1 imperium w wojnie przez 100 lat ma **0** uzbrojonych
kadłubów; z S1 — **2** od roku 0 (pula D + E, z bakiem 1), **3** od roku 20 (odrastanie +E — minimum z bakiem); ziarno
`987654321`: `emp_002` — **5** przy roku 100 (limit rośnie z POP) i **17** uderzeń (`director:strikeLaunched`) na
nieobroniony dom gracza. Po B7–B9 wariant wojenny bez zmian (w uprzęży żaden uzbrojony kadłub nie kończy się w wojnie —
B8 nie ma tam czego budzić).

#### 5e.2 Odpowiedzi właściciela (2026-10-08)

- **Zgoda na R-B2** (dosłownie w treści `a1143fc`): „TAK (właściciel, 2026-10-08): zgoda na R-B2a i R-B2b. Wyłącznik
  fleetPoolSystem.enabled przyjęty jako narzędzie testów: domyślnie włączony, nie trafia do zapisu.”
- **Zgoda na R-B5** (w treści `1a9f95b`): „TAK (właściciel, 2026-10-08): zgoda na R-B5; odczyt wywiadu podmieniony decyzją
  SB19.”
- **SB26–SB29** — §2 (odpowiedzi na pytania 2, 3, 4 i 6 z §5d.8). **Finding 409** (pytanie 5): tekst zostaje; polerka.
- Pytanie 7: bramka przed commitami — PASS (§5e.3).

#### 5e.3 Bramka S1 — zapis (2026-10-08, właściciel, przeglądarka)

Fixture `GATE-S4-fresh-gy60`; kod = drzewo indeksu `63d1031` (zestagowany kod łańcucha bez przecelowań — te dotyczą
wyłącznie keeperów); gra po angielsku. Scenariusz `gate/GATE_S1.md` (poza repo). Odczyty właściciela, dosłownie:

| krok | odczyt |
|---|---|
| 0 | `{rok: 60.17, stolica001: 'entity_115', rezerwa001: 6}` |
| 1 | `''` |
| 2 | `'v_21:sys_060->sys_home \| v_22:sys_060->sys_home \| v_23:sys_060->sys_home'` |
| 3 | sześć kluczy, wszystkie domyślne, bez `*` |
| 4 | `emp_001` limit 6, uzbrojonych 6 (rezerwa 6), z bakiem 0, miejsce 0, pula nie, dołoży `frigate_missile_escort x2`; `emp_002` limit 6, uzbrojonych 0, miejsce 6, dołoży `frigate_system_defender x2, frigate_missile_escort x4` |
| 5 | `'emp_001:contact \| emp_002:contact'` |
| 6 | `'detailed: okręty 6 / limit 6'` |
| 7 | `'emp_001: pula +2 (2 w planie), obudzona rezerwa 6, limit 6 \| emp_002: pula +6 (6 w planie), obudzona rezerwa 0, limit 6'` |
| 8 | `emp_001` uzbrojonych 8 (służba 2, mobilizacja 6, rezerwa 0, pula 2, z bakiem 2); `emp_002` uzbrojonych 6 (służba 6, pula 6, z bakiem 4) |
| 8b | `'detailed: okręty 6 / limit 6'` |
| 9 | `'⚓ Unknown empire is crewing warships — Reserve entering service: 6 \| ⚓ Liga Trzech Słońc is crewing warships — Reserve entering service: 8'`; oba wpisy na liście dzwonka |
| 10 | `{ok: true, key: 'fleetPopPerHull', value: 16, previous: 32, default: 32}` |
| 11 | `emp_001` limit 13, uzbrojonych 8, z bakiem 2, miejsce 5, pula tak, dołoży `frigate_missile_escort x5`; `emp_002` limit 13, uzbrojonych 6, z bakiem 4, miejsce 7, dołoży `frigate_missile_escort x5, frigate_system_defender x2` |
| T | rok gry przy 1 m/s; w trakcie roku nic widocznego |
| 12 | `61.15` |
| 13 | `'emp_001: +frigate_missile_escort (rok 61) \| emp_002: +frigate_missile_escort (rok 61)'` |
| 14 | `emp_001` uzbrojonych 9 (służba 9, pula 3, z bakiem 3); `emp_002` uzbrojonych 7 (służba 7, pula 7, z bakiem 5) |
| 15 | `'detailed: okręty 9 / limit 13'` |
| P | panel WYWIAD, `emp_001`: siła wojskowa 3978 jednostek bojowych; „armed warships 9 / fleet limit 13”; „Balance of power: they dominate (+555%)”; twoja siła 618; linii „wolnej załogi” brak; polskie „Ostatnie incydenty — (brak)” (→ Finding **412**) |
| 16 | zapisane; R: F5 i „Kontynuuj” |
| 17 | `{pula: 'emp_001:true/rok 61 emp_002:true/rok 61', strojenie: '{"fleetPopPerHull":16}'}` |
| 18 | `''` |
| 19 | te same liczby co w kroku 14 |
| 20 | `{ok: true, reset: ['fleetPopPerHull']}` |
| 21 | `emp_001` limit 6, uzbrojonych 9 (służba 9), z bakiem 3, miejsce 0, pula tak, dołoży `-`; `emp_002` limit 6, uzbrojonych 7 (służba 7), z bakiem 5, miejsce 0, dołoży `-` (tabela: POP 186 i 179; po jednym kadłubie każdego imperium w przestrzeni, reszta w doku) |
| konsola | brak czerwonych wpisów |

**Werdykt: PASS — wszystkie dziesięć kryteriów.**

#### 5e.4 S1-8 (B6, SB27) — przygotowany w sesji domknięcia; ✅ zacommitowany 2026-10-09 (`6b40c30`, §5f.1)

- **Zmiana** (`FleetPoolPlanner.planPool`): dotychczasowy przebieg (`planPass` — plan sprzed SB27) powtarzany na stanie PO
  dołożeniu, dopóki dokłada (bezpiecznik 64 przebiegów). Pierwszy przebieg = poprzedni plan, więc gdy wypełnia wszystko,
  wynik się nie zmienia; pierwszy kadłub planu (odrastanie) też. Konsumenci od razu zgodni: mobilizacja, odrastanie,
  konsola (`pulaDoda`). Przypadki właściciela: limit 2 / 0 → **D, E, E**; KONTROLE bez zmian — 6 / 0 → D, E, E, E, D, E ·
  6 defenderów → +2 E · 3 defendery → +3 E · limit 2 / 2 defendery → +2 E · minimum 0: limit 2 / 0 → D, E.
- **Keeper NEW** `sb1_pool_warp_minimum_smoke` **17/17** (M1–M4: przypadki właściciela, wzorzec bez baku, mobilizacja D, E, E
  bez odrastania w roku 1, konsola = plan = utworzone kadłuby); fail-first na `1a9f95b` i na `1444184`: **9 PASS (wyłącznie
  KONTROLE) / 8 FAIL**. Z góry zatwierdzone przecelowanie `sb1_fleet_pool_smoke` T4a (D, E → D, E, E) — w tym kroku.
- **Dlaczego nie zacommitowany:** bez dalszych przecelowań sweep **270/272** — czerwone **17 asercji**, które kodują ten sam
  przypadek w scenach mobilizacji, zapisu, konsoli, odrastania i wywiadu: `sb1_fleet_pool_smoke` T6b, T6c, T6d, T6e, T6f,
  T6g, T6h, T6i, T7a, T7b, T9a, T9b, T12a, T12b, T12c (15) i `sb1_intel_fleet_smoke` I1a, I3a (2). Reguła sesji: pin
  zostaje czerwony, propozycja przecelowania z dowodem mutacyjnym, pytanie do właściciela.
- **Propozycja R-B6** (`p3/patches_src/proposed/retarget_b6.PROPOSED.py`, łatka `p3/patches/S1C_RB6.PROPOSED.patch`) —
  16 asercji: **R-B6a** T6b–T6i, T7a, T7b (2 → 3 kadłuby, D, E → D, E, E; struktura pinów bez zmian) · **R-B6b** T9a, T9b
  (po mobilizacji z bakiem 2 i plan pusty; bez puli D x1, E x2) · **R-B6c** T12a (odrastanie dla minimum potrzebuje STRATY —
  eskorta zniszczona przed granicą roku 1; T12b i T12c wracają do zieleni bez zmian) · **R-B6d** I1a, I3a (3 / 2) i I3b
  (ta sama strata: odczyt wywiadu 3 → 2 → 3 — bez niej pin byłby zielony, ale jałowy: bez odrośnięcia nie ćwiczy
  odświeżenia).
- **Dowód mutacyjny 4 / 4** (`p3/tools/mutation_rb6.py`): jeden przebieg planu (plan sprzed SB27) — czerwone 26 asercji,
  w tym wszystkie przecelowane; pętla ślepa na minimum — 27; odrastanie nie dokłada — T12a, I3b; wywiad nie odświeża —
  I3b; KONTROLA bez mutacji — zielone; drzewo przywrócone bajt w bajt. ⚠ Pierwsza wersja R-B6c pod mutacją „jeden przebieg”
  rzucała wyjątkiem (`poolOf(…)[2]` = `undefined`) zamiast czerwienić pin — poprawiona (pin degraduje).
- **Z przecelowaniem:** sweep **272/272**, `check-i18n` PASS 3455. Skrypt `p3/tools/commit_B6.sh` (sprawdza HEAD `1444184`,
  czysty `src/`, wypełniony znacznik `<<ZGODA_R-B6>>` w `p3/msg_B6.txt`; łatacze świadome EOL; drzewo na kopii indeksu
  = `ec1bb83`) — test na sucho w świeżym klonie: znacznik niewypełniony → STOP; wypełniony (kopia) → drzewo `ec1bb83`,
  sweep 272/272 `[measured]`.
- **Co zmieni w grze:** w świecie z limitem 2 wojna tworzy od razu 3 kadłuby (2 z bakiem) zamiast 2 + eskorty rok później;
  na fixture (limit 6, 6 defenderów) — bez zmian (+2 E już przy mobilizacji).

#### 5e.5 S1-9 – S1-11 (B7, B8, B9) `[measured]`

- **B7 / SB28** (`8d13485`): `StrikesBackTuning.checkWarpPair` po walidacji klucza, przed zapisem — `sbSet('fleetPoolPattern',
  wzorzec bez baku)` przy minimum > 0 → `pattern_without_warp`, „Najpierw: sbSet('fleetMinWarpHulls', 0)”; odwrotnie
  `sbSet('fleetMinWarpHulls', n > 0)` (także `sbReset` minimum do domyślnej 2) przy wzorcu bez baku → `min_warp_without_tank`,
  „Najpierw: sbSet('fleetPoolPattern', [...]) z jednym z: frigate_laser_escort, frigate_missile_escort”. Reset wzorca i całej
  tabeli — przyjęte; odmowa klucza ma pierwszeństwo; odmowa niczego nie zmienia. Keeper NEW `sb1_tuning_warp_pair_smoke`
  **14/14**, fail-first na `1a9f95b` **5 / 9** (zielone wyłącznie KONTROLE). Odczyt wartości zapisanych bez zmian (patrz
  pytanie 2, §5e.7).
- **B8 / SB29** (`5dc04d0`): `DirectorMobilization.parityGuardAllows` — guard `empireOutgunnedByPlayer` reguły
  `mobilize_reserve` przepuszcza imperium w wojnie ze zmobilizowaną pulą; w pokoju i bez puli — porównanie sił bez zmian;
  reparacje blokują jak dotąd (drugi guard). Najmniejsza zmiana: jeden guard, ta sama reguła (rzut, cooldown, porcja 2)
  i ta sama ścieżka powiadomienia (`director:mobilized` → istniejący wpis w dzwonku przy kontakcie). Pomiar (sonda
  `p3/probes/b8_time_to_service.mjs`, oba ziarna, każde imperium osobno; kadłub ukończony prawdziwym szwem stoczni po
  mobilizacji puli; imperium silniejsze od gracza): przed — po 10 latach w rezerwie (4 / 4); po — w służbie po **2**
  (`emp_002`) i **15** (`emp_001`) miesiącach; KONTROLA w pokoju — w rezerwie na obu drzewach. Keeper NEW
  `sb1_war_reserve_smoke` **11/11** (strony wojny i pokoju, reparacje z nie-jałowością, zakres „wymaga puli”, katalog),
  fail-first na `8d13485` **6 / 5**.
- **B9** (`1444184`, tylko test): keeper NEW `sb1_pool_switch_smoke` **6/6** — wyłącznik `fleetPoolSystem.enabled` w grze
  `true`, w `src/` poza testami jedyny zapis to konstruktor; zapis civ4x przy wyłączniku wyłączonym = przy włączonym, bajt
  w bajt (301 451 znaków, świadek: flaga puli i kadłuby `origin 'pool'` w zapisie); nowa sesja po wczytaniu — włączony.
  Fail-first niemożliwy (stan zastany) — dowód mutacyjny **3 / 3** (`p3/tools/mutation_b9.py`).

#### 5e.6 R-B2b — co pula zmieniła w czterech scenach i czy gracz to zobaczy `[measured]`

Każdy z czterech keeperów uruchomiony w klonie z pulą WŁĄCZONĄ (linia wyłącznika podmieniona tylko na czas pomiaru):

- **`w3_target_selection`** (7 asercji: T4 ×5, T6, T8) — wojna tworzy pulę (D + E z bakiem) w stolicy AI, więc „jeden rajder
  na broniony cel” przestaje być jednym okrętem: odmowa `insufficient_squadron` znika (wynik bez powodu odmowy, rajder
  dostaje rozkaz), a guard „okręt zdolny do skoku” mówi TAK od chwili wojny (eskorta z puli ma bak). **Gracz to zobaczy:** tak — w wojnie
  AI ma od razu eskorty z bakiem i uderza, gdy cel jest w zasięgu, a obrona nie przewyższa eskadry (M3, §5d.6).
- **`wp_ai_peace_offer`** T1f — pula daje imperium 2 kadłuby w służbie (siła 744 przy 0 gracza), więc w ocenie pokoju term
  `relative_power` = **−30**: przy wyczerpaniu 30 / 30 AI odmawia (wynik −20 przy progu −3), bez puli przyjmuje (+10).
  Sonda `p3/probes/rb2b_peace_offer.mjs` (ta sama fikstura, wyczerpanie obu stron 30…100): **bez puli AI przyjmuje pokój
  od 30 / 30, z pulą dopiero od 65 / 65** (60 / 60: −3,5; 65 / 65: −0,75). **Tak — pula zmienia, KIEDY AI proponuje pokój:**
  imperium, któremu pula dała przewagę sił, wysyła depeszę pokojową przy wyższym wyczerpaniu obu stron albo wcale, dopóki
  przewaga trwa. **Gracz to zobaczy:** depesza pokojowa AI przychodzi później; w rozbiciu odmowy przy stole pokojowym — wiersz
  „Układ sił” / „Balance of power” (`diplo.term.relativePower`).
- **`wp_test_infra`** T7a, T7b — ten sam mechanizm: w scenie T7 `changeExhaustion` nie wyzwala depeszy (0 zamiast 1), bo
  `evaluatePeace` mówi NIE przy przewadze sił z puli. **Gracz:** jak wyżej — późniejsza depesza pokojowa.
- **`g3_regrowth`** R9b — wojna z imperium, z którym gracz ma kontakt, tworzy pulę, więc dzwonek dostaje wpis „⚓ … obsadza
  okręty załogami” (`_handleMobilized`): licznik 0 → 1, a pin mierzy dzwonek GLOBALNIE (miał pokazać, że mobilizacja
  garnizonu imperium znanego z plotki nie dzwoni). **Gracz:** tak — wpis o mobilizacji floty w dzwonku (bramka S1, krok 9:
  oba wpisy); to zamierzone powiadomienie floty, nie garnizonu.

#### 5e.7 Pytania do właściciela (otwarte po domknięciu S1)

1. **Zgoda na R-B6** (§5e.4)? Od niej zależy commit S1-8 (`p3/tools/commit_B6.sh`).
2. **SB28 przy wczytaniu:** zapis z niespójną parą (osiągalny wyłącznie z kodu `1a9f95b` przed `8d13485`, czyli w praktyce
   nie) jest przyjmowany jak przed SB28 — plan zgłasza brak z bakiem (`missingWarpTemplate`). Zostawić?
3. **Finding 413** (§6): plan dokłada kadłub bez baku ponad limit, gdy minimum strojone powyżej liczby slotów z bakiem —
   naprawić (część miejsca z minimum wyłącznie kadłubami z bakiem) czy zostawić (przy domyślnym strojeniu nieosiągalny)?

**Odpowiedzi właściciela (2026-10-08, przy podpisie S2):** 1 — **TAK** (dosłownie w treści `6b40c30`: „TAK (właściciel,
2026-10-08): zgoda na R-B6; małe imperia dostają teraz 3 kadłuby zamiast 2, zgodnie z SB27.”) · 2 — **zostaje** (zapis
z niespójną parą przyjmowany jak przed SB28) · 3 — **naprawić** (✅ `dab5e2a`, §5f.1).

#### 5e.8 Następny: S2

Strażnik NA ORBICIE stolicy i drugiego cennego ciała; strażnik drugiego ciała pojawia się przy stolicy i LECI (SB5, SB6).
Audyt S2 (tylko odczyt kodu i pomiar, bez edycji) — raport sesji domknięcia i `p3/results/s2_audit/` (poza repo);
decyzje — przy podpisie S2. → **S2 rozpoczęty 2026-10-09** (decyzje SB30–SB36 — §2; sesja 1 — §5f).

### 5f. S2 — sesja 1 (2026-10-09): S1-8 i 413 zacommitowane; łańcuch B1–B5 PRZYGOTOWANY, NIE zacommitowany; M4; bramka

→ ✅ Łańcuch zacommitowany i S2 zamknięty 2026-10-10 — §5g. Opis niżej to zapis sesji 1.

Polecenie właściciela (2026-10-08 — odpowiedzi przy podpisie S2, decyzje **SB30–SB36**, zgoda na R-B6): A1 — commit S1-8;
A2 — Finding 413 (oba bezpośrednio); B1–B5 — kod S2 przygotowany i zastagowany, **STOP przed commitem**; M4 na fixture;
bramka w przeglądarce; dokumentacja. Zapis **v101 bez migracji**. Sondy, wyniki, łatki, skrypty i notatka przekazania:
`kosmos-handover/ai-strikes-back-s2/` (poza repo).

#### 5f.1 Commity bezpośrednie `[git]`

| commit | drzewo | krok | temat | sweep · `check-i18n` `[measured]` |
|---|---|---|---|---|
| `6b40c30` | `23b6322` | A1 = S1-8 (B6 + R-B6) | plan puli do skutku (SB27); zgoda dosłownie w treści | 272/272 · PASS 3455 |
| `dab5e2a` | `a3408b9` | A2 = Finding 413 | miejsce wynikające z minimum kadłubów z bakiem wypełniane WYŁĄCZNIE szablonami z bakiem | 273/273 · PASS 3455 |

A1 — skrypt S1 `p3/tools/commit_B6.sh` (znacznik `<<ZGODA_R-B6>>` wypełniony odpowiedzią właściciela). A2 — keeper NEW
`sb1_pool_tank_only_smoke` **10/10**, fail-first na `6b40c30` **5 / 5** (zielone wyłącznie KONTROLE); wyrocznia: planer
sprzed poprawki odtworzony na **32 805 / 32 805** wejściach; poprawiony różni się na **2 349** — wszystkie to przypadki
413 (0 różnic poza nimi) `[measured]`. numstat: `FleetPoolPlanner.js` 18/6, keeper 155/0.

#### 5f.2 Decyzje

**SB30–SB36** (§2) — odpowiedzi właściciela przy podpisie S2 (2026-10-08). Bez nowej decyzji w tej sesji.

#### 5f.3 Łańcuch B1–B5 — przygotowany w sesji 1; ✅ zacommitowany 2026-10-10 (§5g.1)

Zmierzony w klonie poza repo na `dab5e2a` (gałąź „code” = sam kod; gałąź „green” = kod + przecelowanie R-S2-3 od B3);
drzewa kroków odtworzone na commicie tej dokumentacji — `trees.txt` w folderze przekazania (podrzewo `src` identyczne).

| krok | temat | keeper NEW (asercje) · fail-first na bazie `[measured]` | sweep kod · z R-S2-3 · `check-i18n` `[measured]` |
|---|---|---|---|
| B1 | **414** (SB36): `IntelSystem._onVesselArrived` — przylot podnosi wywiad gracza WYŁĄCZNIE dla statku gracza | `sb2_intel_arrival_owner_smoke` 5 · na `dab5e2a` 3 / 2 | 274/274 · — · PASS 3455 |
| B2 | **406** (SB35): `dropTroop` odmawia `no_orbital_dominance` (bramka silnika, wersja (b)); klucz `drop.lostDominance` PL + EN; napis w otwartej mapie kolonii | `sb2_drop_dominance_smoke` 9 · na B1 3 / 6 | 275/275 · — · PASS 3456 (+1 klucz) |
| B3 | strażnik stolicy (SB30, SB31, SB33, SB34): przy mobilizacji kadłub-strażnik z doku na orbitę stolicy (`undockToOrbit`), bez kadłuba w służbie — pierwsza granica miesiąca, na której jest; roster `director.doctrine.<id>.guard`; doktryny i pula uderzenia pomijają strażnika; zepchnięty wraca; klucz `fleetGuardsPerBody`; wyłącznik puli obejmuje strażników | `sb2_capital_guard_smoke` 26 · na B2 3 / 16 (19 wykonanych: sceny bez strażnika degradują do jednej czerwonej) | 272/276 · 276/276 · PASS 3456 |
| B4 | drugie ciało (SB32): najcenniejsze ciało w układzie stolicy poza stolicą (porządek planera garnizonu), tylko przy DRUGIM kadłubie-strażniku; lot `moveToPoint` ze stolicy | `sb2_second_guard_smoke` 11 · na B3 + R 2 / 9 | 273/277 · 277/277 · PASS 3456 |
| B5 | zastępstwo (SB33): utrata (wrak, brak, przejęty, poza służbą) odnotowana miesięcznie, zastępca WYŁĄCZNIE na granicy roku z doku stolicy; stanowisko ciała, które przestało być strzeżone — rozwiązane; utracone stanowisko stolicy rezerwuje pierwszy kadłub-strażnik; odczyt `[sb] straze …` pod tabelą `KOSMOS.debug.sbTuning()` i `KOSMOS.fleetPoolSystem.guardPosts(id)` | `sb2_guard_replacement_smoke` 20 · na B4 + R 3 / 17 | 274/278 · 278/278 · PASS 3456 |

Czerwone w stanie „kod” (B3–B5) — wyłącznie cztery keepery z §5f.4. NEW `src/utils/GuardPostPlanner.js` (czyste funkcje +
odczyt świata; bez importu tabeli strojenia — tę czytają wyłącznie konsola i pula, pin `sb1_fleet_tuning_smoke` T11).
numstat `[git]` (żaden plik nie jest przewrócony): B1 `IntelSystem.js` 6/1 · B2 `Vessel.js` 21/3, `ColonyOverlay.js` 4/1,
`WarSystem.js` 2/2, `pl.js` 1/0, `en.js` 1/0 · B3 `FleetPoolSystem.js` 157/3, `DirectorDoctrine.js` 48/4,
`DirectorOffensive.js` 2/0, `DebugLog.js` 6/0, `StrikesBackData.js` 6/0, `FleetLimit.js` 5/0, `GuardPostPlanner.js` 56/0 ·
B4 `FleetPoolSystem.js` 10/7, `GuardPostPlanner.js` 39/9 · B5 `FleetPoolSystem.js` 93/12, `GuardPostPlanner.js` 34/0,
`FleetLimit.js` 5/0, `DebugLog.js` 4/0; keepery 111 / 178 / 340 / 171 / 275 linii.

#### 5f.4 Przecelowanie R-S2-3 — ✅ ZATWIERDZONE 2026-10-10 (§5g.1; zapis sesji 1 niżej)

SB33 (strażnik na orbicie od chwili mobilizacji) odwraca **13 asercji w 4 keeperach** `[measured]`: `g2_war_gate` W2a,
świadek A, W11e (kapsuły w wojnie na stolicę AI — od S2 strażnik odbiera dominację) · `sb0_fleet_defects` T4, T4a, T4b,
T4c, T4f, T4g, T7a, T7c (tło sceny „bez kadłubów AI w układzie”) · `sb1_fleet_pool` T6c i `sb1_pool_warp_minimum` M3a
(„pula w doku”). Propozycja: **R-S2-3a** — setup pięciu scen wyłącza pulę (`fleetPoolSystem.enabled = false`, wzór R-B2b),
asercje bez zmian; **R-S2-3b** — T6c i M3a: defender z puli na ORBICIE stolicy (strażnik), eskorty w doku (struktura pinu
bez zmian). numstat: `g2_war_gate` 9/0, `sb0_fleet_defects` 6/0, `sb1_fleet_pool` 4/2, `sb1_pool_warp_minimum` 4/2.
**Dowód mutacyjny 8 / 8** (`tools/mutation_rs2_3.py`): pula ignoruje wyłącznik — wracają dokładnie czerwone z kodu (zieleń
R-S2-3a wyłącznie od wyłącznika) · 394 wraca (zadokowany „walczy”) · 393 + 394 wracają (predykat sprzed S0) · bramka wojny
odmawia także w wojnie · strażnik dopiero miesiąc po mobilizacji · cała pula na orbitę · orbita bez ciała (dryf) ·
strażnikiem kadłub Z bakiem; KONTROLA bez mutacji zielona; drzewo przywrócone bajt w bajt.

#### 5f.5 M4 — fixture GATE-S4, prawdziwa gra (izolowany headless Chrome), krok 1 miesiąc `[measured]`

Wojna z oboma imperiami, 120 miesięcy (10 lat gry); KONTROLE: ten sam przebieg na `dab5e2a` (przed S2) i pokój na obu
drzewach. Wyniki: `results/m4/` (zestawienie `m4_summary.txt`).

- **Stanowiska:** `emp_002` — przy mobilizacji (60,12): stolica `entity_232` ← `v_32` (defender z puli, dok → orbita),
  drugie ciało `entity_231` (2,47 AU) ← `v_36` (lot; na orbicie od odczytu m4, 60,45). `emp_001` — na pierwszej granicy
  miesiąca (60,20; obudzona rezerwa przechodzi do służby miesiąc): stolica `entity_115` ← `v_27`, `entity_117` (1,33 AU)
  ← `v_28` (lot; na orbicie od odczytu m5, 60,53). Lot drugiego strażnika: 3–4 miesiące. Potem bez zmian do końca 10 lat.
- **Dominacja gracza nad stolicami (co miesiąc):** kod — `emp_001` `false` m1–m120, `emp_002` `false` m0–m120; kontrola
  `dab5e2a` — oba `false` m1–m120 (patrole `v_26`, `v_34` w locie). S2 nie zmienia miesięcznego obrazu na tym zapisie
  (patrol odbierał dominację od 1. miesiąca) — zmienia, KTO ją odbiera: kod `v_26, v_27, v_28` / `v_32, v_36`; kontrola
  `v_26` (+ `v_29` od m49) / `v_34`. **Pokój:** bez puli i stanowisk, dominacja `true` 120 / 120 miesięcy (oba drzewa).
- **Doktryny:** `emp_002` traci patrol — oba defendery są strażnikami, `defend_home` bierze eskorty (`v_33`, `v_34`),
  `patrol_border` przez 10 lat nie dostaje kadłuba (kontrola: patrol `v_34` od 60,20). `emp_001` — start jak w kontroli
  (`defend_home` `v_24`, `v_25`, patrol `v_26` przy 60,20); drugi patrol kontroli (`v_29` od 64,20) w kodzie nie powstaje
  — `v_29` w `defend_home` od 63,20 (`v_27`, `v_28` to strażnicy).
- **Uderzenie:** strażników w puli uderzenia 0 w każdym ze 120 odczytów (pula `emp_001` = 2 eskorty, `emp_002` = 4);
  `director:strikeRefused` `target_beyond_reach` przy 64,20 i 69,28 — tak samo w kontroli. Wykluczenie strażników nie
  zmienia decyzji uderzenia na tym zapisie.
- **Bitwy** (10 powtórzeń; 3 fregaty gracza `hull_frigate + weapon_laser` 2 AU od stolicy `emp_001`, rozkaz na stolicę;
  w starciu krok 1/270 civY na ~112 ms — auto-slow; przeglądarka losuje bez ziarna): pierwsza bitwa po 0,25–1,83 roku;
  **39 bitew**, wraki gracza **22 / 30**, wraki strażników **9**; kontroler orbity na końcu: `emp_001` **9 / 10**, gracz
  1 / 10. Strażnik przegrywający wycofuje się (`AutoRetreatSystem`) na ciało układu (`entity_116`, `entity_117`,
  `entity_115`); w M4 każdy wycofany strażnik zginął albo wrócił kolejnym odwrotem, zanim kontrola miesięczna wydała mu
  powrót — **0** zdarzeń `fleetGuard:returnOrdered` w 10 przebiegach (powrót zepchniętego strażnika pokazują keeper
  `sb2_capital_guard_smoke` G4 i bramka S2, kroki 19–21). Drugi strażnik (`v_28` przy `entity_117`) w żadnym przebiegu nie
  został wrakiem i na koniec stał na stanowisku.
- **Zastępstwo:** 9 utrat w bitwach, 5 wraków sondy (przebiegi bez utraty strażnika — r0, r1, r4, r5, r6: strażnik
  stolicy zniszczony produkcyjną ścieżką wraku po fazie bitwy) i scena bez fregat (wrak `v_27` przy 60,28 → utrata
  odnotowana 60,37 → zastępca `v_29` przy 61,03): każda z 15 zastąpiona na najbliższej granicy roku, **0,25–0,92 roku**
  po utracie; zastępcy z doku stolicy (`v_29`, `v_24`, `v_25`).
- **Zapis i wczytanie** (po 2 miesiącach wojny): stanowiska, orbity i trwające loty identyczne przed i po; loty dokończone
  po wczytaniu (+2 i +3 miesiące); **0** zdarzeń `fleetGuard:*` po wczytaniu.
- **Co zobaczy właściciel:** przy wojnie dwa istniejące wpisy dzwonka „⚓ … is crewing warships” (Finding 409); strażników
  NIE widać (kontakt wywiadu ze strażnikami `none` na końcu 10 lat); desant na stolicę AI — przycisk „Drop Troops”
  wyszarzony („brak dominacji”), a tryb zrzutu otwarty przed utratą dominacji kończy się napisem **„Orbital dominance lost
  — landing aborted”**; atak trzech fregat na stolicę `emp_001` przeważnie kończy się ich utratą; `emp_002` nie patroluje.
- ⚠ **Finding 416** (§6): po bitwie ocalałe fregaty gracza zostają `in_transit` z rozkazem `moveToPoint` i nie docierają
  do stolicy — liczba bitw w tym pomiarze zależy od tego zjawiska; przyczyna niezmierzona.

#### 5f.6 Bramka S2 — scenariusz (poza repo: `gate/GATE_S2.md`)

Fixture GATE-S4, **gra po angielsku**; 31 kroków z konsolą, 6 kroków czasu, F5. Każdy jednolinijkowiec wykonany w prawdziwej
grze (izolowany Chrome, `kosmos_cdp.mjs` z opcją języka): kod sesji — trzy przebiegi, wartości kroków z konsolą identyczne;
KONTROLA `d055a05`. Rozróżnienia `[measured]`: krok 14 (406) — kod: „Orbital dominance lost — landing aborted”, jednostka
w ładowni; kontrola: „⚔ Landing complete — the planet stays open, command your troops”, jednostka na `entity_115` · krok
18b (414) — kod: wyłącznie `unknown→rumor (debug_set_intel)`; kontrola: `rumor→contact (vessel_arrived:entity_208)` · krok
5 (SB27) — kod: `emp_002` dołoży D, E, E; kontrola: D, E · krok 22 (415) — pierścienie ruchu od statków AI przy kamerze na
`sys_home`: kod 12, kontrola 5. ⚠ Napis prośby o kafel w trybie zrzutu jest po polsku także w grze EN
(`ColonyOverlay._showDropPrompt`) — rodzina Findingu **375**.

#### 5f.7 Pytania do właściciela (odpowiedzi 2026-10-10 — §5g.5)

1. **Zgoda na R-S2-3** (R-S2-3a + R-S2-3b, §5f.4)? Od niej zależy tryb skryptu commitów.
2. **Zepchnięty strażnik wraca na orbitę** na granicy miesiąca (po odwrocie, z doku, z innego ciała) — dodane bez osobnego
   podpisu jako wykonanie „trzyma orbitę” (SB33). Zostawić?
3. **Rezerwa dla utraconego stanowiska stolicy:** pierwszy kadłub-strażnik z doku czeka do granicy roku na stolicę, drugie
   ciało dostaje kadłub tylko, gdy jest kolejny — dodane bez podpisu (pomiar w B5: bez tego wolny defender leciał co
   miesiąc na nowe drugie stanowisko, a stolica czekała na granicę roku pusta). Zostawić?
4. **`emp_002` bez patrolu** (oba defendery strażnikami — SB31) — zostawić?
5. **Finding 416** — audyt teraz czy przy S3?
6. Bramka S2 przed commitami czy po?

### 5g. S2 — zamknięcie (2026-10-10): commity łańcucha, bramka PASS, audyt 416 i ustaleń bramki

Polecenie właściciela (2026-10-10): zgoda na przecelowanie R-S2-3 (a i b); commit łańcucha; audyt Findingu 416 i pięciu
ustaleń z bramki (tylko odczyt); zamknięcie dokumentacji. Zapis **v101 bez migracji**. Sondy, wyniki i notatka przekazania:
`kosmos-handover/ai-strikes-back-s2/close/` (poza repo).

#### 5g.1 Commity `[git]`

| commit | drzewo | krok | sweep · `check-i18n` `[measured]` |
|---|---|---|---|
| `bf498d1` | `2fa4baf` | B1 — Finding 414 (SB36) | 274/274 · PASS 3455 |
| `013fd75` | `777bd25` | B2 — Finding 406 (SB35) | 275/275 · PASS 3456 |
| `d3fc782` | `56aa563` | B3 + R-S2-3 — strażnik stolicy (SB30, SB31, SB33, SB34) | 276/276 · PASS 3456 |
| `17c60f3` | `9b0b6cd` | B4 — drugie ciało (SB32) | 277/277 · PASS 3456 |
| `0eaa105` | `7005f79` | B5 — zastępstwo i odczyt (SB33) | 278/278 · PASS 3456 |

Skrypt `tools/commit_S2.sh all` (folder przekazania): drzewa kroków = `patches/trees.txt` co do bitu (te same pięć co test
na sucho); bez „Permission denied”. Zgoda dosłownie w treści `d3fc782`: „TAK (właściciel, 2026-10-10): zgoda na R-S2-3a
i R-S2-3b.” numstat jak w §5f.3 — żaden plik nie jest przewrócony. Sweep i `check-i18n` każdego commita w świeżym klonie
(LF); HEAD dodatkowo w repo właściciela (sześć plików CRLF): **278/278**, PASS pl = en = **3456**. EOL drzewa roboczego jak
w stanie zestagowanym: CRLF z CR = LF w `IntelSystem.js` 679, `Vessel.js` 957, `ColonyOverlay.js` 5794, `DebugLog.js` 227,
`DirectorDoctrine.js` 404, `DirectorOffensive.js` 498; pozostałe LF. Uprząż C1 (pokój, 100 lat, ziarna `default`
i `987654321`, warianty passive / press / pressPaid): **6/6 przebiegów identycznych z wynikiem S1** (`after_B9`) po
zdjęciu `elapsed`; w żadnym przebiegu nie ma wojny; KONTROLA porównania: `after_B9` wobec audytu fazy A — różne
`[measured]`.

#### 5g.2 Bramka S2 — zapis (2026-10-10, właściciel, przeglądarka)

Fixture GATE-S4-fresh-gy60; kod = drzewo indeksu `993b299` (B1–B5 bez przecelowania — przecelowanie dotyka wyłącznie
keeperów); gra po angielsku. Odczyty właściciela `[measured: odczyt właściciela]`.

**Przebieg 1 — przerwany na kroku 11:** kroki 0–9 zgodne z oczekiwaniem (rok 60,17; krok 3 `{ok: false, powod:
'pattern_without_warp', klucz: 'fleetPoolPattern'}`; krok 5 — `emp_002` dołoży `frigate_system_defender` ×1,
`frigate_missile_escort` ×2; krok 8 — `emp_001` oba stanowiska wolne, `emp_002` stolica = `v_32` na orbicie, drugie
wolne; krok 9 — `emp_001` dominacja `true`; `emp_002` `false`, `v_32:orbiting@entity_232`). Właściciel przypadkiem kliknął
kafel przy własnej dominacji — jednostka wylądowała, jak powinna.

**Przebieg 2** (F5 i wczytanie z pliku):

| krok | odczyt |
|---|---|
| 0 | `{rok: 60.14, rezerwa001: 6}` |
| 4 | `{ok: true, poprzednia: 32, teraz: 10000}` |
| 6 | `'rumor'` |
| 7 | `emp_001: pula +2 (2 w planie), obudzona rezerwa 6, limit 2 \| emp_002: pula +3 (3 w planie), obudzona rezerwa 0, limit 2 \|\| dzwonek: ⚓ Unknown empire is crewing warships — Reserve entering service: 3` |
| 10 | `{statek: 'v_35 Szerpa', jednostka: 'gu_27', zaladowano: true, kapsuly: true, nadCialem: 'entity_115 (sys_059)'}` |
| 11 | `{trybZrzutu: true, komunikat: '⚔ Zrzut shock_infantry — wybierz hex (1 jednostka)', jednostka: 'gu_27:in_cargo@entity_2'}` |
| T1 | rok 60,25; okno wyniku bitwy DEFEAT; Dziennik — bitwa przegrana z Liga Trzech Słońc (§5g.4, C1 i C2) |
| 12 | `emp_001: entity_115(stolica)=v_24 orbita, entity_117(drugie)=v_25 lot \| emp_002: entity_232(stolica)=v_32 orbita, entity_231(drugie)=- wolne` |
| 13 | `emp_001` dominacja `false`: `v_24:orbiting@entity_115`, `v_25:in_transit@-`; `emp_002` `false`: `v_32:orbiting@entity_232` |
| 14 | klik kafla lądu; na ekranie „Landing aborted” (utrata dominacji); `{trybZrzutu: false, komunikat: 'Orbital dominance lost — landing aborted', jednostka: 'gu_27:in_cargo@entity_2'}` |
| 15 | `{gotoweDoUderzenia: 'v_30,v_31', straznicy: 'v_24,v_25', wspolne: '—'}` |
| 16 | `'brak wolnej eskorty'`; 414 sprawdzone na locie drugiego strażnika: 18b PRZED — `'unknown→rumor (debug_set_intel)'`; T2 rok 60,53 |
| 17 | `v_24`, `v_25`, `v_32` na orbicie, drugie stanowisko `emp_002` wolne; 18b PO — `'unknown→rumor (debug_set_intel)'` |
| 19 | `{straznik: 'v_24', stan: 'docked', przy: 'entity_115'}` |
| 20 | `emp_001` dominacja `false`: `v_25:orbiting@entity_117`, `v_26:in_transit@-` |
| T3 · 21 | rok 60,63 · `v_24` znowu na orbicie |
| 22 | `{wszystkie: 8, odStatkowAI: 8}`; pierwsze: `v_32` (`sys_020`), `v_24`, `v_25`, `v_25`, `v_26`, `v_1` (`sys_059`) — wszystkie `@widok sys_home` |
| 23 · R | zapisano; F5 i „Continue” |
| 24 | stanowiska bez zmian; strojenie `'{"fleetPopPerHull":10000}'` |
| T4 · 25 | rok 60,78 · `obsadzeniaOdF5: 0`, stanowiska bez zmian |
| 26 · T5 | `{ok: true, poprzednia: 1, teraz: 2}` · rok 60,91 |
| 27 | `emp_001: entity_115(stolica)=v_24 orbita, entity_115(stolica)=v_27 orbita, entity_117(drugie)=v_25 orbita, entity_117(drugie)=v_28 lot \| emp_002: entity_232(stolica)=v_32 orbita, entity_232(stolica)=- wolne, entity_231(drugie)=- wolne, entity_231(drugie)=- wolne` |
| 28 · T6 | `{ok: true, zresetowane: 'fleetPopPerHull, fleetGuardsPerBody'}` |
| 29 | `emp_001: entity_115(stolica)=v_24 orbita, entity_117(drugie)=v_25 orbita \| emp_002: entity_232(stolica)=v_32 orbita, entity_231(drugie)=- wolne` |

Konsola: właściciel nie wkleił czerwonych wpisów — nie potwierdzone wprost. Pierścieni 415 nie zgłosił, że widział.
**WERDYKT: PASS.** ⚠ Krok 14 nie mógł zajść tak, jak zapisano w scenariuszu: transportowiec zniszczono w czasie T1, odmowa
zrzutu przyszła napisem utraty dominacji, a jednostka została w ładowni WRAKU (§5g.4, C1 i C2).

#### 5g.3 Finding 416 — audyt (część B, tylko odczyt)

- **Przyczyna — nie bitwa i nie „utknięcie”.** `[code]` `MovementOrderSystem._issueMoveToPoint` przewiduje pozycję ciała
  RAZ — na chwilę dolotu liczoną po linii prostej do BIEŻĄCEJ pozycji ciała (`:940-941`), trasę liczy do tego punktu
  (`:968`), a `arrivalYear` — z długości TRASY (`:994`). Gdy ciało krąży szybciej, niż leci statek, te dwie chwile się
  rozjeżdżają; w chwili przylotu ciało jest gdzie indziej, a detekcja przylotu (`VesselManager._updatePositions`, `:2657`)
  przestawia statek na ŻYWĄ pozycję ciała.
- `[measured]` (fixture, prawdziwa gra): stolica `entity_115` (a 1,443 AU, T 1,406 roku) krąży z prędkością **6,68 AU/rok**,
  fregata `hull_frigate` — **1,11 AU/rok**. Rozkaz z 2 AU: dolot po linii prostej **1,795 roku**; trasa do punktu
  przewidzianego 0,28–4,21 AU zależnie od kąta startu (12 kątów) → dolot **0,25–3,78 roku**; w chwili przylotu ciało jest
  **0,20–2,88 AU** od punktu.
- Scena M4 (r0) odtworzona z pełnym śladem: `v_32` i `v_34` nie należały do żadnego starcia (`sideA: ['v_33']`), ich misja
  nie była wstrzymywana ani wznawiana (`departYear` 60,2841 bez zmian), `arrivalYear` **63,98** i **63,55** — po 3-letnim
  oknie M4. Przebieg 4,6 roku: `v_32` doleciał dokładnie w 64,038 i **przeskoczył 1,47 AU** na ciało stolicy (potem zginął
  w bitwie ze strażnikiem); `v_34` spotkał strażnika 0,53 AU od stolicy (63,45) i zginął. Przebieg r5 (remis 61,70 i
  przegrana 62,29) nie był odtwarzany — wznowienie po bitwie liczy dolot inną drogą (`_resumeMissionAfterOrder`), więc
  jego liczby nie są tu objaśnione `[nie zmierzone]`.
- **Własnymi rozkazami gracza:** fregaty gracza z fixture'u (`v_21`–`v_23`) nie mają napędu warp (`warpFuel.max` 0) — do
  `sys_059` nie dolecą. W układzie domowym `v_21` z doku przy `entity_2`, rozkaz `OrderService.issueMove` (ścieżka PPM) na
  planetę HD-4177 f (`entity_6`, 3,6 AU/rok): dolot po linii prostej 2,47 roku, z trasy 4,47 roku; statek leciał 4,47 roku
  (61,28 → 65,75), dystans do planety 2,75 → 3,02 → 2,22 → 6,53 AU, przy przylocie **przeskok 6,53 AU**. Na 62 ciałach
  układu domowego przeskok przy przylocie sięga **9,7 AU** ⇒ **osiągalne w normalnej grze** przy każdym rozkazie ruchu na
  ciało, które krąży szybciej, niż leci statek.
- **Notatka S0 („`engage` zawisa 0,86–0,88 AU od celu”):** ten sam korzeń (ciało szybsze od statku; warstwa rozkazów nie
  przechwytuje ruchomego ciała), inna mechanika. `_tickEngageOrder` goni punkt z `_computeInterceptPoint` (`:1458`), liczony
  z `target.velocity`, a prędkość kadłuba zadokowanego i orbitującego jest co tik zerowana (`VesselManager.js:2443`), choć
  jego pozycja jedzie z ciałem ⇒ pościg za celem 6× szybszym się nie zamyka. Na kodzie S2 (fixture): `engage` na strażnika
  na orbicie — dystans 0,68–4,15 AU przez 2 lata, **0 bitew** `[measured]`.
- **Kadłuby AI:** ta sama ścieżka (`attack` i powrót to `moveToPoint`; wznowienie po bitwie — `_resumeMissionAfterOrder`).
  Patrol `v_26` (`emp_001`): rozkaz 60,20, przylot 63,95 (3,75 roku), po wygranej bitwie misja wznowiona `[measured]`.
  Wznowienie liczy `arrivalYear` z odległości do BIEŻĄCEJ pozycji ciała, a trasę — do pozycji przewidzianej (`:2759-2764`):
  rozjazd w drugą stronę — przylot na czas, ale trasa pokonywana szybciej niż prędkość statku `[code]`.
- **Najmniejszy kształt poprawki:** jeden pomocnik w `VesselManager` — czas przechwycenia ciała: pierwszy `t`, dla którego
  trasa do pozycji ciała w chwili `t` mieści się w `t − teraz` przy prędkości statku (przeszukanie w przód z krokiem np.
  0,01 roku, do jednego okresu ciała ponad prosty dolot); cel = pozycja w `t`, `arrivalYear` = teraz + trasa / prędkość.
  Wołany w `_issueMoveToPoint` i `_resumeMissionAfterOrder`; `engage` na kadłub zadokowany lub orbitujący — punkt pościgu
  z ruchu ciała (`dockedAt`), nie z `velocity` 0. Przeskok przy przylocie spada do ruchu ciała w jednym kroku (6,68 AU/rok ×
  0,01 = 0,07 AU).
- **Keepery zagrożone** (grep `arrivalYear`, `_resumeMissionAfterOrder`, `moveToPoint` na ciało): `moveto_body_snap`,
  `moveto_orbit_groundtruth`, `moveto_no_return`, `w3_attack_dispatch`, `w3_cross_system_attack`, `w3_raider_lever`,
  `ai_strike_recall`, `cross_system_move_composite`, `system_scope_orders`, `fleet_return_per_member`,
  `return_dock_family`, `preempt_order`, `vo3b_order_clear`, `order_blocked_resume`, `player_combat_mission_pause`,
  `ai_combat_mission_pause`, `sb2_second_guard`, `sb2_guard_replacement`; do sprawdzenia ślad
  `F273-patrol-trace-baseline` (gdy punkt POI trafia w ciało).
- **Rekomendacja:** poprawka jako osobny slice PRZED S3 — S3 stoi na czasie i miejscu przylotu (eskadra z transportowcem,
  desant po wygranej orbicie), a na dzisiejszym kodzie eskorta i transportowiec dolecą w różnych chwilach i z przeskokiem.
  Opis 416 przepisany w §6.

#### 5g.4 Ustalenia bramki (część C, tylko odczyt)

- **C1 — bitwa z transportowcem w czasie ciągłym; czy przyrząd umie prawdziwy zegar.** `[measured]` Walidator robi jeden
  `time:tick` na miesiąc (`__sbTick(1)`), a gra na pauzie między krokami — walka DSCS (rundy co 110 ms czasu
  rzeczywistego) nie ma kiedy zajść. Pętla gry w izolowanym headless Chrome też tego nie odda: rAF daje tam rzadkie, duże
  klatki (przebieg „odpauzuj przy 1 m/s” — wszystkie zdarzenia miesiąca w jednym tiku, 60,2712). Przyrząd UMIE prowadzić
  prawdziwy zegar sam: co ~16 ms realnych `TimeSystem.update(dt)` z prawdziwym `dt` (≤ 100 ms), przy wybranej prędkości, z
  auto-slow gry i „OK” okna wyniku bitwy, a między klatkami pauza (jak `GameScene.gameLoop`). Kroki 0–11 bramki + 2 miesiące
  w tym trybie: 720 klatek, ~40 s; transportowiec zniszczony w pierwszym miesiącu w **5 z 5** przebiegów (60,21–60,26), w
  trybie miesięcznym — nigdy. Zalecenie: kroki czasu bramki, w których ma zajść walka, w trybie klatek.
- **C2 — wrak z ładunkiem.** `[measured]` Odczyt właściciela odtworzony: `v_35` wrak `orbiting@-`, ładownia `[gu_27]`,
  jednostka `in_cargo`, tryb zrzutu otwarty. Po przywróceniu dominacji gracza (kadłuby AI w układzie zniszczone ścieżką
  wraku — narzędzie sondy) `dropTroop(wrak, gu_27, …)` zwraca **`{ok: true}`**, jednostka ląduje (`idle@entity_115`).
  `[code]` Projekt mówi, że jednostki w ładowni giną ze statkiem (`VesselManager.destroyVessel`, `:1224`, przyczyna
  `transport_lost`) — ale wrak nie przechodzi przez `destroyVessel`: `_turnIntoWreck` nie dotyka ładowni, `dropTroop` nie
  pyta o wrak, a sprzątanie wraku po 30 latach gry (`_tickWreckCleanup`, `:2000`) kasuje statek z rejestru z pominięciem
  `destroyVessel` — jednostki zostają na zawsze `in_cargo`, a ich POP zablokowane. → **Finding 418**.
- **C3 — `v_24`/`v_25` u właściciela, `v_27`/`v_28` w walidatorze.** `time:tick` subskrybują kolejno `VesselManager` (koniec
  mobilizacji rezerwy), `AlienCivSystem` (Director co skumulowany 1 civY) i `FleetPoolSystem` (stanowiska na granicy
  miesiąca kalendarzowego) `[code]`. W kroku miesięcznym wszystko dzieje się w jednym tiku: rezerwa wchodzi do służby,
  Director przydziela `defend_home` `v_24`/`v_25` i patrol `v_26`, stanowiska biorą wolne `v_27`/`v_28`. W czasie ciągłym
  o kolejności decyduje faza akumulatora Directora. `[measured]` 5 przebiegów klatkowych: 4 × Director w klatce końca
  mobilizacji → `v_27`/`v_28`, transportowiec zniszczony przez patrol `v_26`; 1 × Director 0,008 roku PRZED końcem
  mobilizacji → `defend_home` dostają eskorty puli `v_30`/`v_31`, a na granicy 60,25 strażnikami zostają `v_24`/`v_25`;
  transportowiec niszczą strażnicy — dokładnie obraz właściciela. Puste stanowisko: `_pickGuardHull` bierze najpierw
  kadłuby bez roli, potem garnizon `defend_home`; pomija tylko patrol i kadłuby z misją lub rozkazem `[code]` — w każdym
  przebiegu oba stanowiska `emp_001` obsadzone na pierwszej granicy miesiąca po mobilizacji (wcześniej brak kadłuba w
  służbie — zgodnie z projektem). Drugie stanowisko `emp_002` puste w każdej kolejności, bo przy limicie 2 (`fleetPopPerHull`
  10 000) pula ma jeden kadłub bez baku.
- **C4 — „contact → rumor” w konsoli, „unknown→rumor” w audycie.** `[code]` `KOSMOS.debug.setIntel` (`GameScene.js:1209`)
  czyta poziom przed (`contact`), kasuje rekord SUROWYM zapisem do `unknown` (`gameState.set`, powód
  `debug_set_intel_reset` — bez `intel:levelChanged`), po czym podnosi go ścieżką produkcyjną `advanceIntel(…, 'rumor',
  'debug_set_intel')`, która emituje `intel:levelChanged` z `unknown` jako poziomem wyjściowym. Konsola drukuje zmianę
  netto, audyt — tylko krok produkcyjny. Bez defektu.
- **C5 — 415 potwierdzony licznikiem** (8 pierścieni, wszystkie od statków AI, widok `sys_home`). Najmniejszy kształt
  poprawki `[code]`: na wejściu `ThreeRenderer._spawnMovementPulse` (`:6452`) ta sama bramka układu co subskrybent sprite'a
  (`vessel.systemId !== activeSystemId → return`, `:797-800`) oraz dla kadłuba wroga ta sama bramka wywiadu co jego sprite
  (`_applyVesselIntelVisibility`). Keeperów zagrożonych brak (renderer nie importuje się pod node; grep
  `_spawnMovementPulse`/`fcMovementFx` w keeperach — 0).
- Przy okazji audytu `[measured]`: **Finding 417** — wrak, którego misja była wstrzymana na czas walki, wznawia ją i leci
  do celu; **Finding 419** — dwa starcia gracza z tym samym imperium rozpoczęte w tym samym 0,01 roku gry mają ten sam
  identyfikator, drugie nadpisuje pierwsze, a statki gracza z pierwszego zostają zamrożone na zawsze (§6).

#### 5g.5 Odpowiedzi właściciela (2026-10-10)

1 — **TAK**, zgoda na R-S2-3a i R-S2-3b (dosłownie w treści `d3fc782`) · 2 — **SB37** · 3 — **SB38** · 4 — `emp_002` bez
patrolu **zostaje** · 5 — Finding 416: **audyt teraz** (§5g.3) · 6 — bramka przed commitami (PASS, §5g.2).

#### 5g.6 Pytania do właściciela (otwarte po zamknięciu S2)

1. **416** — poprawka (czas przechwycenia ciała, §5g.3) jako osobny slice przed S3?
2. **417, 418, 419** — kiedy (przed S3, razem z 416, czy w S3)?
3. **Bramka S3** — kroki czasu z walką w trybie klatek (C1)?

→ Odpowiedzi 2026-10-10 (polecenie S2b): 1 — tak, przed S3 (**SB39**); 2 — przed S3, w tym samym slice'ie (**SB40–SB42**);
3 — tak: w przyrządzie każdy krok czasu, w którym liczy się walka albo ruch, idzie w trybie klatek (§5h).

#### 5g.7 Następny: S3

Eskadra z transportowcem, desant po wygranej orbicie, odbijanie, fale (SB7, SB8, SB11, SB22, SB23) — po S2b (§5h).

### 5h. S2b — poprawki przed S3 (2026-10-10/11): 416, 417, 418, 419, 415 — łańcuch PRZYGOTOWANY, NIE zacommitowany

> ✅ **Zamknięte 2026-10-11 — §5i** (commity, poprawki 424 i 425, bramka PASS, SB45–SB48). Treść niżej — stan z chwili
> przygotowania łańcucha.

Polecenie właściciela (2026-10-10, decyzje **SB39–SB44**): audyt, pięć poprawek jako łańcuch zestagowany (**STOP przed
commitem**), pomiar, bramka w przeglądarce, dokumentacja. Zapis **v101 bez migracji**; klucze i18n dodane / usunięte:
**0 / 0** (`drop.failed` i `vessel.reasonVesselIsWreck` istniały). Sondy, wyniki, łatki, skrypty i notatka przekazania:
`kosmos-handover/ai-strikes-back-s2b/` (poza repo). Kotwica: HEAD `f3fb8e0`, sweep **278/278**, `check-i18n` 3456.

#### 5h.1 Audyt (część A) `[code]` `[git]`

- **416:** rodziny ścieżek wymagające zmiany wg SB39 — **trzy** (próg „więcej niż trzy” nieprzekroczony): **R1** rozkaz
  `moveToPoint` na ciało (z wariantem floty `_arrivalSyncYear`; producenci: PPM, uderzenie, dok, odwrót, Powrót, dostawa po
  warpie, recall AI, doktryny, lot strażnika), **R2** wznowienie misji (`_resumeMissionAfterOrder` — po bitwie i po
  rozkazie), **R3** pościg `engage`. Wspólny korzeń: `_predictPosition` liczy pozycję ciała na JEDNĄ chwilę, żadna ścieżka
  nie szukała chwili, w której statek i ciało są w tym samym miejscu, a prędkość kadłuba zadokowanego i orbitującego jest
  co tik zerowana. Poza SB39 — raport, nietknięte: misje `MissionSystem` i kurierzy AI (R4 → **422**), `intercept`
  (R5 → **423**), eskorta (R6, rodzina 264). Historia: predykcja raz — `5ec0e1f`; `arrivalYear` z trasy i
  `_arrivalSyncYear` — `113f9a0`; wznowienie — `ed7ea3e`; pościg `engage` — `e91dabc`.
- **417:** misję wraku wznawia wyłącznie `VesselManager._resumeMissionAfterOrder` (subskrypcje `orderCompleted` /
  `orderCancelled` / `orderBlocked`; `_onVesselWrecked` w MOS anuluje rozkaz wraku), a `_updatePositions` prowadził wrak
  z misją jak lot i dokował przy przylocie. Bramki wraku: MOS `issueOrder`, `dispatchOnMission`, `dispatchInterstellar`,
  utrzymanie; `redispatchFromOrbit` bez bramki — utajone (→ **425**).
- **418:** jednostki w ładowni giną ze statkiem wyłącznie w `destroyVessel` (`groundUnit:destroyed`, `transport_lost`,
  `1384452`); wrak tamtędy nie przechodził, `_tickWreckCleanup` (`61756be`) kasował wrak z pominięciem `destroyVessel`.
- **419:** `_makeEncounterId` = rok z 2 miejscami + strony (`59701be`); bliźniak `VesselCombatSystem._makeBattleId` na
  ścieżce wycofania (→ **424**).
- **415:** `_spawnMovementPulse` bez bramki układu i wywiadu (`8da65ed`); wzór bramek: sprite statku (`:797-800`) i jego
  wywiad (`_applyVesselIntelVisibility`).

#### 5h.2 Łańcuch B1–B5 (część B) — przygotowany, zestagowany, NIE zacommitowany

Zmierzony w świeżym klonie poza repo na `f3fb8e0`; drzewa kroków odtworzone na commicie tej dokumentacji —
`patches/trees.txt` w folderze przekazania (podrzewo `src` identyczne).

| krok | temat | keeper NEW (asercje) · fail-first na poprzednim kroku `[measured]` | sweep · `check-i18n` `[measured]` |
|---|---|---|---|
| B1 | **416** (SB39): `VesselManager._interceptBody` + `_bodyMotionBound` — czas przechwycenia ciała (pierwsza chwila, w której trasa do pozycji ciała mieści się w prędkości statku: przeszukanie w przód krokiem zachowawczym, vMax ciała z Keplera, potem bisekcja; najpierw linia prosta, potem trasa; `notBefore` — przylot floty nie wcześniej niż synchronizacja); `_issueMoveToPoint` i `_resumeMissionAfterOrder` — punkt i `arrivalYear` z przechwycenia; `_tickEngageOrder` + `_bodyChasePoint` — pościg za celem przy ciele z ruchu ciała | `sb2b_body_intercept_smoke` 20 · na `f3fb8e0` 11 / 9 | 279/279 · PASS 3456 |
| B2 | **417** (SB40): `_resumeMissionAfterOrder` — wrak zdejmuje migawkę i wraca; `_updatePositions` — wrak bez ciała nie jest prowadzony (orbita cmentarna przy ciele bez zmian) | `sb2b_wreck_still_smoke` 11 · 5 / 6 | 280/280 · PASS 3456 |
| B3 | **418** (SB41): `vessel:wrecked` → `_killCargoGroundUnits` (`groundUnit:destroyed`, `transport_lost`, przed `removeUnit` — rozliczenie POP jak każda śmierć) — ta sama droga w `destroyVessel` i `_tickWreckCleanup`; `dropTroop` odmawia `vessel_is_wreck` (NEW `VESSEL_IS_WRECK`); `ColonyOverlay._closeDropModeOnWreck` zamyka otwarty tryb zrzutu z powodem | `sb2b_wreck_cargo_smoke` 17 · 8 / 9 | 281/281 · PASS 3456 |
| B4 | **419** (SB42): `_makeEncounterId` — sufiks `_2`, `_3`…, gdy id zajęte w `_activeEncounters` albo w `gameState.battles` (format bez sufiksu bez zmian) | `sb2b_encounter_id_smoke` 8 · 3 / 5 | 282/282 · PASS 3456 |
| B5 | **415** (SB43): NEW `isMovementPulseVisible` (`VesselFxLogic.js`) + bramka na wejściu `_spawnMovementPulse` — układ statku (w skoku warp: układ startu) = oglądany; statek spoza floty gracza tylko przy wywiadzie ≥ `contact` | `sb2b_pulse_scope_smoke` 10 · 1 / 9 | 283/283 · PASS 3456 |

Czerwone w fail-first — dokładnie piny naprawy; zielone po obu stronach — kontrole. Żaden istniejący keeper nie został
zmieniony; propozycji przecelowania (`*.PROPOSED`) brak. numstat `[git]` (żaden plik nie jest przewrócony): B1
`MovementOrderSystem.js` 46/7, `VesselManager.js` 99/2 · B2 `VesselManager.js` 12/0 · B3 `Vessel.js` 5/0,
`VesselManager.js` 38/21, `ColonyOverlay.js` 16/1 · B4 `DeepSpaceCombatSystem.js` 14/2 · B5 `ThreeRenderer.js` 12/1,
`VesselFxLogic.js` 13/0; keepery 314 / 176 / 209 / 150 / 81 linii. EOL: pliki CRLF w drzewie właściciela (`Vessel.js`,
`ColonyOverlay.js`, `ThreeRenderer.js`) zostają CRLF, LF — LF (skrypt stagingu sprawdza).
⚠ **Korekta w sesji (pomiar przed stagingiem):** pierwsza wersja B1 przy synchronizacji floty nieosiągalnej w chwili
`_arrivalSyncYear` wracała do WŁASNEGO najwcześniejszego przechwycenia członka — także WCZEŚNIEJ niż synchronizacja (scena
floty, 4/10 przebiegów, r4: przyloty 0,88–1,03 roku przy synchronizacji 1,795). Kontrakt synchronizacji floty mówi, że nikt
nie przylatuje przed nią — poprawione (`notBefore`, keeper T6b–T6c) przed stagingiem; łańcuch zawiera wyłącznie wersję
poprawioną.
⚠ **B3 — kształt kodu, nie przecelowanie:** pierwsza wersja (warunek wstawiony przy subskrypcjach `ColonyOverlay`)
czerwieniła dwa źródłowe piny „pierwsze wystąpienie” (`colony_order_guard` G4, `ground_troops_reachable` T5); kod
przeniesiony do metody po `_finishDropMode` — oba piny zielone bez edycji.

#### 5h.3 Pomiary (część C) — fixture GATE-S4, prawdziwa gra (izolowany headless Chrome), CZAS W TRYBIE KLATEK `[measured]`

Klatka co ~16 ms realnych, `TimeSystem.update(dt)`, `dt` ≤ 100 ms, 1m/s, auto-slow przy walce, okno wyniku = „OK”; nigdy
krok miesięczny (C1, §5g.4). Przebiegi „po” na łańcuchu S2b; pomiary 12 kątów, `v_21`, `engage`, lotów AI i bitew
3 fregat — na pierwszej wersji B1, która od ostatecznej różni się WYŁĄCZNIE gałęzią synchronizacji floty (bez
`_arrivalSyncYear` obie dają tę samą liczbę; B2–B5 identyczne — `patch-id`).

**416 — 12 kątów startu** (fregata 1,114 AU/rok, 2 AU od stolicy `emp_001`, `moveToPoint` na ciało; stolica 6,68 AU/rok):

| | przed (`f3fb8e0`) | po (S2b) |
|---|---|---|
| lot (lata) | 0,520–3,809 | 0,276–2,643 |
| przylot − ETA (lata) | ≤ 0,003 | ≤ 0,004 |
| przeskok na ciało przy przylocie | **0,722–2,815 AU** | **0,001–0,029 AU** |

11 z 12 lotów krótszych; k2 dłuższy (0,52 → 1,51 roku), bo „przylot” przed był skokiem o 0,87 AU.
**Rozkaz właściciela** (`v_21` z doku → HD-4177 f, `OrderService.issueMove`, rozkaz w 61,284): przed — ETA 65,753, przylot
65,753, przeskok **6,562 AU**; po — ETA 66,036, przylot 66,037, przeskok **0,002 AU**.
**`engage` na strażnika na orbicie** (fregata 2 AU od stolicy, pozostałe kadłuby `emp_001` w układzie — wraki narzędziem):
przed — kąt 0: **0 bitew w 4,1 roku** (min. 0,46 AU), kąt 0,7: bitwa po 3,93 roku; po — starcie po **2,48** i **2,57** roku.
**Loty AI w wojnie** (bez izolacji, 4,5 roku): patrol `v_26` → `entity_124` (24 AU) — przed przylot − ETA 0,007 roku,
przeskok 0,047 AU; po 0,000 / 0,000. Lot drugiego strażnika `v_25` → `entity_117` — przed 0,001 / **0,236 AU**; po
0,004 / 0,019 AU (ruch ciała w jednej klatce). Kurierzy AI (`MissionSystem`, nietknięte): przylot − ETA ≤ 0,006 roku,
przeskok ≤ 0,010 AU — przed i po.
**Flota** (3 fregaty, jeden rozkaz floty z `_arrivalSyncYear`; po — ostateczny B1): przylot wszystkich naraz przed 3/9, po
3/10; ktoś przed synchronizacją 0 / 0; rozrzut przylotów przed 0–0,879 roku (z przeskokiem do 2,66 AU), po 0–0,227 roku
(→ **420**).
**Bitwy — 3 fregaty gracza (osobne rozkazy `moveToPoint`) na strażnika stolicy, izolacja, 10 przebiegów:**

| | przed | po |
|---|---|---|
| strażnik zniszczony | 6/10 | **0/10** |
| fregaty stracone | 19/30 | **30/30** |
| przyloty wraków (417) | 6 | **0** |
| przebiegi z powtórzonym id starcia (419) | 7/10 | **0/10** (2 starcia z sufiksem) |

Mechanizm (4 + 4 przebiegi z osią czasu bitwy): po — fregaty gracza oddają **0 strzałów** w każdej bitwie, strażnik strzela
z **0,255–0,299 AU** (rakiety 0,30 AU), laser fregaty sięga 0,05 AU, a statek z misją wstrzymaną na walkę stoi tam, gdzie
walka się zaczęła; przed — bitwy po „przylocie” (przeskok na ciało) szły z **0,009–0,021 AU**, laser trafia (9/9, 8/8,
9/10). Zmiana wyniku walki = usunięcie przeskoku, nie zmiana walki (→ **421**). Wariant floty: strażnik zniszczony przed
5/9, po 3/10; fregaty stracone 16/27 → 22/30; przyloty wraków 7 → 0.
**419 — osiągalność:** powtórzone id starcia w **12 z 23** przebiegów przed poprawką (3 fregaty 7/10, flota 3/9,
diagnostyka 2/4); po — **0 z 24**, 11 starć z sufiksem.
**C1 — uprząż** (pokój, 100 lat, ziarna `default` i `987654321`, warianty passive / press / pressPaid): przed i po (ostateczny
łańcuch) — **6/6 identyczne** (json i tekst, po zdjęciu czasu wykonania). Żaden wskaźnik się nie ruszył: gospodarka AI (POP,
fabryki, kolonie, stocznie), kurierzy (`default`: `emp_001` zbudowani 4 / wysłani 36 / dostarczone 32, `emp_002` 4 / 30 / 26;
`987654321`: 4 / 20 / 16 i 4 / 26 / 22), odcisk floty, siła, nacisk, zaległość gracza.

#### 5h.4 Bramka (część D) — scenariusz poza repo: `gate/GATE_S2B.md`

Gra po ANGIELSKU, fixture GATE-S4, widok układu domowego przez całą bramkę; 25 kroków (jedno źródło `gate_steps_s2b.mjs`,
walidator i generator dokumentu); każda linia wykonana w prawdziwej grze w trybie klatek — trzy przebiegi na łańcuchu
(wszystkie z tą samą własnością w każdym kroku), KONTROLA na `f3fb8e0`, 0 błędów konsoli. Kroki: desantowiec z jednostką nad
strzeżoną stolicą — zniszczony, tryb zrzutu zamyka się napisem `Drop failed: vessel is a wreck`, jednostka `transport_lost`
(kontrola: tryb otwarty, jednostka w ładowni wraku) · statek z misją wstrzymaną na walkę — wrak stoi 0 AU od miejsca
zniszczenia przez 5 miesięcy (kontrola: leci, 0,23 → 0,57 AU) · `engage` na strażnika — starcie po 0,90–0,92 roku
(kontrola: brak przez 3 lata) · `v_21` → HD-4177 f — koniec trasy na planecie w chwili ETA, przeskok 0,003–0,004 AU
(kontrola: 4,13 AU i przeskok 4,15 AU) · pierścienie w widoku domowym: 2, oba od `v_21` (kontrola: 29, w tym 25 od statków
AI z `sys_059`). Desantowca nad strzeżoną orbitą nie da się zostawić żywego (zgodnie z zleceniem bramka nie ma kroku
z jego przetrwaniem).

#### 5h.5 Pytania do właściciela (otwarte po S2b)

1. **Commit łańcucha B1–B5** (`tools/commit_S2b.sh`, po bramce)?
2. **420** — synchronizacja floty liczona do bieżącej pozycji ciała: dokładne „lądują razem” wymaga liczenia chwili
   synchronizacji w `FleetSystem` z przechwyceń członków (czwarta rodzina ścieżek — poza progiem zlecenia). Przed S3
   (eskadra z transportowcem) czy w S3?
3. **421** — statek z misją wstrzymaną na walkę stoi tam, gdzie walka się zaczęła; bronią krótszego zasięgu niż odległość
   startu walki nie strzela. Zostaje (do walki służy `engage`), czy walka ma podciągać statek do zasięgu jego broni?
   Dotyczy S3 (desant po wygranej orbicie, eskorta transportowca).
4. **422–425** — raport; kiedy?
5. **SB40** — wrak na orbicie cmentarnej ciała (ścieżka ciała w `_turnIntoWreck`) dalej jedzie z ciałem (keeper T5,
   KONTROLA) — zostaje?

### 5i. S2b — zamknięcie (2026-10-11): commity łańcucha, poprawki 424 i 425, bramka PASS, decyzje SB45–SB48

Polecenie właściciela (2026-10-11): commit zestagowanego łańcucha B1–B5 (bramka w przeglądarce PASS), dwie małe poprawki
podpisane jako **SB47** (424, 425) na dowodzie bez przeglądarki, dokumentacja, przekazanie; potem pomiary do podpisu S3
(wyłącznie odczyt, zmiany próbne tylko w klonie). Kotwica wejścia: HEAD `fa91426`, drzewo indeksu (na kopii) `159c0839`,
sweep zestagowanego drzewa **283/283**, `check-i18n` PASS pl = en = **3456** `[measured]`. Zapis **v101 bez migracji**;
klucze i18n dodane / usunięte: **0 / 0**. Sondy, wyniki, skrypty, notatka: `kosmos-handover/ai-strikes-back-s2b/` (poza
repo).

#### 5i.1 Commity `[git]` `[measured]`

| commit | drzewo | finding (decyzja) | keeper NEW (asercje) · fail-first na poprzednim | sweep · `check-i18n` |
|---|---|---|---|---|
| `a8de641` | `73059666` | **416** (SB39) | `sb2b_body_intercept_smoke` 20 · 11 / 9 | 279/279 · PASS 3456 |
| `bf634c1` | `85818406` | **417** (SB40) | `sb2b_wreck_still_smoke` 11 · 5 / 6 | 280/280 · PASS 3456 |
| `35cdebe` | `de6ed2c3` | **418** (SB41) | `sb2b_wreck_cargo_smoke` 17 · 8 / 9 | 281/281 · PASS 3456 |
| `e2f3285` | `b45ad81a` | **419** (SB42) | `sb2b_encounter_id_smoke` 8 · 3 / 5 | 282/282 · PASS 3456 |
| `d833e0c` | `159c0839` | **415** (SB43) | `sb2b_pulse_scope_smoke` 10 · 1 / 9 | 283/283 · PASS 3456 |
| `5043744` | `407859ff` | **424** (SB47) | `sb2b_battle_id_smoke` 9 · 5 / 4 | 284/284 · PASS 3456 |
| `7b37a4d` | `131e9d28` | **425** (SB47) | `sb2b_redispatch_wreck_smoke` 8 · 4 / 4 | 285/285 · PASS 3456 |

- **B1–B5:** `tools/commit_S2b.sh` (kontrole wejścia: HEAD, drzewo indeksu na kopii = B5, `src/` = indeks; indeks budowany
  od HEAD łatkami) — pięć drzew = `patches/trees.txt` co do bajtu, numstat = §5h.2, drzewo robocze nietknięte (EOL bez
  zmian). Sweep i `check-i18n` B1–B4 — zmierzone w świeżym klonie na identycznych drzewach (`results/verify_chain_D/`);
  B5 — także na drzewie roboczym repo przy wejściu tej sesji, na wolnej maszynie.
- **B6 — 424:** `VesselCombatSystem._makeBattleId` — reguła SB42 (podstawa `battle_ds_<rok>_<A>_<B>` bez zmian, przy zajętym
  `battles.<id>` przyrostek `_2`, `_3`, …); `_applyOutcome` zwraca identyfikator, `_battle` go przekazuje,
  `resolveDeepSpaceBattle` (API debugowe) czyta rekord po nim. Czerwone w fail-first — dokładnie T1a–T1d (dwa
  identyfikatory, dwa rekordy, rekord pierwszej bitwy nietknięty, przyrostek `_2`); mutacja bez przekazania identyfikatora —
  pada strażnik T4a/T4b (zielony po obu stronach fail-first).
- **B7 — 425:** `VesselManager.redispatchFromOrbit` — `if (vessel.isWreck) return false`. Czerwone w fail-first — dokładnie
  T1a–T1c i T3a; kontrole: wrak przechodzi obie bramki sprzed poprawki (`orbiting`, „w służbie”), żywy statek w tym samym
  stanie wychodzi na misję.
- Żaden istniejący keeper nie został zmieniony ani nie jest czerwony; `*.PROPOSED` — brak. numstat: B6
  `VesselCombatSystem.js` 17/9, keeper 143/0 · B7 `VesselManager.js` 4/0, keeper 108/0; oba pliki LF, CR 0 przed i po.

#### 5i.2 Bramka — zapis (2026-10-11, właściciel, przeglądarka)

Fixture **GATE-S4-fresh-gy60**; kod = drzewo indeksu `159c0839` (zestagowany łańcuch, po commicie — `d833e0c`); gra po
ANGIELSKU; widok `sys_home` przez całą bramkę. Odczyty właściciela (dosłownie; zawinięcia linii z wklejenia złączone):

- **0** `{rok: 60.14, widok: 'sys_home', stolica001: 'entity_115', v21: 'v_21 „Bellator” docked@entity_2 (sys_home)', unieruchomione: 'v_21,v_22,v_23', jezyk: 'en'}`
- **1, 2** — oba narzędzia zgłoszone jako włączone.
- **3** `{kredytyStolicy: 10000000, unieruchomione: 'v_21,v_22,v_23'}`
- **4** `'emp_001: war; pula +2, obudzona rezerwa 6, limit 6'`
- **5** `{statek: 'v_32 Szerpa', jednostka: 'gu_14', zaladowano: true, ladownia: 'gu_14', nadCialem: 'entity_115 (sys_059)', dominacja: true}`
- **6** `{widok: 'sys_home', trybZrzutu: true, komunikat: '⚔ Zrzut shock_infantry — wybierz hex (1 jednostka)', jednostka: 'gu_14:in_cargo@entity_2', statek: 'v_32: sprawny orbiting@entity_115, ładownia gu_14'}`
- **T1** — okno bitwy: DEFEAT; właściciel WIDZIAŁ napis na mapie kolonii.
- **7** `{rok: 60.33, trybZrzutu: false, komunikat: 'Drop failed: vessel is a wreck', jednostka: 'brak w rejestrze', statek: 'v_32: WRAK orbiting@-, ładownia —'}`
- **7b** `{wrakiGracza: 'v_32@60.252 (ładownia w chwili zniszczenia: —)', jednostkiZniszczone: 'gu_14:transport_lost@60.252', starcia: 'encounter_60_25_player_emp_001 [v_32 | v_24,v_25]'}`
- **7c** `{mapaOtwarta: false, widok: 'sys_home'}`
- **8** `{statek: 'v_33 Odkrywca (bez uzbrojenia)', rozkaz: 'ok', misja: 'move_to_point', cel: 'entity_124 Propus k', straznik: 'v_24 orbiting@entity_115', odStraznikaAU: 0.02}`
- **T2** — okno bitwy: DEFEAT.
- **9** `{statek: 'v_33: WRAK orbiting@-', misja: null, migawkaMisji: 'brak', przesuniecieOdMiejscaZniszczeniaAU: 0, przylotyWraku: 0, starcia: 'encounter_60_34_player_emp_001'}`
- **T3** — ok. trzech miesięcy.
- **10** — statek `'v_33: WRAK orbiting@-'`, misja `null`, migawkaMisji `'brak'`, przesunięcie 0, przylotyWraku 0 (ostatnie
  pole zwinięte przy wklejaniu).
- **11** `{straznikStolicy: 'v_24', wrakiNarzedzia: 'v_25,v_26,v_27,v_28,v_29,v_30,v_31', pula: 'wyłączona (narzędzie)'}`
- **12** `{fregata: 'v_34 Gladiator II', rozkaz: 'engage', cel: 'v_24 orbiting@entity_115', odlegloscAU: 2.01}`
- **T4** — bitwa się odbyła; właściciel przegrał.
- **13** `{fregata: 'v_34: WRAK orbiting', rozkaz: null, starciaZeStraznikiem: 'encounter_61_67_player_emp_001 — 1.12 roku po rozkazie', odlegloscOdStraznikaAU: 0.108, rokGry: 61.67}`
- **14** `'rozkaz wydany: v_21 → HD-4177 f'`
- **15** `{statek: 'v_21 Bellator', cel: 'entity_6 HD-4177 f', stan: 'in_transit (move_to_point)', rokRozkazu: 61.673, eta: 67.002, etaWRejestrze: 'ETA: year 67', lotLat: 5.329, koniecTrasyOdPlanetyWChwiliEtaAU: 0}`
- **T5** — do roku 67; właściciel widział statek na orbicie HD-4177 f.
- **16** `{przylot: 67.004, eta: 67.002, przylotMinusEta: 0.002, przeskokNaPlanetePrzyPrzylocieAU: 0.006, stan: 'orbiting@entity_6'}`
- **17** `{widok: 'sys_home', wywolania: {wszystkie: 28, AI_innyUklad: 25, gracz_innyUklad: 1, gracz_ogladanyUklad: 2}, narysowanePierscienie: {wszystkie: 2, AI_innyUklad: 0, gracz_innyUklad: 0, gracz_ogladanyUklad: 2}, przykladyNarysowanych: 'v_21:gracz:sys_home@sys_home | v_21:gracz:sys_home@sys_home'}`

Konsola: właściciel potwierdził — nic czerwonego. **NIE sprawdzone okiem:** chwila przylotu, znacznik ⏱ na końcu trasy,
pierścienie (walidator liczy wartości, nie piksele). **WERDYKT: PASS.**
Co rozstrzyga który odczyt: kroki 5–7c — **418** (SB41: wrak `v_32` zamyka tryb zrzutu napisem, jednostka ginie
`transport_lost`, ładownia pusta); 8–10 — **417** (SB40: wrak `v_33` stoi 0 AU od miejsca zniszczenia, misja `null`, brak
przylotów); 12–13 — **416** (SB39, pościg `engage` za celem na orbicie dochodzi do starcia); 14–16 — **416** (SB39, rozkaz
ruchu: przylot w chwili ETA, przeskok 0,006 AU); 17 — **415** (SB43: narysowane wyłącznie pierścienie statku gracza
z oglądanego układu).
⚠ **Do 421:** fregata z rozkazem `engage` skończyła jako wrak **0,108 AU** od strażnika — poza zasięgiem swojego lasera
(0,05 AU) `[measured: odczyt właściciela]`.

#### 5i.3 Korekta notatki kroku T4 w `GATE_S2B.md`

Notatka kroku T4 (`gate/GATE_S2B.md`, poza repo) podaje: „zmierzone: ok. **2,5 roku** gry po rozkazie, ~30 s”. To NIE jest
liczba ze sceny bramki: walidator zmierzył w scenie bramki starcie fregaty ze strażnikiem **0,90–0,92 roku** po rozkazie
(cztery przebiegi — ta sama liczba stoi w tabeli kontroli tego samego dokumentu i w §5h.4), właściciel — **1,12 roku**
(krok 13) `[measured]`. Wartość ~2,5 roku odpowiada pomiarowi części C (§5h.3: 2,48 i 2,57 roku), wykonanemu w innej scenie
`[doc]`. Sam plik bramki zostaje bez zmian (zapis tego, co właściciel dostał); korekta — tutaj i w notatce przekazania.

#### 5i.4 Odpowiedzi na pytania §5h.5 → decyzje (2026-10-11)

1. **Commit łańcucha B1–B5** — tak, po bramce (PASS) → wykonany (§5i.1).
2. **420** → **SB45** (S3, w commicie przylotu eskadry AI razem; jeden pomocnik dla flot gracza i eskadry AI).
3. **421** → **SB46** (kierunek: statek w starciu bez wroga w zasięgu własnej broni zbliża się na ten zasięg, strażnik
   trzyma orbitę; kształt po pomiarze części E; kod — pierwszy commit S3).
4. **422–425** → **SB47** (424 i 425 — teraz, po jednym commicie, na dowodzie bez przeglądarki; 422 i 423 — raport do
   zamknięcia arca).
5. **Wrak na orbicie cmentarnej ciała jedzie z ciałem** → **SB48** (zostaje).

#### 5i.5 Następny krok — S3

Pierwszy commit S3 — **421** (SB46), po podpisie kształtu na liczbach części E. **420** (SB45) — w commicie, w którym
eskadra AI przylatuje razem. **151** (SB44) — z ostrzeżeniem o nadlatującej flocie. Pomiary części E (421) i F (liczby do
podpisu S3: eskadra, fale desantu, przelot, ostrzeżenie) — wyłącznie odczyt, w klonie; wyniki i rekomendacje w notatce
przekazania zamknięcia S2b (`HANDOVER_S2B_CLOSED.md`, poza repo).

### 5j. S3 — sesja 1 z 2 (2026-10-11): 421, 420, eskadra z ładunkiem — łańcuch PRZYGOTOWANY, NIE zacommitowany; M5; bramka

> **Zamknięcie sesji 1 — §5k (2026-10-12):** commity łańcucha po zgodzie na R-S3, zapis bramki S3A (PASS), decyzje
> **SB61–SB67**. Ta sekcja opisuje stan PRZED commitem.

Polecenie właściciela (2026-10-11): sesja 1 S3 — zbliżenie w starciu (421), eskadra lecąca razem (420), transportowiec
z prawdziwym ładunkiem i desant z ładunku; bez reguły odbijania i bez zmiany detekcji; kod ZESTAGOWANY, NIE zacommitowany.
Podpis **SB49–SB60** (§2). Kotwica wejścia: HEAD `2a09ac9` (drzewo `efcf55ee`), indeks = HEAD (sprawdzone na kopii
indeksu), pozycje obce statusu identyczne z wejściem S2b, sweep **285/285**, `check-i18n` PASS pl = en = **3456**,
SHA256SUMS S2b **918 / 918** `[measured]`. Zapis **v101 bez migracji**; klucze i18n dodane / usunięte: **0 / 0**. Audyt
(część A), sondy, wyniki, skrypty, bramka, notatka: `kosmos-handover/ai-strikes-back-s3/` (poza repo).

#### 5j.1 Audyt (część A) — ustalenia, które ustawiły kształt `[code]` `[measured]`

- **B1 (SB49):** próba O2E z S2b (`PART_E_421.md`) ruszała statek także przy wrogu w zasięgu (pasmo 0,95–1,0 × zasięg)
  i zawsze na najbliższego wroga; podpis — ruch WYŁĄCZNIE bez żadnego wroga w zasięgu własnej broni, cel `engage` pierwszy.
  Kiting `engage` w `MovementOrderSystem` trzyma 0,9025–0,98 × zasięg — 0,95 leży w tym paśmie. Widoczny krok na rundę
  (co 110 ms): fregata z laserem 0,028 AU (~4 px przy domyślnej kamerze), eskorta 0,154 AU (~21 px) `[derived]`.
- **B2 (SB54):** siedem mechanizmów „trzymania razem” — żaden nie łączy SKOKU; composite `OrderService` nie zna grupy;
  punkt przylotu po skoku losowany `Math.random()` osobno dla każdego statku (`VesselManager.js:2975-2976`, Finding
  **428**). `mission`, `pendingOrder` i `movementOrder` zapisywane kopią płytką ⇒ nowe pola bez migracji.
- **B3 (SB51–SB53, SB55):** `transport_assault` = `hull_large`, ładownia **32**, **42,894 AU/rok**, bak warp 5,
  nieuzbrojony (poza limitem floty — SB23); pule Directora (doktryny, uderzenie, odwołanie) wymagają `hasWeapons` —
  transportowca po desancie nikt nie zabiera (Finding **434**). `_onVesselGroupVictory` liczył POJEMNOŚĆ i TWORZYŁ jednostki
  (**396**, **384**). Wejścia desantu AI: (1) `_onVesselGroupVictory` ← bitwa `EnemyAttackHandler` (jedyna z graczem po
  stronie B); (2) gałąź floty abstrakcyjnej (bez producentów od W3-8); (3) dźwignia `WarOverlay force_invasion`.
- **Próg STOP:** migracja — nie; rodziny ścieżek: B1 — 1, B2 — 3, B3 — 2 + nowe wejście (eskadra) ⇒ kod.
  Raport: `AUDIT_S3_PART_A.md` (poza repo).

#### 5j.2 Łańcuch — PRZYGOTOWANY, NIE zacommitowany `[git]` `[measured]`

Zbudowany w świeżym klonie z łatek (`tools/build_chain_S3.sh`), zweryfikowany (`tools/verify_chain_S3.sh --sweep`: drzewa,
fail-first każdego nowego keepera na poprzednim kroku, pełny sweep i `check-i18n` na każdym kroku); drzewa niżej — na
`2a09ac9`; na commicie tej dokumentacji — `patches/trees.txt` w folderze przekazania.

| krok | treść | drzewo (na `2a09ac9`) | keeper NEW (asercje) · fail-first na poprzednim | sweep · `check-i18n` |
|---|---|---|---|---|
| **S3-1** | **421** (SB49) | `8b6a593b` | `sb3_combat_closing_smoke` 28 · 7 / 21 — zielone wyłącznie kontrole (T1-0, T1-0b, T1b, T5a, T5b, T7-0, T8-0) | 286/286 · PASS 3456 |
| **S3-2** | **420** (SB54, SB45) | `e8d9b759` | `sb3_group_arrival_smoke` 26 · 6 / 20 — zielone wyłącznie kontrole (T2-0, T2c, T4a–d) | 287/287 · PASS 3456 |
| **S3-3** (kod) | SB51–SB53, SB55 (**396**, **384**) | `a8556f6e` | `sb3_squadron_smoke` 41 · 1 / 40 — zielona wyłącznie kontrola T10a | **283/288** — czerwone wyłącznie 5 keeperów R-S3 · PASS 3456 |
| **S3-3 + R-S3** | jw. + przecelowanie (PROPOSED) | `21f28f97` | — | **288/288** · PASS 3456 |

- **S3-1 — `DeepSpaceCombatSystem._closeToWeaponRange`**, wołane przed KAŻDĄ rundą (pętla rund `_tick`, przed
  `_tickEncounter`): uzbrojony statek starcia bez żywego wroga w zasięgu najdłuższej własnej broni (`_resolveWeaponRange`,
  z mnożnikami techu) zbliża się do celu `engage` (dopóki żyje jako wróg tego starcia), inaczej do najbliższego wroga, na
  `CLOSE_RANGE_FACTOR` 0,95 × zasięg, krokiem `speedAU × CLOSE_STEP_YEARS` (`CIV_PER_ROUND / CIV_TIME_SCALE` = 0,025 roku
  gry na rundę). Stoją: statek z `dockedAt` (strażnik trzyma orbitę), uciekający (`_isRetreatingFromCombat` — jedno źródło
  z `_allOutsideOf`), statek `in_transit` (własna misja), wrak, bezbronny. Scena keepera T1 (3 fregaty z laserem na
  strażnika z 0,25 AU): 14 rund, 8 strzałów fregat, wszystkie z 0,0475 AU; na `2a09ac9` 0 strzałów.
- **S3-2 — NEW `src/utils/GroupArrival.js`** (`groupArrivalYear`: najwcześniejsze przechwycenie każdego członka
  — `_interceptBody`, SB39 — chwila = najpóźniejsze z nich, iteracja z `notBefore` aż każdy dosięga ciała w tej samej
  chwili; opcjonalna klamra rdzeń / odstający) · `FleetSystem._bodyGroupArrival` (cel-ciało floty gracza, klamra 10×;
  linia `_arrivalSyncYear: gameYear + fleetEta` bez zmian) · `OrderService.issueGroupAttack` (WYŁĄCZNIE kadłuby AI;
  wszystko albo nic przed skokiem; JEDEN kąt na grupę → `dispatchInterstellar(…, {arrivalAngle})` → `mission.arrivalAngle`,
  czytany w `_tickInterstellar`, bez niego — `Math.random`) · `_maybeDeliverGroup` (odcinek w układzie celu, gdy jest tam
  CAŁA grupa) · `_issueGroupLeg` (rozkaz `attack` każdego członka z `_arrivalSyncYear` = chwila grupy) ·
  `_regroupAfterBattle` (`battle:resolved` — grupa w locie dostaje znowu jedną chwilę). Audyt `order:groupLegIssued`
  w `DebugLog.TRACKED_EVENTS`. Keeper T2 (flota gracza 1,114 / 2,0 / 3,5 AU/rok na ciało o okresie 1,406 roku): przylot
  102,4360 dla wszystkich (na S3-1: 102,4180 / 101,7960 / 101,7960).
- **S3-3 — NEW `src/systems/StrikeSquadronSystem.js`** (`launchSquadron`: walidacja eskorty przed utworzeniem czegokolwiek;
  transportowiec `createAIVessel` przy stolicy, pochodzenie `squadron`; fala `createAIUnit` + `loadGroundUnit`; grupa
  `issueGroupAttack`; rekord `gameState.strikeSquadrons.<id>` `launched` → `landed` / `transport_lost`; odmowa po utworzeniu
  cofa transportowiec i jednostki; audyt `squadron:launched` / `squadron:launchRefused`) · NEW
  `src/utils/StrikeWavePlanner.js` (fala i odczyt `printStrikeWaves`) · klucz `strikeWaveShare` (typ `number` 0–1, nowa
  gałąź walidacji) · `InvasionSystem._landCargo` (desant DOKŁADNIE z ładowni ocalałych zrzutowców przez `dropTroop`; pusta
  ładownia → `invasion:blocked` `empty_cargo`; klamra `MAX_TROOPS_PER_VESSEL_LANDING` usunięta; rekord kampanii wydzielony
  do `_recordLanding`) · `GameScene` i `GameCore` (lokator) · konsola `KOSMOS.debug.sbLaunchSquadron`, `sbTuning().fala`.
  **Z liczby (nie z ładunku) ląduje dalej wyłącznie `launchInvasion`:** dźwignia `WarOverlay force_invasion` i martwa gałąź
  floty abstrakcyjnej.
- **numstat** (blob, LF): S3-1 `DeepSpaceCombatSystem.js` 69/2, keeper 294/0 · S3-2 `DebugLog.js` 3/0, `FleetSystem.js` 30/0,
  `OrderService.js` 140/3, `VesselManager.js` 5/1, `GroupArrival.js` 81/0, keeper 317/0 · S3-3 `DebugLog.js` 4/0,
  `GameState.js` 4/0, `StrikesBackData.js` 9/1, `GameScene.js` 31/2, `InvasionSystem.js` 63/24, `StrikeSquadronSystem.js`
  198/0, `GameCore.js` 4/0, `StrikeWavePlanner.js` 110/0, `StrikesBackTuning.js` 8/0, keeper 346/0 · R-S3: 9/1, 8/0, 6/4,
  2/1, 16/1. Żaden commit nie odwraca całego pliku. **EOL:** `DebugLog.js`, `GameState.js`, `InvasionSystem.js`,
  `OrderService.js` i `GameCore.js` CRLF w drzewie właściciela zostają CRLF (zapis `tools/eolwrite.py`; test na sucho
  trzech wariantów commitów na kopiach bajtów właściciela).

**Przecelowanie R-S3 — PROPOSED, czeka na zgodę (piny zostają czerwone na kodzie):**

| przecelowanie | czerwone na kodzie S3-3 (SB52 / SB53) | propozycja |
|---|---|---|
| **R-S3-1** | `sb1_fleet_tuning` T11b („StrikesBackTuning importują GameScene i FleetLimit”) | trzeci czytelnik tabeli — planer fali (`utils/StrikeWavePlanner.js`) |
| **R-S3-2** | `sb1_fleet_tuning` T12b · `sb1_pool_warp_minimum` M4d (dosłowny kształt `sbTuning()`) | `sbTuning()` drukuje też falę: `…, fala: printStrikeWaves(window.KOSMOS)` |
| **R-S3-3** | `w3_ai_invasion` T1, T3 (kontrola), T4, T5, T7 (kontrola) · `ai_capture_outpost` T1 · `sb0_fleet_defects` T5f — desant z PUSTEJ ładowni (zachowanie 396) | zrzutowiec dostaje w setupie 2 jednostki AI utworzone przy stolicy (`createAIUnit`) i załadowane (`loadGroundUnit`); asercje bez zmian |

**Dowód mutacyjny** (`tools/mutate_RS3.mjs`, `mutate_RS3_extra.mjs` → `results/mutation/`): kontrola bez mutacji zielona
przed i po, drzewo przywrócone bajt w bajt po każdym mutancie; **8 z 9 mutantów zabitych** od razu — MR1a (czwarty
czytelnik tabeli) i MR1b (planer nie czyta tabeli) → T11b; MR2a (`sbTuning()` bez fali) i MR2b (bez floty) → T12b i M4d;
MR3b (bramka dominacji zdjęta) → `w3` T2 SEDNO, `sb0` T5e; MR3c (desant nigdy nie ląduje) → `w3` T1/T3/T4/T5/T7,
`ai_capture` T1, `sb0` T5f; MR3d (placówka znów poza celami) → `ai_capture` T1 SEDNO. **MR3a** (filtr wraku w
`_onVesselGroupVictory`) — w S3 RÓWNOWAŻNY: druga bramka SB41 w `dropTroop` odmawia wrakowi; po zdjęciu obu bramek
`w3` T4 SEDNO pada (4 ≤ 3), na `2a09ac9` pada od samego filtra (6 ≤ 3). **MR3e** (cel z `getAllColonies`) przeżywa
także na `2a09ac9` — słabość pinu T5 sprzed S3 (Finding **433**).

#### 5j.3 M5 — fixture GATE-S4, prawdziwa gra w izolowanym headless Chrome, tryb klatek `[measured]`

Kod = łańcuch S3-3 (kod) w klonie; gra po angielsku; czas: klatki co ~16 ms realnych (dt ≤ 100 ms), 1 m/s poza walką,
auto-slow przy walce zostaje; 3 przebiegi równolegle. Sondy `probes/m5/` (poza repo).

**Część E S2b powtórzona na kodzie S3** (10 przebiegów na scenę; baza `2a09ac9` — `PART_E_421.md`):

| scena | strzały GRACZA (trafienia) · odległość | strzały AI | straty gracza (żywe przy limicie 20 rund) | wróg zniszczony | baza `2a09ac9` |
|---|---|---|---|---|---|
| (a) 3 fregaty z laserem, `engage` na strażnika stolicy `emp_001` | **94 (87)** · 0,038–0,049 AU | 194 (110) | 25/30 (1) | strażnik **4/10** | 0 · 180 · 30/30 (9) · 0/10 |
| (b) jw., `moveToPoint` na ciało stolicy | **76 (71)** · 0,030–0,050 AU | 162 (99) | 23/30 (3) | **4/10** | 0 · 182 · 30/30 (9) · 0/10 |
| (c) 3 fregaty NA ORBICIE domu, 2 eskorty `attack` | 210 (200) · 0,000–0,002 AU | 35 (22) | 1/30 | eskorty 20/20 | 209 (200) · 39 · 1/30 · 20/20 |
| (d) jw., fregaty ZADOKOWANE (bitwa planetarna) | — | — | 9/30 | 14/20 (AI wygrywa 3/10) | 6/30 · 16/20 (2/10) |

(c) i (d) bez zmian charakteru — (c) to „przypięcie” (426), (d) bitwa planetarna, której S3 nie dotyka (różnica 2/10 → 3/10 to
losowość chwil przylotu). Jeden przebieg (d) zawisł (odpowiedź CDP nie doszła), drugi padł na zamknięciu karty — oba
powtórzone; w zestawieniu 10/10 ważnych.

**Eskadra `emp_001` → planeta macierzysta gracza** (dźwignia `sbLaunchSquadron`, transportowiec + 2 albo 3 eskorty; przy
3 eskortach `fleetMinWarpHulls` 3 przed wojną; uderzenie Directora wyłączone na instancji — eskadra jest jedynym napastnikiem;
fregaty gracza z fixture'u → rezerwa, obrona sceny = 3 fregaty z laserem):

| eskorty · obrona domu | przebiegi | skok: rozrzut punktu · chwili | lot do ciała (lata, mediana) · rozrzut przylotu (dolecieli) | bitwy (wygrywa) | straty eskadry · fregat gracza | desant (transportowiec żywy · = ładunek) | kolonia upadła (mies. po desancie, mediana) | fala zniszczona |
|---|---|---|---|---|---|---|---|---|
| 2 · 3 fregaty ZADOKOWANE | 10/10 | 0.000 AU · 0.0 d | 5.14–5.65 (5.28) · 0.00 d | planetarna AI 10 | 0/30 · 30/30 | 10/10 (10 · 10) | 10/10 (11.0–13.7; 12.0) | 0 |
| 2 · 3 fregaty NA ORBICIE | 10/10 | 0.000 AU · 0.0 d | — · — | DSCS gracz 17 | 30/30 · 6/30 | 0/10 (0 · 0) | 0/10 | 10 (transport_lost 60) |
| 2 · brak statków | 10/10 | 0.000 AU · 0.0 d | 5.17–5.64 (5.41) · 0.00 d | planetarna AI 10 | 0/30 · — | 10/10 (10 · 10) | 10/10 (11.1–13.5; 12.6) | 0 |
| 3 · 3 fregaty ZADOKOWANE | 10/10 | 0.000 AU · 0.0 d | 5.19–5.64 (5.49) · 0.00 d | planetarna AI 10 | 0/40 · 30/30 | 10/10 (10 · 10) | 10/10 (11.9–14.3; 12.7) | 0 |
| 3 · 3 fregaty NA ORBICIE | 10/10 | 0.000 AU · 0.0 d | 5.11–5.42 (5.22) · 0.00 d | DSCS AI 7, planetarna AI 7, DSCS gracz 3 | 25/40 · 24/30 | 7/10 (7 · 7) | 7/10 (11.2–13.8; 11.6) | 3 (transport_lost 18) |
| 3 · brak statków | 10/10 | 0.000 AU · 0.0 d | 5.14–5.65 (5.52) · 0.00 d | planetarna AI 10 | 0/40 · — | 10/10 (10 · 10) | 10/10 (11.1–13.2; 12.3) | 0 |

Odwołanie eskorty (DirectorRecall) po desancie: 2_docked 10/10 (0.0–1.0 mies.) · 2_orbit 0/10 · 2_none 10/10 (0.1–1.1 mies.) · 3_docked 10/10 (0.2–0.9 mies.) · 3_orbit 7/10 (0.2–0.9 mies.) · 3_none 10/10 (0.1–1.0 mies.); transportowiec na orbicie celu z pustą ładownią na końcu przebiegu po każdym desancie: 2_docked 10/10 · 2_orbit 0/0 · 2_none 10/10 · 3_docked 10/10 · 3_orbit 7/7 · 3_none 10/10; błędy przebiegu / wpisy konsoli err/exc: 0 / 0.

(60 przebiegów, 10 na wariant; liczby z plików przebiegów — `probes/m5/table_m5.mjs`; liczby w tabeli z kropką dziesiętną,
jak w wynikach sondy.) **KONTROLA M5** (3 przebiegi, `2_ctl`): te same kadłuby — 2 eskorty z bakiem i transportowiec z falą 6 — wysłane OSOBNO
starą ścieżką `issueAttack`, dom bez statków: punkty skoku rozrzucone o **24,3–59,8 AU** (trzy różne punkty okręgu 30 AU);
transportowiec dolatuje SAM po 1,19–1,24 roku (eskorta w chwili przejęcia kolonii — 2,17–2,26 roku po starcie — wciąż
w drodze, 18,1–21,4 AU od celu), sam wygrywa bitwę planetarną 3/3 (limit 30 tur, przewaga HP: transportowiec 180 —
D-199-6 — traci 16–22, obrona 0; obrońcą jest OBRONA SYMBOLICZNA kolonii bez statków i bez budynków obrony —
`WarSystem._buildPlayerBattleUnit`: 30 HP, broń 2 obrażeń — nie fantom W3-26, który zostaje wyłącznie przy braku
broniącej kolonii, `_defendingColonies` puste) i ląduje; dom pada po 11,2–12,0 mies. (Finding **435**). Wspólny punkt
skoku i wspólna chwila przylotu w tabeli wyżej to więc skutek S3-2, nie sceny.

**Uprząż C1** (pokój, 100 lat, ziarna default i 987654321, warianty passive / press / pressPaid) — przed (`2a09ac9`) i po
(kod S3): **6 / 6 identycznych** (JSON i tekst, po zdjęciu czasu wykonania); żaden wynik nie ma statusu `war`.

**Co zobaczy właściciel:**

- **Start eskadry** (w sesji 1 wyłącznie dźwignią konsoli): po ok. pół roku gry (~6 s przy 1m/s) na obrzeżu układu
  domowego, na okręgu 30 AU wokół gwiazdy, pojawiają się trzy albo cztery statki naraz, w JEDNYM punkcie; okno wykrycia
  („⚔ ENEMY UNIT DETECTED” albo „⚠ UNIDENTIFIED CONTACT” — zależnie od wywiadu o statku; przycisk „[ENTER] Understood”)
  po jednym na statek (bramka S3A: 6 okien przy dwóch eskadrach).
- **Lot:** grupa leci do domu razem i dolatuje w jednej chwili 5,1–5,7 roku po starcie (~60–70 s przy 1m/s); transportowiec,
  choć ~7 razy szybszy od eskorty (42,9 wobec 6,2 AU/rok — audyt, część A), nie wyprzedza jej w żadnym z 47 przebiegów,
  w których eskadra doleciała (w pozostałych 13 z 60 transportowiec zginął w walce po drodze).
- **Dom bez statków albo z 3 zadokowanymi fregatami (40 przebiegów):** okno bitwy planetarnej nad domem — AI wygrywa 40/40
  (dom bez statków: obrona symboliczna kolonii wycofuje się po 1–3 turach; 3 zadokowane fregaty: 21–30 tur, do limitu albo
  do odwrotu gracza; nieuzbrojony transportowiec wnosi do strony AI 180 HP — reguła
  D-199-6, Finding **200**; w części E (d) dwie eskorty przylatujące RAZEM bez transportowca wygrały 3 z 4 takich bitew,
  pojedynczo — 0 z 12); zadokowane fregaty giną 60/60; zaraz potem alarm „⚔ Troops landing on <dom>!” (6 jednostek);
  eskorta odlatuje do domu po 0,0–1,1 mies. (odwołanie); transportowiec zostaje na orbicie z pustą ładownią (434); po
  11–14 miesiącach (mediana ~12; ~12 s przy 1m/s) „⚠ CAPITAL TAKEN: …” — dom pada 40/40 (w scenie gracz nie ma w domu
  wojsk naziemnych; czy obrona naziemna zatrzymałaby desant — 430, poza S3).
- **3 fregaty na orbicie domu:** walka w przestrzeni (DSCS), zanim eskadra doleci do planety; przeciw 2 eskortom gracz
  wygrywa 10/10 — cała eskadra z transportowcem idzie na wrak, fala ginie z nim (60 jednostek `transport_lost`), desantu
  nie ma; przeciw 3 eskortom AI wygrywa starcie 7/10 (fregaty gracza giną 24/30), potem bitwa planetarna i desant — dom
  pada 7/10.
- **Starcie z bronią krótkiego zasięgu (część E):** fregaty z laserem dochodzą do zasięgu i strzelają (scena (a): 94 strzały,
  przed S3 — 0); ruch zbliżenia jest skokowy — 9 kroków na sekundę po 0,028 AU dla fregaty (~4 px przy domyślnej kamerze;
  `[derived]` — nie obejrzane w przeglądarce, przy zbliżeniu kamery „kroki” mogą być widoczne).

#### 5j.4 Bramka S3A — scenariusz zwalidowany w prawdziwej grze

`kosmos-handover/ai-strikes-back-s3/gate/GATE_S3A.md` (po polsku, gra po ANGIELSKU): 24 kroki — klucz `strikeWaveShare`
(odczyt, odmowy, zmiana, reset), dwie eskadry przez dźwignię (A — desant, B — transportowiec zestrzelony w drodze), skok
w jeden punkt, fregaty z laserem na strażnika (SB49), zapis i wczytanie w locie, przylot razem, desant = ładunek, brak
desantu B. Każda komenda wykonana walidatorem w prawdziwej grze na fixture; kontrola na `2a09ac9` przy każdym kroku;
tabela WŁASNOŚCI na końcu (nie identyfikatorów).

Walidacja `[measured]` (`results/gate/`, zestawienie `summary_gate_s3a.txt`) — **kod S3 (łańcuch w klonie):** wszystkie
własności zgodne — fala 6 → 13 (udział 1) → 6 (reset), odmowy `out_of_range` / `wrong_type`; dwie eskadry, każda po skoku
w JEDNYM punkcie (rozrzut 0 AU, dwa różne punkty); transportowiec B wrakiem, 6 jednostek `transport_lost`, rekord
`transport_lost`; fregaty z laserem strzelają z 0,047 AU (kontrola: 0 strzałów, strażnik z 0,233–0,250 AU); zapis w roku
61,66 i wczytanie — chwile przylotu bez zmian (65,2982 / 65,4113); eskadra A dolatuje razem (rozrzut 0 dni, przeskok
0,01 AU), bitwa planetarna wygrana przez AI, desant = dokładnie 6 jednostek z ładowni, transportowiec żywy z pustą
ładownią; eskadra B — 0 desantów; 0 błędów konsoli. Przerwania (okna, które zobaczy właściciel): T1 — 6 okien wykrycia
(po jednym na wrogi statek), T2 — 1 okno bitwy, T3 — 3 okna bitew i alarm desantu, T4 — brak. **Kontrola `2a09ac9`:** brak
odczytu fali (`unknown_key`), brak dźwigni i systemu eskadr, fregaty 0 strzałów, 0 błędów konsoli. Ustalone przy walidacji:
po wczytaniu gra rusza BEZ pauzy przy 1 d/s (domyślny zegar) — ujęte w kroku 16. Przebieg na zestagowanym drzewie repo —
w notatce przekazania. Bramka właściciela — czeka.

#### 5j.5 Pytania do właściciela

1. **Zgoda na przecelowanie R-S3** (R-S3-1, R-S3-2, R-S3-3; §5j.2, dowód mutacyjny) — bez niej S3-3 nie może wejść do
   historii (kod S3-3 bez przecelowań czerwieni pięć keeperów). S3-1 i S3-2 są zielone same w sobie.
2. **Zbliżenie (SB49) dotyczy statku ZAMROŻONEGO w miejscu startu starcia** (`orbiting`, `dockedAt == null`); statek
   `in_transit` (rozkaz ruchu gracza wydany w trakcie walki, strona gracza przy wyłączonej pauzie misji) nie jest
   przyciągany — czy tak rozumiesz „stoi tam, gdzie zaczęła się walka”?
3. **Ponowna synchronizacja po bitwie w locie** jest zrobiona dla eskadry AI (wynika z „transportowiec nigdy przed
   eskortą”); flota GRACZA po bitwie w locie wznawia lot dalej osobno — czy ma też lecieć znowu razem?
4. **Transportowiec po desancie zostaje na orbicie celu na zawsze** (Finding 434; M5: po każdym desancie) — w sesji 2
   razem z SB58: wraca z eskortą, zostaje do rozstrzygnięcia walki naziemnej, czy znika?
5. **Cel desantu przy kilku koloniach gracza w układzie** — dziś bez zmian: „najpierw dom” (`_onVesselGroupVictory`).
   Przy odbijaniu (SB57) celem jest konkretne ciało — czy desant ma lądować na ciele, nad którym eskadra wygrała orbitę
   (cel eskadry), zamiast na domu?
6. **Finding 55** (kolonia gracza bez siatki do pierwszego otwarcia mapy ⇒ `no_grid`) dotyczy także desantu z ładunku —
   czy w sesji 2?
7. **Skala (M5):** eskadra 2 eskorty + transportowiec bierze dom bez statków i dom z 3 zadokowanymi fregatami 40/40
   (przylot razem; transportowiec wnosi 180 HP do bitwy planetarnej — reguła D-199-6), a 3 fregaty na orbicie niszczą
   eskadrę 2-eskortową 10/10 i przegrywają z 3-eskortową 7/10 — czy to właściwy punkt wyjścia przed SB56 (wielkość
   eskadry 1,0 × / sufit 3)? I czy bitwa planetarna ma liczyć HP nieuzbrojonego transportowca (dziś tak — D-199-6;
   kontrola M5: sam transportowiec bierze niebronioną kolonię 3/3 — Finding **435**)?
8. **Bramka S3A** (`gate/GATE_S3A.md`) — przed commitem czy po?

#### 5j.6 Następny krok

**Sesja 2 S3** (podpisane, nie kodowane): **SB56** wielkość eskadry jako klucze strojenia · **SB57** reguła odbijania ·
**SB58** eskorta trzyma orbitę do rozstrzygnięcia walki naziemnej · **SB59** Finding **151** + **427** i wpis dzwonka.
Commity sesji 1 — po zgodzie na R-S3 (`tools/commit_S3.sh`, `commit_S3_B3.sh`; notatka `HANDOVER_S3_PART1.md`).

### 5k. S3 — sesja 1 — zamknięcie (2026-10-12): commity łańcucha, bramka S3A PASS, decyzje SB61–SB67

Polecenie właściciela (2026-10-12): commity przygotowanego łańcucha po bramce w przeglądarce (PASS 2026-10-12) i zgoda na
przecelowanie — „TAK (właściciel, 2026-10-12): zgoda na R-S3-1, R-S3-2 i R-S3-3.”; decyzje **SB61–SB67** (§2).

#### 5k.1 Commity `[git]` `[measured]`

Kotwica wejścia: HEAD `c2558ee` (drzewo `763e3ac5`), indeks (liczony na kopii) = drzewo `fb7600e6`, `src/` = indeks,
pozycje obce statusu jak na wejściu (` M .claude/settings.local.json` i 39 nieśledzonych), SHA256SUMS folderu S3
**434 / 434**, sweep zestagowanego drzewa **283/288** (czerwone wyłącznie 5 keeperów R-S3), `check-i18n` PASS pl = en
**3456**. Commity skryptem `tools/commit_S3.sh --with-RS3 "2026-10-12"` (folder `ai-strikes-back-s3`); drzewo każdego kroku
= `patches/trees.txt`:

| commit | drzewo | treść | numstat |
|---|---|---|---|
| `1cf1d24` | `ec821f80` | S3-1 — **421** (SB49): zbliżenie na zasięg własnej broni | `DeepSpaceCombatSystem` 69/2 · keeper `sb3_combat_closing` 294/0 |
| `ee44424` | `73f9f46a` | S3-2 — **420** (SB54, SB45): grupa leci razem | `DebugLog` 3/0 · `FleetSystem` 30/0 · `OrderService` 140/3 · `VesselManager` 5/1 · `GroupArrival` 81/0 · keeper `sb3_group_arrival` 317/0 |
| `c97b73b` | `12e4c156` | S3-3 — eskadra z ładunkiem (SB51–SB53, SB55; **396**, **384**) + przecelowanie R-S3 | `DebugLog` 4/0 · `GameState` 4/0 · `StrikesBackData` 9/1 · `GameScene` 31/2 · `InvasionSystem` 63/24 · `StrikeSquadronSystem` 198/0 · `GameCore` 4/0 · `StrikeWavePlanner` 110/0 · `StrikesBackTuning` 8/0 · keeper `sb3_squadron` 346/0 · R-S3: `ai_capture_outpost` 9/1, `sb0_fleet_defects` 8/0, `sb1_fleet_tuning` 6/4, `sb1_pool_warp_minimum` 2/1, `w3_ai_invasion` 16/1 |

Na HEAD `c97b73b`: sweep **288/288 OK, 0 FAIL, 31 advisory**, `check-i18n` PASS pl = en **3456**; status — wyłącznie pozycje
obce; w repo żadnego `*.PROPOSED`. **EOL:** `DebugLog.js` (CR 234 = LF 234), `GameState.js` (197), `InvasionSystem.js` (627),
`OrderService.js` (631), `GameCore.js` (634) zostają CRLF; pozostałe pliki LF; żaden commit nie odwraca całego pliku.
Sweepy kroków pośrednich — z weryfikacji łańcucha w klonie (§5j.2: 286 → 287 → 283/288 kod → 288/288 z R-S3); w repo
zmierzony stan końcowy.

#### 5k.2 Bramka S3A — zapis (2026-10-12, właściciel, przeglądarka) `[measured: odczyty właściciela]`

Fixture GATE-S4-fresh-gy60; kod = drzewo indeksu `fb7600e6` (S3-1 – S3-3; przecelowania R-S3 dotyczą wyłącznie keeperów);
gra po angielsku; widok `sys_home`. Odczyty właściciela:

| krok | odczyt |
|---|---|
| 0 | `{rok: 60.14, widok: 'sys_home', dom: 'entity_2 (sys_home)', stolica001: 'entity_115', uzbrojoneGraczaWDomu: 'v_21:docked,v_22:docked,v_23:docked', jezyk: 'en'}` |
| 2 | `{imperium: 'emp_001', limitGarnizonu: 13, udzial: 0.5, fala: 6, sklad: 'shock_infantry x4, rocket_artillery x2', morale: 100, ladownia: '10/32'}` |
| 3 | `{dwa: 'out_of_range', tekst: 'wrong_type', jeden: 'ok 0.5 → 1', falaPoZmianie: 13}` |
| 4 | `{reset: 'strikeWaveShare', fala: 6}` |
| 5 | `{doRezerwy: 'v_21,v_22,v_23', minimumKadlubowZBakiem: 4}` |
| 6 | `'emp_001: war; pula +4, obudzona rezerwa 6, limit 6'` |
| 7 | `sq_emp_001_1`: transportowiec `v_34`, fala `gu_14`–`gu_19`, eskorta `v_30`, `v_31` |
| 8 | `sq_emp_001_2`: transportowiec `v_35`, fala `gu_20`–`gu_25`, eskorta `v_32`, `v_33` |
| 9 | obie `'launched'`; jeden kąt na eskadrę (6,008 i 2,452); ładunek transportowca 6 |
| T1 | sześć okien wykrycia |
| 10 | A: 3/3, rozrzut punktu 0 AU, (28,87, −8,14) AU, 60,6527; B: 3/3, 0 AU, (−23,15, 19,09) AU, 60,6527 |
| 11 | `{transportowiecB: 'v_35: WRAK', ladowniaPo: '—', …}` — wszystkie sześć jednostek „nie żyje”, przyczyna `transport_lost`, etap B `transport_lost` |
| 12 | `{straznikStolicy: 'v_24', wrakiNarzedzia: 'v_25,v_26,v_27,v_28,v_29'}` |
| 13 | `{fregaty: 'v_36:engage v_37:engage v_38:engage', cel: 'v_24 orbiting@entity_115'}` |
| T2 | bitwa — przegrana w ok. pół sekundy, zanim właściciel zdążył zapauzować |
| 14 (pierwszy odczyt) | `{strzalyFregat: '0 strz.', strzalyStraznika: '4 strz./4 traf. z 0.128–0.279 AU', fregaty: 'v_36:WRAK v_37:sprawna v_38:sprawna', straznik: 'v_24:orbiting@entity_115', latPoRozkazie: 0.93}` |
| 14a | `'battle_ds_61_63_player_emp_001 t=61.6307 A=[v_36] B=[v_24] wygrana=B strzały: v_24:4/4@0.279,0.279,0.128,0.128'` |
| T2b | następna bitwa przyszła szybko i szybko została przegrana |
| 14 (drugi odczyt) | dwie bitwy (`61_63`, `61_71`); `{strzalyFregat: '2 strz./2 traf. z 0.045–0.047 AU', strzalyStraznika: '9 strz./8 traf. z 0.045–0.279 AU', fregaty: 'v_36:WRAK v_37:WRAK v_38:sprawna', straznik: 'v_24:orbiting@entity_115'}` |
| 15 | A `'launched'`: `v_30`, `v_31`, `v_34` → 65,7507; B `'transport_lost'`: `v_32`, `v_33` → 65,4523, `v_35` WRAK |
| 16 | zapis, F5, „Continue”, rejestrator włączony ponownie |
| 17 | identyczny z 15 |
| T3 | właściciel widział przylot statków eskadry A i alarm „Troops landing on” |
| 18 | `{etap: 'landed', przylotyDoCiala: 'v_30@65.7512 v_31@65.7512 v_34@65.7512', rozrzutChwilPrzylotuDni: 0, przeskokPrzyPrzylocieAU: '0.009,0.009,0.009', bitwy: '…: wygrana A (A=emp_001)', desant: 'gu_14,…,gu_19 z v_34 na entity_2', wyladowaloToSamoCoNaPokladzie: true, transportowiec: 'v_34: żywy, ładownia 0'}` |
| 19 | `{etap: 'transport_lost', …, desantyZJednostkamiB: 0, desantyWszystkie: 1, blokadyDesantu: 'no_drop_capable_hull', eskortaB: 'v_32:in_transit@- v_33:in_transit@-'}` — wszystkie sześć jednostek B „nie żyje” |

Konsola — nie potwierdzona przez właściciela. **WERDYKT: PASS.**
⚠ Kryterium kroku 14 (fregaty z laserem strzelają z zasięgu własnej broni) spełniła dopiero DRUGA bitwa (2 strzały
z 0,045–0,047 AU); w pierwszej fregata `v_36` zbliżała się (strażnik trafiał ją z 0,279, potem z 0,128 AU) i zginęła od
4 trafień z 4, nie oddawszy strzału — tempo starcia, Finding **436**.

#### 5k.3 Ustalenia bramki

- **Tempo starcia** — słowa właściciela przy T2: „walki odbywają się zbyt szybko albo czas mamy ustawiony zły do bitew”;
  bitwa rozstrzygnięta w ok. pół sekundy, zanim gracz zdążył zapauzować → Finding **436**, decyzja **SB67** (najpierw pomiar:
  czy wynik zależy od czasu rundy; klucz strojenia wyłącznie przy niezależności).
- **Flota gracza po bitwie w locie** — **SB62**: zostaje; Finding **437** (wyłącznie raport).
- Pytanie 8 sesji 1 (bramka przed commitem czy po) — rozstrzygnięte przebiegiem: przed.

#### 5k.4 Następny krok

**S3, sesja 2:** SB56 (wielkość eskadry jako klucze strojenia) · SB57 (reguła odbijania) · SB58 / SB63 (eskorta
i transportowiec nad celem do rozstrzygnięcia walki naziemnej, powrót odwołaniem, transportowiec usuwany w doku stolicy —
zamyka **434**) · SB59 (151, 427, wpis dzwonka) · SB64 (desant na cel eskadry) · SB65 (pomiar Findingu 55) · SB66 (eskadra
bez eskorty przerywana — **435**) · SB67 (czas rundy — pomiar najpierw).

---

## 6. Rejestr findingów arca (#391–#396, zebrane 2026-10-06)

⚠ **Zasada wpisu:** każde `plik:linia` sprawdzone grepem na `8b72c47`. **Registry-first:** przed nadaniem grep rejestrów
(`docs/`), `CLAUDE.md`, pamięci i historii commitów dał **#390** jako najwyższy numer findingu (nagłówki `### … 390`
w `AI_GARRISON_PLAN.md` §6); trafienia ≥ 391 sprawdzone po kolei — to wartości tabel BALANS (dochód 397 Kr, ilości Fe
394/396/398) i numery linii, nie findingi; #391+ nieużyte (2026-10-06). Źródło: kandydaci **K1–K6** z audytu fazy A
(`AI_STRIKES_BACK_AUDIT.md`, „Kandydaci na findingi”), nadane w kolejności K: K1 = 391 … K6 = 396. Znaczniki:
🔴 żywy i dotkliwy · 🟠 realny, ograniczony · ⚪ obserwacja/higiena · ✅ zamknięty.

### ✅ 391 — `deployVessel` odmawia rozmieszczenia kadłuba AI (także kuriera), gdy zalega flota GRACZA (K1)

`VesselManager.deployVessel` bramkuje `fleetInArrears()` (`VesselManager.js:989`) dla KAŻDEGO kadłuba, a predykat
(`:2198-2205`) liczy wyłącznie statki gracza w służbie (`isEnemyVessel` i `isInService` wykluczone) `[code]`. Przez tę bramkę
przechodzą mobilizacja okrętów AI (`DirectorMobilization.js:124`) i budzenie kurierów AI (`EmpireLogisticsSystem.js:444`,
odmowa `courier_deploy_refused` `:450`) `[code]`; AI utrzymania nie płaci (`_tickVesselMaintenance`, guard `isEnemyVessel`
`VesselManager.js:2089`, W2 decyzja 14) `[code]`. Pomiar fazy A: G6 — bez długu gracza `{ ok: true, crew: 0.4 }`, jeden
statek gracza z `unpaidYears 1` → `{ ok: false, reason: 'fleet_in_arrears' }`; uprząż `press` — **4 392–4 498** odmów
`courier_deploy_refused:fleet_in_arrears` na imperium w 100 gy, siła AI 0; fixture GATE-S4 — `unpaidYears` gracza 3/13/42,
`mobilize_reserve` odpaliła (gy 57,4), 6 kadłubów `emp_001` w rezerwie `[doc: audyt fazy A]`. Bliźniacza bramka
unieruchomienia (`isImmobilized`, `:2277`) już wyklucza AI (`!isEnemyVessel`) `[code]`. → **S0-1** ✅ `9c73023`
(2026-10-06): bramka pyta o dług wyłącznie przy statku gracza; uprząż `press`: 4 392–4 498 → 0 odmów `[measured]`;
keeper `sb0_fleet_defects_smoke` T1–T2.

### ✅ 392 — guard `empireHasFreeCrew` czyta `freePops` stolicy — dla AI martwy (K2)

`DirectorProduction.hasFreeCrew` (`DirectorProduction.js:154-158`) porównuje `freePops` stolicy (`:157`) z kosztem załogi;
guard `empireHasFreeCrew` jest zarejestrowany z progiem 1 POP (`:475-476`), a jego jedynym konsumentem w katalogu jest
`mobilize_reserve` (`DirectorRuleData.js:216`) `[code]`. `freePops` u AI klamruje się do 0 (etatów więcej niż POP — rodzina
**215**), choć `commitCrew` umie eksmitować (W2 decyzja 18) `[code]`. Pomiar fazy A: uprząż — `freePops` stolicy **0 od gy 20
do gy 100 w 6 z 6 przebiegów** (jedyny wyjątek: 987654321 · `emp_002` przy gy 100 = 10,4); `mobilize_reserve` 0–1
mobilizacji na 100 gy przy 5–8 kadłubach w rezerwie `[doc: audyt fazy A]`. → **S0-2** ✅ `e73c890` (2026-10-06, SB2):
guard zdjęty z `mobilize_reserve`, `deployVessel` nie pobiera załogi kadłuba AI; bramka: `v_24`, `v_25` w służbie
z załogą 0 przy długu gracza (§5a); keeper T3.

### ✅ 393 — `_hasHostileFleetInSystem` liczy kadłuby AI w REZERWIE (luka zbioru wykluczeń W2) (K3)

`WarSystem._hasHostileFleetInSystem` (`WarSystem.js:938-958`) — pętla kadłubów (`:944-951`) sprawdza wrak, właściciela,
układ (`:947`) i uzbrojenie (`:949`), **bez filtra służby i bez filtra doku** `[code]`. Pomiar G3: kadłub w rezerwie
zadokowany przy stolicy ⇒ dominacja gracza `false` przez 3 lata gry, 0 bitew `[doc: audyt fazy A]`. Zbiór wykluczeń
rezerwy W2 (doktryny, `_buildPlayerBattleUnit`, `_wreckPlayerVesselsInSystem`, pule, `ProximitySystem`, …) tego predykatu
nie objął. → **S0-3** ✅ `cf2a598` (2026-10-06): NEW `isFightableInSpace` — kadłub w rezerwie nie odbiera dominacji;
scena C4 G3 `false` → `true` `[measured]`; keeper T4–T6.

### ✅ 394 — zadokowany kadłub AI odbiera dominację, a nie da się z nim walczyć; UI każe „wygrać bitwę” (K4)

`ProximitySystem._checkPair` nie emituje `vessel:combatRangeEnter`, gdy któryś statek jest `docked`
(`ProximitySystem.js:284`); DSCS walczy wyłącznie ze stanami `in_transit` i `orbiting` (`_inCombatState`,
`DeepSpaceCombatSystem.js:1535`); bramka zrzutu pokazuje `drop.noDominance` — „No orbital dominance — win the battle
first” (`ColonyOverlay.js:334`) `[code]`. Pomiar G1 i G5: 0 bitew, rozkaz `engage` zawisa 0,86–0,88 AU od celu, dominacja
`false` do końca; w fixture dotyczy całego `sys_059` (stolica `emp_001` + 2 placówki) `[doc: audyt fazy A]`. → **S0-3**
✅ `cf2a598` (2026-10-06): dok nie odbiera dominacji, ta sama reguła po stronie AI (`hasOrbitalDominanceInSystem`),
zapamiętany kontroler innej strony sam nie zamyka orbity (S0-3b, zgoda właściciela); bramka kroki 3c–5 (§5a); keeper
T4–T7. Komunikat „wygraj bitwę” jest w praktyce niewidoczny — Finding **405**.

### ⚪ 395 — adnotacja `directorOrigin` trafia na zły kadłub (K5)

`_awaitingClaim` dopisuje notatkę szablonu przy zamówieniu (`DirectorProduction.js:202-203`), a `_claimVessel` zdejmuje ją
`shift()` przy KAŻDYM kadłubie ukończonym w tej kolonii (`:237-238`) i daje jej pierwszeństwo przed odczytem szablonu
z modułów statku (`:241`) — gdy kolejność ukończeń różni się od kolejności zamówień, notatka trafia na inny kadłub `[code]`.
Fixture: `v_28` z adnotacją `frigate_laser_escort` przy modułach defendera `[doc: audyt fazy A]`. Skutek diagnostyczny
(etykieta szablonu), bez wpływu na walkę. → bez kroku (higiena; naturalne miejsce — S1, gdy pula dostanie własne wejście
tworzenia).

### ✅ 396 — desant z bitwy liczy POJEMNOŚĆ, nie ładunek: pusta ładownia daje do 6 jednostek z każdej wygranej bitwy (K6)

`_onVesselGroupVictory`: `troopCount = max(1, min(6, ⌊Σ troopCapacity⌋))` (`InvasionSystem.js:294-295`), a gdy ładownie
ocalałych zrzutowców są puste, `launchInvasion` dostaje `null` zamiast listy (`:307`) i składa falę ze szczebla drabiny D9
`[code]` ⇒ każda wygrana bitwa orbitalna z ocalałym zrzutowcem to nowa fala do 6 jednostek „z niczego”. Pomiar D2: transport
z pustą ładownią — **12** jednostek z **0** przewiezionych w dwóch bitwach `[doc: audyt fazy A]`. Rodzina **384**. Dziś
uśpione: AI nie ma zrzutowca (**49**, **201**). → **S3** (SB7: wojska przylatują na pokładzie; SB8: wielkość desantu).
→ **S3, sesja 1 (2026-10-11):** naprawa PRZYGOTOWANA, NIE zacommitowana — S3-3 (SB52): desant ląduje DOKŁADNIE
jednostki z ładowni ocalałych zrzutowców (`InvasionSystem._landCargo`), pusta ładownia — nic (`empty_cargo`); keeper
`sb3_squadron_smoke` T3, T4 (§5j.2). Zamknięcie — przy commicie S3-3.
✅ **Zamknięty 2026-10-12 — `c97b73b` (S3-3, SB52; §5k.1).** Bramka S3A, krok 18: desant = dokładnie 6 jednostek
z ładowni `v_34`, transportowiec żywy z pustą ładownią `[measured: odczyt właściciela]`.

### #397–#406 — zamknięcie S0 (2026-10-06)

⚠ **Registry-first (ponownie, 2026-10-06):** grep rejestrów (`docs/`), `CLAUDE.md`, pamięci i historii commitów (przed
`eb6c06e`) dał **#396** jako najwyższy numer findingu; trafienia **397** i **400** w `docs/` to wartości tabel (BALANS:
podatek 397 Kr; koszt `fusion_power` 400; wiersz `lv2` audytu S3.4 = 400), nie findingi `[measured]`. **397–404** = kandydaci 1–8 notatki przekazania
S0 (`kosmos-handover/ai-strikes-back-s0/HANDOVER_S0.md` §7), w tej kolejności; **405–406** = obserwacje z bramki S0
(§5a), tylko raport. Kandydaci 9 i 10 notatki NIE są findingami — uwagi w wierszach S1 i S2 (§3). `plik:linia` na
`eb6c06e`, chyba że wpis podaje inaczej.

### ✅ 397 — komentarz flagi `aiPopGates` wskazywał `commitCrew` jako strażnika kuriera AI (kandydat 1)

`GameConfig.js:109-111` (plik krytyczny) mówił, że prawdziwym strażnikiem kuriera AI jest `deployVessel → commitCrew`; od
S0-2 (SB2) `deployVessel` pomija `commitCrew` dla kadłuba AI `[code, 7bfefd3 → e73c890]`. → ✅ `eb6c06e` (tylko komentarz).

### ✅ 398 — odczyt wywiadu „wolna załoga: {0} POP” nie przewiduje już niczego (kandydat 2)

`IntelOverlay.js:296-298` (`intel.crewCapacity`, przy wywiadzie `detailed`) pokazuje `knownCrewCapacity`, czyli `freePops`
stolicy AI (`IntelSystem.js:288`); od S0-2 ta liczba nie bramkuje mobilizacji AI, a gracz może ją czytać jako limit
`[code]`. Nagłówek `_reserveReadout` (`IntelSystem.js:268-270`) nadal opisuje ją jako ogranicznik mobilizacji; adnotacja
S0-2 stoi przy `:281-283` `[code]`. → **S1** (SB19: odczyt floty / limitu zamiast „wolnej załogi”).
**Zamknięty 2026-10-08:** ✅ `1a9f95b` (S1-7, B5, SB19) — panel WYWIAD, blok „Siła wojskowa”: „okręty uzbrojone: A /
limit floty: L”; bramka S1, krok P — „armed warships 9 / fleet limit 13”, linii „wolnej załogi” brak `[measured: odczyt
właściciela]`.

### ✅ 399 — tekst asercji `w2_ai_mobilization_smoke` T7 nieaktualny po SB2 (kandydat 3)

`:261` na `7bfefd3` („AI płaci za kuriera tę samą cenę co gracz”); sprawdzenie `/deployVessel/` poprawne, tekst nie
`[code]`. → ✅ `eb6c06e` (tylko tekst; zgoda właściciela 2026-10-06), pin dalej zielony.

### ⚪ 400 — guard `empireHasFreeCrew` zarejestrowany bez konsumenta (kandydat 4)

`DirectorProduction.js:479` rejestruje guard (metoda `hasFreeCrew`, `:157`), a od S0-2 żadna reguła katalogu go nie czyta
— grep `'empireHasFreeCrew'` w `src/data` i `src/systems` poza rejestracją: zero `[code]`. Martwy, nieszkodliwy; decyzja
o usunięciu — przy S1.

### ⚪ 401 — gałąź księgi abstrakcyjnej w `_hasHostileFleetInSystem` odbiera dominację bez pojęcia „da się walczyć” (kandydat 5)

`WarSystem.js:950-962`: flota z `empire.fleets` o `strength > 0`, której `systemId` LUB `destSystemId` to ten układ,
odbiera dominację gracza — także w drodze, przed przylotem `[code]`. Producentów w normalnej grze brak (W3-8), więc dotyczy
starych zapisów i flot debugowych. Bez kroku.

### ✅ 402 — docstring `playerHasOrbitalDominance`: „Używane przez … dropTroop()” (kandydat 6)

`dropTroop` (`Vessel.js:788`) sprawdza wyłącznie bramkę wojny; dominację bramkują wołający (`FleetActions.js:560`, `:598`,
`ColonyOverlay.js:268`, `:333`) `[code]`. → ✅ `eb6c06e`. Rodzina **406**: przy kliknięciu heksu w trybie zrzutu dominacji
nie sprawdza nikt.

### ⚪ 403 — `WarSystem.getPlanetOrbitalController` bez konsumenta (kandydat 7)

`WarSystem.js:1039` — zero wołających w `src/` `[code]`. Martwy.

### ⚪ 404 — dwa polskie literały ostrzału z orbity w `ColonyOverlay` (kandydat 8)

`ColonyOverlay.js:260` `'Brak amunicji'`, `:269` `'Brak dominacji orbitalnej'` — flashe omijają `t()` (klasa **113**/**375**)
`[code]`. Etap polerki UI.

### ⚪ 405 — flash `drop.noDominance` w praktyce niewidoczny (obserwacja z bramki S0, krok 4b)

`[code]`: flash ustawia `_showFlash` (`ColonyOverlay.js:748`, 2,5 s), a rysuje go wyłącznie `ColonyOverlay.draw`
(`:1052-1064`, dół nakładki), które przy niewidocznej nakładce wraca od razu (`:917`). Gałąź odmowy (`:333-335`) kończy się
PRZED otwarciem mapy (`_openAsColonyPanel`, `:347`), więc gdy mapa kolonii nie jest otwarta, flash nie jest rysowany wcale.
Pętla UI (`UIManager.js:2184-2196`) rysuje tylko przy `_dirty`, animacji albo ruchu kamery — `timeDirty` wymaga
`!isPaused`, a gałąź odmowy nie ustawia `_dirty` ⇒ na pauzie, przy otwartej mapie i bez ruchu myszy, flash może wygasnąć
przed następną klatką. **Przy wyszarzonym przycisku żadna ścieżka UI do tej gałęzi nie dochodzi:** jedynym żywym
producentem `vessel:dropTroopsRequest` jest `FleetManagerOverlay._openDropTroopsFlow` (`:2855-2870`), a strefę kliknięcia
przycisku akcji panel tworzy tylko przy `canExecute` ok (`:8959-8964`), które ma tę samą bramkę dominacji
(`FleetActions.js:560`); `FleetTabPanel` i `FleetPanel` nie są nigdzie importowane. Wąski wyjątek (niezmierzony):
dominacja utracona, gdy otwarte jest asynchroniczne okno wyboru jednostek (`DropTroopsModal`) — potwierdzenie emituje
żądanie, gałąź odmowy ustawia flash, ale aktywna jest nakładka Dowództwa ⇒ odmowa cicha. Widoczna odmowa = panel statku
+ wyszarzony przycisk (§5a). Bez kroku.

### ✅ 406 — tryb zrzutu otwarty przy dominacji zrzuca także po jej utracie (obserwacja z bramki S0)

`[code]`: klik heksu w trybie zrzutu (`ColonyOverlay.js:4693-4745`) sprawdza ocean, istnienie statku i kolejkę, po czym
woła `dropTroop` (`Vessel.js:788`) → `unloadGroundUnit` (`Vessel.js:749`); obie sprawdzają tylko moduł, ładunek i bramkę
wojny — **nie dominację i nie położenie statku**. Dominacja jest sprawdzana tylko przy wejściu w tryb (`:333`) ⇒ heks da
się wybrać i zrzut się wykonuje. Docstring `dropTroop` (`Vessel.js:777`, „dominacji orbitalnej (sprawdza caller)”) jest
dla tej ścieżki nieprawdą. Osiągalność w normalnej grze niezmierzona; bez kroku — kandydat do **S3** (desant, odbijanie).
⏳ **Przygotowane 2026-10-09 (B2, SB35 — bramka silnika, wersja (b)):** `dropTroop` po bramce wojny pyta
`WarSystem.hasOrbitalDominanceInSystem` właściciela jednostki (ciało innego właściciela) i odmawia `no_orbital_dominance`;
mapa kolonii kończy tryb zrzutu napisem `drop.lostDominance` (EN „Orbital dominance lost — landing aborted”). Keeper
`sb2_drop_dominance_smoke` 9/9 (fail-first na B1: 3 / 6). Bramka S2, krok 14 (fixture, gra EN): kod — odmowa, jednostka
w ładowni; kontrola `d055a05` — desant ląduje („⚔ Landing complete…”) `[measured]`.
**Zamknięty 2026-10-10:** ✅ `013fd75` (B2, SB35). Bramka S2, przebieg 2, krok 14: „Orbital dominance lost — landing
aborted”, jednostka w ładowni `[measured: odczyt właściciela]` (statek był już wrakiem — §5g.4, C2, Finding 418).

### #407–#408 — S1, sesja 1 (2026-10-07)

⚠ **Registry-first (2026-10-07):** grep rejestrów (`docs/`), `CLAUDE.md`, pamięci i historii commitów przed nadaniem — najwyższy
numer findingu **#406**; trafienia „407” to numery linii (`EmpireColonyBootstrap.js:404-407` w pamięci) i zapis „pierwszy
wolny 407” w notatce S0, nie findingi `[measured]`. Źródło: pomiary tej sesji (§5c). `plik:linia` na `8abe84d`.

### ✅ 407 — kanoniczny fixture GATE-S4 niesie trzy fregaty-chimery gracza; „dom gracza `sys_060`” w audycie fazy A jest błędne

`[measured]`: w zapisie `GATE-S4-fresh-gy60` i — po wczytaniu — w prawdziwej grze (izolowany headless Chrome) `v_21`
Bellator, `v_22` Gladiator i `v_23` Furia mają `systemId: 'sys_060'`, a stoją zadokowane przy `entity_2` — planecie domowej
gracza w `sys_home`; wczytanie tego nie leczy (KONTROLA: kadłuby AI w doku mają układ = układ ciała). `sys_060` to
niezbadana gwiazda M „Hassaleh”, 17,4 LY od domu. Oba układy leżą w powłoce granicznej `emp_001`, więc sonda nacisku
(`DirectorPressure.js:77`, `v.systemId`) liczy te fregaty tak czy inaczej (3). Wzór = chimera Findingu **256**
(„`systemId` NIEZMIENIONY po doku”, naprawiona 2026-09-10 bramką admisji doku); fixture powstał 2026-09-03 (kod `bee26cf`),
czyli przed tą naprawą `[doc]`. **Skutki dla arca:** obrona gracza liczona po układzie statku (`WarSystem._playerVesselsInSystem`,
`WarSystem.js:765` → `_buildPlayerBattleUnit`, `DirectorOffensive.isDefended` / `estimateDefenderHp`) idzie na tym fixture do
`sys_060`, a nie do domu — pomiary i bramki S3 / S4 na tym fixture dostaną zafałszowaną obronę gracza. **Błędne opisy:**
`AI_STRIKES_BACK_AUDIT.md:185` („Dom gracza `sys_060`”), `FE_SUPPLY_PLAN.md:1098` i `CLAUDE.md` („3 uzbrojone fregaty
gracza w `sys_060`”) — wniosek audytu „dom gracza w powłoce `emp_001`” zostaje prawdziwy (`sys_home`, 9,19 LY od `sys_059`).
→ bez kroku w S1; decyzja właściciela przed S3 / S4 (§5c, pytanie 5).
**Odczyt właściciela na żywo (2026-10-07, jego jednolinijkowiec — bramka S1, krok 1):** `'v_21:Bellator:sys_060->sys_home |
v_22:Gladiator:sys_060->sys_home | v_23:Furia:sys_060->sys_home'` — identyczny z pomiarem sesji 2 na `45ee9d2` `[measured]`.
**Zamknięty 2026-10-08:** ✅ `d4f43a8` (S1-3, B1) — bramka S1, krok 1: `''`, krok 2: trzy wpisy `vessel:systemIdHealed`
(`v_21`–`v_23`: `sys_060->sys_home`) `[measured: odczyt właściciela]`.
**SB24 (2026-10-07):** leczenie przy wczytaniu przygotowane w B1 (§5d) — po nim jednolinijkowiec zwraca `""`, a obrona
domu gracza liczy trzy fregaty (HP 30 → 360). Opisy „dom gracza `sys_060`” (`AI_STRIKES_BACK_AUDIT.md:185`) i „fregaty
w `sys_060`” (`FE_SUPPLY_PLAN.md:1098`, `CLAUDE.md`) poprawione 2026-10-08. Producent chimer — Finding **410**.

### ✅ 408 — przy SB14 limit fixture'owego `emp_001` wypełniają kadłuby bez baku warp: pula nie doda kadłuba, uderzenie niemożliwe

`[measured]`: limit floty `emp_001` = **6**, uzbrojonych **6** — pięć defenderów i jeden kadłub z modułami defendera
z adnotacją eskorty (K5 / **395**), wszystkie z `warpFuel.max = 0`; miejsce dla puli **0**. M2 (wojna, 10 lat, cała rezerwa
w służbie): wyzwalacz `strike_player_target` przechodzi przy każdej ocenie (cel `sys_home` w zasięgu), guard
`empireHasStrikeForce` odmawia **121 / 121**; żaden kadłub nie opuszcza układu stolicy. Pula wg SB14 dopełnia do limitu,
licząc WSZYSTKIE uzbrojone kadłuby — więc nie doda eskorty z bakiem, a bez niej `emp_001` nie uderzy (S4) i nie wyśle
strażnika do ciała w innym układzie (SB6; w fixture drugie ciało D11 leży akurat w układzie stolicy — S2 nie jest
zablokowany). Konsekwencja dwóch podpisanych decyzji (SB14 + produkcja nacisku zamawia defendery), nie defekt kodu.
→ decyzja właściciela przy składzie puli (§5c, pytanie 2).
**Zamknięty 2026-10-08:** ✅ `a1143fc` (S1-4, B2, SB21) — bramka S1, kroki 4 i 8: `emp_001` przy limicie 6 z 6 kadłubami
bez baku dostaje z puli 2 eskorty z bakiem (z bakiem 0 → 2, uzbrojonych 8) `[measured: odczyt właściciela]`.
**SB21 (2026-10-07):** minimum 2 kadłubów z bakiem także ponad limitem — przygotowane w B2: w wojnie fixture'owy
`emp_001` dostaje +2 eskorty z bakiem (8 w służbie przy limicie 6) i uderza, gdy dom gracza nie jest broniony (M3, §5d.6)
`[measured]`.

### #409–#411 — S1, sesja 2 (2026-10-08)

⚠ **Registry-first (2026-10-08):** grep rejestrów (`docs/`), `CLAUDE.md`, pamięci i historii commitów przed nadaniem —
najwyższy numer findingu **#408**; trafienia „409”–„411” w `docs/` to wartości tabel i numery linii (BALANS: koszt kursu
0,409; wiersze 410 i 411 w tabelach cen i AI; `:409` w audytach rozkazów), nie findingi `[measured]`.

### ⚪ 409 — powiadomienie o mobilizacji mówi „Rezerwa wchodzi do służby: N”, a N liczy też kadłuby z puli

`[measured]` bramka S1, krok 9: `emp_002` — „⚓ Nieznane imperium obsadza okręty załogami — Rezerwa wchodzi do służby: 6”
przy ZERZE kadłubów w rezerwie (6 z puli). Pula podpina się pod ISTNIEJĄCE powiadomienie (`notif.mobilizationSubtitle`)
zgodnie z poleceniem sesji („bez nowych kluczy, jeśli się da”); liczba = pula + obudzona rezerwa. → decyzja właściciela
(§5d.8, pytanie 5): nowy klucz PL + EN albo zostaje.
**Decyzja właściciela (2026-10-08):** tekst zostaje; poprawka — etap polerki UI. Otwarty.

### ⚪ 410 — `KOSMOS.debug.spawnMyVessel` z `opts.systemId` tworzy chimerę doku (producent Findingu 407)

`[measured]` prawdziwa gra na fixture: `spawnMyVessel('hull_frigate', { modules: ['weapon_laser'], systemId: 'sys_060' })`
→ statek `docked` przy `entity_2` (`sys_home`) z `systemId` `sys_060`; to samo wywołanie bez `systemId` — statek zgodny
(KONTROLA). Na `45ee9d2` chimera przeżywa zapis i wczytanie; na kodzie sesji 2 (B1) wczytanie ją leczy (jeden wpis
audytu), ale do wczytania żyje w bieżącej sesji. `[code]` `GameScene.js:1428-1477` przekazuje `opts` do
`createAndRegister(…, home.id, { modules, ...opts })` — dok przy domu, `systemId` z opcji (`Vessel.js:143-156`). Trzy
chimery fixture'u (moduły jawne `['weapon_laser']`, pusty dziennik misji) pasują do takiego wywołania — to HIPOTEZA
producenta, nie dowód. Tylko narzędzie debug. → bez kroku.

### ✅ 411 — kadłub ukończony w wojnie PO mobilizacji puli budzi wyłącznie `mobilize_reserve` z guardem parytetu

`[code]` B3 budzi całą uzbrojoną rezerwę RAZ — przy mobilizacji (SB13); reguła `mobilize_reserve` zachowuje guard parytetu
(polecenie sesji). Kadłub, który trafi do rezerwy w trakcie wojny (zlecenie stoczni sprzed wojny ukończone w wojnie —
produkcja nacisku staje w wojnie na `empireNotAtWarWithPlayer`), wejdzie do służby tylko, gdy gracz jest silniejszy —
rozjazd z dosłownym SB13 („guard hamuje wyłącznie w pokoju”). Niezaobserwowany w M3 (w żadnym świecie żaden kadłub nie
ukończył się w wojnie). → decyzja właściciela (§5d.8, pytanie 6).
**Zamknięty 2026-10-08:** ✅ `5dc04d0` (S1-10, **SB29**) — guard parytetu reguły `mobilize_reserve` przepuszcza imperium
w wojnie ze zmobilizowaną pulą. Pomiar (sonda `p3/probes/b8_time_to_service.mjs`, oba ziarna, każde imperium osobno):
przed — kadłub ukończony w wojnie po 10 latach gry w rezerwie (4 z 4 przebiegów); po — w służbie po **2** (`emp_002`)
i **15** (`emp_001`) miesiącach (rzut reguły), jedno `director:mobilized`; KONTROLA: ta sama scena w pokoju — w rezerwie
na obu drzewach `[measured]`.

### #412–#413 — domknięcie S1 (2026-10-08)

⚠ **Registry-first (2026-10-08):** grep rejestrów (`docs/`), `CLAUDE.md`, pamięci i historii commitów przed nadaniem —
najwyższy numer findingu **#411**; trafienia „412”–„419” w `docs/` to numery linii i wartości tabel (`:416`, `:417`,
`:418`, `0,417`), nie findingi `[measured]`.

### ⚪ 412 — panel WYWIAD w grze EN pokazuje polskie „Ostatnie incydenty” i „(brak)”

`[measured: odczyt właściciela]` bramka S1, krok P (gra po angielsku): blok incydentów panelu WYWIAD — „Ostatnie
incydenty — (brak)”. `[code]` `IntelOverlay.js:346` — `ctx.fillText('Ostatnie incydenty', …)`: literał, klucza brak
(kandydat `intel.recentIncidents`, PL „Ostatnie incydenty” / EN „Recent incidents”); `:356` — `ctx.fillText('  (brak)', …)`:
literał, a klucz ISTNIEJE — `intel.none` (PL „(brak)”, EN „(none)”); `:361` — pod nimi surowy slug incydentu (`ev.type`).
`[git]` od `347a64d` (2026-04-16, fundament wojny i dyplomacji). `check-i18n` nie jest ślepy, tylko je toleruje: oba
literały siedzą w baseline zapadki (`'src/ui/IntelOverlay.js': 2`, `tools/check-i18n.mjs:387`). Klasa **113** / **375**.
→ etap polerki UI (bez kroku w S1).

### ✅ 413 — plan puli dokłada kadłub BEZ baku ponad limit, gdy miejsce wynika z minimum z bakiem

`[code]` `FleetPoolPlanner.planPool` (od `a1143fc`): `add = uncovered.slice(0, room)` bierze niepokryte sloty w kolejności
wzorca, także wtedy, gdy `room` wynika wyłącznie z minimum kadłubów z bakiem (`minWarp − z bakiem`), a limit jest już
pełny. Gdy pierwszy niepokryty slot jest BEZ baku, plan dokłada go ponad limitem, a minimum zostaje niespełnione.
`[measured]` limit 2, minimum 3, dwie eskorty z bakiem: plan na `1444184` — `[D]`; z planem do skutku (S1-8, SB27) —
`[D, E]`; limit 4, wzorzec D, D, D, E, minimum 3, dwie eskorty i dwa defendery — tak samo. Osiągalne wyłącznie, gdy
imperium ma mniej kadłubów bez baku niż slotów D, a mimo to pełny limit — czyli więcej kadłubów z bakiem niż slotów E;
przy domyślnym strojeniu (wzorzec D, E, E, E, minimum 2, limit ≥ 2 z `fleetMinHulls` 2) NIEosiągalne: limit 2 ma 1 slot
E, więc taki stan wymaga 2 kadłubów z bakiem = minimum spełnione; od limitu 3 slotów E jest ≥ 2. Kształt naprawy: część miejsca wynikająca z minimum
wypełniana WYŁĄCZNIE kadłubami z bakiem (niepokryte sloty z bakiem albo szablon z bakiem). → decyzja właściciela.
**Zamknięty 2026-10-09:** ✅ `dab5e2a` (A2; decyzja właściciela 2026-10-08 — naprawić): kadłuby dokładane WYŁĄCZNIE dla
minimum z bakiem są szablonami z bakiem; kadłub bez baku nigdy ponad limitem. Keeper NEW `sb1_pool_tank_only_smoke`
10/10 (fail-first na `6b40c30` 5 / 5; KONTROLA strojenia domyślnego zielona po obu stronach). Wyrocznia: planer sprzed
poprawki odtworzony na 32 805 / 32 805 wejściach; poprawiony różni się na 2 349 — wszystkie to przypadki 413 (0 różnic
poza nimi) `[measured]`.

### #414–#416 — S2, sesja 1 (2026-10-09)

⚠ **Registry-first (2026-10-09):** grep rejestrów (`docs/`), `CLAUDE.md`, pamięci i historii commitów przed nadaniem —
najwyższy numer findingu **#413** `[measured]`. **414** i **415** nadane decyzją **SB36** (kandydaci audytu S2, notatka
`HANDOVER_S1_CLOSED.md` §5); **416** — z pomiaru M4 tej sesji.

### ✅ 414 — przylot statku, który NIE jest statkiem gracza, podnosi wywiad gracza o imperium układu

`[code]` `IntelSystem._onVesselArrived` (`IntelSystem.js:199-206` na `dab5e2a`): dla KAŻDEGO `vessel:arrived` z misją
`_resolveSystemIdFromMission` → imperium układu → `advanceIntel(…, 'contact', 'vessel_arrived:…')` — bez pytania
o właściciela statku. `[measured]` audyt S2 (uprząż): przylot kadłuba AI z misją `unknown → contact`, KONTROLA bez lotu
`unknown → unknown`; bramka S2, krok 18b na `d055a05`: `rumor→contact (vessel_arrived:entity_208)` — przylot patrolu AI we
własnym układzie. S2 dokłada źródło (lot drugiego strażnika). ⏳ **B1 (SB36), przygotowane:** `_onVesselArrived` wraca,
gdy statek nie jest statkiem gracza (`_isPlayerVessel`); keeper `sb2_intel_arrival_owner_smoke` 5/5 (fail-first na
`dab5e2a` 3 / 2; KONTROLA — przylot statku gracza dalej podnosi wywiad); bramka S2, krok 18 / 18b na kodzie: eskorta AI
na orbicie `entity_117`, wywiad `rumor` bez zmian `[measured]`.
**Zamknięty 2026-10-10:** ✅ `bf498d1` (B1, SB36). Bramka S2, przebieg 2, krok 18b przed i po locie drugiego strażnika:
wyłącznie `unknown→rumor (debug_set_intel)` `[measured: odczyt właściciela]`.

### ✅ 415 — pierścień ruchu (`_spawnMovementPulse`) dla KAŻDEGO statku, rysowany w oglądanym układzie

`[code]` `ThreeRenderer._spawnMovementPulse` (`ThreeRenderer.js:6452`; subskrypcje `:1098-1100` — `vessel:launched`,
`vessel:arrived`, `vessel:docked`; flaga `fcMovementFx` ON) dodaje pierścień do sceny BIEŻĄCEGO widoku we współrzędnych
statku — bez terminu właściciela, wywiadu i układu, a współrzędne są lokalne dla układu. `[measured]` bramka S2, krok 22
(licznik wywołań, kamera na `sys_home`): kod sesji — **12** pierścieni od statków AI z `sys_059` i `sys_020`, 0 od statków
gracza; KONTROLA `d055a05` — **5** (patrol AI, eskorta z kroku 16). Zjawisko sprzed S2; S2 dokłada źródła (zejście
strażnika z doku, start lotu drugiego strażnika). Skutki: ruch AI widoczny bez wykrycia (mgła wojny) i pierścień w miejscu
bez statku. `[doc: audyt S2]` od `8da65ed`. → **SB36: wyłącznie raport.**
Bramka S2, przebieg 2, krok 22: **8** pierścieni, wszystkie od statków AI (`v_32` z `sys_020`, `v_24`, `v_25` ×2,
`v_26`, `v_1` z `sys_059`), widok `sys_home` `[measured: odczyt właściciela]`. **Najmniejszy kształt poprawki**
(audyt C5, 2026-10-10) `[code]`: na wejściu `_spawnMovementPulse` ta sama bramka układu co subskrybent sprite'a
(`vessel.systemId !== activeSystemId → return`, `:797-800`) i dla kadłuba wroga ta sama bramka wywiadu co jego sprite
(`_applyVesselIntelVisibility`); keeperów zagrożonych brak. Bez poprawki (SB36).
✅ **S2b-5 (SB43) — `d833e0c`, zacommitowane 2026-10-11:** NEW `isMovementPulseVisible` (`VesselFxLogic.js`) + bramka na wejściu
`_spawnMovementPulse` (układ statku = oglądany, w skoku warp — układ startu; statek spoza floty gracza tylko przy wywiadzie
≥ `contact`); keeper `sb2b_pulse_scope_smoke` 10/10 (fail-first na S2b-4: 1/9). Bramka S2b, krok 17 (widok `sys_home`):
narysowane 2 (oba od `v_21`), od statków AI z innego układu 0 przy 24–25 wywołaniach; kontrola `f3fb8e0` — 29 `[measured]`.
**Zamknięty 2026-10-11** (bramka S2b, krok 17, odczyt właściciela): w widoku `sys_home` 28 wywołań pierścienia, narysowane
**2** — oba od `v_21` (statek gracza z oglądanego układu); 25 wywołań od statków AI z innego układu i 1 od statku gracza
z innego układu — nienarysowane `[measured: odczyt właściciela]`.

### ✅ 416 — rozkaz ruchu na ciało, które krąży szybciej, niż leci statek: przylot w czasie liczonym z trasy do punktu przewidzianego na inną chwilę, przeskok na ciało przy przylocie (opis z M4 „ocalali po bitwie nie docierają do celu” — obalony pomiarem)

`[measured]` M4 (fixture, prawdziwa gra; 3 fregaty gracza utworzone sondą `createVessel` 2 AU od stolicy `emp_001`, rozkaz
`moveToPoint` na `entity_115`, prędkość 1,11 AU/rok — dolot ~1,8 roku): w powtórzeniach diagnostycznych przebiegów r0 i r5
(z odczytem pozycji; przeglądarka bez ziarna, więc przebiegi różnią się od pierwszych) po bitwie 2 ocalałe fregaty —
`in_transit`, rozkaz `moveToPoint`, misja `move_to_point`, nie unieruchomione — w odczycie 3 lata po rozkazie 0,49 / 0,94 AU
od stolicy (jedna bitwa przy 60,54) i 0,64 / 0,50 AU (bitwy przy 61,70 i 62,29); bez kolejnej bitwy. Przyczyna niezmierzona;
osiągalność w normalnej grze niezmierzona (fregaty postawione sondą w układzie AI). Liczba bitw w M4 (§5f.5) od tego
zależy. → audyt (pytanie 5, §5f.7).
**Audyt 2026-10-10 (§5g.3)** `[measured]`: w odtworzonym przebiegu r0 fregaty nie utknęły — nie należały do starcia, ich
misja nie była wstrzymywana, a `arrivalYear` wypadał 3,3–3,7 roku po rozkazie, po oknie M4 (r5 — dwie bitwy — nie
odtwarzany); `v_32` doleciał w zaplanowanej chwili i przeskoczył
1,47 AU na ciało. Przyczyna `[code]`: `_issueMoveToPoint` przewiduje pozycję ciała raz, na chwilę dolotu po linii prostej
(`MovementOrderSystem.js:940-941`), a `arrivalYear` liczy z trasy do tego punktu (`:994`); stolica `entity_115` krąży
6,68 AU/rok wobec 1,11 AU/rok fregaty ⇒ dolot 0,25–3,78 roku i przeskok 0,20–2,88 AU zależnie od kąta. Własnym rozkazem
gracza w układzie domowym (`v_21`, `OrderService.issueMove`, planeta 3,6 AU/rok): dolot 4,47 roku zamiast 2,47, przeskok
6,53 AU ⇒ osiągalne w normalnej grze. Ten sam korzeń co notatka S0 „`engage` zawisa 0,86–0,88 AU” (pościg liczy
przechwycenie z `velocity` celu, zerowanej dla kadłuba zadokowanego i orbitującego). Kadłuby AI — ta sama ścieżka.
Kształt poprawki, keepery zagrożone, rekomendacja — §5g.3. → decyzja właściciela (§5g.6, pytanie 1).
✅ **S2b-1 (SB39) — `a8de641`, zacommitowane 2026-10-11:** czas przechwycenia ciała (`VesselManager._interceptBody`) w `_issueMoveToPoint`,
`_resumeMissionAfterOrder` i pościgu `engage` za celem przy ciele (`_bodyChasePoint`); keeper `sb2b_body_intercept_smoke`
20/20 (fail-first na `f3fb8e0`: 11/9). Pomiar §5h.3: przeskok przy przylocie 0,722–2,815 → 0,001–0,029 AU (12 kątów),
`v_21` 6,562 → 0,002 AU, `engage` na strażnika: 0 bitew w 4,1 roku → starcie po 2,48–2,57 roku `[measured]`.
**Zamknięty 2026-10-11** (bramka S2b, odczyty właściciela): rozkaz `v_21` → HD-4177 f — ETA 67,002, przylot 67,004,
przeskok na planetę przy przylocie **0,006 AU**, orbita `entity_6` (właściciel widział statek na orbicie, kroki 14–16);
pościg `engage` na strażnika na orbicie doprowadził do starcia **1,12 roku** po rozkazie (krok 13) `[measured: odczyt
właściciela]`.

### #417–#419 — zamknięcie S2 (2026-10-10)

⚠ **Registry-first (2026-10-10):** grep rejestrów (`docs/`), `CLAUDE.md`, pamięci i historii commitów przed nadaniem —
najwyższy numer findingu **#416**; trafienia „417”–„419” w `docs/` to numery linii, nie findingi `[measured]`. Źródło:
audyt Findingu 416 i ustaleń bramki S2 (§5g.3, §5g.4).

### ✅ 417 — wrak, którego misja była wstrzymana na czas walki, wznawia ją i leci do celu

`[code]` W `_finalizeBattle` przebieg wraków idzie PRZED wznowieniem misji (`DeepSpaceCombatSystem.js:1027-1071`).
`_turnIntoWreck` emituje `vessel:wrecked` → `MovementOrderSystem._onVesselWrecked` (`:2274`) anuluje aktywny rozkaz
(`vessel_wrecked`) → `vessel:orderCancelled` → `VesselManager._resumeMissionAfterOrder` (subskrypcja `:135`) wznawia
migawkę z pauzy bojowej (`_suspendedMission`) — bez pytania o wrak: misja, `on_mission`, `in_transit`, `vessel:launched`.
`_updatePositions` prowadzi wrak jak każdy lot, przy przylocie dokuje go przy celu i emituje `vessel:arrived`. Obie strony
(pauza gracza i AI). `[measured]` fixture, prawdziwa gra: wrak fregaty gracza `v_33` (bitwa 60,54) doleciał 2,79 AU do
stolicy `emp_001` i zadokował przy `entity_115` (63,12); wrak `v_34` — przy `entity_115` 0,09 roku po zniszczeniu;
uprząż: wrak strażnika AI dokończył rozkaz odwrotu na Thuban c. Przylot wraku gracza do układu AI woła też
`IntelSystem._onVesselArrived` (wrak gracza przechodzi `_isPlayerVessel`). Kształt poprawki: `_resumeMissionAfterOrder` —
wrak zdejmuje migawkę i wraca (jedno miejsce dla trzech subskrypcji: `orderCompleted`, `orderCancelled`, `orderBlocked`).
Keepery zagrożone: `ai_combat_mission_pause`, `player_combat_mission_pause`, `order_blocked_resume`. → decyzja właściciela.
✅ **S2b-2 (SB40) — `bf634c1`, zacommitowane 2026-10-11:** `_resumeMissionAfterOrder` — wrak zdejmuje migawkę i wraca; `_updatePositions` — wrak
bez ciała nie jest prowadzony; keeper `sb2b_wreck_still_smoke` 11/11 (fail-first na S2b-1: 5/6). Pomiar: przyloty wraków
w scenie 3 fregat 6 → 0 (10 przebiegów); bramka S2b, kroki 9–10: wrak 0 AU od miejsca zniszczenia przez 5 miesięcy
(kontrola: 0,23 → 0,57 AU w locie) `[measured]`.
**Zamknięty 2026-10-11** (bramka S2b, kroki 9–10, odczyty właściciela): wrak `v_33` — misja `null`, migawka misji brak,
przesunięcie od miejsca zniszczenia **0 AU** przez ~3 miesiące, przyloty wraku **0** `[measured: odczyt właściciela]`.
Wrak na orbicie cmentarnej ciała dalej jedzie z ciałem — **SB48**.

### ✅ 418 — jednostki w ładowni WRAKU żyją, wrak dalej zrzuca, a sprzątanie wraku zostawia je na zawsze

`[code]` Jednostki w ładowni giną ze statkiem wyłącznie w `VesselManager.destroyVessel` (`:1224`, `groundUnit:destroyed`
z przyczyną `transport_lost`). Wrak tamtędy nie przechodzi: `_turnIntoWreck` nie dotyka `groundUnits`, `dropTroop`
(`Vessel.js:806`) i klik trybu zrzutu w `ColonyOverlay` nie pytają o wrak, a `_tickWreckCleanup` (`:2000`, po 30 latach
gry) kasuje wrak z rejestru z pominięciem `destroyVessel` — jednostki zostają `in_cargo` bez statku, ich POP zablokowane na
zawsze (reguła właściciela AI GARRISON). `[measured]` fixture, prawdziwa gra (scena bramki S2, czas klatkami): wrak `v_35`
z `gu_27` w ładowni, tryb zrzutu otwarty; po przywróceniu dominacji gracza `dropTroop(wrak, gu_27, 'entity_115', …)` →
`{ok: true}`, jednostka ląduje. Kształt poprawki: na `vessel:wrecked` jednostki w ładowni giną ścieżką `destroyVessel`
(`groundUnit:destroyed`, rozliczenie POP), tryb zrzutu się zamyka; `dropTroop` odmawia wrakowi. Keepery zagrożone:
`sb2_drop_dominance`, `ground_unit_loss`, `g1c_pop_loss`. → decyzja właściciela.
✅ **S2b-3 (SB41) — `35cdebe`, zacommitowane 2026-10-11:** `_killCargoGroundUnits` na `vessel:wrecked`, w `destroyVessel` i w `_tickWreckCleanup`
(`groundUnit:destroyed`, `transport_lost`); `dropTroop` odmawia `vessel_is_wreck`; `ColonyOverlay._closeDropModeOnWreck`;
keeper `sb2b_wreck_cargo_smoke` 17/17 (fail-first na S2b-2: 8/9). Bramka S2b, kroki 7–7b: tryb zrzutu zamknięty napisem
`Drop failed: vessel is a wreck`, jednostka `transport_lost`, ładownia wraku pusta (kontrola: tryb otwarty, jednostka
`in_cargo` w ładowni wraku) `[measured]`.
**Zamknięty 2026-10-11** (bramka S2b, kroki 6–7c, odczyty właściciela): wrak `v_32` — tryb zrzutu zamknięty napisem
`Drop failed: vessel is a wreck` (właściciel widział go na mapie kolonii), `gu_14` `transport_lost` przy 60,252, ładownia
wraku pusta, mapa kolonii zamknięta `[measured: odczyt właściciela]`.

### ✅ 419 — dwa starcia gracza z tym samym imperium w tym samym 0,01 roku gry mają ten sam identyfikator

`[code]` `DeepSpaceCombatSystem._makeEncounterId` (`:1429`) = `encounter_<rok z 2 miejscami>_<A>_<B>`; drugie starcie tej
samej pary w tym samym 0,01 roku nadpisuje pierwsze w `_activeEncounters`, a `battleId` obu jest ten sam
(`gameState.battles.<id>` nadpisane). `[measured]` uprząż, dwa starcia w dwóch miejscach układu stolicy AI: mapa starć ma
1 wpis zamiast 2; fregata gracza z pierwszego zostaje zamrożona na zawsze — `orbiting`, misja `null`, `_suspendedMission`
i `_combatPause` wiszą, rozkaz `moveToPoint` aktywny, 2 lata później 3,86 AU od celu. KONTROLA — drugie starcie po 0,02
roku: dwa wpisy, wznowienie działa. Osiągalność w normalnej grze niezmierzona (warunek: dwa starcia z tym samym imperium
rozpoczęte w ciągu 0,01 roku gry ≈ 3,65 dnia). Kształt poprawki: unikalny identyfikator (licznik albo id pierwszego statku
pary). Keepery zagrożone: piny formatu `battle_ds_*`/`encounter_*` (do grepa). → decyzja właściciela.
✅ **S2b-4 (SB42) — `e2f3285`, zacommitowane 2026-10-11:** `_makeEncounterId` — sufiks `_2`, `_3`…, gdy id zajęte w `_activeEncounters` albo
w `gameState.battles`; keeper `sb2b_encounter_id_smoke` 8/8 (fail-first na S2b-3: 3/5). **Osiągalność zmierzona** (tryb
klatek, prawdziwa gra): powtórzone id starcia w 12 z 23 przebiegów przed poprawką, po — 0 z 24, 11 starć z sufiksem
`[measured]`. Bliźniak na ścieżce wycofania — **424**.
**Zamknięty 2026-10-11** (`e2f3285`). Bliźniak na ścieżce wycofania (424) — `5043744` (SB47).

### #420–#425 — S2b (2026-10-11)

⚠ **Registry-first (2026-10-11):** grep rejestrów (`docs/`), `CLAUDE.md`, pamięci i historii commitów przed nadaniem —
najwyższy numer findingu **#419**; trafienia „420”–„425” w `docs/` i `CLAUDE.md` to numery linii i wymiary, nie findingi
`[measured]`. Źródło: audyt i pomiary S2b (§5h).

### ✅ 420 — synchronizacja floty liczona do BIEŻĄCEJ pozycji ciała: przy ciele szybszym od statków flota nie ląduje razem

`[code]` `FleetSystem.issueFleetOrder` (`:175-210`) liczy `_arrivalSyncYear` z trasy do BIEŻĄCEJ pozycji celu i prędkości
członków. Dla ciała szybszego od statków ta chwila bywa nieosiągalna dla części członków (ciało jest wtedy poza ich
zasięgiem), więc członek przylatuje w pierwszej późniejszej osiągalnej chwili (S2b-1, `notBefore`) — flota ląduje
w kilku chwilach. `[measured]` fixture, tryb klatek, 3 fregaty, jeden rozkaz floty: po S2b — razem 3/10, rozrzut do
0,227 roku, nikt przed synchronizacją; przed S2b — razem 3/9, rozrzut do 0,879 roku, przeskok przy przylocie do 2,66 AU.
Kształt poprawki: `FleetSystem` liczy synchronizację z przechwyceń członków (wspólna osiągalna chwila nie wcześniejsza niż
najpóźniejsze z ich najwcześniejszych przechwyceń). Czwarta rodzina ścieżek — poza progiem zlecenia S2b. → decyzja
właściciela (§5h.5, pytanie 2).
→ **S3 (SB45, 2026-10-11):** w commicie, w którym eskadra AI przylatuje razem; jeden pomocnik synchronizacji dla flot
gracza i dla eskadry AI.
→ **S3, sesja 1 (2026-10-11):** naprawa PRZYGOTOWANA, NIE zacommitowana — S3-2 (SB54): `GroupArrival.groupArrivalYear`
w `FleetSystem` (cel-ciało) i w eskadrze AI; keeper `sb3_group_arrival_smoke` T2 — flota 1,114 / 2,0 / 3,5 AU/rok na
ciało o okresie 1,406 roku przylatuje razem (102,4360; na S3-1 102,4180 / 101,7960 / 101,7960) (§5j.2). Zamknięcie —
przy commicie S3-2.
✅ **Zamknięty 2026-10-12 — `ee44424` (S3-2, SB54, SB45; §5k.1).** Bramka S3A, krok 18: eskadra A — trzy przyloty do
ciała w 65,7512, rozrzut 0 dni, przeskok 0,009 AU `[measured: odczyt właściciela]`. Flota GRACZA po bitwie w locie —
osobno (SB62, Finding **437**).

### ✅ 421 — statek z misją wstrzymaną na walkę stoi tam, gdzie walka się zaczęła: broń krótsza niż odległość startu walki nie strzela

`[code]` `DeepSpaceCombatSystem` — strona z misją wstrzymaną na walkę jest zamrożona w miejscu startu starcia
(`_pauseSideForCombat`); strzał wyłącznie przy `distanceAU ≤ effectiveRangeAU` (`_tickEncounter`). `[measured]` fixture,
tryb klatek, 3 fregaty z laserem (0,05 AU) na strażnika (rakiety 0,30 AU), oś czasu bitew (4 + 4 przebiegi): po S2b fregaty
oddają **0 strzałów** w każdej bitwie, strażnik strzela z 0,255–0,299 AU; w 10 przebiegach fregaty stracone 30/30,
strażnik zniszczony 0/10. Przed S2b — bitwy po przeskoku na ciało z 0,009–0,021 AU, laser trafia, strażnik zniszczony
6/10. Pościg `engage` dochodzi do zasięgu własnej broni (bramka S2b: starcie z 0,08–0,11 AU). Zmiana wyniku walki to
skutek usunięcia przeskoku przy przylocie (416), nie zmiana walki. → decyzja właściciela (§5h.5, pytanie 3).
→ **S3, pierwszy commit (SB46, 2026-10-11):** kierunek podpisany — uzbrojony statek w starciu bez wroga w zasięgu własnej
broni zbliża się na ten zasięg; strażnik trzyma orbitę. Kształt podpisywany po pomiarze części E (§5i.5). Bramka S2b,
krok 13: fregata z rozkazem `engage` skończyła jako wrak **0,108 AU** od strażnika — poza zasięgiem lasera 0,05 AU
`[measured: odczyt właściciela]`.
→ **S3, sesja 1 (2026-10-11):** naprawa PRZYGOTOWANA, NIE zacommitowana — S3-1 (SB49, kształt O2E):
`DeepSpaceCombatSystem._closeToWeaponRange` przed każdą rundą; część E na kodzie S3 — scena (a): strzały fregat **94**
(87 trafień) z 0,038–0,049 AU, strażnik zniszczony 4/10 (§5j.3). Zamknięcie — przy commicie S3-1.
✅ **Zamknięty 2026-10-12 — `1cf1d24` (S3-1, SB49; §5k.1).** Bramka S3A, krok 14: w drugim starciu fregaty strzelają
z 0,045–0,047 AU (2 strzały, 2 trafienia); w pierwszym fregata zginęła w trakcie zbliżania (tempo starcia — **436**)
`[measured: odczyt właściciela]`. Statek z rozkazem ruchu wydanym w trakcie starcia wykonuje rozkaz — **SB61**.

### ⚪ 422 — misje `MissionSystem` i kurierzy AI: lot do ciała z prędkością różną od prędkości statku (R4)

`[code]` `VesselManager.dispatchOnMission` / `redispatchFromOrbit` / `startReturn` / `redirectToTarget` dostają czas lotu od
wołającego (`MissionSystem` — `travelTime` po linii prostej do BIEŻĄCEJ pozycji; `EmpireLogisticsSystem`), cel przewidziany
na tę samą chwilę ⇒ przylot na czas i bez przeskoku z konstrukcji (`[measured]` kurierzy AI: przylot − ETA ≤ 0,006 roku,
przeskok ≤ 0,010 AU — przed i po S2b), ale trasa do punktu przewidzianego pokonywana z prędkością ≠ prędkości statku
(wariant R2 sprzed S2b). Poza SB39 — raport; prędkości lotu nie zmierzono.
**SB47 (2026-10-11):** zostaje w rejestrze — wyłącznie raport, do zamknięcia arca.

### ⚪ 423 — rozkaz `intercept` na cel zadokowany albo na orbicie ciała nie zamyka pościgu (R5)

`[code]` `MovementOrderSystem._tickInterceptOrder` → `_computeInterceptPoint` z `target.velocity`, zerowanej co tik dla
kadłuba zadokowanego i orbitującego — ten sam korzeń co R3 (`engage`, S2b-1). Rozkaz wyłącznie gracza, na wrogi statek.
Poza SB39 — raport; osiągalność niezmierzona.
**SB47 (2026-10-11):** zostaje w rejestrze — wyłącznie raport, do zamknięcia arca.

### ✅ 424 — bliźniak 419 w `VesselCombatSystem._makeBattleId` (ścieżka wycofania)

`[code]` `battle_ds_<rok>_<A>_<B>` (`VesselCombatSystem.js:426`, „TODO M3”) — przy `m4DeepSpaceCombat` OFF dwie bitwy tej
samej pary w tym samym 0,01 roku nadpisują `gameState.battles.<id>`; walka natychmiastowa, bez starć i bez zamrożeń,
kolizję łagodzi cooldown pary. Flaga w grze ON — utajone.
✅ **Zamknięty 2026-10-11 — `5043744` (S2b-6, SB47):** `_makeBattleId` — reguła SB42 (podstawa bez zmian, przy zajętym
`battles.<id>` przyrostek `_2`, `_3`, …); `_applyOutcome` zwraca identyfikator, a `resolveDeepSpaceBattle` (API debugowe)
czyta rekord po nim — dotąd odtwarzał identyfikator po walce, co przy przyrostku trafiałoby w wolny. Cooldown pary nie
chronił: obejmuje wyłącznie parę wyzwalającą, a dwie RÓŻNE pary tych samych stron kolidowały (komentarz „TODO M3”
zastąpiony). Keeper `sb2b_battle_id_smoke` 9/9 — fail-first na `d833e0c` 5 / 4 (czerwone dokładnie T1a–T1d); mutacja bez
przekazania identyfikatora — pada strażnik T4a/T4b `[measured]`.

### ✅ 425 — `redispatchFromOrbit` bez bramki wraku

`[code]` `VesselManager.redispatchFromOrbit` (`:538-593`) sprawdza `orbiting` i `isInService`, nie `isWreck` (wrak ma stan
`orbiting`); wołający dziś filtrują (rekordy misji zamykane na `vessel:wrecked` — `MissionSystem:147`,
`TransportOrderSystem:191`) — utajone. Po S2b-2 wrak z misją i tak się nie rusza (`_updatePositions`).
✅ **Zamknięty 2026-10-11 — `7b37a4d` (S2b-7, SB47):** `redispatchFromOrbit` — `if (vessel.isWreck) return false` (bramka
SB40). Keeper `sb2b_redispatch_wreck_smoke` 8/8 — fail-first na `5043744` 4 / 4 (czerwone dokładnie T1a–T1c i T3a; wrak
z głębokiej przestrzeni i wrak na orbicie cmentarnej ciała); kontrole T0/T3-0 (wrak przechodzi obie bramki sprzed
poprawki — `orbiting`, „w służbie”) i T2 (żywy statek wychodzi) zielone po obu stronach `[measured]`.

### #426–#435 — S3, sesja 1 (2026-10-11)

⚠ **Registry-first (2026-10-11):** grep rejestrów (`docs/`), `CLAUDE.md`, pamięci i historii commitów przed nadaniem —
najwyższy numer findingu **#425**; trafienia „426”–„437” to numery linii, wartość siły okrętu (`**432**` w tabeli
szablonów §5c) i zapis „wolny 426” w pamięci, nie findingi `[measured]`. **426–432** — siedmiu kandydatów z notatki
przekazania zamknięcia S2b (`HANDOVER_S2B_CLOSED.md` §9.3, poza repo), w podanej kolejności (decyzja **SB60**);
**433–435** — z sesji 1 S3 (§5j).

### ⚪ 426 — „przypięcie” w DSCS: kadłub AI w ataku dostaje `dockedAt` = ciało, którego orbitę trzymają statki gracza, i przeskakuje na nie

`[code]` `DeepSpaceCombatSystem.startEngagement` → `_pauseSideForCombat(strona AI, pin)` z `pin = _findDominantDockedAt(strona
gracza)`: gdy statki gracza orbitują ciało, kadłub AI dostaje to ciało jako `dockedAt`, a `_updatePositions` przenosi go NA
ciało. `[measured]` część E S2b, scena (c) (3 fregaty z laserem na orbicie domu, 2 eskorty rakietowe `attack`): skok
0,245–0,30 AU, potem strzały z 0,000 AU — lasery obrońców trafiają 200/209, eskorty zniszczone 20/20; na kodzie S3 — 210
strzałów (200 trafień), eskorty 20/20 (§5j.3). Asymetria: gdy obrońcą jest AI (strażnik), pin liczony ze strony gracza
(w locie) to `null` — gracz nie jest przyciągany.
**SB50 (2026-10-11):** zostaje w S3 tak, jak zbudowano.

### 🟠 427 — `ObservatorySystem` liczy statek W SKOKU jako obecny w oglądanym układzie (klasa 151)

`[code]` `ObservatorySystem.js:590` (detekcja statków w zasięgu obserwatorium) — statek w tranzycie warp (`systemId`
`null`) liczony jak statek oglądanego układu, na współrzędnych sprzed skoku; przy obserwatorium poziomu 4+ (zasięg ∞)
dotyczyłoby KAŻDEGO skoku `[derived: notatka S2b §9.3, F4]`. Ta sama klasa co **151** (`ProximitySystem:187`).
→ **S3, sesja 2 (SB59):** razem z 151 i wpisem dzwonka o uzbrojonym wrogim kadłubie.

### ⚪ 428 — punkt przylotu po skoku losowany osobno dla każdego statku

`[code]` `VesselManager._tickInterstellar` (`:2975-2976` na `2a09ac9`) — kąt na okręgu 30 AU z `Math.random()` (bez
ziarna), osobno dla każdego statku: statki skaczące razem pojawiają się w różnych punktach obrzeża. `[measured]` notatka S2b
§9.2 (F3).
**Częściowo w S3-2 (SB54):** eskadra AI (`OrderService.issueGroupAttack`) dostaje JEDEN kąt na grupę (`mission.arrivalAngle`)
— rozrzut punktu 0,000 AU w M5 (§5j.3). Skok statków gracza idzie przez planer `WarpRouteSystem`, który kąta nie zna —
tam losowanie per statek zostaje.

### ⚪ 429 — wykrywanie (`ProximitySystem`) bierze ZADOKOWANE statki gracza jako obserwatorów

`[measured]` notatka S2b §9.3 (F4): partner pary detekcji to statek gracza w doku. Zachowanie, nie błąd — do potwierdzenia,
czy zamierzone.

### ⚪ 430 — obrona naziemna gracza przy technologiach fixture'u nie zabija jednostek AI

`[measured]` notatka S2b §9.2 (F2): `garrison_unit` gracza — 0 zabitych jednostek AI w 72 przebiegach. Balans obrony
naziemnej — **poza S3 (SB60)**. W M5 sesji 1 (§5j.3) każdy desant na dom gracza bez wojsk naziemnych kończy się przejęciem
kolonii.

### ⚪ 431 — w 1 z 36 przebiegów małej kolonii koszary zniknęły z rejestru aktywnych budynków po ~0,2 roku

`[measured]` notatka S2b §9.2 (F2). Przyczyna niezbadana.

### ⚪ 432 — limit 20 rund starcia: przegrana strona idzie na wrak także żywymi okrętami, które nie mogły strzelać z odległości

`[code]` `DeepSpaceCombatSystem` — koniec starcia po `MAX_ROUNDS` 20: przegrana strona (niższe HP) traci żywe kadłuby jako
wraki. `[measured]` część E S2b, sceny (a)/(b): po 9 żywych fregat gracza wrakiem przy limicie rund; na kodzie S3 (SB49 —
zbliżenie przed rundą) 1 i 3 (§5j.3). Obserwacja projektu.

### ⚪ 433 — `w3_ai_invasion_smoke` T5 nie odróżnia celu z `getPlayerColonies` od celu z `getAllColonies`

`[measured]` dowód mutacyjny przecelowań R-S3 (§5j.2): mutant „cel desantu z kolonii WSZYSTKICH właścicieli” przeżywa
pin T5 na kodzie S3 i na `2a09ac9` — w układzie sceny T5 nie ma kolonii AI, a reguła „najpierw dom” wybiera dom gracza
z obu list. Słabość pinu sprzed S3 (od reguły „najpierw dom”), nie skutek przecelowania. Naprawa — scena z kolonią AI
w układzie celu.

### ⚪ 434 — transportowiec eskadry po desancie zostaje na orbicie celu na zawsze

`[code]` żadna ścieżka nie zabiera nieuzbrojonego kadłuba AI z cudzego układu: odwołanie (`DirectorRecall`,
`strandedWarshipsAwayFromHome`) i pule Directora wymagają `hasWeapons`. `[measured]` M5 (§5j.3): po każdym desancie
transportowiec stoi na orbicie domu gracza z pustą ładownią do końca przebiegu, eskorta odlatuje (odwołanie) zaraz po
desancie. Do decyzji przy S3/2 (SB58 — eskorta trzyma orbitę do rozstrzygnięcia walki naziemnej).
→ **SB63 (2026-10-12):** transportowiec zostaje z eskortą nad celem, aż walka naziemna się rozstrzygnie; potem wszyscy
wracają do stolicy istniejącym odwołaniem; transportowiec znika, gdy zadokuje przy stolicy — S3, sesja 2.

### ⚪ 435 — samotny NIEUZBROJONY transportowiec wygrywa bitwę planetarną z niebronioną kolonią i ląduje

`[code]` bitwa planetarna (`BattleSystem`, `MAX_TURNS` 30) po limicie tur rozstrzyga przewaga HP (`BattleSystem.js:165`);
obrońcą kolonii gracza bez statków i bez budynków obrony jest OBRONA SYMBOLICZNA (`WarSystem._buildPlayerBattleUnit`,
gałąź bez floty i bez obrony: 30 HP, broń 2 obrażeń; fantom **W3-26** `{hp: 100, weapons: []}` zostaje wyłącznie przy
braku broniącej kolonii — `_defendingColonies` puste), a nieuzbrojony kadłub wnosi HP (D-199-6, Finding **200**) —
`transport_assault` (`hull_large`) 180 HP. `[measured]` kontrola M5 (§5j.3; dom gracza w fixture bez budynków obrony):
ten sam transportowiec wysłany OSOBNO starą ścieżką `issueAttack` dolatuje sam po 1,19–1,24 roku, wygrywa bitwę
planetarną 3/3 (limit 30 tur; traci 16–22 HP, obrona 0) i ląduje 6 jednostek; dom pada po 11,2–12,0 mies. W eskadrze
(S3-2) transportowiec nie przylatuje przed eskortą (0 z 47 przylotów w M5); przylot samego transportowca po utracie
całej eskorty po drodze — niezmierzony.
Do decyzji: czy wygrana BEZ broni nad kolonią bez obrony ma dawać dominację (SB7 — „desant dopiero po wygraniu orbity”).
→ **SB66 (2026-10-12):** transportowiec, który stracił całą eskortę, zawraca do stolicy, a eskadra jest przerywana;
reguły bitwy planetarnej bez zmian — S3, sesja 2.

### #436–#437 — S3, zamknięcie sesji 1 (2026-10-12)

⚠ **Registry-first (2026-10-12):** grep rejestrów (`docs/`), `CLAUDE.md`, pamięci i historii commitów przed nadaniem —
najwyższy numer findingu **#435**; trafienia „436”–„449” to numery linii i wartości tabel, nie findingi; pamięć: „wolny 436”
`[measured]`. Źródło: bramka S3A (§5k.2) i odpowiedzi właściciela (SB62, SB67).

### ⚪ 436 — starcie w przestrzeni rozstrzyga się w ułamku sekundy: gracz nie zdąży zareagować

`[code]` `DeepSpaceCombatSystem` — runda co `ROUND_INTERVAL_MS` 110 ms czasu REALNEGO (do `MAX_ROUNDS_PER_TICK` 4 rund na
klatkę nadrabiania), `MAX_ROUNDS` 20, obrażenia × `DAMAGE_MULT` 3,0 — starcie trwa najwyżej ok. 2,2 s realnych, niezależnie
od prędkości gry (tempo z 2026-07-26). `[measured: odczyt właściciela]` bramka S3A, T2 i krok 14: starcie fregaty z laserem
ze strażnikiem przegrane w ok. pół sekundy, zanim właściciel zdążył zapauzować; fregata zginęła od 4 trafień rakiet z 4
(z 0,279 i 0,128 AU) w trakcie zbliżania do zasięgu lasera (0,05 AU), bez strzału; następne starcie — tak samo szybko. Słowa
właściciela: „walki odbywają się zbyt szybko albo czas mamy ustawiony zły do bitew”.
→ **SB67 (2026-10-12):** czas rundy jako klucz strojenia (domyślnie dzisiejsza wartość) WYŁĄCZNIE, jeśli pomiar pokaże, że
wyniki bitew od niego nie zależą — S3, sesja 2.

### ⚪ 437 — flota GRACZA po bitwie w locie wznawia lot osobno (SB62)

`[code]` ponowna synchronizacja grupy po bitwie w locie (`OrderService._regroupAfterBattle`, S3-2) obejmuje wyłącznie grupy
z `mission.groupId` — eskadrę AI (`issueGroupAttack`); flota gracza (`FleetSystem.issueFleetOrder`) `groupId` nie ma, więc po
bitwie w locie każdy członek wznawia lot z własnym przechwyceniem (`DeepSpaceCombatSystem._resolveMissionsPostBattle` →
`VesselManager._resumeMissionAfterOrder`) i flota może dolecieć w kilku chwilach. Zachowanie niezmierzone (pytanie 3 sesji 1,
§5j.5).
**SB62 (2026-10-12):** zostaje; wyłącznie raport.

---

## 7. Korekty cudzych rejestrów (wpisane w rejestrach macierzystych)

- **50 — ✅ ZAMKNIĘTY 2026-10-06** w `W3_PLAN.md` §50 (decyzja **SB12**): D7 wdrożone w całości w AI GARRISON G2b —
  `launchInvasion` tworzy każdą jednostkę desantu przez `createAIUnit` (`InvasionSystem.js:165`, `980043f`), jawna lista tą
  samą drogą (`f027e7c`, Finding **323**), `INVASION_UNIT_POOLS` usunięte (`23a87e5`, Finding **340**) `[code]` `[git]`;
  bramka live właściciela PASS (`AI_GARRISON_PLAN.md` §5ze) `[doc]`.
