/**
 * Record-level merge for shared app data (used by the browser and the server).
 *
 * diff(base, next) lists what one person changed since they last synced;
 * apply(current, changes) lays those changes onto the latest shared copy.
 * Lists whose items carry an `id` merge item by item, so two people editing
 * different people / stays / bookings never overwrite each other. Where both
 * changed the very same field, the later save wins for that field only.
 */

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type PathPart = string | { id: string };
export type Change = { path: PathPart[]; op: "set" | "delete"; value?: JsonValue };

function isObject(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function same(a: unknown, b: unknown) {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** A list we can merge item by item: every item is an object with a unique string id. */
function keyedList(value: unknown): value is { id: string }[] {
  if (!Array.isArray(value) || !value.length) return false;
  const ids = new Set<string>();
  for (const item of value) {
    if (!isObject(item) || typeof item.id !== "string" || ids.has(item.id)) return false;
    ids.add(item.id);
  }
  return true;
}

export function diff(base: unknown, next: unknown, path: PathPart[] = []): Change[] {
  if (same(base, next)) return [];
  if (isObject(base) && isObject(next)) {
    const changes: Change[] = [];
    for (const key of Object.keys(next)) {
      if (!(key in base)) changes.push({ path: [...path, key], op: "set", value: next[key]! });
      else changes.push(...diff(base[key], next[key], [...path, key]));
    }
    for (const key of Object.keys(base)) {
      if (!(key in next)) changes.push({ path: [...path, key], op: "delete" });
    }
    return changes;
  }
  const baseList = Array.isArray(base) && (base.length === 0 || keyedList(base));
  if (baseList && keyedList(next)) {
    const before = new Map((base as { id: string }[]).map((item) => [item.id, item]));
    const changes: Change[] = [];
    for (const item of next) {
      const prior = before.get(item.id);
      if (!prior) changes.push({ path: [...path, { id: item.id }], op: "set", value: item as unknown as JsonValue });
      else changes.push(...diff(prior, item, [...path, { id: item.id }]));
      before.delete(item.id);
    }
    for (const id of before.keys()) changes.push({ path: [...path, { id }], op: "delete" });
    return changes;
  }
  if (keyedList(base) && Array.isArray(next) && next.length === 0) {
    return (base as { id: string }[]).map((item) => ({ path: [...path, { id: item.id }], op: "delete" as const }));
  }
  return [{ path, op: "set", value: next as JsonValue }];
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function applyOne(target: unknown, path: PathPart[], change: Change): unknown {
  if (!path.length) return change.op === "delete" ? undefined : clone(change.value);
  const [head, ...rest] = path;
  if (typeof head === "object") {
    const list = Array.isArray(target) ? [...target] : [];
    const index = list.findIndex((item) => isObject(item) && item.id === head.id);
    if (!rest.length) {
      if (change.op === "delete") {
        if (index >= 0) list.splice(index, 1);
      } else if (index >= 0) list[index] = clone(change.value);
      else list.push(clone(change.value));
      return list;
    }
    if (index < 0) return list; // Item was removed by someone else, drop the edit to it.
    list[index] = applyOne(list[index], rest, change) as JsonValue;
    return list;
  }
  const obj: Record<string, unknown> = isObject(target) ? { ...target } : {};
  if (!rest.length) {
    if (change.op === "delete") delete obj[head!];
    else obj[head!] = clone(change.value);
    return obj;
  }
  obj[head!] = applyOne(obj[head!], rest, change);
  return obj;
}

export function apply<T>(current: T, changes: Change[]): T {
  let value: unknown = current;
  for (const change of changes) value = applyOne(value, change.path, change);
  return value as T;
}

/** My changes since `base`, laid onto the latest shared copy. */
export function merge3<T>(base: unknown, mine: T, theirs: T): T {
  if (same(base, theirs)) return mine;
  if (same(base, mine)) return theirs;
  return apply(theirs, diff(base, mine));
}

function exists(target: unknown, path: PathPart[]): boolean {
  let node: unknown = target;
  for (const part of path) {
    if (typeof part === "object") {
      if (!Array.isArray(node)) return false;
      node = node.find((item) => isObject(item) && item.id === part.id);
    } else {
      if (!isObject(node) || !(part in node)) return false;
      node = node[part];
    }
    if (node === undefined) return false;
  }
  return true;
}

/**
 * First sync of a browser that already had data: keep the shared copy as it is and
 * add anything this browser has that the shared copy doesn't (new records, new fields).
 */
export function fillMissing<T>(shared: T, local: unknown): T {
  const additions = diff(shared, local).filter((change) => change.op === "set" && !exists(shared, change.path));
  return additions.length ? apply(shared, additions) : shared;
}
