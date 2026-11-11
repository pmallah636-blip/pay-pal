import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createPreviewSessionServer,
  listPreviewSessionsServer,
} from "@/lib/security/preview-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const IS_DEMO_MODE =
  process.env.NODE_ENV !== "production" && process.env.PAYMIND_DEMO_MODE === "true";

const noStore = {
  headers: {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  },
};

const CreateSessionSchema = z.object({
  projectId: z.string().trim().min(1),
  milestoneId: z.string().trim().optional(),
  projectTitle: z.string().trim().min(1),
  version: z.string().trim().default("v1.0.0"),
  deliverableTitle: z.string().trim().min(1),
  clientName: z.string().trim().min(1),
  clientEmail: z.string().trim().email(),
  durationHours: z.number().int().min(1).max(168).default(48),
  allowSourceInspectionRequest: z.boolean().default(false),
  isDemoMode: z.boolean().optional(), // client hint; server validates independently
});

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      if (IS_DEMO_MODE) {
        // Demo mode without Supabase: return empty list (demo sessions shown in UI via mock data)
        return NextResponse.json({ sessions: [] }, noStore);
      }
      return NextResponse.json(
        { error: "Authentication service unavailable." },
        { status: 503, ...noStore }
      );
    }

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json(
        { error: "Authentication required. Please sign in to view preview sessions." },
        { status: 401, ...noStore }
      );
    }

    const sessions = await listPreviewSessionsServer(authData.user.id);
    return NextResponse.json({ sessions }, noStore);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load preview sessions.";
    return NextResponse.json({ error: message }, { status: 500, ...noStore });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = CreateSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid session configuration.", details: parsed.error.format() },
        { status: 400, ...noStore }
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data: authData } = supabase
      ? await supabase.auth.getUser()
      : { data: { user: null } };

    let sellerId: string;
    let sellerName: string;
    let isDemo = false;

    if (authData.user) {
      sellerId = authData.user.id;
      sellerName =
        authData.user.user_metadata?.full_name || "Seller";

      // Validate project ownership (skip for non-UUID demo IDs)
      const isRealUuid = (id: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      if (isRealUuid(parsed.data.projectId) && supabase) {
        const { data: project } = await supabase
          .from("projects")
          .select("id")
          .eq("id", parsed.data.projectId)
          .eq("freelancer_id", sellerId)
          .maybeSingle();

        if (!project) {
          return NextResponse.json(
            { error: "Project not found or does not belong to this account." },
            { status: 403, ...noStore }
          );
        }
      }
    } else if (IS_DEMO_MODE) {
      // Demo mode: allow unauthenticated session creation with mock identity
      sellerId = "demo_seller_001";
      sellerName = "Demo Seller (PayMind)";
      isDemo = true;
    } else {
      return NextResponse.json(
        { error: "Authentication required. Please sign in to create a preview session." },
        { status: 401, ...noStore }
      );
    }

    const { session, rawToken, shareUrl } = await createPreviewSessionServer({
      projectId: parsed.data.projectId,
      milestoneId: parsed.data.milestoneId,
      projectTitle: parsed.data.projectTitle,
      version: parsed.data.version,
      sellerId,
      sellerName,
      clientName: parsed.data.clientName,
      clientEmail: parsed.data.clientEmail,
      durationHours: parsed.data.durationHours,
      allowedParts: {
        interactive_preview: true,
        documentation: true,
        source_inspection_requestable: parsed.data.allowSourceInspectionRequest,
      },
      previewContent: {
        type: "web_app",
        title: parsed.data.deliverableTitle,
        description:
          "Interactive client demonstration build. Isolated execution.",
        entry_html: `<div style="padding:24px; font-family:sans-serif; background:#f8fafc; color:#0f172a; border-radius:8px; border:1px solid #e2e8f0;">
          <h3 style="margin-top:0; color:#0369a1;">Deliverable Build: ${parsed.data.deliverableTitle}</h3>
          <p>Running in an isolated sandbox iframe without host filesystem or credential access.</p>
        </div>`,
      },
      isDemoMode: isDemo,
    });

    // Return rawToken exactly once — client must save this
    return NextResponse.json({ ok: true, session, rawToken, shareUrl }, noStore);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create preview session.";
    return NextResponse.json({ error: message }, { status: 500, ...noStore });
  }
}
