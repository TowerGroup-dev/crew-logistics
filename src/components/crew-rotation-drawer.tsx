"use client";

import { useEffect, useMemo, useState } from "react";
import { BedDouble, PlaneLanding, PlaneTakeoff, X } from "lucide-react";
import { roleLabel, type CrewPerson } from "@/lib/crew-schedule";
import {
  daysLeftOnRotation,
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
} from "@/lib/crew-rotations";
import {
  DEFAULT_ROTATION_DAYS,
  MAX_ROTATION_DAYS,
  STANDARD_ROTATION_DAYS,
  addNextRotation,
  extendStay,
  type CrewRosterBook,
} from "@/lib/crew-roster";
import { type CrewPersonOps } from "@/lib/crew-ops";
import { addDays, daysBetween, formatMedium } from "@/lib/dates";
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
}: {
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
  const [section, setSection] = useState<"overview" | "travel" | "stay" | "replacement">("overview");
  const [travelDir, setTravelDir] = useState<TravelDirection>("outbound");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [extendOut, setExtendOut] = useState(() => inclusiveOut(rotation));

  const readiness = useMemo(() => evaluateReadiness(draft, asOf), [asOf, draft]);
  const day = rotationDayNumber(draft, asOf);
  const left = daysLeftOnRotation(draft, asOf);
  const outInclusive = inclusiveOut(draft);
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
    // Out is always the place end — check-in/out follow the rotation, change via Extend.
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
        <header className="border-b border-border bg-card px-6 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Rotation</p>
              <h2 className="mt-1 truncate text-lg font-semibold text-foreground">{person.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {draft.role} · {draft.site || "—"} · {formatMedium(draft.plannedIn)} → {formatMedium(outInclusive)}
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
                ["replacement", "Extension", null],
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

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5 text-sm">
          {section === "overview" ? (
            <div className="space-y-6">
              <ReadinessStrip readiness={readiness} />
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Fact label="Role" value={draft.role} />
                <Fact label="Site" value={draft.site || "—"} />
                <Fact label="Planned IN" value={formatMedium(draft.plannedIn)} />
                <Fact label="OUT" value={`${formatMedium(outInclusive)} · end of stay`} />
                <Fact label="Duration" value={`${draft.rotationDays} days`} />
                <Fact
                  label="Progress"
                  value={day > 0 && left >= 0 ? `Day ${day}/${draft.rotationDays} · ${left}d left` : left < 0 ? "Ended" : "Not started"}
                />
              </dl>
              <ChecklistHints readiness={readiness} day={day} personOps={personOps} />
            </div>
          ) : null}

          {section === "travel" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTravelDir("outbound")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition",
                    travelDir === "outbound"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <PlaneTakeoff className="size-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block">Outbound</span>
                    <span className={cn("block text-xs font-normal", travelDir === "outbound" ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {draft.outbound.confirmed ? "Booked" : "Not booked"}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setTravelDir("return")}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition",
                    travelDir === "return"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <PlaneLanding className="size-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block">Inbound</span>
                    <span className={cn("block text-xs font-normal", travelDir === "return" ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {draft.returnTravel.confirmed ? "Booked" : "Not booked"}
                    </span>
                  </span>
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                {travelDir === "outbound"
                  ? draft.outbound.bookedOn
                    ? `Outbound booked on ${formatMedium(draft.outbound.bookedOn)}.`
                    : "Book departure to camp before the stay starts."
                  : draft.returnTravel.bookedOn
                    ? `Inbound booked on ${formatMedium(draft.returnTravel.bookedOn)}.`
                    : "Book the return around 4 weeks into the stay."}
              </p>
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
              <TravelForm
                value={travelDir === "outbound" ? draft.outbound : draft.returnTravel}
                onChange={(patch) => patchTravel(travelDir, patch)}
              />
            </div>
          ) : null}

          {section === "stay" ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-border px-3 py-3">
                <BedDouble className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <p className="font-medium">Stay · {draft.stay.confirmed ? "Booked" : "Not booked"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Accommodation covers the whole stay and is confirmed once for this rotation.
                  </p>
                </div>
              </div>
              <StayForm
                value={{
                  ...draft.stay,
                  checkIn: draft.plannedIn,
                  checkOut: outInclusive,
                }}
                sites={siteOptions}
                onChange={patchStay}
              />
            </div>
          ) : null}

          {section === "replacement" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                When this stay ends: extend the rotation, or add another person.
              </p>

              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="font-medium">Extend rotation</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Keep {person.name} on site longer. OUT moves with the new place end. Current stay{" "}
                  {stayDays} day{stayDays === 1 ? "" : "s"}
                  {stayDays > STANDARD_ROTATION_DAYS ? " · past 6 weeks" : ` · standard is ${STANDARD_ROTATION_DAYS}`}.
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">New OUT (end of stay)</span>
                    <input
                      type="date"
                      value={extendOut}
                      min={outInclusive}
                      onChange={(event) => setExtendOut(event.target.value)}
                      className="h-9 rounded-lg border border-input px-2"
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
                      onSaveRoster((roster) => extendStay(roster, draft.personId, draft.plannedIn, newOut));
                    }}
                    className="h-9 rounded-lg border border-input px-3 text-sm font-medium disabled:opacity-50"
                  >
                    Extend · move OUT
                  </button>
                </div>
              </div>

              {replacement ? (
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="font-medium">Another person linked</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {people.find((row) => row.id === replacement.personId)?.name || replacement.personId}
                    {" · "}
                    {replacement.role} · {replacement.site}
                    {" · IN "}
                    {formatMedium(replacement.plannedIn)}
                  </p>
                  <p className="mt-2 text-sm">
                    Travel {replacement.outbound.confirmed ? "✓" : "✗"} · Stay {replacement.stay.confirmed ? "✓" : "✗"}
                  </p>
                  {draft.handoverFrom && draft.handoverTo ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Handover {formatMedium(draft.handoverFrom)} – {formatMedium(draft.handoverTo)}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-amber-800">Handover dates not set</p>
                  )}
                </div>
              ) : draft.replacementNeeded === false ? (
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="font-medium">No one else needed</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This rotation ends with no handoff (extended, or coverage stops).
                  </p>
                  <button
                    type="button"
                    onClick={() => commit({ ...draft, replacementNeeded: true })}
                    className="mt-3 h-9 rounded-lg border border-input px-3 text-sm font-medium"
                  >
                    Change — add another person
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <p className="font-medium">Add another person</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Bring someone else in when this rotation ends.
                  </p>
                </div>
              )}

              {!replacement && draft.replacementNeeded !== false && !replaceOpen ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setReplaceOpen(true)}
                    className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
                  >
                    Add another person
                  </button>
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
                    No one else needed
                  </button>
                </div>
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
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
        <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Status</p>
        <p className="text-sm font-semibold text-foreground">{status}</p>
      </div>
      <ul className="space-y-2">
        <StatusLine label="Outbound" booked={readiness.travelOutbound} icon="out" />
        <StatusLine label="Inbound" booked={readiness.travelReturn} icon="in" />
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
      <span className={cn("font-medium", booked ? "text-foreground" : "text-rose-700")}>
        {booked ? "Booked" : "Not booked"}
      </span>
    </li>
  );
}

function ChecklistHints({
  readiness,
  day,
  personOps,
}: {
  readiness: ReturnType<typeof evaluateReadiness>;
  day: number;
  personOps?: CrewPersonOps | null;
}) {
  const hints: string[] = [];
  if (
    personOps?.returnWindowPainted &&
    personOps.returnBookFrom &&
    personOps.returnBookTo &&
    personOps.returnFlight !== "booked" &&
    personOps.returnFlight !== "confirmed"
  ) {
    hints.push(
      `Return window set (${formatMedium(personOps.returnBookFrom)} to ${formatMedium(personOps.returnBookTo)}): book return flight`,
    );
  }
  if (
    personOps?.outboundWindowPainted &&
    personOps.outboundBookFrom &&
    personOps.outboundBookTo &&
    personOps.outboundFlight !== "booked" &&
    personOps.outboundFlight !== "confirmed"
  ) {
    hints.push(
      `Booking window set (${formatMedium(personOps.outboundBookFrom)} to ${formatMedium(personOps.outboundBookTo)}): book flight to site`,
    );
  }
  if (!readiness.travelOutbound) hints.push("Book outbound flight to site");
  if (!readiness.stay) hints.push("Book accommodation for the whole stay");
  if (day >= 28 && !readiness.travelReturn) hints.push("4 weeks in: book return flight");
  if (readiness.replacement === "missing") hints.push("Extend rotation or add another person");
  if (readiness.handover === "not_planned") hints.push("Set handover / overlap dates");
  if (!hints.length) {
    return <p className="text-sm text-muted-foreground">Nothing open on this rotation.</p>;
  }
  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">To do</p>
      <ul className="mt-2 space-y-2 border-t border-border pt-3">
        {hints.map((hint) => (
          <li key={hint} className="text-sm text-foreground">
            {hint}
          </li>
        ))}
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
    <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-3">
      <p className="text-sm font-medium text-amber-950">Return window</p>
      <p className="mt-1 text-xs text-amber-900/80">
        Days for the return flight. Paint yellow on the Month calendar with right-click or drag.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Window start</span>
          <input
            type="date"
            value={from}
            min={stayFrom}
            max={to || stayTo}
            onChange={(event) => onChange(event.target.value, to || event.target.value)}
            className="h-9 rounded-lg border border-input bg-card px-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Window end</span>
          <input
            type="date"
            value={to}
            min={from || stayFrom}
            max={stayTo}
            onChange={(event) => onChange(from || event.target.value, event.target.value)}
            className="h-9 rounded-lg border border-input bg-card px-2"
          />
        </label>
      </div>
      {from && to ? (
        <button
          type="button"
          onClick={() => onChange("", "")}
          className="mt-2 text-xs font-medium text-amber-950 underline-offset-2 hover:underline"
        >
          Clear window
        </button>
      ) : null}
    </div>
  );
}

function TravelForm({
  value,
  onChange,
}: {
  value: RotationTravel;
  onChange: (patch: Partial<RotationTravel>) => void;
}) {
  return (
    <div className="grid gap-3">
      <label className="grid gap-1">
        <span className="text-muted-foreground">Airline</span>
        <input
          value={value.airline}
          onChange={(event) => onChange({ airline: event.target.value })}
          className="h-9 rounded-lg border border-input px-2"
        />
      </label>
      <label className="grid gap-1">
        <span className="text-muted-foreground">Booking reference (PNR)</span>
        <input
          value={value.pnr}
          onChange={(event) => onChange({ pnr: event.target.value })}
          className="h-9 rounded-lg border border-input px-2"
          placeholder="ABC123"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1">
          <span className="text-muted-foreground">From</span>
          <input
            value={value.fromAirport}
            onChange={(event) => onChange({ fromAirport: event.target.value.toUpperCase() })}
            className="h-9 rounded-lg border border-input px-2"
            placeholder="YEG"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-muted-foreground">To</span>
          <input
            value={value.toAirport}
            onChange={(event) => onChange({ toAirport: event.target.value.toUpperCase() })}
            className="h-9 rounded-lg border border-input px-2"
            placeholder="YFB"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1">
          <span className="text-muted-foreground">Depart date</span>
          <input
            type="date"
            value={value.departDate || ""}
            onChange={(event) => onChange({ departDate: event.target.value || null })}
            className="h-9 rounded-lg border border-input px-2"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-muted-foreground">Depart time</span>
          <input
            type="time"
            value={value.departTime}
            onChange={(event) => onChange({ departTime: event.target.value })}
            className="h-9 rounded-lg border border-input px-2"
          />
        </label>
      </div>
      <label className="grid gap-1">
        <span className="text-muted-foreground">Booked on</span>
        <input
          type="date"
          value={value.bookedOn || ""}
          onChange={(event) => onChange({ bookedOn: event.target.value || null })}
          className="h-9 rounded-lg border border-input px-2"
        />
      </label>
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.confirmed}
          onChange={(event) => onChange({ confirmed: event.target.checked })}
        />
        <span>Mark flight confirmed</span>
      </label>
    </div>
  );
}

function StayForm({
  value,
  sites,
  onChange,
}: {
  value: RotationStay;
  sites: string[];
  onChange: (patch: Partial<RotationStay>) => void;
}) {
  return (
    <div className="grid gap-3">
      <label className="grid gap-1">
        <span className="text-muted-foreground">Site</span>
        <select
          value={value.site}
          onChange={(event) => onChange({ site: event.target.value })}
          className="h-9 rounded-lg border border-input px-2"
        >
          {sites.map((site) => (
            <option key={site} value={site}>
              {site}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="text-muted-foreground">Room</span>
        <input
          value={value.room}
          onChange={(event) => onChange({ room: event.target.value })}
          className="h-9 rounded-lg border border-input px-2"
          placeholder="Optional"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1">
          <span className="text-muted-foreground">Check-in · stay start</span>
          <input type="date" value={value.checkIn || ""} readOnly className="h-9 rounded-lg border border-input bg-muted/40 px-2" />
        </label>
        <label className="grid gap-1">
          <span className="text-muted-foreground">OUT · end of stay</span>
          <input type="date" value={value.checkOut || ""} readOnly className="h-9 rounded-lg border border-input bg-muted/40 px-2" />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">OUT always matches the end of the place. Extend the rotation to move it.</p>
      <label className="inline-flex items-center gap-2">
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
    <div className="space-y-3 rounded-xl border border-border p-4">
      <p className="font-medium">Add another person</p>
      <p className="text-sm text-muted-foreground">Only people free for the incoming dates are listed.</p>
      <label className="grid gap-1">
        <span className="text-muted-foreground">Employee</span>
        <select
          value={personId}
          onChange={(event) => setPersonId(event.target.value)}
          className="h-9 rounded-lg border border-input px-2"
          disabled={!freePeople.length}
        >
          <option value="">{freePeople.length ? "Select…" : "No one free for these dates"}</option>
          {freePeople.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <span className="text-muted-foreground">Role</span>
          <p className="flex h-9 items-center rounded-lg border border-border bg-muted/40 px-2 text-sm font-medium">
            {role || "—"}
          </p>
        </div>
        <label className="grid gap-1">
          <span className="text-muted-foreground">Site</span>
          <select value={site} onChange={(event) => setSite(event.target.value)} className="h-9 rounded-lg border border-input px-2">
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
          <span className="text-muted-foreground">Incoming IN</span>
          <input type="date" value={plannedIn} onChange={(event) => setPlannedIn(event.target.value)} className="h-9 rounded-lg border border-input px-2" />
        </label>
        <label className="grid gap-1">
          <span className="text-muted-foreground">Days (max {MAX_ROTATION_DAYS})</span>
          <input type="number" min={1} max={MAX_ROTATION_DAYS} value={days} onChange={(event) => setDays(event.target.value)} className="h-9 rounded-lg border border-input px-2" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1">
          <span className="text-muted-foreground">Handover from</span>
          <input type="date" value={handoverFrom} onChange={(event) => setHandoverFrom(event.target.value)} className="h-9 rounded-lg border border-input px-2" />
        </label>
        <label className="grid gap-1">
          <span className="text-muted-foreground">Handover to</span>
          <input type="date" value={handoverTo} onChange={(event) => setHandoverTo(event.target.value)} className="h-9 rounded-lg border border-input px-2" />
        </label>
      </div>
      <p className="text-sm text-muted-foreground">Outgoing planned OUT stays {formatMedium(inclusiveOut(outgoing))}. Overlap is optional.</p>
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
          Create next rotation
        </button>
      </div>
    </div>
  );
}
