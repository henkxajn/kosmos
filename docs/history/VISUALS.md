# VISUALS 1.0 (V0–V4) — arc log (moved from CLAUDE.md)
> Moved verbatim from CLAUDE.md on 2026-11-16 (source lines 3833–4248). Historical record — it may describe code that has since changed or been removed; the authoritative records are the plan docs in docs/design/ named inside each section. Kept in the original language (Polish).

<!-- CLAUDE.md L3833–4248 -->
## VISUALS 1.0 — V0 (światło gwiazdy) + V1 (żywy shader gazowca) (save **v101 bez migracji**, live-gate PASS — ZAMKNIĘTE 2026-09-06; V2 „Sun 2.0" w osobnej sekcji niżej)

Rejestr macierzysty + zapis wykonania + rejestr findingów: **`docs/design/VISUALS_PLAN.md`**.
Projekt (decyzje `D-V0a…`, `D-V1a…D-V1m`) mieszka **po stronie właściciela** — w repo są skutki.

🔴 **KOLIZJA NUMERACJI — czytaj, zanim użyjesz numeru 246-254.** Ten arc i arc **EKONOMIA AI**
brały „następny wolny numer” **równolegle, z dwóch sesji**, więc `git log` pokazuje
`fix(visuals): Finding 246` obok `feat(246): E3H` — to **dwa różne defekty**. Ta sama klasa co
udokumentowany defekt 165/166, ale cięższa: tamta kolizja siedziała w jednym pliku, ta jest
**w historii commitów**.
✅ **ROZSTRZYGNIĘTE 2026-09-06 (podpisane):** **nie przenumerowujemy** — arc VISUALS ma prefiks
**`V-`** (wzorem **W2 1-14**). W całym repo: **numer goły z 246-254 = arc EKONOMIA AI · `V-<nr>` =
VISUALS**. Powód: numery są **w treści commitów**, więc renumeracja dodałaby TRZECIĄ wersję prawdy
zamiast usunąć dwuznaczność; prefiks jest jedyną zmianą działającą **wstecz**. ⚠ Commity sprzed
decyzji **nie zostały przepisane** — prefiks rozstrzyga **odczyt**, nie zapis historyczny.
⚠ **Defekt 165/166 to NIE ten sam przypadek** i ta decyzja go **nie rozstrzyga**: tamta kolizja
nie weszła do historii commitów, więc renumeracja jest tam wciąż wykonalna — dalej czeka.

**V0 (światło + higiena sceny):** natężenie światła gwiazdy zależne od klasy (`FEATURES.starClassLighting`,
`01430b6`) · chłodniejszy ambient M/K przez **ODCIEŃ, nie ściemnianie** (`52f75c7`+`a20033b`) ·
anizotropia tekstur (`420d00f`) · **V-246** `_rebuildAllOrbits` zwalnia geometrię/materiał (`202d67d`) ·
**V-247** `_syncSmallBodies` wychodzi PRZED demontażem (`a082899`).

**V1 (żywy gazowiec)** — `4849c8f` C0 · `58628f8` C0b · `4812f28` C1a · `b5dfbb2` C1b · `cc12e04` C2 ·
`abd1fc9` kalibracja · `0f20904` V-257 · `118f837` finalna kalibracja:
- **C0** — bake oddaje `rt.texture`, koniec **9 readbacków GPU→CPU**. ⚠ Readback przemycał
  **reinterpretację przestrzeni barw**; parytet uzyskany przez otagowanie RT diffuse jako
  `SRGBColorSpace` (→ `SRGB8_ALPHA8`, sprzętowe kodowanie przy zapisie) + konwersję sRGB→linear
  **na KOŃCU** gałęzi diffuse w shaderze. Zmierzone: diffuse maxΔ = 1/255, normal i roughness
  **bit w bit**. ⚠ Cache przerobiony na **`WeakMap<renderer, Map>`** — globus kolonii **niszczy swój
  kontekst GL** przy każdym zamknięciu panelu, więc cache po samym `planet.id` podałby teksturę
  z martwego kontekstu (czarne planety na zawsze).
- **C0b / V-251** — wspólny materiał bake'u w OBU ścieżkach. `material.dispose()` na pass wymuszał
  pełną retranslację ANGLE: **269,7 → 0,10 ms/mapa** (kontrola: nowy materiał BEZ dispose = 0,10
  ⇒ sprawcą jest dispose, nie alokacja); rocky **125,8 → 6,5 ms/ciało**, przy medianie 47 ciał
  ≈ **9,6 s rekompilacji** na wczytanie układu.
- **C1a/C1b** — `MeshStandardMaterial` + **modułowy `onBeforeCompile`**, pasy/burze/czapy/rim liczone
  per-fragment; ruch: rotacja **różnicowa** ω(lat), dryf burz z prędkością ich pasma, własny obrót
  i wolny oddech. ⚠ **TWARDA REGUŁA: każda wartość per-planeta idzie UNIFORMEM, NIGDY
  interpolacją stringa do GLSL** — `customProgramCacheKey` domyślnie stringifikuje
  `onBeforeCompile`, więc jedna funkcja modułowa = **jeden `WebGLProgram` dla wszystkich gazowców**
  (zmierzone: 4 dodatkowe gazowce ⇒ programs 3→3, bez wzrostu).
- **C2 / V-250** — `0.016` zaszyte na klatkę ⇒ tempo animacji zależne od FPS maszyny. Krok mierzony
  (`performance.now`) + **clamp `ANIM_DT_MAX_S = 0.1`** (obowiązkowy: rAF zamiera w karcie w tle,
  a pętla ma jeszcze bramki `_contextLost` i `_renderingEnabled` ⇒ powrót po minucie dałby dt
  w SEKUNDACH i teleport każdej warstwy chmur). ⚠ Dwaj pozostali konsumenci zaszytego kroku
  (`_colonyMarkers.tick`, `_animateTradeFireflies`) **świadomie nietknięci**.
- **V-257** — żywy gazowiec miał **DWA ruchy na DWÓCH zegarach**, o przeciwnych znakach: spin
  geometrii (`_syncPlanetMeshes`, zegar GRY, stały przyrost **na klatkę**) minus dryf shadera
  (zegar REALNY) ⇒ gracz widział **różnicę** `0,1719·fps − OMEGA_DEG` [°/s], a pod pauzą czysty
  shader — stąd „dryf odwraca się przy pauzie”. ⚠ Bramka stoi na **MATERIALE**
  (`material.userData.gasUniforms`, **jeden producent w repo**), nie na `planetType`: inaczej
  ścieżka bake (flaga OFF) straciłaby **JEDYNY** ruch, jaki ma.

**Stan końcowy ruchu:** czysty shader, równik **6,0 °/s czasu REALNEGO** (obrót w 60 s), biegun
3,9 °/s, identycznie pod pauzą i bez, niezależnie od FPS. ⚠ **Dwie kalibracje ω to nie pomyłka**:
przed V-257 ω=12 kompensowało odejmowany spin, po jego zdjęciu ta sama liczba była dwa razy za
szybka i wróciła do 6. Token strojenia: `KOSMOS.threeRenderer.gasTuning.OMEGA_DEG = X`.
**Kill-switch `FEATURES.liveGasShaders`** (default ON; OFF = ścieżka bake z C0b, materiał żywy
**nie powstaje w ogóle**).

### ⚠ Trzy reguły z tego arca, które wychodzą poza niego

1. **Dyskryminacja-vs-kontrola** — dla porównań, które **z projektu nie mogą wyjść identyczne**
   (żywy shader vs bake) próg bezwzględny jest **zgadywaniem skali**: „korelacja > 0,9” dało 0,867,
   a po detrendingu 0,470 (ten sam seed) vs 0,419 (inny) — **brak rozdziału**. Metryka musi
   porównywać **ten sam seed z innym seedem**, nie z wymyśloną liczbą.
2. **Przesunięcie w px przy krótkim Δt** — dla RUCHU. Korelacja **nasyca się**: 0,7003 vs 0,7027
   przy **trzykrotnej** różnicy ω. Mierzy się przesunięcie, nie podobieństwo.
3. **Rytuał leczący objaw wygląda dokładnie jak wiedza.** Sypanie się harnessów modułowych
   przypisałem „zaspójnionym profilom Chrome” i przepisałem rytuał czyszczenia — **błędnie**.
   Przyczyną był serwer testowy: `SimpleHTTPRequestHandler` mówi domyślnie **HTTP/1.0** przy
   **backlogu 5**, a strona importująca ~33 moduły przebija go w jednym bursie — Chrome zapamiętuje
   zgubiony moduł jako **trwale nieudany**. `protocol_version = "HTTP/1.1"` + `request_queue_size = 128`
   ⇒ przebiegi przechodzą za pierwszym razem w ~2 s.

**Ziarnistość weryfikacji tego arca (ustalona z góry):** **piny źródłowe + live gate**.
`ThreeRenderer` **nie importuje się pod node**, a GLSL nie jest wykonywalny w sweepie ⇒ **nie
pokrywamy zachowania shadera keeperem**. Tam, gdzie potrzebne było WYKONANIE (`_syncPlanetMeshes`,
`animDeltaSeconds`), służył headless Chrome z **prototypem wołanym na atrapie `this`** — z kontrolą
pinu na kopii `HEAD`, żeby pin nie świecił jałowo. ⚠ **Backtick w literale szablonowym z GLSL**
przechodzi `node --check` i psuje plik — złapane dwa razy.

**Otwarte, zgłoszone** (pełne wpisy: `VISUALS_PLAN.md` §Rejestr): **V-252** (zimny bake globusa —
regresja PRZYJĘTA) · **V-253** (rozjazd palety mapa↔globus) · **V-254** (martwy
`renderBodyThumbnail` — **nie usuwać**) · **V-258** (precesja `Ry·Rz`) · **V-259** (pętla wycieku
w `_syncGlobe`) — oraz trzy, które warto znać z treści, bo każdy jest pułapką dla następnego:
- **V-248** — `_starLight.color` jest **PRZYPISANY (nie skopiowany)** tą samą instancją
  `THREE.Color`, co uniform `uColor` rdzenia gwiazdy ⇒ mutacja światła **przemalowuje powierzchnię
  gwiazdy**. ⚠ Fioletowy dysk **Dyson etap 4 świadomie na tym aliasie stoi** ⇒ `.clone()` to
  **decyzja wizualna**, nie higiena.
- **V-249** — wyróżnienie orbit w trybie taktycznym **cicho zanika po ~3 s**: `_tacticalOrbitStyled`
  trzyma referencje do MATERIAŁÓW, a `_rebuildAllOrbits` **podmienia obiekty linii co 180 klatek**
  ⇒ boost siedzi na zwolnionych materiałach, nowe linie nigdy go nie dostają. ⚠ **Pre-existing
  i NIEZALEŻNY od V-246** (tamta o zwalnianiu zasobów, ta o wiązaniu stanu).
- **V-255** — dwa pozostałe zaszyte kroki `0.016` (`_colonyMarkers.tick`, `_animateTradeFireflies`)
  ⇒ połowa tempa przy 30 fps. Bliźniaki V-250, **świadomie nietknięte w C2**.
**V-256 zamknięty JAKO ZGODNY Z PROJEKTEM** — do gazowca nie prowadzi żadna ścieżka UI do mapy
kolonii (tylko placówki-rafinerie, celowo jak przy planetoidach); zgłoszenie z gate'u znaczyło
„funkcji nie ma z projektu”, nie „jest zepsuta”.

**V2 — Sun 2.0 ZAMKNIĘTY 2026-09-07** — własna sekcja niżej.

---

## VISUALS 1.0 — V2 „Sun 2.0": żywa gwiazda (save **v101 bez migracji**, live-gate PASS na każdym slice — ARC ZAMKNIĘTY 2026-09-07)

Trzeci i ostatni slice arca VISUALS 1.0. Rejestr macierzysty + zapis wykonania:
**`docs/design/VISUALS_PLAN.md`** §V2. Projekt (decyzje `D-V2a…D-V2ab`, rozstrzygnięcia
właściciela **U1-U6**) mieszka **po stronie właściciela** — w repo są skutki.
⚠ **Prefiks `V-` obowiązuje** (kolizja numeracji z arciem EKONOMIA AI): numer goły 246-254 =
ekonomia, `V-<nr>` = VISUALS.

**Siedem commitów — trzy higieny, cztery funkcyjne** (diff funkcji ma nie kłamać o tym, co się
zmieniło; precedens C8 `7201670`):

| commit | treść |
|---|---|
| `033e794` | **V-260** — obrót gwiazdy po ZMIERZONYM kroku (`0.03` rad/s w `_tickClouds`) zamiast `+= 0.0005` na klatkę. **Poza flagą** (D-V2z): OFF nie ma prawa przywracać defektu |
| `1079cd9` | **V-266** — martwe zaślepki (`_starPromCount`, `_starCoronaUniform`, lokalna `glow`) + `_starCore` zamiast kontraktu pozycyjnego `_starGroup.children[0]` |
| `b7c7360` | **V-265** — `loadStarTextures` ładuje wyłącznie `emission` (−24 pliki, −23,6 MiB, −64 MiB VRAM; scena układu 3→1, Stratcom 36→12) |
| `a95539e` | **S1** — rusztowanie: NEW `SunShader.js` (GLSL + `LIVE_SUN`) + NEW `SunAnimationLogic.js` (**ZERO importów**, node-testowalne) + `FEATURES.liveSunShader` + `_tickSunMaterials` + `KOSMOS.debug.sunInfo()`. **Wizualnie JAŁOWE** |
| `b4caa57` | **S2** — żywa granulacja (mix z teksturą, domain warp w płaszczyźnie stycznej) + **bramka progu bloomu z brzegami liczonymi na CPU** |
| `7537d87` | **S3** — strumienie korony w kierunku ŚWIATA + **NOŚNY** sufit `CORONA_GUARD 0.98`. Domyka U6: `THREE.Clock` nie dotyka już grupy gwiazdy |
| `6a716be` | **S4** — protuberancje: 4 sloty **złożone w quad korony** (U1), maska sylwetki promień-kontra-kula, wspólny sufit |

**Kill-switch `FEATURES.liveSunShader`** (default ON; brak klucza = OFF — idiom `liveGasShaders`).
⚠ **BAZĄ stanu OFF jest gwiazda z `b7c7360`, NIE sprzed arca** — V-260 stoi poza flagą.

### ⚠ Cztery rzeczy z tego slice'u, które wychodzą poza niego

1. **OFF jest identyczne Z KONSTRUKCJI, nie z obietnicy.** three kluczuje cache programów po
   **TREŚCI ŹRÓDŁA** shadera (`WebGLShaderCache._getShaderStage` → `customVertexShaderID` →
   `getProgramCacheKey`) ⇒ identyczny string to identyczny `WebGLProgram` i identyczna klatka.
   Dlatego S1 przeniósł cztery literały GLSL **co do znaku**, a S2/S3/S4 ich **nie ruszały** —
   dopisały warianty `*_LIVE` obok. Keeper trzyma cztery sumy SHA-256 (T0) i **mają przechodzić
   przez cały arc**; padnięcie którejś znaczy, że ktoś ruszył ścieżkę OFF.
2. **Próg `UnrealBloomPass` jest niemal BINARNY** (`smoothWidth` 0.01) i przepuszcza **CAŁY
   teksel, nie nadwyżkę** ⇒ animacja przechodząca przez granicę sprawia, że **wrze MASKA bloomu**,
   a zmniejszanie amplitudy tego **nie naprawia** (to nie jest problem wielkości). Lekarstwo:
   poniżej progu `lo` granulacja jest PŁASKA, więc kontur `L=1` przestaje zależeć od szumu.
   ⚠ Brzegi liczy **CPU co klatkę i to jest celowe**: `uColor` bywa mutowane W MIEJSCU przez alias
   **V-248** (Dyson etap 4) bez żadnego kanału powiadomienia — bezwarunkowe przeliczanie to jedyny
   sposób, żeby bramka nadążała za Dysonem **bez gałęzi per-etap**.
3. **Sufit korony jest NOŚNY, nie ozdobny.** Zapas 5-12× to zapas przy **zasłoniętym** środku
   korony; gracz jednym kliknięciem i scrollem wchodzi **do wnętrza tarczy** (V-268), gdzie
   `FrontSide` wycina rdzeń i realny zapas klasy G spada do **1,115×**. Gate S3 sprawdził to
   w najgorszej **osiągalnej** pozycji kamery.
4. **Wynik live-gate S2 zmienił rolę bramki (wariant A):** z bramką wyłączoną CAŁKOWICIE limb
   klasy M przy tarczy ~936 px **nie migotał** ⇒ `GUARD_BAND` 0.25 → **0.08**, bramka jako
   PODŁOGA. Zera nie wybrano świadomie: przy `band = 0` shader widzi `hi == lo` i wchodzi w gałąź
   `granFade = 1.0`, czyli bramki nie ma wcale.

### ⚠ Ustalenia proceduralne dołożone przez V2 (obowiązują dalej)

- **Każdy commit ruszający GLSL niesie headless-sondę kompilacji PRZED stagem, a sonda musi mieć
  KONTROLĘ, która pada.** S4 tego nie zrobił i gate zapłacił: `Shader Error 1282,
  VALIDATE_STATUS false` (deklaracja po użyciu), a że protuberancje są **złożone w quad korony**,
  martwy materiał zabrał ze sobą także strumienie S3. ⚠ **Piny tekstowe nie mogą tego złapać
  z definicji** — wszystkie stringi BYŁY obecne, tylko w złej kolejności.
- **Keeper trzeba przepuścić przez MUTACJĘ, zanim się mu uwierzy** — **24 z 40** asercji
  przechodziło na implementacjach ignorujących pół funkcji, bo pinowana była wielkość pomocnicza
  (`cross`), a produktem są `lo`/`hi`. **Pin na wielkości pomocniczej nie jest pinem na wyniku.**
- **Pin negatywny czyta KOD, nie komentarze** (+ kontrola, że słowo faktycznie jest w komentarzu).
- **`git show` normalizuje końce linii, drzewo robocze nie** — porównuj **dysk z dyskiem**.
  ⚠ Ta sama pułapka w skryptach łatających: `Path.read_text()` w Pythonie tłumaczy CRLF na LF
  po cichu, więc kotwica CRLF nie trafia w plik, który JEST CRLF.
- ⚠ **Piąte, o pokrętłach:** pokrętło ani nieczytane co klatkę, ani jawnie opisane jako `BAKED`
  **kosztuje rundę gate'u** — gate nim kręci, nie widzi zmiany i bierze to za dowód czegoś innego.
  W V2 zdarzyło się to dwa razy naraz (`PROM_DRIFT` martwe, `PROM_GAIN` baked), **już PO passie
  re-gate'u**. Pilnuje tego strukturalny pin keepera T12.

**Testy:** NEW `src/testing/smoke/sun_animation_logic_smoke.mjs` **145/145** (T0 sumy GLSL ·
T1-T5 geometria/fade/faza · T6-T8 granulacja · T9 strumienie · T10-T11 protuberancje ·
T12 pin sierocych pokręteł). Sweep **212/212 OK, 0 FAIL** · `check-i18n` PASS · zero migracji ·
zero nowych kluczy i18n.

⚠ **Ziarnistość weryfikacji (jak w całym arcu):** piny źródłowe + live gate + headless-Chrome
sondy wykonaniowe. `ThreeRenderer` **nie importuje się pod node**, a GLSL nie jest wykonywalny
w sweepie ⇒ **zachowanie shadera nie jest pokryte keeperem** — pokrywa je live gate.

**Otwarte po V2 (żadne nie jest regresją V2, pełne wpisy w `VISUALS_PLAN.md` §Rejestr):**
**V-261** (pierścienie Dysona wymiarowane wobec promienia sprzed `STAR_CORE_SCALE`) ·
🔴 **V-262** (stan wizualny Dysona nie przeżywa wczytania zapisu — utrata TRWAŁA przy 20/20) ·
**V-263** (etapy 3-4 nie dotykają tarczy; i18n obiecuje trzy rzeczy, których renderer nie robi) ·
**V-264** (sfera klikalna mniejsza od tarczy — świadomie nietknięte, U4) ·
🔴 **V-267** (sześć ShaderMaterialów pisze głębię stałoprzecinkową do bufora logarytmicznego ⇒
planeta z DOWOLNEJ odległości wygrywa z gwiazdą; **naprawa zmienia okluzję w całej grze**) ·
**V-268** (kamera wchodzi do wnętrza tarczy) · **V-269** · **V-270**.

**Arc VISUALS 1.0 — stan po V3: bez otwartego frontu.** Kolejny slice otwiera się własnym
zadaniem projektowym.

---

## VISUALS 1.0 — V3 „atmosfera po stronie DNIA” (save **v101 bez migracji**, live-gate FULL PASS — ARC ZAMKNIĘTY 2026-09-08)

Czwarty slice arca VISUALS. Rejestr macierzysty + zapis wykonania: **`docs/design/VISUALS_PLAN.md`**
§V3. Projekt (decyzje `D-V3a…D-V3q`) mieszka **po stronie właściciela**; w repo są skutki.
⚠ **Prefiks `V-` obowiązuje** (kolizja numeracji z arciem EKONOMIA AI): numer goły 246-254 =
ekonomia, `V-<nr>` = VISUALS.

**Jedno zdanie:** powłoka atmosfery rysowała **pełny jasny pierścień dookoła tarczy niezależnie
od oświetlenia**, bo `alpha = glow(fresnel) * uStrength` **nie zawierała członu oświetlenia** —
kolor zmieniał się z kątem słońca, przezroczystość nie, a przy `AdditiveBlending` (`SrcAlpha, One`)
wkład na ekran to `kolor × alfa`, więc **alfa JEST jasnością**.

| commit | treść |
|---|---|
| `65e9231` | **A0** — rusztowanie: NEW `AtmosphereShader.js` (GLSL przeniesiony VERBATIM, sumy SHA-256 w keeperze) + NEW `AtmosphereLogic.js` (ZERO importow) + flaga `dayNightAtmosphere` + `_tickAtmoMaterials` + `KOSMOS.debug.atmoInfo()`. **Pikselowo jałowy z konstrukcji** |
| `d9499bb` | **A1** — `ATMO_FRAG_LIVE`: bramka N·L na ALFIE, fresnel per-fragment, wspólny `TERM_WIDTH`, usunięta martwa gałąź koloru nocy; `STRENGTH` 0.55 → 0.38 + mnożniki klasy atmosfery; NEW `ATMO_OFF_KNOBS` |
| (docs) | **A2** — rejestr + korekta dwóch komentarzy, które po gate'cie kłamały |

⚠ **Plumbing N·L JUŻ ISTNIAŁ i był poprawny** — to zmieniło rozmiar slice'u. `uLightDir` to
POZYCJA ŚWIATOWA gwiazdy (nazwa kłamie od zawsze), wpisywana w `_syncPlanetMeshes`, a fragment
liczył z niej `sunAngle` **per-fragment**. V3 **nie dodał ani jednego varyinga, ani jednego
kanału do gwiazdy** — przeniósł policzoną już wielkość z koloru do alfy.

**Kształt (podpisane D-V3a…D-V3q):** `smoothstep(−TERM_WIDTH, +TERM_WIDTH, N·L)` na ALFIE, nie
`clamp(N·L)` — twardy lambert gaśnie liniowo przez **90° łuku**, czyli przygaszałby dzienny limb ·
ciepły pas zmierzchu **dzieli `TERM_WIDTH` z bramką** (bramka ma w terminatorze dokładnie 0.5,
więc łuk sam przycisza się o połowę) · gałąź koloru NOCY **usunięta w wariancie żywym** (alfa
i tak gasiła te fragmenty do zera) · fresnel **per-fragment** (D-V3q — `vFresnel` fasetuje na
sferze 32×32 przy tarczy wypełniającej ekran) · `STRENGTH` 0.55 → **0.38** + mnożniki klasy
atmosfery **0.55 / 1.00 / 1.35** (`thin` / `breathable` / `dense`) przez ISTNIEJĄCY `uStrength`,
liczone na CPU ⇒ shader nie dostał ani jednego pola na gęstość, a obniżona została **MEDIANA**
pierścienia (`thin` jest najczęstsze), nie wszystko po równo.

⚠ **ŚWIADOMIE NIE używamy geometrycznego cienia powłoki** (D-V3n): punkt na powłoce 1.08 R wchodzi
w cień dopiero przy `N·L ≈ −0,93`, ale renderujemy **KOLUMNĘ** atmosfery, a jej masa rozpraszająca
siedzi nisko i wchodzi w cień od razu za terminatorem. Wpis istnieje po to, żeby nikt tego
„nie naprawił” na −0,93.

⚠ **SONDA ZŁAPAŁA DEFEKT, KTÓREGO PROJEKT NIE PRZEWIDZIAŁ — TRZECI STAN kill-switcha.** Fabryka
ścieżki OFF liczyła siłę z `LIVE_ATMO`, więc po zmianie mistrza na 0.38 stan OFF dawał `uStrength`
**0.209 zamiast 0.55** — ani przed slice'em, ani po. Lekarstwo: NEW **`ATMO_OFF_KNOBS`**,
`Object.freeze`'owana migawka pokręteł sprzed slice'u, czytana WYŁĄCZNIE przez fabrykę OFF.
**Reguła wychodząca poza ten arc:** kiedy kill-switch dzieli obiekt konfiguracji z wariantem
żywym, ścieżka OFF **musi mieć własną, zamrożoną kopię wartości** — inaczej każda kalibracja
wariantu żywego po cichu przesuwa też stan „wyłączone”.

**Kill-switch** `FEATURES.dayNightAtmosphere` (default ON, brak klucza = OFF — idiom
`liveGasShaders`). Bramka stoi **u wołającego** (`addPlanetMesh`), więc przy OFF materiał żywy
**nie powstaje w ogóle**, a moduł shadera nie importuje `GameConfig` (ani i18n). ⚠ Zapis
`uLightDir` w `_syncPlanetMeshes` zostaje **poza flagą** (jest sprzed slice'u).
⚠ `_tickAtmoMaterials` stoi w **PĘTLI RENDEROWANIA**, nie w `_syncPlanetMeshes` (D-V3j): tamta
biegnie z `physics:updated`, czyli **stoi przy pauzie**, a pokrętło pchane stamtąd byłoby dla
gate'u martwe (awaria `PROM_DRIFT` z re-gate'u S4). Funkcja **nigdy nie liczy dt** — dekret C1b.

**Pomiar (sonda, Chrome headless + SwiftShader, wąskie pasma limbu):** noc/dzień **36 / 112**
(OFF) → **0 / 43** (żywy), pikseli świecących 19 992 → 9 596; ciepły pas 123 → 43. KONTROLA SONDY
PADA (`glError 1282`, `VALIDATE_STATUS false`, 0 pikseli). **Live gate 2026-09-08 FULL PASS**,
`STRENGTH = 0.38` zatwierdzone jako finalne; rollback zweryfikowany **wartością i okiem**.

⚠ **DWIE NOTATKI PROCEDURALNE Z GATE'U (obowiązują dla KAŻDEJ flagi `FEATURES` dotykającej
materiałów):** flaga przestawiona **w konsoli** łapie się dopiero przy PRZEBUDOWIE MESHY, czyli
po wejściu w **INNY układ** — odbicie się o mapę galaktyki i powrót do TEGO SAMEGO układu
**nie wystarcza**; a **`F5` wczytuje `FEATURES` z pliku**, więc kasuje przestawienie z konsoli.
Krok gate'u „przełącz flagę i odśwież” jest więc **sprzeczny sam ze sobą**.

⚠ **§5 gate'u — hipoteza OBALONA pomiarem:** `FADE_PX` przy tarczach 2-32 px **nie dało
dostrzegalnej różnicy** (pierścień jest tam podpikselowy). Shipuje się NEUTRALNIE (0/0) zgodnie
z podpisem, ale przewidywanie „paciorkowego efektu przy małych tarczach” **nie potwierdziło się**.

⚠ **V3 musiał zostać efektem KRAWĘDZI** — widoczny jest wyłącznie pierścień między 1,00 R a 1,08 R;
jakakolwiek „mgiełka nad tarczą” jest dziś kasowana testem głębokości (**V-267**) i należy do tamtego
slice'u. Projekt jest odporny na przyszłą naprawę V-267: przy poprawnej głębi powłoka `BackSide`
nadal jest zasłaniana przez własną planetę.

**Testy:** keeper `src/testing/smoke/atmosphere_logic_smoke.mjs` **100/100** · baterie mutacyjne
**8/8** (A0) i **12/12** (A1), każdy mutant rewertowany z weryfikacją bit w bit · sweep
**216/216 OK, 0 FAIL** · `check-i18n` PASS · **zero kluczy i18n** (V3 nie dodaje napisów).
⚠ **Bateria mutacyjna to UCZCIWY ZAMIENNIK niemożliwego fail-first**: dla commita, który TWORZY
moduły, keeper na `HEAD` nie załadowałby się w ogóle, więc „padło N asercji” nie ma jak powstać.
⚠ Mutant, który się **nie aplikuje** (zła kotwica), liczy się jako **JAŁOWY**, nie jako zdany.

**Otwarte po V3 (żadne nie blokuje):** **V-271** 🔴 (warstwa chmur nad tarczą jest MARTWA —
instancja V-267; **ZMIERZONE** sondą 9477 → 0 px i **POTWIERDZONE W GRZE** na gate'cie: chmury
tylko jako obwódka przy krawędziach — **nie jest to regresja V3**) · **V-272** (księżyce
z `atmosphere: 'thin'` bez powłoki i chmur) · **V-273** (`_updatePlanetMesh` odbudowuje wyłącznie
rdzeń) · **V-274** (zasłona fog-of-war 1.03 leży WEWNĄTRZ powłoki 1.08) · **V-275** (rodzina
V-253 — wszystkie planety skaliste i lodowe dostają ten sam `0x4488ff`).

---

## VISUALS 1.0 — V4 „spójna głębia sceny" (save **v101 bez migracji**, live-gate PASS z dwoma odstępstwami — ARC ZAMKNIĘTY 2026-09-09)

Piąty slice arca VISUALS. Rejestr macierzysty + zapis wykonania: **`docs/design/VISUALS_PLAN.md`**
§V4. Projekt (decyzje `D-D1…D-D13`) mieszka **po stronie właściciela**; w repo są skutki.
⚠ **Prefiks `V-` obowiązuje** (kolizja numeracji z arciem EKONOMIA AI): numer goły 246-254 =
ekonomia, `V-<nr>` = VISUALS.

**Jedno zdanie:** sześć ręcznie pisanych `ShaderMaterial`ów pisało głębię **stałoprzecinkową**
(0,9967 przy d = 0,3 … 0,999999 przy d = 1850) do bufora, w którym cała reszta sceny pisze
**logarytmiczną** (0,031 … 0,883) — a przy `LessEqual` znaczyło to, że **te sześć zachowywało
się, jakby leżały w NIESKOŃCZONOŚCI**: wszystko z biblioteki było „przed" nimi, a one nie były
przed niczym.

| commit | treść |
|---|---|
| `ebbc5df` | **D0** — NEW `LogDepthChunks.js` (ZERO importów, wykonywalny pod node) + keeper, **ZERO call-site'ów** |
| `95c8833` | **D1 / V-278** — `LIVE_CLOUDS` + `cloudTuning`, pokrętła ŻYWE, **liczbowo neutralne** |
| `7c8c5b6` | **V-261** — podłoga prześwitu pierścieni Dysona, **PRZED** naprawą głębi |
| `94971d5` | **D2 / V-267 + V-271** — sześć materiałów pisze głębię logarytmiczną |
| `e16e226` | **D3** — rejestr + zapis wykonania (przed gate'em) |
| (ten) | **D4** — wynik gate'u + dwa odstępstwa |

**Kill-switch `FEATURES.sceneDepthUnification`** (default ON, brak klucza = OFF — idiom
`liveGasShaders`). ⚠ **BAZĄ stanu OFF jest `7c8c5b6`, nie stan sprzed arca** — poprawka V-261
stoi poza flagą (precedens V-260/D-V2z).

**Zamknięte findingi:** **V-267** (rdzeń nie zasłaniał NICZEGO — `MIN_ORBIT_AU 0.3` = 3,3 WU
mieści się CAŁE w tarczy G 3,6 WU) · **V-271** (warstwa chmur martwa nad tarczą, zostawała
2,5 % obwódki) · **V-261** (pierścienie Dysona w tarczy) · **V-276** NOWY (głębia korony
i rdzenia zlewała się poniżej 1 ULP powyżej ~199-271 WU ⇒ korona rozjaśniała tarczę
w domyślnym kadrze szerokich układów) · **V-278** NOWY (chmury bez ani jednego pokrętła).

### Live gate 2026-09-09 — PASS, dwa zapisane odstępstwa

**§1-§7 i §9 PASS** na żywo: tranzyt (planeta **całkowicie** zasłonięta za tarczą) · elipsy
orbit przycinają się na tarczy · korona bez cięć wzdłuż linii orbit i bez fantomowych dziur
po planetach · **tarcza identyczna przy 100 i 400+ WU** (V-276 domknięty OKIEM) · **chmury
ŻYWE na pełnych tarczach po raz pierwszy od 2026-03-30** · brak migotania przy kącie
stycznym · `atmoInfo()` bit w bit jak na gate'cie V3 · statki poprawnie zasłaniane ·
zasłona fog-of-war zakrywa chmury, halo zostaje na zewnątrz.
**§Rollback PASS:** OFF przez przebudowę w INNYM układzie = **dokładnie** wygląd sprzed
slice'u, ON przywraca nowy — **żadnego trzeciego stanu**.
**Domyślne chmury ZATWIERDZONE: `ALPHA` zostaje 0.88** — warstwa niewidoczna przez pół roku
shipuje się bez ani jednego strojenia; pokrętła (V-278) zostają jako żywy instrument.

⚠ **Odstępstwo 1 — §8 (wejście/wyjście z `BattleView3D`) NIE ZWERYFIKOWANE NA ŻYWO**, ryzyko
przyjęte przez właściciela (głośny tryb awarii + mitygacja jednym przełącznikiem). Powód jest
STRUKTURALNY i wyszedł dopiero przy zamykaniu: `_tryShowNextBattle:3938` przy `fcCombatFx`
i `source === 'dscs'` pokazuje **tylko baner wyniku**, więc **wszystkie bitwy deep-space kino
OMIJAJĄ**; `BattleView3D` startuje wyłącznie dla **Path A** (war-driven) i tylko po wyborze
„Obserwuj". Hand-off z procedurą powtórzenia: **`docs/deferred-live-gates.md` ENTRY 4**.

⚠ **Odstępstwo 2 — §10 (pierścienie Dysona) ŚWIADOMIE NIE URUCHOMIONE.** Właściciel
rozstrzyga, **czy Sfera Dysona zostaje w grze w ogóle**, więc ocena estetyczna wspólnego
promienia wewnętrznego etapów 1-3 na K/G/F jest **ODROCZONA razem z tamtą decyzją**.
To NIE jest luka w naprawie: geometria pokryta keeperem 53/53 (4 klasy × 4 etapy, model
liczony formułą WZIĘTĄ ZE ŹRÓDŁA), a podłoga **musiała** wejść przed naprawą głębi, bo bez
niej etap 1 znikałby całkowicie na K/G/F. Podłoga shipuje się as-is.

### ⚠ Cztery rzeczy z tego slice'u, które wychodzą poza niego

1. **DERYWACJA bije KOPIĘ, gdy kopii miałoby być więcej niż jedna.** Wzór V2/V3 („literał
   `*_LIVE` obok, przypięty sumą SHA-256") jest poprawny dla JEDNEJ pary ścieżek, ale tutaj
   dałby ~16 literałów i ~16 sum — szesnastu nieutwardzonych bliźniaków, żeby ustrzec się
   przed jednym. Ścieżka ON jest więc liczona z literału OFF przez czystą transformację, a pin
   zastępczy — **round-trip co do bajtu** — jest MOCNIEJSZY: dowodzi tożsamości, zamiast ją
   deklarować. Sześć istniejących złotych sum przeszło arc bez zmiany.
2. **Kolejność commitów jest częścią poprawki, nie kosmetyką.** V-261 musiał wejść PRZED
   naprawą głębi, bo dziś te pierścienie widać WYŁĄCZNIE dzięki defektowi — po naprawie
   znikłyby całkowicie. Żaden commit w sekwencji nie niesie regresji.
   ⚠ I odwrotnie: **dosłowny „one-liner" z audytu był ZŁY** — podstawienie bazy mnożyłoby
   wszystko (etap 4 na G 6,40 → 14,40 WU), więc weszła PODŁOGA, a odstępstwo zostało zmierzone
   i opisane w commicie.
3. **Instrument gate'u powstaje PRZED gate'em.** Chmury nie miały pokręteł, więc pytanie „czy
   nie za głośno" byłoby niewykonalne bez edycji kodu i F5 — a warstwa akurat po raz pierwszy
   staje się widoczna. Stąd `LIVE_CLOUDS` jako osobny, liczbowo neutralny commit.
   ⚠ `DRIFT_MULT` mnoży **KROK, nie fazę** (anti-V-270): `uTime` jest akumulowane, więc mnożnik
   w GLSL byłby SKOKIEM POŁOŻENIA.
4. **ODWRÓCENIE reguły „utwardź bliźniaka".** `PlanetGlobeRenderer` ma niemal identyczny
   shader chmur, `StratcomGalaxyRenderer` własny rdzeń gwiazdy — i **żadnego z nich nie wolno
   chunkować**: te renderery nie ustawiają `logarithmicDepthBuffer`, więc `logDepthBufFC`
   nigdy nie zostanie tam wgrany (zostanie 0) ⇒ `gl_FragDepth = 0` dla KAŻDEGO fragmentu.
   Mechaniczne zastosowanie domowej reguły zepsułoby globus kolonii. Pilnuje tego **pin**,
   nie komentarz.

### ⚠ Trzy pomiary, które zmieniły projekt (a nie potwierdziły go)

- **PIĄTY blok GLSL był WYMOGIEM kompilacji.** `logdepthbuf_vertex` woła `isPerspectiveMatrix()`
  z chunku `<common>`, którego te shadery nie dołączają — bez osobnego bloku PREREQ nie
  skompilowałby się ani jeden wariant wierzchołka. Czterech chunków przy tym NIE modyfikujemy,
  żeby pin „cztery teksty == cztery literały biblioteki" został prawdziwy.
- **`logDepthBufFC` nie wymaga ANI JEDNEJ linii wiring-u** — renderer ustawia go bezwarunkowo
  (`three.module.js:16658`), a `WebGLUniforms.setValue` jest cichym no-opem dla nieznanego
  uniformu (`:5466`). Wystarczy go ZADEKLAROWAĆ.
- **Rdzeń gwiazdy na tej naprawie ZYSKUJE, nie traci.** Opaque sortuje się
  `renderOrder → material.id → z`, `material.id` PRZED `z`, a `initSystem` woła `renderStar`
  przed `addPlanetMesh` ⇒ rdzeń jest rysowany PIERWSZY, więc nie ma dziś żadnego early-Z do
  stracenia, a po naprawie staje się prawdziwym okluderem. **Jedyna realna cena to korona:
  11,9 % powierzchni quada** (sylwetka rdzenia) — reszta tego, co early-Z jej odrzucało, była
  samym defektem. Komentarz w `SunShader`, który tłumaczył `return` zamiast `discard` właśnie
  tą oszczędnością, poprawiony w TYM SAMYM commicie.

⚠ **`node --check` NIE JEST TESTEM — nowa postać tej samej lekcji.** Ciało fabryki OFF powłoki
czytało `logDepth`, którego **nie było w jej sygnaturze**: składnia poprawna, `ReferenceError`
dopiero na żywej ścieżce. Pin T7 liczy teraz deklaracje parametru w obu modułach.

**Testy:** NEW `log_depth_chunks_smoke` **146/146** (fail-first D2 **127/19**; bateria mutacyjna
D0 **8/8 zabitych**, bo fail-first nie istnieje dla commita tworzącego moduł) · NEW
`cloud_tuning_smoke` **34/34** (fail-first 12/22) · NEW `dyson_ring_clearance_smoke` **53/53**
(fail-first 38/15) · `sun_animation_logic` 145/145 (cztery złote sumy nietknięte) ·
`atmosphere_logic` 101/101 (⚠ jeden pin V3 ROZLUŹNIONY z powodem w kodzie: wymagał dosłownie
jednoargumentowego `createAtmosphereMaterial(planet)`; inwariant „wybór fabryki robi RENDERER
na fladze" jest ten sam i dalej pinowany, plus dołożona kontrola dyskryminacji).
Sonda kompilacji: **9/9 wariantów, KONTROLA pada** (`glError 1282`), liczby pikseli identyczne
przed i po ⇒ chunki zmieniają GŁĘBIĘ, nie cieniowanie.
Sweep **219/219 OK, 0 FAIL** · `check-i18n` PASS · zero migracji · zero kluczy i18n.
Live gate **PASS** (§1-§7, §9, §Rollback); §8 i §10 — patrz odstępstwa wyżej.

⚠ **Ziarnistość weryfikacji (jak w całym arcu):** piny źródłowe + headless-Chrome sonda
kompilacji + live gate. `ThreeRenderer` nie importuje się pod node, a GLSL nie jest wykonywalny
w sweepie ⇒ **zachowanie głębi na ekranie nie jest pokryte keeperem** — pokrywa je live gate.

**Otwarte po V4:** **§8 kina** (`deferred-live-gates.md` ENTRY 4) · **estetyka odstępów pierścieni Dysona** (odroczona razem z decyzją o losie Sfery) · **V-264** (ODBLOKOWANY — po naprawie „widoczna tarcza" == „obszar klikalny") ·
**V-273** (awansuje z latentnego na WIDOCZNY: nieodświeżona warstwa chmur po `_updatePlanetMesh`
była dotąd i tak niewidoczna nad tarczą) · **V-274** (zasłona poprawnie zakrywa teraz ożywione
chmury; pytanie o powłokę zostaje) · V-248 · V-249 · V-252 · V-253 · V-255 · V-262 · V-263 ·
V-268 (log depth NIC tam nie zmienia — rdzeń backface-culled, korona testowana o nic) ·
V-269 · V-270 · V-272 · V-275 · analityczny early-out korony (follow-up wydajnościowy).

---

