export type UserRole = "freelancer" | "client" | "admin";

export type ProjectStatus =
  | "draft"
  | "contract_review"
  | "active"
  | "in_review"
  | "completed"
  | "disputed"
  | "cancelled";

export type MilestoneStatus =
  | "pending"
  | "in_progress"
  | "under_client_review"
  | "approved"
  | "paid"
  | "disputed";

export type PayPalPaymentStatus =
  | "NOT_CREATED"
  | "CREATED"
  | "SAVED"
  | "APPROVED"
  | "VOIDED"
  | "COMPLETED"
  | "PAYER_ACTION_REQUIRED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  role: UserRole;
  country: string;
  business_name?: string;
  gstin?: string;
  has_lut: boolean; // Letter of Undertaking for zero-rated GST export
  created_at: string;
}

export interface Project {
  id: string;
  freelancer_id: string;
  client_id?: string;
  client_name: string;
  title: string;
  description: string;
  currency: string;
  total_amount: number;
  status: ProjectStatus;
  contract_raw_text?: string;
  protection_level: "high" | "balanced" | "risky" | "unreviewed";
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  description: string;
  amount: number;
  currency: string;
  order_index: number;
  status: MilestoneStatus;
  due_date?: string;
  acceptance_criteria: string[];
  paypal_order_id?: string;
  paypal_capture_id?: string;
  paypal_status?: PayPalPaymentStatus;
  created_at: string;
}

export interface Invoice {
  id: string;
  project_id: string;
  milestone_id?: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled" | "refunded";
  paypal_invoice_id?: string;
  due_date: string;
  paid_at?: string;
  created_at: string;
}

export interface PayPalWebhookLog {
  id: string;
  event_id: string;
  event_type: string;
  resource_type: string;
  summary: string;
  payload: Record<string, unknown>;
  verified: boolean;
  processed: boolean;
  received_at: string;
}

export interface ContractExtractionResult {
  scope_deliverables: string[];
  total_amount: number;
  currency: string;
  deadlines: string[];
  milestone_breakdown: Array<{
    title: string;
    amount: number;
    acceptance_terms: string;
  }>;
  acceptance_criteria: string[];
  revision_limits: string;
  ip_ownership_terms: string;
  missing_clauses: string[];
  unbalanced_risks: string[];
  project_readiness_score: number; // 0-100
  suggested_safeguards: string[];
}

export interface VerificationCheckItem {
  requirement_id: string;
  requirement_title: string;
  test_type: "automated" | "manual" | "static_code" | "file_integrity";
  status: "PASSED" | "FAILED" | "NOT_TESTED" | "MANUAL_REVIEW_REQUIRED";
  evidence_notes: string;
}

export interface DeliveryPassport {
  id: string;
  project_id: string;
  milestone_id: string;
  product_name: string;
  version: string;
  file_name: string;
  file_size_bytes: number;
  sha256_hash: string;
  checks: VerificationCheckItem[];
  all_passed: boolean;
  client_review_status: "pending_review" | "changes_requested" | "accepted";
  handover_completed: boolean;
  handover_timestamp?: string;
  created_at: string;
}

export interface PreviewAuditLog {
  timestamp: string;
  action: string;
  actor: "seller" | "client" | "system";
  actor_name: string;
  details?: string;
}

export interface PreviewSession {
  id: string;
  project_id: string;
  milestone_id?: string;
  project_title: string;
  version: string;
  seller_id: string;
  seller_name: string;
  client_name: string;
  client_email: string;
  session_token: string;
  status: "active" | "expired" | "revoked" | "completed";
  created_at: string;
  expires_at: string;
  access_count: number;
  last_accessed_at?: string;
  allowed_parts: {
    interactive_preview: boolean;
    documentation: boolean;
    source_inspection_requestable: boolean;
  };
  watermark_text: string;
  preview_content: {
    type: "web_app" | "document" | "design" | "code_bundle";
    title: string;
    entry_html?: string;
    description: string;
    read_only_files?: Array<{
      path: string;
      language: string;
      content: string;
      size_bytes: number;
      sha256: string;
    }>;
  };
  source_inspection: {
    enabled: boolean;
    seller_authorized: boolean;
    seller_authorized_at?: string;
    client_accepted_terms: boolean;
    client_accepted_at?: string;
    terms_text: string;
  };
  demonstration: {
    id: string;
    summary: string;
    seller_confirmed: boolean;
    seller_confirmed_at?: string;
    client_confirmed: boolean;
    client_confirmed_at?: string;
    requirements: Array<{
      id: string;
      title: string;
      status: "pending" | "reviewed" | "accepted" | "changes_requested";
      feedback?: string;
    }>;
  };
  audit_logs: PreviewAuditLog[];
}

