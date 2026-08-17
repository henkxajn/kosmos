# W3 — GATE 1: KSIĘGA WOJNY (checklista live)

**Slice:** W3 (ofensywne AI) · **Commit:** `d5a9b8d` (`fix(war): DSCS i VCS księgowane`)
**Plan:** `docs/design/W3_PLAN.md` · **Poprzednie commity slice'u:** `b00d678` (plan) · `ea05d8f` (W3-0) · `efa8f85` (W3-1)
**Stan przed gate'em:** sweep **139/139 OK, 0 FAIL** · `check-i18n` **PASS** · `w3_battle_booking` **19/19** · `w3_conquest_persists` **25/25** · zapis **v101, bez migracji**

> **CO TU SPRAWDZAMY, w jednym zdaniu:** czy wojna toczona TAM, GDZIE NAPRAWDĘ WALCZYSZ —
> w przestrzeni głębokiej — **w ogóle się liczy**.
>
> Do tego commitu nie liczyła się wcale. `DeepSpaceCombatSystem` wpisywał `warId: null` na
> sztywno i `WarSystem` odsyłał takie starcie z niczym: zero wyczerpania, zero wpisu w rejestrze
> bitew, zero dominacji orbitalnej. Ponieważ wyczerpanie to **55-punktowy** człon zgody na pokój,
> wojny prowadzonej myśliwcami nie dało się zakończyć zmęczeniem — mogła trwać w nieskończoność.
> W1-4 domknął dokładnie ten sam szew, ale WYŁĄCZNIE dla ataków orbitalnych.

**Zasady stałe (każda kupiona błędem, wszystkie obowiązują):** żadnego wielolinijkowego kodu
w cytatach blokowych · stolica WYŁĄCZNIE przez `KOSMOS.directorProduction.capitalOf(empireId)` ·
niedobory czytać **z silnika**, nigdy z listy w pamięci · `DebugLog` to pierścień **czyszczony
przy reloadzie** · **nigdy** gate równolegle z pracą CC · dźwignie stanu tylko przez zwalidowane
narzędzia · **nigdy nie filtruj Dziennika po WYŚWIETLANYM TEKŚCIE** — filtruj po rodzaju
zdarzenia (grasz po angielsku, polski grep zwróci pustkę przy wpisie widocznym na ekranie).
Wszystkie one-linery poniżej **WYKONANE** na żywym silniku przed wpisaniem tutaj.

---

## 0. Przygotowanie

- [ ] **CC nie pracuje.** Żadnego równoległego zapisu do repo.
- [ ] Odśwież grę (Live Server), otwórz konsolę (F12).
- [ ] ⚠ **Zrób kopię bieżącej gry do pliku** (menu ☰ → „Zapisz do pliku") — §7 celowo oddaje
      Twoją kolonię wrogowi i chcesz mieć drogę powrotu.

---

## 1. Środowisko: SANDBOX BOJOWY

Nie stawiamy scenografii ręcznie — Sandbox robi dokładnie to, czego ten gate potrzebuje:
**wypowiada wojnę** (`_declareSandboxWar`), stawia prawdziwe okręty obu stron i włącza flagi walki.

- [ ] Ekran tytułowy → uruchom **Sandbox Bojowy**.

**L1 — z kim jest wojna (nie zgaduj id, przeczytaj je):**

`KOSMOS.warSystem.listActive().map(w => w.id)`

Oczekiwane: jedna aktywna wojna. Id przeciwnika w Sandboxie to `emp_sandbox_enemy`.

**L2 — punkt zerowy księgi:**

`KOSMOS.warSystem.getWarWith('emp_sandbox_enemy')`

Zapisz sobie trzy liczby ze zwrotki: `exhaustion`, `battles.length`, oraz:

`KOSMOS.gameState.get('orbitalDominance')`

Oczekiwane na starcie: wyczerpanie **0/0**, `battles` **puste**, dominacja `null` albo bez
wpisu dla Twojego układu.

---

## 2. SEDNO — bitwa w przestrzeni głębokiej KSIĘGUJE SIĘ

- [ ] Wyślij swój uzbrojony okręt na wrogi (PPM na wrogim statku → **Zaangażuj**).
      Poczekaj, aż starcie się rozstrzygnie.

**L3 — ta sama zwrotka co L2, po bitwie:**

`KOSMOS.warSystem.getWarWith('emp_sandbox_enemy')`

- [ ] **`exhaustion` PRZESTAŁO być 0/0.** To jest cały ten commit.
- [ ] **`battles.length` urosło o 1** — bitwa jest w rejestrze wojny (czyta go panel Wojny).
- [ ] `KOSMOS.gameState.get('orbitalDominance')` — pojawił się wpis dla układu bitwy.

**L4 — ślad audytowy, filtrowany po RODZAJU (nigdy po tekście):**

`KOSMOS.debugLog.query({ kind: 'battle:resolved' }).length`

- [ ] Wynik **2** na jedną bitwę — i to jest dowód, nie usterka: pierwszy wpis to surowy
      wynik od DSCS (bez `warId`), drugi to ten sam wynik **po zaksięgowaniu** (z `warId`).

**L5 — rozdziel te dwa wpisy (pole nazywa się `data`, nie `payload`):**

`KOSMOS.debugLog.query({ kind: 'battle:resolved' }).filter(e => e.data.warId).length`

- [ ] Wynik **1**. Przed tym commitem było tu **0** — starcie nigdy nie trafiało do księgi.

---

## 3. Asymetria idzie za WYNIKIEM, nie za stratami

Wyczerpanie ma dwa składniki: **baza za samo trwanie wojny** (obie strony) plus **udział
przegranego**. Wygrywający naciska, przegrywający szuka stołu (W1-4b).

- [ ] Stocz drugą bitwę i **przegraj ją** (albo wygraj, jeśli pierwszą przegrałeś).
- [ ] Po każdej bitwie odczytaj `exhaustion` z L3.

Oczekiwane: strona, która **przegrała starcie**, dostaje wyraźnie więcej. Zmierzone na
silniku: **wygrany +2, przegrany +9** za bitwę (skalowane przez `casusBelli.exhaustionRate`).

⚠ Jeśli chcesz sprawdzić, jaką masz stawkę: `KOSMOS.warSystem.getWarWith('emp_sandbox_enemy').casusBelli`

---

## 4. CENA POKOJU RUSZA SIĘ — to jest ta rzecz do zobaczenia

**L6 — wycena pokoju BEZ składania propozycji** (czysty odczyt, nic nie psuje, nie zostawia
śladu „odmowa"):

`KOSMOS.diplomacySystem.getVisibleBreakdown(KOSMOS.diplomacySystem.evaluatePeace('emp_sandbox_enemy'))`

- [ ] W zwrotce jest wiersz **`war_status`** z polami `raw` i `value`.
- [ ] **`raw` ROŚNIE po każdej bitwie.** Zmierzona krzywa (6 kolejnych bitew):
      **−0.30 → −0.28 → −0.19 → −0.17 → −0.08 → −0.06 → +0.03**.
      Przed tym commitem stała **w miejscu na −0.30 w nieskończoność**, bo wyczerpanie nie rosło.

⚠ **NIE czytaj z tego `decision` (ani sumy) jako sygnału tego gate'u.** Ta wartość skacze
tam i z powrotem między bitwami — i to jest POPRAWNE: `relative_power` (waga 30) reaguje na to,
KTO wygrał ostatnie starcie i ile kadłubów komu ubyło. Sygnałem W3-2 jest **monotonicznie rosnący
`war_status.raw`**, nie migający werdykt.

⚠ **Jeśli wiersz `war_status` ZNIKNIE z listy — to nie jest błąd.** Przy dokładnie zerowym `raw`
(wyczerpanie równe `peaceCost`) wiersz jest odfiltrowywany jako nieistotny. Zobaczysz go znowu,
gdy `raw` przejdzie na plus.

---

## 5. Widelec pozostaje wyczerpujący — potyczka to nadal potyczka

Nie chodziło o to, żeby księgować WSZYSTKO. Starcie **bez stanu wojny** ma dalej podnosić
napięcie i nie ruszać wyczerpania (to waluta wojny, a wojny nie ma).

- [ ] Wróć do zwykłej gry (nie Sandbox) — tam nie masz wypowiedzianej wojny.
- [ ] Doprowadź do starcia z obcym statkiem (albo pomiń ten punkt, jeśli nie masz pod ręką celu).
- [ ] `KOSMOS.warSystem.listActive().length` → **0**. Potyczka **nie tworzy wojny**
      i nie ma czego wyczerpywać.

---

## 6. Kontrola: ścieżka orbitalna nadal księguje (nie zepsuliśmy W1-4)

- [ ] W Sandboxie (albo w grze z wojną): `KOSMOS.debug.spawnEnemyFleet({ etaYears: 0.1 })`
- [ ] Po przylocie floty i bitwie orbitalnej: `battles.length` znowu rośnie, `exhaustion` rośnie.

To jest ścieżka, która działała już przed W3-2 — sprawdzamy, że dokładanie DSCS jej nie ruszyło.

---

## 7. W3-1 jedzie na tym samym gate — PODBÓJ ZOSTAJE

Commit `efa8f85` nie dostał własnego gate'u, a ma jedną własność, której harness nie zmierzy:
**czy utracona kolonia dalej ŻYJE i czy przeżywa zapis**.

⚠ To oddaje Twoją kolonię wrogowi. Masz kopię z §0.

- [ ] Wybierz kolonię (najlepiej NIE macierzystą) i zapamiętaj jej `planetId`.
- [ ] `KOSMOS.colonyManager.transferColony('<planetId>', 'emp_sandbox_enemy', 'gate')` → `true`
- [ ] Kolonia **znika z Twojej listy** kolonii (Outliner / górny pasek).
- [ ] **ale ISTNIEJE dalej** i należy do wroga:
      `KOSMOS.empireRegistry.getColoniesByEmpire('emp_sandbox_enemy').map(c => c.planetId)`
      — zdobycz jest na tej liście jako **żywy obiekt**, nie samo id. To jest cały W3-1.
- [ ] Mapa polityczna (Stratcom) pokazuje układ w barwie zdobywcy.
- [ ] **Zapisz i przeładuj grę.** Po wczytaniu: ta sama lista wyżej **nadal ją zawiera**,
      a mapa polityczna **nadal** pokazuje ją jako wrogą.
- [ ] Konsola bez czerwonych błędów po przejęciu (misje/zlecenia transportowe do utraconego
      ciała miały zostać posprzątane, nie wysypać się).

---

## 8. Brak regresji

- [ ] Zwykła gra wstaje, kolonie liczą, czas płynie.
- [ ] Bitwy lądują w Dzienniku na kanale **Walka** (nie „system").
- [ ] Konsola bez `TypeError`.

---

## Wynik

| pozycja | wynik |
|---|---|
| 1. Sandbox: wojna + okręty obu stron | |
| 2. **Bitwa w przestrzeni głębokiej księguje się** (wyczerpanie, rejestr, dominacja) | |
| 3. Asymetria po wyniku (wygrany 2 / przegrany 9) | |
| 4. **`war_status.raw` rośnie po każdej bitwie** | |
| 5. Potyczka bez wojny nadal nie księguje | |
| 6. Ścieżka orbitalna (W1-4) nietknięta | |
| 7. W3-1: podbój zostaje i przeżywa zapis | |
| 8. Brak regresji, konsola czysta | |

**GATE 1:** ☐ ZDANY ☐ ZDANY WARUNKOWO ☐ NIEZDANY

---

## Gdyby coś poszło nie tak

- **`exhaustion` dalej 0/0 po bitwie** → sprawdź L1: czy na pewno JEST aktywna wojna z tym
  imperium, z którym walczysz. Bez wojny to potyczka i wyczerpania **ma nie być** (§5).
- **`battle:resolved` daje 1 zamiast 2** → starcie poszło ścieżką orbitalną (EAH), nie DSCS.
  To nadal poprawne księgowanie, tylko innym szwem — sprawdź `battles.length`.
- **`war_status` nie rośnie, choć wyczerpanie rośnie** → odczytaj `casusBelli`; przy
  `peaceCost = 100` (eksterminacja) krzywa jest bardzo płaska i kilka bitew jej nie ruszy.
- **`decision` skacze** → to nie jest usterka, patrz ostrzeżenie w §4.

---

## Obserwacje do rejestru (nie otwierają gate'u ponownie)

1. **Cena pokoju nie odróżnia wygrywającego od przegrywającego.** Zmierzone: wyczerpanie
   **9/2** i **2/9** dają IDENTYCZNY `war_status.raw` (−0.28), a **100/20** wypada tak samo jak
   **20/20**. Term liczy `min(wyczerpanie obu stron)`, więc czyta licznik **wygrywającego**.
   Uzasadnienie tej formuły w kodzie (`AcceptanceEngine:93-96`) mówi, że „obie wartości i tak
   rosną symetrycznie" — a to przestało być prawdą, gdy W1-4b wprowadził asymetrię. To jest
   `W3_PLAN.md` §Audit S18 i **wejście do W4** (pokój terytorialny wycenia się tym samym termem).
2. **Wiersz `war_status` znika przy dokładnie zerowym `raw`** — filtr „nie pokazuj zer" zjada
   akurat punkt równowagi, czyli moment najciekawszy dla gracza.
