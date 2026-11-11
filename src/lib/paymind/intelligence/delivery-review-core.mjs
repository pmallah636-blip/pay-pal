const TEXT_EXTENSIONS = new Set([
  ".html", ".htm", ".css", ".js", ".jsx", ".ts", ".tsx", ".json", ".md", ".txt", ".csv", ".xml", ".yml", ".yaml", ".sql", ".py", ".java", ".go", ".rs", ".php", ".sh", ".toml", ".ini", ".env.example"
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "coverage", "vendor", ".venv", "venv", "__pycache__", ".turbo", ".cache", ".aws", ".ssh", "secrets", "credentials"
]);
const SENSITIVE_NAMES = new Set([
  ".env", ".env.local", ".env.production", ".npmrc", ".pypirc", "id_rsa", "id_ed25519", "credentials.json", "service-account.json"
]);

export const DELIVERY_LIMITS = Object.freeze({
  uploadBytes: 8 * 1024 * 1024,
  archiveEntries: 500,
  archiveUncompressedBytes: 35 * 1024 * 1024,
  inspectedFiles: 60,
  inspectedBytes: 700 * 1024,
  perFileBytes: 100 * 1024,
  modelCharacters: 80_000,
});

export function normalizeArchivePath(name) {
  if (typeof name !== "string" || !name || name.includes("\0")) return { safe: false, reason: "Empty or invalid archive path." };
  const normalizedSlashes = name.replace(/\\/g, "/");
  if (normalizedSlashes.startsWith("/") || /^[a-zA-Z]:/.test(normalizedSlashes)) {
    return { safe: false, reason: "Absolute paths are not permitted in uploaded archives." };
  }
  const segments = normalizedSlashes.split("/").filter(Boolean);
  if (segments.some((segment) => segment === ".." || segment === ".")) {
    return { safe: false, reason: "Path traversal sequences are not permitted in uploaded archives." };
  }
  return { safe: true, path: segments.join("/") };
}

export function shouldInspectTextPath(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some((segment) => SKIP_DIRS.has(segment.toLowerCase()))) return false;
  const baseName = (segments.at(-1) || "").toLowerCase();
  if (
    SENSITIVE_NAMES.has(baseName) ||
    (baseName.startsWith(".env.") && baseName !== ".env.example") ||
    /^(?:secret|secrets|credential|credentials|service[-_]?account)(?:[._-]|$)/i.test(baseName) ||
    /^(?:id_rsa|id_ed25519|id_ecdsa)(?:\.|$)/i.test(baseName)
  ) return false;
  if (baseName.endsWith(".map") || baseName.endsWith(".min.js") || baseName.endsWith(".lock")) return false;
  const dot = baseName.lastIndexOf(".");
  const ext = dot >= 0 ? baseName.slice(dot) : "";
  return TEXT_EXTENSIONS.has(ext) || baseName === ".env.example";
}

export function planArchiveInspection(entries, limits = DELIVERY_LIMITS) {
  if (!Array.isArray(entries)) return { ok: false, error: "Archive entries could not be read." };
  if (entries.length > limits.archiveEntries) {
    return { ok: false, error: `Archive contains ${entries.length} entries; the limit is ${limits.archiveEntries}.` };
  }

  let totalUncompressed = 0;
  const candidates = [];
  const skippedPaths = [];
  const seenPaths = new Set();

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const checked = normalizeArchivePath(entry.entryName);
    if (!checked.safe) return { ok: false, error: `${checked.reason} (${String(entry.entryName).slice(0, 120)})` };
    if (seenPaths.has(checked.path)) return { ok: false, error: `Archive contains a duplicate normalized path: ${checked.path}.` };
    seenPaths.add(checked.path);
    const size = Number(entry.size || 0);
    const compressedSize = Number(entry.compressedSize || 0);
    if (!Number.isFinite(size) || size < 0) return { ok: false, error: "Archive contains an invalid file size." };
    totalUncompressed += size;
    if (totalUncompressed > limits.archiveUncompressedBytes) {
      return { ok: false, error: "Archive expands beyond the 35 MB inspection limit." };
    }
    if (size > 0 && compressedSize === 0) return { ok: false, error: "Archive contains an invalid compressed entry." };
    if (compressedSize > 0 && size / compressedSize > 250) {
      return { ok: false, error: `Archive entry has an unsafe compression ratio: ${checked.path}.` };
    }
    if (!shouldInspectTextPath(checked.path) || size > limits.perFileBytes || candidates.length >= limits.inspectedFiles) {
      skippedPaths.push(checked.path);
      continue;
    }
    candidates.push({ path: checked.path, size, compressedSize });
  }

  return { ok: true, candidates, skippedPaths, totalUncompressedBytes: totalUncompressed };
}


export function redactSensitiveText(text) {
  return String(text || "")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, "[REDACTED PRIVATE KEY]")
    .replace(/((?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*)(["'`]?)([^"'`\s,;]{8,})\2/gi, "$1[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g, "[REDACTED PAYMENT KEY]")
    .replace(/\bAIza[0-9A-Za-z_-]{25,}\b/g, "[REDACTED GOOGLE API KEY]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED AWS ACCESS KEY]")
    .replace(/\b(?:ghp|github_pat|glpat|npm)_?[A-Za-z0-9_=-]{10,}\b/g, "[REDACTED SOURCE TOKEN]")
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "[REDACTED SLACK TOKEN]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED JWT]");
}

export function truncateText(text, maxChars = 12_000) {
  const value = String(text || "").replace(/\u0000/g, "").trim();
  return value.length > maxChars ? `${value.slice(0, maxChars)}\n[TRUNCATED FOR REVIEW]` : value;
}

export function validateEvidence(findings, inspectedFiles) {
  const files = new Map(inspectedFiles.map((file) => [file.path, file.content]));
  return (Array.isArray(findings) ? findings : []).map((finding) => {
    const evidence = (Array.isArray(finding.evidence) ? finding.evidence : []).filter((item) => {
      const content = files.get(item.filePath);
      const quote = String(item.quote || "").trim();
      return typeof content === "string" && quote.length >= 8 && content.includes(quote);
    });
    const hadEvidence = Array.isArray(finding.evidence) && finding.evidence.length > 0;
    const invalidEvidence = hadEvidence && evidence.length === 0;
    const unsupportedPositive = finding.status === "evidence_found" && evidence.length === 0;
    const status = invalidEvidence || unsupportedPositive ? "needs_human_review" : finding.status;
    return {
      ...finding,
      status,
      evidence,
      explanation: invalidEvidence
        ? "The AI returned a quotation that could not be matched to the uploaded files. Treat this result as unverified and review the submission manually."
        : unsupportedPositive
          ? "The AI did not provide a verifiable quotation for this positive finding. Human review is required."
          : finding.explanation,
    };
  });
}

export function deterministicDeliveryHints(requirements, files) {
  return requirements.map((requirement) => {
    const normalized = requirement.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const tokens = normalized.split(/\s+/).filter((token) => token.length > 3);
    let best = null;
    for (const file of files) {
      const haystack = `${file.path} ${file.content}`.toLowerCase();
      const matched = tokens.filter((token) => haystack.includes(token));
      const ratio = tokens.length ? matched.length / tokens.length : 0;
      if (!best || ratio > best.ratio) best = { filePath: file.path, ratio, matched };
    }
    const evidenceFile = best ? files.find((file) => file.path === best.filePath) : null;
    const exactRequirementPresent = files.some((file) => file.content.toLowerCase().includes(normalized));
    const status = exactRequirementPresent ? "evidence_found" : best && best.ratio >= 0.3 ? "needs_human_review" : "not_found_in_uploaded_files";
    const evidenceToken = evidenceFile && best?.matched.length
      ? best.matched.find((token) => evidenceFile.content.toLowerCase().includes(token))
      : null;
    const evidenceIndex = evidenceToken && evidenceFile ? evidenceFile.content.toLowerCase().indexOf(evidenceToken) : -1;
    const evidenceQuote = evidenceIndex >= 0 && evidenceFile
      ? evidenceFile.content.slice(Math.max(0, evidenceIndex - 24), Math.min(evidenceFile.content.length, evidenceIndex + evidenceToken.length + 48)).trim()
      : "";
    return {
      requirement,
      status,
      explanation: status === "evidence_found"
        ? "Related terms were found in the inspected text. This does not prove the feature works."
        : status === "needs_human_review"
          ? "Some related terms were found, but the evidence is incomplete. Review the files manually."
          : "The inspected text did not contain enough matching terms. The item may still exist in an uninspected or binary file.",
      evidence: evidenceQuote.length >= 8 && best ? [{ filePath: best.filePath, quote: evidenceQuote }] : [],
      suggestedNextStep: "Review the submitted work and verify the requirement with the client before accepting it.",
    };
  });
}
