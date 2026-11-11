import { createSupabaseServerClient } from "@/lib/supabase/server";
import { evaluateIntelligenceAccess } from "./intelligence-access-core.mjs";

/**
 * Authorizes AI endpoints for a verified Supabase user, or for an explicitly
 * enabled local demo in non-production. Never treats a failed auth lookup as demo access.
 */
export async function getIntelligenceAccess() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
  const demoEnabled = process.env.NODE_ENV !== "production" && process.env.PAYMIND_DEMO_MODE === "true";
  let userId: string | null = null;
  let authError = false;

  if (supabaseConfigured) {
    try {
      const supabase = await createSupabaseServerClient();
      if (!supabase) {
        authError = true;
      } else {
        const { data, error } = await supabase.auth.getUser();
        userId = data.user?.id ?? null;
        authError = Boolean(error);
      }
    } catch {
      authError = true;
    }
  }

  return evaluateIntelligenceAccess({
    isProduction: process.env.NODE_ENV === "production",
    demoEnabled,
    supabaseConfigured,
    userId,
    authError,
  });
}
