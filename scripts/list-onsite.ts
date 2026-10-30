import { CREW_SCHEDULE, crewSnapshot, currentStretch, personSegments } from "../src/lib/crew-schedule";

const today = "2026-10-29";
for (const person of CREW_SCHEDULE.people) {
  const snap = crewSnapshot(person, today);
  if (snap.duty !== "on_site" && snap.duty !== "in_transit") continue;
  console.log(
    person.id.padEnd(36),
    "in",
    snap.plannedIn,
    "out",
    snap.plannedOut,
    "until",
    snap.daysUntilOut,
    "away",
    snap.daysAway,
    "overdue",
    snap.overdue,
  );
}

const eric = CREW_SCHEDULE.people.find((person) => person.id.includes("eric"));
console.log("ERIC events", eric?.events);
console.log("ERIC in/out dates", eric?.inDate, eric?.outDate);
console.log("ERIC stretch", eric ? currentStretch(eric, today) : null);
console.log("ERIC segs", eric ? personSegments(eric) : null);
