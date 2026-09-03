# Kanoniczne fixture'y zapisu — konwencja

> Powołane 2026-09-03. Powód: **`GATE-S4-fresh-gy60` istniał wyłącznie w localStorage przeglądarki**,
> więc ginął przy wyczyszczeniu profilu i **nie dało się go w ogóle podać CC**. Kontrole gate'ów
> odwołujące się do niego były nieodtwarzalne poza jedną kartą jednej maszyny.

## Co tu leży

Zapisy gry wyeksportowane **produkcyjną ścieżką** (☰ → *zapisz do pliku* / `KOSMOS.debug.exportSave`),
skompresowane gzipem, plus metryczka. Nic wygenerowanego ręcznie — fixture ma być stanem, który
**silnik naprawdę wyprodukował**.

## Konwencja nazw

```
<FIXTURE-ID>.save.json.gz      — zapis (gzip)
<FIXTURE-ID>.md                — metryczka (obowiązkowa)
```

`<FIXTURE-ID>` = nazwa używana w planach i checklistach, np. `GATE-S4-fresh-gy60`.

## ⚠ Metryczka jest OBOWIĄZKOWA — i musi nieść dwie rzeczy

Fixture jest ważny **wyłącznie dla swojej wersji zapisu**. `SaveMigration` ogranicza go zakresem
`MIN_SUPPORTED_VERSION`…`CURRENT_VERSION`, a **każda przyszła migracja po cichu zmienia to, co
fixture znaczy**. Dlatego `<FIXTURE-ID>.md` musi zawierać:

| pole | po co |
|---|---|
| **`save version`** | poza zakresem migracji fixture jest martwy, a `importSave` odrzuci go z `too_old`/`future_version` |
| **`commit hash` przechwycenia** | jedyny sposób odtworzyć, jaki KOD wyprodukował ten stan |
| gy / scenariusz / flagi `FEATURES` odbiegające od domyślnych | inaczej „ten sam fixture" znaczy co innego po flipie flagi |
| do czego służy (który gate / plan) | fixture bez odbiorcy zgnije |

## Kompresja — dlaczego gzip, a nie surowy JSON

ZMIERZONE na zapisie harnessu po 60 gy: **1 279 844 znaków ≈ 1,25 MB surowo, 134 KB po gzipie**
(`version: 101`). Git trzyma **pełny blob na każdą rewizję**, więc ponowne wygenerowanie fixture'u
dokładałoby kolejne 1,25 MB. Gzip zdejmuje z tego rząd wielkości.

```bash
# pakowanie (stdlib node, bez zależności)
node -e "const z=require('zlib'),f=require('fs');f.writeFileSync(process.argv[2]+'.gz',z.gzipSync(f.readFileSync(process.argv[1])))" kosmos_....json GATE-S4-fresh-gy60.save.json

# rozpakowanie
node -e "const z=require('zlib'),f=require('fs');f.writeFileSync(process.argv[2],z.gunzipSync(f.readFileSync(process.argv[1])))" GATE-S4-fresh-gy60.save.json.gz out.json
```

## Do czego fixture'a MOŻNA użyć dziś, a do czego NIE

✅ **Inspekcja read-only** — `node src/testing/headless/probe-fixture-inspect.mjs <plik.gz|plik.json>`.
Czyta zapis bez silnika i odpowiada na pytania strukturalne (kolonie, placówki i ich układy, trasy
logistyki i pozy kurierów, magazyny stolic, flota). To pokrywa większość tego, czego potrzebuje
**kontrola gate'u** („czy sześć kadłubów zamarzło", „co stolica trzymała").

⛔ **Odtworzenie przebiegu (replay) — NIE DZIAŁA i nie jest zaczęte.** `GameCore.boot` nie ma ścieżki
restore: twardo ustawia `window.KOSMOS.savedData = null` (`:130`) i zawsze generuje świeży świat.
Łańcuch przywracania mieszka w `GameScene` (`_restoreSystem`, `relinkColoniesAfterRestore`,
`resolveActiveColonyAfterRestore`), który **nie importuje się pod node**.

> ⚠ **PREREKWIZYT ZAPARKOWANY (krok 3, świadomie NIEZACZĘTY):** headless replay wymaga wyciągnięcia
> łańcucha restore z `GameScene` do modułu importowalnego pod node albo napisania shimu restore
> tylko-headless. To jest **slice z własnym podpisem**, nie zadanie poboczne.
