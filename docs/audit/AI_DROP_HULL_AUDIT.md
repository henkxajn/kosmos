# AUDYT — czy istnieje szablon kadłuba AI zdolny do desantu?

**Data:** 2026-08-18 · **Zakres:** read-only. Zero zmian w kodzie, zero migracji.
**Powód:** GATE 3 (W3, WOJNA I POKÓJ) utknął na §2 L5 — `spawnEnemyRaider` zwraca
`no_drop_capable_hull` dla `frigate_laser_escort`.
**Metoda:** odczyt źródeł + **wykonanie** `resolveTemplate` na pełnym katalogu (headless,
`GameCore`), z tech-predykatem otwartym na maksa i archetypem `xenophage`.

---

## WERDYKT (jednym zdaniem, na początku)

> **AI nie ma dziś ŻADNEJ ścieżki do kadłuba desantowego, ponieważ w katalogu szablonów AI
> (`SHIP_TEMPLATES`) nie istnieje ani jeden wpis zawierający `troop_bay_*` lub `drop_pods` —
> potrzebna zmiana w `src/data/ShipTemplateData.js` (nowy szablon roli transportowej).**

To **nie** jest kwestia techu, archetypu ani białej listy w dźwigni: żaden z tych mechanizmów
nawet nie zostaje uruchomiony, bo nie ma czego rozwiązywać. Kadłub gracza `Troop Transport Warp I`
żyje w **innym magazynie** (`window.KOSMOS.unitDesigns`), którego `resolveTemplate` nie widzi.

---

## 1. KATALOG SZABLONÓW

**Plik:** `src/data/ShipTemplateData.js` · **obiekt:** `export const SHIP_TEMPLATES` (`:71`).
**Czytany przez:** `resolveTemplate(templateId, ctx)` — `src/utils/ShipTemplateResolver.js:131`:

```
const catalog = ctx.catalog ?? SHIP_TEMPLATES;
```

⚠ To jedyne domyślne źródło. Pozostali konsumenci tej samej stałej: `DirectorProduction.matchTemplateId`
(`:66`) i `validateTemplateCatalog` (`:256`). **Nikt nie podaje `ctx.catalog` w ścieżce produkcyjnej
ani debugowej**, więc w praktyce katalog AI = `SHIP_TEMPLATES`.

### Pełna zawartość katalogu (zmierzona wykonaniem)

| templateId | rola | hullTiers | sloty (drabinki) | `troop_bay_*`? | `drop_pods`? |
|---|---|---|---|---|---|
| `frigate_laser_escort` | warship | `hull_frigate`, `hull_small` | `engine_warp` · `warp_tank` · `armor_heavy` *(opc)* · `weapon_laser` | ❌ | ❌ |
| `frigate_missile_escort` | warship | `hull_frigate`, `hull_small` | `engine_warp` · `warp_tank` · `armor_heavy` *(opc)* · `weapon_missile` | ❌ | ❌ |
| `frigate_system_defender` | warship | `hull_frigate`, `hull_small` | `engine_warp` · `armor_heavy` *(opc)* · `weapon_missile` · `weapon_missile` | ❌ | ❌ |
| `science_probe` | science | `hull_small` | `engine_fusion｜engine_ion｜engine_chemical` · `science_lab` | ❌ | ❌ |

### Szablony mające JEDNOCZEŚNIE `troop_bay_*` i `drop_pods`

**ŻADEN.** Co więcej — **żaden szablon nie ma nawet JEDNEGO z tych modułów.** Katalog liczy
**4 wpisy** i wszystkie są bojowe albo naukowe. Nie ma roli transportowej/desantowej w ogóle.

*(Wymagania „techSystem / archetype-restricted / hullId bazowy" dla takich szablonów są
bezprzedmiotowe — nie ma dla czego ich wypisywać.)*

### Kontekst: moduły desantowe ISTNIEJĄ i mają zwykłe wymagania

| moduł | `requires` | `stats` |
|---|---|---|
| `troop_bay_s` | `ground_warfare` | `troopCapacity: 3` |
| `troop_bay_m` | `ground_warfare` | `troopCapacity: 8` |
| `troop_bay_l` | `fleet_logistics` | `troopCapacity: 16` |
| `drop_pods` | `ground_warfare` | `enablesPlanetLanding: true` |

Czyli **brakuje wyłącznie WPISU KATALOGOWEGO**, nie mechaniki: moduły, kadłuby i pojemności są na
miejscu. Dla porządku pojemności (bucket `utility` przyjmuje `troop_bay_*` i `drop_pods`):
`hull_medium` = 2 propulsion + 4 utility, `hull_large` = 3 + 6, `hull_frigate` = 1 + 3.

---

## 2. DOSTĘPNOŚĆ DLA AI

### Odpowiedź: NIE — i to nie z powodu techu

Wykonane dla archetypu `xenophage` z predykatem `isResearched: () => true` (**wszystko
odblokowane** — czyli warunki maksymalnie korzystne dla AI):

| templateId | `ok` | rozwiązane moduły | desantowy? |
|---|---|---|---|
| `frigate_laser_escort` | ✅ true | `engine_warp, warp_tank, armor_heavy, weapon_laser` | **nie** |
| `frigate_missile_escort` | ✅ true | `engine_warp, warp_tank, armor_heavy, weapon_missile` | **nie** |
| `frigate_system_defender` | ✅ true | `engine_warp, armor_heavy, weapon_missile, weapon_missile` | **nie** |
| `science_probe` | ✅ true | `engine_fusion, science_lab` | **nie** |

**Wszystkie cztery szablony rozwiązują się POPRAWNIE** — problem nie leży w odmowie resolvera.
Po prostu **żaden z nich nie zawiera modułu desantowego**, więc powstały z nich kadłub ma
`canDropTroops === false` i `troopCapacity === 0`, co bramka W3-6 słusznie odrzuca jako
`no_drop_capable_hull`.

### Powód odmowy dla „najbliższego kandydata"

Nie istnieje kandydat, który by odmówił — **istnieje brak kandydata**. Gdyby podać
`spawnEnemyRaider({ templateId: 'troop_transport' })` (albo nazwę projektu gracza, np.
`'Troop Transport Warp I'`), ścieżka kończy się na:

```
resolveTemplate → { ok: false, reason: 'unknown_template' }
spawnEnemyRaider → { success: false, reason: 'template_unresolved', detail: 'unknown_template' }
```

`RESOLVE_REASONS` ma cztery wartości (`unknown_template`, `no_hull`, `no_module`, `no_capacity`) —
tu w grę wchodzi **wyłącznie pierwsza**.

### Archetyp `xenophage` niczego nie dokłada

`_applyArchetype` (`ShipTemplateResolver.js:109`) scala `tpl.archetypeOverrides[archetype]`.
**W całym katalogu nie ma ani jednego `archetypeOverrides`** — istnieją tylko wzmianki w komentarzu
dokumentacyjnym (`ShipTemplateData.js:13`, `:43`). Archetyp jest więc dziś przelotką.

### Stan techu imperium — sprawdzalny, ale NIEISTOTNY dla tego wyniku

Odpowiedź nie zależy od techu: brak wpisu w katalogu bije każdą konfigurację badań. Gdybyś mimo to
chciał zobaczyć stan `emp_test_enemy` na swoim zapisie, jednolinijkowiec (ta sama ścieżka co
`KOSMOS.debug.aiWarships`):

`(c => c && ['ground_warfare','fleet_logistics','point_defense','exploration'].map(t => [t, !!c.techSystem?.isResearched?.(t)]))(KOSMOS.directorProduction.capitalOf('emp_test_enemy'))`

⚠ **Nie mogłem tego odczytać za Ciebie** — to stan Twojego zapisu w przeglądarce; audyt mierzył
katalog i resolver, które są takie same w każdej partii.

---

## 3. ŚCIEŻKA `spawnEnemyRaider` — czy jest biała lista?

**NIE.** `src/debug/SpawnTestEnemy.js`, `spawnEnemyRaider(opts)`. Kolejność bramek przed
`resolveTemplate`:

1. `civMode` → `no_civ_mode`
2. `vesselManager` / `homePlanet` → `no_deps`
3. właściciel: jawny `empireId` → przeciwnik aktywnej wojny → `TEST_ENEMY_ID`;
   nieznane imperium → `unknown_empire`
4. układ: jawny `systemId` → najbliższy inny niż macierzysty; układ gracza → `system_is_player_home`
5. **`const templateId = opts.templateId ?? 'frigate_laser_escort';`** → `resolveTemplate(templateId, { isResearched: () => true })`

**Żadnego filtrowania po nazwie, żadnej puli roamerów, żadnego early-return na `templateId`.**
Dowolny identyfikator przechodzi wprost do resolvera; jedynym kryterium jest **obecność w
`SHIP_TEMPLATES`**. Dodatkowo dźwignia woła resolver z **otwartym techem** (`() => true`), więc
nawet gate techowy nie jest tu przeszkodą.

⚠ Warto odnotować: dźwignia **sprawdza kontrakt po fakcie** i przy szablonie bez baku warp
raportuje `warpCapable: false` z głośnym błędem. Analogicznego sprawdzenia dla zdolności
DESANTOWEJ nie ma — bo do dziś nie było czego sprawdzać.

---

## 4. GDZIE JEST KADŁUB GRACZA (i dlaczego AI go nie widzi)

Dwa **rozłączne** magazyny, bez żadnego mostka:

| | magazyn | kto czyta | persystencja |
|---|---|---|---|
| **Gracz** | `window.KOSMOS.unitDesigns[]` | `ShipyardOverlay:278`, `StationManagementView:220`, `StationSystem:332` | `civ4x.unitDesigns` (`SaveSystem:217`) |
| **AI** | `SHIP_TEMPLATES` (stała w kodzie) | `resolveTemplate`, `DirectorProduction` | brak — dane statyczne |

`Troop Transport Warp I` (troop_bay_l ×2 + drop_pods ×2) leży w **pierwszym**.
`resolveTemplate` czyta **drugi** i nigdy nie dostaje `ctx.catalog`, więc projekty gracza są dla
AI **niewidoczne z konstrukcji**. To rozdzielenie wygląda na zamierzone (projekty gracza są
elementem jego rozgrywki, nie danymi świata), ale skutek jest taki, że **udany projekt gracza nie
staje się automatycznie zdolnością AI**.

---

## 5. WERDYKT I NAJMNIEJSZA ZMIANA, KTÓRA GO ODWRACA

> **AI nie ma dziś żadnej ścieżki do kadłuba desantowego, ponieważ `SHIP_TEMPLATES` nie zawiera
> szablonu z `troop_bay_*` + `drop_pods` — potrzebna zmiana w `src/data/ShipTemplateData.js`.**

Czego **NIE** trzeba ruszać (zmierzone, nie założone):
- ❌ `spawnEnemyRaider` — nie ma białej listy, przyjmie każdy istniejący `templateId`;
- ❌ `resolveTemplate` — rozwiązuje poprawnie wszystkie cztery obecne wpisy;
- ❌ moduły i kadłuby — `troop_bay_s/m/l` i `drop_pods` istnieją, mają zwykłe `requires`,
  a `hull_medium`/`hull_large` mają dość gniazd `utility`;
- ❌ bramka W3-6 — `no_drop_capable_hull` jest **poprawną** odpowiedzią na obecny stan katalogu.

Czego trzeba: **jednego wpisu katalogowego roli transportowej** (kadłub z zapasem gniazd `utility`,
sloty `troop_bay_*` i `drop_pods` jako `required`, `requires: ground_warfare` na module załatwia
bramkę techu). ⚠ To jest decyzja **projektowa właściciela**, nie mechaniczna: nowy szablon zmienia
to, co AI potrafi zbudować, więc powinien powstać razem z rozstrzygnięciem, czy transportowiec
wchodzi do produkcji AI (`DirectorProduction`, drabina nacisku L1/L2) czy tylko do dźwigni
debugowej.

---

## Konsekwencja dla GATE 3 (do decyzji właściciela, nie zmiana)

§2 checklisty jest **nieprzechodni w części desantowej**, dopóki katalog nie ma transportowca:
`no_drop_capable_hull` to dziś jedyna możliwa odpowiedź dla każdego szablonu AI. Reszta §2
(dominacja, ślad audytu, odmowa z powodem) jest sprawdzalna od ręki, a **§§3-5 wymagają
wylądowanego wojska** — więc bez wpisu katalogowego GATE 3 domknie się co najwyżej warunkowo.
Alternatywą jest przejście §§3-5 na desancie wywołanym inną drogą (np. istniejącą ścieżką
`launchInvasion` z dźwigni debugowej), co sprawdzi WIDOCZNOŚĆ i ODWRACALNOŚĆ, ale nie sprawdzi
łańcucha „bitwa → desant" end-to-end.
