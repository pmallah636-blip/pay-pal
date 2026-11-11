import { NextResponse } from "next/server";
import { revokePreviewSessionServer } from "@/lib/security/preview-repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const noStore = {
  headers: {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  },
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

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
        { error: "Authentication required. Only the session owner can revoke a preview." },
        { status: 401, ...noStore }
      );
    }

    // revokePreviewSessionServer verifies seller_id matches before revoking
    const ok = await revokePreviewSessionServer(sessionId, authData.user.id);
    if (!ok) {
      return NextResponse.json(
        { error: "Session not found or you do not have permission to revoke it." },
        { status: 404, ...noStore }
      );
    }

    return NextResponse.json(
      { ok: true, message: `Session ${sessionId} has been revoked.` },
      noStore
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error revoking preview session.";
    return NextResponse.json({ error: message }, { status: 500, ...noStore });
  }
}
