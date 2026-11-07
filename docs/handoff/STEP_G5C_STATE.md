# STEP G5-C — state (CLOSED 2026-11-07 — `feat(G5-C)` `a0ae4c0` + `docs(G5-C)`; ARKUSZ GALAXY ZAMKNIĘTY)

Anchor `d888aa9`. Flags permanent, no new flags.

- **604** done: `GalaxyWarpLogic.fleetArrivalPopupKind` — solo ship on a live route: stop ≠ `warpRoute.finalSystemId` → `none`
  (Log line `warpRoute.legDone` stays), final → `solo`; fleet branch untouched. Keeper `galaxy_fleet_warp_ui_smoke` T9b (both listener orders).
- **605** done: `GalaxyShipMarkerLogic.groupParkedByFleet` + `HudGalaxyRailLayer` — parked diamond carries `⛬ ×N` per fleet (≥ 2 members at
  the star), loose ships keep the `+N` rule, selected fleet (`sel.fleetId`) bolds the diamond and its tag. One source of the glyph:
  `ShipTreeLogic.FLEET_NODE_GLYPH` (Outliner reads it). Keeper `galaxy_chrome_smoke` H15.
- **608** done: `GalaxyChromeLogic.railPlacement` (right → left → below the blocking expansion); `HudGalaxyLabelLayer._g2YieldRail` reports
  expansions after placement → `HudGalaxyRailLayer.yieldToExpansions` re-lays rows before draw (+ `hud.wake()` on change); row under the
  cursor stays put. Picker over the battle panel: `HudGalaxySendPickerLayer.openBox` → `HudLayer.uiPassThroughRects` → `CombatHUD.draw`
  clips it out (evenodd), click / hover pass through. Keeper `galaxy_chrome_smoke` H16.
  Rails pushed below one expansion stack (own star's rail first) — found on the contact sheet (home star's `+N` under Kochab's pin), keeper H16n.
- Debug helper `KOSMOS.debug.galaxySoloRoute(n)` (`src/debug/FleetWarpDebug.js`).
- Fail-first on `d888aa9` (clean LF clone, final keepers): `galaxy_fleet_warp_ui_smoke` 101/2 (the two SEDNO rows), `galaxy_chrome_smoke` 85/32,
  no control red. Tree: 103/0 and 117/0.
- Capture harness: `E:\kosmos-work\galaxy-g5c\gate\shots_G5C.mjs` + `make_sheet_G5C.mjs` (tools from `E:\kosmos-work\galaxy-g5\tools`).
- Final: sweep 371/371 OK + `check-i18n` PASS (pl = en = 3370) on the tree and on a clean LF checkout of `d888aa9` + the changes.
- Evidence: `kosmos-handover/galaxy-g5c/` — `kontakt_g5c.html` (5 themes + base frames), `STOP_G5C.md`, `gate/` (capture scripts).
- **Owner's look PASS 2026-11-07.** Decision on point 2: a neighbouring star's rail covered by another star's expansion hides (keeper H16n/H16o).
  Filed ⚪ 610 (pickaxe icon in the warp launch line) and ⚪ 611 („3 przeskoków”), no step. Committed `a0ae4c0` + docs. **ARC CLOSED — no next step.**
