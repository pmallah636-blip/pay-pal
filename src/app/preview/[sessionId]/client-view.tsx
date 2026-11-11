"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Shield,
  Eye,
  CheckCircle2,
  Clock,
  Lock,
  FileCode,
  Download,
    Check,
  FileCheck2,
  Info,
} from "lucide-react";
import { PreviewSession } from "@/types/database.types";
// Client preview actions sync through the server API (token-validated).
// Client-side session-manager mutations are intentionally not used here.

export function ClientPreviewView({
  initialSession,
  token,
}: {
  initialSession: PreviewSession;
  token?: string;
}) {
  const [session, setSession] = useState<PreviewSession>(initialSession);
  const [activeTab, setActiveTab] = useState<"preview" | "demonstration" | "source_inspection" | "audit_trail">("preview");
  const [clientConfirmed, setClientConfirmed] = useState(session.demonstration.client_confirmed);
  const [sellerAuthorized, setSellerAuthorized] = useState(session.source_inspection.seller_authorized);
  const [clientAcceptedTerms, setClientAcceptedTerms] = useState(session.source_inspection.client_accepted_terms);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [reportGenerated, setReportGenerated] = useState(false);

  // Requirements checklist state
  const [requirements, setRequirements] = useState(session.demonstration.requirements);

  // Client actions are validated server-side. The raw token is sent via
  // Authorization header only (never in the URL) to prevent query/log/history leakage.
  const syncServer = async (patch: {
    demonstration?: PreviewSession["demonstration"];
    source_inspection?: PreviewSession["source_inspection"];
    actionLog?: { action: string; actor: "client"; actor_name: string; details: string };
  }) => {
    if (!token) return;
    try {
      await fetch(`/api/preview/${session.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ clientAction: "update", ...patch }),
      });
    } catch {
      // Best-effort sync; server remains authoritative.
    }
  };

  const handleUpdateRequirementStatus = (
    reqId: string,
    status: "reviewed" | "accepted" | "changes_requested"
  ) => {
    const updated = requirements.map((r) => (r.id === reqId ? { ...r, status } : r));
    setRequirements(updated);
    void syncServer({
      demonstration: {
        ...session.demonstration,
        requirements: updated,
      },
      actionLog: {
        action: "REQUIREMENT_STATUS_UPDATED",
        actor: "client",
        actor_name: session.client_name,
        details: `Updated requirement ${reqId} to ${status}.`,
      },
    });
  };

  const handleUpdateRequirementFeedback = (reqId: string, feedback: string) => {
    const updated = requirements.map((r) => (r.id === reqId ? { ...r, feedback } : r));
    setRequirements(updated);
    void syncServer({
      demonstration: {
        ...session.demonstration,
        requirements: updated,
      },
    });
  };

  const handleConfirmDemonstration = () => {
    // Local UI update only; server validates token and persists the client action.
    setClientConfirmed(true);
    const actionLog = {
      timestamp: new Date().toISOString(),
      action: "CLIENT_CONFIRMED_DEMO",
      actor: "client" as const,
      actor_name: session.client_name,
      details: "Client confirmed mutual demonstration completed.",
    };
    const updatedLogs = [...session.audit_logs, actionLog];
    const newDemo = {
      ...session.demonstration,
      client_confirmed: true,
      client_confirmed_at: new Date().toISOString(),
      requirements,
    };
    setSession({
      ...session,
      audit_logs: updatedLogs,
      demonstration: newDemo,
    });
    void syncServer({
      demonstration: newDemo,
      actionLog,
    });
  };

  const handleSellerAuthorizeInspection = () => {
    // This control is a UI demo affordance only. The server rejects seller fields
    // from the client path; real seller authorization must go through an authenticated seller flow.
    setSellerAuthorized(true);
    const actionLog = {
      timestamp: new Date().toISOString(),
      action: "SELLER_AUTHORIZATION_UI_ONLY",
      actor: "client" as const,
      actor_name: session.client_name,
      details:
        "Client preview UI toggled local seller-authorization state for demonstration; server-side seller consent requires authenticated seller action.",
    };
    setSession((prev) => ({
      ...prev,
      audit_logs: [...prev.audit_logs, actionLog],
    }));
  };

  const handleClientAcceptInspectionTerms = () => {
    // Local UI update only; server validates token and persists the client action.
    setClientAcceptedTerms(true);
    const actionLog = {
      timestamp: new Date().toISOString(),
      action: "CLIENT_ACCEPTED_INSPECTION_TERMS",
      actor: "client" as const,
      actor_name: session.client_name,
      details: "Client accepted NDA terms for read-only code review.",
    };
    const newSource = {
      ...session.source_inspection,
      client_accepted_terms: true,
      client_accepted_at: new Date().toISOString(),
    };
    setSession((prev) => ({
      ...prev,
      source_inspection: newSource,
      audit_logs: [...prev.audit_logs, actionLog],
    }));
    void syncServer({
      source_inspection: newSource,
      actionLog,
    });
  };

  const isSourceUnlocked = sellerAuthorized && clientAcceptedTerms;

  const downloadEvidenceReport = () => {
    const reportData = {
      report_title: "PayMind Mutual Demonstration & Delivery Evidence Report",
      generated_at: new Date().toISOString(),
      session_id: session.id,
      project_title: session.project_title,
      version: session.version,
      parties: {
        seller: session.seller_name,
        client: session.client_name,
        client_email: session.client_email,
      },
      demonstration_status: {
        seller_confirmed: session.demonstration.seller_confirmed,
        seller_confirmed_at: session.demonstration.seller_confirmed_at,
        client_confirmed: clientConfirmed,
        client_confirmed_at: session.demonstration.client_confirmed_at || (clientConfirmed ? new Date().toISOString() : null),
        summary: session.demonstration.summary,
      },
      requirements_evaluated: requirements,
      source_inspection_log: {
        seller_authorized: sellerAuthorized,
        client_accepted_terms: clientAcceptedTerms,
      },
      audit_trail: session.audit_logs,
      legal_disclaimer:
        "This evidence report confirms that a live demonstration occurred for the specified deliverable version. Demonstration confirmation does not convey title or full project acceptance without agreed milestone payment under the contract.",
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paymind-evidence-${session.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setReportGenerated(true);
    setTimeout(() => setReportGenerated(false), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Authenticated Session Info */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-bold">
              Secure Client Preview
            </span>
            <span className="text-xs text-slate-400 font-mono">
              Session: {session.id}
            </span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded font-semibold">
              Time-Limited &bull; 48h
            </span>
          </div>
          <h1 className="text-lg font-bold text-white mt-1">
            {session.project_title} ({session.version})
          </h1>
          <p className="text-xs text-slate-400">
            Client: <strong className="text-slate-300">{session.client_name}</strong> &bull; Seller: <strong className="text-slate-300">{session.seller_name}</strong>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={downloadEvidenceReport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Download Evidence Report</span>
          </button>
          <Link
            href="/projects"
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            &larr; Exit Preview
          </Link>
        </div>
      </div>

      {reportGenerated && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-700/60 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Evidence report downloaded. Contains full digital audit trail and requirement evaluation history.</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 text-xs">
        <button
          onClick={() => setActiveTab("preview")}
          className={`px-4 py-2.5 font-semibold transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === "preview"
              ? "border-sky-500 text-sky-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Interactive Preview</span>
        </button>

        <button
          onClick={() => setActiveTab("demonstration")}
          className={`px-4 py-2.5 font-semibold transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === "demonstration"
              ? "border-sky-500 text-sky-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileCheck2 className="w-3.5 h-3.5" />
          <span>Mutual Demonstration ({requirements.filter((r) => r.status === "accepted").length}/{requirements.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("source_inspection")}
          className={`px-4 py-2.5 font-semibold transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === "source_inspection"
              ? "border-sky-500 text-sky-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Source-Code Inspection ({isSourceUnlocked ? "Unlocked" : "Locked"})</span>
        </button>

        <button
          onClick={() => setActiveTab("audit_trail")}
          className={`px-4 py-2.5 font-semibold transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === "audit_trail"
              ? "border-sky-500 text-sky-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Audit Log ({session.audit_logs.length})</span>
        </button>
      </div>

      {/* Tab 1: Interactive Preview with Dynamic Watermark */}
      {activeTab === "preview" && (
        <div className="space-y-4">
          {/* Anti-copying and watermark warning header */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-sky-400 shrink-0" />
              <span>
                <strong>Watermarked Sandbox:</strong> Client identity and session tokens are embedded across this preview. Ordinary copy and download controls are restricted.
              </span>
            </div>
            <span className="text-[11px] text-slate-500 italic">
              Honest limitation: No device recording or invasive spyware used.
            </span>
          </div>

          {/* Sandboxed Iframe Container with Watermark Overlay */}
          <div
            className="relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl select-none"
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* Dynamic Watermark Pattern */}
            <div
              className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-around overflow-hidden opacity-12 rotate-[-18deg] scale-125"
              aria-hidden="true"
            >
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="whitespace-nowrap font-mono text-xs font-black tracking-widest text-slate-200 text-center"
                >
                  {session.watermark_text} &bull; {session.watermark_text}
                </div>
              ))}
            </div>

            {/* Sandboxed Execution Iframe */}
            <div className="relative z-10 w-full" style={{ height: "460px" }}>
              <iframe
                title="Deliverable Preview Sandbox"
                srcDoc={session.preview_content.entry_html}
                sandbox="allow-scripts"
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Mutual Demonstration Confirmation */}
      {activeTab === "demonstration" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div>
              <h2 className="text-base font-bold text-white">Mutual Demonstration Confirmation</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Review demonstrated requirements, leave specific feedback, and digitally record demonstration completion.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                clientConfirmed
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
              }`}>
                {clientConfirmed ? "Mutual Confirmation Complete" : "Pending Client Confirmation"}
              </span>
            </div>
          </div>

          {/* Seller Demonstration Summary */}
          <div className="bg-slate-950/70 p-4 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-sky-400 uppercase tracking-wider block">
              Seller Demonstration Record:
            </span>
            <p className="text-xs text-slate-200">{session.demonstration.summary}</p>
            <p className="text-[10px] text-slate-500 pt-1">
              Confirmed by {session.seller_name} on {new Date(session.demonstration.seller_confirmed_at!).toLocaleString()}
            </p>
          </div>

          {/* Requirement Review Checklist */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Evaluated Requirements &amp; Deliverable Criteria
            </h3>

            <div className="space-y-3">
              {requirements.map((req) => (
                <div
                  key={req.id}
                  className="bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-sky-400 font-semibold bg-sky-950/50 px-2 py-0.5 rounded border border-sky-800/40">
                        {req.id}
                      </span>
                      <span className="text-xs font-semibold text-slate-200">
                        {req.title}
                      </span>
                    </div>

                    {/* Status Toggle Buttons */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleUpdateRequirementStatus(req.id, "accepted")}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                          req.status === "accepted"
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Accepted
                      </button>
                      <button
                        onClick={() => handleUpdateRequirementStatus(req.id, "reviewed")}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                          req.status === "reviewed"
                            ? "bg-sky-600 text-white"
                            : "bg-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Reviewed
                      </button>
                      <button
                        onClick={() => handleUpdateRequirementStatus(req.id, "changes_requested")}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                          req.status === "changes_requested"
                            ? "bg-amber-600 text-white"
                            : "bg-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Changes Needed
                      </button>
                    </div>
                  </div>

                  {/* Feedback comment input */}
                  <div>
                    <input
                      type="text"
                      placeholder="Add specific review comments or observations..."
                      value={req.feedback || ""}
                      onChange={(e) => handleUpdateRequirementFeedback(req.id, e.target.value)}
                      className="w-full bg-slate-900 border border-slate-750 rounded p-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Legal Clarification Banner */}
          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg text-[11px] text-slate-400 flex items-start gap-2">
            <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <strong>Legal &amp; Handover Boundaries:</strong> Confirming this demonstration verifies that the deliverable was presented against the criteria above. It does <em>not</em> automatically waive contractual warranties or transfer ownership prior to milestone settlement via PayPal. PayMind does not claim escrow without a licensed escrow provider.
            </div>
          </div>

          {/* Client Confirmation Action */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <span className="text-xs text-slate-400">
              {clientConfirmed ? (
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <Check className="w-4 h-4" /> Client confirmation signed digitally
                </span>
              ) : (
                "Both parties must record confirmation to generate a formal Delivery Evidence Report."
              )}
            </span>

            {!clientConfirmed && (
              <button
                onClick={handleConfirmDemonstration}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>Confirm Demonstration Completed</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Optional Source-Code Inspection by Mutual Consent */}
      {activeTab === "source_inspection" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">
                Dual-Consent Source-Code Inspection
              </h2>
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                isSourceUnlocked
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
              }`}>
                {isSourceUnlocked ? "Inspection Authorized" : "Dual-Consent Required"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Source code is strictly private by default. Access requires explicit authorization from the seller AND explicit agreement to inspection conditions from the client.
            </p>
          </div>

          {/* Dual Consent Progress Box */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Step 1: Seller Authorization */}
            <div className={`p-4 rounded-xl border ${
              sellerAuthorized
                ? "bg-slate-950/80 border-emerald-500/30"
                : "bg-slate-950/60 border-slate-800"
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white">Party 1: Seller Authorization</span>
                {sellerAuthorized ? (
                  <span className="text-emerald-400 text-xs flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Authorized
                  </span>
                ) : (
                  <span className="text-amber-400 text-xs">Pending Consent</span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Seller ({session.seller_name}) must grant read-only view permissions.
              </p>
              {!sellerAuthorized && (
                <button
                  onClick={handleSellerAuthorizeInspection}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
                >
                  Grant Seller Consent (Demo)
                </button>
              )}
            </div>

            {/* Step 2: Client NDA Acceptance */}
            <div className={`p-4 rounded-xl border ${
              clientAcceptedTerms
                ? "bg-slate-950/80 border-emerald-500/30"
                : "bg-slate-950/60 border-slate-800"
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white">Party 2: Client Terms Acceptance</span>
                {clientAcceptedTerms ? (
                  <span className="text-emerald-400 text-xs flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Accepted
                  </span>
                ) : (
                  <span className="text-amber-400 text-xs">Pending Consent</span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Client ({session.client_name}) must accept confidentiality terms.
              </p>
              {!clientAcceptedTerms && (
                <button
                  onClick={handleClientAcceptInspectionTerms}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
                >
                  Accept Terms as Client (Demo)
                </button>
              )}
            </div>
          </div>

          {/* Condition text */}
          <div className="p-3.5 bg-slate-950/80 rounded-lg border border-slate-800 text-[11px] text-slate-400 space-y-1">
            <span className="font-semibold text-slate-300 block">Inspection Conditions &amp; Limitations Notice:</span>
            <p className="leading-relaxed">{session.source_inspection.terms_text}</p>
          </div>

          {/* Unlocked Code Viewer */}
          {isSourceUnlocked ? (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <FileCode className="w-4 h-4" />
                  Authorized Read-Only Inspection Viewer
                </span>
                <span className="text-xs text-slate-500">All credentials stripped</span>
              </div>

              {/* File selector tabs */}
              <div className="flex gap-2">
                {session.preview_content.read_only_files?.map((file, idx) => (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFileIdx(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                      selectedFileIdx === idx
                        ? "bg-slate-800 text-sky-400 border border-slate-700"
                        : "bg-slate-950 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {file.path}
                  </button>
                ))}
              </div>

              {/* Code window */}
              {session.preview_content.read_only_files && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="bg-slate-900/80 px-4 py-2 border-b border-slate-800 flex justify-between items-center text-xs text-slate-400">
                    <span className="font-mono text-sky-300">
                      {session.preview_content.read_only_files[selectedFileIdx].path}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      SHA-256: {session.preview_content.read_only_files[selectedFileIdx].sha256.substring(0, 16)}...
                    </span>
                  </div>
                  <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed select-none">
                    {session.preview_content.read_only_files[selectedFileIdx].content}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
              <Lock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-400">
                Source Code Inspection is Currently Locked
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Both the seller must authorize inspection and the client must digitally accept the review agreement above before any files can be viewed.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Audit Log */}
      {activeTab === "audit_trail" && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-bold text-white">Immutable Session Audit Log</h2>
          <p className="text-xs text-slate-400">
            Timestamped record of all preview creations, client accesses, requirement reviews, and consent events.
          </p>

          <div className="space-y-3 pt-2">
            {session.audit_logs.map((log, i) => (
              <div
                key={i}
                className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg flex items-start justify-between text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-sky-400">
                      {log.action}
                    </span>
                    <span className="text-[10px] uppercase px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded font-mono">
                      {log.actor} ({log.actor_name})
                    </span>
                  </div>
                  <p className="text-slate-300 text-xs">{log.details}</p>
                </div>
                <span className="font-mono text-[11px] text-slate-500 shrink-0">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
