/**
 * Preview Session Repository — Server-Side Only
 *
 * Security model:
 * - Raw bearer tokens NEVER stored in Supabase; only their SHA-256 hash.
 * - Supabase (service-role) is the authoritative store when configured.
 * - Supabase errors fail closed — no silent fallback that could authorize stale data.
 * - Local JSON/memory fallback ONLY in demo mode (NODE_ENV !== 'production' && PAYMIND_DEMO_MODE === 'true').
 * - List APIs never return token_hash or session_token fields.
 * - revokePreviewSessionServer verifies seller_id ownership before revoking.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { generateSecureToken } from "./crypto-utils";
import { hashToken, verifyTokenHash } from "./token-utils";
import { PreviewSession } from "@/types/database.types";
import { MOCK_PREVIEW_SESSIONS } from "@/lib/supabase/mock-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface SessionVerificationResult {
  authorized: boolean;
  status: "VALID" | "TOKEN_MISMATCH" | "SESSION_NOT_FOUND" | "SESSION_EXPIRED" | "SESSION_REVOKED";
  session?: PreviewSession;
  error?: string;
}

// ---------------------------------------------------------------------------
// Demo / local-dev persistence (never used in production)
// ---------------------------------------------------------------------------
const IS_DEMO_MODE =
  process.env.NODE_ENV !== "production" && process.env.PAYMIND_DEMO_MODE === "true";

const STORAGE_DIR = path.join(process.cwd(), ".data");
const SESSIONS_FILE = path.join(STORAGE_DIR, "preview_sessions.json");

function ensureStorageDir() {
  try {
    if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
  } catch {
    // Restricted FS — ignore in demo mode only
  }
}

function readDemoSessions(): Map<string, PreviewSession> {
  const store = new Map<string, PreviewSession>();
  for (const s of MOCK_PREVIEW_SESSIONS) store.set(s.id, { ...s });
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const list = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf-8")) as PreviewSession[];
      if (Array.isArray(list)) for (const item of list) store.set(item.id, item);
    }
  } catch {
    // Fall back to seed only
  }
  return store;
}

function writeDemoSessions(store: Map<string, PreviewSession>) {
  try {
    ensureStorageDir();
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Array.from(store.values()), null, 2), "utf-8");
  } catch {
    // Best-effort in demo mode
  }
}

// ---------------------------------------------------------------------------
// Strip token fields from a session before returning to callers
// ---------------------------------------------------------------------------
function stripTokenFields(session: PreviewSession & { token_hash?: string; session_token?: string }): PreviewSession {
  const { token_hash: _th, session_token: _st, ...safe } = session as PreviewSession & {
    token_hash?: string;
    session_token?: string;
  };
  void _th;
  void _st;
  return safe as PreviewSession;
}

// ---------------------------------------------------------------------------
// createPreviewSessionServer
// ---------------------------------------------------------------------------
export async function createPreviewSessionServer(params: {
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
  isDemoMode?: boolean;
}): Promise<{ session: PreviewSession; rawToken: string; shareUrl: string }> {
  const durationHours = params.durationHours ?? 48;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationHours * 3600 * 1000);
  const sessionId = `prev_session_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
  const rawToken = generateSecureToken("tok_sec");
  const tokenHash = hashToken(rawToken);

  const watermarkText = `${params.clientName.toUpperCase()} • REF: ${params.projectId} • ID: ${sessionId} • PAYMIND ZERO-TRUST DELIVERY`;

  const sessionData: PreviewSession = {
    id: sessionId,
    project_id: params.projectId,
    milestone_id: params.milestoneId,
    project_title: params.projectTitle,
    version: params.version,
    seller_id: params.sellerId,
    seller_name: params.sellerName,
    client_name: params.clientName,
    client_email: params.clientEmail,
    // session_token intentionally omitted — only rawToken is returned once
    session_token: "", // placeholder required by PreviewSession type; never stored raw in DB
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
        "Mutual Source-Code Inspection Agreement: The client agrees that source code viewed in this portal is proprietary intellectual property of the seller provided strictly for functional verification. Viewing code does not convey copyright or license ownership until milestone payment and final contractual handover are complete.",
    },
    demonstration: {
      id: `demo_${Date.now().toString(36)}`,
      summary: "Milestone demonstration checklist.",
      seller_confirmed: true,
      seller_confirmed_at: now.toISOString(),
      client_confirmed: false,
      requirements: [
        { id: "REQ-01", title: "Core functional deliverable execution in isolated preview", status: "pending" },
        { id: "REQ-02", title: "Visual acceptance criteria & user workflow inspection", status: "pending" },
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

  const isDemoMode = params.isDemoMode ?? IS_DEMO_MODE;

  // --- Persist to Supabase (authoritative store) ---
  const admin = createSupabaseAdminClient();
  if (admin) {
    // Only link real UUIDs; demo/mock IDs must not be inserted as project_id FK
    const isRealUuid = (id: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const { error } = await admin.from("preview_sessions").upsert({
      id: sessionData.id,
      project_id: isRealUuid(params.projectId) ? params.projectId : null,
      milestone_id:
        params.milestoneId && isRealUuid(params.milestoneId) ? params.milestoneId : null,
      seller_id: isRealUuid(params.sellerId) ? params.sellerId : null,
      client_name: sessionData.client_name,
      client_email: sessionData.client_email,
      token_hash: tokenHash,          // ← store hash, not raw token
      status: sessionData.status,
      allowed_parts: sessionData.allowed_parts,
      watermark_text: sessionData.watermark_text,
      preview_content: sessionData.preview_content,
      source_inspection: sessionData.source_inspection,
      demonstration: sessionData.demonstration,
      access_count: sessionData.access_count,
      expires_at: sessionData.expires_at,
      created_at: sessionData.created_at,
    });

    if (error) {
      // Fail closed in production; allow demo mode to continue with local storage
      if (!isDemoMode) {
        throw new Error(`Failed to persist preview session: ${error.message}`);
      }
    } else {
      await admin.from("preview_audit_logs").insert({
        session_id: sessionData.id,
        action: "PREVIEW_SESSION_CREATED",
        actor: "seller",
        actor_name: params.sellerName,
        details: `Created preview session for ${params.clientName}.`,
      });
    }
  } else if (!isDemoMode) {
    throw new Error("Supabase is not configured. Cannot persist preview session in production.");
  }

  // --- Demo mode: also save to local JSON ---
  if (isDemoMode) {
    const demoStore = readDemoSessions();
    demoStore.set(sessionId, sessionData);
    writeDemoSessions(demoStore);
  }

  const shareUrl = `/preview/${sessionId}?token=${rawToken}`;
  const safeSession = stripTokenFields(sessionData);

  return { session: safeSession, rawToken, shareUrl };
}

// ---------------------------------------------------------------------------
// verifyPreviewSessionServer
// ---------------------------------------------------------------------------
export async function verifyPreviewSessionServer(
  sessionId: string,
  token?: string
): Promise<SessionVerificationResult> {
  if (!token) {
    return {
      authorized: false,
      status: "TOKEN_MISMATCH",
      error:
        "Invalid or missing preview session token. You are not authorized to view this preview without a valid secret link.",
    };
  }

  const admin = createSupabaseAdminClient();

  if (admin) {
    // Authoritative path — query Supabase with service-role key
    const { data, error } = await admin
      .from("preview_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (error) {
      // Supabase error → fail closed
      return {
        authorized: false,
        status: "SESSION_NOT_FOUND",
        error: "Preview session could not be verified. Please try again.",
      };
    }

    if (data) {
      // Check revocation
      if (data.status === "revoked") {
        return {
          authorized: false,
          status: "SESSION_REVOKED",
          error: "This preview session has been revoked by the seller. Client access terminated.",
        };
      }

      // Check expiration
      if (new Date(data.expires_at).getTime() < Date.now() || data.status === "expired") {
        await admin
          .from("preview_sessions")
          .update({ status: "expired" })
          .eq("id", sessionId);
        return {
          authorized: false,
          status: "SESSION_EXPIRED",
          error: "This preview session has expired. Request a new preview link from the seller.",
        };
      }

      // Verify token hash — timing-safe
      const storedHash: string = data.token_hash ?? data.session_token ?? "";
      const tokenValid = storedHash.startsWith("tok_sec_")
        ? // Legacy: raw token stored (old schema before migration 005)
          storedHash === token.trim()
        : verifyTokenHash(token.trim(), storedHash);

      if (!tokenValid) {
        return {
          authorized: false,
          status: "TOKEN_MISMATCH",
          error:
            "Invalid or missing preview session token. You are not authorized to view this preview without a valid secret link.",
        };
      }

      // Fetch audit logs separately
      let auditLogs: PreviewSession["audit_logs"] = [];
      try {
        const { data: logRows } = await admin
          .from("preview_audit_logs")
          .select("created_at, action, actor, actor_name, details")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true });
        if (logRows && logRows.length > 0) {
          auditLogs = logRows.map((r) => ({
            timestamp: r.created_at,
            action: r.action,
            actor: r.actor as "seller" | "client" | "system",
            actor_name: r.actor_name,
            details: r.details || "",
          }));
        }
      } catch {
        // Audit logs unavailable; non-fatal
      }

      // Increment access count
      const newCount = (data.access_count || 0) + 1;
      await admin
        .from("preview_sessions")
        .update({ access_count: newCount, last_accessed_at: new Date().toISOString() })
        .eq("id", sessionId);

      await admin.from("preview_audit_logs").insert({
        session_id: sessionId,
        action: "SESSION_ACCESSED",
        actor: "client",
        actor_name: data.client_name,
        details: `View #${newCount}`,
      });

      const session: PreviewSession = {
        id: data.id,
        project_id: data.project_id,
        milestone_id: data.milestone_id ?? undefined,
        project_title: data.preview_content?.title || "Project Deliverable",
        version: "v1.0.0",
        seller_id: data.seller_id || "seller",
        seller_name: "Seller",
        client_name: data.client_name,
        client_email: data.client_email,
        session_token: "", // never expose raw token; use empty string
        status: data.status,
        created_at: data.created_at,
        expires_at: data.expires_at,
        access_count: newCount,
        allowed_parts: data.allowed_parts,
        watermark_text: data.watermark_text,
        preview_content: data.preview_content,
        source_inspection: data.source_inspection,
        demonstration: data.demonstration,
        audit_logs: auditLogs,
      };

      return { authorized: true, status: "VALID", session: stripTokenFields(session) };
    }

    // Supabase has no matching record.
    // Demo mode only: allow local JSON fallback for demo/local preview sessions that were
    // not persisted to Supabase (e.g. non-UUID local demo project IDs, unauthenticated demo
    // creation, or Supabase insert failure). This never bypasses token verification and is
    // disabled outside non-production demo mode.
    if (!IS_DEMO_MODE) {
      return {
        authorized: false,
        status: "SESSION_NOT_FOUND",
        error: "This preview session does not exist. The link may be incorrect or the session was deleted.",
      };
    }
  }

  // --- Demo/local fallback (only in demo mode) ---
  if (!IS_DEMO_MODE) {
    return {
      authorized: false,
      status: "SESSION_NOT_FOUND",
      error: "Preview session could not be verified. Please try again.",
    };
  }

  const demoStore = readDemoSessions();
  const session = demoStore.get(sessionId);

  if (!session) {
    return {
      authorized: false,
      status: "SESSION_NOT_FOUND",
      error: "This preview session does not exist.",
    };
  }

  if (session.status === "revoked") {
    return { authorized: false, status: "SESSION_REVOKED", error: "This preview session has been revoked." };
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    session.status = "expired";
    demoStore.set(sessionId, session);
    writeDemoSessions(demoStore);
    return { authorized: false, status: "SESSION_EXPIRED", error: "This preview session has expired." };
  }

  // Demo token comparison — raw token stored in demo local store
  const rawStored = session.session_token ?? "";
  const tokenMatch = rawStored
    ? rawStored === token.trim()
    : verifyTokenHash(token.trim(), (session as PreviewSession & { token_hash?: string }).token_hash ?? "");

  if (!tokenMatch) {
    return {
      authorized: false,
      status: "TOKEN_MISMATCH",
      error: "Invalid or missing preview session token.",
    };
  }

  session.access_count += 1;
  demoStore.set(sessionId, session);
  writeDemoSessions(demoStore);

  return { authorized: true, status: "VALID", session: stripTokenFields(session) };
}

// ---------------------------------------------------------------------------
// revokePreviewSessionServer — requires sellerId match
// ---------------------------------------------------------------------------
export async function revokePreviewSessionServer(
  sessionId: string,
  sellerId: string
): Promise<boolean> {
  const admin = createSupabaseAdminClient();

  if (admin) {
    // Verify ownership first
    const { data, error } = await admin
      .from("preview_sessions")
      .select("id, seller_id, client_name, seller_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (error || !data) return false;
    if (data.seller_id !== sellerId) return false; // 403 — wrong seller

    const { error: updateError } = await admin
      .from("preview_sessions")
      .update({ status: "revoked" })
      .eq("id", sessionId);

    if (updateError) return false;

    await admin.from("preview_audit_logs").insert({
      session_id: sessionId,
      action: "PREVIEW_SESSION_REVOKED",
      actor: "seller",
      actor_name: "Seller",
      details: "Revoked access.",
    });

    return true;
  }

  if (!IS_DEMO_MODE) return false;

  const demoStore = readDemoSessions();
  const session = demoStore.get(sessionId);
  if (!session) return false;
  if (session.seller_id !== sellerId) return false;

  session.status = "revoked";
  demoStore.set(sessionId, session);
  writeDemoSessions(demoStore);
  return true;
}

// ---------------------------------------------------------------------------
// updatePreviewSessionServer — seller path: requires Supabase auth (caller verified)
//                             client path: requires valid token
// ---------------------------------------------------------------------------
export async function updatePreviewSessionServer(
  sessionId: string,
  patch: {
    demonstration?: PreviewSession["demonstration"];
    source_inspection?: PreviewSession["source_inspection"];
    actionLog?: { action: string; actor: "seller" | "client"; actor_name: string; details: string };
  }
): Promise<PreviewSession | null> {
  const admin = createSupabaseAdminClient();

  if (admin) {
    const updates: Record<string, unknown> = {};
    if (patch.demonstration) updates.demonstration = patch.demonstration;
    if (patch.source_inspection) updates.source_inspection = patch.source_inspection;

    if (Object.keys(updates).length > 0) {
      const { error } = await admin
        .from("preview_sessions")
        .update(updates)
        .eq("id", sessionId);
      if (error) return null;
    }

    if (patch.actionLog) {
      await admin.from("preview_audit_logs").insert({
        session_id: sessionId,
        action: patch.actionLog.action,
        actor: patch.actionLog.actor,
        actor_name: patch.actionLog.actor_name,
        details: patch.actionLog.details,
      });
    }

    const { data } = await admin.from("preview_sessions").select("*").eq("id", sessionId).maybeSingle();
    if (!data) return null;

    return stripTokenFields({
      id: data.id,
      project_id: data.project_id,
      milestone_id: data.milestone_id ?? undefined,
      project_title: data.preview_content?.title || "Project Deliverable",
      version: "v1.0.0",
      seller_id: data.seller_id || "seller",
      seller_name: "Seller",
      client_name: data.client_name,
      client_email: data.client_email,
      session_token: "",
      status: data.status,
      created_at: data.created_at,
      expires_at: data.expires_at,
      access_count: data.access_count || 0,
      allowed_parts: data.allowed_parts,
      watermark_text: data.watermark_text,
      preview_content: data.preview_content,
      source_inspection: data.source_inspection,
      demonstration: data.demonstration,
      audit_logs: [],
    });
  }

  if (!IS_DEMO_MODE) return null;

  const demoStore = readDemoSessions();
  const session = demoStore.get(sessionId);
  if (!session) return null;

  if (patch.demonstration) session.demonstration = { ...session.demonstration, ...patch.demonstration };
  if (patch.source_inspection) session.source_inspection = { ...session.source_inspection, ...patch.source_inspection };
  if (patch.actionLog) {
    session.audit_logs.push({
      timestamp: new Date().toISOString(),
      action: patch.actionLog.action,
      actor: patch.actionLog.actor,
      actor_name: patch.actionLog.actor_name,
      details: patch.actionLog.details,
    });
  }

  demoStore.set(sessionId, session);
  writeDemoSessions(demoStore);
  return stripTokenFields(session);
}

// ---------------------------------------------------------------------------
// listPreviewSessionsServer — requires authenticated sellerId; never returns tokens
// ---------------------------------------------------------------------------
export async function listPreviewSessionsServer(sellerId: string): Promise<PreviewSession[]> {
  const admin = createSupabaseAdminClient();

  if (admin) {
    const { data, error } = await admin
      .from("preview_sessions")
      .select("*")
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Could not load preview sessions: ${error.message}`);
    }

    if (!Array.isArray(data)) return [];

    return data.map((row) =>
      stripTokenFields({
        id: row.id,
        project_id: row.project_id,
        milestone_id: row.milestone_id ?? undefined,
        project_title: row.preview_content?.title || "Project Deliverable",
        version: "v1.0.0",
        seller_id: row.seller_id || "seller",
        seller_name: "Seller",
        client_name: row.client_name,
        client_email: row.client_email,
        session_token: "",
        status: row.status,
        created_at: row.created_at,
        expires_at: row.expires_at,
        access_count: row.access_count || 0,
        allowed_parts: row.allowed_parts,
        watermark_text: row.watermark_text,
        preview_content: row.preview_content,
        source_inspection: row.source_inspection,
        demonstration: row.demonstration,
        audit_logs: [],
        token_hash: row.token_hash,
      })
    );
  }

  if (!IS_DEMO_MODE) {
    throw new Error("Supabase is not configured.");
  }

  // Demo mode: filter by sellerId
  const demoStore = readDemoSessions();
  return Array.from(demoStore.values())
    .filter((s) => s.seller_id === sellerId)
    .map(stripTokenFields);
}
