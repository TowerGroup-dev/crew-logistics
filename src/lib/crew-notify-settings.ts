export type CrewNotifySettings = {
  recipientName: string;
  recipientEmail: string;
  dailyBriefing: boolean;
  instantAlerts: boolean;
  lastBriefingAt: string | null;
  lastBriefingFingerprint: string | null;
  sentAlertFingerprints: string[];
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
  };
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

/** True when Montreal local time is at/after 8:00 and we have not briefed today. */
export function shouldOfferMorningBriefing(settings: CrewNotifySettings, now = new Date()) {
  if (!settings.dailyBriefing) return false;
  const montreal = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montreal",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => montreal.find((part) => part.type === type)?.value ?? "";
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));
  if (hour < 8) return false;
  const lastDay = settings.lastBriefingAt?.slice(0, 10) ?? "";
  return lastDay !== today;
}
