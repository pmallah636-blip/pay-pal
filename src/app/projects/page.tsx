"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Copy, ExternalLink, FlaskConical, Mail, Plus, Send, Trash2, X } from "lucide-react";
import { DemoModeBanner } from "@/components/workspace/DemoModeBanner";
import { useDemoWorkspace } from "@/lib/workspace/use-demo-workspace";
import { createExampleProject, setSelectedClientName, updateDemoWorkspaceState, visibleProjects } from "@/lib/workspace/workspace-store";
import { defaultContractItems, newId, type WorkspaceMilestone, type WorkspacePaymentEvent, type WorkspaceProject } from "@/lib/workspace/workspace-types";
import { formatCurrency } from "@/lib/utils";
import {
  computeProjectPaymentTotals,
  DEFAULT_TODAY_YMD,
  milestonePaymentDueDate,
  milestonePaymentReceivedDate,
  milestonePaymentSentDate,
  milestonePaymentStatus,
} from "@/lib/workspace/workspace-insights";

type PreviewRecord = {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  clientEmail: string;
  shareUrl?: string;
  note?: string;
  status: "active" | "local_only" | "error";
  createdAt: string;
  expiresAt?: string;
  isDemo?: boolean;
};

function paymentStatusLabel(status: ReturnType<typeof milestonePaymentStatus>, view: "merchant" | "client") {
  if (status === "received_demo") return view === "client" ? "Received / acknowledged (demo)" : "Received (demo)";
  if (status === "sent") return view === "client" ? "Payment sent (demo)" : "Client sent (demo)";
  if (status === "overdue") return "Overdue";
  if (status === "upcoming") return view === "client" ? "Upcoming payment" : "Expected payment";
  if (status === "paid") return "Paid";
  return "No payment due";
}
function paymentStatusTone(status: ReturnType<typeof milestonePaymentStatus>) {
  if (status === "received_demo" || status === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "sent") return "border-sky-200 bg-sky-50 text-sky-800";
  if (status === "overdue") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "upcoming") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function emptyProject(today = DEFAULT_TODAY_YMD): Omit<WorkspaceProject, "id" | "createdAt" | "updatedAt"> {
  return {
    name: "",
    clientName: "",
    companyName: "",
    clientEmail: "",
    description: "",
    totalAmount: 0,
    currency: "USD",
    startDate: today,
    overallDeadline: today,
    status: "active",
    isDemo: true,
    contractItems: defaultContractItems(),
    milestones: [emptyMilestone("USD", today)],
  };
}

function emptyMilestone(currency: string, today = DEFAULT_TODAY_YMD): WorkspaceMilestone {
  return { id: newId("ms"), title: "", phase: "Phase 1", description: "", deliverables: "", amount: 0, currency, startDate: today, dueDate: today, paymentDueDate: today, acceptanceCriteria: "", status: "pending", paymentStatus: "pending" };
}

function normalizeProject(input: Omit<WorkspaceProject, "id" | "createdAt" | "updatedAt">): Omit<WorkspaceProject, "id" | "createdAt" | "updatedAt"> {
  const milestones = (input.milestones.length ? input.milestones : [emptyMilestone(input.currency)]).map((m, i) => ({
    ...m,
    phase: m.phase || `Phase ${i + 1}`,
    currency: input.currency,
    amount: Number.isFinite(m.amount) ? m.amount : 0,
    paymentDueDate: m.paymentDueDate || m.dueDate,
  }));
  const total = Number.isFinite(input.totalAmount) ? input.totalAmount : milestones.reduce((s, m) => s + m.amount, 0);
  return { ...input, totalAmount: total, milestones, contractItems: input.contractItems?.length ? input.contractItems : defaultContractItems() };
}

export default function ProjectsPage() {
  const workspace = useDemoWorkspace();
  const projects = visibleProjects(workspace);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedDetailsId, setSelectedDetailsId] = useState<string | null>(null);
  const [today, setToday] = useState(DEFAULT_TODAY_YMD);
  const [form, setForm] = useState<Omit<WorkspaceProject, "id" | "createdAt" | "updatedAt">>(() => emptyProject(DEFAULT_TODAY_YMD));
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewRecords, setPreviewRecords] = useState<PreviewRecord[]>([]);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);

  useEffect(() => {
    const next = new Date().toISOString().slice(0, 10);
    const timer = window.setTimeout(() => setToday(next), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const selectedDetailsProject = useMemo(() => workspace.projects.find((p) => p.id === selectedDetailsId) ?? null, [workspace.projects, selectedDetailsId]);
  const milestoneTotal = useMemo(() => form.milestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0), [form.milestones]);
  const totalDiff = (Number(form.totalAmount) || 0) - milestoneTotal;
  const formCurrency = (form.currency || "USD").toUpperCase();
  const formCurrencyMismatch = form.milestones.some((m) => (m.currency || formCurrency).toUpperCase() !== formCurrency);

  const openNew = () => {
    setEditingId(null);
    setSelectedDetailsId(null);
    setForm(emptyProject(today));
    setError(null);
    setShowForm(true);
  };
  const openEdit = (project: WorkspaceProject) => {
    setEditingId(project.id);
    setSelectedDetailsId(project.id);
    setForm({ name: project.name, clientName: project.clientName, companyName: project.companyName, clientEmail: project.clientEmail, description: project.description, totalAmount: project.totalAmount, currency: project.currency, startDate: project.startDate, overallDeadline: project.overallDeadline, status: project.status, milestones: project.milestones.map((m) => ({ ...m })), contractItems: project.contractItems?.length ? project.contractItems.map((c) => ({ ...c })) : defaultContractItems(), contractText: project.contractText, contractRequirements: project.contractRequirements, contractAnalysisUpdatedAt: project.contractAnalysisUpdatedAt, isDemo: true });
    setError(null);
    setShowForm(true);
  };
  const openDetails = (project: WorkspaceProject) => {
    setSelectedDetailsId(project.id);
    setShowForm(false);
    setEditingId(null);
  };

  const saveProject = () => {
    setError(null);
    if (!form.name.trim()) return setError("Project name is required.");
    if (!form.clientName.trim()) return setError("Client name is required.");
    if (!form.totalAmount || form.totalAmount <= 0) return setError("Total amount must be greater than 0.");
    if (form.milestones.some((m) => !m.title.trim())) return setError("Each milestone needs a title.");
    if (form.milestones.some((m) => !m.dueDate)) return setError("Each milestone needs a delivery/due date.");
    if (form.milestones.some((m) => !(m.paymentDueDate || m.dueDate))) return setError("Each milestone needs a payment due date.");
    // Warn on inconsistencies but allow explicit correction/save; never alter recorded payment history.
    if (Math.abs(totalDiff) >= 0.01) {
      const proceed = window.confirm(totalDiff > 0
        ? `Project total has ${formatCurrency(totalDiff, formCurrency)} unallocated compared to milestone allocations. Save anyway?`
        : `Milestone allocations exceed project total by ${formatCurrency(Math.abs(totalDiff), formCurrency)}. Save anyway?`);
      if (!proceed) return;
    }
    if (formCurrencyMismatch) {
      const proceed = window.confirm("Some milestone currencies do not match the project currency. This may cause reporting confusion. Save anyway?");
      if (!proceed) return;
    }
    const normalized = normalizeProject(form);
    const now = new Date().toISOString();
    const wasEdit = Boolean(editingId);
    let savedId = editingId;
    updateDemoWorkspaceState((current) => {
      if (wasEdit && editingId) {
        return { ...current, projects: current.projects.map((p) => p.id === editingId ? { ...p, ...normalized, updatedAt: now } : p) };
      }
      const created: WorkspaceProject = { id: newId("proj"), ...normalized, createdAt: now, updatedAt: now };
      savedId = created.id;
      return { ...current, projects: [created, ...current.projects], selectedClientName: current.selectedClientName || created.clientName };
    });
    if (workspace.view === "client" && normalized.clientName) setSelectedClientName(normalized.clientName);
    setShowForm(false);
    setEditingId(null);
    if (savedId) setSelectedDetailsId(savedId);
    setNotice(wasEdit ? "Project updated. Existing demo payment history was not changed." : "Custom project added to the shared demo workspace.");
    setTimeout(() => setNotice(null), 3500);
  };

  const deleteProject = (id: string) => {
    updateDemoWorkspaceState((current) => ({
      ...current,
      projects: current.projects.filter((p) => p.id !== id),
      paymentEvents: current.paymentEvents.filter((e) => e.projectId !== id),
      customDates: current.customDates.filter((d) => d.projectId !== id),
      deliveryReviews: current.deliveryReviews.filter((review) => review.projectId !== id),
    }));
    if (selectedDetailsId === id) setSelectedDetailsId(null);
  };

  const updateMilestone = (index: number, patch: Partial<WorkspaceMilestone>) => {
    setForm((current) => ({ ...current, milestones: current.milestones.map((m, i) => i === index ? { ...m, ...patch } : m) }));
  };

  const recordMilestonePayment = (projectId: string, milestoneId: string, type: "payment_sent" | "payment_received") => {
    if (workspace.view === "client" && type !== "payment_sent") return;
    if (workspace.view !== "client" && type !== "payment_received") return;
    const project = workspace.projects.find((p) => p.id === projectId);
    const milestone = project?.milestones.find((m) => m.id === milestoneId);
    if (!project || !milestone) return;
    const now = new Date().toISOString();
    const date = now.slice(0, 10);
    const event: WorkspacePaymentEvent = {
      id: newId("pay"),
      projectId,
      milestoneId,
      type,
      amount: milestone.amount,
      currency: milestone.currency || project.currency,
      date,
      note: type === "payment_sent" ? "Marked sent from project details (demo)." : "Marked received from project details (demo).",
      isDemo: true,
      createdAt: now,
    };
    updateDemoWorkspaceState((current) => ({
      ...current,
      paymentEvents: [event, ...current.paymentEvents],
      projects: current.projects.map((p) => p.id !== projectId ? p : ({
        ...p,
        updatedAt: now,
        milestones: p.milestones.map((m) => {
          if (m.id !== milestoneId) return m;
          const next = { ...m };
          if (type === "payment_sent") { next.paymentSentDate = date; next.paymentStatus = "sent"; }
          if (type === "payment_received") { next.paymentReceivedDate = date; next.paymentStatus = "received"; }
          return next;
        }),
      })),
    }));
    setNotice(type === "payment_sent" ? "Demo payment marked as sent." : "Demo payment marked as received.");
    setTimeout(() => setNotice(null), 3000);
  };

  const shareWithClient = async (project: WorkspaceProject) => {
    setNotice(null);
    setLoadingPreviewId(project.id);
    try {
      const response = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          projectTitle: project.name,
          deliverableTitle: project.milestones[0]?.title || project.name,
          clientName: project.clientName || "Client",
          clientEmail: project.clientEmail && project.clientEmail.includes("@") ? project.clientEmail : "client@example.com",
          durationHours: 48,
          allowSourceInspectionRequest: false,
          version: "demo",
        }),
      });
      const data = await response.json().catch(() => ({})) as { session?: { id: string; expires_at?: string }; shareUrl?: string; error?: string };
      if (!response.ok || !data.session) {
        setPreviewRecords((prev) => [{ id: newId("localprev"), projectId: project.id, projectName: project.name, clientName: project.clientName, clientEmail: project.clientEmail, status: "local_only", createdAt: new Date().toISOString(), note: data.error || "A valid server-backed preview session could not be created for this local demo project." }, ...prev.filter((r) => r.projectId !== project.id)]);
      } else {
        const shareUrl = data.shareUrl || (typeof window !== "undefined" ? `${window.location.origin}/preview/${data.session.id}` : undefined);
        setPreviewRecords((prev) => [{ id: data.session!.id, projectId: project.id, projectName: project.name, clientName: project.clientName, clientEmail: project.clientEmail, shareUrl, status: "active", createdAt: new Date().toISOString(), expiresAt: data.session!.expires_at, note: "Server-backed preview session created. Share the full link (includes token) with the client. Token verification and ownership checks remain unchanged." }, ...prev.filter((r) => r.projectId !== project.id)]);
        setNotice("Preview session created. Copy the client link to share it.");
      }
    } catch {
      setPreviewRecords((prev) => [{ id: newId("localprev"), projectId: project.id, projectName: project.name, clientName: project.clientName, clientEmail: project.clientEmail, status: "local_only", createdAt: new Date().toISOString(), note: "Preview session could not be created. Local-only browser demo projects are not automatically eligible for authenticated server-backed preview sessions." }, ...prev.filter((r) => r.projectId !== project.id)]);
    } finally {
      setLoadingPreviewId(null);
      setTimeout(() => setNotice(null), 4500);
    }
  };

  const loadExampleProject = () => {
    const example = createExampleProject();
    updateDemoWorkspaceState((current) => ({ ...current, projects: [example, ...current.projects], selectedClientName: current.selectedClientName || example.clientName }));
    setSelectedDetailsId(example.id);
    setNotice("Loaded one example project (DEMO). It is clearly labeled and can be edited or deleted.");
    setTimeout(() => setNotice(null), 4000);
  };

  const copyLink = async (url?: string) => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setNotice("Client link copied."); setTimeout(() => setNotice(null), 2500); } catch { setNotice("Copy failed. Use the link shown in the preview card."); }
  };

  const detailsProject = selectedDetailsProject && (workspace.view !== "client" || projects.some((p) => p.id === selectedDetailsProject.id)) ? selectedDetailsProject : null;
  const detailsHistory = detailsProject ? workspace.paymentEvents.filter((e) => e.projectId === detailsProject.id).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1)) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-950">Projects</h1>
          <p className="mt-1 text-sm text-slate-600">Create custom projects, open project details, and manage milestone payment schedules in the shared demo workspace.</p>
        </div>
        {workspace.view !== "client" && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={loadExampleProject} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" title="Loads one clearly labeled demo project. Does not create real data.">
              <FlaskConical className="h-3.5 w-3.5" /> Load example project (DEMO)
            </button>
            <button type="button" onClick={openNew} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-800">
              <Plus className="h-3.5 w-3.5" /> Add project
            </button>
          </div>
        )}
      </div>

      <DemoModeBanner view={workspace.view} />
      {workspace.preservedSeedNotices?.length ? (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Preserved legacy sample data.</strong> {workspace.preservedSeedNotices.join(" ")} Existing user-created projects were not deleted.</div></div>
        </div>
      ) : null}
      {notice && <div role="status" className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900"><CheckCircle2 className="h-4 w-4 text-sky-700" /> {notice}</div>}

      {detailsProject && (() => {
        const totals = computeProjectPaymentTotals(detailsProject, workspace.paymentEvents, today);
        return (
        <section className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm" id={`project-details-${detailsProject.id}`}>
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-950">{detailsProject.name}</h2>
                <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">{detailsProject.status.replace("_", " ")}</span>
                <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Local demo project</span>
                {totals.hasAllocationMismatch && <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">Allocation mismatch</span>}
              </div>
              <p className="mt-1 text-sm text-slate-600">{detailsProject.clientName}{detailsProject.companyName ? ` · ${detailsProject.companyName}` : ""}{detailsProject.clientEmail ? ` · ${detailsProject.clientEmail}` : ""}</p>
              {detailsProject.description && <p className="mt-2 text-sm leading-6 text-slate-500">{detailsProject.description}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a href={`mailto:${encodeURIComponent(detailsProject.clientEmail || "")}?subject=${encodeURIComponent(`Update regarding ${detailsProject.name}`)}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Mail className="h-3.5 w-3.5" /> Message client</a>
              <Link href="/payments" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><ExternalLink className="h-3.5 w-3.5" /> View payments</Link>
              {workspace.view !== "client" && <button type="button" onClick={() => openEdit(detailsProject)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit project</button>}
              {workspace.view !== "client" && <button type="button" onClick={() => { setForm((c) => ({ ...c })); openEdit(detailsProject); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Add milestone</button>}
              {workspace.view !== "client" && <button type="button" onClick={() => void shareWithClient(detailsProject)} disabled={loadingPreviewId === detailsProject.id} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50"><Send className="h-3.5 w-3.5" /> {loadingPreviewId === detailsProject.id ? "Creating preview…" : "Share with client"}</button>}
              <button type="button" onClick={() => setSelectedDetailsId(null)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Close project details"><X className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><div className="text-xs text-slate-500">Agreed project value</div><div className="mt-1 font-semibold text-slate-900">{formatCurrency(totals.agreedProjectValue, totals.currency)}</div></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><div className="text-xs text-slate-500">Milestone allocations</div><div className="mt-1 font-semibold text-slate-900">{formatCurrency(totals.milestoneAllocationsTotal, totals.currency)}</div></div>
            <div className={`rounded-xl border p-3 text-sm ${totals.unallocatedAmount > 0.009 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}><div className="text-xs text-slate-500">Unallocated</div><div className="mt-1 font-semibold text-slate-900">{formatCurrency(totals.unallocatedAmount, totals.currency)}</div></div>
            <div className={`rounded-xl border p-3 text-sm ${totals.overAllocatedAmount > 0.009 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}><div className="text-xs text-slate-500">Over-allocated</div><div className="mt-1 font-semibold text-slate-900">{formatCurrency(totals.overAllocatedAmount, totals.currency)}</div></div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm"><div className="text-xs text-slate-500">Payments sent (demo)</div><div className="mt-1 font-semibold text-slate-900">{formatCurrency(totals.paymentsSentAmount, totals.currency)}</div></div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm"><div className="text-xs text-slate-500">Payments received (demo)</div><div className="mt-1 font-semibold text-slate-900">{formatCurrency(totals.paymentsReceivedAmount, totals.currency)}</div></div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm"><div className="text-xs text-slate-500">Outstanding (demo/planned)</div><div className="mt-1 font-semibold text-slate-900">{formatCurrency(totals.outstandingAmount, totals.currency)}</div></div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><div className="text-xs text-slate-500">Start / overall deadline</div><div className="mt-1 font-semibold text-slate-900">{detailsProject.startDate || "—"} → {detailsProject.overallDeadline || "—"}</div></div>
          </div>
          {(totals.hasAllocationMismatch || totals.hasCurrencyMismatch) && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div>
                <strong>Consistency warning.</strong>
                {totals.unallocatedAmount > 0.009 ? ` ${formatCurrency(totals.unallocatedAmount, totals.currency)} of the agreed project value is unallocated to milestones.` : ""}
                {totals.overAllocatedAmount > 0.009 ? ` Milestone allocations exceed agreed project value by ${formatCurrency(totals.overAllocatedAmount, totals.currency)}.` : ""}
                {totals.hasCurrencyMismatch ? " Some milestone currencies differ from the project currency." : ""}
                {" "}Recorded demo payment history was not changed. Use Edit project to make an explicit correction.
              </div></div>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">Payment figures above use demo/manual workspace records and planning state only. They do not represent verified PayPal captures.</p>

          {previewRecords.find((r) => r.projectId === detailsProject.id) && (() => {
            const preview = previewRecords.find((r) => r.projectId === detailsProject.id)!;
            return (
              <div className={`mt-4 rounded-xl border p-3 text-xs ${preview.status === "active" ? "border-sky-200 bg-sky-50 text-sky-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{preview.status === "active" ? "Client preview" : "Preview limitation"}</span>
                  {preview.status === "active" && preview.shareUrl && (
                    <>
                      <button type="button" onClick={() => void copyLink(preview.shareUrl)} className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 font-semibold text-sky-800"><Copy className="h-3.5 w-3.5" /> Copy client link</button>
                      <a href={preview.shareUrl} className="rounded-lg bg-sky-700 px-2.5 py-1.5 font-semibold text-white">View client preview</a>
                    </>
                  )}
                </div>
                <p className="mt-2 leading-5">{preview.note}{preview.status === "local_only" ? " Server-backed preview requires a valid authenticated preview session; this local browser project record alone is not a substitute for server-side token verification." : ""}</p>
              </div>
            );
          })()}

          <div className="mt-5">
            <h3 className="text-sm font-semibold text-slate-900">Milestone breakdown and payment schedule</h3>
            <div className="mt-3 space-y-3">
              {detailsProject.milestones.map((m) => {
                const status = milestonePaymentStatus({ view: workspace.view, project: detailsProject, milestone: m, events: workspace.paymentEvents, today });
                return (
                  <article key={m.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">{m.phase}: {m.title}</h4>
                        <p className="mt-1 text-xs text-slate-500">Delivery: {m.dueDate || "—"} · Acceptance: {m.acceptanceCriteria || "—"}</p>
                        {m.description && <p className="mt-1 text-xs text-slate-600">{m.description}</p>}
                        {m.deliverables && <p className="mt-1 text-xs text-slate-600"><strong>Deliverables:</strong> {m.deliverables}</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/deliverables?projectId=${encodeURIComponent(detailsProject.id)}&milestoneId=${encodeURIComponent(m.id)}`} className="rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-sky-800 hover:bg-sky-50">Check delivery</Link>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${paymentStatusTone(status)}`}>{paymentStatusLabel(status, workspace.view)}</span>
                        {workspace.view === "client" && status !== "sent" && status !== "received_demo" && <button type="button" onClick={() => recordMilestonePayment(detailsProject.id, m.id, "payment_sent")} className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-rose-700">Record payment sent (demo)</button>}
                        {workspace.view !== "client" && status !== "received_demo" && <button type="button" onClick={() => recordMilestonePayment(detailsProject.id, m.id, "payment_received")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700">Record payment received (demo)</button>}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-5">
                      <div className="rounded-lg bg-white p-2"><div className="text-slate-500">Agreed amount</div><div className="font-semibold text-slate-900">{formatCurrency(m.amount, m.currency || detailsProject.currency)}</div></div>
                      <div className="rounded-lg bg-white p-2"><div className="text-slate-500">Payment due date</div><div className="font-semibold text-slate-900">{milestonePaymentDueDate(m) || "—"}</div></div>
                      <div className="rounded-lg bg-white p-2"><div className="text-slate-500">Payment sent date</div><div className="font-semibold text-slate-900">{milestonePaymentSentDate(m, workspace.paymentEvents) || "—"}</div></div>
                      <div className="rounded-lg bg-white p-2"><div className="text-slate-500">Payment received date</div><div className="font-semibold text-slate-900">{milestonePaymentReceivedDate(m, workspace.paymentEvents) || "—"}</div></div>
                      <div className="rounded-lg bg-white p-2"><div className="text-slate-500">Delivery status</div><div className="font-semibold text-slate-900">{m.status.replace(/_/g, " ")}</div></div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-semibold text-slate-900">Payment history (demo records)</h3>
            {detailsHistory.length === 0 ? <p className="mt-2 text-sm text-slate-500">No demo payment history yet for this project.</p> : (
              <div className="mt-3 space-y-2">
                {detailsHistory.map((event) => {
                  const milestone = detailsProject.milestones.find((m) => m.id === event.milestoneId);
                  const sent = event.type === "payment_sent";
                  return (
                    <div key={event.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${sent ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{sent ? "Payment sent" : "Payment received"}</span>
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Demo record</span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-slate-900">{milestone ? `${milestone.phase}: ${milestone.title}` : "Project payment"}</p>
                        {event.note && <p className="mt-0.5 text-xs text-slate-500">{event.note}</p>}
                      </div>
                      <div className="text-xs text-slate-600 sm:text-right"><div className="font-semibold text-slate-900">{formatCurrency(event.amount, event.currency)}</div><div>{event.date}</div></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
        );
      })()}

      {showForm && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-semibold text-slate-900">{editingId ? "Edit project" : "Add custom project"}</h2>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">Close</button>
          </div>
          {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700">Project name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-slate-700">Client name<input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-slate-700">Company name<input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-slate-700">Client email<input value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-slate-700 md:col-span-2">Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-slate-700">Total amount<input type="number" min="0" step="0.01" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-slate-700">Currency<input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase().slice(0, 3) || "USD" })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-slate-700">Start date<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-slate-700">Overall deadline<input type="date" value={form.overallDeadline} onChange={(e) => setForm({ ...form, overallDeadline: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-slate-700 md:col-span-2">Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as WorkspaceProject["status"] })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"><option value="draft">Draft</option><option value="active">Active</option><option value="in_review">In review</option><option value="completed">Completed</option><option value="on_hold">On hold</option></select></label>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Milestones / phases</h3>
                <p className="text-xs text-slate-500">Each milestone needs deliverables, acceptance criteria, agreed amount, delivery date, and payment due date.</p>
              </div>
              <button type="button" onClick={() => setForm({ ...form, milestones: [...form.milestones, { ...emptyMilestone(form.currency, today), phase: `Phase ${form.milestones.length + 1}` }] })} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Add milestone</button>
            </div>
            <div className={`mt-3 rounded-lg p-3 text-xs ${Math.abs(totalDiff) < 0.01 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
              Milestone total: <strong>{formatCurrency(milestoneTotal, form.currency)}</strong> · Project total: <strong>{formatCurrency(Number(form.totalAmount) || 0, form.currency)}</strong>
              {Math.abs(totalDiff) >= 0.01 && <span> · {totalDiff > 0 ? `${formatCurrency(totalDiff, form.currency)} unallocated` : `${formatCurrency(Math.abs(totalDiff), form.currency)} over milestone total`}</span>}
            </div>
            <div className="mt-3 space-y-3">
              {form.milestones.map((m, i) => (
                <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">Milestone {i + 1}</span>
                    {form.milestones.length > 1 && <button type="button" onClick={() => setForm({ ...form, milestones: form.milestones.filter((_, idx) => idx !== i) })} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700"><Trash2 className="h-3.5 w-3.5" /> Remove</button>}
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <input aria-label="Milestone title" value={m.title} onChange={(e) => updateMilestone(i, { title: e.target.value })} placeholder="Milestone title" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <input aria-label="Phase label" value={m.phase} onChange={(e) => updateMilestone(i, { phase: e.target.value })} placeholder="Phase label" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <input aria-label="Milestone amount" type="number" min="0" step="0.01" value={m.amount} onChange={(e) => updateMilestone(i, { amount: Number(e.target.value) })} placeholder="Agreed amount" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <select aria-label="Delivery status" value={m.status} onChange={(e) => updateMilestone(i, { status: e.target.value as WorkspaceMilestone["status"] })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="delivered">Delivered</option><option value="approved">Approved</option><option value="needs_changes">Needs changes</option><option value="paid">Paid (manual record only)</option></select>
                    <label className="text-[11px] text-slate-500">Start date<input aria-label="Milestone start date" type="date" value={m.startDate} onChange={(e) => updateMilestone(i, { startDate: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900" /></label>
                    <label className="text-[11px] text-slate-500">Delivery/due date<input aria-label="Milestone due date" type="date" value={m.dueDate} onChange={(e) => updateMilestone(i, { dueDate: e.target.value, paymentDueDate: m.paymentDueDate || e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900" /></label>
                    <label className="text-[11px] text-slate-500">Payment due date<input aria-label="Payment due date" type="date" value={m.paymentDueDate || ""} onChange={(e) => updateMilestone(i, { paymentDueDate: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900" /></label>
                    <label className="text-[11px] text-slate-500">Payment status<select aria-label="Payment status" value={m.paymentStatus || "pending"} onChange={(e) => updateMilestone(i, { paymentStatus: e.target.value as WorkspaceMilestone["paymentStatus"] })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"><option value="pending">Pending</option><option value="sent">Sent (demo)</option><option value="received">Received (demo)</option><option value="overdue">Overdue</option></select></label>
                    <label className="text-[11px] text-slate-500">Payment sent date<input aria-label="Payment sent date" type="date" value={m.paymentSentDate || ""} onChange={(e) => updateMilestone(i, { paymentSentDate: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900" /></label>
                    <label className="text-[11px] text-slate-500">Payment received date<input aria-label="Payment received date" type="date" value={m.paymentReceivedDate || ""} onChange={(e) => updateMilestone(i, { paymentReceivedDate: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900" /></label>
                    <input aria-label="Deliverables" value={m.deliverables || ""} onChange={(e) => updateMilestone(i, { deliverables: e.target.value })} placeholder="Deliverables" className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2" />
                    <input aria-label="Milestone acceptance criteria" value={m.acceptanceCriteria} onChange={(e) => updateMilestone(i, { acceptanceCriteria: e.target.value })} placeholder="Acceptance criteria" className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2" />
                    <input aria-label="Milestone description" value={m.description} onChange={(e) => updateMilestone(i, { description: e.target.value })} placeholder="Description" className="rounded-lg border border-slate-200 px-3 py-2 text-sm md:col-span-2" />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">Manual payment fields are demo records only and never represent verified PayPal captures.</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="button" onClick={saveProject} className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800">Save project</button>
          </div>
        </section>
      )}

      <section className="space-y-4">
        {projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <h2 className="text-base font-semibold text-slate-900">{workspace.view === "client" ? "No projects in this client view" : "No projects yet"}</h2>
            <p className="mt-2 text-sm text-slate-500">
              {workspace.view === "client"
                ? "Select a different demo client in Settings, or switch to Merchant view to add a project for this client."
                : "Your workspace starts empty. Add your own project to populate Overview, Calendar, Contracts, and Payments. No sample client data is created automatically."}
            </p>
            {workspace.view !== "client" && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button type="button" onClick={openNew} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800"><Plus className="h-4 w-4" /> Add project</button>
                <button type="button" onClick={loadExampleProject} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FlaskConical className="h-4 w-4" /> Load example project (DEMO)</button>
              </div>
            )}
          </div>
        ) : projects.map((project) => {
          const mailto = `mailto:${encodeURIComponent(project.clientEmail || "")}?subject=${encodeURIComponent(`Update regarding ${project.name}`)}&body=${encodeURIComponent(`Hi ${project.clientName || "there"},\n\nI wanted to share an update regarding ${project.name}.\n\n`)}`;
          const preview = previewRecords.find((r) => r.projectId === project.id);
          const totals = computeProjectPaymentTotals(project, workspace.paymentEvents, today);
          const isOpen = selectedDetailsId === project.id;
          return (
            <article key={project.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${isOpen ? "border-sky-300 ring-1 ring-sky-100" : "border-slate-200"}`}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => openDetails(project)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetails(project); } }}
                className="flex w-full cursor-pointer flex-col gap-3 text-left lg:flex-row lg:items-start lg:justify-between"
                aria-expanded={isOpen}
                aria-controls={`project-details-${project.id}`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">{project.name}</h2>
                    <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">{project.status.replace("_", " ")}</span>
                    {project.isDemo && <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Demo/local</span>}
                    {totals.hasAllocationMismatch && <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-900">Total mismatch</span>}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{project.clientName}{project.companyName ? ` · ${project.companyName}` : ""}{project.clientEmail ? ` · ${project.clientEmail}` : ""}</p>
                  {project.description && <p className="mt-2 text-sm leading-6 text-slate-500">{project.description}</p>}
                </div>
                <div className="flex items-start gap-3 text-sm text-slate-700 lg:text-right">
                  <div>
                    <div className="font-semibold text-slate-900">{formatCurrency(project.totalAmount, project.currency)}</div>
                    <div className="mt-1 text-xs text-slate-500">Deadline {project.overallDeadline || "Not set"}</div>
                    <div className="mt-1 text-xs text-sky-700">{isOpen ? "Details open" : "Open details"}</div>
                  </div>
                  <ChevronRight className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {project.milestones.map((m) => {
                  const pay = milestonePaymentStatus({ view: workspace.view, project, milestone: m, events: workspace.paymentEvents, today });
                  return (
                    <div key={m.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
                      <div className="font-semibold text-slate-900">{m.phase}: {m.title}</div>
                      <div className="mt-1 text-slate-600">{formatCurrency(m.amount, m.currency)} · delivery {m.dueDate || "n/a"} · payment due {milestonePaymentDueDate(m) || "n/a"}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="rounded bg-white px-1.5 py-0.5 text-slate-600">{m.status.replace("_", " ")}</span>
                        <span className={`rounded border px-1.5 py-0.5 ${paymentStatusTone(pay)}`}>{paymentStatusLabel(pay, workspace.view)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <a href={mailto} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Mail className="h-3.5 w-3.5" /> Update regarding {project.name}</a>
                <button type="button" onClick={() => openDetails(project)} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100">Open details</button>
                {workspace.view !== "client" && (
                  <>
                    <button type="button" onClick={() => openEdit(project)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                    <button type="button" onClick={() => deleteProject(project.id)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-100">Delete</button>
                    <button type="button" onClick={() => void shareWithClient(project)} disabled={loadingPreviewId === project.id} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-50"><Send className="h-3.5 w-3.5" /> {loadingPreviewId === project.id ? "Creating preview…" : "Share with client"}</button>
                  </>
                )}
              </div>
              {preview && (
                <div className={`mt-4 rounded-xl border p-3 text-xs ${preview.status === "active" ? "border-sky-200 bg-sky-50 text-sky-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{preview.status === "active" ? "Client preview" : "Preview limitation"}</span>
                    {preview.status === "active" && preview.shareUrl && (
                      <>
                        <button type="button" onClick={() => void copyLink(preview.shareUrl)} className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 font-semibold text-sky-800"><Copy className="h-3.5 w-3.5" /> Copy client link</button>
                        <a href={preview.shareUrl} className="rounded-lg bg-sky-700 px-2.5 py-1.5 font-semibold text-white">View client preview</a>
                      </>
                    )}
                  </div>
                  <p className="mt-2 leading-5">{preview.note}{preview.status === "local_only" ? " Local browser demo projects are not automatically server-backed preview sessions; valid preview access still requires a server session and the full share link token." : ""}</p>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
