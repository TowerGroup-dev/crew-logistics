# Crew schedule → app mapping

How the **"Crew - Schedule - 2026"** sheet in `2026_ Crew Schedules (Master).xlsm` works, and where each
piece lands in the app. The importer that applies these rules is `scripts/extract-crew-schedule.py`;
it writes `src/lib/crew-schedule-data.ts`, which `src/lib/crew-schedule.ts` reads.

## 1. Layout of the sheet

```
        A    B    D            E   F    G     H ............................ OG     OH..OL
row 1                CREW                    (Dec) January  February ... DECEMBER
row 2   Location     Employee  In  Out  Days  8 9 10 ... 31 | 1 2 3 ...  31
row 3                Managers                (day letters F S S M ... from 1 May)
row 4   IQA  POND    Eric Jacobsen           [one cell per day]                  Critical project CREW table
...                  Surveyors / Operators/Truck Drivers / Labourers / Mechanics (section rows)
row 50               Rotation set:  =6*7  (42 days)
row 51               Mechanic       =7*4  (28 days)
row 55+              Project:  timeline grouped by location (1430- IQALUIT, KUGLUKTUK, ALERT, POND INLET, Pending)
```

* **Calendar starts 8 Dec 2025.** Columns H–AE sit before the "January" header and are December of the previous year.
* **April has a phantom 31st column.** It is skipped.
* **28 July is a blank column** in every row (a formatting gap). The importer treats it as a continuation of the day before.

## 2. How to read a person row

| On the sheet | Meaning | In the app |
|---|---|---|
| Text on a day: `IQA`, `Iqa`, `IQ` | Flying in to Iqaluit that day | arrival, site `IQA` |
| `PND`, `Pond`, `PD`, `PN` | Flying in to Pond Inlet | site `POND` |
| `KU`, `Kug`, `KUG` | Kugluktuk | site `KUG` |
| `ALRT` / `ALERT` | Alert | site `ALRT` |
| `OUT` / `out` | Flying home: last day on site | stint ends (planned Out) |
| `YK`, `YEG`, `YF` | Connecting through Yellowknife / Edmonton / hub | `in_transit` |
| `KU --> PD` | Transfer between sites | moves to the destination (`POND`) |
| `In` (yellow) | Arriving, site not decided yet | site `TBC`, marked **tentative** |
| Two identical marks on consecutive days (`ALRT ALRT`, `KU KU`) | Two-day travel | single arrival |
| **Green or blue cell** | Travel day (older ones have no text) | used only next to typed marks |
| **Any other shading** after an arrival | On site | on site |
| **White** | Not on site | off rotation |
| **Lavender shading** | Pond stint | switches site to `POND` if no mark says so |

### The key rule: the planned Out date

1. If an `OUT` is typed after the arrival, that is the planned Out (`outSource: "typed"`).
2. If no `OUT` is typed yet, **the end of the shading is the planned Out** (`outSource: "shading"`).
   It is either the first white day, or the unlabelled green cell straight after the shading.
3. Only if the sheet has neither does the app fall back to **In + rotation** (42 days, or 28 for mechanics).

The old importer only used step 3. That is why Bernie, Javi, Nicholas, Marjorie and Shannon showed as overdue
in October, when the sheet has them planned on site until 1–3 December.

### What the importer deliberately does NOT trust

* **Colour with no typed marks at all.** Formatting is often copied down rows. For example, the Gemtec rows have
  the same Dec–Feb green cells as the rows above them, and Kevin is shaded Aug–Nov with no IN/OUT. These
  produce a **warning** instead of an on-site stint.
* **The In / Out / Days columns (E–G).** Most are blank, and the Out formulas point at the wrong cells
  (`=In+E50`, `=In+E53` …). They are kept as `inDate` / `outDate` only as a last fallback.

## 3. Hidden rows = not on the current schedule

Rows hidden in Excel (Simon, Maegan, both William Matthews rows, Andrew, Elmer, Stacey, Stephen, Trevor, the
Gemtec crew, JF, Shakira, Brad) are exported with `active: false`. The board still shows them for now.
**To confirm:** should the board hide them by default?

## 4. Field mapping

| Sheet source | Data field (`crew-schedule-data.ts`) | Used in the app for |
|---|---|---|
| Column D name + section row | `people[].name`, `role`, `id` | Roster, role filter |
| Columns A/B | `homeSites` | Usual sites; fallback site when a stint has no site mark |
| Row hidden? | `active` | Current vs finished crew |
| Day grid (marks + colours) | `events[]` (date → mark) | Status on any date (`statusOnDate`) |
| Day grid (marks + colours) | `stints[]` `{site, sites, from, out, arrival, departure, tentative}` | Planned In / Out, days on site, due-soon and overdue alerts |
| Rotation set / Mechanic rows | `rules.defaultRotationDays` (42), `mechanicRotationDays` (28), `rotationDays` | Fallback Out date |
| Right-hand "Critical project CREW / Housing / Target Start Date" table | `housingCrew` `{targetStart, crew[{slot, role, name, assignment}], openQuestions}` and projects `side-1`, `side-2`, `new-housing` | Housing crew assignments; open staffing questions ("Brad - Option", "Mike ?", "Sam or Brad?", "Side 2 - space") |
| Project timeline (rows 55+) | `projects[]` with `region`, `windows`, `active`, `starred` | Which projects run when and where |
| "Required Staff" sheet | `staffing[]` `{needs, assigned, duration, note}` and `projects[].needs` | Crew needed vs assigned per project |
| "Crew - Flights - 2026" sheet | `people[].fullName`, `people[].flights[]` | Booking refs and dates (history to ~June) |
| "Agreement" sheet | `people[].agreementSigned` | Agreement on file yes/no |
| Threaded comments on the date row | `dayNotes[]` | Notes on a date (e.g. "POND Arrival (South bound cargo)") |
| Anything inconsistent | `warnings[]` (top level, active crew only) and `people[].warnings` | A "needs review" list for the coordinator |

Name matching between sheets uses `FLIGHT_NAMES` / `NICKNAMES` in the importer. The flights matches were confirmed
by matching travel dates (Kirk = Clifford Kirk Anstey, Bernie = Bernard Coutu, Javi = Javier Castano,
JF = Jean Francois Marsolais, Rob = Robert French, Sam M = Sam Manniapik, Shannon = Shannon King, …).

## 5. Open questions for the coordinator

1. **Hidden rows**: does hidden mean "finished / not on the current schedule"? If so, the board can hide them by default.
2. **Shading to the end of a month** (many rows stop exactly on 30 Nov): is that a real plan, or "until further notice"?
   The app currently treats it as the planned Out (1 Dec) and labels it as coming from shading.
3. **`*` in column B** of the project list (Trigram, 46 Plex, Valve Replacement, NRC, Nikku Lane, Noble House,
   Kugluktuk Airside Rehab): what does the star mean?
4. **Project bar colours** (orange, red, light blue …): do they mean status (planned / confirmed / critical)?
5. **Green vs light green vs blue travel cells**: just older vs newer formatting, or booked vs not booked?

## 6. Current review list (from the importer)

* Eric Jacobsen: `OUT` typed on 4 Jun while already off site. The flights sheet shows an *arrival* on 4 Jun.
* Eric Jacobsen: shaded 29 Aug – 16 Sep with no IN/OUT typed.
* Sam M: second `OUT` on 25 Jul.
* Rob: 14 white days (from 17 Jun) inside a stint that only ends with `OUT` on 26 Jul. Did he go home?
* Marjorie: 50 white days (from 7 Jun) inside a stint that only ends with `OUT` on 25 Aug.
* Kevin Barrieau: shaded 1 Aug – 1 Nov with no IN/OUT typed, so the app shows him as unassigned.
* Natanael Lachance, Marc Olivier: shaded 1–26 Aug with no IN/OUT typed.

## 7. Updating the data

1. Save the latest workbook as `data/2026_ Crew Schedules (Master).xlsm` (git-ignored, because it holds employee details),
   or pass a path.
2. Run `python scripts/extract-crew-schedule.py` (or `python scripts/extract-crew-schedule.py "path\to\file.xlsm"`).
3. Read the printed stints and warnings, then reload the app.

Rule of thumb for whoever edits the sheet: **always type the IN and OUT on the travel days.** The shading is
a good fallback, but typed marks are what the app trusts most.
