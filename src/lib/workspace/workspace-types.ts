export type DemoWorkspaceView = "merchant" | "client";

export type WorkspaceProjectStatus = "draft" | "active" | "in_review" | "completed" | "on_hold";
export type WorkspaceMilestoneStatus = "pending" | "in_progress" | "delivered" | "approved" | "paid" | "needs_changes";
export type WorkspacePaymentStatus = "pending" | "sent" | "received" | "overdue";
export type WorkspaceContractStatus = "provided" | "missing" | "needs_clarification";
export type WorkspaceContractReview = "not_reviewed" | "reviewed" | "needs_clarification";

export interface WorkspaceMilestone {
  id: string;
  title: string;
  phase: string;
  description: string;
  deliverables?: string;
  amount: number;
  currency: string;
  startDate: string;
  dueDate: string;
  acceptanceCriteria: string;
  status: WorkspaceMilestoneStatus;
  paymentDueDate?: string;
  paymentSentDate?: string;
  paymentReceivedDate?: string;
  paymentStatus?: WorkspacePaymentStatus;
}

export interface WorkspaceContractItem {
  id: string;
  label: string;
  status: WorkspaceContractStatus;
  review: WorkspaceContractReview;
  note: string;
}

export interface WorkspaceProject {
  id: string;
  name: string;
  clientName: string;
  companyName: string;
  clientEmail: string;
  description: string;
  totalAmount: number;
  currency: string;
  startDate: string;
  overallDeadline: string;
  status: WorkspaceProjectStatus;
  milestones: WorkspaceMilestone[];
  contractItems: WorkspaceContractItem[];
  /** Contract text and extracted requirements saved in this browser's demo workspace. */
  contractText?: string;
  contractRequirements?: string[];
  contractAnalysisUpdatedAt?: string;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DemoPaymentEventType = "payment_sent" | "payment_received";

export interface WorkspacePaymentEvent {
  id: string;
  projectId: string;
  milestoneId: string;
  type: DemoPaymentEventType;
  amount: number;
  currency: string;
  date: string;
  note: string;
  isDemo: true;
  createdAt: string;
}

export interface WorkspaceCustomDate {
  id: string;
  projectId?: string;
  title: string;
  date: string;
  kind: "reminder" | "milestone" | "review";
  note: string;
  isDemo: true;
}

export type WorkspaceDeliveryFindingStatus = "evidence_found" | "not_found_in_uploaded_files" | "needs_human_review";
export interface WorkspaceDeliveryFinding {
  requirement: string;
  status: WorkspaceDeliveryFindingStatus;
  explanation: string;
  evidence: Array<{ filePath: string; quote: string }>;
  suggestedNextStep: string;
}

export interface WorkspaceDeliveryReview {
  id: string;
  projectId: string;
  milestoneId: string;
  projectName: string;
  milestoneName: string;
  fileName: string;
  fileSizeBytes: number;
  sha256: string;
  analysisMode: "ai_assisted" | "deterministic_fallback";
  summary: string;
  findings: WorkspaceDeliveryFinding[];
  inspectedFiles: Array<{ path: string; sizeBytes: number }>;
  skippedFileCount: number;
  limitations: string[];
  disclaimer: string;
  reviewedAt: string;
  isDemo: true;
}

export interface DemoWorkspaceState {
  version: number;
  view: DemoWorkspaceView;
  selectedClientName: string;
  projects: WorkspaceProject[];
  paymentEvents: WorkspacePaymentEvent[];
  customDates: WorkspaceCustomDate[];
  deliveryReviews: WorkspaceDeliveryReview[];
  /** Records classified as legacy app seed samples that were preserved (not auto-removed) because they could not be safely identified as unmodified defaults. */
  preservedSeedNotices?: string[];
}

export const DEMO_WORKSPACE_VERSION = 2;
export const DEMO_WORKSPACE_KEY = "paymind.demo-workspace.v1";
export const DEMO_WORKSPACE_EVENT = "paymind:demo-workspace-changed";

export const DEFAULT_CONTRACT_ITEMS = [
  { id: "scope", label: "Project scope / deliverables described" },
  { id: "deadlines", label: "Deadlines or delivery dates provided" },
  { id: "payment", label: "Payment amount and schedule provided" },
  { id: "acceptance", label: "Acceptance criteria / review process provided" },
  { id: "revisions", label: "Revision expectations provided" },
  { id: "ownership", label: "Ownership / handover terms provided" },
  { id: "cancellation", label: "Cancellation or change terms provided" },
] as const;

let workspaceIdCounter = 0;
export function newId(prefix: string): string {
  workspaceIdCounter += 1;
  const suffix = typeof globalThis !== "undefined" && globalThis.performance
    ? Math.floor(globalThis.performance.now() * 1000).toString(36)
    : "0";
  return `${prefix}_${workspaceIdCounter.toString(36)}_${suffix}`;
}



export function defaultContractItems(): WorkspaceContractItem[] {
  return DEFAULT_CONTRACT_ITEMS.map((item) => ({
    ...item,
    status: "missing" as WorkspaceContractStatus,
    review: "not_reviewed" as WorkspaceContractReview,
    note: "",
  }));
}
