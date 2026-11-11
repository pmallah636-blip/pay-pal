import AdmZip from "adm-zip";
import {
  generateSecureToken,
  calculateSHA256,
  secureTimingCompare,
} from "../crypto-utils";
import {
  createSecurePreviewSession,
  verifyPreviewSession,
  revokePreviewSession,
  authorizeSourceInspectionSeller,
  acceptSourceInspectionTermsClient,
  getSanitizedSourceFiles,
} from "../session-manager";
import { validateDeliverableUpload } from "../upload-validator";

export interface AuditTestResult {
  testNumber: number;
  name: string;
  category: "Security" | "Authorization" | "Cryptographic" | "Integrity";
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

export function runSecurityAuditSuite(): AuditTestResult[] {
  const results: AuditTestResult[] = [];
  let testIdx = 1;

  // Test 1: Cryptographic Unpredictability of Session Tokens
  const token1 = generateSecureToken("tok_sec");
  const token2 = generateSecureToken("tok_sec");
  const isEntropySufficient =
    token1.startsWith("tok_sec_") &&
    token1.length >= 64 &&
    token1 !== token2;

  results.push({
    testNumber: testIdx++,
    name: "Session Token Cryptographic Unpredictability",
    category: "Cryptographic",
    passed: isEntropySufficient,
    expected:
      "Tokens generated via 256-bit crypto.randomBytes, prefixed, unique, length >= 64",
    actual: `Token sample length: ${token1.length}, prefix: ${token1.substring(0, 8)}, distinct: ${token1 !== token2}`,
  });

  // Test 2: Timing-Safe Comparison
  const strA = "secret_token_1234567890abcdef";
  const strB = "secret_token_1234567890abcdef";
  const strC = "secret_token_1234567890abcdeg";

  const timingMatch = secureTimingCompare(strA, strB);
  const timingMismatch = secureTimingCompare(strA, strC);

  results.push({
    testNumber: testIdx++,
    name: "Timing-Safe Comparison against Timing Attacks",
    category: "Cryptographic",
    passed: timingMatch && !timingMismatch,
    expected:
      "Constant-time comparison evaluates identical strings true and mismatched false",
    actual: `Identical: ${timingMatch}, 1-char diff: ${timingMismatch}`,
  });

  // Test 3: Create Session & Valid Access
  const session = createSecurePreviewSession({
    projectId: "proj_audit_001",
    projectTitle: "Audit Test Deliverable",
    version: "v1.0.0-test",
    sellerId: "usr_seller_001",
    sellerName: "Test Seller",
    clientName: "Test Client Inc.",
    clientEmail: "audit@client.com",
    durationHours: 24,
    allowedParts: {
      interactive_preview: true,
      documentation: true,
      source_inspection_requestable: true,
    },
    previewContent: {
      type: "web_app",
      title: "Test Preview",
      description: "Test description",
      read_only_files: [
        {
          path: "src/api.ts",
          language: "typescript",
          content:
            'const API_KEY = "TEST_SECRET_PLACEHOLDER"; export default API_KEY;',
          size_bytes: 80,
          sha256: "test",
        },
      ],
    },
  });

  const validVerification = verifyPreviewSession(
    session.id,
    session.session_token
  );

  results.push({
    testNumber: testIdx++,
    name: "Valid Token Authorization",
    category: "Authorization",
    passed:
      validVerification.authorized &&
      validVerification.status === "VALID",
    expected: "Valid token produces status VALID with authorized=true",
    actual: `Status: ${validVerification.status}, Authorized: ${validVerification.authorized}`,
  });

  // Test 4: Negative Test - Invalid Token Access
  const invalidTokenVerification = verifyPreviewSession(
    session.id,
    "tok_sec_attacker_guess"
  );

  results.push({
    testNumber: testIdx++,
    name: "Negative Test: Invalid Token Access Rejection",
    category: "Authorization",
    passed:
      !invalidTokenVerification.authorized &&
      invalidTokenVerification.status === "TOKEN_MISMATCH",
    expected:
      "Forged/guessed token rejected with TOKEN_MISMATCH and authorized=false",
    actual: `Status: ${invalidTokenVerification.status}, Authorized: ${invalidTokenVerification.authorized}`,
  });

  // Test 5: Negative Test - Nonexistent Session
  const nonExistentVerification = verifyPreviewSession(
    "prev_session_nonexistent"
  );

  results.push({
    testNumber: testIdx++,
    name: "Negative Test: Nonexistent Session ID Rejection",
    category: "Authorization",
    passed:
      !nonExistentVerification.authorized &&
      nonExistentVerification.status === "SESSION_NOT_FOUND",
    expected:
      "Unknown session ID rejected with SESSION_NOT_FOUND without fallback leak",
    actual: `Status: ${nonExistentVerification.status}, Authorized: ${nonExistentVerification.authorized}`,
  });

  // Test 6: Immediate Revocation by Seller
  const revokeSuccess = revokePreviewSession(
    session.id,
    "usr_seller_001"
  );

  const postRevokeVerification = verifyPreviewSession(
    session.id,
    session.session_token
  );

  results.push({
    testNumber: testIdx++,
    name: "Immediate Access Revocation",
    category: "Security",
    passed:
      revokeSuccess &&
      postRevokeVerification.status === "SESSION_REVOKED" &&
      !postRevokeVerification.authorized,
    expected:
      "Revoked session rejected immediately with status SESSION_REVOKED",
    actual: `Revoked: ${revokeSuccess}, Status: ${postRevokeVerification.status}`,
  });

  // Test 7: Negative Test - Unauthorized Revocation by Non-Seller
  const session2 = createSecurePreviewSession({
    projectId: "proj_audit_002",
    projectTitle: "Audit Test Deliverable 2",
    version: "v1.0.0-test",
    sellerId: "usr_seller_001",
    sellerName: "Test Seller",
    clientName: "Test Client Inc.",
    clientEmail: "audit@client.com",
    durationHours: 24,
    allowedParts: {
      interactive_preview: true,
      documentation: true,
      source_inspection_requestable: true,
    },
    previewContent: {
      type: "web_app",
      title: "Test Preview 2",
      description: "Test description",
    },
  });

  const unauthorizedRevoke = revokePreviewSession(
    session2.id,
    "usr_attacker_999"
  );

  results.push({
    testNumber: testIdx++,
    name: "Negative Test: Unauthorized Revocation Blocked",
    category: "Authorization",
    passed: !unauthorizedRevoke,
    expected:
      "Attacker cannot revoke another seller's preview session",
    actual: `Revocation attempted by non-seller: ${unauthorizedRevoke}`,
  });

  // Test 8: Dual-Consent Source Code Inspection (Stage 1)
  const initialSource = getSanitizedSourceFiles(
    session2.id,
    session2.session_token
  );

  results.push({
    testNumber: testIdx++,
    name: "Dual-Consent Source Inspection: Locked by Default",
    category: "Security",
    passed: !initialSource.unlocked,
    expected: "Source files locked before any consent is granted",
    actual: `Unlocked: ${initialSource.unlocked}, Error: ${initialSource.error}`,
  });

  // Test 9: Dual-Consent (Stage 2)
  authorizeSourceInspectionSeller(
    session2.id,
    "usr_seller_001"
  );

  const sellerOnlySource = getSanitizedSourceFiles(
    session2.id,
    session2.session_token
  );

  results.push({
    testNumber: testIdx++,
    name:
      "Dual-Consent Source Inspection: Locked with Seller Consent Only",
    category: "Security",
    passed: !sellerOnlySource.unlocked,
    expected:
      "Source files remain locked if client has not accepted inspection terms",
    actual: `Unlocked: ${sellerOnlySource.unlocked}, Error: ${sellerOnlySource.error}`,
  });

  // Test 10: Dual-Consent (Stage 3: Both consented + Secrets scrubbed)
  acceptSourceInspectionTermsClient(
    session2.id,
    session2.session_token
  );

  // Add a synthetic secret fixture to test redaction.
  session2.preview_content.read_only_files = [
    {
      path: "src/config.ts",
      language: "typescript",
      content:
        'export const SECRET_KEY = "TEST_SECRET_PLACEHOLDER_123456789";',
      size_bytes: 70,
      sha256: "dummy",
    },
  ];

  const bothConsentSource = getSanitizedSourceFiles(
    session2.id,
    session2.session_token
  );

  const secretWasScrubbed =
    bothConsentSource.unlocked &&
    Boolean(
      bothConsentSource.files?.[0].content.includes(
        "[REDACTED_SECRET_"
      )
    ) &&
    !bothConsentSource.files?.[0].content.includes(
      "TEST_SECRET_PLACEHOLDER_123456789"
    );

  results.push({
    testNumber: testIdx++,
    name:
      "Dual-Consent Source Inspection: Unlocked & Secrets Redacted",
    category: "Security",
    passed: bothConsentSource.unlocked && secretWasScrubbed,
    expected:
      "Unlocked only after mutual consent, with credentials scrubbed",
    actual: `Unlocked: ${bothConsentSource.unlocked}, Secrets Scrubbed: ${secretWasScrubbed}`,
  });

  // Test 11: Real SHA-256 Digest Calculation from Buffer
  const samplePayload = Buffer.from(
    "PayMind Immutable Deliverable Payload V1.0"
  );

  const actualHash = calculateSHA256(samplePayload);

  const expectedHash =
    "a991c47c5485b243241aa9a1002f5e78c6d41745bcbb9d0b45ac320b354e27a2";

  results.push({
    testNumber: testIdx++,
    name: "SHA-256 Cryptographic Hash Verification",
    category: "Cryptographic",
    passed: actualHash === expectedHash,
    expected: `Hash: ${expectedHash}`,
    actual: `Hash: ${actualHash}`,
  });

  // Test 12: File Upload Validation - Clean Zip Archive
  const cleanZip = new AdmZip();

  cleanZip.addFile(
    "index.html",
    Buffer.from("<h1>Hello PayMind</h1>")
  );

  cleanZip.addFile(
    "assets/styles.css",
    Buffer.from("body { color: blue; }")
  );

  const cleanBuffer = cleanZip.toBuffer();

  const cleanValidation = validateDeliverableUpload(
    cleanBuffer,
    "clean-deliverable.zip"
  );

  results.push({
    testNumber: testIdx++,
    name: "File Upload: Valid Clean Zip Archive",
    category: "Integrity",
    passed:
      cleanValidation.valid &&
      cleanValidation.errors.length === 0,
    expected: "Clean zip validated successfully with zero errors",
    actual: `Valid: ${cleanValidation.valid}, Errors: [${cleanValidation.errors.join(", ")}]`,
  });

  // Test 13: File Upload Negative Test - Zip Slip Path Traversal
  const maliciousZip = new AdmZip();

  maliciousZip.addFile(
    "dummy.txt",
    Buffer.from("root:x:0:0:root:/root:/bin/bash")
  );

  maliciousZip.getEntries()[0].entryName = "../../etc/passwd";

  const maliciousBuffer = maliciousZip.toBuffer();

  const maliciousValidation = validateDeliverableUpload(
    maliciousBuffer,
    "malicious.zip"
  );

  const traversalBlocked = maliciousValidation.errors.some(
    (e) => e.includes("PATH_TRAVERSAL_DETECTED")
  );

  results.push({
    testNumber: testIdx++,
    name: "Negative Test: Zip Slip Path Traversal Rejected",
    category: "Security",
    passed: !maliciousValidation.valid && traversalBlocked,
    expected:
      "Archive with ../../ path traversal rejected with PATH_TRAVERSAL_DETECTED",
    actual: `Valid: ${maliciousValidation.valid}, Errors: [${maliciousValidation.errors.join(", ")}]`,
  });

  // Test 14: File Upload Negative Test - Prohibited Executable
  const exeZip = new AdmZip();

  exeZip.addFile(
    "payload.exe",
    Buffer.from("MZ\x90\x00\x03\x00\x00\x00")
  );

  const exeBuffer = exeZip.toBuffer();

  const exeValidation = validateDeliverableUpload(
    exeBuffer,
    "package-with-exe.zip"
  );

  const exeBlocked = exeValidation.errors.some(
    (e) => e.includes("DANGEROUS_FILE_DETECTED")
  );

  results.push({
    testNumber: testIdx++,
    name: "Negative Test: Prohibited Executable Rejected",
    category: "Security",
    passed: !exeValidation.valid && exeBlocked,
    expected:
      "Archive with .exe binary rejected with DANGEROUS_FILE_DETECTED",
    actual: `Valid: ${exeValidation.valid}, Errors: [${exeValidation.errors.join(", ")}]`,
  });

  // Test 15: File Upload Negative Test - File Size Exceeded
  const oversizedBuffer = Buffer.alloc(30 * 1024 * 1024);

  const sizeValidation = validateDeliverableUpload(
    oversizedBuffer,
    "huge.zip",
    {
      maxSizeBytes: 25 * 1024 * 1024,
    }
  );

  const sizeBlocked = sizeValidation.errors.some(
    (e) => e.includes("FILE_TOO_LARGE")
  );

  results.push({
    testNumber: testIdx++,
    name: "Negative Test: Oversized File Upload Blocked",
    category: "Security",
    passed: !sizeValidation.valid && sizeBlocked,
    expected: "File exceeding 25MB rejected with FILE_TOO_LARGE",
    actual: `Valid: ${sizeValidation.valid}, Errors: [${sizeValidation.errors.join(", ")}]`,
  });

  return results;
}
