"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardCheck, Download, FileArchive, FileSearch, FileText, Info, LoaderCircle, ShieldAlert, UploadCloud } from "lucide-react";
import { DemoModeBanner } from "@/components/workspace/DemoModeBanner";
import { useDemoWorkspace } from "@/lib/workspace/use-demo-workspace";
import { updateDemoWorkspaceState, visibleProjects } from "@/lib/workspace/workspace-store";
import { newId, type WorkspaceDeliveryFinding, type WorkspaceDeliveryReview } from "@/lib/workspace/workspace-types";

interface DeliveryApiResult {
  analysisMode: "ai_assisted" | "deterministic_fallback";
  summary: string;
  fileName: string;
  fileSizeBytes: number;
  sha256: string;
  inspectedFiles: Array<{ path: string; sizeBytes: number }>;
  skippedFileCount: number;
  findings: WorkspaceDeliveryFinding[];
  limitations: string[];
  reviewedAt: string;
  disclaimer: string;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function statusStyle(status: WorkspaceDeliveryFinding["status"]): string {
  if (status === "evidence_found") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "not_found_in_uploaded_files") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function statusLabel(status: WorkspaceDeliveryFinding["status"]): string {
  if (status === "evidence_found") return "Evidence found";
  if (status === "not_found_in_uploaded_files") return "Not found in inspected files";
  return "Needs human review";
}

function DeliveryCheckContent() {
  const searchParams = useSearchParams();
  const workspace = useDemoWorkspace();
  const projects = visibleProjects(workspace);
  const requestedProjectId = searchParams.get("projectId") || "";
  const requestedMilestoneId = searchParams.get("milestoneId") || "";
  const [projectId, setProjectId] = useState(requestedProjectId);
  const selectedProject = projects.find((project) => project.id === projectId) || projects[0] || null;
  const [milestoneId, setMilestoneId] = useState(requestedMilestoneId);
  const selectedMilestone = selectedProject?.milestones.find((milestone) => milestone.id === milestoneId) || selectedProject?.milestones[0] || null;
  const [file, setFile] = useState<File | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [additionalRequirements, setAdditionalRequirements] = useState("");
  const [providerConsent, setProviderConsent] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeliveryApiResult | null>(null);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

  useEffect(() => {
    if (requestedProjectId && projects.some((project) => project.id === requestedProjectId)) {
      const timer = window.setTimeout(() => setProjectId(requestedProjectId), 0);
      return () => window.clearTimeout(timer);
    }
  }, [requestedProjectId, projects]);

  useEffect(() => {
    if (requestedMilestoneId && selectedProject?.milestones.some((milestone) => milestone.id === requestedMilestoneId)) {
      const timer = window.setTimeout(() => setMilestoneId(requestedMilestoneId), 0);
      return () => window.clearTimeout(timer);
    }
  }, [requestedMilestoneId, selectedProject]);

  const requirements = useMemo(() => {
    const fromContract = selectedProject?.contractRequirements || [];
    const fromMilestone = selectedMilestone ? [selectedMilestone.deliverables || "", selectedMilestone.acceptanceCriteria || ""] : [];
    const extra = additionalRequirements.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    return [...new Set([...fromContract, ...fromMilestone, ...extra].map((item) => item.trim()).filter(Boolean))].slice(0, 30);
  }, [selectedProject, selectedMilestone, additionalRequirements]);

  const history = workspace.deliveryReviews
    .filter((review) => review.projectId === selectedProject?.id && (!selectedMilestone || review.milestoneId === selectedMilestone.id))
    .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResult(null);
    if (!selectedProject || !selectedMilestone) return setError("Choose a project and milestone first.");
    if (!file) return setError("Choose the files you want PayMind to inspect.");
    if (!requirements.length) return setError("No requirements are linked to this milestone. Add acceptance criteria or additional requirements first.");
    if (!providerConsent) return setError("Confirm that you are authorized to submit these files for AI-assisted review.");
    if (file.size > 8 * 1024 * 1024) return setError("The file is larger than the 8 MB limit.");

    setIsReviewing(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("projectName", selectedProject.name);
      form.set("milestoneName", selectedMilestone.title);
      form.set("milestoneDescription", selectedMilestone.description || "");
      form.set("acceptanceCriteria", selectedMilestone.acceptanceCriteria || "");
      form.set("contractText", selectedProject.contractText || "");
      form.set("requirements", JSON.stringify(requirements));
      form.set("deliveryNotes", deliveryNotes);
      const response = await fetch("/api/intelligence/delivery-review", { method: "POST", body: form });
      const payload = await response.json() as DeliveryApiResult;
      if (!response.ok) throw new Error(payload.error || "Delivery check could not be completed.");
      setResult(payload);
      const saved: WorkspaceDeliveryReview = {
        id: newId("delivery_review"),
        projectId: selectedProject.id,
        milestoneId: selectedMilestone.id,
        projectName: selectedProject.name,
        milestoneName: selectedMilestone.title,
        fileName: payload.fileName,
        fileSizeBytes: payload.fileSizeBytes,
        sha256: payload.sha256,
        analysisMode: payload.analysisMode,
        summary: payload.summary,
        findings: payload.findings,
        inspectedFiles: payload.inspectedFiles,
        skippedFileCount: payload.skippedFileCount,
        limitations: payload.limitations,
        disclaimer: payload.disclaimer,
        reviewedAt: payload.reviewedAt,
        isDemo: true,
      };
      updateDemoWorkspaceState((current) => ({ ...current, deliveryReviews: [saved, ...current.deliveryReviews].slice(0, 50) }));
      setActiveHistoryId(saved.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Delivery check failed. Please try again.");
    } finally {
      setIsReviewing(false);
    }
  };

  const downloadReport = () => {
    if (!result || !selectedProject || !selectedMilestone) return;
    const report = {
      reportType: "PayMind AI-assisted delivery evidence review",
      project: selectedProject.name,
      milestone: selectedMilestone.title,
      generatedAt: result.reviewedAt,
      ...result,
      notice: "This report records text evidence from an uploaded submission. It is not a functional test, security certification, legal opinion, or acceptance decision.",
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `paymind-delivery-evidence-${selectedProject.id}-${selectedMilestone.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const evidenceCount = result?.findings.filter((finding) => finding.status === "evidence_found").length || 0;
  const missingCount = result?.findings.filter((finding) => finding.status === "not_found_in_uploaded_files").length || 0;
  const reviewCount = result?.findings.filter((finding) => finding.status === "needs_human_review").length || 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">PayMind intelligence</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">AI Contract-to-Delivery Check</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Compare submitted work with the contract and milestone requirements. PayMind looks for supporting evidence and highlights what a person still needs to verify.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/contracts" className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Review contract <ArrowRight className="h-3.5 w-3.5" /></Link>
          <Link href="/scope-changes" className="inline-flex items-center gap-2 self-start rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100">Check a new client request</Link>
        </div>
      </header>

      <DemoModeBanner view={workspace.view} />

      <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.35fr)]">
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><FileSearch className="h-5 w-5 text-sky-700" /><h2 className="text-base font-semibold text-slate-950">Compare contract requirements with a delivery</h2></div>
          {projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">Add a project and milestone before running a delivery check. <Link href="/projects" className="font-semibold text-sky-700 underline">Go to Projects</Link>.</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-xs font-semibold text-slate-700">Project
                <select value={selectedProject?.id || ""} onChange={(event) => { setProjectId(event.target.value); setMilestoneId(""); setResult(null); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100">
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name} — {project.clientName}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-700">Milestone
                <select value={selectedMilestone?.id || ""} onChange={(event) => { setMilestoneId(event.target.value); setResult(null); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100">
                  {selectedProject?.milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.phase}: {milestone.title}</option>)}
                </select>
              </label>

              <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
                <p className="text-xs font-semibold text-sky-950">Requirements being checked ({requirements.length})</p>
                {requirements.length ? <ul className="mt-2 space-y-1.5 text-xs leading-5 text-sky-900">{requirements.map((requirement, index) => <li key={`${requirement}-${index}`} className="flex gap-2"><span>•</span><span>{requirement}</span></li>)}</ul> : <p className="mt-1 text-xs text-sky-900">No saved contract or milestone criteria yet. Add requirements below or review and save the contract first.</p>}
              </div>

              <label className="block text-xs font-semibold text-slate-700">Additional requirements (one per line)
                <textarea value={additionalRequirements} onChange={(event) => setAdditionalRequirements(event.target.value)} rows={3} maxLength={6000} placeholder="Example: The contact form should include name, email and message fields." className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
              </label>

              <label className="block text-xs font-semibold text-slate-700">Upload deliverable (ZIP or readable text file)
                <span className="mt-1.5 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 transition hover:border-sky-400 hover:bg-sky-50">
                  <UploadCloud className="h-7 w-7 shrink-0 text-sky-700" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-800">{file ? file.name : "Choose deliverable files"}</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-slate-500">ZIP, TXT, MD, HTML, CSS, JS, TS, JSON or CSV · 8 MB maximum</span>
                    {file && <span className="mt-1 block text-[11px] text-slate-500">{formatBytes(file.size)}</span>}
                  </span>
                  <FileArchive className="h-5 w-5 text-slate-400" />
                  <input type="file" accept=".zip,.txt,.md,.html,.htm,.css,.js,.jsx,.ts,.tsx,.json,.csv,.xml,.yml,.yaml,.sql,.py,.java,.go,.rs,.php,.sh,.toml,.ini" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] || null)} />
                </span>
              </label>

              <label className="block text-xs font-semibold text-slate-700">Delivery notes (optional)
                <textarea value={deliveryNotes} onChange={(event) => setDeliveryNotes(event.target.value)} rows={3} maxLength={2000} placeholder="Describe what changed in this delivery or where the client should look." className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
              </label>

              <a href="/paymind-sample-delivery.zip" download className="inline-flex items-center gap-2 text-xs font-semibold text-sky-800 underline decoration-sky-300 underline-offset-4 hover:text-sky-950">
                <Download className="h-3.5 w-3.5" /> Download a sample delivery ZIP for the demo
              </a>

              <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
                <input type="checkbox" checked={providerConsent} onChange={(event) => setProviderConsent(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-600" />
                <span>I am authorized to submit these files and contract requirements for review. If AI is configured, inspected text and the supplied requirements will be sent to PayMind&apos;s configured Gemini or OpenAI provider. Credential-like values are redacted where detected, but I will not upload secrets or highly sensitive personal/payment information.</span>
              </label>

              <button type="submit" disabled={isReviewing || !file || !selectedMilestone || !providerConsent} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">
                {isReviewing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                {isReviewing ? "Checking submitted evidence…" : "Run contract-to-delivery check"}
              </button>
              {error && <p role="alert" className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
            </form>
          )}
          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> Uploaded code is inspected as text only. PayMind does not execute it, certify it as safe, or prove that the application works. Sensitive files and build/dependency folders are skipped. When AI is configured, inspected text, project/milestone context and requirements are sent to your configured Gemini/OpenAI provider after best-effort credential redaction. Do not upload secrets or highly sensitive private customer data.
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-base font-semibold text-slate-950">Delivery evidence report</h2><p className="mt-1 text-xs text-slate-500">Evidence-based observations, not an automatic acceptance decision.</p></div>
            {result && <button type="button" onClick={downloadReport} className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-3.5 w-3.5" /> Download report</button>}
          </div>

          {!result ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700"><FileText className="h-6 w-6" /></div>
              <h3 className="text-sm font-semibold text-slate-900">Your contract-to-delivery report will appear here</h3>
              <p className="mt-2 max-w-md text-xs leading-5 text-slate-500">Choose a project milestone and upload the freelancer's submission. PayMind will compare visible file evidence with the saved contract requirements and acceptance criteria.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase text-sky-800">{result.analysisMode === "ai_assisted" ? "AI-assisted review" : "Text-match fallback"}</span><span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600">Demo report</span></div>
                <p className="mt-3 text-sm leading-6 text-slate-800">{result.summary}</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-emerald-50 p-3 text-center"><p className="text-xl font-bold text-emerald-800">{evidenceCount}</p><p className="text-[10px] font-semibold text-emerald-800">Evidence found</p></div>
                  <div className="rounded-lg bg-rose-50 p-3 text-center"><p className="text-xl font-bold text-rose-800">{missingCount}</p><p className="text-[10px] font-semibold text-rose-800">Not found</p></div>
                  <div className="rounded-lg bg-amber-50 p-3 text-center"><p className="text-xl font-bold text-amber-900">{reviewCount}</p><p className="text-[10px] font-semibold text-amber-900">Review needed</p></div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-900">Submitted file</h3><span className="text-[11px] text-slate-500">{formatBytes(result.fileSizeBytes)}</span></div>
                <p className="mt-1 break-all text-xs font-medium text-slate-700">{result.fileName}</p>
                <p className="mt-2 break-all font-mono text-[10px] text-slate-500">SHA-256: {result.sha256}</p>
                <p className="mt-2 text-xs text-slate-600">Inspected {result.inspectedFiles.length} text file(s); skipped {result.skippedFileCount} file(s).</p>
                <ul className="mt-2 max-h-28 space-y-1 overflow-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">{result.inspectedFiles.map((item) => <li key={item.path} className="flex justify-between gap-3"><span className="break-all">{item.path}</span><span className="shrink-0">{formatBytes(item.sizeBytes)}</span></li>)}</ul>
              </div>

              <div className="space-y-3">
                {result.findings.map((finding, index) => (
                  <article key={`${finding.requirement}-${index}`} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-900">{finding.requirement}</h3><span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusStyle(finding.status)}`}>{statusLabel(finding.status)}</span></div>
                    <p className="mt-2 text-xs leading-5 text-slate-600">{finding.explanation}</p>
                    {finding.evidence.map((evidence, evidenceIndex) => <blockquote key={`${evidence.filePath}-${evidenceIndex}`} className="mt-2 rounded-lg bg-slate-50 p-3 text-[11px] leading-5 text-slate-700"><strong className="block break-all text-sky-800">{evidence.filePath}</strong><span className="mt-1 block italic">“{evidence.quote}”</span></blockquote>)}
                    <p className="mt-2 text-xs leading-5 text-sky-800"><strong>Next step:</strong> {finding.suggestedNextStep}</p>
                  </article>
                ))}
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="flex items-center gap-2 text-xs font-semibold text-amber-950"><Info className="h-4 w-4" /> Review limitations</h3>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-5 text-amber-900">{result.limitations.map((limitation, index) => <li key={`${limitation}-${index}`}>{limitation}</li>)}</ul>
                <p className="mt-3 border-t border-amber-200 pt-3 text-[11px] leading-5 text-amber-950">{result.disclaimer}</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {history.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-slate-950">Previous delivery checks</h2><p className="mt-1 text-xs text-slate-500">Saved in this browser's demo workspace.</p></div><span className="text-xs text-slate-500">{history.length} report(s)</span></div>
          <div className="mt-3 divide-y divide-slate-100">{history.map((item) => <button key={item.id} type="button" onClick={() => { setActiveHistoryId(item.id); setResult({ analysisMode: item.analysisMode, summary: item.summary, fileName: item.fileName, fileSizeBytes: item.fileSizeBytes, sha256: item.sha256, inspectedFiles: item.inspectedFiles, skippedFileCount: item.skippedFileCount, findings: item.findings, limitations: item.limitations, disclaimer: item.disclaimer, reviewedAt: item.reviewedAt }); }} className={`flex w-full flex-col gap-1 py-3 text-left sm:flex-row sm:items-center sm:justify-between ${activeHistoryId === item.id ? "bg-sky-50 px-3" : "hover:bg-slate-50"}`}><span><span className="block text-sm font-semibold text-slate-800">{item.fileName}</span><span className="mt-0.5 block text-[11px] text-slate-500">{item.milestoneName} · {new Date(item.reviewedAt).toLocaleString()}</span></span><span className="text-[10px] font-semibold text-slate-500">{item.analysisMode === "ai_assisted" ? "AI-assisted" : "Fallback"} · demo report</span></button>)}</div>
          <p className="mt-2 text-[10px] text-slate-500">Previous reports are retained in this browser and can be downloaded again by selecting one.</p>
        </section>
      )}
    </div>
  );
}

export default function DeliverablesPage() {
  return <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading delivery check…</div>}><DeliveryCheckContent /></Suspense>;
}
