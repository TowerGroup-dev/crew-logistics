/**
 * What testers should do on each page while in Test Mode. Shown in the Test guide panel.
 * Step ids match the checklist in Yimika's Workspace (Feedback → Crew Schedule testing),
 * where testers record Works / Problem.
 */

export type GuideStep = { id: string; do: string; expect: string };
export type GuideSection = { id: string; title: string; path: string; about: string; steps: GuideStep[] };

const speed = (id: string, what: string): GuideStep => ({
  id: `${id}-speed`,
  do: `Notice how long ${what} took to show.`,
  expect: "About 2–3 seconds or less, nothing freezes or jumps.",
});

export const TEST_GUIDE: GuideSection[] = [
  {
    id: "overview",
    title: "Overview",
    path: "/",
    about: "The morning check: who is on site, who moves this week, flights and the to-do list.",
    steps: [
      speed("overview", "this page"),
      { id: "overview-onsite", do: "Read “On site now”.", expect: "Sites match the Month colours (e.g. Mike Reid at IQA, not a stale Pond)." },
      { id: "overview-week", do: "Read “This week”: who arrives, who leaves.", expect: "Leave sites match Month camp colours, not old travel-desk labels." },
      { id: "overview-flights", do: "Read “Flights”.", expect: "Each person shows a flight date or what is missing." },
      { id: "overview-todo", do: "Read “To do”.", expect: "Things to book, or “Nothing pressing this week or next.”" },
      { id: "overview-reminders", do: "Open Reminders (bell). Add one called “TEST – your name”, tick it, then delete it.", expect: "Each change shows straight away." },
      { id: "overview-names", do: "Check names you know against Month.", expect: "Spelling, site and dates match the calendar." },
    ],
  },
  {
    id: "month",
    title: "Calendar · Month",
    path: "/month",
    about: "The schedule like the Excel sheet. In Test Mode you can change anything: try it all.",
    steps: [
      speed("month", "the Month grid"),
      { id: "month-scroll", do: "Scroll across the days and down the people.", expect: "Smooth. Names stay on the left, dates stay on top." },
      { id: "month-open-person", do: "Click once on someone’s coloured bar.", expect: "Their rotation opens: dates, flights, room. Close it." },
      { id: "month-place", do: "Switch to Edit, pick a camp colour (IQA/POND/ALRT/KUG), drag empty days.", expect: "A stay appears: first day IN, last day OUT." },
      { id: "month-extend", do: "Drag from the end of a stay further right.", expect: "The OUT day moves later." },
      { id: "month-travel-direct", do: "Select Travel, click one empty day, enter Ottawa → IQA, Coming to camp, No overnight, Save.", expect: "That day is grey with OTT → IQA (or YOW → IQA). Camp colours elsewhere stay." },
      { id: "month-travel-stops", do: "Select Travel, drag two empty days, enter Ottawa → Edmonton → IQA with overnight, Save.", expect: "Grey days show the legs; click a grey cell to edit." },
      { id: "month-travel-transfer", do: "With KUG then IQA camps on a row, Travel-paint the gap, enter KUG → IQA, Camp transfer, Save.", expect: "Grey shows KUG → IQA with no forced Ottawa hub." },
      { id: "month-return", do: "Click Return, then click a stay day (or drag the last few days).", expect: "Yellow return window on those days through OUT." },
      { id: "month-note", do: "Right-click a stay → Add note. Type “Linger for snow”.", expect: "The note shows on the bar." },
      { id: "month-undo", do: "Press Ctrl+Z a few times (or the Undo button).", expect: "Each change is undone, one at a time." },
      { id: "month-delete", do: "Click a grey travel cell → Delete (or clear a placement).", expect: "Travel or stay disappears; unrelated camps stay." },
      { id: "month-year", do: "Use the year arrows (top right) to go forward a year and back.", expect: "The grid changes year without errors." },
    ],
  },
  {
    id: "year",
    title: "Calendar · Year",
    path: "/year",
    about: "The whole year, one line per person.",
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
      { id: "emp-edit", do: "Open someone, click Edit employee info, change something and save.", expect: "It saves and shows straight away (only in your test)." },
    ],
  },
  {
    id: "travel",
    title: "Travel",
    path: "/travel",
    about: "Flights to and from site.",
    steps: [
      speed("travel", "Travel"),
      { id: "travel-read", do: "Read the Outbound and Inbound lists.", expect: "Route, date and booked or not, for each person." },
      { id: "travel-add", do: "Open a person’s flight, add a booking reference (e.g. ABC123) and mark it confirmed.", expect: "It shows as booked." },
    ],
  },
  {
    id: "accommodation",
    title: "Accommodation",
    path: "/accommodation",
    about: "Rooms for people on site or arriving within 2 weeks.",
    steps: [
      speed("acc", "Accommodation"),
      { id: "acc-read", do: "Read the rooms.", expect: "Missing rooms are clearly flagged." },
      { id: "acc-confirm", do: "Mark one person’s room as confirmed.", expect: "It updates straight away." },
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
      { id: "set-read", do: "Read each section.", expect: "Each one explains itself in plain words." },
    ],
  },
];

export function sectionForPath(pathname: string): GuideSection {
  const match = [...TEST_GUIDE]
    .filter((s) => s.path !== "/")
    .find((s) => pathname === s.path || pathname.startsWith(`${s.path}/`));
  return match ?? TEST_GUIDE[0];
}
