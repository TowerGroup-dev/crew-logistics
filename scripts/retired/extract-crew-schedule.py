"""Extract the Tower Arctic crew schedule from the master XLSM into src/lib/crew-schedule-data.ts.

Usage:
    python scripts/extract-crew-schedule.py ["path/to/2026_ Crew Schedules (Master).xlsm"]

How the "Crew - Schedule - 2026" sheet works (see docs/schedule-mapping.md for the full write-up):

* One row per person, grouped under section rows (Managers, Surveyors, ...). Columns A/B = usual sites.
* Row 1 holds month names, row 2 the day number. The grid starts on 8 Dec of the previous year
  (columns before the "January" header), and April has a phantom 31st column that is skipped.
* A cell with TEXT is a travel day: a site code (IQA, PND, KU, ALRT ...) = flying in to that site,
  OUT = flying home, YK / YEG / YF = connecting through a hub, "KU --> PD" = transfer between sites,
  "In" = arriving, site not decided yet.
* GREEN / BLUE cells are travel days (older ones have no text). Any other shading between travel days
  means "on site". White = off rotation.
* So when a stint starts with an arrival but has no OUT typed yet, the END OF THE SHADING is the planned
  departure. That is the main thing the old importer missed.
* Hidden rows = people not on the current schedule (finished their season); skipped on export.
* Rows 55+ are a project timeline grouped by location; shading = when the project is active.
* Columns OH..OL hold the "Critical project CREW - Housing" table (crew -> Side 1 / Side 2 / New Housing).
* The In / Out / Days columns are mostly empty or point at blank cells, so they are only used as a fallback.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "lib" / "crew-schedule-data.ts"
DEFAULT_XLSM_CANDIDATES = [
    # Prefer the repo copy, AutoRecovered / "(2)" sheets are often stale snapshots.
    ROOT / "data" / "2026_ Crew Schedules (Master).xlsm",
    Path(r"C:\Users\OyeyimikaAdeoye\Downloads\2026_ Crew Schedules (Master).xlsm"),
    Path(r"C:\Users\OyeyimikaAdeoye\Downloads\2026_ Crew Schedules (Master) 2.xlsx"),
    Path(r"C:\Users\OyeyimikaAdeoye\Downloads\2026_ Crew Schedules (Master) 2(AutoRecovered).xlsx"),
]

YEAR = 2026
# Preferred sheet titles. The plain "Crew - Schedule - 2026" grid is the working copy;
# "(2)" / renamed copies are often older and miss later typed IN/OUT (Mike Nov, Eric Sep).
SCHEDULE_SHEET_CANDIDATES = (
    "Crew - Schedule - 2026",
    "Crew - Schedule - 2026 (2)",
    "2026_ Crew Schedules (Master) 2",
)
STAFF_SHEET = "Required Staff "
FLIGHTS_SHEET = "Crew - Flights - 2026"
AGREEMENT_SHEET = "Agreement"

# Defaults for classic layout (overridden by detect_layout).
NAME_COL = 4  # D
LOC_COLS = (1, 2)  # A, B
IN_COL, OUT_COL, DAYS_COL = 5, 6, 7  # E, F, G
FIRST_DAY_COL = 8  # H
FIRST_PERSON_ROW, LAST_PERSON_ROW = 3, 52
PROJECT_HEADER_ROW = 55
PROJECT_LAST_ROW = 90
SCHEDULE_SHEET = SCHEDULE_SHEET_CANDIDATES[0]

DEFAULT_ROTATION_DAYS = 42  # sheet: "Rotation set: =6*7"
MECHANIC_ROTATION_DAYS = 28  # sheet: "Mechanic =7*4"
# A presence that ended only because the shading stopped may resume after a short break without a new mark.
MAX_SHADING_BREAK_DAYS = 21
# Typed OUT then same-camp return within this many days = short hop home, one continuous stay
# (Dean Melvin Oct 14 OUT → Oct 29 IQA inside an Aug–Dec IQA block).
MAX_SOFT_HOME_BREAK_DAYS = 21
# When a long late-year stay never gets a hard OUT (shading stops at Nov 30), plan through Dec 29.
SEASON_OUT_ISO = f"{YEAR}-12-29"

MONTH_MAP = {
    "january": 1, "jan": 1, "february": 2, "febraury": 2, "feb": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8, "september": 9, "october": 10,
    "november": 11, "december": 12,
}

SECTIONS = {
    "managers": "Manager",
    "manager": "Manager",
    "surveyors": "Surveyor",
    "surveyor": "Surveyor",
    "operators/truck drivers": "Operator/Truck Driver",
    "operator/truck driver": "Operator/Truck Driver",
    "operators / truck drivers": "Operator/Truck Driver",
    "labourers": "Labourer",
    "labourer": "Labourer",
    "mechanics": "Mechanic",
    "mechanic": "Mechanic",
}

SITE_ALIASES = {
    "IQA": "IQA",
    "IQ": "IQA",
    "IQALUIT": "IQA",
    "POND": "POND",
    "PND": "POND",
    "PD": "POND",
    "PN": "POND",
    "ALRT": "ALRT",
    "ALERT": "ALRT",
    "KUG": "KUG",
    "KU": "KUG",
    "KUGLUKTUK": "KUG",
}
# Camp codes that end a multi-leg trip (IQA → YF → KU).
CAMP_SITES = {"IQA", "POND", "ALRT", "KUG"}
TRANSIT_ALIASES = {
    "YK": "YK",
    "YZF": "YK",
    "YXY": "YK",
    "YF": "YF",  # Yellowknife leg on the sheet
    "YEG": "YEG",
    "YOW": "YOW",
    "YYZ": "YYZ",
    "YUL": "YUL",
    "YVR": "YVR",
    "YYC": "YYC",
    "YHZ": "YHZ",
    "CAM": "CAM",
    "YCO": "YCO",
    "YFB": "YFB",
    "YIO": "YIO",
    "YXP": "YXP",
    "YYT": "YYT",
    "YDF": "YDF",
    "TRANSFER": "Transfer",
}
# Worksite legend only, pass-through hubs live in the app travel-hubs list, not here.
SITE_NAMES = {
    "IQA": "Iqaluit",
    "POND": "Pond Inlet",
    "ALRT": "Alert",
    "KUG": "Kugluktuk",
    "TBC": "Site to be confirmed",
    "Out": "Off rotation",
    "In": "Arriving",
    "Transfer": "In transit",
}

# Fill colours. Travel days are green (two shades over the year) or blue (early 2026, no text).
TRAVEL_RGB = {"FF92D050", "FF00B050", "FFFFFF00"}
TRAVEL_THEME = {9}  # accent6 blue, any tint
POND_FILL = "t4+0.40"  # lavender: only ever used for Pond stints
# Light theme fill used for late-year / planned on-site blocks (Marjorie Sep–Nov, Mike Nov, …).
PLANNED_SITE_FILL = "t6+0.60"
# After planned-fill shading stops with no OUT, absorb this many white days as homeward travel.
HOMEWARD_WHITE_DAYS = 2
WHITE = {None, "FFFFFFFF", "00000000", "t0"}

# Schedule nickname -> name used on the flights sheet. Confirmed by matching travel dates.
FLIGHT_NAMES = {
    "Bernie": "BERNARD COUTU",
    "Bryan Hay": "BRYAN HAY",
    "Dean Melvin": "DEAN MELVIN",
    "Elmer Gosse": "ELMER GOSSE",
    "Eric Jacobsen": "ERIC JACOBSEN",
    "Andrew Murphy": "ANDREW MURPHY",
    "Javi": "JAVIER CASTANO",
    "Javier Humberto Castano Bedoya": "JAVIER CASTANO",
    "JF": "JEAN FRANCOIS MARSOLAIS",
    "Jean Francois Marsolais": "JEAN FRANCOIS MARSOLAIS",
    "Kirk": "CLIFFORD KIRK ANSTEY",
    "Clifford Kirk Anstey": "CLIFFORD KIRK ANSTEY",
    "Louis": "LOUIS COLOUMBE",
    "Louis Coloumbe": "LOUIS COLOUMBE",
    "Natanael Lachance": "NATANAEL LACHANCE",
    "Nicholas": "NICHOLAS ARVANIS",
    "Rob": "ROBERT FRENCH",
    "Robert French": "ROBERT FRENCH",
    "Sam M": "SAM MANNIAPIK",
    "Sam Manniapik": "SAM MANNIAPIK",
    "Shannon": "SHANNON KING",
    "Shannon King": "SHANNON KING",
    "Stacey Turner": "STACEY TURNER",
    "Stephen Turner": "STEPHEN TURNER",
    "Trevor Anstey": "TREVOR ANSTEY",
}

# Sheet nicknames -> full display name on the schedule (only where a full name is known).
DISPLAY_NAMES = {
    "Kirk": "Clifford Kirk Anstey",
    "Sam M": "Sam Manniapik",
    "Rob": "Robert French",
    "Louis": "Louis Coloumbe",
    "JF": "Jean Francois Marsolais",
    "Javi": "Javier Humberto Castano Bedoya",
    "Shannon": "Shannon King",
}

# Short names used in the side table / Agreement sheet -> schedule name.
NICKNAMES = {
    "bernie": "Bernie",
    "javi": "Javier Humberto Castano Bedoya",
    "bryan": "Bryan Hay",
    "bryan hay": "Bryan Hay",
    "nick": "Nicholas",
    "nicholas": "Nicholas",
    "kevin": "Kevin Barrieau",
    "dean": "Dean Melvin",
    "dean melvin": "Dean Melvin",
    "dean melvin - house": "Dean Melvin",
    "kirk": "Clifford Kirk Anstey",
    "rob": "Robert French",
    "louis": "Louis Coloumbe",
    "jf": "Jean Francois Marsolais",
    "sam": "Sam Manniapik",
    "shannon": "Shannon King",
    "maegan": "Maegan Ellison",
    "william": "William Matthews",
    "brad": "Brad Rubia",
    "mike": "Mike Reid",
}


def clean(value: object) -> str:
    return re.sub(r"\s+", " ", str(value if value is not None else "").strip())


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def iso(value: date | None) -> str | None:
    return value.isoformat() if value else None


def fill_key(cell) -> str | None:
    fill = cell.fill
    if not fill or not fill.fill_type:
        return None
    colour = fill.fgColor
    try:
        ctype = colour.type
    except Exception:
        return None
    if ctype == "rgb":
        key = str(colour.rgb) if colour.rgb is not None else None
    elif ctype == "theme":
        tint = colour.tint or 0.0
        key = f"t{colour.theme}{'%+.2f' % tint if tint else ''}"
    else:
        key = f"{ctype}{colour.value}"
    if not key or key in WHITE or key.startswith("Values must"):
        return None
    return key


def is_travel_fill(key: str | None) -> bool:
    if not key:
        return False
    if key in TRAVEL_RGB:
        return True
    match = re.match(r"t(\d+)", key)
    return bool(match and int(match.group(1)) in TRAVEL_THEME)


def normalize_site(raw: object) -> str | None:
    text = clean(raw).upper()
    return SITE_ALIASES.get(text) if text else None


def _token_mark(token: str) -> tuple[str, str] | None:
    upper = token.upper().strip()
    if not upper:
        return None
    if upper == "OUT":
        return ("out", "Out")
    if upper == "IN":
        return ("arrive", "TBC")
    if upper in SITE_ALIASES:
        return ("site", SITE_ALIASES[upper])
    if upper in TRANSIT_ALIASES:
        return ("transit", TRANSIT_ALIASES[upper])
    return None


def parse_mark(raw: object) -> tuple[str, str] | None:
    """Return (kind, code). kind: site | out | transit | arrive | unknown.

    Multi-leg cells like ``IQA YF KU`` or ``KU --> PD`` mean a journey: the last camp
    is the arrival site; earlier tokens are transit hubs (IQA → Yellowknife → Kugluktuk).
    """
    text = clean(raw)
    if not text:
        return None
    # Day-count scribbles ("1") are not travel marks.
    if re.fullmatch(r"\d+", text):
        return None
    upper = text.upper()
    if "-->" in upper or "→" in text or "->" in upper:
        dest = re.split(r"-+>|→", upper)[-1].strip()
        site = SITE_ALIASES.get(dest)
        return ("site", site) if site else ("transit", "Transfer")

    parts = [p for p in re.split(r"[\s,/|]+", upper) if p]
    tokens = [t for t in (_token_mark(p) for p in parts) if t]
    if len(tokens) >= 2:
        # One cell with IQA YF KU → store full path; timeline treats last camp as arrival.
        path = " → ".join(code for _, code in tokens)
        if any(kind == "site" and code in CAMP_SITES for kind, code in tokens):
            return ("site", path)
        return ("transit", path)

    compact = upper.replace(" ", "")
    hit = _token_mark(compact)
    if hit:
        return hit
    return ("unknown", text)


def mark_site_code(code: str) -> str:
    """Last camp code from a plain mark or an IQA → YF → KUG path."""
    parts = [p.strip() for p in code.replace("→", "→").split("→")]
    parts = [p for p in parts if p]
    for part in reversed(parts):
        if part in CAMP_SITES:
            return part
        if part in SITE_ALIASES:
            return SITE_ALIASES[part]
    return parts[-1] if parts else code


def as_date(value: object) -> date | None:
    if isinstance(value, datetime):
        return value.date() if value.year >= 2020 else None
    if isinstance(value, date):
        return value if value.year >= 2020 else None
    return None


def _sheet_mark_score(ws) -> tuple[int, int]:
    """(dated_columns, typed_travel_marks), higher is the livelier schedule copy."""
    layout = detect_layout(ws)
    dates, _ = build_calendar(ws, layout["first_day_col"])
    if not dates:
        return (0, 0)
    cols = sorted(dates)
    # Sample mid-year columns across a few known crew rows for typed marks.
    sample_cols = cols[len(cols) // 4 : 3 * len(cols) // 4 : 3]
    marks = 0
    for row in range(3, min(45, (ws.max_row or 45) + 1)):
        name = clean(ws.cell(row, layout["name_col"]).value)
        if not name or name.lower().rstrip(":") in SECTIONS:
            continue
        for col in sample_cols:
            if parse_mark(ws.cell(row, col).value):
                marks += 1
    return (len(dates), marks)


def pick_schedule_sheet(wb) -> str:
    names = list(wb.sheetnames)
    candidates: list[str] = []
    for wanted in SCHEDULE_SHEET_CANDIDATES:
        if wanted in names:
            candidates.append(wanted)
    for name in names:
        low = name.lower()
        if name in candidates:
            continue
        if "crew" in low and "schedule" in low and "flight" not in low:
            candidates.append(name)
    if not candidates:
        raise SystemExit(f"No crew schedule sheet found. Sheets: {names}")
    if len(candidates) == 1:
        return candidates[0]
    # When both the working sheet and a "(2)" copy exist, keep the one with more typed marks.
    scored = [( _sheet_mark_score(wb[name]), -i, name) for i, name in enumerate(candidates)]
    scored.sort(reverse=True)
    best_score, _, best = scored[0]
    detail = ", ".join(f"{name}={score}" for score, _, name in scored)
    print(f"Picked schedule sheet {best!r} (days/marks: {detail})")
    return best


def detect_layout(ws) -> dict[str, int]:
    """Auto-detect Employee / In / Out / first day columns from the header rows."""
    name_col = NAME_COL
    in_col, out_col, days_col = IN_COL, OUT_COL, DAYS_COL
    first_day = FIRST_DAY_COL
    for col in range(1, min(20, (ws.max_column or 20) + 1)):
        header = clean(ws.cell(2, col).value).lower()
        if header.startswith("employee") or header == "name":
            name_col = col
        elif header.startswith("in"):
            in_col = col
        elif header.startswith("out"):
            out_col = col
        elif header.startswith("day"):
            days_col = col
    # Some workbooks put headers on row 2 and day numbers start after Days.
    for col in range(1, min(20, (ws.max_column or 20) + 1)):
        top = clean(ws.cell(1, col).value).lower()
        if top.startswith("employee"):
            name_col = col
    # First day column: first column from ~G onward with a numeric day on row 2.
    for col in range(5, min(40, (ws.max_column or 40) + 1)):
        day = ws.cell(2, col).value
        if isinstance(day, (int, float)) and float(day).is_integer() and 1 <= int(day) <= 31:
            first_day = col
            break
    # Prefer the column that actually holds people names (Managers / Eric …).
    for col in (name_col, 3, 4, 2):
        samples = [clean(ws.cell(r, col).value).lower() for r in range(3, 12)]
        if any(s in SECTIONS or s == "eric jacobsen" or s == "bryan hay" for s in samples):
            name_col = col
            break
    return {
        "name_col": name_col,
        "in_col": in_col,
        "out_col": out_col,
        "days_col": days_col,
        "first_day_col": first_day,
    }


# --------------------------------------------------------------------------- calendar


def _day_header_number(value: object, previous_day: int | None) -> int | None:
    """Row-2 day headers are often literals early in a month, then ``=AF2+1`` formulas."""
    if isinstance(value, (int, float)) and float(value).is_integer():
        return int(value)
    if isinstance(value, str):
        text = value.strip()
        if text.isdigit():
            return int(text)
        # Uncached formula chain after a known day, step forward one.
        if previous_day is not None and text.startswith("=") and re.search(r"\+1\s*$", text):
            return previous_day + 1
    return None


def build_calendar(ws, first_day_col: int) -> tuple[dict[int, date], int]:
    """Column -> date. Columns before the first month header are December of the previous year."""
    dates: dict[int, date] = {}
    month = None
    year = YEAR - 1
    last_col = first_day_col
    previous_day: int | None = None
    for col in range(first_day_col, (ws.max_column or first_day_col) + 1):
        header = re.sub(r"[^a-z]", "", clean(ws.cell(1, col).value).lower())
        if header in MONTH_MAP:
            month = MONTH_MAP[header]
            year = YEAR
            previous_day = None  # month start should be a literal 1 (or Dec seed)
        day = _day_header_number(ws.cell(2, col).value, previous_day)
        if day is None:
            continue
        try:
            dates[col] = date(year, month or 12, day)  # invalid days (April 31) raise and are skipped
        except ValueError:
            previous_day = None
            continue
        previous_day = day
        last_col = col
    return dates, last_col


def bridge_columns(ws, dates: dict[int, date], section_rows: list[int]) -> set[int]:
    """Date columns left white in every section-header row (formatting gaps, e.g. 28 July)."""
    if not section_rows:
        return set()
    bridged = set()
    for col in dates:
        framed = [row for row in section_rows
                  if fill_key(ws.cell(row, col - 1)) and fill_key(ws.cell(row, col + 1))]
        if len(framed) >= 2 and all(fill_key(ws.cell(row, col)) is None for row in framed):
            bridged.add(col)
    return bridged


# --------------------------------------------------------------------------- per-person timeline


def classify_days(ws, row: int, cols: list[int], dates: dict[int, date], bridged: set[int]):
    """Return a list of day dicts: {date, text, mark, travel, shaded, fill}."""
    days = []
    previous = None
    for col in cols:
        cell = ws.cell(row, col)
        key = fill_key(cell)
        text = clean(cell.value)
        if col in bridged and previous is not None:
            # Copy the previous day's state across a formatting gap.
            days.append({**previous, "date": dates[col], "text": "", "mark": None, "bridged": True})
            continue
        mark = parse_mark(text) if text else None
        day = {
            "date": dates[col],
            "text": text,
            "mark": mark,
            "travel": bool(mark) or is_travel_fill(key),
            "shaded": key is not None,
            "fill": key,
        }
        days.append(day)
        previous = day
    refine_travel_runs(days)
    return days


def refine_travel_runs(days: list[dict]) -> None:
    """Consecutive typed travel days like IQA | YF | KU are one journey.

    Only the last camp opens the on-site stint; earlier site codes are transit legs
    (Iqaluit → Yellowknife → Kugluktuk).
    """
    i = 0
    n = len(days)
    while i < n:
        if not days[i]["mark"] or days[i]["mark"][0] not in {"site", "transit", "arrive"}:
            i += 1
            continue
        j = i + 1
        while j < n and days[j]["mark"] and days[j]["mark"][0] in {"site", "transit", "arrive"}:
            # Keep the run only while days stay adjacent travel/site marks (no long white gap).
            if not days[j]["travel"] and not days[j - 1]["travel"]:
                break
            j += 1
        if j - i >= 2:
            for day in days[i : j - 1]:
                kind, code = day["mark"]
                if kind == "site":
                    # Keep the place code (IQA / KU) but treat as a connecting day.
                    day["mark"] = ("transit", code)
                    day["travel"] = True
        i = j


def build_timeline(
    days: list[dict],
    home_sites: list[str],
    warnings: list[str],
    who: str,
    planned_block_days: int = DEFAULT_ROTATION_DAYS,
):
    """Turn one person's day cells into (events, stints).

    Typed marks are the backbone: an arrival mark (site / hub / "In") opens a stint while off site,
    later site marks are moves, and OUT closes it. Shading only fills gaps the marks leave:
      * no OUT typed after the last arrival -> the stint ends where the shading ends
        (or on an unlabelled green/blue travel cell straight after the shading);
      * a long white gap followed by a NEW arrival mark (no OUT typed in between) -> the stint is split
        at the start of the gap;
      * lavender shading (Pond colour) with no mark -> site switches to Pond.
    Colour-only trips with no typed marks at all are not trusted (formatting is often copied down rows).
    """
    events: list[dict] = []
    stints: list[dict] = []
    n = len(days)
    marked = [i for i, d in enumerate(days) if d["mark"] and d["mark"][0] != "unknown"]
    for i, d in enumerate(days):
        if d["mark"] and d["mark"][0] == "unknown":
            warnings.append(f"{who}: unreadable mark {d['mark'][1]!r} on {d['date']}")

    def is_on(i: int) -> bool:
        day = days[i]
        return day["shaded"] or bool(day["mark"])

    def shading_end(from_index: int) -> tuple[int | None, str]:
        """First index after from_index where presence stops, tolerating <=2 white days inside shading.

        Textless green/blue travel mid-block is Nunavut-internal hopping when more on-site
        shading follows (William-style PND ↔ travel ↔ PND). Only treat travel as departure
        when the next stretch is white / off rotation.
        """
        i = from_index + 1
        while i < n:
            day = days[i]
            if day["mark"]:
                return i, "next-mark"
            if day["travel"] and day["shaded"]:
                j = i + 1
                while j < n and j - i <= 3:
                    nxt = days[j]
                    if nxt["mark"]:
                        break
                    if nxt["shaded"] and not nxt["travel"]:
                        # Internal hop, keep the stint open through the green days.
                        i = j
                        break
                    if not nxt["shaded"]:
                        return i, "travel-cell"
                    j += 1
                else:
                    return i, "travel-cell"
                continue
            if not day["shaded"]:
                j = i
                while j < n and not days[j]["shaded"] and not days[j]["mark"] and j - i < 3:
                    j += 1
                if j < n and j - i < 3 and days[j]["shaded"] and not days[j]["travel"]:
                    i = j
                    continue
                return i, "shading-ended"
            i += 1
        return None, "open"

    def emit(day_iso: str, mark: str):
        if events and events[-1]["date"] == day_iso:
            events[-1]["mark"] = mark
        elif not events or events[-1]["mark"] != mark:
            events.append({"date": day_iso, "mark": mark})

    def transit_mark(code: str) -> str:
        """Camp codes used as connecting days stay visible but count as in-transit."""
        base = mark_site_code(code)
        if base in CAMP_SITES and "→" not in code:
            return f"via {base}"
        return code

    def same_camp_return_after(out_index: int, camp: str | None) -> int | None:
        """Index of the next typed arrival at the same camp within the soft-home window."""
        if not camp or camp not in CAMP_SITES:
            return None
        out_day = days[out_index]["date"]
        for j in range(out_index + 1, n):
            mark = days[j]["mark"]
            if not mark:
                continue
            kind, code = mark
            delta = (days[j]["date"] - out_day).days
            if delta > MAX_SOFT_HOME_BREAK_DAYS:
                return None
            if kind == "out":
                continue
            if kind in ("site", "arrive"):
                target = mark_site_code(code) if kind == "site" else camp
                if target == camp:
                    return j
                return None
            if kind == "transit":
                continue
            return None
        return None

    fallback = home_sites[0] if len(home_sites) == 1 else "TBC"
    stint = None
    last_site = None
    k = 0
    while k < len(marked):
        i = marked[k]
        day = days[i]
        kind, code = day["mark"]
        d_iso = day["date"].isoformat()

        if stint is None:
            if kind == "out":
                if events and events[-1]["mark"] == "Out":
                    warnings.append(f"{who}: OUT typed on {d_iso} while already off site")
                emit(d_iso, "Out")
                k += 1
                continue
            if kind == "transit":
                # Connecting day only (YF / YK / IQA on the way), wait for the camp arrival.
                emit(d_iso, transit_mark(code))
                k += 1
                continue
            site = mark_site_code(code) if kind == "site" else None
            tentative = kind == "arrive"
            if tentative:
                # "In" with no site code, keep last camp when we know it (e.g. Mike Reid Nov).
                site = last_site or "TBC"
            stint = {
                "site": site,
                "sites": [site] if site else [],
                "from": d_iso,
                "out": None,
                "arrival": "marked",
                "departure": None,
                "tentative": tentative,
                "_last": i,
                "_soft_home": False,
            }
            if tentative and site == "TBC":
                stint["note"] = "Typed 'In' - site not set yet" + (f" (last stint: {last_site})" if last_site else "")
            elif tentative:
                stint["note"] = f"Typed 'In' - using last site {site}"
            emit(d_iso, site if tentative else code)
            k += 1
            continue

        # Site moves only from typed marks (IQA / PND / KU …). Lavender fill alone is often
        # day-count formatting on an IQA row, do not flip the stay to Pond from colour.
        if kind == "out":
            camp = stint["sites"][-1] if stint["sites"] else stint.get("site")
            ret = same_camp_return_after(i, camp)
            # Only soft-merge inside a late-season block (e.g. Dean Aug→Dec). A normal
            # 6-week rotation with ~2 weeks home (Jun OUT → late Jun/Aug return) stays split.
            from_d = date.fromisoformat(stint["from"])
            soft_ok = (
                ret is not None
                and from_d.month >= 8
                and days[i]["date"].month >= 10
            )
            if soft_ok:
                warnings.append(
                    f"{who}: OUT typed on {d_iso} with {camp} return "
                    f"{days[ret]['date']}, kept as one stay (short home break)"
                )
                emit(d_iso, "Out")
                stint["_last"] = i
                stint["_soft_home"] = True
                k += 1
                continue
            gap = longest_white_gap(days, stint["_last"], i)
            if gap and gap[1] >= 7:
                warnings.append(f"{who}: {gap[1]} unshaded days ({gap[0]}) inside a stint that only ends with "
                                f"OUT on {d_iso} - check whether they went home in between")
            close(stint, d_iso, "marked", stints, emit)
            last_site = stint["sites"][-1] if stint["sites"] else last_site
            stint = None
            k += 1
            continue

        gap = longest_white_gap(days, stint["_last"], i)
        if gap and gap[1] >= 7:
            camp = stint["sites"][-1] if stint["sites"] else stint.get("site")
            target = mark_site_code(code) if kind == "site" else (camp if kind == "arrive" else None)
            soft_return = (
                stint.get("_soft_home")
                and kind in ("site", "arrive")
                and camp
                and target == camp
                and gap[1] <= MAX_SOFT_HOME_BREAK_DAYS
            )
            if not soft_return:
                # Long white gap then a new arrival with no OUT typed: treat the gap start as departure.
                close(stint, gap[0], "shading-ended", stints, emit)
                last_site = stint["sites"][-1] if stint["sites"] else last_site
                stint = None
                continue  # re-process this mark as a fresh arrival

        if kind in ("site", "arrive"):
            target = mark_site_code(code) if kind == "site" else stint["site"] or "TBC"
            if not stint["sites"] or stint["sites"][-1] != target:
                stint["sites"].append(target)
            stint["site"] = stint["site"] or target
        elif kind == "transit":
            emit(d_iso, transit_mark(code))
            stint["_last"] = i
            k += 1
            continue
        emit(d_iso, code if kind != "arrive" else (stint["site"] or "TBC"))
        stint["_last"] = i
        k += 1

    if stint is not None:
        # No hard OUT after the last arrival: use the shading (and season end when needed).
        end_index, how = shading_end(stint["_last"])
        if end_index is None:
            stint["departure"] = "open"
            stints.append(stint)
        else:
            out_iso = days[end_index]["date"].isoformat()
            last_fill = None
            for j in range(end_index - 1, stint["_last"] - 1, -1):
                if days[j]["shaded"] and not days[j]["travel"]:
                    last_fill = days[j]["fill"]
                    break
            # Planned-fill blocks often stop a couple days before the real homeward OUT
            # (Marjorie IQA shaded through Nov 30, out Dec 3).
            if how == "shading-ended" and last_fill == PLANNED_SITE_FILL:
                j = end_index
                absorbed = 0
                while (
                    j < n
                    and absorbed < HOMEWARD_WHITE_DAYS
                    and not days[j]["shaded"]
                    and not days[j]["mark"]
                ):
                    j += 1
                    absorbed += 1
                if absorbed:
                    out_iso = (
                        days[j]["date"].isoformat()
                        if j < n
                        else (days[end_index]["date"] + timedelta(days=absorbed)).isoformat()
                    )
                    how = "homeward"
                    warnings.append(
                        f"{who}: planned shading ended {days[end_index]['date']} "
                        f"- counted homeward OUT on {out_iso}"
                    )
            # Typed "In" with no OUT is often only partly shaded (Mike Reid Nov→Dec).
            # Stretch to the standard rotation block when shading stops early.
            if stint.get("tentative") and planned_block_days > 0:
                from_d = date.fromisoformat(stint["from"])
                planned_out = from_d + timedelta(days=planned_block_days)
                if date.fromisoformat(out_iso) < planned_out:
                    warnings.append(
                        f"{who}: typed In on {stint['from']} with shading only to "
                        f"{(date.fromisoformat(out_iso) - timedelta(days=1)).isoformat()} "
                        f"- extended to {planned_out.isoformat()} ({planned_block_days}-day block)"
                    )
                    out_iso = planned_out.isoformat()
                    how = "rotation"
            # Long Aug+ stays that only soft-OUTed mid-way and then shade to Nov often run
            # through late December on the real board (Dean Melvin → 29 Dec).
            if (
                stint.get("_soft_home")
                and how in {"homeward", "shading-ended", "rotation"}
                and date.fromisoformat(stint["from"]) <= date(YEAR, 9, 15)
                and date.fromisoformat(out_iso) < date.fromisoformat(SEASON_OUT_ISO)
            ):
                warnings.append(
                    f"{who}: late-year stay from {stint['from']} had no hard OUT "
                    f"- extended through {SEASON_OUT_ISO}"
                )
                out_iso = SEASON_OUT_ISO
                how = "season"
            close(stint, out_iso, how, stints, emit)

    # Long shaded runs with no typed IN/OUT used to be warnings only, that skipped real stays
    # (e.g. Mike Reid Nov–Dec, Eric POND early Sep). Promote them to stints when we can infer site.
    covered = set()
    for item in stints:
        for j, day in enumerate(days):
            if item["from"] <= day["date"].isoformat() < (item["out"] or "9999"):
                covered.add(j)
    run: list[int] = []

    def site_for_shaded_run(indexes: list[int]) -> str:
        for j in indexes:
            if days[j]["fill"] == POND_FILL:
                return "POND"
        if last_site:
            return last_site
        if len(home_sites) == 1:
            return home_sites[0]
        if home_sites:
            return home_sites[0]
        return fallback

    def flush_shaded_run(indexes: list[int]) -> None:
        nonlocal last_site
        if len(indexes) < 7:
            return
        site = site_for_shaded_run(indexes)
        start = days[indexes[0]]["date"].isoformat()
        # Exclusive OUT = day after last shaded day (sheet OUT = last day on site).
        last_idx = indexes[-1]
        if last_idx + 1 < n:
            out_iso = days[last_idx + 1]["date"].isoformat()
        else:
            out_iso = (days[last_idx]["date"] + timedelta(days=1)).isoformat()
        stints.append({
            "site": site,
            "sites": [site],
            "from": start,
            "out": out_iso,
            "arrival": "shading",
            "departure": "shading-ended",
            "tentative": False,
        })
        emit(start, site)
        emit(out_iso, "Out")
        last_site = site
        warnings.append(
            f"{who}: shaded {days[indexes[0]]['date']} to {days[indexes[-1]]['date']} "
            f"had no typed IN/OUT, counted as on site at {site} from shading"
        )

    for j, day in enumerate(days + [{"shaded": False, "mark": None, "date": None, "travel": False}]):
        if day["shaded"] and not day["travel"] and j not in covered:
            run.append(j)
            continue
        flush_shaded_run(run)
        run = []

    # Keep chronological order after inserting shading-only stints.
    stints.sort(key=lambda item: item["from"])

    for item in stints:
        if not item["site"] and item["sites"]:
            item["site"] = item["sites"][0]
        if not item["site"]:
            item["site"] = fallback
            item["sites"] = [fallback]
        item.pop("_last", None)
        item.pop("_soft_home", None)
    return events, stints




# From this date the sheet is read literally, cell by cell, with no guessing:
#   * a site code (IQA / PND / KU / ALRT ...) puts the person on that site from that day;
#   * any other code (YK, YEG, YF ...) is a stopover on the way (travel box);
#   * OUT ends the stay; coloured boxes straight after the OUT cell still belong to the
#     trip, and the last of them is the OUT day;
#   * white cells are days away; lavender shading is Pond; other shading continues the
#     current place; text that is not a code (e.g. "linger for snow") is a note on the stay.
LITERAL_FROM = date(2026, 3, 1)
# Shade the sheet uses for Iqaluit days (theme 6, +60% tint); lavender POND_FILL is Pond.
IQA_SHADE = "t6+0.60"
CORRECTIONS: dict[str, dict[str, str]] = {}


def literal_day_states(
    days: list[dict], start: int, *, location: str | None = None, home_site: str | None = None
) -> list[dict]:
    """One state per day from `start`: {kind: site|travel|away, place, label, out, note, code}."""
    states: list[dict] = []
    after_out = False  # inside the coloured run straight after an OUT cell
    previous: dict | None = None
    for j in range(start, len(days)):
        day = days[j]
        if day.get("bridged") and previous is not None:
            states.append({**previous, "out": False, "code": None, "note": None})
            continue
        text = day.get("text") or ""
        fill = day.get("fill")
        coloured = bool(fill) and fill not in WHITE
        mark = parse_mark(text) if text else None
        state = {"kind": "away", "place": None, "label": None, "out": False, "note": None, "code": None}
        if mark and mark[0] == "site":
            location = mark_site_code(mark[1])
            after_out = False
            state.update(kind="site" if location in CAMP_SITES else "travel", place=location,
                         label=None if location in CAMP_SITES else location, code=mark[1])
        elif mark and mark[0] == "transit" and mark[1] != "Transfer":
            hub = mark[1].split("→")[-1].strip()
            location = hub
            after_out = False
            state.update(kind="travel", place=hub, label=hub, code=mark[1])
        elif mark and mark[0] == "arrive":
            location = "TBC"
            after_out = False
            state.update(kind="travel", place="TBC", label="IN", code="IN")
        elif mark and mark[0] == "out":
            if location:
                state.update(kind="site" if location in CAMP_SITES else "travel", place=location,
                             label=None if location in CAMP_SITES else location, out=True)
            else:
                state.update(kind="travel", label="OUT", out=True)
            after_out = True
        else:
            note = text if (mark and mark[0] == "unknown") else None
            if coloured and fill == POND_FILL:
                location = "POND"
                state.update(kind="site", place="POND")
            elif coloured and after_out:
                if is_travel_fill(fill):
                    # Green box straight after OUT: the flight home, part of the trip.
                    state.update(kind="site" if location in CAMP_SITES else "travel", place=location,
                                 label=None if location in CAMP_SITES else location)
                else:
                    # Shading resumes after an OUT with no new code: a new stay, place unknown.
                    after_out = False
                    location = home_site if home_site in CAMP_SITES else None
                    if location:
                        state.update(kind="site", place=location, unsure=True)
                    else:
                        state.update(kind="travel", label=None, unsure=True)
            elif coloured and location:
                state.update(kind="site" if location in CAMP_SITES else "travel", place=location,
                             label=None if location in CAMP_SITES else location)
            elif coloured and fill == IQA_SHADE:
                # No code, but the sheet's Iqaluit shade (used on ~95% of coded IQA days).
                location = "IQA"
                state.update(kind="site", place="IQA")
            elif coloured:
                location = home_site if home_site in CAMP_SITES and not is_travel_fill(fill) else None
                if location:
                    state.update(kind="site", place=location, unsure=True)
                else:
                    state.update(kind="travel", label=None)
            elif location and location not in CAMP_SITES and not after_out:
                # White day at a stopover town: still there (YK 17 and 18).
                state.update(kind="travel", place=location, label=location)
            else:
                # White day: away. The next stay starts fresh (its own code or shade says where).
                location = None
                after_out = False
            if note and state["kind"] != "away":
                state["note"] = note
            if after_out and state["kind"] != "away":
                # Coloured box straight after OUT: the trip home; it becomes the OUT day.
                state["out"] = True
        if state["kind"] == "away" and after_out:
            after_out = False
            location = None
        states.append(state)
        previous = state
    return states


# Kept beside this script (data/ is not committed; this file holds only names and dates).
CORRECTIONS_FILE = Path(__file__).resolve().parent / "schedule-corrections.json"


def load_corrections() -> dict[str, dict[str, str]]:
    """{person name: {iso day: place}} from scripts/schedule-corrections.json (facts that beat the sheet)."""
    if not CORRECTIONS_FILE.exists():
        return {}
    raw = json.loads(CORRECTIONS_FILE.read_text(encoding="utf-8"))
    out: dict[str, dict[str, str]] = {}
    for name, rows in (raw.get("people") or {}).items():
        days: dict[str, str] = {}
        for row in rows:
            d = date.fromisoformat(row["from"])
            # "to": "open" = still there, no OUT date yet (runs to the end of the calendar).
            end = date(d.year, 12, 31) if str(row["to"]).lower() == "open" else date.fromisoformat(row["to"])
            note = str(row.get("note") or "").strip()
            while d <= end:
                days[d.isoformat()] = str(row["place"]).strip() + (f"|{note}" if note else "")
                d += timedelta(days=1)
        out[clean(name).lower()] = days
    return out


def apply_corrections(states: list[dict], days: list[dict], start: int, fixes: dict[str, str]) -> None:
    for k, state in enumerate(states):
        place = fixes.get(days[start + k]["date"].isoformat())
        if not place:
            continue
        place, _, note = place.partition("|")
        code = SITE_ALIASES.get(place.upper(), place.upper())
        if place.lower() == "away":
            state.update(kind="away", place=None, label=None, out=False, code=None, unsure=False)
        elif code in CAMP_SITES:
            state.update(kind="site", place=code, label=None, out=False, code=code, unsure=False)
        else:
            state.update(kind="travel", place=code, label=code, out=False, code=code, unsure=False)
        if note and place.lower() != "away":
            state["note"] = note
    # A stay that a correction ends (next day away) closes there.


def literal_stints(
    days: list[dict],
    start: int,
    *,
    location: str | None = None,
    home_site: str | None = None,
    fixes: dict[str, str] | None = None,
):
    """Stays (with day segments) and events from `start`, read literally."""
    states = literal_day_states(days, start, location=location, home_site=home_site)
    if fixes:
        apply_corrections(states, days, start, fixes)
    stints: list[dict] = []
    events: list[dict] = []
    k = 0
    n = len(states)
    while k < n:
        if states[k]["kind"] == "away":
            k += 1
            continue
        m = k
        # A stay is a run of non-away days; it ends after the last box of an OUT run.
        while m < n and states[m]["kind"] != "away":
            if states[m]["out"] and (m + 1 >= n or not states[m + 1]["out"]):
                m += 1
                break
            m += 1
        run = states[k:m]
        first_day = days[start + k]["date"]
        out_day = days[start + m - 1]["date"] + timedelta(days=1)
        sites = []
        for st in run:
            if st["kind"] == "site" and st["place"] not in sites:
                sites.append(st["place"])
        segments: list[dict] = []
        for idx, st in enumerate(run):
            d0 = (first_day + timedelta(days=idx)).isoformat()
            d1 = (first_day + timedelta(days=idx + 1)).isoformat()
            seg_kind = "site" if st["kind"] == "site" else "travel"
            site = st["place"] if seg_kind == "site" else None
            label = st["label"] if seg_kind == "travel" else None
            last = segments[-1] if segments else None
            if last and last["kind"] == seg_kind and last.get("site") == site and last.get("label") == label:
                last["out"] = d1
                continue
            seg = {"from": d0, "out": d1, "kind": seg_kind}
            if site:
                seg["site"] = site
            if label:
                seg["label"] = label
            segments.append(seg)
        notes = []
        for st in run:
            if st.get("note") and st["note"] not in notes:
                notes.append(st["note"])
        ended_by_out = any(st["out"] for st in run)
        stint = {
            "site": sites[0] if sites else "TBC",
            "sites": sites or ["TBC"],
            "from": first_day.isoformat(),
            "out": out_day.isoformat() if (ended_by_out or start + m < len(days)) else None,
            "arrival": "marked" if run[0]["code"] else "shading",
            "departure": "marked" if ended_by_out else "shading-ended",
            "tentative": any(st["place"] == "TBC" for st in run),
        }
        if notes:
            stint["note"] = " · ".join(notes)
        if any(st.get("unsure") for st in run):
            stint["unsure"] = True  # shading with no code: site taken from the Location column
        if len(segments) > 1 or (segments and segments[0]["kind"] != "site"):
            # route for each travel run
            for i, seg in enumerate(segments):
                if seg["kind"] != "travel":
                    continue
                j = i
                while j > 0 and segments[j - 1]["kind"] == "travel":
                    j -= 1
                e = i
                while e + 1 < len(segments) and segments[e + 1]["kind"] == "travel":
                    e += 1
                stops = []
                if j > 0 and segments[j - 1].get("site"):
                    stops.append(segments[j - 1]["site"])
                for t in segments[j : e + 1]:
                    if t.get("label") and (not stops or stops[-1] != t["label"]):
                        stops.append(t["label"])
                if e + 1 < len(segments) and segments[e + 1].get("site") and (not stops or stops[-1] != segments[e + 1]["site"]):
                    stops.append(segments[e + 1]["site"])
                if stops:
                    seg["route"] = " → ".join(stops)
            stint["segments"] = segments
        stints.append(stint)
        for seg in segments:
            events.append({"date": seg["from"], "mark": seg.get("site") or seg.get("label") or "Travel"})
        if stint["out"]:
            events.append({"date": stint["out"], "mark": "Out"})
        k = m
    return stints, events


def apply_literal(
    days: list[dict],
    stints: list[dict],
    events: list[dict],
    home_sites: list[str] | None = None,
    fixes: dict[str, str] | None = None,
):
    """Keep the old reading before LITERAL_FROM, the literal one from it on."""
    start = next((i for i, d in enumerate(days) if d["date"] >= LITERAL_FROM), None)
    if start is None:
        return stints, events
    cut = LITERAL_FROM.isoformat()
    kept: list[dict] = []
    carry: dict | None = None
    for stint in stints:
        if stint["from"] >= cut:
            continue
        if stint.get("out") and stint["out"] <= cut:
            kept.append(stint)
            continue
        carry = dict(stint)  # stay running into March: re-read from 1 March
        carry.pop("segments", None)
        carry["out"] = cut
        kept.append(carry)
    seed = None
    if carry:
        prior = [g for g in (carry.get("segments") or []) if g["from"] < cut]
        seed = (prior[-1].get("site") if prior and prior[-1]["kind"] == "site" else None) or mark_site_code(carry["site"])
    lit_stints, lit_events = literal_stints(
        days, start, location=seed, home_site=(home_sites or [None])[0], fixes=fixes
    )
    if carry and lit_stints and lit_stints[0]["from"] == cut:
        first = lit_stints.pop(0)
        carry["out"] = first["out"]
        carry["departure"] = first["departure"]
        for site in first["sites"]:
            if site not in carry["sites"]:
                carry["sites"].append(site)
        if first.get("segments"):
            carry["segments"] = [{"from": carry["from"], "out": cut, "kind": "site", "site": carry["site"]}] + first["segments"]
        elif first["site"] != carry["site"]:
            carry["segments"] = [
                {"from": carry["from"], "out": cut, "kind": "site", "site": carry["site"]},
                {"from": cut, "out": first["out"] or (days[-1]["date"] + timedelta(days=1)).isoformat(), "kind": "site", "site": first["site"]},
            ]
        if first.get("note"):
            carry["note"] = " · ".join(x for x in [carry.get("note"), first["note"]] if x)
    kept_events = [e for e in events if e["date"] < cut]
    kept_events.append({"date": cut, "mark": "Out"})
    return kept + lit_stints, kept_events + lit_events


def stint_day_segments(days: list[dict], stint: dict, *, today_index: dict[str, int]) -> list[dict]:
    """Day-by-day place and travel inside one stay, the way the sheet reads.

    A typed code puts the person at that place from that day until the next code
    (YK 17-18, IQA 19-21, PND 22 ...). The four sites (IQA, POND, KUG, ALRT) are on
    site; every other place is a stopover on the journey (a travel day). Returns compressed segments
    [{from, out, kind: "site"|"travel", site?, label?, route?}] or [] when the whole
    stay is simply one site.
    """
    start = today_index.get(stint["from"])
    if start is None:
        return []
    end = today_index.get(stint["out"]) if stint.get("out") else len(days)
    if end is None:
        end = len(days)
    home = mark_site_code(stint["site"]) if stint.get("site") else None
    location = home
    per_day: list[tuple[str, str | None, str | None]] = []  # (kind, site, label)
    locations: list[str | None] = []
    greens: list[bool] = []
    for j in range(start, end):
        day = days[j]
        mark = day.get("mark")
        label = None
        if mark and mark[0] in {"site", "transit", "arrive"}:
            kind, code = mark
            if kind == "site":
                location = mark_site_code(code)
                label = code if "→" in code else location
            elif kind == "transit" and code != "Transfer":
                location = code.split("→")[-1].strip() if "→" in code else code
                label = code
        locations.append(location)
        greens.append(bool(is_travel_fill(day.get("fill")) or (mark and mark[0] == "transit")))
        per_day.append(("?", location, label or location))

    # Only the four sites count as being on site (IQA, POND, KUG, ALRT). Anywhere else
    # (YK, YEG, YF ...) is a stopover on the way: a travel day labelled with that place.
    resolved: list[tuple[str, str | None, str | None]] = []
    for _, place, label in per_day:
        if place in CAMP_SITES:
            resolved.append(("site", place, None))
        else:
            resolved.append(("travel", None, label))

    if all(kind == "site" and site == home for kind, site, _ in resolved):
        return []

    # Compress into runs and attach the full route to each travel run.
    dates = [days[j]["date"].isoformat() for j in range(start, end)]
    segments: list[dict] = []
    for k, (kind, site, label) in enumerate(resolved):
        prev = segments[-1] if segments else None
        if prev and prev["kind"] == kind and prev.get("site") == site and prev.get("label") == label:
            prev["out"] = (days[start + k]["date"] + timedelta(days=1)).isoformat()
            continue
        seg = {"from": dates[k], "out": (days[start + k]["date"] + timedelta(days=1)).isoformat(), "kind": kind}
        if site:
            seg["site"] = site
        if label:
            seg["label"] = label
        segments.append(seg)
    i = 0
    while i < len(segments):
        if segments[i]["kind"] != "travel":
            i += 1
            continue
        j = i
        stops: list[str] = []
        before = segments[i - 1].get("site") if i > 0 else None
        if before:
            stops.append(before)
        while j < len(segments) and segments[j]["kind"] == "travel":
            for part in (segments[j].get("label") or "").split("→"):
                part = part.strip()
                if part and (not stops or stops[-1] != part):
                    stops.append(part)
            j += 1
        after = segments[j].get("site") if j < len(segments) else None
        if after and (not stops or stops[-1] != after):
            stops.append(after)
        route = " → ".join(stops)
        for seg in segments[i:j]:
            seg["route"] = route
        i = j
    return segments


def longest_white_gap(days: list[dict], after: int, before: int):
    """Longest run of unshaded, unmarked days strictly between two indexes -> (start_iso, length)."""
    best = None
    run_start = None
    for j in range(after + 1, before):
        white = not days[j]["shaded"] and not days[j]["mark"]
        if white and run_start is None:
            run_start = j
        if (not white or j == before - 1) and run_start is not None:
            run_end = j if white else j - 1
            length = run_end - run_start + 1
            if not best or length > best[1]:
                best = (days[run_start]["date"].isoformat(), length)
            run_start = None
    return best


def merge_duplicate_people(people: list[dict]) -> list[dict]:
    """Same person can appear on a hidden Managers row and again under Surveyors (William).

    Keep one record: union home sites / events / stints, prefer a visible row's role, and
    mark active if any copy is visible.
    """
    order: list[str] = []
    by_key: dict[str, dict] = {}
    for person in people:
        key = clean(person["name"]).lower()
        if key not in by_key:
            by_key[key] = person
            order.append(key)
            continue
        keep = by_key[key]
        other = person

        def _row_score(p: dict) -> tuple:
            marked = sum(
                1 for s in (p.get("stints") or [])
                if s.get("arrival") == "marked" or s.get("departure") == "marked"
            )
            manager = 1 if p.get("role") == "Manager" else 0
            visible = 1 if p.get("active") else 0
            # Prefer typed trips, then Manager section, then visible, then earlier sheet row.
            return (marked, manager, visible, -p["sheetRow"])

        if _row_score(other) > _row_score(keep):
            keep, other = other, keep
            by_key[key] = keep
        for site in other.get("homeSites") or []:
            if site not in keep["homeSites"]:
                keep["homeSites"].append(site)
        keep["active"] = bool(keep.get("active") or other.get("active"))
        # Merge timelines by date.
        events = {(e["date"], e["mark"]): e for e in (keep.get("events") or [])}
        for e in other.get("events") or []:
            events[(e["date"], e["mark"])] = e
        keep["events"] = sorted(events.values(), key=lambda e: e["date"])
        stints = list(keep.get("stints") or [])
        seen = {(s["from"], s.get("out"), tuple(s.get("sites") or [])) for s in stints}
        for s in other.get("stints") or []:
            sig = (s["from"], s.get("out"), tuple(s.get("sites") or []))
            if sig not in seen:
                stints.append(s)
                seen.add(sig)
        stints.sort(key=lambda s: s["from"])
        keep["stints"] = _drop_shaded_overlaps(stints)
        keep["events"] = _events_for_stints(keep["events"], keep["stints"])
        warn = list(keep.get("warnings") or [])
        for w in other.get("warnings") or []:
            if w not in warn:
                warn.append(w)
        # Drop "shaded …" warnings that describe stints we discarded as overlaps.
        keep["warnings"] = [
            w for w in warn
            if not (w.startswith("shaded ") and "counted as on site" in w and _warning_stint_dropped(w, keep["stints"]))
        ]
        if not keep.get("inDate"):
            keep["inDate"] = other.get("inDate")
        if not keep.get("outDate"):
            keep["outDate"] = other.get("outDate")
        # Prefer Manager over a duplicate Surveyors copy when both exist.
        if keep["role"] != other["role"] and "manager" in {keep["role"].lower(), other["role"].lower()}:
            keep["role"] = "Manager" if keep["role"] == "Manager" or other["role"] == "Manager" else keep["role"]
        keep["id"] = slug(f"{keep['name']}-{keep['role']}")
        keep["note"] = (
            f"Merged sheet rows {sorted({keep['sheetRow'], other['sheetRow']})}"
        )
    return [by_key[k] for k in order]


def _stint_overlap(a: dict, b: dict) -> bool:
    a_end = a.get("out") or "9999"
    b_end = b.get("out") or "9999"
    return a["from"] < b_end and b["from"] < a_end


def _drop_shaded_overlaps(stints: list[dict]) -> list[dict]:
    """Prefer typed trips when a shading-only stint overlaps them (duplicate William rows)."""
    marked = [
        s for s in stints
        if s.get("arrival") == "marked" or s.get("departure") == "marked"
    ]
    marked_outs = {s.get("out") for s in marked if s.get("out")}
    kept: list[dict] = []
    for s in stints:
        if s.get("arrival") == "shading":
            if any(_stint_overlap(s, m) for m in marked):
                continue
            # Ghost continuation from the other duplicate row starting on the typed OUT day.
            if s["from"] in marked_outs:
                continue
        kept.append(s)
    return kept


def _events_for_stints(events: list[dict], stints: list[dict]) -> list[dict]:
    """Keep travel events that fall on retained stints (out date is exclusive)."""
    if not stints:
        return events
    out_dates = {s.get("out") for s in stints if s.get("out")}
    kept: list[dict] = []
    seen: set[tuple] = set()
    for e in events:
        d = e["date"]
        mark = e.get("mark")
        key = (d, mark)
        if key in seen:
            continue
        if mark == "Out":
            if d not in out_dates:
                continue
        else:
            on_stint = any(
                s["from"] <= d < (s.get("out") or "9999") for s in stints
            )
            if not on_stint:
                continue
        seen.add(key)
        kept.append(e)
    return kept


def _warning_stint_dropped(warning: str, stints: list[dict]) -> bool:
    """True when a shaded-run warning no longer matches any kept stint."""
    # "shaded 2026-09-21 to 2026-09-27 had no typed IN/OUT, counted as on site at POND …"
    m = re.search(r"shaded (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})", warning)
    if not m:
        return False
    start, last = m.group(1), m.group(2)
    for s in stints:
        if s.get("arrival") != "shading":
            continue
        if s["from"] == start:
            return False
        # Exclusive out is day after last shaded day
        if s.get("out") and s["from"] <= start < s["out"]:
            return False
    return True


def close(stint: dict, out_iso: str, how: str, stints: list[dict], emit) -> None:
    stint["out"] = out_iso
    stint["departure"] = how
    stints.append(stint)
    emit(out_iso, "Out")


# --------------------------------------------------------------------------- side tables


def read_housing_table(ws, last_col: int):
    """'Critical project CREW | Housing | Target Start Date' block to the right of the calendar."""
    anchor = None
    for row in range(1, LAST_PERSON_ROW):
        for col in range(last_col + 1, ws.max_column + 1):
            if clean(ws.cell(row, col).value).lower().startswith("critical project crew"):
                anchor = (row, col)
                break
        if anchor:
            break
    if not anchor:
        return None
    row0, name_col = anchor
    num_col, role_col, slot_col = name_col - 2, name_col - 1, name_col + 1
    target_start = None
    above = clean(ws.cell(row0 - 1, slot_col).value)
    match = re.match(r"([A-Za-z]+)\s*(\d{1,2})", above)
    if match and match.group(1).lower()[:3] in {k[:3] for k in MONTH_MAP}:
        month = next(v for k, v in MONTH_MAP.items() if k.startswith(match.group(1).lower()[:3]))
        target_start = date(YEAR, month, int(match.group(2))).isoformat()
    crew, open_items = [], []
    for row in range(row0 + 1, row0 + 25):
        name = clean(ws.cell(row, name_col).value)
        if not name:
            continue
        number = ws.cell(row, num_col).value
        if isinstance(number, (int, float)):
            slot = clean(ws.cell(row, slot_col).value)
            crew.append({"slot": int(number), "role": clean(ws.cell(row, role_col).value), "name": name,
                         "assignment": None if slot.upper() in {"N/A", "NA", "-", ""} else slot})
        else:
            open_items.append(name)
    return {
        "project": clean(ws.cell(row0, slot_col).value) or "Housing",
        "label": clean(ws.cell(row0, name_col).value),
        "targetStart": target_start,
        "crew": crew,
        "openQuestions": open_items,
    }


def read_project_timeline(ws, dates, bridged, cols):
    projects = []
    region = None
    for row in range(PROJECT_HEADER_ROW + 1, PROJECT_LAST_ROW + 1):
        name = clean(ws.cell(row, NAME_COL).value)
        if not name:
            continue
        shaded_cols = [c for c in cols if fill_key(ws.cell(row, c)) or c in bridged]
        is_region = name.isupper() or re.match(r"^\d+\s*-", name) or name.lower() == "pending project"
        if is_region and len(shaded_cols) > len(cols) * 0.8:
            region = re.sub(r"^\d+\s*-\s*", "", name).title()
            continue
        windows = []
        run_start = prev = None
        for col in cols:
            on = bool(fill_key(ws.cell(row, col))) or (col in bridged and prev is not None)
            if on and run_start is None:
                run_start = col
            if not on and run_start is not None:
                windows.append({"from": iso(dates[run_start]), "to": iso(dates[prev])})
                run_start = None
            prev = col if on else None
        if run_start is not None:
            windows.append({"from": iso(dates[run_start]), "to": iso(dates[cols[-1]])})
        # Hidden project rows are finished / not on the current sheet view.
        if ws.row_dimensions[row].hidden:
            continue
        project_id = slug(name) if name.lower() != "airside rehab" else slug(f"{region} {name}")
        display = name if name.lower() != "airside rehab" else f"{region} {name}"
        projects.append({
            "id": project_id,
            "name": display,
            "year": YEAR,
            "source": "project-timeline",
            "region": region,
            "active": True,
            "starred": clean(ws.cell(row, 2).value) == "*",
            "windows": windows,
        })
    return projects


def read_required_staff(wb):
    if STAFF_SHEET not in wb.sheetnames:
        return []
    ws = wb[STAFF_SHEET]
    roles = {col: clean(ws.cell(2, col).value) for col in range(2, 9) if clean(ws.cell(2, col).value)}
    rows = []
    for row in range(3, ws.max_row + 1):
        name = clean(ws.cell(row, 1).value)
        values = {roles[c]: clean(ws.cell(row, c).value) for c in roles if clean(ws.cell(row, c).value)}
        if not name:
            if rows and values:
                rows[-1]["assigned"] = {role: [n.strip() for n in re.split(r",", v) if n.strip()] for role, v in values.items()}
            continue
        if name.lower().startswith("needed"):
            continue
        needs = {}
        for role, value in values.items():
            try:
                needs[role] = int(float(value))
            except ValueError:
                pass
        rows.append({
            "id": slug(name),
            "name": name,
            "needs": needs,
            "assigned": {},
            "timing": clean(ws.cell(row, 9).value) or None,
            "duration": clean(ws.cell(row, 10).value) or None,
            "note": clean(ws.cell(row, 14).value) or None,
        })
    return rows


def read_flights(wb):
    if FLIGHTS_SHEET not in wb.sheetnames:
        return {}
    ws = wb[FLIGHTS_SHEET]
    header_row = next((r for r in range(1, 20) if clean(ws.cell(r, 1).value).upper() == "EMPLOYEE NAME"), None)
    if not header_row:
        return {}
    by_name: dict[str, list[dict]] = {}
    for row in range(header_row + 1, ws.max_row + 1):
        name = clean(ws.cell(row, 1).value)
        arrive, depart = as_date(ws.cell(row, 3).value), as_date(ws.cell(row, 5).value)
        if not name or not (arrive or depart):
            continue
        by_name.setdefault(name.upper(), []).append({
            "arriveIqa": iso(arrive),
            "arriveRef": clean(ws.cell(row, 2).value) or None,
            "departIqa": iso(depart),
            "departRef": clean(ws.cell(row, 4).value) or None,
            "camp": clean(ws.cell(row, 6).value) or None,
            "carService": clean(ws.cell(row, 7).value) or None,
            "note": clean(ws.cell(row, 8).value) or None,
        })
    return by_name


def read_agreements(wb):
    if AGREEMENT_SHEET not in wb.sheetnames:
        return {}
    ws = wb[AGREEMENT_SHEET]
    out = {}
    for row in range(1, ws.max_row + 1):
        name, answer = clean(ws.cell(row, 2).value), clean(ws.cell(row, 3).value).lower()
        if name and answer in {"yes", "no"}:
            out[name.lower()] = answer == "yes"
    return out


def read_day_notes(path: Path, dates: dict[int, date]) -> list[dict]:
    """Threaded comments on the date header row of the schedule sheet."""
    import zipfile
    from openpyxl.utils import column_index_from_string

    notes = []
    with zipfile.ZipFile(path) as archive:
        workbook = archive.read("xl/workbook.xml").decode("utf8")
        rels = archive.read("xl/_rels/workbook.xml.rels").decode("utf8")
        match = re.search(r'<sheet name="%s"[^>]*r:id="(rId\d+)"' % re.escape(SCHEDULE_SHEET), workbook)
        if not match:
            return notes
        target = re.search(r'Id="%s"[^>]*Target="([^"]+)"' % match.group(1), rels) or re.search(
            r'Target="([^"]+)"[^>]*Id="%s"' % match.group(1), rels)
        sheet_file = "xl/" + target.group(1).lstrip("/").replace("xl/", "")
        sheet_rels = sheet_file.replace("worksheets/", "worksheets/_rels/") + ".rels"
        if sheet_rels not in archive.namelist():
            return notes
        threaded = re.findall(r'Target="\.\./(threadedComments/[^"]+)"', archive.read(sheet_rels).decode("utf8"))
        for name in threaded:
            xml = archive.read("xl/" + name).decode("utf8")
            for col_letters, row_number, body in re.findall(
                r'<threadedComment ref="([A-Z]+)(\d+)"[^>]*>(.*?)</threadedComment>', xml, re.S
            ):
                col = column_index_from_string(col_letters)
                text = re.sub(r"<[^>]+>", "", body).strip()
                if row_number == "2" and col in dates and text:
                    notes.append({"date": dates[col].isoformat(), "text": text})
    return sorted(notes, key=lambda n: n["date"])


# --------------------------------------------------------------------------- main extraction


def extract(path: Path) -> dict:
    import openpyxl

    global SCHEDULE_SHEET, CORRECTIONS
    CORRECTIONS = load_corrections()
    wb = openpyxl.load_workbook(path, data_only=True)
    SCHEDULE_SHEET = pick_schedule_sheet(wb)
    ws = wb[SCHEDULE_SHEET]
    layout = detect_layout(ws)
    name_col = layout["name_col"]
    in_col = layout["in_col"]
    out_col = layout["out_col"]
    first_day_col = layout["first_day_col"]
    print(f"Sheet {SCHEDULE_SHEET!r} layout: name=col{name_col} in=col{in_col} out=col{out_col} daysFrom=col{first_day_col}")

    dates, last_col = build_calendar(ws, first_day_col)
    cols = sorted(dates)
    if not cols:
        raise SystemExit("No dated columns found, check month/day header rows.")

    last_person = LAST_PERSON_ROW
    # Walk further if more crew rows exist before the project block.
    for row in range(FIRST_PERSON_ROW, min(80, ws.max_row or 80) + 1):
        label = clean(ws.cell(row, name_col).value).lower()
        if label.startswith("project") or label in {"rotation set: =6*7", "mechanic =7*4"}:
            last_person = max(LAST_PERSON_ROW, row - 1)
            break
        if label:
            last_person = max(last_person, row)

    section_rows = [r for r in range(FIRST_PERSON_ROW, last_person + 1)
                    if clean(ws.cell(r, name_col).value).lower().rstrip(":") in SECTIONS]
    bridged = bridge_columns(ws, dates, section_rows)

    warnings: list[str] = []
    people = []
    role = "Crew"
    for row in range(FIRST_PERSON_ROW, last_person + 1):
        name = clean(ws.cell(row, name_col).value)
        low = name.lower().rstrip(":").strip()
        if not name:
            continue
        if low in SECTIONS:
            role = SECTIONS[low]
            continue
        if low.startswith("rotation set") or low in {"mechanic", "crew"}:
            continue
        # Skip date-only / formula junk accidentally in the name column.
        if as_date(ws.cell(row, name_col).value):
            continue
        home_sites = []
        for col in LOC_COLS:
            site = normalize_site(ws.cell(row, col).value)
            if site and site not in home_sites:
                home_sites.append(site)
        hidden = bool(ws.row_dimensions[row].hidden)
        days = classify_days(ws, row, cols, dates, bridged)
        typed_marks = sum(1 for d in days if d["mark"] and d["mark"][0] != "unknown")
        shaded_days = sum(1 for d in days if d["shaded"] and not d["travel"])
        # Hidden rows are often "finished", still import when they have real schedule ink
        # (William Matthews PND→OUT sits on a hidden Managers row).
        if hidden and typed_marks == 0 and shaded_days < 7:
            continue
        person_warnings: list[str] = []
        events, stints = build_timeline(
            days, home_sites, person_warnings, name, planned_block_days=DEFAULT_ROTATION_DAYS
        )
        if hidden and not stints and not events:
            continue
        day_index = {d["date"].isoformat(): i for i, d in enumerate(days)}
        for stint in stints:
            if stint["from"] >= LITERAL_FROM.isoformat():
                continue
            segments = stint_day_segments(days, stint, today_index=day_index)
            if segments:
                stint["segments"] = segments
        stints, events = apply_literal(
            days, stints, events, home_sites, CORRECTIONS.get(clean(name).lower())
        )
        # Old-style guesses no longer apply from LITERAL_FROM; say plainly where the sheet
        # has shading but no code instead.
        cut = LITERAL_FROM.isoformat()
        person_warnings[:] = [
            w for w in person_warnings
            if not (re.findall(r"\d{4}-\d{2}-\d{2}", w) and re.findall(r"\d{4}-\d{2}-\d{2}", w)[0] >= cut)
        ]
        for stint in stints:
            if stint.get("unsure"):
                last = (date.fromisoformat(stint["out"]) - timedelta(days=1)).isoformat() if stint.get("out") else "year end"
                person_warnings.append(
                    f"{name}: shaded {stint['from']} to {last} with no site code, shown at {stint['site']} (Location column); please confirm"
                )
        warnings.extend(person_warnings)
        in_date = iso(as_date(ws.cell(row, in_col).value))
        out_date = iso(as_date(ws.cell(row, out_col).value))
        people.append({
            "id": slug(f"{name}-{role}"),
            "name": name,
            "role": role,
            "sheetRow": row,
            # Excel often hides rows that still have future trips, keep them on the board
            # whenever we extracted stints/events.
            "active": (not hidden) or bool(stints or events),
            "homeSites": home_sites,
            "projectIds": [],
            "inDate": in_date,
            "outDate": out_date,
            "rotationDays": MECHANIC_ROTATION_DAYS if role == "Mechanic" else DEFAULT_ROTATION_DAYS,
            "events": events,
            "stints": stints,
            "warnings": [w.split(": ", 1)[1] for w in person_warnings],
        })

    people = merge_duplicate_people(people)
    # Rebuild top-level warnings from merged people (drops ghost shaded-run notes).
    warnings = [
        f"{person['name']}: {w}"
        for person in people
        for w in (person.get("warnings") or [])
    ]

    # Housing / critical project crew table.
    housing = read_housing_table(ws, last_col)
    projects: dict[str, dict] = {}
    if housing:
        parent = slug(housing["project"])
        for member in housing["crew"]:
            schedule_name = NICKNAMES.get(member["name"].lower(), member["name"])
            member["personName"] = schedule_name
            if not member["assignment"]:
                continue
            # Housing table is assignment logistics, not a schedule project, skip linking.

    for project in read_project_timeline(ws, dates, bridged, cols):
        projects.setdefault(project["id"], project)

    # Required Staff sheet is a separate planning list, keep schedule projects only.
    staffing: list = []

    flights = read_flights(wb)
    used_flight_names = set()
    for person in people:
        sheet_name = person["name"]
        full = FLIGHT_NAMES.get(sheet_name)
        if full and full in flights:
            person["fullName"] = full.title()
            person["flights"] = flights[full]
            used_flight_names.add(full)
        if sheet_name in DISPLAY_NAMES:
            person["name"] = DISPLAY_NAMES[sheet_name]
            if "fullName" not in person:
                person["fullName"] = DISPLAY_NAMES[sheet_name]
    agreements = read_agreements(wb)
    for name, signed in agreements.items():
        schedule_name = NICKNAMES.get(name, name)
        for person in people:
            if person["name"].lower() == schedule_name.lower():
                person["agreementSigned"] = signed

    day_notes = read_day_notes(path, dates)
    wb.close()

    mark_counter = Counter(event["mark"] for person in people for event in person["events"])
    return {
        "year": YEAR,
        "source": path.name,
        "sheet": SCHEDULE_SHEET,
        "rules": {
            "defaultRotationDays": DEFAULT_ROTATION_DAYS,
            "mechanicRotationDays": MECHANIC_ROTATION_DAYS,
            "calendarStarts": iso(dates[cols[0]]),
            "calendarEnds": iso(dates[cols[-1]]),
        },
        "sites": SITE_NAMES,
        "projects": sorted(projects.values(), key=lambda item: item["name"].lower()),
        "people": people,
        "housingCrew": housing,
        "staffing": staffing,
        "dayNotes": day_notes,
        "warnings": warnings,
        "stats": {
            "people": len(people),
            "activePeople": sum(1 for p in people if p["active"]),
            "projects": len(projects),
            "datedColumns": len(dates),
            "bridgedColumns": [iso(dates[c]) for c in sorted(bridged)],
            "dateSpan": [iso(dates[cols[0]]), iso(dates[cols[-1]])],
            "markValues": dict(mark_counter.most_common()),
            "flightNamesNotOnSchedule": sorted(set(flights) - used_flight_names),
        },
    }


def main() -> None:
    if len(sys.argv) > 1:
        path = Path(sys.argv[1])
    else:
        path = next((candidate for candidate in DEFAULT_XLSM_CANDIDATES if candidate.exists()), DEFAULT_XLSM_CANDIDATES[0])
    if not path.exists():
        raise SystemExit(f"Missing XLSM: {path}\nPass the workbook path as the first argument.")
    payload = extract(path)
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else OUT
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        "export const CREW_SCHEDULE_DATA = " + json.dumps(payload, indent=2, ensure_ascii=False) + " as const;\n",
        encoding="utf-8",
    )
    stats = payload["stats"]
    print(f"Wrote {out}")
    print(f"People: {stats['people']} ({stats['activePeople']} active)   Projects: {stats['projects']}")
    print(f"Calendar: {stats['dateSpan'][0]} -> {stats['dateSpan'][1]}  bridged gaps: {stats['bridgedColumns']}")
    for person in payload["people"]:
        print(f"- {person['role']}: {person['name']}")
        for stint in person["stints"][-3:]:
            print(f"    {stint['from']} -> {stint['out'] or 'open'}  {'/'.join(stint['sites'])}"
                  f"  arrival={stint['arrival']} departure={stint['departure']}{' TENTATIVE' if stint['tentative'] else ''}")
    if payload["warnings"]:
        print("\nWarnings:")
        for warning in payload["warnings"]:
            print("  !", warning)


if __name__ == "__main__":
    main()
