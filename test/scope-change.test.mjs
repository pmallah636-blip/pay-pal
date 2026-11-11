import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("src/app/api/intelligence/scope-change/route.ts", "utf8");
const page = readFileSync("src/app/scope-changes/page.tsx", "utf8");
const sidebar = readFileSync("src/components/layout/Sidebar.tsx", "utf8");
const delivery = readFileSync("src/app/deliverables/page.tsx", "utf8");

test("scope change endpoint validates bounded contract and request inputs", () => {
  assert.match(route, /contractText: z\.string\(\)\.trim\(\)\.min\(40\)\.max\(60_000\)/);
  assert.match(route, /newRequest: z\.string\(\)\.trim\(\)\.min\(10\)\.max\(8_000\)/);
});
test("scope change endpoint uses server-only provider credentials and validates model output", () => {
  assert.match(route, /process\.env\.OPENAI_API_KEY/);
  assert.match(route, /process\.env\.GEMINI_API_KEY/);
  assert.match(route, /ResultSchema\.safeParse/);
  assert.doesNotMatch(page, /OPENAI_API_KEY|GEMINI_API_KEY/);
});
test("fallback never asserts legal scope or invents price and deadline", () => {
  assert.match(route, /classification = "unclear"/);
  assert.match(route, /no amount has been invented/);
  assert.match(page, /does not change the agreement/);
});
test("scope change UI is navigable and linked from delivery check", () => {
  assert.match(sidebar, /Scope Changes.*\/scope-changes/);
  assert.match(page, /Compare a new request/);
  assert.match(delivery, /href="\/scope-changes"/);
});
test("contract-to-delivery checker uses saved contract requirements and evidence review API", () => {
  assert.match(delivery, /contractRequirements/);
  assert.match(delivery, /api\/intelligence\/delivery-review/);
  assert.match(delivery, /Run contract-to-delivery check/);
});
