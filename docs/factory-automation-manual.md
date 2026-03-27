# Automatyzacja Fabryk — Instrukcja Gracza

## Przegląd

System fabryk ma teraz **3 tryby pracy** (per kolonia). Przełączasz je w panelu Gospodarka (klawisz **E**), po wybraniu konkretnej kolonii w filtrze.

Pasek trybów pojawia się nad sekcją zarządzania:

```
[🔧 Manual]  [📋 Priorytet]  [🤖 Reaktywny]
```

---

## 🔧 Tryb MANUALNY (domyślny)

To jest **dotychczasowy system** — bez zmian. Gracz ręcznie:
- Alokuje FP do towarów przyciskami [+] / [−]
- Ustawia cele produkcji [+5] [+10] [+50] [∞]
- Zarządza kolejką [↑] [↓] [✕]
- Uruchamia nowe produkcje [▶] [+Q]

**Kiedy używać:** Na początku gry (1-2 fabryki) lub gdy chcesz pełną kontrolę.

---

## 📋 Tryb PRIORYTETOWY

### Jak to działa

Gracz tworzy **listę celów zapasowych** — system sam alokuje FP.

Każdy wpis na liście to:
- **Towar** (np. Ogniwa Energetyczne)
- **Cel zapasu** (np. 10 sztuk)

System automatycznie:
1. Sprawdza aktualny zapas każdego towaru
2. Wylicza deficyt (cel − zapas)
3. Przydziela FP od góry listy (wyższy priorytet = dostaje FP pierwszy)
4. Gdy cel osiągnięty (zapas ≥ cel) → przesuwa FP niżej na liście
5. Gdy zapas spada (bo coś zużyto) → automatycznie wznawia produkcję

### Lista priorytetów

```
 #  │ Towar               │ Zapas/Cel │ Status
────┼──────────────────────┼───────────┼──────────
 1  │ ⚡ Ogniwa Energetyczne│   3/10    │ ▶ produkuje
 2  │ 🔧 Stopy Konstrukcyjne│  8/8     │ ✓ cel osiągnięty
 3  │ 💻 Układy Elektroniczne│  1/5    │ ▶ produkuje
```

### Przyciski w wierszu

| Przycisk | Akcja |
|----------|-------|
| [−5] | Zmniejsz cel zapasu o 5 |
| [+5] | Zwiększ cel zapasu o 5 |
| [↑] | Przesuń wyżej (wyższy priorytet) |
| [↓] | Przesuń niżej (niższy priorytet) |
| [✕] | Usuń z listy |

### Dodawanie towarów

Kliknij **[+ Dodaj towar]** — rozwija się lista dostępnych towarów pogrupowanych po tierach. Kliknij **[+]** przy wybranym towarze aby dodać go na koniec listy (domyślny cel: 10).

### Szablony

Kliknij **[Szablony ▼]** aby zobaczyć predefiniowane zestawy:

| Szablon | Zawartość | Kiedy użyć |
|---------|-----------|------------|
| ⛽ Paliwo & Logistyka | power_cells:20, structural_alloys:15, conductor_bundles:10 | Przygotowanie floty |
| 🏗 Rozbudowa | structural_alloys:20, pressure_modules:10, electronic_systems:10, extraction_systems:5 | Budowa infrastruktury |
| 👥 Konsumpcja | basic_supplies:15, civilian_goods:10, neurostimulants:5 | Wzrost populacji |
| 🔬 Naukowo-Techniczny | electronic_systems:15, semiconductor_arrays:8, polymer_composites:5 | Badania |
| 🚀 Endgame | quantum_cores:5, antimatter_cells:3, warp_cores:1 | Późna gra |

Kliknij szablon → zastępuje aktualną listę. Potem możesz modyfikować.

**Zapis własnego szablonu:** Kliknij **[💾 Zapisz]** aby zapisać aktualną listę jako custom szablon (max 3).

### Auto-łańcuch składników

Najważniejsza cecha! Jeśli towar wymaga **innych towarów** jako składników, system sam je produkuje.

**Przykład:**
```
Chcesz: Systemy Napędowe (T3)
  Receptura: Ti:6, Xe:4, Hv:3, Cu:4, Li:2

System sprawdza — brak commodity składników w recepturze, produkuje bezpośrednio.
```

**Przykład z łańcuchem (T5):**
```
Chcesz: Rdzenie Warp (T5)
  Receptura: 2× Rdzenie Kwantowe + 2× Ogniwa Antymaterii + Ti:8

System sprawdza:
  Rdzenie Kwantowe na stanie: 0 (potrzeba 2) → BRAK
  Ogniwa Antymaterii na stanie: 0 (potrzeba 2) → BRAK

⛓ Auto-łańcuch:
  Rdzenie Kwantowe ×2 → auto-produkcja
  Ogniwa Antymaterii ×2 → auto-produkcja
  → Gdy składniki gotowe → FP wracają na Rdzenie Warp
```

Zasady auto-łańcucha:
- Rekurencyjny (max 3 poziomy w dół)
- Używa max **50% FP** (reszta na główne priorytety)
- Widoczny w sekcji "⛓ AUTO-ŁAŃCUCH" pod listą
- Tymczasowy — nie modyfikuje listy priorytetów

---

## 🤖 Tryb REAKTYWNY

### Jak to działa

Zero konfiguracji. System sam wykrywa co jest potrzebne i produkuje.

Skanuje **5 źródeł zapotrzebowania** w kolejności priorytetowej:

| # | Źródło | Co wykrywa | Przykład |
|---|--------|-----------|---------|
| 1 | 🏗 Budowa | Commodities potrzebne do budynków/statków w kolejce | Stocznię potrzebuje 4× Stopy Konstrukcyjne |
| 2 | ⛽ Paliwo | Power cells dla statków z < 50% paliwa | 3 statki w hangarze potrzebują 8 ogniw |
| 3 | 👥 Konsumpcja | Dobra konsumpcyjne na 5 lat | 4 POPy × 0.15/rok × 5 lat = 3 Zaopatrzenia |
| 4 | 📦 Handel | Eksportowane towary | Trade hub eksportuje structural_alloys |
| 5 | 🛡 Zapas min. | Minimalne zapasy (T1-T2: 3 szt, T3+: 1 szt) | electronic_systems < 3 |

### Panel reaktywny

```
ZAPOTRZEBOWANIE AUTOMATYCZNE

 Źródło       │ Towar                │ Potrzeba
──────────────┼──────────────────────┼──────────
 🏗 Budowa    │ 🔧 Stopy Konstrukcyjne│  2/4
 ⛽ Paliwo    │ 🔋 Ogniwa Energetyczne│  3/8
 👥 Konsumpcja│ 🔩 Zaopatrzenie Bytowe│  7/12
```

Panel jest **read-only** — gracz nie musi nic klikać. System sam zarządza produkcją.

Auto-łańcuch działa też w trybie reaktywnym (max 30% FP).

### Kiedy używać

- Kolonie poboczne (outposty, mniejsze kolonie)
- "Ustaw i zapomnij" — fabryka radzi sobie sama
- Środek/koniec gry gdy masz wiele kolonii

---

## Przełączanie trybów

| Z → Do | Co się dzieje |
|--------|---------------|
| Manual → Priorytet | Istniejące alokacje konwertowane na listę priorytetów |
| Priorytet → Reaktywny | Lista zachowana (wraca przy powrocie do Priorytetu) |
| Reaktywny → Manual | Aktualne alokacje zamrożone, gracz przejmuje kontrolę |
| Dowolny → Manual | Kolejka (_queue) zachowana |

Przełączenie jest natychmiastowe. Możesz zmieniać tryb w dowolnym momencie.

---

## Zalecana strategia

| Faza gry | Fabryki | Tryb |
|----------|---------|------|
| Wczesna (1-2 FP) | 1 fabryka | Manual — mało towarów |
| Średnia (3-5 FP) | Kilka fabryk | Priorytet + szablon "Rozbudowa" |
| Multi-kolonia | Wiele kolonii | Priorytet na głównej, Reaktywny na reszcie |
| Endgame (8+ FP) | Pełna infrastruktura | Priorytet z auto-łańcuchem (cel: warp_cores) |

---

## FAQ

**P: Czy mogę wrócić do trybu manualnego?**
O: Tak, w każdej chwili. Kliknij [🔧 Manual]. Aktualne alokacje zostaną.

**P: Co się stanie z kolejką przy zmianie trybu?**
O: Kolejka jest zachowana. W trybach auto jest ignorowana (system sam zarządza), ale wraca gdy przełączysz na Manual.

**P: Auto-łańcuch produkuje za dużo składników?**
O: Nie — produkuje dokładnie tyle ile potrzeba. Max 50% FP (priorytet) lub 30% FP (reaktywny) na łańcuch.

**P: Tryb reaktywny nie produkuje tego co chcę.**
O: Reaktywny reaguje na realne zapotrzebowanie. Jeśli chcesz konkretny towar — użyj Priorytetu.

**P: Szablony nadpisują moją listę?**
O: Tak — zastępują aktualną listę. Możesz potem modyfikować. Zapisz swoją listę jako custom szablon przed załadowaniem innego.
