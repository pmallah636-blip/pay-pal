import { Suspense } from "react";
import { cookies } from "next/headers";
import { verifyPreviewSessionServer } from "@/lib/security/preview-repository";
import { PreviewPageClient } from "./preview-page-client";

type PageProps = {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

async function PreviewPortalContent({ params, searchParams }: PageProps) {
  const { sessionId } = await params;
  const sParams = await searchParams;
  const token = typeof sParams.token === "string" ? sParams.token : undefined;

  const initialVerification = await verifyPreviewSessionServer(sessionId, token);

  // For authorized sessions, bind the token to an HttpOnly cookie for server-validated
  // follow-up operations (same-origin). The raw token is not stored in localStorage/sessionStorage.
  // The share link remains usable; the token in the initial URL is a documented share-link tradeoff.
  if (initialVerification.authorized && token) {
    try {
      const cookieStore = await cookies();
      cookieStore.set("paymind_preview_token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: `/preview/${sessionId}`,
        maxAge: 60 * 60 * 48,
      });
    } catch {
      // Cookie setting may be unavailable in some render contexts; client still uses Authorization header.
    }
  }

  return (
    <PreviewPageClient
      sessionId={sessionId}
      token={token}
      initialVerification={initialVerification}
    />
  );
}

export default function ClientPreviewPortalPage(props: PageProps) {
  return (
    <>
      {/* Prevent sending the share-link URL (which may contain a token) as a referrer to external resources. */}
      <meta name="referrer" content="no-referrer" />
      <Suspense
        fallback={
          <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-400 text-sm">
            Loading client preview portal...
          </div>
        }
      >
        <PreviewPortalContent {...props} />
      </Suspense>
    </>
  );
}
