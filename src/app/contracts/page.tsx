"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { FormEvent } from "react";
import { AlertCircle, CheckCircle2, FileText, LoaderCircle, PencilLine, ShieldCheck } from "lucide-react";
import { DemoModeBanner } from "@/components/workspace/DemoModeBanner";
import { useDemoWorkspace } from "@/lib/workspace/use-demo-workspace";
import { updateDemoWorkspaceState, visibleProjects } from "@/lib/workspace/workspace-store";
import { defaultContractItems } from "@/lib/workspace/workspace-types";

type TermStatus = "explicit" | "inferred" | "missing";
type Confidence = "high" | "medium" | "low";
type TermValue = {
  value: string | null;
  status?: TermStatus;
  confidence?: Confidence;
  evidence?: string | null;
  userEdited?: boolean;
};

type Finding = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  explanation: string;
  recommendation: string;
  evidence: string | null;
};

type ContractAnalysis = {
  analysisMode?: string;
  extractionWarning?: string;
  riskScore?: number;
  riskLevel?: "high" | "medium" | "low";
  terms?: {
    clientName?: TermValue | string | null;
    freelancerName?: TermValue | string | null;
    projectScope?: TermValue | string | null;
    currency?: TermValue | string | null;
    totalAmount?: TermValue | string | null;
    paymentTerms?: TermValue | string | null;
    paymentSchedule?: TermValue | string | null;
    deliveryDeadlines?: TermValue | string | null;
    deadline?: TermValue | string | null;
    acceptanceCriteria?: TermValue | string | null;
    revisionLimit?: TermValue | string | null;
    cancellationTerms?: TermValue | string | null;
    latePaymentTerms?: TermValue | string | null;
    intellectualPropertyTerms?: TermValue | string | null;
    disputeResolution?: TermValue | string | null;
    disputeTerms?: TermValue | string | null;
    governingLaw?: TermValue | string | null;
    deliverables?: Array<string | { description: string; status?: TermStatus; confidence?: Confidence; evidence?: string | null }>;
    milestones?: Array<{ description: string; amount: string | null; currency?: string | null; due: string | null; status?: TermStatus; confidence?: Confidence; evidence?: string | null }>;
    missingInformation?: string[];
    evidenceQuotes?: Array<{ field: string; quote: string }>;
  };
  findings?: Finding[];
  disclaimer?: string;
  error?: string;
};

function toTerm(value: TermValue | string | null | undefined): TermValue {
  if (value == null) return { value: null, status: "missing", confidence: "low", evidence: null };
  if (typeof value === "string") return { value, status: "explicit", confidence: "medium", evidence: null };
  return {
    value: value.value ?? null,
    status: value.status ?? (value.value ? "explicit" : "missing"),
    confidence: value.confidence ?? (value.value ? "medium" : "low"),
    evidence: value.evidence ?? null,
    userEdited: value.userEdited,
  };
}

function termLabel(term: TermValue): string {
  if (term.status === "missing" || !term.value) return "Missing";
  return term.value;
}

function statusTone(term: TermValue): string {
  if (term.userEdited) return "bg-sky-50 text-sky-800 border-sky-200";
  if (term.status === "missing") return "bg-rose-50 text-rose-800 border-rose-200";
  if (term.status === "inferred") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-emerald-50 text-emerald-800 border-emerald-200";
}

export default function ContractsPage() {
  const workspace = useDemoWorkspace();
  const projects = useMemo(() => (workspace.view === "client" ? visibleProjects(workspace) : workspace.projects), [workspace]);
  const [activeTab, setActiveTab] = useState<"analysis" | "simulator">("analysis");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const effectiveProjectId = selectedProjectId && projects.some((p) => p.id === selectedProjectId) ? selectedProjectId : (projects[0]?.id || "");
  const selectedProject = projects.find((p) => p.id === effectiveProjectId);
  const [contractText, setContractText] = useState("");
  const [providerConsent, setProviderConsent] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<ContractAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    setContractText(selectedProject?.contractText || "");
    setAnalysisResult(null);
    setError(null);
  }, [selectedProject?.id]);

  const handleAnalyze = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!providerConsent) {
      setError("Confirm that you are authorized to submit this agreement for AI-assisted review.");
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    try {
      const response = await fetch("/api/intelligence/contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractText,
          projectType: selectedProject?.description || "Digital freelance project",
          clientName: selectedProject?.clientName,
          currency: selectedProject?.currency,
        }),
      });
      const payload = (await response.json()) as ContractAnalysis;
      if (!response.ok) throw new Error(payload.error || "Contract analysis could not be completed.");
      setAnalysisResult(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Contract analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const terms = analysisResult?.terms || {};
  const termRows: Array<[string, string, TermValue]> = [
    ["clientName", "Client", toTerm(terms.clientName)],
    ["freelancerName", "Freelancer", toTerm(terms.freelancerName)],
    ["projectScope", "Project scope", toTerm(terms.projectScope)],
    ["totalAmount", "Amount", toTerm(terms.totalAmount ?? null)],
    ["currency", "Currency", toTerm(terms.currency)],
    ["paymentTerms", "Payment terms", toTerm(terms.paymentTerms)],
    ["paymentSchedule", "Payment schedule", toTerm(terms.paymentSchedule)],
    ["deliveryDeadlines", "Delivery deadlines", toTerm(terms.deliveryDeadlines ?? terms.deadline)],
    ["acceptanceCriteria", "Acceptance criteria", toTerm(terms.acceptanceCriteria)],
    ["revisionLimit", "Revision limit", toTerm(terms.revisionLimit)],
    ["latePaymentTerms", "Late payment terms", toTerm(terms.latePaymentTerms)],
    ["cancellationTerms", "Cancellation terms", toTerm(terms.cancellationTerms)],
    ["intellectualPropertyTerms", "Intellectual property", toTerm(terms.intellectualPropertyTerms)],
    ["disputeResolution", "Dispute resolution", toTerm(terms.disputeResolution ?? terms.disputeTerms)],
    ["governingLaw", "Governing law", toTerm(terms.governingLaw)],
  ];

  const missingInformation = useMemo(() => {
    const fromApi = Array.isArray(terms.missingInformation) ? terms.missingInformation : [];
    const fromTerms = termRows.filter(([, , term]) => term.status === "missing" || !term.value).map(([, label]) => label);
    return Array.from(new Set([...fromApi, ...fromTerms]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms.missingInformation, analysisResult]);

  const startEdit = (field: string, term: TermValue) => {
    setEditingField(field);
    setEditValue(term.value || "");
  };

  const saveEdit = () => {
    if (!analysisResult || !editingField) return;
    setAnalysisResult((current) => {
      if (!current) return current;
      const nextTerms = { ...(current.terms || {}) } as Record<string, unknown>;
      nextTerms[editingField] = { value: editValue.trim() || null, status: editValue.trim() ? "explicit" : "missing", confidence: "high", evidence: toTerm(nextTerms[editingField] as TermValue | string | null).evidence ?? null, userEdited: true };
      return { ...current, terms: nextTerms as ContractAnalysis["terms"] };
    });
    setEditingField(null);
    setEditValue("");
  };

  const saveToProject = () => {
    if (!selectedProject || !analysisResult) return;
    const now = new Date().toISOString();
    updateDemoWorkspaceState((current) => ({
      ...current,
      projects: current.projects.map((p) => {
        if (p.id !== selectedProject.id) return p;
        const items = (p.contractItems?.length ? p.contractItems : defaultContractItems()).map((item) => {
          const label = item.label.toLowerCase();
          const matched = termRows.find(([, termLabel]) => {
            const key = termLabel.toLowerCase().split(" ")[0] || "";
            return key.length > 2 && label.includes(key);
          });
          if (!matched) return item;
          const term = matched[2];
          if (term.status === "missing" || !term.value) {
            return { ...item, status: "missing" as const, review: "needs_clarification" as const, note: item.note || "Flagged by contract analysis (manual review required)." };
          }
          return { ...item, status: "provided" as const, review: item.review === "not_reviewed" ? "reviewed" as const : item.review, note: item.note || "Extracted from contract analysis; verify against original agreement." };
        });
        const extractedRequirements = [
          ...(analysisResult.terms?.deliverables || []),
          ...(analysisResult.terms?.milestones || []).map((milestone) => milestone.description),
          toTerm(analysisResult.terms?.projectScope).value || "",
          toTerm(analysisResult.terms?.acceptanceCriteria).value || "",
        ].map((item) => item.trim()).filter(Boolean);
        return {
          ...p,
          updatedAt: now,
          contractItems: items,
          contractText: contractText.slice(0, 60_000),
          contractRequirements: [...new Set(extractedRequirements)].slice(0, 30),
          contractAnalysisUpdatedAt: now,
        };
      }),
    }));
  };

  const riskStyles = analysisResult?.riskLevel === "high"
    ? "bg-rose-50 text-rose-800 border-rose-200"
    : analysisResult?.riskLevel === "medium"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-emerald-50 text-emerald-800 border-emerald-200";

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-950">Contracts &amp; Agreements</h1>
          <p className="mt-1 text-sm text-slate-600">Analyze contract terms, review missing clauses, and associate findings with a project. Findings are decision support, not legal advice.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/scope-changes" className="w-fit rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100">Check a new client request</Link>
          <Link href="/deliverables" className="w-fit rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Check submitted delivery</Link>
        </div>
      </header>

      <DemoModeBanner view={workspace.view} />

      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 text-sm">
        <button onClick={() => setActiveTab("analysis")} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 font-semibold transition ${activeTab === "analysis" ? "border-sky-700 text-sky-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
          <FileText className="h-4 w-4" /> Contract analysis
        </button>
        <button onClick={() => setActiveTab("simulator")} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 font-semibold transition ${activeTab === "simulator" ? "border-sky-700 text-sky-800" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
          <ShieldCheck className="h-4 w-4" /> Payment structure simulator
        </button>
      </div>

      {activeTab === "analysis" && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.5fr)]">
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Client proposal or contract</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">Paste the agreement to extract terms, identify missing clauses, and highlight payment/scope risk. Review and correct extracted values before relying on them.</p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Associate with project (optional)</span>
              <select value={effectiveProjectId} onChange={(e) => setSelectedProjectId(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100">
                <option value="">No project selected</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.clientName}</option>)}
              </select>
            </label>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700">Agreement text</span>
              <button type="button" onClick={() => setContractText(`Software Development Agreement:
Client: Example Client Ltd.
Freelancer will deliver a responsive five-page marketing website with a contact form and CMS editing.
Total fee: USD 2,400, payable USD 800 at kickoff, USD 800 after design approval, and USD 800 after final delivery.
Design draft due 14 days after kickoff; final delivery due 30 days after kickoff.
Two rounds of revisions are included. Additional scope requires written approval and a separate quote.
The client has five business days to review each milestone and provide written acceptance or a list of specific changes.
Intellectual property transfers after full payment. Disputes should first be discussed in good faith; governing law is not specified.`)} className="text-[11px] font-semibold text-sky-700 hover:text-sky-900">Load example agreement</button>
            </div>
            <form onSubmit={handleAnalyze} className="space-y-3">
              <textarea
                rows={13}
                value={contractText}
                onChange={(event) => setContractText(event.target.value)}
                className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                placeholder="Paste contract text here…"
              />
              <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                <input type="checkbox" checked={providerConsent} onChange={(event) => setProviderConsent(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-600" />
                <span>I am authorized to submit this agreement for review. If an AI provider is configured, the contract text will be sent to the selected Gemini or OpenAI service for extraction. Do not submit confidential information unless you are permitted to share it.</span>
              </label>
              <button type="submit" disabled={isAnalyzing || contractText.trim().length < 80 || !providerConsent} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">
                {isAnalyzing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {isAnalyzing ? "Analyzing contract…" : "Analyze agreement"}
              </button>
              <p className="text-[11px] text-slate-400">At least 80 characters. Uses the existing server-side intelligence endpoint. Extraction may be incomplete; verify against the original contract.</p>
            </form>
            {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
          </section>

          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {!analysisResult ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><FileText className="h-5 w-5" /></div>
                <h2 className="text-base font-semibold text-slate-900">Your contract review will appear here</h2>
                <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">PayMind will extract available terms, label explicit/inferred/missing fields, and show evidence-backed findings after you submit the agreement.</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Contract risk review</p>
                    <h2 className="mt-1 text-lg font-bold capitalize text-slate-950">{analysisResult.riskLevel || "unknown"} risk · {analysisResult.riskScore ?? "—"}/100</h2>
                    <p className="mt-1 text-xs text-slate-500">{analysisResult.analysisMode || "Analysis completed"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedProject && <button type="button" onClick={saveToProject} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Save findings to project</button>}
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${riskStyles}`}>{analysisResult.riskLevel || "unknown"} risk</span>
                  </div>
                </div>

                {missingInformation.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-900">Missing or unclear information ({missingInformation.length})</p>
                    <p className="mt-1 text-xs leading-5 text-amber-900">{missingInformation.join(" · ")}</p>
                  </div>
                )}

                <div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">Extracted terms</h3>
                    <p className="text-[11px] text-slate-500">Explicit, inferred, or missing. Edit values if extraction is wrong.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {termRows.map(([field, label, term]) => (
                      <div key={field} className="rounded-xl bg-slate-50 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[11px] font-medium text-slate-500">{label}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(term)}`}>{term.userEdited ? "edited" : term.status || "missing"}{term.confidence ? ` · ${term.confidence}` : ""}</span>
                        </div>
                        {editingField === field ? (
                          <div className="mt-2 space-y-2">
                            <input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800" />
                            <div className="flex gap-2">
                              <button type="button" onClick={saveEdit} className="rounded-lg bg-sky-700 px-2.5 py-1.5 text-[11px] font-semibold text-white">Save</button>
                              <button type="button" onClick={() => setEditingField(null)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="mt-1 line-clamp-4 text-xs font-semibold leading-5 text-slate-800">{termLabel(term)}</p>
                            {term.evidence && <p className="mt-1 line-clamp-2 text-[11px] italic text-slate-500">Evidence: “{term.evidence}”</p>}
                            <button type="button" onClick={() => startEdit(field, term)} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-sky-800 hover:text-sky-900"><PencilLine className="h-3 w-3" /> Edit value</button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {(Array.isArray(terms.deliverables) && terms.deliverables.length > 0) && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-900">Deliverables / scope signals</h3>
                    <ul className="space-y-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                      {terms.deliverables.map((item, i) => {
                        const description = typeof item === "string" ? item : item.description;
                        const evidence = typeof item === "string" ? null : item.evidence;
                        const status = typeof item === "string" ? "explicit" : item.status || "explicit";
                        return <li key={`${description}-${i}`} className="py-1">• {description}{status !== "explicit" && <span className="ml-2 text-[10px] font-semibold uppercase text-amber-700">{status}</span>}{evidence && <span className="mt-1 block pl-3 text-[11px] italic text-slate-500">Evidence: “{evidence}”</span>}</li>;
                      })}
                    </ul>
                  </div>
                )}

                <div>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">Findings and suggested actions</h3>
                    <span className="text-xs text-slate-500">{analysisResult.findings?.length || 0} found</span>
                  </div>
                  {(analysisResult.findings?.length || 0) > 0 ? (
                    <div className="space-y-3">
                      {analysisResult.findings!.map((finding) => (
                        <article key={finding.id} className="rounded-xl border border-slate-200 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${finding.severity === "high" ? "bg-rose-50 text-rose-800" : finding.severity === "medium" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{finding.severity}</span>
                            <h4 className="text-sm font-semibold text-slate-900">{finding.title}</h4>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-600">{finding.explanation}</p>
                          {finding.evidence && <blockquote className="mt-2 rounded-lg bg-slate-50 p-2 text-xs italic text-slate-600">“{finding.evidence}”</blockquote>}
                          <p className="mt-2 text-xs leading-5 text-sky-800"><strong>Suggested action:</strong> {finding.recommendation}</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" /> No issues were identified by the current checks. This is not a legal approval.</div>
                  )}
                </div>

                <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  {analysisResult.extractionWarning || "Extraction can be incomplete. Verify important amounts, dates, deliverables, and clauses against the original agreement."} {analysisResult.disclaimer || "These findings are decision support, not legal advice."}
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === "simulator" && (
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-base font-semibold text-slate-900">What-if payment structure simulator</h2>
            <p className="mt-1 text-sm text-slate-500">Compare common payment schedules and understand the share of project value left unpaid at each stage.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <article className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
              <span className="text-[11px] font-bold uppercase tracking-wide text-rose-700">High exposure</span>
              <h3 className="mt-2 text-base font-semibold text-slate-900">100% at final delivery</h3>
              <p className="mt-2 text-sm text-slate-600">Maximum unpaid exposure</p>
              <p className="mt-1 text-2xl font-bold text-rose-800">$3,200 <span className="text-sm font-medium">(100%)</span></p>
              <p className="mt-3 text-xs leading-5 text-slate-500">All project work is completed before any payment is received.</p>
            </article>
            <article className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <span className="text-[11px] font-bold uppercase tracking-wide text-amber-800">Moderate exposure</span>
              <h3 className="mt-2 text-base font-semibold text-slate-900">50% deposit / 50% final</h3>
              <p className="mt-2 text-sm text-slate-600">Maximum unpaid exposure</p>
              <p className="mt-1 text-2xl font-bold text-amber-800">$1,600 <span className="text-sm font-medium">(50%)</span></p>
              <p className="mt-3 text-xs leading-5 text-slate-500">The deposit covers part of kickoff work, with the remaining balance due at final handover.</p>
            </article>
            <article className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Lower exposure example</span>
              <h3 className="mt-2 text-base font-semibold text-slate-900">30% / 40% / 30% milestones</h3>
              <p className="mt-2 text-sm text-slate-600">Initial unpaid exposure</p>
              <p className="mt-1 text-2xl font-bold text-emerald-800">$960 <span className="text-sm font-medium">(30%)</span></p>
              <p className="mt-3 text-xs leading-5 text-slate-500">Payments are split across kickoff, a core delivery checkpoint and final handover.</p>
            </article>
          </div>
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">Illustrative comparison based on a $3,200 project. Actual unpaid exposure depends on work completed, invoice timing and verified payments. This comparison does not hold or escrow funds.</p>
        </section>
      )}
    </div>
  );
}
