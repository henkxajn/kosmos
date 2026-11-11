# `CV1a-incoming-key-colour.json.gz` — kolory tekstur bazowych sześciu modeli właściciela (keeper maski koloru-klucza)

> ARC COMBAT VISUALS, krok CV-1a (plan `docs/design/COMBAT_VISUALS_PLAN.md` §2.11, §4 CV-1a; D-CV-12). Odbiorca: keeper
> `src/testing/smoke/cv_models_logic_smoke.mjs` T9 — maska koloru-klucza na PRAWDZIWYCH teksturach (panele niebieskie
> pancerników nigdy nie świecą, pierścień rdzenia warp świeci). Same pliki GLB leżą w `assets/models/ships/incoming/`, który
> NIE jest w git (10–13 MB każdy) — fixture niesie wyłącznie to, czego keeper potrzebuje.

| pole | wartość |
|---|---|
| nagrane | 2026-11-10/11, drzewo robocze na `98cfabe` (CV-1a przed commitem) |
| źródła | `assets/models/ships/incoming/{nonwarp,warp}_{frigate,destroyer,battleship}.glb` — sha256 każdego pliku w polu `files[].glbSha256` |
| dekoder | Chrome 157.0.8103.39 headless: `createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })` → `OffscreenCanvas.getImageData` — ten sam libjpeg-turbo, przez który idzie tekstura gry (GLTFLoader → ImageBitmap) |
| zakres tekseli | wyłącznie teksele w obszarze trójkątów UV siatki (rasteryzacja UV, środek teksela) — 52–59 % tekstury 2048² |
| kandydaci | barwa 150–270°, nasycenie ≥ 0,10, jasność ≥ 0,15 (nadzbiór wszystkiego, co maska może zapalić, i niebiesko-szarych paneli) |
| zapis | na plik: unikalne kolory sRGB 8 bit (klucz `r<<16 | g<<8 | b`) rosnąco, różnice kluczy i liczności jako varint, base64; `covered`, `candidates`, `unique`, `measured` |
| pomiar przy zapisie | parametry `KEY_COLOUR_DEFAULTS` (barwa 182°, tolerancja 12°, nasycenie 0,45, jasność 0,55, soft 0,06): zapalone % obszaru UV — nonwarp_frigate 0,000 · warp_frigate 0,557 · nonwarp_destroyer 0,002 · warp_destroyer 0,439 · nonwarp_battleship 0,000 · warp_battleship 0,531; teksele paneli ≥ 205° zapalone: 0 we wszystkich sześciu |

Regeneracja: skrypty pomiaru CV-1a (scratchpad sesji; dekodowanie w Chrome, rasteryzacja UV, histogram) — fixture jest
ważny dla tych sześciu plików GLB (sha256). Podmiana modelu właściciela w `incoming/` = nowy fixture (keeper porównuje
procent zapalonych z polem `measured`, więc stary fixture nie udaje nowego modelu).
