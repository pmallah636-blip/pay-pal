import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey &&
  supabaseUrl !== "https://your-project.supabase.co" &&
  supabaseAnonKey !== "your-supabase-anon-key"
);

export function createSupabaseBrowserClient() {
  if (!isSupabaseConfigured || !supabaseUrl || !supabaseAnonKey) return null;
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
