import Link from "next/link";
import { Plus, ShieldCheck } from "lucide-react";
import { isPayPalSandboxConfigured } from "@/lib/paypal/server";
import { ReminderBell } from "@/components/reminders/ReminderBell";
import { ReminderScheduler } from "@/components/reminders/ReminderScheduler";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function Header() {
  const configured = isPayPalSandboxConfigured();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const accountKey = user?.id ?? "demo";

  return (
    <header className="sticky top-0 z-30 flex min-h-[64px] items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 backdrop-blur md:px-8">
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold tracking-tight text-slate-800">PayMind workspace</h1>
        <p className="hidden text-xs text-slate-500 sm:block">Projects, calendar dates, and demo records</p>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <ReminderBell accountKey={accountKey} />
        <div className={`hidden items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-medium sm:flex ${configured ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>{configured ? "Sandbox credentials present · not live-tested" : "Sandbox setup pending"}</span>
        </div>
        <Link href="/projects" className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-800">
          <Plus className="h-3.5 w-3.5" />
          <span>Projects</span>
        </Link>
      </div>
      <ReminderScheduler accountKey={accountKey} />
    </header>
  );
}
