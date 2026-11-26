/**
 * What testers should do on each page while in Test Mode.
 * Keep steps aligned with live Overview / Calendar / Employees / Reports / Settings.
 */

export type GuideStep = { id: string; do: string; expect: string };
export type GuideSection = { id: string; title: string; path: string; about: string; steps: GuideStep[] };

const speed = (id: string, what: string): GuideStep => ({
  id: `${id}-speed`,
  do: `Time how long ${what} takes to appear.`,
  expect: "Loads in about 2 to 3 seconds. The page does not freeze or jump.",
});

export const TEST_GUIDE: GuideSection[] = [
  {
    id: "overview",
    title: "Overview",
    path: "/",
    about: "Live ops day: This week and On site. Future years stay quiet until Calendar has placements. Booking work lives in Reminders and Reports.",
    steps: [
      speed("overview", "this page"),
      {
        id: "overview-today",
        do: "With the year on the current year, read the date at the top.",
        expect: "Today’s date.",
      },
      {
        id: "overview-week",
        do: "Read “This week”.",
        expect: "Arrivals and departures for the week. Sites match Month colours.",
      },
      {
        id: "overview-onsite",
        do: "Open “On site now” if collapsed.",
        expect: "People on site, soonest departures first.",
      },
      {
        id: "overview-planning",
        do: "Switch the year control to 2027, then back.",
        expect: "2027 Overview says to place arrivals and departures on Calendar. Current year comes back with live panels.",
      },
      {
        id: "overview-reminders",
        do: "Open Reminders (bell). Add “TEST - your name”, tick it, delete it.",
        expect: "Each change appears immediately. Reminders follow today, not the year you are browsing.",
      },
    ],
  },
  {
    id: "month",
    title: "Calendar · Month",
    path: "/month",
    about:
      "Edit → camp chips place stays. Arrival and Return brushes. Right-click: departure location, planned arrival, expected departure, extend, notes.",
    steps: [
      speed("month", "the Month grid"),
      {
        id: "month-year",
        do: "Set the year to 2027 for practice.",
        expect: "You are on 2027. Empty days are ready to paint.",
      },
      {
        id: "month-scroll",
        do: "Scroll across days and down people.",
        expect: "Names stay left; dates stay on top. Smooth scroll.",
      },
      {
        id: "month-filters",
        do: "Use Search, Role, and Site, then clear them.",
        expect: "List narrows and comes back.",
      },
      {
        id: "month-place",
        do: "Edit → pick a camp (IQA/POND/ALRT/KUG) → drag empty days on a row.",
        expect: "Stay sticks: Arrival on first day, Departure on last, camp colour.",
      },
      {
        id: "month-open-person",
        do: "Open someone’s coloured stay.",
        expect: "Rotation opens with dates, flights, room. Close it.",
      },
      {
        id: "month-arrival",
        do: "Select Arrival brush. Paint days near the start of a stay (drag either way).",
        expect: "Dashed planned-arrival hatch. No locked Arrival label yet.",
      },
      {
        id: "month-confirm",
        do: "Right-click a hatched day → Planned arrival window → Confirm arrival.",
        expect: "Hatch clears. That day becomes Arrival.",
      },
      {
        id: "month-return",
        do: "Select Return. Paint the last few days of a stay.",
        expect: "Yellow expected-departure window through Departure.",
      },
      {
        id: "month-departure-loc",
        do: "Right-click Arrival or Departure → Departure location → pick a place.",
        expect: "Route shows on the calendar. Edit travel still available.",
      },
      {
        id: "month-extend",
        do: "Right-click a stay → Extend stay → click the new last day.",
        expect: "Departure moves later.",
      },
      {
        id: "month-set-out",
        do: "Right-click a stay day → Set departure date.",
        expect: "That day becomes Departure; days after clear.",
      },
      {
        id: "month-multi",
        do: "Edit → Add multiple → two people, same camp and dates → Add to calendar.",
        expect: "Both rows get the stay.",
      },
      {
        id: "month-note",
        do: "Right-click a stay → Operational note → Add note. Type “Held for weather”.",
        expect: "Note shows on the stay.",
      },
      {
        id: "month-undo",
        do: "Press Ctrl+Z a few times (or Undo).",
        expect: "Each change undoes one at a time.",
      },
      {
        id: "month-delete",
        do: "Right-click a stay → Clear stay dates.",
        expect: "Stay and its travel on those dates clear.",
      },
    ],
  },
  {
    id: "year",
    title: "Calendar · Year",
    path: "/year",
    about: "One coloured line per person. Bars show camp location.",
    steps: [
      speed("year", "the Year view"),
      {
        id: "year-read",
        do: "Follow one person’s line across the year.",
        expect: "You can tell when they are on and off site.",
      },
      {
        id: "year-match",
        do: "Compare with a stay you changed on Month.",
        expect: "Your change shows here too.",
      },
    ],
  },
  {
    id: "list",
    title: "Calendar · List",
    path: "/list",
    about: "Same schedule as a list.",
    steps: [
      speed("list", "the List"),
      {
        id: "list-read",
        do: "Read a few rows.",
        expect: "Name, site, arrival and departure dates make sense.",
      },
      {
        id: "list-match",
        do: "Compare one person with Month.",
        expect: "Same dates in both places.",
      },
    ],
  },
  {
    id: "employees",
    title: "Employees",
    path: "/employees",
    about: "Everyone on the crew: role, site, flights and rooms.",
    steps: [
      speed("emp", "Employees"),
      {
        id: "emp-search",
        do: "Type part of a name in Search, then clear it.",
        expect: "List narrows, then everyone comes back.",
      },
      {
        id: "emp-filter",
        do: "Try role and site filters, then All.",
        expect: "List filters and resets.",
      },
      {
        id: "emp-edit",
        do: "Open someone, change employee info, save.",
        expect: "Updates immediately (test data only).",
      },
      {
        id: "emp-room",
        do: "In their record, check room / accommodation status.",
        expect: "You can see or set room status without leaving the person.",
      },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    path: "/reports",
    about: "Operations report: summary, staffing outlook, action list, charts, planning log, Power BI pack.",
    steps: [
      speed("rep", "Reports"),
      {
        id: "rep-period",
        do: "Change the Period.",
        expect: "Headline and numbers update for that month or year.",
      },
      {
        id: "rep-hero",
        do: "Read the top operations block.",
        expect: "Crew/site story, peak, arrivals, departures. Outstanding bookings stand out if any.",
      },
      {
        id: "rep-outlook",
        do: "Read Staffing outlook.",
        expect: "Next ~30 days chart with a target line.",
      },
      {
        id: "rep-actions",
        do: "Open Action list. Click a person if items exist.",
        expect: "Flights and rooms split. Person record opens.",
      },
      {
        id: "rep-log",
        do: "In Planning log, search a name and filter by action type.",
        expect: "Latest 10 by default; expand shows more.",
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    path: "/settings",
    about: "Sites, roles, travel places and reminder notes.",
    steps: [
      speed("set", "Settings"),
      {
        id: "set-add",
        do: "Add a role called “Test role”, then remove it.",
        expect: "It appears and disappears.",
      },
      {
        id: "set-read",
        do: "Skim each section.",
        expect: "Each section has a clear description.",
      },
    ],
  },
];

export function sectionForPath(pathname: string): GuideSection {
  const match = [...TEST_GUIDE]
    .filter((s) => s.path !== "/")
    .find((s) => pathname === s.path || pathname.startsWith(`${s.path}/`));
  return match ?? TEST_GUIDE[0]!;
}

/** All step ids (for ticks / reporting). */
export function allGuideStepIds(): string[] {
  return TEST_GUIDE.flatMap((section) => section.steps.map((step) => step.id));
}
