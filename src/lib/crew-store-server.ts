/**
 * Shared data on the server's disk. On Azure App Service the /home folder is kept
 * across restarts and deploys, so the data lives in /home/data/crew-logistics.
 * Locally it goes in .data/ (gitignored). One JSON file per shared key, written
 * atomically, with a daily backup kept for 30 days.
 */
import { promises as fs } from "fs";
import path from "path";
import { merge3 } from "@/lib/crew-merge";
import type { SharedDoc, SharedKey } from "@/lib/crew-sync-keys";

export function dataDir() {
  if (process.env.CREW_DATA_DIR) return process.env.CREW_DATA_DIR;
  // WEBSITE_SITE_NAME is set by Azure App Service.
  if (process.env.WEBSITE_SITE_NAME) return "/home/data/crew-logistics";
  return path.join(process.cwd(), ".data");
}

const BACKUP_DAYS = 30;

function fileFor(key: SharedKey) {
  return path.join(dataDir(), `${key}.json`);
}

export async function readDoc(key: SharedKey): Promise<SharedDoc | null> {
  try {
    return JSON.parse(await fs.readFile(fileFor(key), "utf8")) as SharedDoc;
  } catch {
    return null;
  }
}

export async function readAll(keys: readonly SharedKey[]) {
  const docs: Partial<Record<SharedKey, SharedDoc>> = {};
  await Promise.all(
    keys.map(async (key) => {
      const doc = await readDoc(key);
      if (doc) docs[key] = doc;
    }),
  );
  return docs;
}

async function backupOnce(key: SharedKey) {
  const day = new Date().toISOString().slice(0, 10);
  const dir = path.join(dataDir(), "backups", day);
  const target = path.join(dir, `${key}.json`);
  try {
    await fs.access(target);
    return; // Already backed up today.
  } catch {
    // fall through
  }
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.copyFile(fileFor(key), target);
  } catch {
    return; // Nothing to back up yet.
  }
  // Drop backups older than BACKUP_DAYS.
  try {
    const cutoff = new Date(Date.now() - BACKUP_DAYS * 86400000).toISOString().slice(0, 10);
    for (const name of await fs.readdir(path.join(dataDir(), "backups"))) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(name) && name < cutoff) {
        await fs.rm(path.join(dataDir(), "backups", name), { recursive: true, force: true });
      }
    }
  } catch {
    // Pruning is best effort.
  }
}

/** One save at a time per key, so two saves never interleave. */
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(key: string, work: () => Promise<T>) {
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.then(work, work);
  locks.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

/**
 * Save one person's copy. If someone else saved since they last synced (baseRev
 * is behind), their changes since `base` are merged onto the latest copy.
 */
export function saveDoc(input: { key: SharedKey; value: unknown; base: unknown; baseRev: number; by: string }) {
  return withLock(input.key, async () => {
    const current = await readDoc(input.key);
    const currentRev = current?.rev ?? 0;
    const merged =
      !current || input.baseRev === currentRev ? input.value : merge3(input.base, input.value, current.value);
    if (current && JSON.stringify(merged) === JSON.stringify(current.value)) {
      return { doc: current, merged: input.baseRev !== currentRev };
    }
    const doc: SharedDoc = { value: merged, rev: currentRev + 1, by: input.by, at: new Date().toISOString() };
    await fs.mkdir(dataDir(), { recursive: true });
    if (current) await backupOnce(input.key);
    const tmp = `${fileFor(input.key)}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(doc));
    await fs.rename(tmp, fileFor(input.key));
    return { doc, merged: input.baseRev !== currentRev };
  });
}
