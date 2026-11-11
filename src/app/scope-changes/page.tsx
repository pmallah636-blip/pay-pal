"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardCopy, FileDiff, LoaderCircle, ShieldCheck } from "lucide-react";
import { DemoModeBanner } from "@/components/workspace/DemoModeBanner";
import { useDemoWorkspace } from "@/lib/workspace/use-demo-workspace";
import { visibleProjects } from "@/lib/workspace/workspace-store";

type ScopeResult = {
  classification: "likely_in_scope" | "potential_scope_change" | "unclear";
  headline: string; summary: string; includedWork: string[]; additionalWork: string[]; unclearPoints: string[];
  evidence: Array<{ contractQuote: string; relevance: string }>;
  suggestedQuestions: string[];
  changeOrderDraft: { title: string; scope: string; deadlineImpact: string; priceImpact: string; approvalNote: string };
  analysisMode: "ai_assisted" | "manual_fallback";
};

export default function ScopeChangesPage() {
  const workspace = useDemoWorkspace();
  const projects = useMemo(() => visibleProjects(workspace), [workspace]);
  const [projectId, setProjectId] = useState("");
  const project = projects.find((item) => item.id === projectId) || projects[0] || null;
  const [requestText, setRequestText] = useState("");
  const [contractOverride, setContractOverride] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScopeResult | null>(null);
  const contractText = contractOverride || project?.contractText || "";

  async function analyse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setResult(null);
    if (!consent) { setError("Confirm that you are authorized to submit the agreement and new request for AI-assisted comparison."); return; }
    if (contractText.trim().length < 40) { setError("This project has no saved agreement. Paste the original contract below before comparing the request."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/intelligence/scope-change", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectName: project?.name || "Unassigned project", contractText, originalScope: project?.contractRequirements?.join("\n") || "", newRequest: requestText, currentDeadline: project?.overallDeadline || "Not specified", currentBudget: project ? `${project.currency} ${project.totalAmount}` : "Not specified" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Comparison failed.");
      setResult(data as ScopeResult);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Comparison failed."); }
    finally { setLoading(false); }
  }

  const copyDraft = async () => { if (!result) return; const d = result.changeOrderDraft; await navigator.clipboard.writeText(`${d.title}\n\nProposed scope\n${d.scope}\n\nDeadline impact\n${d.deadlineImpact}\n\nPrice impact\n${d.priceImpact}\n\n${d.approvalNote}`); };
  const classificationStyle = result?.classification === "potential_scope_change" ? "border-amber-200 bg-amber-50 text-amber-900" : result?.classification === "likely_in_scope" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-800";

  return <div className="space-y-6">
    <header className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sky-700"><FileDiff className="h-4 w-4"/> Agreement intelligence</div><h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Scope Change Detector</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Compare a new client request with the original agreement before accepting extra work, changing the deadline or revising the price.</p></div><Link href="/contracts" className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Open contracts <ArrowRight className="h-3.5 w-3.5"/></Link></header>
    <DemoModeBanner view={workspace.view}/>
    <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
      <form onSubmit={analyse} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-base font-semibold text-slate-950">Compare a new request</h2><p className="mt-1 text-xs leading-5 text-slate-500">Select a project to use its saved contract, or paste an agreement manually.</p></div>
        <label className="block text-xs font-semibold text-slate-700">Project<select value={project?.id || ""} onChange={(e) => { setProjectId(e.target.value); setContractOverride(""); setResult(null); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal">{projects.length ? projects.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.clientName}</option>) : <option value="">No projects available</option>}</select></label>
        <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{project?.contractText ? <><strong className="text-slate-800">Saved agreement loaded.</strong> {project.contractRequirements?.length || 0} extracted requirement(s) will also be compared.</> : "No saved agreement found for this project. Paste the original agreement below."}</div>
        <label className="block text-xs font-semibold text-slate-700">Original agreement<textarea value={contractOverride || project?.contractText || ""} onChange={(e) => setContractOverride(e.target.value)} rows={7} maxLength={60000} placeholder="Paste the original contract or statement of work…" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-normal leading-5"/></label>
        <label className="block text-xs font-semibold text-slate-700">New client request<textarea required minLength={10} value={requestText} onChange={(e) => setRequestText(e.target.value)} rows={5} maxLength={8000} placeholder="Example: Please add customer login, password reset and an admin dashboard…" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-normal leading-5"/></label>
        <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5"/><span>I am authorized to submit this agreement and request for analysis. If configured, the text will be sent to the server-configured Gemini or OpenAI provider. Do not submit secrets or sensitive personal/payment data.</span></label>
        <button disabled={loading || !requestText.trim() || !contractText.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50">{loading ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <FileDiff className="h-4 w-4"/>}{loading ? "Comparing agreement and request…" : "Compare request with agreement"}</button>
        {error && <p role="alert" className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><AlertCircle className="h-4 w-4 shrink-0"/>{error}</p>}
      </form>
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-base font-semibold text-slate-950">Comparison report</h2><p className="mt-1 text-xs text-slate-500">Decision support for both parties. The AI does not amend the contract or approve extra work.</p></div>
        {!result ? <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><FileDiff className="h-9 w-9 text-slate-300"/><h3 className="mt-3 text-sm font-semibold text-slate-800">Your comparison will appear here</h3><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">PayMind will identify potentially included work, possible additions, unclear terms and questions to resolve.</p></div> : <div className="space-y-4">
          <div className={`rounded-xl border p-4 ${classificationStyle}`}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-wide">{result.classification.replaceAll("_", " ")}</span><span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold">{result.analysisMode === "ai_assisted" ? "AI-assisted" : "Manual fallback · AI key not configured"}</span></div><h3 className="mt-2 text-base font-semibold">{result.headline}</h3><p className="mt-2 text-xs leading-5">{result.summary}</p></div>
          <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3"><h4 className="text-xs font-semibold text-emerald-900">Potentially included</h4>{result.includedWork.length ? <ul className="mt-2 list-disc pl-4 text-xs leading-5 text-emerald-900">{result.includedWork.map((v,i)=><li key={i}>{v}</li>)}</ul> : <p className="mt-2 text-xs text-emerald-800">No items confirmed.</p>}</div><div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3"><h4 className="text-xs font-semibold text-amber-900">Potential additions</h4>{result.additionalWork.length ? <ul className="mt-2 list-disc pl-4 text-xs leading-5 text-amber-900">{result.additionalWork.map((v,i)=><li key={i}>{v}</li>)}</ul> : <p className="mt-2 text-xs text-amber-800">No additional items identified.</p>}</div></div>
          {result.unclearPoints.length > 0 && <div className="rounded-xl border border-slate-200 p-3"><h4 className="text-xs font-semibold text-slate-800">Needs clarification</h4><ul className="mt-2 list-disc pl-4 text-xs leading-5 text-slate-600">{result.unclearPoints.map((v,i)=><li key={i}>{v}</li>)}</ul></div>}
          {result.evidence.length > 0 && <div className="space-y-2"><h4 className="text-xs font-semibold text-slate-800">Agreement evidence</h4>{result.evidence.map((item,i)=><blockquote key={i} className="rounded-lg bg-slate-50 p-3 text-xs"><p className="italic text-slate-700">“{item.contractQuote}”</p><p className="mt-1 text-slate-500">{item.relevance}</p></blockquote>)}</div>}
          <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4"><div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold text-slate-900">Suggested change-order draft</h4><button type="button" onClick={copyDraft} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700"><ClipboardCopy className="h-3 w-3"/>Copy</button></div><p className="mt-2 text-xs font-semibold">{result.changeOrderDraft.title}</p><p className="mt-2 text-xs leading-5 text-slate-600">{result.changeOrderDraft.scope}</p><dl className="mt-3 space-y-2 text-xs"><div><dt className="font-semibold text-slate-700">Deadline impact</dt><dd className="text-slate-600">{result.changeOrderDraft.deadlineImpact}</dd></div><div><dt className="font-semibold text-slate-700">Price impact</dt><dd className="text-slate-600">{result.changeOrderDraft.priceImpact}</dd></div></dl><p className="mt-3 border-t border-sky-100 pt-3 text-[11px] leading-5 text-slate-600">{result.changeOrderDraft.approvalNote}</p></div>
          {result.suggestedQuestions.length > 0 && <div><h4 className="text-xs font-semibold text-slate-800">Questions for both parties</h4><ul className="mt-2 space-y-1 text-xs leading-5 text-slate-600">{result.suggestedQuestions.map((v,i)=><li key={i}>• {v}</li>)}</ul></div>}
          <p className="flex gap-2 rounded-lg bg-slate-50 p-3 text-[11px] leading-5 text-slate-500"><ShieldCheck className="h-4 w-4 shrink-0"/>AI analysis can be wrong. Verify every quote against the signed agreement. This report is not legal advice and does not change the agreement; both parties must approve any change.</p>
        </div>}
      </section>
    </div>
  </div>;
}
