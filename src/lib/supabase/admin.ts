import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

export function isSupabaseAdminConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  if (!adminClient) {
    adminClient = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return adminClient;
}
