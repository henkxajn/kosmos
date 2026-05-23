# KOSMOS — Tech Debt Notes: AI Colony UI Side Effects

## Status

Wykryte podczas Slice 1 Fazy 1, do naprawienia w późniejszym slice
(prawdopodobnie Slice 3 lub osobny "AI polish" sprint).

## Problem 1 — Aktywacja kolonii AI w UI wpływa na grę

Gdy gracz klika na kolonię AI w widoku 3D, gra wykonuje
`_setActiveColony(aiColony)` które ustawia `window.KOSMOS.buildingSystem`,
`resourceSystem`, `civSystem`, `factorySystem` na instancje kolonii AI.

To powoduje:
- Reaktywne handlery `civ:popBorn`, `civ:popDied` przepuszczają guard
  `window.KOSMOS.X !== this`
- `BuildingSystem._reapplyAllRates()` wywołane dla kolonii AI
- Kolonia AI dostaje "reanimację" cached'owanych rates

Konsekwencja widoczna w testach: kolonia AI obserwowana przez gracza
żyje, kolonia AI nie obserwowana umiera. To łamie immersję
("AI to żywy sąsiad") i powoduje że gameplay zależy od tego czy
gracz kliknie planet AI w UI.

## Problem 2 — Eventy kolonii AI mogą być widoczne dla gracza

Po aktywacji kolonii AI, gracz może zobaczyć w UI:
- Alerty BROWNOUT dla kolonii AI
- Aktywne fabryki kolonii AI
- Listy budynków kolonii AI
- Inne eventy specyficzne dla aktywnej kolonii

To psuje immersję i wycieka informacje które powinny być za fog of
war / intel level.

## Propozycje rozwiązania (do dyskusji w przyszłości)

A. Separacja "active for view" vs "active for gameplay"
   `window.KOSMOS.viewedColony` (UI rendering) i
   `window.KOSMOS.activeColony` (gameplay events).
   Klik kolonii AI: `viewedColony` zmienia się, `activeColony` NIE.

B. Flag `isPlayerOwned` zamiast guarda na pojedynczą instancję
   Zamiast `window.KOSMOS.buildingSystem !== this` używać
   `this._isPlayerOwned !== true`.

C. Dual rendering mode
   UI ma osobne widoki: "Moja Kolonia" i "Wywiad" (intel-filtered).
   Klik kolonii AI nie przełącza active colony.

## Powiązane bugi naprawione w Slice 1 Faza 1

- Brownout w kolonii AI gdy gracz nie patrzy — workaround przez
  `EmpireColonyMaintenance` tick (Patch v4)
- W Fazie 2 workaround zastąpi `ColonyAutoPlanner._reapplyAllRates`
  co tactical tick

## Kiedy to naprawić

Nie w Slice 1. Rozważyć w Slice 3 (handel z AI) lub najpóźniej
Slice 4 (inwazja).
