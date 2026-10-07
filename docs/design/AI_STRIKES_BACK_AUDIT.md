> **Audyt fazy A arca AI STRIKES BACK — kopia raportu sesji z 2026-10-06, treść bez zmian.**
> **Data:** 2026-10-06. **Zmierzony na:** `8b72c47` (kod gry = `23a87e5`; pomiary Części C).
> **Sondy i wyniki** (poza repo): `C:\Users\Komputer\kosmos-handover\ai-strikes-back\probes\`
> i `…\ai-strikes-back\results\`; sumy kontrolne: `…\ai-strikes-back\SHA256SUMS.txt`
> (45/45 OK przy kopiowaniu). Źródło kopii: `…\ai-strikes-back\REPORT_AI_STRIKES_BACK.md`,
> sha256 `2d0cc61294df17cc35d124339d75bee5961fb6fb705c2cdf0ba58166909192bd`.

---

# KOSMOS — G2b zamknięty, arc AI GARRISON zamknięty · faza A audytu „AI STRIKES BACK” (2026-10-06)

Tagi: `[code]` przeczytane w źródle na `8b72c47` (kod gry = `23a87e5`) · `[git]` historia · `[measured]` pomiar w tej
sesji (każda sonda ma kontrolę, opisaną przy wyniku) · `[doc]` z dokumentu albo notatki, bez ponownego pomiaru.
Sondy i wyniki: `C:\Users\Komputer\kosmos-handover\ai-strikes-back\probes\` i `…\results\` (poza repo).

---

## CZĘŚĆ A — commity G2b

Kontrola stanu przed commitem, wyłącznie odczyt `[measured]`: `g2b/SHA256SUMS.txt` 88/88 OK · HEAD `f588b1c` ·
`git diff-index --cached --quiet 6599cd3` → OK · drzewo robocze = indeks poza `.claude/settings.local.json` · 8 ścieżek
zestagowanych · 39 nieśledzonych · jeden worktree.

Q-T2: w `g2b/partD/msg_S2.txt` znacznik `<<T2_ANSWER>>` zastąpiony tekstem „zgoda właściciela 2026-10-06, odpowiedź na
Q-T2: przecelowanie pinu na `gum.createAIUnit(` ZATWIERDZONE” (skrypt bajtowy `partA/fill_t2_answer.py`, jedno trafienie,
EOL bez zmian). sha256 tego pliku 3e7748a3… → **bdbef0ef…** — ⚠ ten jeden plik nie zgadza się już z `g2b/SHA256SUMS.txt`
(zmiana zamierzona).

`bash g2b/tools/commit_G2b.sh t2` — log `partA/commit_G2b_t2_run.txt` `[measured]`:

| commit | drzewo (oczekiwane = zmierzone) | numstat |
|---|---|---|
| `980043f` S1 | `519a99e` ✓ | GarrisonData 7/0 · InvasionSystem 25/17 · g2_ocean_capital 5/0 · g2b_invasion 187/0 · GarrisonPlanner 15/1 |
| `f027e7c` S2 + T2 | `80b9d0f` ✓ | GarrisonData 6/0 · InvasionSystem 6/10 · g2b_invasion 29/0 · startup_units_zero 4/2 · GarrisonPlanner 18/1 |
| `23a87e5` S3 (z T2) | `cb383e4` ✓ | GroundUnitData 9/10 · unitArchetypes 1/1 · g2b_invasion 18/0 · startup_units_zero 14/12 |

Żaden commit nie przewraca całego pliku. `InvasionSystem.js` w drzewie roboczym CRLF jak przed commitami, w indeksie LF;
status czysty. Zgoda Q-T2 jest w treści `f027e7c` (wiersz 22 komunikatu) `[git]`.

Na `23a87e5`: sweep **263/263 OK, 0 FAIL, 31 advisory** · `check-i18n` PASS, pl = en = **3455** · `g2b_invasion_smoke`
22/22 · `startup_units_zero_smoke` 19/19 · `g2_ocean_capital_smoke` 28/28 · `g2_seams_smoke` 31/31 · `w3_seams_smoke`
38/38 `[measured]` (`partA/sweep_after_G2b.txt`, `partA/i18n_after_G2b.txt`).

---

## CZĘŚĆ B — dokumentacja

**Commit `8b72c47`** (drzewo `7ce789f`) — `docs(G2b): desant AI na archetypach, arc AI GARRISON zamkniety`. Numstat:
`CLAUDE.md` 29/3 · `docs/design/AI_GARRISON_PLAN.md` 198/15 · `docs/design/OPEN_FINDINGS_INDEX.md` 24/5. Sweep przed
commitem 263/263, `check-i18n` 3455 `[measured]`. Skrypt `partB/docs_G2b_patch.py` (każda kotwica dokładnie jedno trafienie,
liczba CR bez zmian — zabłąkany CR w `OPEN_FINDINGS_INDEX.md:87` jest tylko w drzewie roboczym, blob LF; nietknięty).
Pełny diff: `partB/docs_G2b_commit.diff` (481 linii).

**Numery (registry-first).** Grep `docs/`, `CLAUDE.md`, pamięci i historii commitów: najwyższy numer findingu **383**;
trafienia ≥ 384 sprawdzone po kolei — to numery linii, ceny i liczebności (`**400**`, `**397**`, `| **870** |` = linia
`:870` w audycie Dziennika itd.). Nadane **384–390**, w kolejności listy notatki G2b §10:

| nr | treść | re-weryfikacja grepem na `23a87e5` |
|---|---|---|
| 🟠 **384** | desant z ładowni zrzutowców AI duplikuje ładunek (uśpiony) | `InvasionSystem.js:300-307` zbiera typy, `:307` → `launchInvasion`; w pliku 0 × `removeUnit`/rozładunek; ta sama pętla na `f588b1c :295-299` |
| ⚪ **385** | bramki mobilności AI czytają tabelę legacy — każdy archetyp „mobilny” | `GroundUnitManager.js:1160`, `:1180`; fallback `speedHex: 1.5` `GroundUnitData.js:86-91` |
| ⚪ **386** | `SpawnTestEnemy` omija `createAIUnit` (morale archetypu 15 zamiast szczebla) | `SpawnTestEnemy.js:148-151`; `unitArchetypes.js:56` |
| ⚪ **387** | legacy AI ze starych zapisów praktycznie nie do zabicia | pomiar G2b: 18 komórek, strata 0,0; `CombatSystem.js:276`, `:355`; `infantry hp 60` |
| ⚪ **388** | T6c `g2_ocean_capital_smoke` zależny od strumienia `Math.random` | `InvasionSystem.js:566`; `g2_ocean_capital_smoke.mjs:333-336` |
| ⚪ **389** | ułamkowy `troopCount`: ⌈n⌉ → ⌊n⌋ | `f588b1c InvasionSystem.js:147`; `GarrisonPlanner.js:88`, `:123` |
| ⚪ **390** | nieaktualne teksty o `INVASION_UNIT_POOLS` w dwóch keeperach | `w3_seams_smoke.mjs:355` + **nowe przy grepie** `ground_morale_resolution_smoke.mjs:11` |

**Zamknięte:** **323** ✅ (ostatnia ścieżka AI — `launchInvasion` — przez `createAIUnit`; pułapka formy 5-argumentowej
zostaje w API, pin `g2_seams_smoke` P1d, żaden wołający AI jej nie używa) · **340** ✅ (pula usunięta). **383** — kierunek
właściciela wpisany (reguła 379, etap polerki UI). **50** — wiersz indeksu: „D7 wdrożone w G2b”; ⚠ rejestr macierzysty
`W3_PLAN.md` §50 **nietknięty** (poza poleceniem — do decyzji, czy dopisać).

**Zmieniony tekst — najważniejsze fragmenty** (całość w diffie):

`AI_GARRISON_PLAN.md`, nagłówek statusu:
> ✅ **G2b (desant AI na modelu archetypów, D7 + D9) ZAMKNIĘTY 2026-10-06 — bramka live właściciela PASS** (§5zd–§5zf).
> ✅ **ARC AI GARRISON ZAMKNIĘTY 2026-10-06** — G1, G1b, G2, G3, G1c, G2b.

`§3`, wiersz G2b: „pule desantu (`INVASION_UNIT_POOLS`) na archetypy przez `createAIUnit` (D7): skład i morale ze szczebla
D9 w chwili desantu · jawna lista tą samą drogą · pula usunięta | **50** (zastąpiony — D7 wdrożone) · **323** ✅ · **340** ✅
· **311** (zostaje dla jednostek legacy gracza) | ✅ **2026-10-06** (`980043f` + `f027e7c` + `23a87e5`, §5zd; bramka live
PASS, §5ze; odpowiedzi, §5zf)”; wiersz „później” → „następny arc (zakres właściciela 2026-10-06; faza A — audyt, poza
repo)”; nowy przydział „⚠ Przydział findingów z sesji G2b (#384–#390, §6)”.

Nowe sekcje: **§5zd G2b — dostarczone** (tabela trzech commitów z keeperami i fail-first 8/6 → 14/14, 16/2 → 18/18,
21/1 → 22/22; weryfikacja przy commitowaniu; tabela pomiaru desantu G2b — odsetek przejęć: bez obrońców 100 %; +0/4 obrońców
/desant 2: 28–46 % (legacy 100 %); +90/4/2: 0 % (legacy 98 %); +90/4/4: 0–32 % (legacy 96 %); +90/4/6: 18–100 %; notatka
o Findingu 50) · **§5ze Bramka live G2b — PASS** (tabela kroków jak niżej) · **§5zf Odpowiedzi właściciela** (Q-T2
zatwierdzone; Q-G2b-1 oba szczeble z artylerią; Q-G2b-2 typ ze składu szczebla; Q-G2b-3 przyjęte; Q-G2b-4 bez osobnego
kroku — wielkość desantu w następnym arcu; Q-G2b-5 zgoda była w poleceniu sesji; 383 — reguła 379, polerka UI).

§5ze (wpisane):

| | co sprawdzono | wynik |
|---|---|---|
| krok 2 — pokój | `emp_001` w pokoju: `launchInvasion` → `{ success: false, reason: 'not_at_war' }` | PASS |
| krok 3 — szczebel | szczebel 3, suma poziomów fabryk 20, morale 100 | odczyt |
| krok 4 — obrońcy | `gu_6`, `gu_7` (`garrison_unit`, morale 10) rozstawione na (10,8) `entity_2` | setup |
| kroki 5–7 | po `declareWar`: `gu_21`, `gu_22` `shock_infantry`, `gu_23` `rocket_artillery`; właściciel i frakcja `emp_001`, morale 100; lądowanie (0,0), (2,15), (8,0) | PASS |
| kroki 8–9 | marsz na (10,8); garnizony 30/10 → 23/7 i 24/7 → zniszczone; najeźdźcy HP 9, 11, 6, morale 94–97; przy ostatnim odczycie kolonia gracza, kafel stolicy zajęty | PASS |

Granice dowodu (wpisane): konsola niezgłoszona — kryterium „konsola bez błędów” niepotwierdzone; przejęcia kolonii bramka
nie doczekała (skan co 1 civY, `InvasionSystem._tickCaptureChecks :478`), czas przejęcia tylko headless; dzwonek, Dziennik
i auto-slow przy desancie — niezgłoszone.

§6 — wpisy **384–390** (pełne, z `plik:linia`), nagłówki **323** i **340** → ✅ z akapitem zamknięcia, **383** → „→ etap
polerki UI (reguła 379, kierunek 2026-10-06)” + akapit odpowiedzi.

`OPEN_FINDINGS_INDEX.md`: blok „Aktualizacja 2026-10-06 (wieczór) — AI GARRISON: G2b ZAMKNIĘTY; ARC AI GARRISON ZAMKNIĘTY”,
mapa numeracji `309-390`, wiersze 323 i 340 zdjęte z A8, 50 i 383 zaktualizowane, nowe wiersze 384/385/386/387/389 (A8)
i 388/390 (A9).

`CLAUDE.md`, sekcja AI GARRISON: nagłówek „· G2b ZAMKNIĘTY 2026-10-06 — ARC ZAMKNIĘTY”, rejestr „#309–#390”, akapit
zamykający:
> ✅ **G2b — desant AI na modelu jednostek gracza (D7, D9)** (`980043f` S1 · `f027e7c` S2 · `23a87e5` S3; bramka live
> właściciela 2026-10-06 **PASS**; plan §5zd–§5zf). **S1** — `InvasionSystem.launchInvasion` tworzy każdą jednostkę desantu
> przez `createAIUnit`: skład i morale ze szczebla drabiny D9 imperium w chwili desantu (`garrisonTier`
> + `GarrisonPlanner.invasionComposition`: `shock_infantry`, na szczeblach od 14 i od 20 poziomów fabryk co trzecia jednostka
> fali `rocket_artillery`; morale 30 / 50 / 100 / 100), `owner` i `factionId` = imperium, `popCost` 0, bez domu,
> `deployed: false`. **S2 (323)** — jawna lista (`embarkedTroops`) tą samą drogą (`invasionTroops`) … **S3 (340)** —
> `INVASION_UNIT_POOLS` usunięte … ⚠ Jednostkę naziemną AI tworzy się WYŁĄCZNIE przez `createAIUnit` — także desant …
> ⚠ Pin `startup_units_zero_smoke` T2 przecelowany za zgodą właściciela (Q-T2) … Pomiar … Odpowiedzi właściciela …
> Keeper NEW `g2b_invasion_smoke` **22/22** · … sweep **263/263**, `check-i18n` 3455. Nowe findingi **384–390** …
> **G2b ZAMKNIĘTE. ARC AI GARRISON ZAMKNIĘTY** (G1, G1b, G2, G3, G1c, G2b). Poza arciem: limit floty, odbicie kolonii,
> przyczółek — następny arc (zakres właściciela 2026-10-06).

Po Części B w drzewie repo nie zapisano już niczego (sprawdzone: `git status` — wyłącznie `.claude/settings.local.json`
i 39 nieśledzonych).

---

## CZĘŚĆ C — faza A audytu „AI STRIKES BACK” (bez kodu, bez commitów)

### C1. Flota dziś

**Mechanika** `[code]`:

* **Jedyny producent zamówień okrętów wojennych AI** to `DirectorPressure.pressureResponse` (`DirectorPressure.js:93-131`),
  wołany przez dwie reguły (`DirectorRuleData.js:103-140`):
  `military_pressure_l1` — sonda `armedPlayerVesselsInBorderZone ≥ 1` (uzbrojony statek GRACZA w powłoce granicznej
  imperium, nie w przestrzeni roszczonej — `DirectorPressure.js:65-85`), rzut 40 % + 30 pkt/rok, cooldown 5 lat, odpowiedź
  **2 × `frigate_system_defender`**; `military_pressure_l2` — ≥ 3 statki albo eskalacja w oknie 10 lat, odpowiedź
  **2 × defender + 1 „roamer”**. Poza tym tylko dźwignia debug (`GameScene.js:620`). Kurierów `hull_small` zamawia
  `EmpireLogisticsSystem.js:353`.
* ⚠ **Oba szczeble mają guard `empireNotAtWarWithPlayer`** (`DirectorRuleData.js:106`, `:134`) ⇒ **w wojnie AI nie zamawia
  żadnego okrętu**.
* Roamer (`_pickRoamer`, `DirectorPressure.js:166-173`): agresja ≥ 0,6 → `frigate_missile_escort`, ≤ 0,4 →
  `frigate_laser_escort`. Oba imperia z generatora mają w fixture agresję 0,3 ⇒ **zawsze laser escort** `[measured]`.
* **Drabina odmów `queueWarships`** (`DirectorProduction.js:356-441`, kolejność = kolejność diagnozy): `bad_params` →
  `no_capital` → `no_shipyard` → `reparations` → `no_orbital_station` → `no_empire_tech` → powody resolvera (`no_module`:
  bez `point_defense` nie ma żadnej broni, bez `ion_drives` — `engine_warp`, bez `warp_drive` — `warp_tank`) →
  `build_refused` (stocznia pełna). Zlecenie czekające na surowce gaśnie po **3 latach wyświetlanych**
  (`ORDER_TTL_DISPLAYED_YEARS`, `:45`; sweep `:268-291`, `director:orderExpired`).
* **Szew stoczni:** `VesselManager._onShipCompleted` (`:1781-1792`) — kadłub schodzi do **rezerwy** (`stored`), zadokowany
  (`Vessel.js:159-160`) przy stolicy; właściciel z kolonii-budowniczego (`DirectorProduction._claimVessel :215-247`).
* **Wyjście z rezerwy:** `mobilize_reserve` (`DirectorRuleData.js:212-223`) — sonda `storedWarshipsAtCapital ≥ 1`, guardy
  `empireHasFreeCrew` (`freePops` stolicy ≥ 1, `DirectorProduction.js:154-158`, `:475-476`), `empireOutgunnedByPlayer`
  (`getStrength(player) > getStrength(emp)`, zatrzymuje się na parytecie), `empireNotUnderReparations`; akcja przez
  `VesselManager.deployVessel` (`:973-1010`), który odmawia `fleet_in_arrears`, gdy zalega flota **GRACZA** (`:989`;
  `fleetInArrears :2198-2205` liczy wyłącznie statki gracza w służbie).
* **Doktryny** (`DirectorDoctrine.js`): wyłącznie kadłuby w służbie, zadokowane przy stolicy, bez misji i rozkazu (`:251-279`).
* **Szablony** (`ShipTemplateData.js`): `frigate_system_defender` (bez baku warp z projektu, `:121-148`), `frigate_laser_escort`
  / `frigate_missile_escort` (bak warp, `:88-119`), `science_probe` (sonda pierwszego kontaktu — tworzona wprost,
  `DirectorFirstContact.js:133`), `transport_assault` (`:218-241`) — **nikt go nie zamawia** (Finding 201).
* **Co NIE ogranicza:** utrzymanie (AI nie płaci — `VesselManager.js:2089`), paliwo (AI zwolnione z `canReach`/`canJump` —
  `:626`, `:884`), czas budowy (fregata 5 civY = 5 wyświetlanych miesięcy, `HullsData.js:182`; postęp ×`speedBonus`,
  `ColonyManager.js:1222-1227`), żeton stacji (zasiewany w bootstrapie, `EmpireColonyBootstrap.js:260-275`).

**Pomiar — fixture `GATE-S4-fresh-gy60` (gy 60,12, żywa gra)** — sonda `probe_c1_fixture.mjs`, statyczny odczyt zapisu,
siła liczona TĄ SAMĄ funkcją co `ThreatAssessment` (`aggregateCombatValue`, filtr służby). Kontrola: 29 statków = wynik
`probe-fixture-inspect`; wartość defendera 432 = obliczenie z `ThreatMath` (calc C3) ✓ `[measured]`:

| | emp_001 | emp_002 | gracz |
|---|---|---|---|
| POP (pełne kolonie) · kolonie/placówki | 185 · 5/5 | 178 · 6/5 | 67 · 1/0 |
| Σ poziomów fabryk · stocznie (Σ lv) · stacje | 20 · 2 (tylko stolica lv 2) · 1 | 20 · 2 (stolica lv 2) · 1 | 5 · 1 · 0 |
| uzbrojone kadłuby | **6** — 5 × defender + 1 z adnotacją `frigate_laser_escort`, ale modułami defendera (→ K5) | **0** | 3 (`hull_frigate` + `weapon_laser`) |
| w służbie / rezerwa / z bakiem warp | **0 / 6 / 0** | 0 / 0 / 0 | 3 / 0 / 0 |
| siła / potencjał | 450 / 3042 (450 = 10 kurierów × 45) | 450 / 450 | 618 / 618 |
| `unpaidYears` statków | 0 | 0 | **3, 13, 42** (flota w zaległości) |

Reguły Directora emp_001: L1 12 prób (ostatnio gy 55,10), L2 12 (gy 56,35), **`mobilize_reserve` 9 prób, ostatnio gy 57,43
— odpaliła, a wszystkie 6 kadłubów stoi w rezerwie**; postawa L2 od gy 56,35, `vessels: 3`. Zero wojen, zero wpisów
dominacji, zero jednostek naziemnych. Wszystkie pełne kolonie obu imperiów leżą w układzie stolicy; poza nim AI ma wyłącznie
placówki (Xe/Nt). Dom gracza (`sys_home`, 9,19 LY od `sys_059`) leży w powłoce emp_001 — nacisk wywołują 3 fregaty gracza
**zadokowane w domu**. ⚠ Korekta 2026-10-08 (Finding **407**, `AI_STRIKES_BACK_PLAN.md` §6): w zapisie te fregaty mają
`systemId` `sys_060` — chimera doku; zapis „dom gracza `sys_060`” był błędny, wniosek „dom w powłoce emp_001” zostaje.

**Pomiar — uprząż** `probe_c1_harness.mjs`: `bootWithDirector` (kalibracja D-178-3, pełny stos Directora, stub żetonu stacji),
2 ziarna (`HEADLESS_GALAXY_SEED`, `987654321`), 100 gy, warianty: **passive** (gracz nic nie robi), **press** (po jednej
uzbrojonej fregacie gracza w powłoce każdego imperium od gy 0, gracz płaci z własnej kasy), **pressPaid** (jak press, kasa
gracza dosypywana — flota nie zalega). Kontrole: (a) w passive zero `director:pressureIncident` ✓; (b) siła z
`K.threatAssessment`; (c) sonda reguły widzi statki nacisku (`pressureSeen ≥ 1`) ✓ `[measured]`.

Uzbrojone kadłuby AI (razem / w tym aktywne / z bakiem warp):

| wariant · ziarno · imperium | gy 20 | gy 40 | gy 60 | gy 80 | gy 100 |
|---|---|---|---|---|---|
| passive · oba ziarna · oba imperia | 0 | 0 | 0 | 0 | 0 |
| press · oba ziarna · oba imperia | 0 | 0 | 0 | 0 | 0 |
| pressPaid · default · emp_001 ¹ | 0 | 0 | 0 | 0 | 0 |
| pressPaid · default · emp_002 | 0 | 1 / 0 / 0 | 5 / 0 / 0 | 8 / 0 / 1 | 8 / 0 / 1 |
| pressPaid · 987654321 · emp_001 | 0 | 0 | 2 / 0 / 0 | 4 / 0 / 0 | 6 / 0 / 0 |
| pressPaid · 987654321 · emp_002 | 0 | 1 / 0 / 0 | 3 / 0 / 0 | 7 / 0 / 0 | 7 / **2** / 0 |

¹ statek nacisku przestał być w jego powłoce po gy ≈ 7 (2 incydenty łącznie).

Zdarzenia na 100 gy (imperium pod naciskiem): `pressureIncident` 19–20 (L1 1 + L2 18–19) · `shipQueued` 34–36 ·
`orderExpired` **press 49–55, pressPaid 43–47** · `shipCompleted` (z 4 kurierami) press 4, pressPaid 10–12 · `mobilized`
press 0, pressPaid 0–1 · `mobilizeRejected` **`courier_deploy_refused:fleet_in_arrears` press 4 392–4 498 na imperium**
(kurierzy też stoją — siła AI 0), pressPaid 0. `freePops` stolicy AI: 5 przy gy 0, **0 od gy 20 do gy 100 we wszystkich
6 przebiegach** (jedyny wyjątek: 987654321 · emp_002 przy gy 100 = 10,4). Siła AI w służbie: passive 180 (4 kurierów),
press 0, pressPaid 180 (poza jednym 1044 przy gy 100). Gracz: siła 412 (2 fregaty nacisku), w `press` zaległość od gy ≤ 20.
Pliki: `results/c1_harness_*.{txt,json}`.

**Co dziś ogranicza flotę AI** (z kodu i pomiaru):

| ogranicznik | stan |
|---|---|
| wyzwalacz | tylko uzbrojony statek gracza w powłoce granicznej i tylko w pokoju; bez nacisku **0 okrętów w 100 gy** `[measured]` |
| technologia (R-4) | pierwsze 2–3 incydenty → `no_module` `[measured]` |
| łańcuch komodytów | ~80 % zamówień gaśnie z TTL (43–55 wygaśnięć wobec 6–8 okrętów na 100 gy) `[measured]` |
| rezerwa i załoga | każdy okręt schodzi do rezerwy; mobilizacja martwa przez `freePops = 0` (uprząż) albo przez zaległość floty GRACZA (fixture, `press`) `[measured]` |
| stocznia · stacja | stałe: Σ lv 2 od gy 20 (tylko stolica), 1 stacja `[measured]` |
| utrzymanie · paliwo · czas budowy | nie ograniczają `[code]` |

### C2. Pula okrętów — co by było potrzebne

**Istniejące ścieżki tworzenia statku nie-gracza** `[code]`:

| ścieżka | plik:linia | właściciel | `colonyId` (dom) | stan | służba / załoga | bak warp |
|---|---|---|---|---|---|---|
| stocznia kolonijna (jedyna produkcyjna) | `VesselManager.js:1786` | `_claimVessel` z właściciela kolonii | stolica AI | `docked` | `stored`; załoga dopiero przy `deployVessel` (`crewColonyId`) | pusty (`warpFuelCurrent 0`, `Vessel.js:127`) |
| sonda pierwszego kontaktu | `DirectorFirstContact.js:133` | ręcznie, 3 pola | ⚠ **dom gracza** | `orbiting`, wolna | `active`, bez załogi | — |
| `spawnEnemyCiv` (debug) | `SpawnTestEnemy.js:354` | ręcznie | kolonia wroga | `orbiting` przy niej | `active` | pusty |
| `spawnEnemyAttack` (debug) | `:503` | ręcznie | ⚠ dom gracza | trasa | `active` | pusty |
| `spawnEnemyRaider` (debug) | `:653` | ręcznie | ⚠ dom gracza | `orbiting`, wolna | `active` | pełny (ręcznie) |
| `spawnEnemyWarpGhost` (debug) | `:754` | ręcznie | ⚠ dom gracza | tranzyt (`systemId null`) | `active` | — |
| CombatSandbox | `CombatSandbox.js:321`, `:530` | scenariusz | — | — | — | — |

**Wzór „jak `createAIUnit`”** — co trzeba by mieć (z kodu): jedno wejście, które (1) rozwiązuje szablon drzewem techu imperium
(`resolveTemplate`, tak robi `queueWarships :393-401`); (2) stempluje trzy pola czytane przez `isEnemyVessel`
(`ownerEmpireId`, `owner`, `isEnemy` — `Vessel.js:438-444`); (3) ustawia `colonyId`/`homeColonyId` na kolonię AI
(nie na dom gracza, jak 4 z 6 ścieżek debug — rodzina Findingu 195 i notatki S3.4d); (4) wybiera `serviceState` (służba czy
rezerwa) i rozstrzyga załogę (W2: płacona przy `deployVessel`; statek „z puli” bez załogi to klasa W2 Findings 10 —
zmaterializowana flota omijała model załogi); (5) bak warp (AI lata na klamrze — `:626`, `:884`, więc pusty bak nie blokuje,
pełny potrzebny tylko dla realizmu); (6) rejestruje w `_vessels` i emituje `vessel:created` (`ThreatAssessment` unieważnia
indeks; `_claimVessel` nic nie nadpisze, bo właściciel już jest). **Zapis:** wszystkie te pola są na białych listach
`serialize`/`restore` (`VesselManager.js:1475-1478`, `:1540-1547`, `:1613-1617`, `:1677-1682`) ⇒ **v101 bez migracji**.
Budżet i odrastanie puli wymagałyby stanu w `empires.<id>` (wzór flagi garnizonu D15 — przeżywa zapis bez migracji).

**Co musiałaby zmienić prawdziwa produkcja, żeby dać użyteczną flotę** — każdy punkt to zmierzony ogranicznik z C1:
1. wyzwalacz niezależny od nacisku i działający **w wojnie** (dziś guard `empireNotAtWarWithPlayer`);
2. guard `empireHasFreeCrew` czyta `freePops` (0 od gy 20 w uprzęży) — mimo że `commitCrew` umie eksmitować (decyzja 18 W2);
3. sprzężenie z zaległością floty gracza w `deployVessel` (4,4 tys. odmów na 100 gy w `press`; fixture);
4. przepustowość łańcucha (TTL: 43–55 wygaśnięć wobec 6–8 okrętów) — w tym 2 `warp_cores` za silnik defendera, którego
   nie użyje (Finding 251);
5. zamawianie eskort i transportowców (dziś 1 eskorta na incydent L2, transportowiec nigdy);
6. pula uderzenia przyjmująca transportowiec (`strikeReadyVessels` wymaga `hasWeapons`, `DirectorOffensive.js:141`).
Sufit zmierzony dziś przy stałym nacisku i opłacanej flocie gracza: **6–8 okrętów na 100 gy na imperium, 0–1 z bakiem warp**.

**Keepery dotknięte** (grep `src/testing/smoke`, `[code]`): `queueWarships` — 4 (`director_ai_production`, `director_pressure`,
`director_production_foundation`, `wp_reparations`) · `pressureResponse` — 2 · `_onShipCompleted` — 1 (`w2_deploy_model`) ·
mobilizacja (`storedWarshipsAtCapital`/`mobilizeVessels`/`mobilize_reserve`) — 4 · uderzenie
(`strikeReadyVessels`/`launchStrike`/`strike_player_target`) — 10 · doktryny — 1 (`war_doctrine`) · `DIRECTOR_RULES` — 9 ·
`SHIP_TEMPLATES`/`resolveTemplate` — 4 · `deployVessel` — 10 · `fleetInArrears` — 3 · `empireHasFreeCrew`/`hasFreeCrew` — 6 ·
`_hasHostileFleetInSystem`/`playerHasOrbitalDominance` — 2. Keepery łuku ekonomii AI pinujące popyt zamówień:
`ai_order_demand`, `director_feed_isolation`, `ai_tier3_scaled_entry`, `fe_supply`, `ai_labor_budget`, `ai_uniform_staffing`,
`ai_pop_gates`.

**Wyniki łuku ekonomii AI, których dotyka każda droga** `[doc]`: gate Findingu 246 (live gy 60→75: „siedem uzbrojonych
okrętów emp_001 z własnej ekonomii”, `shipQueued 11`, `pressureIncident 6`) · 247 (inwentarz konsumentów `warp_cores`:
militarnym konsumentem jest WYŁĄCZNIE `DirectorProduction` pod naciskiem; sufit 50 = „rezerwa gotowości”) · 251 · 208
(GATE B2 (a)) · 217/221 (kanał popytu zamówień). **Pula** omija łańcuch — jego jedyny militarny konsument znika, a sens
gate'u 246 słabnie. **Produkcja** wzmacnia popyt — przesuwa zmierzone krzywe (konkurencja o FP, `CHAIN_ENTRY_PLAN` §10).

**Koszt budowy szablonów** (`calcShipCost`, `results/c2_costs.txt`) `[measured]`:

| szablon | surowce | komodyty |
|---|---|---|
| defender | Fe 140 · Ti 155 · Cu 10 · Hv 30 | stopy 6 · pancerz reaktywny 20 · elektronika 6 · **warp_cores 2** · ogniwa 2 · metamateriały 2 · napęd 4 |
| laser escort | Fe 100 · Ti 130 · Cu 25 · Hv 38 | stopy 10 · pancerz 14 · elektronika 9 · **warp_cores 2** · ogniwa 2 · moduły ciśn. 2 · metamateriały 2 |
| missile escort | Fe 120 · Ti 140 · Cu 10 · Hv 38 | stopy 10 · pancerz 17 · elektronika 6 · **warp_cores 2** · ogniwa 2 · moduły ciśn. 2 · metamateriały 2 · napęd 2 |
| transport_assault | Fe 530 · Ti 270 · Cu 64 · Hv 48 | stopy 67 · kompozyty 6 · pancerz 17 · **warp_cores 4** · elektronika 12 · ogniwa 4 · moduły ciśn. 14 |

### C3. Limit floty

**Wejścia per imperium** (uprząż passive gy 40/80, oba ziarna; fixture gy 60) i **formuły-kandydaci** (`calc_c3_limits.mjs`,
kontrola: defender = 432 ✓) `[measured]`:

| źródło | gy | imperium | POP | Σ fabryk (szczebel D9) | stocznie | stacje | F1 max(2,⌊POP/32⌋) | F2 max(2,⌊POP/16⌋) | F3 1+szczebel | F4 F1×mnożnik D9 | F5 2·stocznie+2·stacje |
|---|---|---|---|---|---|---|---|---|---|---|---|
| uprząż default | 40 | emp_001 | 51 | 3 (0) | 2 | 1 | 2 | 3 | 1 | 2 | 6 |
| uprząż default | 40 | emp_002 | 51 | 7 (1) | 2 | 1 | 2 | 3 | 2 | 2 | 6 |
| uprząż default | 80 | emp_001 | 87 | 14 (2) | 2 | 1 | 2 | 5 | 3 | 2 | 6 |
| uprząż default | 80 | emp_002 | 89 | 20 (3) | 2 | 1 | 2 | 5 | 4 | 2 | 6 |
| uprząż 987654321 | 40 | emp_001 | 45 | 5 (0) | 2 | 1 | 2 | 2 | 1 | 2 | 6 |
| uprząż 987654321 | 40 | emp_002 | 56 | 10 (1) | 2 | 1 | 2 | 3 | 2 | 2 | 6 |
| uprząż 987654321 | 80 | emp_001 | 78 | 14 (2) | 2 | 1 | 2 | 4 | 3 | 2 | 6 |
| uprząż 987654321 | 80 | emp_002 | 109 | 20 (3) | 2 | 1 | 3 | 6 | 4 | 3 | 6 |
| fixture GATE-S4 | 60 | emp_001 | 185 | 20 (3) | 2 | 1 | 5 | 11 | 4 | 6 | 6 |
| fixture GATE-S4 | 60 | emp_002 | 178 | 20 (3) | 2 | 1 | 5 | 11 | 4 | 6 | 6 |

⚠ Stocznie (Σ lv 2 od gy 20) i stacje (1) są **stałe** — jako wejście limitu nie rosną. Rosną POP i fabryki (płaskowyż 20).
⚠ POP uprzęży jest 2–3× niższy niż w fixture (Finding 341; D18 — kalibracja na fixture).

**Siła okrętów w tej samej mierze** (`ThreatMath`; HP i obrażenia z `playerVesselsToBattleUnit`): defender **432**
(HP 120, obr. 24) · missile escort 312 (120, 12) · laser escort 242 (120, 5) · transport 183 (180, 0) · fregata gracza
z fixture (`weapon_laser`) **206** (120).

**Flota gracza — co da się zmierzyć, a czego nie:** jedyny pomiar żywej gry to fixture: przy gy 60 gracz ma **3 fregaty**
(siła 618) i **nie stać go na nie** (`unpaidYears` 3/13/42 — utrzymanie 300 Kr/rok na fregatę, `HullsData.js:181`).
W uprzęży gracz niczego nie buduje (brak bota w `bootWithDirector`), a dwie dołożone fregaty wpychają go w zaległość przed
gy 20 (`press`). **Nie da się zmierzyć** reprezentatywnej floty gracza przy gy 40/80: nie ma zweryfikowanego bota floty,
a fixture to n = 1.

### C4. Strażnik

**Mechanika** `[code]`: `doctrine_defend_home` (sonda ≥ 1 bezczynnego uzbrojonego kadłuba w służbie przy stolicy, porcja 2,
cooldown 3 l.) — HOLD przy stolicy, rozkaz `moveToPoint` tylko gdy kadłub zabłądził (`DirectorDoctrine.js:136-154`);
`doctrine_patrol_border` (≥ 3, porcja 1, cooldown 4 l.) — ruch do jednej z zewnętrznych PLANET układu stolicy
(`:167-181`, `:285-310`), `bypassFuelCheck`. Ciało wybiera wyłącznie `capitalOf` — **pojęcia „drugiego cennego ciała” nie
ma**. Istniejące miary wartości: `colonyDevScore` (POP + aktywne budynki, `ColonyDevScore.js:28-30`), porządek D11 planera
garnizonu (stolica, potem `devScore` malejąco, pełne kolonie przed placówkami, placówki tylko z `Xe`/`Nt`),
`TerritoryService.getSystemDevScore` (poziom układu). W fixture wszystkie pełne kolonie AI leżą w układzie stolicy — „drugie
cenne ciało” poza nim to placówka Xe/Nt w innym układzie, a defender nie ma baku (nie poleci tam).

Gracz widzi przy zrzucie „No orbital dominance — win the battle first” (`drop.noDominance`; bramki `ColonyOverlay.js:268`,
`:333`, `FleetActions.js:560`, `:598`). Dominacja gracza (`WarSystem.playerHasOrbitalDominance :982`) = kontroler
`'player'` po bitwie ALBO brak kontrolera i brak „wrogiej floty” w układzie — a `_hasHostileFleetInSystem` (`:938-958`)
liczy **każdy** uzbrojony kadłub AI w układzie: bez filtra służby i bez filtra doku. ProximitySystem nie emituje
`combatRangeEnter`, gdy któryś statek jest `docked` (`ProximitySystem.js:284`), a DSCS walczy tylko ze statkami
`in_transit`/`orbiting` (`DeepSpaceCombatSystem.js:1535-1540`).

**Pomiar** `probe_c4_guard.mjs` — prawdziwe Proximity + VCS + DSCS + MOS + OrderService + AutoRetreat + EAH; wojna z emp_001;
1 defender przy stolicy `entity_79` (`sys_061`); 2 fregaty gracza (`engine_ion`, `armor_heavy`, `weapon_laser`) 2 AU od niej
z rozkazem lotu do stolicy; 3 lata gry, rundy DSCS w czasie rzeczywistym. Kontrola: G4 bez strażnika (dominacja `true`) ✓,
G6 deploy bez długu gracza ✓ `[measured]`:

| przypadek | strażnik | bitwy | wynik | dominacja gracza (zrzut) |
|---|---|---|---|---|
| G1 | w służbie, **zadokowany** (stan po stoczni + `defend_home`) | **0** | gracz na orbicie stolicy, strażnik żyje | **false** (do końca) |
| G2 | w służbie, **na orbicie** | 1 (DSCS) | gracz wygrał, stracił 1 fregatę, strażnik zniszczony | **true**, kontroler `player` |
| G3 | **w rezerwie**, zadokowany (jak 6 fregat emp_001 w fixture) | **0** | jak G1 | **false** |
| G4 | brak — KONTROLA | 0 | — | true |
| G5 | jak G1 + rozkaz `engage` na strażnika | **0** | fregaty gracza wiszą 0,86–0,88 AU od celu z aktywnym `engage` | **false** |
| G6 | KONTROLA sprzężenia: `deployVessel` kadłuba AI | — | bez długu gracza `{ok:true, crew 0.4}`; jeden statek gracza z `unpaidYears 1` → `{ok:false, reason:'fleet_in_arrears'}` | — |

⇒ Dziś **zadokowany kadłub AI — także nieobsadzony, z rezerwy — blokuje zrzut gracza na KAŻDE ciało w swoim układzie,
a walki z nim nie da się nawiązać**. W fixture dotyczy to całego `sys_059` (stolica emp_001 + 2 placówki).

### C5. Desant AI

**Wszystkie drogi, którymi wojska AI trafiają na ciało** `[code]`:

| droga | wejście | stan w normalnej grze |
|---|---|---|
| `InvasionSystem._onVesselGroupVictory` (`:233-308`) | `battle:resolved`, gdy A = `vessel_group` AI wygrywa, a B ma kształt **`player`** (`:239` — tylko bitwy EAH, nie DSCS), AI ma dominację w układzie (`:248-252`), wśród OCALAŁYCH jest kadłub z `canDropTroops` i ładownią (`:255-271`) | **nieosiągalna**: AI nie ma żadnego takiego kadłuba (`transport_assault` nikt nie zamawia — 201; nawet zbudowany nie wejdzie do puli uderzenia, bo `hasWeapons` — `DirectorOffensive.js:141`) |
| `_onBattleResolved`, gałąź flot abstrakcyjnych (`:310-365`) | `participantA.type === 'empire'` | martwa od W3-8 (zero producentów) |
| `WarOverlay force_invasion` (`WarOverlay.js:727`) | klik dźwigni, 3 jednostki | debug |
| `spawnTestEnemy` (`SpawnTestEnemy.js:148`) | konsola | debug (386) |
| `GarrisonSystem` mobilizacja / odrastanie | wojna / rok | tylko WŁASNE ciała AI — to nie desant |

Dlaczego dziś nic nie odpala, poza 49/201: (1) samo uderzenie AI nie startuje — wymaga wojny, celu w zasięgu i kadłuba
z bakiem warp **w służbie i w domu**; zmierzone: 0–1 takich kadłubów na 100 gy, zawsze w rezerwie (C1); (2) produkcja
staje w wojnie (C1); (3) **344** — strefa lądowania bez drogi do celu (33 z 486 kafli na koloniach AI — istotne dla odbicia
ciał pochodzenia AI); (4) **55** nadal w kodzie — kolonia domowa i placówka gracza mają `grid: null` do pierwszego otwarcia
mapy (`ColonyManager.js:512`, `:589`), a `launchInvasion` wtedy zwraca `no_grid` (kolonie zakładane ekspedycją dostają
siatkę od razu, `:2888-2897`).

**Pomiar** `probe_c5_landing_path.mjs` — prawdziwe rozkazy (`OrderService.issueAttack`) → EAH (okno 500 ms czasu
rzeczywistego, sonda czeka na nie jawnie) → bitwa → `InvasionSystem` → walka naziemna (`CombatSystem`) → skan przejęć.
Okręty AI stawiane ręcznie w układzie gracza 3 AU od kolonii (pomija skok warp), transportowiec dokładany ręcznie.
Kontrola: D1 musi skończyć się `no_drop_capable_hull` ✓ `[measured]`:

| przypadek | bitwy (kształt:zwycięzca) | desant | przejęcie |
|---|---|---|---|
| D1 dwie eskorty, kolonia bez obrony | `vessel_group/player:A` | `invasion:blocked no_drop_capable_hull` | nie (orbita AI, kolonia gracza 30 civY) |
| D2 + `transport_assault`, **pusta ładownia** | 2 × `vessel_group/player:A` | **6 + 6 = 12** × `shock_infantry`, morale 30 | **tak, po 9 civY** |
| D3 jak D2 + 2 `garrison_unit` gracza (morale 10) | 2 × A | 12 | **tak, po 13 civY** |
| D4 jak D2 + 1 uzbrojona fregata gracza na orbicie | `player:B` → `vessel_group/vessel_group:B` → `player:A` | transportowiec ginie w 1. bitwie → `no_drop_capable_hull` | nie |

Dwie rzeczy z tego pomiaru: (a) **ładunek nie ma znaczenia — liczy się pojemność**: `troopCount =
max(1, min(6, ⌊Σ troopCapacity⌋))` (`:294-295`), a pusta ładownia daje skład ze szczebla ⇒ każda wygrana bitwa orbitalna
z ocalałym zrzutowcem to **nowa fala do 6 jednostek z niczego** (→ K6, rodzina 384); (b) transportowiec (42,9 AU/rok)
przylatuje przed eskortą (6,6 AU/rok) i walczy sam (notatka `ShipTemplateData.js:210-215`, „do rozstrzygnięcia przy
doktrynie”).

**Najprostszy zaczep „AI ląduje, gdy wygrało orbitę”** istnieje — to `_onVesselGroupVictory`; brakuje mu tylko wejścia:
ocalałego kadłuba z `canDropTroops` w zwycięskiej grupie EAH. Warianty w Propozycji P4.

**Skąd AI wiedziałoby, co straciło** `[code]`: księga `war.captures[]` (`WarSystem._recordCapture :236-255`) — wpis
`{ bodyId, systemId, fromEmpireId, toEmpireId, year, via }` tylko przy aktywnej wojnie, append-only, odczyt `getCaptures(warId)`
(`:170`). Utrata w poprzedniej wojnie jest w nieaktywnym rekordzie (`getWarBetween` filtruje `active`); pokój status quo
zostawia ciało graczowi (298). **Kolejność odbicia** — gotowe miary: `colonyDevScore`, `wasHomePlanet`/stolica, złoża Xe/Nt,
odległość w zasięgu `InfluenceMap`. **Interakcje:** bramka wojny (status `'war'`; ⚠ `empireAtWarWithPlayer` reguły uderzenia
czyta rekord wojny, `DirectorOffensive.js:486-487` — dwa źródła, rodzina 287) · limit garnizonu (desant nie liczy się do limitu
na ciele gracza; po przejęciu jednostki stają się garnizonem tego ciała — `regrowEmpire` liczy jednostki na ciałach imperium,
`GarrisonSystem.js:239`) · **R4** (pokój usuwa jednostki AI z ciał gracza od razu — trwające odbicie przepada) ·
**wycofanie** (jednostki gracza na ciałach AI dostają termin 6 mies. przy pokoju) · przy przejęciu przez gracza garnizon AI
z tego ciała znika (`GarrisonSystem.removeOnOwnerChange :310`).

### C6. Wojna z inicjatywy AI

**Producenci wypowiedzenia wojny** `[code]`:

| producent | wyzwalacz | uwagi |
|---|---|---|
| `DiplomacySystem.changeTension` → `declareWar('hostility_threshold')` (`:341-343`) | napięcie przekracza **80** | jedyna droga „z inicjatywy” AI |
| `_tickUltimatumExpiry` → `'ultimatum_expired'` (`:1242-1255`) | napięcie ≥ **60** utrzymane **3 lata** | NAP anuluje ultimatum |
| `EnemyAttackHandler` → `'enemy_attack_arrived'` (`:130-137`) | przylot misji `attack` | misję `attack` AI wydaje tylko w wojnie albo dźwignia debug |
| `DiplomacyOverlay` → `'player_action'` (`:679`) | gracz | — |
| `CombatSandbox` | scenariusz | — |

Źródła napięcia: zerwanie traktatu **+15** (`:851`), kolonia gracza w ich układzie **+30** (`:1075`), skan obserwatorium **+10**
raz (`:1086`), potyczka **+12** (`WarSystem.js:56`, `:388`); spadek **60/rok** w pokoju do 0, w rozejmie do 15, wstrzymany przy
pamięci młodszej niż 2 lata (`:1227-1240`). Nacisk L1/L2 celowo **nie rusza** napięcia (kanał opinii). FSM obcych
(`AlienCivSystem`) ma stan `WAR`, ale **nie wypowiada wojny** — czytają go wyłącznie `DiplomacyOverlay:266`, `:446`
i `DebugLog` (etykieta).

**Wybór celu uderzenia** (istnieje): `reachableTargets` = kolonie gracza w przestrzeni roszczonej albo powłoce granicznej
(`BORDER_LY 5`, `GameConfig.js:616`) · `requiredSquadron` (HP obrońcy z `_buildPlayerBattleUnit` × 1,5 / średnie HP kadłuba) ·
`targetValue` = `devScore` układu · porządek: wartość malejąco, potem koszt (`DirectorOffensive.js:187-360`).
**Reguła okazji** czytałaby: siłę AI (`ThreatAssessment.getStrength`), obronę celu (`estimateDefenderHp` — okręty gracza
w układzie + budynki obronne ciała), garnizon gracza (`getUnitsOnPlanet` — AI widzi bez mgły, tak jak dziś `isDefended` czyta
`buildingSystem._active`). **„Mała kolonia przy granicy” w kodzie nie istnieje** — najbliżej: `reachableTargets`
+ `isOutpost` / `colonyDevScore` / `civSystem.population` / `InfluenceMap.distanceToClaimLY`.

**Pomiar zasięgu** `probe_c6_reach.mjs` (uprząż passive, odczyty reguły uderzenia; kontrola: 72 układy, claimed ∩ border = 0
we wszystkich próbkach ✓) `[measured]`:

| ziarno | imperium | roszczone / powłoka (gy 0 → 100) | dom gracza w zasięgu | odległość do roszczenia | `needed` · HP obrony |
|---|---|---|---|---|---|
| default | emp_001 | 1→3 / 7→6 | nie (cały czas) | 12,37 LY | — |
| default | emp_002 | 1 / 4 | nie | 15,33 LY | — |
| 987654321 | emp_001 | 2→3 / 7→6 | nie | 13,75 LY | — |
| 987654321 | emp_002 | 2 / 15 | **tak, powłoka, od gy 0** | 3,9 LY | 1 · 30 (obrona symboliczna) |

Fixture: dom gracza w powłoce emp_001 (C1). W3 zmierzyło 2 z 8 par `[doc]`. Gracz w uprzęży nie ma innych kolonii, więc
„mała kolonia przy granicy” nie wystąpiła w żadnej próbce.

**Co kończy taką wojnę** `[code]`: depesza pokojowa AI tylko przy wzroście wyczerpania AI z bitew (`recordBattle`: 2 ×
`exhaustionRate` każdej stronie + 7 przegranemu, `WarSystem.js:52-53`, `:486-490`) do ≥ `peaceCost` (incydent graniczny 30,
roszczenie terytorialne 50 — `CasusBelliData.js`) i przy `evaluatePeace === true` (`:306-330`). Wojna bez bitew nie wyczerpuje
nikogo ⇒ AI nigdy nie poprosi o pokój; pokój może zaproponować gracz. Auto-pokoju nie ma (WP-4).
**Co dziś hamuje częste wypowiedzenia:** po pokoju rozejm 10 lat blokuje KAŻDY powód, NAP 10 lat blokuje powody AI
(`DiplomacySystem.js:373-383`); napięcie spada 60/rok. Nowa reguła okazji przez `declareWar` dziedziczyłaby oba hamulce
automatycznie; własnego cooldownu `declareWar` nie ma. Casus belli wojny z inicjatywy AI = `inferCasusBelli` z pamięci
(domyślnie incydent graniczny).

### C7. Wielkość desantu

Tabela G2b (desant 2/4/6, wszystkie szczeble) + rozszerzenie `probe_c7_landing_ext.mjs` (desant 1 i 3, szczeble 0 i 3,
40 prób, ta sama funkcja próby i te same ziarna). **Kontrola:** komórka szczebel 0 / +0 / 2 obrońców / desant 2 = **100 %,
mediana 19** — identycznie jak w tabeli G2b ✓ `[measured]`. Odsetek przejęć w 60 civY (zakres = szczeble):

| tech obrońców | obrońcy | desant 1 | desant 2 | desant 3 | desant 4 | desant 6 |
|---|---|---|---|---|---|---|
| +0 | 0 | 100 | 100 | 100 | 100 | 100 |
| +0 | 2 | **3–5** | 98–100 | 100 | 100 | 100 |
| +0 | 4 | **0** | 28–46 | 100 | 100 | 100 |
| +90 | 0 | 100 | 100 | 100 | 100 | 100 |
| +90 | 2 | **0** | **0–14** | 0 (szczebel 0) · 95 (szczebel 3) | 28–100 | 100 |
| +90 | 4 | **0** | **0** | 0 · 3 | 0–32 | 18–100 |

„Gracz traci niebronioną, utrzymuje broniną” (≥ 90 % utrzymania przy 2 i 4 obrońcach) zachodzi: przy **+0 — tylko desant 1**;
przy **+90 — desant 1 i 2**, desant 3 tylko na szczeblu 0, desant 4 tylko przeciw 4 obrońcom na szczeblach 0–1. Dzisiejsze
wielkości: 6 na wygraną bitwę z transportowcem (D2 — 12 z dwóch bitew), 3 z dźwigni i domyślnie.

### Kandydaci na findingi znalezieni w Części C (BEZ numerów — rejestr po Części B nietknięty; wpisać przed nadaniem)

| | kandydat | dowód |
|---|---|---|
| **K1** 🔴 | `deployVessel` odmawia rozmieszczenia kadłuba **AI** (także kuriera), gdy zalega flota **gracza** (`VesselManager.js:989` → `fleetInArrears :2198-2205`) | G6 (kontrola); uprząż `press`: 4 392–4 498 odmów `courier_deploy_refused:fleet_in_arrears` na imperium / 100 gy, siła AI 0; fixture: gracz `unpaidYears` 3/13/42, `mobilize_reserve` odpaliła (gy 57,4), 6 kadłubów w rezerwie |
| **K2** 🟠 | guard `empireHasFreeCrew` czyta `freePops` stolicy (`DirectorProduction.js:157`) — dla AI martwy (rodzina 215), choć `commitCrew` umie eksmitować | uprząż: `freePops` 0 od gy 20 w 6/6 przebiegach; `mobilize_reserve` 0–1 prób na 100 gy przy 5–8 kadłubach w rezerwie |
| **K3** 🟠 | `_hasHostileFleetInSystem` liczy kadłuby AI w **rezerwie** (luka zbioru wykluczeń W2) | G3: rezerwa przy stolicy ⇒ dominacja gracza `false` przez 3 lata |
| **K4** 🟠 | zadokowany kadłub AI odbiera dominację, a nie da się z nim walczyć (`ProximitySystem.js:284`, `DSCS :1535`); UI każe „wygrać bitwę” | G1, G5: 0 bitew, `engage` zawisa na 0,86 AU |
| **K5** ⚪ | adnotacja `directorOrigin` trafia na zły kadłub (kolejka `_awaitingClaim` w kolejności zamówień, `DirectorProduction.js:237-242`) | fixture `v_28`: `frigate_laser_escort` przy modułach defendera |
| **K6** 🟠 | desant z bitwy liczy pojemność, nie ładunek — pusta ładownia daje do 6 jednostek z każdej wygranej bitwy (`InvasionSystem.js:294-304`; rodzina 384) | D2: 12 jednostek z 0 przewiezionych |

---

## PROPOZYCJA (opcje z liczbami — bez decyzji)

### P1. Okręty: pula czy produkcja

| | **P1-A pula** (jak garnizon) | **P1-B prawdziwa produkcja** | **P1-C hybryda** |
|---|---|---|---|
| mechanizm | jedno wejście `createAIVessel` (wzór `createAIUnit`): szablon, 3 pola właściciela, dom = stolica AI, budżet + odrastanie w `empires.<id>` (wzór D15) | naprawić 6 zmierzonych ograniczników (C2: wyzwalacz w wojnie, guard załogi K2, sprzężenie K1, przepustowość TTL, zamawianie eskort/transportu, pula uderzenia z transportowcem) | np. pula do limitu, produkcja ponad nim; albo transportowce z puli, okręty z produkcji |
| ile floty (zmierzone) | dowolnie z formuły limitu | dziś sufit 6–8 okrętów / 100 gy / imperium przy stałym nacisku, 0–1 z bakiem warp | zależy od podziału |
| koszt (kalibracja niżej) | ~2 slice'y | ≥ 4 slice'y + ponowny pomiar BALANS | ~3 slice'y |
| zapis | v101 bez migracji (pola na białych listach) | bez migracji | bez migracji |
| ryzyka | omija model załogi W2 (klasa W2-10), jeśli wejście nie zapłaci załogi; łańcuch `warp_cores` traci jedynego konsumenta militarnego (247), gate 246 traci sens; „okręty z niczego” widoczne dla gracza | przesuwa zmierzone krzywe ekonomii AI (FP, 247, 251, 208); keepery: Director 6–10, W2 5, `wp_reparations`, `deploy_seams`; nawet naprawiona daje mało (~0,07 okrętu/gy) | dwa źródła prawdy o flocie; podwójna diagnostyka |

### P2. Formuła limitu — wartości z C3

| formuła | uprząż gy 40 | uprząż gy 80 | fixture gy 60 | uwagi |
|---|---|---|---|---|
| F1 max(2, ⌊POP/32⌋) | 2 | 2–3 | 5 | płaska w uprzęży (POP 341) |
| F2 max(2, ⌊POP/16⌋) (= D1) | 2–3 | 4–6 | 11 | ten sam przelicznik co garnizon |
| F3 1 + szczebel D9 | 1–2 | 3–4 | 4 | nasyca się (fabryki stają na 20) |
| F4 F1 × mnożnik D9 | 2 | 2–3 | 6 | — |
| F5 2·stocznie + 2·stacje | 6 | 6 | 6 | **stała** — wejścia nie rosną |

Dla porównania: fixture gy 60 — gracz 3 fregaty (siła 618); jeden defender AI = 432, eskorta 242–312.

### P3. Reguła strażnika

| wariant | co mówi pomiar |
|---|---|
| G-a status quo (zadokowany) | zrzut gracza w całym układzie zablokowany na zawsze, walki brak (G1/G3/G5) |
| G-b strażnik **na orbicie** (`orbiting`, `dockedAt` = ciało) | da się go pokonać: 1 bitwa, 2 fregaty gracza wygrywają z 1 defenderem tracąc 1 (G2) |
| G-c jak G-b + `_hasHostileFleetInSystem` bez rezerwy (K3) | rezerwa przestaje być tarczą |
| ciało drugiego strażnika | porządek D11 (devScore, pełne przed placówkami, Xe/Nt); w fixture poza układem stolicy są tylko placówki ⇒ potrzebny kadłub z bakiem warp albo pula na tym ciele |

### P4. Reguła odbicia — kiedy, czym, jak często

* **kiedy:** wojna (status `'war'`) + wpis w `war.captures[]` `fromEmpireId = imperium`, `toEmpireId = 'player'`, ciało nadal
  gracza, w zasięgu `InfluenceMap`; kolejność: stolica/`wasHomePlanet`, `devScore`, złoża.
* **czym:** zaczep `_onVesselGroupVictory` (istnieje) + jedno z: (i) transportowiec w grupie uderzenia (wymaga zamawiania i
  zmiany puli `hasWeapons`; prędkość 42,9 vs 6,6 AU/rok — przylatuje sam, D4 go traci); (ii) desant z puli przy wygranej
  orbicie bez kadłuba zrzutowego (najmniej kodu; K6 to już de facto pula); (iii) pula transportowców.
* **ile:** tabela C7 (np. przeciw 2 obrońcom +0 wystarczą 3; +90 — 3 na szczeblu 3, 4–6 na niższych).
* **jak często:** cooldown jak uderzenie (5 lat) albo per ciało; R4 kasuje trwające odbicie przy pokoju.

### P5. Reguła wojny z inicjatywy

* **warunki do wyboru:** siła AI w służbie > obrona celu × 1,5 (`requiredSquadron`) · garnizon celu ≤ próg (C7) · cel
  w zasięgu · cel „mały” = placówka albo `devScore` ≤ próg (do zdefiniowania — w kodzie brak pojęcia).
* **cel:** istniejący ranking `pickAttainableTarget` (wartość, koszt) albo odwrócony (najsłabszy — D-210-1 odrzuciło
  odwrócenie dla uderzeń).
* **limity częstotliwości:** rozejm 10 l. + NAP 10 l. działają automatycznie przez `declareWar`; własny cooldown reguły
  (`declareWar` go nie ma); opcjonalnie wymóg napięcia.
* **koniec wojny:** dziś tylko z wyczerpania z bitew (AI ≥ `peaceCost` 30–50) — przyczółek bez bitew nie wygasa sam.

### P6. Cięcie na slice'y (kolejność właściciela) — estymaty

**Kalibracja** `[git]`: arc AI GARRISON — 1.10 podpis D1–D7 (0 commitów), 2–6.10: **67 commitów** (13 docs), **9 bramek**
w przeglądarce, ~13 pod-slice'ów (G1, G1b, G2-0/1/K1, G2-2, G2-3a, G2-3b, G2-4, follow-upy F1–F7, poprawki (a)–(g), G3,
G1c + (h), 380/381, G2b) ⇒ ~2–3 pod-slice'y dziennie; „mały podpisany slice = 1 dzień” zgodnie z założeniem.

| slice | zawartość | miejsca | keepery zagrożone | bramka | estymata |
|---|---|---|---|---|---|
| **S0** (warunek każdej opcji) | K1 — sprzężenie zaległości gracza w `deployVessel` dla AI; K2 — guard załogi | `VesselManager.deployVessel`, `DirectorProduction.hasFreeCrew` | `fleet_upkeep_imperial`, `w2_deploy_ui`, `w2_reserve_upkeep`, `w2_ai_mobilization`, `director_*` (6) | tak (fixture: 6 kadłubów emp_001 powinno ruszyć) | 1 dzień |
| **S1** | limit floty + źródło okrętów (P1 + P2) | NEW wejście tworzenia albo zmiany produkcji; `DirectorRuleData`; `ThreatAssessment` bez zmian | Director 6–10; `deploy_seams`, `w2_deploy_model`; łuk ekonomii (P1-B) | tak | 2–3 dni (P1-A) · 4+ (P1-B) |
| **S2** | strażnik stolicy + jednego cennego ciała (P3; K3/K4) | `DirectorDoctrine`, `WarSystem._hasHostileFleetInSystem`, ewent. Proximity/DSCS | `war_doctrine`, `w3_dominance_persist`, `g2_peace_followups`, `combat_system_scope` | tak | 1–2 dni |
| **S3** | desant AI po wygranej orbicie + odbicie (P4; K6, 384, 344, 55) | `InvasionSystem`, `DirectorOffensive`, księga zdobyczy | `w3_ai_invasion`, `g2b_invasion`, `ai_capture_*` (4), `battle_announce_once`, `g2_war_gate` | tak | 2–3 dni |
| **S4** | wojna z inicjatywy — przyczółek na małej kolonii (P5) | NEW reguła Directora, `DiplomacySystem.declareWar` | `director_pressure` (napięcie), `wp_truce_gate`, `wp_nap_expiry`, `wp_peace_seams` | tak | 2 dni |

Razem ~8–11 dni (P1-A) albo ~10–14 (P1-B).

### P7. Decyzje do podpisu właściciela

1. **Źródło okrętów:** P1-A pula · P1-B produkcja · P1-C hybryda (jaki podział).
2. **Załoga okrętów z puli:** płacona przy tworzeniu (`commitCrew`) · bez załogi.
3. **Formuła limitu:** F1 · F2 · F3 · F4 · inna; czy limit dotyczy okrętów w służbie, czy wszystkich.
4. **K1** — czy rozmieszczenie AI ma być niezależne od zaległości floty gracza (zmienia zachowanie fixture: 6 kadłubów).
5. **Strażnik:** zadokowany (status quo) · na orbicie (do pokonania) · plus wyłączenie rezerwy z tarczy (K3).
6. **Drugie strzeżone ciało:** porządek D11 · `devScore` · tylko placówki Xe/Nt · żadne.
7. **Desant AI:** transportowiec w uderzeniu · desant z puli przy wygranej orbicie · pula transportowców; czy K6 (pojemność
   zamiast ładunku) zostaje.
8. **Wielkość desantu:** stała · z tabeli C7 wg obrony celu · ze szczebla imperium.
9. **Odbicie:** wyzwalacz (księga bieżącej wojny czy cała historia), kolejność, cooldown.
10. **Wojna z inicjatywy:** warunki (siła/obrona/garnizon), definicja „małej kolonii”, cooldown, czy wymaga napięcia;
    jak kończy się wojna bez bitew.
11. **50:** czy dopisać zamknięcie w `W3_PLAN.md` §50 (rejestr macierzysty).

---

## GRANICE

* **Nie przeczytane:** `ArmySystem`, `FleetSystem` po stronie AI, `TradeOrderBoard`, UI wywiadu o flocie AI, pełny
  `IntelSystem` (co gracz widzi o strażniku poza komunikatem zrzutu).
* **Nie uruchomione:** przeglądarka (żadna bramka w C); replay fixture (headless nie ma ścieżki restore — fixture czytany
  statycznie, więc `mobilize_reserve` × zaległość w fixture to wniosek z pól zapisu + G6, nie odtworzenie przebiegu);
  bot gracza (flota gracza niemierzalna poza fixture).
* **Uprząż:** POP 2–3× niższy niż w fixture (341), więc `freePops = 0` (K2) zmierzone w uprzęży — w żywej grze reguła
  mobilizacji odpalała (fixture), tam blokuje K1. Statki nacisku i okręty AI w C4/C5 stawiane ręcznie (bez skoku warp);
  w C5 transportowiec z pustą ładownią.
* **Z dokumentów, bez pomiaru:** wyniki gate'u 246 (7 okrętów z ekonomii), inwentarz 247, liczba 2 z 8 par z W3, tabela G2b
  (2/4/6) z notatki G2b — powtórzona tylko komórka kontrolna.
* **Nieustalone:** który komodyt wiąże TTL zamówień okrętów; zachowanie `strike_player_target` na żywo w tej sesji (brak
  kadłubów do uderzenia).

---

## PLIKI

`ai-strikes-back/`: `REPORT_AI_STRIKES_BACK.md` (ten raport) · `partA/` (wpis Q-T2, log skryptu, sweep, i18n) · `partB/`
(skrypt dokumentacji, komunikat, diff commita, sweep, i18n) · `probes/` (`probe_c1_fixture.mjs`, `probe_c1_harness.mjs`,
`probe_c4_guard.mjs`, `probe_c5_landing_path.mjs`, `probe_c6_reach.mjs`, `probe_c7_landing_ext.mjs`, `calc_c2_costs.mjs`,
`calc_c3_limits.mjs`) · `results/` (wyniki txt/json) · `SHA256SUMS.txt`.
