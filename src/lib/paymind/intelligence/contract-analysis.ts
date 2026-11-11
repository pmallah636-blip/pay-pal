import { ContractTermsSchema, type ContractTermValue, type ContractTerms } from "./schemas";
import { extractContractTermsWithAI } from "./ai-provider";

export type ContractFinding = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  explanation: string;
  recommendation: string;
  evidence: string | null;
};

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0].slice(0, 240);
  }
  return null;
}

function hasEvidence(text: string, evidence: string | null | undefined): string | null {
  if (!evidence) return null;
  const trimmed = evidence.trim();
  return trimmed.length > 6 && text.includes(trimmed) ? trimmed : null;
}

function term(value: string | null, evidence: string | null, status: ContractTermValue["status"] = value ? "explicit" : "missing", confidence: ContractTermValue["confidence"] = value ? "medium" : "low"): ContractTermValue {
  return { value, status, confidence, evidence };
}

function missingTerm(): ContractTermValue {
  return { value: null, status: "missing", confidence: "low", evidence: null };
}

function normalizeMoney(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/,/g, "").trim();
  if (!/^\d{1,15}(?:\.\d{1,4})?$/.test(cleaned)) return null;
  return cleaned;
}

function normalizeCurrency(value: string | null | undefined): string | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(upper) ? upper : null;
}

function normalizeDateLike(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Deterministic light validation: accept common ISO-like/date phrases but do not invent dates.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|\d{1,2})[a-z0-9 ,/\-]{1,40}$/i.test(trimmed)) return trimmed;
  return trimmed; // keep user-visible text; UI can flag uncertainty via confidence/status.
}

function basicExtraction(text: string): ContractTerms {
  const amountMatch = text.match(/\b(USD|EUR|GBP|INR|CAD|AUD|SGD|AED)\s*([\d,]+(?:\.\d{1,2})?)\b/i);
  const currencySymbolMatch = text.match(/([$€£₹])\s*([\d,]+(?:\.\d{1,2})?)/);
  const currencyMap: Record<string, string> = { "$": "USD", "€": "EUR", "£": "GBP", "₹": "INR" };
  const currency = normalizeCurrency(amountMatch?.[1] ?? (currencySymbolMatch ? currencyMap[currencySymbolMatch[1]] : null));
  const totalAmount = normalizeMoney(amountMatch?.[2] ?? currencySymbolMatch?.[2] ?? null);
  const payment = firstMatch(text, [/(?:payment|invoice|deposit|advance|milestone)[^\n.;]{0,180}/i]);
  const deadline = firstMatch(text, [/(?:delivery|completion|deadline|due date)[^\n.;]{0,100}/i]);
  const revision = firstMatch(text, [/\b(?:up to )?\d+\s+(?:rounds?|sets?)\s+of revisions?\b/i, /\b(?:unlimited|no limit)\s+revisions?\b/i]);
  const ip = firstMatch(text, [/\b(?:intellectual property|copyright|ownership|work[- ]for[- ]hire)[^\n.;]{0,180}/i]);
  const cancellation = firstMatch(text, [/\b(?:cancel|cancellation|terminate|termination|refund)[^\n.;]{0,180}/i]);
  const late = firstMatch(text, [/\b(?:late fee|late payment|overdue|interest)[^\n.;]{0,180}/i]);
  const dispute = firstMatch(text, [/\b(?:dispute|arbitration|mediation|jurisdiction|court)[^\n.;]{0,180}/i]);
  const acceptance = firstMatch(text, [/\b(?:acceptance|approval|review period|sign[- ]off)[^\n.;]{0,180}/i]);
  const scope = firstMatch(text, [/(?:scope of work|project scope|freelancer will|contractor will)[^\n.;]{0,180}/i]);
  const client = firstMatch(text, [/(?:client|company)\s*[:\-]\s*([^\n.;]{2,80})/i, /\bfor (?:client\s+)?([A-Z][^\n.;,]{2,80})\b/]);
  const freelancer = firstMatch(text, [/(?:freelancer|contractor|developer)\s*[:\-]\s*([^\n.;]{2,80})/i]);
  const deliverableMatches = Array.from(text.matchAll(/(?:deliverable|deliverables|will provide|will create|scope includes)[^\n.;]{0,180}/gi)).slice(0, 12);
  const milestones = Array.from(text.matchAll(/(?:milestone|phase)[^\n.;]{0,140}/gi)).slice(0, 10).map((m) => ({
    description: m[0].slice(0, 180),
    amount: normalizeMoney(m[0].match(/([$€£₹]|USD|EUR|GBP|INR)\s*([\d,]+(?:\.\d{1,2})?)/i)?.[2] ?? null),
    currency,
    due: normalizeDateLike(m[0].match(/\b(?:by|due|on)\s+([^.;]{2,40})/i)?.[1] ?? null),
    status: "explicit" as const,
    confidence: "medium" as const,
    evidence: m[0].slice(0, 180),
  }));

  return ContractTermsSchema.parse({
    clientName: term(client, client, client ? "explicit" : "missing", client ? "medium" : "low"),
    freelancerName: term(freelancer, freelancer, freelancer ? "explicit" : "missing", freelancer ? "low" : "low"),
    projectScope: term(scope, scope, scope ? "explicit" : "missing", scope ? "medium" : "low"),
    currency: term(currency, amountMatch?.[0] ?? currencySymbolMatch?.[0] ?? null, currency ? "explicit" : "missing", currency ? "high" : "low"),
    totalAmount: term(totalAmount, amountMatch?.[0] ?? currencySymbolMatch?.[0] ?? null, totalAmount ? "explicit" : "missing", totalAmount ? "high" : "low"),
    paymentSchedule: term(payment, payment, payment ? "explicit" : "missing", payment ? "medium" : "low"),
    deliveryDeadlines: term(deadline, deadline, deadline ? "explicit" : "missing", deadline ? "medium" : "low"),
    revisionLimit: term(revision, revision, revision ? "explicit" : "missing", revision ? "medium" : "low"),
    acceptanceCriteria: term(acceptance, acceptance, acceptance ? "explicit" : "missing", acceptance ? "medium" : "low"),
    intellectualPropertyTerms: term(ip, ip, ip ? "explicit" : "missing", ip ? "medium" : "low"),
    cancellationTerms: term(cancellation, cancellation, cancellation ? "explicit" : "missing", cancellation ? "medium" : "low"),
    latePaymentTerms: term(late, late, late ? "explicit" : "missing", late ? "medium" : "low"),
    disputeResolution: term(dispute, dispute, dispute ? "explicit" : "missing", dispute ? "medium" : "low"),
    paymentTerms: term(payment, payment, payment ? "explicit" : "missing", payment ? "medium" : "low"),
    deadline: term(deadline, deadline, deadline ? "explicit" : "missing", deadline ? "medium" : "low"),
    disputeTerms: term(dispute, dispute, dispute ? "explicit" : "missing", dispute ? "medium" : "low"),
    governingLaw: missingTerm(),
    deliverables: deliverableMatches.map((m) => ({ description: m[0].slice(0, 180), status: "explicit", confidence: "medium", evidence: m[0].slice(0, 180) })),
    milestones,
    missingInformation: [],
    evidenceQuotes: [amountMatch?.[0], payment, deadline, revision, ip, cancellation, late, dispute, acceptance].filter((v): v is string => Boolean(v)).slice(0, 20),
  });
}

function makeFinding(
  id: string,
  severity: ContractFinding["severity"],
  title: string,
  explanation: string,
  recommendation: string,
  evidence: string | null,
): ContractFinding {
  return { id, severity, title, explanation, recommendation, evidence };
}

function runDeterministicChecks(text: string, terms: ContractTerms): ContractFinding[] {
  const findings: ContractFinding[] = [];
  if (terms.paymentSchedule.status === "missing") {
    findings.push(makeFinding("payment-terms-missing", "high", "Payment schedule is unclear", "No clear payment schedule or invoice timing was identified.", "Add amount, currency, due dates/milestones, payment method, and consequences for late payment.", hasEvidence(text, terms.paymentSchedule.evidence)));
  }
  if (!terms.deliverables.length && terms.projectScope.status === "missing") {
    findings.push(makeFinding("scope-unclear", "high", "Deliverables or scope are unclear", "The contract text does not clearly identify deliverables or project scope.", "List concrete deliverables, formats, acceptance criteria, and out-of-scope items.", hasEvidence(text, terms.projectScope.evidence)));
  }
  if (/unlimited revisions?|unlimited changes?|as many revisions as (?:needed|required)/i.test(text)) {
    findings.push(makeFinding("unlimited-revisions", "high", "Potentially unlimited revisions", "The text appears to allow revisions without a clear limit.", "Set included revision rounds, define a revision, and price additional changes.", firstMatch(text, [/unlimited revisions?[^\n.;]*/i, /unlimited changes?[^\n.;]*/i])));
  } else if (terms.revisionLimit.status === "missing") {
    findings.push(makeFinding("revision-limit-missing", "medium", "Revision limit is missing", "No clear revision allowance was identified.", "Specify included revision rounds and a change-request process.", null));
  }
  if (terms.acceptanceCriteria.status === "missing") {
    findings.push(makeFinding("acceptance-missing", "medium", "Acceptance criteria are unclear", "No clear acceptance or review criteria were identified.", "Define objective acceptance criteria, review window, and how changes are requested.", null));
  }
  if (terms.intellectualPropertyTerms.status === "missing") {
    findings.push(makeFinding("ip-missing", "medium", "Intellectual property terms are missing", "No clear IP ownership/licensing terms were identified.", "State when rights transfer or are licensed and whether transfer depends on full payment.", null));
  }
  if (terms.cancellationTerms.status === "missing") {
    findings.push(makeFinding("termination-missing", "medium", "Cancellation/refund terms are missing", "No clear cancellation, termination, or refund process was identified.", "Define notice, payment for completed work, and delivery of work completed to date.", null));
  }
  if (terms.latePaymentTerms.status === "missing") {
    findings.push(makeFinding("late-payment-remedy-missing", "low", "Late-payment terms are missing", "No overdue-payment remedy or process was clearly identified.", "Add an overdue-payment process/reminder timeline, subject to applicable law.", null));
  }
  if (terms.disputeResolution.status === "missing") {
    findings.push(makeFinding("dispute-missing", "low", "Dispute resolution is missing", "No dispute resolution or governing process was clearly identified.", "Consider a clear dispute/escalation process and governing terms where appropriate.", null));
  }
  return findings;
}

function validateAndNormalizeTerms(text: string, terms: ContractTerms): { terms: ContractTerms; validationWarnings: string[] } {
  const warnings: string[] = [];
  const next = structuredClone(terms) as ContractTerms;
  const validQuote = (quote?: string | null) => hasEvidence(text, quote);

  for (const key of Object.keys(next) as Array<keyof ContractTerms>) {
    const value = next[key] as unknown;
    if (value && typeof value === "object" && "value" in (value as Record<string, unknown>) && "status" in (value as Record<string, unknown>)) {
      const termValue = value as ContractTermValue;
      termValue.evidence = validQuote(termValue.evidence);
      if (!termValue.value) { termValue.status = "missing"; termValue.confidence = "low"; }
      if (termValue.status !== "explicit") termValue.evidence = termValue.evidence ?? null;
      if (key === "currency") {
        const normalized = normalizeCurrency(termValue.value);
        if (termValue.value && !normalized) { warnings.push("Currency format was unclear and was marked as missing."); (next[key] as unknown as ContractTermValue) = missingTerm(); }
        else if (normalized) termValue.value = normalized;
      }
      if (key === "totalAmount") {
        const normalized = normalizeMoney(termValue.value);
        if (termValue.value && !normalized) { warnings.push("Total amount format was unclear and was marked as missing."); (next[key] as unknown as ContractTermValue) = missingTerm(); }
        else if (normalized) termValue.value = normalized;
      }
      if (key === "deliveryDeadlines" && termValue.value) termValue.value = normalizeDateLike(termValue.value);
    }
  }
  next.deliverables = next.deliverables.filter((d) => d.description?.trim()).map((d) => ({ ...d, evidence: validQuote(d.evidence) }));
  next.milestones = next.milestones.filter((m) => m.description?.trim()).map((m) => ({
    ...m,
    amount: normalizeMoney(m.amount),
    currency: normalizeCurrency(m.currency) ?? (typeof next.currency?.value === "string" ? next.currency.value : null),
    due: normalizeDateLike(m.due),
    evidence: validQuote(m.evidence),
  }));
  next.evidenceQuotes = (next.evidenceQuotes || []).filter((q) => text.includes(q)).slice(0, 60);
  next.missingInformation = [
    ...new Set([
      ...(next.missingInformation || []),
      ...next.clientName.status === "missing" ? ["Client details"] : [],
      ...next.freelancerName.status === "missing" ? ["Freelancer details"] : [],
      ...next.projectScope.status === "missing" ? ["Project scope"] : [],
      ...next.deliverables.length === 0 ? ["Deliverables"] : [],
      ...next.totalAmount.status === "missing" ? ["Total amount/currency"] : [],
      ...next.paymentSchedule.status === "missing" ? ["Payment schedule"] : [],
      ...next.deliveryDeadlines.status === "missing" ? ["Delivery deadlines"] : [],
      ...next.revisionLimit.status === "missing" ? ["Revision limits"] : [],
      ...next.acceptanceCriteria.status === "missing" ? ["Acceptance criteria"] : [],
      ...next.intellectualPropertyTerms.status === "missing" ? ["Intellectual property terms"] : [],
      ...next.cancellationTerms.status === "missing" ? ["Cancellation/refund terms"] : [],
      ...next.latePaymentTerms.status === "missing" ? ["Late-payment conditions"] : [],
      ...next.disputeResolution.status === "missing" ? ["Dispute resolution"] : [],
    ]),
  ];
  // Keep legacy aliases coherent.
  next.paymentTerms = next.paymentSchedule;
  next.deadline = next.deliveryDeadlines;
  next.disputeTerms = next.disputeResolution;
  return { terms: ContractTermsSchema.parse(next), validationWarnings: warnings };
}

export async function analyzeContract(contractText: string, projectType?: string) {
  const aiTerms = await extractContractTermsWithAI(contractText).catch(() => null);
  const base = aiTerms ?? basicExtraction(contractText);
  const { terms, validationWarnings } = validateAndNormalizeTerms(contractText, base);
  const findings = runDeterministicChecks(contractText, terms);
  const weights = { high: 20, medium: 10, low: 4 } as const;
  const riskScore = Math.min(100, findings.reduce((sum, finding) => sum + weights[finding.severity], 0));
  const riskLevel = riskScore >= 50 ? "high" : riskScore >= 20 ? "medium" : "low";

  return {
    projectType: projectType || null,
    analysisMode: aiTerms ? "AI extraction + deterministic checks" : "deterministic checks (AI provider not configured or unavailable)",
    aiExtractionAvailable: Boolean(aiTerms),
    extractionWarning: aiTerms
      ? "AI-extracted terms are suggestions. Verify and edit every field against the original contract. Only exact quotations found in the supplied text were retained as evidence."
      : "No AI extraction was available. Basic deterministic extraction and checks were used; review and edit terms manually.",
    validationWarnings,
    terms,
    findings,
    missingInformation: terms.missingInformation,
    riskScore,
    riskLevel,
    disclaimer: "This is an issue-spotting aid, not legal advice. Confirm extracted terms against the original contract and ask a qualified professional about legal questions.",
  };
}

