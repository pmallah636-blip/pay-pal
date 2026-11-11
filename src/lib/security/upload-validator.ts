import path from "path";
import AdmZip from "adm-zip";
import { calculateSHA256 } from "./crypto-utils";

export interface FileValidationOptions {
  maxSizeBytes?: number; // default 25MB
  allowedExtensions?: string[];
  disallowExecutables?: boolean;
}

export interface FileValidationResult {
  valid: boolean;
  errors: string[];
  sha256?: string;
  fileSizeBytes: number;
  archiveDetails?: {
    entryCount: number;
    filePaths: string[];
  };
}

const DEFAULT_MAX_SIZE = 25 * 1024 * 1024; // 25 MB
const DEFAULT_ALLOWED_EXTENSIONS = [".zip", ".tar", ".gz", ".pdf", ".html", ".json", ".txt", ".png", ".jpg"];
const DANGEROUS_EXTENSIONS = [".exe", ".bat", ".cmd", ".ps1", ".vbs", ".dll", ".so", ".dylib", ".sh", ".com", ".scr"];

/**
 * Validates uploaded files and inspects zip archives for Zip Slip / path traversal vulnerabilities.
 */
export function validateDeliverableUpload(
  buffer: Buffer,
  fileName: string,
  options: FileValidationOptions = {}
): FileValidationResult {
  const errors: string[] = [];
  const maxSizeBytes = options.maxSizeBytes || DEFAULT_MAX_SIZE;
  const allowedExtensions = options.allowedExtensions || DEFAULT_ALLOWED_EXTENSIONS;
  const disallowExecutables = options.disallowExecutables !== false;

  const fileSizeBytes = buffer.length;

  // 1. File size check
  if (fileSizeBytes > maxSizeBytes) {
    errors.push(
      `FILE_TOO_LARGE: File size (${(fileSizeBytes / 1024 / 1024).toFixed(2)} MB) exceeds maximum allowed size of ${(maxSizeBytes / 1024 / 1024).toFixed(2)} MB.`
    );
  }

  if (fileSizeBytes === 0) {
    errors.push("EMPTY_FILE: Uploaded file contains zero bytes.");
  }

  // 2. Extension check
  const ext = path.extname(fileName).toLowerCase();
  if (allowedExtensions.length > 0 && !allowedExtensions.includes(ext)) {
    errors.push(
      `UNSUPPORTED_EXTENSION: File extension "${ext}" is not permitted. Allowed: ${allowedExtensions.join(", ")}`
    );
  }

  // 3. Compute immutable SHA-256 hash of actual file contents
  const sha256 = calculateSHA256(buffer);

  // 4. Archive deep inspection for Zip files (Path Traversal / Zip Slip / Dangerous executables)
  let archiveDetails: { entryCount: number; filePaths: string[] } | undefined;

  if (ext === ".zip") {
    try {
      const zip = new AdmZip(buffer);
      const zipEntries = zip.getEntries();
      const extractedPaths: string[] = [];

      archiveDetails = {
        entryCount: zipEntries.length,
        filePaths: [],
      };

      for (const entry of zipEntries) {
        const entryName = entry.entryName;

        // Path Traversal Check (Zip Slip)
        // Normalize the path and ensure it does not escape root or contain ../
                if (
          entryName.includes("..") ||
          path.isAbsolute(entryName) ||
          entryName.startsWith("/") ||
          entryName.startsWith("\\") ||
          entryName.includes("\0")
        ) {
          errors.push(
            `PATH_TRAVERSAL_DETECTED: Malicious entry name "${entryName}" contains path traversal sequence.`
          );
          break;
        }

        // Dangerous executable file check
        if (disallowExecutables && !entry.isDirectory) {
          const entryExt = path.extname(entryName).toLowerCase();
          if (DANGEROUS_EXTENSIONS.includes(entryExt)) {
            errors.push(
              `DANGEROUS_FILE_DETECTED: Archive contains prohibited executable file "${entryName}".`
            );
          }
        }

        extractedPaths.push(entryName);
      }

      archiveDetails.filePaths = extractedPaths;
    } catch (zipErr: unknown) {
      const msg = zipErr instanceof Error ? zipErr.message : String(zipErr);
      errors.push(`INVALID_ZIP_ARCHIVE: Corrupt or unreadable zip format (${msg}).`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sha256,
    fileSizeBytes,
    archiveDetails,
  };
}
