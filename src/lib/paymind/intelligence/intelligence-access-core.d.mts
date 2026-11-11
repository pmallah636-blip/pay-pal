export type IntelligenceAccessInput = {
  isProduction: boolean;
  demoEnabled: boolean;
  supabaseConfigured: boolean;
  userId: string | null;
  authError: boolean;
};
export type IntelligenceAccessDecision =
  | { allowed: true; mode: "authenticated"; userId: string }
  | { allowed: true; mode: "demo"; userId: null }
  | { allowed: false; status: 401 | 503; error: string };
export function evaluateIntelligenceAccess(input: IntelligenceAccessInput): IntelligenceAccessDecision;
