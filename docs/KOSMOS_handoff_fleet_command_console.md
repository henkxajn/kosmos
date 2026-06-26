# Handoff — Fleet Command Console (reforma wizualna statków na mapie 3D)

> Dokument przekazania dla następnej sesji. Opisuje cel, plan, środki i efekt reformy
> wizualnej statków na mapie 3D układu („Konsola Dowodzenia"). Stan na 2026-06-26.

---

## 1. CEL (dlaczego)

Gracz spędzał ~cały czas w overlayach (Command / Colony / Economy) i niemal nic nie robił na
mapie 3D układu — co odbierało mapie sens istnienia. Reforma miała uczynić mapę 3D **główną
powierzchnią dowodzenia i obserwacji**: statki czytelne i niezawodnie zaznaczalne, ruch i
trajektorie efektowne, walka **widoczna na żywo** (wcześniej niewidoczna na głównej mapie),
skan z efektem, oraz **wydawanie rozkazów wprost z mapy 3D**.

Cztery zbieżne defekty zdiagnozowane na starcie:
1. LPM nie zaznaczał statku niezawodnie (raycast tonął na sub-pikselowych modelach GLB skala
   0.002–0.012; istniała też celowa bramka „read-only telewizor").
2. Walka deep-space (DSCS) była w 100% niewidoczna na głównej mapie.
3. Trajektorie = jedna płaska kreskowana linia.
4. Skan — zero sprzężenia zwrotnego na mapie.

## 2. DECYZJE GRACZA (zatwierdzone na starcie)

- **Kierunek: „Konsola Dowodzenia"** (mapa = powierzchnia dowodzenia; ramki RTS, kolorowe linie
  rozkazów, port FX walki, pętla zaznacz→PPM→rozkaz, insygnia).
- **Rozkazy z mapy: TAK** (świadome zniesienie „read-only telewizor"; zaznaczanie zwykłym LPM,
  CTRL+LPM zarezerwowane na multi-select).
- **Walka: ZASTĄP kino mapą** (pop-up `BattleView3D` znika dla bitew DSCS; walka na żywej mapie +
  ulepszona kamera/zoom; kino zostaje tylko dla bitew war-driven „Path A" bez żywych meshy).

Plan źródłowy: `C:\Users\Komputer\.claude\plans\chce-teraz-zrobic-dwie-fancy-sunset.md`.

## 3. PLAN / ŚRODKI (jak — architektura)

8 niezależnie-bramkowanych „slice'ów" na wspólnym fundamencie. Każdy ma flagę
`GAME_CONFIG.FEATURES.fc*` (rollback per-feature bez restartu). **Render/runtime-only — ZERO
zmian formatu save (v88 bez migracji).**

**Wspólny fundament (Slice 0):**
- `src/config/CombatFxConfig.js` — jedno źródło kolorów broni (`WEAPON_COLOR_BY_CATEGORY`) +
  stałe FX (czasy życia, `FX_MAX_ACTIVE`). Importowane przez ThreeRenderer i BattleView3D.
- `src/utils/VesselFxLogic.js` — **CZYSTE** funkcje (bez THREE, testowalne headless wzór
  `RaycasterPure.js`): `resolveFxEndpointRaw` (fog-of-war: own→live / enemy unknown→skip /
  rumor→positionLastKnown / contact+→live), `factionColorRaw`, `isEndpointVisibleByQuality`.
- `ThreeRenderer` helpery: `getVesselScreenPosition` (luka API — `getScreenPosition` był
  planet-only), `_factionColorHex`, `_resolveFxEndpoint`/`_isEnemyEndpointVisible`/
  `_isEnemyTargetable` (bramki intel), wspólny silnik FX `_activeEffects`/`_fxGroup`/`_spawnFx`/
  `_updateActiveEffects` (drain w `_startLoop`, real-time niezależny od pauzy, cap
  `FX_MAX_ACTIVE=120` drop-oldest, dispose 1:1, kind: tracer/flash/shieldRing/ring/pulse/ping/trail).

**Selekcja (Slice 0):** `GameScene._handleTacticalLeftClick` — screen-space `_getVesselAtScreen(40)`
zaznacza OWN statek (raycast tonie na GLB); `ui:selectionChanged` → ramki 2D.

**Walka + kamera bitwy (Slice 1):**
- `DeepSpaceCombatSystem._tickEncounter` emituje **FX-only** `combat:roundFx {encounterId,
  midpoint, events:[{attacker,target,category,hit,blockedByShield,aPos,tPos}]}` (snapshot pozycji
  AT EMIT). NIE dotyka matematyki walki.
- `ThreeRenderer._onCombatRoundFx` → smugi (kolor wg kategorii broni) + błyski + pierścień tarczy
  + znacznik starcia (midpoint, TTL). Endpointy = **pozycja sprite'a statku** (X/Y/Z) → smugi
  trafiają w realne tekstury. Fog-of-war bramkowany.
- `TimeSystem` auto-slow na `vessel:engaged` (gracz w starciu).
- `GameScene._tryShowNextBattle` — bitwy `source='dscs'` (Path B) pomijają modal kina → tylko baner.
- Kamera: łagodny auto-focus na bitwę (`vessel:engaged`) + close-up `camera:watchBattle` (wired,
  bez przycisku UI — close-up na model przez klik statku = `vessel:focus`).

**Rozkazy z mapy (Slice 7):** `GameScene._handleTacticalRightClick` — zniesiona bramka read-only;
target build (vessel pick + intel gate; else raycast worldPoint **skonwertowany przez
`worldToGameplay`** — patrz §5 fix#2) → `ui:rightClickMenuOpened`. Single-dispatch:
`RightClickMenu` (singleton) jest jedynym dispatcherem do `MOS.issueOrder`; mapa i FleetOverlay to
czyste emitery (mutex przez `isAnyOpen()`).

**Pozostałe slice'y:** #2 skan FX (snop+pierścień+ping na recon/observatory eventach), #3 linie
rozkazów kolorowane wg typu (`_orderLineColor`), #4 ramki RTS + paski paliwa (`_drawSelectionBrackets`
w UIManager via `getVesselScreenPosition`), #5 insygnia frakcji (intel-gated ≥contact, osobny
overlay), #6 banking-roll + pulsy startu/przybycia + smuga silnika.

## 4. EFEKT (co działa — live-gate)

Po 3 rundach live-gate (gracz testował w przeglądarce) — **wszystkie punkty PASS**:
- ✅ Selekcja LPM niezawodna; ramki RTS 2D widoczne z każdej odległości.
- ✅ Rozkazy PPM z mapy (po naprawie konwersji współrzędnych).
- ✅ Walka deep-space: smugi laserów trafiają w realne pozycje statków; engage działa.
- ✅ Walka orbitalna/abstrakcyjna („stare zasady"): burst-imitacja przy planecie (widoczna).
- ✅ Skan, linie rozkazów, insygnia, pulsy, banking, smuga silnika, zoom.

## 5. RUNDY POPRAWEK (live-gate findings)

**Runda 1:**
- **#2 rozkazy „unreachable target"** = `worldPoint` z raycastu był w Three.js WORLD coords
  (÷WORLD_SCALE=10), a `MOS.issueOrder` wymaga GAMEPLAY coords (×AU_TO_PX=110) → cel 10× za blisko
  origin. FIX: `_handleTacticalRightClick` konwertuje `worldToGameplay(wp.x, wp.z)` przed buildOrderSpec.
- **#3 walka „stare zasady", statki niefizycznie blisko** = DSCS odpala TYLKO przy fizycznym
  zbliżeniu ≤0.15 AU w deep-space. Normalny atak wroga → planeta → `EnemyAttackHandler`/`BattleSystem`
  (abstract/orbital, niewidoczne). FIX: `_onBattleResolvedFx`/`_spawnBattleBurst` — burst smug+błysków
  przy planecie dla bitew orbitalnych/abstrakcyjnych (player gate + deep-space pominięte).
- **#4 pierścień selekcji OGROMNY** → screen-constant. **Skan FX za krótki** → wydłużony.

**Runda 2:**
- **#4a smuga silnika = oślepiająca zielona kula** (additive glow kumulował się w punkcie) → gate
  ruchu + mniejszy + niższe krycie.
- **#4b pierścień DALEJ za duży** → 3D pierścień USUNIĘTY; wskaźnik = tylko ramki 2D (wzmocnione).
- **#3 lasery nie pasowały do statków** → endpointy z pozycji sprite'a (X/Y/Z).
- **#3 nie dało się engage** → bramka luźniejsza `_isEnemyTargetable` (≥rumor, nie ≥contact).

**Runda 3:**
- **#4a glow zbyt rozproszony/duży** → tekstura glow skondensowana (szybki spadek) + scale
  0.045→0.028 + lifetime 420→300ms.

## 6. POKRĘTŁA STROJENIA (tuning knobs)

- Pierścień selekcji: USUNIĘTY (call `_syncSelectionRings` wyjęty z `_startLoop`; metody martwe —
  można usunąć). Ramki: `UIManager._drawSelectionBrackets` (s=17, kolor mint).
- Smuga silnika: `ThreeRenderer._tickEngineTrails` (scale 0.028, opacity 0.22, lifetime 300ms,
  throttle 110ms, gate ruchu 0.06 WU) + tekstura `_getGlowTex`.
- Walka: smugi `_spawnCombatTracer` (flash 0.06, shield ring 0.06/0.10); kolory `CombatFxConfig`.
- Skan: `FX_RING_MS=1500`, `FX_PING_MS=1300`; rozmiary ringów w `_spawnScanFx`/`_spawnScanPing`.
- Kamera statku: `vessel:focus` (minDist 0.05, targetDist 0.9); scroll bands w `ThreeCameraController`.
- Bramki: `FEATURES.fc*` (wszystkie ON, `fcMultiSelect` OFF). `m3OrdersInteractive` musi być ON.

## 7. ODŁOŻONE / NEXT (na jutro)

- **Wykrywanie wrogów z dystansu (PRE-emptive engage)** — combat triggeruje przy ≤0.15 AU; żeby
  engage'ować z dystansu trzeba podbić zasięg detekcji (balans **observatory** / sensory własnych
  statków). To domena reformy detekcji obserwatorium, nie samej wizualnej. TODO z memory:
  „Własny statek gracza NIE podbija intelu — sprawdzić ProximitySystem→advanceVesselContact wiring".
- **Slice 8 multi-select** (CTRL+dodawanie / box-select) — `_selectedVesselId`→Set, ~66 referencji,
  `fcMultiSelect=false`.
- **Przycisk „Obserwuj bitwę"** — event `camera:watchBattle` wired w rendererze, brak emitera UI
  (np. w CombatHUD). Close-up na model dostępny przez klik statku.
- **Slice 6 idle-bob + osobna poświata silnika** (zostały banking + pulsy + trail).
- **Martwy kod do sprzątnięcia:** `_syncSelectionRings`/`_upsertSelectionRing`/`_disposeSelectionRing`
  + `SELECTION_RING_*` consts; `_syncRouteComet`/`_disposeRouteComet` + `_routeComet`/`_orderLineColor`
  comet path (route line color zostaje, comet usunięty).

## 8. JAK TESTOWAĆ (live-gate)

Live Server, scenariusz Cywilizacja / Power Test ze startowym frigatem:
1. **Selekcja:** LPM na statek → ramki RTS + kamera wlatuje. Pusty klik = odznacz.
2. **Rozkazy:** zaznacz swój statek → PPM w pustkę → „Lecisz tutaj"; PPM we wykrytego wroga → engage/pursue.
3. **Walka deep-space:** `?scenario=combat_sandbox` (uzbrojone floty gracz vs wróg) → zaznacz statek →
   PPM na wroga → „Zaangażuj" → statki się zbliżą ≤0.15 AU → smugi/błyski. Lub
   `KOSMOS.debug.spawnMyVessel('hull_frigate')` + `spawnEnemyAttack()` + engage.
4. **Walka orbitalna:** zostaw atak wroga dolecieć do planety → burst przy planecie.
5. **Skan:** sonda na recon → snop + pierścień + ping. **Trasy:** kolor wg rozkazu. **Insygnia/pulsy.**

## 9. WERYFIKACJA HEADLESS (smoki — UNTRACKED, w repo root)

- `tmp_fc_foundation_smoke.mjs` (25) — fog-of-war gating + kolory frakcji + cap FX.
- `tmp_fc_combat_fx_smoke.mjs` (11) — kontrakt smug walki (gating + kolory + opacity hit/miss).
- `tmp_fc_command_smoke.mjs` (10) — kontrakt rozkazów + konwersja worldToGameplay (fix#2).
- Regresja: `tmp_obs_detection_reform_smoke.mjs` 43/0, `tmp_unarmed_no_combat_smoke.mjs` 18/0.
- Uruchom: `node tmp_fc_*_smoke.mjs`. (Smoki untracked zgodnie z konwencją projektu.)

## 10. MAPA PLIKÓW (zmienione)

| Plik | Zmiana |
|------|--------|
| `src/config/CombatFxConfig.js` | NOWY — kolory broni + stałe FX |
| `src/utils/VesselFxLogic.js` | NOWY — czysta logika fog-of-war + kolor frakcji |
| `src/config/GameConfig.js` | FEATURES.fc* (9 flag) |
| `src/renderer/ThreeRenderer.js` | gros: FX harness, selekcja-pomoc, walka, skan, linie, insygnia, ruch, kamera bitwy (+722 linii) |
| `src/renderer/ThreeCameraController.js` | drobniejsze scroll bands (zoom statku) |
| `src/scenes/GameScene.js` | selekcja LPM, rozkazy PPM z mapy (+konwersja coords), retire kina DSCS, import isEnemyVessel |
| `src/scenes/UIManager.js` | `_drawSelectionBrackets` (ramki RTS + paski paliwa) |
| `src/systems/DeepSpaceCombatSystem.js` | emit `combat:roundFx` (FX-only) |
| `src/systems/TimeSystem.js` | auto-slow na `vessel:engaged` |
| `src/i18n/pl.js` + `src/i18n/en.js` | `log.autoSlowCombat` |

Memory projektu: `memory/fleet-command-console-3d-reform.md` (+ wpis w `MEMORY.md`).
