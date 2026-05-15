# M4 PHASE P2 — COMPLETE (mega-snapshot)

**Phase tag:** `m4-p2-complete` (commit `8ee3426`) — 2026-05-15
**Phase predecessor:** `m4-p1-complete` (`fa045d8` — M4 P1 closure)
**Phase successor:** Phase P3 (tick-based deep-space combat + weapon ranges) — start jutro
**Save version:** v69 → **v70** (uiPrefs + vessel.lastBattleId/Year migracja)
**Plan:** `C:\Users\Komputer\.claude\plans\ok-zacznij-plan-p2-precious-turtle.md`
**Smoke tests:** `tmp_m4_p2_smoke.mjs` (30/30 PASS) + `tmp_m4_p1_smoke.mjs` regression (33/33 PASS)

---

## Phase P2 = situational awareness layer

Phase P2 dostarczył **warstwę świadomości sytuacyjnej** — po P1 gracz *wiedział że* wróg jest, ale nie *gdzie dokładnie* i nie miał quick-glance widoku floty. P2 dorzucił radar sensorów, intel-gated ghost rendering, strategiczną mapę galaktyki, quick-access do wraków + battle history i Tab navigation flotą.

```
[m4-p2-complete = 8ee3426]                    ← Phase P2 close
m4-commit-p2-6-migration-tests ✓ (razem z P2-5 w jednym commicie)
m4-commit-p2-5-tab-cycling     ✓ (razem z P2-6)
m4-commit-p2-4-wraki-polish    ✓ 07b2c3d  (6 plików, +114/-4)
m4-commit-p2-3-minimap         ✓ d51184c  (5 plików, +310 NEW GalacticMiniMap)
m4-commit-p2-2-enemy-ghosts    ✓ 4c28815  (1 plik, +143/-8)
m4-commit-p2-1-sensor-overlay  ✓ 082b1cd  (6 plików, +190/-1)
[m4-p1-complete = bfe397d]                    ← Phase P2 startuje stąd
```

**Total Phase P2:** 5 commitów (P2-5 + P2-6 łącznie), 7 plików zmienione + 2 NEW (GalacticMiniMap.js, tmp_m4_p2_smoke.mjs), ~820 LoC delta.

---

## P2 commit-by-commit

### **P2-1 — Sensor overlay (radar rings)** ✓
`m4-commit-p2-1-sensor-overlay` (082b1cd)

- **Files:** 6 plików, +190/-1 LoC (GameConfig +15, ThreeRenderer +149, BottomBar +20, main +5, i18n × 2)
- **NEW field:** `_sensorRingMeshes` Map; nowa metoda `_syncSensorOverlay` w ThreeRenderer
- **Dostarcza:** Cyan ring `SENSOR_LOCK_AU=0.3` wokół własnych vesseli + yellow ring `ObservatorySystem.getVesselDetectionRangeAU(colony)` (clamp 35 AU dla Lv5∞) wokół kolonii. Wzorzec 1:1 z `_syncPredictionCones` (Map cache, mark&sweep, dispose). Hooki: `physics:updated` + `vessel:positionUpdate` + `ui:sensorOverlayToggle`. BottomBar menu row "Radar" flipuje `window.KOSMOS.uiPrefs.sensorOverlayVisible`.
- **Constants:** `SENSOR_LOCK_AU = 0.3`, `RUMOR_FADE_YEARS = 10` (preview P2-2)
- **Flags ON:** `m4SensorOverlay`, `m4EnemyGhosts`, `m4MiniMap` (rollback do regresji)
- **Test ręczny:** ☰ MENU → Radar → cyan ring na frigaty + yellow na home colony, persistence w runtime (save persistence przyszła w P2-6)

### **P2-2 — Enemy ghosts intel-gated rendering** ✓
`m4-commit-p2-2-enemy-ghosts` (4c28815)

- **Files:** 1 plik, +143/-8 LoC (ThreeRenderer)
- **NEW methods:** `_applyVesselIntelVisibility(vessel, entry)` + `_applyVesselOpacity(entry, opacity)`
- **Dostarcza:** Per wrogi vessel, na bazie `IntelSystem.getVesselContact(vId).quality` wybiera rendering: **unknown** hidden / **rumor** zamrożony w `positionLastKnown` z opacity `0.3 × fade(yearsAgo/RUMOR_FADE_YEARS)` (≤0.05 → hidden) / **contact** opacity 0.5 / **detailed** 1.0 + routeLine. Detection override: obserwatorium widzi TERAZ → bump z unknown/rumor do contact.
- **Material handling:** `_origOpacity` cache per material, restore przy upgrade quality. Sprite (fallback) i Group/Mesh (GLB model) — oba pathy.
- **Hook points:** `_syncVesselPositions` per-vessel, `intel:vesselContactChanged` re-apply, `vessel:detectionChanged` deleguje do helpera, initial apply po `_vessels.set` w `_addVesselModel3D` + `_addVesselSpriteFallback`
- **Test ręczny:** spawnEnemyAttack → wróg invisible (unknown) → wjeżdża w radar → contact (50% opacity) → wlatuje w proximity 0.3 AU → detailed (100% + trasa) → odlatuje poza radar → rumor (cyan ghost z fade)

### **P2-3 — Galactic mini-map (klawisz M)** ✓
`m4-commit-p2-3-minimap` (d51184c)

- **Files:** 5 plików, +310 LoC (GalacticMiniMap.js NEW 271, OverlayManager +1, UIManager +2, i18n × 2)
- **NEW:** `src/ui/GalacticMiniMap.js` — Canvas overlay top-right za Outlinerem ~260×280 px
- **Dostarcza:** Per-frame re-read galaxyData/EmpireRegistry/Diplomacy/Intel (bez cache, ETA live). Imperia filter `IntelSystem.isAtLeast(empireId, 'rumor')`. Hostility color: zielony 0-30 / żółty 31-70 / czerwony 71-100. Strzałki flot `empire.fleets[].destSystemId` z ETA label. Klik systemu → `minimap:systemClicked` (M5 multi-system hook). Home accent z pierścieniem w centrum. Auto-scale na max dystans (+15% bufor).
- **Keymap:** `'m': 'minimap'` w OverlayManager
- **UX known issue:** brak tooltip hover, brak labelów nazw systemów — backlog M4 P3+
- **User comment (post P2-3):** "nie wiem co ta mapa M ma pokazywać? Pokazuje moją planetę i jakieś jedno zielone kółko" — wyjaśniliśmy że minimap to **strategiczna mapa galaktyki** (inter-system fleet), nie lokalny zoom sys_home. Decyzja: lecimy z P2-4, UX polish na potem.

### **P2-4 — Wraki polish (K + fly-to + battle report)** ✓
`m4-commit-p2-4-wraki-polish` (07b2c3d)

- **Files:** 6 plików, +114/-4 LoC (FleetManagerOverlay, OverlayManager, VesselManager, WarSystem, i18n × 2)
- **OverlayManager:** `_keyMap` obsługuje obiekty `{id, opts}` obok stringów. Klawisz `K` → `fleet` z `focusSection='wreck'`. `handleKey`: drugie wciśnięcie z opts re-applikuje focus (nie zamyka).
- **FleetManagerOverlay:** `open(opts)` accept `focusSection`, store w `_pendingFocusSection`. Pierwszy draw oblicza scroll offset (suma poprzednich sekcji), auto-select pierwszy element + emit `vessel:focus` (kamera 3D fly-to). Klik vessel emit `vessel:focus`. Selected wrak row expand o 36px z battle report (rok, A:N vs B:N, winner) — query `WarSystem.getBattleRecord(vessel.lastBattleId)`.
- **VesselManager:** `vessel.lastBattleId/lastBattleYear` serialize/restore round-trip + `battle:resolved` listener stampuje `participantA/B.vesselIds[]` na wszystkich uczestnikach.
- **WarSystem:** publiczne `getBattleRecord(battleId)` (read z `gameState.battles`).
- **Fly-to deep-space wraki:** entry.sprite.position jest już w wreckLocation (M2a kontrakt), więc istniejący `vessel:focus` handler w ThreeRenderer (line 670+) lata kamerą do `pos.x, pos.z, pos.y`.
- **Test ręczny:** simulateBattleRetreat → wrak deep-space → K → fleet+wrak focus + battle report w expanded row.

### **P2-5 + P2-6 — Tab cycling + save v70 + tests + docs** ✓
`m4-commit-p2-5-tab-cycling` + `m4-commit-p2-6-migration-tests` (oba na commicie `8ee3426`)

- **Files:** 7 plików, +416/-13 LoC (UIManager, GameScene, SaveMigration, SaveSystem, CLAUDE.md, smoke × 2)
- **P2-5 Tab cycling:**
  - `UIManager.cycleSelectedVessel(direction)` — filter `!isWreck && !isEnemyVessel`, sort `String(id).localeCompare`, wraparound + null-start (forward=first, backward=last). Emituje `vessel:focus` dla fly-to.
  - GameScene keydown: Tab/Shift+Tab z `preventDefault`, skip gdy `input`/`textarea`/`contentEditable` target (modal/form aware).
- **P2-6 Save v69→v70:**
  - `SaveMigration.CURRENT_VERSION` 69 → 70 + `_migrateV69toV70`:
    - `uiPrefs.sensorOverlayVisible` default false
    - `uiPrefs.miniMapVisible` default false
    - per vessel: `lastBattleId/lastBattleYear` null
  - `SaveSystem.save()` serializuje `window.KOSMOS.uiPrefs`
  - `GameScene.restore` path: restoruje `savedData.uiPrefs` do `window.KOSMOS.uiPrefs`
- **Smoke tests:**
  - `tmp_m4_p2_smoke.mjs` (NEW): **30/30 PASS** — T1 migration (5), T2 feature flags + constants (5), T3 ghost opacity math (5), T4 tab cycle filter/sort/wrap (5), T5 hostility colors + ETA (5), T6 i18n PL/EN (5)
  - `tmp_m4_p1_smoke.mjs`: regression update do v70 expected (**33/33 PASS**)
- **CLAUDE.md:**
  - save v69 → v70 + Milestone 4 P2 block (6 atomic commitów, smoke tests status, known issues, critical files mapa)
  - FEATURES line: dodane `m4SensorOverlay/m4EnemyGhosts/m4MiniMap` + `SENSOR_LOCK_AU=0.3` + `RUMOR_FADE_YEARS=10`

---

## Architektura — co przyjechało nowego

### Nowe pliki
- `src/ui/GalacticMiniMap.js` (271 LoC) — Canvas overlay top-right
- `tmp_m4_p2_smoke.mjs` (250 LoC) — 30 cases pure-logic

### Rozszerzone pliki
- `src/renderer/ThreeRenderer.js` — `_syncSensorOverlay` + `_applyVesselIntelVisibility` + `_applyVesselOpacity` (+292 LoC łącznie)
- `src/ui/FleetManagerOverlay.js` — focusSection + battle report w expanded wrak
- `src/ui/OverlayManager.js` — `{id, opts}` keymap form
- `src/ui/BottomBar.js` — Radar menu row
- `src/systems/VesselManager.js` — battle:resolved listener + lastBattleId/Year serialize
- `src/systems/WarSystem.js` — `getBattleRecord(battleId)` public
- `src/systems/SaveMigration.js` + `SaveSystem.js` — uiPrefs migration + persist
- `src/scenes/GameScene.js` — Tab keydown + uiPrefs restore
- `src/scenes/UIManager.js` — `cycleSelectedVessel`
- `src/main.js` — uiPrefs init in window.KOSMOS
- `src/config/GameConfig.js` — 3 nowe FEATURES + 2 constants
- `src/i18n/{pl,en}.js` — menu.radar, minimap.*, fleet.battle*

### EventBus dodatki (M4 P2)
- `ui:sensorOverlayToggle { visible }` — BottomBar → ThreeRenderer
- `minimap:systemClicked { systemId }` — GalacticMiniMap → future M5 hook
- Wykorzystane (existing): `physics:updated`, `vessel:positionUpdate`, `intel:vesselContactChanged`, `vessel:detectionChanged`, `battle:resolved`, `vessel:focus`

---

## Test ręczny (real-flow GREEN)

1. **F5 → Power Test** → starting frigate ✓
2. **☰ MENU → Radar** → cyan ring 0.3 AU wokół frigaty + yellow ring (obserwatorium range) wokół home colony ✓
3. **Klawisz M** → minimap top-right (home accent + obce imperia z hostility colorami) ✓
4. **`KOSMOS.debug.spawnEnemyAttack()`** → wróg w sys_home → ghost rendering po intel quality ✓
5. **`KOSMOS.debug.simulateBattleRetreat()`** → wrak deep-space ✓
6. **Klawisz K** → fleet z scroll do sekcji WRAKI + auto-select + kamera fly-to + battle report w expanded row ✓
7. **Tab / Shift+Tab** → cycling przez własne nie-wrak vessele (skip gdy input/modal aktywny) ✓
8. **Save → F5 → Load** → uiPrefs (radar/minimap) + per-vessel lastBattleId persistowane ✓

User confirmation: **"ok działa wszystko"**.

---

## Known issues deferred do M4 P3

- **MiniMap UX** — brak tooltip hover, brak labelów nazw systemów (decyzja: lecimy z P2-4, UX polish na potem)
- **MiniMap scope** — pokazuje TYLKO inter-system fleet (galaktyka), nie lokalne sys_home vessele (te są w głównej mapie 3D — by design, ale wymaga lepszego onboardingu UX)
- **3D map LPM nie wybiera vessela** — Tab cycling jako alternatywa (deferred z M4 P1)
- **Endurance unfreeze + fuel reform** — defer do M4 P4
- **War declared popup modal** — defer M5

---

## Next: M4 P3 — Tick-based Deep-Space Combat + Weapon Ranges

**Najgrubsza faza M4** (~2 tygodnie effort per plan `clever-forging-ember.md` §P3).

Cel: real-time tick-based combat zamiast obecnego `BattleSystem.resolveBattle`
(snapshot resolver). Dodaje weapon ranges, projektylki/laser visualization,
dynamic engagement (vessele strzelają z dystansu zamiast wszystko-przy-0.15-AU).

Start: jutro (2026-05-16).
