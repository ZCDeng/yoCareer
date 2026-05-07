/**
 * sanitize.mjs — Shared text sanitization utilities.
 *
 * Used by: scan.mjs
 */

/**
 * Sanitize a single field value for tabular (TSV / pipe-separated) output.
 *
 * - Strips pipe, tab, carriage-return, and newline characters
 * - Collapses whitespace
 * - Trims and truncates
 */
export function sanitizeField(value, { maxLen = 240 } = {}) {
  return String(value || '')
    .replace(/[|\t\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Convenience: pipe-safe field with max length 240 (for markdown table rows).
 */
export function sanitizeLineField(value, maxLen = 240) {
  return sanitizeField(value, { maxLen });
}

/**
 * Convenience: TSV-safe field with max length 800.
 */
export function sanitizeTsvField(value, maxLen = 800) {
  return sanitizeField(value, { maxLen });
}
