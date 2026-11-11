import { NextResponse } from "next/server";
import { MOCK_MILESTONES, MOCK_PROJECTS } from "@/lib/supabase/mock-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = supabase
    ? await supabase.auth.getUser()
    : { data: { user: null }, error: null };

  if (authError) return NextResponse.json({ error: "Your session could not be verified. Sign in again." }, { status: 401, ...noStore });

  if (!supabase || !user) {
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({
        source: "demo",
        role: "seller",
        authenticated: false,
        milestones: MOCK_MILESTONES.map((milestone) => ({ id: milestone.id, project_id: milestone.project_id, title: milestone.title, due_date: milestone.due_date ?? null, status: milestone.status })),
        projects: MOCK_PROJECTS.map((project) => ({ id: project.id, title: project.title })),
      }, noStore);
    }
    return NextResponse.json({ error: "Sign in to load your project milestones." }, { status: 401, ...noStore });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: "Could not verify your PayMind account role." }, { status: 503, ...noStore });

  if (profile?.role === "client") {
    // Client access is restricted to projects whose stored client-contact email
    // matches this authenticated, email-confirmed account.
    if (!user.email || !user.email_confirmed_at) {
      return NextResponse.json({ error: "Confirm your email before viewing client project reminders." }, { status: 403, ...noStore });
    }
    const admin = createSupabaseAdminClient();
    if (!admin) return NextResponse.json({ error: "Client reminder access needs the server-side Supabase service key." }, { status: 503, ...noStore });

    const { data: contacts, error: contactError } = await admin
      .from("clients")
      .select("id")
      .eq("email", user.email.toLowerCase());
    if (contactError) return NextResponse.json({ error: "Could not find projects associated with this client account." }, { status: 503, ...noStore });
    const clientIds = (contacts ?? []).map((contact: { id: string }) => contact.id);
    if (!clientIds.length) return NextResponse.json({ source: "account", role: "client", authenticated: true, milestones: [], projects: [] }, noStore);

    const { data: projects, error: projectError } = await admin
      .from("projects")
      .select("id, title")
      .in("client_id", clientIds);
    if (projectError) return NextResponse.json({ error: "Could not load client projects." }, { status: 503, ...noStore });
    const projectIds = (projects ?? []).map((project: { id: string }) => project.id);
    if (!projectIds.length) return NextResponse.json({ source: "account", role: "client", authenticated: true, milestones: [], projects: [] }, noStore);

    const { data: milestones, error: milestoneError } = await admin
      .from("milestones")
      .select("id, project_id, title, due_date, status")
      .in("project_id", projectIds)
      .not("due_date", "is", null)
      .order("due_date", { ascending: true });
    if (milestoneError) return NextResponse.json({ error: "Could not load client milestone deadlines." }, { status: 503, ...noStore });
    return NextResponse.json({ source: "account", role: "client", authenticated: true, milestones: milestones ?? [], projects: projects ?? [] }, noStore);
  }

  // Freelancer data is filtered by Supabase RLS: only projects owned by this user.
  const { data: milestones, error } = await supabase
    .from("milestones")
    .select("id, project_id, title, due_date, status")
    .not("due_date", "is", null)
    .order("due_date", { ascending: true });
  if (error) return NextResponse.json({ error: "Could not load milestone deadlines." }, { status: 503, ...noStore });

  const projectIds = [...new Set((milestones ?? []).map((item: { project_id: string }) => item.project_id))];
  const { data: projects, error: projectError } = projectIds.length
    ? await supabase.from("projects").select("id, title").in("id", projectIds)
    : { data: [], error: null };
  if (projectError) return NextResponse.json({ error: "Could not load project names for milestone reminders." }, { status: 503, ...noStore });

  return NextResponse.json({ source: "account", role: "seller", authenticated: true, milestones: milestones ?? [], projects: projects ?? [] }, noStore);
}
