# VISUALS 1.0 — rejestr repo-side + zapis wykonania (slice'y V0, V1, V2)

> **Stan: V0, V1 i V2 ZAMKNIĘTE** (V2 — 2026-09-07, save **v101 bez migracji**, live-gate PASS
> na każdym z czterech slice'ów funkcyjnych). Arc VISUALS 1.0 nie ma otwartego frontu;
> kolejne slice'y otwierają się własnym zadaniem projektowym.

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
| **V-261** | ⬜ OTWARTY | 🟠 **Pierścienie Dysona wymiarowane wobec promienia sprzed `STAR_CORE_SCALE`.** `_addDysonRings` ma zaszyte `starRadius = 1.6` (wartość `_getEntityRadius`), a tarcza to `r * 3.0` = 2,34 (M) … 4,32 (F). Archeologia: pierścienie `8a26066` (2026-04-07) poprzedzają `a666a07` (2026-07-21, powiększenie tarczy). Skutek: pierścień etapu 1 oraz wewnętrzne pierścienie etapów 2-3 leżą W ŚRODKU nieprzezroczystej tarczy — stąd wrażenie, że na etapie 1 nic się nie dzieje |
| **V-262** | ⬜ OTWARTY | 🔴 **Stan wizualny Dysona nie przeżywa ani wczytania zapisu, ani zmiany układu.** Jedyny emitent `dyson:visualStageChanged` to `DysonSystem._onSegmentCompleted`, a jedyny słuchacz rejestruje się w `GameScene` PO `dysonSystem.restore()`. `_disposeAllMeshes` kasuje pierścienie i zeruje `_dysonStage`, a `renderStar` niczego nie przywraca. Przy 20/20 nie ma już zdarzeń, więc utrata jest TRWAŁA, podczas gdy panel dalej melduje etap 4 z 4 |
| **V-263** | ⬜ OTWARTY | 🟠 **Etapy 3 i 4 nie dotykają tarczy gwiazdy.** Zmienia się WYŁĄCZNIE `_starLight.intensity` (i barwa na etapie 4, przez alias V-248). Nigdzie nie ma `_starGroup.visible`, mutacji `uBrightness` ani bramki etapu na `uGain` korony. Etap 4 daje JASNĄ fioletową tarczę wewnątrz NIEZMIENIONEJ pomarańczowej korony (`coronaCol` to świeży `Color`, nie alias). i18n obiecuje graczowi wiązki energii, gwiazdę przysłoniętą i prawie niewidoczną — renderer nie implementuje żadnej z tych trzech rzeczy |
| **V-264** | ⬜ OTWARTY | 🟠 **Sfera klikalna gwiazdy jest MNIEJSZA od tarczy** (`r * 2.5` wobec `r * 3.0`), a komentarz nad nią twierdzi odwrotnie — przestał być prawdziwy przy `a666a07`. Zewnętrzne 16,7 % promienia jest dziś martwe dla kliknięć, a protuberancje siedzą całkowicie poza tą sferą. ⚠ Świadomie NIE naprawione w V2 (rozstrzygnięcie U4): powiększenie sfery zmienia, co przechwytuje kliknięcia w pobliżu gwiazdy, a przy V-267 złapałoby planety orbit wewnętrznych (orbita 3,3 WU wewnątrz tarczy G 3,6 WU) — własny projekt i własny gate |
| ~~**V-265**~~ | ✅ ZAMKNIĘTY w V2 (`b7c7360`) | `loadStarTextures` wczytywało `diffuse` i `normal`, których NIKT nie czyta — obaj wołający biorą wyłącznie `.emission`. Zmierzona cena bezczynności: 24 pliki ≈ 23,6 MiB na dysku, do 24 zbędnych żądań HTTP i ~64 MiB VRAM po rozpakowaniu. Scena układu schodzi z 3 plików na 1, Stratcom z 36 na 12. Pliki PNG zostają, generator nietknięty |
| ~~**V-266**~~ | ✅ ZAMKNIĘTY w V2 (`1079cd9`) | `_starPromCount` i `_starCoronaUniform` — pisane po dwa razy, nieczytane nigdzie; `git log -S` pokazuje, że weszły MARTWE już w `c02574f`, czyli były zaślepkami NAZEWNICZYMI nazwanymi dokładnie jak dwie rzeczy, które budował V2. Razem z nimi zniknął kontrakt POZYCYJNY `_starGroup.children[0]` (łamie się CICHO: kręci się nie ten mesh, a granulacja staje) oraz martwa lokalna `glow` |
| **V-267** | ⬜ OTWARTY | 🔴 **Sześć ręcznie pisanych ShaderMaterialów pisze głębię STAŁOPRZECINKOWĄ do bufora LOGARYTMICZNEGO** (starfield, mgławica, rdzeń, korona, atmosfera, chmury — żaden nie ma chunków `logdepthbuf_*`, a renderer ma `logarithmicDepthBuffer: true`). Gwiazda pisze ≈ 0,99999, planety ≈ 0,5, test to LessEqual — więc **planeta z DOWOLNEJ odległości wygrywa**. `MIN_ORBIT_AU = 0.3` = 3,3 WU wobec tarczy G 3,6 WU, czyli CAŁA orbita najbliższej planety mieści się w tarczy. Potwierdzone na gate'cie S3: wewnątrz tarczy widać przebijające planety i gwiazdy tła. ⚠ Naprawa zmienia okluzję gwiazdy wobec KAŻDEJ planety w grze — własny slice, własny gate |
| **V-268** | ⬜ OTWARTY | 🟡 **Kamera wchodzi do wnętrza tarczy i nic tego nie pilnuje.** `_minDist` 0.3 wobec promienia rdzenia 2,29-4,57; klik w gwiazdę **nie robi auto-zoomu** (`ThreeRenderer:892` wyklucza `type === 'star'`), a jedynie obniża podłogę — więc ta pozycja to jedno kliknięcie i scroll, nie przypadek brzegowy. FrontSide wycina rdzeń, korona przestaje być zasłonięta i zalewa ekran przy `I(0) = 1.0`. V2 ogranicza własny wkład sufitem `CORONA_GUARD`, ale samego zalania nie naprawia |
| **V-269** | ⬜ OTWARTY | ⚪ `isTextureInCache` jest wyeksportowane i NIGDY niewołane. Tekstury w cache chroni dziś to, że `Material.dispose()` w three tylko wysyła zdarzenie — właściwość biblioteki, nie decyzja tego pliku |
| **V-270** | ⬜ OTWARTY | 🟠 **Przekręcenie `LIVE_GAS.OMEGA_DEG` na żywo jest SKOKIEM POŁOŻENIA, nie zmianą prędkości** — w SHIPOWANEJ ścieżce gazowca. `ThreeRenderer:3737` akumuluje `uGasTime += dt` bez wrapu, a `GasGiantShader:846` liczy `gasOmega(lat) * uGasTime`, więc zmiana ω po czasie *t* obraca pasy natychmiast o `Δω·t` — dla kalibracji 6→12 po dziesięciu minutach to ≈ 10 pełnych obrotów w jednej klatce. ⚠ To było pokrętło, którym arc V1 stroił ω **dwa razy**. Kształt naprawy: akumulować fazę w JS (D-V2u, zastosowane w całym V2) |

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
