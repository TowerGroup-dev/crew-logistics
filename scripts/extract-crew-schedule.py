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
    ROOT / "data" / "2026_ Crew Schedules (Master).xlsm",
    Path(r"C:\Users\OyeyimikaAdeoye\Downloads\2026_ Crew Schedules (Master).xlsm"),
]

YEAR = 2026
SCHEDULE_SHEET = "Crew - Schedule - 2026"
STAFF_SHEET = "Required Staff "
FLIGHTS_SHEET = "Crew - Flights - 2026"
AGREEMENT_SHEET = "Agreement"

NAME_COL = 4  # D
LOC_COLS = (1, 2)  # A, B
IN_COL, OUT_COL, DAYS_COL = 5, 6, 7  # E, F, G
FIRST_DAY_COL = 8  # H
FIRST_PERSON_ROW, LAST_PERSON_ROW = 3, 52
PROJECT_HEADER_ROW = 55
PROJECT_LAST_ROW = 90

DEFAULT_ROTATION_DAYS = 42  # sheet: "Rotation set: =6*7"
MECHANIC_ROTATION_DAYS = 28  # sheet: "Mechanic =7*4"
# A presence that ended only because the shading stopped may resume after a short break without a new mark.
MAX_SHADING_BREAK_DAYS = 21

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
    "IQA": "IQA", "IQ": "IQA", "IQALUIT": "IQA",
    "POND": "POND", "PND": "POND", "PD": "POND", "PN": "POND",
    "ALRT": "ALRT", "ALERT": "ALRT",
    "KUG": "KUG", "KU": "KUG", "KUGLUKTUK": "KUG",
}
TRANSIT_ALIASES = {"YK": "YK", "YZF": "YK", "YEG": "YEG", "YF": "YF"}
SITE_NAMES = {
    "IQA": "Iqaluit",
    "POND": "Pond Inlet",
    "ALRT": "Alert",
    "KUG": "Kugluktuk",
    "YK": "Yellowknife",
    "YEG": "Edmonton",
    "YF": "Airport / transfer",
    "TBC": "Site to be confirmed",
    "Out": "Off rotation",
    "In": "Arriving",
    "Transfer": "In transit",
}

# Fill colours. Travel days are green (two shades over the year) or blue (early 2026, no text).
TRAVEL_RGB = {"FF92D050", "FF00B050", "FFFFFF00"}
TRAVEL_THEME = {9}  # accent6 blue, any tint
POND_FILL = "t4+0.40"  # lavender: only ever used for Pond stints
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
    "JF": "JEAN FRANCOIS MARSOLAIS",
    "Kirk": "CLIFFORD KIRK ANSTEY",
    "Louis": "LOUIS COLOUMBE",
    "Natanael Lachance": "NATHANAEL LACHANCE",
    "Nicholas": "NICHOLAS ARVANIS",
    "Rob": "ROBERT FRENCH",
    "Sam M": "SAM MANNIAPIK",
    "Shannon": "SHANNON KING",
    "Stacey Turner": "STACEY TURNER",
    "Stephen Turner": "STEPHEN TURNER",
    "Trevor Anstey": "TREVOR ANSTEY",
}

# Short names used in the side table / Agreement sheet -> schedule name.
NICKNAMES = {
    "bernie": "Bernie", "javi": "Javi", "bryan": "Bryan Hay", "bryan hay": "Bryan Hay",
    "nick": "Nicholas", "nicholas": "Nicholas", "kevin": "Kevin Barrieau", "dean": "Dean Melvin",
    "dean melvin": "Dean Melvin", "dean melvin - house": "Dean Melvin", "kirk": "Kirk", "rob": "Rob",
    "louis": "Louis", "jf": "JF", "sam": "Sam M", "shannon": "Shannon", "maegan": "Maegan Ellison",
    "william": "William Matthews", "brad": "Brad Rubia", "mike": "Mike Reid",
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
    if colour.type == "rgb":
        key = colour.rgb
    elif colour.type == "theme":
        key = f"t{colour.theme}{'%+.2f' % colour.tint if colour.tint else ''}"
    else:
        key = f"{colour.type}{colour.value}"
    return None if key in WHITE else key


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


def parse_mark(raw: object) -> tuple[str, str] | None:
    """Return (kind, code). kind: site | out | transit | arrive | unknown."""
    text = clean(raw)
    if not text:
        return None
    upper = text.upper()
    if upper == "OUT":
        return ("out", "Out")
    if upper == "IN":
        return ("arrive", "TBC")
    if "-->" in upper or "→" in text or "->" in upper:
        dest = re.split(r"-+>|→", upper)[-1].strip()
        site = SITE_ALIASES.get(dest)
        return ("site", site) if site else ("transit", "Transfer")
    compact = upper.replace(" ", "")
    if compact in SITE_ALIASES:
        return ("site", SITE_ALIASES[compact])
    if compact in TRANSIT_ALIASES:
        return ("transit", TRANSIT_ALIASES[compact])
    return ("unknown", text)


def as_date(value: object) -> date | None:
    if isinstance(value, datetime):
        return value.date() if value.year >= 2020 else None
    if isinstance(value, date):
        return value if value.year >= 2020 else None
    return None


# --------------------------------------------------------------------------- calendar


def build_calendar(ws) -> tuple[dict[int, date], int]:
    """Column -> date. Columns before the first month header are December of the previous year."""
    dates: dict[int, date] = {}
    month = None
    year = YEAR - 1
    last_col = FIRST_DAY_COL
    for col in range(FIRST_DAY_COL, ws.max_column + 1):
        header = re.sub(r"[^a-z]", "", clean(ws.cell(1, col).value).lower())
        if header in MONTH_MAP:
            month = MONTH_MAP[header]
            year = YEAR
        day = ws.cell(2, col).value
        if not isinstance(day, (int, float)) or not float(day).is_integer():
            continue
        try:
            dates[col] = date(year, month or 12, int(day))  # invalid days (April 31) raise and are skipped
        except ValueError:
            continue
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
        day = {
            "date": dates[col],
            "text": text,
            "mark": parse_mark(text) if text else None,
            "travel": bool(text) or is_travel_fill(key),
            "shaded": key is not None,
            "fill": key,
        }
        days.append(day)
        previous = day
    return days


def build_timeline(days: list[dict], home_sites: list[str], warnings: list[str], who: str):
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
        """First index after from_index where presence stops, tolerating <=2 white days inside shading."""
        i = from_index + 1
        while i < n:
            day = days[i]
            if day["mark"]:
                return i, "next-mark"
            if day["travel"] and day["shaded"]:
                return i, "travel-cell"
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

    def pond_hint(current: dict, upto: int) -> None:
        for j in range(current["_last"] + 1, upto):
            if days[j]["fill"] == POND_FILL and not days[j]["mark"]:
                if not current["sites"] or current["sites"][-1] != "POND":
                    current["sites"].append("POND")
                    emit(days[j]["date"].isoformat(), "POND")
                return

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
            site = None if kind == "transit" else code
            tentative = kind == "arrive"
            if tentative:
                site = "TBC"
            stint = {"site": site, "sites": [site] if site else [], "from": d_iso, "out": None,
                     "arrival": "marked", "departure": None, "tentative": tentative, "_last": i}
            if tentative:
                stint["note"] = "Typed 'In' - site not set yet" + (f" (last stint: {last_site})" if last_site else "")
            emit(d_iso, code)
            k += 1
            continue

        # Already on a stint: lavender shading since the last mark means they moved to Pond.
        pond_hint(stint, i)
        if kind == "out":
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
            # Long white gap then a new arrival with no OUT typed: treat the gap start as departure.
            close(stint, gap[0], "shading-ended", stints, emit)
            last_site = stint["sites"][-1] if stint["sites"] else last_site
            stint = None
            continue  # re-process this mark as a fresh arrival

        if kind in ("site", "arrive"):
            target = code if kind == "site" else stint["site"] or "TBC"
            if not stint["sites"] or stint["sites"][-1] != target:
                stint["sites"].append(target)
            stint["site"] = stint["site"] or target
        emit(d_iso, code if kind != "arrive" else (stint["site"] or "TBC"))
        stint["_last"] = i
        k += 1

    if stint is not None:
        # No OUT typed after the last arrival: use the shading.
        end_index, how = shading_end(stint["_last"])
        pond_hint(stint, end_index if end_index is not None else n)
        if end_index is None:
            stint["departure"] = "open"
            stints.append(stint)
        else:
            close(stint, days[end_index]["date"].isoformat(), how, stints, emit)

    # Shading with no typed marks around it (e.g. a whole block coloured but no IN/OUT): flag recent ones.
    covered = set()
    for item in stints:
        for j, day in enumerate(days):
            if item["from"] <= day["date"].isoformat() < (item["out"] or "9999"):
                covered.add(j)
    run = []
    recent = (date.today() - timedelta(days=90)).isoformat()
    for j, day in enumerate(days + [{"shaded": False, "mark": None, "date": None, "travel": False}]):
        if day["shaded"] and not day["travel"] and j not in covered:
            run.append(j)
            continue
        if len(run) >= 7 and days[run[-1]]["date"].isoformat() >= recent:
            warnings.append(f"{who}: shaded {days[run[0]]['date']} to {days[run[-1]]['date']} with no IN/OUT typed - "
                            "not counted as on site until the travel days are typed")
        run = []

    for item in stints:
        if not item["site"] and item["sites"]:
            item["site"] = item["sites"][0]
        if not item["site"]:
            item["site"] = fallback
            item["sites"] = [fallback]
        item.pop("_last", None)
    return events, stints


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

    wb = openpyxl.load_workbook(path, data_only=True)
    if SCHEDULE_SHEET not in wb.sheetnames:
        raise SystemExit(f"Missing sheet {SCHEDULE_SHEET!r}. Found: {wb.sheetnames}")
    ws = wb[SCHEDULE_SHEET]
    dates, last_col = build_calendar(ws)
    cols = sorted(dates)

    section_rows = [r for r in range(FIRST_PERSON_ROW, LAST_PERSON_ROW)
                    if clean(ws.cell(r, NAME_COL).value).lower().rstrip(":") in SECTIONS]
    bridged = bridge_columns(ws, dates, section_rows)

    warnings: list[str] = []
    people = []
    role = "Crew"
    for row in range(FIRST_PERSON_ROW, LAST_PERSON_ROW + 1):
        name = clean(ws.cell(row, NAME_COL).value)
        low = name.lower().rstrip(":").strip()
        if not name:
            continue
        if low in SECTIONS:
            role = SECTIONS[low]
            continue
        if low.startswith("rotation set") or low in {"mechanic", "crew"}:
            continue
        home_sites = []
        for col in LOC_COLS:
            site = normalize_site(ws.cell(row, col).value)
            if site and site not in home_sites:
                home_sites.append(site)
        # Hidden rows are finished / off this roster — do not import them.
        if ws.row_dimensions[row].hidden:
            continue
        days = classify_days(ws, row, cols, dates, bridged)
        person_warnings: list[str] = []
        events, stints = build_timeline(days, home_sites, person_warnings, name)
        warnings.extend(person_warnings)
        in_date = iso(as_date(ws.cell(row, IN_COL).value))
        out_date = iso(as_date(ws.cell(row, OUT_COL).value))
        people.append({
            "id": slug(f"{name}-{role}"),
            "name": name,
            "role": role,
            "sheetRow": row,
            "active": True,
            "homeSites": home_sites,
            "projectIds": [],
            "inDate": in_date,
            "outDate": out_date,
            "rotationDays": MECHANIC_ROTATION_DAYS if role == "Mechanic" else DEFAULT_ROTATION_DAYS,
            "events": events,
            "stints": stints,
            "warnings": [w.split(": ", 1)[1] for w in person_warnings],
        })

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
            # Housing table is assignment logistics, not a schedule project — skip linking.

    for project in read_project_timeline(ws, dates, bridged, cols):
        projects.setdefault(project["id"], project)

    # Required Staff sheet is a separate planning list — keep schedule projects only.

    flights = read_flights(wb)
    used_flight_names = set()
    for person in people:
        full = FLIGHT_NAMES.get(person["name"])
        if full and full in flights:
            person["fullName"] = full.title()
            person["flights"] = flights[full]
            used_flight_names.add(full)
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
