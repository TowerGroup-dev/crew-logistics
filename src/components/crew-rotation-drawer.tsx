"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  CREW_ROLES,
  type CrewPerson,
} from "@/lib/crew-schedule";
import {
  daysLeftOnRotation,
  emptyStay,
  emptyTravel,
  evaluateReadiness,
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
import { MAX_ROTATION_DAYS, addNextRotation, type CrewRosterBook } from "@/lib/crew-roster";
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
  roles,
  onClose,
  onSaveBook,
  onSaveRoster,
}: {
  rotation: CrewRotation;
  person: CrewPerson;
  people: CrewPerson[];
  book: RotationBook;
  asOf: string;
  staffName: string;
  sites?: { code: string; name: string }[];
  roles?: string[];
  onClose: () => void;
  onSaveBook: (book: RotationBook) => void;
  onSaveRoster: (recipe: (current: CrewRosterBook) => CrewRosterBook) => void;
}) {
  const siteOptions = sites?.length ? sites.map((row) => row.code) : ["IQA", "POND", "ALRT", "KUG"];
  const roleOptions = roles?.length ? roles : [...CREW_ROLES];
  const [draft, setDraft] = useState(rotation);
  const [section, setSection] = useState<"overview" | "travel" | "stay" | "replacement" | "actuals">("overview");
  const [travelDir, setTravelDir] = useState<TravelDirection>("outbound");
  const [replaceOpen, setReplaceOpen] = useState(false);

  const readiness = useMemo(() => evaluateReadiness(draft, asOf), [asOf, draft]);
  const day = rotationDayNumber(draft, asOf);
  const left = daysLeftOnRotation(draft, asOf);
  const outInclusive = inclusiveOut(draft);
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
    commit({ ...draft, stay: { ...draft.stay, ...patch } });
  }

  async function onUpload(
    file: File | null,
    apply: (doc: { name: string; dataUrl: string } | null) => void,
  ) {
    if (!file) {
      apply(null);
      return;
    }
    if (!/(pdf|png|jpe?g)$/i.test(file.name) && !file.type.match(/pdf|png|jpeg/)) {
      window.alert("Upload a PDF, PNG, or JPG.");
      return;
    }
    if (file.size > 1_500_000) {
      window.alert("Keep confirmation files under ~1.5 MB for local storage.");
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    apply({ name: file.name, dataUrl });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/35">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl flex-col bg-card shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Rotation</p>
            <h2 className="truncate text-lg font-semibold">{person.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {draft.role} · {draft.site || "-"} · {formatMedium(draft.plannedIn)} → {formatMedium(outInclusive)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-input p-2 hover:bg-muted">
            <X className="size-4" />
          </button>
        </header>

        <div className="flex flex-wrap gap-1 border-b border-border px-4 py-2">
          {(
            [
              ["overview", "Overview"],
              ["travel", "Travel"],
              ["stay", "Stay"],
              ["replacement", "Next worker"],
              ["actuals", "Actuals"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                section === id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          {section === "overview" ? (
            <div className="space-y-4">
              <ReadinessStrip readiness={readiness} />
              <dl className="grid grid-cols-2 gap-3">
                <Fact label="Role" value={draft.role} />
                <Fact label="Site" value={draft.site || "-"} />
                <Fact label="Planned IN" value={formatMedium(draft.plannedIn)} />
                <Fact label="Planned OUT" value={formatMedium(outInclusive)} />
                <Fact label="Actual IN" value={draft.actualIn ? formatMedium(draft.actualIn) : "-"} />
                <Fact label="Actual OUT" value={draft.actualOut ? formatMedium(draft.actualOut) : "-"} />
                <Fact label="Duration" value={`${draft.rotationDays} days`} />
                <Fact
                  label="Progress"
                  value={day > 0 && left >= 0 ? `Day ${day}/${draft.rotationDays} · ${left}d left` : left < 0 ? "Ended" : "Not started"}
                />
              </dl>
              <ChecklistHints readiness={readiness} day={day} />
            </div>
          ) : null}

          {section === "travel" ? (
            <div className="space-y-4">
              <div className="inline-flex rounded-lg border border-border p-0.5">
                <button
                  type="button"
                  onClick={() => setTravelDir("outbound")}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium",
                    travelDir === "outbound" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  Outbound to site {draft.outbound.confirmed ? "✓" : "✗"}
                </button>
                <button
                  type="button"
                  onClick={() => setTravelDir("return")}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium",
                    travelDir === "return" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  Return home {draft.returnTravel.confirmed ? "✓" : "✗"}
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                {travelDir === "outbound"
                  ? draft.outbound.bookedOn
                    ? `Outbound booked on ${formatMedium(draft.outbound.bookedOn)}.`
                    : "Book departure to camp before the stay starts."
                  : draft.returnTravel.bookedOn
                    ? `Return booked on ${formatMedium(draft.returnTravel.bookedOn)}.`
                    : "Book the return around 4 weeks into the stay."}
              </p>
              <TravelForm
                value={travelDir === "outbound" ? draft.outbound : draft.returnTravel}
                onChange={(patch) => patchTravel(travelDir, patch)}
                onUpload={(file) =>
                  onUpload(file, (document) => patchTravel(travelDir, { document, confirmed: Boolean(document) || undefined }))
                }
              />
            </div>
          ) : null}

          {section === "stay" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Accommodation covers the whole stay and is confirmed once for this rotation.
              </p>
              <StayForm
                value={draft.stay}
                sites={siteOptions}
                onChange={patchStay}
                onUpload={(file) =>
                  onUpload(file, (document) => patchStay({ document, confirmed: Boolean(document) || undefined }))
                }
              />
            </div>
          ) : null}

          {section === "replacement" ? (
            <div className="space-y-4">
              {replacement ? (
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="font-medium">Next worker linked</p>
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
                  <p className="font-medium">None necessary</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    No next worker is required when this rotation ends.
                  </p>
                  <button
                    type="button"
                    onClick={() => commit({ ...draft, replacementNeeded: true })}
                    className="mt-3 h-9 rounded-lg border border-input px-3 text-sm font-medium"
                  >
                    Change — a worker is needed
                  </button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No replacement yet for when this rotation ends.</p>
              )}

              {!replacement && draft.replacementNeeded !== false && !replaceOpen ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setReplaceOpen(true)}
                    className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
                  >
                    Add worker to continue rotation
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
                    None necessary
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
                  roles={roleOptions}
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

          {section === "actuals" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-muted-foreground">Actual arrival date</span>
                <input
                  type="date"
                  value={draft.actualIn || ""}
                  onChange={(event) => commit({ ...draft, actualIn: event.target.value || null })}
                  className="h-9 rounded-lg border border-input px-2"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-muted-foreground">Actual arrival time</span>
                <input
                  type="time"
                  value={draft.actualInTime}
                  onChange={(event) => commit({ ...draft, actualInTime: event.target.value })}
                  className="h-9 rounded-lg border border-input px-2"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-muted-foreground">Actual departure date</span>
                <input
                  type="date"
                  value={draft.actualOut || ""}
                  onChange={(event) => commit({ ...draft, actualOut: event.target.value || null })}
                  className="h-9 rounded-lg border border-input px-2"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-muted-foreground">Actual departure time</span>
                <input
                  type="time"
                  value={draft.actualOutTime}
                  onChange={(event) => commit({ ...draft, actualOutTime: event.target.value })}
                  className="h-9 rounded-lg border border-input px-2"
                />
              </label>
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-muted-foreground">Notes</span>
                <textarea
                  value={draft.notes}
                  onChange={(event) => commit({ ...draft, notes: event.target.value })}
                  rows={3}
                  className="rounded-lg border border-input px-2 py-2"
                />
              </label>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border px-3 py-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}

function ReadinessStrip({
  readiness,
}: {
  readiness: ReturnType<typeof evaluateReadiness>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Mark label="Travel out" ok={readiness.travelOutbound} />
      <Mark label="Travel return" ok={readiness.travelReturn} />
      <Mark label="Stay" ok={readiness.stay} />
      <div
        className={cn(
          "rounded-xl border px-3 py-2 text-center font-medium",
          readiness.overall === "ready"
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : readiness.overall === "at_risk"
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-amber-200 bg-amber-50 text-amber-950",
        )}
      >
        {readiness.overall === "ready" ? "Ready" : readiness.overall === "at_risk" ? "At risk" : "Incomplete"}
      </div>
    </div>
  );
}

function Mark({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={cn("rounded-xl border px-3 py-2 text-center", ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50")}>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold">{ok ? "✓" : "✗"}</p>
    </div>
  );
}

function ChecklistHints({
  readiness,
  day,
}: {
  readiness: ReturnType<typeof evaluateReadiness>;
  day: number;
}) {
  const hints: string[] = [];
  if (!readiness.travelOutbound) hints.push("Book outbound flight to site");
  if (!readiness.stay) hints.push("Book accommodation for the whole stay");
  if (day >= 28 && !readiness.travelReturn) hints.push("4 weeks in: book return flight");
  if (readiness.replacement === "missing") hints.push("Add worker to continue rotation");
  if (readiness.handover === "not_planned") hints.push("Set handover / overlap dates");
  if (!hints.length) return <p className="text-sm text-emerald-800">Checklist clear for this rotation.</p>;
  return (
    <ul className="space-y-1 rounded-xl border border-border bg-muted/20 px-3 py-2">
      {hints.map((hint) => (
        <li key={hint} className="text-sm">
          · {hint}
        </li>
      ))}
    </ul>
  );
}

function TravelForm({
  value,
  onChange,
  onUpload,
}: {
  value: RotationTravel;
  onChange: (patch: Partial<RotationTravel>) => void;
  onUpload: (file: File | null) => void;
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
        {!value.bookedOn && value.confirmed ? (
          <span className="text-sm text-muted-foreground">No booked-on date yet — add one above.</span>
        ) : null}
      </label>
      <label className="grid gap-1">
        <span className="text-muted-foreground">Confirmation PDF / image</span>
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          onChange={(event) => onUpload(event.target.files?.[0] || null)}
          className="text-sm"
        />
        {value.document ? (
          <a href={value.document.dataUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
            View {value.document.name}
          </a>
        ) : null}
      </label>
      <label className="inline-flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.confirmed}
          onChange={(event) => onChange({ confirmed: event.target.checked })}
        />
        <span>Mark flight confirmed</span>
      </label>
      <p className="text-sm text-muted-foreground">Confirmation needs an explicit check (PNR alone is not enough).</p>
    </div>
  );
}

function StayForm({
  value,
  sites,
  onChange,
  onUpload,
}: {
  value: RotationStay;
  sites: string[];
  onChange: (patch: Partial<RotationStay>) => void;
  onUpload: (file: File | null) => void;
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
          <span className="text-muted-foreground">Check-in</span>
          <input
            type="date"
            value={value.checkIn || ""}
            onChange={(event) => onChange({ checkIn: event.target.value || null })}
            className="h-9 rounded-lg border border-input px-2"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-muted-foreground">Check-out</span>
          <input
            type="date"
            value={value.checkOut || ""}
            onChange={(event) => onChange({ checkOut: event.target.value || null })}
            className="h-9 rounded-lg border border-input px-2"
          />
        </label>
      </div>
      <label className="grid gap-1">
        <span className="text-muted-foreground">Confirmation PDF / image</span>
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          onChange={(event) => onUpload(event.target.files?.[0] || null)}
          className="text-sm"
        />
        {value.document ? (
          <a href={value.document.dataUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
            View {value.document.name}
          </a>
        ) : null}
      </label>
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
  roles,
  onCancel,
  onCreate,
}: {
  people: CrewPerson[];
  book: RotationBook;
  outgoing: CrewRotation;
  staffName: string;
  sites: string[];
  roles: string[];
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
  const [role, setRole] = useState(outgoing.role);
  const [site, setSite] = useState(outgoing.site || sites[0] || "IQA");
  const [plannedIn, setPlannedIn] = useState(addDays(outgoing.plannedOut, -1));
  const [days, setDays] = useState(String(MAX_ROTATION_DAYS));
  const [handoverFrom, setHandoverFrom] = useState(addDays(outgoing.plannedOut, -3));
  const [handoverTo, setHandoverTo] = useState(addDays(outgoing.plannedOut, -1));

  const plannedOut = plannedIn ? addDays(plannedIn, Math.min(MAX_ROTATION_DAYS, Math.max(1, Number(days) || 42))) : "";
  const freePeople = useMemo(
    () => peopleFreeForWindow(book, people, plannedIn, plannedOut, outgoing.personId),
    [book, people, plannedIn, plannedOut, outgoing.personId],
  );
  const [personId, setPersonId] = useState("");

  useEffect(() => {
    if (personId && freePeople.some((row) => row.id === personId)) return;
    setPersonId(freePeople[0]?.id || "");
  }, [freePeople, personId]);

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <p className="font-medium">Add worker to continue rotation</p>
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
        <label className="grid gap-1">
          <span className="text-muted-foreground">Role this stay</span>
          <select value={role} onChange={(event) => setRole(event.target.value)} className="h-9 rounded-lg border border-input px-2">
            {[...new Set([role, ...roles, ...CREW_ROLES])].map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
