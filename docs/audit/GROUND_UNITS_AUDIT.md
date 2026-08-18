# AUDYT — jednostki desantowe AI vs gracza (pełny łańcuch)

**Data:** 2026-08-18 · **Zakres:** read-only. Zero zmian w kodzie.
**Powód:** GATE 3 potwierdził żywy desant AI (`gu_42`, `type: 'infantry'`, `owner: 'emp_test_enemy'`).
Właściciel chce wiedzieć, czym ta jednostka różni się od tego, co ma gracz — przed decyzją
o W3-10 / slice GROUND.
**Metoda:** odczyt źródeł + **wykonanie** (`GameCore`): stworzenie obu rodzajów jednostki obok
siebie i porównanie pole po polu.

---

## WERDYKT (na początku)

> **Jednostki archetypowe ISTNIEJĄ, są kompletne i to ICH używa gracz — siedem archetypów
> z bronią, rolami, zdolnościami, morale, zaopatrzeniem i bramkami koszar/techu.
> Nie trzeba niczego projektować od zera.** Problemem nie jest brak modelu, tylko to, że
> **desant AI używa RÓWNOLEGŁEGO, starszego modelu (`GROUND_UNITS`)**, który ma inne statystyki,
> nie ma morale ani zaopatrzenia — i przez to zachowuje się inaczej niż cokolwiek, co widzi gracz.

⚠ **I to nie jest kosmetyka.** Zmierzone: legacy `infantry` AI ma **60 HP / 12 atak**, a
archetypowa `shock_infantry` gracza **15 HP / 7 atak** — czyli najeźdźca ma **4× wytrzymałości**
i **~1,7× siły** jednostki, którą gracz może zbudować. Jednocześnie ten sam najeźdźca **rozpada
się po PIERWSZYM trafieniu** (patrz §4) — dopóki nie przeładujesz gry, po czym staje się bardzo
trwały. Te dwa fakty razem znaczą, że **walka naziemna AI↔gracz jest dziś nieprzewidywalna
w sposób, którego nie widać w liczbach na ekranie.**

---

## 1. PULA DESANTOWA AI

### Gdzie leży

`src/data/GroundUnitData.js` → **`export const INVASION_UNIT_POOLS`** (`:97`).
Czytana w `InvasionSystem.launchInvasion` (`:106`):

```
const pool = INVASION_UNIT_POOLS[emp.archetype] ?? ['infantry', 'infantry'];
```

| archetyp imperium | pula |
|---|---|
| `xenophage` | `infantry`, `infantry`, `mech` |
| `swarm` | `infantry` ×3 |
| `hegemon` | `infantry`, `mech`, `mech` |
| `trader` | `infantry`, `garrison` |
| `isolationist` | `garrison`, `infantry` |
| *(brak wpisu)* | `infantry` ×2 — fallback w kodzie |

⚠ **`'infantry'` NIE jest fallbackiem awaryjnym — to celowa zawartość puli.** Wszystkie pięć
archetypów wymienia wyłącznie typy **legacy**; żadna pula nie zawiera ani jednego archetypu.
Fallback (`?? ['infantry','infantry']`) dotyczy tylko imperium o nieznanym archetypie.

### Dlaczego to trafia na starą ścieżkę

`GroundUnitManager.createUnit` (`:105`) rozgałęzia się po nazwie typu:

```
if (UNIT_ARCHETYPES[type]) { …Factory: archetyp… }
// ── Legacy ścieżka (science_rover/infantry/mech/garrison) ──
```

`infantry` / `mech` / `garrison` **nie są** kluczami `UNIT_ARCHETYPES`, więc lądują w gałęzi
legacy. **Ścieżka do jednostek archetypowych ISTNIEJE i jest w pełni sprawna** — używa jej gracz
(`ColonyManager.startGroundUnitBuild` → `createUnit(archetypeId, …, { factionId })`). Desant AI po
prostu **nigdy jej nie woła**, bo podaje nazwy z drugiego katalogu.

### Co ta pula może dziś wyprodukować (pełne statystyki)

`GROUND_UNITS` (`GroundUnitData.js:15`) — model legacy:

| typ | HP | atak | obrona | zasięg | hex/civY | rola | ikona |
|---|---|---|---|---|---|---|---|
| `infantry` | 60 | 12 | 4 | 1 | 1.5 | military | 🪖 |
| `mech` | 150 | 25 | 10 | 1 | 0.8 | military | 🤖 |
| `garrison` | 100 | 8 | 15 | 1 | **0** (stacjonarny) | defensive | 🛡 |
| *(`science_rover`)* | 40 | 1 | 1 | 1 | 2.0 | civilian | 🛰 — **nie ma go w żadnej puli desantu** |

Dla porównania **archetypy** (`src/data/unitArchetypes.js`, `baseStats`), czyli to, co ma gracz:

| archetyp | HP | dmg | AC | rng | mov | rola | zdolność |
|---|---|---|---|---|---|---|---|
| `shock_infantry` | 15 | 7 | 3 | 1 | 2 | assault | `capture_building` |
| `rocket_artillery` | 10 | 14 | 2 | 4 | 1 | ranged | `orbital_support` |
| `garrison_unit` | 30 | 5 | 8 | 2 | 0 | defense | — |
| `aa_platform` | 12 | 8 | 3 | 2 | 2 | defense | — |
| `medic_unit` | 10 | 0 | 2 | 0 | 2 | support | `heal_nearby` |
| `recon_drone` | 4 | 0 | 1 | 3 | 5 | scout | `stealth` |
| `ground_supply_unit` | 40 | 2 | 3 | 1 | 2 | logistics | — |

⚠ **Dwie skale liczbowe, nie jedna.** Legacy operuje w dziesiątkach–setkach HP, archetypy
w jednocyfrowych/kilkunastu. To nie są warianty tej samej jednostki — to **dwa niezależne modele
balansu**, które dziś stają naprzeciw siebie na jednej siatce hex.

### `factionId: null` — co realnie blokuje?

**Tylko sprite. Combat, własność i celowanie są nietknięte** (zmierzone):

- `CombatSystem.js` zawiera **0 wystąpień** `factionId` — walka go nie czyta w ogóle.
- Kolor „wróg/swój" bierze się z **`unit.owner`**, nie z frakcji:
  `ColonyOverlay._drawUnits` → `const isEnemy = unit.owner && unit.owner !== 'player'` → czerwony
  glow/ring. Gracz **odróżnia** najeźdźcę na mapie.
- Sprite: `_getUnitSprite` (`:2982`) próbuje ścieżki frakcyjnej tylko gdy
  `unit.factionId && unit.archetypeId`; legacy spada na `this._unitSprites.get(unit.type)` — czyli
  **wspólny sprite `infantry`**, ten sam, którego używałby gracz, gdyby budował legacy.

⇒ Skutek `factionId` jest wyłącznie estetyczny: obcy desant wygląda jak ogólna piechota zamiast
mieć wygląd frakcji. **Mapowanie imperium → frakcja nie-ludzka, dodane w W3-6, nie ma tu jak
zadziałać**, bo legacy w ogóle nie przechodzi przez `GroundUnitFactory`.

---

## 2. PULA / ŚCIEŻKA GRACZA

### Jak gracz werbuje

`ColonyManager.startGroundUnitBuild(planetId, archetypeId, factionId = 'humanity')` (`:1138`).
Siedem bramek, po kolei:

1. **Archetyp znany** (`UNIT_ARCHETYPES`) → inaczej `unknown_archetype`
2. **Koszary + tech** (`checkArchetypeUnlocked`): `shock_infantry`/`garrison_unit` — koszary Lv1,
   bez techu · `rocket_artillery`/`aa_platform`/`medic_unit` — Lv2 + `ground_warfare` ·
   `ground_supply_unit` — Lv2 + `military_logistics` · `recon_drone` — Lv3 + `drone_warfare`
3. **Cap populacyjny** — max `floor(pop/4)` jednostek bojowych → `cap_reached`
4. **Slot koszar** (1 slot = 1 równoległa budowa) → `barracks_full`
5. **Wolne POPy** (blokowane z warstwy `laborer`) → `no_free_pops`
6. **Kredyty** → `no_credits`
7. **Surowce + towary** → `cannot_afford`

| archetyp | POP | Kr | surowce | towary | czas (civY) |
|---|---|---|---|---|---|
| `shock_infantry` | 0.60 | 100 | Ti 8, Si 5, Hv 2 | structural_alloys 2, reactive_armor 1 | 0.8 |
| `garrison_unit` | 1.20 | 250 | Ti 15, Si 8, Hv 25 | structural_alloys 5, reactive_armor 4 | 1.2 |
| `rocket_artillery` | 1.60 | 500 | Ti 20, Si 12, Hv 18, Xe 1 | structural_alloys 4, electronic_systems 3, polymer_composites 2 | 1.4 |
| `aa_platform` | 1.20 | 400 | Ti 10, Si 25, Hv 8, Xe 2 | structural_alloys 3, electronic_systems 4, metamaterials 1 | 1.1 |
| `medic_unit` | 1.00 | 300 | Ti 8, Si 10, Hv 5 | polymer_composites 3 | 1.0 |
| `recon_drone` | 0.00 | 400 | Ti 5, Si 18, Xe 3 | electronic_systems 3, polymer_composites 2 | 0.8 |
| `ground_supply_unit` | 1.20 | 350 | — | — | 1.2 |

⚠ **Desant AI nie płaci NICZEGO.** `launchInvasion` woła `createUnit` bezpośrednio — bez POPów,
kredytów, surowców, koszar, techu i czasu budowy. To nie jest zarzut wobec implementacji (desant
reprezentuje wojsko przywiezione z domu), ale **asymetria kosztowa jest całkowita** i warto ją
znać przy strojeniu.

### Gdzie żyją zwerbowane jednostki

Jeden rejestr dla wszystkich: **`GroundUnitManager._units`** (`Map<unitId, unit>`), jednostka niesie
`planetId` + `q/r`. Nie ma osobnego „magazynu garnizonu".

Załadowanie na statek **nie przenosi** jednostki do innego rejestru — `Vessel.loadGroundUnit`
dopisuje jej id do `vessel.groundUnits[]` i podbija `vessel.troopBayUsed` (limit: `troopCapacity`
z modułów `troop_bay_*`). Zrzut (`dropTroop`, wymaga `drop_pods` + dominacji orbitalnej sprawdzanej
przez wołającego) odwraca operację i sadza jednostkę na hexie.

---

## 3. STAN NA TWOIM ZAPISIE — czego NIE MOGŁEM odczytać

⚠ **Nie mam dostępu do Twojego zapisu** (żyje w localStorage przeglądarki). Audyt mierzył kod,
który jest identyczny w każdej partii. Poniższy odczyt **zweryfikowałem headless co do kształtu** —
zwraca `[nazwa, układ, dok/przestrzeń, zajęcie ładowni, typy jednostek]`:

`Array.from(KOSMOS.vesselManager._vessels.values()).filter(v => !v.isEnemy && (v.groundUnits?.length ?? 0) > 0).map(v => [v.name, v.systemId, v.position?.dockedAt ?? 'przestrzeń', v.troopBayUsed + '/' + v.troopCapacity, (v.groundUnits ?? []).map(id => KOSMOS.groundUnitManager.getUnit(id)?.archetypeId ?? KOSMOS.groundUnitManager.getUnit(id)?.type ?? '?')])`

Przykładowa zwrotka z walidacji: `[["Transport","sys_home","entity_3","1/3",["shock_infantry"]]]`.

Uzupełniająco — **czy gdziekolwiek masz garnizon** (pusty wynik na koloniach potwierdza to, co
widziałeś):

`KOSMOS.colonyManager.getPlayerColonies().map(c => [c.name, KOSMOS.groundUnitManager.getUnitsOnPlanet(c.planetId).length])`

Oraz — ile z nich jest **zdolnych do odbicia** (`capture_building` ma dziś tylko `shock_infantry`):

`Array.from(KOSMOS.groundUnitManager._units.values()).filter(u => (u.owner ?? 'player') === 'player').map(u => [u.id, u.archetypeId ?? u.type, u.abilityId ?? '—', u.hp + '/' + u.hpMax])`

---

## 4. ⚠ ZNALEZISKO, KTÓREGO NIE BYŁO W ZLECENIU — a zmienia §5 GATE 3

**Legacy jednostka rozpada się po PIERWSZYM trafieniu, a po przeładowaniu gry przestaje.**
Zmierzone w kodzie, dwie linie w dwóch miejscach:

- **Trafienie** (`CombatSystem.js:303`): `target.morale = Math.max(0, (target.morale ?? 0) - 3)`.
  Legacy nie ma pola `morale` → `?? 0` → wynik **0**.
- **Zamiatanie w tej samej rundzie** (`:232-241`): `const morale = unit.morale ?? 100; if (morale <= 0) → groundUnit:disbanded + removeUnit`.
  Pole jest już liczbą **0**, więc jednostka **znika** — niezależnie od 60 HP.
- **Po zapisie i wczytaniu** (`GroundUnitManager:1281`, `:1341`): `morale: u.morale ?? 100` —
  jednostka wraca z **morale 100** i od tej pory zachowuje się normalnie.

⚠ Zwróć uwagę na **dwa różne domyślne `??`** dla tego samego pola: **0** w ścieżce obrażeń i
**100** w zamiataniu i w zapisie. Nietknięta jednostka jest bezpieczna; pierwsze trafienie
zapisuje jej 0 i ta sama runda ją rozwiązuje.

**Co to znaczy dla §5 GATE 3 (odbicie Nekkar d):** desant AI, który tam stoi, jest albo
**papierowy** (jeśli nie przeładowywałeś gry od jego wylądowania — pierwszy strzał go rozproszy),
albo **twardy jak 60 HP** (jeśli przeładowywałeś). Wynik odbicia zależy więc od tego, czy
w międzyczasie wczytałeś zapis — a nie od tego, co przywiozłeś. To jest dokładnie defekt **S12**
z planu W3 (odłożony świadomie do slice'u GROUND, decyzja D5), teraz z konkretnymi liczbami.

---

## 5. WERDYKT SZCZEGÓŁOWY

**Czy jednostka archetypowa istnieje dziś w kodzie? TAK — kompletna i używana.**
Siedem archetypów (`src/data/unitArchetypes.js`) z rolami, zdolnościami, kontrami, morale,
organizacją, zaopatrzeniem, sprite'ami frakcyjnymi, bramkami koszar/techu, kosztami i czasem
budowy. Gracz buduje wyłącznie je. **W przeciwieństwie do transportowca AI z poprzedniego audytu
NIE trzeba tu niczego projektować** — trzeba tylko **wskazać je w puli desantu**.

Porównanie modeli, pole po polu (zmierzone):

| | legacy (desant AI) | archetyp (gracz) |
|---|---|---|
| pola | 15 | 46 |
| identyfikacja | `type` | `type` + `archetypeId` + `factionId` + `name` |
| walka | `hp/hpMax/attack/defense/range/role` | to samo **+** `baseStats`, `counters`, `counteredBy`, `specialRules` |
| Opcja C v3 | **brak** | `org/maxOrg`, `morale/maxMorale`, `supply/supplyCap`, `supplyConsumption`, `noMorale` |
| zdolności | **brak** | `abilityId`, `abilityCooldownRemaining` |
| rozstawianie | **brak** | `deployState`, `stateTimer`, `transportStatus` |
| ekonomia | **brak** | `popCost`, `unpaidYears` |
| wygląd | **brak** (`sprite`/`color` niesione tylko w katalogu) | `sprite` (ścieżka frakcyjna), `color` |
| doświadczenie | **brak** | `experience`, `turnsAlive` |
| tylko legacy | `mission` | — |

**Najmniejsza zmiana, która to zbiega:** przepisanie `INVASION_UNIT_POOLS` na identyfikatory
archetypów (`shock_infantry`, `garrison_unit`, `rocket_artillery`…). ⚠ To **zmiana balansu walki
naziemnej**, nie porządkowa: przenosi desant AI z modelu 60 HP na model 15 HP, włącza mu morale,
zaopatrzenie i kontry, i dopiero wtedy zaczyna działać mapowanie frakcji z W3-6 (obcy przestają
wyglądać jak ludzka piechota). Dlatego należy do slice'u **GROUND** razem z S12 i R13 — i powinna
iść **po** naprawie morale, nie przed: dziś przełączenie samych pul dałoby najeźdźców o 15 HP,
którzy nadal rozpadają się po pierwszym trafieniu, tylko szybciej.

**Sugerowana kolejność dla GROUND** (do decyzji właściciela, nie rekomendacja do wykonania):
S12 (morale legacy + rozjazd zapis/wczytanie) → pule desantu na archetypy → R13 (zasianie RNG,
w tym `Math.random()` w doborze archetypów w `launchInvasion:107`).
