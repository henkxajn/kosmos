# M3 P1.4 — COMPLETE (snapshot delta vs P1.3.5)

**Tag:** `m3-commit-p1-4-complete` (commit `df9175c`)
**Predecessor:** `m3-commit-p1-3.5-tactical` (post-fix `3eccfb2`)
**Save version:** v67 (bez zmian — efemeryczne canvas state)

## Co to za commit

P1.4 dodaje **UI hookup do istniejącego MOS.cancelOrder API** — Cancel order button per vessel selected w RIGHT detail panel FleetOverlay. Plus EventLog wpis o anulowaniu. Plus status display dla orderów (auto-hide po cancel przez `_drawMovementOrderLabel:4037` early-return).

**Najprostszy P1 commit (1 sesja, 0 post-fix).**

## Stack zmian (5 plików, 242 LoC)

```
df9175c  M3 P1.4: Cancel order button + FleetOverlay extensions    ← HEAD + tag
3eccfb2  M3 P1.3.5 post-fix #1: 2D worldPoint + mapa 3D PPM disable
0c720d9  M3 P1.3.5 base: Tactical map mouse handlers retarget
84c6fa8  docs: M3 — EventLog access pattern clarification
f2b7e75  FleetOverlay: czarne tło + raycasting block przez overlay
cca10f3  M3 P1.3 base
```

```
src/ui/FleetManagerOverlay.js              +46    EXTEND (button render + dispatch case)
src/utils/MovementOrderCancellation.js     +45    NEW (pure helper — tryCancelVesselOrder)
src/i18n/pl.js                             +2     EXTEND (cancelOrder, cancelOrderEntry)
src/i18n/en.js                             +2     EXTEND (same)
tmp_m3_p1_4_cancel_test.mjs                +147   NEW (T1-T3, 25 cases)

Total: 242 LoC dodane (5 plików)
```

## Verifications + Decisions

### V1-V8:

| V | Wynik | Off-spec / discoveries |
|---|-------|------------------------|
| V1 | `MOS.cancelOrder(vesselId, reason='player') → boolean` | **OFF-SPEC**: prompt zakładał `{ok, reason}`. Cancelable tylko gdy `status='active'`. Po cancel: `status='cancelled'`, blockReason ustawiony, NIE staje się null |
| V2 | 4 statusy: `active/cancelled/completed/blocked` | Order zachowywany po cancel, NIE staje się null |
| V3 | Button w RIGHT detail panel (line 2896, pod `_drawMovementOrderLabel`) | **OFF-SPEC vs prompt**: LEFT list rows ciasne (46-52px) + kolizja z selection click → RIGHT panel czystszy |
| V4 | Hit zone `'cancel_movement_order'` (unique vs cancel_loop/config/pending_ship) | Zone shape `{x, y, w, h, type, data: {vesselId}}` |
| V5 | Channels: `fleet, civ, life, combat, trade, intel, system` | **OFF-SPEC**: `'orders'` NIE istnieje. Fallback `'fleet'` (rocket icon) |
| V6 | `_drawMovementOrderLabel` (M1 §8.4) już realizuje "status badge" | **REDUNDANCY DISCOVERY**: pure helpery `getStatusBadgeText/Color` z prompta są zbędne |
| V7 | LEFT vessel zone vs RIGHT detail button = zero kolizji | D5 (iii) free — selection nieruszona |
| V8 | POI rendering w tactical | Deferred do P2.1 |

### Decyzje (D1-D7):

- **D1: NO FEATURES gate** — cancel = odwrotność issue, nie destruktywne
- **D2: Pure helper** `MovementOrderCancellation.js` (off-spec — początkowo planowane inline, mid-impl refaktor dla L1/L18 testowalności)
- **D3: N/A** (status badge realizuje `_drawMovementOrderLabel`)
- **D4: status='cancelled'** (decyzja MOS, nie nasza)
- **D5: (iii) keep selection, no flash** (label auto-hides z early-return)
- **D6: SKIP** POI rendering (P2.1)
- **D7: SKIP** mini-exposures KOSMOS.gameConfig/gameScene (osobny commit)

## Off-spec discoveries (3 + 1 obserwacja)

1. **V1: MOS.cancelOrder zwraca boolean** (nie `{ok, reason}`) — prompt zakładał błędnie
2. **V5: channel 'orders' NIE istnieje** w eventLogSystem — fallback `'fleet'`
3. **V6: status badge już zrobione** — `_drawMovementOrderLabel` od M1 §8.4 — pure helpers redundant
4. **D2: Pure helper extracted mid-impl** — Claude Code zauważył że dispatch case `'cancel_movement_order'` w `_handleHit` byłby nietestowalny (zależy od `window.KOSMOS`). Wyciągnął do pure helpera z params `{mos, vesselManager, eventLogSystem, t}`. **Lepsze niż mój prompt.**

## Test results

```
tmp_m3_p1_4_cancel_test.mjs              25/25 PASS
  - T1 happy path (5 cases): mos.cancelOrder called, EventLog push z proper payload
  - T2 odrzucenia (12 cases): vessel not found, no order, status !== 'active', mos missing, etc.
  - T3 defensive (8 cases): null params, missing fields, schema robustness (objectContaining L24)

M3 P1 cumulative:
  P1.1 menu          17/17  ✓
  P1.2 raycaster     20/20  ✓
  P1.3 orders        54/54  ✓
  P1.3.5 tactical    19/19  ✓
  P1.4 cancel        25/25  ✓
  ─────────────────────────
  M3 P1: 135/135 GREEN ✓
  
  + M2b regression: 81/81  ✓ (last full check w P1.3 close)
  ──────────────────────────────────────────────
  CUMULATIVE: ~216/216 GREEN ✓✓✓
```

## Real-flow scenariusze A-G (Filip, ~15 min including diagnostyka)

| Scen | Wynik | Notatki |
|------|-------|---------|
| A | PASS | Issue moveToPoint → button widoczny "[✕ Anuluj rozkaz]" pod label → klik → status='cancelled', blockReason='player', label znika, button znika, EventLog wpis (channel='fleet'), selection unchanged |
| B | PASS | Button dynamiczny — pojawia się/znika z order existence |
| C | PASS | Po cancel selection nieruszona (D5 iii) |
| D | PASS | `KOSMOS.debug.cancelOrder('v_X')` (M1 devtools) działa, `blockReason='debug'` (lub 'player' zależnie od reason arg) |
| E | PASS | Cancel patrol działa identycznie jak moveToPoint |
| F | PASS scope, KNOWN ISSUE gameplay | Multiple cancels OK z perspektywy danych (status='cancelled', EventLog wpisy). ALE vessel.position.state pozostaje 'in_transit', velocity niezerowa — **vessel kontynuuje ruch fizycznie**. NIE jest to P1.4 bug — pre-existing M1 issue (MOS.cancelOrder ↔ VesselManager integration gap) |
| G | PASS scope, KNOWN ISSUE gameplay | Regression: ColonyOverlay + tactical map orders zachowane. "Po skasowaniu orderu statek dalej leci" — **realny pre-existing bug**, nie optical illusion (moja błędna interpretacja w real-flow review). Diagnostyka pokazała: button → _handleHit dispatched → tryCancelVesselOrder → MOS.cancelOrder → status='cancelled' ✅. Ale vessel.position.state nadal 'in_transit' + velocity niezerowa. Vessel leci dalej. P1.4 ujawniło bug który istniał od M1 (devtools cancel-only) |

**7/7 PASS dla P1.4 scope** (button + EventLog + status display). **Ujawniono pre-existing M1 bug** w MOS↔VesselManager integration (P1.4 jako rentgen). **0 post-fix iteracji P1.4.** Investigation #2 + fix w osobnym commit (P1.4.5 lub similar).

## Lekcje z P1.4 (kandydaci do M3 lessons learned)

### L34 — Existing code może już realizować feature → grep PRZED założeniem helpera

V6 ujawniło że `_drawMovementOrderLabel` (M1 §8.4) już renderuje status badge dla orderów (z auto-hide gdy `cancelled/completed`). Mój prompt zakładał stworzyć nowe pure helpery `getStatusBadgeText`, `getStatusBadgeColor`. Wszystko **redundant** — istniejący kod robi to lepiej.

**Plan mode mandate dla P1.5+:** dla każdego feature który "rysuje X" / "wyświetla Y" / "trackuje Z" — `grep` w istniejącym kodzie czy nie ma już realizacji. Pure helper powinien być **dodaniem missing logic**, nie **dublowaniem istniejącej**.

Dokładnie ten sam pattern co L29/L30 (eventLogSystem już istnieje, nie zakładać `gameState.get('eventLog')`). Generalizacja: **PRZED założeniem 'X nie istnieje, trzeba stworzyć' — `grep` literalnie nazwę X w src/.**

### L35 — Cancel/undo features ujawniają state lifecycle gaps (P1.4 jako rentgen)

P1.4 user-facing cancel button ujawnił **pre-existing M1 bug**: `MOS.cancelOrder` ustawia `status='cancelled'` ale **NIE zatrzymuje** vessel motion (`position.state` pozostaje 'in_transit', velocity niezerowa, vessel leci dalej). Bug istniał od M1 (`KOSMOS.debug.cancelOrder` to czysty wrapper na `MOS.cancelOrder`), ale **nikt go nie testował przez UI** — devtools używały głównie do dev/integration testów na poziomie danych.

**Lekcja:** Cancel/undo features są **first chance** żeby zauważyć gap między *"data state cancelled"* a *"physics state stopped"*. W innych projects to mogą być synonimy (jeden układ scalony), w KOSMOS są rozdzielone (MOS data + VesselManager physics).

**Plan mode mandate dla cancel/undo features:** real-flow procedure musi cytować **end-to-end flow** w diagnostyce:
1. Callsite UI (button) → 2. Pure helper/adapter → 3. System data update (MOS.status) → 4. Physics state update (VesselManager.position.state, velocity) → 5. Rendering refresh (canvas redraw)

Brak któregokolwiek kroku = ghost behavior (data zmienia się, physics nie reaguje, gracz widzi `cancelled` w EventLog ale vessel leci dalej).

### L36 — Pure helper extracted mid-impl jest valid signal, nie scope creep

D2 plan zakładał inline w `_handleHit`. Claude Code podczas implementacji zauważył że to byłoby **nietestowalne** (zależy od `window.KOSMOS.movementOrderSystem`, etc.). Refaktorował do pure helpera `MovementOrderCancellation.js` z params injection.

**To jest GOOD architectural decision**, nie scope creep. Plan mode V_extra przeoczył L1/L18 implication. Mid-impl refaktor zachowany w atomic commit (`+45 LoC` osobny plik).

**Plan mode mandate:** akceptować mid-impl refaktor pod warunkiem że (1) zachowuje atomic commit, (2) obstaje przy testowalności, (3) jest udokumentowany w raporcie jako off-spec discovery. Nie blokować aprobaty bo "nie było w planie" — to L17 w akcji.

### L37 — Diagnostyczne dane > moja interpretacja (autorefleksja)

W real-flow review P1.4 **dwukrotnie** zinterpretowałem Filip's obserwację F/G ("vessel leci po cancel") jako "optical illusion" lub "enemy AI vessel confusion". **Filip's diagnostyka pokazała że to był realny bug** w MOS↔VesselManager integration.

**Pattern błędu:** szybkie zamknięcie diagnostyki na podstawie **jednej** danej (jedna sesja gdzie vessel orbituje stabilnie) zamiast spojrzenie na **wzór** (Filip's konsekwentne raportowanie problemu w F i G + kolejna diagnostyka).

**Plan mode mandate:** gdy real-flow odkrycie jest **konsekwentnie raportowane** przez Filipa, **NIE zamykać** diagnostyki na pierwszy pasujący alternatywny model. Zamiast tego: druga diagnostyczna iteracja z większą granularnością (vessel name, state, velocity, status — 4 osobne pola, nie agregowane). Jeśli druga iteracja **konfirmuje** obserwację Filipa → real bug. Jeśli **odrzuca** → false alarm.

W P1.4 retrospektywnie: gdyby pierwsza diagnostyka cytowała `vessel.position.state` + `velocity` + `status` razem, alarm "MOS cancelled ALE physics in_transit" pojawiłby się **natychmiast**. Skróciłoby diagnozę o 30 minut.

## Konkretne diff highlights

### `MovementOrderCancellation.js` (NEW, pure helper)

```js
// Signature inferred z dispatch case:
export function tryCancelVesselOrder(deps, vesselId) {
  const { mos, vesselManager, eventLogSystem, t } = deps;
  // 1. Validation: vessel exists, has movementOrder w status='active'
  // 2. Capture orderType PRZED cancel (dla EventLog payload)
  // 3. mos.cancelOrder(vesselId, 'player') → boolean
  // 4. Jeśli ok → eventLogSystem.push({text: t('fleet.cancelOrderEntry', name, type), channel: 'fleet', severity: 'info', entityRef: vesselId})
}
```

Testowalne offline z mock deps. 25 cases pokrywają happy path / odrzucenia / defensive / payload schema.

### `_drawCancelOrderButton` (FleetManagerOverlay.js +22)

```js
// Render button [✕ Anuluj rozkaz] gdy status='active'
// Czerwony border (THEME.danger), centered text
// Hit zone 'cancel_movement_order' z {vesselId} data
// Returns cy + btnH + 6 dla layout flow
```

### `_handleHit` case (+12 lines)

```js
case 'cancel_movement_order': {
  tryCancelVesselOrder({
    mos: window.KOSMOS?.movementOrderSystem,
    vesselManager: window.KOSMOS?.vesselManager,
    eventLogSystem: window.KOSMOS?.eventLogSystem,
    t,
  }, zone.data.vesselId);
  break;
}
```

1-line dispatch, czysto wkomponowane w existing switch.

### Wywołanie w `_drawSelectedVesselDetail` (1 line delta, ~2895-2898)

```js
cy = this._drawMovementOrderLabel(ctx, x, cy, w, pad, vessel);
cy = this._drawCancelOrderButton(ctx, x, cy, w, pad, vessel);  // ← NEW
```

## Pre-existing issues + nowe (M3 known issues, akumulowane)

### Z poprzednich snapshots:
- `(⚓ undefined)` w EventLog dla dock orders
- Vessele za małe sprite na mapie 3D (gameplay UI limitation)
- `KOSMOS.gameScene` undefined
- `KOSMOS.gameConfig` undefined (workaround: `(await import(...)).GAME_CONFIG`)
- `planet-canvas` display:none w CSS but runtime aktywny
- Brak dock orderType
- Brak "out of range" UI feedback
- POI sprite rendering w tactical map nie istnieje (P2.1 candidate)
- Vessel target marker na 3D map nie pokrywa kliku — N/A po P1.3.5 (mapa 3D disabled)

### Nowe z P1.4:
- **🚨 PRE-EXISTING M1 BUG ujawniony przez P1.4:** `MOS.cancelOrder` ustawia `vessel.movementOrder.status='cancelled'` ale **NIE zatrzymuje** vessel motion. `position.state` pozostaje `'in_transit'`, velocity niezerowa, vessel kontynuuje ruch w VesselManager._tick. **Investigation #2 + fix planned w osobnym commit (np. m3-commit-p1-4.5-cancel-stops-vessel).** Bug istniał od M1 (`KOSMOS.debug.cancelOrder` to czysty wrapper, nie testowano przez UI dopóki P1.4).
- **Devtools `KOSMOS.debug.cancelOrder('v_X')` NIE wywołuje EventLog push** — bezpośredni call do MOS, omija `_handleHit` case. **EXPECTED BEHAVIOR** (devtools dla raw testowania), nie bug. Jeśli kiedyś chcemy EventLog wpis z devtools — dodać wrapper `KOSMOS.debug.cancelOrderWithLog(vesselId)` w P1.5 lub M4.
- **Enemy AI vessels w Combat Sandbox** ciągle wydają orders (z EventLog `🚀 Łowca Alfa → ?`). Player nie może je cancelować (nie selected). To **gameplay-as-designed**, nie bug. Confused Filipa w F/G real-flow scenario (a początkowo i mnie — L37).

## Procedural lessons (do M3 workflow notes)

P1.4 = **najszybszy P1 commit**:
- Plan mode: ~30 min (V verifications + decyzje)
- Implementation: ~15 min Claude Code
- Real-flow: ~15 min (z 30-min diagnostyką false alarm w F/G)
- **Total: 1 sesja, 0 post-fix.**

vs poprzednie:
- P1.1: 1 sesja, 0 post-fix
- P1.2: 4 sesje, 3 post-fix
- P1.3: 2 sesje, 0 post-fix  
- P1.3.5: 3 sesje, 1 post-fix
- P1.4: 1 sesja, 0 post-fix

**Średnia: 1 post-fix per commit, 2.2 sesje per commit.** P1.4 jest below średnia. **L34/L35/L36 odkryć = bardzo bogata sesja mimo niskiego post-fix count.**

## Next: P1.5

**Universal tooltip system + raycaster reuse z P1.2.**

Krytyczne lekcje L1-L36 do plan mode P1.5:

- **L1** — smoke ≠ real-flow. Tooltip hover = canvas/DOM, nie offline test
- **L2** — bilingual strings PL/EN
- **L8** — XZ plane (jeśli tooltip na mapie 3D) lub XY (jeśli tactical map)
- **L9** — extend existing handlers (mouse hover może już istnieć)
- **L18** — pure module split dla tooltip data lookup
- **L20** — V_extra cytuj real entity defs dla tooltip content (vessel.name, planet.name, etc.)
- **L22** — runtime check tooltip positioning (boundary, viewport edge)
- **L24** — smoke fixtures objectContaining
- **L25** — F5 między scenariuszami
- **L26** — exact API signatures w devtools
- **L28** — gameplay intent confirm: tooltip na **tactical map** czy **mapa 3D obu** (D8 dla P1.5)
- **L29/L30** — system exists check (czy istnieje już TooltipManager lub similar?)
- **L31** — multi-shape pure helpers
- **L32** — target-check vs stan
- **L33** — tag po real-flow
- **L34** — existing code może już realizować feature (CRITICAL — P1.5 może odkryć że tooltip już jest częściowo zrobiony)
- **L35** — cancel/undo edge cases (N/A dla tooltip)
- **L36** — pure helper extracted mid-impl OK

**Mini-przewidywanie P1.5:**
- 1 sesja, 0-1 post-fix
- Reuse `TacticalRaycaster` z P1.3.5 dla hover hit detection w tactical map
- Reuse `RaycasterPure` z P1.2 dla mapa 3D hover (jeśli intent → ale L28 może to obciąć)
- 500ms hover delay (spec doc §5.4)
- Tooltip content per type (vessel, planet, POI, empty)
- Plus może rozwiązać P1.3 known issue "out of range" UI feedback przez tooltip on disabled options (np. moveToPoint disabled bo fuel za niski)

---

**P1.4 CLOSED.** 25/25 smoke + 7/7 real-flow PASS + 0 post-fix iteracji. Cancel button + EventLog + status display zaimplementowane via pure helper architecture.

**3 nowe lekcje L34-L37** dodane do M3 lessons learned (L34 existing-code-grep, L35 cancel-as-rentgen, L36 mid-impl-refactor-OK, L37 diagnostic-data-over-interpretation). Cumulative M3 lessons: **L15-L37 (23 nowych vs M2b L1-L14)**. **Total cumulative: 37 lekcji workflow.**

**Phase P1 status:** P1.1 ✓, P1.2 ✓, P1.3 ✓, P1.3.5 ✓, P1.4 ✓ — pozostała **P1.5** (tooltips). **80% complete (4/5 commits).**

P1 finish target: 1 sesja więcej.

Po P1.5 → P2.* (POI UI: panel + modal + create POI mode, 3 commits) → P3.* (runtime: picket/rally/ambush, 2 commits) → P4 (polish + EventLog UX, 1 commit). M3 total: ~6 commits zostaje.
