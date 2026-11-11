"use client";

import { useEffect } from "react";
import {
  readReminderNotices,
  readReminderPreferences,
  readSentReminderKeys,
  writeReminderNotices,
  writeSentReminderKeys,
  REMINDER_CHANGE_EVENT,
  type ReminderNotice,
  type ReminderRole,
} from "@/lib/reminders/reminder-store";

function calendarDay(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function dayDifference(dueDate: string) {
  const today = new Date();
  const todayStart = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((calendarDay(dueDate) - todayStart) / 86_400_000);
}

type ReminderMilestone = { id: string; project_id: string; title: string; due_date: string | null; status: string };

export function ReminderScheduler({ accountKey }: { accountKey: string }) {
  useEffect(() => {
    let sourceMilestones: ReminderMilestone[] = [];
    let sourceProjects: Array<{ id: string; title: string }> = [];
    let serverRole: ReminderRole | null = null;
    let isAuthenticated = false;

    const checkReminders = () => {
      const preferences = readReminderPreferences(accountKey);
      const reminderRole: ReminderRole = isAuthenticated ? (serverRole ?? preferences.role) : preferences.role;
      if (!preferences.enabled || preferences.daysBefore.length === 0) return;

      const sentKeys = new Set(readSentReminderKeys(accountKey));
      const existingNotices = readReminderNotices(accountKey);
      const newNotices: ReminderNotice[] = [];

      for (const milestone of sourceMilestones) {
        if (!milestone.due_date || ["paid", "disputed", "approved", "completed", "cancelled"].includes(milestone.status.toLowerCase())) continue;
        const remainingDays = dayDifference(milestone.due_date);
        if (!preferences.daysBefore.includes(remainingDays)) continue;

        const project = sourceProjects.find((item) => item.id === milestone.project_id);
        const key = `${milestone.id}:${milestone.due_date}:${remainingDays}:${reminderRole}`;
        if (sentKeys.has(key)) continue;

        const message = reminderRole === "client"
          ? remainingDays === 0
            ? `Client reminder: ${milestone.title} is due today. Review the deliverable and submit any agreed change request.`
            : `Client reminder: ${milestone.title} is due in ${remainingDays} day${remainingDays === 1 ? "" : "s"}. Review progress and raise any small change request early.`
          : remainingDays === 0
            ? `Seller reminder: ${milestone.title} is due today. Complete the agreed work or discuss an extension with the client.`
            : `Seller reminder: ${milestone.title} is due in ${remainingDays} day${remainingDays === 1 ? "" : "s"}. Check remaining work and discuss any delivery risk early.`;

        const notice: ReminderNotice = {
          id: key,
          milestoneId: milestone.id,
          projectId: milestone.project_id,
          projectTitle: project?.title ?? "Project",
          milestoneTitle: milestone.title,
          dueDate: milestone.due_date,
          daysBefore: remainingDays,
          role: reminderRole,
          message,
          createdAt: new Date().toISOString(),
          read: false,
        };
        newNotices.push(notice);
        sentKeys.add(key);

        if (preferences.browserNotifications && "Notification" in window && Notification.permission === "granted") {
          try {
            new Notification("PayMind milestone reminder", {
              body: message,
              tag: key,
              icon: "/favicon.ico",
            });
          } catch {
            // The in-app notification remains available if the browser blocks desktop notifications.
          }
        }
      }

      if (newNotices.length) {
        writeSentReminderKeys([...sentKeys], accountKey);
        writeReminderNotices([...newNotices, ...existingNotices], accountKey);
      }
    };

    const loadAccountMilestones = async () => {
      try {
        const response = await fetch("/api/reminders/milestones", { cache: "no-store" });
        if (!response.ok) return;
        const result = await response.json() as {
          milestones?: Array<{ id: string; project_id: string; title: string; due_date: string | null; status: string }>;
          projects?: Array<{ id: string; title: string }>;
          role?: ReminderRole;
          authenticated?: boolean;
        };
        const authenticated = result.authenticated === true;
        isAuthenticated = authenticated;
        serverRole = result.role === "client" ? "client" : result.role === "seller" ? "seller" : null;
        if (authenticated) {
          // Authenticated Supabase accounts use server-backed milestone reminders.
          sourceMilestones = result.milestones ?? [];
          sourceProjects = result.projects ?? [];
        } else {
          // Demo/local workspace fallback: use browser-local project milestones.
          try {
            const raw = window.localStorage.getItem("paymind.demo-workspace.v1");
            if (raw) {
              const workspace = JSON.parse(raw) as { projects?: Array<{ id: string; name: string; milestones?: Array<{ id: string; title: string; dueDate?: string; status?: string }> }> };
              sourceProjects = (workspace.projects ?? []).map((p) => ({ id: p.id, title: p.name }));
              sourceMilestones = (workspace.projects ?? []).flatMap((p) =>
                (p.milestones ?? []).map((m) => ({
                  id: m.id,
                  project_id: p.id,
                  title: m.title,
                  due_date: m.dueDate || null,
                  status: m.status || "pending",
                })),
              );
              serverRole = (JSON.parse(raw) as { view?: string }).view === "client" ? "client" : "seller";
            } else {
              sourceMilestones = result.milestones ?? [];
              sourceProjects = result.projects ?? [];
            }
          } catch {
            sourceMilestones = result.milestones ?? [];
            sourceProjects = result.projects ?? [];
          }
        }
        checkReminders();
      } catch {
        // The last available local demo deadlines remain usable if the API is offline.
      }
    };

    void loadAccountMilestones();
    const interval = window.setInterval(() => { checkReminders(); void loadAccountMilestones(); }, 60_000);
    window.addEventListener(REMINDER_CHANGE_EVENT, checkReminders);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(REMINDER_CHANGE_EVENT, checkReminders);
    };
  }, [accountKey]);

  return null;
}
