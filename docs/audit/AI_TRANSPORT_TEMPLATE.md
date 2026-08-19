# RAPORT — rola transportowa w katalogu AI (`SHIP_TEMPLATES`)

**Data:** 2026-08-19 · **Zakres:** JEDEN wpis katalogowy + aktualizacja jednego pinu keepera, który
ten wpis z założenia miał złapać. **Zero zmian w `DirectorProduction`. Zero zmian w `spawnEnemyRaider`.**
**Powód:** W3 §Finding 49 — `docs/audit/AI_DROP_HULL_AUDIT.md` zmierzył, że katalog AI nie ma ANI JEDNEGO
wpisu z `troop_bay_*` / `drop_pods`, więc `no_drop_capable_hull` było jedyną OSIĄGALNĄ odpowiedzią złącza
bitwa→desant (`InvasionSystem._onVesselGroupVictory`). Moduły, kadłuby i pojemności były na miejscu —
brakowało wyłącznie wpisu katalogowego.

---

## 1. NOWY WPIS

**`templateId: 'transport_assault'`** · rola `transport` · kadłub `hull_large`
(nazwa wg konwencji katalogu: rola/klasa pierwszym członem, jak `science_probe`).

```js
transport_assault: {
  id:     'transport_assault',
  role:   'transport',
  namePL: 'Transportowiec desantowy',
  nameEN: 'Assault Transport',
  // Bramki techu przychodzą Z MODUŁÓW, nie z szablonu: troop_bay_l → fleet_logistics,
  // drop_pods → ground_warfare, warp_tank → warp_drive, engine_warp → ion_drives.
  hullTiers: ['hull_large'],
  slots: [
    { tiers: ['engine_warp'], required: true  },   // propulsion · requires ion_drives
    { tiers: ['engine_warp'], required: false },   // propulsion · drugi silnik = TEMPO, nie rola
    { tiers: ['warp_tank'],   required: true  },   // fuel    · ROLA: bez baku nie dowiezie desantu
    { tiers: ['troop_bay_l'], required: true  },   // troop   · requires fleet_logistics · +16 ładowności
    { tiers: ['drop_pods'],   required: true  },   // special · requires ground_warfare · canDropTroops
    { tiers: ['troop_bay_l'], required: false },   // druga ładownia = SKALA desantu (16 → 32)
    { tiers: ['drop_pods'],   required: false },   // ⚠ mechanicznie NADMIAROWE (flaga boolean)
  ],
},
```

Ładunek właściciela (`troop_bay_l` ×2 + `drop_pods` ×2) wchodzi w całości; `warp_tank` i dwa silniki wg
wzorca gracza „Troop Transport Warp I". Bilans gniazd: **2P + 5U na 3P + 6U** — jedno gniazdo `utility`
zapasu, `dropped: []`.

Flagi `required` NIE zmieniają ładunku na `hull_large` (wszystko się mieści) — rozstrzygają WYŁĄCZNIE
kolejność degradacji, gdyby kiedyś przyszło zejść niżej: pierwsze padają drugie kapsuły (mechanicznie
nadmiarowe — `enablesPlanetLanding` to flaga boolean, `ShipModulesData:691`), potem druga ładownia
(skala desantu), potem drugi silnik (tempo). Rdzeń roli — bak warp, jedna ładownia, jedne kapsuły,
jeden silnik — jest `required: true`, bo jego utrata zmieniłaby ROLĘ okrętu, nie jego jakość
(ta sama zasada, co `warp_tank` w FRG-1).

### Dlaczego `hull_large`, a nie `hull_medium` (POMIAR, nie preferencja)

| | `hull_medium` (2P+4U) | `hull_large` (3P+6U) |
|---|---|---|
| ładunek właściciela | **nie mieści się** — resolver po cichu zrzuca drugie kapsuły (`dropped: ['drop_pods']`) | komplet, jedno gniazdo zapasu |
| `baseHP` | 80 | **180** |
| stosunek masy | ×6.48 (przeciążony) | ×4.18 |
| prędkość (1 silnik) | 4.83 AU/rok | 3.91 AU/rok |
| koszt | Fe 425 | Fe 530 |
| port kosmiczny | wymagany (`medium`) | wymagany (`large`) |

Rozstrzyga **przeżywalność, bo jest tu mechaniką, nie ozdobą**: bramka desantu liczy wyłącznie kadłuby,
które PRZEŻYŁY bitwę (`!v.isWreck`, `InvasionSystem:203`). Transportowiec, który ginie w wymianie ognia,
nie dowozi niczego, więc 180 HP vs 80 HP decyduje o tym, czy z wygranej orbity w ogóle ma kto zejść na
dół. Cena decyzji jest zapisana uczciwie wyżej: wolniej i drożej. Bramka portu NIE różnicuje tych dwóch
kadłubów — oba portu wymagają, więc nie była argumentem w tym wyborze.

**Bez kadłuba zapasowego, świadomie:** `hull_medium` bramkuje ten SAM tech co `hull_large`
(`exploration`), więc drabinka kadłubów nie mogłaby się nigdy odpalić — byłaby dokładnie tą klasą
martwych danych, przed którą ostrzega notatka R9 w nagłówku `ShipTemplateData.js`. Wzór jednoszczeblowy:
`science_probe`.

### Dwa silniki — zmierzona konsekwencja, do rozstrzygnięcia przy doktrynie

`speedMult` silników **mnoży się** (`ShipModulesData:682`) i dokłada +25% redundancji za każdy kolejny:

| silniki | prędkość | odniesienie |
|---|---|---|
| 1× `engine_warp` | 3.91 AU/rok | eskorta FRG-1: **6.61 AU/rok** |
| **2× (wybrane)** | **42.89 AU/rok** | |
| 3× | 452.38 AU/rok | |

Zostają dwa (dolny koniec wzorca właściciela ×2-3; trzeci mnoży jeszcze raz i daje absurd), ale odnotowuję
wprost: **transportowiec jest w tej konfiguracji ~6× szybszy od eskorty, która ma go osłaniać**. To pytanie
balansowe dla przyszłego slice'u doktrynalnego, nie dla tego wpisu — zejście do jednego silnika to
skreślenie jednej linii (`required: false`) i 3.9 AU/rok.

---

## 2. WALIDACJA (wykonana headless, wyniki surowe)

### Pkt 1 — `resolveTemplate('transport_assault', { isResearched: () => true, archetype: 'xenophage' })`

```
{
  "ok": true,
  "templateId": "transport_assault",
  "hullId": "hull_large",
  "modules": [
    "engine_warp",
    "engine_warp",
    "warp_tank",
    "troop_bay_l",
    "drop_pods",
    "troop_bay_l",
    "drop_pods"
  ],
  "dropped": []
}
calcShipStats: {
  "canDropTroops": true,
  "troopCapacity": 32,
  "warpCapable": true,
  "warpFuelCapacity": 5,
  "warpSpeedLY": 18,
  "speedAUperYear": 42.89,
  "hp": 180,
  "engineCount": 2,
  "totalMass": 406,
  "massRatio": 4.51
}
calcShipCost: {"cost":{"Fe":530,"Ti":270,"Cu":64,"Hv":48},"commodityCost":{"structural_alloys":67,"polymer_composites":6,"reactive_armor":17,"warp_cores":4,"electronic_systems":12,"power_cells":4,"pressure_modules":14}}
BRAMKA DESANTU (InvasionSystem:203-210): canDropTroops = true · troopCapacity > 0 = true ⇒ KADŁUB ZDOLNY DO ZRZUTU
```

✅ `ok: true`, kadłub z `canDropTroops: true` i `troopCapacity: 32` (> 0) — czyli dokładnie to, czego żąda
bramka `_onVesselGroupVictory`. Dodatkowo `warpCapable: true` z `warpFuelCapacity: 5`, więc dźwignia
`spawnEnemyRaider` nie zaraportuje `warpCapable: false` w swojej kontroli po fakcie (audyt §3).

### Pkt 2 — bramka techowa NADAL działa (nie jest omijana na poziomie szablonu)

```
  brak [fleet_logistics] → ok=false reason=no_module detail={"hullId":"hull_large","slotIndex":3,"tried":["troop_bay_l"]}
  brak [ground_warfare] → ok=false reason=no_module detail={"hullId":"hull_large","slotIndex":4,"tried":["drop_pods"]}
  brak [fleet_logistics, ground_warfare] → ok=false reason=no_module detail={"hullId":"hull_large","slotIndex":3,"tried":["troop_bay_l"]}
  brak [ion_drives] → ok=false reason=no_module detail={"hullId":"hull_large","slotIndex":0,"tried":["engine_warp"]}
  brak [warp_drive] → ok=false reason=no_module detail={"hullId":"hull_large","slotIndex":2,"tried":["warp_tank"]}
  brak [exploration] → ok=false reason=no_hull detail={"tried":["hull_large"]}
```

✅ Odmowa z sensownym powodem i wskazaniem konkretnego slotu w każdym przypadku. Bramki pochodzą wyłącznie
z `requires` modułów i kadłuba — **szablon nie dokłada własnej bramki techowej** (zgodnie z zakresem
zadania).

### Pkt 3 — walidator kształtu katalogu i keepery

```
validateTemplateCatalog() = {}
liczba wpisów w katalogu: 5 → frigate_laser_escort, frigate_missile_escort, frigate_system_defender, science_probe, transport_assault
id === klucz dla każdego wpisu: true
```

```
node src/testing/smoke/ship_template_resolver_smoke.mjs   → 52 PASS / 0 FAIL
node src/testing/smoke/director_feed_isolation_smoke.mjs  → 53 PASS / 0 FAIL   (było 52 — doszło T4/transport_assault)
    ✓ T4/transport_assault: (hull_large + 7 modułów) → z powrotem „transport_assault"
    ✓ T5a: żadne dwa szablony nie dają tego samego ładunku na tym samym kadłubie
node src/testing/smoke/w3_attack_dispatch_smoke.mjs       → 36 PASS / 0 FAIL   (było 35 — patrz §3)

node src/testing/smoke/run-all.mjs                        → ═══ 148/148 OK, 0 FAIL, 24 advisory ═══
```

(24 advisory = suity bez rozpoznanego wiersza podsumowania, zbiór identyczny jak przed zmianą — żadna
z trzech dotkniętych suit nie jest wśród nich.)

---

## 3. ⚠ PIN, KTÓRY ZADZIAŁAŁ — I DLATEGO ZMIENIŁ SIĘ DRUGI PLIK

`w3_attack_dispatch_smoke` T6 asertował, że **żaden** kadłub z katalogu AI nie wymaga portu kosmicznego,
a jego kontrola pinu mówiła wprost: *„Dzień, w którym katalog dostanie niszczyciel (`size: medium`), jest
dniem, w którym starty AI ze stolicy BEZ portu zaczną być odrzucane po cichu jako
`no_spaceport_at_origin`"*. Ten dzień właśnie nastał — pomiar zaraz po wpisie:

```
  ✗ T6: ŻADEN kadłub z katalogu AI nie wymaga portu (wszystkie `size: small`)
  ═══ 34 PASS, 1 FAIL ═══
```

**To nie jest defekt wpisu — desantu NIE DA SIĘ zmieścić na kadłubie `small`:** dwie ładownie + kapsuły +
bak warp to 5 gniazd `utility`, a `hull_frigate` ma 3 (`hull_small` — 2). Każda możliwa rola transportowa
siada na `medium`/`large`, więc każda przekracza próg `needsSpaceportForVessel` (`SpaceportCheck.js:21-27`).

**Konsekwencja (dziś nieszkodliwa, jutro warunek wstępny doktryny):** bramka portu działa WYŁĄCZNIE na
statku w stanie `docked` (`canLaunchFromCurrent`), a dźwignia `spawnEnemyRaider` stawia okręt od razu
w przestrzeni — więc łańcuch bitwa→desant testuje się bez przeszkód. Zaboli w dniu, w którym
transportowiec zacznie schodzić ze stoczni stolicy BEZ portu: start pójdzie wtedy w
`no_spaceport_at_origin` (`VesselManager:615`). To jest zadanie dla slice'u doktrynalnego, nie dla tego
wpisu.

T6 został przepisany na nową ZMIERZONĄ prawdę zamiast rozluźnienia asercji — pin trzyma teraz obie połowy
katalogu i ma kontrolę pinu w obie strony:

- **T6a** — żaden kadłub BOJOWY/NAUKOWY portu nie wymaga (wszystkie `small`) ⇒ starty AI, którymi steruje
  dziś `DirectorDoctrine`, są bramką nietknięte;
- **T6b** — rola transportowa siedzi na `hull_large` i portu WYMAGA (pierwszy taki wpis w katalogu);
- **KONTROLA PINU** — `hull_small` → `false`, `hull_destroyer` → `true`: predykat naprawdę rozróżnia
  rozmiary, więc obie asercje wyżej mają treść.

---

## 4. CZEGO NIE TKNIĘTO

**`DirectorProduction` (w tym drabina nacisku L1/L2) oraz `DirectorOffensive` / wybór celu
(`strike_player_target`) NIE zostały zmienione ani jedną linią — AI samo z siebie transportowca nie
zbuduje i nie wyśle; jedynym wejściem pozostaje dźwignia debugowa
`spawnEnemyRaider({ templateId: 'transport_assault' })`, która, jak zmierzył audyt §3, nie ma białej listy
i przyjmuje nowy identyfikator bez zmian w kodzie.**

Nietknięte także: `spawnEnemyRaider`, `ShipTemplateResolver`, `InvasionSystem`, moduły i kadłuby, bramka
W3-6. Zero migracji save (katalog to stała w kodzie, nie stan zapisu) — save zostaje **v101**.

**Pliki zmienione:** `src/data/ShipTemplateData.js` (wpis + notatka katalogowa) ·
`src/testing/smoke/w3_attack_dispatch_smoke.mjs` (T6 — pin, który ten wpis miał złapać) ·
`docs/audit/AI_TRANSPORT_TEMPLATE.md` (ten raport).
