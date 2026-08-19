// ShipTemplateData — katalog szablonów okrętów (workstream C, Slice 1, commit S3).
//
// Ten plik to WYŁĄCZNIE DANE. Rozwiązywanie szablonu na konkretny kadłub i listę modułów
// robi `src/utils/ShipTemplateResolver.js` (czysta funkcja, node-testowalna). Wynik ma
// kształt, którego oczekuje `ColonyManager.startShipBuild(planetId, hullId, moduleIds)`.
//
// ⚠ KONTRAKT: NOWY SZABLON = WPIS W MAPIE I NIC WIĘCEJ. Zero zmian w kodzie, zero nowych
// gałęzi w resolverze. To jest wymaganie planu (RESUME §4), a nie ambicja — katalog pisze
// właściciel projektu, nie programista.
//
// Wzór formatu: `ENGINE_TIERS` + `_bestEngine` z `EmpireLogisticsSystem.js:50-58` (lista od
// najlepszego, pierwszy spełniony wygrywa) uogólnione ze SILNIKA na WSZYSTKIE sloty, plus
// `archetypeOverrides` per klucz w duchu `DEFAULT_LOGISTICS_CONFIG` (`:60-66`).
//
// ── DLACZEGO SLOTY MAJĄ TYLKO DWA TYPY ────────────────────────────────────────────────
// `HULLS[x].slots` to tablica obiektów `{ type }` i istnieją DOKŁADNIE DWIE wartości:
// 'propulsion' i 'utility' (`HullsData.js:187-192`). Dziewięć nie-napędowych `slotType`
// modułów (cargo/science/special/habitat/armor/fuel/weapon/shield/troop) zlewa się w
// JEDEN slot 'utility' — kadłub NIE POTRAFI powiedzieć „mam 2 twarde punkty broni".
// Szablon też tego nie powie. Limity per kategoria = nowa maszyneria w HullsData
// i w obu edytorach projektów, świadomie POZA Slice 1.

/**
 * KONTRAKT WPISU
 *
 * {
 *   id:   'frigate_laser_escort',    // === klucz w mapie (pinowane smoke'iem)
 *   role: 'warship',                 // warship | science | courier | transport
 *   namePL / nameEN,                 // dwujęzycznie OD RAZU (zasada projektu) — S1 nie
 *                                    // pokazuje ich w UI, ale intel Slice'a 2 pokaże
 *
 *   // Kadłuby OD NAJLEPSZEGO. Wygrywa PIERWSZY, którego `requires` imperium spełnia.
 *   hullTiers: ['hull_frigate', 'hull_small'],
 *
 *   // Sloty w kolejności wypełniania. `tiers` = preferencje od najlepszej.
 *   // `required: false` = slot porzucany PIERWSZY, gdy zabraknie pojemności (od KOŃCA).
 *   slots: [
 *     { tiers: ['engine_warp'], required: true },
 *     …
 *   ],
 *
 *   // Nadpisania per archetyp, per KLUCZ (nie całym obiektem).
 *   archetypeOverrides: { xenophage: { slots: [ … ] } },
 * }
 *
 * ⚠ `required` NIE ZMIENIA ładunku na kadłubie docelowym — trzy fregaty niżej mieszczą się
 * w `hull_frigate` CO DO SLOTU (1P + 3U, zero zapasu), więc nic nie odpada. Flaga rozstrzyga
 * WYŁĄCZNIE degradację na kadłub zapasowy: co ma zginąć, gdy slotów jest mniej.
 */

/**
 * ⚠ ZNALEZISKO POMIAROWE — KADŁUB ZAPASOWY JEST DLA OKRĘTÓW WOJENNYCH NIEOSIĄGALNY.
 *
 * Plan wymaga obowiązkowego fallbacku, bo `hull_frigate` wymaga techu `point_defense`,
 * którego imperium może nie mieć (`HullsData.js:186`). Pomiar pokazuje, że dla OKRĘTU
 * BOJOWEGO ten fallback nie może się nigdy odpalić z pożytkiem: `point_defense` bramkuje
 * jednocześnie kadłub I **KAŻDY MODUŁ BRONI W GRZE** (`weapon_laser`, `weapon_kinetic`,
 * `weapon_missile` — `ShipModulesData.js:472/488/504`; czwarty, `orbital_strike_battery`,
 * ma jeszcze wyższy próg). Imperium bez tego techu zejdzie więc na `hull_small` i tak samo
 * odbije się od slotu broni — dostanie `no_module`, nie „gorszy okręt".
 *
 * Fallback ZOSTAJE (jest instrukcją właściciela i jest darmowy), ale zostaje ŚWIADOMIE
 * i jest PINOWANY testem: `ship_template_resolver_smoke` asertuje, że przy braku
 * `point_defense` wynikiem jest `no_module`, a nie uzbrojony okręt na małym kadłubie.
 * Gdyby ktoś kiedyś przeniósł którąś broń spod `point_defense`, ten pin PADNIE — i wtedy
 * fallback naprawdę się budzi, a my się o tym dowiadujemy. To jest dokładnie ta klasa
 * martwych danych, którą audyt R9 nazwał „czytają się jak zaimplementowana funkcja".
 */

/** Katalog szablonów. Balans strojymy TUTAJ i nigdzie indziej. */
export const SHIP_TEMPLATES = {

  // ══════════════════════════════════════════════════════════════════════════
  // KATALOG v1 — trzy fregaty (autor: właściciel projektu, 2026-08-11)
  //
  // Wszystkie trzy to STAŁE ładunki pierwszego szczebla: każdy slot ma jedną
  // pozycję w `tiers`, więc dobór nie zależy od stanu techu imperium poza
  // bramką „mam / nie mam". Drabinki `tiers` (wzór ENGINE_TIERS) są w formacie
  // dostępne i używa ich `science_probe` niżej.
  //
  // Napęd wszystkich trzech: `engine_warp` = VDT-W1 „Wyłom" / „Breach".
  // ⚠ To moduł `tier: 4` (`ShipModulesData.js:77`), nie tier 1 — nazwa „W1" jest
  // oznaczeniem MARKI warp, nie szczeblem. Tier-1 napędem jest `engine_chemical`
  // (VDT-100 „Wół"/„Ox"). Nazwa w katalogu właściciela trafia jednoznacznie
  // w `engine_warp`, więc to ona rozstrzyga; rozbieżność opisu odnotowana.
  // ══════════════════════════════════════════════════════════════════════════

  frigate_laser_escort: {
    id:     'frigate_laser_escort',
    role:   'warship',
    namePL: 'Fregata eskortowa — laserowa',
    nameEN: 'Laser Escort Frigate',
    // Rola: eskorta, ZDOLNA DO SKOKU. Zdolność warp bierze się z `warp_tank`
    // (`warpCapacityAdd`), nie z kadłuba — `Vessel.js:124` liczy `warpFuel.max`
    // wyłącznie ze statystyk modułów. Dlatego bak jest `required: true`:
    // porzucenie go zmieniłoby ROLĘ okrętu, nie tylko jego jakość.
    hullTiers: ['hull_frigate', 'hull_small'],
    slots: [
      { tiers: ['engine_warp'],   required: true  },   // propulsion · requires ion_drives
      { tiers: ['warp_tank'],     required: true  },   // fuel       · requires warp_drive
      { tiers: ['armor_heavy'],   required: false },   // armor      · requires point_defense
      { tiers: ['weapon_laser'],  required: true  },   // weapon     · requires point_defense
    ],
  },

  frigate_missile_escort: {
    id:     'frigate_missile_escort',
    role:   'warship',
    namePL: 'Fregata eskortowa — rakietowa',
    nameEN: 'Missile Escort Frigate',
    // Bliźniak FRG-1 z bronią długiego zasięgu (rangeAU 0.30 vs 0.05 lasera).
    hullTiers: ['hull_frigate', 'hull_small'],
    slots: [
      { tiers: ['engine_warp'],    required: true  },
      { tiers: ['warp_tank'],      required: true  },
      { tiers: ['armor_heavy'],    required: false },
      { tiers: ['weapon_missile'], required: true  },
    ],
  },

  frigate_system_defender: {
    id:     'frigate_system_defender',
    role:   'warship',
    namePL: 'Fregata obrony układu',
    nameEN: 'System Defence Frigate',
    // 📌 NOTATKA KATALOGOWA (orzeczenie R-4) — PRZYSZŁY SZCZEBEL, nie do zmiany teraz:
    // `engine_warp` waży 30 t i jest tu **martwym balastem**, bo ta fregata z założenia nie
    // skacze (patrz niżej). Naturalne rozszerzenie katalogu to **„silnik układowy"**: tani,
    // lekki napęd BEZ zdolności warp, który uwolniłby ~25 t masy i poprawił prędkość oraz
    // zasięg FRG-3. To rozszerzenie DANYCH (nowy moduł + wpis w `tiers`), nie kodu.
    // ⚠ Świadomie NIE rozwiązujemy tego drabinką `['engine_warp','engine_ion','engine_chemical']`
    // na wspólnym slocie: pomogłaby FRG-3, ale ODEBRAŁABY ROLĘ FRG-1/FRG-2 — bez silnika warp
    // ich `warp_tank` jest bezużyteczny, więc „eskorta zdolna do skoku" przestałaby nią być.
    //
    // ⚠ CELOWY BRAK `warp_tank` — ten okręt NIE MOŻE opuścić swojego układu.
    // Zweryfikowane w kodzie, nie założone: `warpFuel.max` pochodzi wyłącznie
    // z `warpCapacityAdd` modułów (`Vessel.js:122-124`, komentarz wprost:
    // „max>0 tylko gdy statek ma moduł Komora Warp"), a wszystkie ścieżki
    // międzyukładowe bramkują `warpFuel.max > 0`. Bez baku silnik warp jest
    // martwym balastem — i to jest zamierzony koszt roli obronnej.
    hullTiers: ['hull_frigate', 'hull_small'],
    slots: [
      { tiers: ['engine_warp'],    required: true  },
      { tiers: ['armor_heavy'],    required: false },
      { tiers: ['weapon_missile'], required: true  },
      { tiers: ['weapon_missile'], required: true  },   // duplikat modułu jest legalny
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Szablon nie-bojowy — jedyny konsument DRABINEK `tiers` w katalogu v1.
  // Istnieje po to, żeby mechanizm fallbacku modułu był ĆWICZONY przez żywy
  // wpis, a nie tylko przez test (`science_probe` używa go S5 — przelot
  // pierwszego kontaktu).
  // ══════════════════════════════════════════════════════════════════════════

  science_probe: {
    id:     'science_probe',
    role:   'science',
    namePL: 'Sonda badawcza',
    nameEN: 'Science Probe',
    hullTiers: ['hull_small'],
    slots: [
      // Wzór ENGINE_TIERS: od najlepszego, `engine_chemical` ma `requires: null`,
      // więc ten slot NIGDY nie zawiedzie — to jest sens gwarantowanego dna drabinki.
      { tiers: ['engine_fusion', 'engine_ion', 'engine_chemical'], required: true },
      { tiers: ['science_lab'],                                    required: true },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Rola TRANSPORTOWA — TRP-1, dopisana 2026-08-19 (W3 §Finding 49).
  //
  // POWÓD: audyt `docs/audit/AI_DROP_HULL_AUDIT.md` ZMIERZYŁ, że katalog nie ma ANI JEDNEGO
  // wpisu z `troop_bay_*` / `drop_pods`, więc `no_drop_capable_hull` było JEDYNĄ osiągalną
  // odpowiedzią złącza bitwa→desant (`InvasionSystem._onVesselGroupVictory:203-210`). Moduły,
  // kadłuby i pojemności były na miejscu — brakowało WYŁĄCZNIE wpisu katalogowego.
  //
  // ⚠ NIKT TEGO DZIŚ NIE ZAMAWIA. `DirectorProduction` i drabina nacisku L1/L2 są NIETKNIĘTE:
  // AI samo z siebie transportowca nie zbuduje ani nie wyśle. Jedyne wejście to dźwignia
  // debugowa `spawnEnemyRaider({ templateId: 'transport_assault' })` — audyt §3 zmierzył, że
  // nie ma tam białej listy. Doktryna produkcji i wysyłki = OSOBNY slice z własnym gate'em
  // (analog W3-5), świadomie POZA tym wpisem.
  //
  // ── DLACZEGO hull_large, skoro hull_medium jest tańszy I szybszy (POMIAR) ─────────────
  //  • hull_medium (2P+4U) NIE MIEŚCI ładunku właściciela w całości — resolver po cichu
  //    zrzuca DRUGIE kapsuły (`dropped: ['drop_pods']`). hull_large (3P+6U) niesie komplet,
  //    z jednym gniazdem zapasu.
  //  • PRZEŻYWALNOŚĆ JEST TU MECHANIKĄ, NIE OZDOBĄ: bramka desantu liczy wyłącznie kadłuby,
  //    które PRZEŻYŁY bitwę (`!v.isWreck`). baseHP 180 vs 80 rozstrzyga, czy po wygranej
  //    orbicie w ogóle ma kto zejść na dół.
  //  • Masa: ×4.18 na hull_large vs ×6.48 na hull_medium — ten drugi jest przeciążony daleko
  //    poza zakres, dla którego opisano krzywą ∛ („×3 = ~44% kary", `ShipModulesData:706`).
  //  Cena tej decyzji, uczciwie: wolniej (3.91 vs 4.83 AU/rok przy jednym silniku) i drożej
  //  (Fe 530 vs 425).
  //
  // ── BEZ KADŁUBA ZAPASOWEGO (świadomie) ───────────────────────────────────────────────
  // `hull_medium` bramkuje ten SAM tech co `hull_large` (`exploration`), więc drabinka
  // kadłubów nie mogłaby się nigdy odpalić — byłaby dokładnie tą klasą martwych danych,
  // przed którą ostrzega notatka R9 wyżej. Wzór jednoszczeblowy: `science_probe`.
  //
  // ⚠ PIERWSZY WPIS KATALOGU, KTÓRY POTRZEBUJE PORTU KOSMICZNEGO. `hull_large` ma
  // `size: 'large'`, więc `needsSpaceportForVessel` = true (`SpaceportCheck.js:21-27`).
  // Dziś to NIE boli: bramka działa wyłącznie na statku `docked` (`canLaunchFromCurrent`),
  // a dźwignia stawia okręt od razu w przestrzeni. Zaboli w dniu, w którym transportowiec
  // zacznie schodzić ze stoczni stolicy BEZ portu — start pójdzie wtedy w
  // `no_spaceport_at_origin` (`VesselManager:615`). To jest warunek wstępny doktrynalnego
  // slice'u, nie tego wpisu; `w3_attack_dispatch_smoke` T6 pinuje ten fakt POMIAREM.
  //
  // ⚠ PRĘDKOŚĆ — ZMIERZONA, do rozstrzygnięcia przy doktrynie: `speedMult` silników MNOŻY SIĘ
  // (`ShipModulesData:682`) i dokłada +25% redundancji za każdy kolejny, więc DWA `engine_warp`
  // dają 42.9 AU/rok — sześć razy szybciej niż eskorta, która ma go osłaniać (FRG-1: 6.6).
  // Zostają dwa (wzór właściciela „Troop Transport Warp I": ×2-3), bo trzeci mnoży JESZCZE RAZ
  // (452 AU/rok — absurd). Zejście do jednego silnika = skreślenie JEDNEJ linii niżej i
  // 3.9 AU/rok, czyli tempo wolniejsze od eskorty.
  // ══════════════════════════════════════════════════════════════════════════

  transport_assault: {
    id:     'transport_assault',
    role:   'transport',
    namePL: 'Transportowiec desantowy',
    nameEN: 'Assault Transport',
    // Bramki techu przychodzą Z MODUŁÓW, nie z szablonu: troop_bay_l → fleet_logistics,
    // drop_pods → ground_warfare, warp_tank → warp_drive, engine_warp → ion_drives.
    // Imperium bez `fleet_logistics` albo `ground_warfare` dostaje `no_module` — to jest
    // poprawna odmowa, nie luka do obejścia na poziomie szablonu.
    hullTiers: ['hull_large'],
    slots: [
      { tiers: ['engine_warp'], required: true  },   // propulsion · requires ion_drives
      { tiers: ['engine_warp'], required: false },   // propulsion · drugi silnik = TEMPO, nie rola
      { tiers: ['warp_tank'],   required: true  },   // fuel    · ROLA: bez baku nie dowiezie desantu
                                                     //           do innego układu (jak FRG-1)
      { tiers: ['troop_bay_l'], required: true  },   // troop   · requires fleet_logistics · +16 ładowności
      { tiers: ['drop_pods'],   required: true  },   // special · requires ground_warfare · canDropTroops
      { tiers: ['troop_bay_l'], required: false },   // druga ładownia = SKALA desantu (16 → 32)
      { tiers: ['drop_pods'],   required: false },   // ⚠ mechanicznie NADMIAROWE: `enablesPlanetLanding`
                                                     // to flaga boolean (`ShipModulesData:691`), więc druga
                                                     // sztuka nie dodaje nic poza 12 t zapasu na wypadek
                                                     // utraty gniazda — i dlatego pada PIERWSZA przy degradacji.
    ],
  },
};

/** Dozwolone role. Nowa rola = wpis TUTAJ (walidator jej pilnuje). */
export const TEMPLATE_ROLES = Object.freeze(['warship', 'science', 'courier', 'transport']);
