# Obraz Operacyjny — mini-arc „Polish + Rejestr 2.0" — playtest-checklista

**Commity:** `ce7d27b` (2h tiki ekranowe) · `8cd7895` (3e pełna szerokość+grupowanie) ·
`948564b` (3f wraki+kontakty) · 3g (mapa 2D za `FEATURES.commandTacticalMap`, default OFF)
> Auto: smoke fleetpicture 83/83 · fleet_registry 50/50 · tactical 41/41 · map_labels 52/52.
> Decyzja arca: rejestr NIE wydaje rozkazów (monitoring+selekcja; „Przypisz (N)" jedyną akcją zbiorczą).

## A. Tiki ruchu (2h) — kryterium akceptacji

- [ ] **Pełne kadrowanie układu** (H): chevrony ➤ i etykiety `+N` przy planetach CZYTELNE
      (daleki zoom → mniej tików, większe).
- [ ] **Zbliżenie na planetę**: tiki gęstsze (`+1/+2/+3`), mniejsze, nie zasłaniają planety.
- [ ] Znacznik `⏱rok` celu zaznaczonego statku czytelny przy obu skrajnych zoomach.

## B. Rejestr 2.0 (3e)

- [ ] Widok REJESTR zajmuje pełną szerokość (bez lewej listy); prawy panel szerszy (300 px) —
      teksty w panelu statku/floty nie ucinają się dziwnie.
- [ ] „grupuj: ⚑ flota" → nagłówki flot z licznikami + „Bez floty" na końcu; ▸/▾ zwija;
      sort kolumną działa WEWNĄTRZ grup; filtry i szukajka współdziałają z grupami.
- [ ] **Klik nagłówka floty → prawy panel floty** (rename/disband/rozkazy Move/Engage działają
      — picker na mapie 3D po zamknięciu overlaya).
- [ ] Oś czasu pokazuje te same wiersze co tabela (zwinięta grupa znika też z osi).

## C. Wraki i kontakty (3f)

- [ ] Chip „💀 WRAKI ×N" (domyślnie wyłączony) → wiersze wraków: 💀, własny/wrogi, układ, `☠ rok N`.
- [ ] **Klik wraku → prawy panel z raportem bitwy** (rok, A vs B, wynik; bez rekordu → komunikat).
- [ ] Chip „👁 KONTAKTY ×N" → wróg CONTACT+ = pełny wiersz read-only; **RUMOR = anonimowy „?"**
      (bez roli/stanu); na kontaktach ZERO akcji (klik nic nie robi, brak checkboxa/🎯).
- [ ] Intencje wroga (zadanie/ETA/paliwo) NIGDY niewidoczne w rejestrze.

## D. Sesja z MAPĄ OFF (3g — okres próbny deprecjacji)

- [ ] `commandTacticalMap` OFF (default): SYSTEM TACTICAL otwiera się WPROST w rejestrze
      pełnej szerokości; przełącznika [MAPA] nie ma; **czy czegoś brakuje w codziennej grze?**
      (notuj braki — lista przed decyzją o kasowaniu kodu w weryfikacji §10.3).
- [ ] Klawisz K → rejestr z włączonym chipem 💀 (zamiast sekcji lewej listy).
- [ ] Chip 🌀 tranzytu na mapie 3D → rejestr z prefiltrem tranzytu.
- [ ] Znany brak (świadomy): w pickerze celu misji („Wyślij") nie ma już klik-w-mapę-2D —
      cel wybiera się z LISTY prawego panelu. Przeszkadza? → zgłoś (kandydaci w §10.3).
- [ ] Flaga ON → mapa 2D + lewa lista + przełącznik wracają 1:1.
