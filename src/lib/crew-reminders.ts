export type CrewReminder = {
  id: string;
  text: string;
  /** Optional ISO date the reminder is for. */
  dueOn: string | null;
  personId: string | null;
  personName: string | null;
  done: boolean;
  createdAt: string;
  doneAt: string | null;
};

export type CrewRemindersBook = {
  reminders: CrewReminder[];
};

const STORAGE_KEY = "tower-arctic-crew-reminders";

export function emptyReminders(): CrewRemindersBook {
  return { reminders: [] };
}

export function loadReminders(): CrewRemindersBook {
  if (typeof window === "undefined") return emptyReminders();
  try {
    return readReminders(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return emptyReminders();
  }
}

export function saveReminders(book: CrewRemindersBook) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
}

function readReminders(value: unknown): CrewRemindersBook {
  if (!value || typeof value !== "object") return emptyReminders();
  const raw = value as Partial<CrewRemindersBook>;
  const reminders = Array.isArray(raw.reminders)
    ? raw.reminders
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const row = entry as Partial<CrewReminder>;
          if (typeof row.id !== "string" || typeof row.text !== "string" || !row.text.trim()) return null;
          return {
            id: row.id,
            text: row.text.trim(),
            dueOn: typeof row.dueOn === "string" ? row.dueOn.slice(0, 10) : null,
            personId: typeof row.personId === "string" ? row.personId : null,
            personName: typeof row.personName === "string" ? row.personName : null,
            done: Boolean(row.done),
            createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
            doneAt: typeof row.doneAt === "string" ? row.doneAt : null,
          } satisfies CrewReminder;
        })
        .filter((item): item is CrewReminder => Boolean(item))
    : [];
  return { reminders };
}

export function openReminderCount(book: CrewRemindersBook) {
  return book.reminders.filter((row) => !row.done).length;
}
