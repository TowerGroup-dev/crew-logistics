export type CrewNotifySettings = {
  recipientName: string;
  recipientEmail: string;
  /** Kept for storage compat; means weekly Monday briefing when true. */
  dailyBriefing: boolean;
  instantAlerts: boolean;
  lastBriefingAt: string | null;
  lastBriefingFingerprint: string | null;
  sentAlertFingerprints: string[];
  /** Days before departure to begin replacement / travel planning. */
  reminderPlanDays: number;
  /** Days before departure to check flight + accommodation. */
  reminderCheckDays: number;
  /** Days before departure to escalate missing confirmations. */
  reminderEscalateDays: number;
};

const STORAGE_KEY = "tower-arctic-crew-notify";

export function defaultNotifySettings(): CrewNotifySettings {
  return {
    recipientName: "Katrina",
    recipientEmail: "",
    dailyBriefing: true,
    instantAlerts: true,
    lastBriefingAt: null,
    lastBriefingFingerprint: null,
    sentAlertFingerprints: [],
    reminderPlanDays: 14,
    reminderCheckDays: 7,
    reminderEscalateDays: 3,
  };
}

function clampDays(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(42, Math.max(1, Math.round(n)));
}

export function readNotifySettings(value: unknown): CrewNotifySettings {
  const base = defaultNotifySettings();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<CrewNotifySettings>;
  return {
    recipientName: typeof raw.recipientName === "string" && raw.recipientName.trim() ? raw.recipientName.trim() : base.recipientName,
    recipientEmail: typeof raw.recipientEmail === "string" ? raw.recipientEmail.trim() : "",
    dailyBriefing: typeof raw.dailyBriefing === "boolean" ? raw.dailyBriefing : true,
    instantAlerts: typeof raw.instantAlerts === "boolean" ? raw.instantAlerts : true,
    lastBriefingAt: typeof raw.lastBriefingAt === "string" ? raw.lastBriefingAt : null,
    lastBriefingFingerprint: typeof raw.lastBriefingFingerprint === "string" ? raw.lastBriefingFingerprint : null,
    sentAlertFingerprints: Array.isArray(raw.sentAlertFingerprints)
      ? raw.sentAlertFingerprints.filter((item): item is string => typeof item === "string").slice(-200)
      : [],
    reminderPlanDays: clampDays(raw.reminderPlanDays, base.reminderPlanDays),
    reminderCheckDays: clampDays(raw.reminderCheckDays, base.reminderCheckDays),
    reminderEscalateDays: clampDays(raw.reminderEscalateDays, base.reminderEscalateDays),
  };
}

export function loadNotifySettings(): CrewNotifySettings {
  if (typeof window === "undefined") return defaultNotifySettings();
  try {
    return readNotifySettings(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return defaultNotifySettings();
  }
}

export function saveNotifySettings(settings: CrewNotifySettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** True Monday at/after 8:30 AM Montreal when we have not briefed this Monday yet. */
export function shouldOfferWeeklyBriefing(settings: CrewNotifySettings, now = new Date()) {
  if (!settings.dailyBriefing) return false;
  const montreal = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montreal",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => montreal.find((part) => part.type === type)?.value ?? "";
  const weekday = get("weekday");
  if (weekday !== "Mon") return false;
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  if (hour < 8 || (hour === 8 && minute < 30)) return false;
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  const lastDay = settings.lastBriefingAt?.slice(0, 10) ?? "";
  return lastDay !== today;
}

/** @deprecated use shouldOfferWeeklyBriefing */
export function shouldOfferMorningBriefing(settings: CrewNotifySettings, now = new Date()) {
  return shouldOfferWeeklyBriefing(settings, now);
}
