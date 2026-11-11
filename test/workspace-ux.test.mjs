import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildWorkspaceCalendarEvents,
  computeProjectPaymentTotals,
  computeWorkspaceSummary,
  milestonePaymentStatus,
  milestonePaymentSentDate,
  milestonePaymentReceivedDate,
} from "../src/lib/workspace/workspace-insights.ts";
import {
  availableClientNames,
  createDefaultWorkspaceState,
  createExampleProject,
  migrateLegacySeedProjects,
  readDemoWorkspaceState,
  visibleProjects,
  writeDemoWorkspaceState,
} from "../src/lib/workspace/workspace-store.ts";
import {
  DEMO_WORKSPACE_KEY,
  defaultContractItems,
  newId,
} from "../src/lib/workspace/workspace-types.ts";
/** @typedef {import("../src/lib/workspace/workspace-types.ts").WorkspaceMilestone} WorkspaceMilestone */
/** @typedef {import("../src/lib/workspace/workspace-types.ts").WorkspaceProject} WorkspaceProject */

function installBrowserLocalStorage() {
  const store = new Map();
  const localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage,
      dispatchEvent: () => true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "localStorage", { value: localStorage, configurable: true, writable: true });
  Object.defineProperty(globalThis, "CustomEvent", {
    value: class CustomEvent { constructor(type) { this.type = type; } },
    configurable: true,
    writable: true,
  });
  return store;
}

function acceptanceProject(name, clientName, milestoneCount) {
  const now = "2026-11-09T00:00:00.000Z";
  const milestones = Array.from({ length: milestoneCount }, (_, i) => ({
    id: newId("ms"),
    title: `Phase ${i + 1} delivery`,
    phase: `Phase ${i + 1}`,
    description: `${name} milestone ${i + 1}`,
    deliverables: `Deliverable ${i + 1}`,
    amount: 1000 + i * 100,
    currency: "USD",
    startDate: `2026-11-${String(1 + i).padStart(2, "0")}`,
    dueDate: `2026-11-${String(10 + i).padStart(2, "0")}`,
    acceptanceCriteria: `Client accepts phase ${i + 1}`,
    status: "pending",
    paymentDueDate: `2026-11-${String(12 + i).padStart(2, "0")}`,
    paymentStatus: "pending",
  }));
  return {
    id: newId("proj"),
    name,
    clientName,
    companyName: `${clientName} Ltd`,
    clientEmail: `${clientName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    description: `${name} acceptance test project`,
    totalAmount: milestones.reduce((s, m) => s + m.amount, 0),
    currency: "USD",
    startDate: "2026-11-01",
    overallDeadline: "2026-11-30",
    status: "active",
    isDemo: true,
    createdAt: now,
    updatedAt: now,
    contractItems: defaultContractItems(),
    milestones,
  };
}

test("demo workspace view switch is presentation-only and persists through state shape", () => {
  const state = createDefaultWorkspaceState();
  assert.equal(state.view, "merchant");
  // New workspaces start empty with no auto-seeded sample clients; demo view filtering still works when projects exist.
  assert.equal(state.projects.length, 0);
  state.projects = [acceptanceProject("Demo Filter Project", "Sample Client A", 1)];
  state.view = "client";
  state.selectedClientName = state.projects[0].clientName;
  const visible = visibleProjects(state);
  assert.ok(visible.length >= 1);
  assert.ok(visible.every((p) => p.clientName === state.selectedClientName));
  // No impersonation: selected client only filters demo project records.
  state.selectedClientName = "No Such Client";
  assert.deepEqual(visibleProjects(state), []);
});

test("three acceptance projects can be created independently, persist, and retain milestones/client/amounts", () => {
  installBrowserLocalStorage();
  globalThis.localStorage.removeItem(DEMO_WORKSPACE_KEY);
  const base = createDefaultWorkspaceState();
  writeDemoWorkspaceState(base);

  const created = [
    acceptanceProject("Project A Website Development", "Alpha Studio", 3),
    acceptanceProject("Project B Mobile Application", "Beta Technologies", 2),
    acceptanceProject("Project C Brand Identity Design", "Gamma Creative", 4),
  ];

  for (const project of created) {
    const current = readDemoWorkspaceState();
    writeDemoWorkspaceState({ ...current, projects: [project, ...current.projects] });
  }

  const reloaded = readDemoWorkspaceState();
  const acceptance = reloaded.projects.filter((p) => created.some((c) => c.id === p.id));
  assert.equal(acceptance.length, 3, "all three projects should persist independently");
  assert.equal(new Set(acceptance.map((p) => p.id)).size, 3, "project IDs must be unique");
  const byName = new Map(acceptance.map((p) => [p.name, p]));
  assert.equal(byName.get("Project A Website Development")?.clientName, "Alpha Studio");
  assert.equal(byName.get("Project A Website Development")?.milestones.length, 3);
  assert.equal(byName.get("Project B Mobile Application")?.clientName, "Beta Technologies");
  assert.equal(byName.get("Project B Mobile Application")?.milestones.length, 2);
  assert.equal(byName.get("Project C Brand Identity Design")?.clientName, "Gamma Creative");
  assert.equal(byName.get("Project C Brand Identity Design")?.milestones.length, 4);
  for (const p of acceptance) assert.ok(p.totalAmount > 0 && p.milestones.every((m) => m.amount > 0 && m.dueDate && m.paymentDueDate));

  // Edit one project independently; others must remain unchanged.
  const target = byName.get("Project B Mobile Application");
  assert.ok(target);
  writeDemoWorkspaceState({
    ...reloaded,
    projects: reloaded.projects.map((p) => p.id === target.id ? { ...p, name: "Project B Mobile Application Updated", totalAmount: 2500, updatedAt: "2026-11-09T01:00:00.000Z" } : p),
  });
  const afterEdit = readDemoWorkspaceState();
  assert.equal(afterEdit.projects.find((p) => p.id === target.id)?.name, "Project B Mobile Application Updated");
  assert.equal(afterEdit.projects.find((p) => p.name === "Project A Website Development")?.clientName, "Alpha Studio");
  assert.equal(afterEdit.projects.find((p) => p.name === "Project C Brand Identity Design")?.milestones.length, 4);
});

test("custom projects and milestones drive summary/calendar calculations", () => {
  const state = createDefaultWorkspaceState();
  const projectId = newId("proj");
  const milestoneId = newId("ms");
  state.projects = [{
    id: projectId,
    name: "Custom Build",
    clientName: "Acme",
    companyName: "Acme Inc",
    clientEmail: "acme@example.com",
    description: "Custom",
    totalAmount: 500,
    currency: "USD",
    startDate: "2026-11-01",
    overallDeadline: "2026-11-20",
    status: "active",
    isDemo: true,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    contractItems: [],
    milestones: [{
      id: milestoneId,
      title: "Phase 1",
      phase: "Phase 1",
      description: "",
      amount: 500,
      currency: "USD",
      startDate: "2026-11-01",
      dueDate: "2026-11-10",
      paymentDueDate: "2026-11-10",
      acceptanceCriteria: "Accepted",
      status: "delivered",
    }],
  }];
  state.selectedClientName = "Acme";
  const summary = computeWorkspaceSummary(state, "2026-11-01");
  assert.equal(summary.activeProjects, 1);
  assert.equal(summary.upcomingPaymentsCount, 1);
  assert.equal(summary.upcomingPaymentsAmount, 500);
  const events = buildWorkspaceCalendarEvents(state, "2026-11-01");
  assert.ok(events.some((e) => e.kind === "delivery_milestone" && e.projectId === projectId));
  assert.ok(events.some((e) => e.kind === "payment_due" && e.milestoneId === milestoneId));
  assert.ok(availableClientNames(state).includes("Acme"));
});

test("manual demo payment events are never verified PayPal captures", () => {
  const state = createDefaultWorkspaceState();
  const project = acceptanceProject("Demo Pay Project", "Pay Client", 1);
  const milestone = project.milestones[0];
  state.projects = [project];
  state.paymentEvents = [{
    id: "pay1",
    projectId: project.id,
    milestoneId: milestone.id,
    type: "payment_received",
    amount: milestone.amount,
    currency: milestone.currency,
    date: "2026-11-09",
    note: "",
    isDemo: true,
    createdAt: "2026-11-09T00:00:00Z",
  }];
  const status = milestonePaymentStatus({ view: "merchant", project, milestone, events: state.paymentEvents, today: "2026-11-09" });
  assert.equal(status, "received_demo");
  const calendar = buildWorkspaceCalendarEvents(state, "2026-11-09");
  const payEvent = calendar.find((e) => e.kind === "payment_received");
  assert.ok(payEvent);
  assert.equal(payEvent.isDemo, true);
  assert.match(payEvent.title, /demo record/i);
  assert.doesNotMatch(payEvent.title, /verified|capture/i);
});

test("client and merchant demo payment actions update shared schedule/history and never claim PayPal capture", () => {
  installBrowserLocalStorage();
  globalThis.localStorage.removeItem(DEMO_WORKSPACE_KEY);
  const state = createDefaultWorkspaceState();
  const project = acceptanceProject("Payment Flow Project", "Delta Client", 1);
  project.milestones[0].id = "ms_pay";
  project.milestones[0].amount = 1500;
  project.milestones[0].paymentDueDate = "2026-11-15";
  state.projects = [project, ...state.projects];
  state.selectedClientName = "Delta Client";

  // Client records payment sent (demo)
  state.paymentEvents = [{
    id: "sent1", projectId: project.id, milestoneId: "ms_pay", type: "payment_sent", amount: 1500, currency: "USD", date: "2026-11-10", note: "Client marked sent", isDemo: true, createdAt: "2026-11-10T00:00:00Z",
  }];
  state.view = "client";
  const sentStatus = milestonePaymentStatus({ view: "client", project: state.projects[0], milestone: state.projects[0].milestones[0], events: state.paymentEvents, today: "2026-11-11" });
  assert.equal(sentStatus, "sent");
  assert.equal(milestonePaymentSentDate(state.projects[0].milestones[0], state.paymentEvents), "2026-11-10");
  const clientEvents = buildWorkspaceCalendarEvents(state, "2026-11-11");
  assert.ok(clientEvents.some((e) => e.kind === "payment_sent" && e.isDemo && /demo record/i.test(e.title)));
  assert.ok(clientEvents.every((e) => !/verified|capture/i.test(e.title)));

  // Merchant records payment received (demo)
  state.paymentEvents.unshift({ id: "recv1", projectId: project.id, milestoneId: "ms_pay", type: "payment_received", amount: 1500, currency: "USD", date: "2026-11-12", note: "Merchant marked received", isDemo: true, createdAt: "2026-11-12T00:00:00Z" });
  state.view = "merchant";
  const recvStatus = milestonePaymentStatus({ view: "merchant", project: state.projects[0], milestone: state.projects[0].milestones[0], events: state.paymentEvents, today: "2026-11-13" });
  assert.equal(recvStatus, "received_demo");
  assert.equal(milestonePaymentReceivedDate(state.projects[0].milestones[0], state.paymentEvents), "2026-11-12");
  const merchantEvents = buildWorkspaceCalendarEvents(state, "2026-11-13");
  assert.ok(merchantEvents.some((e) => e.kind === "payment_received" && e.isDemo && /demo record/i.test(e.title)));
  const summary = computeWorkspaceSummary(state, "2026-11-13");
  assert.equal(summary.paymentsReceivedAmount, 1500);
});

test("contracts page restores AI analysis with safety/correction hooks and payments page remains demo-only", () => {
  const contracts = fs.readFileSync("src/app/contracts/page.tsx", "utf8");
  assert.match(contracts, /\/api\/intelligence\/contract/, "Contracts should call existing server-side intelligence endpoint");
  assert.match(contracts, /Analyz|Analyze agreement/i, "Contracts should expose analysis action");
  assert.match(contracts, /explicit|inferred|missing/i, "Contracts should surface extraction confidence/status");
  assert.match(contracts, /Edit value|editValue|userEdited/i, "Contracts should allow manual correction of extracted values");
  assert.match(contracts, /not legal advice|decision support/i, "Contracts must separate findings from legal advice");
  assert.match(contracts, /missing|unclear information/i, "Contracts should highlight missing information/clauses");
  const payments = fs.readFileSync("src/app/payments/page.tsx", "utf8");
  assert.doesNotMatch(payments, /\/api\/paypal/);
  assert.doesNotMatch(payments, /PayPalCheckoutButton|PaymentsLedger/);
  assert.doesNotMatch(payments, /supabase|createSupabase/);
  assert.match(payments, /demo record/i);
});

test("projects page exposes clickable details, milestone payment schedule fields, totals consistency, and safe preview fallback messaging", () => {
  const projects = fs.readFileSync("src/app/projects/page.tsx", "utf8");
  assert.match(projects, /Open details|Details open|openDetails|project-details/, "Projects should have clickable/openable project details");
  assert.match(projects, /role="button"[\s\S]*tabIndex=\{0\}|onKeyDown/, "Open details should be keyboard accessible");
  assert.match(projects, /aria-expanded/, "Open details should expose expanded state");
  assert.match(projects, /Milestone breakdown|payment schedule/i, "Project details should show milestone/payment schedule");
  assert.match(projects, /Agreed project value|Milestone allocations|Unallocated|Over-allocated|Outstanding/i, "Project details should show payment/totals clarity");
  assert.match(projects, /Payment due date|paymentDueDate/, "Milestone form/details should support payment due date");
  assert.match(projects, /Payment sent date|paymentSentDate/, "Milestone form/details should support payment sent date");
  assert.match(projects, /Payment received date|paymentReceivedDate/, "Milestone form/details should support payment received date");
  assert.match(projects, /Record payment sent \(demo\)|recordMilestonePayment/, "Client-side demo payment action should exist");
  assert.match(projects, /Record payment received \(demo\)/, "Merchant-side demo payment action should exist");
  assert.match(projects, /demo record|not PayPal verified|Demo records only|demo\/planned/i, "Manual payment UI must label demo records");
  assert.match(projects, /server-backed preview|valid authenticated preview session|token verification remains unchanged/i, "Preview fallback must explain secure preview limitation");
  assert.match(projects, /Consistency warning|Allocation mismatch|unallocated|over milestone total/i, "Totals inconsistency should be surfaced");
  assert.match(projects, /Load example project \(DEMO\)|createExampleProject|No projects yet|workspace starts empty/i, "Projects UI should support empty state and clearly labeled demo loader");
  assert.doesNotMatch(projects, /fake session|bypass token/i);
});

test("preview repository keeps token verification and only allows narrow non-production demo fallback when Supabase has no record", () => {
  const repo = fs.readFileSync("src/lib/security/preview-repository.ts", "utf8");
  assert.match(repo, /verifyTokenHash/, "Token verification must remain present");
  assert.match(repo, /Demo mode only: allow local JSON fallback/, "Demo fallback must be explicit and narrow");
  assert.match(repo, /if \(!IS_DEMO_MODE\)/, "Demo fallback must remain disabled outside non-production demo mode");
  assert.doesNotMatch(repo, /return \{ authorized: true[\s\S]*IS_DEMO_MODE\s*&&\s*false/);
});

test("workspace starts empty, safely removes only unmodified legacy seed samples, preserves ambiguous/user data, and loads clearly labeled demo example on demand", () => {
  installBrowserLocalStorage();
  globalThis.localStorage.removeItem(DEMO_WORKSPACE_KEY);
  const fresh = readDemoWorkspaceState();
  assert.deepEqual(fresh.projects, [], "new workspace should start empty with no auto-seeded sample clients");

  const example = createExampleProject();
  assert.match(example.name, /DEMO/i);
  assert.match(example.clientName, /DEMO/i);
  assert.equal(example.isDemo, true);
  assert.ok(example.contractText?.includes("Northstar Studio"), "guided example should include its fictional agreement text");
  assert.ok((example.contractRequirements || []).length >= 4, "guided example should include delivery-check requirements");
  assert.equal(example.milestones.reduce((sum, milestone) => sum + milestone.amount, 0), example.totalAmount, "example milestone allocations should match project value");

  const userProject = acceptanceProject("User Created Project", "Real Client", 1);
  const ambiguousLegacy = {
    id: "demo_proj_1",
    name: "Website redesign",
    clientName: "Sample Client",
    companyName: "Edited Company",
    clientEmail: "edited@example.com",
    description: "User edited this legacy record",
    totalAmount: 999,
    currency: "USD",
    startDate: "2026-11-01",
    overallDeadline: "2026-11-30",
    status: "active",
    isDemo: true,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-02T00:00:00Z",
    contractItems: defaultContractItems(),
    milestones: [{ id: "ms1", title: "Edited milestone", phase: "Phase 1", description: "", deliverables: "", amount: 999, currency: "USD", startDate: "2026-11-01", dueDate: "2026-11-10", paymentDueDate: "2026-11-10", acceptanceCriteria: "x", status: "pending", paymentStatus: "pending" }],
  };
  const unmodifiedLegacy = {
    id: "demo_proj_1",
    name: "Website redesign",
    clientName: "Sample Client",
    companyName: "Sample Company",
    clientEmail: "client@example.com",
    description: "Demo project",
    totalAmount: 1200,
    currency: "USD",
    startDate: "2026-11-01",
    overallDeadline: "2026-11-30",
    status: "active",
    isDemo: true,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    contractItems: defaultContractItems(),
    milestones: [{ id: "demo_ms_1", title: "Design approval", phase: "Phase 1", description: "", deliverables: "", amount: 400, currency: "USD", startDate: "2026-11-01", dueDate: "2026-11-08", paymentDueDate: "2026-11-08", acceptanceCriteria: "x", status: "delivered", paymentStatus: "pending" }],
  };
  const migrated = migrateLegacySeedProjects([unmodifiedLegacy, ambiguousLegacy, userProject]);
  assert.ok(!migrated.projects.some((p) => p === unmodifiedLegacy), "clearly unmodified legacy seed sample should be removed");
  assert.ok(migrated.projects.some((p) => p.id === userProject.id), "user-created project must be preserved");
  assert.ok(migrated.projects.some((p) => p.description === "User edited this legacy record"), "ambiguous legacy record must be preserved");
  assert.ok(migrated.preservedSeedNotices.length >= 1, "ambiguous preserved legacy records should be reported");
});

test("payment/totals helpers show agreed value, allocations, sent/received demo records, and outstanding without claiming PayPal verification", () => {
  const project = acceptanceProject("Totals Project", "Totals Client", 2);
  project.totalAmount = 2500; // 1100 allocated by default? acceptanceProject sets total to sum; override explicitly.
  project.milestones[0].amount = 1000;
  project.milestones[1].amount = 1100;
  project.milestones[1].id = "ms_outstanding";
  const events = [{ id: "e1", projectId: project.id, milestoneId: project.milestones[0].id, type: "payment_sent", amount: 1000, currency: "USD", date: "2026-11-10", note: "", isDemo: true, createdAt: "2026-11-10T00:00:00Z" }];
  const totals = computeProjectPaymentTotals(project, events, "2026-11-11");
  assert.equal(totals.agreedProjectValue, 2500);
  assert.equal(totals.milestoneAllocationsTotal, 2100);
  assert.equal(totals.unallocatedAmount, 400);
  assert.equal(totals.overAllocatedAmount, 0);
  assert.equal(totals.paymentsSentAmount, 1000);
  assert.equal(totals.paymentsReceivedAmount, 0);
  assert.equal(totals.outstandingAmount, 2100);
  assert.equal(totals.demoPaymentHistory.length, 1);
  assert.doesNotMatch(JSON.stringify(totals), /verified PayPal capture/i);
});

test("payments page clarifies demo-only totals and does not use PayPal/Supabase APIs", () => {
  const payments = fs.readFileSync("src/app/payments/page.tsx", "utf8");
  assert.doesNotMatch(payments, /\/api\/paypal/);
  assert.doesNotMatch(payments, /PayPalCheckoutButton|PaymentsLedger/);
  assert.doesNotMatch(payments, /supabase|createSupabase/);
  assert.match(payments, /demo record|demo\/planned|not verified PayPal captures/i);
  assert.match(payments, /Agreed project value|Milestone allocations|Outstanding/i);
});

test("settings removes developer/sponsor raw env and includes workspace view switch", () => {
  const settings = fs.readFileSync("src/app/settings/page.tsx", "utf8");
  assert.match(settings, /Switch workspace view|WorkspaceViewSettings/);
  assert.doesNotMatch(settings, /NEXT_PUBLIC_PAYPAL_CLIENT_ID=your_sandbox_client_id/);
  assert.doesNotMatch(settings, /Sponsor Technologies & Hackathon Tool Status/);
  assert.doesNotMatch(settings, /Core System Credentials/);
});


test("guided delivery example includes a downloadable, text-inspectable bundle and saved agreement loads for its project", () => {
  const sampleZip = fs.readFileSync("public/paymind-sample-delivery.zip");
  assert.ok(sampleZip.length > 1000, "sample delivery ZIP should be included in the app");
  const deliveryPage = fs.readFileSync("src/app/deliverables/page.tsx", "utf8");
  assert.match(deliveryPage, /paymind-sample-delivery\.zip/);
  const contractsPage = fs.readFileSync("src/app/contracts/page.tsx", "utf8");
  assert.match(contractsPage, /selectedProject\?\.contractText/);
});
