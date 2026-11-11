import { z } from "zod";

const MoneyString = z.string().trim().regex(/^\d{1,15}(?:\.\d{1,4})?$/, "Enter a positive amount using digits only.").refine((value) => Number(value) > 0, "Amount must be greater than zero.");
const Percent = z.number().finite().min(0).max(100);

export const ContractRequestSchema = z.object({
  contractText: z.string().trim().min(80, "Paste at least 80 characters of contract text.").max(60_000, "Contract text is too long (60,000 character limit)."),
  projectType: z.string().trim().max(100).optional(),
});

const TermValueSchema = z.object({
  value: z.string().nullable().default(null),
  status: z.enum(["explicit", "inferred", "missing"]).default("missing"),
  confidence: z.enum(["high", "medium", "low"]).default("low"),
  evidence: z.string().nullable().default(null),
  userEdited: z.boolean().optional(),
});

// Backward-compatible term: accepts old `string|null` values and new structured objects.
const CompatTerm = z.preprocess((value) => {
  if (typeof value === "string") return { value, status: "explicit", confidence: "medium", evidence: null };
  if (value === null || value === undefined) return { value: null, status: "missing", confidence: "low", evidence: null };
  return value;
}, TermValueSchema).default({ value: null, status: "missing", confidence: "low", evidence: null });

export const ContractTermsSchema = z.object({
  clientName: CompatTerm,
  freelancerName: CompatTerm,
  projectScope: CompatTerm,
  currency: CompatTerm,
  totalAmount: CompatTerm,
  paymentSchedule: CompatTerm,
  deliveryDeadlines: CompatTerm,
  revisionLimit: CompatTerm,
  acceptanceCriteria: CompatTerm,
  intellectualPropertyTerms: CompatTerm,
  cancellationTerms: CompatTerm,
  latePaymentTerms: CompatTerm,
  disputeResolution: CompatTerm,
  // Backward-compatible aliases used by older UI consumers.
  paymentTerms: CompatTerm.optional(),
  deadline: CompatTerm.optional(),
  disputeTerms: CompatTerm.optional(),
  governingLaw: CompatTerm.optional(),
  deliverables: z.array(z.preprocess((value) => {
    if (typeof value === "string") return { description: value, status: "explicit", confidence: "medium", evidence: null };
    return value;
  }, z.object({
    description: z.string(),
    status: z.enum(["explicit", "inferred", "missing"]).default("explicit"),
    confidence: z.enum(["high", "medium", "low"]).default("medium"),
    evidence: z.string().nullable().default(null),
  }))).max(40).default([]),
  milestones: z.array(z.object({
    description: z.string(),
    amount: z.string().nullable().default(null),
    currency: z.string().nullable().default(null),
    due: z.string().nullable().default(null),
    status: z.enum(["explicit", "inferred", "missing"]).default("explicit"),
    confidence: z.enum(["high", "medium", "low"]).default("medium"),
    evidence: z.string().nullable().default(null),
  })).max(30).default([]),
  missingInformation: z.array(z.string()).max(40).default([]),
  evidenceQuotes: z.array(z.string()).max(60).default([]),
  // Legacy field tolerated.
  evidence: z.array(z.string()).max(60).optional(),
});

export const SimulationRequestSchema = z.object({
  amount: MoneyString,
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  fxRateToInr: z.number().finite().positive().max(1_000_000),
  processingFeePercent: z.number().finite().min(0).max(20),
  fixedFeePerTransaction: z.number().finite().min(0).max(1_000_000).default(0),
  fxSpreadPercent: z.number().finite().min(0).max(20).default(0),
  withholdingPercent: z.number().finite().min(0).max(50).default(0),
  annualCapitalCostPercent: z.number().finite().min(0).max(100).default(0),
  workCompletedBeforeFirstPaymentPercent: Percent.default(0),
  scenarios: z.array(z.object({
    name: z.string().trim().min(1).max(50),
    installments: z.array(z.object({
      sharePercent: z.number().finite().positive().max(100),
      delayDays: z.number().int().min(0).max(3650).default(0),
    })).min(1).max(20),
  }).refine((scenario) => {
    const sum = scenario.installments.reduce((total, item) => total + item.sharePercent, 0);
    return Math.abs(sum - 100) < 0.001;
  }, "Each scenario's installment percentages must add up to 100.")).min(1).max(6),
});

export type ContractTermValue = z.infer<typeof TermValueSchema>;
export type ContractTerms = z.infer<typeof ContractTermsSchema>;
export type SimulationRequest = z.infer<typeof SimulationRequestSchema>;

