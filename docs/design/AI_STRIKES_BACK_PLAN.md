# AI STRIKES BACK — flota, strażnik i desant AI

> **Status:** 📋 **PLAN PODPISANY 2026-10-06** — zakres (cztery pozycje, w kolejności właściciela) i decyzje
> **SB1–SB12** podpisane przez właściciela **2026-10-06**; **SB13–SB19** — tego samego dnia, przy zamknięciu S0 (§2).
> Faza A (audyt i pomiar, bez kodu): `docs/design/AI_STRIKES_BACK_AUDIT.md` (zmierzone na `8b72c47`, kod gry `23a87e5`).
> ✅ **S0 ZAMKNIĘTY 2026-10-06** (trzy defekty: **391**, **392**, **393 + 394**; bramka live właściciela PASS — §5a,
> wynik — §5b): `9c73023` · `e73c890` · `cf2a598` · `eb6c06e`. **Następny: S1** (§3). **S2–S4** — nierozpoczęte.
> Save **v101**. Każdy slice zakłada zero migracji tam, gdzie się da: pola statku są na białych listach
> `VesselManager.serialize`/`restore` (`VesselManager.js:1475-1478`, `:1540-1547`, `:1613-1617`, `:1677-1682`), a stan
> puli i odrastania może żyć w `empires.<id>` — wzór flagi garnizonu D15 (`AI_GARRISON_PLAN.md` §1) `[doc: audyt fazy A]`.
> **Rejestr macierzysty findingów #391–#406:** ten plik, §6. Korekty cudzych rejestrów (**50**): §7.
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

---

## 3. Plan

Estymaty i keepery zagrożone — z audytu fazy A (P6), przeniesione na slice'y podpisane. ⚠ Podpis przesunął **K3/K4**
(393, 394) z audytowego S2 (strażnik) do **S0**, więc S0 dziedziczy też keepery dominacji z audytowego S2. Kalibracja
estymat: arc AI GARRISON — 67 commitów, 9 bramek w przeglądarce, ~13 pod-slice'ów w pięć dni ⇒ ~2–3 pod-slice'y
dziennie `[doc: audyt fazy A, P6]`.

| slice | zawartość | findingi / decyzje | estymata | keepery zagrożone (audyt P6) | bramka |
|---|---|---|---|---|---|
| **S0** | trzy defekty: zaległość gracza blokuje kadłuby AI · martwy guard załogi AI i pobór POP na załogę AI · dominację odbierają wyłącznie kadłuby, z którymi da się walczyć (obie strony predykatu) | **391** · **392** · **393** · **394** · SB2 · SB4 · SB5 | 1 dzień — ✅ zamknięty 2026-10-06 (§5b) | `fleet_upkeep_imperial`, `w2_deploy_ui`, `w2_reserve_upkeep`, `w2_ai_mobilization`, `director_*` (6); z audytowego S2: `w3_dominance_persist`, `g2_peace_followups`, `combat_system_scope` | tak — **PASS 2026-10-06** (§5a): z 6 kadłubów `emp_001` w służbę weszły **2** (`v_24`, `v_25`), **4** zatrzymał parytet (`empireOutgunnedByPlayer`, 1 314 > 618) |
| **S1** | tabela strojenia + komenda konsoli + odczyt (SB9, SB16) · limit floty (SB3, SB14) · pula: kadłuby przy mobilizacji, w służbie i zadokowane przy stolicy, odrastanie 1 kadłub/rok, bez załogi (SB1, SB2, SB15, SB17, SB18) · mobilizacja wojenna całej rezerwy (SB13) · odczyt floty / limitu w wywiadzie (SB19). ⓘ Kandydat 9 notatki przekazania S0 (parytet zatrzymuje mobilizację po pierwszej porcji — 4 z 6 fregat GATE-S4 zostaje w rezerwie) NIE jest findingiem: odpowiada na niego SB13. | SB1 · SB2 · SB3 · SB9 · SB13–SB19 | 2–3 dni | Director 6–10; `deploy_seams`, `w2_deploy_model` | tak |
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

---

## 7. Korekty cudzych rejestrów (wpisane w rejestrach macierzystych)

- **50 — ✅ ZAMKNIĘTY 2026-10-06** w `W3_PLAN.md` §50 (decyzja **SB12**): D7 wdrożone w całości w AI GARRISON G2b —
  `launchInvasion` tworzy każdą jednostkę desantu przez `createAIUnit` (`InvasionSystem.js:165`, `980043f`), jawna lista tą
  samą drogą (`f027e7c`, Finding **323**), `INVASION_UNIT_POOLS` usunięte (`23a87e5`, Finding **340**) `[code]` `[git]`;
  bramka live właściciela PASS (`AI_GARRISON_PLAN.md` §5ze) `[doc]`.
