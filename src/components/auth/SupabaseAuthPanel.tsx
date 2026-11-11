"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, UserPlus } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = { configured: boolean; initialEmail?: string | null };

export function SupabaseAuthPanel({ configured, initialEmail = null }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"freelancer" | "client">("freelancer");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    const client = createSupabaseBrowserClient();
    if (!client) {
      setError("Add the Supabase URL and anon key to .env.local first.");
      setBusy(false);
      return;
    }
    try {
      if (mode === "sign-up") {
        const { data, error: authError } = await client.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { data: { full_name: fullName.trim(), role } },
        });
        if (authError) throw authError;
        if (data.session) {
          setMessage("Account created and signed in.");
          router.refresh();
        } else {
          setMessage("Account created. Check your email to confirm it, then sign in.");
          setMode("sign-in");
        }
      } else {
        const { error: authError } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (authError) throw authError;
        setMessage("Signed in. Your protected Sandbox payment routes are now available.");
        router.refresh();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    const client = createSupabaseBrowserClient();
    if (!client) return;
    setBusy(true);
    const { error: authError } = await client.auth.signOut();
    setBusy(false);
    if (authError) setError(authError.message);
    else {
      setMessage("Signed out.");
      router.refresh();
    }
  };

  if (!configured) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Account &amp; secure payment access</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local to enable sign-in. PayPal order creation requires an authenticated account outside local demo mode.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Account &amp; secure payment access</h2>
          <p className="mt-1 text-sm text-slate-500">Sign in to connect PayPal payments to your own project and invoice records.</p>
        </div>
        {initialEmail && <button type="button" disabled={busy} onClick={signOut} className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><LogOut className="h-3.5 w-3.5" /> Sign out</button>}
      </div>

      {initialEmail ? (
        <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">Signed in as <strong>{initialEmail}</strong>.</div>
      ) : (
        <>
          <div className="mt-4 inline-flex rounded-lg bg-slate-100 p-1">
            <button type="button" onClick={() => setMode("sign-in")} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mode === "sign-in" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Sign in</button>
            <button type="button" onClick={() => setMode("sign-up")} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${mode === "sign-up" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Create account</button>
          </div>
          <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
            {mode === "sign-up" && <>
              <label className="text-xs font-medium text-slate-700">Full name<input required value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-500" /></label>
              <label className="text-xs font-medium text-slate-700">Account role<select value={role} onChange={(event) => setRole(event.target.value as "freelancer" | "client")} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500"><option value="freelancer">Freelancer / Seller</option><option value="client">Client / Buyer</option></select></label>
            </>}
            <label className="text-xs font-medium text-slate-700">Email<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-500" /></label>
            <label className="text-xs font-medium text-slate-700">Password<input type="password" required minLength={8} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-sky-500" /></label>
            <div className="sm:col-span-2"><button disabled={busy} type="submit" className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50">{mode === "sign-in" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}{busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}</button></div>
          </form>
        </>
      )}
      {message && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">{message}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-900">{error}</p>}
    </section>
  );
}
