/**
 * What testers should do on each page while in Test Mode. Shown in the Test guide panel.
 * Step ids match the checklist in Yimika's Workspace (Feedback → Crew Schedule testing),
 * where testers record Works / Problem.
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
    about: "Who is on site, who moves this week, flights, and open tasks.",
    steps: [
      speed("overview", "this page"),
      { id: "overview-onsite", do: "Read “On site now”.", expect: "Sites match the Month colours (e.g. Mike Reid at IQA, not a stale Pond)." },
      { id: "overview-week", do: "Read “This week”: who arrives, who leaves.", expect: "Leave sites match Month camp colours, not old travel-desk labels." },
      { id: "overview-flights", do: "Read “Flights”.", expect: "Each person shows a flight date or what is missing." },
      { id: "overview-todo", do: "Read “To do”.", expect: "Things to book, or “No open items this week or next.”" },
      { id: "overview-reminders", do: "Open Reminders (bell). Add one called “TEST - your name”, tick it, then delete it.", expect: "Each change appears immediately." },
      { id: "overview-names", do: "Check names you know against Month.", expect: "Spelling, site and dates match the calendar." },
    ],
  },
  {
    id: "month",
    title: "Calendar · Month",
    path: "/month",
    about: "Month calendar schedule. In Test Mode you can edit freely without saving to live data.",
    steps: [
      speed("month", "the Month grid"),
      { id: "month-scroll", do: "Scroll across the days and down the people.", expect: "Scrolling is smooth. Names stay on the left; dates stay on top." },
      { id: "month-open-person", do: "Click once on someone’s coloured bar.", expect: "Their rotation opens: dates, flights, room. Close it." },
      { id: "month-place", do: "Switch to Edit, pick a camp colour (IQA/POND/ALRT/KUG), drag empty days.", expect: "A stay appears: first day IN, last day OUT." },
      { id: "month-extend", do: "Drag from the end of a stay further right.", expect: "The OUT day moves later." },
      { id: "month-travel-direct", do: "Select Travel, click one empty day, enter Ottawa to IQA, Coming to camp, No overnight, Save.", expect: "That day is grey with OTT to IQA (or YOW to IQA). Camp colours elsewhere stay." },
      { id: "month-travel-stops", do: "Select Travel, drag two empty days, enter Ottawa to Edmonton to IQA with overnight, Save.", expect: "Grey days show the legs; click a grey cell to edit." },
      { id: "month-travel-transfer", do: "With KUG then IQA camps on a row, select Travel and mark the empty days between camps, enter KUG to IQA, Camp transfer, Save.", expect: "Grey shows KUG to IQA with no forced Ottawa hub." },
      { id: "month-travel-suggest", do: "Select Travel again for Ottawa to IQA after saving a stopover route once.", expect: "Previous routes appear; Accept fills stops. You still click Save." },
      { id: "month-multi", do: "Edit, Add multiple, pick two people, same camp and dates, Add to calendar.", expect: "Both rows get the stay on Month." },
      { id: "month-return", do: "Click Return, then click a stay day (or drag the last few days).", expect: "Yellow return window on those days through OUT." },
      { id: "month-note", do: "Right-click a stay, Add note. Type “Held for weather”.", expect: "The note shows on the bar." },
      { id: "month-undo", do: "Press Ctrl+Z a few times (or the Undo button).", expect: "Each change is undone, one at a time." },
      { id: "month-delete", do: "Click a grey travel cell, Delete (or clear a placement).", expect: "Travel or stay disappears; unrelated camps stay." },
      { id: "month-year", do: "Use the year arrows (top right) to go forward a year and back.", expect: "The grid changes year without errors." },
    ],
  },
  {
    id: "year",
    title: "Calendar · Year",
    path: "/year",
    about: "Year view: one coloured line per person from January through December. Bars show camp location only.",
    steps: [
      speed("year", "the Year view"),
      { id: "year-read", do: "Follow one person’s line across the year.", expect: "You can tell when they are on and off site." },
      { id: "year-match", do: "Compare with a stay you changed on Month.", expect: "Your change shows here too." },
    ],
  },
  {
    id: "list",
    title: "Calendar · List",
    path: "/list",
    about: "The same schedule as a list.",
    steps: [
      speed("list", "the List"),
      { id: "list-read", do: "Read a few rows.", expect: "Name, site, in and out dates make sense." },
      { id: "list-match", do: "Compare one person with Month.", expect: "Same dates in both places." },
    ],
  },
  {
    id: "employees",
    title: "Employees",
    path: "/employees",
    about: "Everyone on the crew with role, site, flights and rooms.",
    steps: [
      speed("emp", "Employees"),
      { id: "emp-search", do: "Type part of a name in Search, then clear it.", expect: "The list narrows as you type, then everyone comes back." },
      { id: "emp-filter", do: "Try the role and site filters, then set them back to All.", expect: "The list filters and resets." },
      { id: "emp-edit", do: "Open someone, click Edit employee info, change something and save.", expect: "It saves and updates immediately (test data only)." },
    ],
  },
  {
    id: "accommodation",
    title: "Accommodation",
    path: "/accommodation",
    about: "Rooms for people on site or arriving within 2 weeks.",
    steps: [
      speed("acc", "Accommodation"),
      { id: "acc-read", do: "Read the rooms.", expect: "People without rooms are marked clearly." },
      { id: "acc-confirm", do: "Mark one person’s room as confirmed.", expect: "It updates immediately." },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    path: "/reports",
    about: "Crew report, attention report, headcounts and charts.",
    steps: [
      speed("rep", "Reports"),
      { id: "rep-period", do: "Change the Period.", expect: "Numbers and charts update." },
      { id: "rep-attention", do: "Read the Attention report.", expect: "People missing flights or rooms, or “all booked”." },
      { id: "rep-charts", do: "Hover the charts.", expect: "They draw, labels are readable, hovering shows numbers." },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    path: "/settings",
    about: "Sites, roles, travel places and reminder timing.",
    steps: [
      speed("set", "Settings"),
      { id: "set-add", do: "Add a role called “Test role”, then remove it.", expect: "It appears and disappears." },
      { id: "set-read", do: "Read each section.", expect: "Each section has a clear description." },
    ],
  },
];

export function sectionForPath(pathname: string): GuideSection {
  const match = [...TEST_GUIDE]
    .filter((s) => s.path !== "/")
    .find((s) => pathname === s.path || pathname.startsWith(`${s.path}/`));
  return match ?? TEST_GUIDE[0];
}
