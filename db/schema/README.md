# db/schema/

SQL files for yoCareer's SQLite schema. The daemon and CLI run these via
`db/migrations.mjs` on startup. **`PRAGMA user_version` is the version anchor**
— there is no separate `migrations` tracking table.

## File naming

```
NNNN_<short_description>.sql
```

- `NNNN` is a 4-digit zero-padded version (`0001`, `0002`, ...). Strictly
  monotonic. The runner sorts by this number.
- `<short_description>` is a human-readable slug. It does not affect ordering.
- Multiple statements per file are fine; they run inside one transaction.

## Authoring rules

1. **Idempotency**. Use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT
   EXISTS`. The runner refuses to re-apply a file (`user_version` gates that),
   but idempotency lets us re-run a partial dev environment safely.
2. **Forward-only**. Once a file is committed to `main`, never edit it. Write
   a new `NNNN+1` file that alters / drops / adds. Editing a shipped file
   silently diverges everyone's schema.
3. **No state validation in SQL**. We do **not** use `CHECK (status IN
   ('captured', 'enriched', ...))` on `current_status` columns. The canonical
   state set lives in `templates/states.{signals,applications,evaluations,task-runs}.yml`
   and is enforced by `daemon/lib/state-machines.mjs`. SQL `CHECK` would force
   a schema migration every time we edit yaml — defeats the purpose.
4. **No defaults that shift over time**. `DEFAULT (strftime(...))` is fine
   because it captures *insert time*. But avoid defaults that depend on
   computed values (e.g. counters, sequence-style keys) — use UUIDs from
   the daemon instead.
5. **JSON columns** (`event_log`, `*_json`). Always `NOT NULL DEFAULT '{}'`
   for objects, `'[]'` for arrays, never `NULL`. Daemon parses with
   `JSON.parse(); on error → corrupt-row warning`.
6. **Foreign keys** must use `ON DELETE CASCADE` or `ON DELETE SET NULL`
   explicitly. Default ON DELETE NO ACTION combined with `PRAGMA foreign_keys = ON`
   produces hard failures during daemon ops.

## What lives outside schema files

- **capabilities** — sourced from `templates/capabilities.yml` at daemon
  startup, kept in memory. Not a SQLite table. (Origin R21.)
- **state machines** — same: yaml is source of truth.
- **reports** — projections joined from `evaluations` + `applications` +
  `signals` at read time. Not a separate table. (Origin R4.)
- **migrations history beyond `user_version`** — not tracked. If you need
  audit logs, query `event_log` per row.

## Running migrations manually

```sh
node db/migrations.mjs <db-path> [schema-dir]
# defaults to data/yocareer.db and db/schema/
```

The runner prints a JSON line to stdout on success and exits 0. On failure
(downgrade refusal, cloud-sync refusal, SQL error) it prints to stderr and
exits 1. The daemon embeds this as a library call (`openAndMigrate`).

## Adding a new migration

1. Pick the next number (`ls db/schema | grep -oE '^[0-9]{4}' | tail -1` + 1).
2. Write the SQL with idempotent guards.
3. Add a corresponding case in `tests/sqlite-schema-selftest.mjs`.
4. Run the selftest locally; it must pass on a fresh db AND on a db that's
   already at the previous version.
