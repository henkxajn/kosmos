# Obraz Operacyjny — Faza 2 (tryb taktyczny Y) — playtest-checklista

**Data:** 2026-07-18 · **Commity:** `d7cb300` (2a kamera) · `34f71ce` (2b kontroler+Y+badge) ·
`ac50bd8` (2c glify) · `1aa5844` (2d duchy ETA+dim) · `f89d04b` (2e profil tactical etykiet) + fix exit-sync
**Flaga:** `FEATURES.tacticalMode` (ON) · klawisz **Y** (T zajęty — decyzja weryfikacji §3.2)

> Auto-weryfikacja: smoke `tmp_tactical_mode_smoke.mjs` 28/28 · `tmp_fleet_map_labels` 52/52 ·
> regresje fleetpicture 81/81, map_labels 37/37. Live-gate CC (Power Test): Y → top-down (phi
> 1.1→0.12 lerp), badge, glify ×2, duchy ×2 na końcach tras, dim ON, chip „◉ KOI-9208 ×5 ⚠2";
> wyjście → restore sensor/dim/dist + sprzątnięcie glifów/duchów/modeli natychmiast (0/0/0).

## A. Wejście / wyjście (OBOWIĄZKOWE wg dyspozycji)

- [ ] **Y włącza tryb w < 1 s bez przeładowań**: płynny przelot kamery do rzutu z góry (bez skoku),
      badge „⬢ TRYB TAKTYCZNY [Y]" na górze; ponowne Y = płynny powrót.
- [ ] **Pełny restore kamery**: po wyjściu kąt/zoom/cel DOKŁADNIE jak przed wejściem (także po
      obróceniu kamery W trybie — drag działa i przerywa animację, restore wraca do stanu sprzed Y).
- [ ] **Pełny restore warstw**: radar (sensor ringi) wraca do stanu sprzed trybu (sprawdź oba
      przypadki: radar był WYŁ i był WŁ); prediction cones bez duplikatów; glify znikają, modele
      GLB statków wracają natychmiast.
- [ ] Otwarcie DOWOLNEGO overlaya (F/E/C/…) w trybie → tryb sam się wyłącza i wszystko wraca.

## B. Symbolika (glify)

- [ ] Statki jako płaskie glify o STAŁYM rozmiarze ekranowym (zoom in/out nie zmienia rozmiaru na
      ekranie); kształt wg roli (□ transport/cargo · △ bojowy · ◇ nauka · ○ zwiad · ⬠ kolonizacyjny).
- [ ] Kolor glifu własnego = stan (idle szary · ruch cyan/info · misja zielony · alert bursztyn ·
      walka czerwony); wróg = kolor frakcji; wróg RUMOR = „?" (rola ukryta do contact).
- [ ] **dim × intelOpacity na wrogu w echo (OBOWIĄZKOWE)**: wróg w stanie rumor/echo zachowuje
      swoją intel-przezroczystość glifu, a przygaszenie planet go NIE dotyka (materiały statków
      nietykane przez dim).
- [ ] Selekcja/box-select/PPM na glifach = IDENTYCZNE zachowanie jak poza trybem (te same kanały;
      celowanie w glif ≥ tak łatwe jak w model).

## C. Duchy ETA

- [ ] Każdy WŁASNY statek w locie ma półprzezroczysty glif-outline w punkcie celu + `⏱rok`.
- [ ] Pursue/intercept (cel ruchomy) → `~rok` + pulsowanie; zwykły lot → stały `⏱rok`.
- [ ] Wrogowie NIE mają duchów (intencje wroga niejawne). Skala/czytelność duchów OK? (knob:
      rozmiar w `_upsertTacticalGhost`, 0.8/0.6 × distFactor — zgłoś jeśli za małe/duże).

## D. Warstwy i kosmetyka

- [ ] W trybie: sensor ringi + prediction cones + linie tras/rozkazów + POI widoczne naraz.
- [ ] Planety/księżyce/orbity przygaszone (0.35/0.5), gwiazda celowo jasna (punkt orientacyjny);
      po wyjściu pełna jasność wraca 1:1.
- [ ] Etykiety: profil tactical — KAŻDY własny statek ma plakietkę z aktywnością i mini-ETA
      (`△ Nazwa · Pościg · ~57`); po wyjściu wraca profil light (tylko floty/alerty/wybrany).

## E. Scenariusz spójności (OBOWIĄZKOWY): tryb Y → chip-switch → spójność

- [ ] W trybie Y kliknij chip INNEGO układu → mapa przełącza się, tryb POZOSTAJE aktywny:
      top-down, dim świeżej sceny, glify statków tamtejszego układu (jeśli są), badge dalej wisi.
- [ ] Chip powrotny do macierzystego → glify/plakietki/duchy wracają (mechanizm 1e).
- [ ] Wyjście z trybu PO takiej wędrówce → kamera wraca do widoku sprzed WEJŚCIA (w układzie,
      w którym jesteś teraz — kadr układu; sprawdź czy nie ma dziwactw).

## F. Koszty i przełączniki

- [ ] `FEATURES.tacticalMode=false` → Y martwy, zero śladów trybu, zero kosztów w pętli.
- [ ] Brak spadku FPS w trybie przy ~20 statkach (glify per-frame; budżet ≤ 2 ms).
- [ ] Save/load: tryb NIE jest persystowany (świeża sesja startuje poza trybem) — zgodnie z
      render/UI-only; save sprzed zmian wczytuje się bez migracji (v90).

## Znane ograniczenia v1 (świadome)

- Gwiazda nie jest przygaszana (shader-materiały; jasne centrum = orientacja). Zgłoś, jeśli razi.
- Duchy ETA tylko dla misji z fizycznym celem (`targetX/Y`); rozkazy pursue/intercept bez punktu
  docelowego nie mają ducha (cel ruchomy — ETA na plakietce `~rok`).
- Szybkie Y-Y-Y w trakcie przelotu: snapshot bierze CEL animacji (nie klatkę przejściową) — restore
  zawsze do prawdziwego widoku sprzed trybu.
- Sprite-fallback statków (GLB nie wczytał się) zostaje widoczny pod glifem (rzadkie, nieszkodliwe).
