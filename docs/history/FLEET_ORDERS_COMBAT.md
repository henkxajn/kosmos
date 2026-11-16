# Fleet, orders, combat, STRATCOM — arc log (moved from CLAUDE.md)
> Moved verbatim from CLAUDE.md on 2026-11-16 (source lines 481–536, 719–805, 1868–2664, 2776–2860, 4249–5240, 5975–6081). Historical record — it may describe code that has since changed or been removed; the authoritative records are the plan docs in docs/design/ named inside each section. Kept in the original language (Polish).

<!-- CLAUDE.md L481–536 -->
## Reforma detekcji + Konsola Dowodzenia polish (post-handoff, save v88 bez migracji, live-gate PASS)

Plan: `C:\Users\Komputer\.claude\plans\przeczytaj-handoff-z-ostatniej-dynamic-wreath.md`. Handoff: `docs/KOSMOS_handoff_detekcja_multiselect.md`. Memory: `memory/detection-reform-multiselect.md`.

**Faza 1 — Detekcja/intel (główny lever walki):**
- **Per-kadłub `sensorRangeAU`** (HullsData/ShipsData; scout 2.5 / fregata 1.6 / niszczyciel 1.4 / krążownik 1.3 / transport 1.0–1.1) → `VesselManager.getVesselSensorRangeAU` (fallback 0.5) → `ProximitySystem._getDetectionRangeAU` gałąź gracza (`base × tech sensor_range`); wróg flat 0.5 (asymetria).
- **Techy sensorów ×mocniej**: `advanced_sensors_1/2/3` = ×1.6/×1.6/×1.8 (kumulatywnie ~×4.6).
- **Sensor-lock reveal** (gate `FEATURES.sensorLockContact`): 3. próg w ProximitySystem (`_activeSensorLockPairs` + `_getSensorLockAU` = `SENSOR_LOCK_AU 0.3 × tech`) → `vessel:sensorLockEnter` → `IntelSystem._onSensorLock` → `advanceVesselContact('contact')` (BYPASS dystansu w `_observeVessel`). Reveal tożsamości BEZ walki.
- **⚠ ROOT-CAUSE FIX `IntelSystem._isPlayerVessel`**: było `ownerEmpireId === 'player'`, statki gracza mają `undefined` → `_resolveObservedFromPair` zwracał null → **własny statek NIGDY nie podbijał intelu**. Teraz `!!v && !isEnemyVessel(v)` → proximity I sensor-lock działają.
- **Skan obserwatorium** (gate `observatoryVesselScan`): `ObservatorySystem._vesselScans` + `startVesselScan/cancelVesselScan/getVesselScanProgress/getActiveVesselScans` + `_tickVesselScans` (`SCAN_DURATION_YEARS 3.0 / level`, civDeltaYears) → `_completeVesselScan` rumor→contact zdalnie. UI: zakładka „Kontakty" w ObservatoryOverlay (Skanuj/Anuluj + pasek). serialize/restore `vesselScans` z `?? {}` (bez migracji). Wraki filtrowane u źródła (`_tickVesselDetection`).

**Faza 2 — Sprzątnięcie martwego kodu** (ThreeRenderer): usunięte `_syncSelectionRings`/`_upsert`/`_dispose*SelectionRing*` + `SELECTION_RING_*` + `_routeComet`/`_syncRouteComet`/`_disposeRouteComet`. `_orderLineColor` ZACHOWANE (3 route-line sites).

**Faza 3 — „Obserwuj bitwę"**: przycisk 👁 w nagłówku CombatHUD → `camera:watchBattle {x,y}` z `enc.location.point` (gameplay px); i18n `combat.watchBattle`.

**Faza 4 — Multi-select (Slice 8, `fcMultiSelect` flip ON)**: UIManager `_selectedVesselIds` Set + lead (`_selectedVesselId`); `getSelectedVesselIds/addToSelection/removeFromSelection/toggleSelection`; CTRL+klik toggle; **SHIFT+box-select** (`ThreeCameraController` ustępuje przy SHIFT; marquee w `_drawMarquee`; `ThreeRenderer._getOwnVesselsInScreenRect`); dispatch rozkazu do CAŁEGO zbioru (RightClickMenu pętla). GOTCHA: `_boxSelectConsumedClick` (pochłania artefakt-click po dragu, reset na mousedown); mouseup guard `e.button !== 0`.

**Fix live-gate T7 — moveToPoint na ruchome ciało**: `buildOrderSpec` planet → `targetBodyId` (+ fallback `targetPoint`); `_issueMoveToPoint` przewiduje pozycję ciała na ETA (`_predictPosition`) + `mission.targetId=bodyId` → przylot snapuje do ŻYWEJ pozycji planety i orbituje (statek śledzi planetę). Wzór rekon/atak. Pusty punkt = drift (bez zmian).

**Slice 8b — FleetGroupPanel (panel zaznaczonej grupy statków, gate `FEATURES.fcGroupPanel` ON, bez migracji save):**
Lekki non-exclusive panel (wzór StationPanel/CombatHUD; trzymany w UIManager, klik PRZED overlayManager,
draw PO — oba gated `fcGroupPanel && !overlayManager.isAnyOpen()`) w LEWYM-DOLNYM rogu pokazujący TRANSIENTNE
zaznaczenie mapy (`UIManager._selectedVesselIds`), NIEZALEŻNE od trwałych flot (FleetSystem). Self-managed:
`ui:selectionChanged` → show/hide (czyta `vesselIds`); `vessel:wrecked` → `removeFromSelection` (UIManager sam
NIE czyści zbioru). Zawiera: podsumowanie (liczba/paliwo%/utrzymanie Kr/uzbr. N/M/⚠unieruchomione) + roster
(nazwa·kadłub·status·rozkaz + mini-pasek paliwa, lead=accent) + akcje per-statek (🎯 `vessel:focus` / ✏
`showRenameModal`→`vessel:rename` / ✕ `removeFromSelection`) + rozkazy grupowe BEZ celu (Powrót `startReturn`
/ Tankuj `manualRefuel` docked / Stop `mos.cancelOrder` / Odwrót `mos.issueOrder retreat`) — szare gdy 0
kwalifikuje się (`countActionable`). Celowane (Move/Pursue/Engage) zostają na PPM mapy (już pętli zaznaczenie).
Minimize ▼→chip „⛬ Zazn. N"; stronicowanie ▲/▼ przy >6. Pliki: `src/ui/FleetGroupPanel.js` (widok) +
`src/ui/FleetGroupPanelLogic.js` (czyste `summarizeFleetGroup`/`buildRosterRows`/`countActionable`, node-test),
UIManager 5 wpięć, `fcGroupPanel` w GameConfig, i18n `fleetGroup.*` PL+EN. Smoke `tmp_slice8b_smoke.mjs` 33/33
+ regr fc_command 10 / fc_foundation 25 / fc_combat_fx 11 / sensor_detection 46. **Live-gate PENDING.**

**Skala 3D ↔ tactical + fix desync pozycji walki (post-Slice8b, save v88 bez migracji, live-gate PASS):**
- **Auto-fit kamery 3D do układu** (camera-only): `ThreeCameraController.frameSystem(maxOrbitAU)` ustawia
  dystans = `clamp(maxOrbitAU × SYSTEM_FIT_DIST_PER_AU(20), 70, 450)` + nowe pole `_defaultDist` (reset H /
  NaN-recovery wracają do ramki układu, nie sztywnego 85). `ThreeRenderer._computeSystemExtentAU` (max
  `orbital.a` planet+planetoid — IDENTYCZNA logika co mapa taktyczna) + `_frameActiveSystem` wpięte w
  `setCameraController` (start) i koniec `initSystem` (switchSystem/warp). Otwarcie układu kadruje CAŁY układ
  jak fit-to-bounds tactical (px/AU ~20–80 zamiast ~134). Startowy focus na home (GameScene) nadal wygrywa
  na starcie — ramka działa na H/reset/zmianę układu. Knob: `SYSTEM_FIT_DIST_PER_AU`.
- **⚠ ROOT-CAUSE fix desync 3D↔tactical podczas Engage**: `_issueEngage` ustawia `state='orbiting'`+`dockedAt=null`
  i lata statkiem mutując x/y, ale NIE zwalnia orbity w `OrbitalSpaceSystem` (engage omija ścieżkę
  in_transit/dock która normalnie woła `releaseOrbit`). `_tickOrbitingVessels` (co klatkę) pinował sprite do
  NIEAKTUALNEJ orbity macierzystej (~1 AU) gdy statek walczył 16 AU dalej (tactical czyta x/y wprost → był OK).
  Fix renderer-only (`dockedAt` = źródło prawdy): w `_tickOrbitingVessels` I `_syncVesselPositions` statek
  `orbiting`+`dockedAt==null`+`!wreck` (engage/pursue-hold/drift) pozycjonowany z REAL x/y, NIE z orbity.
  Genuine orbiter (`dockedAt=bodyId`) i wraki (graveyard/wreckLocation) bez zmian. Inwariant potwierdzony:
  wszystkie orbitery w VesselManager ustawiają `dockedAt=bodyId`, tylko deep-space free-float = null.
- Smoke `tmp_3d_scale_fit_smoke.mjs` 25/25 + `tmp_engage_desync_smoke.mjs` 12/12 (untracked).

**NEXT (jutro):** empire tech state (sensory/broń per imperium).

---

<!-- CLAUDE.md L719–805 -->
## Zunifikowana warstwa rozkazów floty — UKOŃCZONE (save v92, live-gate PASS, ARC ZAMKNIĘTY)

Jedna fasada wydawania rozkazów dla WSZYSTKICH UI + fix bug mis-homed statków po warpie + auto-łańcuch
cross-system transport (warp→lot→dostawa). Plan: `radiant-stirring-walrus.md`. Memory: `unified-order-service.md`.

**Bug wyjściowy:** statki po skoku warp pokazywały się w rejestrze jako „w home, wyszarzone" (nie w grupie
właściwego układu), a na mapie 3D poprawnie. **Root-cause:** jedyne źródło prawdy `vessel.systemId` pisane
tylko w ścieżce warp (`VesselManager:771` =null start, `:2197` =toSystemId przylot bramkowane
`phase==='warp_transit'`), a serialize/restore zwijały `null → 'sys_home'` (`?? 'sys_home'`). Statek zapisany
mid-warp / z fazą już poza `warp_transit` był trwale mis-homed (arrival hook się nie odpalał ponownie).

**Slice A — integralność `systemId`:** `VesselManager._resolveSystemId` (null TYLKO w prawdziwym `warp_transit`;
inaczej `mission.toSystemId`) + `_reconcileSystemId` (idempotentny, NIE rusza tranzytu). serialize/restore
zachowują `null` (`=== undefined ? 'sys_home' : v.systemId`). Reconcile na końcu pętli restore + defensywnie w
`_updatePositions`. Migracja `_migrateV91toV92` (self-heal mis-homed + `pendingOrder`/mission `origin/destSystemId` defaults).

**Slice B — `OrderService`** (`src/systems/OrderService.js`, `window.KOSMOS.orderService`, wired w GameScene
po `warpRouteSystem`): cienki router, kolaboratorzy leniwie przez `window.KOSMOS` (zero cross-importów — JEDYNY
dozwolony orkiestrator multi-system). Intent: `issueTransport/issuePassenger/issueMove/issueWarp/issueReturn/getTraffic`.
WSZYSTKIE UI wołają fasadę: `FleetManagerOverlay._executeMission` (transport/pasażer) + `return_home` handler,
Stratcom zony `cluster_send`/`cluster_send_pick`/`warp_order_send` (→`issueWarp`), PPM `RightClickMenu:314`
(→`issueMove`). Same-system = emit `expedition:transportRequest` (MissionSystem właścicielem logiki). ⚠ NIGDY
oba (`action.execute` I orderService) — ryzyko double-dispatch.

**Slice C — auto-chain cross-system** (warp→lot→dostawa): stan w `vessel.pendingOrder` (NIE loop/leg —
izolacja od `_tryResumeLoop`), serialize-safe. `_beginComposite`→`beginJourney`→ustaw `pendingOrder`. Łańcuch na
`interstellar:arrived`+`warpRoute:completed`→`_maybeDeliver` z guardami **jednokrotności**: `if(v.warpRoute)return`
(multi-hop trwa) + `if(v.systemId!==targetSystemId)return`. Re-walidacja celu (kolonia/stacja) → `order:compositeFailed`.
`warpRoute:aborted`→clear. `_resumePendingOrders()` po restore w GameScene. Dostawa reużywa `expedition:transportRequest`
(statek arrived=`orbiting`/`on_mission` → `_launchTransport` traktuje jako `isRedispatch` z orbity, bez spaceportu).

**Slice D — cele cross-system w rejestrze:** `_getValidTargets` pass cross-system (guard `warpFuel.max>0`):
kolonie/stacje GRACZA w innych układach (AI wykluczone → handel S3.5b), tag `{systemId, sameSystem, systemName,
distLY}`, `reachable = warpRange ≥ warpDist3D`. Picker: subheader układu + „X ly" + badge warp; `select_target`
zone niesie `targetSystemId` → `_missionConfig`. `_drawMissionConfirm` notka warp zamiast mylącej tabeli AU.
i18n `fleet.otherSystem/badgeWarp/crossSystemDelivery(+Hint)` + `order.compositeTargetLost`.

**Slice E — system-aware traffic:** MissionSystem `_launchTransport`/`_launchPassenger` rekordy +
`originSystemId`/`destSystemId`. `OrderService.getTraffic()` = `{bySystem, inTransit, missions}` — czyta `systemId`
(nie `colonyId`) → obcy statek w WŁAŚCIWYM układzie (znika rozjazd rejestr↔3D).

**Save v91→v92** (`_migrateV91toV92`). Smoke: `tmp_systemid_integrity_smoke` 19 · `tmp_order_service_smoke` 28 ·
`tmp_cross_system_targets_smoke` 8 + pełna regresja 0 FAIL (warp/save/s34/s34c/load_colonists/fleet_list_rows).

---

## STRATCOM — „stół holograficzny" (holotable), jedna mapa galaktyki 2.5D (H0–H6, save v92 bez migracji, live-gate PASS)

Przeprojektowanie zakładki STRATCOM: DWIE mapy obok siebie (radar 2D + galaktyka 3D, karmione tym samym
`_stratcomVisibleSystems` → redundancja „rozmyte") → JEDNA mapa („stół holograficzny"): stała pochylona płyta
z panem, głębia bez brył. Rozwiązuje redundancję i płaskość stref wpływów. Warstwa prezentacji — BEZ migracji
save. Plan: `C:\Users\Komputer\.claude\plans\troche-mi-sie-nie-curried-meerkat.md`.

- **H0** `src/renderer/HolotableCamera.js` (NEW, ZERO importu three — headless-testowalny): `orbitPosition`
  (lustro setCameraOrbit — regresja w smoke), `clampPitch`, `DEFAULT_OBLIQUE_PITCH=0.92`, `panScreenToWorld`,
  `riserEndpoints`, `computeOwnedLanes` (MST — w TerritoryRenderLogic). `setCameraOrbit` deleguje do `orbitPosition`.
- **H1 — jedna mapa**: `_drawStratcomTab` = pełnowymiarowa `_drawStratcomGalaxy` + pasek statków warp z lewej.
  USUNIĘTE (~801 linii): radar `_drawStratcom`, martwe `_drawStarCluster`/`_drawClusterInfoPanel`, flaga
  `_stratcomBig`, `stratcom_expand`. Panele „polityczny"+„operacyjny" SCALONE w `_drawStratcomDetail` + absorber
  `stratcom_detail_bg`. Warp/skany/fog-of-war/blipy/jump-gate/switchSystem zachowane. **Fix async-flash**:
  `_ensureGalaxy3D` ładuje renderer async → klatka 1 była płaskim 2D, potem skok w 3D. Teraz pending → SAMO tło
  (2D fallback TYLKO przy `_galaxy3DFailed`). **Ciągły redraw** przywrócony w `_drawStratcomTab`
  (`uiManager._dirty=true` — radar robił to przez STRATCOM_GLOW).
- **H2 — stały skos + pan**: przeciąganie = PAN po dysku (`panScreenToWorld` → `_holotablePanTarget` = look-at),
  NIE obrót. Pitch/yaw stałe. Clamp ±30 ly. Reset panu przy `close`. Zoom (scroll) bez zmian.
- **H3 — słupki (risers)**: pionowa szpilka dysk(Y=0)→gwiazda(Y=z) — `z` jako głębia bez brył
  (`RISER_COLOR/OPACITY`, `depthWrite:false`) + kropka u podstawy (CircleGeometry na dysku). Sierota w
  `_starGroup` (dispose przez `_disposeGroup` traverse).
- **H4 — strefy jako rozlane światło + warstwice** (koniec płaskości): `poolFillAlpha` (TerritoryRenderLogic,
  pure) — jasny rdzeń → gasnący front zamiast binarnego `m>=128`; wspólny helper 3D (`setTerritory`) + 2D
  (`_territoryTintCanvas`). `TerritoryField` liczy zagnieżdżone warstwice przy ISO×`CONTOUR_LEVELS` [1.5,2.2]
  (`contours:[{isoMul,loops}]`; hash niezmieniony — pochodne pola); render inner solid lines (3D static w
  `_territoryGroup`, 2D mirror dla `full`). Config `POOL_LUMA_LO/HI`, `POOL_CORE_MULT`, `CONTOUR_LEVELS`.
- **H5 — soczewka sensora**: przycisk „📡 Sensory" (`stratcom_lens_toggle`, `_sensorLens`) → pierścień zasięgu
  (obs-gated `STRATCOM_LY_BY_LEVEL`, wymaga Obs Lv4+) + obracający się sweep z zanikającym śladem (2D chrome via
  projS/projPt). Ghost-blipy wroga bez zmian. i18n `fleet.sensorLens` PL+EN.
- **H6 — warp-lane / konstelacja**: płynące światło (animowany dash) po MST (`computeOwnedLanes`, pure) między
  układami GRACZA, kolor imperium; 2D chrome via projS (działa 3D+2D). `LANE_FLOW_PX_PER_SEC=22`. ≥2 układów.

Smoke: `tmp_holotable_cam_smoke` 19 · `tmp_stratcom_smoke` 42 (przepisany: jedna mapa + H2/H5/H6) ·
`tmp_territory_contours_smoke` 13 · `tmp_warp_stratcom_smoke` 43 (przepięte z radaru na jedną mapę) + regr
territory b2-b6 / obs-scan / cross-system-leak / fc-command 0 FAIL. Pliki: `StratcomGalaxyRenderer.js`,
`FleetManagerOverlay.js`, `TerritoryField.js`, `TerritoryRenderLogic.js`, `GameConfig.js`, i18n; NEW
`HolotableCamera.js`. Backlog: kalibracja (riser/pool/sweep), foreshortening panu, invert flags kierunku panu.

---

<!-- CLAUDE.md L1868–2664 -->
## Finding 125 — „Powrót do bazy" nie brykuje statku (naprawa IZOLOWANA, save **v101 bez migracji**, live-gate + re-gate PASS, commit `cc20af5`)

Mała, samodzielna naprawa **poza** arciem VESSEL_ORDERS (P0-P5 zostaje osobnym, podpisanym planem).
Rejestr: `docs/design/UNIFIED_VESSEL_ORDERS_AUDIT.md` §Findings 125 (wpis zamknięty, z pełnym inwentarzem).

**Defekt:** rozkaz powrotu z obcego układu **kłamał o stanie statku**, żeby przejść bramkę dyspozytora
(`status='idle'; position.state='docked'; mission=null`), a kłamstwa **nikt nie cofał**, gdy skok odpadał —
najczęściej z braku `warp_cores`, czyli dokładnie wtedy, gdy gracz ten przycisk klika. Statek zostawał
„zadokowany" przy ciele **BEZ portu**. ⚠ **Sprzeczności nie było w bramce** — `canLaunchFromCurrent`
odpowiadała poprawnie o stanie, który rozkaz sam przed chwilą sfałszował.

**⚠ KŁAMSTWO BYŁO ZBĘDNE OD POCZĄTKU:** `dispatchInterstellar` (`VesselManager:757-763`) przyjmuje `docked`
**I** `orbiting` i we własnym komentarzu pisze „Status nie blokuje"; `WarpRouteSystem.canOrder:51-53` tak samo.
Jedyny stan blokujący skok to lot w układzie (`in_transit`).

**Naprawa — NEW `src/utils/ReturnJump.js`** (czysty moduł, zero importów, wzór `MovementOrderCancellation.js`):
`returnJumpTransactional(vessel, jumpFn)` — snapshot → przygotuj **MINIMUM** (tylko `in_transit`, i to do
**swobodnego dryfu** `orbiting`+`dockedAt=null`, **nie** do fałszywego doku) → skok → przy odmowie przywróć
stan **CO DO POLA** (z `pendingOrder` włącznie — odmowa nie kasuje zakolejkowanej dostawy gracza).
⚠ **Ścieżka sukcesu jest ścisłym NO-OPEM** względem starego kodu: `dispatchInterstellar` i tak nadpisuje
wszystkie cztery pola. Zmienia się **wyłącznie** zachowanie przy odmowie. Wzór zasady stoi w tym repo od dawna:
`VesselManager.dockAtColony` przy braku portu **nie dokuje na siłę**, tylko zostawia statek na orbicie.

**CZTERECH producentów tego samego przycisku** (grep `position.state = 'docked'` dał 5 zapisów: 2 prawdziwe
dokowania + te 4) — wszyscy przez jedną transakcję: `OrderService.issueReturn` (rejestr floty) ·
FMO `interstellar_return` (ekran „Interstellar Arrival") · FMO `foreign_return`/`foreign_return_from_recon`
(panel obcego układu) · `FleetActions.return_home.execute` (**uśpiony** bliźniak — `FleetPanel`/`FleetTabPanel`
nie są nigdzie importowane; utwardzony mimo to, bo nieutwardzony bliźniak to mina — lekcja `removeColony:667`).

**Dogrywka po 1. live-gate — brak POWODU:** gracz zobaczył „Cannot issue order" bez wyjaśnienia i podejrzewał
**piątego producenta**. Zmierzone renderem: piątego **NIE MA** (ekran „Interstellar Arrival" wystawia
`interstellar_return`, już objętą). Realnym defektem był brak powodu: te przyciski wołały `dispatchInterstellar`,
który zwraca **GOŁY BOOL**. Przepięte na `OrderService.issueWarp` (cel skoku **bez zmian** — ten sam `systemId`
z hit-zony) ⇒ „Nie można wydać rozkazu — ✗ Za mało rdzeni warp". Były to **ostatnie surowe wywołania dyspozytora**
wśród przycisków powrotu. ⚠ **Konsekwencja ZADEKLAROWANA:** powrót idzie teraz przez planer wielo-przeskokowy
(ten sam silnik co „Powrót" z rejestru), więc trasa dłuższa niż jeden skok zostanie **ZŁOŻONA** zamiast po cichu
odmówić.

**⚠ `KOSMOS.debugLog` NIE JEST instrumentem floty** (zmierzone WYKONANIEM, keeper T13): to audyt
AI/wojny/dyplomacji z **zamkniętą** listą `TRACKED_EVENTS`, w której nie ma **ANI JEDNEGO** zdarzenia floty,
a rozkazy floty nie ruszają `GameState` (brak nawet wpisu `state`). **Pusty `tail()` NIE ROZRÓŻNIA ŚCIEŻEK** —
milczy tak samo dla naprawionej i nienaprawionej; live-gate wyciągnął z tej ciszy fałszywy wniosek i słusznie,
bo instrument nie mówił prawdy o swoim zasięgu. Kanałem floty jest **Dziennik** (`EventLogSystem`, `channel:'fleet'`)
— odmowa pisze tam `severity:'warn'` (toast jest ulotny, wpis zostaje). ⚠ **NIE dopisywać zdarzeń floty do
`TRACKED_EVENTS`** — to rozcieńczyłoby narzędzie zbudowane pod audyt AI.

**Świadomie POZA transakcją:** `abortForeignRecon` — sam ląduje statek w pełni wykonalnym
`exploration/orbiting_body`, więc odmowa zostawia go SPRAWNYM; cofanie dałoby hybrydę (misja przemianowana,
pozycja przywrócona) = **nowe limbo**.

**Testy:** keeper `src/testing/smoke/return_home_no_brick_smoke.mjs` **77/77** (T1-T13). ⚠ **T12 = pin RENDERU**
(który ekran wystawia którą hit-zonę) — **pin, którego brak kosztował jedną rundę live-gate'u**; T10 = pin
źródłowy (komentarze zdejmowane) z **dwiema** kontrolami pinu; T13 = cisza `debugLog` z kontrolą pinu.
Sweep **160/160 0 FAIL** · `check-i18n` PASS · zero migracji · **zero nowych kluczy i18n** (reuse słownika
`_warpErrLabel` + `fleet.warpOrderFailed`).

**NASTĘPNE (kolejka właściciela, NIE w tej sesji):** ~~Finding 111~~ ✅ **ZROBIONE** (sekcja niżej) →
**VESSEL_ORDERS** (P0-P5, osobny podpisany plan) → reszta rejestru.

---

## Finding 111 — predykat końca gry pyta o ZDOLNOŚĆ, nie o ISTNIENIE (save **v101 bez migracji**, live-gate §1-§4 PASS, ARC ZAMKNIĘTY 2026-08-20)

Samodzielny **P1**, **poza** arciem BRAMKA WŁASNOŚCI (D1-D6) i **poza** VESSEL_ORDERS. Plan + rejestr
decyzji + wynik gate'u: `docs/design/PLAYER_VIABILITY_PREDICATE_PLAN.md`.
Commity: `a180619` (kod) · `8537e78` (keeper) · `1ee611d` (plan) · close-out.

**Defekt:** `PlayerViability.hasColonyCapableShip` pytał o sam moduł habitacyjny, a `_tickPlayerViability`
zeruje karencję przy każdym tiku, dopóki `state.ok` ⇒ **dopóki gdziekolwiek stał taki kadłub, `game:over`
nie padał NIGDY** — także gdy statek był zadokowany albo dryfował i nie miał jak nic zacząć.
⚠ Fundament D9 stał na przesłance, którą Finding 106 obalił: *„przy ZERZE kolonii `canLaunchColony`
przechodzi, a przylot zakłada kolonię"* — **bramka przechodzi, start nie**.

**Model (jedna oś):** `hasLiveRecolonizationPath` klasyfikuje po **TYPIE MISJI**, nie po kadłubie i nie
po stanie: `COLONY_OUTLET_MISSIONS` = `colony` | `found_outpost` (sam PRZYLOT tworzy kolonię — **bez
wymogu habitatu**, bo placówkę wozi frachtowiec) · `FOREIGN_FLOW_MISSIONS` = `interstellar_jump` |
`exploration` | `foreign_recon` (**wymagają** `canColonize` — tam kolonizuje przycisk, nie przylot).
`hasColonyCapableHull` zostaje **wyłącznie do diagnostyki**. Zaparkowany, dryfujący i orbitujący po
zwiadzie **nie liczą się**.

**⚠ TRZY REGUŁY, KAŻDA KUPIONA POMIAREM (nie zakładaj, że da się prościej):**
1. **`mission` I `_suspendedMission` — NIGDY `??`.** Rozkaz ruchu **podmienia** `vessel.mission`
   (`move_to_point`), a prawdziwą chowa w `_suspendedMission`; fallback nigdy by po nią nie sięgnął.
   Zmierzone: prototyp z `??` odrzucał kolonizatora w misji `colony` przerwanej rozkazem ruchu.
2. **BRAK terminu paliwowego.** Paliwo pobierane jest **z góry przy starcie**, a stranding
   *„emituje wyłącznie sygnał — niczego nie blokuje"*; `_redirectInterstellarVessel` paliwo **klampuje
   zamiast odmawiać** (Finding 103). Termin paliwowy dokładałby fałszywe negatywy.
3. **BRAK terminu stanu.** `status='on_mission'` + `orbiting` opisuje ZARÓWNO zwiad zaparkowany
   **bezterminowo** (zmierzone: `mission=recon` wisi po 100 latach gry), JAK I statek z żywym panelem
   po warpie. Odrzucony wariant „licz każdą żywą misję" zostawiłby limbo w innym kształcie.

**⚠ ZNALEZISKO, KTÓREGO NIE ZAMAWIANO — nieutwardzony BLIŹNIAK bramki D9 (decyzja D-111 = W1):**
`MissionSystem._launchFoundOutpost` miał **miękkie** `if (this.resourceSystem) { spend… }`, a
`canFoundOutpost` liczy `canAfford` równie miękko (`if (resSys) …`) ⇒ przy ZERZE kolonii **placówka
zakładała się ZA DARMO** (zmierzone: `getPlayerColonies()` **0 → 1**). Utwardzone bliźniaczo do
`_launchColony`. **Zasięg zmiany WYŁĄCZNIE przy `resourceSystem == null`** — przy żywej koloni
`check.canAfford` odmawia już w bramce wyżej, więc zwykła gra jest bit w bit.
⚠ Obie zmiany są **SPRZĘŻONE**: samo zawężenie predykatu bez utwardzenia bliźniaka dawałoby **fałszywy
negatyw** (koniec gry przy żywej trasie). ⚠ Kolejka `pendingOutpostOrders` kończy na
`expedition:foundOutpostRequest` ⇒ **ten sam chokepoint**, jedno utwardzenie zamyka obie ścieżki.

**⚠ `canFoundOutpost` DALEJ zwraca `ok:true` przy zerze kolonii — I TAK MA BYĆ.** To wzorzec Findingu
106: bramka opisuje możliwość, odmowa mieszka przy STARCIE. „Naprawienie" bramki na czerwono skasowałoby
jedyne miejsce, gdzie różnica bramka↔skutek jest widoczna.

**Diagnostyka:** `describeNoReversal` rozróżnia **`colony_ship_no_route`** (kadłub JEST, zaparkowany)
od `no_colony_ship` (nie ma żadnego) — inaczej gate mierzyłby ciszę.

**⚠ GAŁĄŹ DESANTU ZOSTAJE ISTNIENIOWA** (podpisane D9, reguła 1 w nagłówku modułu): `transferColony`
**nie tyka jednostek naziemnych** (przepisuje tylko `tile.owner`), więc „statek z `drop_pods` + ocalały
oddział" **nadal wstrzymuje koniec gry**. To znany, świadomie przyjęty fałszywy pozytyw — zawężenie tej
gałęzi wymaga OSOBNEGO podpisu i trudniejszego pomiaru.

**Keeper** `ai_capture_last_stand_smoke` **25 → 40 asercji, 0 FAIL**. ⚠ **T4 i T5 KONTROLA PINU A
ODWRÓCONE ŚWIADOMIE** — w starym kształcie pinowały DEFEKT („sam kolonizator wystarcza", „zaparkowany
wstrzymuje koniec gry BEZTERMINOWO"); powód wpisany w nagłówku pliku (wzór `deploy_seams`,
`s34c_z9_transfer_dispose`). Nowe: T7 (tabela tras + pomiar „zwiad wisi 60 lat" + **pin na `??`** +
pin na rozróżnienie powodów) · T8 (bliźniak T2 + kontrola pinu przy żywej koloni).
Sweep **160/160 0 FAIL** · `check-i18n` PASS · zero nowych kluczy i18n.

**Live-gate:** §1/§2 **na żywo** (właściciel) · §3/§4 **headless** na przekazanie właściciela,
**15 PASS / 0 FAIL** (odmowa z powodem, misje 0 → 0, statek i paliwo nietknięte, kolonie 0 → 0 przy
zerze / 1 → 2 przy żywej). ⚠ **Granica dowodu:** headless pinuje **chokepoint silnika**, NIE klikalność
UI — ścieżka `FLEET_ACTIONS.found_outpost` → `_openOutpostBuildingPicker` (DOM, async) nie była
przechodzona; nie nazywać jej zweryfikowaną.

**NASTĘPNE (kolejka właściciela):** część II `COLONY_OWNERSHIP_GUARD_PLAN` (D1-D6) · **VESSEL_ORDERS**
(P0-P5) · reszta rejestru (97, bug mapy 108-110, 112/113 ekran końca gry).

---

## RETREAT_TARGET — odwrót z bitwy dobiera SCHRONIENIE, nie BAZĘ (F-D + F-E) (save **v101 bez migracji**, live-gate 4/4 PASS — ARC ZAMKNIĘTY 2026-08-26)

Slice **przekrojowy**, NIE należy do VESSEL_ORDERS (P0-P5 zostaje osobnym, podpisanym planem).
Plan + decyzje **D-FDa…D-FDk** + trzy pomiary wykonane PRZED kodem: `docs/design/RETREAT_TARGET_PLAN.md`.
Rejestr wyjściowy: `UNIFIED_VESSEL_ORDERS_AUDIT.md` (F-D/F-E). Commity: `aeef035` (kod) ·
`ee71fc7` (rejestr + korekta komentarza, który kłamał o liczbie konsumentów: „cztery ścieżki" → **trzy**).

**Jedno zdanie:** odwrót z bitwy i „Powrót do bazy" dzieliły JEDNĄ funkcję doboru celu
(`AutoRetreatSystem._findNearestFriendlyPlanet`), która filtruje po WŁAŚCICIELU i **nie ma terminu
układu** — a gwiazda każdego układu stoi w (0,0), więc selektor wskazywał kolonie z INNYCH układów,
rozkaz odpadał na `target_other_system` ⇒ **odwrót nie działał dla NIKOGO, gracza włącznie**
(zmierzone na żywo 3×).

**Rozszczepienie na dwie nazwy** — rdzeń slice'u: jedna funkcja odpowiadała naraz na DWA różne
pytania i dlatego na żadne nie odpowiadała dobrze.

| pytanie | odpowiedź | własność | koniec drogi |
|---|---|---|---|
| „gdzie mogę się **SCHRONIĆ**?" | NEW `src/utils/RetreatTarget.js` | **kolejność preferencji** (D-FDb) | **ORBITA**, `colonyId` NIETKNIĘTY |
| „gdzie jest moja **BAZA**?" | `_findNearestFriendlyPlanet` **NIETKNIĘTA** | filtr (poprawny) | dok + re-homing `colonyId` |

⚠ **`_findNearestFriendlyPlanet` NADAL nie ma terminu układu i jest ŻYWA** przez TRZY produkcyjne
ścieżki „Powrót do bazy" (`FleetManagerOverlay:4550`, `FleetGroupPanel:445`, `FleetCommandPanel:384`)
— **Finding 154, otwarty, własny podpis**. Świadomie nietknięta: tam filtr własności jest właściwy,
a promień rażenia zmiany obejmowałby przycisk używany w normalnej grze.

**`MovementOrderSystem.resolveShelterOrderSpec` = JEDNO ŹRÓDŁO** doboru celu **i kształtu rozkazu**
dla WSZYSTKICH TRZECH producentów odwrotu (`_issueRetreat` gracza z PPM · `AutoRetreatSystem` na
`battle:resolved` · doktryna `retreat_at_50` we `FleetSystem`). Rozwiązuje cel — **nie wydaje**
rozkazu, bo każdy producent dyspozycjonuje inaczej (ten wewnątrz `issueOrder` woła `_issueMoveToPoint`
wprost, żeby nie zdublować preempcji i bramek; pozostali wchodzą normalnie przez `issueOrder`).

**Drabina rang (D-FDb + D-FDg) — BEZWZGLĘDNA**, odległość porządkuje dopiero WEWNĄTRZ tieru:

```
tier 0  własna kolonia/stacja Z PORTEM   ← jedyny tier, na którym da się zatankować
tier 1  własna kolonia/stacja bez portu
tier 2  ciało NICZYJE
tier 3  kolonia OBCEGO właściciela        ← ostatni (Z1: wrogi orbiter blokuje pulę hubu SAMYM
                                            faktem `dockedAt` i dolicza się do następnej fali)
```

Powód pierwszeństwa portu: rozkaz leci z `bypassFuelCheck`, a **paliwo pobierane jest PRZY WYDANIU**
(`MOS:765-767`) — statek doleci wszędzie, ale z bakiem na zerze, a tankowanie wymaga `state==='docked'`
(przylot daje `orbiting`). Bez tej preferencji produkowaliśmy limbo klasy **Finding 111/125**.

**Drabina szczebli (D-FDe) — ŻADEN szczebel nie robi wraku:** ciało-schronienie → wektor ucieczki
w pusty punkt → **odmowa z POWODEM**. `_turnIntoWreck` **USUNIĘTY** z `AutoRetreatSystem`.
⚠ Ta gałąź była praktycznie martwa PRZED naprawą (selektor przeszukiwał całą galaktykę, więc zawsze
coś znajdował) — po dodaniu terminu układu stałaby się **TYPOWA**, bo AI atakuje z definicji w cudzym
układzie. I **zabijałaby także flotę GRACZA**: `DeepSpaceCombatSystem:1236` woła `_issueRetreatOrder`
WPROST, omijając bramkę `empireId === 'player'`.

⚠ **`AutoRetreatSystem:56` NIE JEST bramką symetrii i nie należy jej tak czytać.** Gracz DOSTAJE
auto-odwrót — drugimi drzwiami, tą ścieżką z `:1236`. Symetria mieszka w SELEKTORZE i w drabinie,
nie w tym `return`.

**D-FDk — ucieczka przebija `vessel_immobilized` I `vessel_in_reserve`.** Prawo do przeżycia nie jest
nagrodą za opłacone utrzymanie ani za obsadzenie załogą. Predykat `isRetreatSpec` (`MovementOrderTypes.js`)
jest **jednym źródłem**, bo tylko JEDEN z trzech producentów używa `ORDER_TYPES.retreat` — dwaj pozostali
wydają zwykły `moveToPoint`, więc sam test typu dałby asymetrię „ten sam czyn, inna odpowiedź, zależnie
od producenta". Znacznik `isRetreat` ustawiają producenci JAWNIE (nie wyprowadzamy go z `issuedBy` —
to pole jest opisowe i trafia do logów).

**D-FDd — `DSCS._allOutsideOf` uczy się markera odwrotu.** Po naprawie udany odwrót KOŃCZY SIĘ orbitą
(`dockedAt = bodyId`), a guard z 2026-05-21 („zadokowany ≠ uciekający", prawdziwy dla OBROŃCY) wypychał
uciekiniera z liczenia ⇒ `aliveCount` → 0 ⇒ `retreated = null` ⇒ **side-level wrak ŻYWYCH przegranych**.
Bez wyjątku **udany odwrót byłby groźniejszy od nieudanego**. Marker dopuszcza uciekiniera wyłącznie
do TESTU ODLEGŁOŚCI — ciało bliżej niż clearance dalej liczy się jako „w środku".

**D-FDf — orbita zamiast doku.** `_pendingReturnDock` **usunięty ze ścieżki doktryny**: jego konsument
`FleetSystem._maybeAutoDockOnReturn:653` przepisuje `vessel.colonyId` **BEZWARUNKOWO**, więc odwrót na
ciało niczyje albo cudze robiłby z niego nową BAZĘ całej floty. (⚠ próg `RETURN_DOCK_THRESHOLD_AU:30`
jest **martwy** — stała bez konsumenta.)

**F-E (D-FDh) — dryf.** `_findNearestFriendlyPlanetForDrift` był klonem 1:1 tamtej funkcji i dziedziczył
ten sam defekt; **tu groźniejszy**, bo ratunek z dryfu **NIE wydaje rozkazu — TELEPORTUJE**, więc bramka
`target_other_system` w ogóle go nie chroniła i statek lądował na współrzędnych ciała z OBCEGO układu
z niezmienionym `systemId`. Teraz delegacja do `nearestOwnColonyBodyInSystem` (⚠ **własność ZOSTAJE
FILTREM** — dryf znaczy „wróć do siebie", nie „schowaj się gdziekolwiek") + **drugi szczebel zamiast
niemej pętli „+5 lat"**: `vessel:driftStranded` mówi RAZ, że statek utknął.

**D-FDj — widoczność.** Udany odwrót **nie miał ANI JEDNEGO subskrybenta** w całym `src/`, więc naprawa
objawiałaby się WYŁĄCZNIE zniknięciem komunikatów o porażce — **gate mierzyłby ciszę i nie odróżniłby
jej od „nic się nie stało"**. Doszły konsumenty `vessel:autoRetreatIssued` + `vessel:driftStranded`
(`UIManager`, kanał `combat`/`fleet`) oraz **klucze, których NIE BYŁO W ŻADNYM JĘZYKU** mimo że powody
`no_friendly_planet` / `not_in_combat` są zwracane od M4 P3 (gracz widział **surowy slug**):
`vessel.reasonNoShelterInSystem` / `reasonNoFriendlyPlanet` / `reasonNotInCombat` PL+EN.

### ⚠ Pomiary PRZED kodem (sondy poza repo) — trzy rzeczy, których nie dało się zgadnąć

1. **Bąbel clearance NIGDY nie opróżnia zbioru: 0/7200** (12 wygenerowanych układów, 38-57 ciał każdy)
   ⇒ **szczebel 2 (wektor ucieczki) jest w praktyce NIEOSIĄGALNY** i dlatego keeper pinuje go na
   układzie **ZDEGENEROWANYM** — inaczej mierzyłby ciszę.
2. **Knob `RETREAT_CLEARANCE_AU` = 0,50 jest NIEWRAŻLIWY.** Rozkład jest bimodalny: przy ciele najbliższe
   leży ≤0,15 AU, następne dopiero ~3 AU ⇒ każda wartość z ~0,16-3,0 AU wybiera TO SAMO ciało.
   **Nie ma czego stroić.** Cena bąbla realna, ale opłacalna: mediana odwrotu 3 AU = **12 % baku fregaty**.
3. **Wyścig jest realny — i sam clearance go NIE zamyka.** Przy 1 d/s klasyfikacja uciekiniera nie
   następuje NIGDY w oknie życia bitwy; przy 1 r/s statek pokonuje **1,85 AU na jedną rundę** (110 ms),
   więc potrafi przejść z „wewnątrz" wprost w „zadokowany" **nie będąc policzonym ani razu**.
   ⇒ marker D-FDd był **konieczny, dowiedziony**, a nie ostrożnościowy.

⚠ **POMIAR, KTÓRY ZMIENIA INTUICJĘ O ODWROCIE:** bitwa DSCS żyje **~2,2 s REALNEGO czasu**
(`MAX_ROUNDS 20` × `ROUND_INTERVAL_MS 110`), a `speedAU` to AU na rok **GRY** — pokonanie 0,5 AU przy
1 d/s trwa ~130 s, czyli **~59× dłużej niż cała bitwa**. **Cel odwrotu NIE decyduje o wyniku bitwy**;
decyduje o tym, GDZIE ocalały wyląduje i czy nie zostanie zwarty ponownie. Odwrót jest z natury
**post-battle**.

### Live-gate 2026-08-26 — 4/4 PASS (właściciel, na żywo)

1. **Komunikat o odwrocie w Dzienniku** — potwierdzony DWUKROTNIE, przy dwóch różnych bitwach
   (to jest dokładnie ten konsument, którego brak czyniłby naprawę niemierzalną — D-FDj).
2. **Orbita we WŁASNYM układzie, baza NIETKNIĘTA** — na `v_49 „Żmija"`: pierwszy odwrót do własnej
   stolicy (**tier 0, port**), drugi odwrót (inna walka) do innego ciała (**Nowy Księżyc**).
   ⇒ drabina rang i D-FDf potwierdzone **zachowaniem**, nie odczytem.
3. **D-FDk — OBIE POŁÓWKI czysto:** odwrót przechodzi mimo `unpaidYears = 2`, a **zwykły `moveToPoint`
   na TYM SAMYM statku z TYM SAMYM długiem** dostaje `vessel_immobilized`. Kontrola pinu na żywym silniku.
4. **Czytelny powód odmowy w UI**, nie surowy slug w konsoli.

**Keepery:** NEW `retreat_target_smoke` **44/44** (fail-first startował 12/25) · `retreat_preempt_smoke`
**29/29** — ⚠ **T4 ODWRÓCONY ŚWIADOMIE** (pinował DEFEKT: `reason === 'target_other_system'`), a jedyny
pin inwariantu **D-VO3a** stracił swojego producenta odmowy ⇒ przeniesiony do nowego **T4b** na powód
`not_in_combat` (po D-FDk `vessel_immobilized` przestał blokować `retreat`, więc stary pin znowu
mierzyłby ciszę). Sweep **173/173 OK, 0 FAIL** (`run-all.mjs`) · `check-i18n` PASS · zero migracji.

**⚠ Świadomie POZA zakresem (filed):** **Finding 154** (`_findNearestFriendlyPlanet` bez terminu układu,
żywa przez trzy przyciski „Powrót do bazy") · **Finding 138** (`_findBodyNearPoint` skanuje całą
galaktykę — dotyka KAŻDEGO rozkazu celowanego punktem, D-FDi=W2) · `_pendingReturnDock` stawiany PRZED
`issueOrder` i **niesprzątany przy odmowie** na trzech ścieżkach POWROTU (wzór poprawki jest w repo:
`_issueDock` stawia `_pendingDock` pod `if (result?.ok)`, `MOS:427`) · kara dyplomatyczna za przylot
uciekiniera zostaje jak jest · strona AI **nie ma snapshotu/wznowienia misji** po `_freezeAsStationary`
(gracz ma) ⇒ okręt AI z wyzerowaną misją zostaje z `movementOrder` w `active` na zawsze · **balans**:
czy 3 AU odwrotu od kolonii to właściwa cena.

---

## Starcie jest JEDNOUKŁADOWE Z KONSTRUKCJI — bramka + gather + stempel (save **v101 bez migracji**, live-gate PASS — ARC ZAMKNIĘTY 2026-08-26)

**KRYTYCZNE, złapane MIMOCHODEM.** Live-gate naprawy F-D wyłapał defekt **niezależny od F-D i cięższy**:
`DeepSpaceCombatSystem` łączył w JEDNO starcie statki z RÓŻNYCH układów. Commit `131cc2e`; rejestr
findingów 150-154 `ee71fc7` (sekcja w `docs/design/VESSEL_ORDERS_PLAN.md`).

**ZMIERZONE W ŻYWEJ GRZE:** encounter ze stemplem `location.systemId = 'sys_024'` zawierał statek gracza
z `sys_024` **ORAZ** statki z `sys_061` i `sys_home` (potwierdzone dwoma zrzutami przy przełączaniu widoku
układu). Podważało to zaufanie do **KAŻDEGO** wyniku bitwy, nie tylko do odwrotu.

**Mechanizm — klasa „globalne id ≠ położenie"** (ta sama co Finding 138 i W3-4b): każdy układ ma własną
ramkę współrzędnych ze swoją gwiazdą w (0,0), a rejestry (`EntityManager`, `VesselManager._vessels`) są
**PŁASKIE**. Statek 0,2 AU od SWOJEJ gwiazdy ma niemal te same surowe `x/y` co statek 0,2 AU od INNEJ.

**TRZY MIEJSCA, nie jedno** (i trzecie maskowało dwa pierwsze):

1. **`startEngagement` team-up gather** iterował `vm._vessels.values()` po CAŁEJ galaktyce i kwalifikował
   po gołym `hypot` → skład bitwy zbierany z całej mapy.
2. **`handleCombatRangeEnter`** — jedyne publiczne wejście — bramkował tylko `sameFaction`/wrak.
3. **`_createEncounter` ZGADYWAŁ** `location.systemId` z `sideAVessels[0]`, czyli **z kolejności iteracji
   płaskiego rejestru**. ⚠ To był **CICHY STEMPEL**: rekord bitwy o mieszanym składzie dostawał jedną,
   wiarygodnie wyglądającą etykietę, więc żaden konsument `battle:resolved` nie miał jak wykryć anomalii
   — a etykieta idzie dalej do `WarSystem._updateOrbitalDominance`, czyli do **TRWAŁEGO STANU ZAPISU**.

Teraz: bramka w **dyspozytorze**, termin układu w **gatherze**, stempel z **pary WYZWALAJĄCEJ**.

### ⚠ LEKCJA WIĄŻĄCA DALEJ: guard u JEDNEGO producenta nie jest guardem SYSTEMU

`ProximitySystem._checkPair` **MA** guard międzyukładowy (dostał go 2026-07-15) — ale **nie jest jedynym
producentem** `vessel:combatRangeEnter`. `MovementOrderSystem` emituje je **wprost w dwóch miejscach**
(`:1163` force-engage, `:1505` po pursue/intercept — ten drugi z dystansem **wpisanym na sztywno**), oba
majstrują dodatkowo przy `ps._activeCombatPairs`, więc strażnik proximity nie łapie ich nawet pośrednio.
**Utwardzony był JEDEN z TRZECH — i właśnie dlatego dziura przeżyła dwa wcześniejsze utwardzenia tej
klasy.** Bramka stoi teraz w **dyspozytorze DSCS**, bo to jedyne publiczne wejście, które widzi
wszystkich trzech producentów. ⇒ **policz PRODUCENTÓW zdarzenia, zanim uznasz klasę za utwardzoną.**

### ⚠ `isSameSystemStrict` — fail-CLOSED, WYŁĄCZNIE dla warstwy walki

NEW w `src/utils/SystemScope.js`, **osobno** zamiast zmiany `isSameSystem`, bo **bilans kosztu błędu jest
odwrotny**: przy wydawaniu rozkazu cena fałszywego NEGATYWU to cichy paraliż floty (fail-open słuszny),
a w WALCE cena fałszywego POZYTYWU to **trwale stracone kadłuby, wraki w międzyukładowym punkcie
i zatruty `orbitalDominance` W ZAPISIE** — wobec jednej niestoczonej bitwy. `isSameSystem` (fail-open)
**NIETKNIĘTY** dla bramek rozkazów.
⚠ **`null` NIE ZNACZY TU „nie wiemy":** `systemIdOf` mapuje `undefined` → `'sys_home'`, więc **stary zapis
sprzed multi-system walczy normalnie** (pin T5), a do `null` dochodzi **wyłącznie prawdziwy tranzyt warp**
— a statek w warpie nie ma prawa walczyć: jest fizycznie pomiędzy układami, a jego `x/y` to współrzędne
SPRZED skoku.

**Lustrzana trójka w `VesselCombatSystem` W TYM SAMYM COMMICIE** — znakowo ta sama pętla i ten sam stempel.
Gałąź jest uśpiona flagą `m4DeepSpaceCombat`, ale ma **jawny fallback i utrzymywaną ścieżkę rollbacku**
⇒ reguła **nieutwardzonego bliźniaka** (`removeColony:667`).

**Defense-in-depth (dwa miejsca, świadomie nadmiarowe):** `_joinEncounter` odmawia obcemu układowi
(dziś nieosiągalne — ma dwóch wołających, obu wewnątrz dyspozytora; guard stoi, żeby „członkostwo
w starciu" było prawdą LOKALNĄ, gdyby doszedł trzeci wołający) · `_freezeAsStationary` **nie przypina
ciała z innego układu** — to **jedyny zapis w tej ścieżce trwale mutujący statek**: `pinDockedAt` brany
z większości strony GRACZA, wpisany statkowi z innego układu, dawał `dockedAt` na ciało, którego w jego
układzie NIE MA, a `VesselManager._updatePositions` przeliczał z niego `x/y` ⇒ statek przenoszony we
własnym układzie i „dokowany" przy nieistniejącym ciele. **Nikt tego później nie czyścił, więc szkoda
szła do zapisu.**

**Keeper `combat_system_scope_smoke` 25/25** (fail-first 11/8); **T3 odtwarza pomiar z gry co do nazw
statków**. ⚠ **Pierwsza wersja T1/T3 PRZECHODZIŁA na NIEPOPRAWIONYM kodzie** — intruz wypadał przy
wyborze `bestGroup`, nie przez filtr; fixture poprawiony, powód wpisany w komentarzu. Każdy pin ma
kontrolę pinu, w tym **T4** (tranzyt warp = fail-closed) i **T5** (stary zapis bez `systemId` walczy
normalnie). Sweep **173/173 OK, 0 FAIL** · `check-i18n` PASS · bez migracji save.

**Live-gate 2026-08-26 — PASS przez BRAK NAWROTU:** wiele bitew w jednej sesji, **zero kolejnej
kontaminacji cross-system**. ⚠ Nazywam to wprost: to potwierdzenie **przez nieobecność** — ale jest
mocne, bo defekt był wcześniej **głośny i reprodukowalny w tej samej klasie sesji** (dwa zrzuty).
Nie jest to dowód na każdą ścieżkę z osobna.

⚠ **NAPRAWA NIE COFA SZKÓD JUŻ ZAPISANYCH:** fałszywe `position.dockedAt`, zatrute klucze
`orbitalDominance`, wraki w międzyukładowych punktach, wyczerpanie wojenne z fikcyjnych bitew. Sonda
diagnostyczna read-only powstała i **została zweryfikowana wykonaniem** na syntetycznym zapisie, ale
**właściciel świadomie zrezygnował** z naprawy stanu (zapis testowy). **Przy PRAWDZIWEJ partii temat wraca.**

### Findingi 150-153 — otwarte, każdy z własnym powodem odroczenia

- 🔴 **150 — `battle:resolved` leci DWA RAZY przy zadeklarowanej wojnie.** DSCS emituje z `warId: null`
  (`:1022`), potem `WarSystem.recordBattle:314` emituje PONOWNIE, z `warId` ⇒ każdy subskrybent
  (`AutoRetreatSystem`, `InvasionSystem`, `GameScene`, `ProximitySystem`, UI) dostaje ten sam wynik
  dwukrotnie, **w dwóch różnych kształtach**. ⚠ **POTWIERDZONY ŻYWO 2026-08-26, DWUKROTNIE w jednej
  sesji** (dwie różne pary id bitew, za każdym razem **dwie sprzeczne linijki o zwycięzcy TEJ SAMEJ
  walki** w Dzienniku) ⇒ z „odczyt, nie pomiar" przechodzi na **reprodukowalny w żywej rozgrywce**,
  a duplikat okazuje się **WIDOCZNY DLA GRACZA**, nie tylko wewnętrzny. NADAL NIEZMIERZONE: którzy
  konsumenci są idempotentni. **Osobny pomiar, osobny slice.**
- 🟠 **151 — `ProximitySystem:187` ma WŁASNĄ koercję zamiast `systemIdOf`, i ta koercja połyka tranzyt
  warp** (`?? 'sys_home'` łapie także `null`, który znaczy „między układami") ⇒ statek w warpie liczony
  jako mieszkaniec `sys_home`, na współrzędnych SPRZED skoku. ⚠ Ta linia bramkuje **nie tylko walkę, ale
  i DETEKCJĘ oraz INTEL** (rumor/contact) ⇒ własny slice, własny gate; `131cc2e` świadomie jej nie tknął.
- 🟠 **152 — POI nie ma pojęcia układu i NIE DA SIĘ tego załatać guardem:** `POIRegistry.js`/`POITypes.js`
  **nie mają pola `systemId` w ogóle** ⇒ naprawa = DODANIE pola + **migracja zapisu**, czyli decyzja
  o zakresie, nie jedna linia.
- 🟠 **153 — `EmpireLogisticsSystem` dobiera outposty bez terminu układu, a kurier nie ma warpu**
  (`:240-242` filtruje po właścicielu i złożu, trasa wyceniana surowym `hypot`). ⚠ **NIEUSTALONE**, czy AI
  realnie zakłada outposty poza układem stolicy — bez tego pomiaru nie wiadomo, czy dziura jest osiągalna.
- **Już zarejestrowane, nie duplikują:** **138** (`_findBodyNearPoint` skanuje całą galaktykę) i **142**
  (`_getValidTargets` klucza się na OGLĄDANYM układzie, nie na `vessel.systemId`) — ta sama klasa, otwarte.

---

## NARRACJA BITWY — jedno ogłoszenie, zwycięzca z uczestników (Findingi 150 + 155, save **v101 bez migracji**)

Slice przekrojowy, **NIE należy** do VESSEL_ORDERS (P0-P5 zostaje osobnym planem). Plan + pomiar +
decyzje D1-D6: `docs/design/BATTLE_NARRATION_PLAN.md`; rejestr macierzysty: `VESSEL_ORDERS_PLAN.md`
§Findings 150/155 (zamknięte) + 156-158 (nowe).

**Dwa różne defekty, jeden objaw.** Gra **ogłaszała jedną bitwę dwa razy** (150) i **czytała
zwycięzcę z kolejności ról wojny zamiast z uczestników** (155) — razem dawały cztery linie o jednej
walce, z których część kłamała o tym, kto wygrał.

- **150 — `announce: false` w JEDNYM szwie.** `DeepSpaceCombatSystem` emituje `battle:resolved` sam
  (`warId: null`), po czym `WarSystem._classifyBattle` księguje starcie przez `recordBattle`, a ta
  **emitowała ponownie**. Naprawa: `recordBattle(warId, result, { announce: false })` **wyłącznie**
  z `_classifyBattle` — jedyne wejście re-entrantne. Domyślnie ogłaszamy, więc `EnemyAttackHandler`,
  `forceBattle` i `_fleetArrived` (wywołania WPROST, jedyne ogłoszenie swojej bitwy) są nietknięte.
  **Jeden szew pokrywa DSCS i VCS** — lekcja `131cc2e` odwrócona: nie łatamy N producentów, tylko
  miejsce, przez które wszyscy przechodzą.
  ⚠ **KOREKTA ZAKRESU wobec rejestru:** duplikat dotyczył **tylko DSCS/VCS** (producent emituje sam,
  a księgowanie dokłada drugie ogłoszenie). EAH ogłaszał **raz**.
- **155 — tożsamość z UCZESTNIKA, nigdy z ról wojny.** NEW czysty `src/utils/BattleSides.js`
  (`isPlayerParticipant` / `participantName` / `resolveBattleSides` / `battleWinnerName`), wpięty
  w OBA listenery `battle:resolved` w `GameScene`. `_hasPlayerSide` deleguje do kanonu (D5);
  `_battleLoserSide` **nietknięte** (odpowiada na inne pytanie).
  ⚠ **Gracz jest oznaczony NIEJEDNOLICIE** — `{type:'vessel_group', empireId:'player'}` (DSCS/VCS),
  `{type:'player', empireId:'player'}` (EAH), `{type:'player'}` bez `empireId` (stary zapis).
  Predykat pyta o OBA znaczniki; zawężenie do `empireId` po cichu gubi obronę orbitalną (klasa S25).
  ⚠ **REGUŁA BRAKU:** nie da się przypisać gracza do strony ⇒ `playerSide === null` i **nie
  zgadujemy** — mniej treści zamiast odwróconej treści (wzór `_battleLoserSide`).

**⚠ TRZY RZECZY, KTÓRYCH POMIAR NIE POTWIERDZIŁ, TYLKO ZMIENIŁ:**
1. **Szkoda 150 była STANOWA, nie kosmetyczna.** `AutoRetreatSystem` nie jest idempotentny: drugi
   emit = drugi rozkaz odwrotu, a paliwo pobierane jest **przy wydaniu** (`MovementOrderSystem:924`)
   ⇒ **zmierzone ×2,0** (0,817 spalone przy koszcie kursu 0,409). Do tego `_battleQueue` nie
   deduplikuje po `battleId`, więc bitwa deep-space dostawała baner **i** pauzujący modal kina —
   wbrew decyzji Slice 1.
2. **Zagnieżdżony emit wyprzedza oryginalny.** `EventBus.emit` jest synchroniczny; zagnieżdżone
   ogłoszenie domyka się **w całości**, zanim zewnętrzny `forEach` dojdzie do kolejnego subskrybenta
   ⇒ **błędna linia trafiała do Dziennika PRZED poprawną**.
3. **Z2 okazał się KONTRAKTEM POZYCYJNYM, nie regresją.** Po naprawie jedynym ogłoszeniem bitwy DSCS
   jest emit producenta — czyli sprzed księgowania. Świat pozostaje spójny **tylko dlatego**, że
   `WarSystem` jest zarejestrowany PRZED `InvasionSystem` (`GameScene:318/319`), więc `recordBattle`
   domyka księgi wewnątrz tego samego emitu. **Zmierzone wykonaniem** (keeper T7a). ⚠ Kto zmieni
   kolejność konstrukcji albo udrożni desant AI z bitew DSCS — **T7 padnie**, i o to chodzi (D2).

**⚠ Dwie lekcje procesowe z tego slice'u:**
- **Próg dobrany do niewłaściwej skali to fałszywa zieleń.** Mój pierwszy pin paliwowy asertował
  „spalone ≤ połowa baku" i **przeszedł na niepoprawionym kodzie** — kurs odwrotu jest o rzędy
  wielkości tańszy niż bak. Pin musi porównywać z **kosztem jednego kursu**, nie z pojemnością.
- **Pin źródłowy bez kontroli na kodzie SPRZED naprawy jest zgadywaniem.** Wszystkie sześć pinów T6
  przepuszczono przez `git show HEAD` — każdy tam pada.

**i18n (D3):** linia Dziennika była **zahardkodowana po polsku** i `check-i18n` jej nie widział
(pyta o klucze w `t()`, nie o literały) — gracz EN dostawał polski meldunek o najgłośniejszym
zdarzeniu w grze. Siedem kluczy PL+EN (`log.battleLine`, `battle.player/unknownForce/homeSystem/
deepSpaceIn/retreatPlayer/retreatEnemy`). ⚠ **Prefiks `⚔` zostaje w OBU językach** — to językowo
neutralny uchwyt filtra na gate'cie (⚠ KOREKTA 2026-09-29: właściciel gra po PL — to znaczy, że Finding 295 jest dla niego NIEWIDOCZNY, dokładnie jak (Y)→(D) było niewidoczne dla gracza EN).

**⚠ Środowisko headless:** `node_modules/` zniknęło z maszyny, a łańcuch `GameCore → GroundUnitManager
→ GroundUnitFactory → GlbSnapshotRenderer` importuje `three`, które **nie jest zależnością
produkcyjną** (Three.js idzie z CDN). Odtworzono **udokumentowany** stub (`0.0.0-headless-stub`, tylko
`.` + `GLTFLoader`). ⚠ **Granica dowodu zachowana i zweryfikowana**: stub nadal NIE eksportuje
`TextureLoader`, więc `ColonyOverlay`/`GameScene` dalej nie importują się pod node. `node_modules/`
jest gitignorowane ⇒ nie wchodzi do commita. ⚠ **Od 2026-11-11 (Finding 683, CV-1c punkt 0) stub jest W GIT** — `src/testing/fixtures/three-stub/` + `devDependencies.three = "file:src/testing/fixtures/three-stub"`; `npm ci` / `npm install` odtwarza `node_modules/three` jako łącze do tego folderu (keeper `three_stub_fixture_smoke`).

Keepery: NEW `battle_announce_once_smoke` **19/19** (T5 = szkoda stanowa, T6 = pin limitu 156,
T7 = pin Z2 z kontrolą pinu na kształcie EAH) · NEW `battle_sides_smoke` **35/35** ·
`w3_battle_booking` T4 **ODWRÓCONY ŚWIADOMIE** (pinował `withWar === 1`, czyli sam defekt, pod
nagłówkiem „brak re-entrancji"; inwariant „jedno zaksięgowanie na starcie" został jako kontrola pinu),
20/20. Sweep **176/176 OK, 0 FAIL** · `check-i18n` PASS (pl=en=3279).

**Otwarte po tym slice'ie:** **156** (dwa rekordy jednej bitwy w zapisie, niepowiązane id) ·
**157** (`UIManager` filtruje `type === 'vessel_group'` ⇒ obrona orbitalna bez klasyfikacji wyniku
i bez auto-slow) · **158** (`BattleIntroModal`: zahardkodowany polski + nagłówki „AGRESOR/OBROŃCA"
na indeksach uczestników).

---

## STEROWANIE MAPĄ STRATCOM — Findingi 108 + 109 (save **v101 bez migracji**)

Plan + decyzje E1-E5 + gate: `docs/design/STRATCOM_CONTROL_PLAN.md`; rejestr macierzysty:
`COLONY_OWNERSHIP_GUARD_PLAN.md` §108-110 (108/109 zamknięte) + nowe 159/160.

**Dwa niezależne mechanizmy, jeden objaw: gracz tracił sterowanie mapą.** 109 — mapa **wybierała
inny układ, niż podświetlała**; 108 — tryb rozkazu warp **odcinał jedyne wejście do widoku układu
i nie dawał się rozbroić**.

- **109 — NEW `src/ui/StratcomHitLogic.js`** (czysty, zero importów): `topMostZoneAt` /
  `pickStarZone` / `resolveStratcomZone`, używany przez **klik i hover**.
  ⚠ **DWIE REGUŁY, NIE JEDNA — to jest cała subtelność.** `topMostZoneAt` rozstrzyga między
  **warstwami** (panel bije mapę — ta reguła **chroni absorbery**), `pickStarZone` rozstrzyga
  **między gwiazdami** (najbliższy środek). Zlanie ich w pre-pass — kuszące, bo taki wzór stoi
  w tym samym pliku przy `:1369` — **przebiłoby `warp_order_bg`** i przywróciło klik-przez-panel,
  czyli defekt cięższy od naprawianego. Rozstrzygacz jest **doprecyzowaniem zwycięzcy**.
- **108 — trzy dopięcia**: (a) `warp_order_cancel` czyści też `_selectedWarpShipId` („Anuluj" =
  *rozbrój tryb*); (b) `cluster_switch` **także** w `_drawWarpOrderPanel`, z bramką **skopiowaną**
  `explored && sysReg`; (c) `_close()` zeruje `_selectedWarpShipId` + `_warpShipScrollY`.
  ⚠ **`warp_order_send` świadomie NIE rozbraja** (decyzja E2) — marker przydaje się przy wysyłaniu
  kolejnych statków, a po (b) nie tworzy pułapki. Pinowane, żeby nikt tego nie „naprawił".

**⚠ CZTERY RZECZY, KTÓRYCH POMIAR NIE POTWIERDZIŁ, TYLKO ZMIENIŁ:**
1. **To KLIK miał rację, nie hover** — rysowanie idzie w kolejności pushu, więc „ostatnia pushowana"
   znaczy „na wierzchu". Ale **żadne nie miało racji do końca**: strefy 22×22 przy glifie r ≤ 7
   nakładają się także wtedy, gdy gwiazdy wizualnie się nie stykają ⇒ właściwą odpowiedzią jest
   **najbliższy środek**, a nie kolejność. Samo odwrócenie pętli **nie wystarczyło**.
2. **Ucieczki z pułapki 108 były WĘŻSZE, niż zapisano.** `_close()` czyścił **dwóch z czterech**
   członków rodziny, a `open({tab})` przypisuje zakładkę **z pominięciem `_switchTab`** ⇒
   **Esc + `M`/`G` nie odblokowywało**; pułapka przeżywała zamknięcie overlaya.
3. **`cluster_switch` ma DRUGIEGO producenta** (`:7395`, panel „Interstellar Arrival") — wąska
   furtka, której rejestr nie odnotował.
4. **Kolejność wobec Findingu 110 jest wiążąca**: 110 naprawia się przez **powiększenie** stref
   gwiazd, co **zwiększyłoby nakładanie** i pogorszyło 109. Dlatego 109 poszło pierwsze.

**⚠ `FleetManagerOverlay` IMPORTUJE SIĘ pod node** (zweryfikowane wykonaniem), a `handleClick`
i `handleMouseMove` są na prototypie ⇒ **oba findingi pinowane WYKONANIEM, nie źródłowo** — dla
warstwy UI w tym repo to rzadkość. Panel testowany **prawdziwą ścieżką rysującą** na atrapie `ctx`
(wzór `zero_colony_panels`), z kontrolą pinu „panel realnie się narysował" — inaczej brak przycisku
myliłby się z brakiem rysowania.

Keepery: NEW `stratcom_star_pick_smoke` **10/10** (fail-first 4/6; T2 ma **dwa** przypadki o różnych
poprawnych odpowiedziach, więc „naprawa przez odwrócenie pętli" zdałaby połowę i padła na drugiej;
T3 absorber **przechodził już przed naprawą** = strażnik regresji) · NEW `stratcom_warp_trap_smoke`
**14/14** (fail-first 9/5). Sweep **178/178 OK, 0 FAIL** · `check-i18n` PASS · **zero nowych kluczy**
(reuse `fleet.clusterSwitch`).

**Domknięte:** **110** ✅ (sekcja „Ikona statku…" niżej) · **160** ✅ (sekcja „Wejście w zakładkę…"
niżej). **159** — ⬜ **PRZEKLASYFIKOWANY na UTAJONY**: `commandTacticalMap: false` ⇒ 6 z 7
producentów `map_body` nigdy nie biegnie, a siódmy (Atlas) to rozłączne wiersze z tooltipem już
iterującym od końca. Wraca tylko z flagą. Audyt całej trójki:
`docs/audit/STRATCOM_110_159_160_AUDIT.md`.

---

## Wejście w zakładkę Dowództwa — Finding 160 (save **v101 bez migracji**, live-gate 6/6 PASS — ZAMKNIĘTE)

Domknięcie **niedokończonej połowy Findingu 108**. Plan + decyzje T1-T6: `docs/design/OVERLAY_TAB_ENTRY_PLAN.md`;
audyt: `docs/audit/STRATCOM_110_159_160_AUDIT.md` §3.

**Jedno zdanie:** klawisz otwierający Dowództwo **na już otwartym Dowództwie** przełączał zakładkę
z pominięciem `_switchTab` **i** `close()`, więc nic nie sprzątało po zakładce, z której gracz wyszedł.

⚠ **`close()` NIE JEST ratunkiem, bo NIE BIEGNIE.** `OverlayManager.handleKey:75-80` przy JUŻ aktywnym
overlayu woła `_showOverlay` **bez** `_hideOverlay` (żeby drugie wciśnięcie `K` ponawiało focus zamiast
zamykać) ⇒ `open(opts)` wykonuje się na ŻYWYM overlayu. W `open()` były **TRZY** przypisania
`_activeTab` (`opts.tab` · `focusSection` · `view:'registry'`) i żadne nie szło przez `_switchTab`.
Naprawa utwardza **wszystkie trzy** — nieutwardzony bliźniak to mina (`removeColony:667`, `ReturnJump`).

⚠ **OSIĄGALNOŚĆ ROZSTRZYGA POJEDYNCZY BRAK HANDLERA.** Pole ilości Logistyki ma `blur → commit →
close` (`:1089`) ⇒ samo się leczy, a póki ma fokus, jego `keydown` robi `stopPropagation`, więc `M`
i tak nie dotrze do gry ⇒ **nieosiągalne**. **Wyszukiwarka Rejestru (`:4366-4393`) NIE MA `blur`** —
celowo, fraza ma przeżyć przeglądanie listy ⇒ wpisz frazę, kliknij kanwę, wciśnij `M` i **pole
tekstowe zostaje nad mapą galaktyki**. To jedyna osiągalna ścieżka i to ona jest rdzeniem gate'u.
`blur` **świadomie NIE dołożony** (T5) — po zamknięciu chokepointu byłby naprawą objawu.

⚠ **`_switchTab` ma early-return `tab === _activeTab` i TO ZOSTAJE** (T4, pinowane): wyciek polega na
**PRZENIESIENIU** pola DOM tam, gdzie nie należy; gdy zakładka się nie zmienia, nic się nie przenosi.
Gracz w Rejestrze, który wciska `K`, ma zobaczyć pole **na miejscu** — to poprawny wynik, nie defekt.

⚠ **PRZY OKAZJI DOMKNIĘTA RESZTKA 108:** kontrola pinu T4 padła fail-first — przed naprawą wejście na
Stratcom **z innej zakładki** nie resetowało `_selectedWarpShipId`/`_selectedClusterSystem`, bo tamten
slice zamknął to wyłącznie w `_close()` (ścieżka Esc). Druga droga do tej samej pułapki zamknięta.

**Zbiór producentów zamknięty:** dokładnie `g`, `m`, `k` — jedyne wpisy keymapy w formie `{id, opts}`,
wszystkie celujące w `fleet`. `Outliner:732/736` woła `openPanel('fleet')` **bez opcji**, a
`TacticalDock:671` jest przy otwartym overlayu **nieklikalny** (`UIManager:1724`). ⚠ Ale **Outliner
JEST klikalny przy otwartym overlayu** (`UIManager:1715` bez bramki `isAnyOpen`, inaczej niż Dok) —
dziś nieszkodliwe, furtka na przyszłość, gdyby ktoś dodał tam `opts.tab`.

Pliki: `FleetManagerOverlay.open()` (3 linie), NEW keeper `src/testing/smoke/overlay_tab_entry_smoke.mjs`
**28/28** (fail-first 20/8; T6 = pin **wykonaniowy** na `new OverlayManager()._keyMap`, nie regex na
źródle). Sweep **179/179 0 FAIL** · `check-i18n` PASS · zero migracji · zero nowych kluczy i18n.
⚠ Granica dowodu live-gate §4: brak wraków w zapisie ⇒ potwierdzone **zachowanie**, nie **treść**
filtra wraków (ta pinowana wykonaniowo, T5).

---

## Ikona statku na mapie galaktyki — Finding 110 (save **v101 bez migracji**, live-gate 7/7 PASS — ZAMKNIĘTE)

Plan + decyzje S1-S7: `docs/design/STRATCOM_SHIP_ICON_PLAN.md`; audyt: `docs/audit/STRATCOM_110_159_160_AUDIT.md` §1.

**Jedno zdanie:** ikona własnego statku rysuje się **13 px nad gwiazdą**, a strefa klikalna sięgała
11 px w górę — więc wyglądała na klikalną, nie była, a klik w nią był **cicho połykany**.

**Wariant (c)** (podpisany): ikona przechwytuje **własny** klik (wybiera STATEK, typ
`warp_ship_select` = **reuse** handlera z listy po lewej `:2303`), reszta strefy gwiazdy wybiera
UKŁAD jak dotąd. Jedyny wariant spójny ze statkami **w tranzycie**, które nie mają obok siebie
żadnej gwiazdy. `_drawStratcomOwnBlip` **zwraca** punkt kotwiczenia ikony (albo `null` dla licznika
„+N") — żeby rysowanie i trafianie nie liczyły tej samej geometrii dwa razy (klasa 109).

⚠ **POMIAR BYŁ GORSZY NIŻ REJESTR:** środek ikony nie leżał w strefie **NIGDY** (81 % ikony poza,
także przy jednym statku); martwy pas był **też POZIOMY** (wachlarz ±22,5 px przy półszerokości
strefy 11 ⇒ skrajne ikony **0 %** wspólnego pola); ikony w tranzycie nie miały **żadnej** strefy.

⚠ **SPROSTOWANIE, które trzeba znać przed dotknięciem tej okolicy:** „kotwica celowania musi być
JAWNA w `zone.data`" jest prawdą **wyłącznie dla naprawy przez ROZCIĄGNIĘCIE strefy** (`pickStarZone`
liczy do środka STREFY ⇒ asymetria przesuwa kotwicę i cofa 109 — zmierzone 2 przewroty). Wariant (c)
niczego nie rozciąga, więc strefa gwiazdy zostaje symetryczna i kotwica byłaby **no-opem**. Zamiast
zmieniać działający kanon stoi **TRIPWIRE** (keeper T8, pin źródłowy): asertuje symetrię
`cluster_star` i przy próbie rozciągnięcia wypisuje instrukcję ze zmierzonymi liczbami. Decyzja S1=W2.

⚠ **SZEROKOŚĆ STREFY == `STRATCOM_FAN_STEP` to decyzja, nie zbieg okoliczności** (S3): strefy ikon
**kafelkują** wachlarz ⇒ 0 par nachodzących. Szersze wymagałyby tie-breaku między ikonami, czyli
dokładnie dwuznaczności, którą usuwał 109. Live-gate potwierdził, że 9 × 12 px wystarcza w realnym
użyciu (wariant W2 z wyższą strefą został niewykorzystaną furtką).

⚠ **CULL WIDOCZNOŚCI BYŁ OBOWIĄZKOWY** (S4): `ctx.clip()` przycina RYSOWANIE, ale `_hitZones` to
zwykłe prostokąty — **clip ich nie dotyczy**. Pętla gwiazd ma jawny cull i **dlatego** ich strefy nie
uciekają poza mapę; pętla blipów go nie miała. Bez niego strefa ikony z układu poza kadrem
wylądowałaby **nad lewą listą statków warp** (rysowaną wcześniej ⇒ phantom pushowany później
wygrałby `topMostZoneAt` i klik w wiersz listy zaznaczałby inny statek).

**Zysk ponad naprawę:** lewa lista ma `break` przy przepełnieniu (`:6613`, „MVP: limit widocznych")
⇒ statki poza widocznymi wierszami były **niewybieralne w ogóle**; ikona na mapie jest dla nich
jedyną drogą. Tak samo statek w tranzycie warp.

Pliki: `FleetManagerOverlay` (nowa stała `STRATCOM_SHIP_HIT_H`, `_drawStratcomOwnBlip` zwraca punkt,
NEW `_pushShipBlipHitZone`), NEW keeper `src/testing/smoke/stratcom_ship_icon_smoke.mjs` **32/32**
(fail-first **21/11**, zmierzony finalnymi pinami przez `git stash` samego kodu gry). Sweep
**180/180 0 FAIL** · `check-i18n` PASS · **zero** zmian w `StratcomHitLogic` · zero migracji · zero
nowych kluczy i18n.

⚠ **Dwie lekcje z pisania tego keepera:** (1) `every()` i pętla par **przechodzą jałowo na pustej
tablicy** ⇒ dwa piny świeciły zielono dokładnie tam, gdzie był defekt (pierwszy przebieg 23/9 zamiast
21/11); asercje muszą wymagać niepustego zbioru. (2) Trójkąt statku rysuje się **niesymetrycznie**
względem kotwicy (wierzchołek −4,5, podstawa +3,5), więc środek bboxa leży 0,5 px nad nią — ostra
równość `at.y === drawn.y` była pinem **nieprawdziwym**; tolerancja ≤ 1 px przy skali realnego
rozjazdu = 9 px (krok wachlarza).

---

## Bitwa o stolicę zwalnia czas, narratorem zostaje JEDEN — Finding 157 (save **v101 bez migracji**, live-gate 1/2/5 PASS, commit `a5ca81e`)

Audyt: `docs/audit/BATTLE_RESULT_CLASSIFICATION_AUDIT.md`; rejestr: `VESSEL_ORDERS_PLAN.md` §157
(zamknięty) + nowe **161-165**.

**Jedno zdanie:** `UIManager` rozpoznawał gracza w bitwie po **koniunkcji**
`type === 'vessel_group' && empireId === 'player'`, a obrona orbitalna opisuje gracza jako
`{type:'player'}` (`EnemyAttackHandler:181`) ⇒ predykat odpadał na `type`.

⚠ **POMIAR ZMIENIŁ TYTUŁ FINDINGU.** Klasyfikacja wyniku **JEST** dowożona: pauzującym banerem
`showBattleOutcome` (werdykt poprawny po 155) i linią `log.battleLine` z `GameScene` (nazwy stron +
poprawna severity). Brakowało **wyłącznie auto-slow** — i to cięższa połowa, bo `vessel:engaged`
(jedyne inne wejście auto-slow przy walce) ma **dokładnie jednego producenta: `DSCS:395`**. Baner
pauzuje, ale `_restoreTime` emituje `time:play` **BEZ zmiany mnożnika** (pauza i mnożnik są
ortogonalne — `setMultiplier` nie dotyka `isPaused`), więc po OK gracz wracał do prędkości sprzed
bitwy — **prosto w desant** (`InvasionSystem._onVesselGroupVictory`).

**Zasięg: TRZEJ producenci**, nie sama stolica — EAH `:181`, `WarSystem.forceBattle:416`,
`_fleetArrived:550`. Filtr powstał w **M4 P1** (`b2be101`), gdy jedynym producentem bitew „z graczem"
była rodzina vessel-combat; **W3-7 dostemplował `empireId`**, żeby domknąć klasę S25 — ale ten
konsument pyta **też** o `type`.

**Naprawa (wariant W3, podpisany):** handler pyta kanonem `isPlayerParticipant` i robi już **tylko**
auto-slow; gałąź `log.m4.battleResolved*` **WYCOFANA**. Była DRUGIM narratorem tej samej bitwy —
surowy `battleId` w tekście dla gracza, płaska waga (`TYPE_MAP.combat` → `warn` **nawet dla
zwycięstwa**). Poszerzenie filtru rozmnażałoby dublet wbrew linii 150/155, a przy potyczce bez wojny
dawałoby **trzecią** linię (162). Razem z gałęzią znikł polski literał `'gracz'`/`'wróg'` wstrzykiwany
do klucza i18n (klasa 113). ⚠ `playerSide` przestał być potrzebny ⇒ **REGUŁA BRAKU zniknęła jako
problem** — nie ma czego zgadywać, gdy nie ma czego opisywać. Klucze zostają w słownikach.

### ⚠ Dwie lekcje, obie kupione na tym gate'cie

1. **Kontrola pinu grepująca LITERAL w konsumencie dowodzi OBECNOŚCI NAPISU, nie PRZYJĘCIA KSZTAŁTU.**
   `w3_attack_visibility_smoke` T4 sprawdzało `/empireId === 'player'/` w `UIManagerze` jako dowód, że
   stempel W3-7 ma realnego konsumenta — i **świeciło na zielono przez cały czas, gdy konsument był
   zepsuty** (literał istniał, tylko wewnątrz koniunkcji odrzucającej EAH). Przepięte na: delegacja
   źródłowo + **akceptacja stempla WYKONANIEM** (44/44).
2. **Weryfikuj ISTNIENIE elementu UI, który każesz komuś kliknąć** — nie tylko składnię
   jednolinijkowca (rozszerzenie `validate-gate-oneliners-on-live-engine`). Krok 4 gate'u kazał
   właścicielowi wyłączyć auto-slow w menu; **takiego przełącznika nie ma** (Finding 164), więc
   zgłoszona 🔴 była poprawną obserwacją **niewykonalnego kroku**, nie defektem naprawy.

**Keeper** `battle_result_classification_smoke` **34/34**, fail-first **26/6** (padło dokładnie sześć
asercji opisujących naprawę; wszystkie kontrole pinu zielone po OBU stronach). ⚠ `UIManager` **nie
importuje się pod node** (`THREE.TextureLoader is not a constructor` — ta sama ściana co
`ColonyOverlay`; stub `three` **celowo** nie wystawia loadera i **nie wolno** go podnosić) ⇒
zachowanie pinowane **źródłowo**, matematyka i lekarstwo **wykonaniem** (prawdziwy `TimeSystem`).
Sweep **183/183 0 FAIL** · `check-i18n` PASS · zero nowych kluczy i18n.

**Otwarte po tym slice'ie (żadne nie blokuje):** **161** baner odpauzowuje ręczną pauzę
(`timeSystem.paused` nie istnieje — jest `isPaused` ⇒ `wasPaused` zawsze `false`) · **162** EAH bez
wojny pisze własną polską linię Dziennika obok `log.battleLine` · **163** drugi blok polskich
literałów w `showBattleOutcome` (dodatek do 158) · **164** przełącznik auto-slow bez producenta
(`time:autoSlowToggle` = handler + zero nadawców; `_autoSlowEnabled` niesérializowane ⇒ zawsze `true`)
· **165** **obrona orbitalna nie ma PRZEBIEGU** — EAH rozstrzyga jednym `resolveBattle` (batch 500 ms),
bez rund i bez `vessel:engaged`, podczas gdy DSCS tyka rundami ~2,2 s realne; popup „WYKRYTO WROGĄ
JEDNOSTKĘ" (`vessel:firstSighting`) to **detekcja raz na statek**, nie sygnał starcia.

---

## Zakres układu przy wyborze celu — Findingi 138 + 142 (save **v101 bez migracji**, fail-first 12/17 → 31/31, live-gate PENDING)

Audyt + pomiary: `docs/audit/SYSTEM_SCOPE_138_142_AUDIT.md` · sonda `src/testing/headless/probe-system-scope-138-142.mjs`
(before/after) · rejestr macierzysty `docs/design/VESSEL_ORDERS_PLAN.md` §138/§142 (oba zamknięte).
Decyzje **D-SS1..D-SS5b** podpisane 2026-08-27.

**Jedno zdanie:** dwa selektory celu odpowiadały na pytanie „**co widzę**" zamiast „**co ten statek
może zrobić**" — a każdy układ ma własną ramkę współrzędnych z gwiazdą w (0,0), więc ciała obcych
układów zajmują te same zakresy surowych x/y.

⚠ **SKUTKI BYŁY PRZECIWNE i to jest sedno slice'u:** 138 kończył się **ODMOWĄ**
(`_findBodyNearPoint` brał obce ciało → bramka W3-4b słusznie odrzucała `target_other_system`),
142 kończył się **ZGODĄ** (misja startowała, pobierała paliwo, leciała w pustkę własnego układu,
a `_vesselIsAtTarget` **przyjmował przylot**). Naprawa samego 138 zamieniłaby odmowę w dryf
w pustkę, czyli w 142 w innym opakowaniu — dlatego jeden slice.

- **D-SS1=W1** — `_findBodyNearPoint(x, y, maxAU, vessel)`, filtr **wewnątrz helpera** (kontrakt
  należy do helpera, nie do jedynego dzisiejszego wołającego — lekcja `131cc2e` + P0 §6).
  `vessel` opcjonalny (zgodność wstecz) ⇒ **pin ŹRÓDŁOWY** T2e pilnuje, że jedyny producent go podaje.
- **D-SS2=W1** — **fail-OPEN przez `systemIdOf`**, NIE `EntityManager.getByTypeInSystem`.
  ⚠ Ta druga jest **fail-CLOSED** (zmierzone: ciało bez stempla → 0 wyników) i repo odrzuciło ją raz
  explicite (`RetreatTarget.js:70-72`). Tu wiążące podwójnie: PRZED naprawą filtra **nie było
  żadnego**, więc fail-closed byłby regresją, nie naprawą. Tripwire **T1e** zapali się, gdy ktoś
  „uprości" naprawę. `systemId === null` (tranzyt warp) ⇒ pusty zbiór (wzór `bodiesInSystemOf`).
- **D-SS3=W1** — `_getValidTargets` klucza się na `vessel.systemId`; **`activeSystemId` nie jest
  w tej funkcji czytane ANI RAZ** (zmienna usunięta świadomie). ⚠ Rejestr opisywał **połowę**
  defektu: obok fałszywego pozytywu istniał fałszywy NEGATYW — własne, osiągalne cele znikały
  w całości (**0/3**), bo pętla główna brała ciała kamery, a gałąź cross-system pomijała
  `sys.id === activeSysId` z komentarzem „in-system pokryty wyżej" (**nie był**). Dwa błędy znosiły
  się do zera celów. ⚠ W pickerze `getByTypeInSystem` **ZOSTAJE** — było tam już wcześniej, więc
  nie jest regresją; różnica wobec D-SS2 jest zamierzona i opisana w kodzie.
- **D-SS4=TAK** — rodzina liczyła **trzy** miejsca: `MissionSystem._findNearestUnexplored`
  + `getUnexploredCount` (żywe przez `deep_scan` i recon `nearest`) miały ten sam defekt, a
  **poprawny bliźniak `_findNearestUnexploredFrom:2782` stał dwie funkcje niżej**. Wspólny helper
  `_reconScopeSystemId(vessel)` — trzy stany, nie dwa (statek / tranzyt warp `null` / brak statku
  = kamera dla zgodności wstecz). ⚠ Komentarz przy wołającym twierdził, że wybór celu jest
  „zakotwiczony w **domu**" — kod czytał **kamerę**; pokrywało się to tylko przy kamerze na domu.
- **D-SS5=TAK / D-SS5b=tylko GRACZ** — obrona w głąb: `VesselManager._missionTargetOutOfSystem`
  wołany z **OBU** dyspozytorów. ⚠ **`_launch*` NIE JEST jednym miejscem, a dyspozytorzy są DWAJ**:
  `dispatchOnMission` **i** `redispatchFromOrbit` (`MissionSystem:967` — dostawa **PO SKOKU WARP**),
  więc bramka w jednym byłaby nieutwardzonym bliźniakiem na trasie legalnej. Odmowa reużywa
  maszynerii **VO-2** (osiem ścieżek `_launch*` → `_abortLaunch` ze zwrotem kosztów). Bezpieczne,
  bo `OrderService._maybeDeliver` wydaje dostawę dopiero przy `v.systemId === po.targetSystemId`.
  **AI zwolnione** (`PHASE5_TODO` → Finding 153: osiągalność niezmierzona, a cichy zator logistyki
  AI byłby regresją gorszą od zamykanego defektu).
- ⚠ **`_abortLaunch` pyta o powód TYM SAMYM predykatem co bramka**, bo dyspozytor zwraca goły bool
  — inaczej gracz dostawał „Statek niedostępny" na odmowę o przyczynie układowej (klasa Findingu
  141). To duplikuje **wyjaśnienie**, nie bramkę. Zero nowych kluczy i18n (`vessel.reasonTargetOtherSystem`).

**Skala (sonda §2, realne `SystemGenerator`):** przy **1** układzie defekt **NIE ISTNIEJE (0 %)** —
układy powstają leniwie; przy 12 → **90,9 %** snapujących klików bierze obce ciało, przy 20 → 94,6 %.
⚠ Klik **dokładnie** na własnym ciele wygrywa **62/62** (dystans 0 jest nie do pobicia) — bolało
klikanie w **pustą przestrzeń**, i dlatego przeżyło tak długo.

**Świadomie POZA slice'em:** **151** (odwrotny kierunek fail — bramkuje detekcję/intel) · **152**
(brak POLA `systemId` ⇒ migracja zapisu) · **153** (nieznana osiągalność) · **154** (decyzja
właściciela przy `RETREAT_TARGET_PLAN`) · **166 NEW** (`FMO._handleFleetEngage:4544` — lista wrogów
wg kamery, poziom floty, niezmierzone) · bliźniak w `ExpeditionSystem.js` (**zero** produkcyjnych
importów — martwy alias).

**Pliki:** `VesselManager` (zakres snapu + `_missionTargetOutOfSystem` + 2 dyspozytory),
`MovementOrderSystem` (producent snapu), `MissionSystem` (`_reconScopeSystemId` + 2 selektory
+ `_abortLaunch`), `FleetActions` (bramka `deep_scan`), `FleetManagerOverlay` (`_getValidTargets`).
Keeper `src/testing/smoke/system_scope_orders_smoke.mjs` **31/31**; regresja `cross_system_targets_smoke`
8/8 bez zmian (⚠ ustawia `activeSystemId === vessel.systemId`, więc defektu **nie widział** — ale
jest dokładnie pinem „identyczność co do wiersza", którego wymagał `VESSEL_ORDERS_PLAN` §7a).
Sweep **185/185 0 FAIL** · `check-i18n` PASS.

⚠ **Trzy piny przeszły w międzyczasie JAŁOWO i każdy świecił dokładnie tam, gdzie był defekt:**
odmowa nie tworzy misji, więc `mission?.targetId == null` było zielone na zepsutym kodzie ·
`every()` na **pustym** zbiorze celów · identyczna liczba niezbadanych ciał w obu układach fixture'u.
Fail-first bez ich poprawienia pokazywał **11/10** zamiast **12/17**.


---

## KANON „UKŁAD ZBADANY" — Findingi 186 + 187, stanowa reszta W3-32 (save **v101 bez migracji**, live-gate PASS)

Audyt W3-32 (pozycja nr 1 w `OPEN_FINDINGS_INDEX.md` §E) zastał ten finding **ZAMKNIĘTY dziewięć dni
wcześniej** (`61bdffe`, W3-5b; bramka właściciela `MissionEventModal:634`, keeper 5/5 zielony po
ponownym uruchomieniu). ⚠ **Ale W3-32 nazwał DWIE szkody:** pauzę z fałszywą treścią (zamknięta) i
**„darmowy skan układu"**. Ta druga miała drugi, niezależny kanał — **stanowy, u producenta** — i żyła.
Rejestr: `docs/design/VESSEL_ORDERS_PLAN.md` §Findings z audytu W3-32.

**186 (🔴 żywy od pierwszej tury).** `StarSystemManager.generateAndRegister` zapalał DWIE flagi —
`galaxyStar.explored` (`:105`) i lustro `sysData.explored` (`:114`) — a `EmpireColonyBootstrap:612-615`
gasił **tylko pierwszą**. Pięciu konsumentów czytało `galaxyStar` (poprawnie), DWAJ czytali obie przez
**OR**: `FleetManagerOverlay:6249` (panel detalu STRATCOM) i `:6784` (panel rozkazu warp — bramka
**świadomie skopiowana** stamtąd w Findingu 108/Z4, więc odziedziczyła też defekt). Skutek, ZMIERZONY
WYKONANIEM przy `getMaxSystemScanTier() = 0` (gracz **bez obserwatorium**): pełny spis ciał w **tierze 3**
(`Planety=11 Księżyce=27 Planetoidy=26 … Razem=64`), status „Zbadany" na zielono i przycisk
**„🔭 Przełącz widok"** → widok 3D cudzego układu. **Dwa kliknięcia** (strefa `cluster_star` jest
pushowana dla KAŻDEJ gwiazdy, bez bramki `known`, `:6124`), dla domowego układu **każdego** imperium AI
(`EmpireGenerator:242` bootstrapuje wszystkie przy generacji galaktyki), **i szło do zapisu**
(`serialize:238` / `restore:265` z fail-OPEN `?? true`). ⚠ Przeżyło, bo nazwa układu ma TRZECI predykat
(`_systemDisplayName:6355`) i zostawała „???" — panel **wyglądał** na zamglony, oddając spis i wejście.

**187 (🟠 latentny).** `VesselManager._tickInterstellar:2709` woła generator dla **dowolnego** statku, więc
przylot rajdera AI zapalał `galaxyStar.explored` — czyli mgłę **także na mapie i w Outlinerze**. Dziś
nieosiągalne: AI skacze wyłącznie do układów gracza (`DirectorOffensive.reachableTargets:122-136`), a te są
zbadane z definicji. Uzbraja się przy pierwszym skoku AI gdziekolwiek indziej.

**Naprawa — (b) kanon + (a) obrona w głąb, jeden commit.** NEW `src/utils/SystemExploration.js` (wzór
`ColonyOwnership.js`: rodzina nazw `isSystemExplored` / `isSystemExploredId` / `isSystemExploredData` /
`markSystemExplored`, **zero importów**, **fail-CLOSED**). `generateAndRegister` **przestaje oznaczać
eksplorację** — generacja układu to fakt techniczny, nie akt poznania; oznacza wołający. `restore`
fail-closed z gałęzią domową. **Siedem** konsumentów na kanon (FMO ×4, `Outliner:191`,
`CivilianTradeSystem:95`, diagnostyka `GameScene` — bo diagnostyka MUSI czytać predykat bramki).
Bootstrap gasi **obie** flagi.

**⚠ TRZY RZECZY, KTÓRYCH POMIAR NIE POTWIERDZIŁ, TYLKO ZMIENIŁ:**
1. **Kierunek fail jest tu ODWROTNY niż w `SystemScope.isSameSystem`.** Tam brak stempla znaczy
   „przepuść", bo cena fałszywego negatywu to cichy paraliż floty. Przy mgle wojny cena fałszywego
   POZYTYWU to trwały wyciek, który **idzie do zapisu** ⇒ „nie wiem" musi znaczyć „nie znam".
2. **Zamknięty PRZECIWNY defekt, którego nikt nie zgłosił:** `_tickInterstellar` woła generator tylko
   `if (!ssMgr.getSystem(...))`, a układ AI jest już wygenerowany przy bootstrapie ⇒ przylot **GRACZA**
   do cudzego układu **nie odkrywał go wcale**. Ten fałszywy negatyw był maskowany przez lustro w OR-ze
   `:6249` — czyli przez sam defekt 186. Dlatego oznaczenie stoi **poza** gałęzią leniwej generacji.
3. **Fixture keepera opierał się na usuwanym side-effekcie** i po naprawie padło **pięć kontroli pinu**.
   Poprawny fixture modeluje **zatruty zapis** (lustro jawnie zapalone — tak wygląda każdy save sprzed
   poprawki) i markuje „zbadany" **prawdziwą ścieżką pisarza** (przylot gracza). Bez tej korekty T1
   przechodziłby **jałowo**.

⚠ **LEKCJA WIĄŻĄCA DALEJ — lustro stanu jest długiem, nie wygodą.** Fakt „`sysData.explored` zostaje
true, więc filtrujemy po `galaxyStar`" był **zapisany w źródle w DWÓCH miejscach**
(`EmpireColonyBootstrap:612`, `Outliner:185-186`) zanim ktokolwiek nazwał go defektem. **Gdy dwa miejsca
obchodzą to samo pole, kanon jest już spóźniony.**
⚠ **REGUŁA O INDEKSIE:** `OPEN_FINDINGS_INDEX.md` nie jest źródłem prawdy (sam to deklaruje) — jego
pozycja nr 1 była zamknięta. Przed planowaniem slice'u z listy „przepisane bez pomiaru": **uruchom
keeper i `git log -S`**.

**Live-gate 2026-08-29 PASS** (właściciel, dwa układy AI — Akhernar i Wezen): status „Niezbadany", brak spisu ciał, brak przycisku „Przełącz widok".

Keeper `src/testing/smoke/system_exploration_canon_smoke.mjs` **21/21**, fail-first **7/14** zmierzony
FINALNYM fixture'em przez `git stash` samego kodu gry (wszystkie sześć kontroli pinu zielone po obu
stronach). Sweep **187/187 0 FAIL** · `check-i18n` PASS · zero migracji · zero nowych kluczy i18n.

---

<!-- CLAUDE.md L2776–2860 -->
## MGŁA WOJNY STRATCOM — Finding 188: dwie osie zamiast jednej flagi (save **v101 bez migracji**, live-gate PENDING)

Plan + decyzje **D-188-1..8 (wszystkie W1)** + wykonanie + checklista gate'u:
`docs/design/STRATCOM_REVEAL_PLAN.md`; rejestr macierzysty: `VESSEL_ORDERS_PLAN.md` §188 (zamknięty)
+ nowy **193**.

**Jedno zdanie:** panel STRATCOM wydawał na `rumor` nazwę imperium, jego wrogość i realną populację
przy statusie „Niezbadany" — bo `known = isHome || explored || isAtLeast(empireId,'rumor')` **zlewało
dwie niezależne osie wiedzy** i każdy z sześciu faktów wychodził przy SŁABSZYM z dwóch warunków.

⚠ **REJESTR POLICZYŁ TRZY REWEALE, A BYŁO ICH SZEŚĆ — i jeden z policzonych był fałszywy.** Nazwa
w PANELU była już bramkowana poprawnie (`_systemDisplayName` → `???`); wyciekała na MAPIE
(`_stratcomVisibleSystems`), czyli w innej funkcji. Nie policzono za to **tożsamości imperium**
i **wrogości** — obu na `rumor`, w panelu I jako kolorowy pierścień gwiazdy. ⇒ [[registry-may-describe-the-trap-not-the-bug]].

**Dwie osie (to jest cały model, nie próg):**
- **oś MIEJSCA** — `isSystemExplored` / skan STRATCOM — *byłem tam albo zmierzyłem*: nazwa, ciała,
  życie, infrastruktura, jasność gwiazdy.
- **oś WŁAŚCICIELA** — `intel.<empireId>` (`rumor → contact → detailed`) — *co wiem o tym, KTO tam
  mieszka*: tożsamość, archetyp, wrogość, liczby.

**Kanon NEW `src/utils/SystemReveal.js`** — `resolveSystemReveal(sys, {explored, scanned, intelAtLeast})`
→ rekord `{place, name, ownerExists, ownerIdentity, hostility, population, life}`. **Zero importów**
(trzy kanały wstrzykiwane), **fail-CLOSED** (jak `SystemExploration`, odwrotnie niż `SystemScope`).
Rekord, nie rodzina predykatów — bo pytań jest sześć i to gwarantuje, że cztery powierzchnie (panel
detalu, etykieta gwiazdy 2D, jasność gwiazdy 3D, pierścień wrogości) czytają TO SAMO POLE.
Punkt składania: `FleetManagerOverlay._systemReveal` — **jedyny**.

**Sygnatura (W1):** nazwa `explored‖skan‖rumor` · `Właściciel: obce imperium` na `rumor` (jeden nowy
klucz i18n) · tożsamość+wrogość `contact` · **populacja `detailed`** · życie `explored` · infrastruktura
oś miejsca. Pierścień na `rumor` → **neutralny** (bez odczytu dyplomatycznego).

⚠ **`population` ma gałąź `!hasOwner` i jest ona KONIECZNA:** układ skolonizowany przez GRACZA nie ma
`empireId`, więc bez niej gracz przestałby widzieć populację **własnej** kolonii poza domem. To jedyne
miejsce, gdzie zwężenie mgły mogło uderzyć w gracza zamiast w AI (krok 6 live-gate'u).

**⚠ TRZY POMIARY, KTÓRE ZMIENIŁY PROJEKT (nie potwierdziły go):**
1. **`IntelSystem` NIE musiał być ruszany** — wizyta w cudzym układzie JUŻ podnosi intel do `contact`
   (`IntelSystem:204`), więc osie były połączone poprawnie; zepsuta była wyłącznie **prezentacja**.
2. **Spór „żywy odczyt vs snapshot" był już rozstrzygnięty w tym repo** — `_refreshKnownMilitary`
   odświeża `knownMilitary` co tik dla `detailed`, z uzasadnieniem w komentarzu: *„to nie jest wyciek
   mgły wojny, tylko aktualizacja tego, co gracz i tak ma prawo widzieć"*. Defektem jest **szczebel**,
   nie **żywość** ⇒ populacja zostaje żywym odczytem, zero zmian formatu zapisu.
3. **`detailed` jest OSIĄGALNE** (sprawdzone celowo, żeby nie rekomendować szczebla, na którym pole
   byłoby puste na zawsze): `ColonyOverlay:5077` → `GroundUnitManager.startSurvey` → … → emit. Droga —
   wymaga butów na ziemi w ich układzie.

⚠ **`isEmpKnown` USUNIĘTY, nie osierocony** — stracił konsumenta wraz z flagą `known`, a to nim
wyciekała tożsamość; zostawiony byłby gotową miną („czy znam to imperium") dla następnej osoby.
⚠ Komentarz w `SystemExploration.js` wskazywał `FMO:5541` jako **celowe** miejsce składania trzech
kanałów — po tej zmianie kłamałby, więc został zaktualizowany w tym samym commicie.

**Keeper** `stratcom_reveal_smoke` **75/75**, fail-first **46/25** (finalne piny na nietkniętym kodzie,
kontrole pinu zielone po obu stronach). T4 = **tripwire anty-lustro**: nazwa w panelu i na mapie muszą
pochodzić z jednego predykatu, sprawdzane w komplecie **16 stanów**. ⚠ **Granica dowodu:** keeper nie
przechodzi pętli rysującej gwiazdy, więc **pierścień, jasność i ikony infrastruktury pinowane są tylko
pośrednio** (czytają pola tego samego rekordu) — te trzy potwierdza dopiero live-gate.
Sweep **190/190 0 FAIL** · `check-i18n` PASS.
⚠ **T7 pinuje REGRESJĘ PO STRONIE GRACZA**: układ skolonizowany przez gracza nie ma `empireId`,
więc bez gałęzi `!hasOwner` w `population` gracz straciłby widok populacji WŁASNEJ kolonii poza domem.

**Przyrządy (dodane przy przygotowaniu gate'u):** `KOSMOS.debug.setIntel(empireId, level)` — NOWY;
`advanceIntel` jest **jednokierunkowe** (zmierzone), więc bez tego nie da się zejść z `contact` do
`rumor`. Kasuje rekord surowo do `unknown` i podnosi PRODUKCYJNĄ ścieżką ⇒ stan bit w bit taki, jaki
gra produkuje sama. 🔴 **Finding 194 (ZAMKNIĘTY tu):** `KOSMOS.debug.dumpIntel()` nie raportował
**żadnego** imperium — wołał `reg.getAll` (jest `listAll`) i `intel.getEmpireContact` (jest
`getLevel`), więc pętla nie wykonywała ani jednego obrotu. **Czwarty przypadek klasy 87/193.**
Bez tej naprawy gate mierzyłby ciszę.

⚠ **Drabina wywiadu — komplet producentów** (`STRATCOM_REVEAL_PLAN.md` §11): `rumor` ← przelot sondy
pierwszego kontaktu · **wykrycie DOWOLNEGO statku obcych przez obserwatorium** (`ObservatorySystem:648`
— najczęstszy w praktyce) · odkrycie ciała w ich układzie. `contact` ← **przylot statku**
(`vessel:arrived`). `detailed` ← survey jednostki naziemnej. ⚠ Intel STATKU (`intel.vessels`) to
OSOBNA domena — proximity/sensor-lock ruszają tylko ją i **nie podnoszą poziomu imperium**.
⚠ `_onVesselArrived` nie filtruje właściciela statku; chroni go tylko `mission == null` u emitentów
AI — osiągalność NIEZMIERZONA, zapisane jako obserwacja.

**🔴 Finding 193 (OTWARTY, wypłynął przy okazji):** `IntelSystem._passiveTick` (⚠ korekta 2026-09-17: wcześniej pisano `_tickPassiveListening` — takiej metody NIE MA; `:288`, wołana z `:82`) jest **MARTWY
od napisania** — iteruje `emp.colonies` (tablica **stringów**) i czyta `col.systemId` ⇒ `undefined`
⇒ `inRange` zawsze `false` ⇒ mechanika „8 lat w promieniu 10 ly → `rumor`" **nie odpaliła ani razu**.
Trzecia gałąź klasy **Findingu 87**, przy poprawnym wzorze dwa miejsca dalej w tym samym pliku.
⚠ **Kolejność wiążąca:** ożywić dopiero PO 188 (wcześniej zamieniłoby wyciek punktowy w automatyczny),
i to **zmiana tempa gry wywiadu z własnym pomiarem**, nie higiena.


<!-- CLAUDE.md L4249–5240 -->
## Finding 147 — statek w SKOKU nie przyjmuje rozkazu ruchu (save **v101 bez migracji**, live-gate PASS — ZAMKNIĘTY 2026-09-09, commit `1cb4a97`)

Slice samodzielny, **poza** arciem VESSEL_ORDERS (P0-P5 zostaje osobnym planem). Plan + decyzje
D-147a…D-147e + rejestr: `docs/design/VESSEL_ORDERS_PLAN.md` §147 (zamknięty) + nowe **263-266**.

**Jedno zdanie:** `MovementOrderSystem` nie miał **żadnej** bramki na tranzyt międzygwiezdny
(rejestr: „grep = 0"), więc „Leć tutaj" wydane statkowi W SKOKU przechodziło `{ok:true}`,
podmieniało misję `interstellar_jump` na `move_to_point` i — przez `_reconcileSystemId` biegnące
CO TIK — stemplowało statek `sys_home` przy współrzędnych układu, z którego wystartował. **MIS-HOMED
DUCH**, czyli klasa likwidowana przez Slice A (`f072da0`), wpuszczona z powrotem niebramkowaną
gałęzią typu. **Jeden PPM od gracza; stempel szedł DO ZAPISU** (`VesselManager:1438`), a
`_migrateV91toV92` go nie leczy (leczy tylko `phase === 'warp_transit'`).

⚠ **WARP CORES SĄ FORFEITED, nie „wydane przez ten rozkaz".** `moveToPoint` nie tyka `warpFuel`
w ogóle (zmierzone 0,5 → 0,5); rdzenie pobiera **z góry** `dispatchInterstellar`
(`VesselManager:895`, `consumeWarpFuel`) i **nie ma ścieżki zwrotu** ⇒ traci się zapłacony SKOK.
Osobno spalane jest paliwo in-system (9999 → 9996,85 przy koszcie kursu 2,150).

**Shape A (D-147a) — JEDEN termin admisyjny, 6 linii kodu gry.** W `issueOrder`, **NAD**
`isRetreat` i **POZA** `_dispatchByType`. Predykat: `mission.type === 'interstellar_jump' &&
mission.phase === 'warp_transit'` (źródło prawdy `VesselManager._resolveSystemId`;
`systemId === null` to inwariant POTWIERDZAJĄCY, sprawdzany keeperem, **nie** część bramki).
Kill-switch `FEATURES.warpTransitOrderGate` (default ON, **brak klucza = OFF**).

⚠ **DLACZEGO JEDNA LINIA OBEJMUJE WSZYSTKIE DZIESIĘĆ TYPÓW** (krok obowiązkowy podpisu, grep
PRZED kodem): `_dispatchByType` ma **dokładnie jednego wołającego** (`issueOrder:263`);
`_issueMoveToPoint` ma **pięć** call-site'ów, wszystkie w MOS i wszystkie pod `_dispatchByType`
(zero zewnętrznych); `mission.type='move_to_point'` konstruowany jest w **jednym** miejscu
(`MOS:918`). Do tego **`patrol` buduje WŁASNY order i nie przechodzi przez `_issueMoveToPoint`**,
więc bramka postawiona niżej byłaby nieutwardzonym bliźniakiem. Ścieżka flotowa
(`RightClickMenu:247 → FleetSystem:201`) też schodzi do `issueOrder` **per statek**.

⚠ **NIE `isSameSystem`** — dla `systemId === null` jest **fail-OPEN** (ZMIERZONE: `true`), więc
przepuściłaby dokładnie ten przypadek. **NIE `isSameSystemStrict`** — zabroniona dla bramek
rozkazów własnym docblockiem. ⚠ **Zasięg AI: ZERO** — obie pule AI pomijają statek z misją
(`DirectorOffensive:144`, `DirectorDoctrine:269`), a statek w skoku zawsze ma `interstellar_jump`.

**Widoczność odmowy:** `vessel_in_warp_transit` + **jedna** para i18n
`vessel.reasonVesselInWarpTransit`; BEZ reużycia `reasonTargetOtherSystem` (byłoby kłamstwem dla
statku, który właśnie skacze — klasa Findingu 141). Dziennik, kanał **`fleet`**, severity **`warn`**
(`RightClickMenu:337-346`), PL „Statek jest w skoku międzygwiezdnym — poczekaj na przylot" /
EN „Vessel is in interstellar transit — wait for arrival". ⚠ Menu **nadal oferuje** „Leć tutaj"
statkowi w skoku i tak ma być: to bramka **ADMISJI**, nie filtr OFERTY (pin T7a).

**Dźwignia:** `KOSMOS.gameConfig.FEATURES.warpTransitOrderGate = false` — flaga czytana przy
KAŻDYM wywołaniu, więc flip działa **na żywo, bez przeładowania** (`window.KOSMOS.gameConfig`
ustawia `GameScene:394`; ten sam uchwyt opisuje `FactorySystem:25`).
⚠ **Recepta konsolowa, ZMIERZONA (poprawka po gate'cie):** `OrderService.issueMove` to **cienki
forward** do `MOS.issueOrder`, więc `spec.type` jest **OBOWIĄZKOWY**, a pole nazywa się
**`targetPoint`**, nie `point`. `issueMove(id, {targetBodyId, point})` zwraca
`{ok:false, reason:'invalid_type'}` (`validateOrder`, `MovementOrderTypes:70-73`) — i **bez `type`
cel-CIAŁO cross-system nie trafi też do composite'u** (`issueMove:107` testuje
`spec?.type === 'moveToPoint'`). Poprawnie:
`KOSMOS.orderService.issueMove(vId, { type: 'moveToPoint', targetBodyId: 'h2', targetPoint: {x, y} })`.

### ⚠ Dwa keepery przepisane ŚWIADOMIE — ich PRZESŁANKA była tym findingiem

`preempt_order_smoke` **T6** zakładał, że rozkaz ZOSTAJE PRZYJĘTY, a misji broni gałąź `inWarp`
w `_preemptCommit`; dziś broni jej ADMISJA ⇒ pin czyta POWÓD odmowy. **Bez tego był jałowy
i PRZECHODZIŁ, czyli sweep by go NIE zgłosił** — to jest cała lekcja. **T11** zakładał, że
`moveToPoint` ZABIJA misję warp i osierocą trasę; dziś nie zabija, więc inwariant D-VO3e pinowany
jest na wejściu, które NADAL istnieje i które sam D-VO3e wymienia (statek **spoza** warpu z żywą
trasą wielo-przeskokową). ⚠ **Konsekwencja strukturalna → Finding 265:** gałąź
`inWarp`/`warpMissionSurvived` w `_preemptCommit` jest od teraz **nieosiągalna**; kod ZOSTAJE,
ale żaden pin jej nie dotyka.
⚠ `return_actions_removed_smoke` A6 — okno źródła **anchorowane strukturalnie** zamiast
`iStart + 3000`. Kontrola pinu PADŁA, gdy termin 147 wypchnął `vessel_in_reserve` za 3000 znaków,
czyli zrobiła dokładnie to, do czego jest. **Ta sama lekcja co `fleet_clock_band` T4: proxy
rozmiarowe → inwariant strukturalny.**

### Live-gate 2026-09-09 (właściciel, klient EN) — PASS

§0 flaga=true · §1 odmowa czysta, snapshot PRZED/PO **bit w bit** (fuel 20.00 → 20.00, `warpFuel`
nietknięty, misja do `sys_020` żywa, `mo:null`) · §2 przylot zahomowany w **`sys_020`**, nie
`sys_home` · §3 anty-jałowość (goły punkt in-system leci) · §5 rollback w obie strony, na żywo:
OFF ⇒ `{ok:true}` + zabita misja + stempel `sys_home` (**forfeiture potwierdzone**), ON ⇒ odmowa.

⚠ **§4 (composite) — ODSTĘPSTWO STRUKTURALNE: NIE zweryfikowane na żywo w TYM gate'cie.** Po
Findingu 138 klik PPM w obce ciało **nie może** dać celu-CIAŁA (snap zakresowany układem STATKU),
więc z mapy wychodzi **goły punkt** — czyli ścieżka Findingu 255. **Mapa nie umie uruchomić
composite'u w ogóle.** Composite stoi na **T9a-c (headless)** + własnym live-gate slice'u **254**.

**Testy:** NEW `warp_transit_order_gate_smoke` **49/49**, fail-first **27/21** zmierzony FINALNYMI
pinami na kodzie sprzed naprawy (detached worktree) · `preempt_order_smoke` **38/38** (fail-first
36/2) · `return_actions_removed_smoke` **16/16**. Sweep **220/220 0 FAIL** · `check-i18n` PASS
(pl=en=3343). Zapis **v101, bez migracji**.

**Nowe findingi z tego slice'u (`VESSEL_ORDERS_PLAN.md`):** **263** (`_maybeAutoDockOnReturn`
teleportuje bezwarunkowo; `RETURN_DOCK_THRESHOLD_AU` zadeklarowany w `FleetSystem:30` i **bez
ani jednego odczytu** — komentarz obiecuje próg, którego nie ma) · **264** (`_issueEscort` bez
terminu układu na eskortowanym; osiągalność NIEZMIERZONA i to część wpisu) · **265** (martwa gałąź
`inWarp`) · **266** (🟠 **„Docked" jest DOMYŚLNĄ etykietą w DWÓCH miejscach** — `?? 'docked'`
w `FleetGroupPanelLogic:83` i `?? 'fleetGroup.statusDocked'` w `FleetGroupPanel:345` /
`FleetCommandPanel:297`; ZMIERZONE wykonaniem: stan `undefined`, stan nieznany i brak całego
`position` renderują się jako „zadokowany", a `dockedAt` **nie jest w tej ścieżce czytany ani
razu**). **Korekty rejestru:** 154 i 255 mówiły „TRZY producenty Powrotu" — jest **DWÓCH**
(`grpReturn` zdjęty w 258/A1, `e591172`); 255 dostał **potwierdzenie NA ŻYWO** (`mo_6`,
`targetPoint {15.71,-158.94}`, statek w `sys_020` poleciał do współrzędnych z ramki `sys_home`).

**NASTĘPNE (kolejka właściciela):** **255 + 154** jako jeden slice producent-side (Shape C —
producenci przestają podawać goły punkt; **263** jest naturalnym partnerem, te same dwa call-site'y
stawiają `_pendingReturnDock`) → **256** (jednoargumentowa poprawka UX, szew `sameSystemOnly`
gotowy) → **266** → reszta rejestru (151/152/153, 264).

---

## Findingi 154 + 263 — „Powrót do bazy" celuje w UKŁAD STATKU, a marker doku nie przeżywa rozkazu (save **v101 bez migracji**, live-gate PASS 6/6 — ZAMKNIĘTE 2026-09-09, commit `9e1e7d8`)

Slice **producent-side**, kontynuacja arca zaczętego Findingiem 147. Plan + decyzje D-255a…f +
rejestr: `docs/design/VESSEL_ORDERS_PLAN.md` §154 (zamknięty), §263 (zamknięty), §255 (leg Powrotu
zamknięty, leg mapy OTWARTY), §256 (korekta „jednego argumentu").

**Jedno zdanie:** trzy defekty jednej rodziny, każdy w innej warstwie — zły SELEKTOR (154), droga,
którą jego wynik przechodził przez system rozkazów (255, leg Powrotu) i KONSUMENT, który
teleportował po markerze bez terminu układu (263).

**154 — SELEKTOR.** `AutoRetreatSystem._findNearestFriendlyPlanet` filtrowała po WŁAŚCICIELU
i liczyła `euclideanAU` po WSZYSTKICH koloniach w galaktyce. Gwiazda każdego układu stoi w (0,0),
więc kolonia z obcego układu **wygrywała RANKING** — ZMIERZONE: statek w `sys_020` dostawał
`p_home` [sys_home] jako **„2.00 AU"**, przy własnej koloni **6.00 AU** dalej w JEGO układzie.
Obie żywe ścieżki przeszły na `nearestOwnColonyBodyInSystem` (`utils/RetreatTarget.js`, D-FDh);
sierota USUNIĘTA (~35 linii) wraz z jej jedynymi konsumentami importów (`EntityManager`,
`DistanceUtils`). ⚠ **Lekarstwo jest DROP-INEM — zweryfikowane, nie założone:** identyczna
zwrotka, ten sam filtr własności, **zachowany fallback placówkowy**, warp ⇒ `null`.
⚠ **KOREKTA REJESTRU:** mówił „TRZY produkcyjne ścieżki" — są **DWIE** (`grpReturn` zdjęty
w 258/A1, `e591172`), a `_findNearestFriendlyPlanetForDrift` była już naprawiona (D-FDh).
⚠ **`FleetCommandPanel` zweryfikowany PO RAZ PIERWSZY** — bez pomiaru i bez pinu, defektywny
znak-w-znak jak FMO.

**263 — KONSUMENT.** `FleetSystem._maybeAutoDockOnReturn` TELEPORTUJE bezwarunkowo (przepisuje
`position.x/y`, `dockedAt` **i `colonyId`** — całą bazę statku). Dostał **TERMIN UKŁADU**
(`isSameSystem`, fail-OPEN: encja bez stempla = stary zapis, dokuje jak dotąd).

⚠ **TERMINU ODLEGŁOŚCI NIE MA I MIEĆ NIE BĘDZIE — to nie zaniedbanie, to cofnięta pułapka.**
`RETURN_DOCK_THRESHOLD_AU = 0.5` stała zadeklarowana **bez ANI JEDNEGO ODCZYTU** od `7ea94e8`
(2026-05-20), bo usunięto ją tam ŚWIADOMIE jako naprawę **Bug F2** („dotarli ale dalej nie
dokuja"), z podpisem „snap to teleport — akceptowalny convenience UX w 4X". Ożywienie stałej
**cofałoby zamkniętą naprawę**. Pomiar to potwierdza, i to WEWNĄTRZ jednego układu (czyli już po
154): statyczny `targetPoint` z chwili wydania rozkazu nie zna ruchu planety, więc po locie
planeta jest **3,15-7,62 AU** od tego punktu ⇒ próg 0,5 AU **padałby ZAWSZE**. Stała skasowana,
dwa kłamiące komentarze poprawione (`FMO` „Centroid floty" — kod nigdy nie liczył centroidu —
oraz obietnica progu), a pin **T6 z kontrolą na zmutowanej kopii** pilnuje, żeby nikt tego nie
„naprawił" przez powrót progu.

**SPRZĄTANIE MARKERÓW (D-255b) — kształt WYMUSZONY POMIAREM, nie wybrany.** Sam swap selektora
NIE wystarczył: marker **przeżywa porzucenie rozkazu**. ZMIERZONE w JEDNYM układzie i **BEZ
kliknięcia „Stop"**: Powrót → nowy rozkaz na 12,00 AU → statek kończy na **1,00 AU zadokowany
przy bazie**; rozkaz gracza po cichu przekierowany. `_pendingDock` zachowuje się identycznie.
Trzy części naprawy:
- producenci stawiają marker **PO** `issueFleetOrder` i **tylko dla `res.accepted`** — to zabiło
  DRUGIE, utajone źródło: statek z ODRZUCONYM rozkazem zostawał z markerem;
- `issueOrder` sprząta markery na **WEJŚCIU** (przed `_preemptSnapshot`);
- `_releaseOrder` sprząta na **każdym przejściu terminalnym poza `completed`** — cztery z pięciu
  ścieżek, wliczając unieważnienie **PRZY WCZYTANIU** (`MOS:136`), czyli dokładnie „lepki marker
  prosto do nowej sesji", przed którym ostrzega komentarz tamtej gałęzi.

⚠ **Sprzątanie w `_preemptCommit` SPRAWDZONE I ODRZUCONE** — wycierałoby marker rozkazu, który sam
właśnie instalujemy (producent stawia go PRZED `issueOrder`, więc `_preemptSnapshot` widzi już
NOWY, a porównanie snapshotu też nie rozróżnia). Złapane **przed uruchomieniem czegokolwiek**;
dlatego markery stawiane są po sukcesie, a sprzątanie stoi na wejściu.

⚠ **INSTRUMENT WYMIENIONY w `retreat_target_smoke` T1.** Jego KONTROLA PINU dowodziła, że fixture
reprodukuje F-D, **wołając funkcję, którą ten slice usunął** — sweep padł crashem. Intencja
zostaje, wyrażona wprost: obce ciało JEST bliżej w px niż własne (to jedyne, czego tamto wywołanie
dowodziło). Nagłówek pliku, opisujący usuniętą funkcję w czasie teraźniejszym, poprawiony.
**Pin NIE został skasowany, żeby zazielenić sweep.**

**Leg C (256) — WYPADŁ Z ZAKRESU PO POMIARZE, nie z wygody.** „Przełączenie jednego argumentu"
jest nieprawdą: `sameSystemOnly:true` **bez `vessel` jest NO-OPEM** (`filterDockTargets` ma guard
`if (!vessel) return list`), a obie stare powierzchnie `vessel` nie podają ⇒ dwa argumenty na
site. Do tego picker jest GRUPOWY, a `vessel` jeden — ZMIERZONE: reprezentant `Alfa` daje ofertę
`[p_home,h2]`, `Beta` daje `[f_far]`, więc **każdy wybór zostawia część statków z celem w obcej
ramce**, a `_issueDock` tego nie broni. To **decyzja właściciela** (reprezentant / przecięcie /
admisja per statek), nie argument — zapisana w 256. ✅ Komunikat pustego pickera jest darmowy:
`bodyPicker.empty` istnieje PL+EN.

**Live-gate 2026-09-09 (właściciel, klient EN) — PASS 6/6.** §0 **pre-skan kampanii na chimery
(`dockedAt` w innym układzie niż statek) zwrócił PUSTĄ listę** ⇒ pytanie „czy leczyć stare zapisy"
rozstrzygnięte POMIAREM: **zero pacjentów**, przebieg leczący zbędny (same markery są i tak
runtime-only — nie ma ich w `VesselManager.serialize`) · §1 odmowa cross-system: jeden toast
`fleet.noFriendlyPlanet` (EN „No friendly planet in range"), zero rozkazu, zero markera · §2 Powrót
in-system na OBU powierzchniach, `dockSys === systemId`, `colonyId` re-homowany · §3 stary marker
w OBU wariantach (ze „Stop" i bez) — statek słucha NOWEGO rozkazu · §4 dock picker in-system
dokuje; oferty cross-system na dwóch starych powierzchniach **nadal są** (leg C dropped, zapisane)
· §5 nie-regresja 147 + 254.

**Testy:** NEW `return_dock_family_smoke` **41/41**, fail-first **24/17** zmierzony FINALNYMI
pinami na kodzie sprzed naprawy (detached worktree) · `retreat_target_smoke` **44/44** ·
sweep **221/221 0 FAIL** · `check-i18n` PASS (pl=en=3343, **zero nowych kluczy i18n**).
⚠ **Brak kill-switcha w tym slice'ie** (żadna z decyzji D-255a…f go nie przewidywała) —
rollback = `git revert`.

**NASTĘPNE:** ✅ **leg D ZROBIONY** — sekcja niżej.

---

## Finding 255 — LEG D: klik na mapie nie wysyła statku spoza ramki kamery (save **v101 bez migracji**, live-gate PASS — noga MAPY ZAMKNIĘTA 2026-09-09, commity `92e075f` + docs)

Trzecia i ostatnia noga arca zaczętego Findingiem 147. Plan/decyzje **D-LD1..D-LD5** + rejestr:
`docs/design/VESSEL_ORDERS_PLAN.md` §255 (noga MAPY zamknięta, wiersze 8/9 OTWARTE) + §267 NOWY.

**Jedno zdanie:** współrzędne są LOKALNE dla układu (gwiazda każdego układu stoi w (0,0)), więc
goły punkt **nie niesie ramki** — a `switchActiveSystem:152` **nie czyści zaznaczenia**, więc
statek z innego układu zostawał zaznaczony i dostawał kliknięte współrzędne odmierzone od SWOJEJ
gwiazdy. Repro właściciela (`mo_6`) odtworzone przez PRAWDZIWY łańcuch PPM: misja `move_to_point`
do (15.71, −158.94) **w `sys_020`**, paliwo 9999 → 9997.735, **0 wpisów w Dzienniku**. Cicho.

**Kształt — termin U WOŁAJĄCEGO, nie w budowniczych spec (D-LD1).** `OrderDispatcher.js` jest
CZYSTY (zero importów, dostaje `vesselId` jako **STRING**, nie obiekt) i **pozostaje nietknięty**;
`_buildFleetSpec(option, target)` nie dostaje **ani statku, ani `fleetId`**. Dwa site'y, jeden plik
(`RightClickMenu`): pętla per-statek (odmowa → istniejący `fails[]` ⇒ raport nazywający każdy
pominięty statek **za darmo**) + gałąź flotowa (**D-LD2**: odmowa CAŁOFLOTOWA, gdy choćby jeden
członek jest poza ramką, z nazwaniem każdego winowajcy — kanał `res.rejected[0]` pokazuje tylko
pierwszy). Zero nowych pól w `spec`, zero zmian w MOS, **zero nowych kluczy i18n** (reuse
`vessel.reasonTargetOtherSystem`, D-LD3), brak flagi (rollback = revert).

⚠ **ZAKRES TYPÓW ZMIERZONY, NIE ZAŁOŻONY** — `POINT_SOURCED_ORDER_TYPES` = `moveToPoint` + `dock`.
Bramka na CAŁEJ pętli byłaby fałszywym negatywem **tej samej klasy co regresja fan-outu**:
`retreat` liczy cel w układzie STATKU (ZMIERZONE: statek w `sys_020` przy kamerze `sys_home`
dostaje poprawny `targetPoint {286,0}` = `f_a` w SWOIM układzie), `escort` to Finding 264,
`goToPOI`/`patrol` chodzą po `poiId` (POI bez `systemId` — Finding 152). `dock` JEST w zbiorze
(D-LD4), bo `_issueDock` **zrzuca `targetBodyId`** przed `_issueMoveToPoint`.

⚠ **DLACZEGO NIE W `FleetSystem.issueFleetOrder`** — w jedynym miejscu pokrywającym naraz PPM floty
I oba pickery: ta funkcja obsługuje TAKŻE „Powrót do bazy", którego cel liczy się w układzie STATKU
(naprawa 154), więc termin „ramka statku ≠ kamera" odrzuciłby tam rozkaz CAŁKOWICIE POPRAWNY
(ZMIERZONE: flota `sys_020`, kamera `sys_home` → `{ok:true, accepted:2}`). **Predykat nie jest
własnością ROZKAZU — jest własnością pary (statek, kamera).** Pinuje to **T4**, najważniejszy pin
slice'u (mierzy PRAWDZIWE `issueFleetOrder`).

⚠ **ODMOWA JEST STRICTE NO-OPEM** (zmierzone): brak rozkazu/misji, stan i paliwo nietknięte,
**istniejący rozkaz statku przeżywa** (`mo_1` przed i po, `status active`), a `fleet.activeOrder`
i rozkazy członków też — bo wracamy **PRZED** `issueFleetOrder:118`, które kasuje poprzedni rozkaz
floty. Odrzucony klik nie może zepsuć bieżących rozkazów.

**Live-gate 2026-09-09 (właściciel, klient EN) — PASS.** §1 single · §2 anty-jałowość · §4 flota ·
§5 flota mieszana · §6 dock z mapy.
⚠ **KOREKTA 2026-09-10 — §7 i §8 NIE BYŁY URUCHOMIONE NA ŻYWO.** Wpis powstał **warunkowo, przed
przebiegiem** i przez jeden dzień stał jako „PASS … na żywo". Oba są pokryte **headless i tylko
headless**: **§7** (Powrót floty spoza ramki = kontrola wycieku do fan-outu) — keeper
`map_click_frame_smoke` **T4** na PRAWDZIWYM `issueFleetOrder`, z kontrolą nie-jałowości **T4a**
(cel MUSI pochodzić z układu STATKU, inaczej pin mierzyłby T7); **§8** (nie-regresja 147) — **T5/T5b/T5c**
(statek w skoku dostaje DOKŁADNIE `vessel_in_warp_transit`, kolejność zmierzona). **Nie nazywać tych
dwóch zweryfikowanymi na żywo.** ⚠ Reguła: sekcja gate'u wpisana przed przebiegiem jest **hipotezą**,
nie wynikiem — nieuruchomiona ma zostać nazwana, nie odziedziczyć „PASS" po sąsiadach.
**Dwie dewiacje zapisane, nie wygładzone:**
- 🔴 **§5 wszedł najpierw INNYM KANAŁEM i dał PIERWSZE POTWIERDZENIE NA ŻYWO dla wierszy 8/9**:
  picker floty w panelu (`FleetCommandPanel:354` = wiersz 9, znany-otwarty) wysłał OBA statki,
  ten spoza ramki poleciał do klikniętych współrzędnych we WŁASNYM układzie, **zero wpisów
  w Dzienniku**. Powtórka przez PPM mapy zachowała się dokładnie wg D-LD2. To **dowód osiągalności**
  wierszy 8/9 w normalnej grze, nie porażka legu D.
- ⚠ **§3 (mieszany multi-select) NIE JEST wykonalny Z MAPY — i to jest ZAMIERZONE.** Pomiar:
  **nie ma mechanizmu czyszczącego** `_selectedVesselIds` (`addToSelection`/`toggleSelection` bez
  terminu układu; `removeFromSelection` ma dwóch wołających — wraki i ✕ w `FleetGroupPanel`;
  `system:switched` selekcji nie rusza). Prawdziwy mechanizm jest strukturalny:
  `ThreeRenderer._syncVesselPositions:4883` **usuwa sprite** statku spoza aktywnego układu,
  a `_getVesselAtScreen` iteruje dokładnie ten rejestr ⇒ **na mapie nie ma czego kliknąć**.
  Usunięcie jest ŚWIADOME (`2f76605`, „Fix vessel sprites showing from other star systems").
  ⇒ **NIE zakładam findingu.** Stan T2 jest osiągalny **innymi powierzchniami**: Outliner
  CTRL+klik (`Outliner:665`) i TacticalDock CTRL+klik (`TacticalDock:639`) — obie listują statki
  wszystkich układów i wołają `toggleSelection` bez filtra.

⚠ **DWIE LEKCJE Z PISANIA KEEPERA (wychodzą poza slice):** (1) **pin białoskrzynkowy na metodzie,
której przed naprawą NIE MA, WYWALA przebieg fail-first i ukrywa kolor wszystkich pinów niżej** —
zmierzone dwukrotnie (`TypeError` na T5, potem na T7; T5b-T10 bez koloru). Taki pin musi
**degradować, nie przerywać**. (2) **Jałowa zieleń:** „tekst bez surowego sluga" przechodziło przed
naprawą, bo **tekstu nie było** — wymóg `txt.length > 0` jest częścią pinu (licznik 20/20 → 18/22).

⚠ **DOCK Z MAPY = POKRYCIE INCYDENTALNE, BEZ CICHEGO KREDYTU:** leg D zamyka producenta PPM mapy,
ale **obie połowy Findingu 256 (ofertowa `getDockTargets` i admisyjna `_issueDock`) ZOSTAJĄ
OTWARTE**, razem z regułą grupową (a/b/c) czekającą na podpis. Pinuje to **T4b**.

**NOWY FINDING 267** (`patrolManual`) — trzeci producent punktu z ramki kamery w tym samym pliku,
poza `buildOrderSpec`; ZMIERZONE `{ok:true, orderId:'mo_3'}`. Otwarty, pinowany **odwróconym**
T9b; naprawa wymaga podpisu **co do MOMENTU odmowy** (przed pickerem vs po zebraniu waypointów).

**Testy:** NEW `map_click_frame_smoke` **40/40**, fail-first **18 PASS / 22 FAIL** zmierzony
FINALNYMI pinami na pristine HEAD (`git archive` — bez dotykania drzewa roboczego i bez mutacji
`.git`). ⚠ **T9a/T9b to piny ODWRÓCONE** — pinują DEFEKT (wiersze 8/9 oraz 267) i **mają paść**,
gdy te zostaną domknięte. Sweep **222/222 0 FAIL** · `check-i18n` PASS.
⚠ **KOREKTA 2026-09-10 (D-89d): „T9a ma paść" było NIEPRAWDĄ i zostało ZMIERZONE** — patrz
sekcja niżej. T9b (267) zostaje odwrócony, T9a przecelowany na prawdziwego producenta.

---

## Finding 255 — WIERSZE 8/9: pickery flotowe (save **v101 bez migracji**, live-gate PASS 7/7 — **CAŁA TABELA NÓG 255 ZAMKNIĘTA** 2026-09-10)

Domknięcie rodziny 255 zaczętej Findingiem 147 (leg D zamknął PPM mapy, ten slice — dwa pickery
flotowe). Decyzje **D-89a..D-89d**. Rejestr: `docs/design/VESSEL_ORDERS_PLAN.md` §255 (tabela nóg
+ blok „WIERSZE 8/9 ZAMKNIĘTE") + nowe **268/269**.

**Jedno zdanie:** dwa pickery budują spec **własnym literałem w callbacku**, z pominięciem
`_buildFleetSpec`, więc leg D ich nie widział — `FleetManagerOverlay._handleFleetMoveToPoint:4732`
(`intent:'fleet_move'`) i `FleetCommandPanel._armMovePicker:348` (`intent:'fleetcmd_move'`).

🔴 **UI NIE MILCZAŁO — UI KŁAMAŁO.** `_announceFleetOrderResult:4855` / `FCP._announce:337`
emitują wyłącznie `ui:toast` z licznikami: przy rozkazie wysłanym w cudzą ramkę gracz dostawał
**„Flota: 2/2 statków wykonuje rozkaz"**. ⚠ Ten sam helper ma `if (!res) return`, więc przy
odmowie **nie powie NIC** — głośność musi być w producencie jawna (pinuje F3 + „zero toastów
sukcesu"). Kanałem jest Dziennik (`fleet`/`warn`), identycznie jak w legu D.

**D-89a — termin przy FINALIZACJI, w OBU callbackach.** ⚠ ARM-time jest **NIEPEŁNE, i to pomiar**:
nic nie kasuje pickera na `system:switched` (`GameScene:3435` przełącza kolonię, `FMO:505` resetuje
pan/zoom) ⇒ gracz uzbraja przy kamerze ZGODNEJ z flotą, przełącza układ i klika. ZMIERZONE:
picker „NADAL UZBROJONY", oba statki z `sys_020` dostają współrzędne `sys_home`. ARM-time dawałby
fałszywy pozytyw **i** fałszywy negatyw (odmowa graczowi, który chciał najpierw przełączyć układ).
Nie doszedł nawet jako ostrzeżenie: jedyny reużywalny tekst mówi o CELU, którego przy uzbrajaniu
jeszcze nie ma ⇒ byłby to nowy klucz i18n, czyli nie „trywialnie".

**D-89b — jedno źródło predykatu: NEW `src/utils/CameraFrame.js`** (`outOfCameraFrame` /
`fleetOffendersOutOfFrame` / `describeOrderFail`), trzech konsumentów, zero bliźniaków
(`RightClickMenu` traci trzy prywatne metody + osierocony `_pascalCase`). ⚠ Pierwszy moduł
w `src/utils/` importujący `t()` — powód nazwany w nagłówku; „pure" znaczy tu tyle co w kanonie
(`RetreatTarget.js` importuje pięć modułów, `StationGroup.js` dwa).

**D-89c — REGUŁA, obowiązuje poza slice'em: termin ramki kamery liczy się przy FINALIZACJI,
NIGDY przy ARM.** Dziedziczy ją **267**; otwarta zostaje tam wyłącznie mitygacja UX (odmowa przy
pierwszym waypoincie vs po ENTER). `patrol` **nie wchodzi** do `POINT_SOURCED_ORDER_TYPES` (152/T8e).

⚠ **FINALIZATOR MA JEDNĄ ŻYWĄ POWIERZCHNIĘ — ZMIERZONE.** `_finalizeTargetPointPicker` woła
`GameScene:5934` (klik 3D) i `GameScene:5201` (`ui:targetPointPickerFinalize`); to zdarzenie ma
jednego producenta — `FMO:1653`, mapa 2D bramkowana `_mapBounds`, którą pisze wyłącznie
`_drawCenter:4946`, nieosiągalne przy `commandTacticalMap:false` ⇒ **martwe**. Callbacki trybu
`targetPoint`: `fleet_move`, `fleetcmd_move`, `fleetcmd_engage`, `create_poi`, debug.
**267 NIE dzieli tego finalizatora** (`patrolWaypoints` → ENTER → `finalizePickerMode`).

⚠ **D-89d — „T9a padnie, gdy 8/9 zostaną domknięte" BYŁO NIEPRAWDĄ, ZMIERZONE.** T9a wołało
`issueFleetOrder` WPROST — seam, który MUSI zostać przepuszczalny (tędy idzie „Powrót do bazy"
z celem w ramce STATKU, T4/F6). Ta funkcja dostaje GOŁE LICZBY: `{x:220,y:0}` i
`{x:15.71,y:−158.94}` są dla niej nie do odróżnienia. Sonda na symulowanej naprawie: producent
odmawia, a stara asercja dalej zwraca `{ok:true, accepted:2}`. ⇒ T9a **przecelowany na prawdziwego
producenta** (execution pin), stara asercja została jako **T9a-ctl** (kontrola przepuszczalności
fan-outu, siostra T4). ⚠ Przy okazji: **T5a przechodziło JAŁOWO** po ekstrakcji (degradowało do
`null`, a `null` jest tym, czego asertuje) — T5a/T7b/T8d przecelowane na żywą ścieżkę.

**Testy:** NEW `fleet_move_picker_frame_smoke` **42/42**, fail-first **28 PASS / 14 FAIL**;
`map_click_frame_smoke` **41/41**, fail-first **40/1** (pada dokładnie przecelowany T9a) — oba
zmierzone FINALNYMI pinami na `git archive HEAD`. Sweep **223/223 0 FAIL** · `check-i18n` PASS ·
**zero nowych kluczy i18n** · bez flagi (rollback = revert, wzór rodziny 147/154/255).
⚠ Import `CameraFrame.js` w keeperze legu D jest **dynamiczny w try/catch**: statyczny wywaliłby
CAŁĄ suitę na kodzie sprzed naprawy i żaden pin nie miałby koloru — lekcja „pin musi degradować,
nie przerywać", tylko na poziomie MODUŁU.

✅ **LIVE-GATE 2026-09-10 — PASS 7/7** (właściciel, klient EN, `fleet_1` = `v_13` + `v_18`): §1 wiersz 8
(🎯 Move, overlay zamknięty ✕) · §2 wiersz 9 (`bgMove`) — oba: odmowa, wpis `warn` z OBIEMA nazwami,
**bez toasta**, `activeOrder:null` · §3 flota mieszana (nazwany tylko winowajca, nikt nie ruszył) ·
**§4 🔑 uzbrojenie przy zgodnej kamerze → przełączenie układu W TRAKCIE celowania → klik = ODMOWA**
(reguła D-89c zademonstrowana NA ŻYWO, nie tylko keeperem) · §5 kontrola (rozkaz wydany, toast
`Fleet: 2/2 vessels executing`, zero wpisów) · §6 Powrót floty spoza ramki na OBU powierzchniach
(przepuszczalny seam F6/T4 na żywo) · §7 leg D bez zmian.
⚠ **Dwie notatki z przepisu gate’u:** czytnikiem flot jest **`listFleets()`** (⚠ korekta z gate'u 268: `getAllFleets()` **nie istnieje** w `FleetSystem` — grep `src/` = 0; `_fleets` to prywatna `Map`),
a wiersz 8 wymaga zamknięcia overlaya **✕, nie Esc** (Esc kasuje NAJPIERW picker; `FMO.close()` pickera
nie rusza).

⚠ **Ostrzeżenie ARM-time NIE weszło — powód i18n, nie lenistwo:** jedyny reużywalny tekst mówi o CELU,
którego przy uzbrajaniu jeszcze nie ma ⇒ uczciwe ostrzeżenie = NOWY klucz PL+EN, czyli poza
„trywialne" i poza „zero nowych kluczy".

⚠ **`git archive` NIE JEST wiernym drzewem tego repo** (`core.autocrlf=true`, brak `.gitattributes`
⇒ checkout daje CRLF, a stare pliki w drzewie właściciela mają LF). Wyszło przy weryfikacji commitów:
**Finding 270** — pin `warp_transit_order_gate` T11c pada w KAŻDYM świeżym checkoucie (także na
`beaad55`, czyli PRE-EXISTING). Keepery tego slice’u sprawdzone pod tym kątem w świeżym checkoucie:
**42/42** i **41/41**.

**Nowe findingi:** **268** (🟠 `FCP._armEngagePicker` dobiera wroga z całej galaktyki — bliźniak
166 na innym site'cie; osiągalność NIEZMIERZONA i to część wpisu) · **269** (⚪ baner pickera
`GameScene:5148/5150/5158` ma zaszyty polski — klasa 113; ⚠ `check-i18n` tego **nie widzi**) · **270** (⚪ pin źródłowy zależny od checkoutu — PRE-EXISTING, nienaprawiony).

---

## Finding 256 — DOCK: oferta + admisja (save **v101 bez migracji**, live-gate PASS — ZAMKNIĘTY 2026-09-10)

Rodzina 154/255, ale inny producent i inny selektor. Decyzje **D-256a/b/d/e** + **reguła grupowa
„A + C”** (osobny podpis właściciela). Rejestr: `docs/design/VESSEL_ORDERS_PLAN.md` §256 + **271**.

**Jedno zdanie:** picker docka oferował ciała z obcych układów, a `_issueDock` je PRZYJMOWAŁ —
bo przebudowuje spec na `moveToPoint` i **zrzuca `targetBodyId`**, więc bramka W3-4b nie miała
na co patrzeć.

⚠ **KONTROLA, KTÓRA CZYNI POMIAR ROZSTRZYGAJĄCYM:** `dock` z `sys_020` na kolonie w `sys_home`
→ `{ok:true}` + `_pendingDock=p_home`, a **TEN SAM cel jako `moveToPoint` z `targetBodyId`** →
`{ok:false, reason:'target_other_system'}`. Bramka była poprawna — omijał ją spec.

🔴 **CHIMERA ZMIERZONA OD KOŃCA DO KOŃCA:** `Kestrel systemId=sys_020 colonyId=f_far` → po doku
na `p_home[sys_home]`: **`colonyId=p_home dockedAt=p_home xy=(110,0)`, `systemId` NIEZMIENIONY**.
`dockAtColony` przepisuje **całą bazę statku** bez terminu układu — i to szłoby do zapisu.

**D-256a** — jawna bramka `isSameSystem(vessel, bodyEnt)` w `_issueDock` (NIE forwardowanie
`targetBodyId`: promień rażenia śledzenia ciała). ⚠ **Rodzina predykatu: (statek, CIAŁO) →
`SystemScope`, NIE `CameraFrame`** — dock ma prawdziwe ciało w spec-u; termin KAMERY (255)
odrzucałby tu flotę dokującą legalnie we własnym układzie, gdy gracz patrzy na inny. Fail-OPEN.

**D-256b** — lustro u konsumenta (`_maybeDockOnArrival`). ⚠ **Kredyt za 263 = ZERO, zmierzony
w obie strony:** `_maybeAutoDockOnReturn` ma termin od `9e1e7d8`, a jego bliźniak stał bez terminu
**jedną funkcję dalej w tym samym pliku**. Marker przeżywa porzucenie rozkazu, więc to obrona
na tej ścieżce, nie zamiast bramki.

**Reguła grupowa „A + C”.** Oferta = reprezentant (pierwszy żywy), admisja per statek.
⚠ Reprezentant to **kolejność DODANIA** do zbioru — nie odległość, nie kamera. **Przecięcie
odrzucone świadomie**: pusty picker odbierałby legalną akcję (dok tych, którzy MOGĄ).
⚠ **All-or-nothing z D-LD2 NIE przenosi się na dock** — `dispatchDockTo` to zwykła pętla per
statek bez wspólnego `_arrivalSyncYear`, więc częściowa wysyłka jest poprawna, o ile jest GŁOŚNA.

**D-256d — trzy pułapki ciszy** (wszystkie zmierzone): odmowa BEZ powodu gasiła cały raport
(`?? null`), odmowa CZĘŚCIOWA nie raportowała wcale, sukces ma milczeć. Kanał i klucze
identyczne jak w 255 ⇒ **zero nowych kluczy i18n**.

**Finding 271** (zamknięty w tym samym commicie): toast odmowy wypisywał **surowy slug**
(`Cannot dock: target_other_system`) — `check-i18n` jest na to ślepy, bo klucz istniał; niewidoczny
aż do chwili, gdy admisja zaczyna odmawiać.

⚠ **PIN DANCE — odwrotnie niż przy T9a:** żaden pin „dock poza mapą przechodzi” nie mógł paść
(fixture’y SAME-SYSTEM); kłamały ETYKIETY — T4b/F10 przecelowane + rodzeństwo cross-system.
Jedyny odwrócony pin 256 stał w `map_vessel_panel_smoke` **P8** i **padł jak miał**, co było
sygnałem, że kształt (a) dotknął obu site’ów; przecelowany na inwariant wymagający **flagi
I reprezentanta** — bo sama flaga jest NO-OPEM.

✅ **LIVE-GATE 2026-09-10 PASS** (właściciel, klient EN): §0 skan chimer **PUSTY** · §1 oferta
(wykonana na **`FleetCommandPanel`** DOCK) · §4 dok mieszany `1/2 moved` z NAZWANYM pominiętym ·
§5 kontrola same-system · **§6 PASS-with-finding → 272**.
⚠ **§2:** `FleetGroupPanel.grpDock` to INNY GEST (CTRL+klik 2+ luźnych statków) — nie wykonany
na żywo, stoi na headless D1d + D1b. ⚠ **§3:** ścieżka „wszyscy odmawiają” (toast 271) jest
OSIĄGALNA — trzy krawędzie ZMIERZONE SONDĄ (reprezentant unieruchomiony / w rezerwie / stał się
wrakiem między ofertą a wyborem), wszystkie z przetłumaczonym powodem; **bez potwierdzenia na żywo**.
**Testy:** `return_dock_family` **68/68** · `map_click_frame` **42/42** · `fleet_move_picker_frame`
**43/43** · `map_vessel_panel` **120/120**. Fail-first **18 pinów na czerwono** w PRAWDZIWYM
`git worktree` (nie `git archive` — Finding 270): 54/14 · 41/1 · 42/1 · 118/2.
Sweep **223/223 0 FAIL** · `check-i18n` PASS · bez flagi (rollback = revert).
**KOLEJKA (rodzina 255 i dalej):** ~~wiersze 8/9~~ ✅ → ~~**256**~~ ✅ (reguła
grupowa „A + C”; **271** zamknięty przy okazji) → ~~**266**~~ ✅ (KANON `VesselStatus.js`,
D-266a…d — sekcja niżej; ⚠ było **sześć** site'ów, nie dwa) → ~~**267**~~ ✅ (D-267a = weto
per waypoint W CHWILI POŁOŻENIA, trasa przeżywa — sekcja niżej; live-gate PASS)
→ ~~**273**~~ ✅ (`patrol`/`escort` w `isOrderControlled` — emit-only zmierzone, sekcja niżej; live-gate PASS 5/5; **274** = obserwacja UX z gate'u, rodzina 269, NAJPIERW POMIAR) → ~~**166 (ENGAGE)**~~ ✅ (D-E1…D-E4 — lista `engage` keyed na FLOCIE + głośna odmowa rozkazu floty, sekcja niżej; live-gate PASS; **275** = odmowa kasuje poprzedni rozkaz floty, D-E3 własny audyt; **276/277** = obserwacje z gate'u) → ~~**268**~~ ✅ (admisja floty PRZED szukaniem zawężonym do układu KAMERY + `noEnemyHere` + PPM `fleet.engage` przez D-E2 — sekcja niżej; live-gate PASS A-E; **277** skorygowany, obserwacja o `DirectorRecall` = kandydat na numer w triage) → **275** (NASTĘPNY — D-E3, **audit-first**; obok: read-only weryfikacja statusów 217/216/223/195/95/65/193) (utrata rozkazu przy odmowie — `issueFleetOrder:119`, D-E3) → **269** + **270** (razem z 113 / poprawką `check-i18n` i przeglądem
pinów źródłowych; ⚠ 269 ma od 266 **trzy nowe site'y**) → **272** (⚠ **DECYZJA WŁAŚCICIELA
POPRZEDZA KOD**: semantyka Powrotu floty rozpiętej — cel per członek czy cel reprezentanta
z głośną odmową) → reszta rejestru (**151** / **152** / **153**, **264** / **265**).
⚠ **Jedna otwarta decyzja właściciela w kolejce: 272 (semantyka Powrotu floty rozpiętej).**
Jest na zapisie w rejestrze — NIE zaczynać jej od kodu.

---

## Finding 266 — „Docked" przestaje być DOMYŚLNĄ etykietą: kanon statusu statku (save **v101 bez migracji**, live-gate §1/§2/§4 PASS, §3 headless — ZAMKNIĘTE 2026-09-15)

Decyzje właściciela **D-266a…d** (2026-09-15). Rejestr: `docs/design/VESSEL_ORDERS_PLAN.md` §266
(zamknięty, **ze SPROSTOWANĄ przesłanką**) + §269 (dopisane trzy site'y klasy 113).

**Jedno zdanie:** sześć powierzchni nazywało stan nierozpoznany „Docked", cztery inne zgadywały dla
tego samego nieznanego INNE słowo — teraz o etykiecie rozstrzyga JEDEN czysty predykat.

⚠ **POMIAR ZMIENIŁ WAGĘ FINDINGU, NIE POTWIERDZIŁ GO.** Silnik produkuje **dokładnie trzy** tokeny
`position.state` (48 pisarzy literałów: 'docked' ×3, 'in_transit' ×16, 'orbiting' ×29; fabryka
`Vessel.js:158`), a **każdy pisarz 'docked' ustawia `dockedAt` w tym samym statemencie** ⇒ stan
`undefined`/nieznany jest osiągalny **wyłącznie** z zapisu bez pola (`VesselManager.restore` robi
`{ ...vd.position }` → `{}`, bez leczenia — wykonane) albo z przyszłego czwartego tokena. Fallback
„Docked" był więc **LATENTNY**. ⇒ leg-D-owy „docked at Mstow" **NIE pochodził z etykiety statusu**:
jedynym napisem tej postaci w obu słownikach jest `vessel.docked: 'Docked at {0}'` — **linia dziennika
misji** z ostatniego dokowania (`VesselManager:725`), renderowana w detalu statku w Command (ostatnie 8);
drugim „Mstow" na tym detalu jest `_baseText` (kolonia macierzysta). **Historia stała tam, gdzie czyta
się status** — obserwacja bez numeru (numer = decyzja właściciela).
**Jedynym OSIĄGALNYM kłamstwem było 'orbiting' PRZECIĄŻONE**: orbita ciała ALBO swobodny dryf
(`dockedAt=null`; ≥8 żywych producentów — `MOS:1264` engage, `:1637` lot w pusty punkt, `VM:2818`
przylot międzygwiezdny na obrzeże, `ReturnJump`, DSCS/VCS) — panele pisały „Orbiting" niczego,
a Command **„Orbit: ???"** / „⊙ ???".

**Kanon — NEW `src/utils/VesselStatus.js`** (zero importów, fail-CLOSED, wzór `ColonyOwnership`/
`SystemExploration`): `resolveVesselStatus(vessel) → { token, bodyId }`, zbiór `VESSEL_STATUS_TOKENS`
= `in_transit · orbiting · in_space · docked · unknown` (kolejność = kolejność list grupowanych),
`vesselStatusLabelKey(token)` → `fleetGroup.status*`. `docked` bez `dockedAt` (niemożliwe z konstrukcji)
→ **'unknown'**, nie zgadywane. ⚠ **`in_space` NIE jest stanem silnika** — nie wolno go zapisać do
`position.state`; kanon jest **wyłącznie dla etykiet**. Logika (`countActionable`, `manualRefuel`,
`undockToOrbit`, stożek wydechu, `VesselManager`) czyta SUROWY stan i tak ma zostać (pin T6).

**Konsumenci (8 plików):** `FleetGroupPanelLogic.buildRosterRows` · `FleetGroupPanel` /
`FleetCommandPanel` (prywatne `STATUS_KEY` USUNIĘTE) · `FleetPictureLogic.buildShipEntry` (⇒ K3,
Dok taktyczny, plakietki) · `FleetRegistryLogic` (fallback „Idle" → „Unknown") · `Outliner` (grupy =
tokeny kanonu, własne nagłówki „In space"/„Unknown") · `FleetManagerOverlay` (`STATUS_COLORS` po tokenie,
`◌ In space` / `? Unknown` w liście, `_getLocationText`, `_statusText`, `_warpStatusLabel`, detal wroga)
· `ThreeRenderer` (tooltip) · `NavPeekProviders` (nagłówki komponowane — bez nowego klucza `{0}`).

**i18n: DOKŁADNIE dwie nowe pary** — `fleetGroup.statusUnknown` ('Unknown'/'Nieznany'; **nie**
`vessel.unknown`, którego dom to „nieznany STATEK") i `fleetGroup.statusInSpace` ('In space'/
'W kosmosie', brzmienie za `navPeek.fleet.inSpace`). Seria „zero nowych kluczy" **przerwana świadomie**.
Rejestr K3 dzieli te dwa słowa z rodziną panelową (własne klucze zostawia dla trzech stanów silnika).
`fleetPicture.state.idle` stracił jedynego producenta — zostaje w słowniku jako nieużyty. **Trzy polskie
literały** w przepiętych łańcuchach ZOSTAJĄ (dopisane do 269). Zapadka `check-i18n` bez zmian, PASS.

**Keeper `vessel_status_label_smoke` 84/84** (T0-T7): **T0 enumeruje pisarzy `position.state` ZE
ŹRÓDŁA** regexem `\s`-tolerantnym (Finding 270) — ≥3 pliki, ≥40 trafień, zbiór ≡ trójce; **czwarty
token w silniku pali keeper GŁOŚNO**; T1 bierze zbiór Z T0 (tabela oczekiwanych etykiet ma trzy wpisy
— czwarty nie znajdzie wpisu); T2/T4 stan nierozpoznany na obu panelach, w K3, w `buildShipEntry`
i w kubełku Outlinera (wykonanie prawdziwego `draw()` na atrapie ctx z przechwytem `fillText`);
T3 leg-D z kontrolą `dockedAt:'h2'` + `_getLocationText` bez „???" + NavPeek; **T5 zgoda nagłówka
z rosterem NIEZALEŻNA od wybranego słowa** (`dockedCount == #„Docked"` — na HEAD 1 vs 2); T6 logika
bit w bit jak na HEAD; T7 `map_vessel_panel_smoke` w procesie potomnym (120/120).
**Fail-first w REALNYM `git worktree` na `9127f14`: 44 PASS / 40 FAIL** — czerwone dokładnie T2 (17),
T3 (9), T4 (12), T5 (1) + jedna kontrola zależna od kanonu w T0; T1/T6/T7 zielone (kontrole).
Sweep **224/224 0 FAIL**. Zapis v101, bez flagi (rollback = revert).

**Live-gate 2026-09-15 PASS** (właściciel, na żywo, klient EN): **§1** zdrowa trójka bez zmiany
wizualnej (Docked+ciało · In orbit+„Stacja Mstow" · In flight na kursach międzyukładowych);
⚠ **obserwacja, nie defekt:** statek **w skoku warp** (`orbiting`+`dockedAt:null` na czas tranzytu)
renderuje „In space" z aktywnością „Warp jump" obok — kanon prawdomównie raportuje POZYCJĘ, kolumna
aktywności rozstrzyga (dwie osie: status fizyczny ≠ misja). **§2** słowo dryfu PASS na wszystkich
powierzchniach i z konsoli (`v_18`: `{state:'orbiting', dockedAt:null}` → `{token:'in_space'}`).
**§3** „Unknown" — **NIE ćwiczone na żywo** (populacja pusta z konstrukcji), stoi na **T2 headless**
(wzór uczciwości 271). **§4** `JSON.stringify(v.position)` identyczne przed/po każdej powierzchni —
kanon tylko czyta. Commity: C1 kanon+i18n · C2 konsumenci+keeper · C3 docs.

⚠ **Lekcja z harnessu:** `grep -q $'\r'` w tym środowisku NIE wykrywa CRLF (zwrócił „LF" dla ośmiu
plików CRLF) — liczyć bajty `\r` (`tr -cd '\r' | wc -c`), inaczej patch z kotwicą `\n` nie trafia.
Stan realny: `FleetCommandPanel`/`FleetGroupPanel`/`FleetGroupPanelLogic`/`Outliner`/FMO/
`ThreeRenderer`/`en.js`/`pl.js` = **CRLF**, `FleetPictureLogic`/`FleetRegistryLogic`/`NavPeekProviders`
= LF (repo mieszany, `autocrlf=true`, brak `.gitattributes` — Finding 270).

---

## Finding 267 — `patrolManual`: waypoint spoza ramki odrzucany W CHWILI POŁOŻENIA, trasa przeżywa (save **v101 bez migracji**, live-gate PASS: §2/§4/§5, §1/§3 PASS-with-finding → 273, re-run §3 A=3/B=2 — ZAMKNIĘTE 2026-09-15)

Trzeci producent punktu z ramki KAMERY (po legu D i wierszach 8/9). Decyzja właściciela
**D-267a = (A)**: każdy waypoint oceniany **przy położeniu, w ramce SWOJEGO kliku** — per-punktowe
odczytanie reguły D-89c (położenie punktu JEST jego finalizacją); odmowa natychmiastowa i GŁOŚNA,
trasa zebrana do tej pory **PRZEŻYWA**; ENTER finalizuje trasę już-w-całości-ważną. Rejestr:
`docs/design/VESSEL_ORDERS_PLAN.md` §267 (wdrożone, live-gate PENDING).

**STOP-klauzula NIE zaszła (zmierzone):** przy kliku picker ma OBIE strony pytania — `metadata.vesselId`
(stawia producent) i kamerę (`activeSystemId` w tej chwili); bufor trasy żyje w
`UIManager._pickerState.waypoints`. Placement-time jest strukturalnie możliwe, więc (B) nie było potrzebne.

**Kształt — trzy warstwy, JEDEN termin:** producent `RightClickMenu` (JEDYNE wejście `patrolWaypoints`
z `vesselId`; picker POI `create_poi` i debug NIE podają weta — POI bez `systemId`, Finding 152)
wstrzykuje `metadata.validateWaypoint` → CZYSTA maszyna `PickerStateMachine.addWaypoint` woła hook
i przy wecie NIE rusza bufora (`{ok:false, reason, vetoed:true}`; maszyna nadal nie zna `window`) →
`UIManager.addPickerWaypoint` zamienia weto na `ui:pickerWaypointRejected` → HUD
(`GameScene._createPickerHUD`) pokazuje nazwę statku + powód przez `describeOrderFail`. Dziennik:
`log.el.orderRejected` + `vessel.reasonTargetOtherSystem` — **zero nowych kluczy i18n**. `patrol`
NADAL poza `POINT_SOURCED_ORDER_TYPES` (T8e).

⚠ **Dwie obrony w głąb, obie osiągalne** (picker NIE kasuje się na `system:switched`, a czas płynie
podczas klikania): **(a)** ramka TRASY = kamera przy PIERWSZYM przyjętym punkcie — punkt z innej ramki
odrzucany nawet, gdy statek „przyleciał" tam i kamera poszła za nim (inaczej trasa mieszałaby dwie
ramki); **(b)** przy ENTER statek musi NADAL stać w ramce trasy — inaczej odmowa bez rozkazu. Przy
okazji trzy dotąd CICHE porażki tego callbacku (`buildPatrolFromWaypoints`, `issueOrder`) idą tą samą
głośną ścieżką.

⚠ **T9b (`map_click_frame_smoke`) NIE MÓGŁ PAŚĆ SAM Z SIEBIE** — ta sama klasa co T9a w D-89d: wołał
`buildPatrolFromWaypoints` + `mos.issueOrder` WPROST, a MOS jest dla tras bez ramki z definicji
(spec `patrolRoute` = gołe punkty, jak POI). Przecelowany na producenta + prawdziwą maszynę
(execution pin); stara asercja została jako **T9b-ctl** (MOS pozostaje przepuszczalny — siostra
T4/T9a-ctl). ⇒ **reguła:** pin „ma paść, gdy X zostanie zamknięty" jest hipotezą o MIEJSCU naprawy;
gdy naprawa ląduje piętro wyżej, pin trzeba przecelować, nie „naprawić" tak, by padł.

**Keeper NEW `patrol_waypoint_frame_smoke` 42/42** (T1-T9: T3 = P1 ✓ → zmiana układu → P2 ✗ →
powrót → P3 ✓ → ENTER → `patrol` z DOKŁADNIE [P1, P3]; T4 ramka trasy stała; T5 obrona przy ENTER;
T6 kontrole POI/debug/jedna ramka; T7 piny źródłowe CRLF-safe; T8 PL+EN bez sluga; T9 kontrola MOS).
**Fail-first w REALNYM `git worktree` na `e087507`: 21 PASS / 21 FAIL** — czerwone T1 (1) · T2 (5) ·
T3 (6) · T4 (2) · T5 (2) · T7 (3) · T8 (2 piny tekstu wpisu); T6/T9 zielone. `map_click_frame` **42/1**
(pada dokładnie przecelowany T9b) → **43/43**. Sweep **225/225 0 FAIL** · `check-i18n` PASS. Zapis v101,
bez flagi (rollback = revert). Baner pickera nadal po polsku (Finding 269, nietknięty).

**Live-gate 2026-09-15 (właściciel, klient EN):** §2 PASS (odmowa przy położeniu: baner + jedna linia
Dziennika, `waypoints.length` 0) · §4 PASS (picker POI nietknięty) · §5 PASS (stan bajt w bajt po
odrzuconym kliku) · **§1/§3 PASS-with-finding**: semantyka rozkazu poprawna (rozkaz, „In flight", trasa),
ale **sprite 3D nie ruszył**, a po „Anuluj rozkaz" statek „nagle" stanął przy waypoincie 2/3.
⚠ **To NIE jest regresja 267 — Finding 273, PRE-EXISTING od M2b (2026-04-27), zmierzony bajt w bajt na
`e087507` i na drzewie 267:** `VesselManager._updatePositions` wrzuca do `moving[]` (jedyne źródło
`vessel:positionUpdate`, którym renderer rusza sprite `in_transit`) tylko `pursue|intercept|engage`;
`patrol`/`escort` mutują x/y wprost w MOS przy ZAWIESZONEJ misji ⇒ statek nie trafia w żadną gałąź ⇒
**0/200** ładunków (kontrola `moveToPoint` 200/200), identycznie przy 2 AU i 30 AU — odległość nie jest
przyczyną (brak cullingu sprite'ów). „Nagłe pojawienie się" = `cancelOrder` → `orbiting`+`dockedAt=null` →
`_tickOrbitingVessels` czyta realne x/y (poprawka desync z M4) — pierwszy kontakt renderera z pozycją,
którą symulacja miała od dawna. Mapa taktyczna czyta x/y wprost, dlatego przeżyło pięć miesięcy.
Diff 267 w `GameScene`/`UIManager` = jeden import + jeden listener banera + jedna gałąź emitu weta — zero
kontaktu z pętlą renderu. Błędy konsoli podczas §1: **nie sprawdzone** (zapisane dosłownie).
✅ **Celowany re-run §3** (właściciel, semantyka rozkazu, sprite ignorowany): **A** jedna ramka,
3 waypointy → `patrolRoute.length` = **3** · **B** scenariusz przeżycia (P1 ✓ / klik obcy ✗ / P3 ✓ /
ENTER) → `patrolRoute.length` = **2**, dokładnie jedna linia odmowy w Dzienniku. Commity: `fix(267)` +
`docs(267)`.

---

## Finding 273 — patrol/escort: sprite 3D rusza się z symulacją (save **v101 bez migracji**, live-gate PASS 5/5 — ZAMKNIĘTE 2026-09-16, commit `7ab18f1`)

Domknięcie findingu z gate'u 267. Rejestr: `docs/design/VESSEL_ORDERS_PLAN.md` §273 (zamknięty)
+ nowy **274** (obserwacja UX z gate'u). Keeper `patrol_render_sync_smoke` 42/42.

**Jedno zdanie:** `VesselManager._updatePositions` wrzucał do `moving[]` (jedyne źródło
`vessel:positionUpdate`, którym `ThreeRenderer` rusza sprite `in_transit`) statki sterowane rozkazem
**tylko** dla `pursue | intercept | engage`; `patrol` i `escort` mutują `x/y` wprost w MOS przy
ZAWIESZONEJ misji, więc nie trafiały w żadną gałąź — symulacja jechała, sprite stał, a „Anuluj rozkaz"
wyglądał jak teleport. Naprawa = **dwa tokeny na liście** `isOrderControlled`. PRE-EXISTING od M2b
(`4929b39`/`28cd5c6`, 2026-04-27); mapa taktyczna czyta `x/y` wprost, dlatego przeżyło pięć miesięcy.

**⚠ PYTANIE BRAMKUJĄCE ZMIERZONE PRZED KODEM — emit-only, NIE całkowanie.** Gałąź `isOrderControlled`
to `moving.push(vessel); continue;`, a `MOS._tick` całkuje pozycję PRZED `_updatePositions`. Sonda na
prawdziwym łańcuchu `time:tick → VM._tick → MOS._tick → _updatePositions` (200 tików × 0,01 gy,
pristine `git worktree --detach b52f724` vs po naprawie): wkład `_updatePositions` w przesunięcie
patrolu/POI/eskorty **0,000000 AU przed i po** (owinięcie metody — dla `moveToPoint` = 2,000 AU, VM JEST
tam integratorem, więc instrument widzi całkowanie); ślad pozycji 9 statków × 200 tików **bajt w bajt**;
krok 0,0100 AU = speedAU×DT (zdublowanie dałoby 0,0200). Emisja **0/200 → 200/200** (patrol manualny,
patrol POI przez prawdziwy `POIRegistry`, eskorta). Gdyby gałąź całkowała, one-liner byłby błędem
PODWÓJNEJ prędkości — dlatego pomiar PRZED kodem, nie po.

**⚠ JEDYNY SKUTEK UBOCZNY — wariant A, podpisany, pinowany (T5).** `continue` omija zerowanie
`vessel.velocity` niżej w pętli ⇒ MOS-owe velocity patrolu/eskorty PRZEŻYWA tik (jak przy pursue; M1 §2.1:
zero TYLKO dla docked/orbiting/wrak). Jedyni czytelnicy pola: `MOS._computeInterceptPoint` + stożek
predykcji — czytają velocity **CELU**. ZMIERZONE: przed naprawą wynik przechwycenia PATROLUJĄCEGO celu
zależał od **kolejności wydania rozkazów** (interceptor wydany PRZED patrolem tikał przed nim i czytał
zero ⇒ pościg, tik 185; wydany PO ⇒ prawdziwe przechwycenie, tik 165); po naprawie oba 165. Osiągalność
w grze **zero** (patrol/escort wydaje tylko gracz; intercept/engage tylko gracz i tylko na wroga; doktryna
AI = tylko `moveToPoint`). Pole nieserializowane. ⚠ Pierwsza sonda tego NIE widziała: przy równych
prędkościach `a = 0` i przechwycenie degeneruje do pościgu — **fixture, który przez konstrukcję nie może
pokazać różnicy, świeci „bez zmian" dokładnie tam, gdzie zmiana jest** (interceptor 2,0 AU/rok ją ujawnił).

**Pin „brak podwójnego całkowania" porównuje z NAGRANYM baselinem, nie ze stałą.** Stałą `speedAU×dt`
przeszłoby też zdublowanie obu stron. NEW `src/testing/fixtures/traces/F273-patrol-trace-baseline.json`
(+ metryczka `.md` z hashem) — nagrany **TYM SAMYM keeperem** (`--record`) na realnym worktree `b52f724`,
porównanie `===` bez tolerancji; nowa sub-konwencja `fixtures/traces/` (ślady wykonania, NIE zapisy gry)
w `fixtures/README.md`. Fail-first w realnym worktree: **34 PASS / 8 FAIL** — czerwone dokładnie T1 (3),
T5 (2), T6 (2), T7 (1); T0/T2/T3/T4 zielone po obu stronach (kontrole). Sweep **226/226** (drzewo LF);
⚠ worktree CRLF `7ab18f1` **225/226** — jedyny FAIL to **Finding 270** (`warp_transit_order_gate` T11c,
pada identycznie na pre-273 `b52f724`; na LF 49/49). `check-i18n` PASS, zero kluczy, bez flagi.

**Live-gate 2026-09-16 PASS 5/5** (właściciel, klient EN): §1 patrol manualny płynie po trasie, plume,
ping-pong (GLB bez obrotu dziobu = pre-existing, jak pursue) · §2 patrol POI (⇒ **274**: zaznaczenie
statku na mapie 3D = blokada kamery na nim — `vessel:focus` jest JEDNYM sygnałem zaznaczenia i śledzenia
co klatkę (`ThreeRenderer:1102`) — więc PPM na POI łapie się na ruchomym kadrze; obserwacja, najpierw
pomiar) · §3 eskorta ~0,1 AU za liderem · §4 **Anuluj bez teleportu** (pierwotny objaw, martwy) ·
§5 konsola: `v_18` **601/601** ładunków, sprite (−222,568, 0,174) → (−170,636, 100,259).
⚠ **`0/0` w odczycie konsolowym = CZAS GRY ZATRZYMANY, nie defekt** — zero tików, sprite i symulacja
zgodne; pristine przy płynącym czasie daje `0/N`. Na każdym przyszłym gate'cie mierzącym emisję per tik:
**najpierw sprawdź, że `t > 0`**. One-liner zwalidowany wykonaniem na prawdziwym łańcuchu (renderer =
atrapa): pristine `0/N`, po naprawie `19/19`.

---

## Finding 166 (ENGAGE) — lista celów `engage` keyed na FLOCIE, nie na KAMERZE + D-E2 głośna odmowa rozkazu floty (save **v101 bez migracji**, live-gate PASS — ZAMKNIĘTE 2026-09-16)

⚠ **Kolizja numeracji:** w `VESSEL_ORDERS_PLAN.md` istnieją DWA „166" — wiersz Dziennika (zamknięty `ffc72fb`) i ten
(`_handleFleetEngage`, zgłoszony przy D-SS6). Nierozstrzygnięta (renumeracja wciąż wykonalna); tu i w commitach **„166 (ENGAGE)"**.
Rejestr + pomiar + decyzje D-E1…D-E4: `docs/design/VESSEL_ORDERS_PLAN.md` §„Finding 166 (ENGAGE)" (+ 268 skorygowany,
264/151 dopisane, NEW **275**). Audyt wejściowy: odpowiedź 2026-09-16 (probe 166/268 w scratchpadzie, nie w repo).

**Jedno zdanie:** popup „Wybierz cel ataku" w Dowództwie budował listę wrogów po `activeSystemId` (**kamera**) — wprowadzone
ŚWIADOMIE w `c5077ef` (2026-07-16, „spójność z mapą"), gdy nie było jeszcze bramki MOS; po `369adfc` (W3-4b) filtr był
już tylko defektem UX o **dwóch twarzach**: flota w `sys_020` przy kamerze na `sys_home` dostawała listę wrogów z domu (każdy
pick → `target_other_system` bez powodu, a `issueFleetOrder:119` kasował jej poprzedni rozkaz), a przy kamerze bez wrogów
**nie mogła zaatakować wroga w SWOIM układzie** („Brak wykrytych wrogów" — fałszywy negatyw, klasa 142).

⚠ **Rodzina ENGAGE ROZSZCZEPIONA po STOP-ie audytu** (wszystkie trzy warunki STOP zaszły): 166 = lista bez punktu →
rodzina **(statek, ciało)/`SystemScope`**, klucz = układ FLOTY; **268** (`FleetCommandPanel._armEngagePicker`, pick z kliku po
CAŁYM rejestrze) = punkt z ramki KAMERY → rodzina **(statek, kamera)/`CameraFrame`** (D-89c) — **zmierzone, że dochodzi do
WALKI** (M2b: pusta kamera, wróg w układzie floty pod współrzędnymi kliknięcia → „2/2 wykonuje" → encounter DSCS z celem,
którego gracz nie widział). Osobny slice.

**Kształt (D-E1/D-E4):** `firstMember` (pierwszy żywy członek — precedens `_handleFleetReturnBase`; flota rozpięta = **272**)
→ `fleetSys = systemIdOf(firstMember)` → lista `systemIdOf(v) === fleetSys` (kanon listowy `bodiesInSystemOf`/
`_findBodyNearPoint`: brak stempla → `sys_home`, tranzyt po stronie floty ⇒ pusto, po stronie kandydata ⇒ pominięty — dawne
`?? 'sys_home'` oferowało wroga W SKOKU przy kamerze na domu, klasa 151). Kolumna AU popupu liczy `hypot(wróg, firstMember)`
— po przecelowaniu obie strony w JEDNEJ ramce ⇒ liczba mieszana („0.50 AU" z 2,5 − 2,0 w dwóch ramkach) znika z konstrukcji.
**D-E2:** `FMO._announceFleetOrderResult` + `FCP._announce` → Dziennik `fleet`/`warn` przez JEDNO źródło
`CameraFrame.describeFleetOrderRefusal(res)` (`vessel.orderPartial`/`orderNoneMoved` — klucze fan-outu PPM; `log.el.orderRejected`
dla odmowy na poziomie floty) — dla KAŻDEGO typu rozkazu floty na obu panelach; toast liczbowy zostaje; sukces milczy (D-256d).
Zero nowych kluczy i18n (powód bez klucza spada do sluga jak w PPM — klasa 271, pre-existing).

⚠ **ZAKRES ZWĘŻONY WOBEC PODPISU (zmierzony, nie urósł):** podpis liczył „#2 `enemyVisible:760` tym samym filtrem, #3 za darmo".
Zmierzone: `enemyVisible:761` zasila wyłącznie `_drawLeft`, `_drawCenter` ma własny filtr — oba to **listy MAPY**, oba **utajone**
(`commandTacticalMap:false`; żywy Rejestr K3 **nie pushuje hit-zony `'vessel'` dla kontaktów**, `:4517`), więc pick-mode fallback
nie ma dziś żadnej powierzchni. Zostają keyed na kamerze **z zamiaru** (pin T12c/d/f); gdyby wróciły — ich `engage` odpada
w MOS i od D-E2 jest GŁOŚNY. Toast `fleet.noDetectedEnemies` obiecuje powierzchnię, której nie ma (obserwacja, i18n → poza).

⚠ **Dwie rzeczy, które pomiar ZMIENIŁ, nie potwierdził:** (1) „prawdopodobnie bramka strict zatrzyma skutek, ale rozkaz zostanie
wydany" (audyt 138/142 §4.2) było błędne w OBIE strony — rozkaz **nie jest wydawany** (MOS odmawia), a strict jest decydująca
tylko dla celu `null` i odpala w **`VesselCombatSystem:135`**, nie w DSCS; (2) wpis 268 nazywał ten site „filtruje POPRAWNIE"
— porównywał z kamerą, czyli był Findingiem 166. **Rejestr opisywał pułapkę, nie defekt** (wzór 87).

**Testy:** NEW keeper `src/testing/smoke/fleet_engage_scope_smoke.mjs` **51/51** (T1-T12; popup przez stub DOM budowany PRAWDZIWĄ
`_showEnemyPickPopup`, real `FleetSystem→MOS→VCS→DSCS`; T3 = starcie DSCS jako kontrola anty-jałowości; T9 = odrzucony fleet
MOVE z powodem na OBU panelach; T12 piny źródłowe CRLF-safe z komentarzami zdjętymi). Fail-first w REALNYM
`git worktree --detach 16151b2`: **25 PASS / 26 FAIL** (czerwone dokładnie piny naprawy; kontrole zielone po obu stronach);
patch w świeżym checkoucie CRLF (270): 51/51. Sweep **227/227 0 FAIL** · `check-i18n` PASS · bez flagi (rollback = revert).

**Live-gate 2026-09-16 — PASS** (właściciel, klient EN): §1 popup wylistował rajdera z układu FLOTY przy kamerze na innym
układzie, **AU = 36 w ramce floty** (przed: „No detected enemies"); §3 pick przez kamerę → walka we własnym układzie, wygrana;
§4 kontrola D-E2 na odrzuconym fleet MOVE: „No vessel moved — Gladiator (Target is in another system — warp jump first)"
(powód inny niż w przepisie, kryterium spełnione); §5/§6 PASS; §2 n/d (brak wrogów pod kamerą). ⚠ **Widoczna granica slice'ów
zapisana na gate'cie:** panel FCP na mapie 3D w tej samej chwili pokazał pick-mode „No detected enemies…" — to producent #4 = **268**.

⚠ **Trzy obserwacje z przygotowania gate'u (żadna nie jest naprawą):** **276** baner zwycięstwa ×4-5 na jedno starcie
(kandydat: jeden baner na CZŁONKA floty; rodzina 150/156/161; NIEZMIERZONE) · **277** `spawnEnemyRaider` — `systemId` bez
walidacji (placeholder `'<X>'` przyjęty), spawn w `sys_032` mimo `'sys_044'` (kandydat: `autoOrder` domyślnie `true` =
natychmiastowy skok ataku — NIEZMIERZONE), odmowa domu z zamiaru · **efekt uboczny bez numeru:** wywołanie bez `empireId` i bez
wojny woła `spawnTestEnemy()` ⇒ imperium „Rój Testowy" **z kolonią naziemną i 3 marines na najbliższym ciele od planety
macierzystej gracza** (`SpawnTestEnemy.js:612-618`) — wrogie imperium w domu jako skutek uboczny dźwigni od czegoś innego.

**Otwarte po tym slice'ie:** **275** (odmowa kasuje poprzedni rozkaz floty — D-E3, własny audyt, blast radius = każdy typ
rozkazu floty) · ~~**268**~~ ✅ (ZAMKNIĘTY 2026-09-17 — sekcja niżej) · **276/277** (⚠ 277 skorygowany na gate'cie 268: odmowa
domu = BRAK spawnu, nie „ignoruje `systemId`") · **264** (osiągalność ZMIERZONA M5 + bliźniak per-tik `_tickEngageOrder`/`_tickEscortOrder`)
· **151** (trzy `?? 'sys_home'` w FMO `:658/:760/:5284` + fantom M3: wróg w warpie przyjęty do `engage`, 105 emitów/120 tików
odrzuconych przez VCS, rozkaz nigdy nie gaśnie) · **272** (flota rozpięta — 166 dziedziczy „pierwszy żywy członek").

---

## Finding 268 — picker „Atak" panelu dowodzenia: admisja floty przy FINALIZACJI + zakres szukania układem KAMERY (save **v101 bez migracji**, live-gate PASS A-E — ZAMKNIĘTE 2026-09-17, commit `00945c7`)

Trzeci producent rodziny CameraFrame (D-89c) po legu D (PPM mapy) i wierszach 8/9 (pickery ruchu). Rejestr + pomiar + log
gate'u + obserwacje sceny: `docs/design/VESSEL_ORDERS_PLAN.md` §„Finding 268" (+ wiersze 276/277 dopisane). ⚠ Baza slice'u
= `e409268` (docs-only close-out 166; kod identyczny z `75afde5`) — kotwica w handoverze była sprzed close-outu.

**Jedno zdanie:** `FleetCommandPanel._armEngagePicker` zamieniał kliknięty punkt (ramka KAMERY) na cel przez
`nearestEnemyToPoint` po CAŁYM płaskim rejestrze, bez terminu układu i bez admisji floty — klik w PUSTĄ kamerę potrafił wysłać
flotę w **STARCIE DSCS z wrogiem, którego gracz nie widział** (M2b), obcy wróg przejmował legalny pick (M2c), a odmowa kosztowała
poprzedni rozkaz floty (M2a, instancja 275).

**Kształt (podpisany + dwie decyzje w ramach podpisu, obie zaakceptowane):** **(b) admisja floty PRZED (a) szukaniem** — blok
znak-w-znak jak `_armMovePicker` (D-LD2; `return` PRZED `issueFleetOrder`, więc klik odrzucony tą bramką nie kasuje bieżącego
rozkazu — 275 zostaje żywy dla odmów MOS niżej); przy flocie poza ramką KAŻDY klik dostaje odpowiedź nazywającą przyczynę zamiast
„No enemy there", które zachęcałoby do dalszego klikania · **(a)** `getAllVessels().filter(v => systemIdOf(v) === cam)` — kanon
listowy jak `_handleFleetEngage`; **nieznana kamera ⇒ pusty zbiór**, nie cały rejestr; helper `nearestEnemyToPoint` NIETKNIĘTY
(termin u wołającego, klasa D-LD1) · **(c)** pusto ⇒ istniejący **`fleetCmd.noEnemyHere`**, NIE `fleet.noDetectedEnemies` nazwany
w briefie — tamten klucz należy do pustego POPUPU FMO i obiecuje „kliknij wroga na mapie", powierzchnię, której pick-mode nie ma
(166 M1b) · **(d) producent #5** (PPM „Flota: zaangażuj", `RightClickMenu`) — ZMIERZONE na e409268 PRZED kodem: helper D-E2 go
NIE pokrywał (surowy slug TYLKO pierwszego powodu, bez nazw; odmowa częściowa CICHA) ⇒ 7-liniowy blok → `describeFleetOrderRefusal`.
Zero nowych kluczy i18n, bez flagi (rollback = revert). Nietknięte: `CameraFrame.js`, `FleetSystem` (275), MOS, FMO, słowniki.

⚠ **Skutek uboczny kanonu, NIE naprawa 151:** kandydat w tranzycie (`systemId === null`) pod kliknięciem przestaje być wybierany
(jak 166 T5b). 151 (koercje `?? 'sys_home'` w FMO) ZOSTAJE OTWARTY — pin T8 nazywa granicę.

**Keeper** NEW `fleet_engage_picker_frame_smoke` **52/52**; fail-first w PRAWDZIWYM `git worktree --detach e409268` (checkout
CRLF): **32 PASS / 20 FAIL** — czerwone dokładnie T1d/e/f/g (M2b: na pristine toast „2/2" + **1 encounter DSCS**), T2b/c, T3b/c,
T4b/c/d, T6c, T8b, T9b-en/pl/e, T11a/b/c/h; kontrole zielone po obu stronach. ⚠ **T1g („zero encounterów") ma kontrolę T5**: ta
sama geometria z kamerą na fladze floty DAJE starcie — inaczej pin mierzyłby martwy łańcuch. Patch w świeżym checkoucie CRLF
52/52. Sweep **228/228 0 FAIL**; sweep w świeżym checkoucie CRLF (po dołożeniu gitignorowanego stuba `three`) **227/228 — jedyny
FAIL = `warp_transit_order_gate` T11c (270)**. `check-i18n` PASS. Brak starego bezpośredniego assertu na tym producencie — nie
było czego zachować jako control.

**Live-gate 2026-09-17 PASS A-E** (właściciel, klient EN, scena na PAUZIE): A/M2d toast `No enemy there` + zero wpisu ·
B/#5 „No vessel moved · Gladiator (Target is in another system — warp jump first)", zero sluga · C/M2a nazwana odmowa bez toastu,
poprzedni rozkaz floty PRZEŻYŁ (2× `moveToPoint`, zero `engage`) · **D/M2b nazwana odmowa, zero rozkazu, encounters = 0 po 10 s** ·
E kontrola 1v1, zwycięstwo. ⚠ Caveat protokołu: pulsy misji w przepisie szły na `v_23` zamiast `v_25` (błąd szablonu komend po
stronie Claude'a) — obecność celu dowodzą kliki B/E.

### ⚠ Obserwacje ze sceny (żadna nie jest regresją 268) — czytaj przed następnym gate'em z debug-rajderem

- **277 SKORYGOWANY:** odmowa układu domowego = **BRAK spawnu** — zwrotka to sam bootstrap kolonii (`spawnTestEnemy`) bez
  `vesselId`; narzędzie NIE „ignoruje `systemId`" (kod honoruje parametr).
- **`DirectorRecall` (Z2) odwołuje BEZCZYNNEGO rajdera `emp_test_enemy` do jedynej kolonii imperium (Wezen g-II,
  `entity_193`/`sys_059`) już na 1. ticku, mimo `autoOrder:false`** — zamiatacz działa z projektu (bez guardu wojny), ale koliduje
  z narzędziem gate'u: **scena z debug-rajderem jest stabilna TYLKO na pauzie**. Kandydat na numer w triage — nie naprawiać.
- `KOSMOS.debug.teleportVessel(vesselId, x, y)` ustawia TYLKO `position.x/y`, bez `systemId` (`GameScene:648-655`) — **zakaz
  używania do stawiania scen** (klasa „globalne id ≠ położenie"). `KOSMOS.debug.simulateVesselArrival` = stub bramki dyplomacji
  S3.4, nie ruch statku.
- **147 potwierdzone na żywo** (`systemId: null` w `warp_transit`). **276 NIE odtworzyło się** przy 1v1 z debug-rajderem
  (baner ×1) — zostaje otwarte z tą notatką.
- **`MovementOrderSystem.listActive()` zwraca OBIEKTY ROZKAZÓW** (`id` = `mo_N`, pola `vesselId` NIE MA — zmierzone headless);
  id statku jest KLUCZEM `_byVessel`: `[...KOSMOS.movementOrderSystem._byVessel].map(([vid,o])=>({vid,t:o.type,id:o.id}))`.
  Czytnikiem flot jest **`listFleets()`** — `getAllFleets()` z notatki 8/9 **nie istnieje** (skorygowane wyżej).

**NASTĘPNE (stan po 268):** ~~**275**~~ ✅ ZAMKNIĘTY 2026-09-17 (sekcja niżej) · ~~read-only weryfikacja 217/216/223/195/95/65/193~~ ✅ wykonana (wynik w sekcji 275) → 269 + 270 → **272** (⚠ **DECYZJA WŁAŚCICIELA POPRZEDZA KOD**: semantyka Powrotu floty rozpiętej — cel per członek czy cel reprezentanta; ŻADNEJ z tych pozycji nie zaczynać od kodu) → 151 / 152 / 153, 264 / 265, 279, 280.

---

## Finding 275 — odrzucony rozkaz FLOTY nie kasuje rozkazu, który flota właśnie wykonywała: preempcja dwufazowa w `issueFleetOrder` (D-E3, save **v101 bez migracji**, live-gate PASS §1-§5 — ZAMKNIĘTY 2026-09-17, commit `2ddc115`)

Slice **audit-first** (audyt w odpowiedzi, zero zapisu; sondy poza repo) po 268. Rejestr + zapis wykonania + log gate'u:
`docs/design/VESSEL_ORDERS_PLAN.md` §Finding 275 (+ nowe **278/279/280**, korekty 217/223/227/193/216).

**Jedno zdanie:** `FleetSystem.issueFleetOrder:119` kasowało poprzedni rozkaz floty (`cancelFleetOrder(fleetId,'replaced')`)
PRZED bramką doktryny, PRZED `no_eligible_members` i PRZED fan-outem do MOS — **jednofazowa** preempcja na poziomie floty,
residuum świata sprzed D-VO3a (`6b8b28c`, 2026-05-20, krok 1 algorytmu P2 „fleet ma tylko 1 active order"); po `62caac7`
(VO-3 dwufazowe na poziomie STATKU) była to **jedyna pozostała jednofazowa preempcja w stosie rozkazów**.

⚠ **ADMISJE 255 / 8-9 / 268 POKRYWAŁY JEDNĄ KLASĘ ODMOWY** (ramka kamery, rozkazy punktowe). Odmowy MOS (`no_weapons`,
`vessel_immobilized`, `vessel_in_reserve`, `vessel_in_warp_transit`, fuel) i **bramka doktryny `hold_position`** (`:138`,
gracz ustawia z FCP `:502` / FMO `:2061` — **zero udziału MOS**) docierały do `:119` z **każdego** z 11 producentów.
ZMIERZONE przed kodem: pełna odmowa ⇒ `activeOrder → null`, członkowie `orbiting/idle/null` **w połowie lotu** (Δx = 0),
a każdy re-order emitował **fałszywe `fleet:orderCompleted(cancelled)`** („— zakończone" w Dzienniku dla rozkazu, który
nie został wykonany) z `_onMemberOrderEnded`, gdy eager cancel zdejmował ostatniego śledzonego członka.
⚠ **Semantyka partial NIE była podpisaną decyzją** — konsekwencja inwariantu + jednofazowego cancelu; wymierzona (A1 vs A2
wrapperem) i dopiero wtedy podpisana. ⚠ Korekta wpisu: przez `issueFleetOrder` idą **TRZY typy** (moveToPoint/engage/pursue),
nie osiem — dock (`dispatchDockTo`), retreat doktrynalny i patrol/escort nigdy tędy nie przechodzą; blast radius = wszyscy producenci.

**Kształt (12 linii kodu, podpis D-275-1..4):** `:119` skasowane → `prevOrder = fleet.activeOrder; fleet.activeOrder = null`
**TUŻ przed pętlą fan-out** (D-275-4: wczesne odmowy no-op z konstrukcji; ukrycie = `_onMemberOrderEnded` nie widzi starego rekordu,
gdy MOS supersede'uje rozkazy przyjętych — stąd znika fałszywe „completed", D-275-2) → fan-out → **rollback** przy `accepted===0`
(MOS dwufazowy niczego nie ruszył: rekord TEN SAM, stan bit w bit, zero zdarzeń) / **commit A2** (D-275-1) przy ≥1: odrzuceni,
którzy NADAL trzymają rozkaz **starej floty** (tożsamość po id — override gracza przeżywa, jak gałąź `tracked !== orderId`)
dostają `cancelOrder(vid,'replaced')`, potem `fleet:orderCancelled(replaced)` PRZED `fleet:orderIssued` (kolejność jak dotąd).
Bez flagi (D-275-3; interakcja `unifiedVesselOrders=false` nazwana i pinowana: stare rozkazy przyjętych osierocone jak przy
re-orderze pojedynczego statku pod tą flagą). `cancelFleetOrder` (Stop) nietknięte. Zero i18n, zero migracji.

**Keeper** `fleet_order_two_phase_smoke` **48/48**; fail-first w PRAWDZIWYM `git worktree --detach 5bbe6a0` (checkout CRLF):
**21 PASS / 27 FAIL** — czerwone dokładnie piny naprawy, kontrole (T1k/T5/T3b) zielone po obu stronach; patch w checkoucie CRLF
48/48. Siblingi zielone (`fleet_engage_picker_frame` **T2b: przeżycie rozkazu idzie DWIEMA drogami** — druga zmierzona na seamie:
`target_other_system` ×2 ⇒ no-op). Sweep **229/229 0 FAIL** · `check-i18n` PASS. One-linery gate'u WYKONANE headless przed wpisaniem.
**Live-gate 2026-09-17 PASS §1-§5** (klient EN, na pauzie): §1 pełna odmowa MOS na seamie przez PPM (FLEET przed == po, EV = `[]`,
Δx −0,445 → −0,711 AU) · §2 doktryna (0 zdarzeń) + T5 na żywo · §3 partial 2/3 z nazwanym pominiętym (**EV nieprzechwycony —
dewiacja protokołu, pokrycie §4 + T3 headless + LOG**) · §4 EV dokładnie `[cancelled(replaced), issued]` · §5 Stop nietknięty
(`[completed(cancelled), cancelled(manual)]` — **278 żywe na żywo**). ⚠ Korekta protokołu: pierwsza odmowa sesji poszła przez
picker FCP (admisja 268) — to dowód 268, nie `:119`; pin finalny na PPM.

**Read-only weryfikacja statusów (reguła W3-32, ta sama sesja):** **217** ✅ i **223** ✅ były ZAMKNIĘTE KODEM od 2026-09-01
(`c73ab33`+`ff614ba` / `8226dcc`), a kolumny statusu rejestru mówiły „🔴 OTWARTY" — flipnięte; ⚠ **227** jest od dziś WIĄŻĄCĄ
blokadą obserwabla 223 (`launch_pad` poza `BUILD_PRIORITY` ⇒ `tradingColonies` puste). **216** 🟠 do pomiaru
(`KOSMOS.debug.colonies()` na `GATE-S4-fresh-gy60` — mechanizm żywy, otoczenie zmienione przez R4/S1/S4a). Żywe w kodzie:
**195** (bez terminu własności; nowa HIPOTEZA osiągalności przez `colony:captured` + druga fala AI w locie), **95** (hipoteza ze
źródła: `StationSystem._resolveHomeColony` bez terminu własności ⇒ statek ze stacji trafia do floty WROGA po utracie stolicy —
tłumaczy objaw (a), nie (b)), **65**, **193** (korekta nazwy: `_passiveTick`).

**Otwarte po slice'ie:** **278** (O1: podwójny wpis Stop + surowy slug `replaced/manual`, rodzina 271/113, pasażer 269) ·
**279** (O3: `dispatchDockTo` zostawia stale `fleet.activeOrder`) · **280** (picker FCP engage celuje w NIEWYKRYTEGO wroga —
asymetria producentów, decyzja o semantyce detekcji, własny slice) · O2 bez numeru (członek odrzucony w partial staje w dryfie —
zachowane świadomie).

**NASTĘPNE (stan po 275):** ~~**270**~~ ✅ (sekcja niżej) · ~~**269**~~ ✅ ZAMKNIĘTY 2026-09-18 (`d363019`, sekcja niżej) →
**272** (⚠ **DECYZJA WŁAŚCICIELA PODPISANA 2026-09-18: opcja A — Powrót PER CZŁONEK**; audit-first, D-272-x do podpisu PRZED
kodem) → 151 / 152 / 153, 264 / 265, 279, 280, 281.

---

## Finding 270 — koniec pinów zależnych od checkoutu: `.gitattributes eol=lf` + świeży checkout = 0 FAIL twardo (save **v101 bez migracji**, ZAMKNIĘTY 2026-09-17, commity `0e940bc` + `444af73`); 269 = A-MIN PODPISANY (implementacja w następnej sesji)

**Jedno zdanie:** repo miało `core.autocrlf=true` BEZ `.gitattributes` ⇒ świeży klon dawał CRLF, drzewo autora LF, a pin
`warp_transit_order_gate` T11c z kotwicą `\}\n` padał w każdym cudzym środowisku („jedyny dozwolony czerwony").

**Co weszło:** (1) T11c — normalizacja `\r\n→\n` na WEJŚCIU pinu + kotwica `\r?\n`; (2) **`.gitattributes`**
`* text=auto eol=lf` + binaria (`png webp glb mp4 mp3 woff2 pdf gz`) — zmierzone PRZED dodaniem: indeks 100 % LF (986 plików),
`git status` po dodaniu = **0 zmian** (drzewo autora 677 LF / 305 CRLF / 4 mixed; całkowicie-CRLF worktree też 0),
`git checkout -- <niezmieniony>` = no-op (istniejące CRLF zostają do ponownej materializacji), świeży checkout → LF wszędzie;
(3) audyt hurtowy 229 keeperów: 33 mają `\n` w kotwicach, **32 CRLF-odporne z konstrukcji** (`\n` na POCZĄTKU kotwicy, po
`\s*`/`[\s\S]*?`, w `[^\n]` — `\n  }` jest podciągiem `\r\n  }`), 1 = T11c.

⚠ **DRUGA TWARZ 270 — odsłonięta dopiero przez dowód końcowy.** Świeży checkout z `0e940bc` (= LF) dał **225/229**: cztery keepery
kodowały CRLF drzewa autora jako FAKT — `atmosphere_logic`/`sun_animation_logic` liczyły **złote sumy GLSL z bajtami `\r`**
(„dysk z dyskiem", V2/V3; ATMO_VERT 724→707, STAR_CORE_FRAG 1114→1084), a `fleet_engage_picker_frame` T11-ctl / `fleet_engage_scope`
T12-ctl asertowały „plik na dysku JEST CRLF". Naprawa `444af73`: sumy po normalizacji (identyczne w obu drzewach; GLSL traktuje
`\r` jak biały znak; stare wartości w komentarzu) + kontrole „ctl" WYKONANIOWE (`stripComments` na syntetycznej kopii CRLF ≡ LF).
**Dowód końcowy z `444af73`: świeży checkout 987 plików LF, sweep 229/229, `check-i18n` PASS; drzewo autora 229/229.**
⚠ **REGUŁA WIĄŻĄCA:** pin zależny od checkoutu pada w OBIE strony — keeper czyta źródło **po normalizacji** i **nigdy nie pyta
o EOL dysku**; kanoniczny checkout jest LF, drzewo autora bywa mieszane, keepery muszą przechodzić w obu.

**269 — A-MIN PODPISANY (audyt 2026-09-17, kod w następnej sesji):** picker ×5 kluczy (brzmienia PL bez zmian) + **278a** ×2
(`fleet.cancelReason.replaced/manual`, fallback na slug; połówka „podwójny wpis Stop" zostaje pod 278) + 3 site'y statusów z 266 —
⚠ **wariant (i) kanon `vesselStatusLabelKey` (PL `W hangarze`→`Dok`, `W locie`→`W drodze`) vs (ii) 4 klucze zachowujące
brzmienie = DECYZJA WŁAŚCICIELA, żadnej implementacji przed nią** + `check-i18n`: sink `.textContent|.innerText =` + wykluczenie
CSS + baseline + advisory (bez zapadki). ⚠ **Klasa 113 ZMIERZONA** (tokenizer, poza komentarzami): `src/ui`+GameScene+ThreeRenderer =
**247 literałów z diakrytykami / 28 plików** (martwe 16, flaga OFF 6, konsola 54, CSS/GLSL 5, dwujęzyczne 3, **widoczne ~163**:
ColonyOverlay 49, GameScene ~35 realnie UI, CargoLoadModal 8, BattleIntroModal 6 = 158, …); literały BEZ ogonków (`W hangarze`)
są poza tym licznikiem ⇒ **osobny przyszły arc**, nie ten slice.

**NASTĘPNE:** ~~decyzja (i)/(ii) → implementacja 269 A-MIN~~ ✅ **ZROBIONE 2026-09-18** (sekcja niżej; jeden commit `d363019`,
nie dwa — bramka i baseline zależą od naprawionego `GameScene`) → **272** (decyzja właściciela PODPISANA: opcja A, audit-first)
→ 151 / 152 / 153, 264 / 265, 279, 280, 281.

---

## Finding 269 — baner pickera, powód anulowania floty (278a) i trzy statusy z 266 przez t() + `check-i18n` widzi sink DOM (A-MIN, decyzja (i) KANON, save **v101 bez migracji**, live-gate PASS 3/3 — ZAMKNIĘTY 2026-09-18, commit `d363019`)

Rejestr: `docs/design/VESSEL_ORDERS_PLAN.md` §269 (zamknięty, pełny log gate'u) + §278 (278a odhaczone, **278b otwarte**)
+ NEW **281**. Decyzja właściciela (2026-09-18, po podglądzie renderu obu wariantów na trzech site'ach): **(i) KANON**
`vesselStatusLabelKey` — zero nowych kluczy dla statusów, PL brzmienie na tych site'ach = słowa kanonu („Dok"/„W drodze").

**Co weszło (jeden commit — bramka `check-i18n` i jej baseline zależą od naprawionego `GameScene`, rozbicie na dwa
zostawiłoby jeden czerwony):** picker ×5 (`GameScene._createPickerHUD`, PL bit w bit jak dawne literały — pin T1) ·
**278a** ×2 (`UIManager:969-977`: `t(\`fleet.cancelReason.${reason}\`)` z fallbackiem na surowy slug; `replaced`/`manual`
= jedyne powody, zmierzone) · statusy: FMO wiersz wroga `ENEMY_STATE_GLYPH[tok] + t(vesselStatusLabelKey(tok))`, FMO detal
`Stan:`, ThreeRenderer tooltip — kod FMO/ThreeRenderer **bez** literałów `hangarze/locie/Bezczynny/Na orbicie` (zmierzone);
`Stan:`/`Imperium:`/reszta tooltipa zostają po polsku (klasa 113, osobny arc) · `tools/check-i18n.mjs`: sink **`dom`**
(`.textContent =` / `.innerText =`, nie `==`), `CSS_TEXT`, advisory diakrytyków (tokenizer, bez zapadki), rodzaj sinku
w liniach FAIL, próbka **2 per plik**; baseline 62/11 → **76/17** (DOM 14 w 6 plikach; `GameScene` 3 → 0).

**⚠ Trzy rzeczy, których pomiar nie potwierdził, tylko zmienił:**
1. **Sygnowane wykluczenie CSS `^\s*[@#.]…{` było NIEPEŁNE** — 3 z 12 arkuszy wstrzykiwanych przez `style.textContent`
   zaczynają się polskim komentarzem `/* Delikatna poświata … */` i wpadałyby jako „T1 polski". `CSS_TEXT` zdejmuje
   WIODĄCE komentarze, zanim spojrzy na pierwszy znak. Realny stan sinku DOM: **17 w 7 plikach** (nie „+28/14").
2. **Bramka czyta `t('…')` także w KOMENTARZACH** — reguła ZNANA (memory `i18n-checker-reads-t-calls-in-tests`)
   ugryzła po raz trzeci: przykład wywołania w komentarzu keepera = klucz „użyty-a-niezdefiniowany". Klucz kontrolny
   (`zonk`) składany dynamicznie; mechanizm opisany SŁOWAMI, bez cytowania wywołania.
3. **Próbka raportu FAIL („pierwsze 12 trafień") była ślepa na pliki DOM** — zawsze `src/scenes/…`; teraz 2 przykłady
   per zgłoszony plik. Advisory liczy TEŻ debug/konsolę (**494 w 87**; `GameScene` 102 vs ~35 UI z pomiaru 17.09) —
   rozdział „ekran vs konsola" należy do arca 113, zapisane w komentarzu narzędzia.

**Keepery:** NEW `i18n_269_amin_smoke` **61/61** — fail-first w realnym `git worktree --detach 59cbc2c` **14 PASS / 47 FAIL**
(T3 = `FleetManagerOverlay._drawEnemyDetails` WYKONANIEM w PL i EN na atrapie ctx — FMO importuje się pod node;
ThreeRenderer nie ⇒ pin źródłowy; T4 = kontrola nie-jałowości sinku DOM przez CargoLoadModal) · `i18n_hardcoded_gate_smoke`
20 → **24/24**, fail-first **17/7** (⚠ z nowym keeperem 269 w drzewie wychodziło 13/11 — jego literały `t('picker.…')`
paliły STARĄ bramkę: artefakt setupu, odjęty od liczby). Sweep **230/230** (drzewo autora CRLF) · **świeży checkout LF +
`git apply` patcha: 230/230, `check-i18n` PASS** (pl=en=3352, +7 kluczy). Bez flagi (rollback = revert).

**Live-gate 2026-09-18 (właściciel, klient EN) PASS 3/3:** banery pickera EN (waypoint 1/2, oba ESC-flow) · **na FLOCIE**
„⚑ www: order cancelled (replaced by a new order)" + „(manually)" — zero slugów · tooltip „Orbiting" + kontrola słów kanonu
z konsoli; wiersz wroga niećwiczony (brak wroga w kampanii) — pokrycie keeperem T3. ⚠ **Protokół:** pierwsza próba §2 szła
na POJEDYNCZYM statku (Dziennik pisze tam log per-vessel, 278a nie gra) — powtórka na flocie rozstrzygnęła.

**Obserwacje z gate'u (bez naprawiania):** NEW **281** — linia Dziennika przy starcie rozkazu w PUSTY PUNKT: „🚀 Kurier → ?
(⛏ Move to point)" — `UIManager:993-998` `mission?.targetName ?? '?'` (MOS `:1033` daje `targetName: null` dla gołego
punktu) + mapa ikon zna tylko colony/transport/recon ⇒ kilof dla rozkazu ruchu; mechanizm ze źródła, klasa 271/113 ·
**bez numeru:** sporadyczne „statek leci gdzie indziej niż klik" — bez kroków repro, NIE przypisywać do znanej rodziny
(255/267/151/152/264) bez pomiaru.

**NASTĘPNE:** ~~**272**~~ ✅ **ZAMKNIĘTY 2026-09-19** (sekcja niżej) → 151 / 152 / 153, 264 / 265, 279, 280, 281, 282.

---

## Finding 272 — Powrót floty: cel PER CZŁONEK, głośna odmowa zamiast lotu w cudzą ramkę (opcja A, save **v101 bez migracji**, live-gate PASS §1-§3 — ZAMKNIĘTY 2026-09-19, commit `fc81fb8`)

**Ostatnia noga rodziny 255.** Plan + decyzje **D-272-1…9** + pełny log gate’u:
`docs/design/VESSEL_ORDERS_PLAN.md` §272 (zamknięty) + NEW **282**.

**Jedno zdanie:** oba producenty Powrotu floty (`FMO._handleFleetReturnBase`, `FCP._fleetReturn`) dobierały JEDEN cel —
najbliższą własną kolonię PIERWSZEGO żywego członka — i podawały go jako **goły punkt** do `issueFleetOrder`, który
fan-outował go WSZYSTKIM; współrzędne są LOKALNE dla układu, więc członek z innego układu leciał do bezsensownych
współrzędnych we WŁASNEJ ramce.

⚠ **CICHA BYŁA ŚCIEŻKA PRZYJĘTA, NIE ODRZUCONA.** Odmowy MOS nazywa już D-E2 (zmierzone M3). Defektem było to, co
**przechodzi**: MOS goły punkt **PRZYJMUJE** (bramka `target_other_system` patrzy na cele-CIAŁA), statek leciał,
`_maybeAutoDockOnReturn` (termin układu, **263**) odmawiał doku i statek **DRYFOWAŁ BEZGŁOŚNIE**. Reprezentant
w tranzycie warp abortował **CAŁĄ** flotę (M5).

**Kształt:** NEW `src/utils/FleetReturnPlan.js` — czysty helper (zero `window`/`EventBus`, wzór `CameraFrame.js`),
**jedno źródło dla obu producentów**: każdy członek dostaje WŁASNY cel = najbliższą własną kolonię w JEGO układzie
(ten sam resolver, którym **154** naprawiło oba producenty — `nearestOwnColonyBodyInSystem`, wołany N razy zamiast raz).
`FleetSystem.issueFleetOrder` dostaje **generyczne** pola `spec.memberTargets` / `spec.memberRefusals`; bez nich ścieżka
jest **bit w bit jak dotąd** (kontrola w keeperze: zwykły `moveToPoint` floty NADAL synchronizuje ETA).

⚠ **D-272-1 — KOREKTA PODPISU PO POMIARZE (najważniejsza rzecz w tym slice’ie).** Podpis mówił „fallback = cel
reprezentanta (jak dziś)”. Pomiar M4: resolver zwraca `null` w **dokładnie dwóch** stanach — tranzyt warp (MOS i tak
odmawia) albo układ **BEZ** kolonii gracza — a w tym drugim cel reprezentanta leży **z definicji** w innej ramce
(gdyby leżał w tej samej, resolver by go znalazł). „Fallback” był więc **zbiorem pustym realnych celów** i dokładnie
dzisiejszym defektem pod inną nazwą ⇒ **głośna odmowa** (`no_friendly_planet` / `vessel_in_warp_transit`) istniejącym
kanałem D-E2, **zero nowych kluczy i18n**.
⚠ **Reguła, która z tego zostaje:** *podpisany fallback też jest hipotezą* — policz, w jakich stanach się uruchamia;
fallback odpalający się wyłącznie tam, gdzie jest defekt, **jest** tym defektem.

**Pozostałe decyzje:** D-272-2 tranzyt warp ⇒ `vessel_in_warp_transit` (ten sam powód co bramka MOS) · D-272-3
reprezentant = **pierwszy członek Z CELEM** (statek w warpie nie abortuje floty) · D-272-5 przy `memberTargets`
**BEZ syncu ETA** (sync ma sens, gdy flota ląduje RAZEM; tu zmuszałby statek 0,5 AU od swojej kolonii do pełzania za
członkiem 20 AU od swojej) · D-272-6 cel **JAWNY** `targetBodyId`+`targetPoint`+`targetName` (bramka MOS staje się
obroną w głąb; **281** domknięte dla Powrotu za darmo — Dziennik pokazuje nazwę, nie „?”) · D-272-7 **re-home per
członek** (`_pendingReturnDock` = własne ciało; flota może skończyć z różnymi bazami — to jest znaczenie „wróć do
najbliższej WŁASNEJ kolonii”) · D-272-9 brak celu u WSZYSTKICH ⇒ toast jak dotąd.

**KONTRAKT:** dla KAŻDEGO żywego członka plan ma **DOKŁADNIE JEDEN** wpis — w `memberTargets` ALBO w `memberRefusals`.
`FleetSystem` na tym polega i **NIE ma gałęzi obronnej** — zero nowych powodów odmowy, zero nowych kluczy (odmowa idzie
istniejącym kanałem D-E2: `Order: 1/2 moved · skipped: <nazwa> (<powód>)` + linia per statek).

### ⚠ Granice dowodu — nazwane

* **`retreat_at_50` (doktryna) jest POZA slice’em i nie jest jego luką:** nie idzie przez `issueFleetOrder` —
  `FleetSystem._tickCivYears` wydaje odwrót **per statek** przez `mos.issueOrder`, a cel dobiera `resolveShelterOrderSpec`
  (RETREAT_TARGET), czyli **jest już per członek, inną drogą**. Klasa wspólna z **279**, nie z 272.
* **`activeOrder.targetPoint` reprezentanta jest INFORMACYJNY** — zmierzone grepem: **zero czytelników** w `src/` poza
  `FleetSystem`. Źródłem prawdy są `memberTargets` (i sam rozkaz w MOS).
* **Caveat gate’u §1:** domiar `colonyId` (re-home, D-272-7) **przepadł na żywo** — właściciel zresetował zapis przed
  odczytem; pokrycie = **pin T7** + sonda M1. Nie nazywać tego zweryfikowanym na żywo.
* **281 domknięte TYLKO dla Powrotu**; pozostałe `moveToPoint` w goły punkt dalej drukują „→ ?” i kilof.

**Live-gate 2026-09-18/19 (klient EN) PASS §1-§3:** §1 plan per członek (`Furia → Wancerzów`, `Gladiator → Colony
Alioth`, `memberRefusals: {}`, `sync: null`, markery per członek, oba *In orbit*) · **§2** `Gladiator` stojący
w `sys_032` bez kolonii: podgląd planu ⇒ `{v_18: "no_friendly_planet"}`, Dziennik `Order: 1/2 moved · skipped:
Gladiator (No friendly planet in range)`, `order: null` / `marker: null` w dwóch odczytach, statek stoi · §3
nie-regresja w jednym układzie.

**Testy:** keeper NEW `fleet_return_per_member_smoke` **52/52** (fail-first **25 PASS / 27 FAIL** w realnym
`git worktree --detach 493b1e0`); siblingi **0 zmian**; sweep **231/231 0 FAIL** (drzewo autora **i** świeży checkout LF);
`check-i18n` PASS (pl=en=3352). Bez flagi — rollback = `git revert`.

**NOWY FINDING 282 (otwarty, NIE naprawiany tutaj):** statek **po PRZYLOCIE** ze skoku pokazuje w kolumnie aktywności
„Skok warp” / „Warp jump” bezterminowo. ZMIERZONE na żywo (odczyt PRZED kliknięciem Powrotu: `sys_032`, `orbiting`,
`galProgress` 0,9988, misja `interstellar_jump` żywa) ⇒ **zero związku z 272**.
⚠ **Hipoteza „brak `mission = null` w handlerze przylotu” została OBALONA źródłem:** `_tickInterstellar:2827-2832`
trzyma misję **z projektu** (komentarz: „nadal na misji — gracz musi zdecydować co dalej”), a jest ona po przylocie
**NOŚNA** — `_redirectInterstellarVessel:3050` wymaga `type === 'interstellar_jump' && phase === 'in_system'`, więc
wyzerowanie misji zabiłoby przekierowanie w nowym układzie. Defekt siedzi w ETYKIECIE:
`FleetPictureLogic.buildShipEntry:259-262` pyta w gałęzi misji **wyłącznie** o `phase === 'returning'`, po czym mapuje
`type` → `fleetPicture.activity.warp` — **bez terminu na `phase === 'in_system'`**. Kaskada `rozkaz > misja > stan
fizyczny` tłumaczy, czemu widział to tylko członek ODMÓWIONY (przyjęty ma rozkaz, jego etykieta wygrywa).
⚠ **Korekta powierzchni:** zgłoszono „Outliner”, ale `Outliner.js` **nie ma kolumny aktywności** i nie woła
`buildShipEntry`; producentami są `TacticalDock`, `FleetRegistryLogic` (K3), `MapLabelLogic`, `ThreeRenderer` —
**którą właściciel widział, NIEUSTALONE**. Cross-ref: obserwacja z gate’u **266 §1** opisywała statek REALNIE
w tranzycie (odczyt PRAWDZIWY, dwie osie); tu statek już przyleciał, więc ta sama etykieta jest FAŁSZEM.

### ⚠ RODZINA 255 — DOMKNIĘTA W CAŁOŚCI

`147` · `154` · `263` · `255` (leg D + wiersze 8/9) · `256` · `266` · `267` · `273` · `166 (ENGAGE)` · `268` · `275` ·
`270` · `269` · **`272`**.

**NASTĘPNE (plan właściciela):** pivot **D4-slim → W4-simple** (Wojna i Pokój uproszczona), z żywymi 🔴 **195** /
**95** / **65** / **193** oraz pomiarem **216** jako przerywnikami. Otwarte drobne z arca: **227**, **278b**, **279**,
**280**, **281**, **282**.

---

<!-- CLAUDE.md L5975–6081 -->
## AKCJE OBCE PO SKOKU WARP — Findingi 578 + 579 + 580 (save **v101 bez migracji**, bramka (a)–(f) PASS — ZAMKNIĘTE 2026-10-30, commit `56e66b4`)

Audyt fazy A, decyzje D-1…D-5 / A1 / A2, wykonanie i bramka: `docs/audit/POST_WARP_FOREIGN_ACTIONS_AUDIT.md`; rejestr
`docs/design/VESSEL_ORDERS_PLAN.md` §Findingi 578–582 (⚪ 581 i 🟠 582 otwarte; 121 rozpuszczony dla lotu na ciało).

**Jedno zdanie:** po skoku warp kolonizator i statek naukowy przy ciele w obcym układzie nie miały ani „Kolonizuj”, ani
„Recon”, bo akcje obce kluczował KSZTAŁT MISJI (`exploration` / `orbiting_body`), a jedynym żywym producentem tego
kształtu od 253 f-A (`5264a4b`) był ukryty wiersz zakładki Atlas.

⚠ **LEKCJA WIĄŻĄCA: akcje kontekstowe kluczuje PREDYKAT stanu statku, nigdy KSZTAŁT MISJI — a usuwając powierzchnię
„bo jest zamiennik”, ZMIERZ zamiennik.** `5264a4b` uznał usunięcie list ciał za „darmowe” dzięki dwóm drogom: klik ciała
na mapie taktycznej (wyłączona od `6b3590f`) i rozkaz ruchu d2 (kończy `mission = null`, czyli bez akcji obcych) —
**obie były martwe w chwili cięcia**, a pin f-3 `foreign_panel_slim_smoke` świecił zielono, bo wołał handler kliknięcia
WPROST (tej strefy żadna mapa nie rysuje).

**Trzy stany statku po skoku (zmierzone):** A — przylot (`interstellar_jump` / `in_system`, obrzeża) · **B** — po PPM
„Lecisz do planety” albo d2: `orbiting` + `idle` + `mission = null` + `dockedAt = ciało` (był ślepy zaułek) · C — trasa
Atlas (`exploration` / `orbiting_body`; działała zawsze). Backend był sprawny w każdym stanie; H1 („stary `systemId`”)
— martwa.

**Kształt:** NEW `src/utils/ForeignActions.js` — `foreignActionsBodyId(vessel, ctx)`: (a) stan C bez zmian (580: brak
`targetId` ⇒ `position.dockedAt`); (b) stan B dla statku gracza w służbie (`isInService` — rezerwa W2 odpada), przy
ciele (`planet` / `moon` / `planetoid`) WŁASNEGO układu, POZA śladem kolonii gracza. **Ślad PER STATEK (D-2 / A1):**
kolonia gracza (także placówka) w układzie ORAZ (`!needsSpaceportForVessel` ALBO `hasSpaceportAt`) — „czy TEN statek
może tu zadokować przy swojej kolonii”; stacje się NIE liczą. Kontekst wstrzykiwany (`foreignActionsContext(K)`; bez
`colonyManager` ⇒ `null` ⇒ stan B zamknięty). **Trzej konsumenci jednego predykatu:** `ShipPanelHudLogic` (:210),
`FleetManagerOverlay._drawRight` (panel orbity obcego ciała), `PlayerViability` (D-3 — bezczynny kolonizator przy
skolonizowalnym ciele z akcjami obcymi = żywa trasa; bez tego naprawa dawałaby fałszywy koniec gry).
⚠ D-2 nie jest ostrożnością: w układzie z dokowalną kolonią `_startForeignColonize` dałby darmowy zestaw startowy zamiast
normalnego startu. ⚠ **581:** dom bez portu (tak jest na starcie gry) + kadłub średni / duży ze stoczni stacji ⇒ akcje
obce w układzie macierzystym — A1 zostaje jak podpisane, trasa niezmierzona.

**579 (D-4):** „Pełny Skan” przy ciele bez siatki kolonii kończył się cichym `return` w `_completeFullScan` (siatka
istnieje tylko dla kolonii; `vessel:fullScanComplete` ma ZERO subskrybentów) ⇒ odmowa przy starcie i przy końcu, linia
Dziennika `fleet` / `warn`, jeden nowy klucz `vessel.reasonFullScanNoGrid`. `fleet.clusterSwitch` 🔭 → 🗺 (przycisk
przełącza kamerę, nie skanuje).

✅ **Otwarte z tego slice'u — ZAMKNIĘTE 2026-10-30 w `fa69ae8`** (sekcja „ZUŻYCIE STATKU POZA WALKĄ” niżej):
**582** — `vessel:docked` jest przeciążony jako sygnał „usuń sprite”
(`_startForeignColonize`, `destroyVessel`), a ma dwóch narratorów Dziennika ⇒ statek zużyty albo zniszczony „wylądował”
i „wrócił do bazy” (zmierzone na żywo przy bramce (a7) — dlatego `log(4)` nie pokazał linii „🏙 New colony”, która stoi
niżej). ⚠ Od 578 `_startForeignColonize` jest osiągalne naturalną drogą ⇒ rośnie ekspozycja **102** (POPy załogi
zablokowane na zawsze — surowe `_vessels.delete`) i **107** (`troop_bay`); naturalny wspólny slice z 582.

**Testy:** keeper `foreign_actions_smoke` **77/77** (fail-first **36/41** na `f1554c9` i `da9827c`; bateria 7 mutantów —
każdy zabity przez swoje piny) · `ai_capture_last_stand` T7 **48/48** · sondy `probe-post-warp-actions`,
`probe-foreign-footprint-d2`. Sweep **351/351** · `check-i18n` PASS (pl = en = 3400).
⚠ **Warsztat:** `GameCore` nie montuje MOS / `OrderService` / `FleetSystem` (bez `FleetSystem` „Dokuj tutaj” nigdy się
nie domyka); lot w układzie bywa długi (85-166 civY — budżet 80 civY dawał fałszywą czerwień); drugi `boot()` czyści
świat, więc każda grupa pinów ma własny świat; pin czerwony na kotwicy NIE jest „KONTROLĄ”.

---

## ZUŻYCIE STATKU POZA WALKĄ — jeden szew `destroyVessel` (Findingi 582 + 102 + 107, 584, 585; save **v101 bez migracji**, bramka testy 1–5 PASS — ZAMKNIĘTE 2026-10-30, commit `fa69ae8`)

Audyt fazy A, decyzje Q1–Q5, wykonanie i bramka: `docs/audit/VESSEL_CONSUMPTION_SEAM_AUDIT.md`; rejestr
`docs/design/VESSEL_ORDERS_PLAN.md` §Findingi 583–587 (582 — §578–582; 102 / 107 — `COLONY_OWNERSHIP_GUARD_PLAN.md`).

**Jedno zdanie:** usunięcie statku poza walką miało dwóch producentów z dwiema listami sprzątania — `destroyVessel`
(załoga i oddziały rozliczone, koloniści nie) i surowe `_vessels.delete` w `_startForeignColonize` (nic) — a obaj
„zdejmowali sprite”, emitując `vessel:docked`, z którego dwaj narratorzy Dziennika robili „wylądował” i „wrócił do bazy”.

⚠ **LEKCJA WIĄŻĄCA: usunięcie statku poza walką idzie przez JEDEN szew; `vessel:docked` nie jest zdarzeniem usunięcia.**
Nowy producent usunięcia woła `VesselManager.destroyVessel(id, { reason })` — nigdy surowe `_vessels.delete` — a słuchacz,
który ma zareagować na zniknięcie statku, słucha `vessel:removed` (poza walką) albo `vessel:wrecked` / `vessel:destroyed`
(walka), nie `vessel:docked`.

**Szew** — `destroyVessel(id, { reason = 'consumed', legacyDockedEmit = false })`: załoga zwalniana typowanie
(`_settleCrewOnLoss`, jak dotąd) → koloniści dołączają do PEŁNEJ kolonii gracza przy `position.dockedAt` (Q4 / **585**;
placówka, stacja i statek AI — bez zmian → **586**) → oddziały w ładowni giną `transport_lost` (Q3 — rezerwa) →
`vessel:removed { vesselId, vessel, reason, atBodyId }`. Powody: `colonized` (kolonizacja normalna i obca),
`outpost_upgraded`, `dismantled`, `colony_lost` (statki niszczone PRZED zmianą właściciela — koloniści zostają
z kolonią), `consumed` (`consumeShip`; domyślny). Jedno źródło powodów i linii Dziennika: NEW `src/utils/VesselRemoval.js`
(zero importów; 🏙 i 🗑 zostają, nowa linia wyłącznie dla `colony_lost` — `log.vesselLostWithColony` PL+EN). Słuchacze:
`ThreeRenderer` (sprite + fokus, bez pulsu doku), `OrbitalSpaceSystem` (orbita), `UIManager` (narrator).

⚠ **Katastrofy misji (górnicza, kolonizacyjna, zwiadu) to JAWNY wyjątek** — `legacyDockedEmit: true` zachowuje dawne
`vessel:docked` i pomija kolonistów, bo pytanie „kto ginie w katastrofie” należy do **583** 🔴 (zmierzone: dom
7,6 → 0,3 POP, choć nikt z nich nie wsiadł; szansa bazowa 2 %; następny w kolejce). Nowy wołający dostaje
`vessel:removed` z samej domyślności.

**584 — ścieżka WZORCOWA też gubiła POP.** Trzy `unlockPops(exp.crewCost = 8, undefined)` na ścieżkach SUKCESU
`MissionSystem` (relikt `be24960`) zdejmowały nietypowo z worka blokad domu: zmierzone 2,6 → 0 przy poprawnym 1,9
(załoga okrętu w służbie + garnizon + zwrot oddziału). Usunięte (Q1 = a) — księga załogi statku jest jedyną księgą.
⚠ **Bez świadków wyglądało to poprawnie** (kontrola 0,4 → 0): przy pomiarze wspólnej księgi kładź niezależne
wpisy-świadki i rejestruj wywołania (memory `witness-entries-expose-untyped-ledger-ops`). Zlecenie kazało „odczytać
D-2 / D-3 z działającej ścieżki” — **ścieżka wzorcowa jest hipotezą**, dopóki jej nie zmierzysz.

**Q3 — rezerwa, nie wysiadanie (→ 586):** ścieżka wyładunku transportowca kładzie jednostkę na współrzędnych z ciała
ZAŁADUNKU (Finding 349), siatki ciał mają różne rozmiary, a upgrade placówki nie ma `colony.grid` ⇒ wysiadanie wymaga
rozmieszczenia na mapie celu (nowa mechanika).

**Stare zapisy:** `VesselManager.repairCargoOrphansAfterLoad()` w bloku wczytania `GameScene` (po odtworzeniu jednostek
naziemnych) — sierota 107 na kolonii właściciela wysiada (współrzędne z tej samej mapy), inna ginie; wynik
w `_lastCargoOrphanRepair`. Blokady 102 już wyciekłe zostają (W2 decyzja 8) — żywy przypadek potwierdzony w grze przy
bramce.

**Testy:** keeper `vessel_consumption_smoke` **82/82** (fail-first **42/40** na `37cb526`; bateria 8 mutantów — każdy
zabity) · sąsiedzi bez zmian (`foreign_actions` 77, `ai_capture_last_stand` 48, `ship_panel_hud` 127,
`system_scope_orders` 31, keepery W2) · sweep **352/352** (także czysty checkout `fa69ae8`) · `check-i18n` PASS
(pl = en = 3401). Bramka: kolonizacja obca, normalna ze świadkami, rozbiórka, kontrola bojowa, naprawa 107 — PASS.
⚠ **Granica dowodu:** okablowanie `ThreeRenderer` / `UIManager` / `GameScene` pinowane źródłowo; linia `colony_lost`
niewidziana w grze.

**Otwarte z tego slice'u:** 🔴 **583** · 🟠 **586** · ⚪ **587** (linia 🗑 podaje id kadłuba zamiast nazwy statku —
narrator szuka `SHIPS[shipId]`; PRE-EXISTING). Obserwacja bez numeru: wrak zachowuje `serviceState 'active'` —
przesłanka zamkniętego **425**.
