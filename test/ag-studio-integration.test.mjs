import assert from "node:assert/strict";
import fs from "node:fs";

console.log("=== AG STUDIO INTEGRATION (STATIC) TESTS ===\n");
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log("PASS: " + name);
    passed++;
  } catch (e) {
    console.error("FAIL: " + name);
    console.error(e);
    failed++;
  }
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
await test("AG Studio packages are declared with required peers", () => {
  assert.ok(["3.1.0", "^3.1.0", "~3.1.0"].includes(pkg.dependencies["ag-studio-react"]));
  assert.ok(["3.1.0", "^3.1.0", "~3.1.0"].includes(pkg.dependencies["ag-studio"]));
  assert.equal(pkg.dependencies["ag-stack"], "~36.3.0");
  assert.equal(pkg.dependencies["ag-grid-enterprise"], "~36.3.0");
  assert.ok(pkg.dependencies["ag-grid-react"]);
  assert.ok(pkg.dependencies["ag-grid-community"]);
});

const studio = fs.readFileSync("src/components/intelligence/FinancialIntelligenceStudio.tsx", "utf8");
await test("Financial Intelligence uses real AG Studio React/AI APIs", () => {
  for (const token of ["AgStudio", "AgStudioProvider", "AgStudioAiModule", "createAiHarness", "createServerProxyLlmAdapter", "/api/intelligence/studio"]) {
    assert.ok(studio.includes(token), token);
  }
});

const route = fs.readFileSync("src/app/api/intelligence/studio/route.ts", "utf8");
await test("Studio AI route is server-proxied, guarded, and sets no-store headers", () => {
  assert.ok(route.includes("getIntelligenceAccess"));
  assert.ok(route.includes("PAYMIND_AI_PROVIDER"));
  assert.ok(route.includes("Cache-Control"));
  assert.ok(route.includes("no-referrer"));
  assert.ok(!route.includes("NEXT_PUBLIC_OPENAI") && !route.includes("NEXT_PUBLIC_GEMINI"));
});

const page = fs.readFileSync("src/app/intelligence/page.tsx", "utf8");
await test("Intelligence page labels data provenance and verified-capture rule", () => {
  assert.ok(page.includes("is_verified_capture"));
  assert.ok(page.includes("seeded_demo"));
  assert.ok(page.includes("verified PayPal capture"));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
