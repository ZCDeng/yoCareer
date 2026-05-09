/**
 * v1-detect.mjs — Detect legacy v1 installations and warn about upgrade path.
 *
 * yoCareer v2 uses SQLite + daemon architecture. v1 was filesystem-only.
 * This module provides a non-blocking check that runs during init.
 */

import { existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

/**
 * Returns true if this looks like a v1 installation (has legacy files
 * but no SQLite database).
 */
export function isV1Installation(root = ROOT) {
  const hasLegacyTracker = existsSync(join(root, 'data', 'applications.md'));
  const hasLegacyPipeline = existsSync(join(root, 'data', 'pipeline.md'));
  const hasDb = existsSync(join(root, 'data', 'yocareer.db'));
  const hasDaemon = existsSync(join(root, 'daemon'));

  // v1: has tracker files, no db, no daemon directory
  return (hasLegacyTracker || hasLegacyPipeline) && !hasDb && !hasDaemon;
}

/**
 * Print upgrade warning to stderr. Non-blocking, does not exit.
 */
export function warnIfV1(root = ROOT) {
  if (!isV1Installation(root)) return;

  console.error(`
╔══════════════════════════════════════════════════════════════════╗
║  yoCareer v1 detected — upgrade required                         ║
╠══════════════════════════════════════════════════════════════════╣
║  Your data (cv.md, profile, tracker, reports) is safe.           ║
║  But v1 filesystem-only mode is no longer supported.             ║
║                                                                  ║
║  Upgrade steps:                                                  ║
║    1. Back up:  cp -r data data-backup-$(date +%Y%m%d)           ║
║    2. Migrate:  node lib/v1-migrate.mjs  (coming in v2.1)        ║
║    3. Start:    npx yocareer daemon start                        ║
║                                                                  ║
║  Or start fresh: remove data/yocareer.db and let daemon init it. ║
╚══════════════════════════════════════════════════════════════════╝
`);
}
