/** Pure access policy for AI endpoints. Supabase's getUser() result is verified server-side. */
export function evaluateIntelligenceAccess({
  isProduction,
  demoEnabled,
  supabaseConfigured,
  userId,
  authError,
}) {
  if (typeof userId === "string" && userId.length > 0) {
    return { allowed: true, mode: "authenticated", userId };
  }
  // An invalid/unverifiable session must never fall through to demo mode.
  if (authError) {
    return { allowed: false, status: 401, error: "Your sign-in session could not be verified. Sign in again." };
  }
  if (!isProduction && demoEnabled) {
    return { allowed: true, mode: "demo", userId: null };
  }
  if (!supabaseConfigured) {
    return { allowed: false, status: 503, error: "Supabase authentication is not configured. Configure Supabase sign-in before using AI features in this environment." };
  }
  return { allowed: false, status: 401, error: "Sign in to use PayMind AI features." };
}
