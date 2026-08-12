# GATE 2 (S5) — łańcuch pierwszego kontaktu · skrypt sesji

**Arc:** WOJNA I POKÓJ 1.0 · **Workstream:** C (ReactionDirector) · **Slice:** 1, commit S5
**Plan:** `DIRECTOR_SLICE1_PLAN.md` (§Commit plan → S5, §Tests, §Verification)
**Poprzedni gate:** `DIRECTOR_S4_GATE1_CHECKLIST.md` — **PASSED** 2026-08-11 (przebieg 3)
**Zapis:** v100, **zero migracji** (cały nowy stan ma pusty domyślny kształt)

---

## 🔴 STAŁE REGUŁY SKRYPTÓW — każda kupiona błędem, żadna nie jest ozdobna

1. **ZERO wieloliniowego kodu w cytatach blokowych.** Kopiuje się razem z `> ` → `SyntaxError`.
   Każdy one-liner stoi w bloku ```` ``` ```` i mieści się w JEDNEJ linii.
2. **Stolica WYŁĄCZNIE przez `KOSMOS.directorProduction.capitalOf(empireId)`.** Kolonie nie mają `.id`,
   a „pierwsza pełna" pęka przy wielu koloniach.
3. **Braki / stany ODCZYTYWAĆ Z SILNIKA, nigdy z pamięci ani z ręcznej listy.** Przebieg 1 GATE 1
   pokazał, że realne braki obejmowały `warp_cores` i `metamaterials`, których nie było na żadnej liście.
4. **`DebugLog` to PIERŚCIEŃ czyszczony przy przeładowaniu.** Kroki po wczytaniu gry NIE MOGĄ odpytywać
   wpisów sprzed reloadu.
5. **NIE URUCHAMIAJ GATE'U RÓWNOLEGLE Z PRACĄ CC** — commit przeładowuje Live Server i kasuje przebieg.
   Zapis do pliku PRZED wklejeniem promptu.
6. **Lewary stanu tylko przez ZWALIDOWANE narzędzia** (`KOSMOS.debug.*`), nigdy przez „naturalnie
   wyglądające" pole — przebieg 1 zgubił na tym godzinę (`spendAll`, `_resources` — obie nazwy fałszywe).
7. **NOWA, z audytu Dziennika 2026-08-12:** pin/asercja NIE MOŻE być spełnialna przez SĄSIEDNI kod.
   Okna o stałej szerokości nad źródłem przeciekają do następnego handlera — bramka zdjęta z jednego
   subskrybenta zostawiała test na zielono. Ciała domykać per-handler.

> ⚠ **Walidacja one-linerów — stan faktyczny, bez zaokrąglania.** Każde polecenie ma
> **zweryfikowaną powierzchnię API** (nazwa metody/pola istnieje w źródle — to jest ta kontrola,
> na której przebieg 1 GATE 1 stracił godzinę przez `spendAll` i `_resources`).
>
> **Czego NIE zrobiono:** helpery `KOSMOS.debug.*` **nie zostały uruchomione w przeglądarce** —
> autor slice'u nie ma sesji live, a reguła 5 zabrania puszczania gate'u równolegle z pracą CC.
> Pierwsze wywołanie każdego z nich następuje w TYM przebiegu.
>
> **[✔KEEPER]** = zachowanie udowodnione WYKONANIEM prawdziwych systemów w
> `director_first_contact_smoke.mjs` (nie przez ten one-liner, tylko przez ścieżkę, którą on
> odczytuje). **[~ŹRÓDŁO]** = sprawdzone wyłącznie po źródle; wymaga żywej sceny (3D, popup,
> radar, panel dyplomacji) albo dotyczy samego helpera debug.

---

## 0. Przygotowanie (1 min)

Gate wymaga zapisu z **obserwatorium ≥ L5** (próg reguły) **albo** użycia lewara `firstContact`,
który omija próg. Ścieżka pełna (z progiem) jest wartościowsza, ale dłuższa.

```js
KOSMOS.observatorySystem.getMaxObservatoryLevel()
```
→ oczekiwane: liczba. **≥ 5** = ścieżka pełna (§2 zadziała sam z siebie). **< 5** = tylko §3 (lewar).

```js
[KOSMOS.directorSystem ? 'directorSystem OK' : 'BRAK directorSystem', KOSMOS.directorFirstContact ? 'firstContact OK' : 'BRAK firstContact', GAME_CONFIG?.FEATURES?.reactionDirector]
```
☐ **G2.0** — oba systemy wpięte, kill-switch `reactionDirector` = `true`. **[~ŹRÓDŁO — helper debug, pierwsze uruchomienie]**

> S5 jest PIERWSZĄ realną regułą, więc dopiero teraz `DirectorSystem` w ogóle jest instancjonowany
> i tickowany (S1 zostawił go stojącego samodzielnie). Gdyby `KOSMOS.directorSystem` był `undefined`,
> to nie jest „reguła nie odpaliła" tylko „silnika nikt nie podłączył" — dwie różne awarie.

---

## 1. Katalog i rejestry (30 s)

```js
KOSMOS.debug.directorRules()
```
☐ **G2.1** — tabela stanu reguł (na świeżej partii pusta) + linia „aktywne przeloty: []". **[~ŹRÓDŁO — helper debug, pierwsze uruchomienie]**

☐ **G2.2** — konsola **bez wyjątku** przy starcie gry. Reguła wskazująca niezarejestrowaną nazwę
  RZUCA przy starcie (audyt R12) — brak wyjątku znaczy, że sonda/guard/akcja są w rejestrach.

---

## 2. Ścieżka pełna — rzut w latach WYŚWIETLANYCH (decyzja 2)

**Tylko gdy `getMaxObservatoryLevel() ≥ 5`.** Puść grę i obserwuj przyrost prób.

```js
KOSMOS.debug.directorRules()
```
☐ **G2.3** — `proby` rośnie o **1 na ROK WYŚWIETLANY**, nie 12. Kolumna `ostatniaProba` skacze
  o ~1.0. **To jest sedno decyzji 2** — w latach cywilizacyjnych beat wystrzeliwałby ~10 miesięcy
  po L5, czyli natychmiast. **[✔KEEPER — pinowane też przez keeper T2a/T2b]**

☐ **G2.4** — po kilku latach reguła odpala (`odpalila: TAK`), a `odpalenieRok` to rok wyświetlany.
  Wartość oczekiwana ~3,7 roku od L5 (10 % +10 pkt/rok).

---

## 3. Przelot — spawn, kurs, despawn

Lewar omija próg i rzut (do gate'u, nie do gry):

```js
KOSMOS.debug.firstContact('emp_001')
```
☐ **G2.5** — zwraca **id sondy** (nie `null`). `null` ⇒ czytaj powód, NIE zgaduj:

```js
KOSMOS.debugLog.query(e => e.kind === 'director:flybyRejected').slice(-1)
```

```js
KOSMOS.debug.directorRules()
```
☐ **G2.6** — „aktywne przeloty" zawiera id sondy. **[~ŹRÓDŁO — helper debug, pierwsze uruchomienie]**

☐ **G2.7** — **sonda JEST WIDOCZNA na mapie 3D** i ma właściciela (obcy, nie „niczyj").
  ⚠ To jest realne ryzyko: nie ma pojęcia „neutralny obcy statek", a statek bez właściciela czyta się
  jako **statek GRACZA** (`isEnemyVessel` to test truthiness — dokładnie ta klasa błędu, którą
  GATE 1 złapał przy fregatach). **[~ŹRÓDŁO — wymaga oka na scenie]**

```js
(id => { const v = KOSMOS.vesselManager.getVessel(id); return v ? { nazwa: v.name, wlasciciel: v.ownerEmpireId, wrog: v.isEnemy, x: Math.round(v.position.x), y: Math.round(v.position.y) } : 'BRAK'; })('WKLEJ_ID_Z_G2.5')
```
☐ **G2.8** — `wlasciciel` = `emp_001`, `wrog` = `true`, pozycja daleko od gwiazdy. **[✔KEEPER]**

Przewiń **~3 lata wyświetlane** i powtórz powyższe:

☐ **G2.9** — pozycja się ZMIENIŁA (sonda leci przez układ, nie stoi). **[✔KEEPER — keeper T4f]**

Przewiń do **~6 lat wyświetlanych od startu przelotu**:

☐ **G2.10** — sonda **ZNIKA** z mapy i z „aktywnych przelotów" (despawn na wyjściu),
  a `KOSMOS.debugLog.query(e => e.kind === 'director:flybyEnded').slice(-1)` ma wpis z `reason: 'exited_system'`.
  **[✔KEEPER — keeper T4h/T4i]**

---

## 4. Beat narracyjny — JEDEN, nie dwa (decyzja 5)

☐ **G2.11** — przy wykryciu sondy gracz dostaje **DOKŁADNIE JEDEN popup**: narracyjny
  **„Nie jesteśmy sami"**. Generyczny popup „pierwsze wykrycie obcego statku" **NIE pojawia się**
  obok niego. **[~ŹRÓDŁO — wymaga żywego UI; keeper pinuje samą bramkę G/T5a]**

☐ **G2.12** — Dziennik (kanał `intel`) ma wpis o niezidentyfikowanym kontakcie **po polsku ORAZ po
  angielsku** zależnie od języka. Dwa łańcuchy na tej trasie były zahardkodowane po polsku (dług
  sprzed slice'u) — S5 je klucza. Przełącz język i sprawdź.

```js
KOSMOS.debugLog.query(e => e.kind === 'director:firstContactBeat').slice(-1)
```
☐ **G2.13** — wpis audytu beatu istnieje (empireId + vesselId). **[✔KEEPER]**

**Round-trip — to jest naprawa realnej wady, nie formalność:**

☐ **G2.14** — **zapisz grę, przeładuj stronę (F5), wczytaj.** Popup pierwszego kontaktu **NIE
  pojawia się drugi raz** dla tej samej sondy. Przed S5 `_reportedVesselSightings` nie było
  serializowane i beat wracał po każdym wczytaniu. **[~ŹRÓDŁO — keeper T5c/T5d pinuje round-trip pola]**

☐ **G2.15a** — po wczytaniu **sonda JEST WIDOCZNA NA MAPIE 3D** (nie tylko w Command).
  🔴 To była **rozbieżność 1 z przebiegu 1**: stan przeżywał, mesh nie. Sonda była jedynym statkiem,
  którego nie rusza `VesselManager`, więc nie trafiała do `vessel:positionUpdate` — a to JEDYNY kanał
  leniwego odtwarzania sprite'a. Naprawione dwutorowo (system ogłasza ruch + GameScene zasiewa
  sprite'y po restore). **[✔KEEPER — T8a/T8b/T8c]**

☐ **G2.15** — po wczytaniu **sonda dalej leci** (kurs przeżył zapis). Kurs mieszka w
  `gameState.director.flybys`, bo `VesselManager.serialize` ma białą listę pól i pole dopisane na
  statku zginęłoby po cichu. Sprawdź `KOSMOS.debug.directorRules()` → „aktywne przeloty".

---

## 5. Zestrzelenie przelotu (decyzja 4)

> 🔴 **Przebieg 1 GATE 2: NIETESTOWALNE — statki gracza są WOLNIEJSZE od sondy i nie dogoniły jej.**
> Dlatego doszły dwa lewary. Wybierz JEDEN:

**Wariant A (prostszy) — sonda wolna i tuż obok domu:**

```js
KOSMOS.debug.flybyNearHome('emp_001', 60)
```
Sonda dryfuje przy planecie macierzystej przez ~60 lat wyświetlanych — zdąży ją dogonić nawet
powolny okręt. Potem: zaznacz uzbrojony statek → PPM na sondę → „Zaangażuj".

**Wariant B — przenieś okręt gracza wprost na sondę:**

```js
KOSMOS.debug.teleportVessel('ID_TWOJEJ_FREGATY', KOSMOS.vesselManager.getVessel('ID_SONDY').position.x, KOSMOS.vesselManager.getVessel('ID_SONDY').position.y)
```
⚠ `teleportVessel` zdejmuje dokowanie i — gdy celem jest SONDA — przesuwa też jej kurs
(inaczej `_tickFlybys` cofnąłby teleport przy najbliższym tiku).

Po zestrzeleniu:

```js
KOSMOS.debugLog.query(e => e.kind === 'director:firstContactKill').slice(-1)
```
☐ **G2.16** — wpis `firstContactKill` z `empireId` + `vesselId`. **[✔KEEPER]**

```js
KOSMOS.diplomacySystem.getOpinionBreakdown ? KOSMOS.diplomacySystem.getOpinionBreakdown('emp_001') : KOSMOS.diplomacySystem.getOpinionOfPlayer('emp_001')
```
☐ **G2.17** — opinia imperium **wyraźnie spadła**, a w rozbiciu widnieje pozycja
  **„Zestrzelenie sondy pierwszego kontaktu"** (`first_contact_kill`, −25, ACCUMULATE).
  **[~ŹRÓDŁO — nazwa metody rozbicia zależy od wersji panelu; wartość liczbowa jest pewna]**

☐ **G2.18** — **naturalne** opuszczenie układu (G2.10) **NIE** dokłada tej kary. Sprawdź, że po
  czystym przelocie w `debugLog` NIE ma `firstContactKill`. **[✔KEEPER — keeper T6d]**

---

## 6. Higiena — to samo, co GATE 1 miał w §G1.15+

☐ **G2.19** — `once` naprawdę raz: po odpaleniu reguły dla danego imperium **drugi przelot się nie
  pojawia** przez resztę partii, **także po wczytaniu zapisu**. `KOSMOS.debug.directorRules()` →
  `odpalila: TAK` i `proby` przestaje rosnąć. **[✔KEEPER — keeper T3a/T3b]**

☐ **G2.20** — imperium **w stanie wojny** z graczem NIE dostaje przelotu (guard
  `empireNotAtWarWithPlayer`). **[✔KEEPER — keeper T7i]**

☐ **G2.21** — **żadnych zdarzeń AI w Dzienniku gracza.** Regresja naprawy z 2026-08-12: build AI,
  głód kolonii AI i dostawy kurierów AI → CISZA. Skrypt z tamtego spot-checku nadal obowiązuje.

☐ **G2.22** — konsola **bez błędów** przez cały przebieg.

---

## Wynik

| pole | wartość |
|---|---|
| Data / przebieg | |
| Wynik | ☐ PASS ☐ FAIL |
| Punkty nienegocjowalne (G2.3 jednostka rzutu · G2.10 despawn · G2.11 jeden popup · G2.14 brak zjawy po reload · G2.16 kara za zestrzelenie) | |
| Rozbieżności | |

> **Nienegocjowalne pięć.** G2.3 (rzut w latach wyświetlanych) — bez tego decyzja 2 jest martwa.
> G2.10 (despawn) — bez tego sonda zostaje w układzie na zawsze. G2.11 (jeden popup) — cały sens
> decyzji 5. G2.14 (brak drugiego beatu po wczytaniu) — naprawa wady zdiagnozowanej w §Audit D.
> G2.16 (kara) — bez niej przelot można zabić bezkarnie i pierwszy kontakt nic nie znaczy.
