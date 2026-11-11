import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

console.log("======================================================================");
console.log("PAYMIND DATABASE MIGRATION & SCHEMA INTEGRITY VALIDATION TEST");
console.log("======================================================================\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
    failed++;
  }
}

const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const m001 = fs.readFileSync(path.join(migrationsDir, "001_initial_schema.sql"), "utf-8");
const m002 = fs.readFileSync(path.join(migrationsDir, "002_preview_and_demonstration.sql"), "utf-8");
const m003 = fs.readFileSync(path.join(migrationsDir, "003_payments_auth_and_webhooks.sql"), "utf-8");
const m004 = fs.readFileSync(path.join(migrationsDir, "004_alter_preview_identifiers_to_text.sql"), "utf-8");
const m005 = fs.readFileSync(path.join(migrationsDir, "005_fix_preview_rls_and_token_hash.sql"), "utf-8");

// Test 1: Verify all 5 migration files exist and have content
test("Test #1: Sequential migration files exist and are populated", () => {
  assert.ok(m001.length > 500, "001_initial_schema.sql should be populated");
  assert.ok(m002.length > 500, "002_preview_and_demonstration.sql should be populated");
  assert.ok(m003.length > 500, "003_payments_auth_and_webhooks.sql should be populated");
  assert.ok(m004.length > 500, "004_alter_preview_identifiers_to_text.sql should be populated");
  assert.ok(m005.length > 500, "005_fix_preview_rls_and_token_hash.sql should be populated");
});

// Test 2: Verify referential integrity foreign keys are recreated in migration 004
test("Test #2: All four foreign keys are explicitly checked and recreated in migration 004", () => {
  assert.ok(
    m004.includes("preview_audit_logs_session_id_fkey"),
    "preview_audit_logs_session_id_fkey must be referenced and recreated"
  );
  assert.ok(
    m004.includes("preview_sessions_project_id_fkey"),
    "preview_sessions_project_id_fkey must be referenced and recreated"
  );
  assert.ok(
    m004.includes("preview_sessions_milestone_id_fkey"),
    "preview_sessions_milestone_id_fkey must be referenced and recreated"
  );
  assert.ok(
    m004.includes("preview_sessions_seller_id_fkey"),
    "preview_sessions_seller_id_fkey must be referenced and recreated"
  );

  // Check ON DELETE actions
  assert.ok(m004.includes("REFERENCES public.projects(id) ON DELETE CASCADE"));
  assert.ok(m004.includes("REFERENCES public.milestones(id) ON DELETE SET NULL"));
  assert.ok(m004.includes("REFERENCES public.profiles(id) ON DELETE SET NULL"));
  assert.ok(m004.includes("REFERENCES public.preview_sessions(id) ON DELETE CASCADE"));
});

// Test 3: Verify individual table existence checks (Problem 3 fix)
test("Test #3: Migration 004 individually checks existence of each referenced table before alterations", () => {
  const individualChecks = [
    "table_name = 'preview_sessions'",
    "table_name = 'preview_audit_logs'",
    "table_name = 'projects'",
    "table_name = 'milestones'",
    "table_name = 'profiles'",
  ];

  for (const check of individualChecks) {
    assert.ok(m004.includes(check), `Migration 004 must individually check: ${check}`);
  }
});

// Test 4: Verify seller_id type integrity (Problem 4 fix)
test("Test #4: seller_id remains linked to profiles.id (UUID) and is made nullable for demo mode", () => {
  assert.ok(
    m004.includes("ALTER TABLE public.preview_sessions ALTER COLUMN seller_id DROP NOT NULL"),
    "seller_id must have NOT NULL dropped so unauthenticated demo sessions can store NULL"
  );
  assert.ok(
    m004.includes("FOREIGN KEY (seller_id) REFERENCES public.profiles(id)"),
    "seller_id must remain a foreign key referencing public.profiles(id)"
  );
  assert.ok(
    !m004.includes("ALTER COLUMN seller_id TYPE TEXT"),
    "seller_id must NEVER be converted to TEXT; it must match profiles.id (UUID)"
  );
});

// Test 5: Verify zero data loss safety (No destructive statements in executable SQL)
test("Test #5: Non-destructive migration safety (no DROP TABLE, no TRUNCATE, no DELETE)", () => {
  // Strip comments before checking for executable statements
  const executableSql = m004
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");

  assert.ok(!executableSql.includes("DROP TABLE"), "Migration 004 must NOT contain DROP TABLE statements");
  assert.ok(!executableSql.includes("TRUNCATE"), "Migration 004 must NOT contain TRUNCATE statements");
  assert.ok(!executableSql.includes("DELETE FROM"), "Migration 004 must NOT contain DELETE FROM statements");

  // Also check migration 005
  const executableSql5 = m005
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");

  assert.ok(!executableSql5.includes("DROP TABLE"), "Migration 005 must NOT contain DROP TABLE statements");
  assert.ok(!executableSql5.includes("TRUNCATE"), "Migration 005 must NOT contain TRUNCATE statements");
  assert.ok(!executableSql5.includes("DELETE FROM"), "Migration 005 must NOT contain DELETE FROM statements");
});

// Test 6: Verify insecure public SELECT policy is REMOVED (not created) in migration 004 and 005
test("Test #6: Insecure 'Public token access for authenticated preview' policy is DROPPED, not created", () => {
  const executableSql4 = m004
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");

  // Migration 004 must reference the policy name (to DROP it)
  assert.ok(
    m004.includes("Public token access for authenticated preview"),
    "Migration 004 must reference the insecure policy name (to DROP it)"
  );

  // Migration 004 must NOT create the insecure public SELECT policy
  const createPublicPolicy4 = executableSql4.match(
    /CREATE POLICY[^;]*"Public token access for authenticated preview"[^;]*;/g
  );
  assert.equal(
    createPublicPolicy4,
    null,
    "Migration 004 must NOT CREATE the unrestricted public SELECT policy"
  );

  // Migration 004 must have DROP POLICY IF EXISTS for the insecure policy
  assert.ok(
    executableSql4.includes("DROP POLICY IF EXISTS"),
    "Migration 004 must use DROP POLICY IF EXISTS to remove the insecure policy"
  );

  // Migration 005 must also DROP the insecure policy
  const executableSql5 = m005
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");

  assert.ok(
    m005.includes("Public token access for authenticated preview"),
    "Migration 005 must reference the insecure policy name"
  );
  assert.ok(
    executableSql5.includes("DROP POLICY IF EXISTS"),
    "Migration 005 must use DROP POLICY IF EXISTS to remove the insecure policy"
  );

  const createPublicPolicy5 = executableSql5.match(
    /CREATE POLICY[^;]*"Public token access for authenticated preview"[^;]*;/g
  );
  assert.equal(
    createPublicPolicy5,
    null,
    "Migration 005 must NOT CREATE the unrestricted public SELECT policy"
  );
});

// Test 7: Verify migration 002 definition aligns with migration 004 and uses token_hash
test("Test #7: Migration 002 fresh baseline uses token_hash (not raw session_token) and correct TEXT/UUID types", () => {
  assert.ok(m002.includes("id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text"));
  assert.ok(m002.includes("token_hash TEXT NOT NULL UNIQUE"),
    "Migration 002 must use token_hash (SHA-256) not raw session_token");
  assert.ok(!m002.includes("session_token TEXT"),
    "Migration 002 must NOT store raw session_token in the database");
  assert.ok(m002.includes("project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE"));
  assert.ok(m002.includes("milestone_id UUID REFERENCES public.milestones(id) ON DELETE SET NULL"));
  assert.ok(m002.includes("seller_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL"));
  assert.ok(m002.includes("session_id TEXT NOT NULL REFERENCES public.preview_sessions(id) ON DELETE CASCADE"));
});

// Test 8: Verify migration 005 replaces session_token with token_hash
test("Test #8: Migration 005 replaces raw session_token column with token_hash", () => {
  // Must add token_hash column
  assert.ok(
    m005.includes("token_hash"),
    "Migration 005 must add or reference the token_hash column"
  );
  // Must handle existing session_token data by hashing it
  assert.ok(
    m005.includes("sha256(session_token"),
    "Migration 005 must derive token_hash from sha256 of existing session_token"
  );
  // Must drop the raw session_token column
  assert.ok(
    m005.includes("DROP COLUMN session_token"),
    "Migration 005 must drop the raw session_token column"
  );
});

// Test 9: Verify migration 005 uses safe idempotent patterns
test("Test #9: Migration 005 is idempotent (uses IF NOT EXISTS / DROP IF EXISTS throughout)", () => {
  assert.ok(m005.includes("IF NOT EXISTS"), "Migration 005 must use IF NOT EXISTS guards");
  assert.ok(m005.includes("DROP POLICY IF EXISTS"), "Migration 005 must use DROP POLICY IF EXISTS");
  assert.ok(m005.includes("DROP INDEX IF EXISTS"), "Migration 005 must use DROP INDEX IF EXISTS");
  assert.ok(
    m005.includes("DROP CONSTRAINT IF EXISTS"),
    "Migration 005 must use DROP CONSTRAINT IF EXISTS"
  );
});

// Test 10: Verify migration 005 adds UNIQUE constraint on token_hash
test("Test #10: Migration 005 adds UNIQUE constraint on token_hash", () => {
  assert.ok(
    m005.includes("UNIQUE") && m005.includes("token_hash"),
    "Migration 005 must enforce UNIQUE on token_hash"
  );
});

console.log("\n----------------------------------------------------------------------");
console.log(`MIGRATION INTEGRITY SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log("----------------------------------------------------------------------\n");

if (failed > 0) process.exit(1);
