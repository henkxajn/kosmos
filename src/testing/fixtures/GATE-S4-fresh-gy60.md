# `GATE-S4-fresh-gy60` — metryczka fixture'u

**Plik:** `GATE-S4-fresh-gy60.save.json.gz` (2 043 KB surowo → **215 KB** po gzipie)

| pole | wartość |
|---|---|
| **wersja zapisu** | **101** (zakres migracji `MIN_SUPPORTED_VERSION`…`CURRENT_VERSION` — poza nim fixture jest martwy) |
| **commit przechwycenia (HEAD)** | **`977112a`** — *docs(nt): L5 potwierdził JEDEN kształt…* (2026-09-03 12:55) |
| **commit KODU GRY w chwili zapisu** | ⚠ **`bee26cf`** — *feat(233): S4a — budżet pracy ekspandera* (2026-09-02 22:10) |
| `savedAt` | 2026-09-03 **09:48:57** (z pola zapisu, nie z mtime pliku) |
| `gameTime` | **60,12** roku gry |
| scenariusz | `civilization_boosted` |
| cywilizacja gracza | „Pikaczu" |
| eksport | ☰ → *zapisz do pliku* (produkcyjna ścieżka `SaveSystem.exportSave` → `SaveFile.downloadSave`) |

## ⚠ FIXTURE POWSTAŁ **PRZED** NAPRAWAMI NT_LINK (C1/C2/C3) — i to jest jego wartość

`savedAt` **09:48** wyprzedza commity `3139533` (C1, 12:42), `5fdd414` (C2, 12:47) i `673b11b`
(C3, 12:52). Zapis niesie więc **świat sprzed bramki układu i sprzed watchdoga**:

* **5 tras na imperium** (2 domowe + 3 międzyukładowe), nie 2 po prune,
* **6 kadłubów na imperium w pozie 239** (`v_9`-`v_14`), spóźnionych **38,4-44,1 roku**,
* `built 10 · dispatched 26 · delivered 16` (emp_001) — **co do sztuki** jak `NT_LINK_PLAN.md` §2.2.

⇒ To jest **kanoniczna kontrola „zamrożonych kadłubów"**, której `NT_LINK_PLAN.md` §6 nie mógł
uruchomić, bo zapis istniał wyłącznie w localStorage. Wczytanie go na dzisiejszym kodzie odpala
prune C1 + odzysk C2 — czyli fixture jest **równocześnie** wejściem do gate'u NT_LINK i punktem
zerowym dla wszystkiego, co po nim.

## Stan, na który się powołujemy (zweryfikowany sondą, nie przepisany)

| | emp_001 `Propus b` (industrialist) | emp_002 `Regulus c` (expansionist) |
|---|---|---|
| układ | `sys_059` | `sys_020` |
| pop | 170 | 158 |
| `Fe / Si / Cu / C` | **14 046** / 79 589 / 34 458 / 52 761 | **5 728** / 67 648 / 47 618 / 53 637 |
| `Nt` w stolicy | **0** | 156 |
| `QC / AC / WC` | 3 / 3 / **1** | 0 / 0 / **0** |
| placówki | 5 (2 w układzie, 3 cross) | 5 (2 w układzie, 3 cross) |
| **`Nt` w placówkach** | **37 766** (≈ 37,7 tys. — `FE_SUPPLY_PLAN.md` §14.3 co do liczby) | 34 398 |

⚠ **OBIE stolice mają dziś bramkę zamożności ZAMKNIĘTĄ** (`Fe < 20 000`) — także industrialist,
który wcześniej ją przechodził i **zdążył wyprodukować** `WC 1` (`FE_SUPPLY_PLAN.md` §14.3: Fe
20 034 → 14 046, „stolica zaczęła Fe ZUŻYWAĆ"). To ma bezpośrednią konsekwencję dla gate'u
Findingu **246** — patrz `CHAIN_ENTRY_GATE_CHECKLIST.md` §Obserwowalne.

## Do czego służy

* **246 / E3H** — live-gate wejścia do łańcucha (`CHAIN_ENTRY_GATE_CHECKLIST.md`).
* **239/240** — kanoniczna kontrola pozy zamrożonego kuriera (6 kadłubów na imperium).
* **241** — stan, w którym 37,7 tys. `Nt` leży w placówkach przy `Nt = 0` w stolicy.

## Inspekcja

```bash
node src/testing/headless/probe-fixture-inspect.mjs \
     src/testing/fixtures/GATE-S4-fresh-gy60.save.json.gz [--json]
```

⚠ Sonda jest **read-only i bez silnika** — nie odtwarza przebiegu. Replay headless wymaga
wyciągnięcia łańcucha restore z `GameScene`; **prerekwizyt zaparkowany**, patrz `README.md`.
