"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { buildWorkspaceCalendarEvents, DEFAULT_TODAY_YMD, eventColor, type WorkspaceCalendarEvent } from "@/lib/workspace/workspace-insights";
import { updateDemoWorkspaceState } from "@/lib/workspace/workspace-store";
import { newId, type DemoWorkspaceState } from "@/lib/workspace/workspace-types";
import { formatCurrency } from "@/lib/utils";

type ViewMode = "month" | "week" | "agenda";

function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseYmd(s: string) { const [y, m, d] = s.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addDays(d: Date, days: number) { const n = new Date(d); n.setDate(n.getDate() + days); return n; }
function startOfWeek(d: Date) { const n = new Date(d); const day = n.getDay(); n.setDate(n.getDate() - day); return n; }

const legend = [
  { label: "Delivery / milestone", cls: "bg-sky-100 border-sky-300" },
  { label: "Upcoming / expected", cls: "bg-amber-100 border-amber-300" },
  { label: "Overdue", cls: "bg-rose-100 border-rose-300" },
  { label: "Received / sent (demo)", cls: "bg-emerald-100 border-emerald-300" },
  { label: "Review / agreement", cls: "bg-violet-100 border-violet-300" },
  { label: "Custom date", cls: "bg-slate-100 border-slate-300" },
];

function eventLegendClass(kind: WorkspaceCalendarEvent["kind"]) {
  if (kind === "payment_overdue" || kind === "payment_sent") return "bg-rose-100 border-rose-300";
  if (kind === "payment_received") return "bg-emerald-100 border-emerald-300";
  if (kind === "payment_due") return "bg-amber-100 border-amber-300";
  if (kind === "delivery_milestone" || kind === "milestone_due") return "bg-sky-100 border-sky-300";
  if (kind === "review") return "bg-violet-100 border-violet-300";
  return "bg-slate-100 border-slate-300";
}

export function WorkspaceCalendar({ state }: { state: DemoWorkspaceState }) {
  const [cursor, setCursor] = useState(() => parseYmd(DEFAULT_TODAY_YMD));
  const [today, setToday] = useState(DEFAULT_TODAY_YMD);
  const [mode, setMode] = useState<ViewMode>("month");
  const [selected, setSelected] = useState<WorkspaceCalendarEvent | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ title: "", date: DEFAULT_TODAY_YMD, kind: "reminder" as "reminder" | "review", note: "", projectId: "" });

  useEffect(() => {
    const next = ymd(new Date());
    const timer = window.setTimeout(() => {
      setToday(next);
      setCursor(parseYmd(next));
      setDraft((d) => (d.date === DEFAULT_TODAY_YMD ? { ...d, date: next } : d));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);


  const allEvents = useMemo(() => buildWorkspaceCalendarEvents(state, today), [state, today]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, WorkspaceCalendarEvent[]>();
    for (const ev of allEvents) {
      const list = map.get(ev.date) || [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, [allEvents]);

  const monthStart = startOfMonth(cursor);
  const gridStart = startOfWeek(monthStart);
  const monthDays = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const weekStart = startOfWeek(cursor);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const agendaEvents = useMemo(() => {
    const end = ymd(addDays(parseYmd(today), 60));
    return allEvents.filter((e) => e.date >= today && e.date <= end).slice(0, 40);
  }, [allEvents, today]);

  const move = (delta: number) => {
    const next = new Date(cursor);
    if (mode === "month") next.setMonth(next.getMonth() + delta);
    else next.setDate(next.getDate() + delta * 7);
    setCursor(next);
  };

  const addCustomDate = () => {
    if (!draft.title.trim() || !draft.date) return;
    updateDemoWorkspaceState((current) => ({
      ...current,
      customDates: [
        ...current.customDates,
        { id: newId("date"), projectId: draft.projectId || undefined, title: draft.title.trim(), date: draft.date, kind: draft.kind, note: draft.note.trim(), isDemo: true },
      ],
    }));
    setDraft({ title: "", date: today, kind: "reminder", note: "", projectId: "" });
    setShowAdd(false);
  };

  const title = mode === "month"
    ? cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : `Week of ${weekStart.toLocaleDateString()}`;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Project calendar</h2>
          <p className="mt-1 text-xs text-slate-500">Shared workspace dates: milestones, delivery/review dates, and payment events (demo records labeled where applicable).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            {(["month", "week", "agenda"] as ViewMode[]).map((v) => (
              <button key={v} type="button" onClick={() => setMode(v)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${mode === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{v}</button>
            ))}
          </div>
          <button type="button" onClick={() => setCursor(parseYmd(today))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Today</button>
          <button type="button" onClick={() => setShowAdd((v) => !v)} className="inline-flex items-center gap-1 rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800"><Plus className="h-3.5 w-3.5" /> Add date</button>
        </div>
      </div>

      {showAdd && (
        <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-5">
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Date/reminder title" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:col-span-2" />
          <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as "reminder" | "review" })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="reminder">Reminder</option>
            <option value="review">Review / agreement</option>
          </select>
          <button type="button" onClick={addCustomDate} disabled={!draft.title.trim()} className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Save date</button>
          <select value={draft.projectId} onChange={(e) => setDraft({ ...draft, projectId: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:col-span-2">
            <option value="">No project (general date)</option>
            {state.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Optional note" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:col-span-3" />
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => move(-1)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => move(1)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Next"><ChevronRight className="h-4 w-4" /></button>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {legend.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
            <span className={`h-2.5 w-2.5 rounded-sm border ${item.cls}`} /> {item.label}
          </span>
        ))}
      </div>

      {mode === "month" && (
        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-7 gap-px rounded-t-xl bg-slate-200 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="bg-slate-50 py-2">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-px bg-slate-200">
              {monthDays.map((day) => {
                const key = ymd(day);
                const inMonth = day.getMonth() === cursor.getMonth();
                const dayEvents = eventsByDay.get(key) || [];
                return (
                  <div key={key} className={`min-h-[110px] bg-white p-2 ${!inMonth ? "bg-slate-50/70 text-slate-400" : ""}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${key === today ? "rounded-full bg-sky-700 px-1.5 py-0.5 text-white" : "text-slate-700"}`}>{day.getDate()}</span>
                    </div>
                    <div className="mt-1 space-y-1">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <button key={ev.id} type="button" onClick={() => setSelected(ev)} className={`block w-full truncate rounded border px-1.5 py-0.5 text-left text-[10px] font-medium ${eventColor(ev.kind, state.view)}`} title={ev.title}>
                          {ev.title}
                        </button>
                      ))}
                      {dayEvents.length > 3 && <span className="block text-[10px] text-slate-500">+{dayEvents.length - 3} more</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {mode === "week" && (
        <div className="mt-4 grid gap-3 md:grid-cols-7">
          {weekDays.map((day) => {
            const key = ymd(day);
            const dayEvents = eventsByDay.get(key) || [];
            return (
              <div key={key} className={`min-h-[140px] rounded-xl border p-3 ${key === today ? "border-sky-300 bg-sky-50/30" : "border-slate-200 bg-white"}`}>
                <div className="text-xs font-semibold text-slate-700">{day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>
                <div className="mt-2 space-y-1.5">
                  {dayEvents.length === 0 ? <p className="text-[11px] text-slate-400">No events</p> : dayEvents.map((ev) => (
                    <button key={ev.id} type="button" onClick={() => setSelected(ev)} className={`block w-full rounded border px-2 py-1 text-left text-[11px] ${eventColor(ev.kind, state.view)}`}>
                      <span className="block font-semibold">{ev.title}</span>
                      {ev.projectName && <span className="block opacity-80">{ev.projectName}</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mode === "agenda" && (
        <div className="mt-4 space-y-2">
          {agendaEvents.length === 0 ? <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No upcoming events in the next 60 days.</p> : agendaEvents.map((ev) => (
            <button key={ev.id} type="button" onClick={() => setSelected(ev)} className="flex w-full flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3 text-left hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-sm border ${eventLegendClass(ev.kind)}`} />
                  <span className="text-sm font-semibold text-slate-900">{ev.title}</span>
                  {ev.isDemo && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Demo record</span>}
                </div>
                <p className="mt-1 text-xs text-slate-500">{ev.projectName || "General"}{ev.note ? ` · ${ev.note}` : ""}</p>
              </div>
              <div className="text-xs text-slate-600 sm:text-right">
                <div className="font-semibold">{parseYmd(ev.date).toLocaleDateString()}</div>
                {typeof ev.amount === "number" && ev.currency && <div>{formatCurrency(ev.amount, ev.currency)}</div>}
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{selected.title}</h3>
                <p className="mt-1 text-xs text-slate-500">{parseYmd(selected.date).toLocaleDateString()}{selected.projectName ? ` · ${selected.projectName}` : ""}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600">Close</button>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              {typeof selected.amount === "number" && selected.currency && <p><strong>Amount:</strong> {formatCurrency(selected.amount, selected.currency)}</p>}
              {selected.note && <p><strong>Details:</strong> {selected.note}</p>}
              {selected.isDemo && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">This is a demo/local workspace record. It is not a verified PayPal capture or real accounting record.</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
