import type {
  DemoWorkspaceState,
  DemoWorkspaceView,
  WorkspaceMilestone,
  WorkspacePaymentEvent,
  WorkspaceProject,
} from "./workspace-types.ts";
import { visibleProjects } from "./workspace-store.ts";

export type CalendarEventKind =
  | "milestone_due"
  | "delivery_milestone"
  | "payment_due"
  | "payment_sent"
  | "payment_received"
  | "payment_overdue"
  | "review"
  | "custom";

export interface WorkspaceCalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  projectId?: string;
  projectName?: string;
  milestoneId?: string;
  kind: CalendarEventKind;
  amount?: number;
  currency?: string;
  note?: string;
  isDemo?: boolean;
}

// Deterministic fallback for prerender/hydration; UI components pass the real client date.
export const DEFAULT_TODAY_YMD = "2026-11-09";

function compareYmd(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function hasVerifiedReceivedEvent(events: WorkspacePaymentEvent[], projectId: string, milestoneId: string): boolean {
  // Manual demo events are never verified PayPal captures. This helper intentionally treats
  // local demo events as demo records only; it never infers PayPal verification.
  void events; void projectId; void milestoneId;
  return false;
}

export function milestonePaymentDueDate(milestone: WorkspaceMilestone): string {
  return milestone.paymentDueDate || milestone.dueDate || "";
}

export function milestonePaymentSentDate(milestone: WorkspaceMilestone, events: WorkspacePaymentEvent[]): string {
  if (milestone.paymentSentDate) return milestone.paymentSentDate;
  return events.filter((e) => e.milestoneId === milestone.id && e.type === "payment_sent").sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.date || "";
}

export function milestonePaymentReceivedDate(milestone: WorkspaceMilestone, events: WorkspacePaymentEvent[]): string {
  if (milestone.paymentReceivedDate) return milestone.paymentReceivedDate;
  return events.filter((e) => e.milestoneId === milestone.id && e.type === "payment_received").sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.date || "";
}

export function milestonePaymentStatus(params: {
  view: DemoWorkspaceView;
  project: WorkspaceProject;
  milestone: WorkspaceMilestone;
  events: WorkspacePaymentEvent[];
  today?: string;
}): "none" | "upcoming" | "overdue" | "sent" | "received_demo" | "paid" {
  const { view, milestone, events, today = DEFAULT_TODAY_YMD } = params;
  if (milestone.amount <= 0) return "none";
  const dueDate = milestonePaymentDueDate(milestone);
  if (!dueDate && !milestone.paymentSentDate && !milestone.paymentReceivedDate && milestone.paymentStatus === undefined) return "none";
  const sentDate = milestonePaymentSentDate(milestone, events);
  const receivedDate = milestonePaymentReceivedDate(milestone, events);
  if (milestone.status === "paid" && hasVerifiedReceivedEvent(events, params.project.id, milestone.id)) return "paid";
  if (receivedDate || milestone.paymentStatus === "received") return view === "client" ? "sent" : "received_demo";
  if (sentDate || milestone.paymentStatus === "sent") return "sent";
  if (!dueDate) return "upcoming";
  if (milestone.paymentStatus === "overdue" || compareYmd(dueDate, today) < 0) return "overdue";
  return "upcoming";
}

export function buildWorkspaceCalendarEvents(state: DemoWorkspaceState, today = DEFAULT_TODAY_YMD): WorkspaceCalendarEvent[] {
  const projects = visibleProjects(state);
  const events: WorkspaceCalendarEvent[] = [];
  for (const project of projects) {
    for (const milestone of project.milestones) {
      if (milestone.dueDate) {
        const isDelivery = milestone.status === "delivered" || milestone.status === "in_progress";
        events.push({
          id: `ms-${milestone.id}`,
          date: milestone.dueDate,
          title: `${milestone.phase || milestone.title} due`,
          projectId: project.id,
          projectName: project.name,
          milestoneId: milestone.id,
          kind: isDelivery ? "delivery_milestone" : "milestone_due",
          amount: milestone.amount,
          currency: milestone.currency,
          note: milestone.title,
        });
      }
      const payDue = milestonePaymentDueDate(milestone);
      const payStatus = milestonePaymentStatus({ view: state.view, project, milestone, events: state.paymentEvents, today });
      if (payDue && payStatus === "overdue") {
        events.push({
          id: `pay-overdue-${milestone.id}`,
          date: payDue,
          title: state.view === "client" ? "Payment overdue (demo)" : "Payment overdue",
          projectId: project.id,
          projectName: project.name,
          milestoneId: milestone.id,
          kind: "payment_overdue",
          amount: milestone.amount,
          currency: milestone.currency,
          isDemo: true,
        });
      } else if (payDue && payStatus === "upcoming") {
        events.push({
          id: `pay-upcoming-${milestone.id}`,
          date: payDue,
          title: state.view === "client" ? "Upcoming payment" : "Expected payment",
          projectId: project.id,
          projectName: project.name,
          milestoneId: milestone.id,
          kind: "payment_due",
          amount: milestone.amount,
          currency: milestone.currency,
        });
      }
    }
    if (project.overallDeadline) {
      events.push({
        id: `proj-deadline-${project.id}`,
        date: project.overallDeadline,
        title: "Project deadline",
        projectId: project.id,
        projectName: project.name,
        kind: "review",
      });
    }
  }
  for (const payment of state.paymentEvents) {
    const project = projects.find((p) => p.id === payment.projectId);
    if (!project) continue;
    const milestone = project.milestones.find((m) => m.id === payment.milestoneId);
    events.push({
      id: `payment-${payment.id}`,
      date: payment.date,
      title: payment.type === "payment_sent" ? "Payment sent (demo record)" : "Payment received (demo record)",
      projectId: payment.projectId,
      projectName: project.name,
      milestoneId: payment.milestoneId,
      kind: payment.type,
      amount: payment.amount,
      currency: payment.currency,
      note: payment.note || milestone?.title,
      isDemo: true,
    });
  }
  for (const custom of state.customDates) {
    if (state.view === "client" && custom.projectId && !projects.some((p) => p.id === custom.projectId)) continue;
    const project = custom.projectId ? projects.find((p) => p.id === custom.projectId) : undefined;
    events.push({
      id: `custom-${custom.id}`,
      date: custom.date,
      title: custom.title,
      projectId: custom.projectId,
      projectName: project?.name,
      kind: "custom",
      note: custom.note,
      isDemo: true,
    });
  }
  return events.sort((a, b) => compareYmd(a.date, b.date) || a.title.localeCompare(b.title));
}

export interface WorkspaceSummary {
  activeProjects: number;
  upcomingPaymentsCount: number;
  upcomingPaymentsAmount: number;
  overduePaymentsCount: number;
  overduePaymentsAmount: number;
  paymentsReceivedCount: number;
  paymentsReceivedAmount: number;
  currency: string;
}

export function computeWorkspaceSummary(state: DemoWorkspaceState, today = DEFAULT_TODAY_YMD): WorkspaceSummary {
  const projects = visibleProjects(state);
  const currency = projects[0]?.currency || "USD";
  let activeProjects = 0;
  let upcomingPaymentsCount = 0;
  let upcomingPaymentsAmount = 0;
  let overduePaymentsCount = 0;
  let overduePaymentsAmount = 0;
  let paymentsReceivedCount = 0;
  let paymentsReceivedAmount = 0;
  for (const project of projects) {
    if (project.status === "active" || project.status === "in_review") activeProjects += 1;
    for (const milestone of project.milestones) {
      const status = milestonePaymentStatus({ view: state.view, project, milestone, events: state.paymentEvents, today });
      if (status === "upcoming") { upcomingPaymentsCount += 1; upcomingPaymentsAmount += milestone.amount; }
      if (status === "overdue") { overduePaymentsCount += 1; overduePaymentsAmount += milestone.amount; }
      if (status === "received_demo" && state.view !== "client") { paymentsReceivedCount += 1; paymentsReceivedAmount += milestone.amount; }
      if (status === "sent" && state.view === "client") { paymentsReceivedCount += 1; paymentsReceivedAmount += milestone.amount; }
    }
  }
  return {
    activeProjects,
    upcomingPaymentsCount,
    upcomingPaymentsAmount,
    overduePaymentsCount,
    overduePaymentsAmount,
    paymentsReceivedCount,
    paymentsReceivedAmount,
    currency,
  };
}

export interface ProjectPaymentTotals {
  currency: string;
  agreedProjectValue: number;
  milestoneAllocationsTotal: number;
  unallocatedAmount: number;
  overAllocatedAmount: number;
  hasAllocationMismatch: boolean;
  hasCurrencyMismatch: boolean;
  paymentsSentAmount: number; // demo records only
  paymentsReceivedAmount: number; // demo records only
  outstandingAmount: number; // based on agreed milestones not marked received in demo records; never PayPal-verified
  demoPaymentHistory: WorkspacePaymentEvent[];
}

export function computeProjectPaymentTotals(
  project: WorkspaceProject,
  events: WorkspacePaymentEvent[],
  today = DEFAULT_TODAY_YMD,
): ProjectPaymentTotals {
  const currency = (project.currency || "USD").toUpperCase();
  const agreedProjectValue = Number(project.totalAmount) || 0;
  const milestoneAllocationsTotal = project.milestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
  const diff = agreedProjectValue - milestoneAllocationsTotal;
  const unallocatedAmount = diff > 0.009 ? diff : 0;
  const overAllocatedAmount = diff < -0.009 ? Math.abs(diff) : 0;
  const hasCurrencyMismatch = project.milestones.some((m) => (m.currency || currency).toUpperCase() !== currency);
  const demoPaymentHistory = events
    .filter((e) => e.projectId === project.id)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1));
  const paymentsSentAmount = demoPaymentHistory.filter((e) => e.type === "payment_sent").reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const paymentsReceivedAmount = demoPaymentHistory.filter((e) => e.type === "payment_received").reduce((s, e) => s + (Number(e.amount) || 0), 0);
  let outstandingAmount = 0;
  for (const milestone of project.milestones) {
    const status = milestonePaymentStatus({ view: "merchant", project, milestone, events, today });
    // Outstanding is planning/demo-record state only. Never infer verified PayPal capture.
    if (status !== "received_demo" && status !== "paid" && (Number(milestone.amount) || 0) > 0) {
      outstandingAmount += Number(milestone.amount) || 0;
    }
  }
  return {
    currency,
    agreedProjectValue,
    milestoneAllocationsTotal,
    unallocatedAmount,
    overAllocatedAmount,
    hasAllocationMismatch: unallocatedAmount > 0.009 || overAllocatedAmount > 0.009,
    hasCurrencyMismatch,
    paymentsSentAmount,
    paymentsReceivedAmount,
    outstandingAmount,
    demoPaymentHistory,
  };
}

export function eventColor(kind: CalendarEventKind, view: DemoWorkspaceView): string {
  if (kind === "payment_overdue") return "border-rose-200 bg-rose-50 text-rose-800";
  if (kind === "payment_sent") return "border-rose-200 bg-rose-50 text-rose-800";
  if (kind === "payment_received") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (kind === "payment_due") return "border-amber-200 bg-amber-50 text-amber-900";
  if (kind === "delivery_milestone" || kind === "milestone_due") return "border-sky-200 bg-sky-50 text-sky-800";
  if (kind === "review") return "border-violet-200 bg-violet-50 text-violet-800";
  return view === "client" ? "border-slate-200 bg-slate-50 text-slate-700" : "border-slate-200 bg-slate-50 text-slate-700";
}
