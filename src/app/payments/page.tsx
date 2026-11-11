"use client";

import { useEffect, useState } from "react";
import { DemoModeBanner } from "@/components/workspace/DemoModeBanner";
import { useDemoWorkspace } from "@/lib/workspace/use-demo-workspace";
import { updateDemoWorkspaceState, visibleProjects } from "@/lib/workspace/workspace-store";
import { newId, type WorkspacePaymentEvent } from "@/lib/workspace/workspace-types";
import { formatCurrency } from "@/lib/utils";
import { computeProjectPaymentTotals, DEFAULT_TODAY_YMD, milestonePaymentDueDate, milestonePaymentReceivedDate, milestonePaymentSentDate, milestonePaymentStatus } from "@/lib/workspace/workspace-insights";

function statusLabel(status: ReturnType<typeof milestonePaymentStatus>, view: "merchant" | "client") {
  if (status === "received_demo") return view === "client" ? "Sent / acknowledged (demo)" : "Received (demo)";
  if (status === "sent") return view === "client" ? "Payment sent (demo)" : "Client sent (demo)";
  if (status === "overdue") return "Overdue";
  if (status === "upcoming") return view === "client" ? "Upcoming payment" : "Expected payment";
  if (status === "paid") return "Paid";
  return "No payment due";
}

function statusTone(status: ReturnType<typeof milestonePaymentStatus>) {
  if (status === "received_demo" || status === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "sent") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "overdue") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "upcoming") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function PaymentsPage() {
  const workspace = useDemoWorkspace();
  const projects = visibleProjects(workspace);
  const [draft, setDraft] = useState({ projectId: "", milestoneId: "", type: "payment_sent" as "payment_sent" | "payment_received", date: DEFAULT_TODAY_YMD, note: "" });
  const [today, setToday] = useState(DEFAULT_TODAY_YMD);
  useEffect(() => {
    const next = new Date().toISOString().slice(0, 10);
    const timer = window.setTimeout(() => {
      setToday(next);
      setDraft((current) => (current.date === DEFAULT_TODAY_YMD ? { ...current, date: next } : current));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const effectiveProjectId = draft.projectId && projects.some((p) => p.id === draft.projectId) ? draft.projectId : (projects[0]?.id || "");
  const selectedProject = projects.find((p) => p.id === effectiveProjectId);
  const effectiveMilestoneId = draft.milestoneId && selectedProject?.milestones.some((m) => m.id === draft.milestoneId) ? draft.milestoneId : (selectedProject?.milestones[0]?.id || "");
  const selectedMilestone = selectedProject?.milestones.find((m) => m.id === effectiveMilestoneId);

  const visibleIds = new Set(projects.map((p) => p.id));
  const events = workspace.paymentEvents
    .filter((e) => visibleIds.has(e.projectId))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1));

  const canAct = workspace.view === "client" ? draft.type === "payment_sent" : draft.type === "payment_received";
  const actionLabel = draft.type === "payment_sent" ? "Record payment sent (demo)" : "Record payment received (demo)";

  const recordPayment = () => {
    if (!selectedProject || !selectedMilestone || !canAct) return;
    const now = new Date().toISOString();
    const event: WorkspacePaymentEvent = {
      id: newId("pay"),
      projectId: selectedProject.id,
      milestoneId: selectedMilestone.id,
      type: draft.type,
      amount: selectedMilestone.amount,
      currency: selectedMilestone.currency || selectedProject.currency,
      date: draft.date,
      note: draft.note.trim(),
      isDemo: true,
      createdAt: now,
    };
    updateDemoWorkspaceState((current) => ({
      ...current,
      paymentEvents: [event, ...current.paymentEvents],
      projects: current.projects.map((p) => p.id !== selectedProject.id ? p : ({
        ...p,
        updatedAt: now,
        milestones: p.milestones.map((m) => {
          if (m.id !== selectedMilestone.id) return m;
          const next = { ...m };
          if (draft.type === "payment_sent") next.paymentSentDate = draft.date;
          if (draft.type === "payment_received") {
            next.paymentReceivedDate = draft.date;
            next.paymentStatus = "received";
          }
          return next;
        }),
      })),
    }));
    setDraft((current) => ({ ...current, note: "" }));
  };

  const summary = (() => {
    let agreed = 0, allocated = 0, sent = 0, received = 0, outstanding = 0, overdue = 0;
    for (const project of projects) {
      const t = computeProjectPaymentTotals(project, workspace.paymentEvents, today);
      agreed += t.agreedProjectValue; allocated += t.milestoneAllocationsTotal; sent += t.paymentsSentAmount; received += t.paymentsReceivedAmount; outstanding += t.outstandingAmount;
      for (const m of project.milestones) {
        const status = milestonePaymentStatus({ view: workspace.view, project, milestone: m, events: workspace.paymentEvents, today });
        if (status === "overdue") overdue += m.amount;
      }
    }
    return { agreed, allocated, sent, received, outstanding, overdue, currency: projects[0]?.currency || "USD" };
  })();

  return (
    <div className="space-y-6">
      <header className="border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-slate-950">Payments</h1>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Local demo records</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Track project payment schedules and manual payment history in this browser. Records are not created through PayPal Sandbox APIs, not stored in Supabase payment records, and never represent verified PayPal captures.
        </p>
      </header>

      <DemoModeBanner view={workspace.view} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Agreed project value", summary.agreed, "border-slate-200 bg-white text-slate-900"],
          ["Milestone allocations", summary.allocated, "border-slate-200 bg-white text-slate-900"],
          [workspace.view === "client" ? "Outstanding to pay (demo/planned)" : "Outstanding (demo/planned)", summary.outstanding, "border-amber-200 bg-amber-50 text-amber-900"],
          ["Overdue", summary.overdue, "border-rose-200 bg-rose-50 text-rose-900"],
          [workspace.view === "client" ? "Sent (demo)" : "Client sent (demo)", summary.sent, "border-sky-200 bg-sky-50 text-sky-900"],
          [workspace.view === "client" ? "Received / acknowledged (demo)" : "Received (demo)", summary.received, "border-emerald-200 bg-emerald-50 text-emerald-900"],
        ].map(([label, value, cls]) => (
          <div key={String(label)} className={`rounded-2xl border p-4 shadow-sm ${cls}`}>
            <p className="text-xs font-medium opacity-80">{label}</p>
            <p className="mt-1 text-lg font-bold">{formatCurrency(Number(value), summary.currency)}</p>
          </div>
        ))}
      </section>
      <p className="text-xs text-slate-500">Outstanding/sent/received figures are based on demo/manual workspace records and milestone planning state. They are not verified PayPal captures.</p>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Record a demo payment event</h2>
        <p className="mt-1 text-xs text-slate-500">
          {workspace.view === "client"
            ? "Client view records Payment sent (demo). Merchant view records Payment received (demo)."
            : "Merchant view records Payment received (demo). Switch to Client view in Settings to record Payment sent (demo)."}
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <select aria-label="Payment project" value={effectiveProjectId} onChange={(e) => setDraft({ ...draft, projectId: e.target.value, milestoneId: "" })} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
            {projects.length === 0 ? <option value="">No projects</option> : projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select aria-label="Payment milestone" value={effectiveMilestoneId} onChange={(e) => setDraft({ ...draft, milestoneId: e.target.value })} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
            {selectedProject?.milestones?.length ? selectedProject.milestones.map((m) => <option key={m.id} value={m.id}>{m.phase}: {m.title}</option>) : <option value="">No milestones</option>}
          </select>
          <select aria-label="Payment event type" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as "payment_sent" | "payment_received" })} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
            <option value="payment_sent">Payment sent (client)</option>
            <option value="payment_received">Payment received (merchant)</option>
          </select>
          <input aria-label="Payment date" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <button type="button" onClick={recordPayment} disabled={!selectedMilestone || !canAct} className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-40">
            {actionLabel}
          </button>
        </div>
        {selectedMilestone && (
          <p className="mt-3 text-xs text-slate-500">
            Selected milestone amount: <strong className="text-slate-700">{formatCurrency(selectedMilestone.amount, selectedMilestone.currency || selectedProject?.currency || "USD")}</strong>. Due: <strong>{milestonePaymentDueDate(selectedMilestone) || "not set"}</strong>. Recording creates a <strong>demo record</strong> only.
          </p>
        )}
        <input aria-label="Payment note" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Optional note (demo)" className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
        {!canAct && projects.length > 0 && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">This action does not match the current view. Switch views in Settings or choose the matching action.</p>}
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">Milestone schedules and payment history</h2>
        {projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">No projects available. Add a project first.</div>
        ) : projects.map((project) => {
          const projectEvents = events.filter((e) => e.projectId === project.id);
          return (
            <article key={project.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-1 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{project.name}</h3>
                  <p className="text-xs text-slate-500">{project.clientName}{project.companyName ? ` · ${project.companyName}` : ""} · {formatCurrency(project.totalAmount, project.currency)}</p>
                </div>
                <span className="text-xs text-slate-500">{projectEvents.length} demo payment record{projectEvents.length === 1 ? "" : "s"}</span>
              </div>
              <div className="mt-3 space-y-2">
                {project.milestones.map((m) => {
                  const status = milestonePaymentStatus({ view: workspace.view, project, milestone: m, events: workspace.paymentEvents, today });
                  return (
                    <div key={m.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{m.phase}: {m.title}</p>
                          <p className="mt-1 text-xs text-slate-500">Agreed {formatCurrency(m.amount, m.currency)} · Due {milestonePaymentDueDate(m) || "n/a"} · Sent {milestonePaymentSentDate(m, workspace.paymentEvents) || "—"} · Received {milestonePaymentReceivedDate(m, workspace.paymentEvents) || "—"}</p>
                        </div>
                        <span className={`w-fit rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone(status)}`}>{statusLabel(status, workspace.view)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {projectEvents.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Payment history (newest first)</p>
                  <div className="space-y-2">
                    {projectEvents.map((event) => {
                      const milestone = project.milestones.find((m) => m.id === event.milestoneId);
                      const sent = event.type === "payment_sent";
                      return (
                        <div key={event.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sent ? "bg-rose-50 text-rose-800 border border-rose-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"}`}>{sent ? "Payment sent" : "Payment received"}</span>
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Demo record</span>
                            </div>
                            <p className="mt-1 text-sm font-medium text-slate-900">{milestone ? `${milestone.phase}: ${milestone.title}` : "Project payment"}</p>
                            {event.note && <p className="mt-0.5 text-xs text-slate-500">{event.note}</p>}
                          </div>
                          <div className="text-xs text-slate-600 sm:text-right">
                            <div className="font-semibold text-slate-900">{formatCurrency(event.amount, event.currency)}</div>
                            <div>{event.date}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </section>

      <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
        Existing PayPal backend routes and checkout integrations remain in the codebase for sandbox/backend flows, but this Payments page does not call PayPal Sandbox APIs, does not read or write Supabase payment records, and does not render PayPal checkout buttons.
      </p>
    </div>
  );
}
