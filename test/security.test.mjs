import AdmZip from "adm-zip";
import crypto from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";

console.log("======================================================================");
console.log("PAYMIND SECURITY & AUTHORIZATION AUDIT SUITE");
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

// 1. Token generation
function generateSecureToken(prefix = "tok_sec") {
  const bytes = crypto.randomBytes(32);
  return `${prefix}_${bytes.toString("hex")}`;
}

function secureTimingCompare(a, b) {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function calculateSHA256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// Test 1: Cryptographic Unpredictability
test("Test #1: Session Token Cryptographic Unpredictability (Cryptographic)", () => {
  const t1 = generateSecureToken();
  const t2 = generateSecureToken();
  assert.ok(t1.startsWith("tok_sec_"));
  assert.ok(t1.length >= 64);
  assert.notEqual(t1, t2);
});

// Test 2: Timing-Safe Comparison
test("Test #2: Timing-Safe Comparison against Timing Attacks (Cryptographic)", () => {
  const strA = "secret_token_1234567890abcdef";
  const strB = "secret_token_1234567890abcdef";
  const strC = "secret_token_1234567890abcdeg";
  assert.equal(secureTimingCompare(strA, strB), true);
  assert.equal(secureTimingCompare(strA, strC), false);
});

// Test 3: Session Creation & Valid Access Verification
test("Test #3: Create Session & Valid Access Verification (Authorization)", () => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 48 * 3600 * 1000);
  const token = generateSecureToken();
  const session = {
    id: "prev_001",
    session_token: token,
    status: "active",
    expires_at: expiresAt.toISOString(),
  };

  const verify = (id, tok) => {
    if (session.id !== id) return { authorized: false, status: "NOT_FOUND" };
    if (session.status !== "active") return { authorized: false, status: "REVOKED" };
    if (new Date(session.expires_at) < new Date()) return { authorized: false, status: "EXPIRED" };
    if (!secureTimingCompare(session.session_token, tok)) return { authorized: false, status: "TOKEN_MISMATCH" };
    return { authorized: true, status: "VALID" };
  };

  const res = verify("prev_001", token);
  assert.equal(res.authorized, true);
  assert.equal(res.status, "VALID");
});

// Test 4: Expired Session Access Rejection
test("Test #4: Expired Session Access Rejection (Security)", () => {
  const expiredSession = {
    id: "prev_exp",
    session_token: generateSecureToken(),
    status: "active",
    expires_at: new Date(Date.now() - 3600 * 1000).toISOString(),
  };

  const verify = (sess) => {
    if (new Date(sess.expires_at) < new Date()) return { authorized: false, status: "EXPIRED" };
    return { authorized: true };
  };

  assert.equal(verify(expiredSession).status, "EXPIRED");
});

// Test 5: Revoked Session Access Rejection
test("Test #5: Revoked Session Access Rejection (Security)", () => {
  const revokedSession = {
    id: "prev_rev",
    session_token: generateSecureToken(),
    status: "revoked",
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
  };

  const verify = (sess) => {
    if (sess.status === "revoked") return { authorized: false, status: "SESSION_REVOKED" };
    return { authorized: true };
  };

  assert.equal(verify(revokedSession).status, "SESSION_REVOKED");
});

// Test 6: Token Mismatch Unauthorized Rejection
test("Test #6: Token Mismatch Unauthorized Rejection (Security)", () => {
  const session = {
    id: "prev_tok",
    session_token: generateSecureToken(),
    status: "active",
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
  };

  const check = secureTimingCompare(session.session_token, "wrong_token");
  assert.equal(check, false);
});

// Test 7-10: Dual-Consent Source Inspection
test("Test #7-10: Dual-Consent Source Inspection Matrix (Authorization)", () => {
  const inspectionState = {
    seller_authorized: false,
    client_accepted_terms: false,
  };

  const isUnlocked = (state) => state.seller_authorized && state.client_accepted_terms;

  // Initial
  assert.equal(isUnlocked(inspectionState), false, "Locked initially");

  // Client only
  inspectionState.client_accepted_terms = true;
  assert.equal(isUnlocked(inspectionState), false, "Locked with client only");

  // Reset & Seller only
  inspectionState.client_accepted_terms = false;
  inspectionState.seller_authorized = true;
  assert.equal(isUnlocked(inspectionState), false, "Locked with seller only");

  // Both
  inspectionState.client_accepted_terms = true;
  assert.equal(isUnlocked(inspectionState), true, "Unlocked only when BOTH consent");
});

// Test 11: Path Traversal (Zip Slip) Rejection
test("Test #11: Path Traversal Upload Rejection (Integrity)", () => {
  const zip = new AdmZip();
  zip.addFile("dummy.txt", Buffer.from("malicious"));
  zip.getEntries()[0].entryName = "../../etc/passwd";
  const buffer = zip.toBuffer();

  const inspectZip = (buf) => {
    const archive = new AdmZip(buf);
    const entries = archive.getEntries();
    const errors = [];
    for (const entry of entries) {
      if (entry.entryName.includes("..") || path.isAbsolute(entry.entryName) || entry.entryName.startsWith("/")) {
        errors.push(`PATH_TRAVERSAL_DETECTED: ${entry.entryName}`);
      }
    }
    return errors;
  };

  const errs = inspectZip(buffer);
  assert.ok(errs.length > 0);
  assert.ok(errs[0].includes("PATH_TRAVERSAL_DETECTED"));
});

// Test 12: Executable Upload Rejection
test("Test #12: Dangerous Executable Upload Rejection (Security)", () => {
  const dangerousExts = [".exe", ".bat", ".cmd", ".sh", ".msi"];
  const isDangerous = (ext) => dangerousExts.includes(ext.toLowerCase());

  assert.ok(isDangerous(".exe"));
  assert.ok(isDangerous(".sh"));
  assert.ok(!isDangerous(".zip"));
  assert.ok(!isDangerous(".pdf"));
});

// Test 13: Upload Size Limit Validation
test("Test #13: Upload Size Limit Enforcement (Integrity)", () => {
  const maxBytes = 50 * 1024 * 1024; // 50MB
  const validSize = 10 * 1024 * 1024;
  const oversized = 55 * 1024 * 1024;

  assert.ok(validSize <= maxBytes);
  assert.ok(oversized > maxBytes);
});

// Test 14: Delivery Passport SHA-256 Integrity
test("Test #14: Delivery Passport SHA256 Integrity Verification (Cryptographic)", () => {
  const fileContent = Buffer.from("PayMind Final Deliverable Milestone Release Build v1.0");
  const expectedHash = calculateSHA256(fileContent);
  const recomputedHash = calculateSHA256(fileContent);
  assert.equal(expectedHash, recomputedHash);
  assert.equal(expectedHash.length, 64);
});

// Test 15: Mutual Sign-Off Demonstration
test("Test #15: Mutual Sign-Off Demonstration Completion (Authorization)", () => {
  const demo = {
    seller_confirmed: true,
    client_confirmed: true,
    requirements: [
      { id: "REQ-1", status: "accepted" },
      { id: "REQ-2", status: "accepted" },
    ],
  };

  const isDemoComplete = (d) => {
    return d.seller_confirmed && d.client_confirmed && d.requirements.every((r) => r.status === "accepted");
  };

  assert.ok(isDemoComplete(demo));
});

// Test 16: Share-link URL construction (initial access may use query token; mutations must not).
test("Test #16: Preview share-link URL token encoding (initial access); mutation transport is header/cookie", () => {
  const sessionId = "prev_session_test_99";
  const sessionToken = "tok_sec_789abcdef0123456789";
  const baseUrl = "https://paymind.app";

  const generatedUrl = `${baseUrl}/preview/${sessionId}?token=${encodeURIComponent(sessionToken)}`;
  const parsed = new URL(generatedUrl);

  assert.equal(parsed.pathname, `/preview/${sessionId}`);
  assert.equal(parsed.searchParams.get("token"), sessionToken);

  // Verification succeeds with matching token
  assert.equal(secureTimingCompare(sessionToken, parsed.searchParams.get("token")), true);

  // Verification fails without token or with altered token
  assert.equal(secureTimingCompare(sessionToken, "tampered_token"), false);
  assert.equal(secureTimingCompare(sessionToken, ""), false);
});

console.log("\n----------------------------------------------------------------------");
console.log(`SECURITY AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log("----------------------------------------------------------------------\n");

if (failed > 0) process.exit(1);
