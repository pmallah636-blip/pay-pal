import test from "node:test";
import assert from "node:assert/strict";
import { evaluateIntelligenceAccess } from "../src/lib/paymind/intelligence/intelligence-access-core.mjs";

const base = {
  isProduction: false,
  demoEnabled: false,
  supabaseConfigured: true,
  userId: null,
  authError: false,
};

test("verified Supabase users may use intelligence endpoints in production", () => {
  const result = evaluateIntelligenceAccess({ ...base, isProduction: true, userId: "user-123" });
  assert.deepEqual(result, { allowed: true, mode: "authenticated", userId: "user-123" });
});

test("production requests without a signed-in user are rejected", () => {
  const result = evaluateIntelligenceAccess({ ...base, isProduction: true });
  assert.equal(result.allowed, false);
  assert.equal(result.status, 401);
});

test("production without Supabase configuration is blocked", () => {
  const result = evaluateIntelligenceAccess({ ...base, isProduction: true, supabaseConfigured: false });
  assert.equal(result.allowed, false);
  assert.equal(result.status, 503);
});

test("explicit demo access works only outside production", () => {
  const result = evaluateIntelligenceAccess({ ...base, demoEnabled: true });
  assert.deepEqual(result, { allowed: true, mode: "demo", userId: null });
  const production = evaluateIntelligenceAccess({ ...base, isProduction: true, demoEnabled: true });
  assert.equal(production.allowed, false);
});

test("an unverifiable Supabase session never falls through to demo mode", () => {
  const result = evaluateIntelligenceAccess({ ...base, demoEnabled: true, authError: true });
  assert.equal(result.allowed, false);
  assert.equal(result.status, 401);
});
