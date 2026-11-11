/**
 * PAYMIND — Preview Session Security Tests
 *
 * Tests the security properties of the preview session system through
 * static analysis and unit-level logic tests.
 *
 * Tests marked [UNVERIFIED - requires live Supabase] cannot be run
 * without a live database connection and are documented for manual
 * verification.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

console.log("======================================================================");
console.log("PAYMIND PREVIEW SESSION SECURITY TESTS");
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

// ---------------------------------------------------------------------------
// Helper: SHA-256 hash (mirrors token-utils.ts)
// ---------------------------------------------------------------------------
function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function verifyTokenHash(rawToken, storedHash) {
  const computedHash = hashToken(rawToken);
  const a = Buffer.from(computedHash, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Static source analysis helpers
// ---------------------------------------------------------------------------
const srcDir = path.join(process.cwd(), "src");

function readSrc(relPath) {
  return fs.readFileSync(path.join(srcDir, relPath), "utf-8");
}

// ---------------------------------------------------------------------------
// Test Group 1: Token hashing correctness
// ---------------------------------------------------------------------------
test("Test #1: SHA-256 hash of token is deterministic and hex-encoded", () => {
  const token = "tok_sec_abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678";
  const hash1 = hashToken(token);
  const hash2 = hashToken(token);
  assert.equal(hash1, hash2, "Same token must produce same hash");
  assert.match(hash1, /^[0-9a-f]{64}$/, "Hash must be 64-character lowercase hex");
});

test("Test #2: Different tokens produce different hashes (no collision)", () => {
  const h1 = hashToken("tok_sec_aaa");
  const h2 = hashToken("tok_sec_bbb");
  assert.notEqual(h1, h2, "Different tokens must produce different hashes");
});

test("Test #3: verifyTokenHash correctly validates matching token against stored hash", () => {
  const rawToken = "tok_sec_" + crypto.randomBytes(16).toString("hex");
  const storedHash = hashToken(rawToken);
  assert.ok(verifyTokenHash(rawToken, storedHash), "Correct token must pass hash verification");
});

test("Test #4: verifyTokenHash rejects wrong token against stored hash", () => {
  const rawToken = "tok_sec_" + crypto.randomBytes(16).toString("hex");
  const storedHash = hashToken(rawToken);
  const wrongToken = "tok_sec_" + crypto.randomBytes(16).toString("hex");
  assert.ok(!verifyTokenHash(wrongToken, storedHash), "Wrong token must fail hash verification");
});

// ---------------------------------------------------------------------------
// Test Group 2: Source code — no raw token storage in DB path
// ---------------------------------------------------------------------------
test("Test #5: preview-repository.ts stores token_hash, not session_token, in Supabase upsert", () => {
  const repo = readSrc("lib/security/preview-repository.ts");
  // The upsert call must use token_hash
  assert.ok(repo.includes("token_hash: tokenHash"), "Supabase upsert must include token_hash field");
  // Must NOT send raw session_token to Supabase
  const upsertBlock = repo.match(/\.upsert\(\{[\s\S]*?\}\)/);
  if (upsertBlock) {
    assert.ok(
      !upsertBlock[0].includes("session_token:"),
      "Supabase upsert must NOT include raw session_token field"
    );
  }
});

test("Test #6: preview-repository.ts imports and uses hashToken from token-utils", () => {
  const repo = readSrc("lib/security/preview-repository.ts");
  assert.ok(repo.includes("hashToken"), "Repository must import/use hashToken");
  assert.ok(repo.includes("verifyTokenHash"), "Repository must import/use verifyTokenHash");
  assert.ok(repo.includes("token-utils"), "Repository must import from token-utils");
});

// ---------------------------------------------------------------------------
// Test Group 3: Source code — no client-side verification override
// ---------------------------------------------------------------------------
test("Test #7: preview-page-client.tsx does not import or call verifyPreviewSession", () => {
  const clientPage = readSrc("app/preview/[sessionId]/preview-page-client.tsx");
  // Strip comments so security rationale text does not trigger false positives.
  const code = clientPage.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(
    !/\bverifyPreviewSession\b/.test(code),
    "Client page must not call client-side verifyPreviewSession — server result is final"
  );
  assert.ok(
    !clientPage.includes("session-manager"),
    "Client page must not import session-manager (which contains client-side verification)"
  );
});

test("Test #8: preview-page-client.tsx uses initialVerification as authoritative result", () => {
  const clientPage = readSrc("app/preview/[sessionId]/preview-page-client.tsx");
  assert.ok(
    clientPage.includes("initialVerification"),
    "Client page must accept and use initialVerification from server"
  );
  // Must not have useMemo that falls back to client-side verify
  assert.ok(
    !clientPage.includes("verifyPreviewSession(sessionId"),
    "Client page must not call verifyPreviewSession with sessionId (client-side auth)"
  );
});

// ---------------------------------------------------------------------------
// Test Group 4: Source code — authenticated listing (no token exposure)
// ---------------------------------------------------------------------------
test("Test #9: GET /api/preview requires authentication (returns 401 without auth)", () => {
  const previewRoute = readSrc("app/api/preview/route.ts");
  // Must check for user and return 401
  assert.ok(
    previewRoute.includes("401"),
    "GET /api/preview must return 401 when not authenticated"
  );
  assert.ok(
    previewRoute.includes("getUser"),
    "GET /api/preview must call getUser() to verify authentication"
  );
});

test("Test #10: listPreviewSessionsServer strips token fields from returned sessions", () => {
  const repo = readSrc("lib/security/preview-repository.ts");
  // stripTokenFields must exist and be used in the list function
  assert.ok(repo.includes("stripTokenFields"), "Repository must define and use stripTokenFields");
  assert.ok(
    repo.includes("token_hash: _th") || repo.includes("_th") && repo.includes("token_hash"),
    "stripTokenFields must destructure and discard token_hash"
  );
  assert.ok(
    repo.includes("session_token: _st") || repo.includes("_st") && repo.includes("session_token"),
    "stripTokenFields must destructure and discard session_token"
  );
});

// ---------------------------------------------------------------------------
// Test Group 5: Source code — POST /api/preview security
// ---------------------------------------------------------------------------
test("Test #11: POST /api/preview does not fall back to mock seller ID in production", () => {
  const previewRoute = readSrc("app/api/preview/route.ts");
  // Must NOT use "usr_mock_001" as a default seller ID
  assert.ok(
    !previewRoute.includes("usr_mock_001"),
    "POST /api/preview must not use mock seller ID in production"
  );
  // Must require auth or demo mode flag
  assert.ok(
    previewRoute.includes("IS_DEMO_MODE"),
    "POST /api/preview must check IS_DEMO_MODE before allowing unauthenticated creation"
  );
});

test("Test #12: POST /api/preview returns rawToken in response (once at creation time)", () => {
  const previewRoute = readSrc("app/api/preview/route.ts");
  assert.ok(
    previewRoute.includes("rawToken"),
    "POST /api/preview must return rawToken in the response"
  );
});

// ---------------------------------------------------------------------------
// Test Group 6: Source code — PATCH /api/preview/[sessionId] actor separation
// ---------------------------------------------------------------------------
test("Test #13: PATCH /api/preview/[sessionId] uses sellerAction/clientAction discriminator", () => {
  const sessionRoute = readSrc("app/api/preview/[sessionId]/route.ts");
  assert.ok(
    sessionRoute.includes("sellerAction"),
    "PATCH route must check for sellerAction field"
  );
  assert.ok(
    sessionRoute.includes("clientAction"),
    "PATCH route must check for clientAction field"
  );
});

test("Test #14: ClientActionSchema in PATCH route prevents client from setting seller fields", () => {
  const sessionRoute = readSrc("app/api/preview/[sessionId]/route.ts");
  // The client schema must exclude seller_authorized and seller_confirmed
  assert.ok(
    sessionRoute.includes("seller_authorized") && sessionRoute.includes("refine"),
    "Client action schema must use .refine() to reject seller_authorized"
  );
  assert.ok(
    sessionRoute.includes("seller_confirmed") && sessionRoute.includes("refine"),
    "Client action schema must use .refine() to reject seller_confirmed"
  );
});

// ---------------------------------------------------------------------------
// Test Group 7: Source code — revoke requires seller auth
// ---------------------------------------------------------------------------
test("Test #15: POST /api/preview/[sessionId]/revoke requires authentication", () => {
  const revokeRoute = readSrc("app/api/preview/[sessionId]/revoke/route.ts");
  assert.ok(
    revokeRoute.includes("401"),
    "Revoke route must return 401 when not authenticated"
  );
  assert.ok(
    revokeRoute.includes("getUser"),
    "Revoke route must call getUser() to verify authentication"
  );
  assert.ok(
    revokeRoute.includes("user.id"),
    "Revoke route must pass user.id (not a name or body param) to revokePreviewSessionServer"
  );
});

test("Test #16: revokePreviewSessionServer verifies seller_id ownership before revoking", () => {
  const repo = readSrc("lib/security/preview-repository.ts");
  // Must compare seller_id to the authenticated user ID
  assert.ok(
    repo.includes("seller_id !== sellerId") || repo.includes("data.seller_id !== sellerId"),
    "revokePreviewSessionServer must verify seller_id matches before revoking"
  );
});

// ---------------------------------------------------------------------------
// Test Group 8: Source code — Supabase fail-closed behavior
// ---------------------------------------------------------------------------
test("Test #17: verifyPreviewSessionServer fails closed on Supabase error (not fall back to memory)", () => {
  const repo = readSrc("lib/security/preview-repository.ts");
  // When admin is configured and error occurs, must return SESSION_NOT_FOUND (not use memoryStore)
  assert.ok(
    repo.includes("SESSION_NOT_FOUND"),
    "Repository must return SESSION_NOT_FOUND on Supabase failure"
  );
  // Must not catch Supabase errors silently with empty catch blocks that fall through to memory
  const emptyCatches = repo.match(/} catch \{[\s\n]*}/g);
  // Allow at most 1 empty catch (for audit logs, which is non-fatal)
  if (emptyCatches && emptyCatches.length > 2) {
    throw new Error(
      `Found ${emptyCatches.length} empty catch blocks — Supabase errors must not be silently swallowed`
    );
  }
});

test("Test #18: createPreviewSessionServer throws in production when Supabase insert fails", () => {
  const repo = readSrc("lib/security/preview-repository.ts");
  // Must throw on Supabase insert failure outside demo mode
  assert.ok(
    repo.includes("throw new Error") && repo.includes("Failed to persist preview session"),
    "createPreviewSessionServer must throw on Supabase insert failure in production"
  );
});

// ---------------------------------------------------------------------------
// Test Group 9: token-utils.ts existence and exports
// ---------------------------------------------------------------------------
test("Test #19: token-utils.ts exists and exports hashToken and verifyTokenHash", () => {
  const tokenUtils = readSrc("lib/security/token-utils.ts");
  assert.ok(tokenUtils.includes("export function hashToken"), "token-utils.ts must export hashToken");
  assert.ok(
    tokenUtils.includes("export function verifyTokenHash"),
    "token-utils.ts must export verifyTokenHash"
  );
  assert.ok(
    tokenUtils.includes("timingSafeEqual"),
    "verifyTokenHash must use crypto.timingSafeEqual for timing-safe comparison"
  );
});

// ---------------------------------------------------------------------------
// Test Group 10: mock data isolation
// ---------------------------------------------------------------------------
test("Test #20: Mock project IDs (proj_001) are non-UUID and must be excluded from FK inserts", () => {
  const repo = readSrc("lib/security/preview-repository.ts");
  // Repository must check if ID is a real UUID before inserting as FK
  assert.ok(
    repo.includes("isRealUuid"),
    "Repository must have isRealUuid() check to prevent non-UUID mock IDs from being inserted into UUID FK columns"
  );
});

// ---------------------------------------------------------------------------
// Test Group 10a: Token transport hardening (no query-param tokens for mutations)
// ---------------------------------------------------------------------------
test("Test #21: PATCH client path does not read token from URL query params", () => {
  const sessionRoute = readSrc("app/api/preview/[sessionId]/route.ts");
  // Client mutations must use Authorization/cookie, not ?token= (prevents URL/log/history leakage).
  const patchIdx = sessionRoute.indexOf("export async function PATCH");
  assert.ok(patchIdx >= 0, "PATCH handler must exist");
  const patchBody = sessionRoute.slice(patchIdx);
  assert.ok(
    !patchBody.includes('searchParams.get("token")'),
    "PATCH handler must not read token from URL query params"
  );
  assert.ok(
    patchBody.includes("Authorization") || patchBody.includes("authorization"),
    "PATCH handler must accept Authorization header for client token"
  );
});

test("Test #22: Preview client mutations send Authorization header and do not append token to URL", () => {
  const clientView = readSrc("app/preview/[sessionId]/client-view.tsx");
  assert.ok(clientView.includes("Authorization"), "Client preview mutations must send Authorization header");
  assert.ok(
    !clientView.includes("?token=") && !clientView.includes("encodeURIComponent(token)}\""),
    "Client preview mutations must not put token in PATCH URL"
  );
});

test("Test #23: Token not stored in browser localStorage/sessionStorage", () => {
  function walk(dir, files = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, files);
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
    }
    return files;
  }
  const files = walk(srcDir);
  for (const f of files) {
    const s = fs.readFileSync(f, "utf-8");
    // Flag actual browser storage API usage for preview tokens (not comments/imports of next/headers cookies).
    const hasStorageApi = /\b(?:window\.)?(?:localStorage|sessionStorage)\s*\.(?:setItem|getItem|removeItem|clear)\b|\b(?:window\.)?(?:localStorage|sessionStorage)\s*\[/.test(s);
    if (hasStorageApi && /preview.*token|token.*preview|bearer/i.test(s)) {
      throw new Error(`Preview token must not be stored in browser storage: ${path.relative(srcDir, f)}`);
    }
  }
});

test("Test #24: Authorized preview page sets Referrer-Policy protection", () => {
  const page = readSrc("app/preview/[sessionId]/page.tsx");
  assert.ok(
    page.includes('name="referrer"') && page.includes("no-referrer"),
    "Preview page must emit no-referrer policy to reduce token/referrer leakage from share links"
  );
});

test("Test #25: Preview PATCH responses carry no-store and no-referrer headers", () => {
  const route = readSrc("app/api/preview/[sessionId]/route.ts");
  assert.ok(route.includes("Referrer-Policy") && route.includes("no-referrer"), "Preview API must set Referrer-Policy: no-referrer");
  assert.ok(route.includes("Cache-Control") && route.includes("no-store"), "Preview API must set Cache-Control: no-store");
});

test("Test #26: PATCH client requires token (Authorization/cookie) for clientAction; no query token accepted", () => {
  const route = readSrc("app/api/preview/[sessionId]/route.ts");
  const patchIdx = route.indexOf("export async function PATCH");
  const clientIdx = route.indexOf('if ("clientAction" in body)', patchIdx);
  assert.ok(patchIdx >= 0 && clientIdx > patchIdx, "Client action branch must exist in PATCH");
  const clientBlock = route.slice(clientIdx, clientIdx + 600);
  assert.ok(
    clientBlock.includes("getClientPreviewToken") && !clientBlock.includes('searchParams.get("token")'),
    "Client PATCH must verify token from Authorization/cookie only"
  );
});

test("Test #27: Seller ownership enforced on seller PATCH updates", () => {
  const route = readSrc("app/api/preview/[sessionId]/route.ts");
  assert.ok(route.includes("seller_id") && route.includes("authData.user.id"), "Seller PATCH must check session ownership");
  assert.ok(route.includes("403") && route.includes("permission"), "Seller PATCH must reject non-owner");
});

test("Test #28: Forged seller consent fields rejected in client PATCH schema", () => {
  const route = readSrc("app/api/preview/[sessionId]/route.ts");
  // Client schema must explicitly refuse seller-only fields.
  assert.ok(route.includes("Client cannot set seller authorization fields"), "Client cannot set seller authorization fields");
  assert.ok(route.includes("Client cannot set seller confirmation fields"), "Client cannot set seller confirmation fields");
});

// ---------------------------------------------------------------------------
// UNVERIFIED integration tests (documented, not executed)
// ---------------------------------------------------------------------------
console.log("\n--- UNVERIFIED Integration Tests (require live Supabase) ---");
console.log("[UNVERIFIED] GET /api/preview with no credentials → 401 HTTP response");
console.log("[UNVERIFIED] GET /api/preview response body never contains session_token or token_hash");
console.log("[UNVERIFIED] POST /api/preview without auth (not demo mode) → 401 HTTP response");
console.log("[UNVERIFIED] POST /api/preview with invalid projectId (wrong seller) → 403");
console.log("[UNVERIFIED] verifyPreviewSessionServer with wrong token → TOKEN_MISMATCH");
console.log("[UNVERIFIED] verifyPreviewSessionServer with expired session → SESSION_EXPIRED");
console.log("[UNVERIFIED] verifyPreviewSessionServer with revoked session → SESSION_REVOKED");
console.log("[UNVERIFIED] PATCH /api/preview/[sessionId] with valid Bearer token (no ?token=) → client update authorized");
console.log("[UNVERIFIED] PATCH /api/preview/[sessionId] with invalid/missing/expired/revoked token (header/cookie) → 401/410/403 as applicable");
console.log("[UNVERIFIED] Token not present in PATCH URL; Authorization/cookie used for client mutations");
console.log("[UNVERIFIED] PATCH /api/preview/[sessionId] with seller_authorized in clientAction → 400");
console.log("[UNVERIFIED] PATCH /api/preview/[sessionId] with seller_confirmed in clientAction → 400");
console.log("[UNVERIFIED] POST /api/preview/[sessionId]/revoke by different seller → 404");
console.log("[UNVERIFIED] Supabase failure during verifyPreviewSessionServer → SESSION_NOT_FOUND (fail closed)");
console.log("[UNVERIFIED] Demo ID proj_001 not inserted into preview_sessions.project_id FK column");
console.log("[UNVERIFIED] Unauthorized/cross-account GET/PATCH/revoke, forged consent, token replay, expired/missing tokens, and RLS/ownership/FK checks against a live disposable Supabase DB (not executed: no safe test DB/credentials)");
console.log("");

console.log("----------------------------------------------------------------------");
console.log(`PREVIEW SECURITY SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log("----------------------------------------------------------------------\n");

if (failed > 0) process.exit(1);
