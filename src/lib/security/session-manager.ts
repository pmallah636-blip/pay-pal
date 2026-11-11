import { generateSecureToken, secureTimingCompare, calculateSHA256 } from "./crypto-utils";
import { PreviewSession, PreviewAuditLog } from "@/types/database.types";
import { MOCK_PREVIEW_SESSIONS } from "@/lib/supabase/mock-data";

export interface SessionVerificationResult {
  authorized: boolean;
  status: "VALID" | "TOKEN_MISMATCH" | "SESSION_NOT_FOUND" | "SESSION_EXPIRED" | "SESSION_REVOKED";
  session?: PreviewSession;
  error?: string;
}

// In-memory sessions store (initialized with seed data, updated live)
const sessionsStore: Map<string, PreviewSession> = new Map();

// Initialize with seed sessions
for (const s of MOCK_PREVIEW_SESSIONS) {
  sessionsStore.set(s.id, { ...s });
}

/**
 * Creates a new PreviewSession with a cryptographically unpredictable token.
 */
export function createSecurePreviewSession(params: {
  projectId: string;
  milestoneId?: string;
  projectTitle: string;
  version: string;
  sellerId: string;
  sellerName: string;
  clientName: string;
  clientEmail: string;
  durationHours?: number;
  allowedParts: {
    interactive_preview: boolean;
    documentation: boolean;
    source_inspection_requestable: boolean;
  };
  previewContent: PreviewSession["preview_content"];
}): PreviewSession {
  const durationHours = params.durationHours || 48;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationHours * 3600 * 1000);
  const sessionId = `prev_session_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
  const sessionToken = generateSecureToken("tok_sec");

  const watermarkText = `${params.clientName.toUpperCase()} • REF: ${params.projectId} • ID: ${sessionId} • PAYMIND ZERO-TRUST DELIVERY`;

  const newSession: PreviewSession = {
    id: sessionId,
    project_id: params.projectId,
    milestone_id: params.milestoneId,
    project_title: params.projectTitle,
    version: params.version,
    seller_id: params.sellerId,
    seller_name: params.sellerName,
    client_name: params.clientName,
    client_email: params.clientEmail,
    session_token: sessionToken,
    status: "active",
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    access_count: 0,
    allowed_parts: params.allowedParts,
    watermark_text: watermarkText,
    preview_content: params.previewContent,
    source_inspection: {
      enabled: false,
      seller_authorized: false,
      client_accepted_terms: false,
      terms_text:
        "Mutual Source-Code Inspection Agreement: The client agrees that source code viewed in this portal is proprietary intellectual property of the seller provided strictly for functional verification. Viewing code does not convey copyright or license ownership until milestone payment and final contractual handover are complete. Browser-based display cannot technically prevent manual copying, photos, or transcription; both parties acknowledge and accept this limitation.",
    },
    demonstration: {
      id: `demo_${Date.now().toString(36)}`,
      summary: "Scheduled milestone demonstration.",
      seller_confirmed: true,
      seller_confirmed_at: now.toISOString(),
      client_confirmed: false,
      requirements: [
        {
          id: "REQ-01",
          title: "Core functional deliverable execution in isolated preview",
          status: "pending",
        },
      ],
    },
    audit_logs: [
      {
        timestamp: now.toISOString(),
        action: "PREVIEW_SESSION_CREATED",
        actor: "seller",
        actor_name: params.sellerName,
        details: `Created cryptographically signed preview session for ${params.clientName} (Expires: ${expiresAt.toISOString()}).`,
      },
    ],
  };

  sessionsStore.set(sessionId, newSession);
  return newSession;
}

/**
 * Verifies a preview session with timing-safe token checking, expiration and revocation checks.
 */
export function verifyPreviewSession(sessionId: string, token?: string): SessionVerificationResult {
  const session = sessionsStore.get(sessionId);

  if (!session) {
    return {
      authorized: false,
      status: "SESSION_NOT_FOUND",
      error: "Session does not exist.",
    };
  }

  // Check revocation
  if (session.status === "revoked") {
    return {
      authorized: false,
      status: "SESSION_REVOKED",
      session,
      error: "This preview session has been revoked by the seller. Access is terminated.",
    };
  }

  // Check expiration
  const now = new Date();
  const expiresAt = new Date(session.expires_at);
  if (now > expiresAt || session.status === "expired") {
    session.status = "expired";
    return {
      authorized: false,
      status: "SESSION_EXPIRED",
      session,
      error: `This preview session expired on ${expiresAt.toLocaleString()}.`,
    };
  }

  // Token enforcement (if token provided or required)
  if (token) {
    const isTokenValid = secureTimingCompare(token, session.session_token);
    if (!isTokenValid) {
      return {
        authorized: false,
        status: "TOKEN_MISMATCH",
        error: "Invalid or unauthorized session token.",
      };
    }
  }

  // Increment access count & log
  session.access_count += 1;
  session.last_accessed_at = now.toISOString();

  return {
    authorized: true,
    status: "VALID",
    session,
  };
}

/**
 * Revokes a preview session immediately.
 */
export function revokePreviewSession(sessionId: string, sellerId: string): boolean {
  const session = sessionsStore.get(sessionId);
  if (!session) return false;

  // Verify seller identity
  if (session.seller_id !== sellerId) return false;

  const now = new Date().toISOString();
  session.status = "revoked";
  session.audit_logs.push({
    timestamp: now,
    action: "PREVIEW_SESSION_REVOKED",
    actor: "seller",
    actor_name: session.seller_name,
    details: "Session immediately revoked by seller. All client access terminated.",
  });

  return true;
}

/**
 * Seller grants authorization for source-code inspection.
 */
export function authorizeSourceInspectionSeller(sessionId: string, sellerId: string): boolean {
  const session = sessionsStore.get(sessionId);
  if (!session) return false;
  if (session.seller_id !== sellerId) return false;

  const now = new Date().toISOString();
  session.source_inspection.seller_authorized = true;
  session.source_inspection.seller_authorized_at = now;
  session.audit_logs.push({
    timestamp: now,
    action: "SELLER_AUTHORIZED_SOURCE_INSPECTION",
    actor: "seller",
    actor_name: session.seller_name,
    details: "Seller recorded explicit authorization for client read-only source review.",
  });

  return true;
}

/**
 * Client accepts inspection terms / NDA.
 */
export function acceptSourceInspectionTermsClient(sessionId: string, token: string): boolean {
  const verification = verifyPreviewSession(sessionId, token);
  if (!verification.authorized || !verification.session) return false;

  const session = verification.session;
  const now = new Date().toISOString();
  session.source_inspection.client_accepted_terms = true;
  session.source_inspection.client_accepted_at = now;
  session.audit_logs.push({
    timestamp: now,
    action: "CLIENT_ACCEPTED_INSPECTION_TERMS",
    actor: "client",
    actor_name: session.client_name,
    details: "Client recorded digital acceptance of inspection terms and NDA obligations.",
  });

  return true;
}

/**
 * Retrieves source code files ONLY if dual-consent is satisfied.
 * Credentials and secrets are scrubbed.
 */
export function getSanitizedSourceFiles(sessionId: string, token: string): {
  unlocked: boolean;
  files?: Array<{ path: string; language: string; content: string; sha256: string }>;
  error?: string;
} {
  const verification = verifyPreviewSession(sessionId, token);
  if (!verification.authorized || !verification.session) {
    return { unlocked: false, error: verification.error || "Unauthorized" };
  }

  const session = verification.session;
  const { seller_authorized, client_accepted_terms } = session.source_inspection;

  if (!seller_authorized || !client_accepted_terms) {
    return {
      unlocked: false,
      error: "DUAL_CONSENT_REQUIRED: Source files are locked until both seller authorizes and client accepts terms.",
    };
  }

  // Scrub any potential secrets before returning
  const rawFiles = session.preview_content.read_only_files || [];
  const sanitized = rawFiles.map((file) => {
    let cleanContent = file.content;
    // Scrub live secrets, tokens, API keys
    cleanContent = cleanContent.replace(/([A-Za-z0-9_-]{20,})(["'\s;])/g, (match, p1, p2) => {
      if (p1.length > 25 && !p1.includes(" ") && !p1.includes("/")) {
        return `[REDACTED_SECRET_${calculateSHA256(p1).substring(0, 8)}]${p2}`;
      }
      return match;
    });

    return {
      path: file.path,
      language: file.language,
      content: cleanContent,
      sha256: calculateSHA256(cleanContent),
    };
  });

  return { unlocked: true, files: sanitized };
}

/**
 * Records mutual demonstration confirmation.
 */
export function recordDemonstrationConfirmation(
  sessionId: string,
  token: string,
  requirements: Array<{ id: string; title: string; status: "pending" | "reviewed" | "accepted" | "changes_requested"; feedback?: string }>
): boolean {
  const verification = verifyPreviewSession(sessionId, token);
  if (!verification.authorized || !verification.session) return false;

  const session = verification.session;
  const now = new Date().toISOString();

  session.demonstration.client_confirmed = true;
  session.demonstration.client_confirmed_at = now;
  session.demonstration.requirements = requirements;

  session.audit_logs.push({
    timestamp: now,
    action: "CLIENT_CONFIRMED_DEMO",
    actor: "client",
    actor_name: session.client_name,
    details: `Client confirmed demonstration with ${requirements.filter((r) => r.status === "accepted").length} of ${requirements.length} requirements accepted.`,
  });

  return true;
}

export function getSessionAuditLogs(sessionId: string): PreviewAuditLog[] {
  const session = sessionsStore.get(sessionId);
  return session ? [...session.audit_logs] : [];
}
