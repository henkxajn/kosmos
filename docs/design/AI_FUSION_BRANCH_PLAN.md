# AI — gałąź fuzji dla Industrialisty (finding 181, kategoria „(c) zdolność")

> **Status: DO PODPISU.** Mała zmiana danych: dwie pozycje w `researchQueue` jednego archetypu.
> Rejestr macierzysty: `VESSEL_ORDERS_PLAN.md` §Findings z A/B ekonomii AI (**181**).
> Zakres zawężony pomiarem — patrz **184**: `quantum_processors` wypadły z (c), bo przechodzą
> bramkę przez `quantum_physics`. Zostaje **jedna** brakująca gałąź.

## §1 Co dokładnie blokuje

`antimatter_cells` wymagają `fusion_power` (gałąź 3 bramki) **albo** `antimatter_containment`
(gałąź 1, `unlockCommodity`). Industrialista nie ma w planie żadnej z dwóch, więc:

```
warp_cores  ←  quantum_cores ✅  +  antimatter_cells ❌  +  Ti ✅
```

⇒ `warp_cores` są dla Industrialisty nieosiągalne **mimo** posiadania `ion_drives` i `warp_drive`.
Blokuje **jeden półprodukt**, nie bramka samego towaru.

## §2 Koszt — policzony, nie oszacowany

`fusion_power` ma prereq `nuclear_power` (**już w kolejce**, poz. 3) **oraz `plasma_physics`**, więc
wchodzą we dwie:

| tech | rp | tier | prereq | status prereq |
|---|---|---|---|---|
| `plasma_physics` | **200** | 2 | `efficient_solar` | ✅ w kolejce (poz. 2) |
| `fusion_power` | **400** | 3 | `nuclear_power`, `plasma_physics` | ✅ / ⬆ powyżej |
| **razem** | **600 rp** | | | |

Kolejka Industrialisty kosztuje dziś **4130 rp**, więc to **+14,5 %**.

**ZMIERZONE tempo** (2 seedy, deterministycznie identyczne): cała kolejka domyka się w **10 gy**
(`nuclear_power` 1 gy · `ion_drives` 3 · `quantum_physics` 4 · `warp_theory` 6 · `warp_drive` 10).
Tempo ≈ **413 rp/gy** ⇒ 600 rp to **≈ 1,5 gy**. Partia trwa 45–60+ gy, więc w kategoriach rozgrywki
koszt czasowy jest **pomijalny**.

⚠ **`antimatter_containment` NIE jest tańszą alternatywą** — kosztuje 600 rp **i wymaga
`fusion_power`**, czyli jest ścieżką ściśle droższą (1200 rp łącznie). Odpada.

## §3 Decyzje do podpisu

| # | decyzja | rekomendacja |
|---|---|---|
| **F1** | Dodać gałąź w ogóle? | **TAK** — to dokładnie ta sama para, którą **Ekspansjonista ma już dziś** w kolejce (`plasma_physics` → `fusion_power`). Konfiguracja jest w grze od S3.2, więc nie wprowadzamy nowego, nieprzetestowanego stanu — wyrównujemy archetypy |
| **F2** | Gdzie wstawić? | **NA KOŃCU kolejki.** Wtedy `warp_drive` zachowuje swoje 10 gy, a fuzja przychodzi ok. **11,5 gy**. Wstawka po `nuclear_power` przesunęłaby CAŁĄ resztę o ~1,5 gy, w tym `warp_drive` — czyli tech krytyczny dla ekspansji cross-system |
| **F3** | Dopisać `antimatter_cells` i `warp_cores` do `startingSafetyStocks` Industrialisty? | **TAK, w tym samym commicie** — inaczej odblokujemy zdolność i zostawimy cel zapasu na 1 sztuce, czyli powtórzymy Finding 182 na nowej gałęzi. Lista D4 przestaje ich wykluczać, bo znika powód wykluczenia |
| **F4** | Czy ruszać `military_supplies`? | **NIE** — `military_logistics` (150 rp) ma prereq **`ground_warfare`**, którego w kolejce nie ma, więc to osobna gałąź o innym przeznaczeniu (zaopatrzenie jednostek naziemnych, `BuildingsData:765`). Poza zakresem |

## §4 Czego to NIE naprawia

`military_supplies` zostają na zerze (F4). `fuel` zostaje na zerze — to Finding **180**, brak procesu,
niezależny od technologii. Rozjazd `requiresTech` ↔ `unlockCommodity` (Finding **184**) zostaje
otwarty jako pytanie projektowe — ta zmiana go nie dotyka ani nie pogłębia.

## §5 Gate

Panel **16 seedów × 45 gy** + `probe-ai-advanced-components` (2 seedy × 60 gy). Kryteria:
1. `antimatter_cells` u Industrialisty przestają mieć werdykt `(c) ZDOLNOSC`;
2. `warp_cores` przestają być zerem u Industrialisty **albo** ich zero ma inny, nazwany powód;
3. `warp_drive` nadal ok. 10 gy (F2 — brak regresji ekspansji cross-system);
4. brak regresji panelu: imperia bez placówki ≤ 1/32, naruszenia ≈ 82/192.
