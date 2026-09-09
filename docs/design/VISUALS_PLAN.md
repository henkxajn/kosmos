# VISUALS 1.0 — rejestr repo-side + zapis wykonania (slice'y V0, V1, V2, V3, V4)

> **Stan: V0, V1, V2, V3 i V4 ZAMKNIĘTE** (V4 — 2026-09-09, save **v101 bez migracji**,
> live-gate **PASS z dwoma zapisanymi odstępstwami**: §8 i §10). Arc VISUALS 1.0 nie ma
> otwartego frontu; kolejne slice'y otwierają się własnym zadaniem projektowym.

---

## ⚠ CZYM TEN PLIK JEST, A CZYM NIE JEST

To jest **repo-side REJESTR MACIERZYSTY findingów arca VISUALS** i zapis tego, co realnie
weszło do kodu. **PROJEKT** — decyzje `D-V0a…` i `D-V1a…D-V1m` wraz z uzasadnieniami —
mieszka **PO STRONIE WŁAŚCICIELA**; tutaj są odnośniki i skutki, nie kopia.

Plik powstał, bo reguła domu brzmi: **finding zamyka się w SWOIM rejestrze macierzystym**
(`OPEN_FINDINGS_INDEX.md` §„Czym ten plik jest", memory `close-findings-in-their-own-registry`),
a ten arc **jako jedyny nie miał rejestru w repo** — jego findingi nie miały gdzie zostać
zamknięte. Alternatywa (dopisanie ich do `OPEN_FINDINGS_INDEX.md`) uczyniłaby z indeksu
siódmy rejestr, czego ten plik **zabrania sam sobie**.

---

## 🔴 KOLIZJA NUMERACJI — czytaj PRZED użyciem KTÓREGOKOLWIEK numeru z tego pliku

**Numery 246-254 są w tym repo użyte DWA RAZY, przez dwa RÓWNOLEGLE prowadzone arce.**
Ten sam mechanizm co udokumentowany defekt 165/166 (`OPEN_FINDINGS_INDEX.md` §Defekt samej
numeracji) — tylko że tam kolidowały wpisy w jednym pliku, a tu **w historii commitów**:

| nr | arc VISUALS (ten plik) | arc EKONOMIA AI (`VESSEL_ORDERS_PLAN.md` / `CHAIN_ENTRY_PLAN.md`) |
|---|---|---|
| **246** | `_rebuildAllOrbits` nie zwalniał geometrii i materiału linii (`202d67d`) | wejście do łańcucha tier 3+, zatrzask z pasmem (`d284765`) |
| **247** | `_syncSmallBodies` wychodził PO demontażu zamiast przed (`a082899`) | sufit `startingSafetyStocks.warp_cores = 50` bez drenu |
| **250** | zaszyte `0.016` w animacjach real-time (`cc12e04`) | ograniczenia pakowania dla przyszłego F3 |
| **251** | churn materiału bake'u — 269,7 ms/mapa (`58628f8`) | `frigate_system_defender` płaci 2 `warp_cores` za nieużywalny silnik |
| **252** | zimny bake globusa po C0 (regresja przyjęta) | panel zdrowia AI emituje stałe ostrzeżenia |
| **253** | rozjazd palety mapa ↔ globus | (zajęte w `VESSEL_ORDERS_PLAN.md`) |
| **254** | martwy `renderBodyThumbnail` | (zajęte w `VESSEL_ORDERS_PLAN.md`) |

⚠ **`git log --oneline` pokazuje `fix(visuals): Finding 246` i `feat(246): E3H` obok siebie** —
to NIE jest ten sam finding. Grep po samym numerze **da dwa różne defekty**.

### ✅ ROZSTRZYGNIĘTE — 2026-09-06, PODPISANE PRZEZ WŁAŚCICIELA

**Arc VISUALS ma WŁASNĄ PRZESTRZEŃ NAZW z prefiksem `V-`** (`V-246`…`V-259`), wzorem
**W2 1-14**. Obowiązuje w całym repo, nie tylko w tym pliku:

> **numer goły = arc EKONOMIA AI · `V-<nr>` = arc VISUALS**

**Dlaczego prefiks, a nie renumeracja** (wariant zastosowany kiedyś do 165/166): numery są już
**w treści commitów**, których nie przepisujemy, więc przenumerowanie **nie usunęłoby
dwuznaczności z historii** — dodałoby **trzecią wersję prawdy**. Prefiks jest jedyną zmianą,
która działa **wstecz**: stary commit `fix(visuals): Finding 246` czyta się dziś jako `V-246`
bez dotykania historii.

⚠ **Commity tego arca sprzed decyzji nie zostały przepisane** — piszą „Finding 246/247/250/251”
bez prefiksu. To świadome: prefiks rozstrzyga **odczyt**, nie zapis historyczny.

---

## Co weszło — V0 (światło i higiena sceny)

| commit | treść |
|---|---|
| `01430b6` | natężenie światła gwiazdy zależne od klasy (`FEATURES.starClassLighting`) |
| `52f75c7` | chłodniejszy ambient dla gwiazd M/K (D-V0b, ta sama flaga) |
| `a20033b` | ambient M/K chłodzony **ODCIENIEM, nie ściemnianiem** (D-V0c) |
| `420d00f` | anizotropia tekstur planet, gazowców, pierścieni i gwiazd |
| `202d67d` | **V-246** — `_rebuildAllOrbits` zwalnia geometrię i materiał linii |
| `a082899` | **V-247** — `_syncSmallBodies` wychodzi PRZED demontażem + update in-place |

## Co weszło — V1 (żywy shader gazowca)

| commit | treść |
|---|---|
| `4849c8f` | **C0** — bake oddaje `rt.texture`, koniec 9 readbacków GPU→CPU |
| `58628f8` | **C0b / V-251** — wspólny materiał bake'u w OBU ścieżkach, koniec rekompilacji na mapę |
| `4812f28` | **C1a** — ŻYWY shader gazowca (statyczny), flaga `liveGasShaders` |
| `b5dfbb2` | **C1b** — ruch: rotacja różnicowa + dryf, obrót i oddech burz |
| `cc12e04` | **C2 / V-250** — animacje real-time po ZMIERZONYM dt, nie po zaszytym `0.016` |
| `abd1fc9` | kalibracja po live gate (ω 6→12 °/s, spin burz 0.55→1.0) |
| `0f20904` | **V-257** — spin geometrii pomija żywy shader gazowca (jeden ruch, jeden zegar) |
| `118f837` | finalna kalibracja ω 12→6 °/s **po** V-257 |

⚠ **Dwie kalibracje ω, nie jedna pomyłka.** Przed V-257 ruch widoczny na tarczy był **RÓŻNICĄ**
dwóch obrotów (spin geometrii na zegarze GRY **minus** dryf shadera na zegarze REALNYM), więc
ω=12 kompensowało odejmowany składnik. Po zdjęciu spinu ta sama liczba wyglądała na dwa razy
za szybką i wróciła do 6. Historia commitów wygląda na „odkręcenie kalibracji" i **nią nie jest**.

**Stan końcowy ruchu:** czysty shader, równik **6,0 °/s czasu REALNEGO** (obrót w 60 s), biegun
3,9 °/s (`OMEGA_SHEAR` 0.35), identycznie pod pauzą i bez, niezależnie od FPS, jeden kierunek na
całej tarczy. Token strojenia: `KOSMOS.threeRenderer.gasTuning.OMEGA_DEG = X` (działa natychmiast
i globalnie — `_tickGasMaterials` przepisuje `LIVE_GAS` do uniformów co klatkę).

**Kill-switch:** `FEATURES.liveGasShaders` (default **ON**). OFF = ścieżka bake'u z C0b, materiał
żywy **nie powstaje w ogóle**.

---

## Rejestr findingów arca (przestrzeń `V-`)

| # | status | treść |
|---|---|---|
| ~~**V-246**~~ | ✅ ZAMKNIĘTY w V0 (`202d67d`) | `_rebuildAllOrbits` nie zwalniał geometrii/materiału linii |
| ~~**V-247**~~ | ✅ ZAMKNIĘTY w V0 (`a082899`) | `_syncSmallBodies` — kolejność wobec demontażu + update in-place |
| **V-248** | ⬜ OTWARTY | 🟠 **`_starLight.color` jest PRZYPISANY (nie skopiowany) tą SAMĄ instancją `THREE.Color`, co uniform `uColor` shadera rdzenia gwiazdy** ⇒ mutacja światła **przemalowuje powierzchnię gwiazdy**. ⚠ To **nie jest** czysty defekt: fioletowy dysk **Dyson etap 4** świadomie na tym aliasie stoi. Rozprzęganie (`.clone()`) = **decyzja wizualna**, nie higiena — zmieni wygląd Dysona. Znalezione przy V0 commit 1 |
| **V-249** | ⬜ OTWARTY | 🟠 **Wyróżnienie orbit w trybie taktycznym cicho zanika po ~3 s.** `_tacticalOrbitStyled` trzyma referencje do MATERIAŁÓW, żeby później przywrócić stan, ale `_rebuildAllOrbits` **podmienia obiekty linii co 180 klatek** ⇒ boost siedzi na **nieżywych (już zwolnionych) materiałach**, a nowe linie **nigdy go nie dostają**. ⚠ **Pre-existing i NIEZALEŻNY od naprawy V-246** — tamta dotyczyła zwalniania zasobów, ta wiązania stanu. Znalezione przy V0 commit 3 |
| ~~**V-250**~~ | ✅ ZAMKNIĘTY w V1 (`cc12e04`) | zaszyte `0.016` s/klatkę w chmurach i gazowcu ⇒ tempo animacji zależne od FPS maszyny. Krok mierzony `performance.now`, **clamp 0,1 s** (`ANIM_DT_MAX_S`); arytmetyka wydzielona do eksportowanej `animDeltaSeconds` po to, żeby dała się sprawdzić WYKONANIEM. ⚠ Dwaj pozostali konsumenci zaszytego kroku (`_colonyMarkers.tick(0.016…)`, `_animateTradeFireflies`) **świadomie nietknięci** — ich tempo to osobna decyzja |
| ~~**V-251**~~ | ✅ ZAMKNIĘTY w V1 (`58628f8`) | `material.dispose()` na pass bake'u wymuszał pełną retranslację ANGLE. ZMIERZONE: **269,7 → 0,10 ms/mapa** (kontrola: nowy materiał BEZ dispose = 0,10 ⇒ sprawcą jest dispose, nie alokacja); ścieżka rocky **125,8 → 6,5 ms/ciało**, przy medianie 47 ciał w układzie ≈ **9,6 s rekompilacji** przy wczytaniu układu |
| **V-252** | ⬜ OTWARTY (regresja PRZYJĘTA) | zimny bake globusa po C0 |
| **V-253** | ⬜ OTWARTY | rozjazd palety mapa ↔ globus |
| **V-254** | ⬜ OTWARTY | martwy `renderBodyThumbnail` — ⚠ **nie usuwać** (decyzja z C1a) |
| **V-255** | ⬜ OTWARTY | ⚪ **Dwa pozostałe zaszyte kroki `0.016` real-time**: `_colonyMarkers.tick(0.016, camDist)` i `_animateTradeFireflies` ⇒ przy 30 fps chodzą **o połowę za wolno** (bliźniaki V-250). Kosmetyczne. Świadomie **nietknięte w C2** — ich tempo to osobna decyzja, nie skutek uboczny tamtej naprawy |
| ~~**V-256**~~ | ✅ ZAMKNIĘTY **JAKO ZGODNY Z PROJEKTEM** | „mapa ciała" globusa dla gazowców. ⚠ **Nie było defektu**: do gazowca **nie prowadzi żadna ścieżka UI** do mapy kolonii (tylko placówki-rafinerie, celowo identycznie jak przy planetoidach). Zgłoszenie z gate'u znaczyło „funkcji nie ma z projektu", nie „jest zepsuta". Statyczny trace ścieżki (sprawdzona wykonaniem: siatka 14×10, 96 kafli, bake osiągalny, brak wyjątku) zostaje jako dokumentacja stanu „gdyby jednak wywołać" |
| ~~**V-257**~~ | ✅ ZAMKNIĘTY w V1 (`0f20904` + `118f837`) | żywy gazowiec miał **DWA** ruchy na **DWÓCH** zegarach, o przeciwnych znakach ⇒ gracz widział ich różnicę `0,1719·fps − OMEGA_DEG` [°/s], a pod pauzą czysty shader (stąd „dryf odwraca się przy pauzie"). Bramka stoi na **MATERIALE** (`userData.gasUniforms`, jeden producent w repo), nie na `planetType` — inaczej ścieżka OFF straciłaby JEDYNY ruch, jaki ma |
| **V-258** | ⬜ OTWARTY | precesja `Ry·Rz` przy pochyleniu osi |
| **V-259** | ⬜ OTWARTY | pętla wycieku w `_syncGlobe` (canvas + kontekst na klatkę w gałęzi `catch`) |
| ~~**V-260**~~ | ✅ ZAMKNIĘTY w V2 (`033e794`) | **TRZECIA instancja klasy V-250, nigdzie niewymieniona**: `core.rotation.y += 0.0005` liczone NA KLATKĘ, więc obrót gwiazdy zależał od FPS (~1,72 °/s przy 60, dwa razy szybciej przy 120) i zamierał przy zbramkowanej pętli. Przeniesione do `_tickClouds` na ZMIERZONY krok; 0.03 rad/s jest identyczne co do bitu przy równych 60 fps. **Poza flagą** (D-V2z): OFF nie ma prawa przywracać defektu. ⚠ Gate zmierzył to LICZBOWO, bo oko nie widzi 1,72 °/s na prześwietlonej tarczy: 0.0300 rad/s bez throttlingu i pod pauzą, 0.0149 przy 20× wobec modelu klampa 0.0148 i sygnatury starego kodu 0.0030 |
| ~~**V-261**~~ | ✅ ZAMKNIĘTY w V4 (`7c8c5b6`) | 🟠 **Pierścienie Dysona wymiarowane wobec promienia sprzed `STAR_CORE_SCALE`.** `_addDysonRings` ma zaszyte `starRadius = 1.6` (wartość `_getEntityRadius`), a tarcza to `r * 3.0` = 2,34 (M) … 4,32 (F). Archeologia: pierścienie `8a26066` (2026-04-07) poprzedzają `a666a07` (2026-07-21, powiększenie tarczy). Skutek: pierścień etapu 1 oraz wewnętrzne pierścienie etapów 2-3 leżą W ŚRODKU nieprzezroczystej tarczy — stąd wrażenie, że na etapie 1 nic się nie dzieje. **ZAMKNIĘTE PRZED V-267 i to była cała pilność:** dziś te pierścienie WIDAĆ wyłącznie dlatego, że V-267 pozwala im rysować się PO tarczy — po naprawie głębi zniknęłyby CAŁKOWICIE (etap 1 na K/G/F, 2/2 pierścienie etapu 2 na F). Lekarstwo to **PODŁOGA** `max(1.6·scale, tarcza·4.0/3.6)`, a NIE podstawienie bazy: to drugie mnoży wszystko (etap 4 na G 6,40 → **14,40** WU, na F → 17,28, czyli wprost w problem „zajmowały cały ekran”, pod który dobrano `scale` w D3-fix). Podłoga podnosi tylko to, co i tak było niewidoczne: M bez zmian, G outer +0,0 %, F +20 %. ⚠ **§10 gate'u ŚWIADOMIE NIE URUCHOMIONY** — właściciel rozstrzyga, czy Sfera Dysona zostaje w grze w ogóle, więc **ocena estetyczna wspólnego promienia wewnętrznego etapów 1-3 na K/G/F jest ODROCZONA razem z tamtą decyzją**. Geometria pokryta keeperem 53/53; podłoga shipuje się as-is |
| **V-262** | ⬜ OTWARTY | 🔴 **Stan wizualny Dysona nie przeżywa ani wczytania zapisu, ani zmiany układu.** Jedyny emitent `dyson:visualStageChanged` to `DysonSystem._onSegmentCompleted`, a jedyny słuchacz rejestruje się w `GameScene` PO `dysonSystem.restore()`. `_disposeAllMeshes` kasuje pierścienie i zeruje `_dysonStage`, a `renderStar` niczego nie przywraca. Przy 20/20 nie ma już zdarzeń, więc utrata jest TRWAŁA, podczas gdy panel dalej melduje etap 4 z 4 |
| **V-263** | ⬜ OTWARTY | 🟠 **Etapy 3 i 4 nie dotykają tarczy gwiazdy.** Zmienia się WYŁĄCZNIE `_starLight.intensity` (i barwa na etapie 4, przez alias V-248). Nigdzie nie ma `_starGroup.visible`, mutacji `uBrightness` ani bramki etapu na `uGain` korony. Etap 4 daje JASNĄ fioletową tarczę wewnątrz NIEZMIENIONEJ pomarańczowej korony (`coronaCol` to świeży `Color`, nie alias). i18n obiecuje graczowi wiązki energii, gwiazdę przysłoniętą i prawie niewidoczną — renderer nie implementuje żadnej z tych trzech rzeczy |
| **V-264** | ⬜ OTWARTY | 🟠 **Sfera klikalna gwiazdy jest MNIEJSZA od tarczy** (`r * 2.5` wobec `r * 3.0`), a komentarz nad nią twierdzi odwrotnie — przestał być prawdziwy przy `a666a07`. Zewnętrzne 16,7 % promienia jest dziś martwe dla kliknięć, a protuberancje siedzą całkowicie poza tą sferą. ⚠ Świadomie NIE naprawione w V2 (rozstrzygnięcie U4): powiększenie sfery zmienia, co przechwytuje kliknięcia w pobliżu gwiazdy, a przy V-267 złapałoby planety orbit wewnętrznych (orbita 3,3 WU wewnątrz tarczy G 3,6 WU) — własny projekt i własny gate. **ODBLOKOWANE PO V4:** U4 odmawiał, bo powiększenie sfery połykałoby kliknięcia w planety, które gracz WIDZI wewnątrz tarczy. Po naprawie głębi planeta za gwiazdą jest NIEWIDOCZNA, więc „widoczna tarcza” == „obszar klikalny gwiazdy” staje się spójne i powiększenie jest jednolinijkowe |
| ~~**V-265**~~ | ✅ ZAMKNIĘTY w V2 (`b7c7360`) | `loadStarTextures` wczytywało `diffuse` i `normal`, których NIKT nie czyta — obaj wołający biorą wyłącznie `.emission`. Zmierzona cena bezczynności: 24 pliki ≈ 23,6 MiB na dysku, do 24 zbędnych żądań HTTP i ~64 MiB VRAM po rozpakowaniu. Scena układu schodzi z 3 plików na 1, Stratcom z 36 na 12. Pliki PNG zostają, generator nietknięty |
| ~~**V-266**~~ | ✅ ZAMKNIĘTY w V2 (`1079cd9`) | `_starPromCount` i `_starCoronaUniform` — pisane po dwa razy, nieczytane nigdzie; `git log -S` pokazuje, że weszły MARTWE już w `c02574f`, czyli były zaślepkami NAZEWNICZYMI nazwanymi dokładnie jak dwie rzeczy, które budował V2. Razem z nimi zniknął kontrakt POZYCYJNY `_starGroup.children[0]` (łamie się CICHO: kręci się nie ten mesh, a granulacja staje) oraz martwa lokalna `glow` |
| ~~**V-267**~~ | ✅ ZAMKNIĘTY w V4 (`94971d5`) | 🔴 **Sześć ręcznie pisanych ShaderMaterialów pisze głębię STAŁOPRZECINKOWĄ do bufora LOGARYTMICZNEGO** (starfield, mgławica, rdzeń, korona, atmosfera, chmury — żaden nie ma chunków `logdepthbuf_*`, a renderer ma `logarithmicDepthBuffer: true`). Gwiazda pisze ≈ 0,99999, planety ≈ 0,5, test to LessEqual — więc **planeta z DOWOLNEJ odległości wygrywa**. `MIN_ORBIT_AU = 0.3` = 3,3 WU wobec tarczy G 3,6 WU, czyli CAŁA orbita najbliższej planety mieści się w tarczy. Potwierdzone na gate'cie S3: wewnątrz tarczy widać przebijające planety i gwiazdy tła. ⚠ Naprawa zmienia okluzję gwiazdy wobec KAŻDEJ planety w grze — własny slice, własny gate. **ZAMKNIĘTE (V4/D2):** kanon `LogDepthChunks.js` (ZERO importów, wykonywalny pod node) wstawia chunki `logdepthbuf_*` do wszystkich sześciu; mgławica przez `depthTest: false` (D-D3), bo rysuje się PIERWSZA na wyczyszczonym buforze i nigdy do niego nie pisze. Flaga `sceneDepthUnification` (jedna na wszystkie sześć — głębia jest RELACJĄ). Sonda kompilacji 9/9 + KONTROLA pada. **LIVE GATE PASS** (§1-§3, §7): tranzyt, elipsy orbit i statki zasłaniane poprawnie, korona bez cięć i fantomowych dziur |
| **V-268** | ⬜ OTWARTY | 🟡 **Kamera wchodzi do wnętrza tarczy i nic tego nie pilnuje.** `_minDist` 0.3 wobec promienia rdzenia 2,29-4,57; klik w gwiazdę **nie robi auto-zoomu** (`ThreeRenderer:892` wyklucza `type === 'star'`), a jedynie obniża podłogę — więc ta pozycja to jedno kliknięcie i scroll, nie przypadek brzegowy. FrontSide wycina rdzeń, korona przestaje być zasłonięta i zalewa ekran przy `I(0) = 1.0`. V2 ogranicza własny wkład sufitem `CORONA_GUARD`, ale samego zalania nie naprawia |
| **V-269** | ⬜ OTWARTY | ⚪ `isTextureInCache` jest wyeksportowane i NIGDY niewołane. Tekstury w cache chroni dziś to, że `Material.dispose()` w three tylko wysyła zdarzenie — właściwość biblioteki, nie decyzja tego pliku |
| **V-270** | ⬜ OTWARTY | 🟠 **Przekręcenie `LIVE_GAS.OMEGA_DEG` na żywo jest SKOKIEM POŁOŻENIA, nie zmianą prędkości** — w SHIPOWANEJ ścieżce gazowca. `ThreeRenderer:3737` akumuluje `uGasTime += dt` bez wrapu, a `GasGiantShader:846` liczy `gasOmega(lat) * uGasTime`, więc zmiana ω po czasie *t* obraca pasy natychmiast o `Δω·t` — dla kalibracji 6→12 po dziesięciu minutach to ≈ 10 pełnych obrotów w jednej klatce. ⚠ To było pokrętło, którym arc V1 stroił ω **dwa razy**. Kształt naprawy: akumulować fazę w JS (D-V2u, zastosowane w całym V2) |

| ~~**V-271**~~ | ✅ ZAMKNIĘTY w V4 (`94971d5`) | 🔴 **Warstwa chmur nad tarczą planety jest MARTWA — instancja V-267 o innym skutku.** `_createSystemCloudMesh` daje sferę `FrontSide` r = 1.025 R z `depthTest: true`, geometrycznie PRZED powierzchnią, ale pisze głębię STAŁOPRZECINKOWĄ (~0,99997 przy w = 30), podczas gdy rdzeń planety z biblioteki three pisze LOGARYTMICZNĄ (~0,403) ⇒ przy `LessEqual` chmury przegrywają test na całej tarczy. **ZMIERZONE sondą A1** (warstwa `FrontSide` w tej samej konfiguracji: 9477 → **0** pikseli wewnątrz tarczy po dodaniu nieprzezroczystego rdzenia) i **POTWIERDZONE W GRZE na live gate'cie V3**: chmury widoczne wyłącznie jako obwódka przy krawędziach tarczy, dokładnie jak przewiduje model głębi. ⚠ NIE jest to regresja V3 — defekt jest pre-existing; V3 tylko dostarczył przyrząd, który go zmierzył. Naprawa = V-267 (własny slice, zmienia okluzję w całej grze). **ZAMKNIĘTE razem z V-267** — czysta instancja, bez własnej przyczyny. ⚠ Koszt naprawy jest tu ZEROWY: shader chmur ma `discard`, więc early-Z było wyłączone JUŻ, a 15 wywołań `snoise` na fragment było płacone codziennie za nic. **LIVE GATE PASS** (§5, §6, §9): chmury żywe na pełnych tarczach, bez migotania przy kącie stycznym, zasłona fog-of-war poprawnie je zakrywa |
| **V-272** | ⬜ OTWARTY | 🟠 **Księżyce z `atmosphere === 'thin'` nie dostają ani powłoki, ani chmur.** `getAtmosphereMoon` (`SystemGenerator.js:407-419`) potrafi zwrócić `'thin'` (duże księżyce w niskich temperaturach, Tytan-like), a `_addMoonMesh` nie buduje żadnej z tych warstw — dane mówią „atmosfera”, render milczy. ⚠ **Świadomie NIE naprawione w V3** (D-V3l): dodanie powłok czyni mapę BARDZIEJ wyrazistą, czyli odwrotnie do zlecenia |
| **V-273** | ⬜ OTWARTY | 🟠 **`_updatePlanetMesh` odbudowuje WYŁĄCZNIE rdzeń.** Powłoka i chmury zachowują promień i samo istnienie sprzed zmiany ⇒ planeta, która po kolizji zmieni masę, nosi powłokę o starym promieniu; planeta, która ZYSKA atmosferę, nigdy jej nie dostanie; która STRACI — nigdy nie zgubi. Pre-existing, znalezione przy audycie V3 |
| **V-274** | ⬜ OTWARTY | ⚪ **Szara zasłona fog-of-war leży WEWNĄTRZ powłoki.** `_syncBodyScanVeil` skaluje ją do `radius * 1.03`, a powłoka stoi na 1.08 ⇒ niezbadane ciało jest wyszarzone i jednocześnie nosi pełne halo. Po V3 halo jest już tylko dzienne, ale pytanie „czy zasłona ma tłumić też powłokę” zostaje otwarte |
| ~~**V-276**~~ | ✅ ZAMKNIĘTY w V4 (skutek uboczny) | 🟠 **Głębia korony i rdzenia ZLEWAŁA SIĘ przy oddaleniu, więc korona rozjaśniała TARCZĘ w domyślnym kadrze szerokich układów.** Rozdzielenie stałoprzecinkowe rdzeń↔korona to **8,7 ULP przy kamerze 85 WU, 0,4 ULP przy 400 i 0,0 przy 2000** (bufor DEPTH_COMPONENT24, 1 ULP = 5,96e-8). Poniżej 1 ULP wartości są RÓWNE, a `LessEqual` przepuszcza ⇒ korona rysuje się po tarczy. Próg: **M ≈199 · K ≈228 · G ≈248 · F ≈271 WU**. `frameSystem` otwiera układ na `clamp(maxOrbitAU × 20, 70, 450)`, więc układ z orbitami ≥ 12,5 AU **startuje wewnątrz pasma przecieku** — to był domyślny widok, nie przypadek brzegowy. Po naprawie rozdzielenie logarytmiczne wynosi **17 763 ULP przy 400 WU**. ⚠ Nigdy wcześniej nienazwane; znalezione rachunkiem przy audycie V-267. **LIVE GATE PASS** (§4): tarcza gwiazdy identyczna przy 100 i 400+ WU — domknięte OKIEM, nie tylko rachunkiem |
| ~~**V-278**~~ | ✅ ZAMKNIĘTY w V4 (`95c8833`) | ⚪ **Warstwa chmur nie miała ANI JEDNEGO pokrętła** — liczby zaszyte w GLSL, bez obiektu strojenia, bez aliasu na rendererze, bez pisarza per klatkę. Łamie regułę „pokrętło albo ŻYWE, albo jawnie BAKED” i czyniło krok gate'u „czy chmury nie są za głośne” niewykonalnym bez edycji kodu i F5. `LIVE_CLOUDS` + `cloudTuning`: ALPHA · COVERAGE_LO/HI · NIGHT_FLOOR uniformem, **DRIFT_MULT mnoży KROK, nie fazę** (anti-V-270: `uTime` jest akumulowane, więc mnożnik w GLSL byłby SKOKIEM POŁOŻENIA). Wartości = dzisiejsze literały, commit liczbowo neutralny. **LIVE GATE: domyślne ZATWIERDZONE przez właściciela — `ALPHA` zostaje 0.88**, warstwa shipuje się bez ani jednego strojenia; pokrętła zostają jako żywy instrument |
| **V-275** | ⬜ OTWARTY | ⚪ **Rodzina V-253: mapa daje WSZYSTKIM planetom skalistym i lodowym ten sam `0x4488ff`.** `glowColor` jest `null` dla `rocky`/`gas`/`ice` w `PLANET_TYPE_CONFIG` (niezerowy tylko dla `hot_rocky`), więc fallback łapie prawie wszystko — podczas gdy `PlanetShader.createUniforms` ma gotową tablicę `atmColors` per typ (ice jasny błękit, volcanic pomarańcz, desert piaskowy). ⚠ **Świadomie POZA V3** (D-V3o): zmiana koloru każdej planety naraz zabrudziłaby gate'owi odczyt zmiany oświetleniowej. Najtańszy krok następny, gdyby mapa miała być mniej monotonna |

✅ **Granica dowodu — UZUPEŁNIONA 2026-09-06.** Treść **V-248, V-249, V-255** została dopisana
z rejestru właściciela (backfill), więc ten rejestr jest **samowystarczalny**: nie trzeba
sięgać gdzie indziej, żeby wiedzieć, **co** jest otwarte i **dlaczego** nie zostało ruszone.
⚠ **UZASADNIENIE PROJEKTOWE** (dlaczego akurat tak, jakie warianty odpadły) zostaje po stronie
właściciela — dla niego **rejestr właściciela jest źródłem prawdy**, a ten plik odsyła.
⚠ Trzy wpisy nie były przeze mnie **zmierzone w źródle** — są przepisane. Przed planowaniem
czegokolwiek z nich obowiązuje reguła domu: **uruchom keeper i `git log -S`**
(`OPEN_FINDINGS_INDEX.md` §Granica dowodu, lekcja W3-32).

---

## Metody weryfikacji, które ten arc wprowadził do domu

Obie powstały z **własnych nieudanych pomiarów** i obie są dziś regułą, nie preferencją:

1. **Dyskryminacja-vs-kontrola** — dla porównań, które **z projektu nie mogą wyjść identyczne**
   (żywy shader vs bake). Próg bezwzględny („korelacja > 0,9") jest tu **zgadywaniem skali**:
   dał 0,867 i nie odróżniał niczego, a po detrendingu 0,470 (ten sam seed) vs 0,419 (inny seed)
   — czyli **brak rozdziału**. Metryka musi porównywać **ten sam seed z innym seedem**, nie
   z wymyśloną liczbą.
2. **Przesunięcie w px przy krótkim Δt** — dla RUCHU. Korelacja **nasyca się**: 0,7003 vs 0,7027
   przy **trzykrotnej** różnicy ω. Mierzy się przesunięcie, nie podobieństwo.

3. **Bateria mutacyjna jako UCZCIWY ZAMIENNIK niemożliwego fail-first** (V3/A0). Klasyczny
   fail-first nie istnieje dla commita, który TWORZY moduły: na `e9f12b7` keeper nie
   załadowałby się w ogóle (importy nie istniały), więc „padło N asercji” nie ma jak powstać.
   Zamiast udawać pomiar, wprowadza się BATERIĘ: N celowych mutacji kodu produkcyjnego,
   każda uruchamiana i **rewertowana z weryfikacją bit w bit**, z wymogiem, żeby KAŻDA dała
   non-zero exit. A0: 8/8, A1: 12/12. ⚠ Mutant, który się **nie aplikuje** (zła kotwica),
   liczy się jako **JAŁOWY**, nie jako zdany — w A1 zdarzyło się raz i pin trzeba było
   dobić osobno; był to akurat najważniejszy strażnik slice'u (złota suma ścieżki OFF).
4. **Pinuj NIEOBECNOŚĆ, gdy nieobecność jest decyzją** (V3/A0→A1). A0 asertował, że pięciu
   pokręteł **NIE MA**, bo ich czytelnik przychodził dopiero w A1 (reguła V-266). W A1 te
   asercje **miały paść** i zostały zamienione na piny OBECNOŚCI z kontrolami. Powód wpisuje
   się w nagłówek keepera — inaczej pin, który znika, wygląda później jak zgubiony.

⚠ **Trzecia lekcja, procesowa — moja własna błędna diagnoza, sprostowana w C2.** Sypanie się
harnessów modułowych przypisałem „zaśmieconym profilom Chrome" i przepisałem rytuał czyszczenia
profilu. Prawdziwą przyczyną był **mój serwer testowy**: `SimpleHTTPRequestHandler` domyślnie
mówi **HTTP/1.0** (połączenie na żądanie) przy **backlogu 5**, a strona importująca ~33 moduły
przebija go w jednym bursie — Chrome zapamiętuje zgubiony moduł jako **trwale nieudany**.
`protocol_version = "HTTP/1.1"` + `request_queue_size = 128` ⇒ przebiegi przechodzą za pierwszym
razem w ~2 s. **Rytuał leczący objaw wygląda dokładnie jak wiedza.**

---

## Ustalenia proceduralne tego arca (obowiązują dalej)

- **Ziarnistość weryfikacji: piny źródłowe + live gate.** `ThreeRenderer` **nie importuje się pod
  node**, a GLSL nie jest wykonywalny w sweepie ⇒ **nie próbować pokrywać zachowania shadera
  keeperem**. Tam, gdzie potrzebne było WYKONANIE (np. `_syncPlanetMeshes`, `animDeltaSeconds`),
  służył headless Chrome z prototypem wołanym na atrapie `this` — z **kontrolą pinu na kopii
  `HEAD`**, żeby pin nie świecił jałowo.
- **Jeden program dla wszystkich gazowców.** `customProgramCacheKey` domyślnie stringifikuje
  `onBeforeCompile`, więc funkcja **musi być modułowa i jedna**. ⇒ **TWARDA REGUŁA: każda wartość
  per-planeta idzie UNIFORMEM, NIGDY interpolacją stringa do GLSL** (domknięcie stringifikuje się
  do tekstu, nie do wartości).
- **Backticka nie wolno wstawić do literału szablonowego z GLSL** — `node --check` przechodzi,
  a plik jest zepsuty. Złapane dwa razy.

- **Każdy commit ruszający GLSL niesie headless-sondę kompilacji PRZED stagem — a sonda musi
  mieć KONTROLĘ, która pada** (dołożone w V2, kupione defektem). S4 tego nie zrobił i live gate
  zapłacił: shader nie kompilował się w ogóle (`Shader Error 1282, VALIDATE_STATUS false`),
  a że protuberancje są ZŁOŻONE w quad korony, martwy materiał zabrał ze sobą także strumienie
  S3. ⚠ Piny tekstowe keepera nie mogą tego złapać **z definicji**: wszystkie sprawdzane stringi
  BYŁY obecne, tylko w złej kolejności (deklaracja po użyciu), a pin tekstowy nie widzi
  kolejności deklaracji. Sonda: wirtualna strona serwowana z origin projektu (nic nie ląduje na
  dysku projektu), Chrome headless + SwiftShader, sprawdzane `gl.getError()`,
  `renderer.info.programs[].diagnostics`, przechwycone `console.error` **oraz NIEZEROWY** obraz
  z `readPixels`. Kontrola: materiał z celowo niezadeklarowaną funkcją musi dać `ok=false`
  i `glError 1282`.
- **Keeper trzeba przepuścić przez MUTACJĘ, zanim się mu uwierzy.** Przegląd adwersaryjny V2
  pokazał, że **24 z 40** asercji grupy `granFadeEdges` przechodziły na implementacjach, które
  ignorowały `FADE_MARGIN` i `FADE_EPS` — bo pinowany był `cross` (wielkość pomocnicza),
  a PRODUKTEM funkcji jest `lo`/`hi`. Trzy mutanty (`lo := sufit`, `margin 9.9`,
  `hi := lo + band*7`) przechodziły komplet; po dołożeniu pinów na WARTOŚCI dają 8-12 FAIL.
  **Pin na wielkości pomocniczej nie jest pinem na wyniku.**
- **Pin negatywny czyta KOD, nie komentarze.** Asercja „shader nie używa `discard`" padła na
  shaderze, który w komentarzu tłumaczy, DLACZEGO nie używa `discard`. Zdejmuj komentarze przed
  testem **i** dołóż kontrolę, że słowo faktycznie występuje w komentarzu — inaczej następna
  wersja pinu będzie ślepa w drugą stronę.
- **`git show` normalizuje końce linii, drzewo robocze ich nie zmienia.** Niezależna weryfikacja
  przeniesienia GLSL padła czterema fałszywymi rozjazdami, bo blob gita ma LF, a plik na dysku
  CRLF. Dla dowodu „co widzi przeglądarka" porównuj **dysk z dyskiem**; przy porównaniu z gitem
  normalizuj końce linii i **powiedz, że to zrobiłeś**. ⚠ Ta sama pułapka po stronie skryptów
  łatających: `Path.read_text()` w Pythonie tłumaczy `\r\n` → `\n` po cichu, więc kotwica
  zbudowana z CRLF nie trafia w plik, który jest CRLF.
- **Flaga `FEATURES` przełączona W KONSOLI łapie się dopiero przy PRZEBUDOWIE MESHY** (V3,
  gate §6). Materiał powstaje raz, w `addPlanetMesh`, więc samo przestawienie pola nic nie
  robi. Przebudowę wymusza **wejście w INNY układ** — odbicie się o mapę galaktyki i powrót
  do TEGO SAMEGO układu **nie wystarcza**. ⚠ I druga połowa: **`F5` wczytuje `FEATURES`
  z pliku**, więc kasuje przestawienie zrobione w konsoli. Krok gate'u „przełącz flagę
  i odśwież” jest więc **sprzeczny sam ze sobą** — albo konsola + zmiana układu, albo
  edycja `GameConfig.js` + `F5`.
- **Pokrętło musi być albo ŻYWE, albo jawnie `BAKED`.** Pokrętło nieczytane co klatkę i nieopisane
  kosztuje rundę gate'u: gate nim kręci, nie widzi zmiany i bierze to za dowód czegoś innego.
  W V2 zdarzyło się to dwa razy naraz (`PROM_DRIFT` martwe, `PROM_GAIN` czytane raz przy budowie
  materiału), i to **już PO passie re-gate'u**. Pilnuje tego strukturalny pin keepera (T12): każde
  pokrętło `LIVE_SUN` musi być albo czytane w `_tickSunMaterials`/`_tickClouds`, albo oznaczone
  `BAKED` w źródle.

---

## V2 — Sun 2.0 (ZAMKNIĘTY 2026-09-07, save v101 bez migracji, live-gate PASS na każdym slice)

Żywa gwiazda: kipiąca granulacja, promieniste smugi korony i protuberancje na limbie.
Cztery slice'y funkcyjne poprzedzone trzema commitami higieny, bo diff funkcji ma nie
kłamać o tym, co się zmieniło (precedens C8 `7201670`).

| commit | treść |
|---|---|
| `033e794` | **V-260** — obrót gwiazdy po ZMIERZONYM dt (0.03 rad/s), koniec zależności od FPS. **Poza flagą** (D-V2z) |
| `1079cd9` | **V-266** — usunięcie martwych zaślepek (`_starPromCount`, `_starCoronaUniform`, lokalna `glow`) + nazwany uchwyt rdzenia zamiast `children[0]` |
| `b7c7360` | **V-265** — `loadStarTextures` ładuje tylko `emission` (do 24 plików, 23,6 MiB i 64 MiB VRAM mniej) |
| `a95539e` | **S1** — rusztowanie: `SunShader.js` + `SunAnimationLogic.js` (ZERO importów) + flaga `liveSunShader` + `_tickSunMaterials` + `KOSMOS.debug.sunInfo()`. **Wizualnie JAŁOWE** |
| `b4caa57` | **S2** — żywa granulacja: mix z teksturą, domain warp obracany w płaszczyźnie stycznej, bramka progu bloomu z brzegami liczonymi na CPU. Zawiera wynik gate'u S2 (GUARD_BAND 0.25 → 0.08) |
| `7537d87` | **S3** — strumienie korony w kierunku ŚWIATA + NOŚNY sufit 0.98. Domyka U6: `THREE.Clock` nie dotyka już grupy gwiazdy |
| `6a716be` | **S4** — protuberancje jako cztery sloty w quadzie korony, dokładna maska sylwetki promień-kontra-kula, wspólny sufit |

**Kill-switch:** `FEATURES.liveSunShader` (default ON, brak klucza = OFF — idiom
`liveGasShaders`). ⚠ **BAZĄ stanu OFF jest gwiazda z commita `b7c7360`, a nie sprzed arca**:
poprawka V-260 stoi poza flagą, bo OFF nie ma prawa przywracać defektu.

### Dlaczego OFF jest identyczne Z KONSTRUKCJI, a nie z obietnicy

three kluczuje cache programów po TREŚCI ŹRÓDŁA shadera (`WebGLShaderCache._getShaderStage`
→ `customVertexShaderID` → `getProgramCacheKey`). S1 przeniósł cztery literały GLSL
z `renderStar` do `SunShader.js` **co do znaku**, a S2/S3/S4 ich NIE RUSZAŁY — dopisały
warianty `*_LIVE` obok. Identyczny string to identyczny `WebGLProgram` i identyczna klatka.
Keeper trzyma cztery sumy SHA-256 tych literałów (T0) i **mają przechodzić przez cały arc**:
jeśli któraś padnie, ktoś ruszył ścieżkę OFF i to jest defekt, a nie planowana zmiana.

⚠ **Sprostowanie wobec zapowiedzi z S1:** zakładałem, że S2 zmieni fragment rdzenia i suma
ma wtedy paść. Tak się nie stało i nie powinno było — kontrakt kill-switcha wymusza wariant
obok, nie modyfikację w miejscu.

### Bramka progu bloomu — sedno slice'u

Próg `UnrealBloomPass` jest niemal BINARNY (`smoothWidth` 0.01) i przepuszcza CAŁY teksel,
nie nadwyżkę, więc animowana granulacja przechodząca przez granicę sprawia, że **wrze MASKA
bloomu** — a zmniejszenie amplitudy tego nie naprawia, bo to nie jest problem wielkości.
Lekarstwo (D-V2e): poniżej `lo` granulacja jest PŁASKA, więc kontur L=1 przestaje zależeć
od szumu i staje się nieruchomym okręgiem.

⚠ **Brzegi liczy CPU CO KLATKĘ i to jest celowe.** `uColor` bywa mutowane W MIEJSCU przez
alias V-248 (etap 4 Dysona robi `setHex` na świetle, a to ta sama instancja `Color`) i nie
ma kanału powiadomienia o tej mutacji. Bezwarunkowe przeliczanie jest jedynym sposobem, żeby
bramka nadążała za Dysonem BEZ gałęzi per-etap — i to jest cała realizacja D-V2n. Keeper
pinuje tę samoadaptację jako kontrolę: przy barwie etapu 4 przecięcie wędruje w głąb tarczy
(M 0.397 → 0.572, G 0.031 → 0.747).

⚠ **Wynik live-gate S2 (wariant A):** z bramką wyłączoną CAŁKOWICIE limb klasy M przy tarczy
~936 px NIE migotał. Bramka zeszła więc do roli PODŁOGI: `GUARD_BAND` 0.25 → **0.08**. Zera
nie wybrano świadomie — przy `band = 0` shader widzi `hi == lo` i wchodzi w gałąź
`granFade = 1.0`, czyli bramki nie ma wcale.
⚠ **`GUARD_BAND` steruje TYLKO szerokością rampy.** Strefa płaska (`NdotV < lo`) zależy od
`FADE_MARGIN`/`FADE_EPS` i bandu nie słucha — na M to zewnętrzne **18,2 %** promienia
niezależnie od tej liczby. Zwężenie samej podłogi to zmiana `FADE_MARGIN`, świadomie
nierobiona: gate jej nie zażądał, a wszystkie domyślne wartości zostały podpisane jako finalne.

### Sufit korony jest NOŚNY, nie ozdobny

Zapas do progu przy limbie wynosi 5-12×, ale to zapas przy ZASŁONIĘTYM środku korony. Gracz
jednym kliknięciem i scrollem wchodzi do WNĘTRZA tarczy (V-268), gdzie `FrontSide` wycina
rdzeń, korona przestaje być zasłonięta i realny zapas klasy G spada do **1,115×**. Bez clampa
mnożnik 1.6 wypycha pełnoekranowy addytywny quad ponad próg. Gate S3 sprawdził to w najgorszej
osiągalnej pozycji kamery: zero bloomu przy `STREAMER_GAIN` 1.6 **oraz** 4.

⚠ Krok 5 re-gate'u S4 (`PROM_GAIN = 3` → brak zmiany) **nie przetestował sufitu**: to pokrętło
jest BAKED (czytane raz, przy budowie materiału). Sam sufit jest dowiedziony, bo to ten SAM
`min()`, który sprawdzono przy `STREAMER_GAIN = 4`, a tamto pokrętło jest żywe.

### Rozstrzygnięcia właściciela, na które stoi kształt slice'u

**U1** protuberancje ZŁOŻONE w quad korony (eliminacja klasy pułapek przeważa nad ekonomią
slotów) · **U2** obrót zostaje spinem geometrii; rotacja w shaderze i `OMEGA_SHEAR` poza
zakresem V2 · **U3** cztery sloty · **U4** V-264 zostaje ZGŁOSZONE, nie naprawione ·
**U5** bez histerezy — ciągła amplituda (D-V2v) jest mechanizmem · **U6** `THREE.Clock`
wycofany z grupy gwiazdy; każda faza akumulowana w JS z kroku C2.

### Świadomie POZA zakresem V2 (pełne wpisy w rejestrze wyżej)

V-261 · V-262 · V-263 · V-264 · V-267 · V-268 · V-269 · V-270. Żaden nie jest regresją V2;
V-267 i V-268 objawiły się na gate'cie S3 wewnątrz tarczy i zostały tam poprawnie
przypisane, a nie zrzucone na slice.

---

## V3 — ATMOSFERA PO STRONIE DNIA (ZAMKNIĘTY 2026-09-08, save v101 bez migracji, live-gate FULL PASS)

Powłoka atmosfery planet skalistych rysowała **pełny jasny pierścień dookoła tarczy,
niezależnie od oświetlenia** — wyraźnie widoczny po stronie nocnej, za terminatorem —
i była przy tym „bardzo wyróżniająca się" w ogóle. Dwa commity funkcyjne w kształcie
S1→S2 z V2 (rusztowanie jałowe, potem funkcja), bo diff funkcji ma nie kłamać o tym, co
się zmieniło.

| commit | treść |
|---|---|
| `65e9231` | **A0** — rusztowanie: NEW `AtmosphereShader.js` (GLSL przeniesiony VERBATIM) + NEW `AtmosphereLogic.js` (ZERO importów) + flaga `dayNightAtmosphere` + `_tickAtmoMaterials` + `KOSMOS.debug.atmoInfo()`. **Pikselowo jałowy z konstrukcji** |
| `d9499bb` | **A1** — `ATMO_FRAG_LIVE`: bramka N·L na ALFIE, fresnel per-fragment, wspólny `TERM_WIDTH`, usunięta martwa gałąź koloru nocy; `STRENGTH` 0.55 → 0.38 + mnożniki klasy atmosfery; NEW `ATMO_OFF_KNOBS` |
| (ten) | **A2** — docs + korekta dwóch komentarzy, które po gate'cie kłamały |

### Diagnoza — jedno zdanie

`alpha = glow(fresnel) * uStrength` **nie zawierała członu oświetlenia**. Kolor zmieniał się
z kątem słońca (dzień → terminator → noc), przezroczystość nie — a przy `AdditiveBlending`
(`SrcAlpha, One`) wkład na ekran to `kolor × alfa`, więc **alfa JEST jasnością**.

⚠ **Plumbing N·L JUŻ ISTNIAŁ i był poprawny**, co zmieniło rozmiar slice'u: `uLightDir` to
POZYCJA ŚWIATOWA gwiazdy (nazwa kłamie od zawsze), wpisywana w `_syncPlanetMeshes`, a fragment
liczył z niej `sunAngle` **per-fragment**, dokładniej niż precedens gazowca (kierunek w
przestrzeni widoku). V3 **nie dołożył ani jednego varyinga, ani jednego kanału do gwiazdy** —
przeniósł policzoną już wielkość z koloru do alfy.

⚠ Zasięg był systemowy, nie punktowy: `getAtmosphere` zwraca `'thin'` z prawdopodobieństwem
0,70-0,80 dla każdej nie-gazowej planety o `g ≥ 0,30`, więc **większość planet skalistych
w układzie nosiła ten pierścień** — stąd „w ogóle za bardzo się wyróżnia".

### Co zdecydowało o kształcie

- **`smoothstep(−TERM_WIDTH, +TERM_WIDTH, N·L)`, nie `clamp(N·L)`** — twardy lambert gaśnie
  liniowo przez **90° łuku**, czyli przygaszałby dzienny limb, tę część, która ma zostać.
- ⚠ **Świadomie NIE używamy geometrycznego cienia powłoki.** Punkt na powłoce r = 1.08 R wchodzi
  w cień dopiero przy `N·L ≈ −0,93` (bo `sin θ < 1/1,08`) — dosłowna geometria kazałaby świecić
  prawie całą noc. Renderujemy jednak **KOLUMNĘ** atmosfery, a jej masa rozpraszająca siedzi
  nisko i wchodzi w cień od razu za terminatorem. Wpis istnieje po to, żeby nikt tego
  „nie naprawił" na −0,93.
- **Ciepły pas dzieli `TERM_WIDTH` z bramką**: bramka ma w terminatorze wartość dokładnie 0.5,
  więc łuk sam przycisza się o połowę i ląduje na krawędzi zaniku — tam, gdzie w naturze jest.
  Jedno pokrętło rusza obiema rzeczami, więc nie mogą się rozjechać.
- **Gałąź koloru NOCY usunięta w wariancie żywym** — alfa i tak gasiła te fragmenty do zera,
  więc było to liczenie koloru, którego nikt nie zobaczy. ⚠ Sprzężenie do zapamiętania:
  podniesienie `NIGHT_FLOOR` daje residual w chromie DNIA, a nie w dawnym granacie.
- **Mnożnik klasy atmosfery** (`thin` 0.55 / `breathable` 1.00 / `dense` 1.35) wchodzi w
  ISTNIEJĄCY `uStrength`, liczony na CPU ⇒ shader nie dostał ani jednego pola na gęstość,
  a obniżona została MEDIANA pierścienia (bo `thin` jest najczęstsze), nie wszystko po równo.
- **`atmoScale` NIE jest pokrętłem** (D-V3c/W3 odrzucone): zwężenie 8-procentowego pierścienia
  zepchnęłoby go w aliasing przy typowej tarczy na mapie układu.

### ⚠ Sonda złapała defekt, którego projekt nie przewidział — TRZECI STAN kill-switcha

Fabryka **ścieżki OFF** liczyła siłę z `LIVE_ATMO`, więc po zmianie mistrza na 0.38 stan OFF
dawał `uStrength` **0.209 zamiast 0.55**. To nie jest „trochę inny odcień": kill-switch ma
przywracać stan SPRZED slice'u, a dawał **trzeci stan** — ani przed, ani po. Lekarstwo:
NEW **`ATMO_OFF_KNOBS`**, `Object.freeze`'owana migawka pokręteł sprzed slice'u, czytana
WYŁĄCZNIE przez fabrykę OFF i celowo **nie śledząca** `LIVE_ATMO`.

⚠ **Reguła, która z tego wychodzi:** kiedy kill-switch dzieli obiekt konfiguracji z wariantem
żywym, ścieżka OFF **musi mieć własną, zamrożoną kopię wartości**. Inaczej każda kalibracja
wariantu żywego po cichu przesuwa też stan „wyłączone".

### Pomiar (sonda kompilacji + funkcjonalna, Chrome headless + SwiftShader)

Gwiazda na +X, wąskie pasma limbu z pominięciem frędzla terminatora, 256×256:

| | noc (max) | dzień (max) | noc/dzień | pikseli świecących |
|---|---|---|---|---|
| **OFF (stan sprzed slice'u)** | **36** | 112 | **0,3214** | 19 992 |
| **ŻYWY (A1)** | **0** | 43 | **0,0000** | 9 596 |

Dzienny limb 112 → 43 = **0.209/0.55** co do trzeciego miejsca. Ciepły pas **123 → 43**:
przestał być najjaśniejszą rzeczą na ekranie. Pokrętła sprawdzone wykonaniem: `uDiscFade 0.25`
→ dzień 43→11 (×0,256) · `NIGHT_FLOOR 0.5` → noc 0→22 · `TERM_WIDTH 0.6` → szerszy zanik,
noc dalej 0. **KONTROLA SONDY PADA**: materiał z niezadeklarowaną funkcją GLSL daje
`glError 1282`, `VALIDATE_STATUS false`, 0 pikseli.

### Live gate 2026-09-08 — FULL PASS

§1-3 noc ciemna za terminatorem, dzienny limb zachowany, ciepły łuk obecny i spokojny, mapa
układu spokojniejsza z różnicowaniem wg klasy · §4 `atmoInfo()` co do liczby (0.209/0.380/0.513)
· §6 **rollback zweryfikowany WARTOŚCIĄ I OKIEM**: flaga OFF + przebudowa ⇒ `zywy:false`,
`uStrength` płaskie 0.55 z zamrożonej migawki, pełny pierścień sprzed slice'u razem z nocną
stroną; flaga ON przywraca nowy wygląd. **`STRENGTH = 0.38` zatwierdzone jako finalne.**

⚠ **§5 — hipoteza OBALONA pomiarem, pokrętło zostaje.** `FADE_PX` przy tarczach 2-32 px
z tamtego zapisu **nie dało dostrzegalnej różnicy** — pierścień jest tam i tak podpikselowy.
Shipuje się NEUTRALNIE (0/0) zgodnie z podpisem, ale przewidywanie z audytu („paciorkowy efekt
przy małych tarczach") **nie potwierdziło się** i nie należy go powtarzać bez nowego pomiaru.

⚠ **§7 — V-271 POTWIERDZONY W GRZE**: chmury widoczne wyłącznie jako obwódka przy krawędziach
tarczy, dokładnie jak przewidywał model głębi. **Nie jest to regresja A1** — defekt jest
pre-existing (V-267); V3 dostarczył tylko przyrząd, który go zmierzył.

### Kill-switch i granice

`FEATURES.dayNightAtmosphere` (default **ON**, brak klucza = OFF — idiom `liveGasShaders`).
Bramka stoi **u wołającego** (`addPlanetMesh`), więc przy OFF materiał żywy **nie powstaje
w ogóle**, a moduł shadera nie importuje `GameConfig` (ani i18n). ⚠ Zapis `uLightDir`
w `_syncPlanetMeshes` zostaje **poza flagą** — jest sprzed slice'u i karmi mieszankę koloru,
z której ścieżka OFF nadal korzysta.

⚠ **V3 musiał zostać efektem KRAWĘDZI.** Widoczny jest wyłącznie pierścień między 1,00 R
a 1,08 R; jakakolwiek „mgiełka nad tarczą" jest dziś kasowana testem głębi (V-267) i należy
do tamtego slice'u. Projekt jest przy tym odporny na przyszłą naprawę V-267: przy poprawnej
głębi powłoka `BackSide` nadal jest zasłaniana przez własną planetę.

**Świadomie POZA V3** (D-V3k/l/m/o): powłoka globusa kolonii (inny materiał, inny renderer,
inny defekt — płaska poświata `MeshBasic` bez oświetlenia) · księżyce z atmosferą (V-272) ·
rozpraszanie w przód (`V·L` — rozjaśnia cienki sierp, czyli działa przeciw zleceniu) ·
ujednolicenie palety (V-275).

**Testy:** keeper `src/testing/smoke/atmosphere_logic_smoke.mjs` **100/100** (T0 złote sumy
ścieżki OFF · T0b pin przeniesienia · T0c treść wariantu żywego, gdzie **każdy pin ma kontrolę
dającą ODWROTNY wynik na literale OFF** · T1/T2/T3/T6 wykonaniem · T4 wpięcie i pułapka D-V3j
· T5 idiom flagi). Baterie mutacyjne **8/8** (A0) i **12/12** (A1). Sweep **216/216 OK, 0 FAIL**
· `check-i18n` PASS · save v101 bez migracji · **zero kluczy i18n** (V3 nie dodaje napisów).

⚠ **Naprawiony defekt NIE MA numeru `V-`** i to jest świadome: przyszedł ze zrzutu ekranu
właściciela i został zamknięty w tym samym oddechu, więc nigdy nie mieszkał w rejestrze.
V3 **otwiera** natomiast pięć wpisów: V-271 … V-275.

---

## V4 — SPÓJNA GŁĘBIA SCENY (ZAMKNIĘTY 2026-09-09, save v101 bez migracji, live-gate PASS z dwoma odstępstwami)

Sześć ręcznie pisanych `ShaderMaterial`ów pisało głębię **stałoprzecinkową** do bufora,
w którym cała reszta sceny pisze **logarytmiczną**. Slice domyka tę niespójność, a razem
z nią cztery findingi, które z niej wynikały albo ją maskowały.

| commit | treść |
|---|---|
| `ebbc5df` | **D0** — NEW `LogDepthChunks.js` (ZERO importów) + keeper, **ZERO call-site'ów** |
| `95c8833` | **D1 / V-278** — `LIVE_CLOUDS` + `cloudTuning`, pokrętła ŻYWE, LICZBOWO NEUTRALNE |
| `7c8c5b6` | **V-261** — podłoga prześwitu pierścieni Dysona (PRZED naprawą głębi) |
| `94971d5` | **D2 / V-267 + V-271** — sześć materiałów pisze głębię logarytmiczną, flaga `sceneDepthUnification` |
| `e16e226` | **D3** — rejestr + zapis wykonania (przed gate'em) |
| (ten) | **D4** — wynik live gate'u, dwa odstępstwa, potwierdzenie domyślnych chmur |

**Kill-switch:** `FEATURES.sceneDepthUnification` (default **ON**, brak klucza = OFF — idiom
`liveGasShaders`). ⚠ **BAZĄ stanu OFF jest `7c8c5b6`, a nie stan sprzed arca**: poprawka V-261
stoi POZA flagą, bo bez niej etap 1 Sfery Dysona znikałby całkowicie na K/G/F (precedens
V-260/D-V2z: OFF nie ma prawa przywracać regresji, której ta flaga miała uniknąć).

### Diagnoza — jedno zdanie

Renderer mapy układu ma `logarithmicDepthBuffer: true` od `b06d831` (2026-03-29), gdzie
włączono go dla **zbliżeń na modele statków** przy `near = 0.001`; three wstrzykuje
`#define USE_LOGDEPTHBUF` do prefiksu KAŻDEGO nie-Raw materiału (ShaderMaterial włącznie),
więc define był w tych shaderach od zawsze i brakowało wyłącznie **ciał chunków**.

> **Te sześć zachowywało się, JAKBY LEŻAŁY W NIESKOŃCZONOŚCI** — wszystko z biblioteki
> było „przed” nimi, a one nie były przed niczym.

To jedno zdanie tłumaczy zarówno defekty, jak i **przypadkowe poprawności**, i dlatego było
warunkiem uczciwego audytu: starfield i mgławica NAPRAWDĘ są w nieskończoności, a powłoka
atmosfery jest `BackSide`, więc „za własną planetą” też jest jej poprawną odpowiedzią.
Trzy z sześciu wyglądały więc dobrze **przez przypadek zgodności znaku**.

⚠ **Chronologia tłumaczy, dlaczego nikt tego nie nazwał przez pięć miesięcy:** rdzeń, korona
i powłoka powstały `c02574f` (2026-03-04) i były wtedy POPRAWNE; flaga przyszła 25 dni
później i cicho je unieważniła; chmury (`a868277`) i starfield/mgławica (`611f00e`) urodziły
się już niespójne. Dwaj widoczni poszkodowani czytali się jak **braki funkcji** („chmury nad
tarczą nie są zrobione”, „gwiazda nie zasłania”), a nie jak błąd głębi — i dokładnie tak
zgłoszono V-271.

### Co zdecydowało o kształcie

- **DERYWACJA, nie kopia (D-D1).** Literały ścieżki OFF zostają nietknięte, więc **sześć
  złotych sum SHA-256** (SunShader ×4, AtmosphereShader ×2) przechodzi przez ten arc bez
  zmiany. Wariant „`*_DEPTH` wpisany obok”, którym V2 i V3 obsługiwały OFF/LIVE, **tutaj się
  nie skaluje**: dałby ~16 literałów i ~16 sum, czyli szesnastu nieutwardzonych bliźniaków,
  żeby ustrzec się przed jednym. Pinem zastępczym jest **round-trip co do bajtu**
  (`stripLogDepth(withLogDepth*(X)) === X`), który jest mocniejszy, bo dowodzi tożsamości
  ścieżek zamiast ją deklarować.
- **JEDNA FLAGA NA SZEŚĆ.** Głębia jest RELACJĄ: „naprawiona korona przy niepoprawionym
  rdzeniu” to konfiguracja, której nikt nigdy nie wypuścił (korona nieprzycinana nigdzie).
  Ta sama zasada co `aiStrikeRecall` i `defenseScope` — dwie flagi dałyby trzeci,
  nieokreślony stan (strukturalny odpowiednik TRZECIEGO STANU z V3/A1).
- **Flaga czytana FUNKCJĄ, nie stałą modułową.** Stała zamroziłaby ją na czas importu, więc
  przestawienie w konsoli nie złapałoby się NAWET po zmianie układu — a to jedyna ścieżka
  rollbacku bez edycji pliku i F5 (reguła z gate'u V3 §6).
- **Mgławica przez `depthTest: false`, nie chunki (D-D3).** Jest rysowana PIERWSZA
  (`renderOrder -2`) na wyczyszczonym buforze i nigdy do niego nie pisze, więc jej test głębi
  jest no-opem w obie strony; chunki kosztowałyby zapis `gl_FragDepth` na PEŁNOEKRANOWYM
  przebiegu najcięższego shadera sceny.
- **Bake (`PlanetShader`, ortho, offscreen) i trzy inne renderery — świadomie BEZ chunków.**

### ⚠ Trzy rzeczy, których pomiar nie potwierdził, tylko zmienił

1. **PIĄTY BLOK GLSL BYŁ WYMOGIEM, nie ostrożnością.** `logdepthbuf_vertex` woła
   `isPerspectiveMatrix()`, a ta funkcja mieszka w chunku `<common>`, którego żaden z tych
   shaderów nie dołącza (to gołe ciała `ShaderMaterial`, bez ani jednego `#include`).
   **Sam chunk wierzchołka nie skompilowałby się.** Definicja idzie więc jako osobny blok
   PREREQ, też przepisany co do znaku i też pinowany przeciwko bibliotece — czterech chunków
   przy tym NIE modyfikujemy, żeby pin „cztery teksty == cztery literały biblioteki” został
   prawdziwy.
2. **`logDepthBufFC` nie wymaga ANI JEDNEJ linii wiring-u.** Renderer ustawia go
   bezwarunkowo przy włączonej capability (`three.module.js:16658`), a `WebGLUniforms.setValue`
   jest **cichym no-opem** dla uniformu, którego program nie ma (`:5466`). Wystarczy go
   ZADEKLAROWAĆ. Audyt zakładał osobne wpięcie; nie było potrzebne.
3. **Rdzeń gwiazdy nie traci na tym wydajności — ZYSKUJE.** Opaque sortuje się
   `renderOrder → material.id → z`, a `material.id` stoi PRZED `z`; `initSystem` woła
   `renderStar` przed `addPlanetMesh`, więc rdzeń ma najniższe id i jest rysowany PIERWSZY —
   czyli dziś **nie ma żadnego early-Z do stracenia**, a po naprawie staje się prawdziwym
   okluderem dla planet za gwiazdą. Audyt wchodził w to z założeniem, że będzie odwrotnie.

### ⚠ Cena early-Z — zmierzona, jedna i nazwana

`gl_FragDepth` wyłącza early-Z dla całego draw calla i **nie da się tego cofnąć**: GLSL ES 3.00
nie ma `layout(depth_greater)`, czyli WebGL2 nie ma conservative depth. Realny koszt ma
**wyłącznie korona**:

| materiał | early-Z dziś | strata |
|---|---|---|
| starfield, chmury | **nie** (`discard` już je wyłącza) | 0 — a chmury płaciły 15 `snoise`/fragment za nic |
| mgławica | **nie** (rysowana pierwsza, pusty bufor) | 0 |
| rdzeń | **nie** (najniższe `material.id` ⇒ pierwszy) | 0, i staje się okluderem ⇒ **zysk** |
| powłoka | tak, nad własną tarczą | mała; shader bez szumu |
| **korona** | **tak** | **11,9 % powierzchni quada** (sylwetka rdzenia) |

Reszta tego, co early-Z odrzucało koronie, **była samym defektem** (dziury po planetach,
które są ZA nią). Waga ekranowa quada: **4,4 % wysokości² przy 85 WU**, 0,5 % przy 250,
0,2 % przy 450 — i 100 % przy 10 WU, gdzie jednak rdzeń jest backface-culled i nie ma czego
odrzucać. **Komentarz w `SunShader`, który tłumaczył wybór `return` zamiast `discard` właśnie
tą oszczędnością, został poprawiony w TYM SAMYM commicie** (precedens V3/A2). `return`
zostaje z drugiego, wciąż ważnego powodu: ~25 % quada nie ma nic do pokazania.

### Pomiar (sonda kompilacji, Chrome headless + SwiftShader)

Wirtualna strona serwowana z origin projektu (nic nie ląduje na dysku projektu),
HTTP/1.1 + `request_queue_size = 128`. Dziesięć przypadków: sześć materiałów sceny, trzy
warianty ŻYWE, jedna KONTROLA.

| tryb | wyniki |
|---|---|
| `pre` (przed D2) | 9/9 kompiluje, KONTROLA pada `glError 1282` / `VALIDATE_STATUS false` |
| `post` (po D2) | 9/9 kompiluje **z chunkami**, `chunked=true` prosto z FABRYK, KONTROLA pada |

Liczby niezerowych pikseli **identyczne w obu trybach** (rdzeń 23005 · korona 22892 ·
powłoka 16598 · chmury 11208 · mgławica 8031) — chunki zmieniają GŁĘBIĘ, nie cieniowanie.

⚠ **Pierwszy przebieg sondy złapał DWA jej WŁASNE defekty**, nie defekty gry: starfield
budowany bez `vertexColors` (three deklaruje `attribute vec3 color` tylko wtedy) oraz
rdzeń/korona ŻYWE ciągnięte tekstem, przez co `${GLSL_NOISE_LIB}` zostawało nierozwinięte
(`'$' : invalid character`). Sonda buduje teraz przez **prawdziwe fabryki**, więc kompiluje
dokładnie to, co gra wysyła do GPU.

### ⚠ Trzy lekcje procesowe z tego slice'u

1. **`node --check` NIE JEST TESTEM — potwierdzone po raz kolejny, w nowej postaci.** Ciało
   fabryki OFF powłoki czytało `logDepth`, którego **nie było w jej sygnaturze**: składnia
   poprawna, `ReferenceError` dopiero na żywej ścieżce. Złapane audytem „każde użycie musi
   mieć deklarację”, teraz pinowane liczbowo (T7).
2. **Pin, który liczy geometrię z formuły ZASZYTEJ W KEEPERZE, testuje sam siebie.** Pierwsza
   wersja keepera V-261 dawała fail-first **48/5**, bo T1/T2 przechodziły na niepoprawionym
   rendererze. Po przepięciu modelu na formułę **wybieraną na podstawie źródła** — 38/15.
3. **CRLF kąsa skrypty łatające, dokładnie tak, jak opisano w V2.** Wielolinijkowe kotwice
   z `\n` nie trafiają w plik, który jest CRLF; a skrypt, który przerywa na asercji PO
   częściowym zapisie, zostawia plik w stanie pośrednim. Stąd reguła praktyczna: albo
   `read_bytes().decode()` + kotwice z wykrytym `NL`, albo Write całego pliku.

### Live gate 2026-09-09 — PASS z dwoma zapisanymi odstępstwami

**§1-§7 i §9 PASS**, na żywo, jedna sesja: tranzyt poprawny (planeta **całkowicie
zasłonięta** za tarczą) · elipsy orbit przycinają się na tarczy · korona bez cięć wzdłuż
linii orbit i bez fantomowych dziur po planetach · **tarcza gwiazdy identyczna przy 100
i 400+ WU** (V-276 domknięty OKIEM) · **chmury ŻYWE na pełnych tarczach po raz pierwszy
od 2026-03-30** · brak migotania przy kącie stycznym · `atmoInfo()` bit w bit jak na
gate'cie V3 · statki poprawnie zasłaniane przez gwiazdę · zasłona fog-of-war zakrywa
chmury, halo zostaje na zewnątrz (V-274 bez zmian).

**§Rollback PASS:** OFF przez przebudowę w INNYM układzie daje **dokładnie** wygląd
sprzed slice'u, ON przywraca nowy — **żadnego trzeciego stanu** (to jest ten sam kontrakt,
który w V3/A1 złapała dopiero sonda).

**Domyślne chmury ZATWIERDZONE przez właściciela: `ALPHA` zostaje 0.88**, razem z resztą
`LIVE_CLOUDS`. Warstwa, która przez pół roku była niewidoczna, shipuje się bez ani jednego
strojenia — pokrętła (V-278) zostają jako żywy instrument, nie jako obejście.

#### ⚠ Odstępstwo 1 — §8 (wejście/wyjście z BattleView3D): NIE ZWERYFIKOWANE NA ŻYWO

Zapis właściciela, dosłownie: *„§8 (battle in/out) not exercisable at the gate — risk
accepted: loud failure mode + one-toggle mitigation; note it in the registry as »not
verified live«."*

Powód jest STRUKTURALNY, nie organizacyjny — i wyszedł dopiero przy zamykaniu:
`GameScene._tryShowNextBattle:3938` przy `FEATURES.fcCombatFx` i `source === 'dscs'`
pokazuje **wyłącznie baner wyniku**, więc **wszystkie bitwy deep-space kino OMIJAJĄ**.
`BattleView3D` startuje tylko dla **Path A** (war-driven) i tylko gdy gracz wybierze
„Obserwuj". Ta ścieżka jest w normalnej grze rzadka — co samo w sobie obniża ryzyko.
Pełny hand-off z procedurą powtórzenia: **`docs/deferred-live-gates.md` ENTRY 4**.

#### ⚠ Odstępstwo 2 — §10 (pierścienie Dysona): ŚWIADOMIE NIE URUCHOMIONE

Zapis właściciela, dosłownie: *„§10 (Dyson rings) deliberately not run — the owner is
deciding whether Dyson stays in the game at all; the aesthetic judgement on the
shared-floor spacing is DEFERRED with that decision; keeper coverage stands, V-261's floor
ships as-is."*

⚠ **To NIE jest luka w naprawie, tylko odroczona ocena estetyczna.** Geometria jest
pokryta keeperem `dyson_ring_clearance_smoke` **53/53** (4 klasy × 4 etapy, model liczony
formułą WZIĘTĄ ZE ŹRÓDŁA, fail-first 38/15), a sama poprawka **musiała** wejść przed
naprawą głębi, bo bez niej etap 1 zniknąłby całkowicie na K/G/F. Nierozstrzygnięte zostaje
jedno: czy wspólny promień wewnętrzny etapów 1-3 na K/G/F (skutek podłogi) czyta się dobrze
— i to pytanie czeka na decyzję, **czy Sfera Dysona w ogóle zostaje w grze**.

### Świadomie POZA V4 (zgłoszone, nie robione)

- **Analityczne odzyskanie oszczędności early-Z korony** — maska sylwetki rdzenia jest już
  policzona w tym shaderze (`uStarCenterWorld`/`uCamPosWorld`/`uCoreRadius`), więc wystarczyłby
  wczesny `return`. To slice WYDAJNOŚCIOWY: zmieszany z poprawnościowym odebrałby gate'owi
  możliwość atrybucji regresji.
- **V-264** (sfera klikalna gwiazdy) — ODBLOKOWANY przez V4, ale własny slice.
- **V-272 / V-273** — nietknięte; ⚠ **V-273 awansuje z latentnego na widoczny**: nieodświeżona
  warstwa chmur po `_updatePlanetMesh` była dotąd i tak niewidoczna nad tarczą.
- **V-274** — bez zmian w przyczynie; zasłona (1.03 R) poprawnie zakrywa teraz także ożywione
  chmury (1.025 R), bo jest rysowana później i bliżej. Pytanie „czy ma tłumić też powłokę
  (1.08 R)” zostaje otwarte.
- **V-248** — alias `_starLight.color` NIETKNIĘTY. Slice dodaje wyłącznie instrukcje głębi;
  nie czyta, nie kopiuje i nie klonuje `uColor`. Pokusa „posprzątania” przy okazji edycji
  fabryki rdzenia jest realna i dlatego zapisana.
