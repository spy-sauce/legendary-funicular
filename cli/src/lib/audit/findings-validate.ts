// Mycelium Framework — VibeSpace LLC — The network provides.
//
// Runtime validation for Finding objects — severity union, id length, ISO-8601 ts.
//
// This module provides the validateFinding runtime guard per NUTRIENTS.md §1.
// It is a pure function with no I/O — throws AuditValidationError on malformed data.
//
// Contract rules (per HYPHA-AUDIT-FINDINGS-AGENT.md):
//   - severity must be one of "critical" | "major" | "minor"
//   - id must be exactly 64 lowercase hex characters (SHA-256)
//   - observed_at must be parseable as ISO-8601
//   - tester_id must start with "tester."
//   - repro_steps must be an array of strings
//   - Pure function; no I/O

import type { Finding, Severity } from "./findings.js";

/**
 * Valid severity values per NUTRIENTS.md §1.
 *
 *   critical → blocks contract-freeze on re-plant
 *   major    → blocks harvest threshold
 *   minor    → informational; included in brief but non-blocking
 */
const VALID_SEVERITIES: readonly Severity[] = ["critical", "major", "minor"];

/**
 * SHA-256 hex pattern: exactly 64 lowercase hex characters.
 */
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

/**
 * ISO-8601 timestamp pattern (simplified; Date.parse is the real validator).
 * Accepts formats like:
 *   - 2026-05-11T17:47:00.000Z
 *   - 2026-05-11T17:47:00Z
 *   - 2026-05-11T17:47:00+00:00
 */
const ISO_8601_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Error thrown when a Finding fails validation.
 *
 * Includes the offending field path so callers can provide actionable
 * error messages to operators.
 */
export class AuditValidationError extends Error {
  /**
   * The field path that failed validation (e.g., "severity", "id", "repro_steps[2]").
   */
  readonly fieldPath: string;

  /**
   * The actual value that was found (may be undefined if missing).
   */
  readonly actualValue: unknown;

  constructor(fieldPath: string, message: string, actualValue?: unknown) {
    super(`Finding validation failed at '${fieldPath}': ${message}`);
    this.name = "AuditValidationError";
    this.fieldPath = fieldPath;
    this.actualValue = actualValue;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, AuditValidationError.prototype);
  }
}

/**
 * Type guard helper — check if a value is a non-null object.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Type guard helper — check if a value is a string.
 */
function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Type guard helper — check if a value is a number.
 */
function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

/**
 * Type guard helper — check if a value is an array of strings.
 */
function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/**
 * Type guard helper — check if a value is a valid line range tuple.
 */
function isLineRange(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isInteger(value[0]) &&
    Number.isInteger(value[1]) &&
    value[0] >= 0 &&
    value[1] >= value[0]
  );
}

/**
 * Validate that a severity value is in the allowed union.
 */
function validateSeverity(value: unknown): asserts value is Severity {
  if (!isString(value)) {
    throw new AuditValidationError(
      "severity",
      `expected string, got ${typeof value}`,
      value
    );
  }

  if (!VALID_SEVERITIES.includes(value as Severity)) {
    throw new AuditValidationError(
      "severity",
      `must be one of: ${VALID_SEVERITIES.join(", ")}`,
      value
    );
  }
}

/**
 * Validate that an id is exactly 64 lowercase hex characters.
 */
function validateId(value: unknown): asserts value is string {
  if (!isString(value)) {
    throw new AuditValidationError(
      "id",
      `expected string, got ${typeof value}`,
      value
    );
  }

  if (value.length !== 64) {
    throw new AuditValidationError(
      "id",
      `length must be exactly 64 characters (SHA-256 hex), got ${value.length}`,
      value
    );
  }

  if (!SHA256_HEX_PATTERN.test(value)) {
    throw new AuditValidationError(
      "id",
      "must be lowercase hex characters only (0-9, a-f)",
      value
    );
  }
}

/**
 * Validate that observed_at is a parseable ISO-8601 timestamp.
 */
function validateObservedAt(value: unknown): asserts value is string {
  if (!isString(value)) {
    throw new AuditValidationError(
      "observed_at",
      `expected string, got ${typeof value}`,
      value
    );
  }

  // First check the basic format
  if (!ISO_8601_PATTERN.test(value)) {
    throw new AuditValidationError(
      "observed_at",
      "must be ISO-8601 format (e.g., 2026-05-11T17:47:00.000Z)",
      value
    );
  }

  // Then verify Date.parse can actually parse it
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new AuditValidationError(
      "observed_at",
      "not parseable as a valid date",
      value
    );
  }
}

/**
 * Validate that tester_id starts with "tester.".
 */
function validateTesterId(value: unknown): asserts value is string {
  if (!isString(value)) {
    throw new AuditValidationError(
      "tester_id",
      `expected string, got ${typeof value}`,
      value
    );
  }

  if (!value.startsWith("tester.")) {
    throw new AuditValidationError(
      "tester_id",
      'must start with "tester."',
      value
    );
  }
}

/**
 * Validate that repro_steps is an array of strings.
 */
function validateReproSteps(value: unknown): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new AuditValidationError(
      "repro_steps",
      `expected array, got ${typeof value}`,
      value
    );
  }

  for (let i = 0; i < value.length; i++) {
    if (!isString(value[i])) {
      throw new AuditValidationError(
        `repro_steps[${i}]`,
        `expected string, got ${typeof value[i]}`,
        value[i]
      );
    }
  }
}

/**
 * Runtime validation guard for Finding objects.
 *
 * Throws AuditValidationError with the offending field path if any
 * validation rule fails:
 *
 *   - `severity` not in the union ("critical" | "major" | "minor")
 *   - `id` length != 64 or not lowercase hex
 *   - `observed_at` not parseable as ISO-8601
 *   - `tester_id` does not start with "tester."
 *   - `repro_steps` is not an array of strings
 *
 * This is a pure function with no I/O.
 *
 * @param finding - The value to validate
 * @throws AuditValidationError if validation fails
 */
export function validateFinding(finding: unknown): asserts finding is Finding {
  // First check that we have an object
  if (!isObject(finding)) {
    throw new AuditValidationError(
      "(root)",
      `expected object, got ${finding === null ? "null" : typeof finding}`,
      finding
    );
  }

  // Required string fields (basic presence check)
  const requiredStringFields = ["id", "tester_id", "biome", "summary", "detail", "suggested_fix", "observed_at"];
  for (const field of requiredStringFields) {
    if (!(field in finding)) {
      throw new AuditValidationError(field, "required field is missing", undefined);
    }
  }

  // Validate specific fields with custom rules
  validateId(finding.id);
  validateTesterId(finding.tester_id);
  validateSeverity(finding.severity);
  validateObservedAt(finding.observed_at);
  validateReproSteps(finding.repro_steps);

  // Validate biome is a non-empty string
  if (!isString(finding.biome) || finding.biome.length === 0) {
    throw new AuditValidationError(
      "biome",
      "must be a non-empty string",
      finding.biome
    );
  }

  // Validate summary is a non-empty string
  if (!isString(finding.summary) || finding.summary.length === 0) {
    throw new AuditValidationError(
      "summary",
      "must be a non-empty string",
      finding.summary
    );
  }

  // Validate detail is a string
  if (!isString(finding.detail)) {
    throw new AuditValidationError(
      "detail",
      `expected string, got ${typeof finding.detail}`,
      finding.detail
    );
  }

  // Validate suggested_fix is a string
  if (!isString(finding.suggested_fix)) {
    throw new AuditValidationError(
      "suggested_fix",
      `expected string, got ${typeof finding.suggested_fix}`,
      finding.suggested_fix
    );
  }

  // Validate iteration is a non-negative integer
  if (!("iteration" in finding)) {
    throw new AuditValidationError("iteration", "required field is missing", undefined);
  }
  if (!isNumber(finding.iteration) || !Number.isInteger(finding.iteration) || finding.iteration < 0) {
    throw new AuditValidationError(
      "iteration",
      "must be a non-negative integer",
      finding.iteration
    );
  }

  // Validate optional fields if present
  if ("file_path" in finding && finding.file_path !== undefined) {
    if (!isString(finding.file_path)) {
      throw new AuditValidationError(
        "file_path",
        `expected string or undefined, got ${typeof finding.file_path}`,
        finding.file_path
      );
    }
  }

  if ("line_range" in finding && finding.line_range !== undefined) {
    if (!isLineRange(finding.line_range)) {
      throw new AuditValidationError(
        "line_range",
        "must be a tuple of two non-negative integers [start, end] where start <= end",
        finding.line_range
      );
    }
  }
}

/**
 * Check if a value is a valid Finding without throwing.
 *
 * Returns true if the value passes all validation rules, false otherwise.
 * This is useful for filtering or conditional logic where exceptions are
 * not desired.
 *
 * @param finding - The value to check
 * @returns true if valid Finding, false otherwise
 */
export function isFinding(finding: unknown): finding is Finding {
  try {
    validateFinding(finding);
    return true;
  } catch {
    return false;
  }
}
