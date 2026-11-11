"use client";

import {
  defaultContractItems,
  DEMO_WORKSPACE_EVENT,
  DEMO_WORKSPACE_KEY,
  DEMO_WORKSPACE_VERSION,
  type DemoWorkspaceState,
  type DemoWorkspaceView,
  type WorkspaceMilestone,
  type WorkspaceProject,
  newId,
} from "./workspace-types.ts";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** Known legacy app-generated seed sample IDs (safe to remove only when clearly unmodified). */
const LEGACY_SEED_PROJECT_IDS = new Set(["demo_proj_1"]);
const LEGACY_SEED_SIGNATURES = [
  { name: "Website redesign", clientName: "Sample Client", companyName: "Sample Company" },
] as const;

/** Optional guided example for hackathon demonstrations. Never auto-loaded into a new workspace. */
export function createExampleProject(): WorkspaceProject {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const deadline = "2026-11-30";
  const contractText = `FREELANCE WEBSITE PROJECT AGREEMENT — DEMONSTRATION ONLY
Client: Northstar Studio (DEMO)
Freelancer: Example Freelancer (DEMO)
Project: Three-page portfolio website
Scope: Build Home, Services, and Contact pages with shared navigation and a responsive layout.
Deliverables: Home page, Services page, Contact page, responsive CSS navigation, accessible contact form with name/email/message fields, client-side required-field validation, and an in-page success confirmation.
Total fee: USD 1,200.
Payment schedule: USD 400 at project start, USD 400 after the three pages and responsive layout are ready for review, and USD 400 after final handover.
Milestone 1 due: 2026-11-13. Milestone 2 due: 2026-11-20. Final handover due: 2026-11-30.
Acceptance: All three pages are present and linked; the layout has a mobile breakpoint; the contact form includes name, email, and message fields and displays an in-page confirmation after valid submission; README contains local run instructions.
Two revision rounds are included. Additional scope requires written approval. Client reviews each milestone within five business days. Intellectual-property transfer occurs after full payment. This example is fictional and is not a legal agreement.`;
  return {
    id: newId("demo_ex"),
    name: "Portfolio Website Delivery (DEMO)",
    clientName: "Northstar Studio (DEMO)",
    companyName: "Northstar Studio",
    clientEmail: "demo-client@example.com",
    description: "Guided example for demonstrating contract analysis and AI delivery evidence review. Fictional project and client; no real payment is represented.",
    totalAmount: 1200,
    currency: "USD",
    startDate: today,
    overallDeadline: deadline,
    status: "active",
    contractText,
    contractRequirements: [
      "Home, Services, and Contact pages are included and connected by navigation.",
      "The website layout includes a responsive mobile breakpoint.",
      "The contact form includes name, email, and message fields.",
      "The contact form validates required fields and displays an in-page success confirmation.",
      "README includes local setup and run instructions.",
    ],
    isDemo: true,
    createdAt: now,
    updatedAt: now,
    milestones: [
      { id: newId("demo_ms"), title: "Pages and navigation", phase: "Phase 1", description: "Create the three main pages and shared navigation.", deliverables: "Home, Services, and Contact pages with linked navigation.", amount: 400, currency: "USD", startDate: today, dueDate: "2026-11-13", paymentDueDate: "2026-11-13", acceptanceCriteria: "All three HTML pages exist and each page links to the other two.", status: "pending", paymentStatus: "pending" },
      { id: newId("demo_ms"), title: "Responsive layout and contact form", phase: "Phase 2", description: "Add the mobile layout and accessible contact form interaction.", deliverables: "Responsive CSS breakpoint; name, email and message fields; required-field validation; in-page success confirmation.", amount: 400, currency: "USD", startDate: "2026-11-14", dueDate: "2026-11-20", paymentDueDate: "2026-11-20", acceptanceCriteria: "Styles include a mobile breakpoint. Form has the three required fields and JavaScript displays a confirmation after valid submission.", status: "pending", paymentStatus: "pending" },
      { id: newId("demo_ms"), title: "Documentation and handover", phase: "Phase 3", description: "Prepare setup notes and final delivery handover.", deliverables: "README with local setup and run instructions, final handover notes.", amount: 400, currency: "USD", startDate: "2026-11-21", dueDate: deadline, paymentDueDate: deadline, acceptanceCriteria: "README explains how to open/run the example and notes that no backend form service is connected.", status: "pending", paymentStatus: "pending" },
    ],
    contractItems: defaultContractItems(),
  };
}

function isKnownLegacySeedProject(project: WorkspaceProject): boolean {
  if (LEGACY_SEED_PROJECT_IDS.has(project.id)) return true;
  return LEGACY_SEED_SIGNATURES.some((s) => project.name === s.name && project.clientName === s.clientName && project.companyName === s.companyName);
}

/** Returns projects to keep and notices for preserved ambiguous legacy records. */
export function migrateLegacySeedProjects(projects: WorkspaceProject[]): { projects: WorkspaceProject[]; preservedSeedNotices: string[] } {
  const kept: WorkspaceProject[] = [];
  const preservedSeedNotices: string[] = [];
  for (const project of projects) {
    if (!isKnownLegacySeedProject(project)) {
      kept.push(project);
      continue;
    }
    // Conservative: remove only when the record clearly matches the old unmodified auto-seeded sample.
    // Any user edit/ambiguity is preserved and reported.
    const looksUnmodifiedLegacy =
      project.isDemo === true &&
      project.id === "demo_proj_1" &&
      project.name === "Website redesign" &&
      project.clientName === "Sample Client" &&
      (project.companyName || "") === "Sample Company" &&
      (project.clientEmail || "") === "client@example.com";
    if (looksUnmodifiedLegacy) {
      // Remove auto-seeded sample; user can explicitly load an example project if desired.
      continue;
    }
    preservedSeedNotices.push(`Preserved legacy sample-like record "${project.name}" (${project.clientName}) because it could not be safely classified as an unmodified default.`);
    kept.push(project);
  }
  return { projects: kept, preservedSeedNotices };
}

export function createDefaultWorkspaceState(): DemoWorkspaceState {
  return {
    version: DEMO_WORKSPACE_VERSION,
    view: "merchant",
    selectedClientName: "",
    projects: [],
    paymentEvents: [],
    customDates: [],
    deliveryReviews: [],
    preservedSeedNotices: [],
  };
}

function normalizeView(value: unknown): DemoWorkspaceView {
  return value === "client" ? "client" : "merchant";
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeMilestone(raw: unknown, projectCurrency: string, index: number): WorkspaceMilestone | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Partial<WorkspaceMilestone>;
  const id = str(m.id).trim() || `ms_norm_${index + 1}`;
  return {
    id,
    title: str(m.title).trim() || `Milestone ${index + 1}`,
    phase: str(m.phase).trim() || `Phase ${index + 1}`,
    description: str(m.description),
    deliverables: str(m.deliverables),
    amount: num(m.amount, 0),
    currency: str(m.currency).trim() || projectCurrency || "USD",
    startDate: str(m.startDate),
    dueDate: str(m.dueDate),
    acceptanceCriteria: str(m.acceptanceCriteria),
    status: (["pending","in_progress","delivered","approved","paid","needs_changes"] as const).includes(m.status as never) ? (m.status as WorkspaceMilestone["status"]) : "pending",
    paymentDueDate: str(m.paymentDueDate) || undefined,
    paymentSentDate: str(m.paymentSentDate) || undefined,
    paymentReceivedDate: str(m.paymentReceivedDate) || undefined,
    paymentStatus: (["pending","sent","received","overdue"] as const).includes(m.paymentStatus as never) ? (m.paymentStatus as WorkspaceMilestone["paymentStatus"]) : undefined,
  };
}

function normalizeProject(raw: unknown, index: number): WorkspaceProject | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<WorkspaceProject>;
  const id = str(p.id).trim();
  if (!id) return null;
  const currency = (str(p.currency).trim() || "USD").toUpperCase().slice(0, 3);
  const rawMilestones = Array.isArray(p.milestones) ? p.milestones : [];
  const milestones = rawMilestones.map((m, i) => normalizeMilestone(m, currency, i)).filter((m): m is WorkspaceMilestone => Boolean(m));
  const contractItems = Array.isArray(p.contractItems) && p.contractItems.length ? p.contractItems : defaultContractItems();
  return {
    id,
    name: str(p.name).trim() || `Project ${index + 1}`,
    clientName: str(p.clientName).trim(),
    companyName: str(p.companyName).trim(),
    clientEmail: str(p.clientEmail).trim(),
    description: str(p.description),
    totalAmount: num(p.totalAmount, milestones.reduce((s, m) => s + m.amount, 0)),
    currency,
    startDate: str(p.startDate),
    overallDeadline: str(p.overallDeadline),
    status: (["draft","active","in_review","completed","on_hold"] as const).includes(p.status as never) ? (p.status as WorkspaceProject["status"]) : "active",
    milestones,
    contractItems,
    contractText: str(p.contractText).slice(0, 60_000) || undefined,
    contractRequirements: Array.isArray(p.contractRequirements)
      ? p.contractRequirements.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 500)).slice(0, 30)
      : undefined,
    contractAnalysisUpdatedAt: str(p.contractAnalysisUpdatedAt) || undefined,
    isDemo: Boolean(p.isDemo ?? true),
    createdAt: str(p.createdAt) || new Date().toISOString(),
    updatedAt: str(p.updatedAt) || new Date().toISOString(),
  };
}

function dedupeProjects(projects: WorkspaceProject[]): WorkspaceProject[] {
  const seen = new Set<string>();
  const out: WorkspaceProject[] = [];
  for (const p of projects) {
    if (!p?.id || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

function normalizeState(raw: unknown): DemoWorkspaceState {
  const base = createDefaultWorkspaceState();
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Partial<DemoWorkspaceState> & { version?: unknown };
  const normalizedProjects = Array.isArray(data.projects)
    ? dedupeProjects(data.projects.map((p, i) => normalizeProject(p, i)).filter((p): p is WorkspaceProject => Boolean(p)))
    : [];
  // Safe seed-data transition: remove only clearly unmodified legacy app seed samples.
  // Existing user-created/local projects are always preserved. Ambiguous legacy records are preserved and reported.
  const migrated = migrateLegacySeedProjects(normalizedProjects);
  const projects = migrated.projects;
  const selectedClientName = typeof data.selectedClientName === "string" && data.selectedClientName.trim()
    ? data.selectedClientName
    : projects[0]?.clientName || "";
  return {
    version: DEMO_WORKSPACE_VERSION,
    view: normalizeView(data.view),
    selectedClientName,
    projects,
    paymentEvents: Array.isArray(data.paymentEvents) ? data.paymentEvents.filter((e): e is DemoWorkspaceState["paymentEvents"][number] => Boolean(e && typeof e === "object" && "id" in (e as object))) : [],
    customDates: Array.isArray(data.customDates) ? data.customDates.filter((d): d is DemoWorkspaceState["customDates"][number] => Boolean(d && typeof d === "object" && "id" in (d as object))) : [],
    deliveryReviews: Array.isArray(data.deliveryReviews) ? data.deliveryReviews.filter((r): r is DemoWorkspaceState["deliveryReviews"][number] => Boolean(r && typeof r === "object" && "id" in (r as object) && "projectId" in (r as object) && "milestoneId" in (r as object))) : [],
    preservedSeedNotices: [...(Array.isArray(data.preservedSeedNotices) ? data.preservedSeedNotices.filter((n): n is string => typeof n === "string") : []), ...migrated.preservedSeedNotices].filter(Boolean),
  };
}

export function readDemoWorkspaceState(): DemoWorkspaceState {
  if (!isBrowser()) return createDefaultWorkspaceState();
  try {
    const raw = window.localStorage.getItem(DEMO_WORKSPACE_KEY);
    if (!raw) return createDefaultWorkspaceState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return createDefaultWorkspaceState();
  }
}

export function writeDemoWorkspaceState(state: DemoWorkspaceState): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(DEMO_WORKSPACE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(DEMO_WORKSPACE_EVENT));
}

export function updateDemoWorkspaceState(
  updater: (current: DemoWorkspaceState) => DemoWorkspaceState,
): DemoWorkspaceState {
  const next = updater(readDemoWorkspaceState());
  writeDemoWorkspaceState(next);
  return next;
}

export function setDemoWorkspaceView(view: DemoWorkspaceView): DemoWorkspaceState {
  return updateDemoWorkspaceState((current) => ({ ...current, view }));
}

export function setSelectedClientName(selectedClientName: string): DemoWorkspaceState {
  return updateDemoWorkspaceState((current) => ({ ...current, selectedClientName }));
}

export function visibleProjects(state: DemoWorkspaceState): WorkspaceProject[] {
  if (state.view !== "client") return state.projects;
  const client = state.selectedClientName.trim().toLowerCase();
  if (!client) return [];
  return state.projects.filter((project) => project.clientName.trim().toLowerCase() === client);
}

export function availableClientNames(state: DemoWorkspaceState): string[] {
  return [...new Set(state.projects.map((p) => p.clientName).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
