# Excel navigation parity (Month grid)

The Month grid is the Excel sheet. Every common sheet move has a stable ID (`NAV-xx`) so unit tests, Playwright (`CL-xx`), and the SQA / work log can point at the same row.

## Gesture contract

| ID | Intent | Gesture | Result | Undo |
| --- | --- | --- | --- | --- |
| **NAV-01** | Place stay | Site chip on top (default IQA) → drag empty days (first=IN, last=OUT) | Places immediately — no dialog. Every IN has an OUT. Travel chip = pass-through (→ between cities) | Ctrl+Z |
| **NAV-02** | Open rotation | Click a stay cell (no drag) | Opens that person's rotation / day | — |
| **NAV-03** | Return booking window | Right-click stay → **Return window** | Yellow from clicked day through end of stay (e.g. day 6 of 10 → days 6–10) | Ctrl+Z |
| **NAV-04** | Extend stay | Drag on a stay past OUT | Moves exclusive OUT later (capped); works for sheet + app stays | Ctrl+Z |
| **NAV-05** | Clear return window | Click yellow cells, or right-click → Clear return window | Clears painted return window (not the stay) | Ctrl+Z |
| **NAV-06** | Stopover | Right-click → pick hub short code (YOW, YYZ, YK, …) | Paints travel stopover on that day | Ctrl+Z |
| **NAV-07** | Delete placement | Select app stay → Delete / Clear placement | Removes app-added rotation plan; confirm if flights booked/confirmed | Ctrl+Z |
| **NAV-08** | Stay note | Place dialog note, or right-click → Add/Edit note | Free-text on the plan (e.g. “Lingering for snow”); cell shows a mark | Ctrl+Z |
| **NAV-09** | Undo | Ctrl+Z or Undo button | Restores last Month calendar snapshot | — |

## Right-click menu

One menu (Excel-like) instead of competing single-purpose right-clicks:

- **Return window (this day → OUT)** — stay cells only
- **Clear return window** — when yellow covers the day
- **Clear placement** — app-painted stays
- **Add / Edit note** — app-painted stays (not in the page header)
- **Stopover boxes** — pass-through hubs only (not IQA/KUG/POND/ALRT worksites): YOW Ottawa, YYZ Toronto, YUL Dorval, YVR Vancouver, YEG Edmonton, CAM Campbell, YK Yellowknife, YXP Pangnirtung, YHZ Halifax, YYT St Johns, YDF Deer Lake, YYC Calgary, YRT Rankin Inlet

## Selection rules

- After **NAV-01 Place**, the new stay stays **selected** so **NAV-07 Delete** works immediately.
- Sheet-imported (extracted) stays stay editable: extend (NAV-04), **End stay on this day** (shorten), return window (NAV-03), stopovers (NAV-06). App-only Clear placement (NAV-07) / plan notes (NAV-08) apply when a `RosterRotationPlan` exists.

## Notes vs other note fields

| Surface | Where stored | Use |
| --- | --- | --- |
| Stay note (NAV-08) | `RosterRotationPlan.note` | Coordinator cell comment on that placement |
| Flight notes | `CrewPersonOps.flightNotes` / flight booking | Ticket / PNR context |
| Accommodation notes | `CrewPersonOps.accommodationNotes` | Lodging context |
| Employee notes | `ManualCrewPerson.notes` | Person-level, not day/stay |

## Work log / SQA linkage

- Reference **NAV-xx** in unit test titles and PR notes.
- Playwright cases keep **CL-xx** IDs from the **SQA Test Cases – Tower Apps** sheet ([tests/README.md](../tests/README.md)).
- Cross-link when an e2e covers a nav row, e.g. `CL-12 · NAV-01 Place stay`.

## Checklist (coverage)

| ID | Unit | E2E | Notes |
| --- | --- | --- | --- |
| NAV-01 | yes (`addNextRotation`) | CL-* as available | |
| NAV-03 | yes (`returnWindowFromStayDay`) | | |
| NAV-07 | yes (`removeRotationPlan`) | | |
| NAV-08 | yes (note on plan) | | |
| NAV-09 | yes (undo stack helpers) | | |
| NAV-02, 04–06 | gesture UI | | |
