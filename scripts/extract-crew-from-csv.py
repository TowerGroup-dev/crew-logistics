"""Extract crew employees, roles, and schedules from an unhidden CSV export of the master sheet.

CSV loses Excel fill colours, so stints are built from typed marks (IQA / OUT / PND / …).
Previously hidden people are included as active.

Usage:
  python scripts/extract-crew-from-csv.py ["path/to/2026_ Crew Schedules (Master) 2.csv"]
"""

from __future__ import annotations

import csv
import json
import re
import sys
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "lib" / "crew-schedule-data.ts"
DEFAULT_CSV = Path(r"C:\Users\OyeyimikaAdeoye\Downloads\2026_ Crew Schedules (Master) 2.csv")
XLSM_CANDIDATES = [
    ROOT / "data" / "2026_ Crew Schedules (Master).xlsm",
    Path(r"C:\Users\OyeyimikaAdeoye\Downloads\2026_ Crew Schedules (Master).xlsm"),
]

YEAR = 2026
NAME_COL = 3  # 0-based: D
LOC_COLS = (0, 1)
IN_COL, OUT_COL, DAYS_COL = 4, 5, 6
FIRST_DAY_COL = 7

DEFAULT_ROTATION_DAYS = 42
MECHANIC_ROTATION_DAYS = 28

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
    "Simon Plourde": "SIMON PLOURDE",
    "Maegan Ellison": "MAEGAN ELLISON",
    "William Matthews": "WILLIAM MATTHEWS",
    "Kevin Barrieau": "KEVIN BARRIEAU",
    "Brad Rubia": "BRAD RUBIA",
    "Mike Reid": "MIKE REID",
    "Marjorie": "MARJORIE",
    "Shakira": "SHAKIRA",
    "Marc Olivier": "MARC OLIVIER",
}


def clean(value: object) -> str:
    return re.sub(r"\s+", " ", str(value if value is not None else "").strip())


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def iso(value: date | None) -> str | None:
    return value.isoformat() if value else None


def normalize_site(raw: object) -> str | None:
    text = clean(raw).upper()
    return SITE_ALIASES.get(text) if text else None


def parse_mark(raw: object) -> tuple[str, str] | None:
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
    # Ignore free-text notes (Linger for snow, Nov 1st, Critical project…).
    if compact not in SITE_ALIASES and compact not in TRANSIT_ALIASES and upper not in {"OUT", "IN"}:
        return None
    return ("unknown", text)


def add_days(value: date, days: int) -> date:
    return value + timedelta(days=days)


def build_calendar(month_row: list[str], day_row: list[str]) -> dict[int, date]:
    dates: dict[int, date] = {}
    month = None
    year = YEAR - 1
    for col in range(FIRST_DAY_COL, max(len(month_row), len(day_row))):
        header = re.sub(r"[^a-z]", "", clean(month_row[col] if col < len(month_row) else "").lower())
        if header in MONTH_MAP:
            month = MONTH_MAP[header]
            year = YEAR
        day_raw = clean(day_row[col] if col < len(day_row) else "")
        if not day_raw.isdigit():
            continue
        try:
            dates[col] = date(year, month or 12, int(day_raw))
        except ValueError:
            continue
    return dates


def emit(events: list[dict], day_iso: str, mark: str) -> None:
    if events and events[-1]["date"] == day_iso:
        events[-1]["mark"] = mark
    elif not events or events[-1]["mark"] != mark:
        events.append({"date": day_iso, "mark": mark})


def close(stint: dict, out_iso: str, how: str, stints: list[dict], events: list[dict]) -> None:
    stint["out"] = out_iso
    stint["departure"] = how
    stints.append(stint)
    emit(events, out_iso, "Out")


def build_timeline_marks(days: list[dict], home_sites: list[str], rotation_days: int, warnings: list[str], who: str):
    """CSV has no fills — open on arrival marks, close on OUT, else rotation fallback."""
    events: list[dict] = []
    stints: list[dict] = []
    marked = [i for i, d in enumerate(days) if d["mark"] and d["mark"][0] != "unknown"]
    for d in days:
        if d["mark"] and d["mark"][0] == "unknown":
            warnings.append(f"{who}: unreadable mark {d['mark'][1]!r} on {d['date']}")

    fallback = home_sites[0] if len(home_sites) == 1 else "TBC"
    stint = None
    k = 0
    while k < len(marked):
        i = marked[k]
        day = days[i]
        kind, code = day["mark"]
        d_iso = day["date"].isoformat()

        if stint is None:
            if kind == "out":
                emit(events, d_iso, "Out")
                k += 1
                continue
            site = None if kind == "transit" else code
            tentative = kind == "arrive"
            if tentative:
                site = "TBC"
            stint = {
                "site": site,
                "sites": [site] if site else [],
                "from": d_iso,
                "out": None,
                "arrival": "marked",
                "departure": None,
                "tentative": tentative,
                "_from_date": day["date"],
            }
            emit(events, d_iso, code)
            k += 1
            continue

        if kind == "out":
            close(stint, d_iso, "marked", stints, events)
            stint = None
            k += 1
            continue

        if kind in ("site", "arrive"):
            target = code if kind == "site" else stint["site"] or "TBC"
            if not stint["sites"] or stint["sites"][-1] != target:
                stint["sites"].append(target)
            stint["site"] = stint["site"] or target
        emit(events, d_iso, code if kind != "arrive" else (stint["site"] or "TBC"))
        k += 1

    if stint is not None:
        planned = add_days(stint["_from_date"], rotation_days)
        calendar_end = days[-1]["date"] if days else planned
        out_date = min(planned, calendar_end)
        close(stint, out_date.isoformat(), "rotation", stints, events)

    for item in stints:
        item.pop("_from_date", None)
        if not item["site"] and item["sites"]:
            item["site"] = item["sites"][0]
        if not item["site"]:
            item["site"] = fallback
            item["sites"] = [fallback]
    return events, stints


def parse_excel_date(raw: str) -> str | None:
    text = clean(raw)
    if not text:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}", text):
        try:
            parsed = date.fromisoformat(text[:10])
            return parsed.isoformat() if parsed.year >= 2020 else None
        except ValueError:
            return None
    return None


def read_csv_rows(path: Path) -> list[list[str]]:
    text = path.read_text(encoding="utf-8-sig", errors="replace")
    return list(csv.reader(text.splitlines()))


def extract_people(rows: list[list[str]], dates: dict[int, date]) -> tuple[list[dict], list[str]]:
    cols = sorted(dates)
    people: list[dict] = []
    warnings: list[str] = []
    role = "Crew"
    for row_index, row in enumerate(rows):
        if row_index < 2:
            continue
        name = clean(row[NAME_COL] if len(row) > NAME_COL else "")
        low = name.lower().rstrip(":").strip()
        if not name:
            continue
        if low in SECTIONS:
            role = SECTIONS[low]
            continue
        if low.startswith("rotation set") or low == "mechanic" and not any(normalize_site(row[c] if len(row) > c else "") for c in LOC_COLS):
            # "Mechanic" rotation rule row under empty KUG placeholders — stop people block.
            if low.startswith("rotation set") or (low == "mechanic" and role == "Mechanic" and people):
                break
            continue
        if low in {"crew", "project:"} or low.startswith("project"):
            break
        if low.startswith("1430") or low in {
            "quarry", "trigram", "siteworks", "water/sewer", "pending project",
            "kugluktuk", "alert", "pond inlet",
        }:
            break

        home_sites: list[str] = []
        for col in LOC_COLS:
            site = normalize_site(row[col] if len(row) > col else "")
            if site and site not in home_sites:
                home_sites.append(site)

        rotation = MECHANIC_ROTATION_DAYS if role == "Mechanic" else DEFAULT_ROTATION_DAYS
        days = []
        for col in cols:
            text = clean(row[col] if len(row) > col else "")
            mark = parse_mark(text) if text else None
            days.append({"date": dates[col], "text": text, "mark": mark})

        person_warnings: list[str] = []
        events, stints = build_timeline_marks(days, home_sites, rotation, person_warnings, name)
        warnings.extend(person_warnings)

        people.append({
            "id": slug(f"{name}-{role}"),
            "name": name,
            "role": role,
            "sheetRow": row_index + 1,
            "active": True,
            "homeSites": home_sites,
            "projectIds": [],
            "inDate": parse_excel_date(row[IN_COL] if len(row) > IN_COL else ""),
            "outDate": parse_excel_date(row[OUT_COL] if len(row) > OUT_COL else ""),
            "rotationDays": rotation,
            "events": events,
            "stints": stints,
            "warnings": [w.split(": ", 1)[1] if ": " in w else w for w in person_warnings],
        })
    return people, warnings


def extract_housing(rows: list[list[str]]) -> dict | None:
    """Scan right-hand Critical project CREW columns on person rows."""
    crew = []
    open_items = []
    for row in rows[3:40]:
        # Housing block sits after the calendar; look for numbered slots near the end.
        for col in range(len(row) - 1, 20, -1):
            name = clean(row[col] if col < len(row) else "")
            role = clean(row[col - 1] if col - 1 < len(row) else "")
            number = clean(row[col - 2] if col - 2 < len(row) else "")
            slot = clean(row[col + 1] if col + 1 < len(row) else "")
            if number.isdigit() and name and role:
                crew.append({
                    "slot": int(number),
                    "role": role,
                    "name": name,
                    "assignment": None if slot.upper() in {"N/A", "NA", "-", ""} else (slot or None),
                })
                break
            if name in {"Brad - Option", "Mike ?", "Sam or Brad?", "Side 2 - space"}:
                open_items.append(name)
                break
    if not crew and not open_items:
        return None
    return {
        "project": "Housing",
        "label": "Critical project CREW",
        "targetStart": None,
        "crew": crew,
        "openQuestions": open_items,
    }


def extract_projects(rows: list[list[str]]) -> list[dict]:
    projects = []
    region = None
    started = False
    for row in rows:
        name = clean(row[NAME_COL] if len(row) > NAME_COL else "")
        low = name.lower().rstrip(":")
        if low == "project":
            started = True
            continue
        if not started or not name:
            continue
        starred = clean(row[1] if len(row) > 1 else "") == "*"
        is_region = (
            (name.isupper() and len(name) > 3)
            or bool(re.match(r"^\d+\s*-", name))
            or low == "pending project"
        )
        if is_region:
            region = re.sub(r"^\d+\s*-\s*", "", name).title()
            continue
        project_id = slug(name) if low != "airside rehab" else slug(f"{region} {name}")
        display = name if low != "airside rehab" else f"{region} {name}"
        projects.append({
            "id": project_id,
            "name": display,
            "year": YEAR,
            "source": "project-timeline",
            "region": region,
            "active": True,
            "starred": starred,
            "windows": [],
        })
    return projects


def merge_flights_from_xlsm(people: list[dict]) -> None:
    path = next((candidate for candidate in XLSM_CANDIDATES if candidate.exists()), None)
    if not path:
        return
    try:
        import openpyxl
    except ImportError:
        return
    wb = openpyxl.load_workbook(path, data_only=True)
    sheet = "Crew - Flights - 2026"
    if sheet not in wb.sheetnames:
        wb.close()
        return
    ws = wb[sheet]
    header_row = next((r for r in range(1, 20) if clean(ws.cell(r, 1).value).upper() == "EMPLOYEE NAME"), None)
    by_name: dict[str, list[dict]] = {}
    if header_row:
        for row in range(header_row + 1, ws.max_row + 1):
            name = clean(ws.cell(row, 1).value)
            arrive = ws.cell(row, 3).value
            depart = ws.cell(row, 5).value
            arrive_d = arrive.date() if isinstance(arrive, datetime) else arrive if isinstance(arrive, date) else None
            depart_d = depart.date() if isinstance(depart, datetime) else depart if isinstance(depart, date) else None
            if not name or not (arrive_d or depart_d):
                continue
            if arrive_d and getattr(arrive_d, "year", 0) < 2020:
                arrive_d = None
            if depart_d and getattr(depart_d, "year", 0) < 2020:
                depart_d = None
            by_name.setdefault(name.upper(), []).append({
                "arriveIqa": iso(arrive_d),
                "arriveRef": clean(ws.cell(row, 2).value) or None,
                "departIqa": iso(depart_d),
                "departRef": clean(ws.cell(row, 4).value) or None,
                "camp": clean(ws.cell(row, 6).value) or None,
                "carService": clean(ws.cell(row, 7).value) or None,
                "note": clean(ws.cell(row, 8).value) or None,
            })
    wb.close()
    for person in people:
        full = FLIGHT_NAMES.get(person["name"])
        if not full:
            continue
        flights = by_name.get(full.upper())
        if flights:
            person["fullName"] = full.title()
            person["flights"] = flights


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    if not path.exists():
        raise SystemExit(f"Missing CSV: {path}")

    rows = read_csv_rows(path)
    if len(rows) < 3:
        raise SystemExit("CSV too short")

    dates = build_calendar(rows[0], rows[1])
    if not dates:
        raise SystemExit("Could not build calendar from CSV header rows")
    cols = sorted(dates)

    people, warnings = extract_people(rows, dates)
    projects = extract_projects(rows)
    housing = extract_housing(rows)
    merge_flights_from_xlsm(people)

    # Drop empty KUG placeholder rows / people with no name already filtered.
    people = [person for person in people if person["name"] and not person["name"].lower().startswith("rotation")]

    mark_counter = Counter(event["mark"] for person in people for event in person["events"])
    payload = {
        "year": YEAR,
        "source": path.name,
        "sheet": "Crew - Schedule - 2026 (CSV export)",
        "note": "Imported from unhidden CSV. Cell shading is not in CSV — Out dates use typed OUT or rotation fallback.",
        "rules": {
            "defaultRotationDays": DEFAULT_ROTATION_DAYS,
            "mechanicRotationDays": MECHANIC_ROTATION_DAYS,
            "calendarStarts": iso(dates[cols[0]]),
            "calendarEnds": iso(dates[cols[-1]]),
        },
        "sites": SITE_NAMES,
        "projects": sorted(projects, key=lambda item: item["name"].lower()),
        "people": people,
        "housingCrew": housing,
        "staffing": [],
        "dayNotes": [],
        "warnings": warnings,
        "stats": {
            "people": len(people),
            "activePeople": sum(1 for person in people if person["active"]),
            "projects": len(projects),
            "datedColumns": len(dates),
            "bridgedColumns": [],
            "dateSpan": [iso(dates[cols[0]]), iso(dates[cols[-1]])],
            "markValues": dict(mark_counter.most_common()),
        },
    }

    out = Path(sys.argv[2]) if len(sys.argv) > 2 else OUT
    out.parent.mkdir(parents=True, exist_ok=True)
    # Copy CSV into data for reproducibility
    data_dir = ROOT / "data"
    data_dir.mkdir(exist_ok=True)
    target_csv = data_dir / path.name
    if path.resolve() != target_csv.resolve():
        target_csv.write_bytes(path.read_bytes())

    out.write_text(
        "export const CREW_SCHEDULE_DATA = " + json.dumps(payload, indent=2, ensure_ascii=False) + " as const;\n",
        encoding="utf-8",
    )

    print(f"Wrote {out}")
    print(f"Copied source CSV -> {target_csv}")
    print(f"People: {payload['stats']['people']} active={payload['stats']['activePeople']}  Projects: {payload['stats']['projects']}")
    print(f"Calendar: {payload['stats']['dateSpan'][0]} -> {payload['stats']['dateSpan'][1]}")
    print("\nEmployees:")
    for person in people:
        stints = person["stints"]
        latest = stints[-1] if stints else None
        latest_txt = (
            f"{latest['from']} -> {latest['out'] or 'open'} ({'/'.join(latest['sites'])})"
            if latest
            else "no stints"
        )
        print(f"  [{person['role']}] {person['name']}  ·  {len(stints)} stint(s)  ·  last {latest_txt}")
    if warnings:
        print(f"\n{len(warnings)} warning(s)")


if __name__ == "__main__":
    main()
