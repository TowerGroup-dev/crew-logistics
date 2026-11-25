"use client";

import { movesOnCalendar } from "@/lib/crew-site-days";
import { CrewTripForm } from "@/components/crew-trip-form";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BedDouble, PlaneLanding, PlaneTakeoff, Plus, Trash2, X } from "lucide-react";
import { roleLabel, scheduleYearOutExclusive, type CrewPerson } from "@/lib/crew-schedule";
import {
  emptyStay,
  emptyTravel,
  evaluateReadiness,
  extendRotationOut,
  inclusiveOut,
  linkReplacement,
  peopleFreeForWindow,
  rotationDayNumber,
  upsertRotation,
  type CrewRotation,
  type RotationBook,
  type RotationStay,
  type RotationTravel,
  type TravelDirection,
  ASSUMED_PNR,
  newMove,
  travelIsBooked,
  type RotationMove,
} from "@/lib/crew-rotations";
import {
  DEFAULT_ROTATION_DAYS,
  MAX_ROTATION_DAYS,
  STANDARD_ROTATION_DAYS,
  addNextRotation,
  extendStay,
  getStayNote,
  MAX_STAY_NOTE_CHARS,
  setStayNote,
  type CrewRosterBook,
} from "@/lib/crew-roster";
import { type CrewPersonOps } from "@/lib/crew-ops";
import { addDays, dayCountLabel, daysBetween, formatMedium, todayInZone } from "@/lib/dates";
import { cn } from "@/lib/cn";

export function CrewRotationDrawer({
  rotation,
  person,
  people,
  book,
  asOf,
  staffName,
  sites,
  personOps,
  onClose,
  onSaveBook,
  onSaveRoster,
  onPatchOps,
  roster,
  openTravel,
}: {
  roster?: CrewRosterBook;
  /** Open straight on the Travel tab for this trip (from the Flights list). */
  openTravel?: TravelDirection | "moves" | null;
  rotation: CrewRotation;
  person: CrewPerson;
  people: CrewPerson[];
  book: RotationBook;
  asOf: string;
  staffName: string;
  sites?: { code: string; name: string }[];
  roles?: string[];
  personOps?: CrewPersonOps | null;
  onClose: () => void;
  onSaveBook: (book: RotationBook) => void;
  onSaveRoster: (recipe: (current: CrewRosterBook) => CrewRosterBook) => void;
  onPatchOps?: (recipe: (current: CrewPersonOps) => CrewPersonOps) => void;
}) {
  const siteOptions = sites?.length ? sites.map((row) => row.code) : ["IQA", "POND", "ALRT", "KUG"];
  const [draft, setDraft] = useState(rotation);
  const [section, setSection] = useState<"overview" | "travel" | "stay" | "replacement">(
    openTravel ? "travel" : "overview",
  );
  const [travelDir, setTravelDir] = useState<TravelDirection | "moves">(openTravel || "outbound");
  // Every site change the calendar shows during this stay (from the Excel, painted, or moved),
  // listed until a move is saved for it, so this tab always matches the calendar.
  const suggestedMoves = movesOnCalendar(person, draft.plannedIn, draft.plannedOut).filter(
    (row) =>
      !(draft.moves ?? []).some(
        (saved) =>
          saved.fromSite === row.fromSite &&
          saved.toSite === row.toSite &&
          Math.abs(daysBetween(saved.date, row.date)) <= 3,
      ),
  );
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [extendOut, setExtendOut] = useState(() => inclusiveOut(rotation));

  const readiness = useMemo(() => evaluateReadiness(draft, asOf), [asOf, draft]);
  // Days left / progress follow the real calendar day, not board asOf (which can be
  // Jan 1 / Dec 31 when browsing another year — that made Dec 18 look “ago” early).
  const clockToday = todayInZone();
  const outInclusive = inclusiveOut(draft);
  const day = rotationDayNumber(draft, clockToday);
  const left = daysBetween(clockToday, outInclusive);
  const stayDays = Math.max(1, daysBetween(draft.plannedIn, outInclusive) + 1);
  const replacement = draft.replacedByRotationId
    ? book.rotations.find((row) => row.id === draft.replacedByRotationId) ?? null
    : null;

  function commit(next: CrewRotation) {
    setDraft(next);
    onSaveBook(upsertRotation(book, next));
  }

  function patchTravel(direction: TravelDirection, patch: Partial<RotationTravel>) {
    const key = direction === "outbound" ? "outbound" : "returnTravel";
    commit({ ...draft, [key]: { ...draft[key], ...patch } });
  }

  function patchStay(patch: Partial<RotationStay>) {
    // Out is always the place end, check-in/out follow the rotation, change via Extend.
    const { checkIn: _in, checkOut: _out, ...rest } = patch;
    commit({
      ...draft,
      stay: {
        ...draft.stay,
        ...rest,
        checkIn: draft.plannedIn,
        checkOut: inclusiveOut(draft),
      },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/25">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl">
        <header className="border-b border-border bg-card px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 sm:px-6 sm:py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-foreground">{person.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {draft.role} · {draft.site || "-"} · {formatMedium(draft.plannedIn)} –{" "}
                {formatMedium(outInclusive)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <nav className="mt-5 flex gap-5 overflow-x-auto text-sm">
            {(
              [
                ["overview", "Overview", null],
                ["travel", "Travel", "plane"],
                ["stay", "Stay", "bed"],
                ["replacement", "Schedule Changes", null],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 border-b-2 pb-2 font-medium whitespace-nowrap transition",
                  section === id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {icon === "plane" ? <PlaneTakeoff className="size-3.5" /> : null}
                {icon === "bed" ? <BedDouble className="size-3.5" /> : null}
                {label}
              </button>
            ))}
          </nav>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-sm sm:px-6 sm:py-5">
          {section === "overview" ? (
            <div className="space-y-6">
              <ReadinessStrip readiness={readiness} />
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Fact label="Role" value={draft.role} />
                <Fact label="Site" value={draft.site || "-"} />
                <Fact label="Arrival" value={formatMedium(draft.plannedIn)} />
                <Fact label="Departure" value={formatMedium(outInclusive)} />
                <Fact label="Duration" value={dayCountLabel(draft.rotationDays)} />
                <Fact
                  label="Progress"
                  value={
                    day > 0 && left >= 0
                      ? `Day ${day}/${draft.rotationDays} · ${left}d left`
                      : left < 0
                        ? "Ended"
                        : "Not started"
                  }
                />
              </dl>
              <StayHappenings
                rotation={draft}
                outInclusive={outInclusive}
                readiness={readiness}
              />
              <StayNoteField
                person={person}
                rotation={draft}
                asOf={asOf}
                roster={roster}
                onSaveRoster={onSaveRoster}
              />
              <ChecklistHints
                readiness={readiness}
                day={day}
                personOps={personOps}
                done={draft.todoDone ?? []}
                onToggle={(id) => {
                  const current = draft.todoDone ?? [];
                  commit({
                    ...draft,
                    todoDone: current.includes(id)
                      ? current.filter((row) => row !== id)
                      : [...current, id],
                  });
                }}
              />
            </div>
          ) : null}

          {section === "travel" ? (
            <div className="space-y-6">
              <nav className="flex gap-5 overflow-x-auto border-b border-border text-sm">
                {(
                  [
                    ["outbound", "Coming to Site"],
                    ["return", "Going Home"],
                    ["moves", "Site Transfers"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTravelDir(id)}
                    className={cn(
                      "-mb-px border-b-2 pb-2 font-medium whitespace-nowrap transition",
                      travelDir === id
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              {travelDir === "moves" ? (
                <MovesPanel
                  moves={draft.moves ?? []}
                  suggested={suggestedMoves}
                  sites={siteOptions}
                  stayFrom={draft.plannedIn}
                  stayTo={outInclusive}
                  personId={draft.personId}
                  book={book}
                  onChange={(moves) => commit({ ...draft, moves })}
                />
              ) : (
              <>
              {travelDir === "return" && onPatchOps ? (
                <ReturnWindowEditor
                  from={personOps?.returnBookFrom || ""}
                  to={personOps?.returnBookTo || ""}
                  stayFrom={draft.plannedIn}
                  stayTo={outInclusive}
                  onChange={(from, to) =>
                    onPatchOps((current) => ({
                      ...current,
                      returnBookFrom: from || null,
                      returnBookTo: to || null,
                      returnWindowPainted: Boolean(from && to),
                      returnFlight:
                        from && to
                          ? current.returnFlight === "booked" || current.returnFlight === "confirmed"
                            ? current.returnFlight
                            : "needed"
                          : current.returnFlight === "booked" || current.returnFlight === "confirmed"
                            ? current.returnFlight
                            : "not_started",
                    }))
                  }
                />
              ) : null}
              <CrewTripForm
                key={`${draft.id}-${travelDir}`}
                value={travelDir === "outbound" ? draft.outbound : draft.returnTravel}
                direction={travelDir}
                site={draft.site}
                travelDate={travelDir === "outbound" ? draft.plannedIn : outInclusive}
                personId={draft.personId}
                book={book}
                onChange={(patch) => patchTravel(travelDir, patch)}
              />
              </>
              )}
            </div>
          ) : null}

          {section === "stay" ? (
            <div className="space-y-6">
              <SectionBlock
                title="Stay"
                trailing={
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-semibold",
                      draft.stay.confirmed
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-amber-100 text-amber-950",
                    )}
                  >
                    {draft.stay.confirmed ? "Booked" : "Not booked"}
                  </span>
                }
              >
                <StayForm
                  value={{
                    ...draft.stay,
                    checkIn: draft.plannedIn,
                    checkOut: outInclusive,
                  }}
                  legs={staySiteLegs(draft, outInclusive)}
                  sites={siteOptions}
                  onChange={patchStay}
                />
              </SectionBlock>
            </div>
          ) : null}

          {section === "replacement" ? (
            <div className="space-y-6">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Fact label="Site" value={draft.site || "-"} />
                <Fact label="Departure" value={formatMedium(outInclusive)} />
                <Fact
                  label="Days left"
                  value={
                    left > 0
                      ? dayCountLabel(left)
                      : left === 0
                        ? "Today"
                        : `Ended ${dayCountLabel(Math.abs(left))} ago`
                  }
                />
                <Fact
                  label="Stay"
                  value={
                    stayDays > 0
                      ? `${dayCountLabel(stayDays)} · standard ${STANDARD_ROTATION_DAYS}`
                      : "-"
                  }
                />
              </dl>

              <SectionBlock title="Extend stay">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="grid gap-1">
                    <span className={fieldLabelClass}>New departure</span>
                    <input
                      type="date"
                      value={extendOut}
                      min={outInclusive}
                      onChange={(event) => setExtendOut(event.target.value)}
                      className="h-9 rounded-lg border border-input px-2 text-sm"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!extendOut || extendOut <= outInclusive}
                    onClick={() => {
                      const newOut = addDays(extendOut, 1);
                      const next = {
                        ...draft,
                        plannedOut: newOut,
                        rotationDays: Math.max(1, daysBetween(draft.plannedIn, extendOut) + 1),
                        stay: { ...draft.stay, checkIn: draft.plannedIn, checkOut: extendOut },
                        replacementNeeded: false,
                      };
                      setDraft(next);
                      setExtendOut(extendOut);
                      onSaveBook(extendRotationOut(book, draft.id, newOut));
                      onSaveRoster((roster) =>
                        extendStay(roster, draft.personId, draft.plannedIn, newOut),
                      );
                    }}
                    className="h-9 rounded-lg border border-input px-3 text-sm font-medium disabled:opacity-50"
                  >
                    Extend
                  </button>
                </div>
              </SectionBlock>

              {replacement ? (
                <SectionBlock title="Replace">
                  <p className="text-sm font-medium text-foreground">
                    {people.find((row) => row.id === replacement.personId)?.name || replacement.personId}
                    {" · "}
                    {replacement.site}
                    {" · "}
                    {formatMedium(replacement.plannedIn)}
                  </p>
                  {draft.handoverFrom && draft.handoverTo ? (
                    <p className="text-sm text-muted-foreground">
                      Handover {formatMedium(draft.handoverFrom)} – {formatMedium(draft.handoverTo)}
                    </p>
                  ) : null}
                </SectionBlock>
              ) : !replaceOpen ? (
                <SectionBlock title="Keep or replace">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        commit({
                          ...draft,
                          replacementNeeded: false,
                          replacedByRotationId: null,
                          handoverFrom: null,
                          handoverTo: null,
                        })
                      }
                      className="h-9 rounded-lg border border-input px-3 text-sm font-medium"
                    >
                      Keep
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        commit({ ...draft, replacementNeeded: true });
                        setReplaceOpen(true);
                      }}
                      className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
                    >
                      Replace
                    </button>
                  </div>
                </SectionBlock>
              ) : null}

              {replaceOpen ? (
                <ReplacementForm
                  people={people}
                  book={book}
                  outgoing={draft}
                  staffName={staffName}
                  sites={siteOptions}
                  onCancel={() => setReplaceOpen(false)}
                  onCreate={({ personId, role, site, plannedIn, plannedOut, handoverFrom, handoverTo }) => {
                    const incomingId = `app:${personId}:${plannedIn}`;
                    const incoming: CrewRotation = {
                      id: incomingId,
                      personId,
                      role,
                      site,
                      plannedIn,
                      plannedOut,
                      actualIn: null,
                      actualOut: null,
                      actualInTime: "",
                      actualOutTime: "",
                      rotationDays: Math.max(1, daysBetween(plannedIn, addDays(plannedOut, -1)) + 1),
                      outbound: emptyTravel("outbound"),
                      returnTravel: emptyTravel("return"),
                      stay: {
                        ...emptyStay(site),
                        checkIn: plannedIn,
                        checkOut: addDays(plannedOut, -1),
                      },
                      replacesRotationId: draft.id,
                      replacedByRotationId: null,
                      replacementNeeded: true,
                      handoverFrom,
                      handoverTo,
                      notes: "",
                      source: "app",
                      moves: [],
                    };
                    onSaveRoster((roster) =>
                      addNextRotation(roster, personId, {
                        site,
                        from: plannedIn,
                        out: plannedOut,
                        role,
                      }),
                    );
                    onSaveBook(linkReplacement(book, draft.id, incoming, handoverFrom, handoverTo));
                    setDraft({
                      ...draft,
                      replacedByRotationId: incomingId,
                      replacementNeeded: true,
                      handoverFrom,
                      handoverTo,
                    });
                    setReplaceOpen(false);
                  }}
                />
              ) : null}
            </div>
          ) : null}

        </div>
      </aside>
    </div>
  );
}

/** Section focus (Journey, Stay, Happening) — darker so they read as headings. */
const sectionTitleClass =
  "text-[13px] font-medium tracking-[0.14em] text-slate-950 uppercase";
/** Field labels under a section — quieter so values carry the focus. */
const fieldLabelClass =
  "text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className={fieldLabelClass}>{label}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function SectionBlock({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className={sectionTitleClass}>{title}</p>
        {trailing}
      </div>
      <div className="mt-2 space-y-3 border-t border-border pt-3">{children}</div>
    </div>
  );
}

function ReadinessStrip({
  readiness,
}: {
  readiness: ReturnType<typeof evaluateReadiness>;
}) {
  const status =
    readiness.overall === "ready" ? "Ready" : readiness.overall === "at_risk" ? "At risk" : "Incomplete";
  return (
    <div className="space-y-3 border-b border-border pb-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className={sectionTitleClass}>Status</p>
        <p className="text-sm font-semibold text-foreground">{status}</p>
      </div>
      <ul className="space-y-2">
        <StatusLine label="Coming to Site" booked={readiness.travelOutbound} icon="out" />
        <StatusLine label="Going Home" booked={readiness.travelReturn} icon="in" />
        <StatusLine label="Stay" booked={readiness.stay} icon="bed" />
      </ul>
    </div>
  );
}

function StatusLine({
  label,
  booked,
  icon,
}: {
  label: string;
  booked: boolean;
  icon?: "out" | "in" | "bed";
}) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        {icon === "out" ? <PlaneTakeoff className="size-3.5" /> : null}
        {icon === "in" ? <PlaneLanding className="size-3.5" /> : null}
        {icon === "bed" ? <BedDouble className="size-3.5" /> : null}
        {label}
      </span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-semibold",
          booked ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950",
        )}
      >
        {booked ? "Booked" : "Not booked"}
      </span>
    </li>
  );
}

/** Airport / site chain for a trip, e.g. YUL → YOW → POND. */
function travelPath(travel: RotationTravel, fallbackFrom = "", fallbackTo = "") {
  const airports: string[] = [];
  for (const leg of travel.segments) {
    if (leg.fromAirport) airports.push(leg.fromAirport);
    if (leg.toAirport) airports.push(leg.toAirport);
  }
  const path = airports.filter((code, index) => code && code !== airports[index - 1]);
  if (path.length >= 2) return path.join(" → ");
  const from = travel.fromAirport || fallbackFrom;
  const to = travel.toAirport || fallbackTo;
  if (from && to) return `${from} → ${to}`;
  return from || to || "";
}

function StayHappenings({
  rotation,
  outInclusive,
  readiness,
}: {
  rotation: CrewRotation;
  outInclusive: string;
  readiness: ReturnType<typeof evaluateReadiness>;
}) {
  const legs = staySiteLegs(rotation, outInclusive);
  const moves = [...(rotation.moves ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const outPath = travelPath(rotation.outbound, "", rotation.site);
  const homePath = travelPath(rotation.returnTravel, rotation.site, "");
  const rows: { key: string; label: string; detail: string; state: string }[] = [
    {
      key: "out",
      label: "Coming to Site",
      detail: [formatMedium(rotation.plannedIn), outPath || rotation.site || ""]
        .filter(Boolean)
        .join(" · "),
      state: readiness.travelOutbound ? "Booked" : "Not booked",
    },
    ...legs.map((leg, index) => ({
      key: `stay-${index}`,
      label: "Stay",
      detail: [leg.site, `${formatMedium(leg.from)} – ${formatMedium(leg.to)}`]
        .filter(Boolean)
        .join(" · "),
      state: readiness.stay ? "Booked" : "Not booked",
    })),
    ...moves.map((move) => {
      const path =
        travelPath(move.travel, move.fromSite, move.toSite) ||
        `${move.fromSite} → ${move.toSite}`;
      return {
        key: `move-${move.id}`,
        label: "Site Transfers",
        detail: [formatMedium(move.date), path].filter(Boolean).join(" · "),
        state: travelIsBooked(move.travel) || move.travel.confirmed ? "Booked" : "Not booked",
      };
    }),
    {
      key: "home",
      label: "Going Home",
      detail: [formatMedium(outInclusive), homePath || rotation.site || ""]
        .filter(Boolean)
        .join(" · "),
      state: readiness.travelReturn ? "Booked" : "Not booked",
    },
  ];
  return (
    <div>
      <p className={sectionTitleClass}>Happening</p>
      <ul className="mt-2 space-y-2 border-t border-border pt-2">
        {rows.map((row) => (
          <li key={row.key} className="flex items-start justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="font-medium text-foreground">{row.label}</span>
              <span className="mt-0.5 block text-muted-foreground">{row.detail}</span>
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                row.state === "Booked"
                  ? "bg-emerald-100 text-emerald-900"
                  : "bg-amber-100 text-amber-950",
              )}
            >
              {row.state}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChecklistHints({
  readiness,
  day,
  personOps,
  done,
  onToggle,
}: {
  readiness: ReturnType<typeof evaluateReadiness>;
  day: number;
  personOps?: CrewPersonOps | null;
  done: string[];
  onToggle: (id: string) => void;
}) {
  const hints: { id: string; text: string }[] = [];
  const add = (id: string, text: string) => hints.push({ id, text });
  if (
    personOps?.outboundWindowPainted &&
    personOps.outboundBookFrom &&
    personOps.outboundBookTo &&
    personOps.outboundFlight !== "booked" &&
    personOps.outboundFlight !== "confirmed"
  ) {
    add(
      "outbound-window",
      `Coming to Site · ${formatMedium(personOps.outboundBookFrom)} – ${formatMedium(personOps.outboundBookTo)}`,
    );
  }
  if (
    personOps?.returnWindowPainted &&
    personOps.returnBookFrom &&
    personOps.returnBookTo &&
    personOps.returnFlight !== "booked" &&
    personOps.returnFlight !== "confirmed"
  ) {
    add(
      "return-window",
      `Going Home · ${formatMedium(personOps.returnBookFrom)} – ${formatMedium(personOps.returnBookTo)}`,
    );
  }
  if (!readiness.travelOutbound) add("outbound", "Coming to Site");
  if (!readiness.stay) add("stay", "Stay");
  if ((day >= 28 || readiness.returnDue) && !readiness.travelReturn) add("return", "Going Home");
  if (readiness.replacement === "missing") add("replacement", "Schedule Changes");
  if (readiness.handover === "not_planned") add("handover", "Handover");
  if (!hints.length) return null;
  const sorted = [...hints].sort((a, b) => Number(done.includes(a.id)) - Number(done.includes(b.id)));
  const openCount = hints.filter((hint) => !done.includes(hint.id)).length;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className={sectionTitleClass}>To do</p>
        <p className="text-xs text-muted-foreground">{openCount ? `${openCount} open` : "Done"}</p>
      </div>
      <ul className="mt-2 space-y-1 border-t border-border pt-2">
        {sorted.map((hint) => {
          const checked = done.includes(hint.id);
          return (
            <li key={hint.id}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(hint.id)}
                  className="size-4 shrink-0 accent-primary"
                />
                <span
                  className={cn(
                    checked ? "text-muted-foreground line-through" : "text-foreground",
                  )}
                >
                  {hint.text}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReturnWindowEditor({
  from,
  to,
  stayFrom,
  stayTo,
  onChange,
}: {
  from: string;
  to: string;
  stayFrom: string;
  stayTo: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <div className="rounded-xl border border-amber-300/70 bg-gradient-to-br from-amber-50 via-[#fff8e8] to-amber-100/50 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
      <p className="text-xs font-medium tracking-[0.12em] text-amber-950 uppercase">
        Window to book return flight
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-amber-200/80 pt-3">
        <label className="grid gap-1">
          <span className="text-xs font-medium tracking-[0.12em] text-amber-950/80 uppercase">
            Window start
          </span>
          <input
            type="date"
            value={from}
            min={stayFrom}
            max={to || stayTo}
            onChange={(event) => onChange(event.target.value, to || event.target.value)}
            className="h-9 rounded-lg border border-amber-200/90 bg-white/90 px-2 text-sm text-foreground"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium tracking-[0.12em] text-amber-950/80 uppercase">
            Window end
          </span>
          <input
            type="date"
            value={to}
            min={from || stayFrom}
            max={stayTo}
            onChange={(event) => onChange(from || event.target.value, event.target.value)}
            className="h-9 rounded-lg border border-amber-200/90 bg-white/90 px-2 text-sm text-foreground"
          />
        </label>
      </div>
      {from && to ? (
        <button
          type="button"
          onClick={() => onChange("", "")}
          className="mt-2 text-xs font-medium tracking-[0.12em] text-amber-950/70 uppercase underline-offset-2 hover:underline"
        >
          Clear window
        </button>
      ) : null}
    </div>
  );
}

/** Flights between sites during a stay: from the Excel, or added here. Each one opens as a full trip. */
function MovesPanel({
  moves,
  suggested,
  sites,
  stayFrom,
  stayTo,
  personId,
  book,
  onChange,
}: {
  moves: RotationMove[];
  suggested: { fromSite: string; toSite: string; date: string }[];
  sites: string[];
  stayFrom: string;
  stayTo: string;
  personId: string;
  book: RotationBook;
  onChange: (moves: RotationMove[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(moves.length === 1 ? moves[0]!.id : null);
  const [adding, setAdding] = useState(false);
  const [fromSite, setFromSite] = useState(sites[0] || "IQA");
  const [toSite, setToSite] = useState(sites[1] || "POND");
  const [date, setDate] = useState(stayFrom);
  const sorted = [...moves].sort((a, b) => a.date.localeCompare(b.date));

  function add(row: { fromSite: string; toSite: string; date: string }) {
    const move = newMove(row.fromSite, row.toSite, row.date);
    onChange([...moves, move]);
    setOpenId(move.id);
  }

  return (
    <div className="space-y-6 text-sm">
      {suggested.length ? (
        <SectionBlock title="Suggested">
          {suggested.map((row) => (
            <div
              key={`${row.fromSite}-${row.toSite}-${row.date}`}
              className="flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {row.fromSite} → {row.toSite}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {formatMedium(row.date)} · On the calendar, not booked yet
                </p>
              </div>
              <button
                type="button"
                onClick={() => add(row)}
                className="h-8 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                Book
              </button>
            </div>
          ))}
        </SectionBlock>
      ) : null}

      <SectionBlock title="Transfers">
        {sorted.length ? (
          sorted.map((move) => {
            const open = openId === move.id;
            return (
              <div key={move.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : move.id)}
                  className="flex w-full items-start justify-between gap-3 py-1 text-left"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-foreground">
                      {move.fromSite} → {move.toSite}
                    </span>
                    <span className="mt-0.5 block text-muted-foreground">
                      {formatMedium(move.date)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                      travelIsBooked(move.travel) || move.travel.confirmed
                        ? "bg-emerald-100 text-emerald-900"
                        : "bg-amber-100 text-amber-950",
                    )}
                  >
                    {tripLabel(move.travel)}
                  </span>
                </button>
                {open ? (
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    <CrewTripForm
                      key={move.id}
                      value={move.travel}
                      direction="outbound"
                      site={move.toSite}
                      travelDate={move.date}
                      personId={personId}
                      book={book}
                      move={{ fromSite: move.fromSite, toSite: move.toSite }}
                      onChange={(patch) =>
                        onChange(
                          moves.map((row) =>
                            row.id === move.id
                              ? {
                                  ...row,
                                  // The move happens on the day the first flight leaves.
                                  date: patch.departDate || row.date,
                                  travel: { ...row.travel, ...patch },
                                }
                              : row,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() => onChange(moves.filter((row) => row.id !== move.id))}
                      className="inline-flex h-8 items-center gap-1 text-xs font-semibold tracking-[0.12em] text-rose-700 uppercase hover:underline"
                    >
                      <Trash2 className="size-3.5" /> Remove
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <p className="text-muted-foreground">No site transfers yet.</p>
        )}

        {adding ? (
          <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
            <label className="grid min-w-0 gap-1">
              <span className={fieldLabelClass}>From site</span>
              <select
                value={fromSite}
                onChange={(event) => setFromSite(event.target.value)}
                className="h-9 rounded-lg border border-input bg-card px-2"
              >
                {sites.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1">
              <span className={fieldLabelClass}>To site</span>
              <select
                value={toSite}
                onChange={(event) => setToSite(event.target.value)}
                className="h-9 rounded-lg border border-input bg-card px-2"
              >
                {sites.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1">
              <span className={fieldLabelClass}>Date</span>
              <input
                type="date"
                value={date}
                min={stayFrom}
                max={stayTo}
                onChange={(event) => setDate(event.target.value)}
                className="h-9 w-full min-w-0 rounded-lg border border-input px-2"
              />
            </label>
            <div className="col-span-3 flex gap-2">
              <button
                type="button"
                disabled={!date || fromSite === toSite}
                onClick={() => {
                  add({ fromSite, toSite, date });
                  setAdding(false);
                }}
                className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40"
              >
                Add transfer
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="h-9 rounded-lg border border-input px-3 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-9 items-center gap-1.5 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase hover:text-foreground"
          >
            <Plus className="size-3.5" /> Add a site transfer
          </button>
        )}
      </SectionBlock>
    </div>
  );
}

/** Short status for a trip: assumed placeholders are not real bookings. */
function tripLabel(travel: RotationTravel) {
  if (travel.pnr === ASSUMED_PNR && !travelIsBooked(travel)) return "Not booked (assumed)";
  if (travel.confirmed) return "Confirmed";
  return travelIsBooked(travel) ? "Booked" : "Not booked";
}

/** Site periods on this stay (split by Site Transfers). */
function staySiteLegs(rotation: CrewRotation, outInclusive: string) {
  const moves = [...(rotation.moves ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const rows: { site: string; from: string; to: string }[] = [];
  let site = rotation.site || rotation.stay.site || "";
  let from = rotation.plannedIn;
  for (const move of moves) {
    const travelLegs = move.travel.segments.filter((row) => row.departDate);
    const depart = travelLegs[0]?.departDate || move.date;
    const last = travelLegs[travelLegs.length - 1];
    const arrive = last ? last.arriveDate || last.departDate : move.date;
    const to = depart > from ? addDays(depart, -1) : from;
    if (site && to >= from) rows.push({ site, from, to });
    site = move.toSite;
    from = arrive || depart;
  }
  if (site && from <= outInclusive) rows.push({ site, from, to: outInclusive });
  if (!rows.length) {
    rows.push({
      site: rotation.site || rotation.stay.site || "",
      from: rotation.plannedIn,
      to: outInclusive,
    });
  }
  return rows;
}

function StayForm({
  value,
  legs,
  sites,
  onChange,
}: {
  value: RotationStay;
  legs: { site: string; from: string; to: string }[];
  sites: string[];
  onChange: (patch: Partial<RotationStay>) => void;
}) {
  return (
    <div className="grid gap-5">
      {legs.map((leg, index) => (
        <div key={`${leg.site}-${leg.from}-${index}`} className="grid gap-3">
          {legs.length > 1 ? (
            <p className={sectionTitleClass}>
              Leg {index + 1}
              {leg.site ? ` · ${leg.site}` : ""}
            </p>
          ) : null}
          <label className="grid gap-1">
            <span className={fieldLabelClass}>Site</span>
            {index === 0 ? (
              <select
                value={value.site || leg.site}
                onChange={(event) => onChange({ site: event.target.value })}
                className="h-9 rounded-lg border border-input px-2 text-sm"
              >
                {sites.map((site) => (
                  <option key={site} value={site}>
                    {site}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={leg.site}
                readOnly
                className="h-9 rounded-lg border border-input bg-muted/40 px-2 text-sm"
              />
            )}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className={fieldLabelClass}>Arrival</span>
              <input
                type="date"
                value={leg.from}
                readOnly
                className="h-9 rounded-lg border border-input bg-muted/40 px-2 text-sm"
              />
            </label>
            <label className="grid gap-1">
              <span className={fieldLabelClass}>Departure</span>
              <input
                type="date"
                value={leg.to}
                readOnly
                className="h-9 rounded-lg border border-input bg-muted/40 px-2 text-sm"
              />
            </label>
          </div>
        </div>
      ))}
      <label className="grid gap-1">
        <span className={fieldLabelClass}>Room</span>
        <input
          value={value.room}
          onChange={(event) => onChange({ room: event.target.value })}
          className="h-9 rounded-lg border border-input px-2 text-sm"
          placeholder="Optional"
        />
      </label>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.confirmed}
          onChange={(event) => onChange({ confirmed: event.target.checked })}
        />
        <span>Mark accommodation confirmed</span>
      </label>
    </div>
  );
}

function ReplacementForm({
  people,
  book,
  outgoing,
  sites,
  onCancel,
  onCreate,
}: {
  people: CrewPerson[];
  book: RotationBook;
  outgoing: CrewRotation;
  staffName: string;
  sites: string[];
  roles?: string[];
  onCancel: () => void;
  onCreate: (input: {
    personId: string;
    role: string;
    site: string;
    plannedIn: string;
    plannedOut: string;
    handoverFrom: string | null;
    handoverTo: string | null;
  }) => void;
}) {
  const [site, setSite] = useState(outgoing.site || sites[0] || "IQA");
  const [plannedIn, setPlannedIn] = useState(addDays(outgoing.plannedOut, -1));
  const [days, setDays] = useState(String(DEFAULT_ROTATION_DAYS));
  const [handoverFrom, setHandoverFrom] = useState(addDays(outgoing.plannedOut, -3));
  const [handoverTo, setHandoverTo] = useState(addDays(outgoing.plannedOut, -1));

  const plannedOut = plannedIn
    ? addDays(plannedIn, Math.min(MAX_ROTATION_DAYS, Math.max(1, Number(days) || DEFAULT_ROTATION_DAYS)))
    : "";
  const freePeople = useMemo(
    () => peopleFreeForWindow(book, people, plannedIn, plannedOut, outgoing.personId),
    [book, people, plannedIn, plannedOut, outgoing.personId],
  );
  const [personId, setPersonId] = useState("");
  const selectedPerson = people.find((row) => row.id === personId) || null;
  const role = selectedPerson ? roleLabel(selectedPerson) : outgoing.role;

  useEffect(() => {
    if (personId && freePeople.some((row) => row.id === personId)) return;
    setPersonId(freePeople[0]?.id || "");
  }, [freePeople, personId]);

  return (
    <SectionBlock title="Arrange replacement">
      <p className="text-sm text-muted-foreground">Only people free for the incoming dates are listed.</p>
      <label className="grid gap-1">
        <span className={fieldLabelClass}>Employee</span>
        <select
          value={personId}
          onChange={(event) => setPersonId(event.target.value)}
          className="h-9 rounded-lg border border-input px-2 text-sm"
          disabled={!freePeople.length}
        >
          <option value="">{freePeople.length ? "Select..." : "No one free for these dates"}</option>
          {freePeople.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <span className={fieldLabelClass}>Role</span>
          <p className="flex h-9 items-center rounded-lg border border-border bg-muted/40 px-2 text-sm font-medium">
            {role || "-"}
          </p>
        </div>
        <label className="grid gap-1">
          <span className={fieldLabelClass}>Site</span>
          <select
            value={site}
            onChange={(event) => setSite(event.target.value)}
            className="h-9 rounded-lg border border-input px-2 text-sm"
          >
            {sites.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1">
          <span className={fieldLabelClass}>Arrival</span>
          <input
            type="date"
            value={plannedIn}
            onChange={(event) => setPlannedIn(event.target.value)}
            className="h-9 rounded-lg border border-input px-2 text-sm"
          />
        </label>
        <label className="grid gap-1">
          <span className={fieldLabelClass}>Days (max {MAX_ROTATION_DAYS})</span>
          <input
            type="number"
            min={1}
            max={MAX_ROTATION_DAYS}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            className="h-9 rounded-lg border border-input px-2 text-sm"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1">
          <span className={fieldLabelClass}>Handover from</span>
          <input
            type="date"
            value={handoverFrom}
            onChange={(event) => setHandoverFrom(event.target.value)}
            className="h-9 rounded-lg border border-input px-2 text-sm"
          />
        </label>
        <label className="grid gap-1">
          <span className={fieldLabelClass}>Handover to</span>
          <input
            type="date"
            value={handoverTo}
            onChange={(event) => setHandoverTo(event.target.value)}
            className="h-9 rounded-lg border border-input px-2 text-sm"
          />
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        Current departure {formatMedium(inclusiveOut(outgoing))}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onCancel} className="h-9 rounded-lg border border-input px-3 text-sm font-medium">
          Cancel
        </button>
        <button
          type="button"
          disabled={!personId || !plannedIn || !plannedOut}
          onClick={() =>
            onCreate({
              personId,
              role,
              site,
              plannedIn,
              plannedOut,
              handoverFrom: handoverFrom || null,
              handoverTo: handoverTo || null,
            })
          }
          className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Save replacement
        </button>
      </div>
    </SectionBlock>
  );
}

/** Note on this stay (e.g. "Held for weather"). Same note the Month calendar shows across the stay. */
function StayNoteField({
  person,
  rotation,
  asOf,
  roster,
  onSaveRoster,
}: {
  person: CrewPerson;
  rotation: CrewRotation;
  asOf: string;
  roster?: CrewRosterBook;
  onSaveRoster: (recipe: (current: CrewRosterBook) => CrewRosterBook) => void;
}) {
  const stint = (person.stints || []).find((row) => row.from === rotation.plannedIn);
  const from = rotation.plannedIn;
  const out = stint ? stint.out || scheduleYearOutExclusive(Number(asOf.slice(0, 4))) : rotation.plannedOut;
  const saved = getStayNote(roster, person.id, from, out);
  const [text, setText] = useState(saved);
  const [status, setStatus] = useState<"" | "saved">("");

  useEffect(() => {
    setText(saved);
  }, [saved]);

  const dirty = text.trim() !== saved;

  function save() {
    onSaveRoster((current) => setStayNote(current, person.id, from, out, text));
    setStatus("saved");
  }

  return (
    <div>
      <label htmlFor={`stay-note-${rotation.id}`} className={sectionTitleClass}>
        Note on this stay
      </label>
      <div className="mt-2 space-y-2 border-t border-border pt-3">
        <div className="flex gap-2">
          <input
            id={`stay-note-${rotation.id}`}
            value={text}
            maxLength={MAX_STAY_NOTE_CHARS}
            onChange={(event) => {
              setText(event.target.value);
              setStatus("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && dirty) {
                event.preventDefault();
                save();
              }
            }}
            placeholder="e.g. Held for weather"
            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-card px-2 text-sm"
          />
          <button
            type="button"
            onClick={save}
            disabled={!dirty}
            className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            Save
          </button>
        </div>
        {status === "saved" ? (
          <p className="text-xs text-muted-foreground">{text.trim() ? "Saved." : "Note removed."}</p>
        ) : null}
      </div>
    </div>
  );
}
