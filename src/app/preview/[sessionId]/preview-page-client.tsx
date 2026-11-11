"use client";

import { Suspense } from "react";
import { Shield, AlertTriangle, Clock, XCircle } from "lucide-react";
import Link from "next/link";
import type { SessionVerificationResult } from "@/lib/security/preview-repository";
import { ClientPreviewView } from "./client-view";

/**
 * Preview Page Client Component
 *
 * Security: The server result is FINAL.
 * - Client-side re-verification has been removed entirely.
 * - If initialVerification is not authorized, the error screen is rendered.
 * - The client never calls verifyPreviewSession from the browser.
 */
function PreviewContent({
  sessionId,
  token,
  initialVerification,
}: {
  sessionId: string;
  token?: string;
  initialVerification?: SessionVerificationResult;
}) {
  void sessionId; // used by parent for keying; not needed in client logic

  // Server verification result is authoritative — no client-side override
  const verification = initialVerification ?? {
    authorized: false,
    status: "SESSION_NOT_FOUND" as const,
    error: "Preview session could not be loaded.",
  };

  if (!verification.authorized || !verification.session) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4 shadow-xl">
          {verification.status === "SESSION_NOT_FOUND" && (
            <>
              <XCircle className="w-12 h-12 text-rose-400 mx-auto" />
              <h1 className="text-lg font-bold text-white">
                Preview Session Not Found
              </h1>
              <p className="text-sm text-slate-400">
                This preview session does not exist. The link may be incomplete or the session was deleted.
              </p>
            </>
          )}

          {verification.status === "SESSION_REVOKED" && (
            <>
              <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
              <h1 className="text-lg font-bold text-white">
                Preview Session Revoked
              </h1>
              <p className="text-sm text-slate-400">
                {verification.error || "This preview access link has been revoked by the seller."}
              </p>
            </>
          )}

          {verification.status === "SESSION_EXPIRED" && (
            <>
              <Clock className="w-12 h-12 text-slate-400 mx-auto" />
              <h1 className="text-lg font-bold text-white">
                Preview Session Expired
              </h1>
              <p className="text-sm text-slate-400">
                {verification.error || "This preview session has reached its time limit. Please request a new link."}
              </p>
            </>
          )}

          {verification.status === "TOKEN_MISMATCH" && (
            <>
              <Shield className="w-12 h-12 text-rose-400 mx-auto" />
              <h1 className="text-lg font-bold text-white">
                Unauthorized Access
              </h1>
              <p className="text-sm text-slate-400">
                {verification.error || "The session token is invalid or missing. A valid secret link is required to view this preview."}
              </p>
            </>
          )}

          {!["SESSION_NOT_FOUND", "SESSION_REVOKED", "SESSION_EXPIRED", "TOKEN_MISMATCH"].includes(
            verification.status ?? ""
          ) && (
            <>
              <Shield className="w-12 h-12 text-rose-400 mx-auto" />
              <h1 className="text-lg font-bold text-white">Access Denied</h1>
              <p className="text-sm text-slate-400">
                {verification.error || "You are not authorized to view this preview."}
              </p>
            </>
          )}

          <div className="pt-2">
            <Link
              href="/projects"
              className="inline-block px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              &larr; Back to Workspace
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 max-w-6xl mx-auto">
      <ClientPreviewView initialSession={verification.session} token={token} />
    </div>
  );
}

export function PreviewPageClient({
  sessionId,
  token,
  initialVerification,
}: {
  sessionId: string;
  token?: string;
  initialVerification?: SessionVerificationResult;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="text-slate-400 text-sm animate-pulse">
            Verifying preview session…
          </div>
        </div>
      }
    >
      <PreviewContent sessionId={sessionId} token={token} initialVerification={initialVerification} />
    </Suspense>
  );
}
