# AI — CEL ZAPASU DLA TOWARÓW TIER 3+ (finding 182, kategoria „(a) priorytet")

> **Status: DO PODPISU.** Zmiana **stałej balansu**, więc metoda BALANS 1.0: jedna izolowana
> zmiana, zachowany baseline, zdiffowany wynik. Pomiar wejściowy **już wykonany** (2026-08-28)
> i zapisany niżej — plan nie prosi o zgodę na pomiar, tylko o decyzje.
> Rejestr macierzysty: `VESSEL_ORDERS_PLAN.md` §Findings z A/B ekonomii AI (**182**).

## §1 Problem w jednym zdaniu

`getSafetyStockTarget` zwraca **3** dla tier ≤ 2 i **1** dla tier 3+, a `demandBonus` bootstrap AI
ustawia tylko dla **sześciu** towarów — więc cel zapasu dla `quantum_cores` czy `plasma_cores` wynosi
dosłownie **jedną sztukę**, na **piątym z sześciu** priorytetów (`DEFAULT_REACTIVE_ORDER`). Towary,
które AI umie zrobić i ma z czego, nie wchodzą do produkcji nigdy.

## §2 Pomiar wejściowy — BASELINE vs WARIANT (wykonany, nie planowany)

Wariant: tier 3+ **bez droidów** (mają własną ścieżkę `_droidOrders`) dopisane do
`startingSafetyStocks` z celem **50**. AI-only, data-only. Galaktyka przypięta, przyrząd niezmieniony.

| metryka | BASELINE (HEAD) | WARIANT (tier 3+ = 50) | |
|---|---|---|---|
| `plasma_cores` | 0 | **50** (oba archetypy) | ✅ cel trafiony |
| `quantum_cores` | 0 | **3–9** | ✅ częściowo (limit: Nt) |
| towarów ≠ 0 | 14 | **15–16** | ✅ |
| towary na ZERZE | 11 | **9–10** | ✅ |
| stalle `missing_ingredient` | 0–1 | **1–4** | ⚠ wzrost |
| imperia bez placówki | **1/16** | **2/16** | ⚠ koszt |
| naruszenia progów | **39/96** | **41/96** | ⚠ koszt |
| budynki / POP AI (mediany) | 47 / 138 | 46 / 136 | ⚠ koszt |
| `warp_cores`, `military_supplies` | 0 | **0** | ⛔ bez zmian |

⚠ **Uczciwość co do kosztu:** różnice po stronie kosztu (1/16 → 2/16, 39 → 41) są **w granicach
szumu przy tej wielkości próby**. Są PRAWDOPODOBNE, nie dowiedzione. Gate musi je rozstrzygnąć na
większej próbie, zanim uznamy je za cenę.

⚠ **Uczciwość co do zysku:** zmiana **nie zamyka objawu zgłoszonego przez właściciela** —
`warp_cores` zostają na zerze, bo blokuje je Finding **181** (zdolność), nie priorytet.

## §3 Decyzje do podpisu

| # | decyzja | rekomendacja |
|---|---|---|
| **D1** | Gdzie zmiana: `startingSafetyStocks` archetypu (AI-only, dane) czy `getSafetyStockTarget` (globalne, **dotyka też gracza**)? | **archetyp** — izolacja od gracza jest warunkiem porównywalności z baseline'em |
| **D2** | Progi: pomysł właściciela to T1 → 300, T2 → 100, T3+ → 50. Zmierzone jest **wyłącznie T3+ = 50** | **wdrożyć T3+ = 50 teraz**, T1/T2 osobnym pomiarem — T1 z 30 na 300 to **10×** na warstwie, która dziś działa |
| **D3** | Bramka progu rudy (>20k, >5k dla Xe/Nt) — potrzebna, skoro AI ma ~200k rudy zawsze? | **TAK, ale nie jako optymalizacja.** Pomiar pokazał, że koszt spada na **ubogie** imperium (ekspansjonistę). Bramka jest **ochroną biednego**, nie przyspieszeniem bogatego — i to jest jej realne uzasadnienie |
| **D4** | Dopisywać towary **nieosiągalne technologicznie** dla danego archetypu? | **NIE** — zmierzony wzrost stalli `missing_ingredient` (0–1 → 1–4) to AI próbujące budować to, czego nie umie. Filtrować po planie technicznym archetypu |
| **D5** | `fuel` w mechanizmie? | **NIE** — Finding **180**: paliwa nie robi fabryka, tylko rafineria, której AI nie ma w katalogu budowlanym. Cel zapasu byłby popytem bez pokrycia |

## §4 Zakres

**W zakresie:** `startingSafetyStocks` obu archetypów AI (`EmpireArchetypeIndustrialist`,
`EmpireArchetypeExpansionist`), filtr osiągalności technicznej, opcjonalna bramka progu rudy (D3).

**Poza zakresem:** `getSafetyStockTarget` (globalna stała gracza) · progi T1/T2 (D2) · cokolwiek
z Findingu **181** (zdolność) i **180** (paliwo) · `DEFAULT_REACTIVE_ORDER` (kolejność priorytetów —
osobna oś, nie ruszamy jej razem z wartościami).

## §5 Gate

Panel **8 seedów × 45 gy** + `probe-ai-economy-health` (4 seedy) + `probe-ai-advanced-components`
(2 seedy), porównane z tabelą §2. Kryterium: zysk z §2 utrzymany, **a koszt ekspansyjny
rozstrzygnięty** — albo znika (był szumem), albo zostaje i wtedy jest ceną do świadomego przyjęcia.
⚠ Gate **nie może** mierzyć `warp_cores` — one nie ruszą się z tego slice'u i ich zero nie jest
porażką tej zmiany.
