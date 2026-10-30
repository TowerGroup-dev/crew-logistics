import {
  CREW_SCHEDULE,
  crewOverview,
  crewSnapshot,
  currentStretch,
  resolvePlannedOut,
} from "../src/lib/crew-schedule";

const today = "2026-10-29";

for (const id of ["bernie-labourers", "eric-jacobsen-managers", "shannon-mechanics"]) {
  const person = CREW_SCHEDULE.people.find((row) => row.id === id);
  if (!person) continue;
  const snap = crewSnapshot(person, today);
  console.log("\n===", person.id);
  console.log("stretch", currentStretch(person, today));
  console.log("resolveOut", person.events.at(-1) && resolvePlannedOut(person, snap.plannedIn || ""));
  console.log("snap", {
    duty: snap.duty,
    site: snap.site,
    plannedIn: snap.plannedIn,
    plannedOut: snap.plannedOut,
    daysOnSite: snap.daysOnSite,
    rotationDay: snap.rotationDay,
    daysUntilOut: snap.daysUntilOut,
    overdue: snap.overdue,
    dueSoon: snap.dueSoon,
  });
}

const overview = crewOverview(today);
console.log("\noverview", {
  total: overview.total,
  onSite: overview.onSite,
  off: overview.offRotation,
  inTransit: overview.inTransit,
  upcoming: overview.upcoming,
  unassigned: overview.unassigned,
  sum: overview.onSite + overview.offRotation + overview.inTransit + overview.upcoming + overview.unassigned,
  overdue: overview.overdue,
  dueSoon: overview.dueSoon,
});

const weird = overview.rows.filter(
  (row) => row.plannedIn && row.plannedOut && row.plannedOut <= row.plannedIn,
);
console.log(
  "invalid plannedOut<=plannedIn",
  weird.map((row) => ({ id: row.person.id, in: row.plannedIn, out: row.plannedOut })),
);

const williams = overview.rows.filter((row) => row.person.name === "William Matthews");
console.log(
  "william rows",
  williams.map((row) => ({ id: row.person.id, role: row.person.role, duty: row.duty })),
);
