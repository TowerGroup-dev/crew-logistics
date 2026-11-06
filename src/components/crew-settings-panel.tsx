"use client";

import { useMemo, useState } from "react";
import {
  CREW_ROLE_ORDER,
} from "@/lib/crew-schedule";
import {
  addRole,
  removeRole,
  type CrewRolesBook,
} from "@/lib/crew-roles-catalog";
import {
  SITE_COLOURS,
  isWorksiteCode,
  nextColourId,
  removeSite,
  upsertSite,
  type CrewSite,
  type CrewSitesBook,
} from "@/lib/crew-sites";
import {
  type CrewNotifySettings,
} from "@/lib/crew-notify-settings";
import { addScheduleYear } from "@/lib/crew-years";
import { cn } from "@/lib/cn";

export function CrewSettingsPanel({
  sitesBook,
  rolesBook,
  notify,
  years,
  onSitesChange,
  onRolesChange,
  onNotifyChange,
  onYearsChange,
}: {
  sitesBook: CrewSitesBook;
  rolesBook: CrewRolesBook;
  notify: CrewNotifySettings;
  years: number[];
  onSitesChange: (book: CrewSitesBook) => void;
  onRolesChange: (book: CrewRolesBook) => void;
  onNotifyChange: (recipe: (current: CrewNotifySettings) => CrewNotifySettings) => void;
  onYearsChange: (years: number[]) => void;
}) {
  const [draft, setDraft] = useState<CrewSite>({
    code: "",
    name: "",
    colourId: nextColourId(sitesBook),
    camp: false,
  });
  const [roleDraft, setRoleDraft] = useState("");
  const [yearDraft, setYearDraft] = useState(String(new Date().getFullYear() + 1));
  const [message, setMessage] = useState("");

  const colourById = useMemo(() => new Map(SITE_COLOURS.map((row) => [row.id, row])), []);

  function saveSite() {
    const code = draft.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(code)) {
      setMessage("Site code needs 2–8 letters/numbers (e.g. RANK).");
      return;
    }
    if (!isWorksiteCode(code)) {
      setMessage(`${code} is a travel/status mark, not a camp site.`);
      return;
    }
    onSitesChange(upsertSite(sitesBook, { ...draft, code, name: draft.name.trim() || code }));
    setDraft({ code: "", name: "", colourId: nextColourId(sitesBook), camp: false });
    setMessage(`Saved ${code}.`);
  }

  function saveRole() {
    const next = addRole(rolesBook, roleDraft);
    if (next === rolesBook) {
      setMessage("That role already exists.");
      return;
    }
    onRolesChange(next);
    setRoleDraft("");
    setMessage(`Added role ${roleDraft.trim()}.`);
  }

  function addYear() {
    const year = Number(yearDraft);
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      setMessage("Enter a valid year.");
      return;
    }
    onYearsChange(addScheduleYear(years, year));
    setMessage(`Year ${year} available in the nav.`);
  }

  return (
    <div className="space-y-8 px-4 py-5 text-sm sm:px-6">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage sites, roles, and reminder timing for this computer. Not shared with other users yet.
        </p>
        {message ? <p className="mt-2 text-sm text-emerald-800">{message}</p> : null}
      </header>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">Sites</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">Used when placing rotations and filtering the schedule.</p>
        </div>

        <ul className="divide-y divide-border border border-border">
          {sitesBook.sites.map((site) => {
            const colour = colourById.get(site.colourId) || SITE_COLOURS[0]!;
            return (
              <li key={site.code} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <span className={cn("size-3 shrink-0 rounded-sm", colour.swatch)} aria-hidden />
                <span className="min-w-[4.5rem] font-semibold tabular-nums">{site.code}</span>
                <input
                  value={site.name}
                  onChange={(event) =>
                    onSitesChange(upsertSite(sitesBook, { ...site, name: event.target.value }))
                  }
                  className="h-8 min-w-[10rem] flex-1 rounded-md border border-input px-2"
                />
                <select
                  value={site.colourId}
                  onChange={(event) =>
                    onSitesChange(upsertSite(sitesBook, { ...site, colourId: event.target.value }))
                  }
                  className="h-8 rounded-md border border-input px-2"
                >
                  {SITE_COLOURS.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
                <label className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={Boolean(site.camp)}
                    onChange={(event) =>
                      onSitesChange(upsertSite(sitesBook, { ...site, camp: event.target.checked }))
                    }
                  />
                  Camp
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (sitesBook.sites.length <= 1) {
                      setMessage("Keep at least one site.");
                      return;
                    }
                    onSitesChange(removeSite(sitesBook, site.code));
                    setMessage(`Removed ${site.code}.`);
                  }}
                  className="text-sm font-medium text-rose-700 hover:underline"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>

        <div className="grid gap-2 rounded-xl border border-dashed border-border p-3 sm:grid-cols-[7rem_1fr_8rem_auto]">
          <input
            value={draft.code}
            onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
            placeholder="CODE"
            className="h-9 rounded-md border border-input px-2 uppercase"
            maxLength={8}
          />
          <input
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            placeholder="Display name"
            className="h-9 rounded-md border border-input px-2"
          />
          <select
            value={draft.colourId}
            onChange={(event) => setDraft((current) => ({ ...current, colourId: event.target.value }))}
            className="h-9 rounded-md border border-input px-2"
          >
            {SITE_COLOURS.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={saveSite}
            className="h-9 rounded-md bg-stone-900 px-3 text-sm font-medium text-white hover:opacity-90"
          >
            Add site
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">Roles</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">Built-in trades plus any extras you add for placements.</p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {CREW_ROLE_ORDER.map((role) => (
            <li key={role} className="rounded-full bg-muted px-2.5 py-1 text-sm">
              {role}
            </li>
          ))}
          {rolesBook.extras.map((role) => (
            <li key={role} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-sm">
              {role}
              <button
                type="button"
                onClick={() => onRolesChange(removeRole(rolesBook, role))}
                className="text-muted-foreground hover:text-rose-700"
                aria-label={`Remove ${role}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <input
            value={roleDraft}
            onChange={(event) => setRoleDraft(event.target.value)}
            placeholder="New role"
            className="h-9 min-w-[12rem] flex-1 rounded-md border border-input px-2"
          />
          <button
            type="button"
            onClick={saveRole}
            className="h-9 rounded-md border border-input px-3 text-sm font-medium hover:bg-muted"
          >
            Add role
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">Mail to Katrina</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Reminders are emailed to Katrina every Monday at 8:30 am (Montreal).
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-muted-foreground">Name</span>
            <input
              value={notify.recipientName}
              onChange={(event) =>
                onNotifyChange((current) => ({ ...current, recipientName: event.target.value }))
              }
              className="h-9 rounded-md border border-input px-2"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-muted-foreground">Email</span>
            <input
              type="email"
              value={notify.recipientEmail}
              onChange={(event) =>
                onNotifyChange((current) => ({ ...current, recipientEmail: event.target.value }))
              }
              placeholder="katrina@…"
              className="h-9 rounded-md border border-input px-2"
            />
          </label>
        </div>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={notify.dailyBriefing}
            onChange={(event) =>
              onNotifyChange((current) => ({ ...current, dailyBriefing: event.target.checked }))
            }
          />
          <span>Send weekly reminders on Mondays at 8:30 am</span>
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={notify.instantAlerts}
            onChange={(event) =>
              onNotifyChange((current) => ({ ...current, instantAlerts: event.target.checked }))
            }
          />
          <span>Instant alerts for critical changes</span>
        </label>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">Reminder timing</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">Drives the Needs attention checklist and return booking window.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField
            label="Plan ahead (days)"
            value={notify.reminderPlanDays}
            onChange={(value) => onNotifyChange((current) => ({ ...current, reminderPlanDays: value }))}
          />
          <NumberField
            label="Check travel/stay (days)"
            value={notify.reminderCheckDays}
            onChange={(value) => onNotifyChange((current) => ({ ...current, reminderCheckDays: value }))}
          />
          <NumberField
            label="Escalate (days)"
            value={notify.reminderEscalateDays}
            onChange={(value) => onNotifyChange((current) => ({ ...current, reminderEscalateDays: value }))}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-semibold">Schedule years</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">Years available in the top nav selector.</p>
        </div>
        <p className="text-sm text-muted-foreground">{years.join(" · ")}</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={yearDraft}
            onChange={(event) => setYearDraft(event.target.value)}
            className="h-9 w-28 rounded-md border border-input px-2 tabular-nums"
          />
          <button
            type="button"
            onClick={addYear}
            className="h-9 rounded-md border border-input px-3 text-sm font-medium hover:bg-muted"
          >
            Add year
          </button>
        </div>
      </section>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-muted-foreground">{label}</span>
      <input
        type="number"
        min={1}
        max={42}
        value={value}
        onChange={(event) => onChange(Math.min(42, Math.max(1, Number(event.target.value) || 1)))}
        className="h-9 rounded-md border border-input px-2 tabular-nums"
      />
    </label>
  );
}
