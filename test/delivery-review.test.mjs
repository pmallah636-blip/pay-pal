import test from "node:test";
import assert from "node:assert/strict";
import {
  DELIVERY_LIMITS,
  normalizeArchivePath,
  shouldInspectTextPath,
  planArchiveInspection,
  validateEvidence,
  deterministicDeliveryHints,
  redactSensitiveText,
} from "../src/lib/paymind/intelligence/delivery-review-core.mjs";

test("delivery review rejects ZIP path traversal and absolute paths", () => {
  assert.equal(normalizeArchivePath("src/components/page.tsx").safe, true);
  assert.equal(normalizeArchivePath("../../etc/passwd").safe, false);
  assert.equal(normalizeArchivePath("C:\\Windows\\win.ini").safe, false);
  assert.equal(normalizeArchivePath("/root/file.txt").safe, false);
});

test("delivery review only inspects selected text files and skips private/build folders", () => {
  assert.equal(shouldInspectTextPath("src/app/page.tsx"), true);
  assert.equal(shouldInspectTextPath("README.md"), true);
  assert.equal(shouldInspectTextPath("node_modules/react/index.js"), false);
  assert.equal(shouldInspectTextPath(".git/config"), false);
  assert.equal(shouldInspectTextPath(".env.local"), false);
  assert.equal(shouldInspectTextPath(".env.example"), true);
  assert.equal(shouldInspectTextPath("dist/app.min.js"), false);
  assert.equal(shouldInspectTextPath("assets/logo.png"), false);
});

test("delivery review enforces archive entry, uncompressed size and compression-ratio limits", () => {
  const tooMany = planArchiveInspection(Array.from({ length: DELIVERY_LIMITS.archiveEntries + 1 }, (_, i) => ({
    entryName: `src/${i}.ts`, isDirectory: false, size: 10, compressedSize: 5,
  })));
  assert.equal(tooMany.ok, false);

  const tooLarge = planArchiveInspection([{ entryName: "src/large.ts", isDirectory: false, size: DELIVERY_LIMITS.archiveUncompressedBytes + 1, compressedSize: 100 }]);
  assert.equal(tooLarge.ok, false);

  const zipBomb = planArchiveInspection([{ entryName: "src/large.txt", isDirectory: false, size: 300_000, compressedSize: 100 }]);
  assert.equal(zipBomb.ok, false);
});

test("delivery archive planner keeps inspectable source and skips dependencies/secrets", () => {
  const plan = planArchiveInspection([
    { entryName: "src/app/page.tsx", isDirectory: false, size: 1200, compressedSize: 600 },
    { entryName: "README.md", isDirectory: false, size: 500, compressedSize: 250 },
    { entryName: "node_modules/pkg/index.js", isDirectory: false, size: 5000, compressedSize: 2500 },
    { entryName: ".env.local", isDirectory: false, size: 200, compressedSize: 100 },
    { entryName: "public/logo.png", isDirectory: false, size: 900, compressedSize: 800 },
  ]);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.candidates.map((file) => file.path), ["src/app/page.tsx", "README.md"]);
  assert.equal(plan.skippedPaths.length, 3);
});

test("AI evidence is retained only when its exact quote exists in the inspected file", () => {
  const findings = [{
    requirement: "Contact form",
    status: "evidence_found",
    explanation: "The form was located.",
    evidence: [
      { filePath: "src/contact.tsx", quote: "<form id=\"contact\">" },
      { filePath: "src/contact.tsx", quote: "this quote is made up" },
      { filePath: "missing.ts", quote: "<form id=\"contact\">" },
    ],
  }];
  const validated = validateEvidence(findings, [{ path: "src/contact.tsx", content: "export default function Contact(){ return <form id=\"contact\">Send</form>; }" }]);
  assert.equal(validated[0].evidence.length, 1);
  assert.equal(validated[0].evidence[0].quote, "<form id=\"contact\">");
});

test("fabricated AI evidence is downgraded to human review", () => {
  const validated = validateEvidence([{
    requirement: "Contact form",
    status: "evidence_found",
    explanation: "The form exists.",
    evidence: [{ filePath: "src/contact.tsx", quote: "made up evidence that is not present" }],
  }], [{ path: "src/contact.tsx", content: "export default function Contact(){ return null; }" }]);
  assert.equal(validated[0].status, "needs_human_review");
  assert.equal(validated[0].evidence.length, 0);
  assert.match(validated[0].explanation, /could not be matched/);
});

test("deterministic fallback never claims functional verification", () => {
  const findings = deterministicDeliveryHints(["Contact form includes email and message fields"], [
    { path: "src/contact.tsx", content: "<form><input name=\"email\" /><textarea name=\"message\" /></form>" },
  ]);
  assert.equal(findings.length, 1);
  assert.ok(["evidence_found", "needs_human_review"].includes(findings[0].status));
  assert.match(findings[0].explanation, /does not prove the feature works|evidence is incomplete/);
});


test("a positive AI finding without verifiable evidence is downgraded", () => {
  const validated = validateEvidence([{
    requirement: "Payment history page",
    status: "evidence_found",
    explanation: "The page is present.",
    evidence: [],
  }], [{ path: "src/app/page.tsx", content: "export default function Page() { return null; }" }]);
  assert.equal(validated[0].status, "needs_human_review");
  assert.match(validated[0].explanation, /did not provide a verifiable quotation/);
});


test("credential-like strings are redacted before delivery text reaches the AI provider", () => {
  const sanitized = redactSensitiveText('const client_secret = "super-secret-value-123";\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz123456\nconst key = "sk_live_12345678901234567890";');
  assert.doesNotMatch(sanitized, /super-secret-value-123/);
  assert.doesNotMatch(sanitized, /Bearer abcdefghijklmnopqrstuvwxyz123456/);
  assert.doesNotMatch(sanitized, /sk_live_12345678901234567890/);
  assert.match(sanitized, /REDACTED/);
});

test("delivery review rejects duplicate normalized archive paths", () => {
  const result = planArchiveInspection([
    { entryName: "src/page.tsx", isDirectory: false, size: 20, compressedSize: 10 },
    { entryName: "src\\page.tsx", isDirectory: false, size: 20, compressedSize: 10 },
  ]);
  assert.equal(result.ok, false);
  assert.match(result.error, /duplicate normalized path/i);
});

test("delivery review skips common credential directories and redacts common provider tokens", () => {
  assert.equal(shouldInspectTextPath(".aws/credentials"), false);
  assert.equal(shouldInspectTextPath("secrets/paypal.ts"), false);
  assert.equal(shouldInspectTextPath("credentials/service-account.json"), false);
  const sanitized = redactSensitiveText("AIza1234567890123456789012345678901234567 AKIA1234567890ABCDEF eyJabcdefghijk.abcdefghijk.abcdefghijk");
  assert.doesNotMatch(sanitized, /AIza1234567890/);
  assert.doesNotMatch(sanitized, /AKIA1234567890ABCDEF/);
  assert.doesNotMatch(sanitized, /eyJabcdefghijk/);
});
