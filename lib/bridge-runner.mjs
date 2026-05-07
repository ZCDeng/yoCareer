/**
 * bridge-runner.mjs — Shared bridge command utilities.
 *
 * Used by: bridge-smoke.mjs, scan.mjs, provider-health.mjs
 */

import { existsSync } from 'fs';

/**
 * Parse a boolean environment variable value, with explicit fallback.
 */
export function parseBool(value, fallback) {
  if (value == null || String(value).trim() === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

/**
 * Tokenize a shell command string into [bin, ...args], handling
 * quoting and escaping.
 */
export function tokenizeCommand(command) {
  const tokens = [];
  let current = '';
  let quote = '';
  let escaped = false;
  for (const ch of String(command || '')) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = '';
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (quote) throw new Error(`unclosed quote in command: ${command}`);
  if (escaped) { current += '\\'; }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * Resolve a bridge command invocation into { bin, argv }.
 * If the command is an .mjs script, run it via `node`.
 */
export function bridgeInvocation(command, args) {
  const tokens = tokenizeCommand(command);
  if (tokens.length === 0) throw new Error('bridge command is empty');
  const [cmd, ...baseArgs] = tokens;
  if (cmd.endsWith('.mjs')) {
    return { bin: process.execPath, argv: [cmd, ...baseArgs, ...args] };
  }
  return { bin: cmd, argv: [...baseArgs, ...args] };
}

/**
 * Resolve a bridge command from an explicit env-var override or a
 * default script path (if it exists on disk).
 */
export function resolveBridgeCommand(explicitCommand, defaultScriptPath) {
  const command = String(explicitCommand || '').trim();
  if (command) return command;
  return existsSync(defaultScriptPath) ? defaultScriptPath : '';
}
