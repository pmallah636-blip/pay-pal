"use client";

import { useState } from "react";
import { BellRing, Check, Plus, Trash2 } from "lucide-react";
import {
  hasReminderPreferences,
  readReminderPreferences,
  writeReminderPreferences,
  type ReminderPreferences,
} from "@/lib/reminders/reminder-store";

const commonDays = [7, 3, 2, 1, 0];

export function ReminderSettings({ initialRole = "seller", accountKey = "demo", roleLocked = false }: { initialRole?: ReminderPreferences["role"]; accountKey?: string; roleLocked?: boolean }) {
  const [preferences, setPreferences] = useState<ReminderPreferences>(() => {
    const current = readReminderPreferences(accountKey);
    if (!hasReminderPreferences(accountKey)) current.role = initialRole;
    return current;
  });
  const [customDays, setCustomDays] = useState("5");
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => {
    return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";
  });
  const [saved, setSaved] = useState(false);
  const [prevAccount, setPrevAccount] = useState(accountKey);

  if (prevAccount !== accountKey) {
    setPrevAccount(accountKey);
    const current = readReminderPreferences(accountKey);
    if (!hasReminderPreferences(accountKey)) current.role = initialRole;
    setPreferences(current);
  }

  const update = (patch: Partial<ReminderPreferences>) => {
    setPreferences((current) => ({ ...current, ...patch }));
    setSaved(false);
  };

  const toggleDay = (day: number) => {
    const daysBefore = preferences.daysBefore.includes(day)
      ? preferences.daysBefore.filter((value) => value !== day)
      : [...preferences.daysBefore, day];
    update({ daysBefore });
  };

  const addCustomDay = () => {
    if (!customDays.trim()) return;
    const value = Number(customDays);
    if (!Number.isInteger(value) || value < 0 || value > 90) return;
    if (preferences.daysBefore.includes(value)) return;
    update({ daysBefore: [...preferences.daysBefore, value] });
    setCustomDays("");
  };

  const requestPermission = async () => {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") update({ browserNotifications: true });
      else update({ browserNotifications: false });
    } catch {
      setPermission("denied");
      update({ browserNotifications: false });
    }
  };

  const save = () => {
    writeReminderPreferences({ ...preferences, role: roleLocked ? initialRole : preferences.role }, accountKey);
    setSaved(true);
  };

  return (
    <section id="milestone-reminders" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-800"><BellRing className="h-4 w-4" /></span>
            <h2 className="text-base font-semibold text-slate-900">Milestone deadline reminders</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Choose when this browser should remind you before each project phase is due. The seller and client each configure reminders on their own device. A client signs in with the email address the freelancer saved on that project.</p>
        </div>
        <span className="w-fit rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">Customizable</span>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3">
            <span><span className="block text-sm font-medium text-slate-800">Enable deadline reminders</span><span className="mt-0.5 block text-xs text-slate-500">Create in-app reminders for upcoming milestones.</span></span>
            <input type="checkbox" checked={preferences.enabled} onChange={(event) => update({ enabled: event.target.checked })} className="h-4 w-4 accent-sky-700" />
          </label>

          <div>
            <label htmlFor="reminder-role" className="mb-1.5 block text-xs font-semibold text-slate-700">This browser is used by</label>
            <select id="reminder-role" disabled={roleLocked} value={roleLocked ? initialRole : preferences.role} onChange={(event) => update({ role: event.target.value as ReminderPreferences["role"] })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-50 disabled:text-slate-500">
              <option value="seller">Freelancer / Seller</option>
              <option value="client">Client / Buyer</option>
            </select>
            <p className="mt-1.5 text-[11px] leading-5 text-slate-500">{roleLocked ? "This follows the role on your signed-in PayMind account." : "The reminder wording changes by role. Clients and sellers configure their own reminders on their own accounts."}</p>
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-800">Remind me this many days before</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {commonDays.map((day) => (
                <label key={day} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${preferences.daysBefore.includes(day) ? "border-sky-200 bg-sky-50 text-sky-900" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                  <input type="checkbox" checked={preferences.daysBefore.includes(day)} onChange={() => toggleDay(day)} className="h-3.5 w-3.5 accent-sky-700" />
                  {day === 0 ? "Due day" : `${day} days`}
                </label>
              ))}
              {preferences.daysBefore.filter((day) => !commonDays.includes(day)).map((day) => (
                <button key={day} type="button" onClick={() => toggleDay(day)} className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900">{day} days <Trash2 className="h-3 w-3" /></button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input aria-label="Custom reminder days" type="number" min="0" max="90" value={customDays} onChange={(event) => setCustomDays(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomDay(); } }} placeholder="Custom days (0–90)" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500" />
              <button type="button" onClick={addCustomDay} disabled={customDays.trim() === "" || !Number.isInteger(Number(customDays)) || Number(customDays) < 0 || Number(customDays) > 90} className="inline-flex items-center gap-1 rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Add</button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Browser notifications</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">Allow PayMind to show a desktop/browser notification when a reminder window is reached while PayMind is open.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={requestPermission} className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800">Allow browser notifications</button>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${permission === "granted" ? "bg-emerald-50 text-emerald-800" : permission === "denied" ? "bg-rose-50 text-rose-800" : "bg-slate-100 text-slate-600"}`}>{permission === "unsupported" ? "Not supported" : `Permission: ${permission}`}</span>
              {permission === "granted" && <button type="button" onClick={() => { try { new Notification("PayMind notifications are enabled", { body: "You will be reminded at the milestone offsets selected above while PayMind is running.", icon: "/favicon.ico" }); } catch { /* Keep the in-app bell available if desktop notifications are blocked. */ } }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Send test notification</button>}
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={preferences.browserNotifications} disabled={permission !== "granted"} onChange={(event) => update({ browserNotifications: event.target.checked })} className="h-4 w-4 accent-sky-700" />
              Show desktop notifications as well as the in-app notification feed
            </label>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold text-amber-900">Important delivery limitation</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">In-app reminders are checked while the application is open. Browser notifications appear only when permission is granted and the browser is running. Notifications while the app is fully closed require a server push subscription and scheduled background worker, which are not included in this local reminder feature.</p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
        {saved && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800"><Check className="h-3.5 w-3.5" /> Preferences saved on this browser</span>}
        <button type="button" onClick={save} className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800">Save reminder settings</button>
      </div>
    </section>
  );
}
