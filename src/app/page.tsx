"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, Clock3, FolderGit2, TriangleAlert } from "lucide-react";
import { DemoModeBanner } from "@/components/workspace/DemoModeBanner";
import { WorkspaceCalendar } from "@/components/workspace/WorkspaceCalendar";
import { computeWorkspaceSummary } from "@/lib/workspace/workspace-insights";
import { useDemoWorkspace } from "@/lib/workspace/use-demo-workspace";
import { visibleProjects } from "@/lib/workspace/workspace-store";
import { formatCurrency } from "@/lib/utils";

export default function OverviewPage() {
  const workspace = useDemoWorkspace();
  const projects = visibleProjects(workspace);
  const summary = computeWorkspaceSummary(workspace);
  const view = workspace.view;
  const receivedLabel = view === "client" ? "Payments sent" : "Payments received";
  const receivedHint = view === "client"
    ? "Demo records marked as sent in this browser"
    : "Demo records marked as received in this browser";

  const cards = [
    {
      label: "Active projects",
      value: String(summary.activeProjects),
      hint: `${projects.length} visible in ${view === "client" ? "client" : "merchant"} view`,
      icon: FolderGit2,
      tone: "text-sky-700 bg-sky-50",
    },
    {
      label: "Upcoming payments",
      value: formatCurrency(summary.upcomingPaymentsAmount, summary.currency),
      hint: `${summary.upcomingPaymentsCount} upcoming due item${summary.upcomingPaymentsCount === 1 ? "" : "s"}`,
      icon: Clock3,
      tone: "text-amber-700 bg-amber-50",
    },
    {
      label: "Overdue payments",
      value: formatCurrency(summary.overduePaymentsAmount, summary.currency),
      hint: `${summary.overduePaymentsCount} overdue item${summary.overduePaymentsCount === 1 ? "" : "s"}`,
      icon: TriangleAlert,
      tone: "text-rose-700 bg-rose-50",
    },
    {
      label: receivedLabel,
      value: formatCurrency(summary.paymentsReceivedAmount, summary.currency),
      hint: `${summary.paymentsReceivedCount} demo record${summary.paymentsReceivedCount === 1 ? "" : "s"} · ${receivedHint}`,
      icon: CheckCircle2,
      tone: view === "client" ? "text-rose-700 bg-rose-50" : "text-emerald-700 bg-emerald-50",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-950">Overview</h1>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800">
              {view === "client" ? "Client view" : "Merchant view"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Shared project calendar and workspace summary calculated from your demo project data.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/projects" className="inline-flex items-center gap-1.5 rounded-xl bg-sky-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-800">
            Manage projects <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link href="/settings#workspace-view" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Change view
          </Link>
        </div>
      </div>

      <DemoModeBanner view={view} />

      {view === "client" && projects.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No projects match the selected demo client. Choose a different demo client in Settings or add a project with that client name in Projects.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium">{card.label}</span>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.tone}`}><Icon className="h-4 w-4" /></span>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">{card.hint}</p>
            </div>
          );
        })}
      </div>

      <WorkspaceCalendar state={workspace} />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Projects in this view</h2>
            <p className="text-xs text-slate-500">Project details, deadlines, and manual payment status are calculated from the shared demo workspace.</p>
          </div>
          <Link href="/projects" className="text-xs font-semibold text-sky-700 hover:text-sky-900">Projects &rarr;</Link>
        </div>
        <div className="mt-4 space-y-3">
          {projects.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              No projects yet. Add a custom project in Projects to populate the calendar and summaries.
            </p>
          ) : projects.map((project) => (
            <div key={project.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{project.name}</span>
                    <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{project.status.replace("_", " ")}</span>
                    {project.isDemo && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Demo</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{project.clientName}{project.companyName ? ` · ${project.companyName}` : ""}</p>
                </div>
                <div className="text-xs text-slate-600 sm:text-right">
                  <div className="font-semibold text-slate-900">{formatCurrency(project.totalAmount, project.currency)}</div>
                  <div className="mt-0.5 inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Deadline {project.overallDeadline || "Not set"}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
