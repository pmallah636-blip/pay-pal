import { NextResponse } from "next/server";
import { z } from "zod";
import {
  verifyPreviewSessionServer,
  updatePreviewSessionServer,
} from "@/lib/security/preview-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const noStore = {
  headers: {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  },
};

// Allowed seller-only fields — client MUST NOT be able to set these
const SellerActionSchema = z.object({
  sellerAction: z.literal("update"),
  source_inspection: z
    .object({
      seller_authorized: z.boolean().optional(),
      seller_authorized_at: z.string().optional(),
    })
    .optional(),
  demonstration: z
    .object({
      seller_confirmed: z.boolean().optional(),
      seller_confirmed_at: z.string().optional(),
    })
    .optional(),
});

// Allowed client-only fields — seller fields are explicitly excluded
const ClientActionSchema = z.object({
  clientAction: z.literal("update"),
  // Clients MAY NOT set seller_authorized, seller_confirmed, seller_confirmed_at
  source_inspection: z
    .object({
      client_accepted_terms: z.boolean().optional(),
      client_accepted_at: z.string().optional(),
      enabled: z.boolean().optional(),
    })
    .refine(
      (v) =>
        !("seller_authorized" in v) &&
        !("seller_authorized_at" in v),
      { message: "Client cannot set seller authorization fields." }
    )
    .optional(),
  demonstration: z
    .object({
      client_confirmed: z.boolean().optional(),
      client_confirmed_at: z.string().optional(),
      requirements: z
        .array(
          z.object({
            id: z.string(),
            title: z.string(),
            status: z.enum(["pending", "reviewed", "accepted", "changes_requested"]),
            feedback: z.string().optional(),
          })
        )
        .optional(),
    })
    .refine(
      (v) =>
        !("seller_confirmed" in v) &&
        !("seller_confirmed_at" in v),
      { message: "Client cannot set seller confirmation fields." }
    )
    .optional(),
  actionLog: z
    .object({
      action: z.string(),
      actor: z.literal("client"),   // client path always actor=client
      actor_name: z.string(),
      details: z.string(),
    })
    .optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const url = new URL(request.url);
    // Initial/legacy access may provide ?token= (share link). Prefer Authorization/cookie.
    const token = getClientPreviewToken(request) || url.searchParams.get("token") || undefined;

    const result = await verifyPreviewSessionServer(sessionId, token);
    if (!result.authorized || !result.session) {
      const statusMap: Record<string, number> = {
        SESSION_NOT_FOUND: 404,
        SESSION_REVOKED: 403,
        SESSION_EXPIRED: 410,
        TOKEN_MISMATCH: 401,
      };
      return NextResponse.json(
        { authorized: false, status: result.status, error: result.error },
        { status: statusMap[result.status] || 401, ...noStore }
      );
    }

    // Strip any residual token fields before returning
    const { session } = result;
    return NextResponse.json(
      { authorized: true, status: "VALID", session },
      {
        ...noStore,
        headers: {
          ...noStore.headers,
          // Extra hardening for token-bearing/authorized preview responses.
          "Referrer-Policy": "no-referrer",
        },
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error verifying preview session.";
    return NextResponse.json({ error: message }, { status: 500, ...noStore });
  }
}

function getClientPreviewToken(request: Request): string | undefined {
  // Prefer Authorization header for API mutations to avoid leaking tokens in URLs/logs/history.
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    return token || undefined;
  }
  // Cookie fallback (set by authorized preview page) — not accessible to client JS.
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)paymind_preview_token=([^;]+)/);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return undefined;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: "Request body is required." },
        { status: 400, ...noStore }
      );
    }

    // --- SELLER path ---
    if ("sellerAction" in body) {
      const parsed = SellerActionSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid seller action.", details: parsed.error.format() },
          { status: 400, ...noStore }
        );
      }

      const supabase = await createSupabaseServerClient();
      if (!supabase) {
        return NextResponse.json(
          { error: "Authentication service unavailable." },
          { status: 503, ...noStore }
        );
      }
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        return NextResponse.json(
          { error: "Authentication required." },
          { status: 401, ...noStore }
        );
      }

      // Verify seller owns this session before allowing update
      const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
      const admin = createSupabaseAdminClient();
      if (admin) {
        const { data: sess } = await admin
          .from("preview_sessions")
          .select("seller_id")
          .eq("id", sessionId)
          .maybeSingle();
        if (!sess || sess.seller_id !== authData.user.id) {
          return NextResponse.json(
            { error: "You do not have permission to modify this session." },
            { status: 403, ...noStore }
          );
        }
      }

      const updated = await updatePreviewSessionServer(sessionId, {
        demonstration: parsed.data.demonstration as PreviewSession["demonstration"] | undefined,
        source_inspection: parsed.data.source_inspection as PreviewSession["source_inspection"] | undefined,
        actionLog: {
          action: "SELLER_UPDATE",
          actor: "seller",
          actor_name: authData.user.user_metadata?.full_name || "Seller",
          details: "Seller updated session state.",
        },
      });

      if (!updated) {
        return NextResponse.json(
          { error: "Could not update preview session." },
          { status: 404, ...noStore }
        );
      }

      return NextResponse.json({ ok: true, session: updated }, noStore);
    }

    // --- CLIENT path ---
    if ("clientAction" in body) {
      const parsed = ClientActionSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid client action.", details: parsed.error.format() },
          { status: 400, ...noStore }
        );
      }

      // Client must present a valid token via Authorization header or secure cookie.
      // Query parameters are not accepted for mutations (prevents URL/log/history leakage).
      const token = getClientPreviewToken(request);
      const verifyResult = await verifyPreviewSessionServer(sessionId, token);
      if (!verifyResult.authorized) {
        const statusMap: Record<string, number> = {
          SESSION_NOT_FOUND: 404,
          SESSION_REVOKED: 403,
          SESSION_EXPIRED: 410,
          TOKEN_MISMATCH: 401,
        };
        return NextResponse.json(
          { authorized: false, status: verifyResult.status, error: verifyResult.error },
          { status: statusMap[verifyResult.status] || 401, ...noStore }
        );
      }

      const updated = await updatePreviewSessionServer(sessionId, {
        demonstration: parsed.data.demonstration as PreviewSession["demonstration"] | undefined,
        source_inspection: parsed.data.source_inspection as PreviewSession["source_inspection"] | undefined,
        actionLog: parsed.data.actionLog,
      });

      if (!updated) {
        return NextResponse.json(
          { error: "Could not update preview session." },
          { status: 404, ...noStore }
        );
      }

      return NextResponse.json({ ok: true, session: updated }, noStore);
    }

    return NextResponse.json(
      { error: "Request must include sellerAction or clientAction." },
      { status: 400, ...noStore }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error updating preview session.";
    return NextResponse.json({ error: message }, { status: 500, ...noStore });
  }
}

// Import type only (no runtime import needed)
import type { PreviewSession } from "@/types/database.types";
