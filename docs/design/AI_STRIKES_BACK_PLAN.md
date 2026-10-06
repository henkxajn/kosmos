# AI STRIKES BACK — flota, strażnik i desant AI

> **Status:** 📋 **PLAN PODPISANY 2026-10-06** — zakres (cztery pozycje, w kolejności właściciela) i decyzje
> **SB1–SB12** podpisane przez właściciela **2026-10-06**. Faza A (audyt i pomiar, bez kodu):
> `docs/design/AI_STRIKES_BACK_AUDIT.md` (zmierzone na `8b72c47`, kod gry `23a87e5`). **S0** (trzy defekty: **391**,
> **392**, **393 + 394**) — zakres podpisany 2026-10-06 (§5); łatki przygotowywane w sesji 2026-10-06, commit po bramce
> live. **S1–S4** — nierozpoczęte.
> Save **v101**. Każdy slice zakłada zero migracji tam, gdzie się da: pola statku są na białych listach
> `VesselManager.serialize`/`restore` (`VesselManager.js:1475-1478`, `:1540-1547`, `:1613-1617`, `:1677-1682`), a stan
> puli i odrastania może żyć w `empires.<id>` — wzór flagi garnizonu D15 (`AI_GARRISON_PLAN.md` §1) `[doc: audyt fazy A]`.
> **Rejestr macierzysty findingów #391–#396:** ten plik, §6. Korekty cudzych rejestrów (**50**): §7.
> ⚠ Znaczniki źródła: `[code]` — przeczytane w źródle (#391–#396 na `8b72c47`) · `[measured]` — wykonane i policzone ·
> `[git]` — historia commitów · `[doc]` — przepisane z dokumentu, bez ponownego pomiaru · `[doc: audyt fazy A]` —
> z raportu fazy A (`AI_STRIKES_BACK_AUDIT.md`; sondy i wyniki poza repo,
> `C:\Users\Komputer\kosmos-handover\ai-strikes-back\`).

---

## 0. Cel

Po AI GARRISON imperium AI broni swoich ciał na ziemi, ale w przestrzeni nie ma zębów. Audyt fazy A zmierzył to wprost:

- **bez nacisku gracza AI nie buduje ani jednego okrętu w 100 lat gry** — uprząż, oba ziarna, oba imperia: 0 uzbrojonych
  kadłubów przy gy 20 / 40 / 60 / 80 / 100 `[doc: audyt fazy A, C1]`;
- **jedyny producent zamówień okrętów wojennych to odpowiedź na nacisk** (`DirectorPressure.pressureResponse`), a oba jej
  szczeble mają guard `empireNotAtWarWithPlayer` — **w wojnie AI nie zamawia żadnego okrętu** `[doc: audyt fazy A, C1]`;
- **każdy kadłub ze stoczni stoi w rezerwie**: przy stałym nacisku i opłacanej flocie gracza 6–8 okrętów na 100 gy na
  imperium, 0–1 z bakiem warp, prawie wszystkie w rezerwie; w fixture GATE-S4 (gy 60) `emp_001` ma 6 uzbrojonych
  kadłubów — **0 w służbie, 6 w rezerwie** `[doc: audyt fazy A, C1]`;
- **AI nigdy nie odbija utraconej koloni i nigdy samo nie zaczyna wojny** — jedyna droga wypowiedzenia „z inicjatywy”
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

---

## 3. Plan

Estymaty i keepery zagrożone — z audytu fazy A (P6), przeniesione na slice'y podpisane. ⚠ Podpis przesunął **K3/K4**
(393, 394) z audytowego S2 (strażnik) do **S0**, więc S0 dziedziczy też keepery dominacji z audytowego S2. Kalibracja
estymat: arc AI GARRISON — 67 commitów, 9 bramek w przeglądarce, ~13 pod-slice'ów w pięć dni ⇒ ~2–3 pod-slice'y
dziennie `[doc: audyt fazy A, P6]`.

| slice | zawartość | findingi / decyzje | estymata | keepery zagrożone (audyt P6) | bramka |
|---|---|---|---|---|---|
| **S0** | trzy defekty: zaległość gracza blokuje kadłuby AI · martwy guard załogi AI i pobór POP na załogę AI · dominację odbierają wyłącznie kadłuby, z którymi da się walczyć (obie strony predykatu) | **391** · **392** · **393** · **394** · SB2 · SB4 · SB5 | 1 dzień | `fleet_upkeep_imperial`, `w2_deploy_ui`, `w2_reserve_upkeep`, `w2_ai_mobilization`, `director_*` (6); z audytowego S2: `w3_dominance_persist`, `g2_peace_followups`, `combat_system_scope` | tak — w fixture 6 kadłubów `emp_001` ma ruszyć z rezerwy |
| **S1** | tabela strojenia + komenda konsoli + odczyt (SB9) · limit floty (SB3) · pula: kadłuby przy mobilizacji, odrastanie 1 kadłub/rok, bez załogi (SB1, SB2) | SB1 · SB2 · SB3 · SB9 | 2–3 dni | Director 6–10; `deploy_seams`, `w2_deploy_model` | tak |
| **S2** | strażnik na orbicie stolicy i drugiego ciała; strażnik drugiego ciała leci ze stolicy (SB5, SB6) | SB5 · SB6 | 1–2 dni | `war_doctrine` (+ reszta keeperów dominacji, jeśli S0 ich nie zamknie) | tak |
| **S3** | eskadra z transportowcem · desant po wygranej orbicie · odbijanie · fale (SB7, SB8, reguły SB11) | **396** · 384 · 344 · 55 · SB7 · SB8 · SB11 | 2–3 dni | `w3_ai_invasion`, `g2b_invasion`, `ai_capture_*` (4), `battle_announce_once`, `g2_war_gate` | tak |
| **S4** | wojna z inicjatywy AI · kampania układ po układzie (SB10, reguły SB11) | SB10 · SB11 | 2 dni | `director_pressure` (napięcie), `wp_truce_gate`, `wp_nap_expiry`, `wp_peace_seams` | tak |

Razem **~8–11 dni** (wariant puli, P1-A) `[doc: audyt fazy A, P6]`.

⚠ **Keepery S0 — pomiar sesji S0 (2026-10-06, klon poza repo), nie lista z audytu:** podpisane S0-2 i dosłowne
„wyłącznie” S0-3 przewracają cztery ISTNIEJĄCE piny, które mierzą stare zachowanie: `deploy_seams` T4 (kadłub z kolonii
AI płaci załogę), `w2_ai_mobilization` T4 (guard załogowy stoi w regule), `w3_dominance_persist` T3 i `w3_ai_invasion` T2
(sam kontroler bitwy odbiera dominację, bez kadłuba do walki). Z listy audytu `fleet_upkeep_imperial`, `w2_deploy_ui`
i `w2_reserve_upkeep` zostają zielone `[measured]`. Przecelowanie — decyzja właściciela (notatka przekazania S0).

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

---

## 5. S0 — zakres podpisany (2026-10-06)

| | zakres | finding |
|---|---|---|
| **S0-1** | `deployVessel` i każda bliźniacza bramka **nigdy** nie odmawia statkowi z powodu zaległości floty INNEGO właściciela. Imperium AI utrzymania nie płaci i nigdy nie zalega. Wszystkie miejsca, w których zaległość gracza zatrzymuje statek nie-gracza — także kuriera. | **391** |
| **S0-2** | Guard wolnych POP przy mobilizacji rezerwy jest dla AI martwy (wolne POP są tam zawsze 0). Załoga AI nie pobiera POP (SB2): **guard i każdy pobór załogi są pomijane dla kadłubów AI.** Zachowanie gracza bez zmian. | **392** |
| **S0-3** | Dominację orbitalną nad ciałem odbierają **wyłącznie** wrogie kadłuby, z którymi da się tam walczyć: w locie albo na orbicie w tym układzie. Kadłuby zadokowane albo w rezerwie jej nie odbierają. Komunikat każący graczowi najpierw wygrać bitwę pojawia się **tylko**, gdy taki kadłub istnieje. Ta sama reguła po stronie AI predykatu — z raportem, co zmienia dla zadokowanych okrętów gracza. | **393** · **394** |

**Poza zakresem S0 (tylko raport):** pula, limit, stanowisko strażnika, jakakolwiek zmiana reguł produkcji, sam DSCS,
los zadokowanych kadłubów przy przejęciu kolonii.

---

## 6. Rejestr findingów arca (#391–#396, zebrane 2026-10-06)

⚠ **Zasada wpisu:** każde `plik:linia` sprawdzone grepem na `8b72c47`. **Registry-first:** przed nadaniem grep rejestrów
(`docs/`), `CLAUDE.md`, pamięci i historii commitów dał **#390** jako najwyższy numer findingu (nagłówki `### … 390`
w `AI_GARRISON_PLAN.md` §6); trafienia ≥ 391 sprawdzone po kolei — to wartości tabel BALANS (dochód 397 Kr, ilości Fe
394/396/398) i numery linii, nie findingi; #391+ nieużyte (2026-10-06). Źródło: kandydaci **K1–K6** z audytu fazy A
(`AI_STRIKES_BACK_AUDIT.md`, „Kandydaci na findingi”), nadane w kolejności K: K1 = 391 … K6 = 396. Znaczniki:
🔴 żywy i dotkliwy · 🟠 realny, ograniczony · ⚪ obserwacja/higiena · ✅ zamknięty.

### 🔴 391 — `deployVessel` odmawia rozmieszczenia kadłuba AI (także kuriera), gdy zalega flota GRACZA (K1)

`VesselManager.deployVessel` bramkuje `fleetInArrears()` (`VesselManager.js:989`) dla KAŻDEGO kadłuba, a predykat
(`:2198-2205`) liczy wyłącznie statki gracza w służbie (`isEnemyVessel` i `isInService` wykluczone) `[code]`. Przez tę bramkę
przechodzą mobilizacja okrętów AI (`DirectorMobilization.js:124`) i budzenie kurierów AI (`EmpireLogisticsSystem.js:444`,
odmowa `courier_deploy_refused` `:450`) `[code]`; AI utrzymania nie płaci (`_tickVesselMaintenance`, guard `isEnemyVessel`
`VesselManager.js:2089`, W2 decyzja 14) `[code]`. Pomiar fazy A: G6 — bez długu gracza `{ ok: true, crew: 0.4 }`, jeden
statek gracza z `unpaidYears 1` → `{ ok: false, reason: 'fleet_in_arrears' }`; uprząż `press` — **4 392–4 498** odmów
`courier_deploy_refused:fleet_in_arrears` na imperium w 100 gy, siła AI 0; fixture GATE-S4 — `unpaidYears` gracza 3/13/42,
`mobilize_reserve` odpaliła (gy 57,4), 6 kadłubów `emp_001` w rezerwie `[doc: audyt fazy A]`. Bliźniacza bramka
unieruchomienia (`isImmobilized`, `:2277`) już wyklucza AI (`!isEnemyVessel`) `[code]`. → **S0-1**.

### 🟠 392 — guard `empireHasFreeCrew` czyta `freePops` stolicy — dla AI martwy (K2)

`DirectorProduction.hasFreeCrew` (`DirectorProduction.js:154-158`) porównuje `freePops` stolicy (`:157`) z kosztem załogi;
guard `empireHasFreeCrew` jest zarejestrowany z progiem 1 POP (`:475-476`), a jego jedynym konsumentem w katalogu jest
`mobilize_reserve` (`DirectorRuleData.js:216`) `[code]`. `freePops` u AI klamruje się do 0 (etatów więcej niż POP — rodzina
**215**), choć `commitCrew` umie eksmitować (W2 decyzja 18) `[code]`. Pomiar fazy A: uprząż — `freePops` stolicy **0 od gy 20
do gy 100 w 6 z 6 przebiegów** (jedyny wyjątek: 987654321 · `emp_002` przy gy 100 = 10,4); `mobilize_reserve` 0–1
mobilizacji na 100 gy przy 5–8 kadłubach w rezerwie `[doc: audyt fazy A]`. → **S0-2** (SB2: załoga AI bez POP).

### 🟠 393 — `_hasHostileFleetInSystem` liczy kadłuby AI w REZERWIE (luka zbioru wykluczeń W2) (K3)

`WarSystem._hasHostileFleetInSystem` (`WarSystem.js:938-958`) — pętla kadłubów (`:944-951`) sprawdza wrak, właściciela,
układ (`:947`) i uzbrojenie (`:949`), **bez filtra służby i bez filtra doku** `[code]`. Pomiar G3: kadłub w rezerwie
zadokowany przy stolicy ⇒ dominacja gracza `false` przez 3 lata gry, 0 bitew `[doc: audyt fazy A]`. Zbiór wykluczeń
rezerwy W2 (doktryny, `_buildPlayerBattleUnit`, `_wreckPlayerVesselsInSystem`, pule, `ProximitySystem`, …) tego predykatu
nie objął. → **S0-3**.

### 🟠 394 — zadokowany kadłub AI odbiera dominację, a nie da się z nim walczyć; UI każe „wygrać bitwę” (K4)

`ProximitySystem._checkPair` nie emituje `vessel:combatRangeEnter`, gdy któryś statek jest `docked`
(`ProximitySystem.js:284`); DSCS walczy wyłącznie ze stanami `in_transit` i `orbiting` (`_inCombatState`,
`DeepSpaceCombatSystem.js:1535`); bramka zrzutu pokazuje `drop.noDominance` — „No orbital dominance — win the battle
first” (`ColonyOverlay.js:334`) `[code]`. Pomiar G1 i G5: 0 bitew, rozkaz `engage` zawisa 0,86–0,88 AU od celu, dominacja
`false` do końca; w fixture dotyczy całego `sys_059` (stolica `emp_001` + 2 placówki) `[doc: audyt fazy A]`. → **S0-3**.

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

---

## 7. Korekty cudzych rejestrów (wpisane w rejestrach macierzystych)

- **50 — ✅ ZAMKNIĘTY 2026-10-06** w `W3_PLAN.md` §50 (decyzja **SB12**): D7 wdrożone w całości w AI GARRISON G2b —
  `launchInvasion` tworzy każdą jednostkę desantu przez `createAIUnit` (`InvasionSystem.js:165`, `980043f`), jawna lista tą
  samą drogą (`f027e7c`, Finding **323**), `INVASION_UNIT_POOLS` usunięte (`23a87e5`, Finding **340**) `[code]` `[git]`;
  bramka live właściciela PASS (`AI_GARRISON_PLAN.md` §5ze) `[doc]`.
