"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CalendarClock, CheckCheck, Settings2 } from "lucide-react";
import {
  markAllRemindersRead,
  markReminderRead,
  readReminderNotices,
  REMINDER_CHANGE_EVENT,
  type ReminderNotice,
} from "@/lib/reminders/reminder-store";

export function ReminderBell({ accountKey }: { accountKey: string }) {
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<ReminderNotice[]>([]);

  useEffect(() => {
    const refresh = () => setNotices(readReminderNotices(accountKey));
    refresh();
    window.addEventListener(REMINDER_CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    const poll = window.setInterval(refresh, 15_000);
    return () => {
      window.removeEventListener(REMINDER_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      window.clearInterval(poll);
    };
  }, [accountKey]);

  const unread = notices.filter((notice) => !notice.read).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Milestone notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-sky-700 px-1 text-center text-[10px] font-bold leading-5 text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Milestone reminders</h2>
              <p className="text-xs text-slate-500">{unread} unread · saved on this browser</p>
            </div>
            <button onClick={() => markAllRemindersRead(accountKey)} type="button" className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-800 hover:text-sky-950">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notices.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <CalendarClock className="mx-auto h-6 w-6 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-slate-700">No reminders yet</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Reminders appear when a milestone enters one of your selected reminder windows.</p>
              </div>
            ) : notices.slice(0, 12).map((notice) => (
              <button
                key={notice.id}
                type="button"
                onClick={() => markReminderRead(notice.id, accountKey)}
                className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${notice.read ? "bg-white" : "bg-sky-50/60"}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900">{notice.daysBefore === 0 ? "Due today" : `${notice.daysBefore} day${notice.daysBefore === 1 ? "" : "s"} remaining`}</span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">{notice.role}</span>
                </span>
                <span className="mt-1 block text-xs font-medium text-slate-700">{notice.milestoneTitle}</span>
                <span className="mt-1 block text-[11px] leading-5 text-slate-500">{notice.message}</span>
                <span className="mt-1 block text-[10px] text-slate-400">{notice.projectTitle} · Due {new Date(`${notice.dueDate}T00:00:00`).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
          <div className="border-t border-slate-100 p-3">
            <Link onClick={() => setOpen(false)} href="/settings#milestone-reminders" className="flex items-center justify-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800">
              <Settings2 className="h-3.5 w-3.5" /> Customize reminders
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
