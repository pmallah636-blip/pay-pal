import Link from "next/link";
import { Suspense } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { ReminderSettings } from "@/components/reminders/ReminderSettings";
import { SupabaseAuthPanel } from "@/components/auth/SupabaseAuthPanel";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WorkspaceViewSettings } from "@/components/workspace/WorkspaceViewSettings";
import { DemoModeBanner } from "@/components/workspace/DemoModeBanner";

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading settings…</div>}>
      <SettingsContent />
    </Suspense>
  );
}

async function SettingsContent() {
  const supabaseServer = await createSupabaseServerClient();
  const { data: authData } = supabaseServer ? await supabaseServer.auth.getUser() : { data: { user: null } };
  const currentEmail = authData.user?.email ?? null;
  const { data: profileData } = supabaseServer && authData.user
    ? await supabaseServer.from("profiles").select("role").eq("id", authData.user.id).maybeSingle()
    : { data: null };
  const reminderRole = profileData?.role === "client" ? "client" : "seller";
  const reminderAccountKey = authData.user?.id ?? "demo";
  const isAuthenticated = Boolean(authData.user);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Settings</h1>
          <p className="mt-1 text-sm text-slate-500">Manage your account, demo workspace view, and reminder preferences.</p>
        </div>
        <Link href="/" className="text-xs font-semibold text-sky-700 hover:text-sky-900">&larr; Back to Overview</Link>
      </div>

      <DemoModeBanner />

      <WorkspaceViewSettings isAuthenticated={isAuthenticated} />

      <Suspense fallback={<div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading account…</div>}>
        <SupabaseAuthPanel configured={isSupabaseConfigured} initialEmail={currentEmail} />
      </Suspense>

      <ReminderSettings initialRole={reminderRole} accountKey={reminderAccountKey} roleLocked={Boolean(authData.user)} />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">About this demo workspace</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Demo projects, calendar dates, contract checklist entries, and manual payment records are stored in this browser’s local storage. They are useful for testing the workflow, but they are not synced across devices and are not verified PayPal captures or real accounting records. Authenticated Supabase features and existing PayPal backend integrations remain separate from this local demo workspace.
        </p>
      </section>
    </div>
  );
}
