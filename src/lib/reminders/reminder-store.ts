export type ReminderRole = "seller" | "client";

export type ReminderPreferences = {
  enabled: boolean;
  role: ReminderRole;
  daysBefore: number[];
  browserNotifications: boolean;
};

export type ReminderNotice = {
  id: string;
  milestoneId: string;
  projectId: string;
  projectTitle: string;
  milestoneTitle: string;
  dueDate: string;
  daysBefore: number;
  role: ReminderRole;
  message: string;
  createdAt: string;
  read: boolean;
};

export const REMINDER_PREFERENCES_KEY = "paymind.reminder-preferences.v1";
export const REMINDER_NOTICES_KEY = "paymind.reminder-notices.v1";
export const REMINDER_SENT_KEY = "paymind.reminder-sent.v1";
export const REMINDER_CHANGE_EVENT = "paymind:reminders-changed";

export const DEFAULT_REMINDER_PREFERENCES: ReminderPreferences = {
  enabled: true,
  role: "seller",
  daysBefore: [3, 2, 1],
  browserNotifications: false,
};

function scopedKey(base: string, accountKey = "demo") {
  // Keep notification history and preferences isolated between accounts on shared browsers.
  return `${base}.${encodeURIComponent(accountKey || "demo")}`;
}

function isBrowser() {
  return typeof window !== "undefined";
}

export function hasReminderPreferences(accountKey = "demo"): boolean {
  if (!isBrowser()) return false;
  try {
    return window.localStorage.getItem(scopedKey(REMINDER_PREFERENCES_KEY, accountKey)) !== null;
  } catch {
    return false;
  }
}

export function readReminderPreferences(accountKey = "demo"): ReminderPreferences {
  if (!isBrowser()) return { ...DEFAULT_REMINDER_PREFERENCES, daysBefore: [...DEFAULT_REMINDER_PREFERENCES.daysBefore] };
  try {
    const raw = window.localStorage.getItem(scopedKey(REMINDER_PREFERENCES_KEY, accountKey));
    if (!raw) return { ...DEFAULT_REMINDER_PREFERENCES, daysBefore: [...DEFAULT_REMINDER_PREFERENCES.daysBefore] };
    const parsed = JSON.parse(raw) as Partial<ReminderPreferences>;
    const days = Array.isArray(parsed.daysBefore)
      ? parsed.daysBefore.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 90)
      : DEFAULT_REMINDER_PREFERENCES.daysBefore;
    return {
      enabled: parsed.enabled ?? true,
      role: parsed.role === "client" ? "client" : "seller",
      daysBefore: [...new Set(days)].sort((a, b) => b - a),
      browserNotifications: parsed.browserNotifications ?? false,
    };
  } catch {
    return { ...DEFAULT_REMINDER_PREFERENCES, daysBefore: [...DEFAULT_REMINDER_PREFERENCES.daysBefore] };
  }
}

export function writeReminderPreferences(value: ReminderPreferences, accountKey = "demo") {
  if (!isBrowser()) return;
  const normalized = {
    ...value,
    daysBefore: [...new Set(value.daysBefore)].filter((n) => Number.isInteger(n) && n >= 0 && n <= 90).sort((a, b) => b - a),
  };
  window.localStorage.setItem(scopedKey(REMINDER_PREFERENCES_KEY, accountKey), JSON.stringify(normalized));
  window.dispatchEvent(new Event(REMINDER_CHANGE_EVENT));
}

export function readReminderNotices(accountKey = "demo"): ReminderNotice[] {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(scopedKey(REMINDER_NOTICES_KEY, accountKey)) || "[]") as ReminderNotice[];
    return Array.isArray(parsed) ? parsed.slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function writeReminderNotices(notices: ReminderNotice[], accountKey = "demo") {
  if (!isBrowser()) return;
  window.localStorage.setItem(scopedKey(REMINDER_NOTICES_KEY, accountKey), JSON.stringify(notices.slice(0, 50)));
  window.dispatchEvent(new Event(REMINDER_CHANGE_EVENT));
}

export function readSentReminderKeys(accountKey = "demo"): string[] {
  if (!isBrowser()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(scopedKey(REMINDER_SENT_KEY, accountKey)) || "[]") as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeSentReminderKeys(keys: string[], accountKey = "demo") {
  if (!isBrowser()) return;
  window.localStorage.setItem(scopedKey(REMINDER_SENT_KEY, accountKey), JSON.stringify(keys.slice(-500)));
}

export function markReminderRead(id: string, accountKey = "demo") {
  const notices = readReminderNotices(accountKey).map((notice) => notice.id === id ? { ...notice, read: true } : notice);
  writeReminderNotices(notices, accountKey);
}

export function markAllRemindersRead(accountKey = "demo") {
  writeReminderNotices(readReminderNotices(accountKey).map((notice) => ({ ...notice, read: true })), accountKey);
}
