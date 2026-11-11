export const DELIVERY_LIMITS: Readonly<{
  uploadBytes: number;
  archiveEntries: number;
  archiveUncompressedBytes: number;
  inspectedFiles: number;
  inspectedBytes: number;
  perFileBytes: number;
  modelCharacters: number;
}>;

export function normalizeArchivePath(name: string): { safe: true; path: string } | { safe: false; reason: string };
export function shouldInspectTextPath(filePath: string): boolean;
export function planArchiveInspection(entries: Array<{ entryName: string; isDirectory?: boolean; size: number; compressedSize: number }>, limits?: typeof DELIVERY_LIMITS):
  | { ok: true; candidates: Array<{ path: string; size: number; compressedSize: number }>; skippedPaths: string[]; totalUncompressedBytes: number }
  | { ok: false; error: string };
export function redactSensitiveText(text: string): string;
export function truncateText(text: string, maxChars?: number): string;
export function validateEvidence<T extends { status: string; evidence?: Array<{ filePath: string; quote: string }>; explanation: string }>(findings: T[], inspectedFiles: Array<{ path: string; content: string }>): T[];
export function deterministicDeliveryHints(requirements: string[], files: Array<{ path: string; content: string }>): Array<{
  requirement: string;
  status: "evidence_found" | "not_found_in_uploaded_files" | "needs_human_review";
  explanation: string;
  evidence: Array<{ filePath: string; quote: string }>;
  suggestedNextStep: string;
}>;
