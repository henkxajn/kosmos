# 🎯 Test flow — Walka hex stack (Victoria 2 style)

Dokument krok-po-kroku jak przetestować system walki hex stack po wdrożeniu Victoria 2 combat (commit `67d613a+`).

---

## Krok 1 — Załaduj grę

1. Odśwież stronę (**F5**) — załaduje najnowszy kod
2. Kontynuuj save LUB Nowa gra (Boosted)
3. Otwórz konsolę przeglądarki (**F12** → zakładka **Console**)

---

## Krok 2 — Ustaw siły gracza (konsola)

```js
// Odblokuj techy militarne (koszary, broń, logistyka)
KOSMOS.debug.unlockTech()

// +5000 wszystkich surowców i commodities
KOSMOS.debug.giveAll(5000)

// +20 POP (na wypadek braku)
KOSMOS.debug.givePop(20)

// Spawn wrogiego imperium na najbliższym wolnym ciele
KOSMOS.debug.spawnTestEnemy()
```

Konsola pokaże:
```
[SpawnTestEnemy] ✓ Wróg spawniony: { target: 'Glacius', targetId: 'p_3', marines: [...], ... }
```

**Zapamiętaj `targetId`** (np. `p_3`) — pojawi się też w lewym panelu jako „wrog".

---

## Krok 3 — Otwórz mapę własnej planety

- Klawisz **C** lub klik ikony kolonii w lewym panelu
- Widzisz hex grid z budynkami + (jeśli były) jednostkami

---

## Krok 4 — Spawn własnych jednostek (szybko, pomija koszary)

```js
// 3 piechoty obok stolicy
KOSMOS.debug.spawnMyUnit('shock_infantry', 0, 0)
KOSMOS.debug.spawnMyUnit('shock_infantry', 1, 0)
KOSMOS.debug.spawnMyUnit('shock_infantry', 2, 0)

// Artyleria do testowania support fire
KOSMOS.debug.spawnMyUnit('rocket_artillery', 0, 2)

// (opcjonalnie) medyk
KOSMOS.debug.spawnMyUnit('medic_unit', 1, 2)
```

**Dostępne archetypy:**
- `shock_infantry` — piechota szturmowa (counter: garrison)
- `rocket_artillery` — artyleria range 4, support fire
- `garrison_unit` — garnizon mobile/deployed
- `aa_platform` — AA range 2 (counter: recon_drone)
- `medic_unit` — medyk (nie atakuje, priorytet celu dla wroga)
- `recon_drone` — dron stealth
- `ground_supply_unit` — jednostka zaopatrzeniowa

Jeśli (0,0) jest poza mapą, użyj współrzędnych które widzisz przy hover na tile.

---

## Krok 5 — Opcje wysłania sił na planetę wroga

### A: Pełny flow z desantem (statek + orbit + drop)
1. Zbuduj w stoczni: **Kadłub Duży + troop_bay_l + drop_pods + engine_chemical×3 + fuel_tank_large**
2. W panelu statku: **🪖 Załaduj wojsko** → zaznacz → Załaduj
3. **⊙ Leć i orbituj** → wybierz planetę wroga
4. Poczekaj aż status = **Na orbicie**
5. **⚔ Zrzuć wojska** → modal → Zrzuć
6. Overlay wrogiej planety się otwiera
7. Klik dowolny hex:
   - Ocean → blokada
   - Pusty → drop OK
   - Wrogi → drop z **−25% HP** (chaotyczne lądowanie pod ogniem)
   - Własny → **stack up** (wiele jednostek na hexie)

### B: Szybki spawn bezpośrednio na wrogiej planecie
```js
// Zamień 'p_3' na ID wroga z outputu spawnTestEnemy
const enemyId = 'p_3'

KOSMOS.debug.spawnMyUnit('shock_infantry', 0, 0, enemyId)
KOSMOS.debug.spawnMyUnit('shock_infantry', 1, 0, enemyId)
KOSMOS.debug.spawnMyUnit('rocket_artillery', 2, 0, enemyId)

// Otwórz mapę wrogiej planety
KOSMOS.overlayManager.openPanel('colony', { colonyId: enemyId })
```

---

## Krok 6 — Co widać na mapie

- **Wrogie jednostki** (czerwone) przy capital [WRÓG]
- **Twoje jednostki** (niebieskie) tam gdzie spawn
- **Badges** (kropki z liczbą) na hexach z ≥2 jednostkami
- **⚔ czerwone pulsujące** na contested hexach (bitwa trwa)

---

## Krok 7 — Ruch do bitwy

1. Zaznacz własną piechotę (klik na sprite)
2. W panelu po prawej: stats + przyciski
3. Klik na hex z wrogiem → jednostka rusza
4. Gdy dotrze: **⚔** na hexie, licznik stacka P×1 E×3

---

## Krok 8 — Obserwuj bitwę (automatyczna)

Co 1 civYear („doba"):
- Symultaniczny ogień obu stron
- HP bars tików w dół
- Jednostka z HP ≤ 0 → sprite znika
- Jednostka z morale ≤ 20 → auto-retreat na sąsiedni hex
- Bitwa trwa aż jedna strona wyczyści hex

**Prędkość gry**: zwiększ do 1rok/s albo 10lat/s żeby szybciej zobaczyć rundy (skrót `4` lub `5`).

---

## Krok 9 — Support fire (artyleria z dystansu)

1. Zaznacz `rocket_artillery` — **NIE** na contested hexie, w zasięgu 4 hexów od bitwy
2. Panel jednostki pokazuje **🎯 Wesprzyj bitwę** (jasnoniebieski)
   - Jeśli „🎯 Brak bitew w zasięgu" → przesuń artylerię bliżej
3. Klik → flash „🎯 Wybierz contested hex w zasięgu"
4. Klik na hex z ⚔ → flash „🎯 Wsparcie bitwy (q,r)"
5. **Cyan przerywana linia** od artylerii do bitwy
6. Co runda artyleria dodaje dmg do strat wroga
7. Anulowanie: zaznacz artylerię → **✕ Cofnij wsparcie**
8. **Esc** anuluje tryb wyboru

---

## Krok 10 — Disengagement penalty

1. Zaznacz własną jednostkę na contested hex
2. Panel: **„⚔ W BITWIE"** + ostrzeżenie „Ruch = odwrót z −25% HP"
3. Klik na hex bez wroga → flash **„💔 Odwrót: −XX HP"**
4. HP spada o 25% (floor 1, nie zabija), ruch kontynuuje

---

## Krok 11 — Terrain bonus

Defender bonus per teren:

| Teren | Bonus |
|---|---|
| Góry ⛰ | +25% |
| Las 🌲, Krater ☄ | +15% |
| Wulkan 🌋 | +10% |
| Tundra 🧊 | +5% |
| Równina 🟢, Pustkowia 🌑 | 0% |
| Pustynia 🏜 | −5% |
| Lód ❄ | −10% |

Walcz na górach/lesie — twoja jednostka bierze mniej dmg.

---

## Krok 12 — Target priority (info)

Każdy atakujący wybiera cel niezależnie, scoring:

- **+100** counter-archetype (shock_infantry → garrison, aa_platform → drone)
- **+50** support role (medyk — zabić pierwszy!)
- **+50** supplier (zaopatrzeniowiec)
- **+40** scout
- **+30** low HP (< 30% — dobicie)
- **+20** ranged role (artyleria kontra artyleria)
- **−30** ciężki pancerz (ac > dmg × 1.5, pomiń)
- **+0-5** jitter (losowanie remisów)

---

## Cheat szybkiej pomocy

```js
// Pakiet militarny techów
KOSMOS.debug.unlockTech()

// Zasoby
KOSMOS.debug.giveAll(5000)
KOSMOS.debug.giveResearch(50000)
KOSMOS.debug.giveCredits(10000)
KOSMOS.debug.givePop(20)

// Wróg testowy
KOSMOS.debug.spawnTestEnemy()

// Spawn jednostki (domyślnie homePlanet, opcjonalnie planetId)
KOSMOS.debug.spawnMyUnit('shock_infantry', q, r, planetId?)

// Otwieranie overlay dowolnej kolonii
KOSMOS.overlayManager.openPanel('colony', { colonyId: 'p_3' })
```

---

## Weryfikacja funkcji (checklist)

- [ ] Brak przycisku ATAKUJ w panelu jednostki
- [ ] Ruch na hex z wrogiem → automatyczna bitwa
- [ ] Stack: 2+ jednostek na jednym hexie OK
- [ ] ⚔ pulsujące na contested hexach
- [ ] Badge liczników (P×N / E×N) na stackach
- [ ] Support fire działa — cyan linia + dodatkowy dmg
- [ ] Esc anuluje support mode
- [ ] Disengagement penalty −25% HP działa
- [ ] Terrain bonus (góry) zmniejsza dmg na obrońcach
- [ ] Morale ≤ 20 → auto-retreat
- [ ] Drop desantu na wroga = penalty HP, nie zniszczenie
- [ ] Drop desantu na własny hex = stack OK

Jeśli coś nie działa → sprawdź commit `0ac1112` lub nowszy w git log.
