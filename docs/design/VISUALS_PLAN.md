# VISUALS 1.0 — rejestr repo-side + zapis wykonania (slice'y V0 i V1)

> **Stan: V0 i V1 ZAMKNIĘTE** (2026-09-06, save **v101 bez migracji**, live-gate PASS).
> Następny slice: **V2 — Sun 2.0** (granulacja domain-warp, strumienie korony, protuberancje) —
> otwiera się WŁASNYM zadaniem projektowym w przyszłej sesji.

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

**REKOMENDACJA (NIEZASTOSOWANA — czeka na decyzję właściciela):** nie przenumerowywać, tylko
**nadać temu arcowi WŁASNĄ przestrzeń nazw z prefiksem `V-`** (`V-246`…`V-259`), wzorem
**W2 1-14**, który już dziś jest w `OPEN_FINDINGS_INDEX.md` oznaczony jako osobna przestrzeń.
Powód: numery są już **w treści commitów**, których nie przepisujemy, więc renumeracja (wariant
zastosowany kiedyś do 165/166) tutaj **nie usunęłaby dwuznaczności z historii** — dodałaby
trzecią wersję prawdy. Prefiks jest jedyną zmianą, która działa wstecz.
⚠ Do czasu decyzji **w tym pliku obowiązuje zapis `V-<nr>`**, a numer goły znaczy arc ekonomiczny.

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
| **V-248** | ⬜ OTWARTY | zgłoszony po stronie właściciela; treść **nie jest** w tym repo |
| **V-249** | ⬜ OTWARTY | jw. |
| ~~**V-250**~~ | ✅ ZAMKNIĘTY w V1 (`cc12e04`) | zaszyte `0.016` s/klatkę w chmurach i gazowcu ⇒ tempo animacji zależne od FPS maszyny. Krok mierzony `performance.now`, **clamp 0,1 s** (`ANIM_DT_MAX_S`); arytmetyka wydzielona do eksportowanej `animDeltaSeconds` po to, żeby dała się sprawdzić WYKONANIEM. ⚠ Dwaj pozostali konsumenci zaszytego kroku (`_colonyMarkers.tick(0.016…)`, `_animateTradeFireflies`) **świadomie nietknięci** — ich tempo to osobna decyzja |
| ~~**V-251**~~ | ✅ ZAMKNIĘTY w V1 (`58628f8`) | `material.dispose()` na pass bake'u wymuszał pełną retranslację ANGLE. ZMIERZONE: **269,7 → 0,10 ms/mapa** (kontrola: nowy materiał BEZ dispose = 0,10 ⇒ sprawcą jest dispose, nie alokacja); ścieżka rocky **125,8 → 6,5 ms/ciało**, przy medianie 47 ciał w układzie ≈ **9,6 s rekompilacji** przy wczytaniu układu |
| **V-252** | ⬜ OTWARTY (regresja PRZYJĘTA) | zimny bake globusa po C0 |
| **V-253** | ⬜ OTWARTY | rozjazd palety mapa ↔ globus |
| **V-254** | ⬜ OTWARTY | martwy `renderBodyThumbnail` — ⚠ **nie usuwać** (decyzja z C1a) |
| **V-255** | ⬜ OTWARTY | zgłoszony po stronie właściciela; treść **nie jest** w tym repo |
| ~~**V-256**~~ | ✅ ZAMKNIĘTY **JAKO ZGODNY Z PROJEKTEM** | „mapa ciała" globusa dla gazowców. ⚠ **Nie było defektu**: do gazowca **nie prowadzi żadna ścieżka UI** do mapy kolonii (tylko placówki-rafinerie, celowo identycznie jak przy planetoidach). Zgłoszenie z gate'u znaczyło „funkcji nie ma z projektu", nie „jest zepsuta". Statyczny trace ścieżki (sprawdzona wykonaniem: siatka 14×10, 96 kafli, bake osiągalny, brak wyjątku) zostaje jako dokumentacja stanu „gdyby jednak wywołać" |
| ~~**V-257**~~ | ✅ ZAMKNIĘTY w V1 (`0f20904` + `118f837`) | żywy gazowiec miał **DWA** ruchy na **DWÓCH** zegarach, o przeciwnych znakach ⇒ gracz widział ich różnicę `0,1719·fps − OMEGA_DEG` [°/s], a pod pauzą czysty shader (stąd „dryf odwraca się przy pauzie"). Bramka stoi na **MATERIALE** (`userData.gasUniforms`, jeden producent w repo), nie na `planetType` — inaczej ścieżka OFF straciłaby JEDYNY ruch, jaki ma |
| **V-258** | ⬜ OTWARTY | precesja `Ry·Rz` przy pochyleniu osi |
| **V-259** | ⬜ OTWARTY | pętla wycieku w `_syncGlobe` (canvas + kontekst na klatkę w gałęzi `catch`) |

⚠ **Granica dowodu tego rejestru:** treść **V-248, V-249, V-255** nie została mi nigdy podana —
wiem o nich tylko tyle, że są otwarte. Nie zgaduję ich; rejestr właściciela jest tu źródłem prawdy.

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

---

## V2 — Sun 2.0 (NIEROZPOCZĘTE)

Granulacja domain-warp, strumienie korony, protuberancje. **Otwiera się własnym zadaniem
projektowym** — ten plik nie przesądza ani zakresu, ani decyzji.
