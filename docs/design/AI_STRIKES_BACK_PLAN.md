# AI STRIKES BACK — flota, strażnik i desant AI

> **Status:** 📋 **PLAN PODPISANY 2026-10-06** — zakres (cztery pozycje, w kolejności właściciela) i decyzje
> **SB1–SB12** podpisane przez właściciela **2026-10-06**; **SB13–SB19** — tego samego dnia, przy zamknięciu S0;
> **SB20–SB25** — **2026-10-07**, odpowiedzi na pytania sesji 1 S1 (§2).
> Faza A (audyt i pomiar, bez kodu): `docs/design/AI_STRIKES_BACK_AUDIT.md` (zmierzone na `8b72c47`, kod gry `23a87e5`).
> ✅ **S0 ZAMKNIĘTY 2026-10-06** (trzy defekty: **391**, **392**, **393 + 394**; bramka live właściciela PASS — §5a,
> wynik — §5b): `9c73023` · `e73c890` · `cf2a598` · `eb6c06e`.
> ✅ **S1 — sesja 1 z 2 ZAMKNIĘTA 2026-10-07** (tabela strojenia + limit floty, bez bramki — zachowanie gry bez zmian;
> wynik, audyt, pomiary M1/M2 — §5c): `eb17f97` · `8abe84d`.
> ⏳ **S1 — sesja 2 z 2 (2026-10-08): KOD PRZYGOTOWANY I ZASTAGOWANY, NIE ZACOMMITOWANY** — leczenie Findingu 407 przy
> wczytaniu, pula okrętów, mobilizacja całej rezerwy w wojnie, odrastanie, odczyt wywiadu „flota / limit” (decyzje
> **SB20–SB25** — §2; wynik, pomiar M3, bramka — §5d). Czeka na zgodę właściciela na trzy przecelowania pinów
> (R-B2a, R-B2b, R-B5 — §5d.4) i na bramkę w przeglądarce (`kosmos-handover/ai-strikes-back-s1/gate/GATE_S1.md`).
> **S2–S4** — nierozpoczęte.
> Save **v101**. Każdy slice zakłada zero migracji tam, gdzie się da: pola statku są na białych listach
> `VesselManager.serialize`/`restore` (`VesselManager.js:1475-1478`, `:1540-1547`, `:1613-1617`, `:1677-1682`), a stan
> puli i odrastania może żyć w `empires.<id>` — wzór flagi garnizonu D15 (`AI_GARRISON_PLAN.md` §1) `[doc: audyt fazy A]`.
> **Rejestr macierzysty findingów #391–#411:** ten plik, §6. Korekty cudzych rejestrów (**50**): §7.
> ⚠ Znaczniki źródła: `[code]` — przeczytane w źródle (#391–#396 na `8b72c47`, #397–#406 na `eb6c06e`) ·
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

---

## 3. Plan

Estymaty i keepery zagrożone — z audytu fazy A (P6), przeniesione na slice'y podpisane. ⚠ Podpis przesunął **K3/K4**
(393, 394) z audytowego S2 (strażnik) do **S0**, więc S0 dziedziczy też keepery dominacji z audytowego S2. Kalibracja
estymat: arc AI GARRISON — 67 commitów, 9 bramek w przeglądarce, ~13 pod-slice'ów w pięć dni ⇒ ~2–3 pod-slice'y
dziennie `[doc: audyt fazy A, P6]`.

| slice | zawartość | findingi / decyzje | estymata | keepery zagrożone (audyt P6) | bramka |
|---|---|---|---|---|---|
| **S0** | trzy defekty: zaległość gracza blokuje kadłuby AI · martwy guard załogi AI i pobór POP na załogę AI · dominację odbierają wyłącznie kadłuby, z którymi da się walczyć (obie strony predykatu) | **391** · **392** · **393** · **394** · SB2 · SB4 · SB5 | 1 dzień — ✅ zamknięty 2026-10-06 (§5b) | `fleet_upkeep_imperial`, `w2_deploy_ui`, `w2_reserve_upkeep`, `w2_ai_mobilization`, `director_*` (6); z audytowego S2: `w3_dominance_persist`, `g2_peace_followups`, `combat_system_scope` | tak — **PASS 2026-10-06** (§5a): z 6 kadłubów `emp_001` w służbę weszły **2** (`v_24`, `v_25`), **4** zatrzymał parytet (`empireOutgunnedByPlayer`, 1 314 > 618) |
| **S1** | tabela strojenia + komenda konsoli + odczyt (SB9, SB16) · limit floty (SB3, SB14) · pula: kadłuby przy mobilizacji, w służbie i zadokowane przy stolicy, odrastanie 1 kadłub/rok, bez załogi (SB1, SB2, SB15, SB17, SB18) · mobilizacja wojenna całej rezerwy (SB13) · odczyt floty / limitu w wywiadzie (SB19). ⓘ Kandydat 9 notatki przekazania S0 (parytet zatrzymuje mobilizację po pierwszej porcji — 4 z 6 fregat GATE-S4 zostaje w rezerwie) NIE jest findingiem: odpowiada na niego SB13. | SB1 · SB2 · SB3 · SB9 · SB13–SB25 · 398 · 407 · 408 | 2–3 dni | Director 6–10; `deploy_seams`, `w2_deploy_model` | tak — po sesji 2. Sesja 1 ✅ 2026-10-07 (§5c): tabela strojenia i limit floty bez bramki (nic w grze ich nie czyta); jednolinijkowce części „tabela” zwalidowane w prawdziwej grze na fixture · Sesja 2 (§5d): scenariusz całego S1 (`GATE_S1.md`, poza repo) zwalidowany w prawdziwej grze na kodzie sesji i na kontroli `45ee9d2`; bramka właściciela po zgodzie na przecelowania |
| **S2** | strażnik na orbicie stolicy i drugiego ciała; strażnik drugiego ciała leci ze stolicy (SB5, SB6). ⓘ Kandydat 10 notatki przekazania S0 (zmobilizowani strażnicy stoją w doku, więc od S0-3 nie bronią orbity) NIE jest findingiem: odpowiada na niego S2. | SB5 · SB6 | 1–2 dni | `war_doctrine` (keepery dominacji z audytowego S2 przecelował S0: R3/R4, `cf2a598`) | tak |
| **S3** | eskadra z transportowcem · desant po wygranej orbicie · odbijanie · fale (SB7, SB8, reguły SB11) | **396** · **406** · 384 · 344 · 55 · SB7 · SB8 · SB11 | 3–4 dni | `w3_ai_invasion`, `g2b_invasion`, `ai_capture_*` (4), `battle_announce_once`, `g2_war_gate` | tak |
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

#### 5d.4 Przecelowania pinów — CZEKAJĄ NA ZGODĘ (pin czerwony, propozycja + dowód mutacyjny)

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
| 2 · 0 | D, E | minimum 2 z bakiem dopełnia dopiero odrastanie (rok później) — pytanie 3, §5d.8 |
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

#### 5d.8 Pytania do właściciela (otwarte po sesji 2)

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

### 🟠 396 — desant z bitwy liczy POJEMNOŚĆ, nie ładunek: pusta ładownia daje do 6 jednostek z każdej wygranej bitwy (K6)

`_onVesselGroupVictory`: `troopCount = max(1, min(6, ⌊Σ troopCapacity⌋))` (`InvasionSystem.js:294-295`), a gdy ładownie
ocalałych zrzutowców są puste, `launchInvasion` dostaje `null` zamiast listy (`:307`) i składa falę ze szczebla drabiny D9
`[code]` ⇒ każda wygrana bitwa orbitalna z ocalałym zrzutowcem to nowa fala do 6 jednostek „z niczego”. Pomiar D2: transport
z pustą ładownią — **12** jednostek z **0** przewiezionych w dwóch bitwach `[doc: audyt fazy A]`. Rodzina **384**. Dziś
uśpione: AI nie ma zrzutowca (**49**, **201**). → **S3** (SB7: wojska przylatują na pokładzie; SB8: wielkość desantu).

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

### ⚪ 398 — odczyt wywiadu „wolna załoga: {0} POP” nie przewiduje już niczego (kandydat 2)

`IntelOverlay.js:296-298` (`intel.crewCapacity`, przy wywiadzie `detailed`) pokazuje `knownCrewCapacity`, czyli `freePops`
stolicy AI (`IntelSystem.js:288`); od S0-2 ta liczba nie bramkuje mobilizacji AI, a gracz może ją czytać jako limit
`[code]`. Nagłówek `_reserveReadout` (`IntelSystem.js:268-270`) nadal opisuje ją jako ogranicznik mobilizacji; adnotacja
S0-2 stoi przy `:281-283` `[code]`. → **S1** (SB19: odczyt floty / limitu zamiast „wolnej załogi”).
**Sesja 2 (2026-10-08):** ⏳ zamknięcie przygotowane w B5 (§5d.2) — czeka na commit.

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

### 🟠 406 — tryb zrzutu otwarty przy dominacji zrzuca także po jej utracie (obserwacja z bramki S0)

`[code]`: klik heksu w trybie zrzutu (`ColonyOverlay.js:4693-4745`) sprawdza ocean, istnienie statku i kolejkę, po czym
woła `dropTroop` (`Vessel.js:788`) → `unloadGroundUnit` (`Vessel.js:749`); obie sprawdzają tylko moduł, ładunek i bramkę
wojny — **nie dominację i nie położenie statku**. Dominacja jest sprawdzana tylko przy wejściu w tryb (`:333`) ⇒ heks da
się wybrać i zrzut się wykonuje. Docstring `dropTroop` (`Vessel.js:777`, „dominacji orbitalnej (sprawdza caller)”) jest
dla tej ścieżki nieprawdą. Osiągalność w normalnej grze niezmierzona; bez kroku — kandydat do **S3** (desant, odbijanie).

### #407–#408 — S1, sesja 1 (2026-10-07)

⚠ **Registry-first (2026-10-07):** grep rejestrów (`docs/`), `CLAUDE.md`, pamięci i historii commitów przed nadaniem — najwyższy
numer findingu **#406**; trafienia „407” to numery linii (`EmpireColonyBootstrap.js:404-407` w pamięci) i zapis „pierwszy
wolny 407” w notatce S0, nie findingi `[measured]`. Źródło: pomiary tej sesji (§5c). `plik:linia` na `8abe84d`.

### 🟠 407 — kanoniczny fixture GATE-S4 niesie trzy fregaty-chimery gracza; „dom gracza `sys_060`” w audycie fazy A jest błędne

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
**SB24 (2026-10-07):** ⏳ leczenie przy wczytaniu przygotowane w B1 (§5d) — po nim jednolinijkowiec zwraca `""`, a obrona
domu gracza liczy trzy fregaty (HP 30 → 360). Opisy „dom gracza `sys_060`” (`AI_STRIKES_BACK_AUDIT.md:185`) i „fregaty
w `sys_060`” (`FE_SUPPLY_PLAN.md:1098`, `CLAUDE.md`) poprawione 2026-10-08. Producent chimer — Finding **410**.

### 🟠 408 — przy SB14 limit fixture'owego `emp_001` wypełniają kadłuby bez baku warp: pula nie doda kadłuba, uderzenie niemożliwe

`[measured]`: limit floty `emp_001` = **6**, uzbrojonych **6** — pięć defenderów i jeden kadłub z modułami defendera
z adnotacją eskorty (K5 / **395**), wszystkie z `warpFuel.max = 0`; miejsce dla puli **0**. M2 (wojna, 10 lat, cała rezerwa
w służbie): wyzwalacz `strike_player_target` przechodzi przy każdej ocenie (cel `sys_home` w zasięgu), guard
`empireHasStrikeForce` odmawia **121 / 121**; żaden kadłub nie opuszcza układu stolicy. Pula wg SB14 dopełnia do limitu,
licząc WSZYSTKIE uzbrojone kadłuby — więc nie doda eskorty z bakiem, a bez niej `emp_001` nie uderzy (S4) i nie wyśle
strażnika do ciała w innym układzie (SB6; w fixture drugie ciało D11 leży akurat w układzie stolicy — S2 nie jest
zablokowany). Konsekwencja dwóch podpisanych decyzji (SB14 + produkcja nacisku zamawia defendery), nie defekt kodu.
→ decyzja właściciela przy składzie puli (§5c, pytanie 2).
**SB21 (2026-10-07):** minimum 2 kadłubów z bakiem także ponad limitem — ⏳ przygotowane w B2: w wojnie fixture'owy
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

### ⚪ 410 — `KOSMOS.debug.spawnMyVessel` z `opts.systemId` tworzy chimerę doku (producent Findingu 407)

`[measured]` prawdziwa gra na fixture: `spawnMyVessel('hull_frigate', { modules: ['weapon_laser'], systemId: 'sys_060' })`
→ statek `docked` przy `entity_2` (`sys_home`) z `systemId` `sys_060`; to samo wywołanie bez `systemId` — statek zgodny
(KONTROLA). Na `45ee9d2` chimera przeżywa zapis i wczytanie; na kodzie sesji 2 (B1) wczytanie ją leczy (jeden wpis
audytu), ale do wczytania żyje w bieżącej sesji. `[code]` `GameScene.js:1428-1477` przekazuje `opts` do
`createAndRegister(…, home.id, { modules, ...opts })` — dok przy domu, `systemId` z opcji (`Vessel.js:143-156`). Trzy
chimery fixture'u (moduły jawne `['weapon_laser']`, pusty dziennik misji) pasują do takiego wywołania — to HIPOTEZA
producenta, nie dowód. Tylko narzędzie debug. → bez kroku.

### ⚪ 411 — kadłub ukończony w wojnie PO mobilizacji puli budzi wyłącznie `mobilize_reserve` z guardem parytetu

`[code]` B3 budzi całą uzbrojoną rezerwę RAZ — przy mobilizacji (SB13); reguła `mobilize_reserve` zachowuje guard parytetu
(polecenie sesji). Kadłub, który trafi do rezerwy w trakcie wojny (zlecenie stoczni sprzed wojny ukończone w wojnie —
produkcja nacisku staje w wojnie na `empireNotAtWarWithPlayer`), wejdzie do służby tylko, gdy gracz jest silniejszy —
rozjazd z dosłownym SB13 („guard hamuje wyłącznie w pokoju”). Niezaobserwowany w M3 (w żadnym świecie żaden kadłub nie
ukończył się w wojnie). → decyzja właściciela (§5d.8, pytanie 6).

---

## 7. Korekty cudzych rejestrów (wpisane w rejestrach macierzystych)

- **50 — ✅ ZAMKNIĘTY 2026-10-06** w `W3_PLAN.md` §50 (decyzja **SB12**): D7 wdrożone w całości w AI GARRISON G2b —
  `launchInvasion` tworzy każdą jednostkę desantu przez `createAIUnit` (`InvasionSystem.js:165`, `980043f`), jawna lista tą
  samą drogą (`f027e7c`, Finding **323**), `INVASION_UNIT_POOLS` usunięte (`23a87e5`, Finding **340**) `[code]` `[git]`;
  bramka live właściciela PASS (`AI_GARRISON_PLAN.md` §5ze) `[doc]`.
