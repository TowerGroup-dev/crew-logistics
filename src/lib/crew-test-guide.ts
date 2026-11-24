/**
 * What testers should do on each page while in Test Mode. Shown in the Test guide panel.
 * Keep steps aligned with the live Month / Overview / Employees UI (Edit mode, brushes,
 * right-click menus, Overview confirm). Step ids are stable for session ticks + feedback logs.
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
    about: "Who is on site, who moves this week, flights, open tasks, and tentative arrivals.",
    steps: [
      speed("overview", "this page"),
      {
        id: "overview-onsite",
        do: "Read “On site now”.",
        expect: "Sites match the Month colours (e.g. Mike Reid at IQA, not a stale Pond).",
      },
      {
        id: "overview-week",
        do: "Read “This week”: who arrives, who leaves.",
        expect: "Leave sites match Month camp colours, not old travel-desk labels.",
      },
      {
        id: "overview-flights",
        do: "Read “Flights”.",
        expect: "Each person shows a flight date or what is missing.",
      },
      {
        id: "overview-todo",
        do: "Read “To do” / Confirm arrivals.",
        expect: "Tentative arrivals show a book-by date (2 weeks before). Or “No open items…”.",
      },
      {
        id: "overview-confirm",
        do: "If a Confirm arrival line is there, open it and confirm (or note none).",
        expect: "Confirmed people move into This week; calendar IN locks when confirmed from Month.",
      },
      {
        id: "overview-reminders",
        do: "Open Reminders (bell). Add one called “TEST - your name”, tick it, then delete it.",
        expect: "Each change appears immediately.",
      },
      {
        id: "overview-names",
        do: "Check names you know against Month.",
        expect: "Spelling, site and dates match the calendar.",
      },
    ],
  },
  {
    id: "month",
    title: "Calendar · Month",
    path: "/month",
    about:
      "Month schedule. Switch to Edit to paint. Camp chips place stays; Travel paints empty travel days; Return paints the yellow window. Right-click for routes, Extend Stay, End stay, notes, tentative.",
    steps: [
      speed("month", "the Month grid"),
      {
        id: "month-scroll",
        do: "Scroll across the days and down the people.",
        expect: "Scrolling is smooth. Names stay on the left; dates stay on top.",
      },
      {
        id: "month-filters",
        do: "Use Search, Role, and Site above the calendar, then clear them.",
        expect: "The people list narrows and comes back. Same filters as List.",
      },
      {
        id: "month-open-person",
        do: "In View (or after a click that opens), open someone’s coloured stay.",
        expect: "Their rotation opens: dates, flights, room. Close it.",
      },
      {
        id: "month-place",
        do: "Switch to Edit, pick a camp colour (IQA/POND/ALRT/KUG), drag empty days on a row.",
        expect: "Stay sticks after you release: first day IN, last day OUT, camp colour.",
      },
      {
        id: "month-extend",
        do: "Right-click a stay → Extend Stay, then click the new last day — or drag the OUT end further right.",
        expect: "The OUT day moves later. Flash confirms the new last day.",
      },
      {
        id: "month-end",
        do: "Right-click a stay day → End stay on this day.",
        expect: "That day becomes OUT; days after clear.",
      },
      {
        id: "month-travel-in",
        do: "Right-click the IN day → Add route in. From Ottawa (or home) To the camp, Save.",
        expect: "IN day shows the arrive route (e.g. → IQA). Click the cell to edit again.",
      },
      {
        id: "month-travel-out",
        do: "Right-click the OUT day → Add route home. To Ottawa (or home), Save.",
        expect: "OUT day stays camp-coloured with leave route (e.g. IQA → YOW), not a grey “OUT” label.",
      },
      {
        id: "month-travel-days",
        do: "Edit → Travel chip, drag empty days before a stay (or between camps). Set From/To, optional stop, Save.",
        expect: "Hub nights stay grey; arrival into a camp uses that camp’s colour. Click a travel cell to edit.",
      },
      {
        id: "month-travel-suggest",
        do: "Add another similar route (same From/To) after saving one with a stop.",
        expect: "Previous routes appear; Accept fills stops. You still click Save.",
      },
      {
        id: "month-tentative",
        do: "Right-click a stay → Mark tentative arrival (or through a later day). Check Overview To do.",
        expect: "IN? on those days; Overview shows book-by ~2 weeks before. Confirm arrival locks real IN.",
      },
      {
        id: "month-search",
        do: "Type a name in Search (e.g. Maegan).",
        expect: "Only matching people stay on the Month list.",
      },
      {
        id: "month-multi",
        do: "Edit → Add multiple, pick two people, same camp and dates, Add to calendar.",
        expect: "Both rows get the stay on Month.",
      },
      {
        id: "month-return",
        do: "Click Return, then click a stay day (or drag the last few days).",
        expect: "Yellow return window on those days through OUT.",
      },
      {
        id: "month-note",
        do: "Right-click a stay → Add note. Type “Held for weather”.",
        expect: "The note shows across the stay bar.",
      },
      {
        id: "month-undo",
        do: "Press Ctrl+Z a few times (or Undo).",
        expect: "Each Month change is undone, one at a time.",
      },
      {
        id: "month-delete",
        do: "Click a grey travel cell and delete, or clear a placement from the menu.",
        expect: "Travel or stay disappears; unrelated camps stay.",
      },
      {
        id: "month-year",
        do: "Use the year control (top) to go to 2027 and back to 2026.",
        expect: "The grid changes year quickly; days under the scroll stay filled in.",
      },
    ],
  },
  {
    id: "year",
    title: "Calendar · Year",
    path: "/year",
    about: "Year view: one coloured line per person from January through December. Bars show camp location only.",
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
    about: "The same schedule as a list.",
    steps: [
      speed("list", "the List"),
      {
        id: "list-read",
        do: "Read a few rows.",
        expect: "Name, site, in and out dates make sense.",
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
    about: "Everyone on the crew with role, site, flights and rooms.",
    steps: [
      speed("emp", "Employees"),
      {
        id: "emp-search",
        do: "Type part of a name in Search, then clear it.",
        expect: "The list narrows as you type, then everyone comes back.",
      },
      {
        id: "emp-filter",
        do: "Try the role and site filters, then set them back to All.",
        expect: "The list filters and resets.",
      },
      {
        id: "emp-edit",
        do: "Open someone, edit employee info, change something and save.",
        expect: "It saves and updates immediately (test data only).",
      },
    ],
  },
  {
    id: "accommodation",
    title: "Accommodation",
    path: "/accommodation",
    about: "Rooms for people on site or arriving within 2 weeks.",
    steps: [
      speed("acc", "Accommodation"),
      {
        id: "acc-read",
        do: "Read the rooms.",
        expect: "People without rooms are marked clearly.",
      },
      {
        id: "acc-confirm",
        do: "Mark one person’s room as confirmed.",
        expect: "It updates immediately.",
      },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    path: "/reports",
    about: "Crew report, attention report, headcounts and charts.",
    steps: [
      speed("rep", "Reports"),
      {
        id: "rep-period",
        do: "Change the Period.",
        expect: "Numbers and charts update.",
      },
      {
        id: "rep-attention",
        do: "Read the Attention report.",
        expect: "People missing flights or rooms, or “all booked”.",
      },
      {
        id: "rep-charts",
        do: "Hover the charts.",
        expect: "They draw, labels are readable, hovering shows numbers.",
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    path: "/settings",
    about: "Sites, roles, travel places and reminder timing.",
    steps: [
      speed("set", "Settings"),
      {
        id: "set-add",
        do: "Add a role called “Test role”, then remove it.",
        expect: "It appears and disappears.",
      },
      {
        id: "set-read",
        do: "Read each section.",
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
