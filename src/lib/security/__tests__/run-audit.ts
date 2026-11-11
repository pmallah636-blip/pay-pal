import { runSecurityAuditSuite, AuditTestResult } from "./audit-suite";

console.log("======================================================================");
console.log("PAYMIND SECURITY & FUNCTIONALITY AUDIT SUITE");
console.log("Automated Execution & Negative Authorization Verification");
console.log("======================================================================\n");

const startTime = Date.now();
const results: AuditTestResult[] = runSecurityAuditSuite();
const durationMs = Date.now() - startTime;

let passedCount = 0;
let failedCount = 0;

for (const r of results) {
  const statusMark = r.passed ? "[PASS]" : "[FAIL]";
  console.log(`${statusMark} Test #${r.testNumber}: ${r.name} (${r.category})`);
  console.log(`       Expected: ${r.expected}`);
  console.log(`       Actual:   ${r.actual}`);
  if (r.passed) {
    passedCount++;
  } else {
    failedCount++;
    if (r.details) console.log(`       Details:  ${r.details}`);
  }
  console.log("");
}

console.log("----------------------------------------------------------------------");
console.log(`AUDIT SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED in ${durationMs}ms`);
console.log("----------------------------------------------------------------------\n");

if (failedCount > 0) {
  console.error("CRITICAL: One or more security audit tests failed!");
  process.exit(1);
} else {
  console.log("SUCCESS: All 15 security and authorization tests passed cleanly.");
  process.exit(0);
}
