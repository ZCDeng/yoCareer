// yoCareer v2 — hand-rolled migrations runner.
//
// Why hand-rolled (not knex / drizzle / kysely):
//   - Single SQLite writer (the daemon); no team-of-services migration story.
//   - Schema files are flat numbered .sql in db/schema/.
//   - PRAGMA user_version is the version anchor; no separate migrations table.
//   - 0 runtime deps beyond better-sqlite3 (already required for the daemon).
//
// Rules:
//   - Files in db/schema/ named NNNN_*.sql, NNNN is 4-digit zero-padded version.
//   - On open: scan files, compare to PRAGMA user_version, apply pending in order.
//   - Apply each file inside a transaction; bump user_version on success.
//   - Refuse to open if PRAGMA user_version > max(files): downgrade is unsafe.
//   - Refuse to open if db_path lives under a known cloud-sync directory.
//
// This file is run at daemon startup AND from CLI (`npx yocareer db migrate`).
//
// Cloud-sync detection: simple absolute-path prefix match. False-positive risk
// (e.g. ~/Pictures/from-Dropbox is fine) is accepted in v1; user can override
// via the `YOCAREER_ALLOW_CLOUD_SYNC=1` env var.

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import Database from 'better-sqlite3';

const SCHEMA_FILE_RE = /^(\d{4})_.+\.sql$/;

// Known cloud-sync prefixes by platform. Resolved against absolute db path.
// Detection is intentionally conservative: only refuse when the db path
// starts with one of these directories.
const CLOUD_SYNC_PREFIXES = [
  // macOS
  '/Library/Mobile Documents/',           // iCloud Drive (Apple's path style)
  '/Library/CloudStorage/',               // unified macOS cloud storage root
  // Per-user
  '/Dropbox/',
  '/OneDrive/',
  '/Google Drive/',
  '/GoogleDrive/',
  '/坚果云/',
  '/Nutstore/',
  '/百度网盘/',
  '/BaiduNetdisk/',
];

export class CloudSyncRefusalError extends Error {
  constructor(dbPath, hit) {
    super(
      `yoCareer 拒绝在云同步目录中打开 SQLite (${dbPath} → 命中 ${hit})。\n` +
      `WAL + 云盘同步会触发 db corruption。请把 db 移到本地路径。\n` +
      `如确认非云盘（误判），可设 YOCAREER_ALLOW_CLOUD_SYNC=1 跳过。`
    );
    this.code = 'YOCAREER_CLOUD_SYNC_REFUSED';
    this.dbPath = dbPath;
    this.hitPrefix = hit;
  }
}

export class DowngradeRefusalError extends Error {
  constructor(dbVersion, fileMax) {
    super(
      `yoCareer 拒绝降级 schema：db user_version=${dbVersion} > 文件最大=${fileMax}。\n` +
      `这通常意味着你切到了旧分支但 db 是新版的。请用 git checkout v2.x.y 回到匹配版本。`
    );
    this.code = 'YOCAREER_SCHEMA_DOWNGRADE_REFUSED';
    this.dbVersion = dbVersion;
    this.fileMax = fileMax;
  }
}

/**
 * Detect whether dbPath lives in a known cloud-sync directory.
 * Returns the matched prefix (truthy) or null.
 */
export function detectCloudSync(dbPath) {
  if (process.env.YOCAREER_ALLOW_CLOUD_SYNC === '1') return null;
  const abs = resolve(dbPath);
  const home = homedir();
  for (const suffix of CLOUD_SYNC_PREFIXES) {
    // Match either ~<suffix> (per-user) or absolute /<suffix> (system-wide).
    if (abs.includes(suffix)) return suffix;
    if (abs.startsWith(home + suffix)) return home + suffix;
  }
  return null;
}

/**
 * Discover schema files. Returns sorted [{ version, name, path }].
 */
export function discoverSchemaFiles(schemaDir) {
  return readdirSync(schemaDir)
    .filter(f => SCHEMA_FILE_RE.test(f))
    .map(f => {
      const [, v] = f.match(SCHEMA_FILE_RE);
      return { version: parseInt(v, 10), name: f, path: join(schemaDir, f) };
    })
    .sort((a, b) => a.version - b.version);
}

/**
 * Apply pending migrations against an already-opened db.
 * Returns { from, to, applied: [versions] }.
 */
export function applyMigrations(db, files) {
  const before = db.pragma('user_version', { simple: true });
  const fileMax = files.length ? files[files.length - 1].version : 0;

  if (before > fileMax) {
    throw new DowngradeRefusalError(before, fileMax);
  }

  const applied = [];
  for (const file of files) {
    if (file.version <= before) continue;
    const sql = readFileSync(file.path, 'utf-8');
    const tx = db.transaction(() => {
      db.exec(sql);
      // PRAGMA does not allow parameter binding; the version is a 4-digit
      // integer from the filename, so string interpolation is safe here.
      db.exec(`PRAGMA user_version = ${file.version};`);
    });
    tx();
    applied.push(file.version);
  }

  return {
    from: before,
    to: db.pragma('user_version', { simple: true }),
    applied,
  };
}

/**
 * High-level: open db at dbPath (creating if needed), refuse cloud-sync,
 * apply pending migrations, return the open Database handle + summary.
 *
 * Caller is responsible for closing the returned handle.
 */
export function openAndMigrate(dbPath, schemaDir) {
  const hit = detectCloudSync(dbPath);
  if (hit) throw new CloudSyncRefusalError(dbPath, hit);

  const db = new Database(dbPath);
  try {
    // The SQL file's PRAGMAs only apply to that connection; re-apply here.
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = NORMAL');
    db.pragma('temp_store = MEMORY');
    db.pragma('mmap_size = 134217728');
    db.pragma('cache_size = -65536');

    const files = discoverSchemaFiles(schemaDir);
    const summary = applyMigrations(db, files);
    return { db, summary };
  } catch (err) {
    db.close();
    throw err;
  }
}

// ----- CLI entry point: `node db/migrations.mjs <db-path> [schema-dir]` -----
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const dbPath = process.argv[2] || join(process.cwd(), 'data', 'yocareer.db');
  const schemaDir =
    process.argv[3] || join(process.cwd(), 'db', 'schema');
  try {
    const { db, summary } = openAndMigrate(dbPath, schemaDir);
    db.close();
    console.log(JSON.stringify({
      ok: true,
      db_path: resolve(dbPath),
      schema_dir: resolve(schemaDir),
      ...summary,
    }, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(JSON.stringify({
      ok: false,
      error: err.code || 'UNKNOWN',
      message: err.message,
      db_path: resolve(dbPath),
    }, null, 2));
    process.exit(1);
  }
}
