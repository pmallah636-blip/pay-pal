"use client";

import { useDemoWorkspace } from "@/lib/workspace/use-demo-workspace";
import { availableClientNames, setDemoWorkspaceView, setSelectedClientName } from "@/lib/workspace/workspace-store";
import type { DemoWorkspaceView } from "@/lib/workspace/workspace-types";

export function WorkspaceViewSettings({ isAuthenticated }: { isAuthenticated: boolean }) {
  const workspace = useDemoWorkspace();
  const clients = availableClientNames(workspace);

  const onChangeView = (view: DemoWorkspaceView) => {
    setDemoWorkspaceView(view);
  };

  return (
    <section id="workspace-view" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Switch workspace view</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Change how the demo workspace is presented. This updates Overview, Projects, Calendar, and Payments using the same shared demo data.
          </p>
        </div>
        <span className="w-fit rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Demo view setting</span>
      </div>

      {isAuthenticated && (
        <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-900">
          You are signed in with a Supabase account. The demo view switch changes how this browser presents shared demo workspace data, but it does <strong>not</strong> impersonate another account, grant access to real client data, or override your authenticated Supabase role for protected server actions.
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className={`cursor-pointer rounded-xl border p-4 transition ${workspace.view === "merchant" ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
          <span className="flex items-start gap-3">
            <input
              type="radio"
              name="workspace-view"
              checked={workspace.view === "merchant"}
              onChange={() => onChangeView("merchant")}
              className="mt-1 h-4 w-4 accent-sky-700"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-900">Freelancer / Merchant (default)</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">Shows merchant wording and demo records such as expected/received payments and delivery milestones.</span>
            </span>
          </span>
        </label>

        <label className={`cursor-pointer rounded-xl border p-4 transition ${workspace.view === "client" ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
          <span className="flex items-start gap-3">
            <input
              type="radio"
              name="workspace-view"
              checked={workspace.view === "client"}
              onChange={() => onChangeView("client")}
              className="mt-1 h-4 w-4 accent-sky-700"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-900">Client</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">Shows client wording and only the selected demo client’s shared projects. This is a demo presentation, not access to another real account.</span>
            </span>
          </span>
        </label>
      </div>

      {workspace.view === "client" && (
        <div className="mt-4">
          <label htmlFor="demo-client-select" className="mb-1.5 block text-xs font-semibold text-slate-700">Selected demo client</label>
          <select
            id="demo-client-select"
            value={workspace.selectedClientName}
            onChange={(event) => setSelectedClientName(event.target.value)}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
          >
            {clients.length === 0 ? <option value="">No demo clients available</option> : null}
            {clients.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] leading-5 text-slate-500">Client view filters the shared demo workspace to projects matching this client name. Add or edit client names in Projects.</p>
        </div>
      )}
    </section>
  );
}
