"""Extract Tower Arctic crew schedule from the master XLSM (CSV fallback).

Year comes from the sheet name / workbook, not from broken Excel serials like 1/0/1900.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from datetime import date, datetime, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "lib" / "crew-schedule-data.ts"
XLSM = Path(r"C:\Users\OyeyimikaAdeoye\Downloads\2026_ Crew Schedules (Master).xlsm")
CSV = Path(r"C:\Users\OyeyimikaAdeoye\Downloads\2026_ Crew Schedules (Master) - Copy(Crew - Schedule - 2026).csv")

YEAR = 2026
SCHEDULE_SHEET = "Crew - Schedule - 2026"
STAFF_SHEET = "Required Staff "

MONTH_MAP = {
    "january": 1,
    "jan": 1,
    "february": 2,
    "febraury": 2,
    "feb": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}

SECTIONS = {
    "managers": "Managers",
    "surveyors": "Surveyors",
    "operators/truck drivers": "Operators / Truck Drivers",
    "labourers": "Labourers",
    "mechanics": "Mechanics",
}

SKIP_NAMES = {
    "crew",
    "project:",
    "trigram",
    "quarry",
    "46 plex",
    "siteworks",
    "water/sewer",
    "valve replacement",
    "cbc - access road and piles",
    "nrc",
    "critical pipeline project",
    "steam building",
    "nunavut heritage center",
    "hospital hill (bdl)",
    "kugluktuk",
    "airside rehab",
    "alert",
    "waterline project",
    "pond inlet",
    "wtp project",
    "daycare",
    "idp project (pond)",
    "rotation set:",
    "rotation set",
    "mechanic",
    "brad - option",
    "side 2 - space",
    "mike ?",
    "sam or brad?",
    "needed:",
    "critical project crew",
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
    "YK": "YK",
    "YEG": "YEG",
    "YF": "YF",
}


def clean(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def normalize_site(raw: object) -> str | None:
    text = clean(raw).upper()
    if not text:
        return None
    return SITE_ALIASES.get(text, text if text.isalpha() and len(text) <= 5 else None)


def normalize_mark(raw: object) -> str | None:
    text = clean(raw)
    if not text:
        return None
    upper = text.upper().replace(" ", "")
    if upper in {"OUT", "IN"}:
        return upper.title()
    if "-->" in upper or "→" in text:
        return "Transfer"
    if upper in SITE_ALIASES:
        return SITE_ALIASES[upper]
    parts = re.split(r"[,/]+", upper)
    mapped = []
    for part in parts:
        site = SITE_ALIASES.get(part.strip())
        if site:
            mapped.append(site)
    mapped = list(dict.fromkeys(mapped))
    if not mapped:
        return None
    if len(mapped) == 1:
        return mapped[0]
    return " / ".join(mapped)


def parse_sheet_date(value: object, year: int) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        if value.year < 2020:
            return None
        return value.date().isoformat()
    if isinstance(value, date):
        if value.year < 2020:
            return None
        return value.isoformat()
    if isinstance(value, time):
        return None
    if isinstance(value, (int, float)):
        # Excel serials in the Days column are not rotation lengths.
        if value > 400:
            return None
        return None
    text = clean(value)
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", text)
    if not m:
        return None
    month, day, parsed_year = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if parsed_year < 2020:
        return None
    try:
        return date(parsed_year, month, day).isoformat()
    except ValueError:
        return None


def parse_rotation_days(value: object) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime) or isinstance(value, date) or isinstance(value, time):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        text = clean(value).replace(",", "")
        try:
            number = float(text)
        except ValueError:
            return None
    if number <= 0 or number > 120:
        return None
    return int(number)


def year_from_sheet(name: str, fallback: int) -> int:
    match = re.search(r"(20\d{2})", name)
    return int(match.group(1)) if match else fallback


def build_date_map(row0: list[object], row1: list[object], year: int) -> dict[int, str]:
    month_at: dict[int, int] = {}
    for index, cell in enumerate(row0):
        key = re.sub(r"[^a-z]", "", clean(cell).lower())
        if key in MONTH_MAP:
            month_at[index] = MONTH_MAP[key]

    # Leading day columns before the first month label belong to January of the sheet year.
    first_month_col = min(month_at) if month_at else None
    if first_month_col is not None and first_month_col > 0 and 1 not in month_at.values():
        pass
    if first_month_col is not None:
        # Days before the January header still count as January when the header sits on day 1.
        for index in range(0, first_month_col):
            day_text = clean(row1[index]) if index < len(row1) else ""
            if day_text.isdigit() and 1 <= int(day_text) <= 31 and month_at.get(index) is None:
                # Only backfill if these look like January continuation (8..31 before Jan 1 header).
                if int(day_text) >= 8:
                    month_at[index] = 1

    def month_for(col: int) -> int | None:
        current = None
        for index in sorted(month_at):
            if index <= col:
                current = month_at[index]
            else:
                break
        return current

    dates: dict[int, str] = {}
    for col in range(len(row1)):
        day_cell = row1[col]
        day = None
        if isinstance(day_cell, (int, float)) and float(day_cell).is_integer():
            day = int(day_cell)
        else:
            day_text = clean(day_cell)
            if day_text.isdigit():
                day = int(day_text)
        if day is None or day < 1 or day > 31:
            continue
        month = month_for(col)
        if not month:
            continue
        try:
            dates[col] = date(year, month, day).isoformat()
        except ValueError:
            continue
    return dates


def extract_projects_from_required_staff(wb) -> list[dict]:
    if STAFF_SHEET not in wb.sheetnames:
        return []
    ws = wb[STAFF_SHEET]
    projects = []
    for row in ws.iter_rows(min_row=3, max_row=80, max_col=10, values_only=True):
        name = clean(row[0])
        if not name or name.lower() in SKIP_NAMES or name.lower().startswith("needed"):
            continue
        projects.append(
            {
                "id": slug(name),
                "name": name,
                "year": YEAR,
                "source": "required-staff",
            }
        )
    # de-dupe
    by_id: dict[str, dict] = {}
    for project in projects:
        by_id[project["id"]] = project
    return list(by_id.values())


def extract_side_projects_and_links(ws, max_col: int) -> tuple[list[dict], dict[str, list[str]]]:
    """Parse the small crew/project list on the far right of the schedule sheet."""
    projects: dict[str, dict] = {}
    links: dict[str, list[str]] = {}
    role_hint = re.compile(r"labour|labor|survey|operator|truck|manager|mechanic|foreman", re.I)
    for row in ws.iter_rows(min_row=1, max_row=80, min_col=max(1, max_col - 30), max_col=max_col, values_only=True):
        cells = [clean(cell) for cell in row if clean(cell)]
        if len(cells) < 3:
            continue
        # Patterns like: 1, Labourer, Bernie, Side 2
        for index in range(len(cells) - 3):
            if not re.fullmatch(r"\d+", cells[index]):
                continue
            role, name, project_name = cells[index + 1], cells[index + 2], cells[index + 3]
            if not role_hint.search(role):
                continue
            if project_name.lower() in {"n/a", "na", "-"} or re.fullmatch(r"\d+", project_name):
                continue
            if len(project_name) < 2:
                continue
            project_id = slug(project_name)
            projects[project_id] = {
                "id": project_id,
                "name": project_name,
                "year": YEAR,
                "source": "schedule-side",
            }
            key = name.lower()
            links.setdefault(key, [])
            if project_id not in links[key]:
                links[key].append(project_id)
    return list(projects.values()), links


def extract_from_xlsm(path: Path) -> dict:
    import openpyxl

    wb = openpyxl.load_workbook(path, data_only=True, keep_vba=False, read_only=True)
    if SCHEDULE_SHEET not in wb.sheetnames:
        raise SystemExit(f"Missing sheet {SCHEDULE_SHEET!r}. Found: {wb.sheetnames}")

    year = year_from_sheet(SCHEDULE_SHEET, YEAR)
    ws = wb[SCHEDULE_SHEET]
    matrix = [list(row) for row in ws.iter_rows(min_row=1, max_row=60, max_col=420, values_only=True)]
    row0 = matrix[0]
    row1 = matrix[1]
    dates = build_date_map(row0, row1, year)

    role = "Crew"
    people = []
    mark_counter: Counter[str] = Counter()

    for row in matrix[2:]:
        name = clean(row[3] if len(row) > 3 else "")
        if not name:
            continue
        low = name.lower().rstrip(":")
        if low in SECTIONS:
            role = SECTIONS[low]
            continue
        if low in SKIP_NAMES or low.startswith("project") or name.startswith("*"):
            continue
        if re.fullmatch(r"\d+", name):
            continue

        location_a = normalize_site(row[0] if len(row) > 0 else "")
        location_b = normalize_site(row[1] if len(row) > 1 else "")
        in_date = parse_sheet_date(row[4] if len(row) > 4 else None, year)
        out_date = parse_sheet_date(row[5] if len(row) > 5 else None, year)
        days = parse_rotation_days(row[6] if len(row) > 6 else None)
        if days is None:
            days = parse_rotation_days(row[4] if len(row) > 4 else None)

        marks: dict[str, str] = {}
        for col, iso in dates.items():
            if col >= len(row):
                break
            mark = normalize_mark(row[col])
            if not mark:
                continue
            marks[iso] = mark
            mark_counter[mark] += 1

        if not marks and not location_a and not location_b and not in_date and not out_date and not days:
            continue

        home_sites = []
        for code in [location_a, location_b]:
            if code and code not in home_sites:
                home_sites.append(code)

        people.append(
            {
                "id": slug(f"{name}-{role}"),
                "name": name,
                "role": role,
                "homeSites": home_sites,
                "projectIds": [],
                "inDate": in_date,
                "outDate": out_date,
                "rotationDays": days if days in {28, 42} or (days and days >= 14) else (42 if days == 42 else days),
                "events": [{"date": day, "mark": mark} for day, mark in sorted(marks.items())],
            }
        )

    staff_projects = extract_projects_from_required_staff(wb)
    side_projects, side_links = extract_side_projects_and_links(ws, 420)
    wb.close()

    by_key: dict[str, dict] = {}
    for person in people:
        key = f"{person['name'].lower()}|{person['role']}"
        existing = by_key.get(key)
        if not existing or len(person["events"]) > len(existing["events"]):
            by_key[key] = person
    people = sorted(by_key.values(), key=lambda item: (item["role"], item["name"].lower()))

    def linked_projects_for(name: str) -> list[str]:
        key = name.lower()
        found: list[str] = []
        for alias, project_ids in side_links.items():
            if alias == key or key.startswith(alias + " ") or alias.startswith(key.split(" ")[0]):
                for project_id in project_ids:
                    if project_id not in found:
                        found.append(project_id)
        return found

    for person in people:
        person["projectIds"] = linked_projects_for(person["name"])

    projects_by_id = {project["id"]: project for project in staff_projects}
    for project in side_projects:
        projects_by_id.setdefault(project["id"], project)
    # Always include Side / Housing style projects even if only linked
    for person in people:
        for project_id in person["projectIds"]:
            projects_by_id.setdefault(
                project_id,
                {"id": project_id, "name": project_id.replace("-", " ").title(), "year": year, "source": "linked"},
            )

    return {
        "year": year,
        "source": path.name,
        "sheet": SCHEDULE_SHEET,
        "note": (
            f"Imported from {SCHEDULE_SHEET}. Calendar year is {year}. "
            "Day cells are event marks (site In / Out); the app expands each mark forward until the next event. "
            "Excel serials and 1900 placeholder dates are ignored."
        ),
        "sites": {
            "IQA": "Iqaluit",
            "POND": "Pond Inlet",
            "ALRT": "Alert",
            "KUG": "Kugluktuk",
            "YK": "Yellowknife",
            "YEG": "Edmonton",
            "YF": "Airport / transfer",
            "Out": "Off rotation",
            "In": "Arriving",
            "Transfer": "In transit",
        },
        "projects": sorted(projects_by_id.values(), key=lambda item: item["name"].lower()),
        "people": people,
        "stats": {
            "people": len(people),
            "projects": len(projects_by_id),
            "datedColumns": len(dates),
            "dateSpan": [min(dates.values()), max(dates.values())] if dates else [],
            "markValues": dict(mark_counter.most_common()),
        },
    }


def main() -> None:
    if not XLSM.exists():
        raise SystemExit(f"Missing XLSM: {XLSM}")
    payload = extract_from_xlsm(XLSM)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "export const CREW_SCHEDULE_DATA = " + json.dumps(payload, indent=2) + " as const;\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUT}")
    print(f"Year: {payload['year']}")
    print(f"People: {payload['stats']['people']}")
    print(f"Projects: {payload['stats']['projects']}")
    print(f"Date columns: {payload['stats']['datedColumns']} span={payload['stats']['dateSpan']}")
    print("Roles:", Counter(person["role"] for person in payload["people"]))
    for project in payload["projects"][:12]:
        print(f"  project: {project['name']}")
    for person in payload["people"]:
        print(
            f"- {person['role']}: {person['name']} "
            f"sites={person['homeSites']} projects={person['projectIds']} "
            f"events={len(person['events'])} in={person['inDate']} out={person['outDate']} rot={person['rotationDays']}"
        )


if __name__ == "__main__":
    main()
