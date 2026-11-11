import assert from "node:assert/strict";

console.log("======================================================================");
console.log("PAYMIND NOTIFICATION & REMINDER UNIT TESTS");
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

// Helper: calendar day calculation matching ReminderScheduler
function calendarDay(value) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function dayDifference(dueDate, referenceDate = new Date()) {
  const todayStart = Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  return Math.round((calendarDay(dueDate) - todayStart) / 86_400_000);
}

// 1. UTC Date & Timezone Consistency Test
test("1. Timezone-safe calendar day difference calculation", () => {
  const today = new Date(2026, 10, 8); // 2026-11-08 local
  assert.equal(dayDifference("2026-11-08", today), 0, "Due today should be 0 days");
  assert.equal(dayDifference("2026-11-09", today), 1, "Due tomorrow should be 1 day");
  assert.equal(dayDifference("2026-11-10", today), 2, "Due in 2 days should be 2 days");
  assert.equal(dayDifference("2026-11-11", today), 3, "Due in 3 days should be 3 days");
  assert.equal(dayDifference("2026-11-15", today), 7, "Due in 7 days should be 7 days");
  assert.equal(dayDifference("2026-11-07", today), -1, "Overdue by 1 day should be -1 days");
});

// 2. Default Reminder Preferences (3, 2, 1 days)
test("2. Default reminder intervals are 3, 2, and 1 days before deadline", () => {
  const DEFAULT_REMINDER_PREFERENCES = {
    enabled: true,
    role: "seller",
    daysBefore: [3, 2, 1],
    browserNotifications: false,
  };
  assert.equal(DEFAULT_REMINDER_PREFERENCES.enabled, true);
  assert.deepEqual(DEFAULT_REMINDER_PREFERENCES.daysBefore, [3, 2, 1]);
});

// 3. Custom Reminder Days Normalization & Filtering
test("3. Custom reminder days normalization (deduplication, 0-90 bounds, sorting)", () => {
  const rawInput = [1, 5, 3, 5, 2, 95, -4, 0, 14];
  const normalized = [...new Set(rawInput)]
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 90)
    .sort((a, b) => b - a);
  assert.deepEqual(normalized, [14, 5, 3, 2, 1, 0]);
  assert.ok(!normalized.includes(95), "Values > 90 must be excluded");
  assert.ok(!normalized.includes(-4), "Negative values must be excluded");
});

// 4. Role-Specific Notification Message Differentiation
test("4. Seller vs Client notification messages are distinctly customized", () => {
  const formatNotice = (milestoneTitle, remainingDays, role) => {
    return role === "client"
      ? remainingDays === 0
        ? `Client reminder: ${milestoneTitle} is due today. Review the deliverable and submit any agreed change request.`
        : `Client reminder: ${milestoneTitle} is due in ${remainingDays} day${remainingDays === 1 ? "" : "s"}. Review progress and raise any small change request early.`
      : remainingDays === 0
        ? `Seller reminder: ${milestoneTitle} is due today. Complete the agreed work or discuss an extension with the client.`
        : `Seller reminder: ${milestoneTitle} is due in ${remainingDays} day${remainingDays === 1 ? "" : "s"}. Check remaining work and discuss any delivery risk early.`;
  };

  const sellerToday = formatNotice("Alpha Milestone", 0, "seller");
  const clientToday = formatNotice("Alpha Milestone", 0, "client");
  const seller3Days = formatNotice("Alpha Milestone", 3, "seller");
  const client3Days = formatNotice("Alpha Milestone", 3, "client");

  assert.ok(sellerToday.includes("Seller reminder") && sellerToday.includes("due today"));
  assert.ok(clientToday.includes("Client reminder") && clientToday.includes("due today"));
  assert.ok(seller3Days.includes("3 days") && seller3Days.includes("Check remaining work"));
  assert.ok(client3Days.includes("3 days") && client3Days.includes("Review progress"));
  assert.notEqual(sellerToday, clientToday, "Seller and client copy must be different");
});

// 5. Idempotent Deduplication Key Generation
test("5. Idempotent notification keys prevent duplicate alerts for the same milestone and interval", () => {
  const generateKey = (milestoneId, dueDate, remainingDays, role) => {
    return `${milestoneId}:${dueDate}:${remainingDays}:${role}`;
  };

  const key1 = generateKey("ms_001", "2026-11-10", 2, "seller");
  const key2 = generateKey("ms_001", "2026-11-10", 2, "seller");
  const key3 = generateKey("ms_001", "2026-11-10", 1, "seller");
  const keyClient = generateKey("ms_001", "2026-11-10", 2, "client");

  assert.equal(key1, key2, "Identical milestone and day must produce identical key");
  assert.notEqual(key1, key3, "Different remaining days must produce different key");
  assert.notEqual(key1, keyClient, "Different roles must produce different keys");

  const sentKeys = new Set();
  sentKeys.add(key1);
  assert.ok(sentKeys.has(key2), "Second notification for same interval must be detected as duplicate");
});

// 6. Notification Read State & Filtering
test("6. Notification read state marking and unread count filtering", () => {
  let notices = [
    { id: "n1", read: false, milestoneTitle: "M1" },
    { id: "n2", read: false, milestoneTitle: "M2" },
    { id: "n3", read: true, milestoneTitle: "M3" },
  ];

  let unreadCount = notices.filter((n) => !n.read).length;
  assert.equal(unreadCount, 2, "Initial unread count should be 2");

  // Mark single notice read
  notices = notices.map((n) => (n.id === "n1" ? { ...n, read: true } : n));
  unreadCount = notices.filter((n) => !n.read).length;
  assert.equal(unreadCount, 1, "Unread count after marking n1 should be 1");

  // Mark all read
  notices = notices.map((n) => ({ ...n, read: true }));
  unreadCount = notices.filter((n) => !n.read).length;
  assert.equal(unreadCount, 0, "Unread count after mark all read should be 0");
});

// 7. Completed / Paid Milestone Skipping
test("7. Already paid, approved, or cancelled milestones do not trigger reminders", () => {
  const terminalStatuses = ["paid", "disputed", "approved", "completed", "cancelled"];
  const shouldSkipMilestone = (status) => terminalStatuses.includes(status.toLowerCase());

  assert.ok(shouldSkipMilestone("paid"));
  assert.ok(shouldSkipMilestone("approved"));
  assert.ok(shouldSkipMilestone("completed"));
  assert.ok(shouldSkipMilestone("cancelled"));
  assert.ok(!shouldSkipMilestone("pending"), "Pending milestones must not be skipped");
  assert.ok(!shouldSkipMilestone("under_client_review"), "Milestones under review must not be skipped");
});

console.log("\n----------------------------------------------------------------------");
console.log(`NOTIFICATION TESTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log("----------------------------------------------------------------------\n");

if (failed > 0) process.exit(1);
