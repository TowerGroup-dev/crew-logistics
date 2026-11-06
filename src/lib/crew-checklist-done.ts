/** Katrina can cross off Overview to-do items once verified. */

import { daysBetween } from "@/lib/dates";

const STORAGE_KEY = "tower-arctic-crew-checklist-done-v1";

/** Crossed-off items stay visible this long, then leave the To do list. */
export const CHECKLIST_DONE_KEEP_DAYS = 7;

export type ChecklistDoneBook = {
  version: 1;
  /** Checklist item ids that are done / verified → ISO date marked. */
  done: Record<string, string>;
};

export function emptyChecklistDone(): ChecklistDoneBook {
  return { version: 1, done: {} };
}

export function readChecklistDone(raw: unknown): ChecklistDoneBook {
  if (!raw || typeof raw !== "object") return emptyChecklistDone();
  const data = raw as Partial<ChecklistDoneBook>;
  const done: Record<string, string> = {};
  if (data.done && typeof data.done === "object") {
    for (const [id, at] of Object.entries(data.done)) {
      if (typeof at === "string") done[id] = at;
    }
  }
  return { version: 1, done };
}

export function loadChecklistDone(): ChecklistDoneBook {
  if (typeof window === "undefined") return emptyChecklistDone();
  try {
    return readChecklistDone(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return emptyChecklistDone();
  }
}

export function saveChecklistDone(book: ChecklistDoneBook) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(book));
}

export function markChecklistDone(book: ChecklistDoneBook, id: string, asOf: string): ChecklistDoneBook {
  return { ...book, done: { ...book.done, [id]: asOf } };
}

export function unmarkChecklistDone(book: ChecklistDoneBook, id: string): ChecklistDoneBook {
  const done = { ...book.done };
  delete done[id];
  return { ...book, done };
}

export function checklistDoneAt(book: ChecklistDoneBook, id: string) {
  return book.done[id] || null;
}

export function isChecklistDone(book: ChecklistDoneBook, id: string) {
  return Boolean(book.done[id]);
}

/** Still showing as crossed off (within the keep window). */
export function isChecklistDoneVisible(
  book: ChecklistDoneBook,
  id: string,
  asOf: string,
  keepDays = CHECKLIST_DONE_KEEP_DAYS,
) {
  const at = book.done[id];
  if (!at) return false;
  return daysBetween(at, asOf) <= keepDays;
}

/** Marked done long enough ago that it leaves the To do list entirely. */
export function isChecklistDoneExpired(
  book: ChecklistDoneBook,
  id: string,
  asOf: string,
  keepDays = CHECKLIST_DONE_KEEP_DAYS,
) {
  const at = book.done[id];
  if (!at) return false;
  return daysBetween(at, asOf) > keepDays;
}
